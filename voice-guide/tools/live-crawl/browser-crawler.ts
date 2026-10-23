/**
 * In-browser crawler (ADR-0032). For when the only machine that can reach the site is a
 * person's browser (the build sandbox could not reach vodafone.com.eg). It is injected into one
 * tab of the site and loads each same-origin page into an off-screen, sandboxed iframe, then runs
 * the crawler's own extractPage() against that document. Output is the same PageSnap the
 * Playwright crawler produces, so the KB builder needs no changes.
 *
 * Politeness and scope (SPEC-04 §4): one page at a time, a pause between pages, robots.txt,
 * depth limit, include/exclude, public pages only (the tab must be signed out, and pages showing
 * a password field or a login URL are skipped), stop on bot-challenge titles or 403/429.
 *
 * Content pages load with scripts disabled (sandbox without allow-scripts): no analytics hits,
 * no cookie banner, faster. Paths matching `scriptsFor` (the /spa/ Angular app) get scripts.
 *
 * Built by tools/live-crawl/bundle.ts into an IIFE that defines window.__vgCrawler.
 */
import { extractPage } from '../../jobs/crawler/extract.ts'
import { parseRobots, type RobotsRules, robotsAllows } from '../../jobs/crawler/robots.ts'
import type { PageSnap } from '../../jobs/crawler/types.ts'
import { CHALLENGE_TITLE, LOGIN_URL, makeInScope, normalizeUrl } from '../../jobs/crawler/url.ts'

export interface BrowserCrawlConfig {
	siteId: string
	start: string[]
	origins: string[]
	include: string[]
	exclude: string[]
	keepQuery: string[]
	maxPages: number
	maxDepth: number
	delayMs: number
	minItems: number
	ignoreSelectors: string[]
	scriptsFor?: string
	/** Pages whose rendered HTML is kept for offline tests and the local replay (T-207). */
	captureHtml?: string
	/** Ms to wait after load for content pages, and the quiet period for app pages. */
	settleMs?: number
	spaQuietMs?: number
	spaTimeoutMs?: number
}

interface State {
	config: BrowserCrawlConfig
	status: 'running' | 'done' | 'stopped' | 'failed'
	reason?: string
	startedAt: string
	finishedAt?: string
	pages: PageSnap[]
	errors: { url: string; error: string }[]
	html: Record<string, string>
	queue: { url: string; depth: number }[]
	done: number
	log: string[]
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function loadFrame(url: string, scripts: boolean): Promise<HTMLIFrameElement> {
	const f = document.createElement('iframe')
	f.setAttribute('sandbox', scripts ? 'allow-same-origin allow-scripts allow-forms' : 'allow-same-origin')
	f.setAttribute('aria-hidden', 'true')
	f.setAttribute('data-vg-crawler', '')
	f.style.cssText = 'position:fixed;left:-20000px;top:0;width:1280px;height:900px;border:0;opacity:0;pointer-events:none'
	const loaded = new Promise<void>((resolve, reject) => {
		const t = setTimeout(() => reject(new Error('timeout loading page')), 30_000)
		f.addEventListener('load', () => {
			clearTimeout(t)
			resolve()
		}, { once: true })
	})
	f.src = url
	document.body.appendChild(f)
	await loaded
	return f
}

async function settleApp(doc: Document, quietMs: number, timeoutMs: number): Promise<void> {
	const t0 = Date.now()
	const root = () => doc.querySelector('app-root, vf-root')
	while (Date.now() - t0 < timeoutMs && !(root() && root()!.children.length)) await sleep(100)
	let last = Date.now()
	const mo = new MutationObserver(() => (last = Date.now()))
	mo.observe(doc.documentElement, { subtree: true, childList: true, characterData: true, attributes: true })
	while (Date.now() - t0 < timeoutMs && Date.now() - last < quietMs) await sleep(100)
	mo.disconnect()
}

function extractIn(frame: HTMLIFrameElement, minItems: number): PageSnap {
	const w = frame.contentWindow as Window & typeof globalThis
	const doc = frame.contentDocument as Document
	// Run extractPage with the frame's globals: it only uses document, window, getComputedStyle,
	// NodeFilter and location (it is written to run inside a page with page.evaluate).
	const run = new Function('document', 'window', 'getComputedStyle', 'NodeFilter', 'location', 'opts', `return (${extractPage.toString()})(opts)`)
	return run(doc, w, w.getComputedStyle.bind(w), w.NodeFilter, w.location, { minItems }) as PageSnap
}

export function start(config: BrowserCrawlConfig): State {
	const state: State = {
		config,
		status: 'running',
		startedAt: new Date().toISOString(),
		pages: [],
		errors: [],
		html: {},
		queue: [],
		done: 0,
		log: [],
	}
	;(window as any).__vgCrawl = state
	void run(state).catch((e) => {
		state.status = 'failed'
		state.reason = String(e?.message || e)
		state.finishedAt = new Date().toISOString()
	})
	return state
}

async function run(s: State): Promise<void> {
	const c = s.config
	const say = (m: string) => {
		s.log.push(`${new Date().toISOString().slice(11, 19)} ${m}`)
		if (s.log.length > 200) s.log.shift()
	}
	if (document.body.className.includes('signed-in')) {
		s.status = 'stopped'
		s.reason = 'this tab is signed in; the crawl is public-only. Sign out and start again.'
		return
	}
	const rules = { keepQuery: c.keepQuery }
	const norm = (u: string) => normalizeUrl(u, rules)
	const inScope = makeInScope({ origins: c.origins, include: c.include, exclude: c.exclude })
	const here = location.origin
	let robots: RobotsRules | null = null
	try {
		const r = await fetch('/robots.txt', { credentials: 'omit' })
		if (r.ok) robots = parseRobots(await r.text())
	} catch {
		say('robots.txt unavailable')
	}
	const capture = c.captureHtml ? new RegExp(c.captureHtml) : null
	const scripts = c.scriptsFor ? new RegExp(c.scriptsFor) : null
	const seen = new Set<string>()
	for (const u of c.start.map(norm)) {
		if (new URL(u).origin !== here || seen.has(u)) continue
		seen.add(u)
		s.queue.push({ url: u, depth: 0 })
	}
	let blocked = 0
	while (s.queue.length && s.pages.length + s.errors.length < c.maxPages) {
		const { url, depth } = s.queue.shift()!
		const u = new URL(url)
		if (robots && !robotsAllows(robots, u.pathname + u.search)) {
			s.errors.push({ url, error: 'disallowed by robots.txt' })
			continue
		}
		await sleep(c.delayMs)
		let frame: HTMLIFrameElement | null = null
		try {
			const useScripts = !!scripts?.test(u.pathname)
			frame = await loadFrame(url, useScripts)
			const doc = frame.contentDocument
			if (!doc) throw new Error('page not readable (cross-origin)')
			if (useScripts) await settleApp(doc, c.spaQuietMs ?? 600, c.spaTimeoutMs ?? 12_000)
			else await sleep(c.settleMs ?? 300)
			const nav = frame.contentWindow!.performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming & { responseStatus?: number }
			const status = nav?.responseStatus ?? 0
			if (status === 403 || status === 429 || CHALLENGE_TITLE.test(doc.title)) {
				blocked++
				s.errors.push({ url, error: `blocked (${status} ${doc.title.slice(0, 60)})` })
				if (blocked >= 3 || blocked / (s.pages.length + s.errors.length) > 0.05) {
					s.status = 'stopped'
					s.reason = `stopped after ${blocked} blocked responses`
					break
				}
				continue
			}
			const finalUrl = norm(frame.contentWindow!.location.href)
			if (finalUrl !== url && !inScope(finalUrl)) {
				s.errors.push({ url, error: `redirected out of scope to ${finalUrl}` })
				continue
			}
			const pw = [...doc.querySelectorAll('input[type="password"]')].some((el) => (el as HTMLElement).getBoundingClientRect().width > 0)
			if (LOGIN_URL.test(new URL(finalUrl).pathname) || pw) {
				s.errors.push({ url, error: 'login required (skipped: public-only crawl)' })
				continue
			}
			const existing = finalUrl !== url ? s.pages.find((p) => p.url === finalUrl) : undefined
			if (existing) {
				existing.aliases = [...new Set([...(existing.aliases || []), url])]
				continue
			}
			seen.add(finalUrl)
			for (const sel of c.ignoreSelectors) for (const el of doc.querySelectorAll(sel)) el.remove()
			const snap = extractIn(frame, c.minItems)
			snap.url = finalUrl
			snap.status = status || 200
			if (finalUrl !== url) snap.aliases = [url]
			if (capture?.test(finalUrl)) s.html[finalUrl] = '<!doctype html>\n' + doc.documentElement.outerHTML
			s.pages.push(snap)
			say(`ok ${depth} ${finalUrl} s=${snap.sections.length} c=${snap.collections.length} v=${snap.visuals.length} l=${snap.links.length}`)
			if (depth >= c.maxDepth) continue
			for (const l of [...snap.links.map((x) => x.href), ...Object.values(snap.alternates)]) {
				let n: string
				try {
					n = norm(new URL(l, finalUrl).toString())
				} catch {
					continue
				}
				if (new URL(n).origin !== here) continue
				if (!seen.has(n) && inScope(n)) {
					seen.add(n)
					s.queue.push({ url: n, depth: depth + 1 })
				}
			}
		} catch (e) {
			s.errors.push({ url, error: String((e as Error)?.message || e).slice(0, 200) })
			say(`error ${url}: ${(e as Error)?.message}`)
		} finally {
			frame?.remove()
			s.done++
		}
	}
	if (s.status === 'running') s.status = 'done'
	s.finishedAt = new Date().toISOString()
	say(`finished: ${s.pages.length} pages, ${s.errors.length} errors, ${s.queue.length} left in queue`)
}

/** Progress for polling. */
export function status() {
	const s = (window as any).__vgCrawl as State | undefined
	if (!s) return null
	return { status: s.status, reason: s.reason, pages: s.pages.length, errors: s.errors.length, queued: s.queue.length, captured: Object.keys(s.html).length, last: s.log.slice(-5) }
}

/** The result as JSON, in slices (the tool that reads it back has a size limit per call). */
export function exportJson(part: number, size = 400_000): { part: number; parts: number; data: string } {
	const s = (window as any).__vgCrawl as State
	const json = JSON.stringify({
		siteId: s.config.siteId,
		origin: location.origin,
		startedAt: s.startedAt,
		finishedAt: s.finishedAt,
		status: s.status,
		reason: s.reason,
		pages: s.pages,
		errors: s.errors,
		html: s.html,
		left: s.queue.map((q) => q.url),
	})
	const parts = Math.ceil(json.length / size)
	return { part, parts, data: json.slice(part * size, (part + 1) * size) }
}
