/**
 * Glue for the page watch's end-to-end test (watch-live.e2e.test.ts; ADR-0078; phase 6 design §5), on top of
 * the offline kit (./vodafone-layer.ts, used as it is; phase 6 did not edit it):
 *
 * - `answerWatch(context)`: a route on the browser context that answers the layer's own fetches to Vodafone's
 *   origin (robots.txt and the CMS pages; never navigations or /__vg/) from the saved pages: those of
 *   12 Nov 2026 (fixtures/replay/vodafone-eg-2026-11-12, Arabic, four pages) where asked and saved, else
 *   those of 23 Oct (the replay). Each answer carries an ETag of its body, and a matching If-None-Match gets
 *   a 304, as Vodafone's cache would. A test may edit a page (TEST-ONLY copies, made in the test), or answer
 *   a path with a status of its own (404, 403, a 302). Every request is logged with its time, headers
 *   (so a Cookie would show), status and kind; navigations are logged apart (the positive control for cookies).
 * - `PAGE_PROBE`: an init script that records, in the page, every call of fetch to the page's own origin
 *   with the options the watch passed (credentials, redirect, cache, validators) and the time it was made,
 *   counts DOMParser parses, and stubs Notification.requestPermission (counted, never asked).
 * - Readers of the watch's database (aixc-watch-v1) and of the Pocket's and the watch's lines.
 *
 * Nothing here reaches the network: every answer is fulfilled locally; the kit's recorder still says
 * whether anything left.
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

import type { BrowserContext, Page } from 'playwright'

import { ROOT } from '#shared/config.ts'

import { REPLAY, V } from './vodafone-layer.ts'

export const NOV12 = path.join(ROOT, 'fixtures/replay/vodafone-eg-2026-11-12')

const snapshots = (dir: string, file: string) =>
	new Map(
		(JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')) as { pages: { url: string; snapshot?: string }[] }).pages
			.filter((p) => p.snapshot)
			.map((p) => [new URL(p.url).pathname, path.join(dir, p.snapshot!)] as const),
	)
export const OCT23_PAGES = snapshots(REPLAY, 'crawl.json')
export const NOV12_PAGES = snapshots(NOV12, 'pages.json')

const gunzip = (file: string) => zlib.gunzipSync(fs.readFileSync(file)).toString('utf8')
/** The saved page at `pathname`: 12 Nov's when `nov12` and saved that day, else 23 Oct's; null when neither has it. */
export const savedPage = (pathname: string, nov12: boolean): { html: string; date: '2026-11-12' | '2026-10-23' } | null => {
	if (nov12 && NOV12_PAGES.has(pathname)) return { html: gunzip(NOV12_PAGES.get(pathname)!), date: '2026-11-12' }
	if (OCT23_PAGES.has(pathname)) return { html: gunzip(OCT23_PAGES.get(pathname)!), date: '2026-10-23' }
	return null
}

// ---- TEST-ONLY edits of the saved pages. Each says so in the HTML it changes; none is ever written to disk. ----

/** TEST-ONLY EDIT: the first bundle's price on the 12-Nov /ar/mobile-internet-bundles, one pound more. */
export function editBundlePrice(html: string): string {
	let done = false
	const out = html.replace(/(<h5 class="card-subscription-body-amount")>(\d+) جنيه</, (_, open: string, n: string) => {
		done = true
		return `${open} data-test-edit="TEST-ONLY EDIT">${Number(n) + 1} جنيه<`
	})
	if (!done) throw new Error('TEST-ONLY EDIT: no bundle price found')
	return out
}

/** TEST-ONLY EDIT: one paragraph more in #main-content (a page whose markup has no bundle price to edit). */
export function editMainParagraph(html: string): string {
	const out = html.replace(/(<[^>]+id="main-content"[^>]*>)/, '$1<p data-test-edit>TEST-ONLY EDIT: a new bundle price, written by this test.</p>')
	if (out === html) throw new Error('TEST-ONLY EDIT: no #main-content')
	return out
}

/** The Vodafone Cash section of the 12-Nov /ar/services (its picture is vf-cash.png): [start, end) in `html`. */
function cashSection(html: string): [number, number] {
	const pic = html.indexOf('vf-cash.png')
	if (pic < 0) throw new Error('TEST-ONLY EDIT: no Cash card')
	const start = html.lastIndexOf('<!--------- START: Section --------->', pic)
	const endMark = '<!--------- END: Section --------->'
	const end = html.indexOf(endMark, pic)
	if (start < 0 || end < 0) throw new Error('TEST-ONLY EDIT: the Cash section has no bounds')
	return [start, end + endMark.length]
}
const inCash = (html: string, fn: (section: string) => string) => {
	const [a, b] = cashSection(html)
	const section = html.slice(a, b)
	const next = fn(section)
	if (next === section) throw new Error('TEST-ONLY EDIT: the Cash section did not change')
	return html.slice(0, a) + next + html.slice(b)
}
/** TEST-ONLY EDIT: the Cash card's title on /ar/services reads differently. */
export const editCashTitle = (html: string) => inCash(html, (s) => s.replace('<strong>ڤودافون كاش</strong>', '<strong data-test-edit="TEST-ONLY EDIT">ڤودافون كاش الجديدة</strong>'))
/** TEST-ONLY EDIT: the Cash card's link opens another page (/ar/vodafone-red1). */
export const editCashLink = (html: string) => inCash(html, (s) => s.replace('<a href="vodafone-cash" ', '<a data-test-edit="TEST-ONLY EDIT" href="vodafone-red1" '))
/** TEST-ONLY EDIT: the Cash card taken off /ar/services. */
export const removeCash = (html: string) => inCash(html, () => '<!-- TEST-ONLY EDIT: the Vodafone Cash card was removed by this test -->')

// ---- The route ----

export interface Logged {
	path: string
	at: number
	status: number
	cookie: boolean
	ifNoneMatch: string | null
	date: string | null
}
export interface Answers {
	/** 12 Nov's pages where saved (Arabic), else 23 Oct's. */
	nov12: boolean
	/** TEST-ONLY edits by path, applied in order. */
	edits: Map<string, ((html: string) => string)[]>
	/** A status of its own for a path: 404, 403, or a redirect (with `location`). */
	status: Map<string, { status: number; location?: string }>
	/** Every answer to a layer's fetch to Vodafone's origin. */
	log: Logged[]
	/** Navigations to Vodafone's origin, and whether each carried a Cookie (the positive control). */
	navigations: { path: string; cookie: boolean }[]
	/** The answers logged at or after `at` (ms). */
	since(at: number): Logged[]
}

export async function answerWatch(context: BrowserContext, o: { nov12?: boolean } = {}): Promise<Answers> {
	const a: Answers = {
		nov12: o.nov12 ?? false,
		edits: new Map(),
		status: new Map(),
		log: [],
		navigations: [],
		since: (at) => a.log.filter((x) => x.at >= at),
	}
	await context.route(
		(url) => url.origin === V,
		async (route) => {
			const req = route.request()
			const url = new URL(req.url())
			const headers = await req.allHeaders().catch(() => req.headers())
			const cookie = Object.keys(headers).some((h) => h.toLowerCase() === 'cookie')
			if (req.isNavigationRequest()) a.navigations.push({ path: url.pathname, cookie })
			// Navigations go to the replay; the guide's and the layer's own calls (/__vg/) to the kit's forward.
			if (req.resourceType() !== 'fetch' || url.pathname.startsWith('/__vg/')) return route.fallback()
			const at = Date.now()
			const ifNoneMatch = headers['if-none-match'] ?? null
			const entry: Logged = { path: url.pathname, at, status: 0, cookie, ifNoneMatch, date: null }
			a.log.push(entry)
			if (url.pathname === '/robots.txt') {
				entry.status = 200
				return route.fulfill({ status: 200, contentType: 'text/plain', body: 'User-agent: *\nAllow: /\n' })
			}
			const own = a.status.get(url.pathname)
			if (own) {
				entry.status = own.status
				return route.fulfill({ status: own.status, headers: own.location ? { location: own.location } : {}, contentType: 'text/html', body: `<!doctype html><title>${own.status}</title>` })
			}
			const page = savedPage(url.pathname, a.nov12)
			if (!page) {
				entry.status = 404
				return route.fulfill({ status: 404, contentType: 'text/html', body: '<!doctype html><title>404</title>' })
			}
			let body = page.html
			for (const fn of a.edits.get(url.pathname) ?? []) body = fn(body)
			entry.date = page.date
			const etag = `"${crypto.createHash('sha1').update(body).digest('hex').slice(0, 16)}"`
			if (ifNoneMatch === etag) {
				entry.status = 304
				return route.fulfill({ status: 304, headers: { etag } })
			}
			entry.status = 200
			return route.fulfill({ status: 200, headers: { etag, 'content-type': 'text/html; charset=utf-8' }, body })
		},
	)
	return a
}

/** The page's own record of the watch's fetches (with the options passed), parses, and permission asks. */
export const PAGE_PROBE = `(() => {
	const own = location.origin
	const f = window.fetch
	window.__watchFetches = []
	window.fetch = function (input, init) {
		try {
			const u = new URL(typeof input === 'string' ? input : input.url, location.href)
			if (u.origin === own && !u.pathname.startsWith('/__vg/')) {
				const h = (init && init.headers) || {}
				const call = { path: u.pathname, at: Date.now(), credentials: init && init.credentials, redirect: init && init.redirect, cache: init && init.cache, ifNoneMatch: h['If-None-Match'] || null }
				window.__watchFetches.push(call)
				// Kept across reloads in this tab, so the spacing is checked across runs too.
				try {
					const all = JSON.parse(sessionStorage.getItem('__watchFetchLog') || '[]')
					all.push(call)
					sessionStorage.setItem('__watchFetchLog', JSON.stringify(all))
				} catch {}
			}
		} catch {}
		return f.apply(this, arguments)
	}
	// Parses of a fetched Vodafone page (one with #main-content); other parses (icons, small fragments) are not the watch's.
	const parse = DOMParser.prototype.parseFromString
	window.__parses = 0
	window.__allParses = 0
	DOMParser.prototype.parseFromString = function (s) {
		window.__allParses++
		if (typeof s === 'string' && /id="main-content"/.test(s)) window.__parses++
		return parse.apply(this, arguments)
	}
	window.__permissionAsks = 0
	if (window.Notification) {
		try {
			Object.defineProperty(Notification, 'requestPermission', { configurable: true, value: () => { window.__permissionAsks++; return Promise.resolve('default') } })
		} catch {}
	}
})()`

// ---- Readers ----

export const ready = (page: Page) => page.waitForFunction(() => (window as any).__aixcWatch?.ready === true, null, { timeout: 20_000 })

/** All rows of one store of aixc-watch-v1 ([] when the database or store is not there). */
export const rows = <T = any>(page: Page, store: 'watches' | 'targets' | 'pages' | 'changes' | 'meta'): Promise<T[]> =>
	page.evaluate(
		(store) =>
			new Promise<any[]>((resolve, reject) => {
				const r = indexedDB.open('aixc-watch-v1')
				r.onerror = () => reject(r.error)
				r.onsuccess = () => {
					const db = r.result
					if (!db.objectStoreNames.contains(store)) return resolve((db.close(), []))
					const q = db.transaction(store).objectStore(store).getAll()
					q.onsuccess = () => resolve((db.close(), q.result))
					q.onerror = () => reject(q.error)
				}
			}),
		store,
	)
export const watchKeys = async (page: Page) => (await rows<{ key: string }>(page, 'watches')).map((w) => w.key).sort()
export const runMeta = async (page: Page) => (await rows<{ key: string; value: any }>(page, 'meta')).find((m) => m.key === 'run')?.value ?? null

export const stickers = (page: Page): Promise<{ key: string; id: string; path: string; title: string }[]> =>
	page.evaluate(() => (window as any).__aixc.demos.pocket.store.all().map((r: any) => ({ key: r.key, id: r.id, path: r.source.path, title: r.copy.title })))

export const openAlbum = async (page: Page) => {
	await page.evaluate(() => (window as any).__aixc.demos.pocket.open())
	await page.waitForFunction(() => (window as any).__aixc.demos.pocket.state.view === 'pocket' && !(window as any).__aixc.demos.pocket.state.busy, null, { timeout: 15_000 })
}
export const closeAlbum = async (page: Page) => {
	await page.evaluate(() => (window as any).__aixc.demos.pocket.close())
	await page.waitForFunction(() => (window as any).__aixc.demos.pocket.state.view === 'page' && !(window as any).__aixc.demos.pocket.state.busy, null, { timeout: 15_000 })
}

/** The watch's block on the sticker under `key`: its tag, lines and buttons, or null. */
export const block = (page: Page, key: string) =>
	page.evaluate((key) => {
		const box = [...document.querySelectorAll<HTMLElement>('.aixc-watch')].find((b) => b.dataset.watchFor === key)
		if (!box) return null
		return {
			tag: box.querySelector('.aixc-watch__tag')?.textContent ?? null,
			lines: [...box.querySelectorAll('.aixc-watch__line')].map((p) => p.textContent ?? ''),
			buttons: [...box.querySelectorAll('button, a')].map((b) => b.textContent ?? ''),
			dir: getComputedStyle(box).direction,
		}
	}, key)
export const lineIs = async (page: Page, key: string, re: RegExp, timeout = 20_000) => {
	try {
		await page.waitForFunction(
			({ key, src }) => {
				const box = [...document.querySelectorAll<HTMLElement>('.aixc-watch')].find((b) => b.dataset.watchFor === key)
				return !!box && [...box.querySelectorAll('.aixc-watch__line')].some((p) => new RegExp(src).test(p.textContent || ''))
			},
			{ key, src: re.source },
			{ timeout },
		)
	} catch (e) {
		throw new Error(`no line ${re} on ${key}: ${JSON.stringify(await block(page, key).catch(() => null))} (${(e as Error).message})`)
	}
}
export const pressIn = (page: Page, key: string, text: string) =>
	page.evaluate(
		({ key, text }) => {
			const box = [...document.querySelectorAll<HTMLElement>('.aixc-watch')].find((b) => b.dataset.watchFor === key)!
			;[...box.querySelectorAll<HTMLElement>('button')].find((b) => b.textContent === text)!.click()
		},
		{ key, text },
	)
/** The Pocket button: its label, and its count of changed stickers when shown. */
export const peek = (page: Page) =>
	page.evaluate(() => {
		const b = document.querySelector<HTMLElement>('.pocket-peek')
		const c = b?.querySelector<HTMLElement>('.pocket-peek__changed')
		return { label: b?.getAttribute('aria-label') ?? null, changed: c && !c.hidden ? c.textContent : null }
	})
export const countIs = (page: Page, n: string, timeout = 25_000) => page.waitForFunction((n) => document.querySelector<HTMLElement>('.pocket-peek__changed:not([hidden])')?.textContent === n, n, { timeout })
export const noCount = (page: Page, timeout = 10_000) => page.waitForFunction(() => !document.querySelector<HTMLElement>('.pocket-peek__changed:not([hidden])'), null, { timeout })
/** The "Changed" note in the liner of the card `id` on the page, or null. */
export const liner = (page: Page, id: string) =>
	page.evaluate((id) => {
		const host = document.querySelector(`.pocket-chips .pocket-cta[data-pocket-for="${CSS.escape(id)}"]`)?.parentElement
		const b = host?.querySelector<HTMLElement>('.pocket-liner .aixc-watch-liner')
		return b ? { text: b.textContent, label: b.getAttribute('aria-label') } : null
	}, id)

/**
 * Boxes on screen: the Pocket button's count, the card's "Changed" liner, Vodafone's accessibility button,
 * the cookie banner, and the guide's mic (its launcher, in its shadow root). null when not shown.
 */
export const boxes = (page: Page, id: string | null) =>
	page.evaluate((id) => {
		const box = (el: Element | null | undefined) => {
			if (!el) return null
			const r = el.getBoundingClientRect()
			const cs = getComputedStyle(el)
			if (!r.width || !r.height || cs.display === 'none' || cs.visibility === 'hidden') return null
			return { x: r.left, y: r.top, w: r.width, h: r.height }
		}
		const g = document.querySelector('vg-guide')?.shadowRoot
		// The guide's voice-first microphone (.vg-mic), else its classic launcher.
		const mic = box(g?.querySelector('.vg-mic')) ? g?.querySelector('.vg-mic') : g?.querySelector('.launcher')
		const lin = id ? document.querySelector(`.pocket-chips .pocket-cta[data-pocket-for="${CSS.escape(id)}"]`)?.parentElement?.querySelector('.pocket-liner .aixc-watch-liner') : null
		return {
			count: box(document.querySelector('.pocket-peek__changed:not([hidden])')),
			button: box(document.querySelector('.pocket-peek')),
			liner: box(lin),
			widget: box(document.getElementById('vodafone-aw-icon')),
			banner: box(document.getElementById('onetrust-banner-sdk')),
			mic: box(mic),
		}
	}, id)
export type Box = { x: number; y: number; w: number; h: number } | null
export const intersects = (a: Box, b: Box) => !!a && !!b && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

/** Gaps (ms) between consecutive times. */
export const gaps = (times: number[]) => times.slice(1).map((t, i) => t - times[i]!)
