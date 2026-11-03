/**
 * Geometry of the page-curl engine (pure functions only; the DOM side is covered by
 * tests/e2e/pocket_e2e.py).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cornerReach, fullTurn, ease, lerp } from '../src/pocket/curl.js'

const close = (actual, expected, epsilon = 1e-9) => assert.ok(Math.abs(actual - expected) < epsilon, `${actual} ≈ ${expected}`)

test('cornerReach is the farthest corner projected on the curl direction', () => {
  close(cornerReach(400, 200, 0), 200) // straight right: half the width
  close(cornerReach(400, 200, Math.PI / 2), 100) // straight down: half the height
  close(cornerReach(400, 200, Math.PI / 4), (200 + 100) * Math.SQRT1_2)
  // symmetric for the opposite corner (top-right vs bottom-right peel)
  close(cornerReach(400, 200, -Math.PI / 5), cornerReach(400, 200, Math.PI / 5))
})

test('fullTurn spans the whole sheet plus the roll', () => {
  const phi = (38 * Math.PI) / 180
  close(fullTurn(1366, 756, phi, 60), 2 * cornerReach(1366, 756, phi) + 60)
  assert.ok(fullTurn(1366, 756, phi, 60) > Math.hypot(1366, 756) * 0.9)
})

test('easings start at 0 and end at 1', () => {
  for (const [name, fn] of Object.entries(ease)) {
    close(fn(0), 0, 1e-9)
    close(fn(1), 1, 1e-9)
    assert.ok(Number.isFinite(fn(0.5)), name)
  }
})

test('lerp interpolates linearly', () => {
  assert.equal(lerp(10, 20, 0), 10)
  assert.equal(lerp(10, 20, 1), 20)
  assert.equal(lerp(10, 20, 0.25), 12.5)
})
