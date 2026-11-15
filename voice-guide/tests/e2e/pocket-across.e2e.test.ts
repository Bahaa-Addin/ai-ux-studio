/**
 * One Pocket across Vodafone's pages (live plan phase 3, S7; ADR-0051 §6 and §7), on the saved pages
 * with the live-page kit (./vodafone-layer.ts), the theme's storage clear stood in.
 *
 * - The album groups its stickers by the page they were kept on, this page first, each group named
 *   in the page's language when a sticker knows the page by that name; a sticker kept in the other
 *   language says so (lang, dir).
 * - A page read again places its stickers on the cards they stand on now, even when an editor adds a
 *   card sharing a link and the cards' ids change (AIXC-41): the right card shows "In your pocket".
 * - A sticker whose card is no longer on its page says so, but only after a read that counts.
 * - Tabs stay in step; a walk over the theme's clearing pages loses nothing, in either language.
 */
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'

import type { Page } from 'playwright'

import { type LayerGateway, launchLayer, open, startLayerGateway, watch } from './vodafone-layer.ts'

const PORT = 4487
let gw: LayerGateway

before(async () => {
	gw = await startLayerGateway(PORT)
})
after(async () => {
	await gw?.close()
})

/* eslint-disable @typescript-eslint/no-explicit-any */
/** Two frames and a little more: the chips' pass runs on a frame. */
const settle = (page: Page) => page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(done, 60)))))

/** The Pocket started and drew its chips (or decided there are none). */
async function ready(page: Page, path: string, query = '?aixc-debug') {
	await open(page, path, query)
	await page.waitForFunction(() => (window as any).__aixc?.demos?.pocket?.chips, null, { timeout: 15_000 })
	// The store has read what it holds and the page has been matched against it.
	await page.evaluate(() => (window as any).__aixc.demos.pocket.store.ready)
	await settle(page)
}

const chippedIds = (page: Page) => page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.pocket-chips .pocket-cta[data-pocket-for]')].map((c) => c.dataset.pocketFor!))

/** Ids of the cards whose chip says they are in the pocket. */
const pocketedIds = (page: Page) => page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.pocket-chips .pocket-host.is-pocketed .pocket-cta[data-pocket-for]')].map((c) => c.dataset.pocketFor!))

/** What the Pocket holds, read from the store. */
const records = (page: Page) => page.evaluate(() => (window as any).__aixc.demos.pocket.store.all().map((r: any) => ({ key: r.key, id: r.id, page: r.source.page, title: r.source.title, lang: r.copy.lang })) as { key: string; id: string; page: string; title: Record<string, string>; lang: string }[])

/** Presses card `id`'s chip and waits until its sticker is kept. */
async function pocket(page: Page, id: string) {
	await page.evaluate((id) => document.querySelector<HTMLElement>(`.pocket-chips .pocket-cta[data-pocket-for="${CSS.escape(id)}"]`)!.click(), id)
	await page.waitForFunction((id) => (window as any).__aixc.demos.pocket.store.all().some((r: any) => r.id === id), id, { timeout: 5_000 })
	await settle(page)
}

/** The first `n` cards that have a chip, those with a link of their own first (stable ids, found again in the other language). */
const linked = (page: Page, n: number) =>
	page.evaluate((n) => {
		const withLink: string[] = []
		const without: string[] = []
		for (const c of document.querySelectorAll<HTMLElement>('#main-content [data-aixc-item]')) {
			const id = c.dataset.aixcItem!
			if (c.closest('.owl-item') || withLink.includes(id) || without.includes(id) || !document.querySelector(`.pocket-chips .pocket-cta[data-pocket-for="${CSS.escape(id)}"]`)) continue
			const link = c.matches('a[href]') ? c : c.querySelector('a[href]')
			;(/^(\/|https?:)/.test(link?.getAttribute('href') ?? '') ? withLink : without).push(id)
		}
		return [...withLink, ...without].slice(0, n)
	}, n)

async function openAlbum(page: Page) {
	await page.evaluate(() => (window as any).__aixc.demos.pocket.open())
	await page.waitForFunction(
		() => {
			const s = (window as any).__aixc.demos.pocket.state
			return s.view === 'pocket' && !s.busy
		},
		null,
		{ timeout: 10_000 },
	)
	await settle(page)
}

async function closeAlbum(page: Page) {
	await page.evaluate(() => (window as any).__aixc.demos.pocket.close())
	await page.waitForFunction(
		() => {
			const s = (window as any).__aixc.demos.pocket.state
			return s.view === 'page' && !s.busy
		},
		null,
		{ timeout: 10_000 },
	)
	await settle(page)
}

interface Sticker {
	title: string
	tag: string
	lang: string
	dir: string
	gone: string | null
	date: string | null
}
interface Group {
	title: string
	tag: string
	lang: string
	dir: string
	here: string | null
	stickers: Sticker[]
}

/** The album as a person reads it. */
const album = (page: Page) =>
	page.evaluate(() => {
		const root = document.querySelector<HTMLElement>('#pocket-output')!
		return {
			open: !root.hidden,
			lead: root.querySelector('.pocket-view__lead')?.textContent ?? '',
			flat: root.querySelectorAll('.pocket-groups').length === 0,
			groups: [...root.querySelectorAll<HTMLElement>('.pocket-group')].map((g) => {
				const h = g.querySelector<HTMLElement>('.pocket-group__title')!
				return {
					title: h.textContent ?? '',
					tag: h.tagName,
					lang: h.lang,
					dir: h.dir,
					here: g.querySelector('.pocket-group__here')?.textContent ?? null,
					stickers: [...g.querySelectorAll<HTMLElement>('.pocket-sticker')].map((s) => {
						const t = s.querySelector<HTMLElement>('.pocket-sticker__title')!
						return { title: t.textContent ?? '', tag: t.tagName, lang: t.lang, dir: t.dir, gone: s.querySelector('.pocket-sticker__gone')?.textContent ?? null, date: s.querySelector('.pocket-sticker__date')?.textContent ?? null }
					}),
				} as Group
			}),
		}
	})

async function clearStore(page: Page) {
	await page.evaluate(async () => {
		const { store } = (window as any).__aixc.demos.pocket
		await store.ready
		await store.clear()
	})
	await settle(page)
}

test('stickers kept on two pages are both in the album, grouped by page, this page first, each group named in the page\'s language (S7)', async () => {
	const l = await launchLayer(gw, { owl: true, reducedMotion: true, themeClear: true })
	try {
		const seen = watch(l.page)
		await ready(l.page, '/en/mobile-internet-bundles')
		await clearStore(l.page)
		const bundles = await linked(l.page, 2)
		assert.equal(bundles.length, 2, 'two bundles cards with a link of their own')
		for (const id of bundles) await pocket(l.page, id)
		await ready(l.page, '/en/vodafone-cash')
		const cash = await linked(l.page, 2)
		assert.equal(cash.length, 2, 'two Vodafone Cash cards')
		for (const id of cash) await pocket(l.page, id)
		// The Cash page's two stickers are marked; the bundles' are another page's and mark no card here.
		assert.deepEqual((await pocketedIds(l.page)).sort(), [...cash].sort(), 'only this page\'s own stickers mark its cards')
		await openAlbum(l.page)
		let a = await album(l.page)
		assert.equal(a.flat, false, 'grouped')
		assert.deepEqual(
			a.groups.map((g) => [g.title, g.here !== null, g.stickers.length]),
			[
				[a.groups[0].title, true, 2],
				[a.groups[1].title, false, 2],
			],
			'two groups of two: this page first',
		)
		assert.match(a.groups[0].title, /cash/i, 'named after its page')
		assert.match(a.groups[1].title, /bundles/i, 'the other page named too')
		assert.equal(a.groups[0].here, 'This page')
		assert.deepEqual(
			[a.groups[0].tag, a.groups[0].stickers[0].tag],
			['H2', 'H3'],
			'a group is a heading of its own and its stickers are one level below',
		)
		assert.ok(a.groups.every((g) => g.stickers.every((s) => s.gone === null && /^Saved /.test(s.date ?? ''))), 'each kept for the day it was saved, none lost')
		assert.equal(a.lead, 'Kept for later: 4 items.')
		await closeAlbum(l.page)

		// In Arabic, the English stickers say what language they are in; the Arabic page's own name is learned when its stickers are there.
		await ready(l.page, '/ar/mobile-internet-bundles')
		await openAlbum(l.page)
		a = await album(l.page)
		assert.equal(a.groups.length, 2)
		const here = a.groups[0]
		assert.ok(here.here !== null && here.here === 'الصفحة دي', `this page first, labelled in Arabic (${here.here})`)
		assert.deepEqual(
			here.stickers.map((s) => [s.lang, s.dir]),
			here.stickers.map(() => ['en', 'ltr']),
			'a sticker kept in English is read and laid out in English on the Arabic page',
		)
		const named = (await records(l.page)).filter((r) => r.page === '/mobile-internet-bundles').map((r) => r.title)
		assert.ok(named.every((t) => t.en && t.ar), 'the page\'s name is kept in both languages once it has been read in both')
		assert.equal([here.lang, here.dir].join(' '), ' ', 'the group is named in the page\'s own language, so it needs no mark of its own')
		const other = a.groups[1]
		assert.deepEqual([other.lang, other.dir, /cash/i.test(other.title)], ['en', 'ltr', true], 'a page known only in English keeps its English name, marked as English')
		assert.deepEqual(seen.pageErrors, [], 'no page errors')
		assert.deepEqual(l.reached, [], 'nothing reached the internet')
	} finally {
		await l.close()
	}
})

/**
 * Vodafone's editors add a card beside one, linking where it links, before the page is read: set from the address, so
 * a page view can start with it ("?neighbour=<path of the card below #main-content>"). Within one page view the layer
 * keeps the ids it gave (ADR-0049), so a card added later gets a new one: only a new page view shows the change.
 */
const NEIGHBOUR = `(() => {
	const m = /[?&]neighbour=([^&]+)/.exec(location.search)
	if (!m) return
	const run = () => {
		const card = document.querySelector('#main-content > ' + decodeURIComponent(m[1]))
		if (!card) return
		const copy = card.cloneNode(true)
		for (const n of [copy, ...copy.querySelectorAll('*')]) for (const a of [...n.getAttributeNames()]) if (a.startsWith('data-aixc') || a === 'id') n.removeAttribute(a)
		copy.querySelector('h1, h2, h3, h4, h5, h6').textContent = 'Stand-in Neighbour Offer'
		for (const img of copy.querySelectorAll('img')) {
			img.setAttribute('src', 'https://web.vodafone.com.eg/documents/1/2/neighbour-offer/00000000-0000-4000-8000-000000000000')
			img.removeAttribute('data-src')
			img.removeAttribute('srcset')
			img.alt = 'Stand-in Neighbour Offer'
		}
		card.before(copy)
	}
	if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true }); else run()
})()`

test('a card added beside one that is pocketed changes the ids on the next visit; the sticker stays on its own card, and the new card shows its chip (S7, AIXC-41)', async () => {
	const l = await launchLayer(gw, { reducedMotion: true, initScripts: [NEIGHBOUR] })
	try {
		const seen = watch(l.page)
		await ready(l.page, '/en/services')
		await clearStore(l.page)
		// A card whose id comes from its link, with one heading, and the way to it from #main-content.
		const card = await l.page.evaluate(() => {
			const cards = [...document.querySelectorAll<HTMLElement>('#main-content [data-aixc-item]')].filter((c) => !c.closest('.owl-item') && c.querySelectorAll('h1, h2, h3, h4, h5, h6').length === 1 && /^(\/|https?:)/.test(c.querySelector('a[href]')?.getAttribute('href') ?? ''))
			const el = cards.find((c) => c.querySelector('img'))!
			const steps: string[] = []
			for (let n: Element | null = el; n && n.id !== 'main-content'; n = n.parentElement) steps.unshift(`${n.tagName.toLowerCase()}:nth-child(${[...n.parentElement!.children].indexOf(n) + 1})`)
			return { id: el.dataset.aixcItem!, path: steps.join(' > '), href: el.querySelector('a[href]')!.getAttribute('href')! }
		})
		await pocket(l.page, card.id)
		const kept = (await records(l.page))[0]
		// The next visit: the same page with a card added before it that links where it does.
		await ready(l.page, '/en/services', `?aixc-debug&neighbour=${encodeURIComponent(card.path)}`)
		const after = await l.page.evaluate((href) => {
			const items = [...document.querySelectorAll<HTMLElement>('#main-content [data-aixc-item]')].filter((c) => !c.closest('.owl-item'))
			const titleOf = (c: HTMLElement) => c.querySelector('h1, h2, h3, h4, h5, h6')?.textContent?.trim()
			const added = items.find((c) => titleOf(c) === 'Stand-in Neighbour Offer')!
			const own = items.find((c) => c !== added && c.querySelector('a[href]')?.getAttribute('href') === href)!
			const slot = (c: HTMLElement) => document.querySelector(`.pocket-chips .pocket-cta[data-pocket-for="${CSS.escape(c.dataset.aixcItem!)}"]`)?.parentElement
			return { own: own.dataset.aixcItem!, added: added.dataset.aixcItem!, ownPocketed: !!slot(own)?.classList.contains('is-pocketed'), addedPocketed: !!slot(added)?.classList.contains('is-pocketed'), ownChip: !!slot(own), addedChip: !!slot(added) }
		}, card.href)
		// Two cards now offer the link, so neither is known by it any more: an id alone finds no card for the sticker.
		assert.notEqual(after.own, card.id, `the card's own id changed (${card.id} → ${after.own})`)
		assert.notEqual(after.added, card.id, `and the new card does not carry the old one (${after.added})`)
		assert.deepEqual([after.ownChip, after.addedChip], [true, true], 'both cards have a chip')
		assert.equal(after.ownPocketed, true, 'the sticker is on its own card')
		assert.equal(after.addedPocketed, false, 'and the new card offers its chip')
		const now = await records(l.page)
		assert.deepEqual(now.map((r) => [r.key, r.id]), [[kept.key, kept.id]], 'one sticker, none lost or doubled, and the id it was saved with is never rewritten (two tabs in two languages would write it back and forth)')
		await openAlbum(l.page)
		assert.deepEqual((await album(l.page)).groups.flatMap((g) => g.stickers.map((s) => s.gone)), [null], 'its card is on the page: no note')
		await closeAlbum(l.page)
		// Put back from its own card takes the sticker, not another.
		await l.page.evaluate((id) => document.querySelector<HTMLElement>(`.pocket-chips .pocket-cta[data-pocket-for="${CSS.escape(id)}"]`)!.parentElement!.querySelector<HTMLElement>('.pocket-liner__undo')!.click(), after.own)
		await l.page.waitForFunction(() => (window as any).__aixc.demos.pocket.store.all().length === 0, null, { timeout: 5_000 })
		assert.deepEqual(await pocketedIds(l.page), [], 'put back: no card is pocketed')
		assert.deepEqual(seen.pageErrors, [], 'no page errors')
	} finally {
		await l.close()
	}
})

test('a sticker whose card has left its page says so, only after a read that counts; its link and Remove still work (S7)', async () => {
	const l = await launchLayer(gw, { reducedMotion: true })
	try {
		const seen = watch(l.page)
		await ready(l.page, '/en/services')
		await clearStore(l.page)
		const [kept, gone] = await linked(l.page, 2)
		await pocket(l.page, kept)
		await pocket(l.page, gone)
		const reads = await l.page.evaluate(() => (window as any).__aixc.reads)
		await l.page.evaluate((id) => [...document.querySelectorAll<HTMLElement>(`#main-content [data-aixc-item="${CSS.escape(id)}"]`)].forEach((c) => c.remove()), gone)
		await l.page.waitForFunction((n) => (window as any).__aixc.reads > n, reads, { timeout: 10_000 })
		await settle(l.page)
		await openAlbum(l.page)
		let a = await album(l.page)
		const notes = Object.fromEntries(a.groups.flatMap((g) => g.stickers.map((s) => [s.title, s.gone])))
		assert.equal(Object.values(notes).filter((n) => n === 'No longer on this page').length, 1, `one sticker is labelled: ${JSON.stringify(notes)}`)
		assert.equal(Object.values(notes).filter((n) => n === null).length, 1, 'the other is not')
		const link = await l.page.evaluate(() => [...document.querySelectorAll<HTMLAnchorElement>('#pocket-output .pocket-sticker')].map((s) => [s.querySelector('.pocket-sticker__gone') !== null, !!s.querySelector<HTMLAnchorElement>('a.pocket-sticker__cta')?.href]))
		assert.deepEqual(link.map((x) => x[1]), [true, true], 'the labelled sticker keeps its link')
		await closeAlbum(l.page)
		// A reading that does not count (below the coverage gate): the card may have been missed, so nothing is said.
		await l.page.evaluate(() => {
			const w = window as any
			document.dispatchEvent(new CustomEvent('aixc:model', { detail: { model: w.__aixc.model, coverage: { ...w.__aixc.coverage, ratio: 0.5 } } }))
		})
		await settle(l.page)
		await openAlbum(l.page)
		a = await album(l.page)
		assert.deepEqual(a.groups.flatMap((g) => g.stickers.map((s) => s.gone)), [null, null], 'a poor read says nothing')
		await closeAlbum(l.page)
		await l.page.evaluate(() => {
			const w = window as any
			document.dispatchEvent(new CustomEvent('aixc:model', { detail: { model: w.__aixc.model, coverage: { ...w.__aixc.coverage, ratio: 1 } } }))
		})
		await settle(l.page)
		await openAlbum(l.page)
		a = await album(l.page)
		assert.equal(a.groups.flatMap((g) => g.stickers.map((s) => s.gone)).filter(Boolean).length, 1, 'a good read again: the note is back')
		// Removing the labelled sticker takes it out of its group and the album.
		await l.page.evaluate(() => {
			const s = [...document.querySelectorAll('#pocket-output .pocket-sticker')].find((x) => x.querySelector('.pocket-sticker__gone'))!
			s.querySelector<HTMLElement>('.pocket-sticker__remove')!.click()
		})
		await l.page.waitForFunction(() => (window as any).__aixc.demos.pocket.store.all().length === 1, null, { timeout: 5_000 })
		await settle(l.page)
		a = await album(l.page)
		assert.deepEqual(a.groups.flatMap((g) => g.stickers.map((s) => s.gone)), [null])
		assert.deepEqual(seen.pageErrors, [], 'no page errors')
	} finally {
		await l.close()
	}
})

test('a second tab pocketing a card changes this tab at once: the card and the album (S7)', async () => {
	const l = await launchLayer(gw, { reducedMotion: true, themeClear: true })
	try {
		const seen = watch(l.page)
		await ready(l.page, '/en/vodafone-cash')
		await clearStore(l.page)
		const [here] = await linked(l.page, 1)
		const other = await l.b.context.newPage()
		watch(other)
		await ready(other, '/en/mobile-internet-bundles')
		const [there] = await linked(other, 1)
		await pocket(other, there)
		await l.page.waitForFunction(() => (window as any).__aixc.demos.pocket.state.ids.length === 1, null, { timeout: 5_000 })
		assert.deepEqual(await pocketedIds(l.page), [], 'a sticker of another page marks no card here')
		await openAlbum(l.page)
		let a = await album(l.page)
		assert.deepEqual(a.groups.map((g) => [g.here, g.stickers.length]), [[null, 1]], 'the other tab\'s page is another page')
		// The same page in a third tab, and the album open here: its sticker joins the album, first, and marks its card once the album closes.
		const twin = await l.b.context.newPage()
		watch(twin)
		await ready(twin, '/en/vodafone-cash')
		await pocket(twin, here)
		await l.page.waitForFunction(() => document.querySelectorAll('#pocket-output .pocket-group').length === 2, null, { timeout: 5_000 })
		a = await album(l.page)
		assert.deepEqual(a.groups.map((g) => [g.here !== null, g.stickers.length]), [[true, 1], [false, 1]], 'this page\'s group first')
		await closeAlbum(l.page)
		assert.deepEqual(await pocketedIds(l.page), [here], 'the card pocketed in the other tab is marked here')
		// Put back here: the other tabs lose the sticker too.
		await l.page.evaluate((id) => document.querySelector<HTMLElement>(`.pocket-chips .pocket-cta[data-pocket-for="${CSS.escape(id)}"]`)!.parentElement!.querySelector<HTMLElement>('.pocket-liner__undo')!.click(), here)
		await twin.waitForFunction(() => (window as any).__aixc.demos.pocket.state.ids.length === 1, null, { timeout: 5_000 })
		assert.deepEqual(await pocketedIds(twin), [], 'put back here: not marked there')
		await twin.close()
		await other.close()
		assert.deepEqual(seen.pageErrors, [], 'no page errors')
	} finally {
		await l.close()
	}
})

test('a walk over the pages that clear storage loses nothing, in English and in Arabic (S7)', async () => {
	const l = await launchLayer(gw, { reducedMotion: true, themeClear: true })
	try {
		const seen = watch(l.page)
		await ready(l.page, '/en/services')
		await clearStore(l.page)
		const kept: Record<string, string> = {}
		for (const path of ['/en/services', '/en/mobile-internet-bundles', '/en/home']) {
			await ready(l.page, path)
			const [id] = await linked(l.page, 1)
			await pocket(l.page, id)
			kept[path] = id
		}
		const total = (await records(l.page)).length
		assert.equal(total, 3, 'one sticker on each of the three pages')
		for (const path of ['/en/services', '/en/mobile-internet-bundles', '/en/home', '/en/services', '/ar/services', '/ar/mobile-internet-bundles', '/ar/home', '/ar/services']) {
			await ready(l.page, path)
			assert.equal((await records(l.page)).length, 3, `${path}: nothing was lost`)
			const cleared = await l.page.evaluate(() => (window as any).__themeCleared ?? 0)
			assert.ok(cleared >= 1 || /bundles/.test(path), `${path}: the theme cleared this page's storage`)
			await openAlbum(l.page)
			const a = await album(l.page)
			assert.equal(a.groups.length, 3, `${path}: three groups`)
			assert.ok(a.groups[0].here !== null && a.groups.slice(1).every((g) => g.here === null), `${path}: this page first`)
			assert.equal(a.groups.reduce((n, g) => n + g.stickers.length, 0), 3)
			await closeAlbum(l.page)
			// Its own sticker marks a card here: the same card in English; in Arabic, found again by what the card holds.
			const mine = await pocketedIds(l.page)
			const gone = a.groups[0].stickers.filter((s) => s.gone).length
			assert.equal(mine.length + gone, 1, `${path}: its sticker marks a card on this page, or says its card is not found (${mine.length} marked, ${gone} missing)`)
			if (path.startsWith('/en/')) assert.deepEqual(mine, [kept[path]], `${path}: the card it was kept on`)
		}
		assert.deepEqual(seen.pageErrors, [], 'no page errors')
		assert.deepEqual(l.reached, [], 'nothing reached the internet')
	} finally {
		await l.close()
	}
})

test('the pocket emptied just as a page starts: the corner that is due never shows an empty pocket (found by the S16 matrix)', async () => {
	const l = await launchLayer(gw, { owl: true, reducedMotion: false, themeClear: true })
	try {
		const seen = watch(l.page)
		await ready(l.page, '/en/services')
		await clearStore(l.page)
		const [id] = await linked(l.page, 1)
		await pocket(l.page, id)
		// Another page: a returning visitor's corner turns up 500 ms after the Pocket has read its store.
		await open(l.page, '/en/vodafone-cash', '?aixc-debug')
		// Empty the store at once, inside that wait (another tab's "Empty pocket", or the store clearing).
		await l.page.evaluate(async () => {
			while (!(window as any).__aixc?.demos?.pocket?.chips) await new Promise((done) => setTimeout(done, 5))
			const { store } = (window as any).__aixc.demos.pocket
			await store.ready
			await store.clear()
		})
		await l.page.waitForTimeout(1_500)
		const corner = await l.page.evaluate(() => {
			const peek = document.querySelector('.pocket-peek')
			return { state: peek?.getAttribute('data-state') ?? null, label: peek?.getAttribute('aria-label') ?? null, held: (window as any).__aixc.demos.pocket.store.all().length }
		})
		assert.equal(corner.held, 0, 'the pocket is empty')
		assert.notEqual(corner.state, 'shown', `no Pocket button for an empty pocket (it said "${corner.label}")`)
		assert.deepEqual(seen.pageErrors, [], 'no page errors')
	} finally {
		await l.close()
	}
})
