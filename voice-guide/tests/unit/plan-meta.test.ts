/**
 * The plan's meta for the trail (ADR-0050 §5; live plan phase 3 S14): with a resolved destination it
 * carries the destination's page id and a price-free label in the turn's language; without one,
 * neither. Both fields are optional, so a plan without them still validates.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { Plan } from '#kb'
import { buildPlan } from '#services/router/planner.ts'
import { understand } from '#services/router/understand.ts'
import { buildKbIndex } from '#shared/kb-index.ts'

import { emptySession, fixtureKb, fixtureManifest } from '../helpers/kb.ts'

const settings = { acceptAt: 0.55, clarifyAt: 0.3, topK: 8, agentEnabled: true }
const agent = { enabled: true, maxSteps: 12 }

async function planFor(utterance: string, lang: string, kb = fixtureKb(), pageId = 'web.home') {
	const session = emptySession(lang)
	const u = await understand({ utterance, pageId, session, kb, settings })
	return buildPlan({ u, utterance, session, kb, page: { url: `http://localhost:4401/${lang}/index.html` }, turnId: 't', agent }).plan
}

test('a plan for a destination names its page and a price-free label in the turn\'s language', async () => {
	const kb = fixtureKb()
	for (const [say, lang, label] of [['show me the coverage map', 'en', 'Coverage'], ['التغطية', 'ar', 'التغطية'], ['Internet bundles', 'en', 'Internet bundles'], ['العروض', 'ar', 'العروض']]) {
		const p = await planFor(say, lang, kb)
		const d = kb.dest.get(p.meta.destinationId!)
		assert.ok(d, `${say}: a destination`)
		assert.equal(p.meta.pageId, d.pageId, say)
		assert.equal(p.meta.label, d.labels[lang]?.[0], say)
		if (d.kind === 'page') assert.equal(p.meta.label, label)
		assert.ok(Plan.safeParse(p).success)
	}
})

test('no destination: no page id and no label; old plans without them still validate', async () => {
	const stop = await planFor('stop', 'en')
	assert.equal(stop.meta.destinationId, undefined)
	assert.equal('pageId' in stop.meta, false)
	assert.equal('label' in stop.meta, false)
	assert.ok(Plan.safeParse({ v: 1, turnId: 't', lang: 'en', steps: [], meta: { intent: 'navigate', route: 'replay', destinationId: 'x' } }).success, 'a plan from before S14')
})

test('a destination whose title names a price has no label (left out, not cleaned); its page id stays', async () => {
	const m = fixtureManifest()
	for (const d of m.destinations) d.labels = Object.fromEntries(Object.entries(d.labels).map(([lang, l]) => [lang, [`${l[0]} ${lang === 'ar' ? '٤٦ جنيه' : '46 EGP'}`, ...l.slice(1)]]))
	const kb = buildKbIndex(m)
	for (const [say, lang] of [['show me the coverage map', 'en'], ['العروض', 'ar'], ['المساعدة', 'ar'], ['Internet bundles', 'en']]) {
		const p = await planFor(say, lang, kb)
		assert.ok(p.meta.destinationId, say)
		assert.equal(p.meta.pageId, kb.dest.get(p.meta.destinationId!)!.pageId)
		assert.equal('label' in p.meta, false, `${say}: a priced title is not a label`)
	}
})
