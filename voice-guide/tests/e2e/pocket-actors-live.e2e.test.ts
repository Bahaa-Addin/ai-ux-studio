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
 */
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'

import type { Page } from 'playwright'

import { DESKTOP, type LayerGateway, launchLayer, open, PHONE, startLayerGateway, watch } from './vodafone-layer.ts'

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
		const drawn = union([box(svg?.querySelector('[data-part="outline"]')), box(svg?.querySelector('[data-part="board-deck"]'))])
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
