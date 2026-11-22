/**
 * The floating-control matrix on Vodafone's real pages (live plan §3.7; phase 3, S16's matrix taken live;
 * ADR-0050, ADR-0052, ADR-0064, ADR-0065): one run, `runFloatingMatrix(options)`, that the live test
 * (./floating.live.test.ts, run by the lead on the real web.vodafone.com.eg in the installed Google Chrome)
 * and the offline rehearsal on the saved pages (../e2e/floating-live-rehearsal.e2e.test.ts) both call, so
 * the walk is proven without touching the site. It measures with S16's module (../e2e/floating-controls.ts:
 * measureControls, hitsAt, cellViolations and its rules a to h) and adds what only real pages
 * have: Vodafone's other floaters, the real banner's own z-index, and a screenshot of every cell.
 *
 * Two passes, in this order (PLAN; 20 page loads, never more than MAX_LOADS = 24):
 *  - main (the demo profile, where a person has answered the cookie banner): on /en/services and
 *    /ar/services the states S1 on load, S2 a card pocketed by a press on its chip (the Pocket peeking), S5
 *    the guide listening (its transcript bar and keyboard button; then stopped with the mic's own press), S3
 *    the album open (the mascot and the drone at rest), S4 "Your journey" open in the album (the trail's
 *    consent is ours: when its card shows it is measured as a cell of its own, then allowed); on /en/home
 *    S1 and S2 only. Then S7, the reimagined view (phase 4c; ADR-0076; design §4), on the same load, no page
 *    load of its own: on /en/services (static theme) the composer from the launcher, spotlight's view with the
 *    Pocket peeking, the guide listening over it, the composer over the view from "Change experience", canvas's
 *    and streaming's previews open in the box, and Vodafone's menu over the view (a hover on its navigation's
 *    dropdown at 1366, a press on its burger at 375, never a second one: that menu is left open and the page's
 *    next load closes it), then Original (at 1366); on /en/home (maintheme) the composer, the
 *    view and the menu. Each page at 1366×900, then each at 375×812 (page.setViewportSize on the same Chrome:
 *    a narrowed desktop window, not a phone; the report says how it differs);
 *  - banner (a throwaway profile, where OneTrust's banner shows): S1 only, on /en/services and /ar/services
 *    at both sizes, and no press at all.
 * Each page is opened with ?aixc=off first, Vodafone's page alone: ?aixc=off stops only the experience
 * layer, so for that one load every request whose path starts with /__vg/ is refused (page.route, removed
 * right after the baseline is read): neither the guide (guide.js, its mic and the trail's pill) nor the
 * layer (aixc.js) nor any call to the gateway runs. The accessibility button's box, style attribute and
 * computed style there are rule (d)'s baseline, once per page, size and pass (and a screenshot of it); a
 * baseline with anything of ours on it is a violation, since rule (d) would then compare ours with ours.
 *
 * Every page with the layer: the gate's reading (coverage, sections, the launcher's decision; report.gates).
 * Every cell: the corners' safe zones as a person meets them (their controls and sizes) and, in a view, the
 * zones the shell wrote on the box against the same zones measured here (cell.view); in S7, S7's rules
 * (../e2e/floating-controls.ts viewViolations, menuHits). And S16's measure, what a press at the points of each control reaches, the violations of rules a
 * to g, every fixed or sticky element of Vodafone's that is not the banner or the accessibility widget
 * (a chat launcher, an app banner, a pinned header) with its box, the rule that none of our controls
 * overlaps one and that a press at one never reaches ours, with the banner its own z-index (nothing of ours
 * at or above it), and a screenshot of the viewport (CSS pixels; caret 'initial' and animations allowed, so
 * Playwright adds no style to the page). The report, all boxes and hits included, is written as JSON to
 * `out` (a directory outside the repository; refused inside it) after every page.
 *
 * Safe by construction (AGENTS.md §4 rules 1, 2, 5 and 6):
 *  - public pages, signed out; nothing is typed; a press is only ever one of PRESS_TARGETS (our chips, the
 *    Pocket button, the guide's mic, the trail's pill and its consent card's allow, the journey's allow and
 *    close, the album's Back; in S7 Reimagine's launcher, a template, the view bar's "Change experience" and
 *    "Original", a canvas card's and a streaming card's preview button and their close, each a button inside
 *    no link at all) or, in S7 only, Vodafone's burger to open its phone menu, once per page (on a wide screen its
 *    dropdown is opened by a hover, no press; report.vodafone lists each), found inside one of our roots and not inside a link of Vodafone's, after an
 *    elementFromPoint hit test that reaches it (again after the pointer has moved there), and never while
 *    OneTrust's banner shows: the main pass then stops and says 'skipped: banner'; the banner pass refuses
 *    every press;
 *  - at most MAX_LOADS page loads in the whole run, at least `pauseMs` (1.2 s by default, never under 1 s)
 *    apart; a 403, 429 or 503, a challenge page ("Access denied", "Just a moment", a captcha marker), any
 *    other 4xx or 5xx, a page that does not open, and any page load this run did not start itself stop the
 *    run at once; nothing is ever retried;
 *  - OneTrust's banner (#onetrust-banner-sdk, #onetrust-consent-sdk) is never answered, closed, hidden or
 *    touched; nothing of Vodafone's (cookies, storage, the widget) is written;
 *  - the microphone is a silent stand-in (getUserMedia answers with a silent Web Audio stream) and speech
 *    recognition and synthesis are the tests' stand-ins: nothing listens to the room, nothing is spoken
 *    aloud, nothing goes to a speech service;
 *  - last, on every page and always: the layer's own records this run made there are removed (the stickers
 *    it added; the trail's journey and consent, only where this run gave the consent).
 */
import fs from 'node:fs'
import path from 'node:path'

import type { Page, Route } from 'playwright'

import { ROOT } from '#shared/config.ts'

import { type Box, cellHits, cellViolations, cornersLine, fmt, type GateReading, gateOf, gateViolations, type Hit, hitsAt, type Measure, measureControls, MENU_CLOSED, MENU_OPEN, menuHits, OT_Z, OVERLAP_EXCEPTIONS, overlaps, points, reachableOpener, readView, S7, S7_TEMPLATE, shownControls, templateInView, underMenu, type ViewExpect, type ViewReading, viewViolations, vodafoneMenuTarget } from '../e2e/floating-controls.ts'

/* eslint-disable @typescript-eslint/no-explicit-any */

/** The hard cap on page loads in one run (the plan makes 20). */
export const MAX_LOADS = 24
export const BANNER_MESSAGE = "The cookie banner is showing in the demo profile. Answer it yourself in that browser window (this test never does), then run the test again. The main pass stopped there and pressed nothing more; the banner pass ran as planned."

export interface Viewport {
	width: number
	height: number
}
export const DESKTOP: Viewport = { width: 1366, height: 900 }
export const PHONE: Viewport = { width: 375, height: 812 }
const vpName = (v: Viewport) => `${v.width}x${v.height}`

export interface Plan {
	/**
	 * The demo profile: each page at each size; `full` walks S5, S3 and S4 after S1 and S2; `reimagine` then walks S7
	 * on the same load ('full': the composer, the view with the Pocket peeking, the guide listening, the composer over
	 * the view, canvas's and streaming's previews, Vodafone's menu over the view; 'short': the composer, the view and
	 * the menu).
	 */
	main: { viewports: Viewport[]; pages: { pathname: string; full: boolean; reimagine?: 'full' | 'short' }[] } | null
	/** A throwaway profile, the banner showing: S1 only. */
	banner: { viewports: Viewport[]; pages: string[] } | null
}

export const PLAN: Plan = {
	main: {
		viewports: [DESKTOP, PHONE],
		pages: [
			{ pathname: '/en/services', full: true, reimagine: 'full' },
			{ pathname: '/ar/services', full: true },
			{ pathname: '/en/home', full: false, reimagine: 'short' },
		],
	},
	banner: { viewports: [DESKTOP, PHONE], pages: ['/en/services', '/ar/services'] },
}

/** Two loads per page and size (?aixc=off, then the layer); S7 adds none (it walks on the layer's load). */
export const plannedLoads = (p: Plan) => (p.main ? p.main.viewports.length * p.main.pages.length * 2 : 0) + (p.banner ? p.banner.viewports.length * p.banner.pages.length * 2 : 0)

/**
 * The microphone, stood in at the edge (AGENTS.md 5.3), as floating-controls-live does: getUserMedia answers
 * with a silent stream from Web Audio, so pressing the guide's mic reaches 'listening' and no microphone opens.
 */
export const MIC_STAND_IN = `(() => {
	if (!navigator.mediaDevices) return
	navigator.mediaDevices.getUserMedia = async () => {
		const ctx = new AudioContext()
		const osc = ctx.createOscillator()
		const gain = ctx.createGain()
		gain.gain.value = 0
		const dest = ctx.createMediaStreamDestination()
		osc.connect(gain).connect(dest)
		osc.start()
		return dest.stream
	}
})()`

/** Seeded randomness and no dozing while the matrix looks (pocket-actors.js reads it once at start-up; it moves nothing). */
export const ACTORS_TEST = `window.__POCKET_ACTORS_TEST__ = { seed: 7, timing: { sleepAt: 600000 } }`

/**
 * One of our controls this run may press: found by `selector` (in the guide's shadow root where `inGuide`), or by
 * `byId` with `%s` the card's or template's id; `button`: it must be a <button> inside no link at all (S7's: the
 * view's cards lead to Vodafone's pages, so nothing in a link of ours is pressed either).
 */
export interface PressTarget {
	name: string
	inGuide: boolean
	selector: string
	byId?: string
	button?: boolean
}

/**
 * Everything this run may press: our own controls only. Each is found by its selector (in the guide's shadow
 * root where `inGuide`), must sit inside one of our roots (data-aixc, data-vg, the guide's shadow root) and
 * outside any link of Vodafone's, and a hit test at its centre must reach it. Vodafone's menu is opened apart
 * (openMenu: a hover on a wide screen, a press on its burger on a narrow one), the only thing of Vodafone's S7 touches.
 */
export const PRESS_TARGETS = {
	chip: { name: 'a "Pocket it" chip', inGuide: false, selector: '.pocket-chips .pocket-cta', byId: '.pocket-chips .pocket-cta[data-pocket-for="%s"]' },
	pocket: { name: 'the Pocket button', inGuide: false, selector: '.pocket-peek[data-state="shown"]' },
	mic: { name: "the guide's mic", inGuide: true, selector: '.vg-mic' },
	pill: { name: "the trail's pill", inGuide: true, selector: '.tr-pill' },
	trailAllow: { name: "allow, in the trail's own consent card", inGuide: true, selector: '.tr-card:not([hidden]) .tr-allow' },
	journeyAllow: { name: "allow, in the journey's consent (the trail's)", inGuide: false, selector: '#pocket-journey-layer[data-mode="consent"]:not([hidden]) .pocket-journey-consent__actions > button.pocket-back--solid' },
	journeyClose: { name: "the journey's close", inGuide: false, selector: '#pocket-journey-layer:not([hidden]) button.pocket-journey-close' },
	albumBack: { name: "the album's Back", inGuide: false, selector: '#pocket-output:not([hidden]) .pocket-view__start > button.pocket-back:not(.pocket-journey-cta)' },
	// S7 (phase 4c): Reimagine's own controls.
	launcher: { name: "Reimagine's launcher", inGuide: false, selector: '.aixc-launcher', button: true },
	template: { name: 'a template in the composer', inGuide: false, selector: '.aixc-composer:not([hidden]) .aixc-template', byId: '.aixc-composer:not([hidden]) .aixc-template[data-template="%s"]', button: true },
	change: { name: 'the view bar\'s "Change experience"', inGuide: false, selector: '.aixc-viewbar .aixc-text-btn[aria-controls="aixc-composer"]', button: true },
	original: { name: 'the view bar\'s "Original"', inGuide: false, selector: '.aixc-viewbar .aixc-seg[data-view="original"]', button: true },
	canvasCard: { name: "a canvas card (its preview)", inGuide: false, selector: '.aixc-box .cv-card', byId: '.aixc-box .cv-card[data-aixc-item="%s"]', button: true },
	canvasClose: { name: "the canvas preview's close", inGuide: false, selector: '.aixc-box .cv-dialog[open] .cv-dialog__close', button: true },
	streamingCard: { name: "a streaming card's More info (its preview)", inGuide: false, selector: '.aixc-box .st-card .st-card__open', byId: '.aixc-box .st-card[data-aixc-item="%s"] .st-card__open', button: true },
	streamingClose: { name: "the streaming preview's close", inGuide: false, selector: '.aixc-box .st-modal[open] .st-modal__close', button: true },
} as const satisfies Record<string, PressTarget>
export type Target = keyof typeof PRESS_TARGETS

export interface FloatingBrowser {
	page: Page
	close(): Promise<void>
}

export interface CellInfo {
	pass: 'main' | 'banner'
	pathname: string
	viewport: string
	state: string
}

export interface FloatingHooks {
	/**
	 * After each page has loaded: time for what only the live site has (OneTrust's SDK arrives late, the
	 * accessibility widget is Angular's). Default: up to `settleMs` for both, then until their boxes hold still.
	 */
	settle?(page: Page): Promise<void>
	/** Just before each cell is measured (the rehearsal proves the rules and the guards can fail). */
	beforeMeasure?(page: Page, cell: CellInfo): Promise<void>
}

export interface FloatingOptions {
	/** The origin, for example https://web.vodafone.com.eg */
	base: string
	/** Where the screenshots and the JSON go: outside the repository. */
	out: string
	/** At least this long between two page loads. Default 1200 ms, never under 1000. */
	pauseMs?: number
	/** How long the default settle waits for the banner's SDK and the accessibility widget. Default 5000 ms. */
	settleMs?: number
	/** How long the banner pass waits for the banner to show. Default 10000 ms. */
	bannerWaitMs?: number
	log?(line: string): void
	hooks?: FloatingHooks
	plan?: Plan
	/** The main pass's browser: the demo profile (the banner answered). */
	openMain(): Promise<FloatingBrowser>
	/** The banner pass's browser: a throwaway profile (the banner shows). */
	openBanner(): Promise<FloatingBrowser>
}

export interface Floater {
	what: string
	position: string
	z: string
	box: Box | null
	shown: boolean
	/** A sticky element held at its top or bottom offset while the page is scrolled (a fixed one always floats). */
	stuck: boolean
	/** Over half the viewport: a wrapper or an overlay, listed but not held to the overlap rule. */
	large: boolean
	pointerEvents: string
	inShadow: boolean
	/** What a press at its centre reaches: 'self', 'ours:…', 'banner', 'filter', 'accessibility' or 'vodafone:…'. */
	reaches: string | null
}

export interface Cell {
	n: number
	pass: 'main' | 'banner'
	page: string
	lang: string
	viewport: string
	banner: 'absent' | 'present'
	state: string
	measure: Measure
	hits: Record<string, Hit[]>
	bannerHits?: { banner: Hit[]; ours: Record<string, Hit[]> }
	/** With the banner: OneTrust's full-page filter shows ('filter': everything of ours must be under it), or not ('no filter': our points inside the banner must reach it). */
	bannerMode: 'filter' | 'no filter' | null
	floaters: Floater[]
	violations: string[]
	notes: string[]
	screenshot: string | null
	/** Reimagine's view, the corners' zones (their sizes, a view or not), an open preview, Vodafone's open menu (S7). */
	view: ViewReading | null
	/** With Vodafone's menu open (S7): what a press at its points reaches. */
	menuHits: Record<string, Hit[]> | null
}

export interface Baseline {
	pass: 'main' | 'banner'
	page: string
	viewport: string
	banner: boolean
	button: Measure['button']
	floaters: Floater[]
	screenshot: string | null
	/** Requests to /__vg/ refused for this load (the guide's and the layer's scripts, calls to the gateway). */
	blocked: number
	/** Anything of ours found on the baseline page (none: it is Vodafone's page alone). */
	ours: string[]
}

export interface Environment {
	pass: 'main' | 'banner'
	viewport: string
	innerWidth: number
	innerHeight: number
	clientWidth: number
	scrollbar: number
	dpr: number
	hoverNone: boolean
	pointerCoarse: boolean
	touchPoints: number
	mobileUA: boolean
}

export interface FloatingReport {
	base: string
	out: string
	startedAt: string
	ms: number
	outcome: 'passed' | 'violations' | 'stopped' | 'failed'
	main: 'done' | 'skipped: banner' | 'not run'
	banner: 'done' | 'not run'
	message: string | null
	plannedLoads: number
	loads: { pass: string; url: string; status: number | null; at: number; how: string }[]
	presses: { pass: string; what: string; at: number }[]
	/** Vodafone's controls this run touched, only ever to open and close its menu over a view (S7): a hover or a press. */
	vodafone: { pass: string; what: string; how: 'hover' | 'press'; at: number }[]
	/** The gate on every page the layer was loaded on (coverage, sections, the launcher's decision): ADR-0076 §4, O29. */
	gates: ({ pass: string; page: string; viewport: string } & GateReading)[]
	cells: Cell[]
	baselines: Baseline[]
	environments: Environment[]
	violations: string[]
	notes: string[]
	layerConsole: string[]
	layerPageErrors: string[]
	cleanup: string[]
	exceptions: typeof OVERLAP_EXCEPTIONS
}

/** The run stopped on purpose (a bot check, an error page, a page load it did not start); the report says why. */
export class FloatingStop extends Error {
	readonly report: FloatingReport
	constructor(message: string, report: FloatingReport) {
		super(message)
		this.name = 'FloatingStop'
		this.report = report
	}
}

/** Something broke the run itself (not a rule: those are the report's violations). */
export class FloatingFailure extends Error {
	readonly report: FloatingReport
	constructor(message: string, report: FloatingReport) {
		super(message)
		this.name = 'FloatingFailure'
		this.report = report
	}
}

class BannerShows extends Error {}
/** One state of one page could not be reached: recorded as a violation; the walk goes on with the next page. */
class StateFailed extends Error {}

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms))

/* The guard, as tests/live/pocket-smoke.ts has it (copied, not imported). */
/** What a challenge page has (Cloudflare's interstitial, PerimeterX, reCAPTCHA, hCaptcha). Cloudflare's passive /scripts/jsd/ on ordinary pages is not one. */
const CHALLENGE_MARKERS = '#challenge-form, #challenge-running, #cf-challenge-running, #challenge-stage, iframe[src*="challenges.cloudflare.com"], script[src*="/cdn-cgi/challenge-platform/h/"], #px-captcha, iframe[src*="captcha"], .g-recaptcha, .h-captcha'
const BOT_WORDS = /access denied|attention required|just a moment|captcha|verify (that )?you are (a )?human|checking your browser|pardon our interruption|request unsuccessful|are you a robot/i
const ERROR_WORDS = /page not found|\b404\b|\b50[0-4]\b|server error|service unavailable/i

/** `dir`, absolute and created, when it is outside the repository (the real paths compared too); throws inside it. */
export function outsideRepo(dir: string): string {
	const abs = path.resolve(dir)
	const repo = path.resolve(ROOT, '..')
	const real = (p: string) => {
		let at = p
		const rest: string[] = []
		while (!fs.existsSync(at) && path.dirname(at) !== at) {
			rest.unshift(path.basename(at))
			at = path.dirname(at)
		}
		try {
			return path.join(fs.realpathSync(at), ...rest)
		} catch {
			return p
		}
	}
	const inside = (p: string, root: string) => p === root || p.startsWith(root + path.sep)
	if (inside(abs, repo) || inside(real(abs), real(repo))) throw new Error(`the output directory must be outside the repository (${abs} is inside ${repo})`)
	fs.mkdirSync(abs, { recursive: true })
	return abs
}

const slug = (s: string) =>
	s
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '')
		.slice(0, 60)

export async function runFloatingMatrix(o: FloatingOptions): Promise<FloatingReport> {
	const plan = o.plan ?? PLAN
	const planned = plannedLoads(plan)
	if (planned > MAX_LOADS) throw new Error(`the plan makes ${planned} page loads, more than ${MAX_LOADS}`)
	const base = o.base.replace(/\/$/, '')
	const out = outsideRepo(o.out)
	const pauseMs = Math.max(1000, o.pauseMs ?? 1200)
	const settleMs = o.settleMs ?? 5000
	const bannerWaitMs = o.bannerWaitMs ?? 10_000
	const log = o.log ?? ((line: string) => console.log(`# ${line}`))
	const hooks = o.hooks ?? {}
	const t0 = Date.now()
	const report: FloatingReport = { base, out, startedAt: new Date(t0).toISOString(), ms: 0, outcome: 'failed', main: 'not run', banner: 'not run', message: null, plannedLoads: planned, loads: [], presses: [], vodafone: [], gates: [], cells: [], baselines: [], environments: [], violations: [], notes: [], layerConsole: [], layerPageErrors: [], cleanup: [], exceptions: OVERLAP_EXCEPTIONS }
	const jsonFile = path.join(out, 'floating-live.json')
	const write = () => {
		report.ms = Date.now() - t0
		fs.writeFileSync(jsonFile, JSON.stringify(report, null, 2))
	}

	let pass: 'main' | 'banner' = 'main'
	let lastLoad = 0
	/** A page load is under way that this run started (page.goto): any other main-frame navigation stops the run. */
	let expecting = false
	const unexpected: string[] = []

	const stop = (message: string): never => {
		report.outcome = 'stopped'
		report.message = message
		log(`STOPPED: ${message}`)
		throw new FloatingStop(message, report)
	}
	const violation = (line: string) => {
		report.violations.push(line)
		log(`  VIOLATION ${line}`)
	}
	const note = (line: string) => {
		report.notes.push(line)
		log(`  note: ${line}`)
	}

	const watchPage = (page: Page) => {
		page.on('console', (m) => {
			if (m.text().startsWith('[AIXC]')) report.layerConsole.push(`${m.type()}: ${page.url()} ${m.text()}`)
		})
		page.on('pageerror', (e) => {
			if (/\/__vg\/sdk\/aixc\//.test(`${e.message} ${e.stack ?? ''}`)) report.layerPageErrors.push(`${page.url()} ${e.message}`)
		})
		page.on('request', (r) => {
			let main = false
			try {
				main = r.isNavigationRequest() && r.frame() === page.mainFrame()
			} catch {}
			if (main && !expecting) unexpected.push(r.url())
		})
	}
	/** A page load this run did not start (a press that reached a link, a redirect of the page's own): counted, and the run stops. */
	const checkUnexpected = () => {
		if (!unexpected.length) return
		for (const url of unexpected.splice(0)) report.loads.push({ pass, url, status: null, at: Date.now(), how: 'not started by this run' })
		stop(`the page loaded ${report.loads.at(-1)!.url}, which this run did not start: the run stops here and nothing is retried (runbook §0).`)
	}

	const pace = async () => {
		const wait = lastLoad + pauseMs - Date.now()
		if (wait > 0) await sleep(wait)
	}
	const room = () => {
		if (report.loads.length >= MAX_LOADS) stop(`this run would load more than ${MAX_LOADS} pages`)
	}

	/** Stops on a bot check or an error page (runbook §0: never retried, never worked around). */
	const stopIfBlocked = async (page: Page, status: number | null) => {
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

	/** One page load: paced, counted, capped, checked; never retried. */
	const load = async (page: Page, pathname: string, query: string, how: string) => {
		const url = `${base}${pathname}${query}`
		checkUnexpected()
		room()
		await pace()
		expecting = true
		lastLoad = Date.now()
		let status: number | null = null
		try {
			const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 })
			status = res?.status() ?? null
		} catch (e) {
			report.loads.push({ pass, url, status: null, at: lastLoad, how })
			stop(`${url} did not open (${(e as Error).message.split('\n')[0]}). The run stops; nothing is retried (runbook §0).`)
		} finally {
			// From the response on, a main-frame navigation is the page's own (a script's redirect): not this load.
			expecting = false
		}
		report.loads.push({ pass, url, status, at: lastLoad, how })
		log(`page load ${report.loads.length} of at most ${MAX_LOADS} (${pass}, ${how}): ${url} answered ${status ?? 'from memory (no response)'}`)
		await stopIfBlocked(page, status)
		await page.waitForLoadState('load', { timeout: 45_000 }).catch(() => {})
		checkUnexpected()
		await stopIfBlocked(page, null)
	}

	const bannerShows = (page: Page) =>
		page.evaluate(() => {
			const b = document.getElementById('onetrust-banner-sdk')
			if (!b) return false
			const s = getComputedStyle(b)
			const r = b.getBoundingClientRect()
			return s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity) > 0 && r.width > 0 && r.height > 0
		})

	/** The boxes of the accessibility button and the banner, until they hold still (the button has a transition, the banner slides in). */
	const stillBoxes = async (page: Page, ms = 4000) => {
		const read = () =>
			page.evaluate(() =>
				['vodafone-aw-icon', 'onetrust-banner-sdk']
					.map((id) => {
						const n = document.getElementById(id)
						if (!n) return '-'
						const r = n.getBoundingClientRect()
						return [r.left, r.top, r.width, r.height].map((v) => Math.round(v)).join(',')
					})
					.join(' '),
			)
		const end = Date.now() + ms
		let last = await read()
		let same = 0
		while (Date.now() < end && same < 2) {
			await sleep(200)
			const now = await read()
			same = now === last ? same + 1 : 0
			last = now
		}
	}

	const defaultSettle = async (page: Page) => {
		const end = Date.now() + settleMs
		while (Date.now() < end) {
			const there = await page.evaluate(() => ({ ot: !!document.getElementById('onetrust-consent-sdk'), aw: !!document.getElementById('vodafone-aw-icon') }))
			if (there.ot && there.aw) break
			await sleep(250)
		}
		await sleep(500)
		await stillBoxes(page)
	}
	const settle = (page: Page) => (hooks.settle ? hooks.settle(page) : defaultSettle(page))
	/** The banner pass: up to `bannerWaitMs` for OneTrust's banner to show, then until it holds still. */
	const settleBanner = async (page: Page) => {
		await settle(page)
		const end = Date.now() + bannerWaitMs
		while (Date.now() < end && !(await bannerShows(page))) await sleep(250)
		await stillBoxes(page)
	}

	const frames = (page: Page, ms = 60) => page.evaluate((ms) => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(done, ms)))), ms)

	const loaderThere = (page: Page) =>
		page.waitForFunction(() => !!document.querySelector('script[data-vg-loader]'), null, { timeout: 30_000 }).catch(() => {
			throw new StateFailed('the demo browser did not add its loader to the page')
		})

	/** The layer is ready on this page (with ?aixc-debug), its Pocket and store too where `pocket`. */
	const layerReady = async (page: Page, pocket: boolean) => {
		await loaderThere(page)
		await page.waitForFunction(() => (window as any).__aixc && (window as any).__aixc.state !== 'starting', null, { timeout: 30_000 }).catch(() => {
			throw new StateFailed('the layer did not start (no window.__aixc with ?aixc-debug)')
		})
		const state = await page.evaluate(() => ({ state: (window as any).__aixc.state as string, problem: (window as any).__aixc.problem as string | null }))
		if (state.state !== 'ready') throw new StateFailed(`the layer is '${state.state}'${state.problem ? `: ${state.problem}` : ''}, not ready`)
		const chips = await page
			.waitForFunction(() => (window as any).__aixc?.demos?.pocket?.chips, null, { timeout: pocket ? 30_000 : 15_000 })
			.then(() => true)
			.catch(() => false)
		if (pocket && !chips) throw new StateFailed('the Pocket did not start on the page (no chips)')
		if (chips) await page.evaluate(() => (window as any).__aixc.demos.pocket.store.ready)
	}

	const pocketState = (page: Page) =>
		page.evaluate(() => {
			const p = (window as any).__aixc?.demos?.pocket
			return { view: (p?.state?.view ?? null) as string | null, busy: !!p?.state?.busy, keys: ((p?.store?.all() ?? []) as any[]).map((r) => r.key as string), ids: ((p?.store?.all() ?? []) as any[]).map((r) => r.id as string) }
		})

	/**
	 * Where a press on `target` would land: the element (one of ours, not in a link of Vodafone's), its
	 * centre and whether a hit test there reaches it (through the guide's shadow root).
	 */
	const locate = (page: Page, target: Target, id: string | null) =>
		page.evaluate(
			({ selector, byId, inGuide, id }) => {
				const guide = document.querySelector('vg-guide')?.shadowRoot ?? null
				const root: ParentNode | null = inGuide ? guide : document
				const sel = id === null ? selector : byId.replace('%s', CSS.escape(id))
				const el = root ? root.querySelector<HTMLElement>(sel) : null
				if (!el) return { found: false as const }
				const ours = (!!guide && el.getRootNode() === guide) || !!el.closest('[data-aixc], [data-vg]')
				const link = el.closest('a[href]')
				const inVodafoneLink = !!link && !link.closest('[data-aixc], [data-vg]') && el.getRootNode() === document
				const plainButton = el.localName === 'button' && !link
				const r = el.getBoundingClientRect()
				const vw = document.documentElement.clientWidth || innerWidth
				const x = r.left + r.width / 2
				const y = r.top + r.height / 2
				const shown = r.width > 0 && r.height > 0 && x >= 0 && y >= 0 && x < vw && y < innerHeight
				let hit: Element | null = shown ? document.elementFromPoint(x, y) : null
				while (hit && hit.shadowRoot) {
					const inner = hit.shadowRoot.elementFromPoint(x, y)
					if (!inner || inner === hit) break
					hit = inner
				}
				const reached = !!hit && (hit === el || el.contains(hit))
				const onTop = hit ? `${hit.localName}${hit.id ? '#' + hit.id : ''}.${String(hit.getAttribute('class') ?? '').split(' ')[0]}` : 'nothing'
				const label = (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60)
				return { found: true as const, ours, inVodafoneLink, plainButton, shown, x, y, reached, onTop, label }
			},
			{ selector: PRESS_TARGETS[target].selector, byId: (PRESS_TARGETS[target] as PressTarget).byId ?? '', inGuide: PRESS_TARGETS[target].inGuide, id },
		)

	/** The only way this run presses anything: one of our controls, hit-tested, never while the banner shows. */
	const press = async (page: Page, target: Target, id: string | null = null): Promise<{ ok: true } | { ok: false; why: string }> => {
		const t: PressTarget = PRESS_TARGETS[target]
		const name = t.name
		if (pass === 'banner') throw new Error(`refused: the banner pass never presses (${name})`)
		if (t.byId ? id === null : id !== null) throw new Error(`refused: ${name} with ${id === null ? 'no card' : 'a card'}`)
		const at = await locate(page, target, id)
		if (!at.found) return { ok: false, why: `there is no ${name} on the page` }
		if (!at.ours) return { ok: false, why: `refused: ${name} is not inside one of our roots` }
		if (at.inVodafoneLink) return { ok: false, why: `refused: ${name} is inside a link of Vodafone's` }
		if (t.button && !at.plainButton) return { ok: false, why: `refused: ${name} is not a button outside every link` }
		if (!at.shown) return { ok: false, why: `${name} is not on the screen` }
		if (!at.reached) return { ok: false, why: `a press at ${name}'s centre (${Math.round(at.x)},${Math.round(at.y)}) would reach ${at.onTop}` }
		if (await bannerShows(page)) throw new BannerShows()
		await stopIfBlocked(page, null)
		await page.mouse.move(at.x, at.y, { steps: 4 })
		// Again with the pointer there: a hover can open something of Vodafone's over it.
		const again = await locate(page, target, id)
		if (!again.found || !again.shown || !again.reached || Math.hypot(again.x - at.x, again.y - at.y) > 3) return { ok: false, why: `with the pointer on ${name}, a press there would reach ${again.found ? again.onTop : 'nothing'}` }
		if (await bannerShows(page)) throw new BannerShows()
		report.presses.push({ pass, what: `${name}${again.label ? ` "${again.label}"` : ''}`, at: Date.now() })
		log(`  press: ${name}${again.label ? ` "${again.label}"` : ''}`)
		await page.mouse.click(again.x, again.y)
		await sleep(80)
		checkUnexpected()
		return { ok: true }
	}
	const mustPress = async (page: Page, target: Target, id: string | null = null) => {
		const r = await press(page, target, id)
		if (!r.ok) throw new StateFailed(r.why)
	}

	/** Every fixed or sticky element that is not ours, not the banner and not the accessibility widget (through open shadow roots). */
	const floatersOf = (page: Page): Promise<Floater[]> =>
		page.evaluate(() => {
			const vw = document.documentElement.clientWidth || innerWidth
			const vh = innerHeight
			const parentOf = (n: Element): Element | null => n.parentElement || ((n.parentNode as ShadowRoot | null)?.host ?? null)
			const skip = (n: Element) => {
				for (let p: Element | null = n; p; p = parentOf(p)) {
					if (p.matches('[data-aixc], [data-vg], vg-guide, #onetrust-consent-sdk, #onetrust-banner-sdk, #onetrust-pc-sdk, .onetrust-pc-dark-filter, accessibility-widget, #vodafone-aw-icon')) return true
				}
				return false
			}
			const name = (n: Element) => `${n.localName}${n.id ? '#' + n.id : ''}${typeof (n as HTMLElement).className === 'string' && (n as HTMLElement).className.trim() ? '.' + (n as HTMLElement).className.trim().split(/\s+/).slice(0, 3).join('.') : ''}`
			const reach = (x: number, y: number, self: Element) => {
				let hit: Element | null = document.elementFromPoint(x, y)
				while (hit && hit.shadowRoot) {
					const inner = hit.shadowRoot.elementFromPoint(x, y)
					if (!inner || inner === hit) break
					hit = inner
				}
				if (!hit) return 'nothing'
				if (hit === self || self.contains(hit)) return 'self'
				let p: Element | null = hit
				for (; p; p = parentOf(p)) {
					if (p.matches('accessibility-widget, #vodafone-aw-icon')) return 'accessibility'
					if (p.matches('#onetrust-banner-sdk')) return 'banner'
					if (p.matches('.onetrust-pc-dark-filter')) return 'filter'
					if (p.matches('[data-aixc], [data-vg], vg-guide')) return `ours:${hit.localName}.${String(hit.getAttribute('class') ?? '').split(' ')[0]}`
				}
				return `vodafone:${name(hit)}`
			}
			const out: Floater[] = []
			const walk = (root: Document | ShadowRoot, inShadow: boolean) => {
				for (const n of root.querySelectorAll('*')) {
					if (n.shadowRoot && n.localName !== 'vg-guide') walk(n.shadowRoot, true)
					const s = getComputedStyle(n)
					if (s.position !== 'fixed' && s.position !== 'sticky') continue
					if (skip(n)) continue
					let hidden = false
					let op = 1
					for (let p: Element | null = n; p; p = parentOf(p)) {
						const ps = getComputedStyle(p)
						if ((p as HTMLElement).hidden || ps.display === 'none') hidden = true
						op *= Number(ps.opacity)
					}
					const r = n.getBoundingClientRect()
					const has = n.getClientRects().length > 0 && r.width > 0 && r.height > 0
					const box = has ? { left: Math.round(r.left * 10) / 10, top: Math.round(r.top * 10) / 10, right: Math.round(r.right * 10) / 10, bottom: Math.round(r.bottom * 10) / 10 } : null
					const onScreen = !!box && box.right > 0 && box.bottom > 0 && box.left < vw && box.top < vh
					const shown = onScreen && !hidden && s.visibility !== 'hidden' && op > 0.05
					const top = parseFloat(s.top)
					const bottom = parseFloat(s.bottom)
					const stuck = s.position === 'sticky' && !!box && ((Number.isFinite(top) && scrollY > 0 && Math.abs(r.top - top) < 1.5) || (Number.isFinite(bottom) && Math.abs(vh - r.bottom - bottom) < 1.5))
					const vis = box ? Math.max(0, Math.min(box.right, vw) - Math.max(box.left, 0)) * Math.max(0, Math.min(box.bottom, vh) - Math.max(box.top, 0)) : 0
					const large = vis > 0.5 * vw * vh
					const floats = s.position === 'fixed' || stuck
					out.push({ what: name(n), position: s.position, z: s.zIndex, box, shown, stuck, large, pointerEvents: s.pointerEvents, inShadow, reaches: shown && floats && !large && s.pointerEvents !== 'none' && box ? reach(Math.min(vw - 1, Math.max(0, (box.left + box.right) / 2)), Math.min(vh - 1, Math.max(0, (box.top + box.bottom) / 2)), n) : null })
				}
			}
			walk(document, false)
			return out
		})

	/** Our elements whose own z-index is at or above `z` (the real banner's, when it is under OneTrust's usual 2147483645). */
	const oursAtOrAbove = (page: Page, z: number) =>
		page.evaluate((z) => {
			const root = document.querySelector('vg-guide')?.shadowRoot
			const all = [...document.querySelectorAll('[data-aixc], [data-vg], vg-guide'), ...(root ? root.querySelectorAll('*') : [])]
			const out: { what: string; z: number }[] = []
			for (const n of all) {
				const v = Number(getComputedStyle(n).zIndex)
				if (Number.isFinite(v) && v >= z) out.push({ what: n.localName + (typeof (n as HTMLElement).className === 'string' && (n as HTMLElement).className ? '.' + (n as HTMLElement).className.split(' ')[0] : ''), z: v })
			}
			return out
		}, z)

	/**
	 * Rule (c) and (e)'s hits. With the banner and OneTrust's full-page filter, S16's: the points of everything
	 * of ours reach the banner or the filter. With the banner and no filter (OneTrust shows one only with its
	 * dark overlay), only our points that fall inside the banner must reach it: the rest of the page is free.
	 */
	const hitContext = async (page: Page, m: Measure) => {
		const base = await cellHits(page, m)
		if (!base.bannerHits || !m.controls.banner?.box) return { ...base, bannerMode: null as Cell['bannerMode'] }
		if (m.filter?.shown) return { ...base, bannerMode: 'filter' as const }
		const bb = m.controls.banner.box
		const inside = (p: [number, number]) => p[0] > bb.left && p[0] < bb.right && p[1] > bb.top && p[1] < bb.bottom
		const ours: Record<string, Hit[]> = {}
		const add = async (name: string, b: Box) => {
			const pts = points(b).filter(inside)
			if (pts.length) ours[name] = await hitsAt(page, pts)
		}
		for (const [n, c] of shownControls(m)) if (c.owner !== 'vodafone') await add(n, c.box)
		for (const [i, b] of m.chips.slice(0, 4).entries()) await add(`chip ${i}`, b)
		if (m.mascot) await add('mascot', m.mascot)
		if (m.drone) await add('drone', m.drone)
		return { hits: base.hits, bannerHits: { banner: base.bannerHits.banner, ours }, bannerMode: 'no filter' as const }
	}

	const shoot = async (page: Page, name: string) => {
		const file = `${String(report.cells.length + report.baselines.length + 1).padStart(2, '0')}-${slug(name)}.png`
		try {
			// CSS pixels, the viewport only; caret 'initial' and animations 'allow' so nothing is added to the page.
			await page.screenshot({ path: path.join(out, file), scale: 'css', fullPage: false, caret: 'initial', animations: 'allow', timeout: 20_000 })
			return file
		} catch (e) {
			note(`no screenshot for ${name}: ${(e as Error).message.split('\n')[0]}`)
			return null
		}
	}

	const environment = async (page: Page, vp: Viewport) => {
		if (report.environments.some((e) => e.pass === pass && e.viewport === vpName(vp))) return
		const env = await page.evaluate(() => ({ innerWidth, innerHeight, clientWidth: document.documentElement.clientWidth, scrollbar: innerWidth - document.documentElement.clientWidth, dpr: devicePixelRatio, hoverNone: matchMedia('(hover: none)').matches, pointerCoarse: matchMedia('(pointer: coarse)').matches, touchPoints: navigator.maxTouchPoints, mobileUA: /Mobi|Android|iPhone/i.test(navigator.userAgent) }))
		report.environments.push({ pass, viewport: vpName(vp), ...env })
		if (vp.width < 640) {
			const differs = [!env.hoverNone && 'hover is available (a phone has none)', !env.pointerCoarse && 'the pointer is fine (a phone\'s is coarse)', env.touchPoints === 0 && 'no touch points', !env.mobileUA && "a desktop browser's user agent (Vodafone's server and scripts see a desktop)", env.scrollbar > 0 && `a ${env.scrollbar} px scrollbar takes width (the page is ${env.clientWidth} px wide; a phone's scrollbar overlays)`, env.dpr === 1 && 'device pixel ratio 1 (a phone has 2 or 3)'].filter(Boolean)
			note(`${pass} ${vpName(vp)}: a narrowed desktop window, not a phone: ${differs.join('; ') || 'no difference measured'}`)
		}
	}

	interface PageCtx {
		pathname: string
		vp: Viewport
		where: string
		off: Measure['button']
	}

	/**
	 * One cell: measured, hit-tested, held to the rules, its floaters listed, photographed, written. Every cell reads
	 * the corners' zones and Reimagine's view (readView); an S7 cell (`expect`) is held to S7's rules too, and with
	 * Vodafone's menu open, our points under the menu are its (underMenu) and its points are held (menuHits).
	 */
	const take = async (page: Page, ctx: PageCtx, state: string, expect?: ViewExpect) => {
		checkUnexpected()
		await stopIfBlocked(page, null)
		const info: CellInfo = { pass, pathname: ctx.pathname, viewport: vpName(ctx.vp), state }
		if (hooks.beforeMeasure) {
			await hooks.beforeMeasure(page, info)
			checkUnexpected()
		}
		const m = await measureControls(page, state)
		const view = await readView(page).catch(() => null)
		const h0 = await hitContext(page, m)
		const under = view && expect?.menu ? underMenu(h0.hits, view) : { hits: h0.hits, notes: [] as string[] }
		const h = { ...h0, hits: under.hits }
		const v = cellViolations(m, { where: ctx.where, off: ctx.off, hits: h.hits, bannerHits: h.bannerHits })
		const notes: string[] = [...under.notes]
		const w = `${ctx.where} ${state}`
		if (!view) notes.push('skipped: the view and the corners could not be read')
		let menu: Record<string, Hit[]> | null = null
		// An S7 cell is held to S7's rules; one whose view could not be read is a violation (viewViolations), never a pass.
		if (expect) {
			const s7 = viewViolations(ctx.where, view, m, expect)
			v.push(...s7.violations)
			notes.push(...s7.notes)
			if (view && expect.menu) {
				const mh = await menuHits(page, ctx.where, view)
				v.push(...mh.violations)
				notes.push(...mh.notes)
				menu = mh.hits
			}
		}
		// Readings that could not be taken are said (their rules did not see them): the curl's painted part, the fonts.
		if (m.curlSkipped) notes.push(`skipped: ${m.curlSkipped} (rule (a) did not see the curl)`)
		if (m.fontsSkipped) notes.push(`skipped: ${m.fontsSkipped} (rule (h) did not see our words)`)
		const floaters = await floatersOf(page)
		// Vodafone's other floaters: none of our controls (nor the mascot or the drone) over one, and a press at one reaches it, never ours.
		const ours: [string, Box][] = shownControls(m)
			.filter(([, c]) => c.owner !== 'vodafone')
			.map(([n, c]) => [n, c.box] as [string, Box])
		if (m.mascot) ours.push(['mascot', m.mascot])
		if (m.drone) ours.push(['drone', m.drone])
		for (const f of floaters) {
			if (!f.shown || !f.box) continue
			const floats = f.position === 'fixed' || f.stuck
			for (const [n, b] of ours) {
				if (!overlaps(b, f.box)) continue
				if (floats && !f.large) v.push(`${w}: (floaters) ${n} ${fmt(b)} overlaps Vodafone's ${f.position} ${f.what} ${fmt(f.box)}`)
				else notes.push(`${n} ${fmt(b)} overlaps Vodafone's ${f.large ? 'large ' : ''}${f.position}${f.position === 'sticky' && !f.stuck ? ' (not stuck: in the flow)' : ''} ${f.what} ${fmt(f.box)}`)
			}
			if (f.reaches?.startsWith('ours:')) v.push(`${w}: (floaters) a press at Vodafone's ${f.position} ${f.what} ${fmt(f.box)} reaches ${f.reaches}`)
		}
		// With the banner: nothing of ours at or above its own z-index (rule c holds OneTrust's usual 2147483645).
		if (m.controls.banner?.shown) {
			const zs = [m.controls.banner.stackZ, m.filter?.shown ? m.filter.stackZ : 0].filter((z) => z > 0)
			if (!zs.length) notes.push('the banner has no z-index of its own: the z rule is S16\'s (c) only')
			else {
				const z = Math.min(...zs)
				notes.push(`the banner's z-index ${m.controls.banner.z} (stack ${m.controls.banner.stackZ})${m.filter ? `, its filter ${m.filter.shown ? 'shows' : 'does not show'} (stack ${m.filter.stackZ})` : ', no filter'}`)
				if (z < OT_Z) {
					for (const a of await oursAtOrAbove(page, z)) v.push(`${w}: (c) ${a.what} has z-index ${a.z}, at or above the banner's own ${z}`)
					for (const [n, c] of shownControls(m)) if (c.owner !== 'vodafone' && c.stackZ >= z) v.push(`${w}: (c) ${n} stacks at ${c.stackZ}, at or above the banner's own ${z}`)
				}
			}
		}
		const screenshot = await shoot(page, `${pass} ${ctx.pathname} ${vpName(ctx.vp)} ${state}`)
		const cell: Cell = { n: report.cells.length + 1, pass, page: ctx.pathname, lang: ctx.pathname.slice(1, 3), viewport: vpName(ctx.vp), banner: m.controls.banner?.shown ? 'present' : 'absent', state, measure: m, hits: h.hits, bannerHits: h.bannerHits, bannerMode: h.bannerMode, floaters, violations: v, notes, screenshot, view, menuHits: menu }
		report.cells.push(cell)
		for (const line of v) violation(line)
		const shownNames = shownControls(m).map(([n]) => n)
		const vf = floaters.filter((f) => f.shown).map((f) => `${f.what} ${fmt(f.box)}`)
		const curl = m.curl.filter((c) => c.shown).map((c) => `${c.what} ${fmt(c.box)}`)
		const drone = m.droneState ? (m.drone ? `drone ${fmt(m.drone)}` : `drone not shown (${m.droneState.why})`) : 'no drone'
		const faces = [...new Set(m.fonts.flatMap((f) => f.fonts.map((x) => `${x.familyName}${x.isCustomFont ? '' : ' (system)'}`)))]
		log(`  cell ${cell.n} ${w}: ${v.length ? `${v.length} violation(s)` : 'ok'}; shown ${shownNames.join(', ')}; Vodafone's floaters ${vf.join(' | ') || 'none'}; curl ${curl.join(' | ') || 'none painted'}; ${drone}; our words in ${faces.join(', ') || 'no font read'}; corners ${view ? cornersLine(view) : 'not read'}${view?.menu.open ? `; Vodafone's menu open (${view.menu.boxes.map((b) => `${b.what} ${fmt(b.box)}`).join(' | ') || 'nothing of it on the screen'})` : ''}${screenshot ? `; ${screenshot}` : ''}`)
		return m
	}

	/**
	 * For the ?aixc=off load only: every request whose path starts with /__vg/ is refused, so the page is
	 * Vodafone's alone (the loader's script tag stays; what it would fetch never comes). `done()` removes it.
	 */
	const vodafoneOnly = async (page: Page) => {
		let blocked = 0
		const ours = (u: URL) => u.pathname.startsWith('/__vg/')
		const refuse = (route: Route) => {
			blocked++
			return route.abort('blockedbyclient').catch(() => {})
		}
		await page.route(ours, refuse)
		return { blocked: () => blocked, done: () => page.unroute(ours, refuse).catch(() => {}) }
	}

	/** What of ours is on the page (nothing, on a baseline). */
	const oursOnPage = (page: Page) =>
		page.evaluate(() => {
			const found: string[] = []
			if (document.querySelector('vg-guide')) found.push('the guide (vg-guide)')
			const aixc = document.querySelectorAll('[data-aixc]').length
			if (aixc) found.push(`${aixc} element(s) of the layer ([data-aixc])`)
			const vg = document.querySelectorAll('[data-vg]').length
			if (vg) found.push(`${vg} element(s) [data-vg]`)
			if ((window as any).__aixc) found.push('the layer (window.__aixc)')
			if ((window as any).voiceGuide) found.push('the guide (window.voiceGuide)')
			return found
		})

	const baseline = async (page: Page, ctx: PageCtx, banner: boolean, blocked: number) => {
		const m = await measureControls(page, 'off')
		const floaters = await floatersOf(page)
		const ours = await oursOnPage(page)
		const screenshot = await shoot(page, `${pass} ${ctx.pathname} ${vpName(ctx.vp)} baseline aixc-off`)
		report.baselines.push({ pass, page: ctx.pathname, viewport: vpName(ctx.vp), banner, button: m.button, floaters, screenshot, blocked, ours })
		if (!m.button) violation(`${ctx.where}: (d) no accessibility button with ?aixc=off (Vodafone's widget did not load): rule (d) is unchecked here`)
		if (ours.length) violation(`${ctx.where}: (d) the ?aixc=off baseline is not Vodafone's page alone (${ours.join(', ')}): rule (d) would compare ours with ours`)
		if (!blocked) note(`${ctx.where}: the ?aixc=off load asked for nothing under /__vg/ (the loader did not run?)`)
		log(`  baseline ?aixc=off, Vodafone's page alone (${blocked} request(s) to /__vg/ refused${ours.length ? `; still of ours: ${ours.join(', ')}` : ''}): the accessibility button ${m.button ? JSON.stringify(m.button.box) : 'absent'}; the banner ${m.controls.banner?.shown ? fmt(m.controls.banner.box) : 'not showing'}`)
		return m.button
	}

	/** Brings a chipped card into view (the window scrolls; no inner scroller is touched), hovers it and presses its chip. */
	const pocketOne = async (page: Page, keysBefore: string[]) => {
		const passedOver: string[] = []
		for (let attempt = 0; attempt < 3; attempt++) {
			const found = await page.evaluate(async (tried) => {
				const tick = () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(done, 80))))
				const vw = document.documentElement.clientWidth || innerWidth
				const pocketed = new Set(((window as any).__aixc.demos.pocket.store.all() as any[]).map((r) => r.id))
				const skipped: string[] = []
				for (const chip of document.querySelectorAll<HTMLElement>('.pocket-chips .pocket-cta[data-pocket-for]')) {
					const id = chip.dataset.pocketFor!
					if (pocketed.has(id) || tried.includes(id)) continue
					const card = [...document.querySelectorAll<HTMLElement>(`#main-content [data-aixc-item="${CSS.escape(id)}"]`)].find((c) => !c.closest('.owl-item.cloned'))
					if (!card) continue
					let c = card.getBoundingClientRect()
					if (!c.width || !c.height || c.left < 0 || c.right > vw) continue
					window.scrollTo({ top: Math.max(0, scrollY + c.top + Math.min(c.height, 240) / 2 - innerHeight / 2), behavior: 'instant' })
					await tick()
					c = card.getBoundingClientRect()
					const r = chip.getBoundingClientRect()
					if (!r.width || !r.height) continue
					const x = r.left + r.width / 2
					const y = r.top + r.height / 2
					let hit: Element | null = document.elementFromPoint(x, y)
					while (hit && hit.shadowRoot) {
						const inner = hit.shadowRoot.elementFromPoint(x, y)
						if (!inner || inner === hit) break
						hit = inner
					}
					if (hit && (hit === chip || chip.contains(hit))) return { id, cardX: c.left + c.width / 2, cardY: c.top + Math.min(c.height / 2, 120), skipped }
					skipped.push(`${id} [${[r.left, r.top, r.right, r.bottom].map(Math.round).join(',')}] under ${hit ? hit.localName + '.' + String(hit.getAttribute('class') || '').split(' ')[0] : 'nothing'}`)
				}
				return { id: null, cardX: 0, cardY: 0, skipped }
			}, passedOver.map((x) => x.split(' ')[0]))
			passedOver.push(...found.skipped)
			if (!found.id) break
			await page.mouse.move(found.cardX, found.cardY, { steps: 6 })
			await sleep(400)
			const r = await press(page, 'chip', found.id)
			if (!r.ok) {
				passedOver.push(`${found.id} (${r.why})`)
				continue
			}
			await page.waitForFunction((id) => ((window as any).__aixc.demos.pocket.store.all() as any[]).some((r) => r.id === id), found.id, { timeout: 8_000 }).catch(() => {
				throw new StateFailed(`${found.id} was not kept in the Pocket after the press on its chip`)
			})
			await page.waitForSelector('.pocket-peek[data-state="shown"]', { timeout: 8_000 }).catch(() => {
				throw new StateFailed('the Pocket button did not show after pocketing')
			})
			await page.waitForFunction(() => document.querySelectorAll('.curl-host--flying').length === 0, null, { timeout: 10_000 }).catch(() => {})
			await page.waitForFunction(() => ['hidden', null, undefined].includes(document.querySelector<HTMLElement>('.pocket-mascot')?.dataset.mascotState as any), null, { timeout: 8_000 }).catch(() => {})
			await frames(page, 900)
			const s = await pocketState(page)
			if (s.keys.length !== keysBefore.length + 1) note(`the Pocket holds ${s.keys.length} stickers after one was pocketed (${keysBefore.length} before)`)
			return { id: found.id, passedOver }
		}
		throw new StateFailed(`no chip a press reaches (${passedOver.join('; ') || 'no chipped card on the screen'})`)
	}

	const waitView = (page: Page, view: 'page' | 'pocket', what: string) =>
		page
			.waitForFunction(
				(view) => {
					const s = (window as any).__aixc?.demos?.pocket?.state
					return s?.view === view && !s.busy && (view === 'page' || !document.getElementById('pocket-output')?.hidden)
				},
				view,
				{ timeout: 15_000 },
			)
			.catch(() => {
				throw new StateFailed(what)
			})

	/**
	 * The album at rest: the mascot standing (or tucked), the drone up. Under 640 px there is no drone by
	 * design; at 640 px and wider it is waited for (up to 10 s), and one that never comes out is left to the
	 * cell's rule (f) ('the drone did not show in the album'), not passed as at rest.
	 */
	const albumAtRest = async (page: Page) => {
		await waitView(page, 'pocket', 'the album did not open')
		await page.waitForFunction(() => ['idle', 'tucked', 'flinching'].includes(document.querySelector<HTMLElement>('.pocket-mascot')?.dataset.mascotState ?? ''), null, { timeout: 10_000 }).catch(async () => {
			throw new StateFailed(`the mascot did not come to rest in the album (it is '${await page.evaluate(() => document.querySelector<HTMLElement>('.pocket-mascot')?.dataset.mascotState ?? null)}')`)
		})
		const rest = () =>
			page.evaluate(() => {
				const d = document.querySelector<HTMLElement>('.pocket-drone')
				const out = !!d && !d.hidden
				// At rest: hovering at home (or curious, following the pointer), landed; or, under 640 px, not out at all.
				return { out, wide: innerWidth >= 640, state: d?.dataset.droneState ?? null, mascot: document.querySelector<HTMLElement>('.pocket-mascot')?.dataset.mascotState ?? null, resting: out ? ['hidden', 'home-hover', 'curious', 'following', 'landed'].includes(d!.dataset.droneState ?? '') : innerWidth < 640 }
			})
		const end = Date.now() + 10_000
		let s = await rest()
		while (!s.resting && Date.now() < end) {
			await sleep(200)
			s = await rest()
		}
		if (!s.resting && s.out) throw new StateFailed(`the drone did not come to rest in the album (the drone is '${s.state}', the mascot '${s.mascot}')`)
		if (!s.out && s.wide) note(`the drone did not come out in the album within 10 s at ${await page.evaluate(() => innerWidth)} px (it is '${s.state}'): the cell's rule (f) says so`)
		await frames(page, 1200)
	}

	const guideParts = (page: Page) =>
		page.evaluate(() => {
			const r = document.querySelector('vg-guide')?.shadowRoot
			const bar = r?.querySelector('.vg-bar')
			const kbd = r?.querySelector('.vg-kbd')
			return { mic: r?.querySelector<HTMLElement>('.vg-mic')?.dataset.state ?? null, bar: !!bar && !bar.classList.contains('hidden'), kbd: !!kbd && kbd.classList.contains('show') }
		})

	const journeyState = (page: Page) =>
		page.evaluate(() => {
			const l = document.getElementById('pocket-journey-layer')
			const open = !!l && !l.hidden && l.getClientRects().length > 0
			const r = document.querySelector('vg-guide')?.shadowRoot
			const card = r?.querySelector<HTMLElement>('.tr-card')
			const allow = card?.querySelector<HTMLElement>('.tr-allow')
			const trAllow = !!card && !card.hidden && !!allow && allow.getClientRects().length > 0 && getComputedStyle(allow).visibility !== 'hidden'
			return { open, mode: l?.dataset.mode ?? null, trAllow, consent: ((window as any).__vgTrailActive?.state?.consent ?? null) as string | null }
		})

	const pillShows = (page: Page) =>
		page.evaluate(() => {
			const p = document.querySelector('vg-guide')?.shadowRoot?.querySelector<HTMLElement>('.tr-pill')
			return !!p && !p.hidden && !p.classList.contains('tucked') && p.getBoundingClientRect().width > 0
		})

	/**
	 * The layer's own records this run made on this page, removed: the stickers it added (through the
	 * Pocket's store, or its own IndexedDB database aixc-v1 when the layer is not running) and, only where
	 * this run gave the trail's consent, the trail's journey and consent (its own reset). Nothing else.
	 */
	const cleanPage = async (page: Page, where: string, keysBefore: string[] | null, grantedHere: boolean) => {
		const from = report.cleanup.length
		if (keysBefore !== null) {
			try {
				const removed = await page.evaluate(async (keep) => {
					const p = (window as any).__aixc?.demos?.pocket
					if (p?.store) {
						// A page that has just loaded (a reload) may not have read its store yet.
						await p.store.ready
						const gone = (p.store.all() as any[]).map((r) => r.key as string).filter((k) => !keep.includes(k))
						for (const k of gone) await p.store.remove(k)
						return { via: 'the Pocket store', n: gone.length }
					}
					const db = await new Promise<IDBDatabase | null>((done) => {
						const r = indexedDB.open('aixc-v1')
						r.onsuccess = () => done(r.result)
						r.onerror = () => done(null)
					})
					if (!db || !db.objectStoreNames.contains('pocket')) {
						db?.close()
						return { via: 'nothing (no Pocket database here)', n: 0 }
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
				}, keysBefore)
				report.cleanup.push(`${where}: removed ${removed.n} sticker(s) this run added, through ${removed.via}`)
			} catch (e) {
				report.cleanup.push(`${where}: the stickers could not be removed: ${(e as Error).message.split('\n')[0]}`)
			}
		}
		if (grantedHere) {
			try {
				const r = await page.evaluate(async () => {
					const host = (window as any).voiceGuide?.trailHost
					return host?.reset ? await host.reset() : { ok: false, reason: 'no trail on this page' }
				})
				report.cleanup.push(r.ok ? `${where}: the trail's journey and consent this run gave: reset` : `${where}: the trail was NOT reset (${r.reason}): reset it with the demo kit's "Reset demo"`)
			} catch (e) {
				report.cleanup.push(`${where}: the trail was NOT reset (${(e as Error).message.split('\n')[0]}): reset it with the demo kit's "Reset demo"`)
			}
		}
		const lines = report.cleanup.slice(from)
		if (lines.length) log(`  clean-up: ${lines.join('; ')}`)
	}

	/** Runs one state; a state that cannot be reached is a violation, and the page's later states are left out. */
	const state = async (where: string, name: string, fn: () => Promise<void>) => {
		log(`  (${name})`)
		try {
			await fn()
			return true
		} catch (e) {
			if (!(e instanceof StateFailed)) throw e
			violation(`${where}: (walk) ${name} was not reached: ${e.message}`)
			return false
		}
	}

	/** The gate on this page (ADR-0076 §4; O29: never measured live before phase 4c), recorded for the report and held to its rule. */
	const recordGate = async (page: Page, ctx: PageCtx) => {
		const gate = await gateOf(page)
		report.gates.push({ pass, page: ctx.pathname, viewport: vpName(ctx.vp), ...gate })
		for (const line of gateViolations(ctx.where, gate)) violation(line)
		if (gate.allowed === null) note(`${ctx.where}: Reimagine's launcher had not started within 15 s: the gate's decision was not read`)
		log(`  the gate: coverage ${gate.coverage ?? 'not read'} (${gate.usable ?? '-'} of ${gate.cards ?? '-'} cards usable, ${gate.unread ?? '-'} unread), sections ${JSON.stringify(gate.sections)}: ${gate.passes ? 'passes' : `does not pass (${gate.why})`}; the launcher ${gate.allowed === null ? 'not started' : gate.allowed ? 'open' : 'closed'}, its button ${gate.launcher}`)
		return gate
	}

	/* S7, the reimagined view (phase 4c): on the layer's load of a page, after its other states; no page load of its own. */

	const reimagineNow = (page: Page) =>
		page.evaluate(() => {
			const s = (window as any).__aixc?.demos?.reimagine?.state
			return { view: (s?.view ?? null) as string | null, template: (s?.template ?? null) as string | null, composer: !!document.querySelector('.aixc-composer:not([hidden])'), mounted: !!document.querySelector('.aixc-box:not([hidden]) > .aixc-stage > *'), launcher: (window as any).__aixc?.demos?.reimagine?.debug?.() ?? null }
		})

	/** The launcher at the top of the page, shown and still: the window scrolled up with the wheel (it tucks with the pill, and shows only near the top without one). */
	const launcherAtTop = async (page: Page) => {
		const vs = page.viewportSize() ?? DESKTOP
		await page.mouse.move(vs.width / 2, vs.height / 2, { steps: 2 })
		await page.mouse.wheel(0, -8000)
		await page
			.waitForFunction(
				() => {
					const b = document.querySelector<HTMLElement>('.aixc-launcher')
					if (!b || b.hidden || b.hasAttribute('data-tucked') || getComputedStyle(b).visibility === 'hidden') return false
					const r = b.getBoundingClientRect()
					return r.width > 0 && r.top >= 0 && r.bottom <= innerHeight
				},
				null,
				{ timeout: 20_000 },
			)
			.catch(async () => {
				throw new StateFailed(`Reimagine's launcher did not show at the top of the page (${JSON.stringify(await reimagineNow(page))})`)
			})
		await frames(page, 400)
	}
	const waitComposer = async (page: Page) => {
		await page.waitForSelector('.aixc-composer:not([hidden])', { timeout: 15_000 }).catch(() => {
			throw new StateFailed('the composer did not open')
		})
		// Its words in Vodafone's faces (rule h): read once the faces have loaded.
		await page.evaluate(() => document.fonts.ready.then(() => {}))
		await frames(page, 400)
	}
	/** A template pressed in the open composer, brought into the composer's own view first. */
	const pressTemplate = async (page: Page, template: string) => {
		if (!(await templateInView(page, template))) throw new StateFailed(`the composer has no ${template}`)
		await mustPress(page, 'template', template)
	}
	const waitTemplate = async (page: Page, template: string) => {
		await page
			.waitForFunction(
				(t) => {
					const s = (window as any).__aixc?.demos?.reimagine?.state
					return s?.view === 'reimagined' && s.template === t && !!document.querySelector('.aixc-box:not([hidden]) > .aixc-stage > *')
				},
				template,
				{ timeout: 25_000 },
			)
			.catch(async () => {
				throw new StateFailed(`${template}'s view did not show (${JSON.stringify(await reimagineNow(page))})`)
			})
		await page.evaluate(() => document.fonts.ready.then(() => {}))
		await frames(page, 900)
	}
	const openPreview = async (page: Page, which: 'canvas' | 'streaming') => {
		const id = await reachableOpener(page, which)
		if (!id) throw new StateFailed(`no ${which} card whose preview a press reaches`)
		await mustPress(page, which === 'canvas' ? 'canvasCard' : 'streamingCard', id)
		await page.waitForFunction(() => !!document.querySelector('.aixc-box dialog[open]'), null, { timeout: 8_000 }).catch(() => {
			throw new StateFailed(`${which}'s preview did not open`)
		})
		// Canvas's preview zooms in (600 ms, its words 650 ms later).
		await frames(page, 1400)
	}
	const closePreview = async (page: Page, which: 'canvas' | 'streaming') => {
		await mustPress(page, which === 'canvas' ? 'canvasClose' : 'streamingClose')
		await page.waitForFunction(() => !document.querySelector('.aixc-box dialog[open]'), null, { timeout: 8_000 }).catch(() => {
			throw new StateFailed(`${which}'s preview did not close`)
		})
		await frames(page, 600)
	}

	/** Where Vodafone's menu opens, the window scrolled to its top first when its navigation is not on the screen (by script, as pocketOne scrolls). */
	const menuTarget = async (page: Page) => {
		const at = await vodafoneMenuTarget(page)
		if (at?.reached) return at
		await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
		await frames(page, 500)
		return vodafoneMenuTarget(page)
	}
	/**
	 * Vodafone's menu over a view (S7), the only thing of Vodafone's this run touches (design §4; AGENTS.md §4): on a
	 * wide screen a hover on its navigation's first dropdown (no press), on a narrow one a press on its burger (not a
	 * link), and only to open it: the burger is never pressed a second time. Hit-tested as our presses are (again with
	 * the pointer there), never while the banner shows, never in the banner pass; recorded in `report.vodafone`, and a
	 * press in `report.presses` too. When the menu does not read open, `how` says whether the pointer or a press touched it.
	 */
	const openMenu = async (page: Page): Promise<{ ok: true; how: 'hover' | 'press' } | { ok: false; why: string; how?: 'hover' | 'press' }> => {
		if (pass === 'banner') throw new Error("refused: the banner pass never touches Vodafone's menu")
		const at = await menuTarget(page)
		if (!at) return { ok: false, why: "there is no menu of Vodafone's on the screen to open" }
		if (!at.reached) return { ok: false, why: `a press at ${at.what} (${Math.round(at.x)},${Math.round(at.y)}) would reach ${at.onTop}` }
		if (await bannerShows(page)) throw new BannerShows()
		await stopIfBlocked(page, null)
		await page.mouse.move(at.x, at.y, { steps: 4 })
		if (at.how === 'press') {
			const again = await vodafoneMenuTarget(page)
			if (!again || !again.reached || again.how !== 'press' || Math.hypot(again.x - at.x, again.y - at.y) > 3) return { ok: false, why: `with the pointer on ${at.what}, a press there would reach ${again?.onTop ?? 'nothing'}` }
			if (await bannerShows(page)) throw new BannerShows()
			report.presses.push({ pass, what: `${at.what}, to open its menu`, at: Date.now() })
			log(`  press: ${at.what}, to open its menu`)
			await page.mouse.click(again.x, again.y)
		} else log(`  hover: ${at.what}, to open its dropdown (no press)`)
		report.vodafone.push({ pass, what: at.what, how: at.how, at: Date.now() })
		await sleep(80)
		checkUnexpected()
		const opened = await page.waitForFunction(MENU_OPEN, null, { timeout: 5_000 }).then(
			() => true,
			() => false,
		)
		checkUnexpected()
		return opened ? { ok: true, how: at.how } : { ok: false, why: `Vodafone's menu did not read open (${at.what}, by ${at.how})`, how: at.how }
	}
	/**
	 * After the menu cell (only when the run goes on: never after a stop or with the banner up). A hovered dropdown
	 * closes as it opened, the pointer moved off the navigation onto our box (no press). The phone menu is left open:
	 * its burger is pressed only to open it (design §4), and the next page load closes it. True when it reads closed.
	 */
	const closeMenu = async (page: Page, how: 'hover' | 'press', where: string): Promise<boolean> => {
		if (how === 'press') {
			note(`${where}: Vodafone's phone menu was left open (its burger is pressed only to open it); the next page load closes it`)
			return false
		}
		checkUnexpected()
		await stopIfBlocked(page, null)
		const r = await readView(page).catch(() => null)
		const vs = page.viewportSize() ?? DESKTOP
		const x = r?.box ? (r.box.left + r.box.right) / 2 : vs.width / 2
		const y = r?.box ? Math.max(r.box.top + 80, (r.box.top + r.box.bottom) / 2) : vs.height * 0.7
		await page.mouse.move(x, y, { steps: 4 })
		await sleep(80)
		checkUnexpected()
		const closed = await page.waitForFunction(MENU_CLOSED, null, { timeout: 5_000 }).then(
			() => true,
			() => false,
		)
		if (!closed) note(`${where}: Vodafone's menu did not close (${how}); the next page load closes it`)
		await frames(page, 400)
		return closed
	}

	/**
	 * S7 on this load ('full' or 'short', the plan's `reimagine`): the composer from the launcher, spotlight's view (the
	 * Pocket peeking: S2 pocketed a card); 'full' adds the guide listening over it, the composer over the view from
	 * "Change experience", canvas's and streaming's previews open in the box; then Vodafone's menu over the view, and
	 * Original. A state that cannot be reached is a violation, and the states after it on this page are left out.
	 */
	const walkS7 = async (page: Page, ctx: PageCtx, kind: 'full' | 'short', gate: GateReading | null) => {
		const where = ctx.where
		log(`${where}: S7 (${kind === 'full' ? 'the composer, the view, listening, the composer over the view, the two previews, the menu' : 'the composer, the view, the menu'})`)
		if (gate && !gate.passes) {
			violation(`${where}: (walk) S7 was not reached: the gate is closed on this page (${gate.why})`)
			return
		}
		if ((await pocketState(page)).view === 'pocket') {
			const back = await press(page, 'albumBack')
			if (back.ok) await waitView(page, 'page', 'the album did not close').catch(() => {})
		}
		if (
			!(await state(where, S7.composer, async () => {
				await launcherAtTop(page)
				await mustPress(page, 'launcher')
				await waitComposer(page)
				await take(page, ctx, S7.composer, { view: 'original', composer: true, pocket: true })
			}))
		)
			return
		if (
			!(await state(where, S7.view, async () => {
				await pressTemplate(page, S7_TEMPLATE)
				await waitTemplate(page, S7_TEMPLATE)
				await take(page, ctx, S7.view, { view: 'reimagined', composer: false, pocket: true })
			}))
		)
			return
		if (kind === 'full') {
			const listened = await state(where, S7.listening, async () => {
				await mustPress(page, 'mic')
				await page.waitForFunction(() => {
					const r = document.querySelector('vg-guide')!.shadowRoot!
					return !r.querySelector('.vg-bar')!.classList.contains('hidden') && r.querySelector('.vg-kbd')!.classList.contains('show')
				}, null, { timeout: 10_000 }).catch(async () => {
					throw new StateFailed(`the transcript bar and the keyboard button did not show (${JSON.stringify(await guideParts(page))})`)
				})
				await frames(page, 700)
				await take(page, ctx, S7.listening, { view: 'reimagined', composer: false, pocket: true, listening: true })
				if ((await guideParts(page)).mic === 'listening') await mustPress(page, 'mic')
				const vs = page.viewportSize() ?? ctx.vp
				await page.mouse.move(vs.width / 2, vs.height / 2, { steps: 4 })
				await page.waitForFunction(() => {
					const r = document.querySelector('vg-guide')!.shadowRoot!
					return r.querySelector('.vg-bar')!.classList.contains('hidden') && !r.querySelector('.vg-kbd')!.classList.contains('show')
				}, null, { timeout: 10_000 }).catch(async () => {
					throw new StateFailed(`the guide's bar did not go after the stop press (${JSON.stringify(await guideParts(page))})`)
				})
				await frames(page, 600)
			})
			if (!listened) return
			const changed = await state(where, S7.change, async () => {
				await mustPress(page, 'change')
				await waitComposer(page)
				await take(page, ctx, S7.change, { view: 'reimagined', composer: true, pocket: true })
			})
			if (!changed) return
			const canvas = await state(where, S7.canvas, async () => {
				await pressTemplate(page, 'canvas')
				await waitTemplate(page, 'canvas')
				await openPreview(page, 'canvas')
				await take(page, ctx, S7.canvas, { view: 'reimagined', composer: false, pocket: true, preview: 'canvas' })
				await closePreview(page, 'canvas')
			})
			if (!canvas) return
			const streaming = await state(where, S7.streaming, async () => {
				await mustPress(page, 'change')
				await waitComposer(page)
				await pressTemplate(page, 'streaming')
				await waitTemplate(page, 'streaming')
				await openPreview(page, 'streaming')
				await take(page, ctx, S7.streaming, { view: 'reimagined', composer: false, pocket: true, preview: 'streaming' })
				await closePreview(page, 'streaming')
			})
			if (!streaming) return
		}
		// Whether Vodafone's menu may still be open after its cell (then Original is not pressed: the next load gives the page back).
		let menuLeft = false
		await state(where, S7.menu, async () => {
			const r = await openMenu(page)
			if (!r.ok) {
				// Touched but not read open: a hover is taken off again; after a press the menu may be open, unmarked.
				if (r.how) menuLeft = !(await closeMenu(page, r.how, where))
				throw new StateFailed(r.why)
			}
			menuLeft = true
			await frames(page, 600)
			// A stop (a bot check, a load this run did not start) or the banner ends the run here: nothing more is touched,
			// the menu not closed. Only a cell that was taken, or a state that failed, goes on to close it.
			let failed: StateFailed | null = null
			try {
				await take(page, ctx, S7.menu, { view: 'reimagined', composer: false, pocket: true, menu: true })
			} catch (e) {
				if (!(e instanceof StateFailed)) throw e
				failed = e
			}
			menuLeft = !(await closeMenu(page, r.how, where))
			if (failed) throw failed
		})
		if (menuLeft) {
			note(`${where}: Original was not pressed with Vodafone's menu still open; the next page load gives the page back`)
			return
		}
		// Original gives the page back (the next load would anyway).
		const back = await press(page, 'original')
		if (back.ok) await page.waitForFunction(() => (window as any).__aixc?.demos?.reimagine?.state?.view === 'original', null, { timeout: 10_000 }).catch(() => note(`${where}: Original did not give the page back`))
		else note(`${where}: the view was left open (${back.why}); the next page load gives the page back`)
	}

	const walkMain = async (page: Page, vp: Viewport, target: { pathname: string; full: boolean; reimagine?: 'full' | 'short' }) => {
		const ctx: PageCtx = { pathname: target.pathname, vp, where: `${target.pathname} ${vpName(vp)} banner absent`, off: null }
		log(`${ctx.where}: ${target.full ? 'S1, S2, S5, S3, S4' : 'S1, S2'}${target.reimagine ? `, S7 (${target.reimagine})` : ''}`)
		const only = await vodafoneOnly(page)
		let ok = false
		try {
			await load(page, target.pathname, '?aixc=off', "baseline, ?aixc=off, Vodafone's page alone")
			ok = await state(ctx.where, 'the ?aixc=off baseline', async () => {
				await loaderThere(page)
				await settle(page)
			})
			if (await bannerShows(page)) throw new BannerShows()
			await environment(page, vp)
			ctx.off = await baseline(page, ctx, false, only.blocked())
		} finally {
			await only.done()
		}
		if (!ok) return
		await load(page, target.pathname, '?aixc-debug', 'with the layer, ?aixc-debug')
		let keysBefore: string[] | null = null
		let grantedHere = false
		try {
			if (
				!(await state(ctx.where, 'the layer ready', async () => {
					await layerReady(page, true)
					await settle(page)
				}))
			)
				return
			if (await bannerShows(page)) throw new BannerShows()
			const gate = await recordGate(page, ctx)
			keysBefore = (await pocketState(page)).keys
			if (keysBefore.length) note(`${ctx.where}: the Pocket held ${keysBefore.length} sticker(s) before this run (kept)`)
			await page.waitForSelector('#pocket-output[data-pocket-actor-ready]', { state: 'attached', timeout: 10_000 }).catch(() => {})
			await frames(page, 400)
			const s1 = await take(page, ctx, 'S1 on load')
			if (!keysBefore.length && s1.controls.pocket?.shown) violation(`${ctx.where} S1 on load: the Pocket button shows with nothing pocketed ${fmt(s1.controls.pocket.box)}`)

			const pocketed = await state(ctx.where, 'S2 a card pocketed by its chip, the Pocket peeking', async () => {
				const r = await pocketOne(page, keysBefore!)
				if (r.passedOver.length) note(`${ctx.where}: chips passed over on the way to S2: ${r.passedOver.join('; ')}`)
				const s2 = await take(page, ctx, 'S2 pocketed, peeking')
				if (!s2.controls.pocket?.shown) throw new StateFailed('the Pocket button does not peek')
			})
			if (!target.full) {
				if (target.reimagine && pocketed) await walkS7(page, ctx, target.reimagine, gate)
				return
			}

			await state(ctx.where, 'S5 the guide listening', async () => {
				await mustPress(page, 'mic')
				await page.waitForFunction(() => {
					const r = document.querySelector('vg-guide')!.shadowRoot!
					return !r.querySelector('.vg-bar')!.classList.contains('hidden') && r.querySelector('.vg-kbd')!.classList.contains('show')
				}, null, { timeout: 10_000 }).catch(async () => {
					throw new StateFailed(`the transcript bar and the keyboard button did not show (${JSON.stringify(await guideParts(page))})`)
				})
				await frames(page, 400)
				const s5 = await take(page, ctx, 'S5 listening')
				if (s5.state.mic !== 'listening') violation(`${ctx.where} S5 listening: the guide's mic is '${s5.state.mic}', not listening`)
				// Stopped with the mic's own press (unless the guide already stopped); the pointer then leaves the mic (the keyboard button peeks while it is on it).
				if ((await guideParts(page)).mic === 'listening') await mustPress(page, 'mic')
				else note(`${ctx.where}: the guide stopped listening on its own before the stop press`)
				const vs = page.viewportSize() ?? vp
				await page.mouse.move(vs.width / 2, vs.height / 2, { steps: 4 })
				await page.waitForFunction(() => {
					const r = document.querySelector('vg-guide')!.shadowRoot!
					return r.querySelector('.vg-bar')!.classList.contains('hidden') && !r.querySelector('.vg-kbd')!.classList.contains('show')
				}, null, { timeout: 10_000 }).catch(async () => {
					throw new StateFailed(`the guide's bar did not go after the stop press (${JSON.stringify(await guideParts(page))})`)
				})
				await frames(page, 600)
			})
			if (!pocketed) return

			const album = await state(ctx.where, 'S3 the album open', async () => {
				await page.mouse.wheel(0, -6000)
				await frames(page, 400)
				await page.waitForFunction(() => document.querySelectorAll('.curl-host--flying').length === 0, null, { timeout: 10_000 }).catch(() => {})
				await mustPress(page, 'pocket')
				await albumAtRest(page)
				const s3 = await take(page, ctx, 'S3 album, journey closed')
				if (s3.state.pocketView !== 'pocket' || s3.state.journey) throw new StateFailed(`the album is not open with the journey closed (${s3.state.pocketView}, journey ${s3.state.journey})`)
			})
			if (!album) return

			await state(ctx.where, 'S4 "Your journey" open in the album', async () => {
				const consentBefore = (await journeyState(page)).consent
				if (consentBefore === 'granted' || consentBefore === 'paused') note(`${ctx.where}: the trail's consent was already given in this profile (${consentBefore}): left as it was, so the pages this run opened may be steps of that journey`)
				await page.mouse.wheel(0, -8000)
				await frames(page, 600)
				if (!(await pillShows(page))) throw new StateFailed("the trail's pill does not show in the album")
				await mustPress(page, 'pill')
				let card = false
				let layerConsent = false
				let presses = 0
				for (let i = 0; i < 60; i++) {
					const j = await journeyState(page)
					if (j.open && j.mode === 'journey') break
					if (j.trAllow || (j.open && j.mode === 'consent')) {
						if (++presses > 2) throw new StateFailed('the consent was allowed and the journey still does not open')
						await frames(page, 400)
						if (j.trAllow && !card) {
							card = true
							await take(page, ctx, "S4 the trail's consent card")
						}
						if (!j.trAllow && !layerConsent) {
							layerConsent = true
							await take(page, ctx, "S4 the journey's consent")
						}
						await mustPress(page, j.trAllow ? 'trailAllow' : 'journeyAllow')
						await page.waitForFunction(() => ['granted', 'paused'].includes((window as any).__vgTrailActive?.state?.consent), null, { timeout: 8_000 }).catch(() => {
							throw new StateFailed('the trail did not take the consent')
						})
						grantedHere = consentBefore !== 'granted' && consentBefore !== 'paused'
						await sleep(800)
						const now = await journeyState(page)
						if (!now.open && !now.trAllow) {
							await page.mouse.wheel(0, -8000)
							await frames(page, 500)
							if (await pillShows(page)) await mustPress(page, 'pill')
						}
						continue
					}
					await sleep(250)
				}
				await page.waitForSelector('#pocket-journey-layer:not([hidden])[data-mode="journey"]', { timeout: 15_000 }).catch(() => {
					throw new StateFailed('the journey did not show in the album')
				})
				await albumAtRest(page)
				const s4 = await take(page, ctx, 'S4 album, journey open')
				if (!s4.state.journey) throw new StateFailed('the journey is not open')
				// Closed again with our own buttons; the next page load would reset it anyway.
				const closed = await press(page, 'journeyClose')
				if (closed.ok) await page.waitForSelector('#pocket-journey-layer', { state: 'hidden', timeout: 10_000 }).catch(() => note(`${ctx.where}: the journey did not close`))
				else note(`${ctx.where}: the journey was left open (${closed.why})`)
				const back = await press(page, 'albumBack')
				if (back.ok) await waitView(page, 'page', 'the album did not close').catch(() => note(`${ctx.where}: the album did not close`))
				else note(`${ctx.where}: the album was left open (${back.why})`)
			})
			if (target.reimagine) await walkS7(page, ctx, target.reimagine, gate)
		} finally {
			await cleanPage(page, ctx.where, keysBefore, grantedHere)
		}
	}

	const walkBanner = async (page: Page, vp: Viewport, pathname: string) => {
		const ctx: PageCtx = { pathname, vp, where: `${pathname} ${vpName(vp)} banner present`, off: null }
		log(`${ctx.where}: S1 only, no press`)
		const only = await vodafoneOnly(page)
		let ok = false
		try {
			await load(page, pathname, '?aixc=off', "baseline, ?aixc=off, Vodafone's page alone, a first visit")
			ok = await state(ctx.where, 'the ?aixc=off baseline', async () => {
				await loaderThere(page)
				await settleBanner(page)
			})
			await environment(page, vp)
			ctx.off = await baseline(page, ctx, await bannerShows(page), only.blocked())
		} finally {
			await only.done()
		}
		if (!ok) return
		await load(page, pathname, '?aixc-debug', 'with the layer, ?aixc-debug, a first visit')
		if (
			!(await state(ctx.where, 'the layer ready', async () => {
				await layerReady(page, false)
				await settleBanner(page)
			}))
		)
			return
		await recordGate(page, ctx)
		if (!(await bannerShows(page))) violation(`${ctx.where}: the cookie banner did not show on a first visit (a throwaway profile): rules (c) and (e) with the banner are unchecked here`)
		await page.waitForSelector('#pocket-output[data-pocket-actor-ready]', { state: 'attached', timeout: 10_000 }).catch(() => {})
		await frames(page, 400)
		await take(page, ctx, 'S1 on load, banner present')
	}

	try {
		if (plan.main) {
			pass = 'main'
			const b = await o.openMain()
			watchPage(b.page)
			try {
				for (const vp of plan.main.viewports) {
					await b.page.setViewportSize(vp)
					for (const target of plan.main.pages) {
						await walkMain(b.page, vp, target)
						write()
					}
				}
				report.main = 'done'
			} catch (e) {
				if (!(e instanceof BannerShows)) throw e
				report.main = 'skipped: banner'
				report.message = BANNER_MESSAGE
				log(`SKIPPED (main pass): ${BANNER_MESSAGE}`)
			} finally {
				await b.close()
			}
		}
		if (plan.banner) {
			pass = 'banner'
			const b = await o.openBanner()
			watchPage(b.page)
			try {
				for (const vp of plan.banner.viewports) {
					await b.page.setViewportSize(vp)
					for (const pathname of plan.banner.pages) {
						await walkBanner(b.page, vp, pathname)
						write()
					}
				}
				report.banner = 'done'
			} finally {
				await b.close()
			}
		}
		const errors = report.layerConsole.filter((l) => l.startsWith('error:'))
		for (const e of errors) violation(`the layer logged an error: ${e}`)
		for (const e of report.layerPageErrors) violation(`a page error came from the layer: ${e}`)
		report.outcome = report.violations.length ? 'violations' : 'passed'
		for (const g of report.gates) log(`the gate on ${g.pass} ${g.page} ${g.viewport}: coverage ${g.coverage ?? 'not read'}, sections ${JSON.stringify(g.sections)}, ${g.passes ? 'passes' : 'does not pass'}; the launcher ${g.allowed === null ? 'not started' : g.allowed ? 'open' : 'closed'}`)
		log(`${report.outcome.toUpperCase()}: ${report.cells.length} cells, ${report.loads.length} page loads (${planned} planned, at most ${MAX_LOADS}), ${report.presses.length} presses (${report.presses.filter((p) => p.pass === 'banner').length} in the banner pass), Vodafone's menu touched ${report.vodafone.length} time(s) (${report.vodafone.map((x) => x.how).join(', ') || 'never'}), ${report.violations.length} violation(s); ${jsonFile}`)
		return report
	} catch (e) {
		if (e instanceof FloatingStop) throw e
		// A page load this run did not start, seen as an error of the walk (its page went away under it): a stop.
		if (unexpected.length) checkUnexpected()
		report.outcome = 'failed'
		report.message = (e as Error).message
		log(`FAILED: ${report.message}`)
		throw new FloatingFailure(report.message, report)
	} finally {
		write()
	}
}
