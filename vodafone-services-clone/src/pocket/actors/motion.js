/**
 * Geometry for the Pocket actors. Pure functions only (no DOM), so the eye, the heart flight
 * and the anchor choice are unit-tested directly (tests/pocket-actors.test.mjs).
 */

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value))
export const lerp = (from, to, t) => from + (to - from) * t

export const easeInOutSine = (t) => -(Math.cos(Math.PI * t) - 1) / 2
export const easeOutBack = (t, c = 1.6) => 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2

/**
 * Where the pupil sits for a pointer at (dx, dy) px from the eye centre. The offset points at
 * the pointer and grows with distance up to `max` (the socket's travel, in the rig's units);
 * inside `deadZone` px the eye rests centred so it never trembles around the middle.
 */
export const gazeOffset = (dx, dy, { max, deadZone = 18, reach = 260 } = {}) => {
  const distance = Math.hypot(dx, dy)
  if (!(distance > deadZone)) return { x: 0, y: 0 }
  const amount = max * Math.min(1, (distance - deadZone) / reach)
  return { x: (dx / distance) * amount, y: (dy / distance) * amount }
}

/** Frame-rate independent low-pass: moves `current` toward `target` with time constant `tau`. */
export const smoothToward = (current, target, dt, tau = 70) => {
  const k = 1 - Math.exp(-Math.max(0, dt) / tau)
  return current + (target - current) * k
}

/** The side of the sheet the curl starts from, for a curl direction `phi` (radians). */
export const curlSide = (phi) => (Math.cos(phi) >= 0 ? 'right' : 'left')
export const oppositeSide = (side) => (side === 'right' ? 'left' : 'right')

/* --------------------------------------------------------------- the heart */

/** Classic parametric heart; the tip points down in screen coordinates. */
const heartAt = (t) => ({
  x: 16 * Math.sin(t) ** 3,
  y: -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)),
})

/** A quadratic Bézier sampled into `n` points (excluding its start). */
const quad = (from, via, to, n) =>
  Array.from({ length: n }, (_, index) => {
    const t = (index + 1) / n
    return {
      x: (1 - t) ** 2 * from.x + 2 * (1 - t) * t * via.x + t * t * to.x,
      y: (1 - t) ** 2 * from.y + 2 * (1 - t) * t * via.y + t * t * to.y,
    }
  })

/**
 * The drone's flight: from `home` it swoops down to the heart's right lobe, traces the heart
 * (over the right lobe, through the notch, round the left lobe, down to the tip and back up),
 * then rises home again. `box` is where the heart is drawn. Points carry a slight, repeatable
 * wobble so the line reads as drawn by hand rather than plotted.
 *
 * Only the heart is inked: `heart` holds its own path (`d`) and where it starts and ends along
 * the flight (arc lengths `start`, `end`), so the approach and return leave no trail. `times`
 * paces the flight like a pen: it slows into sharp turns (the notch and the tip) and runs on
 * the open curves; sample it with sampleFlight().
 */
export const heartFlight = ({ home, box, samples = 96, wobble = 0.35, slow = 2.4 }) => {
  const raw = Array.from({ length: samples + 1 }, (_, index) => heartAt(Math.PI / 2 - (index / samples) * 2 * Math.PI))
  const xs = raw.map((p) => p.x)
  const ys = raw.map((p) => p.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const heart = raw.map((p, index) => {
    const x = box.x + ((p.x - minX) / (maxX - minX)) * box.w
    const y = box.y + ((p.y - minY) / (maxY - minY)) * box.h
    const jitter = index === samples ? 0 : wobble * (0.6 * Math.sin(index * 1.7) + 0.4 * Math.sin(index * 0.63 + 1.1))
    return { x: x + jitter, y: y - jitter * 0.6 }
  })
  heart[samples] = { ...heart[0] } // the line closes exactly where it began
  const entry = heart[0]
  const span = Math.hypot(home.x - entry.x, home.y - entry.y)
  const mid = { x: (home.x + entry.x) / 2, y: (home.y + entry.y) / 2 }
  // A small loop between home and the heart: out below the line, back just above it.
  const leadIn = quad(home, { x: mid.x + span * 0.1, y: mid.y + span * 0.36 }, entry, 14)
  const leadOut = quad(entry, { x: mid.x - span * 0.05, y: mid.y - span * 0.2 }, home, 14)
  const points = [{ ...home }, ...leadIn, ...heart.slice(1), ...leadOut]
  const heartFrom = leadIn.length // index of the heart's first point (the entry)
  const heartTo = heartFrom + samples

  const lengths = [0]
  for (let index = 1; index < points.length; index += 1) {
    const a = points[index - 1]
    const b = points[index]
    lengths.push(lengths[index - 1] + Math.hypot(b.x - a.x, b.y - a.y))
  }

  // Pen pacing: each segment's time grows with how sharply the path turns around it.
  const turnAt = points.map((p, index) => {
    if (index === 0 || index === points.length - 1) return 0
    const a = points[index - 1]
    const b = points[index + 1]
    const d = Math.abs(Math.atan2(b.y - p.y, b.x - p.x) - Math.atan2(p.y - a.y, p.x - a.x))
    return Math.min(1, Math.min(d, 2 * Math.PI - d) / (Math.PI / 2))
  })
  const eased = turnAt.map((_, index) => {
    let sum = 0
    let weight = 0
    for (let k = -3; k <= 3; k += 1) {
      const value = turnAt[index + k]
      if (value === undefined) continue
      const w = 4 - Math.abs(k)
      sum += value * w
      weight += w
    }
    return sum / weight
  })
  const times = [0]
  for (let index = 1; index < points.length; index += 1) {
    const segment = lengths[index] - lengths[index - 1]
    times.push(times[index - 1] + segment * (1 + slow * Math.max(eased[index - 1], eased[index])))
  }
  const total = times[times.length - 1] || 1
  for (let index = 0; index < times.length; index += 1) times[index] /= total

  const heartPoints = points.slice(heartFrom, heartTo + 1)
  return {
    points,
    lengths,
    times,
    length: lengths[lengths.length - 1],
    d: smoothPath(points),
    heart: { d: smoothPath(heartPoints), start: lengths[heartFrom], end: lengths[heartTo], from: heartFrom, to: heartTo },
  }
}

/**
 * Position, heading (radians) and arc length `s` a fraction `tau` of the way through a flight's
 * time (see heartFlight's `times`): slower where the path turns sharply.
 */
export const sampleFlight = ({ points, lengths, times }, tau) => {
  const target = clamp(tau, 0, 1)
  let low = 0
  let high = times.length - 1
  while (high - low > 1) {
    const middle = (low + high) >> 1
    if (times[middle] < target) low = middle
    else high = middle
  }
  const a = points[low]
  const b = points[high]
  const span = times[high] - times[low] || 1
  const t = clamp((target - times[low]) / span, 0, 1)
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), angle: Math.atan2(b.y - a.y, b.x - a.x), s: lerp(lengths[low], lengths[high], t) }
}

/** Position and heading (radians) a fraction `u` of the way along a flight by arc length. */
export const samplePath = ({ points, lengths, length }, u) => {
  const target = clamp(u, 0, 1) * length
  let low = 0
  let high = lengths.length - 1
  while (high - low > 1) {
    const middle = (low + high) >> 1
    if (lengths[middle] < target) low = middle
    else high = middle
  }
  const a = points[low]
  const b = points[high]
  const segment = lengths[high] - lengths[low] || 1
  const t = (target - lengths[low]) / segment
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), angle: Math.atan2(b.y - a.y, b.x - a.x) }
}

/** Catmull-Rom through the points, written as cubic Béziers (an SVG path `d`). */
export const smoothPath = (points) => {
  if (points.length < 2) return ''
  const r = (n) => Math.round(n * 10) / 10
  let d = `M${r(points[0].x)} ${r(points[0].y)}`
  for (let index = 0; index < points.length - 1; index += 1) {
    const p0 = points[Math.max(0, index - 1)]
    const p1 = points[index]
    const p2 = points[index + 1]
    const p3 = points[Math.min(points.length - 1, index + 2)]
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 }
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 }
    d += `C${r(c1.x)} ${r(c1.y)} ${r(c2.x)} ${r(c2.y)} ${r(p2.x)} ${r(p2.y)}`
  }
  return d
}

/* --------------------------------------------------------- collision-free anchors */

/** Rectangles as { left, top, right, bottom }. */
export const rect = (left, top, width, height) => ({ left, top, right: left + width, bottom: top + height, width, height })

export const rectsOverlap = (a, b, margin = 0) =>
  a.left < b.right + margin && a.right > b.left - margin && a.top < b.bottom + margin && a.bottom > b.top - margin

export const contains = (outer, inner) =>
  inner.left >= outer.left && inner.top >= outer.top && inner.right <= outer.right && inner.bottom <= outer.bottom

/**
 * First candidate (in priority order) that stays inside `bounds` and clear of every obstacle.
 * Candidates are { name, rect, band? }; returns the candidate or null when nothing fits.
 */
export const chooseAnchor = ({ candidates, obstacles, bounds, margin = 8 }) =>
  candidates.find((candidate) => candidate && contains(bounds, candidate.rect) && !obstacles.some((obstacle) => rectsOverlap(candidate.rect, obstacle, margin))) ?? null

/**
 * Plans the heart flight: the biggest heart (up to `max`) left of the drone's home whose whole
 * flight keeps the drone's footprint (`drone` w × h, centred on the path) inside `bounds` and
 * clear of every obstacle. It shrinks the heart until it fits and returns { box, flight }, or
 * null when even a `min`-sized heart would brush content (the drone then just hovers home).
 */
export const planHeart = ({ home, band, obstacles, bounds, drone, gap = 18, min = 64, max = 132, margin = 6 }) => {
  const centre = { x: home.left + home.width / 2, y: home.top + home.height / 2 }
  let left = bounds.left
  for (const obstacle of obstacles) {
    const overlapsBand = obstacle.top < band.bottom && obstacle.bottom > band.top
    if (overlapsBand && obstacle.right <= home.left) left = Math.max(left, obstacle.right + margin)
  }
  const right = home.left - gap
  const top = band.top + drone.h / 2
  const bottom = band.bottom - drone.h / 2
  const clears = (point) => {
    const footprint = rect(point.x - drone.w / 2, point.y - drone.h / 2, drone.w, drone.h)
    return contains(bounds, footprint) && !obstacles.some((obstacle) => rectsOverlap(footprint, obstacle, margin))
  }
  // Biggest heart first; for each size try it close to home, then further left (a longer
  // loop out), with its entry level with home, then centred in the band.
  for (let size = Math.min(max, (bottom - top) * 1.12); size >= min; size *= 0.9) {
    const h = size * 0.9
    for (const shift of [0, size * 0.35, size * 0.7]) {
      const x = right - shift - size
      if (x - drone.w / 2 < left) break
      for (const y of [centre.y - h * 0.3, (top + bottom) / 2 - h / 2]) {
        const box = { x, y: clamp(y, top, bottom - h), w: size, h }
        const flight = heartFlight({ home: centre, box })
        if (flight.points.every(clears)) return { box, flight }
      }
    }
  }
  return null
}
