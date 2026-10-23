import assert from 'node:assert/strict'
import { test } from 'node:test'

import { manifestHash, Plan, pick, validateManifest } from '#kb'

const base = () => ({
	standard: 'site-knowledge/0.1',
	site: { id: 's', name: { en: 'S', ar: 'س' }, origins: ['http://localhost:4401'], languages: ['ar', 'en'], defaultLanguage: 'ar' },
	version: { id: 'v1', createdAt: '2026-10-22T10:00:00.000Z', hash: 'x' },
	pages: [
		{ id: 'web.bundles', variants: { en: { url: 'http://localhost:4401/en/bundles.html', title: 'Bundles' }, ar: { url: 'http://localhost:4401/ar/bundles.html', title: 'الباقات' } }, provenance: 'auto' },
		{ id: 'web.checkout', kind: 'checkout', variants: { en: { url: 'http://localhost:4401/en/subscribe.html', title: 'Checkout' } }, provenance: 'auto' },
	],
	collections: [
		{ id: 'web.bundles.mobile', pageId: 'web.bundles', itemCss: '.card', keyAttr: 'data-bundle', fields: { name: { css: 'h3', type: 'text' }, price: { css: '.price', type: 'money' } }, labels: { en: ['mobile bundles'] }, provenance: 'auto' },
	],
	destinations: [
		{ id: 'web.bundles', pageId: 'web.bundles', kind: 'page', labels: { en: ['bundles'], ar: ['الباقات'] }, provenance: 'auto' },
		{ id: 'web.bundles.mobile', pageId: 'web.bundles', kind: 'collection', target: { css: ['#mobile'] }, collectionId: 'web.bundles.mobile', flows: ['subscribe'], labels: { en: ['mobile bundles'], ar: ['باقات الموبايل'] }, provenance: 'merged' },
		{ id: 'web.checkout.pay', pageId: 'web.checkout', kind: 'action', commit: true, target: { css: ['#pay'] }, labels: { en: ['pay'], ar: ['ادفع'] }, provenance: 'auto' },
	],
	flows: [
		{
			id: 'subscribe',
			labels: { en: ['subscribe'], ar: ['اشترك'] },
			appliesTo: { collectionIds: ['web.bundles.mobile'] },
			steps: [
				{ op: 'click', target: { css: ['a.btn'], within: 'item' } },
				{ op: 'waitForPage', pageId: 'web.checkout' },
				{ op: 'confirm', target: { css: ['#pay'] }, message: { en: 'Press pay yourself.' } },
			],
			provenance: 'curated',
		},
	],
})

test('a well-formed manifest validates with no errors', () => {
	const r = validateManifest(base())
	assert.equal(r.ok, true, JSON.stringify(r.issues))
	assert.equal(r.issues.filter((i) => i.level === 'error').length, 0)
	assert.equal(r.manifest!.pages[0].kind, 'content', 'kind defaults to content')
})

test('broken references are errors', () => {
	const m = base()
	m.destinations[1].collectionId = 'web.missing'
	m.flows[0].steps[1] = { op: 'waitForPage', pageId: 'web.nowhere' } as never
	const r = validateManifest(m)
	assert.equal(r.ok, false)
	const msgs = r.issues.map((i) => i.message).join('\n')
	assert.match(msgs, /unknown collection web\.missing/)
	assert.match(msgs, /unknown page web\.nowhere/)
})

test('urls outside the site origins are rejected', () => {
	const m = base()
	m.pages[0].variants.en.url = 'https://evil.example/en/bundles.html'
	const r = validateManifest(m)
	assert.equal(r.ok, false)
	assert.match(r.issues[0].message, /outside the site's origins/)
})

test('a flow that ends in a click is flagged', () => {
	const m = base()
	m.flows[0].steps = [{ op: 'click', target: { css: ['a.btn'], within: 'item' } }] as never
	const r = validateManifest(m)
	assert.ok(r.issues.some((i) => i.level === 'warning' && /should end with a confirm/.test(i.message)))
})

test('schema errors carry a path', () => {
	const m = base() as any
	m.destinations[0].kind = 'banana'
	const r = validateManifest(m)
	assert.equal(r.ok, false)
	assert.match(r.issues[0].path, /destinations\.0\.kind/)
})

test('the content hash ignores the version block and key order', () => {
	const a = validateManifest(base()).manifest!
	const b = validateManifest({ ...base(), version: { id: 'v2', createdAt: '2026-10-23T00:00:00.000Z', hash: 'y' } }).manifest!
	assert.equal(manifestHash(a), manifestHash(b))
	const c = structuredClone(a)
	c.destinations[0].labels.en.push('all bundles')
	assert.notEqual(manifestHash(a), manifestHash(c))
})

test('pick falls back from the requested language to the default, then any', () => {
	assert.equal(pick({ ar: 'س', en: 'S' }, 'en'), 'S')
	assert.equal(pick({ ar: 'س' }, 'en', 'ar'), 'س')
	assert.equal(pick({ fr: 'F' }, 'en', 'ar'), 'F')
	assert.equal(pick(undefined, 'en'), undefined)
})

test('plans are validated against the contract', () => {
	const ok = Plan.safeParse({ v: 1, turnId: 't', lang: 'en', steps: [{ op: 'confirm', target: { css: ['#pay'] }, message: 'Press pay yourself.' }], meta: { intent: 'subscribe', route: 'replay' } })
	assert.ok(ok.success)
	const bad = Plan.safeParse({ v: 1, turnId: 't', lang: 'en', steps: [{ op: 'teleport' }], meta: { intent: 'x', route: 'replay' } })
	assert.equal(bad.success, false)
})
