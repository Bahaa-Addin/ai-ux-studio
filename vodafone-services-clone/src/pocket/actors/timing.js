/**
 * Timing for the Pocket actors (mascot and drone), in milliseconds. One table so the state
 * machines, the animation clips and the tests agree. Ranges are [min, max]; production picks
 * a value with a seeded random source, tests inject a fixed seed (or override the table).
 */

export const TIMING = {
  // Page-tip greeting, from the moment the item is pocketed (the corner starts opening).
  greetDelay: 220, // stay hidden while the corner begins to open
  rise: 280, // rise from behind the curl: squash to stretch
  wave: 650, // one or two compact waves, with a small overshoot
  look: 200, // hold, eye on the pointer
  duck: 350, // back behind the page tip
  quickDuck: 180, // interrupted (the pocket is being opened)

  // Full page turn: "I've been caught".
  revealAt: 0.6, // fraction of the turn when the mascot pops up (55-70%)
  startle: 220, // anticipation recoil
  run: 620, // low, fast sprint to the opposite corner (550-750)
  recover: 780, // skid, overshoot, recover, embarrassed glance
  closeDuck: 260, // "Back to Services": duck before the page covers it

  // Reactions in the album.
  jump: 480, // card hover (420-560)
  beam: 360, // keyboard focus / tap: reduced equivalent, no travel
  cardDebounce: 650, // ignore further card crossings for this long
  wake: 650,
  tuck: 280,
  untuck: 380,

  // Idle ladder, measured from the last meaningful activity.
  impatientAt: 2000,
  impatient: 2600, // arms crossed, foot taps
  eatAt: [8000, 12000],
  eat: 3600, // apple appears, three bites, core tossed
  sleepAt: [18000, 28000],
  yawn: 1300,

  // Ambient behaviour while otherwise idle.
  glanceEvery: [6000, 10000],
  glance: [380, 260, 260, 220], // viewer, left, right, back to viewer
  blinkEvery: [2600, 5400],
  blink: 150,
  activityThrottle: 120,

  // Drone.
  droneHeart: 1550, // the heart itself (1.3-1.8 s)
  droneReturn: 420, // spring back to the home anchor after the heart
  droneEvade: 620, // startled hop, 12-24 px, then back
  droneEvadeCooldown: 900,
  dronePokeCooldown: 380,
  droneDragThreshold: 6, // px of travel before a press becomes a drag
  droneSpringBack: 520,
  heartLinger: 1400, // the drawn heart stays, then fades
  heartFade: 900,
}

/** Mulberry32: small, fast, seedable. Returns a function giving floats in [0, 1). */
export const seededRandom = (seed = 1) => {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A value inside [min, max] (or the number itself), drawn from `random`. */
export const pick = (range, random) => (Array.isArray(range) ? range[0] + (range[1] - range[0]) * random() : range)

/** Merges test overrides into the table; unknown keys are ignored. */
export const withTiming = (overrides = {}) => {
  const table = { ...TIMING }
  for (const [key, value] of Object.entries(overrides ?? {})) if (key in table) table[key] = value
  return table
}

/** The real clock. The state machines take this shape so tests can drive time by hand. */
export const realClock = {
  now: () => performance.now(),
  setTimeout: (fn, ms) => window.setTimeout(fn, ms),
  clearTimeout: (id) => window.clearTimeout(id),
}
