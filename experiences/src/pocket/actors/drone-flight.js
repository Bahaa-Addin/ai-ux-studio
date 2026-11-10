/**
 * The drone's flight: a small physical model rather than a scripted path. A spring-damper
 * pulls it toward its target, but its thrust can only push so hard, so it speeds up, drifts
 * past a little and settles like a real quadcopter. It moves sideways by banking into the
 * acceleration (and pitches for depth), its attitude wobbles slightly as it corrects, its
 * heading drifts, and its rotors spin faster when it climbs or works hard.
 *
 * Units: x, y in px from its home (y down), z toward the viewer (shown as scale), angles in
 * degrees, rpm in degrees of rotor turn per ms. Pure: time is passed in (ms).
 */

import { stepSpring, stepAngleSpring, createSpring } from './physics.js'

export const FLIGHT = {
  frequency: 0.9, // Hz: how briskly it goes for its target
  damping: 0.72, // a touch of overshoot, as a hovering craft has
  maxAccel: 2600, // px/s²
  bank: 0.011, // degrees of bank per px/s² of sideways acceleration
  pitch: 0.014, // degrees of pitch per unit/s² of depth acceleration (and a little for climbing)
  maxTilt: 24,
  attitude: { frequency: 3.2, damping: 0.55 },
  heading: { frequency: 0.7, damping: 0.85 },
  rpm: { idle: 2.1, work: 0.00045, max: 3.4 },
}

/**
 * The mascot's hoverboard (ADR-0004) flies on the same model, tuned for a board: a little brisker
 * and bouncier (it chases a planned path and wobbles as it brakes), banking less, and its "rotor
 * speed" is the hover pads' glow (0..1). x and y are px (y down; 0 is the floor), z model units.
 */
export const BOARD_FLIGHT = {
  frequency: 1.7,
  damping: 0.6,
  maxAccel: 1500,
  bank: 0.016, // a ride of 80 px in 0.8 s tips it about 8°
  pitch: 0.012,
  maxTilt: 10,
  attitude: { frequency: 3.4, damping: 0.5 },
  heading: { frequency: 0.9, damping: 0.8 },
  rpm: { idle: 0.78, work: 0.0004, max: 1 },
}

/** A flight state at its home, level, heading `yaw`. */
export const createFlight = (yaw = 22) => ({
  x: 0,
  y: 0,
  z: 0,
  vx: 0,
  vy: 0,
  vz: 0,
  ax: 0,
  ay: 0,
  az: 0,
  roll: createSpring(0, FLIGHT.attitude),
  pitch: createSpring(0, FLIGHT.attitude),
  yaw: createSpring(yaw, FLIGHT.heading),
  rpm: createSpring(FLIGHT.rpm.idle, { frequency: 2, damping: 1 }),
})

const clampMagnitude = (x, y, z, max) => {
  const m = Math.hypot(x, y, z)
  if (m <= max || m === 0) return [x, y, z]
  return [(x * max) / m, (y * max) / m, (z * max) / m]
}

/** Banks and pitches into the current acceleration; turns toward `heading`; sets the rotor speed. */
const steer = (state, dt, heading, options) => {
  const o = { ...FLIGHT, ...options }
  const tilt = (value) => Math.max(-o.maxTilt, Math.min(o.maxTilt, value))
  stepSpring(state.roll, dt, tilt(-state.ax * o.bank))
  stepSpring(state.pitch, dt, tilt(state.az * o.pitch + state.ay * o.pitch * 0.25))
  if (o.continuous) stepSpring(state.yaw, dt, heading, o.heading.frequency, o.heading.damping)
  else stepAngleSpring(state.yaw, dt, heading, o.heading.frequency, o.heading.damping)
  const work = Math.hypot(state.ax, state.ay * 1.4, state.az) + Math.max(0, -state.ay) * 0.6
  stepSpring(state.rpm, dt, Math.min(o.rpm.max, o.rpm.idle + work * o.rpm.work))
}

/**
 * Flies toward `target` ({ x, y, z } px from home) for `dt` ms, heading for `heading` degrees.
 * `options` may override frequency, damping, maxAccel (a drag is stiffer than a hover).
 */
export const stepFlight = (state, dt, target, heading, options = {}) => {
  const o = { ...FLIGHT, ...options }
  let remaining = Math.max(0, Math.min(dt, 100)) / 1000
  const w = 2 * Math.PI * o.frequency
  let ax = 0
  let ay = 0
  let az = 0
  while (remaining > 1e-6) {
    const h = Math.min(remaining, 1 / 240)
    ;[ax, ay, az] = clampMagnitude(
      w * w * (target.x - state.x) - 2 * o.damping * w * state.vx,
      w * w * (target.y - state.y) - 2 * o.damping * w * state.vy,
      w * w * ((target.z ?? 0) - state.z) - 2 * o.damping * w * state.vz,
      o.maxAccel,
    )
    state.vx += ax * h
    state.vy += ay * h
    state.vz += az * h
    state.x += state.vx * h
    state.y += state.vy * h
    state.z += state.vz * h
    remaining -= h
  }
  state.ax = ax
  state.ay = ay
  state.az = az
  steer(state, dt, heading, options)
  return state
}

/**
 * Flies exactly along a scripted point (the heart): position is set, velocity and acceleration
 * come from the motion itself, so it still banks into the curves.
 */
export const followPoint = (state, dt, point, heading, options = {}) => {
  const seconds = Math.max(1, dt) / 1000
  const vx = (point.x - state.x) / seconds
  const vy = (point.y - state.y) / seconds
  const vz = ((point.z ?? 0) - state.z) / seconds
  const smoothing = 0.35 // finite differences are noisy at frame rate
  state.ax += (((vx - state.vx) / seconds) - state.ax) * smoothing
  state.ay += (((vy - state.vy) / seconds) - state.ay) * smoothing
  state.az += (((vz - state.vz) / seconds) - state.az) * smoothing
  state.vx = vx
  state.vy = vy
  state.vz = vz
  state.x = point.x
  state.y = point.y
  state.z = point.z ?? 0
  steer(state, dt, heading, options)
  return state
}

/** A shove (px/s), as from a ripple passing it: the flight model does the rest. */
export const kick = (state, vx, vy, vz = 0) => {
  state.vx += vx
  state.vy += vy
  state.vz += vz
  return state
}

/**
 * What a pilot commands to fly it to `target` now: the acceleration the flight model would ask
 * for (thrust-limited), in px/s², without moving it. The sticks show this; the drone itself flies
 * on what was commanded a moment earlier (pocket-actors.js delays its target by `pilotLead`).
 */
export const command = (state, target, options = {}) => {
  const o = { ...FLIGHT, ...options }
  const w = 2 * Math.PI * o.frequency
  const [ax, ay, az] = clampMagnitude(
    w * w * (target.x - state.x) - 2 * o.damping * w * state.vx,
    w * w * (target.y - state.y) - 2 * o.damping * w * state.vy,
    w * w * ((target.z ?? 0) - state.z) - 2 * o.damping * w * state.vz,
    o.maxAccel,
  )
  return { ax, ay, az }
}

/**
 * Stick positions (-1..1) for a commanded acceleration and turn, Mode 2: `turn` and `climb` on
 * one stick, `across` and `depth` on the other. `range` is the acceleration that pushes a stick
 * all the way ([across and up, depth]); a soft curve keeps small corrections visible.
 */
export const sticksFor = ({ ax = 0, ay = 0, az = 0 }, headingError = 0, range = [380, 300]) => {
  const soft = (v) => Math.tanh(v)
  return {
    turn: soft(headingError / 35),
    climb: soft(-ay / range[0]),
    across: soft(ax / range[0]),
    depth: soft(az / range[1]),
  }
}

/** Rotor speed only (on the ground: spinning down to a stop, or up before it lifts). */
export const spool = (state, dt, rpm) => {
  stepSpring(state.rpm, dt, rpm)
  stepSpring(state.roll, dt, 0)
  stepSpring(state.pitch, dt, 0)
  return state
}

/** True when it has come to rest on its target. */
export const flightSettled = (state, target, epsilon = 0.3) =>
  Math.hypot(state.x - target.x, state.y - target.y, state.z - (target.z ?? 0)) < epsilon && Math.hypot(state.vx, state.vy, state.vz) < epsilon * 4
