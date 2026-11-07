/** Ingests the fixture site end to end: real browser, real Postgres, a stand-in vision model. */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { after, before, test } from 'node:test'

import { chromium, type Browser } from 'playwright'

import { runIngest } from '#jobs/ingest-lib.ts'
import { loadPlatformConfig, loadSiteConfig, ROOT, type SiteConfig } from '#shared/config.ts'
import { PostgresStore } from '#shared/store/index.ts'

import { startSiteServers } from '../../tools/site-server.ts'
import { TEST_DATABASE_URL } from '../helpers/env.ts'
import { type MockServer, startMockVision } from '../helpers/mock-vision.ts'

let browser: Browser
let store: PostgresStore
let site: SiteConfig
let servers: { close: () => Promise<void> }
let vision: MockServer
const dataDir = fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', 'vg-ingest-'))

before(async () => {
	site = loadSiteConfig(path.join(ROOT, 'config/sites/demo-telco.yaml'))
	servers = await startSiteServers(site, { gatewayUrl: 'http://localhost:4400', inject: false })
	browser = await chromium.launch()
	store = await PostgresStore.connect(TEST_DATABASE_URL, { max: 4 })
	await store.truncateAll()
	vision = await startMockVision()
})
after(async () => {
	await browser?.close()
	await servers?.close()
	await store?.close()
	await vision?.close()
})

const platform = () => ({ ...loadPlatformConfig({ VG_DATA_DIR: dataDir } as NodeJS.ProcessEnv), vision: { baseUrl: vision.url, model: 'mock-vision' } })

// When a re-crawl of the unchanged fixture comes out "changed", say what changed: the paths where the
// new manifest differs from the active one (version fields aside). CI hits this now and then (B-22).
// `active` is the manifest that was active before the re-crawl (a changed re-crawl activates its own).
function whyChanged(active: unknown, report: Awaited<ReturnType<typeof runIngest>>): string {
	if (report.unchanged) return ''
	const out: string[] = []
	const walk = (a: unknown, b: unknown, at: string) => {
		if (out.length >= 12 || at === '.version') return
		if (a && b && typeof a === 'object' && typeof b === 'object') {
			for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) walk((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], `${at}.${k}`)
		} else if (JSON.stringify(a) !== JSON.stringify(b)) out.push(`${at}: ${JSON.stringify(a)?.slice(0, 120)} -> ${JSON.stringify(b)?.slice(0, 120)}`)
	}
	walk(active, report.manifest, '')
	return `the re-crawl changed: ${out.join('; ') || '(no difference outside .version)'}; crawl errors ${JSON.stringify(report.crawl.errors)}`
}

test('the fixture site crawls into a valid, activated manifest', async () => {
	const report = await runIngest({ site, platform: platform(), store, browser, activate: true })
	assert.equal(report.issues.filter((i) => i.level === 'error').length, 0, JSON.stringify(report.issues))
	assert.equal(report.crawl.errors.length, 0)
	assert.equal(report.crawl.pages, 14)
	assert.ok(report.activated)
	const m = (await store.getActiveKb('demo-telco'))!
	assert.equal(m.version.id, report.versionId)

	// pages are paired across languages through hreflang
	const bundles = m.pages.find((p) => p.id === 'web.bundles')!
	assert.deepEqual(Object.keys(bundles.variants).sort(), ['ar', 'en'])
	assert.equal(m.pages.find((p) => p.id === 'app.account')?.requiresAuth, true)

	// collections with typed fields, and the hidden tab as a reveal step
	const home = m.collections.find((c) => c.id === 'web.bundles.home-internet')!
	assert.equal(home.keyAttr, 'data-bundle')
	assert.deepEqual(Object.keys(home.fields).sort(), ['data', 'name', 'price'])
	const homeDest = m.destinations.find((d) => d.id === 'web.bundles.home-internet')!
	assert.equal(homeDest.kind, 'collection')
	assert.equal(homeDest.reveal?.[0].css[0], '#tab-home')
	assert.equal(homeDest.reveal?.[0].text?.ar, 'الإنترنت المنزلي')

	// items paired across languages by key
	const item = m.destinations.find((d) => d.id === 'web.bundles.mobile-internet.mi-10')!
	assert.deepEqual(item.labels, { ar: ['سوبر ١٠'], en: ['Super 10'] })

	// FAQ answers are revealed by their summary
	const faq = m.destinations.find((d) => d.id === 'web.help.faq-balance')!
	assert.equal(faq.kind, 'faq')
	assert.equal(faq.reveal?.[0].css[0], '#faq-balance > summary')

	// commit point found by the crawler, never clickable by the guide
	const pay = m.destinations.find((d) => d.kind === 'action' && d.commit)!
	assert.equal(pay.target?.css[0], '#confirm-pay')

	// visuals: image, canvas, webgl and svg, described by the vision model
	const kinds = m.visuals.map((v) => v.kind).sort()
	assert.deepEqual(kinds, ['canvas', 'image', 'svg', 'webgl'])
	const chart = m.visuals.find((v) => v.kind === 'canvas')!
	assert.equal(chart.source, 'vision')
	assert.match(chart.description.en, /Cairo 48 Mbps/)
	assert.match(chart.description.ar, /القاهرة/)

	// curated overlay merged: flows, watchable sections, answer templates, lexicon
	assert.equal(m.flows[0].id, 'subscribe')
	assert.equal(m.destinations.find((d) => d.id === 'web.offers.weekend-offer')?.watchable, true)
	assert.ok(m.destinations.find((d) => d.id === 'app.account.data-balance')?.answer?.template?.ar)
	assert.ok(m.lexicon.synonyms.length >= 5)
})

test('an unchanged clone publishes nothing and the vision cache is reused', async () => {
	const calls = vision.calls.length
	const active = await store.getActiveKb(site.id)
	const report = await runIngest({ site, platform: platform(), store, browser, activate: true })
	assert.equal(report.unchanged, true, whyChanged(active, report))
	assert.equal(report.published, false)
	assert.equal(vision.calls.length, calls, 'no new vision calls: every image hash was cached')
	assert.equal(report.describe.cacheHits, 8)
})

// B-22: one element screenshot that timed out (a loaded machine) made an unchanged site publish a new
// version without that picture's description; the full test run failed the test above now and then.
test('a screenshot that times out once is retried, so an unchanged clone still publishes nothing', async () => {
	const probe = await browser.newPage()
	const proto = Object.getPrototypeOf(probe.locator('body'))
	await probe.close()
	const shot = proto.screenshot
	let fail = 1
	proto.screenshot = async function (this: unknown, ...a: unknown[]) {
		if (fail > 0) {
			fail--
			throw new Error('locator.screenshot: Timeout 5000ms exceeded (test)')
		}
		return shot.apply(this, a)
	}
	try {
		const calls = vision.calls.length
		const active = await store.getActiveKb(site.id)
		const report = await runIngest({ site, platform: platform(), store, browser, activate: true })
		assert.equal(fail, 0, 'the injected timeout was hit')
		assert.equal(report.unchanged, true, whyChanged(active, report))
		assert.equal(report.published, false)
		assert.equal(vision.calls.length, calls)
	} finally {
		proto.screenshot = shot
	}
})

test('editing a clone produces a new version with a diff', async () => {
	const file = path.join(ROOT, 'fixtures/sites/demo-telco/web/en/offers.html')
	const original = fs.readFileSync(file, 'utf8')
	try {
		fs.writeFileSync(file, original.replace('<section class="offer" id="students-offer">', '<section class="offer" id="family-offer"><h2>Family offer</h2><p>Share 100 GB across four lines.</p></section>\n\t<section class="offer" id="students-offer">'))
		const report = await runIngest({ site, platform: platform(), store, browser, activate: false })
		assert.equal(report.published, true)
		assert.equal(report.activated, false, 'new versions wait for an explicit activation')
		assert.ok(report.diff?.added.includes('web.offers.family-offer'), JSON.stringify(report.diff))
	} finally {
		fs.writeFileSync(file, original)
	}
})
