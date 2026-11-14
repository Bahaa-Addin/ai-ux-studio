/**
 * The Pocket's corner on Vodafone's own pages (live plan phase 3, S11; ADR-0064), on the saved Services
 * pages with the live-page kit (./vodafone-layer.ts): the accessibility widget and OneTrust's banner
 * stood in, in their real shape and place.
 *
 * Nothing of Vodafone's moves (AGENTS.md 4.6), and the Voice Guide's microphone keeps its own place
 * above the accessibility button: the Pocket takes the page's bottom-left corner instead, physical left
 * in English and in Arabic. The half-turned corner, the round Pocket button, the flight of a pocketed
 * sticker and the turn that opens the album all use that corner.
 *
 * - Nothing pocketed: no Pocket button; the accessibility button and the microphone as with ?aixc=off.
 * - A card pocketed (motion off and on): the Pocket button at the bottom-left with the count, pressable,
 *   clear of the accessibility button and the guide's buttons; those keep their ?aixc=off place and
 *   styles with the corner shown, mid-turn, in the album and after Back; no --vg-lift.
 * - The turn curls from the bottom-left (about 142 degrees at rest, toward 168 as it turns); Back gives
 *   the page back and focus to the Pocket button.
 * - The flight lands in the Pocket button and stays on screen; the count goes up.
 * - OneTrust's banner and filter are never covered; under them the Pocket button cannot be pressed, and
 *   once they go it can.
 * - Presses on Vodafone's page reach Vodafone's elements; nothing is written on the widget or the mic.
 * - A failure leaves the accessibility button and the microphone as with ?aixc=off.
 * - Arabic: the tooltip opens to the right of the button; the count shows, on screen.
 */
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'

import type { Page } from 'playwright'

import { DESKTOP, furniture, type LayerGateway, launchLayer, open, PHONE, startLayerGateway, watch } from './vodafone-layer.ts'

const PORT = 4491
let gw: LayerGateway

before(async () => {
	gw = await startLayerGateway(PORT)
})
after(async () => {
	await gw?.close()
})

/* eslint-disable @typescript-eslint/no-explicit-any */
const CASES = [
	{ path: '/en/services', viewport: DESKTOP },
	{ path: '/en/services', viewport: PHONE },
	{ path: '/ar/services', viewport: DESKTOP },
	{ path: '/ar/services', viewport: PHONE },
]
/** OneTrust's banner and filter (vodafone-layer.ts BANNER_STAND_IN). */
const BANNER_Z = 2147483645
const DEG = 180 / Math.PI

type Box = { x: number; y: number; w: number; h: number }
const meets = (a: Box | null, b: Box | null) => !!a && !!b && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

/** Two frames and a little more. */
const settle = (page: Page, ms = 60) => page.evaluate((ms) => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(done, ms)))), ms)

/**
 * Vodafone's accessibility button and the Voice Guide's buttons as the page's styles place them: boxes,
 * computed place and styles, inline style attributes, and the guide's --vg-lift.
 */
const fixed = (page: Page) =>
	page.evaluate(() => {
		const box = (el: Element | null | undefined) => {
			if (!el) return null
			const r = el.getBoundingClientRect()
			return r.width && r.height ? { x: r.x, y: r.y, w: r.width, h: r.height } : null
		}
		const aw = document.getElementById('vodafone-aw-icon')
		const vg = document.querySelector('vg-guide')
		const mic = vg?.shadowRoot?.querySelector('.vg-mic') ?? null
		const s = aw ? getComputedStyle(aw) : null
		const m = mic ? getComputedStyle(mic) : null
		return {
			aw: aw && s ? { box: box(aw), bottom: s.bottom, right: s.right, left: s.left, transition: s.transition, zIndex: s.zIndex, style: aw.getAttribute('style') } : null,
			mic: mic && m ? { box: box(mic), bottom: m.bottom, right: m.right, transition: m.transition, zIndex: m.zIndex, style: mic.getAttribute('style') } : null,
			// Laid out even while hidden (opacity 0), so their places are checked too.
			kbd: box(vg?.shadowRoot?.querySelector('.vg-kbd')),
			bar: box(vg?.shadowRoot?.querySelector('.vg-bar')),
			lift: vg ? getComputedStyle(vg).getPropertyValue('--vg-lift').trim() : null,
			liftInline: vg instanceof HTMLElement ? vg.style.getPropertyValue('--vg-lift') : null,
		}
	})
type Fixed = Awaited<ReturnType<typeof fixed>>

/** The accessibility button and the microphone exactly as with ?aixc=off; no --vg-lift. */
function asServed(now: Fixed, off: Fixed, where: string) {
	assert.ok(off.aw && off.mic, `${where}: the stand-in and the mic are on the page with the layer off`)
	assert.deepEqual(now.aw, off.aw, `${where}: the accessibility button is as Vodafone serves it`)
	assert.deepEqual(now.mic, off.mic, `${where}: the microphone is in its own place`)
	assert.deepEqual([now.kbd, now.bar], [off.kbd, off.bar], `${where}: the guide's keyboard button and transcript bar in their own places`)
	assert.ok(now.lift === '' || parseFloat(now.lift!) === 0, `${where}: --vg-lift stays unset (${now.lift})`)
	assert.equal(now.liftInline, '', `${where}: nothing writes --vg-lift on the guide`)
}

/** The Pocket's button: its box, whether a press at its centre reaches it, its count, side and tooltip. */
const peek = (page: Page) =>
	page.evaluate(() => {
		const b = document.querySelector<HTMLElement>('.pocket-peek[data-state="shown"]')
		if (!b) return null
		const r = b.getBoundingClientRect()
		const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
		const tip = b.querySelector('.pocket-peek__tip')!.getBoundingClientRect()
		const count = b.querySelector<HTMLElement>('.pocket-peek__count')!
		const c = count.getBoundingClientRect()
		return {
			box: { x: r.x, y: r.y, w: r.width, h: r.height },
			onTop: !!at && (at === b || b.contains(at)),
			at: at ? `${at.localName}#${at.id}.${at.className}` : 'none',
			side: b.dataset.side ?? null,
			count: count.hidden ? null : count.textContent,
			countBox: { x: c.x, y: c.y, w: c.width, h: c.height, shown: !count.hidden && getComputedStyle(count).display !== 'none' },
			tip: { x: tip.x, y: tip.y, w: tip.width, h: tip.height, opacity: +getComputedStyle(b.querySelector('.pocket-peek__tip')!).opacity },
			zIndex: getComputedStyle(b).zIndex,
		}
	})

/** The live Pocket's state: the view, and the direction of the page curl in degrees (the rig's own). */
const pocketState = (page: Page) =>
	page.evaluate((DEG) => {
		const s = (window as any).__aixc.demos.pocket.state
		const phi = s.peek?.rig?.state?.phi
		return { view: s.view as string, busy: s.busy as boolean, phi: typeof phi === 'number' ? phi * DEG : null, restPhi: typeof s.peek?.phi === 'number' ? s.peek.phi * DEG : null }
	}, DEG)

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

/** Brings card `id` to the middle of the screen and returns where its chip is, and whether a press there reaches it. */
const chipAt = (page: Page, id: string) =>
	page.evaluate(async (id) => {
		const card = [...document.querySelectorAll<HTMLElement>(`#main-content [data-aixc-item="${CSS.escape(id)}"]`)].find((c) => !c.closest('.owl-item.cloned'))!
		card.scrollIntoView({ block: 'center', inline: 'nearest' })
		await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(done, 60))))
		const chip = document.querySelector<HTMLElement>(`.pocket-chips .pocket-cta[data-pocket-for="${CSS.escape(id)}"]`)!
		const r = chip.getBoundingClientRect()
		const x = r.left + r.width / 2
		const y = r.top + r.height / 2
		const at = document.elementFromPoint(x, y)
		return { x, y, hit: !!at && (at === chip || chip.contains(at)) }
	}, id)

const pocketed = (page: Page, id: string) => page.waitForFunction((id) => (window as any).__aixc.demos.pocket.store.all().some((r: any) => r.id === id), id, { timeout: 5_000 })

/** Pockets card `id` with a press at its chip, and waits until the store has it. */
async function pocketByPress(page: Page, id: string, where: string) {
	const at = await chipAt(page, id)
	assert.equal(at.hit, true, `${where}: a press at ${id}'s chip reaches it`)
	await page.mouse.click(at.x, at.y)
	await pocketed(page, id)
}

const waitView = (page: Page, view: 'page' | 'pocket') =>
	page.waitForFunction(
		(view) => {
			const s = (window as any).__aixc.demos.pocket.state
			return s.view === view && !s.busy
		},
		view,
		{ timeout: 10_000 },
	)

/** The corner shown and still: nothing flying, the button's bump done. */
async function cornerShown(page: Page) {
	await page.waitForSelector('.pocket-peek[data-state="shown"]', { timeout: 5_000 })
	await page.waitForFunction(() => document.querySelectorAll('.curl-host--flying').length === 0, null, { timeout: 8_000 })
	await settle(page, 900)
}

/** Watches the accessibility button's and the microphone's style attributes for any write. */
const watchWrites = (page: Page) =>
	page.evaluate(() => {
		const w = window as any
		w.__writes = []
		const mic = document.querySelector('vg-guide')?.shadowRoot?.querySelector('.vg-mic')
		const vg = document.querySelector('vg-guide')
		const observer = new MutationObserver((list) => {
			for (const m of list) w.__writes.push(`${(m.target as Element).id || (m.target as Element).className || (m.target as Element).localName} ${m.attributeName}`)
		})
		for (const n of [document.getElementById('vodafone-aw-icon'), mic, vg]) if (n) observer.observe(n, { attributes: true, attributeFilter: ['style'] })
	})
const writes = (page: Page) => page.evaluate(() => (window as any).__writes as string[])

/** Points on Vodafone's page a person might press, away from the floating buttons, and what a press there reaches. */
const vodafonePresses = (page: Page) =>
	page.evaluate(async () => {
		const tick = () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(done, 60))))
		const avoid = [...document.querySelectorAll('#vodafone-aw-icon, .pocket-peek, vg-guide, .pocket-chips .pocket-cta')].map((n) => {
			const r = n.getBoundingClientRect()
			return { left: r.left - 4, top: r.top - 4, right: r.right + 4, bottom: r.bottom + 4 }
		})
		const vg = document.querySelector('vg-guide')?.shadowRoot
		for (const n of vg ? [...vg.querySelectorAll('*')] : []) {
			const r = n.getBoundingClientRect()
			if (r.width && r.height) avoid.push({ left: r.left - 4, top: r.top - 4, right: r.right + 4, bottom: r.bottom + 4 })
		}
		const clear = (x: number, y: number) => x > 0 && y > 0 && x < innerWidth && y < innerHeight && !avoid.some((a) => x >= a.left && x <= a.right && y >= a.top && y <= a.bottom)
		const press = (el: Element | null) => {
			if (!el) return { found: false, reached: false, what: 'none' }
			const r = el.getBoundingClientRect()
			const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
			return { found: true, reached: !!at && (at === el || el.contains(at)), what: at ? `${at.localName}.${at.className}` : 'none' }
		}
		const pick = (selector: string) =>
			[...document.querySelectorAll(selector)].find((el) => {
				const r = el.getBoundingClientRect()
				return r.width > 4 && r.height > 4 && (el as HTMLElement).checkVisibility?.({ visibilityProperty: true }) !== false && clear(r.left + r.width / 2, r.top + r.height / 2)
			}) ?? null
		const y0 = scrollY
		scrollTo(0, 0)
		await tick()
		const header = press(pick('#header a[href], .nav-header a[href]'))
		// A card that is not pocketed: a pocketed one wears the Pocket's "Put back" liner.
		const kept = new Set(((window as any).__aixc.demos.pocket.store.all() as { id: string }[]).map((r) => r.id))
		const card = [...document.querySelectorAll<HTMLElement>('#main-content [data-aixc-item]')].find((c) => !c.closest('.owl-item.cloned') && c.checkVisibility() && !kept.has(c.dataset.aixcItem!))!
		card.scrollIntoView({ block: 'center' })
		await tick()
		const r = card.getBoundingClientRect()
		// The card's middle: the chip sits in a corner.
		const middle = document.elementFromPoint(r.left + r.width / 2, r.top + r.height * 0.6)
		const cardPress = { found: true, reached: !!middle && (middle === card || card.contains(middle)), what: middle ? `${middle.localName}.${middle.className}` : 'none' }
		// The bottom-left corner, where the curl lies, beside the Pocket's button.
		const corner = [
			[130, innerHeight - 40],
			[40, innerHeight - 110],
			[150, innerHeight - 120],
		].map(([x, y]) => {
			const at = document.elementFromPoint(x, y)
			return { x, y, ours: !!at?.closest('.pocket-layer, .curl-host, .pocket-album--under'), what: at ? `${at.localName}.${at.className}` : 'none' }
		})
		scrollTo(0, document.documentElement.scrollHeight)
		await tick()
		const footer = press(pick('footer a[href]'))
		scrollTo(0, y0)
		await tick()
		return { header, card: cardPress, footer, corner }
	})

/** Every element of ours (the layer's nodes and what they hold), with a z-index at or above `z`. */
const oursAtOrAbove = (page: Page, z: number) =>
	page.evaluate(
		(z) =>
			[...document.querySelectorAll('[data-aixc], [data-aixc] *')]
				.map((n) => ({ n, z: parseInt(getComputedStyle(n).zIndex, 10) }))
				.filter((x) => Number.isFinite(x.z) && x.z >= z)
				.map((x) => `${x.n.localName}.${x.n.className} ${x.z}`),
		z,
	)

/** Opens the album with a press at the Pocket button, as a person would. */
async function pressPeek(page: Page) {
	const p = await peek(page)
	assert.ok(p, 'the Pocket button shows')
	await page.mouse.click(p.box.x + p.box.w / 2, p.box.y + p.box.h / 2)
}

/** Back from the album with its own button. */
const pressBack = (page: Page) => page.locator('#pocket-output .pocket-view__bar .pocket-back').click()

for (const motion of [false, true]) {
	for (const c of CASES) {
		const where = `${c.path} ${c.viewport.width}${motion ? ' motion' : ''}`
		test(`${where}: nothing pocketed, no Pocket button and Vodafone's widget as served; pocketed, the button at the bottom-left, the widget and the mic in their own places in every state; presses reach Vodafone (S11)`, async () => {
			const l = await launchLayer(gw, { viewport: c.viewport, owl: true, reducedMotion: !motion })
			try {
				const seen = watch(l.page)
				await open(l.page, c.path, '?aixc=off')
				await settle(l.page, 400)
				const off = await fixed(l.page)
				await open(l.page, c.path, '?aixc-debug')
				await pocketReady(l.page)
				await watchWrites(l.page)

				// (a) Nothing pocketed.
				assert.equal(await peek(l.page), null, `${where}: no Pocket button with nothing pocketed`)
				asServed(await fixed(l.page), off, `${where} empty`)

				// (b) A card pocketed through its chip.
				const id = (await chippedIds(l.page))[0]
				assert.ok(id, `${where}: chips are drawn`)
				await pocketByPress(l.page, id, where)
				await cornerShown(l.page)
				const p = (await peek(l.page))!
				assert.ok(p, `${where}: the Pocket button shows`)
				assert.equal(p.count, '1', `${where}: it counts the sticker`)
				assert.equal(p.side, 'left', `${where}: the corner is on the left`)
				const { width, height } = c.viewport
				assert.ok(p.box.x >= 0 && p.box.x <= 40, `${where}: its left edge within 40 px of the viewport's left (${p.box.x})`)
				assert.ok(height - (p.box.y + p.box.h) >= 0 && height - (p.box.y + p.box.h) <= 40, `${where}: its bottom within 40 px of the viewport's bottom (${p.box.y + p.box.h} of ${height})`)
				assert.equal(p.onTop, true, `${where}: a press at its centre reaches it (${p.at})`)
				const f = await fixed(l.page)
				asServed(f, off, `${where} pocketed`)
				const boxes: [string, Box | null][] = [
					['the Pocket button', p.box],
					['the accessibility button', f.aw!.box],
					['the microphone', f.mic!.box],
					['the keyboard button', f.kbd],
					['the transcript bar', f.bar],
				]
				for (const [i, [a, ab]] of boxes.entries()) for (const [b, bb] of boxes.slice(i + 1)) assert.equal(meets(ab, bb), false, `${where}: ${a} and ${b} do not meet`)
				assert.ok(p.box.x + p.box.w < width / 2, `${where}: the Pocket button is on the left half`)

				// (h) The tooltip opens to the right of the button, and the count shows on screen.
				await l.page.locator('.pocket-peek').hover()
				await settle(l.page, 400)
				const h = (await peek(l.page))!
				assert.ok(h.tip.opacity > 0.9, `${where}: the tooltip shows on hover`)
				assert.ok(h.tip.x >= h.box.x + h.box.w, `${where}: the tooltip opens to the right of the button (${h.tip.x} vs ${h.box.x + h.box.w})`)
				assert.ok(h.tip.x + h.tip.w <= width, `${where}: the tooltip stays on screen`)
				assert.equal(h.countBox.shown, true, `${where}: the count shows`)
				assert.ok(h.countBox.x >= 0 && h.countBox.y >= 0 && h.countBox.x + h.countBox.w <= width && h.countBox.y + h.countBox.h <= height, `${where}: the count is on screen`)
				await l.page.mouse.move(width / 2, height / 3)
				await settle(l.page, 400)

				// (f) Presses on Vodafone's page, the corner shown.
				const v = await vodafonePresses(l.page)
				assert.equal(v.header.found && v.header.reached, true, `${where}: a press at a header link reaches it (${v.header.what})`)
				assert.equal(v.card.reached, true, `${where}: a press on a card reaches it (${v.card.what})`)
				assert.equal(v.footer.found && v.footer.reached, true, `${where}: a press at a footer link reaches it (${v.footer.what})`)
				assert.deepEqual(v.corner.filter((x) => x.ours), [], `${where}: the curl takes no press beside the Pocket button`)
				await settle(l.page, 400)

				// The album, through the Pocket button: mid-turn, open, and Back.
				await pressPeek(l.page)
				if (motion) {
					await l.page.waitForTimeout(450)
					const mid = await pocketState(l.page)
					assert.equal(mid.busy, true, `${where}: sampled mid-turn`)
					asServed(await fixed(l.page), off, `${where} mid-turn`)
				}
				await waitView(l.page, 'pocket')
				await settle(l.page, 400)
				asServed(await fixed(l.page), off, `${where} album`)
				await pressBack(l.page)
				await waitView(l.page, 'page')
				await cornerShown(l.page)
				asServed(await fixed(l.page), off, `${where} back`)
				assert.equal(await l.page.evaluate(() => document.activeElement?.classList.contains('pocket-peek')), true, `${where}: Back gives focus to the Pocket button`)
				assert.deepEqual(await writes(l.page), [], `${where}: nothing is written inline on the accessibility button, the mic or the guide`)
				assert.deepEqual(seen.pageErrors, [], `${where}: no page errors`)
			} finally {
				await l.close()
			}
		})
	}
}

for (const c of CASES) {
	const where = `${c.path} ${c.viewport.width}`
	test(`${where}: the corner curls from the bottom-left, the turn opens the album from there, and a sticker flies into the Pocket button on screen (S11)`, async () => {
		const l = await launchLayer(gw, { viewport: c.viewport, owl: true })
		try {
			const seen = watch(l.page)
			await open(l.page, c.path, '?aixc-debug')
			await pocketReady(l.page)
			const { width, height } = c.viewport
			const ids = await chippedIds(l.page)
			assert.ok(ids.length >= 2, `${where}: chips are drawn`)

			// (d) The flight, sampled on every frame.
			const at = await chipAt(l.page, ids[0])
			assert.equal(at.hit, true, `${where}: a press at the chip reaches it`)
			const plain = {
				left: await l.page.screenshot({ clip: { x: 0, y: height - 30, width: 30, height: 30 } }),
				right: await l.page.screenshot({ clip: { x: width - 30, y: height - 30, width: 30, height: 30 } }),
			}
			await l.page.evaluate(() => {
				const w = window as any
				w.__flight = []
				const frame = () => {
					const host = document.querySelector<HTMLElement>('.curl-host--flying')
					if (host) {
						// The sticker's middle: the host turns and scales about it (pocket.js place()), so its screen
						// place is the host's corner, plus the origin, plus the translation. On the card, before the
						// throw, the host's own middle.
						const r = host.getBoundingClientRect()
						const origin = host.style.transformOrigin.match(/(-?[\d.]+)px (-?[\d.]+)px/)
						const move = host.style.transform.match(/translate\((-?[\d.e-]+)px, (-?[\d.e-]+)px\)/)
						const at = origin && move ? { x: parseFloat(host.style.left) + +origin[1] + +move[1], y: parseFloat(host.style.top) + +origin[2] + +move[2] } : { x: r.left + r.width / 2, y: r.top + r.height / 2 }
						w.__flight.push({ ...at, opacity: +getComputedStyle(host).opacity })
					} else if (w.__flight.length) return
					requestAnimationFrame(frame)
				}
				requestAnimationFrame(frame)
			})
			await l.page.mouse.click(at.x, at.y)
			await l.page.waitForFunction(() => document.querySelectorAll('.curl-host--flying').length > 0, null, { timeout: 3_000 })
			await cornerShown(l.page)
			await pocketed(l.page, ids[0])
			const flight = await l.page.evaluate(() => (window as any).__flight as { x: number; y: number; opacity: number }[])
			const p = (await peek(l.page))!
			assert.ok(flight.length > 10, `${where}: the flight was sampled (${flight.length} frames)`)
			const end = flight.at(-1)!
			assert.ok(end.x >= p.box.x && end.x <= p.box.x + p.box.w && end.y >= p.box.y && end.y <= p.box.y + p.box.h, `${where}: the sticker ends inside the Pocket button (${Math.round(end.x)},${Math.round(end.y)} in ${JSON.stringify(p.box)})`)
			const off = flight.filter((s) => s.x < 0 || s.y < 0 || s.x > width || s.y > height)
			assert.deepEqual(off, [], `${where}: the sticker stays on screen`)
			assert.equal(p.count, '1', `${where}: the count goes up`)

			// (c) At rest the corner curls toward the bottom-left.
			const rest = await pocketState(l.page)
			assert.ok(rest.phi !== null && Math.abs(rest.phi - 142) < 0.5, `${where}: the curl points to the bottom-left at rest (${rest.phi})`)
			assert.ok(rest.restPhi !== null && Math.abs(rest.restPhi - 142) < 0.5, `${where}: the peek rests at 142 degrees (${rest.restPhi})`)
			const shown = {
				left: await l.page.screenshot({ clip: { x: 0, y: height - 30, width: 30, height: 30 } }),
				right: await l.page.screenshot({ clip: { x: width - 30, y: height - 30, width: 30, height: 30 } }),
			}
			assert.equal(shown.left.equals(plain.left), false, `${where}: the curl is drawn in the bottom-left corner`)
			assert.equal(shown.right.equals(plain.right), true, `${where}: nothing is drawn in the bottom-right corner`)

			// A second sticker: the count goes up again.
			const second = await chipAt(l.page, ids[1])
			await l.page.mouse.click(second.x, second.y)
			await pocketed(l.page, ids[1])
			await cornerShown(l.page)
			assert.equal((await peek(l.page))?.count, '2', `${where}: two stickers counted`)

			// The turn, sampled on every frame: from 142 toward 168 degrees.
			await l.page.evaluate((DEG) => {
				const w = window as any
				w.__phis = []
				const frame = () => {
					const s = w.__aixc.demos.pocket.state
					const phi = s.peek?.rig?.state?.phi
					if (typeof phi === 'number') w.__phis.push(phi * DEG)
					if (s.view === 'pocket' && !s.busy) return
					requestAnimationFrame(frame)
				}
				requestAnimationFrame(frame)
			}, DEG)
			await pressPeek(l.page)
			await waitView(l.page, 'pocket')
			const phis = await l.page.evaluate(() => (window as any).__phis as number[])
			assert.ok(phis.length > 5, `${where}: the turn was sampled (${phis.length})`)
			assert.ok(Math.abs(phis[0] - 142) < 1, `${where}: the turn starts at 142 degrees (${phis[0]})`)
			assert.ok(Math.max(...phis) > 160 && Math.max(...phis) <= 168.01, `${where}: the turn moves toward 168 degrees (${Math.max(...phis)})`)
			assert.ok(phis.every((x) => x >= 141.5 && x <= 168.01), `${where}: the page turns from the bottom-left all the way`)
			assert.equal(await l.page.evaluate(() => !document.getElementById('pocket-output')!.hidden), true, `${where}: the album shows`)
			await pressBack(l.page)
			await waitView(l.page, 'page')
			await cornerShown(l.page)
			assert.equal(await l.page.evaluate(() => document.getElementById('main-content')!.hidden), false, `${where}: Back returns the page`)
			assert.equal(await l.page.evaluate(() => document.activeElement?.classList.contains('pocket-peek')), true, `${where}: focus goes to the Pocket button`)
			assert.ok(Math.abs(((await pocketState(l.page)).phi ?? 0) - 142) < 0.5, `${where}: the corner rests at the bottom-left again`)
			assert.deepEqual(seen.pageErrors, [], `${where}: no page errors`)
		} finally {
			await l.close()
		}
	})
}

for (const c of CASES) {
	const where = `${c.path} ${c.viewport.width} banner`
	test(`${where}: OneTrust's banner and filter stay on top and untouched; the Pocket button under them cannot be pressed, and can once they go (S11)`, async () => {
		const l = await launchLayer(gw, { viewport: c.viewport, owl: true, reducedMotion: true, banner: true })
		try {
			const seen = watch(l.page)
			await open(l.page, c.path, '?aixc=off')
			await settle(l.page, 400)
			const offBanner = await furniture(l.page)
			assert.equal(offBanner.banner?.visible, true, `${where}: the banner shows`)
			await open(l.page, c.path, '?aixc-debug')
			await pocketReady(l.page)
			// The filter is over the page: a screen reader's press pockets the card.
			const id = (await chippedIds(l.page))[0]
			await l.page.evaluate((id) => document.querySelector<HTMLElement>(`.pocket-chips .pocket-cta[data-pocket-for="${CSS.escape(id)}"]`)!.click(), id)
			await pocketed(l.page, id)
			await cornerShown(l.page)
			const fb = await furniture(l.page)
			assert.deepEqual([fb.banner, fb.filter], [offBanner.banner, offBanner.filter], `${where}: the banner's and the filter's boxes are untouched, and nothing covers them`)
			assert.equal(fb.banner?.onTop, true, `${where}: a press at the banner's centre reaches the banner`)
			assert.deepEqual(await oursAtOrAbove(l.page, BANNER_Z), [], `${where}: nothing of ours is at or above the banner's z-index`)
			const p = (await peek(l.page))!
			assert.ok(p, `${where}: the Pocket button shows`)
			assert.equal(p.onTop, false, `${where}: the Pocket button cannot be pressed under the banner (${p.at})`)
			assert.match(p.at, /onetrust/, `${where}: a press there reaches OneTrust's banner or filter (${p.at})`)
			const banner = offBanner.banner!
			const underBanner = meets(p.box, { x: banner.x, y: banner.y, w: banner.w, h: banner.h })
			// English: the banner floats bottom-left, over the button. Arabic: bottom-right, clear of it, on a desktop.
			if (c.path.startsWith('/en/') || c.viewport === PHONE) assert.equal(underBanner, true, `${where}: the banner lies over the Pocket button`)
			else assert.equal(underBanner, false, `${where}: the banner is at the bottom-right, clear of the Pocket button`)
			// The banner and its filter taken away: the button can be pressed, and opens the album.
			await l.page.evaluate(() => document.getElementById('onetrust-consent-sdk')!.remove())
			await settle(l.page, 200)
			const q = (await peek(l.page))!
			assert.equal(q.onTop, true, `${where}: with the banner gone the Pocket button can be pressed (${q.at})`)
			await pressPeek(l.page)
			await waitView(l.page, 'pocket')
			assert.deepEqual(seen.pageErrors, [], `${where}: no page errors`)
		} finally {
			await l.close()
		}
	})
}

for (const path of ['/en/services', '/ar/services']) {
	for (const failAt of ['pocket-open', 'pocket-chip']) {
		const where = `${path} ${failAt}`
		test(`${where}: a failure with the corner shown leaves the accessibility button and the microphone as with ?aixc=off (S11)`, async () => {
			const l = await launchLayer(gw, { owl: true, reducedMotion: true })
			try {
				const seen = watch(l.page)
				await open(l.page, path, '?aixc=off')
				await settle(l.page, 400)
				const off = await fixed(l.page)
				await open(l.page, path, '?aixc-debug')
				await pocketReady(l.page)
				const ids = await chippedIds(l.page)
				await pocketByPress(l.page, ids[0], where)
				await cornerShown(l.page)
				await l.page.evaluate((failAt) => {
					;(window as any).__AIXC_TEST__ = { failAt }
				}, failAt)
				if (failAt === 'pocket-open') await pressPeek(l.page)
				else {
					const at = await chipAt(l.page, ids[1])
					await l.page.mouse.click(at.x, at.y)
				}
				await l.page.waitForFunction(() => (window as any).__aixc?.state === 'failed', null, { timeout: 15_000 })
				assert.match((await l.page.evaluate(() => (window as any).__aixc.failure)).message, new RegExp(failAt), `${where}: the error is the one thrown`)
				assert.equal(await l.page.evaluate(() => document.querySelectorAll('[data-aixc], .pocket-peek, .pocket-layer').length), 0, `${where}: nothing of the layer is left`)
				await settle(l.page, 400)
				asServed(await fixed(l.page), off, `${where} failed`)
				const errors = seen.layer.filter((x) => x.startsWith('error:'))
				assert.ok(errors.length > 0 && errors.every((x) => x.includes(failAt)), `${where}: no layer error beyond the forced one (${errors.join(' | ')})`)
				assert.deepEqual(seen.pageErrors, [], `${where}: no error reached the page`)
			} finally {
				await l.close()
			}
		})
	}
}
