/**
 * The mascot's feet and its ride. Turning, it shuffles its feet in place. In the album it rides a
 * hoverboard (ADR-0004; it used to walk there): the board chases a planned path on the drone's
 * flight model (./drone-flight.js, BOARD_FLIGHT), so it lags behind the path, banks into the ride
 * and wobbles to rest by itself. Pure: the DOM side steps the flight and moves the box.
 */

const easeInOutSine = (t) => -(Math.cos(Math.PI * t) - 1) / 2
const easeInCubic = (t) => t * t * t

/**
 * A ride from `from` to `to` (px along the floor) taking `base` + `perPx` × distance ms, kept
 * between `least` and `most` (TIMING.ride). `away`: it leaves, speeding up and never braking.
 * Returns { from, to, dir, duration, away }, or null when there is nowhere to go.
 */
export const planRide = ({ from, to, timing: [base, perPx, least, most] = [450, 4, 750, 1700], away = false }) => {
  const distance = Math.abs(to - from)
  if (distance < 2) return null
  return { from, to, dir: Math.sign(to - from), duration: Math.round(Math.min(most, Math.max(least, base + distance * perPx))), away }
}

/** Where the path is `elapsed` ms into the ride: { x, done }. */
export const ridePoint = (plan, elapsed) => {
  const u = Math.min(1, Math.max(0, elapsed / plan.duration))
  return { x: plan.from + (plan.to - plan.from) * (plan.away ? easeInCubic(u) : easeInOutSine(u)), done: u >= 1 }
}

/** A shuffle in place while the body turns: the feet lift in turn, `rate` steps per second. */
export const shuffle = (ms, amount, rate = 5) => {
  if (amount <= 0) return {}
  const phase = (ms / 1000) * rate * Math.PI
  const lift = Math.sin(phase)
  return {
    legL: 14 * amount * Math.max(0, lift),
    legR: 14 * amount * Math.max(0, -lift),
    y: 1.2 * amount * Math.abs(lift),
    roll: 2 * amount * lift,
  }
}
