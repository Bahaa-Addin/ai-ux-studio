// Tips (src/tips, voice-guide ADR-0045): the collection's order and rules, the coach marks'
// geometry, and the Arabic copy for every English string the tips show.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { CARDS, FEATURES, STORE_KEY, TIP_COUNT, defaultState, featureAvailable, firstTipOf, readState, startAction, tipPosition, unavailableReason, writeState } from '../src/tips/catalog.js'
import { mergeHoles, overlaps, placePopover, scrimPath } from '../src/tips/geometry.js'

const memory = (initial = {}) => {
  const data = { ...initial }
  return { getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => (data[k] = String(v)), data }
}
const params = (query = '') => new URLSearchParams(query)

test('a cover, two tips for each of the four demos in order, a closing card', () => {
  assert.equal(CARDS[0].kind, 'cover')
  assert.equal(CARDS.at(-1).kind, 'finale')
  assert.equal(TIP_COUNT, 8)
  assert.deepEqual(
    CARDS.filter((c) => c.kind === 'tip').map((c) => c.feature),
    ['voice', 'voice', 'pocket', 'pocket', 'reimagine', 'reimagine', 'journey', 'journey'],
  )
  assert.deepEqual(FEATURES.map((f) => f.id), ['voice', 'pocket', 'reimagine', 'journey'])
  assert.equal(new Set(CARDS.map((c) => c.id)).size, CARDS.length)
  for (const card of CARDS) {
    assert.ok(card.title && card.body, card.id)
    if (card.kind !== 'finale') assert.ok(card.scene, card.id)
  }
})

test('where a tip sits within its demo', () => {
  assert.equal(tipPosition(0), null)
  assert.deepEqual(tipPosition(1), { feature: 'voice', n: 1, of: 2 })
  assert.deepEqual(tipPosition(4), { feature: 'pocket', n: 2, of: 2 })
  assert.equal(firstTipOf('reimagine'), 5)
})

test('a demo can be tried only when it is on the page', () => {
  const clone = { pocket: true, composer: true, guide: false, trail: false }
  assert.equal(featureAvailable('pocket', clone), true)
  assert.equal(featureAvailable('reimagine', clone), true)
  assert.equal(featureAvailable('voice', clone), false)
  assert.equal(featureAvailable('journey', clone), false)
  assert.equal(featureAvailable('journey', { ...clone, guide: true, trail: true }), true)
  assert.equal(featureAvailable('nope', clone), false)
  assert.match(unavailableReason('voice'), /voice guide isn’t running/)
  assert.match(unavailableReason('journey'), /needs the voice guide/)
})

test('saved state: read back, versioned, and anything odd starts fresh', () => {
  const store = memory()
  assert.deepEqual(readState(store), defaultState())
  const state = { ...defaultState(), seen: true, tried: { pocket: true }, at: 4 }
  assert.equal(writeState(store, state), true)
  assert.deepEqual(readState(store), state)
  assert.deepEqual(readState(memory({ [STORE_KEY]: '{not json' })), defaultState())
  assert.deepEqual(readState(memory({ [STORE_KEY]: JSON.stringify({ v: 99, seen: true }) })), defaultState())
  const odd = readState(memory({ [STORE_KEY]: JSON.stringify({ v: 1, seen: 'yes', tried: { pocket: 1, voice: true, hack: true }, at: 99 }) }))
  assert.deepEqual(odd, { v: 1, seen: false, invited: false, tried: { voice: true }, at: 0 })
  const throwing = { getItem: () => { throw new Error('denied') }, setItem: () => { throw new Error('denied') } }
  assert.deepEqual(readState(throwing), defaultState())
  assert.equal(writeState(throwing, state), false)
  assert.deepEqual(readState(null), defaultState())
})

test('first visit: an invitation once; automation is never interrupted; the URL overrides', () => {
  const fresh = defaultState()
  assert.equal(startAction({ state: fresh, params: params() }), 'invite')
  assert.equal(startAction({ state: { ...fresh, invited: true }, params: params() }), 'none')
  assert.equal(startAction({ state: { ...fresh, seen: true }, params: params() }), 'none')
  assert.equal(startAction({ state: fresh, params: params(), automated: true }), 'none')
  assert.equal(startAction({ state: { ...fresh, seen: true }, params: params('tips=open'), automated: true }), 'open')
  assert.equal(startAction({ state: { ...fresh, seen: true }, params: params('tips=invite') }), 'invite')
  assert.equal(startAction({ state: fresh, params: params('tips=off') }), 'none')
})

test('a popover beside its control: preferred side, inside the screen, clear of other controls', () => {
  const viewport = { width: 1366, height: 900 }
  const pop = { width: 320, height: 150 }
  // The microphone (runbook §5a): to its left, the arrow at its middle.
  const mic = { left: 1287, top: 743, width: 64, height: 64 }
  const left = placePopover(mic, pop, viewport, { prefer: ['left', 'top'] })
  assert.equal(left.side, 'left')
  assert.equal(left.x + pop.width, mic.left - 14)
  assert.ok(left.y >= 12 && left.y + pop.height <= viewport.height - 12)
  assert.equal(left.y + left.arrow, mic.top + mic.height / 2)
  // The launcher under the header: below it, kept inside the right edge.
  const launcher = { left: 1143, top: 172, width: 207, height: 52 }
  const below = placePopover(launcher, pop, viewport, { prefer: ['bottom', 'left'] })
  assert.equal(below.side, 'bottom')
  assert.equal(below.x, viewport.width - 12 - pop.width)
  assert.equal(below.y, launcher.top + launcher.height + 14)
  // Something in the way on the preferred side: the next side that is clear.
  const blocker = { left: 1000, top: 280, width: 360, height: 200 }
  const around = placePopover(launcher, pop, viewport, { prefer: ['bottom', 'left'], avoid: [blocker] })
  assert.equal(around.side, 'left')
  assert.ok(!overlaps({ left: around.x, top: around.y, width: pop.width, height: pop.height }, blocker))
  // The journey pill sits over a wider launcher (runbook §5a): beside the pill, moved out past the launcher.
  const pill = { left: 1165, top: 112, width: 185, height: 44 }
  const wider = { left: 1136, top: 166, width: 220, height: 64 }
  const tall = { width: 320, height: 181 }
  const clear = placePopover(pill, tall, viewport, { prefer: ['bottom', 'left', 'top'], avoid: [wider] })
  assert.equal(clear.side, 'left')
  assert.equal(clear.x + tall.width, wider.left - 14)
  assert.ok(!overlaps({ left: clear.x, top: clear.y, width: tall.width, height: tall.height }, wider))
  // No room anywhere it was asked: the side with the most room.
  const tiny = { width: 360, height: 200 }
  const anywhere = placePopover({ left: 150, top: 80, width: 60, height: 40 }, pop, tiny, { prefer: ['top'] })
  assert.equal(anywhere.side, 'left') // 138px of room beside it, 68px above and below
})

test('the scrim: the screen with holes; touching holes merge so nothing is painted twice', () => {
  const vp = { width: 100, height: 80 }
  assert.equal(scrimPath(vp), 'M0,0H100V80H0Z')
  const one = scrimPath(vp, [{ left: 10, top: 10, width: 20, height: 20, radius: 4 }])
  assert.match(one, /^M0,0H100V80H0ZM14,10H26A4,4/)
  const merged = mergeHoles([
    { left: 10, top: 10, width: 20, height: 20 },
    { left: 25, top: 15, width: 20, height: 20 },
    { left: 70, top: 50, width: 10, height: 10 },
  ])
  assert.equal(merged.length, 2)
  assert.deepEqual({ ...merged[0], radius: undefined }, { left: 10, top: 10, width: 35, height: 25, radius: undefined })
})

test('every string the tips show has its Arabic', async () => {
  globalThis.document = { documentElement: { lang: 'ar' } }
  const { t } = await import(`../src/i18n.js?ar=${Date.now()}`)
  delete globalThis.document
  const strings = new Set()
  for (const card of CARDS) strings.add(card.title).add(card.body)
  for (const feature of FEATURES) strings.add(feature.name)
  strings.add(unavailableReason('voice')).add(unavailableReason('journey'))
  // Every literal passed to t(...) in the tips' code.
  for (const file of ['entry.js', 'tips.js', 'coach.js', 'scenes.js']) {
    const source = readFileSync(new URL(`../src/tips/${file}`, import.meta.url), 'utf8')
    for (const match of source.matchAll(/\bt\(\s*'((?:[^'\\]|\\.)*)'/g)) strings.add(match[1])
    // Scene labels passed through ctx.t(name) from small lists.
    for (const match of source.matchAll(/\[('(?:[^']+)'(?:,\s*'[^']+')+)\]\.map\(\(name/g)) for (const name of match[1].matchAll(/'([^']+)'/g)) strings.add(name[1])
  }
  const missing = [...strings].filter((s) => t(s) === s)
  assert.deepEqual(missing, [])
  assert.ok(strings.size > 60, `found ${strings.size} strings`)
})
