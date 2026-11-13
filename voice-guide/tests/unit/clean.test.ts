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
