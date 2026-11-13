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
	// Found by the review of the first fix: other digit systems, invisible marks, a slash, tabs and line breaks, "(0)".
	const more = ['+20 (0)10 1234 5678', '۰۱۰ ۱۲۳۴ ۵۶۷۸', '０１０ １２３４ ５６７８', '010\u200e 1234 5678', '010\u200b1234\u200b5678', '010 / 1234 / 5678', '010\t1234\t5678', '010\n1234\n5678', '+201012345678']
	for (const n of [...grouped, ...more]) {
		const hits: string[] = []
		const out = maskContent(`Your number is ${n}.`, (k) => hits.push(k))
		assert.equal(hits.length, 1, `${JSON.stringify(n)} is masked once: ${out}`)
		assert.match(hits[0], /^\[(phone|card)\]$/)
		assert.match(out, /^Your number is \+?\[(phone|card)\]\.$/, `nothing of ${JSON.stringify(n)} is left`)
	}
	// A short number right after it does not let it through (the first rule refused a number with digits after it).
	for (const [text, left] of [['Your line 010 1234 5678 5 GB left', '5 GB left'], ['Line 010-1234-5678 - 2 lines', '2 lines'], ['010 1234 5678.5', ''], ['010 1234 5678 25 EGP', 'EGP'], ['رقمك ٠١٠ ١٢٣٤ ٥٦٧٨ ٥ جيجا', 'جيجا']] as const) {
		const hits: string[] = []
		const out = maskContent(text, (k) => hits.push(k))
		assert.ok(hits.length >= 1, `masked: ${out}`)
		assert.ok(!/\d{4}/.test(out) && !/1234/.test(out), `no four digits of the number left: ${out}`)
		assert.ok(out.includes(left), `the rest stays: ${out}`)
	}
	// Not phone numbers: years, prices, sizes, short codes, a number that only starts like one.
	for (const text of ['Offers in 2011 2012 2013 and 2014', 'Bundles at 100 200 300 EGP', '1400 MB for 25 EGP, 3000 MB for 50 EGP', 'Dial 868 or *880#', 'Call 16888', '20 10 5 GB', '010 1234 567 is too short', 'Dial *868*1# then 2', 'Order 2011/2012']) {
		const hits: string[] = []
		maskContent(text, (k) => hits.push(k))
		assert.deepEqual(hits, [], `nothing masked in "${text}"`)
	}
	// Long inputs stay fast (no runaway matching on runs of digits and separators).
	const t0 = performance.now()
	maskContent(`${'0 1-2.3 4 '.repeat(20000)}end`)
	maskContent(`${'010 '.repeat(50000)}`)
	assert.ok(performance.now() - t0 < 1500, `200 KB of digits and separators masked in ${Math.round(performance.now() - t0)} ms`)
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
	// The shop's forms name the field in code, not words (e-shop plan E3).
	assert.ok(secretField({ name: 'nationalId' }))
	assert.ok(secretField({ id: 'national_id' }))
	assert.ok(secretField({ label: 'ID number' }))
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
