// Where a "Pocket it" chip sits on a live card (S6; ADR-0052 §12): pure geometry, no DOM.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { clipBox, placeChip } from '../src/pocket/chips-place.js'

const box = (left, top, width, height) => ({ left, top, right: left + width, bottom: top + height })
const meets = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
const FULL = { width: 96, height: 32 }
const ICON = { width: 32, height: 32 }

test('the chip takes the top end corner when it is free: right in English, left in Arabic', () => {
  const card = box(100, 100, 300, 200)
  const ltr = placeChip({ card, avoid: [], clips: [], size: FULL, iconSize: ICON, dir: 'ltr' })
  assert.deepEqual(ltr, { x: 400 - 10 - 96, y: 110, corner: 'top-end', icon: false, unplaced: false })
  const rtl = placeChip({ card, avoid: [], clips: [], size: FULL, iconSize: ICON, dir: 'rtl' })
  assert.deepEqual(rtl, { x: 110, y: 110, corner: 'top-end', icon: false, unplaced: false })
  assert.equal(placeChip({ card, avoid: [], clips: [], size: FULL, iconSize: ICON, dir: 'ltr', small: true }).y, 108, 'an 8 px inset on phones')
})

test('the chip never meets a heading or a smaller button: it tries each corner, then an icon-only chip', () => {
  const card = box(0, 0, 300, 200)
  // A heading across the top and a button at the bottom end.
  const title = box(10, 5, 280, 40)
  const cta = box(180, 150, 110, 40)
  const p = placeChip({ card, avoid: [title, cta], clips: [], size: FULL, iconSize: ICON, dir: 'ltr' })
  assert.equal(p.corner, 'bottom-start')
  const chip = { left: p.x, top: p.y, right: p.x + FULL.width, bottom: p.y + FULL.height }
  assert.ok(![title, cta].some((b) => meets(chip, b)))
  // A narrow card where only an icon fits beside the heading.
  const narrow = box(0, 0, 150, 80)
  const q = placeChip({ card: narrow, avoid: [box(10, 5, 90, 30), box(10, 45, 130, 30)], clips: [], size: FULL, iconSize: ICON, dir: 'ltr' })
  assert.equal(q.icon, true)
  assert.equal(q.unplaced, false)
})

test('when nothing fits, an icon-only chip at the top end, counted as unplaced', () => {
  const card = box(0, 0, 120, 60)
  const p = placeChip({ card, avoid: [box(0, 0, 120, 60)], clips: [], size: FULL, iconSize: ICON, dir: 'ltr' })
  assert.deepEqual(p, { x: 120 - 10 - 32, y: 10, corner: 'top-end', icon: true, unplaced: true })
})

test('a card clipped by a carousel stage: the chip stays inside the visible part; a card fully outside gets none', () => {
  const stage = box(0, 0, 500, 300)
  const half = box(350, 50, 300, 200) // half outside the stage's right edge
  assert.deepEqual(clipBox(half, [stage]), { left: 350, top: 50, right: 500, bottom: 250 })
  const p = placeChip({ card: half, avoid: [], clips: [stage], size: FULL, iconSize: ICON, dir: 'ltr' })
  assert.ok(p.x + FULL.width <= 500 - 10, 'inside the stage')
  assert.equal(placeChip({ card: box(600, 0, 200, 200), avoid: [], clips: [stage], size: FULL, iconSize: ICON, dir: 'ltr' }), null)
  assert.equal(placeChip({ card: box(0, 0, 0, 0), avoid: [], clips: [], size: FULL, iconSize: ICON, dir: 'ltr' }), null, 'a card with no size')
  assert.equal(clipBox(box(600, 0, 10, 10), [stage]), null)
})
