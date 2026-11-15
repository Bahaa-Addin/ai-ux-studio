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
 * motion-report.json; the frame cost read from Chrome; a press refused when something not the layer's
 * own is at the press point; 'skipped: banner' with nothing pressed; a stop on a 403 and on a challenge
 * page with nothing retried; clean-up of the sticker; nothing reaching the internet.
 *
 * What it cannot show: Owl's own motion (autoplay, its loop's jump back, drags) and whether Vodafone's
 * carousels move at all; Vodafone's scripts (Dynatrace, OneTrust's real banner, Angular's widget) and
 * their cost, so the frame numbers here are headless Chromium's on a script-free page, not Chrome's on
 * the live one; the HTTP cache (the kit's routes bypass it); the real scrollbar of headed Chrome.
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

import type { Page } from 'playwright'

import { BANNER_MESSAGE, COMBOS, DESKTOP, LOADS_PER_COMBO, MAX_LOADS, MAX_PAGE_REQUESTS, type MotionHooks, MotionFailure, type MotionReport, MotionStop, requestsLine, runMotion } from '../live/motion.live.test.ts'
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

const STEPS = ['a', 'b', '1', '5a', '2', '3', '5b', '3c', '4', '6']
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
			// (2) The flight: 10 frames 150 ms apart and the corner.
			const fl = c.flight!.frames
			assert.equal(fl.length, 11, `${c.name}: 10 frames of the flight and one of the corner`)
			assert.ok(
				fl.some((f) => f.sample?.flying),
				`${c.name}: the card was filmed in flight`,
			)
			assert.ok(fl.at(-2)!.t >= 9 * 150 - 5, `${c.name}: the frames 150 ms apart (${fl.map((f) => f.t).join(' ')})`)
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
			assert.ok(c.close!.frames.length >= 4, `${c.name}: the dash back filmed (${c.close!.frames.length} frames)`)
			// (4) The portal: frames every 250 ms until the navigation, then Back.
			const po = c.portal!
			assert.ok(po.navigatedMs! > 2000 && po.navigatedMs! < 9500, `${c.name}: navigated after the transition (${po.navigatedMs} ms)`)
			assert.ok(po.frames.length >= 8, `${c.name}: the transition filmed (${po.frames.length} frames)`)
			assert.ok(po.states.length >= 2, `${c.name}: the portal's states read (${po.states.join(' → ')})`)
			assert.equal(po.status, 200, `${c.name}: the destination answered`)
			assert.equal(c.back!.frames.length, 6, `${c.name}: Back filmed`)
			// (5) The frame cost, with the album closed and open.
			for (const cost of [c.cost.baseline!, c.cost.album!]) {
				assert.ok(cost.frames > 100, `${c.name} ${cost.label}: frames counted (${cost.frames})`)
				for (const k of ['taskMs', 'scriptMs', 'layoutMs', 'recalcStyleMs', 'layoutCount', 'recalcStyleCount', 'over33', 'over50'] as const) assert.ok(Number.isFinite(cost[k]) && cost[k] >= 0, `${c.name} ${cost.label}: ${k} read (${cost[k]})`)
				assert.ok(cost.taskMs > 0, `${c.name} ${cost.label}: Chrome's task time read (${cost.taskMs})`)
			}
			assert.equal(c.cost.baseline!.view, 'page')
			assert.equal(c.cost.baseline!.stickers, 0, `${c.name}: nothing pocketed for the baseline`)
			assert.equal(c.cost.album!.view, 'pocket')
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
		assert.ok(report.files.length >= 4 * (2 + 11 + 15 + 4 + 8 + 1 + 6), `screenshots (${report.files.length})`)
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
