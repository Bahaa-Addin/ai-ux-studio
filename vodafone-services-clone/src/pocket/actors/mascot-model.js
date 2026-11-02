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
 * Face and props are flat artwork laid on the body's tangent plane at fixed surface spots
 * (decals), so the eye and mouth slide round the body, foreshorten and disappear behind it.
 * Arms and legs are tapered capsules from surface anchors, feet are small ellipsoids, the
 * shadow is a disc on the ground.
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
  projectEllipsoid,
  planeMatrix,
  capsulePath,
  closedSmoothPath,
} from './space.js'

export const MASCOT_MODEL = {
  bulb: { y: 59, radius: 44 }, // the droplet's round lower part
  tip: v3(47, 146, -6), // where the flame curls to
  spineUp: [v3(0, 59, 0), v3(-1, 102, 0), v3(2, 140, -2)], // Bézier from the bulb centre to the tip
  eye: { y: 79, angle: 0, lift: 6 }, // decal anchors: height, angle round the body (0 = front), lift off the surface
  mouth: { y: 41, angle: 0 },
  blush: { y: 51, angle: 40 },
  shoulder: { y: 51, angle: 78 },
  hip: { y: 22, angle: 30 },
  arm: { length: 21, root: 4.4, end: 3.4 },
  leg: { length: 13, root: 3.8, end: 3.3 },
  foot: { rx: 5.2, ry: 3.4, rz: 7.6 },
  shadow: { rx: 31, rz: 13 },
  light: normalize(v3(-0.45, 0.55, 0.7)), // fixed in view space, upper left and in front
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

/** A point on the body surface: height `y` (model units) and `angle` (degrees, 0 = front, + = its left side seen from the front, i.e. the viewer's right). */
const surface = (list, y, angle) => {
  let best = list[0]
  for (const section of list) if (Math.abs(section.c.y - y) < Math.abs(best.c.y - y)) best = section
  const theta = (90 - angle) * DEG
  const radial = add(scale(best.n1, Math.cos(theta)), scale(best.n2, Math.sin(theta)))
  const p = add(best.c, scale(radial, best.r))
  const u = normalize(add(scale(best.n1, Math.sin(theta)), scale(best.n2, -Math.cos(theta)))) // around, to the model's right at the front
  const v = normalize(add(best.t, scale(radial, best.rs))) // up along the surface
  const n = normalize(sub(radial, scale(best.t, best.rs)))
  return { p, u, v, n }
}

/* ------------------------------------------------------------------- a frame */

/**
 * @param {object} pose     see restPose()
 * @param {object} camera   from createCamera() (origin at the feet, in the SVG's units)
 * @returns {object} body path, lighting, decal matrices with visibility, limbs, feet, shadow,
 *          hand/apple/fx placements and the paint order of the limbs.
 */
export const mascotFrame = (pose, camera) => {
  const p = { ...restPose(), ...pose }
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

  // Lighting: the bulb's highlight faces the light, which stays put as the body turns.
  const bulbCentre = toView(v3(0, MASCOT_MODEL.bulb.y, 0))
  const bulbScreen = camera.project(bulbCentre)
  const radius = MASCOT_MODEL.bulb.radius * bulbScreen.k * Math.max(p.sx, p.sy)
  const highlight = camera.project(add(bulbCentre, scale(MASCOT_MODEL.light, MASCOT_MODEL.bulb.radius * 0.72 * p.sx)))
  // A glossy streak just inside the outline on the lit side (the light is to the upper left).
  const meanX = (chain) => chain.reduce((sum, q) => sum + q.x, 0) / Math.max(1, chain.length)
  const lit = meanX(left) <= meanX(right) ? left : [...right].reverse()
  const gloss = lit.filter((_, index) => index > lit.length * 0.22 && index < lit.length * 0.6)

  // Decals on the surface (eye, mouth, cheeks): matrix + how squarely they face the camera.
  const decal = (anchor, unit = 1, flip = 1) => {
    const s = surface(list, anchor.y, anchor.angle * flip)
    // The eye bulges out of the body like a lens (it is not clipped to the outline); the mouth
    // and cheeks are painted on the surface.
    const o = toView(add(s.p, scale(s.n, anchor.lift ?? 0)))
    const n = normalize(dirView(s.n))
    const u = linear(s.u)
    const v = linear(s.v)
    return { matrix: planeMatrix(camera, o, normalize(u), normalize(v), unit * Math.min(p.sx, p.sy) ** 0.3), facing: n.z, z: o.z }
  }
  const eye = decal(MASCOT_MODEL.eye)
  const mouth = decal(MASCOT_MODEL.mouth)
  const blushL = decal(MASCOT_MODEL.blush, 1, -1)
  const blushR = decal(MASCOT_MODEL.blush, 1, 1)

  // Limbs: capsules from surface anchors; the side nearer the camera is painted over the body.
  const limb = (anchor, side, direction, size, reach) => {
    const s = surface(list, anchor.y, anchor.angle * side)
    const end = add(s.p, scale(direction, size.length * reach))
    const rootView = toView(s.p)
    const endView = toView(end)
    const a = camera.project(rootView)
    const b = camera.project(endView)
    return { d: capsulePath(a, size.root * a.k, b, size.end * b.k), root: a, end: b, endModel: end, z: (rootView.z + endView.z) / 2 }
  }
  const armDirection = (abduct, flex, side) => {
    const a = abduct * DEG
    const f = flex * DEG
    return normalize(v3(side * Math.sin(a), -Math.cos(a) * Math.cos(f), Math.abs(Math.cos(a)) * Math.sin(f) + (Math.cos(a) < 0 ? -0.1 : 0)))
  }
  const armR = limb(MASCOT_MODEL.shoulder, 1, armDirection(p.armRa, p.armRf, 1), MASCOT_MODEL.arm, p.armRr)
  const armL = limb(MASCOT_MODEL.shoulder, -1, armDirection(p.armLa, p.armLf, -1), MASCOT_MODEL.arm, p.armLr)
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

  // Ground shadow under the body (it stays on the ground when the body jumps).
  const ground = camera.toView(v3(p.x, 0, p.z))
  const shadow = projectEllipsoid(camera, ground, apply(L, v3(MASCOT_MODEL.shadow.rx * p.sx * p.shadow, 0, 0)), apply(L, v3(0, 0.01, 0)), apply(L, v3(0, 0, MASCOT_MODEL.shadow.rz * p.sx * p.shadow)))

  // Where the head is, for screen-aligned effects (startle marks, Zs, sweat).
  const head = camera.project(toView(v3(0, MASCOT_MODEL.bulb.y + 30, 0)))

  const bodyZ = bulbCentre.z
  const behind = (part) => part.z < bodyZ - 6
  return {
    body: { d: bodyPath, outline, highlight, centre: bulbScreen, radius, stroke: 3.6 * bulbScreen.k, gloss },
    decals: { eye, mouth, blushL, blushR },
    limbs: { armL, armR, legL, legR },
    feet: { footL, footR },
    hands: { handL: hand(armL, -1, p.handL), handR: hand(armR, 1, p.handR) },
    shadow,
    head,
    order: {
      back: ['legL', 'legR', 'footL', 'footR', ...(behind(armL) ? ['armL'] : []), ...(behind(armR) ? ['armR'] : [])],
      front: [...(behind(armL) ? [] : ['armL']), ...(behind(armR) ? [] : ['armR'])],
      feetFront: footL.z > bodyZ + 18 || footR.z > bodyZ + 18,
    },
  }
}
