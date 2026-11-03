/**
 * Site experience profile (ADR-0036) and chip hints (ADR-0038): questions are generated offline,
 * every published one routes through the real router to its destination from two pages, is
 * grounded in the manifest, short, free of prices and promises, and joined to exactly one
 * knowledge version; the router uses a hint only for a verified question.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'

import { type Manifest, publishedQuestions, questionTextIssues, type SiteExperienceProfile, validateExperienceProfile } from '#kb'
import { buildExperienceProfile } from '#jobs/experience/build.ts'
import { candidatesFor } from '#jobs/experience/questions.ts'
import { validateCandidate } from '#jobs/experience/validate.ts'
import { applyHint } from '#services/router/handlers.ts'
import { buildPlan } from '#services/router/planner.ts'
import { understand } from '#services/router/understand.ts'
import { loadSiteConfig, ROOT } from '#shared/config.ts'
import { buildExperienceIndex, verifiedHint } from '#shared/experience.ts'

import { emptySession, fixtureKb, fixtureManifest } from '../helpers/kb.ts'

const site = loadSiteConfig(path.join(ROOT, 'config/sites/demo-telco.yaml'))
const kb = fixtureKb()
const settings = { acceptAt: site.router.acceptAt, clarifyAt: site.router.clarifyAt, topK: site.router.topK }
const built = await buildExperienceProfile({ manifest: fixtureManifest(), site, now: new Date('2026-11-03T00:00:00Z') })
const profile = built.profile

test('the profile targets one knowledge version and validates against it', () => {
	assert.equal(profile.standard, 'site-experience-profile/v1')
	assert.equal(profile.kbVersionId, kb.versionId)
	assert.deepEqual(built.issues.filter((i) => i.level === 'error'), [])
	assert.ok(built.stats.verified >= 60, `${built.stats.verified} verified`)
	assert.ok(built.stats.byLang.ar >= 30 && built.stats.byLang.en >= 30, 'both locales')
	const other = { ...fixtureManifest(), version: { ...fixtureManifest().version, id: 'another-version' } }
	assert.match(validateExperienceProfile(profile, other).issues.map((i) => i.message).join(' '), /targets .* manifest is another-version/)
	assert.equal(profile.destinations.every((d) => !d.minimumCohortMet && d.rank === undefined), true, 'no ranks without approved aggregation')
})

test('every published question routes to its destination from the destination\'s page and from home, with a deterministic plan', async () => {
	let n = 0
	for (const d of profile.destinations) {
		for (const [lang, qs] of Object.entries(d.suggestedQuestions)) {
			const verified = qs.filter((q) => q.validation.status === 'verified')
			assert.ok(verified.length <= 3, `${d.destinationId} ${lang}: at most three`)
			assert.equal(new Set(verified.map((q) => q.intent)).size, verified.length, `${d.destinationId} ${lang}: distinct intents`)
			for (const q of verified) {
				n++
				assert.ok(q.text.length <= 60, q.text)
				assert.ok(q.evidenceRefs.length > 0)
				assert.deepEqual(questionTextIssues(q.text, Object.values(kb.dest.get(d.destinationId)!.labels).flat().join(' ') + ' ' + Object.values(kb.collections.get(kb.dest.get(d.destinationId)!.collectionId || '')?.labels || {}).flat().join(' ')), [])
				for (const pageId of [d.pageId, 'web.home']) {
					const session = emptySession(lang)
					const u = await understand({ utterance: q.text, uiLang: lang, pageId, session, kb, settings: { ...settings, agentEnabled: false } })
					const { plan } = buildPlan({ u, utterance: q.text, session, kb, page: { url: Object.values(kb.pages.get(pageId)!.variants).find((v) => v.url.includes(`/${lang}/`))!.url, pageId }, turnId: 't', agent: { enabled: false, maxSteps: 0 } })
					assert.equal(plan.meta.route, 'replay', `${q.text} from ${pageId}`)
					assert.equal(plan.meta.destinationId ?? u.decision.destinationId, q.expectedDestinationId, `${q.text} from ${pageId}`)
					assert.ok(!plan.steps.some((s) => s.op === 'agent'), 'never the agent')
				}
			}
		}
	}
	assert.ok(n >= 60)
})

test('Arabic questions are written in the guide\'s Egyptian register, not translated word for word', () => {
	const ar = profile.destinations.find((d) => d.destinationId === 'web.bundles.mobile-internet.mi-25')!.suggestedQuestions.ar.filter((q) => q.validation.status === 'verified').map((q) => q.text)
	assert.ok(ar.includes('أشترك في ميجا ٢٥ إزاي؟'), ar.join(' | '))
	assert.ok(ar.every((t) => /[؀-ۿ]/.test(t) && !/[a-z]{3,}/i.test(t)), 'Arabic script throughout')
	const en = profile.destinations.find((d) => d.destinationId === 'web.bundles.mobile-internet.mi-25')!.suggestedQuestions.en.filter((q) => q.validation.status === 'verified').map((q) => q.intent)
	assert.deepEqual(en.sort(), ['compare', 'included', 'next'], 'what is included, a next step, a comparison')
})

test('validation rejects or flags: wrong destination, no plan, account data, a commit point, missing evidence, prices and promises', async () => {
	const d = kb.dest.get('web.offers.weekend-offer')!
	const base = candidatesFor(kb.manifest, d, 'en')[0]
	const check = (over: Partial<typeof base>) => validateCandidate({ ...base, ...over }, kb, settings, ['web.offers', 'web.home'])
	assert.equal((await check({})).validation.status, 'verified')
	const wrong = await check({ text: 'Show me the roaming offer' })
	assert.equal(wrong.validation.status, 'needs-review')
	assert.match(wrong.validation.reasons.join(' '), /reached web\.offers\.roaming-offer/)
	const nothing = await check({ text: 'What is the weather in Cairo' })
	assert.notEqual(nothing.validation.status, 'verified')
	assert.match((await check({ expectedDestinationId: 'app.account.data-balance', text: 'How much data do I have left?' })).validation.reasons.join(' '), /needs account data/)
	assert.match((await check({ expectedDestinationId: 'web.subscribe.confirm-pay', text: 'Confirm and pay' })).validation.reasons.join(' '), /commit point|needs account data/)
	assert.match((await check({ evidenceRefs: ['kb:web.offers.weekend-offer#answer.en'] })).validation.reasons.join(' '), /evidence .* does not resolve/)
	assert.match((await check({ text: 'Is the weekend offer 150 EGP?' })).validation.reasons.join(' '), /price/)
	assert.match((await check({ text: 'Can I get the weekend offer for free?' })).validation.reasons.join(' '), /promises/)
	assert.equal((await check({ text: 'Is the weekend offer 150 EGP?' })).validation.status, 'rejected')
})

test('published questions are verified only; a profile with problems is refused at validation', () => {
	const d = profile.destinations.find((x) => x.destinationId === 'web.bundles')!
	const pub = publishedQuestions(d)
	for (const qs of Object.values(pub)) for (const q of qs) assert.ok(d.suggestedQuestions[Object.keys(pub).find((l) => pub[l] === qs)!].find((x) => x.id === q.id)?.validation.status === 'verified')
	const broken: SiteExperienceProfile = structuredClone(profile)
	const target = broken.destinations.find((x) => x.destinationId === 'web.bundles.mobile-internet.mi-25')!
	target.suggestedQuestions.en.push({ ...target.suggestedQuestions.en[0], id: 'dup', validation: { ...target.suggestedQuestions.en[0].validation } })
	target.suggestedQuestions.en.push({ ...target.suggestedQuestions.en[0], id: 'priced', text: 'Is Mega 25 still 250 EGP?' })
	broken.destinations.push({ destinationId: 'web.nowhere', pageId: 'web.home', minimumCohortMet: false, suggestedQuestions: {} })
	broken.destinations.push({ destinationId: 'web.home', pageId: 'web.home', rank: 1, minimumCohortMet: false, suggestedQuestions: {} })
	const msgs = validateExperienceProfile(broken, fixtureManifest()).issues.map((i) => i.message).join(' | ')
	for (const m of [/duplicate question/, /price/, /unknown destination web\.nowhere/, /rank or interest band without a met cohort/, /verified questions, at most 3/]) assert.match(msgs, m)
})

test('a committed profile for the frozen Vodafone knowledge base validates against it', () => {
	const file = path.join(ROOT, 'config/experience/vodafone-eg.profile.json')
	const m = JSON.parse(fs.readFileSync(path.join(ROOT, 'config/kb/vodafone-eg.manifest.json'), 'utf8')) as Manifest
	const p = JSON.parse(fs.readFileSync(file, 'utf8'))
	const v = validateExperienceProfile(p, m)
	assert.deepEqual(v.issues.filter((i) => i.level === 'error'), [])
	assert.equal(p.kbVersionId, m.version.id)
})

test('hints: a verified question for that destination is used; anything else is ignored and the router plans alone', async () => {
	const x = buildExperienceIndex(profile)
	const q = profile.destinations.find((d) => d.destinationId === 'web.bundles.mobile-internet.mi-25')!.suggestedQuestions.en.find((x) => x.intent === 'included' && x.validation.status === 'verified')!
	assert.equal(verifiedHint(x, { destinationId: 'web.bundles.mobile-internet.mi-25', questionId: q.id }, q.text)?.id, q.id)
	assert.equal(verifiedHint(x, { destinationId: 'web.bundles.mobile-internet.mi-10', questionId: q.id }, q.text), null, 'question shown for another destination')
	assert.equal(verifiedHint(x, { destinationId: 'web.bundles.mobile-internet.mi-25', questionId: q.id }, 'pay for Mega 25 now'), null, 'text does not match the question')
	assert.equal(verifiedHint(x, { destinationId: 'web.bundles.mobile-internet.mi-25', questionId: 'made-up' }, q.text), null)
	assert.equal(verifiedHint(null, { destinationId: 'web.bundles.mobile-internet.mi-25', questionId: q.id }, q.text), null, 'no profile for this knowledge version')
	const session = emptySession('en')
	const u = await understand({ utterance: q.text, uiLang: 'en', pageId: 'web.bundles', session, kb, settings: { ...settings, agentEnabled: true } })
	assert.equal(applyHint(u, q, settings.acceptAt).outcome, 'agree')
	// The router alone was unsure (a low-confidence read): the verified question's destination wins only with retrieval evidence.
	const unsure = { ...u, route: 'agent' as const, decision: { ...u.decision, destinationId: undefined, confidence: 0.2 } }
	const h = applyHint(unsure, q, settings.acceptAt)
	assert.equal(h.outcome, 'override')
	assert.equal(h.u.route, 'replay')
	assert.equal(h.u.decision.destinationId, q.expectedDestinationId)
	assert.equal(h.u.decision.provider, 'trail-hint')
	assert.equal(applyHint({ ...unsure, candidates: [] }, q, settings.acceptAt).outcome, 'ignored', 'no evidence, no override')
	assert.equal(applyHint(unsure, null, settings.acceptAt).u.route, 'agent', 'an unverified hint changes nothing')
	const stop = await understand({ utterance: 'stop', uiLang: 'en', pageId: 'web.bundles', session, kb, settings: { ...settings, agentEnabled: true } })
	assert.equal(applyHint(stop, q, settings.acceptAt).outcome, 'ignored')
})
