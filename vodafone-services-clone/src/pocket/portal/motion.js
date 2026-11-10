/**
 * Portal motion: the pure geometry and timing behind the Pocket's portal transition
 * (docs/adr/0005-pocket-portal-transition.md). No DOM here, so every curve is unit-tested
 * (tests/pocket-portal.test.mjs) and the scene modules only turn numbers into transforms.
 *
 * One camera, one space. The overlay is a CSS perspective of `P` px with its origin at the
 * viewport centre (cx, cy); z = 0 is the screen plane and negative z goes away from the
 * viewer. A point (x, y, z) lands on screen at
 *
 *     X = cx + (x - cx) · k,  Y = cy + (y - cy) · k,  k = P / (P - z)
 *
 * which is exactly what the browser does with `perspective: P` on the parent, so the
 * canvas-drawn tunnel, the CSS wall and the CSS portal agree to the pixel.
 *
 * The wall falls like a slab tipping on its bottom-back edge: θ'' = G sin θ, softened by an
 * air cushion before it meets the floor, with one small rebound. The destination approaches
 * along a planned curve in log scale (how big it looks), so it starts slowly, accelerates
 * and decelerates precisely onto the viewport. If the page is not ready at the hold point,
 * the approach eases into a hover and, once ready, a Hermite curve continues from the
 * current position and speed: never a jump, never a stop-start.
 */

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value))
export const lerp = (from, to, t) => from + (to - from) * t
export const smoothstep = (from, to, value) => {
  const t = clamp((value - from) / (to - from), 0, 1)
  return t * t * (3 - 2 * t)
}

/** Like smoothstep, but its acceleration is continuous too (no jolt where a fade starts or ends). */
export const smootherstep = (from, to, value) => {
  const t = clamp((value - from) / (to - from), 0, 1)
  return t * t * t * (t * (t * 6 - 15) + 10)
}

export const ease = {
  linear: (t) => t,
  outCubic: (t) => 1 - (1 - t) ** 3,
  inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  outQuint: (t) => 1 - (1 - t) ** 5,
}

/**
 * CSS-style cubic-bezier(x1, y1, x2, y2) as a function of t in [0, 1] (Newton, then
 * bisection), the same curve a designer would type into a stylesheet.
 */
export const cubicBezier = (x1, y1, x2, y2) => {
  const cx = 3 * x1
  const bx = 3 * (x2 - x1) - cx
  const ax = 1 - cx - bx
  const cy = 3 * y1
  const by = 3 * (y2 - y1) - cy
  const ay = 1 - cy - by
  const sampleX = (s) => ((ax * s + bx) * s + cx) * s
  const sampleY = (s) => ((ay * s + by) * s + cy) * s
  const slopeX = (s) => (3 * ax * s + 2 * bx) * s + cx
  const solve = (x) => {
    let s = x
    for (let i = 0; i < 8; i++) {
      const error = sampleX(s) - x
      if (Math.abs(error) < 1e-6) return s
      const slope = slopeX(s)
      if (Math.abs(slope) < 1e-6) break
      s -= error / slope
    }
    let lo = 0
    let hi = 1
    s = x
    for (let i = 0; i < 40; i++) {
      const value = sampleX(s)
      if (Math.abs(value - x) < 1e-6) break
      if (x > value) lo = s
      else hi = s
      s = (lo + hi) / 2
    }
    return s
  }
  return (t) => (t <= 0 ? 0 : t >= 1 ? 1 : sampleY(solve(t)))
}

/* ------------------------------------------------------------------ the camera */

/** Perspective distance for a viewport: deeper on big screens, never flatter than 900 px. */
export const perspectiveFor = (width, height, factor = 1.15) => Math.round(Math.max(900, Math.max(width, height) * factor))

/** Screen scale of something at depth z (z <= 0 is behind the screen plane). */
export const scaleAt = (P, z) => P / (P - z)

/** Depth at which something of natural size looks `scale` times as big. */
export const depthFor = (P, scale) => -P * (1 / scale - 1)

/** Projects a world point to the screen. */
export const project = (camera, x, y, z) => {
  const k = scaleAt(camera.P, z)
  return { x: camera.cx + (x - camera.cx) * k, y: camera.cy + (y - camera.cy) * k, k }
}

/** Depth of a floor point that appears on screen row Y (the floor is the plane y = floorY). */
export const floorDepthAtRow = (camera, floorY, Y) => {
  const k = (Y - camera.cy) / (floorY - camera.cy)
  return k <= 0 ? -Infinity : camera.P * (1 - 1 / k)
}

/** Atmospheric haze toward white: 0 at the screen plane, 1 far away. */
export const fogAt = (z, distance) => 1 - Math.exp(-Math.max(0, -z) / distance)

/* ------------------------------------------------------------------ the wall */

/**
 * Tabulates the fall of a slab hinged on its bottom-back edge. Returns { landAt, endAt,
 * angleAt(ms) } where angles are radians (0 upright, π/2 flat on the floor), `landAt` is the
 * first contact with the floor and `endAt` the moment it is at rest. Units are scaled so
 * the first contact happens at `duration` ms.
 *
 *   th0, w0    a tilt and speed it starts with
 *   shove      the hand that lets it go: a push that fades over `shoveFor` (from rest, so the
 *              motion starts smoothly, without the long hang near upright of a pure fall)
 *   cushion    air under the slab: damping that grows over the last stretch (from `from`)
 *   bounce     restitution at the floor (0 = dead stop)
 */
export const planFall = ({ duration = 1000, th0 = 0.035, w0 = 0.25, shove = 0, shoveFor = 0.35, cushion = 2.2, from = 1.15, bounce = 0.3, dt = 0.002 } = {}) => {
  const HALF = Math.PI / 2
  const samples = [0, th0]
  let th = th0
  let w = w0
  let t = 0
  let landed = 0
  while (t < 12) {
    const damping = th > from ? cushion * ((th - from) / (HALF - from)) * w : 0
    // Gravity, plus the hand that lets it go: a shove that fades (it starts from rest, so the
    // motion begins smoothly, but it does not hang near upright the way a pure fall would).
    w += (Math.sin(th) + shove * Math.exp(-t / shoveFor) - damping) * dt
    th += w * dt
    t += dt
    if (th >= HALF) {
      th = HALF
      if (!landed) landed = t
      if (Math.abs(w) < 0.06) {
        samples.push(t, th)
        break
      }
      w = -bounce * w
    }
    samples.push(t, th)
  }
  const scale = duration / landed
  const end = samples[samples.length - 2]
  const step = dt
  return {
    landAt: duration,
    endAt: end * scale,
    angleAt: (ms) => {
      const u = ms / scale
      if (u <= 0) return th0
      if (u >= end) return HALF
      const i = Math.min(samples.length / 2 - 2, Math.floor(u / step))
      const t0 = samples[i * 2]
      const a0 = samples[i * 2 + 1]
      const a1 = samples[i * 2 + 3]
      return lerp(a0, a1, clamp((u - t0) / step, 0, 1))
    },
  }
}

/**
 * The wall pushed over by the viewer (`camera.mode: 'walk'`). The viewer moves forward from the
 * click; when their eye reaches the wall (`gap` px after setting off) they push it at eye height
 * (`lever` px above the hinge), so it tips exactly as far as they have come: tan θ = (reach −
 * gap) / lever. The contact is soft over ±`soft` px (no jolt at the first touch) and one-sided:
 * the viewer can push the wall but never hold it back, so once gravity tips it faster than they
 * push it falls away from them on its own (θ'' = sin θ / τ², τ = `gravity` ms), slowed by a
 * cushion of air near the floor, and lands. `reach(ms)` is how far the viewer has come.
 * Returns { landAt, lastTouch, endAt, angleAt(ms) } (radians: 0 upright, π/2 flat).
 */
export const planPushedFall = ({ reach, gap, lever, soft = 50, gravity = 260, cushion = 6, from = 1.0, bounce = 0.12, dt = 0.25, until = 4000 }) => {
  const HALF = Math.PI / 2
  // The softening never reaches back past where the viewer starts (so nothing is pushed at rest).
  // Any unit will do for reach, gap, lever and soft, as long as it is the same one.
  const b = Math.min(soft, gap)
  const touching = (x) => (b <= 0 ? Math.max(0, x) : x <= -b ? 0 : x >= b ? x : ((x + b) * (x + b)) / (4 * b))
  const pushedTo = (ms) => Math.atan(touching(reach(ms) - gap) / lever)
  const tau2 = gravity * gravity
  const samples = [0, 0]
  let th = 0
  let w = 0 // rad per ms
  let t = 0
  let landAt = null
  let lastTouch = 0
  while (t < until) {
    // Free over this step: gravity, and the cushion near the floor.
    const damping = th > from ? cushion * ((th - from) / (HALF - from)) * w * gravity : 0
    const wFree = w + ((Math.sin(th) - damping) / tau2) * dt
    const thFree = th + wFree * dt
    const pushed = landAt === null ? pushedTo(t + dt) : 0
    if (thFree < pushed) {
      // Pushed: it goes exactly as far as the viewer pushes it.
      w = (pushed - th) / dt
      th = pushed
      lastTouch = t + dt
    } else {
      w = wFree
      th = thFree
    }
    t += dt
    if (th >= HALF) {
      th = HALF
      if (landAt === null) landAt = t
      if (Math.abs(w * gravity) < 0.06) {
        samples.push(t, th)
        break
      }
      w = -bounce * w
    }
    samples.push(t, th)
  }
  const end = samples[samples.length - 2]
  return {
    landAt: landAt ?? end,
    lastTouch,
    endAt: end,
    angleAt: (ms) => {
      if (ms <= 0) return 0
      if (ms >= end) return HALF
      const i = Math.min(samples.length / 2 - 2, Math.floor(ms / dt))
      return lerp(samples[i * 2 + 1], samples[i * 2 + 3], clamp((ms - samples[i * 2]) / dt, 0, 1))
    },
  }
}

/**
 * An ease whose speed is a smooth bump, x^p (1 − x)^q: from rest, up to its top speed at
 * p / (p + q) of the time, and down to rest again over the rest; a larger q is a longer, softer
 * ease-out. Returns x → 0..1 (tabulated, exact at both ends).
 */
export const bumpEase = (p, q, steps = 2000) => {
  const sum = new Float64Array(steps + 1)
  for (let i = 1; i <= steps; i++) {
    const x = (i - 0.5) / steps
    sum[i] = sum[i - 1] + x ** p * (1 - x) ** q
  }
  const total = sum[steps]
  return (x) => {
    if (x <= 0) return 0
    if (x >= 1) return 1
    const f = x * steps
    const i = Math.floor(f)
    return (sum[i] + (sum[Math.min(steps, i + 1)] - sum[i]) * (f - i)) / total
  }
}

/* ------------------------------------------------------------------ the approach */

/** Cubic Hermite from (p0, v0) to (p1, v1) over `duration` (velocities per ms). */
export const hermite = (p0, v0, p1, v1, duration) => (ms) => {
  const t = clamp(ms / duration, 0, 1)
  const t2 = t * t
  const t3 = t2 * t
  const value = (2 * t3 - 3 * t2 + 1) * p0 + (t3 - 2 * t2 + t) * v0 * duration + (-2 * t3 + 3 * t2) * p1 + (t3 - t2) * v1 * duration
  const slope = ((6 * t2 - 6 * t) * p0 + (3 * t2 - 4 * t + 1) * v0 * duration + (-6 * t2 + 6 * t) * p1 + (3 * t2 - 2 * t) * v1 * duration) / duration
  return { value, slope }
}

/**
 * The destination's journey toward the viewer, in u = ln(scale): u = ln(s0) far away,
 * u = 0 when it covers the viewport exactly. Planned as one eased curve.
 *
 * Waiting for a slow page. At `hold` (a fraction of the planned time, chosen while the
 * portal is still slow) the stepper checks readiness once. If the page is not ready it
 * brakes gently (a Hermite curve from the current position and speed to a stop `brake` ms
 * later, at constant-ish deceleration) and hovers there. As soon as it is ready (while
 * braking or hovering) a Hermite curve carries the current position and speed onto the
 * viewport in `finish` ms. Position and speed are continuous everywhere.
 *
 * Returns a stateful stepper: `at(ms, ready)` → { scale, u, slope, phase } with phase
 * 'approach' | 'hover' | 'arrived'. Feed it increasing times.
 */
export const planApproach = ({ startScale = 0.16, duration = 2100, hold = 0.2, curve = [0.6, 0, 0.35, 1], shape: plan, brake = 700, finish = 0.75 } = {}) => {
  const u0 = Math.log(startScale)
  // `shape`: progress (0..1 of the way in log scale) at a fraction of the time; by default the curve.
  const shape = plan ?? cubicBezier(...curve)
  const planned = (ms) => u0 * (1 - shape(clamp(ms / duration, 0, 1)))
  const slopeOf = (ms) => {
    const h = 4
    return (planned(Math.min(duration, ms + h)) - planned(Math.max(0, ms - h))) / (Math.min(duration, ms + h) - Math.max(0, ms - h))
  }
  const holdAt = duration * hold
  const finishIn = duration * finish
  let mode = 'plan' // 'plan' straight through, or 'plan' → 'wait' → 'finish'
  let stop = null // { ms, curve }: braking into the hover
  let last = null // { ms, u, slope } of the latest frame
  let end = null // { ms, curve }
  let now = 0
  const state = (u, slope, phase) => {
    last = { ms: now, u, slope }
    return { u, slope, scale: Math.exp(u), phase }
  }

  return {
    duration,
    holdAt,
    /** How big it is planned to look at `ms` (pure: what happens if the page is ready in time). */
    plannedScale: (ms) => Math.exp(planned(ms)),
    at: (ms, ready = true) => {
      now = ms
      if (mode === 'plan') {
        if (ms < holdAt || ready) {
          if (ms >= duration) return state(0, 0, 'arrived')
          return state(planned(ms), slopeOf(ms), 'approach')
        }
        // Not ready while still slow: brake to a stop, constant deceleration (distance v·T/2).
        const u = planned(holdAt)
        const v = slopeOf(holdAt)
        mode = 'wait'
        stop = { ms: holdAt, curve: hermite(u, v, Math.min(-0.02, u + (v * brake) / 2), 0, brake) }
      }
      if (mode === 'wait') {
        if (!ready) {
          const { value, slope } = stop.curve(ms - stop.ms)
          return state(value, slope, 'hover')
        }
        // From where the last frame was, so this frame already moves on.
        end = { ms: last.ms, curve: hermite(last.u, last.slope, 0, 0, finishIn) }
        mode = 'finish'
      }
      const elapsed = ms - end.ms
      if (elapsed >= finishIn) return state(0, 0, 'arrived')
      const { value, slope } = end.curve(elapsed)
      return state(value, slope, 'approach')
    },
  }
}

/**
 * How far the portal floats above the floor at depth z: a little while it is far (so its
 * reflection reads on the glossy floor), nothing at the screen plane, where it must sit
 * exactly on the viewport.
 */
export const liftAt = (z, lift, reach) => lift * (1 - Math.exp(-Math.max(0, -z) / reach))

/**
 * The walking viewer (`camera.mode: 'walk'`). From the viewer's eye the destination looks the same
 * whether they walk toward it or it comes to them (only the distance between them counts), and
 * the distance the viewer covers is what changes everything else: what is near (the wall, the
 * fallen page) passes by.
 * How far the way between them has closed (px, world units) when the destination looks `scale` big.
 */
export const walkedFor = (P, startScale, scale) => P * (1 / startScale - 1 / scale)

/**
 * The move as two motions on one clock: the viewer covers `travel` px of the way with the speed
 * curve `viewer` (x → 0..1 over the move), and the destination comes the rest toward them with
 * `door`. The viewer's own move is what near things show: planned in distance, it is felt at once
 * (the wall in front of them grows as they close in) however far away the destination is.
 *
 * Returns `shape` for planApproach (x → progress in log scale, how big the destination looks),
 * and, from how big it looks (so a hover for a slow page holds both still): `walkedAt(scale)`, the
 * px the viewer has covered, and `ownAt(scale)`, 0..1 of the destination's own way.
 */
export const splitApproach = ({ P, startScale, travel, viewer, door, steps = 2000 }) => {
  const way = walkedFor(P, startScale, 1)
  const mine = clamp(travel, 0, way)
  const theirs = way - mine
  const closed = new Float64Array(steps + 1)
  const walked = new Float64Array(steps + 1)
  for (let i = 0; i <= steps; i++) {
    walked[i] = mine * viewer(i / steps)
    closed[i] = walked[i] + theirs * door(i / steps)
  }
  const u0 = Math.log(startScale)
  const scaleFor = (d) => 1 / (1 / startScale - d / P)
  // Both only ever move forward, so how far the way has closed tells how far each has come.
  const walkedAt = (scale) => {
    const d = walkedFor(P, startScale, clamp(scale, startScale, 1))
    if (d <= 0) return 0
    if (d >= way) return mine
    let lo = 0
    let hi = steps
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1
      if (closed[mid] <= d) lo = mid
      else hi = mid
    }
    const span = closed[hi] - closed[lo]
    return lerp(walked[lo], walked[hi], span > 0 ? (d - closed[lo]) / span : 0)
  }
  return {
    way,
    travel: mine,
    shape: (x) => {
      const t = clamp(x, 0, 1) * steps
      const i = Math.min(steps - 1, Math.floor(t))
      return 1 - Math.log(scaleFor(lerp(closed[i], closed[i + 1], t - i))) / u0
    },
    walkedAt,
    ownAt: (scale) => (theirs > 0 ? clamp((walkedFor(P, startScale, clamp(scale, startScale, 1)) - walkedAt(scale)) / theirs, 0, 1) : 1),
  }
}

/**
 * The gentle rise and fall of walking: { x, rise } in px (rise: the eye moves up; x: it moves
 * right). One rise and fall per step (sin², smooth at the foot strike), a sway from side to side
 * over two steps. It grows over the first steps (`fadeIn` ms) and is gone by `fade[1]` of the
 * approach, so the arrival is exact.
 */
export const strideAt = ({ walking, progress, height, bob, steps, sway, fadeIn = 350, fade = [0.35, 0.75] }) => {
  const amplitude = bob * height * smootherstep(0, fadeIn, walking) * (1 - smootherstep(fade[0], fade[1], progress))
  if (!(amplitude > 0)) return { x: 0, rise: 0 }
  const phase = (walking / 1000) * steps * Math.PI
  return { x: amplitude * sway * Math.sin(phase), rise: amplitude * Math.sin(phase) ** 2 }
}
