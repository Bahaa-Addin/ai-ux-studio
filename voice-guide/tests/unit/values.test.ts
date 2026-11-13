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
