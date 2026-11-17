/**
 * The page turn on Vodafone's own pages (W2-A: findings F2 and F3 of the live run of 2026-11-17), on the
 * saved Services pages with the live-page kit (./vodafone-layer.ts): Vodafone's navigation pinned only while
 * the page is scrolled, as its own script does (in the flow at the top), and Owl's AutoRefresh stood in.
 *
 * - Turning into the album, sampled at about 10, 20, 35, 50, 65, 80 and 95% of the turn (at least three of
 *   them, past half way, when frames are slow): a press just above the live header's bottom, across its
 *   logo row, reaches Vodafone's live header, never our sheet; the copy shows nothing that is fixed on the
 *   live page (the pinned navigation, the skip link, the menu); one nav row with the logo shows in the top
 *   200 px, the live one.
 * - Turning back, at the same points: the live header shows the same way; the copy shows the pocketed card
 *   as pocketed (its liner, not the card itself), and the live liner is there in the frame the page comes
 *   back, not a frame later.
 * - Owl: while the album shows, Vodafone's carousels stay visible to jQuery, so AutoRefresh never fades them
 *   out: every card under a chip is painted in the frame the page comes back and 100 ms later, and the
 *   closing copy's carousels are not faded out either.
 *
 * TURN_SHOTS=<dir> saves a frame in the middle of each turn and the first frame back (for a report).
 */
import assert from 'node:assert/strict'
import path from 'node:path'
import { after, before, test } from 'node:test'

import type { Page } from 'playwright'

import { DESKTOP, type LayerGateway, launchLayer, open, PHONE, startLayerGateway, watch } from './vodafone-layer.ts'

const PORT = 4466
let gw: LayerGateway

before(async () => {
	gw = await startLayerGateway(PORT)
})
after(async () => {
	await gw?.close()
})

/* eslint-disable @typescript-eslint/no-explicit-any */
const CASES = [
	{ path: '/en/services', viewport: DESKTOP, liner: 'In your pocket' },
	{ path: '/en/services', viewport: PHONE, liner: 'In your pocket' },
	{ path: '/ar/services', viewport: DESKTOP, liner: 'في جيبك' },
	{ path: '/ar/services', viewport: PHONE, liner: 'في جيبك' },
]
/** pocket.js: the turn into the album and the turn back, in ms. */
const TURN_MS = { open: 1150, close: 1100 }
const SHOTS = process.env.TURN_SHOTS || ''

/** Two frames and a little more. */
const settle = (page: Page, ms = 60) => page.evaluate((ms) => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(done, ms)))), ms)

const waitView = (page: Page, view: 'page' | 'pocket') =>
	page.waitForFunction(
		(view) => {
			const s = (window as any).__aixc.demos.pocket.state
			return s.view === view && !s.busy
		},
		view,
		{ timeout: 10_000 },
	)

/** The first chipped card on Owl's stage (shown, not one of Owl's copies), brought to the middle of the screen: where its chip is. */
const owlCardChip = (page: Page) =>
	page.evaluate(async () => {
		const chips = [...document.querySelectorAll<HTMLElement>('.pocket-chips .pocket-cta[data-pocket-for]')]
		for (const chip of chips) {
			const id = chip.dataset.pocketFor!
			const card = [...document.querySelectorAll<HTMLElement>(`#main-content [data-aixc-item="${CSS.escape(id)}"]`)].find((c) => !c.closest('.owl-item.cloned'))
			if (!card?.closest('.owl-item.active')) continue
			card.scrollIntoView({ block: 'center', inline: 'nearest' })
			await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(done, 60))))
			const r = chip.getBoundingClientRect()
			const x = r.left + r.width / 2
			const y = r.top + r.height / 2
			const at = document.elementFromPoint(x, y)
			return { id, x, y, hit: !!at && (at === chip || chip.contains(at)) }
		}
		return null
	})

/**
 * Samples the turn (`kind`) from inside the page, on animation frames, at about 10 to 95% of it,
 * and (closing) the frame the page view comes back and 100 ms later. What our layers paint takes part in
 * hit testing only for the probe, inside one frame's script: they never take a press on the page.
 */
const armTurn = (page: Page, kind: 'open' | 'close', liner: string, duration: number) =>
	page.evaluate(
		({ kind, liner, duration }) => {
			const w = window as any
			const probe = { start: 0, samples: [] as any[], landing: null as any, later: null as any }
			w.__turnProbe = probe
			const describe = (n: Element | null) => {
				if (!n) return 'none'
				const cls = String((n as any).className?.baseVal ?? (n as any).className ?? '').trim().split(/\s+/).slice(0, 3).join('.')
				return `${n.localName}${cls ? `.${cls}` : ''}`
			}
			const ours = (n: Element | null) => !!n?.closest('.pocket-layer')
			const shown = (n: Element) => n.checkVisibility({ visibilityProperty: true, opacityProperty: true } as any)
			const center = (n: Element) => {
				const r = n.getBoundingClientRect()
				return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height, r }
			}
			const sample = (at: number) => {
				// Reads: the live header's bottom where its box touches the top of the screen.
				let headerBottom = 0
				for (const n of [document.getElementById('header'), document.getElementById('nav-header')]) {
					const b = n?.getBoundingClientRect()
					if (b && b.top <= 0.5 && b.bottom > 0) headerBottom = Math.max(headerBottom, b.bottom)
				}
				const copy = document.querySelector('.pocket-layer .curl-snapshot')
				const css = document.createElement('style')
				// Only what paints: what the curl's windows hold (the copy, the paper, the shades, the shadows) and its bands,
				// each cut by its window; never a window or a box itself, which draw nothing.
				css.textContent = '.pocket-layer .curl-box *, .pocket-layer .curl-band { pointer-events: auto !important }'
				const inert = [...document.querySelectorAll<HTMLElement>('.pocket-layer [inert]')]
				for (const n of inert) n.inert = false
				document.head.append(css)
				try {
					const y = headerBottom - 3
					const row = headerBottom > 0
						? [0.1, 0.3, 0.5, 0.7, 0.9].map((f) => {
								const x = Math.round(innerWidth * f)
								const hit = document.elementFromPoint(x, y)
								return { x, live: !!hit?.closest('#header') && !ours(hit), what: describe(hit) }
							})
						: []
					// Vodafone's nav row (the logo's) and every copy of it in the top 200 px: shown where a probe across it reaches it.
					const rows = [...document.querySelectorAll('.nav-header')].flatMap((nav) => {
						const r = nav.getBoundingClientRect()
						const ny = Math.min(199, Math.max(1, r.top + r.height / 2))
						if (!r.width || !r.height || r.bottom <= 0 || r.top >= 200) return []
						const xs = Array.from({ length: 9 }, (_, i) => Math.round(Math.max(0, r.left) + ((Math.min(innerWidth, r.right) - Math.max(0, r.left)) * (i + 0.5)) / 9))
						const hits = xs.map((x) => document.elementFromPoint(x, ny))
						const reached = hits.filter((hit) => !!hit && nav.contains(hit)).length
						return [{ live: !ours(nav), seen: reached > 0, reached, top: Math.round(r.top), what: [...new Set(hits.map(describe))].slice(0, 3) }]
					})
					const fixedShown = copy
						? [...copy.querySelectorAll('*')]
								.filter((n) => {
									if (getComputedStyle(n).position !== 'fixed' || !shown(n)) return false
									const r = n.getBoundingClientRect()
									return r.width > 0 && r.height > 0
								})
								.map(describe)
						: null
					const out: any = { at, headerBottom: Math.round(headerBottom), row, rows, fixedShown, copies: document.querySelectorAll('.curl-snapshot').length }
					if (kind === 'close' && copy) {
						out.linerShown = [...copy.querySelectorAll('.pocket-liner__text')].filter((n) => n.textContent?.trim() === liner && shown(n)).length
						out.owlHidden = copy.querySelectorAll('.owl-carousel.owl-hidden').length
						const card = copy.querySelector('[data-turn-probe="card"]')
						if (card) {
							const c = center(card)
							const hit = document.elementFromPoint(c.x, c.y)
							out.card = { inCopy: !!hit && copy.contains(hit), liner: !!hit?.closest('.pocket-liner'), own: !!hit && card.contains(hit), what: describe(hit) }
							const slot = copy.querySelector('.pocket-chips .pocket-host.is-pocketed')
							const s = slot?.getBoundingClientRect()
							out.slotOff = s ? [s.left - c.r.left, s.top - c.r.top, s.width - c.r.width, s.height - c.r.height].map((v) => Math.round(v * 10) / 10) : null
							out.cardBox = [c.r.left, c.r.top, c.r.width, c.r.height].map(Math.round)
						}
					}
					probe.samples.push(out)
				} finally {
					css.remove()
					for (const n of inert) n.inert = true
				}
			}
			/** The page as it comes back: the live liner, and the cards under the chips (painted: visible, not faded out by Owl). */
			const back = () => {
				const root = document.querySelector<HTMLElement>('.pocket-chips')
				const liners = [...document.querySelectorAll('.pocket-chips .pocket-host.is-pocketed .pocket-liner__text')].filter((n) => n.textContent?.trim() === liner)
				const slots = [...document.querySelectorAll<HTMLElement>('.pocket-chips > .pocket-host')].filter((s) => !s.hidden && !('cut' in s.dataset))
				const cards = slots.map((s) => {
					const id = s.querySelector<HTMLElement>('.pocket-cta')?.dataset.pocketFor ?? ''
					const card = [...document.querySelectorAll<HTMLElement>(`#main-content [data-aixc-item="${CSS.escape(id)}"]`)].find((c) => !c.closest('.owl-item.cloned'))
					let opacity = 1
					for (let n: Element | null = card ?? null; n; n = n.parentElement) opacity *= +getComputedStyle(n).opacity
					return { id, owl: !!card?.closest('.owl-carousel'), faded: !!card?.closest('.owl-carousel.owl-hidden'), opacity, seen: !!card && shown(card) }
				})
				const live = liners.find(shown)
				let linerOnTop = false
				if (live) {
					// The liner lets presses through to the card (only Put back takes the pointer): for the probe only, it takes part.
					const css = document.createElement('style')
					css.textContent = '.pocket-chips .pocket-liner, .pocket-chips .pocket-liner * { pointer-events: auto !important }'
					document.head.append(css)
					const c = center(live)
					const hit = document.elementFromPoint(c.x, c.y)
					css.remove()
					linerOnTop = !!hit && !!hit.closest('.pocket-liner') && !ours(hit)
				}
				return {
					rootShown: !!root && !root.hidden,
					linerShown: !!live,
					linerOnTop,
					chipped: cards.length,
					onOwl: cards.filter((c) => c.owl).length,
					unpainted: cards.filter((c) => c.faded || c.opacity < 1 || !c.seen).map((c) => `${c.id}${c.faded ? ' (owl-hidden)' : ''} opacity ${c.opacity}${c.seen ? '' : ', not visible'}`),
				}
			}
			// One sample per frame at most, at the first frame past each point (a slow frame passes several), with the turn's real progress.
			const AT = [0.1, 0.2, 0.35, 0.5, 0.65, 0.8, 0.95]
			let next = 0
			const frame = () => {
				const done = probe.start ? (performance.now() - probe.start) / duration : 0
				if (probe.start && next < AT.length && done >= AT[next]) {
					sample(Math.round(Math.min(1, done) * 100) / 100)
					while (next < AT.length && done >= AT[next]) next++
				}
				if (next < AT.length && !probe.landing) requestAnimationFrame(frame)
			}
			requestAnimationFrame(frame)
			// The turn's tween starts at the end of the script that starts the turn: a microtask after it.
			if (kind === 'open') {
				const seen = new MutationObserver(() => {
					if (document.body.dataset.pocketView === 'open' && !probe.start) {
						probe.start = performance.now()
						seen.disconnect()
					}
				})
				seen.observe(document.body, { attributes: true, attributeFilter: ['data-pocket-view'] })
			} else {
				const album = document.getElementById('pocket-output')!
				const view = (event: Event) => {
					const detail = (event as CustomEvent).detail
					if (detail === 'closing') queueMicrotask(() => (probe.start = performance.now()))
					if (detail === 'page') {
						album.removeEventListener('pocket:view', view)
						// What the frame the page comes back paints: the end of the script that gave it back.
						queueMicrotask(() => {
							probe.landing = back()
							setTimeout(() => (probe.later = back()), 100)
						})
					}
				}
				album.addEventListener('pocket:view', view)
			}
		},
		{ kind, liner, duration },
	)

const turnProbe = (page: Page) => page.evaluate(() => (window as any).__turnProbe as { start: number; samples: any[]; landing: any; later: any })

/** Starts a turn and, with TURN_SHOTS, saves the frame in its middle. */
async function turn(page: Page, kind: 'open' | 'close', shot: string | null) {
	await page.evaluate((kind) => {
		const p = (window as any).__aixc.demos.pocket
		void (kind === 'open' ? p.open() : p.close())
	}, kind)
	if (SHOTS && shot) {
		await page.waitForTimeout(TURN_MS[kind] * 0.5)
		await page.screenshot({ path: path.join(SHOTS, `${shot}-${kind}-mid.png`) })
	}
	await waitView(page, kind === 'open' ? 'pocket' : 'page')
}

/** The live header's checks on one sample: a press across its logo row reaches it; one nav row shows, the live one. */
function headerShows(s: any, where: string) {
	assert.ok(s.headerBottom > 0, `${where}: Vodafone's header is at the top of the screen (${s.headerBottom})`)
	assert.deepEqual(
		s.row.filter((x: any) => !x.live).map((x: any) => `${x.x}: ${x.what}`),
		[],
		`${where}: a press just above the live header's bottom (y ${s.headerBottom - 3}) reaches Vodafone's header, never our sheet`,
	)
	assert.deepEqual(
		s.rows.filter((x: any) => x.seen).map((x: any) => (x.live ? 'live' : `a copy at y ${x.top}`)),
		['live'],
		`${where}: one nav row with the logo shows in the top 200 px, the live one (${JSON.stringify(s.rows)})`,
	)
}

type Case = (typeof CASES)[number]

/**
 * The layer on `c.path` with a card on Owl's stage pocketed through its chip, then brought to the middle of
 * the screen with Vodafone's navigation pinned; opens the album (sampled), keeps it open longer than one of
 * AutoRefresh's polls, and marks the pocketed card for the probe of the turn back (a test attribute).
 */
async function intoAlbum(c: Case, where: string, shot: string | null) {
	const l = await launchLayer(gw, { viewport: c.viewport, owl: true, owlAutoRefresh: true, fixedHeader: 'scroll' })
	try {
		const seen = watch(l.page)
		await open(l.page, c.path, '?aixc-debug')
		await l.page.waitForFunction(() => (window as any).__aixc?.demos?.pocket?.chips, null, { timeout: 15_000 })
		await l.page.evaluate(async () => {
			const { store } = (window as any).__aixc.demos.pocket
			await store.ready
			await store.clear()
		})
		await settle(l.page, 200)
		const chip = await owlCardChip(l.page)
		assert.ok(chip?.hit, `${where}: a chipped card on Owl's stage, its chip pressable (${JSON.stringify(chip)})`)
		await l.page.mouse.click(chip.x, chip.y)
		await l.page.waitForFunction((id) => (window as any).__aixc.demos.pocket.store.all().some((r: any) => r.id === id), chip.id, { timeout: 5_000 })
		await l.page.waitForSelector('.pocket-peek[data-state="shown"]', { timeout: 5_000 })
		await l.page.waitForFunction(() => document.querySelectorAll('.curl-host--flying').length === 0, null, { timeout: 8_000 })
		await settle(l.page, 900)
		const at = await l.page.evaluate(async (id) => {
			const card = [...document.querySelectorAll<HTMLElement>(`#main-content [data-aixc-item="${CSS.escape(id)}"]`)].find((x) => !x.closest('.owl-item.cloned'))!
			card.scrollIntoView({ block: 'center', inline: 'nearest' })
			await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(done, 120))))
			const r = card.getBoundingClientRect()
			return { y: scrollY, pinned: document.getElementById('nav-header')!.classList.contains('nav-fixed'), onScreen: r.top >= 0 && r.bottom <= innerHeight, pocketed: !!document.querySelector('.pocket-chips .pocket-host.is-pocketed') }
		}, chip.id)
		assert.deepEqual([at.y > 0, at.pinned, at.onScreen, at.pocketed], [true, true, true, true], `${where}: scrolled (${at.y}), the navigation pinned, the pocketed card on screen with its liner`)

		await armTurn(l.page, 'open', c.liner, TURN_MS.open)
		await turn(l.page, 'open', shot)
		const opened = await turnProbe(l.page)
		console.log(`${where} into the album`, JSON.stringify(opened.samples.map((s) => ({ at: s.at, hb: s.headerBottom, row: s.row.filter((x: any) => !x.live).length, rows: s.rows, fixed: s.fixedShown }))))
		await l.page.waitForTimeout(700)
		await l.page.evaluate((id) => {
			const card = [...document.querySelectorAll<HTMLElement>(`#main-content [data-aixc-item="${CSS.escape(id)}"]`)].find((x) => !x.closest('.owl-item.cloned'))!
			card.dataset.turnProbe = 'card'
		}, chip.id)
		return { l, seen, opened }
	} catch (error) {
		await l.close()
		throw error
	}
}

/** Turns back to the page, sampled; the frame it comes back and 100 ms later. */
async function backToPage(l: Awaited<ReturnType<typeof intoAlbum>>['l'], c: Case, where: string, shot: string | null) {
	await armTurn(l.page, 'close', c.liner, TURN_MS.close)
	await turn(l.page, 'close', shot)
	if (SHOTS && shot) await l.page.screenshot({ path: path.join(SHOTS, `${shot}-back.png`) })
	await l.page.waitForFunction(() => (window as any).__turnProbe.later, null, { timeout: 5_000 })
	const closed = await turnProbe(l.page)
	console.log(`${where} back to the page`, JSON.stringify({ samples: closed.samples.map((s) => ({ at: s.at, hb: s.headerBottom, row: s.row.filter((x: any) => !x.live).length, rows: s.rows, fixed: s.fixedShown, liner: s.linerShown, owlHidden: s.owlHidden, card: s.card, slotOff: s.slotOff, cardBox: s.cardBox })), landing: closed.landing, later: closed.later }))
	assert.ok(closed.samples.length >= 3 && closed.samples.at(-1).at >= 0.5, `${where}: the turn back was sampled (${closed.samples.map((s) => s.at).join(', ')})`)
	return closed
}

for (const c of CASES) {
	const where = `${c.path} ${c.viewport.width}`
	const shot = `${c.path.split('/')[1]}-${c.viewport.width}`

	test(`${where}: turning into the album, Vodafone's live header shows once and is never covered; the copy shows nothing fixed on the live page (W2-A: F2a)`, async () => {
		const { l, seen, opened } = await intoAlbum(c, where, shot)
		try {
			assert.ok(opened.samples.length >= 3 && opened.samples.at(-1).at >= 0.5, `${where}: the turn into the album was sampled (${opened.samples.map((s) => s.at).join(', ')})`)
			for (const s of opened.samples) {
				const w = `${where} into the album at ${s.at * 100}%`
				assert.equal(s.copies, 1, `${w}: one frozen copy`)
				headerShows(s, w)
				assert.deepEqual(s.fixedShown, [], `${w}: the copy shows nothing that is fixed on the live page`)
			}
			assert.deepEqual(seen.pageErrors, [], `${where}: no page errors`)
		} finally {
			await l.close()
		}
	})

	test(`${where}: turning back, the live header shows; the copy shows the pocketed card's liner, and the live liner is there the frame the page comes back (W2-A: F2b)`, async () => {
		const { l, seen } = await intoAlbum(c, where, null)
		try {
			const closed = await backToPage(l, c, where, shot)
			for (const s of closed.samples) {
				const w = `${where} back to the page at ${s.at * 100}%`
				assert.equal(s.copies, 1, `${w}: one frozen copy`)
				headerShows(s, w)
				assert.deepEqual(s.fixedShown, [], `${w}: the copy shows nothing that is fixed on the live page`)
				assert.ok(s.linerShown > 0, `${w}: the copy shows the pocketed card's liner ("${c.liner}")`)
				if (s.card?.inCopy) assert.deepEqual([s.card.liner, s.card.own], [true, false], `${w}: on the copy, the pocketed card's middle is its liner, not the card (${s.card.what})`)
			}
			assert.ok(closed.samples.some((s) => s.card?.inCopy), `${where}: the pocketed card's middle is on the turning copy in at least one sample (${JSON.stringify(closed.samples.map((s) => s.card))})`)
			const lands = closed.landing
			assert.deepEqual([lands.rootShown, lands.linerShown, lands.linerOnTop], [true, true, true], `${where}: the frame the page comes back, the live liner shows (${JSON.stringify(lands)})`)
			assert.deepEqual(seen.pageErrors, [], `${where}: no page errors`)
			assert.deepEqual(l.reached, [], `${where}: nothing reached the internet`)
		} finally {
			await l.close()
		}
	})

	test(`${where}: with Owl's AutoRefresh, the cards under the chips are painted the frame the page comes back and 100 ms later, and in the closing copy (W2-A: F3)`, async () => {
		const { l, seen } = await intoAlbum(c, where, null)
		try {
			const closed = await backToPage(l, c, where, null)
			for (const s of closed.samples) assert.equal(s.owlHidden, 0, `${where} back to the page at ${s.at * 100}%: the copy's carousels are not faded out (owl-hidden)`)
			for (const [when, b] of [
				['the frame the page comes back', closed.landing],
				['100 ms later', closed.later],
			] as const) {
				assert.ok(b.chipped > 0 && b.onOwl > 0, `${where}, ${when}: chips over Owl's cards (${b.chipped}, ${b.onOwl} on Owl's stage)`)
				assert.deepEqual(b.unpainted, [], `${where}, ${when}: every card under a chip is painted`)
			}
			assert.deepEqual(seen.pageErrors, [], `${where}: no page errors`)
		} finally {
			await l.close()
		}
	})
}
