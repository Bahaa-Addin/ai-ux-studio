/**
 * view-dialog.js viewDialog (beside shared.js, through its seam), the preview dialog canvas and streaming open over the view (voice-guide ADR-0076 §7; AGENTS.md
 * §4.6): on the clone (no scroller) the browser's modal dialog as before; with a scroller never the top layer: show(),
 * over the box's room under the bar, the rest of the box inert, the box's scroll held, Tab kept inside, Escape handed
 * to the experience, the focus back on the opener at close, and everything undone by close() or configure().
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import { configure, keptCount } from '../src/aixc/experiences/shared.js'
import { viewDialog } from '../src/aixc/experiences/view-dialog.js'
import { fakeDialogView, fakeWindow, installResizeObserver } from './seam-fakes.mjs'

const setup = (options) => {
  configure()
  globalThis.window = fakeWindow()
  const live = installResizeObserver()
  const view = fakeDialogView(options)
  return { ...view, live, win: globalThis.window }
}

/** A key pressed on `target`, as it reaches the dialog's own listener (the fakes do not bubble). */
const key = (dialog, target, init) => dialog.dispatch('keydown', { target, ...init })

test('no scroller (the clone): showModal() as before, close() closes it and gives the focus back; nothing inert, nothing kept', () => {
  const { dialog, opener, box, stage, viewbar } = setup()
  let escaped = 0
  const sheet = viewDialog(dialog, { onEscape: () => (escaped += 1) })
  sheet.open(opener)
  assert.deepEqual(dialog.calls, ['showModal'])
  assert.equal(sheet.shown, true)
  assert.deepEqual([stage.inert, viewbar.inert, box.style.overflowY, dialog.count()], [false, false, '', 0], 'nothing inert, the box untouched, no listener (the browser handles Escape: cancel)')
  assert.equal(keptCount(), 0)
  sheet.open(opener)
  assert.deepEqual(dialog.calls, ['showModal'], 'open twice: once')
  sheet.close()
  assert.deepEqual(dialog.calls, ['showModal', 'close'])
  assert.equal(opener.focused, 1, 'the focus back on the opener')
  assert.equal(escaped, 0)
})

test('a scroller: show(), never showModal(); over the box\'s room under the bar; the rest of the box inert; the box\'s scroll held', () => {
  const { dialog, opener, box, root, heading, stage, band, viewbar, end, shellStage, body, live } = setup()
  const kept = keptCount()
  configure({ scroller: box })
  const sheet = viewDialog(dialog, { onEscape() {} })
  sheet.open(opener)
  assert.deepEqual(dialog.calls, ['show'], 'non-modal: never the top layer')
  assert.equal(dialog.getAttribute('tabindex'), '-1', 'a press inside it keeps the focus in it')
  // The room: from the bar's bottom (120 + 57) to the box's bottom (900), in the root's coordinates (its top at -223).
  assert.equal(dialog.props.get('--vx-sheet-top'), `${177 - root.getBoundingClientRect().top}px`)
  assert.equal(dialog.props.get('--vx-sheet-h'), `${900 - 177}px`)
  assert.deepEqual([heading, stage, band, viewbar, end].map((n) => n.inert), [true, true, true, true, true], 'every other part of the box inert')
  assert.deepEqual([dialog, body, root, shellStage, box].map((n) => n.inert), [false, false, false, false, false], 'the preview and what holds it not')
  assert.deepEqual([box.style.overflowY, box.style.scrollbarGutter], ['hidden', 'stable'], 'the box\'s scroll held, its scrollbar\'s room kept')
  assert.deepEqual(['keydown', 'wheel', 'touchstart', 'touchmove'].map((type) => dialog.count(type)), [1, 1, 1, 1])
  assert.ok(keptCount() > kept, 'the seam keeps it while it shows')
  assert.equal(live.size, 1, 'the box\'s size watched while it shows')
  sheet.close()
  assert.deepEqual(dialog.calls, ['show', 'close'])
  assert.deepEqual([heading, stage, band, viewbar, end].map((n) => n.inert), [false, false, false, false, false], 'the rest as before')
  assert.deepEqual([box.style.overflowY, box.style.scrollbarGutter, dialog.getAttribute('tabindex')], ['', '', null], 'the box\'s scroll and the dialog as before')
  assert.equal(dialog.count(), 0, 'its listeners gone')
  assert.equal(live.size, 0)
  assert.equal(opener.focused, 1, 'the focus back on the opener')
  assert.equal(keptCount(), 0, 'nothing kept')
  configure()
})

test('a scroller: what was inert before stays inert; a box with no scrollbar gets no gutter; an inline overflow comes back', () => {
  const { dialog, opener, box, band } = setup({ scrollbar: 0 })
  band.inert = true
  box.style.overflowY = 'scroll'
  configure({ scroller: box })
  const sheet = viewDialog(dialog)
  sheet.open(opener)
  assert.deepEqual([box.style.overflowY, box.style.scrollbarGutter], ['hidden', ''])
  sheet.close()
  assert.equal(band.inert, true, 'not ours to undo')
  assert.equal(box.style.overflowY, 'scroll')
  configure()
})

test('a scroller: Escape goes to the experience; Tab and Shift+Tab stay inside', () => {
  const { dialog, opener, box, controls, doc } = setup()
  configure({ scroller: box })
  let escaped = 0
  const sheet = viewDialog(dialog, { onEscape: () => (escaped += 1) })
  sheet.open(opener)
  const escape = key(dialog, dialog, { key: 'Escape' })
  assert.deepEqual([escaped, escape.defaultPrevented], [1, true])
  const [first, middle, last] = controls
  doc.activeElement = last
  let event = key(dialog, last, { key: 'Tab' })
  assert.deepEqual([event.defaultPrevented, doc.activeElement], [true, first], 'Tab on the last goes to the first')
  event = key(dialog, first, { key: 'Tab', shiftKey: true })
  assert.deepEqual([event.defaultPrevented, doc.activeElement], [true, last], 'Shift+Tab on the first goes to the last')
  doc.activeElement = middle
  event = key(dialog, middle, { key: 'Tab' })
  assert.deepEqual([event.defaultPrevented, doc.activeElement], [false, middle], 'in between the browser moves it')
  doc.activeElement = dialog
  event = key(dialog, dialog, { key: 'Tab', shiftKey: true })
  assert.deepEqual([event.defaultPrevented, doc.activeElement], [true, last], 'Shift+Tab from the dialog itself goes to its last')
  sheet.close({ focus: false })
  assert.equal(opener.focused, 0, 'close({ focus: false }) leaves the focus')
  configure()
})

test('a scroller: a wheel, a touch move or a scroll key that would leave the dialog is held; one an inner scroller takes is not', () => {
  const { dialog, opener, box, body, controls, El } = setup()
  configure({ scroller: box })
  const sheet = viewDialog(dialog)
  sheet.open(opener)
  // The body does not scroll: everything is held.
  assert.equal(dialog.dispatch('wheel', { target: controls[0], deltaY: 100 }).defaultPrevented, true)
  assert.equal(key(dialog, controls[0], { key: 'PageDown' }).defaultPrevented, true)
  const button = controls[controls.length - 1]
  assert.equal(key(dialog, button, { key: ' ' }).defaultPrevented, false, 'Space on a button presses it')
  const role = new El('span')
  role.setAttribute('role', 'button')
  body.append(role)
  assert.equal(key(dialog, role, { key: ' ' }).defaultPrevented, false, 'Space on a [role=button] presses it')
  // Space on a link only scrolls (it never follows it): with nothing inside to scroll it would move Vodafone's page.
  assert.equal(key(dialog, controls[0], { key: ' ' }).defaultPrevented, true, 'Space on a link, nothing inside scrolls: held')
  // The body scrolls (overflow auto, 300 px more, at its top): down goes to it, up is held.
  Object.assign(body, { scrollHeight: 900, clientHeight: 600, scrollTop: 0 })
  body.computed.overflowY = 'auto'
  assert.equal(key(dialog, controls[0], { key: ' ' }).defaultPrevented, false, 'Space on a link, the body scrolls down: it takes it')
  assert.equal(dialog.dispatch('wheel', { target: controls[0], deltaY: 100 }).defaultPrevented, false)
  assert.equal(dialog.dispatch('wheel', { target: controls[0], deltaY: -100 }).defaultPrevented, true)
  dialog.dispatch('touchstart', { target: controls[0], touches: [{ clientY: 400 }] })
  assert.equal(dialog.dispatch('touchmove', { target: controls[0], touches: [{ clientY: 300 }] }).defaultPrevented, false, 'a finger moving up scrolls the body down')
  assert.equal(dialog.dispatch('touchmove', { target: controls[0], touches: [{ clientY: 360 }] }).defaultPrevented, true, 'down, at its top: held')
  sheet.close()
  configure()
})

test('a scroller: the view bar\'s height changing on the box\'s style (box.js\'s --aixc-viewbar-h, the trail\'s pill) places the preview again', () => {
  const observers = new Set()
  const saved = globalThis.MutationObserver
  globalThis.MutationObserver = class {
    constructor(callback) {
      this.callback = callback
    }

    observe(target, options) {
      Object.assign(this, { target, options })
      observers.add(this)
    }

    disconnect() {
      observers.delete(this)
    }
  }
  try {
    const { dialog, opener, box, viewbar, root } = setup()
    configure({ scroller: box })
    const sheet = viewDialog(dialog)
    sheet.open(opener)
    assert.equal(dialog.props.get('--vx-sheet-top'), `${177 - root.getBoundingClientRect().top}px`)
    const watching = [...observers].filter((o) => o.target === box && o.options?.attributeFilter?.includes('style'))
    assert.equal(watching.length, 1, 'the box\'s style watched while the preview shows')
    viewbar.rect = { ...viewbar.rect, height: 57 + 40 }
    for (const o of watching) o.callback([])
    assert.equal(dialog.props.get('--vx-sheet-top'), `${177 + 40 - root.getBoundingClientRect().top}px`, 'its top under the taller bar')
    assert.equal(dialog.props.get('--vx-sheet-h'), `${900 - 177 - 40}px`)
    sheet.close()
    assert.equal([...observers].filter((o) => o.target === box).length, 0, 'not watched once closed')
  } finally {
    globalThis.MutationObserver = saved
    configure()
  }
})

test('a scroller: configure() (the shell\'s reset, the guard\'s stop) undoes an open preview; an opener gone inert gets no focus', () => {
  const { dialog, opener, box, stage, viewbar } = setup()
  configure({ scroller: box })
  const sheet = viewDialog(dialog)
  sheet.open(opener)
  configure()
  assert.deepEqual([dialog.open, stage.inert, viewbar.inert, box.style.overflowY, dialog.count()], [false, false, false, '', 0])
  configure({ scroller: box })
  sheet.open(opener)
  opener.inert = true
  sheet.close()
  assert.equal(opener.focused, 0, 'an inert opener is not focused')
  assert.equal(sheet.shown, false)
  configure()
})

test('canvas.js reaches the window only through the seam, adds every handler through on(), opens its preview through viewDialog; its live rules key on the box and its class', async () => {
  const fs = await import('node:fs')
  const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8')
  const source = read('../src/aixc/experiences/canvas.js')
  assert.doesNotMatch(source, /window\.(scrollTo|scrollBy|scrollY|innerHeight|innerWidth|addEventListener|removeEventListener|requestAnimationFrame|cancelAnimationFrame|setTimeout|clearTimeout)/, 'no window scroll, size, listener, frame or timer of its own')
  assert.deepEqual([...source.matchAll(/\.addEventListener\(\s*'([^']+)'/g)].map((match) => match[1]), [], 'every handler through on()')
  assert.doesNotMatch(source, /showModal/, 'the modal dialog only through viewDialog (the clone\'s)')
  assert.match(source, /viewDialog\(dialog/)
  const css = read('../src/aixc/experiences/canvas.css')
  const live = css.split('\n').filter((line) => line.includes('.aixc-box'))
  assert.ok(live.length > 10, 'canvas has live rules')
  for (const line of live) assert.match(line, /^\s*(\[dir='rtl'\] )?\.aixc-box \.aixc-vx--canvas[ ,{.]/, `a live rule keys on the box and the class: ${line.trim()}`)
  for (const measure of ['--aixc-safe-right-h', '--aixc-safe-left-h', '--aixc-safe-right-w', '--aixc-safe-left-w', '--vx-sheet-top', '--vx-sheet-h']) assert.ok(css.includes(measure), `canvas.css reads ${measure}`)
  assert.doesNotMatch(css, /--vx-(top|vh):/, 'canvas never sets --vx-top or --vx-vh')
})
