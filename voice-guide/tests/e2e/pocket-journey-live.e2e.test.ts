/**
 * "Your journey" drawn in place, in the experience layer's Pocket, on Vodafone's own pages (live plan
 * phase 3 S10; ADR-0050 §2-§3, ADR-0052; owner decision OD-5, 2026-11-13), on the saved pages with the
 * live-page kit (./vodafone-layer.ts): no clone, nothing reaches the internet.
 *
 * - The pill opens the journey in the album of the page you are on: the URL stays, nothing navigates,
 *   the guide's own sheet stays shut, the rail names this page; also on the page with no cards.
 * - Arabic pages draw it right to left, in Arabic.
 * - Closing the journey and the album lands where the visitor was, with Vodafone's header and footer
 *   as served.
 * - The fallback is never a dead pill: with ?aixc=off, on the /spa/ app, or after a failure (which gives
 *   the claim back and leaves the page as with ?aixc=off), the pill opens the guide's own sheet.
 * - A question chip in the journey sends the trail's hint; no replay data leaves the browser; every
 *   journey node is marked data-vg and data-aixc.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { after, before, test } from 'node:test'

import type { Page } from 'playwright'

import type { Manifest } from '#kb'
import { ensureExperienceProfile } from '#jobs/experience/build.ts'
import { loadPlatformConfig, loadSiteConfig, ROOT } from '#shared/config.ts'

import { createGateway } from '../../services/gateway/server.ts'
import { createServices } from '../../services/index.ts'
import { buildOnce, type Layer, type LayerGateway, launchLayer, open, V, watch } from './vodafone-layer.ts'

const PORT = 4489
let gw: LayerGateway

/**
 * startLayerGateway(PORT, { trail: true }) and the committed experience profile (the trail's verified
 * questions, ADR-0036), as vodafone-pocket.ts loads it: without the profile nothing explored has a
 * question, and the journey offers no chip.
 */
async function startGateway(port: number): Promise<LayerGateway> {
	await buildOnce()
	const platform = loadPlatformConfig({ ...process.env, VG_VOICETUT_URL: '', VG_STORE: 'memory', VG_PORT: String(port), VG_PUBLIC_URL: `http://127.0.0.1:${port}`, VG_RATE_TURNS_PER_MIN: '600', VG_RATE_BURST: '60' })
	const site = loadSiteConfig(path.join(platform.sitesDir, 'vodafone-eg.yaml'))
	site.trail.enabled = true
	const services = await createServices({ platform, sites: new Map([[site.id, site]]) })
	const m = JSON.parse(fs.readFileSync(path.join(ROOT, 'config/kb/vodafone-eg.manifest.json'), 'utf8')) as Manifest
	await services.store.putKbVersion(site.id, m)
	await services.store.activateKb(site.id, m.version.id)
	const committed = JSON.parse(fs.readFileSync(path.join(ROOT, 'config/experience/vodafone-eg.profile.json'), 'utf8'))
	await ensureExperienceProfile(services.store, site, m, committed, () => {})
	const gateway = createGateway({ services })
	await gateway.listen(port)
	return {
		site,
		url: `http://127.0.0.1:${port}`,
		close: async () => {
			await gateway.close()
			await services.close()
		},
	}
}

before(async () => {
	gw = await startGateway(PORT)
})
after(async () => {
	await gw?.close()
})

/* eslint-disable @typescript-eslint/no-explicit-any */
/** The trail allowed before the first page, as vodafone-pocket.ts does. */
const consented = () => `(() => { try { const k = 'vg-trail:${gw.site.siteKey}:consent'; if (location.origin === '${V}' && !localStorage.getItem(k)) localStorage.setItem(k, JSON.stringify({ v: 1, state: 'granted', at: 1, retentionHours: 24 })) } catch {} })()`

async function launch(o: { initScripts?: string[]; reducedMotion?: boolean } = {}) {
	const l = await launchLayer(gw, { reducedMotion: o.reducedMotion ?? true, initScripts: [consented(), ...(o.initScripts || [])] })
	const requests: { url: string; body: string }[] = []
	l.b.context.on('request', (r) => requests.push({ url: r.url(), body: r.postData() || '' }))
	return { ...l, requests }
}

/** Opens a saved page with the layer's debug handle and waits until the trail records on it. */
async function visit(page: Page, path: string, query = '?aixc-debug') {
	await open(page, path, query)
	await page.waitForFunction(() => (window as any).__vgTrailActive?.state?.rec === 'recording', null, { timeout: 20_000 })
	await page.mouse.move(400, 400, { steps: 4 })
	await page.mouse.wheel(0, 300)
	await page.waitForTimeout(1800)
	// Back up: the pill tucks away while the page scrolls down and comes back on the way up.
	await page.mouse.wheel(0, -4000)
	await page.waitForTimeout(400)
}

/** The layer's album is ready to host the journey (the chunk loaded and claimed). */
const hosting = (page: Page) => page.waitForFunction(() => !!(window as any).__aixc?.demos?.pocket?.journey?.(), null, { timeout: 20_000 })

/** Counts the main frame's navigations from now on. */
function navigations(page: Page) {
	const n = { count: 0 }
	page.on('framenavigated', (f) => {
		if (f === page.mainFrame()) n.count++
	})
	return n
}

const journeyOpen = (page: Page) => page.waitForSelector('.pocket-journey-layer:not([hidden])', { timeout: 15_000 })
const sheetOpen = (page: Page) => page.locator('.tr-sheet:not([hidden])').count()

const here = (page: Page) =>
	page.evaluate(() => {
		const w = window as any
		const out = document.getElementById('pocket-output')
		const steps = (w.voiceGuide.trailHost.snapshot().steps as any[]).filter((s) => s.type === 'page')
		return {
			view: w.__aixc?.demos?.pocket?.state?.view ?? null,
			album: !!out && !out.hidden && out.getBoundingClientRect().height > 0,
			pocketView: document.body.dataset.pocketView ?? null,
			rail: document.querySelector('.pocket-journey-rail')?.getAttribute('aria-valuetext') ?? null,
			selected: (document.querySelector('.pocket-journey-step.is-selected') as HTMLElement | null)?.dataset.step ?? null,
			lastPage: steps.at(-1)?.id ?? null,
			pages: steps.length,
			hosted: w.__vgTrailActive?.hosted ?? null,
			trailView: w.__vgTrailActive?.state?.view ?? null,
		}
	})

/** Vodafone's page as a person would get it: #wrapper, the body's and the root's attributes. */
const served = (page: Page) =>
	page.evaluate(() => {
		const attrs = (n: Element) => [...n.attributes].map((a) => `${a.name}=${a.value}`).join(' ')
		return { wrapper: document.getElementById('wrapper')?.outerHTML ?? null, body: attrs(document.body), html: attrs(document.documentElement) }
	})

for (const c of [
	{ path: '/en/vodafone-cash', title: /^Page 2 of 2: Cash/ },
	{ path: '/en/mobile-internet-bundles', title: /^Page 2 of 2: Internet Bundles/ },
	{ path: '/en/wireless-net', title: /^Page 2 of 2: / },
]) {
	test(`"Your journey" opens in place in the layer's Pocket on ${c.path}: same URL, no navigation, no sheet of the guide (S10)`, async () => {
		const l = await launch()
		try {
			const seen = watch(l.page)
			await visit(l.page, '/en/home')
			await visit(l.page, c.path)
			await hosting(l.page)
			const url = l.page.url()
			const navs = navigations(l.page)
			await l.page.locator('.tr-pill').click()
			await journeyOpen(l.page)
			await l.page.waitForTimeout(600)
			const s = await here(l.page)
			assert.equal(l.page.url(), url, 'the URL is unchanged')
			assert.equal(navs.count, 0, 'no navigation')
			assert.equal(s.view, 'pocket', 'the page turned to the Pocket')
			assert.equal(s.album, true, "the layer's album shows")
			assert.equal(await sheetOpen(l.page), 0, "the guide's own sheet is not open")
			assert.equal(await l.page.locator('.tr-pill').isHidden(), true, 'the pill steps aside while the journey is open')
			assert.equal(s.hosted, true, 'the page hosts the journey (a claim)')
			assert.equal(s.pages, 2)
			assert.match(s.rail ?? '', c.title, `the rail names this page: ${s.rail}`)
			assert.equal(s.selected, s.lastPage, 'the selected step is the page you are on')
			assert.equal(await l.page.locator('.pocket-journey-layer').getAttribute('data-mode'), 'journey')
			assert.deepEqual(seen.pageErrors, [], 'no page errors')
			assert.ok(!seen.layer.some((x) => x.startsWith('error:')), `no layer error: ${seen.layer.join(' | ')}`)
			assert.deepEqual(l.reached, [], 'nothing reached the internet')
		} finally {
			await l.close()
		}
	})
}

test('Arabic: after /ar/home and /ar/vodafone-cash the pill opens the journey in place, right to left, in Arabic (S10)', async () => {
	const l = await launch()
	try {
		await visit(l.page, '/ar/home')
		await visit(l.page, '/ar/vodafone-cash')
		await hosting(l.page)
		const url = l.page.url()
		const navs = navigations(l.page)
		await l.page.locator('.tr-pill').click()
		await journeyOpen(l.page)
		await l.page.waitForTimeout(600)
		assert.equal(l.page.url(), url)
		assert.equal(navs.count, 0)
		assert.equal(await sheetOpen(l.page), 0)
		assert.equal(await l.page.evaluate(() => document.documentElement.dir), 'rtl')
		const look = await l.page.evaluate(() => ({
			back: document.querySelector('#pocket-output .pocket-back')?.textContent ?? null,
			dir: getComputedStyle(document.querySelector('.pocket-journey-rail')!).direction,
			rail: document.querySelector('.pocket-journey-rail')!.getAttribute('aria-valuetext')!,
		}))
		assert.match(look.back ?? '', /ارجع للصفحة/, `the album's back button: ${look.back}`)
		assert.equal(look.dir, 'rtl', 'the rail runs right to left')
		assert.match(look.rail, /[؀-ۿ]/, `the journey speaks Arabic: ${look.rail}`)
	} finally {
		await l.close()
	}
})

test("closing the journey and the album lands where the visitor was, with Vodafone's header and footer as served (S10)", async () => {
	const l = await launch()
	try {
		await visit(l.page, '/en/home')
		await visit(l.page, '/en/vodafone-cash')
		await hosting(l.page)
		// Down the page, then a little back up, which brings the pill back.
		await l.page.evaluate(() => scrollTo(0, 660))
		await l.page.waitForTimeout(300)
		await l.page.evaluate(() => scrollTo(0, 600))
		await l.page.waitForTimeout(300)
		const before = await l.page.evaluate(() => ({ y: scrollY, header: document.getElementById('header')?.outerHTML ?? null, footer: document.querySelector('footer')?.outerHTML ?? null }))
		assert.ok(before.header && before.footer, 'the page has a header and a footer')
		await l.page.locator('.tr-pill').click()
		await journeyOpen(l.page)
		await l.page.waitForTimeout(400)
		// From the journey's slider, Escape closes the journey first; the album's own button turns the page back.
		await l.page.locator('.pocket-journey-rail').focus()
		await l.page.keyboard.press('Escape')
		await l.page.waitForSelector('.pocket-journey-layer', { state: 'hidden' })
		assert.equal((await here(l.page)).view, 'pocket', 'Escape closes the journey, the album stays')
		assert.equal(await l.page.evaluate(() => document.activeElement?.classList.contains('pocket-journey-cta')), true, 'focus returns to "Your journey"')
		await l.page.locator('#pocket-output .pocket-back:not(.pocket-journey-cta)').first().click()
		await l.page.waitForFunction(() => (window as any).__aixc.demos.pocket.state.view === 'page' && !(window as any).__aixc.demos.pocket.state.busy, null, { timeout: 10_000 })
		await l.page.waitForTimeout(400)
		const afterClose = await l.page.evaluate(() => ({ y: scrollY, header: document.getElementById('header')?.outerHTML ?? null, footer: document.querySelector('footer')?.outerHTML ?? null }))
		assert.ok(Math.abs(afterClose.y - before.y) <= 2, `where the visitor was: ${before.y} then ${afterClose.y}`)
		assert.equal(afterClose.header, before.header, "Vodafone's header is as served")
		assert.equal(afterClose.footer, before.footer, "Vodafone's footer is as served")
		assert.equal(await l.page.locator('.tr-pill').isVisible(), true, 'the pill is back')
	} finally {
		await l.close()
	}
})

test("the fallback is never a dead pill: with ?aixc=off and on the /spa/ app the pill opens the guide's own sheet, in place (OD-5)", async () => {
	const l = await launch()
	try {
		await visit(l.page, '/en/home')
		for (const [path, query] of [
			['/en/vodafone-cash', '?aixc=off'],
			['/spa/storeLocator', ''],
		]) {
			await visit(l.page, path, query)
			assert.equal(await l.page.evaluate(() => document.querySelectorAll('[data-aixc]').length), 0, `${path}${query}: no layer`)
			const url = l.page.url()
			const navs = navigations(l.page)
			assert.equal(await sheetOpen(l.page), 0)
			await l.page.locator('.tr-pill').click()
			await l.page.waitForTimeout(1200)
			assert.equal(l.page.url(), url, `${path}${query}: the URL is unchanged`)
			assert.equal(navs.count, 0, `${path}${query}: no navigation`)
			assert.equal(await sheetOpen(l.page), 1, `${path}${query}: the guide's own sheet opens`)
			assert.equal(await l.page.locator('.tr-sheet').isVisible(), true, `${path}${query}: and shows`)
		}
	} finally {
		await l.close()
	}
})

for (const failAt of ['journey-open', 'journey-claim']) {
	test(`a failure at ${failAt} gives the journey back: the layer goes, the page is as with ?aixc=off, the pill opens the guide's own sheet (S10)`, async () => {
		const l = await launch({ initScripts: [`window.__AIXC_TEST__ = { failAt: ${JSON.stringify(failAt)} }`] })
		try {
			await visit(l.page, '/en/vodafone-cash', '?aixc=off')
			const without = await served(l.page)
			const seen = watch(l.page)
			await visit(l.page, '/en/home')
			await visit(l.page, '/en/vodafone-cash')
			const url = l.page.url()
			const navs = navigations(l.page)
			if (failAt === 'journey-open') {
				await hosting(l.page)
				await l.page.locator('.tr-pill').click()
			}
			await l.page.waitForFunction(() => (window as any).__aixc?.state === 'failed', null, { timeout: 15_000 })
			await l.page.waitForTimeout(400)
			const failure = await l.page.evaluate(() => (window as any).__aixc.failure)
			assert.match(failure?.message ?? '', new RegExp(failAt), `the error is the one thrown: ${JSON.stringify(failure)}`)
			assert.equal(await l.page.evaluate(() => document.querySelectorAll('[data-aixc]').length), 0, 'nothing of the layer is left')
			assert.equal(await l.page.evaluate(() => (window as any).__vgTrailActive.hosted), false, 'the claim is given back')
			assert.equal(await sheetOpen(l.page), 0, 'nothing opened by itself')
			assert.deepEqual(await served(l.page), without, 'the page is as with ?aixc=off')
			assert.ok(seen.layer.some((x) => x.startsWith('error: [AIXC]')), `the layer said so (${seen.layer.join(' | ')})`)
			await l.page.locator('.tr-pill').click()
			await l.page.waitForTimeout(1200)
			assert.equal(await sheetOpen(l.page), 1, "the next press opens the guide's own sheet")
			assert.equal(await l.page.locator('.tr-sheet').isVisible(), true)
			assert.equal(l.page.url(), url, 'the URL is unchanged')
			assert.equal(navs.count, 0, 'no navigation')
			assert.deepEqual(seen.pageErrors, [], 'no error reached the page')
		} finally {
			await l.close()
		}
	})
}

/**
 * Rests the pointer on one card or link of each of the page's first sections, as someone reading them
 * would. (Random positions moved the pointer between items and sometimes left the trail with no dwell on
 * any of them: a flake from S11 on. A fixed spot of the section missed the items altogether.)
 */
async function read(l: Layer, ms: number) {
	const boxes = await l.page.evaluate(() =>
		[...(document.getElementById('main-content')?.children ?? [])]
			.map((n, index) => ({ index, r: n.getBoundingClientRect() }))
			.filter(({ r }) => r.height > 120 && r.width > 200)
			.slice(0, 3)
			.map(({ index, r }) => ({ index, y: r.top + scrollY, h: r.height, x: r.left, w: r.width })),
	)
	for (const b of boxes) {
		await l.page.evaluate((y) => scrollTo(0, Math.max(0, y - 120)), b.y)
		// The first visible card or link of the section, now in view; else the old spot.
		const at = await l.page.evaluate((index) => {
			const section = document.getElementById('main-content')?.children[index]
			const items = [...(section?.querySelectorAll('[data-aixc-item], a[href]') ?? [])]
			for (const item of items) {
				const r = item.getBoundingClientRect()
				if (r.width > 80 && r.height > 40 && r.top >= 130 && r.bottom <= innerHeight - 10 && r.left >= 0 && r.right <= innerWidth) return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
			}
			return null
		}, b.index)
		const x = at?.x ?? b.x + b.w * 0.5
		const y = at?.y ?? 200 + Math.min(b.h, 280) * 0.25
		const end = Date.now() + ms
		let drift = 0
		while (Date.now() < end) {
			drift = (drift + 1) % 3
			await l.page.mouse.move(x + drift, y + drift, { steps: 2 })
			await l.page.waitForTimeout(250)
		}
	}
	await l.page.evaluate(() => scrollTo(0, 0))
	await l.page.waitForTimeout(2500) // the 2 s flush
}

test("Arabic: the journey's question chip sends the trail's hint; no replay data leaves; every journey node is marked data-vg and data-aixc (S10)", async () => {
	const l = await launch()
	try {
		// Arabic: the committed profile's verified questions for Vodafone Cash's sections are in Arabic
		// (the English ones did not pass verification), so this is where the saved replay offers a chip.
		await visit(l.page, '/ar/home')
		await visit(l.page, '/ar/vodafone-cash')
		await read(l, 4500)
		await hosting(l.page)
		await l.page.locator('.tr-pill').click()
		await journeyOpen(l.page)
		await l.page.waitForTimeout(800)

		const marks = await l.page.evaluate(() => {
			const all = [...document.querySelectorAll('.pocket-journey, .pocket-journey-layer, .pocket-journey-cta')]
			return { n: all.length, unmarked: all.filter((el) => !el.hasAttribute('data-vg') || !el.hasAttribute('data-aixc')).map((el) => el.className) }
		})
		assert.ok(marks.n >= 3, `the journey's nodes are there (${marks.n})`)
		assert.deepEqual(marks.unmarked, [], 'every journey node carries data-vg and data-aixc')

		// This page's memory: what was explored on it, with its verified questions.
		await l.page.locator('.pocket-journey-rail').focus()
		await l.page.keyboard.press('End')
		await l.page.waitForSelector('.pocket-journey-note', { timeout: 15_000 }).catch(() => {})
		await l.page.waitForTimeout(400)
		const explored = await l.page.evaluate(() => ((window as any).voiceGuide.trailHost.snapshot().explored as any[]).map((x) => x.destinationId))
		const chip = l.page.locator('.pocket-journey-note .pocket-journey-chip').first()
		const chips = await l.page.locator('.pocket-journey-note .pocket-journey-chip').count()
		const why = await l.page.evaluate(() => ({ notes: document.querySelectorAll('.pocket-journey-note').length, questions: ((window as any).voiceGuide.trailHost.snapshot().explored as any[]).map((x) => Object.keys(x.questions ?? {})) }))
		assert.ok(chips > 0, `a question chip in the journey; explored: ${JSON.stringify(explored)}, ${JSON.stringify(why)}`)
		// Notes follow the explored items in order: the chip's note names its destination.
		const noteAt = await chip.evaluate((el) => [...document.querySelectorAll('.pocket-journey-note')].indexOf(el.closest('.pocket-journey-note')!))
		const turnAt = l.requests.length
		await chip.click()
		await l.page.waitForFunction(() => (window as any).__aixc.demos.pocket.state.view === 'page', null, { timeout: 10_000 })
		await l.page.waitForFunction(() => ((window as any).__spoken || []).length > 0, null, { timeout: 20_000 })
		const turn = l.requests.slice(turnAt).find((r) => r.url.includes('/v1/turn'))
		assert.ok(turn, 'a turn was sent')
		const hint = JSON.parse(turn.body).hint
		assert.equal(hint.source, 'trail-suggestion')
		assert.equal(hint.destinationId, explored[noteAt], "the destination of the chip's note")
		assert.equal(await l.page.evaluate(() => document.body.dataset.pocketView ?? null), null, 'the page turned back')
		assert.equal(await l.page.evaluate(() => !document.getElementById('pocket-output') || document.getElementById('pocket-output')!.hidden), true, 'no album')

		for (const r of l.requests) assert.ok(!/"childNodes"|IncrementalSnapshot|rr_width/.test(`${r.url} ${r.body}`), `replay data in ${r.url}`)
		assert.ok(!l.requests.some((r) => r.url.includes('/v1/experience/contributions')), 'no aggregate is sent')
		assert.deepEqual(l.reached, [], 'nothing reached the internet')
	} finally {
		await l.close()
	}
})
