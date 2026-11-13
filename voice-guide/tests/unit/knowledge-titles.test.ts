/**
 * What the knowledge service hands the page to show (ADR-0059 §3; AIXC-103, AIXC-105): page-map and
 * trail titles carry no stored price, a title the gate empties takes its list's or page's name, and a
 * suggested question that names a price is left out.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createKnowledge } from '#services/knowledge/handlers.ts'
import { buildKbIndex } from '#shared/kb-index.ts'

import { fixtureManifest } from '../helpers/kb.ts'

const URL_AR = 'http://localhost:4401/ar/bundles.html'

function knowledge() {
	const m = structuredClone(fixtureManifest())
	const set = (id: string, labels: Record<string, string[]>) => {
		const d = m.destinations.find((x) => x.id === id)!
		d.labels = labels
	}
	set('web.bundles.bundle-tabs', { ar: ['5 جيجا 46 جنيه'], en: ['5 GB for 46 EGP'] })
	set('web.bundles.mobile-internet.mi-10', { ar: ['٤٦ جنيه'], en: ['46 EGP'] })
	const index = buildKbIndex(m)
	const questions = { ar: [{ id: 'q1', text: 'بكام 46 جنيه؟', intent: 'describe' }, { id: 'q2', text: 'فيها كام جيجا؟', intent: 'describe' }] }
	return createKnowledge({
		store: {} as never,
		kb: { get: async () => index } as never,
		sites: new Map(),
		experience: { get: async () => ({ profile: { id: 'p' }, byDestination: new Map(), questions: new Map(), published: () => questions }) } as never,
	})
}

test('page-map titles carry no stored price (AIXC-105)', async () => {
	const map = await knowledge().pageMap({ siteId: 'demo-telco', url: URL_AR })
	const tabs = map.sections.find((s) => s.id === 'web.bundles.bundle-tabs')!
	assert.deepEqual(tabs.title, { ar: '5 جيجا', en: '5 GB' })
})

test('trail titles: price-free, a title that was only a price takes its list\'s name, and questions naming a price are left out (AIXC-103, AIXC-105)', async () => {
	const x = await knowledge().experience({ siteId: 'demo-telco', url: URL_AR })
	const item = x.destinations.find((d) => d.id === 'web.bundles.mobile-internet.mi-10')!
	assert.equal(item.title.ar, 'باقات إنترنت الموبايل', 'the list\'s name, never "" or "٤٦ جنيه"')
	assert.equal(item.title.en, 'mobile internet bundles')
	assert.doesNotMatch(JSON.stringify(x), /٤٦ جنيه|46 EGP|46 جنيه/)
	assert.deepEqual(
		item.questions.ar?.map((q) => q.id),
		['q2'],
		'the question that names a price is left out, not cut short',
	)
})
