/**
 * The experience layer on the saved Vodafone pages (ADR-0048, phase 1 of the live plan), with the
 * clone not mounted, so every page is Vodafone's own markup:
 * - aixc.js loads beside guide.js on every saved CMS page in both languages and finds its page
 *   (#main-content, language, regions inserted and hidden); not on the /spa/ app, not with ?aixc=off;
 * - it shifts nothing of Vodafone's page (geometry with the layer and with ?aixc=off);
 * - a failure at any step removes it and leaves the page as with ?aixc=off, with no page error;
 * - it names the sections from GET /v1/page-map (ADR-0049), sending only the page's address, and reads
 *   the page without the map when it fails or does not come.
 */
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'

import type { Page } from 'playwright'

import { CMS_PAGES, geometry, type Layer, type LayerGateway, launchLayer, layerState, open, startLayerGateway, V, watch } from './vodafone-layer.ts'

// On the live-page kit (vodafone-layer.ts): offline replay, so nothing reaches Vodafone's site.
const PORT = 4475
let gw: LayerGateway
let DEMOS: string[] = []

before(async () => {
	gw = await startLayerGateway(PORT)
	DEMOS = Object.entries(gw.site.experiences.demos)
		.filter(([, on]) => on)
		.map(([name]) => name)
})

after(async () => {
	await gw?.close()
})

/** The browser as these tests use it: its page, its context and close(), and what reached the network. */
const launch = async (initScripts: string[] = [], o: { experiences?: boolean } = {}): Promise<Layer & { context: Layer['b']['context'] }> => {
	const l = await launchLayer(gw, { initScripts, experiences: o.experiences, viewport: { width: 1366, height: 860 } })
	return { ...l, context: l.b.context }
}

test('aixc.js loads on every saved CMS page in both languages and builds its hidden regions; not on /spa/ or with ?aixc=off', async () => {
	assert.ok(CMS_PAGES.length >= 13, `saved CMS pages: ${CMS_PAGES.length}`)
	const b = await launch()
	try {
		const seen = watch(b.page)
		for (const pathname of CMS_PAGES) {
			await open(b.page, pathname, '?aixc-debug')
			const s = await layerState(b.page)
			const lang = pathname.startsWith('/ar/') ? 'ar' : 'en'
			assert.equal(s.tag, true, `${pathname}: the loader added aixc.js`)
			assert.equal(s.state, 'ready', `${pathname}: the layer is ready (${s.problem ?? ''})`)
			assert.equal(s.lang, lang, `${pathname}: language`)
			assert.equal(s.dir, lang === 'ar' ? 'rtl' : 'ltr', `${pathname}: direction`)
			assert.deepEqual(s.regions, { output: { hidden: true, afterMain: true, marked: true }, viewbar: { hidden: true, beforeMain: true } }, `${pathname}: regions beside #main-content, hidden`)
			assert.equal(s.mainHidden, false, `${pathname}: Vodafone's content is shown`)
			// Phase 2: the layer read the page's cards and tagged them (the FAQ-only page has none to read).
			if (/wireless-net/.test(pathname)) assert.equal(s.tags, 0, `${pathname}: nothing to tag`)
			else {
				assert.ok(s.tags > 0, `${pathname}: Vodafone's cards tagged`)
				assert.ok((s.coverage ?? 0) >= 0.9, `${pathname}: coverage ${s.coverage}`)
			}
			if (/\/services$/.test(pathname)) assert.equal(s.destinations, 6, `${pathname}: every section named by the knowledge base (GET /v1/page-map)`)
			assert.equal(s.demo, true, `${pathname}: the loader marks the page as a demo`)
			assert.deepEqual(s.demos, DEMOS, `${pathname}: the enabled demos reach the layer`)
		}
		await open(b.page, '/en/home', '?aixc-demo=off&aixc-debug')
		assert.equal((await layerState(b.page)).demo, false, '?aixc-demo=off: no demo-data actions')
		await open(b.page, '/spa/storeLocator', '?aixc-debug')
		const spa = await layerState(b.page)
		assert.equal(spa.tag, false, 'no layer on the /spa/ app (no #main-content)')
		assert.equal(spa.added, 0)
		await open(b.page, '/en/home', '?aixc=off&aixc-debug')
		const off = await layerState(b.page)
		assert.equal(off.tag, false, '?aixc=off: the loader leaves it out')
		assert.equal(off.added, 0)
		assert.deepEqual(seen.pageErrors, [], 'no page errors')
		assert.deepEqual(seen.layer.filter((l) => !l.startsWith('info:')), [], 'the layer logged no warning or error')
		assert.deepEqual(b.reached, [], 'nothing reached Vodafone\'s site')
	} finally {
		await b.close()
	}
})

test('the page map (ADR-0049): only the page\'s address is sent; without it (an error, no network, no answer in 2 s) the page is read all the same', async () => {
	const b = await launch()
	try {
		const seen = watch(b.page)
		const asked: string[] = []
		const referrers: (string | undefined)[] = []
		b.page.on('request', (r) => {
			if (new URL(r.url()).pathname !== '/__vg/v1/page-map') return
			asked.push(r.url())
			referrers.push(r.headers().referer)
		})
		await open(b.page, '/en/services', '?aixc-debug&utm_source=mail&msisdn=0100#offers')
		let s = await layerState(b.page)
		assert.equal(s.destinations, 6)
		assert.equal(s.pageMap?.pageId, 'web.services', 'the layer says which map it used')
		assert.equal(asked.length, 1, 'one request')
		const sent = new URL(asked[0])
		assert.equal(sent.searchParams.get('url'), `${V}/en/services`, 'the page\'s address only: no query, no fragment')
		assert.deepEqual([...sent.searchParams.keys()], ['url'])
		assert.deepEqual(referrers, [undefined], 'no referrer either (it would carry the query)')
		const ready = async (pathname: string) => {
			const t0 = Date.now()
			await b.page.goto(`${V}${pathname}?aixc-debug`, { waitUntil: 'load' })
			await b.page.waitForFunction(() => (window as unknown as { __aixc?: { state: string } }).__aixc?.state === 'ready', null, { timeout: 8_000 })
			return Date.now() - t0
		}
		const cases: [string, Parameters<Page['route']>[1]][] = [
			['a server error', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"boom"}' })],
			['a 404 (the layer off for the site)', (route) => route.fulfill({ status: 404, contentType: 'application/json', body: '{"code":"experiences_off"}' })],
			['not JSON', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<html>' })],
			['no network', (route) => route.abort()],
		]
		for (const [name, handler] of cases) {
			await b.page.route('**/__vg/v1/page-map**', handler)
			await ready('/en/services')
			s = await layerState(b.page)
			assert.deepEqual([s.state, s.destinations, s.tags > 0, s.coverage, s.pageMap], ['ready', 0, true, 1, null], `${name}: the page is read without the map`)
			await b.page.unroute('**/__vg/v1/page-map**')
		}
		// No answer: the layer waits 2 s at most.
		await b.page.route('**/__vg/v1/page-map**', () => {})
		const took = await ready('/en/services')
		s = await layerState(b.page)
		assert.deepEqual([s.state, s.destinations, s.tags > 0, s.pageMap], ['ready', 0, true, null], 'no answer: read without the map')
		assert.ok(took >= 2000 && took < 6000, `ready after the 2 s limit (${took} ms)`)
		await b.page.unroute('**/__vg/v1/page-map**')
		assert.deepEqual(seen.pageErrors, [], 'no page errors')
		assert.deepEqual(seen.layer.filter((l) => !l.startsWith('info:')), [], 'the layer logged no warning or error')
	} finally {
		await b.close()
	}
})

test('Vodafone\'s page changes after load: the layer reads it again and keeps its marks off carousel copies (AIXC-28)', async () => {
	const b = await launch()
	try {
		const seen = watch(b.page)
		await open(b.page, '/en/services', '?aixc-debug')
		const state = () =>
			b.page.evaluate(() => {
				const l = (window as unknown as { __aixc: { state: string; reads: number; model: { sections: { items: unknown[] }[] } } }).__aixc
				return { state: l.state, reads: l.reads, items: l.model.sections.flatMap((x) => x.items).length, onCopies: document.querySelectorAll('.cloned [data-aixc-item]').length, marks: document.querySelectorAll('[data-aixc-item]').length }
			})
		const first = await state()
		assert.deepEqual([first.state, first.reads, first.onCopies], ['ready', 1, 0])
		// What Owl does on the live site: copies of the cards, made from their markup, in .owl-item.cloned wrappers.
		const copied = await b.page.evaluate(() => {
			const cards = [...document.querySelectorAll('#main-content [data-aixc-item]')].slice(0, 3)
			for (const c of cards) c.insertAdjacentHTML('afterend', `<div class="owl-item cloned">${c.outerHTML}</div>`)
			return document.querySelectorAll('.cloned [data-aixc-item]').length
		})
		assert.equal(copied, 3)
		await b.page.waitForFunction(() => (window as unknown as { __aixc: { reads: number } }).__aixc.reads >= 2, null, { timeout: 5_000 })
		const second = await state()
		assert.deepEqual([second.state, second.items, second.onCopies, second.marks], ['ready', first.items, 0, first.marks], 'same model, no mark on a copy')
		// Stopped, it watches nothing and leaves no mark.
		await b.page.evaluate(() => (window as unknown as { __aixc: { guard: { stop(): void } } }).__aixc.guard.stop())
		await b.page.evaluate(() => document.querySelector('#main-content .card-action')!.insertAdjacentHTML('afterend', '<div class="card-action"><a href="/en/x"><div class="card-action-body"><h4>X</h4></div></a></div>'))
		await b.page.waitForTimeout(600)
		assert.deepEqual(await b.page.evaluate(() => [(window as unknown as { __aixc: { reads: number } }).__aixc.reads, document.querySelectorAll('[data-aixc-item], [data-aixc-section]').length]), [second.reads, 0])
		assert.deepEqual(seen.pageErrors, [], 'no page errors')
		assert.deepEqual(seen.layer.filter((l) => !l.startsWith('info:')), [], 'the layer logged no warning or error')
	} finally {
		await b.close()
	}
})

test('the layer shifts nothing of Vodafone\'s page (geometry with it and with ?aixc=off)', async () => {
	const b = await launch()
	try {
		for (const pathname of ['/en/home', '/ar/home', '/en/services', '/en/mobile-internet-bundles', '/ar/vodafone-red1']) {
			await open(b.page, pathname, '?aixc=off')
			const without = await geometry(b.page)
			await open(b.page, pathname)
			assert.equal((await layerState(b.page)).regions.output?.hidden, true, `${pathname}: the layer is on the page`)
			const withLayer = await geometry(b.page)
			assert.deepEqual(withLayer, without, `${pathname}: the same geometry`)
		}
	} finally {
		await b.close()
	}
})

test('a failure at any step removes the layer and leaves the page as with ?aixc=off, with no page error', async () => {
	for (const step of ['start', 'host', 'read', 'ready']) {
		const b = await launch([`window.__AIXC_TEST__ = { failAt: ${JSON.stringify(step)} }`])
		try {
			const seen = watch(b.page)
			await open(b.page, '/en/services', '?aixc=off')
			const without = await geometry(b.page)
			await open(b.page, '/en/services', '?aixc-debug')
			const s = await layerState(b.page)
			assert.equal(s.state, 'failed', `${step}: it loaded, then stopped`)
			assert.equal(s.tag, false, `${step}: even the loader's tag for it is gone`)
			assert.equal(s.failure, 'start', `${step}: the failure is reported against the start`)
			assert.equal(s.added, 0, `${step}: nothing of the layer is left`)
			assert.equal(s.tags, 0, `${step}: no tag left on Vodafone's cards`)
			assert.equal(s.mainHidden, false, `${step}: Vodafone's content is shown`)
			assert.deepEqual(await geometry(b.page), without, `${step}: the page is as without the layer`)
			assert.deepEqual(seen.pageErrors, [], `${step}: no error reached the page`)
			assert.ok(seen.layer.some((l) => l.startsWith('error: [AIXC] start failed')), `${step}: the layer said so (${seen.layer.join(' | ')})`)
		} finally {
			await b.close()
		}
	}
})

test('the layer keeps its own rules where the loader is not there to (?aixc=off, no #main-content, a second copy)', async () => {
	// The loader is off here, so these cases reach the layer itself, as under Vodafone's tag manager.
	const b = await launch([], { experiences: false })
	try {
		const seen = watch(b.page)
		const inject = async () => {
			await b.page.addScriptTag({ type: 'module', url: `${V}/__vg/sdk/aixc/aixc.js` })
			await b.page.waitForFunction(() => (window as unknown as { __aixcStarted?: boolean }).__aixcStarted === true, null, { timeout: 10_000 })
			await b.page.waitForTimeout(200)
		}

		await open(b.page, '/en/home', '?aixc=off&aixc-debug')
		await inject()
		let s = await layerState(b.page)
		assert.equal(s.state, null, '?aixc=off: the layer ran and did nothing')
		assert.equal(s.added, 0)

		await open(b.page, '/spa/storeLocator', '?aixc-debug')
		await inject()
		s = await layerState(b.page)
		assert.equal(s.state, 'idle', 'no #main-content: the layer stays idle')
		assert.match(String(s.problem), /main-content/)
		assert.equal(s.added, 0)

		await open(b.page, '/en/home', '?aixc-debug')
		await b.page.evaluate(() => document.body.append(Object.assign(document.createElement('div'), { id: 'experience-output' })))
		await inject()
		s = await layerState(b.page)
		assert.equal(s.state, 'idle', 'an experience output already on the page: the layer stays idle')
		assert.equal(await b.page.locator('#experience-output').count(), 1, 'it adds no second one')
		assert.equal(s.added, 0)
		assert.equal(s.demo, false, 'a tag without data-aixc-demo is not a demo page')
		assert.deepEqual(seen.pageErrors, [])
	} finally {
		await b.close()
	}
})
