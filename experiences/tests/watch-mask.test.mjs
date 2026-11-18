// The page watch's mask (src/watch/mask.js; voice-guide ADR-0078 point 4, ADR-0018): a port of
// maskContent (voice-guide/packages/sdk/src/agent-mask.ts), which the layer cannot import (TypeScript,
// another package, served as sources by the clone). The parity test runs both over the same text.
import test from 'node:test'
import assert from 'node:assert/strict'

import { asciiDigitsOf, maskContent } from '../src/watch/mask.js'

const sdk = () => import('../../voice-guide/packages/sdk/src/agent-mask.ts')

const CASES = [
  '',
  'No personal data here: 25 EGP for 1400 Mega, 2011 2012 2013.',
  'write to someone.name+tag@example.co.uk now',
  'national ID 29001011234567 and 39912312345678',
  'card 4111 1111 1111 1111, 4111-1111-1111-1111, 4111.1111.1111.1111, 4111 - 1111 - 1111 - 1111',
  'call 01012345678, 010 1234 5678, +20 10 1234 5678, +20 (0)10 1234 5678, 0101-234-5678, 00201012345678',
  '0 10 1234 5678 or 01 0123 45678 or 20 10 1234 5678',
  'landline 02 2345 6789, (02) 23456789, +20 2 2345 6789, 03 555 1234',
  'account 123456789012345 and price 1,234.50 and 1234567890',
  'Arabic digits ٠١٠١٢٣٤٥٦٧٨ and ۰۱۰۱۲۳۴۵۶۷۸ and full-width ０１０１２３４５６７８',
  'zero​width 010‎1234‏5678 marks',
  'باقات الانترنت ٢٥ جنيه · اتصل على ٠١٠١٢٣٤٥٦٧٨ أو اكتب a@b.eg',
  'Vodafone Cash: send up to 60,000 EGP a day',
  'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
]

test('maskContent masks emails, national IDs, cards, phones and long numbers; prices stay', () => {
  const out = maskContent('mail a@b.co, id 29001011234567, card 4111 1111 1111 1111, phone 01012345678, 25 EGP')
  assert.doesNotMatch(out, /a@b\.co|29001011234567|4111|01012345678/)
  assert.match(out, /\[email\].*\[national-id\].*\[card\].*\[phone\].*25 EGP/)
  assert.equal(asciiDigitsOf('٢٥'), '25')
})

test('parity: the port masks exactly as the SDK\'s maskContent does', async () => {
  const ts = await sdk()
  for (const text of CASES) {
    const mine = []
    const theirs = []
    assert.equal(maskContent(text, (k) => mine.push(k)), ts.maskContent(text, (k) => theirs.push(k)), text)
    assert.deepEqual(mine, theirs, `${text}: same kinds reported`)
    assert.equal(asciiDigitsOf(text), ts.asciiDigitsOf(text))
  }
})

test('parity: the rules are the SDK\'s, pattern for pattern (a change there must be copied here)', async () => {
  const { readFileSync } = await import('node:fs')
  const rulesOf = (src) => [...src.matchAll(/^\s*\[(\/.+\/g), '(\[[a-z-]+\])'\],?$/gm)].map((m) => [m[1], m[2]])
  const mine = rulesOf(readFileSync(new URL('../src/watch/mask.js', import.meta.url), 'utf8'))
  const theirs = rulesOf(readFileSync(new URL('../../voice-guide/packages/sdk/src/agent-mask.ts', import.meta.url), 'utf8'))
  assert.ok(theirs.length >= 8, `${theirs.length} rules read from agent-mask.ts`)
  assert.deepEqual(mine, theirs)
})
