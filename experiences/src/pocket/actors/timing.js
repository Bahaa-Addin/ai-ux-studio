/**
 * Timing and tuning for the Pocket actors (mascot and drone): milliseconds unless noted. One
 * table so the state machines, the motion and the tests agree. Ranges are [min, max];
 * production picks a value with a seeded random source, tests inject a fixed seed (or
 * override the table).
 *
 * Direction ("live stage", docs/adr/0002-pocket-actors-live-stage.md): both characters are
 * alive and move freely in 3D, physically (springs, a hoverboard and a drone that fly), and they
 * respond to what the person does: the mascot opens the pocket for every save, rides a short
 * way to stand under the drone, turns toward the saved cards and follows the cursor with its
 * eye; the drone hovers and plays with the cursor.
 *
 * ADR-0003: the mascot flies the drone with a remote. Its sticks lead the drone by `pilotLead`;
 * it lands the drone beside it before it dozes and flies it up again when it wakes.
 */

export const TIMING = {
  // Save: the mascot comes out from behind the pocket button, opens it and catches the item.
  emerge: 420, // from under the paper to behind the button
  grabLead: 280, // it has the button open this long before the item lands
  catch: 340, // the item drops in: the button closes, a squash, a grin
  slip: 380, // lets go and sinks back behind the button
  quickSlip: 200, // interrupted (the pocket is being opened)
  greetLanding: 450, // how long it holds the button open past the expected landing

  // Opening the pocket: it rides its hoverboard a short way to stand under the drone (ADR-0004).
  rideLead: 120, // the ride starts this long after the page starts turning
  ride: [450, 4, 750, 1700], // how long the board's path takes: base ms + ms per px, at least, at most
  rideSettle: 320, // after the path ends: the board brakes and wobbles to rest, then the remote comes up
  boardWander: [3, 4.5, 8, 3.5, 3.5, 9], // hovering: x px (inward only), bob and depth (model units), roll, pitch, yaw (degrees)

  // In the album.
  flinch: 420, // a ripple passes it: a small hop back, eye wide
  cardTurn: 350, // a pointer resting on a card this long turns the body toward it
  bodyMaxTurn: 40, // degrees: the body turns toward the cards at most this far (the eye stays on show)
  wake: 500,
  tuck: 280,
  untuck: 380,

  // Idle, measured from the last input (pointer, scroll, key, focus).
  sleepAt: 60000, // the one idle payoff: dozing
  yawn: 900,
  zzzCycles: 2, // the Zs drift up twice, then only the breathing remains

  // Ambient.
  blinkEvery: [2800, 6000],
  blink: 150,
  activityThrottle: 120,

  // Drone.
  droneSpinUp: 200,
  droneSettle: 400, // the pointer left: it stops being curious this long after
  droneHeart: 1600, // the first click of a page load: approach, the heart, return
  droneReturn: 600,
  droneHop: 520, // later clicks: a hop with one turn
  dronePokeCooldown: 380,
  droneDragThreshold: 6, // px of travel before a press becomes a drag
  droneSpringBack: 700,
  droneDodge: 650, // a ripple reaches it: it is shoved aside and recovers
  droneFollowAfter: 350, // the cursor must move slowly in open space this long before it follows
  droneFollowSpeed: 320, // px/s: slower than this counts as slow
  droneFollowReach: 420, // px: how near the cursor must be (from home) for it to come over
  droneFollowGap: 56, // px it keeps between its edge and the cursor
  droneFollowFor: 7000, // it gives up and goes home after this long
  droneWander: [10, 6, 14], // hover drift: x px, y px, depth (z) units

  // The pilot (ADR-0003): the mascot flies the drone with a remote.
  remoteRaise: 420, // it brings the remote up once it has ridden in
  pilotLead: 100, // the drone answers the sticks this much later (reaction and radio)
  stickRange: [380, 300], // px/s² of commanded acceleration that pushes a stick fully: across/up, depth
  droneLand: 1500, // flying down to the spot beside it (before it dozes)
  droneTakeOff: 1700, // rotors spin up on the ground, then it climbs home
  droneSpool: 380, // of that, the rotors spinning up before it lifts
  groundReach: 150, // px above the floor at which its contact shadow on the floor has faded out
  fightFor: 650, // the drone is dragged away this long: it shakes the remote and peers at it
  shake: 700,
  heartMax: 96, // px
  heartLinger: 600, // the drawn heart stays, then fades
  heartFade: 400,

  // The cursor on the Pocket page.
  rippleSpan: 900, // a click's ripple expands for this long
  rippleReach: 260, // px
  lightLag: 0.16, // seconds: the soft light trails the pointer a little
}

/**
 * Mulberry32: small, fast, seedable. Returns a function giving floats in [0, 1). Its `state()` reads
 * where it is and `state(value)` puts it back there (the actors run on ahead at rest and come back, F11).
 */
export const seededRandom = (seed = 1) => {
  let a = seed >>> 0
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  next.state = (value) => {
    if (value !== undefined) a = value >>> 0
    return a
  }
  return next
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
