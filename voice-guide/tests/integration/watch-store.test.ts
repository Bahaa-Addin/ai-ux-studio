/**
 * The page watch's store and its run across tabs, in Chromium (experiences/src/watch/store.js and
 * check.js; ADR-0078 point 5, phase 6 design §4.3, §4.4 steps 3 and 10, §5): IndexedDB `aixc-watch-v1`
 * survives a reload and localStorage.clear() (Vodafone's signed-out theme clears localStorage); the
 * Pocket's `aixc-v1` still opens at version 1 beside it; two tabs make one run (Web Locks) and the other
 * tab hears it (BroadcastChannel); reset() deletes the database. The page is an empty one answered on
 * Vodafone's https origin by the route (a secure context, for crypto.subtle); every other request is
 * refused, and the checker's fetch is a stand-in inside the page, so nothing leaves the machine.
 */
import assert from 'node:assert/strict'
import path from 'node:path'
import { after, before, test } from 'node:test'

import * as esbuild from 'esbuild'
import { type Browser, type BrowserContext, chromium, type Page } from 'playwright'

import { ROOT } from '#shared/config.ts'

const ORIGIN = 'https://web.vodafone.com.eg'
const BLANK = `${ORIGIN}/__aixc-watch-test`
const SRC = path.join(ROOT, '../experiences/src')

/** The store, the checker with read.js and the mask, and the Pocket's store, bundled as the layer would load them. */
const ENTRY = `
import { openWatchStore } from './watch/store.js'
import { createChecker } from './watch/check.js'
import { maskContent } from './watch/mask.js'
import { openPocketStore } from './pocket/store.js'
const LONG = 'Bundles for every day of the month, with minutes, units and gigabytes that last. '.repeat(4)
const pages = new Map()
window.__w = {
  openWatchStore, openPocketStore,
  pages,
  LONG,
  /** A checker over a store, its fetch a stand-in that answers from pages after delayMs. */
  checker(store, { delayMs = 0 } = {}) {
    const fetchImpl = async (url) => {
      await new Promise((r) => setTimeout(r, delayMs))
      window.__fetched = (window.__fetched || 0) + 1
      if (url.endsWith('/robots.txt')) return new Response('', { status: 404 })
      const body = pages.get(url)
      return body == null ? new Response('', { status: 404 }) : new Response(body, { status: 200, headers: { 'content-type': 'text/html' } })
    }
    return createChecker({
      store,
      read: () => ({ model: null }),
      reconcile: () => ({ ids: new Map() }),
      mask: maskContent,
      rules: { include: ['^/(en|ar)/'], exclude: [], origin: '${ORIGIN}', minIntervalMin: 30, perVisitMax: 12, spacingMs: 1000, maxWatched: 20, minChars: 200 },
      fetchImpl,
      sleep: async () => {},
    })
  },
  /** A watch with one page target, written straight to the store. */
  async watchPage(store, key, url) {
    await store.linkTarget({ id: 'page ' + url, kind: 'page', url, hash: null, status: 'ok' }, key)
    await store.addWatch({ key, lang: 'en', createdAt: Date.now(), from: 'sticker', cardTargetId: null, pageTargetId: 'page ' + url, pageNote: null, baselineAt: null })
  },
}
`

let browser: Browser
let context: BrowserContext
let bundle: string

const open = async (): Promise<Page> => {
	const page = await context.newPage()
	await page.goto(BLANK)
	await page.addScriptTag({ content: bundle })
	return page
}
const databases = (page: Page) => page.evaluate(async () => (await indexedDB.databases()).map((d) => `${d.name}@${d.version}`).sort())

before(async () => {
	const r = await esbuild.build({ stdin: { contents: ENTRY, resolveDir: SRC, loader: 'js' }, bundle: true, format: 'iife', write: false, target: 'es2022' })
	bundle = r.outputFiles[0].text
	browser = await chromium.launch()
	context = await browser.newContext()
	await context.route('**/*', (route) => (route.request().url() === BLANK ? route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>watch</title>' }) : route.abort()))
})
after(async () => {
	await browser?.close()
})

test('aixc-watch-v1 survives a reload and localStorage.clear(); the Pocket\'s aixc-v1 opens at version 1 beside it', async () => {
	const page = await open()
	assert.equal(await page.evaluate(() => window.isSecureContext && !!crypto.subtle), true)
	await page.evaluate(async () => {
		const w = (window as any).__w
		const s = w.openWatchStore()
		await s.ready
		await w.watchPage(s, 'k1', 'https://web.vodafone.com.eg/en/bundles')
		await s.addChange({ stickerKey: 'k1', targetId: 'page https://web.vodafone.com.eg/en/bundles', kind: 'page', detectedAt: 1 })
		localStorage.setItem('theme', 'x')
	})
	await page.reload()
	await page.addScriptTag({ content: bundle })
	const after = await page.evaluate(async () => {
		localStorage.clear()
		const w = (window as any).__w
		const s = w.openWatchStore()
		await s.ready
		const pocket = w.openPocketStore()
		await pocket.ready
		return { persistent: s.persistent, watches: (await s.listWatches()).map((x: { key: string }) => x.key), unseen: await s.unseenCount(), pocketPersistent: pocket.persistent }
	})
	assert.deepEqual(after, { persistent: true, watches: ['k1'], unseen: 1, pocketPersistent: true })
	const dbs = await databases(page)
	assert.ok(dbs.includes('aixc-watch-v1@1'), dbs.join(', '))
	assert.ok(dbs.includes('aixc-v1@1'), 'the Pocket keeps its own database at version 1')
	await page.close()
})

test('two tabs: one run (Web Locks), and the other tab hears the change on the channel', async () => {
	const a = await open()
	const b = await open()
	// A baseline from tab A first.
	const first = await a.evaluate(async () => {
		const w = (window as any).__w
		const s = w.openWatchStore()
		await s.reset()
		await w.watchPage(s, 'k2', 'https://web.vodafone.com.eg/en/offers')
		w.pages.set('https://web.vodafone.com.eg/en/offers', `<html><body><div id="main-content">${w.LONG}</div></body></html>`)
		const r = await w.checker(s).run({ force: true })
		;(window as any).__s = s
		return { r, changes: (await s.changesFor('k2')).length }
	})
	assert.equal(first.r.ran, true, JSON.stringify(first.r))
	assert.equal(first.changes, 0, 'a baseline')
	await b.evaluate(async () => {
		const w = (window as any).__w
		const s = w.openWatchStore()
		await s.ready
		;(window as any).__heard = []
		s.subscribe((m: unknown) => (window as any).__heard.push(m))
		;(window as any).__s = s
	})
	// Both tabs check at once: A (a press) holds the lock while its slow fetch is out; B's check on visit finds it taken.
	await a.evaluate(() => (window as any).__w.pages.set('https://web.vodafone.com.eg/en/offers', `<html><body><div id="main-content">${(window as any).__w.LONG} Now with more.</div></body></html>`))
	await b.evaluate(() => (window as any).__w.pages.set('https://web.vodafone.com.eg/en/offers', `<html><body><div id="main-content">${(window as any).__w.LONG} Now with more.</div></body></html>`))
	const runA = a.evaluate(() => (window as any).__w.checker((window as any).__s, { delayMs: 400 }).run({ force: true }))
	await a.waitForTimeout(100)
	const rb = await b.evaluate(() => (window as any).__w.checker((window as any).__s).run())
	const ra = await runA
	assert.equal(ra.ran, true, JSON.stringify(ra))
	assert.deepEqual(rb, { ran: false, reason: 'locked' })
	assert.equal(await b.evaluate(() => (window as any).__fetched || 0), 0, 'tab B fetched nothing')
	await b.waitForFunction(() => (window as any).__heard.some((m: { type: string }) => m.type === 'changed'))
	assert.equal(await b.evaluate(() => (window as any).__s.unseenCount()), 1, 'tab B reads the new change')
	// A press in B while A runs (2026-11-18 review, F7) is not dropped: it waits for A's lock, then runs; never two at once.
	const runA2 = a.evaluate(async () => {
		const r = await (window as any).__w.checker((window as any).__s, { delayMs: 400 }).run({ force: true })
		return { r, end: Date.now() }
	})
	await a.waitForTimeout(100)
	const rb2 = await b.evaluate(async () => {
		const r = await (window as any).__w.checker((window as any).__s).run({ force: true })
		return { r, end: Date.now() }
	})
	const ra2 = await runA2
	assert.equal(ra2.r.ran, true, JSON.stringify(ra2.r))
	assert.equal(rb2.r.ran, true, JSON.stringify(rb2.r))
	assert.ok(rb2.end >= ra2.end, 'B ran after A let go of the lock')
	await a.close()
	await b.close()
})

test('reset() deletes the database, another tab open on it included, and tells that tab', async () => {
	const a = await open()
	const b = await open()
	await b.evaluate(async () => {
		const s = (window as any).__w.openWatchStore()
		await s.ready
		await s.listWatches()
		;(window as any).__heard = []
		s.subscribe((m: unknown) => (window as any).__heard.push(m))
	})
	await a.evaluate(async () => {
		const w = (window as any).__w
		const s = w.openWatchStore()
		await w.watchPage(s, 'k3', 'https://web.vodafone.com.eg/en/home')
		await s.reset()
	})
	assert.ok(!(await databases(a)).includes('aixc-watch-v1@1'), 'deleted')
	assert.ok((await databases(a)).includes('aixc-v1@1'), 'the Pocket\'s database is untouched')
	await b.waitForFunction(() => (window as any).__heard.length > 0)
	await a.close()
	await b.close()
})
