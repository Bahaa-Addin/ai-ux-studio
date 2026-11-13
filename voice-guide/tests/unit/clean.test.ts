/**
 * What traces, logs and saved agent steps keep of a string (services/shared/clean.ts; AGENTS.md
 * 4.3, 4.4; e-shop plan E3): personal data masked, page values removed, URLs cut to the path and
 * harmless query values.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { cleanAttrs, cleanText, cleanUrl } from '#shared/clean.ts'

test('a URL keeps its origin, path and the query values that cannot name a person; never the hash', () => {
	assert.equal(cleanUrl('https://eshop.vodafone.com.eg/en/list?categoryUrls=*smart-phones&msisdn=01012345678&utm_source=x#top'), 'https://eshop.vodafone.com.eg/en/list?categoryUrls=*smart-phones')
	assert.equal(cleanUrl('https://web.vodafone.com.eg/en/x?token=abc&email=a@b.eg&q=01012345678&tab=2'), 'https://web.vodafone.com.eg/en/x?tab=2')
	assert.equal(cleanUrl('not a url'), '')
})

test('text: personal data masked, prices and stock removed, URLs inside it cut, long text capped', () => {
	assert.equal(cleanText('call me on 01012345678'), 'call me on [phone]')
	assert.equal(cleanText('my id 29001011234567'), 'my id [national-id]')
	assert.doesNotMatch(cleanText('Super 10 · 46 EGP/month, only 3 left'), /46|left/)
	assert.equal(cleanText('opened https://x.eg/a?session=1&tab=2 then'), 'opened https://x.eg/a?tab=2 then')
	assert.equal(cleanText('x'.repeat(400)).length, 300)
})

test('attributes: every string at any depth cleaned; numbers, booleans and the shape stay', () => {
	assert.deepEqual(cleanAttrs({ n: 3, ok: true, none: null, list: ['46 EGP', 'Mega 25'], deep: { goal: 'call 01012345678' } }), { n: 3, ok: true, none: null, list: ['', 'Mega 25'], deep: { goal: 'call [phone]' } })
})

test('a long string costs no more than a short one: it is cut before any pattern runs, and a number cut at the edge is dropped (AIXC-81)', () => {
	const t0 = performance.now()
	cleanText('a'.repeat(250_000))
	cleanText('1'.repeat(40_000))
	cleanAttrs({ detail: 'x@'.repeat(100_000) })
	assert.ok(performance.now() - t0 < 500, `${Math.round(performance.now() - t0)} ms`)
	assert.doesNotMatch(cleanText(`${'a '.repeat(170)}call 01012345678`), /\d{3}/, 'no piece of the number is left')
})

test('identifiers pass as they are; the person\'s own words keep their prices; the query keeps only keys that name a page (AIXC-85, 87, 89)', () => {
	assert.deepEqual(cleanAttrs({ kbVersion: '20261023-122606-5b2080', destinationId: 'web.mobile-internet-bundles.plus--37---600egp.3', candidates: [{ id: 'web.x.600egp' }] }), { kbVersion: '20261023-122606-5b2080', destinationId: 'web.mobile-internet-bundles.plus--37---600egp.3', candidates: [{ id: 'web.x.600egp' }] })
	assert.deepEqual(cleanAttrs({ utterance: 'a bundle around 50 EGP, call 01012345678' }, 300, ['utterance']), { utterance: 'a bundle around 50 EGP, call [phone]' })
	assert.equal(cleanUrl('https://eshop.vodafone.com.eg/en/order?orderId=A12345&ref=xyz&q=mohamed+salah&tab=2'), 'https://eshop.vodafone.com.eg/en/order?tab=2')
})

test('log lines are cleaned like traces (AIXC-88)', async () => {
	const { log } = await import('#shared/log.ts')
	const lines: string[] = []
	const keep = { log: console.log, error: console.error }
	console.log = (l: string) => lines.push(l)
	console.error = (l: string) => lines.push(l)
	try {
		log('error', 'request failed', { path: '/v1/turn', error: 'bad input from 01012345678 about 46 EGP', url: 'https://web.vodafone.com.eg/en/x?msisdn=01012345678' })
	} finally {
		console.log = keep.log
		console.error = keep.error
	}
	assert.equal(lines.length, 1)
	assert.doesNotMatch(lines[0], /01012345678|46 EGP|msisdn/)
	assert.match(lines[0], /\[phone\]/)
})

test('a request is traced with only the site\'s own words: a name or an address the site does not use is never kept (owner, 2026-11-13; AIXC-94)', async () => {
	const { setVocabulary, siteWords } = await import('#shared/clean.ts')
	setVocabulary('t-site', ['Mobile internet bundles', 'Pay your bill', 'باقات النت', 'سجل خط جديد'])
	assert.equal(siteWords('register a line for Mohamed Ahmed, pay the bill at 12 Tahrir St, call 01012345678', 't-site'), '… pay … bill … 12 … [phone]')
	assert.equal(siteWords('سجل خط جديد باسم محمد أحمد على شارع التحرير', 't-site'), 'سجل خط جديد …')
	assert.equal(siteWords('internet bundles please', 't-site'), 'internet bundles …')
	assert.equal(siteWords('my name is Zaynab', 'no-such-site'), '…', 'no vocabulary: nothing but masks')
	assert.deepEqual(cleanAttrs({ utterance: 'Zaynab wants mobile internet', text: 'Zaynab' }, 300, ['utterance'], 't-site'), { utterance: '… mobile internet', text: 'Zaynab' })
})
