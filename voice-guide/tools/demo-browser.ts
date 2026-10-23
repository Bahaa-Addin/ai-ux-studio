/**
 * Demo browser (ADR-0026, ADR-0031, SPEC-03 §1 mode B): a Chromium with the guide on real Vodafone
 * pages, without changing Vodafone's site and without a browser extension.
 *
 * - Every top-level document of an allowed origin gets the same <script> tag the Tealium tag would
 *   add, pointing at <page origin>/__vg/sdk/guide.js.
 * - Requests to <page origin>/__vg/** are answered from the local gateway (Node forwards them), so
 *   the page only ever talks to its own origin: no mixed content, no CORS, no local-network prompt.
 *   The SDK therefore uses long polling for live events (data-events="poll").
 * - /vg-sw.js (the push service worker) is served from the gateway's SDK files.
 * - Microphone and notifications are granted for the allowed origins.
 *
 * Replay mode (--replay <crawl dir>): the allowed origins are served from a crawl folder (rendered
 * HTML of captured pages, the site's stylesheets and fonts); every other request is answered locally
 * or refused, so nothing leaves the machine. Used by the end-to-end tests and as the offline fallback.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { gunzipSync } from 'node:zlib'

import { type BrowserContext, chromium, type Page, type Route } from 'playwright'

import { loadCrawl } from '#jobs/crawler/crawl.ts'
import { normalizeUrl } from '#jobs/crawler/url.ts'
import type { SiteConfig } from '#shared/config.ts'

export interface DemoBrowserOptions {
	site: SiteConfig
	/** Local gateway, for example http://127.0.0.1:4400 */
	gatewayUrl: string
	start: string
	/** Persistent profile (cookie answers, sign-ins). Omitted: a throwaway profile. */
	profileDir?: string
	headless?: boolean
	kiosk?: boolean
	xray?: 'off' | 'button' | 'open'
	/** Serve the site's origins from this crawl folder instead of the internet. */
	replayDir?: string
	/** Replay only: add a stand-in of Vodafone's accessibility button (scripts are off in replay, so the real one is absent). */
	accessibilityStandIn?: boolean
	/** Chromium's fake microphone playing this WAV file (tests). */
	fakeMic?: string
	/**
	 * Which browser: the installed Google Chrome (default for people) or Playwright's Chromium
	 * (tests). Speech recognition needs Google Chrome: Chromium builds have no speech service, so
	 * the microphone would only show the wave and an error (ADR-0033).
	 */
	channel?: 'chrome' | 'chromium'
	/** Extra scripts run before the page's own (tests: speech stand-ins). */
	initScripts?: string[]
	viewport?: { width: number; height: number }
	recordVideoDir?: string
	log?: (msg: string) => void
}

export interface DemoBrowser {
	context: BrowserContext
	page: Page
	close(): Promise<void>
}

/** The loader the demo browser runs in every document: the same tag mode A adds through Tealium. */
export function loaderScript(o: { siteKey: string; origins: string[]; xray?: string }): string {
	return `(() => { try {
	if (window.top !== window) return
	if (!${JSON.stringify(o.origins)}.includes(location.origin)) return
	if (window.__vgLoader) return
	window.__vgLoader = true
	const add = () => {
		if (document.querySelector('script[data-vg-loader]')) return
		const s = document.createElement('script')
		s.src = location.origin + '/__vg/sdk/guide.js'
		s.async = true
		s.dataset.siteKey = ${JSON.stringify(o.siteKey)}
		s.dataset.events = 'poll'
		s.dataset.vgLoader = '1'
		${o.xray ? `s.dataset.xray = ${JSON.stringify(o.xray)}` : ''}
		;(document.head || document.documentElement).appendChild(s)
	}
	if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', add, { once: true })
	else add()
} catch (e) {} })()`
}

/** A non-functional stand-in at the audited size and place of Vodafone's accessibility button (audit §5). */
const ACCESSIBILITY_STAND_IN = `(() => {
	if (window.top !== window) return
	const add = () => {
		if (document.getElementById('vodafone-aw-icon') || !/^\\/(en|ar)\\//.test(location.pathname)) return
		const b = document.createElement('button')
		b.id = 'vodafone-aw-icon'
		b.type = 'button'
		b.setAttribute('aria-label', 'Accessibility (replay stand-in)')
		b.style.cssText = 'position:fixed;right:20px;bottom:20px;width:55px;height:55px;border-radius:50%;border:5px solid #fff;background:#e60000;box-shadow:0 6px 20px rgba(230,0,0,.35);z-index:1;padding:0;cursor:pointer'
		b.innerHTML = '<svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true"><circle cx="16" cy="8" r="2.6" fill="#fff"/><path d="M8 12.5l8 1.6 8-1.6M16 14v6l-4 7M16 20l4 7" stroke="#fff" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>'
		document.body.appendChild(b)
	}
	if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', add, { once: true })
	else add()
})()`

const PNG_1x1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64')

const MIME: Record<string, string> = {
	'.css': 'text/css; charset=utf-8',
	'.woff': 'font/woff',
	'.woff2': 'font/woff2',
	'.ttf': 'font/ttf',
	'.svg': 'image/svg+xml',
}

export async function launchDemoBrowser(o: DemoBrowserOptions): Promise<DemoBrowser> {
	const log = o.log || (() => {})
	const origins = o.site.origins.map((x) => new URL(x.url).origin)
	const gateway = o.gatewayUrl.replace(/\/$/, '')
	const tmpProfile = o.profileDir ? null : fs.mkdtempSync(path.join(os.tmpdir(), 'vg-demo-'))
	const profile = o.profileDir || tmpProfile!
	fs.mkdirSync(profile, { recursive: true })
	const args = [
		...(o.kiosk ? ['--kiosk'] : o.headless ? [] : ['--start-maximized']),
		...(o.fakeMic ? ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${o.fakeMic}`] : []),
		'--autoplay-policy=no-user-gesture-required',
	]
	const launch = (channel: 'chrome' | 'chromium') =>
		chromium.launchPersistentContext(profile, {
			...(channel === 'chrome' ? { channel: 'chrome', ignoreDefaultArgs: ['--disable-component-update'] } : {}),
			headless: !!o.headless,
			viewport: o.viewport || (o.headless ? { width: 1280, height: 800 } : null),
			args,
			locale: 'ar-EG',
			...(o.recordVideoDir ? { recordVideo: { dir: o.recordVideoDir, size: o.viewport || { width: 1280, height: 800 } } } : {}),
		})
	let context: BrowserContext
	let used = o.channel || (o.fakeMic || o.headless ? 'chromium' : 'chrome')
	try {
		context = await launch(used)
	} catch (e) {
		if (used !== 'chrome') throw e
		log(`Google Chrome did not start (${(e as Error).message.split('\n')[0]}). Falling back to Chromium: typing works, but speech recognition needs Google Chrome.`)
		used = 'chromium'
		context = await launch(used)
	}
	log(`Browser: ${used === 'chrome' ? 'Google Chrome' : 'Chromium (no speech recognition service)'}`)
	for (const origin of origins) await context.grantPermissions(['microphone', 'notifications'], { origin })

	// Routes are matched newest first: the replay catch-all goes in first, the gateway bridge last.
	if (o.replayDir) await installReplay(context, o.replayDir, origins, log)

	const forward = async (route: Route, target: string) => {
		const req = route.request()
		const headers = { ...req.headers() }
		delete headers.host
		delete headers['accept-encoding']
		try {
			const res = await fetch(target, { method: req.method(), headers, body: ['GET', 'HEAD'].includes(req.method()) ? undefined : (() => { const b = req.postDataBuffer(); return b ? new Uint8Array(b) : undefined })(), redirect: 'manual' })
			const out: Record<string, string> = {}
			res.headers.forEach((v, k) => {
				if (!['content-encoding', 'content-length', 'transfer-encoding', 'connection'].includes(k)) out[k] = v
			})
			await route.fulfill({ status: res.status, headers: out, body: Buffer.from(await res.arrayBuffer()) })
		} catch (e) {
			log(`gateway unreachable for ${req.method()} ${target}: ${(e as Error).message}`)
			await route.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ error: 'gateway unreachable', code: 'gateway_down' }) }).catch(() => {})
		}
	}
	for (const origin of origins) {
		await context.route(`${origin}/vg-sw.js`, (route) => forward(route, `${gateway}/sdk/sw.js`))
		await context.route(`${origin}/__vg/**`, (route) => {
			const u = new URL(route.request().url())
			return forward(route, `${gateway}${u.pathname.slice('/__vg'.length)}${u.search}`)
		})
	}

	await context.addInitScript(loaderScript({ siteKey: o.site.siteKey, origins, xray: o.xray }))
	if (o.replayDir && o.accessibilityStandIn !== false) await context.addInitScript(ACCESSIBILITY_STAND_IN)
	for (const s of o.initScripts || []) await context.addInitScript(s)

	const page = context.pages()[0] || (await context.newPage())
	await page.goto(o.start, { waitUntil: 'domcontentloaded' }).catch((e) => log(`could not open ${o.start}: ${(e as Error).message}`))
	return {
		context,
		page,
		close: async () => {
			await context.close().catch(() => {})
			if (tmpProfile) fs.rmSync(tmpProfile, { recursive: true, force: true })
		},
	}
}

/** Serves the allowed origins from a crawl folder; nothing goes to the internet. */
async function installReplay(context: BrowserContext, dir: string, origins: string[], log: (m: string) => void): Promise<void> {
	const crawl = loadCrawl(dir)
	const html = new Map<string, string>()
	for (const p of crawl.pages) {
		if (!p.snapshot) continue
		const file = path.join(dir, p.snapshot)
		if (!fs.existsSync(file)) continue
		for (const u of [p.url, ...(p.aliases || [])]) html.set(norm(u), file)
	}
	// Files may be gzipped (the committed replay fixture); read either.
	const read = (file: string) => (file.endsWith('.gz') ? gunzipSync(fs.readFileSync(file)) : fs.readFileSync(file))
	const assetFile = (rel: string) => {
		const base = path.join(dir, 'assets', rel)
		if (!base.startsWith(path.join(dir, 'assets'))) return undefined
		for (const f of [base, `${base}.gz`]) if (fs.existsSync(f) && fs.statSync(f).isFile()) return f
		return undefined
	}
	const known = crawl.pages.map((p) => p.url)
	log(`replay: ${html.size} pages with rendered HTML from ${dir}`)
	await context.route('**/*', async (route) => {
		const req = route.request()
		let url: URL
		try {
			url = new URL(req.url())
		} catch {
			return route.abort()
		}
		if (url.protocol === 'data:' || url.protocol === 'blob:') return route.fallback()
		if (!origins.includes(url.origin)) return req.resourceType() === 'image' ? route.fulfill({ status: 200, contentType: 'image/png', body: PNG_1x1 }) : route.abort()
		if (url.pathname.startsWith('/__vg/') || url.pathname === '/vg-sw.js') return route.fallback()
		const type = req.resourceType()
		if (type === 'document') {
			const file = html.get(norm(url.toString()))
			if (file) return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: read(file) })
			return route.fulfill({ status: 404, contentType: 'text/html; charset=utf-8', body: notInReplay(url.toString(), known.length) })
		}
		const asset = assetFile(decodeURIComponent(url.pathname).replace(/^\/+/, ''))
		if (asset) {
			const ext = path.extname(asset.replace(/\.gz$/, ''))
			return route.fulfill({ status: 200, contentType: MIME[ext] || (type === 'stylesheet' ? 'text/css; charset=utf-8' : 'application/octet-stream'), body: read(asset) })
		}
		if (type === 'image') return route.fulfill({ status: 200, contentType: 'image/png', body: PNG_1x1 })
		return route.abort()
	})
}

function norm(u: string): string {
	try {
		return normalizeUrl(u, { keepQuery: ['categoryUrls'] })
	} catch {
		return u
	}
}

function notInReplay(url: string, pages: number): string {
	return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Not in this replay</title></head>
<body style="font:16px/1.5 Arial,sans-serif;color:#333;background:#f4f4f4;margin:0;padding:48px 24px">
<main style="max-width:640px;margin:auto;background:#fff;border-radius:6px;padding:24px;box-shadow:0 2px 4px rgba(0,0,0,.075)">
<h1 style="font-size:24px;margin:0 0 8px">Not in this replay</h1>
<p>This offline replay has the rendered HTML of a few key pages only. <code>${url.replace(/[<&>"]/g, '')}</code> is not one of them.</p>
<p>Use the live mode on a machine with internet access, or go back.</p>
<p><a href="javascript:history.back()">Back</a></p></main></body></html>`
}
