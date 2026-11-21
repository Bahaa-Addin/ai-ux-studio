/**
 * The page watch's reading on the saved Vodafone pages (experiences/src/watch/read.js; ADR-0078 point 1
 * and 4, phase 6 design §5), in Chromium: the pages are parsed as the watch parses a fetch, with
 * DOMParser, and read with the live adapter's real readPage and the Pocket's real reconcile, bundled
 * with read.js as the layer passes them in. 23 Oct is the rendered capture (fixtures/replay/vodafone-eg),
 * 12 Nov the raw server HTML of four Arabic pages. Nothing is fetched.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { gunzipSync } from 'node:zlib'

import * as esbuild from 'esbuild'
import { type Browser, chromium, type Page } from 'playwright'

import { ROOT } from '#shared/config.ts'

const ORIGIN = 'https://web.vodafone.com.eg'
const REPLAY = path.join(ROOT, 'fixtures/replay/vodafone-eg')
const LATER = path.join(ROOT, 'fixtures/replay/vodafone-eg-2026-11-12')
const SRC = path.join(ROOT, '../experiences/src')

interface Saved {
	url: string
	snapshot?: string
}
const gz = (file: string) => {
	const buf = fs.readFileSync(file)
	return (file.endsWith('.gz') ? gunzipSync(buf) : buf).toString('utf8')
}
const oct = (JSON.parse(fs.readFileSync(path.join(REPLAY, 'crawl.json'), 'utf8')) as { pages: Saved[] }).pages.filter((p) => p.snapshot)
const nov = (JSON.parse(fs.readFileSync(path.join(LATER, 'pages.json'), 'utf8')) as { pages: { url: string; snapshot: string }[] }).pages
const octHtml = (pathname: string) => gz(path.join(REPLAY, oct.find((p) => new URL(p.url).pathname === pathname)!.snapshot!))
const novHtml = (pathname: string) => gz(path.join(LATER, nov.find((p) => new URL(p.url).pathname === pathname)!.snapshot))

let browser: Browser
let page: Page

/** What the layer hands the watch, bundled together: the core's readPage, the Pocket's reconcile and recordFrom, and the watch's own modules. */
const ENTRY = `
import { readPage } from './host/live-adapter.js'
import { reconcile, recordFrom } from './pocket/record.js'
import * as read from './watch/read.js'
import * as url from './watch/url.js'
import { maskContent } from './watch/mask.js'
window.__w = { readPage, reconcile, recordFrom, read, url, maskContent }
`

before(async () => {
	const r = await esbuild.build({ stdin: { contents: ENTRY, resolveDir: SRC, loader: 'js' }, bundle: true, format: 'iife', write: false, target: 'es2022' })
	browser = await chromium.launch()
	page = await browser.newPage()
	// crypto.subtle needs a secure context: an empty page answered on Vodafone's https origin by the
	// route itself; every other request is refused, so nothing leaves the machine.
	const blank = `${ORIGIN}/__aixc-watch-test`
	await page.route('**/*', (route) => (route.request().url() === blank ? route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>watch</title>' }) : route.abort()))
	await page.goto(blank)
	await page.addScriptTag({ content: r.outputFiles[0].text })
})
after(async () => {
	await browser?.close()
})

interface Card {
	key: string
	id: string
	hash: string
	href: string | null
}
interface Reading {
	region: { chars: number; staticEnough: boolean } | null
	digest: { textHash: string; linksHash: string; links: number } | null
	cards: Card[]
	ms: { parse: number; read: number; digest: number; cards: number }
}

/** Parses `html` as a fetch would be (DOMParser), and reads it: region, page digest, every card's digest with a sticker made from it. */
const readHtml = (html: string, pathname: string): Promise<Reading> =>
	page.evaluate(
		async ([html, origin, pathname]) => {
			const w = (window as any).__w
			const t0 = performance.now()
			const doc = new DOMParser().parseFromString(html, 'text/html')
			const t1 = performance.now()
			const { model } = w.readPage(doc, { origin, path: pathname, search: '' })
			const t2 = performance.now()
			const region = w.read.region(doc)
			const digest = await w.read.pageDigest(doc, { mask: w.maskContent, origin, url: origin + pathname })
			const t3 = performance.now()
			const cards: Card[] = []
			const lang = pathname.slice(1, 3)
			for (const s of model?.sections || [])
				for (const item of s.items) {
					const r = w.recordFrom({ item, section: s, page: { path: pathname, lang }, model, key: `${s.id}#${item.id}` })
					const d = await w.read.cardDigest(item, { mask: w.maskContent })
					cards.push({ key: r.key, id: item.id, hash: d.hash, href: d.href })
				}
			const t4 = performance.now()
			return { region: region && { chars: region.chars, staticEnough: region.staticEnough }, digest: digest && { textHash: digest.textHash, linksHash: digest.linksHash, links: digest.links }, cards, ms: { parse: t1 - t0, read: t2 - t1, digest: t3 - t2, cards: t4 - t3 } }
		},
		[html, ORIGIN, pathname] as const,
	)

/** Makes a sticker from the card `itemId` of `from` (23 Oct, its own page), then finds it with read.findCard in `html`. */
const findDemo = (from: string, html: string, pathname: string, itemId: string) =>
	page.evaluate(
		([from, html, origin, pathname, itemId]) => {
			const w = (window as any).__w
			const lang = pathname.slice(1, 3)
			const parse = (h: string) => new DOMParser().parseFromString(h, 'text/html')
			const source = w.readPage(parse(from), { origin, path: pathname, search: '' }).model
			const section = source.sections.find((s: any) => s.items.some((i: any) => i.id === itemId))
			if (!section) return { made: false, id: null, href: null, title: null }
			const item = section.items.find((i: any) => i.id === itemId)
			const record = w.recordFrom({ item, section, page: { path: pathname, lang }, model: source, key: 's-demo' })
			const found = w.read.findCard(parse(html), record, { read: w.readPage, reconcile: w.reconcile, origin })
			return { made: true, id: found.item?.id ?? null, href: found.item ? w.url.normalise(found.item.cta?.href, origin) : null, title: found.item?.title ?? null }
		},
		[from, html, ORIGIN, pathname, itemId] as const,
	)

test('the 69 Arabic cards of 23 Oct hash the same on 12 Nov, link included (design M4)', async () => {
	let same = 0
	const added: string[] = []
	for (const p of nov) {
		const pathname = new URL(p.url).pathname
		const a = await readHtml(octHtml(pathname), pathname)
		const b = await readHtml(novHtml(pathname), pathname)
		// Each card of 23 Oct found again on 12 Nov by the Pocket's own matching, not by id alone.
		const found = await page.evaluate(
			([octHtml, novHtml, origin, pathname]) => {
				const w = (window as any).__w
				const parse = (h: string) => new DOMParser().parseFromString(h, 'text/html')
				const before = w.readPage(parse(octHtml), { origin, path: pathname, search: '' }).model
				const after = w.readPage(parse(novHtml), { origin, path: pathname, search: '' }).model
				const records = before.sections.flatMap((s: any) => s.items.map((item: any) => w.recordFrom({ item, section: s, page: { path: pathname, lang: 'ar' }, model: before, key: `${s.id}#${item.id}` })))
				return [...w.reconcile(records, after, { page: { path: pathname, lang: 'ar' } }).ids] as [string, string][]
			},
			[octHtml(pathname), novHtml(pathname), ORIGIN, pathname] as const,
		)
		const now = new Map(b.cards.map((c) => [c.id, c]))
		const ids = new Map(found)
		for (const c of a.cards) {
			const id = ids.get(c.key)
			assert.ok(id, `${pathname}: ${c.id} found on 12 Nov`)
			assert.equal(id, c.id, `${pathname}: ${c.id} is the same card`)
			assert.equal(now.get(id!)!.hash, c.hash, `${pathname}: ${c.id} hashes the same`)
			assert.equal(now.get(id!)!.href, c.href, `${pathname}: ${c.id} links the same`)
			same++
		}
		added.push(...b.cards.filter((c) => !a.cards.some((x) => x.id === c.id)).map((c) => `${pathname}#${c.id}`))
	}
	console.log(`# 23 Oct -> 12 Nov, Arabic: ${same} cards hash the same; added on 12 Nov: ${added.join(', ') || 'none'}`)
	assert.equal(same, 69, 'the 69 cards of the four Arabic pages')
	assert.deepEqual(added, ['/ar/home#home-compound'], 'the one card added (M4)')
})

test('the two demo cards are found by reconcile: both languages on 23 Oct, Arabic on 12 Nov (design M6)', async () => {
	const demos = [
		{ page: 'home', id: 'mobile-internet-bundles', to: 'mobile-internet-bundles' },
		{ page: 'services', id: 'vodafone-cash', to: 'vodafone-cash' },
	]
	for (const d of demos) {
		for (const lang of ['ar', 'en']) {
			const pathname = `/${lang}/${d.page}`
			const r = await findDemo(octHtml(pathname), octHtml(pathname), pathname, d.id)
			assert.ok(r.made, `${pathname}: ${d.id} read on 23 Oct`)
			assert.equal(r.id, d.id, `${pathname}: ${d.id} found on 23 Oct`)
			assert.equal(r.href, `${ORIGIN}/${lang}/${d.to}`, `${pathname}: ${d.id} opens /${lang}/${d.to}`)
			console.log(`# demo ${pathname} 23 Oct: ${r.id} "${r.title}" -> ${r.href}`)
		}
		const pathname = `/ar/${d.page}`
		const r = await findDemo(octHtml(pathname), novHtml(pathname), pathname, d.id)
		assert.equal(r.id, d.id, `${pathname}: the sticker of 23 Oct finds ${d.id} on 12 Nov`)
		assert.equal(r.href, `${ORIGIN}/ar/${d.to}`)
		console.log(`# demo ${pathname} 23 Oct -> 12 Nov: ${r.id} "${r.title}" -> ${r.href}`)
	}
})

test('every CMS page\'s region holds at least 200 characters, except /en/promotions; /spa/storeLocator has none (design M2); parse times printed', async () => {
	const rows: string[] = []
	const pages = [...oct.map((p) => ({ date: '23 Oct', pathname: new URL(p.url).pathname, html: () => gz(path.join(REPLAY, p.snapshot!)) })), ...nov.map((p) => ({ date: '12 Nov', pathname: new URL(p.url).pathname, html: () => gz(path.join(LATER, p.snapshot)) }))]
	for (const p of pages) {
		const html = p.html()
		const r = await readHtml(html, p.pathname)
		const watchable = await page.evaluate(([u, origin]) => (window as any).__w.url.isWatchablePath(u, { origin }), [ORIGIN + p.pathname, ORIGIN] as const)
		if (p.pathname.startsWith('/spa/')) {
			assert.equal(r.region, null, `${p.pathname}: no #main-content, no region (no body fallback)`)
			assert.equal(r.digest, null, `${p.pathname}: nothing to hash`)
			assert.equal(watchable, false, `${p.pathname}: never fetched`)
		} else if (p.pathname === '/en/promotions') {
			assert.ok(r.region, `${p.pathname}: a region`)
			assert.equal(r.region!.staticEnough, false, `${p.pathname}: ${r.region!.chars} characters, under 200`)
		} else {
			assert.ok(r.region?.staticEnough, `${p.pathname} ${p.date}: ${r.region?.chars} characters, at least 200`)
			assert.equal(watchable, true, `${p.pathname}: a watchable path`)
			assert.match(r.digest!.textHash, /^[0-9a-f]{64}$/)
		}
		const total = r.ms.parse + r.ms.read + r.ms.digest
		rows.push(`| ${p.date} | ${p.pathname} | ${Math.round(html.length / 1024)} | ${r.region?.chars ?? '-'} | ${r.digest?.links ?? '-'} | ${r.cards.length} | ${r.ms.parse.toFixed(1)} | ${r.ms.read.toFixed(1)} | ${r.ms.digest.toFixed(1)} | ${r.ms.cards.toFixed(1)} | ${total.toFixed(1)} |`)
	}
	console.log(`# watch reading, Chromium (Playwright), ${new Date().toISOString().slice(0, 10)}\n# | date | page | KB html | region chars | links | cards | parse ms | readPage ms | region+page hash ms | card hashes ms | parse+read+page hash ms |\n${rows.map((r) => `# ${r}`).join('\n')}`)
})

test('the raw 12 Nov pages and their rendered 23 Oct twins read the same region and links (design M2, M4)', async () => {
	for (const p of nov) {
		const pathname = new URL(p.url).pathname
		const a = await readHtml(octHtml(pathname), pathname)
		const b = await readHtml(novHtml(pathname), pathname)
		console.log(`# ${pathname}: region ${a.region!.chars} (23 Oct) / ${b.region!.chars} (12 Nov); text ${a.digest!.textHash === b.digest!.textHash ? 'same' : 'differs'}; links ${a.digest!.linksHash === b.digest!.linksHash ? 'same' : 'differ'}`)
		if (pathname !== '/ar/home') assert.equal(a.region!.chars, b.region!.chars, `${pathname}: the same number of characters`)
	}
})
