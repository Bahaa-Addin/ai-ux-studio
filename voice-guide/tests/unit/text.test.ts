import assert from 'node:assert/strict'
import { test } from 'node:test'

import { buildSynonyms, detectLanguage, normalize, numbersIn, RetrievalIndex, stem, terms, words } from '#text'

test('detects Arabic and English by script', () => {
	assert.equal(detectLanguage('إيه أرخص باقة إنترنت؟'), 'ar')
	assert.equal(detectLanguage("What's the cheapest internet bundle?"), 'en')
	assert.equal(detectLanguage('عايز باقة 10GB'), 'ar')
	assert.equal(detectLanguage('123', 'ar'), 'ar')
})

test('normalises Arabic spelling variants and digits', () => {
	assert.equal(normalize('إنترنت'), normalize('انترنت'))
	assert.equal(normalize('باقة'), 'باقه')
	assert.equal(normalize('مُسْتَوَى'), 'مستوي')
	assert.equal(normalize('١٥٠ جنيه'), '150 جنيه')
	assert.deepEqual(words(normalize('باقة 10GB')), ['باقه', '10', 'gb'])
})

test('light stemming brings related forms together', () => {
	const s = (w: string) => stem(normalize(w))
	assert.equal(s('الباقات'), s('باقة'))
	assert.equal(s('bundles'), s('bundle'))
	assert.equal(s('subscribing'), s('subscribe').replace(/e$/, ''))
})

test('stopwords and synonyms shape retrieval terms', () => {
	assert.deepEqual(terms('what is the price'), [stem('price')], 'function words are dropped')
	assert.equal(stem('prices'), stem('price'))
	const syn = buildSynonyms([['نت', 'انترنت', 'internet']])
	const t = terms('أرخص نت', syn)
	assert.ok(t.includes(terms('internet')[0]))
})

test('parses numbers in either digit system', () => {
	assert.deepEqual(numbersIn('١٥٠ ج.م / 25.5 GB'), [150, 25.5])
})

test('BM25 plus trigram retrieval ranks the right entry in both languages', () => {
	const idx = new RetrievalIndex(
		[
			{ id: 'mobile', fields: [{ text: 'Mobile internet bundles باقات انترنت الموبايل', weight: 3 }], names: ['Mobile internet bundles', 'باقات انترنت الموبايل'] },
			{ id: 'home', fields: [{ text: 'Home internet ADSL الانترنت المنزلي', weight: 3 }], names: ['Home internet', 'الانترنت المنزلي'] },
			{ id: 'coverage', fields: [{ text: 'Coverage map خريطة التغطية', weight: 3 }], names: ['Coverage map', 'خريطة التغطية'] },
		],
		{ synonyms: buildSynonyms([['نت', 'انترنت', 'internet']]) },
	)
	assert.equal(idx.search('cheapest mobile internet bundle')[0].id, 'mobile')
	assert.equal(idx.search('وريني خريطة التغطيه')[0].id, 'coverage')
	assert.equal(idx.search('النت المنزلي')[0].id, 'home')
	const none = idx.search('zzzz qqqq')[0]
	assert.ok(none.score < 0.2, `nonsense query should score low, got ${none.score}`)
})
