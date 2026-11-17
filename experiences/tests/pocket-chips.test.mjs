// Where a "Pocket it" chip sits on a live card (S6; ADR-0052 §12): pure geometry, no DOM.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { clipBox, overFirstScreen, placeChip } from '../src/pocket/chips-place.js'

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

test('the first screen: a card whose top end corner the trail\'s pill covers at scroll 0 takes the next corner, the same at any scroll (F9)', () => {
  // /en/home at 1366x900: the pill where it rests at scroll 0, and the hero card across the screen below the header.
  const pill = box(1114, 104, 236, 44)
  const hero = (y) => box(0, 120 - y, 1366, 420)
  const pick = (y, rest = pill) => {
    const card = hero(y)
    const top = overFirstScreen(rest, { card, scroll: { x: 0, y }, height: 900 })
    return placeChip({ card, fixed: top ? [top] : [], clips: [], size: FULL, iconSize: ICON, dir: 'ltr' })
  }
  const chipOf = (p, y = 0) => box(p.x, p.y + y, (p.icon ? ICON : FULL).width, (p.icon ? ICON : FULL).height)
  const free = pick(0, null)
  assert.equal(free.corner, 'top-end')
  assert.ok(meets(chipOf(free), pill), 'without it, the chip is where the pill lies (the live walk: [1261,130,1356,162])')
  const p = pick(0)
  assert.equal(p.corner, 'bottom-end')
  assert.equal(p.icon, false)
  assert.ok(!meets(chipOf(p), pill))
  // Scrolled down (the pill tucked away or raised under a header that left): the pick is the same, where it is on the card.
  for (const y of [1, 120, 400, 2000]) {
    const q = pick(y)
    assert.deepEqual([q.corner, q.x, q.y + y], [p.corner, p.x, p.y], `scrolled ${y}`)
  }
  // Arabic: the pill at the top left, the top end corner there too.
  const rtlPill = box(16, 104, 154, 44)
  const card = hero(0)
  const top = overFirstScreen(rtlPill, { card, scroll: { x: 0, y: 0 }, height: 900 })
  assert.equal(placeChip({ card, avoid: [], clips: [], size: FULL, iconSize: ICON, dir: 'rtl' }).corner, 'top-end')
  assert.equal(placeChip({ card, fixed: [top], clips: [], size: FULL, iconSize: ICON, dir: 'rtl' }).corner, 'bottom-end')
})

test('the first screen only: a card that starts lower down the page never meets the pill, and no pill is no obstacle', () => {
  const pill = box(1114, 104, 236, 44)
  assert.equal(overFirstScreen(pill, { card: box(0, 950, 300, 200), scroll: { x: 0, y: 0 }, height: 900 }), null, '950 px down the page')
  assert.equal(overFirstScreen(pill, { card: box(0, 150, 300, 200), scroll: { x: 0, y: 800 }, height: 900 }), null, 'on the screen now, 950 px down the page')
  assert.deepEqual(overFirstScreen(pill, { card: box(0, -300, 300, 400), scroll: { x: 0, y: 400 }, height: 900 }), box(1114, -296, 236, 44), 'its top 100 px down the page: the pill as it lies over it')
  assert.equal(overFirstScreen(null, { card: box(0, 0, 300, 200), scroll: { x: 0, y: 0 }, height: 900 }), null)
})

test('a card with no free corner: its icon-only chip leaves the top end corner when the pill lies over it, for the next one in order (F9)', () => {
  // /en/home at 375x812, offline: the hero card's (blank) picture strip across its top, its button across its foot.
  const card = box(0, 71, 375, 559)
  const avoid = [box(0, 71, 375, 42), box(14, 572, 347, 37), box(111, 327, 153, 25)]
  const pill = box(125, 58, 234, 44)
  const without = placeChip({ card, avoid, clips: [], size: FULL, iconSize: ICON, dir: 'ltr', small: true })
  assert.deepEqual(without, { x: 375 - 8 - 32, y: 79, corner: 'top-end', icon: true, unplaced: true }, 'as before: the top end corner, under the pill ([335,79,367,111])')
  const p = placeChip({ card, avoid, fixed: [pill], clips: [], size: FULL, iconSize: ICON, dir: 'ltr', small: true })
  assert.deepEqual(p, { x: 375 - 8 - 32, y: 630 - 8 - 32, corner: 'bottom-end', icon: true, unplaced: true })
  assert.ok(!meets(box(p.x, p.y, 32, 32), pill))
  // A fixed control over every corner: the top end one, as before.
  assert.equal(placeChip({ card, avoid, fixed: [card], clips: [], size: FULL, iconSize: ICON, dir: 'ltr', small: true }).corner, 'top-end')
  // A free corner is still taken whole, the pill only one more box it keeps clear of.
  const open = placeChip({ card, avoid: [], fixed: [pill], clips: [], size: FULL, iconSize: ICON, dir: 'ltr', small: true })
  assert.deepEqual([open.corner, open.icon, open.unplaced], ['bottom-end', false, false])
})

test('the first screen on a phone: a chip keeps clear of the guide\'s mic as of the pill, both at once, the same at any scroll (F8b)', () => {
  // 375x812: the mic where it rests above the accessibility button, the trail's pill below the header.
  const mic = box(296, 657, 64, 64)
  const pill = box(125, 58, 234, 44)
  // A card whose top starts just above the mic, running on below the first screen.
  const card = (y) => box(0, 640 - y, 375, 300)
  const pick = (y, rests) => {
    const c = card(y)
    const fixed = rests.map((rest) => overFirstScreen(rest, { card: c, scroll: { x: 0, y }, height: 812 })).filter(Boolean)
    return placeChip({ card: c, fixed, clips: [], size: FULL, iconSize: ICON, dir: 'ltr', small: true })
  }
  const free = pick(0, [pill])
  assert.equal(free.corner, 'top-end')
  assert.ok(meets(box(free.x, free.y, FULL.width, FULL.height), mic), 'without the mic, the chip is where the mic lies')
  const p = pick(0, [pill, mic])
  assert.deepEqual([p.corner, p.icon, p.unplaced], ['bottom-end', false, false])
  assert.ok(!meets(box(p.x, p.y, FULL.width, FULL.height), mic))
  for (const y of [1, 300, 2000]) {
    const q = pick(y, [pill, mic])
    assert.deepEqual([q.corner, q.x, q.y + y], [p.corner, p.x, p.y], `scrolled ${y}`)
  }
  // Its transcript bar while it shows (where it rests at 375x812) is one more: a card just above it takes the next corner.
  const bar = box(139, 621, 220, 29)
  const above = box(0, 600, 375, 300)
  assert.equal(placeChip({ card: above, fixed: [mic], clips: [], size: FULL, iconSize: ICON, dir: 'ltr', small: true }).corner, 'top-end', 'clear of the mic there')
  assert.equal(placeChip({ card: above, fixed: [mic, bar], clips: [], size: FULL, iconSize: ICON, dir: 'ltr', small: true }).corner, 'bottom-end', 'not under the bar')
  // A card further down the page never meets them: the first free corner, as before.
  assert.equal(placeChip({ card: box(0, 900, 375, 300), fixed: [], clips: [], size: FULL, iconSize: ICON, dir: 'ltr', small: true }).corner, 'top-end')
  assert.equal(overFirstScreen(mic, { card: box(0, 900, 375, 300), scroll: { x: 0, y: 0 }, height: 812 }), null)
})
