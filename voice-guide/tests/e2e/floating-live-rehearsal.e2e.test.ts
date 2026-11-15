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
 *   and 375×812; the banner pass (the kit's BANNER_STAND_IN: OneTrust's banner and its full-page filter) in
 *   S1 at both sizes with no press. Every cell keeps the rules; 20 page loads at least 1.2 s apart; a
 *   screenshot of the viewport for every cell and baseline at the viewport's size; the JSON written; a
 *   stand-in of another of Vodafone's floaters listed and clear; the layer's own data cleaned up; nothing
 *   reached the internet.
 * - The banner showing in the main pass: 'skipped: banner', nothing pressed, the banner as it came.
 * - A bot check (403 "Access denied") and a challenge page (200 "Just a moment…") on the first load: the run
 *   stops, nothing is pressed, nothing is retried, the banner pass never opens.
 * - OneTrust's banner as it may come live: without its full-page filter (then only our points inside the
 *   banner are held to it, and the cells pass), and under our z-index (then rule (c) names the banner's own).
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
import { WIDGET_DEFINED } from './floating-controls.ts'
import { type Layer, type LayerGateway, launchLayer, startLayerGateway, V } from './vodafone-layer.ts'

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

const INIT = [WIDGET_DEFINED, MIC_STAND_IN, ACTORS_TEST, PRESSES, OTHER_FLOATERS]

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
function kit(o: { name: 'main' | 'banner'; banner: boolean; opened: string[]; ends: Record<string, End>; layers: Layer[]; extra?: string[] }) {
	return async () => {
		const name = o.name
		o.opened.push(name)
		const l = await launchLayer(gw, { banner: o.banner, themeClear: true, owl: true, initScripts: [...INIT, ...(o.extra ?? [])] })
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

const run = ({ banner, extra, ...o }: Partial<FloatingOptions> & { banner?: boolean; extra?: string[] }, rec = { opened: [] as string[], ends: {} as Record<string, End>, layers: [] as Layer[], lines: [] as string[] }) => {
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
				openMain: kit({ name: 'main', banner: !!banner, opened: rec.opened, ends: rec.ends, layers: rec.layers, extra }),
				openBanner: kit({ name: 'banner', banner: true, opened: rec.opened, ends: rec.ends, layers: rec.layers, extra }),
				...o,
			}),
	}
}

const ONE: Plan = { main: { viewports: [DESKTOP], pages: [{ pathname: '/en/services', full: false }] }, banner: null }

test('the whole live run on the saved pages: every cell keeps the rules, 20 page loads, a screenshot per cell, the JSON, the clean-up', { timeout: 600_000 }, async () => {
	const r = run({})
	const t0 = Date.now()
	try {
		const report = await r.go().catch((e) => {
			console.log(`# ${r.rec.lines.join('\n# ')}`)
			throw e
		})
		console.log(`# ${r.rec.lines.join('\n# ')}`)
		console.log(`# the whole run took ${Math.round((Date.now() - t0) / 1000)} s`)
		assert.deepEqual(report.violations, [], 'every cell keeps the rules')
		assert.equal(report.outcome, 'passed')
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
			for (const page of ['/en/services', '/ar/services']) assert.deepEqual(states('main', page, vp), ['S1 on load', 'S2 pocketed, peeking', 'S5 listening', 'S3 album, journey closed', "S4 the trail's consent card", 'S4 album, journey open'], `${page} ${vp}`)
			assert.deepEqual(states('main', '/en/home', vp), ['S1 on load', 'S2 pocketed, peeking'])
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
		assert.ok(
			report.presses.every((p) => /^(a "Pocket it" chip|the Pocket button|the guide's mic|the trail's pill|allow, in the trail's own consent card|allow, in the journey's consent|the journey's close|the album's Back)/.test(p.what)),
			report.presses.map((p) => p.what).join(' | '),
		)

		// Vodafone's other floaters: the stand-ins listed in every cell, the tab shown and clear, the closed chat not shown.
		for (const c of [...report.cells, ...report.baselines]) {
			const tab = c.floaters.find((f) => f.what === 'div#vf-feedback-stand-in')
			const chat = c.floaters.find((f) => f.what === 'div#vf-chat-stand-in')
			assert.ok(tab?.shown && tab.position === 'fixed', `the feedback tab is listed, shown (${JSON.stringify(tab)})`)
			assert.ok(chat && !chat.shown, 'the closed chat is listed, not shown')
			assert.ok(!c.floaters.some((f) => /onetrust|accessibility-widget|vodafone-aw-icon|vg-guide|pocket-|curl-/.test(f.what)), `nothing of ours, the banner's or the widget's is listed: ${c.floaters.map((f) => f.what).join(', ')}`)
		}
		for (const c of report.cells.filter((c) => c.pass === 'main')) assert.equal(c.floaters.find((f) => f.what === 'div#vf-feedback-stand-in')!.reaches, 'self', `${c.page} ${c.viewport} ${c.state}: a press at the feedback tab reaches it`)

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
