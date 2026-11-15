/**
 * Motion on Vodafone's real pages (live plan phase 3, task A3; ADR-0052 §10-§14 the chips, ADR-0064 the
 * mascot, ADR-0065 the portal), run by the owner or the lead on the real web.vodafone.com.eg in the
 * installed Google Chrome on the demo profile. One flow, `runMotion(page, options)`, that this live test
 * and the offline rehearsal on the saved pages (../e2e/motion-live-rehearsal.e2e.test.ts) both call.
 *
 *   VG_LIVE=1 VG_LIVE_BROWSER=chrome VG_LIVE_OUT=$HOME/vg-live-out node --test --test-timeout=900000 tests/live/motion.live.test.ts
 *
 * Run it on its own (this file registers its test only when it is the file node runs, so the rehearsal
 * can import the flow without ever starting a live run). Close any `npm run demo:live` first: the demo
 * profile can be open in one browser at a time. VG_LIVE_OUT (outside the repository; default a new
 * folder in the system's temporary directory) gets one folder per run, motion-<time>, with every
 * screenshot and motion-report.json, the JSON of all the numbers.
 *
 * For each of /en/services and /ar/services at 1366×900, then at 375×812 (four rounds), one page load
 * signed out with ?aixc-debug, then:
 *  (1) the chips on the real carousels (the saved pages run no scripts; the real page runs Owl): a sample
 *      every 300 ms for 6 s of every chip's slot against its card (the part of the card that shows): a
 *      slot more than 3 px off its card two frames later is misplaced, a chip whose card is gone, hidden
 *      or wholly cut is detached; whether the carousels moved (running transitions in #main-content and
 *      Owl's stage offsets); two screenshots;
 *  (5a) the baseline frame cost: nothing pocketed by this run, the album closed, the pointer still for
 *      5 s: Chrome's Performance.getMetrics before and after (TaskDuration, ScriptDuration, LayoutCount,
 *      RecalcStyleCount and their durations) and a requestAnimationFrame sample (frames over 33 ms);
 *  (2) a card pocketed through its chip (hovered, then pressed): 10 screenshots 150 ms apart of the
 *      flight and the corner;
 *  (3) the album opened with the Pocket button: 14 screenshots 200 ms apart of the page turn and the
 *      mascot's hoverboard ride from the button to his place (English: across to the right; Arabic: a
 *      short way, to his place on the left), with his box at each frame;
 *  (5b) the same frame cost with the album open and the pointer still;
 *      then closed with its Back button, and the dash back filmed;
 *  (4) the album opened again and the sticker's link pressed: a screenshot every 250 ms until the
 *      navigation (about 3.3 s), the portal's state at each; then Back (the album reopens), closed.
 * Last in each round: no [AIXC] error, no page error from the layer, Vodafone's accessibility button and
 * cookie banner as at the start, every element of the layer marked; the layer's own records of this run
 * removed (the sticker).
 *
 * Safety (AGENTS.md §4 rules 1, 2, 5, 6; runbook §0), as in ./pocket-smoke.ts (its guard code is copied):
 * public pages only and never signed in; nothing typed; no commit point of Vodafone's pressed, nor
 * anything of Vodafone's: presses only on the layer's own controls (a chip, the Pocket button, the
 * album's Back, the sticker's link), each after a hit test at the press point (the element there must be
 * that control, inside a data-aixc root) and a check that OneTrust's banner is not showing; the banner is
 * never answered, closed or hidden ('skipped: banner' stops the run before any press); nothing written to
 * Vodafone's cookies or storage; a page load at most every 1.2 s and at most 16 in a run (12 are planned:
 * per round the open, the sticker's link, Back). Counted apart, and capped at 20 in all whoever asks: the
 * portal's fetch of each destination before its navigation (4), and a page reloading itself (Vodafone's
 * /vodafone-cash does, once per browser session, from its own "reload-vf-cash-content" block: one more
 * if a sticker leads there), so 16 or 17 requests for pages are expected. A bot check, a challenge page
 * (403, 429, 503, "Access denied", "Just a moment", captcha markers) or an error status stops the run at
 * once and nothing is retried.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'

import type { CDPSession, Page, Request } from 'playwright'

import type { Manifest } from '#kb'
import { loadPlatformConfig, loadSiteConfig, ROOT } from '#shared/config.ts'

import { buildSdk } from '../../packages/sdk/build.ts'
import { createGateway } from '../../services/gateway/server.ts'
import { createServices } from '../../services/index.ts'
import { type DemoBrowser, launchDemoBrowser } from '../../tools/demo-browser.ts'
import { BANNER_MESSAGE } from './pocket-smoke.ts'

/* eslint-disable @typescript-eslint/no-explicit-any */

export { BANNER_MESSAGE }

export type Viewport = { width: number; height: number }
export interface MotionCombo {
	path: string
	viewport: Viewport
}

export const DESKTOP: Viewport = { width: 1366, height: 900 }
export const PHONE: Viewport = { width: 375, height: 812 }
/** 1366×900 then 375×812, English then Arabic at each. */
export const COMBOS: MotionCombo[] = [
	{ path: '/en/services', viewport: DESKTOP },
	{ path: '/ar/services', viewport: DESKTOP },
	{ path: '/en/services', viewport: PHONE },
	{ path: '/ar/services', viewport: PHONE },
]
/** The hard cap on page loads in one run (12 planned: three per round). */
export const MAX_LOADS = 16
/**
 * A second cap, on every request for a page the main frame makes, whoever starts it: the run's loads, the
 * portal's fetch of each destination (4) and a page reloading itself (Vodafone's /vodafone-cash does,
 * once per browser session: its "reload-vf-cash-content" block). Past it the run stops.
 */
export const MAX_PAGE_REQUESTS = 20
export const LOADS_PER_COMBO = ['open', "the sticker's link", 'Back']

const CHIP_SAMPLES = 21 // 0 to 6 s, every 300 ms
const CHIP_EVERY = 300
/** px a slot may be off what shows of its card. */
const CHIP_TOLERANCE = 3
const COST_MS = 5000
const FLIGHT = { frames: 10, every: 150 }
const ALBUM = { frames: 14, every: 200 }
const CLOSE = { frames: 14, every: 200 }
const PORTAL = { every: 250, maxMs: 10_000 }
const BACK = { frames: 6, every: 250 }
/** px the mascot keeps from Vodafone's controls (ADR-0064). */
const PAD = 16

export interface MotionHooks {
	/** After each page has loaded and the layer is ready. Default: up to `settleMs` for OneTrust and the accessibility widget. */
	settle?(page: Page): Promise<void>
	/** After chip sample `i` (0-based) of step (1): the rehearsal moves an Owl stage there, as Owl's autoplay does live. */
	chipSample?(page: Page, i: number, combo: MotionCombo): Promise<void>
	/** Before the sticker's link is pressed (the rehearsal serves the destination from the saved pages). */
	beforeDestination?(page: Page, url: string): Promise<void>
}

export interface MotionOptions {
	/** The origin, for example https://web.vodafone.com.eg */
	base: string
	/** The folder for the screenshots and motion-report.json (made if missing). */
	out: string
	/** Default COMBOS. */
	combos?: MotionCombo[]
	/** At least this long between two page loads. Default 1200 ms (never less than 1000). */
	pauseMs?: number
	/** How long the default settle waits for the banner and the accessibility widget. Default 5000 ms. */
	settleMs?: number
	log?(line: string): void
	hooks?: MotionHooks
}

type Box = { left: number; top: number; right: number; bottom: number }

export interface Frame<T> {
	i: number
	/** ms from the frame strip's start (the press, for the frames after it). */
	t: number
	file: string | null
	shotMs: number
	sample: T | null
}

export interface Check {
	combo: string
	id: string
	ok: boolean
	detail: string
}

export interface CostReport {
	label: string
	windowMs: number
	wallMs: number | null
	taskMs: number
	scriptMs: number
	layoutMs: number
	recalcStyleMs: number
	layoutCount: number
	recalcStyleCount: number
	frames: number
	meanFrameMs: number | null
	p95FrameMs: number | null
	maxFrameMs: number | null
	over33: number
	over50: number
	pointer: { x: number; y: number } | null
	view: string | null
	stickers: number
}

export interface ComboReport {
	name: string
	path: string
	viewport: Viewport
	steps: { id: string; name: string; ok: boolean; detail?: string; numbers?: Record<string, unknown> }[]
	start: { button: number[] | null; banner: { box: number[]; display: string } | null; scrollbar: number | null; stickersAlready: number } | null
	chips: Record<string, any> | null
	cost: { baseline: CostReport | null; album: CostReport | null }
	flight: { card: { id: string; href: string } | null; frames: Frame<any>[] } | null
	album: { frames: Frame<any>[]; start: any; rest: any } | null
	close: { frames: Frame<any>[]; after: any } | null
	portal: { destination: string; status: number | null; navigatedMs: number | null; states: string[]; frames: Frame<any>[] } | null
	back: { status: number | null; albumReopened: boolean; frames: Frame<any>[] } | null
}

export interface MotionReport {
	base: string
	out: string
	startedAt: string
	userAgent: string | null
	outcome: 'passed' | 'failed' | 'skipped: banner' | 'stopped'
	message: string | null
	combos: ComboReport[]
	checks: Check[]
	loads: { url: string; status: number | null; at: number; how: string; combo: string }[]
	/**
	 * Requests for pages seen in the main frame: its documents, and the portal's fetch of a destination
	 * (whether each was a navigation, whether it was the page asking for itself again within 2 s of its
	 * own navigation, a reload of its own, and how it failed, if it did).
	 */
	pageRequests: { url: string; type: string; at: number; combo: string; navigation: boolean; reload: boolean; failure: string | null }[]
	presses: number
	layerConsole: string[]
	layerPageErrors: string[]
	cleanup: string[]
	files: string[]
}

/** The run stopped on purpose (a bot check, an error page, the load cap); the report says why. */
export class MotionStop extends Error {
	readonly report: MotionReport
	constructor(message: string, report: MotionReport) {
		super(message)
		this.name = 'MotionStop'
		this.report = report
	}
}

/** A step of the flow could not be done (the album did not open, no chip a press reaches...). */
export class MotionFailure extends Error {
	readonly report: MotionReport
	constructor(message: string, report: MotionReport) {
		super(message)
		this.name = 'MotionFailure'
		this.report = report
	}
}

class BannerShows extends Error {}

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms))
const pad2 = (n: number) => String(n).padStart(2, '0')
const cx = (b: Box) => (b.left + b.right) / 2
const gap = (a: Box, b: Box) => Math.max(b.left - a.right, a.left - b.right, b.top - a.bottom, a.top - b.bottom)
const overlaps = (a: Box, b: Box) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
const fmt = (b: Box | null | undefined) => (b ? `[${[b.left, b.top, b.right, b.bottom].map((v) => Math.round(v)).join(',')}]` : 'none')
const r1 = (v: number) => Math.round(v * 10) / 10

/** Rejects after `ms` (a screenshot or a read that hangs while a page navigates). */
const within = <T>(p: Promise<T>, ms: number, what: string): Promise<T> => {
	let timer: ReturnType<typeof setTimeout> | undefined
	return Promise.race([
		p.finally(() => clearTimeout(timer)),
		new Promise<T>((_, reject) => {
			timer = setTimeout(() => reject(new Error(`${what}: no answer in ${ms} ms`)), ms)
		}),
	])
}

/* ---------------------------------------------------------------- the guard (copied from ./pocket-smoke.ts) */

/** What a challenge page has (Cloudflare's interstitial, PerimeterX, reCAPTCHA, hCaptcha). Cloudflare's passive /scripts/jsd/ on ordinary pages is not one. */
const CHALLENGE_MARKERS = '#challenge-form, #challenge-running, #cf-challenge-running, #challenge-stage, iframe[src*="challenges.cloudflare.com"], script[src*="/cdn-cgi/challenge-platform/h/"], #px-captcha, iframe[src*="captcha"], .g-recaptcha, .h-captcha'
const BOT_WORDS = /access denied|attention required|just a moment|captcha|verify (that )?you are (a )?human|checking your browser|pardon our interruption|request unsuccessful|are you a robot/i
const ERROR_WORDS = /page not found|\b404\b|\b50[0-4]\b|server error|service unavailable/i

/** The layer's elements: ids and class prefixes of the Pocket, the curl, the portal and the core. */
const LAYER_SELECTOR = '#experience-output, #aixc-viewbar, #pocket-output, style[data-aixc-css], [class*="pocket-"], [class*="curl-"], [class*="aixc-"], .vf-portal'

/** Album content the mascot must not stand over at rest (as tests/e2e/pocket-actors-live.e2e.test.ts). */
const ALBUM_CONTENT = '.pocket-grid__item, .pocket-empty, .pocket-view__bar > *, .pocket-view__head > *, .pocket-group__head > *'

/* ---------------------------------------------------------------- the flow */

export async function runMotion(page: Page, options: MotionOptions): Promise<MotionReport> {
	const base = options.base.replace(/\/$/, '')
	const combos = options.combos ?? COMBOS
	const pauseMs = Math.max(1000, options.pauseMs ?? 1200)
	const settleMs = options.settleMs ?? 5000
	const log = options.log ?? ((line: string) => console.log(`# ${line}`))
	const hooks = options.hooks ?? {}
	const out = path.resolve(options.out)
	fs.mkdirSync(out, { recursive: true })
	const report: MotionReport = { base, out, startedAt: new Date().toISOString(), userAgent: null, outcome: 'failed', message: null, combos: [], checks: [], loads: [], pageRequests: [], presses: 0, layerConsole: [], layerPageErrors: [], cleanup: [], files: [] }
	const writeReport = () => {
		try {
			fs.writeFileSync(path.join(out, 'motion-report.json'), JSON.stringify(report, null, 2))
		} catch (e) {
			log(`could not write the report: ${(e as Error).message}`)
		}
	}

	let combo: ComboReport | null = null
	let key = 'run'
	let lastLoad = 0
	/** Stickers in the Pocket before this run (never removed); null until the first page is read. */
	let keysAtStart: string[] | null = null
	/** Whether this round's sticker is still to be removed. */
	let dirty = false
	const destinations = new Set<string>()

	const onConsole = (m: { type(): string; text(): string }) => {
		if (m.text().startsWith('[AIXC]')) report.layerConsole.push(`${key} ${m.type()}: ${m.text()}`)
	}
	const onPageError = (e: Error) => {
		if (/\/__vg\/sdk\/aixc\//.test(`${e.message} ${e.stack ?? ''}`)) report.layerPageErrors.push(`${key} ${e.message}`)
	}
	const asked = new Map<Request, MotionReport['pageRequests'][number]>()
	let lastDocument = { url: '', at: 0 }
	const onRequest = (r: Request) => {
		try {
			const type = r.resourceType()
			const url = r.url().split('#')[0]
			const isDocument = type === 'document' && r.frame() === page.mainFrame()
			if (isDocument || ((type === 'fetch' || type === 'xhr') && destinations.has(url))) {
				const reload = isDocument && url === lastDocument.url && Date.now() - lastDocument.at < 2000
				const entry = { url, type, at: Date.now(), combo: key, navigation: r.isNavigationRequest(), reload, failure: null }
				report.pageRequests.push(entry)
				asked.set(r, entry)
				if (reload) log(`  the page asked for itself again (${url}): its own reload, not this run's; counted apart`)
			}
			if (isDocument) lastDocument = { url, at: Date.now() }
		} catch {
			// A request of a service worker has no frame.
		}
	}
	const onRequestFailed = (r: Request) => {
		const entry = asked.get(r)
		if (entry) entry.failure = r.failure()?.errorText ?? 'failed'
	}
	page.on('console', onConsole)
	page.on('pageerror', onPageError)
	page.on('request', onRequest)
	page.on('requestfailed', onRequestFailed)

	const fail = (id: string, message: string): never => {
		throw new MotionFailure(`${key} (${id}) ${message}`, report)
	}
	const stop = (message: string): never => {
		report.outcome = 'stopped'
		report.message = message
		log(`STOPPED: ${message}`)
		throw new MotionStop(message, report)
	}
	const checkThat = (id: string, ok: boolean, detail: string) => {
		report.checks.push({ combo: key, id, ok, detail })
		log(`    ${ok ? 'check' : 'CHECK FAILED'} ${id}: ${detail}`)
	}

	const pace = async () => {
		const wait = lastLoad + pauseMs - Date.now()
		if (wait > 0) await sleep(wait)
	}
	const recordLoad = (how: string, at: string, status: number | null) => {
		report.loads.push({ url: at, status, at: Date.now(), how, combo: key })
		lastLoad = Date.now()
		log(`page load ${report.loads.length} of at most ${MAX_LOADS} (${how}): ${at} answered ${status ?? 'from memory (no response)'}`)
	}
	const room = () => {
		if (report.loads.length >= MAX_LOADS) stop(`this run would load more than ${MAX_LOADS} pages`)
		if (report.pageRequests.length >= MAX_PAGE_REQUESTS) stop(`the main frame asked for pages ${report.pageRequests.length} times (the cap is ${MAX_PAGE_REQUESTS}, whoever asks)`)
	}

	/** Stops on a bot check or an error page (runbook §0: never retried, never worked around). */
	const stopIfBlocked = async (status: number | null) => {
		if (status !== null && [403, 429, 503].includes(status)) stop(`${page.url()} answered ${status}: a bot check or a block. Nothing was pressed after it and nothing is retried (runbook §0).`)
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
		if (BOT_WORDS.test(seen.title) || BOT_WORDS.test(seen.text) || seen.marker.length) stop(`${page.url()} is a bot check or a challenge ("${seen.title}"${seen.marker.length ? `, ${seen.marker.join(', ')}` : ''}). This test never tries to get past one: it stops here. Nothing is retried (runbook §0).`)
		if (status !== null && status >= 400) stop(`${page.url()} answered ${status} "${seen.title}": an error page. The run stops (runbook §0).`)
		if (!seen.vodafone && ERROR_WORDS.test(seen.title)) stop(`${page.url()} looks like an error page ("${seen.title}"). The run stops.`)
	}

	const bannerShows = () =>
		page.evaluate(() => {
			const b = document.getElementById('onetrust-banner-sdk')
			if (!b) return false
			const s = getComputedStyle(b)
			const r = b.getBoundingClientRect()
			return s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity) > 0 && r.width > 0 && r.height > 0
		})
	/** Before every press: never press anything while the banner shows. */
	const beforePress = async () => {
		if (await bannerShows()) throw new BannerShows()
	}
	/**
	 * A press on one of the layer's own controls only: the banner is not showing, and the element at the
	 * press point is `ours` (a selector), inside a data-aixc root, nothing of Vodafone's furniture, and, when
	 * `want` says so, the chip of that card (`for`) or the link to that address (`href`). Otherwise nothing
	 * is pressed and the step fails.
	 */
	const press = async (id: string, at: { x: number; y: number }, what: string, ours: string, want: { for?: string; href?: string } = {}) => {
		await beforePress()
		const hit = await page.evaluate(
			([x, y, ours, wantFor, wantHref]) => {
				const n = document.elementFromPoint(x, y)
				const el = n?.closest(ours) as HTMLElement | null
				const cls = n && typeof n.className === 'string' && n.className ? `.${n.className.split(' ')[0]}` : ''
				const desc = n ? `${n.localName}${n.id ? `#${n.id}` : ''}${cls}` : 'nothing'
				const ok = !!el && !!el.closest('[data-aixc]') && !el.closest('#onetrust-consent-sdk, accessibility-widget, #vodafone-aw-icon') && (!wantFor || el.dataset.pocketFor === wantFor) && (!wantHref || (el as HTMLAnchorElement).href === wantHref)
				return { ok, desc }
			},
			[at.x, at.y, ours, want.for ?? '', want.href ?? ''] as const,
		)
		if (!hit.ok) fail(id, `a press at ${what} (${Math.round(at.x)}, ${Math.round(at.y)}) would reach ${hit.desc}, not the layer's own control: nothing was pressed`)
		report.presses++
		log(`  press: ${what}`)
		await page.mouse.click(at.x, at.y)
	}

	/* Screenshots and Chrome's own numbers, over the DevTools Protocol (nothing is put in the page). */
	let cdp: CDPSession | null = null
	const session = async () => (cdp ??= await page.context().newCDPSession(page))
	const shoot = async (name: string) => {
		const file = `${key}-${name}.jpg`
		const t = Date.now()
		try {
			const s = await session()
			const shot = await within(s.send('Page.captureScreenshot', { format: 'jpeg', quality: 70, optimizeForSpeed: true }), 4000, 'a screenshot')
			fs.writeFileSync(path.join(out, file), Buffer.from(shot.data, 'base64'))
		} catch {
			void cdp?.detach().catch(() => {})
			cdp = null
			try {
				await page.screenshot({ path: path.join(out, file), type: 'jpeg', quality: 70, caret: 'initial', animations: 'allow', scale: 'css', timeout: 4000 })
			} catch {
				return { file: null, ms: Date.now() - t }
			}
		}
		report.files.push(file)
		return { file, ms: Date.now() - t }
	}

	/** Frames `from`..`from + count - 1`, frame i due at t0 + i·every: a sample, then a screenshot. */
	const film = async <T>(name: string, from: number, count: number, every: number, t0: number, sample: () => Promise<T | null>, stopWhen?: (s: T | null, i: number) => boolean) => {
		const frames: Frame<T>[] = []
		for (let i = from; i < from + count; i++) {
			const wait = t0 + i * every - Date.now()
			if (wait > 0) await sleep(wait)
			const t = Date.now() - t0
			const s = await sample()
			const shot = await shoot(`${name}-${pad2(i)}`)
			frames.push({ i, t, file: shot.file, shotMs: shot.ms, sample: s })
			if (stopWhen?.(s, i)) break
		}
		return frames
	}

	const defaultSettle = async () => {
		const end = Date.now() + settleMs
		while (Date.now() < end) {
			const there = await page.evaluate(() => ({ ot: !!document.getElementById('onetrust-consent-sdk'), aw: !!document.getElementById('vodafone-aw-icon') }))
			if (there.ot && there.aw) break
			await sleep(250)
		}
		await sleep(500)
	}

	/** The layer is ready on this page, its Pocket and store too. */
	const layerReady = async (id: string) => {
		await page.waitForFunction(() => !!document.querySelector('script[data-vg-loader]'), null, { timeout: 30_000 }).catch(() => fail(id, 'the demo browser did not add its loader to the page'))
		await page.waitForFunction(() => (window as any).__aixc && (window as any).__aixc.state !== 'starting', null, { timeout: 30_000 }).catch(() => fail(id, 'the layer did not start (no window.__aixc with ?aixc-debug)'))
		const state = await page.evaluate(() => ({ state: (window as any).__aixc.state as string, problem: (window as any).__aixc.problem as string | null }))
		if (state.state !== 'ready') fail(id, `the layer is not ready (it is '${state.state}'${state.problem ? `: ${state.problem}` : ''})`)
		await page.waitForFunction(() => (window as any).__aixc?.demos?.pocket?.chips, null, { timeout: 30_000 }).catch(() => fail(id, 'the Pocket did not start on the page (no chips)'))
		await page.evaluate(() => (window as any).__aixc.demos.pocket.store.ready)
		await (hooks.settle ? hooks.settle(page) : defaultSettle())
	}

	/** Vodafone's accessibility button and cookie banner (box, style attribute, computed styles), the header's and footer's places. */
	const furniture = () =>
		page.evaluate(() => {
			const PROPS = ['position', 'top', 'right', 'bottom', 'left', 'width', 'height', 'z-index', 'display', 'visibility', 'opacity', 'transform', 'transition', 'pointer-events', 'margin-bottom', 'margin-right', 'margin-left']
			const one = (el: Element | null) => {
				if (!el) return null
				const r = el.getBoundingClientRect()
				const cs = getComputedStyle(el)
				return { box: [r.left, r.top, r.width, r.height].map(Math.round), style: el.getAttribute('style'), computed: Object.fromEntries(PROPS.map((p) => [p, cs.getPropertyValue(p)])) }
			}
			const place = (el: Element | null) => {
				if (!el) return null
				const r = el.getBoundingClientRect()
				return { top: Math.round(r.top + scrollY), left: Math.round(r.left), width: Math.round(r.width) }
			}
			return {
				button: one(document.getElementById('vodafone-aw-icon')),
				banner: one(document.getElementById('onetrust-banner-sdk')),
				header: place(document.getElementById('header')),
				footer: place(document.querySelector('footer.footer') ?? document.querySelector('footer')),
				scrollbar: innerWidth - document.documentElement.clientWidth,
			}
		})
	type Furniture = Awaited<ReturnType<typeof furniture>>
	/** What differs in Vodafone's button and banner (and the header's place, and the footer's left and width). */
	const differences = (a: Furniture, b: Furniture) => {
		const diff: string[] = []
		for (const k of ['button', 'banner'] as const) {
			const x = a[k]
			const y = b[k]
			if (!x !== !y) {
				diff.push(`${k}: ${x ? 'was there, now gone' : 'was not there, now is'}`)
				continue
			}
			if (!x || !y) continue
			if (x.box.some((v, i) => Math.abs(v - y.box[i]) > 1)) diff.push(`${k} box ${JSON.stringify(x.box)} → ${JSON.stringify(y.box)}`)
			if (x.style !== y.style) diff.push(`${k} style attribute ${JSON.stringify(x.style)} → ${JSON.stringify(y.style)}`)
			for (const p of Object.keys(x.computed)) if (x.computed[p] !== y.computed[p]) diff.push(`${k} ${p} ${x.computed[p]} → ${y.computed[p]}`)
		}
		if (a.header && b.header && (['top', 'left', 'width'] as const).some((p) => Math.abs(a.header![p] - b.header![p]) > 2)) diff.push(`header ${JSON.stringify(a.header)} → ${JSON.stringify(b.header)}`)
		if (a.footer && b.footer && (['left', 'width'] as const).some((p) => Math.abs(a.footer![p] - b.footer![p]) > 2)) diff.push(`footer ${JSON.stringify(a.footer)} → ${JSON.stringify(b.footer)}`)
		return diff
	}

	const pocketState = () =>
		page.evaluate(() => {
			const p = (window as any).__aixc?.demos?.pocket
			return { view: (p?.state?.view ?? null) as string | null, busy: !!p?.state?.busy, keys: ((p?.store?.all() ?? []) as any[]).map((r) => r.key as string), ids: ((p?.store?.all() ?? []) as any[]).map((r) => r.id as string) }
		})

	/** The Pocket button: shown and still, its count, where it is and whether a press at its centre reaches it. */
	const pocketButton = async (id: string) => {
		await page.waitForSelector('.pocket-peek[data-state="shown"]', { timeout: 10_000 }).catch(() => fail(id, 'the Pocket button did not show'))
		await page.waitForFunction(() => document.querySelectorAll('.curl-host--flying').length === 0, null, { timeout: 10_000 }).catch(() => {})
		await sleep(900)
		return page.evaluate(() => {
			const b = document.querySelector<HTMLElement>('.pocket-peek[data-state="shown"]')!
			const r = b.getBoundingClientRect()
			const x = r.left + r.width / 2
			const y = r.top + r.height / 2
			const hit = document.elementFromPoint(x, y)
			return { x, y, count: b.querySelector('.pocket-peek__count')?.textContent ?? '', left: Math.round(r.left), bottomGap: Math.round(innerHeight - r.bottom), reached: !!hit && (hit === b || b.contains(hit)), onTop: hit ? `${hit.localName}${hit.id ? '#' + hit.id : ''}.${String(hit.getAttribute('class') ?? '').split(' ')[0]}` : null, innerWidth }
		})
	}

	const waitView = (id: string, view: 'page' | 'pocket', timeout = 15_000) =>
		page
			.waitForFunction(
				(view) => {
					const s = (window as any).__aixc?.demos?.pocket?.state
					return s?.view === view && !s.busy && (view === 'page' || !document.getElementById('pocket-output')?.hidden)
				},
				view,
				{ timeout },
			)
			.catch(() => fail(id, view === 'pocket' ? 'the album did not open' : 'the album did not close'))

	/** The album's Back button on screen with a press reaching it, or null. */
	const backButton = () =>
		page.evaluate(() => {
			for (const b of document.querySelectorAll<HTMLElement>('#pocket-output .pocket-back:not(.pocket-journey-cta)')) {
				const r = b.getBoundingClientRect()
				if (!r.width || !r.height || r.top < 0 || r.bottom > innerHeight) continue
				const x = r.left + r.width / 2
				const y = r.top + r.height / 2
				const hit = document.elementFromPoint(x, y)
				if (hit && (hit === b || b.contains(hit))) return { x, y }
			}
			return null
		})

	/** Closes the album with its Back button (a mouse press), or Escape when the button is not on screen (as ./pocket-smoke.ts). */
	const closeAlbum = async (id: string) => {
		const back = await backButton()
		if (back) await press(id, back, "the album's Back button", '#pocket-output .pocket-back')
		else {
			await beforePress()
			report.presses++
			log('  key: Escape (the Back button is not on screen)')
			await page.keyboard.press('Escape')
		}
		await waitView(id, 'page')
		await sleep(400)
		return back ? 'Back' : 'Escape'
	}

	/** A spot where the pointer can rest over nothing pressable, no carousel and nothing of the layer's (null: it stays). */
	const parkPointer = async () => {
		const at = await page.evaluate(() => {
			const AVOID = 'a, button, input, select, textarea, label, summary, [role="button"], [onclick], [tabindex], .owl-carousel, .owl-stage-outer, nav, #header, header, .nav-header, footer, [data-aixc], #onetrust-consent-sdk, accessibility-widget, #vodafone-aw-icon, vg-guide, iframe, video'
			const w = document.documentElement.clientWidth
			const h = innerHeight
			for (const fy of [0.55, 0.35, 0.75, 0.9])
				for (const x of [8, Math.round(w / 2), w - 8]) {
					const y = Math.round(h * fy)
					const n = document.elementFromPoint(x, y)
					if (n && !n.closest(AVOID)) return { x, y }
				}
			return null
		})
		if (at) await page.mouse.move(at.x, at.y)
		return at
	}

	/* ------------------------------------------------ in-page reads (each one self-contained) */

	/**
	 * Every chip's slot against the part of its card that shows. A slot off by more than CHIP_TOLERANCE is
	 * misplaced; a shown slot whose card is gone, hidden or wholly cut, or whose chip shows off its card (the
	 * centre of the part of the chip that shows, the slot clipping it where the card is cut), is detached.
	 * Either one is measured again two frames later: caught up, it lagged (counted apart, not a failure).
	 * What moved: the CSS transitions running in #main-content (Owl's stage; not Vodafone's looping CSS
	 * animations, counted apart), Owl's stage offsets and each chipped card's left edge.
	 */
	const chipsNow = () =>
		page.evaluate(async (tol) => {
			type B = { left: number; top: number; right: number; bottom: number }
			const box = (r: DOMRect | B): B => ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom })
			const meet = (a: B, b: B): B | null => {
				const r = { left: Math.max(a.left, b.left), top: Math.max(a.top, b.top), right: Math.min(a.right, b.right), bottom: Math.min(a.bottom, b.bottom) }
				return r.right - r.left > 0 && r.bottom - r.top > 0 ? r : null
			}
			const r0 = (b: B | null) => (b ? [b.left, b.top, b.right, b.bottom].map(Math.round) : null)
			const cardOf = (id: string) => [...document.querySelectorAll(`#main-content [data-aixc-item="${CSS.escape(id)}"]`)].find((c) => !c.closest('.owl-item.cloned, [data-aixc]')) ?? null
			const seenOf = (card: Element): B | null => {
				let r: B | null = box(card.getBoundingClientRect())
				for (let n = card.parentElement; n && n !== document.documentElement && r; n = n.parentElement) {
					const s = getComputedStyle(n)
					if (s.overflowX === 'visible' && s.overflowY === 'visible') continue
					r = meet(r, box(n.getBoundingClientRect()))
				}
				return r
			}
			type Slot = { id: string; dev: number; misplaced: boolean; detached: string | null; inView: boolean; cardLeft: number | null; at: { slot: number[] | null; seen: number[] | null; chip: number[] | null; clipped: boolean } }
			const measure = () => {
				const root = document.querySelector<HTMLElement>('.pocket-chips')
				const slots: Slot[] = []
				if (!root || root.hidden) return { rootHidden: true, slots }
				for (const slot of root.children) {
					if (!(slot instanceof HTMLElement) || !slot.classList.contains('pocket-host') || slot.hidden || 'cut' in slot.dataset) continue
					const cta = slot.querySelector<HTMLElement>('.pocket-cta[data-pocket-for]')
					const id = cta?.dataset.pocketFor
					if (!cta || !id) continue
					const sb = box(slot.getBoundingClientRect())
					if (sb.right - sb.left <= 0 || sb.bottom - sb.top <= 0) continue
					const inView = sb.right > 0 && sb.left < innerWidth && sb.bottom > 0 && sb.top < innerHeight
					const clipped = getComputedStyle(slot).overflow !== 'visible'
					const ch = box(cta.getBoundingClientRect())
					// The part of the chip that shows: all of it, or what the slot leaves where it clips (a card cut by its stage).
					const chip = ch.right - ch.left > 0 && ch.bottom - ch.top > 0 ? (clipped ? meet(ch, sb) : ch) : null
					const card = cardOf(id)
					let detached: string | null = null
					let dev = 0
					let seen: B | null = null
					let cardLeft: number | null = null
					if (!card || !card.isConnected) detached = 'its card is gone'
					else {
						const cb = card.getBoundingClientRect()
						cardLeft = Math.round(cb.left)
						seen = seenOf(card)
						if (!cb.width || !cb.height) detached = 'its card has no size'
						else if (!(card.checkVisibility?.({ visibilityProperty: true }) ?? true)) detached = 'its card is hidden'
						else if (!seen) detached = 'its card is wholly cut'
						else {
							dev = Math.max(Math.abs(sb.left - seen.left), Math.abs(sb.top - seen.top), Math.abs(sb.right - seen.right), Math.abs(sb.bottom - seen.bottom))
							if (chip) {
								const x = (chip.left + chip.right) / 2
								const y = (chip.top + chip.bottom) / 2
								if (x < seen.left - 1 || x > seen.right + 1 || y < seen.top - 1 || y > seen.bottom + 1) detached = 'its chip shows off its card'
							}
						}
					}
					slots.push({ id, dev: Math.round(dev * 10) / 10, misplaced: !detached && dev > tol, detached, inView, cardLeft, at: { slot: r0(sb), seen: r0(seen), chip: r0(chip), clipped } })
				}
				return { rootHidden: false, slots }
			}
			const first = measure()
			const off = first.slots.filter((s) => s.misplaced || s.detached)
			const lagged: string[] = []
			if (off.length) {
				await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(done, 0))))
				const again = measure()
				for (const s of off) {
					const now = again.slots.find((x) => x.id === s.id)
					// Gone from the shown slots (cut or hidden with its card) or back on its card: it caught up.
					if (!now || (!now.misplaced && !now.detached)) {
						s.misplaced = false
						s.detached = null
						lagged.push(s.id)
					}
				}
			}
			const main = document.getElementById('main-content')
			const running = document.getAnimations().filter((a) => {
				const target = (a.effect as KeyframeEffect | null)?.target
				return a.playState === 'running' && !!target && !!main?.contains(target) && !target.closest('[data-aixc]')
			})
			const transitions = running.filter((a) => a instanceof CSSTransition).length
			const stages = [...document.querySelectorAll<HTMLElement>('#main-content .owl-stage')].map((s) => Math.round(new DOMMatrix(getComputedStyle(s).transform).m41))
			return {
				rootHidden: first.rootHidden,
				visible: first.slots.length,
				inView: first.slots.filter((s) => s.inView).length,
				misplaced: first.slots.filter((s) => s.misplaced).map((s) => ({ id: s.id, dev: s.dev, at: s.at })),
				lagged,
				detached: first.slots.filter((s) => s.detached).map((s) => ({ id: s.id, why: s.detached, at: s.at })),
				maxDev: Math.max(0, ...first.slots.filter((s) => !s.misplaced && !s.detached && !lagged.includes(s.id)).map((s) => s.dev)),
				transitions,
				animations: running.length - transitions,
				stages,
				cards: Object.fromEntries(first.slots.filter((s) => s.cardLeft !== null).map((s) => [s.id, s.cardLeft])) as Record<string, number>,
				scrollY: Math.round(scrollY),
			}
		}, CHIP_TOLERANCE)

	/** The card in flight, the Pocket button and the mascot during a save. */
	const flightNow = () =>
		within(
			page.evaluate(() => {
				const box = (n: Element | null) => {
					if (!n || !n.getClientRects().length) return null
					const r = n.getBoundingClientRect()
					return { left: Math.round(r.left), top: Math.round(r.top), right: Math.round(r.right), bottom: Math.round(r.bottom) }
				}
				const peek = document.querySelector<HTMLElement>('.pocket-peek')
				return {
					flying: document.querySelectorAll('.curl-host--flying').length,
					fly: box(document.querySelector('.curl-host--flying')),
					peek: box(peek),
					peekState: peek?.dataset.state ?? null,
					count: peek?.querySelector('.pocket-peek__count')?.textContent ?? null,
					mascot: document.querySelector<HTMLElement>('.pocket-mascot')?.dataset.mascotState ?? null,
					scrollY: Math.round(scrollY),
				}
			}),
			3000,
			'a read',
		).catch(() => null)

	/** The mascot (his box, his drawn body and board, his state), the album, the Pocket button and Vodafone's accessibility button. */
	const mascotNow = () =>
		within(
			page.evaluate((CONTENT) => {
				type B = { left: number; top: number; right: number; bottom: number }
				const box = (n: Element | null | undefined): B | null => {
					if (!n || !n.getClientRects().length) return null
					const r = n.getBoundingClientRect()
					return r.width || r.height ? { left: Math.round(r.left * 10) / 10, top: Math.round(r.top * 10) / 10, right: Math.round(r.right * 10) / 10, bottom: Math.round(r.bottom * 10) / 10 } : null
				}
				const union = (list: (B | null)[]) => {
					const l = list.filter(Boolean) as B[]
					return l.length ? { left: Math.min(...l.map((b) => b.left)), top: Math.min(...l.map((b) => b.top)), right: Math.max(...l.map((b) => b.right)), bottom: Math.max(...l.map((b) => b.bottom)) } : null
				}
				const m = document.querySelector<HTMLElement>('.pocket-mascot')
				const mover = m?.querySelector('.pocket-mascot__mover')
				const svg = mover?.querySelector('svg')
				const moverBox = box(mover)
				let hit: string | null = null
				if (moverBox) {
					const at = document.elementFromPoint(Math.min(innerWidth - 1, Math.max(0, (moverBox.left + moverBox.right) / 2)), Math.min(innerHeight - 1, Math.max(0, (moverBox.top + moverBox.bottom) / 2)))
					hit = at?.closest('.pocket-mascot') ? 'mascot' : at ? at.localName : null
				}
				const peek = document.querySelector<HTMLElement>('.pocket-peek')
				const drone = document.querySelector<HTMLElement>('.pocket-drone')
				const aw = document.getElementById('vodafone-aw-icon')
				const as = aw ? getComputedStyle(aw) : null
				const s = (window as any).__aixc?.demos?.pocket?.state
				const out = document.getElementById('pocket-output')
				return {
					view: (s?.view ?? null) as string | null,
					busy: !!s?.busy,
					state: m?.dataset.mascotState ?? null,
					board: m?.dataset.board ?? null,
					visible: m ? getComputedStyle(m).visibility !== 'hidden' : false,
					pointerEvents: m ? getComputedStyle(m).pointerEvents : null,
					covered: m?.hasAttribute('data-covered') ?? false,
					mover: moverBox,
					drawn: union([box(svg?.querySelector('[data-part="outline"]')), box(svg?.querySelector('[data-part="board-deck"]'))]),
					hit,
					drone: drone && !drone.hidden ? box(drone) : null,
					peek: box(peek),
					peekState: peek?.dataset.state ?? null,
					inner: box(out?.querySelector('.pocket-view__inner')),
					content: [...(out?.querySelectorAll(CONTENT) ?? [])].map(box).filter(Boolean) as B[],
					aw: aw ? { box: box(aw), style: aw.getAttribute('style'), computed: as ? [as.right, as.bottom, as.zIndex, as.opacity, as.visibility, as.transform, as.display].join('|') : null } : null,
					scrollbar: innerWidth - document.documentElement.clientWidth,
					width: document.documentElement.clientWidth,
					height: innerHeight,
				}
			}, ALBUM_CONTENT),
			3000,
			'a read',
		).catch(() => null)
	type Mascot = NonNullable<Awaited<ReturnType<typeof mascotNow>>>

	/** The portal's overlay and state, and the address (null while the page navigates). */
	const portalNow = () =>
		within(
			page.evaluate(() => {
				const root = document.querySelector<HTMLElement>('.vf-portal')
				return { overlays: document.querySelectorAll('.vf-portal').length, state: root?.dataset.state ?? null, active: document.documentElement.dataset.vfPortal ?? null, url: location.href }
			}),
			2000,
			'a read',
		).catch(() => null)

	const albumNow = () =>
		within(
			page.evaluate(() => {
				const s = (window as any).__aixc?.demos?.pocket?.state
				return { url: location.href, view: (s?.view ?? null) as string | null, busy: !!s?.busy, scrollY: Math.round(scrollY), overlays: document.querySelectorAll('.vf-portal').length }
			}),
			2000,
			'a read',
		).catch(() => null)

	/** Chrome's own numbers over `COST_MS` with the pointer still: Performance.getMetrics before and after, and the frames requestAnimationFrame saw. */
	const frameCost = async (label: string): Promise<CostReport> => {
		const pointer = label === 'baseline' ? await parkPointer() : null
		await sleep(300)
		const s = await session()
		await s.send('Performance.enable', {})
		const read = async () => Object.fromEntries((await s.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value])) as Record<string, number>
		const before = await read()
		const times = await page.evaluate(
			(ms) =>
				new Promise<number[]>((done) => {
					const t: number[] = []
					let start = -1
					const tick = (now: number) => {
						if (start < 0) start = now
						t.push(now)
						if (now - start < ms) requestAnimationFrame(tick)
						else done(t)
					}
					requestAnimationFrame(tick)
				}),
			COST_MS,
		)
		const afterwards = await read()
		const d = (k: string) => (afterwards[k] ?? 0) - (before[k] ?? 0)
		const gaps = times.slice(1).map((t, i) => t - times[i])
		const sorted = [...gaps].sort((a, b) => a - b)
		const st = await pocketState()
		return {
			label,
			windowMs: COST_MS,
			wallMs: afterwards.Timestamp && before.Timestamp ? Math.round(d('Timestamp') * 1000) : null,
			taskMs: r1(d('TaskDuration') * 1000),
			scriptMs: r1(d('ScriptDuration') * 1000),
			layoutMs: r1(d('LayoutDuration') * 1000),
			recalcStyleMs: r1(d('RecalcStyleDuration') * 1000),
			layoutCount: d('LayoutCount'),
			recalcStyleCount: d('RecalcStyleCount'),
			frames: gaps.length,
			meanFrameMs: gaps.length ? r1(gaps.reduce((a, b) => a + b, 0) / gaps.length) : null,
			p95FrameMs: sorted.length ? r1(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]) : null,
			maxFrameMs: sorted.length ? r1(sorted[sorted.length - 1]) : null,
			over33: gaps.filter((g) => g > 33).length,
			over50: gaps.filter((g) => g > 50).length,
			pointer,
			view: st.view,
			stickers: st.keys.length,
		}
	}
	const costLine = (c: CostReport) => `${c.label}: task ${c.taskMs} ms, script ${c.scriptMs} ms, layout ${c.layoutCount}× (${c.layoutMs} ms), style ${c.recalcStyleCount}× (${c.recalcStyleMs} ms), ${c.frames} frames (mean ${c.meanFrameMs} ms, p95 ${c.p95FrameMs}, max ${c.maxFrameMs}), over 33 ms: ${c.over33}, over 50 ms: ${c.over50}`

	const step = async (id: string, name: string, fn: () => Promise<Record<string, unknown> | void>) => {
		log(`(${id}) ${name}`)
		try {
			const numbers = (await fn()) ?? undefined
			combo!.steps.push({ id, name, ok: true, numbers })
			log(numbers ? `    ok: ${JSON.stringify(numbers)}` : '    ok')
		} catch (e) {
			if (!(e instanceof BannerShows)) combo!.steps.push({ id, name, ok: false, detail: (e as Error).message })
			throw e
		}
	}

	/** Vodafone's accessibility button at a frame as at the start: its style attribute and computed place, and its box (less a change of the page's scrollbar, which moves every fixed thing). */
	const buttonAsAtStart = (m: Mascot | null, start: Furniture) => {
		if (!m || !start.button) return null
		if (!m.aw || !m.aw.box) return 'the button is gone'
		const b = start.button
		const startComputed = [b.computed.right, b.computed.bottom, b.computed['z-index'], b.computed.opacity, b.computed.visibility, b.computed.transform, b.computed.display].join('|')
		if (m.aw.style !== b.style) return `style attribute ${JSON.stringify(b.style)} → ${JSON.stringify(m.aw.style)}`
		if (m.aw.computed !== startComputed) return `computed ${startComputed} → ${m.aw.computed}`
		const shift = (start.scrollbar ?? 0) - m.scrollbar
		if (Math.abs(m.aw.box.left - (b.box[0] + shift)) > 1.5 || Math.abs(m.aw.box.top - b.box[1]) > 1.5) return `box ${JSON.stringify(b.box)} → ${fmt(m.aw.box)} (scrollbar ${start.scrollbar} → ${m.scrollbar})`
		return null
	}

	try {
		for (const c of combos) {
			const lang = c.path.startsWith('/ar/') ? 'ar' : 'en'
			key = `${lang}-${c.viewport.width}`
			combo = { name: key, path: c.path, viewport: c.viewport, steps: [], start: null, chips: null, cost: { baseline: null, album: null }, flight: null, album: null, close: null, portal: null, back: null }
			report.combos.push(combo)
			const url = `${base}${c.path}?aixc-debug`
			const W = c.viewport.width
			let start: Furniture | null = null
			let card: { id: string; href: string } | null = null
			log(`round ${key}: ${url} at ${W}×${c.viewport.height}`)

			await step('a', `open ${url} signed out (no sign-in) at ${W}×${c.viewport.height} and wait for the layer`, async () => {
				const vp = page.viewportSize()
				if (!vp || vp.width !== c.viewport.width || vp.height !== c.viewport.height) await page.setViewportSize(c.viewport)
				room()
				await pace()
				lastLoad = Date.now()
				const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 })
				recordLoad('open', url, res?.status() ?? null)
				await stopIfBlocked(res?.status() ?? null)
				await page.waitForLoadState('load', { timeout: 45_000 }).catch(() => {})
				await layerReady('a')
				report.userAgent ??= await page.evaluate(() => navigator.userAgent)
				const s = await pocketState()
				keysAtStart ??= s.keys
				return { status: res?.status() ?? null, stickersAlready: s.keys.length }
			})

			await step('b', 'before any press: no bot check, no error page, and no cookie banner showing', async () => {
				await stopIfBlocked(null)
				if (await bannerShows()) throw new BannerShows()
			})

			start = await furniture()
			combo.start = { button: start.button?.box ?? null, banner: start.banner ? { box: start.banner.box, display: start.banner.computed.display } : null, scrollbar: start.scrollbar, stickersAlready: (await pocketState()).keys.length }

			await step('1', 'the chips on the carousels: a sample every 300 ms for 6 s of each shown chip against its card; two screenshots', async () => {
				const where = await page.evaluate(async () => {
					const chipped = new Set([...document.querySelectorAll<HTMLElement>('.pocket-chips .pocket-cta[data-pocket-for]')].map((x) => x.dataset.pocketFor!))
					const outers = [...document.querySelectorAll<HTMLElement>('#main-content .owl-stage-outer')]
					const outer = outers.find((o) => [...o.querySelectorAll<HTMLElement>('[data-aixc-item]')].some((x) => !x.closest('.owl-item.cloned') && chipped.has(x.dataset.aixcItem!)))
					const target = outer ?? [...document.querySelectorAll<HTMLElement>('#main-content [data-aixc-item]')].find((x) => chipped.has(x.dataset.aixcItem!))
					target?.scrollIntoView({ block: 'center', inline: 'nearest' })
					await new Promise((done) => setTimeout(done, 800))
					return {
						owlCarousels: document.querySelectorAll('#main-content .owl-carousel').length,
						owlStages: outers.length,
						otherSliders: document.querySelectorAll('#main-content .slick-track, #main-content .swiper-wrapper').length,
						chips: chipped.size,
						scrolledTo: outer ? `the carousel ${outers.indexOf(outer) + 1} of ${outers.length}` : target ? 'a card with a chip' : 'nothing (no chip)',
						scrollY: Math.round(scrollY),
					}
				})
				const pointer = await parkPointer()
				const samples: (Awaited<ReturnType<typeof chipsNow>> & { t: number; moved: number })[] = []
				const shots: string[] = []
				const t0 = Date.now()
				let firstShotAt = -1
				for (let i = 0; i < CHIP_SAMPLES; i++) {
					const wait = t0 + i * CHIP_EVERY - Date.now()
					if (wait > 0) await sleep(wait)
					const read = await chipsNow()
					// Chipped cards whose left edge moved since the last sample, the page not scrolled between.
					const last = samples.at(-1)
					const moved = last && last.scrollY === read.scrollY ? Object.entries(read.cards).filter(([id, x]) => id in last.cards && Math.abs(last.cards[id] - x) > 1).length : 0
					const s = { ...read, t: Date.now() - t0, moved }
					samples.push(s)
					if (hooks.chipSample) await hooks.chipSample(page, i, c)
					const moving = s.transitions > 0 || s.moved > 0 || (!!last && last.stages.some((x, k) => x !== s.stages[k]))
					if (!shots.length && (moving || s.t >= 1800) && i < CHIP_SAMPLES - 1) {
						const shot = await shoot('chips-1')
						if (shot.file) shots.push(shot.file)
						firstShotAt = s.t
					} else if (shots.length === 1 && s.t >= Math.max(4200, firstShotAt + 2400)) {
						const shot = await shoot('chips-2')
						if (shot.file) shots.push(shot.file)
					}
				}
				const offs = samples.flatMap((s) => s.misplaced)
				const detached = samples.flatMap((s) => s.detached)
				const stageMoves = (samples[0]?.stages ?? []).map((_, k) => new Set(samples.map((s) => s.stages[k])).size > 1)
				const summary = {
					...where,
					pointer,
					samples: samples.length,
					spanMs: samples.at(-1)!.t,
					visibleMax: Math.max(0, ...samples.map((s) => s.visible)),
					inViewMax: Math.max(0, ...samples.map((s) => s.inView)),
					hiddenSamples: samples.filter((s) => s.rootHidden).length,
					misplaced: offs.length,
					misplacedChips: [...new Set(offs.map((x) => x.id))],
					worstMisplacedPx: Math.max(0, ...offs.map((x) => x.dev)),
					lagged: samples.reduce((n, s) => n + s.lagged.length, 0),
					detached: detached.length,
					detachedChips: [...new Map(detached.map((x) => [x.id, x.why])).entries()].map(([id, why]) => ({ id, why })),
					maxDeviationPx: Math.max(0, ...samples.map((s) => s.maxDev)),
					/** Samples with a CSS transition running in #main-content (Owl's stage moving). */
					transitionSamples: samples.filter((s) => s.transitions > 0).length,
					/** Samples in which some chipped card had moved since the one before. */
					cardMoveSamples: samples.filter((s) => s.moved > 0).length,
					stagesMoved: stageMoves.filter(Boolean).length,
					/** Vodafone's own looping CSS animations in #main-content (not motion of the cards). */
					loopingAnimations: Math.max(0, ...samples.map((s) => s.animations)),
					screenshots: shots,
					perSample: samples.map((s) => ({ t: s.t, visible: s.visible, inView: s.inView, transitions: s.transitions, animations: s.animations, moved: s.moved, stages: s.stages, scrollY: s.scrollY, misplaced: s.misplaced, lagged: s.lagged, detached: s.detached, maxDev: s.maxDev })),
				}
				combo!.chips = summary
				const moved = summary.transitionSamples > 0 || summary.cardMoveSamples > 0 || summary.stagesMoved > 0
				checkThat('chips-seen', summary.visibleMax > 0, `${summary.visibleMax} chips shown (${summary.inViewMax} in view) over ${summary.samples} samples in ${summary.spanMs} ms; ${moved ? `the carousels moved: a transition running in ${summary.transitionSamples} samples, cards moved in ${summary.cardMoveSamples}, ${summary.stagesMoved} of ${where.owlStages} Owl stages changed place` : 'no carousel moved in these 6 s (nothing to follow: the chips were only seen still)'}`)
				checkThat('chips', summary.misplaced === 0 && summary.detached === 0, `misplaced ${summary.misplaced} (${summary.misplacedChips.join(', ') || 'none'}; worst ${summary.worstMisplacedPx} px), detached ${summary.detached} (${summary.detachedChips.map((x) => `${x.id}: ${x.why}`).join('; ') || 'none'}), caught up within two frames ${summary.lagged}; in place within ${summary.maxDeviationPx} px`)
				return { samples: summary.samples, visibleMax: summary.visibleMax, misplaced: summary.misplaced, detached: summary.detached, lagged: summary.lagged, transitionSamples: summary.transitionSamples, cardMoveSamples: summary.cardMoveSamples, stagesMoved: summary.stagesMoved, screenshots: shots.length }
			})

			await step('5a', 'the baseline frame cost: the album closed, nothing pocketed by this run, the pointer still for 5 s', async () => {
				const cost = await frameCost('baseline')
				combo!.cost.baseline = cost
				log(`  ${costLine(cost)}`)
				return { taskMs: cost.taskMs, frames: cost.frames, over33: cost.over33 }
			})

			await step('2', 'hover a card and press its "Pocket it" chip: 10 screenshots 150 ms apart of the flight and the corner', async () => {
				const before = await pocketState()
				const found = await page.evaluate(async () => {
					const tick = () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(done, 80))))
					const items = new Map<string, any>(((window as any).__aixc.model?.sections ?? []).flatMap((s: any) => s.items.map((i: any) => [i.id, i])))
					const pocketed = new Set(((window as any).__aixc.demos.pocket.store.all() as any[]).map((r) => r.id))
					for (const chip of document.querySelectorAll<HTMLElement>('.pocket-chips .pocket-cta[data-pocket-for]')) {
						const id = chip.dataset.pocketFor!
						if (pocketed.has(id)) continue
						const href = items.get(id)?.cta?.href
						if (!href) continue
						const u = new URL(href, location.href)
						if (u.origin !== location.origin || u.pathname === location.pathname || !/^\/(en|ar)\//.test(u.pathname)) continue
						const el = [...document.querySelectorAll<HTMLElement>(`#main-content [data-aixc-item="${CSS.escape(id)}"]`)].find((x) => !x.closest('.owl-item.cloned'))
						if (!el) continue
						el.scrollIntoView({ block: 'center', inline: 'nearest' })
						await tick()
						const r = chip.getBoundingClientRect()
						const box = el.getBoundingClientRect()
						if (!r.width || !box.width) continue
						const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
						if (hit && (hit === chip || chip.contains(hit))) return { id, href: u.href, cardX: box.left + box.width / 2, cardY: box.top + Math.min(box.height / 2, 120) }
					}
					return null
				})
				if (!found) fail('2', 'no card whose chip a press reaches and whose link goes to another page of this site')
				card = { id: found!.id, href: found!.href }
				combo!.flight = { card, frames: [] }
				log(`  card ${card.id}, its link ${card.href}`)
				// Hovering the card pauses its carousel (Owl's autoplayHoverPause), so the chip stays put for the press.
				await page.mouse.move(found!.cardX, found!.cardY, { steps: 6 })
				await sleep(400)
				const chip = await page.evaluate((id) => {
					const chip = document.querySelector<HTMLElement>(`.pocket-chips .pocket-cta[data-pocket-for="${CSS.escape(id)}"]`)
					if (!chip) return null
					const r = chip.getBoundingClientRect()
					return { x: r.left + r.width / 2, y: r.top + r.height / 2, label: chip.getAttribute('aria-label') ?? chip.textContent?.trim() ?? '' }
				}, card.id)
				if (!chip) fail('2', 'the chip went away while the card was hovered')
				await page.mouse.move(chip!.x, chip!.y, { steps: 4 })
				const frames = await film('flight', 0, 1, FLIGHT.every, Date.now(), flightNow)
				dirty = true
				const pressedAt = Date.now()
				await press('2', chip!, `the chip "${chip!.label}"`, '.pocket-chips .pocket-cta[data-pocket-for]', { for: card.id })
				frames.push(...(await film('flight', 1, FLIGHT.frames - 1, FLIGHT.every, pressedAt, flightNow)))
				await page.waitForFunction((id) => ((window as any).__aixc.demos.pocket.store.all() as any[]).some((r) => r.id === id), card.id, { timeout: 8_000 }).catch(() => fail('2', 'the sticker was not kept in the Pocket'))
				const b = await pocketButton('2')
				frames.push(...(await film('flight', FLIGHT.frames, 1, 0, Date.now(), flightNow)))
				combo!.flight.frames = frames
				const expected = before.keys.length + 1
				checkThat('pocket-button', b.count === String(expected) && b.reached && b.left < b.innerWidth / 2 && b.bottomGap >= 0 && b.bottomGap < 200, `the Pocket button shows ${b.count} (${expected} expected), a press at its centre reaches ${b.reached ? 'it' : b.onTop}, at the bottom-left (left ${b.left}, ${b.bottomGap} px above the bottom)`)
				return { frames: frames.length, flewIn: frames.filter((f) => f.sample?.flying).length, count: b.count }
			})

			await step('3', 'open the album with the Pocket button: 14 screenshots 200 ms apart of the page turn and the mascot\'s ride, his box at each', async () => {
				const actors = await page.waitForSelector('#pocket-output[data-pocket-actor-ready]', { state: 'attached', timeout: 10_000 }).then(
					() => true,
					() => false,
				)
				checkThat('actors', actors, actors ? 'the mascot and the drone are on the page' : 'the actors did not come within 10 s of the save')
				const b = await pocketButton('3')
				const frames = await film('album', 0, 1, ALBUM.every, Date.now(), mascotNow)
				const pressedAt = Date.now()
				await press('3', b, 'the Pocket button', '.pocket-peek')
				frames.push(...(await film('album', 1, ALBUM.frames - 1, ALBUM.every, pressedAt, mascotNow)))
				await waitView('3', 'pocket')
				if (actors) {
					await page.waitForFunction(() => ['idle', 'tucked', 'flinching'].includes(document.querySelector<HTMLElement>('.pocket-mascot')?.dataset.mascotState ?? ''), null, { timeout: 8_000 }).catch(() => {})
					await sleep(900)
				}
				const rest = await mascotNow()
				const restShot = await shoot('album-rest')
				combo!.album = { frames, start: frames[0]?.sample ?? null, rest: { ...rest, file: restShot.file } }
				if (actors) {
					const startBox = frames[0]?.sample?.mover ?? null
					const shown = frames.filter((f) => f.sample?.visible && f.sample.mover && f.sample.state !== 'hidden')
					const xs = shown.map((f) => cx(f.sample!.mover!))
					const rode = frames.some((f) => f.sample?.state === 'riding')
					const home = rest?.mover ? cx(rest.mover) : null
					const from = startBox ? cx(startBox) : null
					const trace = shown.map((f) => `${f.t}:${f.sample!.state}:${Math.round(cx(f.sample!.mover!))}`).join(' ')
					if (lang === 'en') {
						const back = Math.max(0, ...xs.slice(1).map((x, i) => xs[i] - x))
						const ok = from !== null && home !== null && from < W / 3 && rode && back < 24 && home - from > W * 0.4
						checkThat('ride', ok, `from behind the button at ${from === null ? 'none' : Math.round(from)} to his place at ${home === null ? 'none' : Math.round(home)} (across ${from !== null && home !== null ? Math.round(home - from) : '?'} px of ${W}), ${rode ? 'riding' : 'no ride seen'}, back at most ${Math.round(back)} px; ${trace}`)
					} else {
						const ok = home !== null && home < W / 2 && xs.every((x) => x < W / 2)
						checkThat('ride', ok, `from behind the button at ${from === null ? 'none' : Math.round(from)} to his place at ${home === null ? 'none' : Math.round(home)} on the left half (of ${W}), ${rode ? 'a short ride' : 'no ride (his place is by the button)'}, never across the middle; ${trace}`)
					}
					const d = rest?.drawn
					const standProblems: string[] = []
					if (!rest || !d || !rest.inner) standProblems.push(`not drawn (${fmt(d)}, album ${fmt(rest?.inner)})`)
					else {
						if (!rest.visible) standProblems.push('not shown')
						if (rest.pointerEvents !== 'none') standProblems.push(`pointer-events ${rest.pointerEvents}`)
						if (Math.abs(d.bottom - rest.height) >= d.bottom - d.top) standProblems.push(`not at the viewport's bottom (${fmt(d)})`)
						if (rest.aw?.box && gap(d, rest.aw.box) < PAD - 0.5) standProblems.push(`${Math.round(gap(d, rest.aw.box))} px from Vodafone's accessibility button (${fmt(d)} vs ${fmt(rest.aw.box)})`)
						if (lang === 'en' ? cx(d) <= W / 2 : cx(d) >= W / 2) standProblems.push(`on the wrong half (${fmt(d)})`)
						if (!rest.covered) for (const x of rest.content) if (overlaps(d, x)) standProblems.push(`over the album's content (${fmt(d)} vs ${fmt(x)})`)
					}
					checkThat('stand', standProblems.length === 0, standProblems.length ? standProblems.join('; ') : `at rest on the ${lang === 'en' ? 'right' : 'left'}, ${fmt(d)}, ${rest?.aw?.box ? `${Math.round(gap(d!, rest.aw.box))} px from Vodafone's accessibility button` : 'no accessibility button on the page'}, takes no press`)
				}
				const touched = [...frames.map((f) => f.sample), rest].map((m) => buttonAsAtStart(m, start!)).filter(Boolean)
				const pressedMascot = frames.filter((f) => f.sample?.hit === 'mascot').length
				checkThat('button-album', touched.length === 0 && pressedMascot === 0, touched.length ? `Vodafone's accessibility button changed: ${touched.join('; ')}` : `Vodafone's accessibility button as at the start in all ${frames.length + 1} frames; a press never reaches the mascot`)
				return { frames: frames.length, turning: frames.filter((f) => f.sample?.busy).length, riding: frames.filter((f) => f.sample?.state === 'riding').length, rest: rest?.state ?? null, home: rest?.mover ? Math.round(cx(rest.mover)) : null }
			})

			await step('5b', 'the frame cost with the album open and the pointer still for 5 s', async () => {
				const cost = await frameCost('album')
				combo!.cost.album = cost
				log(`  ${costLine(cost)}`)
				const b = combo!.cost.baseline
				return { taskMs: cost.taskMs, frames: cost.frames, over33: cost.over33, taskVsBaseline: b && b.taskMs ? r1(cost.taskMs / b.taskMs) : null }
			})

			await step('3c', "close the album with its Back button: the dash back filmed, 200 ms apart, until he is hidden", async () => {
				const back = await backButton()
				const frames = await film('close', 0, 1, CLOSE.every, Date.now(), mascotNow)
				const pressedAt = Date.now()
				if (back) await press('3c', back, "the album's Back button", '#pocket-output .pocket-back')
				else {
					await beforePress()
					report.presses++
					log('  key: Escape (the Back button is not on screen)')
					await page.keyboard.press('Escape')
				}
				frames.push(...(await film('close', 1, CLOSE.frames - 1, CLOSE.every, pressedAt, mascotNow, (s, i) => i >= 3 && !!s && s.view === 'page' && !s.busy && (s.state === 'hidden' || s.state === null))))
				await waitView('3c', 'page')
				await page.waitForFunction(() => ['hidden', ''].includes(document.querySelector<HTMLElement>('.pocket-mascot')?.dataset.mascotState ?? ''), null, { timeout: 8_000 }).catch(() => {})
				await pocketButton('3c')
				const after = await mascotNow()
				combo!.close = { frames, after }
				const leaving = frames.filter((f) => f.sample?.visible && f.sample.mover && f.sample.state === 'leaving')
				const problems: string[] = []
				if (lang === 'en' && W >= 640) {
					if (leaving.length < 2) problems.push(`he rode back in ${leaving.length} frame(s)`)
					else if (cx(leaving.at(-1)!.sample!.mover!) >= cx(leaving[0].sample!.mover!)) problems.push('not toward the button')
				}
				if (after?.mover && after.state && after.state !== 'hidden') problems.push(`he is ${after.state}, not hidden`)
				if (after?.mover && after.peek && (cx(after.mover) < after.peek.left || cx(after.mover) > after.peek.right)) problems.push(`not behind the button (${fmt(after.mover)} vs ${fmt(after.peek)})`)
				if (combo!.album && combo!.album.rest?.state) checkThat('dash', problems.length === 0, problems.length ? problems.join('; ') : `back behind the button (${leaving.length} frames riding back: ${leaving.map((f) => Math.round(cx(f.sample!.mover!))).join(' ')})`)
				const touched = [...frames.map((f) => f.sample), after].map((m) => buttonAsAtStart(m, start!)).filter(Boolean)
				checkThat('button-close', touched.length === 0 && !frames.some((f) => f.sample?.hit === 'mascot'), touched.length ? `Vodafone's accessibility button changed: ${touched.join('; ')}` : "Vodafone's accessibility button as at the start while he went back; a press never reaches him")
				return { frames: frames.length, leaving: leaving.length, after: after?.state ?? null }
			})

			await step('4', "the portal: the album opened again, the sticker's link pressed; a screenshot every 250 ms until the navigation; then Back", async () => {
				const b = await pocketButton('4')
				await press('4', b, 'the Pocket button', '.pocket-peek')
				await waitView('4', 'pocket')
				const portalOn = await page.waitForSelector('style[data-aixc-css="pocket-portal"]', { state: 'attached', timeout: 10_000 }).then(
					() => true,
					() => false,
				)
				if (!portalOn) log("  (the portal's stylesheet is not on the page: the link may just navigate)")
				await sleep(1500)
				const link = await page.evaluate(async (href) => {
					const a = [...document.querySelectorAll<HTMLAnchorElement>('#pocket-output .pocket-sticker a[href]')].find((x) => x.href === href)
					if (!a) return null
					a.scrollIntoView({ block: 'center' })
					await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(done, 80))))
					const r = a.getBoundingClientRect()
					return { href: a.href, x: r.left + r.width / 2, y: r.top + r.height / 2 }
				}, card!.href)
				if (!link) fail('4', `the album does not show the sticker's link (${card!.href})`)
				const dest = link!.href.split('#')[0]
				destinations.add(dest)
				if (hooks.beforeDestination) await hooks.beforeDestination(page, dest)
				room()
				await pace()
				let navigatedAt: number | null = null
				const nav = page.waitForEvent('framenavigated', { predicate: (f) => f === page.mainFrame() && f.url().split('#')[0] === dest, timeout: 20_000 })
				nav.then(
					() => (navigatedAt ??= Date.now()),
					() => {},
				)
				const response = page.waitForResponse((r) => r.request().isNavigationRequest() && r.request().frame() === page.mainFrame() && r.url().split('#')[0] === dest, { timeout: 20_000 })
				response.catch(() => {})
				lastLoad = Date.now()
				const pressedAt = Date.now()
				await press('4', link!, `the sticker's link (${dest})`, '#pocket-output .pocket-sticker a[href]', { href: link!.href })
				const frames = await film('portal', 0, Math.ceil(PORTAL.maxMs / PORTAL.every), PORTAL.every, pressedAt, portalNow, () => navigatedAt !== null)
				await nav.catch(() => fail('4', `the press did not go to ${dest}`))
				await page.waitForLoadState('domcontentloaded', { timeout: 45_000 }).catch(() => {})
				const status = await response.then(
					(r) => r.status(),
					() => null,
				)
				recordLoad("the sticker's link", dest, status)
				await stopIfBlocked(status)
				const landed = await shoot('portal-destination')
				const states = [...new Set(frames.map((f) => f.sample?.state).filter(Boolean) as string[])]
				combo!.portal = { destination: dest, status, navigatedMs: navigatedAt !== null ? navigatedAt - pressedAt : null, states, frames }
				if (landed.file) frames.push({ i: frames.length, t: Date.now() - pressedAt, file: landed.file, shotMs: landed.ms, sample: null })
				checkThat('portal', navigatedAt !== null && frames.some((f) => (f.sample?.overlays ?? 0) > 0), `the transition ${frames.some((f) => (f.sample?.overlays ?? 0) > 0) ? `ran (${states.join(' → ') || 'no state read'})` : 'was not seen'}, this tab went to ${dest} ${navigatedAt !== null ? `${navigatedAt - pressedAt} ms after the press` : 'never'} (status ${status ?? 'none'}), ${frames.length} frames`)

				room()
				await pace()
				lastLoad = Date.now()
				const res = await page.goBack({ waitUntil: 'domcontentloaded', timeout: 45_000 })
				recordLoad('Back', page.url(), res?.status() ?? null)
				await stopIfBlocked(res?.status() ?? null)
				const backFrames = await film('back', 0, BACK.frames, BACK.every, Date.now(), albumNow)
				await page.waitForLoadState('load', { timeout: 45_000 }).catch(() => {})
				if (page.url().split('#')[0] !== url) fail('4', `Back is not on the page again (${page.url()})`)
				await layerReady('4')
				const s = await pocketState()
				const reopened = backFrames.some((f) => f.sample?.view === 'pocket') || s.view === 'pocket'
				combo!.back = { status: res?.status() ?? null, albumReopened: reopened, frames: backFrames }
				if (s.view === 'pocket') {
					await waitView('4', 'pocket')
					await closeAlbum('4')
				}
				return { navigatedMs: combo!.portal.navigatedMs, states: states.join(' → '), frames: frames.length, status, back: res?.status() ?? null, albumReopened: reopened }
			})

			await step('6', "compare: no [AIXC] error, no page error from the layer, Vodafone's button and banner as at the start, every element of the layer marked, the layer still ready", async () => {
				const errors = report.layerConsole.filter((l) => l.startsWith(`${key} error:`))
				const pageErrors = report.layerPageErrors.filter((l) => l.startsWith(`${key} `))
				// Read after any transition has settled (the button has `transition: all .25s`).
				await sleep(600)
				const diff = differences(start!, await furniture())
				const marks = await page.evaluate((sel) => {
					const all = [...document.querySelectorAll(sel)].filter((n) => !n.closest('#main-content [data-aixc-item], #main-content [data-aixc-section]') || n.closest('[data-aixc]'))
					const unmarked = all.filter((n) => !n.closest('[data-aixc]')).map((n) => `${n.localName}.${String(n.getAttribute('class') ?? '').split(' ')[0]}`)
					return { n: all.length, unmarked: [...new Set(unmarked)].slice(0, 10) }
				}, LAYER_SELECTOR)
				const state = await page.evaluate(() => (window as any).__aixc?.state ?? null)
				checkThat('compare', errors.length === 0 && pageErrors.length === 0 && diff.length === 0 && marks.unmarked.length === 0 && state === 'ready', [errors.length ? `[AIXC] errors: ${errors.join(' | ')}` : 'no [AIXC] error', pageErrors.length ? `page errors from the layer: ${pageErrors.join(' | ')}` : 'no page error from the layer', diff.length ? `Vodafone's button or banner changed: ${diff.join('; ')}` : "Vodafone's button and banner as at the start", marks.unmarked.length ? `unmarked: ${marks.unmarked.join(', ')}` : `all ${marks.n} elements of the layer marked`, `the layer is ${state}`].join('; '))
				return { layerElements: marks.n, warnings: report.layerConsole.filter((l) => l.startsWith(`${key} warning:`)).length }
			})

			await cleanUp(page, keysAtStart, report, log, key)
			dirty = false
			writeReport()
			log(`round ${key} done: ${report.checks.filter((x) => x.combo === key && !x.ok).length} failed check(s)`)
			// A pause between rounds, beyond the pacing of the loads.
			if (c !== combos.at(-1)) await sleep(pauseMs * 2)
		}
		const failed = report.checks.filter((x) => !x.ok)
		report.outcome = failed.length ? 'failed' : 'passed'
		report.message = failed.length ? `${failed.length} check(s) failed: ${failed.map((x) => `${x.combo} ${x.id}`).join(', ')}` : null
		log(`${report.outcome.toUpperCase()}: ${report.loads.length} page loads by this run (cap ${MAX_LOADS}); ${requestsLine(report)}; ${report.presses} presses, ${report.files.length} screenshots in ${out}${report.message ? `; ${report.message}` : ''}`)
		return report
	} catch (e) {
		if (e instanceof BannerShows) {
			report.outcome = 'skipped: banner'
			report.message = BANNER_MESSAGE
			combo?.steps.push({ id: 'b', name: 'the cookie banner shows: nothing more is pressed', ok: false, detail: 'skipped: banner' })
			log(`SKIPPED: ${BANNER_MESSAGE}`)
			return report
		}
		if (!(e instanceof MotionStop)) {
			report.outcome = 'failed'
			report.message = (e as Error).message
			log(`FAILED: ${report.message}`)
			if (!(e instanceof MotionFailure)) throw new MotionFailure((e as Error).message, report)
		}
		throw e
	} finally {
		page.off('console', onConsole)
		page.off('pageerror', onPageError)
		page.off('request', onRequest)
		page.off('requestfailed', onRequestFailed)
		if (dirty) await cleanUp(page, keysAtStart, report, log, key)
		// (Set inside the helpers above, so the compiler does not see it change here.)
		await (cdp as CDPSession | null)?.detach().catch(() => {})
		writeReport()
	}
}

/** The requests for pages in words: in all, the portal's fetches, the pages' own reloads. */
export const requestsLine = (r: MotionReport) => {
	const fetches = r.pageRequests.filter((x) => x.type !== 'document').length
	const reloads = r.pageRequests.filter((x) => x.reload)
	return `${r.pageRequests.length} requests for pages in all (cap ${MAX_PAGE_REQUESTS}): ${r.pageRequests.length - fetches - reloads.length} documents for the run's loads, ${fetches} fetches by the portal, ${reloads.length} reload(s) by the page itself${reloads.length ? ` (${[...new Set(reloads.map((x) => x.url))].join(', ')})` : ''}`
}

/**
 * The layer's own records this run made, removed: the stickers it added (through the Pocket's store when
 * the layer runs here, else straight from the Pocket's own IndexedDB database, aixc-v1, and only when that
 * database already exists: opening a missing one would make it). Nothing of Vodafone's is touched.
 */
async function cleanUp(page: Page, keep: string[] | null, report: MotionReport, log: (line: string) => void, key: string) {
	if (keep === null) return
	try {
		const removed = await page.evaluate(async (keep) => {
			const p = (window as any).__aixc?.demos?.pocket
			if (p?.store) {
				const gone = (p.store.all() as any[]).map((r) => r.key as string).filter((k) => !keep.includes(k))
				for (const k of gone) await p.store.remove(k)
				return { via: 'the Pocket store', n: gone.length }
			}
			const known = (await indexedDB.databases?.().catch(() => [])) ?? []
			if (!known.some((d) => d.name === 'aixc-v1')) return { via: 'nothing (no Pocket database here)', n: 0 }
			const db = await new Promise<IDBDatabase | null>((done) => {
				const r = indexedDB.open('aixc-v1')
				r.onsuccess = () => done(r.result)
				r.onerror = () => done(null)
			})
			if (!db || !db.objectStoreNames.contains('pocket')) {
				db?.close()
				return { via: 'nothing (no Pocket store here)', n: 0 }
			}
			const keys = await new Promise<string[]>((done) => {
				const r = db.transaction('pocket').objectStore('pocket').getAllKeys()
				r.onsuccess = () => done((r.result as string[]).filter((k) => !keep.includes(k)))
				r.onerror = () => done([])
			})
			await new Promise<void>((done) => {
				const tx = db.transaction('pocket', 'readwrite')
				for (const k of keys) tx.objectStore('pocket').delete(k)
				tx.oncomplete = () => done()
				tx.onerror = () => done()
			})
			db.close()
			return { via: "the Pocket's own IndexedDB database", n: keys.length }
		}, keep)
		report.cleanup.push(`${key}: removed ${removed.n} sticker(s) this run added, through ${removed.via}`)
	} catch (e) {
		report.cleanup.push(`${key}: the stickers could not be removed: ${(e as Error).message}`)
	}
	log(`clean-up: ${report.cleanup.at(-1)}`)
}

/* ---------------------------------------------------------------- the live test */

/** True when node runs this file itself (not when the rehearsal imports the flow). */
const MAIN = (() => {
	try {
		return !!process.argv[1] && fs.realpathSync(path.resolve(process.argv[1])) === fs.realpathSync(fileURLToPath(import.meta.url))
	} catch {
		return false
	}
})()

/** VG_LIVE_OUT (or the system's temporary directory) / motion-<time>; never inside the repository. */
export function liveOut(env: NodeJS.ProcessEnv = process.env, now = new Date()) {
	const parent = path.resolve(env.VG_LIVE_OUT || os.tmpdir())
	const repo = path.dirname(ROOT)
	const inside = (dir: string, root: string) => {
		const rel = path.relative(root, dir)
		return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
	}
	// Through symbolic links too, from the nearest folder that exists: checked before anything is made.
	let existing = parent
	while (!fs.existsSync(existing)) existing = path.dirname(existing)
	const real = path.join(fs.realpathSync(existing), path.relative(existing, parent))
	if (inside(parent, repo) || inside(real, fs.realpathSync(repo))) throw new Error(`VG_LIVE_OUT must be outside the repository (${parent} is inside ${repo})`)
	fs.mkdirSync(parent, { recursive: true })
	return path.join(parent, `motion-${now.toISOString().replace(/[:.]/g, '-')}`)
}

if (MAIN) {
	const LIVE = process.env.VG_LIVE === '1'
	const PORT = 4464
	const WEB = 'https://web.vodafone.com.eg'
	/** The demo's own browser (Google Chrome, visible, the demo profile) instead of Playwright's headless Chromium. */
	const CHROME = process.env.VG_LIVE_BROWSER === 'chrome'

	let services: Awaited<ReturnType<typeof createServices>>
	let gateway: ReturnType<typeof createGateway>
	let browser: DemoBrowser

	before(async () => {
		if (!LIVE) return
		await buildSdk({ minify: true })
		const platform = loadPlatformConfig({ ...process.env, VG_VOICETUT_URL: '', VG_STORE: 'memory', VG_PORT: String(PORT), VG_PUBLIC_URL: `http://127.0.0.1:${PORT}` })
		const site = loadSiteConfig(path.join(platform.sitesDir, 'vodafone-eg.yaml'))
		services = await createServices({ platform, sites: new Map([[site.id, site]]) })
		const m = JSON.parse(fs.readFileSync(path.join(ROOT, 'config/kb/vodafone-eg.manifest.json'), 'utf8')) as Manifest
		await services.store.putKbVersion(site.id, m)
		await services.store.activateKb(site.id, m.version.id)
		gateway = createGateway({ services })
		await gateway.listen(PORT)
		const profileDir = CHROME ? (process.env.VG_LIVE_PROFILE ? path.resolve(process.env.VG_LIVE_PROFILE) : path.join(platform.dataDir, 'demo-profile')) : undefined
		browser = await launchDemoBrowser({ site, gatewayUrl: `http://127.0.0.1:${PORT}`, start: 'about:blank', profileDir, headless: !CHROME, channel: CHROME ? 'chrome' : 'chromium', xray: 'off', viewport: DESKTOP })
	})

	after(async () => {
		await browser?.close()
		await gateway?.close()
		await services?.close()
	})

	const print = (r: MotionReport) => {
		for (const c of r.combos) {
			const ch = c.chips
			const b = c.cost.baseline
			const a = c.cost.album
			console.log(`# ${c.name}: chips ${ch ? `${ch.samples} samples, ${ch.visibleMax} shown, misplaced ${ch.misplaced}, detached ${ch.detached}, lagged ${ch.lagged}, moving in ${ch.transitionSamples} samples (cards moved in ${ch.cardMoveSamples})` : '-'}; flight ${c.flight?.frames.length ?? 0} frames; album ${c.album?.frames.length ?? 0} frames (rest ${c.album?.rest?.state ?? '-'}); close ${c.close?.frames.length ?? 0}; portal ${c.portal ? `${c.portal.frames.length} frames, ${c.portal.navigatedMs} ms, ${c.portal.states.join(' → ')}` : '-'}; cost baseline ${b ? `${b.taskMs} ms task, ${b.over33}/${b.frames} frames over 33 ms` : '-'}, album ${a ? `${a.taskMs} ms task, ${a.over33}/${a.frames} frames over 33 ms` : '-'}`)
		}
		console.log(`# ${r.loads.length} page loads by this run; ${requestsLine(r)}`)
		console.log(`# report: ${JSON.stringify({ outcome: r.outcome, message: r.message, out: r.out, loads: r.loads.map((l) => `${l.combo} ${l.how} ${l.status}`), pageRequests: r.pageRequests.map((x) => `${x.combo} ${x.type}${x.reload ? ' (its own reload)' : ''} ${x.url}${x.failure ? ` failed: ${x.failure}` : ''}`), presses: r.presses, failedChecks: r.checks.filter((c) => !c.ok), cleanup: r.cleanup })}`)
	}

	test('live: motion on /en/services and /ar/services at 1366×900 then 375×812: chips on moving carousels, the flight, the page turn and the ride, the portal, the frame cost', { skip: !LIVE && 'set VG_LIVE=1', timeout: 900_000 }, async (t) => {
		const out = liveOut()
		console.log(`# writing the screenshots and motion-report.json to ${out}`)
		const report = await runMotion(browser.page, { base: WEB, out, log: (line) => console.log(`# ${line}`) }).catch((e) => {
			if (e?.report) print(e.report)
			throw e
		})
		print(report)
		if (report.outcome === 'skipped: banner') return t.skip(`skipped: banner. ${report.message}`)
		assert.deepEqual(
			report.checks.filter((c) => !c.ok),
			[],
			'every check passed',
		)
		assert.equal(report.outcome, 'passed')
		assert.ok(report.loads.length <= MAX_LOADS, `at most ${MAX_LOADS} page loads (${report.loads.length})`)
	})
}
