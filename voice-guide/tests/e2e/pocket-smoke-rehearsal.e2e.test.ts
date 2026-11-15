/**
 * The rehearsal of the Pocket's live smoke (live plan phase 3, step S17): the same flow as
 * tests/live/pocket.live.test.ts (tests/live/pocket-smoke.ts, runPocketSmoke) on the saved pages through
 * the live-page kit (./vodafone-layer.ts: offline, the signed-out theme's localStorage clear, Owl's layout,
 * the accessibility widget in its real shape and defined as a custom element), so the flow is proven
 * without touching Vodafone's site.
 *
 * - English and Arabic Services, no banner: every step passes, the report has them all, at most six
 *   page loads at least 1.2 s apart, the request count of the sticker's link is reported (the kit's
 *   routes bypass the HTTP cache, so no cache reuse is asserted), nothing reached the internet.
 * - OneTrust's banner showing (the kit's stand-in): the flow stops with the banner message and reports
 *   'skipped: banner'; nothing was pressed, the banner and its filter are as they came.
 * - A bot check (a 403 "Access denied" page for the first load): the flow stops with the bot message.
 * - The rules can fail: something moving the accessibility button (a test hook writes its style) makes
 *   step (i) fail.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { gunzipSync } from 'node:zlib'

import type { Page } from 'playwright'

import { BANNER_MESSAGE, runPocketSmoke, SmokeFailure, type SmokeHooks, SmokeStop } from '../live/pocket-smoke.ts'
import { type LayerGateway, launchLayer, REPLAY, startLayerGateway, V, watch } from './vodafone-layer.ts'

const PORT = 4495
let gw: LayerGateway

before(async () => {
	gw = await startLayerGateway(PORT, { trail: true })
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

/** The kit refuses a fetch for a page: the destination is served from the saved pages by a route of the page's own (as pocket-portal-live does). */
const serveDestination: SmokeHooks['beforeDestination'] = async (page, url) => {
	const pathname = new URL(url).pathname
	const body = savedHtml(pathname) ?? savedHtml(pathname.startsWith('/ar/') ? '/ar/home' : '/en/promotions')!
	await page.route(
		(u) => u.href.split('#')[0] === url,
		(route) => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', headers: { 'cache-control': 'max-age=14400, public', vary: 'Accept-Encoding' }, body }),
	)
}

const quickSettle: SmokeHooks['settle'] = (page) => page.waitForTimeout(300)

const STEPS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i']

const launch = (o: { banner?: boolean } = {}) => launchLayer(gw, { themeClear: true, owl: true, banner: o.banner, initScripts: [WIDGET_DEFINED, PRESSES] })

const stickersLeft = (page: Page) =>
	page.evaluate(async () => {
		const p = (window as any).__aixc?.demos?.pocket
		return p ? (p.store.all() as any[]).length : -1
	})

for (const pathname of ['/en/services', '/ar/services']) {
	test(`${pathname}, no banner: the whole flow passes on the saved page, every step reported`, { timeout: 240_000 }, async () => {
		const l = await launch()
		try {
			const seen = watch(l.page)
			const lines: string[] = []
			const report = await runPocketSmoke(l.page, { base: V, path: pathname, log: (x) => lines.push(x), hooks: { settle: quickSettle, beforeDestination: serveDestination } })
			console.log(`# ${pathname}\n# ${lines.join('\n# ')}`)
			assert.equal(report.outcome, 'passed')
			assert.deepEqual(
				report.steps.map((s) => s.id),
				STEPS,
				'every step, in order',
			)
			assert.ok(
				report.steps.every((s) => s.ok),
				JSON.stringify(report.steps),
			)
			assert.ok(report.loads.length <= 6, `at most six page loads (${report.loads.length})`)
			assert.deepEqual(
				report.loads.map((x) => x.how),
				['open', 'reload', "the sticker's link", 'Back'],
			)
			for (let i = 1; i < report.loads.length; i++) assert.ok(report.loads[i].at - report.loads[i - 1].at >= 1200, `loads at least 1.2 s apart (${report.loads[i].at - report.loads[i - 1].at} ms)`)
			// The request count: reported as measured (the routes bypass the HTTP cache: no reuse asserted).
			const r = report.requests!
			assert.ok(r, 'the request count is in the report')
			assert.match(r.line, /^the destination was requested \d+ times from the network \(fetch: \d+, navigation: \d+, from cache: \d+\)/)
			assert.ok(r.navigation >= 1, `the navigation's document request was seen (${JSON.stringify(r)})`)
			assert.ok(r.network <= r.fetch + r.navigation, `the network count is the fetch and the navigation less what the cache served (${JSON.stringify(r)})`)
			assert.equal(r.status, 200, "the navigation's status")
			assert.ok(lines.some((x) => x.includes(r.line)), 'the line is printed')
			assert.ok(
				lines.some((x) => /Cache-Control: .*; Vary: .*; Set-Cookie names: /.test(x)),
				'the cache headers and the cookie names are printed',
			)
			console.log(`# ${pathname}: ${r.line}; Cache-Control ${r.cacheControl.join(' | ')}; Vary ${r.vary.join(' | ')}; the portal ran: ${r.portalRan}`)
			assert.equal(report.steps.find((s) => s.id === 'g')!.numbers!.allowedHere, true, "the trail's consent card showed and was allowed")
			// Clean-up: only the layer's own records, removed.
			assert.equal(await stickersLeft(l.page), 0, 'the sticker this run made is gone')
			assert.equal(await l.page.evaluate(() => (window as any).__vgTrailActive?.state?.consent), 'unset', "the trail's consent this run gave is reset")
			assert.ok(report.cleanup.some((x) => /removed 1 sticker/.test(x)), report.cleanup.join(' | '))
			assert.ok(report.presses > 0)
			assert.deepEqual(seen.pageErrors, [], 'no page errors')
			assert.deepEqual(l.reached, [], 'nothing reached the internet')
		} finally {
			await l.close()
		}
	})
}

test("the cookie banner showing: the flow stops with the banner message, 'skipped: banner', and presses nothing", { timeout: 120_000 }, async () => {
	const l = await launch({ banner: true })
	try {
		const lines: string[] = []
		const report = await runPocketSmoke(l.page, { base: V, path: '/en/services', log: (x) => lines.push(x), hooks: { settle: quickSettle, beforeDestination: serveDestination } })
		assert.equal(report.outcome, 'skipped: banner')
		assert.equal(report.message, BANNER_MESSAGE)
		assert.equal(BANNER_MESSAGE, 'The cookie banner is showing. Answer it yourself in this browser window (this test never does), then run the test again.')
		assert.ok(lines.some((x) => x.includes(BANNER_MESSAGE)), 'the message is printed')
		assert.equal(report.presses, 0, 'the flow pressed nothing')
		assert.equal(await l.page.evaluate(() => (window as any).__presses), 0, 'the page saw no press at all')
		assert.equal(report.loads.length, 1, 'one page load')
		const banner = await l.page.evaluate(() => ({
			banner: getComputedStyle(document.getElementById('onetrust-banner-sdk')!).display,
			filter: getComputedStyle(document.querySelector('.onetrust-pc-dark-filter')!).display,
			answered: document.cookie.includes('OptanonAlertBoxClosed'),
		}))
		assert.deepEqual(banner, { banner: 'block', filter: 'block', answered: false }, 'the banner and its filter as they came, not answered')
		assert.equal(await stickersLeft(l.page), 0, 'nothing pocketed')
	} finally {
		await l.close()
	}
})

test('a bot check (a 403 "Access denied" page for the first load): the flow stops with the bot message', { timeout: 120_000 }, async () => {
	const l = await launch()
	try {
		await l.page.route(
			(u) => u.pathname === '/en/services',
			(route) => route.fulfill({ status: 403, contentType: 'text/html', body: '<!doctype html><title>Access denied</title><h1>Access denied</h1><p>You do not have access.</p>' }),
			{ times: 1 },
		)
		const lines: string[] = []
		await assert.rejects(
			runPocketSmoke(l.page, { base: V, path: '/en/services', log: (x) => lines.push(x), hooks: { settle: quickSettle } }),
			(e: unknown) => {
				assert.ok(e instanceof SmokeStop, `a stop, not a failure (${e})`)
				assert.match(e.message, /answered 403: a bot check or a block\. Nothing was pressed after it and nothing is retried/)
				assert.equal(e.report.outcome, 'stopped')
				assert.equal(e.report.presses, 0)
				assert.equal(e.report.loads.length, 1, 'no second load (nothing retried)')
				return true
			},
		)
		assert.ok(lines.some((x) => x.startsWith('STOPPED:')), 'the stop is printed')
		assert.equal(await l.page.evaluate(() => (window as any).__presses ?? 0), 0, 'the page saw no press')
	} finally {
		await l.close()
	}
})

test('a challenge page with status 200 ("Just a moment…"): the flow stops with the bot message too', { timeout: 120_000 }, async () => {
	const l = await launch()
	try {
		await l.page.route(
			(u) => u.pathname === '/en/services',
			(route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Just a moment...</title><div id="challenge-running">Checking your browser</div>' }),
			{ times: 1 },
		)
		await assert.rejects(runPocketSmoke(l.page, { base: V, path: '/en/services', log: () => {}, hooks: { settle: quickSettle } }), (e: unknown) => {
			assert.ok(e instanceof SmokeStop, `a stop (${e})`)
			assert.match(e.message, /is a bot check or a challenge .*never tries to get past one/)
			return true
		})
	} finally {
		await l.close()
	}
})

test("the rules can fail: something moving the accessibility button makes step (i) fail", { timeout: 240_000 }, async () => {
	const l = await launch()
	try {
		const lines: string[] = []
		await assert.rejects(
			runPocketSmoke(l.page, {
				base: V,
				path: '/en/services',
				log: (x) => lines.push(x),
				hooks: {
					settle: quickSettle,
					beforeDestination: serveDestination,
					beforeCompare: (page) => page.evaluate(() => document.getElementById('vodafone-aw-icon')!.setAttribute('style', 'bottom: 230px')),
				},
			}),
			(e: unknown) => {
				assert.ok(e instanceof SmokeFailure, `a failure (${e})`)
				assert.match(e.message, /^\(i\) Vodafone's accessibility button and cookie banner as at the start: .*button style attribute null → "bottom: 230px".*button bottom 20px → 230px/)
				assert.equal(e.report.outcome, 'failed')
				assert.deepEqual(
					e.report.steps.map((s) => `${s.id}${s.ok ? '' : ' failed'}`),
					['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i failed'],
				)
				return true
			},
		)
		assert.ok(lines.some((x) => x.startsWith('FAILED: (i)')), 'the failure is printed')
		// The clean-up still ran.
		assert.equal(await stickersLeft(l.page), 0, 'the sticker this run made is gone after the failure too')
	} finally {
		await l.close()
	}
})
