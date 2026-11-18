/**
 * The page watch's lines in Chromium, on Vodafone's saved pages with the real layer (experiences
 * src/host/demos/watch.js, src/watch/ui.js; ADR-0078 points 7 and 8; phase 6 design §4.6, §4.7, §4.10):
 * the sticker's "Tell me when this changes", "Watching · No change since", a changed linked page told on
 * the sticker, the liner and the Pocket button (count and label), opening the album marks it seen, "Stop
 * watching", removing the sticker removes its watch, a throw at each checkpoint drops only the watch,
 * Arabic right to left, and the guide's bridge (fromGuide) on a card and on something that is not one.
 *
 * The layer comes from the offline kit (tests/e2e/vodafone-layer.ts, used as it is), its gateway on 4720
 * with demos.watch turned on for this gateway only and minIntervalMin 0 (so a reload runs the check on
 * visit at once). The watch's own fetches (robots.txt and the saved pages) are answered here, by a route on
 * the page: the saved copy, or a test-only edited copy of the linked page ("TEST-ONLY EDIT"). Nothing
 * leaves the machine. Screenshots (1366×900 and 375×812, English and Arabic) go to WATCH_SHOTS, or a
 * folder in the temp dir, never into the repository.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import zlib from 'node:zlib'

import type { Page } from 'playwright'

import { DESKTOP, type LayerGateway, launchLayer, open, PHONE, REPLAY, startLayerGateway, V } from '../e2e/vodafone-layer.ts'

const PORT = 4720
const SHOTS = process.env.WATCH_SHOTS || path.join(os.tmpdir(), 'watch-ui-shots')
const SNAPSHOTS = new Map(
	(JSON.parse(fs.readFileSync(path.join(REPLAY, 'crawl.json'), 'utf8')) as { pages: { url: string; snapshot?: string }[] }).pages
		.filter((p) => p.snapshot)
		.map((p) => [new URL(p.url).pathname, path.join(REPLAY, p.snapshot!)]),
)
const saved = (pathname: string) => {
	const file = SNAPSHOTS.get(pathname)
	return file ? zlib.gunzipSync(fs.readFileSync(file)).toString('utf8') : null
}
/** A test-only edited copy: one paragraph more in #main-content. */
const edited = (html: string) => html.replace(/(<[^>]+id="main-content"[^>]*>)/, '$1<p data-test-edit>TEST-ONLY EDIT: a new bundle price, written by this test.</p>')
// Failures injected through the layer's own checkpoint, from sessionStorage so a reload carries them.
const FAIL_AT = `Object.defineProperty(window, '__AIXC_TEST__', { configurable: true, get: () => { try { const f = sessionStorage.getItem('aixc-test-failAt'); return f ? { failAt: f } : undefined } catch { return undefined } } })`

let gw: LayerGateway

before(async () => {
	gw = await startLayerGateway(PORT)
	// This gateway only: the watch on (the site's config keeps it off until the phase's last commit), a check on every visit.
	gw.site.experiences.demos.watch = true
	gw.site.experiences.watch.minIntervalMin = 0
})

after(async () => {
	await gw?.close()
})

interface Fetches {
	edit: Set<string>
	log: string[]
}

/** The watch's fetches answered on the page: robots.txt, and the saved pages (edited where `edit` says). Navigations go to the replay. */
async function answerWatch(page: Page): Promise<Fetches> {
	const f: Fetches = { edit: new Set(), log: [] }
	await page.route(
		(url) => url.origin === V,
		async (route) => {
			const req = route.request()
			const url = new URL(req.url())
			// Navigations go to the replay; the guide's and the layer's own calls (/__vg/, the gateway) to the kit's forward.
			if (req.resourceType() !== 'fetch' || url.pathname.startsWith('/__vg/')) return route.fallback()
			f.log.push(url.pathname)
			if (url.pathname === '/robots.txt') return route.fulfill({ status: 200, contentType: 'text/plain', body: 'User-agent: *\nAllow: /\n' })
			const html = saved(url.pathname)
			if (!html) return route.fulfill({ status: 404, contentType: 'text/html', body: '<!doctype html><title>404</title>' })
			return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: f.edit.has(url.pathname) ? edited(html) : html })
		},
	)
	return f
}

const ready = (page: Page) => page.waitForFunction(() => (window as any).__aixcWatch?.ready === true, null, { timeout: 15_000 })

/** A card on this page with a chip, whose link opens another saved page of the same language: { id, href }. */
const pickCard = (page: Page, pages: string[]) =>
	page.evaluate((pages) => {
		const layer = (window as any).__aixc
		const lang = layer.host.lang
		for (const section of layer.model?.sections ?? [])
			for (const item of section.items) {
				const href = item.cta?.href
				if (!href) continue
				let u: URL
				try {
					u = new URL(href, location.href)
				} catch {
					continue
				}
				if (u.origin !== location.origin || u.pathname === location.pathname || !pages.includes(u.pathname) || !u.pathname.startsWith(`/${lang}/`)) continue
				if (document.querySelector(`.pocket-chips .pocket-cta[data-pocket-for="${CSS.escape(item.id)}"]`)) return { id: item.id as string, href: u.pathname }
			}
		return null
	}, pages)

/** Presses the card's chip and waits until its sticker is kept; returns the sticker's key. */
async function pocketCard(page: Page, id: string): Promise<string> {
	const before = await page.evaluate(() => [...(window as any).__aixc.demos.pocket.state.ids])
	await page.evaluate((id) => document.querySelector<HTMLElement>(`.pocket-chips .pocket-cta[data-pocket-for="${CSS.escape(id)}"]`)!.click(), id)
	await page.waitForFunction((n) => (window as any).__aixc.demos.pocket.state.ids.length === n, before.length + 1, { timeout: 10_000 })
	await page.waitForFunction(() => !(window as any).__aixc.demos.pocket.state.busy && !document.querySelector('.pocket-layer .curl-host'), null, { timeout: 10_000 }).catch(() => {})
	return page.evaluate((before) => (window as any).__aixc.demos.pocket.state.ids.find((k: string) => !before.includes(k)), before)
}

const openAlbum = async (page: Page) => {
	await page.evaluate(() => (window as any).__aixc.demos.pocket.open())
	await page.waitForFunction(() => (window as any).__aixc.demos.pocket.state.view === 'pocket' && !(window as any).__aixc.demos.pocket.state.busy, null, { timeout: 15_000 })
}
const closeAlbum = async (page: Page) => {
	await page.evaluate(() => (window as any).__aixc.demos.pocket.close())
	await page.waitForFunction(() => (window as any).__aixc.demos.pocket.state.view === 'page' && !(window as any).__aixc.demos.pocket.state.busy, null, { timeout: 15_000 })
}
/** The watch's block on the sticker under `key`: its tag, lines and buttons, or null. */
const block = (page: Page, key: string) =>
	page.evaluate((key) => {
		const box = [...document.querySelectorAll<HTMLElement>('.aixc-watch')].find((b) => b.dataset.watchFor === key)
		if (!box) return null
		return {
			tag: box.querySelector('.aixc-watch__tag')?.textContent ?? null,
			lines: [...box.querySelectorAll('.aixc-watch__line')].map((p) => p.textContent),
			buttons: [...box.querySelectorAll('button, a')].map((b) => b.textContent),
			open: box.querySelector<HTMLAnchorElement>('.aixc-watch__open')?.getAttribute('href') ?? null,
			dir: getComputedStyle(box).direction,
		}
	}, key)
const pressIn = (page: Page, key: string, text: string) =>
	page.evaluate(
		({ key, text }) => {
			const box = [...document.querySelectorAll<HTMLElement>('.aixc-watch')].find((b) => b.dataset.watchFor === key)!
			;[...box.querySelectorAll<HTMLElement>('button')].find((b) => b.textContent === text)!.click()
		},
		{ key, text },
	)
const lineIs = (page: Page, key: string, re: RegExp, timeout = 15_000) =>
	page.waitForFunction(
		({ key, src }) => {
			const box = [...document.querySelectorAll<HTMLElement>('.aixc-watch')].find((b) => b.dataset.watchFor === key)
			return !!box && [...box.querySelectorAll('.aixc-watch__line')].some((p) => new RegExp(src).test(p.textContent || ''))
		},
		{ key, src: re.source },
		{ timeout },
	)
const peek = (page: Page) =>
	page.evaluate(() => {
		const b = document.querySelector<HTMLElement>('.pocket-peek')!
		const c = b.querySelector<HTMLElement>('.pocket-peek__changed')
		return { label: b.getAttribute('aria-label'), changed: c && !c.hidden ? c.textContent : null, red: c ? getComputedStyle(c).backgroundColor : null }
	})
const liner = (page: Page, id: string) =>
	page.evaluate((id) => {
		const host = document.querySelector(`.pocket-chips .pocket-cta[data-pocket-for="${CSS.escape(id)}"]`)?.parentElement
		const b = host?.querySelector<HTMLElement>('.pocket-liner .aixc-watch-liner')
		return b ? { text: b.textContent, label: b.getAttribute('aria-label') } : null
	}, id)
const watchRows = (page: Page) =>
	page.evaluate(
		() =>
			new Promise<string[]>((resolve, reject) => {
				const r = indexedDB.open('aixc-watch-v1')
				r.onerror = () => reject(r.error)
				r.onsuccess = () => {
					const db = r.result
					if (!db.objectStoreNames.contains('watches')) return resolve((db.close(), []))
					const q = db.transaction('watches').objectStore('watches').getAllKeys()
					q.onsuccess = () => resolve((db.close(), q.result as string[]))
					q.onerror = () => reject(q.error)
				}
			}),
	)
const shoot = async (page: Page, name: string) => {
	fs.mkdirSync(SHOTS, { recursive: true })
	const file = path.join(SHOTS, `${name}.png`)
	await page.screenshot({ path: file })
	return file
}

/** Runs the whole sticker flow on `pathname`: pocket, Tell, baseline; edit the linked page, reload, see it changed. */
async function changedFlow(page: Page, f: Fetches, pathname: string) {
	await open(page, pathname, '?aixc-debug')
	await ready(page)
	const card = await pickCard(page, [...SNAPSHOTS.keys()])
	assert.ok(card, `a card on ${pathname} opens another saved page`)
	const key = await pocketCard(page, card.id)
	await openAlbum(page)
	return { card, key }
}

test('English: Tell me when this changes, the baseline, a changed page on the sticker, the liner and the button; seen; Stop watching; removal', { timeout: 180_000 }, async () => {
	const l = await launchLayer(gw, { viewport: DESKTOP, reducedMotion: true })
	const errors: string[] = []
	l.page.on('pageerror', (e) => errors.push(e.message))
	try {
		const page = l.page
		const f = await answerWatch(page)
		const { card, key } = await changedFlow(page, f, '/en/home')
		// Before any watch: the button, nothing else.
		assert.deepEqual(await block(page, key), { tag: null, lines: [], buttons: ['Tell me when this changes'], open: null, dir: 'ltr' })
		await pressIn(page, key, 'Tell me when this changes')
		await page.waitForFunction((key) => [...document.querySelectorAll<HTMLElement>('.aixc-watch')].find((b) => b.dataset.watchFor === key)?.textContent?.includes('Stop watching'), key, { timeout: 10_000 })
		await lineIs(page, key, /^Watching · No change since \d{1,2} [A-Z][a-z]{2}$/)
		assert.deepEqual((await block(page, key))!.buttons, ['Stop watching'])
		assert.ok(f.log.includes('/robots.txt') && f.log.includes('/en/home') && f.log.includes(card.href), `the baseline read the card's page and its link's (${f.log.join(', ')})`)
		assert.deepEqual(await watchRows(page), [key])
		await closeAlbum(page)

		// The linked page changes (a test-only copy); the next visit's check finds it.
		f.edit.add(card.href)
		await page.reload({ waitUntil: 'load' })
		await ready(page)
		await page.waitForFunction(() => document.querySelector<HTMLElement>('.pocket-peek__changed:not([hidden])')?.textContent === '1', null, { timeout: 20_000 })
		const p = await peek(page)
		assert.equal(p.changed, '1')
		assert.match(p.label!, /^Open your pocket, \d+ \w+, 1 changed$/)
		assert.equal(p.red, 'rgb(230, 0, 0)')
		await page.waitForFunction((id) => !!document.querySelector(`.pocket-chips .pocket-cta[data-pocket-for="${CSS.escape(id)}"]`)?.parentElement?.querySelector('.aixc-watch-liner'), card.id, { timeout: 10_000 })
		const ln = await liner(page, card.id)
		assert.equal(ln?.text, 'Changed')
		assert.match(ln!.label!, / changed\. See it in your pocket$/)
		await shoot(page, 'en-1366-button-count')

		// The liner's "Changed" opens the album at that sticker; the album marks it seen (count 0), the sticker keeps its tag while it shows.
		await page.evaluate((id) => document.querySelector<HTMLElement>(`.pocket-chips .pocket-cta[data-pocket-for="${CSS.escape(id)}"]`)!.parentElement!.querySelector<HTMLElement>('.aixc-watch-liner')!.click(), card.id)
		await page.waitForFunction(() => (window as any).__aixc.demos.pocket.state.view === 'pocket' && !(window as any).__aixc.demos.pocket.state.busy, null, { timeout: 15_000 })
		const b = (await block(page, key))!
		assert.equal(b.tag, 'Changed')
		assert.match(b.lines[0]!, /^The page it opens changed · \d{1,2} [A-Z][a-z]{2}$/)
		assert.deepEqual(b.buttons, ['Open the page', 'Stop watching'])
		assert.equal(b.open, `${V}${card.href}`)
		await page.waitForFunction(() => !document.querySelector<HTMLElement>('.pocket-peek__changed:not([hidden])'), null, { timeout: 10_000 })
		assert.doesNotMatch((await peek(page)).label!, /changed/)
		await page.evaluate((key) => [...document.querySelectorAll<HTMLElement>('.aixc-watch')].find((b) => b.dataset.watchFor === key)?.closest('.pocket-grid__item')?.scrollIntoView({ block: 'center' }), key)
		await shoot(page, 'en-1366-album-changed')
		await page.setViewportSize(PHONE)
		await page.waitForTimeout(300)
		await page.evaluate((key) => [...document.querySelectorAll<HTMLElement>('.aixc-watch')].find((b) => b.dataset.watchFor === key)?.closest('.pocket-grid__item')?.scrollIntoView({ block: 'center' }), key)
		await shoot(page, 'en-375-album-changed')
		await page.setViewportSize(DESKTOP)
		await closeAlbum(page)
		// Seen: no liner note, and the sticker says it quietly.
		assert.equal(await liner(page, card.id), null)
		await openAlbum(page)
		await lineIs(page, key, /^Watching · Changed \d{1,2} [A-Z][a-z]{2}$/)
		assert.equal((await block(page, key))!.tag, null)

		// Stop watching: the watch goes, the button comes back.
		await pressIn(page, key, 'Stop watching')
		await page.waitForFunction((key) => [...document.querySelectorAll<HTMLElement>('.aixc-watch')].find((b) => b.dataset.watchFor === key)?.textContent === 'Tell me when this changes', key, { timeout: 10_000 })
		assert.deepEqual(await watchRows(page), [])

		// Watched again, then removed from the pocket: its watch goes with it.
		await pressIn(page, key, 'Tell me when this changes')
		await lineIs(page, key, /^Watching/)
		assert.deepEqual(await watchRows(page), [key])
		await page.evaluate((key) => document.querySelector<HTMLElement>(`.pocket-grid__item[data-pocket-id="${CSS.escape(key)}"] .pocket-sticker__remove`)!.click(), key)
		await page.waitForFunction(async () => {
			const r = indexedDB.open('aixc-watch-v1')
			const db: IDBDatabase = await new Promise((res) => (r.onsuccess = () => res(r.result)))
			const keys: unknown[] = await new Promise((res) => {
				const q = db.transaction('watches').objectStore('watches').getAllKeys()
				q.onsuccess = () => res(q.result)
			})
			db.close()
			return keys.length === 0
		}, null, { timeout: 10_000 })
		assert.deepEqual(errors, [])
		assert.deepEqual(l.reached, [], 'nothing left the machine')
	} finally {
		await l.close()
	}
})

test('Arabic: right to left, in Arabic, the changed sticker and the count', { timeout: 180_000 }, async () => {
	const l = await launchLayer(gw, { viewport: DESKTOP, reducedMotion: true })
	try {
		const page = l.page
		const f = await answerWatch(page)
		const { card, key } = await changedFlow(page, f, '/ar/home')
		assert.deepEqual((await block(page, key))!.buttons, ['قولّي لما تتغيّر'])
		assert.equal((await block(page, key))!.dir, 'rtl')
		await pressIn(page, key, 'قولّي لما تتغيّر')
		await lineIs(page, key, /^بنتابعها · مفيش تغيير من /)
		await closeAlbum(page)
		f.edit.add(card.href)
		await page.reload({ waitUntil: 'load' })
		await ready(page)
		await page.waitForFunction(() => document.querySelector<HTMLElement>('.pocket-peek__changed:not([hidden])')?.textContent === '1', null, { timeout: 20_000 })
		assert.match((await peek(page)).label!, /^افتح جيبك، .+، 1 اتغيّرت$/)
		assert.equal((await liner(page, card.id))?.text, 'اتغيّرت')
		await shoot(page, 'ar-1366-button-count')
		await page.setViewportSize(PHONE)
		await page.waitForTimeout(300)
		await shoot(page, 'ar-375-button-count')
		await page.setViewportSize(DESKTOP)
		await openAlbum(page)
		const b = (await block(page, key))!
		assert.equal(b.tag, 'اتغيّرت')
		assert.match(b.lines[0]!, /^الصفحة اللي بتفتحها اتغيّرت · /)
		assert.equal(b.dir, 'rtl')
		await page.evaluate((key) => [...document.querySelectorAll<HTMLElement>('.aixc-watch')].find((b) => b.dataset.watchFor === key)?.closest('.pocket-grid__item')?.scrollIntoView({ block: 'center' }), key)
		await shoot(page, 'ar-1366-album-changed')
		await page.setViewportSize(PHONE)
		await page.waitForTimeout(300)
		await page.evaluate((key) => [...document.querySelectorAll<HTMLElement>('.aixc-watch')].find((b) => b.dataset.watchFor === key)?.closest('.pocket-grid__item')?.scrollIntoView({ block: 'center' }), key)
		await shoot(page, 'ar-375-album-changed')
		await page.setViewportSize(DESKTOP)
		await closeAlbum(page)
		// The English button count at a phone's width, for the set of screenshots.
		assert.deepEqual(l.reached, [])
	} finally {
		await l.close()
	}
})

test('the guide\'s bridge: fromGuide on a card pockets and watches it; on something else, not-a-card', { timeout: 120_000 }, async () => {
	const l = await launchLayer(gw, { viewport: PHONE, reducedMotion: true })
	try {
		const page = l.page
		await answerWatch(page)
		await open(page, '/en/home', '?aixc-debug')
		await ready(page)
		await page.evaluate(async () => {
			const s = (window as any).__aixc.demos.pocket.store
			await s.ready
			await s.clear()
		})
		const card = await pickCard(page, [...SNAPSHOTS.keys()])
		assert.ok(card)
		// The selector the guide would spotlight: something inside the card.
		const r = await page.evaluate((id) => (window as any).__aixcWatch.fromGuide({ op: 'offerWatch', target: { css: [`[data-aixc-item="${id}"] *`] }, label: 'x', url: location.href }), card.id)
		assert.deepEqual(r, { ok: true })
		const key = await page.evaluate((id) => (window as any).__aixc.demos.pocket.store.all().find((x: any) => x.id === id)?.key, card.id)
		assert.ok(key, 'pocketed through the Pocket')
		assert.deepEqual(await watchRows(page), [key])
		// Asked again: already watched, still fine.
		assert.equal((await page.evaluate((id) => (window as any).__aixcWatch.fromGuide({ target: { css: [`[data-aixc-item="${id}"]`] } }), card.id)).ok, true)
		assert.deepEqual(await page.evaluate(() => (window as any).__aixcWatch.fromGuide({ target: { css: ['#header', 'footer'] } })), { ok: false, reason: 'not-a-card' })
		assert.deepEqual(await page.evaluate(() => (window as any).__aixcWatch.fromGuide({ target: { css: ['.no-such-thing'] } })), { ok: false, reason: 'not-a-card' })
		await shoot(page, 'en-375-button-after-guide')
	} finally {
		await l.close()
	}
})

test('a throw at each checkpoint drops only the watch; the Pocket and the page carry on', { timeout: 240_000 }, async () => {
	const l = await launchLayer(gw, { viewport: DESKTOP, reducedMotion: true, initScripts: [FAIL_AT] })
	const warns: string[] = []
	l.page.on('console', (m) => m.text().startsWith('[AIXC]') && warns.push(m.text()))
	try {
		const page = l.page
		const f = await answerWatch(page)
		// A sticker with a change, so every piece of the watch would show.
		const { card, key } = await changedFlow(page, f, '/en/home')
		await pressIn(page, key, 'Tell me when this changes')
		await lineIs(page, key, /^Watching · No change since/)
		await closeAlbum(page)
		f.edit.add(card.href)
		for (const step of ['watch-start', 'watch-ui', 'watch-check']) {
			warns.length = 0
			await page.evaluate((step) => sessionStorage.setItem('aixc-test-failAt', step), step)
			await page.reload({ waitUntil: 'load' })
			await page.waitForFunction(() => (window as any).__aixc?.demos?.pocket, null, { timeout: 15_000 })
			await page.waitForFunction(() => false, null, { timeout: 4000 }).catch(() => {})
			const s = await page.evaluate(() => ({
				state: (window as any).__aixc.state,
				watch: !!(window as any).__aixcWatch,
				lines: document.querySelectorAll('.aixc-watch, .aixc-watch-liner').length,
				count: !!document.querySelector('.pocket-peek__changed:not([hidden])'),
				css: !!document.querySelector('style[data-aixc-css="watch"]'),
				label: document.querySelector('.pocket-peek')?.getAttribute('aria-label'),
			}))
			assert.equal(s.state, 'ready', `${step}: the layer carries on`)
			assert.equal(s.watch, false, `${step}: no window.__aixcWatch`)
			assert.equal(s.lines, 0, `${step}: no watch lines or liner notes`)
			assert.equal(s.count, false, `${step}: no count`)
			assert.equal(s.css, false, `${step}: its stylesheet gone`)
			assert.doesNotMatch(s.label ?? '', /changed/, `${step}: the button's label is the Pocket's`)
			assert.ok(warns.some((w) => /page watch stopped|Pocket watch stopped/.test(w)), `${step}: said once in the console (${warns.join(' | ')})`)
			// The Pocket still works: the album opens with its sticker, and closes.
			await openAlbum(page)
			assert.equal(await page.evaluate((key) => !!document.querySelector(`.pocket-grid__item[data-pocket-id="${CSS.escape(key)}"]`), key), true)
			assert.equal(await page.evaluate(() => document.querySelectorAll('.aixc-watch').length), 0)
			await closeAlbum(page)
		}
		await page.evaluate(() => sessionStorage.removeItem('aixc-test-failAt'))
		assert.deepEqual(l.reached, [])
	} finally {
		await l.close()
	}
})
