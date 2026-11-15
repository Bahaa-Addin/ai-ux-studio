/**
 * The mascot as a 3D model, drawn as SVG. Pure geometry (no DOM): `mascotFrame(pose, camera)`
 * returns everything the renderer needs for one frame.
 *
 * Body. A "generalised cylinder": circular cross-sections swept along a spine. The lower part
 * is a sphere (the droplet's bulb); above it the spine rises and curls over to the right into
 * the flame tip while the sections taper to a point. Its outline is solved analytically for
 * every pose (where the surface turns away from the camera), so turning, leaning or squashing
 * the body changes its silhouette the way a real object would, and the tip swings round when
 * it turns.
 *
 * The eye is modelled, not painted: a shallow lens bulging out of the curved body, its rim
 * following the surface, so it wraps round the body as it turns and never leaves the outline
 * (the renderer clips it to the body). The iris and pupil are discs on the lens that rotate
 * toward what the mascot looks at; the glints sit where the light reflects, so they stay put
 * while the eye moves; the upper lid is a shell over the lens that closes from the top.
 * The mouth and cheeks are flat artwork laid on the body's tangent plane (decals). Arms and
 * legs are tapered capsules from surface anchors, feet are small ellipsoids, the shadow is a
 * soft disc on the ground that moves away from the light.
 *
 * The hoverboard: in the album it stands on a floating board (BOARD, ADR-0004), Vodafone red,
 * its nose curving up at the leading (left) end. It is lofted from cross-sections along its
 * length, so the nose bends like a real deck. The board has its own attitude (roll, pitch, yaw)
 * and height; the body is lifted onto its deck (pose `y`) while the ground shadow stays on the
 * floor, and the board's hover pads light the floor under it.
 *
 * The remote: in the album it flies the drone with a small RC controller (REMOTE), modelled in
 * the body's own frame so it turns, leans and squashes with it. Its hands hold the case's ends
 * (`holdRemote` solves the arms in model space, so they reach the grips in any pose), its
 * thumbs rest on the two sticks, and the sticks tilt with what it tells the drone to do.
 *
 * Model units match the old flat rig: about 150 tall, ground at y = 0, facing +z.
 */

import {
  DEG,
  v3,
  add,
  sub,
  scale,
  dot,
  cross,
  length,
  normalize,
  apply,
  multiply,
  orientation,
  rotateX,
  rotateZ,
  capsulePath,
  projectEllipsoid,
  planeMatrix,
  closedSmoothPath,
  convexHull,
  polygon,
  polyline,
} from './space.js'

export const MASCOT_MODEL = {
  bulb: { y: 59, radius: 44 }, // the droplet's round lower part
  tip: v3(47, 146, -6), // where the flame curls to
  spineUp: [v3(0, 59, 0), v3(-1, 102, 0), v3(2, 140, -2)], // Bézier from the bulb centre to the tip
  // The eye: a lens of rim radius `radius` bulging `bulge` out of the body at height `y`.
  // Iris, ring and pupil radii as in the artwork; `travel` is how far (degrees) it can look.
  eye: { y: 79, angle: 0, radius: 18.6, bulge: 4.5, iris: 10.2, ring: 6.4, pupil: 4.4, travel: 11 },
  mouth: { y: 41, angle: 0 },
  blush: { y: 51, angle: 40 },
  shoulder: { y: 51, angle: 78 },
  hip: { y: 22, angle: 30 },
  arm: { length: 25, root: 4.6, end: 3.6 }, // 21 and 13 until the remote grew (ADR-0004 review)
  leg: { length: 16, root: 3.9, end: 3.4 },
  foot: { rx: 5.2, ry: 3.4, rz: 7.6 },
  shadow: { rx: 31, rz: 13 },
  light: normalize(v3(-0.45, 0.55, 0.7)), // fixed in view space, upper left and in front
}

/**
 * The hoverboard (model units, in the world's frame, not the body's: the rider turns on it). A
 * rounded deck along x in Vodafone red, its nose (the -x end, which leads as it rides in toward
 * the content) curving up; two hover pads underneath glowing, and a red haze on the floor under
 * it that fades as it rises. `feet`: how high the soles are in the body's frame, so the deck's
 * top goes there.
 */
/** How high its soles are above the ground, standing at rest (model units). */
const restSoles = () => MASCOT_MODEL.hip.y + normalize(v3(0.16, -1, 0)).y * MASCOT_MODEL.leg.length - 1 - MASCOT_MODEL.foot.ry

export const BOARD = {
  length: 116,
  width: 38,
  thickness: 8.5,
  feet: restSoles(),
  hover: 22, // the deck's underside above the floor while it hovers (bobbing round it)
  round: 3.2, // superellipse exponent of the deck's outline (higher: squarer ends)
  nose: { length: 32, rise: 17 }, // the last 32 units at the -x end curve up by 17
  pads: { x: [-0.2, 0.3], r: 9 },
}

/**
 * Where the board is sliced along its length (x): close together along the nose and at the
 * rounded ends, where it bends; a few across the flat between.
 */
const BOARD_STATIONS = (() => {
  const { length, nose } = BOARD
  const tip = -length / 2
  const flat = tip + nose.length
  const tail = length / 2 - 14
  const xs = []
  for (let i = 0; i <= 11; i += 1) xs.push(tip + nose.length * (1 - Math.cos((Math.PI / 2) * (i / 11))))
  for (let i = 1; i <= 3; i += 1) xs.push(flat + ((tail - flat) * i) / 4)
  for (let i = 0; i <= 6; i += 1) xs.push(tail + 14 * Math.sin((Math.PI / 2) * (i / 6)))
  return xs
})()

/**
 * The RC controller (model units, in the body's frame). Held in front of the chest with its
 * face tipped toward the viewer (a cartoon cheat: a real pilot tips it toward their own eyes)
 * so the sticks read; `lowered` is where it is while it is brought up or put away, `droop` how
 * it sags while the mascot sleeps. Sticks: +x is the viewer's right with the body facing front.
 * The stick on the model's +x side (the pilot's own left) is throttle and turn (Mode 2); the
 * other one moves the drone across and in depth.
 */
export const REMOTE = {
  width: 58, // 42 × 16 × 5.4 until the owner asked for it bigger and more prominent
  depth: 22,
  thickness: 7.5,
  held: { y: 28, gap: 11, tilt: 50 }, // held out in front of its belly
  lowered: { y: 12, gap: 1, tilt: 70 },
  droop: { y: -6, z: -3, tilt: 22 },
  stick: { x: 14.5, z: 0.5, length: 9, gimbal: 5.2, tip: 2.8, travel: 0.62, width: 1.05 },
  antenna: { x: 23.5, length: 18, out: 0.5, up: 1, width: 1.35, tip: 2.2 }, // from the far right corner, up and out past the hand
  led: { x: 0, z: 7.8, r: 2 },
  grip: 2, // the hands hold the case this far in from its ends
  shoulder: 42, // where the arm roots sit while holding it (degrees round from the front; 78 at rest)
}

/** Rest pose. Angles in degrees; arms: abduct (0 = down, 90 = out), flex (+ = forward). */
export const restPose = () => ({
  x: 0,
  y: 0,
  z: 0,
  yaw: 0,
  pitch: 0,
  roll: 0,
  sx: 1,
  sy: 1,
  bend: 0, // the flame tip's follow-through, sideways
  nod: 0, // the tip bending toward / away from the front
  armLa: 26,
  armLf: 8,
  armLr: 1,
  armRa: 26,
  armRf: 8,
  armRr: 1,
  handL: 0,
  handR: 0,
  legL: 0,
  legR: 0,
  footR: 0,
  shadow: 1,
  gazeX: 0, // where the eye looks, degrees from straight ahead: + toward the model's +x side
  gazeY: 0, // + up
  lid: 0, // upper lid: 0 open, 0.5 half, 1 closed
  wide: 0, // 0..1: the eye opens wider and the iris shrinks (surprise)
  brow: 0, // 0 hidden, 1 raised, -1 lowered
  closed: 0, // 1: the contented closed eye (a lash arch on the skin) replaces the eye
  shoulderL: MASCOT_MODEL.shoulder.angle, // arm roots, degrees round from the front
  shoulderR: MASCOT_MODEL.shoulder.angle,
  remote: 0, // 0 no remote, 1 held in front of the chest (between: being brought up or put away)
  droop: 0, // 1: sagging in its hands (asleep)
  stickLX: 0, // the sticks, -1..1: L is the stick on the model's -x side (across and depth),
  stickLY: 0, // R the one on its +x side (turn and throttle); X across, Y away from the body
  stickRX: 0,
  stickRY: 0,
  remoteX: 0, // a jolt: offset (model units) and roll (degrees) of the remote in its hands
  remoteY: 0,
  remoteRoll: 0,
  led: 0, // 0..1: its light, brighter while it sends
  board: 0, // 0 no hoverboard, 1 standing on it (album)
  hover: 0, // the deck's underside above the floor (model units)
  boardRoll: 0, // the board's own attitude (degrees) and where it is under the body
  boardPitch: 0,
  boardYaw: 0,
  boardX: 0,
  boardZ: 0,
  glow: 0, // 0..1: the hover pads' glow
})

export const POSE_KEYS = Object.keys(restPose())

/* ---------------------------------------------------------------- the spine */

const bezier = (p0, p1, p2, p3, t) => {
  const u = 1 - t
  return add(add(scale(p0, u * u * u), scale(p1, 3 * u * u * t)), add(scale(p2, 3 * u * t * t), scale(p3, t * t * t)))
}

/**
 * Cross-sections in model space: { c, t, n1, n2, r, rs } with the spine point, unit tangent,
 * a rotation-minimising frame (n1, n2), radius and radius change per unit of spine length.
 * `bend` / `nod` swing the upper spine (sideways / forward) for follow-through.
 */
const sections = (bend = 0, nod = 0) => {
  const { bulb, tip, spineUp } = MASCOT_MODEL
  const out = []
  // Lower half: a hemisphere, from just above the bottom pole to the equator.
  for (let index = 0; index <= 10; index += 1) {
    const phi = (-84 + (84 * index) / 10) * DEG
    const y = bulb.y + bulb.radius * Math.sin(phi)
    const r = bulb.radius * Math.cos(phi)
    out.push({ c: v3(0, y, 0), t: v3(0, 1, 0), n1: v3(1, 0, 0), n2: v3(0, 0, 1), r, rs: -Math.tan(phi) })
  }
  // Upper part: the spine curls into the tip; the radius tapers to a point.
  const swing = multiply(rotateX(nod), rotateZ(bend))
  const base = spineUp[0]
  const bent = (p, weight) => {
    const rel = sub(p, base)
    return add(base, add(rel, scale(sub(apply(swing, rel), rel), weight)))
  }
  const controls = [spineUp[0], bent(spineUp[1], 0.2), bent(spineUp[2], 0.6), bent(tip, 1)]
  let n1 = v3(1, 0, 0)
  let previous = null
  const steps = 26
  for (let index = 1; index <= steps; index += 1) {
    const t = (index / steps) * 0.985
    const c = bezier(...controls, t)
    const ahead = bezier(...controls, Math.min(1, t + 0.004))
    const tangent = normalize(sub(ahead, c))
    // Parallel transport of the frame.
    n1 = normalize(sub(n1, scale(tangent, dot(n1, tangent))))
    const n2 = cross(n1, tangent)
    // Full through the shoulders, then a fast taper into the thin curled tip.
    const r = bulb.radius * Math.max(0, 1 - t ** 1.6) ** 1.3
    const segment = previous ? length(sub(c, previous.c)) : 1
    const rs = previous ? (r - previous.r) / Math.max(1e-6, segment) : 0
    const section = { c, t: tangent, n1, n2, r, rs }
    out.push(section)
    previous = section
  }
  return { list: out, tip: bezier(...controls, 1) }
}

const mixV = (a, b, t) => add(a, scale(sub(b, a), t))

/** The cross-section at height `y`, interpolated between the two sections around it. */
const sectionAt = (list, y) => {
  let below = list[0]
  let above = list.at(-1)
  for (const section of list) {
    if (section.c.y <= y && section.c.y >= below.c.y) below = section
    if (section.c.y >= y && section.c.y <= above.c.y) above = section
  }
  const span = above.c.y - below.c.y
  if (below === above || Math.abs(span) < 1e-6) return below
  const t = clampUnit((y - below.c.y) / span)
  return {
    c: mixV(below.c, above.c, t),
    t: normalize(mixV(below.t, above.t, t)),
    n1: normalize(mixV(below.n1, above.n1, t)),
    n2: normalize(mixV(below.n2, above.n2, t)),
    r: below.r + (above.r - below.r) * t,
    rs: below.rs + (above.rs - below.rs) * t,
  }
}

const clampUnit = (t) => Math.min(1, Math.max(0, t))

/** A point on the body surface: height `y` (model units) and `angle` (degrees, 0 = front, + = its left side seen from the front, i.e. the viewer's right). */
const surface = (list, y, angle) => {
  const best = sectionAt(list, y)
  const theta = (90 - angle) * DEG
  const radial = add(scale(best.n1, Math.cos(theta)), scale(best.n2, Math.sin(theta)))
  const p = add(best.c, scale(radial, best.r))
  const u = normalize(add(scale(best.n1, Math.sin(theta)), scale(best.n2, -Math.cos(theta)))) // around, to the model's right at the front
  const v = normalize(add(best.t, scale(radial, best.rs))) // up along the surface
  const n = normalize(sub(radial, scale(best.t, best.rs)))
  return { p, u, v, n }
}

/* ---------------------------------------------------------------- the board */

/**
 * The deck's centre line and half width at `x` (board frame): flat, except the nose, which
 * curves up (a parabola, so it leaves the flat part smoothly). Returns the point, the unit
 * normal of the top surface (in x-y) and the half width of the rounded outline there.
 */
export const boardSection = (x) => {
  const B = BOARD
  const start = -B.length / 2 + B.nose.length
  const u = Math.max(0, (start - x) / B.nose.length)
  const y = B.nose.rise * u * u
  const slope = (-2 * B.nose.rise * u) / B.nose.length // dy/dx
  const n = Math.hypot(slope, 1)
  const along = Math.min(1, Math.abs((2 * x) / B.length))
  return { x, y, nx: -slope / n, ny: 1 / n, half: (B.width / 2) * (1 - along ** B.round) ** (1 / B.round) }
}

/** The hoverboard's screen geometry for one frame (see mascotFrame), or null. */
const boardFrame = (p, camera) => {
  if (p.board <= 0.01) return null
  const B = BOARD
  const turn = orientation({ yaw: p.boardYaw, pitch: p.boardPitch, roll: p.boardRoll })
  const centre = v3(p.boardX, p.hover + B.thickness / 2, p.boardZ)
  const at = (x, y, z) => add(centre, apply(turn, v3(x, y, z)))
  const project = (q) => camera.project(camera.toView(q))
  const L = camera.tiltMatrix
  const linear = (d) => apply(L, apply(turn, d))
  // Lofted from sections along its length (BOARD_STATIONS): each gives the top and bottom of its
  // front and back edges.
  const t = B.thickness / 2
  const sections = BOARD_STATIONS.map((x) => {
    const s = boardSection(x)
    const edge = (side, z) => project(at(s.x + side * s.nx * t, s.y + side * s.ny * t, z))
    return { topFront: edge(1, s.half), topBack: edge(1, -s.half), bottomFront: edge(-1, s.half), bottomBack: edge(-1, -s.half), s }
  })
  // Its silhouette: the hull of each slice between two sections (all the same way round, so they
  // fill as one shape; a hull of the whole board would fill in under the nose).
  const deck = sections
    .slice(1)
    .map((n, i) => {
      const c = sections[i]
      return polygon(convexHull([c.topFront, c.topBack, c.bottomFront, c.bottomBack, n.topFront, n.topBack, n.bottomFront, n.bottomBack]))
    })
    .join('')
  const top = [...sections.map((c) => c.topFront), ...sections.map((c) => c.topBack).reverse()]
  const up = normalize(linear(v3(0, 1, 0)))
  // A gloss line along the top, a little in from its front edge.
  const shine = sections.filter((c, i) => i > 1 && i < sections.length - 2).map((c) => project(at(c.s.x + c.s.nx * t, c.s.y + c.s.ny * t, c.s.half * 0.45)))
  // The pads: shallow pods under the flat of the deck; their lower halves show below its edge.
  const pad = (x) => {
    const q = camera.toView(at(x * B.length, -t - 0.9, 0))
    return projectEllipsoid(camera, q, linear(v3(B.pads.r, 0, 0)), linear(v3(0, 3.2, 0)), linear(v3(0, 0, B.pads.r * 0.8)))
  }
  const halo = (x) => {
    const q = camera.toView(at(x * B.length, -t - 5, 0))
    return projectEllipsoid(camera, q, linear(v3(B.pads.r * 1.5, 0, 0)), linear(v3(0, 6.5, 0)), linear(v3(0, 0, B.pads.r * 1.2)))
  }
  // The red haze on the floor under it: wide and faint, gone by about 45 units up.
  const floor = projectEllipsoid(camera, camera.toView(v3(p.boardX, 0, p.boardZ)), apply(L, v3(B.length * 0.5, 0, 0)), apply(L, v3(0, 0.01, 0)), apply(L, v3(0, 0, B.width * 0.9)))
  const k = project(centre).k
  return {
    deck,
    top: up.z > -0.05 ? polygon(top) : '',
    topShade: Math.max(0, Math.min(1, up.z * 4)),
    shine: polyline(shine),
    pads: B.pads.x.map(pad),
    halo: B.pads.x.map(halo),
    floor,
    floorGlow: p.glow * Math.max(0, 1 - p.hover / 45),
    glow: p.glow,
    opacity: Math.min(1, p.board * 2),
    stroke: 1 * k,
  }
}

/* ---------------------------------------------------------------- the remote */

const easeInOut = (t) => t * t * (3 - 2 * t)

/** Where the remote is this pose: centre, axes (across u, face normal n, depth d), grips. */
const remoteBasis = (p, list) => {
  const R = REMOTE
  const w = easeInOut(clampUnit(p.remote))
  const lerp = (a, b) => a + (b - a) * w
  const y = lerp(R.lowered.y, R.held.y) + p.droop * R.droop.y + p.remoteY
  const front = surface(list, y, 0).p.z
  const z = front + lerp(R.lowered.gap, R.held.gap) + R.depth / 2 + p.droop * R.droop.z
  const tilt = lerp(R.lowered.tilt, R.held.tilt) + p.droop * R.droop.tilt
  const turn = multiply(rotateX(tilt), rotateZ(p.remoteRoll))
  const c = v3(p.remoteX, y, z)
  const u = apply(turn, v3(1, 0, 0))
  const n = apply(turn, v3(0, 1, 0))
  const d = apply(turn, v3(0, 0, 1))
  const at = (x, up, depth) => add(c, add(add(scale(u, x), scale(n, up)), scale(d, depth)))
  const grip = (side) => at(side * (R.width / 2 - R.grip), R.thickness * 0.1, -R.depth * 0.1)
  return { c, u, n, d, at, grip }
}

/** A grip of the remote (model space): `side` -1 the end on the model's -x side, +1 the other. */
export const remoteGrip = (pose, side) => {
  const p = { ...restPose(), ...pose }
  return remoteBasis(p, sections(p.bend, p.nod).list).grip(side)
}

/**
 * Arm angles that put the hands on the remote's grips (solved in model space, so they hold it in
 * any pose). Returns { armLa, armLf, armLr, armRa, armRf, armRr }.
 */
export const holdRemote = (pose) => {
  const p = { ...restPose(), ...pose }
  const { list } = sections(p.bend, p.nod)
  const basis = remoteBasis(p, list)
  const out = {}
  for (const [side, key] of [
    [-1, 'L'],
    [1, 'R'],
  ]) {
    const shoulder = surface(list, MASCOT_MODEL.shoulder.y, p[`shoulder${key}`] * side).p
    const toward = sub(basis.grip(side), shoulder)
    const d = normalize(toward)
    // The wrist stops short of the grip: the mitten (about 11 units long) closes over it.
    const reach = (length(toward) - 4) / MASCOT_MODEL.arm.length
    out[`arm${key}a`] = Math.asin(Math.max(-1, Math.min(1, side * d.x))) / DEG
    out[`arm${key}f`] = Math.atan2(d.z, -d.y) / DEG
    out[`arm${key}r`] = Math.max(0.6, Math.min(1.5, reach))
  }
  return out
}

/** The remote's screen geometry for one frame (see mascotFrame). */
const remoteFrame = ({ p, list, toView, linear, camera, arms }) => {
  const R = REMOTE
  const basis = remoteBasis(p, list)
  const { u, n, d, at } = basis
  const project = (q) => camera.project(toView(q))
  // The case: a rounded slab; its outline is the hull of its two faces' rounded rims.
  const rim = (up) =>
    Array.from({ length: 24 }, (_, i) => {
      const t = (i / 24) * Math.PI * 2
      const c = Math.cos(t)
      const s = Math.sin(t)
      const squircle = (v) => Math.sign(v) * Math.abs(v) ** 0.4
      return project(at((R.width / 2) * squircle(c), up, (R.depth / 2) * squircle(s)))
    })
  const top = rim(R.thickness / 2)
  const bottom = rim(-R.thickness / 2)
  const centre = project(basis.c)
  const k = centre.k
  const faceNormal = normalize(linear(n))
  const ellipse = (q, a, b, r) => projectEllipsoid(camera, toView(q), linear(scale(a, r)), linear(scale(b, r)), linear(scale(n, 0.01)))
  const sticks = [
    [-1, p.stickLX, p.stickLY],
    [1, p.stickRX, p.stickRY],
  ].map(([side, sx, sy]) => {
    const base = at(side * R.stick.x, R.thickness / 2, R.stick.z)
    const tilt = normalize(add(n, add(scale(u, R.stick.travel * sx), scale(d, R.stick.travel * sy))))
    const tipModel = add(base, scale(tilt, R.stick.length))
    const a = project(base)
    const b = project(tipModel)
    return { side, gimbal: ellipse(base, u, d, R.stick.gimbal), shaft: capsulePath(a, R.stick.width * a.k, b, R.stick.width * 0.8 * b.k), tip: { cx: b.x, cy: b.y, r: R.stick.tip * b.k }, tipModel }
  })
  const antennaBase = at(R.antenna.x, R.thickness / 2, R.depth / 2 - 2)
  const antennaTip = add(antennaBase, scale(normalize(add(scale(n, R.antenna.up), scale(u, R.antenna.out))), R.antenna.length))
  const ab = project(antennaBase)
  const at2 = project(antennaTip)
  // Thumbs: from each mitten over the stick on its side.
  const thumbs = sticks.map((stick) => {
    const arm = stick.side < 0 ? arms.armL : arms.armR
    const along = normalize(sub(arm.endModel, arm.rootModel))
    const from = project(add(arm.endModel, scale(along, 4.5)))
    const to = project(add(stick.tipModel, scale(n, 0.9)))
    return capsulePath(from, 2.3 * from.k, to, 1.9 * to.k)
  })
  return {
    opacity: Math.min(1, clampUnit(p.remote) * 3),
    case: polygon(convexHull([...top, ...bottom])),
    face: faceNormal.z > 0.02 ? polygon(top) : '',
    faceShade: Math.max(0, Math.min(1, faceNormal.z)),
    sticks,
    led: { ...ellipse(at(R.led.x, R.thickness / 2 + 0.05, R.led.z), u, d, R.led.r), opacity: 0.35 + 0.65 * clampUnit(p.led) },
    antenna: capsulePath(ab, R.antenna.width * ab.k, at2, R.antenna.width * 0.7 * at2.k),
    antennaTip: { cx: at2.x, cy: at2.y, r: R.antenna.tip * at2.k },
    thumbs,
    thumbsShown: p.remote > 0.6,
    stroke: 1.1 * k,
    centre,
    z: toView(basis.c).z,
  }
}

/* ------------------------------------------------------------------- the eye */

const RING = Array.from({ length: 32 }, (_, index) => (index / 32) * Math.PI * 2)

/**
 * The eye for one frame, in screen units. The lens is mapped onto the body: a point (a, b) of
 * the eye (a round the body, b up, model units from the eye's centre) sits on the surface that
 * far away, lifted by a paraboloid bulge. The iris turns on the lens's sphere of curvature.
 */
const eyeFrame = ({ list, pose, toView, linear, camera, light }) => {
  const E = MASCOT_MODEL.eye
  const rho = E.radius * (1 + 0.08 * pose.wide)
  const h = E.bulge
  const rLens = (rho * rho + h * h) / (2 * h)

  const capModel = (a, b) => {
    const y = E.y + b
    const section = sectionAt(list, y)
    const s = surface(list, y, E.angle + a / Math.max(1, section.r) / DEG)
    const bulge = h * Math.max(0, 1 - (a * a + b * b) / (rho * rho))
    return add(s.p, scale(s.n, bulge))
  }
  const cap = (a, b) => camera.project(toView(capModel(a, b)))

  const centre = surface(list, E.y, E.angle)
  const n0 = centre.n
  const normalView = normalize(linear(n0))
  const facing = normalView.z
  const apex = add(centre.p, scale(n0, h))
  const sphere = add(apex, scale(n0, -rLens)) // centre of the lens's curvature
  const centreScreen = camera.project(toView(apex))
  const out = { facing, centre: centreScreen, visible: facing > -0.3, closed: pose.closed > 0.5 }
  if (!out.visible) return out

  // The white of the eye: everything the lens covers on screen.
  const points = [...RING.map((t) => cap(rho * Math.cos(t), rho * Math.sin(t))), ...RING.filter((_, i) => i % 2 === 0).map((t) => cap(rho * 0.55 * Math.cos(t), rho * 0.55 * Math.sin(t))), cap(0, 0)]
  out.sclera = polygon(convexHull(points))

  // The contented closed eye: a lash arch on the skin, no eye.
  if (out.closed) {
    out.arch = polyline(Array.from({ length: 13 }, (_, i) => {
      const a = -14 + (28 * i) / 12
      return cap(a, 1 + 6 * (1 - (a / 14) ** 2))
    }))
    out.archWidth = 3.4 * centreScreen.k
    return out
  }

  // Iris and pupil: discs on the lens, turned toward the gaze.
  const travel = E.travel * DEG
  let gx = (pose.gazeX ?? 0) * DEG
  let gy = (pose.gazeY ?? 0) * DEG
  const reach = Math.hypot(gx, gy)
  if (reach > travel) {
    gx *= travel / reach
    gy *= travel / reach
  }
  const dir = normalize(add(add(scale(n0, Math.cos(gx) * Math.cos(gy)), scale(centre.u, Math.sin(gx) * Math.cos(gy))), scale(centre.v, Math.sin(gy))))
  const irisCentre = add(sphere, scale(dir, rLens + 0.15))
  const e1 = normalize(sub(centre.u, scale(dir, dot(centre.u, dir))))
  const e2 = normalize(cross(dir, e1))
  const disc = (r, lift = 0) =>
    projectEllipsoid(camera, toView(add(irisCentre, scale(dir, lift))), linear(scale(e1, r)), linear(scale(e2, r)), linear(scale(dir, 0.01)))
  const irisScale = 1 - 0.28 * pose.wide
  out.iris = disc(E.iris * irisScale)
  out.ring = disc(E.ring * irisScale, 0.05)
  out.pupil = disc(E.pupil * irisScale * (1 - 0.15 * pose.wide), 0.1)
  out.irisStroke = 1.6 * centreScreen.k

  // Glints: where the light reflects off the eye's clear front (more curved than the lens, so
  // they sit over the iris); they stay put while the iris moves.
  const sphereView = toView(sphere)
  const glintAt = (lightDir, size) => {
    const half = normalize(add(lightDir, v3(0, 0, 1)))
    const toward = normalize(add(scale(normalView, 0.55), scale(half, 0.45)))
    const at = camera.project(add(sphereView, scale(toward, rLens * 1.002)))
    return { cx: at.x, cy: at.y, rx: size * 0.8 * at.k, ry: size * at.k, angle: 28 }
  }
  out.glints = [glintAt(light, 3.3), glintAt(normalize(v3(-light.x * 0.7, -0.45, 0.6)), 1.3)]

  // The upper lid: covers the lens above a level that drops as it closes.
  const lid = Math.max(0, Math.min(1.05, pose.lid ?? 0))
  if (lid > 0.01) {
    const m = rho * (1 - 2 * lid)
    if (m <= -rho) {
      out.lid = out.sclera
      out.lidLine = ''
    } else {
      const w = Math.sqrt(Math.max(0, rho * rho - m * m))
      const start = Math.atan2(m, w)
      const arc = Array.from({ length: 17 }, (_, i) => {
        const t = start + ((Math.PI - 2 * start) * i) / 16
        return cap(rho * 1.02 * Math.cos(t), rho * 1.02 * Math.sin(t))
      })
      const edge = Array.from({ length: 13 }, (_, i) => cap(-w + (2 * w * i) / 12, m))
      out.lid = polygon([...edge, ...arc.slice(1, -1)])
      out.lidLine = polyline(edge)
    }
  }
  out.outlineWidth = 3 * centreScreen.k

  // The brow: a short stroke on the skin above the eye, raised or lowered.
  if (pose.brow) {
    const up = pose.brow > 0
    const stroke = Array.from({ length: 9 }, (_, i) => {
      const a = -12 + (24 * i) / 8
      const b = (up ? 31 : 22) + 3.5 * (1 - (a / 12) ** 2) + (up ? 0 : -0.18 * a)
      const y = E.y + b
      const s = surface(list, y, E.angle + a / Math.max(1, sectionAt(list, y).r) / DEG)
      return camera.project(toView(add(s.p, scale(s.n, 0.6))))
    })
    out.brow = polyline(stroke)
    out.browWidth = 3.2 * centreScreen.k
  }
  return out
}

/* ------------------------------------------------------------------- a frame */

/**
 * @param {object} pose     see restPose()
 * @param {object} camera   from createCamera() (origin at the feet, in the SVG's units)
 * @returns {object} body path, lighting, decal matrices with visibility, limbs, feet, shadow,
 *          hand/apple/fx placements and the paint order of the limbs.
 */
export const mascotFrame = (pose, camera, options = {}) => {
  const p = { ...restPose(), ...pose }
  const light = options.light ?? MASCOT_MODEL.light
  const M = orientation({ yaw: p.yaw, pitch: p.pitch, roll: p.roll, sx: p.sx, sy: p.sy })
  const offset = v3(p.x, p.y, p.z)
  const toView = (q) => camera.toView(add(apply(M, q), offset))
  const dirView = (d) => camera.toView(apply(M, d))
  const L = camera.tiltMatrix
  const linear = (d) => apply(L, apply(M, d))

  const { list, tip } = sections(p.bend, p.nod)

  // Silhouette: where the swept surface turns edge-on to the camera (view direction +z).
  const left = []
  const right = []
  for (const s of list) {
    const c = toView(s.c)
    const a = linear(s.n1)
    const b = linear(s.n2)
    const T = linear(s.t)
    const A = cross(b, T).z
    const B = -cross(a, T).z
    const C = s.rs * cross(a, b).z
    const h = Math.hypot(A, B)
    if (h < 1e-9 || Math.abs(C) > h) continue
    const base = Math.atan2(B, A)
    const spread = Math.acos(Math.max(-1, Math.min(1, C / h)))
    const centre = camera.project(c)
    const t2 = { x: T.x, y: -T.y }
    for (const theta of [base + spread, base - spread]) {
      const q = camera.project(add(c, scale(add(scale(a, Math.cos(theta)), scale(b, Math.sin(theta))), s.r)))
      const side = t2.x * (q.y - centre.y) - t2.y * (q.x - centre.x)
      ;(side >= 0 ? left : right).push(q)
    }
  }
  const tipPoint = camera.project(toView(tip))
  const outline = [...left, tipPoint, tipPoint, ...right.reverse()]
  const bodyPath = closedSmoothPath(outline)

  // Lighting: the bulb's highlight faces the light, which stays put as the body turns (and
  // follows the light when that moves).
  const bulbCentre = toView(v3(0, MASCOT_MODEL.bulb.y, 0))
  const bulbScreen = camera.project(bulbCentre)
  const radius = MASCOT_MODEL.bulb.radius * bulbScreen.k * Math.max(p.sx, p.sy)
  const highlight = camera.project(add(bulbCentre, scale(light, MASCOT_MODEL.bulb.radius * 0.72 * p.sx)))
  // A glossy streak just inside the outline on the lit side.
  const meanX = (chain) => chain.reduce((sum, q) => sum + q.x, 0) / Math.max(1, chain.length)
  const lit = (meanX(left) <= meanX(right)) === light.x <= 0 ? left : [...right].reverse()
  const gloss = lit.filter((_, index) => index > lit.length * 0.22 && index < lit.length * 0.6)
  // A faint rim of bounced light along the lower part of the shadowed side.
  const shaded = lit === left ? [...right].reverse() : left
  const rim = shaded.filter((_, index) => index > shaded.length * 0.12 && index < shaded.length * 0.55)

  // Decals on the surface (eye, mouth, cheeks): matrix + how squarely they face the camera.
  const decal = (anchor, unit = 1, flip = 1) => {
    const s = surface(list, anchor.y, anchor.angle * flip)
    // The mouth and cheeks are painted on the surface (the renderer clips them to the body).
    const o = toView(add(s.p, scale(s.n, anchor.lift ?? 0)))
    const n = normalize(dirView(s.n))
    const u = linear(s.u)
    const v = linear(s.v)
    return { matrix: planeMatrix(camera, o, normalize(u), normalize(v), unit * Math.min(p.sx, p.sy) ** 0.3), facing: n.z, z: o.z }
  }
  const eye = eyeFrame({ list, pose: p, toView, linear, camera, light })
  const mouth = decal(MASCOT_MODEL.mouth)
  const blushL = decal(MASCOT_MODEL.blush, 1, -1)
  const blushR = decal(MASCOT_MODEL.blush, 1, 1)

  // Limbs: capsules from surface anchors; the side nearer the camera is painted over the body.
  const limb = (anchor, side, direction, size, reach, angle = anchor.angle) => {
    const s = surface(list, anchor.y, angle * side)
    const end = add(s.p, scale(direction, size.length * reach))
    const rootView = toView(s.p)
    const endView = toView(end)
    const a = camera.project(rootView)
    const b = camera.project(endView)
    return { d: capsulePath(a, size.root * a.k, b, size.end * b.k), root: a, end: b, endModel: end, rootModel: s.p, z: (rootView.z + endView.z) / 2 }
  }
  const armDirection = (abduct, flex, side) => {
    const a = abduct * DEG
    const f = flex * DEG
    return normalize(v3(side * Math.sin(a), -Math.cos(a) * Math.cos(f), Math.abs(Math.cos(a)) * Math.sin(f) + (Math.cos(a) < 0 ? -0.1 : 0)))
  }
  const armR = limb(MASCOT_MODEL.shoulder, 1, armDirection(p.armRa, p.armRf, 1), MASCOT_MODEL.arm, p.armRr, p.shoulderR)
  const armL = limb(MASCOT_MODEL.shoulder, -1, armDirection(p.armLa, p.armLf, -1), MASCOT_MODEL.arm, p.armLr, p.shoulderL)
  const legDirection = (swing, side) => normalize(v3(side * 0.16, -Math.cos(swing * DEG), Math.sin(swing * DEG)))
  const legR = limb(MASCOT_MODEL.hip, 1, legDirection(p.legR, 1), MASCOT_MODEL.leg, 1)
  const legL = limb(MASCOT_MODEL.hip, -1, legDirection(p.legL, -1), MASCOT_MODEL.leg, 1)

  // Feet: little ellipsoids at the ankles, pointing forward (the right one taps).
  const foot = (leg, side, tap) => {
    const { rx, ry, rz } = MASCOT_MODEL.foot
    const R = multiply(M, rotateX(-tap))
    const centre = toView(add(leg.endModel, v3(side * 1.5, -1, 3.2)))
    const axis = (d) => apply(L, apply(R, d))
    return { ...projectEllipsoid(camera, centre, axis(v3(rx, 0, 0)), axis(v3(0, ry, 0)), axis(v3(0, 0, rz))), z: centre.z }
  }
  const footR = foot(legR, 1, p.footR)
  const footL = foot(legL, -1, 0)

  // Hands: billboards at the wrists, turned along the projected arm.
  const hand = (arm, side, extra) => ({
    x: arm.end.x,
    y: arm.end.y,
    k: arm.end.k,
    angle: Math.atan2(arm.end.y - arm.root.y, arm.end.x - arm.root.x) / DEG + 90 + extra * side,
    flip: side,
    z: arm.z,
  })

  // Ground shadow under the body (it stays on the ground when the body jumps), cast away from
  // the light; a tighter, darker contact shadow right under the feet.
  // On the board, the shadow is the board's: longer, and smaller and fainter the higher it hovers.
  const away = Math.max(-1, Math.min(1, -light.x / Math.max(0.35, light.y)))
  const b = Math.max(0, Math.min(1, p.board))
  const shrink = 1 - b * Math.min(0.3, p.hover / 90)
  const ground = camera.toView(v3(p.x + (p.boardX - p.x) * b + away * 9, 0, p.z + (p.boardZ - p.z) * b - 2))
  const shadowRx = (MASCOT_MODEL.shadow.rx * p.sx * p.shadow * (1 - b) + BOARD.length * 0.52 * b) * (1 + Math.abs(away) * 0.15) * shrink
  const shadowRz = (MASCOT_MODEL.shadow.rz * p.sx * p.shadow * (1 - b) + BOARD.width * 0.62 * b) * shrink
  const shadow = projectEllipsoid(camera, ground, apply(L, v3(shadowRx, 0, 0)), apply(L, v3(0, 0.01, 0)), apply(L, v3(0, 0, shadowRz)))
  const contact = projectEllipsoid(camera, camera.toView(v3(p.x, 0, p.z + 1)), apply(L, v3(20 * p.sx, 0, 0)), apply(L, v3(0, 0.01, 0)), apply(L, v3(0, 0, 6.5 * p.sx)))

  // Where the head is, for screen-aligned effects (startle marks, Zs, sweat).
  const head = camera.project(toView(v3(0, MASCOT_MODEL.bulb.y + 30, 0)))

  const bodyZ = bulbCentre.z
  const behind = (part) => part.z < bodyZ - 6
  const remote = p.remote > 0.01 ? remoteFrame({ p, list, toView, linear, camera, arms: { armL, armR } }) : null
  return {
    remote,
    board: boardFrame(p, camera),
    body: { d: bodyPath, outline, highlight, centre: bulbScreen, radius, stroke: 3.6 * bulbScreen.k, gloss, rim },
    eye,
    decals: { mouth, blushL, blushR },
    limbs: { armL, armR, legL, legR },
    feet: { footL, footR },
    hands: { handL: hand(armL, -1, p.handL), handR: hand(armR, 1, p.handR) },
    shadow,
    contact,
    lift: Math.max(0, p.y),
    head,
    order: {
      back: ['legL', 'legR', 'footL', 'footR', ...(behind(armL) ? ['armL'] : []), ...(behind(armR) ? ['armR'] : [])],
      front: [...(behind(armL) ? [] : ['armL']), ...(behind(armR) ? [] : ['armR'])],
      feetFront: footL.z > bodyZ + 18 || footR.z > bodyZ + 18,
    },
  }
}

/* --------------------------------------------------------------- reaching */

const transpose = (m) => [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]]

/**
 * Arm angles that point the arm on `side` (-1 its left as drawn on the viewer's left, +1 the
 * other) at a screen point `target` (this camera's screen units), taken `forward` units in
 * front of the shoulder. Returns { abduct, flex, reach } for armXa, armXf and armXr; `reach`
 * stretches the arm a little (at most 25%) when the point is further than it can reach.
 */
export const reachToward = (pose, camera, side, target, forward = 14) => {
  const p = { ...restPose(), ...pose }
  const R = orientation({ yaw: p.yaw, pitch: p.pitch, roll: p.roll })
  const { list } = sections(p.bend, p.nod)
  const s = surface(list, MASCOT_MODEL.shoulder.y, (side < 0 ? p.shoulderL : p.shoulderR) * side)
  const shoulder = camera.toView(add(apply(R, s.p), v3(p.x, p.y, p.z)))
  const z = shoulder.z + forward
  const k = camera.k(z)
  const aim = v3((target.x - camera.origin.x) / k, (camera.origin.y - target.y) / k, z)
  const toward = sub(aim, shoulder)
  const d = normalize(apply(transpose(R), apply(transpose(camera.tiltMatrix), toward)))
  const abduct = Math.asin(Math.max(-1, Math.min(1, side * d.x)))
  const flex = Math.atan2(d.z, -d.y)
  return { abduct: abduct / DEG, flex: flex / DEG, reach: Math.max(0.6, Math.min(1.25, length(toward) / MASCOT_MODEL.arm.length)) }
}
