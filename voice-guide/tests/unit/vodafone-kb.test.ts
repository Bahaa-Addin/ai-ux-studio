/**
 * The knowledge-base builder and router on real Vodafone data (ADR-0011, ADR-0028, ADR-0032):
 * the 14 pages captured for replay on 2026-10-23 and the frozen KB built from the full public
 * crawl. Guards the fixes made against the live site: unique ids, soft 404s, boilerplate labels,
 * language-neutral /spa/ pages, cleaned alt texts, positional item keys, page summaries.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'

import YAML from 'yaml'

import type { CrawlResult } from '../../jobs/crawler/types.ts'
import { cleanAlt } from '../../jobs/describer/describe.ts'
import { buildManifest } from '../../jobs/kb-builder/build.ts'
import { type EvalCase, evaluate } from '#services/router/eval.ts'
import { createRouter } from '#services/router/handlers.ts'
import { buildPlan } from '#services/router/planner.ts'
import { understand } from '#services/router/understand.ts'
import { loadPlatformConfig, loadSiteConfig, ROOT } from '#shared/config.ts'
import { buildKbIndex } from '#shared/kb-index.ts'

const site = loadSiteConfig(path.join(ROOT, 'config/sites/vodafone-eg.yaml'))
const crawl = (): CrawlResult => JSON.parse(fs.readFileSync(path.join(ROOT, 'fixtures/replay/vodafone-eg/crawl.json'), 'utf8'))
const build = (c = crawl()) => buildManifest({ site, crawl: c, descriptions: new Map(), now: new Date('2026-10-23T12:00:00Z') })

test('builder: the real pages build with no errors and unique ids', () => {
	const out = build()
	const errors = out.issues.filter((i) => i.level === 'error')
	assert.deepEqual(errors, [])
	const m = out.manifest!
	for (const [kind, list] of [
		['pages', m.pages],
		['destinations', m.destinations],
		['collections', m.collections],
		['visuals', m.visuals || []],
	] as const) {
		const ids = (list as { id: string }[]).map((x) => x.id)
		assert.equal(new Set(ids).size, ids.length, `duplicate ${kind} ids`)
	}
	assert.ok(m.pages.length >= 8, `${m.pages.length} pages`)
})

test('builder: /en/ and /ar/ pair by path; a /spa/ page exists in every language', () => {
	const m = build().manifest!
	const bundles = m.pages.find((p) => p.id === 'web.mobile-internet-bundles')!
	assert.deepEqual(Object.keys(bundles.variants).sort(), ['ar', 'en'])
	const stores = m.pages.find((p) => p.variants.en?.url.includes('/spa/storeLocator') || p.variants.ar?.url.includes('/spa/storeLocator'))!
	assert.ok(stores, 'store locator page')
	assert.deepEqual(Object.keys(stores.variants).sort(), ['ar', 'en'])
})

test('builder: skip links and generic anchors never become destination labels', () => {
	const m = build().manifest!
	const bad = /^(skip to (main )?content|main content start|know more|learn more|read more|press enter to redirect|go to internet)$/i
	for (const d of m.destinations)
		for (const labels of Object.values(d.labels || {})) for (const l of labels as string[]) assert.equal(bad.test(l.trim()), false, `${d.id}: "${l}"`)
})

test('builder: the wrapper around a whole page is not a section ("promotions-lite" competed with the page\'s own cards)', () => {
	const m = build().manifest!
	const wrappers = m.destinations.filter((d) => d.kind === 'section' && /^(#content|#wrapper|#main|main|body)$/i.test(d.target?.css[0] || ''))
	assert.deepEqual(wrappers.map((d) => d.id), [])
})

test('builder: links to retired pages that redirect home do not label the home page', () => {
	const home = build().manifest!.destinations.find((d) => d.id === 'web.home')!
	const labels = Object.values(home.labels).flat()
	assert.equal(labels.some((l) => /wifi page|wi-fi/i.test(l)), false, labels.join(' | '))
	assert.ok(labels.includes('Personal'), 'a direct link to the home page still labels it')
})

test('builder: a soft 404 (200 with a "not found" page) is dropped', () => {
	const c = crawl()
	const copy = structuredClone(c.pages[0])
	copy.url = 'https://web.vodafone.com.eg/en/some-removed-campaign'
	copy.lang = 'en'
	copy.links = [] // no language switch, so it is a page of its own
	copy.alternates = {}
	const has = (cr: CrawlResult) => build(cr).manifest!.pages.some((p) => Object.values(p.variants).some((v) => v?.url.endsWith('/some-removed-campaign')))
	assert.ok(has({ ...c, pages: [...c.pages, { ...copy, title: 'Summer campaign', h1: 'Summer campaign' }] }), 'a normal page is kept')
	assert.equal(has({ ...c, pages: [...c.pages, { ...copy, title: 'notfound', h1: 'Page Not Found!' }] }), false, 'a soft 404 is dropped')
})

test('builder: redirects into the /spa/ app and second URLs of a page become aliases', () => {
	const c = crawl()
	// The in-browser crawler records a redirect into /spa/ as an error (ADR-0032).
	c.errors.push({ url: 'https://web.vodafone.com.eg/en/store-locator', error: 'redirected out of scope to https://web.vodafone.com.eg/spa/storeLocator' })
	// The live site answers a page under two spellings (/en/HomeDSLcatalog and /en/homedslcatalog).
	const upper = structuredClone(c.pages.find((p) => p.url === 'https://web.vodafone.com.eg/en/mobile-internet-bundles')!)
	upper.url = 'https://web.vodafone.com.eg/en/Mobile-Internet-Bundles'
	c.pages.push(upper)
	const m = build(c).manifest!
	const aliasesOf = (id: string) => Object.values(m.pages.find((p) => p.id === id)!.variants).flatMap((v) => (v as { aliases?: string[] }).aliases || [])
	assert.ok(aliasesOf('web.spa-storelocator').includes('https://web.vodafone.com.eg/en/store-locator'))
	assert.ok(aliasesOf('web.mobile-internet-bundles').includes('https://web.vodafone.com.eg/en/Mobile-Internet-Bundles'))
	assert.equal(m.pages.filter((p) => p.id.startsWith('web.mobile-internet-bundles')).length, 1, 'one page, not two')
})

// B-25: pages finish crawling in any order; the anchor texts that label a page were collected in that
// order, so an unchanged site could hash differently and publish a new version (seen on CI).
test('builder: the same pages crawled in another order build the same manifest hash', () => {
	const c = crawl()
	const reversed = { ...c, pages: [...c.pages].reverse() }
	assert.equal(build(reversed).manifest!.version.hash, build(c).manifest!.version.hash)
})

test('alt texts: HTML, layout words and file names are cleaned away', () => {
	assert.equal(cleanAlt('<p>Vodafone&nbsp;Plus &amp; more</p>'), 'Vodafone Plus & more')
	assert.equal(cleanAlt('Red offers main desktop banner'), 'Red offers')
	assert.equal(cleanAlt('pablo'), '')
	assert.equal(cleanAlt('img_23'), '')
	assert.equal(cleanAlt('hero-banner-ar.webp'), '')
	assert.equal(cleanAlt(undefined), '')
	assert.equal(cleanAlt('عروض ريد'), 'عروض ريد')
})

// ---- router on the frozen KB (config/kb/vodafone-eg.manifest.json) ----

const kb = buildKbIndex(JSON.parse(fs.readFileSync(path.join(ROOT, 'config/kb/vodafone-eg.manifest.json'), 'utf8')))
const settings = { acceptAt: site.router.acceptAt, clarifyAt: site.router.clarifyAt, topK: site.router.topK, agentEnabled: true }
const cases = (f: string): EvalCase[] => YAML.parse(fs.readFileSync(path.join(ROOT, 'tests/fixtures', f), 'utf8'))
const session = (lang = 'ar', extra = {}): any => ({ id: 's', siteId: 'vodafone-eg', lang, createdAt: '', updatedAt: '', turns: [], usage: { agentSteps: 0, agentTokens: 0 }, ...extra })
const BUNDLES = { url: 'https://web.vodafone.com.eg/ar/mobile-internet-bundles' }

test('router: every Vodafone tuning case routes correctly', async () => {
	const s = await evaluate(cases('vodafone-utterances.yaml'), kb, settings)
	const failed = s.rows.filter((r) => !r.ok).map((r) => `${r.case.say}: ${r.failures.join('; ')}`)
	assert.deepEqual(failed, [])
	assert.ok(s.latency.p95 < 30, `p95 ${s.latency.p95} ms`)
})

test('router: Vodafone held-out destination accuracy stays at or above 90% (floor, not target)', async () => {
	const s = await evaluate(cases('vodafone-utterances-heldout.yaml'), kb, settings)
	const d = s.byField.dest
	assert.ok(d.correct / d.checked >= 0.9, `destination ${d.correct}/${d.checked}`)
})

test('router: "what is on this page" answers from the page, without moving', async () => {
	const say = 'إيه اللي في الصفحة دي'
	const u = await understand({ utterance: say, pageId: 'web.mobile-internet-bundles', session: session(), kb, settings })
	const { plan } = buildPlan({ u, utterance: say, session: session(), kb, page: BUNDLES, turnId: 't', agent: { enabled: true, maxSteps: 12 } })
	assert.equal(u.intent, 'describe')
	assert.equal(plan.steps.some((s) => s.op === 'navigate'), false)
	assert.match(JSON.stringify(plan), /باقات ڤودافون بلس/)
})

test('router: subscribing on a public page shows the button and stops (no click, no sign-in)', async () => {
	const s = session('ar', { last: { kind: 'item', destinationId: 'web.mobile-internet-bundles.vodafone-plus', collectionId: 'web.mobile-internet-bundles.vodafone-plus', key: '#2' } })
	const u = await understand({ utterance: 'أشترك فيها إزاي', pageId: 'web.mobile-internet-bundles', session: s, kb, settings })
	const { plan } = buildPlan({ u, utterance: 'أشترك فيها إزاي', session: s, kb, page: BUNDLES, turnId: 't', agent: { enabled: true, maxSteps: 12 } })
	assert.deepEqual(
		plan.steps.map((x) => x.op),
		['pickItem', 'spotlight', 'confirm'],
	)
	// Cards on the live page have no id attribute: the item is found again by position.
	assert.deepEqual((plan.steps[0] as any).select, { by: 'key', key: '#2' })
})

// ---- the demo conversation of 2026-10-23 (offers, "buy the 400 mega offer", "open a business") ----

const routerFor = (env: Record<string, string> = {}) =>
	createRouter({ platform: loadPlatformConfig({ ...env, VG_SECRET: 'test' }), sites: new Map([[site.id, site]]), kb: { get: async () => kb } as never, tracer: { event: async () => {} } as never })
async function converse(router: ReturnType<typeof createRouter>, says: string[], url: string) {
	const s = session()
	const out = []
	for (const say of says) {
		const r = await router.turn({ siteId: site.id, session: s, utterance: say, page: { url } }, { trace: {} } as never)
		if (r.last) s.last = r.last
		s.turns.push(r.turn)
		out.push(r)
	}
	return out
}
const PROMOTIONS = 'https://web.vodafone.com.eg/ar/%D8%A7%D9%84%D8%B9%D8%B1%D9%88%D8%B6'

test('router: with no language model configured, nothing is routed to the agent', async () => {
	const [best, business] = await converse(routerFor(), ['اختر لي افضل عرض', 'عايز افتح بيزنس'], PROMOTIONS)
	for (const r of [best, business]) {
		assert.notEqual(r.plan.meta.route, 'agent')
		assert.equal(r.plan.steps.some((x) => x.op === 'agent'), false)
	}
	const [withModel] = await converse(routerFor({ VG_LLM_BASE_URL: 'http://127.0.0.1:1', VG_LLM_MODEL: 'm' }), ['اختر لي افضل عرض'], PROMOTIONS)
	assert.equal(withModel.plan.meta.route, 'agent')
})

test('router: "buy the 400 mega offer" shows the offer card, with no "A or B?" against the page wrapper', async () => {
	const [r] = await converse(routerFor(), ['اشتري عرض ال ٤٠٠ ميجا'], PROMOTIONS)
	assert.equal(r.plan.meta.route, 'replay')
	assert.equal(r.plan.meta.destinationId, 'web.promotions.400-megabyte.visual')
	// The picture's alt text is "400 mega": the card around it is read instead of echoing it.
	const spot = r.plan.steps.find((x) => x.op === 'spotlight') as any
	assert.match(spot.target.css[0], /> a\.tiles-link$/)
	assert.ok(spot.read)
	assert.equal(r.plan.steps.some((x) => x.op === 'say' && /^400 mega\.?$/i.test(x.text)), false)
	assert.equal(kb.manifest.destinations.some((d) => d.id.endsWith('.content') && d.target?.css[0] === '#content'), false)
})

test('router: two half-matches on different words are not offered as "A or B?"', async () => {
	const [r] = await converse(routerFor(), ['عايز افتح بيزنس'], PROMOTIONS)
	assert.notEqual(r.plan.meta.route, 'clarify')
})

test('router: a typed answer to "A or B?" picks the option and keeps the question\'s language', async () => {
	const router = routerFor()
	const s = session()
	const ask = { id: 't1', utterance: 'اشتري عرض ال ٤٠٠ ميجا', lang: 'ar', intent: 'navigate', route: 'clarify', options: ['web.promotions.400-megabyte.visual', 'web.promotions.check-out-our-latest-offers-and-choose-y'], at: '' }
	s.turns.push(ask)
	const r = await router.turn({ siteId: site.id, session: s, utterance: '400 mega', page: { url: PROMOTIONS } }, { trace: {} } as never)
	assert.equal(r.understanding.decision.provider, 'user-choice')
	assert.equal(r.plan.meta.destinationId, 'web.promotions.400-megabyte.visual')
	assert.equal(r.plan.lang, 'ar')
	assert.equal(r.plan.steps.some((x) => x.op === 'navigate'), false, 'stays on the Arabic page')
})

test('router: "company offers" finds the Vodafone Business Red deal, written in English on the site', async () => {
	const [r] = await converse(routerFor(), ['اخر عروض الشركات'], 'https://web.vodafone.com.eg/ar/home')
	assert.equal(r.plan.meta.route, 'replay')
	assert.equal(r.plan.meta.destinationId, 'web.exclusive-benefits.vodafone-red-business-2024-may-deal')
	assert.ok(r.plan.steps.some((x) => x.op === 'spotlight' && x.read), 'the deal is read, not just its page opened')
})
