/**
 * "Pocket it" on Vodafone's own cards (live plan phase 3, S6; ADR-0052 §10-§14), on the saved pages
 * with the live-page kit (./vodafone-layer.ts) and Owl's layout stood in.
 *
 * - One chip on every card a person can see, drawn in an overlay of our own after the content: nothing
 *   is written into Vodafone's cards, no chip is inside a link, and the page sits where it does
 *   without the layer.
 * - A chip never meets the words of its card's headings; where no corner is free it is icon-only and
 *   counted as unplaced (owner, 2026-11-13).
 * - Pressing a chip pockets the card and never navigates; Put back returns it; a sticker survives
 *   the theme's storage clear.
 * - Hovering, pocketing, putting back and the album change nothing of Vodafone's page, and one
 *   element per card stays marked (B-49).
 * - Chips are cut by Owl's stage like their cards, and follow the stage when it moves.
 * - Keyboard (owner, 2026-11-13): the Tab order is Vodafone's own; screen readers reach the chips by
 *   name, in the page's language (B-48); no key is handled on Vodafone's page.
 * - Chips only where the page was read well enough; they follow a new reading, resizes and pictures.
 * - Chips never cover Vodafone's header, accessibility button, cookie banner or dialogs (AGENTS 4.6).
 * - A failure while drawing or using chips removes the layer and leaves the page as with ?aixc=off.
 */
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'

import type { Page } from 'playwright'

import { DESKTOP, furniture, geometry, type LayerGateway, launchLayer, layerState, open, PHONE, startLayerGateway, watch } from './vodafone-layer.ts'

const PORT = 4486
let gw: LayerGateway

before(async () => {
	gw = await startLayerGateway(PORT)
})
after(async () => {
	await gw?.close()
})

/* eslint-disable @typescript-eslint/no-explicit-any */
const PAGES = ['/en/services', '/ar/services', '/en/home', '/en/mobile-internet-bundles', '/en/vodafone-cash', '/ar/vodafone-red1']
const LABELS = {
	en: { group: 'Pocket it on this page', chip: 'Pocket it: ', undo: 'Put back ', liner: 'In your pocket' },
	ar: { group: 'زرار «في الجيب» لخدمات الصفحة دي', chip: 'في الجيب: ', undo: 'رجّعها: ', liner: 'في جيبك' },
}
const langOf = (path: string) => (path.startsWith('/ar/') ? 'ar' : 'en')

/** Two frames and a little more: the chips' pass runs on a frame. */
const settle = (page: Page) => page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(done, 60)))))

/** The Pocket started and drew its chips (or decided there are none). */
async function chipsReady(page: Page) {
	await page.waitForFunction(() => (window as any).__aixc?.demos?.pocket?.chips, null, { timeout: 15_000 })
	await settle(page)
}

const chipsDebug = (page: Page) => page.evaluate(() => (window as any).__aixc.demos.pocket.chips() as { shown: string[]; unplaced: string[]; icon: string[] } | null)

/** How the chips are built: where they are, what they are called, what they hold. */
const structure = (page: Page) =>
	page.evaluate(() => {
		const w = window as any
		const titles = new Map<string, string>((w.__aixc.model?.sections ?? []).flatMap((s: any) => s.items.map((i: any) => [i.id, i.title])))
		const root = document.querySelector('.pocket-chips') as HTMLElement | null
		const chips = [...document.querySelectorAll<HTMLElement>('.pocket-chips .pocket-cta[data-pocket-for]')]
		const undos = [...document.querySelectorAll<HTMLElement>('.pocket-chips .pocket-liner__undo')]
		const ids = new Set([...document.querySelectorAll<HTMLElement>('#main-content [data-aixc-item]')].filter((c) => !c.closest('.owl-item.cloned')).map((c) => c.dataset.aixcItem))
		const per = new Map<string, number>()
		for (const c of chips) per.set(c.dataset.pocketFor!, (per.get(c.dataset.pocketFor!) ?? 0) + 1)
		return {
			root: root ? { hidden: root.hidden, role: root.getAttribute('role'), label: root.getAttribute('aria-label'), lang: root.lang, marked: root.hasAttribute('data-aixc') && root.hasAttribute('data-vg'), afterContent: !document.getElementById('main-content')!.contains(root) } : null,
			chips: chips.length,
			ids: ids.size,
			strays: chips.filter((c) => !ids.has(c.dataset.pocketFor)).length,
			duplicates: [...per.values()].filter((n) => n > 1).length,
			inLink: chips.filter((c) => c.closest('a')).length,
			inMain: document.querySelectorAll('#main-content [data-aixc], #main-content .pocket-cta, #main-content .pocket-liner').length,
			tabbable: [...chips, ...undos].filter((b) => b.tabIndex >= 0).length,
			names: chips.map((c) => ({ id: c.dataset.pocketFor!, name: c.getAttribute('aria-label') ?? '', title: titles.get(c.dataset.pocketFor!) ?? null })),
			undoNames: undos.map((u) => u.getAttribute('aria-label') ?? ''),
		}
	})

/**
 * What a person sees at this scroll position: every card wholly in view (inside whatever clips it, and
 * clear of the header and the buttons at the bottom) must show its chip where a press reaches it; no
 * chip may be pressable outside the part of its card that shows; no placed chip meets its card's
 * headings' words.
 */
const audit = (page: Page) =>
	page.evaluate(() => {
		const w = window as any
		const d = w.__aixc.demos.pocket.chips() ?? { shown: [], unplaced: [], icon: [] }
		const unplaced = new Set<string>(d.unplaced)
		type Box = { left: number; top: number; right: number; bottom: number }
		const box = (r: DOMRect | Box): Box => ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom })
		const inside = (a: Box, b: Box, e = 0.5) => a.left >= b.left - e && a.top >= b.top - e && a.right <= b.right + e && a.bottom <= b.bottom + e
		const meets = (a: Box, b: Box) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
		const seenOf = (card: Element) => {
			let r = box(card.getBoundingClientRect())
			for (let n = card.parentElement; n && n !== document.documentElement; n = n.parentElement) {
				const s = getComputedStyle(n)
				if (s.overflowX === 'visible' && s.overflowY === 'visible') continue
				const c = n.getBoundingClientRect()
				r = { left: Math.max(r.left, c.left), top: Math.max(r.top, c.top), right: Math.min(r.right, c.right), bottom: Math.min(r.bottom, c.bottom) }
			}
			return r
		}
		let headerBottom = 0
		for (const n of document.querySelectorAll('#header, .nav-header')) {
			const s = getComputedStyle(n)
			if (s.position === 'fixed' || s.position === 'sticky') headerBottom = Math.max(headerBottom, n.getBoundingClientRect().bottom)
		}
		const band = { left: 0, top: headerBottom + 2, right: innerWidth, bottom: innerHeight - 160 }
		const chips = new Map([...document.querySelectorAll<HTMLElement>('.pocket-chips .pocket-cta[data-pocket-for]')].map((c) => [c.dataset.pocketFor!, c]))
		const hitAt = (chip: HTMLElement, x: number, y: number) => {
			const at = document.elementFromPoint(x, y)
			return !!at && (at === chip || chip.contains(at))
		}
		const cards = new Map<string, Element>()
		for (const c of document.querySelectorAll<HTMLElement>('#main-content [data-aixc-item]')) if (!c.closest('.owl-item.cloned, [data-aixc]') && !cards.has(c.dataset.aixcItem!)) cards.set(c.dataset.aixcItem!, c)
		const missing: string[] = []
		const strays: string[] = []
		const onWords: string[] = []
		let expected = 0
		for (const [id, card] of cards) {
			const b = box(card.getBoundingClientRect())
			const seen = seenOf(card)
			const whole = b.right - b.left > 0 && b.bottom - b.top > 0 && card.checkVisibility({ visibilityProperty: true }) && inside(b, seen) && inside(b, band)
			const chip = chips.get(id)
			const cb = chip ? box(chip.getBoundingClientRect()) : null
			const pressable = !!chip && !!cb && cb.right - cb.left >= 24 && cb.bottom - cb.top >= 24 && hitAt(chip, (cb.left + cb.right) / 2, (cb.top + cb.bottom) / 2)
			if (whole) {
				expected++
				if (!pressable) missing.push(id)
			}
			if (chip && cb && cb.right > cb.left) {
				// Pressable anywhere outside what shows of its card: an overlay that does not clip.
				for (const [x, y] of [
					[cb.left + 2, cb.top + 2],
					[cb.right - 2, cb.top + 2],
					[cb.left + 2, cb.bottom - 2],
					[cb.right - 2, cb.bottom - 2],
				])
					if ((x < seen.left || x > seen.right || y < seen.top || y > seen.bottom) && x >= 0 && y >= 0 && x < innerWidth && y < innerHeight && hitAt(chip, x, y)) strays.push(id)
				if (pressable && !inside(cb, b)) strays.push(id)
			}
			if (pressable && cb && !unplaced.has(id)) {
				const words = document.createRange()
				for (const h of card.querySelectorAll('h1, h2, h3, h4, h5, h6')) {
					words.selectNodeContents(h)
					for (const r of words.getClientRects()) if (r.width && r.height && meets(cb, box(r))) onWords.push(id)
				}
			}
		}
		return { expected, missing, strays: [...new Set(strays)], onWords: [...new Set(onWords)], unplaced: d.unplaced as string[], icon: d.icon as string[] }
	})

/** Scrolls the page top to bottom in steps of 60% of the screen, auditing at each; returns the cards seen whole. */
async function walk(page: Page, where: string) {
	const max = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight)
	const step = await page.evaluate(() => Math.round(innerHeight * 0.6))
	let seen = 0
	for (let y = 0; y <= max + step - 1; y += step) {
		await page.evaluate((y) => scrollTo(0, y), Math.min(y, max))
		await settle(page)
		const a = await audit(page)
		const at = `${where} at ${Math.min(y, max)}`
		assert.deepEqual(a.missing, [], `${at}: every card wholly in view shows its chip where a press reaches it`)
		assert.deepEqual(a.strays, [], `${at}: no chip is pressable outside the part of its card that shows`)
		assert.deepEqual(a.onWords, [], `${at}: no placed chip meets its card's headings' words`)
		assert.ok(
			a.unplaced.every((id) => a.icon.includes(id)),
			`${at}: a card with no free corner gets the icon alone (${a.unplaced.join(', ')})`,
		)
		seen += a.expected
	}
	await page.evaluate(() => scrollTo(0, 0))
	return seen
}

/** The centre of card `id`'s chip after bringing the card to the middle of the screen, and whether a press there reaches the chip. */
const chipAt = (page: Page, id: string, which: 'cta' | 'undo' = 'cta') =>
	page.evaluate(
		async ({ id, which }) => {
			const card = [...document.querySelectorAll<HTMLElement>(`#main-content [data-aixc-item="${CSS.escape(id)}"]`)].find((c) => !c.closest('.owl-item.cloned'))!
			card.scrollIntoView({ block: 'center', inline: 'nearest' })
			await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(done, 60))))
			const chip = document.querySelector<HTMLElement>(`.pocket-chips .pocket-cta[data-pocket-for="${CSS.escape(id)}"]`)!
			const button = which === 'cta' ? chip : chip.parentElement!.querySelector<HTMLElement>('.pocket-liner__undo')!
			const r = button.getBoundingClientRect()
			const x = r.left + r.width / 2
			const y = r.top + r.height / 2
			const at = document.elementFromPoint(x, y)
			return { x, y, hit: !!at && (at === button || button.contains(at)) }
		},
		{ id, which },
	)

const records = (page: Page) => page.evaluate(() => (window as any).__aixc.demos.pocket.store.all().map((r: any) => ({ key: r.key, id: r.id, path: r.source.path, page: r.source.page, site: r.source.site ?? 'web' })) as { key: string; id: string; path: string; page: string; site: string }[])

async function clearStore(page: Page) {
	await page.evaluate(async () => {
		const { store } = (window as any).__aixc.demos.pocket
		await store.ready
		await store.clear()
	})
	await settle(page)
}

/** Ids of the cards on this page that have a chip, in page order. */
const chippedIds = (page: Page) => page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.pocket-chips .pocket-cta[data-pocket-for]')].map((c) => c.dataset.pocketFor!))

test('one "Pocket it" on every card a person can see, drawn outside Vodafone\'s elements, never in a link, out of the Tab order', async () => {
	for (const viewport of [DESKTOP, PHONE]) {
		const l = await launchLayer(gw, { viewport, owl: true, reducedMotion: true })
		try {
			const seen = watch(l.page)
			let wholeCards = 0
			for (const path of PAGES) {
				const where = `${path} ${viewport.width}`
				const L = LABELS[langOf(path)]
				await open(l.page, path, '?aixc=off')
				const without = await geometry(l.page)
				await open(l.page, path, '?aixc-debug')
				await chipsReady(l.page)
				const s = await structure(l.page)
				assert.ok(s.chips > 0, `${where}: chips are drawn (${s.chips})`)
				assert.equal(s.chips, s.ids, `${where}: one chip per card the page marks`)
				assert.deepEqual([s.strays, s.duplicates, s.inLink, s.inMain], [0, 0, 0, 0], `${where}: no stray or second chip, none inside a link, nothing of ours inside #main-content`)
				assert.deepEqual(s.root, { hidden: false, role: 'group', label: L.group, lang: langOf(path), marked: true, afterContent: true }, `${where}: one labelled group after the content`)
				assert.equal(s.tabbable, 0, `${where}: every chip and Put back is out of the Tab order (owner, 2026-11-13)`)
				for (const n of s.names) assert.equal(n.name, `${L.chip}${n.title}`, `${where}: ${n.id} is named from the model`)
				assert.ok(s.undoNames.every((u) => u.startsWith(L.undo)), `${where}: Put back's name starts with its visible label (WCAG 2.5.3)`)
				assert.deepEqual(await geometry(l.page), without, `${where}: Vodafone's page sits where it does without the layer`)
				const whole = await walk(l.page, where)
				// RED's plan cards are taller than a phone's screen, so none is ever wholly in view there.
				if (!(path === '/ar/vodafone-red1' && viewport === PHONE)) assert.ok(whole > 0, `${where}: cards were seen whole (${whole})`)
				wholeCards += whole
				if (path === '/en/services') {
					const d = (await chipsDebug(l.page))!
					assert.equal(s.chips, 30, `${where}: the 30 cards of Services`)
					assert.ok(d.shown.length >= (viewport === DESKTOP ? 21 : 8), `${where}: chips on every card laid out (${d.shown.length})`)
				}
				if (path === '/en/home' && viewport === DESKTOP) assert.deepEqual((await chipsDebug(l.page))!.unplaced, [], `${where}: every card of home has a free corner`)
			}
			assert.ok(wholeCards > (viewport === DESKTOP ? 40 : 20), `${viewport.width}: cards seen whole across the pages (${wholeCards})`)
			// A page the layer could not read well enough: no chips, the Pocket still there.
			await open(l.page, '/en/wireless-net', '?aixc-debug')
			await chipsReady(l.page)
			const s = await structure(l.page)
			assert.equal((await layerState(l.page)).coverage, 0)
			assert.equal(s.chips, 0, `wireless-net ${viewport.width}: no chips below the coverage gate`)
			assert.equal(s.root?.hidden, true)
			assert.ok(await l.page.evaluate(() => !!(window as any).__aixc.demos.pocket.store), `wireless-net ${viewport.width}: the Pocket itself is there`)
			assert.deepEqual(seen.pageErrors, [], 'no page errors')
			assert.deepEqual(l.reached, [], 'nothing reached the internet')
		} finally {
			await l.close()
		}
	}
})

test('a chip pockets its card and never navigates; Put back returns it; a sticker survives the theme\'s storage clear', async () => {
	for (const viewport of [DESKTOP, PHONE]) {
		const l = await launchLayer(gw, { viewport, owl: true, reducedMotion: true, themeClear: true })
		try {
			const seen = watch(l.page)
			const navigations: string[] = []
			l.page.on('framenavigated', (f) => {
				if (f === l.page.mainFrame()) navigations.push(f.url())
			})
			const popups: string[] = []
			l.b.context.on('page', (p) => popups.push(p.url()))
			for (const path of ['/en/vodafone-cash', '/ar/vodafone-cash', '/en/mobile-internet-bundles']) {
				const where = `${path} ${viewport.width}`
				const L = LABELS[langOf(path)]
				await open(l.page, path, '?aixc-debug')
				await chipsReady(l.page)
				await clearStore(l.page)
				const all = await chippedIds(l.page)
				assert.ok(all.length > 0, `${where}: chips are drawn`)
				// On the bundles, the cards that are links or sit inside one, and one more.
				const inLinks = await l.page.evaluate((ids) => ids.filter((id) => document.querySelector(`#main-content [data-aixc-item="${CSS.escape(id)}"]`)?.closest('a[href]')), all)
				const ids = path === '/en/mobile-internet-bundles' ? [...new Set([...inLinks.slice(0, 3), all.find((id) => !inLinks.includes(id)) ?? all[0]])] : all
				if (path === '/en/vodafone-cash') assert.equal(ids.length, 8, `${where}: the 8 tickets`)
				const start = { url: l.page.url(), history: await l.page.evaluate(() => history.length), navigations: navigations.length, refused: l.refused.length }
				for (const id of ids) {
					const at = await chipAt(l.page, id)
					assert.equal(at.hit, true, `${where} ${id}: a press at the chip reaches the chip`)
					await l.page.mouse.click(at.x, at.y)
					await l.page.waitForFunction((id) => (window as any).__aixc.demos.pocket.store.all().some((r: any) => r.id === id), id, { timeout: 5_000 })
					const liner = await chipAt(l.page, id, 'undo')
					assert.equal(liner.hit, true, `${where} ${id}: Put back is where the card was`)
					const text = await l.page.evaluate((id) => document.querySelector(`.pocket-chips .pocket-cta[data-pocket-for="${CSS.escape(id)}"]`)!.parentElement!.querySelector('.pocket-liner__text')!.textContent, id)
					assert.equal(text, L.liner, `${where} ${id}: the liner says so in the page's language`)
				}
				const kept = await records(l.page)
				const page = await l.page.evaluate(() => location.pathname)
				assert.deepEqual(kept.map((r) => r.id).sort(), [...ids].sort(), `${where}: one sticker per card pressed`)
				assert.ok(
					kept.every((r) => r.path === page && r.site === 'web' && !ids.includes(r.key)),
					`${where}: each kept on this page of the website, under its own key`,
				)
				assert.deepEqual({ url: l.page.url(), history: await l.page.evaluate(() => history.length), navigations: navigations.length, refused: l.refused.length }, start, `${where}: nothing navigated and nothing was fetched`)
				// Put back the first.
				const undo = await chipAt(l.page, ids[0], 'undo')
				await l.page.mouse.click(undo.x, undo.y)
				await l.page.waitForFunction((id) => !(window as any).__aixc.demos.pocket.store.all().some((r: any) => r.id === id), ids[0], { timeout: 5_000 })
				assert.equal((await chipAt(l.page, ids[0])).hit, true, `${where}: the chip is back on ${ids[0]}`)
				// With a modifier, or the middle button, a chip still opens nothing.
				const c = await chipAt(l.page, ids[0])
				for (const key of ['ControlOrMeta', 'Shift']) {
					await l.page.keyboard.down(key)
					await l.page.mouse.click(c.x, c.y)
					await l.page.keyboard.up(key)
				}
				await l.page.mouse.click(c.x, c.y, { button: 'middle' })
				await l.page.waitForTimeout(300)
				assert.equal(navigations.length, start.navigations, `${where}: a modified press navigates nowhere`)
				assert.deepEqual(popups, [], `${where}: and opens no tab`)
				// The theme clears localStorage on every load; the stickers are kept elsewhere.
				const keptIds = (await records(l.page)).map((r) => r.id)
				assert.ok(keptIds.length >= ids.length - 1)
				await l.page.reload({ waitUntil: 'load' })
				await chipsReady(l.page)
				await l.page.waitForFunction((n) => (window as any).__aixc.demos.pocket.state.ids.length === n, keptIds.length, { timeout: 5_000 })
				await settle(l.page)
				const pocketed = await l.page.evaluate((ids) => ids.filter((id) => document.querySelector(`.pocket-chips .pocket-cta[data-pocket-for="${CSS.escape(id)}"]`)?.parentElement?.classList.contains('is-pocketed')), keptIds)
				assert.deepEqual(pocketed, keptIds, `${where}: after a reload that clears storage, the cards are still pocketed`)
			}
			assert.deepEqual(seen.pageErrors, [], 'no page errors')
			assert.deepEqual(l.reached, [], 'nothing reached the internet')
		} finally {
			await l.close()
		}
	}
})

/** Records every change inside #main-content that is not the layer's two marks or its hiding of the whole. */
const watchMain = (page: Page) =>
	page.evaluate(() => {
		const w = window as any
		const main = document.getElementById('main-content')!
		w.__mainWrites = [] as string[]
		w.__models = 0
		document.addEventListener('aixc:model', () => w.__models++)
		new MutationObserver((list) => {
			for (const r of list) {
				if (r.type === 'attributes' && (r.attributeName === 'data-aixc-item' || r.attributeName === 'data-aixc-section')) continue
				if (r.type === 'attributes' && r.attributeName === 'hidden' && r.target === main) continue
				w.__mainWrites.push(`${r.type} ${r.attributeName ?? ''} on ${(r.target as Element).nodeName ?? '#text'}.${(r.target as Element).className ?? ''}`)
			}
		}).observe(main, { subtree: true, childList: true, attributes: true, characterData: true })
		return { reads: w.__aixc.reads as number, marks: [...document.querySelectorAll<HTMLElement>('[data-aixc-item]')].map((n) => n.dataset.aixcItem) }
	})
const mainSince = (page: Page) => page.evaluate(() => ({ writes: (window as any).__mainWrites as string[], models: (window as any).__models as number, reads: (window as any).__aixc.reads as number, marks: [...document.querySelectorAll<HTMLElement>('[data-aixc-item]')].map((n) => n.dataset.aixcItem) }))

/** The largest number of elements marked as card `id` seen over `ms`, sampled every frame. */
const marksOver = (page: Page, id: string, ms: number) =>
	page.evaluate(
		({ id, ms }) =>
			new Promise<number>((done) => {
				let most = 0
				const end = performance.now() + ms
				const tick = () => {
					most = Math.max(most, document.querySelectorAll(`[data-aixc-item="${CSS.escape(id)}"]`).length)
					if (performance.now() < end) requestAnimationFrame(tick)
					else done(most)
				}
				tick()
			}),
		{ id, ms },
	)

test('hover, pocket, put back and the album change nothing of Vodafone\'s page; one element per card stays marked', async () => {
	for (const path of ['/en/services', '/ar/services', '/en/mobile-internet-bundles']) {
		const l = await launchLayer(gw, { owl: true })
		try {
			const seen = watch(l.page)
			await open(l.page, path, '?aixc-debug')
			await chipsReady(l.page)
			await clearStore(l.page)
			const before = await watchMain(l.page)
			const ids = await chippedIds(l.page)
			const id = ids[1]
			const where = `${path} ${id}`
			// Hover: the lift.
			const at = await chipAt(l.page, id)
			assert.equal(at.hit, true)
			await l.page.mouse.move(at.x, at.y)
			const liftMarks = await marksOver(l.page, id, 400)
			assert.equal(await l.page.evaluate(() => document.querySelectorAll('.pocket-chips .curl-host--inside[aria-hidden="true"][inert]').length), 1, `${where}: the lift runs, hidden from assistive technology`)
			assert.equal(liftMarks, 1, `${where}: one element marked as the card during the lift (B-49)`)
			// Pocket: the peel in place (no flight before the corner exists, S11).
			await l.page.mouse.click(at.x, at.y)
			assert.equal(await marksOver(l.page, id, 700), 1, `${where}: one element marked as the card during the peel (B-49)`)
			assert.equal(await l.page.evaluate(() => document.querySelectorAll('.curl-host--flying').length), 0, `${where}: nothing flies before the Pocket has its corner`)
			// Put back.
			const undo = await chipAt(l.page, id, 'undo')
			await l.page.mouse.click(undo.x, undo.y)
			await l.page.waitForTimeout(700)
			// The album: the chips stand aside while it shows and come back where they were.
			const keep = await chipAt(l.page, ids[0])
			await l.page.mouse.click(keep.x, keep.y)
			await l.page.waitForTimeout(700)
			const boxes = () => l.page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.pocket-chips .pocket-cta')].filter((c) => c.offsetParent).map((c) => [c.dataset.pocketFor, ...Object.values(c.getBoundingClientRect().toJSON()).map((v) => Math.round(v as number))].join(' ')))
			const y = await l.page.evaluate(() => scrollY)
			const was = await boxes()
			await l.page.evaluate(() => (window as any).__aixc.demos.pocket.open())
			await l.page.waitForFunction(() => {
				const s = (window as any).__aixc.demos.pocket.state
				return s.view === 'pocket' && !s.busy
			}, null, { timeout: 10_000 })
			assert.equal(await l.page.evaluate(() => (document.querySelector('.pocket-chips') as HTMLElement).hidden), true, `${where}: no chip while the album shows`)
			await l.page.evaluate(() => (window as any).__aixc.demos.pocket.close())
			await l.page.waitForFunction(() => {
				const s = (window as any).__aixc.demos.pocket.state
				return s.view === 'page' && !s.busy
			}, null, { timeout: 10_000 })
			await settle(l.page)
			assert.ok(Math.abs((await l.page.evaluate(() => scrollY)) - y) <= 2)
			assert.deepEqual(await boxes(), was, `${where}: the chips are back where they were`)
			// Another tab pockets a card: this one shows it, still writing nothing into Vodafone's page.
			const other = await l.b.context.newPage()
			await open(other, path, '?aixc-debug')
			await chipsReady(other)
			const there = await chipAt(other, ids[2])
			await other.mouse.click(there.x, there.y)
			await l.page.waitForFunction((id) => document.querySelector(`.pocket-chips .pocket-cta[data-pocket-for="${CSS.escape(id)}"]`)?.parentElement?.classList.contains('is-pocketed'), ids[2], { timeout: 2_000 })
			await other.close()
			const after = await mainSince(l.page)
			assert.deepEqual(after.writes, [], `${where}: nothing written into Vodafone's content`)
			assert.deepEqual([after.models, after.reads - before.reads], [0, 0], `${where}: the page was never read again`)
			assert.deepEqual(after.marks, before.marks, `${where}: the same elements, marked the same`)
			assert.deepEqual(seen.pageErrors, [], `${where}: no page errors`)
		} finally {
			await l.close()
		}
	}
})

test('chips sit inside Owl\'s stage like their cards, and follow it when it moves', async () => {
	for (const viewport of [DESKTOP, PHONE]) {
		const l = await launchLayer(gw, { viewport, owl: true, reducedMotion: true })
		try {
			const seen = watch(l.page)
			for (const path of ['/en/services', '/ar/vodafone-red1']) {
				const where = `${path} ${viewport.width}`
				await open(l.page, path, '?aixc-debug')
				await chipsReady(l.page)
				const stages = await l.page.evaluate(() => document.querySelectorAll('#main-content .owl-stage-outer').length)
				assert.ok(stages > 0, `${where}: Owl's stages are laid out`)
				for (let i = 0; i < stages; i++) {
					// Each stage in view, then moved by one slide with a transition, then a link in a hidden slide focused.
					const offStage = await l.page.evaluate(async (i) => {
						const outer = document.querySelectorAll<HTMLElement>('#main-content .owl-stage-outer')[i]
						outer.scrollIntoView({ block: 'center' })
						await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(done, 60))))
						const hidden = [...outer.querySelectorAll<HTMLElement>('.owl-item:not(.active):not(.cloned) [data-aixc-item]')]
						return hidden.map((card) => {
							const chip = document.querySelector<HTMLElement>(`.pocket-chips .pocket-cta[data-pocket-for="${CSS.escape(card.dataset.aixcItem!)}"]`)
							if (!chip) return null
							const r = chip.getBoundingClientRect()
							const at = r.width ? document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) : null
							return at && (at === chip || chip.contains(at)) ? card.dataset.aixcItem : null
						})
					}, i)
					assert.deepEqual(offStage.filter(Boolean), [], `${where} stage ${i}: no chip of an off-stage card can be pressed`)
					const a = await audit(l.page)
					assert.deepEqual([a.missing, a.strays], [[], []], `${where} stage ${i}: the stage's cards show their chips, cut where the stage cuts`)
					const moved = await l.page.evaluate(async (i) => {
						const outer = document.querySelectorAll<HTMLElement>('#main-content .owl-stage-outer')[i]
						const stage = outer.querySelector<HTMLElement>('.owl-stage')!
						const item = stage.querySelector<HTMLElement>('.owl-item')!
						const step = item.getBoundingClientRect().width + parseFloat(getComputedStyle(item).marginRight || '0') + parseFloat(getComputedStyle(item).marginLeft || '0')
						const rtl = document.documentElement.dir === 'rtl'
						const m = new DOMMatrix(getComputedStyle(stage).transform)
						const ended = new Promise((done) => stage.addEventListener('transitionend', done, { once: true }))
						stage.style.transition = 'transform 0.3s ease'
						stage.style.transform = `translate3d(${m.m41 + (rtl ? step : -step)}px, 0, 0)`
						await Promise.race([ended, new Promise((done) => setTimeout(done, 1000))])
						await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(done, 60))))
						return step
					}, i)
					assert.ok(moved > 0)
					const b = await audit(l.page)
					assert.deepEqual([b.missing, b.strays], [[], []], `${where} stage ${i}: after the stage moved, the chips followed`)
					const focused = await l.page.evaluate(async (i) => {
						const outer = document.querySelectorAll<HTMLElement>('#main-content .owl-stage-outer')[i]
						const link = [...outer.querySelectorAll<HTMLElement>('.owl-item:not(.active):not(.cloned) a[href]')].at(-1)
						if (!link) return false
						const before = outer.scrollLeft
						link.focus()
						await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(done, 60))))
						return outer.scrollLeft !== before
					}, i)
					if (focused) {
						const c = await audit(l.page)
						assert.deepEqual([c.missing, c.strays], [[], []], `${where} stage ${i}: after focus scrolled the stage, the chips followed`)
					}
				}
			}
			assert.deepEqual(seen.pageErrors, [], 'no page errors')
		} finally {
			await l.close()
		}
	}
})

/** The element that has focus, through shadow roots and frames, as a short description. */
const focusNow = (page: Page) =>
	page.evaluate(() => {
		let a: Element | null = document.activeElement
		while (a?.shadowRoot?.activeElement) a = a.shadowRoot.activeElement
		if (!a || a === document.body) return 'body'
		return `${a.tagName.toLowerCase()} ${a.getAttribute('href') ?? ''} ${(a.getAttribute('aria-label') ?? a.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 40)}${a.closest('.pocket-chips') ? ' [chips]' : ''}`
	})

async function tabs(page: Page, n: number) {
	await page.evaluate(() => {
		;(document.activeElement as HTMLElement | null)?.blur?.()
		scrollTo(0, 0)
	})
	const out: string[] = []
	for (let i = 0; i < n; i++) {
		await page.keyboard.press('Tab')
		out.push(await focusNow(page))
	}
	return out
}

test('keyboard: the Tab order is Vodafone\'s own; screen readers reach each chip by name and land back on the card; no key is handled on the page', async () => {
	const cases = [
		{ path: '/en/services', viewport: DESKTOP },
		{ path: '/ar/services', viewport: DESKTOP },
		{ path: '/en/vodafone-cash', viewport: DESKTOP },
		{ path: '/en/services', viewport: PHONE },
	]
	for (const c of cases) {
		const l = await launchLayer(gw, { viewport: c.viewport, owl: true, reducedMotion: true })
		try {
			const seen = watch(l.page)
			const where = `${c.path} ${c.viewport.width}`
			const L = LABELS[langOf(c.path)]
			await open(l.page, c.path, '?aixc=off')
			const off = await tabs(l.page, 60)
			await open(l.page, c.path, '?aixc-debug')
			await chipsReady(l.page)
			assert.ok((await chippedIds(l.page)).length > 0, `${where}: chips are drawn`)
			await clearStore(l.page)
			const on = await tabs(l.page, 60)
			assert.deepEqual(on, off, `${where}: the Tab sequence is the one ?aixc=off gives, no stop added`)
			if (c.viewport !== DESKTOP) continue
			// A card a keyboard user reaches on Vodafone's page, and its chip by name.
			const pick = await l.page.evaluate(() => {
				const ok = (n: HTMLElement) => n.tabIndex >= 0 && n.checkVisibility({ visibilityProperty: true })
				for (const chip of document.querySelectorAll<HTMLElement>('.pocket-chips .pocket-cta[data-pocket-for]')) {
					const card = [...document.querySelectorAll<HTMLElement>(`#main-content [data-aixc-item="${CSS.escape(chip.dataset.pocketFor!)}"]`)].find((n) => !n.closest('.owl-item.cloned'))
					if (!card || card.closest('.owl-item:not(.active)')) continue
					const own = ok(card) && card.matches('a[href], button') ? card : [...card.querySelectorAll<HTMLElement>('a[href], button')].find(ok)
					if (own) return { id: chip.dataset.pocketFor!, name: chip.getAttribute('aria-label')!, own: `${own.tagName.toLowerCase()} ${own.getAttribute('href') ?? ''}` }
				}
				return null
			})
			assert.ok(pick, `${where}: a card with its own link`)
			const title = pick.name.slice(L.chip.length)
			// Vodafone's own next stop after the card, from its last stop inside.
			const nextStop = await l.page.evaluate((id) => {
				const card = [...document.querySelectorAll<HTMLElement>(`#main-content [data-aixc-item="${CSS.escape(id)}"]`)].find((n) => !n.closest('.owl-item.cloned'))!
				const inside = [...card.querySelectorAll<HTMLElement>('a[href], button, [tabindex]')].filter((n) => n.tabIndex >= 0)
				;(inside.at(-1) ?? card).focus()
			}, pick.id)
			void nextStop
			await l.page.keyboard.press('Tab')
			const vodafoneNext = await focusNow(l.page)
			// The screen-reader route: the chip by its name, pressed with Enter.
			const chip = l.page.getByRole('button', { name: pick.name, exact: true })
			await chip.focus()
			await chip.press('Enter')
			await l.page.waitForFunction((id) => (window as any).__aixc.demos.pocket.store.all().some((r: any) => r.id === id), pick.id, { timeout: 5_000 })
			assert.equal(await focusNow(l.page), `button  ${L.undo}${title} [chips]`, `${where}: focus moves to Put back`)
			const status = (title: string) =>
				l.page
					.waitForFunction((title) => (document.querySelector('.aixc-sr-only[role="status"]')?.textContent ?? '').includes(title), title, { timeout: 2_000 })
					.then(() => l.page.evaluate(() => document.querySelector('.aixc-sr-only[role="status"]')?.textContent ?? ''))
			const said = await status(title)
			assert.ok(said.includes(title), `${where}: the pocketing is announced (${said})`)
			if (langOf(c.path) === 'ar') assert.ok(!/is in your pocket|in your pocket/.test(said) && /جيبك/.test(said), `${where}: announced in Arabic (B-48): ${said}`)
			// Escape: back to the card on Vodafone's page.
			await l.page.keyboard.press('Escape')
			assert.equal((await focusNow(l.page)).startsWith(pick.own), true, `${where}: Escape lands on the card's own link`)
			// Put back, by name.
			const undo = l.page.getByRole('button', { name: `${L.undo}${title}`, exact: true })
			await undo.focus()
			await undo.press('Enter')
			await l.page.waitForFunction((id) => !(window as any).__aixc.demos.pocket.store.all().some((r: any) => r.id === id), pick.id, { timeout: 5_000 })
			assert.equal(await focusNow(l.page), `button  ${pick.name} [chips]`, `${where}: focus returns to the chip`)
			await l.page.waitForTimeout(100)
			const back = await status(title)
			if (langOf(c.path) === 'ar') assert.ok(!/back on the page/.test(back) && /للصفحة/.test(back), `${where}: put back announced in Arabic (B-48): ${back}`)
			// Tab from the chip: on to what follows the card on Vodafone's page.
			await l.page.keyboard.press('Tab')
			assert.equal(await focusNow(l.page), vodafoneNext, `${where}: Tab from the chip goes where Tab from the card goes`)
			// No shortcut: Alt+Shift+P on the card does nothing.
			await l.page.evaluate((id) => {
				const card = [...document.querySelectorAll<HTMLElement>(`#main-content [data-aixc-item="${CSS.escape(id)}"]`)].find((n) => !n.closest('.owl-item.cloned'))!
				;([...card.querySelectorAll<HTMLElement>('a[href], button')].find((n) => n.tabIndex >= 0) ?? card).focus()
			}, pick.id)
			await l.page.keyboard.press('Alt+Shift+KeyP')
			await l.page.waitForTimeout(200)
			assert.deepEqual(await records(l.page), [], `${where}: no key pockets anything`)
			assert.deepEqual(seen.pageErrors, [], `${where}: no page errors`)
		} finally {
			await l.close()
		}
	}
})

test('chips only where the page was read well enough; they follow a new reading, resizes and pictures', async () => {
	const l = await launchLayer(gw, { owl: true, reducedMotion: true })
	try {
		const seen = watch(l.page)
		await open(l.page, '/en/services', '?aixc-debug')
		await chipsReady(l.page)
		const before = await chippedIds(l.page)
		assert.ok(before.length > 0, 'chips are drawn')
		await l.page.evaluate(() => {
			for (const s of document.querySelectorAll<HTMLElement>('.pocket-chips > .pocket-host')) s.dataset.probe = s.querySelector<HTMLElement>('.pocket-cta')!.dataset.pocketFor!
		})
		// A card Vodafone adds later: the page is read again and the new card gets a chip; the others keep theirs.
		const reads = await l.page.evaluate(() => (window as any).__aixc.reads)
		await l.page.evaluate(() => {
			const card = [...document.querySelectorAll<HTMLElement>('#main-content [data-aixc-item]')].find((c) => !c.closest('.owl-item') && c.querySelectorAll('h1, h2, h3, h4, h5, h6').length === 1)!
			const copy = card.cloneNode(true) as HTMLElement
			for (const n of [copy, ...copy.querySelectorAll('*')]) for (const a of [...n.getAttributeNames()]) if (a.startsWith('data-aixc') || a === 'id') n.removeAttribute(a)
			copy.querySelector('h1, h2, h3, h4, h5, h6')!.textContent = 'Stand-in Added Service'
			card.after(copy)
		})
		await l.page.waitForFunction((n) => (window as any).__aixc.reads > n, reads, { timeout: 10_000 })
		await l.page.waitForFunction((n) => document.querySelectorAll('.pocket-chips .pocket-cta[data-pocket-for]').length > n, before.length, { timeout: 5_000 })
		await settle(l.page)
		const now = await l.page.evaluate(() =>
			[...document.querySelectorAll<HTMLElement>('.pocket-chips > .pocket-host')].map((s) => ({ probe: s.dataset.probe ?? null, id: s.querySelector<HTMLElement>('.pocket-cta')!.dataset.pocketFor!, name: s.querySelector('.pocket-cta')!.getAttribute('aria-label') })),
		)
		assert.ok(now.some((x) => x.probe === null && x.name === 'Pocket it: Stand-in Added Service'), 'the added card has its chip')
		// The copy shares its original's link, so the reading may name the original anew; every other card keeps its chip.
		const kept = before.filter((id) => now.some((x) => x.id === id))
		assert.ok(kept.length >= before.length - 1, `the cards keep their ids (${before.length - kept.length} renamed)`)
		assert.deepEqual(
			kept.filter((id) => !now.some((x) => x.id === id && x.probe === id)),
			[],
			'every card that kept its id keeps the chip it had',
		)
		// Below the coverage gate: no chips; above it again: back.
		const coverage = (ratio: number) =>
			l.page.evaluate((ratio) => {
				const w = window as any
				document.dispatchEvent(new CustomEvent('aixc:model', { detail: { model: w.__aixc.model, coverage: { ...w.__aixc.coverage, ratio } } }))
			}, ratio)
		await coverage(0.5)
		await settle(l.page)
		assert.deepEqual([(await chippedIds(l.page)).length, await l.page.evaluate(() => (document.querySelector('.pocket-chips') as HTMLElement).hidden)], [0, true], 'below 0.6: no chips')
		await coverage(1)
		await settle(l.page)
		assert.ok((await chippedIds(l.page)).length >= before.length, 'at 1: the chips are back')
		// Resizes.
		for (const viewport of [{ width: 1024, height: 800 }, PHONE, DESKTOP]) {
			await l.page.setViewportSize(viewport)
			await settle(l.page)
			await l.page.waitForTimeout(150)
			await walk(l.page, `/en/services at ${viewport.width} after a resize`)
		}
		// A picture that arrives late and makes its card taller: the chip stays in its corner.
		const grown = await l.page.evaluate(async () => {
			for (const card of document.querySelectorAll<HTMLElement>('#main-content [data-aixc-item]')) {
				const img = card.querySelector<HTMLElement>('img')
				const chip = document.querySelector<HTMLElement>(`.pocket-chips .pocket-cta[data-pocket-for="${CSS.escape(card.dataset.aixcItem!)}"]`)
				if (!img || !chip || card.closest('.owl-item')) continue
				card.scrollIntoView({ block: 'start' })
				const h = card.getBoundingClientRect().height
				const was = img.style.cssText
				img.style.cssText += ';display:block;height:400px'
				await new Promise((done) => setTimeout(done, 200))
				const c = card.getBoundingClientRect()
				if (c.height - h <= 50) {
					img.style.cssText = was
					continue
				}
				const r = chip.getBoundingClientRect()
				return { id: card.dataset.aixcItem, grew: c.height - h, inside: r.left >= c.left - 0.5 && r.right <= c.right + 0.5 && r.top >= c.top - 0.5 && r.bottom <= c.bottom + 0.5 }
			}
			return { id: null, grew: 0, inside: false }
		})
		assert.ok(grown.grew > 50, `the card grew (${grown.grew})`)
		assert.equal(grown.inside, true, 'the chip followed it')
		assert.deepEqual(seen.pageErrors, [], 'no page errors')
	} finally {
		await l.close()
	}
})

test('chips never cover Vodafone\'s header, accessibility button, cookie banner or dialogs', async () => {
	for (const viewport of [DESKTOP, PHONE]) {
		for (const path of ['/en/services', '/ar/services']) {
			const where = `${path} ${viewport.width}`
			const l = await launchLayer(gw, { viewport, owl: true, reducedMotion: true, banner: true, fixedHeader: true })
			try {
				const seen = watch(l.page)
				await open(l.page, path, '?aixc=off')
				const transition = await l.page.evaluate(() => getComputedStyle(document.getElementById('vodafone-aw-icon')!).transition)
				await open(l.page, path, '?aixc-debug')
				await chipsReady(l.page)
				assert.ok((await chippedIds(l.page)).length > 0, `${where}: chips are drawn`)
				const pressable = () =>
					l.page.evaluate(() =>
						[...document.querySelectorAll<HTMLElement>('.pocket-chips .pocket-cta')].filter((c) => {
							const r = c.getBoundingClientRect()
							if (!r.width || r.bottom < 0 || r.top > innerHeight) return false
							const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
							return !!at && (at === c || c.contains(at))
						}).length,
					)
				// The first visit: OneTrust's banner and its filter are over everything.
				const f = await furniture(l.page)
				assert.equal(f.banner?.onTop, true, `${where}: the banner is on top`)
				assert.equal(await pressable(), 0, `${where}: no chip can be pressed while the banner shows`)
				assert.equal(await l.page.evaluate(() => {
					const b = document.getElementById('onetrust-accept-btn-handler')!.getBoundingClientRect()
					return document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2)?.id
				}), 'onetrust-accept-btn-handler', `${where}: the banner's buttons can be pressed`)
				await l.page.click('#onetrust-accept-btn-handler')
				// Down the page: the widget's button on top, the pinned header over any chip under it.
				const max = await l.page.evaluate(() => document.documentElement.scrollHeight - innerHeight)
				for (let y = 0; y <= max; y += 300) {
					await l.page.evaluate((y) => scrollTo(0, y), y)
					await settle(l.page)
					const g = await furniture(l.page)
					assert.equal(g.button?.onTop, true, `${where} at ${y}: the accessibility button is on top`)
					const under = await l.page.evaluate(() => {
						const nav = document.querySelector('.nav-header.nav-fixed')!.getBoundingClientRect()
						return [...document.querySelectorAll<HTMLElement>('.pocket-chips .pocket-cta')].filter((c) => {
							const r = c.getBoundingClientRect()
							const x = r.left + r.width / 2
							const y = r.top + r.height / 2
							if (!r.width || y < nav.top || y > nav.bottom || x < nav.left || x > nav.right) return false
							const at = document.elementFromPoint(x, y)
							return !!at && (at === c || c.contains(at))
						}).length
					})
					assert.equal(under, 0, `${where} at ${y}: no chip shows over the pinned header`)
				}
				// One of Vodafone's dialogs open: no chip above it.
				await l.page.evaluate(() => scrollTo(0, 0))
				await l.page.evaluate(() => {
					const m = document.createElement('div')
					m.className = 'modal fade show'
					m.style.cssText = 'display:block;position:fixed;inset:0;z-index:99;background:rgba(0,0,0,.5)'
					m.id = 'stand-in-modal'
					document.body.appendChild(m)
				})
				await settle(l.page)
				assert.equal(await pressable(), 0, `${where}: no chip can be pressed over a dialog`)
				assert.equal(await l.page.evaluate(() => getComputedStyle(document.getElementById('vodafone-aw-icon')!).transition), transition, `${where}: the widget's own styles are untouched`)
				assert.deepEqual(seen.pageErrors, [], `${where}: no page errors`)
			} finally {
				await l.close()
			}
		}
	}
})

/** Vodafone's page as a person would get it: #wrapper, the body's and the root's attributes. */
const served = (page: Page) =>
	page.evaluate(() => {
		const attrs = (n: Element) => [...n.attributes].map((a) => `${a.name}=${a.value}`).join(' ')
		return { wrapper: document.getElementById('wrapper')?.outerHTML ?? null, body: attrs(document.body), html: attrs(document.documentElement) }
	})

test('a failure while drawing or using chips removes the layer and leaves the page as with ?aixc=off', async () => {
	for (const step of ['pocket-chips', 'pocket-chip']) {
		const l = await launchLayer(gw, { reducedMotion: true, initScripts: step === 'pocket-chips' ? [`window.__AIXC_TEST__ = { failAt: 'pocket-chips' }`] : [] })
		try {
			const seen = watch(l.page)
			await open(l.page, '/en/services', '?aixc=off')
			const without = await served(l.page)
			await open(l.page, '/en/services', '?aixc-debug')
			if (step === 'pocket-chip') {
				await chipsReady(l.page)
				const id = (await chippedIds(l.page))[0]
				const at = await chipAt(l.page, id)
				await l.page.evaluate(() => {
					;(window as any).__AIXC_TEST__ = { failAt: 'pocket-chip' }
				})
				await l.page.mouse.click(at.x, at.y)
			}
			await l.page.waitForFunction(() => (window as any).__aixc?.state === 'failed', null, { timeout: 15_000 })
			const failure = await l.page.evaluate(() => (window as any).__aixc.failure)
			assert.match(failure.message, new RegExp(step), `${step}: the error is the one thrown`)
			const s = await layerState(l.page)
			assert.deepEqual([s.added, s.tags, s.mainHidden], [0, 0, false], `${step}: nothing of the layer is left, Vodafone's content shown`)
			await l.page.evaluate(() => scrollTo(0, 0))
			assert.deepEqual(await served(l.page), without, `${step}: the page is as with ?aixc=off`)
			// Nothing left listening: scrolling, resizing and keys do nothing.
			await l.page.evaluate(() => scrollTo(0, 900))
			await l.page.setViewportSize(PHONE)
			await l.page.keyboard.press('Tab')
			await l.page.waitForTimeout(300)
			assert.equal((await layerState(l.page)).added, 0, `${step}: still nothing of the layer`)
			assert.deepEqual(seen.pageErrors, [], `${step}: no error reached the page`)
			assert.ok(seen.layer.some((x) => x.startsWith('error: [AIXC]') && x.includes('pocket')), `${step}: the layer said so (${seen.layer.join(' | ')})`)
		} finally {
			await l.close()
		}
	}
})
