/**
 * The offline rehearsal of the portal's cache probe (live plan phase 3, task A2; ADR-0065, OD-4): the flow of
 * ../live/portal-cache.live.test.ts run against a local node:http server on 127.0.0.1:4463 that serves small
 * pages with each variant's cache headers, in Playwright's Chromium and, when it is installed, the installed
 * Google Chrome (headless; offline: no host name but this machine's resolves, no proxy). Nothing reaches
 * Vodafone's site.
 *
 * It shows the probe measures correctly: for every page, the requests the probe saw go to the network equal
 * the requests the server received; each variant's reuse is what a browser cache must give; the conclusion
 * names the reason. The variants:
 *  - max-age=14400, public and Vary: Accept-Encoding: E1 to E4 and E2n reuse the cache (as the S13 request
 *    count found), E5 does not: one Playwright route on the context turns the browser's HTTP cache off,
 *    which is the demo browser's case and S17's;
 *  - the same with a Set-Cookie (an F5-like TS cookie): Chrome still reuses it (the cookie's names and
 *    attribute names are reported, its value never);
 *  - no-store: nothing is reused;
 *  - Pragma: no-cache beside max-age, an Age beyond max-age (stale on arrival), and no-cache with an ETag
 *    (each reuse a conditional request answered 304): nothing is reused, and the conclusion says why.
 * And its guard: a 403 on the opening page, a 429 on a fetch and a challenge page after a navigation each stop
 * the run at once with nothing asked after it; the cap stops the run before one request too many; the live
 * pace (1.2 s between requests) is kept.
 *
 * The pages carry a stand-in of Dynatrace's fetch wrapper (window.fetch replaced by a function 'dtAWF' that
 * adds an x-dtpc header), so the wrapper check and E2n's header comparison are proven too.
 */
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import type { Socket } from 'node:net'
import { after, before, test } from 'node:test'

import { OFFLINE_ARGS } from '../../tools/demo-browser.ts'
import { EXPERIMENTS, type ExperimentId, LIVE_PLAN, launchProbeBrowser, MAX_REQUESTS, MIN_PAUSE_MS, printProbeReport, type ProbeReport, ProbeStop, runCacheProbe } from '../live/portal-cache.live.test.ts'

const PORT = 4463
const ORIGIN = `http://127.0.0.1:${PORT}`
const COOKIE = 'TS01a2b3c4'

interface Hit {
	path: string
	at: number
	mode: string
	dest: string
	cookie: boolean
	dtpc: boolean
	conditional: boolean
	status: number
}

interface Variant {
	id: string
	name: string
	headers: Record<string, string>
	cookie?: boolean
	etag?: boolean
	/** Whether the request that answers each experiment's question came from the cache. */
	reuse: Record<ExperimentId, boolean>
	/** What the conclusion must say. */
	says: RegExp[]
}

const ALL = (value: boolean) => Object.fromEntries(EXPERIMENTS.map((id) => [id, value])) as Record<ExperimentId, boolean>
const CACHEABLE = { 'cache-control': 'max-age=14400, public', vary: 'Accept-Encoding' }

const VARIANTS: Variant[] = [
	{ id: 'v1', name: 'Cache-Control: max-age=14400, public and Vary: Accept-Encoding, no Set-Cookie', headers: CACHEABLE, reuse: { ...ALL(true), E5: false }, says: [/the most likely reason is the test browser, not the site/i, /Network\.setCacheDisabled/, /Both of its requests carried Cache-Control: no-cache and Pragma: no-cache/] },
	{ id: 'v2', name: 'the same with a Set-Cookie (an F5-like TS cookie)', headers: CACHEABLE, cookie: true, reuse: { ...ALL(true), E5: false }, says: [/the most likely reason is the test browser/i, new RegExp(`sets cookies \\(${COOKIE}\\(Path, HttpOnly\\)`)] },
	{ id: 'v3', name: 'Cache-Control: no-store', headers: { 'cache-control': 'no-store', vary: 'Accept-Encoding' }, reuse: ALL(false), says: [/no-store: never stored/] },
	{ id: 'v4', name: 'Cache-Control: max-age=14400, public with Pragma: no-cache', headers: { ...CACHEABLE, pragma: 'no-cache' }, reuse: ALL(false), says: [/Pragma: no-cache \(Chrome treats it as no-cache/] },
	{ id: 'v5', name: 'Cache-Control: max-age=14400, public with Age: 20000 (stale on arrival)', headers: { ...CACHEABLE, age: '20000' }, reuse: ALL(false), says: [/stale on arrival: a lifetime of 14400 s but already 2000\d s old/] },
	{ id: 'v6', name: 'Cache-Control: no-cache with an ETag (a reuse is a conditional request answered 304)', headers: { 'cache-control': 'no-cache', vary: 'Accept-Encoding' }, etag: true, reuse: ALL(false), says: [/conditional request and got 304/, /no-cache: asked again each time, with a conditional request/] },
]

/** Dynatrace's wrapped fetch, stood in: the page's window.fetch becomes a function 'dtAWF' that adds a header. */
const FETCH_WRAPPER_STAND_IN = `(() => { const native = window.fetch; window.fetch = function dtAWF(input, init) { const headers = new Headers(init && init.headers); headers.set('x-dtpc', '1$rehearsal'); return native.call(this, input, Object.assign({}, init, { headers })) } })()`
const pageHtml = (p: string) =>
	`<!doctype html><html lang="${p.startsWith('/ar/') ? 'ar' : 'en'}"><head><meta charset="utf-8"><title>Rehearsal ${p}</title><script>${FETCH_WRAPPER_STAND_IN}</script></head><body><main id="main-content"><h1>${p}</h1><p>A small page of the cache rehearsal, served by a local server with the cache headers of the variant under test.</p></main></body></html>`

let variant: Variant = VARIANTS[0]
let special: ((path: string, nth: number) => { status: number; html: string } | null) | null = null
const hits: Hit[] = []
const cookieValues: string[] = []
const sockets = new Set<Socket>()

const server = http.createServer((req, res) => {
	const url = new URL(req.url ?? '/', ORIGIN)
	if (!/^\/(en|ar)\//.test(url.pathname)) return void res.writeHead(404, { 'content-type': 'text/plain' }).end('not here')
	const nth = hits.filter((h) => h.path === url.pathname).length + 1
	const hit: Hit = { path: url.pathname, at: Date.now(), mode: String(req.headers['sec-fetch-mode'] ?? ''), dest: String(req.headers['sec-fetch-dest'] ?? ''), cookie: !!req.headers.cookie, dtpc: !!req.headers['x-dtpc'], conditional: !!(req.headers['if-none-match'] || req.headers['if-modified-since']), status: 200 }
	hits.push(hit)
	const odd = special?.(url.pathname, nth)
	if (odd) {
		hit.status = odd.status
		return void res.writeHead(odd.status, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }).end(odd.html)
	}
	const headers: Record<string, string> = { 'content-type': 'text/html; charset=utf-8', ...variant.headers }
	if (variant.cookie) {
		const value = randomBytes(12).toString('hex')
		cookieValues.push(value)
		headers['set-cookie'] = `${COOKIE}=${value}; Path=/; HttpOnly`
	}
	if (variant.etag) {
		headers.etag = `"r-${url.pathname.replace(/\W/g, '')}"`
		if (req.headers['if-none-match'] === headers.etag) {
			hit.status = 304
			return void res.writeHead(304, headers).end()
		}
	}
	res.writeHead(200, headers).end(pageHtml(url.pathname))
})
server.on('connection', (s) => {
	sockets.add(s)
	s.on('close', () => sockets.delete(s))
})

before(async () => {
	await new Promise<void>((done, fail) => {
		server.once('error', (e) => fail(new Error(`port ${PORT} is taken (${(e as Error).message}): another run of this rehearsal?`)))
		server.listen(PORT, '127.0.0.1', done)
	})
})
after(async () => {
	for (const s of sockets) s.destroy()
	await new Promise((done) => server.close(done))
})

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms))
const PATHS = [new URL(LIVE_PLAN.start, ORIGIN).pathname, ...EXPERIMENTS.map((id) => LIVE_PLAN.pages[id])]

/** One run of the probe on a fresh browser and profile; what the server received; every request that left for another host. */
async function rehearse(channel: 'chromium' | 'chrome', o: { pauseMs?: number; maxRequests?: number } = {}) {
	hits.length = 0
	cookieValues.length = 0
	const browser = await launchProbeBrowser({ channel, headless: true, args: OFFLINE_ARGS })
	const outside: string[] = []
	browser.page.on('request', (r) => {
		if (!r.url().startsWith(`${ORIGIN}/`) && !/^(data|about|blob|chrome):/.test(r.url())) outside.push(r.url())
	})
	const lines: string[] = []
	let report: ProbeReport | null = null
	let error: unknown = null
	try {
		report = await runCacheProbe(browser.page, { base: ORIGIN, plan: LIVE_PLAN, pauseMs: o.pauseMs ?? 250, settleMs: 400, startSettleMs: 300, maxRequests: o.maxRequests, log: (l) => lines.push(l) })
	} catch (e) {
		error = e
		report = (e as { report?: ProbeReport })?.report ?? null
	} finally {
		const closed = await browser.close()
		report?.cleanup.push(...closed)
	}
	const received = hits.length
	await sleep(500)
	return { report, error, lines, outside, hits: [...hits], lateHits: hits.length - received, profile: browser.profile }
}

const printed = (report: ProbeReport | null, lines: string[], all: boolean) => {
	if (all) for (const l of lines) console.log(`# ${l}`)
	if (report) printProbeReport(report, (l) => (all || !l.startsWith('report: ') ? console.log(`# ${l}`) : undefined))
}

/** Launches Google Chrome once to see whether it is installed (the rehearsal then runs in it too). */
let chromeMissing: string | null | undefined
async function chromeAbsent() {
	if (chromeMissing !== undefined) return chromeMissing
	try {
		const b = await launchProbeBrowser({ channel: 'chrome', headless: true, args: OFFLINE_ARGS })
		await b.close()
		chromeMissing = null
	} catch (e) {
		chromeMissing = `Google Chrome is not installed here (${(e as Error).message.split('\n')[0]})`
	}
	return chromeMissing
}

const RUNS: { channel: 'chromium' | 'chrome'; variant: Variant; pauseMs?: number }[] = [
	// The first at the live pace, so the 1.2 s between requests is rehearsed as the live run keeps it.
	{ channel: 'chromium', variant: VARIANTS[0], pauseMs: MIN_PAUSE_MS },
	...VARIANTS.slice(1).map((v) => ({ channel: 'chromium' as const, variant: v })),
	...VARIANTS.filter((v) => ['v1', 'v2', 'v3'].includes(v.id)).map((v) => ({ channel: 'chrome' as const, variant: v })),
]

for (const run of RUNS) {
	const v = run.variant
	const label = run.channel === 'chrome' ? 'Google Chrome (installed, headless)' : "Playwright's Chromium (headless)"
	test(`${label}, ${v.name}: the probe's counts equal the server's; reuse ${EXPERIMENTS.map((id) => `${id} ${v.reuse[id] ? 'yes' : 'no'}`).join(', ')}`, { timeout: 300_000 }, async (t) => {
		if (run.channel === 'chrome') {
			const missing = await chromeAbsent()
			if (missing) return t.skip(missing)
		}
		variant = v
		special = null
		const r = await rehearse(run.channel, { pauseMs: run.pauseMs })
		let ok = false
		try {
			assert.equal(r.error, null, `the probe ran through: ${(r.error as Error)?.message}`)
			const report = r.report!
			assert.equal(report.outcome, 'passed')
			assert.equal(report.requestsMade, MAX_REQUESTS, `exactly ${MAX_REQUESTS} requests for pages`)
			assert.deepEqual(r.outside, [], 'nothing left for another host')
			assert.equal(r.lateHits, 0, 'nothing reached the server after the run')
			// The probe measures correctly: what it saw go to the network is what the server received, page by page.
			for (const p of PATHS) {
				const probe = report.requests.filter((x) => new URL(x.url).pathname === p && x.network).length
				const got = r.hits.filter((h) => h.path === p).length
				assert.equal(probe, got, `${p}: the probe saw ${probe} request(s) go to the network, the server received ${got}`)
			}
			const revalidated = report.requests.filter((x) => x.wireStatus === 304).length
			assert.equal(revalidated, r.hits.filter((h) => h.status === 304).length, 'the 304s the probe saw are the server’s')
			for (const id of EXPERIMENTS) {
				const verdict = report.verdicts.find((x) => x.id === id)
				assert.equal(verdict?.reused, v.reuse[id], `${id}: ${verdict?.question} ${verdict?.state}`)
			}
			for (const says of v.says) assert.match(report.conclusion, says)
			if (v.etag) assert.equal(report.verdicts.find((x) => x.id === 'E2')?.state, 'revalidated (304)')
			// The wrapper: found, and the header it adds seen on the page's fetch and not on the browser's own.
			assert.equal(report.fetchWrapper?.wrapped, true, 'window.fetch is wrapped by the page')
			assert.equal(report.fetchWrapper?.name, 'dtAWF')
			assert.equal(report.fetchWrapper?.frameFetchNative, true, "a fresh frame's fetch is the browser's own")
			const wrapped = report.requests.find((x) => x.experiment === 'E2' && x.step === 'fetch' && x.byProbe)
			const native = report.requests.find((x) => x.experiment === 'E2n' && x.step === 'native fetch' && x.byProbe)
			assert.ok(wrapped?.request.names.includes('x-dtpc'), `the page's fetch sent x-dtpc (${wrapped?.request.names})`)
			assert.ok(native && !native.request.names.includes('x-dtpc'), `the browser's own fetch did not (${native?.request.names})`)
			assert.equal(r.hits.find((h) => h.path === LIVE_PLAN.pages.E2)?.dtpc, true, 'the server saw x-dtpc on E2’s fetch')
			assert.equal(r.hits.find((h) => h.path === LIVE_PLAN.pages.E2n)?.dtpc, false, 'and not on E2n’s')
			assert.match(report.conclusion, /added these request headers the browser's own fetch did not send: x-dtpc/)
			assert.match(report.nativeFetch ?? '', /about:blank frame/)
			// Cookies: names and attribute names only, never a value; sent back once set.
			const json = JSON.stringify(report) + r.lines.join('\n')
			if (v.cookie) {
				const named = report.requests.flatMap((x) => x.response?.setCookies ?? [])
				assert.ok(
					named.some((c) => c.name === COOKIE && c.attributes.join() === 'Path,HttpOnly'),
					`the cookie's name and attribute names are reported (${JSON.stringify(named)})`,
				)
				assert.ok(cookieValues.length > 0)
				for (const value of cookieValues) assert.ok(!json.includes(value), 'no cookie value in the report or the log')
				assert.ok(
					r.hits.slice(1).every((h) => h.cookie),
					'every request after the first carried the cookie',
				)
				assert.ok(report.requests.some((x) => x.request.cookie === true))
			} else {
				assert.ok(
					r.hits.every((h) => !h.cookie),
					'no cookie was ever sent',
				)
				assert.ok(report.requests.every((x) => x.request.cookie !== true))
			}
			if (run.pauseMs === MIN_PAUSE_MS) {
				assert.equal(report.pauseMs, MIN_PAUSE_MS)
				for (let i = 1; i < report.actions.length; i++) {
					const gap = report.actions[i].startedAt - report.actions[i - 1].endedAt
					assert.ok(gap >= MIN_PAUSE_MS - 2, `request ${i + 1} started ${gap} ms after request ${i} ended`)
				}
			}
			assert.ok(!fs.existsSync(r.profile), 'the throwaway profile is gone')
			ok = true
		} finally {
			printed(r.report, r.lines, !ok)
		}
	})
}

/* ------------------------------------------------------------------ the guard */

const STOPS: { name: string; special: (path: string, nth: number) => { status: number; html: string } | null; made: number; last: string; says: RegExp }[] = [
	{ name: 'a 403 on the opening page', special: (p) => (p === '/en/home' ? { status: 403, html: '<!doctype html><title>Access denied</title><h1>Access denied</h1>' } : null), made: 1, last: '/en/home', says: /answered 403: a bot check or a block/ },
	{ name: "a 429 on E1's first fetch", special: (p) => (p === LIVE_PLAN.pages.E1 ? { status: 429, html: '<!doctype html><title>Too many requests</title>' } : null), made: 2, last: LIVE_PLAN.pages.E1, says: /answered 429 to the fetch/ },
	{ name: "a challenge page after E3's navigation", special: (p) => (p === LIVE_PLAN.pages.E3 ? { status: 200, html: '<!doctype html><title>Just a moment...</title><div id="challenge-running"></div>' } : null), made: 6, last: LIVE_PLAN.pages.E3, says: /is a bot check or a challenge \("Just a moment\.\.\."/ },
]

for (const s of STOPS) {
	test(`the guard: ${s.name} stops the run at once; nothing is asked after it, nothing retried`, { timeout: 300_000 }, async () => {
		variant = VARIANTS[0]
		special = s.special
		const r = await rehearse('chromium')
		special = null
		let ok = false
		try {
			assert.ok(r.error instanceof ProbeStop, `the probe stopped (${(r.error as Error)?.message})`)
			assert.equal(r.report?.outcome, 'stopped')
			assert.match(r.report?.message ?? '', s.says)
			assert.equal(r.report?.requestsMade, s.made, `${s.made} request(s) made`)
			assert.equal(r.hits.at(-1)?.path, s.last, 'the last request the server received is the one that was refused')
			assert.equal(r.lateHits, 0, 'nothing after it')
			assert.deepEqual(r.outside, [])
			assert.ok(!fs.existsSync(r.profile), 'the throwaway profile is gone')
			ok = true
		} finally {
			printed(r.report, r.lines, !ok)
		}
	})
}

test('the guard: the cap stops the run before one request too many (13 allowed: the fourteenth is never made)', { timeout: 300_000 }, async () => {
	variant = VARIANTS[0]
	special = null
	const r = await rehearse('chromium', { maxRequests: 13 })
	let ok = false
	try {
		assert.ok(r.error instanceof ProbeStop)
		assert.match(r.report?.message ?? '', /would make more than 13 requests/)
		assert.equal(r.report?.requestsMade, 13)
		// The fourteenth would have been E5's navigation: E5's page was asked for once, by its fetch.
		assert.deepEqual(
			r.hits.filter((h) => h.path === LIVE_PLAN.pages.E5).map((h) => h.mode),
			['cors'],
		)
		assert.equal(r.lateHits, 0)
		ok = true
	} finally {
		printed(r.report, r.lines, !ok)
	}
})
