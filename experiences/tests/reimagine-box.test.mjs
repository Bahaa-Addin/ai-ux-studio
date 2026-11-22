/**
 * Reimagine's box on Vodafone's pages (voice-guide ADR-0076 §3, §7; phase 4c's S7 cells): where the trail's pill
 * reaches below the view bar into the box's room (the box at the top of the screen, Vodafone's header in the flow),
 * box.js gives the previews the pill's measure (--aixc-sheet-pill-w, the bar's own measure from the box's inline end,
 * and --aixc-sheet-pill-h, from the room's top to the pill's bottom and 8 px), 0 where the pill ends above the room;
 * canvas's close and streaming's panel keep clear of it by them. The Pocket's resting curl is not drawn while the
 * composer shows, through the same rule as while a view shows (live.css), its button kept.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

import { createBox } from '../src/host/demos/reimagine/box.js'

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8')

const rect = ({ left, top, right, bottom }) => ({ left, top, right, bottom, width: right - left, height: bottom - top, x: left, y: top })

/** A node as box.js reads it: its box, its custom properties, its class; nothing else of the DOM. */
const node = (box, extra = {}) => {
  const props = new Map()
  const r = rect(box)
  return {
    isConnected: true,
    hidden: false,
    dataset: {},
    classList: { contains: () => false },
    matches: () => false,
    getBoundingClientRect: () => r,
    getClientRects: () => [r],
    addEventListener() {},
    removeEventListener() {},
    querySelectorAll: () => [],
    querySelector: () => null,
    style: { getPropertyValue: (name) => props.get(name) ?? '', setProperty: (name, value) => props.set(name, value) },
    props,
    ...extra,
  }
}

/** A screen `width` wide and 812 tall, the box from `boxTop` down with its bar `barH` tall, the pill at `pill`. */
const setup = ({ width = 375, boxTop = 0, barH = 119, pill, dir = 'ltr' }) => {
  const was = Object.fromEntries(['document', 'window', 'getComputedStyle', 'DOMMatrixReadOnly', 'innerHeight', 'ResizeObserver', 'MutationObserver', 'requestAnimationFrame', 'cancelAnimationFrame'].map((k) => [k, globalThis[k]]))
  const pillNode = pill ? node(pill) : null
  globalThis.window = {}
  globalThis.innerHeight = 812
  globalThis.document = {
    body: {},
    documentElement: { clientWidth: width },
    getElementById: () => null,
    querySelectorAll: () => [],
    querySelector: (selector) => (selector === '.tr-pill' ? pillNode : null),
  }
  globalThis.getComputedStyle = () => ({ transform: 'none', visibility: 'visible', opacity: '1' })
  globalThis.DOMMatrixReadOnly = class {
    e = 0
    f = 0
  }
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.MutationObserver = class {
    observe() {}
    disconnect() {}
  }
  globalThis.requestAnimationFrame = () => 1
  globalThis.cancelAnimationFrame = () => {}
  const inner = node({ left: 0, top: boxTop, right: width, bottom: boxTop + barH })
  const box = node({ left: 0, top: boxTop, right: width, bottom: 812 }, { clientTop: 0, clientLeft: 0, clientWidth: width, clientHeight: 812 - boxTop })
  const bar = node({ left: 0, top: boxTop, right: width, bottom: boxTop + barH }, { offsetHeight: barH, parentNode: box, firstElementChild: inner })
  const composer = node({ left: 0, top: 0, right: 0, bottom: 0 }, { hidden: true })
  const guard = { stopped: false, wrap: (_name, fn) => fn, listen() {} }
  const measures = createBox({ host: { dir }, guard, box, bar, composer, anchor: () => null, opener: () => null, launcher: null, headerBottom: () => boxTop })
  measures.measure()
  const restore = () => {
    measures.stop()
    for (const [k, v] of Object.entries(was)) globalThis[k] = v
  }
  return { box, bar, restore }
}

const sheet = (box) => [box.props.get('--aixc-sheet-pill-w'), box.props.get('--aixc-sheet-pill-h')]

test('the box at the top of a phone screen: the pill reaches 52 px into the room, so the previews keep 94 px at the inline end, or 60 px down', () => {
  // The S7 cell's numbers (375x812): the bar 0..119, the pill [297,127,359,171].
  const { box, bar, restore } = setup({ pill: { left: 297, top: 127, right: 359, bottom: 171 } })
  try {
    assert.deepEqual(sheet(box), ['94px', '60px'])
    assert.equal(bar.props.get('--aixc-pill-room'), '94px', 'the same measure as the bar\'s')
  } finally {
    restore()
  }
})

test('Arabic: the pill at the left, the same measure from the box\'s left', () => {
  const { box, restore } = setup({ dir: 'rtl', pill: { left: 16, top: 127, right: 78, bottom: 171 } })
  try {
    assert.deepEqual(sheet(box), ['94px', '60px'])
  } finally {
    restore()
  }
})

test('a wide screen with the box at its top: the pill [1165,69,1350,113] under a 61 px bar keeps 217 px at the inline end, 60 px down', () => {
  const { box, restore } = setup({ width: 1366, barH: 61, pill: { left: 1165, top: 69, right: 1350, bottom: 113 } })
  try {
    assert.deepEqual(sheet(box), ['217px', '60px'])
  } finally {
    restore()
  }
})

test('the box under Vodafone\'s pinned header: the pill ends over the bar, above the room, so nothing is kept; no pill, nothing', () => {
  const pinned = setup({ width: 1366, boxTop: 61, barH: 60, pill: { left: 1165, top: 69, right: 1350, bottom: 113 } })
  try {
    assert.deepEqual(sheet(pinned.box), ['0px', '0px'])
  } finally {
    pinned.restore()
  }
  const none = setup({})
  try {
    assert.deepEqual(sheet(none.box), ['0px', '0px'])
  } finally {
    none.restore()
  }
})

/** The declarations of the first rule in `css` whose selector is exactly `selector`. */
const declarations = (css, selector) => {
  const at = css.indexOf(`${selector} {`)
  assert.ok(at >= 0, `${selector} is styled`)
  return css.slice(at, css.indexOf('}', at))
}

test('canvas.css: the preview\'s close steps in by --aixc-sheet-pill-w (wide and on phones), and goes under the pill in the short room', () => {
  const css = read('../src/aixc/experiences/canvas.css')
  const block = css.slice(css.indexOf('/* ------------------------------------------------- in a box'))
  const close = '.aixc-box .aixc-vx--canvas .cv-dialog__close'
  const wide = declarations(block, close)
  assert.match(wide, /inset-inline-end: max\(20px, var\(--aixc-sheet-pill-w, 0px\)\)/)
  const phones = block.slice(block.indexOf('@media (max-width: 719px)'))
  assert.match(declarations(phones, close), /inset-inline-end: max\(12px, var\(--aixc-sheet-pill-w, 0px\)\)/)
  const short = block.slice(block.indexOf('@container (max-height: 479px)'))
  assert.match(declarations(short, close), /top: max\(8px, var\(--aixc-sheet-pill-h, 0px\)\)/)
  assert.ok(block.indexOf('@container (max-height: 479px)') > block.indexOf(`${close} {`), 'the short room\'s place comes after, so it wins there')
})

test('streaming.css: the preview\'s panel starts under the pill where it reaches into the room', () => {
  const css = read('../src/aixc/experiences/streaming.css')
  const block = css.slice(css.indexOf('/* ------------------------------------------------- in a box'))
  assert.match(declarations(block, '.aixc-box .aixc-vx--streaming .st-modal__panel'), /top: max\(12px, var\(--aixc-sheet-pill-h, 0px\)\)/)
})

test('live.css: the Pocket\'s resting curl is not drawn while the composer shows, as while a view shows; its button is not touched', () => {
  const css = read('../src/host/demos/reimagine/live.css')
  const block = css.slice(css.indexOf("/* ------------------------------------------- the Pocket's curl over a view */"))
  const rule = block.slice(0, block.indexOf('}') + 1)
  assert.match(rule, /body\[data-aixc-view='reimagined'\]:not\(\[data-pocket-view\]\) :is\(\.pocket-layer--plane, \.pocket-layer--lift\)/)
  assert.match(rule, /body:has\(\.aixc-composer:not\(\[hidden\]\)\):not\(\[data-pocket-view\]\) :is\(\.pocket-layer--plane, \.pocket-layer--lift\)/)
  assert.match(rule, /\{\s*opacity: 0;\s*\}/)
  assert.doesNotMatch(css, /pocket-peek/, 'the Pocket\'s button is never hidden or moved by Reimagine')
})
