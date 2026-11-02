/**
 * Animation clips for the mascot rig, played with the Web Animations API by pocket-actors.js.
 *
 * A clip is a function of its parameters returning:
 *   expression  discrete face/prop settings for the clip (see EXPRESSION_DEFAULTS)
 *   tracks      [{ part | selector, keyframes, duration?, delay?, easing?, iterations?, direction? }]
 *               `part` names a [data-part] in the rig, or 'mover' (travel) and 'facing'
 *   beats       [[ms, expression patch]]: expression changes inside the clip
 *   gaze        [[ms, mode]]: where the eye looks ('pointer', 'viewer', 'left', 'right',
 *               'down-right', 'travel'); the eye itself is driven by the gaze loop
 *
 * Units: 'mover' is an HTML box (CSS px); rig parts are SVG (viewBox units; the rig is
 * 120 × 150, feet on y = 147). A keyframe list without an offset-0 frame starts from the
 * part's current pose, which is what keeps interrupted clips continuous.
 */

export const EXPRESSION_DEFAULTS = {
  mouth: 'smile', // smile | grin | o | yawn | chew | wobble | snore
  eye: 'open', // open | half | wide | closed
  brow: 'none', // none | up | down
  arms: 'free', // free | crossed
  apple: 'none', // none | whole | bitten | core
  blush: false,
  sweat: false,
  marks: false,
  zzz: false,
}

const lean = (deg) => `rotate(${deg}deg)`
const travel = (x, y = 0) => `translate(${x}px, ${y}px)`

/** Three fast steps: alternating legs and arms, a low bouncing body. */
const stepCycle = (from, to, steps = 3) => {
  const frames = [{ transform: lean(from) }]
  for (let index = 0; index < steps; index += 1) {
    frames.push({ transform: lean(to), offset: (index + 0.5) / steps })
    frames.push({ transform: lean(from), offset: (index + 1) / steps })
  }
  frames[frames.length - 1] = { transform: 'none' }
  return frames
}

export const MASCOT_CLIPS = {
  /* ------------------------------------------------ page-tip greeting */
  rise: ({ from }) => ({
    expression: { brow: 'up' },
    tracks: [
      { part: 'mover', keyframes: [{ transform: travel(from.x, from.y) }, { transform: travel(0, -3), offset: 0.72 }, { transform: travel(0, 0) }], easing: 'cubic-bezier(.25,.7,.3,1)' },
      { part: 'rig', keyframes: [{ transform: 'scale(1.1, .86)' }, { transform: 'scale(.94, 1.08)', offset: 0.55 }, { transform: 'none' }] },
    ],
    gaze: [[0, 'viewer']],
  }),

  wave: ({ duration, look }) => {
    const lookAt = Math.max(0, duration - look)
    const raise = 'scale(1.3)'
    return {
      expression: { mouth: 'grin', blush: true },
      tracks: [
        {
          part: 'arm-r',
          keyframes: [
            { transform: 'none' },
            { transform: `rotate(-120deg) ${raise}`, offset: 0.18 },
            { transform: `rotate(-94deg) ${raise}`, offset: 0.3 },
            { transform: `rotate(-120deg) ${raise}`, offset: 0.44 },
            { transform: `rotate(-98deg) ${raise}`, offset: 0.58 },
            { transform: `rotate(-106deg) ${raise}`, offset: 0.68 },
            { transform: 'rotate(-30deg) scale(1.08)', offset: 0.86 },
            { transform: 'none' },
          ],
        },
        {
          part: 'hand-r',
          keyframes: [{ transform: 'none' }, { transform: 'rotate(72deg)', offset: 0.18 }, { transform: 'rotate(80deg)', offset: 0.44 }, { transform: 'rotate(66deg)', offset: 0.6 }, { transform: 'none', offset: 0.88 }, { transform: 'none' }],
        },
        { part: 'rig', keyframes: [{ transform: 'none' }, { transform: lean(-3), offset: 0.3 }, { transform: lean(2.5), offset: 0.56 }, { transform: 'none', offset: 0.76 }, { transform: 'none' }] },
      ],
      beats: [[lookAt, { mouth: 'smile', blush: false }]],
      gaze: [
        [0, 'viewer'],
        [lookAt, 'pointer'],
      ],
    }
  },

  duck: ({ to }) => ({
    expression: { mouth: 'o', brow: 'up' },
    tracks: [
      { part: 'mover', keyframes: [{ transform: travel(to.x, to.y) }], easing: 'cubic-bezier(.55,0,.8,.3)' },
      { part: 'rig', keyframes: [{ transform: 'scale(1.08, .9)', offset: 0.3 }, { transform: 'scale(.9, 1.1)' }] },
    ],
    gaze: [[0, 'viewer']],
  }),

  /* ---------------------------------------------------- caught by the turn */
  startle: ({ originX, hideY, dir }) => ({
    expression: { mouth: 'o', eye: 'wide', brow: 'up', marks: true, sweat: true },
    tracks: [
      { part: 'mover', keyframes: [{ transform: travel(originX, hideY) }, { transform: travel(originX, -8), offset: 0.5 }, { transform: travel(originX, 0) }], easing: 'cubic-bezier(.2,.9,.3,1)' },
      {
        part: 'rig',
        keyframes: [
          { transform: 'scale(.92, 1.1)' },
          { transform: 'scale(.86, 1.16)', offset: 0.45 },
          { transform: `${lean(-dir * 9)} scale(1.12, .86)`, offset: 0.85 },
          { transform: `${lean(-dir * 7)} scale(1.1, .88)` },
        ],
      },
      { part: 'arm-l', keyframes: [{ transform: 'none' }, { transform: 'rotate(60deg) scale(1.1)', offset: 0.5 }, { transform: 'rotate(25deg)' }] },
      { part: 'arm-r', keyframes: [{ transform: 'none' }, { transform: 'rotate(-60deg) scale(1.1)', offset: 0.5 }, { transform: 'rotate(-25deg)' }] },
    ],
    gaze: [[0, 'viewer']],
  }),

  run: ({ originX, endX, dir }) => ({
    expression: { mouth: 'o', eye: 'wide', sweat: true },
    tracks: [
      { part: 'mover', keyframes: [{ transform: travel(originX, 0) }, { transform: travel(endX, 0) }], easing: 'cubic-bezier(.4,.1,.45,1)' },
      {
        part: 'rig',
        keyframes: [
          { transform: `${lean(dir * 14)} scale(1.08, .9)` },
          { transform: `${lean(dir * 15)} translateY(-7px) scale(1.04, .94)`, offset: 1 / 6 },
          { transform: `${lean(dir * 14)} scale(1.1, .88)`, offset: 2 / 6 },
          { transform: `${lean(dir * 15)} translateY(-7px) scale(1.04, .94)`, offset: 3 / 6 },
          { transform: `${lean(dir * 14)} scale(1.1, .88)`, offset: 4 / 6 },
          { transform: `${lean(dir * 15)} translateY(-6px) scale(1.04, .94)`, offset: 5 / 6 },
          { transform: `${lean(dir * 12)} scale(1.08, .9)` },
        ],
      },
      { part: 'leg-l', keyframes: stepCycle(-38, 34) },
      { part: 'leg-r', keyframes: stepCycle(34, -38) },
      { part: 'arm-l', keyframes: stepCycle(45, -20) },
      { part: 'arm-r', keyframes: stepCycle(20, -45) },
      { part: 'shadow', keyframes: [{ transform: 'scaleX(1.15)' }, { transform: 'scaleX(1.25)', offset: 0.5 }, { transform: 'scaleX(1.15)' }] },
    ],
    gaze: [[0, 'travel']],
  }),

  recover: ({ endX, dir, duration }) => ({
    expression: { mouth: 'o', sweat: true },
    tracks: [
      {
        part: 'mover',
        keyframes: [{ transform: travel(endX, 0) }, { transform: travel(endX * 1.3, 0), offset: 0.14 }, { transform: travel(-dir * 3, 0), offset: 0.4 }, { transform: travel(0, 0), offset: 0.5 }, { transform: travel(0, 0) }],
        easing: 'ease-out',
      },
      {
        part: 'rig',
        keyframes: [
          { transform: `${lean(-dir * 10)} scale(1.12, .88)` },
          { transform: `${lean(-dir * 16)} scale(1.14, .86)`, offset: 0.14 },
          { transform: `${lean(dir * 4)} scale(.96, 1.05)`, offset: 0.36 },
          { transform: 'none', offset: 0.5 },
          { transform: lean(-2), offset: 0.75 },
          { transform: 'none' },
        ],
      },
      // Embarrassed: a scratch at the back of the head while it checks whether anyone saw.
      { part: 'arm-r', keyframes: [{ transform: 'none', offset: 0.45 }, { transform: 'rotate(-148deg) scale(1.05)', offset: 0.6 }, { transform: 'rotate(-138deg) scale(1.05)', offset: 0.7 }, { transform: 'rotate(-150deg) scale(1.05)', offset: 0.8 }, { transform: 'none' }] },
      { part: 'shadow', keyframes: [{ transform: 'scaleX(1.25)' }, { transform: 'none', offset: 0.45 }, { transform: 'none' }] },
    ],
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
    expression: { mouth: 'o', eye: 'wide', sweat: true },
    tracks: [
      { part: 'mover', keyframes: [{ transform: travel(0, hideY) }], easing: 'cubic-bezier(.5,0,.9,.4)' },
      { part: 'rig', keyframes: [{ transform: 'scale(1.1, .88)', offset: 0.35 }, { transform: 'scale(.9, 1.12)' }] },
    ],
    gaze: [[0, 'viewer']],
  }),

  /* -------------------------------------------------------- in the corner */
  idle: () => ({
    expression: {},
    tracks: [
      { part: 'mover', keyframes: [{ transform: travel(0, 0) }], duration: 220 },
      { part: 'rig', keyframes: [{ transform: 'none' }, { transform: 'scale(1.014, .986)' }], duration: 1800, iterations: Infinity, direction: 'alternate', easing: 'ease-in-out' },
    ],
    gaze: [[0, 'pointer']],
  }),

  untuck: ({ hideY }) => ({
    expression: { brow: 'up' },
    tracks: [
      { part: 'mover', keyframes: [{ transform: travel(0, hideY) }, { transform: travel(0, -4), offset: 0.7 }, { transform: travel(0, 0) }], easing: 'cubic-bezier(.25,.7,.3,1)' },
      { part: 'rig', keyframes: [{ transform: 'scale(1.08, .88)' }, { transform: 'scale(.95, 1.06)', offset: 0.6 }, { transform: 'none' }] },
    ],
    gaze: [[0, 'viewer']],
  }),

  tuck: ({ hideY }) => ({
    expression: { mouth: 'o' },
    tracks: [
      { part: 'mover', keyframes: [{ transform: travel(0, hideY) }], easing: 'cubic-bezier(.5,0,.85,.4)' },
      { part: 'rig', keyframes: [{ transform: 'scale(1.06, .92)', offset: 0.3 }, { transform: 'scale(.94, 1.06)' }] },
    ],
    gaze: [[0, 'viewer']],
  }),

  glance: ({ phases }) => {
    const [viewer, left, right] = phases
    return {
      expression: {},
      tracks: [{ part: 'face', keyframes: [{ transform: 'none' }, { transform: lean(-3), offset: 0.45 }, { transform: lean(3), offset: 0.7 }, { transform: 'none' }] }],
      gaze: [
        [0, 'viewer'],
        [viewer, 'left'],
        [viewer + left, 'right'],
        [viewer + left + right, 'viewer'],
      ],
    }
  },

  jump: () => ({
    expression: { mouth: 'grin', blush: true },
    tracks: [
      {
        part: 'rig',
        keyframes: [
          { transform: 'none' },
          { transform: 'scale(1.14, .84)', offset: 0.2, easing: 'ease-out' },
          { transform: 'translateY(-26px) scale(.9, 1.12)', offset: 0.5, easing: 'ease-in' },
          { transform: 'scale(1.12, .88)', offset: 0.8, easing: 'ease-out' },
          { transform: 'none' },
        ],
      },
      { part: 'shadow', keyframes: [{ transform: 'none' }, { transform: 'scaleX(1.12)', offset: 0.2 }, { transform: 'scale(.6)', offset: 0.5 }, { transform: 'scaleX(1.14)', offset: 0.8 }, { transform: 'none' }] },
      { part: 'arm-l', keyframes: [{ transform: 'none' }, { transform: 'rotate(20deg)', offset: 0.2 }, { transform: 'rotate(115deg) scale(1.15)', offset: 0.5 }, { transform: 'rotate(10deg)', offset: 0.82 }, { transform: 'none' }] },
      { part: 'arm-r', keyframes: [{ transform: 'none' }, { transform: 'rotate(-20deg)', offset: 0.2 }, { transform: 'rotate(-115deg) scale(1.15)', offset: 0.5 }, { transform: 'rotate(-10deg)', offset: 0.82 }, { transform: 'none' }] },
    ],
    gaze: [[0, 'viewer']],
  }),

  beam: () => ({
    expression: { mouth: 'grin', eye: 'closed', blush: true },
    tracks: [{ part: 'rig', keyframes: [{ transform: 'none' }, { transform: 'scale(1.06, .94)', offset: 0.35 }, { transform: 'scale(.98, 1.03)', offset: 0.7 }, { transform: 'none' }] }],
    gaze: [[0, 'viewer']],
  }),

  /* ---------------------------------------------------------- idle ladder */
  impatient: ({ duration }) => {
    const tap = (at) => [
      { transform: 'none', offset: at },
      { transform: 'rotate(-18deg)', offset: at + 0.05 },
      { transform: 'none', offset: at + 0.1 },
    ]
    return {
      expression: { arms: 'crossed', eye: 'half', brow: 'down', mouth: 'wobble' },
      tracks: [
        { part: 'foot-r', keyframes: [{ transform: 'none' }, ...tap(0.12), ...tap(0.32), ...tap(0.52), ...tap(0.72), { transform: 'none' }], easing: 'ease-in-out' },
        { part: 'rig', keyframes: [{ transform: 'none' }, { transform: lean(-2), offset: 0.15 }, { transform: lean(-2), offset: 0.85 }, { transform: 'none' }] },
      ],
      beats: [[Math.round(duration * 0.9), { arms: 'free', eye: 'open', brow: 'none', mouth: 'smile' }]],
      gaze: [
        [0, 'viewer'],
        [Math.round(duration * 0.35), 'left'],
        [Math.round(duration * 0.6), 'viewer'],
      ],
    }
  },

  eat: ({ duration }) => {
    const at = (fraction) => Math.round(duration * fraction)
    const hold = 'translate(-11px, -5px)'
    const bite = 'translate(-17px, -9px)'
    return {
      expression: { apple: 'whole' },
      tracks: [
        {
          part: 'apple',
          keyframes: [
            { transform: 'translate(4px, 8px) scale(0)', opacity: 1 },
            { transform: `${hold} scale(1)`, offset: 0.1 },
            { transform: bite, offset: 0.2 },
            { transform: hold, offset: 0.27 },
            { transform: bite, offset: 0.4 },
            { transform: hold, offset: 0.47 },
            { transform: bite, offset: 0.6 },
            { transform: hold, offset: 0.67 },
            { transform: hold, offset: 0.8, opacity: 1 },
            { transform: 'translate(34px, -46px) rotate(220deg) scale(.6)', offset: 0.93, opacity: 0 },
            { transform: 'translate(34px, -46px) rotate(220deg) scale(.6)', opacity: 0 },
          ],
        },
        { part: 'arm-r', keyframes: [{ transform: 'none' }, { transform: 'rotate(-58deg)', offset: 0.1 }, { transform: 'rotate(-64deg)', offset: 0.2 }, { transform: 'rotate(-58deg)', offset: 0.67 }, { transform: 'rotate(-120deg) scale(1.15)', offset: 0.86 }, { transform: 'none' }] },
        { part: 'rig', keyframes: [{ transform: 'none' }, { transform: 'scale(1.025, .975)' }, { transform: 'none' }], duration: 300, delay: at(0.24), iterations: 7 },
      ],
      beats: [
        [at(0.2), { mouth: 'grin', eye: 'closed' }],
        [at(0.25), { mouth: 'chew', apple: 'bitten' }],
        [at(0.4), { mouth: 'grin' }],
        [at(0.45), { mouth: 'chew' }],
        [at(0.6), { mouth: 'grin' }],
        [at(0.65), { mouth: 'chew', apple: 'core' }],
        [at(0.84), { mouth: 'smile', blush: true }],
        [at(0.95), { eye: 'open', apple: 'none', blush: false }],
      ],
      gaze: [[0, 'down-right']],
    }
  },

  yawn: ({ duration }) => ({
    expression: { mouth: 'yawn', eye: 'closed' },
    tracks: [
      { part: 'arm-l', keyframes: [{ transform: 'none' }, { transform: 'rotate(120deg) scale(1.15)', offset: 0.35 }, { transform: 'rotate(116deg) scale(1.15)', offset: 0.62 }, { transform: 'none' }] },
      { part: 'arm-r', keyframes: [{ transform: 'none' }, { transform: 'rotate(-120deg) scale(1.15)', offset: 0.35 }, { transform: 'rotate(-116deg) scale(1.15)', offset: 0.62 }, { transform: 'none' }] },
      { part: 'rig', keyframes: [{ transform: 'none' }, { transform: 'scale(.95, 1.08)', offset: 0.35 }, { transform: 'scale(.95, 1.08)', offset: 0.6 }, { transform: 'translateY(2px) scale(1.04, .95)', offset: 0.88 }, { transform: 'translateY(2px) scale(1.03, .96)' }] },
    ],
    beats: [[Math.round(duration * 0.77), { mouth: 'snore' }]],
    gaze: [[0, 'viewer']],
  }),

  sleep: () => ({
    expression: { eye: 'closed', mouth: 'snore', zzz: true },
    tracks: [
      { part: 'rig', keyframes: [{ transform: 'translateY(2px) scale(1.03, .96)' }, { transform: 'translateY(2px) scale(1.055, .935)' }], duration: 2200, iterations: Infinity, direction: 'alternate', easing: 'ease-in-out' },
      ...[1, 2, 3].map((z) => ({
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
    ],
    gaze: [[0, 'viewer']],
  }),

  wake: ({ duration }) => ({
    expression: { mouth: 'o', eye: 'open' },
    tracks: [
      { part: 'lid', keyframes: [{ transform: 'translateY(36px)' }, { transform: 'translateY(36px)', offset: 0.25 }, { transform: 'translateY(14px)', offset: 0.5 }, { transform: 'translateY(30px)', offset: 0.6 }, { transform: 'none' }] },
      { part: 'rig', keyframes: [{ transform: 'translateY(2px) scale(1.03, .96)' }, { transform: 'scale(.95, 1.07)', offset: 0.45 }, { transform: 'scale(1.02, .98)', offset: 0.75 }, { transform: 'none' }] },
      { part: 'face', keyframes: [{ transform: 'none' }, { transform: lean(-5), offset: 0.55 }, { transform: lean(4), offset: 0.72 }, { transform: 'none' }] },
    ],
    beats: [[Math.round(duration * 0.65), { mouth: 'smile' }]],
    gaze: [[0, 'viewer']],
  }),
}

/** A blink: the lid drops and lifts again, from wherever it rests (open or half). */
export const BLINK = [{ transform: 'translateY(36px)', offset: 0.45 }, { transform: 'translateY(36px)', offset: 0.55 }]
