/**
 * The drone as a 3D model, drawn as SVG. Pure geometry: `droneFrame(pose, camera, spin)`.
 *
 * An X-frame quadcopter after the IMG_2442 UPLIFT drone: an ellipsoid hull with a camera
 * bucket under its nose, four tapered arms to round motor pods, an open propeller guard
 * ring round each pod (open on the hull side) and two blades per rotor spinning in the
 * rotor plane. Everything is placed in 3D, so heading (yaw), banking (roll) and pitch show
 * as real perspective, and each guard is split into the half behind its rotor and the half
 * in front of it.
 */

import { DEG, v3, add, scale, apply, normalize, orientation, projectEllipsoid, planeMatrix, capsulePath, polyline } from './space.js'

export const DRONE_MODEL = {
  hull: v3(24, 11, 21),
  bucket: { centre: v3(0, -8, 9), radii: v3(14, 9.5, 12) },
  arm: { reach: 62, root: 13, rootRadius: 6.6, podRadius: 3, rise: 3 },
  pod: 8.2,
  rotor: { lift: 4.5, radius: 24, blade: 21.5, bladeWidth: 1.8 },
  guard: { lift: 2, radius: 27, gap: 48, heavy: 60 },
  details: { at: v3(0, 3, 20.5), unit: 0.95 },
  restYaw: 22, // the reference's three-quarter view
}

const ARMS = [45, 135, 225, 315]

export const restDronePose = () => ({ yaw: DRONE_MODEL.restYaw, pitch: 0, roll: 0, y: 0 })

/**
 * @param {object} pose    { yaw, pitch, roll, y }
 * @param {object} camera  from createCamera() (origin at the hull centre)
 * @param {number} spin    rotor angle in degrees
 */
export const droneFrame = (pose, camera, spin = 0) => {
  const p = { ...restDronePose(), ...pose }
  const M = orientation({ yaw: p.yaw, pitch: p.pitch, roll: p.roll })
  const lift = v3(0, p.y, 0)
  const toView = (q) => camera.toView(add(apply(M, q), lift))
  const axis = (d) => camera.toView(apply(M, d))
  const { hull, bucket, arm, pod, rotor, guard, details } = DRONE_MODEL

  const hullCentre = toView(v3(0, 0, 0))
  const hullShape = projectEllipsoid(camera, hullCentre, axis(v3(hull.x, 0, 0)), axis(v3(0, hull.y, 0)), axis(v3(0, 0, hull.z)))
  const bucketCentre = toView(bucket.centre)
  const bucketShape = projectEllipsoid(camera, bucketCentre, axis(v3(bucket.radii.x, 0, 0)), axis(v3(0, bucket.radii.y, 0)), axis(v3(0, 0, bucket.radii.z)))

  const units = ARMS.map((degrees, index) => {
    const a = degrees * DEG
    const dir = v3(Math.cos(a), 0, Math.sin(a))
    const podModel = add(scale(dir, arm.reach), v3(0, arm.rise, 0))
    const podView = toView(podModel)
    const podScreen = camera.project(podView)
    const rootScreen = camera.project(toView(scale(dir, arm.root)))
    const armPath = capsulePath(rootScreen, arm.rootRadius * rootScreen.k, podScreen, arm.podRadius * podScreen.k)

    // Rotor: a faint disc and two blades in the rotor plane, alternate rotors turning opposite ways.
    const hub = toView(add(podModel, v3(0, rotor.lift, 0)))
    const turn = (spin * (index % 2 ? -1 : 1) + index * 37) * DEG
    const bladeAxes = (offset) => {
      const t = turn + offset
      return [normalize(axis(v3(Math.cos(t), 0, Math.sin(t)))), normalize(axis(v3(-Math.sin(t), 0, Math.cos(t))))]
    }
    const [u1, w1] = bladeAxes(0)
    const [u2, w2] = bladeAxes(Math.PI / 2)
    const flatU = normalize(axis(v3(1, 0, 0)))
    const flatV = normalize(axis(v3(0, 0, 1)))

    // Guard ring, open on the hull side, split into the halves behind and in front of the rotor.
    const ring = add(podModel, v3(0, guard.lift, 0))
    const gap = Math.atan2(-dir.z, -dir.x) / DEG
    const arc = (from, to, steps = 22) =>
      Array.from({ length: steps + 1 }, (_, i) => {
        const t = (from + ((to - from) * i) / steps) * DEG
        const q = toView(add(ring, v3(guard.radius * Math.cos(t), 0, guard.radius * Math.sin(t))))
        return camera.project(q)
      })
    const split = (points) => {
      const back = []
      const front = []
      let run = null
      for (const point of points) {
        const side = point.z < podView.z ? back : front
        if (run !== side) {
          side.push([])
          run = side
        }
        side.at(-1).push(point)
      }
      const paths = (runs) => runs.filter((r) => r.length > 1).map(polyline).join('')
      return { back: paths(back), front: paths(front) }
    }
    const thin = split(arc(gap + guard.gap, gap + 360 - guard.gap, 30))
    const heavy = split(arc(gap + 180 - guard.heavy, gap + 180 + guard.heavy, 14))

    return {
      z: podView.z,
      arm: armPath,
      pod: { cx: podScreen.x, cy: podScreen.y, r: pod * podScreen.k },
      disc: matrixFor(camera, hub, flatU, flatV),
      blades: [matrixFor(camera, hub, u1, w1), matrixFor(camera, hub, u2, w2)],
      guard: { thinBack: thin.back, thinFront: thin.front, heavyBack: heavy.back, heavyFront: heavy.front, width: podScreen.k },
    }
  })

  // White hull details (ring, oval, highlight seam) on the nose, hidden when it faces away.
  const noseNormal = normalize(axis(v3(0, 0.25, 1)))
  const detailMatrix = planeMatrix(camera, toView(details.at), normalize(axis(v3(1, 0, 0))), normalize(axis(v3(0, 1, 0))), details.unit)

  const hullLight = camera.project(add(hullCentre, scale(normalize(v3(-0.5, 0.75, 0.45)), hull.x * 0.6)))

  return {
    hull: { ...hullShape, light: hullLight },
    bucket: bucketShape,
    units,
    details: { matrix: detailMatrix, facing: noseNormal.z },
    hullZ: hullCentre.z,
    centre: camera.project(hullCentre),
  }
}

const matrixFor = (camera, o, u, v) => planeMatrix(camera, o, u, v, 1)
