/** Pure parts of the SDK: reading values from live text in either digit system. */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { asciiDigits, normText, parseData, parseNumber } from '../../packages/sdk/src/dom.ts'
import { maskContent } from '../../packages/sdk/src/agent-mask.ts'

test('numbers from prices in Arabic-Indic and Latin digits', () => {
	assert.equal(parseNumber('١٥٠ جنيه / شهريًا'), 150)
	assert.equal(parseNumber('EGP 1,250.50'), 1250.5)
	assert.equal(parseNumber('٧٫٥ جيجابايت'), 7.5)
	assert.equal(parseNumber('no number'), null)
	assert.equal(asciiDigits('٠١٢٣٤٥٦٧٨٩'), '0123456789')
})

test('data amounts compare across units', () => {
	assert.equal(parseData('500 MB'), 500 / 1024)
	assert.equal(parseData('٢٥ جيجابايت'), 25)
	assert.equal(parseData('1 TB'), 1024)
	assert.ok((parseData('٥٠٠ ميجابايت') as number) < (parseData('1 GB') as number))
})

test('text matching ignores Arabic spelling variants and case', () => {
	assert.equal(normText('  الإنترنت   المنزلي '), normText('الانترنت المنزلي'))
	assert.equal(normText('Home INTERNET'), 'home internet')
})

test('the agent masks personal data in page content before it leaves the browser', () => {
	const out = maskContent('[3]<input value=01012345678 /> mail a.b@example.com card 4111 1111 1111 1111')
	assert.ok(!out.includes('01012345678') && out.includes('[phone]'))
	assert.ok(!out.includes('a.b@example.com') && out.includes('[email]'))
	assert.ok(!out.includes('4111') && out.includes('[card]'))
})
