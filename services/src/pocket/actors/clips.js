/**
 * Animation clips for the 3D mascot, and the pose animator that plays them.
 *
 * A clip is a function of its parameters returning:
 *   pose        { key: [[t, value, ease?], ...] } tracks over the 3D pose (see restPose() in
 *               ./mascot-model.js). `t` runs 0..1 over the clip; `ease` shapes the segment
 *               ending at that key.
 *   loop        true for a repeating clip (holding the button, sleeping)
 *   decals      Web Animations tracks on decal parts by selector (the Zs)
 *   expression  discrete face settings for the clip (see EXPRESSION_DEFAULTS)
 *   beats       [[ms, expression patch]]: expression changes inside the clip
 *   gaze        [[ms, target]]: what the eye looks at ('cursor', 'sticker', 'button', 'cards',
 *               'ripple', 'drone', 'viewer', 'ride'); the look controller turns eye and body
 *
 * Clips are the scripted beats only. Everything continuous is physical and lives in
 * pocket-actors.js: where the body faces (a spring toward what it looks at), the ride
 * (./gait.js), breathing and weight shifts, and the flame tip's follow-through. Clips leave
 * the body's heading to that look controller and add to it.
 *
 * Interrupting a clip never pops: each track blends from the pose it found over its first
 * 90 ms, and pose keys the new clip leaves alone ease back to rest.
 */

import { restPose } from './mascot-model.js'

export const EXPRESSION_DEFAULTS = {
  mouth: 'smile', // smile | grin | o | yawn | chew | wobble | snore
  eye: 'open', // open | half | wide | closed
  brow: 'none', // none | up | down
  apple: 'none', // none | whole | bitten | core (unused, kept in the sheet)
  blush: false,
  sweat: false,
  marks: false,
  zzz: false,
}

/**
 * Overlapping action: how far (ms) each pose key trails the body in a one-shot clip. The arms
 * and hands follow through a little after the body.
 */
export const TRACK_LAG = { armLa: 40, armRa: 40, armLf: 50, armRf: 50, handL: 70, handR: 70, footR: 30 }

const EASE = {
  linear: (t) => t,
  in: (t) => t * t,
  out: (t) => 1 - (1 - t) * (1 - t),
  inOut: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  back: (t) => 1 + 2.4 * (t - 1) ** 3 + 1.4 * (t - 1) ** 2,
}

export const MASCOT_CLIPS = {
  /* ------------------------------------------------- the save, every time */
  // Up from under the paper to behind the pocket button: a stretch on the way, a settle.
  emerge: () => ({
    pose: {
      sy: [[0, 0.94], [0.45, 1.05, 'out'], [0.8, 0.98], [1, 1]],
      sx: [[0, 1.05], [0.45, 0.96, 'out'], [0.8, 1.01], [1, 1]],
      nod: [[0, -6], [0.5, 5, 'out'], [1, 0]],
      pitch: [[0, 8], [1, -2, 'out']],
    },
    expression: { brow: 'up' },
    gaze: [[0, 'sticker']],
  }),

  // Holding the button open: leaning back on it, a slight tremble of effort.
  hold: () => ({
    loop: true,
    duration: 900,
    pose: {
      pitch: [[0, -5], [0.5, -7], [1, -5]],
      sy: [[0, 1.02], [0.5, 1.035], [1, 1.02]],
      sx: [[0, 0.99], [0.5, 0.982], [1, 0.99]],
    },
    expression: { brow: 'up' },
    gaze: [[0, 'sticker']],
  }),

  // The item drops in: the button snaps shut under its hands, a squash, a nod, a grin.
  catch: () => ({
    pose: {
      sy: [[0, 1.02], [0.25, 0.92, 'out'], [0.6, 1.03, 'out'], [1, 1]],
      sx: [[0, 0.99], [0.25, 1.07, 'out'], [0.6, 0.99, 'out'], [1, 1]],
      nod: [[0, 0], [0.3, 10, 'out'], [0.7, -3], [1, 0]],
      pitch: [[0, -5], [0.3, 7, 'out'], [1, 1]],
    },
    expression: { mouth: 'grin', blush: true },
    gaze: [[0, 'button']],
  }),

  // Lets go and sinks back behind the button, under the paper.
  slip: () => ({
    pose: {
      pitch: [[0, 1], [1, 10, 'in']],
      sx: [[0.3, 1.03], [1, 0.96]],
      sy: [[0.3, 0.97], [1, 1.04]],
    },
    expression: { mouth: 'smile' },
    gaze: [[0, 'button']],
  }),

  /* ----------------------------------------------------------- in the album */
  // A click's ripple passes it: a small hop back, arms up, eye wide.
  flinch: () => ({
    pose: {
      y: [[0, 0], [0.15, 0], [0.4, 7, 'out'], [0.75, 0, 'in'], [1, 0]],
      sy: [[0, 1], [0.15, 0.93, 'out'], [0.4, 1.06, 'out'], [0.75, 0.95, 'in'], [1, 1, 'out']],
      sx: [[0, 1], [0.15, 1.05, 'out'], [0.4, 0.96, 'out'], [0.75, 1.04, 'in'], [1, 1, 'out']],
      pitch: [[0, 0], [0.4, -8, 'out'], [1, 0]],
      armLa: [[0, 26], [0.35, 68, 'out'], [1, 26]],
      armRa: [[0, 26], [0.35, 68, 'out'], [1, 26]],
    },
    expression: { eye: 'wide', mouth: 'o', brow: 'up' },
    gaze: [[0, 'ripple']],
  }),

  untuck: () => ({
    pose: { sx: [[0, 1.06], [0.6, 0.97], [1, 1]], sy: [[0, 0.92], [0.6, 1.04], [1, 1]] },
    expression: { brow: 'up' },
    gaze: [[0, 'cursor']],
  }),

  tuck: () => ({
    pose: { sx: [[0.3, 1.04], [1, 0.96]], sy: [[0.3, 0.95], [1, 1.04]] },
    expression: { mouth: 'o' },
    gaze: [[0, 'cursor']],
  }),

  /* ------------------------------------------------------------- the doze */
  yawn: ({ duration }) => ({
    pose: {
      armLa: [[0, 26], [0.4, 58, 'out'], [0.65, 56], [1, 30]],
      armRa: [[0, 26], [0.4, 58, 'out'], [0.65, 56], [1, 30]],
      sy: [[0, 1], [0.4, 1.05, 'out'], [0.65, 1.05], [1, 0.96]],
      sx: [[0, 1], [0.4, 0.97], [0.65, 0.97], [1, 1.03]],
      pitch: [[0, 0], [0.4, -6], [0.65, -6], [1, 5]],
      roll: [[0, 0], [0.7, 0], [1, 5]],
      nod: [[0, 0], [0.4, -6], [1, 8]],
    },
    expression: { mouth: 'yawn', eye: 'closed' },
    beats: [[Math.round(duration * 0.8), { mouth: 'snore' }]],
    gaze: [[0, 'viewer']],
  }),

  // Dozing: tilted, slumped, slow breathing. The Zs drift up `cycles` times, then stop.
  sleep: ({ cycles = 2 } = {}) => ({
    loop: true,
    duration: 5500,
    pose: {
      sy: [[0, 0.96], [0.5, 0.945], [1, 0.96]],
      sx: [[0, 1.03], [0.5, 1.045], [1, 1.03]],
      roll: [[0, 5], [0.5, 6], [1, 5]],
      pitch: [[0, 5], [0.5, 6.5], [1, 5]],
      nod: [[0, 8], [0.5, 11], [1, 8]],
      armLa: [[0, 22]],
      armRa: [[0, 22]],
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
      iterations: cycles,
      fill: 'both',
    })),
    expression: { eye: 'closed', mouth: 'snore', zzz: true },
    gaze: [[0, 'viewer']],
  }),

  // The lid lifts, a small settle. No shake.
  wake: () => ({
    pose: {
      roll: [[0, 5], [0.6, 0, 'out'], [1, 0]],
      pitch: [[0, 5], [0.6, 0, 'out'], [1, 0]],
      nod: [[0, 8], [0.6, 0, 'out'], [1, 0]],
      sy: [[0, 0.96], [0.6, 1.01, 'out'], [1, 1]],
      sx: [[0, 1.03], [0.6, 0.995, 'out'], [1, 1]],
      lid: [[0, 1], [0.1, 1], [0.6, 0, 'out'], [1, 0]],
    },
    expression: { mouth: 'smile', eye: 'open' },
    gaze: [[0, 'cursor']],
  }),
}

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
 * In a one-shot clip each key may trail the body by `lag[key]` ms (overlapping action): it holds
 * where it was for that long, then plays its track, so it also finishes that much later.
 */
export const createPoseAnimator = ({ blend = 90, settle = 180, lag = TRACK_LAG } = {}) => {
  const rest = restPose()
  const pose = restPose()
  let tracks = []
  let clip = null
  let start = 0

  const play = (next, now, duration) => {
    clip = { ...next, duration: next.duration ?? duration ?? 300 }
    start = now
    tracks = []
    const touched = new Set()
    const loop = Boolean(clip.loop)
    for (const [key, keys] of Object.entries(clip.pose ?? {})) {
      if (!(key in pose)) continue
      touched.add(key)
      const sorted = keys[0][0] > 0 ? [[0, pose[key]], ...keys] : keys
      tracks.push({ key, keys: sorted, from: pose[key], loop, duration: clip.duration, lag: loop ? 0 : lag[key] ?? 0 })
    }
    for (const key of Object.keys(pose)) {
      if (touched.has(key) || Math.abs(pose[key] - rest[key]) < 1e-4) continue
      tracks.push({ key, keys: [[0, pose[key]], [1, rest[key]]], from: pose[key], loop: false, duration: settle, lag: lag[key] ?? 0 })
    }
  }

  /** Sets a still pose at once (reduced motion, suspended tab). */
  const hold = (values = {}) => {
    tracks = []
    clip = null
    Object.assign(pose, restPose(), values)
  }

  /** Stops every track where it is: the pose stays exactly as it was drawn last. */
  const freeze = () => {
    tracks = []
    clip = null
  }

  const tick = (now) => {
    const elapsed = now - start
    let active = false
    for (const track of tracks) {
      const local = elapsed - track.lag
      if (local < 0) {
        pose[track.key] = track.from
        active = true
        continue
      }
      let u = local / track.duration
      if (track.loop) u = ((u % 1) + 1) % 1
      else if (u < 1) active = true
      else u = 1
      let value = sampleKeys(track.keys, u)
      if (local < blend && !(track.keys[0][0] > 0)) value = track.from + (value - track.from) * EASE.inOut(local / blend)
      pose[track.key] = value
    }
    return { active, looping: tracks.some((track) => track.loop) }
  }

  return {
    pose,
    play,
    hold,
    freeze,
    tick,
    get clip() {
      return clip
    },
  }
}
