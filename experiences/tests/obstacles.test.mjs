/**
 * What the Pocket's actors keep clear of on Vodafone's pages (S12): the padding maths, the drone's
 * regions stopping above an obstacle, and the page read on a small fake document. The numbers are
 * the album's as measured on the live pages with nothing lifted (1366x900, 1024x768, 375x812).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { insetForObstacles, stopAbove, fixedObstacles } from '../src/pocket/obstacles.js'

const box = (left, top, right, bottom) => ({ left, top, right, bottom })
// Vodafone's accessibility button and the Voice Guide's controls, at 1366x900.
const AW = box(1291, 825, 1346, 880)
const MIC = box(1286, 745, 1350, 809)
const KBD = box(1234, 757, 1274, 797)
const BAR = box(1130, 685, 1350, 733)

test('padding: nothing in reach, no move; a control in reach pushes it in to 16 px from it, no further', () => {
  const mascot = box(1173, 783, 1252, 900)
  assert.deepEqual(insetForObstacles(mascot, [], 16), { dx: 0, clear: true })
  assert.deepEqual(insetForObstacles(mascot, null, 16), { dx: 0, clear: true })
  // The accessibility button and the microphone are 34 px off: clear already.
  assert.deepEqual(insetForObstacles(mascot, [AW, MIC, BAR], 16), { dx: 0, clear: true })
  // The keyboard button (shown while listening) overlaps it by 17x14: it moves 34 px in, to 16 px from it.
  const { dx, clear } = insetForObstacles(mascot, [AW, MIC, KBD, BAR], 16)
  assert.equal(dx, KBD.left - 16 - mascot.right)
  assert.equal(dx, -34)
  assert.ok(clear)
  // 1024x768: the accessibility button sits on it (55x49); it moves just clear of it.
  const small = box(940, 699, 1006, 768)
  const aw = box(949, 693, 1004, 748)
  const r = insetForObstacles(small, [aw, box(945, 613, 1009, 677), box(893, 625, 933, 665)], 16)
  assert.equal(small.right + r.dx, aw.left - 16)
  assert.ok(r.clear)
})

test('padding: it moves on past whatever it then reaches, and says so when there is no room', () => {
  const mascot = box(300, 700, 360, 800)
  const a = box(350, 720, 380, 760)
  const b = box(300, 700, 320, 790) // reached only once it has moved clear of a
  const r = insetForObstacles(mascot, [a, b], 16)
  assert.equal(r.dx, b.left - 16 - mascot.right)
  assert.ok(r.clear)
  // A banner across the whole width: no room left of `min`; it stops at `min` and is not clear.
  const banner = box(0, 760, 1366, 900)
  const stuck = insetForObstacles(mascot, [banner], 16, { min: 8 })
  assert.equal(stuck.clear, false)
  assert.equal(mascot.left + stuck.dx, 8)
  // Bad boxes are ignored.
  assert.deepEqual(insetForObstacles(mascot, [box(NaN, 0, 1, 1), box(5, 5, 5, 5), null], 16), { dx: 0, clear: true })
})

test('padding: only vertical or horizontal nearness within the padding counts', () => {
  const mascot = box(1173, 783, 1252, 900)
  assert.equal(insetForObstacles(mascot, [box(1100, 700, 1300, 766)], 16).dx, 0, '17 px above: clear')
  assert.equal(insetForObstacles(mascot, [box(1100, 700, 1300, 768)], 16).dx, 1100 - 16 - 1252, '15 px above: in reach')
  assert.equal(insetForObstacles(mascot, [box(1269, 783, 1300, 900)], 16).dx, 0, '17 px to its right: clear')
})

test('drone regions: the right gutter stops 8 px above the microphone (it ran 18 px into it); homes are untouched', () => {
  const w = 93
  const h = 65
  // Top-left corners the drone may take: the gutter column, reaching y 763 with the drone's height.
  const gutter = { left: 1261, top: 100, right: 1261, bottom: 763 - h, width: 0, height: 763 - h - 100 }
  const cut = stopAbove(gutter, [MIC, AW], { w, h }, 8)
  assert.equal(cut.top + cut.height + h, MIC.top - 8)
  assert.equal(cut.left, gutter.left)
  assert.equal(cut.width, gutter.width)
  // Out of reach across: the very same region.
  assert.equal(stopAbove(gutter, [box(0, 700, 400, 900)], { w, h }, 8), gutter)
  // Nothing left of it: null.
  assert.equal(stopAbove(gutter, [box(1200, 80, 1400, 300)], { w, h }, 8), null)
  assert.equal(stopAbove(gutter, [], { w, h }), gutter)
})

/* --------------------------------------------------------- the page read */

const element = ({ rect = null, style = {}, state = undefined, shadow = null } = {}) => ({
  getClientRects: () => (rect ? [rect] : []),
  getBoundingClientRect: () => {
    if (rect === 'throw') throw new Error('detached')
    return rect ? { ...rect, width: rect.right - rect.left, height: rect.bottom - rect.top } : { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }
  },
  dataset: state ? { state } : {},
  shadowRoot: shadow,
  style,
})

const fakeDocument = ({ ids = {}, all = {}, width = 1366, height = 900 } = {}) => {
  const doc = {
    documentElement: { clientWidth: width, clientHeight: height },
    getElementById: (id) => ids[id] ?? null,
    querySelectorAll: (selector) => all[selector] ?? [],
  }
  const view = { innerWidth: width, innerHeight: height, getComputedStyle: (node) => ({ visibility: node.style.visibility ?? 'visible', opacity: node.style.opacity ?? '1' }) }
  doc.defaultView = view
  for (const node of [...Object.values(ids), ...Object.values(all).flat()]) node.ownerDocument = doc
  return doc
}

const shadowOf = (map) => ({ querySelectorAll: (selector) => map[selector] ?? [] })

test('fixedObstacles: the accessibility button, the guide\'s microphone from its shadow root, its keyboard button and bar only while shown, the shown trail and banner; never the host', () => {
  const mic = element({ rect: MIC })
  const kbd = element({ rect: KBD, style: { opacity: '0' } }) // faded out while the guide is not listening: not reserved (S12)
  const bar = element({ rect: BAR, style: { opacity: '0' } })
  const pill = element({ rect: box(1200, 72, 1350, 116), style: { opacity: '0' } }) // not shown: skipped
  const card = element({ rect: box(930, 124, 1350, 600) })
  const guide = element({ rect: null, shadow: shadowOf({ '.vg-mic': [mic], '.vg-kbd': [kbd], '.vg-bar': [bar], '.tr-pill': [pill], '.tr-card': [card] }) })
  const banner = element({ rect: box(0, 760, 1366, 900) })
  const peekHidden = element({ rect: box(22, 820, 80, 878), state: 'hidden' })
  const doc = fakeDocument({ ids: { 'vodafone-aw-icon': element({ rect: AW }), 'onetrust-banner-sdk': banner }, all: { 'vg-guide': [guide], '.pocket-peek': [peekHidden] } })
  for (const node of [mic, kbd, bar, pill, card]) node.ownerDocument = doc
  assert.deepEqual(fixedObstacles(doc), [AW, box(0, 760, 1366, 900), MIC, box(930, 124, 1350, 600)])
  // While it listens: the keyboard button and the bar show, and count.
  kbd.style.opacity = '1'
  bar.style.opacity = '0.9'
  assert.deepEqual(fixedObstacles(doc), [AW, box(0, 760, 1366, 900), MIC, KBD, BAR, box(930, 124, 1350, 600)])
  // Hidden by visibility, or all but faded (opacity 0.05 or less): not shown.
  kbd.style.visibility = 'hidden'
  bar.style.opacity = '0.05'
  assert.deepEqual(fixedObstacles(doc), [AW, box(0, 760, 1366, 900), MIC, box(930, 124, 1350, 600)])
})

test('with the keyboard button and bar faded out, the English mascot at 1366x900 keeps his place on the margin (x 1173-1252)', () => {
  const mascot = box(1173, 783, 1252, 900)
  const mic = element({ rect: MIC })
  const kbd = element({ rect: KBD, style: { opacity: '0' } })
  const bar = element({ rect: BAR, style: { opacity: '0' } })
  const guide = element({ rect: null, shadow: shadowOf({ '.vg-mic': [mic], '.vg-kbd': [kbd], '.vg-bar': [bar] }) })
  const doc = fakeDocument({ ids: { 'vodafone-aw-icon': element({ rect: AW }) }, all: { 'vg-guide': [guide] } })
  for (const node of [mic, kbd, bar]) node.ownerDocument = doc
  assert.deepEqual(insetForObstacles(mascot, fixedObstacles(doc), 16), { dx: 0, clear: true })
  kbd.style.opacity = '1'
  assert.equal(insetForObstacles(mascot, fixedObstacles(doc), 16).dx, KBD.left - 16 - mascot.right)
})

test('padding toward the right (the mascot at the left margin of a right-to-left album): the mirror of toward the left', () => {
  const mascot = box(107, 783, 186, 900)
  assert.deepEqual(insetForObstacles(mascot, [], 16, { toward: 1 }), { dx: 0, clear: true })
  // A control on its left, within reach: pushed right to 16 px from it, no further.
  const control = box(60, 800, 110, 880)
  const r = insetForObstacles(mascot, [control], 16, { toward: 1 })
  assert.equal(mascot.left + r.dx, control.right + 16)
  assert.ok(r.clear)
  // Mirror of the left-moving case about x = 683: the same distance, the other way.
  const mirror = (b) => box(1366 - b.right, b.top, 1366 - b.left, b.bottom)
  const leftward = insetForObstacles(mirror(mascot), [mirror(control)], 16)
  assert.equal(leftward.dx, -r.dx)
  // It moves on past whatever it then reaches.
  const a = box(90, 720, 130, 760)
  const b = box(150, 700, 230, 790) // reached once it has moved clear of a
  const chained = insetForObstacles(mascot, [a, b], 16, { toward: 1 })
  assert.equal(mascot.left + chained.dx, b.right + 16)
  assert.ok(chained.clear)
  // No room before `max`: it stops at `max` and is not clear.
  const stuck = insetForObstacles(mascot, [box(0, 760, 1366, 900)], 16, { toward: 1, max: 1358 })
  assert.equal(stuck.clear, false)
  assert.equal(mascot.right + stuck.dx, 1358)
  // Never moves left.
  assert.ok(insetForObstacles(mascot, [box(150, 790, 300, 900)], 16, { toward: 1 }).dx >= 0)
})

test('fixedObstacles: null-safe and never throws (missing nodes, no shadow root, a node that throws, off-screen boxes)', () => {
  assert.deepEqual(fixedObstacles(fakeDocument()), [])
  const doc = fakeDocument({
    ids: { 'vodafone-aw-icon': element({ rect: 'throw' }) },
    all: { 'vg-guide': [element({ shadow: null })], '.pocket-peek': [element({ rect: box(-200, -200, -100, -100), state: 'shown' })] },
  })
  assert.deepEqual(fixedObstacles(doc), [])
  assert.deepEqual(fixedObstacles({}), [])
  assert.deepEqual(fixedObstacles(null), [])
  const shownPeek = element({ rect: box(22, 820, 80, 878), state: 'shown' })
  assert.deepEqual(fixedObstacles(fakeDocument({ all: { '.pocket-peek': [shownPeek] } })), [box(22, 820, 80, 878)])
})
