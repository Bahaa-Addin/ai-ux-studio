/**
 * The Pocket's album on Vodafone's saved pages, as the experience layer runs it live (live plan
 * phase 3, S5; ADR-0052), with the live-page kit (./vodafone-layer.ts): nothing reaches the internet,
 * the accessibility widget and the theme's storage clear are stood in.
 *
 * - The layer loads the Pocket's chunk at idle and its CSS once; the stickers come from the Pocket's
 *   own store (ADR-0051), from this page and others, in their own language, dated, with a picture or
 *   without one (the bundles have none).
 * - The page turns to the album and back: Vodafone's content is hidden only while the album shows,
 *   the header and footer are never touched, and Back lands where the visitor was.
 * - A failure while opening, drawing or closing the album removes the layer and leaves the page as
 *   with ?aixc=off, with no error reaching the page.
 */
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'

import type { Page } from 'playwright'

import { DESKTOP, type LayerGateway, launchLayer, layerState, open, PHONE, startLayerGateway, watch } from './vodafone-layer.ts'

const PORT = 4477
let gw: LayerGateway

before(async () => {
	gw = await startLayerGateway(PORT)
})
after(async () => {
	await gw?.close()
})

/* eslint-disable @typescript-eslint/no-explicit-any */
const SAVED = Date.UTC(2026, 10, 12, 9)

/** A sticker kept on another page, in Arabic, without a picture: shown on every page. */
const ELSEWHERE = {
	v: 2,
	key: 't-elsewhere',
	id: 'mega-1400',
	kind: 'card-action',
	keys: [{ kind: 'digits', value: '1400' }],
	copy: { title: 'ميجا 1400', description: 'بـ 37 جنيه', lang: 'ar', dir: 'rtl' },
	image: null,
	cta: { label: null, href: 'https://web.vodafone.com.eg/ar/mobile-internet-bundles' },
	source: { page: '/mobile-internet-bundles', path: '/ar/mobile-internet-bundles', pageId: null, title: { ar: 'باقات النت' }, section: { id: 'b', title: 'باقات' } },
	origin: 'person',
	savedAt: SAVED,
	seenAt: SAVED,
}

/** Keeps `take` cards of this page (one per section first) and ELSEWHERE in the Pocket's store, then reloads. */
async function seed(page: Page, take = 3): Promise<number> {
	await page.waitForFunction(() => (window as any).__aixc?.demos?.pocket, null, { timeout: 10_000 })
	const n = await page.evaluate(
		async ({ take, elsewhere, saved }) => {
			const layer = (window as any).__aixc
			const { store } = layer.demos.pocket
			await store.ready
			await store.clear()
			const lang = layer.host.lang
			const sections = layer.model?.sections ?? []
			const picks: { item: any; section: any }[] = []
			for (let round = 0; picks.length < take && round < 20; round++) for (const section of sections) if (section.items[round] && picks.length < take) picks.push({ item: section.items[round], section })
			const path = location.pathname
			let i = 0
			for (const { item, section } of picks)
				await store.put({
					v: 2,
					key: `t-${i}`,
					id: item.id,
					kind: item.kind ?? null,
					keys: item.keys ?? [],
					copy: { title: item.title, description: item.description ?? null, lang, dir: lang === 'ar' ? 'rtl' : 'ltr' },
					image: item.image ? { src: item.image.src, alt: item.image.alt ?? null } : null,
					cta: item.cta?.href ? { label: item.cta.label ?? null, href: item.cta.href } : null,
					source: { page: path.replace(/^\/(en|ar)/, ''), path, pageId: null, title: {}, section: { id: section.id, title: section.title ?? null } },
					origin: 'person',
					savedAt: saved + ++i,
					seenAt: saved + i,
				})
			await store.put(elsewhere)
			return picks.length + 1
		},
		{ take, elsewhere: ELSEWHERE, saved: SAVED },
	)
	await page.reload({ waitUntil: 'load' })
	await page.waitForFunction((n) => (window as any).__aixc?.demos?.pocket?.state.ids.length === n, n, { timeout: 10_000 })
	return n
}

/** Vodafone's frame, as served: the header and the footer. */
const frame = (page: Page) => page.evaluate(() => ({ header: document.getElementById('header')?.outerHTML ?? null, footer: (document.querySelector('footer.footer') ?? document.querySelector('footer'))?.outerHTML ?? null }))

const pocketView = (page: Page) =>
	page.evaluate(() => {
		const p = (window as any).__aixc.demos.pocket
		return { view: p.state.view as string, busy: p.state.busy as boolean }
	})

/** Watches the turn: how many frozen copies of the page exist at once, and what they hold. */
const sampleTurn = (page: Page) =>
	page.evaluate(() => {
		const seen = { copies: 0, ids: 0, tags: 0, loud: 0, nodes: 0 }
		;(window as any).__turn = seen
		new MutationObserver(() => {
			const copies = document.querySelectorAll('.curl-snapshot')
			seen.copies = Math.max(seen.copies, copies.length)
			for (const c of copies) {
				seen.ids = Math.max(seen.ids, c.querySelectorAll('[id]').length)
				seen.tags = Math.max(seen.tags, c.querySelectorAll('[data-aixc-item], [data-aixc-section]').length)
				seen.loud = Math.max(seen.loud, c.querySelectorAll('iframe, video, audio, script, link, img[loading="eager"]').length)
				seen.nodes = Math.max(seen.nodes, c.querySelectorAll('*').length)
			}
		}).observe(document.body, { childList: true, subtree: true })
	})
const turnSeen = (page: Page) => page.evaluate(() => (window as any).__turn as { copies: number; ids: number; tags: number; loud: number; nodes: number })

async function openAlbum(page: Page) {
	await page.evaluate(() => (window as any).__aixc.demos.pocket.open())
	await page.waitForFunction(() => {
		const s = (window as any).__aixc.demos.pocket.state
		return s.view === 'pocket' && !s.busy
	}, null, { timeout: 10_000 })
}

async function closeAlbum(page: Page) {
	await page.evaluate(() => (window as any).__aixc.demos.pocket.close())
	await page.waitForFunction(() => {
		const s = (window as any).__aixc.demos.pocket.state
		return s.view === 'page' && !s.busy
	}, null, { timeout: 10_000 })
}

/** What the album shows, and how it sits on the page. */
const album = (page: Page) =>
	page.evaluate(() => {
		const root = document.getElementById('pocket-output')
		const stickers = [...document.querySelectorAll('#pocket-output .pocket-sticker')]
		const elsewhere = document.querySelector('[data-pocket-id="t-elsewhere"]')
		const bodyLayers = [...document.body.children].filter((n) => /\b(pocket-|curl-|aixc-sr-only)/.test(n.className))
		return {
			shown: !!root && !root.hidden && root.getBoundingClientRect().height > 0,
			marked: !!root && root.hasAttribute('data-aixc') && root.hasAttribute('data-vg'),
			afterOutput: root?.previousElementSibling?.id === 'experience-output',
			mainHidden: document.getElementById('main-content')?.hidden,
			view: document.body.dataset.pocketView ?? null,
			stickers: stickers.length,
			pictures: stickers.filter((s) => s.querySelector('img')).length,
			dated: stickers.filter((s) => s.querySelector('.pocket-sticker__date')).length,
			back: document.querySelector('#pocket-output .pocket-back')?.textContent?.trim() ?? null,
			elsewhere: elsewhere ? { picture: !!elsewhere.querySelector('img'), fromLang: elsewhere.querySelector('.pocket-sticker__from')?.getAttribute('lang') ?? null, lang: elsewhere.querySelector('.pocket-sticker__title')?.getAttribute('lang') ?? null, dir: elsewhere.querySelector('.pocket-sticker__title')?.getAttribute('dir') ?? null, date: elsewhere.querySelector('.pocket-sticker__date')?.textContent ?? '' } : null,
			layersMarked: bodyLayers.length > 0 && bodyLayers.every((n) => n.hasAttribute('data-aixc') && n.hasAttribute('data-vg')),
			css: document.querySelectorAll('style[data-aixc-css="pocket"]').length,
			srOnly: getComputedStyle(document.querySelector('.aixc-sr-only[role="status"]') ?? document.body).position,
		}
	})

test('the album on live pages: stickers from this page and others, the turn and Back, Vodafone\'s frame untouched', async () => {
	const cases = [
		{ path: '/en/services', back: 'Back to the page' },
		{ path: '/ar/services', back: 'ارجع للصفحة' },
		{ path: '/en/home', back: 'Back to the page' },
		{ path: '/en/mobile-internet-bundles', back: 'Back to the page' },
	]
	for (const viewport of [DESKTOP, PHONE]) {
		const l = await launchLayer(gw, { viewport, themeClear: true })
		try {
			const seen = watch(l.page)
			for (const c of cases) {
				await open(l.page, c.path, '?aixc-debug')
				const n = await seed(l.page)
				const before = await frame(l.page)
				const at = Math.round((await l.page.evaluate(() => document.documentElement.scrollHeight - innerHeight)) / 3)
				await l.page.evaluate((y) => scrollTo(0, y), at)
				await sampleTurn(l.page)
				await openAlbum(l.page)
				const a = await album(l.page)
				const where = `${c.path} ${viewport.width}`
				const turn = await turnSeen(l.page)
				assert.equal(turn.copies, 1, `${where}: one frozen copy of the page per turn`)
				assert.deepEqual([turn.ids, turn.tags, turn.loud], [0, 0, 0], `${where}: the copy has no ids, no layer tags, no frames, scripts or pictures fetched for it`)
				assert.ok(turn.nodes > 100, `${where}: the copy is the page (${turn.nodes} nodes)`)
				assert.equal(a.shown, true, `${where}: the album shows`)
				assert.equal(a.marked && a.afterOutput, true, `${where}: in its own marked region after #experience-output`)
				assert.equal(a.mainHidden, true, `${where}: Vodafone's content is hidden under it`)
				assert.equal(a.view, 'open')
				assert.equal(a.stickers, n, `${where}: every sticker, from this page and others`)
				assert.equal(a.dated, n, `${where}: each dated`)
				assert.equal(a.back, c.back)
				assert.equal(a.css, 1, `${where}: the Pocket's CSS once`)
				assert.equal(a.srOnly, 'absolute', `${where}: announcements are read out, not shown`)
				assert.equal(a.layersMarked, true, `${where}: every layer the Pocket put in <body> is marked`)
				assert.equal(a.elsewhere?.picture, false, `${where}: a card without a picture is a sticker without one`)
				if (c.path.startsWith('/en/')) assert.deepEqual([a.elsewhere?.lang, a.elsewhere?.dir, a.elsewhere?.fromLang], ['ar', 'rtl', 'ar'], `${where}: kept in Arabic, shown in Arabic`)
				else assert.deepEqual([a.elsewhere?.lang, a.elsewhere?.dir], [null, null], `${where}: its own language, nothing to say`)
				assert.match(a.elsewhere?.date ?? '', /12/, `${where}: the day it was kept`)
				if (c.path === '/en/mobile-internet-bundles') assert.equal(a.pictures, 0, `${where}: the bundles have no pictures, and nothing throws`)
				assert.deepEqual(await frame(l.page), before, `${where}: header and footer as served`)
				await sampleTurn(l.page)
				await closeAlbum(l.page)
				assert.equal((await turnSeen(l.page)).copies, 1, `${where}: one copy on the way back too`)
				const b = await album(l.page)
				assert.deepEqual([b.shown, b.mainHidden, b.view], [false, false, null], `${where}: the page is back`)
				const y = await l.page.evaluate(() => scrollY)
				assert.ok(Math.abs(y - at) <= 2, `${where}: Back lands where the visitor was (${y} for ${at})`)
				assert.deepEqual(await frame(l.page), before, `${where}: header and footer as served, after`)
			}
			assert.deepEqual(seen.pageErrors, [], 'no page errors')
			assert.deepEqual(l.reached, [], 'nothing reached the internet')
		} finally {
			await l.close()
		}
	}
})

test('Back lands within 2 px of where the visitor was, at three depths, in both languages and on both screens', async () => {
	for (const viewport of [DESKTOP, PHONE]) {
		const l = await launchLayer(gw, { viewport, reducedMotion: true })
		try {
			const seen = watch(l.page)
			for (const path of ['/en/services', '/ar/services']) {
				await open(l.page, path, '?aixc-debug')
				await seed(l.page, 2)
				const max = await l.page.evaluate(() => document.documentElement.scrollHeight - innerHeight)
				for (const at of [0, Math.round(max / 2), max - 10]) {
					await l.page.evaluate((y) => scrollTo(0, y), at)
					const from = await l.page.evaluate(() => scrollY)
					await openAlbum(l.page)
					assert.equal(await l.page.evaluate(() => scrollY), 0, `${path} ${viewport.width}: the album opens at its top`)
					await closeAlbum(l.page)
					const y = await l.page.evaluate(() => scrollY)
					assert.ok(Math.abs(y - from) <= 2, `${path} ${viewport.width} at ${from}: back at ${y}`)
				}
			}
			assert.deepEqual(seen.pageErrors, [], 'no page errors')
		} finally {
			await l.close()
		}
	}
})

/** Vodafone's page as a person would get it: #wrapper, the body's and the root's attributes. */
const served = (page: Page) =>
	page.evaluate(() => {
		const attrs = (n: Element) => [...n.attributes].map((a) => `${a.name}=${a.value}`).join(' ')
		return { wrapper: document.getElementById('wrapper')?.outerHTML ?? null, body: attrs(document.body), html: attrs(document.documentElement) }
	})

test('a failure while the album opens, draws or closes removes the layer and leaves the page as with ?aixc=off', async () => {
	for (const step of ['pocket-open', 'pocket-render', 'pocket-close']) {
		const l = await launchLayer(gw)
		try {
			const seen = watch(l.page)
			await open(l.page, '/en/services', '?aixc=off')
			const without = await served(l.page)
			await open(l.page, '/en/services', '?aixc-debug')
			await seed(l.page, 2)
			await l.page.evaluate(() => scrollTo(0, 600))
			if (step === 'pocket-close') await openAlbum(l.page)
			await l.page.evaluate((failAt) => {
				;(window as any).__AIXC_TEST__ = { failAt }
			}, step)
			await l.page.evaluate((closing) => {
				const p = (window as any).__aixc.demos.pocket
				return closing ? p.close() : p.open()
			}, step === 'pocket-close')
			await l.page.waitForFunction(() => (window as any).__aixc.state === 'failed', null, { timeout: 10_000 })
			const s = await layerState(l.page)
			const failure = await l.page.evaluate(() => (window as any).__aixc.failure)
			assert.equal(failure.step, step === 'pocket-close' ? 'pocket-close' : 'pocket-open', `${step}: reported against the Pocket's step`)
			assert.match(failure.message, new RegExp(step), `${step}: the error is the one thrown`)
			assert.equal(s.added, 0, `${step}: nothing of the layer is left`)
			assert.equal(s.tags, 0, `${step}: no tag left on Vodafone's cards`)
			assert.equal(s.mainHidden, false, `${step}: Vodafone's content is shown`)
			assert.deepEqual(await served(l.page), without, `${step}: the page is as with ?aixc=off`)
			assert.ok(Math.abs((await l.page.evaluate(() => scrollY)) - 600) <= 2, `${step}: where the visitor was`)
			assert.deepEqual(seen.pageErrors, [], `${step}: no error reached the page`)
			assert.ok(seen.layer.some((x) => x.startsWith('error: [AIXC] pocket-')), `${step}: the layer said so (${seen.layer.join(' | ')})`)
			assert.deepEqual(await pocketView(l.page), { view: 'page', busy: false }, `${step}: the Pocket stands down`)
		} finally {
			await l.close()
		}
	}
})
