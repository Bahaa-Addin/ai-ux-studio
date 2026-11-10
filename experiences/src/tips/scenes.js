/**
 * Tips: the animated scenes (voice-guide ADR-0045). Each tip opens with a short loop, as in
 * Apple's Tips app, that shows the gesture on a small copy of this page.
 *
 * - Real content only: the services, pictures, section titles, template names and journey
 *   questions are the page's own (the content model, src/aixc/templates.js, and the guide's
 *   verified questions in voice-guide config/experience). The spoken example is from the router's
 *   tuning set. Pages the clone does not have (the internet bundles) are drawn as grey blocks.
 * - Drawn on a 400×250 canvas that is scaled to fit, so every position below is in canvas px.
 * - Motion is the Web Animations API: every track spans the whole loop with keyframe offsets, so
 *   a scene plays, pauses, restarts and loops as one. Only transform, opacity and colours move.
 * - Reduced motion: the scene stops on its poster frame, which tells the same story.
 */

import { icon, pathIcon, vodafoneMark, SVG_NS } from './icons.js'

export const CANVAS = { width: 400, height: 250 }
const EASE = 'cubic-bezier(.2,.8,.2,1)'
const EASE_IN_OUT = 'cubic-bezier(.65,0,.35,1)'
const SPRING = 'cubic-bezier(.34,1.56,.64,1)'

/* ------------------------------------------------------------------ building blocks */

const n = (tag, className, style, ...children) => {
  // `style` may be left out: a text or a node in its place is the first child.
  if (style !== null && style !== undefined && (typeof style !== 'object' || style instanceof Node)) {
    children.unshift(style)
    style = null
  }
  const node = document.createElement(tag)
  if (className) node.className = className
  if (style) {
    for (const [key, value] of Object.entries(style)) node.style[key] = typeof value === 'number' ? `${value}px` : value
    if ('left' in style || 'top' in style) node.style.position = 'absolute'
  }
  for (const child of children) if (child !== null && child !== undefined && child !== false) node.append(child)
  return node
}
const at = (x, y, w, h) => ({ left: x, top: y, width: w, height: h })
/** Places an element (an SVG, which `n` does not make) at canvas px. */
const place = (node, x, y, w, h) => {
  Object.assign(node.style, { position: 'absolute', left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px` })
  return node
}

/** A timeline: tracks that each span the whole loop, so they stay in step. */
const timeline = (length) => {
  const anims = []
  const track = (node, frames, easing = EASE) => {
    if (!node || typeof node.animate !== 'function' || !frames.length) return null
    const keyframes = []
    const first = frames[0]
    const last = frames[frames.length - 1]
    if (first[0] > 0) keyframes.push({ ...first[1], offset: 0 })
    // A frame's easing describes how the scene arrives at it (WAAPI puts it on the segment before).
    frames.forEach(([time, props], i) => keyframes.push({ ...props, offset: Math.min(1, Math.max(0, time / length)), easing: frames[i + 1]?.[2] || easing }))
    if (last[0] < length) keyframes.push({ ...last[1], offset: 1 })
    const animation = node.animate(keyframes, { duration: length, iterations: Infinity, fill: 'both' })
    animation.pause()
    anims.push(animation)
    return animation
  }
  /** A short decorative loop (a waveform, a breathing dot) with its own period. */
  const loop = (node, keyframes, duration, delay = 0) => {
    if (!node || typeof node.animate !== 'function') return null
    const animation = node.animate(keyframes, { duration, iterations: Infinity, delay: -delay, easing: 'ease-in-out' })
    animation.pause()
    anims.push(animation)
    return animation
  }
  return {
    length,
    anims,
    track,
    loop,
    play: () => anims.forEach((a) => a.play()),
    pause: () => anims.forEach((a) => a.pause()),
    seek: (time) =>
      anims.forEach((a) => {
        const period = a.effect?.getTiming?.().duration || length
        a.currentTime = time % period
      }),
    cancel: () => anims.forEach((a) => a.cancel()),
  }
}

/** Tracks are written as [time, props] pairs; these build the props. */
const o = (opacity, transform) => (transform === undefined ? { opacity } : { opacity, transform })

/** The touch indicator, as in Apple's tips: [time, x, y, scale, opacity] → frames. */
const tapDot = () => n('div', 'ts-tap', at(0, 0, 22, 22))
const tapFrames = (steps) => steps.map(([time, x, y, scale = 1, opacity = 1, ease]) => [time, o(opacity, `translate(${x - 11}px, ${y - 11}px) scale(${scale})`), ease])
/** Move to a point, press, release: the common gesture. */
const press = (time, x, y, from) => [
  [time - 520, from[0], from[1], 1, 0],
  [time - 420, from[0], from[1], 1, 1],
  [time, x, y, 1, 1, EASE_IN_OUT],
  [time + 60, x, y, 0.78, 1],
  [time + 220, x, y, 1, 1],
  [time + 520, x + (from[0] - x) * 0.3, y + 26, 1, 0],
]

const miniHeader = (ctx) =>
  n(
    'div',
    'ts-header',
    at(0, 0, 400, 26),
    n('span', 'ts-header__logo', at(ctx.mx(12, 18), 4, 18, 18), vodafoneMark()),
    ...[0, 1, 2, 3].map((i) => n('span', 'ts-header__nav', at(ctx.mx(42 + i * 34, 26), 11, 26, 4))),
    n('span', 'ts-header__me', at(ctx.mx(372, 14), 6, 14, 14)),
  )

/** A service card: the real picture and title. */
const miniCard = (item, x, y, w, h, { titleH = 18, className = '' } = {}) => {
  const card = n('div', `ts-card ${className}`.trim(), at(x, y, w, h))
  const picture = n('div', 'ts-card__media', { height: h - titleH })
  if (item?.image?.src) {
    const img = n('img', item.image.fit === 'contain' ? 'is-contain' : '')
    img.alt = ''
    img.decoding = 'async'
    img.src = item.image.src
    picture.append(img)
  }
  card.append(picture, n('span', 'ts-card__title', { height: titleH }, item?.title ?? ''))
  return card
}

/** Grey blocks for a page the clone does not have. */
const skeletonCard = (x, y, w, h, button) =>
  n(
    'div',
    'ts-card ts-card--skeleton',
    at(x, y, w, h),
    n('span', 'ts-sk ts-sk--line', at(10, 12, w * 0.5, 6)),
    n('span', 'ts-sk ts-sk--block', at(10, 26, w * 0.46, 20)),
    n('span', 'ts-sk ts-sk--line', at(10, 56, w * 0.78, 4)),
    n('span', 'ts-sk ts-sk--line', at(10, 66, w * 0.6, 4)),
    n('span', 'ts-sk ts-sk--line', at(10, 76, w * 0.7, 4)),
    button,
  )

const micButton = (x, y, size = 32) => n('div', 'ts-mic', at(x, y, size, size), icon('mic'))
const a11yButton = (x, y, size = 26) => n('div', 'ts-a11y', at(x, y, size, size), n('i'), n('b'))

/** The guide speaking: a dark bubble with a speaker and a moving level. */
const speakingBubble = (tl, x, y) => {
  const bars = [0, 1, 2].map(() => n('i'))
  const bubble = n('div', 'ts-speak', at(x, y, 50, 18), icon('speaker'), n('span', 'ts-speak__level', null, ...bars))
  bars.forEach((bar, i) => tl.loop(bar, [{ transform: 'scaleY(.35)' }, { transform: 'scaleY(1)' }, { transform: 'scaleY(.5)' }], 520, i * 160))
  return bubble
}

/** The page's own "page" under the header: title plus rows of real cards. */
const servicesBody = (ctx, rows) => {
  const body = n('div', 'ts-body', at(0, 26, 400, 224))
  body.append(n('div', 'ts-h', at(ctx.mx(16, 300), 10, 300, 18), ctx.pageTitle))
  rows.forEach((ids, r) => {
    ids.forEach((id, i) => body.append(miniCard(ctx.item(id), ctx.mx(16 + i * 126, 116), 36 + r * 96, 116, 86, { titleH: 23 })))
  })
  return body
}

const ROW_A = ['balance-transfer', 'end-of-call-notifications', 'international-balance-transfer']
const ROW_B = ['roaming', 'visiting-egypt', 'international-standard-rates']

/** The scene's frame: a stage that keeps the canvas's shape, and the canvas inside it. */
const frame = (ctx, label) => {
  const canvas = n('div', 'ts-canvas')
  canvas.dir = ctx.rtl ? 'rtl' : 'ltr'
  const stage = n('div', 'ts-stage', null, canvas)
  stage.setAttribute('aria-hidden', 'true')
  stage.dataset.scene = label
  return { stage, canvas }
}

/* ------------------------------------------------------------------ the scenes */

const SCENES = {}

/** The cover: the page, and the four demos arriving over it one by one. */
SCENES.cover = (ctx) => {
  const { stage, canvas } = frame(ctx, 'cover')
  const tl = timeline(6400)
  const page = n('div', 'ts-page', at(0, 0, 400, 250))
  const hero = n('div', 'ts-hero', at(0, 26, 400, 58))
  if (ctx.heroImage) {
    const img = n('img')
    img.alt = ''
    img.src = ctx.heroImage
    hero.append(img)
  }
  page.append(hero, n('div', 'ts-h', at(ctx.mx(16, 300), 92, 300, 18), ctx.pageTitle))
  ;['vodafone-cash', 'balance-transfer', 'roaming', 'play-and-win'].forEach((id, i) => page.append(miniCard(ctx.item(id), ctx.mx(16 + i * 94, 86), 116, 86, 70)))
  ;['calls-services', 'vf-play', 'mini-call', 'multi-sim'].forEach((id, i) => page.append(miniCard(ctx.item(id), ctx.mx(16 + i * 94, 86), 194, 86, 70)))
  const veil = n('div', 'ts-veil', at(0, 0, 400, 250))
  canvas.append(page, miniHeader(ctx), veil)

  const points = [
    [72, 162],
    [154, 128],
    [246, 128],
    [328, 162],
  ].map(([x, y]) => [ctx.rtl ? 400 - x : x, y])
  const path = document.createElementNS(SVG_NS, 'svg')
  path.setAttribute('class', 'ts-cover__path')
  path.setAttribute('viewBox', '0 0 400 250')
  place(path, 0, 0, 400, 250)
  const [p0, p1, p2, p3] = points
  const line = document.createElementNS(SVG_NS, 'path')
  line.setAttribute('d', `M${p0[0]},${p0[1]} C${p0[0]},${p1[1] - 6} ${p1[0] - (p1[0] - p0[0]) * 0.4},${p1[1]} ${p1[0]},${p1[1]} S${p2[0]},${p2[1]} ${p2[0]},${p2[1]} S${p3[0]},${p2[1] - 6} ${p3[0]},${p3[1]}`)
  line.setAttribute('pathLength', '100')
  path.append(line)
  canvas.append(path)
  tl.track(line, [
    [0, { strokeDashoffset: 100, opacity: 1 }],
    [2000, { strokeDashoffset: 100, opacity: 1 }],
    [2900, { strokeDashoffset: 0, opacity: 1 }, EASE_IN_OUT],
    [5500, { strokeDashoffset: 0, opacity: 1 }],
    [5900, { strokeDashoffset: 0, opacity: 0 }],
  ])

  ctx.features.forEach((feature, i) => {
    const [x, y] = points[i]
    const badge = n(
      'div',
      `ts-badge ts-badge--${feature.id}`,
      at(x - 40, y - 22, 80, 70),
      n('span', 'ts-badge__disc', null, icon(feature.icon)),
      n('span', 'ts-badge__name', null, ctx.t(feature.name)),
    )
    canvas.append(badge)
    const start = 420 + i * 380
    tl.track(badge, [
      [0, o(0, 'translateY(10px) scale(.6)')],
      [start, o(0, 'translateY(10px) scale(.6)')],
      [start + 300, o(1, 'translateY(-2px) scale(1.08)'), SPRING],
      [start + 480, o(1, 'translateY(0) scale(1)')],
      [3400 + i * 120, o(1, 'translateY(-3px) scale(1)'), EASE_IN_OUT],
      [4400 + i * 120, o(1, 'translateY(1px) scale(1)'), EASE_IN_OUT],
      [5500, o(1, 'translateY(0) scale(1)')],
      [5900 + i * 60, o(0, 'translateY(-6px) scale(.92)')],
    ])
  })
  tl.track(page, [
    [0, { transform: 'translateY(0) scale(1)' }],
    [6400, { transform: 'translateY(-14px) scale(1.035)' }, 'linear'],
  ])
  tl.track(veil, [
    [0, { opacity: 0 }],
    [300, { opacity: 0 }],
    [900, { opacity: 1 }],
    [5800, { opacity: 1 }],
    [6300, { opacity: 0 }],
  ])
  return { stage, tl, poster: 3200 }
}

/** Voice guide 1: press the microphone, ask, see the words one by one; the keyboard beside it. */
SCENES.voiceAsk = (ctx) => {
  const { stage, canvas } = frame(ctx, 'voiceAsk')
  const tl = timeline(6400)
  canvas.append(n('div', 'ts-page', at(0, 0, 400, 250)), servicesBody(ctx, [ROW_A, ROW_B]), miniHeader(ctx))
  const halos = [0, 1].map(() => n('div', 'ts-halo', at(358, 172, 32, 32)))
  const mic = micButton(358, 172)
  const kbd = n('div', 'ts-kbd', at(326, 176, 24, 24), icon('keyboard'))
  const waves = [0, 1, 2, 3, 4].map(() => n('i'))
  const words = ctx.example.map((word) => n('span', 'ts-word', null, word))
  const bar = n('div', 'ts-bar', at(122, 126, 264, 36), n('span', 'ts-bar__wave', null, ...waves), n('span', 'ts-bar__words', null, ...words))
  bar.querySelector('.ts-bar__words').dir = ctx.rtl ? 'rtl' : 'ltr'
  const tap = tapDot()
  canvas.append(a11yButton(361, 214), ...halos, kbd, mic, bar, tap)

  tl.track(tap, tapFrames(press(820, 374, 188, [330, 262])))
  tl.track(mic, [
    [0, o(1, 'scale(1)')],
    [820, o(1, 'scale(1)')],
    [880, o(1, 'scale(.9)')],
    [1040, o(1, 'scale(1)'), SPRING],
  ])
  halos.forEach((halo, i) => {
    const frames = [[0, o(0, 'scale(1)')]]
    for (const start of [1000 + i * 650, 2300 + i * 650]) frames.push([start - 1, o(0, 'scale(1)')], [start, o(0.5, 'scale(1)')], [start + 760, o(0, 'scale(2.4)'), 'cubic-bezier(.1,.6,.3,1)'])
    tl.track(halo, frames)
  })
  tl.track(bar, [
    [0, o(0, 'translateY(8px) scaleY(.6)')],
    [1000, o(0, 'translateY(8px) scaleY(.6)')],
    [1260, o(1, 'translateY(0) scaleY(1)')],
    [4200, o(1, 'translateY(0) scaleY(1)')],
    [4460, o(0, 'translateY(8px) scaleY(.6)')],
  ])
  waves.forEach((wave, i) => tl.loop(wave, [{ transform: 'scaleY(.25)' }, { transform: `scaleY(${0.6 + (i % 3) * 0.2})` }, { transform: 'scaleY(.35)' }], 460 + i * 40, i * 90))
  words.forEach((word, i) => {
    const start = 1350 + i * 330
    tl.track(word, [
      [0, o(0, 'translateY(6px)')],
      [start, o(0, 'translateY(6px)')],
      [start + 200, o(1, 'translateY(0)')],
      [3700, o(1, 'translateY(0)')],
      [3900, o(0.55, 'translateY(0)')],
      [4460, o(0, 'translateY(0)')],
    ])
  })
  tl.track(kbd, [
    [0, o(0, 'translateX(14px) scale(.6)')],
    [4600, o(0, 'translateX(14px) scale(.6)')],
    [4880, o(1, 'translateX(0) scale(1)'), SPRING],
    [5900, o(1, 'translateX(0) scale(1)')],
    [6150, o(0, 'translateX(14px) scale(.6)')],
  ])
  return { stage, tl, poster: 3300 }
}

/** Voice guide 2: the page changes, the answer is spotlit, the subscribe tap is left to you. */
SCENES.voiceGo = (ctx) => {
  const { stage, canvas } = frame(ctx, 'voiceGo')
  const tl = timeline(7200)
  const pageA = servicesBody(ctx, [ROW_A, ROW_B])
  const pageB = n('div', 'ts-body', at(0, 26, 400, 224))
  pageB.append(n('div', 'ts-h', at(ctx.mx(16, 300), 10, 300, 18), ctx.t('Internet bundles')))
  ;[0, 1, 2].forEach((i) => pageB.append(n('span', `ts-tab${i === 0 ? ' is-on' : ''}`, at(ctx.mx(16 + i * 62, 56), 34, 56, 14))))
  const cards = [0, 1, 2].map((i) => {
    const x = ctx.mx(16 + i * 126, 116)
    const button = n('span', 'ts-subscribe', at(10, 116, 96, 20), ctx.t('Subscribe'))
    pageB.append(skeletonCard(x, 58, 116, 146, button))
    return { x: x, y: 26 + 58, button }
  })
  const first = cards[0]
  const ring = n('div', 'ts-ring', at(first.x - 5, first.y - 5, 126, 156))
  const commit = n('div', 'ts-ring ts-ring--commit', at(first.x + 6, first.y + 112, 104, 28))
  const chip = n('div', 'ts-chip ts-chip--dark', at(first.x + 6, first.y + 146, 104, 18), ctx.t('You press it'))
  const bubble = speakingBubble(tl, first.x + 33, first.y - 30)
  const words = ctx.example.join(' ')
  const bar = n('div', 'ts-bar', at(122, 126, 264, 36), n('span', 'ts-bar__wave', null, ...[0, 1, 2, 3, 4].map(() => n('i'))), n('span', 'ts-bar__words', null, n('span', 'ts-word', null, words)))
  bar.querySelector('.ts-bar__words').dir = ctx.rtl ? 'rtl' : 'ltr'
  canvas.append(n('div', 'ts-page', at(0, 0, 400, 250)), pageA, pageB, miniHeader(ctx), ring, commit, chip, bubble, a11yButton(361, 214), micButton(358, 172), bar)

  tl.track(bar, [
    [0, o(1, 'translateY(0) scaleY(1)')],
    [700, o(1, 'translateY(0) scaleY(1)')],
    [980, o(0, 'translateY(8px) scaleY(.6)')],
    [6800, o(0, 'translateY(8px) scaleY(.6)')],
    [7150, o(1, 'translateY(0) scaleY(1)')],
  ])
  tl.track(pageA, [
    [0, o(1, 'translateY(0)')],
    [1000, o(1, 'translateY(0)')],
    [1700, o(1, 'translateY(-232px)'), EASE_IN_OUT],
    [6500, o(0, 'translateY(-232px)')],
    [6560, o(0, 'translateY(0)')],
    [7100, o(1, 'translateY(0)')],
  ])
  tl.track(pageB, [
    [0, o(1, 'translateY(232px)')],
    [1000, o(1, 'translateY(232px)')],
    [1700, o(1, 'translateY(0)'), EASE_IN_OUT],
    [6400, o(1, 'translateY(0)')],
    [6800, o(0, 'translateY(0)')],
    [6860, o(0, 'translateY(232px)')],
  ])
  tl.track(ring, [
    [0, o(0, 'scale(1.18)')],
    [2000, o(0, 'scale(1.18)')],
    [2420, o(1, 'scale(1)')],
    [4300, o(1, 'scale(1)')],
    [4600, o(0, 'scale(1)')],
  ])
  tl.track(bubble, [
    [0, o(0, 'translateY(4px)')],
    [2500, o(0, 'translateY(4px)')],
    [2700, o(1, 'translateY(0)')],
    [4200, o(1, 'translateY(0)')],
    [4400, o(0, 'translateY(0)')],
  ])
  tl.track(commit, [
    [0, o(0, 'scale(1.25)')],
    [4400, o(0, 'scale(1.25)')],
    [4800, o(1, 'scale(1)')],
    [5200, o(1, 'scale(1.06)'), EASE_IN_OUT],
    [5600, o(1, 'scale(1)'), EASE_IN_OUT],
    [6000, o(1, 'scale(1.06)'), EASE_IN_OUT],
    [6300, o(0, 'scale(1)')],
  ])
  tl.track(chip, [
    [0, o(0, 'translateY(-4px)')],
    [4900, o(0, 'translateY(-4px)')],
    [5150, o(1, 'translateY(0)')],
    [6250, o(1, 'translateY(0)')],
    [6450, o(0, 'translateY(0)')],
  ])
  return { stage, tl, poster: 3200 }
}

/** Pocket 1: "Pocket it", the sticker peels off and flies into the corner; "Put back". */
SCENES.pocketPeel = (ctx) => {
  const { stage, canvas } = frame(ctx, 'pocketPeel')
  const tl = timeline(7000)
  const section = ctx.section('stay-in-control')
  const body = n('div', 'ts-body', at(0, 26, 400, 224), n('div', 'ts-h', at(ctx.mx(16, 300), 10, 300, 18), section?.title ?? ''))
  const ax = ctx.mx(22, 172)
  const bx = ctx.mx(206, 172)
  const ay = 62
  const [w, h] = [172, 132]
  const cardA = miniCard(ctx.item('balance-transfer'), ax, ay, w, h, { titleH: 30, className: 'ts-card--sticker' })
  const cardB = miniCard(ctx.item('end-of-call-notifications'), bx, ay, w, h, { titleH: 30 })
  const chip = (x) => n('span', 'ts-pocket-chip', at(x + w - 70, ay + 8, 62, 18), icon('pocket'), ctx.t('Pocket it'))
  const chipA = chip(ax)
  const fold = n('span', 'ts-fold', at(w - 30, 0, 30, 30))
  cardA.append(fold)
  const liner = n('div', 'ts-liner', at(ax, ay, w, h), n('span', 'ts-putback', null, icon('back'), ctx.t('Put back')))
  // The corner: the page lifts and the pocket shows under it.
  const corner = n(
    'div',
    'ts-corner',
    at(330, 180, 70, 70),
    n('span', 'ts-corner__under'),
    n('span', 'ts-corner__flap'),
    n('span', 'ts-corner__button', null, icon('pocket')),
  )
  const count = n('span', 'ts-count', at(380, 206, 13, 13), '1')
  const tap = tapDot()
  body.append(liner, cardB, chip(bx), cardA, chipA)
  canvas.append(n('div', 'ts-page', at(0, 0, 400, 250)), body, miniHeader(ctx), corner, count, tap)
  cardA.style.transformOrigin = '0% 100%'

  // translate(x, y) rotateX rotateY rotate scale, kept in the same order so they interpolate.
  const pose = (x, y, rx, ry, rz, s) => `translate(${x}px, ${y}px) rotateX(${rx}deg) rotateY(${ry}deg) rotate(${rz}deg) scale(${s})`
  const flyX = 372 - 10 - ax
  const flyY = 228 + 8 - (26 + ay + h)
  const rest = pose(0, 0, 0, 0, 0, 1)
  const lift = pose(0, -5, 10, -14, 0, 1)
  const peeled = pose(0, -20, 26, -34, -4, 0.96)
  const pocketed = pose(flyX, flyY, 8, 0, 28, 0.12)
  tl.track(cardA, [
    [0, o(1, rest)],
    [1000, o(1, rest)],
    [1350, o(1, lift)],
    [1820, o(1, peeled), EASE_IN_OUT],
    [2560, o(1, pocketed), 'cubic-bezier(.5,0,.3,1)'],
    [2640, o(0, pocketed)],
    [4720, o(0, pocketed)],
    [4780, o(1, pocketed)],
    [5420, o(1, peeled), 'cubic-bezier(.5,0,.3,1)'],
    [5760, o(1, lift)],
    [6040, o(1, rest), EASE],
  ])
  fold.style.transformOrigin = '100% 0%'
  tl.track(fold, [
    [0, { transform: 'scale(0)' }],
    [1000, { transform: 'scale(0)' }],
    [1320, { transform: 'scale(1)' }],
    [1820, { transform: 'scale(1.35)' }],
    [5420, { transform: 'scale(1.35)' }],
    [5760, { transform: 'scale(1)' }],
    [6040, { transform: 'scale(0)' }],
  ])
  tl.track(chipA, [
    [0, o(1)],
    [1250, o(1)],
    [1380, o(0)],
    [6000, o(0)],
    [6200, o(1)],
  ])
  tl.track(liner, [
    [0, o(0)],
    [1500, o(0)],
    [1900, o(1)],
    [5500, o(1)],
    [5800, o(0)],
  ])
  corner.style.transformOrigin = '100% 100%'
  tl.track(corner, [
    [0, o(1, 'scale(0)')],
    [2320, o(1, 'scale(0)')],
    [2760, o(1, 'scale(1)'), SPRING],
    [5500, o(1, 'scale(1)')],
    [5900, o(1, 'scale(0)')],
  ])
  tl.track(count, [
    [0, o(0, 'scale(0)')],
    [2600, o(0, 'scale(0)')],
    [2760, o(1, 'scale(1.35)')],
    [2920, o(1, 'scale(1)')],
    [5450, o(1, 'scale(1)')],
    [5620, o(0, 'scale(0)')],
  ])
  const chipX = ax + w - 39
  const chipY = 26 + ay + 17
  const backX = ax + w / 2
  const backY = 26 + ay + h / 2
  tl.track(tap, tapFrames([...press(820, chipX, chipY, [chipX - 40, 262]), ...press(4560, backX, backY, [backX + 30, 262])]))
  return { stage, tl, poster: 3300 }
}

/** The pocket album under the page: title, "Back to Services", the stickers. */
const album = (ctx, ids) => {
  const root = n('div', 'ts-album', at(0, 26, 400, 224))
  const back = n('span', 'ts-back', at(ctx.mx(14, 118), 8, 118, 20), icon('back'), ctx.t('Back to Services'))
  root.append(
    back,
    n('span', 'ts-album__mark', at(ctx.mx(16, 24), 38, 24, 24), icon('pocket')),
    n('div', 'ts-h', at(ctx.mx(46, 220), 40, 220, 20), ctx.t('Your pocket')),
  )
  const stickers = ids.map((id, i) => {
    const sticker = miniCard(ctx.item(id), ctx.mx(16 + i * 128, 112), 82, 112, 96, { titleH: 24, className: 'ts-card--sticker' })
    sticker.style.rotate = `${[-3, 2, -1.5][i] * (ctx.rtl ? -1 : 1)}deg`
    root.append(sticker)
    return sticker
  })
  return { root, back, stickers }
}

/** Pocket 2: press the pocket, the page turns, the album and the drone's heart. */
SCENES.pocketOpen = (ctx) => {
  const { stage, canvas } = frame(ctx, 'pocketOpen')
  const tl = timeline(7600)
  const pocket = album(ctx, ['calls-services', 'roaming', 'play-and-win'])
  // The drone draws a dashed heart once per opening (src/pocket/pocket-actors.js).
  const heartD = 'M40 54C12 36 4 18 20 10C30 5 38 12 40 19C42 12 50 5 60 10C76 18 68 36 40 54Z'
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('class', 'ts-heart')
  svg.setAttribute('viewBox', '0 0 80 60')
  const hx = ctx.mx(300, 80)
  place(svg, hx, 30, 80, 60)
  const mask = document.createElementNS(SVG_NS, 'mask')
  mask.setAttribute('id', `ts-heart-mask-${ctx.uid}`)
  const reveal = document.createElementNS(SVG_NS, 'path')
  reveal.setAttribute('d', heartD)
  reveal.setAttribute('pathLength', '100')
  reveal.setAttribute('class', 'ts-heart__reveal')
  mask.append(reveal)
  const dashed = document.createElementNS(SVG_NS, 'path')
  dashed.setAttribute('d', heartD)
  dashed.setAttribute('class', 'ts-heart__line')
  dashed.setAttribute('mask', `url(#ts-heart-mask-${ctx.uid})`)
  svg.append(mask, dashed)
  const droneTrack = n('div', 'ts-drone-track', at(hx, 30, 80, 60))
  const drone = n('span', 'ts-drone', null, n('i'), n('i'), n('b'))
  drone.style.offsetPath = `path('${heartD}')`
  droneTrack.append(drone)

  const page = n('div', 'ts-turn', at(0, 26, 400, 224))
  page.append(servicesBody(ctx, [ROW_A, ROW_B]))
  page.firstChild.style.top = '0px'
  const shade = n('div', 'ts-turn__shade', at(0, 0, 400, 224))
  page.append(shade, n('span', 'ts-corner ts-corner--static', at(330, 154, 70, 70), n('span', 'ts-corner__under'), n('span', 'ts-corner__flap'), n('span', 'ts-corner__button', null, icon('pocket'))), n('span', 'ts-count', at(380, 180, 13, 13), '3'))
  page.style.transformOrigin = ctx.rtl ? '100% 50%' : '0% 50%'
  const tap = tapDot()
  canvas.append(n('div', 'ts-page ts-page--album', at(0, 0, 400, 250)), pocket.root, svg, droneTrack, page, miniHeader(ctx), tap)

  const turned = `perspective(900px) rotateY(${ctx.rtl ? 104 : -104}deg)`
  const flat = 'perspective(900px) rotateY(0deg)'
  tl.track(page, [
    [0, o(1, flat)],
    [980, o(1, flat)],
    [1820, o(1, turned), 'cubic-bezier(.45,.05,.4,1)'],
    [1880, o(0, turned)],
    [5380, o(0, turned)],
    [5420, o(1, turned)],
    [6260, o(1, flat), 'cubic-bezier(.45,.05,.4,1)'],
  ])
  tl.track(shade, [
    [0, o(0)],
    [980, o(0)],
    [1820, o(0.55)],
    [5420, o(0.55)],
    [6260, o(0)],
  ])
  pocket.stickers.forEach((sticker, i) => {
    const start = 1350 + i * 150
    tl.track(sticker, [
      [0, o(0, 'translateY(10px) scale(.86)')],
      [start, o(0, 'translateY(10px) scale(.86)')],
      [start + 320, o(1, 'translateY(0) scale(1)'), SPRING],
      [6600, o(1, 'translateY(0) scale(1)')],
      [6900, o(0, 'translateY(0) scale(1)')],
    ])
  })
  tl.track(reveal, [
    [0, { strokeDashoffset: 100 }],
    [2200, { strokeDashoffset: 100 }],
    [3700, { strokeDashoffset: 0 }, 'linear'],
  ])
  tl.track(svg, [
    [0, o(1)],
    [4600, o(1)],
    [5000, o(0)],
  ])
  tl.track(drone, [
    [0, { offsetDistance: '0%', opacity: 0 }],
    [2100, { offsetDistance: '0%', opacity: 1 }],
    [3700, { offsetDistance: '100%', opacity: 1 }, 'linear'],
    [4100, { offsetDistance: '100%', opacity: 0 }],
  ])
  tl.loop(drone, [{ translate: '0 0' }, { translate: '0 -1.5px' }, { translate: '0 0' }], 700)
  const backX = ctx.mx(14, 118) + 59
  tl.track(tap, tapFrames([...press(840, 380, 206, [330, 262]), ...press(5200, backX, 26 + 18, [backX + 40, 120])]))
  tl.track(pocket.back, [
    [0, { transform: 'scale(1)' }],
    [5200, { transform: 'scale(1)' }],
    [5260, { transform: 'scale(.94)' }],
    [5420, { transform: 'scale(1)' }],
  ])
  return { stage, tl, poster: 3900 }
}

/** Card positions for the reimagined layouts: { x, y, ry, r, s, z } per card. */
const layouts = (ctx, count, w, h) => {
  const mirror = (p) => (ctx.rtl ? { ...p, x: 400 - p.x - w, ry: -p.ry, r: -p.r } : p)
  return {
    grid: (cols, top, gapX = 10, gapY = 12) =>
      Array.from({ length: count }, (_, i) => {
        const row = Math.floor(i / cols)
        const inRow = Math.min(cols, count - row * cols)
        const left = (400 - inRow * w - (inRow - 1) * gapX) / 2
        return mirror({ x: left + (i % cols) * (w + gapX), y: top + row * (h + gapY), ry: 0, r: 0, s: 1, z: 1 })
      }),
    coverflow: (center, top) =>
      Array.from({ length: count }, (_, i) => {
        const d = i - center
        return mirror({ x: 200 - w / 2 + d * 62 + Math.sign(d) * 24, y: top, ry: d === 0 ? 0 : d < 0 ? 52 : -52, r: 0, s: d === 0 ? 1.18 : 0.9, z: 10 - Math.abs(d) })
      }),
    fan: (top) => Array.from({ length: count }, (_, i) => mirror({ x: 42 + i * 56, y: top + i * 14, ry: 0, r: (i - 2) * 8, s: 0.9, z: i + 1 })),
    spotlight: (top) =>
      Array.from({ length: count }, (_, i) =>
        i === 0 ? mirror({ x: 22, y: top, ry: 0, r: 0, s: 1.66, z: 10 }) : mirror({ x: 222 + (i - 1) * 24, y: top + 46 + (i - 1) * 8, ry: 0, r: 0, s: 0.7, z: 10 - i }),
      ),
  }
}
const placeCard = (p) => ({ transform: `translate(${p.x}px, ${p.y}px) rotateY(${p.ry}deg) rotate(${p.r}deg) scale(${p.s})`, zIndex: String(p.z) })

/** Reimagine 1: the launcher, a ready-made view, the page turns into a cover flow. */
SCENES.reimaginePick = (ctx) => {
  const { stage, canvas } = frame(ctx, 'reimaginePick')
  const tl = timeline(7800)
  const ids = ['vodafone-cash', 'roaming', 'play-and-win', 'calls-services', 'vf-play', 'mini-call']
  const [w, h] = [114, 76]
  const L = layouts(ctx, ids.length, w, h)
  const grid = L.grid(3, 64)
  const flowA = L.coverflow(2, 90)
  const flowB = L.coverflow(3, 90)
  const deck = n('div', 'ts-deck', at(0, 0, 400, 250))
  const cards = ids.map((id) => {
    const card = miniCard(ctx.item(id), 0, 0, w, h, { titleH: 18 })
    card.style.transformOrigin = '50% 50%'
    deck.append(card)
    return card
  })
  const launcherX = ctx.mx(258, 128)
  const launcher = n('div', 'ts-launcher', at(launcherX, 34, 128, 22), icon('sparkle'), n('span', null, ctx.t('Reimagine this page')))
  const panelX = ctx.mx(196, 192)
  const pick = ['coverflow', 'flipbook', 'cube', 'fan', 'spotlight', 'tunnel']
  const tiles = pick.map((id) => {
    const template = ctx.template(id)
    return n('span', 'ts-tile', null, pathIcon(template?.icon ?? ''), n('span', null, ctx.t(template?.name ?? '')))
  })
  const panel = n(
    'div',
    'ts-panel',
    at(panelX, 62, 192, 150),
    n('b', 'ts-panel__title', null, ctx.t('Reimagine this page')),
    n('span', 'ts-panel__hint', null, ctx.t('Ready-made experiences')),
    n('span', 'ts-panel__tiles', null, ...tiles),
  )
  const thumb = n('span', 'ts-seg__thumb')
  const viewbar = n(
    'div',
    'ts-viewbar',
    at(0, 26, 400, 26),
    n('span', 'ts-seg', at(ctx.mx(12, 120), 5, 120, 16), thumb, n('span', null, ctx.t('Original')), n('span', null, ctx.t('Reimagined'))),
    n('span', 'ts-viewbar__label', at(ctx.mx(142, 246), 5, 246, 16), ctx.t('Ready-made template, no AI call')),
  )
  const tap = tapDot()
  canvas.append(n('div', 'ts-page', at(0, 0, 400, 250)), deck, miniHeader(ctx), viewbar, launcher, panel, tap)

  cards.forEach((card, i) =>
    tl.track(card, [
      [0, placeCard(grid[i])],
      [2400, placeCard(grid[i])],
      [3300, placeCard(flowA[i]), EASE_IN_OUT],
      [3800, placeCard(flowA[i])],
      [4400, placeCard(flowB[i]), EASE_IN_OUT],
      [6100, placeCard(flowB[i])],
      [6900, placeCard(grid[i]), EASE_IN_OUT],
    ]),
  )
  tl.track(launcher, [
    [0, o(1, 'scale(1)')],
    [840, o(1, 'scale(1)')],
    [900, o(1, 'scale(.93)')],
    [1060, o(1, 'scale(1)')],
    [2300, o(1, 'scale(1)')],
    [2500, o(0, 'scale(1)')],
    [7300, o(0, 'scale(1)')],
    [7700, o(1, 'scale(1)')],
  ])
  panel.style.transformOrigin = ctx.rtl ? '0% 0%' : '100% 0%'
  tl.track(panel, [
    [0, o(0, 'translateY(-6px) scale(.96)')],
    [920, o(0, 'translateY(-6px) scale(.96)')],
    [1260, o(1, 'translateY(0) scale(1)')],
    [2120, o(1, 'translateY(0) scale(1)')],
    [2360, o(0, 'translateY(-6px) scale(.96)')],
  ])
  tl.track(tiles[0], [
    [0, { backgroundColor: '#ffffff', borderColor: '#ebebeb' }],
    [1980, { backgroundColor: '#ffffff', borderColor: '#ebebeb' }],
    [2040, { backgroundColor: '#fde5e5', borderColor: '#e60000' }],
    [2360, { backgroundColor: '#fde5e5', borderColor: '#e60000' }],
    [2400, { backgroundColor: '#ffffff', borderColor: '#ebebeb' }],
  ])
  tl.track(viewbar, [
    [0, o(0, 'translateY(-8px)')],
    [2600, o(0, 'translateY(-8px)')],
    [2900, o(1, 'translateY(0)')],
    [7100, o(1, 'translateY(0)')],
    [7450, o(0, 'translateY(-8px)')],
  ])
  const half = ctx.rtl ? -58 : 58
  tl.track(thumb, [
    [0, { transform: `translateX(${half}px)` }],
    [6040, { transform: `translateX(${half}px)` }],
    [6280, { transform: 'translateX(0px)' }],
    [7450, { transform: 'translateX(0px)' }],
    [7500, { transform: `translateX(${half}px)` }],
  ])
  const launcherC = [launcherX + 64, 45]
  const tileC = [ctx.rtl ? panelX + 192 - 52 : panelX + 52, 62 + 55]
  const originalC = [ctx.mx(12, 120) + (ctx.rtl ? 90 : 30), 26 + 13]
  tl.track(tap, tapFrames([...press(840, ...launcherC, [launcherC[0] - 40, 150]), ...press(1980, ...tileC, [tileC[0] - 30, 230]), ...press(6040, ...originalC, [originalC[0] + 30, 140])]))
  return { stage, tl, poster: 3600 }
}

/** Reimagine 2: the same five services move through four views and back; nothing comes or goes. */
SCENES.reimagineSame = (ctx) => {
  const { stage, canvas } = frame(ctx, 'reimagineSame')
  const tl = timeline(9000)
  const ids = ['vodafone-cash', 'roaming', 'play-and-win', 'calls-services', 'mini-call']
  const [w, h] = [104, 78]
  const L = layouts(ctx, ids.length, w, h)
  const grid = L.grid(3, 56, 14, 10)
  const fan = L.fan(62)
  const flow = L.coverflow(2, 84)
  const spot = L.spotlight(58)
  const deck = n('div', 'ts-deck', at(0, 0, 400, 250))
  const cards = ids.map((id) => {
    const card = miniCard(ctx.item(id), 0, 0, w, h, { titleH: 18 })
    deck.append(card)
    return card
  })
  cards[0].style.transformOrigin = ctx.rtl ? '100% 0' : '0 0'
  const names = ['Card fan', 'Cover flow', 'Spotlight cards', 'Original'].map((name) => n('span', 'ts-label', at(100, 32, 200, 20), ctx.t(name)))
  const badge = n('div', 'ts-chip ts-chip--ok', at(110, 226, 180, 18), icon('check'), ctx.t('Every service, every link'))
  canvas.append(n('div', 'ts-page', at(0, 0, 400, 250)), deck, miniHeader(ctx), ...names, badge)
  const stages = [
    [1000, 1700, fan],
    [2700, 3400, flow],
    [4300, 5000, spot],
    [6000, 6800, grid],
  ]
  cards.forEach((card, i) => {
    const frames = [[0, placeCard(grid[i])]]
    for (const [from, to, layout] of stages) {
      frames.push([from, frames[frames.length - 1][1]], [to, placeCard(layout[i]), EASE_IN_OUT])
    }
    tl.track(card, frames)
  })
  names.forEach((name, i) => {
    const from = stages[i][0]
    const until = i < 3 ? stages[i + 1][0] : 8200
    tl.track(name, [
      [0, o(0, 'translateY(5px)')],
      [from + 100, o(0, 'translateY(5px)')],
      [from + 380, o(1, 'translateY(0)')],
      [until - 80, o(1, 'translateY(0)')],
      [until + 120, o(0, 'translateY(-5px)')],
    ])
  })
  const pulses = [[0, { transform: 'scale(1)' }]]
  for (const [, to] of stages) pulses.push([to - 1, { transform: 'scale(1)' }], [to + 160, { transform: 'scale(1.07)' }], [to + 360, { transform: 'scale(1)' }])
  tl.track(badge, pulses)
  return { stage, tl, poster: 2200 }
}

/** The trail's consent card and pill (the guide's own words, voice-guide trail/i18n.ts). */
SCENES.journeyRemember = (ctx) => {
  const { stage, canvas } = frame(ctx, 'journeyRemember')
  const tl = timeline(8000)
  const cardX = ctx.mx(176, 212)
  const allow = n('span', 'ts-btn ts-btn--primary', null, ctx.t('Remember my journey'))
  const card = n(
    'div',
    'ts-consent',
    at(cardX, 34, 212, 116),
    n('span', 'ts-consent__lock', null, icon('lock')),
    n('b', null, ctx.t('Remember my journey on this device')),
    n('span', 'ts-consent__line', null, ctx.t('It stays in this browser and deletes itself after {hours} hours.', { hours: 24 })),
    n('span', 'ts-consent__row', null, allow, n('span', 'ts-btn', null, ctx.t('Not now'))),
  )
  card.style.transformOrigin = ctx.rtl ? '0% 0%' : '100% 0%'
  const pillX = ctx.mx(270, 118)
  const dot = n('span', 'ts-pill__dot')
  const labelOn = n('span', 'ts-pill__label', null, ctx.t('Your journey'))
  const labelPaused = n('span', 'ts-pill__label ts-pill__label--alt', null, ctx.t('Paused'))
  const pill = n('div', 'ts-pill', at(pillX, 32, 118, 22), icon('journey'), n('span', 'ts-pill__labels', null, labelOn, labelPaused), dot)
  const pause = n('span', 'ts-strip__btn', null, icon('pause'), ctx.t('Pause'))
  const strip = n('div', 'ts-strip', at(ctx.mx(214, 174), 60, 174, 24), pause, n('span', 'ts-strip__btn', null, ctx.t('Clear journey')))
  const band = n('div', 'ts-band', at(0, 128, 400, 122))
  const thread = n('div', 'ts-thread', at(48, 226, 304, 3))
  thread.style.transformOrigin = ctx.rtl ? '100% 50%' : '0% 50%'
  const pages = ['Home', 'Internet bundles', 'Services'].map((name, i) => {
    const x = ctx.mx(30 + i * 124, 92)
    const thumb = n(
      'div',
      'ts-step',
      at(x, 160, 92, 72),
      n('span', 'ts-step__page', null, n('i'), n('i'), n('i')),
      n('span', 'ts-step__name', null, ctx.t(name)),
      n('span', 'ts-step__dot'),
    )
    return thumb
  })
  const lock = n('div', 'ts-chip ts-chip--dark', at(ctx.mx(16, 150), 136, 150, 18), icon('lock'), ctx.t('Only in this browser'))
  const tap = tapDot()
  canvas.append(n('div', 'ts-page', at(0, 0, 400, 250)), servicesBody(ctx, [ROW_A, ROW_B]), n('div', 'ts-veil ts-veil--soft', at(0, 26, 400, 224)), miniHeader(ctx), band, thread, ...pages, lock, pill, strip, card, tap)

  const towardPill = `translate(${ctx.rtl ? -40 : 40}px, -10px) scale(.35)`
  tl.track(card, [
    [0, o(0, 'translateY(-8px) scale(1)')],
    [300, o(0, 'translateY(-8px) scale(1)')],
    [720, o(1, 'translateY(0) scale(1)')],
    [1700, o(1, 'translateY(0) scale(1)')],
    [2150, o(0, towardPill), EASE_IN_OUT],
  ])
  tl.track(pill, [
    [0, o(0, 'scale(.8)')],
    [1900, o(0, 'scale(.8)')],
    [2200, o(1, 'scale(1)'), SPRING],
    [7600, o(1, 'scale(1)')],
    [7900, o(0, 'scale(.8)')],
  ])
  tl.track(dot, [
    [0, { backgroundColor: '#bebebe', transform: 'scale(1)' }],
    [2300, { backgroundColor: '#bebebe', transform: 'scale(1)' }],
    [2420, { backgroundColor: '#e60000', transform: 'scale(1.3)' }],
    [2700, { backgroundColor: '#e60000', transform: 'scale(1)' }],
    [3500, { backgroundColor: '#e60000', transform: 'scale(1.25)' }, EASE_IN_OUT],
    [4300, { backgroundColor: '#e60000', transform: 'scale(1)' }, EASE_IN_OUT],
    [5100, { backgroundColor: '#e60000', transform: 'scale(1.25)' }, EASE_IN_OUT],
    [6060, { backgroundColor: '#e60000', transform: 'scale(1)' }],
    [6120, { backgroundColor: '#bebebe', transform: 'scale(1)' }],
  ])
  tl.track(labelOn, [
    [0, o(1)],
    [6080, o(1)],
    [6200, o(0)],
  ])
  tl.track(labelPaused, [
    [0, o(0)],
    [6080, o(0)],
    [6200, o(1)],
  ])
  tl.track(band, [
    [0, o(1, 'translateY(124px)')],
    [2300, o(1, 'translateY(124px)')],
    [2620, o(1, 'translateY(0)'), 'cubic-bezier(.32,.72,0,1)'],
    [7500, o(1, 'translateY(0)')],
    [7900, o(1, 'translateY(124px)')],
  ])
  tl.track(thread, [
    [0, o(1, 'scaleX(0)')],
    [2500, o(1, 'scaleX(0)')],
    [3900, o(1, 'scaleX(1)'), 'linear'],
    [7600, o(1, 'scaleX(1)')],
    [7900, o(0, 'scaleX(1)')],
  ])
  pages.forEach((thumb, i) => {
    const start = 2560 + i * 600
    tl.track(thumb, [
      [0, o(0, 'translateY(8px) scale(.8)')],
      [start, o(0, 'translateY(8px) scale(.8)')],
      [start + 280, o(1, 'translateY(0) scale(1.05)'), SPRING],
      [start + 420, o(1, 'translateY(0) scale(1)')],
      [7600, o(1, 'translateY(0) scale(1)')],
      [7900, o(0, 'translateY(0) scale(1)')],
    ])
  })
  tl.track(lock, [
    [0, o(0, 'translateY(6px)')],
    [4200, o(0, 'translateY(6px)')],
    [4500, o(1, 'translateY(0)')],
    [7600, o(1, 'translateY(0)')],
    [7900, o(0, 'translateY(0)')],
  ])
  tl.track(strip, [
    [0, o(0, 'translateY(-6px)')],
    [5000, o(0, 'translateY(-6px)')],
    [5280, o(1, 'translateY(0)')],
    [6900, o(1, 'translateY(0)')],
    [7200, o(0, 'translateY(-6px)')],
  ])
  const allowC = [cardX + (ctx.rtl ? 212 - 58 : 58), 34 + 98]
  const pauseC = [ctx.mx(214, 174) + (ctx.rtl ? 174 - 38 : 38), 72]
  tl.track(tap, tapFrames([...press(1600, ...allowC, [allowC[0] - 20, 230]), ...press(6020, ...pauseC, [pauseC[0] - 30, 150])]))
  return { stage, tl, poster: 4700 }
}

/** The journey in the Pocket: what you explored, the questions; one is asked and answered. */
SCENES.journeyAsk = (ctx) => {
  const { stage, canvas } = frame(ctx, 'journeyAsk')
  const tl = timeline(8600)
  const pocket = album(ctx, ['calls-services', 'roaming', 'play-and-win'])
  const frost = n('div', 'ts-frost', at(0, 26, 400, 224))
  const memory = n('div', 'ts-memory', at(ctx.mx(14, 168), 40, 168, 112))
  const memoryPage = n('div', 'ts-memory__page')
  ;['vodafone-cash', 'roaming', 'calls-services', 'play-and-win'].forEach((id, i) => memoryPage.append(miniCard(ctx.item(id), 6 + (i % 2) * 78, 22 + Math.floor(i / 2) * 44, 72, 40, { titleH: 0 })))
  memory.append(n('span', 'ts-memory__bar'), memoryPage, n('span', 'ts-memory__badge', null, icon('lock')))
  const listX = ctx.mx(196, 192)
  const heading = n('b', 'ts-explored__h', at(listX, 40, 192, 14), ctx.t('You explored'))
  const explored = ['cash', 'call-and-connect-abroad', 'shokran-services'].map((id, i) => {
    const section = ctx.section(id)
    const first = section?.items?.[0]
    const row = n('div', 'ts-explored', at(listX, 58 + i * 22, 192, 18))
    const thumb = n('span', 'ts-explored__thumb')
    if (first?.image?.src) {
      const img = n('img')
      img.alt = ''
      img.src = first.image.src
      thumb.append(img)
    }
    row.append(thumb, n('span', null, section?.title ?? ''))
    return row
  })
  const chips = ctx.questions.map((text, i) => n('div', 'ts-question', at(ctx.mx(14, 372), 160 + i * 26, 372, 20), icon('arrow'), n('span', null, text)))
  // The page turns back to Services, the section the question was about, and the guide answers.
  const page = n('div', 'ts-turn', at(0, 26, 400, 224))
  const section = ctx.section('call-and-connect-abroad')
  page.append(n('div', 'ts-h', at(ctx.mx(16, 300), 10, 300, 18), section?.title ?? ''))
  ROW_B.forEach((id, i) => page.append(miniCard(ctx.item(id), ctx.mx(16 + i * 126, 116), 36, 116, 86, { titleH: 23 })))
  ROW_A.forEach((id, i) => page.append(miniCard(ctx.item(id), ctx.mx(16 + i * 126, 116), 140, 116, 86, { titleH: 23 })))
  page.style.transformOrigin = ctx.rtl ? '100% 50%' : '0% 50%'
  const ring = n('div', 'ts-ring', at(8, 26 + 4, 384, 126))
  const bubble = speakingBubble(tl, ctx.mx(300, 50), 26 + 12)
  const tap = tapDot()
  canvas.append(n('div', 'ts-page ts-page--album', at(0, 0, 400, 250)), pocket.root, frost, memory, heading, ...explored, ...chips, page, ring, bubble, miniHeader(ctx), tap)

  tl.track(frost, [
    [0, o(0)],
    [350, o(0)],
    [800, o(1)],
  ])
  tl.track(memory, [
    [0, o(0, 'scale(.92)')],
    [700, o(0, 'scale(.92)')],
    [1080, o(1, 'scale(1)'), SPRING],
  ])
  tl.track(heading, [
    [0, o(0)],
    [950, o(0)],
    [1200, o(1)],
  ])
  explored.forEach((row, i) =>
    tl.track(row, [
      [0, o(0, `translateX(${ctx.rtl ? -8 : 8}px)`)],
      [1100 + i * 150, o(0, `translateX(${ctx.rtl ? -8 : 8}px)`)],
      [1350 + i * 150, o(1, 'translateX(0)')],
    ]),
  )
  chips.forEach((chip, i) =>
    tl.track(chip, [
      [0, o(0, 'translateY(8px) scale(1)')],
      [1800 + i * 250, o(0, 'translateY(8px) scale(1)')],
      [2100 + i * 250, o(1, 'translateY(0) scale(1)'), SPRING],
      ...(i === 1
        ? [
            [3000, o(1, 'translateY(0) scale(1)')],
            [3060, o(1, 'translateY(0) scale(.96)')],
            [3220, o(1, 'translateY(0) scale(1)')],
          ]
        : []),
    ]),
  )
  if (chips[1]) {
    tl.track(chips[1], [
      [0, { backgroundColor: '#ffffff' }],
      [3000, { backgroundColor: '#ffffff' }],
      [3060, { backgroundColor: '#fde5e5' }],
    ])
  }
  const turned = `perspective(900px) rotateY(${ctx.rtl ? 104 : -104}deg)`
  const flat = 'perspective(900px) rotateY(0deg)'
  tl.track(page, [
    [0, o(0, turned)],
    [3340, o(0, turned)],
    [3380, o(1, turned)],
    [4220, o(1, flat), 'cubic-bezier(.45,.05,.4,1)'],
    [7700, o(1, flat)],
    [8100, o(0, flat)],
  ])
  tl.track(ring, [
    [0, o(0, 'scale(1.06)')],
    [4500, o(0, 'scale(1.06)')],
    [4900, o(1, 'scale(1)')],
    [6700, o(1, 'scale(1)')],
    [7000, o(0, 'scale(1)')],
  ])
  tl.track(bubble, [
    [0, o(0, 'translateY(4px)')],
    [4900, o(0, 'translateY(4px)')],
    [5100, o(1, 'translateY(0)')],
    [6600, o(1, 'translateY(0)')],
    [6800, o(0, 'translateY(0)')],
  ])
  const chipC = [ctx.mx(14, 372) + (ctx.rtl ? 372 - 90 : 90), 160 + 26 + 10]
  tl.track(tap, tapFrames(press(3000, ...chipC, [chipC[0] + 20, 262])))
  return { stage, tl, poster: 2700 }
}

/**
 * Builds a scene. `ctx` carries the page's language and content (see tips.js). Returns the stage
 * element and controls; never throws: a scene that fails to build becomes an empty stage.
 */
export const createScene = (name, ctx) => {
  try {
    const build = SCENES[name]
    if (!build) return null
    const { stage, tl, poster } = build(ctx)
    const canvas = stage.firstChild
    const fit = () => {
      const width = stage.clientWidth
      if (width) canvas.style.setProperty('--k', String(width / CANVAS.width))
    }
    let observer = null
    if (typeof ResizeObserver === 'function') {
      observer = new ResizeObserver(fit)
      observer.observe(stage)
    }
    fit()
    tl.seek(ctx.reduced ? poster : 0)
    let playing = false
    return {
      stage,
      poster,
      length: tl.length,
      fit,
      play: () => {
        if (ctx.reduced) return tl.seek(poster)
        if (!playing) tl.play()
        playing = true
      },
      pause: () => {
        tl.pause()
        playing = false
      },
      restart: () => {
        tl.pause()
        tl.seek(ctx.reduced ? poster : 0)
        playing = false
      },
      seek: (time) => tl.seek(time),
      isPlaying: () => playing,
      destroy: () => {
        observer?.disconnect()
        tl.cancel()
      },
    }
  } catch (error) {
    console.warn('[tips] a scene could not be drawn:', name, error)
    const stage = document.createElement('div')
    stage.className = 'ts-stage ts-stage--empty'
    stage.setAttribute('aria-hidden', 'true')
    const noop = () => {}
    return { stage, poster: 0, length: 0, fit: noop, play: noop, pause: noop, restart: noop, seek: noop, isPlaying: () => false, destroy: noop }
  }
}

export const SCENE_NAMES = Object.keys(SCENES)
