/**
 * Pocket actors: the mascot and drone state machines, the motion physics (springs, the ride,
 * the drone's flight), the 3D models and their projection, the pose animator, the flight
 * geometry, the cleanup scope and the asset interface. Time is driven by a fake clock,
 * randomness by a fixed seed, so every threshold is checked exactly. The DOM side is covered
 * by tests/e2e/pocket_e2e.py.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, stat } from 'node:fs/promises'
import { TIMING, seededRandom, pick, withTiming } from '../src/pocket/actors/timing.js'
import { createMascotBrain, MASCOT_STATES, PRIORITY, priorityOf } from '../src/pocket/actors/mascot-brain.js'
import { createDroneBrain, DRONE_STATES, DRONE_WATCHED, DRONE_GROUNDED } from '../src/pocket/actors/drone-brain.js'
import { createScope } from '../src/pocket/actors/scope.js'
import { MASCOT_CLIPS, EXPRESSION_DEFAULTS, TRACK_LAG, createPoseAnimator } from '../src/pocket/actors/clips.js'
import { createCamera, orientation, apply, rotateY, projectEllipsoid, capsulePath, convexHull, v3, dot, length } from '../src/pocket/actors/space.js'
import { mascotFrame, restPose, POSE_KEYS, reachToward, holdRemote, remoteGrip, REMOTE, BOARD } from '../src/pocket/actors/mascot-model.js'
import { droneFrame } from '../src/pocket/actors/drone-model.js'
import { gazeOffset, smoothToward, curlSide, oppositeSide, heartFlight, samplePath, sampleFlight, rect, rectsOverlap, contains, chooseAnchor, planHeart, fitAffine } from '../src/pocket/actors/motion.js'
import { bladeAngle, flipbookKeys } from '../src/pocket/actors/renderer.js'
import { createSpring, stepSpring, stepAngleSpring, resetSpring, springSettled, angleDelta, createWander } from '../src/pocket/actors/physics.js'
import { planRide, ridePoint, shuffle } from '../src/pocket/actors/gait.js'
import { createFlight, stepFlight, followPoint, kick, flightSettled, command, sticksFor, spool, FLIGHT, BOARD_FLIGHT } from '../src/pocket/actors/drone-flight.js'
import { crossPace, DASH_PACE, riderPoints, fitPoints } from '../src/pocket/pocket-actors.js'
import { watchFixedObstacles } from '../src/pocket/obstacles.js'

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

const mascotHarness = ({ reduced = false, timing = TIMING, parkFor = () => 0 } = {}) => {
  const clock = fakeClock()
  const log = []
  const brain = createMascotBrain({ clock, timing, parkFor, reduced: () => reduced, onChange: (state, previous, info) => log.push({ state, previous, info, at: clock.now() }) })
  return { clock, brain, log, states: () => log.map((entry) => entry.state) }
}

/** Opens the pocket with a short ride and lets it finish: the mascot is idle under the drone. */
const settleInAlbum = ({ clock, brain }, rideFor = 900) => {
  assert.equal(brain.revealStart({ rideFor }), 'ride')
  assert.equal(brain.state, 'riding')
  clock.advance(rideFor)
  assert.equal(brain.state, 'idle')
}

const LEAD = TIMING.emerge + TIMING.grabLead

/* --------------------------------------------------------- mascot: the save */

test('save: hidden while the item flies, comes out behind the button, holds it open, catches, sinks back', () => {
  const { clock, brain, states, log } = mascotHarness()
  assert.equal(brain.greet({ landsIn: 1900 }), 'started')
  clock.advance(1900 - LEAD - 1)
  assert.equal(brain.state, 'hidden', 'nothing while the item is still being peeled')
  clock.advance(1)
  assert.equal(brain.state, 'emerging')
  clock.advance(TIMING.emerge)
  assert.equal(brain.state, 'holding', 'it has the pocket open before the item arrives')
  assert.equal(clock.now(), 1900 - TIMING.grabLead)
  clock.advance(TIMING.grabLead)
  brain.landed()
  assert.equal(brain.state, 'catching')
  clock.advance(TIMING.catch)
  assert.equal(brain.state, 'slipping')
  clock.advance(TIMING.slip)
  assert.equal(brain.state, 'hidden')
  assert.deepEqual(states(), ['emerging', 'holding', 'catching', 'slipping', 'hidden'])
  assert.equal(log.find((entry) => entry.state === 'holding').info.landsIn, TIMING.grabLead)
  assert.ok(1900 + TIMING.catch + TIMING.slip <= 2700, 'gone within about 0.8 s of the landing')
})

test('save: every save gets the catch, not only the first', () => {
  const { clock, brain, states } = mascotHarness()
  for (let save = 0; save < 4; save += 1) {
    assert.equal(brain.greet({ landsIn: 1900 }), 'started')
    clock.advance(1900)
    brain.landed()
    clock.advance(TIMING.catch + TIMING.slip)
    assert.equal(brain.state, 'hidden')
  }
  assert.equal(states().filter((state) => state === 'catching').length, 4)
  assert.equal(brain.greetings, 4)
})

test('save: if the landing is never reported, it holds on a little longer and then lets go', () => {
  const { clock, brain } = mascotHarness()
  brain.greet({ landsIn: 1900 })
  clock.advance(1900)
  assert.equal(brain.state, 'holding')
  clock.advance(TIMING.greetLanding)
  assert.equal(brain.state, 'slipping')
  clock.advance(TIMING.slip)
  assert.equal(brain.state, 'hidden')
  assert.equal(brain.pendingTimers, 0)
})

test('save: saves that follow while it is out keep it holding the button open', () => {
  const { clock, brain, states } = mascotHarness()
  brain.greet({ landsIn: 1900 })
  clock.advance(1700)
  assert.equal(brain.state, 'holding')
  assert.equal(brain.greet({ landsIn: 1900 }), 'extended')
  assert.equal(brain.pending, 2)
  clock.advance(200)
  brain.landed()
  assert.equal(brain.state, 'catching')
  clock.advance(TIMING.catch)
  assert.equal(brain.state, 'holding', 'another item is on its way: it takes hold again')
  clock.advance(1700 - TIMING.catch)
  brain.landed()
  clock.advance(TIMING.catch)
  assert.equal(brain.state, 'slipping')
  clock.advance(TIMING.slip)
  assert.equal(brain.state, 'hidden')
  assert.equal(states().filter((state) => state === 'catching').length, 2)
  // A save while it sinks back: it reaches up again.
  brain.greet({ landsIn: 1900 })
  clock.advance(1900)
  brain.landed()
  clock.advance(TIMING.catch + 50)
  assert.equal(brain.state, 'slipping')
  assert.equal(brain.greet({ landsIn: 1900 }), 'extended')
  assert.equal(brain.state, 'holding')
})

test('save: an item that lands while the last one is being caught gets its own catch', () => {
  const { clock, brain, states } = mascotHarness()
  brain.greet({ landsIn: 1900 })
  clock.advance(250)
  assert.equal(brain.greet({ landsIn: 1900 }), 'extended')
  clock.advance(1650)
  brain.landed()
  clock.advance(250)
  assert.equal(brain.state, 'catching')
  brain.landed()
  assert.equal(brain.state, 'catching')
  clock.advance(TIMING.catch)
  assert.equal(brain.state, 'slipping')
  assert.equal(states().filter((state) => state === 'catching').length, 2)
  assert.equal(states().filter((state) => state === 'emerging').length, 1)
})

test('save: opening the pocket mid-hold lets go at once', () => {
  const { clock, brain, log } = mascotHarness()
  brain.greet({ landsIn: 1900 })
  clock.advance(1800)
  assert.equal(brain.state, 'holding')
  brain.interruptGreeting()
  assert.equal(brain.state, 'slipping')
  assert.equal(log.at(-1).info.quick, true)
  clock.advance(TIMING.quickSlip)
  assert.equal(brain.state, 'hidden')
  // Before it came out: the scheduled appearance is cancelled.
  brain.greet({ landsIn: 1900 })
  brain.interruptGreeting()
  clock.advance(5000)
  assert.equal(brain.state, 'hidden')
  assert.equal(brain.pendingTimers, 0)
})

/* ------------------------------------------------------- mascot: the album */

test('page turn: it rides for as long as the ride takes, then lives under the drone', () => {
  const { clock, brain, log } = mascotHarness()
  brain.revealStart({ rideFor: 750 })
  assert.equal(brain.state, 'riding')
  assert.equal(log.at(-1).info.rideFor, 750)
  brain.revealProgress(0.9) // the ride does not depend on the turn
  brain.revealComplete()
  clock.advance(749)
  assert.equal(brain.state, 'riding')
  clock.advance(1)
  assert.equal(brain.state, 'idle')
  // Already on the line (nowhere to ride): idle at once; covered: tucked; reduced: instant.
  const there = mascotHarness()
  assert.equal(there.brain.revealStart({ rideFor: 0 }), 'there')
  assert.equal(there.brain.state, 'idle')
  const covered = mascotHarness()
  covered.brain.revealStart({ rideFor: 0, covered: true })
  assert.equal(covered.brain.state, 'tucked')
  const reduced = mascotHarness({ reduced: true })
  assert.equal(reduced.brain.revealStart({ rideFor: 900 }), 'instant')
  assert.equal(reduced.brain.state, 'idle')
  assert.equal(reduced.log.at(-1).info.instant, true)
})

test('closing: it rides off toward the corner; with nowhere to ride it simply goes; teardown leaves nothing', () => {
  const h = mascotHarness()
  settleInAlbum(h)
  h.brain.closeStart({ rideFor: 120 })
  assert.equal(h.brain.state, 'leaving')
  h.brain.closeComplete()
  assert.equal(h.brain.state, 'hidden')
  assert.equal(h.brain.context, 'page')
  assert.equal(h.log.at(-1).info.reset, true)
  assert.equal(h.brain.pendingTimers, 0)
  const still = mascotHarness()
  settleInAlbum(still)
  still.brain.closeStart({ rideFor: 0 })
  assert.equal(still.brain.state, 'hidden')
  assert.equal(still.log.at(-1).info.instant, true)
})

test('idle: alive but no performance; the one payoff is a doze at 60 s', () => {
  const h = mascotHarness()
  settleInAlbum(h)
  h.clock.advance(TIMING.sleepAt - 1)
  assert.equal(h.brain.state, 'idle')
  h.clock.advance(1)
  assert.equal(h.brain.state, 'yawning')
  h.clock.advance(TIMING.yawn)
  assert.equal(h.brain.state, 'sleeping')
  assert.deepEqual(h.states().slice(-3), ['idle', 'yawning', 'sleeping'])
})

test('idle: activity restarts the clock; input wakes a sleeping mascot gently', () => {
  const h = mascotHarness()
  settleInAlbum(h)
  h.clock.advance(TIMING.sleepAt - 100)
  h.brain.activity()
  h.clock.advance(TIMING.sleepAt - 1)
  assert.equal(h.brain.state, 'idle')
  h.clock.advance(1 + TIMING.yawn)
  assert.equal(h.brain.state, 'sleeping')
  h.brain.activity()
  assert.equal(h.brain.state, 'waking')
  h.brain.activity() // more input while waking changes nothing
  h.clock.advance(TIMING.wake)
  assert.equal(h.brain.state, 'idle')
  h.clock.advance(TIMING.sleepAt - 1)
  assert.equal(h.brain.state, 'idle', 'the clock restarted after waking')
})

test('pilot: before it dozes it lands the drone (parking), then yawns; no drone to land, it simply dozes', () => {
  const park = TIMING.droneLand + 250
  const h = mascotHarness({ parkFor: () => park })
  settleInAlbum(h)
  h.clock.advance(TIMING.sleepAt)
  assert.equal(h.brain.state, 'parking')
  h.clock.advance(park - 1)
  assert.equal(h.brain.state, 'parking')
  h.clock.advance(1)
  assert.equal(h.brain.state, 'yawning')
  h.clock.advance(TIMING.yawn)
  assert.equal(h.brain.state, 'sleeping')
  assert.deepEqual(h.states().slice(-4), ['idle', 'parking', 'yawning', 'sleeping'])
  // The drone is down early: it dozes at once.
  const early = mascotHarness({ parkFor: () => park })
  settleInAlbum(early)
  early.clock.advance(TIMING.sleepAt)
  early.brain.parked()
  assert.equal(early.brain.state, 'yawning')
  // Nothing to land: straight to the doze, as before.
  const none = mascotHarness({ parkFor: () => 0 })
  settleInAlbum(none)
  none.clock.advance(TIMING.sleepAt)
  assert.equal(none.brain.state, 'yawning')
})

test('pilot: input while it lands the drone brings it back to idle and restarts the clock; a hidden tab lets it sleep', () => {
  const park = TIMING.droneLand + 250
  const h = mascotHarness({ parkFor: () => park })
  settleInAlbum(h)
  h.clock.advance(TIMING.sleepAt + 300)
  assert.equal(h.brain.state, 'parking')
  h.brain.activity()
  assert.equal(h.brain.state, 'idle')
  assert.equal(h.log.at(-1).info.from, 'parking')
  h.clock.advance(park)
  assert.equal(h.brain.state, 'idle', 'the old parking timer is gone')
  h.clock.advance(TIMING.sleepAt - park)
  assert.equal(h.brain.state, 'parking', 'the idle clock restarted from the input')
  h.brain.suspend()
  assert.equal(h.brain.state, 'sleeping')
  h.brain.destroy()
  assert.equal(h.brain.pendingTimers, 0)
})

test('cards: a card someone rests on turns the body toward it, only while it is idle', () => {
  const h = mascotHarness()
  assert.equal(h.brain.cardDwell(), false, 'not on the Services page')
  h.brain.revealStart({ rideFor: 500 })
  assert.equal(h.brain.cardDwell(), false, 'not while it rides')
  h.clock.advance(500)
  assert.equal(h.brain.cardDwell(), 'look')
  assert.equal(h.brain.state, 'idle', 'turning toward a card is not a state of its own')
  h.clock.advance(TIMING.sleepAt + TIMING.yawn)
  assert.equal(h.brain.cardDwell(), false, 'not while it dozes')
})

test('ripple: a click\'s ring of light makes it flinch, once, and only while idle', () => {
  const h = mascotHarness()
  assert.equal(h.brain.ripple(), false)
  settleInAlbum(h)
  assert.equal(h.brain.ripple(), true)
  assert.equal(h.brain.state, 'flinching')
  assert.equal(h.brain.ripple(), false, 'not again mid-flinch')
  h.clock.advance(TIMING.flinch)
  assert.equal(h.brain.state, 'idle')
  h.clock.advance(TIMING.sleepAt + TIMING.yawn)
  assert.equal(h.brain.state, 'sleeping')
  assert.equal(h.brain.ripple(), false, 'a ripple does not wake it (input does)')
})

test('priority: transitions outrank the constraint, which outranks reactions, then idle, then rest', () => {
  assert.ok(priorityOf('holding') < priorityOf('tucked'))
  assert.ok(priorityOf('tucked') < priorityOf('flinching'))
  assert.ok(priorityOf('flinching') < priorityOf('sleeping'))
  assert.ok(priorityOf('sleeping') < priorityOf('idle'))
  for (const state of Object.keys(MASCOT_STATES)) assert.ok(priorityOf(state) in { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1 }, state)
  assert.deepEqual(Object.keys(PRIORITY), ['transition', 'constraint', 'reaction', 'idle', 'rest'])
  // Retired performances stay retired.
  for (const state of ['impatient', 'eating', 'waving', 'jumping', 'glancing', 'startled', 'running', 'peeking', 'glimpsing']) assert.ok(!(state in MASCOT_STATES), state)
})

test('tucked: content where it stands sends it under the floor; it comes back when clear', () => {
  const h = mascotHarness()
  settleInAlbum(h)
  h.brain.setTucked(true)
  assert.equal(h.brain.state, 'tucked')
  h.clock.advance(TIMING.sleepAt * 2)
  assert.equal(h.brain.state, 'tucked', 'no doze while tucked away')
  h.brain.setTucked(false)
  assert.equal(h.brain.state, 'idle')
  assert.equal(h.log.at(-1).info.from, 'tucked')
})

test('random: its state can be read and put back, so the actors can run on ahead at rest and come back (F11)', () => {
  const random = seededRandom(7)
  random()
  const at = random.state()
  const ahead = [random(), random(), random()]
  random.state(at)
  assert.deepEqual([random(), random(), random()], ahead)
})

test('brains (F11): beforeChange runs before every change of state, the old state still in force, then onChange', () => {
  const clock = fakeClock()
  const order = []
  const mascot = createMascotBrain({
    clock,
    beforeChange: (next, state) => order.push(['before', next, state, mascot.state]),
    onChange: (state, previous) => order.push(['after', state, previous, mascot.state]),
  })
  mascot.revealStart({ rideFor: 0, covered: false })
  mascot.ripple()
  assert.deepEqual(order, [
    ['before', 'idle', 'hidden', 'hidden'],
    ['after', 'idle', 'hidden', 'idle'],
    ['before', 'flinching', 'idle', 'idle'],
    ['after', 'flinching', 'idle', 'flinching'],
  ])
  order.length = 0
  const drone = createDroneBrain({
    clock,
    beforeChange: (next, state) => order.push(['before', next, state, drone.state]),
    onChange: (state, previous) => order.push(['after', state, previous, drone.state]),
  })
  drone.open()
  drone.revealed()
  assert.equal(drone.poke(), 'hop')
  assert.deepEqual(order, [
    ['before', 'entering', 'hidden', 'hidden'],
    ['after', 'entering', 'hidden', 'entering'],
    ['before', 'home-hover', 'entering', 'entering'],
    ['after', 'home-hover', 'entering', 'home-hover'],
    ['before', 'evading', 'home-hover', 'home-hover'],
    ['after', 'evading', 'home-hover', 'evading'],
  ])
})

test('pick draws inside its range and is repeatable for a seed', () => {
  const a = seededRandom(7)
  const b = seededRandom(7)
  for (let index = 0; index < 50; index += 1) {
    const value = pick([20000, 40000], a)
    assert.ok(value >= 20000 && value <= 40000)
    assert.equal(value, pick([20000, 40000], b))
  }
  assert.equal(pick(5, a), 5)
  assert.equal(withTiming({ sleepAt: 10, nonsense: 1 }).sleepAt, 10)
  assert.equal('nonsense' in withTiming({ nonsense: 1 }), false)
})

test('reduced motion: no save beat, no ride, no doze, no reactions', () => {
  const h = mascotHarness({ reduced: true })
  assert.equal(h.brain.greet({ landsIn: 1900 }), 'skipped')
  h.clock.advance(5000)
  assert.equal(h.brain.state, 'hidden')
  h.brain.revealStart({ rideFor: 900 })
  assert.equal(h.brain.state, 'idle')
  h.clock.advance(TIMING.sleepAt * 2)
  assert.equal(h.brain.state, 'idle')
  assert.equal(h.brain.cardDwell(), false)
  assert.equal(h.brain.ripple(), false)
  assert.equal(h.brain.pendingTimers, 0)
})

test('hidden document: transient work settles at once and nothing stale replays', () => {
  const h = mascotHarness()
  h.brain.greet({ landsIn: 1900 })
  h.clock.advance(1800)
  h.brain.suspend()
  assert.equal(h.brain.state, 'hidden')
  assert.equal(h.brain.greet({ landsIn: 1900 }), 'skipped')
  h.clock.advance(10000)
  assert.equal(h.brain.state, 'hidden')
  h.brain.resume()
  const album = mascotHarness()
  album.brain.revealStart({ rideFor: 800 })
  album.brain.suspend()
  assert.equal(album.brain.state, 'idle')
  album.clock.advance(TIMING.sleepAt * 2)
  assert.equal(album.brain.state, 'idle', 'no doze while the tab is hidden')
  album.brain.resume()
  album.clock.advance(TIMING.sleepAt)
  assert.equal(album.brain.state, 'yawning')
})

test('destroy leaves no timers behind', () => {
  const h = mascotHarness()
  h.brain.greet({ landsIn: 1900 })
  h.brain.destroy()
  assert.equal(h.brain.pendingTimers, 0)
  assert.equal(h.clock.pending, 0)
  const album = mascotHarness()
  settleInAlbum(album)
  album.brain.destroy()
  assert.equal(album.brain.pendingTimers, 0)
  assert.equal(album.clock.pending, 0)
})

/* ------------------------------------------------------------------ drone */

const droneHarness = ({ reduced = false } = {}) => {
  const clock = fakeClock()
  const log = []
  const brain = createDroneBrain({ clock, reduced: () => reduced, onChange: (state, previous, info) => log.push({ state, previous, info }) })
  return { clock, brain, log }
}

test('drone: it hovers when the pocket opens; no heart on open', () => {
  const { brain, log } = droneHarness()
  brain.open()
  assert.equal(brain.state, 'entering')
  brain.revealed()
  assert.equal(brain.state, 'home-hover')
  brain.revealed() // a second "revealed" (focus restore, resize) changes nothing
  assert.equal(log.filter((entry) => entry.state === 'drawing-heart').length, 0)
  assert.equal(brain.busy, false)
  for (const state of log.map((entry) => entry.state)) assert.ok(DRONE_STATES.includes(state))
})

test('drone: the pilot lands it and flies it up again; it can open parked; nothing to play with on the ground', () => {
  const { clock, brain, log } = droneHarness()
  brain.open()
  brain.revealed()
  assert.equal(brain.park(), true)
  assert.equal(brain.state, 'landing')
  assert.ok(brain.watched && brain.grounded)
  clock.advance(TIMING.droneLand)
  assert.equal(brain.state, 'landed')
  assert.equal(brain.watched, false, 'parked: the pilot does not watch it')
  assert.equal(brain.poke({ heart: true }), false)
  assert.equal(brain.hoverEnter(), false)
  assert.equal(brain.pointerDown(0, 0), false)
  assert.equal(brain.ripple(), false)
  assert.equal(brain.follow(), false)
  assert.equal(brain.takeOff(), true)
  assert.equal(brain.state, 'taking-off')
  assert.equal(brain.takeOff(), false, 'already on its way up')
  clock.advance(TIMING.droneTakeOff)
  assert.equal(brain.state, 'home-hover')
  assert.equal(brain.heartDrawn, false, 'landing and taking off used no clicks')
  // Opening with a free spot beside the mascot: it waits parked until it is flown up.
  const parked = droneHarness()
  parked.brain.open({ parked: true })
  assert.equal(parked.brain.state, 'landed')
  assert.equal(parked.log.at(-1).info.from, 'open')
  parked.brain.revealed()
  assert.equal(parked.brain.state, 'landed', 'the page finishing its turn does not lift it')
  parked.brain.takeOff()
  parked.clock.advance(TIMING.droneTakeOff)
  assert.equal(parked.brain.state, 'home-hover')
  for (const state of [...log, ...parked.log].map((entry) => entry.state)) assert.ok(DRONE_STATES.includes(state))
  for (const state of DRONE_GROUNDED) assert.ok(DRONE_STATES.includes(state))
  for (const state of DRONE_WATCHED) assert.ok(DRONE_STATES.includes(state))
})

test('drone: it only lands from a calm flight; a hidden tab finishes the landing; reduced motion never lands', () => {
  const { clock, brain } = droneHarness()
  brain.open()
  brain.revealed()
  brain.poke({ heart: true })
  assert.equal(brain.state, 'drawing-heart')
  assert.equal(brain.park(), false, 'not in the middle of the heart')
  clock.advance(TIMING.droneHeart + TIMING.droneReturn)
  assert.equal(brain.state, 'home-hover')
  brain.pointerDown(0, 0)
  brain.pointerMove(20, 0)
  assert.equal(brain.state, 'dragging')
  assert.equal(brain.park(), false, 'not while someone holds it')
  brain.pointerUp()
  assert.equal(brain.park(), true, 'flying home is calm enough')
  brain.suspend()
  assert.equal(brain.state, 'landed')
  brain.suspend()
  assert.equal(brain.state, 'landed')
  const reduced = droneHarness({ reduced: true })
  reduced.brain.open({ parked: true })
  assert.equal(reduced.brain.state, 'home-hover')
  assert.equal(reduced.brain.park(), false)
})

test('drone: the first click of a page load draws the heart; later clicks hop; reopening never redraws it', () => {
  const { clock, brain, log } = droneHarness()
  brain.open()
  brain.revealed()
  assert.equal(brain.poke({ heart: true }), 'heart')
  assert.equal(brain.state, 'drawing-heart')
  assert.equal(brain.busy, true)
  clock.advance(TIMING.droneHeart)
  assert.equal(brain.state, 'returning-home')
  assert.equal(log.at(-1).info.from, 'heart')
  clock.advance(TIMING.droneReturn)
  assert.equal(brain.state, 'home-hover')
  assert.equal(brain.poke({ heart: true }), 'hop')
  assert.equal(brain.state, 'evading')
  clock.advance(TIMING.droneHop)
  assert.equal(brain.state, 'home-hover')
  brain.close()
  brain.closeComplete()
  brain.open()
  brain.revealed()
  clock.advance(TIMING.dronePokeCooldown)
  assert.equal(brain.poke({ heart: true }), 'hop')
  assert.equal(log.filter((entry) => entry.state === 'drawing-heart').length, 1)
  const cramped = droneHarness()
  cramped.brain.open()
  cramped.brain.revealed()
  assert.equal(cramped.brain.poke({ heart: false }), 'hop')
})

test('drone: the pointer makes it curious; it goes back to hovering 400 ms after the pointer leaves', () => {
  const { clock, brain } = droneHarness()
  brain.open()
  brain.revealed()
  assert.equal(brain.hoverEnter(), true)
  assert.equal(brain.state, 'curious')
  brain.hoverLeave()
  clock.advance(TIMING.droneSettle - 1)
  assert.equal(brain.state, 'curious')
  brain.hoverEnter() // back before it settled: stays curious, no new transition
  clock.advance(TIMING.droneSettle)
  assert.equal(brain.state, 'curious')
  brain.hoverLeave()
  clock.advance(TIMING.droneSettle)
  assert.equal(brain.state, 'home-hover')
  brain.hoverEnter()
  assert.equal(brain.poke({ heart: true }), 'heart')
})

test('drone: it keeps a slow cursor company, goes home when told or when it tires of it', () => {
  const { clock, brain, log } = droneHarness()
  brain.open()
  assert.equal(brain.follow(), false, 'not while the page is still turning')
  brain.revealed()
  assert.equal(brain.follow(), true)
  assert.equal(brain.state, 'following')
  assert.equal(brain.follow(), false)
  assert.equal(brain.unfollow(), true)
  assert.equal(brain.state, 'returning-home')
  clock.advance(TIMING.droneSpringBack)
  assert.equal(brain.state, 'home-hover')
  brain.follow()
  clock.advance(TIMING.droneFollowFor)
  assert.equal(brain.state, 'returning-home')
  assert.equal(log.at(-1).info.cause, 'bored')
  clock.advance(TIMING.droneSpringBack)
  // While following, the pointer can still reach it, click it or drag it.
  brain.follow()
  assert.equal(brain.hoverEnter(), true)
  assert.equal(brain.state, 'curious')
  clock.advance(TIMING.dronePokeCooldown)
  brain.hoverLeave()
  clock.advance(TIMING.droneSettle)
  brain.follow()
  assert.equal(brain.poke({ heart: true }), 'heart')
  // Escape and a relayout bring it home.
  const other = droneHarness()
  other.brain.open()
  other.brain.revealed()
  other.brain.follow()
  assert.equal(other.brain.escape(), true)
  assert.equal(other.brain.state, 'returning-home')
  other.clock.advance(TIMING.droneSpringBack)
  other.brain.follow()
  other.brain.relayout()
  assert.equal(other.brain.state, 'returning-home')
})

test('drone: a ripple shoves it aside; it recovers to what it was doing; never during the heart', () => {
  const { clock, brain } = droneHarness()
  brain.open()
  brain.revealed()
  assert.equal(brain.ripple(), true)
  assert.equal(brain.state, 'dodging')
  clock.advance(TIMING.droneDodge)
  assert.equal(brain.state, 'returning-home')
  clock.advance(TIMING.droneSpringBack)
  assert.equal(brain.state, 'home-hover')
  brain.follow()
  brain.ripple()
  clock.advance(TIMING.droneDodge)
  assert.equal(brain.state, 'following', 'it goes back to keeping the cursor company')
  brain.unfollow()
  clock.advance(TIMING.droneSpringBack)
  brain.poke({ heart: true })
  assert.equal(brain.ripple(), false)
  assert.equal(brain.state, 'drawing-heart')
})

test('drone: dragging is impossible while entering or drawing the heart', () => {
  const { brain } = droneHarness()
  brain.open()
  assert.equal(brain.pointerDown(0, 0), false)
  brain.revealed()
  brain.poke({ heart: true })
  assert.equal(brain.pointerDown(0, 0), false)
  assert.equal(brain.pointerMove(50, 50), false)
  assert.equal(brain.state, 'drawing-heart')
})

test('drone: a small movement is a click, past the threshold it is a drag; release springs home', () => {
  const { clock, brain } = droneHarness()
  brain.open()
  brain.revealed()
  assert.equal(brain.pointerDown(100, 100), true)
  assert.equal(brain.pointerMove(103, 102), false)
  assert.equal(brain.state, 'home-hover')
  assert.equal(brain.pointerUp(), false) // a click: the caller pokes instead
  brain.hoverEnter()
  brain.pointerDown(100, 100) // from curious too
  assert.equal(brain.pointerMove(100 + TIMING.droneDragThreshold, 100), true)
  assert.equal(brain.state, 'dragging')
  assert.equal(brain.busy, true)
  assert.equal(brain.pointerUp(), true)
  assert.equal(brain.state, 'returning-home')
  clock.advance(TIMING.droneSpringBack)
  assert.equal(brain.state, 'home-hover')
})

test('drone: pointer cancel, Escape and relayout all bring it home; Escape at home is not consumed', () => {
  const { clock, brain, log } = droneHarness()
  brain.open()
  brain.revealed()
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
  brain.hoverEnter()
  brain.relayout()
  assert.equal(brain.state, 'home-hover')
})

test('drone: clicks are throttled; reduced motion rests at home with nothing to perform', () => {
  const { clock, brain } = droneHarness()
  brain.open()
  brain.revealed()
  assert.equal(brain.poke(), 'hop')
  clock.advance(TIMING.droneHop)
  assert.equal(brain.state, 'home-hover')
  clock.advance(TIMING.dronePokeCooldown)
  assert.equal(brain.poke(), 'hop')

  const reduced = droneHarness({ reduced: true })
  reduced.brain.open()
  assert.equal(reduced.brain.state, 'home-hover')
  assert.equal(reduced.log.at(-1).info.instant, true)
  reduced.brain.revealed()
  assert.equal(reduced.brain.poke({ heart: true }), false)
  assert.equal(reduced.brain.hoverEnter(), false)
  assert.equal(reduced.brain.follow(), false)
  assert.equal(reduced.brain.ripple(), false)
  assert.equal(reduced.brain.pointerDown(0, 0), false)
})

test('drone: closing mid-flight cancels it and leaves no timers', () => {
  const { clock, brain } = droneHarness()
  brain.open()
  brain.revealed()
  brain.poke({ heart: true })
  clock.advance(400)
  brain.close()
  assert.equal(brain.state, 'closing')
  brain.closeComplete()
  assert.equal(brain.state, 'hidden')
  assert.equal(brain.pendingTimers, 0)
  assert.equal(clock.pending, 0)
})

/* ---------------------------------------------------------------- physics */

test('springs: critical damping settles without overshoot; less damping wobbles; any frame rate is stable', () => {
  const critical = createSpring(0, { frequency: 2, damping: 1 })
  let peak = 0
  for (let frame = 0; frame < 120; frame += 1) peak = Math.max(peak, stepSpring(critical, 16, 10))
  assert.ok(peak <= 10 + 1e-6 && springSettled(critical, 0.01))
  const wobbly = createSpring(0, { frequency: 2, damping: 0.3 })
  peak = 0
  for (let frame = 0; frame < 120; frame += 1) peak = Math.max(peak, stepSpring(wobbly, 16, 10))
  assert.ok(peak > 12, 'an under-damped spring overshoots (the flame tip, the drone)')
  // A long gap (a background tab) is capped and stays finite.
  const jumpy = createSpring(0, { frequency: 8, damping: 0.5 })
  stepSpring(jumpy, 5000, 100)
  assert.ok(Number.isFinite(jumpy.x) && Math.abs(jumpy.x) < 200)
  resetSpring(jumpy, 3)
  assert.equal(jumpy.x, 3)
  assert.equal(jumpy.v, 0)
})

test('springs: an angle spring turns the short way round', () => {
  assert.equal(angleDelta(170, -170), 20)
  assert.equal(angleDelta(-170, 170), -20)
  const heading = createSpring(170, { frequency: 2, damping: 1 })
  for (let frame = 0; frame < 120; frame += 1) stepAngleSpring(heading, 16, -170, 2, 1)
  assert.ok(Math.abs(heading.x - 190) < 0.1, `took the short way: ${heading.x.toFixed(1)}`)
})

test('wander: bounded, smooth and repeatable for a seed', () => {
  const a = createWander(seededRandom(3))
  const b = createWander(seededRandom(3))
  let last = a(0)
  for (let ms = 0; ms < 60000; ms += 16) {
    const value = a(ms)
    assert.ok(Math.abs(value) <= 1)
    assert.ok(Math.abs(value - last) < 0.04, 'no jumps between frames')
    assert.equal(value, b(ms))
    last = value
  }
})

/* ----------------------------------------------------------- the hoverboard */

test('ride: the board chases its path on the flight model: it lags, banks into the ride, brakes nose up, overshoots a little and settles', () => {
  const plan = planRide({ from: 120, to: 0, timing: TIMING.ride })
  assert.equal(plan.dir, -1)
  assert.equal(plan.duration, 450 + 120 * 4)
  assert.equal(planRide({ from: 0, to: 1, timing: TIMING.ride }), null, 'nowhere to go')
  assert.equal(planRide({ from: 900, to: 0, timing: TIMING.ride }).duration, TIMING.ride[3], 'never longer than the cap')
  const board = createFlight(0)
  board.x = 120
  board.y = -BOARD.hover
  let early = 0
  let late = 0
  let past = 0
  let lag = 0
  for (let ms = 16; ms <= plan.duration + 2000; ms += 16) {
    const { x } = ridePoint(plan, ms)
    stepFlight(board, 16, { x, y: -BOARD.hover, z: 0 }, 0, BOARD_FLIGHT)
    if (ms < plan.duration / 2) early = Math.max(early, board.roll.x)
    else late = Math.min(late, board.roll.x)
    past = Math.min(past, board.x)
    if (Math.abs(ms - plan.duration / 2) < 8) lag = board.x - x
    if (Math.abs(ms - (plan.duration + TIMING.rideSettle)) < 8) assert.ok(Math.abs(board.x) < 1.5, `at rest when the remote comes up: ${board.x}`)
  }
  // Riding toward -x: the leading end dips as it speeds up (+roll lifts the +x end), lifts as it brakes.
  assert.ok(early > 4 && early <= BOARD_FLIGHT.maxTilt, `banks into the ride: ${early}`)
  assert.ok(late < -4 && late > -BOARD_FLIGHT.maxTilt * 1.2, `flares as it brakes: ${late}`)
  assert.ok(lag > 8, `lags behind its path: ${lag}`)
  assert.ok(past < -0.5 && past > -4, `overshoots a little: ${past}`)
  assert.ok(Math.abs(board.x) < 0.05 && Math.abs(board.roll.x) < 0.1)
  // Leaving, it speeds up and never brakes: a quarter of the time in, it is only 1/64 of the way.
  const away = planRide({ from: 0, to: 200, timing: TIMING.ride, away: true })
  assert.ok(Math.abs(ridePoint(away, away.duration / 4).x - 200 / 64) < 1e-9)
  assert.equal(ridePoint(away, away.duration).done, true)
  assert.deepEqual(shuffle(100, 0), {})
  assert.ok(shuffle(100, 1).legL > 0)
})

/* ---------------------------------------------------------- the drone's flight */

test('flight: it reaches its target and settles, banking into the move and levelling out', () => {
  const flight = createFlight(22)
  let maxBank = 0
  for (let frame = 0; frame < 400; frame += 1) {
    stepFlight(flight, 16, { x: 120, y: 0, z: 0 }, 22)
    maxBank = Math.min(maxBank, flight.roll.x)
  }
  assert.ok(flightSettled(flight, { x: 120, y: 0, z: 0 }, 0.5), `at ${flight.x.toFixed(2)}`)
  assert.ok(maxBank < -8, 'it banked into the move to the right')
  assert.ok(Math.abs(flight.roll.x) < 0.5, 'and levelled out')
  assert.ok(flight.rpm.x < 2.3, 'rotors back to hovering speed')
})

test('flight: thrust is limited; a shove moves it and it comes back; a scripted path still banks', () => {
  const flight = createFlight(22)
  stepFlight(flight, 16, { x: 5000, y: 0, z: 0 }, 22)
  assert.ok(Math.abs(flight.ax) <= 2600 + 1e-6)
  const shoved = createFlight(22)
  kick(shoved, 400, 0)
  let furthest = 0
  for (let frame = 0; frame < 300; frame += 1) {
    stepFlight(shoved, 16, { x: 0, y: 0, z: 0 }, 22)
    furthest = Math.max(furthest, shoved.x)
  }
  assert.ok(furthest > 20 && flightSettled(shoved, { x: 0, y: 0, z: 0 }, 0.5))
  const path = createFlight(22)
  for (let frame = 1; frame <= 40; frame += 1) followPoint(path, 16, { x: 3 * frame * frame * 0.05, y: 0 }, 22)
  assert.ok(path.roll.x < -2, 'speeding up to the right banks right')
  // The heading drifts the short way round.
  const turning = createFlight(170)
  for (let frame = 0; frame < 300; frame += 1) stepFlight(turning, 16, { x: 0, y: 0 }, -170)
  assert.ok(Math.abs(turning.yaw.x - 190) < 1)
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

test('heart flight: only the heart is inked, and the pen slows into the notch and the tip', () => {
  const home = { x: 600, y: 120 }
  const box = { x: 420, y: 70, w: 96, h: 86 }
  const flight = heartFlight({ home, box })
  const { heart, points, lengths, times } = flight
  assert.match(heart.d, /^M[\d.]+ [\d.]+C/)
  assert.ok(heart.start > 0 && heart.end < flight.length, 'the approach and the return are not part of the line')
  const inked = points.slice(heart.from, heart.to + 1)
  for (const p of inked) assert.ok(p.x >= box.x - 2 && p.x <= box.x + box.w + 2 && p.y >= box.y - 2 && p.y <= box.y + box.h + 2)
  assert.deepEqual(inked[0], inked.at(-1), 'the line closes where it began')
  // Time runs 0..1 in order; the flight starts and ends at home.
  for (let index = 1; index < times.length; index += 1) assert.ok(times[index] >= times[index - 1])
  assert.equal(times.at(-1), 1)
  for (const tau of [0, 1]) {
    const point = sampleFlight(flight, tau)
    assert.ok(Math.hypot(point.x - home.x, point.y - home.y) < 1e-6)
  }
  // Pen speed (px per unit of time) at the notch and the tip vs an open curve (the left lobe).
  const speed = (index) => (lengths[index + 1] - lengths[index]) / (times[index + 1] - times[index])
  const quarter = (heart.to - heart.from) / 4
  const notch = speed(heart.from + quarter)
  const lobe = speed(heart.from + 2 * quarter)
  const tip = speed(heart.from + 3 * quarter)
  assert.ok(notch < lobe * 0.6, `notch ${notch.toFixed(0)} vs lobe ${lobe.toFixed(0)}`)
  assert.ok(tip < lobe * 0.6, `tip ${tip.toFixed(0)} vs lobe ${lobe.toFixed(0)}`)
  // Arc length grows with time.
  let last = -1
  for (let index = 0; index <= 40; index += 1) {
    const { s } = sampleFlight(flight, index / 40)
    assert.ok(s >= last)
    last = s
  }
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

test('heart plan mirrored (S12, a right-to-left album): from a home at the left margin the heart is drawn to its right, the mirror of the left one, never brushing content', () => {
  const drone = { w: 96, h: 67 }
  const W = 1440
  const mirror = (r) => rect(W - r.right, r.top, r.width, r.height)
  const home = rect(1187, 218, drone.w, drone.h)
  const sky = { top: 112, bottom: 320 }
  const bounds = rect(8, 108, 1424, 220)
  const obstacles = [rect(150, 210, 510, 74), rect(1196, 135, 87, 40), rect(1030, 328, 260, 300)]
  const left = planHeart({ home, band: sky, obstacles, bounds, drone })
  const right = planHeart({ home: mirror(home), band: sky, obstacles: obstacles.map(mirror), bounds: mirror(bounds), drone, toward: 1 })
  assert.ok(left && right, 'a heart fits on both sides')
  assert.ok(right.box.x >= mirror(home).right, 'to the right of its home')
  assert.equal(right.box.w, left.box.w, 'the same size')
  assert.ok(Math.abs(right.box.x - (W - left.box.x - left.box.w)) < 1e-6, 'the mirror of the left heart')
  assert.equal(right.flight.points.length, left.flight.points.length)
  right.flight.points.forEach((p, i) => {
    assert.ok(Math.abs(p.x - (W - left.flight.points[i].x)) < 1e-6 && Math.abs(p.y - left.flight.points[i].y) < 1e-6, `point ${i} mirrored`)
    const footprint = rect(p.x - drone.w / 2, p.y - drone.h / 2, drone.w, drone.h)
    assert.ok(contains(mirror(bounds), footprint))
    for (const obstacle of obstacles.map(mirror)) assert.ok(!rectsOverlap(footprint, obstacle), 'clear of content')
  })
  // It starts and ends at home, and its inked heart is a path of its own.
  assert.deepEqual(right.flight.points[0], { x: mirror(home).left + drone.w / 2, y: home.top + drone.h / 2 })
  assert.match(right.flight.heart.d, /^M/)
  assert.ok(right.flight.heart.end > right.flight.heart.start)
  // The default stays to the left (the clone).
  assert.ok(left.box.x + left.box.w <= home.left)
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

test('scope: with a wrap, every listener, timer and frame callback runs through it (an error is caught and reported, not thrown)', () => {
  const clock = fakeClock()
  const frames = new Map()
  let frameSeq = 0
  const caught = []
  const wrap = (fn) => (...args) => {
    try {
      return fn(...args)
    } catch (error) {
      caught.push(error.message)
    }
  }
  const scope = createScope({ clock, wrap, frames: { request: (fn) => (frames.set(++frameSeq, fn), frameSeq), cancel: (id) => frames.delete(id) } })
  assert.equal(scope.wrap, wrap, 'handed out for observer callbacks and promises')
  const target = new EventTarget()
  scope.on(target, 'ping', () => {
    throw new Error('listener')
  })
  scope.timeout(() => {
    throw new Error('timer')
  }, 10)
  scope.frame(() => {
    throw new Error('frame')
  })
  target.dispatchEvent(new Event('ping'))
  clock.advance(20)
  for (const fn of [...frames.values()]) fn(16)
  assert.deepEqual(caught, ['listener', 'timer', 'frame'])
  assert.deepEqual(scope.live, { timers: 0, frames: 0, observers: 0, animations: 0, cleanups: 0 }, 'a caught timer or frame is still forgotten')
  // Without one (the default) nothing changes: callbacks run as given.
  const plain = createScope({ clock })
  let ran = 0
  plain.timeout(() => (ran += 1), 5)
  clock.advance(5)
  assert.equal(ran, 1)
})

/* ------------------------------------------------------------- 3D kit */

const near = (a, b, epsilon = 1e-6) => Math.abs(a - b) < epsilon

test('3D: pose rotations are rigid; yaw turns the front toward the viewer\'s right', () => {
  const m = orientation({ yaw: 37, pitch: -12, roll: 25 })
  const a = apply(m, v3(1, 2, 3))
  assert.ok(near(length(a), length(v3(1, 2, 3)), 1e-9), 'length preserved')
  assert.ok(near(dot(apply(m, v3(1, 0, 0)), apply(m, v3(0, 1, 0))), 0, 1e-9), 'axes stay orthogonal')
  const front = apply(rotateY(90), v3(0, 0, 1))
  assert.ok(near(front.x, 1) && near(front.z, 0))
})

test('3D: perspective makes nearer things bigger; a sphere projects to a circle', () => {
  const camera = createCamera({ distance: 900, tilt: 0 })
  const near1 = camera.project(v3(10, 0, 100))
  const far1 = camera.project(v3(10, 0, -100))
  assert.ok(near1.k > 1 && far1.k < 1 && near1.x > far1.x)
  const tilted = createCamera({ distance: 900, tilt: 20 })
  const r = 30
  const sphere = projectEllipsoid(tilted, v3(0, 0, 0), v3(r, 0, 0), v3(0, r, 0), v3(0, 0, r))
  assert.ok(near(sphere.rx, sphere.ry, 1e-6) && near(sphere.rx, r, 1e-6))
  const disc = projectEllipsoid(tilted, v3(0, 0, 0), tilted.toView(v3(r, 0, 0)), tilted.toView(v3(0, 0.001, 0)), tilted.toView(v3(0, 0, r)))
  assert.ok(disc.ry < disc.rx * 0.5, 'a ground disc seen from above is a flat ellipse')
  assert.match(capsulePath({ x: 0, y: 0 }, 6, { x: 40, y: 10 }, 3), /^M.*A.*A.*Z$/)
})

const mascotCamera = () => createCamera({ distance: 900, tilt: 12, origin: { x: 60, y: 147 } })
const finite = (value) => {
  if (typeof value === 'number') return Number.isFinite(value)
  if (typeof value === 'string') return !/NaN|Infinity/.test(value)
  if (Array.isArray(value)) return value.every(finite)
  if (value && typeof value === 'object') return Object.values(value).every(finite)
  return true
}

test('mascot model: a closed, finite silhouette from every angle, ending in the flame tip', () => {
  const camera = mascotCamera()
  for (let yaw = -180; yaw <= 180; yaw += 15) {
    for (const extra of [{}, { pitch: 18, roll: -8 }, { sx: 1.14, sy: 0.84, bend: 6, nod: -12 }]) {
      const frame = mascotFrame({ yaw, ...extra }, camera)
      assert.ok(frame.body.outline.length > 30, `outline at yaw ${yaw}`)
      assert.ok(finite(frame), `finite at yaw ${yaw}`)
      assert.match(frame.body.d, /^M.*Z$/)
    }
  }
  // Facing the viewer the tip curls up to the right, as in the reference.
  const front = mascotFrame({}, camera)
  const top = front.body.outline.reduce((a, b) => (a.y < b.y ? a : b))
  assert.ok(top.x > 75 && top.y < 20, `tip at ${top.x.toFixed(1)}, ${top.y.toFixed(1)}`)
})

test('mascot model: the eye turns with the body and hides behind it', () => {
  const camera = mascotCamera()
  const facing = (yaw) => mascotFrame({ yaw }, camera).eye.facing
  assert.ok(facing(0) > 0.95)
  assert.ok(facing(50) > 0.4 && facing(50) < 0.8)
  assert.ok(facing(180) < -0.9)
  assert.equal(mascotFrame({ yaw: 180 }, camera).eye.visible, false)
  // The eye slides toward the side the body turns to.
  const eyeX = (yaw) => mascotFrame({ yaw }, camera).eye.centre.x
  assert.ok(eyeX(40) > eyeX(0) + 10 && eyeX(-40) < eyeX(0) - 10)
})

/** Is a point inside a closed polygon (even-odd)? */
const insidePolygon = (point, polygon) => {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[i]
    const b = polygon[j]
    if (a.y > point.y !== b.y > point.y && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

test('mascot model: the eye wraps round the body as it turns; its centre stays inside the outline to 60° (the renderer clips the rest)', () => {
  const camera = mascotCamera()
  for (let yaw = -60; yaw <= 60; yaw += 5) {
    const frame = mascotFrame({ yaw }, camera)
    assert.ok(insidePolygon(frame.eye.centre, frame.body.outline), `eye centre inside the body at yaw ${yaw}`)
    assert.match(frame.eye.sclera, /^M.*Z$/)
    if (Math.abs(yaw) <= 40) assert.ok(insidePolygon({ x: frame.eye.iris.cx, y: frame.eye.iris.cy }, frame.body.outline), `iris inside at yaw ${yaw}`)
  }
  // Seen from the side the eye is narrower than from the front (it is on a curved surface).
  const width = (yaw) => {
    const hull = convexHull(mascotFrame({ yaw }, camera).eye.sclera.match(/-?[\d.]+ -?[\d.]+/g).map((pair) => {
      const [x, y] = pair.split(' ').map(Number)
      return { x, y }
    }))
    return Math.max(...hull.map((p) => p.x)) - Math.min(...hull.map((p) => p.x))
  }
  assert.ok(width(-60) < width(0) * 0.7)
})

test('mascot model: the iris looks where it is told, within the eye; the glints stay with the light', () => {
  const camera = mascotCamera()
  const front = mascotFrame({}, camera).eye
  const right = mascotFrame({ gazeX: 10 }, camera).eye
  const up = mascotFrame({ gazeY: 10 }, camera).eye
  assert.ok(right.iris.cx > front.iris.cx + 3, 'gazeX + looks to the viewer\'s right')
  assert.ok(up.iris.cy < front.iris.cy - 3, 'gazeY + looks up')
  const far = mascotFrame({ gazeX: 80 }, camera).eye
  const limit = mascotFrame({ gazeX: 11 }, camera).eye
  assert.ok(Math.abs(far.iris.cx - limit.iris.cx) < 0.05, 'the gaze is capped at the eye\'s travel')
  assert.ok(Math.abs(right.glints[0].cx - front.glints[0].cx) < 1e-6, 'glints do not follow the iris')
  // The light moves the glints, the body's highlight and the shadow.
  const lit = mascotFrame({}, camera, { light: { x: 0.7, y: 0.3, z: 0.65 } })
  assert.ok(lit.eye.glints[0].cx > front.glints[0].cx)
  assert.ok(lit.body.highlight.x > mascotFrame({}, camera).body.highlight.x)
  assert.ok(lit.shadow.cx < mascotFrame({}, camera).shadow.cx, 'the shadow falls away from the light')
})

test('mascot model: the lid closes from the top; the contented closed eye is an arch; the brow shows on demand', () => {
  const camera = mascotCamera()
  assert.equal(mascotFrame({}, camera).eye.lid, undefined)
  const half = mascotFrame({ lid: 0.5 }, camera).eye
  assert.match(half.lid, /^M.*Z$/)
  assert.match(half.lidLine, /^M/)
  assert.equal(mascotFrame({ lid: 1.05 }, camera).eye.lidLine, '', 'fully closed: no lid edge left inside the eye')
  const closed = mascotFrame({ closed: 1 }, camera).eye
  assert.equal(closed.closed, true)
  assert.match(closed.arch, /^M/)
  assert.equal(closed.iris, undefined)
  assert.equal(mascotFrame({}, camera).eye.brow, undefined)
  const raised = mascotFrame({ brow: 1 }, camera).eye
  const lowered = mascotFrame({ brow: -1 }, camera).eye
  const browY = (eye) => Number(eye.brow.match(/M[\d.]+ ([\d.]+)/)[1])
  assert.ok(browY(raised) < browY(lowered), 'raised is higher')
})

test('mascot model: arms reach for a point on screen (the pocket button\'s rim)', () => {
  const camera = mascotCamera()
  const pose = { yaw: -10, pitch: -4 }
  for (const [side, key, target] of [[-1, 'L', { x: 30, y: 110 }], [1, 'R', { x: 90, y: 110 }]]) {
    const reach = reachToward(pose, camera, side, target)
    const frame = mascotFrame({ ...pose, [`arm${key}a`]: reach.abduct, [`arm${key}f`]: reach.flex, [`arm${key}r`]: reach.reach }, camera)
    const hand = frame.hands[`hand${key}`]
    assert.ok(Math.hypot(hand.x - target.x, hand.y - target.y) < 2.5, `hand ${key} at ${hand.x.toFixed(1)}, ${hand.y.toFixed(1)}`)
  }
})

test('mascot model: the hands hold the remote\'s grips in any pose; the remote turns with the body', () => {
  const camera = mascotCamera()
  for (const extra of [{}, { yaw: -40, pitch: -8 }, { yaw: 30, roll: 3, bend: 6, nod: -4 }, { droop: 1 }, { remoteX: 2, remoteY: 3, remoteRoll: 12 }, { sx: 1.05, sy: 0.95 }]) {
    const pose = { ...restPose(), remote: 1, shoulderL: REMOTE.shoulder, shoulderR: REMOTE.shoulder, ...extra }
    Object.assign(pose, holdRemote(pose))
    const frame = mascotFrame(pose, camera)
    for (const [side, key] of [[-1, 'armL'], [1, 'armR']]) {
      const gap = length(v3(...['x', 'y', 'z'].map((axis) => frame.limbs[key].endModel[axis] - remoteGrip(pose, side)[axis])))
      assert.ok(Math.abs(gap - 4) < 0.6, `${key} wrist ${gap.toFixed(2)} from its grip (${JSON.stringify(extra)})`)
    }
    assert.ok(frame.remote.case && frame.remote.sticks.length === 2 && frame.remote.thumbs.length === 2)
    assert.ok(!/NaN/.test(frame.remote.case + frame.remote.antenna + frame.remote.thumbs.join('')))
  }
  assert.equal(mascotFrame({}, camera).remote, null, 'no remote at rest')
  // It turns with the body: its centre swings toward the side the body turns to.
  const turned = (yaw) => mascotFrame({ yaw, remote: 1 }, camera).remote.centre.x
  assert.ok(turned(30) > turned(0) && turned(-30) < turned(0))
  // A stick pushed across moves its tip across the remote.
  const tip = (stickLX) => mascotFrame({ remote: 1, stickLX }, camera).remote.sticks[0].tip.cx
  assert.ok(tip(1) > tip(0) + 1 && tip(-1) < tip(0) - 1)
})

test('flight: the sticks show the command (Mode 2), lead the drone, and saturate softly', () => {
  const at = createFlight(22)
  const still = command(at, { x: 0, y: 0, z: 0 })
  assert.deepEqual([still.ax, still.ay, still.az].map((v) => Math.abs(v) < 1e-9), [true, true, true])
  const right = command(at, { x: 120, y: 0, z: 0 })
  assert.ok(right.ax > 0 && Math.hypot(right.ax, right.ay, right.az) <= FLIGHT.maxAccel + 1e-6)
  const up = sticksFor(command(at, { x: 0, y: -60, z: 0 }))
  assert.ok(up.climb > 0.5, 'climbing is the throttle pushed forward')
  const across = sticksFor({ ax: 200 })
  assert.ok(across.across > 0 && across.across < 1)
  const full = sticksFor({ ax: -1e5, ay: 1e5, az: 1e5 }, 400)
  for (const value of Object.values(full)) assert.ok(Math.abs(value) <= 1 && Math.abs(value) > 0.99)
  // Commanded first, moved later: the command is non-zero before the drone has moved at all.
  assert.equal(at.x, 0)
  // On the ground the rotors run down to a stop and it levels out.
  const ground = createFlight(22)
  ground.roll.x = 8
  for (let i = 0; i < 200; i += 1) spool(ground, 16, 0)
  assert.ok(ground.rpm.x < 0.01 && Math.abs(ground.roll.x) < 0.05)
})

test('mascot model: limbs swap in front of and behind the body as it turns', () => {
  const camera = mascotCamera()
  const front = mascotFrame({ yaw: 0 }, camera)
  assert.deepEqual(front.order.front.sort(), ['armL', 'armR'])
  const turned = mascotFrame({ yaw: 90 }, camera)
  assert.ok(turned.order.back.includes('armR') || turned.order.back.includes('armL'), 'the far arm goes behind')
  const raised = mascotFrame({ armRa: 160 }, camera)
  assert.ok(raised.limbs.armR.end.y < raised.limbs.armR.root.y - 15, 'a raised arm points up')
  const jump = mascotFrame({ y: 26 }, camera)
  assert.ok(near(jump.shadow.cy, front.shadow.cy, 0.5), 'the shadow stays on the ground')
  assert.ok(jump.lift > 20, 'the contact shadow can fade as it leaves the ground')
})

test('affine fit (F11): recovers a map from three points or more, best fits a noisy one, null for points on one line', () => {
  const map = [1.03, -0.05, 0.04, 0.98, 6, -3]
  const apply2 = (m, p) => ({ x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] })
  const from = [{ x: 0, y: 0 }, { x: 40, y: 5 }, { x: 10, y: 60 }, { x: 70, y: 90 }]
  const fitted = fitAffine(from, from.map((p) => apply2(map, p)))
  fitted.forEach((v, i) => assert.ok(Math.abs(v - map[i]) < 1e-9, `${i}: ${v} vs ${map[i]}`))
  const noisy = fitAffine(from, from.map((p, i) => ({ x: apply2(map, p).x + (i % 2 ? 0.2 : -0.2), y: apply2(map, p).y })))
  for (const p of from) assert.ok(Math.hypot(apply2(noisy, p).x - apply2(map, p).x, apply2(noisy, p).y - apply2(map, p).y) < 0.3)
  assert.equal(fitAffine([{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }], [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }]), null)
  assert.equal(fitAffine(from.slice(0, 2), from.slice(0, 2)), null)
})

test('drone rotors (F11): a blade drawn as rotate(bladeAngle) in its rotor\'s matrix is the model\'s blade, at any spin', () => {
  const camera = createCamera({ distance: 900, tilt: 26, origin: { x: 100, y: 74 } })
  const compose = (p, q) => [p[0] * q[0] + p[2] * q[1], p[1] * q[0] + p[3] * q[1], p[0] * q[2] + p[2] * q[3], p[1] * q[2] + p[3] * q[3], p[0] * q[4] + p[2] * q[5] + p[4], p[1] * q[4] + p[3] * q[5] + p[5]]
  const rotate = (degrees) => {
    const a = (degrees * Math.PI) / 180
    return [Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0]
  }
  for (const spin of [0, 37.5, 200]) {
    const frame = droneFrame({ yaw: 15, pitch: 4, roll: -6 }, camera, spin)
    frame.units.forEach((unit, index) =>
      unit.blades.forEach((blade, i) => compose(unit.disc, rotate(bladeAngle(index, i, spin))).forEach((v, k) => assert.ok(Math.abs(v - blade[k]) < 1e-9, `rotor ${index} blade ${i} at ${spin}: ${k}`))),
    )
  }
})

test('rider fit at rest (F11): a drawing fits a later one by its points\' names, across the pitches where the silhouette gains or loses points', () => {
  // The renderer's camera. Where the silhouette's point count changes (measured 2026-11-17): yaw 0 at
  // pitch -6.00/-5.99 and 2.40/2.41; ±15 at -6.21/-6.20 and 2.48/2.49; ±25 at -6.61/-6.60 and 2.65/2.66;
  // ±30 at -6.91/-6.90 and 2.77/2.78; ±40 at -7.79/-7.78 and 3.14/3.15. At rest the pitch crosses them:
  // aim() holds the body's pitch at -6 and life and the board's tip swing it by about ±3.
  const camera = createCamera({ distance: 900, tilt: 12, origin: { x: 60, y: 147 } })
  const frame = (yaw, pitch) => mascotFrame({ ...restPose(), yaw, pitch }, camera)
  const apply2 = (m, p) => ({ x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] })
  const pairs = [
    [0, -5.9, -6.1],
    [0, 2.4, 2.5],
    [15, -6.1, -6.3],
    [-15, 2.45, 2.52],
    [-25, -6.5, -6.7],
    [25, 2.6, 2.7],
    [30, -6.85, -6.95],
    [-30, 2.75, 2.8],
    [40, -7.7, -7.9],
    [-40, 3.1, 3.2],
  ]
  for (const [yaw, p, q] of pairs) {
    const a = frame(yaw, p)
    const b = frame(yaw, q)
    assert.notEqual(a.body.outline.length, b.body.outline.length, `yaw ${yaw}, pitch ${p} to ${q}: the silhouette gains or loses points (else this case shows nothing)`)
    for (const [from, to] of [[a, b], [b, a]]) {
      const m = fitPoints(riderPoints(from), riderPoints(to))
      assert.ok(m, `yaw ${yaw}, pitch ${p} to ${q}: a map (by index there is none, the counts differ)`)
      // A tenth or two of a degree of pitch: the map is nearly the identity, and takes his eye and his feet where they go.
      for (const [i, v] of [1, 0, 0, 1].entries()) assert.ok(Math.abs(m[i] - v) < 0.02, `yaw ${yaw}, pitch ${p} to ${q}: m[${i}] ${m[i]}`)
      for (const [name, x, y] of [['eye', from.eye.centre, to.eye.centre], ['a foot', { x: from.feet.footL.cx, y: from.feet.footL.cy }, { x: to.feet.footL.cx, y: to.feet.footL.cy }]]) {
        const at = apply2(m, x)
        assert.ok(Math.hypot(at.x - y.x, at.y - y.y) < 0.35, `yaw ${yaw}, pitch ${p} to ${q}: ${name} lands ${Math.hypot(at.x - y.x, at.y - y.y).toFixed(3)} from where it is drawn`)
      }
    }
  }
  // Every silhouette point keeps its name from one drawing to the next; where both have the same points, the fit is the one by index.
  const a = frame(-10, -3)
  const b = frame(-11, -3.4)
  assert.deepEqual(a.body.outline.map((p) => p.id), b.body.outline.map((p) => p.id))
  const byIndex = fitAffine([...riderPoints(a).values()], [...riderPoints(b).values()])
  fitPoints(riderPoints(a), riderPoints(b)).forEach((v, i) => assert.ok(Math.abs(v - byIndex[i]) < 1e-9))
  // Too few points in common: no map (planRest then holds the sheet's last one).
  assert.equal(fitPoints(new Map([[1, { x: 0, y: 0 }], [2, { x: 1, y: 0 }], [3, { x: 0, y: 1 }]]), new Map([[1, { x: 0, y: 0 }], [2, { x: 1, y: 0 }], [4, { x: 0, y: 1 }]])), null)
})

test('drone rotors at rest (F11): each rotor\'s flipbook shows one page at a time, the one nearest its blades, turning both ways', () => {
  // The opacity a page's keyframes give at progress f (step-end: each keyframe's value holds until the next).
  const opacityAt = (keys, f) => keys.filter((k) => k.offset <= f).at(-1).opacity
  const near = (angle, page) => {
    const d = (((angle - 15 * page) % 90) + 90) % 90
    return Math.min(d, 90 - d)
  }
  for (const index of [0, 1, 2, 3]) {
    for (const spin of [0, 7.4, 37.5, 200, 359]) {
      const keys = Array.from({ length: 6 }, (_, page) => flipbookKeys(index, page, spin))
      for (const k of keys) k.forEach((key, i) => i && assert.ok(key.offset >= k[i - 1].offset && key.easing === 'step-end'))
      const seen = new Set()
      for (let n = 0; n < 240; n += 1) {
        const f = (n + 0.37) / 240
        const shown = keys.map((k, page) => (opacityAt(k, f) === 1 ? page : -1)).filter((page) => page >= 0)
        assert.equal(shown.length, 1, `rotor ${index} from ${spin}, at ${f.toFixed(3)}: one page shows (${shown})`)
        // The animation runs a quarter turn of spin in one iteration: at f the blades are at spin + 90 f.
        const angle = bladeAngle(index, 0, spin + 90 * f)
        assert.ok(near(angle, shown[0]) <= 7.5 + 1e-6, `rotor ${index} from ${spin}, at ${f.toFixed(3)}: page ${shown[0]} for blades at ${angle.toFixed(1)}`)
        seen.add(shown[0])
      }
      assert.equal(seen.size, 6, `rotor ${index} from ${spin}: every page takes its turn`)
    }
  }
  // Alternate rotors turn opposite ways: the pages run up on one and down on the next.
  const order = (index) => [0.02, 0.19, 0.36].map((f) => [0, 1, 2, 3, 4, 5].find((page) => opacityAt(flipbookKeys(index, page, 0), f) === 1))
  const step = (pages) => (((pages[1] - pages[0]) % 6) + 6) % 6
  assert.equal(step(order(1)), 1, `rotor 1 turns its pages forward (${order(1)})`)
  assert.equal(step(order(0)), 5, `rotor 0 turns its pages back (${order(0)})`)
})

test('drone model: four rotor units and a hull, ordered by depth, banking in 3D', () => {
  const camera = createCamera({ distance: 900, tilt: 26, origin: { x: 100, y: 74 } })
  const level = droneFrame({}, camera, 0)
  assert.equal(level.units.length, 4)
  assert.ok(finite(level))
  const order = (frame) => frame.units.map((unit, index) => [unit.z, index]).sort((a, b) => a[0] - b[0]).map(([, index]) => index).join()
  assert.notEqual(order(droneFrame({ yaw: 0 }, camera)), order(droneFrame({ yaw: 180 }, camera)))
  const banked = droneFrame({ roll: -25 }, camera)
  const left = banked.units.reduce((a, b) => (a.pod.cx < b.pod.cx ? a : b))
  const right = banked.units.reduce((a, b) => (a.pod.cx > b.pod.cx ? a : b))
  assert.ok(right.pod.cy > left.pod.cy, 'rolling right drops the right side')
  // Rotors spin: blade matrices change with the spin angle.
  assert.notDeepEqual(droneFrame({}, camera, 0).units[0].blades[0], droneFrame({}, camera, 40).units[0].blades[0])
  // Its highlight follows the light.
  assert.ok(droneFrame({}, camera, 0, { light: { x: 0.8, y: 0.4, z: 0.45 } }).hull.light.x > level.hull.light.x)
})

test('pose animator: tracks play on time, interruptions blend, untouched keys settle to rest', () => {
  const animator = createPoseAnimator({ blend: 90, settle: 180 })
  animator.play({ pose: { yaw: [[0, 0], [1, 90]] } }, 0, 1000)
  animator.tick(500)
  assert.ok(animator.pose.yaw > 40 && animator.pose.yaw < 50)
  // A new clip starting from a different value blends from where the body is (no pop).
  animator.play({ pose: { pitch: [[0, 20], [1, 20]] } }, 500, 400)
  const at = animator.pose.yaw
  animator.tick(510)
  assert.ok(Math.abs(animator.pose.yaw - at) < 5, 'yaw continues smoothly')
  assert.ok(animator.pose.pitch < 5, 'pitch eases in rather than jumping')
  assert.equal(animator.tick(900).active, false)
  assert.ok(near(animator.pose.yaw, 0, 1e-6), 'yaw settled back to rest')
  assert.ok(near(animator.pose.pitch, 20, 1e-6))
  // Loops keep running; hold() sets a still pose at once.
  animator.play({ loop: true, duration: 1000, pose: { sy: [[0, 1], [0.5, 1.02], [1, 1]] } }, 2000)
  assert.equal(animator.tick(4500).looping, true)
  animator.hold({ yaw: 12 })
  assert.equal(animator.pose.yaw, 12)
  assert.equal(animator.tick(5000).looping, false)
})

test('pose animator: the arms trail the body (overlapping action); freeze holds the pose', () => {
  const animator = createPoseAnimator({ blend: 0, settle: 180 })
  animator.play({ pose: { pitch: [[0, 0], [1, 30, 'linear']], armLa: [[0, 0], [1, 10, 'linear']] } }, 0, 400)
  animator.tick(200)
  assert.ok(near(animator.pose.pitch, 15, 1e-6))
  assert.ok(animator.pose.armLa > 0 && animator.pose.armLa < 5, 'the arm trails the body')
  assert.equal(animator.tick(400).active, true, 'the trailing arm is still finishing')
  assert.equal(animator.tick(400 + TRACK_LAG.armLa).active, false)
  assert.ok(near(animator.pose.armLa, 10, 1e-6))
  animator.play({ pose: { roll: [[0, 0], [1, 6]] } }, 1000, 300)
  animator.tick(1150)
  const held = { ...animator.pose }
  animator.freeze()
  assert.equal(animator.tick(2000).active, false)
  assert.deepEqual({ ...animator.pose }, held)
})

/* ------------------------------------------------------------- the assets */

const assetUrl = (name) => new URL(`../src/pocket/actors/assets/${name}`, import.meta.url)
const attributeValues = (svg, attribute) => new Set([...svg.matchAll(new RegExp(`${attribute}="([^"]+)"`, 'g'))].map((match) => match[1]))

test('asset interface: the models and decal sheets provide every part the manifest names', async () => {
  const manifest = JSON.parse(await readFile(assetUrl('manifest.json'), 'utf8'))
  const mascotSvg = await readFile(assetUrl('mascot.svg'), 'utf8')
  const droneSvg = await readFile(assetUrl('drone.svg'), 'utf8')
  const { mascot, drone } = manifest.assets
  for (const name of mascot.decalSheet) assert.ok(attributeValues(mascotSvg, 'data-decal').has(name), `mascot decal ${name}`)
  for (const part of Object.keys(mascot.decalParts)) assert.ok(attributeValues(mascotSvg, 'data-part').has(part), `mascot part ${part}`)
  for (const name of drone.decalSheet) assert.ok(attributeValues(droneSvg, 'data-decal').has(name), `drone decal ${name}`)
  for (const part of Object.keys(drone.decalParts)) assert.ok(attributeValues(droneSvg, 'data-part').has(part), `drone part ${part}`)
  assert.deepEqual([...mascot.pose].sort(), [...POSE_KEYS].sort())
  // The brief's minimum: separately controllable eye/pupil, eyelid, body, arms, legs, mouth, apple, sleep.
  const frame = mascotFrame({}, mascotCamera())
  for (const part of ['armL', 'armR', 'legL', 'legR']) assert.ok(frame.limbs[part].d, part)
  const holding = mascotFrame({ remote: 1, board: 1, hover: BOARD.hover }, mascotCamera())
  for (const part of Object.keys(mascot.modelParts)) assert.ok(part === 'body' ? frame.body.d : frame.limbs[part] || frame.feet[part] || frame[part] || holding[part], `model part ${part}`)
  for (const part of ['mouth', 'apple', 'zzz']) assert.ok(attributeValues(mascotSvg, 'data-part').has(part), part)
  // The eye, iris, lid and brow are modelled now, not drawn in the sheet.
  assert.ok(frame.eye.sclera && frame.eye.iris && frame.eye.pupil && frame.eye.glints.length === 2)
  assert.ok(!attributeValues(mascotSvg, 'data-decal').has('eye'))
  for (const shape of mascot.expressions.mouth) assert.match(mascotSvg, new RegExp(`data-mouth-shape="${shape}"`))
  for (const name of Object.keys(MASCOT_CLIPS)) assert.ok(mascot.clips.includes(name), `clip ${name} in manifest`)
})

test('clips: pose tracks use known keys with ordered times; decal tracks resolve in the sheet', async () => {
  const mascotSvg = await readFile(assetUrl('mascot.svg'), 'utf8')
  const params = { duration: 600, cycles: 2 }
  const rest = restPose()
  for (const [name, make] of Object.entries(MASCOT_CLIPS)) {
    const clip = make(params)
    for (const key of Object.keys(clip.expression ?? {})) assert.ok(key in EXPRESSION_DEFAULTS, `${name}: expression ${key}`)
    for (const [key, keys] of Object.entries(clip.pose ?? {})) {
      assert.ok(key in rest, `${name}: pose key ${key}`)
      let last = -1
      for (const [t, value] of keys) {
        assert.ok(t >= 0 && t <= 1 && t >= last, `${name}.${key}: times ascend`)
        assert.ok(Number.isFinite(value), `${name}.${key}: values are numbers`)
        last = t
      }
    }
    for (const track of clip.decals ?? []) {
      const [, attribute, value] = track.selector.match(/\[(data-[a-z-]+)="([^"]+)"\]/)
      assert.ok(attributeValues(mascotSvg, attribute).has(value), `${name}: ${track.selector}`)
    }
    for (const [at] of clip.beats ?? []) assert.ok(at >= 0 && at <= params.duration, `${name}: beat inside the clip`)
  }
  // Where the body faces is the look controller's (a spring toward what it looks at): no clip
  // turns it, and nothing moves the box (the walk and the travel are physical).
  for (const [name, make] of Object.entries(MASCOT_CLIPS)) {
    const clip = make(params)
    assert.ok(!('yaw' in (clip.pose ?? {})), `${name} leaves the heading alone`)
    assert.ok(!('mover' in clip), `${name} does not move the box`)
    for (const [, target] of clip.gaze ?? []) assert.ok(['cursor', 'sticker', 'button', 'cards', 'ripple', 'drone', 'viewer', 'ride'].includes(target), `${name}: gaze ${target}`)
  }
  // The Zs drift up a set number of times, then stop.
  for (const track of MASCOT_CLIPS.sleep({ cycles: 2 }).decals) assert.equal(track.iterations, 2)
})

// 250 KB until ADR-0004: the hoverboard took the layer's source past it (about 1.8 KB gzipped in the build).
// 270 KB until S12: Vodafone's pages (the left corner's ride across, the fixed floor, wrap and mark, and
// ./obstacles.js, 5.4 KB) added about 14 KB, to 278.7 KB; 285 KB keeps about the 6 KB of headroom it had.
// 285 KB until F6b (2026-11-17): making room when a fixed control comes or goes mid-album (obstacles.js's
// watch, the actors' refit and eased move) took it from 291,777 to 298,221 bytes; raised to the next 5 KB.
// 295 KB until 2026-11-17: the rest mode (F11), approved by the owner after the side-by-side: 323,296 bytes
// (from 298,223); raised to the next 5 KB.
test('budget: the whole actor layer (models, decals, motion, cursor, obstacles, JS, CSS) stays under 320 KB of source', async () => {
  const files = [
    '../src/pocket/actors/assets/mascot.svg',
    '../src/pocket/actors/assets/drone.svg',
    '../src/pocket/actors/timing.js',
    '../src/pocket/actors/mascot-brain.js',
    '../src/pocket/actors/drone-brain.js',
    '../src/pocket/actors/motion.js',
    '../src/pocket/actors/clips.js',
    '../src/pocket/actors/scope.js',
    '../src/pocket/actors/space.js',
    '../src/pocket/actors/mascot-model.js',
    '../src/pocket/actors/drone-model.js',
    '../src/pocket/actors/renderer.js',
    '../src/pocket/actors/physics.js',
    '../src/pocket/actors/gait.js',
    '../src/pocket/actors/drone-flight.js',
    '../src/pocket/pocket-actors.js',
    '../src/pocket/pocket-actors.css',
    '../src/pocket/pocket-cursor.js',
    '../src/pocket/pocket-cursor.css',
    '../src/pocket/obstacles.js',
  ]
  let total = 0
  for (const file of files) total += (await stat(new URL(file, import.meta.url))).size
  assert.ok(total < 320 * 1024, `${(total / 1024).toFixed(1)} KB uncompressed`)
})

/* -------------------------------------------------- Vodafone's pages (S12) */

test('ready flag and nodes: on the album root, never Vodafone\'s body; one instance at a time; data: rigs are read, not fetched', async () => {
  const source = await readFile(new URL('../src/pocket/pocket-actors.js', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /document\.body\.dataset/, 'nothing is written on <body>')
  assert.match(source, /pocketRoot\.dataset\.pocketActorReady = 'true'/)
  assert.match(source, /if \(instance\) \{/, 'a second instance is refused (the rigs\' SVG ids are fixed)')
  assert.match(source, /if \(\/\^data:\/i\.test\(url\)\) text = dataText\(url\)/)
  // Every node is made through make()/makeSvg() (marked), none with the bare helpers.
  const body = source.slice(source.indexOf('export const createPocketActors'))
  assert.doesNotMatch(body, /[^.\w]el\('/, 'no unmarked el() inside the actors')
  const created = body.match(/document\.createElement(NS)?\(/g) ?? []
  assert.equal(created.length, 1, 'only makeSvg() creates SVG nodes itself')
})

test('ride across: from the left corner the board turns round so its nose (-x) leads right, and keeps its pace', () => {
  // The cross ride keeps the board's pace (base, per px, least) and only has more room at the top.
  const most = TIMING.ride[3]
  const cross = crossPace(TIMING.ride)
  const short = planRide({ from: 100, to: 0, timing: TIMING.ride })
  const across = planRide({ from: -1150, to: 0, timing: cross })
  assert.equal(short.dir, -1)
  assert.equal(across.dir, 1)
  assert.ok(across.duration > most && across.duration <= 2700, `${across.duration} ms across 1150 px`)
  assert.equal(planRide({ from: -200, to: 0, timing: cross }).duration, planRide({ from: -200, to: 0, timing: TIMING.ride }).duration, 'a short ride is no faster or slower')
  // The board's flight turns it round (an angle spring, the short way) and its x still follows the path.
  const f = createFlight(180)
  f.x = across.from
  let lead = 0 // how far the board ever got ahead of its path's end (it must not fly past by much)
  for (let t = 0; t < across.duration + 1500; t += 16) {
    stepFlight(f, 16, { x: ridePoint(across, t).x, y: -22, z: 0 }, 180, BOARD_FLIGHT)
    lead = Math.max(lead, f.x)
  }
  assert.ok(lead < 30, `overshoots its spot by ${lead.toFixed(1)} px at most`)
  assert.ok(Math.abs(f.x) < 3, `arrives (${f.x.toFixed(1)})`)
  assert.ok(Math.abs(angleDelta(f.yaw.x, 180)) < 1, 'nose still leading right at the end of the ride')
  // The way back is a dash that is there before the page lands (1100 ms), whatever the width.
  assert.ok(planRide({ from: 0, to: -1150, timing: DASH_PACE }).duration <= 760)
  assert.ok(planRide({ from: 0, to: -280, timing: DASH_PACE }).duration >= 420)
})

test('watchFixedObstacles: a fixed control that comes, goes, changes size, changes class or ends a transition calls onChange; first sizes, other nodes and its children do not; stop() lets go (F6b)', () => {
  const made = { resize: [], mutation: [] }
  class FakeResize {
    constructor(callback) {
      Object.assign(this, { callback, targets: new Set() })
      made.resize.push(this)
    }
    observe(node) { this.targets.add(node) }
    unobserve(node) { this.targets.delete(node) }
    disconnect() { this.targets.clear() }
  }
  class FakeMutation {
    constructor(callback) {
      Object.assign(this, { callback, targets: new Map() })
      made.mutation.push(this)
    }
    observe(node, options) { this.targets.set(node, options) }
    disconnect() { this.targets.clear() }
  }
  // A node answers selector lists by its one class; `inside` is what it holds.
  const node = (name, w = 0, h = 0, inside = []) => {
    const listeners = new Set()
    const has = (selector) => selector.split(',').includes(name)
    return { name, offsetWidth: w, offsetHeight: h, listeners, matches: has, querySelector: (selector) => inside.find((n) => n.matches(selector)) ?? null, addEventListener: (_, fn) => listeners.add(fn), removeEventListener: (_, fn) => listeners.delete(fn) }
  }
  const mic = node('.vg-mic', 56, 56)
  const kbd = node('.vg-kbd', 40, 40)
  const card = node('.tr-card') // closed: no box
  const pill = node('.tr-pill', 150, 44)
  const trail = node('.tr', 0, 0, [pill, card]) // the trail's host, arriving in the guide's shadow root
  let inGuide = [mic, kbd] // every node in the shadow root, its descendants too
  const shadowRoot = { querySelectorAll: (selector) => inGuide.filter((n) => n.matches(selector)) }
  const doc = { body: {}, getElementById: () => null, querySelectorAll: (selector) => (selector === 'vg-guide' ? [{ shadowRoot }] : []) }
  const saved = { ResizeObserver: globalThis.ResizeObserver, MutationObserver: globalThis.MutationObserver }
  Object.assign(globalThis, { ResizeObserver: FakeResize, MutationObserver: FakeMutation })
  try {
    let calls = 0
    const stop = watchFixedObstacles(() => (calls += 1), doc)
    const [sizes] = made.resize
    const [tree] = made.mutation
    assert.deepEqual([...sizes.targets], [mic, kbd], 'a ResizeObserver on each control there')
    assert.deepEqual(tree.targets.get(doc.body), { childList: true }, "body's direct children")
    assert.deepEqual(tree.targets.get(shadowRoot), { childList: true, subtree: true }, "the guide's shadow root")
    assert.deepEqual(tree.targets.get(kbd), { attributes: true, attributeFilter: ['class'] }, 'its class')
    // The first sizes the observer reports are the ones it started with: nothing to do.
    sizes.callback([{ target: mic }, { target: kbd }])
    assert.equal(calls, 0, 'not on the first sizes')
    kbd.offsetWidth = 48
    sizes.callback([{ target: kbd }])
    assert.equal(calls, 1, 'a size that changed')
    tree.callback([{ type: 'attributes', target: kbd }])
    assert.equal(calls, 2, 'a class that changed (the keyboard button fades in by class)')
    const [end] = kbd.listeners
    end({ target: kbd, currentTarget: kbd })
    assert.equal(calls, 3, 'the end of its own transition')
    end({ target: {}, currentTarget: kbd })
    assert.equal(calls, 3, "not the end of a child's")
    tree.callback([{ type: 'childList', addedNodes: [node('.w')], removedNodes: [] }])
    assert.equal(calls, 3, 'not a node that is no control (a word in the transcript bar)')
    // The trail arrives: its pill and card are watched from then on; the card opening is a size that changed.
    inGuide = [mic, kbd, trail, pill, card]
    tree.callback([{ type: 'childList', addedNodes: [trail], removedNodes: [] }])
    assert.equal(calls, 4, 'a control that arrives')
    assert.ok(sizes.targets.has(card) && sizes.targets.has(pill), 'and is watched')
    Object.assign(card, { offsetWidth: 420, offsetHeight: 404 })
    sizes.callback([{ target: card }])
    assert.equal(calls, 5, 'the card that opens')
    inGuide = [mic, kbd]
    tree.callback([{ type: 'childList', addedNodes: [], removedNodes: [trail] }])
    assert.equal(calls, 6, 'a control that leaves')
    assert.ok(!sizes.targets.has(card) && card.listeners.size === 0, 'and is let go')
    stop()
    assert.equal(sizes.targets.size + tree.targets.size, 0, 'stop() disconnects both observers')
    assert.equal(mic.listeners.size + kbd.listeners.size, 0, 'and removes its listeners')
  } finally {
    Object.assign(globalThis, saved)
  }
})
