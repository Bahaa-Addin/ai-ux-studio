/**
 * The Pocket's store on Vodafone's origin (experiences/src/pocket/store.js; ADR-0051, O23), in
 * Chromium on a page fulfilled locally (nothing is fetched): stickers live in the visitor's own
 * IndexedDB, survive a reload and the signed-out theme's localStorage.clear(), reach other tabs, are
 * never dropped for being from another page, and fall back to memory when IndexedDB will not open.
 */
import assert from 'node:assert/strict'
import path from 'node:path'
import { after, before, test } from 'node:test'

import * as esbuild from 'esbuild'
import { type Browser, type BrowserContext, chromium, type Page } from 'playwright'

import { ROOT } from '#shared/config.ts'

const ORIGIN = 'https://web.vodafone.com.eg'
let browser: Browser
let bundle: string

before(async () => {
	const r = await esbuild.build({
		stdin: { contents: `export { openPocketStore } from './store.js'\nexport { recordFrom } from './record.js'`, resolveDir: path.join(ROOT, '../experiences/src/pocket') },
		bundle: true,
		format: 'iife',
		globalName: '__pocket',
		write: false,
		target: 'es2022',
	})
	bundle = r.outputFiles[0].text
	browser = await chromium.launch()
})
after(async () => {
	await browser?.close()
})

/** A context whose pages at ORIGIN are an empty page with the store bundled in; nothing leaves. */
async function contextFor(o: { noIndexedDb?: boolean } = {}): Promise<BrowserContext> {
	const ctx = await browser.newContext()
	await ctx.route('**/*', (route) => (new URL(route.request().url()).origin === ORIGIN && route.request().resourceType() === 'document' ? route.fulfill({ status: 200, contentType: 'text/html', body: `<!doctype html><html lang="en"><body><script>${bundle}</script></body></html>` }) : route.abort()))
	if (o.noIndexedDb) await ctx.addInitScript(() => Object.defineProperty(window, 'indexedDB', { get: () => ({ open: () => { throw new Error('blocked') } }) }))
	return ctx
}
const at = async (ctx: BrowserContext, pathname: string): Promise<Page> => {
	const page = await ctx.newPage()
	await page.goto(`${ORIGIN}${pathname}`)
	return page
}
const item = (id: string) => ({ id, title: id, description: 'From EGP 37', image: null, cta: { label: null, href: `${ORIGIN}/en/${id}` }, kind: 'card-action', keys: [{ kind: 'link', value: `/${id}` }] })

test('stickers survive a reload and the signed-out theme\'s localStorage.clear(); other pages\' stickers are kept', async () => {
	const ctx = await contextFor()
	try {
		const services = await at(ctx, '/en/services')
		await services.evaluate(async ([a, b]) => {
			const p = (window as any).__pocket
			const s = p.openPocketStore()
			await s.ready
			await s.put(p.recordFrom({ item: a, section: { id: 's' }, page: { path: '/en/services', lang: 'en' }, key: 'a' }))
			await s.put(p.recordFrom({ item: b, section: { id: 's' }, page: { path: '/en/vodafone-cash', lang: 'en' }, key: 'b' }))
			localStorage.clear()
		}, [item('roaming'), item('cash')])
		await services.reload()
		const after = await services.evaluate(async () => {
			const s = (window as any).__pocket.openPocketStore()
			await s.ready
			return { persistent: s.persistent, keys: s.all().map((r: { key: string }) => r.key).sort(), copy: s.get('a')?.copy.description }
		})
		assert.deepEqual(after, { persistent: true, keys: ['a', 'b'], copy: 'From EGP 37' }, 'both stickers, on any page, copy as saved')
		// The same store from another page.
		const home = await at(ctx, '/ar/home')
		assert.deepEqual(await home.evaluate(async () => {
			const s = (window as any).__pocket.openPocketStore()
			await s.ready
			return s.all().map((r: { key: string }) => r.key).sort()
		}), ['a', 'b'])
	} finally {
		await ctx.close()
	}
})

test('two tabs: a sticker pocketed in one appears in the other, and one put back goes from both', async () => {
	const ctx = await contextFor()
	try {
		const a = await at(ctx, '/en/services')
		const b = await at(ctx, '/en/home')
		await b.evaluate(async () => {
			const s = (window as any).__pocket.openPocketStore()
			await s.ready
			;(window as any).__seen = []
			s.subscribe((list: { key: string }[]) => (window as any).__seen.push(list.map((r) => r.key).sort().join(',')))
		})
		await a.evaluate(async (x) => {
			const p = (window as any).__pocket
			const s = p.openPocketStore()
			await s.ready
			await s.put(p.recordFrom({ item: x, section: { id: 's' }, page: { path: '/en/services', lang: 'en' }, key: 'k1' }))
			await s.remove('k1')
			await s.put(p.recordFrom({ item: x, section: { id: 's' }, page: { path: '/en/services', lang: 'en' }, key: 'k2' }))
		}, item('roaming'))
		await b.waitForFunction(() => ((window as any).__seen as string[]).at(-1) === 'k2', null, { timeout: 5000 })
	} finally {
		await ctx.close()
	}
})

test('IndexedDB blocked (a private window, a policy): the Pocket works for this page, in memory, and nothing throws', async () => {
	const ctx = await contextFor({ noIndexedDb: true })
	try {
		const page = await at(ctx, '/en/services')
		const errors: string[] = []
		page.on('pageerror', (e) => errors.push(e.message))
		const out = await page.evaluate(async (x) => {
			const p = (window as any).__pocket
			const problems: string[] = []
			const s = p.openPocketStore({ onError: (e: Error) => problems.push(e.message) })
			await s.ready
			await s.put(p.recordFrom({ item: x, section: { id: 's' }, page: { path: '/en/services', lang: 'en' }, key: 'm' }))
			return { persistent: s.persistent, keys: s.all().map((r: { key: string }) => r.key), problems }
		}, item('roaming'))
		assert.deepEqual(out, { persistent: false, keys: ['m'], problems: ['blocked'] })
		assert.deepEqual(errors, [])
	} finally {
		await ctx.close()
	}
})

test('the clone\'s earlier ids-only store is read once and dropped; a record that is not one is refused', async () => {
	const ctx = await contextFor()
	try {
		const page = await at(ctx, '/en/services')
		const out = await page.evaluate(async () => {
			localStorage.setItem('aixc.pocket.v1', JSON.stringify(['roaming', 7, 'cash']))
			const s = (window as any).__pocket.openPocketStore()
			await s.ready
			const ids = s.legacyIds()
			s.dropLegacy()
			let refused = false
			try {
				await s.put({ key: 'x' })
			} catch {
				refused = true
			}
			return { ids, left: localStorage.getItem('aixc.pocket.v1'), refused, all: s.all().length }
		})
		assert.deepEqual(out, { ids: ['roaming', 'cash'], left: null, refused: true, all: 0 })
	} finally {
		await ctx.close()
	}
})
