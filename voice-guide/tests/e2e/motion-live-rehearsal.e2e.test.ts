/**
 * The rehearsal of the live motion run (live plan phase 3, task A3): the same flow as
 * tests/live/motion.live.test.ts (runMotion) on the saved pages through the live-page kit
 * (./vodafone-layer.ts: offline, motion on, Owl's layout, the signed-out theme's localStorage clear, the
 * accessibility widget in its real shape and defined as a custom element), so the flow is proven
 * without touching Vodafone's site.
 *
 * What it can show: every step of the four rounds (English and Arabic at 1366×900, then 375×812) runs and
 * passes its checks; the page loads (12, at least 1.2 s apart, the cap 16 never reached) and the requests
 * for pages (the portal's 4 fetches; the saved /en/vodafone-cash reloads itself once per session, as the
 * live one does, counted apart); the chips' sampler sees a carousel move and the chips follow it (the kit's Owl stand-in has
 * no motion, so a hook moves a stage by one slide with a 0.6 s transition, as Owl's autoplay would) and
 * counts a slot pushed off its card as misplaced; the flight, the page turn, the ride (across to the right
 * in English, on the left in Arabic), the dash back and the portal filmed to disk with the numbers in
 * motion-report.json; every screenshot the whole viewport in device pixels (its JPEG's own size), and
 * captureViewport at ratio 1 and 2 in Playwright contexts of their own (a tall page set from a string,
 * scrolled: the picture is the viewport, not the top of the document); the flight filmed from the press
 * until the sticker has landed (pocket.js's own PEEL_MS + LIFT_MS + THROW_MS, read here) with every frame
 * at its own time; the close filmed for 3 s with whether each chip's card is painted (cardsHiddenMs); Back
 * filmed for 3 s with the mascot and the album's Back; the frame cost read from Chrome; a press refused
 * when something not the layer's own is at the press point; 'skipped: banner' with nothing pressed; a stop on a 403 and on a challenge
 * page with nothing retried; clean-up of the sticker; nothing reaching the internet.
 *
 * What it cannot show: Owl's own motion (autoplay, its loop's jump back, drags) and whether Vodafone's
 * carousels move at all; Vodafone's scripts (Dynatrace, OneTrust's real banner, Angular's widget) and
 * their cost, so the frame numbers here are headless Chromium's on a script-free page, not Chrome's on
 * the live one; the HTTP cache (the kit's routes bypass it); the real scrollbar of headed Chrome; headed
 * Chrome's window surface (what a capture on a session of our own grabbed live: headless has no window, so
 * here the old capture was the viewport too); the whole flow at ratio 2 (the kit's contexts have ratio 1
 * and no option for another; a ratio forced over a DevTools session of the test's own is not Playwright's,
 * and its screenshots come out at Playwright's ratio); Owl hiding a carousel it finds out of sight
 * (.owl-hidden: the stand-in has no Owl script, so cardsHiddenMs is about our layer only).
 *
 * The screenshots and motion-report.json go to a new folder in the system's temporary directory, removed
 * at the end; VG_MOTION_KEEP=1 keeps the four rounds' folder and prints where it is.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { gunzipSync } from 'node:zlib'

import { chromium, type Page } from 'playwright'

import { BANNER_MESSAGE, captureViewport, COMBOS, DESKTOP, LOADS_PER_COMBO, MAX_LOADS, MAX_PAGE_REQUESTS, type MotionHooks, MotionFailure, type MotionReport, MotionStop, requestsLine, runMotion } from '../live/motion.live.test.ts'
import { ROOT } from '#shared/config.ts'

import { type LayerGateway, launchLayer, REPLAY, startLayerGateway, V, watch } from './vodafone-layer.ts'

const PORT = 4465
let gw: LayerGateway

before(async () => {
	gw = await startLayerGateway(PORT)
})
after(async () => {
	await gw?.close()
})

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Vodafone's accessibility widget as a defined custom element (the real one is Angular's), as pocket-portal-live does. */
const WIDGET_DEFINED = `(() => {
	if (window.top !== window || customElements.get('accessibility-widget')) return
	window.__aw = { constructed: 0, connected: 0 }
	customElements.define('accessibility-widget', class extends HTMLElement {
		constructor() { super(); window.__aw.constructed++ }
		connectedCallback() { window.__aw.connected++ }
	})
})()`

/** Every trusted press the page saw (pointerdown and keydown), counted before anything of the page. */
const PRESSES = `(() => {
	if (window.top !== window) return
	window.__presses = 0
	const count = (e) => { if (e.isTrusted) window.__presses++ }
	window.addEventListener('pointerdown', count, true)
	window.addEventListener('keydown', count, true)
})()`

const crawl = (JSON.parse(fs.readFileSync(path.join(REPLAY, 'crawl.json'), 'utf8')) as { pages: { url: string; snapshot?: string }[] }).pages
const savedFile = new Map(crawl.filter((p) => p.snapshot).map((p) => [new URL(p.url).pathname, path.join(REPLAY, p.snapshot!)]))
const savedHtml = (pathname: string) => {
	const file = savedFile.get(pathname)
	if (!file) return null
	const raw = fs.readFileSync(file)
	return (file.endsWith('.gz') ? gunzipSync(raw) : raw).toString('utf8')
}

/** The kit refuses a fetch for a page: the destination is served from the saved pages by a route of the page's own (as pocket-smoke-rehearsal does). */
const serveDestination: MotionHooks['beforeDestination'] = async (page, url) => {
	const pathname = new URL(url).pathname
	const body = savedHtml(pathname) ?? savedHtml(pathname.startsWith('/ar/') ? '/ar/home' : '/en/promotions')!
	await page.route(
		(u) => u.href.split('#')[0] === url,
		(route) => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', headers: { 'cache-control': 'max-age=14400, public', vary: 'Accept-Encoding' }, body }),
	)
}

const quickSettle: MotionHooks['settle'] = (page) => page.waitForTimeout(300)

/** Moves the Owl stage in view by one slide (`dir` 1 on, -1 back) with a 0.6 s transition, as Owl's autoplay would; the stand-in has no motion of its own. */
const moveStage = (page: Page, dir: 1 | -1) =>
	page.evaluate((dir) => {
		const outer = [...document.querySelectorAll<HTMLElement>('#main-content .owl-stage-outer')].find((o) => {
			const r = o.getBoundingClientRect()
			return r.width > 0 && r.bottom > 0 && r.top < innerHeight && o.querySelectorAll('.owl-item').length > 1
		})
		if (!outer) return null
		const stage = outer.querySelector<HTMLElement>('.owl-stage')!
		const item = stage.querySelector<HTMLElement>('.owl-item')!
		const step = item.getBoundingClientRect().width + parseFloat(getComputedStyle(item).marginRight || '0') + parseFloat(getComputedStyle(item).marginLeft || '0')
		const rtl = document.documentElement.dir === 'rtl'
		const m = new DOMMatrix(getComputedStyle(stage).transform)
		stage.style.transition = 'transform 0.6s ease'
		stage.style.transform = `translate3d(${m.m41 + (rtl ? 1 : -1) * dir * step}px, 0, 0)`
		return step
	}, dir)

const carousels: MotionHooks['chipSample'] = async (page, i) => {
	if (i === 2) await moveStage(page, 1)
	if (i === 10) await moveStage(page, -1)
}

const launch = (o: { banner?: boolean } = {}) => launchLayer(gw, { themeClear: true, owl: true, banner: o.banner, initScripts: [WIDGET_DEFINED, PRESSES] })

const stickersLeft = (page: Page) =>
	page.evaluate(() => {
		const p = (window as any).__aixc?.demos?.pocket
		return p ? (p.store.all() as any[]).length : -1
	})

const tmpOut = (name: string) => fs.mkdtempSync(path.join(os.tmpdir(), `vg-motion-${name}-`))

/** The width and height a JPEG says it has (its start-of-frame marker). */
const jpegSize = (file: string) => jpegSizeOf(fs.readFileSync(file), file)
const jpegSizeOf = (b: Buffer, file = 'the picture') => {
	assert.ok(b[0] === 0xff && b[1] === 0xd8, `${file} is a JPEG`)
	let i = 2
	while (i + 9 < b.length) {
		if (b[i] !== 0xff) {
			i++
			continue
		}
		const marker = b[i + 1]
		if (marker === 0xff || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
			i += marker === 0xff ? 1 : 2
			continue
		}
		if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { width: b.readUInt16BE(i + 7), height: b.readUInt16BE(i + 5) }
		i += 2 + b.readUInt16BE(i + 2)
	}
	throw new Error(`${file}: no start-of-frame marker`)
}

/** Every screenshot of a run is its round's whole viewport in device pixels: the viewport's size times the ratio. */
const assertWholeViewport = (report: MotionReport, out: string, dpr: number) => {
	assert.ok(report.files.length > 0, 'screenshots were taken')
	for (const f of report.files) {
		const c = report.combos.find((x) => f.startsWith(`${x.name}-`))
		assert.ok(c, `${f} belongs to a round`)
		const ratio = c.dpr ?? dpr
		assert.deepEqual(jpegSize(path.join(out, f)), { width: Math.round(c.viewport.width * ratio), height: Math.round(c.viewport.height * ratio) }, `${f} is the whole ${c.viewport.width}×${c.viewport.height} viewport at device pixel ratio ${ratio}`)
	}
	assert.deepEqual(
		report.combos.map((c) => c.dpr),
		report.combos.map(() => dpr),
		'the ratio is recorded for every round',
	)
}

/** pocket.js's own flight: a pocketed sticker lands PEEL_MS + LIFT_MS + THROW_MS after the press. */
const POCKET_JS = fs.readFileSync(path.join(ROOT, '..', 'experiences/src/pocket/pocket.js'), 'utf8')
const pocketMs = (name: string) => Number(new RegExp(`const ${name} = (\\d+)`).exec(POCKET_JS)?.[1])
const LANDS_MS = pocketMs('PEEL_MS') + pocketMs('LIFT_MS') + pocketMs('THROW_MS')

const STEPS = ['a', 'b', '1', '5a', '2', '3', '5b', '3c', '4', '6']
/** The flight's frames after the press: 150 ms apart to 300 ms after the landing. */
const FLIGHT_FRAMES = Math.ceil((LANDS_MS + 300) / 150)
const KEEP = process.env.VG_MOTION_KEEP === '1'

test('four rounds (English and Arabic, 1366×900 then 375×812), motion on, Owl: every step passes, every number and screenshot on disk, 12 page loads 1.2 s apart, the sticker removed, nothing reached the internet', { timeout: 540_000 }, async () => {
	const l = await launch()
	const out = tmpOut('rehearsal')
	try {
		const seen = watch(l.page)
		const lines: string[] = []
		let report: MotionReport
		try {
			report = await runMotion(l.page, { base: V, out, log: (x) => lines.push(x), hooks: { settle: quickSettle, beforeDestination: serveDestination, chipSample: carousels } })
		} finally {
			console.log(`# ${lines.join('\n# ')}`)
		}
		const failed = report.checks.filter((c) => !c.ok)
		assert.deepEqual(failed, [], `every check passes: ${JSON.stringify(failed)}`)
		assert.equal(report.outcome, 'passed', report.message ?? '')
		assert.deepEqual(
			report.combos.map((c) => c.name),
			['en-1366', 'ar-1366', 'en-375', 'ar-375'],
		)
		for (const c of report.combos) {
			assert.deepEqual(
				c.steps.map((s) => `${s.id}${s.ok ? '' : ' failed'}`),
				STEPS,
				`${c.name}: every step, in order, passed`,
			)
			// (1) The chips: the sampler saw the stage move, and the chips stayed on their cards.
			const ch = c.chips!
			assert.equal(ch.samples, 21, `${c.name}: 21 samples`)
			assert.ok(ch.spanMs >= 5900 && ch.spanMs < 9000, `${c.name}: over 6 s (${ch.spanMs} ms)`)
			assert.ok(ch.visibleMax > 0 && ch.inViewMax > 0, `${c.name}: chips shown (${ch.visibleMax}, ${ch.inViewMax} in view)`)
			assert.ok(ch.transitionSamples >= 1 && ch.cardMoveSamples >= 1 && ch.stagesMoved >= 1, `${c.name}: the carousel moved while sampled (a transition in ${ch.transitionSamples} samples, cards moved in ${ch.cardMoveSamples}, ${ch.stagesMoved} stages)`)
			assert.deepEqual([ch.misplaced, ch.detached], [0, 0], `${c.name}: no chip misplaced or detached (${JSON.stringify(ch.perSample.filter((s: any) => s.misplaced.length || s.detached.length))})`)
			assert.equal(ch.screenshots.length, 2, `${c.name}: two screenshots of the chips`)
			// (2) The flight: a frame just before the press, then 150 ms apart from it until 300 ms after the
			// sticker has landed, then the corner; every frame at its own time from the press.
			const fl = c.flight!.frames
			const times = fl.map((f) => f.t).join(' ')
			assert.ok(LANDS_MS > 1000, `pocket.js's flight read (${LANDS_MS} ms)`)
			assert.equal(fl.length, FLIGHT_FRAMES + 2, `${c.name}: one frame before the press, ${FLIGHT_FRAMES} to ${LANDS_MS + 300} ms after it, the corner (${times})`)
			assert.ok(fl[0].t <= 0, `${c.name}: the first frame is before the press (${fl[0].t} ms)`)
			for (let i = 1; i < fl.length; i++) assert.ok(fl[i].t > fl[i - 1].t, `${c.name}: every frame at its own time, after the one before (${times})`)
			for (let i = 1; i <= FLIGHT_FRAMES; i++) assert.ok(fl[i].t >= i * 150 - 5, `${c.name}: the frames 150 ms apart (${times})`)
			assert.ok(fl[FLIGHT_FRAMES].t >= LANDS_MS + 300 - 5, `${c.name}: filmed until the sticker has landed (to ${fl[FLIGHT_FRAMES].t} ms; it lands at ${LANDS_MS} ms)`)
			assert.ok(
				fl.some((f) => f.sample?.flying),
				`${c.name}: the card was filmed in flight`,
			)
			assert.ok(
				fl.some((f) => f.t >= LANDS_MS && f.sample && f.sample.flying === 0),
				`${c.name}: the landing was filmed (nothing in flight from ${LANDS_MS} ms: ${fl.map((f) => `${f.t}:${f.sample?.flying}`).join(' ')})`,
			)
			// (3) The page turn and the ride: 14 frames 200 ms apart, his box at each.
			const al = c.album!.frames
			assert.equal(al.length, 14, `${c.name}: 14 frames of the page turn and the ride`)
			assert.ok(
				al.slice(1).every((f) => f.sample?.mover),
				`${c.name}: his box at each frame`,
			)
			assert.ok(
				al.some((f) => f.sample?.busy),
				`${c.name}: the page turn was filmed`,
			)
			if (c.name.startsWith('en'))
				assert.ok(
					al.some((f) => f.sample?.state === 'riding'),
					`${c.name}: the ride was filmed`,
				)
			// The close: 200 ms apart for 3 s after Back, the paint of each shown chip's card in every frame.
			const cl = c.close as NonNullable<MotionReport['combos'][number]['close']>
			assert.equal(cl.frames.length, 3000 / 200 + 1, `${c.name}: the close filmed for 3 s, 200 ms apart (${cl.frames.map((f) => f.t).join(' ')})`)
			assert.ok(cl.frames.at(-1)!.t >= 3000 - 5, `${c.name}: to 3 s after Back (${cl.frames.at(-1)!.t} ms)`)
			assert.ok(
				cl.frames.every((f) => f.sample?.cards),
				`${c.name}: every frame says whether each shown chip's card is painted`,
			)
			assert.ok(
				cl.frames.some((f) => f.sample.cards.slots.length > 0),
				`${c.name}: chips seen after the page came back`,
			)
			assert.equal(typeof cl.pageBackMs, 'number', `${c.name}: the page came back within the film (${cl.pageBackMs})`)
			assert.equal(typeof cl.cardsHiddenMs, 'number', `${c.name}: every shown chip's card painted within the film (cardsHiddenMs ${cl.cardsHiddenMs}; ${JSON.stringify(cl.unpainted?.slice(0, 4))})`)
			// (4) The portal: frames every 250 ms until the navigation, then Back.
			const po = c.portal!
			assert.ok(po.navigatedMs! > 2000 && po.navigatedMs! < 9500, `${c.name}: navigated after the transition (${po.navigatedMs} ms)`)
			assert.ok(po.frames.length >= 8, `${c.name}: the transition filmed (${po.frames.length} frames)`)
			assert.ok(po.states.length >= 2, `${c.name}: the portal's states read (${po.states.join(' → ')})`)
			assert.equal(po.status, 200, `${c.name}: the destination answered`)
			// Back: 250 ms apart for 3 s, the mascot and the album's Back in every frame read.
			const bk = c.back as NonNullable<MotionReport['combos'][number]['back']>
			assert.equal(bk.frames.length, 3000 / 250 + 1, `${c.name}: Back filmed for 3 s, 250 ms apart (${bk.frames.map((f) => f.t).join(' ')})`)
			assert.ok(bk.frames.at(-1)!.t >= 3000 - 5, `${c.name}: to 3 s after Back (${bk.frames.at(-1)!.t} ms)`)
			assert.ok(
				bk.frames.some((f) => f.sample) && bk.frames.every((f) => !f.sample || ('mascot' in f.sample && 'back' in f.sample && Number.isFinite(f.sample.scrollY))),
				`${c.name}: every frame read says where the mascot and the album's Back are, with scrollY`,
			)
			assert.ok('mascotMs' in bk && 'backOnScreenMs' in bk, `${c.name}: when the mascot appeared and when the album's Back was on screen are in the report`)
			// (5) The frame cost, with the album closed and open.
			for (const cost of [c.cost.baseline!, c.cost.album!]) {
				assert.ok(cost.frames > 100, `${c.name} ${cost.label}: frames counted (${cost.frames})`)
				for (const k of ['taskMs', 'scriptMs', 'layoutMs', 'recalcStyleMs', 'layoutCount', 'recalcStyleCount', 'over33', 'over50'] as const) assert.ok(Number.isFinite(cost[k]) && cost[k] >= 0, `${c.name} ${cost.label}: ${k} read (${cost[k]})`)
				assert.ok(cost.taskMs > 0, `${c.name} ${cost.label}: Chrome's task time read (${cost.taskMs})`)
			}
			assert.equal(c.cost.baseline!.view, 'page')
			assert.equal(c.cost.baseline!.stickers, 0, `${c.name}: nothing pocketed for the baseline`)
			assert.equal(c.cost.album!.view, 'pocket')
			console.log(`# ${c.name}: flight to ${fl[FLIGHT_FRAMES].t} ms, landed by ${c.flight!.landedMs} ms; page back ${cl.pageBackMs} ms after the album's Back, cardsHiddenMs ${cl.cardsHiddenMs}; after the portal's Back the mascot at ${bk.mascotMs ?? 'never'} ms, the album's Back on screen at ${bk.backOnScreenMs ?? 'never'} ms (scrollY ${bk.backScrollY})`)
			console.log(`# ${c.name}: chips ${ch.visibleMax} shown, a transition in ${ch.transitionSamples} samples, cards moved in ${ch.cardMoveSamples}, Vodafone's looping animations ${ch.loopingAnimations}, in place within ${ch.maxDeviationPx} px, lagged ${ch.lagged}; ride ${al.filter((f) => f.sample?.state === 'riding').length} frames; portal ${po.navigatedMs} ms ${po.states.join(' → ')}; cost baseline ${c.cost.baseline!.taskMs} ms task ${c.cost.baseline!.over33}/${c.cost.baseline!.frames} frames over 33 ms, album ${c.cost.album!.taskMs} ms task ${c.cost.album!.over33}/${c.cost.album!.frames}`)
		}
		// Page loads: exactly the planned twelve, paced, under the cap.
		assert.deepEqual(
			report.loads.map((x) => x.how),
			COMBOS.flatMap(() => LOADS_PER_COMBO),
		)
		assert.ok(report.loads.length <= MAX_LOADS)
		for (let i = 1; i < report.loads.length; i++) assert.ok(report.loads[i].at - report.loads[i - 1].at >= 1200, `loads at least 1.2 s apart (${report.loads[i].at - report.loads[i - 1].at} ms)`)
		console.log(`# requests for pages: ${JSON.stringify(report.pageRequests.map((r) => ({ combo: r.combo, type: r.type, navigation: r.navigation, failure: r.failure, at: r.at - report.loads[0].at, url: r.url })))}`)
		const fetches = report.pageRequests.filter((r) => r.type !== 'document')
		const reloads = report.pageRequests.filter((r) => r.reload)
		const documents = report.pageRequests.filter((r) => r.type === 'document' && !r.reload)
		assert.equal(fetches.length, 4, `the portal fetched each destination once (${JSON.stringify(fetches)})`)
		assert.equal(documents.length, 12, `one document per page load of the run (${JSON.stringify(documents)})`)
		// The saved /en/vodafone-cash, like the live one, reloads itself once per browser session (its own
		// "reload-vf-cash-content" script and a sessionStorage flag): in round 1 only, and counted apart.
		assert.deepEqual(
			reloads.map((r) => `${r.combo} ${new URL(r.url).pathname}`),
			['en-1366 /en/vodafone-cash'],
			'the page reloaded itself once, the first time it was visited',
		)
		assert.ok(report.pageRequests.length <= MAX_PAGE_REQUESTS)
		assert.match(requestsLine(report), /^17 requests for pages in all \(cap 20\): 12 documents for the run's loads, 4 fetches by the portal, 1 reload\(s\) by the page itself \(https:\/\/web\.vodafone\.com\.eg\/en\/vodafone-cash\)$/)
		// Every screenshot and the JSON on disk.
		const missing = report.files.filter((f) => !fs.existsSync(path.join(out, f)))
		assert.deepEqual(missing, [], 'every screenshot is on disk')
		assert.ok(report.files.length >= 4 * (2 + (FLIGHT_FRAMES + 2) + 15 + 16 + 8 + 1 + 13), `screenshots (${report.files.length})`)
		// Each one the whole viewport of its round, in device pixels.
		assertWholeViewport(report, out, await l.page.evaluate(() => devicePixelRatio))
		const written = JSON.parse(fs.readFileSync(path.join(out, 'motion-report.json'), 'utf8')) as MotionReport
		assert.equal(written.outcome, 'passed')
		assert.equal(written.loads.length, 12)
		assert.equal(written.combos[0].chips!.perSample.length, 21, 'every sample is in the JSON')
		// Clean-up: only the layer's own record, removed each round.
		assert.equal(await stickersLeft(l.page), 0, 'the stickers this run made are gone')
		assert.equal(report.cleanup.filter((x) => /removed 1 sticker\(s\)/.test(x)).length, 4, report.cleanup.join(' | '))
		assert.ok(report.presses > 0)
		assert.deepEqual(seen.pageErrors, [], 'no page errors')
		assert.deepEqual(l.reached, [], 'nothing reached the internet')
		console.log(`# ${report.files.length} screenshots and motion-report.json ${KEEP ? `kept in ${out}` : 'written (VG_MOTION_KEEP=1 keeps them)'}; ${report.loads.length} page loads, ${requestsLine(report)}, ${report.presses} presses`)
	} finally {
		await l.close()
		if (!KEEP) fs.rmSync(out, { recursive: true, force: true })
	}
})

/** Colours of the bands of the tall test page, one per 300 px of the document. */
const BANDS = ['#e60000', '#00a000', '#0040ff', '#ffd000', '#a000c0', '#00c0c0', '#ff8000', '#404040', '#ffffff', '#000000']

test("captureViewport: the whole viewport in device pixels, where the page is scrolled, in a context of device pixel ratio 1 and one of 2 (Playwright's own emulation, as on the live run)", { timeout: 120_000 }, async () => {
	// A browser of its own: the kit's contexts have ratio 1 and no option for another. Nothing is loaded:
	// the page is set from a string.
	const browser = await chromium.launch({ headless: true })
	try {
		for (const dpr of [1, 2]) {
			const context = await browser.newContext({ viewport: DESKTOP, deviceScaleFactor: dpr })
			const page = await context.newPage()
			await page.setContent(`<!doctype html><style>body{margin:0}div{height:300px}</style>${BANDS.map((c) => `<div style="background:${c}"></div>`).join('')}`)
			// Scrolled to 1250: the viewport (900 px) shows the end of band 4 (1200-1500), band 5 and the start of band 7 (2100-2400).
			await page.evaluate(() => window.scrollTo(0, 1250))
			const at = await page.evaluate(() => ({ scrollY, ratio: devicePixelRatio }))
			assert.deepEqual(at, { scrollY: 1250, ratio: dpr })
			const jpeg = await captureViewport(page)
			const seen = await page.evaluate(async (src) => {
				const img = new Image()
				img.src = src
				await img.decode()
				const c = document.createElement('canvas')
				c.width = img.naturalWidth
				c.height = img.naturalHeight
				const g = c.getContext('2d')!
				g.drawImage(img, 0, 0)
				// The colour 20 % of the way across at these heights of the picture (as fractions of its height).
				const at = (fy: number) => [...g.getImageData(Math.round(img.naturalWidth * 0.2), Math.round(img.naturalHeight * fy), 1, 1).data].slice(0, 3)
				return { width: img.naturalWidth, height: img.naturalHeight, top: at(0.1), middle: at(0.5), bottom: at(0.97) }
			}, `data:image/jpeg;base64,${jpeg.toString('base64')}`)
			const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
			const near = (a: number[], b: number[]) => a.every((v, i) => Math.abs(v - b[i]) < 40)
			assert.equal(jpegSizeOf(jpeg).width, seen.width, 'the JPEG says the size the browser decodes')
			assert.deepEqual({ width: seen.width, height: seen.height }, { width: DESKTOP.width * dpr, height: DESKTOP.height * dpr }, `ratio ${dpr}: the whole ${DESKTOP.width}×${DESKTOP.height} viewport in device pixels`)
			// 10 % down the picture is the document's 1340 (band 4), the middle its 1700 (band 5), 97 % down its 2123 (band 7).
			assert.ok(near(seen.top, rgb(BANDS[4])) && near(seen.middle, rgb(BANDS[5])) && near(seen.bottom, rgb(BANDS[7])), `ratio ${dpr}: the picture is the viewport where the page is scrolled (${JSON.stringify(seen)})`)
			console.log(`# ratio ${dpr}: captureViewport gave ${seen.width}×${seen.height}, the viewport at scrollY 1250 (${JSON.stringify([seen.top, seen.middle, seen.bottom])})`)
			await context.close()
		}
	} finally {
		await browser.close()
	}
})

test("the cookie banner showing: the run stops with the banner message, 'skipped: banner', and presses nothing", { timeout: 120_000 }, async () => {
	const l = await launch({ banner: true })
	const out = tmpOut('banner')
	try {
		const lines: string[] = []
		const report = await runMotion(l.page, { base: V, out, log: (x) => lines.push(x), hooks: { settle: quickSettle, beforeDestination: serveDestination } })
		assert.equal(report.outcome, 'skipped: banner')
		assert.equal(report.message, BANNER_MESSAGE)
		assert.ok(lines.some((x) => x.includes(BANNER_MESSAGE)), 'the message is printed')
		assert.equal(report.presses, 0, 'the run pressed nothing')
		assert.equal(await l.page.evaluate(() => (window as any).__presses), 0, 'the page saw no press at all')
		assert.equal(report.loads.length, 1, 'one page load')
		const banner = await l.page.evaluate(() => ({
			banner: getComputedStyle(document.getElementById('onetrust-banner-sdk')!).display,
			filter: getComputedStyle(document.querySelector('.onetrust-pc-dark-filter')!).display,
			answered: document.cookie.includes('OptanonAlertBoxClosed'),
		}))
		assert.deepEqual(banner, { banner: 'block', filter: 'block', answered: false }, 'the banner and its filter as they came, not answered')
		assert.equal(await stickersLeft(l.page), 0, 'nothing pocketed')
		assert.ok(fs.existsSync(path.join(out, 'motion-report.json')), 'the report is written')
	} finally {
		await l.close()
		fs.rmSync(out, { recursive: true, force: true })
	}
})

test('a bot check (a 403 "Access denied" page for the first load): the run stops with the bot message, nothing pressed or retried', { timeout: 120_000 }, async () => {
	const l = await launch()
	const out = tmpOut('403')
	try {
		await l.page.route(
			(u) => u.pathname === '/en/services',
			(route) => route.fulfill({ status: 403, contentType: 'text/html', body: '<!doctype html><title>Access denied</title><h1>Access denied</h1><p>You do not have access.</p>' }),
			{ times: 1 },
		)
		const lines: string[] = []
		await assert.rejects(runMotion(l.page, { base: V, out, log: (x) => lines.push(x), hooks: { settle: quickSettle } }), (e: unknown) => {
			assert.ok(e instanceof MotionStop, `a stop, not a failure (${e})`)
			assert.match(e.message, /answered 403: a bot check or a block\. Nothing was pressed after it and nothing is retried/)
			assert.equal(e.report.outcome, 'stopped')
			assert.equal(e.report.presses, 0)
			assert.equal(e.report.loads.length, 1, 'no second load (nothing retried)')
			return true
		})
		assert.ok(lines.some((x) => x.startsWith('STOPPED:')), 'the stop is printed')
		assert.equal(await l.page.evaluate(() => (window as any).__presses ?? 0), 0, 'the page saw no press')
	} finally {
		await l.close()
		fs.rmSync(out, { recursive: true, force: true })
	}
})

test('a challenge page with status 200 ("Just a moment..."): the run stops with the bot message too', { timeout: 120_000 }, async () => {
	const l = await launch()
	const out = tmpOut('challenge')
	try {
		await l.page.route(
			(u) => u.pathname === '/en/services',
			(route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Just a moment...</title><div id="challenge-running">Checking your browser</div>' }),
			{ times: 1 },
		)
		await assert.rejects(runMotion(l.page, { base: V, out, log: () => {}, hooks: { settle: quickSettle } }), (e: unknown) => {
			assert.ok(e instanceof MotionStop, `a stop (${e})`)
			assert.match(e.message, /is a bot check or a challenge .*never tries to get past one/)
			assert.equal(e.report.loads.length, 1)
			assert.equal(e.report.presses, 0)
			return true
		})
	} finally {
		await l.close()
		fs.rmSync(out, { recursive: true, force: true })
	}
})

test('the sampler can fail: a chip slot pushed 40 px off its card is counted misplaced, and only the chips check fails', { timeout: 240_000 }, async () => {
	const l = await launch()
	const out = tmpOut('misplaced')
	try {
		let pushed: string | null = null
		const report = await runMotion(l.page, {
			base: V,
			out,
			combos: [{ path: '/en/services', viewport: DESKTOP }],
			log: () => {},
			hooks: {
				settle: quickSettle,
				beforeDestination: serveDestination,
				chipSample: async (page, i) => {
					if (i !== 4) return
					pushed = await page.evaluate(() => {
						const slot = [...document.querySelectorAll<HTMLElement>('.pocket-chips > .pocket-host')].find((s) => {
							const r = s.getBoundingClientRect()
							return !s.hidden && !('cut' in s.dataset) && r.width > 0 && r.top >= 0 && r.bottom <= innerHeight
						})
						if (!slot) return null
						const m = new DOMMatrix(getComputedStyle(slot).transform)
						slot.style.transform = `translate(${m.m41 + 40}px, ${m.m42}px)`
						return slot.querySelector<HTMLElement>('.pocket-cta[data-pocket-for]')?.dataset.pocketFor ?? null
					})
				},
			},
		})
		assert.ok(pushed, 'a slot was pushed off its card')
		assert.equal(report.outcome, 'failed')
		assert.deepEqual(
			report.checks.filter((c) => !c.ok).map((c) => `${c.combo} ${c.id}`),
			['en-1366 chips'],
			'only the chips check fails',
		)
		const ch = report.combos[0].chips!
		assert.ok(ch.misplaced >= 10, `misplaced in the samples after the push (${ch.misplaced})`)
		assert.ok(ch.misplacedChips.includes(pushed), `the pushed chip is named (${ch.misplacedChips.join(', ')})`)
		assert.ok(Math.abs(ch.worstMisplacedPx - 40) <= 2, `by about 40 px (${ch.worstMisplacedPx})`)
		assert.match(report.message!, /1 check\(s\) failed: en-1366 chips/)
		assert.equal(await stickersLeft(l.page), 0, 'the sticker is removed after the failed check too')
	} finally {
		await l.close()
		fs.rmSync(out, { recursive: true, force: true })
	}
})

test("a press is refused when the element at the press point is not the layer's own control: nothing is pressed", { timeout: 180_000 }, async () => {
	const l = await launch()
	const out = tmpOut('cover')
	try {
		await assert.rejects(
			runMotion(l.page, {
				base: V,
				out,
				combos: [{ path: '/en/services', viewport: DESKTOP }],
				log: () => {},
				hooks: {
					settle: quickSettle,
					// Something of the page's own covers the screen as the pointer reaches the chip.
					chipSample: async (page, i) => {
						if (i !== 20) return
						await page.evaluate(() => {
							document.addEventListener('pointerover', (e) => {
								if (!(e.target as Element).closest?.('.pocket-cta') || document.getElementById('vg-cover')) return
								const cover = document.createElement('div')
								cover.id = 'vg-cover'
								cover.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:transparent'
								document.body.append(cover)
							})
						})
					},
				},
			}),
			(e: unknown) => {
				assert.ok(e instanceof MotionFailure, `a failure (${e})`)
				assert.match(e.message, /^en-1366 \(2\) a press at the chip .* would reach div#vg-cover, not the layer's own control: nothing was pressed$/)
				assert.equal(e.report.presses, 0, 'nothing pressed')
				assert.equal(e.report.outcome, 'failed')
				return true
			},
		)
		assert.equal(await l.page.evaluate(() => (window as any).__presses), 0, 'the page saw no press')
		assert.equal(await stickersLeft(l.page), 0, 'nothing pocketed')
	} finally {
		await l.close()
		fs.rmSync(out, { recursive: true, force: true })
	}
})
