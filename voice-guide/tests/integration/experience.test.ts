/**
 * The Exploration Trail's server side over HTTP with real Postgres (SPEC-06; ADR-0036 to ADR-0038):
 * the page map, verified-only questions, the profile/knowledge-version join, a chip's hint through
 * /v1/turn (accepted, overridden or ignored, and traced), and the anonymous aggregation endpoint,
 * which is off by default and strict when an approved deployment turns it on.
 */
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'

import { buildExperienceProfile } from '#jobs/experience/build.ts'
import { createGateway } from '#services/gateway/server.ts'
import { createServices } from '#services/index.ts'
import type { SiteConfig } from '#shared/config.ts'

import { fixtureManifest } from '../helpers/kb.ts'
import { startPlatform, type TestPlatform } from '../helpers/platform.ts'

const ORIGIN = 'http://localhost:4401'
const KEY = 'pk_demo_telco'
let p: TestPlatform
let profileId = ''

before(async () => {
	p = await startPlatform({ port: 4493, env: { VG_RATE_TURNS_PER_MIN: '600', VG_RATE_BURST: '40' } })
	const site = p.services.sites.get('demo-telco')!
	const { profile } = await buildExperienceProfile({ manifest: fixtureManifest(), site })
	await p.store.putExperienceProfile('demo-telco', profile)
	await p.store.activateExperienceProfile('demo-telco', profile.id)
	profileId = profile.id
})
after(async () => {
	await p?.close()
})

async function call(base: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
	const res = await fetch(`${base}${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', 'x-vg-site-key': KEY, Origin: ORIGIN, ...headers }, body: body === undefined ? undefined : JSON.stringify(body) })
	return { status: res.status, body: (await res.json().catch(() => ({}))) as any, headers: res.headers }
}

test('the session tells the SDK the trail is on and aggregation is off; nothing about the person', async () => {
	const s = (await call(p.url, '/v1/session', { lang: 'en', page: { url: `${ORIGIN}/en/offers.html` } })).body
	assert.deepEqual(s.site.trail, { enabled: true, retentionHours: 24, excludePaths: [], privateSelectors: [], replayAssetPaths: [], aggregation: false })
})

test('the page map: this page\'s destinations with targets and verified questions, the site\'s pages and paths', async () => {
	const r = await call(p.url, `/v1/experience?url=${encodeURIComponent(`${ORIGIN}/en/bundles.html#home-internet`)}`)
	assert.equal(r.status, 200)
	assert.match(r.headers.get('cache-control') || '', /max-age/)
	const m = r.body
	assert.equal(m.standard, 'vg-experience-page/v1')
	assert.equal(m.profileId, profileId)
	assert.deepEqual(m.page, { id: 'web.bundles', kind: 'content', eligible: true, title: { ar: 'باقات الإنترنت', en: 'Internet bundles' } })
	const mi25 = m.destinations.find((d: any) => d.id === 'web.bundles.mobile-internet.mi-25')
	assert.equal(mi25.key, 'mi-25')
	assert.equal(mi25.topic, 'web.bundles.mobile-internet')
	assert.ok(mi25.css[0].includes('data-bundle="mi-25"'))
	assert.ok(mi25.questions.en.length === 3 && mi25.questions.ar.length === 3)
	for (const q of mi25.questions.en) assert.deepEqual(Object.keys(q).sort(), ['id', 'intent', 'text'], 'no validation detail, evidence or provenance sent to browsers')
	assert.ok(!m.destinations.some((d: any) => d.kind === 'page' || d.kind === 'action'))
	const sub = m.pages.find((x: any) => x.id === 'web.subscribe')
	assert.equal(sub.eligible, false, 'checkout is not a public page for the trail')
	assert.deepEqual(sub.questions, {})
	assert.ok(m.pages.find((x: any) => x.id === 'web.bundles').paths.includes(`${ORIGIN}/en/bundles.html`))
	const offers = (await call(p.url, `/v1/experience?url=${encodeURIComponent(`${ORIGIN}/en/offers.html`)}`)).body
	const json = JSON.stringify(offers)
	assert.ok(!/needs-review|rejected|evidenceRefs|routerConfidence/.test(json), 'only published questions')
})

test('a profile for another knowledge version is never served: explored items, no questions', async () => {
	const other = structuredClone((await p.store.getActiveExperienceProfile('demo-telco'))!)
	other.id = 'exp-stale'
	other.kbVersionId = 'an-older-version'
	await p.store.putExperienceProfile('demo-telco', other)
	await p.store.activateExperienceProfile('demo-telco', other.id)
	p.services.experience.invalidate()
	try {
		const m = (await call(p.url, `/v1/experience?url=${encodeURIComponent(`${ORIGIN}/en/bundles.html`)}`)).body
		assert.equal(m.profileId, null)
		assert.ok(m.destinations.length > 0)
		assert.ok(m.destinations.every((d: any) => Object.keys(d.questions).length === 0))
	} finally {
		await p.store.activateExperienceProfile('demo-telco', profileId)
		p.services.experience.invalidate()
	}
})

test('a chip turn: the hint reaches the router, is checked against the profile and traced; a tampered hint is ignored', async () => {
	const s = (await call(p.url, '/v1/session', { lang: 'en', page: { url: `${ORIGIN}/en/bundles.html` } })).body
	const m = (await call(p.url, `/v1/experience?url=${encodeURIComponent(`${ORIGIN}/en/bundles.html`)}`)).body
	const q = m.destinations.find((d: any) => d.id === 'web.bundles.mobile-internet.mi-25').questions.en.find((x: any) => x.intent === 'included')
	const hint = { source: 'trail-suggestion', destinationId: 'web.bundles.mobile-internet.mi-25', pageId: 'web.bundles', trailStepId: 'stp_abc', questionId: q.id }
	const r = await call(p.url, '/v1/turn', { sessionId: s.sessionId, utterance: q.text, uiLang: 'en', page: { url: `${ORIGIN}/en/bundles.html` }, hint })
	assert.equal(r.status, 200)
	assert.equal(r.body.plan.meta.route, 'replay')
	assert.equal(r.body.plan.meta.destinationId, 'web.bundles.mobile-internet.mi-25')
	assert.deepEqual(r.body.plan.steps.map((x: any) => x.op), ['reveal', 'pickItem', 'spotlight'])
	const trace = (await p.store.listTrace(s.sessionId)).filter((e) => e.turnId === r.body.turnId)
	const h = trace.find((e) => e.name === 'router.hint')
	assert.deepEqual([h?.attrs.outcome, h?.attrs.destinationId, h?.attrs.trailStepId, h?.attrs.questionId], ['agree', 'web.bundles.mobile-internet.mi-25', 'stp_abc', q.id])
	// The same destination with a different (unsafe) request: the hint is not permission.
	const bad = await call(p.url, '/v1/turn', { sessionId: s.sessionId, utterance: 'Confirm and pay', uiLang: 'en', page: { url: `${ORIGIN}/en/bundles.html` }, hint })
	const bt = (await p.store.listTrace(s.sessionId)).find((e) => e.turnId === bad.body.turnId && e.name === 'router.hint')
	assert.equal(bt?.attrs.outcome, 'ignored')
	assert.notEqual(bad.body.plan.meta.destinationId, 'web.bundles.mobile-internet.mi-25')
	assert.ok(!bad.body.plan.steps.some((x: any) => x.op === 'click' && x.target.css.includes('#confirm-pay')), 'never presses the commit point')
	// Malformed hints are dropped at the gateway.
	const junk = await call(p.url, '/v1/turn', { sessionId: s.sessionId, utterance: q.text, page: { url: `${ORIGIN}/en/bundles.html` }, hint: { source: 'other', destinationId: '<script>' } })
	assert.equal(junk.status, 200)
	assert.equal((await p.store.listTrace(s.sessionId)).some((e) => e.turnId === junk.body.turnId && e.name === 'router.hint'), false)
})

test('aggregation is off by default: the endpoint does not exist for this deployment', async () => {
	const batch = { schema: 'vg-interest-contribution/v1', siteId: 'demo-telco', kbVersionId: fixtureManifest().version.id, dayBucket: new Date().toISOString().slice(0, 10), contributions: [{ pageId: 'web.offers', destinationId: 'web.offers.weekend-offer', interestBand: 'hot', activated: true }] }
	const r = await call(p.url, '/v1/experience/contributions', batch)
	assert.equal(r.status, 404)
	assert.equal(r.body.code, 'aggregation_off')
	assert.deepEqual(await p.store.listInterestCounts('demo-telco', batch.kbVersionId, '2000-01-01', '2100-01-01'), [])
})

test('with approval (site and platform both on): strict validation, rate limit, counts only, no traces', async () => {
	const sites = new Map(p.services.sites)
	const site = structuredClone(sites.get('demo-telco')!) as SiteConfig
	site.trail.aggregation.enabled = true
	sites.set('demo-telco', site)
	const services = await createServices({ platform: { ...p.platform, trailAggregation: true }, store: p.store, sites })
	const gw = createGateway({ services })
	await gw.listen(4494)
	const base = 'http://localhost:4494'
	try {
		const day = new Date().toISOString().slice(0, 10)
		const kbVersionId = fixtureManifest().version.id
		const ok = { schema: 'vg-interest-contribution/v1', siteId: 'demo-telco', kbVersionId, dayBucket: day, contributions: [{ pageId: 'web.offers', destinationId: 'web.offers.weekend-offer', interestBand: 'hot', activated: true }, { pageId: 'web.offers', destinationId: 'web.offers.roaming-offer', interestBand: 'warm', activated: false }] }
		const reject = async (body: unknown, code: string, ip: string) => {
			const r = await call(base, '/v1/experience/contributions', body, { 'x-forwarded-for': ip })
			assert.equal(r.body.code, code, JSON.stringify(r.body))
		}
		await reject({ ...ok, contributions: [{ ...ok.contributions[0], x: 10, y: 20 }] }, 'bad_batch', '10.0.0.1')
		await reject({ ...ok, url: 'https://x' }, 'bad_batch', '10.0.0.2')
		await reject({ ...ok, contributions: [{ ...ok.contributions[0], destinationId: 'web.offers.made-up' }] }, 'bad_destination', '10.0.0.3')
		await reject({ ...ok, contributions: [{ ...ok.contributions[0], pageId: 'web.home' }] }, 'bad_destination', '10.0.0.4')
		await reject({ ...ok, contributions: [{ pageId: 'web.subscribe', destinationId: 'web.subscribe.checkout', interestBand: 'hot', activated: true }] }, 'private_destination', '10.0.0.5')
		await reject({ ...ok, kbVersionId: 'old' }, 'stale_kb', '10.0.0.6')
		await reject({ ...ok, dayBucket: '2020-01-01' }, 'bad_day', '10.0.0.7')
		await reject({ ...ok, contributions: Array.from({ length: 11 }, () => ok.contributions[0]) }, 'bad_batch', '10.0.0.8')
		const accepted = await call(base, '/v1/experience/contributions', ok, { 'x-forwarded-for': '10.0.0.9' })
		assert.equal(accepted.status, 202)
		assert.equal((await call(base, '/v1/experience/contributions', ok, { 'x-forwarded-for': '10.0.0.9' })).status, 429, 'one batch per address every ten minutes')
		const rows = await p.store.listInterestCounts('demo-telco', kbVersionId, day, day)
		assert.deepEqual(rows.map((r) => [r.destinationId, r.warm, r.hot, r.activated]).sort(), [['web.offers.roaming-offer', 1, 0, 0], ['web.offers.weekend-offer', 0, 1, 1]])
		assert.deepEqual(Object.keys(rows[0]).sort(), ['activated', 'day', 'destinationId', 'hot', 'kbVersionId', 'pageId', 'siteId', 'warm'], 'counts only: no address, session or time of day')
		assert.equal((await p.store.listTrace('experience')).length, 0, 'contributions are not traced')
		// Below the cohort threshold nothing is ranked; above it, a coarse rank appears.
		const few = await buildExperienceProfile({ manifest: fixtureManifest(), site, counts: rows })
		assert.ok(few.profile.destinations.every((d) => d.rank === undefined))
		const many = Array.from({ length: 25 }, () => ({ ...rows.find((r) => r.destinationId === 'web.offers.weekend-offer')! }))
		const ranked = await buildExperienceProfile({ manifest: fixtureManifest(), site, counts: many })
		const w = ranked.profile.destinations.find((d) => d.destinationId === 'web.offers.weekend-offer')!
		assert.deepEqual([w.rank, w.interestBand, w.evidenceBucket, w.minimumCohortMet], [1, 'hot', '20-49', true])
		assert.equal(ranked.profile.destinations.find((d) => d.destinationId === 'web.offers.roaming-offer')!.rank, undefined)
	} finally {
		await gw.close()
		await services.close()
	}
})
