/**
 * Pocket actors: the mascot and drone state machines, their geometry, the cleanup scope and
 * the asset interface. Time is driven by a fake clock, randomness by a fixed seed, so every
 * threshold is checked exactly. The DOM side is covered by tests/e2e/pocket_e2e.py.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, stat } from 'node:fs/promises'
import { TIMING, seededRandom, pick, withTiming } from '../src/pocket/actors/timing.js'
import { createMascotBrain, MASCOT_STATES, PRIORITY, priorityOf } from '../src/pocket/actors/mascot-brain.js'
import { createDroneBrain } from '../src/pocket/actors/drone-brain.js'
import { createScope } from '../src/pocket/actors/scope.js'
import { MASCOT_CLIPS, EXPRESSION_DEFAULTS, BLINK } from '../src/pocket/actors/clips.js'
import { gazeOffset, smoothToward, curlSide, oppositeSide, heartFlight, samplePath, rect, rectsOverlap, contains, chooseAnchor, planHeart } from '../src/pocket/actors/motion.js'

/* ------------------------------------------------------------------ helpers */

/** A clock whose time only moves when told to; timers fire in order, exactly on time. */
const fakeClock = () => {
  let now = 0
  let seq = 0
  const timers = new Map()
  return {
    now: () => now,
    setTimeout: (fn, ms) => {
      seq += 1
      timers.set(seq, { at: now + Math.max(0, ms), fn })
      return seq
    },
    clearTimeout: (id) => timers.delete(id),
    advance(ms) {
      const end = now + ms
      for (;;) {
        let next = null
        for (const [id, timer] of timers) if (timer.at <= end && (!next || timer.at < next.timer.at)) next = { id, timer }
        if (!next) break
        timers.delete(next.id)
        now = next.timer.at
        next.timer.fn()
      }
      now = end
    },
    get pending() {
      return timers.size
    },
  }
}

const mascotHarness = ({ reduced = false, seed = 42, timing = TIMING } = {}) => {
  const clock = fakeClock()
  const log = []
  const brain = createMascotBrain({ clock, random: seededRandom(seed), timing, reduced: () => reduced, onChange: (state, previous, info) => log.push({ state, previous, info, at: clock.now() }) })
  return { clock, brain, log, states: () => log.map((entry) => entry.state) }
}

/** Opens the pocket and lets the "caught" sequence finish: the mascot rests in its corner. */
const settleInCorner = ({ clock, brain }) => {
  brain.revealStart({ from: 'right' })
  brain.revealProgress(0.7)
  clock.advance(TIMING.startle + TIMING.run + TIMING.recover)
  assert.equal(brain.state, 'corner-idle')
}

/* --------------------------------------------------------- mascot: greeting */

test('greeting: hidden while the corner opens, rises, waves, ducks back, on the brief timeline', () => {
  const { clock, brain } = mascotHarness()
  assert.equal(brain.greet(), 'started')
  clock.advance(219)
  assert.equal(brain.state, 'hidden')
  clock.advance(1) // 220 ms
  assert.equal(brain.state, 'peeking')
  clock.advance(280) // 500 ms
  assert.equal(brain.state, 'waving')
  clock.advance(849) // 1349 ms
  assert.equal(brain.state, 'waving')
  clock.advance(1) // 1350 ms
  assert.equal(brain.state, 'retreating')
  clock.advance(350) // 1700 ms
  assert.equal(brain.state, 'hidden')
  assert.equal(brain.pendingTimers, 0)
})

test('greeting: rapid saves coalesce into one greeting (no overlapping waves)', () => {
  const { clock, brain, states } = mascotHarness()
  brain.greet()
  assert.equal(brain.greet(), 'coalesced') // still waiting to rise
  clock.advance(600)
  assert.equal(brain.greet(), 'coalesced') // mid-wave
  assert.equal(states().filter((state) => state === 'peeking').length, 1)
  clock.advance(800) // retreating now
  assert.equal(brain.state, 'retreating')
  assert.equal(brain.greet(), 'resumed') // another save while ducking: pops back up
  assert.equal(brain.state, 'peeking')
})

test('greeting: opening the pocket mid-wave cuts it short cleanly', () => {
  const { clock, brain, log } = mascotHarness()
  brain.greet()
  clock.advance(700)
  assert.equal(brain.state, 'waving')
  brain.interruptGreeting()
  assert.equal(brain.state, 'retreating')
  assert.equal(log.at(-1).info.quick, true)
  clock.advance(TIMING.quickDuck)
  assert.equal(brain.state, 'hidden')
  // A pending (not yet risen) greeting is simply cancelled.
  brain.greet()
  brain.interruptGreeting()
  clock.advance(1000)
  assert.equal(brain.state, 'hidden')
  assert.equal(brain.pendingTimers, 0)
})

/* --------------------------------------------------------- mascot: page turn */

test('page turn: hidden until ~60% revealed, then startled, runs, recovers, settles in the corner', () => {
  const { clock, brain, log } = mascotHarness()
  brain.revealStart({ from: 'right' })
  assert.equal(brain.state, 'page-reveal-hidden')
  assert.equal(brain.context, 'pocket')
  brain.revealProgress(0.4)
  brain.revealProgress(0.59)
  assert.equal(brain.state, 'page-reveal-hidden')
  brain.revealProgress(0.6)
  assert.equal(brain.state, 'startled')
  assert.equal(log.at(-1).info.side, 'right')
  clock.advance(TIMING.startle)
  assert.equal(brain.state, 'running')
  clock.advance(TIMING.run)
  assert.equal(brain.state, 'recovering')
  clock.advance(TIMING.recover)
  assert.equal(brain.state, 'corner-idle')
  assert.ok(TIMING.run >= 550 && TIMING.run <= 750, 'run lasts 550-750 ms')
  assert.ok(TIMING.revealAt >= 0.55 && TIMING.revealAt <= 0.7, 'reveal at 55-70%')
})

test('page turn: if the turn ends before the threshold is reported, the reveal still happens', () => {
  const { brain } = mascotHarness()
  brain.revealStart()
  brain.revealComplete()
  assert.equal(brain.state, 'startled')
  brain.revealComplete() // idempotent
  assert.equal(brain.state, 'startled')
})

test('closing cancels everything and resets to hidden; reopening starts clean', () => {
  const { clock, brain, states } = mascotHarness()
  settleInCorner({ clock, brain })
  brain.cardEnter('pointer')
  assert.equal(brain.state, 'jumping')
  brain.closeStart()
  assert.equal(brain.state, 'closing')
  clock.advance(TIMING.closeDuck)
  assert.equal(brain.state, 'hidden')
  brain.closeComplete()
  assert.equal(brain.context, 'page')
  assert.equal(brain.pendingTimers, 0)
  clock.advance(60000) // nothing left to fire
  assert.equal(brain.state, 'hidden')
  const before = states().length
  brain.revealStart()
  assert.equal(brain.state, 'page-reveal-hidden')
  assert.equal(states().length, before + 1)
})

test('closing while still caught (mid-run) goes straight to hidden', () => {
  const { clock, brain } = mascotHarness()
  brain.revealStart()
  brain.revealProgress(0.65)
  clock.advance(TIMING.startle + 100)
  assert.equal(brain.state, 'running')
  brain.closeStart()
  assert.equal(brain.state, 'closing')
  brain.closeComplete()
  assert.equal(brain.state, 'hidden')
  assert.equal(brain.pendingTimers, 0)
})

/* ------------------------------------------------------- mascot: idle ladder */

test('idle ladder: impatient at exactly 2 s, apple and sleep inside their seeded bounds', () => {
  const { clock, brain } = mascotHarness({ seed: 7 })
  settleInCorner({ clock, brain })
  const { eatAt, sleepAt } = brain.thresholds
  assert.ok(eatAt >= 8000 && eatAt <= 12000, `eatAt ${eatAt}`)
  assert.ok(sleepAt >= 18000 && sleepAt <= 28000, `sleepAt ${sleepAt}`)
  clock.advance(1999)
  assert.notEqual(brain.state, 'impatient')
  clock.advance(1)
  assert.equal(brain.state, 'impatient')
  clock.advance(TIMING.impatient)
  assert.ok(['corner-idle', 'glancing'].includes(brain.state))
  clock.advance(eatAt - 2000 - TIMING.impatient - 1)
  assert.notEqual(brain.state, 'eating')
  clock.advance(1)
  assert.equal(brain.state, 'eating')
  clock.advance(sleepAt - eatAt - 1)
  assert.notEqual(brain.state, 'yawning')
  clock.advance(1)
  assert.equal(brain.state, 'yawning')
  clock.advance(TIMING.yawn)
  assert.equal(brain.state, 'sleeping')
})

test('idle ladder: test overrides make every threshold exact and deterministic', () => {
  const timing = withTiming({ eatAt: 3000, sleepAt: 5000, eat: 800, impatient: 600 })
  const { clock, brain } = mascotHarness({ timing })
  settleInCorner({ clock, brain })
  clock.advance(2000)
  assert.equal(brain.state, 'impatient')
  clock.advance(1000)
  assert.equal(brain.state, 'eating')
  clock.advance(2000)
  assert.equal(brain.state, 'yawning')
})

test('activity resets the ladder from zero and interrupts idle business gently', () => {
  const { clock, brain } = mascotHarness()
  settleInCorner({ clock, brain })
  clock.advance(2100)
  assert.equal(brain.state, 'impatient')
  clock.advance(900) // 3000 ms
  brain.activity()
  assert.equal(brain.state, 'corner-idle')
  clock.advance(1999)
  assert.notEqual(brain.state, 'impatient')
  clock.advance(1)
  assert.equal(brain.state, 'impatient')
})

test('activity wakes a sleeping mascot, which then restarts the ladder', () => {
  const timing = withTiming({ eatAt: 3000, sleepAt: 4000, eat: 500, impatient: 500 })
  const { clock, brain } = mascotHarness({ timing })
  settleInCorner({ clock, brain })
  clock.advance(4000 + timing.yawn)
  assert.equal(brain.state, 'sleeping')
  brain.activity()
  assert.equal(brain.state, 'waking')
  brain.activity() // more input while waking does not restart it
  assert.equal(brain.state, 'waking')
  clock.advance(timing.wake)
  assert.equal(brain.state, 'corner-idle')
  clock.advance(2000)
  assert.equal(brain.state, 'impatient')
})

/* ----------------------------------------------------- mascot: reactions */

test('card hover jumps once; repeated crossings inside the debounce are ignored', () => {
  const { clock, brain } = mascotHarness()
  settleInCorner({ clock, brain })
  assert.equal(brain.cardEnter('pointer'), true)
  assert.equal(brain.state, 'jumping')
  assert.equal(brain.cardEnter('pointer'), false)
  clock.advance(TIMING.jump)
  assert.equal(brain.state, 'corner-idle')
  assert.ok(TIMING.jump >= 420 && TIMING.jump <= 560)
  clock.advance(TIMING.cardDebounce - TIMING.jump - 1)
  assert.equal(brain.cardEnter('pointer'), false)
  clock.advance(1)
  assert.equal(brain.cardEnter('pointer'), true)
})

test('keyboard focus and touch get the reduced reaction (no jump)', () => {
  const { clock, brain } = mascotHarness()
  settleInCorner({ clock, brain })
  assert.equal(brain.cardEnter('keyboard'), true)
  assert.equal(brain.state, 'beaming')
  clock.advance(TIMING.cardDebounce)
  assert.equal(brain.cardEnter('touch'), true)
  assert.equal(brain.state, 'beaming')
})

test('priority: page transitions outrank reactions, reactions outrank idle, idle outranks ambient', () => {
  assert.ok(priorityOf('running') < priorityOf('tucked'))
  assert.ok(priorityOf('tucked') < priorityOf('jumping'))
  assert.ok(priorityOf('jumping') < priorityOf('eating'))
  assert.ok(priorityOf('eating') < priorityOf('glancing'))
  assert.ok(priorityOf('glancing') < priorityOf('corner-idle'))
  for (const [state, level] of Object.entries(MASCOT_STATES)) assert.ok(level in PRIORITY, state)

  const { clock, brain } = mascotHarness()
  brain.revealStart()
  brain.revealProgress(0.7)
  clock.advance(TIMING.startle)
  assert.equal(brain.state, 'running')
  assert.equal(brain.cardEnter('pointer'), false) // no jumping mid-sprint
  brain.activity()
  assert.equal(brain.state, 'running')
  brain.setTucked(true) // content in the corner: decided once it has landed
  assert.equal(brain.state, 'running')
  clock.advance(TIMING.run + TIMING.recover)
  assert.equal(brain.state, 'tucked')
  assert.equal(brain.cardEnter('pointer'), false) // tucked away: no pop-up over content
  brain.setTucked(false)
  assert.equal(brain.state, 'corner-idle')
})

test('glances: only from corner-idle, every 6-10 s, identical for identical seeds', () => {
  const run = (seed) => {
    const { clock, brain, log } = mascotHarness({ seed, timing: withTiming({ impatientAt: 1e9, eatAt: 1e9, sleepAt: 1e9 }) })
    settleInCorner({ clock, brain })
    const start = clock.now()
    clock.advance(60000)
    return log.filter((entry) => entry.state === 'glancing').map((entry) => entry.at - start)
  }
  const a = run(3)
  assert.deepEqual(a, run(3))
  assert.notDeepEqual(a, run(4))
  assert.ok(a.length >= 5, `${a.length} glances in a minute`)
  const glanceLength = TIMING.glance.reduce((sum, part) => sum + part, 0)
  let previous = 0
  for (const at of a) {
    const gap = at - previous
    assert.ok(gap >= 6000 && gap <= 10000 + glanceLength, `gap ${gap}`)
    previous = at
  }
})

test('pick draws inside its range and is repeatable for a seed', () => {
  const r1 = seededRandom(9)
  const r2 = seededRandom(9)
  for (let index = 0; index < 200; index += 1) {
    const value = pick([6000, 10000], r1)
    assert.equal(value, pick([6000, 10000], r2))
    assert.ok(value >= 6000 && value < 10000)
  }
  assert.equal(pick(2000, r1), 2000)
})

/* ------------------------------------------------- mascot: reduced motion etc. */

test('reduced motion: no greeting, no journey, no ladder; the corner pose is immediate', () => {
  const { clock, brain, log } = mascotHarness({ reduced: true })
  assert.equal(brain.greet(), 'skipped')
  brain.revealStart()
  assert.equal(brain.state, 'corner-idle')
  assert.equal(log.at(-1).info.instant, true)
  assert.equal(brain.pendingTimers, 0)
  assert.equal(brain.cardEnter('pointer'), false)
  brain.activity()
  clock.advance(60000)
  assert.equal(brain.state, 'corner-idle')
  assert.equal(log.filter((entry) => entry.state !== 'corner-idle').length, 0)
  brain.closeStart()
  assert.equal(brain.state, 'hidden')
})

test('hidden document: transient work settles at once and nothing stale replays', () => {
  const { clock, brain, log } = mascotHarness()
  brain.revealStart()
  brain.revealProgress(0.7)
  clock.advance(TIMING.startle + 50)
  assert.equal(brain.state, 'running')
  brain.suspend()
  assert.equal(brain.state, 'corner-idle')
  assert.equal(log.at(-1).info.instant, true)
  assert.equal(brain.pendingTimers, 0)
  clock.advance(5000)
  assert.equal(brain.state, 'corner-idle') // no recovering/impatient while hidden
  brain.resume()
  clock.advance(2000)
  assert.equal(brain.state, 'impatient') // ladder restarted from zero on return
  // A greeting in progress on the page simply ends.
  const page = mascotHarness()
  page.brain.greet()
  page.clock.advance(600)
  page.brain.suspend()
  assert.equal(page.brain.state, 'hidden')
  assert.equal(page.brain.greet(), 'skipped')
})

test('destroy leaves no timers behind', () => {
  const { clock, brain } = mascotHarness()
  settleInCorner({ clock, brain })
  assert.ok(brain.pendingTimers > 0)
  brain.destroy()
  assert.equal(brain.pendingTimers, 0)
  assert.equal(clock.pending, 0)
})

/* ------------------------------------------------------------------ drone */

const droneHarness = ({ reduced = false } = {}) => {
  const clock = fakeClock()
  const log = []
  const brain = createDroneBrain({ clock, reduced: () => reduced, onChange: (state, previous, info) => log.push({ state, previous, info }) })
  return { clock, brain, log }
}

test('drone: one heart per opening, then home', () => {
  const { clock, brain, log } = droneHarness()
  brain.open()
  assert.equal(brain.state, 'entering')
  brain.revealed()
  assert.equal(brain.state, 'drawing-heart')
  assert.ok(TIMING.droneHeart >= 1300 && TIMING.droneHeart <= 1800)
  clock.advance(TIMING.droneHeart)
  assert.equal(brain.state, 'returning-home')
  clock.advance(TIMING.droneReturn)
  assert.equal(brain.state, 'home-hover')
  brain.revealed() // a second "revealed" (focus restore, resize) never redraws
  assert.equal(log.filter((entry) => entry.state === 'drawing-heart').length, 1)
  brain.close()
  brain.closeComplete()
  brain.open()
  brain.revealed()
  assert.equal(log.filter((entry) => entry.state === 'drawing-heart').length, 2)
})

test('drone: no room for the heart means it just hovers home', () => {
  const { brain } = droneHarness()
  brain.open()
  brain.revealed({ withHeart: false })
  assert.equal(brain.state, 'home-hover')
})

test('drone: dragging is impossible while entering or drawing the heart', () => {
  const { brain } = droneHarness()
  brain.open()
  assert.equal(brain.pointerDown(0, 0), false)
  brain.revealed()
  assert.equal(brain.pointerDown(0, 0), false)
  assert.equal(brain.pointerMove(50, 50), false)
  assert.equal(brain.state, 'drawing-heart')
})

test('drone: a small movement is a click, past the threshold it is a drag; release springs home', () => {
  const { clock, brain } = droneHarness()
  brain.open()
  brain.revealed({ withHeart: false })
  assert.equal(brain.pointerDown(100, 100), true)
  assert.equal(brain.pointerMove(103, 102), false)
  assert.equal(brain.state, 'home-hover')
  assert.equal(brain.pointerUp(), false) // a click: the caller pokes instead
  brain.pointerDown(100, 100)
  assert.equal(brain.pointerMove(100 + TIMING.droneDragThreshold, 100), true)
  assert.equal(brain.state, 'dragging')
  assert.equal(brain.pointerUp(), true)
  assert.equal(brain.state, 'returning-home')
  clock.advance(TIMING.droneSpringBack)
  assert.equal(brain.state, 'home-hover')
})

test('drone: pointer cancel, Escape and relayout all bring it home; Escape at home is not consumed', () => {
  const { clock, brain, log } = droneHarness()
  brain.open()
  brain.revealed({ withHeart: false })
  for (const end of ['cancel', 'escape', 'relayout']) {
    brain.pointerDown(0, 0)
    brain.pointerMove(30, 30)
    assert.equal(brain.state, 'dragging')
    if (end === 'cancel') brain.pointerCancel()
    if (end === 'escape') assert.equal(brain.escape(), true)
    if (end === 'relayout') brain.relayout()
    assert.equal(brain.state, 'returning-home')
    assert.equal(log.at(-1).info.cause, end)
    clock.advance(TIMING.droneSpringBack)
    assert.equal(brain.state, 'home-hover')
  }
  assert.equal(brain.escape(), false) // lets the pocket's own Escape (close) happen
})

test('drone: hover dodges once per entry and is throttled; drag interrupts a dodge', () => {
  const { clock, brain } = droneHarness()
  brain.open()
  brain.revealed({ withHeart: false })
  assert.equal(brain.hoverEnter(), true)
  assert.equal(brain.state, 'evading')
  assert.equal(brain.hoverEnter(), false) // still inside: no repeat
  clock.advance(TIMING.droneEvade)
  assert.equal(brain.state, 'home-hover')
  brain.hoverLeave()
  assert.equal(brain.hoverEnter(), false) // re-entered inside the cooldown
  brain.hoverLeave()
  clock.advance(TIMING.droneEvadeCooldown)
  assert.equal(brain.hoverEnter(), true)
  brain.pointerDown(0, 0)
  brain.pointerMove(20, 0)
  assert.equal(brain.state, 'dragging')
})

test('drone: click, tap, Enter or Space pokes it (the single-pointer alternative)', () => {
  const { clock, brain } = droneHarness()
  brain.open()
  brain.revealed({ withHeart: false })
  assert.equal(brain.poke(), true)
  assert.equal(brain.state, 'evading')
  clock.advance(TIMING.droneEvade)
  clock.advance(TIMING.dronePokeCooldown)
  assert.equal(brain.poke(), true)
})

test('drone: reduced motion rests at home with nothing to perform', () => {
  const { brain, log } = droneHarness({ reduced: true })
  brain.open()
  assert.equal(brain.state, 'home-hover')
  assert.equal(log.at(-1).info.instant, true)
  brain.revealed()
  assert.equal(brain.state, 'home-hover')
  assert.equal(brain.poke(), false)
  assert.equal(brain.hoverEnter(), false)
  assert.equal(brain.pointerDown(0, 0), false)
})

test('drone: closing mid-flight cancels it and leaves no timers', () => {
  const { clock, brain } = droneHarness()
  brain.open()
  brain.revealed()
  clock.advance(400)
  brain.close()
  assert.equal(brain.state, 'closing')
  brain.closeComplete()
  assert.equal(brain.state, 'hidden')
  assert.equal(brain.pendingTimers, 0)
  assert.equal(clock.pending, 0)
})

/* --------------------------------------------------------------- geometry */

test('gaze stays inside the socket, rests centred in the dead zone, points at the pointer', () => {
  const max = 7
  assert.deepEqual(gazeOffset(5, -3, { max }), { x: 0, y: 0 })
  const random = seededRandom(11)
  for (let index = 0; index < 500; index += 1) {
    const dx = (random() - 0.5) * 4000
    const dy = (random() - 0.5) * 4000
    const { x, y } = gazeOffset(dx, dy, { max })
    assert.ok(Math.hypot(x, y) <= max + 1e-9)
    if (Math.hypot(dx, dy) > 30) assert.ok(x * dx + y * dy > 0, 'points toward the pointer')
  }
  const far = gazeOffset(1000, 0, { max })
  assert.ok(Math.abs(far.x - max) < 1e-9 && far.y === 0)
})

test('low-pass smoothing converges without overshoot and ignores zero time', () => {
  let value = 0
  for (let frame = 0; frame < 60; frame += 1) {
    const next = smoothToward(value, 10, 16)
    assert.ok(next >= value && next <= 10)
    value = next
  }
  assert.ok(10 - value < 0.01)
  assert.equal(smoothToward(3, 10, 0), 3)
})

test('the opposite corner is computed from the curl direction, not hard-coded', () => {
  const peek = (38 * Math.PI) / 180
  assert.equal(curlSide(peek), 'right')
  assert.equal(oppositeSide(curlSide(peek)), 'left')
  assert.equal(curlSide(Math.PI - peek), 'left') // a mirrored (RTL) curl
  assert.equal(oppositeSide(curlSide(Math.PI - peek)), 'right')
})

test('heart flight: leaves home, draws the heart inside its box, comes home', () => {
  const home = { x: 600, y: 120 }
  const box = { x: 420, y: 70, w: 120, h: 108 }
  const flight = heartFlight({ home, box })
  const start = samplePath(flight, 0)
  const end = samplePath(flight, 1)
  assert.ok(Math.hypot(start.x - home.x, start.y - home.y) < 1e-6)
  assert.ok(Math.hypot(end.x - home.x, end.y - home.y) < 1e-6)
  assert.ok(flight.length > 2 * (box.w + box.h))
  const inside = flight.points.filter((p) => p.x >= box.x - 2 && p.x <= box.x + box.w + 2 && p.y >= box.y - 2 && p.y <= box.y + box.h + 2)
  assert.ok(inside.length >= 90, 'the heart itself stays in its box')
  for (let index = 0; index <= 50; index += 1) assert.ok(Number.isFinite(samplePath(flight, index / 50).angle))
  assert.match(flight.d, /^M[\d.]+ [\d.]+C/)
})

test('anchors: first clear candidate wins, null when everything collides', () => {
  const bounds = rect(0, 0, 1000, 400)
  const title = rect(80, 100, 500, 60)
  const candidates = [
    { name: 'blocked', rect: rect(500, 110, 90, 60) },
    { name: 'outside', rect: rect(960, 10, 90, 60) },
    { name: 'clear', rect: rect(850, 110, 90, 60) },
  ]
  assert.equal(chooseAnchor({ candidates, obstacles: [title], bounds }).name, 'clear')
  assert.equal(chooseAnchor({ candidates: candidates.slice(0, 2), obstacles: [title], bounds }), null)
  assert.ok(rectsOverlap(rect(0, 0, 10, 10), rect(14, 0, 10, 10), 5))
  assert.ok(!rectsOverlap(rect(0, 0, 10, 10), rect(14, 0, 10, 10), 3))
})

test('heart plan: the drone never brushes content anywhere along the flight, or there is no heart', () => {
  const drone = { w: 96, h: 67 }
  const home = rect(1187, 218, drone.w, drone.h)
  const sky = { top: 112, bottom: 320 }
  const bounds = rect(8, 108, 1424, 220)
  const title = rect(150, 210, 510, 74)
  const emptyPocket = rect(1196, 135, 87, 40)
  const card = rect(1030, 328, 260, 300)
  const plan = planHeart({ home, band: sky, obstacles: [title, emptyPocket, card], bounds, drone })
  assert.ok(plan, 'a heart fits in the open canvas')
  assert.ok(plan.box.x + plan.box.w <= home.left && plan.box.w >= 64 && plan.box.w <= 132)
  for (const point of plan.flight.points) {
    const footprint = rect(point.x - drone.w / 2, point.y - drone.h / 2, drone.w, drone.h)
    assert.ok(contains(bounds, footprint))
    for (const obstacle of [title, emptyPocket, card]) assert.ok(!rectsOverlap(footprint, obstacle), 'clear of content')
  }
  // Squeeze the canvas until no heart fits: the plan is dropped rather than covering content.
  assert.equal(planHeart({ home, band: { top: 200, bottom: 300 }, obstacles: [rect(150, 180, 1000, 80)], bounds, drone }), null)
})

/* ------------------------------------------------------------------ scope */

test('scope: one dispose releases listeners, timers, frames, observers and animations', () => {
  const clock = fakeClock()
  const frames = new Map()
  let frameSeq = 0
  const scope = createScope({ clock, frames: { request: (fn) => (frames.set(++frameSeq, fn), frameSeq), cancel: (id) => frames.delete(id) } })
  const target = new EventTarget()
  let heard = 0
  scope.on(target, 'ping', () => (heard += 1))
  let fired = 0
  scope.timeout(() => (fired += 1), 100)
  scope.frame(() => (fired += 1))
  let disconnected = 0
  scope.observe({ disconnect: () => (disconnected += 1) })
  let cancelled = 0
  scope.animation({ cancel: () => (cancelled += 1), finished: new Promise(() => {}) })
  let deferred = 0
  scope.defer(() => (deferred += 1))
  target.dispatchEvent(new Event('ping'))
  assert.equal(heard, 1)
  assert.deepEqual(scope.live, { timers: 1, frames: 1, observers: 1, animations: 1, cleanups: 1 })
  scope.dispose()
  assert.deepEqual(scope.live, { timers: 0, frames: 0, observers: 0, animations: 0, cleanups: 0 })
  assert.equal(clock.pending, 0)
  assert.equal(frames.size, 0)
  assert.equal(disconnected, 1)
  assert.equal(cancelled, 1)
  assert.equal(deferred, 1)
  target.dispatchEvent(new Event('ping'))
  clock.advance(1000)
  assert.equal(heard, 1)
  assert.equal(fired, 0)
  assert.equal(scope.timeout(() => {}, 10), null) // nothing new after dispose
})

/* ------------------------------------------------------------- the assets */

const assetUrl = (name) => new URL(`../src/pocket/actors/assets/${name}`, import.meta.url)
const partsIn = (svg) => new Set([...svg.matchAll(/data-part="([^"]+)"/g)].map((match) => match[1]))

test('asset interface: every part named by the manifest and the clips exists in the rigs', async () => {
  const manifest = JSON.parse(await readFile(assetUrl('manifest.json'), 'utf8'))
  const mascot = partsIn(await readFile(assetUrl('mascot.svg'), 'utf8'))
  const drone = partsIn(await readFile(assetUrl('drone.svg'), 'utf8'))
  for (const part of Object.keys(manifest.assets.mascot.parts)) assert.ok(mascot.has(part), `mascot part ${part}`)
  for (const part of Object.keys(manifest.assets.drone.parts)) assert.ok(drone.has(part), `drone part ${part}`)
  // The brief's minimum: separately controllable eye/pupil, eyelid, body, arms, legs, mouth, apple, sleep.
  for (const part of ['eye', 'iris', 'lid', 'body', 'arm-l', 'arm-r', 'leg-l', 'leg-r', 'mouth', 'apple', 'zzz']) assert.ok(mascot.has(part), part)
  const mascotSvg = await readFile(assetUrl('mascot.svg'), 'utf8')
  for (const shape of manifest.assets.mascot.expressions.mouth) assert.match(mascotSvg, new RegExp(`data-mouth-shape="${shape}"`))
  for (const name of Object.keys(MASCOT_CLIPS)) assert.ok(manifest.assets.mascot.clips.includes(name), `clip ${name} in manifest`)
})

test('clips: well-formed keyframes on parts that exist, expressions from the known set', async () => {
  const mascot = partsIn(await readFile(assetUrl('mascot.svg'), 'utf8'))
  const params = { duration: 600, look: 200, from: { x: -40, y: -30 }, to: { x: -40, y: -30 }, originX: 900, endX: -14, hideY: 110, dir: -1, phases: TIMING.glance }
  for (const [name, make] of Object.entries(MASCOT_CLIPS)) {
    const clip = make(params)
    for (const key of Object.keys(clip.expression ?? {})) assert.ok(key in EXPRESSION_DEFAULTS, `${name}: expression ${key}`)
    for (const track of clip.tracks ?? []) {
      if (track.part) assert.ok(track.part === 'mover' || track.part === 'facing' || mascot.has(track.part), `${name}: part ${track.part}`)
      assert.ok(track.keyframes.length >= 1, `${name}: keyframes`)
      let last = -1
      for (const frame of track.keyframes) {
        if (frame.offset === undefined) continue
        assert.ok(frame.offset >= 0 && frame.offset <= 1 && frame.offset >= last, `${name}: offsets ascend`)
        last = frame.offset
      }
    }
    for (const [at] of clip.beats ?? []) assert.ok(at >= 0 && at <= params.duration, `${name}: beat inside the clip`)
  }
  assert.ok(BLINK.every((frame) => frame.offset > 0 && frame.offset < 1), 'blink starts and ends at the resting lid')
})

test('budget: the whole actor layer (assets, JS, CSS) stays well under 250 KB', async () => {
  const files = [
    '../src/pocket/actors/assets/mascot.svg',
    '../src/pocket/actors/assets/drone.svg',
    '../src/pocket/actors/timing.js',
    '../src/pocket/actors/mascot-brain.js',
    '../src/pocket/actors/drone-brain.js',
    '../src/pocket/actors/motion.js',
    '../src/pocket/actors/clips.js',
    '../src/pocket/actors/scope.js',
    '../src/pocket/pocket-actors.js',
    '../src/pocket/pocket-actors.css',
  ]
  let total = 0
  for (const file of files) total += (await stat(new URL(file, import.meta.url))).size
  assert.ok(total < 250 * 1024, `${(total / 1024).toFixed(1)} KB uncompressed`)
})
