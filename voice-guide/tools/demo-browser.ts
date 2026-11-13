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
	/**
	 * Replay only: serve a cloned page (a folder with an index.html, `src/` and `public/`) at this
	 * path of the site's first origin, in place of the saved page. The Vodafone Services clone with
	 * Pocket is mounted at /en/services this way, so the whole demo stays on Vodafone pages.
	 * `pages` maps more paths to pages of the same clone (the Arabic one: /ar/services → ar/index.html).
	 */
	clone?: { path: string; dir: string; pages?: Record<string, string> }
	/** Replay only: pages opened from the internet (not in the replay) are never saved by the trail. Default: recorded like the rest. */
	liveUnsaved?: boolean
	/**
	 * Replay only: nothing is fetched from the internet. Pictures the replay did not save are a blank,
	 * fonts and styles it did not save are refused, and a page it does not have says so. Tests use it,
	 * so a run never reaches Vodafone's site. `onNetwork` hears each request that would have gone out.
	 * The browser also resolves no host name but localhost and uses no proxy (the machine's own or
	 * one from the environment would resolve the host for it, AIXC-65), so a request that escapes
	 * the routes (one released as the browser closes, AIXC-53) fails before it leaves the machine.
	 */
	offline?: boolean
	onNetwork?: (url: string, resourceType: string) => void
	/** Tests: Chromium writes its own network log to this file (what it started, resolved and connected). */
	netLog?: string
	/** The experience layer (ADR-0048): false keeps it off even where the site config turns it on. Default: the site config. */
	experiences?: boolean
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

/** Where the loader adds the experience layer (ADR-0048); null: nowhere. */
export interface LoaderExperiences {
	/** The site's first (web) origin only, never the shop. */
	origin: string
	/** Regular expressions on the path. */
	paths: string[]
	/** Paths the clone is mounted on in replay (it runs the demos itself until phase 9). */
	exclude: string[]
	/** Enabled demos, passed to the layer. */
	demos: string[]
}

/**
 * Where this demo browser adds the experience layer: the site config's paths on its first (web)
 * origin, the enabled demos, and in replay the paths the clone is mounted on left out. Null when the
 * site config or the `experiences: false` option turns it off.
 */
export function loaderExperiences(o: Pick<DemoBrowserOptions, 'site' | 'replayDir' | 'clone' | 'experiences'>): LoaderExperiences | null {
	const x = o.site.experiences
	if (!x.enabled || o.experiences === false) return null
	return {
		origin: new URL(o.site.origins[0].url).origin,
		paths: x.paths,
		exclude: o.replayDir && o.clone ? [o.clone.path, ...Object.keys(o.clone.pages || {})].map((p) => p.replace(/\/$/, '')) : [],
		demos: Object.entries(x.demos)
			.filter(([, on]) => on)
			.map(([name]) => name),
	}
}

/**
 * The loader the demo browser runs in every document: the same tags mode A adds through Tealium.
 * guide.js on every page of an allowed origin; then the experience layer, aixc.js (ADR-0048), on the
 * web origin's matching pages that have #main-content, unless the URL says ?aixc=off.
 */
export function loaderScript(o: { siteKey: string; origins: string[]; xray?: string; experiences?: LoaderExperiences | null }): string {
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
	const x = ${JSON.stringify(o.experiences ?? null)}
	const addLayer = () => {
		if (!x || location.origin !== x.origin || /[?&]aixc=off(&|$)/.test(location.search)) return
		if (!document.getElementById('main-content') || document.querySelector('script[data-aixc-demo]')) return
		if (x.exclude.includes(location.pathname.replace(/\\/$/, '')) || !x.paths.some((p) => new RegExp(p).test(location.pathname))) return
		const m = document.createElement('script')
		m.type = 'module'
		m.src = location.origin + '/__vg/sdk/aixc/aixc.js'
		m.dataset.aixcDemo = '1'
		m.dataset.aixcDemos = x.demos.join(' ')
		m.dataset.aixcSiteKey = ${JSON.stringify(o.siteKey)}
		;(document.head || document.documentElement).appendChild(m)
	}
	const both = () => {
		add()
		try { addLayer() } catch (e) {}
	}
	if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', both, { once: true })
	else both()
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
	'.js': 'text/javascript; charset=utf-8',
	'.mjs': 'text/javascript; charset=utf-8',
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.webp': 'image/webp',
	'.json': 'application/json; charset=utf-8',
}

/** Offline: no host name resolves but localhost, and no proxy is used, so nothing can leave the machine (AIXC-53, AIXC-65). */
export const OFFLINE_ARGS = ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1', '--no-proxy-server']

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
		...(o.offline ? OFFLINE_ARGS : []),
		...(o.netLog ? [`--log-net-log=${o.netLog}`, '--net-log-capture-mode=Default'] : []),
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
	if (o.replayDir) await installReplay(context, o.replayDir, origins, log, o.clone, o.liveUnsaved, o.offline ? { onNetwork: o.onNetwork || (() => {}) } : undefined)

	// Requests waiting on the gateway (the guide's 20 s long-poll among them). Closing ends each one
	// first: Playwright leaves a route still pending at close to Chromium, which sends it on to the
	// real site (AIXC-53).
	const pending = new Map<Route, AbortController>()
	let closing = false
	const forward = async (route: Route, target: string) => {
		if (closing) return route.abort('aborted').catch(() => {})
		const req = route.request()
		const headers = { ...req.headers() }
		delete headers.host
		delete headers['accept-encoding']
		const stop = new AbortController()
		pending.set(route, stop)
		try {
			const res = await fetch(target, { method: req.method(), headers, body: ['GET', 'HEAD'].includes(req.method()) ? undefined : (() => { const b = req.postDataBuffer(); return b ? new Uint8Array(b) : undefined })(), redirect: 'manual', signal: stop.signal })
			const out: Record<string, string> = {}
			res.headers.forEach((v, k) => {
				if (!['content-encoding', 'content-length', 'transfer-encoding', 'connection'].includes(k)) out[k] = v
			})
			const body = Buffer.from(await res.arrayBuffer())
			if (!closing) await route.fulfill({ status: res.status, headers: out, body })
		} catch (e) {
			if (closing) return
			log(`gateway unreachable for ${req.method()} ${target}: ${(e as Error).message}`)
			await route.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ error: 'gateway unreachable', code: 'gateway_down' }) }).catch(() => {})
		} finally {
			pending.delete(route)
		}
	}
	for (const origin of origins) {
		await context.route(`${origin}/vg-sw.js`, (route) => forward(route, `${gateway}/sdk/sw.js`))
		await context.route(`${origin}/__vg/**`, (route) => {
			const u = new URL(route.request().url())
			return forward(route, `${gateway}${u.pathname.slice('/__vg'.length)}${u.search}`)
		})
	}

	await context.addInitScript(loaderScript({ siteKey: o.site.siteKey, origins, xray: o.xray, experiences: loaderExperiences(o) }))
	if (o.replayDir && o.accessibilityStandIn !== false) await context.addInitScript(ACCESSIBILITY_STAND_IN)
	for (const s of o.initScripts || []) await context.addInitScript(s)

	const page = context.pages()[0] || (await context.newPage())
	await page.goto(o.start, { waitUntil: 'domcontentloaded' }).catch((e) => log(`could not open ${o.start}: ${(e as Error).message}`))
	return {
		context,
		page,
		close: async () => {
			closing = true
			await Promise.all(
				[...pending].map(([route, stop]) => {
					stop.abort()
					return route.abort('aborted').catch(() => {})
				}),
			)
			pending.clear()
			await context.close().catch(() => {})
			if (tmpProfile) fs.rmSync(tmpProfile, { recursive: true, force: true })
		},
	}
}

/** Serves the allowed origins from a crawl folder; a page the folder does not have opens from the internet, unsaved by the trail. */
async function installReplay(context: BrowserContext, dir: string, origins: string[], log: (m: string) => void, clone?: { path: string; dir: string; pages?: Record<string, string> }, liveUnsaved = false, offline?: { onNetwork: (url: string, type: string) => void }): Promise<void> {
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
	// The clone's own files: its page, its modules under /src and its public assets.
	const cloneFile = (pathname: string) => {
		if (!clone) return undefined
		const rel = decodeURIComponent(pathname).replace(/^\/+/, '')
		for (const base of [clone.dir, path.join(clone.dir, 'public')]) {
			const f = path.join(base, rel)
			if (!f.startsWith(base) || (base === clone.dir && !rel.startsWith('src/'))) continue
			if (fs.existsSync(f) && fs.statSync(f).isFile()) return f
		}
		return undefined
	}
	const clonePages: Record<string, string> = clone ? { [clone.path]: 'index.html', ...clone.pages } : {}
	const clonePage = (file: string) => {
		// The page-agent quick-start demo belongs to the page-agent experiment, not to this demo.
		const page = fs.readFileSync(path.join(clone!.dir, file), 'utf8')
		return page.replace(/<!--\s*Official Page Agent[\s\S]*?-->/, '').replace(/<script[^>]*page-agent[^>]*>\s*<\/script>/g, '')
	}
	if (clone) log(`replay: ${Object.keys(clonePages).join(' and ')} ${Object.keys(clonePages).length > 1 ? 'are' : 'is'} the clone in ${clone.dir}`)
	// A page the replay does not have opens from the internet, as it is, and everything it loads
	// comes from the internet too. The trail records it like any other public page; with
	// `liveUnsaved` it carries <meta name="vg-trail" content="off"> instead and is never saved.
	const live = new Set<string>()
	const bare = (u: string) => u.split('#')[0]
	const fromLivePage = (req: ReturnType<Route['request']>) => {
		try {
			for (let f: ReturnType<typeof req.frame> | null = req.frame(); f; f = f.parentFrame()) if (live.has(bare(f.url()))) return true
		} catch {}
		return false
	}
	const openLive = async (route: Route, url: URL) => {
		if (offline) {
			offline.onNetwork(url.toString(), 'document')
			return route.fulfill({ status: 404, contentType: 'text/html; charset=utf-8', body: notInReplay(url.toString(), known.length) })
		}
		try {
			const res = await route.fetch({ timeout: 20_000 })
			const headers = { ...res.headers() }
			delete headers['content-length']
			delete headers['content-encoding']
			if (!/text\/html/.test(headers['content-type'] || '')) return route.fulfill({ response: res, headers })
			const optOut = liveUnsaved ? '<meta name="vg-trail" content="off">' : ''
			const body = (await res.text()).replace(/<head[^>]*>/i, (m) => `${m}${optOut}<script>${KEEP_GUIDE_STORAGE}</script>`)
			live.add(bare(url.toString()))
			log(`live: ${url.pathname} is not in the replay; opened from the internet${liveUnsaved ? ', not saved by the trail' : ''}`)
			return route.fulfill({ response: res, headers, body })
		} catch {
			return route.fulfill({ status: 404, contentType: 'text/html; charset=utf-8', body: notInReplay(url.toString(), known.length) })
		}
	}
	await context.route('**/*', async (route) => {
		const req = route.request()
		let url: URL
		try {
			url = new URL(req.url())
		} catch {
			return route.abort()
		}
		if (url.protocol === 'data:' || url.protocol === 'blob:') return route.fallback()
		if (url.pathname.startsWith('/__vg/') || url.pathname === '/vg-sw.js') return route.fallback()
		if (req.resourceType() !== 'document' && fromLivePage(req)) return route.fallback()
		if (!origins.includes(url.origin)) return req.resourceType() === 'image' ? route.fulfill({ status: 200, contentType: 'image/png', body: PNG_1x1 }) : route.abort()
		const type = req.resourceType()
		if (clone && url.origin === origins[0]) {
			const clonedPage = type === 'document' ? clonePages[url.pathname.replace(/\/$/, '')] : undefined
			if (clonedPage) return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: clonePage(clonedPage) })
			const own = type === 'document' ? undefined : cloneFile(url.pathname)
			if (own) return route.fulfill({ status: 200, contentType: MIME[path.extname(own)] || 'application/octet-stream', body: fs.readFileSync(own) })
		}
		if (type === 'document') {
			const file = html.get(norm(url.toString()))
			if (file) {
				live.delete(bare(url.toString()))
				return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: read(file) })
			}
			return openLive(route, url)
		}
		const asset = assetFile(decodeURIComponent(url.pathname).replace(/^\/+/, ''))
		if (asset) {
			const ext = path.extname(asset.replace(/\.gz$/, ''))
			return route.fulfill({ status: 200, contentType: MIME[ext] || (type === 'stylesheet' ? 'text/css; charset=utf-8' : 'application/octet-stream'), body: read(asset) })
		}
		// Not saved (the replay keeps HTML and styles, not pictures): the site's own picture, font or
		// style from the internet, so saved pages and the trail's memories show their real images.
		// Never its scripts or API calls: saved pages stay script-free. Offline, a blank.
		const looksLikeAsset = /\.(png|jpe?g|gif|webp|avif|svg|ico|css|woff2?|ttf|otf)$/i.test(url.pathname) || url.pathname.startsWith('/documents/')
		if (!['image', 'stylesheet', 'font', 'media'].includes(type) && !(['fetch', 'xhr'].includes(type) && looksLikeAsset)) return route.abort()
		if (offline) {
			offline.onNetwork(url.toString(), type)
			return type === 'image' ? route.fulfill({ status: 200, contentType: 'image/png', body: PNG_1x1 }).catch(() => {}) : route.abort().catch(() => {})
		}
		try {
			return await route.fulfill({ response: await route.fetch({ timeout: 10_000 }) })
		} catch {
			if (type === 'image') return route.fulfill({ status: 200, contentType: 'image/png', body: PNG_1x1 }).catch(() => {})
			return route.abort().catch(() => {})
		}
	})
}

function norm(u: string): string {
	try {
		return normalizeUrl(u, { keepQuery: ['categoryUrls'] })
	} catch {
		return u
	}
}

/**
 * Vodafone's live pages call localStorage.clear() on load (theme scripts.js, found 2026-11-03),
 * which would also forget the person's trail consent and the guide's settings. On live pages
 * opened from the demo browser, clear() keeps the guide's own `vg-` keys. Real-site follow-up:
 * T-806 (consent must survive the site's own storage clean-up).
 */
const KEEP_GUIDE_STORAGE = `(() => { const P = Storage.prototype, clear = P.clear; P.clear = function () { if (this !== window.localStorage) return clear.call(this); const keep = []; for (let i = 0; i < this.length; i++) { const k = this.key(i); if (k && k.startsWith('vg-')) keep.push([k, this.getItem(k)]) } clear.call(this); for (const [k, v] of keep) this.setItem(k, v) } })()`

function notInReplay(url: string, pages: number): string {
	return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Not in this replay</title></head>
<body style="font:16px/1.5 Arial,sans-serif;color:#333;background:#f4f4f4;margin:0;padding:48px 24px">
<main style="max-width:640px;margin:auto;background:#fff;border-radius:6px;padding:24px;box-shadow:0 2px 4px rgba(0,0,0,.075)">
<h1 style="font-size:24px;margin:0 0 8px">Not in this replay</h1>
<p>This replay has the rendered HTML of a few key pages only. <code>${url.replace(/[<&>"]/g, '')}</code> is not one of them, and it could not be opened from the internet either.</p>
<p>Connect to the internet and try again, or go back.</p>
<p><a href="javascript:history.back()">Back</a></p></main></body></html>`
}
