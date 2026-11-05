/**
 * Pocket actors: a living Vodafone-red mascot that lives under the page curl, and a small
 * drone that draws a heart over the pocket album. Decoration only: neither ever delays
 * saving, opening or closing, blocks a control, takes focus, or makes a sound.
 *
 *   Services page   the mascot sits in the curl's `under` layer (what the page-tip curl
 *                   uncovers), so the lifted paper genuinely covers it. Pocketing an item
 *                   makes it peek out from under the curl, wave and duck back.
 *   Page turn       the same mascot moves into the album's floor (under the turning page),
 *                   gets caught at ~60% of the turn and sprints to the opposite corner.
 *   Album           it lives in that corner (eye on the pointer, glances, idle ladder,
 *                   jumps for cards); the drone draws one heart per opening, hovers home,
 *                   dodges the pointer and can be dragged (it always springs back).
 *
 * Both are 3D models drawn as SVG (./actors/space.js, *-model.js, renderer.js), so they turn,
 * lean, bank and twirl. pocket.js drives this through a handful of lifecycle calls
 * (itemPocketed, openRequested, openStart/Progress/Complete, closeStart/Complete, destroy).
 * State lives in two small state machines (./actors/*-brain.js); this file is the DOM side:
 * the animation loops, clips, layout and input.
 * QA hooks: data-mascot-state, data-drone-state, body[data-pocket-actor-ready].
 */

import { realClock, seededRandom, withTiming, pick } from './actors/timing.js'
import { createMascotBrain } from './actors/mascot-brain.js'
import { createDroneBrain } from './actors/drone-brain.js'
import { MASCOT_CLIPS, EXPRESSION_DEFAULTS, BLINK, createPoseAnimator } from './actors/clips.js'
import { createMascotView, createDroneView } from './actors/renderer.js'
import { restDronePose } from './actors/drone-model.js'
import { createScope } from './actors/scope.js'
import { t } from '../i18n.js'
import {
  clamp,
  lerp,
  gazeOffset,
  smoothToward,
  curlSide,
  samplePath,
  rect,
  chooseAnchor,
  planHeart,
  easeInOutSine,
  easeOutBack,
} from './actors/motion.js'

const ASSETS = {
  mascot: new URL('./actors/assets/mascot.svg', import.meta.url).href,
  drone: new URL('./actors/assets/drone.svg', import.meta.url).href,
}
const SVG_NS = 'http://www.w3.org/2000/svg'
const GAZE_TRAVEL = 7 // how far the pupil may move inside the socket, in rig units
const MASCOT_ASPECT = 120 / 150

// Album content the mascot must never cover from its corner.
const CONTENT = '.pocket-grid__item, .pocket-empty, .pocket-view__bar, .pocket-view__head'

const finePointer = () => window.matchMedia('(hover: hover) and (pointer: fine)').matches
const small = () => window.innerWidth < 640

const el = (tag, className, attributes = {}) => {
  const node = document.createElement(tag)
  if (className) node.className = className
  for (const [key, value] of Object.entries(attributes)) {
    if (value === true) node.setAttribute(key, '')
    else if (value !== false && value !== null && value !== undefined) node.setAttribute(key, String(value))
  }
  return node
}

/** Loads a local SVG rig and returns it as a live element (scripts and handlers stripped). */
const loadRig = async (url, signal) => {
  const response = await fetch(url, { signal })
  if (!response.ok) throw new Error(`Pocket actor asset ${response.status}`)
  const doc = new DOMParser().parseFromString(await response.text(), 'image/svg+xml')
  const svg = doc.documentElement
  if (svg.localName !== 'svg' || doc.querySelector('parsererror')) throw new Error('Pocket actor asset is not SVG')
  for (const node of svg.querySelectorAll('script, foreignObject')) node.remove()
  for (const node of [svg, ...svg.querySelectorAll('*')]) {
    for (const attribute of [...node.attributes]) if (/^on/i.test(attribute.name)) node.removeAttribute(attribute.name)
  }
  const live = document.importNode(svg, true)
  live.setAttribute('aria-hidden', 'true')
  live.setAttribute('focusable', 'false')
  return live
}

/** Test seam: a frozen config read once at start-up (seeded randomness, faster ladders). */
const testConfig = () => {
  const value = typeof window !== 'undefined' ? window.__POCKET_ACTORS_TEST__ : null
  return value && typeof value === 'object' ? value : {}
}

/**
 * @param {object} options
 * @param {HTMLElement} options.pocketRoot   #pocket-output (the album)
 * @param {HTMLElement} options.peekButton   the floating pocket button in the curl
 * @param {() => {top:number,width:number,height:number}} options.sheet  the turning sheet's box
 * @param {() => boolean} options.reducedMotion
 */
export const createPocketActors = ({ pocketRoot, peekButton, sheet, reducedMotion }) => {
  const config = testConfig()
  const timing = withTiming(config.timing)
  const random = seededRandom(Number.isFinite(config.seed) ? config.seed : (Date.now() ^ (Math.random() * 0x7fffffff)) >>> 0)
  const clock = realClock
  const life = createScope()
  let visit = null // one pocket visit: opened → closed
  let ready = false

  /* ------------------------------------------------------------ the DOM */
  const mascot = el('div', 'pocket-mascot', { 'aria-hidden': 'true', 'data-mascot-state': 'hidden' })
  const mover = el('div', 'pocket-mascot__mover')
  mascot.append(mover)

  // Inside the curl's `under` box (sheet coordinates): clipped by the paper, covered by the roll.
  const peekStage = el('div', 'pocket-actor-peek', { 'aria-hidden': 'true' })
  const peekClip = el('div', 'pocket-actor-peek__clip')
  peekStage.append(peekClip)
  peekClip.append(mascot)

  // In the album: the drone layer (after the content, so it is last in tab order) and the floor.
  const layer = el('div', 'pocket-actor-layer')
  const trail = document.createElementNS(SVG_NS, 'svg')
  trail.setAttribute('class', 'pocket-drone-trail')
  trail.setAttribute('aria-hidden', 'true')
  trail.setAttribute('focusable', 'false')
  trail.innerHTML =
    '<defs><mask id="pocket-drone-trail-mask" maskUnits="userSpaceOnUse"><path class="pocket-drone-trail__reveal" fill="none" stroke="#fff" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/></mask></defs>' +
    '<path class="pocket-drone-trail__line" fill="none" mask="url(#pocket-drone-trail-mask)"/>'
  const trailReveal = trail.querySelector('.pocket-drone-trail__reveal')
  const trailLine = trail.querySelector('.pocket-drone-trail__line')
  const trailMask = trail.querySelector('mask')
  const drone = el('button', 'pocket-drone', { type: 'button', 'aria-label': t('Play with the Pocket drone'), 'data-drone-state': 'hidden', hidden: true })
  const droneTilt = el('span', 'pocket-drone__tilt', { 'aria-hidden': 'true' })
  const droneBob = el('span', 'pocket-drone__bob')
  droneTilt.append(droneBob)
  drone.append(droneTilt)
  layer.append(trail, drone)

  const floor = el('div', 'pocket-actor-floor', { 'aria-hidden': 'true' })
  const stage = el('div', 'pocket-mascot-stage')
  floor.append(stage)
  pocketRoot.append(layer, floor)

  /* ----------------------------------------------------------- the rigs */
  let rig = null // the mascot: its 3D view plus the decal parts the eye loop and blinks drive
  let droneView = null

  const mountRigs = (mascotSvg, droneSvg) => {
    mover.append(mascotSvg)
    const part = (name) => mascotSvg.querySelector(`[data-part="${name}"]`)
    rig = { svg: mascotSvg, view: createMascotView(mascotSvg), eye: part('eye'), iris: part('iris'), lid: part('lid') }
    droneBob.append(droneSvg)
    droneView = createDroneView(droneSvg)
    applyExpression({})
    rig.view.draw(animator.pose)
    droneView.draw(attitude, 0)
  }

  /* ----------------------------------------------------- mascot: clips */
  const animator = createPoseAnimator()
  const running = new Set() // Web Animations of the current clip (travel, decal tracks)
  const beats = new Set()
  let expression = { ...EXPRESSION_DEFAULTS }

  const applyExpression = (patch, base = expression) => {
    expression = { ...base, ...patch }
    for (const [key, value] of Object.entries(expression)) {
      const name = `data-${key}`
      if (value === false) mascot.removeAttribute(name)
      else mascot.setAttribute(name, value === true ? '' : String(value))
    }
  }

  /** Stops the current clip's Web Animations, returning each animated node's pose at this instant. */
  const stopClip = () => {
    const poses = new Map()
    for (const animation of running) {
      const target = animation.effect?.target
      if (target && !poses.has(target)) {
        const style = getComputedStyle(target)
        poses.set(target, { transform: style.transform, opacity: style.opacity })
      }
    }
    for (const animation of running) animation.cancel()
    running.clear()
    for (const id of beats) life.clearTimeout(id)
    beats.clear()
    return poses
  }

  const animate = (node, keyframes, options) => {
    const animation = node.animate(keyframes, options)
    running.add(animation)
    life.animation(animation)
    return animation
  }

  const continuing = (keyframes) => (keyframes.length === 1 && keyframes[0].offset === undefined) || (keyframes[0].offset ?? 0) > 0

  /**
   * Plays a clip from ./actors/clips.js: the 3D pose tracks go to the pose animator (drawn by
   * the mascot loop), travel and decal tracks are Web Animations. Nothing jumps when one clip
   * interrupts another: pose tracks blend from where they were, travel continues from the
   * current position, and anything the new clip leaves alone eases back to rest.
   */
  const play = (name, params = {}) => {
    const poses = stopClip()
    if (!rig) return
    const clip = MASCOT_CLIPS[name](params)
    const duration = clip.duration ?? params.duration ?? 300
    applyExpression(clip.expression ?? {}, EXPRESSION_DEFAULTS)
    const touched = new Set()
    if (clip.mover) {
      touched.add(mover)
      const from = poses.get(mover)
      const keyframes = continuing(clip.mover) && from ? [{ transform: from.transform, offset: 0 }, ...clip.mover] : clip.mover
      animate(mover, keyframes, { duration: clip.moverDuration ?? duration, easing: clip.moverEase ?? 'ease-in-out', fill: 'forwards' })
    }
    for (const track of clip.decals ?? []) {
      for (const node of rig.svg.querySelectorAll(track.selector)) {
        touched.add(node)
        animate(node, track.keyframes, { duration: track.duration ?? duration, delay: track.delay ?? 0, easing: track.easing ?? 'ease-in-out', iterations: track.iterations ?? 1, fill: track.fill ?? 'forwards' })
      }
    }
    for (const [node, pose] of poses) {
      if (!touched.has(node)) animate(node, [{ transform: pose.transform, opacity: pose.opacity, offset: 0 }], { duration: 160, easing: 'ease-out' })
    }
    animator.play(clip, performance.now(), duration)
    for (const [at, patch] of clip.beats ?? []) beats.add(life.timeout(() => applyExpression(patch), at))
    for (const [at, mode] of clip.gaze ?? []) {
      if (at <= 0) setGaze(mode)
      else beats.add(life.timeout(() => setGaze(mode), at))
    }
    wakeMascot()
  }

  /** Static pose (reduced motion, suspended tab): drawn once, no motion at all. */
  const still = (patch = {}) => {
    stopClip()
    animator.hold()
    applyExpression(patch, EXPRESSION_DEFAULTS)
    setGaze('viewer')
  }

  /* --------------------------------------- mascot: one loop for pose, eye and drawing */
  const gaze = { mode: 'viewer', x: 0, y: 0, look: 0, center: null, pointer: null, dir: -1 }
  let mascotFrameId = null
  let mascotLast = 0
  let idleTick = 0

  const trackingAllowed = () => gaze.mode === 'pointer' && gaze.pointer && !document.hidden && !reducedMotion() && finePointer()

  const gazeTarget = () => {
    const far = GAZE_TRAVEL * 0.9
    switch (gaze.mode) {
      case 'left':
        return { x: -far, y: 0 }
      case 'right':
        return { x: far, y: 0 }
      case 'travel':
        return { x: far * gaze.dir, y: 0.5 }
      case 'down-right':
        return { x: far * 0.6, y: far * 0.6 }
      case 'pointer': {
        if (!trackingAllowed()) return { x: 0, y: 0 }
        if (!gaze.center && rig?.eye) {
          const box = rig.eye.getBoundingClientRect()
          if (box.width) gaze.center = { x: box.left + box.width / 2, y: box.top + box.height / 2 }
        }
        if (!gaze.center) return { x: 0, y: 0 }
        return gazeOffset(gaze.pointer.x - gaze.center.x, gaze.pointer.y - gaze.center.y, { max: GAZE_TRAVEL })
      }
      default:
        return { x: 0, y: 0 }
    }
  }

  const tickMascot = (now) => {
    mascotFrameId = null
    if (!rig) return
    const dt = mascotLast ? Math.min(64, now - mascotLast) : 16
    mascotLast = now
    const { active, looping } = animator.tick(now)
    const target = gazeTarget()
    gaze.x = smoothToward(gaze.x, target.x, dt, 70)
    gaze.y = smoothToward(gaze.y, target.y, dt, 70)
    // While it follows the pointer the whole body turns a little toward it, not just the eye.
    const lookTarget = gaze.mode === 'pointer' && trackingAllowed() ? (gaze.x / GAZE_TRAVEL) * 18 : 0
    gaze.look = smoothToward(gaze.look, lookTarget, dt, 180)
    const settling = Math.abs(gaze.x - target.x) > 0.02 || Math.abs(gaze.y - target.y) > 0.02 || Math.abs(gaze.look - lookTarget) > 0.05
    // An idle loop alone (breathing, dozing) only needs every other frame.
    const quiet = !active && !settling
    idleTick += 1
    if (!quiet || idleTick % 2 === 0) {
      rig.iris.style.transform = `translate(${gaze.x.toFixed(2)}px, ${gaze.y.toFixed(2)}px)`
      rig.iris.dataset.gaze = `${gaze.x.toFixed(2)},${gaze.y.toFixed(2)}`
      if (mascot.dataset.mascotState !== 'hidden') {
        const pose = animator.pose
        rig.view.draw({ ...pose, yaw: pose.yaw + gaze.look, pitch: pose.pitch - (gaze.y / GAZE_TRAVEL) * 4 })
      }
    }
    if (!quiet) mascotLast = now
    if (!quiet || (looping && !document.hidden && mascot.dataset.mascotState !== 'hidden')) mascotFrameId = life.frame(tickMascot)
    else mascotLast = 0
  }

  const wakeMascot = () => {
    if (mascotFrameId === null && rig) mascotFrameId = life.frame(tickMascot)
  }

  const setGaze = (mode) => {
    gaze.mode = mode
    gaze.center = null
    wakeMascot()
  }

  /* ------------------------------------------------------ mascot: blink */
  let blinkTimer = null
  const stopBlinking = () => {
    life.clearTimeout(blinkTimer)
    blinkTimer = null
  }
  const startBlinking = () => {
    if (blinkTimer !== null || reducedMotion()) return
    blinkTimer = life.timeout(() => {
      blinkTimer = null
      const eye = mascot.getAttribute('data-eye')
      if (rig?.lid && (eye === 'open' || eye === 'half') && !document.hidden) life.animation(rig.lid.animate(BLINK, { duration: timing.blink, easing: 'ease-in-out' }))
      startBlinking()
    }, pick(timing.blinkEvery, random))
  }

  /* ---------------------------------------------------- mascot: layout */
  const layout = { side: 'right', dir: -1, originX: 0, endX: 0, hideY: 120, homeX: 16, peekPhi: (38 * Math.PI) / 180, peekHide: { x: -60, y: -40 } }

  /** Places the mascot under the page-tip curl, just above-left of the pocket button. */
  const placeForPeek = () => {
    if (mascot.parentElement !== peekClip) peekClip.append(mascot)
    const box = sheet()
    const button = peekButton.getBoundingClientRect() // its centre is unaffected by its scale transition
    const size = peekButton.offsetWidth || 58
    const height = small() ? 46 : 62
    const width = height * MASCOT_ASPECT
    const cx = button.left + button.width / 2
    const cy = button.top + button.height / 2 - box.top
    peekClip.style.top = `${Math.round(cy)}px`
    mascot.style.setProperty('--pocket-mascot-h', `${height}px`)
    // Standing behind the button (its feet hidden by it), the upper left under the paper.
    mascot.style.left = `${Math.round(cx - width * 0.6)}px`
    mascot.style.bottom = `${Math.round(size * 0.3)}px`
    // Hiding place: up and back along the curl direction, fully under the paper.
    const reach = height * 1.7
    layout.peekHide = { x: Math.round(-Math.cos(layout.peekPhi) * reach), y: Math.round(-Math.sin(layout.peekPhi) * reach) }
    mascot.style.setProperty('--pocket-mascot-hide-x', `${layout.peekHide.x}px`)
    mascot.style.setProperty('--pocket-mascot-hide-y', `${layout.peekHide.y}px`)
    gaze.center = null
  }

  /**
   * When album content reaches a little way into the mascot's corner, it sits a little lower
   * (its feet below the floor line, like standing in the pocket's opening) so its visible part
   * clears the content. More than 40% of its height would hide the eye: then it tucks away
   * instead (see watchCorner).
   */
  const measureSink = (line) => {
    const left = line.left + layout.homeX - 6
    const right = line.left + layout.homeX + layout.width + 6
    const floor = Math.min(window.innerHeight, line.top)
    const top = floor - layout.height
    let lowest = -Infinity
    for (const node of pocketRoot.querySelectorAll(CONTENT)) {
      if (!node.getClientRects().length) continue
      const box = node.getBoundingClientRect()
      if (box.right > left && box.left < right && box.bottom > top && box.top < floor) lowest = Math.max(lowest, box.bottom)
    }
    const needed = Math.ceil(lowest + 6 - top)
    return needed > 0 && needed <= layout.height * 0.4 ? needed : 0
  }

  /** Measures the album floor: the corner it lives in, where the turn comes from, how far to hide. */
  const measureFloor = () => {
    if (mascot.parentElement !== stage) stage.append(mascot)
    mascot.style.removeProperty('--pocket-mascot-h')
    mascot.style.bottom = '0px'
    const line = stage.getBoundingClientRect()
    const inner = pocketRoot.querySelector('.pocket-view__inner')?.getBoundingClientRect() ?? line
    const width = mascot.offsetWidth
    const height = mascot.offsetHeight
    const margin = clamp(line.width * 0.02, 12, 28)
    const homeSide = layout.side === 'right' ? 'left' : 'right'
    const gutter = homeSide === 'left' ? inner.left - line.left : line.right - inner.right
    const inset = gutter >= width + 24 ? (gutter - width) / 2 : margin
    const homeX = homeSide === 'left' ? inset : line.width - width - inset
    const originAbsolute = layout.side === 'right' ? line.width - width - margin : margin
    layout.homeX = Math.round(homeX)
    layout.originX = Math.round(originAbsolute - homeX)
    layout.dir = layout.originX > 0 ? -1 : 1
    layout.endX = layout.dir * 14
    layout.hideY = Math.round(height * 1.12)
    layout.width = width
    layout.height = height
    layout.sink = measureSink(line)
    gaze.dir = layout.dir
    mascot.style.left = `${layout.homeX}px`
    mascot.style.bottom = `${-layout.sink}px`
    mascot.style.setProperty('--pocket-mascot-hide-x', '0px')
    mascot.style.setProperty('--pocket-mascot-hide-y', `${layout.hideY}px`)
    mascot.style.setProperty('--pocket-mascot-origin-x', `${layout.originX}px`)
    gaze.center = null
  }

  /* ------------------------------------------------------ mascot: brain */
  const mascotBrain = createMascotBrain({
    clock,
    random,
    timing,
    reduced: reducedMotion,
    onChange: (state, previous, info) => {
      mascot.dataset.mascotState = state
      if (!rig) return
      const reduced = reducedMotion()
      switch (state) {
        case 'hidden':
          stopClip()
          stopBlinking()
          setGaze('viewer')
          if (info.reset) placeForPeek()
          return
        case 'peeking':
          placeForPeek()
          play('rise', { duration: timing.rise, from: layout.peekHide })
          startBlinking()
          return
        case 'waving':
          play('wave', { duration: timing.wave + timing.look, look: timing.look })
          return
        case 'retreating':
          play('duck', { duration: info.quick ? timing.quickDuck : timing.duck, to: layout.peekHide })
          return
        case 'page-reveal-hidden':
          measureFloor()
          still()
          return
        case 'startled':
          play('startle', { duration: timing.startle, originX: layout.originX, hideY: layout.hideY, dir: layout.dir })
          startBlinking()
          return
        case 'running':
          play('run', { duration: timing.run, originX: layout.originX, endX: layout.endX, dir: layout.dir })
          return
        case 'recovering':
          play('recover', { duration: timing.recover, endX: layout.endX, dir: layout.dir })
          return
        case 'closing':
          stopBlinking()
          play('closeDuck', { duration: timing.closeDuck, hideY: layout.hideY })
          return
        case 'tucked':
          if (reduced || info.instant) still()
          else play('tuck', { duration: timing.tuck, hideY: layout.hideY })
          return
        case 'corner-idle':
          if (previous === 'page-reveal-hidden' || previous === 'hidden') measureFloor()
          if (reduced || info.instant) {
            still()
            return
          }
          startBlinking()
          if (info.from === 'tucked') {
            play('untuck', { duration: timing.untuck, hideY: layout.hideY })
            beats.add(life.timeout(() => mascotBrain.state === 'corner-idle' && play('idle'), timing.untuck))
          } else {
            play('idle')
          }
          return
        case 'glancing':
          play('glance', { duration: timing.glance.reduce((sum, part) => sum + part, 0), phases: timing.glance })
          return
        case 'jumping':
          play('jump', { duration: timing.jump })
          return
        case 'beaming':
          play('beam', { duration: timing.beam })
          return
        case 'waking':
          play('wake', { duration: timing.wake })
          startBlinking()
          return
        case 'impatient':
          play('impatient', { duration: timing.impatient })
          return
        case 'eating':
          play('eat', { duration: timing.eat })
          return
        case 'yawning':
          stopBlinking()
          play('yawn', { duration: timing.yawn })
          return
        case 'sleeping':
          stopBlinking()
          play('sleep', {})
          return
        default:
      }
    },
  })

  /* ---------------------------------- drone: one loop for flight, attitude and rotors */
  const rest = restDronePose()
  const attitude = { ...rest } // the 3D attitude drawn each frame: yaw (heading), pitch, roll (bank)
  const flight = { x: 0, y: 0, frame: null, last: 0, mode: null, path: null, home: null, trailLength: 0, spin: 0, onScreen: true, tick: 0 }

  const droneLive = () => droneView && !drone.hidden && !document.hidden && flight.onScreen && !reducedMotion()

  const applyFlight = () => {
    drone.style.transform = flight.x || flight.y ? `translate3d(${flight.x.toFixed(1)}px, ${flight.y.toFixed(1)}px, 0)` : ''
  }

  /** Shortest-way angle smoothing, so a heading never unwinds a full turn. */
  const turnToward = (from, to, dt, tau) => {
    const delta = ((((to - from) % 360) + 540) % 360) - 180
    return from + delta * (1 - Math.exp(-dt / tau))
  }

  const flightFrame = (now) => {
    flight.frame = null
    if (!droneView) return
    const dt = flight.last ? Math.min(64, now - flight.last) : 16
    flight.last = now
    const mode = flight.mode
    // Hovering: a slow look round, never still.
    let target = { yaw: rest.yaw + 12 * Math.sin(now / 1500), pitch: 2.5 * Math.sin(now / 1100), roll: 3 * Math.sin(now / 900) }
    let direct = null
    let speed = 1.2 // rotor degrees per millisecond
    let done = false
    if (mode?.kind === 'heart') {
      const t = clamp((now - mode.start) / mode.duration, 0, 1)
      const u = easeInOutSine(t)
      const point = samplePath(flight.path, u)
      flight.x = point.x - flight.home.x
      flight.y = point.y - flight.home.y
      // Nose into the direction of travel, bank into the turn, tip into the climb or dive.
      const vx = Math.cos(point.angle)
      const vy = Math.sin(point.angle)
      target = { yaw: rest.yaw + vx * 70, pitch: 6 - vy * 14, roll: -vx * 18 }
      speed = 2.6
      trailReveal.style.strokeDashoffset = String(flight.trailLength * (1 - u))
      done = t >= 1
    } else if (mode?.kind === 'evade') {
      // Startled: hops aside and pirouettes once.
      const t = clamp((now - mode.start) / mode.duration, 0, 1)
      const hop = Math.sin(Math.PI * t)
      flight.x = mode.dx * hop + mode.px * Math.sin(2 * Math.PI * t)
      flight.y = mode.dy * hop + mode.py * Math.sin(2 * Math.PI * t)
      direct = { yaw: mode.yaw + mode.spin * 360 * easeInOutSine(t), pitch: 10 * hop, roll: mode.tilt * Math.sin(2 * Math.PI * t) }
      speed = 2.4
      done = t >= 1
    } else if (mode?.kind === 'drag') {
      const px = flight.x
      const py = flight.y
      flight.x = smoothToward(flight.x, mode.tx, dt, 55)
      flight.y = smoothToward(flight.y, mode.ty, dt, 55)
      const vx = (flight.x - px) / Math.max(1, dt)
      const vy = (flight.y - py) / Math.max(1, dt)
      target = { yaw: rest.yaw + clamp(vx * 45, -60, 60), pitch: 4 + clamp(vy * 22, -20, 20), roll: clamp(-vx * 28, -26, 26) }
      speed = 2.4
    } else if (mode?.kind === 'return') {
      const t = clamp((now - mode.start) / mode.duration, 0, 1)
      const e = easeOutBack(t, 1.2)
      flight.x = lerp(mode.fromX, 0, e)
      flight.y = lerp(mode.fromY, 0, e)
      speed = 1.8
      done = t >= 1
    }
    if (direct) Object.assign(attitude, direct)
    else {
      attitude.yaw = turnToward(attitude.yaw, target.yaw, dt, 120)
      attitude.pitch = smoothToward(attitude.pitch, target.pitch, dt, 110)
      attitude.roll = smoothToward(attitude.roll, target.roll, dt, 110)
    }
    flight.spin = (flight.spin + dt * speed) % 360
    if (done) {
      flight.mode = null
      if (mode.kind === 'evade') attitude.yaw -= mode.spin * 360
      if (mode.kind !== 'heart') {
        flight.x = 0
        flight.y = 0
      }
    }
    // Hovering alone only needs every other frame.
    flight.tick += 1
    if (flight.mode || flight.tick % 2 === 0) {
      droneView.draw(attitude, flight.spin)
      applyFlight()
    }
    if (droneLive()) flight.frame = life.frame(flightFrame)
    else flight.last = 0
  }

  const startDrone = () => {
    if (flight.frame === null && droneLive()) flight.frame = life.frame(flightFrame)
  }

  const fly = (mode) => {
    flight.mode = mode
    startDrone()
  }

  /** Back on its anchor at rest (and drawn once, for a still or reduced-motion drone). */
  const land = () => {
    flight.mode = null
    flight.x = 0
    flight.y = 0
    Object.assign(attitude, rest)
    applyFlight()
    droneView?.draw(attitude, flight.spin)
  }

  let trailTimer = null
  const hideTrail = ({ fade = false } = {}) => {
    life.clearTimeout(trailTimer)
    trailTimer = null
    if (!fade) {
      trail.removeAttribute('data-shown')
      trail.removeAttribute('data-fading')
      return
    }
    trail.setAttribute('data-fading', '')
    trailTimer = life.timeout(() => {
      trail.removeAttribute('data-shown')
      trail.removeAttribute('data-fading')
    }, timing.heartFade)
  }

  /* -------------------------------------------------------- drone: brain */
  let pointerAt = null

  const droneBrain = createDroneBrain({
    clock,
    timing,
    reduced: reducedMotion,
    onChange: (state, previous, info) => {
      drone.dataset.droneState = state
      if (state === 'hidden') {
        land()
        hideTrail()
        drone.hidden = true
        return
      }
      if (state === 'entering' || (state === 'home-hover' && info.instant)) {
        land()
        startDrone()
        return
      }
      if (state === 'drawing-heart' && flight.path) {
        trailLine.setAttribute('d', flight.path.d)
        trailReveal.setAttribute('d', flight.path.d)
        flight.trailLength = trailReveal.getTotalLength?.() || flight.path.length
        trailReveal.style.strokeDasharray = `${flight.trailLength} ${flight.trailLength}`
        trailReveal.style.strokeDashoffset = String(flight.trailLength)
        trail.setAttribute('data-shown', '')
        trail.removeAttribute('data-fading')
        fly({ kind: 'heart', start: performance.now(), duration: timing.droneHeart })
        return
      }
      if (state === 'returning-home') {
        if (info.from === 'heart') trailTimer = life.timeout(() => hideTrail({ fade: true }), timing.heartLinger)
        else if (info.cause === 'relayout') hideTrail()
        fly({ kind: 'return', start: performance.now(), duration: info.from === 'heart' ? timing.droneReturn : timing.droneSpringBack, fromX: flight.x, fromY: flight.y })
        return
      }
      if (state === 'evading') {
        // Hop away from the pointer if we know where it is, else up and back.
        const box = drone.getBoundingClientRect()
        const cx = box.left + box.width / 2
        const cy = box.top + box.height / 2
        let ax = -1
        let ay = -0.6
        if (pointerAt && info.cause === 'hover') {
          ax = cx - pointerAt.x
          ay = cy - pointerAt.y
        }
        const length = Math.hypot(ax, ay) || 1
        const reach = small() ? 14 : 20
        fly({ kind: 'evade', start: performance.now(), duration: timing.droneEvade, dx: (ax / length) * reach, dy: (ay / length) * reach, px: (-ay / length) * 6, py: (ax / length) * 6, tilt: ax >= 0 ? -16 : 16, spin: ax >= 0 ? 1 : -1, yaw: attitude.yaw })
        return
      }
      if (state === 'home-hover' && previous !== 'returning-home' && previous !== 'evading') land()
      if (state === 'home-hover') startDrone()
      if (state === 'closing') {
        land()
        hideTrail()
      }
    },
  })

  /* -------------------------------------------------------- drone: layout */
  let anchor = null

  /** Picks a collision-free home for the drone in an upper corner, and room for the heart. */
  const measureDrone = () => {
    const box = layer.getBoundingClientRect()
    const local = (node) => {
      if (!node || node.hidden || !node.getClientRects().length) return null
      const r = node.getBoundingClientRect()
      return rect(r.left - box.left, r.top - box.top, r.width, r.height)
    }
    const q = (selector) => pocketRoot.querySelector(selector)
    const back = local(q('.pocket-view__bar .pocket-back'))
    const clear = local(q('.pocket-clear'))
    const bar = local(q('.pocket-view__bar'))
    const inner = local(q('.pocket-view__inner'))
    const view = local(q('.pocket-view'))
    if (!bar || !inner || !view) return null
    const firstRow = [...pocketRoot.querySelectorAll('.pocket-grid__item')].map(local).filter(Boolean)
    const rowTop = Math.min(...firstRow.map((r) => r.top), local(q('.pocket-empty'))?.top ?? Infinity)
    const obstacles = [back, clear, local(q('.pocket-view__mark')), local(q('#pocket-title')), local(q('.pocket-view__lead')), local(q('.pocket-empty')), ...firstRow.filter((r) => r.top < rowTop + 8)].filter(Boolean)
    const viewportWidth = document.documentElement.clientWidth
    const bounds = rect(8 - box.left, view.top + 4, viewportWidth - 16, Math.max(0, (Number.isFinite(rowTop) ? rowTop : view.bottom) - view.top))
    const w = drone.offsetWidth
    const h = drone.offsetHeight
    const bandTop = bar.bottom + 4
    const bandBottom = Number.isFinite(rowTop) ? rowTop - 6 : bar.bottom + 120
    const rightGutter = viewportWidth - box.left - inner.right
    const leftGutter = inner.left + box.left
    const candidates = [
      { name: 'upper-right', rect: rect(inner.right - w, (bandTop + bandBottom) / 2 - h / 2, w, h), band: { top: bandTop, bottom: bandBottom } },
      back && clear ? { name: 'bar-gap', rect: rect((back.right + clear.left) / 2 - w / 2, bar.top + bar.height / 2 - h / 2, w, h), band: { top: bar.top - 6, bottom: bar.bottom + 6 } } : null,
      rightGutter >= w + 24 ? { name: 'right-gutter', rect: rect(inner.right + (rightGutter - w) / 2, bar.top, w, h), band: { top: bar.top, bottom: bandBottom } } : null,
      leftGutter >= w + 24 ? { name: 'left-gutter', rect: rect(inner.left - leftGutter + (leftGutter - w) / 2, bar.top, w, h), band: { top: bar.top, bottom: bandBottom } } : null,
    ]
    const choice = chooseAnchor({ candidates, obstacles, bounds, margin: 8 })
    if (!choice) return null
    // The heart may use the clear canvas of both top rows; every point of the flight is checked.
    const sky = { top: view.top + 8, bottom: Number.isFinite(rowTop) ? rowTop - 8 : bandBottom }
    const allObstacles = [...obstacles, ...firstRow]
    const heart = choice.name === 'bar-gap' ? null : planHeart({ home: choice.rect, band: sky, obstacles: allObstacles, bounds, drone: { w, h }, max: small() ? 92 : 128 })
    return { ...choice, heart }
  }

  const placeDrone = () => {
    drone.hidden = false // measurable (still under the turning page, or about to move in this frame)
    anchor = measureDrone()
    drone.dataset.droneAnchor = anchor?.name ?? 'none'
    if (!anchor) {
      drone.hidden = true
      flight.path = null
      return
    }
    drone.hidden = false
    drone.style.left = `${Math.round(anchor.rect.left)}px`
    drone.style.top = `${Math.round(anchor.rect.top)}px`
    flight.home = { x: anchor.rect.left + anchor.rect.width / 2, y: anchor.rect.top + anchor.rect.height / 2 }
    if (anchor.heart) {
      flight.path = anchor.heart.flight
      const xs = flight.path.points.map((p) => p.x)
      const ys = flight.path.points.map((p) => p.y)
      const pad = 12
      const x = Math.min(...xs) - pad
      const y = Math.min(...ys) - pad
      const width = Math.max(...xs) - x + pad
      const height = Math.max(...ys) - y + pad
      trail.setAttribute('viewBox', `${x} ${y} ${width} ${height}`)
      for (const [key, value] of Object.entries({ x, y, width, height })) trailMask.setAttribute(key, String(value))
      Object.assign(trail.style, { left: `${x}px`, top: `${y}px`, width: `${width}px`, height: `${height}px` })
    } else {
      flight.path = null
    }
  }

  /* ------------------------------------------------------- album visit */
  let corner = null // IntersectionObserver for content under the mascot's corner
  const covering = new Set()

  /** Watches whether album content sits in the mascot's corner; it tucks itself away if so. */
  const watchCorner = () => {
    if (!visit) return
    if (corner) visit.unobserve(corner)
    covering.clear()
    const line = stage.getBoundingClientRect()
    const width = layout.width ?? mascot.offsetWidth
    const height = layout.height ?? mascot.offsetHeight
    const viewportWidth = document.documentElement.clientWidth
    const viewportHeight = window.innerHeight
    const left = clamp(line.left + layout.homeX, 0, viewportWidth)
    const right = clamp(left + width, 0, viewportWidth)
    const bottom = Math.min(viewportHeight, line.top)
    const top = Math.max(0, bottom - height + (layout.sink ?? 0))
    const margin = `${-Math.round(top)}px ${-Math.round(viewportWidth - right)}px ${-Math.round(viewportHeight - bottom)}px ${-Math.round(left)}px`
    corner = visit.observe(
      new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) covering.add(entry.target)
            else covering.delete(entry.target)
          }
          mascot.toggleAttribute('data-covered', covering.size > 0)
          mascotBrain.setTucked(covering.size > 0)
        },
        { rootMargin: margin, threshold: 0 },
      ),
    )
    for (const node of pocketRoot.querySelectorAll(CONTENT)) corner.observe(node)
  }

  let relayoutFrame = null
  const relayout = () => {
    if (!visit || relayoutFrame !== null) return
    relayoutFrame = visit.frame(() => {
      relayoutFrame = null
      const state = mascotBrain.state
      if (!['startled', 'running', 'recovering', 'closing'].includes(state)) measureFloor()
      droneBrain.relayout()
      if (droneBrain.state !== 'drawing-heart') placeDrone()
      watchCorner()
    })
  }

  let lastActivity = 0
  const noteActivity = () => {
    if (!visit) return
    const now = clock.now()
    if (now - lastActivity < timing.activityThrottle) return
    lastActivity = now
    mascotBrain.activity()
  }

  let press = null // a pointer press on the drone that may become a drag
  let swallowClick = false

  const beginVisit = () => {
    visit?.dispose()
    visit = createScope()
    const v = visit
    const activity = () => noteActivity()
    v.on(window, 'pointerdown', activity, { passive: true })
    v.on(window, 'keydown', activity)
    v.on(window, 'wheel', activity, { passive: true })
    v.on(window, 'touchstart', activity, { passive: true })
    v.on(
      window,
      'scroll',
      () => {
        gaze.center = null
        noteActivity()
      },
      { passive: true },
    )
    v.on(window, 'resize', relayout)
    v.observe(new ResizeObserver(relayout)).observe(pocketRoot)
    // The drone only spins and sways while it is on screen.
    v.observe(
      new IntersectionObserver(([entry]) => {
        flight.onScreen = entry.isIntersecting
        startDrone()
      }),
    ).observe(drone)

    // Cards: one jump per pointer entry, a reduced reaction for keyboard focus or touch.
    const grid = pocketRoot.querySelector('.pocket-grid')
    v.on(grid, 'pointerover', (event) => {
      const sticker = event.target.closest?.('.pocket-sticker')
      if (!sticker || (event.relatedTarget && sticker.contains(event.relatedTarget))) return
      noteActivity()
      mascotBrain.cardEnter(event.pointerType === 'touch' ? 'touch' : 'pointer')
    })
    v.on(grid, 'focusin', (event) => {
      const sticker = event.target.closest?.('.pocket-sticker')
      if (!sticker || (event.relatedTarget && sticker.contains(event.relatedTarget))) return
      if (event.target.matches(':focus-visible')) mascotBrain.cardEnter('keyboard')
    })

    // Drone: hover dodge, click/tap/Enter/Space poke, mouse/pen drag that always springs back.
    v.on(drone, 'pointerenter', (event) => {
      pointerAt = { x: event.clientX, y: event.clientY }
      if (event.pointerType !== 'touch' && finePointer()) droneBrain.hoverEnter()
    })
    v.on(drone, 'pointerleave', () => droneBrain.hoverLeave())
    v.on(drone, 'pointerdown', (event) => {
      if (event.button !== 0 || event.pointerType === 'touch') return
      if (!droneBrain.pointerDown(event.clientX, event.clientY)) return
      const box = drone.getBoundingClientRect()
      const homeLeft = box.left - flight.x
      const homeTop = box.top - flight.y
      const viewportWidth = document.documentElement.clientWidth
      const top = Math.max(0, sheet().top) + 8
      press = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        baseX: flight.x,
        baseY: flight.y,
        min: { x: 8 - homeLeft, y: top - homeTop },
        max: { x: viewportWidth - 8 - box.width - homeLeft, y: window.innerHeight - 8 - box.height - homeTop },
      }
      drone.setPointerCapture?.(event.pointerId)
    })
    v.on(drone, 'pointermove', (event) => {
      if (!press || event.pointerId !== press.id) return
      if (!droneBrain.pointerMove(event.clientX, event.clientY)) return
      const tx = clamp(press.baseX + event.clientX - press.x, press.min.x, press.max.x)
      const ty = clamp(press.baseY + event.clientY - press.y, press.min.y, press.max.y)
      if (flight.mode?.kind === 'drag') {
        flight.mode.tx = tx
        flight.mode.ty = ty
      } else {
        fly({ kind: 'drag', tx, ty })
      }
    })
    const release = (event, cancelled) => {
      if (!press || (event && event.pointerId !== press.id)) return
      if (drone.hasPointerCapture?.(press.id)) drone.releasePointerCapture(press.id)
      press = null
      if (cancelled) droneBrain.pointerCancel()
      else swallowClick = droneBrain.pointerUp()
    }
    v.on(drone, 'pointerup', (event) => {
      release(event, false)
      // Only the click that belongs to this release may be swallowed.
      visit?.timeout(() => (swallowClick = false), 0)
    })
    v.on(drone, 'pointercancel', (event) => release(event, true))
    v.on(drone, 'lostpointercapture', (event) => release(event, true))
    v.on(drone, 'click', (event) => {
      // A drag's release is not a poke; keyboard activation (detail 0) always is.
      if (swallowClick && event.detail !== 0) {
        swallowClick = false
        return
      }
      swallowClick = false
      droneBrain.poke()
    })
    v.on(drone, 'keydown', (event) => {
      if (event.key === 'Escape' && droneBrain.escape()) {
        event.preventDefault()
        event.stopPropagation()
      }
    })
    // Escape during a drag brings the drone home first (and does not close the pocket).
    v.on(
      window,
      'keydown',
      (event) => {
        if (event.key !== 'Escape' || droneBrain.state !== 'dragging') return
        press = null
        swallowClick = true // the release that follows is not a poke
        droneBrain.escape()
        event.preventDefault()
        event.stopPropagation()
      },
      { capture: true },
    )
  }

  /* ----------------------------------------------- life-long listeners */
  life.on(
    window,
    'pointermove',
    (event) => {
      if (event.pointerType === 'touch') return
      gaze.pointer = { x: event.clientX, y: event.clientY }
      pointerAt = gaze.pointer
      if (gaze.mode === 'pointer') wakeMascot()
      noteActivity()
    },
    { passive: true },
  )
  life.on(document, 'visibilitychange', () => {
    if (document.hidden) {
      mascotBrain.suspend()
      droneBrain.suspend()
      stopBlinking()
    } else {
      mascotBrain.resume()
      wakeMascot()
      startDrone()
    }
  })

  /* ------------------------------------------------------------ assets */
  Promise.all([loadRig(ASSETS.mascot, life.signal), loadRig(ASSETS.drone, life.signal)])
    .then(([mascotSvg, droneSvg]) => {
      if (life.disposed) return
      mountRigs(mascotSvg, droneSvg)
      ready = true
      document.body.dataset.pocketActorReady = 'true'
    })
    .catch(() => {
      // The actors are decoration: without their assets the Pocket simply works without them.
    })

  /* ----------------------------------------------------------- lifecycle */
  /** The actors are decoration: an error in them is reported, never allowed to stop the Pocket. */
  const guard = (api) =>
    Object.fromEntries(
      Object.entries(api).map(([name, fn]) => [
        name,
        (...args) => {
          try {
            return fn(...args)
          } catch (error) {
            console.error(`Pocket actors (${name}):`, error)
            return undefined
          }
        },
      ]),
    )

  return guard({
    /** The element pocket.js puts in the curl's `under` layer (what the page tip uncovers). */
    underStage: () => peekStage,

    /** An item was just pocketed by the user (never for a restored pocket). */
    itemPocketed: ({ phi } = {}) => {
      if (!ready || reducedMotion()) return
      if (Number.isFinite(phi)) layout.peekPhi = phi
      mascotBrain.greet()
    },

    /** The pocket button was pressed: cut any greeting short right away. */
    openRequested: () => {
      if (ready) mascotBrain.interruptGreeting()
    },

    /** The page starts turning away; the album is mounted underneath. `phi` is the curl direction. */
    openStart: ({ phi = 0 } = {}) => {
      if (!ready) return
      layout.side = curlSide(phi)
      // With reduced motion the drone has nothing to perform, so it is plain decoration.
      drone.inert = reducedMotion()
      beginVisit()
      mascotBrain.revealStart({ from: layout.side })
      placeDrone()
      if (anchor) droneBrain.open()
    },

    openProgress: (t) => {
      if (visit) mascotBrain.revealProgress(t)
    },

    openComplete: () => {
      if (!visit) return
      mascotBrain.revealComplete()
      droneBrain.revealed({ withHeart: Boolean(anchor && flight.path) })
      watchCorner()
    },

    closeStart: () => {
      if (!visit) return
      press = null
      mascotBrain.closeStart()
      droneBrain.close()
    },

    closeComplete: () => {
      if (!visit && mascotBrain.context !== 'pocket') return
      visit?.dispose()
      visit = null
      corner = null
      covering.clear()
      mascot.removeAttribute('data-covered')
      mascotBrain.closeComplete()
      droneBrain.closeComplete()
    },

    destroy: () => {
      visit?.dispose()
      visit = null
      mascotBrain.destroy()
      droneBrain.destroy()
      stopClip()
      life.dispose()
      layer.remove()
      floor.remove()
      peekStage.remove()
      delete document.body.dataset.pocketActorReady
    },
  })
}
