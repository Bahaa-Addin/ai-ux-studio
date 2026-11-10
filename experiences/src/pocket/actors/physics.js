/**
 * Motion physics for the Pocket actors. Every value that moves is a mass on a spring, so it
 * starts, follows through and settles like a real object instead of following a curve; small
 * wandering noise keeps a resting body alive. Pure functions (time is passed in, in ms), so
 * they are unit-tested directly (tests/pocket-actors.test.mjs).
 */

/** A damped spring holding `x` (and its velocity `v`) toward a target. */
export const createSpring = (x = 0, { frequency = 2, damping = 1 } = {}) => ({ x, v: 0, target: x, frequency, damping })

/**
 * Advances a spring by `dt` ms toward `target`. `frequency` is in Hz, `damping` is the damping
 * ratio (1 settles without overshoot, below 1 overshoots and wobbles). Fixed sub-steps keep it
 * stable at any frame rate; a long gap (a background tab) is capped at 100 ms.
 */
export const stepSpring = (spring, dt, target = spring.target, frequency = spring.frequency, damping = spring.damping) => {
  let remaining = Math.max(0, Math.min(dt, 100)) / 1000
  const w = 2 * Math.PI * frequency
  while (remaining > 1e-6) {
    const h = Math.min(remaining, 1 / 240)
    const a = w * w * (target - spring.x) - 2 * damping * w * spring.v
    spring.v += a * h
    spring.x += spring.v * h
    remaining -= h
  }
  spring.target = target
  return spring.x
}

/** Puts a spring at `x`, at rest. */
export const resetSpring = (spring, x = 0) => {
  spring.x = x
  spring.v = 0
  spring.target = x
  return spring
}

/** True once a spring is within `epsilon` of its target and nearly still. */
export const springSettled = (spring, epsilon = 0.01) => Math.abs(spring.x - spring.target) < epsilon && Math.abs(spring.v) < epsilon * 10

/** The signed difference `to - from` in degrees, the short way round (-180, 180]. */
export const angleDelta = (from, to) => ((((to - from) % 360) + 540) % 360) - 180

/** Advances an angle spring (degrees) toward `target` the short way round. */
export const stepAngleSpring = (spring, dt, target, frequency, damping) => stepSpring(spring, dt, spring.x + angleDelta(spring.x, target), frequency, damping)

/**
 * Smooth wandering in about [-1, 1]: three sines at unrelated frequencies with random phases,
 * so it never visibly repeats. `hz` is the main rate.
 */
export const createWander = (random, { hz = 0.15 } = {}) => {
  const parts = [
    [1, 0.6],
    [2.37, 0.28],
    [4.13, 0.12],
  ].map(([multiple, amount]) => ({ f: hz * multiple * (0.85 + 0.3 * random()), p: random() * Math.PI * 2, amount }))
  return (ms) => parts.reduce((sum, { f, p, amount }) => sum + amount * Math.sin(2 * Math.PI * f * (ms / 1000) + p), 0)
}

/** Smoothstep on [0, 1]. */
export const smooth01 = (t) => {
  const u = Math.min(1, Math.max(0, t))
  return u * u * (3 - 2 * u)
}
