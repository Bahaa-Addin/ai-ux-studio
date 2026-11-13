/**
 * Exploration Trail, the parts that need no browser (SPEC-06; ADR-0035 to ADR-0039): URL
 * normalisation and route policy, recorder options, step boundaries, attention scoring and
 * selection, the state machine's cancellation priorities, storage limits and corrupt chunks, the
 * aggregate payload, the replay sanitizer against adversarial events, and feature-flag defaults.
 */
import assert from 'node:assert/strict'
import path from 'node:path'
import { test } from 'node:test'

import { InterestContributionBatch } from '#kb'
import { loadSiteConfig, ROOT } from '#shared/config.ts'

import { contributionBatch } from '../../packages/sdk/src/trail/aggregate.ts'
import { decideStep } from '../../packages/sdk/src/trail/boundaries.ts'
import { TRAIL_CONFIG } from '../../packages/sdk/src/trail/config.ts'
import { band, type CatalogEntry, emptyInterest, isDeliberate, scoreInterest, selectTop, settle } from '../../packages/sdk/src/trail/interest.ts'
import { canonicalPath, eligibility, pageKey, recorderOptions, sensitivePath } from '../../packages/sdk/src/trail/policy.ts'
import { allowedResource, collectResources, sanitizeCss, sanitizeEvents } from '../../packages/sdk/src/trail/sanitize.ts'
import { INITIAL, reduce, type TrailEvent, type TrailState } from '../../packages/sdk/src/trail/state.ts'
import { CorruptChunk, decodeChunk, encodeEvents, planEviction } from '../../packages/sdk/src/trail/storage.ts'
import { parseSession, TRAIL_SCHEMA, type TrailSession } from '../../packages/sdk/src/trail/types.ts'
import { adversarialEvents, ORIGIN } from '../helpers/trail.ts'

// ---- URLs and route policy ----

test('canonical paths drop the hash, tracking parameters and index.html; page keys match the server', () => {
	assert.equal(canonicalPath('https://web.vodafone.com.eg/en/promotions/?utm_source=x&gclid=1#offers'), 'https://web.vodafone.com.eg/en/promotions')
	assert.equal(canonicalPath('http://localhost:4401/en/index.html?fbclid=abc'), 'http://localhost:4401/en')
	assert.equal(canonicalPath('http://localhost:4401/en/bundles.html#home-internet'), 'http://localhost:4401/en/bundles.html')
	assert.equal(canonicalPath('https://eshop.vodafone.com.eg/en/list?category=dsl&utm_medium=a', ['category', 'utm_medium']), 'https://eshop.vodafone.com.eg/en/list?category=dsl', 'kept parameters only, never tracking ones')
	assert.equal(pageKey('http://localhost:4401/en/'), 'http://localhost:4401/en/index.html')
	assert.equal(pageKey('http://localhost:4401/en/bundles.html?x=1#y'), 'http://localhost:4401/en/bundles.html')
})

test('sign-in, account, checkout and payment routes are never recorded; site patterns add to them', () => {
	for (const u of ['https://web.vodafone.com.eg/spa/login', 'https://x.eg/ar/my-account/bills', 'https://x.eg/en/checkout?step=2', 'https://x.eg/basket', 'https://x.eg/en/payment/card', 'https://x.eg/auth/otp', 'https://x.eg/en/sign-in', 'https://x.eg/password/reset'])
		assert.equal(sensitivePath(u), true, u)
	for (const u of ['https://web.vodafone.com.eg/en/promotions', 'https://x.eg/en/mobile-internet-bundles', 'https://x.eg/en/paypal-offers-article', 'https://x.eg/spa/storeLocator'])
		assert.equal(sensitivePath(u), false, u)
	// The e-shop's private and transactional pages (e-shop plan E3); its lists and plans stay recordable.
	for (const u of ['https://eshop.vodafone.com.eg/en/wishlist', 'https://eshop.vodafone.com.eg/en/order-status', 'https://eshop.vodafone.com.eg/ar/lines/red/numbers', 'https://eshop.vodafone.com.eg/en/lines/flex/review', 'https://eshop.vodafone.com.eg/en/internetServices/at-home/at-home-subscription-details', 'https://eshop.vodafone.com.eg/en/documents', 'https://eshop.vodafone.com.eg/en/saved-payments', 'https://eshop.vodafone.com.eg/en/vouchers'])
		assert.equal(sensitivePath(u), true, u)
	for (const u of ['https://eshop.vodafone.com.eg/en/list?categoryUrls=*smart-phones', 'https://eshop.vodafone.com.eg/en/lines/red', 'https://eshop.vodafone.com.eg/en/'])
		assert.equal(sensitivePath(u), false, u)
	// Phone, national-ID and upload fields make a page private, like password and card fields.
	for (const css of ['input[type="tel"]', 'input[name*="national" i]', 'input[type="file"]']) assert.ok(TRAIL_CONFIG.policy.privateFields.includes(css), css)
	assert.equal(sensitivePath('https://x.eg/en/recharge-now', { excludePaths: ['recharge'] }), true)
	assert.equal(sensitivePath('https://x.eg/en/x', { excludePaths: ['(['] }), false, 'a broken site pattern is ignored, not thrown')
})

test('eligibility: public pages on the site origin only; the knowledge base and private fields can veto', () => {
	const base = { siteOrigins: ['http://localhost:4401'] }
	assert.deepEqual(eligibility({ ...base, url: 'http://localhost:4401/en/offers.html', kbPage: { eligible: true } }), { ok: true })
	assert.equal(eligibility({ ...base, url: 'http://localhost:4401/en/subscribe.html', kbPage: { eligible: false } }).reason, 'not-public')
	assert.equal(eligibility({ ...base, url: 'http://localhost:4402/en/account.html' }).reason, 'other-origin')
	assert.equal(eligibility({ ...base, url: 'http://localhost:4401/en/offers.html', kbPage: { eligible: true }, optedOut: true }).reason, 'opted-out', 'a page with <meta name="vg-trail" content="off"> is browsed, never saved')
	assert.equal(eligibility({ ...base, url: 'http://localhost:4401/en/offers.html', hasPrivateFields: true }).reason, 'private-fields')
	assert.equal(eligibility({ ...base, url: 'http://localhost:4401/en/login.html' }).reason, 'sensitive-path')
	assert.equal(eligibility({ ...base, url: 'javascript:alert(1)' }).ok, false)
})

test('recorder options are the most restrictive set: inputs masked and blocked, the guide blocked, no canvas, fonts, images or iframes', () => {
	const o = recorderOptions({ privateSelectors: ['.my-balance', 'div[['] })
	assert.equal(o.maskAllInputs, true)
	assert.equal(o.recordCanvas, false)
	assert.equal(o.recordCrossOriginIframes, false)
	assert.equal(o.collectFonts, false)
	assert.equal(o.inlineImages, false)
	assert.equal(o.slimDOMOptions, 'all')
	assert.equal(o.sampling.input, 'last')
	assert.equal(o.sampling.mouseInteraction.Focus, false)
	assert.ok(o.sampling.mousemove >= 50 && o.sampling.scroll >= 150, 'pointer and scroll are sampled')
	for (const sel of ['vg-guide', 'input[type="password"]', 'input[type="email"]', 'input[type="tel"]', 'input[type="search"]', 'textarea', 'select', '[contenteditable]', '#onetrust-consent-sdk', 'iframe', 'canvas', 'video', '.my-balance'])
		assert.ok(o.blockSelector.includes(sel), `blocks ${sel}`)
	assert.ok(!o.blockSelector.includes('div[['), 'an unparseable site selector is dropped')
	assert.match(o.ignoreSelector, /input/)
	for (const k of ['password', 'email', 'tel', 'text', 'textarea', 'select']) assert.equal(o.maskInputOptions[k], true)
})

// ---- step boundaries ----

test('one step per page visit: hash, tracking and reloads continue; a redirect replaces; a link starts a new step with its cause', () => {
	const cur = { type: 'page' as const, canonicalPath: 'http://localhost:4401/en/offers.html', enteredAt: 1000 }
	assert.equal(decideStep({ current: cur, path: cur.canonicalPath, signal: 'poll', now: 5000 }).action, 'continue')
	assert.equal(decideStep({ current: cur, path: cur.canonicalPath, signal: 'load', navType: 'reload', now: 60_000 }).action, 'continue')
	assert.equal(decideStep({ current: cur, path: 'http://localhost:4401/en/offers-new.html', signal: 'replace', now: 3000 }).action, 'replace', 'an app normalising its URL right after load')
	assert.equal(decideStep({ current: cur, path: 'http://localhost:4401/en/help.html', signal: 'replace', now: 60_000 }).action, 'new', 'a later replaceState is a real route change')
	const pending = { fromStepId: 's1', sourceDestinationId: 'web.offers.weekend-offer', target: 'http://localhost:4401/en/bundles.html', targetPageId: 'web.bundles', at: 9000 }
	const d = decideStep({ current: cur, path: 'http://localhost:4401/en/bundles.html', signal: 'load', pending, now: 10_000 })
	assert.equal(d.action, 'new')
	assert.deepEqual(d.cause, { kind: 'destination', sourceDestinationId: 'web.offers.weekend-offer', sourceStepId: 's1', targetPageId: 'web.bundles' })
	assert.deepEqual(decideStep({ current: cur, path: 'http://localhost:4401/en/help.html', signal: 'load', pending, now: 10_000 }).cause, { kind: 'direct' }, 'a pending link to somewhere else is not the cause')
	assert.deepEqual(decideStep({ current: cur, path: 'http://localhost:4401/en/bundles.html', signal: 'load', pending, now: 9000 + 31_000 }).cause, { kind: 'direct' }, 'a stale pending link is ignored')
	assert.deepEqual(decideStep({ current: cur, path: 'http://localhost:4401/en/help.html', signal: 'pop', now: 10_000 }).cause, { kind: 'history' })
	assert.deepEqual(decideStep({ current: cur, path: 'http://localhost:4401/en/help.html', signal: 'load', navType: 'back_forward', now: 10_000 }).cause, { kind: 'history' })
	assert.deepEqual(decideStep({ current: cur, path: 'http://localhost:4401/spa/b', signal: 'push', now: 10_000 }).cause, { kind: 'spa' })
	assert.equal(decideStep({ path: 'http://localhost:4401/en/offers.html', signal: 'load', now: 1 }).action, 'new')
})

// ---- attention ----

const rec = (o: Partial<ReturnType<typeof emptyInterest>> & { destinationId?: string }) => settle({ ...emptyInterest('s1', `dest:${o.destinationId}`), ...o })

test('a brief crossing is not interest; lingering, focus, opening, returning and revealing are', () => {
	const a = TRAIL_CONFIG.attention
	assert.equal(isDeliberate(rec({ destinationId: 'x', engagedHoverMs: a.dwellMs - 1, visibleDwellMs: 20_000 })), false, 'seen but not lingered on')
	assert.equal(isDeliberate(rec({ destinationId: 'x', passThroughCount: 6 })), false)
	assert.equal(isDeliberate(rec({ destinationId: 'x', engagedHoverMs: a.dwellMs })), true)
	assert.equal(isDeliberate(rec({ destinationId: 'x', focusMs: a.focusMs })), true)
	assert.equal(isDeliberate(rec({ destinationId: 'x', activationCount: 1 })), true)
	assert.equal(isDeliberate(rec({ destinationId: 'x', revisitCount: 1 })), true)
	assert.equal(isDeliberate(rec({ destinationId: 'x', revealCount: 1 })), true)
})

test('scoring is capped, explainable, and penalises passing through', () => {
	const w = TRAIL_CONFIG.attention.weights
	assert.equal(scoreInterest(rec({ destinationId: 'x', engagedHoverMs: 2000 })), 2 * w.hoverPerSec)
	assert.equal(scoreInterest(rec({ destinationId: 'x', engagedHoverMs: 3_600_000 })), scoreInterest(rec({ destinationId: 'x', engagedHoverMs: TRAIL_CONFIG.attention.caps.hoverMs })), 'an hour of dwell counts like the cap')
	assert.equal(scoreInterest(rec({ destinationId: 'x', visibleDwellMs: 10 * 3_600_000 })), (w.visiblePerSec * TRAIL_CONFIG.attention.caps.visibleMs) / 1000)
	const clean = scoreInterest(rec({ destinationId: 'x', engagedHoverMs: 2000 }))
	assert.ok(scoreInterest(rec({ destinationId: 'x', engagedHoverMs: 2000, passThroughCount: 4 })) < clean)
	assert.equal(scoreInterest(rec({ destinationId: 'x', passThroughCount: 50 })), 0, 'never negative')
	assert.ok(scoreInterest(rec({ destinationId: 'x', activationCount: 1 })) > scoreInterest(rec({ destinationId: 'x', engagedHoverMs: 2000 })), 'opening something beats hovering it')
	assert.equal(band(rec({ destinationId: 'x', engagedHoverMs: 700 })), null, 'below the warm band')
	assert.equal(band(rec({ destinationId: 'x', activationCount: 2 })), 'hot')
})

const entry = (id: string, topic = id, extra: Partial<CatalogEntry> = {}): [string, CatalogEntry] => [id, { id, pageId: 'web.bundles', kind: 'item', topic, title: { en: id }, context: { en: 'ctx' }, questions: { en: [{ id: `${id}:q`, text: `About ${id}?`, intent: 'what' }] }, ...extra }]

test('top destinations: known, deliberate, deduplicated, diverse, at most three, never filler', () => {
	const catalog = new Map([entry('mi-10', 'mobile'), entry('mi-25', 'mobile'), entry('mi-60', 'mobile'), entry('hi-140', 'home'), entry('offer', 'offer'), entry('nav', 'nav', { excluded: true })])
	const records = [
		rec({ destinationId: 'mi-10', engagedHoverMs: 3000 }),
		rec({ destinationId: 'mi-25', engagedHoverMs: 3500, revisitCount: 1 }),
		rec({ destinationId: 'mi-60', engagedHoverMs: 2900 }),
		rec({ destinationId: 'hi-140', engagedHoverMs: 1200 }),
		rec({ destinationId: 'offer', activationCount: 1 }),
		rec({ destinationId: 'nav', activationCount: 2 }),
		rec({ destinationId: 'unknown', activationCount: 2 }),
		{ ...rec({ destinationId: undefined, activationCount: 2 }), key: 'fp:abc', localFingerprint: 'fp:abc' },
	]
	const top = selectTop(records, catalog)
	assert.deepEqual(top.map((x) => x.destinationId), ['mi-25', 'offer', 'mi-10'], 'one mobile card first, then other topics before a second mobile card')
	assert.equal(top[0].reason, 'returned')
	assert.equal(top[1].reason, 'opened')
	assert.equal(top[2].reason, 'explored')
	assert.ok(!top.some((x) => x.destinationId === 'nav' || x.destinationId === 'unknown'), 'never navigation, never unknown or local-only')
	const few = selectTop([rec({ destinationId: 'mi-10', engagedHoverMs: 2000 }), rec({ destinationId: 'mi-25', passThroughCount: 3, visibleDwellMs: 20_000 })], catalog)
	assert.deepEqual(few.map((x) => x.destinationId), ['mi-10'], 'fewer than three when fewer were explored')
	assert.deepEqual(selectTop([rec({ destinationId: 'mi-10', engagedHoverMs: 2000 }), rec({ destinationId: 'mi-10', engagedHoverMs: 2500 })], catalog).length, 1, 'deduplicated')
	for (const x of top) assert.doesNotMatch(JSON.stringify(x), /Ms"|count|score/i, 'no times, counts or scores reach the view')
})

// ---- state machine ----

const run = (events: TrailEvent[], from: TrailState = INITIAL) => {
	let s = from
	const fx: string[] = []
	for (const e of events) {
		const r = reduce(s, e)
		s = r.state
		fx.push(...r.effects)
	}
	return { s, fx }
}

test('no recording before consent; consent starts it; pause, resume and revocation stop and restart it', () => {
	let r = run([{ type: 'START', consent: 'unset', eligible: true }])
	assert.equal(r.s.rec, 'awaiting-consent')
	assert.ok(!r.fx.includes('startRecorder'))
	r = run([{ type: 'OFFER' }, { type: 'CONSENT_GRANTED', eligible: true }], r.s)
	assert.equal(r.s.rec, 'recording')
	assert.deepEqual(r.fx, ['startRecorder'])
	r = run([{ type: 'PAUSE' }], r.s)
	assert.equal(r.s.rec, 'paused')
	assert.deepEqual(r.fx, ['stopRecorder'])
	r = run([{ type: 'RESUME', eligible: true }], r.s)
	assert.deepEqual([r.s.rec, r.fx], ['recording', ['startRecorder']])
	r = run([{ type: 'EXPAND' }, { type: 'SELECT_STEP', stepId: 'a' }, { type: 'PREVIEW_READY' }, { type: 'PLAY' }, { type: 'TURN_OFF' }], r.s)
	assert.equal(r.s.rec, 'disabled')
	assert.equal(r.s.view, 'collapsed')
	assert.ok(r.fx.includes('stopRecorder') && r.fx.includes('destroyReplayer') && r.fx.includes('clearAll'), 'revocation stops everything and deletes')
	assert.equal(run([{ type: 'START', consent: 'declined', eligible: true }]).s.rec, 'disabled')
	assert.equal(run([{ type: 'START', consent: 'granted', eligible: false }]).fx.includes('startRecorder'), false, 'not on an ineligible page')
})

test('priorities: an ineligible route, the guide and teardown end lower-priority work', () => {
	const playing = run([{ type: 'START', consent: 'granted', eligible: true }, { type: 'EXPAND' }, { type: 'SELECT_STEP', stepId: 'a' }, { type: 'PREVIEW_READY' }, { type: 'PLAY' }]).s
	assert.equal(playing.preview, 'playing')
	let r = run([{ type: 'ROUTE', eligible: false }], playing)
	assert.equal(r.s.rec, 'blocked')
	assert.deepEqual(r.fx, ['stopRecorder'])
	r = run([{ type: 'GUIDE_BUSY' }], playing)
	assert.deepEqual([r.s.view, r.s.preview, r.s.action], ['collapsed', 'idle', 'guide-executing'])
	assert.deepEqual(r.fx, ['destroyReplayer'])
	assert.equal(run([{ type: 'EXPAND' }], r.s).s.view, 'collapsed', 'the timeline waits while the guide works')
	assert.equal(run([{ type: 'GUIDE_IDLE' }, { type: 'EXPAND' }], r.s).s.view, 'expanded')
	r = run([{ type: 'QUESTION' }], playing)
	assert.deepEqual([r.s.view, r.s.action], ['collapsed', 'question-submitting'])
	assert.ok(r.fx.includes('destroyReplayer') && r.fx.includes('submitQuestion'))
	r = run([{ type: 'STORAGE_FULL' }], playing)
	assert.equal(r.s.rec, 'storage-full')
	r = run([{ type: 'TEARDOWN' }, { type: 'EXPAND' }, { type: 'CONSENT_GRANTED', eligible: true }], playing)
	assert.equal(r.s.rec, 'destroyed')
	assert.deepEqual(r.fx, ['stopRecorder', 'destroyReplayer'], 'nothing restarts after teardown')
	assert.deepEqual(run([{ type: 'SELECT_STEP', stepId: 'b' }], playing).fx, ['destroyReplayer', 'loadPreview'], 'one replayer at a time')
})

// ---- storage ----

const session = (id: string, o: Partial<TrailSession> = {}): TrailSession => ({ schema: TRAIL_SCHEMA, id, siteId: 'demo-telco', locale: 'en', startedAt: 0, updatedAt: 0, expiresAt: 10_000, recordingState: 'stopped', bytes: 1000, steps: [], ...o })

test('retention: expired journeys go, then the least recent beyond three, never the active one', () => {
	const now = 5000
	const all = [session('old', { expiresAt: 4000, updatedAt: 3000 }), session('a', { updatedAt: 100 }), session('b', { updatedAt: 200 }), session('c', { updatedAt: 300 }), session('active', { updatedAt: 50, expiresAt: 4000 })]
	const p = planEviction(all, now, 'active', () => 0)
	assert.deepEqual(p.sessions.sort(), ['a', 'old'])
})

test('storage budget: other journeys first, then the active journey\'s oldest replay, never the step being recorded', () => {
	const cfg = { ...TRAIL_CONFIG.storage, maxBytes: 3000 }
	const step = (id: string) => ({ id, sessionId: 'active', type: 'page' as const, title: { en: id }, enteredAt: 0, durationMs: 1, navigationCause: { kind: 'direct' as const }, topDestinationIds: [], explored: [], replay: 'ok' as const })
	const active = session('active', { bytes: 4000, updatedAt: 900, steps: [step('s1'), step('s2'), step('s3')] })
	const p = planEviction([session('other', { bytes: 1500, updatedAt: 10 }), active], 100, 'active', () => 700, cfg)
	assert.deepEqual(p.sessions, ['other'])
	assert.deepEqual(p.steps.map((x) => x.stepId), ['s1', 's2'])
	assert.ok(!p.steps.some((x) => x.stepId === 's3'), 'the current step keeps its replay')
})

test('chunks round-trip compressed; corrupt, truncated or foreign chunks are refused, never half-used', async () => {
	const events = [{ type: 4, timestamp: 1, data: { href: 'x', width: 1, height: 1 } }, { type: 2, timestamp: 2, data: { node: { type: 0, childNodes: [], id: 1 } } }]
	const enc = await encodeEvents(events)
	assert.equal(enc.enc, 'gzip')
	const chunk = { id: 'c', sessionId: 's', stepId: 'p', seq: 0, t0: 1, t1: 2, bytes: enc.bytes, enc: enc.enc, data: enc.data }
	assert.deepEqual(await decodeChunk(chunk), events)
	await assert.rejects(decodeChunk({ ...chunk, data: new Blob([new Uint8Array([1, 2, 3, 4])]) }), CorruptChunk)
	await assert.rejects(decodeChunk({ ...chunk, enc: 'json', data: '[{"type":2,' }), CorruptChunk)
	await assert.rejects(decodeChunk({ ...chunk, enc: 'json', data: '{"not":"a list"}' }), CorruptChunk)
	await assert.rejects(decodeChunk({ id: 1 }), CorruptChunk)
	assert.deepEqual(await decodeChunk({ ...chunk, enc: 'json', data: '[{"type":2,"timestamp":5},{"type":"x"},null,{"type":99,"timestamp":1}]' }), [{ type: 2, timestamp: 5 }], 'malformed events are dropped')
	assert.equal(parseSession({ schema: 'other', id: 'x' }), null)
	assert.equal(parseSession({ ...session('s'), steps: [{ id: 1 }, null] })?.steps.length, 0, 'damaged steps are dropped')
})

// ---- the optional aggregate (off by default) ----

test('feature flags: the trail and aggregation are off unless a site enables them', () => {
	const s = loadSiteConfig(path.join(ROOT, 'config/sites/vodafone-eg.yaml'))
	assert.equal(s.trail.aggregation.enabled, false)
	assert.equal(s.trail.aggregation.minCohort, 20)
	const d = loadSiteConfig(path.join(ROOT, 'config/sites/demo-telco.yaml'))
	assert.equal(d.trail.enabled, true)
	assert.equal(d.trail.aggregation.enabled, false)
	assert.equal(d.trail.retentionHours, 24)
})

test('the contribution batch holds only knowledge ids, coarse bands, an activated flag and a UTC day', () => {
	const records = [
		{ ...rec({ destinationId: 'web.offers.weekend-offer', activationCount: 2, engagedHoverMs: 4000 }), localFingerprint: 'fp:zzz' },
		rec({ destinationId: 'web.offers.roaming-offer', engagedHoverMs: 2500 }),
		rec({ destinationId: 'web.offers.students-offer', passThroughCount: 2 }),
		rec({ destinationId: 'not-on-this-page', activationCount: 2 }),
		{ ...rec({ destinationId: undefined, activationCount: 2 }), key: 'fp:abc', localFingerprint: 'fp:abc' },
	]
	const known = new Map([['web.offers.weekend-offer', 'web.offers'], ['web.offers.roaming-offer', 'web.offers'], ['web.offers.students-offer', 'web.offers']])
	const b = contributionBatch({ siteId: 'demo-telco', kbVersionId: 'v1', records, knownDestinations: known, now: Date.parse('2026-11-03T21:59:59Z') })!
	assert.ok(InterestContributionBatch.safeParse(b).success)
	assert.equal(b.dayBucket, '2026-11-03')
	assert.deepEqual(b.contributions.map((c) => [c.destinationId, c.interestBand, c.activated]), [['web.offers.weekend-offer', 'hot', true], ['web.offers.roaming-offer', 'warm', false]])
	const text = JSON.stringify(b)
	for (const forbidden of ['fp:', 'Ms', 'score', 'stepId', 'timestamp', 'key', 'http', 'selector', 'css']) assert.ok(!text.includes(forbidden), `no ${forbidden} in the payload`)
	assert.equal(InterestContributionBatch.safeParse({ ...b, contributions: [{ ...b.contributions[0], x: 1, y: 2 }] }).success, false, 'coordinates or any extra key are refused')
	assert.equal(InterestContributionBatch.safeParse({ ...b, sessionId: 'ses_1' }).success, false)
	assert.equal(InterestContributionBatch.safeParse({ ...b, contributions: Array.from({ length: 11 }, () => b.contributions[0]) }).success, false)
	assert.equal(contributionBatch({ siteId: 's', kbVersionId: 'v', records: [rec({ destinationId: 'x', passThroughCount: 1 })], knownDestinations: new Map([['x', 'p']]), now: 0 }), null)
})

// ---- replay sanitizer: adversarial recordings ----

test('the sanitizer removes everything that could run, navigate, submit or call out, and keeps only safe resources', () => {
	const fetched = collectResources(adversarialEvents(), ORIGIN)
	assert.deepEqual(fetched.sort(), [`${ORIGIN}/assets/a.png`, `${ORIGIN}/assets/logo.svg`, `${ORIGIN}/assets/promo-weekend-en.png`].sort(), 'only same-origin, query-free static assets are fetched')
	const resolved = new Map(fetched.map((u, i) => [u, `blob:${ORIGIN}/${i}`]))
	const { events, dropped } = sanitizeEvents(adversarialEvents(), { origin: ORIGIN, resolved })
	const out = JSON.stringify(events)
	for (const bad of ['__pwned', 'javascript:', 'evil.example', 'tracker.example', 'my password', '"script"', '"iframe"', '"object"', '"base"', 'http-equiv', 'onerror', 'onclick', 'onload', 'onmouseover', 'formaction', '"action"', '"ping"', '"target"', 'srcdoc', '"canvas"', 'behavior', '@import', '/api/logout', 'token=secret', 'prefetch', '"animate"', '"foreignObject"', '"foreignobject"'])
		assert.ok(!out.includes(bad), `${bad} survived`)
	assert.ok(out.includes(`blob:${ORIGIN}`), 'allowed resources point at credential-free copies')
	assert.ok(out.includes('data-vg-blocked'), 'canvas and frames become empty boxes')
	assert.ok(!events.some((e) => e.type === 5 || e.type === 6), 'custom and plugin events dropped')
	assert.ok(!events.some((e) => e.type === 3 && [5, 9].includes((e.data as any).source)), 'input and canvas events dropped')
	assert.equal(events[0].type, 4)
	assert.equal(events[1].type, 2)
	assert.ok(dropped >= 5)
	assert.equal(sanitizeEvents([{ type: 3, timestamp: 1, data: { source: 1 } }], { origin: ORIGIN }).events.length, 0, 'nothing to show without a full snapshot')
})

test('the replay resource policy allows only same-origin, query-free static assets', () => {
	assert.equal(allowedResource(`${ORIGIN}/assets/site.css`, ORIGIN), true)
	assert.equal(allowedResource(`${ORIGIN}/assets/site.css?v=2`, ORIGIN), false)
	assert.equal(allowedResource(`${ORIGIN}/en/offers.html`, ORIGIN), false)
	assert.equal(allowedResource('https://cdn.example/a.png', ORIGIN), false)
	assert.equal(allowedResource('http://user:pw@localhost:4401/a.png', ORIGIN), false)
	// A declared asset folder (a CMS's images): a query and no extension are fine there, nowhere else.
	assert.equal(allowedResource(`${ORIGIN}/documents/97/abc?t=16`, ORIGIN, ['/documents/']), true)
	assert.equal(allowedResource(`${ORIGIN}/documents/97/abc?t=16`, ORIGIN), false)
	assert.equal(allowedResource(`${ORIGIN}/api/logout?x=1`, ORIGIN, ['/documents/']), false)
	assert.equal(allowedResource('https://cdn.example/documents/a?t=1', ORIGIN, ['/documents/']), false)
	assert.equal(allowedResource(`${ORIGIN}/documents/../api/logout`, ORIGIN, ['/documents/']), false)
	assert.equal(sanitizeCss('a{background:url(data:image/png;base64,iVBORw0KGgo=)}', { origin: ORIGIN }), 'a{background:url("data:image/png;base64,iVBORw0KGgo=")}')
	assert.match(sanitizeCss('a{background:url(data:image/svg+xml;base64,PHN2Zz4=)}', { origin: ORIGIN }), /R0lGOD/, 'SVG data URLs become a transparent pixel')
})
