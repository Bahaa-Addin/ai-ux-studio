/**
 * The Pocket's smoke on one of Vodafone's pages (live plan phase 3, step S17; ADR-0052, ADR-0064, ADR-0065):
 * one flow, `runPocketSmoke(page, options)`, that the live test (./pocket.live.test.ts, run by the owner on
 * the real web.vodafone.com.eg) and the offline rehearsal on the saved pages
 * (../e2e/pocket-smoke-rehearsal.e2e.test.ts) both call, so the flow is proven without touching the site.
 *
 * The steps, each logged in plain words:
 *  (a) open the page signed out (never a sign-in) with ?aixc-debug and wait until the layer is ready;
 *  (b) stop before any press on a bot or challenge page (403, 429, 503; "Access denied", "Attention
 *      required", "Just a moment"; a captcha or challenge marker: never past it), on an error page (any
 *      4xx or 5xx), and when OneTrust's banner (#onetrust-banner-sdk) shows: then nothing is pressed and the
 *      report says 'skipped: banner' (the banner is a person's to answer, AGENTS.md §4.6);
 *  (c) record Vodafone's accessibility button (#vodafone-aw-icon) and the banner (box, computed styles,
 *      style attribute) and the header's and footer's places;
 *  (d) hover a card and press its "Pocket it" chip with the mouse; the Pocket button counts one more and
 *      a press reaches it at the bottom-left;
 *  (e) open the album with the Pocket button (it shows the sticker), close it with its Back button
 *      (Escape if that is not on screen): the page is back at the same scroll, within 2 px;
 *  (f) reload (the signed-out theme clears localStorage on Services): the sticker is still there;
 *  (g) "Your journey" from the trail's pill, in place: the trail's consent card (ours) is allowed if it
 *      shows; the journey shows in the album, the address unchanged; then closed;
 *  (h) the sticker's own link pressed in the album, and the requests for its address counted over the
 *      Chrome DevTools Protocol (the portal's fetch, the navigation, what the cache served), with the
 *      response's Cache-Control and Vary and the names of the cookies it sets (never their values): a
 *      measurement for the owner (OD-4), not an assertion; then Back to the page;
 *  (i) no [AIXC] error in the console, no page error from the layer, the accessibility button and the
 *      banner as in (c), every element of the layer inside a data-aixc root, the layer still ready.
 * Last, always: the layer's own records made by this run are removed (the stickers it added, through the
 * Pocket's store or its own IndexedDB database; the trail's journey and consent, only if this run gave the
 * consent). Nothing of Vodafone's (cookies, localStorage, the widget, the banner) is ever written.
 *
 * Page loads: at most six, at least `pauseMs` apart; an HTTP error for a page stops the run. Presses are
 * real mouse presses (Playwright's mouse, or a locator's click, which is the same), never a script's click.
 */
import type { CDPSession, Page, Response } from 'playwright'

/* eslint-disable @typescript-eslint/no-explicit-any */

export const BANNER_MESSAGE = 'The cookie banner is showing. Answer it yourself in this browser window (this test never does), then run the test again.'
export const MAX_LOADS = 6

export interface SmokeHooks {
	/**
	 * After each page has loaded and the layer is ready: time for what only the live site has (OneTrust's
	 * banner arrives late, the accessibility widget is Angular's). Default: up to `settleMs` for both.
	 */
	settle?(page: Page): Promise<void>
	/** Before the sticker's link is pressed (the rehearsal serves the destination from the saved pages). */
	beforeDestination?(page: Page, url: string): Promise<void>
	/** Just before the comparison of step (i) (the rehearsal proves the rules can fail). */
	beforeCompare?(page: Page): Promise<void>
}

export interface SmokeOptions {
	/** The origin, for example https://web.vodafone.com.eg */
	base: string
	/** Default '/en/services'. */
	path?: string
	/** At least this long between two page loads. Default 1200 ms. */
	pauseMs?: number
	/** How long the default settle waits for the banner and the accessibility widget. Default 5000 ms. */
	settleMs?: number
	log?(line: string): void
	hooks?: SmokeHooks
}

export interface SmokeStep {
	id: string
	name: string
	ok: boolean
	detail?: string
	numbers?: Record<string, unknown>
}

export interface RequestCount {
	url: string
	/** The portal's fetch and the navigation's document that went to the network (those the cache did not serve). */
	network: number
	fetch: number
	navigation: number
	fromCache: number
	/** Documents the destination page's own scripts asked for again once it had loaded (not the portal's; counted apart). */
	byDestination: number
	other: number
	cacheControl: string[]
	vary: string[]
	/** Names of the cookies the responses set; never their values. */
	setCookieNames: string[]
	status: number | null
	portalRan: boolean
	/** Each request seen: its kind, what started it, its status, whether the cache served it (no headers, no bodies). */
	detail: { type: string; initiator: string; status: number | null; fromCache: boolean; redirected: boolean; mainFrame: boolean; loader: string; atMs: number; failed: string | null; by: string }[]
	/** The same requests as Playwright's page sees them (its own count, for comparison). */
	seenByPlaywright: { type: string; failure: string | null }[]
	line: string
}

export interface SmokeReport {
	base: string
	path: string
	outcome: 'passed' | 'skipped: banner' | 'stopped' | 'failed'
	message: string | null
	steps: SmokeStep[]
	loads: { url: string; status: number | null; at: number; how: string }[]
	presses: number
	requests: RequestCount | null
	layerConsole: string[]
	layerPageErrors: string[]
	cleanup: string[]
}

/** The run stopped on purpose (a bot check, an error page); the report says why. */
export class SmokeStop extends Error {
	readonly report: SmokeReport
	constructor(message: string, report: SmokeReport) {
		super(message)
		this.name = 'SmokeStop'
		this.report = report
	}
}

/** An assertion of the flow failed. */
export class SmokeFailure extends Error {
	readonly report: SmokeReport
	constructor(message: string, report: SmokeReport) {
		super(message)
		this.name = 'SmokeFailure'
		this.report = report
	}
}

class BannerShows extends Error {}

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms))

/** What a challenge page has (Cloudflare's interstitial, PerimeterX, reCAPTCHA, hCaptcha). Cloudflare's passive /scripts/jsd/ on ordinary pages is not one. */
const CHALLENGE_MARKERS = '#challenge-form, #challenge-running, #cf-challenge-running, #challenge-stage, iframe[src*="challenges.cloudflare.com"], script[src*="/cdn-cgi/challenge-platform/h/"], #px-captcha, iframe[src*="captcha"], .g-recaptcha, .h-captcha'
const BOT_WORDS = /access denied|attention required|just a moment|captcha|verify (that )?you are (a )?human|checking your browser|pardon our interruption|request unsuccessful|are you a robot/i
const ERROR_WORDS = /page not found|\b404\b|\b50[0-4]\b|server error|service unavailable/i

/** The layer's elements: ids and class prefixes of the Pocket, the curl, the portal and the core. */
const LAYER_SELECTOR = '#experience-output, #aixc-viewbar, #pocket-output, style[data-aixc-css], [class*="pocket-"], [class*="curl-"], [class*="aixc-"], .vf-portal'

export async function runPocketSmoke(page: Page, options: SmokeOptions): Promise<SmokeReport> {
	const base = options.base.replace(/\/$/, '')
	const pathname = options.path ?? '/en/services'
	const pauseMs = Math.max(1000, options.pauseMs ?? 1200)
	const settleMs = options.settleMs ?? 5000
	const log = options.log ?? ((line: string) => console.log(`# ${line}`))
	const hooks = options.hooks ?? {}
	const url = `${base}${pathname}?aixc-debug`
	const report: SmokeReport = { base, path: pathname, outcome: 'failed', message: null, steps: [], loads: [], presses: 0, requests: null, layerConsole: [], layerPageErrors: [], cleanup: [] }

	const onConsole = (m: { type(): string; text(): string }) => {
		if (m.text().startsWith('[AIXC]')) report.layerConsole.push(`${m.type()}: ${m.text()}`)
	}
	const onPageError = (e: Error) => {
		if (/\/__vg\/sdk\/aixc\//.test(`${e.message} ${e.stack ?? ''}`)) report.layerPageErrors.push(e.message)
	}
	page.on('console', onConsole)
	page.on('pageerror', onPageError)

	let lastLoad = 0
	/** Stickers in the Pocket before this run (never removed), and whether this run gave the trail's consent. */
	let keysBefore: string[] | null = null
	let grantedHere = false

	const fail = (id: string, message: string): never => {
		throw new SmokeFailure(`(${id}) ${message}`, report)
	}
	const check = (id: string, ok: unknown, message: string) => {
		if (!ok) fail(id, message)
	}
	const stop = (message: string): never => {
		report.outcome = 'stopped'
		report.message = message
		log(`STOPPED: ${message}`)
		throw new SmokeStop(message, report)
	}

	const pace = async () => {
		const wait = lastLoad + pauseMs - Date.now()
		if (wait > 0) await sleep(wait)
	}
	const recordLoad = (how: string, at: string, status: number | null) => {
		report.loads.push({ url: at, status, at: Date.now(), how })
		lastLoad = Date.now()
		log(`page load ${report.loads.length} of at most ${MAX_LOADS} (${how}): ${at} answered ${status ?? 'from memory (no response)'}`)
	}
	const room = () => {
		if (report.loads.length >= MAX_LOADS) stop(`this run would load more than ${MAX_LOADS} pages`)
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
	const pressAt = async (x: number, y: number, what: string) => {
		await beforePress()
		report.presses++
		log(`  press: ${what}`)
		await page.mouse.click(x, y)
	}
	const pressLocator = async (selector: string, what: string) => {
		await beforePress()
		report.presses++
		log(`  press: ${what}`)
		await page.locator(selector).first().click({ timeout: 10_000 })
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
		check(id, state.state === 'ready', `the layer is ready (it is '${state.state}'${state.problem ? `: ${state.problem}` : ''})`)
		await page.waitForFunction(() => (window as any).__aixc?.demos?.pocket?.chips, null, { timeout: 30_000 }).catch(() => fail(id, "the Pocket did not start on the page (no chips)"))
		await page.evaluate(() => (window as any).__aixc.demos.pocket.store.ready)
		await (hooks.settle ? hooks.settle(page) : defaultSettle())
	}

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
			}
		})
	type Furniture = Awaited<ReturnType<typeof furniture>>
	/** What differs in Vodafone's button and banner (and the header's place, and the footer's left and width). */
	const differences = (a: Furniture, b: Furniture) => {
		const out: string[] = []
		for (const k of ['button', 'banner'] as const) {
			const x = a[k]
			const y = b[k]
			if (!x !== !y) {
				out.push(`${k}: ${x ? 'was there, now gone' : 'was not there, now is'}`)
				continue
			}
			if (!x || !y) continue
			if (x.box.some((v, i) => Math.abs(v - y.box[i]) > 1)) out.push(`${k} box ${JSON.stringify(x.box)} → ${JSON.stringify(y.box)}`)
			if (x.style !== y.style) out.push(`${k} style attribute ${JSON.stringify(x.style)} → ${JSON.stringify(y.style)}`)
			for (const p of Object.keys(x.computed)) if (x.computed[p] !== y.computed[p]) out.push(`${k} ${p} ${x.computed[p]} → ${y.computed[p]}`)
		}
		if (a.header && b.header && (['top', 'left', 'width'] as const).some((p) => Math.abs(a.header![p] - b.header![p]) > 2)) out.push(`header ${JSON.stringify(a.header)} → ${JSON.stringify(b.header)}`)
		if (a.footer && b.footer && (['left', 'width'] as const).some((p) => Math.abs(a.footer![p] - b.footer![p]) > 2)) out.push(`footer ${JSON.stringify(a.footer)} → ${JSON.stringify(b.footer)}`)
		return out
	}

	const pocketState = () =>
		page.evaluate(() => {
			const p = (window as any).__aixc?.demos?.pocket
			return { view: (p?.state?.view ?? null) as string | null, busy: !!p?.state?.busy, keys: ((p?.store?.all() ?? []) as any[]).map((r) => r.key as string), ids: ((p?.store?.all() ?? []) as any[]).map((r) => r.id as string) }
		})

	/** The Pocket button: shown, its count, where it is and whether a press at its centre reaches it. */
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
			return { x, y, count: b.querySelector('.pocket-peek__count')?.textContent ?? '', left: Math.round(r.left), bottomGap: Math.round(innerHeight - r.bottom), w: Math.round(r.width), side: b.dataset.side ?? null, reached: !!hit && (hit === b || b.contains(hit)), onTop: hit ? `${hit.localName}${hit.id ? '#' + hit.id : ''}.${String(hit.getAttribute('class') ?? '').split(' ')[0]}` : null, innerWidth }
		})
	}

	const albumShows = (id: string) =>
		page
			.waitForFunction(
				() => {
					const s = (window as any).__aixc?.demos?.pocket?.state
					return s?.view === 'pocket' && !s.busy && !document.getElementById('pocket-output')?.hidden
				},
				null,
				{ timeout: 15_000 },
			)
			.catch(() => fail(id, 'the album did not open'))

	const pageShows = (id: string) =>
		page
			.waitForFunction(
				() => {
					const s = (window as any).__aixc?.demos?.pocket?.state
					return s?.view === 'page' && !s.busy
				},
				null,
				{ timeout: 15_000 },
			)
			.catch(() => fail(id, 'the album did not close'))

	/** Closes the album with its Back button (a mouse press), or Escape when the button is not on screen. */
	const closeAlbum = async (id: string) => {
		const back = await page.evaluate(() => {
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
		if (back) await pressAt(back.x, back.y, "the album's Back button")
		else {
			await beforePress()
			report.presses++
			log('  key: Escape (the Back button is not on screen)')
			await page.keyboard.press('Escape')
		}
		await pageShows(id)
		await sleep(400)
		return back ? 'Back' : 'Escape'
	}

	const step = async (id: string, name: string, fn: () => Promise<Record<string, unknown> | void>) => {
		log(`(${id}) ${name}`)
		try {
			const numbers = (await fn()) ?? undefined
			report.steps.push({ id, name, ok: true, numbers })
			if (numbers) log(`    ok: ${JSON.stringify(numbers)}`)
			else log('    ok')
		} catch (e) {
			if (!(e instanceof BannerShows)) report.steps.push({ id, name, ok: false, detail: (e as Error).message })
			throw e
		}
	}

	let start: Furniture | null = null
	let card: { id: string; href: string } | null = null

	try {
		await step('a', `open ${url} signed out (no sign-in) and wait for the layer`, async () => {
			room()
			await pace()
			lastLoad = Date.now()
			const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 })
			recordLoad('open', url, res?.status() ?? null)
			await stopIfBlocked(res?.status() ?? null)
			await page.waitForLoadState('load', { timeout: 45_000 }).catch(() => {})
			await layerReady('a')
			const s = await pocketState()
			keysBefore = s.keys
			return { status: res?.status() ?? null, stickersAlready: s.keys.length }
		})

		await step('b', 'before any press: no bot check, no error page, and no cookie banner showing', async () => {
			await stopIfBlocked(null)
			if (await bannerShows()) throw new BannerShows()
		})

		await step('c', "record Vodafone's accessibility button, the cookie banner, the header and the footer", async () => {
			start = await furniture()
			return { button: start.button?.box ?? null, banner: start.banner ? { box: start.banner.box, display: start.banner.computed.display } : null, header: start.header, footer: start.footer }
		})

		await step('d', 'hover a card and press its "Pocket it" chip with the mouse; the Pocket button counts it, bottom-left, and a press reaches it', async () => {
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
					const el = [...document.querySelectorAll<HTMLElement>(`#main-content [data-aixc-item="${CSS.escape(id)}"]`)].find((c) => !c.closest('.owl-item.cloned'))
					if (!el) continue
					el.scrollIntoView({ block: 'center', inline: 'nearest' })
					await tick()
					const c = el.getBoundingClientRect()
					const r = chip.getBoundingClientRect()
					if (!r.width || !c.width) continue
					const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
					if (hit && (hit === chip || chip.contains(hit))) return { id, href: u.href, cardX: c.left + c.width / 2, cardY: c.top + Math.min(c.height / 2, 120) }
				}
				return null
			})
			check('d', found, 'a card whose chip a press reaches and whose link goes to another page of this site')
			card = { id: found!.id, href: found!.href }
			log(`  card ${found!.id}, its link ${found!.href}`)
			await page.mouse.move(found!.cardX, found!.cardY, { steps: 6 })
			await sleep(400)
			const chip = await page.evaluate((id) => {
				const chip = document.querySelector<HTMLElement>(`.pocket-chips .pocket-cta[data-pocket-for="${CSS.escape(id)}"]`)
				if (!chip) return null
				const r = chip.getBoundingClientRect()
				const x = r.left + r.width / 2
				const y = r.top + r.height / 2
				const hit = document.elementFromPoint(x, y)
				return { x, y, reached: !!hit && (hit === chip || chip.contains(hit)), label: chip.getAttribute('aria-label') ?? chip.textContent?.trim() ?? '' }
			}, found!.id)
			check('d', chip?.reached, 'a press reaches the chip while the card is hovered')
			await page.mouse.move(chip!.x, chip!.y, { steps: 4 })
			await pressAt(chip!.x, chip!.y, `the chip "${chip!.label}"`)
			await page.waitForFunction((id) => ((window as any).__aixc.demos.pocket.store.all() as any[]).some((r) => r.id === id), found!.id, { timeout: 8_000 }).catch(() => fail('d', 'the sticker was not kept in the Pocket'))
			const b = await pocketButton('d')
			const expected = before.keys.length + 1
			check('d', b.count === String(expected), `the Pocket button shows ${expected} (it shows "${b.count}")`)
			check('d', b.reached, `a press at the Pocket button's centre reaches it (it reaches ${b.onTop})`)
			check('d', b.left < b.innerWidth / 2 && b.bottomGap >= 0 && b.bottomGap < 200, `the Pocket button is at the bottom-left (left ${b.left}, ${b.bottomGap} px above the bottom)`)
			return { count: Number(b.count), left: b.left, bottomGap: b.bottomGap, side: b.side }
		})

		await step('e', 'open the album with the Pocket button, see the sticker, close it with Back: the page is at the same scroll', async () => {
			const b = await pocketButton('e')
			const before = await page.evaluate(() => Math.round(scrollY))
			await pressAt(b.x, b.y, 'the Pocket button')
			await albumShows('e')
			await sleep(500)
			const stickers = await page.evaluate(() => [...document.querySelectorAll<HTMLAnchorElement>('#pocket-output .pocket-sticker a[href]')].map((a) => a.href))
			check('e', stickers.includes(card!.href), `the album shows the sticker (${stickers.length} links: ${stickers.join(' ')})`)
			const how = await closeAlbum('e')
			const after = await page.evaluate(() => Math.round(scrollY))
			check('e', Math.abs(after - before) <= 2, `the page is back at the same scroll (${before} before, ${after} after)`)
			const same = differences(start!, await furniture())
			check('e', same.length === 0, `Vodafone's button and banner as before the album: ${same.join('; ')}`)
			return { scrollBefore: before, scrollAfter: after, closedWith: how, stickers: stickers.length }
		})

		await step('f', "reload the page (the signed-out theme clears localStorage): the sticker is still there", async () => {
			room()
			await pace()
			lastLoad = Date.now()
			const res = await page.reload({ waitUntil: 'domcontentloaded', timeout: 45_000 })
			recordLoad('reload', page.url(), res?.status() ?? null)
			await stopIfBlocked(res?.status() ?? null)
			await page.waitForLoadState('load', { timeout: 45_000 }).catch(() => {})
			await layerReady('f')
			await beforePress()
			const s = await pocketState()
			check('f', s.ids.includes(card!.id), `the Pocket still holds the sticker after the reload (${s.ids.join(', ') || 'nothing'})`)
			const b = await pocketButton('f')
			check('f', b.count === String((keysBefore?.length ?? 0) + 1), `the Pocket button shows ${(keysBefore?.length ?? 0) + 1} after the reload (it shows "${b.count}")`)
			await pressAt(b.x, b.y, 'the Pocket button')
			await albumShows('f')
			await sleep(500)
			const stickers = await page.evaluate(() => [...document.querySelectorAll<HTMLAnchorElement>('#pocket-output .pocket-sticker a[href]')].map((a) => a.href))
			check('f', stickers.includes(card!.href), 'the album holds the sticker after the reload')
			await closeAlbum('f')
			return { status: res?.status() ?? null, count: Number(b.count), localStorageKeys: await page.evaluate(() => localStorage.length) }
		})

		await step('g', '"Your journey" from the pill, in place (the trail\'s consent card is ours: allowed if it shows)', async () => {
			await page.mouse.wheel(0, -8000)
			await sleep(700)
			await page.waitForFunction(() => (window as any).__vgTrailActive?.state?.consent !== undefined, null, { timeout: 20_000 }).catch(() => fail('g', "the trail did not start on the page (is it on in the site's config?)"))
			await page.waitForFunction(() => !!(window as any).__aixc?.demos?.pocket?.journey?.(), null, { timeout: 20_000 }).catch(() => fail('g', "the layer's album did not take the journey (no claim)"))
			const consent = await page.evaluate(() => (window as any).__vgTrailActive.state.consent as string)
			await page.waitForSelector('.tr-pill', { state: 'visible', timeout: 15_000 }).catch(() => fail('g', 'the trail\'s pill did not show'))
			const urlBefore = page.url()
			let navigations = 0
			const onNav = (f: { parentFrame(): unknown }) => {
				if (!f.parentFrame()) navigations++
			}
			page.on('framenavigated', onNav)
			try {
				const journeyOpen = () => page.locator('.pocket-journey-layer:not([hidden])').count()
				await pressLocator('.tr-pill', 'the trail\'s pill ("Your journey")')
				let allowed = false
				for (let i = 0; i < 40; i++) {
					if (await journeyOpen()) break
					if (await page.locator('.tr-allow').first().isVisible().catch(() => false)) {
						await pressLocator('.tr-allow', "allow in the trail's own consent card")
						allowed = true
						await page.waitForFunction(() => (window as any).__vgTrailActive.state.consent === 'granted', null, { timeout: 8_000 }).catch(() => fail('g', 'the trail did not take the consent'))
						grantedHere = consent !== 'granted'
						await sleep(800)
						if (!(await journeyOpen())) {
							await page.mouse.wheel(0, -8000)
							await sleep(500)
							await page.waitForSelector('.tr-pill', { state: 'visible', timeout: 10_000 }).catch(() => {})
							await pressLocator('.tr-pill', 'the trail\'s pill again, after the consent')
						}
						continue
					}
					await sleep(250)
				}
				await page.waitForSelector('.pocket-journey-layer:not([hidden])', { timeout: 15_000 }).catch(() => fail('g', 'the journey did not show in the album'))
				await sleep(600)
				const s = await page.evaluate(() => ({ view: (window as any).__aixc?.demos?.pocket?.state?.view ?? null, sheet: document.querySelector('vg-guide')?.shadowRoot?.querySelector('.tr-sheet:not([hidden])') ? 1 : document.querySelectorAll('.tr-sheet:not([hidden])').length }))
				check('g', page.url() === urlBefore, `the address is unchanged (${urlBefore} then ${page.url()})`)
				check('g', navigations === 0, `nothing navigated (${navigations})`)
				check('g', s.view === 'pocket', `the journey shows in the album (the view is ${s.view})`)
				const sheetCount = await page.locator('.tr-sheet:not([hidden])').count()
				check('g', sheetCount === 0, "the guide's own sheet is not open")
				// Escape from the journey's slider closes the journey; the album's Back button turns the page back.
				await beforePress()
				await page.locator('.pocket-journey-rail').first().focus().catch(() => {})
				report.presses++
				log('  key: Escape (closes the journey)')
				await page.keyboard.press('Escape')
				await page.waitForSelector('.pocket-journey-layer', { state: 'hidden', timeout: 10_000 }).catch(() => fail('g', 'the journey did not close on Escape'))
				await closeAlbum('g')
				return { consentBefore: consent, allowedHere: allowed, url: 'unchanged', navigations }
			} finally {
				page.off('framenavigated', onNav)
			}
		})

		await step('h', "press the sticker's own link in the album and count the requests for its address (a measurement, OD-4); then Back", async () => {
			const b = await pocketButton('h')
			await pressAt(b.x, b.y, 'the Pocket button')
			await albumShows('h')
			await page.waitForSelector('style[data-aixc-css="pocket-portal"]', { state: 'attached', timeout: 10_000 }).catch(() => log("  (the portal's stylesheet is not on the page: the link may just navigate)"))
			await sleep(1500)
			const link = await page.evaluate(async (href) => {
				const a = [...document.querySelectorAll<HTMLAnchorElement>('#pocket-output .pocket-sticker a[href]')].find((x) => x.href === href)
				if (!a) return null
				a.scrollIntoView({ block: 'center' })
				await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(done, 80))))
				const r = a.getBoundingClientRect()
				const x = r.left + r.width / 2
				const y = r.top + r.height / 2
				const hit = document.elementFromPoint(x, y)
				return { href: a.href, x, y, reached: !!hit && (hit === a || a.contains(hit)) }
			}, card!.href)
			check('h', link?.reached, "a press reaches the sticker's link in the album")
			const dest = link!.href.split('#')[0]
			if (hooks.beforeDestination) await hooks.beforeDestination(page, dest)
			room()
			const count = await countRequests(page, dest, async () => {
				await pace()
				const nav = page.waitForEvent('framenavigated', { predicate: (f) => f === page.mainFrame() && f.url().split('#')[0] === dest, timeout: 20_000 })
				nav.catch(() => {})
				lastLoad = Date.now()
				await pressAt(link!.x, link!.y, `the sticker's link (${dest})`)
				await nav.catch(() => fail('h', `the press did not go to ${dest}`))
				await page.waitForLoadState('domcontentloaded', { timeout: 45_000 }).catch(() => {})
			})
			recordLoad('the sticker\'s link', dest, count.status)
			report.requests = count
			log(`  ${count.line}`)
			log(`  each request (DevTools Protocol): ${JSON.stringify(count.detail)}`)
			log(`  as Playwright's page saw them: ${JSON.stringify(count.seenByPlaywright)}`)
			log(`  Cache-Control: ${count.cacheControl.join(' | ') || '(none)'}; Vary: ${count.vary.join(' | ') || '(none)'}; Set-Cookie names: ${count.setCookieNames.join(', ') || '(none)'}; the portal ran: ${count.portalRan}`)
			await stopIfBlocked(count.status)
			room()
			await pace()
			lastLoad = Date.now()
			const res = await page.goBack({ waitUntil: 'domcontentloaded', timeout: 45_000 })
			recordLoad('Back', page.url(), res?.status() ?? null)
			await stopIfBlocked(res?.status() ?? null)
			await page.waitForLoadState('load', { timeout: 45_000 }).catch(() => {})
			check('h', page.url().split('#')[0] === url, `Back is on the page again (${page.url()})`)
			await layerReady('h')
			const s = await pocketState()
			if (s.view === 'pocket') {
				await albumShows('h')
				await closeAlbum('h')
			}
			return { network: count.network, fetch: count.fetch, navigation: count.navigation, fromCache: count.fromCache, status: count.status, portalRan: count.portalRan }
		})

		await step('i', "compare: no [AIXC] error, no page error from the layer, Vodafone's button and banner untouched, every element of the layer marked, the layer still ready", async () => {
			if (hooks.beforeCompare) await hooks.beforeCompare(page)
			const errors = report.layerConsole.filter((l) => l.startsWith('error:'))
			check('i', errors.length === 0, `no [AIXC] error in the console: ${errors.join(' | ')}`)
			check('i', report.layerPageErrors.length === 0, `no page error came from the layer: ${report.layerPageErrors.join(' | ')}`)
			// Read after any transition has settled (the button has `transition: all .25s`): a move mid-way would read as the start.
			await sleep(600)
			const now = await furniture()
			const diff = differences(start!, now)
			check('i', diff.length === 0, `Vodafone's accessibility button and cookie banner as at the start: ${diff.join('; ')}`)
			const marks = await page.evaluate((sel) => {
				const all = [...document.querySelectorAll(sel)].filter((n) => !n.closest('#main-content [data-aixc-item], #main-content [data-aixc-section]') || n.closest('[data-aixc]'))
				const unmarked = all.filter((n) => !n.closest('[data-aixc]')).map((n) => `${n.localName}.${String(n.getAttribute('class') ?? '').split(' ')[0]}`)
				return { n: all.length, unmarked: [...new Set(unmarked)].slice(0, 10) }
			}, LAYER_SELECTOR)
			check('i', marks.unmarked.length === 0, `every element of the layer is inside a data-aixc root: ${marks.unmarked.join(', ')}`)
			const state = await page.evaluate(() => (window as any).__aixc?.state ?? null)
			check('i', state === 'ready', `the layer is still ready (${state})`)
			const warnings = report.layerConsole.filter((l) => l.startsWith('warning:'))
			return { layerElements: marks.n, warnings: warnings.length, loads: report.loads.length, presses: report.presses }
		})

		report.outcome = 'passed'
		log(`PASSED ${pathname}: ${report.loads.length} page loads, ${report.presses} presses`)
		return report
	} catch (e) {
		if (e instanceof BannerShows) {
			report.outcome = 'skipped: banner'
			report.message = BANNER_MESSAGE
			report.steps.push({ id: 'b', name: 'the cookie banner shows: nothing more is pressed', ok: false, detail: 'skipped: banner' })
			log(`SKIPPED: ${BANNER_MESSAGE}`)
			return report
		}
		if (!(e instanceof SmokeStop)) {
			report.outcome = 'failed'
			report.message = (e as Error).message
			log(`FAILED: ${report.message}`)
			if (!(e instanceof SmokeFailure)) throw new SmokeFailure((e as Error).message, report)
		}
		throw e
	} finally {
		page.off('console', onConsole)
		page.off('pageerror', onPageError)
		await cleanUp(page, keysBefore, grantedHere, report, log)
	}
}

/**
 * The layer's own records this run made, removed: the stickers it added (through the Pocket's store when
 * the layer runs here, else straight from the Pocket's own IndexedDB database, aixc-v1) and, only if this
 * run gave the trail's consent, the trail's journey and consent (its own reset). Nothing else is touched.
 */
async function cleanUp(page: Page, keysBefore: string[] | null, grantedHere: boolean, report: SmokeReport, log: (line: string) => void) {
	if (keysBefore === null) return
	try {
		const removed = await page.evaluate(async (keep) => {
			const p = (window as any).__aixc?.demos?.pocket
			if (p?.store) {
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
		report.cleanup.push(`removed ${removed.n} sticker(s) this run added, through ${removed.via}`)
	} catch (e) {
		report.cleanup.push(`the stickers could not be removed: ${(e as Error).message}`)
	}
	if (grantedHere) {
		try {
			const r = await page.evaluate(async () => {
				const host = (window as any).voiceGuide?.trailHost
				return host?.reset ? await host.reset() : { ok: false, reason: 'no trail on this page' }
			})
			report.cleanup.push(r.ok ? "the trail's journey and consent this run made: reset" : `the trail was not reset (${r.reason})`)
		} catch (e) {
			report.cleanup.push(`the trail was not reset: ${(e as Error).message}`)
		}
	} else report.cleanup.push("the trail: left as it was (this run did not give its consent)")
	for (const line of report.cleanup) log(`clean-up: ${line}`)
}

/** Where a script-started request came from: the first frames of its stack (function and file, no query). */
const stackTop = (initiator: { stack?: { callFrames: { functionName: string; url: string; lineNumber: number }[]; parent?: unknown } } | undefined) =>
	(initiator?.stack?.callFrames ?? [])
		.slice(0, 3)
		.map((f) => `${f.functionName || '(anonymous)'}@${f.url.split('?')[0].split('/').pop()}:${f.lineNumber + 1}`)
		.join(' < ')

/**
 * Runs `act` (the press that navigates) while a DevTools Protocol session on the page counts the requests
 * for `url`: by kind (the portal's fetch, the navigation's document), what the cache served, the
 * responses' Cache-Control and Vary, and the names (never the values) of the cookies they set.
 */
async function countRequests(page: Page, url: string, act: () => Promise<void>): Promise<RequestCount> {
	const cdp: CDPSession = await page.context().newCDPSession(page)
	const reqs = new Map<string, { type: string; initiator: string; status: number | null; redirected: boolean; frameId: string; loader: string; atMs: number; failed: string | null; by: string; fromDestination: boolean }>()
	const cached = new Set<string>()
	const headers = { cacheControl: new Set<string>(), vary: new Set<string>(), cookies: new Set<string>() }
	let status: number | null = null
	const same = (u: string) => u.split('#')[0] === url
	const read = (h: Record<string, string>) => {
		for (const [k, v] of Object.entries(h)) {
			const name = k.toLowerCase()
			if (name === 'cache-control') headers.cacheControl.add(v)
			if (name === 'vary') headers.vary.add(v)
			if (name === 'set-cookie') for (const line of String(v).split('\n')) headers.cookies.add(line.split('=')[0].trim())
		}
	}
	cdp.on('Network.requestWillBeSent', (e) => {
		if (!same(e.request.url)) return
		const known = reqs.get(e.requestId)
		if (known) known.redirected = true
		else reqs.set(e.requestId, { type: e.type ?? 'Other', initiator: e.initiator?.type ?? 'other', status: null, redirected: !!e.redirectResponse, frameId: e.frameId ?? '', loader: (e.loaderId ?? '').slice(0, 8), atMs: Date.now() - t0, failed: null, by: stackTop(e.initiator), fromDestination: (e.initiator?.stack?.callFrames ?? []).some((f) => f.url.split('#')[0].split('?')[0] === url.split('?')[0]) })
	})
	cdp.on('Network.requestServedFromCache', (e) => {
		if (reqs.has(e.requestId)) cached.add(e.requestId)
	})
	cdp.on('Network.responseReceived', (e) => {
		const known = reqs.get(e.requestId)
		if (!known) return
		known.status = e.response.status
		if (e.response.fromDiskCache || e.response.fromPrefetchCache) cached.add(e.requestId)
		if (e.type === 'Document' && status === null) status = e.response.status
		read(e.response.headers)
	})
	cdp.on('Network.loadingFailed', (e) => {
		const known = reqs.get(e.requestId)
		if (known) known.failed = `${e.errorText}${e.canceled ? ' (canceled)' : ''}`
	})
	const pw: { type: string; failure: string | null; r: unknown }[] = []
	const onReq = (r: import('playwright').Request) => {
		if (same(r.url())) pw.push({ type: r.resourceType(), failure: null, r })
	}
	const onFail = (r: import('playwright').Request) => {
		const x = pw.find((y) => y.r === r)
		if (x) x.failure = r.failure()?.errorText ?? 'failed'
	}
	page.on('request', onReq)
	page.on('requestfailed', onFail)
	cdp.on('Network.responseReceivedExtraInfo', (e) => {
		if (reqs.has(e.requestId)) read(e.headers)
	})
	const t0 = Date.now()
	const tree = await cdp.send('Page.getFrameTree').catch(() => null)
	const mainId = tree?.frameTree.frame.id ?? ''
	await cdp.send('Network.enable')
	let portalRan = false
	const watchPortal = setInterval(() => {
		void page
			.evaluate(() => !!document.querySelector('.vf-portal') || document.documentElement.dataset.vfPortal === 'active')
			.then((x) => {
				if (x) portalRan = true
			})
			.catch(() => {})
	}, 100)
	try {
		await act()
		await sleep(1500)
	} finally {
		clearInterval(watchPortal)
		page.off('request', onReq)
		page.off('requestfailed', onFail)
		await cdp.detach().catch(() => {})
	}
	const every = [...reqs.entries()]
	const byDestination = every.filter(([, r]) => r.type === 'Document' && r.fromDestination).length
	const all = every.filter(([, r]) => !(r.type === 'Document' && r.fromDestination))
	const fetch = all.filter(([, r]) => r.type === 'Fetch' || r.type === 'XHR').length
	const navigation = all.filter(([, r]) => r.type === 'Document').length
	const fromCache = all.filter(([id]) => cached.has(id)).length
	const network = fetch + navigation - all.filter(([id, r]) => cached.has(id) && r.type !== 'Other').length // ('Other': neither the fetch nor the navigation)
	return {
		url,
		network,
		fetch,
		navigation,
		fromCache,
		byDestination,
		other: all.length - fetch - navigation,
		cacheControl: [...headers.cacheControl],
		vary: [...headers.vary],
		setCookieNames: [...headers.cookies].filter(Boolean),
		status,
		portalRan,
		detail: every.map(([id, r]) => ({ type: r.type, initiator: r.initiator, status: r.status, fromCache: cached.has(id), redirected: r.redirected, mainFrame: r.frameId === mainId, loader: r.loader, atMs: r.atMs, failed: r.failed, by: r.by })),
		seenByPlaywright: pw.map((x) => ({ type: x.type, failure: x.failure })),
		line: `the destination was requested ${network} times from the network (fetch: ${fetch}, navigation: ${navigation}, from cache: ${fromCache})${byDestination ? `; then the destination page's own script asked for it ${byDestination} more time(s)` : ''}`,
	}
}
