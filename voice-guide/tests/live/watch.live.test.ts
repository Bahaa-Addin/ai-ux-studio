/**
 * The page watch's one opt-in live run on the real web.vodafone.com.eg (Way 2 phase 6; ADR-0078 "Verified by";
 * phase 6 design §5 last bullet and §9; AGENTS.md §4.5). It is the owner's run, started by him once, by hand:
 * it must never be scheduled, put in CI, or run in a loop (no scheduled crawling of production, PRD D3).
 *
 *   cd voice-guide && VG_LIVE=1 node --test --test-timeout=600000 tests/live/watch.live.test.ts
 *
 * What it does: the installed Google Chrome (window visible), a fresh throwaway profile, signed out; the layer
 * as `npm run demo:live` adds it, with `experiences.demos.watch` turned on for this run's site object only (it
 * stays false in config/sites/vodafone-eg.yaml). It opens /ar/home once, runs window.__aixcWatch.fill() once
 * (two demo stickers, checked at once: robots.txt and at most 12 pages, 1 s apart), waits for that run to end,
 * reads the stickers' lines, reloads once (the 30-minute throttle: no watch request), then reset() and close.
 * It never presses anything of Vodafone's, never answers the cookie banner, never signs in or types.
 *
 * What it measures, from a page-side probe of the watch's own fetches (as tests/e2e/vodafone-watch.ts's
 * PAGE_PROBE) and the browser's own request log: per request its path, status, ETag / Last-Modified present,
 * bytes, ms and start time; the spacing between starts; any redirect (opaque) or 200 without #main-content;
 * whether the run blocked (meta.run.blockedUntil); robots.txt's status and whether its rules (as the checker
 * parsed them) allow each page; the checker's own DOMParser time per page; and what each demo sticker says
 * changed since 23 Oct. It prints a table and a summary (lines starting '# ').
 *
 * What it asserts: only the site's rules, never what Vodafone's pages have or lack: at most 12 pages plus
 * robots.txt, starts at least 1,000 ms apart, no cookie on any watch request (credentials 'omit'), no redirect
 * followed (redirect 'manual'), only pages robots.txt allows, a block stops the run, and a reload within
 * 30 minutes makes no watch request. A bot check or an error page on /ar/home stops the run before fill():
 * nothing is pressed, nothing is retried (runbook §0).
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { pathToFileURL } from 'node:url'

import type { Page, Request } from 'playwright'

import type { Manifest } from '#kb'
import { loadPlatformConfig, loadSiteConfig, ROOT, type SiteConfig } from '#shared/config.ts'

import { buildSdk } from '../../packages/sdk/build.ts'
import { createGateway } from '../../services/gateway/server.ts'
import { createServices } from '../../services/index.ts'
import { type DemoBrowser, launchDemoBrowser } from '../../tools/demo-browser.ts'
import { block, closeAlbum, gaps, openAlbum, rows, runMeta } from '../e2e/vodafone-watch.ts'

const LIVE = process.env.VG_LIVE === '1'
const PORT = 4738
const WEB = 'https://web.vodafone.com.eg'
const HOME = '/ar/home'
const MAX_PAGES = 12
const SPACING_MS = 1000
const BLOCKING = [403, 429, 503]
const BOT_WORDS = /access denied|attention required|just a moment|captcha|verify (that )?you are (a )?human|checking your browser|pardon our interruption|request unsuccessful|are you a robot/i
const CHALLENGE_MARKERS = '#challenge-form, #challenge-running, #cf-challenge-running, #challenge-stage, iframe[src*="challenges.cloudflare.com"], script[src*="/cdn-cgi/challenge-platform/h/"], #px-captcha, iframe[src*="captcha"], .g-recaptcha, .h-captcha'

/**
 * The page's record of the watch's fetches: calls to the page's own origin (not /__vg/) made from the layer's
 * code (a stack frame under /__vg/sdk/aixc/), with the options passed, what came back, and the checker's own
 * DOMParser parses of a fetched page (with their time). Vodafone's own fetches are counted apart, never logged.
 */
const PROBE = `(() => {
	const own = location.origin
	const f = window.fetch
	window.__watchCalls = []
	window.__otherFetches = 0
	window.__watchParses = []
	window.fetch = function (input, init) {
		let rec = null
		try {
			const u = new URL(typeof input === 'string' ? input : input.url, location.href)
			if (u.origin === own && !u.pathname.startsWith('/__vg/')) {
				if (/\\/__vg\\/sdk\\/aixc\\//.test(new Error().stack || '')) {
					const h = (init && init.headers) || {}
					rec = { path: u.pathname + u.search, at: Date.now(), credentials: init && init.credentials, redirect: init && init.redirect, cache: init && init.cache, ifNoneMatch: h['If-None-Match'] || null, ifModifiedSince: h['If-Modified-Since'] || null, status: null, type: null, redirected: null, etag: null, lastModified: null, contentType: null, bytes: null, chars: null, main: null, msHeaders: null, ms: null, error: null }
					window.__watchCalls.push(rec)
				} else window.__otherFetches++
			}
		} catch {}
		const t0 = performance.now()
		const out = f.apply(this, arguments)
		if (rec) {
			out.then(async (res) => {
				rec.msHeaders = Math.round(performance.now() - t0)
				rec.status = res.status
				rec.type = res.type
				rec.redirected = res.redirected
				rec.etag = !!res.headers.get('etag')
				rec.lastModified = !!res.headers.get('last-modified')
				rec.contentType = res.headers.get('content-type')
				try {
					const buf = await res.clone().arrayBuffer()
					const text = new TextDecoder().decode(buf)
					rec.bytes = buf.byteLength
					rec.chars = text.length
					rec.main = /id=["']?main-content\\b/.test(text)
				} catch (e) { rec.error = String(e) }
				rec.ms = Math.round(performance.now() - t0)
			}, (e) => { rec.error = String(e); rec.ms = Math.round(performance.now() - t0) })
		}
		return out
	}
	const parse = DOMParser.prototype.parseFromString
	DOMParser.prototype.parseFromString = function (s) {
		if (typeof s !== 'string' || !/id=["']?main-content\\b/.test(s)) return parse.apply(this, arguments)
		const t0 = performance.now()
		const doc = parse.apply(this, arguments)
		window.__watchParses.push({ chars: s.length, ms: Math.round((performance.now() - t0) * 10) / 10 })
		return doc
	}
})()`

interface Call {
	path: string
	at: number
	credentials: string
	redirect: string
	cache: string
	ifNoneMatch: string | null
	ifModifiedSince: string | null
	status: number | null
	type: string | null
	redirected: boolean | null
	etag: boolean | null
	lastModified: boolean | null
	contentType: string | null
	bytes: number | null
	chars: number | null
	main: boolean | null
	msHeaders: number | null
	ms: number | null
	error: string | null
}
interface Seen {
	path: string
	req: Request
}

let services: Awaited<ReturnType<typeof createServices>>
let gateway: ReturnType<typeof createGateway>
let site: SiteConfig
let browser: DemoBrowser | undefined
let page: Page | undefined
let resetDone = false

before(async () => {
	if (!LIVE) return
	await buildSdk({ minify: true })
	const platform = loadPlatformConfig({ ...process.env, VG_VOICETUT_URL: '', VG_STORE: 'memory', VG_PORT: String(PORT), VG_PUBLIC_URL: `http://127.0.0.1:${PORT}` })
	site = loadSiteConfig(path.join(platform.sitesDir, 'vodafone-eg.yaml'))
	// This run's site object only: the watch on (it stays off in the committed config), its rules as committed.
	site.experiences.demos.watch = true
	assert.equal(site.experiences.watch.minIntervalMin, 30, 'the site config\'s 30 minutes')
	services = await createServices({ platform, sites: new Map([[site.id, site]]) })
	const m = JSON.parse(fs.readFileSync(path.join(ROOT, 'config/kb/vodafone-eg.manifest.json'), 'utf8')) as Manifest
	await services.store.putKbVersion(site.id, m)
	await services.store.activateKb(site.id, m.version.id)
	gateway = createGateway({ services })
	await gateway.listen(PORT)
})

after(async () => {
	// The watch's database goes even when the run stopped half way (the profile is a throwaway one anyway).
	if (page && !resetDone) await page.evaluate(() => (window as any).__aixcWatch?.reset?.()).catch(() => {})
	await browser?.close()
	await gateway?.close()
	await services?.close()
})

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms))

/** A bot check, a block or an error page: the reason to stop, or null. */
async function stopReason(p: Page, status: number | null): Promise<string | null> {
	if (status !== null && BLOCKING.includes(status)) return `${p.url()} answered ${status}: a bot check or a block`
	const seen = await p
		.evaluate((markers) => ({ title: document.title, text: document.getElementById('main-content') ? '' : (document.body?.innerText ?? '').slice(0, 2000), marker: document.querySelectorAll(markers).length, vodafone: !!document.getElementById('main-content') }), CHALLENGE_MARKERS)
		.catch(() => ({ title: '', text: '', marker: 0, vodafone: false }))
	if (BOT_WORDS.test(seen.title) || BOT_WORDS.test(seen.text) || seen.marker) return `${p.url()} is a bot check or a challenge ("${seen.title}")`
	if (status !== null && status >= 400) return `${p.url()} answered ${status} ("${seen.title}"): an error page`
	return null
}

/** The layer and its watch ready on this page (window.__aixcWatch, with ?aixc-debug). */
const watchReady = (p: Page) => p.waitForFunction(() => (window as any).__aixcWatch?.ready === true, null, { timeout: 60_000 })

const pad = (s: unknown, n: number) => String(s ?? '-').padEnd(n)
const yes = (b: boolean | null) => (b == null ? '-' : b ? 'yes' : 'no')

test('live: the page watch\'s one run on /ar/home: fill once, the site\'s rules kept, the 30-minute throttle holds', { skip: !LIVE && 'the owner\'s one opt-in live run against web.vodafone.com.eg: set VG_LIVE=1 to run it by hand (never scheduled)', timeout: 600_000 }, async (t) => {
	const said: string[] = []
	browser = await launchDemoBrowser({ site, gatewayUrl: `http://127.0.0.1:${PORT}`, start: 'about:blank', headless: false, channel: 'chrome', xray: 'off', viewport: { width: 1366, height: 900 }, initScripts: [PROBE], log: (m) => (said.push(m), console.log(`# browser: ${m}`)) })
	if (said.some((m) => /Falling back to Chromium|Browser: Chromium/.test(m))) throw new Error('Google Chrome did not start: this run uses only the installed Google Chrome; nothing was opened')
	page = browser.page
	const p = page
	const seen: Seen[] = []
	browser.context.on('request', (req) => {
		const u = new URL(req.url())
		if (u.origin === WEB && req.resourceType() === 'fetch' && !u.pathname.startsWith('/__vg/')) seen.push({ path: u.pathname + u.search, req })
	})
	const debug: string[] = []
	p.on('console', (m) => {
		if (/^\[AIXC\] (watch|the page watch)/.test(m.text())) debug.push(m.text())
	})

	// ---- /ar/home, once ----
	const res = await p.goto(`${WEB}${HOME}?aixc-debug`, { waitUntil: 'load', timeout: 60_000 })
	const status = res?.status() ?? null
	console.log(`# load ${HOME}: ${status}`)
	const stop = await stopReason(p, status)
	if (stop) return t.skip(`stopped before fill(): ${stop}. Nothing was pressed, nothing is retried (runbook §0).`)
	await watchReady(p)
	// The check on visit at idle: no watch yet, so it fetches nothing.
	await sleep(3000)

	// ---- fill(), once; it resolves when its run has ended ----
	const t0 = Date.now()
	const filled = await p.evaluate(() => (window as any).__aixcWatch.fill())
	const runMs = Date.now() - t0
	console.log(`# fill(): ${JSON.stringify(filled)} in ${runMs} ms`)
	assert.equal(filled?.ok, true, `fill() ran (${JSON.stringify(filled)})`)
	// Give the probe's body reads time to finish.
	await sleep(1500)
	const calls: Call[] = await p.evaluate(() => (window as any).__watchCalls)
	const parses: { chars: number; ms: number }[] = await p.evaluate(() => (window as any).__watchParses)
	const otherFetches: number = await p.evaluate(() => (window as any).__otherFetches)
	const meta = await runMeta(p)
	const robotsRules = (await rows<{ key: string; value: any }>(p, 'meta')).find((m) => m.key === 'robots')?.value?.rules ?? null
	const { robotsAllows } = await import(pathToFileURL(path.join(ROOT, '../experiences/src/watch/robots.js')).href)

	// ---- What each demo sticker says (the album opened and closed through the Pocket's own API) ----
	const lines: Record<string, string[]> = {}
	await openAlbum(p)
	for (const key of (filled.keys ?? []) as string[]) lines[key] = (await block(p, key))?.lines ?? []
	await closeAlbum(p)

	// ---- The table ----
	const start = calls[0]?.at ?? 0
	const robotsCall = calls.find((c) => c.path === '/robots.txt')
	const pageCalls = calls.filter((c) => c.path !== '/robots.txt')
	const usedParses = new Set<number>()
	const parseMs = (c: Call) => {
		const i = parses.findIndex((x, n) => !usedParses.has(n) && x.chars === c.chars)
		if (i < 0) return null
		usedParses.add(i)
		return parses[i]!.ms
	}
	console.log(`# ${pad('#', 3)}${pad('path', 40)}${pad('start ms', 10)}${pad('status', 8)}${pad('type', 16)}${pad('ETag', 6)}${pad('Last-Mod', 10)}${pad('bytes', 9)}${pad('ms', 7)}${pad('main', 6)}${pad('parse ms', 10)}robots`)
	const perPage: { path: string; etag: boolean | null; lastModified: boolean | null; parseMs: number | null; allowed: boolean | null }[] = []
	calls.forEach((c, i) => {
		const isRobots = c.path === '/robots.txt'
		const pm = isRobots ? null : parseMs(c)
		const allowed = isRobots || !robotsRules ? null : (robotsAllows(robotsRules, c.path) as boolean)
		if (!isRobots) perPage.push({ path: c.path, etag: c.etag, lastModified: c.lastModified, parseMs: pm, allowed })
		console.log(`# ${pad(i + 1, 3)}${pad(c.path, 40)}${pad(c.at - start, 10)}${pad(c.status, 8)}${pad(c.type, 16)}${pad(yes(c.etag), 6)}${pad(yes(c.lastModified), 10)}${pad(c.bytes, 9)}${pad(c.ms, 7)}${pad(isRobots ? '-' : yes(c.main), 6)}${pad(pm, 10)}${isRobots ? '-' : allowed == null ? '?' : allowed ? 'allowed' : 'DISALLOWED'}`)
	})
	const g = gaps(calls.map((c) => c.at))
	const redirects = calls.filter((c) => c.type === 'opaqueredirect' || (c.status != null && c.status >= 300 && c.status < 400 && c.status !== 304))
	const noMain = pageCalls.filter((c) => c.status === 200 && c.main === false)
	const blocked = meta?.blockedUntil && meta.blockedUntil > Date.now() ? new Date(meta.blockedUntil).toISOString() : null
	const summary = {
		requests: calls.length,
		pages: pageCalls.length,
		totalBytes: calls.reduce((s, c) => s + (c.bytes ?? 0), 0),
		minSpacingMs: g.length ? Math.min(...g) : null,
		spacingMs: g,
		robots: robotsCall ? { status: robotsCall.status, type: robotsCall.type, rules: robotsRules ? { allow: robotsRules.allow.length, disallow: robotsRules.disallow.length } : null, allowsEveryPage: perPage.every((x) => x.allowed !== false) } : null,
		validators: Object.fromEntries(perPage.map((x) => [x.path, `ETag ${yes(x.etag)}, Last-Modified ${yes(x.lastModified)}`])),
		parseMs: Object.fromEntries(perPage.map((x) => [x.path, x.parseMs])),
		redirects: redirects.map((c) => `${c.path} ${c.status} ${c.type}`),
		withoutMainContent: noMain.map((c) => c.path),
		errors: calls.filter((c) => c.error).map((c) => `${c.path}: ${c.error}`),
		blockedUntil: blocked,
		runMs,
		vodafoneOwnFetchesNotLogged: otherFetches,
		sinceOct23: lines,
	}
	console.log(`# summary: ${JSON.stringify(summary)}`)
	for (const [key, l] of Object.entries(lines)) console.log(`# sticker ${key}: ${l.join(' | ') || '(no line)'}`)
	for (const d of debug) console.log(`# layer: ${d}`)

	// ---- The site's rules, and only those ----
	assert.ok(calls.filter((c) => c.path === '/robots.txt').length <= 1, 'robots.txt at most once a run')
	assert.ok(pageCalls.length <= MAX_PAGES, `at most ${MAX_PAGES} pages plus robots.txt (${pageCalls.length})`)
	if (pageCalls.length) assert.equal(calls[0]!.path, '/robots.txt', 'robots.txt is asked for before any page')
	assert.ok(g.every((d) => d >= SPACING_MS), `request starts at least ${SPACING_MS} ms apart (${g.join(', ')})`)
	for (const c of calls) {
		assert.equal(c.credentials, 'omit', `${c.path}: signed out (credentials 'omit')`)
		assert.equal(c.redirect, 'manual', `${c.path}: a redirect is never followed (redirect 'manual')`)
		assert.notEqual(c.redirected, true, `${c.path}: the answer did not come through a redirect`)
	}
	for (const x of perPage) assert.notEqual(x.allowed, false, `${x.path}: fetched only because robots.txt allows it`)
	// The browser's own record: no Cookie header on a watch request, and no request made by following one.
	const watchPaths = new Set(calls.map((c) => c.path))
	const mine = seen.filter((s) => watchPaths.has(s.path))
	for (const s of mine) {
		const headers = await s.req.allHeaders().catch(() => s.req.headers())
		assert.ok(!Object.keys(headers).some((h) => h.toLowerCase() === 'cookie'), `${s.path}: no cookie sent`)
	}
	const followed = seen.filter((s) => {
		const from = s.req.redirectedFrom()
		return !!from && watchPaths.has(new URL(from.url()).pathname + new URL(from.url()).search)
	})
	assert.deepEqual(followed.map((s) => s.path), [], 'no redirect of a watch request was followed')
	// A block (403, 429, 503, or a 200 page without #main-content) ends the run there, and the watch waits a day.
	const stopAt = calls.findIndex((c) => (c.status != null && BLOCKING.includes(c.status)) || (c.path !== '/robots.txt' && c.status === 200 && c.main === false))
	if (stopAt >= 0) {
		assert.equal(stopAt, calls.length - 1, `the run stopped at the block (${calls[stopAt]!.path} ${calls[stopAt]!.status}); nothing after it`)
		assert.ok(blocked, 'a block sets meta.run.blockedUntil')
	}

	// ---- One reload within 30 minutes: the throttle holds, no watch request ----
	await sleep(3000)
	const seenBefore = seen.length
	const res2 = await p.reload({ waitUntil: 'load', timeout: 60_000 })
	console.log(`# reload ${HOME}: ${res2?.status() ?? null}`)
	const stop2 = await stopReason(p, res2?.status() ?? null)
	if (!stop2) {
		await watchReady(p)
		await sleep(8000)
		const again: Call[] = await p.evaluate(() => (window as any).__watchCalls)
		const later = seen.slice(seenBefore).filter((s) => watchPaths.has(s.path) || s.path === '/robots.txt')
		console.log(`# after the reload: ${again.length} watch requests (page side), ${later.length} (browser side)`)
		assert.deepEqual(again.map((c) => c.path), [], 'a reload within 30 minutes makes no watch request')
		assert.deepEqual(later.map((s) => s.path), [], 'the browser saw no watch request after the reload')
		const r = await p.evaluate(() => (window as any).__aixcWatch.reset())
		resetDone = r?.ok === true
		console.log(`# reset(): ${JSON.stringify(r)}`)
	} else {
		console.log(`# the reload stopped: ${stop2}. Nothing more is done on the page.`)
	}
})
