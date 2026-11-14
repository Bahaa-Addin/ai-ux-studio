/**
 * The trail hosts the journey can draw (src/pocket/journey.js, voice-guide ADR-0050 §1): version 1
 * (the clone's meta) or later, by number; a missing host, a fake one (tips_e2e.py dispatches
 * vg:trail-ready with detail {}) or a version that is not a number is ignored.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { usableHost } from '../src/pocket/journey.js'

test('a trail host of version 1 or later can be drawn', () => {
  assert.equal(usableHost({ version: 1 }), true)
  assert.equal(usableHost({ version: 2, claim: () => () => {} }), true)
})

test('a missing, fake or unnumbered host is ignored', () => {
  for (const host of [null, undefined, {}, { version: 0 }, { version: '2' }, { version: null }, { version: Number.NaN }]) assert.equal(usableHost(host), false, JSON.stringify(host))
})
