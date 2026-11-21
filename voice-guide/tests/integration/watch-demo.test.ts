/**
 * The page watch's demo data in Chromium, on Vodafone's saved pages with the real layer (experiences
 * src/host/demos/watch.js fill() and reset(), src/watch/demo.js; ADR-0078 Decision 11; phase 6 design §4.8):
 * fill pockets the two example stickers in the page's language and watches them from their 23 Oct baselines,
 * checked at once, so on the saved pages both say "Watching · No change since 23 Oct" and the Pocket button
 * counts no change; a second fill adds nothing; reset deletes the watches and leaves the stickers; the
 * presenter's ?aixc-watch=fill runs once; the album's empty state offers "Watch two example cards" in demo mode
 * only (?aixc-demo=off: none).
 *
 * The layer comes from the offline kit (tests/e2e/vodafone-layer.ts, used as it is), its gateway on 4721 with
 * demos.watch on for this gateway only. The watch's own fetches (robots.txt, the saved pages of 23 Oct) are
 * answered by a route on the page; nothing leaves the machine.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { after, before, test } from 'node:test'
import zlib from 'node:zlib'

import type { Page } from 'playwright'

import { DESKTOP, type LayerGateway, launchLayer, open, REPLAY, startLayerGateway, V } from '../e2e/vodafone-layer.ts'

const PORT = 4721
const SNAPSHOTS = new Map(
	(JSON.parse(fs.readFileSync(path.join(REPLAY, 'crawl.json'), 'utf8')) as { pages: { url: string; snapshot?: string }[] }).pages
		.filter((p) => p.snapshot)
		.map((p) => [new URL(p.url).pathname, path.join(REPLAY, p.snapshot!)]),
)
const saved = (pathname: string) => {
	const file = SNAPSHOTS.get(pathname)
	return file ? zlib.gunzipSync(fs.readFileSync(file)).toString('utf8') : null
}

let gw: LayerGateway

before(async () => {
	gw = await startLayerGateway(PORT)
	gw.site.experiences.demos.watch = true
	gw.site.experiences.watch.minIntervalMin = 0
})

after(async () => {
	await gw?.close()
})

/** The watch's fetches answered with the saved pages of 23 Oct; returns the paths asked for. */
async function answerWatch(page: Page): Promise<string[]> {
	const log: string[] = []
	await page.route(
		(url) => url.origin === V,
		async (route) => {
			const req = route.request()
			const url = new URL(req.url())
			if (req.resourceType() !== 'fetch' || url.pathname.startsWith('/__vg/')) return route.fallback()
			log.push(url.pathname)
			if (url.pathname === '/robots.txt') return route.fulfill({ status: 200, contentType: 'text/plain', body: 'User-agent: *\nAllow: /\n' })
			const html = saved(url.pathname)
			if (!html) return route.fulfill({ status: 404, contentType: 'text/html', body: '<!doctype html><title>404</title>' })
			return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html })
		},
	)
	return log
}

const ready = (page: Page) => page.waitForFunction(() => (window as any).__aixcWatch?.ready === true, null, { timeout: 15_000 })
interface Sticker {
	key: string
	id: string
	path: string
	lang: string
	title: string
}
const stickers = (page: Page): Promise<Sticker[]> => page.evaluate(() => (window as any).__aixc.demos.pocket.store.all().map((r: any) => ({ key: r.key, id: r.id, path: r.source.path, lang: r.copy.lang, title: r.copy.title })))
const watchRows = (page: Page) =>
	page.evaluate(
		() =>
			new Promise<{ key: string; from: string; baselineAt: number | null }[]>((resolve, reject) => {
				const r = indexedDB.open('aixc-watch-v1')
				r.onerror = () => reject(r.error)
				r.onsuccess = () => {
					const db = r.result
					if (!db.objectStoreNames.contains('watches')) return resolve((db.close(), []))
					const q = db.transaction('watches').objectStore('watches').getAll()
					q.onsuccess = () => resolve((db.close(), q.result.map((w: any) => ({ key: w.key, from: w.from, baselineAt: w.baselineAt ?? null }))))
					q.onerror = () => reject(q.error)
				}
			}),
	)
const openAlbum = async (page: Page) => {
	await page.evaluate(() => (window as any).__aixc.demos.pocket.open())
	await page.waitForFunction(() => (window as any).__aixc.demos.pocket.state.view === 'pocket' && !(window as any).__aixc.demos.pocket.state.busy, null, { timeout: 15_000 })
}
const closeAlbum = async (page: Page) => {
	await page.evaluate(() => (window as any).__aixc.demos.pocket.close())
	await page.waitForFunction(() => (window as any).__aixc.demos.pocket.state.view === 'page' && !(window as any).__aixc.demos.pocket.state.busy, null, { timeout: 15_000 })
}
const lines = (page: Page, key: string) =>
	page.evaluate((key) => {
		const box = [...document.querySelectorAll<HTMLElement>('.aixc-watch')].find((b) => b.dataset.watchFor === key)
		return box ? [...box.querySelectorAll('.aixc-watch__line')].map((p) => p.textContent) : null
	}, key)
const changedCount = (page: Page) => page.evaluate(() => document.querySelector<HTMLElement>('.pocket-peek__changed:not([hidden])')?.textContent ?? null)
const fill = (page: Page) => page.evaluate(() => (window as any).__aixcWatch.fill())

/** Fills on `pathname` and checks the two stickers and their lines; returns their keys. */
async function fillAndSee(page: Page, pathname: string, line: RegExp) {
	await open(page, pathname, '?aixc-debug')
	await ready(page)
	assert.deepEqual(await stickers(page), [], 'an empty pocket to start')
	const r = await fill(page)
	assert.equal(r.ok, true, `fill: ${JSON.stringify(r)}`)
	const lang = pathname.slice(1, 3)
	const list = await stickers(page)
	assert.deepEqual(
		list.map((s) => [s.id, s.path, s.lang]).sort(),
		[
			['mobile-internet-bundles', `/${lang}/home`, lang],
			['vodafone-cash', `/${lang}/services`, lang],
		],
	)
	const rows = await watchRows(page)
	assert.deepEqual(rows.map((w) => w.key).sort(), list.map((s) => s.key).sort(), 'both watched')
	for (const w of rows) {
		assert.equal(w.from, 'demo')
		assert.equal(new Date(w.baselineAt!).toISOString().slice(0, 10), '2026-10-23')
	}
	await openAlbum(page)
	for (const s of list) {
		const got = await lines(page, s.key)
		assert.ok(got && got.length >= 1 && line.test(got[0]!), `${s.id}: ${JSON.stringify(got)}`)
	}
	await closeAlbum(page)
	assert.equal(await changedCount(page), null, 'no change counted on the Pocket button')
	return list
}

test('English: fill on /en/home -> two stickers, both "Watching · No change since 23 Oct", no change counted; twice -> still two; reset -> no watches, the stickers stay', { timeout: 180_000 }, async () => {
	const l = await launchLayer(gw, { viewport: DESKTOP, reducedMotion: true })
	const errors: string[] = []
	l.page.on('pageerror', (e) => errors.push(e.message))
	try {
		const page = l.page
		const log = await answerWatch(page)
		const list = await fillAndSee(page, '/en/home', /^Watching · No change since 23 Oct$/)
		for (const p of ['/robots.txt', '/en/home', '/en/mobile-internet-bundles', '/en/services', '/en/vodafone-cash']) assert.ok(log.includes(p), `checked at once: ${p} (${log.join(', ')})`)
		assert.deepEqual(list.map((s) => s.title).sort(), ['Internet Bundles', 'Vodafone Cash'])
		// The check compared with the 23 Oct baselines (a fresh baseline would be dated today) and found them the same.
		const targets = await page.evaluate(
			() =>
				new Promise<any[]>((resolve, reject) => {
					const r = indexedDB.open('aixc-watch-v1')
					r.onerror = () => reject(r.error)
					r.onsuccess = () => {
						const db = r.result
						const q = db.transaction(['targets', 'changes']).objectStore('targets').getAll()
						q.onsuccess = () => resolve((db.close(), q.result))
					}
				}),
		)
		assert.deepEqual(targets.map((t) => `${t.kind} ${new URL(t.url).pathname}`).sort(), ['card /en/home', 'card /en/services', 'page /en/mobile-internet-bundles', 'page /en/vodafone-cash'])
		for (const t of targets) {
			assert.equal(new Date(t.baselineAt).toISOString().slice(0, 10), '2026-10-23', `${t.id}: the 23 Oct baseline kept`)
			assert.ok(t.checkedAt > Date.UTC(2026, 10, 1), `${t.id}: checked now`)
			assert.equal(t.status, 'ok')
			assert.equal(t.changedAt ?? null, null, `${t.id}: no change`)
		}

		// Twice: nothing more.
		const again = await fill(page)
		assert.equal(again.ok, true)
		assert.equal((await stickers(page)).length, 2)
		assert.equal((await watchRows(page)).length, 2)

		// Reset: the watches go, the stickers stay.
		await page.evaluate(() => (window as any).__aixcWatch.reset())
		assert.deepEqual(await watchRows(page), [])
		assert.equal((await stickers(page)).length, 2)
		await openAlbum(page)
		for (const s of list) await page.waitForFunction((key) => [...document.querySelectorAll<HTMLElement>('.aixc-watch')].find((b) => b.dataset.watchFor === key)?.textContent === 'Tell me when this changes', s.key, { timeout: 10_000 })
		await closeAlbum(page)
		assert.deepEqual(errors, [])
		assert.deepEqual(l.reached, [], 'nothing left the machine')
	} finally {
		await l.close()
	}
})

test('Arabic: fill on /ar/home -> the Arabic stickers, both in Arabic "Watching · No change since 23 Oct"', { timeout: 180_000 }, async () => {
	const l = await launchLayer(gw, { viewport: DESKTOP, reducedMotion: true })
	try {
		const page = l.page
		await answerWatch(page)
		const list = await fillAndSee(page, '/ar/home', /^بنتابعها · مفيش تغيير من 23 أكتوبر$/)
		assert.deepEqual(list.map((s) => s.title).sort(), ['باقات الانترنت', 'ڤودافون كاش'].sort())
		assert.deepEqual(l.reached, [])
	} finally {
		await l.close()
	}
})

test('?aixc-watch=fill fills once after start and leaves the address; a reload does not fill again', { timeout: 180_000 }, async () => {
	const l = await launchLayer(gw, { viewport: DESKTOP, reducedMotion: true })
	try {
		const page = l.page
		await answerWatch(page)
		await open(page, '/en/home', '?aixc-debug&aixc-watch=fill')
		await ready(page)
		await page.waitForFunction(() => (window as any).__aixc.demos.pocket.store.all().length === 2, null, { timeout: 30_000 })
		await page.waitForFunction(() => !/aixc-watch=/.test(location.search), null, { timeout: 30_000 })
		assert.match(await page.evaluate(() => location.search), /aixc-debug/, 'the other switches stay')
		await page.waitForFunction(
			() =>
				new Promise((resolve) => {
					const r = indexedDB.open('aixc-watch-v1')
					r.onsuccess = () => {
						const db = r.result
						if (!db.objectStoreNames.contains('watches')) return resolve((db.close(), false))
						const q = db.transaction('watches').objectStore('watches').count()
						q.onsuccess = () => resolve((db.close(), q.result === 2))
					}
					r.onerror = () => resolve(false)
				}),
			null,
			{ timeout: 30_000 },
		)
		// Reset the watch only, then reload the address as it is now: no second fill.
		await page.evaluate(() => (window as any).__aixcWatch.reset())
		await page.reload({ waitUntil: 'load' })
		await ready(page)
		await page.waitForTimeout(1500)
		assert.deepEqual(await watchRows(page), [], 'a reload does not fill again')
		assert.equal((await stickers(page)).length, 2)
	} finally {
		await l.close()
	}
})

test('the album\'s empty state offers "Watch two example cards" in demo mode, which fills; not with ?aixc-demo=off', { timeout: 180_000 }, async () => {
	const l = await launchLayer(gw, { viewport: DESKTOP, reducedMotion: true })
	try {
		const page = l.page
		await answerWatch(page)
		const emptyButton = () => page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.pocket-empty button')].map((b) => b.textContent))
		// The album shows its empty state after "Empty pocket" (an empty pocket has no button to open it): a card
		// pocketed with its chip when there is none, the album opened, emptied.
		const openEmpty = async () => {
			if (!(await stickers(page)).length) {
				await page.waitForSelector('.pocket-chips .pocket-cta', { state: 'attached', timeout: 15_000 })
				await page.evaluate(() => document.querySelector<HTMLElement>('.pocket-chips .pocket-cta')!.click())
				await page.waitForFunction(() => (window as any).__aixc.demos.pocket.state.ids.length === 1, null, { timeout: 10_000 })
				await page.waitForFunction(() => !(window as any).__aixc.demos.pocket.state.busy && !document.querySelector('.pocket-layer .curl-host'), null, { timeout: 10_000 }).catch(() => {})
			}
			await openAlbum(page)
			await page.evaluate(() => document.querySelector<HTMLElement>('.pocket-clear')!.click())
			await page.waitForFunction(() => !document.querySelector<HTMLElement>('.pocket-empty')!.hidden, null, { timeout: 10_000 })
		}
		await open(page, '/en/services', '?aixc-debug')
		await ready(page)
		await openEmpty()
		assert.ok((await emptyButton()).includes('Watch two example cards'), `the empty state: ${JSON.stringify(await emptyButton())}`)
		await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.pocket-empty button')].find((b) => b.textContent === 'Watch two example cards')!.click())
		await page.waitForFunction(() => (window as any).__aixc.demos.pocket.store.all().length === 2, null, { timeout: 30_000 })
		await page.waitForFunction(() => document.querySelectorAll('.aixc-watch__line').length >= 2, null, { timeout: 30_000 })
		await closeAlbum(page)

		// Not in demo mode: no button (the rest of the watch carries on).
		await open(page, '/en/services', '?aixc-debug&aixc-demo=off')
		await ready(page)
		await openEmpty()
		assert.ok(!(await emptyButton()).includes('Watch two example cards'), `no demo button: ${JSON.stringify(await emptyButton())}`)

		// Arabic words.
		await open(page, '/ar/services', '?aixc-debug')
		await ready(page)
		await openEmpty()
		assert.ok((await emptyButton()).includes('تابع كارتين كمثال'), `the Arabic empty state: ${JSON.stringify(await emptyButton())}`)
	} finally {
		await l.close()
	}
})
