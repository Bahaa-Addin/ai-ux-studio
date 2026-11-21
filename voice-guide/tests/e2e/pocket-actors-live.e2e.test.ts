/**
 * The Pocket's mascot and drone on Vodafone's own pages (live plan phase 3, S12; ADR-0064), on the saved
 * pages with the live-page kit (./vodafone-layer.ts): the accessibility widget stood in, in its real shape
 * and place, and the real Voice Guide (its microphone, keyboard button and transcript bar are its own).
 *
 * - Loading and hygiene: nothing of the actors before their chunk; after the first press they come, every
 *   node they add is marked data-aixc and data-vg (inside the mascot's and the drone's rig SVGs only the
 *   root svg is: their parts are artwork the actors redraw every frame), their ready flag is on
 *   #pocket-output and never on Vodafone's body, and their stylesheet is one marked style.
 * - The peek: the mascot hides behind the Pocket button at the bottom-left; his mittens hold its rim while
 *   a sticker lands; the button stays pressable and clear of the accessibility button and the mic.
 * - The ride (motion on): English, from the button across the screen to his place at the album's right
 *   content margin; Arabic (the album right-to-left), to the LEFT content margin, a short ride from the
 *   button or none at all. Closing, back to the button's corner and hidden. Reduced motion: no ride.
 * - Where he stands: on the content margin of the album's inline end, at least 16 px from the accessibility
 *   button, the mic and (while they show) the guide's keyboard button and transcript bar; the drone in the
 *   upper corner of the same side (none under 640 px); neither over the album's content at rest.
 * - The floor stays at the viewport's bottom and stops above Vodafone's footer at the end of the page.
 * - A failure in the actors drops only the actors: the layer and the Pocket carry on.
 * - Vodafone's accessibility button keeps its box and its styles in every state; the mascot never takes a press.
 * - With the trail on (the bar carries "Your journey", a sticker's group head under the title), at 1366×900
 *   and 1280×800 in both languages: the drone shows at the album's inline end, inside the viewport, clear
 *   of the trail's pill, "Empty pocket", the bar's buttons, the title, the group head, the stickers, the mic
 *   and Vodafone's button (F6, 2026-11-17).
 * - A fixed control that comes while the album shows (F6b, 2026-11-17): the trail's consent card opened from
 *   the pill over the drone's home (1366×900 in both languages, with reduced motion in English, and 1600×900
 *   where the far gutter is free): within 2 s the drone is off it, hidden or at rest elsewhere clear of
 *   everything, and within 2 s of the card closing it is back at its home (and, the card open before the
 *   album, the drone waits hidden and then hovers at its home, ready to play); the guide's keyboard button and
 *   transcript bar shown mid-album: within 2 s the mascot keeps 16 px from them, and is back on his margin
 *   within 2 s of them hiding.
 * - At rest (the album open, the pointer still) the actors are cheap: over 3 s, Chrome's LayoutCount grows
 *   by at most 6 and ScriptDuration by at most 0.1 s, while both still move: the drone shows, and each of
 *   its rotors shows exactly one flipbook page at a time, a page that changes (F11, 2026-11-17).
 * - What ends a rest changes nothing behind it (F11, 2026-11-17): keyboard focus leaving the cards while they
 *   rest, his eye is back on the cards' centre within 1 s and stays; a pointer move after a long rest turns
 *   him from where he was, never by more than a frame's turn at once; less motion asked for while they
 *   rest, none of the actors' own animations runs within 1 s.
 * - The trail's consent card opened while they rest (its button's own click, no pointer move), at 1366×900 and
 *   1600×900: the rest ends as for a relayout; within 2 s the drone is off its home (hidden, or elsewhere and
 *   clear), within 2 s of the card closing it is back at its home, and then the rest starts again, the drone
 *   with him, at most 6 layouts in 3 s (F11 with F6b, 2026-11-17).
 * - His board is painted at rest, in WebKit as in Chromium (1366×900, F11, 2026-11-17): in screenshots clipped
 *   to the board deck's box, the share of board-red pixels at rest is at least half the share out of rest (the
 *   pointer moved). Decided by pixels, not boxes: WebKit kept the deck's box in place at rest and painted no
 *   board there. WebKit runs through the same kit, from an installed Playwright WebKit build (findWebKit).
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { after, before, describe, test } from 'node:test'
import { pathToFileURL } from 'node:url'
import zlib from 'node:zlib'

import { chromium, type Page } from 'playwright'

import { DESKTOP, type LayerGateway, type LayerOptions, launchLayer, open, PHONE, startLayerGateway, watch } from './vodafone-layer.ts'

const PORT = 4479
const PAD = 16 // px the mascot keeps from Vodafone's and the guide's controls (ADR-0064)
let gw: LayerGateway

before(async () => {
	gw = await startLayerGateway(PORT)
})
after(async () => {
	await gw?.close()
})

/* eslint-disable @typescript-eslint/no-explicit-any */

const TABLET = { width: 1024, height: 768 }
type Viewport = { width: number; height: number }
type Box = { left: number; top: number; right: number; bottom: number }

/** Seeded randomness and no dozing while a test looks (pocket-actors.js reads it once at start-up). */
const ACTORS_TEST = `window.__POCKET_ACTORS_TEST__ = { seed: 7, timing: { sleepAt: 600000 } }`
/** Idle callbacks asked for once the Pocket is up are held back, so that only a press loads the actors. */
const HOLD_IDLE = `(() => {
	const idle = window.requestIdleCallback?.bind(window)
	if (!idle) return
	window.requestIdleCallback = (fn, o) => (window.__aixc?.demos?.pocket ? 0 : idle(fn, o))
})()`

/** The roots of everything the actors add to the page. */
const ROOTS = '.pocket-actor-peek, .pocket-actor-grip, .pocket-actor-layer, .pocket-actor-floor, .pocket-cursor, .pocket-light, .pocket-ripples'
/**
 * Album content the actors must not stand over at rest: the cards, "Nothing here yet", and what the bar,
 * the head and the group headings hold (their own boxes run the album's full width, empty past their text).
 */
const CONTENT = '.pocket-grid__item, .pocket-empty, .pocket-view__bar > *, .pocket-view__head > *, .pocket-group__head > *'

const settle = (page: Page, ms = 60) => page.evaluate((ms) => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(done, ms)))), ms)

const gap = (a: Box, b: Box) => Math.max(b.left - a.right, a.left - b.right, b.top - a.bottom, a.top - b.bottom)
const overlaps = (a: Box, b: Box) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
const fmt = (b: Box | null) => (b ? `[${[b.left, b.top, b.right, b.bottom].map((v) => Math.round(v)).join(',')}]` : 'none')

/* ------------------------------------------------------------------ WebKit through the kit, and pixels (F11) */

/**
 * A Playwright WebKit whose build is installed. voice-guide's own playwright-core (1.56.0) wants webkit-2215; this
 * machine's cache holds webkit-2248, which playwright-core 1.58.0 drives, and the Python Playwright ships that very
 * package (playwright/driver/package). Looked for: PLAYWRIGHT_WEBKIT_CORE (a playwright-core folder), voice-guide's
 * own, then the Python ones under ~/Library/Python; the first whose WebKit build is in the cache.
 */
async function findWebKit(): Promise<{ webkit: any; from: string } | { why: string }> {
	const cache = process.env.PLAYWRIGHT_BROWSERS_PATH || path.join(os.homedir(), 'Library/Caches/ms-playwright')
	const python = path.join(os.homedir(), 'Library/Python')
	const folders = [
		process.env.PLAYWRIGHT_WEBKIT_CORE,
		path.dirname(createRequire(import.meta.url).resolve('playwright-core/package.json')),
		...(fs.existsSync(python) ? fs.readdirSync(python).map((v) => path.join(python, v, 'lib/python/site-packages/playwright/driver/package')) : []),
	].filter((d): d is string => !!d && fs.existsSync(path.join(d, 'browsers.json')) && fs.existsSync(path.join(d, 'index.mjs')))
	const tried: string[] = []
	for (const dir of folders) {
		const { version } = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')) as { version: string }
		const wants = (JSON.parse(fs.readFileSync(path.join(dir, 'browsers.json'), 'utf8')) as { browsers: { name: string; revision: string }[] }).browsers.find((b) => b.name === 'webkit')
		if (wants && fs.existsSync(path.join(cache, `webkit-${wants.revision}`))) return { webkit: (await import(pathToFileURL(path.join(dir, 'index.mjs')).href)).webkit, from: `playwright-core ${version}, webkit-${wants.revision}` }
		tried.push(`playwright-core ${version} wants webkit-${wants?.revision}`)
	}
	return { why: `no WebKit build in ${cache} for ${tried.join('; ') || 'any playwright-core found'}` }
}

/**
 * launchLayer in WebKit: the kit's own launch, routes and stand-ins, with WebKit's launch in place of Chromium's for
 * this one call (without Chromium's flags). Offline as in Chromium: the routes answer every request from the replay or
 * refuse it; a proxy that leads nowhere catches anything they do not answer (Chromium's host-resolver rules are a flag
 * WebKit has not); no service workers (WebKit's do not go through the routes).
 */
async function launchLayerWebKit(webkit: any, gw: LayerGateway, o: LayerOptions) {
	const swap = chromium as any
	const own = Object.getOwnPropertyDescriptor(swap, 'launchPersistentContext')
	swap.launchPersistentContext = async (profile: string, options: Record<string, unknown>) => {
		const { args: _args, channel: _channel, ignoreDefaultArgs: _defaults, ...rest } = options
		const context = await webkit.launchPersistentContext(profile, { ...rest, serviceWorkers: 'block', proxy: { server: 'http://127.0.0.1:9' } })
		// WebKit has no microphone permission to grant: the guide's microphone is not what this looks at.
		const grant = context.grantPermissions.bind(context)
		context.grantPermissions = (permissions: string[], g: unknown) => grant(permissions.filter((p) => p !== 'microphone'), g).catch(() => {})
		return context
	}
	try {
		return await launchLayer(gw, o)
	} finally {
		if (own) Object.defineProperty(swap, 'launchPersistentContext', own)
		else delete swap.launchPersistentContext
	}
}

/** An 8-bit, non-interlaced PNG (Playwright's screenshots) as its size, channels and unfiltered bytes. */
function decodePng(png: Buffer) {
	let [width, height, depth, type, interlace] = [0, 0, 0, 0, 0]
	const idat: Buffer[] = []
	for (let p = 8; p < png.length; ) {
		const length = png.readUInt32BE(p)
		const kind = png.toString('latin1', p + 4, p + 8)
		const data = png.subarray(p + 8, p + 8 + length)
		if (kind === 'IHDR') [width, height, depth, type, interlace] = [data.readUInt32BE(0), data.readUInt32BE(4), data[8], data[9], data[12]]
		else if (kind === 'IDAT') idat.push(data)
		else if (kind === 'IEND') break
		p += 12 + length
	}
	const channels = ({ 0: 1, 2: 3, 4: 2, 6: 4 } as Record<number, number>)[type]
	assert.ok(depth === 8 && channels && !interlace, `a PNG this reads (depth ${depth}, colour type ${type}, interlace ${interlace})`)
	const raw = zlib.inflateSync(Buffer.concat(idat))
	const stride = width * channels
	const data = Buffer.alloc(height * stride)
	const paeth = (a: number, b: number, c: number) => {
		const p = a + b - c
		const [pa, pb, pc] = [Math.abs(p - a), Math.abs(p - b), Math.abs(p - c)]
		return pa <= pb && pa <= pc ? a : pb <= pc ? b : c
	}
	for (let y = 0; y < height; y += 1) {
		const filter = raw[y * (stride + 1)]
		const line = y * (stride + 1) + 1
		const at = y * stride
		for (let x = 0; x < stride; x += 1) {
			const a = x >= channels ? data[at + x - channels] : 0
			const b = y ? data[at - stride + x] : 0
			const c = x >= channels && y ? data[at - stride + x - channels] : 0
			const v = raw[line + x]
			data[at + x] = (filter === 0 ? v : filter === 1 ? v + a : filter === 2 ? v + b : filter === 3 ? v + ((a + b) >> 1) : v + paeth(a, b, c)) & 255
		}
	}
	return { width, height, channels, data }
}

/**
 * The board as painted now: a screenshot clipped to the board deck's box (and 4 px round it), and the share of its
 * pixels in the board's red (its deck #b80000 and top #e60000; antialiased edges, the outline and the page's dots
 * left out: red at least 140, green and blue at most 60). His feet stand in the deck's box and are red too: their
 * boxes are left out.
 */
async function boardPaint(page: Page) {
	const at = await page.evaluate(() => {
		const m = document.querySelector('.pocket-mascot')
		const box = (n: Element | null | undefined) => {
			if (!n || !n.getClientRects().length) return null
			const r = n.getBoundingClientRect()
			return r.width && r.height ? { left: r.left, top: r.top, right: r.right, bottom: r.bottom } : null
		}
		return { deck: box(m?.querySelector('[data-part="board-deck"]')), feet: ['foot-l', 'foot-r'].map((f) => box(m?.querySelector(`[data-limb="${f}"]`))).filter((b) => !!b) }
	})
	if (!at.deck) return { share: 0, deck: null }
	const x = Math.max(0, Math.floor(at.deck.left) - 4)
	const y = Math.max(0, Math.floor(at.deck.top) - 4)
	const clip = { x, y, width: Math.ceil(at.deck.right) + 4 - x, height: Math.ceil(at.deck.bottom) + 4 - y }
	const img = decodePng(await page.screenshot({ clip }))
	const k = img.width / clip.width // device px per CSS px
	const feet = at.feet.map((f) => ({ left: (f.left - x) * k, right: (f.right - x) * k, top: (f.top - y) * k, bottom: (f.bottom - y) * k }))
	let pixels = 0
	let red = 0
	for (let py = 0; py < img.height; py += 1) {
		for (let px = 0; px < img.width; px += 1) {
			if (feet.some((f) => px + 0.5 >= f.left && px + 0.5 <= f.right && py + 0.5 >= f.top && py + 0.5 <= f.bottom)) continue
			const i = (py * img.width + px) * img.channels
			pixels += 1
			if (img.channels >= 3 && img.data[i] >= 140 && img.data[i + 1] <= 60 && img.data[i + 2] <= 60) red += 1
		}
	}
	return { share: pixels ? red / pixels : 0, deck: fmt(at.deck) }
}

/** Every node of the actors on the page, and what the hygiene rules ask of them. */
const hygiene = (page: Page) =>
	page.evaluate((ROOTS) => {
		const roots = [...document.querySelectorAll(ROOTS)]
		const rigs = new Set([...document.querySelectorAll('.pocket-mascot__mover > svg, .pocket-drone__bob > svg')])
		const unmarked: string[] = []
		let nodes = 0
		const visit = (node: Element) => {
			nodes += 1
			if (!(node.hasAttribute('data-aixc') && node.hasAttribute('data-vg'))) unmarked.push(`${node.localName}.${node.getAttribute('class') ?? ''}`)
			// A rig's parts are its artwork: only the root svg is marked.
			if (rigs.has(node)) return
			for (const child of node.children) visit(child)
		}
		for (const root of roots) visit(root)
		const styles = [...document.querySelectorAll<HTMLStyleElement>('style[data-aixc-css="pocket-actors"]')].map((s) => s.hasAttribute('data-aixc') && s.hasAttribute('data-vg'))
		return {
			roots: roots.map((r) => r.className && typeof r.className === 'string' ? r.className : r.getAttribute('class')),
			nodes,
			rigs: rigs.size,
			unmarked,
			styles,
			readyOnOutput: document.getElementById('pocket-output')?.dataset.pocketActorReady ?? null,
			bodyPocket: [...document.body.attributes].map((a) => a.name).filter((n) => n.startsWith('data-pocket')),
			body: [...document.body.attributes].map((a) => `${a.name}=${a.value}`).sort(),
		}
	}, ROOTS)

/** Vodafone's accessibility button (the stand-in): its box and computed place and look, and its inline style. */
const aw = (page: Page) =>
	page.evaluate(() => {
		const b = document.getElementById('vodafone-aw-icon')
		if (!b) return null
		const r = b.getBoundingClientRect()
		const s = getComputedStyle(b)
		return { box: [r.left, r.top, r.width, r.height], right: s.right, bottom: s.bottom, left: s.left, top: s.top, zIndex: s.zIndex, opacity: s.opacity, visibility: s.visibility, display: s.display, transform: s.transform, style: b.getAttribute('style') }
	})

/** Where everything stands now: the mascot (his drawn body and board, and his box), the drone, the album and the fixed controls. */
const scene = (page: Page) =>
	page.evaluate((CONTENT) => {
		const box = (n: Element | null | undefined) => {
			if (!n || !n.getClientRects().length) return null
			const r = n.getBoundingClientRect()
			return r.width || r.height ? { left: r.left, top: r.top, right: r.right, bottom: r.bottom } : null
		}
		const union = (list: (ReturnType<typeof box>)[]) => {
			const l = list.filter(Boolean) as { left: number; top: number; right: number; bottom: number }[]
			return l.length ? { left: Math.min(...l.map((b) => b.left)), top: Math.min(...l.map((b) => b.top)), right: Math.max(...l.map((b) => b.right)), bottom: Math.max(...l.map((b) => b.bottom)) } : null
		}
		const mascot = document.querySelector<HTMLElement>('.pocket-mascot')
		const svg = mascot?.querySelector('.pocket-mascot__mover > svg')
		const drawn = union([box(svg?.querySelector('[data-part="outline"]')), box(mascot?.querySelector('[data-part="board-deck"]'))])
		const out = document.getElementById('pocket-output')
		const vg = document.querySelector('vg-guide')?.shadowRoot
		const shown = (n: Element | null | undefined) => {
			if (!n) return false
			const s = getComputedStyle(n)
			return s.visibility !== 'hidden' && Number(s.opacity) > 0.05
		}
		const peek = document.querySelector<HTMLElement>('.pocket-peek')
		const drone = document.querySelector<HTMLElement>('.pocket-drone')
		const stage = document.querySelector('.pocket-mascot-stage')
		const s = (window as any).__aixc?.demos?.pocket?.state
		return {
			view: s?.view as string,
			busy: s?.busy as boolean,
			state: mascot?.dataset.mascotState ?? null,
			board: mascot?.dataset.board ?? null,
			covered: mascot?.hasAttribute('data-covered') ?? false,
			inStage: !!mascot?.closest('.pocket-mascot-stage'),
			visibility: mascot ? getComputedStyle(mascot).visibility : null,
			pointerEvents: mascot ? getComputedStyle(mascot).pointerEvents : null,
			mover: box(mascot?.querySelector('.pocket-mascot__mover')),
			drawn,
			floor: box(stage)?.top ?? null,
			drone: drone && !drone.hidden ? box(drone) : null,
			droneAnchor: drone?.dataset.droneAnchor ?? null,
			inner: box(out?.querySelector('.pocket-view__inner')),
			content: [...(out?.querySelectorAll(CONTENT) ?? [])].map(box).filter(Boolean),
			peek: box(peek),
			peekState: peek?.dataset.state ?? null,
			aw: box(document.getElementById('vodafone-aw-icon')),
			mic: box(vg?.querySelector('.vg-mic')),
			kbd: shown(vg?.querySelector('.vg-kbd')) ? box(vg?.querySelector('.vg-kbd')) : null,
			bar: shown(vg?.querySelector('.vg-bar')) ? box(vg?.querySelector('.vg-bar')) : null,
			footer: box(document.querySelector('footer')),
			width: document.documentElement.clientWidth,
			height: innerHeight,
			dir: getComputedStyle(out ?? document.documentElement).direction,
		}
	}, CONTENT)
type Scene = Awaited<ReturnType<typeof scene>>

async function pocketReady(page: Page) {
	await page.waitForFunction(() => (window as any).__aixc?.demos?.pocket?.chips, null, { timeout: 15_000 })
	await page.evaluate(async () => {
		const { store } = (window as any).__aixc.demos.pocket
		await store.ready
		await store.clear()
	})
	await settle(page, 200)
}

const chippedIds = (page: Page) => page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.pocket-chips .pocket-cta[data-pocket-for]')].map((c) => c.dataset.pocketFor!))

/** Pockets card `id` with a press at its chip, as a person would. */
async function pocketByPress(page: Page, id: string, where: string) {
	const at = await page.evaluate(async (id) => {
		const card = [...document.querySelectorAll<HTMLElement>(`#main-content [data-aixc-item="${CSS.escape(id)}"]`)].find((c) => !c.closest('.owl-item.cloned'))!
		card.scrollIntoView({ block: 'center', inline: 'nearest' })
		await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(done, 60))))
		const chip = document.querySelector<HTMLElement>(`.pocket-chips .pocket-cta[data-pocket-for="${CSS.escape(id)}"]`)!
		const r = chip.getBoundingClientRect()
		const x = r.left + r.width / 2
		const y = r.top + r.height / 2
		const hit = document.elementFromPoint(x, y)
		return { x, y, hit: !!hit && (hit === chip || chip.contains(hit)) }
	}, id)
	assert.equal(at.hit, true, `${where}: a press at ${id}'s chip reaches it`)
	await page.mouse.click(at.x, at.y)
	await page.waitForFunction((id) => (window as any).__aixc.demos.pocket.store.all().some((r: any) => r.id === id), id, { timeout: 5_000 })
}

/** The corner shown and still: nothing flying, the greeting over. */
async function cornerShown(page: Page) {
	await page.waitForSelector('.pocket-peek[data-state="shown"]', { timeout: 5_000 })
	await page.waitForFunction(() => document.querySelectorAll('.curl-host--flying').length === 0, null, { timeout: 8_000 })
	await settle(page, 900)
}

const actorsReady = (page: Page) => page.waitForSelector('#pocket-output[data-pocket-actor-ready]', { state: 'attached', timeout: 10_000 })

const waitView = (page: Page, view: 'page' | 'pocket') =>
	page.waitForFunction(
		(view) => {
			const s = (window as any).__aixc.demos.pocket.state
			return s.view === view && !s.busy
		},
		view,
		{ timeout: 10_000 },
	)

/** Waits until the mascot is in one of `states` (the brain's data-mascot-state). */
const mascotIn = (page: Page, states: string[], timeout = 8_000) =>
	page.waitForFunction((states) => states.includes(document.querySelector<HTMLElement>('.pocket-mascot')?.dataset.mascotState ?? ''), states, { timeout })

async function pressPeek(page: Page) {
	const s = await scene(page)
	assert.ok(s.peek, 'the Pocket button shows')
	await page.mouse.click((s.peek.left + s.peek.right) / 2, (s.peek.top + s.peek.bottom) / 2)
}
const pressBack = (page: Page) => page.locator('#pocket-output .pocket-view__bar .pocket-back').click()

/**
 * Samples the mascot about every 150 ms (and at once): his box, drawn box, state, what a press at his
 * middle reaches, and the accessibility button's box and look. Stop with stopSampling().
 */
const startSampling = (page: Page) =>
	page.evaluate(() => {
		const w = window as any
		w.__samples = []
		const t0 = performance.now()
		const take = () => {
			const m = document.querySelector<HTMLElement>('.pocket-mascot')
			const mover = m?.querySelector('.pocket-mascot__mover')
			const svg = mover?.querySelector('svg')
			const outline = svg?.querySelector('[data-part="outline"]')
			const r = mover?.getBoundingClientRect()
			const d = outline?.getBoundingClientRect()
			const a = document.getElementById('vodafone-aw-icon')
			const ar = a?.getBoundingClientRect()
			const as = a ? getComputedStyle(a) : null
			let hit: string | null = null
			if (r && r.width) {
				const at = document.elementFromPoint(Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2)), Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2)))
				hit = at?.closest('.pocket-mascot') ? 'mascot' : at ? at.localName : null
			}
			w.__samples.push({
				t: Math.round(performance.now() - t0),
				state: m?.dataset.mascotState ?? null,
				board: m?.dataset.board ?? null,
				visible: m ? getComputedStyle(m).visibility !== 'hidden' : false,
				pointerEvents: m ? getComputedStyle(m).pointerEvents : null,
				box: r ? { left: r.left, top: r.top, right: r.right, bottom: r.bottom } : null,
				drawn: d && d.width ? { left: d.left, top: d.top, right: d.right, bottom: d.bottom } : null,
				hit,
				aw: ar && as ? JSON.stringify([ar.left, ar.top, ar.width, ar.height, as.right, as.bottom, as.zIndex, as.opacity, as.visibility, as.transform, a!.getAttribute('style')]) : null,
			})
		}
		take()
		w.__sampler = setInterval(take, 150)
	})
const stopSampling = (page: Page) =>
	page.evaluate(() => {
		const w = window as any
		clearInterval(w.__sampler)
		return w.__samples as { t: number; state: string | null; board: string | null; visible: boolean; pointerEvents: string | null; box: Box | null; drawn: Box | null; hit: string | null; aw: string | null }[]
	})
type Sample = Awaited<ReturnType<typeof stopSampling>>[number]
const cx = (b: Box) => (b.left + b.right) / 2

/** The accessibility button as a sample string, from the ?aixc=off reading. */
const awSample = (a: NonNullable<Awaited<ReturnType<typeof aw>>>) => JSON.stringify([a.box[0], a.box[1], a.box[2], a.box[3], a.right, a.bottom, a.zIndex, a.opacity, a.visibility, a.transform, a.style])

/** The ?aixc=off readings: the accessibility button, body's attributes and the footer. */
async function served(page: Page, path: string) {
	await open(page, path, '?aixc=off')
	await settle(page, 400)
	const a = await aw(page)
	const body = await page.evaluate(() => [...document.body.attributes].map((x) => `${x.name}=${x.value}`).sort())
	const footer = await page.evaluate(() => {
		const r = document.querySelector('footer')!.getBoundingClientRect()
		return { left: r.left, width: r.width, height: r.height }
	})
	return { aw: a!, body, footer }
}

/**
 * Where the mascot stands at rest, in the album: on the content margin of its inline end (right in
 * English, left in Arabic), clear of the fixed controls by PAD, not over the album's content; the drone
 * in the upper corner on the same side (none on a phone).
 */
function assertStand(s: Scene, lang: 'en' | 'ar', vp: Viewport, where: string) {
	assert.ok(s.drawn && s.inner, `${where}: the mascot is drawn and the album has its content (${fmt(s.drawn)} ${fmt(s.inner)})`)
	const d = s.drawn!
	const inner = s.inner!
	assert.equal(s.visibility, 'visible', `${where}: he shows`)
	assert.equal(s.pointerEvents, 'none', `${where}: he never takes a press`)
	assert.ok(Math.abs(d.bottom - vp.height) < d.bottom - d.top, `${where}: he stands at the viewport's bottom (${fmt(d)})`)
	const controls: [string, Box | null][] = [
		['the accessibility button', s.aw],
		['the microphone', s.mic],
		['the keyboard button', s.kbd],
		['the transcript bar', s.bar],
	]
	for (const [name, b] of controls) if (b) assert.ok(gap(d, b) >= PAD - 0.5, `${where}: at least ${PAD} px from ${name} (${Math.round(gap(d, b))} px; ${fmt(d)} vs ${fmt(b)})`)
	const blocked = controls.some(([, b]) => b && b.top < vp.height && b.bottom > d.top - PAD && b.right > inner.right - 2 * (d.right - d.left))
	if (lang === 'en') {
		assert.ok(cx(d) > vp.width / 2, `${where}: he stands on the right half (${fmt(d)})`)
		if (!blocked) assert.ok(d.right <= inner.right + 2 && d.right >= inner.right - 12, `${where}: his drawn right edge is on the album's right content margin (${Math.round(d.right)} vs ${Math.round(inner.right)})`)
		else assert.ok(d.right <= inner.right + 2, `${where}: moved inward from the margin, never outward (${Math.round(d.right)} vs ${Math.round(inner.right)})`)
	} else {
		assert.ok(cx(d) < vp.width / 2, `${where}: he stands on the LEFT half in Arabic (${fmt(d)})`)
		assert.ok(d.left >= inner.left - 2 && d.left <= inner.left + 12, `${where}: his drawn left edge is on the album's LEFT content margin (${Math.round(d.left)} vs ${Math.round(inner.left)})`)
	}
	if (!s.covered) for (const c of s.content) assert.equal(overlaps(d, c as Box), false, `${where}: the mascot is not over the album's content (${fmt(d)} vs ${fmt(c as Box)})`)
	if (vp.width < 640) {
		assert.equal(s.drone, null, `${where}: no drone on a phone`)
		return
	}
	assert.ok(s.drone, `${where}: the drone shows`)
	const dr = s.drone!
	const w = dr.right - dr.left
	for (const c of s.content) assert.equal(overlaps(dr, c as Box), false, `${where}: the drone is not over the album's content (${fmt(dr)} vs ${fmt(c as Box)})`)
	assert.ok(dr.bottom < vp.height / 2, `${where}: the drone is in the upper half (${fmt(dr)})`)
	if (lang === 'en') {
		assert.ok(cx(dr) > vp.width / 2 && dr.right <= inner.right + 0.3 * w + 12 && dr.right >= inner.right - 12, `${where}: the drone is in the upper-right, on the content's right margin (${fmt(dr)} vs ${Math.round(inner.right)}; ${s.droneAnchor})`)
	} else {
		assert.ok(cx(dr) < vp.width / 2 && dr.left >= inner.left - 0.3 * w - 12 && dr.left <= inner.left + 12, `${where}: the drone is in the upper-LEFT, on the content's left margin (${fmt(dr)} vs ${Math.round(inner.left)}; ${s.droneAnchor})`)
	}
}

/* ----------------------------------------------------------------- 1. loading and hygiene */

for (const lang of ['en', 'ar'] as const) {
	const path = `/${lang}/services`
	test(`${path}: nothing of the actors before their chunk; after the first press every node they add is marked, their flag is on #pocket-output and not on body, one marked style (S12)`, { timeout: 120_000 }, async () => {
		const l = await launchLayer(gw, { initScripts: [ACTORS_TEST, HOLD_IDLE] })
		try {
			const seen = watch(l.page)
			const off = await served(l.page, path)
			const asked: string[] = []
			l.page.on('request', (r) => {
				if (/\/sdk\/aixc\//.test(r.url())) asked.push(r.url())
			})
			// ?aixc=off: no actors, nothing of the layer asked for but its loader.
			assert.deepEqual((await hygiene(l.page)).roots, [], `${path} ?aixc=off: no actors`)
			await open(l.page, path, '?aixc-debug')
			await pocketReady(l.page)
			await l.page.waitForTimeout(2_500)
			const before = await hygiene(l.page)
			assert.deepEqual([before.roots, before.styles, before.readyOnOutput], [[], [], null], `${path}: nothing of the actors before a press (${JSON.stringify(before)})`)
			assert.deepEqual(before.bodyPocket, [], `${path}: no data-pocket-* on body`)

			const ids = await chippedIds(l.page)
			await pocketByPress(l.page, ids[0], path)
			await actorsReady(l.page)
			await cornerShown(l.page)
			const h = await hygiene(l.page)
			assert.ok(h.roots.length >= 4, `${path}: the actors are on the page (${h.roots.join(' | ')})`)
			assert.equal(h.rigs, 2, `${path}: both rigs mounted`)
			assert.deepEqual(h.unmarked, [], `${path}: every node of the actors (${h.nodes}) is marked data-aixc and data-vg (rig parts aside)`)
			assert.deepEqual(h.styles, [true], `${path}: one actors' style, marked`)
			assert.equal(h.readyOnOutput, 'true', `${path}: #pocket-output carries data-pocket-actor-ready`)
			assert.deepEqual(h.bodyPocket, [], `${path}: no data-pocket-* on body`)
			assert.deepEqual(h.body, before.body, `${path}: body's attributes are as before the actors came`)
			assert.deepEqual(off.body.filter((a) => a.startsWith('data-pocket')), [], `${path} ?aixc=off: body has no data-pocket-*`)

			// The album: what the actors add there is marked too (the cursor's nodes, the drone's trail).
			await pressPeek(l.page)
			await waitView(l.page, 'pocket')
			await l.page.mouse.move(400, 300)
			await l.page.mouse.move(420, 320, { steps: 4 })
			await settle(l.page, 600)
			const album = await hygiene(l.page)
			assert.deepEqual(album.unmarked, [], `${path} album: every node of the actors (${album.nodes}) is marked (rig parts aside)`)
			// The Pocket itself (pocket.js, not the actors) marks body data-pocket-view while the album shows.
			assert.deepEqual(album.bodyPocket, ['data-pocket-view'], `${path} album: on body only the Pocket's own data-pocket-view, nothing of the actors`)
			assert.deepEqual(album.body.filter((a) => !a.startsWith('data-pocket-view=')), before.body, `${path} album: body's attributes otherwise as before the actors came`)
			assert.ok(asked.length > 0, `${path}: the layer was asked for`)
			assert.deepEqual(seen.pageErrors, [], `${path}: no page errors`)
			assert.ok(!seen.layer.some((x) => x.includes('the Pocket actors stopped')), `${path}: the actors carried on (${seen.layer.join(' | ')})`)
		} finally {
			await l.close()
		}
	})
}

/* ------------------------------------------------- 2-4, 7. the peek, the ride, the stand place */

const VIEWPORTS: [string, Viewport][] = [
	['1366', DESKTOP],
	['1024', TABLET],
	['375', PHONE],
]

for (const lang of ['en', 'ar'] as const) {
	for (const [name, vp] of VIEWPORTS) {
		const path = `/${lang}/services`
		const where = `${path} ${name} motion`
		test(`${where}: hidden behind the Pocket button at the bottom-left; the album opens and he rides to his place on the ${lang === 'en' ? 'right' : 'LEFT'} content margin, 16 px from Vodafone's and the guide's controls; closing, back behind the button; Vodafone's button untouched (S12)`, { timeout: 150_000 }, async () => {
			const l = await launchLayer(gw, { viewport: vp, owl: true, initScripts: [ACTORS_TEST] })
			try {
				const seen = watch(l.page)
				const off = await served(l.page, path)
				const awOff = awSample(off.aw)
				await open(l.page, path, '?aixc-debug')
				await pocketReady(l.page)
				const ids = await chippedIds(l.page)
				assert.ok(ids.length >= 1, `${where}: chips are drawn`)
				// The actors come at idle on a page with chips: the first save is greeted.
				await actorsReady(l.page)
				await settle(l.page, 300)

				// 2. The peek: a save, greeted; his mittens on the rim; then hidden behind the button. (One
				// sticker: on a phone a second card would lie where he stands, and he would tuck away.)
				await l.page.evaluate(() => {
					const w = window as any
					w.__states = []
					// The mascot is on the page once there is a corner to hide behind: watch for him anywhere.
					new MutationObserver((list) => {
						for (const r of list) if ((r.target as Element).classList.contains('pocket-mascot')) w.__states.push((r.target as HTMLElement).dataset.mascotState)
					}).observe(document.documentElement, { attributes: true, subtree: true, attributeFilter: ['data-mascot-state'] })
				})
				await startSampling(l.page)
				await pocketByPress(l.page, ids[0], where)
				await l.page.waitForTimeout(400)
				// While he holds the button open: his mittens on its rim.
				const grip = await l.page.evaluate(async () => {
					for (let i = 0; i < 30; i += 1) {
						const g = document.querySelector('.pocket-actor-grip')
						if (g?.hasAttribute('data-shown')) {
							const hands = [...g.children].map((n) => n.getBoundingClientRect()).filter((r) => r.width)
							const b = document.querySelector('.pocket-peek')!.getBoundingClientRect()
							return { hands: hands.map((r) => ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom })), button: { left: b.left, top: b.top, right: b.right, bottom: b.bottom } }
						}
						await new Promise((done) => setTimeout(done, 50))
					}
					return null
				})
				await cornerShown(l.page)
				await mascotIn(l.page, ['hidden'])
				const greet = await stopSampling(l.page)
				const states = await l.page.evaluate(() => (window as any).__states as string[])
				assert.ok(states.includes('emerging') && states.includes('holding'), `${where}: the save is greeted (${states.join(' ')})`)
				assert.ok(grip, `${where}: his mittens show on the button while he holds it`)
				for (const hand of grip!.hands) assert.ok(gap(hand, grip!.button) <= 6, `${where}: a mitten on the button's rim (${fmt(hand)} vs ${fmt(grip!.button)})`)
				const peeked = greet.filter((s) => s.visible && s.box)
				assert.ok(peeked.length > 0, `${where}: he showed while greeting`)
				const p = await scene(l.page)
				assert.ok(p.peek, `${where}: the Pocket button shows`)
				for (const s of peeked) assert.ok(cx(s.box!) >= p.peek!.left - 8 && cx(s.box!) <= p.peek!.right + 8, `${where}: rising, he stays behind the button (${fmt(s.box)} vs ${fmt(p.peek)})`)
				assert.equal(p.state, 'hidden', `${where}: then hidden`)
				assert.ok(p.mover && p.mover.top >= (p.peek!.top + p.peek!.bottom) / 2 - 1, `${where}: hidden below the button's middle, behind it (${fmt(p.mover)} vs ${fmt(p.peek)})`)
				assert.ok(cx(p.mover!) >= p.peek!.left && cx(p.mover!) <= p.peek!.right, `${where}: hidden right behind the button (${fmt(p.mover)} vs ${fmt(p.peek)})`)
				assert.ok(p.peek!.right < vp.width / 2, `${where}: at the bottom-left`)
				const hit = await l.page.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest('.pocket-peek'), [cx(p.peek!), (p.peek!.top + p.peek!.bottom) / 2])
				assert.equal(hit, true, `${where}: a press at the button's middle reaches it`)
				for (const [n, b] of [['accessibility button', p.aw], ['mic', p.mic]] as const) if (b) assert.equal(overlaps(p.peek!, b), false, `${where}: the Pocket button is clear of the ${n}`)
				for (const s of greet) assert.equal(s.aw, awOff, `${where}: Vodafone's button as served while he greets (${s.t} ms)`)
				for (const s of greet) assert.notEqual(s.hit, 'mascot', `${where}: no press reaches him (${s.t} ms)`)

				// 3. The ride.
				await startSampling(l.page)
				await pressPeek(l.page)
				await waitView(l.page, 'pocket')
				await mascotIn(l.page, ['idle', 'tucked', 'flinching'], 8_000)
				await l.page.waitForTimeout(900)
				// The drone may wait on the floor beside him as the album opens; it takes off once he raises the remote.
				await l.page.waitForFunction(() => {
					const d = document.querySelector<HTMLElement>('.pocket-drone')
					return !d || d.hidden || ['home-hover', 'curious', 'following'].includes(d.dataset.droneState ?? '')
				}, null, { timeout: 8_000 })
				await settle(l.page, 300)
				const ride = await stopSampling(l.page)
				const s = await scene(l.page)
				const shown = ride.filter((x) => x.visible && x.box && x.state !== 'hidden')
				assert.ok(shown.length >= 3, `${where}: sampled in the album (${shown.length})`)
				const start = cx(shown[0].box!)
				const end = cx(shown.at(-1)!.box!)
				const rode = ride.some((x) => x.state === 'riding')
				const home = cx(s.mover!)
				assert.ok(Math.abs(end - home) < 12, `${where}: the ride ends at his place (${Math.round(end)} vs ${Math.round(home)}; ${shown.slice(-6).map((x) => `${x.t}:${x.state}:${fmt(x.box)}`).join(' ')}; now ${s.state} ${fmt(s.mover)})`)
				if (lang === 'en') {
					assert.ok(start < vp.width / 3, `${where}: he starts at the left, by the button (${Math.round(start)})`)
					assert.equal(rode, true, `${where}: he rides across`)
					const xs = shown.map((x) => cx(x.box!))
					const back = Math.max(0, ...xs.slice(1).map((x, i) => xs[i] - x))
					assert.ok(back < 24, `${where}: he rides to the right all the way (back ${Math.round(back)} px; ${xs.map(Math.round).join(' ')})`)
					assert.ok(end - start > vp.width * 0.4, `${where}: across the screen (${Math.round(start)} to ${Math.round(end)})`)
				} else {
					const distance = Math.abs(home - (p.peek!.left + p.peek!.right) / 2)
					assert.ok(home < vp.width / 2, `${where}: his place is on the left (${Math.round(home)})`)
					if (distance < 60) assert.equal(rode, false, `${where}: so near the button there is no ride (${Math.round(distance)} px)`)
					else {
						assert.ok(end >= start - 4, `${where}: a short ride to the right (${Math.round(start)} to ${Math.round(end)})`)
						assert.ok(Math.max(...shown.map((x) => cx(x.box!))) < vp.width / 2, `${where}: he never crosses the screen`)
					}
				}
				assert.ok(['hovering', 'down'].includes(s.board ?? ''), `${where}: he ends standing on his board (${s.board})`)
				for (const x of ride) assert.equal(x.aw, awOff, `${where}: Vodafone's button as served during the turn and the ride (${x.t} ms)`)
				for (const x of ride) assert.notEqual(x.hit, 'mascot', `${where}: no press reaches him (${x.t} ms, ${x.state})`)
				for (const x of ride) if (x.pointerEvents) assert.equal(x.pointerEvents, 'none', `${where}: pointer-events none (${x.t} ms)`)

				// 4. Where he stands.
				assertStand(s, lang, vp, where)
				// Presses on the album's controls reach them.
				const back = await l.page.evaluate(() => {
					const b = document.querySelector('#pocket-output .pocket-view__bar .pocket-back')!.getBoundingClientRect()
					return !!document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2)?.closest('.pocket-back')
				})
				assert.equal(back, true, `${where}: a press at Back reaches it`)
				assert.equal(awSample((await aw(l.page))!), awOff, `${where}: Vodafone's button as served in the album`)

				// Closing: back toward the button's corner, and hidden.
				await startSampling(l.page)
				await pressBack(l.page)
				await waitView(l.page, 'page')
				await mascotIn(l.page, ['hidden'])
				await settle(l.page, 300)
				const close = await stopSampling(l.page)
				const leaving = close.filter((x) => x.visible && x.box && x.state === 'leaving')
				if (lang === 'en' && vp.width >= 640) {
					assert.ok(leaving.length >= 2, `${where}: he rides back (${leaving.length} samples)`)
					assert.ok(cx(leaving.at(-1)!.box!) < cx(leaving[0].box!), `${where}: toward the button's corner`)
				}
				const after = await scene(l.page)
				assert.equal(after.state, 'hidden', `${where}: hidden again`)
				assert.ok(after.peek && after.mover && cx(after.mover) >= after.peek.left && cx(after.mover) <= after.peek.right, `${where}: behind the button (${fmt(after.mover)} vs ${fmt(after.peek)})`)
				for (const x of close) assert.equal(x.aw, awOff, `${where}: Vodafone's button as served while he leaves (${x.t} ms)`)
				for (const x of close) assert.notEqual(x.hit, 'mascot', `${where}: no press reaches him (${x.t} ms)`)
				assert.deepEqual(seen.pageErrors, [], `${where}: no page errors`)
				assert.ok(!seen.layer.some((x) => x.includes('the Pocket actors stopped')), `${where}: the actors carried on (${seen.layer.join(' | ')})`)
			} finally {
				await l.close()
			}
		})
	}
}

for (const lang of ['en', 'ar'] as const) {
	const path = `/${lang}/services`
	const where = `${path} 1366 reduced motion`
	test(`${where}: no ride; he is simply at his place (S12)`, { timeout: 120_000 }, async () => {
		const l = await launchLayer(gw, { owl: true, reducedMotion: true, initScripts: [ACTORS_TEST] })
		try {
			const seen = watch(l.page)
			const off = await served(l.page, path)
			await open(l.page, path, '?aixc-debug')
			await pocketReady(l.page)
			await pocketByPress(l.page, (await chippedIds(l.page))[0], where)
			await actorsReady(l.page)
			await cornerShown(l.page)
			await startSampling(l.page)
			await pressPeek(l.page)
			await waitView(l.page, 'pocket')
			await settle(l.page, 300)
			const samples = await stopSampling(l.page)
			assert.deepEqual(samples.filter((x) => x.state === 'riding'), [], `${where}: no ride`)
			const s = await scene(l.page)
			assert.equal(s.state, 'idle', `${where}: he is there`)
			assertStand(s, lang, DESKTOP, where)
			assert.equal(awSample((await aw(l.page))!), awSample(off.aw), `${where}: Vodafone's button as served`)
			assert.deepEqual(seen.pageErrors, [], `${where}: no page errors`)
		} finally {
			await l.close()
		}
	})
}

test('/en/services 1366: with the guide\'s keyboard button and transcript bar showing, he keeps 16 px from them; hidden, they do not move him from his place (S12)', { timeout: 120_000 }, async () => {
	const where = '/en/services 1366 guide controls'
	const l = await launchLayer(gw, { owl: true, reducedMotion: true, initScripts: [ACTORS_TEST] })
	try {
		await open(l.page, '/en/services', '?aixc-debug')
		await pocketReady(l.page)
		await pocketByPress(l.page, (await chippedIds(l.page))[0], where)
		await actorsReady(l.page)
		await cornerShown(l.page)
		await pressPeek(l.page)
		await waitView(l.page, 'pocket')
		await settle(l.page, 300)
		const plain = await scene(l.page)
		assert.equal(plain.kbd, null, `${where}: the keyboard button is not shown`)
		assertStand(plain, 'en', DESKTOP, `${where} hidden`)
		assert.ok(plain.drawn!.right >= plain.inner!.right - 12, `${where}: hidden controls leave him on the margin (${fmt(plain.drawn)} vs ${Math.round(plain.inner!.right)})`)
		await pressBack(l.page)
		await waitView(l.page, 'page')
		// The guide shows its keyboard button and its transcript bar (as while it listens).
		await l.page.evaluate(() => {
			const root = document.querySelector('vg-guide')!.shadowRoot!
			root.querySelector('.vg-kbd')!.classList.add('show')
			root.querySelector('.vg-bar')!.classList.remove('hidden')
		})
		await settle(l.page, 300)
		await pressPeek(l.page)
		await waitView(l.page, 'pocket')
		await settle(l.page, 300)
		const s = await scene(l.page)
		assert.ok(s.kbd && s.bar, `${where}: the keyboard button and the transcript bar show`)
		assertStand(s, 'en', DESKTOP, `${where} shown`)
	} finally {
		await l.close()
	}
})

/* ------------------------------------------------------------------------ 5. the floor */

for (const c of [
	{ path: '/en/services', vp: PHONE, n: 3 },
	{ path: '/en/home', vp: DESKTOP, n: 3 },
]) {
	const where = `${c.path} ${c.vp.width} floor`
	test(`${where}: in a tall album the floor stays at the viewport's bottom while scrolling and stops above Vodafone's footer at the end (S12)`, { timeout: 150_000 }, async () => {
		const l = await launchLayer(gw, { viewport: c.vp, owl: true, reducedMotion: true, initScripts: [ACTORS_TEST] })
		try {
			const seen = watch(l.page)
			const off = await served(l.page, c.path)
			await open(l.page, '/en/services', '?aixc-debug')
			await pocketReady(l.page)
			const ids = await chippedIds(l.page)
			for (const id of ids.slice(0, c.n)) await pocketByPress(l.page, id, where)
			if (c.path !== '/en/services') {
				await open(l.page, c.path, '?aixc-debug')
				await l.page.waitForFunction(() => (window as any).__aixc?.demos?.pocket, null, { timeout: 15_000 })
			}
			await actorsReady(l.page)
			await cornerShown(l.page)
			await pressPeek(l.page)
			await waitView(l.page, 'pocket')
			await settle(l.page, 300)
			const top = await scene(l.page)
			assert.ok(top.floor !== null && Math.abs(top.floor - c.vp.height) <= 1, `${where}: at the top, the floor is the viewport's bottom (${top.floor})`)
			assert.ok(top.footer!.top > c.vp.height, `${where}: the album is taller than the screen (footer at ${Math.round(top.footer!.top)})`)
			// Scroll as a person does, a little at a time, to the end.
			let last = top
			for (let i = 0; i < 80; i += 1) {
				await l.page.mouse.wheel(0, 240)
				await settle(l.page, 40)
				last = await scene(l.page)
				if (last.footer && last.footer.top < c.vp.height) {
					if (last.footer.top > c.vp.height * 0.8) assert.ok(Math.abs(last.floor! - Math.min(c.vp.height, last.footer.top)) <= 2, `${where}: the floor follows the end of the album (${last.floor} vs footer ${last.footer.top})`)
				} else assert.ok(Math.abs(last.floor! - c.vp.height) <= 1, `${where}: while scrolling, the floor stays at the viewport's bottom (${last.floor})`)
				if (last.footer && last.footer.bottom <= c.vp.height + 1) break
			}
			assert.ok(last.footer && last.footer.top < c.vp.height, `${where}: scrolled to the footer (${fmt(last.footer)})`)
			assert.ok(last.floor! <= last.footer!.top + 1, `${where}: at the end the floor stops above the footer (${last.floor} vs ${Math.round(last.footer!.top)})`)
			assert.ok(last.drawn && last.drawn.bottom <= last.footer!.top + 2, `${where}: he stands above the footer, not on it (${fmt(last.drawn)} vs ${fmt(last.footer)})`)
			assert.deepEqual({ left: last.footer!.left, width: last.footer!.right - last.footer!.left, height: last.footer!.bottom - last.footer!.top }, off.footer, `${where}: Vodafone's footer keeps its size and place across`)
			assert.deepEqual(seen.pageErrors, [], `${where}: no page errors`)
		} finally {
			await l.close()
		}
	})
}

/* ------------------------------------------- at rest, a scroll lifting the fixed floor (F11, O44) */

/**
 * Whether the actors rest (F11): the lid over his eye is there only then, and his box carries the way to the
 * next drawing; the drone rests with him when its button carries its own (Web Animations the actors started,
 * not the page's CSS ones). Nothing here reads a layout.
 */
const restState = (page: Page) =>
	page.evaluate(() => {
		const scripted = (n: Element | null | undefined) => !!n && n.getAnimations().some((a) => !(a instanceof CSSAnimation) && !(a instanceof CSSTransition))
		const lid = document.querySelector<HTMLElement>('.pocket-mascot__lid')
		const drone = document.querySelector<HTMLElement>('.pocket-drone')
		return { on: !!lid && !lid.hidden && scripted(document.querySelector('.pocket-mascot__mover')), drone: !!drone && !drone.hidden && scripted(drone) }
	})

/** Polls restState every 100 ms until the actors rest (and the drone with them, when `drone`), for up to `ms`; returns the last reading. */
async function restsWithin(page: Page, ms: number, { drone = false } = {}) {
	const since = Date.now()
	let s = await restState(page)
	while (!(s.on && (!drone || s.drone)) && Date.now() - since < ms) {
		await page.waitForTimeout(100)
		s = await restState(page)
	}
	return { ...s, ms: Date.now() - since }
}

/**
 * Guards the fixed floor's scroll shift re-running the room check: on Vodafone's pages the floor is fixed, and
 * boundFloor() lifts it (translateY) once the album's end scrolls into view; the scroll then measures him again
 * (pocket-actors.js boundFloor/fitMascot) when the lift brings a fixed control into his place. Before that fix he
 * rode up beside the guide's mic: measured 2026-11-18 at 375x812, 12 px from it (16.0 after). Starting from the
 * rest also covers O44's scroll item (a scroll ends the rest), which had no test until now. The trail off, as the
 * file's other cases outside 'with the trail on': its pill tucking away on the scroll measures him again by itself
 * and hides the fault (17.4 px before the fix with it on, 13.4 with it off).
 */
test('/en/services 375x812 at rest: the album\'s end scrolled into view, the lifted floor keeps him 16 px from the mic (F11, O44)', { timeout: 150_000 }, async () => {
	const where = '/en/services 375 at rest, the album\'s end scrolled in'
	const l = await launchLayer(gw, { viewport: PHONE, owl: true, initScripts: [ACTORS_TEST] })
	try {
		const seen = watch(l.page)
		// As albumAtRest, but the pointer stays where it pressed the Pocket button (on a phone the sticker spans the
		// album's width: no place beside it for the pointer); a pointer still on a card turns him to it, then he rests.
		await open(l.page, '/en/services', '?aixc-debug')
		await pocketReady(l.page)
		await pocketByPress(l.page, (await chippedIds(l.page))[0], where)
		await actorsReady(l.page)
		await cornerShown(l.page)
		await pressPeek(l.page)
		await waitView(l.page, 'pocket')
		await mascotIn(l.page, ['idle', 'tucked'], 10_000)
		const resting = await restsWithin(l.page, 10_000)
		assert.ok(resting.on, `${where}: the actors rest before the scroll (${JSON.stringify(resting)})`)
		const before = await scene(l.page)
		assert.ok(before.drawn && before.mic, `${where}: he and the mic show before the scroll (${fmt(before.drawn)} ${fmt(before.mic)})`)
		// The album's end (its last sticker) to the viewport's middle, by script: no pointer, no wheel. The floor
		// lifts by some 55 px, his place then level with the mic (the end itself centred lifts him far above it).
		await l.page.evaluate(() => [...document.querySelectorAll('#pocket-output .pocket-grid__item')].at(-1)!.scrollIntoView({ block: 'center', inline: 'nearest' }))
		// The scroll's frame: until the floor's lift and his place (left, bottom) hold still for three frames (at most 2 s).
		const floorAt = await l.page.evaluate(
			() =>
				new Promise<string>((done) => {
					const floor = document.querySelector<HTMLElement>('.pocket-actor-floor')!
					const mascot = document.querySelector<HTMLElement>('.pocket-mascot')!
					const read = () => `${floor.style.transform}|${mascot.style.left}|${mascot.style.bottom}`
					const until = performance.now() + 2_000
					let last = read()
					let same = 0
					const step = () => {
						const now = read()
						same = now === last && floor.style.transform ? same + 1 : 0
						last = now
						if (same >= 3 || performance.now() > until) done(now)
						else requestAnimationFrame(step)
					}
					requestAnimationFrame(step)
				}),
		)
		const s = await scene(l.page)
		assert.ok(/translateY\(-\d/.test(floorAt), `${where}: the floor is lifted above the album's end (${floorAt})`)
		assert.equal((await restState(l.page)).on, false, `${where}: the scroll ended the rest`)
		assert.ok(s.drawn && s.mic, `${where}: he and the mic show after the scroll (${fmt(s.drawn)} ${fmt(s.mic)}; ${s.state})`)
		const g = gap(s.drawn!, s.mic!)
		console.log(`${where}: ${JSON.stringify({ floorAt, gap: +g.toFixed(2), drawn: fmt(s.drawn), mic: fmt(s.mic), state: s.state })}`)
		assert.ok(g >= PAD - 0.5, `${where}: at least ${PAD} px from the microphone (${g.toFixed(1)} px; ${fmt(s.drawn)} vs ${fmt(s.mic)}; ${s.state}, floor ${floorAt})`)
		assert.deepEqual(seen.pageErrors, [], `${where}: no page errors`)
	} finally {
		await l.close()
	}
})

/* ---------------------------------------------------------------------- 6. a failure */

for (const lang of ['en', 'ar'] as const) {
	const path = `/${lang}/services`
	const where = `${path} actors-frame`
	test(`${where}: a failure in the actors drops only the actors; the layer and the Pocket carry on; Vodafone's button as served (S12)`, { timeout: 120_000 }, async () => {
		const l = await launchLayer(gw, { owl: true, initScripts: [ACTORS_TEST] })
		try {
			const seen = watch(l.page)
			const off = await served(l.page, path)
			await open(l.page, path, '?aixc-debug')
			await pocketReady(l.page)
			const ids = await chippedIds(l.page)
			await pocketByPress(l.page, ids[0], where)
			await actorsReady(l.page)
			await cornerShown(l.page)
			assert.ok((await hygiene(l.page)).roots.length > 0, `${where}: the actors are on the page`)
			await l.page.evaluate(() => {
				;(window as any).__AIXC_TEST__ = { failAt: 'actors-frame' }
			})
			// A save wakes the mascot's frame, where the failure is thrown.
			await pocketByPress(l.page, ids[1], where)
			await l.page.waitForFunction(() => document.querySelectorAll('.pocket-actor-peek, .pocket-actor-floor, .pocket-actor-layer, .pocket-actor-grip, .pocket-mascot').length === 0, null, { timeout: 8_000 })
			await l.page.evaluate(() => {
				;(window as any).__AIXC_TEST__ = {}
			})
			await cornerShown(l.page)
			const h = await hygiene(l.page)
			assert.deepEqual([h.roots, h.readyOnOutput], [[], null], `${where}: no actor node remains, nor their flag`)
			assert.equal(await l.page.evaluate(() => (window as any).__aixc.state), 'ready', `${where}: the layer is still ready`)
			assert.ok(seen.layer.some((x) => x.includes('the Pocket actors stopped')), `${where}: the host heard of it (${seen.layer.join(' | ')})`)
			assert.equal(await l.page.evaluate(() => (window as any).__aixc.demos.pocket.store.all().length), 2, `${where}: the Pocket still pockets`)
			await pressPeek(l.page)
			await waitView(l.page, 'pocket')
			assert.equal(await l.page.evaluate(() => document.querySelectorAll('#pocket-output .pocket-grid__item').length), 2, `${where}: the album opens with both stickers`)
			assert.equal(awSample((await aw(l.page))!), awSample(off.aw), `${where}: Vodafone's button as served in the album`)
			await pressBack(l.page)
			await waitView(l.page, 'page')
			await cornerShown(l.page)
			assert.equal(awSample((await aw(l.page))!), awSample(off.aw), `${where}: Vodafone's button as served after`)
			assert.equal((await hygiene(l.page)).roots.length, 0, `${where}: the actors stay away`)
			assert.deepEqual(seen.pageErrors, [], `${where}: no uncaught error on the page`)
		} finally {
			await l.close()
		}
	})
}

/* ---------------------------------------------- 8. with the trail on: the drone (F6), rest (F11) */

/**
 * The album as the live runs of 2026-11-17 met it: the trail on, so the bar carries "Your journey" and the
 * trail's pill floats over "Empty pocket"; one sticker, so its group's head ("Services  THIS PAGE") lies
 * between the title and the card. The gateway of this file is restarted with the trail on for these.
 */
describe('with the trail on', () => {
	before(async () => {
		await gw?.close()
		gw = await startLayerGateway(PORT, { trail: true })
	})

	/** Everything the drone must keep clear of, as boxes (viewport px), and the drone itself. */
	const droneScene = (page: Page) =>
		page.evaluate(() => {
			const box = (n: Element | null | undefined) => {
				if (!n || !n.getClientRects().length) return null
				const r = n.getBoundingClientRect()
				return r.width && r.height ? { left: r.left, top: r.top, right: r.right, bottom: r.bottom } : null
			}
			const shown = (n: Element | null | undefined) => {
				if (!n) return false
				const s = getComputedStyle(n)
				return s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.05
			}
			const out = document.getElementById('pocket-output')!
			const vg = document.querySelector('vg-guide')?.shadowRoot
			const drone = document.querySelector<HTMLElement>('.pocket-drone')
			const all = (selector: string, root: ParentNode | null | undefined = out) => [...(root?.querySelectorAll(selector) ?? [])].filter(shown).map(box).filter(Boolean) as { left: number; top: number; right: number; bottom: number }[]
			const obstacles: [string, { left: number; top: number; right: number; bottom: number }][] = []
			const add = (name: string, list: { left: number; top: number; right: number; bottom: number }[]) => list.forEach((b, i) => obstacles.push([list.length > 1 ? `${name} ${i + 1}` : name, b]))
			add("the trail's pill", all('.tr-pill', vg))
			add("the trail's card", all('.tr-card', vg))
			add('a button of the bar', all('.pocket-view__bar button'))
			add('the title block', all('.pocket-view__mark, #pocket-title, .pocket-view__lead'))
			add("the journey's band", all('.pocket-journey'))
			add('a group head', all('.pocket-group__head'))
			add('a sticker', all('.pocket-grid__item'))
			add("the guide's mic", all('.vg-mic', vg))
			add("the guide's keyboard button", all('.vg-kbd', vg))
			add("the guide's transcript bar", all('.vg-bar', vg))
			add("Vodafone's accessibility button", all('#vodafone-aw-icon', document))
			add("OneTrust's banner", all('#onetrust-banner-sdk', document))
			const clear = out.querySelector('.pocket-clear')
			return {
				drone: drone && !drone.hidden && shown(drone) ? box(drone) : null,
				anchor: drone?.dataset.droneAnchor ?? null,
				droneState: drone?.dataset.droneState ?? null,
				journey: shown(out.querySelector('.pocket-view__bar .pocket-journey-cta')),
				heads: out.querySelectorAll('.pocket-group__head').length,
				clear: shown(clear) ? box(clear) : null,
				inner: box(out.querySelector('.pocket-view__inner')),
				obstacles,
				width: document.documentElement.clientWidth,
				height: innerHeight,
			}
		})

	/** The album opened with `stickers` stickers (one by default) pocketed by presses, the actors at rest, the pointer still in the album (where it is, returned). */
	async function albumAtRest(page: Page, path: string, where: string, { stickers = 1 } = {}) {
		await open(page, path, '?aixc-debug')
		await pocketReady(page)
		const ids = (await chippedIds(page)).slice(0, stickers)
		assert.equal(ids.length, stickers, `${where}: ${stickers} card(s) to pocket on the page`)
		for (const [i, id] of ids.entries()) {
			await pocketByPress(page, id, where)
			if (i === 0) await actorsReady(page)
			await cornerShown(page)
		}
		await pressPeek(page)
		await waitView(page, 'pocket')
		// Then the pointer goes to the open album, away from the stickers and the bar, and stays there. Off every
		// sticker: one the pointer comes to rest on while he is idle turns him to it (cardDwell), and at rest his eye
		// stays on that card, not the cards' centre; on one, whether it did would hang on his ride in ending after the
		// pointer's arrival and its 350 ms dwell (1.8 s after it, alone; not always under load). With three stickers the
		// first pick (55% across) lies on the third: then the nearest point along its row clear of them all.
		const at = await page.evaluate(() => {
			const r = document.querySelector('#pocket-output .pocket-view__inner')!.getBoundingClientRect()
			const y = Math.min(innerHeight - 120, r.bottom + 420)
			const x0 = r.left + r.width * 0.55
			const MARGIN = 24
			const cards = [...document.querySelectorAll('#pocket-output .pocket-grid__item')].map((n) => n.getBoundingClientRect())
			const clear = (x: number) => !cards.some((b) => x > b.left - MARGIN && x < b.right + MARGIN && y > b.top - MARGIN && y < b.bottom + MARGIN)
			for (let d = 0; d <= r.width; d += 8) for (const x of d ? [x0 + d, x0 - d] : [x0]) if (x >= r.left + MARGIN && x <= r.right - MARGIN && clear(x)) return { x, y, clear: true }
			return { x: x0, y, clear: false }
		})
		assert.ok(at.clear, `${where}: a place in the album for the pointer clear of the stickers (${Math.round(at.x)},${Math.round(at.y)})`)
		await page.mouse.move(at.x, at.y, { steps: 4 })
		await mascotIn(page, ['idle', 'tucked'], 10_000)
		await page.waitForFunction(() => {
			const d = document.querySelector<HTMLElement>('.pocket-drone')
			return !d || d.hidden || d.dataset.droneState === 'home-hover'
		}, null, { timeout: 10_000 })
		await settle(page, 600)
		return at
	}

	for (const lang of ['en', 'ar'] as const) {
		for (const vp of [DESKTOP, { width: 1280, height: 800 }]) {
			const path = `/${lang}/services`
			const where = `${path} ${vp.width}x${vp.height} trail on`
			test(`${where}: the drone shows at the album's ${lang === 'en' ? 'right' : 'LEFT'} end, inside the viewport, clear of the pill, "Empty pocket", the bar, the title, the group head, the sticker, the mic and Vodafone's button (F6)`, { timeout: 150_000 }, async () => {
				const l = await launchLayer(gw, { viewport: vp, owl: true, initScripts: [ACTORS_TEST] })
				try {
					const seen = watch(l.page)
					await albumAtRest(l.page, path, where)
					const first = await droneScene(l.page)
					assert.equal(first.journey, true, `${where}: the bar carries "Your journey" (the trail is on)`)
					assert.ok(first.heads >= 1, `${where}: the sticker's group head shows`)
					assert.ok(first.drone, `${where}: the drone shows (data-drone-anchor ${first.anchor}, state ${first.droneState})`)
					// It hovers: read it a few times while it drifts.
					for (let i = 0; i < 8; i += 1) {
						const s = i ? await droneScene(l.page) : first
						assert.ok(s.drone, `${where}: the drone still shows (${i}; ${s.anchor} ${s.droneState}; ${seen.layer.join(' | ')}; ${seen.pageErrors.join(' | ')})`)
						const d = s.drone!
						const w = d.right - d.left
						assert.ok(d.left >= 0 && d.top >= 0 && d.right <= s.width && d.bottom <= s.height, `${where}: the drone is inside the viewport (${fmt(d)}; ${s.width}x${s.height})`)
						if (lang === 'en') assert.ok(cx(d) > s.width / 2 && d.right >= s.inner!.right - 12, `${where}: the drone is at the album's right end (${fmt(d)} vs ${Math.round(s.inner!.right)}; ${s.anchor})`)
						else assert.ok(cx(d) < s.width / 2 && d.left <= s.inner!.left + 12, `${where}: the drone is at the album's LEFT end (${fmt(d)} vs ${Math.round(s.inner!.left)}; ${s.anchor})`)
						assert.ok(w > 20, `${where}: the drone has its size (${fmt(d)})`)
						for (const [name, b] of s.obstacles) assert.equal(overlaps(d, b), false, `${where}: the drone is clear of ${name} (${fmt(d)} vs ${fmt(b)}; ${s.anchor})`)
						if (s.clear) assert.ok(gap(d, s.clear) >= 16, `${where}: the drone keeps at least 16 px from "Empty pocket" (${Math.round(gap(d, s.clear))} px)`)
						await l.page.waitForTimeout(150)
					}
					assert.deepEqual(seen.pageErrors, [], `${where}: no page errors`)
				} finally {
					await l.close()
				}
			})
		}
	}

	/* -------------------------------- the trail's consent card over the drone's home (F6b) */

	/** The trail's pill (while it shows, not tucked away) and its consent card (while open), in the guide's shadow root. */
	const trailParts = (page: Page) =>
		page.evaluate(() => {
			const r = document.querySelector('vg-guide')?.shadowRoot
			const box = (n: HTMLElement | null | undefined) => {
				if (!n || n.hidden || !n.getClientRects().length) return null
				const b = n.getBoundingClientRect()
				return b.width && b.height ? { left: b.left, top: b.top, right: b.right, bottom: b.bottom } : null
			}
			const pill = r?.querySelector<HTMLElement>('.tr-pill')
			return { pill: pill && !pill.classList.contains('tucked') ? box(pill) : null, card: box(r?.querySelector<HTMLElement>('.tr-card')) }
		})

	/** Presses the trail's pill at its middle, as a person would (floating-walk S4), then puts the pointer back in the open album. */
	async function pressPill(page: Page, where: string) {
		let { pill } = await trailParts(page)
		if (!pill) {
			// Tucked away after a scroll down: up again, as the walk does.
			await page.mouse.wheel(0, -8000)
			await settle(page, 600)
			pill = (await trailParts(page)).pill
		}
		assert.ok(pill, `${where}: the trail's pill shows in the album`)
		await page.mouse.click((pill.left + pill.right) / 2, (pill.top + pill.bottom) / 2)
		const at = await page.evaluate(() => {
			const r = document.querySelector('#pocket-output .pocket-view__inner')!.getBoundingClientRect()
			return { x: r.left + r.width * 0.55, y: Math.min(innerHeight - 120, r.bottom + 420) }
		})
		await page.mouse.move(at.x, at.y, { steps: 4 })
	}

	/**
	 * Follows the drone (every 100 ms) until it is hidden or at rest (two reads within 3 px; and within 16 px
	 * of `home`, when given), within `ms` of `since`, never over `card` when one is given. Moved, it flies
	 * (its own flight, which may cross the album on the way): returns the time it took and what it crossed.
	 */
	async function droneToRest(page: Page, where: string, since: number, ms: number, { card = null, home = null }: { card?: Box | null; home?: Box | null } = {}) {
		const crossed = new Set<string>()
		let last: Box | null = null
		for (;;) {
			const r = await droneScene(page)
			if (!r.drone) break
			if (card) assert.equal(overlaps(r.drone, card), false, `${where}: in flight the drone keeps off the card (${fmt(r.drone)} vs ${fmt(card)})`)
			for (const [name, b] of r.obstacles) if (overlaps(r.drone, b)) crossed.add(name)
			const there = !home || (Math.abs(r.drone.left - home.left) <= 16 && Math.abs(r.drone.top - home.top) <= 16)
			if (there && last && Math.abs(r.drone.left - last.left) < 3 && Math.abs(r.drone.top - last.top) < 3) break
			assert.ok(Date.now() - since < ms, `${where}: within ${ms} ms the drone is at rest (${fmt(r.drone)}; ${r.anchor})`)
			last = r.drone
			await page.waitForTimeout(100)
		}
		return { ms: Date.now() - since, crossed: crossed.size ? `, crossing ${[...crossed].join(', ')} on the way` : '' }
	}

	/** Reads the drone `times` times, 150 ms apart: it is hidden, or shows inside the viewport clear of everything it keeps clear of (the card too). */
	async function droneClear(page: Page, where: string, times: number) {
		for (let i = 0; i < times; i += 1) {
			const s = await droneScene(page)
			if (s.drone) {
				const d = s.drone
				assert.ok(d.left >= 0 && d.top >= 0 && d.right <= s.width && d.bottom <= s.height, `${where}: the drone is inside the viewport (${fmt(d)}; ${s.anchor})`)
				for (const [name, b] of s.obstacles) assert.equal(overlaps(d, b), false, `${where}: the drone is clear of ${name} (${fmt(d)} vs ${fmt(b)}; ${s.anchor} ${s.droneState}; read ${i})`)
			}
			await page.waitForTimeout(150)
		}
	}

	// 1366x900 as the finding met it (no gutter wide enough there: the drone hides); 1600x900, where the far gutter is free and it flies there.
	const CARD_CASES = [
		{ lang: 'en', vp: DESKTOP, reducedMotion: false },
		{ lang: 'en', vp: DESKTOP, reducedMotion: true },
		{ lang: 'ar', vp: DESKTOP, reducedMotion: false },
		{ lang: 'en', vp: { width: 1600, height: 900 }, reducedMotion: false },
	] as const
	for (const { lang, vp, reducedMotion } of CARD_CASES) {
		const path = `/${lang}/services`
		const where = `${path} ${vp.width}x${vp.height} trail on${reducedMotion ? ' reduced motion' : ''}`
		test(`${where}: the trail's consent card opens over the drone's home; within 2 s the drone is off it (elsewhere and clear, or hidden), and within 2 s of the card closing it is back at its home (F6b)`, { timeout: 150_000 }, async (t) => {
			const l = await launchLayer(gw, { viewport: vp, owl: true, initScripts: [ACTORS_TEST], reducedMotion })
			try {
				const seen = watch(l.page)
				await albumAtRest(l.page, path, where)
				const before = await droneScene(l.page)
				assert.ok(before.drone, `${where}: the drone shows before the card (${before.anchor} ${before.droneState})`)
				assert.equal((await trailParts(l.page)).card, null, `${where}: the trail's consent card is closed at first`)

				// The card opens from the pill; it lies where the drone hovers (the finding: [930,156,1350,560] in English).
				await pressPill(l.page, where)
				await l.page.waitForFunction(() => {
					const c = document.querySelector('vg-guide')?.shadowRoot?.querySelector<HTMLElement>('.tr-card')
					return !!c && !c.hidden && c.getClientRects().length > 0
				}, null, { timeout: 5_000 })
				const opened = Date.now()
				const card = (await trailParts(l.page)).card!
				assert.ok(overlaps(before.drone!, card), `${where}: the card lies over the drone's home, as live (${fmt(before.drone)} vs ${fmt(card)})`)
				let s = await droneScene(l.page)
				while (s.drone && overlaps(s.drone, card) && Date.now() - opened < 2_000) {
					await l.page.waitForTimeout(50)
					s = await droneScene(l.page)
				}
				assert.ok(!s.drone || !overlaps(s.drone, card), `${where}: within 2 s of the card opening the drone is off it (the drone ${fmt(s.drone)} vs card ${fmt(card)}; ${s.anchor} ${s.droneState})`)
				const off = Date.now() - opened
				// Moved elsewhere it never comes back over the card; at rest, within 4 s of the card opening, it is clear of everything.
				const away = await droneToRest(l.page, `${where} card open`, opened, 4_000, { card })
				await droneClear(l.page, `${where} card open`, 6)
				const during = await droneScene(l.page)
				t.diagnostic(`${where}: the drone at ${fmt(before.drone)} (${before.anchor}), the card ${fmt(card)}; off it ${off} ms after it showed; then ${during.drone ? `at rest at ${fmt(during.drone)} (${during.anchor}) after ${away.ms} ms${away.crossed}` : `hidden (${during.anchor})`}`)

				// The card closes from the pill: the drone comes back to its home.
				await pressPill(l.page, where)
				await l.page.waitForFunction(() => {
					const c = document.querySelector('vg-guide')?.shadowRoot?.querySelector<HTMLElement>('.tr-card')
					return !c || c.hidden
				}, null, { timeout: 5_000 })
				const closed = Date.now()
				s = await droneScene(l.page)
				while (!(s.drone && s.anchor === before.anchor) && Date.now() - closed < 2_000) {
					await l.page.waitForTimeout(50)
					s = await droneScene(l.page)
				}
				assert.ok(s.drone, `${where}: within 2 s of the card closing the drone shows (${s.anchor} ${s.droneState}; it was ${during.drone ? `at ${fmt(during.drone)} (${during.anchor})` : 'hidden'} while the card showed)`)
				assert.equal(s.anchor, before.anchor, `${where}: within 2 s of the card closing the drone is back at its home`)
				const shows = Date.now() - closed
				// At rest there within 4 s, where it hovered before the card (its drift aside), and clear of everything.
				const back = await droneToRest(l.page, `${where} card closed`, closed, 4_000, { home: before.drone })
				const home = (await droneScene(l.page)).drone
				assert.ok(home && Math.abs(home.left - before.drone!.left) <= 16 && Math.abs(home.top - before.drone!.top) <= 16, `${where}: at rest where it hovered before the card (${fmt(home)} vs ${fmt(before.drone)})`)
				t.diagnostic(`${where}: shows at its home (${s.anchor}) ${shows} ms after the card closed; at rest at ${fmt(home)} after ${back.ms} ms${back.crossed}`)
				await droneClear(l.page, `${where} card closed`, 4)
				assert.deepEqual(seen.pageErrors, [], `${where}: no page errors`)
				assert.ok(!seen.layer.some((x) => x.includes('the Pocket actors stopped')), `${where}: the actors carried on (${seen.layer.join(' | ')})`)
			} finally {
				await l.close()
			}
		})
	}

	test("/en/services 1366x900 trail on: the trail's consent card already open as the album opens, the drone waits hidden; the card closing, within 2 s it hovers at its home and plays (F6b)", { timeout: 150_000 }, async (t) => {
		const where = '/en/services 1366x900 trail on, card first'
		const l = await launchLayer(gw, { viewport: DESKTOP, owl: true, initScripts: [ACTORS_TEST] })
		try {
			const seen = watch(l.page)
			await open(l.page, '/en/services', '?aixc-debug')
			await pocketReady(l.page)
			await pocketByPress(l.page, (await chippedIds(l.page))[0], where)
			await actorsReady(l.page)
			await cornerShown(l.page)
			// The card opens on the page, then the album opens under it.
			await pressPill(l.page, where)
			await l.page.waitForFunction(() => {
				const c = document.querySelector('vg-guide')?.shadowRoot?.querySelector<HTMLElement>('.tr-card')
				return !!c && !c.hidden && c.getClientRects().length > 0
			}, null, { timeout: 5_000 })
			await pressPeek(l.page)
			await waitView(l.page, 'pocket')
			await mascotIn(l.page, ['idle', 'tucked'], 10_000)
			await settle(l.page, 600)
			const card = (await trailParts(l.page)).card
			assert.ok(card, `${where}: the card is still open over the album`)
			const first = await droneScene(l.page)
			assert.ok(!first.drone || !overlaps(first.drone, card), `${where}: the drone is not under the card (${fmt(first.drone)} vs ${fmt(card)}; ${first.anchor} ${first.droneState})`)
			// The card closes: the drone comes, at its home, and is the one that plays (its state machine is running).
			await pressPill(l.page, where)
			await l.page.waitForFunction(() => {
				const c = document.querySelector('vg-guide')?.shadowRoot?.querySelector<HTMLElement>('.tr-card')
				return !c || c.hidden
			}, null, { timeout: 5_000 })
			const closed = Date.now()
			let s = await droneScene(l.page)
			while (!(s.drone && s.droneState === 'home-hover') && Date.now() - closed < 2_000) {
				await l.page.waitForTimeout(50)
				s = await droneScene(l.page)
			}
			assert.ok(s.drone, `${where}: within 2 s of the card closing the drone shows (${s.anchor} ${s.droneState}; before ${first.drone ? fmt(first.drone) : 'hidden'})`)
			assert.equal(s.droneState, 'home-hover', `${where}: and hovers at its home, ready to play (data-drone-state)`)
			assert.equal(s.anchor, 'upper-right', `${where}: at its home on the album's right margin`)
			t.diagnostic(`${where}: ${first.drone ? `at ${fmt(first.drone)} (${first.anchor})` : `hidden (${first.anchor}, ${first.droneState})`} while the card was open; ${s.droneState} at ${fmt(s.drone)} (${s.anchor}) ${Date.now() - closed} ms after it closed`)
			await droneClear(l.page, `${where} card closed`, 4)
			assert.deepEqual(seen.pageErrors, [], `${where}: no page errors`)
		} finally {
			await l.close()
		}
	})

	/* ------------------- the guide's keyboard button and transcript bar appearing mid-album: the mascot (F6b) */

	for (const reducedMotion of [false, true]) {
		const where = `/en/services 1366x900 guide controls mid-album${reducedMotion ? ' reduced motion' : ''}`
		test(`${where}: the guide's keyboard button and transcript bar showing while the album is open, within 2 s he keeps 16 px from them; hidden again, within 2 s he is back on his margin (F6b)`, { timeout: 150_000 }, async (t) => {
			const l = await launchLayer(gw, { viewport: DESKTOP, owl: true, initScripts: [ACTORS_TEST], reducedMotion })
			try {
				const seen = watch(l.page)
				await albumAtRest(l.page, '/en/services', where)
				const plain = await scene(l.page)
				assert.equal(plain.kbd, null, `${where}: the keyboard button is not shown at first`)
				assertStand(plain, 'en', DESKTOP, `${where} before`)
				assert.ok(plain.drawn!.right >= plain.inner!.right - 12, `${where}: on his margin at first (${fmt(plain.drawn)} vs ${Math.round(plain.inner!.right)})`)
				const toggle = (on: boolean) =>
					l.page.evaluate((on) => {
						// As while the guide listens (launcher.ts): by class, fading in and out.
						const root = document.querySelector('vg-guide')!.shadowRoot!
						root.querySelector('.vg-kbd')!.classList.toggle('show', on)
						root.querySelector('.vg-bar')!.classList.toggle('hidden', !on)
					}, on)
				const clearOf = (s: Scene) => !!(s.drawn && s.kbd && s.bar && gap(s.drawn, s.kbd) >= PAD - 0.5 && gap(s.drawn, s.bar) >= PAD - 0.5)
				await toggle(true)
				const shownAt = Date.now()
				let s = await scene(l.page)
				while (!clearOf(s) && Date.now() - shownAt < 2_000) {
					await l.page.waitForTimeout(50)
					s = await scene(l.page)
				}
				assert.ok(s.kbd && s.bar, `${where}: the keyboard button and the transcript bar show`)
				assert.ok(clearOf(s), `${where}: within 2 s he keeps ${PAD} px from them (${fmt(s.drawn)} vs keyboard ${fmt(s.kbd)} and bar ${fmt(s.bar)}; ${s.state})`)
				t.diagnostic(`${where}: ${fmt(plain.drawn)} before; clear of the keyboard button ${fmt(s.kbd)} and the bar ${fmt(s.bar)} at ${fmt(s.drawn)} ${Date.now() - shownAt} ms after they showed (${s.state})`)
				await settle(l.page, 400)
				assertStand(await scene(l.page), 'en', DESKTOP, `${where} shown`)

				await toggle(false)
				const hiddenAt = Date.now()
				s = await scene(l.page)
				while (!(s.kbd === null && s.bar === null && s.drawn && s.drawn.right >= s.inner!.right - 12) && Date.now() - hiddenAt < 2_000) {
					await l.page.waitForTimeout(50)
					s = await scene(l.page)
				}
				assert.ok(s.drawn && s.drawn.right >= s.inner!.right - 12 && s.drawn.right <= s.inner!.right + 2, `${where}: within 2 s of them hiding he is back on his margin (${fmt(s.drawn)} vs ${Math.round(s.inner!.right)}; ${s.state})`)
				t.diagnostic(`${where}: back on his margin at ${fmt(s.drawn)} ${Date.now() - hiddenAt} ms after they hid`)
				assertStand(s, 'en', DESKTOP, `${where} hidden again`)
				assert.deepEqual(seen.pageErrors, [], `${where}: no page errors`)
			} finally {
				await l.close()
			}
		})
	}

	/* ------------------------------------------------------- at rest: cheap, still moving (F11) */

	/**
	 * Measured 2026-11-17 before the fix: 182 layouts and 0.333 s of script in 3 s (the drone hidden, F6), 182 and
	 * 0.469 s with the drone showing; after: 4 layouts (a drawing every 750 ms) and 0.029-0.051 s of script over six
	 * runs. The lead's bound was 0.15 s; 0.1 s keeps about twice the worst measured.
	 */
	test('/en/services 1366x900 trail on: at rest (the album open, the pointer still) the actors cost at most 6 layouts and 0.1 s of script in 3 s, and both still move (F11)', { timeout: 150_000 }, async () => {
		const where = '/en/services 1366 trail on, at rest'
		const l = await launchLayer(gw, { viewport: DESKTOP, owl: true, initScripts: [ACTORS_TEST] })
		try {
			const seen = watch(l.page)
			await albumAtRest(l.page, '/en/services', where)
			// At rest: the ride, the take-off and the remote's raise are over, and the pointer has been still.
			await l.page.waitForTimeout(3_000)
			const cdp = await l.page.context().newCDPSession(l.page)
			await cdp.send('Performance.enable')
			const metrics = async () => Object.fromEntries(((await cdp.send('Performance.getMetrics')) as { metrics: { name: string; value: number }[] }).metrics.map((m) => [m.name, m.value]))
			const looks = () =>
				l.page.evaluate(() => {
					const r = (n: Element | null | undefined) => {
						if (!n || !n.getClientRects().length) return null
						const b = n.getBoundingClientRect()
						return [b.left, b.top, b.right, b.bottom]
					}
					const d = document.querySelector<HTMLElement>('.pocket-drone')
					const shown = (n: Element) => getComputedStyle(n).display !== 'none'
					// The rotors as drawn, apart from where the drone is: per rotor, which page of its flipbook shows (computed
					// opacity 1; -1 none), how many do, and whether its own blades show (they are hidden while the flipbook turns).
					const rotors =
						d && !d.hidden
							? [...d.querySelectorAll('[data-part="rotor"]')].map((rotor) => {
									const flip = rotor.querySelector('[data-part="rotor-flip"]')
									const pages = flip && shown(flip) ? [...flip.children].map((g) => getComputedStyle(g).opacity) : []
									return { page: pages.indexOf('1'), showing: pages.filter((o) => o === '1').length, blades: [...rotor.querySelectorAll('[data-part="blades"]')].some(shown) }
								})
							: null
					return {
						mascot: r(document.querySelector('.pocket-mascot__mover > svg [data-part="outline"]')),
						board: r(document.querySelector('.pocket-mascot [data-part="board-deck"]')),
						drone: d && !d.hidden ? r(d) : null,
						rotors,
						states: [document.querySelector<HTMLElement>('.pocket-mascot')?.dataset.mascotState, d?.dataset.droneState],
					}
				})
			const before = await looks()
			// Three seconds with nothing read from the page.
			const a = await metrics()
			await l.page.waitForTimeout(3_000)
			const z = await metrics()
			await cdp.detach()
			const d = (k: string) => z[k] - a[k]
			const cost = { LayoutCount: d('LayoutCount'), RecalcStyleCount: d('RecalcStyleCount'), ScriptDuration: +d('ScriptDuration').toFixed(4), TaskDuration: +d('TaskDuration').toFixed(4), LayoutDuration: +d('LayoutDuration').toFixed(4), seconds: +d('Timestamp').toFixed(2) }
			const after = await looks()
			assert.deepEqual(after.states, before.states, `${where}: still at rest after the window (${JSON.stringify(before.states)} to ${JSON.stringify(after.states)})`)
			assert.ok(cost.LayoutCount <= 6, `${where}: at most 6 layouts in 3 s (${JSON.stringify(cost)})`)
			assert.ok(cost.ScriptDuration <= 0.1, `${where}: at most 0.1 s of script in 3 s (${JSON.stringify(cost)})`)
			// Cheap, not still: the mascot breathes and bobs on his board, the drone drifts and its rotors spin.
			assert.ok(before.drone && before.rotors?.length, `${where}: the drone and its rotors show at rest (${JSON.stringify(before.states)})`)
			const moved = { mascot: 0, drone: 0, pages: before.rotors!.map(() => new Set<number>()) }
			const span = (x: number[] | null, y: number[] | null) => (x && y ? Math.max(...x.map((v, i) => Math.abs(v - y[i]))) : 0)
			for (let i = 0; i < 12; i += 1) {
				await l.page.waitForTimeout(i < 8 ? 23 : 400)
				const now = await looks()
				moved.mascot = Math.max(moved.mascot, span(after.mascot, now.mascot), span(after.board, now.board))
				moved.drone = Math.max(moved.drone, span(after.drone, now.drone))
				assert.equal(now.rotors?.length, before.rotors!.length, `${where}: the drone's rotors at reading ${i} (${JSON.stringify(now.rotors)})`)
				now.rotors!.forEach((rotor, k) => {
					assert.equal(rotor.showing, 1, `${where}: rotor ${k} shows exactly one flipbook page at reading ${i} (${JSON.stringify(rotor)})`)
					assert.equal(rotor.blades, false, `${where}: rotor ${k}'s own blades are hidden at rest (reading ${i})`)
					moved.pages[k].add(rotor.page)
				})
			}
			assert.ok(moved.mascot >= 0.5, `${where}: the mascot moves at rest (${moved.mascot.toFixed(2)} px)`)
			assert.ok(moved.drone >= 0.5, `${where}: the drone drifts at rest (${moved.drone.toFixed(2)} px)`)
			moved.pages.forEach((pages, k) => assert.ok(pages.size >= 2, `${where}: rotor ${k} spins at rest: its page changes (pages ${[...pages].join(', ')} over 12 readings)`))
			console.log(`${where}: ${JSON.stringify({ cost, mascot: moved.mascot, drone: moved.drone, pages: moved.pages.map((p) => [...p]) })}`)
			assert.deepEqual(seen.pageErrors, [], `${where}: no page errors`)
		} finally {
			await l.close()
		}
	})

	/* ------------------------- the trail's consent card while they rest: the rest ends and starts again (F11 with F6b) */

	/** Chrome's LayoutCount and ScriptDuration over `ms`, with nothing read from the page meanwhile. */
	async function costOver(page: Page, ms: number) {
		const cdp = await page.context().newCDPSession(page)
		await cdp.send('Performance.enable')
		const metrics = async () => Object.fromEntries(((await cdp.send('Performance.getMetrics')) as { metrics: { name: string; value: number }[] }).metrics.map((m) => [m.name, m.value]))
		const a = await metrics()
		await page.waitForTimeout(ms)
		const z = await metrics()
		await cdp.detach()
		return { LayoutCount: z.LayoutCount - a.LayoutCount, ScriptDuration: +(z.ScriptDuration - a.ScriptDuration).toFixed(4) }
	}

	/** The trail's pill pressed by its own click() (no pointer move: a move alone would end the rest), then the card waited for to open (`open`) or close. */
	async function togglePillStill(page: Page, open: boolean) {
		await page.evaluate(() => document.querySelector('vg-guide')!.shadowRoot!.querySelector<HTMLElement>('.tr-pill')!.click())
		await page.waitForFunction(
			(open) => {
				const c = document.querySelector('vg-guide')?.shadowRoot?.querySelector<HTMLElement>('.tr-card')
				const shows = !!c && !c.hidden && c.getClientRects().length > 0
				return shows === open
			},
			open,
			{ timeout: 5_000 },
		)
	}

	// 1366x900 as the finding met it (no free place while the card shows: the drone hides); 1600x900, where the far gutter is free and it flies there.
	for (const vp of [DESKTOP, { width: 1600, height: 900 }]) {
		const where = `/en/services ${vp.width}x${vp.height} trail on, at rest`
		test(`${where}: the trail's consent card opening while the actors rest, within 2 s the drone is off its home (hidden, or elsewhere and clear); within 2 s of the card closing it is back at its home, and the rest starts again with it (F11 with F6b)`, { timeout: 150_000 }, async (t) => {
			const l = await launchLayer(gw, { viewport: vp, owl: true, initScripts: [ACTORS_TEST] })
			try {
				const seen = watch(l.page)
				await albumAtRest(l.page, '/en/services', where)
				if (!(await trailParts(l.page)).pill) {
					// Tucked away after the scroll to the sticker: up again, as the walk does (a wheel, no pointer move).
					await l.page.mouse.wheel(0, -8000)
					await settle(l.page, 600)
				}
				assert.ok((await trailParts(l.page)).pill, `${where}: the trail's pill shows in the album`)
				assert.equal((await trailParts(l.page)).card, null, `${where}: the trail's consent card is closed at first`)
				// The pointer has been still since albumAtRest: they rest, the drone with him.
				const resting = await restsWithin(l.page, 8_000, { drone: true })
				assert.ok(resting.on && resting.drone, `${where}: the actors rest before the card, the drone with him (${JSON.stringify(resting)})`)
				const before = await droneScene(l.page)
				assert.ok(before.drone, `${where}: the drone shows before the card (${before.anchor} ${before.droneState})`)

				// The card opens over the drone's home while they rest.
				await togglePillStill(l.page, true)
				const opened = Date.now()
				const card = (await trailParts(l.page)).card!
				assert.ok(overlaps(before.drone!, card), `${where}: the card lies over the drone's home, as live (${fmt(before.drone)} vs ${fmt(card)})`)
				let s = await droneScene(l.page)
				while (s.drone && overlaps(s.drone, card) && Date.now() - opened < 2_000) {
					await l.page.waitForTimeout(50)
					s = await droneScene(l.page)
				}
				assert.ok(!s.drone || !overlaps(s.drone, card), `${where}: within 2 s of the card opening the drone is off it (the drone ${fmt(s.drone)} vs card ${fmt(card)}; ${s.anchor} ${s.droneState})`)
				const off = Date.now() - opened
				const away = await droneToRest(l.page, `${where} card open`, opened, 4_000, { card })
				await droneClear(l.page, `${where} card open`, 6)
				const during = await droneScene(l.page)
				t.diagnostic(`${where}: the drone at ${fmt(before.drone)} (${before.anchor}) at rest, the card ${fmt(card)}; off it ${off} ms after it showed; then ${during.drone ? `at rest at ${fmt(during.drone)} (${during.anchor}) after ${away.ms} ms${away.crossed}` : `hidden (${during.anchor})`}; resting then: ${JSON.stringify(await restState(l.page))}`)

				// The card closes the same way: the drone comes back to its home.
				await togglePillStill(l.page, false)
				const closed = Date.now()
				s = await droneScene(l.page)
				while (!(s.drone && s.anchor === before.anchor) && Date.now() - closed < 2_000) {
					await l.page.waitForTimeout(50)
					s = await droneScene(l.page)
				}
				assert.ok(s.drone, `${where}: within 2 s of the card closing the drone shows (${s.anchor} ${s.droneState}; it was ${during.drone ? `at ${fmt(during.drone)} (${during.anchor})` : 'hidden'} while the card showed)`)
				assert.equal(s.anchor, before.anchor, `${where}: within 2 s of the card closing the drone is back at its home`)
				const shows = Date.now() - closed
				const back = await droneToRest(l.page, `${where} card closed`, closed, 4_000, { home: before.drone })
				const home = (await droneScene(l.page)).drone
				assert.ok(home && Math.abs(home.left - before.drone!.left) <= 16 && Math.abs(home.top - before.drone!.top) <= 16, `${where}: at rest where it hovered before the card (${fmt(home)} vs ${fmt(before.drone)})`)

				// And the rest starts again, the drone with him: cheap again.
				const again = await restsWithin(l.page, 8_000, { drone: true })
				assert.ok(again.on && again.drone, `${where}: the rest starts again after the card, the drone with him (${JSON.stringify(again)})`)
				const cost = await costOver(l.page, 3_000)
				const still = await restState(l.page)
				assert.ok(still.on && still.drone, `${where}: still at rest after the window (${JSON.stringify(still)})`)
				assert.ok(cost.LayoutCount <= 6, `${where}: at rest again, at most 6 layouts in 3 s (${JSON.stringify(cost)})`)
				t.diagnostic(`${where}: back at its home (${s.anchor}) ${shows} ms after the card closed, at rest at ${fmt(home)} after ${back.ms} ms${back.crossed}; resting again ${again.ms} ms after that; then ${JSON.stringify(cost)} in 3 s`)
				assert.deepEqual(seen.pageErrors, [], `${where}: no page errors`)
				assert.ok(!seen.layer.some((x) => x.includes('the Pocket actors stopped')), `${where}: the actors carried on (${seen.layer.join(' | ')})`)
			} finally {
				await l.close()
			}
		})
	}

	/* ------------------------------------------------ what ends a rest changes nothing behind it (F11) */

	/**
	 * Where his eye looks, in degrees of yaw: his body's turn and his eye's own (data-body-yaw, a whole degree; the
	 * iris's data-gaze, a tenth). Settled, it is the yaw toward what he looks at, however far his body may turn.
	 */
	const eyeYaw = (page: Page) =>
		page.evaluate(() => {
			const m = document.querySelector<HTMLElement>('.pocket-mascot')!
			const gaze = m.querySelector<SVGElement>('[data-gaze]')?.dataset.gaze ?? '0,0'
			return Number(m.dataset.bodyYaw) + Number(gaze.split(',')[0])
		})

	test("/en/services 1366x900 trail on, at rest: keyboard focus leaving the cards while the actors rest, within 1 s his eye is back on the cards' centre and stays there (F11)", { timeout: 150_000 }, async () => {
		const where = '/en/services 1366 trail on, at rest, focus'
		const l = await launchLayer(gw, { viewport: DESKTOP, owl: true, initScripts: [ACTORS_TEST] })
		try {
			const seen = watch(l.page)
			// Three cards: the last (the nearest him) is far enough from their centre to tell the two apart.
			await albumAtRest(l.page, '/en/services', where, { stickers: 3 })
			// The pointer still for over 12 s: his eye leaves it for the cards' centre (one tick to take it up, then settled).
			await l.page.waitForTimeout(14_000)
			const resting = await restsWithin(l.page, 8_000)
			assert.ok(resting.on, `${where}: the actors rest before the focus (${JSON.stringify(resting)})`)
			const centre = await eyeYaw(l.page)
			// Where the cards are: nothing below may move them (a scroll would move their centre too).
			const cardsAt = () => l.page.evaluate(() => [...document.querySelectorAll('#pocket-output .pocket-grid__item')].map((n) => n.getBoundingClientRect()).map((b) => `${Math.round(b.left)},${Math.round(b.top)}`).join(' '))
			const cards = await cardsAt()

			// Keyboard focus onto the last card: from a stand-in just before it (in the grid, not in a card, so it turns
			// nothing), Tab; and off it again, Shift+Tab back to the stand-in: focus leaves the cards, nothing scrolls.
			const into = await l.page.evaluate(() => {
				const stickers = [...document.querySelectorAll<HTMLElement>('#pocket-output .pocket-grid .pocket-sticker')]
				const last = stickers.at(-1)!
				const before = document.createElement('span')
				before.tabIndex = 0
				before.dataset.testBefore = ''
				before.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)'
				last.before(before)
				before.focus({ preventScroll: true })
				return stickers.length
			})
			assert.equal(into, 3, `${where}: three cards in the album`)
			await l.page.keyboard.press('Tab')
			const focused = await l.page.evaluate(() => {
				const a = document.activeElement
				const last = [...document.querySelectorAll('#pocket-output .pocket-grid .pocket-sticker')].at(-1)
				return { inLast: !!a && !!last?.contains(a), visible: !!a?.matches(':focus-visible'), on: a ? `${a.localName}.${a.className}` : null }
			})
			assert.ok(focused.inLast && focused.visible, `${where}: Tab put keyboard focus on the last card (${JSON.stringify(focused)})`)
			// He turns to it, settles, and rests looking at it.
			await l.page.waitForTimeout(1_000)
			const onCard = await restsWithin(l.page, 8_000)
			assert.ok(onCard.on, `${where}: the actors rest with the card in focus (${JSON.stringify(onCard)})`)
			const card = await eyeYaw(l.page)
			assert.ok(Math.abs(card - centre) >= 4.5, `${where}: his eye on the card is far enough from the cards' centre to tell (${card.toFixed(1)} vs ${centre.toFixed(1)})`)

			// Focus leaves the card: Shift+Tab, back to the stand-in.
			await l.page.keyboard.press('Shift+Tab')
			const left = Date.now()
			assert.equal(await l.page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset.testBefore === '' && !document.activeElement?.closest('.pocket-sticker')), true, `${where}: keyboard focus left the cards`)
			const TOLERANCE = 2.2 // the eye refixes once its target is 1.5° away; the body's yaw is read to the whole degree
			let now = await eyeYaw(l.page)
			while (Math.abs(now - centre) > TOLERANCE && Date.now() - left < 1_000) {
				await l.page.waitForTimeout(50)
				now = await eyeYaw(l.page)
			}
			const back = Date.now() - left
			assert.ok(Math.abs(now - centre) <= TOLERANCE, `${where}: within 1 s of focus leaving the cards his eye is back on their centre (${now.toFixed(1)}, the centre ${centre.toFixed(1)}, the card ${card.toFixed(1)}; ${back} ms)`)
			// And stays there, through the rest that starts again and its ticks (each would put the card back, were it saved).
			const readings: number[] = []
			for (let i = 0; i < 40; i += 1) {
				await l.page.waitForTimeout(100)
				readings.push(await eyeYaw(l.page))
			}
			const worst = Math.max(...readings.map((v) => Math.abs(v - centre)))
			assert.ok(worst <= TOLERANCE, `${where}: his eye stays on the cards' centre for 4 s after (worst ${worst.toFixed(1)} from ${centre.toFixed(1)}; the card ${card.toFixed(1)}; ${readings.map((v) => v.toFixed(1)).join(' ')})`)
			assert.equal(await cardsAt(), cards, `${where}: the cards did not move meanwhile (else their centre moved too)`)
			const again = await restState(l.page)
			console.log(`${where}: ${JSON.stringify({ centre, card, back, worst: +worst.toFixed(2), restingAgain: again.on })}`)
			assert.deepEqual(seen.pageErrors, [], `${where}: no page errors`)
		} finally {
			await l.close()
		}
	})

	test('/en/services 1366x900 trail on, at rest: a pointer move after a long rest turns him from where he was, never by more than a frame\'s turn at once (F11)', { timeout: 150_000 }, async () => {
		const where = '/en/services 1366 trail on, at rest, a move'
		const l = await launchLayer(gw, { viewport: DESKTOP, owl: true, initScripts: [ACTORS_TEST] })
		try {
			const seen = watch(l.page)
			await albumAtRest(l.page, '/en/services', where)
			// A long rest: the pointer still for over 12 s, so his body has turned back to the cards and settled.
			await l.page.waitForTimeout(14_000)
			const resting = await restsWithin(l.page, 8_000)
			assert.ok(resting.on, `${where}: the actors rest (${JSON.stringify(resting)})`)
			// Every change of his drawn yaw (data-body-yaw, written when he is drawn), from here on.
			await l.page.evaluate(() => {
				const w = window as any
				const m = document.querySelector<HTMLElement>('.pocket-mascot')!
				w.__yawFrom = Number(m.dataset.bodyYaw)
				w.__yaws = []
				w.__yawWatch = new MutationObserver((records) => {
					for (const r of records) w.__yaws.push(Number(r.oldValue))
				})
				w.__yawWatch.observe(m, { attributes: true, attributeFilter: ['data-body-yaw'], attributeOldValue: true })
			})
			// The move comes 550 ms into a rest tick (the mover's animation starts at the tick): what a catch-up from
			// the tick with the new pointer would turn him through in one drawing, the rest's run-ahead would not.
			const wait = await l.page.evaluate(() => {
				const a = document.querySelector('.pocket-mascot__mover')!.getAnimations().find((x) => !(x instanceof CSSAnimation) && !(x instanceof CSSTransition))
				const into = a && a.startTime !== null ? performance.now() - Number(a.startTime) : 0
				return Math.round((((550 - into) % 750) + 750) % 750)
			})
			const to = await l.page.evaluate(() => {
				// Beside him toward the viewport's edge, level with his eye: away from the cards, so the cursor pulls him round.
				const r = document.querySelector('.pocket-mascot__mover')!.getBoundingClientRect()
				return { x: Math.min(innerWidth - 3, r.right + 60), y: r.top + r.height * 0.4 }
			})
			await l.page.waitForTimeout(wait)
			await l.page.mouse.move(to.x, to.y)
			await l.page.waitForTimeout(2_500)
			const yaws = await l.page.evaluate(() => {
				const w = window as any
				w.__yawWatch.disconnect()
				return { from: w.__yawFrom as number, olds: w.__yaws as number[], now: Number(document.querySelector<HTMLElement>('.pocket-mascot')!.dataset.bodyYaw) }
			})
			const values = [...yaws.olds, yaws.now]
			const steps = values.slice(1).map((v, i) => Math.abs(v - values[i]))
			const turned = Math.abs(yaws.now - yaws.from)
			assert.ok(turned >= 8, `${where}: the move turned him (by ${turned}°, ${values.join(' ')}); else there is nothing to see`)
			// His yaw's spring (1.1 Hz, damping 0.78) turns him at most 0.19 of a step in its target in one drawing of 64 ms
			// (the longest frame it steps); the whole degree it is read to adds one.
			const bound = Math.ceil(0.19 * turned) + 1
			const worst = Math.max(...steps)
			assert.ok(worst <= bound, `${where}: never more than ${bound}° at once (worst ${worst}°, over ${steps.length} drawings: ${values.join(' ')}; the move ${wait} ms before a tick's 550th ms)`)
			console.log(`${where}: ${JSON.stringify({ turned, bound, worst, values })}`)
			assert.deepEqual(seen.pageErrors, [], `${where}: no page errors`)
		} finally {
			await l.close()
		}
	})

	test('/en/services 1366x900 trail on, at rest: less motion asked for while the actors rest, none of their own animations runs within 1 s (F11)', { timeout: 150_000 }, async () => {
		const where = '/en/services 1366 trail on, at rest, reduced motion'
		const l = await launchLayer(gw, { viewport: DESKTOP, owl: true, initScripts: [ACTORS_TEST] })
		try {
			const seen = watch(l.page)
			await albumAtRest(l.page, '/en/services', where)
			const resting = await restsWithin(l.page, 8_000, { drone: true })
			assert.ok(resting.on && resting.drone, `${where}: the actors rest, the drone with him (${JSON.stringify(resting)})`)
			// The actors' own animations (Web Animations they started, not the page's CSS ones) still running.
			const ours = () =>
				l.page.evaluate((ROOTS) => {
					const at = (a: Animation) => (a.effect as KeyframeEffect | null)?.target ?? null
					return document
						.getAnimations()
						.filter((a) => !(a instanceof CSSAnimation) && !(a instanceof CSSTransition) && a.playState === 'running' && !!at(a)?.closest(`${ROOTS}, .pocket-mascot`))
						.map((a) => `${at(a)!.localName}.${at(a)!.getAttribute('class') ?? at(a)!.getAttribute('data-part') ?? ''}`)
				}, ROOTS)
			const during = await ours()
			assert.ok(during.length > 0, `${where}: at rest the actors' animations run (${during.length})`)
			await l.page.emulateMedia({ reducedMotion: 'reduce' })
			const asked = Date.now()
			let left = await ours()
			while (left.length && Date.now() - asked < 1_000) {
				await l.page.waitForTimeout(50)
				left = await ours()
			}
			const stopped = Date.now() - asked
			assert.deepEqual(left, [], `${where}: within 1 s of less motion asked for, none of the actors' own animations runs (${stopped} ms; ${[...new Set(left)].join(', ')})`)
			// And none starts again.
			await l.page.waitForTimeout(1_500)
			assert.deepEqual(await ours(), [], `${where}: and none starts again`)
			assert.equal((await restState(l.page)).on, false, `${where}: the rest is over`)
			console.log(`${where}: ${JSON.stringify({ during: during.length, stopped })}`)
			assert.deepEqual(seen.pageErrors, [], `${where}: no page errors`)
		} finally {
			await l.close()
		}
	})

	/* --------------------------------------------- his board painted at rest, in WebKit as in Chromium (F11) */

	/**
	 * At rest his board's sheet moves on the compositor apart from him. WebKit (Safari, every iOS browser) kept the deck's
	 * box in its place then and painted no board there (2026-11-17: the board an HTML box running a transform inside a
	 * foreignObject of his rig), while every box read the same as Chromium's. So this decides by pixels (boardPaint):
	 * three shots of the deck's box at rest, 300 ms apart, and three out of rest (a pointer move ends it); at rest the
	 * mean board-red share must be at least half the share out of rest, which must show a board (at least 0.15).
	 * Measured 2026-11-17 before the fix, 1366x900, mean of three: Chromium 0.317 at rest, 0.323 out of rest; WebKit
	 * 0.042 at rest, 0.336 out of rest.
	 */
	test("/en/services 1366x900 trail on, at rest: his board is painted, in WebKit as in Chromium: the deck's box holds at least half the board-red pixels it holds out of rest (F11)", { timeout: 280_000 }, async (t) => {
		const found = await findWebKit()
		const shares: Record<string, { rest: number[]; awake: number[]; decks: (string | null)[] }> = {}
		for (const engine of ['chromium', 'webkit'] as const) {
			const where = `/en/services 1366x900 trail on, at rest, in ${engine === 'chromium' ? 'Chromium' : 'WebKit'}`
			if (engine === 'webkit' && 'why' in found) {
				t.diagnostic(`${where}: not run: ${found.why}`)
				continue
			}
			const o = { viewport: DESKTOP, owl: true, initScripts: [ACTORS_TEST] }
			const l = engine === 'webkit' && 'webkit' in found ? await launchLayerWebKit(found.webkit, gw, o) : await launchLayer(gw, o)
			try {
				const seen = watch(l.page)
				const still = await albumAtRest(l.page, '/en/services', where)
				const resting = await restsWithin(l.page, 8_000)
				assert.ok(resting.on, `${where}: the actors rest (${JSON.stringify(resting)})`)
				const read = { rest: [] as number[], awake: [] as number[], decks: [] as (string | null)[] }
				for (let i = 0; i < 3; i += 1) {
					const p = await boardPaint(l.page)
					read.rest.push(p.share)
					read.decks.push(p.deck)
					await l.page.waitForTimeout(300)
				}
				assert.ok((await restState(l.page)).on, `${where}: still at rest after the shots`)
				// Out of the rest: the pointer moves a little, and the rigs are drawn every frame again.
				await l.page.mouse.move(still.x + 2, still.y + 1)
				await l.page.waitForTimeout(400)
				assert.equal((await restState(l.page)).on, false, `${where}: the move ended the rest`)
				for (let i = 0; i < 3; i += 1) {
					const p = await boardPaint(l.page)
					read.awake.push(p.share)
					read.decks.push(p.deck)
					await l.page.waitForTimeout(100)
				}
				shares[engine] = read
				console.log(`${where}${engine === 'webkit' && 'from' in found ? ` (${found.from})` : ''}: ${JSON.stringify({ rest: read.rest.map((v) => +v.toFixed(4)), awake: read.awake.map((v) => +v.toFixed(4)), decks: read.decks })}`)
				assert.deepEqual(seen.pageErrors, [], `${where}: no page errors`)
				assert.deepEqual(l.reached, [], `${where}: nothing reached past the replay`)
			} finally {
				await l.close()
			}
		}
		// Both halves measured first, then judged: a regression in either shows, with the other's numbers beside it.
		const mean = (list: number[]) => list.reduce((s, v) => s + v, 0) / list.length
		const verdicts = Object.entries(shares).map(([engine, read]) => {
			const [rest, awake] = [mean(read.rest), mean(read.awake)]
			return { engine, rest: +rest.toFixed(4), awake: +awake.toFixed(4), shows: awake >= 0.15, painted: rest >= 0.5 * awake }
		})
		t.diagnostic(`board-red share of the deck's box (mean of three): ${verdicts.map((v) => `${v.engine} ${v.rest} at rest, ${v.awake} out of rest`).join('; ')}`)
		assert.ok(shares.chromium, 'the Chromium half ran')
		for (const v of verdicts) {
			assert.ok(v.shows, `${v.engine}: out of rest the deck's box shows his board (board-red share ${v.awake}, at least 0.15)`)
			assert.ok(v.painted, `${v.engine}: at rest his board is painted (board-red share of the deck's box ${v.rest} at rest, at least half of ${v.awake} out of rest)`)
		}
	})
})
