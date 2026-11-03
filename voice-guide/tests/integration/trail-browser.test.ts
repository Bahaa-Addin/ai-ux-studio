/**
 * The Exploration Trail's browser parts in a real Chromium (SPEC-06; ADR-0036, ADR-0037): the replay
 * of an adversarial recording (nothing runs, navigates, submits or calls out; the iframe is
 * sandboxed, inert and policed), IndexedDB storage (per-step reads, deletion, quota errors), and
 * the destination resolver's priority order on a page.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { after, before, test } from 'node:test'

import * as esbuild from 'esbuild'
import { type Browser, chromium, type Page } from 'playwright'

import { ROOT } from '#shared/config.ts'

import { buildSdk } from '../../packages/sdk/build.ts'
import { adversarialEvents, ORIGIN as FIXTURE_ORIGIN } from '../helpers/trail.ts'

const PORT = 4495
const TRACKER_PORT = 4496
const ORIGIN = `http://localhost:${PORT}`
const TRACKER = `http://localhost:${TRACKER_PORT}`
let browser: Browser
let page: Page
let servers: http.Server[] = []
let trackerHits: string[] = []
let bundle = ''

const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Trail test</title></head><body>
<header><nav><a id="nav-bundles" href="/en/bundles.html">Bundles</a></nav></header>
<main style="width:900px">
	<section id="weekend-offer" style="height:80px"><h2>Weekend offer</h2><p id="weekend-text">Double data</p><a id="cta" href="/en/bundles.html">Choose a bundle</a></section>
	<div data-vg-destination="web.offers.roaming-offer" style="height:40px"><span id="roaming-inner">Roaming</span></div>
	<article style="height:60px" id="named"><h3>Students offer</h3><span id="named-inner">Students</span></article>
	<div id="grid"><article class="bundle-card" data-bundle="mi-25" style="height:40px"><b id="item-inner">Mega 25</b></article></div>
	<article style="height:40px" id="unknown"><h3>Something new</h3><span id="unknown-inner">x</span></article>
	<p id="plain">Text outside any card</p>
</main>
<footer><a id="footer-link" href="/en/help.html">Help</a></footer>
<div id="stage" style="position:relative;width:640px;height:400px"></div>
</body></html>`

const MAP = {
	standard: 'vg-experience-page/v1',
	siteId: 'demo-telco',
	kbVersionId: 'v1',
	profileId: 'p1',
	keepQuery: [],
	page: { id: 'web.offers', kind: 'content', eligible: true, title: { en: 'Offers' } },
	destinations: [
		{ id: 'web.offers.weekend-offer', kind: 'section', css: ['#weekend-offer'], title: { en: 'weekend offer' }, context: { en: 'Offers' }, topic: 'w', questions: {} },
		{ id: 'web.offers.roaming-offer', kind: 'section', css: ['#nowhere'], title: { en: 'Roaming offer' }, context: { en: 'Offers' }, topic: 'r', questions: {} },
		{ id: 'web.offers.students-offer', kind: 'section', css: ['#also-nowhere'], title: { en: 'Students offer' }, context: { en: 'Offers' }, topic: 's', questions: {} },
		{ id: 'web.bundles.mobile-internet.mi-25', kind: 'item', css: ['#gone > article'], title: { en: 'Mega 25' }, context: { en: 'Mobile' }, topic: 'm', collectionId: 'web.bundles.mobile-internet', key: 'mi-25', questions: {} },
	],
	collections: [{ id: 'web.bundles.mobile-internet', itemCss: 'article.bundle-card', keyAttr: 'data-bundle' }],
	pages: [
		{ id: 'web.bundles', kind: 'content', eligible: true, title: { en: 'Bundles' }, paths: [`${ORIGIN}/en/bundles.html`], questions: {} },
		{ id: 'web.help', kind: 'help', eligible: true, title: { en: 'Help' }, paths: [`${ORIGIN}/en/help.html`], questions: {} },
	],
}

before(async () => {
	await buildSdk({ minify: true })
	// A test-only bundle of the trail's browser modules (production chunks expose only their entry points).
	const out = await esbuild.build({
		stdin: {
			contents: `import { Resolver } from './resolver.ts'; import { TrailStore, QuotaError, encodeEvents, decodeChunk } from './storage.ts'; window.__t = { Resolver, TrailStore, QuotaError, encodeEvents, decodeChunk }`,
			resolveDir: path.join(ROOT, 'packages/sdk/src/trail'),
			loader: 'ts',
		},
		bundle: true,
		format: 'iife',
		write: false,
		target: 'es2022',
		logLevel: 'error',
	})
	bundle = out.outputFiles[0].text
	const site = http.createServer((req, res) => {
		const u = new URL(req.url || '/', ORIGIN)
		if (u.pathname === '/page.html') return void res.writeHead(200, { 'Content-Type': 'text/html' }).end(PAGE)
		if (u.pathname === '/test-bundle.js') return void res.writeHead(200, { 'Content-Type': 'text/javascript' }).end(bundle)
		if (u.pathname === '/sdk/trail-replay.js') return void res.writeHead(200, { 'Content-Type': 'text/javascript' }).end(fs.readFileSync(path.join(ROOT, 'packages/sdk/dist/trail-replay.js')))
		if (u.pathname === '/assets/logo.svg') return void res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Set-Cookie': 'seen=1' }).end('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>')
		res.writeHead(404).end()
	})
	const tracker = http.createServer((req, res) => {
		trackerHits.push(req.url || '')
		res.writeHead(200, { 'Content-Type': 'image/gif' }).end()
	})
	for (const [s, port] of [[site, PORT], [tracker, TRACKER_PORT]] as const) await new Promise<void>((r) => s.listen(port, r))
	servers = [site, tracker]
	browser = await chromium.launch()
	page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage()
	page.on('pageerror', (e) => console.log('[pageerror]', e.message))
	await page.goto(`${ORIGIN}/page.html`)
	await page.addScriptTag({ url: '/test-bundle.js' })
})

after(async () => {
	await browser?.close()
	for (const s of servers) await new Promise<void>((r) => s.close(() => r()))
})

/** The adversarial recording, pointed at this test's origin and a tracker we can count. */
const events = () => JSON.parse(JSON.stringify(adversarialEvents()).replaceAll(FIXTURE_ORIGIN, ORIGIN).replaceAll('https://tracker.example', TRACKER).replaceAll('https://evil.example', TRACKER).replaceAll('https://cdn.example', TRACKER))

test('an adversarial recording replays as a picture: nothing runs, navigates, submits or calls out', async () => {
	trackerHits = []
	await page.addScriptTag({ url: '/sdk/trail-replay.js' })
	const before = page.url()
	const r = await page.evaluate(async (evs) => {
		const w = window as any
		const root = document.getElementById('stage')!
		const preview = await w.__vgTrailReplay.createPreview({ root, events: evs, origin: location.origin, reducedMotion: false, label: 'memory' })
		preview.play(0)
		await new Promise((ok) => setTimeout(ok, 600))
		preview.seek(5)
		const iframe = root.querySelector('iframe')!
		const doc = iframe.contentDocument!
		return {
			pwned: w.__pwned ?? null,
			sandbox: iframe.getAttribute('sandbox'),
			tabindex: iframe.getAttribute('tabindex'),
			hidden: iframe.getAttribute('aria-hidden'),
			pointer: getComputedStyle(iframe).pointerEvents,
			csp: doc.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute('content') || '',
			scripts: doc.querySelectorAll('script').length,
			handlers: [...doc.querySelectorAll('*')].flatMap((e) => [...e.attributes].map((a) => a.name)).filter((n) => n.startsWith('on')),
			links: doc.querySelectorAll('a[href], area[href]').length,
			forms: [...doc.querySelectorAll('form')].map((f) => f.getAttribute('action')),
			frames: doc.querySelectorAll('iframe, object, embed, canvas, base').length,
			imgs: [...doc.querySelectorAll('img')].map((i) => i.getAttribute('src') || ''),
			duration: preview.duration,
			cookieSentToTracker: document.cookie,
		}
	}, events())
	await page.waitForTimeout(500)
	assert.equal(r.pwned, null, 'no script, handler or javascript: URL ran')
	assert.equal(r.sandbox, 'allow-same-origin', "rrweb's sandbox: no scripts, forms, popups, top navigation or downloads")
	assert.equal(r.tabindex, '-1')
	assert.equal(r.hidden, 'true')
	assert.equal(r.pointer, 'none')
	assert.match(r.csp, /default-src 'none'/)
	assert.equal(r.scripts, 0)
	assert.deepEqual(r.handlers, [])
	assert.equal(r.links, 0, 'no live links')
	assert.ok(r.forms.every((a) => a === null), 'forms have no action')
	assert.equal(r.frames, 0)
	assert.ok(r.imgs.length > 0 && r.imgs.every((s) => s === '' || s.startsWith('blob:') || s.startsWith('data:')), `only credential-free copies (or none): ${r.imgs}`)
	assert.deepEqual(trackerHits, [], 'no request reached the tracker')
	assert.equal(page.url(), before, 'the page was not navigated')
	// Pointer input on the preview never reaches the memory.
	const box = await page.locator('#stage').boundingBox()
	await page.mouse.click(box!.x + 20, box!.y + 40)
	assert.equal(page.url(), before)
	assert.equal(await page.evaluate(() => (window as any).__pwned ?? null), null)
	await page.evaluate(() => {
		const root = document.getElementById('stage')!
		root.textContent = ''
	})
})

test('a recording without a full snapshot shows nothing rather than a broken page', async () => {
	const err = await page.evaluate(async () => {
		try {
			await (window as any).__vgTrailReplay.createPreview({ root: document.getElementById('stage'), events: [{ type: 3, timestamp: 1, data: { source: 1, positions: [] } }], origin: location.origin, reducedMotion: true, label: 'x' })
			return null
		} catch (e) {
			return (e as Error).message
		}
	})
	assert.equal(err, 'nothing to replay')
})

test('IndexedDB: a step reads only its own chunks; deleting a journey deletes its replay and attention; quota errors are recognised', async () => {
	const r = await page.evaluate(async () => {
		const { TrailStore, QuotaError, encodeEvents, decodeChunk } = (window as any).__t
		const store = await TrailStore.open()
		await store.clearAll()
		const s = { schema: 'vg-trail/v1', id: 'trs_1', siteId: 'demo-telco', locale: 'en', startedAt: 1, updatedAt: 1, expiresAt: Date.now() + 1e6, recordingState: 'recording', bytes: 0, steps: [] }
		await store.putSession(s)
		for (const [step, seq] of [['a', 0], ['a', 1], ['b', 0]] as const) {
			const enc = await encodeEvents([{ type: 3, timestamp: seq, data: { source: 1, step } }])
			await store.putChunk({ id: `${step}:${seq}`, sessionId: 'trs_1', stepId: step, seq, t0: 0, t1: 1, bytes: enc.bytes, enc: enc.enc, data: enc.data })
		}
		await store.putInterest('trs_1', [{ stepId: 'a', key: 'dest:x', score: 1 }])
		const a = await store.chunks('a')
		const decoded = (await Promise.all(a.map((c: unknown) => decodeChunk(c)))).flat()
		const only = decoded.every((e: any) => e.data.step === 'a')
		await store.deleteSession('trs_1')
		const after = { sessions: (await store.sessions()).length, a: (await store.chunks('a')).length, b: (await store.chunks('b')).length, interest: (await store.interest('a')).length }
		const put = IDBObjectStore.prototype.put
		IDBObjectStore.prototype.put = function () {
			throw new DOMException('full', 'QuotaExceededError')
		}
		let quota = false
		try {
			await store.putChunk({ id: 'z', sessionId: 's', stepId: 'z', seq: 0, t0: 0, t1: 0, bytes: 1, enc: 'json', data: '[]' })
		} catch (e) {
			quota = e instanceof QuotaError || (e as DOMException).name === 'QuotaExceededError'
		} finally {
			IDBObjectStore.prototype.put = put
		}
		store.close()
		return { count: a.length, only, after, quota }
	})
	assert.equal(r.count, 2)
	assert.equal(r.only, true)
	assert.deepEqual(r.after, { sessions: 0, a: 0, b: 0, interest: 0 })
	assert.equal(r.quota, true)
})

test('resolver: explicit id, approved selectors, accessible names, links, item keys, local fingerprints; never navigation', async () => {
	const r = await page.evaluate((map) => {
		const res = new (window as any).__t.Resolver(map)
		const at = (id: string) => {
			const x = res.resolve(document.getElementById(id))
			return x ? [x.via, x.destinationId ?? x.fingerprint?.slice(0, 3)] : null
		}
		return {
			css: at('weekend-text'),
			explicit: at('roaming-inner'),
			named: at('named-inner'),
			cta: at('cta'),
			item: at('item-inner'),
			unknown: at('unknown-inner'),
			nav: at('nav-bundles'),
			footer: at('footer-link'),
			plain: at('plain'),
		}
	}, MAP)
	assert.deepEqual(r.css, [2, 'web.offers.weekend-offer'], 'the CTA inside a card belongs to the card')
	assert.deepEqual(r.cta, [2, 'web.offers.weekend-offer'])
	assert.deepEqual(r.explicit, [1, 'web.offers.roaming-offer'])
	assert.deepEqual(r.named, [3, 'web.offers.students-offer'])
	assert.deepEqual(r.item, [5, 'web.bundles.mobile-internet.mi-25'])
	assert.deepEqual(r.unknown, [6, 'fp:'], 'unknown cards get a local fingerprint only')
	assert.equal(r.nav, null, 'navigation is never explored')
	assert.equal(r.footer, null)
	assert.equal(r.plain, null, 'no arbitrary text')
	const link = await page.evaluate((map) => {
		const a = document.createElement('a')
		a.href = '/en/help.html'
		a.id = 'loose-link'
		a.textContent = 'Help'
		document.querySelector('main')!.append(a)
		const x = new (window as any).__t.Resolver(map).resolve(a)
		return x && [x.via, x.destinationId]
	}, MAP)
	assert.deepEqual(link, [4, 'web.help'], 'a link to a known page')
})
