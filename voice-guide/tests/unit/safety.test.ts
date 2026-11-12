/**
 * Live-site safety rules (T-308, AGENTS.md §4.2–4.4, ADR-0018): what the fallback agent may type,
 * and what is masked before page content leaves the browser or reaches a model.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { inputRefusal, maskContent, secretField, secretValue } from '../../packages/sdk/src/agent-mask.ts'
import { maskPageContent } from '#services/agent/handlers.ts'

test('masking: Egyptian mobiles, national IDs, cards, emails, long numbers, in both digit systems', () => {
	const page = 'خط ٠١٠١٢٣٤٥٦٧٨ and 01112345678, ID 29001011234567, card 4111 1111 1111 1111, a.b@example.com, account 123456789012, price 37.5 EGP, 1400 MB'
	const out = maskContent(page)
	for (const raw of ['01012345678', '01112345678', '29001011234567', '4111', 'a.b@example.com', '123456789012']) assert.ok(!out.includes(raw), `${raw} is masked: ${out}`)
	assert.match(out, /\[phone\].*\[phone\].*\[national-id\].*\[card\].*\[email\].*\[number\]/)
	assert.match(out, /37\.5 EGP, 1400 MB/, 'prices and amounts stay')
})

test('masking: a mobile number written in groups, with spaces, dashes, dots or a country code, in both digit systems (AIXC-31)', () => {
	const grouped = ['010 1234 5678', '٠١٠ ١٢٣٤ ٥٦٧٨', '0101-234-5678', '+20 10 1234 5678', '+20-100-123-4567', '0020 100 123 4567', '010.1234.5678', '010\u00a01234\u00a05678', '011 – 1234 – 5678', '+20 (10) 1234 5678', '(010) 1234 5678']
	for (const n of grouped) {
		const hits: string[] = []
		const out = maskContent(`Your number is ${n}.`, (k) => hits.push(k))
		assert.deepEqual(hits, ['[phone]'], `${n} is masked as a phone: ${out}`)
		assert.equal(out, 'Your number is [phone].')
	}
	// Not phone numbers: years, prices, sizes, short codes, a number that only starts like one.
	for (const text of ['Offers in 2011 2012 2013 and 2014', 'Bundles at 100 200 300 EGP', '1400 MB for 25 EGP, 3000 MB for 50 EGP', 'Dial 868 or *880#', 'Call 16888', '20 10 5 GB', '010 1234 567 is too short']) {
		const hits: string[] = []
		maskContent(text, (k) => hits.push(k))
		assert.deepEqual(hits, [], `nothing masked in "${text}"`)
	}
})

test('the proxy masks page content with the same rules and leaves the request itself alone', () => {
	const body = '<user_request>type my number 01012345678</user_request><browser_state>[3]<input value=29001011234567 /> ٠١٢٢٣٤٥٦٧٨٩</browser_state>'
	const r = maskPageContent(body)
	assert.match(r.text, /type my number 01012345678/)
	assert.match(r.text, /\[national-id\]/)
	assert.match(r.text, /\[phone\]/)
	assert.equal(r.masked, 2)
})

test('secret fields: passwords, one-time codes, card fields, national ID, in English and Arabic', () => {
	assert.ok(secretField({ type: 'password' }))
	assert.ok(secretField({ autocomplete: 'one-time-code' }))
	assert.ok(secretField({ autocomplete: 'cc-number' }))
	assert.ok(secretField({ label: 'Enter the verification code' }))
	assert.ok(secretField({ placeholder: 'الرقم القومي' }))
	assert.ok(secretField({ label: 'كلمة السر' }))
	assert.ok(secretField({ name: 'otp' }))
	assert.equal(secretField({ type: 'text', label: 'Mobile number', name: 'msisdn' }), null)
	assert.equal(secretField({ type: 'search', placeholder: 'Find a store' }), null)
})

test('secret values: card numbers and national IDs are never typed, in either digit system', () => {
	assert.ok(secretValue('4111 1111 1111 1111'))
	assert.ok(secretValue('29001011234567'))
	assert.ok(secretValue('٢٩٠٠١٠١١٢٣٤٥٦٧'))
	assert.equal(secretValue('01012345678'), null)
	assert.equal(secretValue('Maadi'), null)
})

test('input_text: refused for secrets even when the person said them; allowed for what they said', () => {
	assert.match(inputRefusal('type my password hunter2', 'hunter2', { type: 'password' })!, /password/)
	assert.match(inputRefusal('my card is 4111111111111111', '4111111111111111', { type: 'text' })!, /card/)
	assert.match(inputRefusal('the code is 123456', '123456', { autocomplete: 'one-time-code' })!, /one-time-code/)
	assert.match(inputRefusal('search for Maadi', 'Zamalek', { type: 'search' })!, /not said/)
	assert.equal(inputRefusal('search for Maadi', 'Maadi', { type: 'search' }), null)
	assert.equal(inputRefusal('my number is ٠١٠١٢٣٤٥٦٧٨', '01012345678', { type: 'tel', label: 'Mobile' }), null)
})
