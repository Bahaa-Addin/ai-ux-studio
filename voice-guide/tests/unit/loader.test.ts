/**
 * The shared loader (ADR-0053): the public demo extension points it at a public gateway with
 * server-sent events, the demo browser at its routed /__vg with long polling, and both get the
 * storage keeper that survives Vodafone's localStorage.clear() (T-806).
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import vm from 'node:vm'

import { KEEP_GUIDE_STORAGE, loaderScript } from '../../packages/loader/src/loader.ts'

const WEB = 'https://web.vodafone.com.eg'

interface Added {
	src: string
	dataset: Record<string, string>
}

/** A minimal Storage with the real prototype shape the keeper patches. */
function fakeStorageClass() {
	class Storage {
		m = new Map<string, string>()
		get length() {
			return this.m.size
		}
		key(i: number) {
			return [...this.m.keys()][i] ?? null
		}
		getItem(k: string) {
			return this.m.get(k) ?? null
		}
		setItem(k: string, v: string) {
			this.m.set(k, String(v))
		}
		removeItem(k: string) {
			this.m.delete(k)
		}
		clear() {
			this.m.clear()
		}
	}
	return Storage
}

function page(url: string, script: string) {
	const u = new URL(url)
	const added: Added[] = []
	const Storage = fakeStorageClass()
	const localStorage = new Storage()
	const sessionStorage = new Storage()
	const document = {
		readyState: 'complete',
		getElementById: () => null,
		querySelector: (sel: string) => (sel === 'script[data-vg-loader]' ? (added.find((s) => s.dataset.vgLoader) ?? null) : null),
		createElement: () => ({ dataset: {} as Record<string, string>, src: '' }),
		head: { appendChild: (n: Added) => added.push(n) },
		addEventListener: () => {},
	}
	const window: Record<string, unknown> = { location: { origin: u.origin, pathname: u.pathname, search: u.search }, document, localStorage, sessionStorage }
	window.top = window
	const ctx = { window, document, location: window.location, RegExp, Storage, localStorage, sessionStorage }
	vm.runInNewContext(script, ctx)
	return { added, localStorage, sessionStorage, run: (s: string) => vm.runInNewContext(s, ctx) }
}

test('with a public gateway the tag points there and uses server-sent events', () => {
	const { added } = page(`${WEB}/en/home`, loaderScript({ siteKey: 'pk', origins: [WEB], gateway: 'https://guide.example.com/' }))
	assert.equal(added.length, 1)
	assert.equal(added[0].src, 'https://guide.example.com/sdk/guide.js')
	assert.equal(added[0].dataset.siteKey, 'pk')
	assert.equal(added[0].dataset.events, undefined, 'no long polling outside the demo browser')
})

test('without a gateway the tag points at the routed /__vg; the demo browser asks for polling', () => {
	const { added } = page(`${WEB}/en/home`, loaderScript({ siteKey: 'pk', origins: [WEB], events: 'poll' }))
	assert.equal(added[0].src, `${WEB}/__vg/sdk/guide.js`)
	assert.equal(added[0].dataset.events, 'poll')
})

test('a gateway that is not an absolute URL is refused when the loader is built', () => {
	assert.throws(() => loaderScript({ siteKey: 'pk', origins: [WEB], gateway: 'guide.example.com' }), /absolute URL/)
})

test("the page's localStorage.clear() keeps the guide's and the layer's keys, and only those", () => {
	const p = page(`${WEB}/en/home`, loaderScript({ siteKey: 'pk', origins: [WEB], gateway: 'https://g.example' }))
	for (const k of ['vg-trail-consent:pk', 'vg:open', 'aixc.tips.v1', 'vfPortal', 'other']) p.localStorage.setItem(k, k)
	p.run('localStorage.clear()')
	assert.deepEqual([...p.localStorage.m.keys()].sort(), ['aixc.tips.v1', 'vg-trail-consent:pk', 'vg:open'])
	p.sessionStorage.setItem('vg-x', '1')
	p.run('sessionStorage.clear()')
	assert.equal(p.sessionStorage.length, 0, 'sessionStorage is cleared as the page asks')
})

test('the keeper patches once, however many times it runs', () => {
	const p = page(`${WEB}/en/home`, KEEP_GUIDE_STORAGE)
	const first = p.run('Storage.prototype.clear')
	p.run(KEEP_GUIDE_STORAGE)
	assert.equal(p.run('Storage.prototype.clear'), first)
})

test('keepStorage: false leaves clear() alone', () => {
	const p = page(`${WEB}/en/home`, loaderScript({ siteKey: 'pk', origins: [WEB], keepStorage: false }))
	p.localStorage.setItem('vg-a', '1')
	p.run('localStorage.clear()')
	assert.equal(p.localStorage.length, 0)
})

test('another origin gets nothing', () => {
	const p = page('https://example.com/', loaderScript({ siteKey: 'pk', origins: [WEB], gateway: 'https://g.example' }))
	assert.equal(p.added.length, 0)
	p.localStorage.setItem('vg-a', '1')
	p.run('localStorage.clear()')
	assert.equal(p.localStorage.length, 0, 'no keeper either')
})
