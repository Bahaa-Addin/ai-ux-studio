/**
 * The experiences' scroller seam (voice-guide ADR-0076, phase 4a spec A): with no scroller every number is
 * the clone's as before; with a stand-in scroller the stepper reads and writes the box and never the window;
 * listeners, frames and timers go through the guard's wrap (never its listen) and are all undone by configure();
 * words() per copy, every neutral word and the canvas sign's {page}; pageHeading with a blank title; svgIcon's choice of symbol; the mount wrapper; the template data without its references.
 * The English page (the Arabic words are in shared-seam-ar.test.mjs, a process of its own).
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

import * as shared from '../src/aixc/experiences/shared.js'
import { createGuard } from '../src/host/guard.js'
import { vodafoneServicesPage } from '../src/content/vodafone-services.js'
import { normalizeContentModel } from '../src/host/model.js'
import { buildContentIndex } from '../src/aixc/content-index.js'
import { FakeTarget, fakeBox, fakeScroller, fakeWindow, installDom, installResizeObserver } from './seam-fakes.mjs'

const { configure, scrollStepper, chromeOffset } = shared
const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8')

/** A fresh window (and the clone's header and view bar) for each test; the seam reset. */
const setup = ({ header = 104, viewbar = 57, viewbarHidden = false, ...win } = {}) => {
  configure()
  globalThis.window = fakeWindow(win)
  const elements = {
    '#site-header': header === null ? null : { getBoundingClientRect: () => ({ height: header }) },
    '#aixc-viewbar': viewbar === null ? null : { hidden: viewbarHidden, getBoundingClientRect: () => ({ height: viewbarHidden ? 0 : viewbar }) },
  }
  globalThis.document = { documentElement: { lang: 'en', dir: 'ltr' }, querySelector: (selector) => elements[selector] ?? null }
  const live = installResizeObserver()
  return { win: globalThis.window, live }
}

/* ---------------------------------------------------------- today's numbers */

// The clone's formulas before the seam (shared.js at 3992aa5), kept here as the reference.
const today = {
  chromeOffset: ({ header, viewbar, viewbarHidden }) => (header ?? 0) + (viewbar !== null && !viewbarHidden ? viewbar : 0),
  position: (chrome, top, step, last) => Math.min(last, Math.max(0, (chrome - top) / step)),
  pinned: (chrome, top, bottom, innerHeight) => top <= chrome + 1 && bottom >= innerHeight - 1,
  goTo: (chrome, top, scrollY, at, step, last) => Math.max(0, top + scrollY + Math.min(last, Math.max(0, at)) * step - chrome + 1),
}

test('no scroller: every number the stepper and the helpers give is the clone\'s as before', () => {
  let cases = 0
  for (const header of [0, 104, null]) {
    for (const [viewbar, viewbarHidden] of [[57, false], [57, true], [null, false]]) {
      for (const innerHeight of [700, 900]) {
        for (const scrollY of [0, 1000]) {
          for (const top of [-1500, -350, 0, 160, 161, 162, 400]) {
            for (const height of [900, 1600]) {
              const { win } = setup({ header, viewbar, viewbarHidden, innerHeight, scrollY })
              const chrome = today.chromeOffset({ header, viewbar, viewbarHidden })
              assert.equal(chromeOffset(), chrome)
              assert.equal(shared.viewTop(), chrome)
              assert.equal(shared.viewBottom(), innerHeight)
              assert.equal(shared.viewHeight(), innerHeight)
              assert.equal(shared.scrollTop(), scrollY)
              const track = fakeBox({ top, height })
              const count = 6
              const stepper = scrollStepper({ track, count, step: () => 200 })
              assert.equal(stepper.position(), today.position(chrome, top, 200, count - 1))
              assert.equal(stepper.pinned(), today.pinned(chrome, top, top + height, innerHeight))
              for (const at of [-1, 0, 2.4, 5, 9]) {
                win.scrolls.length = 0
                stepper.goTo(at, { instant: true })
                assert.deepEqual(win.scrolls, [{ top: today.goTo(chrome, top, scrollY, at, 200, count - 1), behavior: 'auto' }])
              }
              cases += 1
            }
          }
        }
      }
    }
  }
  assert.equal(cases, 3 * 3 * 2 * 2 * 7 * 2)
})

test('no scroller: scrolling, dragging and sideways wheels move the window exactly as before', () => {
  const { win } = setup({ scrollY: 300 })
  shared.scrollToY(-20)
  shared.scrollToY(480, { instant: true })
  assert.deepEqual(win.scrolls, [{ top: 0, behavior: 'smooth' }, { top: 480, behavior: 'auto' }])
  // A drag of 20 px up the stage scrolls 20 * factor px down.
  const surface = Object.assign(new FakeTarget(), { setPointerCapture() {}, classList: { add() {}, remove() {} } })
  const stopDrag = shared.dragToScroll(surface, { axis: 'y', factor: 1.5 })
  surface.dispatch('pointerdown', { button: 0, pointerId: 1, clientY: 500, pointerType: 'mouse' })
  surface.dispatch('pointermove', { pointerId: 1, clientY: 480 })
  assert.deepEqual(win.scrollBys, [{ top: 30, behavior: 'auto' }])
  stopDrag()
  assert.equal(surface.count(), 0, 'the drag\'s cleanup removes its listeners')
  // A sideways wheel: forward along the reading line scrolls down.
  win.scrollBys.length = 0
  const stopWheel = shared.sidewaysWheel(surface, { factor: 2 })
  const event = surface.dispatch('wheel', { deltaX: 40, deltaY: 5, deltaMode: 0, ctrlKey: false })
  assert.ok(event.defaultPrevented)
  assert.deepEqual(win.scrollBys, [{ top: 80, behavior: 'auto' }])
  stopWheel()
  assert.equal(surface.count(), 0)
  // onScrollFrame: the window's scroll and resize, at most once a frame, and once at the start.
  let calls = 0
  const stop = shared.onScrollFrame(() => (calls += 1))
  assert.equal(win.count('scroll'), 1)
  assert.equal(win.count('resize'), 1)
  win.dispatch('scroll')
  win.dispatch('resize')
  win.runFrames()
  assert.equal(calls, 1)
  win.dispatch('scroll')
  win.runFrames()
  assert.equal(calls, 2)
  stop()
  assert.equal(win.count(), 0)
  assert.equal(win.frames.size, 0)
})

/* ---------------------------------------------------------- a stand-in box */

test('a stand-in scroller: the stepper reads the box\'s coordinates and scrolls the box, never the window', () => {
  const { win } = setup({ scrollY: 640 })
  // The box sits at viewport y 120, 780 tall, scrolled 800; its view bar is 57 tall. The track starts 400 down its content.
  const box = fakeScroller({ top: 120, height: 780, scrollTop: 800, bar: 57 })
  configure({ scroller: box })
  assert.equal(shared.viewScroller(), box)
  assert.equal(chromeOffset(), 57, 'the box\'s own view bar, not the site header')
  assert.equal(shared.viewTop(), 177)
  assert.equal(shared.viewBottom(), 900)
  assert.equal(shared.viewHeight(), 780)
  assert.equal(shared.scrollTop(), 800)
  const track = fakeBox({ top: 120 + 400 - 800, height: 1600 })
  const stepper = scrollStepper({ track, count: 6, step: () => 200 })
  assert.equal(stepper.position(), (177 - -280) / 200)
  assert.equal(stepper.pinned(), true)
  track.rect.height = 1100 // bottom at 820: above the box's bottom
  assert.equal(stepper.pinned(), false)
  track.rect.height = 1600
  stepper.goTo(3, { instant: true })
  assert.deepEqual(box.scrolls, [{ top: 400 + 3 * 200 - 57 + 1, behavior: 'auto' }])
  // An element's top to the pin line: 650 in the viewport is 650 - 177 below the line.
  box.scrolls.length = 0
  shared.scrollToElement(fakeBox({ top: 650, height: 10 }), { instant: true })
  assert.deepEqual(box.scrolls, [{ top: 800 + 650 - 177, behavior: 'auto' }])
  shared.scrollByY(-25)
  assert.deepEqual(box.scrollBys, [{ top: -25, behavior: 'auto' }])
  // The bar hidden: the pin line is the box's top.
  box.viewbar.hidden = true
  assert.equal(chromeOffset(), 0)
  assert.equal(shared.viewTop(), 120)
  assert.deepEqual(win.scrolls, [], 'the window never scrolled')
  assert.deepEqual(win.scrollBys, [])
  configure()
})

test('a stand-in scroller: drags, wheels and settling move the box; onScrollFrame follows the box\'s scroll and size', () => {
  const { win, live } = setup()
  const box = fakeScroller({ top: 0, height: 800, scrollTop: 0 })
  configure({ scroller: box })
  const surface = Object.assign(new FakeTarget(), { setPointerCapture() {}, classList: { add() {}, remove() {} } })
  shared.dragToScroll(surface, { axis: 'y' })
  surface.dispatch('pointerdown', { button: 0, pointerId: 1, clientY: 500, pointerType: 'mouse' })
  surface.dispatch('pointermove', { pointerId: 1, clientY: 470 })
  shared.sidewaysWheel(surface)
  surface.dispatch('wheel', { deltaX: 50, deltaY: 0, deltaMode: 0 })
  assert.deepEqual(box.scrollBys, [{ top: 30, behavior: 'auto' }, { top: 50, behavior: 'auto' }])
  let calls = 0
  shared.onScrollFrame(() => (calls += 1))
  assert.equal(box.count('scroll'), 1, 'the box\'s scroll')
  assert.equal(win.count('scroll'), 0, 'not the window\'s')
  assert.equal(win.count('resize'), 1, 'the window\'s resize')
  assert.equal([...live].filter((o) => o.targets.includes(box)).length, 1, 'and the box\'s size')
  box.dispatch('scroll')
  win.runFrames()
  assert.equal(calls, 1)
  // settle(): after the quiet time, a pinned stage between items eases to the nearest, in the box.
  const track = fakeBox({ top: 57 - 330, height: 2000 }) // 1.65 items in
  const stepper = scrollStepper({ track, count: 6, step: () => 200 })
  box.scrollTop = 1000
  stepper.settle()
  assert.equal(win.timers.size, 1)
  win.runTimers()
  // The track's top in the box's content: -273 - 0 + 1000 = 727; item 2 at 727 + 400, less the bar, plus 1.
  assert.deepEqual(box.scrolls, [{ top: 727 + 2 * 200 - 57 + 1, behavior: 'smooth' }])
  assert.deepEqual(win.scrolls, [])
  configure()
  assert.equal(surface.count(), 0, 'configure() took the drag\'s and the wheel\'s listeners away')
  assert.equal(box.count(), 0)
  assert.equal(live.size, 0)
})

/* ------------------------------------------------ the guard and configure() */

test('on() goes through the guard\'s wrap; its off removes what it added; an error stops the guard, not the page', () => {
  setup()
  const log = { error() {}, warn() {} }
  const guard = createGuard({ log, root: { querySelectorAll: () => [] } })
  configure({ wrap: guard.wrap, listen: guard.listen })
  const target = new FakeTarget()
  let ran = 0
  const off = shared.on(target, 'click', () => (ran += 1))
  assert.equal(target.count('click'), 1)
  target.dispatch('click')
  assert.equal(ran, 1)
  off()
  off()
  assert.equal(target.count('click'), 0, 'off removes the guarded listener, once')
  shared.on(target, 'keydown', () => {
    throw new Error('boom')
  })
  assert.doesNotThrow(() => target.dispatch('keydown'))
  assert.deepEqual(guard.failure, { step: 'keydown handler', message: 'boom' })
  configure()
})

/** A drag of 30 px on `surface` that moved, then the click the browser sends after it (swallowed). */
const dragOnce = (win, surface) => {
  surface.dispatch('pointerdown', { button: 0, pointerId: 1, clientX: 300, clientY: 400, pointerType: 'mouse' })
  surface.dispatch('pointermove', { pointerId: 1, clientX: 270, clientY: 400 })
  surface.dispatch('pointerup', { pointerId: 1 })
  surface.dispatch('click')
  win.runTimers()
}

test('the guard keeps nothing for the seam: its cleanups do not grow across mount, unmount, mount and drags', () => {
  const { win } = setup()
  // A stand-in with the guard's own listen (host/guard.js): it adds a guarded listener and keeps a cleanup for it
  // until the guard stops. The seam must never call it: the kept set and configure() on the guard's stop
  // already undo what the seam adds, so each call would only pile up a closure holding an old view.
  const cleanups = []
  let listened = 0
  const guard = {
    wrap: (name, fn) => (...args) => fn(...args),
    listen: (target, type, fn, options) => {
      listened += 1
      target.addEventListener(type, fn, options)
      cleanups.push(() => target.removeEventListener(type, fn, options))
      return fn
    },
  }
  const box = fakeScroller()
  configure({ scroller: box, wrap: guard.wrap, listen: guard.listen })
  const surface = Object.assign(new FakeTarget(), { setPointerCapture() {}, classList: { add() {}, remove() {} } })
  const buttons = [new FakeTarget(), new FakeTarget(), new FakeTarget()]
  // A view's listeners, the way spotlight's listen() adds them on mount.
  const mount = () => [
    shared.onScrollFrame(() => {}),
    shared.dragToScroll(surface, { axis: 'x', touch: true }),
    shared.sidewaysWheel(surface),
    shared.onViewScroll(() => {}),
    shared.onViewResize(() => {}),
    shared.arrowKeys(surface, { step: () => {} }),
    ...buttons.map((button) => shared.on(button, 'click', () => {})),
  ]
  const counts = () => ({ cleanups: cleanups.length, listened })
  let offs = mount()
  assert.ok(surface.count() > 0 && box.count('scroll') > 0 && win.count('resize') > 0, 'the view listens')
  assert.deepEqual(counts(), { cleanups: 0, listened: 0 }, 'mount')
  for (let at = 0; at < 5; at += 1) dragOnce(win, surface)
  assert.equal(surface.count('click'), 0, 'each drag\'s click swallow is gone after it')
  assert.deepEqual(counts(), { cleanups: 0, listened: 0 }, 'drags')
  for (const off of offs.splice(0)) off()
  assert.deepEqual({ surface: surface.count(), box: box.count(), win: win.count() }, { surface: 0, box: 0, win: 0 }, 'unmount removes every listener')
  assert.deepEqual(counts(), { cleanups: 0, listened: 0 }, 'unmount')
  offs = mount()
  for (let at = 0; at < 5; at += 1) dragOnce(win, surface)
  assert.deepEqual(counts(), { cleanups: 0, listened: 0 }, 'mounted again, and more drags')
  configure()
  assert.deepEqual({ surface: surface.count(), box: box.count(), win: win.count(), kept: shared.keptCount() }, { surface: 0, box: 0, win: 0, kept: 0 })
  // The real guard: after mounts, unmounts and drags, its stop has nothing of the seam's left to remove.
  const real = createGuard({ log: { error() {}, warn() {} }, root: { querySelectorAll: () => [] } })
  configure({ scroller: box, wrap: real.wrap, listen: real.listen })
  for (let cycle = 0; cycle < 3; cycle += 1) {
    offs = mount()
    for (let at = 0; at < 4; at += 1) dragOnce(win, surface)
    for (const off of offs.splice(0)) off()
  }
  offs = mount()
  real.onStop(() => configure())
  let removed = 0
  for (const target of [surface, box, win, ...buttons]) {
    const remove = target.removeEventListener.bind(target)
    target.removeEventListener = (...args) => {
      removed += 1
      remove(...args)
    }
  }
  const before = surface.count() + box.count() + win.count() + buttons.reduce((sum, button) => sum + button.count(), 0)
  real.stop()
  assert.equal(removed, before, `the guard's stop removes only the ${before} listeners still added (through configure()), none twice`)
  assert.deepEqual({ surface: surface.count(), box: box.count(), win: win.count(), kept: shared.keptCount() }, { surface: 0, box: 0, win: 0, kept: 0 })
})

test('wrap alone: listeners, frames, timers and observers each run through it under their own name', () => {
  const { win, live } = setup()
  const names = []
  const wrap = (name, fn) => (...args) => {
    names.push(name)
    return fn(...args)
  }
  configure({ wrap })
  const target = new FakeTarget()
  let ran = 0
  shared.on(target, 'click', () => (ran += 1))
  target.dispatch('click')
  shared.frame(() => (ran += 1))
  win.runFrames()
  shared.later(() => (ran += 1), 10)
  win.runTimers()
  shared.observeResize(target, () => (ran += 1))
  ;[...live][0].callback([])
  shared.guarded('image error', () => (ran += 1))()
  assert.equal(ran, 5)
  assert.deepEqual(names, ['click handler', 'frame', 'timer', 'resize observer', 'image error'])
  configure()
  // Plain again: nothing wrapped.
  names.length = 0
  shared.on(target, 'click', () => {})
  target.dispatch('click')
  assert.deepEqual(names, [])
  configure()
})

test('configure() first undoes every listener, frame, timer and observer the seam handed out', () => {
  const { win, live } = setup()
  const box = fakeScroller()
  configure({ scroller: box })
  const target = new FakeTarget()
  let ran = 0
  const offs = [
    shared.on(win, 'resize', () => (ran += 1)),
    shared.on(target, 'click', () => (ran += 1)),
    shared.frame(() => (ran += 1)),
    shared.later(() => (ran += 1), 100),
    shared.onScrollFrame(() => (ran += 1)),
    shared.onViewScroll(() => (ran += 1)),
    shared.onViewResize(() => (ran += 1)),
    shared.observeResize(target, () => (ran += 1)),
  ]
  shared.arrowKeys(target, { step: () => (ran += 1) })
  assert.ok(shared.keptCount() >= offs.length)
  assert.ok(win.count() > 0 && box.count() > 0 && target.count() > 0 && win.frames.size > 0 && win.timers.size > 0 && live.size > 0)
  configure()
  assert.equal(shared.keptCount(), 0)
  assert.deepEqual({ win: win.count(), box: box.count(), target: target.count(), frames: win.frames.size, timers: win.timers.size, observers: live.size }, { win: 0, box: 0, target: 0, frames: 0, timers: 0, observers: 0 })
  win.runFrames()
  win.runTimers()
  assert.equal(ran, 0, 'nothing runs after the reset')
  for (const off of offs) assert.doesNotThrow(off, 'a kept off called again is a no-op')
  // A frame or timer that ran is no longer kept.
  configure({ scroller: box })
  shared.frame(() => {})
  shared.later(() => {}, 5)
  assert.equal(shared.keptCount(), 2)
  win.runFrames()
  win.runTimers()
  assert.equal(shared.keptCount(), 0)
  configure()
  // The clone never configures the seam: what it hands out still works and is not held.
  const plain = new FakeTarget()
  const off = shared.on(plain, 'click', () => (ran += 1))
  shared.arrowKeys(plain, { step: () => {} })
  shared.frame(() => {})
  assert.equal(shared.keptCount(), 0, 'nothing held on the clone')
  plain.dispatch('click')
  assert.equal(ran, 1)
  off()
  assert.equal(plain.count('click'), 0)
  win.runFrames()
})

/* ------------------------------------------------------------------- words */

test('words(): the clone\'s words by default, neutral ones for pages that are not about services', () => {
  setup()
  const keys = ['Previous service', 'Next service', 'Vodafone services spotlight', 'Show {title}', 'View service', 'More services', 'Services', 'Jump to a category']
  assert.deepEqual(keys.map((key) => shared.words(key, { title: 'Flex' })), ['Previous service', 'Next service', 'Vodafone services spotlight', 'Show Flex', 'View service', 'More services', 'Services', 'Jump to a category'])
  configure({ copy: 'items' })
  assert.deepEqual(keys.map((key) => shared.words(key, { title: 'Flex' })), ['Previous', 'Next', 'Spotlight', 'Show Flex', 'View details', 'More on this page', 'Items', 'Jump to a section'])
  assert.equal(shared.words('Up next'), 'Up next', 'a word with no neutral form is the clone\'s')
  configure({ copy: 'nonsense' })
  assert.equal(shared.words('More services'), 'More services', 'an unknown copy is the clone\'s')
  configure()
})

// The neutral words Reimagine's other eleven experiences use on pages not about services (ADR-0076, phase 1), by the
// experience whose t('...') call says the key today (words('...') once phases 2-4 switch it); each neutral word is the
// composer's card name where that is neutral.
const ELEVEN = [
  ['fan', 'Vodafone services, card fan', 'Card fan'],
  ['gallery', 'Gallery of Vodafone services', 'Gallery wall'],
  ['flipbook', 'Vodafone services flipbook', 'Flipbook'],
  ['ring', 'Vodafone services, ring', 'Ring'],
  ['coverflow', 'Vodafone services, cover flow', 'Cover flow'],
  ['split', 'Vodafone services, split slideshow', 'Split slideshow'],
  ['tunnel', 'Vodafone services, hyper tunnel', 'Hyper tunnel'],
  ['canvas', 'Vodafone services, infinite canvas', 'Infinite canvas'],
  ['canvas', 'Services canvas. Use the arrow keys to pan, Tab to move between services.', 'Canvas. Use the arrow keys to pan, Tab to move between items.'],
  ['canvas', 'Vodafone Egypt · Services', 'Vodafone Egypt · {page}'],
]

test('NEUTRAL_WORDS: every entry neutral with copy \'items\', the clone\'s own word otherwise; the eleven\'s keys are their t() or words() calls', async () => {
  setup()
  const entries = Object.entries(shared.NEUTRAL_WORDS)
  for (const [, key, neutral] of ELEVEN) assert.equal(shared.NEUTRAL_WORDS[key], neutral, key)
  assert.equal(entries.length, 7 + ELEVEN.length, 'stage 1\'s seven and the eleven\'s ten')
  for (const [key, neutral] of entries) {
    configure()
    assert.equal(shared.words(key), key, `${key}: the clone's word with copy 'services'`)
    configure({ copy: 'items' })
    assert.equal(shared.words(key), neutral, `${key}: neutral with copy 'items'`)
    assert.doesNotMatch(neutral, /service/i, `${neutral}: not about services`)
  }
  configure()
  // The keys exactly as the experiences say them: t('key') until phases 2-4 switch the call, words('key' after (the
  // open call, so words('key', { page }) counts too).
  for (const [experience, key] of ELEVEN) {
    const source = read(`../src/aixc/experiences/${experience}.js`)
    assert.ok(source.includes(`t('${key}')`) || source.includes(`words('${key}'`), `${experience}.js says t('${key}') or words('${key}'`)
  }
  // The experience's own label is its card's name in the composer, where that name is neutral.
  const { TEMPLATE_CARDS } = await import('../src/aixc/template-schema.js')
  let named = 0
  for (const [experience, key, neutral] of ELEVEN) {
    const card = TEMPLATE_CARDS.find((c) => c.experience === experience)
    assert.ok(card, experience)
    if (!/^Vodafone services/.test(key) && key !== 'Gallery of Vodafone services') continue
    if (/service/i.test(card.name)) assert.notEqual(neutral, card.name, `${experience}: its card name says services`)
    else assert.equal(neutral, card.name, `${experience}: the label is the composer's card name`)
    named += 1
  }
  assert.equal(named, 8, 'one label per experience the eleven name this way')
})

test('words() fills the page\'s name into the canvas sign: the neutral one takes {page}, the clone\'s keeps its own', () => {
  setup()
  configure({ copy: 'items' })
  assert.equal(shared.words('Vodafone Egypt · Services', { page: 'Roaming' }), 'Vodafone Egypt · Roaming')
  assert.equal(shared.words('Vodafone Egypt · Services'), 'Vodafone Egypt · {page}', 'no name given: the placeholder stays, as t() leaves any')
  configure()
  assert.equal(shared.words('Vodafone Egypt · Services', { page: 'Roaming' }), 'Vodafone Egypt · Services', 'the clone\'s sign is unchanged')
})

test('countWords(): the clone\'s countServices by default, "1 item" and "N items" with copy \'items\'', async () => {
  setup()
  const { countServices } = await import('../src/i18n.js')
  const counts = [0, 1, 2, 3, 10, 11, 12, 100]
  configure()
  assert.deepEqual(counts.map((n) => shared.countWords(n)), counts.map((n) => countServices(n)), 'copy \'services\': the clone\'s count')
  configure({ copy: 'nonsense' })
  assert.deepEqual(counts.map((n) => shared.countWords(n)), counts.map((n) => countServices(n)), 'an unknown copy is the clone\'s')
  configure({ copy: 'items' })
  const neutral = counts.map((n) => shared.countWords(n))
  assert.deepEqual(neutral, ['0 items', '1 item', '2 items', '3 items', '10 items', '11 items', '12 items', '100 items'])
  for (const word of neutral) assert.doesNotMatch(word, /service/i, `${word}: not about services`)
  configure()
})

/* ----------------------------------------------------------- page heading */

test('pageHeading: no h1 for an empty or blank title; any other title the same h1 as before', () => {
  setup()
  installDom()
  for (const title of ['', ' ', ' \n\t ', null, undefined]) {
    assert.equal(shared.pageHeading({ model: { title } }), null, `${JSON.stringify(title)}: no heading`)
    assert.equal(shared.pageHeading({ model: { title } }, { visible: true, className: 'x' }), null, `${JSON.stringify(title)}: no visible heading`)
  }
  // h() skips the absent heading: the root holds only the rest.
  const root = shared.experienceRoot('fan', { density: 'comfortable' }, shared.pageHeading({ model: { title: '  ' } }), 'track')
  assert.deepEqual(root.walk().map((el) => el.localName), ['div'])
  assert.equal(root.textContent, 'track')
  for (const [options, cls] of [[undefined, 'vx-sr-only'], [{ visible: true, className: 'tn-title' }, 'tn-title'], [{ visible: false, className: 'tn-title' }, 'vx-sr-only'], [{ visible: true }, '']]) {
    for (const title of ['Services', ' Roaming offers ', 'خدمات']) {
      const heading = shared.pageHeading({ model: { title } }, options)
      assert.equal(heading.localName, 'h1')
      assert.deepEqual([...heading.attributes], [['class', cls], ['id', 'aixc-cover-title'], ['tabindex', '-1'], ['data-aixc-focus', '']])
      assert.equal(heading.children.length, 1)
      assert.equal(heading.textContent, title, 'the title as given, not trimmed')
    }
  }
})

/* ------------------------------------------------------------------- icons */

test('svgIcon: the page\'s own symbol when it has one outside our layer, else ours, prefixed; no icon, no <use>', async () => {
  setup()
  const dom = installDom()
  const { svgIcon } = await import('../src/aixc/dom.js')
  const href = (svg) => svg.children.find((child) => child.localName === 'use')?.getAttribute('href') ?? null
  assert.equal(href(svgIcon('icon-apple', 'x')), '#aixc-icon-apple', 'no symbol on the page: ours')
  dom.addSymbol('icon-apple', { ours: true })
  assert.equal(href(svgIcon('icon-apple', 'x')), '#aixc-icon-apple', 'a symbol inside [data-aixc] is not the page\'s')
  dom.addSymbol('icon-apple')
  assert.equal(href(svgIcon('icon-apple', 'x')), '#icon-apple', 'the page\'s own (the clone\'s sprite, or Vodafone\'s)')
  for (const missing of [null, undefined, '']) {
    const svg = svgIcon(missing, 'x')
    assert.equal(svg.localName, 'svg')
    assert.equal(href(svg), null, 'no <use href="#null">')
  }
})

test('a store with no icon is a text link in the closing band; one with an icon keeps it', async () => {
  setup()
  const dom = installDom()
  dom.addSymbol('icon-apple')
  const promo = {
    id: 'app',
    title: 'Ana Vodafone',
    stores: [
      { label: 'App Store', href: 'https://apps.example/ios', icon: 'icon-apple' },
      { label: 'Google Play', href: 'https://apps.example/android', icon: null },
    ],
  }
  const band = shared.closingBand(promo)
  const links = band.walk().filter((el) => el.localName === 'a')
  assert.equal(links.length, 2)
  const [withIcon, textOnly] = links
  assert.ok(withIcon.walk().some((el) => el.localName === 'use' && el.getAttribute('href') === '#icon-apple'))
  assert.equal(textOnly.walk().some((el) => el.localName === 'svg' || el.localName === 'use'), false, 'no picture for a store without one')
  assert.match(textOnly.textContent, /^Google Play/)
  assert.equal(textOnly.getAttribute('href'), 'https://apps.example/android')
  assert.equal(band.walk().some((el) => el.getAttribute?.('href') === '#null' || el.getAttribute?.('href') === '#undefined'), false)
})

/* ---------------------------------------------------- the mount wrapper */

test('experience-wrap: mount and unmount are idempotent, afterMount runs once, reveal is forwarded', async () => {
  const { wrapExperience } = await import('../src/aixc/experience-wrap.js')
  const calls = []
  const wrapped = wrapExperience({
    element: 'root',
    afterMount: [() => calls.push('after')],
    mount: () => calls.push('mount'),
    unmount: () => calls.push('unmount'),
    reveal: (id) => {
      calls.push(`reveal ${id}`)
      return true
    },
  })
  assert.equal(wrapped.element, 'root')
  assert.equal(wrapped.mounted, false)
  wrapped.mount()
  wrapped.mount()
  assert.equal(wrapped.mounted, true)
  wrapped.unmount()
  wrapped.unmount()
  wrapped.mount()
  assert.equal(wrapped.reveal('flex'), true)
  assert.deepEqual(calls, ['after', 'mount', 'unmount', 'mount', 'reveal flex'])
  const plain = wrapExperience({ element: 'root' })
  plain.mount()
  plain.unmount()
  assert.equal(plain.reveal('x'), false, 'no reveal hook: nothing to step to')
  assert.match(read('../src/aixc/experience-renderer.js'), /from '\.\/experience-wrap\.js'/, 'renderExperience goes through the same wrapper')
})

/* -------------------------------------------------------- template data */

test('template-schema.js builds the clone\'s schemas and carries no pen, author or link', async () => {
  const { model } = normalizeContentModel(vodafoneServicesPage)
  const index = buildContentIndex(model)
  const schemaModule = await import('../src/aixc/template-schema.js')
  const templates = await import('../src/aixc/templates.js')
  assert.equal(templates.buildGroupSchema, schemaModule.buildGroupSchema, 're-exported for the clone')
  assert.equal(templates.buildTemplateSchema, schemaModule.buildTemplateSchema)
  const groups = model.sections.filter((section) => section.items.length > 0)
  assert.deepEqual(schemaModule.buildTemplateSchema({ experience: 'spotlight' }, index), {
    version: 1,
    experience: 'spotlight',
    theme: 'vodafone-editorial',
    density: 'balanced',
    scope: 'all',
    unsupportedRequest: false,
    sections: [
      ...groups.map((section) => ({ id: section.id, type: 'group', title: null, description: null, itemIds: section.items.map((item) => item.id) })),
      { id: 'closing', type: 'closing-promotion', title: null, description: null, itemIds: ['ana-vodafone-app'] },
    ],
  })
  assert.equal(schemaModule.buildTemplateSchema({ experience: 'magazine' }, index).sections[0].type, 'hero', 'magazine: the built-in layout')
  // The composer's cards: the same templates in the same order, with their names and icons.
  assert.deepEqual(
    schemaModule.TEMPLATE_CARDS.map(({ id, experience, name, icon }) => ({ id, experience, name, icon })),
    templates.TEMPLATES.map(({ id, experience, name, icon }) => ({ id, experience, name, icon })),
  )
  for (const template of templates.TEMPLATES) {
    assert.deepEqual(Object.keys(template), ['id', 'experience', 'name', 'description', 'prompt', 'icon', 'reference', 'keywords'], template.id)
  }
  const source = read('../src/aixc/template-schema.js')
  for (const word of ['codepen', 'reference', 'author', 'http']) assert.doesNotMatch(source, new RegExp(word, 'i'), `no ${word} in template-schema.js`)
})

/* ---------------------------------------------------------- the sources */

test('the shared helpers, spotlight and magazine reach the window only through the seam', () => {
  const direct = /window\.(scrollTo|scrollBy|scrollY|innerHeight|addEventListener|removeEventListener|requestAnimationFrame|cancelAnimationFrame|setTimeout|clearTimeout)|\.addEventListener\(/
  for (const name of ['scrollStepper', 'dragToScroll', 'sidewaysWheel', 'sidewaysSwipe', 'arrowKeys', 'onScrollFrame']) {
    assert.doesNotMatch(String(shared[name]), direct, `${name} uses on(), frame(), later() and the scroll seam`)
  }
  for (const file of ['spotlight.js', 'magazine.js']) {
    const source = read(`../src/aixc/experiences/${file}`)
    assert.doesNotMatch(source, /window\.(scrollTo|scrollBy|scrollY|innerHeight|addEventListener|removeEventListener|requestAnimationFrame|cancelAnimationFrame|setTimeout|clearTimeout)/, `${file}: no window scroll, listener, frame or timer of its own`)
    const listeners = [...source.matchAll(/\.addEventListener\(\s*'([^']+)'/g)].map((match) => match[1])
    assert.deepEqual([...new Set(listeners)].filter((type) => type !== 'error'), [], `${file}: every handler but an image's error goes through on()`)
  }
})

test('the CSS seam: the clone\'s fixed top, the box\'s three measures, Vodafone\'s faces, spotlight\'s live rules', () => {
  const css = read('../src/aixc/experiences/vodafone.css')
  assert.match(css, /\.aixc-vx\s*\{[^}]*--vx-fixed-top:\s*var\(--vx-top\)/)
  const supportsAt = css.indexOf('@supports (height: 100svh)')
  const boxAt = css.search(/\.aixc-box \.aixc-vx\s*\{/)
  assert.ok(supportsAt > 0 && boxAt > supportsAt, 'the box\'s block comes after the @supports block')
  const box = css.slice(boxAt, css.indexOf('}', boxAt))
  assert.match(box, /--vx-top:\s*var\(--aixc-viewbar-h, 0px\)/)
  assert.match(box, /--vx-vh:\s*calc\(var\(--aixc-box-h, 100svh\) - var\(--aixc-viewbar-h, 0px\)\)/)
  assert.match(box, /--vx-fixed-top:\s*var\(--aixc-pin-y, 0px\)/)
  for (const [name, face] of [['--vx-font', 'regular'], ['--vx-font-bold', 'bold'], ['--vx-font-light', 'light']]) {
    assert.match(css, new RegExp(`${name}:\\s*var\\(--pocket-${face}, vodafone-${face}-en,`), `${name} reads the faces sheet's stack`)
  }
  const magazine = read('../src/aixc/experiences/magazine.css')
  for (const [name, face] of [['--mag-font', 'regular'], ['--mag-font-bold', 'bold'], ['--mag-font-light', 'light']]) {
    assert.match(magazine, new RegExp(`${name}:\\s*var\\(--pocket-${face}, vodafone-${face}-en,`), `${name} reads the faces sheet's stack`)
  }
  const spotlight = read('../src/aixc/experiences/spotlight.css')
  const live = spotlight.split('\n').filter((line) => line.includes('.aixc-box'))
  assert.ok(live.length > 0, 'spotlight has live rules')
  for (const line of live) assert.match(line, /^\s*\.aixc-box \.aixc-vx--spotlight[ ,{]/, `a live rule keys on the box and the class: ${line.trim()}`)
  for (const measure of ['--aixc-safe-right-h', '--aixc-safe-left-h', '--aixc-safe-right-w', '--aixc-safe-left-w']) assert.ok(spotlight.includes(measure), `spotlight keeps out of ${measure}`)
})
