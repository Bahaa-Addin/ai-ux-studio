/**
 * Details of the Pocket found on Vodafone's live site on 2026-11-17 (Google Chrome, web.vodafone.com.eg),
 * held on the saved pages with the live-page kit (./vodafone-layer.ts), Owl's layout and the accessibility
 * button stood in, and the Exploration Trail on (its pill shows below Vodafone's header):
 *
 * - F7a: in the Arabic album, Back's chevron points the way back (to the right) and its padding follows the
 *   reading direction, as does the arrow of a sticker's link; the English album is as it was.
 * - F14: a sticker's picture that cover would cut by more than 40% at its frame's measured shape is shown
 *   whole (contain), decided from the picture and its frame when it loads, so records kept before keep
 *   working; an ordinary photo (230x170) and a wide one fill their frames; a record that names its fit keeps
 *   it. Offline the saved pages' pictures are blanks (1x1), so the clone's copies of Vodafone's own pictures
 *   (experiences/public/assets/images) and a plain 230x170 one answer at their live addresses.
 * - F9: at scroll 0, the first screen a visitor sees, no "Pocket it" lies under the trail's pill, and the
 *   hero card's chip is wholly pressable; the chips pick again when the pill shows, goes or changes size,
 *   and nothing moves on scroll. Held without Reimagine's launcher (the kit's `demos: { reimagine: false }`),
 *   and again with it (phase 4a, ADR-0076): it sits under the pill, and where the pill was once the pill goes,
 *   so no chip lies under either, and the hero card's chip keeps clear of it there.
 * - F8b: on a phone at scroll 0 no "Pocket it" lies under the guide's microphone either; the chips pick again
 *   when the guide arrives or its microphone shows or goes, and nothing moves on scroll.
 * - F8a: with the album's end at the bottom of the screen, its last sticker's link and date are clear of the
 *   guide's microphone and of Vodafone's accessibility button (the kit's stand-in).
 *
 * With DETAILS_SHOTS set (a directory outside the repository), each case writes a screenshot there.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { after, before, test } from 'node:test'

import type { Page, Route } from 'playwright'

import { ROOT } from '#shared/config.ts'

import { DESKTOP, type LayerGateway, launchLayer, open, PHONE, startLayerGateway, V, watch } from './vodafone-layer.ts'

const PORT = 4467
let gw: LayerGateway

before(async () => {
	gw = await startLayerGateway(PORT, { trail: true })
})
after(async () => {
	await gw?.close()
})

/* eslint-disable @typescript-eslint/no-explicit-any */
type Box = { left: number; top: number; right: number; bottom: number }
const meets = (a: Box, b: Box) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
const fmt = (b: Box | null) => (b ? `[${[b.left, b.top, b.right, b.bottom].map(Math.round).join(',')}]` : 'none')

/** Where the screenshots go (DETAILS_SHOTS), never inside the repository. */
const SHOTS = (() => {
	const dir = process.env.DETAILS_SHOTS
	if (!dir) return null
	const abs = path.resolve(dir)
	const repo = path.resolve(ROOT, '..')
	if (abs === repo || abs.startsWith(repo + path.sep)) throw new Error(`DETAILS_SHOTS must be outside the repository (${abs})`)
	fs.mkdirSync(abs, { recursive: true })
	return abs
})()
const shot = async (page: Page, name: string) => {
	if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${name}.png`) })
}

/** Two frames and a little more: the chips' pass runs on a frame. */
const settle = (page: Page, ms = 60) => page.evaluate((ms) => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(done, ms)))), ms)

/** The Pocket started (its chips drawn, or none), its store read and emptied. */
async function ready(page: Page, pathname: string) {
	await open(page, pathname, '?aixc-debug')
	await page.waitForFunction(() => (window as any).__aixc?.demos?.pocket?.chips, null, { timeout: 15_000 })
	await page.evaluate(async () => {
		const { store } = (window as any).__aixc.demos.pocket
		await store.ready
		await store.clear()
	})
	await settle(page)
}

/** Brings card `id` to the middle of the screen and presses its chip as a person would; waits until it is kept. */
async function pocketCard(page: Page, id: string) {
	const at = await page.evaluate(async (id) => {
		const card = [...document.querySelectorAll<HTMLElement>(`#main-content [data-aixc-item="${CSS.escape(id)}"]`)].find((c) => !c.closest('.owl-item.cloned'))
		if (!card) return null
		card.scrollIntoView({ block: 'center', inline: 'nearest' })
		await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(done, 80))))
		const r = document.querySelector<HTMLElement>(`.pocket-chips .pocket-cta[data-pocket-for="${CSS.escape(id)}"]`)!.getBoundingClientRect()
		return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
	}, id)
	assert.ok(at, `card ${id} is on the page`)
	await page.mouse.click(at.x, at.y)
	await page.waitForFunction((id) => (window as any).__aixc.demos.pocket.store.all().some((r: any) => r.id === id), id, { timeout: 5_000 })
	await page.waitForFunction(() => document.querySelectorAll('.curl-host--flying').length === 0, null, { timeout: 8_000 })
}

/** Keeps card `id` of this page as a record, as the adapter keeps it (without a picture fit, or with `fit`), without pressing anything. */
async function keep(page: Page, id: string, fit: string | null = null) {
	const ok = await page.evaluate(async ([id, fit]) => {
		const layer = (window as any).__aixc
		const lang = layer.host.lang
		for (const section of layer.model?.sections ?? [])
			for (const item of section.items)
				if (item.id === id) {
					await layer.demos.pocket.store.put({
						v: 2,
						key: `t-${id}`,
						id,
						kind: item.kind ?? null,
						keys: item.keys ?? [],
						copy: { title: item.title, description: item.description ?? null, lang, dir: lang === 'ar' ? 'rtl' : 'ltr' },
						image: item.image ? { src: item.image.src, alt: null, ...(fit ? { fit } : {}) } : null,
						cta: item.cta?.href ? { label: item.cta.label ?? null, href: item.cta.href } : null,
						source: { page: location.pathname.replace(/^\/(en|ar)/, ''), path: location.pathname, pageId: null, title: {}, section: { id: section.id, title: section.title ?? null } },
						origin: 'person',
						savedAt: Date.UTC(2026, 10, 12, 9),
						seenAt: Date.UTC(2026, 10, 12, 9),
					})
					return true
				}
		return false
	}, [id, fit] as const)
	assert.ok(ok, `card ${id} is in the model`)
	await page.reload({ waitUntil: 'load' })
	await page.waitForFunction(() => (window as any).__aixc?.demos?.pocket?.state.ids.length === 1, null, { timeout: 15_000 })
}

async function openAlbum(page: Page) {
	await page.evaluate(() => (window as any).__aixc.demos.pocket.open())
	await page.waitForFunction(() => {
		const s = (window as any).__aixc.demos.pocket.state
		return s.view === 'pocket' && !s.busy
	}, null, { timeout: 10_000 })
	await settle(page, 200)
}

/** The x scale of an element's computed transform (`a` of its matrix): -1 when it is mirrored, 1 when not. */
const scaleX = (transform: string) => (transform === 'none' ? 1 : Number(/^matrix(?:3d)?\(\s*([-\d.e]+)/.exec(transform)?.[1] ?? NaN))

/* ------------------------------------------------------------------ F7a */

test('F7a: in the Arabic album Back points right and its padding mirrors, as does a sticker link\'s arrow; English as before', async () => {
	for (const viewport of [DESKTOP, PHONE]) {
		const l = await launchLayer(gw, { viewport, owl: true, reducedMotion: true })
		try {
			const seen = watch(l.page)
			for (const pathname of ['/en/services', '/ar/services']) {
				const where = `${pathname} ${viewport.width}`
				await ready(l.page, pathname)
				await keep(l.page, 'vodafone-cash')
				await openAlbum(l.page)
				const s = await l.page.evaluate(() => {
					const back = document.querySelector<HTMLElement>('#pocket-output .pocket-view__bar .pocket-back:not(.pocket-journey-cta)')!
					const solid = document.querySelector<HTMLElement>('#pocket-output .pocket-back--solid')!
					const cs = getComputedStyle(back)
					const icon = back.querySelector('.pocket-back__icon')!
					const text = back.lastChild!
					const range = document.createRange()
					range.selectNodeContents(text)
					const words = range.getBoundingClientRect()
					const ib = icon.getBoundingClientRect()
					const ss = getComputedStyle(solid)
					return {
						dir: getComputedStyle(back).direction,
						label: back.textContent!.trim(),
						icon: getComputedStyle(icon).transform,
						link: getComputedStyle(document.querySelector('#pocket-output .pocket-sticker__cta-icon')!).transform,
						pad: [cs.paddingInlineStart, cs.paddingInlineEnd],
						// The icon leads the words: on their right in Arabic, on their left in English.
						iconFirst: cs.direction === 'rtl' ? ib.left >= words.right - 0.5 : ib.right <= words.left + 0.5,
						solid: [ss.paddingLeft, ss.paddingRight],
					}
				})
				await shot(l.page, `F7a-${pathname.slice(1, 3)}-${viewport.width}`)
				const ar = pathname.startsWith('/ar/')
				assert.equal(s.dir, ar ? 'rtl' : 'ltr', `${where}: the album reads ${ar ? 'right to left' : 'left to right'}`)
				assert.equal(scaleX(s.icon), ar ? -1 : 1, `${where}: Back's chevron ${ar ? 'is mirrored, pointing right' : 'points left, as before'} (${s.icon})`)
				assert.equal(s.pad[0], '12px', `${where}: 12 px before the chevron (padding-inline-start ${s.pad[0]})`)
				assert.equal(s.pad[1], '20px', `${where}: 20 px after the words (padding-inline-end ${s.pad[1]})`)
				assert.equal(s.iconFirst, true, `${where}: the chevron leads the words (${s.label})`)
				assert.equal(scaleX(s.link), ar ? -1 : 1, `${where}: the arrow of the sticker's link ${ar ? 'is mirrored' : 'as before'} (${s.link})`)
				assert.deepEqual(s.solid, ['22px', '22px'], `${where}: the empty album's solid Back is unchanged`)
				// "Your journey" beside it (the trail is on here): 14 px before its icon and 16 px after its words in
				// either direction (journey.css), 12 px on both sides on a phone as before.
				await l.page.waitForSelector('#pocket-output .pocket-journey-cta:not([hidden])', { timeout: 15_000 })
				const j = await l.page.evaluate(() => {
					const cs = getComputedStyle(document.querySelector('#pocket-output .pocket-journey-cta')!)
					return { dir: cs.direction, pad: [cs.paddingInlineStart, cs.paddingInlineEnd], block: [cs.paddingTop, cs.paddingBottom] }
				})
				await shot(l.page, `F7a-journey-${pathname.slice(1, 3)}-${viewport.width}`)
				const want = viewport === PHONE ? ['12px', '12px'] : ['14px', '16px']
				assert.equal(j.dir, ar ? 'rtl' : 'ltr', `${where}: "Your journey" reads as the album`)
				assert.deepEqual(j.pad, want, `${where}: "Your journey" has ${want[0]} before its icon and ${want[1]} after its words (padding-inline ${j.pad.join(' ')})`)
				assert.deepEqual(j.block, ['0px', '0px'], `${where}: no padding above or below "Your journey"`)
			}
			assert.deepEqual(seen.pageErrors, [], 'no page errors')
			assert.deepEqual(l.reached, [], 'nothing reached the internet')
		} finally {
			await l.close()
		}
	}
})

/* ------------------------------------------------------------------ F14 */

/**
 * The pictures, by card: the clone's copies of Vodafone Cash's phone and notes and of Roaming's wide photo,
 * and a plain 230x170 picture (an ordinary photo's shape) for End of call.
 */
const PICTURES: Record<string, { body: () => Buffer; type: string; width: number; height: number; whole: boolean }> = {
	'vodafone-cash': { body: () => fs.readFileSync(path.join(ROOT, '../experiences/public/assets/images/vf-cash.png')), type: 'image/png', width: 218, height: 240, whole: true },
	'end-of-call': { body: () => Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="230" height="170"><rect width="230" height="170" fill="#4a7f9c"/><circle cx="115" cy="85" r="50" fill="#f2c14e"/></svg>'), type: 'image/svg+xml', width: 230, height: 170, whole: false },
	'spa-roaming': { body: () => fs.readFileSync(path.join(ROOT, '../experiences/public/assets/images/roaming.png')), type: 'image/png', width: 350, height: 150, whole: false },
}

/** Card `id`'s sticker picture in the open album: its class, fit, natural size, frame, content box and the picture as shown there. */
const pictureOf = (page: Page, id: string) =>
	page.evaluate((key) => {
		const cell = [...document.querySelectorAll<HTMLElement>('#pocket-output [data-pocket-id]')].find((c) => (window as any).__aixc.demos.pocket.store.all().some((r: any) => r.key === c.dataset.pocketId && r.id === key))!
		const img = cell.querySelector<HTMLImageElement>('.pocket-sticker__media img')!
		const frame = img.parentElement!
		const cs = getComputedStyle(img)
		// The picture's content box (the frame less its padding), and the picture as object-fit scales it there.
		const cw = img.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
		const ch = img.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)
		const nw = img.naturalWidth
		const nh = img.naturalHeight
		const scale = cs.objectFit === 'contain' ? Math.min(cw / nw, ch / nh) : cs.objectFit === 'cover' ? Math.max(cw / nw, ch / nh) : 1
		return { cls: img.className, fit: cs.objectFit, natural: [nw, nh], frame: [frame.clientWidth, frame.clientHeight], content: [cw, ch], shown: [nw * scale, nh * scale] }
	}, id)

/** Every sticker picture in the open album loaded. */
const picturesLoaded = (page: Page) =>
	page.waitForFunction(() => [...document.querySelectorAll<HTMLImageElement>('#pocket-output .pocket-sticker__media img')].every((i) => i.complete && i.naturalWidth > 1), null, { timeout: 10_000 })

test('F14: a tall, square or strip picture that cover would cut by more than 40% at its frame\'s shape is shown whole (Vodafone Cash); a 230x170 photo and a wide one fill their frames, on a 414 px phone too; a record that names its fit keeps it', async () => {
	// 414 wide: a phone whose wider frame (F 2.45) would make cover hide 45% of a 4:3 photo, which still fills it.
	for (const viewport of [DESKTOP, PHONE, { width: 414, height: 896 }]) {
		const l = await launchLayer(gw, { viewport, owl: true, reducedMotion: true })
		try {
			const seen = watch(l.page)
			await ready(l.page, '/en/services')
			// The pictures' live addresses, from the model; answered with the pictures above from now on.
			const srcs = await l.page.evaluate((ids) => {
				const out: Record<string, string> = {}
				for (const s of (window as any).__aixc.model.sections) for (const i of s.items) if (ids.includes(i.id) && i.image?.src) out[i.id] = new URL(i.image.src, location.href).href
				return out
			}, Object.keys(PICTURES))
			assert.deepEqual(Object.keys(srcs).sort(), Object.keys(PICTURES).sort(), 'the cards have a picture on the saved page')
			for (const [id, src] of Object.entries(srcs)) {
				const body = PICTURES[id].body()
				await l.page.route((url) => url.href === src, (route) => route.fulfill({ status: 200, contentType: PICTURES[id].type, body }))
			}

			// A record kept with its fit named keeps it: Vodafone Cash's picture as cover, as the record says.
			await ready(l.page, '/en/services')
			await keep(l.page, 'vodafone-cash', 'cover')
			await openAlbum(l.page)
			await picturesLoaded(l.page)
			await settle(l.page)
			const named = await pictureOf(l.page, 'vodafone-cash')
			assert.deepEqual([named.cls, named.fit], ['', 'cover'], `vodafone-cash ${viewport.width}: its record names cover, so cover`)

			await ready(l.page, '/en/services')
			for (const id of Object.keys(PICTURES)) await pocketCard(l.page, id)
			await openAlbum(l.page)
			await picturesLoaded(l.page)
			await settle(l.page)
			await l.page.evaluate(() => document.querySelector('#pocket-output .pocket-sticker')?.scrollIntoView({ block: 'center' }))
			await shot(l.page, `F14-en-${viewport.width}`)
			for (const id of Object.keys(PICTURES)) {
				const where = `${id} ${viewport.width}`
				const p = await pictureOf(l.page, id)
				const F = p.frame[0] / p.frame[1]
				const P = p.natural[0] / p.natural[1]
				const hidden = 1 - Math.min(P / F, F / P)
				console.log(`${where}: frame ${p.frame.join('x')} (F ${F.toFixed(2)}), picture ${p.natural.join('x')} (P ${P.toFixed(2)}), cover would hide ${Math.round(hidden * 100)}%: ${p.fit}, shown ${p.shown.map(Math.round).join('x')} in ${p.content.map(Math.round).join('x')}`)
				assert.deepEqual(p.natural, [PICTURES[id].width, PICTURES[id].height], `${where}: the picture answered`)
				// Shown whole: cover would hide over 40% of a tall or square picture (P under 1.2) or a strip (P over 3.5).
				assert.equal(hidden > 0.4 && (P < 1.2 || P > 3.5), PICTURES[id].whole, `${where}: cover would hide ${Math.round(hidden * 100)}% of it (P ${P.toFixed(2)})`)
				const whole = p.shown[0] <= p.content[0] + 0.5 && p.shown[1] <= p.content[1] + 0.5
				if (PICTURES[id].whole) {
					assert.equal(p.cls, 'is-contain', `${where}: marked to be shown whole`)
					assert.equal(p.fit, 'contain', `${where}: object-fit contain`)
					assert.equal(whole, true, `${where}: the whole picture fits in its frame (shown ${p.shown.map(Math.round).join('x')} in ${p.content.map(Math.round).join('x')})`)
				} else {
					assert.equal(p.cls, '', `${where}: not marked (cover would hide ${Math.round(hidden * 100)}%)`)
					assert.equal(p.fit, 'cover', `${where}: it fills its frame`)
				}
			}
			assert.deepEqual(seen.pageErrors, [], 'no page errors')
			assert.deepEqual(l.reached, [], 'nothing reached the internet')
		} finally {
			await l.close()
		}
	}
})

/* ------------------------------------------------------------------ F9 */

/** The trail's pill (in the guide's shadow root) once it shows, and the chips settled after it. */
async function pillShows(page: Page) {
	await page.waitForFunction(() => {
		const p = document.querySelector('vg-guide')?.shadowRoot?.querySelector<HTMLElement>('.tr-pill')
		return !!p && !p.hidden && p.getBoundingClientRect().width > 0
	}, null, { timeout: 15_000 })
	await settle(page, 400)
}

/** At this scroll: the pill's box, every chip's visible box, and whether a press at the hero card's chip reaches it. */
const firstScreen = (page: Page, hero: string) =>
	page.evaluate((hero) => {
		const box = (r: DOMRect) => ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom })
		const pill = document.querySelector('vg-guide')!.shadowRoot!.querySelector<HTMLElement>('.tr-pill')!
		const chips: { id: string; box: { left: number; top: number; right: number; bottom: number } }[] = []
		for (const chip of document.querySelectorAll<HTMLElement>('.pocket-chips .pocket-cta[data-pocket-for]')) {
			const slot = chip.closest<HTMLElement>('.pocket-chips > *')!
			let b = box(chip.getBoundingClientRect())
			// What shows of it: its slot cuts it where its card is cut (Owl's stage).
			if (getComputedStyle(slot).overflow !== 'visible') {
				const s = slot.getBoundingClientRect()
				b = { left: Math.max(b.left, s.left), top: Math.max(b.top, s.top), right: Math.min(b.right, s.right), bottom: Math.min(b.bottom, s.bottom) }
			}
			if (b.right - b.left > 0.5 && b.bottom - b.top > 0.5) chips.push({ id: chip.dataset.pocketFor!, box: b })
		}
		const chip = document.querySelector<HTMLElement>(`.pocket-chips .pocket-cta[data-pocket-for="${CSS.escape(hero)}"]`)
		const cb = chip?.getBoundingClientRect()
		const at = cb ? document.elementFromPoint(cb.left + cb.width / 2, cb.top + cb.height / 2) : null
		const card = [...document.querySelectorAll<HTMLElement>(`#main-content [data-aixc-item="${CSS.escape(hero)}"]`)].find((c) => !c.closest('.owl-item.cloned'))
		const kb = card?.getBoundingClientRect()
		return {
			scrollY,
			pill: box(pill.getBoundingClientRect()),
			chips,
			hero: cb ? { box: box(cb), hit: !!at && (at === chip || chip!.contains(at)), at: at ? `${at.localName}.${String(at.getAttribute('class') ?? '').split(' ')[0]}` : null, inCard: !!kb && { dx: cb.left - kb.left, dy: cb.top - kb.top } } : null,
		}
	}, hero)

// Without Reimagine's launcher: once the pill goes, nothing else is in the hero card's top end corner. With it, the
// launcher takes its place without a pill (under Vodafone's header, at the inline end) and the chip rightly keeps
// clear of it: the next case.
test('F9: at scroll 0 no "Pocket it" lies under the trail\'s pill and the hero card\'s chip is wholly pressable; chips pick again when the pill shows or goes, not on scroll (Reimagine off)', async () => {
	const HERO = 'vodafone-red1'
	for (const viewport of [DESKTOP, PHONE]) {
		const l = await launchLayer(gw, { viewport, owl: true, reducedMotion: true, demos: { reimagine: false } })
		try {
			const seen = watch(l.page)
			for (const pathname of ['/en/home', '/ar/home']) {
				const where = `${pathname} ${viewport.width}`
				await ready(l.page, pathname)
				await pillShows(l.page)
				const a = await firstScreen(l.page, HERO)
				await shot(l.page, `F9-${pathname.slice(1, 3)}-home-${viewport.width}`)
				assert.equal(a.scrollY, 0, `${where}: at the top of the page`)
				const under = a.chips.filter((c) => meets(c.box, a.pill))
				assert.deepEqual(under.map((c) => `${c.id} ${fmt(c.box)}`), [], `${where}: no chip under the pill ${fmt(a.pill)}`)
				assert.ok(a.hero, `${where}: the hero card (${HERO}) has its chip`)
				assert.equal(a.hero.hit, true, `${where}: a press at the middle of the hero card's chip ${fmt(a.hero.box)} reaches it (it reaches ${a.hero.at})`)
				const vw = viewport.width
				assert.ok(a.hero.box.left >= 0 && a.hero.box.right <= vw && a.hero.box.top >= 0, `${where}: the hero card's chip is wholly on the screen ${fmt(a.hero.box)}`)

				// Nothing moves on scroll: down the page (the pill tucks away or rises under a header that left) and back.
				await l.page.evaluate(() => scrollTo(0, 400))
				await settle(l.page, 400)
				const down = await firstScreen(l.page, HERO)
				assert.deepEqual(down.hero?.inCard, a.hero.inCard, `${where}: the hero card's chip keeps its corner on scroll`)
				await l.page.evaluate(() => scrollTo(0, 0))
				await settle(l.page, 400)

				// The pill goes (Not now): the hero card's chip takes its first corner again; it comes back: clear again.
				const hide = (on: boolean) =>
					l.page.evaluate((on) => {
						document.querySelector('vg-guide')!.shadowRoot!.querySelector<HTMLElement>('.tr-pill')!.hidden = on
					}, on)
				await hide(true)
				await settle(l.page, 300)
				const gone = await firstScreen(l.page, HERO)
				assert.equal(meets(gone.hero!.box, a.pill), true, `${where}: without the pill the hero card's chip is back in its top end corner ${fmt(gone.hero!.box)} (where the pill was, ${fmt(a.pill)})`)
				await hide(false)
				await settle(l.page, 300)
				const back = await firstScreen(l.page, HERO)
				assert.deepEqual(back.chips.filter((c) => meets(c.box, back.pill)).map((c) => c.id), [], `${where}: the pill back, no chip under it`)
				assert.deepEqual(back.hero?.inCard, a.hero.inCard, `${where}: the hero card's chip where it was with the pill`)
			}
			assert.deepEqual(seen.pageErrors, [], 'no page errors')
			assert.ok(!seen.layer.some((x) => x.startsWith('error:')), `no layer error: ${seen.layer.join(' | ')}`)
			assert.deepEqual(l.reached, [], 'nothing reached the internet')
		} finally {
			await l.close()
		}
	}
})

/** Reimagine's launcher once it shows (on the page, not hidden, not tucked away, not given way), and the chips settled after it. */
async function launcherShows(page: Page) {
	await page.waitForFunction(() => {
		const b = document.querySelector<HTMLElement>('.aixc-launcher')
		return !!(window as any).__aixc?.demos?.reimagine && !!b && !b.hidden && !b.hasAttribute('data-tucked') && getComputedStyle(b).visibility !== 'hidden' && b.getBoundingClientRect().width > 0
	}, null, { timeout: 15_000 })
	await settle(page, 400)
}

/** The launcher's box while it shows (as launcherShows), or null. */
const launcherBox = (page: Page) =>
	page.evaluate(() => {
		const b = document.querySelector<HTMLElement>('.aixc-launcher')
		if (!b || b.hidden || b.hasAttribute('data-tucked') || getComputedStyle(b).visibility === 'hidden') return null
		const r = b.getBoundingClientRect()
		return r.width > 0 ? { left: r.left, top: r.top, right: r.right, bottom: r.bottom } : null
	})

/** Directly under `pill` (within the launcher's 12 px gap and a little more), on its side. */
const underPill = (b: Box, pill: Box) => b.top >= pill.bottom - 0.5 && b.top - pill.bottom <= 16 && b.left < pill.right && pill.left < b.right

test('F9 with Reimagine\'s launcher: at scroll 0 no "Pocket it" lies under the pill or the launcher under it; when the pill goes the launcher takes its place and the hero card\'s chip keeps clear of it, wholly on the screen and pressable; when the pill comes back the launcher is under it and no chip lies under either', async () => {
	const HERO = 'vodafone-red1'
	const under = (chips: { id: string; box: Box }[], b: Box) => chips.filter((c) => meets(c.box, b)).map((c) => `${c.id} ${fmt(c.box)}`)
	for (const viewport of [DESKTOP, PHONE]) {
		const l = await launchLayer(gw, { viewport, owl: true, reducedMotion: true })
		try {
			const seen = watch(l.page)
			for (const pathname of ['/en/home', '/ar/home']) {
				const where = `${pathname} ${viewport.width}`
				const vw = viewport.width
				const vh = viewport.height
				const wholly = (b: Box) => b.left >= 0 && b.right <= vw && b.top >= 0 && b.bottom <= vh
				await ready(l.page, pathname)
				await pillShows(l.page)
				await launcherShows(l.page)
				const a = await firstScreen(l.page, HERO)
				const la = await launcherBox(l.page)
				await shot(l.page, `F9-launcher-${pathname.slice(1, 3)}-home-${viewport.width}`)
				assert.equal(a.scrollY, 0, `${where}: at the top of the page`)
				assert.ok(la && underPill(la, a.pill), `${where}: the launcher ${fmt(la)} is under the pill ${fmt(a.pill)}`)
				assert.deepEqual(under(a.chips, a.pill), [], `${where}: no chip under the pill ${fmt(a.pill)}`)
				assert.deepEqual(under(a.chips, la), [], `${where}: no chip under the launcher ${fmt(la)}`)
				assert.ok(a.hero, `${where}: the hero card (${HERO}) has its chip`)
				assert.equal(a.hero.hit, true, `${where}: a press at the middle of the hero card's chip ${fmt(a.hero.box)} reaches it (it reaches ${a.hero.at})`)
				assert.ok(wholly(a.hero.box), `${where}: the hero card's chip is wholly on the screen ${fmt(a.hero.box)}`)

				// Nothing moves on scroll: down the page (the pill tucks away, the launcher with it) and back.
				await l.page.evaluate(() => scrollTo(0, 400))
				await settle(l.page, 400)
				const down = await firstScreen(l.page, HERO)
				assert.deepEqual(down.hero?.inCard, a.hero.inCard, `${where}: the hero card's chip keeps its corner on scroll`)
				await l.page.evaluate(() => scrollTo(0, 0))
				await settle(l.page, 400)

				// The pill goes (Not now): the launcher takes its place without a pill, under Vodafone's header at the inline
				// end, where the pill was; no chip lies under it, and the hero card's chip, kept out of that corner, is
				// wholly on the screen and pressable.
				const hide = (on: boolean) =>
					l.page.evaluate((on) => {
						document.querySelector('vg-guide')!.shadowRoot!.querySelector<HTMLElement>('.tr-pill')!.hidden = on
					}, on)
				await hide(true)
				await settle(l.page, 300)
				const gone = await firstScreen(l.page, HERO)
				const lg = await launcherBox(l.page)
				assert.ok(lg && meets(lg, a.pill), `${where}: without the pill the launcher ${fmt(lg)} is where the pill was ${fmt(a.pill)}`)
				assert.deepEqual(under(gone.chips, lg), [], `${where}: without the pill no chip under the launcher ${fmt(lg)}`)
				assert.ok(gone.hero, `${where}: without the pill the hero card has its chip`)
				assert.equal(gone.hero.hit, true, `${where}: without the pill a press at the middle of the hero card's chip ${fmt(gone.hero.box)} reaches it (it reaches ${gone.hero.at})`)
				assert.ok(wholly(gone.hero.box), `${where}: without the pill the hero card's chip is wholly on the screen ${fmt(gone.hero.box)}`)

				// The pill comes back: the launcher under it again, and no chip under either.
				await hide(false)
				await settle(l.page, 300)
				const back = await firstScreen(l.page, HERO)
				const lb = await launcherBox(l.page)
				assert.ok(lb && underPill(lb, back.pill), `${where}: the pill back, the launcher ${fmt(lb)} is under it ${fmt(back.pill)}`)
				assert.deepEqual(under(back.chips, back.pill), [], `${where}: the pill back, no chip under it ${fmt(back.pill)}`)
				assert.deepEqual(under(back.chips, lb), [], `${where}: the pill back, no chip under the launcher ${fmt(lb)}`)
				assert.deepEqual(back.hero?.inCard, a.hero.inCard, `${where}: the hero card's chip where it was with the pill`)
			}
			assert.deepEqual(seen.pageErrors, [], 'no page errors')
			assert.ok(!seen.layer.some((x) => x.startsWith('error:')), `no layer error: ${seen.layer.join(' | ')}`)
			assert.deepEqual(l.reached, [], 'nothing reached the internet')
		} finally {
			await l.close()
		}
	}
})

/* ------------------------------------------------------------------ F8b */

/** Every chip's offset from its card ([dx, dy]), by card id: the same as long as nothing was picked again. */
const offsets = (page: Page) =>
	page.evaluate(() => {
		const out: Record<string, number[]> = {}
		for (const chip of document.querySelectorAll<HTMLElement>('.pocket-chips .pocket-cta[data-pocket-for]')) {
			const id = chip.dataset.pocketFor!
			const card = [...document.querySelectorAll<HTMLElement>(`#main-content [data-aixc-item="${CSS.escape(id)}"]`)].find((c) => !c.closest('.owl-item.cloned'))
			if (!card) continue
			const a = chip.getBoundingClientRect()
			const b = card.getBoundingClientRect()
			out[id] = [Math.round(a.left - b.left), Math.round(a.top - b.top)]
		}
		return out
	})

/** The guide's microphone's box while it shows, or null. */
const micBox = (page: Page) =>
	page.evaluate(() => {
		const mic = document.querySelector('vg-guide')?.shadowRoot?.querySelector('.vg-mic')
		if (!mic?.getClientRects().length) return null
		const r = mic.getBoundingClientRect()
		return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }
	})

/** Every chip that shows, with what shows of it (its slot cuts it where its card is cut); with or without the guide. */
const chipBoxes = (page: Page) =>
	page.evaluate(() => {
		const chips: { id: string; box: { left: number; top: number; right: number; bottom: number } }[] = []
		for (const chip of document.querySelectorAll<HTMLElement>('.pocket-chips .pocket-cta[data-pocket-for]')) {
			const slot = chip.closest<HTMLElement>('.pocket-chips > *')!
			const r = chip.getBoundingClientRect()
			let b = { left: r.left, top: r.top, right: r.right, bottom: r.bottom }
			if (getComputedStyle(slot).overflow !== 'visible') {
				const s = slot.getBoundingClientRect()
				b = { left: Math.max(b.left, s.left), top: Math.max(b.top, s.top), right: Math.min(b.right, s.right), bottom: Math.min(b.bottom, s.bottom) }
			}
			if (b.right - b.left > 0.5 && b.bottom - b.top > 0.5) chips.push({ id: chip.dataset.pocketFor!, box: b })
		}
		return chips
	})

test('F8b: on a phone at scroll 0 no "Pocket it" lies under the guide\'s microphone; the chips pick again when the guide arrives or its microphone shows or goes, not on scroll', async () => {
	const l = await launchLayer(gw, { viewport: PHONE, owl: true, reducedMotion: true })
	try {
		const seen = watch(l.page)
		for (const pathname of ['/en/home', '/en/services']) {
			const where = `${pathname} ${PHONE.width}`
			const name = `F8b-${pathname.split('/')[2]}-${PHONE.width}`
			await ready(l.page, pathname)
			await pillShows(l.page)
			const mic = await micBox(l.page)
			assert.ok(mic, `${where}: the guide's microphone shows`)
			assert.equal(await l.page.evaluate(() => scrollY), 0, `${where}: at the top of the page`)
			const chips = await chipBoxes(l.page)
			await shot(l.page, name)
			console.log(`${where}: mic ${fmt(mic)}; chips in the first screen: ${chips.filter((c) => c.box.top < PHONE.height).map((c) => `${c.id} ${fmt(c.box)}`).join(', ')}`)
			assert.deepEqual(chips.filter((c) => meets(c.box, mic)).map((c) => `${c.id} ${fmt(c.box)}`), [], `${where}: no chip under the mic ${fmt(mic)}`)
			const pill = (await firstScreen(l.page, '')).pill
			assert.deepEqual(chips.filter((c) => meets(c.box, pill)).map((c) => c.id), [], `${where}: none under the trail's pill either (F9)`)
			const base = await offsets(l.page)

			// Nothing moves on scroll: down the page, where the mic lies over other cards, and back.
			await l.page.evaluate(() => scrollTo(0, 400))
			await settle(l.page, 400)
			assert.deepEqual(await offsets(l.page), base, `${where}: every chip keeps its corner on scroll`)
			await l.page.evaluate(() => scrollTo(0, 0))
			await settle(l.page, 400)

			// The microphone goes (the guide hides it): the chips pick again without it; it shows again: as they were.
			const hideMic = (on: boolean) => l.page.evaluate((on) => document.querySelector('vg-guide')!.shadowRoot!.querySelector('.vg-mic')!.classList.toggle('hidden', on), on)
			await hideMic(true)
			await settle(l.page, 300)
			const gone = await chipBoxes(l.page)
			const freed = gone.filter((c) => meets(c.box, mic))
			assert.ok(freed.length, `${where}: without the mic a chip takes its corner under where it was`)
			console.log(`${where}: without the mic ${freed.map((c) => `${c.id} ${fmt(c.box)}`).join(', ')}; with it ${freed.map((c) => `${c.id} ${fmt(chips.find((x) => x.id === c.id)?.box ?? null)}`).join(', ')}`)
			await hideMic(false)
			await settle(l.page, 300)
			assert.deepEqual(await offsets(l.page), base, `${where}: the mic back, every chip where it was with it`)

			// The guide arrives after the chips (its script late), and the trail later still, so its ready event
			// is not what moves them: the chips pick again when the guide's host comes.
			const late = (ms: number) => async (route: Route) => {
				await new Promise((done) => setTimeout(done, ms))
				await route.fallback()
			}
			const guideLate = late(4000)
			const trailLate = late(8000)
			await l.page.route('**/sdk/guide.js', guideLate)
			await l.page.route('**/sdk/trail*.js', trailLate)
			try {
				// Not to 'load', which waits for the guide's script; the store is empty (nothing was pocketed here).
				await l.page.goto(`${V}${pathname}?aixc-debug`, { waitUntil: 'domcontentloaded' })
				await l.page.waitForFunction(() => (window as any).__aixc?.demos?.pocket?.chips, null, { timeout: 15_000 })
				// Every font the page declares loaded now (the guide's controls bring the Arabic face otherwise),
				// so a font arriving is not what moves the chips either.
				await l.page.evaluate(() => Promise.all([...document.fonts].map((face) => face.load().catch(() => null))))
				await settle(l.page, 200)
				assert.equal(await micBox(l.page), null, `${where}: the guide is not there yet`)
				const early = await chipBoxes(l.page)
				assert.ok(early.some((c) => meets(c.box, mic)), `${where}: before the guide comes a chip lies where its mic will be`)
				await l.page.waitForFunction(() => !!document.querySelector('vg-guide')?.shadowRoot?.querySelector('.vg-mic')?.getClientRects().length, null, { timeout: 15_000 })
				await settle(l.page, 300)
				const pillNow = await l.page.evaluate(() => !!document.querySelector('vg-guide')?.shadowRoot?.querySelector('.tr-pill')?.getClientRects().length)
				assert.equal(pillNow, false, `${where}: the trail is not up yet (its ready event has not come)`)
				const arrived = await chipBoxes(l.page)
				assert.deepEqual(arrived.filter((c) => meets(c.box, mic)).map((c) => `${c.id} ${fmt(c.box)}`), [], `${where}: the guide there, no chip under its mic`)
				await shot(l.page, `${name}-guide-late`)
			} finally {
				await l.page.unroute('**/sdk/guide.js', guideLate)
				await l.page.unroute('**/sdk/trail*.js', trailLate)
			}
		}
		assert.deepEqual(seen.pageErrors, [], 'no page errors')
		assert.ok(!seen.layer.some((x) => x.startsWith('error:')), `no layer error: ${seen.layer.join(' | ')}`)
		assert.deepEqual(l.reached, [], 'nothing reached the internet')
	} finally {
		await l.close()
	}
})

/* ------------------------------------------------------------------ F8a */

test('F8a: with the album scrolled to its end, the last sticker\'s link and date are clear of the guide\'s mic and the accessibility button', async () => {
	for (const viewport of [DESKTOP, PHONE]) {
		const l = await launchLayer(gw, { viewport, owl: true, reducedMotion: true })
		try {
			const seen = watch(l.page)
			for (const pathname of ['/ar/services', '/en/services']) {
				const where = `${pathname} ${viewport.width}`
				await ready(l.page, pathname)
				await keep(l.page, 'vodafone-cash')
				await pillShows(l.page)
				await openAlbum(l.page)
				// As live with the trail on: "Your journey" beside Back (it takes a second row of the bar on a phone).
				await l.page.waitForSelector('#pocket-output .pocket-journey-cta:not([hidden])', { timeout: 15_000 })
				await settle(l.page, 200)
				// The album's end at the bottom of the screen: its last bit in view, Vodafone's footer below it.
				await l.page.evaluate(() => {
					const r = document.getElementById('pocket-output')!.getBoundingClientRect()
					scrollTo(0, r.bottom + scrollY - innerHeight)
				})
				await settle(l.page, 200)
				const m = await l.page.evaluate(() => {
					const box = (n: Element | null | undefined) => {
						if (!n) return null
						const r = n.getBoundingClientRect()
						return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }
					}
					const view = document.querySelector('#pocket-output .pocket-view')!
					return {
						end: Math.round(document.getElementById('pocket-output')!.getBoundingClientRect().bottom - innerHeight),
						link: box(document.querySelector('#pocket-output .pocket-sticker__cta')),
						date: box(document.querySelector('#pocket-output .pocket-sticker__date')),
						mic: box(document.querySelector('vg-guide')?.shadowRoot?.querySelector('.vg-mic')),
						aw: box(document.getElementById('vodafone-aw-icon')),
						foot: getComputedStyle(view).paddingBottom,
						screen: innerHeight,
					}
				})
				await shot(l.page, `F8a-${pathname.slice(1, 3)}-${viewport.width}`)
				assert.ok(Math.abs(m.end) <= 1, `${where}: the album's end is at the bottom of the screen (${m.end})`)
				assert.ok(m.link && m.date && m.mic && m.aw, `${where}: the link ${fmt(m.link)}, the date ${fmt(m.date)}, the mic ${fmt(m.mic)} and the accessibility button ${fmt(m.aw)} are there`)
				console.log(`${where}: foot ${m.foot}, mic top ${Math.round(m.mic.top)} (${m.screen - Math.round(m.mic.top)} px above the screen's bottom), link ${fmt(m.link)}, date ${fmt(m.date)}`)
				for (const [name, b] of [
					['link', m.link],
					['date', m.date],
				] as const) {
					assert.equal(meets(b, m.mic), false, `${where}: the sticker's ${name} ${fmt(b)} is clear of the mic ${fmt(m.mic)}`)
					assert.equal(meets(b, m.aw), false, `${where}: the sticker's ${name} ${fmt(b)} is clear of the accessibility button ${fmt(m.aw)}`)
				}
			}
			assert.deepEqual(seen.pageErrors, [], 'no page errors')
			assert.deepEqual(l.reached, [], 'nothing reached the internet')
		} finally {
			await l.close()
		}
	}
})
