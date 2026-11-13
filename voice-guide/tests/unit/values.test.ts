/**
 * Page values out of text (packages/text/src/values.ts; AGENTS.md 4.3; ADR-0059): prices with their
 * currency, percentages and stock phrases go, in both languages and both digit systems; numbers that
 * are part of a name stay.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { hasValue, valueFree } from '#text'

test('prices, percentages and stock phrases are removed, in English and Arabic, Western and Arabic-Indic digits', () => {
	const cases: [string, string][] = [
		['Mega 25 · 46 EGP/month', 'Mega 25'],
		['EGP 1,400 now', 'now'],
		['5 جيجا 46 جنيه', '5 جيجا'],
		['باقة ٤٦ ج.م', 'باقة'],
		['Save 20% today', 'Save today'],
		['خصم ٢٠٪', 'خصم'],
		['Only 3 left in stock', ''],
		['نفذت الكمية', ''],
		['Galaxy A55, 1,999 LE, sold out', 'Galaxy A55'],
	]
	for (const [text, want] of cases) {
		assert.equal(valueFree(text), want, text)
		assert.equal(hasValue(text), true, text)
	}
})

test('numbers that are part of a name stay: sizes, bundle names, ranges, phone-like digits (masked elsewhere)', () => {
	for (const text of ['Galaxy A55 5G, 128 GB', 'vf plus youtube 25-55', 'Flex 1400', 'Super 10', 'Google 5', 'Mobile 5G', '01012345678']) {
		assert.equal(valueFree(text), text, text)
		assert.equal(hasValue(text), false, text)
	}
})

test('guide points: amounts written with a currency, in either digit system, and in or out of stock; nothing from a name (ADR-0059 §2)', async () => {
	const { guidePointsIn } = await import('#text')
	assert.deepEqual(guidePointsIn('Mega 25 · 46 EGP/month'), { prices: [46], stock: undefined })
	assert.deepEqual(guidePointsIn('5 جيجا ٤٦ جنيه'), { prices: [46], stock: undefined })
	assert.deepEqual(guidePointsIn('EGP 1,400 now'), { prices: [1400], stock: undefined })
	assert.deepEqual(guidePointsIn('Galaxy A55 18,999 EGP Out of stock'), { prices: [18999], stock: 'out' })
	assert.deepEqual(guidePointsIn('Flex 1400'), { prices: [], stock: undefined })
	const { guidePoints } = await import('#shared/kb-index.ts')
	assert.deepEqual(guidePoints({ id: 'x', kind: 'item', pageId: 'p', labels: { en: ['Flex From 25 EGP up to 55 EGP'], ar: ['فليكس من ٢٥ جنيه'] } } as never), { price: 25, stock: undefined })
})

test('a URL\'s percent encoding is not a percentage: encoded Arabic paths stay whole', async () => {
	const { hasValue, valueFree } = await import('#text')
	const url = 'https://web.vodafone.com.eg/ar/%D8%A7%D9%84%D8%A7%D9%86%D8%AA%D8%B1%D9%86%D8%AA'
	assert.equal(hasValue(url), false)
	assert.equal(valueFree(url), url)
	assert.equal(valueFree('Save 20% now'), 'Save now')
})
