/**
 * Animation clips for the 3D mascot, and the pose animator that plays them.
 *
 * A clip is a function of its parameters returning:
 *   pose        { key: [[t, value, ease?], ...] } tracks over the 3D pose (see restPose() in
 *               ./mascot-model.js: yaw/pitch/roll turn and lean the body, sx/sy squash it, y lifts
 *               it, bend/nod swing the flame tip, arm*, leg*, hand*, foot* pose the limbs).
 *               `t` runs 0..1 over the clip; `ease` shapes the segment ending at that key.
 *   loop        true for a repeating clip (breathing, sleeping)
 *   mover       Web Animations keyframes for the HTML box (travel across the album floor, in px)
 *   decals      Web Animations tracks on decal parts by selector (eyelid, Zs, the tossed apple)
 *   expression  discrete face/prop settings for the clip (see EXPRESSION_DEFAULTS)
 *   beats       [[ms, expression patch]]: expression changes inside the clip
 *   gaze        [[ms, mode]]: where the eye looks ('pointer', 'viewer', 'left', 'right',
 *               'down-right', 'travel'); the pupil itself is driven by the gaze loop
 *
 * Interrupting a clip never pops: each track blends from the pose it found over its first
 * 90 ms, and pose keys the new clip leaves alone ease back to rest.
 */

import { restPose } from './mascot-model.js'

export const EXPRESSION_DEFAULTS = {
  mouth: 'smile', // smile | grin | o | yawn | chew | wobble | snore
  eye: 'open', // open | half | wide | closed
  brow: 'none', // none | up | down
  apple: 'none', // none | whole | bitten | core
  blush: false,
  sweat: false,
  marks: false,
  zzz: false,
}

const EASE = {
  linear: (t) => t,
  in: (t) => t * t,
  out: (t) => 1 - (1 - t) * (1 - t),
  inOut: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  back: (t) => 1 + 2.4 * (t - 1) ** 3 + 1.4 * (t - 1) ** 2,
}

const travel = (x, y = 0) => `translate(${x}px, ${y}px)`

/** Alternating keys: n cycles between a and b over [from, to], ending on `end`. */
const cycle = (a, b, n, from = 0, to = 1, end = 0) => {
  const keys = [[from, a]]
  for (let index = 0; index < n; index += 1) {
    keys.push([from + ((to - from) * (index + 0.5)) / n, b])
    keys.push([from + ((to - from) * (index + 1)) / n, a])
  }
  keys[keys.length - 1] = [to, a]
  if (to < 1) keys.push([1, end])
  return keys
}

export const MASCOT_CLIPS = {
  /* ------------------------------------------------ page-tip greeting */
  // Slides out from under the paper still half turned toward the curl, then faces the viewer.
  rise: ({ from }) => ({
    mover: [{ transform: travel(from.x, from.y) }, { transform: travel(0, -3), offset: 0.72 }, { transform: travel(0, 0) }],
    pose: {
      yaw: [[0, -40], [1, -14, 'out']],
      roll: [[0, 10], [1, 0, 'out']],
      sx: [[0, 1.1], [0.55, 0.94], [1, 1]],
      sy: [[0, 0.86], [0.55, 1.08], [1, 1]],
      nod: [[0, -10], [0.6, 8], [1, 0]],
    },
    expression: { brow: 'up' },
    gaze: [[0, 'viewer']],
  }),

  wave: ({ duration, look }) => {
    const lookAt = Math.max(0, duration - look)
    const hold = lookAt / duration
    return {
      pose: {
        yaw: [[0, -14], [0.18, 6, 'out'], [0.5, -4], [hold, 2], [1, 0]],
        armRa: [[0, 26], [0.16, 162, 'out'], [hold * 0.92, 150], [1, 30]],
        armRf: [[0, 8], [0.16, 24], [hold, 18], [1, 8]],
        armRr: [[0, 1], [0.16, 1.15], [hold, 1.15], [1, 1]],
        handR: cycle(-28, 30, 2, 0.16, hold, 0),
        roll: [[0, 0], [0.3, -4], [0.56, 3], [hold, 0], [1, 0]],
        bend: [[0, 0], [0.3, 6], [0.56, -5], [hold, 2], [1, 0]],
      },
      expression: { mouth: 'grin', blush: true },
      beats: [[lookAt, { mouth: 'smile', blush: false }]],
      gaze: [
        [0, 'viewer'],
        [lookAt, 'pointer'],
      ],
    }
  },

  // Turns back toward the curl and dives under the paper.
  duck: ({ to }) => ({
    mover: [{ transform: travel(to.x, to.y) }],
    moverEase: 'cubic-bezier(.55,0,.8,.3)',
    pose: {
      yaw: [[0.0, 0], [1, -55, 'in']],
      pitch: [[0, 0], [1, 22, 'in']],
      sx: [[0.3, 1.08], [1, 0.92]],
      sy: [[0.3, 0.9], [1, 1.08]],
      nod: [[0, 0], [1, -14]],
    },
    expression: { mouth: 'o', brow: 'up' },
    gaze: [[0, 'viewer']],
  }),

  /* ---------------------------------------------------- caught by the turn */
  // Pops up facing the viewer, recoils, and winds up to run (already turning its head away).
  startle: ({ originX, hideY, dir }) => ({
    mover: [{ transform: travel(originX, hideY) }, { transform: travel(originX, -8), offset: 0.5 }, { transform: travel(originX, 0) }],
    moverEase: 'cubic-bezier(.2,.9,.3,1)',
    pose: {
      yaw: [[0, 0], [0.55, 0], [1, dir * 25, 'in']],
      pitch: [[0, 0], [0.45, -12], [1, -6]],
      sx: [[0, 0.92], [0.45, 0.86], [0.85, 1.12], [1, 1.1]],
      sy: [[0, 1.1], [0.45, 1.16], [0.85, 0.86], [1, 0.88]],
      armLa: [[0, 26], [0.5, 95], [1, 50]],
      armRa: [[0, 26], [0.5, 95], [1, 50]],
      armLf: [[0, 8], [0.5, 20], [1, -10]],
      armRf: [[0, 8], [0.5, 20], [1, -10]],
      nod: [[0, 0], [0.45, -12], [1, 8]],
    },
    expression: { mouth: 'o', eye: 'wide', brow: 'up', marks: true, sweat: true },
    gaze: [[0, 'viewer']],
  }),

  // Turns side-on and sprints: low lean, three steps, pumping arms, the tip streaming behind.
  run: ({ originX, endX, dir }) => ({
    mover: [{ transform: travel(originX, 0) }, { transform: travel(endX, 0) }],
    moverEase: 'cubic-bezier(.4,.1,.45,1)',
    pose: {
      yaw: [[0, dir * 25], [0.14, dir * 52, 'out'], [1, dir * 52]],
      pitch: [[0, -6], [0.14, 18, 'out'], [1, 16]],
      sx: [[0, 1.1], [0.14, 1.06], [1, 1.06]],
      sy: [[0, 0.88], [0.14, 0.94], [1, 0.94]],
      y: cycle(0, 7, 3, 0.1, 1, 0),
      legL: cycle(-40, 40, 3, 0.1, 1, 0),
      legR: cycle(40, -40, 3, 0.1, 1, 0),
      armLa: [[0, 50], [0.14, 20], [1, 20]],
      armRa: [[0, 50], [0.14, 20], [1, 20]],
      armLf: cycle(50, -45, 3, 0.1, 1, 0),
      armRf: cycle(-45, 50, 3, 0.1, 1, 0),
      nod: [[0, 8], [0.14, -16], [1, -14]],
      bend: cycle(-4, 4, 3, 0.1, 1, 0),
    },
    expression: { mouth: 'o', eye: 'wide', sweat: true },
    gaze: [[0, 'travel']],
  }),

  // Skids past, leans back, steps back, swings round to face the viewer, scratches its head.
  recover: ({ endX, dir, duration }) => ({
    mover: [{ transform: travel(endX, 0) }, { transform: travel(endX * 1.3, 0), offset: 0.14 }, { transform: travel(-dir * 3, 0), offset: 0.4 }, { transform: travel(0, 0), offset: 0.5 }, { transform: travel(0, 0) }],
    moverEase: 'ease-out',
    pose: {
      yaw: [[0, dir * 52], [0.3, dir * 52], [0.5, -dir * 14, 'out'], [0.66, dir * 24], [0.82, -dir * 18], [1, 0]],
      pitch: [[0, 16], [0.14, -22, 'out'], [0.36, 4], [0.5, 0], [1, 0]],
      sx: [[0, 1.06], [0.14, 1.14], [0.36, 0.96], [0.5, 1]],
      sy: [[0, 0.94], [0.14, 0.86], [0.36, 1.05], [0.5, 1]],
      legL: [[0, 0], [0.14, 30], [0.36, 0], [1, 0]],
      legR: [[0, 0], [0.14, 34], [0.36, 0], [1, 0]],
      nod: [[0, -14], [0.14, 14], [0.36, -6], [0.5, 0], [1, 0]],
      armRa: [[0.45, 26], [0.6, 168], [0.88, 160], [1, 26]],
      armRf: [[0.45, 8], [0.6, -30], [0.88, -30], [1, 8]],
      handR: [[0.6, 0], [0.68, -30], [0.76, 25], [0.84, -25], [1, 0]],
    },
    expression: { mouth: 'o', sweat: true },
    beats: [[Math.round(duration * 0.42), { mouth: 'wobble', blush: true, sweat: true, eye: 'open' }]],
    gaze: [
      [0, 'travel'],
      [Math.round(duration * 0.42), 'viewer'],
      [Math.round(duration * 0.62), 'left'],
      [Math.round(duration * 0.78), 'right'],
      [Math.round(duration * 0.92), 'viewer'],
    ],
  }),

  closeDuck: ({ hideY }) => ({
    mover: [{ transform: travel(0, hideY) }],
    moverEase: 'cubic-bezier(.5,0,.9,.4)',
    pose: {
      yaw: [[0, 0], [1, 30, 'in']],
      pitch: [[0, 0], [1, 20]],
      sx: [[0.35, 1.1], [1, 0.9]],
      sy: [[0.35, 0.88], [1, 1.12]],
    },
    expression: { mouth: 'o', eye: 'wide', sweat: true },
    gaze: [[0, 'viewer']],
  }),

  /* -------------------------------------------------------- in the corner */
  // Breathing, a slow sway of the body and tip; the body also turns a little toward the pointer.
  idle: () => ({
    loop: true,
    duration: 3600,
    mover: [{ transform: travel(0, 0) }],
    moverDuration: 220,
    pose: {
      sy: [[0, 1], [0.5, 1.016], [1, 1]],
      sx: [[0, 1], [0.5, 0.99], [1, 1]],
      roll: [[0, 0], [0.25, 1.2], [0.75, -1.2], [1, 0]],
      bend: [[0, 0], [0.3, 2.4], [0.8, -2.4], [1, 0]],
    },
    gaze: [[0, 'pointer']],
  }),

  untuck: ({ hideY }) => ({
    mover: [{ transform: travel(0, hideY) }, { transform: travel(0, -4), offset: 0.7 }, { transform: travel(0, 0) }],
    moverEase: 'cubic-bezier(.25,.7,.3,1)',
    pose: { sx: [[0, 1.08], [0.6, 0.95], [1, 1]], sy: [[0, 0.88], [0.6, 1.06], [1, 1]], yaw: [[0, 20], [1, 0, 'out']] },
    expression: { brow: 'up' },
    gaze: [[0, 'viewer']],
  }),

  tuck: ({ hideY }) => ({
    mover: [{ transform: travel(0, hideY) }],
    moverEase: 'cubic-bezier(.5,0,.85,.4)',
    pose: { sx: [[0.3, 1.06], [1, 0.94]], sy: [[0.3, 0.92], [1, 1.06]], yaw: [[0, 0], [1, 20]] },
    expression: { mouth: 'o' },
    gaze: [[0, 'viewer']],
  }),

  // A look round: the whole body turns left, then right, then back to the viewer.
  glance: ({ phases }) => {
    const [viewer, left, right] = phases
    const duration = phases.reduce((sum, part) => sum + part, 0)
    const t = (ms) => ms / duration
    return {
      duration,
      pose: {
        yaw: [[0, 0], [t(viewer), 0], [t(viewer + left * 0.7), -26, 'out'], [t(viewer + left + right * 0.7), 24], [1, 0]],
        roll: [[0, 0], [t(viewer + left * 0.7), 2], [t(viewer + left + right * 0.7), -2], [1, 0]],
      },
      gaze: [
        [0, 'viewer'],
        [viewer, 'left'],
        [viewer + left, 'right'],
        [viewer + left + right, 'viewer'],
      ],
    }
  },

  // Crouch, spring up with a happy twirl, land soft.
  jump: () => ({
    pose: {
      sx: [[0, 1], [0.2, 1.14, 'out'], [0.5, 0.9, 'in'], [0.8, 1.12, 'out'], [1, 1]],
      sy: [[0, 1], [0.2, 0.84, 'out'], [0.5, 1.12, 'in'], [0.8, 0.88, 'out'], [1, 1]],
      y: [[0, 0], [0.2, 0], [0.5, 26, 'out'], [0.8, 0, 'in'], [1, 0]],
      yaw: [[0, 0], [0.16, 0], [0.5, 360, 'out'], [1, 360]], // twirls on the way up, faces you at the top
      armLa: [[0, 26], [0.2, 20], [0.5, 130, 'out'], [0.82, 30], [1, 26]],
      armRa: [[0, 26], [0.2, 20], [0.5, 130, 'out'], [0.82, 30], [1, 26]],
      legL: [[0, 0], [0.5, -22], [0.8, 0]],
      legR: [[0, 0], [0.5, 22], [0.8, 0]],
      nod: [[0, 0], [0.2, 10], [0.5, -12], [0.8, 10], [1, 0]],
    },
    expression: { mouth: 'grin', blush: true },
    gaze: [[0, 'viewer']],
  }),

  // Reduced equivalent for keyboard focus and touch: a squash, a happy wiggle, no travel.
  beam: () => ({
    pose: {
      sx: [[0, 1], [0.35, 1.06], [0.7, 0.98], [1, 1]],
      sy: [[0, 1], [0.35, 0.94], [0.7, 1.03], [1, 1]],
      yaw: [[0, 0], [0.3, -12], [0.65, 10], [1, 0]],
    },
    expression: { mouth: 'grin', eye: 'closed', blush: true },
    gaze: [[0, 'viewer']],
  }),

  /* ---------------------------------------------------------- idle ladder */
  // Folds its arms, turns half away with a "hmph", taps a foot, then turns back.
  impatient: ({ duration }) => {
    const tap = (at) => [
      [at, 0],
      [at + 0.05, 18],
      [at + 0.1, 0],
    ]
    return {
      pose: {
        armLa: [[0, 26], [0.1, -38, 'out'], [0.88, -38], [1, 26]],
        armLf: [[0, 8], [0.1, 74], [0.88, 74], [1, 8]],
        armRa: [[0, 26], [0.1, -34, 'out'], [0.88, -34], [1, 26]],
        armRf: [[0, 8], [0.1, 66], [0.88, 66], [1, 8]],
        armLr: [[0, 1], [0.1, 0.92], [0.88, 0.92], [1, 1]],
        armRr: [[0, 1], [0.1, 0.92], [0.88, 0.92], [1, 1]],
        yaw: [[0, 0], [0.12, -24, 'out'], [0.4, -24], [0.48, 10], [0.62, 10], [0.7, -20], [0.9, -20], [1, 0]],
        roll: [[0, 0], [0.12, -3], [0.9, -3], [1, 0]],
        footR: [[0, 0], ...tap(0.14), ...tap(0.32), ...tap(0.52), ...tap(0.72), [1, 0]],
      },
      expression: { eye: 'half', brow: 'down', mouth: 'wobble' },
      beats: [[Math.round(duration * 0.9), { eye: 'open', brow: 'none', mouth: 'smile' }]],
      gaze: [
        [0, 'viewer'],
        [Math.round(duration * 0.4), 'left'],
        [Math.round(duration * 0.62), 'viewer'],
      ],
    }
  },

  // An apple appears in its hand; three bites with chewing; the core goes flying.
  eat: ({ duration }) => {
    const at = (fraction) => Math.round(duration * fraction)
    return {
      pose: {
        armRa: [[0, 26], [0.1, -6, 'out'], [0.2, -16], [0.27, -6], [0.4, -16], [0.47, -6], [0.6, -16], [0.67, -6], [0.82, -6], [0.88, 150, 'out'], [1, 26]],
        armRf: [[0, 8], [0.1, 80, 'out'], [0.2, 96], [0.27, 80], [0.4, 96], [0.47, 80], [0.6, 96], [0.67, 80], [0.82, 80], [0.88, 10], [1, 8]],
        armRr: [[0, 1], [0.1, 0.95], [0.82, 0.95], [1, 1]],
        yaw: [[0, 0], [0.1, -10], [0.82, -10], [1, 0]],
        pitch: [[0, 0], [0.1, 6], [0.82, 6], [1, 0]],
        sy: [[0, 1], ...cycle(1, 0.975, 7, 0.24, 0.8, 1), [1, 1]],
      },
      decals: [
        {
          selector: '[data-part="apple"]',
          keyframes: [
            { transform: 'scale(0)', opacity: 1 },
            { transform: 'scale(1)', offset: 0.1 },
            { transform: 'scale(1)', offset: 0.84, opacity: 1 },
            { transform: 'translate(30px, -60px) rotate(260deg) scale(.6)', offset: 0.96, opacity: 0 },
            { transform: 'translate(30px, -60px) rotate(260deg) scale(.6)', opacity: 0 },
          ],
          origin: '92px 110px',
        },
      ],
      expression: { apple: 'whole' },
      beats: [
        [at(0.2), { mouth: 'grin', eye: 'closed' }],
        [at(0.25), { mouth: 'chew', apple: 'bitten' }],
        [at(0.4), { mouth: 'grin' }],
        [at(0.45), { mouth: 'chew' }],
        [at(0.6), { mouth: 'grin' }],
        [at(0.65), { mouth: 'chew', apple: 'core' }],
        [at(0.84), { mouth: 'smile', blush: true }],
        [at(0.97), { eye: 'open', apple: 'none', blush: false }],
      ],
      gaze: [[0, 'down-right']],
    }
  },

  yawn: ({ duration }) => ({
    pose: {
      armLa: [[0, 26], [0.35, 150, 'out'], [0.62, 146], [1, 30]],
      armRa: [[0, 26], [0.35, 150, 'out'], [0.62, 146], [1, 30]],
      sy: [[0, 1], [0.35, 1.09], [0.6, 1.09], [0.88, 0.95], [1, 0.95]],
      sx: [[0, 1], [0.35, 0.95], [0.6, 0.95], [0.88, 1.04], [1, 1.04]],
      pitch: [[0, 0], [0.35, -10], [0.6, -10], [1, 6]],
      roll: [[0, 0], [0.7, 0], [1, 7]],
      nod: [[0, 0], [0.35, -10], [1, 10]],
    },
    expression: { mouth: 'yawn', eye: 'closed' },
    beats: [[Math.round(duration * 0.77), { mouth: 'snore' }]],
    gaze: [[0, 'viewer']],
  }),

  // Dozing: tilted, slumped, slow breathing, Zs drifting up.
  sleep: () => ({
    loop: true,
    duration: 4400,
    pose: {
      sy: [[0, 0.95], [0.5, 0.925], [1, 0.95]],
      sx: [[0, 1.04], [0.5, 1.06], [1, 1.04]],
      roll: [[0, 7], [0.5, 8.5], [1, 7]],
      pitch: [[0, 6], [0.5, 8], [1, 6]],
      nod: [[0, 10], [0.5, 14], [1, 10]],
      armLa: [[0, 18]],
      armRa: [[0, 18]],
    },
    decals: [1, 2, 3].map((z) => ({
      selector: `[data-z="${z}"]`,
      keyframes: [
        { transform: 'translate(-4px, 6px)', opacity: 0 },
        { transform: 'translate(0, 0)', opacity: 0.85, offset: 0.35 },
        { transform: 'translate(4px, -6px)', opacity: 0 },
      ],
      duration: 3300,
      delay: (z - 1) * 1100,
      iterations: Infinity,
      fill: 'both',
    })),
    expression: { eye: 'closed', mouth: 'snore', zzz: true },
    gaze: [[0, 'viewer']],
  }),

  wake: ({ duration }) => ({
    pose: {
      roll: [[0, 7], [0.4, -4], [0.7, 3], [1, 0]],
      pitch: [[0, 6], [0.45, -6], [1, 0]],
      yaw: [[0, 0], [0.5, -14], [0.72, 12], [1, 0]],
      sy: [[0, 0.95], [0.45, 1.07], [0.75, 0.98], [1, 1]],
      sx: [[0, 1.04], [0.45, 0.95], [0.75, 1.02], [1, 1]],
      nod: [[0, 10], [0.45, -10], [1, 0]],
    },
    decals: [{ selector: '[data-part="lid"]', keyframes: [{ transform: 'translateY(36px)' }, { transform: 'translateY(36px)', offset: 0.25 }, { transform: 'translateY(14px)', offset: 0.5 }, { transform: 'translateY(30px)', offset: 0.6 }, { transform: 'none' }] }],
    expression: { mouth: 'o', eye: 'open' },
    beats: [[Math.round(duration * 0.65), { mouth: 'smile' }]],
    gaze: [[0, 'viewer']],
  }),
}

/** A blink: the lid drops and lifts again, from wherever it rests (open or half). */
export const BLINK = [{ transform: 'translateY(36px)', offset: 0.45 }, { transform: 'translateY(36px)', offset: 0.55 }]

/* ------------------------------------------------------------- the animator */

const sampleKeys = (keys, u) => {
  if (u <= keys[0][0]) return keys[0][1]
  for (let index = 1; index < keys.length; index += 1) {
    const [t1, v1, ease] = keys[index]
    const [t0, v0] = keys[index - 1]
    if (u <= t1) {
      const span = t1 - t0 || 1
      return v0 + (v1 - v0) * (EASE[ease] ?? EASE.inOut)((u - t0) / span)
    }
  }
  return keys[keys.length - 1][1]
}

/**
 * Plays pose clips. `play(clip, now)` starts one; `tick(now)` advances and returns whether it
 * still needs frames. `pose` is the live pose. Pure (time is passed in), so it is unit-tested.
 */
export const createPoseAnimator = ({ blend = 90, settle = 180 } = {}) => {
  const rest = restPose()
  const pose = restPose()
  let tracks = []
  let clip = null
  let start = 0

  const play = (next, now, duration) => {
    // A finished twirl leaves yaw at 360: fold it back so nothing unwinds the long way.
    pose.yaw = ((((pose.yaw + 180) % 360) + 360) % 360) - 180
    clip = { ...next, duration: next.duration ?? duration ?? 300 }
    start = now
    tracks = []
    const touched = new Set()
    for (const [key, keys] of Object.entries(clip.pose ?? {})) {
      if (!(key in pose)) continue
      touched.add(key)
      const sorted = keys[0][0] > 0 ? [[0, pose[key]], ...keys] : keys
      tracks.push({ key, keys: sorted, from: pose[key], loop: Boolean(clip.loop), duration: clip.duration })
    }
    for (const key of Object.keys(pose)) {
      if (touched.has(key) || Math.abs(pose[key] - rest[key]) < 1e-4) continue
      tracks.push({ key, keys: [[0, pose[key]], [1, rest[key]]], from: pose[key], loop: false, duration: settle })
    }
  }

  /** Sets a still pose at once (reduced motion, suspended tab). */
  const hold = (values = {}) => {
    tracks = []
    clip = null
    Object.assign(pose, restPose(), values)
  }

  const tick = (now) => {
    const elapsed = now - start
    let active = false
    for (const track of tracks) {
      let u = elapsed / track.duration
      if (track.loop) u = ((u % 1) + 1) % 1
      else if (u < 1) active = true
      else u = 1
      let value = sampleKeys(track.keys, u)
      if (elapsed < blend && !(track.keys[0][0] > 0)) value = track.from + (value - track.from) * EASE.inOut(elapsed / blend)
      pose[track.key] = value
    }
    return { active, looping: tracks.some((track) => track.loop) }
  }

  return {
    pose,
    play,
    hold,
    tick,
    get clip() {
      return clip
    },
  }
}
