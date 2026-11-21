/**
 * streaming.js on the seam (voice-guide ADR-0076, phase 4b Phase 4): the window reached only through shared.js, every
 * handler through on(), its preview only through view-dialog.js viewDialog (the clone keeps the browser's modal dialog
 * through it), no font asked of anyone with a scroller (Vodafone's pages: no Roboto, nothing of Google's, AGENTS.md
 * §4.8), and its live rules keyed on the box and its class, with the wordmark in Vodafone's bold face there.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

import { configure } from '../src/aixc/experiences/shared.js'
import { warmStreaming } from '../src/aixc/experiences/streaming.js'
import { fakeScroller, fakeWindow } from './seam-fakes.mjs'

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8')

test('streaming.js reaches the window only through the seam, adds every handler through on(), opens its preview through viewDialog', () => {
  const source = read('../src/aixc/experiences/streaming.js')
  assert.doesNotMatch(source, /window\.(scrollTo|scrollBy|scrollY|innerHeight|addEventListener|removeEventListener|requestAnimationFrame|cancelAnimationFrame|setTimeout|clearTimeout)/, 'no window scroll, listener, frame or timer of its own (its width only sizes the opening)')
  assert.doesNotMatch(source, /(^|[^.\w])(requestAnimationFrame|setTimeout|chromeOffset)\(/m, 'frames and timers through frame() and later(); the view\'s top through viewTop()')
  assert.deepEqual([...source.matchAll(/\.addEventListener\(\s*'([^']+)'/g)].map((match) => match[1]), [], 'every handler through on()')
  assert.doesNotMatch(source, /\.showModal\(\)/, 'the modal dialog only through viewDialog (the clone\'s)')
  assert.match(source, /viewDialog\(modal/)
  assert.match(source, /reveal\(itemId\)/, 'reveal(itemId)')
  assert.match(source, /words\('View service'\)/, 'its words about services through words()')
})

test('with a scroller (Vodafone\'s pages) the wordmark asks no font of anyone; on the clone it asks for Roboto 900 once', async () => {
  const asked = []
  const was = { document: globalThis.document, window: globalThis.window }
  globalThis.window = fakeWindow()
  globalThis.document = { fonts: { load: (font) => (asked.push(font), Promise.resolve([])) } }
  try {
    configure({ scroller: fakeScroller() })
    warmStreaming()
    warmStreaming()
    assert.deepEqual(asked, [], 'nothing asked with a scroller')
    configure()
    warmStreaming()
    warmStreaming()
    assert.deepEqual(asked, ['900 64px Roboto'], 'the clone: Roboto 900, once')
  } finally {
    configure()
    globalThis.document = was.document
    globalThis.window = was.window
  }
})

test('streaming.css: its live rules key on the box and its class, map the wordmark to Vodafone\'s bold face, never set --vx-top or --vx-vh', () => {
  const css = read('../src/aixc/experiences/streaming.css')
  const live = css.split('\n').filter((line) => line.includes('.aixc-box'))
  assert.ok(live.length > 10, 'streaming has live rules')
  for (const line of live) assert.match(line, /^\s*(\[dir='rtl'\] )?\.aixc-box \.aixc-vx--streaming[ ,{.]/, `a live rule keys on the box and the class: ${line.trim()}`)
  const block = css.slice(css.indexOf('/* ------------------------------------------------- in a box'))
  assert.match(block, /--st-logo-font: var\(--pocket-bold, [^)]*\);/, 'the wordmark in --pocket-bold in the box')
  assert.doesNotMatch(block, /Roboto|fonts\.g/i, 'no Roboto and no Google font in the box\'s rules')
  for (const measure of ['--aixc-safe-right-h', '--aixc-safe-left-h', '--aixc-safe-right-w', '--aixc-safe-left-w', '--vx-sheet-top', '--vx-sheet-h']) assert.ok(block.includes(measure), `streaming.css reads ${measure}`)
  assert.doesNotMatch(css, /--vx-(top|vh):/, 'streaming never sets --vx-top or --vx-vh')
  assert.match(block, /\.aixc-box \.aixc-vx--streaming \.st-modal \{[^}]*position: absolute;/, 'the preview positioned in the box, not the top layer')
  assert.doesNotMatch(css, /overscroll-behavior: auto/, 'never overscroll auto')
})
