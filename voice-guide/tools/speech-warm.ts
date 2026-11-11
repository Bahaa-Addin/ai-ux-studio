/**
 * npm run speech:warm -- [--site vodafone-eg] [--lang ar,en] [--limit 300] [--dry-run]
 *
 * Before an audience (ADR-0047 §2, §7): wakes VoiceTut and fills the speech cache with what the
 * guide is going to say, in each language, so replies start at once:
 * - the guide's fixed phrases (services/router/phrases.ts and the spoken SDK lines);
 * - "Taking you to {page}", "The closest is {page}" and "This is {page}" for every page of the active
 *   knowledge base;
 * - the plans the router makes for its Vodafone tuning sets (tests/fixtures/vodafone-utterances*.yaml):
 *   their own words, not the values the page reads aloud (those cannot be known ahead).
 * Everything is made one sentence at a time, as the guide's own requests are. Needs VG_VOICETUT_URL
 * (the owner's Modal endpoint); --dry-run only counts the lines.
 */
import fs from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'

import YAML from 'yaml'

import { knownLines, type Manifest } from '#kb'
import type { EvalCase } from '#services/router/eval.ts'
import { type PhraseKey, say, template } from '#services/router/phrases.ts'
import { buildPlan } from '#services/router/planner.ts'
import { understand } from '#services/router/understand.ts'
import { loadPlatformConfig, loadSiteConfig, ROOT } from '#shared/config.ts'
import { buildKbIndex } from '#shared/kb-index.ts'
import type { SessionState } from '#shared/store/index.ts'
import { Tracer } from '#shared/trace.ts'

import { t } from '../packages/sdk/src/i18n.ts'
import { splitSentences } from '../packages/sdk/src/voice/sentences.ts'
import { createSpeechOut } from '../services/speech-out/handlers.ts'

const { values } = parseArgs({
	options: {
		site: { type: 'string', default: 'vodafone-eg' },
		lang: { type: 'string', default: 'ar,en' },
		limit: { type: 'string', default: '400' },
		'dry-run': { type: 'boolean', default: false },
	},
})

const platform = loadPlatformConfig()
const site = loadSiteConfig(path.join(platform.sitesDir, `${values.site}.yaml`))
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, `config/kb/${site.id}.manifest.json`), 'utf8')) as Manifest
const kb = buildKbIndex(manifest)
const langs = values.lang!.split(',').filter((l) => site.languages.includes(l))
const limit = Number(values.limit)

/** Router phrases with nothing to fill in. */
const FIXED: PhraseKey[] = ['here', 'unknownPage', 'notFound', 'agent', 'watchWhich', 'whichItem', 'commit', 'stopped', 'nothingToRepeat', 'help']
/** Lines the SDK itself speaks (packages/sdk/src/i18n.ts). */
const SDK_SPOKEN = ['planStopped', 'error', 'agentUnavailable', 'watchFailed'] as const

async function tuningLines(lang: string): Promise<string[]> {
	const lines: string[] = []
	for (const file of ['tests/fixtures/vodafone-utterances.yaml', 'tests/fixtures/vodafone-utterances-heldout.yaml']) {
		const full = path.join(ROOT, file)
		if (!fs.existsSync(full)) continue
		for (const c of YAML.parse(fs.readFileSync(full, 'utf8')) as EvalCase[]) {
			if ((c.lang || manifest.site.defaultLanguage) !== lang) continue
			const pageId = c.page || 'web.home'
			const session: SessionState = { id: 'warm', siteId: site.id, lang, createdAt: '', updatedAt: '', turns: [], last: c.last, usage: { agentSteps: 0, agentTokens: 0 } }
			const u = await understand({ utterance: c.say, uiLang: lang, pageId, session, kb, settings: { ...site.router, agentEnabled: false } })
			const { plan } = buildPlan({ u, utterance: c.say, session, kb, page: { url: '' }, turnId: 'warm', agent: { enabled: false, maxSteps: 0 } })
			lines.push(...knownLines(plan))
		}
	}
	return lines
}

function linesFor(lang: string, tuning: string[]): string[] {
	const fixed = FIXED.map((k) => template(k, lang)).filter((l) => l && !l.includes('{'))
	const sdk = SDK_SPOKEN.map((k) => t(k, lang))
	const pages = [...kb.pages.values()].flatMap((p) => {
		const title = p.variants[lang]?.title
		return title ? [say('taking', lang, { page: title }), say('closest', lang, { page: title }), say('pageTitleOnly', lang, { title })] : []
	})
	// Most likely first: the tuning set's plans, then the fixed phrases, then every page.
	return [...new Set([...tuning, ...fixed, ...sdk, ...pages])].slice(0, limit)
}

const t0 = performance.now()
const plan: Record<string, string[]> = {}
for (const lang of langs) plan[lang] = linesFor(lang, await tuningLines(lang))
const sentences = Object.values(plan).flat().flatMap((l) => splitSentences(l)).length
console.log(`${site.id}: ${Object.entries(plan).map(([l, x]) => `${x.length} lines in ${l}`).join(', ')}, ${sentences} sentences.`)
if (values['dry-run']) process.exit(0)
if (site.speech.out.engine !== 'voicetut') throw new Error(`${site.id} does not use VoiceTut (speech.out.engine is ${site.speech.out.engine})`)
if (!platform.voicetut.url) throw new Error('VG_VOICETUT_URL is not set: point it at the VoiceTut endpoint (the owner\'s Modal app; runbook)')

const events: { name: string; attrs: Record<string, unknown> }[] = []
const tracer = { event: async (_c: unknown, name: string, attrs: Record<string, unknown> = {}) => void events.push({ name, attrs }) } as unknown as Tracer
const speech = createSpeechOut({ platform, sites: new Map([[site.id, site]]), tracer })
const ctx = { trace: { traceId: '0'.repeat(32), spanId: '0'.repeat(16), siteId: site.id, sessionId: 'speech-warm' } } as Parameters<typeof speech.prepare>[1]
console.log('Waking VoiceTut (the first call after a scale-down can take minutes)…')
// Always ask VoiceTut itself: a new model version means new keys, so the cache is rebuilt for it.
const awake = await speech.refresh({}, ctx)
if (!awake.modelVersion) {
	console.error(`VoiceTut did not answer: ${awake.error}. Nothing was made; check VG_VOICETUT_URL and the Modal app (runbook §3a).`)
	await speech.close()
	process.exit(1)
}
console.log(`Model: ${awake.modelVersion}. Making the lines one at a time…`)
for (const lang of langs) await speech.prepare({ siteId: site.id, lang, lines: plan[lang] }, ctx)
const progress = setInterval(() => {
	const made = events.filter((e) => e.name === 'speech.synth').length
	console.log(`  ${made} made so far`)
}, 15_000)
await speech.drain({}, ctx)
clearInterval(progress)
const synth = events.filter((e) => e.name === 'speech.synth')
const failed = synth.filter((e) => e.attrs.error)
const prepared = events.filter((e) => e.name === 'speech.prepare').reduce((n, e) => n + Number(e.attrs.cached || 0), 0)
const status = await speech.status({}, ctx)
console.log(`Done in ${Math.round((performance.now() - t0) / 1000)} s: ${synth.length - failed.length} made, ${prepared} already cached, ${failed.length} failed. Model: ${status.modelVersion ?? 'unknown'}.`)
if (failed.length) console.log(`  last error: ${failed.at(-1)!.attrs.error}`)
await speech.close()
process.exit(failed.length ? 1 : 0)
