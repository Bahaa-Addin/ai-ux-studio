/**
 * The sticker peel on Vodafone's own pages (W3-B: findings F7b and F10 of the live run of 2026-11-17), on the
 * saved Services pages with the live-page kit (./vodafone-layer.ts), Owl's layout stood in, English and Arabic,
 * at 1366×900 and 375×812. A card is lifted and pocketed through its chip, as a person would.
 *
 * What a flying sticker paints is read on every frame from inside the page: every band of ./curl.js that shows
 * (the sticker's flat and lift layers, inside its host) mapped to the screen through its own transform, its
 * clipping box, the plane's clip, the lift's perspective and the host's own transform (the throw's translate,
 * rotation and scale): a polygon per band, and their union.
 *
 * - F7b: hovering a card's chip lifts the card's corner on the chip's side (its folded part's middle in the
 *   card's right half in English, left half in Arabic, where the chip is), and pocketing it peels from there
 *   (the first frame the folded part paints).
 * - A Stay In Control card flies as before: during the peel, what it paints stays within its own box and 40 px
 *   around it, past the reach its diagonal fold has by its shape (an ordinary card peels along its diagonal, as
 *   before W3-B, which lays its far corner H(W²−H²)/(W²+H²) past its long edge at half way: 74 px for 248×120,
 *   whose peel reached 59 px past its box by 560 ms on the code before W3-B). A long card (pocket.js isStrip)
 *   has no such reach.
 * - F10: Vodafone Cash, the full-width band: from the press to the end of the lift what it paints never
 *   extends more than 40 px beyond the band's own box; from the end of the lift to the landing it is at most
 *   420 px wide. Its peel starts on its chip's side too.
 *
 * PEEL_SHOTS=<dir> saves a frame in the middle of Vodafone Cash's lift (for a report).
 */
import assert from 'node:assert/strict'
import path from 'node:path'
import { after, before, test } from 'node:test'

import type { Page } from 'playwright'

import { DESKTOP, type LayerGateway, launchLayer, open, PHONE, startLayerGateway, watch } from './vodafone-layer.ts'

const PORT = 4470
let gw: LayerGateway

before(async () => {
	gw = await startLayerGateway(PORT)
})
after(async () => {
	await gw?.close()
})

/* eslint-disable @typescript-eslint/no-explicit-any */
const CASES = [
	{ path: '/en/services', viewport: DESKTOP, side: 'right' },
	{ path: '/en/services', viewport: PHONE, side: 'right' },
	{ path: '/ar/services', viewport: DESKTOP, side: 'left' },
	{ path: '/ar/services', viewport: PHONE, side: 'left' },
] as const
/** pocket.js: the peel, then the lift, in ms from the press; a frame either side of each end is not judged. */
const PEEL_MS = 560
const LIFT_END = 560 + 520
const MARGIN = 40
/** How far what a sticker paints may reach beyond its card while it is on the page, and how wide it may be once lifted. */
const SLACK = 40
const LIFTED_WIDTH = 420
const SHOTS = process.env.PEEL_SHOTS || ''

type Box = { left: number; top: number; right: number; bottom: number }
type Sample = { t: number; hosts: number; box: Box | null; folded: { x: number; y: number; box: Box } | null; transform: string | null }

/** Two frames and a little more. */
const settle = (page: Page, ms = 60) => page.evaluate((ms) => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(done, ms)))), ms)

const fmt = (b: Box | null | undefined) => (b ? `[${[b.left, b.top, b.right, b.bottom].map((v) => Math.round(v)).join(',')}]` : 'none')

/**
 * In the page: window.__peel.start(selector) samples, on every animation frame (read after the frame, with
 * the frame's time since the last press), what the curl hosts matching `selector` paint; stop() returns the samples.
 */
const SAMPLER = `(() => {
	if (window.__peel) return
	const r2 = (v) => Math.round(v * 10) / 10
	const matrixOf = (n) => {
		const tf = getComputedStyle(n).transform
		return tf && tf !== 'none' ? new DOMMatrix(tf) : new DOMMatrix()
	}
	const rectPoly = (w, h) => [[0, 0], [w, 0], [w, h], [0, h]]
	const area2 = (poly) => {
		let a = 0
		for (let i = 0; i < poly.length; i++) a += poly[i][0] * poly[(i + 1) % poly.length][1] - poly[(i + 1) % poly.length][0] * poly[i][1]
		return a
	}
	// Sutherland-Hodgman: the part of the subject polygon inside the convex polygon clip.
	const clipBy = (subject, clip) => {
		let res = subject
		const sgn = area2(clip) >= 0 ? 1 : -1
		for (let i = 0; i < clip.length && res.length; i++) {
			const p = clip[i]
			const q = clip[(i + 1) % clip.length]
			const side = (r) => sgn * ((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]))
			const next = []
			for (let k = 0; k < res.length; k++) {
				const a = res[k]
				const b = res[(k + 1) % res.length]
				const sa = side(a)
				const sb = side(b)
				if (sa >= 0) next.push(a)
				if (sa >= 0 !== sb >= 0) {
					const f = sa / (sa - sb)
					next.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f])
				}
			}
			res = next
		}
		return res
	}
	const through = (mx, poly) =>
		poly.map((p) => {
			const r = mx.transformPoint(new DOMPoint(p[0], p[1], 0, 1))
			return [r.x / r.w, r.y / r.w, r.z / r.w]
		})
	const opacityTo = (n, top) => {
		let o = 1
		for (let p = n; p && p !== top.parentElement; p = p.parentElement) o *= Number(getComputedStyle(p).opacity)
		return o
	}
	/** A host's own box to the screen: its transform about its origin, at its place (fixed: left and top; else its box). */
	const hostMatrix = (host) => {
		const s = getComputedStyle(host)
		if (s.transform === 'none') {
			const r = host.getBoundingClientRect()
			return new DOMMatrix().translateSelf(r.left, r.top)
		}
		const [ox, oy] = s.transformOrigin.split(' ').map(parseFloat)
		return new DOMMatrix().translateSelf(parseFloat(s.left), parseFloat(s.top)).translateSelf(ox, oy).multiplySelf(new DOMMatrix(s.transform)).translateSelf(-ox, -oy)
	}
	/** The polygons a curl root (.curl-plane or .curl-lift) in \`host\` paints, on the screen; \`only\` keeps some bands. */
	const paintedBy = (root, host, only) => {
		const rs = getComputedStyle(root)
		const lift = root.classList.contains('curl-lift')
		const persp = lift ? parseFloat(rs.perspective) : NaN
		const origin = rs.perspectiveOrigin.split(' ').map(parseFloat)
		const toScreen = hostMatrix(host)
		const screen = rectPoly(innerWidth, innerHeight)
		const polys = []
		for (const band of root.querySelectorAll('.curl-win, .curl-band')) {
			if (band.parentElement && band.parentElement.closest('.curl-win')) continue
			if (only && !band.matches(only)) continue
			const bs = getComputedStyle(band)
			if (bs.visibility !== 'visible' || bs.display === 'none' || opacityTo(band, host) <= 0.02) continue
			if (!band.offsetWidth || !band.offsetHeight) continue
			let local = rectPoly(band.offsetWidth, band.offsetHeight)
			const box = band.querySelector(':scope > .curl-box')
			if (box) local = clipBy(local, through(matrixOf(box), rectPoly(box.offsetWidth, box.offsetHeight)).map((p) => [p[0], p[1]]))
			if (local.length < 3) continue
			// A band of the lift's own is seen in its perspective; one inside a flattened wrapper lies flat.
			const flat = !lift || band.parentElement !== root || !(persp > 0)
			let poly = through(matrixOf(band), local).map((p) => (flat ? [p[0], p[1]] : [origin[0] + ((p[0] - origin[0]) * persp) / (persp - p[2]), origin[1] + ((p[1] - origin[1]) * persp) / (persp - p[2])]))
			if (!lift) poly = clipBy(poly, rectPoly(root.offsetWidth, root.offsetHeight))
			poly = clipBy(through(toScreen, poly).map((p) => [p[0], p[1]]), screen)
			if (poly.length >= 3 && Math.abs(area2(poly)) > 2) polys.push(poly)
		}
		return polys
	}
	const boxOf = (polys) => {
		const pts = polys.flat()
		return pts.length ? { left: r2(Math.min(...pts.map((p) => p[0]))), top: r2(Math.min(...pts.map((p) => p[1]))), right: r2(Math.max(...pts.map((p) => p[0]))), bottom: r2(Math.max(...pts.map((p) => p[1]))) } : null
	}
	/** The area-weighted middle of some polygons. */
	const middleOf = (polys) => {
		let a = 0
		let x = 0
		let y = 0
		for (const poly of polys) {
			for (let i = 0; i < poly.length; i++) {
				const [x0, y0] = poly[i]
				const [x1, y1] = poly[(i + 1) % poly.length]
				const c = x0 * y1 - x1 * y0
				a += c
				x += (x0 + x1) * c
				y += (y0 + y1) * c
			}
		}
		return Math.abs(a) > 1e-6 ? { x: r2(x / (3 * a)), y: r2(y / (3 * a)) } : null
	}
	let pressAt = performance.now()
	document.addEventListener('click', () => (pressAt = performance.now()), true)
	let run = null
	window.__peel = {
		start: (selector) => {
			const samples = []
			run = { samples, on: true }
			const mine = run
			const frame = (now) => {
				if (!mine.on) return
				// Read once the frame is drawn: every tween of this frame has run, whatever their order.
				setTimeout(() => {
					if (!mine.on) return
					const hosts = [...document.querySelectorAll(selector)]
					const all = []
					const folded = []
					for (const host of hosts)
						for (const root of host.querySelectorAll(':scope > .curl-plane, :scope > .curl-lift')) {
							all.push(...paintedBy(root, host, null))
							if (root.classList.contains('curl-lift')) folded.push(...paintedBy(root, host, '.curl-strip, .curl-flap'))
						}
					const middle = middleOf(folded)
					samples.push({ t: Math.round(now - pressAt), hosts: hosts.length, box: boxOf(all), folded: middle ? { ...middle, box: boxOf(folded) } : null, transform: hosts[0] ? getComputedStyle(hosts[0]).transform : null })
				}, 0)
				requestAnimationFrame(frame)
			}
			requestAnimationFrame(frame)
		},
		stop: () => {
			if (!run) return []
			run.on = false
			return run.samples
		},
	}
})()`

async function pocketReady(page: Page) {
	await page.waitForFunction(() => (window as any).__aixc?.demos?.pocket?.chips, null, { timeout: 15_000 })
	await page.evaluate(async () => {
		const { store } = (window as any).__aixc.demos.pocket
		await store.ready
		await store.clear()
	})
	await settle(page, 200)
	await page.evaluate(SAMPLER)
}

/**
 * Brings card `id` (or the first chipped card of the section titled `section` that is wholly on screen) to the
 * middle of the screen; its box, its chip's middle and whether a press there reaches the chip.
 */
const cardAt = (page: Page, o: { id?: string; section?: string }) =>
	page.evaluate(async ({ id, section }) => {
		const sections = ((window as any).__aixc.model?.sections ?? []) as any[]
		const ids = id ? [id] : (sections.find((s) => (s.title?.text ?? s.title) === section)?.items ?? []).map((i: any) => i.id)
		const tick = () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(done, 120))))
		for (const one of ids) {
			const chip = document.querySelector<HTMLElement>(`.pocket-chips .pocket-cta[data-pocket-for="${CSS.escape(one)}"]`)
			const card = [...document.querySelectorAll<HTMLElement>(`#main-content [data-aixc-item="${CSS.escape(one)}"]`)].find((c) => !c.closest('.owl-item.cloned'))
			if (!chip || !card) continue
			card.scrollIntoView({ block: 'center', inline: 'nearest' })
			await tick()
			const r = card.getBoundingClientRect()
			const c = chip.getBoundingClientRect()
			if (!r.width || r.left < -0.5 || r.right > innerWidth + 0.5 || r.top < 0 || r.bottom > innerHeight || !c.width) continue
			const x = c.left + c.width / 2
			const y = c.top + c.height / 2
			const hit = document.elementFromPoint(x, y)
			return { id: one, card: { left: r.left, top: r.top, right: r.right, bottom: r.bottom }, x, y, hit: !!hit && (hit === chip || chip.contains(hit)), chipSide: x < r.left + r.width / 2 ? 'left' : 'right' }
		}
		return null
	}, o)

const sampling = (page: Page, selector: string) => page.evaluate((selector) => (window as any).__peel.start(selector), selector)
const samplesNow = (page: Page) => page.evaluate(() => (window as any).__peel.stop() as Sample[])

/** Which half of the card a point is in. */
const halfOf = (x: number, card: Box) => (x < (card.left + card.right) / 2 ? 'left' : 'right')
const beyond = (b: Box, card: Box) => Math.max(card.left - b.left, card.top - b.top, b.right - card.right, b.bottom - card.bottom)

/** Hovers the chip (the lift: sampled), then presses it (the trip: sampled until the sticker has landed). */
async function liftAndPocket(page: Page, at: NonNullable<Awaited<ReturnType<typeof cardAt>>>, where: string, shot: string | null = null) {
	await page.mouse.move(at.x, at.y - 120)
	await settle(page)
	await sampling(page, '.curl-host--inside')
	await page.mouse.move(at.x, at.y)
	await page.waitForTimeout(420)
	const lift = await samplesNow(page)
	await sampling(page, '.curl-host--flying')
	await page.mouse.down()
	await page.mouse.up()
	if (SHOTS && shot) {
		await page.waitForTimeout(820)
		await page.screenshot({ path: path.join(SHOTS, `${shot}-lift.png`) })
	}
	await page.waitForFunction((id) => (window as any).__aixc.demos.pocket.store.all().some((r: any) => r.id === id), at.id, { timeout: 5_000 })
	await page.waitForFunction(() => document.querySelectorAll('.curl-host--flying').length === 0, null, { timeout: 8_000 })
	await settle(page)
	const trip = (await samplesNow(page)).filter((s) => s.hosts > 0)
	console.log(`${where} ${at.id}: card ${fmt(at.card)}, chip on the ${at.chipSide}`)
	console.log(`${where} lift`, JSON.stringify(lift.filter((s) => s.folded).slice(0, 3).map((s) => ({ t: s.t, folded: s.folded, box: fmt(s.box) }))))
	console.log(`${where} trip`, JSON.stringify(trip.map((s) => ({ t: s.t, box: fmt(s.box), beyond: s.box ? Math.round(beyond(s.box, at.card)) : null, w: s.box ? Math.round(s.box.right - s.box.left) : null }))))
	return { lift, trip }
}

/** The first frame whose folded part paints lies on the chip's side of the card, the side the page's language puts it. */
function foldsOnChipSide(samples: Sample[], at: NonNullable<Awaited<ReturnType<typeof cardAt>>>, side: string, what: string) {
	const first = samples.find((s) => s.folded)
	assert.ok(first, `${what}: a frame paints the folded part (${samples.length} frames)`)
	assert.equal(at.chipSide, side, `${what}: the chip is on the card's ${side} half`)
	assert.equal(halfOf(first.folded!.x, at.card), side, `${what}: at ${first.t} ms the folded part's middle (${first.folded!.x}, ${first.folded!.y}; ${fmt(first.folded!.box)}) is in the card's ${side} half, with the chip (card ${fmt(at.card)})`)
}

for (const c of CASES) {
	const where = `${c.path} ${c.viewport.width}`
	const shot = `${c.path.split('/')[1]}-${c.viewport.width}`

	test(`${where}: a Stay In Control card lifts and peels from its chip's side (F7b), and what it paints stays within its box and ${SLACK} px during the peel`, { timeout: 120_000 }, async () => {
		const l = await launchLayer(gw, { viewport: c.viewport, owl: true })
		try {
			const seen = watch(l.page)
			await open(l.page, c.path, '?aixc-debug')
			await pocketReady(l.page)
			const title = c.path.startsWith('/ar/') ? 'اتحكم في حسابك' : 'Stay In Control'
			const at = await cardAt(l.page, { section: title })
			assert.ok(at?.hit, `${where}: a Stay In Control card wholly on screen, its chip pressable (${JSON.stringify(at)})`)
			const { lift, trip } = await liftAndPocket(l.page, at, `${where} Stay In Control`)
			foldsOnChipSide(lift, at, c.side, `${where} hovering the chip`)
			foldsOnChipSide(trip, at, c.side, `${where} pocketing`)
			const peel = trip.filter((s) => s.t <= PEEL_MS - MARGIN && s.box)
			assert.ok(peel.length >= 3, `${where}: the peel was sampled (${peel.length} frames)`)
			const w = at.card.right - at.card.left
			const h = at.card.bottom - at.card.top
			const long = w > 2.5 * h || w > 0.6 * c.viewport.width
			const [a, b] = [Math.max(w, h), Math.min(w, h)]
			const reach = long ? 0 : (b * (a * a - b * b)) / (a * a + b * b)
			const most = SLACK + reach
			console.log(`${where} Stay In Control: ${Math.round(w)}×${Math.round(h)}, ${long ? 'a long card' : `an ordinary card, its diagonal fold reaching ${Math.round(reach)} px`}; the peel reaches ${Math.max(...peel.map((s) => Math.round(beyond(s.box!, at.card))))} px past its box`)
			for (const s of peel) assert.ok(beyond(s.box!, at.card) <= most, `${where} at ${s.t} ms of the peel: what the sticker paints ${fmt(s.box)} reaches ${Math.round(beyond(s.box!, at.card))} px beyond its card ${fmt(at.card)} (at most ${Math.round(most)})`)
			assert.deepEqual(seen.pageErrors, [], `${where}: no page errors`)
		} finally {
			await l.close()
		}
	})

	test(`${where}: Vodafone Cash, the full-width band, is pocketed as a sticker-sized piece: within its box and ${SLACK} px until it is lifted, at most ${LIFTED_WIDTH} px wide from then on (F10)`, { timeout: 120_000 }, async () => {
		const l = await launchLayer(gw, { viewport: c.viewport, owl: true })
		try {
			const seen = watch(l.page)
			await open(l.page, c.path, '?aixc-debug')
			await pocketReady(l.page)
			const at = await cardAt(l.page, { id: 'vodafone-cash' })
			assert.ok(at?.hit, `${where}: Vodafone Cash wholly on screen, its chip pressable (${JSON.stringify(at)})`)
			const { trip } = await liftAndPocket(l.page, at, `${where} Vodafone Cash`, shot)
			foldsOnChipSide(trip, at, c.side, `${where} pocketing Vodafone Cash`)
			const onPage = trip.filter((s) => s.t <= LIFT_END - MARGIN && s.box)
			const lifted = trip.filter((s) => s.t >= LIFT_END + MARGIN && s.box)
			assert.ok(onPage.length >= 6 && lifted.length >= 3, `${where}: the peel and lift (${onPage.length} frames) and the throw (${lifted.length}) were sampled`)
			const far = onPage.filter((s) => beyond(s.box!, at.card) > SLACK).map((s) => `${s.t} ms: ${fmt(s.box)} (${Math.round(beyond(s.box!, at.card))} px)`)
			assert.deepEqual(far, [], `${where}: during the peel and the lift what the band paints stays within its box ${fmt(at.card)} and ${SLACK} px`)
			const wide = lifted.filter((s) => s.box!.right - s.box!.left > LIFTED_WIDTH).map((s) => `${s.t} ms: ${fmt(s.box)} (${Math.round(s.box!.right - s.box!.left)} px wide)`)
			assert.deepEqual(wide, [], `${where}: from the end of the lift to the landing what flies is at most ${LIFTED_WIDTH} px wide`)
			assert.deepEqual(seen.pageErrors, [], `${where}: no page errors`)
		} finally {
			await l.close()
		}
	})
}
