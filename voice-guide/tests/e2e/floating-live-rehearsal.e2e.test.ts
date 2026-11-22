/**
 * The rehearsal of the floating-control matrix on the real pages (live plan §3.7; phase 3, S16's matrix
 * taken live; ADR-0050, ADR-0052, ADR-0064): the same run as tests/live/floating.live.test.ts
 * (tests/live/floating-walk.ts, runFloatingMatrix, its PLAN) on the saved pages through the live-page kit
 * (./vodafone-layer.ts: offline, Owl's layout, the signed-out theme's localStorage clear, the accessibility
 * widget in its real shape and defined as a custom element, the trail on), so the walk is proven without
 * touching Vodafone's site.
 *
 * - The whole plan, English and Arabic: the main pass (a profile without the banner) on /en/services and
 *   /ar/services in S1, S2, S5, S3, the trail's consent card and S4, and /en/home in S1 and S2, at 1366×900
 *   and 375×812, then S7 on /en/services (the composer, the view with the Pocket peeking, the guide listening,
 *   the composer over the view, canvas's and streaming's previews, Vodafone's menu over the view) and on
 *   /en/home (the composer, the view, the menu), the menu by a hover at 1366 and the kit's burger stand-in at
 *   375; the gate read on every page with the layer and the corners' zones in every cell; the banner pass (the kit's BANNER_STAND_IN: OneTrust's banner and its full-page filter) in
 *   S1 at both sizes with no press. Every cell keeps the rules; 20 page loads at least 1.2 s apart; a
 *   screenshot of the viewport for every cell and baseline at the viewport's size; the JSON written; a
 *   stand-in of another of Vodafone's floaters listed and clear; the layer's own data cleaned up; nothing
 *   reached the internet. Each ?aixc=off baseline is Vodafone's page alone (the requests to /__vg/
 *   refused for that load, nothing of ours on it); the curl's painted corner measured where the Pocket
 *   peeks; the fonts of our words read in every cell. Two rules fail on today's product code and are the
 *   last assertion here: (f) the drone does not show in the album at 1366 px, and (h) on /en/home (the
 *   maintheme has no Vodafone bold face) our chips, liner and Back are drawn in a system font.
 * - The rules (a) for what the curl paints, (f) for a drone that does not show and (h) for a system font,
 *   on measures made by hand: each fires where it should and nowhere else.
 * - The banner showing in the main pass: 'skipped: banner', nothing pressed, the banner as it came.
 * - A bot check (403 "Access denied") and a challenge page (200 "Just a moment…") on the first load: the run
 *   stops, nothing is pressed, nothing is retried, the banner pass never opens.
 * - OneTrust's banner as it may come live: without its full-page filter (then only our points inside the
 *   banner are held to it, and the cells pass), and under our z-index (then rule (c) names the banner's own).
 * - Vodafone's phone menu at 375 with classic scrollbars, as the live walk of 2026-11-22 had it: its own scroll lock
 *   (NAV_STAND_IN) widens the layout viewport 360 -> 375 and its button moves 285 -> 300; rule (d) follows the
 *   viewport in those two cells only, every other cell keeps the scrollbar and the button as with ?aixc=off.
 * - The rules can fail: a hook that moves the accessibility button and puts a floater of Vodafone's over
 *   the Pocket button makes rules (d) and (floaters) report it; the clean-up still runs.
 * - A page load the run did not start (the page reloads itself) stops the run.
 * - An output directory inside the repository is refused.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'

import type { Page } from 'playwright'

import { ROOT } from '#shared/config.ts'

import { ACTORS_TEST, BANNER_MESSAGE, DESKTOP, type FloatingOptions, FloatingStop, MAX_LOADS, MIC_STAND_IN, outsideRepo, PHONE, PLAN, type Plan, plannedLoads, runFloatingMatrix } from '../live/floating-walk.ts'
import { type Box, cellViolations, type Control, type Measure, S7, WIDGET_DEFINED } from './floating-controls.ts'
import { type Layer, type LayerGateway, launchLayer, NAV_STAND_IN, startLayerGateway, V } from './vodafone-layer.ts'

const PORT = 4462
let gw: LayerGateway

before(async () => {
	gw = await startLayerGateway(PORT, { trail: true })
})
after(async () => {
	await gw?.close()
})

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Every trusted press the page saw (pointerdown and keydown), counted before anything of the page. */
const PRESSES = `(() => {
	if (window.top !== window) return
	window.__presses = 0
	const count = (e) => { if (e.isTrusted) window.__presses++ }
	window.addEventListener('pointerdown', count, true)
	window.addEventListener('keydown', count, true)
})()`

/**
 * Another floater of Vodafone's, as a real page may have (the edge of a feedback tab on the left, in the
 * 16 px our controls keep from the edges), and a hidden one (a chat window, closed): the walk must list both,
 * the first shown and clear of our controls.
 */
const OTHER_FLOATERS = `(() => {
	if (window.top !== window || !/^\\/(en|ar)\\//.test(location.pathname)) return
	const add = () => {
		if (document.getElementById('vf-feedback-stand-in')) return
		const tab = document.createElement('div')
		tab.id = 'vf-feedback-stand-in'
		tab.style.cssText = 'position:fixed;left:0;top:300px;width:12px;height:96px;background:#4a4d4e;z-index:50'
		const chat = document.createElement('div')
		chat.id = 'vf-chat-stand-in'
		chat.style.cssText = 'position:fixed;left:24px;bottom:24px;width:360px;height:480px;background:#fff;z-index:60;display:none'
		document.body.append(tab, chat)
	}
	if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', add, { once: true })
	else add()
})()`

// NAV_STAND_IN: Vodafone's burger opens its phone menu as its script does (S7's menu cell at 375).
const INIT = [WIDGET_DEFINED, MIC_STAND_IN, ACTORS_TEST, PRESSES, OTHER_FLOATERS, NAV_STAND_IN]

/** What a page holds at the end, read just before its browser closes. */
const endState = (page: Page) =>
	page.evaluate(async () => {
		const p = (window as any).__aixc?.demos?.pocket
		if (p?.store) await p.store.ready
		const b = document.getElementById('onetrust-banner-sdk')
		const f = document.querySelector('.onetrust-pc-dark-filter')
		return {
			stickers: p?.store ? (p.store.all() as any[]).length : -1,
			consent: ((window as any).__vgTrailActive?.state?.consent ?? null) as string | null,
			presses: ((window as any).__presses ?? 0) as number,
			banner: b ? getComputedStyle(b).display : null,
			filter: f ? getComputedStyle(f).display : null,
			answered: document.cookie.includes('OptanonAlertBoxClosed'),
		}
	})

type End = Awaited<ReturnType<typeof endState>>

/** A browser of the kit for a pass, recording what it held at the end and what reached the internet. */
function kit(o: { name: 'main' | 'banner'; banner: boolean; opened: string[]; ends: Record<string, End>; layers: Layer[]; extra?: string[]; init?: string[]; scrollbars?: boolean }) {
	return async () => {
		const name = o.name
		o.opened.push(name)
		const l = await launchLayer(gw, { banner: o.banner, themeClear: true, owl: true, scrollbars: o.scrollbars, initScripts: [...(o.init ?? INIT), ...(o.extra ?? [])] })
		o.layers.push(l)
		return {
			page: l.page,
			close: async () => {
				o.ends[name] = await endState(l.page).catch(() => ({ stickers: -2, consent: null, presses: -1, banner: null, filter: null, answered: false }))
				await l.close()
			},
		}
	}
}

const tmp = (name: string) => fs.mkdtempSync(path.join(os.tmpdir(), `vg-floating-${name}-`))

/** The width and height a PNG file says it has. */
const pngSize = (file: string) => {
	const b = fs.readFileSync(file)
	assert.equal(b.subarray(1, 4).toString('latin1'), 'PNG', `${file} is a PNG`)
	return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) }
}

const run = ({ banner, extra, init, scrollbars, ...o }: Partial<FloatingOptions> & { banner?: boolean; extra?: string[]; init?: string[]; scrollbars?: boolean }, rec = { opened: [] as string[], ends: {} as Record<string, End>, layers: [] as Layer[], lines: [] as string[] }) => {
	const out = o.out ?? tmp('run')
	return {
		rec,
		out,
		go: () =>
			runFloatingMatrix({
				base: V,
				out,
				settleMs: 800,
				log: (x) => rec.lines.push(x),
				openMain: kit({ name: 'main', banner: !!banner, opened: rec.opened, ends: rec.ends, layers: rec.layers, extra, init, scrollbars }),
				openBanner: kit({ name: 'banner', banner: true, opened: rec.opened, ends: rec.ends, layers: rec.layers, extra, init, scrollbars }),
				...o,
			}),
	}
}

const ONE: Plan = { main: { viewports: [DESKTOP], pages: [{ pathname: '/en/services', full: false }] }, banner: null }

test('the whole live run on the saved pages: every cell keeps the rules, 20 page loads, a screenshot per cell, the JSON, the clean-up', { timeout: 900_000 }, async () => {
	const r = run({})
	const t0 = Date.now()
	try {
		const report = await r.go().catch((e) => {
			console.log(`# ${r.rec.lines.join('\n# ')}`)
			throw e
		})
		console.log(`# ${r.rec.lines.join('\n# ')}`)
		console.log(`# the whole run took ${Math.round((Date.now() - t0) / 1000)} s`)
		assert.equal(report.main, 'done')
		assert.equal(report.banner, 'done')
		assert.deepEqual(r.rec.opened, ['main', 'banner'], 'the main pass, then the banner pass')

		// Page loads: exactly the plan's 20, never more than 24, at least 1.2 s apart, two per page and size.
		assert.equal(plannedLoads(PLAN), 20)
		assert.equal(report.loads.length, 20, report.loads.map((l) => l.url).join(' '))
		assert.ok(report.loads.length <= MAX_LOADS)
		for (let i = 1; i < report.loads.length; i++) assert.ok(report.loads[i].at - report.loads[i - 1].at >= 1200, `loads at least 1.2 s apart (${report.loads[i].at - report.loads[i - 1].at} ms before ${report.loads[i].url})`)
		const expected = [
			...[DESKTOP, PHONE].flatMap(() => ['/en/services', '/ar/services', '/en/home'].flatMap((p) => [`main ${p}?aixc=off`, `main ${p}?aixc-debug`])),
			...[DESKTOP, PHONE].flatMap(() => ['/en/services', '/ar/services'].flatMap((p) => [`banner ${p}?aixc=off`, `banner ${p}?aixc-debug`])),
		]
		assert.deepEqual(
			report.loads.map((l) => `${l.pass} ${new URL(l.url).pathname}${new URL(l.url).search}`),
			expected,
		)

		// The cells: every state on every page and size; the trail's consent card measured where it showed.
		const states = (pass: string, page: string, vp: string) => report.cells.filter((c) => c.pass === pass && c.page === page && c.viewport === vp).map((c) => c.state)
		for (const vp of ['1366x900', '375x812']) {
			// S7 (phase 4c) after the other states on /en/services (all of it) and /en/home (the composer, the view, the menu).
			const s7: Record<string, string[]> = { '/en/services': [S7.composer, S7.view, S7.listening, S7.change, S7.canvas, S7.streaming, S7.menu], '/ar/services': [] }
			for (const page of ['/en/services', '/ar/services']) assert.deepEqual(states('main', page, vp), ['S1 on load', 'S2 pocketed, peeking', 'S5 listening', 'S3 album, journey closed', "S4 the trail's consent card", 'S4 album, journey open', ...s7[page]], `${page} ${vp}`)
			assert.deepEqual(states('main', '/en/home', vp), ['S1 on load', 'S2 pocketed, peeking', S7.composer, S7.view, S7.menu])
			for (const page of ['/en/services', '/ar/services']) assert.deepEqual(states('banner', page, vp), ['S1 on load, banner present'])
		}
		for (const c of report.cells.filter((c) => c.pass === 'banner')) {
			assert.equal(c.banner, 'present', `${c.page} ${c.viewport}: the banner shows`)
			assert.equal(c.bannerMode, 'filter', 'the kit has OneTrust\'s filter')
			assert.ok(c.bannerHits && c.bannerHits.banner.length === 5, 'the banner\'s points were hit-tested')
			assert.ok(c.notes.some((n) => /the banner's z-index 2147483645/.test(n)), c.notes.join(' | '))
		}
		for (const c of report.cells.filter((c) => c.pass === 'main')) assert.equal(c.banner, 'absent')
		assert.ok(report.cells.find((c) => c.state === 'S5 listening')!.measure.controls.bar?.shown, 'the transcript bar shows in S5')
		assert.ok(report.cells.filter((c) => c.state.startsWith('S3') || c.state === 'S4 album, journey open').every((c) => c.measure.state.pocketView === 'pocket'))
		assert.ok(report.cells.filter((c) => c.state === 'S4 album, journey open').every((c) => c.measure.state.journey))
		assert.ok(report.cells.filter((c) => c.state === "S4 the trail's consent card").every((c) => c.measure.controls.card?.shown), "the trail's card shows in its cell")

		// No press in the banner pass, and the banner page saw none; the banner was never answered.
		assert.equal(report.presses.filter((p) => p.pass === 'banner').length, 0)
		assert.ok(report.presses.length > 0)
		assert.deepEqual({ presses: r.rec.ends.banner.presses, banner: r.rec.ends.banner.banner, filter: r.rec.ends.banner.filter, answered: r.rec.ends.banner.answered }, { presses: 0, banner: 'block', filter: 'block', answered: false })
		// Our own controls only (S7 adds Reimagine's, each a button in no link) and, in S7 at 375, Vodafone's burger to open its menu (never to close it).
		assert.ok(
			report.presses.every((p) => /^(a "Pocket it" chip|the Pocket button|the guide's mic|the trail's pill|allow, in the trail's own consent card|allow, in the journey's consent|the journey's close|the album's Back|Reimagine's launcher|a template in the composer|the view bar's "Change experience"|the view bar's "Original"|a canvas card \(its preview\)|the canvas preview's close|a streaming card's More info \(its preview\)|the streaming preview's close|Vodafone's phone menu \(its burger\), to open its menu$)/.test(p.what)),
			report.presses.map((p) => p.what).join(' | '),
		)
		// Vodafone's menu: touched only in S7, by a hover at 1366 and its burger at 375, on the two pages S7 walks: the hover taken off, the phone menu left open (one press each).
		assert.deepEqual(
			report.vodafone.map((x) => `${x.how} ${x.what.startsWith("Vodafone's menu item") ? 'a menu item' : x.what}`),
			['hover a menu item', 'hover a menu item', "press Vodafone's phone menu (its burger)", "press Vodafone's phone menu (its burger)"],
			JSON.stringify(report.vodafone),
		)
		assert.equal(report.presses.filter((p) => /^Vodafone's/.test(p.what)).length, 2, 'the burger pressed only to open the menu, once on each of two pages at 375')
		// After the phone menu's cell the walk touches nothing more on that page (Original left to the next load).
		for (const p of ['/en/services', '/en/home']) assert.ok(report.notes.some((n) => n.startsWith(`${p} 375x812 banner absent: Original was not pressed with Vodafone's menu still open`)), `${p} 375: ${report.notes.join(' | ')}`)
		// The gate on every page the layer was loaded on, read and passing on the saved pages; the corners in every cell.
		assert.deepEqual(
			report.gates.map((g) => `${g.pass} ${g.page} ${g.viewport} ${g.passes} ${g.allowed}`),
			[...['1366x900', '375x812'].flatMap((vp) => ['/en/services', '/ar/services', '/en/home'].map((p) => `main ${p} ${vp} true true`)), ...['1366x900', '375x812'].flatMap((vp) => ['/en/services', '/ar/services'].map((p) => `banner ${p} ${vp} true true`))],
		)
		for (const g of report.gates) assert.ok(g.coverage! >= 0.9 && g.sections.filter((n) => n >= 3).length >= 2, `${g.pass} ${g.page} ${g.viewport}: the gate's numbers read (${g.coverage}, ${JSON.stringify(g.sections)})`)
		for (const c of report.cells) assert.ok(c.view?.corners.right && c.view.corners.right.w > 0 && c.view.corners.right.h > 0, `${c.page} ${c.viewport} ${c.state}: the bottom-right corner's size read (${JSON.stringify(c.view?.corners)})`)
		// The view bar measured in every view but while a preview is open: then it is inert by design (ADR-0076 §7, the
		// owner's decision of 2026-11-21) and the preview's close is the control of ours in the view, hit-tested (rule c).
		const inPreview = (state: string) => state === S7.canvas || state === S7.streaming
		for (const c of report.cells.filter((c) => c.state.startsWith('S7') && c.state !== S7.composer && !inPreview(c.state))) assert.ok(c.view!.zones && c.view!.boxZones && c.measure.controls.viewbar?.shown, `${c.page} ${c.viewport} ${c.state}: the view bar measured and the box's zones read (${JSON.stringify(c.view?.boxZones)})`)
		for (const c of report.cells.filter((c) => c.state === S7.composer || c.state === S7.change)) assert.ok(c.measure.controls.composer?.shown, `${c.page} ${c.viewport} ${c.state}: the composer measured`)
		for (const c of report.cells.filter((c) => inPreview(c.state))) {
			assert.ok(c.view!.zones && c.view!.boxZones, `${c.page} ${c.viewport} ${c.state}: the box's zones read (${JSON.stringify(c.view?.boxZones)})`)
			assert.ok(c.view!.preview?.open && c.view!.preview.inBox && !c.view!.preview.modal && !c.view!.preview.anyModal, `${c.page} ${c.viewport} ${c.state}: the preview open in the box, not modal`)
			assert.ok(c.measure.controls.viewbar?.inert && !c.measure.controls.viewbar.shown && c.view!.preview.barInert === true && c.view!.preview.usable.length === 0, `${c.page} ${c.viewport} ${c.state}: the rest of the view inert under the preview (${JSON.stringify({ viewbar: c.measure.controls.viewbar, usable: c.view!.preview.usable })})`)
			assert.ok(c.measure.controls.preview?.shown && c.hits.preview?.length, `${c.page} ${c.viewport} ${c.state}: the preview's close measured and hit-tested (${JSON.stringify(c.measure.controls.preview)})`)
		}
		for (const c of report.cells.filter((c) => c.state === S7.menu)) assert.ok(c.view!.menu.open && c.view!.menu.boxes.length > 0 && c.menuHits && Object.keys(c.menuHits).length > 0, `${c.page} ${c.viewport} ${c.state}: Vodafone's menu open and its points hit-tested (${JSON.stringify(c.view!.menu)})`)

		// Vodafone's other floaters: the stand-ins listed in every cell, the tab shown and clear, the closed chat not shown.
		for (const c of [...report.cells, ...report.baselines]) {
			const tab = c.floaters.find((f) => f.what === 'div#vf-feedback-stand-in')
			const chat = c.floaters.find((f) => f.what === 'div#vf-chat-stand-in')
			assert.ok(tab?.shown && tab.position === 'fixed', `the feedback tab is listed, shown (${JSON.stringify(tab)})`)
			assert.ok(chat && !chat.shown, 'the closed chat is listed, not shown')
			assert.ok(!c.floaters.some((f) => /onetrust|accessibility-widget|vodafone-aw-icon|vg-guide|pocket-|curl-/.test(f.what)), `nothing of ours, the banner's or the widget's is listed: ${c.floaters.map((f) => f.what).join(', ')}`)
		}
		// (In S7's menu cell Vodafone's own open menu may lie over its own tab: that cell is Vodafone's pair, not ours.)
		for (const c of report.cells.filter((c) => c.pass === 'main' && c.state !== S7.menu)) assert.equal(c.floaters.find((f) => f.what === 'div#vf-feedback-stand-in')!.reaches, 'self', `${c.page} ${c.viewport} ${c.state}: a press at the feedback tab reaches it`)
		for (const c of report.cells.filter((c) => c.state === S7.menu)) assert.ok(!c.floaters.find((f) => f.what === 'div#vf-feedback-stand-in')!.reaches?.startsWith('ours:'), `${c.page} ${c.viewport} ${c.state}: a press at the feedback tab never reaches ours`)

		// The screenshots: one per cell and per baseline, the viewport's size (CSS pixels, scale 1).
		assert.equal(report.baselines.length, 10, 'one ?aixc=off baseline per page, size and pass')
		for (const c of [...report.cells, ...report.baselines]) {
			assert.ok(c.screenshot, `a screenshot (${'state' in c ? c.state : 'baseline'})`)
			const [w, h] = c.viewport.split('x').map(Number)
			assert.deepEqual(pngSize(path.join(r.out, c.screenshot!)), { width: w, height: h }, `${c.screenshot} is the viewport`)
		}
		const json = JSON.parse(fs.readFileSync(path.join(r.out, 'floating-live.json'), 'utf8'))
		assert.equal(json.cells.length, report.cells.length)
		assert.ok(json.cells.every((c: any) => c.measure.controls && c.hits), 'the boxes and the hits are in the JSON')
		assert.equal(fs.readdirSync(r.out).filter((f) => f.endsWith('.png')).length, report.cells.length + report.baselines.length)

		// The phone-sized window is not a phone, and the report says how.
		assert.ok(report.notes.some((n) => /^main 375x812: a narrowed desktop window, not a phone: .*hover is available/.test(n)), report.notes.join(' | '))

		// The clean-up: the sticker of every page removed, the trail's consent this run gave reset each time.
		assert.equal(report.cleanup.filter((l) => /removed 1 sticker\(s\) this run added, through the Pocket store/.test(l)).length, 6, report.cleanup.join(' | '))
		assert.equal(report.cleanup.filter((l) => /the trail's journey and consent this run gave: reset/.test(l)).length, 4, report.cleanup.join(' | '))
		assert.deepEqual({ stickers: r.rec.ends.main.stickers, consent: r.rec.ends.main.consent }, { stickers: 0, consent: 'unset' }, 'nothing of the run is left in the Pocket or the trail')
		assert.deepEqual(report.layerPageErrors, [])
		assert.ok(r.rec.layers.every((l) => l.reached.length === 0), 'nothing reached the internet')

		// The ?aixc=off baselines are Vodafone's page alone: every request to /__vg/ refused for that load (the
		// guide, the layer, the gateway), nothing of ours on the page; the page with the layer has the guide.
		for (const b of report.baselines) {
			assert.deepEqual(b.ours, [], `${b.pass} ${b.page} ${b.viewport}: nothing of ours on the baseline`)
			assert.ok(b.blocked > 0, `${b.pass} ${b.page} ${b.viewport}: the requests to /__vg/ were refused (${b.blocked})`)
		}
		assert.ok(
			report.cells.every((c) => c.measure.controls.mic),
			'the guide is on every page with the layer',
		)
		// What the curl paints: nothing on load; where the Pocket peeks (S2), the corner at the bottom-left
		// (physical left in both languages), much smaller than the viewport, the Pocket button inside it.
		for (const c of report.cells.filter((c) => c.state === 'S1 on load')) assert.ok(c.measure.curl.length && c.measure.curl.every((p) => !p.shown), `${c.page} ${c.viewport} S1: the curl paints nothing (${JSON.stringify(c.measure.curl)})`)
		for (const c of report.cells.filter((c) => c.state.startsWith('S2'))) {
			const [w, h] = c.viewport.split('x').map(Number)
			const parts = c.measure.curl.filter((p) => p.shown && p.box && p.polys?.length)
			assert.ok(parts.length >= 1, `${c.page} ${c.viewport} S2: the peeking corner paints (${JSON.stringify(c.measure.curl)})`)
			const all = { left: Math.min(...parts.map((p) => p.box!.left)), top: Math.min(...parts.map((p) => p.box!.top)), right: Math.max(...parts.map((p) => p.box!.right)), bottom: Math.max(...parts.map((p) => p.box!.bottom)) }
			assert.ok(all.left <= 1 && all.bottom >= h - 1, `${c.page} ${c.viewport} S2: the corner at the bottom-left (${JSON.stringify(all)})`)
			assert.ok((all.right - all.left) * (all.bottom - all.top) < 0.25 * w * h, `${c.page} ${c.viewport} S2: smaller than a quarter of the viewport (${JSON.stringify(all)})`)
			const p = c.measure.controls.pocket!.box!
			const x = (p.left + p.right) / 2
			const y = (p.top + p.bottom) / 2
			assert.ok(x > all.left && x < all.right && y > all.top && y < all.bottom, `${c.page} ${c.viewport} S2: the Pocket button in the peeking corner`)
		}
		// The fonts of our words read in every cell: the chips', the liner's in S2, the album's title in S3.
		for (const c of report.cells) assert.equal(c.measure.fontsSkipped, null, `${c.page} ${c.viewport} ${c.state}: the fonts read`)
		for (const c of report.cells.filter((c) => c.state.startsWith('S2'))) assert.ok(c.measure.fonts.some((f) => f.what === 'the liner' && f.fonts.length), `${c.page} ${c.viewport} S2: the liner's words read (${JSON.stringify(c.measure.fonts)})`)
		for (const c of report.cells.filter((c) => c.state.startsWith('S3'))) assert.ok(c.measure.fonts.some((f) => f.what === "the album's title" && f.fonts.length), `${c.page} ${c.viewport} S3: the album's title read`)
		// The drone read in every album cell, shown or not, with why not.
		for (const c of report.cells.filter((c) => c.measure.state.pocketView === 'pocket')) assert.ok(c.measure.droneState && (c.measure.drone || c.measure.droneState.why), `${c.page} ${c.viewport} ${c.state}: the drone read (${JSON.stringify(c.measure.droneState)})`)

		// Last: every cell keeps the rules. On today's product code this fails with (f) on the 1366 album cells
		// (the drone does not show) and (h) on /en/home (our words in a system font): findings F1 and F6.
		const grouped = [...new Set(report.violations.map((v) => v.replace(/^(\S+ \S+) banner \w+ (.+?): \((\w+)\).*$/, '($3) $1 $2')))]
		console.log(`# violations by rule, page, size and state:\n#   ${grouped.join('\n#   ')}`)
		assert.deepEqual(report.violations, [], 'every cell keeps the rules')
		assert.equal(report.outcome, 'passed')
		fs.rmSync(r.out, { recursive: true, force: true })
	} catch (e) {
		console.log(`# the screenshots and the JSON are kept in ${r.out}`)
		throw e
	}
})

/**
 * The live walk of 2026-11-22 (live-verify floating2) at 375×812 was a narrowed desktop Chrome, its classic 15 px
 * scrollbar taking width (the page 360 px wide). With Vodafone's phone menu open the page's scroll is locked by its
 * own rule and the scrollbar goes: the layout viewport is 375 px, and Vodafone's fixed button (right: 20px) is at 300
 * instead of 285. The kit as live here: classic scrollbars, NAV_STAND_IN's lock (the theme's .overflow-hidden), and no
 * floater stand-in of ours (the live pages have none). Rule (d) follows the viewport in those two cells only, and only
 * for Vodafone's own lock (./floating-controls.ts vodafoneScrollLock); every other cell has the scrollbar and the
 * button exactly where ?aixc=off has it.
 */
test("Vodafone's phone menu at 375 with classic scrollbars, as live: its own scroll lock widens the layout viewport under its button, and rule (d) follows it there only", { timeout: 600_000 }, async () => {
	const r = run({
		scrollbars: true,
		init: [WIDGET_DEFINED, MIC_STAND_IN, ACTORS_TEST, PRESSES, NAV_STAND_IN],
		plan: { main: { viewports: [PHONE], pages: [{ pathname: '/en/services', full: false, reimagine: 'full' }, { pathname: '/en/home', full: false, reimagine: 'short' }] }, banner: null },
	})
	try {
		const report = await r.go().catch((e) => {
			console.log(`# ${r.rec.lines.join('\n# ')}`)
			throw e
		})
		console.log(`# ${r.rec.lines.join('\n# ')}`)
		assert.equal(report.main, 'done')
		assert.deepEqual(report.violations, [], 'every cell keeps the rules')
		assert.equal(report.outcome, 'passed')
		const menu = report.cells.filter((c) => c.state === S7.menu)
		assert.deepEqual(
			menu.map((c) => c.page),
			['/en/services', '/en/home'],
			"Vodafone's menu over the view on both pages",
		)
		for (const c of menu) {
			const l = c.measure.layout!
			const where = `${c.page} ${c.viewport} ${c.state}`
			assert.ok(c.view!.menu.open && l.menu.length > 0, `${where}: Vodafone's menu marked open (${JSON.stringify(l.menu)})`)
			assert.deepEqual({ clientWidth: l.clientWidth, innerWidth: l.innerWidth, overflowY: l.overflowY, inline: l.inlineOverflow, oursUnread: l.oursUnread }, { clientWidth: 375, innerWidth: 375, overflowY: 'hidden', inline: null, oursUnread: [] }, `${where}: the scrollbar gone by the page's lock`)
			assert.ok(l.rules.length > 0 && l.rules.every((x) => x.vodafone) && l.rules.some((x) => x.selector === '.overflow-hidden'), `${where}: the lock is the theme's own rule (${JSON.stringify(l.rules)})`)
			const base = report.baselines.find((b) => b.pass === c.pass && b.page === c.page && b.viewport === c.viewport)!
			assert.deepEqual({ box: base.button!.box, viewport: base.button!.viewport }, { box: [285, 737, 55, 55], viewport: { clientWidth: 360, innerWidth: 375, gutter: 'auto' } }, `${where}: the ?aixc=off baseline with the scrollbar`)
			assert.deepEqual(c.measure.button!.box, [300, 737, 55, 55], `${where}: Vodafone's button moved with the viewport, as live`)
		}
		// Every other cell: the scrollbar there, the layout viewport 360 px, the button exactly as with ?aixc=off.
		for (const c of report.cells.filter((c) => c.state !== S7.menu)) {
			assert.equal(c.measure.layout?.clientWidth, 360, `${c.page} ${c.state}: the page's scrollbar takes its 15 px`)
			assert.deepEqual(c.measure.button?.box, [285, 737, 55, 55], `${c.page} ${c.state}: the button as with ?aixc=off`)
		}
		fs.rmSync(r.out, { recursive: true, force: true })
	} catch (e) {
		console.log(`# the screenshots and the JSON are kept in ${r.out}`)
		throw e
	}
})

test("the cookie banner showing in the main pass: 'skipped: banner', nothing pressed, the banner as it came", { timeout: 120_000 }, async () => {
	const r = run({ banner: true, plan: { main: { viewports: [DESKTOP], pages: [{ pathname: '/en/services', full: true }] }, banner: null } })
	try {
		const report = await r.go()
		assert.equal(report.main, 'skipped: banner')
		assert.equal(report.message, BANNER_MESSAGE)
		assert.ok(r.rec.lines.some((x) => x.includes(BANNER_MESSAGE)), 'the message is printed')
		assert.equal(report.presses.length, 0, 'the run pressed nothing')
		assert.equal(report.loads.length, 1, 'it stopped after the first page load')
		assert.deepEqual({ presses: r.rec.ends.main.presses, banner: r.rec.ends.main.banner, filter: r.rec.ends.main.filter, answered: r.rec.ends.main.answered }, { presses: 0, banner: 'block', filter: 'block', answered: false }, 'the page saw no press; the banner and its filter as they came, not answered')
	} finally {
		fs.rmSync(r.out, { recursive: true, force: true })
	}
})

for (const [what, body, status, message] of [
	['a bot check (a 403 "Access denied" page)', '<!doctype html><title>Access denied</title><h1>Access denied</h1><p>You do not have access.</p>', 403, /answered 403: a bot check or a block\. Nothing was pressed after it and nothing is retried/],
	['a challenge page with status 200 ("Just a moment…")', '<!doctype html><title>Just a moment...</title><div id="challenge-running">Checking your browser</div>', 200, /is a bot check or a challenge .*never tries to get past one/],
] as const) {
	test(`${what} on the first load: the run stops, nothing pressed, nothing retried, the banner pass never opens`, { timeout: 120_000 }, async () => {
		const rec = { opened: [] as string[], ends: {} as Record<string, End>, layers: [] as Layer[], lines: [] as string[] }
		const r = run({ plan: { main: ONE.main, banner: { viewports: [DESKTOP], pages: ['/en/services'] } } }, rec)
		const openMain = kit({ name: 'main', banner: false, opened: rec.opened, ends: rec.ends, layers: rec.layers })
		try {
			await assert.rejects(
				runFloatingMatrix({
					base: V,
					out: r.out,
					settleMs: 800,
					log: (x) => rec.lines.push(x),
					plan: { main: ONE.main, banner: { viewports: [DESKTOP], pages: ['/en/services'] } },
					openMain: async () => {
						const b = await openMain()
						await b.page.route((u) => u.pathname === '/en/services', (route) => route.fulfill({ status, contentType: 'text/html', body }), { times: 1 })
						return b
					},
					openBanner: kit({ name: 'banner', banner: true, opened: rec.opened, ends: rec.ends, layers: rec.layers }),
				}),
				(e: unknown) => {
					assert.ok(e instanceof FloatingStop, `a stop (${e})`)
					assert.match(e.message, message)
					assert.equal(e.report.outcome, 'stopped')
					assert.equal(e.report.presses.length, 0)
					assert.equal(e.report.loads.length, 1, 'no second load (nothing retried)')
					assert.equal(e.report.banner, 'not run')
					return true
				},
			)
			assert.deepEqual(rec.opened, ['main'], 'the banner pass never opened a browser')
			assert.equal(rec.ends.main.presses, 0, 'the page saw no press')
			assert.ok(rec.lines.some((x) => x.startsWith('STOPPED:')), 'the stop is printed')
			assert.ok(fs.existsSync(path.join(r.out, 'floating-live.json')), 'the report is written even so')
		} finally {
			fs.rmSync(r.out, { recursive: true, force: true })
		}
	})
}

/** OneTrust's banner as it may come live: without its dark filter, and (`low`) at a z-index under ours. */
const BANNER_AS_LIVE = (low: boolean) => `(() => {
	if (window.top !== window) return
	const run = () => {
		const f = document.querySelector('.onetrust-pc-dark-filter')
		if (f) f.style.display = 'none'
		const b = document.getElementById('onetrust-banner-sdk')
		if (b && ${low}) b.style.zIndex = '1000'
	}
	if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true })
	else run()
})()`

test("the banner without its full-page filter: only our points inside the banner must reach it, and every cell keeps the rules", { timeout: 180_000 }, async () => {
	const r = run({ extra: [BANNER_AS_LIVE(false)], plan: { main: null, banner: { viewports: [DESKTOP, PHONE], pages: ['/ar/services'] } } })
	try {
		const report = await r.go()
		assert.deepEqual(report.violations, [])
		assert.equal(report.cells.length, 2)
		for (const c of report.cells) {
			assert.equal(c.banner, 'present')
			assert.equal(c.bannerMode, 'no filter')
			const b = c.measure.controls.banner!.box!
			for (const hits of Object.values(c.bannerHits!.ours)) for (const h of hits) assert.ok(h.x > b.left && h.x < b.right && h.y > b.top && h.y < b.bottom, `only points inside the banner are held to it (${h.x},${h.y})`)
			assert.ok(c.bannerHits!.ours.mic?.length, `the mic, under the Arabic banner, is held to it (${JSON.stringify(c.bannerHits)})`)
			assert.ok(c.bannerHits!.ours.mic.every((h) => h.at === 'banner'), 'and a press there reaches the banner')
			assert.ok(c.notes.some((n) => /its filter does not show/.test(n)), c.notes.join(' | '))
		}
		assert.equal(report.presses.length, 0)
	} finally {
		fs.rmSync(r.out, { recursive: true, force: true })
	}
})

test("the rules can fail: a banner under our controls' z-index (and no filter) is reported against its own z-index", { timeout: 180_000 }, async () => {
	const r = run({ extra: [BANNER_AS_LIVE(true)], plan: { main: null, banner: { viewports: [DESKTOP], pages: ['/ar/services'] } } })
	try {
		const report = await r.go()
		assert.equal(report.outcome, 'violations')
		const v = report.violations.join('\n')
		assert.match(v, /\(c\) .* has z-index \d+, at or above the banner's own 1000/)
		assert.match(v, /\(c\) mic stacks at \d+, at or above the banner's own 1000/)
		assert.match(v, /\(e\) with the banner, a press at mic .* reaches mic, above the filter/)
	} finally {
		fs.rmSync(r.out, { recursive: true, force: true })
	}
})

test("the rules can fail: the accessibility button moved and a floater of Vodafone's over the Pocket button are reported; the clean-up still runs", { timeout: 180_000 }, async () => {
	const r = run({
		plan: ONE,
		hooks: {
			beforeMeasure: async (page, cell) => {
				if (!cell.state.startsWith('S2')) return
				await page.evaluate(() => {
					document.getElementById('vodafone-aw-icon')!.setAttribute('style', 'bottom: 230px')
					const p = document.querySelector('.pocket-peek')!.getBoundingClientRect()
					const f = document.createElement('div')
					f.id = 'vf-test-floater'
					f.style.cssText = `position:fixed;left:${p.left}px;top:${p.top}px;width:${p.width}px;height:${p.height}px;z-index:2147483640;background:#333`
					document.body.append(f)
				})
				await page.waitForTimeout(400)
			},
		},
	})
	try {
		const report = await r.go()
		assert.equal(report.outcome, 'violations')
		const s1 = report.cells.find((c) => c.state === 'S1 on load')!
		assert.deepEqual(s1.violations, [], 'S1, before the hook, keeps the rules')
		const v = report.cells.find((c) => c.state.startsWith('S2'))!.violations.join('\n')
		assert.match(v, /\(d\) its style attribute "bottom: 230px" is not null/)
		assert.match(v, /\(d\) its computed .*bottom: 20px -> 230px/)
		assert.match(v, /\(floaters\) pocket \[[\d,-]+\] overlaps Vodafone's fixed div#vf-test-floater/)
		assert.match(v, /\(c\) a press at pocket's point .* reaches page:div/)
		assert.ok(report.cleanup.some((l) => /removed 1 sticker\(s\)/.test(l)), report.cleanup.join(' | '))
		assert.equal(r.rec.ends.main.stickers, 0, 'the sticker this run made is gone')
	} finally {
		fs.rmSync(r.out, { recursive: true, force: true })
	}
})

test('a page load the run did not start (the page reloads itself) stops the run; the clean-up still runs', { timeout: 180_000 }, async () => {
	const r = run({
		plan: ONE,
		hooks: {
			beforeMeasure: async (page, cell) => {
				if (!cell.state.startsWith('S2')) return
				const loaded = page.waitForEvent('load')
				await page.evaluate(() => void setTimeout(() => location.reload(), 0))
				await loaded
			},
		},
	})
	try {
		await assert.rejects(r.go(), (e: unknown) => {
			assert.ok(e instanceof FloatingStop, `a stop (${e})`)
			assert.match(e.message, /which this run did not start: the run stops here and nothing is retried/)
			assert.equal(e.report.loads.at(-1)!.how, 'not started by this run')
			assert.equal(e.report.loads.length, 3)
			assert.ok(e.report.cleanup.some((l) => /removed 1 sticker\(s\)/.test(l)), e.report.cleanup.join(' | '))
			return true
		})
	} finally {
		fs.rmSync(r.out, { recursive: true, force: true })
	}
})

test('an output directory inside the repository is refused; one outside is made', () => {
	assert.throws(() => outsideRepo(path.join(ROOT, 'data', 'floating-out')), /must be outside the repository/)
	assert.throws(() => outsideRepo(path.resolve(ROOT, '..')), /must be outside the repository/)
	const dir = path.join(os.tmpdir(), `vg-floating-ok-${process.pid}`)
	try {
		assert.equal(outsideRepo(dir), dir)
		assert.ok(fs.statSync(dir).isDirectory())
	} finally {
		fs.rmSync(dir, { recursive: true, force: true })
	}
})

/* The new rules on measures made by hand (no browser): each fires where it should, and nowhere else. */

const control = (box: Box, owner: Control['owner'] = 'layer'): Control => ({ owner, box, shown: true, display: 'block', visibility: 'visible', opacity: 1, inert: false, z: '1', stackZ: 1, fixed: true })

/** A measure of nothing at 1366×900 on the page, with `over` laid on it. */
const measureOf = (over: Partial<Measure>): Measure => ({
	at: 'by hand',
	view: { width: 1366, height: 900, scrollY: 0, dir: 'ltr', lang: 'en' },
	state: { pocketView: 'page', busy: false, journey: false, mic: 'idle', listening: false, consent: null, mascot: null, covered: false },
	controls: { accessibility: control({ left: 1291, top: 825, right: 1346, bottom: 880 }, 'vodafone'), banner: null, mic: null, kbd: null, bar: null, pill: null, card: null, pocket: null, reimagine: null, tips: null, watch: null, viewbar: null, composer: null, preview: null },
	filter: null,
	curlLayers: [],
	curl: [],
	curlSkipped: null,
	mascot: null,
	drone: null,
	droneState: null,
	journeyLayer: null,
	journeyBand: null,
	albumInner: null,
	content: [],
	chips: [],
	aboveBanner: [],
	button: null,
	fonts: [],
	fontsSkipped: null,
	...over,
})
const rules = (m: Measure) => cellViolations(m, { where: 'by hand', off: null, hits: {} })

test("rule (a) holds what the curl paints, not its viewport-sized layer: a control inside the peeking corner is reported; one inside the corner's box but off the fold, the Pocket button, and the mic are not", () => {
	// The peeking corner at the bottom-left: a triangle to (260, 900) and (0, 600).
	const corner = { what: 'pocket-layer--plane', box: { left: 0, top: 600, right: 260, bottom: 900 }, shown: true, polys: [[[0, 600], [260, 900], [0, 900]]] as [number, number][][], bands: 1, inert: false }
	const base = { curl: [corner] }
	const pocket = control({ left: 22, top: 820, right: 80, bottom: 878 })
	const mic = control({ left: 1286, top: 745, right: 1350, bottom: 809 }, 'guide')
	assert.deepEqual(rules(measureOf({ ...base, controls: { ...measureOf({}).controls, pocket, mic } })), [], 'the Pocket button sits in the corner by design; the mic is far from it')
	// Inside the corner's box, above the fold line (y = 600 + 300x/260 is 830 at x = 200): not under the paint.
	assert.deepEqual(rules(measureOf({ ...base, controls: { ...measureOf({}).controls, pill: control({ left: 200, top: 610, right: 250, bottom: 650 }, 'trail') } })), [], 'a control in the box but off the painted triangle')
	const v = rules(measureOf({ ...base, controls: { ...measureOf({}).controls, pill: control({ left: 10, top: 860, right: 50, bottom: 890 }, 'trail') } }))
	assert.deepEqual(v, ["by hand by hand: (a) the curl's painted part (pocket-layer--plane) [0,600,260,900] over pill [10,860,50,890]"])
	// A layer that paints nothing is never held to the rule (the old reading's inert, viewport-sized layer).
	assert.deepEqual(rules(measureOf({ curl: [{ ...corner, shown: false, box: null, polys: [] }], controls: { ...measureOf({}).controls, pill: control({ left: 10, top: 860, right: 50, bottom: 890 }, 'trail') } })), [])
})

test('rule (f): in the album at 640 px and wider a drone that does not show is reported; under 640 px, with the journey open, the album busy, the trail\'s card open or the drone scrolled off, it is not', () => {
	const hidden = { state: 'hidden', anchor: 'none', hidden: true, shown: false, why: 'its hidden attribute is set (anchor none)', box: null }
	const album = { pocketView: 'pocket', busy: false, journey: false, mic: 'idle', listening: false, consent: null, mascot: 'idle', covered: false }
	assert.deepEqual(rules(measureOf({ state: album, droneState: hidden })), ['by hand by hand: (f) the drone did not show in the album (its hidden attribute is set (anchor none); state hidden)'])
	assert.deepEqual(rules(measureOf({ state: album, droneState: null })), ['by hand by hand: (f) the drone did not show in the album (there is no drone on the page)'])
	assert.deepEqual(rules(measureOf({ state: album, droneState: hidden, view: { width: 375, height: 812, scrollY: 0, dir: 'ltr', lang: 'en' }, controls: { ...measureOf({}).controls, accessibility: null } })), [], 'none under 640 px by design')
	assert.deepEqual(rules(measureOf({ state: { ...album, journey: true }, droneState: hidden })), [], "the journey open hides the actors' layer by design")
	assert.deepEqual(rules(measureOf({ state: { ...album, busy: true }, droneState: hidden })), [], 'the page still turning')
	assert.deepEqual(rules(measureOf({ state: album, droneState: { ...hidden, hidden: false, why: 'off the screen' } })), [], 'scrolled off, it is there')
	assert.deepEqual(rules(measureOf({ state: album, droneState: hidden, controls: { ...measureOf({}).controls, card: control({ left: 930, top: 156, right: 1350, bottom: 560 }, 'trail') } })), [], "the trail's card open: the drone makes room for it (F6b)")
	assert.deepEqual(rules(measureOf({ state: { ...album, pocketView: 'page' }, droneState: hidden })), [], 'not in the album')
	const box = { left: 1100, top: 200, right: 1180, bottom: 256 }
	assert.deepEqual(rules(measureOf({ state: album, drone: box, droneState: { ...hidden, hidden: false, shown: true, why: null, box } })), [], 'shown')
})

test('rule (h): our words drawn in a system font are reported, each font by name; in a web font they are not', () => {
	const font = (familyName: string, isCustomFont: boolean) => ({ familyName, postScriptName: familyName, isCustomFont, glyphCount: 9 })
	assert.deepEqual(rules(measureOf({ fonts: [{ what: 'a chip', text: 'Pocket it', fonts: [font('vodafone_rgbold', true)] }] })), [])
	assert.deepEqual(rules(measureOf({ fonts: [{ what: 'a chip', text: 'Pocket it', fonts: [font('Helvetica', false)] }, { what: "the album's Back", text: 'Back to the page', fonts: [font('Vodafone Rg', true), font('Arial', false)] }] })), ['by hand by hand: (h) our text drawn in a system font: a chip "Pocket it" Helvetica', 'by hand by hand: (h) our text drawn in a system font: the album\'s Back "Back to the page" Arial'])
})
