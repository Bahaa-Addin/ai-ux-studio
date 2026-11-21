/**
 * The experience layer's delivery (ADR-0048): the site config keeps its `experiences` block, and the
 * demo browser's loader adds aixc.js only where it should (web origin, matching path, #main-content,
 * not a clone page, not ?aixc=off), always after guide.js. The loader runs here in a minimal fake
 * window, so every rule is checked without a browser.
 */
import assert from 'node:assert/strict'
import path from 'node:path'
import { test } from 'node:test'
import vm from 'node:vm'

import { loadSiteConfig, ROOT } from '#shared/config.ts'

import { type LoaderExperiences, loaderExperiences, loaderScript } from '../../tools/demo-browser.ts'

const WEB = 'https://web.vodafone.com.eg'
const SHOP = 'https://eshop.vodafone.com.eg'
const X: LoaderExperiences = { origin: WEB, paths: ['^/(en|ar)/'], exclude: ['/en/services'], demos: ['pocket', 'tips'] }

interface Added {
	src: string
	type?: string
	dataset: Record<string, string>
}

/** Runs the loader on a fake page and returns the scripts it added, in order. */
function load(url: string, o: { mainContent?: boolean; experiences?: LoaderExperiences | null } = {}): Added[] {
	const u = new URL(url)
	const added: Added[] = []
	const element = () => ({ dataset: {} as Record<string, string>, src: '', type: '' })
	const document = {
		readyState: 'complete',
		getElementById: (id: string) => (id === 'main-content' && o.mainContent !== false ? {} : null),
		querySelector: (selector: string) => {
			if (selector === 'script[data-vg-loader]') return added.find((s) => s.dataset.vgLoader) ?? null
			if (selector === 'script[data-aixc-demo]') return added.find((s) => s.dataset.aixcDemo) ?? null
			return null
		},
		createElement: element,
		head: { appendChild: (n: Added) => added.push(n) },
		addEventListener: () => {},
	}
	const window: Record<string, unknown> = { location: { origin: u.origin, pathname: u.pathname, search: u.search }, document }
	window.top = window
	vm.runInNewContext(loaderScript({ siteKey: 'k', origins: [WEB, SHOP], experiences: o.experiences === undefined ? X : o.experiences }), { window, document, location: window.location, RegExp })
	return added
}

const layer = (added: Added[]) => added.find((s) => s.src.endsWith('/__vg/sdk/aixc/aixc.js'))

test('the site config keeps the experiences block (zod would drop an unknown key without a word)', () => {
	const s = loadSiteConfig(path.join(ROOT, 'config/sites/vodafone-eg.yaml'))
	assert.equal(s.experiences.enabled, true)
	assert.deepEqual(s.experiences.paths, ['^/(en|ar)/'])
	assert.equal(s.experiences.demos.watch, true, 'page watch is on: D1 confirmed 2026-11-18 (ADR-0078)')
	assert.equal(s.experiences.demos.pocket, true)
	// A site that does not mention it (the fixture telco) has it off.
	assert.equal(loadSiteConfig(path.join(ROOT, 'config/sites/demo-telco.yaml')).experiences.enabled, false, 'off unless a site turns it on')
})

test('the loader adds aixc.js after guide.js on a matching web page with #main-content', () => {
	const added = load(`${WEB}/en/home`)
	assert.equal(added.length, 2)
	assert.ok(added[0].src.endsWith('/__vg/sdk/guide.js'), 'guide.js first')
	const m = layer(added)!
	assert.equal(m.src, `${WEB}/__vg/sdk/aixc/aixc.js`)
	assert.equal(m.type, 'module')
	assert.equal(m.dataset.aixcDemo, '1')
	assert.equal(m.dataset.aixcDemos, 'pocket tips')
	assert.equal(m.dataset.aixcSiteKey, 'k', 'the public site key, for the layer\'s own requests (GET /v1/page-map)')
	assert.ok(layer(load(`${WEB}/ar/vodafone-red1?x=1`)), 'Arabic pages too')
})

test('the loader leaves the layer out where it does not belong; the guide still loads', () => {
	const cases: [string, string, Parameters<typeof load>[1]][] = [
		['the shop', `${SHOP}/en/lines`, {}],
		['the /spa/ app', `${WEB}/spa/storeLocator`, {}],
		['a page without #main-content', `${WEB}/en/home`, { mainContent: false }],
		['a page the clone is mounted on', `${WEB}/en/services/`, {}],
		['?aixc=off', `${WEB}/en/home?aixc=off`, {}],
		['?x=1&aixc=off', `${WEB}/en/home?x=1&aixc=off`, {}],
		['experiences off in the site config', `${WEB}/en/home`, { experiences: null }],
	]
	for (const [name, url, o] of cases) {
		const added = load(url, o)
		assert.equal(layer(added), undefined, `no layer on ${name}`)
		assert.ok(added.some((s) => s.src.endsWith('/__vg/sdk/guide.js')), `the guide still loads on ${name}`)
	}
	assert.ok(layer(load(`${WEB}/en/home?aixc=offline`)), 'only aixc=off exactly turns it off')
})

test('the demo browser builds the loader settings from the site config: web origin, enabled demos, clone pages left out in replay only', () => {
	const site = loadSiteConfig(path.join(ROOT, 'config/sites/vodafone-eg.yaml'))
	const clone = { path: '/en/services/', dir: '/x', pages: { '/ar/services': 'ar/index.html' } }
	const replay = loaderExperiences({ site, replayDir: '/replay', clone })!
	assert.equal(replay.origin, WEB, 'the web origin, never the shop')
	assert.deepEqual(replay.exclude, ['/en/services', '/ar/services'], 'both clone pages, trailing slash dropped')
	assert.ok(replay.demos.includes('watch'), 'page watch is on in the site config (ADR-0078)')
	assert.ok(replay.demos.includes('pocket') && replay.demos.includes('tips'))
	assert.deepEqual(loaderExperiences({ site, clone })!.exclude, [], 'live pages: nothing is mounted, nothing left out')
	assert.equal(loaderExperiences({ site, replayDir: '/replay', clone, experiences: false }), null, 'experiences: false keeps it off')
	assert.equal(loaderExperiences({ site: { ...site, experiences: { ...site.experiences, enabled: false } } }), null, 'off in the site config')
})

test('Reimagine\'s kill switch: demos.reimagine false in the site config leaves it out of the tag, so the core never loads its launcher (phase 4a)', () => {
	const site = loadSiteConfig(path.join(ROOT, 'config/sites/vodafone-eg.yaml'))
	assert.equal(site.experiences.demos.reimagine, true, 'on in the site config')
	const on = loaderExperiences({ site })!
	assert.ok(on.demos.includes('reimagine'), 'the loader names it while it is on')
	assert.ok(layer(load(`${WEB}/en/services`, { experiences: on }))!.dataset.aixcDemos.split(' ').includes('reimagine'), 'and the tag carries it')
	const off = loaderExperiences({ site: { ...site, experiences: { ...site.experiences, demos: { ...site.experiences.demos, reimagine: false } } } })!
	assert.ok(!off.demos.includes('reimagine'), 'demos.reimagine false: the loader leaves it out')
	assert.ok(off.demos.includes('pocket'), 'the other demos stay')
	const tag = layer(load(`${WEB}/en/services`, { experiences: off }))!
	assert.ok(!tag.dataset.aixcDemos.split(' ').includes('reimagine'), 'the tag does not carry it, so the core has no reimagine to load')
})
