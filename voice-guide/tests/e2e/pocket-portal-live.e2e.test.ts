/**
 * The Pocket's portal on Vodafone's own pages (live plan phase 3, S13; ADR-0065; experiences ADR-0005), on
 * the saved pages with the live-page kit (./vodafone-layer.ts), English and Arabic, at 1366×900 and 375×812.
 * A card is pocketed through its chip and the album opened with the Pocket button, as a person would; then:
 *
 * 1. Scope: Vodafone's header, footer and card links and a link of the layer's own in the album are never
 *    taken (not prevented, no overlay, native); an inline onclick="footerHandler(event)" runs once, on a
 *    native press and on a sticker's press alike (the navigation copies no handler).
 * 2. A sticker's link (no target; the card's link): a plain press runs the transition (one overlay, every
 *    node the portal adds marked data-aixc and data-vg), then this tab goes to the sticker's address.
 *    Modified presses, the middle button and target="_blank" are not taken.
 * 3. One request for the destination (OD-4): through the kit's routes (which bypass the HTTP cache) one
 *    fetch before the navigation and no frame loading it by address; on a real local HTTP server sending
 *    Vodafone's `Cache-Control: max-age=14400, public` (no routes at all, so the browser's cache is used)
 *    the server sees the destination once across the transition and the navigation; with
 *    `Vary: Accept-Encoding` too; without cache headers the navigation asks again (recorded).
 * 4. Vodafone's accessibility widget (a defined <accessibility-widget> holding button#vodafone-aw-icon) is
 *    constructed once, never copied, and its button is as with ?aixc=off at every sample; OneTrust's
 *    #onetrust-consent-sdk is never copied and never written to.
 * 5. The frame runs nothing: the destination's inline script (a flag, localStorage.clear(), a pixel)
 *    never runs before the navigation; the frame has a srcdoc, no src, no allow-scripts.
 * 6. Failure: a failed fetch still navigates, and a second press works; an error inside the portal lets
 *    the click navigate natively, the layer stays up; a guard stop mid-transition gives the page back.
 * 7. Escape cancels on live. 8. Back reopens the album at once at the same scroll; a bfcache pageshow
 *    removes the overlay. 9. Reduced motion: the link just navigates.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { gunzipSync } from 'node:zlib'

import { chromium, type Page } from 'playwright'

import { ROOT } from '#shared/config.ts'

import { loaderExperiences, loaderScript, OFFLINE_ARGS } from '../../tools/demo-browser.ts'
import { DESKTOP, type Layer, type LayerGateway, launchLayer, open, PHONE, REPLAY, startLayerGateway, V, watch, WIDGET_STAND_IN } from './vodafone-layer.ts'

const PORT = 4497
/** The real HTTP server of test 3 (any free port: it is the test's own, on 127.0.0.1). */
let gw: LayerGateway
const chunks = { pocket: '', portal: '', scene: '' }

before(async () => {
	gw = await startLayerGateway(PORT)
	const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'packages/sdk/dist/aixc/manifest.json'), 'utf8')) as { files: { file: string; entry: string | null }[] }
	const named = (entry: string) => manifest.files.find((f) => f.entry === entry)?.file ?? ''
	chunks.pocket = named('src/host/demos/pocket.js')
	chunks.portal = named('src/host/demos/portal.js')
	chunks.scene = named('src/pocket/portal/controller.js')
})
after(async () => {
	await gw?.close()
})

/* eslint-disable @typescript-eslint/no-explicit-any */

/* ------------------------------------------------------------------ the saved pages */

const crawl = (JSON.parse(fs.readFileSync(path.join(REPLAY, 'crawl.json'), 'utf8')) as { pages: { url: string; snapshot?: string }[] }).pages
const savedFile = new Map(crawl.filter((p) => p.snapshot).map((p) => [new URL(p.url).pathname, path.join(REPLAY, p.snapshot!)]))
/** A saved page's rendered HTML, as the replay serves it. */
const savedHtml = (pathname: string) => {
	const file = savedFile.get(pathname)
	if (!file) return null
	const raw = fs.readFileSync(file)
	return (file.endsWith('.gz') ? gunzipSync(raw) : raw).toString('utf8')
}
/** What a destination the replay does not have is drawn from (a rendered page in the same language). */
const destinationHtml = (pathname: string) => savedHtml(pathname) ?? savedHtml(pathname.startsWith('/ar/') ? '/ar/home' : '/en/promotions')!

/* ------------------------------------------------------------------ in the page */

/**
 * Before anything of the page: every click and auxclick on a link as the window sees it last (prevented
 * or not, by anyone before); with window.__stubNav set, the window then prevents it (the navigation
 * stubbed). Every .vf-portal ever added is counted. footerHandler counts per address. Every state the
 * portal reports is kept.
 */
const PROBE = `(() => {
	if (window.top !== window) return
	window.__clicks = []
	const rec = (e) => {
		const a = e.target && e.target.closest && e.target.closest('a[href], area[href]')
		if (!a) return
		window.__clicks.push({ type: e.type, href: a.href, prevented: e.defaultPrevented, probe: a.getAttribute('data-probe') || '' })
		if (window.__stubNav) e.preventDefault()
	}
	window.addEventListener('click', rec)
	window.addEventListener('auxclick', rec)
	window.__portals = 0
	new MutationObserver((ms) => {
		for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1 && n.matches('.vf-portal')) window.__portals++
	}).observe(document, { childList: true, subtree: true })
	window.__footer = {}
	window.footerHandler = (event) => {
		const a = event && event.currentTarget && event.currentTarget.href
		window.__footer[a] = (window.__footer[a] || 0) + 1
	}
	window.__states = []
	window.__stateAt = {}
	document.addEventListener('vf-portal:state', (e) => {
		window.__states.push(e.detail.state)
		window.__stateAt[e.detail.state] ??= performance.now()
	})
	// When the press reached the page (capture, before anything else): to measure what the click handler costs.
	window.addEventListener('click', () => (window.__clickAt = performance.now()), true)
	window.__shows = []
	window.addEventListener('pageshow', (e) => window.__shows.push(e.persisted))
})()`

/** Vodafone's accessibility widget as a defined custom element (the real one is Angular's), counting its life. */
const WIDGET_DEFINED = `(() => {
	if (window.top !== window || customElements.get('accessibility-widget')) return
	window.__aw = { constructed: 0, connected: 0 }
	customElements.define('accessibility-widget', class extends HTMLElement {
		constructor() { super(); window.__aw.constructed++ }
		connectedCallback() { window.__aw.connected++ }
	})
})()`

/** OneTrust's SDK as a visitor who answered it has it: in the page, its banner and filter hidden. */
const CONSENT_ANSWERED = `(() => {
	if (window.top !== window || !/^\\/(en|ar)\\//.test(location.pathname)) return
	const add = () => {
		if (document.getElementById('onetrust-consent-sdk')) return
		const sdk = document.createElement('div')
		sdk.id = 'onetrust-consent-sdk'
		sdk.setAttribute('data-stand-in', 'onetrust')
		sdk.innerHTML = '<div class="onetrust-pc-dark-filter" style="display:none;position:fixed;inset:0;z-index:2147483645"></div><div id="onetrust-banner-sdk" style="display:none;position:fixed;bottom:1rem;left:1rem;width:375px;z-index:2147483645">We use cookies.</div>'
		document.body.appendChild(sdk)
		window.__otHtml = sdk.outerHTML
	}
	if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', add, { once: true })
	else add()
})()`

/* ------------------------------------------------------------------ steps */

async function pocketReady(page: Page) {
	await page.waitForFunction(() => (window as any).__aixc?.demos?.pocket?.chips, null, { timeout: 15_000 })
	await page.evaluate(() => (window as any).__aixc.demos.pocket.store.ready)
}

/** Pockets the first card whose model has a link to another page of this origin, through its chip; returns the card's link. */
async function pressChipWithLink(page: Page) {
	const at = await page.evaluate(async () => {
		const tick = () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(done, 60))))
		const items = new Map<string, any>(((window as any).__aixc.model?.sections ?? []).flatMap((s: any) => s.items.map((i: any) => [i.id, i])))
		for (const chip of document.querySelectorAll<HTMLElement>('.pocket-chips .pocket-cta[data-pocket-for]')) {
			const id = chip.dataset.pocketFor!
			const href = items.get(id)?.cta?.href
			if (!href) continue
			const u = new URL(href, location.href)
			if (u.origin !== location.origin || u.pathname === location.pathname || !/^\/(en|ar)\//.test(u.pathname)) continue
			const card = [...document.querySelectorAll<HTMLElement>(`#main-content [data-aixc-item="${CSS.escape(id)}"]`)].find((c) => !c.closest('.owl-item.cloned'))
			if (!card) continue
			card.scrollIntoView({ block: 'center', inline: 'nearest' })
			await tick()
			const r = chip.getBoundingClientRect()
			const x = r.left + r.width / 2
			const y = r.top + r.height / 2
			const hit = document.elementFromPoint(x, y)
			if (r.width && hit && (hit === chip || chip.contains(hit))) return { id, x, y, href: u.href }
		}
		return null
	})
	assert.ok(at, 'a chip a press reaches, on a card that links to another page of this site')
	await page.mouse.click(at.x, at.y)
	await page.waitForFunction((id) => (window as any).__aixc.demos.pocket.store.all().some((r: any) => r.id === id), at.id, { timeout: 5_000 })
	return at.href
}

const albumShows = (page: Page, timeout = 10_000) =>
	page.waitForFunction(
		() => {
			const s = (window as any).__aixc?.demos?.pocket?.state
			return s?.view === 'pocket' && !s.busy && !document.getElementById('pocket-output')?.hidden
		},
		null,
		{ timeout },
	)

async function pressPocketButton(page: Page) {
	await page.waitForSelector('.pocket-peek[data-state="shown"]', { timeout: 5_000 })
	await page.waitForFunction(() => document.querySelectorAll('.curl-host--flying').length === 0, null, { timeout: 8_000 })
	await page.waitForTimeout(900)
	const box = await page.evaluate(() => {
		const r = document.querySelector('.pocket-peek[data-state="shown"]')!.getBoundingClientRect()
		return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
	})
	await page.mouse.click(box.x, box.y)
	await albumShows(page)
}

/** Every request for a file of the layer by chunk name, and whether each finished. */
function chunkRequests(page: Page) {
	const seen = { asked: {} as Record<string, number>, done: {} as Record<string, number> }
	const name = (u: string) => Object.entries(chunks).find(([, file]) => file && u.endsWith(`/aixc/${file}`))?.[0]
	page.on('request', (r) => {
		const n = name(r.url())
		if (n) seen.asked[n] = (seen.asked[n] ?? 0) + 1
	})
	page.on('requestfinished', (r) => {
		const n = name(r.url())
		if (n) seen.done[n] = (seen.done[n] ?? 0) + 1
	})
	return seen
}

const until = async (check: () => boolean | Promise<boolean>, ms: number) => {
	const end = Date.now() + ms
	while (!(await check()) && Date.now() < end) await new Promise((done) => setTimeout(done, 50))
	return check()
}

/** The portal is on the page (its stylesheet put in) and its scene has arrived and had time to paint the hall. */
async function portalWarm(page: Page, seen: ReturnType<typeof chunkRequests>) {
	await page.waitForSelector('style[data-aixc-css="pocket-portal"]', { state: 'attached', timeout: 10_000 })
	assert.ok(await until(() => (seen.done.scene ?? 0) > 0, 10_000), `the scene's chunk arrived (${JSON.stringify(seen)})`)
	await page.waitForTimeout(1_500)
}

/** The album's first sticker link: its href, target and a press point (scrolled into view first). */
async function stickerLink(page: Page) {
	return page.evaluate(async () => {
		const a = document.querySelector<HTMLAnchorElement>('#pocket-output .pocket-sticker a[href]')
		if (!a) return null
		a.scrollIntoView({ block: 'center' })
		await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(done, 60))))
		const r = a.getBoundingClientRect()
		return { href: a.href, target: a.getAttribute('target'), x: r.left + r.width / 2, y: r.top + r.height / 2, scrollY: window.scrollY }
	})
}

/** Requests for one address: what kind, from which frame, when. */
function requestsFor(page: Page, url: string) {
	const seen: { type: string; main: boolean; at: number }[] = []
	page.on('request', (r) => {
		if (r.url().split('#')[0] !== url) return
		seen.push({ type: r.resourceType(), main: r.frame() === page.mainFrame(), at: Date.now() })
	})
	return seen
}

/** The destination served from the saved pages through a route of the page's own (the kit's would refuse a fetch for it). */
async function serveDestination(page: Page, url: string, o: { body?: string; abortFetch?: boolean; status?: (type: string) => number } = {}) {
	const body = o.body ?? destinationHtml(new URL(url).pathname)
	await page.route(
		(u) => u.href.split('#')[0] === url,
		(route) => {
			const type = route.request().resourceType()
			if (o.abortFetch && type === 'fetch') return route.abort()
			const status = o.status?.(type) ?? 200
			if (status === 204) return route.fulfill({ status: 204, body: '' })
			return route.fulfill({ status, contentType: 'text/html; charset=utf-8', body })
		},
	)
}

/** What the portal put on the page, and whether every node it added is marked (copies of Vodafone's page are marked at their root). */
const overlayNow = (page: Page) =>
	page.evaluate(() => {
		const roots = document.querySelectorAll('.vf-portal')
		const root = roots[0] as HTMLElement | undefined
		const marked = (n: Element) => n.hasAttribute('data-aixc') && n.hasAttribute('data-vg')
		const unmarked: string[] = []
		if (root)
			for (const n of [root, ...root.querySelectorAll('*')]) {
				if (marked(n)) continue
				// Inside a frozen copy of the page (its root is marked and inert): the page's markup, copied.
				const copy = n.parentElement?.closest('[inert]')
				if (copy && copy !== root && root.contains(copy) && marked(copy)) continue
				unmarked.push(`${n.localName}.${n.getAttribute('class') ?? ''}`)
			}
		const frame = root?.querySelector('iframe') ?? null
		return {
			count: roots.length,
			unmarked,
			destination: root?.dataset.destination ?? null,
			frame: frame ? { src: frame.getAttribute('src'), srcdoc: frame.hasAttribute('srcdoc'), sandbox: frame.getAttribute('sandbox') } : null,
			html: document.documentElement.dataset.vfPortal ?? null,
			overflow: getComputedStyle(document.documentElement).overflow,
			awCopies: root ? root.querySelectorAll('accessibility-widget, [data-stand-in], .vf-aw-fab').length : 0,
		}
	})

const pageNow = (page: Page) =>
	page.evaluate(() => ({
		url: location.href,
		portals: (window as any).__portals as number,
		overlay: document.querySelectorAll('.vf-portal').length,
		html: document.documentElement.dataset.vfPortal ?? null,
		overflow: getComputedStyle(document.documentElement).overflow,
		layer: (window as any).__aixc?.state ?? null,
		view: (window as any).__aixc?.demos?.pocket?.state?.view ?? null,
		states: (window as any).__states as string[],
	}))

const sameTab = (l: Layer, pages: number) => assert.equal(l.b.context.pages().length, pages, 'no new tab or window')

/** The main frame's navigation to `url` (a rejection is held, so an assertion before it is awaited is the one reported). */
const mainNavigation = (page: Page, url: string, timeout = 15_000) => {
	const nav = page.waitForEvent('framenavigated', { predicate: (f) => f === page.mainFrame() && f.url().split('#')[0] === url, timeout })
	nav.catch(() => {})
	return nav
}

/** Opens `pathname` with the layer, pockets a card with a link, opens the album and waits for the portal. */
async function toAlbum(l: Layer, pathname: string, query = '?aixc-debug') {
	const seen = chunkRequests(l.page)
	await open(l.page, pathname, query)
	await pocketReady(l.page)
	const href = await pressChipWithLink(l.page)
	await pressPocketButton(l.page)
	await portalWarm(l.page, seen)
	const link = await stickerLink(l.page)
	assert.ok(link, 'the album shows the sticker with its link')
	assert.equal(link.href, href, "the sticker's link is the card's")
	return { link, seen }
}

const CASES = [
	{ path: '/en/services', viewport: DESKTOP, name: 'en desktop' },
	{ path: '/en/services', viewport: PHONE, name: 'en phone' },
	{ path: '/ar/services', viewport: DESKTOP, name: 'ar desktop' },
	{ path: '/ar/services', viewport: PHONE, name: 'ar phone' },
]

/* ------------------------------------------------------------------ 1. scope */

for (const c of [CASES[0], CASES[3]]) {
	test(`${c.name}: with the album open, Vodafone's header, footer and card links and the layer's own link are native; footerHandler runs once`, { timeout: 150_000 }, async () => {
		const l = await launchLayer(gw, { viewport: c.viewport, initScripts: [PROBE] })
		try {
			const seen = watch(l.page)
			const { link } = await toAlbum(l, c.path)
			// A link of the layer's own inside the album root that is not a sticker's.
			await l.page.evaluate(() => {
				const own = document.createElement('a')
				own.href = '/en/home'
				own.textContent = 'the layer’s own link'
				own.dataset.aixc = ''
				own.dataset.vg = ''
				own.dataset.probe = 'own'
				document.getElementById('pocket-output')!.append(own)
			})
			const marked = await l.page.evaluate(() => {
				const pick = (selector: string, probe: string) => {
					const a = [...document.querySelectorAll<HTMLAnchorElement>(selector)].find((x) => x.href && /^https?:/.test(x.href) && !x.closest('#pocket-output'))
					if (a) a.dataset.probe = probe
					return a?.href ?? null
				}
				return {
					header: pick('#header a[href]', 'header'),
					footer: pick('footer a[href][onclick*="footerHandler"]', 'footer'),
					card: pick('#main-content [data-aixc-item] a[href], #main-content a[href]', 'card'),
				}
			})
			assert.ok(marked.header && marked.footer && marked.card, `the page has the links (${JSON.stringify(marked)})`)
			await l.page.evaluate(() => ((window as any).__stubNav = true))
			const pages = l.b.context.pages().length
			for (const probe of ['header', 'footer', 'card', 'own']) {
				// Pressed as a script would (some are hidden under the album or in the phone's menu): the browser's own default action.
				await l.page.evaluate((probe) => document.querySelector<HTMLAnchorElement>(`a[data-probe="${probe}"]`)!.click(), probe)
				await l.page.waitForTimeout(150)
			}
			// The header's first link pressed with the mouse too, where it shows.
			const headerBox = await l.page.evaluate(() => {
				const r = document.querySelector('a[data-probe="header"]')!.getBoundingClientRect()
				return r.width && r.height && r.top >= 0 && r.bottom <= innerHeight ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null
			})
			if (headerBox) await l.page.mouse.click(headerBox.x, headerBox.y)
			await l.page.waitForTimeout(400)
			const clicks = await l.page.evaluate(() => (window as any).__clicks as { probe: string; prevented: boolean; type: string }[])
			for (const probe of ['header', 'footer', 'card', 'own']) {
				const mine = clicks.filter((x) => x.probe === probe)
				assert.ok(mine.length >= 1, `${probe}: the window saw the click`)
				assert.ok(
					mine.every((x) => !x.prevented),
					`${probe}: nobody before the window prevented it (${JSON.stringify(mine)})`,
				)
			}
			const after = await pageNow(l.page)
			assert.equal(after.portals, 0, 'no .vf-portal ever existed')
			assert.equal(after.url.split('?')[0], `${V}${c.path}`, 'still here (the navigation was stubbed by the window, not by the portal)')
			const footer = await l.page.evaluate((href) => (window as any).__footer[href!] ?? 0, marked.footer)
			assert.equal(footer, 1, 'footerHandler ran once on the native press')

			// A sticker's press with an inline handler on the link: it runs once (the person's click); the navigation copies no handler.
			await l.page.evaluate(() => {
				;(window as any).__stubNav = false
				const a = document.querySelector('#pocket-output .pocket-sticker a[href]')!
				a.setAttribute('onclick', 'footerHandler(event)')
			})
			await serveDestination(l.page, link.href, { status: (type) => (type === 'document' ? 204 : 200) })
			const fresh = await stickerLink(l.page)
			await l.page.mouse.click(fresh!.x, fresh!.y)
			assert.ok(await until(async () => (await pageNow(l.page)).states.includes('completed'), 12_000), 'the transition ran to its end')
			await l.page.waitForTimeout(300)
			assert.equal(await l.page.evaluate((href) => (window as any).__footer[href] ?? 0, link.href), 1, 'the sticker link’s inline handler ran exactly once')
			sameTab(l, pages)
			assert.deepEqual(seen.pageErrors, [], 'no page errors')
			assert.deepEqual(l.reached, [], 'nothing reached the internet')
		} finally {
			await l.close()
		}
	})
}

/* ------------------------------------------------------------------ 2. a sticker's link */

for (const c of CASES) {
	test(`${c.name}: a sticker's plain press runs the transition, marked, then this tab goes to its page`, { timeout: 150_000 }, async (t) => {
		const l = await launchLayer(gw, { viewport: c.viewport, initScripts: [PROBE] })
		try {
			const seen = watch(l.page)
			const { link } = await toAlbum(l, c.path)
			assert.equal(link.target, null, 'the sticker link has no target attribute')
			await serveDestination(l.page, link.href)
			const reqs = requestsFor(l.page, link.href)
			const pages = l.b.context.pages().length
			const nav = mainNavigation(l.page, link.href)
			const clickedAt = Date.now()
			await l.page.mouse.click(link.x, link.y)
			await l.page.waitForTimeout(700)
			const during = await overlayNow(l.page)
			assert.equal(during.count, 1, 'one overlay')
			assert.deepEqual(during.unmarked, [], 'every node the portal added is marked data-aixc and data-vg')
			assert.equal(during.html, 'active', 'html[data-vf-portal] while it runs')
			// Measured, not asserted: the click handler copies the page (#wrapper) into the wall before 'preparing'.
			const cost = await l.page.evaluate(() => Math.round(((window as any).__stateAt.preparing - (window as any).__clickAt) * 10) / 10)
			t.diagnostic(`${c.name}: click to 'preparing' (the wall's copy of the page) ${cost} ms`)
			await nav
			const took = Date.now() - clickedAt
			assert.ok(took > 2_000 && took < 9_500, `navigated after the transition (${took} ms)`)
			assert.equal(l.page.url().split('#')[0], link.href, "this tab is on the sticker's page")
			sameTab(l, pages)
			assert.equal(reqs.filter((r) => r.type === 'document' && !r.main).length, 0, 'no frame loaded the destination by its address')
			assert.deepEqual(seen.pageErrors, [], 'no page errors')
			assert.deepEqual(l.reached, [], 'nothing reached the internet')
		} finally {
			await l.close()
		}
	})
}

test('en desktop: modified presses, the middle button and target="_blank" are not taken', { timeout: 150_000 }, async () => {
	const l = await launchLayer(gw, { viewport: DESKTOP, initScripts: [PROBE] })
	try {
		const seen = watch(l.page)
		const { link } = await toAlbum(l, '/en/services')
		await l.page.evaluate(() => ((window as any).__stubNav = true))
		const pages = l.b.context.pages().length
		for (const modifiers of [['Control'], ['Meta'], ['Shift']] as ('Control' | 'Meta' | 'Shift')[][]) {
			await l.page.mouse.move(link.x, link.y)
			for (const key of modifiers) await l.page.keyboard.down(key)
			await l.page.mouse.down()
			await l.page.mouse.up()
			for (const key of modifiers) await l.page.keyboard.up(key)
			await l.page.waitForTimeout(150)
		}
		await l.page.mouse.click(link.x, link.y, { button: 'middle' })
		await l.page.waitForTimeout(150)
		await l.page.evaluate(() => document.querySelector('#pocket-output .pocket-sticker a[href]')!.setAttribute('target', '_blank'))
		await l.page.mouse.click(link.x, link.y)
		await l.page.waitForTimeout(400)
		const clicks = await l.page.evaluate((href) => ((window as any).__clicks as any[]).filter((x) => x.href === href), link.href)
		// (On macOS a Control-press is the context menu: no click at all.)
		assert.ok(clicks.filter((x) => x.type === 'click').length >= (process.platform === 'darwin' ? 3 : 4), `the window saw each press (${JSON.stringify(clicks)})`)
		assert.equal(clicks.filter((x) => x.type === 'auxclick').length, 1, 'the middle button')
		assert.ok(
			clicks.every((x) => !x.prevented),
			`none was prevented before the window (${JSON.stringify(clicks)})`,
		)
		const now = await pageNow(l.page)
		assert.equal(now.portals, 0, 'no .vf-portal ever existed')
		sameTab(l, pages)
		assert.deepEqual(seen.pageErrors, [], 'no page errors')
	} finally {
		await l.close()
	}
})

/* ------------------------------------------------------------------ 3. one request for the destination */

test('en desktop, through the kit: one fetch for the destination before the navigation, and no frame loads it by address', { timeout: 150_000 }, async () => {
	const l = await launchLayer(gw, { viewport: DESKTOP, initScripts: [PROBE] })
	try {
		const { link } = await toAlbum(l, '/en/services')
		await serveDestination(l.page, link.href)
		const reqs = requestsFor(l.page, link.href)
		const nav = mainNavigation(l.page, link.href)
		await l.page.mouse.click(link.x, link.y)
		await nav
		const navAt = reqs.find((r) => r.type === 'document' && r.main)?.at ?? Infinity
		const before = reqs.filter((r) => r.at < navAt)
		assert.deepEqual(
			before.map((r) => `${r.type}${r.main ? '' : ' (frame)'}`),
			['fetch'],
			`before the navigation: exactly one fetch (${JSON.stringify(reqs)})`,
		)
		assert.equal(reqs.filter((r) => !r.main).length, 0, 'no request for it from any frame')
		// Through Playwright's routes the HTTP cache is off, so the navigation asks again here: the real server test below counts what the cache saves.
		assert.equal(reqs.filter((r) => r.type === 'document' && r.main).length, 1, 'then the navigation')
	} finally {
		await l.close()
	}
})

/**
 * A real HTTP server on 127.0.0.1 serving the saved pages (scripts out, the site's own address made this
 * server's) with the given cache headers, counting requests per path; /__vg/ goes on to the test's
 * gateway. No Playwright route anywhere, so the browser's HTTP cache works as it does on Vodafone's site.
 */
async function realServer(headers: Record<string, string>) {
	const hits = new Map<string, { dest: string; mode: string }[]>()
	let origin = ''
	const gateway = new URL(gw.url)
	const server = http.createServer((req, res) => {
		const url = new URL(req.url || '/', 'http://x')
		if (url.pathname.startsWith('/__vg/')) {
			const forward = http.request({ host: gateway.hostname, port: gateway.port, path: url.pathname.slice('/__vg'.length) + url.search, method: req.method, headers: { ...req.headers, host: gateway.host } }, (up) => {
				res.writeHead(up.statusCode || 502, up.headers)
				up.pipe(res)
			})
			forward.on('error', () => res.writeHead(502).end())
			req.pipe(forward)
			return
		}
		const list = hits.get(url.pathname) ?? []
		list.push({ dest: String(req.headers['sec-fetch-dest'] || ''), mode: String(req.headers['sec-fetch-mode'] || '') })
		hits.set(url.pathname, list)
		if (/^\/(en|ar)\//.test(url.pathname)) {
			const html = destinationHtml(url.pathname)
				.replace(/<script\b[\s\S]*?<\/script\s*>/gi, '')
				.replaceAll(V, origin)
			return res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', ...headers }).end(html)
		}
		res.writeHead(404, { 'content-type': 'text/plain' }).end('not here')
	})
	const sockets = new Set<import('node:net').Socket>()
	server.on('connection', (s) => {
		sockets.add(s)
		s.on('close', () => sockets.delete(s))
	})
	await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
	origin = `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}`
	return {
		origin,
		hits,
		close: async () => {
			for (const s of sockets) s.destroy()
			await new Promise((done) => server.close(done))
		},
	}
}

const VARIANTS: { name: string; headers: Record<string, string>; expect: number }[] = [
	{ name: 'Cache-Control: max-age=14400, public', headers: { 'cache-control': 'max-age=14400, public' }, expect: 1 },
	{ name: 'the same with Vary: Accept-Encoding', headers: { 'cache-control': 'max-age=14400, public', vary: 'Accept-Encoding' }, expect: 1 },
	{ name: 'no cache headers', headers: {}, expect: 2 },
]
for (const variant of VARIANTS) {
	test(`a real HTTP server, ${variant.name}: the server sees the destination ${variant.expect === 1 ? 'once' : 'twice (the navigation asks again)'}`, { timeout: 150_000 }, async () => {
		const srv = await realServer(variant.headers)
		const browser = await chromium.launch({ headless: true, args: OFFLINE_ARGS })
		const site = { ...gw.site, origins: [{ ...gw.site.origins[0], url: srv.origin }] }
		// The gateway answers this page's origin as it would Vodafone's (the guide checks it).
		const added = { ...gw.site.origins[0], url: srv.origin }
		gw.site.origins.push(added)
		try {
			const context = await browser.newContext({ viewport: DESKTOP, locale: 'en-US' })
			await context.addInitScript(loaderScript({ siteKey: gw.site.siteKey, origins: [srv.origin], experiences: loaderExperiences({ site }) }))
			for (const s of [WIDGET_STAND_IN, PROBE]) await context.addInitScript(s)
			const page = await context.newPage()
			const errors: string[] = []
			page.on('pageerror', (e) => errors.push(e.message))
			const outside: string[] = []
			page.on('request', (r) => {
				if (!r.url().startsWith(srv.origin) && !/^(data|blob|about):/.test(r.url())) outside.push(r.url())
			})
			const seen = chunkRequests(page)
			await page.goto(`${srv.origin}/en/services?aixc-debug`, { waitUntil: 'load' })
			await page.waitForFunction(() => (window as any).__aixc?.state === 'ready', null, { timeout: 15_000 })
			await pocketReady(page)
			const href = await pressChipWithLink(page)
			await pressPocketButton(page)
			await portalWarm(page, seen)
			const link = await stickerLink(page)
			assert.equal(link?.href, href, "the sticker's link is the card's, on this server")
			const dest = new URL(href).pathname
			const before = srv.hits.get(dest)?.length ?? 0
			assert.equal(before, 0, 'the destination was not asked for before the press')
			const nav = page.waitForEvent('framenavigated', { predicate: (f) => f === page.mainFrame() && f.url().split('#')[0] === href, timeout: 15_000 })
			await page.mouse.click(link!.x, link!.y)
			await nav
			await page.waitForLoadState('load')
			await page.waitForTimeout(500)
			const asked = srv.hits.get(dest) ?? []
			assert.equal(asked.length, variant.expect, `the server saw the destination ${variant.expect} time(s): ${JSON.stringify(asked)}`)
			assert.equal(asked[0]?.mode, 'cors', 'the first is the portal’s fetch')
			if (variant.expect === 2) assert.equal(asked[1]?.dest, 'document', 'the second is the navigation')
			assert.ok(!asked.some((x) => x.dest === 'iframe'), 'no frame asked for it')
			assert.deepEqual(outside, [], 'nothing left for another host')
			assert.deepEqual(errors, [], 'no page errors')
			await context.close()
		} finally {
			gw.site.origins.splice(gw.site.origins.indexOf(added), 1)
			await browser.close()
			await srv.close()
		}
	})
}

/* ------------------------------------------------------------------ 4. the accessibility widget and the cookie banner */

/** The accessibility button as the page has it: box, style attribute, every computed property. */
const BUTTON = `(() => {
	const b = document.getElementById('vodafone-aw-icon')
	if (!b) return null
	const r = b.getBoundingClientRect()
	const cs = getComputedStyle(b)
	const style = {}
	for (const name of cs) style[name] = cs.getPropertyValue(name)
	return { box: [r.left, r.top, r.width, r.height].map((v) => Math.round(v * 10) / 10), attr: b.getAttribute('style'), style }
})()`

for (const c of [CASES[0], CASES[3]]) {
	test(`${c.name}: the accessibility widget is constructed once, never copied, its button as with ?aixc=off at every sample; OneTrust untouched`, { timeout: 150_000 }, async () => {
		const l = await launchLayer(gw, { viewport: c.viewport, initScripts: [WIDGET_DEFINED, CONSENT_ANSWERED, PROBE] })
		try {
			const seen = watch(l.page)
			await l.page.goto(`${V}${c.path}?aixc=off`, { waitUntil: 'load' })
			await l.page.waitForTimeout(400)
			const off = (await l.page.evaluate(BUTTON)) as { box: number[]; attr: string | null; style: Record<string, string> } | null
			assert.ok(off, 'the button stands in')
			const samples: { at: string; b: any; aw: any; copies: number; ot: boolean }[] = []
			await l.page.exposeFunction('__sample', (s: any) => samples.push(s))
			const sample = (at: string) =>
				l.page.evaluate(
					([at, js]) => {
						const root = document.querySelector('.vf-portal')
						return {
							at,
							b: eval(js),
							aw: { ...(window as any).__aw },
							copies: root ? root.querySelectorAll('accessibility-widget, .vf-aw-fab, [data-stand-in]').length : 0,
							ot: document.getElementById('onetrust-consent-sdk')?.outerHTML === (window as any).__otHtml && document.querySelectorAll('[data-stand-in="onetrust"]').length === 1,
						}
					},
					[at, BUTTON] as const,
				)
			// In the page, at each of the portal's states and half way through, sent out before the navigation.
			await l.page.addInitScript(`(() => {
				if (window.top !== window) return
				const take = (at) => {
					const root = document.querySelector('.vf-portal')
					window.__sample({ at, b: ${BUTTON}, aw: { ...window.__aw }, copies: root ? root.querySelectorAll('accessibility-widget, .vf-aw-fab, [data-stand-in]').length : 0, ot: document.getElementById('onetrust-consent-sdk')?.outerHTML === window.__otHtml && document.querySelectorAll('[data-stand-in="onetrust"]').length === 1 })
				}
				document.addEventListener('vf-portal:state', (e) => {
					take('state ' + e.detail.state)
					if (e.detail.state === 'preparing') setTimeout(() => take('mid-transition'), 1500)
				})
			})()`)
			const pages = l.b.context.pages().length
			const seenChunks = chunkRequests(l.page)
			await open(l.page, c.path, '?aixc-debug')
			await pocketReady(l.page)
			samples.push(await sample('page'))
			const href = await pressChipWithLink(l.page)
			await l.page.waitForSelector('.pocket-peek[data-state="shown"]', { timeout: 5_000 })
			samples.push(await sample('peek'))
			await pressPocketButton(l.page)
			await portalWarm(l.page, seenChunks)
			samples.push(await sample('album'))
			const link = (await stickerLink(l.page))!
			await serveDestination(l.page, href)
			const nav = mainNavigation(l.page, href)
			await l.page.mouse.click(link.x, link.y)
			await nav
			await l.page.waitForLoadState('load')
			await l.page.waitForTimeout(600)
			samples.push(await sample('destination'))
			const at = samples.map((s) => s.at)
			for (const want of ['peek', 'album', 'state preparing', 'state wall-falling', 'mid-transition', 'state handoff', 'state completed', 'destination']) assert.ok(at.includes(want), `sampled at ${want} (${at.join(', ')})`)
			for (const s of samples) {
				assert.deepEqual(s.b?.box, off!.box, `${s.at}: the button's box as with ?aixc=off`)
				assert.equal(s.b?.attr, off!.attr, `${s.at}: its style attribute as with ?aixc=off`)
				const differ: string[] = Object.keys(off!.style).filter((k) => off!.style[k] !== s.b?.style[k])
				assert.deepEqual(differ, [], `${s.at}: every computed property as with ?aixc=off (${differ.map((k) => `${k}: ${off!.style[k]} -> ${s.b?.style[k]}`).join('; ')})`)
				if (s.at !== 'destination') {
					assert.deepEqual(s.aw, { constructed: 1, connected: 1 }, `${s.at}: the widget constructed and connected once`)
				}
				assert.equal(s.copies, 0, `${s.at}: nothing of the widget is copied into the overlay`)
				assert.ok(s.ot, `${s.at}: OneTrust's SDK is in the page once, as it was`)
			}
			sameTab(l, pages)
			assert.deepEqual(seen.pageErrors, [], 'no page errors')
		} finally {
			await l.close()
		}
	})
}

/* ------------------------------------------------------------------ 5. a frame that runs nothing */

test('en desktop: the destination drawn in the frame runs nothing: no flag, no localStorage.clear(), no pixel before the navigation', { timeout: 150_000 }, async () => {
	const l = await launchLayer(gw, { viewport: DESKTOP, initScripts: [PROBE] })
	try {
		const { link } = await toAlbum(l, '/en/services')
		const pixel: number[] = []
		await l.page.route('**/tracking-pixel.gif*', (route) => {
			pixel.push(Date.now())
			return route.fulfill({ status: 200, contentType: 'image/gif', body: Buffer.from('R0lGODlhAQABAAAAACw=', 'base64') })
		})
		const html = destinationHtml(new URL(link.href).pathname).replace(
			/<\/head>/i,
			`<script>window.__ran = true; try { top.__ran = true; parent.__ran = true } catch (e) {} localStorage.clear(); new Image().src = '/tracking-pixel.gif?from=script'; fetch('/tracking-pixel.gif?from=fetch')</script></head>`,
		)
		await serveDestination(l.page, link.href, { body: html })
		await l.page.evaluate(() => localStorage.setItem('aixc.probe', 'kept'))
		const frames: any[] = []
		await l.page.exposeFunction('__frameNow', (f: any) => frames.push(f))
		await l.page.evaluate(() =>
			document.addEventListener('vf-portal:state', (e: any) => {
				if (e.detail.state !== 'handoff') return
				const f = document.querySelector('.vf-portal iframe')
				;(window as any).__frameNow({ ran: (window as any).__ran ?? null, kept: localStorage.getItem('aixc.probe'), destination: (document.querySelector('.vf-portal') as HTMLElement)?.dataset.destination ?? null, frame: f ? { src: f.getAttribute('src'), srcdoc: f.hasAttribute('srcdoc'), sandbox: f.getAttribute('sandbox'), ran: (() => { try { return ((f as HTMLIFrameElement).contentWindow as any).__ran ?? null } catch { return 'blocked' } })() } : null })
			}),
		)
		const nav = mainNavigation(l.page, link.href)
		let navAt = 0
		l.page.on('framenavigated', (f) => {
			if (f === l.page.mainFrame() && !navAt) navAt = Date.now()
		})
		await l.page.mouse.click(link.x, link.y)
		await nav
		const at = frames[0]
		assert.ok(at, 'sampled at the handoff')
		assert.equal(at.destination, 'frame', 'the destination was drawn in the frame')
		assert.equal(at.ran, null, 'the page’s window never saw the script')
		assert.equal(at.kept, 'kept', 'localStorage intact')
		assert.ok(at.frame && at.frame.src === null && at.frame.srcdoc, `the frame has a srcdoc and no src (${JSON.stringify(at.frame)})`)
		assert.ok(!/allow-scripts/.test(at.frame.sandbox || ''), `no allow-scripts in its sandbox (${at.frame.sandbox})`)
		assert.equal(at.frame.ran, null, 'nothing ran in the frame')
		assert.deepEqual(
			pixel.filter((t) => t < navAt),
			[],
			'no pixel before the navigation',
		)
	} finally {
		await l.close()
	}
})

/* ------------------------------------------------------------------ 6. failures */

test('en desktop: the destination fetch fails: the preview or nothing, the tab still navigates, and a second press runs again', { timeout: 150_000 }, async () => {
	const l = await launchLayer(gw, { viewport: DESKTOP, initScripts: [PROBE] })
	try {
		const seen = watch(l.page)
		const { link } = await toAlbum(l, '/en/services')
		// The fetch refused; the navigation answers 204 the first time (the browser stays: the page is given back), then the page.
		let documents = 0
		await l.page.route(
			(u) => u.href.split('#')[0] === link.href,
			(route) => {
				const type = route.request().resourceType()
				if (type === 'fetch') return route.abort()
				documents++
				if (documents === 1) return route.fulfill({ status: 204, body: '' })
				return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: destinationHtml(new URL(link.href).pathname) })
			},
		)
		await l.page.mouse.click(link.x, link.y)
		await l.page.waitForTimeout(1_500)
		const during = await overlayNow(l.page)
		assert.equal(during.count, 1, 'the transition runs')
		assert.ok(during.destination === 'preview' || during.destination === null, `the preview, or nothing yet (${during.destination})`)
		assert.equal(during.frame, null, 'no frame')
		assert.ok(await until(() => documents === 1, 12_000), 'the navigation was asked for, in this tab')
		// The browser stayed (204): the portal gives the page back after its wait, and is ready again.
		assert.ok(await until(async () => (await pageNow(l.page)).overlay === 0, 14_000), 'the page is given back')
		const back = await pageNow(l.page)
		assert.equal(back.html, null, 'no html[data-vf-portal]')
		assert.notEqual(back.overflow, 'hidden', 'no scroll lock')
		const again = (await stickerLink(l.page))!
		const nav = mainNavigation(l.page, link.href)
		await l.page.mouse.click(again.x, again.y)
		await l.page.waitForTimeout(500)
		assert.equal((await pageNow(l.page)).portals, 2, 'the second press ran the transition again')
		await nav
		assert.equal(l.page.url().split('#')[0], link.href, 'and this tab went there')
		assert.deepEqual(seen.pageErrors, [], 'no page errors')
	} finally {
		await l.close()
	}
})

test('en desktop: an error inside the portal: the click navigates natively, the layer stays up, later presses are native', { timeout: 150_000 }, async () => {
	const l = await launchLayer(gw, { viewport: DESKTOP, initScripts: [PROBE] })
	try {
		const seen = watch(l.page)
		const { link } = await toAlbum(l, '/en/services')
		await serveDestination(l.page, link.href, { status: (type) => (type === 'document' ? 204 : 200) })
		await l.page.evaluate(() => ((window as any).__AIXC_TEST__ = { failAt: 'portal-start' }))
		const reqs = requestsFor(l.page, link.href)
		await l.page.mouse.click(link.x, link.y)
		await l.page.waitForTimeout(800)
		const clicks = await l.page.evaluate((href) => ((window as any).__clicks as any[]).filter((x) => x.href === href), link.href)
		assert.equal(clicks.length, 1, 'one click')
		assert.equal(clicks[0].prevented, false, 'not prevented: the browser navigates natively')
		assert.ok(await until(() => reqs.some((r) => r.type === 'document' && r.main), 5_000), `the tab asked for the page (${JSON.stringify(reqs)})`)
		const now = await pageNow(l.page)
		assert.equal(now.overlay, 0, 'no overlay left')
		assert.equal(now.html, null, 'no html[data-vf-portal]')
		assert.equal(now.layer, 'ready', 'the layer is up')
		assert.ok(seen.layer.some((x) => x.includes('portal')), `the error is reported (${seen.layer.join(' | ')})`)
		// The portal is off for the page now: a second press is native too.
		await l.page.evaluate(() => ((window as any).__AIXC_TEST__ = {}))
		const portals = now.portals
		await l.page.mouse.click(link.x, link.y)
		await l.page.waitForTimeout(800)
		const second = await l.page.evaluate((href) => ((window as any).__clicks as any[]).filter((x) => x.href === href), link.href)
		assert.equal(second.length, 2, 'two clicks')
		assert.equal(second[1].prevented, false, 'the second is native too')
		assert.equal((await pageNow(l.page)).portals, portals, 'no new overlay')
		assert.deepEqual(seen.pageErrors, [], 'no page errors')
	} finally {
		await l.close()
	}
})

test('en desktop: a guard stop in the middle of a transition gives the page back, and nothing navigates', { timeout: 150_000 }, async () => {
	const l = await launchLayer(gw, { viewport: DESKTOP, initScripts: [PROBE] })
	try {
		const seen = watch(l.page)
		const { link } = await toAlbum(l, '/en/services')
		await serveDestination(l.page, link.href)
		const reqs = requestsFor(l.page, link.href)
		await l.page.mouse.click(link.x, link.y)
		await l.page.waitForTimeout(1_200)
		assert.equal((await overlayNow(l.page)).count, 1, 'the transition runs')
		await l.page.evaluate(() => (window as any).__aixc.guard.stop())
		await l.page.waitForTimeout(200)
		const after = await pageNow(l.page)
		assert.equal(after.overlay, 0, 'no .vf-portal')
		assert.equal(after.html, null, 'no html[data-vf-portal]')
		assert.notEqual(after.overflow, 'hidden', 'no scroll lock on html')
		assert.equal(await l.page.evaluate(() => document.querySelectorAll('[data-aixc]').length), 0, 'nothing of the layer is left')
		// Past the watchdog: nothing navigates.
		await l.page.waitForTimeout(10_500)
		assert.equal(l.page.url().split('?')[0], `${V}/en/services`, 'still on the page')
		assert.equal(reqs.filter((r) => r.type === 'document').length, 0, 'no navigation was asked for')
		// Later presses on Vodafone's links are native.
		await l.page.evaluate(() => ((window as any).__stubNav = true))
		await l.page.evaluate(() => document.querySelector<HTMLAnchorElement>('#header a[href]')!.click())
		const last = await l.page.evaluate(() => ((window as any).__clicks as any[]).at(-1))
		assert.equal(last.prevented, false, 'a later press is native')
		assert.deepEqual(seen.pageErrors, [], 'no page errors')
	} finally {
		await l.close()
	}
})

/* ------------------------------------------------------------------ 7. Escape */

test('en desktop: Escape during the transition cancels it: the person stays in the album, nothing is left', { timeout: 150_000 }, async () => {
	const l = await launchLayer(gw, { viewport: DESKTOP, initScripts: [PROBE] })
	try {
		const seen = watch(l.page)
		const { link } = await toAlbum(l, '/en/services')
		await serveDestination(l.page, link.href)
		const reqs = requestsFor(l.page, link.href)
		const url = l.page.url()
		await l.page.mouse.click(link.x, link.y)
		await l.page.waitForTimeout(1_000)
		await l.page.keyboard.press('Escape')
		await l.page.waitForTimeout(300)
		const now = await pageNow(l.page)
		assert.equal(now.overlay, 0, 'no overlay')
		assert.equal(now.html, null, 'no html[data-vf-portal]')
		assert.notEqual(now.overflow, 'hidden', 'no scroll lock')
		assert.equal(now.view, 'pocket', 'the album is still open')
		await l.page.waitForTimeout(10_000)
		assert.equal(l.page.url(), url, 'the address is unchanged, past the watchdog')
		assert.equal(reqs.filter((r) => r.type === 'document').length, 0, 'no navigation')
		// Recorded for the ADR: the page the person then did not open was still fetched once (the fetch starts at the press).
		assert.equal(reqs.filter((r) => r.type === 'fetch').length, 1, 'the destination was fetched once, at the press')
		assert.deepEqual(seen.pageErrors, [], 'no page errors')
	} finally {
		await l.close()
	}
})

/* ------------------------------------------------------------------ 8. Back */

/** Every idle callback is held back once the history entry is marked, so only the Back path can load the demos. */
const HOLD_IDLE_ON_BACK = `(() => {
	const idle = window.requestIdleCallback?.bind(window)
	if (!idle) return
	window.requestIdleCallback = (fn, o) => (history.state?.vfPortal ? 0 : idle(fn, o))
})()`

for (const c of [CASES[0], CASES[3]]) {
	test(`${c.name}: Back after a sticker's page reopens the album at once, at the same scroll`, { timeout: 150_000 }, async () => {
		const l = await launchLayer(gw, { viewport: c.viewport, initScripts: [PROBE, HOLD_IDLE_ON_BACK] })
		try {
			const seen = watch(l.page)
			// The Pocket's page with no-store, so Back loads it afresh (the bfcache path is the next test).
			const own = savedHtml(c.path)!
			await l.page.route(
				(u) => u.pathname === c.path && u.origin === V,
				(route) => (route.request().resourceType() === 'document' ? route.fulfill({ status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }, body: own }) : route.fallback()),
			)
			const { link } = await toAlbum(l, c.path)
			await serveDestination(l.page, link.href)
			// Down the album a little where it is long enough.
			const scrolled = await l.page.evaluate(async () => {
				window.scrollTo(0, Math.min(240, document.documentElement.scrollHeight - innerHeight))
				await new Promise((done) => setTimeout(done, 200))
				return window.scrollY
			})
			const press = await l.page.evaluate(() => {
				const r = document.querySelector('#pocket-output .pocket-sticker a[href]')!.getBoundingClientRect()
				return { x: r.left + r.width / 2, y: r.top + r.height / 2, visible: r.top >= 0 && r.bottom <= innerHeight }
			})
			const at = press.visible ? press : (await stickerLink(l.page))!
			const atScroll = press.visible ? scrolled : (at as any).scrollY
			const nav = mainNavigation(l.page, link.href)
			await l.page.mouse.click(at.x, at.y)
			await nav
			await l.page.waitForLoadState('load')
			const chunksBack = chunkRequests(l.page)
			await l.page.goBack({ waitUntil: 'load' })
			const how = await l.page.evaluate(() => ({ type: (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming)?.type, shows: (window as any).__shows, mark: history.state?.vfPortal ?? null }))
			assert.equal(how.type, 'back_forward', 'a Back')
			assert.deepEqual(how.shows, [false], 'a fresh load, not the bfcache')
			assert.ok(how.mark, 'the entry is marked')
			assert.equal(how.mark.scrollY, atScroll, 'the mark has the scroll of the press')
			assert.ok(await until(() => (chunksBack.asked.pocket ?? 0) > 0 && (chunksBack.asked.portal ?? 0) > 0, 10_000), `the Pocket's and the portal's chunks with idle held back (${JSON.stringify(chunksBack)})`)
			await albumShows(l.page)
			await l.page.waitForTimeout(400)
			const back = await l.page.evaluate(() => ({ scrollY: window.scrollY, stickers: [...document.querySelectorAll<HTMLAnchorElement>('#pocket-output .pocket-sticker a[href]')].map((a) => a.href) }))
			assert.ok(Math.abs(back.scrollY - atScroll) <= 2, `the same scroll (${back.scrollY} for ${atScroll})`)
			assert.deepEqual(back.stickers, [link.href], 'the sticker is still there')
			assert.equal((await pageNow(l.page)).overlay, 0, 'no overlay')
			assert.deepEqual(seen.pageErrors, [], 'no page errors')
		} finally {
			await l.close()
		}
	})
}

test('en desktop: a bfcache pageshow during the transition removes the overlay; the album is as it was', { timeout: 150_000 }, async () => {
	const l = await launchLayer(gw, { viewport: DESKTOP, initScripts: [PROBE] })
	try {
		const seen = watch(l.page)
		const { link } = await toAlbum(l, '/en/services')
		await serveDestination(l.page, link.href)
		const reqs = requestsFor(l.page, link.href)
		const album = await l.page.evaluate(() => document.getElementById('pocket-output')!.querySelectorAll('.pocket-sticker').length)
		await l.page.mouse.click(link.x, link.y)
		await l.page.waitForTimeout(1_000)
		assert.equal((await overlayNow(l.page)).count, 1, 'the transition runs')
		await l.page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })))
		await l.page.waitForTimeout(200)
		const now = await pageNow(l.page)
		assert.equal(now.overlay, 0, 'the overlay is removed')
		assert.equal(now.html, null, 'no html[data-vf-portal]')
		assert.notEqual(now.overflow, 'hidden', 'no scroll lock')
		assert.equal(now.view, 'pocket', 'the album is open')
		assert.equal(await l.page.evaluate(() => document.getElementById('pocket-output')!.querySelectorAll('.pocket-sticker').length), album, 'with its stickers')
		await l.page.waitForTimeout(10_000)
		assert.equal(reqs.filter((r) => r.type === 'document').length, 0, 'nothing navigated')
		assert.deepEqual(seen.pageErrors, [], 'no page errors')
	} finally {
		await l.close()
	}
})

/* ------------------------------------------------------------------ 9. reduced motion */

test('en desktop, reduced motion: a sticker\'s press just navigates, in this tab, with no transition', { timeout: 150_000 }, async () => {
	const l = await launchLayer(gw, { viewport: DESKTOP, reducedMotion: true, initScripts: [PROBE] })
	try {
		const seen = watch(l.page)
		const { link } = await toAlbum(l, '/en/services')
		await serveDestination(l.page, link.href)
		const reqs = requestsFor(l.page, link.href)
		const pages = l.b.context.pages().length
		const nav = mainNavigation(l.page, link.href)
		const t0 = Date.now()
		await l.page.mouse.click(link.x, link.y)
		await nav
		assert.ok(Date.now() - t0 < 2_000, 'at once')
		assert.equal(reqs.filter((r) => r.type === 'fetch').length, 0, 'no fetch')
		sameTab(l, pages)
		assert.deepEqual(seen.pageErrors, [], 'no page errors')
	} finally {
		await l.close()
	}
})
