/**
 * Reimagine's shell on Vodafone's own pages (live plan phase 4a; ADR-0076; phase 4 design §3.1 to §3.5), on the saved
 * pages with the live-page kit (./vodafone-layer.ts), the trail on, Owl's layout and AutoRefresh, Vodafone's navigation
 * pinning on scroll as its own script does (one run with it always pinned), in English and Arabic, at 1366x900 and
 * 375x812 (spotlight also at 1366x768 and 1024x768).
 *
 * - One row per experience (EXPERIENCE_CASES, checkInBox; magazine, spotlight, fan, coverflow, split, ring, gallery,
 *   journey, cube and tunnel now, the three others listed as todo until phase 4 brings them): the checks below, prev and next moving the box and not the window, reveal(), and
 *   the experience's own unmount giving back all the seam held for it (state.debug().kept).
 * - The view in its box: #main-content hidden laid out (ADR-0075 §2), the box from the header's pinned bottom to the
 *   screen's bottom after the open scroll, its own scroll (the window's does not move), every item once, one exposed
 *   h1, no sideways overflow, nothing of the view cut by the box's sides at its end (the closing band's store links),
 *   each section's destination on one element of the view (ADR-0049 §4).
 * - Vodafone's accessibility button and cookie banner, and the guide's microphone, as with ?aixc=off while a view
 *   shows (rules c, d and e of ./floating-controls.ts).
 * - The Pocket over a view: its resting curl not drawn and its button shown; during the album's turn the curl draws,
 *   and the turning copy shows the box where the reader left it; the album's open and close keep the box's scroll.
 * - Original gives #main-content back as served, Owl's carousels painted, the window's scroll where the reader left
 *   it; Reimagined comes back to the same experience at the same box scroll; Reset; a new experience at its top.
 * - The view bar's buttons never under the trail's pill (B-23); our words in Vodafone's faces (CDP); the composer:
 *   templates only, Escape, the launcher's second press, Vodafone's menus close it, its height above both corners; on a
 *   short screen below its opener and the pill where the room there is at least H_MIN, else beside its opener on its
 *   inline-start side, clear of the pill and the launcher, where that column is at least W_MIN by H_MIN (phones in
 *   landscape, short laptops, en and ar: a template pressed there opens its view), else below them scrolling in the
 *   room there is; Original from the bar or the end band closes it, never in Vodafone's header band.
 * - A template still loading (its chunk held back) is dropped when the reader opens the album, presses Original or
 *   Escape, and kept when one of Vodafone's menus closes the composer (its view opens when its chunk arrives); two
 *   quick presses while the shell's chunk loads open the composer once; a resize across Vodafone's phone and desktop
 *   header keeps the box's bottom at the screen's.
 * - Spotlight in the box: the stage pinned at the bar with its bottom at the box's, prev and next, its controls and
 *   queue out of both corners' safe zones (the guide listening too), the row under the title on phones, card 5 back
 *   after Original; the words about services on Services only.
 * - The trail's cover is #main-content as it shows, kept by a journey that starts later; the icons a page lacks are
 *   ours and prefixed; forced failures and the guard's stop give the page back with nothing of ours listening.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { pathToFileURL } from 'node:url'

import type { Page } from 'playwright'

import { ROOT } from '#shared/config.ts'

import { cellHits, cellViolations, measureControls } from './floating-controls.ts'
import { DESKTOP, geometry, type LayerGateway, type LayerOptions, launchLayer, layerState, open, PHONE, REPLAY, startLayerGateway, watch } from './vodafone-layer.ts'

// 4482 by default; VG_REIMAGINE_LIVE_PORT lets builders in parallel worktrees run their rows at once (4484, 4490,
// 4492, 4494). tests/live/aixc-layer.live.test.ts keeps 4482 for itself (VG_LIVE=1 only): not both at once.
const PORT = Number(process.env.VG_REIMAGINE_LIVE_PORT ?? 4482)
let gw: LayerGateway
/** Our chunks as the build named them (packages/sdk/dist/aixc/manifest.json): the shell's, the experiences' and what they import. */
let ours: string[] = []
/** Each of Reimagine's entries' own chunk, by entry (a test holds one back, as a slow network would). */
const chunkOf: Record<string, string> = {}

before(async () => {
	gw = await startLayerGateway(PORT, { trail: true })
	const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'packages/sdk/dist/aixc/manifest.json'), 'utf8')) as { files: { file: string; entry: string | null; imports: { file: string; kind: string }[] }[] }
	const core = new Set(['aixc.js'])
	for (const f of core) for (const i of manifest.files.find((x) => x.file === f)?.imports ?? []) if (i.kind === 'import-statement') core.add(i.file)
	// The composer's order, and every experience of it a row of EXPERIENCE_CASES.
	const schema = (await import(pathToFileURL(path.join(ROOT, '../experiences/src/aixc/template-schema.js')).href)) as { TEMPLATE_CARDS: { id: string }[] }
	templateOrder = schema.TEMPLATE_CARDS.map((c) => c.id)
	assert.deepEqual([...templateOrder].sort(), Object.keys(EXPERIENCE_CASES).sort(), 'a row of EXPERIENCE_CASES for each of the composer\'s templates')
	const files = new Set<string>()
	// The shell's entries and each registered experience's (the rows that are not todo).
	const registered = Object.keys(EXPERIENCE_CASES).filter((name) => !EXPERIENCE_CASES[name].todo)
	for (const entry of ['src/host/demos/reimagine.js', 'src/host/demos/reimagine/shell.js', ...registered.map((name) => `src/host/demos/reimagine/${name}.js`)]) {
		const chunk = manifest.files.find((f) => f.entry === entry)
		if (chunk) {
			files.add(chunk.file)
			chunkOf[entry] = chunk.file
		}
	}
	for (const f of files) for (const i of manifest.files.find((x) => x.file === f)?.imports ?? []) if (i.kind === 'import-statement' && !core.has(i.file)) files.add(i.file)
	ours = [...files]
})
after(async () => {
	await gw?.close()
})

/* eslint-disable @typescript-eslint/no-explicit-any */
type Box = { left: number; top: number; right: number; bottom: number }
const meets = (a: Box, b: Box) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
const fmt = (b: Box | null | undefined) => (b ? `[${[b.left, b.top, b.right, b.bottom].map((n) => Math.round(n)).join(',')}]` : 'none')
const sizeOf = (v: { width: number; height: number }) => `${v.width}x${v.height}`
const LAPTOP = { width: 1366, height: 768 }
const TABLET = { width: 1024, height: 768 }

/** The kit as a reader meets the live page: Owl's layout and AutoRefresh, the navigation pinning on scroll. */
const LIVE: LayerOptions = { owl: true, owlAutoRefresh: true, fixedHeader: 'scroll' }

/** Two frames and a little more. */
const settle = (page: Page, ms = 60) => page.evaluate((ms) => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(done, ms)))), ms)

/** The layer is up, the launcher's chunk has started and its button shows. */
async function ready(page: Page) {
	await page.waitForFunction(() => (window as any).__aixc?.demos?.reimagine && !document.querySelector<HTMLElement>('.aixc-launcher')?.hidden, null, { timeout: 20_000 })
	await settle(page, 200)
}

const state = (page: Page) => page.evaluate(() => {
	const s = (window as any).__aixc?.demos?.reimagine?.state
	return s ? { view: s.view as string, template: s.template as string | null, composerOpen: s.composerOpen as boolean, boxScroll: s.boxScroll as number, debug: s.debug?.() ?? null } : null
})

/** A press on the launcher; the composer opens. */
async function openComposer(page: Page) {
	await page.locator('.aixc-launcher').click()
	await page.waitForSelector('#aixc-composer:not([hidden])', { timeout: 10_000 })
	await settle(page)
}

/** A template chosen in the composer (opened from the launcher, or from the bar's "Change experience"); the view shows. */
async function choose(page: Page, template: string) {
	if (!(await page.locator('#aixc-composer:not([hidden])').count())) await openComposer(page)
	await page.locator(`.aixc-template[data-template="${template}"]`).click()
	await page.waitForFunction((template) => {
		const s = (window as any).__aixc.demos.reimagine.state
		return s?.view === 'reimagined' && s.template === template && !!document.querySelector('.aixc-box:not([hidden]) > .aixc-stage > *')
	}, template, { timeout: 15_000 })
	await settle(page, 400)
}

/** The box and the page around it. */
const boxNow = (page: Page) =>
	page.evaluate(() => {
		const box = document.querySelector<HTMLElement>('.aixc-box')!
		const r = box.getBoundingClientRect()
		const bar = box.firstElementChild as HTMLElement | null
		return {
			hidden: box.hidden,
			top: r.top,
			bottom: r.bottom,
			clientTop: r.top + box.clientTop,
			clientBottom: r.top + box.clientTop + box.clientHeight,
			clientHeight: box.clientHeight,
			scrollTop: box.scrollTop,
			scrollHeight: box.scrollHeight,
			scrollWidth: box.scrollWidth,
			clientWidth: box.clientWidth,
			inner: innerHeight,
			scrollY,
			chrome: (window as any).__aixc.host.chromeBottom() as number,
			// The bottom of Vodafone's header where it meets the top of the screen, pinned or in the flow (as the trail and the launcher read it).
			header: Math.max((window as any).__aixc.host.chromeBottom(), ...[document.getElementById('header'), document.getElementById('nav-header')].map((n) => n?.getBoundingClientRect()).filter((r) => !!r && r.top <= 10 && r.bottom > 0 && r.height <= innerHeight * 0.35).map((r) => r!.bottom)),
			barFirst: !!bar && bar.classList.contains('aixc-viewbar') && bar.id === 'aixc-viewbar',
			barH: bar?.offsetHeight ?? 0,
			barSticky: bar ? getComputedStyle(bar).position : '',
			barSizing: bar ? getComputedStyle(bar).boxSizing : '',
			overflowY: getComputedStyle(box).overflowY,
			overscroll: getComputedStyle(box).overscrollBehaviorY,
			view: document.body.dataset.aixcView ?? null,
		}
	})

/** #main-content's attributes, and its box. */
const mainNow = (page: Page) =>
	page.evaluate(() => {
		const m = document.getElementById('main-content')!
		const r = m.getBoundingClientRect()
		return { style: m.getAttribute('style'), inert: m.getAttribute('inert'), hidden: m.getAttribute('hidden'), width: Math.round(r.width), height: Math.round(r.height), opacity: getComputedStyle(m).opacity, display: getComputedStyle(m).display }
	})

/** The trail's pill where it rests (its transform taken off). */
const pillOf = (page: Page) =>
	page.evaluate(() => {
		const p = document.querySelector('vg-guide')?.shadowRoot?.querySelector<HTMLElement>('.tr-pill')
		if (!p || p.hidden || !p.getClientRects().length) return null
		const r = p.getBoundingClientRect()
		const m = new DOMMatrixReadOnly(getComputedStyle(p).transform)
		return { left: r.left - m.e, top: r.top - m.f, right: r.right - m.e, bottom: r.bottom - m.f }
	})

/**
 * The bottom corners' safe zones as a person meets them, measured here from the controls (not from the shell): the
 * accessibility button, the guide's microphone (with its keyboard button and bar while they show) at the bottom-right,
 * the Pocket's button while it shows at the bottom-left, 16 px around each. Viewport boxes.
 */
const zonesNow = (page: Page) =>
	page.evaluate(() => {
		const shown = (n: Element | null | undefined) => {
			if (!n || !n.getClientRects().length) return null
			const r = n.getBoundingClientRect()
			const s = getComputedStyle(n)
			if (!(r.width > 0 && r.height > 0) || s.visibility === 'hidden' || Number(s.opacity) <= 0.05) return null
			if ((n as HTMLElement).dataset.state === 'hidden') return null
			return r
		}
		const root = document.querySelector('vg-guide')?.shadowRoot
		const right = [document.getElementById('vodafone-aw-icon'), root?.querySelector('.vg-mic'), root?.querySelector('.vg-kbd'), root?.querySelector('.vg-bar')].map(shown).filter(Boolean) as DOMRect[]
		const left = [document.querySelector('.pocket-peek')].map(shown).filter(Boolean) as DOMRect[]
		const zone = (list: DOMRect[]) => (list.length ? { left: Math.min(...list.map((r) => r.left)) - 16, top: Math.min(...list.map((r) => r.top)) - 16, right: Math.max(...list.map((r) => r.right)) + 16, bottom: Math.max(...list.map((r) => r.bottom)) + 16 } : null)
		return { right: zone(right), left: zone(left) }
	})

/** Every pressable element under `scope` that shows inside the box, and the zones it meets. */
const pressablesInZones = (page: Page, scope: string, zones: { right: Box | null; left: Box | null }) =>
	page.evaluate(
		({ scope, zones }) => {
			const box = document.querySelector('.aixc-box')!.getBoundingClientRect()
			const meets = (a: Box, b: Box) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
			const out: { what: string; zone: string; rect: number[] }[] = []
			let seen = 0
			for (const el of document.querySelectorAll<HTMLElement>(`${scope} :is(button, a[href], [tabindex="0"], input, select)`)) {
				const r = el.getBoundingClientRect()
				const s = getComputedStyle(el)
				if (!r.width || !r.height || el.closest('[inert], [hidden]') || s.visibility === 'hidden' || Number(s.opacity) === 0 || s.pointerEvents === 'none') continue
				if (r.bottom <= box.top || r.top >= box.bottom) continue
				seen++
				for (const [name, z] of Object.entries(zones)) if (z && meets(r, z)) out.push({ what: el.getAttribute('aria-label') || (el.textContent ?? '').trim().slice(0, 30), zone: name, rect: [r.left, r.top, r.right, r.bottom].map(Math.round) })
			}
			return { seen, out }
		},
		{ scope, zones },
	)

/**
 * The headings of level 1 a screen reader meets (the accessibility tree, not ignored), with the element each is: an h1,
 * or another element with role heading and aria-level 1 (Vodafone's header has one: a visually hidden h2 naming the page).
 */
async function exposedH1(page: Page) {
	const s = await page.context().newCDPSession(page)
	try {
		await s.send('Accessibility.enable')
		const { nodes } = await s.send('Accessibility.getFullAXTree')
		const out: { name: string; tag: string }[] = []
		for (const n of nodes as any[]) {
			if (n.ignored || n.role?.value !== 'heading' || !n.properties?.some((p: any) => p.name === 'level' && p.value?.value === 1)) continue
			const d = n.backendDOMNodeId ? await s.send('DOM.describeNode', { backendNodeId: n.backendDOMNodeId, depth: 0 }).catch(() => null) : null
			out.push({ name: String(n.name?.value ?? ''), tag: d?.node.localName ?? '' })
		}
		return out
	} finally {
		await s.detach().catch(() => {})
	}
}

/** The fonts Chrome drew the text of each element in (CSS.getPlatformFontsForNode), for every element `selector` finds. */
async function fontsOfSelectors(page: Page, selectors: string[]) {
	const s = await page.context().newCDPSession(page)
	const out: { what: string; text: string; fonts: { familyName: string; isCustomFont: boolean }[] }[] = []
	try {
		await s.send('DOM.enable')
		await s.send('CSS.enable')
		const { root } = await s.send('DOM.getDocument', { depth: -1 })
		for (const selector of selectors) {
			const { nodeIds } = await s.send('DOM.querySelectorAll', { nodeId: root.nodeId, selector })
			for (const nodeId of nodeIds.slice(0, 4)) {
				const { fonts } = await s.send('CSS.getPlatformFontsForNode', { nodeId })
				if (!fonts.length) continue
				const { outerHTML } = await s.send('DOM.getOuterHTML', { nodeId })
				out.push({ what: selector, text: outerHTML.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40), fonts: fonts.map((f: any) => ({ familyName: f.familyName, isCustomFont: f.isCustomFont })) })
			}
		}
		return out
	} finally {
		await s.detach().catch(() => {})
	}
}

/** Counts what our chunks add and do not take away: window and document listeners, observers, animation frames. */
const TRACK = (files: string[]) => `(() => {
	const files = ${JSON.stringify(files)}
	const ours = () => { const stack = new Error().stack || ''; return files.some((f) => stack.includes('/aixc/' + f)) }
	const live = { listeners: [], mo: new Set(), ro: new Set(), frames: new Set() }
	window.__track = live
	for (const [Ctor, set] of [[MutationObserver, live.mo], [ResizeObserver, live.ro]]) {
		const observe = Ctor.prototype.observe
		const disconnect = Ctor.prototype.disconnect
		Ctor.prototype.observe = function (target, o) { if (ours()) set.add(this); return observe.call(this, target, o) }
		Ctor.prototype.disconnect = function () { set.delete(this); return disconnect.call(this) }
	}
	const add = EventTarget.prototype.addEventListener
	const remove = EventTarget.prototype.removeEventListener
	const capture = (o) => (typeof o === 'boolean' ? o : !!(o && o.capture))
	EventTarget.prototype.addEventListener = function (type, fn, o) {
		if ((this === window || this === document) && fn && ours()) live.listeners.push({ target: this === window ? 'window' : 'document', type, fn, capture: capture(o) })
		return add.call(this, type, fn, o)
	}
	EventTarget.prototype.removeEventListener = function (type, fn, o) {
		const at = live.listeners.findIndex((l) => (l.target === 'window' ? window : document) === this && l.type === type && l.fn === fn && l.capture === capture(o))
		if (at >= 0) live.listeners.splice(at, 1)
		return remove.call(this, type, fn, o)
	}
	const raf = window.requestAnimationFrame.bind(window)
	const caf = window.cancelAnimationFrame.bind(window)
	window.requestAnimationFrame = (cb) => {
		if (!ours()) return raf(cb)
		const id = raf((t) => { live.frames.delete(id); cb(t) })
		live.frames.add(id)
		return id
	}
	window.cancelAnimationFrame = (id) => { live.frames.delete(id); return caf(id) }
})()`

const leftovers = (page: Page) =>
	page.evaluate(() => {
		const t = (window as any).__track
		return { listeners: t.listeners.map((l: any) => `${l.target}:${l.type}`), mo: t.mo.size as number, ro: t.ro.size as number, frames: t.frames.size as number }
	})

/** Pockets the first card whose chip a press reaches (as reimagine-launcher does). */
async function pocketOne(page: Page) {
	await page.waitForFunction(() => (window as any).__aixc?.demos?.pocket?.chips?.()?.shown?.length > 0, null, { timeout: 15_000 })
	const at = await page.evaluate(async () => {
		const tick = () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(done, 60))))
		for (const chip of document.querySelectorAll<HTMLElement>('.pocket-chips .pocket-cta[data-pocket-for]')) {
			const id = chip.dataset.pocketFor!
			const card = [...document.querySelectorAll<HTMLElement>(`#main-content [data-aixc-item="${CSS.escape(id)}"]`)].find((c) => !c.closest('.owl-item.cloned'))
			if (!card) continue
			card.scrollIntoView({ block: 'center', inline: 'nearest' })
			await tick()
			const r = chip.getBoundingClientRect()
			const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
			if (r.width && hit && (hit === chip || chip.contains(hit))) return { id, x: r.left + r.width / 2, y: r.top + r.height / 2 }
		}
		return null
	})
	assert.ok(at, 'a chip a press reaches')
	await page.mouse.click(at.x, at.y)
	await page.waitForFunction((id) => (window as any).__aixc.demos.pocket.store.all().some((r: any) => r.id === id), at.id, { timeout: 5_000 })
	await page.evaluate(() => scrollTo(0, 0))
	await settle(page, 600)
}

/** Clicks the element `selector` finds inside the box with the mouse at its centre, after checking a press there reaches it. */
async function pressIn(page: Page, selector: string) {
	const at = await page.evaluate((selector) => {
		const el = document.querySelector<HTMLElement>(selector)
		if (!el) return null
		const r = el.getBoundingClientRect()
		const x = r.left + r.width / 2
		const y = r.top + r.height / 2
		const hit = document.elementFromPoint(x, y)
		return { x, y, reaches: !!hit && (hit === el || el.contains(hit)), hit: hit ? `${hit.localName}.${String(hit.getAttribute('class') ?? '').split(' ')[0]}` : 'nothing' }
	}, selector)
	assert.ok(at, `${selector} is on the page`)
	assert.ok(at.reaches, `a press at ${selector}'s centre reaches it (it reaches ${at.hit})`)
	await page.mouse.click(at.x, at.y)
}

/**
 * Holds back the chunk of one of Reimagine's entries, as a slow network would, until `release()`; `requested` settles
 * when the page asks for it. The held request then goes on to the browser's own routes (the replay and the gateway).
 */
async function holdChunk(page: Page, entry: string) {
	const file = chunkOf[entry]
	assert.ok(file, `${entry} is built as a chunk of its own`)
	let release!: () => void
	const released = new Promise<void>((done) => (release = done))
	let asked!: () => void
	const requested = new Promise<void>((done) => (asked = done))
	await page.route(
		(url) => url.pathname.endsWith(`/${file}`),
		async (route) => {
			asked()
			await released
			await route.fallback()
		},
	)
	return { requested, release }
}

/** Where Reimagine stands: its view, body's mark, the box, the composer, the launcher, the experience in the stage. */
const viewNow = (page: Page) =>
	page.evaluate(() => {
		const s = (window as any).__aixc.demos.reimagine.state
		return {
			view: s.view as string,
			body: document.body.dataset.aixcView ?? null,
			boxHidden: document.querySelector<HTMLElement>('.aixc-box')!.hidden,
			composerOpen: s.composerOpen as boolean,
			composerHidden: document.getElementById('aixc-composer')!.hidden,
			launcher: !document.querySelector<HTMLElement>('.aixc-launcher')!.hidden,
			mounted: !!s.activeExperience?.mounted,
			template: s.template as string | null,
			spotlight: !!document.querySelector('.aixc-box .sp-stage'),
		}
	})

/** The bottom of Vodafone's header where it meets the top of the screen, pinned or in the flow (as the shell and the launcher read it). */
const headerBottomOf = (page: Page) =>
	page.evaluate(() => Math.max((window as any).__aixc.host.chromeBottom(), ...[document.getElementById('header'), document.getElementById('nav-header')].map((n) => n?.getBoundingClientRect()).filter((r) => !!r && r.top <= 10 && r.bottom > 0 && r.height <= innerHeight * 0.35).map((r) => r!.bottom)))

/* -------------------------------------------------------------------------------------------------- the box */

/**
 * One run of a box check: a page at a size. `fixedHeader` left out is LIVE's ('scroll': the navigation pins on scroll),
 * and the run's name gives it only when it is set. `motion`: the reader allows motion (prefers-reduced-motion:
 * no-preference, as most readers have it); left out, the run reduces it as every other run here does. The run's name
 * says "motion" when it is set.
 */
type Cell = { p: string; viewport: { width: number; height: number }; fixedHeader?: LayerOptions['fixedHeader']; motion?: boolean }

/**
 * One experience in the box (ADR-0076; the phase 4b plan's Phase 1): what checkInBox applies to it beyond the checks
 * every view gets, and the row's own checks. Phases 2 to 4 add an experience by taking its `todo` off and confirming
 * its selectors.
 */
type ExperienceCase = {
	/** While set, the experience is not in the live registry yet: the run lists it (test.todo) and checks nothing. */
	todo?: string
	/** The test's title; else `<name> in the box: the N-cell matrix`. */
	title?: string
	timeout?: number
	cells: Cell[]
	/** Phones in landscape (812x375) too, on the four pages: for experiences whose controls sit low. */
	landscape?: boolean
	/** Something pocketed before the view opens: the Pocket's button shows at the bottom-left, so both corners have a zone. */
	pocketed: boolean
	/** A stage that pins at the bar while the box scrolls through its track (selectors inside the box). */
	pins: false | { stage: string; track: string }
	/**
	 * The cells where the experience lays its stage flat by design (tunnel under reduced motion, or in a box too short
	 * for its stage): there the stage does not pin (checked: it is not sticky) and has no prev and next to step; every
	 * other check as anywhere.
	 */
	flat?: (cell: Cell) => boolean
	/** What pressablesInZones reads; else the pinned stage, or the whole view when nothing pins. */
	zoneScope?: string
	/** The controls (inside the box) kept clear of both corners' zones; one not shown is skipped. Needs `pocketed`. */
	controlSelectors: string[]
	/** Prev and next, and the counter they move (selectors inside the box); `distance` the box's scroll per step. */
	step?: { next: string; prev: string; counter: string; distance?: number }
	/** In place of the generic reveal check (`itemId` a middle item of the page's model). */
	revealAssert?: (page: Page, itemId: string, where: string) => Promise<void>
	/** While the composer shows, before the template is pressed. */
	composer?: (page: Page, cell: Cell, where: string) => Promise<void>
	/** The row's own checks: after the generic ones, the pin, the zones and the step, before the reveal and Original. */
	specifics?: (page: Page, cell: Cell, where: string) => Promise<void>
	/** Once, after every cell, in the same test. */
	andThen?: () => Promise<void>
	/** An experience that adds no listener, frame, timer or observer through the seam: the seam holds none while it shows. */
	keepsNone?: boolean
}

const PAGES = ['/en/services', '/ar/services', '/en/home', '/ar/home']
const LANDSCAPE = { width: 812, height: 375 }
/** 1366x900, 1366x768, 1024x768 and 375x812, in English and Arabic, on Services and Home: 16 cells. */
const DEFAULT_CELLS: Cell[] = [DESKTOP, LAPTOP, TABLET, PHONE].flatMap((viewport) => PAGES.map((p) => ({ p, viewport })))
const LANDSCAPE_CELLS: Cell[] = PAGES.map((p) => ({ p, viewport: LANDSCAPE }))
const PHASE_4B = 'phase 4b: not in the registry yet'

/** The composer's order of templates (experiences/src/aixc/template-schema.js TEMPLATE_CARDS), read in before(). */
let templateOrder: string[] = []

const EXPERIENCE_CASES: Record<string, ExperienceCase> = {
	magazine: {
		title: 'magazine in the box: #main-content hidden laid out, the box under the header to the screen\'s bottom, its own scroll, every item once, one h1, nothing sideways, each destination once',
		timeout: 900_000,
		cells: [
			...[DESKTOP, PHONE].flatMap((viewport) => PAGES.map((p): Cell => ({ p, viewport, fixedHeader: 'scroll' }))),
			...[LAPTOP, TABLET].flatMap((viewport) => ['/en/services', '/ar/services'].map((p): Cell => ({ p, viewport, fixedHeader: 'scroll' }))),
			...[DESKTOP, PHONE].map((viewport): Cell => ({ p: '/en/services', viewport, fixedHeader: true })),
		],
		pocketed: false,
		pins: false,
		controlSelectors: [],
		composer: async (page, _cell, where) => {
			const composer = await page.evaluate(() => {
				const c = document.getElementById('aixc-composer')!
				return { marked: c.hasAttribute('data-aixc') && c.hasAttribute('data-vg'), templates: [...c.querySelectorAll<HTMLElement>('.aixc-template')].map((b) => b.dataset.template), fields: c.querySelectorAll('input, textarea, select, #aixc-key').length, expanded: document.querySelector('.aixc-launcher')!.getAttribute('aria-expanded'), reimagined: c.querySelector<HTMLButtonElement>('.aixc-seg[data-view="reimagined"]')!.disabled }
			})
			// The registry's experiences, in the composer's order: the rows that are not todo.
			const registered = templateOrder.filter((name) => EXPERIENCE_CASES[name] && !EXPERIENCE_CASES[name].todo)
			assert.deepEqual(composer, { marked: true, templates: registered, fields: 0, expanded: 'true', reimagined: true }, `${where}: the composer: ours, templates only (the registry's ${registered.length}), no field, Reimagined not yet`)
		},
		specifics: async (page, cell, where) => {
			// Each section's destination on one element of the view, which holds that section's items.
			const dest = await page.evaluate(() => {
				const out: string[] = []
				const sections = (window as any).__aixc.model.sections.filter((s: any) => s.destinationId)
				for (const s of sections) {
					const nodes = document.querySelectorAll<HTMLElement>(`.aixc-box [data-vg-destination="${CSS.escape(s.destinationId)}"]`)
					const ids = new Set(s.items.map((i: any) => i.id))
					const holds = nodes.length === 1 && (ids.has(nodes[0].dataset.aixcItem) || [...nodes[0].querySelectorAll<HTMLElement>('[data-aixc-item]')].some((n) => ids.has(n.dataset.aixcItem)))
					if (!holds) out.push(`${s.destinationId}: ${nodes.length} elements`)
				}
				return { named: sections.length, out, outside: document.querySelectorAll('[data-vg-destination]:not(.aixc-box [data-vg-destination])').length }
			})
			// The Services pages have their sections named by the knowledge base (6, as aixc-layer.e2e checks): never an empty set here.
			if (/\/services$/.test(cell.p)) assert.ok(dest.named > 0, `${where}: the page's sections are named (${dest.named})`)
			assert.deepEqual(dest.out, [], `${where}: each destination on one element of the view (${dest.named} named)`)
			assert.equal(dest.outside, 0, `${where}: none on Vodafone's page`)
		},
	},
	spotlight: {
		title: 'spotlight in the box: pinned at the bar with its bottom at the box\'s, prev and next, controls and queue out of both corners, the row under the title on phones, card 5 back after Original',
		timeout: 900_000,
		cells: [DESKTOP, LAPTOP, TABLET, PHONE].flatMap((viewport) => ['/en/services', '/ar/services'].map((p) => ({ p, viewport }))),
		pocketed: true,
		pins: { stage: '.sp-stage', track: '.sp-track' },
		controlSelectors: ['.sp-controls', '.sp-queue'],
		// STEP_PX in spotlight.js: the box's scroll per service.
		step: { next: '.sp-controls .vx-round:nth-of-type(2)', prev: '.sp-controls .vx-round:nth-of-type(1)', counter: '.sp-counter__now', distance: 200 },
		specifics: async (page, cell, where) => {
			const s = await stageNow(page)
			// Its words about services on Services.
			assert.equal(s.prev, cell.p.startsWith('/ar') ? 'الخدمة اللي قبلها' : 'Previous service', `${where}: the clone's words on Services`)
			// On phones the row under the title, clear of the copy.
			if (cell.viewport === PHONE) {
				assert.ok(s.controls && s.title && s.controls.top >= s.title.bottom, `${where}: the row ${fmt(s.controls)} under the title ${fmt(s.title)}`)
				const over = s.parts.filter((x) => x.box.bottom > x.box.top && meets(x.box, s.controls!))
				assert.deepEqual(over.map((x) => x.what), [], `${where}: the copy clear of the row`)
			}
			// Card 5, Original, Reimagined: card 5.
			await stepTo(page, 5, where)
			await pressIn(page, '.aixc-viewbar .aixc-seg[data-view="original"]')
			await page.waitForFunction(() => (window as any).__aixc.demos.reimagine.state.view === 'original', null, { timeout: 5_000 })
			await settle(page, 300)
			await openComposer(page)
			await page.locator('#aixc-composer .aixc-seg[data-view="reimagined"]').click()
			await page.waitForFunction(() => (window as any).__aixc.demos.reimagine.state.view === 'reimagined', null, { timeout: 5_000 })
			await settle(page, 600)
			assert.equal((await stageNow(page)).counter, '05', `${where}: back on card 5`)
		},
		// Elsewhere, neutral words.
		andThen: async () => {
			for (const p of ['/en/home', '/ar/home']) {
				const l = await launchLayer(gw, { viewport: DESKTOP, reducedMotion: true, ...LIVE })
				try {
					await open(l.page, p, '?aixc-debug')
					await ready(l.page)
					await choose(l.page, 'spotlight')
					assert.equal((await stageNow(l.page)).prev, p.startsWith('/ar') ? 'السابق' : 'Previous', `${p}: neutral words where the page is not about services`)
				} finally {
					await l.close()
				}
			}
		},
	},
	/*
	 * The eleven still to come (phases 2 to 4). Their selectors, pins, steps and `landscape` are best guesses from
	 * experiences/src/aixc/experiences/<name>.{js,css} (the sticky stage, its track, the prev and next buttons, the
	 * counter, STEP_PX): the phase that brings each one confirms them when it takes the row's todo off. `landscape`
	 * marks the experiences whose controls sit low (split, coverflow, ring, tunnel, gallery, cube, streaming).
	 */
	fan: {
		cells: DEFAULT_CELLS,
		pocketed: true,
		pins: { stage: '.fn-stage', track: '.fn-track' },
		controlSelectors: ['.fn-controls', '.fn-detail'],
		// STEP_PX in fan.js: the box's scroll per card.
		step: { next: '.fn-controls .vx-round:nth-of-type(2)', prev: '.fn-controls .vx-round:nth-of-type(1)', counter: '.fn-counter__now', distance: 210 },
		specifics: async (page, cell, where) => {
			const s = await page.evaluate(() => {
				const box = document.querySelector<HTMLElement>('.aixc-box')!
				const b = box.getBoundingClientRect()
				const [left, right] = [b.left + box.clientLeft, b.left + box.clientLeft + box.clientWidth]
				const cards = [...box.querySelectorAll<HTMLElement>('.fn-card')]
				const pressable = cards.filter((c) => !c.inert && getComputedStyle(c).visibility !== 'hidden')
				return {
					label: box.querySelector('.fn-stage')!.getAttribute('aria-label'),
					turned: box.querySelector('.fn-turned')!.textContent ?? '',
					pressable: pressable.length,
					cut: pressable.map((c) => c.getBoundingClientRect()).filter((r) => r.left < left - 1 || r.right > right + 1).map((r) => [r.left, r.right].map(Math.round)),
					current: !box.querySelector<HTMLElement>('.fn-card.is-active')!.inert,
				}
			})
			// The clone's words on Services, neutral ones elsewhere (the stage's name, the turned caption's count).
			const [ar, services] = [cell.p.startsWith('/ar'), cell.p.endsWith('/services')]
			assert.equal(s.label, services ? (ar ? 'خدمات ڤودافون، كروت مفرودة' : 'Vodafone services, card fan') : (ar ? 'مروحة كروت' : 'Card fan'), `${where}: the stage's name`)
			assert.match(s.turned, services ? (ar ? /خدم/ : /\d+ services/) : (ar ? /عنص|عناص/ : /\d+ items?\b/), `${where}: the turned caption counts ${services ? 'services' : 'items'} (${s.turned})`)
			// The far cards rest past the box's sides by design: inert there, and the current card never.
			assert.ok(s.current && s.pressable >= 1, `${where}: the current card can be pressed (${s.pressable} cards can)`)
			assert.deepEqual(s.cut, [], `${where}: no card a press reaches is cut by the box's sides`)
		},
	},
	split: {
		title: 'split in the box: pinned at the bar with its bottom at the box\'s, prev and next, its controls and rail out of both corners (at the box\'s end too), nothing cut by the box\'s sides, the row under the title on phones, the clone\'s words on Services only',
		cells: DEFAULT_CELLS,
		landscape: true,
		pocketed: true,
		pins: { stage: '.ss-stage', track: '.ss-track' },
		controlSelectors: ['.ss-controls', '.ss-rail'],
		// STEP_PX in split.js: the box's scroll per service.
		step: { next: '.ss-controls .vx-round:nth-of-type(2)', prev: '.ss-controls .vx-round:nth-of-type(1)', counter: '.ss-counter__now', distance: 380 },
		specifics: async (page, cell, where) => {
			// Its words about services on Services, neutral ones elsewhere (shared.js words()).
			const ar = cell.p.startsWith('/ar')
			const services = /\/services$/.test(cell.p)
			const named = await page.evaluate(() => {
				const box = document.querySelector<HTMLElement>('.aixc-box')!
				return { prev: box.querySelector('.ss-controls .vx-round')!.getAttribute('aria-label'), stage: box.querySelector('.ss-stage')!.getAttribute('aria-label') }
			})
			const want = services
				? { prev: ar ? 'الخدمة اللي قبلها' : 'Previous service', stage: ar ? 'خدمات ڤودافون، شرايح مقسومة' : 'Vodafone services, split slideshow' }
				: { prev: ar ? 'السابق' : 'Previous', stage: ar ? 'شرائح مقسومة' : 'Split slideshow' }
			assert.deepEqual(named, want, `${where}: ${services ? 'the clone\'s words on Services' : 'neutral words where the page is not about services'}`)
			// On phones the row under the shown slide's title, clear of its copy.
			if (cell.viewport === PHONE) {
				const row = await page.evaluate(() => {
					const box = document.querySelector<HTMLElement>('.aixc-box')!
					const rect = (n: Element | null) => (n && n.getClientRects().length ? (({ left, top, right, bottom }) => ({ left, top, right, bottom }))(n.getBoundingClientRect()) : null)
					const text = box.querySelector('.ss-text[data-pos="0"]')!
					return { controls: rect(box.querySelector('.ss-controls')), title: rect(text.querySelector('.ss-title')), parts: [...text.querySelectorAll('.ss-place, .ss-desc, .ss-actions > *')].map((n) => ({ what: n.className, box: rect(n)! })) }
				})
				assert.ok(row.controls && row.title && row.controls.top >= row.title.bottom, `${where}: the row ${fmt(row.controls)} under the title ${fmt(row.title)}`)
				const over = row.parts.filter((x) => x.box && x.box.bottom > x.box.top && meets(x.box, row.controls!))
				assert.deepEqual(over.map((x) => x.what), [], `${where}: the copy clear of the row`)
			}
			// At the box's end (the closing band after the track, the stage gone by): nothing pressable of the view in a
			// corner's zone (nothing of it cut by the box's sides there: checkInBox's, for every row).
			await page.evaluate(() => {
				const box = document.querySelector<HTMLElement>('.aixc-box')!
				box.scrollTop = box.scrollHeight
			})
			await settle(page, 300)
			const zones = await zonesNow(page)
			const end = await pressablesInZones(page, '.aixc-box .aixc-vx--split', zones)
			assert.deepEqual(end.out, [], `${where}: at the box's end nothing pressable in a corner's zone ${fmt(zones.right)} ${fmt(zones.left)} (${end.seen} read)`)
		},
	},
	coverflow: {
		cells: DEFAULT_CELLS,
		landscape: true,
		pocketed: true,
		pins: { stage: '.cf-stage', track: '.cf-track' },
		controlSelectors: ['.cf-controls', '.cf-panel'],
		// STEP_PX in coverflow.js: the box's scroll per cover.
		step: { next: '.cf-controls .cf-button:nth-of-type(2)', prev: '.cf-controls .cf-button:nth-of-type(1)', counter: '.cf-counter__now', distance: 190 },
		specifics: async (page, cell, where) => {
			const s = await page.evaluate(() => {
				const box = document.querySelector<HTMLElement>('.aixc-box')!
				const b = box.getBoundingClientRect()
				const [left, right] = [b.left + box.clientLeft, b.left + box.clientLeft + box.clientWidth]
				const rect = (n: Element | null) => {
					if (!n || !n.getClientRects().length) return null
					const r = n.getBoundingClientRect()
					return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }
				}
				const covers = [...box.querySelectorAll<HTMLElement>('.cf-cover')]
				const pressable = covers.filter((c) => !c.inert && getComputedStyle(c).visibility !== 'hidden')
				return {
					label: box.querySelector('.cf-stage')!.getAttribute('aria-label'),
					prev: box.querySelector('.cf-controls .cf-button')!.getAttribute('aria-label'),
					pressable: pressable.length,
					cut: pressable.map((c) => c.getBoundingClientRect()).filter((r) => r.left < left - 1 || r.right > right + 1).map((r) => [r.left, r.right].map(Math.round)),
					front: !box.querySelector<HTMLElement>('.cf-cover.is-front')!.inert,
					controls: rect(box.querySelector('.cf-controls')),
					title: rect(box.querySelector('.cf-detail__title')),
				}
			})
			// The clone's words on Services, neutral ones elsewhere (the stage's name, prev's).
			const [ar, services] = [cell.p.startsWith('/ar'), cell.p.endsWith('/services')]
			assert.equal(s.label, services ? (ar ? 'خدمات ڤودافون، تقليب الأغلفة' : 'Vodafone services, cover flow') : (ar ? 'تقليب الأغلفة' : 'Cover flow'), `${where}: the stage's name`)
			assert.equal(s.prev, services ? (ar ? 'الخدمة اللي قبلها' : 'Previous service') : (ar ? 'السابق' : 'Previous'), `${where}: prev's name`)
			// The far covers run past the box's sides by design: inert there, and the front cover never.
			assert.ok(s.front && s.pressable >= 1, `${where}: the front cover can be pressed (${s.pressable} covers can)`)
			assert.deepEqual(s.cut, [], `${where}: no cover a press reaches is cut by the box's sides`)
			// On phones the controls row under the front service's title.
			if (cell.viewport === PHONE) assert.ok(s.controls && s.title && s.controls.top >= s.title.bottom - 1, `${where}: the row ${fmt(s.controls)} under the title ${fmt(s.title)}`)
		},
	},
	ring: {
		title: 'ring in the box: pinned at the bar with its bottom at the box\'s, prev and next, its controls and the service\'s actions out of both corners (at the box\'s end too), nothing cut by the box\'s sides (the ring\'s side services not pressable while there), the row under the front title on phones, the clone\'s words on Services only',
		cells: DEFAULT_CELLS,
		landscape: true,
		pocketed: true,
		pins: { stage: '.rg-stage', track: '.rg-track' },
		// The prev / next pair and the shown service's actions (its link): the counter beside them takes no press.
		controlSelectors: ['.rg-nav', '.rg-detail__actions'],
		// STEP_PX in ring.js: the box's scroll per service.
		step: { next: '.rg-nav .vx-round:nth-of-type(2)', prev: '.rg-nav .vx-round:nth-of-type(1)', counter: '.rg-counter__now', distance: 300 },
		specifics: async (page, cell, where) => {
			// Its words about services on Services, neutral ones elsewhere (shared.js words()).
			const ar = cell.p.startsWith('/ar')
			const services = /\/services$/.test(cell.p)
			const named = await page.evaluate(() => {
				const box = document.querySelector<HTMLElement>('.aixc-box')!
				return { prev: box.querySelector('.rg-nav .vx-round')!.getAttribute('aria-label'), stage: box.querySelector('.rg-stage')!.getAttribute('aria-label') }
			})
			const want = services
				? { prev: ar ? 'الخدمة اللي قبلها' : 'Previous service', stage: ar ? 'خدمات ڤودافون، حلقة' : 'Vodafone services, ring' }
				: { prev: ar ? 'السابق' : 'Previous', stage: ar ? 'حلقة' : 'Ring' }
			assert.deepEqual(named, want, `${where}: ${services ? 'the clone\'s words on Services' : 'neutral words where the page is not about services'}`)
			// Pinned in its track: nothing of the view cut by the box's sides (the services the ring turns past its edges
			// are not pressable while there), and the front service pressable.
			const pinned = await cutBySides(page, '.aixc-vx--ring')
			assert.deepEqual(pinned.cut, [], `${where}: pinned, nothing of the view cut by the box's sides (${pinned.seen} read)`)
			const front = await page.evaluate(() => {
				const n = document.querySelector<HTMLElement>('.aixc-box .rg-item.is-front')!
				return { inert: n.inert, visible: getComputedStyle(n).visibility }
			})
			assert.deepEqual(front, { inert: false, visible: 'visible' }, `${where}: the front service pressable`)
			// On phones the row right under the front service's title, clear of the service's copy.
			if (cell.viewport === PHONE) {
				const row = await page.evaluate(() => {
					const box = document.querySelector<HTMLElement>('.aixc-box')!
					const rect = (n: Element | null) => (n && n.getClientRects().length ? (({ left, top, right, bottom }) => ({ left, top, right, bottom }))(n.getBoundingClientRect()) : null)
					return { nav: rect(box.querySelector('.rg-nav')), counter: rect(box.querySelector('.rg-counter')), title: rect(box.querySelector('.rg-item.is-front .rg-item__title')), parts: [...box.querySelectorAll('.rg-detail__desc, .rg-detail__actions > *')].map((n) => ({ what: n.className, box: rect(n)! })) }
				})
				for (const [what, r] of [['prev and next', row.nav], ['the counter', row.counter]] as const) {
					assert.ok(r && row.title && r.top >= row.title.bottom, `${where}: ${what} ${fmt(r)} under the front title ${fmt(row.title)}`)
					const over = row.parts.filter((x) => x.box && x.box.bottom > x.box.top && meets(x.box, r!))
					assert.deepEqual(over.map((x) => x.what), [], `${where}: the service's copy clear of ${what}`)
				}
			}
			// At the box's end (the closing band after the track, the stage gone by): nothing pressable of the view in a
			// corner's zone (nothing of it cut by the box's sides there: checkInBox's, for every row).
			await page.evaluate(() => {
				const box = document.querySelector<HTMLElement>('.aixc-box')!
				box.scrollTop = box.scrollHeight
			})
			await settle(page, 300)
			const zones = await zonesNow(page)
			const end = await pressablesInZones(page, '.aixc-box .aixc-vx--ring', zones)
			assert.deepEqual(end.out, [], `${where}: at the box's end nothing pressable in a corner's zone ${fmt(zones.right)} ${fmt(zones.left)} (${end.seen} read)`)
		},
	},
	gallery: {
		title: 'gallery in the box: pinned at the bar with its bottom at the box\'s, prev and next, its controls and the caption\'s link out of both corners (at the box\'s end too), nothing cut by the box\'s sides (the pieces hung past them not pressable while there), the row under the title on phones, the clone\'s words on Services only',
		cells: DEFAULT_CELLS,
		landscape: true,
		pocketed: true,
		pins: { stage: '.gl-stage', track: '.gl-track' },
		// The prev / next row and the shown piece's caption (its link).
		controlSelectors: ['.gl-controls', '.gl-caption'],
		// STEP_PX in gallery.js: the box's scroll per piece.
		step: { next: '.gl-controls .vx-round:nth-of-type(2)', prev: '.gl-controls .vx-round:nth-of-type(1)', counter: '.gl-counter', distance: 240 },
		specifics: async (page, cell, where) => {
			// Its words about services on Services, neutral ones elsewhere (shared.js words()).
			const ar = cell.p.startsWith('/ar')
			const services = /\/services$/.test(cell.p)
			const label = await page.evaluate(() => document.querySelector('.aixc-box .gl-stage')!.getAttribute('aria-label'))
			assert.equal(label, services ? (ar ? 'معرض خدمات ڤودافون' : 'Gallery of Vodafone services') : (ar ? 'حيطة معرض' : 'Gallery wall'), `${where}: the stage's name`)
			// Pinned in its track: nothing of the view cut by the box's sides (the pieces hung past them are not pressable
			// while there), and the shown piece pressable.
			const pinned = await cutBySides(page, '.aixc-vx--gallery')
			assert.deepEqual(pinned.cut, [], `${where}: pinned, nothing of the view cut by the box's sides (${pinned.seen} read)`)
			const active = await page.evaluate(() => {
				const n = document.querySelector<HTMLElement>('.aixc-box .gl-piece.is-active')!
				return { inert: n.inert, visible: getComputedStyle(n).visibility }
			})
			assert.deepEqual(active, { inert: false, visible: 'visible' }, `${where}: the shown piece pressable`)
			// On phones the row right under the stage's title, clear of the caption's copy.
			if (cell.viewport === PHONE) {
				const row = await page.evaluate(() => {
					const box = document.querySelector<HTMLElement>('.aixc-box')!
					const rect = (n: Element | null) => (n && n.getClientRects().length ? (({ left, top, right, bottom }) => ({ left, top, right, bottom }))(n.getBoundingClientRect()) : null)
					return { controls: rect(box.querySelector('.gl-controls')), title: rect(box.querySelector('.gl-intro__brand')), parts: [...box.querySelectorAll('.gl-caption > *')].map((n) => ({ what: n.className, box: rect(n)! })) }
				})
				assert.ok(row.controls && row.title && row.controls.top >= row.title.bottom, `${where}: the row ${fmt(row.controls)} under the title ${fmt(row.title)}`)
				const over = row.parts.filter((x) => x.box && x.box.bottom > x.box.top && meets(x.box, row.controls!))
				assert.deepEqual(over.map((x) => x.what), [], `${where}: the caption clear of the row`)
			}
			// At the box's end (the closing band after the track, the stage gone by): nothing pressable of the view in a
			// corner's zone (nothing of it cut by the box's sides there: checkInBox's, for every row).
			await page.evaluate(() => {
				const box = document.querySelector<HTMLElement>('.aixc-box')!
				box.scrollTop = box.scrollHeight
			})
			await settle(page, 300)
			const zones = await zonesNow(page)
			const end = await pressablesInZones(page, '.aixc-box .aixc-vx--gallery', zones)
			assert.deepEqual(end.out, [], `${where}: at the box's end nothing pressable in a corner's zone ${fmt(zones.right)} ${fmt(zones.left)} (${end.seen} read)`)
		},
	},
	cube: {
		title: 'cube in the box: pinned at the bar with its bottom at the box\'s, its dots out of both corners (above the sheets on phones) and a press on one scrolling the box and not the window, the links passing a corner not pressable there (at the box\'s end too), nothing cut by the box\'s sides, its own neutral words',
		cells: DEFAULT_CELLS,
		landscape: true,
		pocketed: true,
		// The stage is sticky in .cb-layout, beside the story that scrolls past it (under the story's sheets on phones).
		pins: { stage: '.cb-stage', track: '.cb-layout' },
		// In the box the dots are the layout's own (pinned in the stage's place) and the story's links flow past the
		// corners (inert while in a zone: cube.js fence()): the layout, not the stage alone.
		zoneScope: '.aixc-box .cb-layout',
		controlSelectors: ['.cb-dots', '.cb-hud'],
		specifics: async (page, cell, where) => {
			// Its own words, neutral on every page (no word about services): the dots' list and the intro's button.
			const ar = cell.p.startsWith('/ar')
			const named = await page.evaluate(() => {
				const box = document.querySelector<HTMLElement>('.aixc-box')!
				return { nav: box.querySelector('.cb-dots')!.getAttribute('aria-label'), start: box.querySelector('.cb-intro__actions button')!.textContent, dots: box.querySelectorAll('.cb-dot').length, groups: (window as any).__aixc.model.sections.filter((s: any) => s.items?.length).length }
			})
			assert.deepEqual([named.nav, named.start], ar ? ['الأقسام', 'لفّ المكعب'] : ['Categories', 'Turn the cube'], `${where}: its own words`)
			assert.ok(named.dots >= 2, `${where}: a dot for the overview and each category (${named.dots}; ${named.groups} sections with items)`)
			// Mid-story, a press on the third dot (a sheet under the row on phones: the row is above it) scrolls the box to
			// its block, the window still, and the dot is the current one.
			await page.evaluate(() => {
				const box = document.querySelector<HTMLElement>('.aixc-box')!
				const layout = box.querySelector<HTMLElement>('.cb-layout')!
				box.scrollTop += layout.getBoundingClientRect().top - box.getBoundingClientRect().top + layout.offsetHeight * 0.3
			})
			await settle(page, 400)
			const was = await page.evaluate(() => ({ box: document.querySelector('.aixc-box')!.scrollTop, y: scrollY }))
			const third = '.aixc-box .cb-dots li:nth-child(3) .cb-dot'
			await pressIn(page, third)
			await page.waitForFunction((sel) => document.querySelector(sel)!.getAttribute('aria-current') === 'true', third, { timeout: 5_000 }).catch(() => {})
			await settle(page, 400)
			const now = await page.evaluate((sel) => {
				const box = document.querySelector<HTMLElement>('.aixc-box')!
				const b = box.getBoundingClientRect()
				const h = box.querySelectorAll('.cb-story > *')[2].querySelector('h2')!.getBoundingClientRect()
				return { box: box.scrollTop, y: scrollY, current: document.querySelector(sel)!.getAttribute('aria-current'), heading: { top: h.top, bottom: h.bottom }, view: { top: b.top + box.clientTop + (box.firstElementChild as HTMLElement).offsetHeight, bottom: b.top + box.clientTop + box.clientHeight } }
			}, third)
			assert.ok(Math.abs(now.y - was.y) <= 0.5, `${where}: a dot leaves the window (${was.y} -> ${now.y})`)
			assert.ok(Math.abs(now.box - was.box) > 1, `${where}: a dot scrolls the box (${was.box} -> ${now.box})`)
			assert.ok(now.heading.top >= now.view.top - 1 && now.heading.bottom <= now.view.bottom + 1, `${where}: its block's heading ${fmt({ left: 0, right: 0, ...now.heading })} in the box's view ${fmt({ left: 0, right: 0, ...now.view })}`)
			assert.equal(now.current, 'true', `${where}: the third dot is the current one`)
			// There, and at the box's end (the closing band after the layout): nothing pressable of the view in a corner's zone.
			for (const at of ['mid-story', 'end']) {
				if (at === 'end') {
					await page.evaluate(() => {
						const box = document.querySelector<HTMLElement>('.aixc-box')!
						box.scrollTop = box.scrollHeight
					})
					await settle(page, 300)
				}
				const zones = await zonesNow(page)
				const hits = await pressablesInZones(page, '.aixc-box .aixc-vx--cube', zones)
				// (At the end of a short box only the closing band's code may show: nothing to press there.)
				if (at === 'mid-story') assert.ok(hits.seen > 0, `${where}: ${at}: the view's pressables were read (${hits.seen})`)
				assert.deepEqual(hits.out, [], `${where}: ${at}: nothing pressable in a corner's zone ${fmt(zones.right)} ${fmt(zones.left)} (${hits.seen} read)`)
			}
		},
	},
	journey: {
		title: 'journey in the box: the scene pinned at the bar with its bottom at the box\'s while the story scrolls over it, its own h1 the one exposed, the sun mark drawn, the story\'s pressables out of both corners (no pointer events while one passes under a corner, a focused one moved clear), the closing band clear at the box\'s end, nothing cut by the box\'s sides',
		// Phones in landscape on Services too (2026-11-18 review: the short box's intro steps in from both corners'
		// zones). Not on Home: with no closing band there, the box's end in a 234 px room shows only the shell's end (the
		// view's last 47 px under the bar), so the generic "view's parts read at the box's end" cannot hold; box_e2e
		// covers the landscape box on the clone's pages.
		cells: [...DEFAULT_CELLS, ...LANDSCAPE_CELLS.filter((c) => c.p.endsWith('/services'))],
		pocketed: true,
		// The scene is sticky while the story scrolls over it (.jr-story starts where the scene does).
		pins: { stage: '.jr-scene', track: '.jr-story' },
		// No controls: the scene is drawn only (aria-hidden, no pointer events, no step or counter); what is pressable
		// is the story's (each chapter's links, its cards', the closing band's), checked in specifics.
		controlSelectors: [],
		specifics: async (page, cell, where) => {
			// Its own h1 (the model's title, else the document's) the view's one, and no heading of the shell's beside it.
			const head = await page.evaluate(() => {
				const box = document.querySelector<HTMLElement>('.aixc-box')!
				const h1s = [...box.querySelectorAll('h1')]
				const use = box.querySelector('.jr-sun__mark use')
				const id = (use?.getAttribute('href') ?? '').replace(/^#/, '')
				const symbol = id ? document.getElementById(id) : null
				const mark = box.querySelector('.jr-sun__mark')!.getBoundingClientRect()
				return { h1s: h1s.map((n) => n.className), text: h1s[0]?.textContent?.trim() ?? '', model: String((window as any).__aixc.model.title ?? '').trim(), doc: document.title, symbol: symbol?.localName ?? null, id, mark: [mark.width, mark.height].map(Math.round), hint: box.querySelector('.jr-intro__hint')?.textContent ?? '' }
			})
			assert.deepEqual(head.h1s, ['jr-intro__title'], `${where}: the view's one h1 is the journey's own (${JSON.stringify(head)})`)
			assert.ok(head.text.length > 0 && (head.text === head.model || (!head.model && head.doc.includes(head.text))), `${where}: it names the page (${head.text})`)
			assert.ok(head.symbol === 'symbol' && head.mark[0] > 0 && head.mark[1] > 0, `${where}: the sun mark draws a symbol on the page (${head.id}, ${head.mark})`)
			assert.equal(head.hint, cell.p.startsWith('/ar') ? 'انزل عشان تبدأ' : 'Scroll to begin', `${where}: the hint's neutral words`)
			// Through the story (a quarter, half and three quarters of the box's scroll) and at the box's end: nothing
			// pressable in a corner's zone (what passes under one takes no pointer events while there: journey.js keepClear()), the scene pinned, its progress
			// moving with the box's scroll, the window still.
			const zones = await zonesNow(page)
			assert.ok(zones.right && zones.left, `${where}: both corners' zones measured (${fmt(zones.right)} ${fmt(zones.left)})`)
			// At the box's top the intro's title (the view's one h1), its text and its hint clear of both corners (not
			// pressable, so the zone checks do not read them; the short box's intro steps in from both, journey.css).
			await page.evaluate(() => document.querySelector<HTMLElement>('.aixc-box')!.scrollTo({ top: 0, behavior: 'instant' }))
			await settle(page, 200)
			const intro = await page.evaluate(() => ['.jr-intro__title', '.jr-intro__text', '.jr-intro__hint span'].map((sel) => {
				const r = document.querySelector('.aixc-box .aixc-vx--journey ' + sel)?.getBoundingClientRect()
				return { sel, rect: r && r.height > 0 ? { left: r.left, top: r.top, right: r.right, bottom: r.bottom } : null }
			}))
			assert.ok(intro[0].rect && intro[2].rect, `${where}: the intro's title and hint shown (${JSON.stringify(intro)})`)
			for (const { sel, rect } of intro) for (const [name, z] of Object.entries(zones)) if (rect && z) assert.ok(!meets(rect, z), `${where}: at the box's top the intro's ${sel} ${fmt(rect)} clear of the ${name} zone ${fmt(z)}`)
			const y = await page.evaluate(() => scrollY)
			let seen = 0
			const progress: number[] = []
			// A phone in landscape (its room 234 px, most of it beside a corner) reads at eight places, so as many of the
			// story's pressables pass clear of the corners as at four elsewhere.
			const places = cell.viewport.height < 560 ? [0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1] : [0.25, 0.5, 0.75, 1]
			for (const k of places) {
				await page.evaluate((k) => {
					const box = document.querySelector<HTMLElement>('.aixc-box')!
					box.scrollTop = Math.round((box.scrollHeight - box.clientHeight) * k)
				}, k)
				await settle(page, 300)
				const hits = await pressablesInZones(page, '.aixc-box .aixc-vx--journey', zones)
				seen += hits.seen
				assert.deepEqual(hits.out, [], `${where}: at ${k * 100}% of the box's scroll nothing pressable in a corner's zone ${fmt(zones.right)} ${fmt(zones.left)} (${hits.seen} read)`)
				progress.push(await page.evaluate(() => Number(getComputedStyle(document.querySelector('.aixc-box .aixc-vx--journey')!).getPropertyValue('--p'))))
				if (k < 1) {
					const s = await pinNow(page, '.jr-scene')
					assert.ok(Math.abs(s.bottomGap) <= 1 && Math.abs(s.top - s.barH) <= 1, `${where}: at ${k * 100}% the scene pinned (top ${s.top}, bar ${s.barH}, gap ${s.bottomGap})`)
				}
			}
			assert.ok(seen >= 3, `${where}: the story's pressables were read (${seen})`)
			assert.ok(progress.every((p, i) => i === 0 || p > progress[i - 1]) && progress[progress.length - 1] > 0.99, `${where}: the scene's progress follows the box's scroll (${progress})`)
			// At the box's end the closing band's links, where the page has one (Services: the app's band), are all
			// pressable (nothing after them to scroll them clear).
			const band = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.aixc-box .aixc-vx--journey .vx-closing :is(a[href], button)')].map((n) => Boolean(n.closest('[inert]')) || getComputedStyle(n).pointerEvents === 'none'))
			if (/\/services$/.test(cell.p)) assert.ok(band.length > 0, `${where}: the app's band at the box's end`)
			assert.ok(band.every((inert) => !inert), `${where}: at the box's end the closing band's links pressable, none inert or without pointer events (${band})`)
			// A link focused from just below the box's view (the keyboard reaching it from above): the browser's own focus
			// scroll brings it in first, so this alone does not show journey.js clearFocus() (the case after it does). It
			// keeps the focus and ends pressable, clear of the zones.
			const focused = await page.evaluate(() => {
				const box = document.querySelector<HTMLElement>('.aixc-box')!
				const b = box.getBoundingClientRect()
				const links = [...box.querySelectorAll<HTMLElement>('.aixc-vx--journey .jr-story :is(a[href], button)')]
				const link = links[Math.floor(links.length / 2)]
				// The link just under the box's view, as Tab finds it: the box scrolled so its top is 4 px below the bottom.
				box.scrollTop += link.getBoundingClientRect().top - (b.top + box.clientTop + box.clientHeight) + 4
				return link.textContent?.trim().slice(0, 30) ?? ''
			})
			await settle(page, 200)
			await page.evaluate(() => {
				const links = [...document.querySelectorAll<HTMLElement>('.aixc-box .aixc-vx--journey .jr-story :is(a[href], button)')]
				links[Math.floor(links.length / 2)].focus()
			})
			await settle(page, 400)
			const kept = await page.evaluate(() => {
				const links = [...document.querySelectorAll<HTMLElement>('.aixc-box .aixc-vx--journey .jr-story :is(a[href], button)')]
				const link = links[Math.floor(links.length / 2)]
				const r = link.getBoundingClientRect()
				return { active: document.activeElement === link, inert: Boolean(link.closest('[inert]')) || getComputedStyle(link).pointerEvents === 'none', rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom } }
			})
			assert.ok(kept.active && !kept.inert, `${where}: the focused link (${focused}) keeps the focus, pressable (${JSON.stringify(kept)})`)
			for (const [name, z] of Object.entries(zones)) if (z) assert.ok(!meets(kept.rect, z), `${where}: the focused link ${fmt(kept.rect)} clear of the ${name} zone ${fmt(z)}`)
			await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
			// The clearFocus() path: a link fully in the box's view but inside a corner's zone (jr-under there, as Tab
			// reaches it from a visible link before it). focus() does not scroll a visible element, so only clearFocus()
			// moves it: it keeps the focus and ends pressable, clear of every zone (or, where a zone is as tall as the room
			// under the bar, as high as it goes: its top at the bar).
			const placed = await page.evaluate((zones) => {
				const box = document.querySelector<HTMLElement>('.aixc-box')!
				const b = box.getBoundingClientRect()
				const bar = (box.firstElementChild as HTMLElement | null)?.offsetHeight ?? 0
				const view = { top: b.top + box.clientTop + bar, bottom: b.top + box.clientTop + box.clientHeight }
				const links = [...box.querySelectorAll<HTMLElement>('.aixc-vx--journey .jr-story :is(a[href], button)')]
				const clipped = (Object.values(zones).filter(Boolean) as Box[]).map((z) => ({ ...z, top: Math.max(z.top, view.top), bottom: Math.min(z.bottom, view.bottom) }))
				const fitting = links.map((link, at) => {
					const r = link.getBoundingClientRect()
					const z = clipped.find((q) => r.width > 0 && r.left < q.right && r.right > q.left && r.height + 8 <= q.bottom - q.top)
					return z ? { at, z } : null
				}).filter(Boolean) as { at: number; z: Box }[]
				const pick = fitting[Math.floor(fitting.length / 2)]
				if (!pick) return null
				const link = links[pick.at]
				box.scrollTop += link.getBoundingClientRect().top - (pick.z.top + 4)
				return { at: pick.at, zone: pick.z, view, what: link.textContent?.trim().slice(0, 30) ?? '', count: fitting.length }
			}, zones)
			assert.ok(placed, `${where}: a story link that a corner's zone can hold (${fmt(zones.right)} ${fmt(zones.left)})`)
			await settle(page, 200)
			const before = await page.evaluate((at) => {
				const box = document.querySelector<HTMLElement>('.aixc-box')!
				const link = [...box.querySelectorAll<HTMLElement>('.aixc-vx--journey .jr-story :is(a[href], button)')][at]
				const r = link.getBoundingClientRect()
				return { rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom }, under: link.classList.contains('jr-under'), scrollTop: box.scrollTop }
			}, placed!.at)
			assert.ok(before.rect.top >= placed!.zone.top - 1 && before.rect.bottom <= placed!.zone.bottom + 1 && before.rect.top >= placed!.view.top - 1 && before.rect.bottom <= placed!.view.bottom + 1, `${where}: the link (${placed!.what}) ${fmt(before.rect)} in the box's view and inside the zone ${fmt(placed!.zone)}`)
			assert.ok(before.under, `${where}: the link (${placed!.what}) under the corner takes jr-under`)
			await page.evaluate((at) => [...document.querySelectorAll<HTMLElement>('.aixc-box .aixc-vx--journey .jr-story :is(a[href], button)')][at].focus(), placed!.at)
			await settle(page, 400)
			const cleared = await page.evaluate((at) => {
				const box = document.querySelector<HTMLElement>('.aixc-box')!
				const link = [...box.querySelectorAll<HTMLElement>('.aixc-vx--journey .jr-story :is(a[href], button)')][at]
				const r = link.getBoundingClientRect()
				return { active: document.activeElement === link, pointer: getComputedStyle(link).pointerEvents, inert: Boolean(link.closest('[inert]')), rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom }, scrollTop: box.scrollTop }
			}, placed!.at)
			const met = (Object.entries(zones).filter(([, z]) => z && meets(cleared.rect, z)) as [string, Box][])
			const noRoom = met.length > 0 && met.every(([, z]) => z.top <= placed!.view.top + (cleared.rect.bottom - cleared.rect.top) + 16) && Math.abs(cleared.rect.top - placed!.view.top) <= 1
			assert.ok(cleared.active && !cleared.inert, `${where}: the link focused under the corner (${placed!.what}) keeps the focus (${JSON.stringify(cleared)})`)
			if (!noRoom) {
				assert.notEqual(cleared.pointer, 'none', `${where}: the link focused under the corner (${placed!.what}) pressable once moved (${JSON.stringify(cleared)})`)
				for (const [name, z] of met) assert.fail(`${where}: the link focused under the corner (${placed!.what}) ${fmt(cleared.rect)} clear of the ${name} zone ${fmt(z)} (box scrolled ${before.scrollTop} -> ${cleared.scrollTop})`)
			}
			assert.ok(Math.abs((await page.evaluate(() => scrollY)) - y) <= 0.5, `${where}: the window stays`)
			await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
		},
	},
	tunnel: {
		title: 'tunnel in the box: the pinned 3D tunnel with motion allowed (its bottom at the box\'s, prev and next moving the box, its HUD\'s pair at the bottom centre or under the title on phones, out of both corners), laid flat under reduced motion and in a short box, nothing pressable in a corner, nothing cut by the box\'s sides, the clone\'s words on Services only',
		// The 3D tunnel only flies with motion allowed (under reduced motion tunnel.js lays it flat, as on the clone): the
		// 16 cells and phones in landscape with motion, as most readers see it; desktop and phone on Services, en and ar,
		// under reduced motion, the flat layout.
		cells: [
			...[...DEFAULT_CELLS, ...LANDSCAPE_CELLS].map((cell): Cell => ({ ...cell, motion: true })),
			...[DESKTOP, PHONE].flatMap((viewport) => ['/en/services', '/ar/services'].map((p): Cell => ({ p, viewport }))),
		],
		pocketed: true,
		pins: { stage: '.tn-stage', track: '.tn-track' },
		// Laid flat under reduced motion, and in a box too short for the tunnel's stage (a phone in landscape).
		flat: (cell) => !cell.motion || cell.viewport === LANDSCAPE,
		// Prev and next in the HUD (.tn-hud__nav); the HUD's other parts take no press. Its place readout ("05 / 12 ·
		// …") is the counter: specifics steps it, from the track's first stop (a category's word, no number).
		controlSelectors: ['.tn-hud__nav'],
		specifics: async (page, cell, where) => {
			const ar = cell.p.startsWith('/ar')
			const services = /\/services$/.test(cell.p)
			const flat = !cell.motion || cell.viewport === LANDSCAPE
			// Its words about services on Services, neutral ones elsewhere (shared.js words()).
			const named = await page.evaluate(() => {
				const box = document.querySelector<HTMLElement>('.aixc-box')!
				return { prev: box.querySelector('.tn-hud__nav .vx-round')!.getAttribute('aria-label'), stage: box.querySelector('.tn-stage')!.getAttribute('aria-label') }
			})
			const want = services
				? { prev: ar ? 'الخدمة اللي قبلها' : 'Previous service', stage: ar ? 'خدمات ڤودافون، النفق السريع' : 'Vodafone services, hyper tunnel' }
				: { prev: ar ? 'السابق' : 'Previous', stage: ar ? 'النفق السريع' : 'Hyper tunnel' }
			assert.deepEqual(named, want, `${where}: ${services ? 'the clone\'s words on Services' : 'neutral words where the page is not about services'}`)
			const mode = await page.evaluate(() => {
				const box = document.querySelector<HTMLElement>('.aixc-box')!
				return { flat: box.querySelector('.aixc-vx--tunnel')!.classList.contains('is-static'), hud: getComputedStyle(box.querySelector('.tn-hud')!).display }
			})
			assert.deepEqual(mode, flat ? { flat: true, hud: 'none' } : { flat: false, hud: 'flex' }, `${where}: ${flat ? 'laid flat, no HUD' : 'the 3D tunnel and its HUD'}`)
			if (!flat) {
				// The pair: on phones under the HUD's title row, from 720 px at the bottom centre (between the zones).
				const hud = await page.evaluate(() => {
					const box = document.querySelector<HTMLElement>('.aixc-box')!
					const rect = (n: Element | null) => (n && n.getClientRects().length ? (({ left, top, right, bottom }) => ({ left, top, right, bottom }))(n.getBoundingClientRect()) : null)
					return { nav: rect(box.querySelector('.tn-hud__nav')), title: rect(box.querySelector('.tn-hud__row')), stage: rect(box.querySelector('.tn-stage')) }
				})
				if (cell.viewport === PHONE) assert.ok(hud.nav && hud.title && hud.nav.top >= hud.title.bottom && hud.nav.bottom < (hud.stage!.top + hud.stage!.bottom) / 2, `${where}: the pair ${fmt(hud.nav)} under the title row ${fmt(hud.title)}, in the stage's top half`)
				else assert.ok(hud.nav && hud.nav.top > (hud.stage!.top + hud.stage!.bottom) / 2 && Math.abs((hud.nav.left + hud.nav.right) / 2 - (hud.stage!.left + hud.stage!.right) / 2) <= 40, `${where}: the pair ${fmt(hud.nav)} at the stage's bottom centre ${fmt(hud.stage)}`)
				// Steps: from the track's first stop (the first category's word) next goes to the first service (one stop,
				// 320 px of the box's scroll, the window still); then next and prev between services (a category's word
				// between two of them is a stop more).
				const read = () => page.evaluate(() => ({ place: document.querySelector('.aixc-box .tn-hud__place')!.textContent ?? '', box: document.querySelector('.aixc-box')!.scrollTop, y: scrollY }))
				const press = async (which: 'next' | 'prev', n: string) => {
					const was = await read()
					await pressIn(page, `.aixc-box .tn-hud__nav .vx-round:nth-of-type(${which === 'next' ? 2 : 1})`)
					await page.waitForFunction((n) => (document.querySelector('.aixc-box .tn-hud__place')!.textContent ?? '').startsWith(`${n} /`), n, { timeout: 5_000 }).catch(() => {})
					await settle(page, 400)
					const now = await read()
					assert.ok(now.place.startsWith(`${n} /`), `${where}: ${which} shows service ${n} (${was.place} -> ${now.place})`)
					assert.ok(Math.abs(now.y - was.y) <= 0.5, `${where}: ${which}: the window stays (${was.y} -> ${now.y})`)
					return now.box - was.box
				}
				const first = await press('next', '01')
				assert.ok(Math.abs(first - 320) <= 2, `${where}: next from the first category's word is one stop, 320 px of the box's scroll (${first})`)
				const next = await press('next', '02')
				const prev = await press('prev', '01')
				assert.ok(next >= 318 && Math.abs(prev + next) <= 2, `${where}: next and prev move the box's scroll by whole stops of 320 px, there and back (${next}, ${prev})`)
				console.log(`[step] tunnel ${where}: first ${first} px, next ${next} px, prev ${prev} px of the box's scroll`)
			}
			// Laid flat, the box swept from its top to its end in 60 px steps (two frames at each place): nothing pressable
			// of the view in a corner's zone at any place (tunnel.js fence(): a link is inert while it passes one).
			if (flat) {
				const zones = await zonesNow(page)
				const sweep = await page.evaluate(async ({ zones }) => {
					const box = document.querySelector<HTMLElement>('.aixc-box')!
					const b = box.getBoundingClientRect()
					const frames = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
					const meets = (a: Box, z: Box) => a.left < z.right && z.left < a.right && a.top < z.bottom && z.top < a.bottom
					const hits: string[] = []
					let [seen, places] = [0, 0]
					const end = box.scrollHeight - box.clientHeight
					for (let y = 0; ; y = Math.min(end, y + 60)) {
						box.scrollTop = y
						await frames()
						places++
						for (const el of box.querySelectorAll<HTMLElement>('.aixc-vx--tunnel :is(button, a[href], [tabindex="0"], input, select)')) {
							const r = el.getBoundingClientRect()
							const s = getComputedStyle(el)
							if (!r.width || !r.height || el.closest('[inert], [hidden]') || s.visibility === 'hidden' || Number(s.opacity) === 0 || s.pointerEvents === 'none') continue
							if (r.bottom <= b.top || r.top >= b.bottom) continue
							seen++
							for (const [name, z] of Object.entries(zones)) if (z && meets(r, z)) hits.push(`${y}: ${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 30)} in the ${name} zone`)
						}
						if (y >= end) break
					}
					return { places, seen, hits: hits.slice(0, 5), count: hits.length }
				}, { zones })
				assert.ok(sweep.seen > 0 && sweep.count === 0, `${where}: laid flat, swept (${sweep.places} places, ${sweep.seen} pressables read): nothing pressable in a corner's zone ${JSON.stringify(sweep.hits)}`)
			}
			// Pinned (or flat, mid-view), and at the box's end: nothing pressable of the view in a corner's zone, nothing of
			// it cut by the box's sides (the words and services flying past the stage's sides are not pressable there).
			for (const at of ['here', 'end']) {
				if (at === 'end') {
					await page.evaluate(() => {
						const box = document.querySelector<HTMLElement>('.aixc-box')!
						box.scrollTop = box.scrollHeight
					})
					await settle(page, 300)
				}
				const zones = await zonesNow(page)
				const hits = await pressablesInZones(page, '.aixc-box .aixc-vx--tunnel', zones)
				assert.deepEqual(hits.out, [], `${where}: ${at}: nothing pressable in a corner's zone ${fmt(zones.right)} ${fmt(zones.left)} (${hits.seen} read)`)
				const sides = await cutBySides(page, '.aixc-vx--tunnel')
				assert.deepEqual(sides.cut, [], `${where}: ${at}: nothing of the view cut by the box's sides (${sides.seen} read)`)
			}
			// Settled on each stop, words included: the current slot inside the box's sides and not inert (cutBySides
			// skips what is inert, and fence() makes a slot cut by the sides inert).
			if (!flat) {
				const was = await page.evaluate(() => document.querySelector<HTMLElement>('.aixc-box')!.scrollTop)
				await tunnelSettled(page, where)
				await page.evaluate((y) => {
					document.querySelector<HTMLElement>('.aixc-box')!.scrollTop = y
				}, was)
				await settle(page, 300)
			}
		},
		// The guide listening at 1024x768 (its transcript bar widens the right zone, and the cards' column moves to the
		// room between the zones), with motion allowed: settled on each stop, nothing inert but a card under the bar,
		// nothing cut by the box's sides.
		andThen: async () => {
			for (const p of ['/en/services', '/ar/services']) {
				const where = `${p} ${sizeOf(TABLET)} motion listening`
				const l = await launchLayer(gw, { viewport: TABLET, reducedMotion: false, ...LIVE, initScripts: [MIC_STAND_IN] })
				try {
					await open(l.page, p, '?aixc-debug')
					await ready(l.page)
					await pocketOne(l.page)
					await choose(l.page, 'tunnel')
					const quiet = await zonesNow(l.page)
					const mic = await l.page.evaluate(() => {
						const r = document.querySelector('vg-guide')!.shadowRoot!.querySelector('.vg-mic')!.getBoundingClientRect()
						return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
					})
					await l.page.mouse.click(mic.x, mic.y)
					await l.page.waitForFunction(() => !document.querySelector('vg-guide')!.shadowRoot!.querySelector('.vg-bar')!.classList.contains('hidden'), null, { timeout: 10_000 })
					await settle(l.page, 600)
					const zones = await zonesNow(l.page)
					assert.ok(zones.right && quiet.right && zones.right.left < quiet.right.left - 100, `${where}: the transcript bar widens the right zone ${fmt(quiet.right)} -> ${fmt(zones.right)}`)
					assert.equal(await l.page.evaluate(() => document.querySelector('.aixc-box .aixc-vx--tunnel')!.classList.contains('is-static')), false, `${where}: the 3D tunnel`)
					await tunnelSettled(l.page, where, true)
				} finally {
					await l.close()
				}
			}
		},
	},
	flipbook: {
		todo: PHASE_4B,
		cells: DEFAULT_CELLS,
		pocketed: true,
		// Not sticky: the book turns its pages in place (the phase decides whether its turns scroll the box).
		pins: false,
		zoneScope: '.aixc-box .fb-stage',
		controlSelectors: ['.fb-controls'],
	},
	canvas: {
		todo: PHASE_4B,
		cells: DEFAULT_CELLS,
		pocketed: true,
		// A surface dragged in place; its keys' hint and zoom are the phase's to place.
		pins: false,
		controlSelectors: [],
	},
	streaming: {
		todo: PHASE_4B,
		cells: DEFAULT_CELLS,
		landscape: true,
		pocketed: true,
		// Its sticky navigation at the top; the rows scroll sideways under their own arrows.
		pins: false,
		controlSelectors: ['.st-nav'],
	},
}

/** A stage's place in the box: its top under the box's border, the gap under it, its height, the room and the bar. */
const pinNow = (page: Page, stage: string) =>
	page.evaluate((stage) => {
		const box = document.querySelector<HTMLElement>('.aixc-box')!
		const b = box.getBoundingClientRect()
		const r = box.querySelector<HTMLElement>(stage)!.getBoundingClientRect()
		return { top: r.top - (b.top + box.clientTop), bottomGap: b.top + box.clientTop + box.clientHeight - r.bottom, height: r.height, room: box.clientHeight, barH: (box.firstElementChild as HTMLElement).offsetHeight }
	}, stage)

/** The box's rect of the element `selector` finds inside the box, while it shows; else null. */
const shownRect = (page: Page, selector: string) =>
	page.evaluate((selector) => {
		const n = document.querySelector<HTMLElement>(`.aixc-box ${selector}`)
		if (!n || !n.getClientRects().length || getComputedStyle(n).display === 'none') return null
		const x = n.getBoundingClientRect()
		return { left: x.left, top: x.top, right: x.right, bottom: x.bottom }
	}, selector)

/**
 * What of the view inside `scope` the box's left or right side cuts: each pressable, item and heading that shows (not
 * inert, hidden, aria-hidden, invisible or 1 px) within the box's height and reaching past its inner sides by more
 * than 1 px.
 */
const cutBySides = (page: Page, scope: string) =>
	page.evaluate((scope) => {
		const box = document.querySelector<HTMLElement>('.aixc-box')!
		const b = box.getBoundingClientRect()
		const inner = { left: b.left + box.clientLeft, right: b.left + box.clientLeft + box.clientWidth, top: b.top + box.clientTop, bottom: b.top + box.clientTop + box.clientHeight }
		const cut: string[] = []
		let seen = 0
		for (const el of box.querySelectorAll<HTMLElement>(`${scope} :is(button, a[href], [data-aixc-item], h1, h2, h3)`)) {
			const r = el.getBoundingClientRect()
			const s = getComputedStyle(el)
			if (r.width <= 1 || r.height <= 1 || el.closest('[inert], [hidden], [aria-hidden="true"]') || s.visibility === 'hidden' || Number(s.opacity) === 0) continue
			if (r.bottom <= inner.top || r.top >= inner.bottom) continue
			seen++
			if (r.left < inner.left - 1 || r.right > inner.right + 1) cut.push(`${el.localName}.${el.classList[0] ?? ''} [${Math.round(r.left)},${Math.round(r.right)}]`)
		}
		return { seen, cut }
	}, scope)

/**
 * The 3D tunnel settled on each of its stops in turn (the box's scroll at the track's top under the bar plus k stops of
 * 320 px; the camera settled: the current slot's rect the same over two frames, at most 3 s): its current slot (a
 * service's card or a category's word) inside the box's inner sides (±1 px) and not inert. Unlike cutBySides this
 * does not skip what is inert: tunnel.js fence() makes a slot cut by the sides inert, so a probe that skips inert
 * slots could never see one cut at rest. Inert is let through only while the guide listens and the card's link is in
 * a zone (`listening`: its transcript bar can cover a card by design).
 */
async function tunnelSettled(page: Page, where: string, listening = false) {
	const zones = await zonesNow(page)
	const bad = await page.evaluate(
		async ({ zones, listening }) => {
			const box = document.querySelector<HTMLElement>('.aixc-box')!
			const barH = (box.firstElementChild as HTMLElement).offsetHeight
			const frame = () => new Promise((r) => requestAnimationFrame(r))
			const b = box.getBoundingClientRect()
			const left = b.left + box.clientLeft
			const right = left + box.clientWidth
			const track = box.querySelector<HTMLElement>('.tn-track')!
			const trackTop = track.getBoundingClientRect().top - b.top - box.clientTop + box.scrollTop - barH
			const count = box.querySelectorAll('.tn-item').length
			const meets = (a: DOMRect, z: { left: number; top: number; right: number; bottom: number }) => a.left < z.right && z.left < a.right && a.top < z.bottom && z.top < a.bottom
			const read = () => {
				const slot = box.querySelector<HTMLElement>('.tn-item.is-current')
				const el = slot && (slot.querySelector<HTMLElement>('.tn-card') || slot.querySelector<HTMLElement>('.tn-word'))
				return { slot, el, r: el ? el.getBoundingClientRect() : null }
			}
			const out: string[] = []
			for (let k = 0; k < count; k++) {
				box.scrollTop = trackTop + k * 320
				let was: ReturnType<typeof read> | null = null
				const t0 = performance.now()
				for (;;) {
					await frame()
					const now = read()
					const same = was && now.el === was.el && now.r && was.r && (['left', 'top', 'right', 'bottom'] as const).every((p) => Math.abs(now.r![p] - was!.r![p]) < 0.5)
					if (same || performance.now() - t0 > 3000) break
					was = now
				}
				await frame()
				await frame()
				const { slot, el, r } = read()
				const kind = slot?.classList.contains('tn-item--word') ? 'word' : 'card'
				const link = el?.querySelector('a[href], button')
				const linkInZone = !!link && Object.values(zones).some((z) => z && meets(link.getBoundingClientRect(), z))
				const inert = !slot || !!slot.closest('[inert]')
				const cut = !r || r.left < left - 1 || r.right > right + 1
				if (cut || (inert && !(listening && kind === 'card' && linkInZone)))
					out.push(`stop ${k} (${kind} '${(el?.textContent ?? '').trim().slice(0, 24)}'): ${inert ? 'inert' : ''}${cut ? ` cut [${r ? `${Math.round(r.left)},${Math.round(r.right)}` : 'none'}] by [${Math.round(left)},${Math.round(right)}]` : ''}`)
			}
			return { count, out }
		},
		{ zones, listening },
	)
	assert.ok(bad.count > 0, `${where}: the tunnel has stops (${bad.count})`)
	assert.deepEqual(bad.out, [], `${where}: settled on each of its ${bad.count} stops (words included), the current slot inside the box's sides and not inert${listening ? ' (but a card whose link is under the transcript bar)' : ''}`)
}

/** One press on prev or next: the counter moves by one, the box's scroll moves and the window's does not; the distance. */
async function stepOnce(page: Page, step: NonNullable<ExperienceCase['step']>, dir: 'next' | 'prev', where: string) {
	const read = () => page.evaluate((counter) => ({ text: document.querySelector(`.aixc-box ${counter}`)!.textContent ?? '', box: document.querySelector('.aixc-box')!.scrollTop, y: scrollY }), step.counter)
	const was = await read()
	await pressIn(page, `.aixc-box ${dir === 'next' ? step.next : step.prev}`)
	await page.waitForFunction(({ counter, was }) => document.querySelector(`.aixc-box ${counter}`)!.textContent !== was, { counter: step.counter, was: was.text }, { timeout: 3_000 }).catch(() => {})
	await settle(page, 250)
	const now = await read()
	const [from, to] = [Number.parseInt(was.text, 10), Number.parseInt(now.text, 10)]
	assert.equal(to, from + (dir === 'next' ? 1 : -1), `${where}: ${dir} steps it (${from} -> ${to})`)
	assert.ok(Math.abs(now.y - was.y) <= 0.5, `${where}: ${dir}: the window stays (${was.y} -> ${now.y})`)
	const moved = now.box - was.box
	assert.ok(dir === 'next' ? moved > 0 : moved < 0, `${where}: ${dir}: the box's scroll moves (${was.box} -> ${now.box})`)
	if (step.distance) assert.ok(Math.abs(Math.abs(moved) - step.distance) <= 2, `${where}: ${dir}: one step is ${step.distance} px of the box's scroll (${moved})`)
	return moved
}

/** A middle item of the page's model (its sections' items). */
const middleItem = (page: Page) =>
	page.evaluate(() => {
		const ids = (window as any).__aixc.model.sections.flatMap((s: any) => s.items.map((i: any) => i.id as string)) as string[]
		return ids[Math.floor(ids.length / 2)]
	})

/** reveal(itemId) brings the item into the box's view, under the bar, and the window does not move. */
async function revealInBox(page: Page, itemId: string, where: string) {
	const y = await page.evaluate(() => scrollY)
	assert.equal(await page.evaluate((id) => (window as any).__aixc.demos.reimagine.state.activeExperience.reveal(id), itemId), true, `${where}: reveal(${itemId}) says the view has it`)
	await settle(page, 400)
	const at = await page.evaluate((id) => {
		const box = document.querySelector<HTMLElement>('.aixc-box')!
		const b = box.getBoundingClientRect()
		const shown = [...box.querySelectorAll<HTMLElement>('[data-aixc-item]')].filter((n) => n.dataset.aixcItem === id && n.getClientRects().length && !n.closest('[hidden], [inert]') && getComputedStyle(n).visibility !== 'hidden')
		const r = shown[0]?.getBoundingClientRect()
		const top = b.top + box.clientTop + (box.firstElementChild as HTMLElement).offsetHeight
		return { count: shown.length, item: r ? { left: r.left, top: r.top, right: r.right, bottom: r.bottom } : null, view: { left: b.left + box.clientLeft, top, right: b.left + box.clientLeft + box.clientWidth, bottom: b.top + box.clientTop + box.clientHeight }, y: scrollY }
	}, itemId)
	assert.ok(at.item, `${where}: the item ${itemId} shows in the box after reveal (${at.count})`)
	const { item, view } = at
	assert.ok(item.top >= view.top - 1 && item.top < view.bottom, `${where}: the item's top ${Math.round(item.top)} in the box's view under the bar ${fmt(view)}`)
	if (item.bottom - item.top <= view.bottom - view.top + 1) assert.ok(item.bottom <= view.bottom + 1, `${where}: the item ${fmt(item)} whole in the box's view ${fmt(view)}`)
	if (item.right - item.left <= view.right - view.left + 1) assert.ok(item.left >= view.left - 1 && item.right <= view.right + 1, `${where}: the item ${fmt(item)} not beside the box's view ${fmt(view)}`)
	assert.ok(Math.abs(at.y - y) <= 0.5, `${where}: reveal leaves the window (${y} -> ${at.y})`)
}

type Layer = Awaited<ReturnType<typeof launchLayer>>

/**
 * The checks every experience gets in the box, then the row's: #main-content hidden laid out (ADR-0075 §2), the box
 * from the header's pinned bottom to the screen's bottom, its own scroll, every item once, one exposed h1, nothing
 * sideways; the stage pinned at the bar, nothing pressable in a corner's zone and the controls clear of both, prev and
 * next moving the box and not the window; the row's specifics; at the box's end nothing of the view cut by its sides;
 * reveal(); the experience's unmount gives back all the seam held for it, and it mounts again; Original; no request to
 * Google or CodePen, no page error, no layer error.
 */
async function checkInBox(page: Page, { experience, cell, where, served, servedHeadings, l, seen }: { experience: string; cell: Cell; where: string; served: Awaited<ReturnType<typeof mainNow>>; servedHeadings: { name: string; tag: string }[]; l: Layer; seen: ReturnType<typeof watch> }) {
	const row = EXPERIENCE_CASES[experience]
	const { viewport } = cell

	// #main-content hidden as ADR-0075 §2: laid out at its width, no height, transparent, inert and hidden.
	const main = await mainNow(page)
	assert.equal(main.style, `${served.style ?? ''};display:${served.display}!important;height:0!important;overflow:hidden!important;opacity:0!important`, `${where}: #main-content's style while hidden`)
	assert.deepEqual([main.inert, main.hidden, main.height, main.opacity], ['', '', 0, '0'], `${where}: inert, hidden, no height, transparent`)
	assert.ok(main.width > 300, `${where}: laid out at its width (${main.width})`)

	// The box: from the header's pinned bottom to the screen's bottom, after the open scroll.
	const b = await boxNow(page)
	assert.equal(b.view, 'reimagined', `${where}: body[data-aixc-view]`)
	assert.ok(b.barFirst && b.barSticky === 'sticky' && b.barSizing === 'border-box', `${where}: PageHost's view bar is the box's first, sticky row (${JSON.stringify(b)})`)
	assert.ok(Math.abs(b.bottom - b.inner) <= 1, `${where}: the box's bottom ${b.bottom} is the screen's ${b.inner}`)
	// Its top meets the header's bottom, or rests as close as the page lets it: below it, at the top of the page.
	assert.ok(b.top >= b.header - 1, `${where}: the box's top ${b.top} is not under the header (${b.header})`)
	assert.ok(Math.abs(b.top - b.header) <= 1 || b.scrollY === 0, `${where}: the box's top ${b.top} meets the header's bottom ${b.header}, or the page is at its top (${b.scrollY})`)
	assert.deepEqual([b.overflowY, b.overscroll], ['auto', 'contain'], `${where}: its own scroll, which does not chain into the page's`)

	// Its own scroll moves, the window's does not.
	await page.mouse.move(viewport.width / 2, (b.top + b.bottom) / 2)
	await page.mouse.wheel(0, 600)
	await settle(page, 300)
	const scrolled = await boxNow(page)
	assert.ok(scrolled.scrollTop > 100, `${where}: a wheel over the box scrolls it (${scrolled.scrollTop})`)
	assert.ok(Math.abs(scrolled.scrollY - b.scrollY) <= 0.5, `${where}: the window stays (${b.scrollY} -> ${scrolled.scrollY})`)

	// Every item once; one exposed h1; nothing sideways.
	const items = await page.evaluate(() => {
		const model = (window as any).__aixc.model
		const ids = [...model.sections.flatMap((s: any) => s.items.map((i: any) => i.id)), ...(model.closingPromotion ? [model.closingPromotion.id] : [])]
		const shown = [...document.querySelectorAll<HTMLElement>('.aixc-box [data-aixc-item]')].map((n) => n.dataset.aixcItem!)
		const count = (id: string) => shown.filter((x) => x === id).length
		return { missing: ids.filter((id: string) => count(id) === 0), twice: ids.filter((id: string) => count(id) > 1), extra: shown.filter((id) => !ids.includes(id)), total: ids.length }
	})
	assert.ok(items.total > 0, `${where}: the page has items`)
	assert.deepEqual([items.missing, items.twice, items.extra], [[], [], []], `${where}: every item once`)
	// One exposed h1, the view's, with a name; Vodafone's own level-1 heading in its header (not an h1) is as without the layer.
	const h1 = await exposedH1(page)
	const own = h1.filter((x) => x.tag === 'h1')
	assert.equal(own.length, 1, `${where}: one exposed h1 (${JSON.stringify(h1)})`)
	assert.ok(own[0].name.trim().length > 0, `${where}: the h1 has a name`)
	assert.deepEqual(h1.filter((x) => x.tag !== 'h1'), servedHeadings, `${where}: Vodafone's other level-1 headings as served`)
	const wide = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, client: document.documentElement.clientWidth, box: document.querySelector('.aixc-box')!.scrollWidth, boxClient: document.querySelector('.aixc-box')!.clientWidth }))
	assert.ok(wide.doc <= wide.client && wide.box <= wide.boxClient + 1, `${where}: no sideways overflow (${JSON.stringify(wide)})`)

	// Where the row lays its stage flat (row.flat), it does not pin there: not sticky, and no step.
	const flat = row.flat?.(cell) ?? false
	const pins = flat ? false : row.pins
	if (flat && row.pins) {
		const position = await page.evaluate((stage) => getComputedStyle(document.querySelector(`.aixc-box ${stage}`)!).position, row.pins.stage)
		assert.notEqual(position, 'sticky', `${where}: laid flat, the stage does not pin (${position})`)
	}

	// Into the track: the stage pins at the bar, its bottom at the box's (higher when it is taller than the room).
	if (pins) {
		await page.evaluate(({ track }) => {
			const box = document.querySelector('.aixc-box')!
			box.scrollTop += box.querySelector(track)!.getBoundingClientRect().top - box.getBoundingClientRect().top - (box.firstElementChild as HTMLElement).offsetHeight + 1
		}, pins)
		await settle(page, 500)
		const s = await pinNow(page, pins.stage)
		const roomUnderBar = s.room - s.barH
		assert.ok(Math.abs(s.bottomGap) <= 1, `${where}: the stage's bottom at the box's (gap ${s.bottomGap})`)
		if (s.height <= roomUnderBar + 1) assert.ok(Math.abs(s.top - s.barH) <= 1, `${where}: the stage's top ${s.top} at the bar's height ${s.barH}`)
		else assert.ok(s.top < s.barH, `${where}: a stage taller than the room (${s.height} > ${roomUnderBar}) pins higher, its bottom at the box's`)
	}

	// Prev and next step it: the box's scroll moves, the window's does not.
	if (row.step && !flat) {
		const next = await stepOnce(page, row.step, 'next', where)
		const prev = await stepOnce(page, row.step, 'prev', where)
		console.log(`[step] ${experience} ${where}: next ${next} px, prev ${prev} px of the box's scroll`)
	}

	// Nothing pressable in a corner's safe zone, and each control clear of both.
	if (row.controlSelectors.length && row.pocketed) {
		const zones = await zonesNow(page)
		assert.ok(zones.right && zones.left, `${where}: both corners' zones measured (${fmt(zones.right)} ${fmt(zones.left)})`)
		const hits = await pressablesInZones(page, row.zoneScope ?? (pins ? `.aixc-box ${pins.stage}` : '.aixc-box .aixc-stage'), zones)
		// Laid flat (row.flat) the row's controls are not shown: what shows of the view here may be one link in a short box
		// (the row's specifics sweep the box's whole scroll instead).
		if (!flat) assert.ok(hits.seen >= 3, `${where}: the stage's controls were read (${hits.seen})`)
		assert.deepEqual(hits.out, [], `${where}: nothing pressable in a corner's zone ${fmt(zones.right)} ${fmt(zones.left)}`)
		for (const what of row.controlSelectors) {
			const c = await shownRect(page, what)
			if (c) for (const [name, z] of Object.entries(zones)) if (z) assert.ok(!meets(c, z), `${where}: ${what} ${fmt(c)} clear of the ${name} zone ${fmt(z)}`)
		}
	}

	await row.specifics?.(page, cell, where)

	// At the box's end (the closing band after the track, the stage gone by): nothing of the view (the shell's
	// .aixc-stage, every experience's) cut by the box's sides: its pressables, items and headings (the closing band's
	// store links on Vodafone's pages are text buttons, wider than the clone's badges). The box's scroll then back where
	// it was.
	const was = await page.evaluate(() => {
		const box = document.querySelector<HTMLElement>('.aixc-box')!
		const top = box.scrollTop
		box.scrollTop = box.scrollHeight
		return top
	})
	await settle(page, 300)
	const atEnd = await cutBySides(page, '.aixc-stage')
	assert.ok(atEnd.seen > 0, `${where}: at the box's end the view's parts were read (${atEnd.seen})`)
	assert.deepEqual(atEnd.cut, [], `${where}: at the box's end nothing of the view cut by the box's sides (${atEnd.seen} read)`)
	await page.evaluate((top) => {
		document.querySelector<HTMLElement>('.aixc-box')!.scrollTop = top
	}, was)
	await settle(page, 300)

	// reveal(itemId): a middle item into the box's view under the bar, the window still; an item it lacks, false.
	const itemId = await middleItem(page)
	await (row.revealAssert ?? revealInBox)(page, itemId, where)
	assert.equal(await page.evaluate(() => (window as any).__aixc.demos.reimagine.state.activeExperience.reveal('no-such-item')), false, `${where}: reveal('no-such-item') says the view lacks it`)

	// The experience's own unmount gives back everything it took through the seam: while the view shows the seam holds
	// its listeners (state.debug().kept, unless the row keeps none), and after activeExperience.unmount() none (the
	// shell's configure() is not part of this: it clears the seam by itself). Then mounted again, as the album does.
	const unmounted = await page.evaluate(() => {
		const s = (window as any).__aixc.demos.reimagine.state
		const before = s.debug().kept as number
		s.activeExperience.unmount()
		return { before, after: s.debug().kept as number, mounted: s.activeExperience.mounted as boolean }
	})
	if (row.keepsNone) assert.equal(unmounted.before, 0, `${where}: a row marked keepsNone keeps nothing through the seam while it shows`)
	else assert.ok(unmounted.before > 0, `${where}: the seam holds the experience's listeners while it shows (state.debug().kept ${unmounted.before})`)
	assert.deepEqual([unmounted.after, unmounted.mounted], [0, false], `${where}: the experience's unmount gives back all it kept (${unmounted.before} -> ${unmounted.after})`)
	await page.evaluate(() => (window as any).__aixc.demos.reimagine.state.activeExperience.mount())
	await settle(page, 300)
	assert.equal(await page.evaluate(() => (window as any).__aixc.demos.reimagine.state.activeExperience.mounted), true, `${where}: mounted again`)

	// Original, from the bar. The seam keeping nothing then only confirms the shell's configure(), which clears it.
	await pressIn(page, '.aixc-viewbar .aixc-seg[data-view="original"]')
	await page.waitForFunction(() => (window as any).__aixc.demos.reimagine.state.view === 'original', null, { timeout: 5_000 })
	await settle(page, 300)
	assert.equal((await state(page))?.debug?.kept, 0, `${where}: Original: nothing kept (state.debug().kept; configure() clears it)`)

	assert.deepEqual(l.refused.filter((r) => /google|generativelanguage|codepen/i.test(r.url)), [], `${where}: nothing asked of Google or CodePen`)
	assert.deepEqual(seen.pageErrors.filter((e) => !/navUserToggling|navToggling/.test(e)), [], `${where}: no page errors`)
	assert.deepEqual(seen.layer.filter((x) => x.startsWith('error')), [], `${where}: the layer logged no error`)
}

/** One cell of a row: the page opened, the served page read, something pocketed if the row asks, the view chosen; checkInBox. */
async function boxCell(experience: string, cell: Cell) {
	const row = EXPERIENCE_CASES[experience]
	const where = `${cell.p} ${sizeOf(cell.viewport)}${cell.fixedHeader === undefined ? '' : ` fixedHeader ${cell.fixedHeader}`}${cell.motion ? ' motion' : ''}`
	const l = await launchLayer(gw, { viewport: cell.viewport, reducedMotion: !cell.motion, ...LIVE, ...(cell.fixedHeader === undefined ? {} : { fixedHeader: cell.fixedHeader }) })
	try {
		const seen = watch(l.page)
		await open(l.page, cell.p, '?aixc-debug')
		await ready(l.page)
		const served = await mainNow(l.page)
		const servedHeadings = (await exposedH1(l.page)).filter((x) => x.tag !== 'h1')
		// Something pocketed: the Pocket's button shows in the bottom-left corner, so both corners have a zone.
		if (row.pocketed) await pocketOne(l.page)
		await openComposer(l.page)
		await row.composer?.(l.page, cell, where)
		await choose(l.page, experience)
		await checkInBox(l.page, { experience, cell, where, served, servedHeadings, l, seen })
	} finally {
		await l.close()
	}
}

// One test per row, in the table's order: the rows still todo listed as such, the others over their cells.
for (const [experience, row] of Object.entries(EXPERIENCE_CASES)) {
	if (row.todo) {
		test.todo(`${experience} in the box: the 16-cell matrix (phase 4b)`)
		continue
	}
	const cells = [...row.cells, ...(row.landscape ? LANDSCAPE_CELLS : [])]
	test(row.title ?? `${experience} in the box: the ${cells.length}-cell matrix`, { timeout: row.timeout ?? 1_800_000 }, async () => {
		for (const cell of cells) await boxCell(experience, cell)
		await row.andThen?.()
	})
}

test('Vodafone\'s accessibility button and cookie banner, and the guide\'s microphone, as with ?aixc=off while a view shows', { timeout: 600_000 }, async () => {
	for (const banner of [false, true])
		for (const viewport of banner ? [DESKTOP] : [DESKTOP, PHONE])
			for (const p of ['/en/services', '/ar/services']) {
				const where = `${p} ${sizeOf(viewport)}${banner ? ' with the banner' : ''}`
				const l = await launchLayer(gw, { viewport, reducedMotion: true, ...LIVE, banner })
				try {
					const guideNow = () =>
						l.page.evaluate(() => {
							const g = document.querySelector<HTMLElement>('vg-guide')
							const mic = g?.shadowRoot?.querySelector<HTMLElement>('.vg-mic')
							return { bottom: mic ? getComputedStyle(mic).bottom : null, lift: g ? getComputedStyle(g).getPropertyValue('--vg-lift') : null }
						})
					await open(l.page, p, '?aixc=off')
					await settle(l.page, 400)
					const off = await measureControls(l.page, 'off')
					const guideOff = await guideNow()
					await open(l.page, p, '?aixc-debug')
					await ready(l.page)
					if (banner) {
						// The banner's filter takes every press until it is answered: the view is opened by script here.
						await l.page.evaluate(() => document.querySelector<HTMLElement>('.aixc-launcher')!.click())
						await l.page.waitForSelector('#aixc-composer:not([hidden])')
						await l.page.evaluate(() => document.querySelector<HTMLElement>('.aixc-template[data-template="magazine"]')!.click())
						await l.page.waitForFunction(() => (window as any).__aixc.demos.reimagine.state?.view === 'reimagined', null, { timeout: 15_000 })
						await settle(l.page, 400)
					} else await choose(l.page, 'magazine')
					const m = await measureControls(l.page, 'view')
					const v = cellViolations(m, { where, off: off.button, ...(await cellHits(l.page, m)) }).filter((x) => /\((c|d|e)\)/.test(x))
					assert.deepEqual(v, [], `${where}: rules (c), (d) and (e) hold while the view shows`)
					assert.deepEqual(await guideNow(), guideOff, `${where}: the microphone's computed bottom and --vg-lift as with ?aixc=off`)
					if (banner) {
						const top = await l.page.evaluate(() => {
							const bar = document.querySelector('.aixc-viewbar')!.getBoundingClientRect()
							const at = document.elementFromPoint(bar.left + bar.width / 2, bar.top + bar.height / 2)
							return at?.closest('#onetrust-consent-sdk') ? 'onetrust' : at ? `${at.localName}.${at.className}` : 'nothing'
						})
						assert.equal(top, 'onetrust', `${where}: the banner's filter is above the view bar`)
					}
				} finally {
					await l.close()
				}
			}
})

test('the Pocket over a view: no resting curl, its button shown; the turn draws the curl and the box where the reader left it; the album keeps the box\'s scroll', { timeout: 600_000 }, async () => {
	for (const p of ['/en/services', '/ar/services']) {
		const where = `${p} desktop`
		const l = await launchLayer(gw, { viewport: DESKTOP, ...LIVE })
		try {
			const seen = watch(l.page)
			await open(l.page, p, '?aixc-debug')
			await ready(l.page)
			await pocketOne(l.page)
			await choose(l.page, 'magazine')
			await l.page.evaluate(() => (document.querySelector('.aixc-box')!.scrollTop = 1500))
			await settle(l.page, 300)
			const kept = (await boxNow(l.page)).scrollTop
			assert.ok(kept > 1000, `${where}: the box scrolled (${kept})`)
			const curl = () =>
				l.page.evaluate(() => {
					const peek = document.querySelector<HTMLElement>('.pocket-peek')
					const r = peek?.getBoundingClientRect()
					return { layers: [...document.querySelectorAll('.pocket-layer--plane, .pocket-layer--lift')].map((n) => getComputedStyle(n).opacity), peek: peek?.dataset.state ?? null, hit: r ? !!document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)?.closest('.pocket-peek') : false }
				})
			const rest = await curl()
			assert.deepEqual(rest.layers, ['0', '0'], `${where}: the resting curl is not drawn while the view shows`)
			assert.equal(rest.peek, 'shown', `${where}: the Pocket's button shows`)
			assert.ok(rest.hit, `${where}: a press reaches the Pocket's button`)

			// The turn, frame by frame: the curl draws, and the turning copy's box is where the live one was.
			const watchTurn = () =>
				l.page.evaluate(
					() =>
						new Promise<{ opacity: string[]; copies: number[] }>((done) => {
							const seen = { opacity: new Set<string>(), copies: new Set<number>() }
							const end = Date.now() + 2_500
							const tick = () => {
								// While the page turns (the album's mark is on body from the turn's first frame to the landing).
								const turning = 'pocketView' in document.body.dataset
								for (const n of document.querySelectorAll('.pocket-layer--plane, .pocket-layer--lift')) if (turning && n.childElementCount) seen.opacity.add(getComputedStyle(n).opacity)
								for (const c of document.querySelectorAll<HTMLElement>('.pocket-layer .aixc-box')) if (turning && !c.closest('[hidden]') && c.clientHeight) seen.copies.add(Math.round(c.scrollTop))
								if (Date.now() < end) requestAnimationFrame(tick)
								else done({ opacity: [...seen.opacity], copies: [...seen.copies] })
							}
							tick()
						}),
				)
			const opening = watchTurn()
			await l.page.evaluate(() => (window as any).__aixc.demos.pocket.open())
			const turn = await opening
			await l.page.waitForFunction(() => (window as any).__aixc.demos.pocket.state.view === 'pocket' && !(window as any).__aixc.demos.pocket.state.busy, null, { timeout: 10_000 })
			assert.deepEqual(turn.opacity, ['1'], `${where}: the curl draws during the album's turn`)
			assert.ok(turn.copies.length > 0 && turn.copies.every((y) => Math.abs(y - kept) <= 1), `${where}: the turning copy's box at ${JSON.stringify(turn.copies)}, the reader's ${kept}`)
			const closing = watchTurn()
			await l.page.evaluate(() => (window as any).__aixc.demos.pocket.close())
			const back = await closing
			await l.page.waitForFunction(() => (window as any).__aixc.demos.pocket.state.view === 'page' && !(window as any).__aixc.demos.pocket.state.busy, null, { timeout: 10_000 })
			await settle(l.page, 300)
			assert.ok(back.copies.length > 0 && back.copies.every((y) => Math.abs(y - kept) <= 1), `${where}: the closing copy's box at ${JSON.stringify(back.copies)}, the reader's ${kept}`)
			const after = await boxNow(l.page)
			assert.ok(Math.abs(after.scrollTop - kept) <= 1, `${where}: the box's scroll after the album ${after.scrollTop}, before ${kept}`)
			assert.equal((await state(l.page))?.view, 'reimagined', `${where}: the view shows again`)
			assert.deepEqual((await curl()).layers, ['0', '0'], `${where}: and the resting curl is not drawn again`)
			assert.deepEqual(seen.pageErrors.filter((e) => !/navUserToggling|navToggling/.test(e)), [], `${where}: no page errors`)
		} finally {
			await l.close()
		}
	}
})

test('Original gives the page back as served, Owl\'s carousels painted, the window where the reader left it; Reimagined comes back at the same box scroll; Reset; a new experience starts at its top', { timeout: 600_000 }, async () => {
	// /ar/services: Owl's carousels in Arabic (the saved /ar/home has none).
	for (const [p, viewport] of [['/en/services', DESKTOP], ['/ar/home', DESKTOP], ['/ar/services', DESKTOP], ['/en/services', PHONE]] as const) {
		const where = `${p} ${sizeOf(viewport)}`
		const l = await launchLayer(gw, { viewport, reducedMotion: true, ...LIVE })
		try {
			const seen = watch(l.page)
			await open(l.page, p, '?aixc-debug')
			await ready(l.page)
			const served = await mainNow(l.page)
			// The carousels Owl laid out on the page as served: the Services pages have them (4), never none.
			const servedOwl = await l.page.evaluate(() => document.querySelectorAll('#main-content .owl-carousel.owl-loaded').length)
			if (/\/services$/.test(p)) assert.ok(servedOwl > 0, `${where}: Owl laid out the page's carousels (${servedOwl})`)
			await l.page.evaluate(() => scrollTo(0, 40))
			await settle(l.page, 300)
			const was = await l.page.evaluate(() => scrollY)
			await choose(l.page, 'magazine')
			await l.page.evaluate(() => (document.querySelector('.aixc-box')!.scrollTop = 900))
			await settle(l.page, 300)
			const kept = (await boxNow(l.page)).scrollTop

			// Original, from the view bar.
			await pressIn(l.page, '.aixc-viewbar .aixc-seg[data-view="original"]')
			await l.page.waitForFunction(() => (window as any).__aixc.demos.reimagine.state.view === 'original', null, { timeout: 5_000 })
			await settle(l.page, 1_200)
			const main = await mainNow(l.page)
			assert.deepEqual([main.style, main.inert, main.hidden], [served.style, served.inert, served.hidden], `${where}: #main-content's attributes as served`)
			const o = await boxNow(l.page)
			assert.equal(o.hidden, true, `${where}: the box is hidden`)
			assert.equal(o.view, 'original', `${where}: body[data-aixc-view]`)
			assert.ok(Math.abs(o.scrollY - was) <= 1, `${where}: the window back at ${was} (${o.scrollY})`)
			const owl = await l.page.evaluate(() => [...document.querySelectorAll<HTMLElement>('#main-content .owl-carousel.owl-loaded')].map((c) => ({ hidden: c.classList.contains('owl-hidden'), opacity: getComputedStyle(c).opacity })))
			assert.equal(owl.length, servedOwl, `${where}: every carousel Owl laid out is there (${owl.length} of ${servedOwl})`)
			assert.ok(owl.every((c) => !c.hidden && c.opacity === '1'), `${where}: Owl's carousels painted after AutoRefresh's polls (${JSON.stringify(owl)})`)
			assert.equal(await l.page.evaluate(() => !document.querySelector<HTMLElement>('.aixc-launcher')!.hidden), true, `${where}: the launcher shows again`)
			assert.equal(await l.page.evaluate(() => document.activeElement?.classList.contains('aixc-launcher')), true, `${where}: the focus is on the launcher`)

			// Reimagined, from the composer's segment: the same experience at the same box scroll.
			await openComposer(l.page)
			await l.page.locator('#aixc-composer .aixc-seg[data-view="reimagined"]').click()
			await l.page.waitForFunction(() => (window as any).__aixc.demos.reimagine.state.view === 'reimagined', null, { timeout: 5_000 })
			await settle(l.page, 400)
			const r = await boxNow(l.page)
			assert.ok(Math.abs(r.scrollTop - kept) <= 1, `${where}: the box's scroll back at ${kept} (${r.scrollTop})`)
			assert.ok(Math.abs(r.bottom - r.inner) <= 1 && r.top >= r.header - 1 && (Math.abs(r.top - r.header) <= 1 || r.scrollY === 0), `${where}: the box under the header to the screen's bottom again (${r.top}..${r.bottom}, header ${r.header})`)
			assert.equal((await state(l.page))?.template, 'magazine', `${where}: the same experience`)
			assert.equal(await l.page.locator('#aixc-composer').isHidden(), true, `${where}: the composer closed`)

			// A new experience starts at its top.
			await l.page.locator('.aixc-viewbar .aixc-text-btn[aria-controls="aixc-composer"]').click()
			await l.page.waitForSelector('#aixc-composer:not([hidden])')
			await choose(l.page, 'spotlight')
			assert.equal((await boxNow(l.page)).scrollTop, 0, `${where}: a new experience at its top`)

			// Reset.
			await pressIn(l.page, '.aixc-viewbar .aixc-text-btn:not([aria-controls])')
			await l.page.waitForFunction(() => (window as any).__aixc.demos.reimagine.state.view === 'original', null, { timeout: 5_000 })
			await settle(l.page, 300)
			const reset = await l.page.evaluate(() => ({ stage: document.querySelector('.aixc-box .aixc-stage')!.childElementCount, hidden: document.querySelector<HTMLElement>('.aixc-box')!.hidden, template: (window as any).__aixc.demos.reimagine.state.template, active: (window as any).__aixc.demos.reimagine.state.activeExperience, reimagined: document.querySelector<HTMLButtonElement>('#aixc-composer .aixc-seg[data-view="reimagined"]')!.disabled }))
			assert.deepEqual(reset, { stage: 0, hidden: true, template: null, active: null, reimagined: true }, `${where}: Reset drops the view`)
			const main2 = await mainNow(l.page)
			assert.deepEqual([main2.style, main2.inert, main2.hidden], [served.style, served.inert, served.hidden], `${where}: #main-content as served after Reset`)
			assert.equal((await state(l.page))?.debug?.kept, 0, `${where}: the experiences' seam keeps nothing after Reset`)
			assert.deepEqual(seen.pageErrors.filter((e) => !/navUserToggling|navToggling/.test(e)), [], `${where}: no page errors`)
		} finally {
			await l.close()
		}
	}
})

/* ------------------------------------------------------------------------------- the bar, fonts, composer */

test('the view bar\'s buttons are never under the trail\'s pill (B-23); on phones they are on a row below it', { timeout: 300_000 }, async () => {
	for (const viewport of [DESKTOP, PHONE])
		for (const p of ['/en/services', '/ar/services']) {
			const where = `${p} ${sizeOf(viewport)}`
			const l = await launchLayer(gw, { viewport, reducedMotion: true, ...LIVE })
			try {
				await open(l.page, p, '?aixc-debug')
				await ready(l.page)
				await choose(l.page, 'magazine')
				await l.page.waitForFunction(() => !!document.querySelector('vg-guide')?.shadowRoot?.querySelector('.tr-pill:not([hidden])'), null, { timeout: 20_000 })
				await settle(l.page, 300)
				const pill = await pillOf(l.page)
				assert.ok(pill, `${where}: the pill shows`)
				const buttons = await l.page.evaluate(() =>
					[...document.querySelectorAll<HTMLElement>('.aixc-viewbar button')].map((b) => {
						const r = b.getBoundingClientRect()
						const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
						return { what: (b.textContent ?? '').trim(), box: { left: r.left, top: r.top, right: r.right, bottom: r.bottom }, reaches: !!hit && (hit === b || b.contains(hit)) }
					}),
				)
				assert.equal(buttons.length, 4, `${where}: Original, Reimagined, Change experience, Reset`)
				for (const b of buttons) {
					assert.ok(!meets(b.box, pill), `${where}: "${b.what}" ${fmt(b.box)} clear of the pill ${fmt(pill)}`)
					assert.ok(b.reaches, `${where}: a press at "${b.what}" reaches it`)
					if (viewport === PHONE) assert.ok(b.box.top >= pill.bottom, `${where}: "${b.what}" on a row below the pill (${b.box.top} >= ${pill.bottom})`)
				}
			} finally {
				await l.close()
			}
		}
})

test('our words in Vodafone\'s faces: the launcher, the composer, the bar, magazine\'s and spotlight\'s headings (no system font)', { timeout: 600_000 }, async () => {
	for (const p of ['/en/home', '/ar/home', '/en/mobile-internet-bundles', '/ar/mobile-internet-bundles']) {
		const where = `${p} desktop`
		const l = await launchLayer(gw, { viewport: DESKTOP, reducedMotion: true, ...LIVE })
		try {
			// The replay did not save static-lite-theme's regular font files: maintheme's copies, as pocket-fonts serves them.
			await l.b.context.route('**/theme-assets/static-lite-theme/fonts/*.woff', (route) => route.fulfill({ path: path.join(REPLAY, 'assets/theme-assets/maintheme/fonts', path.basename(new URL(route.request().url()).pathname)), contentType: 'font/woff' }))
			await open(l.page, p, '?aixc-debug')
			await ready(l.page)
			await l.page.evaluate(() => document.fonts.ready)
			const used = [...(await fontsOfSelectors(l.page, ['.aixc-launcher span']))]
			await openComposer(l.page)
			await l.page.evaluate(() => document.fonts.ready)
			used.push(...(await fontsOfSelectors(l.page, ['#aixc-composer .aixc-composer__title', '#aixc-composer .aixc-seg', '#aixc-composer .aixc-template__name'])))
			await choose(l.page, 'magazine')
			await l.page.evaluate(() => document.fonts.ready)
			used.push(...(await fontsOfSelectors(l.page, ['.aixc-viewbar .aixc-seg', '.aixc-viewbar .aixc-text-btn', '.aixc-viewbar__meta', '.aixc-magazine h2', '.aixc-end .aixc-end__btn'])))
			await l.page.locator('.aixc-viewbar .aixc-text-btn[aria-controls="aixc-composer"]').click()
			await choose(l.page, 'spotlight')
			await l.page.evaluate(() => document.fonts.ready)
			used.push(...(await fontsOfSelectors(l.page, ['.sp-slide:not([hidden]) .sp-slide__title'])))
			for (const what of ['.aixc-launcher span', '#aixc-composer .aixc-template__name', '.aixc-viewbar .aixc-seg', '.aixc-magazine h2', '.sp-slide:not([hidden]) .sp-slide__title']) assert.ok(used.some((u) => u.what === what), `${where}: ${what} was read`)
			const system = used.filter((u) => u.fonts.some((f) => !f.isCustomFont))
			assert.deepEqual(system.map((u) => `${u.what} "${u.text}": ${u.fonts.map((f) => f.familyName).join(', ')}`), [], `${where}: every word of ours in a web font`)
		} finally {
			await l.close()
		}
	}
})

test('the composer: Escape closes it and gives the focus back, the launcher opens and closes it, Vodafone\'s menus close it, its height ends above both corners', { timeout: 300_000 }, async () => {
	for (const viewport of [DESKTOP, PHONE]) {
		const where = `/en/services ${sizeOf(viewport)}`
		const l = await launchLayer(gw, { viewport, reducedMotion: true, ...LIVE })
		try {
			await open(l.page, '/en/services', '?aixc-debug')
			await ready(l.page)
			await openComposer(l.page)
			assert.equal(await l.page.evaluate(() => document.activeElement?.classList.contains('aixc-template')), true, `${where}: the focus goes to the first template`)
			await l.page.keyboard.press('Escape')
			await l.page.waitForSelector('#aixc-composer', { state: 'hidden' })
			assert.deepEqual(await l.page.evaluate(() => [document.activeElement?.classList.contains('aixc-launcher'), document.querySelector('.aixc-launcher')!.getAttribute('aria-expanded')]), [true, 'false'], `${where}: Escape closes it, the focus back on the launcher`)
			await openComposer(l.page)
			await l.page.locator('.aixc-launcher').click()
			await l.page.waitForSelector('#aixc-composer', { state: 'hidden' })
			await openComposer(l.page)
			// Its height ends above both corners' controls (16 px from them). Here it ends there by its own height; the short
			// screens below are where its max-height must hold it.
			const fit = await l.page.evaluate(() => {
				const c = document.getElementById('aixc-composer')!.getBoundingClientRect()
				const root = document.querySelector('vg-guide')?.shadowRoot
				const tops = [document.getElementById('vodafone-aw-icon'), root?.querySelector('.vg-mic')].filter(Boolean).map((n) => n!.getBoundingClientRect().top)
				return { bottom: c.bottom, limit: Math.min(...tops) - 16, measured: tops.length }
			})
			assert.equal(fit.measured, 2, `${where}: the accessibility button and the microphone were measured`)
			assert.ok(fit.bottom <= fit.limit + 1, `${where}: the composer's bottom ${fit.bottom} above the corners' controls (${fit.limit})`)
			// One of Vodafone's menus opens: the composer closes.
			if (viewport === DESKTOP) await l.page.locator('#avatar').click()
			else await l.page.evaluate(() => document.querySelector('.nav-header')!.classList.add('nav-opened'))
			await l.page.waitForSelector('#aixc-composer', { state: 'hidden', timeout: 5_000 }).catch(() => assert.fail(`${where}: the composer did not close when Vodafone's menu opened`))
			assert.equal((await state(l.page))?.composerOpen, false, `${where}: closed`)
		} finally {
			await l.close()
		}
	}
	// A short screen, with something pocketed (the Pocket's button in the bottom-left corner): the composer's content is
	// taller than the room between its top and the corners' controls. On the phone it stays below its opener and its
	// max-height holds it (it scrolls inside); on the laptop the column beside its opener fits it, and it shows whole there
	// (the placements: the short-screen tests below).
	for (const [viewport, at] of [[{ width: 1366, height: 520 }, 'beside'], [{ width: 375, height: 520 }, 'below']] as const) {
		const where = `/en/services ${sizeOf(viewport)}`
		const l = await launchLayer(gw, { viewport, reducedMotion: true, ...LIVE })
		try {
			await open(l.page, '/en/services', '?aixc-debug')
			await ready(l.page)
			await pocketOne(l.page)
			await openComposer(l.page)
			const fit = await l.page.evaluate(() => {
				const el = document.getElementById('aixc-composer')!
				const c = el.getBoundingClientRect()
				const root = document.querySelector('vg-guide')?.shadowRoot
				const shown = (n: Element | null | undefined) => {
					if (!n || !n.getClientRects().length) return null
					const r = n.getBoundingClientRect()
					const s = getComputedStyle(n)
					return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && Number(s.opacity) > 0.05 && (n as HTMLElement).dataset.state !== 'hidden' ? r : null
				}
				const right = [document.getElementById('vodafone-aw-icon'), root?.querySelector('.vg-mic')].map(shown).filter(Boolean) as DOMRect[]
				const left = [document.querySelector('.pocket-peek')].map(shown).filter(Boolean) as DOMRect[]
				const header = Math.max((window as any).__aixc.host.chromeBottom(), ...[document.getElementById('header'), document.getElementById('nav-header')].map((n) => n?.getBoundingClientRect()).filter((r) => !!r && r.top <= 10 && r.bottom > 0 && r.height <= innerHeight * 0.35).map((r) => r!.bottom))
				const launcher = document.querySelector('.aixc-launcher')!.getBoundingClientRect()
				// Each corner's control grown by 16 px (box.js's SAFE): the zones the composer beside its opener keeps out of.
				const zones = [...right, ...left].map((r) => ({ left: r.left - 16, top: r.top - 16, right: r.right + 16, bottom: r.bottom + 16 }))
				return { top: c.top, bottom: c.bottom, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight, right: right.length, left: left.length, limit: Math.min(...[...right, ...left].map((r) => r.top)) - 16, header, placement: el.dataset.placement ?? null, under: launcher.bottom, zones, box: { left: c.left, top: c.top, right: c.right, bottom: c.bottom } }
			})
			assert.deepEqual([fit.right, fit.left], [2, 1], `${where}: both corners' controls measured: the accessibility button and the microphone, the Pocket's button`)
			assert.equal(fit.placement, at, `${where}: the composer goes ${at} its opener`)
			assert.ok(fit.limit - (fit.under + 8) < H_MIN, `${where}: the room under the launcher (${fit.limit - (fit.under + 8)}) is shorter than the composer (H_MIN ${H_MIN})`)
			if (at === 'below') assert.ok(fit.scrollHeight > fit.clientHeight + 1, `${where}: the composer's content (${fit.scrollHeight}) is taller than its room (${fit.clientHeight}): its max-height holds it`)
			else assert.ok(fit.scrollHeight <= fit.clientHeight + 1, `${where}: the composer shows whole beside its opener (${fit.scrollHeight} in ${fit.clientHeight})`)
			// Below its opener its bottom ends above both corners' controls; beside it, it meets neither corner's zone (box.js's
			// rule: its column may pass beside a corner's control, as at 1366x520 beside the Pocket's button, never over it).
			if (at === 'below') assert.ok(fit.bottom <= fit.limit + 1, `${where}: the composer's bottom ${fit.bottom} above the corners' controls (${fit.limit})`)
			else assert.deepEqual(fit.zones.filter((z) => fit.box.left < z.right - 1 && z.left < fit.box.right - 1 && fit.box.top < z.bottom - 1 && z.top < fit.box.bottom - 1), [], `${where}: the composer beside its opener meets no corner's zone (16 px around its controls)`)
			assert.ok(fit.top >= fit.header + 8 - 1, `${where}: the composer's top ${fit.top} under Vodafone's header (${fit.header})`)
		} finally {
			await l.close()
		}
	}
})

/*
 * Our floating controls never overlap (the owner's rule). Where the composer goes (the lead's decision, 2026-11-17), in
 * this order:
 * - BELOW: under its opener (the launcher, or the view bar's controls) and the trail's pill (not tucked away), 8 px
 *   down, where the room down to the corners' controls (16 px from them) is at least H_MIN;
 * - BESIDE: else in the column on the inline-start side of its opener (left of it in English, right of it in Arabic),
 *   its inline end 8 px from the opener, so the reader sees it next to what opened it; from the header's bottom + 8 to
 *   the screen's bottom - 16, clear of both corners' zones (16 px), the bar's controls and words, the trail's pill and
 *   the launcher (8 px: each cuts the column's top, bottom or a side, its inline end included, whichever leaves it the
 *   most), where that column is at least W_MIN wide and H_MIN tall;
 * - else BELOW as before: the room down to the corners' controls as its height, scrolling inside, however little shows
 *   (375x360: the opener is about as low as the corners' controls), covering nothing.
 * H_MIN and W_MIN as measured on the composer in Vodafone's faces: H_MIN is the composer down to its first row of
 * template buttons (its heading, the Original / Reimagined row, "Ready-made experiences" and that row, with its
 * padding), the most it is from 240 to 400 px wide in English and Arabic (215: a row whose names take two lines); the
 * rows after it scroll inside the composer where the room is shorter (six templates: 277 to 371 px in all, thirteen 449
 * to 684, the columns as many as fit, 2 to 4; the shortest column beside: 219 px, 812x375 from "Change experience"), so
 * there the first row is pressed as it opens and every other one once scrolled into view inside it; W_MIN is the
 * narrowest width at which its heading stays on one line, in both languages (box.js holds the same).
 */
const H_MIN = 215
const W_MIN = 240

type ShortRun = { viewport: { width: number; height: number }; lang?: 'en' | 'ar'; opener: 'launcher' | 'change'; at: 'below' | 'beside'; pocketed?: boolean }

/**
 * The composer opened on a short screen, from the launcher or from the bar's "Change experience" (`pocketed`: with
 * something in the Pocket, its button in the bottom-left corner): where it goes, what it covers, what a press reaches.
 */
async function shortScreen({ viewport, lang = 'en', opener, at, pocketed = false }: ShortRun) {
	const p = `/${lang}/services`
	const where = `${p} ${sizeOf(viewport)}${pocketed ? ' (something pocketed)' : ''}, opened from the ${opener === 'change' ? 'bar\'s "Change experience"' : 'launcher'}`
	const l = await launchLayer(gw, { viewport, reducedMotion: true, ...LIVE })
	try {
		const seen = watch(l.page)
		await open(l.page, p, '?aixc-debug')
		await ready(l.page)
		if (pocketed) await pocketOne(l.page)
		// The composer is open, though with no room it has no height (Playwright's "visible" needs one).
		const opened = () => l.page.waitForFunction(() => (window as any).__aixc.demos.reimagine.state?.composerOpen === true && !document.getElementById('aixc-composer')!.hidden, null, { timeout: 10_000 })
		await l.page.locator('.aixc-launcher').click()
		await opened()
		if (opener === 'change') {
			// A view first: its template pressed by script, as the launcher's composer may have no room for it here.
			await l.page.evaluate(() => document.querySelector<HTMLElement>('.aixc-template[data-template="magazine"]')!.click())
			await l.page.waitForFunction(() => (window as any).__aixc.demos.reimagine.state.view === 'reimagined' && !!document.querySelector('.aixc-box:not([hidden]) > .aixc-stage > *'), null, { timeout: 15_000 })
			await settle(l.page, 400)
			await l.page.locator('.aixc-viewbar .aixc-text-btn[aria-controls="aixc-composer"]').click()
			await opened()
		}
		await settle(l.page, 200)
		const header = await headerBottomOf(l.page)
		const fit = await l.page.evaluate((opener) => {
			type B = { left: number; top: number; right: number; bottom: number }
			const box = (b: DOMRect): B => ({ left: b.left, top: b.top, right: b.right, bottom: b.bottom })
			// a meets b grown by m on every side.
			const meets = (a: B, b: B, m = 0) => a.left < b.right + m && b.left - m < a.right && a.top < b.bottom + m && b.top - m < a.bottom
			const el = document.getElementById('aixc-composer')!
			const r = el.getBoundingClientRect()
			const c = box(r)
			const reaches = (node: HTMLElement) => {
				const b = node.getBoundingClientRect()
				const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2)
				return !!hit && (hit === node || node.contains(hit))
			}
			const bar = document.querySelector<HTMLElement>('.aixc-viewbar')!
			const launcherEl = document.querySelector<HTMLElement>('.aixc-launcher')!
			// The opener: the launcher, or the view bar (every one of its buttons a press must reach) and its "Change experience".
			const from = opener === 'change' ? bar : launcherEl
			const button = opener === 'change' ? bar.querySelector<HTMLElement>('.aixc-text-btn[aria-controls="aixc-composer"]')! : launcherEl
			const presses = opener === 'change' ? [...bar.querySelectorAll<HTMLElement>('button')].filter((b) => b.getClientRects().length) : [launcherEl]
			const root = document.querySelector('vg-guide')?.shadowRoot
			const shown = (n: Element | null | undefined) => {
				if (!n || !n.getClientRects().length) return null
				const b = n.getBoundingClientRect()
				const s = getComputedStyle(n)
				return b.width > 0 && b.height > 0 && s.visibility !== 'hidden' && Number(s.opacity) > 0.05 && (n as HTMLElement).dataset.state !== 'hidden' ? b : null
			}
			const controls = [document.getElementById('vodafone-aw-icon'), ...(root ? [...root.querySelectorAll('.vg-mic, .vg-kbd, .vg-bar')] : []), document.querySelector('.pocket-peek')].map(shown).filter(Boolean) as DOMRect[]
			// The trail's pill where it rests (its transform taken off) and where it is now.
			const pe = root?.querySelector<HTMLElement>('.tr-pill')
			const pr = pe && !pe.hidden && pe.getClientRects().length ? pe.getBoundingClientRect() : null
			const m = pr ? new DOMMatrixReadOnly(getComputedStyle(pe!).transform) : null
			const pill = pr ? { tucked: pe!.classList.contains('tucked'), rest: { left: pr.left - m!.e, top: pr.top - m!.f, right: pr.right - m!.e, bottom: pr.bottom - m!.f }, now: box(pr) } : null
			const launcher = !launcherEl.hidden && launcherEl.getClientRects().length ? box(launcherEl.getBoundingClientRect()) : null
			// The bar's controls and its words (the view's name), while the bar shows.
			const barParts: B[] = []
			if (bar.getClientRects().length) {
				for (const n of bar.querySelectorAll<HTMLElement>('button, .aixc-segmented')) if (n.getClientRects().length) barParts.push(box(n.getBoundingClientRect()))
				const meta = bar.querySelector('.aixc-viewbar__meta')
				if (meta?.textContent?.trim()) {
					const range = document.createRange()
					range.selectNodeContents(meta)
					barParts.push(box(range.getBoundingClientRect()))
				}
			}
			const rtl = getComputedStyle(el).direction === 'rtl'
			// The opener's inline-start edge (the launcher, or the bar's "Change experience"): the column's inline end is 8 px past it.
			const ob = button.getBoundingClientRect()
			const side = rtl ? ob.right : ob.left
			// What may cut the column's inline end short of that, as it cuts any side: the pill where it rests, the launcher,
			// the bar's controls and words (8 px around them), the corners' controls (16 px); each as the inline edge it leaves.
			const grown = (b: B, m: number) => ({ left: b.left - m, top: b.top - m, right: b.right + m, bottom: b.bottom + m })
			const stops = [...(pill ? [grown(pill.rest, 8)] : []), ...(launcher ? [grown(launcher, 8)] : []), ...barParts.map((b) => grown(b, 8)), ...controls.map((b) => grown(box(b), 16))].map((s) => ({ edge: rtl ? s.right : s.left, top: s.top, bottom: s.bottom }))
			const under = Math.max(from.getBoundingClientRect().bottom, pill && !pill.tucked ? pill.rest.bottom : 0)
			const limit = Math.min(...controls.map((b) => b.top)) - 16
			// The templates as the composer opens (not scrolled): those a press at the centre misses, and its first row.
			const templates = [...el.querySelectorAll<HTMLElement>('.aixc-template')]
			const scrolledAtOpen = el.scrollTop
			const unreachedAtOpen = templates.filter((t) => !reaches(t)).map((t) => t.dataset.template)
			const rowTop = templates.length ? templates[0].getBoundingClientRect().top : 0
			const firstRow = templates.filter((t) => Math.abs(t.getBoundingClientRect().top - rowTop) <= 1)
			const firstRowUnreached = firstRow.filter((t) => !reaches(t)).map((t) => t.dataset.template)
			// The template it focuses as it opens (the shown one, else the first), which the composer scrolls to if need be.
			const focused = templates.find((t) => t === document.activeElement)
			// Then each one scrolled into view inside the composer, as a reader scrolls it there: a press at its centre
			// reaches it, and neither the page nor the box (where it shows) moved for it. The composer is put back after.
			const boxEl = document.querySelector<HTMLElement>('.aixc-box:not([hidden])')
			const still = { y: scrollY, box: boxEl ? boxEl.scrollTop : 0 }
			const scrolled = templates.map((t) => {
				t.scrollIntoView({ block: 'nearest', inline: 'nearest' })
				return { id: t.dataset.template, reaches: reaches(t), moved: scrollY !== still.y || (!!boxEl && boxEl.scrollTop !== still.box) ? `window ${scrollY - still.y}, box ${boxEl ? boxEl.scrollTop - still.box : 0}` : '' }
			})
			el.scrollTop = scrolledAtOpen
			return {
				c,
				placement: el.dataset.placement ?? null,
				rtl,
				side,
				stops,
				height: r.height,
				width: r.width,
				scrollHeight: el.scrollHeight,
				clientHeight: el.clientHeight,
				under,
				limit,
				vw: document.documentElement.clientWidth,
				vh: innerHeight,
				controls: controls.length,
				peek: !!shown(document.querySelector('.pocket-peek')),
				coversControl: controls.some((b) => meets(c, box(b))),
				inZone: controls.filter((b) => meets(c, box(b), 15)).map((b) => `[${[b.left, b.top, b.right, b.bottom].map(Math.round)}]`),
				coversPill: !!pill && (meets(c, pill.now) || meets(c, pill.rest)),
				// Within 8 px of the pill where it rests (tucked too: it comes back on the way up).
				nearPill: !!pill && meets(c, pill.rest, 7),
				coversLauncher: !!launcher && meets(c, launcher, 7),
				coversOpener: meets(c, box(button.getBoundingClientRect()), 7),
				coversBar: barParts.filter((b) => meets(c, b, 7)).map((b) => `[${[b.left, b.top, b.right, b.bottom].map(Math.round)}]`),
				unreached: presses.filter((b) => !reaches(b)).map((b) => b.textContent?.trim() || b.className),
				presses: presses.length,
				templates: unreachedAtOpen,
				count: templates.length,
				tallest: Math.max(0, ...templates.map((t) => t.getBoundingClientRect().height)),
				scrolledAtOpen,
				firstRow: firstRow.map((t) => t.dataset.template),
				firstRowUnreached,
				focused: focused ? { id: focused.dataset.template, reached: reaches(focused) } : null,
				unreachedScrolled: scrolled.filter((s) => !s.reaches).map((s) => s.id),
				moved: scrolled.filter((s) => s.moved).map((s) => `${s.id}: ${s.moved}`),
			}
		}, opener)
		const room = fit.limit - (fit.under + 8)
		const scrolls = fit.scrollHeight > fit.clientHeight + 1
		console.log(`[composer] ${where}: ${fit.placement} ${fmt(fit.c)}, ${fit.clientHeight} of ${fit.scrollHeight} px, ${scrolls ? `first row ${fit.firstRow.join(' ')} pressed as it opens (scrolled ${fit.scrolledAtOpen} to ${fit.focused?.id}), ${at === 'beside' || fit.clientHeight >= fit.tallest ? `${fit.count} scrolled into view and pressed` : 'too short for a template'}` : 'the whole of it shows'}`)
		assert.ok(fit.controls >= 2, `${where}: the accessibility button and the microphone were measured (${fit.controls})`)
		if (pocketed) assert.ok(fit.peek, `${where}: the Pocket's button shows in the bottom-left corner`)
		assert.ok(room < H_MIN, `${where}: the room under the opener (${room}) is shorter than H_MIN (${H_MIN})`)
		if (at === 'below') {
			assert.ok(room < 96, `${where}: the room under the opener (${room}) is shorter than the composer's head and a template`)
			assert.ok(fit.c.top >= fit.under + 8 - 1, `${where}: the composer's top ${fit.c.top} is 8 px under its opener and the pill (${fit.under})`)
			assert.ok(fit.c.bottom <= Math.max(fit.limit, fit.c.top) + 1 && fit.height <= Math.max(0, room) + 1, `${where}: the composer ${fmt(fit.c)} ends 16 px above the corners' controls (${fit.limit}), its height ${fit.height} in the room ${room}`)
			assert.ok(fit.scrollHeight > fit.clientHeight + 1, `${where}: the composer's content (${fit.scrollHeight}) scrolls in its room (${fit.clientHeight})`)
			if (room >= 32) assert.ok(fit.height >= room - 1, `${where}: the composer takes the room there is (${fit.height} of ${room})`)
		} else {
			assert.ok(fit.width >= W_MIN - 1 && fit.height >= H_MIN - 1, `${where}: the composer ${fmt(fit.c)} is at least ${W_MIN} wide and ${H_MIN} tall (${Math.round(fit.width)}x${Math.round(fit.height)})`)
			assert.ok(fit.c.top >= header + 8 - 1 && fit.c.bottom <= fit.vh - 16 + 1 && fit.c.left >= 16 - 1 && fit.c.right <= fit.vw - 16 + 1, `${where}: the composer ${fmt(fit.c)} under the header (${header}) + 8, 16 px inside the screen's sides and bottom (${fit.vw}x${fit.vh})`)
			// On the inline-start side of its opener, never nearer it than 8 px: next to what opened it.
			const end = fit.rtl ? fit.c.left : fit.c.right
			const want = fit.rtl ? fit.side + 8 : fit.side - 8
			assert.ok(fit.rtl ? end >= want - 1 : end <= want + 1, `${where}: the composer's inline end (${Math.round(end)}) at least 8 px on the inline-start side of its opener (${Math.round(fit.side)}, ${fit.rtl ? 'right of it' : 'left of it'})`)
			// Its inline end 8 px from its opener, or cut short only by something in its way between them (the pill, the
			// launcher, the bar's controls or words: 8 px from it; a corner's controls: 16 px), across the column's height.
			const stop = fit.stops.find((s) => Math.abs(s.edge - end) <= 1 && (fit.rtl ? s.edge > want + 1 : s.edge < want - 1) && s.top < fit.vh - 16 && s.bottom > fit.c.top)
			assert.ok(Math.abs(end - want) <= 1 || !!stop, `${where}: the composer's inline end (${Math.round(end)}) 8 px from its opener (${Math.round(fit.side)}) or from the first thing in its way (${JSON.stringify(fit.stops.map((s) => Math.round(s.edge)))})`)
			// The pill and the launcher are in its way, not its edge: it keeps 8 px from both (the launcher checked below).
			assert.equal(fit.nearPill, false, `${where}: the composer ${fmt(fit.c)} keeps 8 px from the trail's pill where it rests`)
			assert.deepEqual(fit.inZone, [], `${where}: the composer ${fmt(fit.c)} keeps 16 px from both corners' controls`)
			if (!scrolls) {
				// The whole composer shows: every template is pressed where it is.
				assert.deepEqual(fit.templates, [], `${where}: a press at each template's centre reaches it`)
			} else {
				// Taller than its column (H_MIN is down to its first row): the first row as it opens, the rest scrolled to.
				// From the launcher it opens at its top, its first row pressable with no scroll. From "Change experience" it
				// opens scrolled just to the shown template, which it focuses (the lead's decision, 2026-11-18: the reader's
				// current choice in view and under the keyboard's focus; with 13 templates the first row can be out of view).
				assert.ok(fit.focused?.reached, `${where}: the template the composer focuses as it opens (${JSON.stringify(fit.focused)}) is reached by a press at its centre, without the reader scrolling (the composer scrolled itself ${fit.scrolledAtOpen} px to it)`)
				if (opener === 'change') assert.equal(fit.focused?.id, 'magazine', `${where}: from "Change experience" the composer focuses the shown template (magazine)`)
				if (opener === 'launcher') {
					assert.equal(fit.scrolledAtOpen, 0, `${where}: the composer opens at its top`)
					assert.ok(fit.firstRow.length >= 1, `${where}: the composer shows its first row of templates (${fit.count} in all)`)
					assert.deepEqual(fit.firstRowUnreached, [], `${where}: a press at the centre of each template in the first row (${fit.firstRow.join(', ')}) reaches it, with no scroll`)
				}
			}
		}
		if (scrolls && (at === 'beside' || fit.clientHeight >= fit.tallest)) {
			// Wherever it scrolls (below: where a template fits in it): each one scrolled into view inside it is pressed at its centre,
			// and that scroll stays the composer's (overscroll-behavior: contain), the page and the box still.
			assert.deepEqual(fit.unreachedScrolled, [], `${where}: every template (${fit.count}), scrolled into view inside the composer (${fit.clientHeight} of ${fit.scrollHeight}), is reached by a press at its centre`)
			assert.deepEqual(fit.moved, [], `${where}: scrolling a template into view inside the composer moves neither the window nor the box`)
		}
		assert.equal(fit.coversControl, false, `${where}: the composer ${fmt(fit.c)} covers none of the corners' controls`)
		assert.equal(fit.coversPill, false, `${where}: the composer ${fmt(fit.c)} does not cover the trail's pill`)
		assert.equal(fit.coversLauncher, false, `${where}: the composer ${fmt(fit.c)} keeps clear of the launcher`)
		assert.equal(fit.coversOpener, false, `${where}: the composer ${fmt(fit.c)} keeps clear of its opener`)
		assert.deepEqual(fit.coversBar, [], `${where}: the composer ${fmt(fit.c)} keeps clear of the bar's controls and its words`)
		assert.equal(fit.placement, at, `${where}: the composer ${fmt(fit.c)} goes ${at} (the room under its opener ${room})`)
		assert.ok(fit.presses >= 1, `${where}: the opener's buttons were found`)
		assert.deepEqual(fit.unreached, [], `${where}: a press at the centre of each of the opener's buttons reaches it`)
		if (at === 'beside') {
			// A template pressed in it (scrolled into view inside it, the mouse at its centre) opens that view.
			const template = opener === 'change' ? 'spotlight' : 'magazine'
			await l.page.evaluate((template) => document.querySelector(`#aixc-composer .aixc-template[data-template="${template}"]`)!.scrollIntoView({ block: 'nearest', inline: 'nearest' }), template)
			await pressIn(l.page, `#aixc-composer .aixc-template[data-template="${template}"]`)
			await l.page
				.waitForFunction((template) => {
					const s = (window as any).__aixc.demos.reimagine.state
					return s?.view === 'reimagined' && s.template === template && !!document.querySelector('.aixc-box:not([hidden]) > .aixc-stage > *')
				}, template, { timeout: 15_000 })
				.catch(() => assert.fail(`${where}: pressing ${template} in the composer did not open its view`))
		}
		assert.deepEqual(seen.pageErrors.filter((e) => !/navUserToggling|navToggling/.test(e)), [], `${where}: no page errors`)
	} finally {
		await l.close()
	}
}

test('the composer on a short screen, below: under its opener and the pill, above both corners, scrolling in the room between; a press at its opener reaches it', { timeout: 600_000 }, async () => {
	for (const run of [
		{ viewport: { width: 375, height: 360 }, opener: 'launcher', at: 'below' },
		{ viewport: { width: 375, height: 360 }, opener: 'change', at: 'below' },
		{ viewport: { width: 375, height: 420 }, opener: 'launcher', at: 'below' },
	] as const)
		await shortScreen(run)
})

test('the composer on phones in landscape, en and ar: beside its opener where the column fits, at least H_MIN by W_MIN, covering nothing; a template pressed in it opens its view', { timeout: 900_000 }, async () => {
	for (const viewport of [{ width: 812, height: 375 }, { width: 667, height: 375 }, { width: 844, height: 390 }]) {
		for (const lang of ['en', 'ar'] as const) {
			// At 667 in English from "Change" too: its column ends 8 px before "Change", the pill above it in its way (lead, 2026-11-17).
			for (const opener of ['launcher', 'change'] as const) await shortScreen({ viewport, lang, opener, at: 'beside' })
		}
	}
	// Something pocketed: the Pocket's button in the bottom-left corner, its zone cut off the column's inline start in
	// English (the column keeps its height).
	for (const opener of ['launcher', 'change'] as const) await shortScreen({ viewport: { width: 812, height: 375 }, opener, at: 'beside', pocketed: true })
})

test('the composer on a short laptop screen, en and ar: beside its opener, at least H_MIN by W_MIN, covering nothing; a template pressed in it opens its view', { timeout: 900_000 }, async () => {
	for (const viewport of [{ width: 1366, height: 380 }, { width: 1366, height: 450 }]) {
		for (const lang of ['en', 'ar'] as const) {
			for (const opener of ['launcher', 'change'] as const) await shortScreen({ viewport, lang, opener, at: 'beside' })
		}
	}
})

test('Original from the bar or the end band closes a composer opened from "Change experience"; the launcher shows, a press reaches it, and opens it again', { timeout: 300_000 }, async () => {
	for (const [p, viewport] of [['/en/services', DESKTOP], ['/ar/services', PHONE]] as const) {
		const where = `${p} ${sizeOf(viewport)}`
		const l = await launchLayer(gw, { viewport, reducedMotion: true, ...LIVE })
		try {
			const seen = watch(l.page)
			await open(l.page, p, '?aixc-debug')
			await ready(l.page)
			await choose(l.page, 'magazine')
			for (const from of ['the bar', 'the end band']) {
				if ((await state(l.page))?.view !== 'reimagined') {
					await openComposer(l.page)
					await l.page.locator('#aixc-composer .aixc-seg[data-view="reimagined"]').click()
					await l.page.waitForFunction(() => (window as any).__aixc.demos.reimagine.state.view === 'reimagined', null, { timeout: 5_000 })
					await settle(l.page, 400)
				}
				await l.page.locator('.aixc-viewbar .aixc-text-btn[aria-controls="aixc-composer"]').click()
				await l.page.waitForSelector('#aixc-composer:not([hidden])')
				await settle(l.page)
				if (from === 'the bar') await pressIn(l.page, '.aixc-viewbar .aixc-seg[data-view="original"]')
				else {
					const END_ORIGINAL = '.aixc-end .aixc-end__btn:not(.aixc-end__btn--primary)'
					await l.page.evaluate(() => {
						const box = document.querySelector('.aixc-box')!
						box.scrollTop = box.scrollHeight
					})
					await settle(l.page, 300)
					// The composer is a panel over the view and may cover the end band at the box's end (on a phone, with ten
					// templates, it reaches past Original): the reader scrolls the box back until Original shows under it, the
					// composer staying open, then presses it. (At 375x812 the 10 px between the composer and the right corner's
					// zone cannot hold the 44 px button: scrolled back, its right end goes under the guide's microphone; its centre is
					// clear, which pressIn checks.)
					await l.page.evaluate((selector) => {
						const box = document.querySelector('.aixc-box')!
						const c = document.getElementById('aixc-composer')!.getBoundingClientRect()
						const b = document.querySelector(selector)!.getBoundingClientRect()
						if (b.left < c.right && c.left < b.right && b.top < c.bottom && c.top < b.bottom) box.scrollTop -= Math.ceil(c.bottom + 8 - b.top)
					}, END_ORIGINAL)
					await settle(l.page, 300)
					const shows = await l.page.evaluate((selector) => {
						const box = document.querySelector<HTMLElement>('.aixc-box')!
						const area = box.getBoundingClientRect()
						const c = document.getElementById('aixc-composer')!
						const cr = c.getBoundingClientRect()
						const b = document.querySelector(selector)!.getBoundingClientRect()
						const r = (x: DOMRect) => [x.left, x.top, x.right, x.bottom].map(Math.round)
						return {
							composerOpen: !c.hidden && (window as any).__aixc.demos.reimagine.state.composerOpen === true,
							clear: !(b.left < cr.right && cr.left < b.right && b.top < cr.bottom && cr.top < b.bottom),
							inBox: b.top >= area.top + box.clientTop && b.bottom <= Math.min(area.top + box.clientTop + box.clientHeight, innerHeight),
							rects: `composer ${r(cr)}, Original ${r(b)}, box ${r(area)}`,
						}
					}, END_ORIGINAL)
					assert.ok(shows.composerOpen && shows.clear && shows.inBox, `${where}: the end band's Original shows in the box clear of the open composer (${shows.rects})`)
					await pressIn(l.page, END_ORIGINAL)
				}
				await l.page.waitForFunction(() => (window as any).__aixc.demos.reimagine.state.view === 'original', null, { timeout: 5_000 })
				await settle(l.page, 400)
				const after = await l.page.evaluate(() => {
					const launcher = document.querySelector<HTMLElement>('.aixc-launcher')!
					const r = launcher.getBoundingClientRect()
					const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
					return {
						composerOpen: (window as any).__aixc.demos.reimagine.state.composerOpen,
						composerHidden: document.getElementById('aixc-composer')!.hidden,
						change: document.querySelector('.aixc-viewbar .aixc-text-btn[aria-controls="aixc-composer"]')!.getAttribute('aria-expanded'),
						launcher: !launcher.hidden,
						reaches: !!hit && (hit === launcher || launcher.contains(hit)),
						focus: document.activeElement === launcher,
					}
				})
				assert.deepEqual(after, { composerOpen: false, composerHidden: true, change: 'false', launcher: true, reaches: true, focus: true }, `${where}: Original from ${from} closes the composer; the launcher shows, a press reaches it and the focus is on it`)
				// The launcher's press opens it again (with the segment).
				await openComposer(l.page)
				assert.equal((await state(l.page))?.composerOpen, true, `${where}: the launcher opens the composer after Original from ${from}`)
				await l.page.keyboard.press('Escape')
				await l.page.waitForSelector('#aixc-composer', { state: 'hidden' })
			}
			assert.deepEqual(seen.pageErrors.filter((e) => !/navUserToggling|navToggling/.test(e)), [], `${where}: no page errors`)
		} finally {
			await l.close()
		}
	}
})

test('the composer never sits in Vodafone\'s header band: its opener gone, no pill, the header in the flow at the top of the page', { timeout: 300_000 }, async () => {
	for (const [p, viewport] of [['/en/services', DESKTOP], ['/ar/services', PHONE]] as const) {
		const where = `${p} ${sizeOf(viewport)}`
		const l = await launchLayer(gw, { viewport, reducedMotion: true, ...LIVE })
		try {
			const seen = watch(l.page)
			await open(l.page, p, '?aixc-debug')
			await ready(l.page)
			// Its opener goes while it is open (the shell's own hold here, as the trail's card or a reading that fails the
			// gate hides the launcher), without the trail's pill ("Not now"), at the top of the page, where Vodafone's header is
			// in the flow and host.chromeBottom() counts nothing: the composer stays under the header's bottom.
			await openComposer(l.page)
			const band = await l.page.evaluate(async () => {
				const pill = document.querySelector('vg-guide')?.shadowRoot?.querySelector<HTMLElement>('.tr-pill')
				if (pill) pill.hidden = true
				;(window as any).__aixc.demos.reimagine.launcher.hold('test', true)
				dispatchEvent(new Event('resize'))
				await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(done, 60))))
				const c = document.getElementById('aixc-composer')!.getBoundingClientRect()
				return { open: !document.getElementById('aixc-composer')!.hidden, launcher: !document.querySelector<HTMLElement>('.aixc-launcher')!.hidden, top: c.top, chrome: (window as any).__aixc.host.chromeBottom() as number, scrollY }
			})
			const header = await headerBottomOf(l.page)
			assert.deepEqual([band.open, band.launcher, band.chrome, band.scrollY], [true, false, 0, 0], `${where}: the composer open, its launcher held, the page at its top with the header in the flow`)
			assert.ok(header > 40, `${where}: Vodafone's header meets the top of the screen (${header})`)
			assert.ok(band.top >= header + 8 - 1, `${where}: the composer's top ${band.top} under the header's bottom ${header}, not in its band`)
			assert.deepEqual(seen.pageErrors.filter((e) => !/navUserToggling|navToggling/.test(e)), [], `${where}: no page errors`)
		} finally {
			await l.close()
		}
	}
})

/* ----------------------------------------------------------- choices still loading, quick presses, a new size */

test('a template still loading is dropped when the reader opens the album: after the album the page is Original, the launcher back, nothing mounted, nothing stuck', { timeout: 300_000 }, async () => {
	// On Original, the composer open from the launcher, magazine pressed, the Pocket's button pressed while it loads.
	{
		const where = '/en/services desktop, the album opened while magazine loads'
		const l = await launchLayer(gw, { viewport: DESKTOP, reducedMotion: true, ...LIVE })
		try {
			const seen = watch(l.page)
			await open(l.page, '/en/services', '?aixc-debug')
			await ready(l.page)
			const served = await mainNow(l.page)
			await pocketOne(l.page)
			await openComposer(l.page)
			const held = await holdChunk(l.page, 'src/host/demos/reimagine/magazine.js')
			await l.page.locator('.aixc-template[data-template="magazine"]').click()
			await held.requested
			await pressIn(l.page, '.pocket-peek')
			await l.page.waitForFunction(() => (window as any).__aixc.demos.pocket.state.view === 'pocket' && !(window as any).__aixc.demos.pocket.state.busy, null, { timeout: 10_000 })
			const closedByAlbum = (await state(l.page))?.composerOpen === false
			// The chunk arrives while the album shows.
			held.release()
			await settle(l.page, 800)
			const under = await viewNow(l.page)
			assert.deepEqual([under.view, under.boxHidden, under.mounted], ['original', true, false], `${where}: nothing opens under the album (${JSON.stringify(under)})`)
			await l.page.evaluate(() => (window as any).__aixc.demos.pocket.close())
			await l.page.waitForFunction(() => (window as any).__aixc.demos.pocket.state.view === 'page' && !(window as any).__aixc.demos.pocket.state.busy, null, { timeout: 10_000 })
			await settle(l.page, 400)
			const { body, ...after } = await viewNow(l.page)
			assert.notEqual(body, 'reimagined', `${where}: no body[data-aixc-view='reimagined'] after the album`)
			assert.deepEqual(after, { view: 'original', boxHidden: true, composerOpen: false, composerHidden: true, launcher: true, mounted: false, template: null, spotlight: false }, `${where}: after the album the page is Original, the launcher back, nothing mounted`)
			const main = await mainNow(l.page)
			assert.deepEqual([main.style, main.inert, main.hidden], [served.style, served.inert, served.hidden], `${where}: #main-content as served`)
			assert.ok(closedByAlbum, `${where}: the album closed the composer as it opened`)
			// Nothing stuck: the launcher's composer opens a view.
			await choose(l.page, 'magazine')
			assert.equal((await viewNow(l.page)).boxHidden, false, `${where}: a view opens after`)
			assert.deepEqual(seen.pageErrors.filter((e) => !/navUserToggling|navToggling/.test(e)), [], `${where}: no page errors`)
		} finally {
			await l.close()
		}
	}
})

test('a template still loading is dropped when the reader presses Original: the page stays Original, the launcher back, nothing mounted, nothing stuck', { timeout: 300_000 }, async () => {
	// A view shows, "Change experience", spotlight pressed, the bar's Original pressed while it loads.
	{
		const where = '/ar/services desktop, Original pressed while spotlight loads'
		const l = await launchLayer(gw, { viewport: DESKTOP, reducedMotion: true, ...LIVE })
		try {
			const seen = watch(l.page)
			await open(l.page, '/ar/services', '?aixc-debug')
			await ready(l.page)
			const served = await mainNow(l.page)
			await choose(l.page, 'magazine')
			await l.page.locator('.aixc-viewbar .aixc-text-btn[aria-controls="aixc-composer"]').click()
			await l.page.waitForSelector('#aixc-composer:not([hidden])')
			await settle(l.page)
			const held = await holdChunk(l.page, 'src/host/demos/reimagine/spotlight.js')
			await l.page.locator('.aixc-template[data-template="spotlight"]').click()
			await held.requested
			await pressIn(l.page, '.aixc-viewbar .aixc-seg[data-view="original"]')
			await l.page.waitForFunction(() => (window as any).__aixc.demos.reimagine.state.view === 'original', null, { timeout: 5_000 })
			held.release()
			await settle(l.page, 800)
			const after = await viewNow(l.page)
			assert.deepEqual(after, { view: 'original', body: 'original', boxHidden: true, composerOpen: false, composerHidden: true, launcher: true, mounted: false, template: 'magazine', spotlight: false }, `${where}: the page stays Original with magazine kept, the launcher back, nothing mounted`)
			const main = await mainNow(l.page)
			assert.deepEqual([main.style, main.inert, main.hidden], [served.style, served.inert, served.hidden], `${where}: #main-content as served`)
			// Nothing stuck: Reimagined brings magazine back.
			await openComposer(l.page)
			await l.page.locator('#aixc-composer .aixc-seg[data-view="reimagined"]').click()
			await l.page.waitForFunction(() => (window as any).__aixc.demos.reimagine.state.view === 'reimagined', null, { timeout: 5_000 })
			await settle(l.page, 400)
			const back = await viewNow(l.page)
			assert.deepEqual([back.boxHidden, back.mounted, back.template, back.spotlight], [false, true, 'magazine', false], `${where}: Reimagined shows magazine again`)
			assert.deepEqual(seen.pageErrors.filter((e) => !/navUserToggling|navToggling/.test(e)), [], `${where}: no page errors`)
		} finally {
			await l.close()
		}
	}
})

test('a template still loading is kept when one of Vodafone\'s menus closes the composer: its view opens when its chunk arrives; Escape drops one', { timeout: 300_000 }, async () => {
	// On Original, the composer open from the launcher, spotlight pressed, one of Vodafone's menus opened and closed
	// while it loads (the user menu on desktop, the phone menu as Vodafone's script opens it).
	for (const [p, viewport] of [['/en/services', DESKTOP], ['/ar/services', PHONE]] as const) {
		const where = `${p} ${sizeOf(viewport)}`
		const l = await launchLayer(gw, { viewport, reducedMotion: true, ...LIVE })
		try {
			const seen = watch(l.page)
			await open(l.page, p, '?aixc-debug')
			await ready(l.page)
			await openComposer(l.page)
			const held = await holdChunk(l.page, 'src/host/demos/reimagine/spotlight.js')
			await l.page.locator('.aixc-template[data-template="spotlight"]').click()
			await held.requested
			if (viewport === DESKTOP) await l.page.locator('#avatar').click()
			else await l.page.evaluate(() => document.querySelector('.nav-header')!.classList.add('nav-opened'))
			await l.page.waitForFunction(() => !(window as any).__aixc.demos.reimagine.state.composerOpen, null, { timeout: 5_000 }).catch(() => assert.fail(`${where}: the composer did not close when Vodafone's menu opened`))
			if (viewport === DESKTOP) await l.page.locator('#avatar').click()
			else await l.page.evaluate(() => document.querySelector('.nav-header')!.classList.remove('nav-opened'))
			await settle(l.page, 350)
			assert.equal((await viewNow(l.page)).view, 'original', `${where}: still Original while spotlight loads`)
			held.release()
			await l.page
				.waitForFunction(() => (window as any).__aixc.demos.reimagine.state.view === 'reimagined' && !!document.querySelector('.aixc-box:not([hidden]) .sp-stage'), null, { timeout: 15_000 })
				.catch(() => assert.fail(`${where}: the spotlight view did not open when its chunk arrived after the menu closed the composer`))
			await settle(l.page, 400)
			const after = await viewNow(l.page)
			assert.deepEqual([after.view, after.body, after.boxHidden, after.composerOpen, after.composerHidden, after.mounted, after.template, after.spotlight], ['reimagined', 'reimagined', false, false, true, true, 'spotlight', true], `${where}: the spotlight view opens when its chunk arrives (${JSON.stringify(after)})`)

			// The reader's own close drops one: "Change experience", magazine pressed, Escape while it loads.
			await l.page.locator('.aixc-viewbar .aixc-text-btn[aria-controls="aixc-composer"]').click()
			await l.page.waitForSelector('#aixc-composer:not([hidden])')
			await settle(l.page)
			const held2 = await holdChunk(l.page, 'src/host/demos/reimagine/magazine.js')
			await l.page.locator('.aixc-template[data-template="magazine"]').click()
			await held2.requested
			await l.page.keyboard.press('Escape')
			await l.page.waitForSelector('#aixc-composer', { state: 'hidden' })
			held2.release()
			await settle(l.page, 800)
			const kept = await viewNow(l.page)
			assert.deepEqual([kept.view, kept.body, kept.boxHidden, kept.composerOpen, kept.composerHidden, kept.mounted, kept.template, kept.spotlight], ['reimagined', 'reimagined', false, false, true, true, 'spotlight', true], `${where}: after Escape, magazine is dropped and spotlight stays (${JSON.stringify(kept)})`)
			assert.deepEqual(seen.pageErrors.filter((e) => !/navUserToggling|navToggling/.test(e)), [], `${where}: no page errors`)
		} finally {
			await l.close()
		}
	}
})

test('two quick presses on the launcher while the shell\'s chunk loads: the composer opens and stays open; the launcher is busy meanwhile', { timeout: 120_000 }, async () => {
	const where = '/en/services desktop'
	const l = await launchLayer(gw, { viewport: DESKTOP, reducedMotion: true, ...LIVE })
	try {
		const seen = watch(l.page)
		await open(l.page, '/en/services', '?aixc-debug')
		await ready(l.page)
		const held = await holdChunk(l.page, 'src/host/demos/reimagine/shell.js')
		await l.page.locator('.aixc-launcher').click()
		await held.requested
		await l.page.locator('.aixc-launcher').click()
		const busy = await l.page.evaluate(() => document.querySelector('.aixc-launcher')!.getAttribute('aria-busy'))
		held.release()
		await l.page.waitForFunction(() => !!(window as any).__aixc.demos.reimagine.state, null, { timeout: 10_000 })
		await settle(l.page, 300)
		const after = await l.page.evaluate(() => {
			const launcher = document.querySelector('.aixc-launcher')!
			return { open: (window as any).__aixc.demos.reimagine.state.composerOpen, hidden: document.getElementById('aixc-composer')!.hidden, expanded: launcher.getAttribute('aria-expanded'), busy: launcher.getAttribute('aria-busy'), focus: !!document.activeElement?.classList.contains('aixc-template') }
		})
		assert.deepEqual(after, { open: true, hidden: false, expanded: 'true', busy: null, focus: true }, `${where}: two presses during the load open the composer once`)
		assert.equal(busy, 'true', `${where}: the launcher is busy while the shell's chunk loads`)
		// The next press closes it, as before.
		await l.page.locator('.aixc-launcher').click()
		await l.page.waitForSelector('#aixc-composer', { state: 'hidden' })
		assert.deepEqual(seen.pageErrors.filter((e) => !/navUserToggling|navToggling/.test(e)), [], `${where}: no page errors`)
	} finally {
		await l.close()
	}
})

test('a resize across Vodafone\'s phone and desktop header, the window not scrolled since the open: the box rests under the new header, its bottom at the screen\'s', { timeout: 300_000 }, async () => {
	const NARROW = { width: 820, height: 900 }
	for (const fixedHeader of ['scroll', true] as const) {
		const where = `/en/services fixedHeader ${fixedHeader}`
		const l = await launchLayer(gw, { viewport: DESKTOP, reducedMotion: true, ...LIVE, fixedHeader })
		try {
			await open(l.page, '/en/services', '?aixc-debug')
			await ready(l.page)
			await choose(l.page, 'magazine')
			const opened = await boxNow(l.page)
			assert.ok(Math.abs(opened.bottom - opened.inner) <= 1, `${where} ${sizeOf(DESKTOP)}: the box's bottom ${opened.bottom} is the screen's ${opened.inner} after the open`)
			const headers: number[] = [opened.header]
			for (const viewport of [NARROW, DESKTOP]) {
				await l.page.setViewportSize(viewport)
				await settle(l.page, 600)
				const b = await boxNow(l.page)
				headers.push(b.header)
				assert.ok(Math.abs(b.scrollY - opened.scrollY) <= 0.5, `${where} ${sizeOf(viewport)}: the window not scrolled (${opened.scrollY} -> ${b.scrollY})`)
				assert.ok(Math.abs(b.bottom - b.inner) <= 1, `${where} ${sizeOf(viewport)}: the box's bottom ${b.bottom} is the screen's ${b.inner}`)
				assert.ok(b.top >= b.header - 1, `${where} ${sizeOf(viewport)}: the box's top ${b.top} is not under the header (${b.header})`)
				assert.ok(Math.abs(b.top - b.header) <= 1 || b.scrollY === 0, `${where} ${sizeOf(viewport)}: the box's top ${b.top} meets the header's bottom ${b.header}, or the page is at its top`)
			}
			assert.ok(Math.abs(headers[1] - headers[0]) > 10, `${where}: the resize changed the header's height (${headers.map(Math.round).join(' -> ')})`)
		} finally {
			await l.close()
		}
	}
})

/* ------------------------------------------------------------------------------------------- spotlight */

/** Spotlight's stage in the box, its controls and its queue. */
const stageNow = (page: Page) =>
	page.evaluate(() => {
		const box = document.querySelector<HTMLElement>('.aixc-box')!
		const b = box.getBoundingClientRect()
		const stage = box.querySelector<HTMLElement>('.sp-stage')!.getBoundingClientRect()
		const r = (sel: string) => {
			const n = box.querySelector<HTMLElement>(sel)
			if (!n || !n.getClientRects().length || getComputedStyle(n).display === 'none') return null
			const x = n.getBoundingClientRect()
			return { left: x.left, top: x.top, right: x.right, bottom: x.bottom }
		}
		const slide = box.querySelector<HTMLElement>('.sp-slide:not([hidden])')!
		return {
			top: stage.top - (b.top + box.clientTop),
			bottomGap: b.top + box.clientTop + box.clientHeight - stage.bottom,
			height: stage.height,
			room: box.clientHeight,
			barH: (box.firstElementChild as HTMLElement).offsetHeight,
			counter: box.querySelector('.sp-counter__now')!.textContent,
			controls: r('.sp-controls'),
			queue: r('.sp-queue'),
			title: r('.sp-slide:not([hidden]) .sp-slide__title'),
			parts: [...slide.children].map((c) => {
				const x = c.getBoundingClientRect()
				return { what: c.className, box: { left: x.left, top: x.top, right: x.right, bottom: x.bottom } }
			}),
			prev: box.querySelector('.sp-controls .vx-round')!.getAttribute('aria-label'),
		}
	})

async function stepTo(page: Page, n: number, where: string) {
	for (let i = 0; i < 12; i++) {
		const now = Number((await stageNow(page)).counter)
		if (now === n) return
		await pressIn(page, `.aixc-box .sp-controls .vx-round:nth-of-type(${now < n ? 2 : 1})`)
		await page.waitForFunction((was) => document.querySelector('.aixc-box .sp-counter__now')!.textContent !== was, String(now).padStart(2, '0'), { timeout: 3_000 }).catch(() => {})
		await settle(page, 250)
	}
	assert.equal(Number((await stageNow(page)).counter), n, `${where}: stepped to card ${n}`)
}

/** The microphone, stood in at the edge (as floating-controls-live does): pressing the guide's mic reaches 'listening'. */
const MIC_STAND_IN = `(() => {
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

/**
 * The one case let through, recorded for the lead (ADR-0076; spotlight.css is stage 1's file): on /ar/services at
 * 1024x768 with the guide listening and the box at its top, the stage (605 px) is taller than the room under the bar
 * (587 px) and has not pinned yet, and its CTA 'اعرف اكتر' reaches 17 px into the right zone. Pinned, nothing does.
 */
const GAP_CASE = '/ar/services 1024x768 listening'
/** Its name as pressablesInZones reads it: the label and the start of "(opens in a new tab)"; where it was recorded. */
const GAP_CTA = 'اعرف اكتر (تفتح في نافذة جديدة'
const GAP_RECT = [852, 508, 983, 554]

test('the guide listening at 1024 and 375: nothing pressable of spotlight\'s stage, the bar or the composer in a corner\'s zone', { timeout: 600_000 }, async () => {
	const gaps: string[] = []
	for (const viewport of [TABLET, PHONE])
		for (const p of ['/en/services', '/ar/services']) {
			const where = `${p} ${sizeOf(viewport)} listening`
			const l = await launchLayer(gw, { viewport, reducedMotion: true, ...LIVE, initScripts: [MIC_STAND_IN] })
			try {
				await open(l.page, p, '?aixc-debug')
				await ready(l.page)
				// Something pocketed: the Pocket's button shows in the bottom-left corner, so both corners have a zone.
				await pocketOne(l.page)
				await choose(l.page, 'spotlight')
				const quiet = await zonesNow(l.page)
				const mic = await l.page.evaluate(() => {
					const r = document.querySelector('vg-guide')!.shadowRoot!.querySelector('.vg-mic')!.getBoundingClientRect()
					return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
				})
				await l.page.mouse.click(mic.x, mic.y)
				await l.page.waitForFunction(() => {
					const r = document.querySelector('vg-guide')!.shadowRoot!
					return !r.querySelector('.vg-bar')!.classList.contains('hidden') && r.querySelector('.vg-kbd')!.classList.contains('show')
				}, null, { timeout: 10_000 })
				await settle(l.page, 600)
				const zones = await zonesNow(l.page)
				assert.ok(zones.right && quiet.right && zones.right.left < quiet.right.left - 100, `${where}: the transcript bar widens the right zone ${fmt(quiet.right)} -> ${fmt(zones.right)}`)
				assert.ok(zones.left, `${where}: the Pocket's button's zone measured (${fmt(zones.left)})`)
				for (const at of ['top', 'pinned']) {
					if (at === 'pinned')
						await l.page.evaluate(() => {
							const box = document.querySelector('.aixc-box')!
							box.scrollTop += box.querySelector('.sp-track')!.getBoundingClientRect().top - box.getBoundingClientRect().top - (box.firstElementChild as HTMLElement).offsetHeight + 1 + 3 * 200
						})
					await settle(l.page, 500)
					const hits = await pressablesInZones(l.page, '.aixc-box :is(.sp-stage, .aixc-viewbar)', zones)
					const s = await stageNow(l.page)
					assert.ok(hits.seen >= 3, `${where} ${at}: read (${hits.seen})`)
					// The recorded gap (GAP_CASE), and only it, only at the box's top and only with that CTA in the right zone.
					if (where === GAP_CASE && at === 'top') {
						const room = s.room - s.barH
						console.log(`[gap] ${where} ${at}: a stage ${Math.round(s.height)} px tall in a room of ${room}: ${JSON.stringify(hits.out)}`)
						assert.ok(s.height > room + 1, `${where} ${at}: the recorded gap is a stage taller than the room under the bar (${s.height} vs ${room})`)
						assert.ok(hits.out.length > 0 && hits.out.every((x) => x.what === GAP_CTA && x.zone === 'right' && x.rect.every((n, i) => Math.abs(n - GAP_RECT[i]) <= 4)), `${where} ${at}: only the recorded CTA in the right zone, where it was recorded ${fmt({ left: GAP_RECT[0], top: GAP_RECT[1], right: GAP_RECT[2], bottom: GAP_RECT[3] })} (${JSON.stringify(hits.out)})`)
						gaps.push(`${where} ${at}`)
						continue
					}
					assert.deepEqual(hits.out, [], `${where} ${at}: nothing pressable in a corner's zone`)
				}
				await l.page.locator('.aixc-viewbar .aixc-text-btn[aria-controls="aixc-composer"]').click()
				await l.page.waitForSelector('#aixc-composer:not([hidden])')
				await settle(l.page, 200)
				const c = await l.page.evaluate(() => {
					const r = document.getElementById('aixc-composer')!.getBoundingClientRect()
					return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }
				})
				for (const [name, z] of Object.entries(zones)) if (z) assert.ok(!meets(c, z), `${where}: the composer ${fmt(c)} clear of the ${name} zone ${fmt(z)}`)
			} finally {
				await l.close()
			}
		}
	assert.deepEqual(gaps, [`${GAP_CASE} top`], 'exactly one [gap], the recorded one')
})

/* ------------------------------------------------------------------------- the trail, icons, failures */

/**
 * The trail's host API held back until the test lets it go (window.__releaseTrail), and every cover set on it recorded:
 * the view opens first, then the trail (and with it the Pocket's journey) arrives, as for a visitor whose trail starts late.
 */
const LATE_TRAIL = `(() => {
	window.__covers = []
	let released = false
	let api = null
	const wrap = (a) => {
		if (!a || a.__coverTracked || typeof a.setCover !== 'function') return
		const set = a.setCover
		a.__coverTracked = true
		a.setCover = function (c) { window.__covers.push(c); return set.call(this, c) }
	}
	addEventListener('vg:trail-ready', (e) => {
		if (released) return
		api = e.detail
		wrap(api)
		e.stopImmediatePropagation()
	}, true)
	let guide
	Object.defineProperty(window, 'voiceGuide', { configurable: true, enumerable: true, get: () => guide, set(g) {
		guide = g
		if (!g || typeof g !== 'object') return
		let host = g.trailHost
		Object.defineProperty(g, 'trailHost', { configurable: true, enumerable: true, get: () => (released ? host : undefined), set(a) { host = a; api = a } })
	} })
	window.__releaseTrail = () => {
		released = true
		const a = api || (guide && Object.getOwnPropertyDescriptor(guide, 'trailHost')?.get?.())
		wrap(a)
		dispatchEvent(new CustomEvent('vg:trail-ready', { detail: a }))
		return !!a
	}
})()`

test('the trail\'s cover: #main-content as it shows, set before the view hides it and kept by a journey that starts later', { timeout: 300_000 }, async () => {
	for (const p of ['/en/services', '/ar/home']) {
		const where = `${p} desktop`
		const l = await launchLayer(gw, { viewport: DESKTOP, reducedMotion: true, ...LIVE, initScripts: [LATE_TRAIL] })
		try {
			await open(l.page, p, '?aixc-debug')
			await ready(l.page)
			const served = await mainNow(l.page)
			await choose(l.page, 'magazine')
			assert.equal(await l.page.evaluate(() => (window as any).__aixc.demos.pocket.journey()), null, `${where}: no journey yet`)
			assert.ok(await l.page.evaluate(() => (window as any).__releaseTrail()), `${where}: the trail's host API arrives`)
			await l.page.waitForFunction(() => !!(window as any).__aixc.demos.pocket.journey(), null, { timeout: 15_000 })
			await settle(l.page, 300)
			const covers = await l.page.evaluate(() => {
				const list = (window as any).__covers.filter(Boolean)
				const last = list.at(-1)
				return { count: list.length, same: new Set(list).size, node: last?.node === document.getElementById('main-content'), covered: last?.covered(), shown: last?.shown() }
			})
			assert.ok(covers.count >= 2, `${where}: the shell and the journey set the cover (${covers.count})`)
			assert.equal(covers.same, 1, `${where}: one cover: the journey kept the shell's`)
			assert.deepEqual([covers.node, covers.covered], [true, true], `${where}: #main-content, covered by the view`)
			assert.deepEqual(covers.shown, { style: served.style, inert: served.inert, hidden: served.hidden }, `${where}: recorded as it shows`)
		} finally {
			await l.close()
		}
	}
})

test('the icons a page lacks are ours, prefixed, in one marked holder; a page that has them gets none', { timeout: 300_000 }, async () => {
	for (const lacks of [false, true]) {
		const where = `/en/services${lacks ? ' without Vodafone\'s white logo symbol' : ''}`
		const l = await launchLayer(gw, { viewport: DESKTOP, reducedMotion: true, ...LIVE })
		try {
			await open(l.page, '/en/services', '?aixc-debug')
			await ready(l.page)
			if (lacks) await l.page.evaluate(() => document.querySelectorAll('symbol#icon-vodafone-logo-white').forEach((s) => s.remove()))
			await choose(l.page, 'magazine')
			// A picture that fails draws the fallback mark.
			await l.page.evaluate(() => document.querySelector('.aixc-box .mag-frame img')?.dispatchEvent(new Event('error')))
			const icons = await l.page.evaluate(() => {
				const ours = document.getElementById('aixc-icon-vodafone-logo-white')
				const uses = [...document.querySelectorAll('.aixc-box use')].map((u) => u.getAttribute('href') ?? '')
				const ids = [...document.querySelectorAll('[data-aixc] [id], [data-aixc][id]')].map((n) => n.id)
				const twice = ids.filter((id) => document.querySelectorAll(`[id="${CSS.escape(id)}"]`).length > 1)
				return { ours: !!ours, holder: ours ? !!ours.closest('svg[data-aixc][data-vg]') && ours.closest('svg')!.parentElement === document.body : null, uses, broken: uses.filter((h) => !document.getElementById(h.slice(1))), twice }
			})
			assert.equal(icons.ours, lacks, `${where}: our symbol only where the page lacks it`)
			if (lacks) assert.equal(icons.holder, true, `${where}: in one marked holder on body`)
			assert.ok(icons.uses.length > 0, `${where}: the view draws an icon (${JSON.stringify(icons.uses)})`)
			assert.deepEqual(icons.broken, [], `${where}: every icon's symbol is on the page`)
			assert.deepEqual(icons.twice, [], `${where}: no id of ours twice`)
		} finally {
			await l.close()
		}
	}
})

test('a forced failure at the open or the render, and the guard\'s stop over a view: the page as served, nothing of ours left listening', { timeout: 600_000 }, async () => {
	for (const failAt of ['reimagine-open', 'reimagine-render', 'stop']) {
		const where = failAt
		const l = await launchLayer(gw, { viewport: DESKTOP, reducedMotion: true, ...LIVE, initScripts: [TRACK(ours), ...(failAt === 'stop' ? [] : [`window.__AIXC_TEST__ = { failAt: ${JSON.stringify(failAt)} }`])] })
		try {
			const seen = watch(l.page)
			await open(l.page, '/en/services', '?aixc=off')
			const without = await geometry(l.page)
			await open(l.page, '/en/services', '?aixc-debug')
			await ready(l.page)
			const served = await mainNow(l.page)
			if (failAt === 'reimagine-open') await l.page.locator('.aixc-launcher').click()
			else if (failAt === 'reimagine-render') {
				await openComposer(l.page)
				await l.page.locator('.aixc-template[data-template="magazine"]').click()
			} else {
				await choose(l.page, 'spotlight')
				assert.equal((await state(l.page))?.view, 'reimagined', `${where}: the view shows`)
				await l.page.evaluate(() => (window as any).__aixc.guard.stop())
			}
			await l.page.waitForFunction(() => ['failed', 'stopped'].includes((window as any).__aixc.state), null, { timeout: 10_000 })
			await settle(l.page, 400)
			const s = await layerState(l.page)
			assert.equal(s.added, 0, `${where}: nothing of the layer is left`)
			assert.equal(s.tags, 0, `${where}: no marks left`)
			const main = await mainNow(l.page)
			assert.deepEqual([main.style, main.inert, main.hidden], [served.style, served.inert, served.hidden], `${where}: #main-content as served`)
			assert.equal(await l.page.evaluate(() => document.body.dataset.aixcView ?? null), null, `${where}: no body[data-aixc-view]`)
			await l.page.evaluate(() => scrollTo(0, 0))
			await settle(l.page, 200)
			assert.deepEqual(await geometry(l.page), without, `${where}: the page as without the layer`)
			assert.deepEqual(await leftovers(l.page), { listeners: [], mo: 0, ro: 0, frames: 0 }, `${where}: no listener on the window or the document, no observer, no frame of ours`)
			if (failAt !== 'stop') assert.ok(seen.layer.some((x) => x.startsWith('error: [AIXC]')), `${where}: the layer said so (${seen.layer.join(' | ')})`)
			assert.deepEqual(seen.pageErrors.filter((e) => !/navUserToggling|navToggling/.test(e)), [], `${where}: no error reached the page`)
		} finally {
			await l.close()
		}
	}
})
