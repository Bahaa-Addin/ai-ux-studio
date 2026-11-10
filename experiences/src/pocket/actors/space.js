/**
 * A very small 3D kit for the Pocket actors: they are modelled in 3D and drawn as SVG every
 * frame, so they can turn, bank, lean and spin while staying crisp, outlined vector art.
 *
 * Conventions. Model space: x right, y up, z toward the viewer, units ≈ SVG user units.
 * Poses rotate the model (yaw turns it, pitch leans it forward, roll leans it sideways), then
 * the camera tilts the world (looking slightly down) and projects with perspective. Screen
 * coordinates are SVG ones (y down) relative to the actor's origin.
 *
 * Pure functions only (no DOM); covered by tests/pocket-actors.test.mjs.
 */

export const DEG = Math.PI / 180

/* -------------------------------------------------------------------- vectors */

export const v3 = (x = 0, y = 0, z = 0) => ({ x, y, z })
export const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z })
export const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z })
export const scale = (a, s) => ({ x: a.x * s, y: a.y * s, z: a.z * s })
export const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z
export const cross = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x })
export const length = (a) => Math.hypot(a.x, a.y, a.z)
export const normalize = (a) => {
  const l = length(a) || 1
  return { x: a.x / l, y: a.y / l, z: a.z / l }
}
export const mix = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t })

/* ------------------------------------------------------------------- matrices */

/** 3 × 3 matrices as row-major arrays of nine numbers. */
export const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1]

export const multiply = (a, b) => [
  a[0] * b[0] + a[1] * b[3] + a[2] * b[6], a[0] * b[1] + a[1] * b[4] + a[2] * b[7], a[0] * b[2] + a[1] * b[5] + a[2] * b[8],
  a[3] * b[0] + a[4] * b[3] + a[5] * b[6], a[3] * b[1] + a[4] * b[4] + a[5] * b[7], a[3] * b[2] + a[4] * b[5] + a[5] * b[8],
  a[6] * b[0] + a[7] * b[3] + a[8] * b[6], a[6] * b[1] + a[7] * b[4] + a[8] * b[7], a[6] * b[2] + a[7] * b[5] + a[8] * b[8],
]

export const apply = (m, p) => ({
  x: m[0] * p.x + m[1] * p.y + m[2] * p.z,
  y: m[3] * p.x + m[4] * p.y + m[5] * p.z,
  z: m[6] * p.x + m[7] * p.y + m[8] * p.z,
})

/** Turn about the vertical axis: positive yaw turns the model's front toward the viewer's right. */
export const rotateY = (deg) => {
  const c = Math.cos(deg * DEG)
  const s = Math.sin(deg * DEG)
  return [c, 0, s, 0, 1, 0, -s, 0, c]
}

/** Lean about the horizontal axis: positive pitch tips the top toward the model's front. */
export const rotateX = (deg) => {
  const c = Math.cos(deg * DEG)
  const s = Math.sin(deg * DEG)
  return [1, 0, 0, 0, c, -s, 0, s, c]
}

/** Lean sideways: positive roll tips the top toward the viewer's left. */
export const rotateZ = (deg) => {
  const c = Math.cos(deg * DEG)
  const s = Math.sin(deg * DEG)
  return [c, -s, 0, s, c, 0, 0, 0, 1]
}

export const scaling = (sx, sy, sz = sx) => [sx, 0, 0, 0, sy, 0, 0, 0, sz]

/** Pose orientation: squash/stretch first, then roll, pitch (lean) and finally yaw (turn). */
export const orientation = ({ yaw = 0, pitch = 0, roll = 0, sx = 1, sy = 1, sz = sx } = {}) =>
  multiply(rotateY(yaw), multiply(rotateX(pitch), multiply(rotateZ(roll), scaling(sx, sy, sz))))

/* --------------------------------------------------------------------- camera */

/**
 * A camera `distance` units in front of the model, tilted `tilt` degrees to look down on it.
 * `toView(p)` maps world points to view space; `project(p)` maps view points to the screen.
 */
export const createCamera = ({ distance = 900, tilt = 12, origin = { x: 0, y: 0 } } = {}) => {
  const tiltMatrix = rotateX(tilt)
  return {
    distance,
    tilt,
    tiltMatrix,
    toView: (p) => apply(tiltMatrix, p),
    /** Perspective scale at view depth z. */
    k: (z) => distance / Math.max(distance * 0.25, distance - z),
    project(p) {
      const k = distance / Math.max(distance * 0.25, distance - p.z)
      return { x: origin.x + p.x * k, y: origin.y - p.y * k, z: p.z, k }
    },
    origin,
  }
}

/* --------------------------------------------------------- projected shapes */

/**
 * Screen ellipse of an ellipsoid with view-space centre `c` and semi-axis vectors `a`, `b`, `d`
 * (each already rotated and sized). Exact for a parallel projection, scaled by the
 * perspective at the centre. Returns { cx, cy, rx, ry, angle } (angle in degrees).
 */
export const projectEllipsoid = (camera, c, a, b, d) => {
  const centre = camera.project(c)
  const k = centre.k
  // Rows of the 2 × 3 projected-axes matrix (screen y points down).
  const xs = [a.x * k, b.x * k, d.x * k]
  const ys = [-a.y * k, -b.y * k, -d.y * k]
  const p = xs[0] ** 2 + xs[1] ** 2 + xs[2] ** 2
  const r = ys[0] ** 2 + ys[1] ** 2 + ys[2] ** 2
  const q = xs[0] * ys[0] + xs[1] * ys[1] + xs[2] * ys[2]
  const mean = (p + r) / 2
  const spread = Math.hypot((p - r) / 2, q)
  return {
    cx: centre.x,
    cy: centre.y,
    rx: Math.sqrt(Math.max(0, mean + spread)),
    ry: Math.sqrt(Math.max(0, mean - spread)),
    angle: (0.5 * Math.atan2(2 * q, p - r)) / DEG,
    z: c.z,
  }
}

/**
 * SVG `matrix(a b c d e f)` that lays flat 2D artwork onto a 3D plane: local x runs along `u`,
 * local y (down in the artwork) along −`v`, both in view space, `unit` model units per artwork
 * unit, anchored at view point `o`. Used for faces, hull details, guard rings and rotor discs.
 */
export const planeMatrix = (camera, o, u, v, unit = 1) => {
  const at = camera.project(o)
  const k = at.k * unit
  return [u.x * k, -u.y * k, -v.x * k, v.y * k, at.x, at.y]
}

export const matrixAttribute = (m) => `matrix(${m.map((n) => (Number.isFinite(n) ? +n.toFixed(3) : 0)).join(' ')})`

/** The outline of two circles joined by their outer tangents (a tapered capsule), as an SVG path. */
export const capsulePath = (c1, r1, c2, r2) => {
  const dx = c2.x - c1.x
  const dy = c2.y - c1.y
  const d = Math.hypot(dx, dy)
  const f = (n) => +n.toFixed(2)
  const circle = (c, r) => `M${f(c.x - r)} ${f(c.y)}a${f(r)} ${f(r)} 0 1 0 ${f(2 * r)} 0a${f(r)} ${f(r)} 0 1 0 ${f(-2 * r)} 0Z`
  if (d <= Math.abs(r1 - r2) + 1e-6) return r1 >= r2 ? circle(c1, r1) : circle(c2, r2)
  const theta = Math.atan2(dy, dx)
  const phi = Math.acos((r1 - r2) / d)
  const at = (c, r, angle) => ({ x: c.x + r * Math.cos(angle), y: c.y + r * Math.sin(angle) })
  const a1 = at(c1, r1, theta + phi)
  const a2 = at(c2, r2, theta + phi)
  const b2 = at(c2, r2, theta - phi)
  const b1 = at(c1, r1, theta - phi)
  const large2 = 2 * phi > Math.PI ? 1 : 0
  const large1 = 2 * Math.PI - 2 * phi > Math.PI ? 1 : 0
  return `M${f(a1.x)} ${f(a1.y)}L${f(a2.x)} ${f(a2.y)}A${f(r2)} ${f(r2)} 0 ${large2} 0 ${f(b2.x)} ${f(b2.y)}L${f(b1.x)} ${f(b1.y)}A${f(r1)} ${f(r1)} 0 ${large1} 0 ${f(a1.x)} ${f(a1.y)}Z`
}

/** Catmull-Rom through screen points, closed, as an SVG path. */
export const closedSmoothPath = (points) => {
  const n = points.length
  if (n < 3) return ''
  const f = (v) => +v.toFixed(2)
  let d = `M${f(points[0].x)} ${f(points[0].y)}`
  for (let i = 0; i < n; i += 1) {
    const p0 = points[(i - 1 + n) % n]
    const p1 = points[i]
    const p2 = points[(i + 1) % n]
    const p3 = points[(i + 2) % n]
    d += `C${f(p1.x + (p2.x - p0.x) / 6)} ${f(p1.y + (p2.y - p0.y) / 6)} ${f(p2.x - (p3.x - p1.x) / 6)} ${f(p2.y - (p3.y - p1.y) / 6)} ${f(p2.x)} ${f(p2.y)}`
  }
  return `${d}Z`
}

/** Points of an elliptical arc on a 3D circle (centre `c`, radius `r`, plane axes `u`, `v`). */
export const ringPoints = (camera, c, u, v, r, from, to, steps = 18) =>
  Array.from({ length: steps + 1 }, (_, index) => {
    const t = (from + ((to - from) * index) / steps) * DEG
    const p = add(c, add(scale(u, r * Math.cos(t)), scale(v, r * Math.sin(t))))
    return { ...camera.project(p), angle: t }
  })

export const polyline = (points) => points.map((p, index) => `${index ? 'L' : 'M'}${+p.x.toFixed(2)} ${+p.y.toFixed(2)}`).join('')

/** A closed polygon through screen points, as an SVG path. */
export const polygon = (points) => (points.length > 2 ? `${polyline(points)}Z` : '')

/** Convex hull of screen points (monotone chain), counter-clockwise in screen space. */
export const convexHull = (points) => {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y)
  if (sorted.length < 3) return sorted
  const turn = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
  const lower = []
  for (const p of sorted) {
    while (lower.length >= 2 && turn(lower.at(-2), lower.at(-1), p) <= 0) lower.pop()
    lower.push(p)
  }
  const upper = []
  for (let index = sorted.length - 1; index >= 0; index -= 1) {
    const p = sorted[index]
    while (upper.length >= 2 && turn(upper.at(-2), upper.at(-1), p) <= 0) upper.pop()
    upper.push(p)
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)]
}
