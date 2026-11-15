/**
 * Why the real site's destination is not served from the cache (the portal, ADR-0065, OD-4; live plan
 * phase 3, task A2), measured in the installed Google Chrome on web.vodafone.com.eg by the lead or the owner.
 *
 * In the live smoke S17 a sticker press made two requests for the destination (the portal's fetch, then the
 * navigation, none from the cache) although the response said `Cache-Control: max-age=14400, public`. This
 * probe asks why, with no layer at all: one public page opened (/en/home?aixc=off), then six experiments,
 * each on a public page of its own so that none warms another, every request for those pages watched over
 * the Chrome DevTools Protocol (did it go to the network or come from the cache, its status, the response's
 * caching headers, the request's):
 *  E1  fetch(url) as handoff.js's fetchOnce does (same-origin credentials, a navigation's Accept), twice in a
 *      row: is the second from the cache?
 *  E2  that fetch, then a navigation by a fresh <a href> the probe adds and clicks, as the portal's
 *      navigateLike does: is the navigation from the cache?
 *  E3  a navigation, Back, then the fetch: is the fetch from the cache (is a navigation's response stored)?
 *  E4  fetch(url, { cache: 'force-cache' }), then the navigation: does that change anything?
 *  E2n E2 with the browser's own fetch (a fresh about:blank frame's, called on this window) instead of the
 *      page's window.fetch, which Vodafone's Dynatrace agent wraps: does the wrapper change the request?
 *  E5  E2 with one Playwright route on the context, as the demo browser always has (/__vg/** and /vg-sw.js,
 *      tools/demo-browser.ts; S17 ran in it): while any route is on, Playwright turns the browser's HTTP
 *      cache off for the page (Network.setCacheDisabled, playwright-core's crNetworkManager). The control.
 * It prints one block per request, a table of the experiments and a paragraph: which experiment reused the
 * cache and, when one did not, the most likely reason with its evidence.
 *
 *   VG_LIVE=1 node --test --test-timeout=600000 tests/live/portal-cache.live.test.ts
 *
 * Safety (AGENTS.md §4, runbook §0): public pages only, a throwaway profile, never signed in. Nothing of
 * Vodafone's is pressed, typed into, answered or closed: the cookie banner shows on a fresh profile and is
 * left alone (nothing is pressed at all; the navigations are a click on the probe's own link, as the
 * portal's). The probe writes no cookie or storage of Vodafone's (the site's own responses set its cookies
 * in the throwaway profile, as any visit). At most 14 requests for pages, exactly 14 when every step runs:
 * 7 fetches and 7 page loads (the opening page, 5 link navigations, 1 Back), each at least 1.2 s after the
 * previous one ended. A 403, 429 or 503, a challenge page or any error status stops the run at once and
 * nothing is retried. At the end the throwaway profile is deleted.
 *
 * The flow is exported for the offline rehearsal (../e2e/portal-cache-rehearsal.e2e.test.ts), which runs it
 * against a local server to show the probe measures correctly. The live test is registered only when this
 * file is the one run (import.meta.main), so importing it can never reach the site.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import { type BrowserContext, type CDPSession, chromium, type Page } from 'playwright'

/* eslint-disable @typescript-eslint/no-explicit-any */

const LIVE = process.env.VG_LIVE === '1'
const WEB = 'https://web.vodafone.com.eg'

/** The Accept header of handoff.js's fetchOnce (a navigation's, so a cache that varies on Accept could serve the navigation). */
export const HANDOFF_ACCEPT = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
/** handoff.js's own test for a challenge page (recorded, not a stop: `challenge-platform` also matches Cloudflare's passive script). */
const HANDOFF_CHALLENGE = /captcha|challenge-platform|cf-chl-|_incapsula_resource|px-captcha|bm-verify|sec-if-cpt|<title>\s*(access denied|attention required|just a moment)/i
/** At most this many requests for pages (fetches and page loads, Back included) in one run. */
export const MAX_REQUESTS = 14
/** Never less than this between two requests to a host that is not this machine. */
export const MIN_PAUSE_MS = 1200

export type ExperimentId = 'E1' | 'E2' | 'E3' | 'E4' | 'E2n' | 'E5'
export const EXPERIMENTS: ExperimentId[] = ['E1', 'E2', 'E3', 'E4', 'E2n', 'E5']

export interface ProbePlan {
	/** The page opened first (no experiment uses it). */
	start: string
	/** One page per experiment, all different, all public, all of the start page's origin. */
	pages: Record<ExperimentId, string>
}

/** Public pages the layer's live check (aixc-layer.live.test.ts) and S17 opened without trouble. */
export const LIVE_PLAN: ProbePlan = {
	start: '/en/home?aixc=off',
	pages: { E1: '/en/vodafone-cash', E2: '/en/services', E3: '/en/mobile-internet-bundles', E4: '/en/vodafone-red1', E2n: '/ar/services', E5: '/ar/vodafone-cash' },
}

export const QUESTIONS: Record<ExperimentId, string> = {
	E1: 'two fetches as handoff.js: is the second from the cache?',
	E2: 'the fetch, then the navigation by a fresh link: is the navigation from the cache?',
	E3: 'a navigation, Back, then the fetch: is the fetch from the cache?',
	E4: "fetch with cache: 'force-cache', then the navigation: is the navigation from the cache?",
	E2n: "E2 with the browser's own fetch (not the page's window.fetch): is the navigation from the cache?",
	E5: 'E2 with one Playwright route on (as the demo browser has): is the navigation from the cache?',
}
/** The step whose request answers each question. */
const ANSWER_STEP: Record<ExperimentId, string> = { E1: 'fetch 2', E2: 'navigation', E3: 'fetch', E4: 'navigation', E2n: 'navigation', E5: 'navigation' }

type Kind = 'fetch' | 'navigation' | 'back'
type FetchHow = 'page' | 'native' | 'force-cache'

export interface RequestFacts {
	cacheControl: string | null
	pragma: string | null
	accept: string | null
	/** Whether a Cookie header was sent (never its value); null when the request did not go out (the cache served it). */
	cookie: boolean | null
	/** If-None-Match / If-Modified-Since, by name. */
	conditional: string[]
	secFetch: string
	referer: boolean
	/** Every header name the request had (no values). */
	names: string[]
	/** Only the headers the page gave (Chrome adds the rest on the wire; the cache served it or nothing went out). */
	provisional: boolean
}

export interface ResponseFacts {
	cacheControl: string | null
	expires: string | null
	pragma: string | null
	date: string | null
	age: string | null
	lastModified: string | null
	etag: string | null
	vary: string | null
	clearSiteData: string | null
	contentType: string | null
	/** Names of the cookies set and the names of their attributes (Path, Secure, ...): never a value. */
	setCookies: { name: string; attributes: string[] }[]
	/** Every header name of the response (no values). */
	names: string[]
	/** Seconds of freshness: Cache-Control max-age (or Expires minus Date), and the response's age when it arrived (Age, or now minus Date). */
	lifetime: number | null
	ageOnArrival: number | null
	freshFor: number | null
	/** The headers as the cache holds them (it strips Set-Cookie), not as they came over the wire. */
	fromCache: boolean
}

export interface SeenRequest {
	experiment: ExperimentId | 'start'
	step: string
	/** The probe's own fetch or navigation (else a request the page's scripts made for the same address). */
	byProbe: boolean
	url: string
	type: string
	mainFrame: boolean
	initiator: string
	by: string
	/** 'network', 'revalidated (304)', 'disk cache', 'memory cache', 'service worker', 'prefetch cache', 'failed' or 'no response'. */
	state: string
	network: boolean
	status: number | null
	wireStatus: number | null
	redirects: string[]
	encodedDataLength: number | null
	failed: string | null
	request: RequestFacts
	response: ResponseFacts | null
}

export interface ProbeAction {
	n: number
	experiment: ExperimentId | 'start'
	step: string
	kind: Kind | 'open'
	url: string
	startedAt: number
	endedAt: number
	status: number | null
	/** What the page itself says (Resource or Navigation Timing: transfer size, delivery type). */
	pageSays: string | null
}

export interface WrapperCheck {
	wrapped: boolean
	name: string
	head: string
	frameFetchNative: boolean
}

export interface Verdict {
	id: ExperimentId
	question: string
	url: string
	/** The state of the request that answers the question. */
	state: string
	reused: boolean | null
	/** The probe's requests for this experiment's page that went to the network. */
	network: number
	/** Requests the page's own scripts made for that address (not the probe's). */
	byPage: number
}

export interface ProbeReport {
	base: string
	browser: string
	outcome: 'passed' | 'stopped' | 'failed'
	message: string | null
	maxRequests: number
	pauseMs: number
	requestsMade: number
	actions: ProbeAction[]
	fetchWrapper: WrapperCheck | null
	/** The native fetch of E2n: how it was called. */
	nativeFetch: string | null
	serviceWorker: boolean | null
	requests: SeenRequest[]
	navigations: { type: string; url: string; during: string }[]
	bfcacheNotUsed: { during: string; reasons: string[] }[]
	verdicts: Verdict[]
	conclusion: string
	cleanup: string[]
}

export interface ProbeOptions {
	/** The origin, for example https://web.vodafone.com.eg */
	base: string
	plan?: ProbePlan
	/** Between the end of one request and the start of the next; never below 1200 ms for a host that is not this machine. */
	pauseMs?: number
	/** After each navigation, for the late events and the page's own requests. Default 1500 ms. */
	settleMs?: number
	/** After the opening page, so its scripts (Dynatrace's fetch wrapper) are in place. Default 2500 ms. */
	startSettleMs?: number
	/** Lower than 14 only (the rehearsal proves the cap stops the run). */
	maxRequests?: number
	log?(line: string): void
}

/** The run stopped on purpose (a bot check, an error page, the cap); the report says why. */
export class ProbeStop extends Error {
	readonly report: ProbeReport
	constructor(message: string, report: ProbeReport) {
		super(message)
		this.name = 'ProbeStop'
		this.report = report
	}
}

/** The probe could not do a step (no navigation, a fetch that threw); nothing is retried. */
export class ProbeFailure extends Error {
	readonly report: ProbeReport
	constructor(message: string, report: ProbeReport) {
		super(message)
		this.name = 'ProbeFailure'
		this.report = report
	}
}

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms))

/** The guard of pocket-smoke.ts (S17), copied: what a challenge page has, and the words of a block or an error page. */
const CHALLENGE_MARKERS = '#challenge-form, #challenge-running, #cf-challenge-running, #challenge-stage, iframe[src*="challenges.cloudflare.com"], script[src*="/cdn-cgi/challenge-platform/h/"], #px-captcha, iframe[src*="captcha"], .g-recaptcha, .h-captcha'
const BOT_WORDS = /access denied|attention required|just a moment|captcha|verify (that )?you are (a )?human|checking your browser|pardon our interruption|request unsuccessful|are you a robot/i
const ERROR_WORDS = /page not found|\b404\b|\b50[0-4]\b|server error|service unavailable/i
/** The same markers in a fetched page's HTML (no DOM is built for it). */
const CHALLENGE_HTML = /id\s*=\s*["']?(challenge-form|challenge-running|cf-challenge-running|challenge-stage|px-captcha)\b|challenges\.cloudflare\.com|\/cdn-cgi\/challenge-platform\/h\/|cf[-_]chl[-_]|_incapsula_resource|bm-verify|sec-if-cpt|class\s*=\s*["'][^"']*\b(g-recaptcha|h-captcha)\b|<iframe\b[^>]*\ssrc\s*=\s*["'][^"']*captcha/i

const isLoopback = (base: string) => ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(base).hostname)
const pathOf = (url: string) => {
	try {
		const u = new URL(url)
		return u.pathname + u.search
	} catch {
		return url
	}
}

/** Header names lower-cased; several values of one header joined by a new line, as the protocol gives them. */
const lower = (h: Record<string, string> | undefined) => Object.fromEntries(Object.entries(h ?? {}).map(([k, v]) => [k.toLowerCase(), String(v)]))

/** The cookies a response sets: names and attribute names only. */
export const cookieNames = (setCookie: string | undefined | null) =>
	String(setCookie ?? '')
		.split('\n')
		.map((line) => line.trim())
		.filter(Boolean)
		.map((line) => {
			const [first, ...rest] = line.split(';')
			return { name: first.split('=')[0].trim(), attributes: rest.map((a) => a.split('=')[0].trim()).filter(Boolean) }
		})

/** Freshness as a browser cache computes it (RFC 9111 §4.2): lifetime from max-age (else Expires minus Date), age on arrival from Age or now minus Date. */
export function freshness(r: { cacheControl: string | null; expires: string | null; date: string | null; age: string | null }, receivedAt: number) {
	const cc = (r.cacheControl ?? '').toLowerCase()
	const maxAge = /(?:^|[,\s])max-age\s*=\s*"?(\d+)/.exec(cc)
	const date = r.date ? Date.parse(r.date) : Number.NaN
	let lifetime: number | null = null
	if (maxAge) lifetime = Number(maxAge[1])
	else if (r.expires !== null) {
		const expires = Date.parse(r.expires)
		lifetime = Number.isNaN(expires) ? 0 : Math.round((expires - (Number.isNaN(date) ? receivedAt : date)) / 1000)
	}
	const apparent = Number.isNaN(date) ? 0 : Math.max(0, (receivedAt - date) / 1000)
	const ageOnArrival = Math.round(Math.max(apparent, Number(r.age) || 0))
	return { lifetime, ageOnArrival, freshFor: lifetime === null ? null : lifetime - ageOnArrival }
}

/** What in a response keeps a browser from serving it again without asking (an empty list: nothing in the headers). */
export function cacheBlockers(res: ResponseFacts): string[] {
	const out: string[] = []
	const cc = (res.cacheControl ?? '').toLowerCase()
	if (/\bno-store\b/.test(cc)) out.push(`Cache-Control: ${res.cacheControl} (no-store: never stored)`)
	if (/\bno-cache\b/.test(cc)) out.push(`Cache-Control: ${res.cacheControl} (no-cache: asked again each time${res.etag || res.lastModified ? ', with a conditional request' : ''})`)
	if (/\bno-cache\b/i.test(res.pragma ?? '')) out.push(`Pragma: ${res.pragma} (Chrome treats it as no-cache: it asks again)`)
	if (res.vary && res.vary.split(',').some((v) => v.trim() === '*')) out.push('Vary: * (never reused)')
	if (res.lifetime === null && !/\bno-(store|cache)\b/.test(cc)) out.push(`no freshness given (no max-age, no Expires${res.lastModified ? '; only a heuristic from Last-Modified' : ''})`)
	else if (res.freshFor !== null && res.freshFor <= 0 && !/\bno-(store|cache)\b/.test(cc)) out.push(`stale on arrival: a lifetime of ${res.lifetime} s but already ${res.ageOnArrival} s old when it arrived (Age ${res.age ?? '-'}, Date ${res.date ?? '-'})`)
	if (res.clearSiteData) out.push(`Clear-Site-Data: ${res.clearSiteData}`)
	return out
}

/** Vary fields a navigation may send differently from the portal's fetch (Accept-Encoding is the same for both). */
const varyFields = (res: ResponseFacts | null) =>
	(res?.vary ?? '')
		.split(',')
		.map((v) => v.trim().toLowerCase())
		.filter((v) => v && v !== 'accept-encoding' && v !== '*')

/** Where a script-started request came from: the first frames of its stack (function and file, no query). */
const stackTop = (initiator: { stack?: { callFrames: { functionName: string; url: string; lineNumber: number }[] } } | undefined) =>
	(initiator?.stack?.callFrames ?? [])
		.slice(0, 3)
		.map((f) => `${f.functionName || '(anonymous)'}@${f.url.split('?')[0].split('/').pop()}:${f.lineNumber + 1}`)
		.join(' < ')

/**
 * Watches the page's requests over its own DevTools Protocol session: those for the probe's addresses and
 * every main-frame document, each labelled with the step that was running when it started.
 */
async function watchNetwork(page: Page, targets: Set<string>) {
	const cdp: CDPSession = await page.context().newCDPSession(page)
	interface Base {
		experiment: ExperimentId | 'start'
		step: string
		byProbe: boolean
		url: string
		type: string
		mainFrame: boolean
		initiator: string
		by: string
		headers: Record<string, string>
		redirects: string[]
	}
	const base = new Map<string, Base>()
	const order: string[] = []
	const extraReq = new Map<string, Record<string, string>>()
	const extraRes = new Map<string, { status: number; headers: Record<string, string> }>()
	const responses = new Map<string, { status: number; headers: Record<string, string>; fromDiskCache: boolean; fromServiceWorker: boolean; fromPrefetchCache: boolean; hasExtraInfo: boolean; at: number }>()
	const servedFromCache = new Set<string>()
	const finished = new Map<string, number>()
	const failed = new Map<string, string>()
	const navigations: { type: string; url: string; during: string }[] = []
	const bfcacheNotUsed: { during: string; reasons: string[] }[] = []
	let label = { experiment: 'start' as ExperimentId | 'start', step: 'open', kind: 'navigation' as Kind, claimed: false }
	const during = () => `${label.experiment} ${label.step}`
	let mainFrameId = (await cdp.send('Page.getFrameTree').catch(() => null))?.frameTree.frame.id ?? ''

	cdp.on('Page.frameNavigated', (e) => {
		if (e.frame.parentId) return
		mainFrameId = e.frame.id
		navigations.push({ type: e.type ?? 'Navigation', url: e.frame.url, during: during() })
	})
	cdp.on('Page.backForwardCacheNotUsed', (e) => {
		bfcacheNotUsed.push({ during: during(), reasons: [...new Set((e.notRestoredExplanations ?? []).map((x) => x.reason))].slice(0, 8) })
	})
	cdp.on('Network.requestWillBeSent', (e) => {
		const url = e.request.url.split('#')[0]
		const known = base.get(e.requestId)
		if (known) {
			if (e.redirectResponse) known.redirects.push(`${e.redirectResponse.status} to ${pathOf(url)}`)
			known.url = url
			return
		}
		const main = e.type === 'Document' && (!e.frameId || e.frameId === mainFrameId)
		if (!targets.has(url) && !main) return
		let byProbe = false
		if (!label.claimed && ((label.kind === 'fetch' && (e.type === 'Fetch' || e.type === 'XHR') && targets.has(url)) || (label.kind !== 'fetch' && main))) {
			byProbe = true
			label.claimed = true
		}
		base.set(e.requestId, { experiment: label.experiment, step: label.step, byProbe, url, type: e.type ?? 'Other', mainFrame: main, initiator: e.initiator?.type ?? 'other', by: stackTop(e.initiator as any), headers: e.request.headers, redirects: [] })
		order.push(e.requestId)
	})
	cdp.on('Network.requestWillBeSentExtraInfo', (e) => extraReq.set(e.requestId, e.headers))
	cdp.on('Network.responseReceivedExtraInfo', (e) => extraRes.set(e.requestId, { status: e.statusCode, headers: e.headers }))
	cdp.on('Network.responseReceived', (e) => {
		if (!base.has(e.requestId)) return
		responses.set(e.requestId, { status: e.response.status, headers: e.response.headers, fromDiskCache: !!e.response.fromDiskCache, fromServiceWorker: !!e.response.fromServiceWorker, fromPrefetchCache: !!e.response.fromPrefetchCache, hasExtraInfo: !!e.hasExtraInfo, at: Date.now() })
	})
	cdp.on('Network.requestServedFromCache', (e) => servedFromCache.add(e.requestId))
	cdp.on('Network.loadingFinished', (e) => {
		if (base.has(e.requestId)) finished.set(e.requestId, e.encodedDataLength)
	})
	cdp.on('Network.loadingFailed', (e) => {
		if (base.has(e.requestId)) failed.set(e.requestId, `${e.errorText}${e.canceled ? ' (canceled)' : ''}${e.blockedReason ? ` (blocked: ${e.blockedReason})` : ''}`)
	})
	await cdp.send('Page.enable')
	await cdp.send('Network.enable')
	const version = await cdp
		.send('Browser.getVersion')
		.then((v) => v.product)
		.catch(() => '')

	const assemble = (id: string): SeenRequest => {
		const b = base.get(id)!
		const rawReq = extraReq.get(id) ?? null
		const rawRes = extraRes.get(id) ?? null
		const res = responses.get(id) ?? null
		const memory = servedFromCache.has(id) && !res?.fromDiskCache
		const network = !!(rawReq || rawRes || res?.hasExtraInfo) || (!!res && !res.fromDiskCache && !memory && !res.fromServiceWorker && !res.fromPrefetchCache)
		const fail = failed.get(id) ?? null
		const wireStatus = rawRes?.status ?? null
		const state = res
			? network
				? wireStatus === 304
					? 'revalidated (304)'
					: 'network'
				: res.fromDiskCache
					? 'disk cache'
					: memory
						? 'memory cache'
						: res.fromServiceWorker
							? 'service worker'
							: res.fromPrefetchCache
								? 'prefetch cache'
								: 'network'
			: fail
				? 'failed'
				: 'no response'
		const rq = lower(rawReq ?? b.headers)
		const rs = lower(rawRes?.headers ?? res?.headers)
		const facts = res
			? {
					cacheControl: rs['cache-control'] ?? null,
					expires: rs.expires ?? null,
					pragma: rs.pragma ?? null,
					date: rs.date ?? null,
					age: rs.age ?? null,
					lastModified: rs['last-modified'] ?? null,
					etag: rs.etag ?? null,
					vary: rs.vary ?? null,
					clearSiteData: rs['clear-site-data'] ?? null,
					contentType: rs['content-type'] ?? null,
					setCookies: cookieNames(rs['set-cookie']),
					names: Object.keys(rs).sort(),
					fromCache: !rawRes,
				}
			: null
		return {
			experiment: b.experiment,
			step: b.step,
			byProbe: b.byProbe,
			url: b.url,
			type: b.type,
			mainFrame: b.mainFrame,
			initiator: b.initiator,
			by: b.by,
			state,
			network: res || rawReq ? network : false,
			status: res?.status ?? null,
			wireStatus,
			redirects: b.redirects,
			encodedDataLength: finished.get(id) ?? null,
			failed: fail,
			request: {
				cacheControl: rq['cache-control'] ?? null,
				pragma: rq.pragma ?? null,
				accept: rq.accept ?? null,
				cookie: rawReq ? 'cookie' in rq : null,
				conditional: ['if-none-match', 'if-modified-since'].filter((n) => n in rq),
				secFetch: `${rq['sec-fetch-mode'] ?? '-'}/${rq['sec-fetch-dest'] ?? '-'}`,
				referer: 'referer' in rq,
				names: Object.keys(rq)
					.filter((n) => !n.startsWith(':'))
					.sort(),
				provisional: !rawReq,
			},
			response: facts ? { ...facts, ...freshness(facts, res!.at) } : null,
		}
	}

	return {
		version,
		label(experiment: ExperimentId | 'start', step: string, kind: Kind) {
			label = { experiment, step, kind, claimed: false }
		},
		/** The status of the probe's request in a step (the protocol's view), or null. */
		statusOf(experiment: ExperimentId | 'start', step: string) {
			for (const id of order) {
				const b = base.get(id)!
				if (b.byProbe && b.experiment === experiment && b.step === step) return responses.get(id)?.status ?? null
			}
			return null
		},
		requests: () => order.map(assemble),
		navigations,
		bfcacheNotUsed,
		detach: () => cdp.detach().catch(() => {}),
	}
}

/**
 * In the page: one fetch as handoff.js's fetchOnce makes it (same-origin credentials, its Accept, an abort
 * signal), read whole; `native` uses a fresh about:blank frame's fetch called on this window (the page's
 * window.fetch may be wrapped), `force-cache` adds cache: 'force-cache'. Returns what the guard needs (status,
 * title, markers), never the body.
 */
const fetchInPage = async ({ url, how, accept, challenge, handoffChallenge }: { url: string; how: FetchHow; accept: string; challenge: string; handoffChallenge: string }) => {
	const init: RequestInit = { credentials: 'same-origin', headers: { Accept: accept } }
	const abort = typeof AbortController === 'function' ? new AbortController() : null
	if (abort) init.signal = abort.signal
	if (how === 'force-cache') init.cache = 'force-cache'
	// A server that never answers ends the step (and the run: nothing is retried) instead of hanging it.
	const late = setTimeout(() => abort?.abort(), 30_000)
	let frame: HTMLIFrameElement | null = null
	let used = 'the page’s window.fetch'
	try {
		let response: Response
		if (how === 'native') {
			frame = document.createElement('iframe')
			for (const [k, v] of Object.entries({ 'data-aixc': '', 'data-vg': '', 'aria-hidden': 'true', tabindex: '-1', title: '' })) frame.setAttribute(k, v)
			frame.style.cssText = 'display:none'
			;(document.body ?? document.documentElement).append(frame)
			const own = frame.contentWindow as (Window & typeof globalThis) | null
			if (!own) throw new Error('the frame has no window')
			const native = own.fetch
			try {
				response = await native.call(window, url, init)
				used = 'a fresh about:blank frame’s fetch, called on this window'
			} catch (e) {
				if ((e as Error)?.name !== 'TypeError' || !/illegal invocation/i.test(String((e as Error)?.message))) throw e
				response = await native.call(own, url, init)
				used = 'a fresh about:blank frame’s own fetch (calling it on this window was refused)'
			}
		} else response = await window.fetch(url, init)
		const html = await response.text()
		const entries = performance.getEntriesByName(response.url || url, 'resource') as PerformanceResourceTiming[]
		const t = entries[entries.length - 1] as (PerformanceResourceTiming & { deliveryType?: string }) | undefined
		const text = html
			.replace(/<(script|style|template|noscript|svg)\b[\s\S]*?<\/\1\s*>/gi, ' ')
			.replace(/<[^>]*>/g, ' ')
			.replace(/\s+/g, ' ')
			.slice(0, 4000)
		return {
			status: response.status,
			url: response.url,
			redirected: response.redirected,
			type: response.headers.get('content-type'),
			bytes: html.length,
			title: (/<title[^>]*>([^<]*)</i.exec(html)?.[1] ?? '').trim().slice(0, 120),
			mainContent: /\bid\s*=\s*["']?main-content\b/i.test(html),
			marker: new RegExp(challenge, 'i').exec(html)?.[0]?.slice(0, 60) ?? null,
			handoffChallenge: new RegExp(handoffChallenge, 'i').test(html),
			text,
			used,
			timing: t ? `transfer ${t.transferSize} B, body ${t.encodedBodySize} B${t.deliveryType !== undefined ? `, delivery '${t.deliveryType}'` : ''}` : null,
		}
	} finally {
		clearTimeout(late)
		frame?.remove()
	}
}

/** In the page: a fresh link with only the href, clicked, as the portal's navigateLike does (its click does not bubble to the page). */
const clickFreshLink = (url: string) => {
	const a = document.createElement('a')
	for (const [k, v] of Object.entries({ href: url, class: 'vf-portal__go', 'aria-hidden': 'true', tabindex: '-1', 'data-aixc': '', 'data-vg': '' })) a.setAttribute(k, v)
	a.addEventListener('click', (event) => event.stopPropagation())
	;(document.body ?? document.documentElement).append(a)
	a.click()
	a.remove()
}

/** In the page: is window.fetch the browser's own? Read with a fresh frame's Function.prototype.toString (the page's may be patched too). */
const checkWrapper = () => {
	const frame = document.createElement('iframe')
	for (const [k, v] of Object.entries({ 'data-aixc': '', 'data-vg': '', 'aria-hidden': 'true', tabindex: '-1', title: '' })) frame.setAttribute(k, v)
	frame.style.cssText = 'display:none'
	;(document.body ?? document.documentElement).append(frame)
	try {
		const w = frame.contentWindow as any
		const source = (fn: unknown) => {
			try {
				return String(w.Function.prototype.toString.call(fn))
			} catch {
				return ''
			}
		}
		const native = (s: string) => /^function\s+\w*\s*\(\)\s*\{\s*\[native code\]\s*\}$/.test(s.trim())
		const own = source(window.fetch)
		return { wrapped: !native(own), name: String((window.fetch as any)?.name ?? ''), head: own.slice(0, 60).replace(/\s+/g, ' '), frameFetchNative: native(source(w.fetch)) }
	} finally {
		frame.remove()
	}
}

/** The page as the browser holds it (Navigation Timing). */
const navigationTiming = () => {
	const n = performance.getEntriesByType('navigation')[0] as (PerformanceNavigationTiming & { deliveryType?: string }) | undefined
	return n ? `${n.type}, transfer ${n.transferSize} B, body ${n.encodedBodySize} B${n.deliveryType !== undefined ? `, delivery '${n.deliveryType}'` : ''}` : null
}

export async function runCacheProbe(page: Page, options: ProbeOptions): Promise<ProbeReport> {
	const base = options.base.replace(/\/$/, '')
	const origin = new URL(base).origin
	const plan = options.plan ?? LIVE_PLAN
	const loopback = isLoopback(base)
	const pauseMs = loopback ? Math.max(0, options.pauseMs ?? MIN_PAUSE_MS) : Math.max(MIN_PAUSE_MS, options.pauseMs ?? MIN_PAUSE_MS)
	const settleMs = options.settleMs ?? 1500
	const startSettleMs = options.startSettleMs ?? 2500
	const maxRequests = Math.min(MAX_REQUESTS, options.maxRequests ?? MAX_REQUESTS)
	const log = options.log ?? ((line: string) => console.log(`# ${line}`))
	const abs = (p: string) => new URL(p, `${origin}/`).href.split('#')[0]
	const start = abs(plan.start)
	const urls = Object.fromEntries(EXPERIMENTS.map((id) => [id, abs(plan.pages[id])])) as Record<ExperimentId, string>
	// The plan's own safety: one origin, every page different, none the start page.
	const all = [start, ...Object.values(urls)]
	if (all.some((u) => new URL(u).origin !== origin)) throw new Error('every page of the plan must be on the base origin')
	if (new Set(all).size !== all.length) throw new Error('every experiment needs a page of its own, none the start page')

	const report: ProbeReport = { base, browser: '', outcome: 'failed', message: null, maxRequests, pauseMs, requestsMade: 0, actions: [], fetchWrapper: null, nativeFetch: null, serviceWorker: null, requests: [], navigations: [], bfcacheNotUsed: [], verdicts: [], conclusion: '', cleanup: [] }
	const stop = (message: string): never => {
		report.outcome = 'stopped'
		report.message = message
		log(`STOPPED: ${message}`)
		throw new ProbeStop(message, report)
	}
	const fail = (message: string): never => {
		throw new ProbeFailure(message, report)
	}

	let lastEnd = 0
	const room = () => {
		if (report.actions.length >= maxRequests) stop(`this run would make more than ${maxRequests} requests for pages`)
	}
	const pace = async () => {
		const wait = lastEnd + pauseMs - Date.now()
		if (wait > 0) await sleep(wait)
	}
	const begin = (experiment: ExperimentId | 'start', step: string, kind: Kind | 'open', url: string) => {
		const action: ProbeAction = { n: report.actions.length + 1, experiment, step, kind, url, startedAt: Date.now(), endedAt: 0, status: null, pageSays: null }
		report.actions.push(action)
		report.requestsMade = report.actions.length
		watcher.label(experiment, step, kind === 'open' ? 'navigation' : kind)
		log(`request ${action.n} of at most ${maxRequests}: ${experiment} ${step} (${kind}) ${pathOf(url)}`)
		return action
	}
	const end = (action: ProbeAction) => {
		action.endedAt = Date.now()
		lastEnd = action.endedAt
	}

	/** On a loaded page: a bot check, a challenge or an error page stops everything (runbook §0: never retried). */
	const stopIfBlocked = async (status: number | null) => {
		if (status !== null && [403, 429, 503].includes(status)) stop(`${page.url()} answered ${status}: a bot check or a block. Nothing is asked after it and nothing is retried (runbook §0).`)
		if (new URL(page.url()).origin !== origin) stop(`the page left ${origin} (${page.url()}). The run stops.`)
		const seen = await page
			.evaluate(
				([markers]) => ({
					title: document.title,
					text: document.getElementById('main-content') ? '' : (document.body?.innerText ?? '').slice(0, 2000),
					marker: [...document.querySelectorAll(markers)].map((n) => n.localName + (n.id ? `#${n.id}` : '')).slice(0, 3),
					vodafone: !!document.getElementById('main-content'),
				}),
				[CHALLENGE_MARKERS] as const,
			)
			.catch(() => ({ title: '', text: '', marker: [] as string[], vodafone: false }))
		if (BOT_WORDS.test(seen.title) || BOT_WORDS.test(seen.text) || seen.marker.length) stop(`${page.url()} is a bot check or a challenge ("${seen.title}"${seen.marker.length ? `, ${seen.marker.join(', ')}` : ''}). The probe never tries to get past one: it stops here. Nothing is retried (runbook §0).`)
		if (status !== null && status >= 400) stop(`${page.url()} answered ${status} "${seen.title}": an error page. The run stops (runbook §0).`)
		if (!seen.vodafone && ERROR_WORDS.test(seen.title)) stop(`${page.url()} looks like an error page ("${seen.title}"). The run stops.`)
	}

	const targets = new Set(all)
	const watcher = await watchNetwork(page, targets)
	report.browser = watcher.version || (await page.evaluate(() => navigator.userAgent).catch(() => 'unknown'))

	const open = async () => {
		room()
		await pace()
		const action = begin('start', 'open', 'open', start)
		const res = await page.goto(start, { waitUntil: 'domcontentloaded', timeout: 45_000 })
		action.status = res?.status() ?? null
		await stopIfBlocked(action.status)
		await page.waitForLoadState('load', { timeout: 45_000 }).catch(() => {})
		await sleep(startSettleMs)
		end(action)
		log(`  opened, ${action.status ?? 'no response'}`)
	}

	const doFetch = async (experiment: ExperimentId, step: string, url: string, how: FetchHow) => {
		room()
		await pace()
		const action = begin(experiment, step, 'fetch', url)
		const r = await page.evaluate(fetchInPage, { url, how, accept: HANDOFF_ACCEPT, challenge: CHALLENGE_HTML.source, handoffChallenge: HANDOFF_CHALLENGE.source }).catch((e) => fail(`${experiment} ${step}: the fetch failed (${(e as Error).message.split('\n')[0]}); nothing is retried`))
		await sleep(300) // the protocol's last events for it (loadingFinished)
		end(action)
		action.status = r.status
		action.pageSays = r.timing
		if (how === 'native') report.nativeFetch = r.used
		log(`  ${r.status} ${r.type ?? '-'} ${r.bytes} characters, "${r.title}"${r.redirected ? `, redirected to ${pathOf(r.url)}` : ''}; the page says: ${r.timing ?? 'no timing entry'}; handoff.js would call it a challenge: ${r.handoffChallenge ? 'yes' : 'no'}`)
		if ([403, 429, 503].includes(r.status)) stop(`${pathOf(url)} answered ${r.status} to the fetch: a bot check or a block. Nothing is asked after it and nothing is retried (runbook §0).`)
		if (r.url && new URL(r.url).origin !== origin) stop(`the fetch of ${pathOf(url)} ended on another origin (${r.url}). The run stops.`)
		if (r.marker || BOT_WORDS.test(r.title) || (!r.mainContent && BOT_WORDS.test(r.text))) stop(`the fetch of ${pathOf(url)} is a bot check or a challenge ("${r.title}"${r.marker ? `, ${r.marker}` : ''}). The run stops here; nothing is retried (runbook §0).`)
		if (r.status >= 400) stop(`${pathOf(url)} answered ${r.status} "${r.title}" to the fetch: an error page. The run stops (runbook §0).`)
		if (!r.mainContent && ERROR_WORDS.test(r.title)) stop(`the fetch of ${pathOf(url)} looks like an error page ("${r.title}"). The run stops.`)
	}

	const navigate = async (experiment: ExperimentId, step: string, url: string) => {
		room()
		await pace()
		const before = page.url().split('#')[0]
		const action = begin(experiment, step, 'navigation', url)
		const nav = page.waitForEvent('framenavigated', { predicate: (f) => f === page.mainFrame() && f.url().split('#')[0] !== before, timeout: 30_000 })
		nav.catch(() => {})
		await page.evaluate(clickFreshLink, url).catch((e) => {
			if (!/context was destroyed|navigat/i.test(String((e as Error).message))) throw e
		})
		await nav.catch(() => fail(`${experiment} ${step}: the click on the fresh link did not navigate to ${pathOf(url)}`))
		await page.waitForLoadState('domcontentloaded', { timeout: 45_000 }).catch(() => {})
		action.status = watcher.statusOf(experiment, step)
		await stopIfBlocked(action.status)
		await page.waitForLoadState('load', { timeout: 45_000 }).catch(() => {})
		await sleep(settleMs)
		action.pageSays = await page.evaluate(navigationTiming).catch(() => null)
		end(action)
		log(`  at ${pathOf(page.url())}, ${action.status ?? 'no response seen'}; the page says: ${action.pageSays ?? 'no timing entry'}`)
	}

	const back = async (experiment: ExperimentId, step: string) => {
		room()
		await pace()
		const before = page.url()
		const action = begin(experiment, step, 'back', before)
		const res = await page.goBack({ waitUntil: 'domcontentloaded', timeout: 45_000 }).catch((e) => fail(`${experiment} ${step}: Back failed (${(e as Error).message.split('\n')[0]})`))
		if (page.url() === before) fail(`${experiment} ${step}: Back did not leave ${pathOf(before)}`)
		action.url = page.url()
		action.status = res?.status() ?? watcher.statusOf(experiment, step)
		await stopIfBlocked(action.status)
		await page.waitForLoadState('load', { timeout: 45_000 }).catch(() => {})
		await sleep(settleMs)
		action.pageSays = await page.evaluate(navigationTiming).catch(() => null)
		end(action)
		log(`  Back at ${pathOf(page.url())}, ${action.status ?? 'no response seen'}; the page says: ${action.pageSays ?? 'no timing entry'}`)
	}

	try {
		await open()
		report.fetchWrapper = await page.evaluate(checkWrapper).catch(() => null)
		report.serviceWorker = await page.evaluate(() => !!navigator.serviceWorker?.controller).catch(() => null)
		log(`window.fetch: ${report.fetchWrapper ? (report.fetchWrapper.wrapped ? `wrapped by the page ('${report.fetchWrapper.name}': ${report.fetchWrapper.head}…)` : "the browser's own") : 'not read'}; a service worker controls the page: ${report.serviceWorker ?? 'not read'}`)

		log(`E1 ${QUESTIONS.E1}`)
		await doFetch('E1', 'fetch 1', urls.E1, 'page')
		await doFetch('E1', 'fetch 2', urls.E1, 'page')

		log(`E2 ${QUESTIONS.E2}`)
		await doFetch('E2', 'fetch', urls.E2, 'page')
		await navigate('E2', 'navigation', urls.E2)

		log(`E3 ${QUESTIONS.E3}`)
		await navigate('E3', 'navigation', urls.E3)
		await back('E3', 'back')
		await doFetch('E3', 'fetch', urls.E3, 'page')

		log(`E4 ${QUESTIONS.E4}`)
		await doFetch('E4', "fetch (cache: 'force-cache')", urls.E4, 'force-cache')
		await navigate('E4', 'navigation', urls.E4)

		log(`E2n ${QUESTIONS.E2n}`)
		await doFetch('E2n', 'native fetch', urls.E2n, 'native')
		await navigate('E2n', 'navigation', urls.E2n)

		log(`E5 ${QUESTIONS.E5}`)
		// The demo browser's own route pattern; nothing here asks for /__vg/, and a match would be refused, never sent on.
		await page.context().route(`${origin}/__vg/**`, (route) => route.abort('blockedbyclient'))
		try {
			await doFetch('E5', 'fetch', urls.E5, 'page')
			await navigate('E5', 'navigation', urls.E5)
		} finally {
			await page.context().unrouteAll({ behavior: 'ignoreErrors' })
		}

		report.outcome = 'passed'
		return report
	} catch (e) {
		if (e instanceof ProbeStop) throw e
		report.outcome = 'failed'
		report.message = (e as Error).message
		log(`FAILED: ${report.message}`)
		if (e instanceof ProbeFailure) throw e
		throw new ProbeFailure((e as Error).message, report)
	} finally {
		await sleep(300)
		report.requests = watcher.requests()
		report.navigations = watcher.navigations
		report.bfcacheNotUsed = watcher.bfcacheNotUsed
		await watcher.detach()
		report.verdicts = verdicts(report, urls)
		report.conclusion = conclude(report)
	}
}

function verdicts(report: ProbeReport, urls: Record<ExperimentId, string>): Verdict[] {
	return EXPERIMENTS.filter((id) => report.actions.some((a) => a.experiment === id && a.step === ANSWER_STEP[id] && a.endedAt)).map((id) => {
		const mine = report.requests.filter((r) => r.experiment === id && r.url === urls[id])
		const answer = mine.find((r) => r.byProbe && r.step === ANSWER_STEP[id])
		const cached = ['disk cache', 'memory cache', 'prefetch cache'].includes(answer?.state ?? '')
		return {
			id,
			question: QUESTIONS[id],
			url: urls[id],
			state: answer?.state ?? 'not seen',
			// From a cache: reused; to the network (a 304 too): not; failed, no response or a service worker: unknown.
			reused: !answer ? null : cached ? true : answer.network ? false : null,
			network: mine.filter((r) => r.byProbe && r.network).length,
			byPage: mine.filter((r) => !r.byProbe).length,
		}
	})
}

const show = (v: string | number | null | undefined) => (v === null || v === undefined || v === '' ? '-' : typeof v === 'number' ? String(v) : JSON.stringify(v))
const cookiesLine = (res: ResponseFacts) => res.setCookies.map((c) => `${c.name}${c.attributes.length ? `(${c.attributes.join(', ')})` : ''}`).join(', ') || '-'

/** The response's caching headers in one line. */
export const describeResponse = (res: ResponseFacts) =>
	`Cache-Control ${show(res.cacheControl)} | Expires ${show(res.expires)} | Pragma ${show(res.pragma)} | Date ${show(res.date)} | Age ${show(res.age)} | Last-Modified ${show(res.lastModified)} | ETag ${show(res.etag)} | Vary ${show(res.vary)} | Set-Cookie ${cookiesLine(res)}${res.clearSiteData ? ` | Clear-Site-Data ${show(res.clearSiteData)}` : ''} | fresh for ${res.freshFor ?? '-'} s (lifetime ${res.lifetime ?? '-'}, age on arrival ${res.ageOnArrival ?? '-'})${res.fromCache ? ' [as the cache holds it]' : ''}`

/** The paragraph: which experiment reused the cache, and the most likely reason (with its evidence) where one did not. */
export function conclude(r: ProbeReport): string {
	const v = Object.fromEntries(r.verdicts.map((x) => [x.id, x])) as Partial<Record<ExperimentId, Verdict>>
	const reqOf = (id: ExperimentId, step: string) => r.requests.find((x) => x.experiment === id && x.step === step && x.byProbe) ?? null
	const parts: string[] = []
	const yes = r.verdicts.filter((x) => x.reused === true).map((x) => x.id)
	const no = r.verdicts.filter((x) => x.reused === false).map((x) => `${x.id} (${x.state})`)
	if (!r.verdicts.length) return `No experiment finished${r.message ? ` (${r.message})` : ''}: nothing to conclude.`
	parts.push(`Reused the cache: ${yes.join(', ') || 'none'}; did not: ${no.join(', ') || 'none'}${r.outcome === 'passed' ? '' : ` (the run ${r.outcome} before the rest: ${r.message})`}.`)
	// The destination's response as it came over the wire: E2's fetch, else the first one that went out.
	const wire = [reqOf('E2', 'fetch'), reqOf('E1', 'fetch 1'), ...r.requests.filter((x) => x.byProbe && x.network)].find((x) => x?.network && x.response && !x.response.fromCache) ?? null
	const res = wire?.response ?? null
	const blockers = res ? cacheBlockers(res) : []
	if (res) parts.push(`The destination's response (${wire!.experiment} ${wire!.step}, ${pathOf(wire!.url)}): ${describeResponse(res)}.`)
	const e2 = v.E2
	// The browser's own mark of a cache turned off: it adds Cache-Control: no-cache and Pragma: no-cache to every request.
	const noCache = (x: SeenRequest | null) => !!x && !x.request.provisional && /no-cache/i.test(x.request.cacheControl ?? '') && /no-cache/i.test(x.request.pragma ?? '')
	const e5Marked = noCache(reqOf('E5', 'fetch')) && noCache(reqOf('E5', 'navigation'))
	const e2Marked = noCache(reqOf('E2', 'fetch'))
	const e5Evidence = e5Marked && !e2Marked ? ' Both of its requests carried Cache-Control: no-cache and Pragma: no-cache, which the browser adds to every request while its cache is off; E2’s fetch carried neither.' : ''
	if (e2?.reused) {
		parts.push(`So the response is reusable: in this ${r.browser} with no request interception, the portal's fetch and then the navigation made ${e2.network} request(s) to the site (E2); the navigation came from the ${e2.state}.`)
		if (v.E5?.reused === false)
			parts.push(
				`With one Playwright route on the context, the same pair made ${v.E5.network} (E5): while any route is on, Playwright turns the browser's HTTP cache off for the page (Network.setCacheDisabled in playwright-core's crNetworkManager).${e5Evidence} The demo browser always has two routes (/__vg/** and /vg-sw.js), so S17's count (fetch 1, navigation 1, from cache 0) is the harness's. The most likely reason is the test browser, not the site: in a visitor's own Chrome, where the layer comes with the site's tag and no Playwright, the navigation is served from the cache.`,
			)
		else if (v.E5?.reused) parts.push('Even with a Playwright route on (E5) the navigation came from the cache, so the route does not explain S17: compare its request headers with E2’s below.')
	} else if (e2?.reused === false) {
		if (e2.state === 'revalidated (304)') parts.push('The navigation (E2) asked the site again with a conditional request and got 304: the cache held the response but had to check it first.')
		if (blockers.length) parts.push(`The response itself keeps the navigation from the cache (E2): ${blockers.join('; ')}.`)
		const nav = reqOf('E2', 'navigation')
		const fetch = reqOf('E2', 'fetch')
		if (v.E1?.reused) {
			const diff: string[] = []
			if (nav?.request.cacheControl || nav?.request.pragma) diff.push(`the navigation asked with Cache-Control ${show(nav.request.cacheControl)} and Pragma ${show(nav.request.pragma)}`)
			for (const f of varyFields(res)) diff.push(`the response varies on ${f}, which the navigation sends ${f === 'accept' ? `differently (fetch ${show(fetch?.request.accept)}, navigation ${show(nav?.request.accept)})` : 'perhaps differently from the fetch'}`)
			parts.push(`A second fetch did reuse it (E1), so it is stored and fresh; the navigation is what differs: ${diff.join('; ') || 'no header explains it, so this browser keeps a fetch’s response apart from a navigation’s'}.`)
		} else if (v.E1?.reused === false) parts.push(blockers.length ? 'A second fetch did not reuse it either (E1): the response is not reusable at all.' : 'A second fetch did not reuse it either (E1) and no caching header explains it: look at the request headers below (a Cache-Control or Pragma on the request, the cache turned off).')
		if (v.E3) parts.push(v.E3.reused ? 'A navigation’s own response does serve a later fetch (E3).' : `A fetch after a navigation was not served from the cache either (E3, ${v.E3.state}).`)
		if (v.E4) parts.push(v.E4.reused ? "A fetch with cache: 'force-cache' made the navigation reuse it (E4)." : "cache: 'force-cache' on the fetch changed nothing for the navigation (E4).")
		if (v.E5?.reused === false) parts.push(`With a Playwright route on (E5) it is not reused either: Playwright turns the cache off while any route is on, so in the demo browser it never is, whatever the headers say.${e5Evidence}`)
	}
	const w = r.fetchWrapper
	const fetchNames = reqOf('E2', 'fetch')?.request
	const nativeNames = reqOf('E2n', 'native fetch')?.request
	if (w?.wrapped) {
		const added = fetchNames && nativeNames && !fetchNames.provisional && !nativeNames.provisional ? fetchNames.names.filter((n) => !nativeNames.names.includes(n)) : null
		const same = v.E2 && v.E2n ? v.E2.reused === v.E2n.reused : null
		parts.push(
			`The page's window.fetch is wrapped ('${w.name}'); ${added === null ? 'the headers it adds could not be compared (a request did not go out)' : added.length ? `it added these request headers the browser's own fetch did not send: ${added.join(', ')}` : 'it sent the same header names as the browser’s own fetch'} (E2 against E2n), and the navigation ${same === null ? 'could not be compared' : same ? `fared the same with either fetch (E2 ${v.E2!.state}, E2n ${v.E2n!.state}): the wrapper is not the reason` : `fared differently (E2 ${v.E2!.state}, E2n ${v.E2n!.state})`}.`,
		)
	} else if (w) parts.push("The page's window.fetch is the browser's own (not wrapped).")
	if (res?.setCookies.length) parts.push(`The response sets cookies (${cookiesLine(res)}; names only), ${yes.length ? 'which did not keep it from the cache in the experiments that reused it' : 'which on its own does not keep a response from Chrome’s cache (the offline rehearsal shows it)'}.`)
	if (r.serviceWorker) parts.push('A service worker controls the page, so its fetches may not reach the HTTP cache directly.')
	return parts.join(' ')
}

/** The report as lines: one block per request, the experiments' table, the conclusion, and the whole report as JSON (names, never values). */
export function printProbeReport(r: ProbeReport, log: (line: string) => void = (l) => console.log(`# ${l}`)) {
	const sentToSite = r.requests.filter((x) => x.network)
	log(`${r.base} in ${r.browser}: ${r.outcome}${r.message ? ` (${r.message})` : ''}`)
	const kinds = (k: string) => r.actions.filter((a) => a.kind === k).length
	log(`the probe made ${r.requestsMade} request(s) for pages (at most ${r.maxRequests}, at least ${r.pauseMs} ms apart): ${kinds('fetch')} fetch(es), ${kinds('open') + kinds('navigation') + kinds('back')} page load(s) (${kinds('open')} opened, ${kinds('navigation')} by a fresh link, ${kinds('back')} Back); ${r.requests.filter((x) => x.byProbe && x.network).length} of them went to the network; the pages' own scripts asked for these addresses (or navigated the main frame) ${r.requests.filter((x) => !x.byProbe).length} more time(s); ${sentToSite.length} request(s) for these addresses reached the network in all`)
	for (const x of r.requests) {
		log(`${x.experiment} ${x.step}${x.byProbe ? '' : ' (by the page)'}: ${pathOf(x.url)} ${x.type}${x.mainFrame ? ' (main frame)' : ''}: ${x.state.toUpperCase()}, status ${x.status ?? '-'}${x.wireStatus !== null && x.wireStatus !== x.status ? ` (${x.wireStatus} on the wire)` : ''}${x.redirects.length ? `, redirects: ${x.redirects.join(', ')}` : ''}${x.failed ? `, failed: ${x.failed}` : ''}, ${x.encodedDataLength ?? '-'} B; started by ${x.initiator}${x.by ? ` ${x.by}` : ''}`)
		if (x.response) log(`    response: ${describeResponse(x.response)}`)
		const q = x.request
		log(`    request: Cache-Control ${show(q.cacheControl)} | Pragma ${show(q.pragma)} | Accept ${show(q.accept)} | Cookie sent ${q.cookie === null ? '(not sent: nothing went out)' : q.cookie ? 'yes' : 'no'} | conditional ${q.conditional.join(', ') || '-'} | Sec-Fetch ${q.secFetch} | headers${q.provisional ? ' (as the page gave them)' : ''}: ${q.names.join(', ')}`)
	}
	if (r.bfcacheNotUsed.length) log(`back/forward cache not used: ${r.bfcacheNotUsed.map((b) => `${b.during}: ${b.reasons.join(', ')}`).join('; ')}`)
	log('experiment | question | requests for its page that went to the network | the answering request | reused the cache?')
	for (const x of r.verdicts) log(`${x.id.padEnd(3)} | ${x.question} | ${x.network}${x.byPage ? ` (+${x.byPage} by the page)` : ''} | ${ANSWER_STEP[x.id]}: ${x.state} | ${x.reused === null ? 'not seen' : x.reused ? 'YES' : 'no'}`)
	log(`conclusion: ${r.conclusion}`)
	for (const line of r.cleanup) log(`clean-up: ${line}`)
	log(`report: ${JSON.stringify({ base: r.base, browser: r.browser, outcome: r.outcome, message: r.message, requestsMade: r.requestsMade, actions: r.actions.map((a) => ({ n: a.n, experiment: a.experiment, step: a.step, kind: a.kind, path: pathOf(a.url), status: a.status, ms: a.endedAt - a.startedAt, pageSays: a.pageSays })), fetchWrapper: r.fetchWrapper, nativeFetch: r.nativeFetch, serviceWorker: r.serviceWorker, verdicts: r.verdicts, navigations: r.navigations, requests: r.requests })}`)
}

export interface ProbeBrowser {
	context: BrowserContext
	page: Page
	profile: string
	close(): Promise<string[]>
}

/**
 * A browser on a throwaway profile (its own disk cache, as a visitor's), no route, no init script.
 * `asDemo` opens Google Chrome as the demo browser does (component updates on, the ar-EG locale), for the live run.
 */
export async function launchProbeBrowser(o: { channel: 'chrome' | 'chromium'; headless: boolean; viewport?: { width: number; height: number }; args?: string[]; asDemo?: boolean }): Promise<ProbeBrowser> {
	const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'vg-cache-probe-'))
	try {
		const context = await chromium.launchPersistentContext(profile, {
			...(o.channel === 'chrome' ? { channel: 'chrome' } : {}),
			...(o.asDemo ? { ignoreDefaultArgs: ['--disable-component-update'] } : {}),
			headless: o.headless,
			viewport: o.viewport ?? { width: 1366, height: 900 },
			args: o.args ?? [],
			locale: o.asDemo ? 'ar-EG' : 'en-US',
		})
		const page = context.pages()[0] ?? (await context.newPage())
		return {
			context,
			page,
			profile,
			close: async () => {
				await context.close().catch(() => {})
				fs.rmSync(profile, { recursive: true, force: true })
				return [`the browser closed and its throwaway profile deleted, with the cookies the site set in this run (${profile})`, 'no layer ran, so there is no data of the layer to remove; the probe’s own link and frame were removed from each page as soon as they were used']
			},
		}
	} catch (e) {
		fs.rmSync(profile, { recursive: true, force: true })
		throw e
	}
}

if (import.meta.main) {
	test('live: why the destination is not served from the cache (the portal, OD-4): six experiments in Google Chrome on a throwaway profile', { skip: !LIVE && 'set VG_LIVE=1', timeout: 600_000 }, async () => {
		const browser = await launchProbeBrowser({ channel: 'chrome', headless: false, viewport: { width: 1366, height: 900 }, asDemo: true })
		let report: ProbeReport | null = null
		let error: unknown = null
		try {
			report = await runCacheProbe(browser.page, { base: WEB, plan: LIVE_PLAN, pauseMs: MIN_PAUSE_MS })
		} catch (e) {
			error = e
			report = (e as { report?: ProbeReport })?.report ?? null
		} finally {
			const lines = await browser.close()
			if (report) {
				report.cleanup.push(...lines)
				printProbeReport(report)
			} else for (const line of lines) console.log(`# clean-up: ${line}`)
		}
		if (error) throw error
		assert.ok(report!.requestsMade <= MAX_REQUESTS, `at most ${MAX_REQUESTS} requests for pages (${report!.requestsMade})`)
		assert.equal(report!.outcome, 'passed')
	})
}
