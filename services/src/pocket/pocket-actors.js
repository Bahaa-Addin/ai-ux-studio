/**
 * Pocket actors: a living Vodafone-red mascot and a small drone. Decoration only: neither ever
 * delays saving, opening or closing, blocks a control, takes focus, or makes a sound.
 *
 * Direction: "live stage" (docs/adr/0002-pocket-actors-live-stage.md). Both are 3D models
 * moving freely on all six axes, driven by physics rather than by fixed curves: springs for
 * every turn and lean, a hoverboard and a drone that both fly and bank into their moves.
 *
 *   Services page   the mascot hides behind the pocket button (inside the curl's `under` layer,
 *                   so the paper and the button both cover it). Every save it rises from behind
 *                   the button, takes hold of its rim, pulls the pocket open and watches the
 *                   peeled item fly in; as it drops in the button snaps shut, the mascot grins,
 *                   lets go and sinks back down behind the button. Saves that follow keep it
 *                   holding on.
 *   Page turn       it rides its hoverboard a short way from the corner to stand under the drone.
 *                   Both keep to the album's right content margin (the same margin as the cards
 *                   and "Empty pocket"), so they line up with the page.
 *   Board           (ADR-0004) in the album it stands on a floating board that flies on the
 *                   drone's model: it accelerates, banks into the ride and wobbles as it brakes,
 *                   and hovering it bobs, drifts and sways on all six axes while the rider leans
 *                   into it, bends its knees and (riding, with no remote) holds its arms out. It
 *                   sets the board down on the floor to doze and lifts it again when it wakes.
 *   Album           it breathes and shifts its weight; its body turns toward the saved cards and
 *                   its eye follows the cursor; a card someone rests on turns it toward that
 *                   card; a click's ripple makes it flinch; after 60 s without input it dozes.
 *                   The drone hovers round its home, drifting gently; it comes over to keep a
 *                   slow cursor company in the open space, dodges ripples, draws a heart for the
 *                   first click of a page load and hops for later ones; it can be dragged.
 *   Cursor          on the album (mouse or trackpad): ./pocket-cursor.js. Its soft light lights
 *                   the characters too: their highlights turn toward it and their shadows fall
 *                   away from it.
 *   Pilot           (ADR-0003) in the album the mascot flies the drone with an RC remote held in
 *                   both hands: the sticks show what it commands and the drone answers a moment
 *                   later (`pilotLead`); its eye is on the drone while the drone does something
 *                   and on the cursor otherwise. Before it dozes it lands the drone on the floor
 *                   beside it (if that spot is free); it flies it up again when it wakes. When the
 *                   pocket opens and that spot is free, the drone waits there and takes off once
 *                   the mascot has ridden in and raised the remote.
 *
 * Models: ./actors/space.js, *-model.js, renderer.js. Motion: ./actors/physics.js, gait.js,
 * drone-flight.js, clips.js. State: ./actors/*-brain.js. pocket.js drives this through a
 * handful of lifecycle calls (itemPocketed, itemLanded, openRequested, openStart/Progress/
 * Complete, closeStart/Complete, destroy). QA hooks: data-mascot-state, data-drone-state,
 * #pocket-output[data-pocket-actor-ready] (the album root, never Vodafone's body), and on the mascot data-look / data-body-yaw / data-remote /
 * data-sticks / data-board (none, riding, hovering, down) / data-board-pose (hover, roll, pitch,
 * yaw, depth, glow).
 *
 * Corner (S12, ADR-0064): on Vodafone's pages the pocket button is at the bottom-LEFT (`corner`
 * 'left'). The mascot hides and rises behind it there; its home in the album does not move (the
 * right content margin, in both languages), so on the page turn it rides its board right across the
 * screen to it, and back to the corner on the way out. The drone does not move at all.
 *
 * Side (S12): the album's inline end, where both stand. 'right' (the default, the clone in both
 * languages): the mascot at the bottom-right of the album, the drone in the upper-right. 'left' (live
 * pages in Arabic, the album right-to-left): mirrored, the mascot at the bottom-left of the album and
 * the drone in the upper-left; every place and direction anchored on a side takes the sign `inward`.
 * The art is never flipped (the board turns round, as it does to ride). The page view's peek follows
 * the button, not the side. With the corner on the same side, a home within RIDE_MIN px of the button
 * has no ride: he rises there.
 */

import { realClock, seededRandom, withTiming, pick } from './actors/timing.js'
import { createMascotBrain } from './actors/mascot-brain.js'
import { createDroneBrain, DRONE_GROUNDED } from './actors/drone-brain.js'
import { MASCOT_CLIPS, EXPRESSION_DEFAULTS, createPoseAnimator } from './actors/clips.js'
import { createMascotView, createDroneView } from './actors/renderer.js'
import { reachToward, holdRemote, restPose, MASCOT_MODEL, REMOTE, BOARD } from './actors/mascot-model.js'
import { restDronePose, DRONE_LIGHT } from './actors/drone-model.js'
import { createScope } from './actors/scope.js'
import { t } from '../i18n.js'
import { clamp, lerp, sampleFlight, rect, rectsOverlap, chooseAnchor, planHeart, easeInOutSine } from './actors/motion.js'
import { createSpring, stepSpring, stepAngleSpring, resetSpring, createWander, angleDelta } from './actors/physics.js'
import { shuffle, planRide, ridePoint } from './actors/gait.js'
import { createFlight, stepFlight, followPoint, kick, command, sticksFor, spool, FLIGHT, BOARD_FLIGHT } from './actors/drone-flight.js'
import { normalize, v3 } from './actors/space.js'
import { createPocketCursor } from './pocket-cursor.js'
import { insetForObstacles, stopAbove } from './obstacles.js'

const ASSETS = {
  mascot: new URL('./actors/assets/mascot.svg', import.meta.url).href,
  drone: new URL('./actors/assets/drone.svg', import.meta.url).href,
}
const SVG_NS = 'http://www.w3.org/2000/svg'
const MASCOT_ASPECT = 120 / 150
const DEPTH = 380 // px: how far in front of the screen the characters imagine what they look at
const SVG_W = 120 // the mascot sheet's viewBox width
const OBSTACLE_PAD = 16 // px the mascot keeps from a fixed control (options.obstacles)
const RIDE_MIN = 60 // px: nearer than this to its home from the button, it does not ride (side 'left')

// Album content the mascot must never cover where it stands.
const CONTENT = '.pocket-grid__item, .pocket-empty, .pocket-view__bar, .pocket-view__head, .pocket-group__head'

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

const centreOf = (node) => {
  if (!node || !node.getClientRects().length) return null
  const box = node.getBoundingClientRect()
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 }
}

const easeOutCubic = (t) => 1 - (1 - t) ** 3
const easeInCubic = (t) => t * t * t
const easeOutBack = (t) => 1 + 2.2 * (t - 1) ** 3 + 1.2 * (t - 1) ** 2 // a small pop past the end

/** The text of a data: URL (base64 or percent-encoded), read here: nothing is fetched for it. */
const dataText = (url) => {
  const comma = url.indexOf(',')
  if (comma < 0) throw new Error('Pocket actor asset is not a data URL')
  const body = url.slice(comma + 1)
  if (!/;base64$/i.test(url.slice(0, comma))) return decodeURIComponent(body)
  const bytes = Uint8Array.from(atob(body), (c) => c.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

/** Loads a local SVG rig and returns it as a live element (scripts and handlers stripped). */
const loadRig = async (url, signal) => {
  let text
  if (/^data:/i.test(url)) text = dataText(url)
  else {
    const response = await fetch(url, { signal })
    if (!response.ok) throw new Error(`Pocket actor asset ${response.status}`)
    text = await response.text()
  }
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml')
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

/**
 * The ride across the screen from the left corner (S12): the board's own pace (TIMING.ride's base,
 * ms per px and least), with more room at the top for the width of a screen. A short ride is
 * timed exactly as before.
 */
export const crossPace = ([base, perPx, least, most]) => [base, perPx, least, Math.round(most * 1.53)]
/** The way back to the left corner: a dash, there (and sunk behind the button) as the page lands (1100 ms). */
export const DASH_PACE = [0, 0.55, 420, 760]

/** Test seam: a frozen config read once at start-up (seeded randomness, faster idle clock). */
const testConfig = () => {
  const value = typeof window !== 'undefined' ? window.__POCKET_ACTORS_TEST__ : null
  return value && typeof value === 'object' ? value : {}
}

/** The yaw and pitch (degrees) that face a screen point from `from`, imagining it DEPTH px in front. */
const facing = (from, to) => {
  const dx = to.x - from.x
  const dy = to.y - from.y
  return { yaw: Math.atan2(dx, DEPTH) / (Math.PI / 180), pitch: Math.atan2(-dy, Math.hypot(dx, DEPTH)) / (Math.PI / 180) }
}

/** A key light that leans toward a screen point (the cursor's light), as seen from `at`. */
const lightToward = (base, at, source, strength = 0.7) => {
  if (!source || !at) return base
  const dx = source.x - at.x
  const dy = source.y - at.y
  const distance = Math.hypot(dx, dy)
  const w = clamp(1 - distance / 1100, 0.2, 1) * strength
  const toward = normalize(v3(dx, -dy, 420))
  return normalize(v3(lerp(base.x, toward.x, w), lerp(base.y, toward.y, w), lerp(base.z, toward.z, w)))
}

/**
 * @param {object} options
 * @param {HTMLElement} options.pocketRoot   #pocket-output (the album)
 * @param {HTMLElement} options.peekButton   the floating pocket button in the curl
 * @param {() => {top:number,width:number,height:number}} options.sheet  the turning sheet's box
 * @param {() => boolean} options.reducedMotion
 * @param {'right'|'left'} [options.corner]  the side of the pocket button (physical); 'left' on Vodafone's pages
 * @param {'right'|'left'} [options.side]  the album's inline end, where they stand (physical); 'left' for a right-to-left album on Vodafone's pages
 * @param {'sticky'|'fixed'} [options.floor]  the album floor: sticky (the clone) or fixed, bounded above the footer
 * @param {(fn: Function) => Function} [options.wrap]  wraps every listener, timer, frame and observer callback
 * @param {(node: Element) => Element} [options.mark]  called on every node the actors add
 * @param {() => Array<{left:number,top:number,right:number,bottom:number}>} [options.obstacles]  fixed
 *   controls to keep 16 px from (viewport px; ./obstacles.js fixedObstacles); null: none
 * @param {(error: unknown) => void} [options.report]
 * @param {(step: string) => void} [options.checkpoint]  test seam: reached as 'actors-frame' in the mascot's frame
 * @returns the lifecycle API, or null when another instance is alive (the rigs' SVG ids are fixed: one at a time)
 */
let instance = null

export const createPocketActors = ({ pocketRoot, peekButton, sheet, reducedMotion, corner = 'right', side = 'right', floor: floorMode = 'sticky', wrap = (fn) => fn, mark = (node) => node, obstacles = null, report = null, checkpoint = null }) => {
  if (instance) {
    console.warn('Pocket actors: one instance at a time; this one is not created (null)')
    return null
  }
  const self = {}
  const config = testConfig()
  const timing = withTiming(config.timing)
  const random = seededRandom(Number.isFinite(config.seed) ? config.seed : (Date.now() ^ (Math.random() * 0x7fffffff)) >>> 0)
  const clock = realClock
  const leftCorner = corner === 'left'
  const leftSide = side === 'left'
  const inward = leftSide ? 1 : -1 // toward the content from where they stand
  const restNose = leftSide ? 180 : 0 // the board's nose (-x) toward the content at rest
  const openSide = leftCorner ? 'right' : 'left' // where the drone waits on the floor as the pocket opens
  const inwardFirst = leftSide ? ['right', 'left'] : ['left', 'right'] // parking spots, toward the content first
  const fixedFloor = floorMode === 'fixed'
  const scope = () => createScope({ wrap })
  const life = scope()
  const make = (tag, className, attributes) => mark(el(tag, className, attributes))
  const makeSvg = (tag) => mark(document.createElementNS(SVG_NS, tag))
  /** The obstacles now (none without the option); never throws. */
  const fixedBoxes = () => {
    if (!obstacles) return []
    try {
      return obstacles() ?? []
    } catch {
      return []
    }
  }
  let visit = null // one pocket visit: opened → closed
  let cursor = null // the album cursor, during a visit
  let ready = false

  /* ------------------------------------------------------------ the DOM */
  const mascot = make('div', 'pocket-mascot', { 'aria-hidden': 'true', 'data-mascot-state': 'hidden' })
  const mover = make('div', 'pocket-mascot__mover')
  mascot.append(mover)

  // Inside the curl's `under` box (sheet coordinates): clipped by the paper, covered by the roll.
  const peekStage = make('div', 'pocket-actor-peek', { 'aria-hidden': 'true' })
  const peekClip = make('div', 'pocket-actor-peek__clip')
  peekStage.append(peekClip)
  peekClip.append(mascot)

  // The mascot's hands on the button's rim, drawn over the button (under its count badge).
  const grip = makeSvg('svg')
  grip.setAttribute('class', 'pocket-actor-grip')
  grip.setAttribute('aria-hidden', 'true')
  grip.setAttribute('focusable', 'false')
  const gripHands = [makeSvg('g'), makeSvg('g')]
  grip.append(...gripHands)
  const badge = peekButton.querySelector('.pocket-peek__count')
  peekButton.insertBefore(grip, badge ?? null)

  // In the album: the drone layer (after the content, so it is last in tab order) and the floor.
  const layer = make('div', 'pocket-actor-layer')
  const trail = makeSvg('svg')
  trail.setAttribute('class', 'pocket-drone-trail')
  trail.setAttribute('aria-hidden', 'true')
  trail.setAttribute('focusable', 'false')
  trail.innerHTML =
    '<defs><mask id="pocket-drone-trail-mask" maskUnits="userSpaceOnUse"><path class="pocket-drone-trail__reveal" fill="none" stroke="#fff" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/></mask></defs>' +
    '<path class="pocket-drone-trail__line" fill="none" mask="url(#pocket-drone-trail-mask)"/>'
  for (const node of trail.querySelectorAll('*')) mark(node)
  const trailReveal = trail.querySelector('.pocket-drone-trail__reveal')
  const trailLine = trail.querySelector('.pocket-drone-trail__line')
  const trailMask = trail.querySelector('mask')
  // Two shadows: one cast on the page behind it (it always goes with the drone), and a contact
  // shadow on the floor that shows only while it is down there (landing, parked, taking off).
  const droneShadow = make('div', 'pocket-drone-shadow', { 'aria-hidden': 'true', hidden: true })
  const groundShadow = make('div', 'pocket-drone-shadow pocket-drone-shadow--ground', { 'aria-hidden': 'true', hidden: true })
  const drone = make('button', 'pocket-drone', { type: 'button', 'aria-label': t('Play with the Pocket drone'), 'data-drone-state': 'hidden', hidden: true })
  const droneTilt = make('span', 'pocket-drone__tilt', { 'aria-hidden': 'true' })
  const droneBob = make('span', 'pocket-drone__bob')
  droneTilt.append(droneBob)
  drone.append(droneTilt)
  layer.append(groundShadow, droneShadow, trail, drone)

  const floor = make('div', fixedFloor ? 'pocket-actor-floor pocket-actor-floor--fixed' : 'pocket-actor-floor', { 'aria-hidden': 'true' })
  const stage = make('div', 'pocket-mascot-stage')
  floor.append(stage)
  pocketRoot.append(layer, floor)

  /* ----------------------------------------------------------- the rigs */
  let rig = null // the mascot's 3D view
  let droneView = null

  const mountRigs = (mascotSvg, droneSvg) => {
    mark(mascotSvg)
    mark(droneSvg)
    mover.append(mascotSvg)
    const view = createMascotView(mascotSvg)
    rig = { svg: mascotSvg, view, iris: view.parts.iris }
    // The mitten for the hands on the button: the sheet's hand artwork.
    const hand = mascotSvg.querySelector('[data-limb="arm-r"] [data-place="hand-r"] > *')
    // Every node of the copy is the actors' own (marked, as everything they add).
    const handCopy = () => {
      const copy = hand.cloneNode(true)
      for (const node of [copy, ...copy.querySelectorAll('*')]) mark(node)
      return copy
    }
    if (hand) gripHands.forEach((g) => g.append(handCopy()))
    droneBob.append(droneSvg)
    droneView = createDroneView(droneSvg)
    applyExpression({})
    drawMascot(performance.now(), 16)
    droneView.draw(restDronePose(), 0)
  }

  /*
   * Margins. The mascot and the drone line up with the album's content: the visible right edge
   * of each drawing (not its box) sits on the right edge of the content, where the cards and
   * "Empty pocket" end. `insets` is how far each drawing sits inside its box on the right, as a
   * fraction of the box's width; measured from the drawings (they must be displayed to measure).
   */
  const insets = { mascot: 0.06, mascotLeft: 0.08, drone: 0.08, droneLeft: 0.08, droneBottom: 0.2, droneMeasured: false }

  /** The rightmost drawn point of `nodes` in the svg's units (from getBBox), or -Infinity. */
  const rightmost = (nodes) => {
    let right = -Infinity
    for (const node of nodes) {
      const box = node.getBBox()
      if (box.width) right = Math.max(right, box.x + box.width)
    }
    return right
  }

  /**
   * The mascot's inset when it stands turned `yaw` degrees (and leans back `pitch`), on its board
   * (album). Its body and board line up, not its hands: the arms swing out and back as it turns
   * and gestures (up to about 10 px), the body keeps its line.
   */
  const measureMascotInset = (yaw, pitch = 0) => {
    try {
      const vb = rig.svg.viewBox.baseVal
      const onIt = { board: 1, hover: BOARD.hover, y: BOARD.hover + BOARD.thickness - BOARD.feet }
      rig.view.draw({ ...restPose(), yaw, pitch, ...onIt, boardYaw: restNose }, { light: MASCOT_MODEL.light })
      const outline = rig.svg.querySelector('[data-part="outline"]')
      const deck = rig.svg.querySelector('[data-part="board-deck"]')
      const stroke = parseFloat(outline?.getAttribute('stroke-width')) || 0
      const deckStroke = parseFloat(deck?.getAttribute('stroke-width')) || 0
      const right = Math.max(rightmost([outline]) + stroke / 2, deck ? rightmost([deck]) + deckStroke / 2 : -Infinity)
      if (Number.isFinite(right) && vb.width) insets.mascot = clamp((vb.x + vb.width - right) / vb.width, 0, 0.3)
      const box = outline.getBBox()
      const deckBox = deck?.getBBox()
      const left = Math.min(box.x - stroke / 2, deckBox?.width ? deckBox.x - deckStroke / 2 : Infinity)
      if (box.width && vb.width) insets.mascotLeft = clamp((left - vb.x) / vb.width, 0, 0.3)
    } catch {
      // Keep the last value.
    } finally {
      // Put back what was on screen; the next frame draws it anyway.
      if (rig.lastPose) rig.view.draw(rig.lastPose, { light: rig.lastLight })
    }
  }

  /** The drone's inset at rest: its rotor guards are its outermost parts (constant, so once). */
  const measureDroneInset = () => {
    if (insets.droneMeasured) return
    try {
      const svg = droneView.svg
      const vb = svg.viewBox.baseVal
      droneView.draw(restDronePose(), 0)
      // The guards' outer (heavy) stroke is 4.6 units wide: half of it lies outside the path.
      const guards = svg.querySelectorAll('[data-part^="rotor-unit"] > path')
      const right = rightmost(guards) + 2.3
      if (Number.isFinite(right) && vb.width) {
        insets.drone = clamp((vb.x + vb.width - right) / vb.width, 0, 0.3)
        insets.droneMeasured = true
      }
      // Its left edge and its lowest point (where it stands when it lands).
      let left = Infinity
      let bottom = -Infinity
      for (const node of [...guards, ...svg.querySelectorAll('[data-part="body"] > ellipse')]) {
        const b = node.getBBox()
        if (!b.width) continue
        left = Math.min(left, b.x - 2.3)
        bottom = Math.max(bottom, b.y + b.height + 1.5)
      }
      if (Number.isFinite(left)) insets.droneLeft = clamp((left - vb.x) / vb.width, 0, 0.3)
      if (Number.isFinite(bottom) && vb.height) insets.droneBottom = clamp((vb.y + vb.height - bottom) / vb.height, 0, 0.45)
    } catch {
      // Keep the default.
    }
  }

  /** The edge of the album's content on their side (the cards, "Empty pocket"), in viewport px. */
  const contentEdge = () => {
    const inner = pocketRoot.querySelector('.pocket-view__inner')
    if (inner?.getClientRects().length) return leftSide ? inner.getBoundingClientRect().left : inner.getBoundingClientRect().right
    return leftSide ? 16 : document.documentElement.clientWidth - 16
  }

  /* ===================================================== the mascot */

  /* ------------------------------------------------------- clips, face */
  const animator = createPoseAnimator()
  const beats = new Set()
  const running = new Set() // decal Web Animations (the Zs)
  let expression = { ...EXPRESSION_DEFAULTS }

  const applyExpression = (patch, base = expression) => {
    expression = { ...base, ...patch }
    for (const [key, value] of Object.entries(expression)) {
      const name = `data-${key}`
      if (value === false) mascot.removeAttribute(name)
      else mascot.setAttribute(name, value === true ? '' : String(value))
    }
  }

  const stopClip = () => {
    for (const animation of running) animation.cancel()
    running.clear()
    for (const id of beats) life.clearTimeout(id)
    beats.clear()
  }

  /** Plays a clip from ./actors/clips.js on top of the physical motion. */
  const play = (name, params = {}) => {
    stopClip()
    if (!rig) return
    const clip = MASCOT_CLIPS[name](params)
    const duration = clip.duration ?? params.duration ?? 300
    applyExpression(clip.expression ?? {}, EXPRESSION_DEFAULTS)
    for (const track of clip.decals ?? []) {
      for (const node of rig.svg.querySelectorAll(track.selector)) {
        const animation = node.animate(track.keyframes, { duration: track.duration ?? duration, delay: track.delay ?? 0, easing: track.easing ?? 'ease-in-out', iterations: track.iterations ?? 1, fill: track.fill ?? 'forwards' })
        running.add(animation)
        life.animation(animation)
      }
    }
    animator.play(clip, performance.now(), duration)
    for (const [at, patch] of clip.beats ?? []) beats.add(life.timeout(() => applyExpression(patch), at))
    for (const [at, target] of clip.gaze ?? []) {
      if (at <= 0) look.mode = target
      else beats.add(life.timeout(() => (look.mode = target), at))
    }
    wakeMascot()
  }

  /* ------------------------------------------------- the physical body */
  const place = { x: 0, y: 0, vx: 0, vy: 0 } // the box's offset (px) from its spot
  let travel = null // { from, to, start, duration, ease, arc }
  const body = {
    yaw: createSpring(0, { frequency: 1.1, damping: 0.78 }),
    pitch: createSpring(0, { frequency: 1.4, damping: 0.8 }),
    bend: createSpring(0, { frequency: 2.3, damping: 0.32 }), // the flame tip's follow-through
    nod: createSpring(0, { frequency: 2.6, damping: 0.38 }),
    lid: createSpring(0, { frequency: 7, damping: 1 }),
    wide: createSpring(0, { frequency: 6, damping: 0.9 }),
    gazeX: createSpring(0, { frequency: 6.5, damping: 0.92 }),
    gazeY: createSpring(0, { frequency: 6.5, damping: 0.92 }),
    grip: createSpring(0, { frequency: 4, damping: 1 }),
  }
  const arms = { La: createSpring(26, { frequency: 5, damping: 0.8 }), Lf: createSpring(8, { frequency: 5, damping: 0.8 }), Lr: createSpring(1, { frequency: 5, damping: 1 }), Ra: createSpring(26, { frequency: 5, damping: 0.8 }), Rf: createSpring(8, { frequency: 5, damping: 0.8 }), Rr: createSpring(1, { frequency: 5, damping: 1 }) }
  const wander = Array.from({ length: 8 }, (_, i) => createWander(random, { hz: [0.13, 0.11, 0.07, 0.17, 0.15, 0.09, 0.06, 0.12][i] }))
  const fidget = { next: 0, start: -1 } // an occasional weight shift with a little step
  const blink = { at: -1, next: 0, double: false }
  // What the eye and body attend to: a mode, the points it can resolve, and the current fixation.
  const look = { mode: 'cursor', card: null, ripple: null, fix: null, fixAt: 0, bodyYaw: 0 }
  const pointer = { x: -1, y: -1, at: -Infinity }
  let mascotFrameId = null
  let mascotLast = 0
  let mascotTick = 0
  let lastVelocity = { x: 0, y: 0 }
  let gripRelease = Infinity // when, during a catch, the hands let go of the button

  // The pilot (ADR-0003): the remote in its hands and the sticks under its thumbs.
  const stickSpring = () => createSpring(0, { frequency: 9, damping: 0.75 })
  const pilot = {
    hold: createSpring(0, { frequency: 2.4, damping: 0.95 }), // 0 no remote, 1 held up
    droop: createSpring(0, { frequency: 1.2, damping: 1 }),
    led: createSpring(0, { frequency: 6, damping: 1 }),
    sticks: { across: stickSpring(), depth: stickSpring(), turn: stickSpring(), climb: stickSpring() },
    jolt: -Infinity, // a flinch jolted the remote
    shakeAt: -Infinity, // it shook the remote (the drone was dragged away)
    dragAt: -Infinity,
    shook: false,
  }
  // The hoverboard (ADR-0004): in the album it stands on a board that flies like the drone. The
  // board's x is the box's offset (place.x, px); its height (y, down, 0 the floor) and depth (z)
  // are model units, so the body is lifted onto it in model space and its shadow stays put.
  const board = {
    flight: createFlight(0),
    plan: null, // planRide() plus its start: the path it chases while it rides
    base: 0, // where it hovers when it is not riding (px from its spot)
    dir: 0, // which way it last rode (for the look ahead)
    bumpAt: 0, // the next bit of turbulence
    last: 0, // when the board last moved (its flight runs on real time)
    lean: createSpring(0, { frequency: 2.2, damping: 0.45 }), // the rider leaning into the ride
    tip: createSpring(0, { frequency: 2.2, damping: 0.5 }),
    crouch: createSpring(0, { frequency: 5, damping: 0.55 }), // its knees soaking up the bumps
    balance: createSpring(0, { frequency: 2.6, damping: 0.9 }), // arms out while it rides
    glow: createSpring(1, { frequency: 3, damping: 1 }),
  }
  const boardWander = Array.from({ length: 6 }, (_, i) => createWander(random, { hz: [0.1, 0.3, 0.14, 0.21, 0.17, 0.1][i] }))
  const riding = () => board.plan !== null
  const onBoard = () => mascotBrain.context === 'pocket'

  /** The board at rest at `x`: hovering level, glowing, the rider upright. */
  const resetBoard = (x = 0) => {
    const f = board.flight
    Object.assign(f, { x, y: -BOARD.hover, z: 0, vx: 0, vy: 0, vz: 0, ax: 0, ay: 0, az: 0 })
    for (const spring of [f.roll, f.pitch, board.lean, board.tip, board.crouch, board.balance]) resetSpring(spring, 0)
    resetSpring(f.yaw, restNose)
    resetSpring(f.rpm, BOARD_FLIGHT.rpm.idle)
    resetSpring(board.glow, 1)
    board.base = x
    board.last = 0
  }
  resetBoard(0)

  /**
   * One frame of the board, and the rider's balance on it. It chases its path (riding) or its spot
   * (hovering) on the flight model; `driveX` false: something else moves the box (a tuck), so it
   * only hovers. Returns the board's pose keys, the rider's additions and its arms' balance.
   */
  const stepBoard = (now, dt, state, reduced, driveX) => {
    const f = board.flight
    const [wx, wBob, wDepth, wRoll, wPitch, wYaw] = timing.boardWander
    const down = state === 'sleeping' || state === 'yawning' // it sets the board down to doze
    if (reduced) {
      board.plan = null
      resetBoard(place.x)
      return { board: { board: 1, hover: BOARD.hover, boardRoll: 0, boardPitch: 0, boardYaw: restNose, boardX: 0, boardZ: 0, glow: 0.85 }, pose: { y: BOARD.hover + BOARD.thickness - BOARD.feet }, balance: 0, counter: 0, nod: 0 }
    }
    const w = (i, t = now) => boardWander[i](t)
    const live = down ? 0 : 1
    // Where it is heading at time `t`: along its path while it rides; hovering, it drifts a few px
    // inward of its spot (never out, so the rider keeps to the margin), bobs, sways in depth.
    const targetAt = (t) => {
      const x = board.plan ? ridePoint(board.plan, t - board.plan.start).x : board.base
      return { x: x + inward * live * wx * (1 + w(0, t)) * 0.5, y: -live * (BOARD.hover + wBob * w(1, t)), z: live * wDepth * w(2, t) }
    }
    // The nose (-x) leads. Riding right from the left corner, the board turns round so it still does,
    // and swings back to face the content once it is there (on the left side, the content is to its
    // right: it rests turned round).
    const nose = board.plan ? (leftCorner && board.plan.dir > 0 ? 180 : 0) : restNose
    const heading = nose + live * wYaw * w(5) - (board.plan ? (nose ? -6 : 6) * board.plan.dir : 0)
    // A little turbulence: a bump now and then (more often while it rides).
    if (now >= board.bumpAt) {
      if (board.bumpAt && live) kick(f, 0, (random() - 0.5) * (riding() ? 46 : 28), 0)
      board.bumpAt = now + (riding() ? 220 + random() * 260 : 1400 + random() * 2200)
    }
    // The flight runs on the real time since the last frame (up to 0.25 s), in short steps along
    // the path, so slow frames (the page turning on a slow device) never leave it behind its path.
    const options = down ? { ...BOARD_FLIGHT, frequency: 0.8, damping: 1 } : board.plan?.dash ? { ...BOARD_FLIGHT, frequency: 2.6, damping: 0.72, maxAccel: 9000 } : BOARD_FLIGHT
    let elapsed = board.last ? clamp(now - board.last, 0, 250) : dt
    board.last = now
    while (elapsed > 0) {
      const step = Math.min(elapsed, 32)
      elapsed -= step
      stepFlight(f, step, targetAt(now - elapsed), heading, options)
    }
    if (board.plan && ridePoint(board.plan, now - board.plan.start).done) {
      board.base = board.plan.to
      board.plan = null
    }
    if (f.y > 0) {
      // The floor.
      f.y = 0
      f.vy = Math.min(0, f.vy)
    }
    if (driveX) place.x = f.x
    else {
      f.x = place.x
      f.vx = 0
    }
    stepSpring(board.glow, dt, down ? 0.12 : clamp(f.rpm.x + 0.05 * Math.sin((2 * Math.PI * now) / 700), 0, 1))
    // The rider: leans into the ride and with the board, bends its knees on bumps and lifts, and
    // holds its arms out while it moves (they windmill against the lean).
    const roll = f.roll.x + live * wRoll * w(3)
    const pitch = f.pitch.x + live * wPitch * w(4)
    stepSpring(board.lean, dt, clamp(roll * 0.7 - f.ax * 0.005, -14, 14))
    stepSpring(board.tip, dt, clamp(pitch * 0.5 + f.az * 0.01, -8, 8))
    stepSpring(board.crouch, dt, clamp(-f.ay * 0.0015 + Math.abs(f.ax) * 0.00025, -0.5, 1))
    stepSpring(board.balance, dt, clamp(Math.abs(f.vx) / 70 + Math.abs(f.ax) / 600, 0, 1))
    const hover = Math.max(0, -f.y)
    const crouch = board.crouch.x
    return {
      board: { board: 1, hover, boardRoll: roll, boardPitch: pitch, boardYaw: f.yaw.x, boardX: 0, boardZ: f.z, glow: clamp(board.glow.x, 0, 1) },
      pose: { y: hover + BOARD.thickness - BOARD.feet, sy: -0.07 * crouch, sx: 0.035 * crouch, roll: board.lean.x, pitch: board.tip.x, z: f.z },
      balance: clamp(board.balance.x, 0, 1),
      counter: board.lean.x,
      nod: clamp(f.vy * 0.04, -5, 5),
    }
  }

  /** Flying the drone: in the album, with a drone on show (not on phones, where there is none). */
  const piloting = () => mascotBrain.context === 'pocket' && Boolean(anchor) && !drone.hidden && !small()

  const mascotAlive = () => rig && mascot.dataset.mascotState !== 'hidden' && !document.hidden

  // Its container only moves when the layout does (the travel is a transform on the mover), so
  // it is measured then, not every frame.
  let mascotBox = null
  const remeasureMascot = () => {
    mascotBox = null
    cardsCache = null
    fly.layerBox = null
  }

  /** The mascot's on-screen geometry this frame: its box (with the travel offset) and px per unit. */
  const measureMascot = () => {
    if (!mascotBox) {
      const box = mascot.getBoundingClientRect()
      mascotBox = { left: box.left, top: box.top, width: box.width }
    }
    return { left: mascotBox.left + place.x, top: mascotBox.top + place.y, scale: mascotBox.width / SVG_W }
  }

  const toScreen = (geo, point) => ({ x: geo.left + point.x * geo.scale, y: geo.top + point.y * geo.scale })
  const toSvg = (geo, point) => ({ x: (point.x - geo.left) / geo.scale, y: (point.y - geo.top) / geo.scale })

  let cardsCache = null
  const cardsPoint = () => {
    if (cardsCache && performance.now() - cardsCache.at < 500) return cardsCache.point
    cardsCache = { at: performance.now(), point: measureCards() }
    return cardsCache.point
  }
  const measureCards = () => {
    const items = [...pocketRoot.querySelectorAll('.pocket-grid__item')].filter((n) => n.getClientRects().length)
    const visible = items.map((n) => n.getBoundingClientRect()).filter((b) => b.bottom > 0 && b.top < window.innerHeight)
    if (!visible.length) return centreOf(pocketRoot.querySelector('.pocket-empty') ?? pocketRoot.querySelector('#pocket-title'))
    const x = visible.reduce((sum, b) => sum + b.left + b.width / 2, 0) / visible.length
    const y = visible.reduce((sum, b) => sum + b.top + b.height / 2, 0) / visible.length
    return { x, y }
  }

  /** The screen point the current look mode resolves to (null: straight ahead). */
  const lookPoint = (mode, eye) => {
    switch (mode) {
      case 'cursor':
        if (pointer.x >= 0 && finePointer() && clock.now() - pointer.at < 12000) return pointer
        return look.card ?? cardsPoint()
      case 'cards':
        return look.card ?? cardsPoint()
      case 'sticker':
        return centreOf(document.querySelector('.curl-host--flying')) ?? centreOf(peekButton)
      case 'button': {
        const c = centreOf(peekButton)
        return c ? { x: c.x, y: c.y + 6 } : null
      }
      case 'ripple':
        return look.ripple
      case 'drone':
        return drone.hidden ? null : droneCentre()
      case 'remote': {
        const geo = measureMascot()
        return rig?.lastRemote ? toScreen(geo, rig.lastRemote) : null
      }
      case 'ride':
        return board.dir && eye ? { x: eye.x + board.dir * 500, y: eye.y - 30 } : null
      default:
        return null
    }
  }

  /** Where the body should face (yaw, pitch) and where the eye should look, this frame. */
  const aim = (eye) => {
    const state = mascot.dataset.mascotState
    const mode = look.active ?? look.mode
    const target = lookPoint(mode, eye)
    const toTarget = target && eye ? facing(eye, target) : { yaw: 0, pitch: 0 }
    let bodyYaw = 0
    let bodyPitch = 0
    if (state === 'riding' || state === 'leaving') {
      // Riding it faces the way it goes, half turned (it stands across the board).
      bodyYaw = (board.dir || 1) * 30
    } else if (mascotBrain.context === 'pocket') {
      // The body turns toward the saved cards (the one someone rests on, if any); a cursor far
      // from them pulls it a little way round, so the eye can still follow it.
      const cards = eye ? look.card ?? cardsPoint() : null
      const toCards = cards ? facing(eye, cards) : { yaw: 0, pitch: 0 }
      const limit = timing.bodyMaxTurn
      bodyYaw = clamp(toCards.yaw, -limit, limit)
      if (mode === 'cursor' && target && target !== cards) bodyYaw = clamp(bodyYaw + 0.35 * (clamp(toTarget.yaw, -limit, limit) - bodyYaw), -limit, limit)
      if (mode === 'ripple' || mode === 'drone') bodyYaw = clamp(lerp(bodyYaw, toTarget.yaw, 0.5), -limit, limit)
      if (state === 'sleeping' || state === 'yawning') bodyYaw *= 0.5
      // A pilot leans back a little to watch its drone overhead.
      bodyPitch = mode === 'drone' ? clamp(-0.15 * toTarget.pitch, -9, 3) : clamp(-0.12 * toTarget.pitch, -6, 3)
    } else {
      // On the Services page it faces the flying item a little, never far from the button.
      bodyYaw = leftCorner ? clamp(toTarget.yaw * 0.4, -18, 24) : clamp(toTarget.yaw * 0.4, -24, 18)
      bodyPitch = clamp(-0.1 * toTarget.pitch, -5, 3)
    }
    return { bodyYaw, bodyPitch, eye: target ? toTarget : null }
  }

  const scheduleBlink = (now) => {
    blink.next = now + pick(timing.blinkEvery, random)
  }

  /** One frame of the mascot: physics, look, life, the clip on top, then draw. */
  const drawMascot = (now, dt) => {
    const geo = measureMascot()
    const state = mascot.dataset.mascotState
    const reduced = reducedMotion()
    const asleep = state === 'sleeping' || state === 'yawning'

    // Clip, travel, the board.
    animator.tick(now)
    const clipPose = animator.pose
    const px = place.x
    const py = place.y
    const moved = Boolean(travel)
    if (travel) {
      const t = clamp((now - travel.start) / travel.duration, 0, 1)
      const e = travel.ease(t)
      place.x = lerp(travel.from.x, travel.to.x, e)
      place.y = lerp(travel.from.y, travel.to.y, e) - (travel.arc ?? 0) * Math.sin(Math.PI * t)
      if (t >= 1) travel = null
    }
    const ride = onBoard() && state !== 'hidden' ? stepBoard(now, dt, state, reduced, !moved) : null
    const ridePose = ride?.pose ?? {}
    const seconds = Math.max(1, dt) / 1000
    const vx = (place.x - px) / seconds
    const vy = (place.y - py) / seconds
    const ax = (vx - lastVelocity.x) / seconds
    lastVelocity = { x: vx, y: vy }

    // Where it faces and looks. Flying the drone, it watches the drone while the drone does
    // something (and the remote while it shakes it), the cursor otherwise.
    look.active = null
    if (look.mode === 'cursor' && piloting() && pilot.hold.x > 0.5 && !reduced) {
      if (now - pilot.shakeAt < timing.shake + 250) look.active = 'remote'
      else if (droneBrain.watched) look.active = 'drone'
    }
    const eyeSvg = rig.lastEye ?? { x: 60, y: 72 }
    const eye = toScreen(geo, eyeSvg)
    const wanted = aim(eye)
    const turnRate = state === 'riding' || state === 'leaving' ? 2.2 : 1.1
    const previousYaw = body.yaw.x
    if (reduced) {
      resetSpring(body.yaw, 0)
      resetSpring(body.pitch, 0)
    } else {
      stepAngleSpring(body.yaw, dt, wanted.bodyYaw, turnRate, 0.78)
      stepSpring(body.pitch, dt, wanted.bodyPitch)
    }
    const yawVelocity = angleDelta(previousYaw, body.yaw.x) / seconds
    look.bodyYaw = body.yaw.x

    // The eye: saccades. A new fixation when the target moved enough and the pointer paused
    // (or the move is large); between them it holds.
    if (wanted.eye && !reduced) {
      const gx = wanted.eye.yaw - body.yaw.x
      const gy = wanted.eye.pitch * 0.8 - body.pitch.x
      const shift = look.fix ? Math.hypot(gx - look.fix.x, gy - look.fix.y) : Infinity
      const paused = now - pointer.at > 60 || (look.active ?? look.mode) !== 'cursor'
      if (shift > 7 || (shift > 1.5 && paused)) look.fix = { x: gx, y: gy }
    } else if (!wanted.eye) {
      look.fix = { x: 0, y: 0 }
    }
    stepSpring(body.gazeX, dt, look.fix?.x ?? 0)
    stepSpring(body.gazeY, dt, look.fix?.y ?? 0)

    // The face: lid, width, blinks.
    const lidBase = expression.eye === 'half' ? 0.42 : 0
    stepSpring(body.lid, dt, lidBase)
    stepSpring(body.wide, dt, expression.eye === 'wide' ? 1 : 0)
    if (!reduced && !asleep && expression.eye !== 'closed' && now >= blink.next && blink.next > 0) {
      blink.at = now
      blink.double = random() < 0.18
      scheduleBlink(now)
    }
    const blinkSpan = timing.blink * (blink.double ? 2.2 : 1)
    const sinceBlink = now - blink.at
    let blinkLid = 0
    if (blink.at >= 0 && sinceBlink < blinkSpan) {
      const u = sinceBlink / timing.blink
      blinkLid = blink.double ? Math.max(0, Math.sin(Math.PI * Math.min(1, u)), Math.sin(Math.PI * Math.max(0, u - 1.2))) : Math.sin(Math.PI * u)
    }

    // Life: breathing, weight shifts, a tip that sways; quieter while a clip or the ride plays.
    const aliveness = reduced || state === 'hidden' ? 0 : asleep ? 0.25 : riding() || travel ? 0.5 : state === 'idle' || state === 'holding' ? 1 : 0.6
    const t = now
    const breath = Math.sin((2 * Math.PI * t) / 3800)
    const lifePose = {
      sy: 0.009 * breath * aliveness,
      sx: -0.004 * breath * aliveness,
      roll: 1.7 * wander[0](t) * aliveness,
      pitch: 1.1 * wander[1](t) * aliveness,
      yaw: 3.2 * wander[2](t) * aliveness,
      bend: 2.2 * wander[3](t) * aliveness,
      nod: 1.4 * wander[4](t) * aliveness,
      z: 4 * wander[5](t) * aliveness,
      x: 1.4 * wander[6](t) * aliveness,
    }
    // Now and then it shifts its weight with a small step.
    let fidgetPose = {}
    if (state === 'idle' && !reduced) {
      if (!fidget.next) fidget.next = now + 4000 + random() * 6000
      if (now >= fidget.next && fidget.start < 0) fidget.start = now
      if (fidget.start >= 0) {
        const u = (now - fidget.start) / 420
        if (u >= 1) {
          fidget.start = -1
          fidget.next = now + 5000 + random() * 7000
        } else fidgetPose = shuffle(now - fidget.start, Math.sin(Math.PI * u))
      }
    }
    const turning = Math.min(1, Math.abs(yawVelocity) / 90)
    const turnPose = !riding() && turning > 0.25 && !reduced ? shuffle(now, turning) : {}

    // Follow-through: the flame tip lags turns and travel, then wobbles to rest.
    stepSpring(body.bend, dt, clamp(-yawVelocity * 0.035 - vx * 0.03 - ax * 0.0012, -14, 14))
    stepSpring(body.nod, dt, clamp(vy * 0.02 + (ride?.nod ?? 0), -10, 10))

    // The arms: the clip's (or out for balance on the board), or reaching for the button's rim.
    const holding = mascotBrain.context === 'page' && ['emerging', 'holding', 'catching'].includes(state)
    const wantGrip = holding && !(state === 'emerging' && travel) && !(state === 'catching' && animator.clip && now - gripRelease > 0)
    stepSpring(body.grip, dt, wantGrip ? 1 : 0)
    const base = {
      ...clipPose,
      yaw: clipPose.yaw + body.yaw.x + lifePose.yaw,
      pitch: clipPose.pitch + body.pitch.x + lifePose.pitch + (ridePose.pitch ?? 0),
      roll: clipPose.roll + lifePose.roll + (ridePose.roll ?? 0) + (fidgetPose.roll ?? 0) + (turnPose.roll ?? 0),
      sx: clipPose.sx + lifePose.sx + (ridePose.sx ?? 0),
      sy: clipPose.sy + lifePose.sy + (ridePose.sy ?? 0),
      y: clipPose.y + (ridePose.y ?? 0) + (fidgetPose.y ?? 0) + (turnPose.y ?? 0),
      x: clipPose.x + lifePose.x * (ride ? 0.4 : 1), // on the board its feet stay on the deck
      z: clipPose.z + lifePose.z * (ride ? 0.4 : 1) + (ridePose.z ?? 0),
      bend: clipPose.bend + body.bend.x + lifePose.bend,
      nod: clipPose.nod + body.nod.x + lifePose.nod,
      legL: clipPose.legL + (fidgetPose.legL ?? 0) + (turnPose.legL ?? 0),
      legR: clipPose.legR + (fidgetPose.legR ?? 0) + (turnPose.legR ?? 0),
      ...(ride?.board ?? {}),
      gazeX: body.gazeX.x,
      gazeY: body.gazeY.x,
      lid: Math.max(body.lid.x, clipPose.lid, blinkLid),
      wide: body.wide.x,
      brow: expression.brow === 'up' ? 1 : expression.brow === 'down' ? -1 : 0,
      closed: expression.eye === 'closed' ? 1 : 0,
    }
    const w = body.grip.x
    let rim = null
    if (w > 0.01) {
      rim = gripTargets(geo)
      for (const [side, key, point] of [[-1, 'L', rim?.left], [1, 'R', rim?.right]]) {
        if (!point) continue
        const reach = reachToward(base, rig.view.camera, side, toSvg(geo, point))
        base[`arm${key}a`] = lerp(base[`arm${key}a`], reach.abduct, w)
        base[`arm${key}f`] = lerp(base[`arm${key}f`], reach.flex, w)
        base[`arm${key}r`] = lerp(base[`arm${key}r`], reach.reach, w)
      }
    }
    // Riding with its hands free, its arms go out for balance and windmill against the lean.
    const balance = ride ? ride.balance * (1 - clamp(pilot.hold.x, 0, 1)) : 0
    if (balance > 0.01) {
      base.armLa = lerp(base.armLa, 68 - ride.counter * 2, balance)
      base.armRa = lerp(base.armRa, 68 + ride.counter * 2, balance)
      base.armLf = lerp(base.armLf, 16, balance)
      base.armRf = lerp(base.armRf, 16, balance)
    }
    // The remote (album): brought up once it stands there, held while it flies the drone.
    const wantRemote = piloting() && !['riding', 'leaving', 'hidden'].includes(state) ? 1 : 0
    const droopWanted = state === 'sleeping' ? 1 : state === 'yawning' ? 0.5 : 0
    if (reduced) {
      resetSpring(pilot.hold, wantRemote)
      resetSpring(pilot.droop, droopWanted)
    } else {
      stepSpring(pilot.hold, dt, wantRemote)
      stepSpring(pilot.droop, dt, droopWanted)
    }
    const hold = clamp(pilot.hold.x, 0, 1)
    if (hold > 0.01) {
      // The sticks: what it is telling the drone this moment (from the flight loop), under
      // springy thumbs. A flinch jerks them; with no drone flying they settle in the middle.
      const told = !reduced && hold > 0.5 && fly.sticks && now - fly.sticks.at < 250 ? fly.sticks : null
      const joltT = (now - pilot.jolt) / 380
      const jolt = joltT >= 0 && joltT < 1 ? Math.sin(Math.PI * joltT) * (1 - joltT) : 0
      for (const key of ['across', 'depth', 'turn', 'climb']) {
        const nudge = key === 'across' ? 0.9 * jolt : key === 'climb' ? -0.6 * jolt : 0
        const value = clamp((told?.[key] ?? 0) + nudge, -1, 1)
        if (reduced) resetSpring(pilot.sticks[key], 0)
        else stepSpring(pilot.sticks[key], dt, value)
      }
      const shakeT = (now - pilot.shakeAt) / timing.shake
      const shake = shakeT >= 0 && shakeT < 1 ? Math.sin(Math.PI * shakeT) : 0
      const wobble = shake ? Math.sin((2 * Math.PI * 8 * (now - pilot.shakeAt)) / 1000) : 0
      stepSpring(pilot.led, dt, told ? clamp(0.4 + Math.hypot(told.across, told.depth, told.turn, told.climb), 0, 1) : 0.12)
      Object.assign(base, {
        remote: hold,
        droop: pilot.droop.x,
        stickLX: pilot.sticks.across.x,
        stickLY: pilot.sticks.depth.x,
        stickRX: pilot.sticks.turn.x,
        stickRY: pilot.sticks.climb.x,
        remoteX: 2.4 * shake * wobble,
        remoteY: 3.2 * jolt + 1.2 * shake,
        remoteRoll: 12 * shake * wobble + 9 * jolt,
        led: pilot.led.x,
        shoulderL: lerp(MASCOT_MODEL.shoulder.angle, REMOTE.shoulder, hold),
        shoulderR: lerp(MASCOT_MODEL.shoulder.angle, REMOTE.shoulder, hold),
      })
    }

    // Arms move as physical limbs too (springs), except when reduced.
    for (const key of ['La', 'Lf', 'Lr', 'Ra', 'Rf', 'Rr']) {
      const value = base[`arm${key}`]
      base[`arm${key}`] = reduced ? resetSpring(arms[key], value).x : stepSpring(arms[key], dt, value)
    }
    // Hands on the remote: solved every frame (no lag), so they stay on its grips however it moves.
    if (hold > 0.01) {
      const onIt = clamp(hold * 2.2, 0, 1)
      const k = onIt * onIt * (3 - 2 * onIt)
      const ik = holdRemote(base)
      for (const key of ['La', 'Lf', 'Lr', 'Ra', 'Rf', 'Rr']) base[`arm${key}`] = lerp(base[`arm${key}`], ik[`arm${key}`], k)
    }

    // The light: the album cursor's soft light, when there is one.
    const light = cursor?.active ? lightToward(MASCOT_MODEL.light, eye, cursor.light) : MASCOT_MODEL.light
    const frame = rig.view.draw(base, { light })
    rig.lastPose = base
    rig.lastLight = light
    rig.lastEye = frame.eye.centre
    rig.lastRemote = frame.remote ? frame.remote.centre : null
    applyPlace()
    mascot.dataset.bodyYaw = String(Math.round(body.yaw.x))
    mascot.dataset.look = look.active ?? look.mode
    const remoteState = hold > 0.95 ? 'held' : hold > 0.05 ? 'moving' : 'none'
    if (mascot.dataset.remote !== remoteState) mascot.dataset.remote = remoteState
    if (hold > 0.01) mascot.dataset.sticks = [pilot.sticks.across.x, pilot.sticks.depth.x, pilot.sticks.turn.x, pilot.sticks.climb.x].map((v) => v.toFixed(2)).join(',')
    const boardState = !ride ? 'none' : riding() || state === 'leaving' ? 'riding' : base.hover < 4 ? 'down' : 'hovering'
    if (mascot.dataset.board !== boardState) mascot.dataset.board = boardState
    if (ride) mascot.dataset.boardPose = [base.hover, base.boardRoll, base.boardPitch, base.boardYaw, base.boardZ, base.glow].map((v) => v.toFixed(2)).join(',')
    if (rig.iris) rig.iris.dataset.gaze = `${body.gazeX.x.toFixed(1)},${body.gazeY.x.toFixed(1)}`
    placeGrip(frame, geo, w)
    return { moving: Boolean(riding() || travel) || animator.clip !== null || aliveness > 0 }
  }

  /** The two points on the button's rim the hands hold: upper left and top. */
  const gripTargets = () => {
    const box = peekButton.getBoundingClientRect()
    if (!box.width) return null
    const r = (peekButton.offsetWidth || box.width) / 2
    const c = { x: box.left + box.width / 2, y: box.top + box.height / 2 }
    const at = (degrees) => ({ x: c.x + r * Math.sin((degrees * Math.PI) / 180), y: c.y - r * Math.cos((degrees * Math.PI) / 180) })
    return { left: at(-42), right: at(6), centre: c }
  }

  /** The mittens over the button's rim, where the hands actually are. */
  const placeGrip = (frame, geo, w) => {
    const shown = w > 0.55 && mascotBrain.context === 'page'
    grip.toggleAttribute('data-shown', shown)
    if (!shown) return
    const ctm = grip.getScreenCTM?.()
    if (!ctm) return
    const inverse = ctm.inverse()
    const button = gripTargets()
    ;[frame.hands.handL, frame.hands.handR].forEach((hand, index) => {
      const screen = toScreen(geo, hand)
      const local = new DOMPoint(screen.x, screen.y).matrixTransform(inverse)
      const centre = button ? new DOMPoint(button.centre.x, button.centre.y).matrixTransform(inverse) : { x: 29, y: 29 }
      // Fingers over the rim, pointing in toward the middle of the button.
      const angle = (Math.atan2(centre.y - local.y, centre.x - local.x) * 180) / Math.PI + 90
      const s = (geo.scale / Math.max(0.01, ctm.a)) * 1.5
      gripHands[index].setAttribute('transform', `translate(${local.x.toFixed(2)} ${local.y.toFixed(2)}) rotate(${angle.toFixed(1)}) scale(${(s * (index ? 1 : -1)).toFixed(3)} ${s.toFixed(3)})`)
    })
  }

  const tickMascot = (now) => {
    mascotFrameId = null
    if (!rig) return
    checkpoint?.('actors-frame')
    const dt = mascotLast ? Math.min(64, now - mascotLast) : 16
    mascotLast = now
    // Breathing alone, with the pointer at rest, only needs every other frame.
    mascotTick += 1
    const calm = !riding() && !travel && animator.clip === null && clock.now() - pointer.at > 1500 && body.grip.x < 0.01
    let moving = true
    if (!calm || mascotTick % 2 === 0) moving = drawMascot(now, calm ? dt * 2 : dt).moving
    if (moving && mascotAlive() && !reducedMotion()) mascotFrameId = life.frame(tickMascot)
    else mascotLast = 0
  }

  const wakeMascot = () => {
    if (mascotFrameId === null && rig) mascotFrameId = life.frame(tickMascot)
  }

  /** Static pose (reduced motion, suspended tab): drawn once, no motion at all. */
  const still = (patch = {}) => {
    stopClip()
    animator.hold()
    travel = null
    board.plan = null
    place.x = 0
    place.y = 0
    resetBoard(0)
    applyExpression(patch, EXPRESSION_DEFAULTS)
    look.mode = 'viewer'
    look.fix = { x: 0, y: 0 }
    for (const spring of Object.values(body)) resetSpring(spring, 0)
    wakeMascot()
  }

  /** Moves the box to `place` now (drawMascot does it every frame; state changes need it at once). */
  const applyPlace = () => {
    mover.style.transform = place.x || place.y ? `translate3d(${place.x.toFixed(2)}px, ${place.y.toFixed(2)}px, 0)` : ''
  }

  const travelTo = (to, duration, { ease = easeOutCubic, arc = 0 } = {}) => {
    board.plan = null
    if (reducedMotion() || duration <= 0) {
      travel = null
      place.x = to.x
      place.y = to.y
      wakeMascot()
      return
    }
    travel = { from: { x: place.x, y: place.y }, to, start: performance.now(), duration, ease, arc }
    wakeMascot()
  }

  /**
   * Rides the board to `x` (px from its spot), starting `delay` ms from now. The board chases an
   * eased path on the flight model, so it lags, banks and overshoots a little as it brakes.
   * `away`: it leaves (speeds up and does not brake). `pace`: the ride's timing (TIMING.ride's
   * form); `dash`: a brisker board (the way back to the left corner). Returns how long until it has
   * come to rest there (0: it is there already).
   */
  const rideTo = (x, { delay = 0, away = false, pace = timing.ride, dash = false } = {}) => {
    travel = null
    const plan = planRide({ from: place.x, to: x, timing: pace, away })
    board.flight.x = place.x
    if (!plan) {
      board.plan = null
      place.x = x
      board.flight.x = x
      board.base = x
      return 0
    }
    board.plan = { ...plan, dash, start: performance.now() + delay }
    board.dir = plan.dir
    wakeMascot()
    return delay + plan.duration + (away ? 0 : timing.rideSettle)
  }

  const startBlinking = () => {
    if (!blink.next) scheduleBlink(performance.now())
  }
  const blinkOnce = () => {
    if (!reducedMotion()) blink.at = performance.now()
    wakeMascot()
  }

  /* ---------------------------------------------------- mascot: layout */
  const layout = { width: 0, height: 0, lift: 0, homeLeft: 16, startX: 0, hideY: 120, sink: 0, covered: false, blocked: false, peekHide: { x: 0, y: 72 } }

  /** Places the mascot under the page-tip curl, behind the pocket button. */
  const placeForPeek = () => {
    remeasureMascot()
    if (mascot.parentElement !== peekClip) peekClip.append(mascot)
    const box = sheet()
    const button = peekButton.getBoundingClientRect()
    const size = peekButton.offsetWidth || 58
    const height = small() ? 46 : 62
    const width = height * MASCOT_ASPECT
    const cx = button.left + button.width / 2
    const cy = button.top + button.height / 2 - box.top
    peekClip.style.top = `${Math.round(cy)}px`
    mascot.style.setProperty('--pocket-mascot-h', `${height}px`)
    // Its body a little left of the button's middle, its eye just over the rim, its feet behind it.
    mascot.style.left = `${Math.round(cx - width / 2 - size * 0.14)}px`
    mascot.style.bottom = `${Math.round(size * 0.1)}px`
    // Hiding place: straight down behind the button, below the clip line at its middle. It rises
    // from there and sinks back there.
    layout.peekHide = { x: 0, y: Math.round(height * 1.15 + size * 0.1) }
  }

  /**
   * The fixed floor (Vodafone's pages: their html and body do not let a sticky one stick) stops at
   * the album's end, as the sticky one did: above the footer once it scrolls into view.
   */
  let floorShift = 0
  const boundFloor = () => {
    if (!fixedFloor) return
    const shift = Math.min(0, Math.round(layerBox().top - window.innerHeight))
    if (shift === floorShift) return
    floorShift = shift
    floor.style.transform = shift ? `translateY(${shift}px)` : ''
    mascotBox = null
  }

  /**
   * How album content sits where the mascot stands. A little: it stands a little lower (its
   * feet below the floor line) so its visible part clears the content. More than 40% of its
   * height would hide the eye: the spot is covered and it tucks away instead (see watchSpot).
   */
  const measureSpot = (line, left) => {
    const from = line.left + left - 6
    const to = line.left + left + layout.width + 6
    const floorLine = Math.min(window.innerHeight, line.top)
    const top = floorLine - layout.height - layout.lift
    let lowest = -Infinity
    for (const node of pocketRoot.querySelectorAll(CONTENT)) {
      if (!node.getClientRects().length) continue
      const box = node.getBoundingClientRect()
      if (box.right > from && box.left < to && box.bottom > top && box.top < floorLine) lowest = Math.max(lowest, box.bottom)
    }
    const needed = Math.ceil(lowest + 6 - top)
    if (needed <= 0) return { sink: 0, covered: false }
    if (needed <= (layout.height + layout.lift) * 0.4) return { sink: needed, covered: false }
    return { sink: 0, covered: true }
  }

  /**
   * Measures the album floor: where it stands (its visible right edge on the content's right
   * margin, which the drone's home shares), where it starts (behind where the button was), and
   * how far down it hides.
   */
  const measureFloor = () => {
    remeasureMascot()
    boundFloor()
    if (mascot.parentElement !== stage) stage.append(mascot)
    mascot.style.removeProperty('--pocket-mascot-h')
    mascot.style.bottom = '0px'
    const line = stage.getBoundingClientRect()
    layout.width = mascot.offsetWidth
    layout.height = mascot.offsetHeight
    // On its board it stands higher than its box: the lift, at the top of its bob.
    layout.lift = Math.ceil(((BOARD.hover + BOARD.thickness - BOARD.feet + timing.boardWander[1]) * layout.width) / SVG_W)
    const button = small() ? 16 + 26 : 22 + 29 // where the button's middle was, from the right edge
    let start = line.width - button - layout.width / 2
    if (leftCorner) {
      // From the button itself, at the bottom-left (it is fading out, round its middle).
      const box = peekButton.getBoundingClientRect()
      start = (box.width ? box.left + box.width / 2 - line.left : button) - layout.width / 2
    }
    const edge = contentEdge() - line.left
    // Its visible edge on the content's edge: the right one (its right inset), or the left one (its left inset).
    const homeFor = () => clamp(leftSide ? edge - layout.width * insets.mascotLeft : edge - layout.width * (1 - insets.mascot), 0, Math.max(0, line.width - layout.width))
    // Standing there it turns toward the cards (as aim() has it); measure its right edge in that pose.
    const cards = cardsPoint()
    const eye = { x: line.left + homeFor() + layout.width * 0.5, y: line.top - layout.height * 0.47 - layout.lift }
    const toCards = cards ? facing(eye, cards) : { yaw: 0, pitch: 0 }
    measureMascotInset(clamp(toCards.yaw, -timing.bodyMaxTurn, timing.bodyMaxTurn), clamp(-0.12 * toCards.pitch, -6, 3))
    let home = homeFor()
    // Fixed controls (Vodafone's accessibility button, the guide's): it keeps 16 px from each, moving
    // in toward the content only as far as that takes; with no room it tucks away.
    layout.blocked = false
    const boxes = fixedBoxes()
    if (boxes.length) {
      const floorLine = Math.min(window.innerHeight, line.top)
      const drawn = { left: line.left + home + layout.width * insets.mascotLeft, right: line.left + home + layout.width * (1 - insets.mascot), top: floorLine - layout.height - layout.lift, bottom: floorLine }
      const inset = insetForObstacles(drawn, boxes, OBSTACLE_PAD, { min: line.left + 8, max: line.right - 8, toward: inward })
      home = clamp(home + inset.dx, 0, Math.max(0, line.width - layout.width))
      layout.blocked = !inset.clear
    }
    // Cards where it stands: it stands a little lower, or tucks away (it keeps to the margin).
    const spot = measureSpot(line, home)
    layout.homeLeft = Math.round(home)
    layout.startX = Math.round(start - home)
    layout.hideY = Math.round((layout.height + layout.lift) * 1.12)
    layout.sink = spot.sink
    layout.covered = spot.covered || layout.blocked
    mascot.style.left = `${layout.homeLeft}px`
    mascot.style.bottom = `${-layout.sink}px`
  }

  /* ------------------------------------------------------ mascot: brain */
  /** Flies the drone up again once the pilot has the sticks (it woke, or it has ridden in). */
  let takeOffTimer = null
  const takeOffSoon = (delay) => {
    if (!visit || !DRONE_GROUNDED.has(droneBrain.state) || droneBrain.state === 'taking-off') return
    visit.clearTimeout(takeOffTimer)
    takeOffTimer = visit.timeout(() => {
      takeOffTimer = null
      fly.openParked = false
      if (droneBrain.takeOff()) wakeMascot()
    }, delay)
  }

  const mascotBrain = createMascotBrain({
    clock,
    timing,
    reduced: reducedMotion,
    // Before it dozes, a pilot lands its drone beside it (when it is flying on screen and there is
    // a free spot); the doze waits that long.
    parkFor: () => {
      if (!visit || !piloting() || !fly.onScreen || reducedMotion() || !['home-hover', 'curious', 'following', 'returning-home'].includes(droneBrain.state)) return 0
      const spot = parkingSpot()
      if (!spot) return 0
      fly.spot = spot.flight
      return timing.droneLand + 250
    },
    onChange: (state, previous, info) => {
      mascot.dataset.mascotState = state
      if (!rig) return
      const reduced = reducedMotion()
      // The pilot takes the sticks again: the drone goes back up.
      if (state === 'waking') takeOffSoon(timing.wake * 0.45)
      if (state === 'idle' && DRONE_GROUNDED.has(droneBrain.state)) takeOffSoon(previous === 'riding' || fly.openParked ? timing.remoteRaise : 120)
      if (state === 'tucked') takeOffSoon(0)
      switch (state) {
        case 'hidden':
          stopClip()
          board.plan = null
          travel = null
          gripRelease = Infinity
          peekButton.removeAttribute('data-actor-hold')
          resetSpring(body.grip, 0)
          grip.removeAttribute('data-shown')
          if (info.reset || info.instant) placeForPeek()
          place.x = layout.peekHide.x
          place.y = layout.peekHide.y
          applyPlace()
          look.mode = 'cursor'
          return
        case 'emerging':
          placeForPeek()
          place.x = layout.peekHide.x
          place.y = layout.peekHide.y
          // In this same frame: it turns visible now, and must not show at its last place first.
          applyPlace()
          resetSpring(body.yaw, leftCorner ? 30 : -30)
          // Straight up from behind the button, a small pop past the rim, settling onto it.
          travelTo({ x: 0, y: 0 }, timing.emerge * 0.75, { ease: easeOutBack })
          play('emerge', { duration: timing.emerge })
          startBlinking()
          return
        case 'holding':
          if (previous === 'slipping') travelTo({ x: 0, y: 0 }, timing.emerge * 0.6, { ease: easeOutCubic })
          play('hold')
          gripRelease = Infinity
          peekButton.setAttribute('data-actor-hold', '')
          return
        case 'catching':
          play('catch', { duration: timing.catch })
          // The item has dropped in: the pocket closes under its hands, then it lets go.
          peekButton.removeAttribute('data-actor-hold')
          gripRelease = performance.now() + timing.catch * 0.55
          return
        case 'slipping':
          peekButton.removeAttribute('data-actor-hold')
          gripRelease = performance.now()
          // Down a little faster than the beat, so it is wholly behind the button before it hides.
          travelTo(layout.peekHide, (info.quick ? timing.quickSlip : timing.slip) * 0.85, { ease: easeInCubic })
          play('slip', { duration: info.quick ? timing.quickSlip : timing.slip })
          return
        case 'riding':
          stopClip()
          animator.hold()
          applyExpression({}, EXPRESSION_DEFAULTS)
          look.mode = 'ride'
          startBlinking()
          return
        case 'leaving':
          // It lowers the remote and rides off toward the corner.
          stopClip()
          applyExpression({}, EXPRESSION_DEFAULTS)
          look.mode = 'ride'
          if (leftCorner) {
            // Back across to the corner, in time for the page landing over it, and down behind
            // where the button comes back.
            const until = rideTo(layout.startX, { pace: DASH_PACE, dash: true })
            visit?.timeout(() => {
              if (mascotBrain.state !== 'leaving') return
              board.base = layout.startX // it stays in the corner (the board hovers where it sank)
              travelTo({ x: layout.startX, y: layout.hideY }, 240, { ease: easeInCubic })
            }, Math.max(0, until - timing.rideSettle))
          } else rideTo(layout.startX + layout.width, { away: true })
          return
        case 'tucked':
          if (reduced || info.instant) {
            still()
            place.y = layout.hideY
            return
          }
          travelTo({ x: 0, y: layout.hideY }, timing.tuck, { ease: easeInCubic })
          play('tuck', { duration: timing.tuck })
          return
        case 'idle':
          if (reduced || info.instant) {
            still()
            return
          }
          if (info.from === 'tucked') {
            travelTo({ x: 0, y: 0 }, timing.untuck, { ease: easeOutCubic, arc: 4 })
            play('untuck', { duration: timing.untuck })
          } else if (!['flinching', 'waking'].includes(previous)) {
            stopClip()
            animator.play({ pose: {} }, performance.now(), 200)
            applyExpression({}, EXPRESSION_DEFAULTS)
          }
          look.mode = 'cursor'
          startBlinking()
          if (info.quiet) blinkOnce()
          return
        case 'flinching':
          play('flinch', { duration: timing.flinch })
          return
        case 'waking':
          play('wake', { duration: timing.wake })
          return
        case 'parking':
          // It lands the drone beside it (its eye on the drone; see look.active).
          if (!fly.spot || !droneBrain.park()) visit?.timeout(() => mascotBrain.parked(), 0)
          wakeMascot()
          return
        case 'yawning':
          play('yawn', { duration: timing.yawn })
          return
        case 'sleeping':
          play('sleep', { cycles: timing.zzzCycles })
          return
        default:
      }
    },
  })

  /* ======================================================== the drone */
  const rest = restDronePose()
  const flight = createFlight(rest.yaw)
  const fly = { frame: null, last: 0, spin: 0, path: null, home: null, onScreen: true, mode: null, toward: null, follow: null, hop: null, slack: null, regions: [], obstacles: [], heartStart: 0, trailLength: 0, queue: [], sticks: null, spot: null, grounded: false, takeOffAt: 0, openParked: false, layerBox: null }
  const droneWander = Array.from({ length: 4 }, (_, i) => createWander(random, { hz: [0.11, 0.08, 0.06, 0.05][i] }))

  const droneLive = () => droneView && !drone.hidden && !document.hidden && fly.onScreen && !reducedMotion()

  /** Where the drone is heading this frame (px from home) and which way it faces. */
  const droneTarget = (now) => {
    const state = droneBrain.state
    const [ax, ay, az] = timing.droneWander
    const slack = fly.slack ?? { left: ax, right: ax, up: ay, down: ay }
    // Across, it drifts a few px either side of the margin line (a little more inward than out);
    // nearer the viewer it draws bigger, so it moves in by that much to keep its edge on the line.
    const z = az * droneWander[2](now)
    const grow = (Math.max(0, z) * (anchor?.rect.width ?? 0)) / 520
    const hover = {
      x: clamp(-inward * (ax * (0.4 * droneWander[0](now) - 0.1) - grow), -slack.left, slack.right),
      y: clamp(ay * droneWander[1](now), -slack.up, slack.down),
      z,
    }
    const heading = rest.yaw + 14 * droneWander[3](now)
    const towardPointer = (target) => {
      if (!fly.home || !target) return heading
      const dx = target.x - (fly.home.x + flight.x)
      return clamp(rest.yaw + dx * 0.12, rest.yaw - 40, rest.yaw + 40)
    }
    switch (state) {
      case 'curious': {
        const t = fly.toward
        const length = t ? Math.hypot(t.x, t.y) : 0
        return { target: { x: hover.x * 0.3 + (length ? (t.x / length) * 6 : 0), y: hover.y * 0.3 + (length ? (t.y / length) * 4 : 0), z: 10 }, heading: t ? clamp(rest.yaw + t.x * 0.35, rest.yaw - 45, rest.yaw + 45) : heading }
      }
      case 'following':
        // Better damped than its hover, so it never drifts onto the cursor it is keeping company.
        return { target: fly.follow ? { ...fly.follow, z: 8 } : hover, heading: towardPointer(cursor?.pointer), options: { frequency: 0.8, damping: 0.95 } }
      case 'evading': {
        const t = clamp((now - fly.hop.start) / timing.droneHop, 0, 1)
        const up = Math.sin(Math.PI * t)
        return { target: { x: 9 * inward * up, y: -12 * up, z: 6 * up }, heading: fly.hop.yaw + 360 * easeInOutSine(t), options: { continuous: true, heading: { frequency: 3, damping: 0.9 } } }
      }
      case 'dragging':
        return { target: fly.drag ?? { x: flight.x, y: flight.y }, heading: rest.yaw + clamp(flight.vx * 0.05, -40, 40), options: { frequency: 3.2, damping: 0.9, maxAccel: 9000 } }
      case 'landing':
        // Down to the spot beside the mascot, steadily (no overshoot into the floor).
        return { target: fly.spot ? { x: fly.spot.x, y: fly.spot.y, z: 0 } : { x: 0, y: 0, z: 0 }, heading: rest.yaw, options: { frequency: 0.7, damping: 1, maxAccel: 1300 } }
      case 'taking-off':
        return { target: { x: hover.x * 0.3, y: hover.y * 0.3, z: 0 }, heading: rest.yaw, options: { frequency: 0.95, damping: 0.92 } }
      case 'entering':
      case 'closing':
        return { target: { x: 0, y: 0, z: 0 }, heading: rest.yaw }
      default:
        return { target: hover, heading }
    }
  }

  const flightFrame = (now) => {
    fly.frame = null
    if (!droneView) return
    const dt = fly.last ? Math.min(64, now - fly.last) : 16
    fly.last = now
    const state = droneBrain.state
    // What the pilot commands this frame (the sticks show it); the drone answers `pilotLead` later.
    let told = null
    if (state === 'drawing-heart' && fly.path) {
      const t = clamp((now - fly.heartStart) / timing.droneHeart, 0, 1)
      const point = sampleFlight(fly.path, easeInOutSine(t))
      const heading = rest.yaw + Math.cos(point.angle) * 55
      followPoint(flight, dt, { x: point.x - fly.home.x, y: point.y - fly.home.y, z: 0 }, heading)
      const heart = fly.path.heart
      const progress = clamp((point.s - heart.start) / (heart.end - heart.start || 1), 0, 1)
      trailReveal.style.strokeDashoffset = String(fly.trailLength * (1 - progress))
      told = { ...heartPull(now + timing.pilotLead), headingError: 0 }
    } else if (state === 'landed' || (state === 'closing' && fly.grounded)) {
      // On the floor beside the mascot: rotors run down to a stop.
      if (fly.spot) Object.assign(flight, { x: fly.spot.x, y: fly.spot.y, z: 0, vx: 0, vy: 0, vz: 0, ax: 0, ay: 0, az: 0 })
      spool(flight, dt, 0)
      told = { ax: 0, ay: 0, az: 0, headingError: 0 }
    } else if (state === 'taking-off' && now - fly.takeOffAt < timing.droneSpool) {
      // Throttle up: the rotors spin up on the ground before it lifts.
      spool(flight, dt, FLIGHT.rpm.idle * 1.3)
      told = { ax: 0, ay: -timing.stickRange[0] * 0.7, az: 0, headingError: 0 }
    } else {
      const wanted = droneTarget(now)
      fly.queue.push({ t: now, ...wanted })
      // A drag is the person's hand, not the pilot's: no delay then.
      const lead = state === 'dragging' ? 0 : timing.pilotLead
      while (fly.queue.length > 1 && fly.queue[1].t <= now - lead) fly.queue.shift()
      const applied = fly.queue[0]
      stepFlight(flight, dt, applied.target, applied.heading, applied.options)
      // Dragged away, the pilot still tries to fly it home: the sticks fight the hand.
      const goal = state === 'dragging' ? { target: { x: 0, y: 0, z: 0 }, heading: rest.yaw, options: {} } : wanted
      told = { ...command(flight, goal.target, goal.options ?? {}), headingError: angleDelta(flight.yaw.x, goal.heading) }
    }
    fly.sticks = { ...sticksFor(told, told.headingError, timing.stickRange), at: now }
    fly.spin = (fly.spin + dt * flight.rpm.x) % 360
    const light = cursor?.active && fly.home ? lightToward(DRONE_LIGHT, droneCentre(), cursor.light, 0.6) : DRONE_LIGHT
    droneView.draw({ yaw: flight.yaw.x, pitch: flight.pitch.x, roll: flight.roll.x }, fly.spin, { light })
    applyFlight(dt)
    // Parked with its rotors stopped there is nothing left to draw until it is flown again.
    const resting = state === 'landed' && flight.rpm.x < 0.02
    if (droneLive() && !resting) fly.frame = life.frame(flightFrame)
    else fly.last = 0
  }

  /** The heart's pull on the drone at `at` (ms): its path's acceleration, for the pilot's sticks. */
  const heartPull = (at) => {
    const h = 40
    const point = (time) => sampleFlight(fly.path, easeInOutSine(clamp((time - fly.heartStart) / timing.droneHeart, 0, 1)))
    const a = point(at - h)
    const b = point(at)
    const c = point(at + h)
    const s2 = (h / 1000) ** 2
    return { ax: (a.x - 2 * b.x + c.x) / s2, ay: (a.y - 2 * b.y + c.y) / s2, az: 0 }
  }

  /** The drone layer's box on screen (it scrolls with the album), read once per scroll or layout. */
  const layerBox = () => {
    if (!fly.layerBox) {
      const box = layer.getBoundingClientRect()
      fly.layerBox = { left: box.left, top: box.top }
    }
    return fly.layerBox
  }

  /** Its home on screen now. */
  const homeOnScreen = () => {
    if (!fly.home) return null
    const box = layerBox()
    return { x: box.left + fly.home.x, y: box.top + fly.home.y }
  }

  const droneCentre = () => {
    const home = homeOnScreen()
    return home ? { x: home.x + flight.x, y: home.y + flight.y } : null
  }

  /**
   * The spot on the floor beside the mascot where it lands the drone, or null when there is no
   * free one (content, a floating button or the window edge in the way). `sides`: 'left' and/or
   * 'right' (physical), the side toward the content first by default. The drone's visible edge stays
   * 10 px from the mascot's.
   */
  const parkingSpot = (sides = inwardFirst) => {
    if (!anchor || !fly.home || small() || !layout.width) return null
    if (mascot.hasAttribute('data-covered')) return null
    const line = stage.getBoundingClientRect()
    const box = layerBox()
    const w = anchor.rect.width
    const h = anchor.rect.height
    const mascotLeft = line.left + layout.homeLeft
    const floorY = line.top - (layout.sink ?? 0) - layout.height * 0.02 // where its feet are
    const top = floorY - h * (1 - insets.droneBottom)
    const gap = 10
    const lefts = {
      left: mascotLeft + layout.width * insets.mascotLeft - gap - w * (1 - insets.droneLeft),
      right: mascotLeft + layout.width * (1 - insets.mascot) + gap - w * insets.droneLeft,
    }
    const viewportWidth = document.documentElement.clientWidth
    const blockers = [...pocketRoot.querySelectorAll(CONTENT)].map((node) => node.getBoundingClientRect()).filter((b) => b.width && b.height)
    for (const selector of ['#vodafone-aw-icon', 'vg-guide', '.pocket-peek']) {
      const node = document.querySelector(selector)
      if (node?.getClientRects().length && getComputedStyle(node).visibility !== 'hidden') blockers.push(node.getBoundingClientRect())
    }
    blockers.push(...fixedBoxes())
    for (const side of sides) {
      const left = lefts[side]
      const spot = { left, top, right: left + w, bottom: top + h }
      if (spot.left < 8 || spot.right > viewportWidth - 8 || spot.top < 0) continue
      if (blockers.some((b) => b.left < spot.right + 6 && b.right > spot.left - 6 && b.top < spot.bottom + 6 && b.bottom > spot.top - 6)) continue
      return { side, screen: { x: spot.left, y: spot.top }, flight: { x: spot.left - (box.left + anchor.rect.left), y: spot.top - (box.top + anchor.rect.top) } }
    }
    return null
  }

  // Where the light throws its shadow, eased so it glides (the light switching on, a drag).
  const cast = { x: createSpring(8, { frequency: 3, damping: 1 }), y: createSpring(6, { frequency: 3, damping: 1 }) }

  /** Moves the drone and its shadows to `flight`; `dt` (ms) eases the shadow's direction. */
  const applyFlight = (dt = 0) => {
    const depth = 1 + flight.z / 260
    drone.style.transform = `translate3d(${flight.x.toFixed(1)}px, ${flight.y.toFixed(1)}px, 0) scale(${depth.toFixed(3)})`
    // Its shadow on the page: below it, cast away from the light, softer when it is higher.
    let sx = 8
    let sy = 6
    if (cursor?.active && fly.home) {
      const c = droneCentre()
      const dx = c.x - cursor.light.x
      const dy = c.y - cursor.light.y
      const d = Math.hypot(dx, dy) || 1
      const push = clamp(26 - d / 40, 6, 22)
      // With the light right on it (dragging, pointing at it) "away from the light" has no
      // direction: ease back to the resting one so the shadow cannot flip about.
      const sure = clamp(d / 70, 0, 1)
      sx = lerp(sx, (dx / d) * push, sure)
      sy = lerp(sy, (dy / d) * push * 0.6 + 4, sure)
    }
    // The page is behind it, so its shadow there goes wherever it goes, every pixel of the way.
    // How far it falls from the drone (and how big and soft it is) depends only on how far the
    // drone stands off the page: hovering toward the viewer (z) throws it further.
    const standoff = clamp(1 + flight.z / 40, 0.6, 1.5)
    if (dt > 0 && !reducedMotion()) {
      sx = stepSpring(cast.x, dt, sx)
      sy = stepSpring(cast.y, dt, sy)
    } else {
      resetSpring(cast.x, sx)
      resetSpring(cast.y, sy)
    }
    const page = {
      x: flight.x + sx * standoff,
      y: flight.y + sy * standoff,
      scale: depth * (0.9 + 0.1 * standoff),
      opacity: clamp(1.05 - 0.25 * standoff, 0.55, 0.9),
    }
    // Near the floor (landing, parked, taking off) a contact shadow on the floor takes over: right
    // under it, sharper and darker the lower it is, gone by `groundReach` px up.
    let ground = 0
    let floorY = 0
    if (fly.spot && (DRONE_GROUNDED.has(droneBrain.state) || (droneBrain.state === 'closing' && fly.grounded))) {
      const h = anchor?.rect.height ?? 0
      floorY = fly.spot.y + h * (0.1 - insets.droneBottom) - 4
      const height = Math.max(0, fly.spot.y - flight.y)
      const near = clamp(1 - height / timing.groundReach, 0, 1)
      ground = near * near * (3 - 2 * near)
    }
    droneShadow.style.transform = `translate3d(${page.x.toFixed(1)}px, ${page.y.toFixed(1)}px, 0) scale(${page.scale.toFixed(3)})`
    droneShadow.style.opacity = String((page.opacity * (1 - ground)).toFixed(2))
    groundShadow.style.transform = `translate3d(${flight.x.toFixed(1)}px, ${floorY.toFixed(1)}px, 0) scale(${(0.7 + 0.35 * ground).toFixed(3)})`
    groundShadow.style.opacity = String(ground.toFixed(2))
  }

  const startDrone = () => {
    if (fly.frame === null && droneLive()) fly.frame = life.frame(flightFrame)
  }

  /** Back on its home at rest (and drawn once, for a still or reduced-motion drone). */
  const land = () => {
    fly.queue = []
    Object.assign(flight, { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, ax: 0, ay: 0, az: 0 })
    resetSpring(flight.roll, 0)
    resetSpring(flight.pitch, 0)
    resetSpring(flight.yaw, rest.yaw)
    applyFlight()
    droneView?.draw({ yaw: rest.yaw, pitch: 0, roll: 0 }, fly.spin)
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
  const droneBrain = createDroneBrain({
    clock,
    timing,
    reduced: reducedMotion,
    onChange: (state, previous, info) => {
      drone.dataset.droneState = state
      if (state === 'landed') {
        fly.grounded = true
        if (info.instant && fly.spot) {
          // Waiting on the floor (the pocket opened): rotors still.
          Object.assign(flight, { x: fly.spot.x, y: fly.spot.y, z: 0, vx: 0, vy: 0, vz: 0, ax: 0, ay: 0, az: 0 })
          resetSpring(flight.rpm, 0)
          resetSpring(flight.roll, 0)
          resetSpring(flight.pitch, 0)
          resetSpring(flight.yaw, rest.yaw)
          applyFlight()
          droneView?.draw({ yaw: rest.yaw, pitch: 0, roll: 0 }, fly.spin)
        }
        // Down: the pilot can doze now.
        if (mascotBrain.state === 'parking') mascotBrain.parked()
        startDrone()
        return
      }
      if (state === 'landing') {
        fly.grounded = false
        startDrone()
        return
      }
      if (state === 'taking-off') {
        fly.grounded = false
        fly.takeOffAt = performance.now()
        startDrone()
        return
      }
      if (state === 'closing') {
        fly.grounded = DRONE_GROUNDED.has(previous)
        hideTrail()
        startDrone()
        return
      }
      fly.grounded = false
      if (state === 'dragging') {
        // Dragged away: the pilot fights the sticks, then shakes the remote and peers at it.
        visit?.timeout(() => {
          if (droneBrain.state === 'dragging' && piloting()) {
            pilot.shakeAt = performance.now()
            wakeMascot()
          }
        }, timing.fightFor)
      }
      if (state === 'hidden') {
        fly.spot = null
        fly.openParked = false
        land()
        hideTrail()
        drone.hidden = true
        droneShadow.hidden = true
        groundShadow.hidden = true
        return
      }
      if (state === 'entering' || (state === 'home-hover' && info.instant)) {
        land()
        startDrone()
        return
      }
      if (state === 'drawing-heart' && fly.path) {
        const heart = fly.path.heart
        trailLine.setAttribute('d', heart.d)
        trailReveal.setAttribute('d', heart.d)
        fly.trailLength = trailReveal.getTotalLength?.() || heart.end - heart.start
        trailReveal.style.strokeDasharray = `${fly.trailLength} ${fly.trailLength}`
        trailReveal.style.strokeDashoffset = String(fly.trailLength)
        trail.setAttribute('data-shown', '')
        trail.removeAttribute('data-fading')
        fly.heartStart = performance.now()
        // Its first point is home: start the scripted flight from where it is now.
        startDrone()
        return
      }
      if (state === 'returning-home' && info.from === 'heart') trailTimer = life.timeout(() => hideTrail({ fade: true }), timing.heartLinger)
      if (state === 'returning-home' && info.cause === 'relayout') hideTrail()
      if (state === 'evading') fly.hop = { start: performance.now(), yaw: flight.yaw.x }
      if (previous === 'evading' && state !== 'evading') {
        flight.yaw.x -= 360
        flight.yaw.target -= 360
      }
      if (state !== 'following') fly.follow = null
      if (state === 'closing') hideTrail()
      startDrone()
    },
  })

  /* -------------------------------------------------------- drone: layout */
  let anchor = null

  /**
   * Picks a collision-free home for the drone in an upper corner on their side (the gutter on that
   * side next when the band above the cards has no room), room for the heart, how far it may
   * drift, and where it may fly to follow the cursor.
   */
  const measureDrone = () => {
    if (small()) return null // phones: the mascot carries the character; the control bar stays clear
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
    const cards = [...pocketRoot.querySelectorAll('.pocket-grid__item')].map(local).filter(Boolean)
    const rowTop = Math.min(...cards.map((r) => r.top), local(q('.pocket-empty'))?.top ?? Infinity)
    // "Empty pocket" is destructive: the drone keeps at least 24 px from it (16 here + the 8 px margin).
    const clearZone = clear ? rect(clear.left - 16, clear.top - 16, clear.width + 32, clear.height + 32) : null
    const heads = [...pocketRoot.querySelectorAll('.pocket-group__head')].map(local).filter(Boolean)
    const obstacles = [back, clearZone, local(q('.pocket-view__mark')), local(q('#pocket-title')), local(q('.pocket-view__lead')), local(q('.pocket-empty')), ...heads, ...cards.filter((r) => r.top < rowTop + 8)].filter(Boolean)
    // Fixed controls (options.obstacles), in the layer's terms as it lies now: its drift and its
    // flights stop short of them; they never move its home.
    const fixed = fixedBoxes().map((o) => rect(o.left - box.left, o.top - box.top, o.right - o.left, o.bottom - o.top))
    const viewportWidth = document.documentElement.clientWidth
    const bounds = rect(8 - box.left, view.top + 4, viewportWidth - 16, Math.max(0, (Number.isFinite(rowTop) ? rowTop : view.bottom) - view.top))
    const w = drone.offsetWidth
    const h = drone.offsetHeight
    measureDroneInset()
    const bandTop = bar.bottom + 4
    const bandBottom = Number.isFinite(rowTop) ? rowTop - 6 : bar.bottom + 120
    const rightGutter = viewportWidth - box.left - inner.right
    const leftGutter = inner.left + box.left
    const mascotWidth = mascot.offsetWidth || 80
    const bandMiddle = (bandTop + bandBottom) / 2 - h / 2
    const band = { top: bandTop, bottom: bandBottom }
    // Its visible edge on the content's margin on their side (as "Empty pocket" above it): the right
    // one, or the left one for a right-to-left album.
    const upper = leftSide
      ? { name: 'upper-left', rect: rect(inner.left - w * insets.droneLeft, bandMiddle, w, h), band }
      : { name: 'upper-right', rect: rect(inner.right - w * (1 - insets.drone), bandMiddle, w, h), band }
    // In the gutter on their side it hovers level with the band above the cards (below the bar), so
    // its flights pass under "Empty pocket" rather than through it.
    const endGutter = leftSide
      ? leftGutter >= w + 24 ? { name: 'left-gutter', rect: rect(inner.left - leftGutter + (leftGutter - w) / 2, bandMiddle, w, h), band, end: true } : null
      : rightGutter >= w + 24 ? { name: 'right-gutter', rect: rect(inner.right + (rightGutter - w) / 2, bandMiddle, w, h), band, end: true } : null
    // The gutter on the far side, level with the bar.
    const farGutter = leftSide
      ? rightGutter >= w + 24 ? { name: 'right-gutter', rect: rect(inner.right + (rightGutter - w) / 2, bar.top, w, h), band: { top: bar.top, bottom: bandBottom } } : null
      : leftGutter >= w + 24 ? { name: 'left-gutter', rect: rect(inner.left - leftGutter + (leftGutter - w) / 2, bar.top, w, h), band: { top: bar.top, bottom: bandBottom } } : null
    // The margin first; the gutters only when the band above the cards has no room.
    const candidates = [upper, endGutter, farGutter]
    const choice = chooseAnchor({ candidates, obstacles, bounds, margin: 8 })
    if (!choice) return null
    // How far it may drift each way without nearing anything.
    const free = (dx, dy) => {
      const moved = rect(choice.rect.left + dx, choice.rect.top + dy, w, h)
      return obstacles.every((o) => !rectsOverlap(moved, o, 8)) && fixed.every((o) => !rectsOverlap(moved, o, 8)) && moved.left >= bounds.left && moved.right <= bounds.right && moved.top >= bounds.top - 40
    }
    const room = (sx, sy, max) => {
      let d = 0
      while (d < max && free(sx * (d + 1), sy * (d + 1))) d += 1
      return d
    }
    // It also grows a little when it drifts toward the viewer (depth): keep that inside the margin too.
    const [ax, ay, az] = timing.droneWander
    const growX = Math.ceil((w * az) / 260 / 2) + 1
    const growY = Math.ceil((h * az) / 260 / 2) + 1
    const slack = { left: Math.max(0, room(-1, 0, ax + growX) - growX), right: Math.max(0, room(1, 0, ax + growX) - growX), up: Math.max(0, room(0, -1, ay + growY) - growY), down: Math.max(0, room(0, 1, ay + growY) - growY) }
    // Where it may fly to keep the cursor company: the open band above the cards, the gutter.
    let regions = []
    const gutterHeight = Math.max(0, window.innerHeight - box.top - (mascotWidth * 1.25 + 40) - h - bar.top)
    if (Number.isFinite(rowTop) && rowTop - bar.bottom > h + 20) {
      // The open band above the cards, out to the window's edge on their side.
      const from = leftSide ? 8 - box.left : inner.left
      const to = leftSide ? inner.right - w : viewportWidth - box.left - 8 - w
      regions.push(rect(from, bar.bottom + 8, to - from, rowTop - 8 - h - (bar.bottom + 8)))
    }
    // The gutter on their side, down to above the mascot.
    if (!leftSide && rightGutter >= w + 16) regions.push(rect(inner.right + 8, bar.top, rightGutter - w - 16, gutterHeight))
    if (leftSide && leftGutter >= w + 16) regions.push(rect(8 - box.left, bar.top, leftGutter - w - 16, gutterHeight))
    if (fixed.length) regions = regions.map((region) => stopAbove(region, fixed, { w, h }, 8)).filter(Boolean)
    // The heart may use the clear canvas of both top rows (from the gutter: below the bar, so it
    // is not walled in by "Empty pocket"); every point of the flight is checked.
    const sky = { top: choice.end ? bar.bottom + 6 : view.top + 8, bottom: Number.isFinite(rowTop) ? rowTop - 8 : bandBottom }
    // The heart is a brief flight: it only has to clear "Empty pocket" itself, not the resting margin.
    const allObstacles = [...obstacles.filter((obstacle) => obstacle !== clearZone), clear, ...cards, ...fixed].filter(Boolean)
    const heart = planHeart({ home: choice.rect, band: sky, obstacles: allObstacles, bounds, drone: { w, h }, max: timing.heartMax, toward: inward })
    return { ...choice, heart, slack, regions, obstacles: [...obstacles, ...fixed], layerBox: { left: box.left, top: box.top } }
  }

  const placeDrone = () => {
    drone.hidden = false // measurable (still under the turning page, or about to move in this frame)
    anchor = measureDrone()
    drone.dataset.droneAnchor = anchor?.name ?? 'none'
    if (!anchor) {
      drone.hidden = true
      droneShadow.hidden = true
      groundShadow.hidden = true
      fly.path = null
      return
    }
    drone.hidden = false
    droneShadow.hidden = false
    groundShadow.hidden = false
    drone.style.left = `${Math.round(anchor.rect.left)}px`
    drone.style.top = `${Math.round(anchor.rect.top)}px`
    const w = anchor.rect.width
    // Both shadows start under the drone at home; applyFlight moves them with it.
    for (const shadow of [droneShadow, groundShadow]) {
      shadow.style.left = `${Math.round(anchor.rect.left + w * 0.2)}px`
      shadow.style.top = `${Math.round(anchor.rect.top + anchor.rect.height * 0.9)}px`
      shadow.style.width = `${Math.round(w * 0.6)}px`
    }
    fly.home = { x: anchor.rect.left + w / 2, y: anchor.rect.top + anchor.rect.height / 2 }
    fly.layerBox = { ...anchor.layerBox }
    fly.slack = anchor.slack
    fly.regions = anchor.regions
    fly.obstacles = anchor.obstacles
    if (anchor.heart) {
      fly.path = anchor.heart.flight
      const inked = fly.path.points.slice(fly.path.heart.from, fly.path.heart.to + 1)
      const xs = inked.map((p) => p.x)
      const ys = inked.map((p) => p.y)
      const pad = 12
      const x = Math.min(...xs) - pad
      const y = Math.min(...ys) - pad
      const width = Math.max(...xs) - x + pad
      const height = Math.max(...ys) - y + pad
      trail.setAttribute('viewBox', `${x} ${y} ${width} ${height}`)
      for (const [key, value] of Object.entries({ x, y, width, height })) trailMask.setAttribute(key, String(value))
      Object.assign(trail.style, { left: `${x}px`, top: `${y}px`, width: `${width}px`, height: `${height}px` })
    } else {
      fly.path = null
    }
  }

  /** Where the drone flies to keep the cursor company: a little way off it, in open space. */
  const followTarget = (point) => {
    if (!anchor || !fly.regions.length) return null
    const { left: lx, top: ty } = layerBox()
    const w = anchor.rect.width
    const h = anchor.rect.height
    // A point `droneFollowGap` px beyond its edge from the cursor, on the side toward home.
    const { x: homeX, y: homeY } = homeOnScreen()
    const dx = homeX - point.x
    const dy = homeY - point.y
    const d = Math.hypot(dx, dy) || 1
    const gap = timing.droneFollowGap + Math.max(w, h) / 2
    let x = point.x + (dx / d) * gap - lx - w / 2
    let y = point.y + (dy / d) * gap - ty - h / 2
    // Into the nearest open region.
    let best = null
    for (const region of fly.regions) {
      const cx = clamp(x, region.left, region.left + Math.max(0, region.width))
      const cy = clamp(y, region.top, region.top + Math.max(0, region.height))
      const cost = Math.hypot(cx - x, cy - y)
      if (!best || cost < best.cost) best = { x: cx, y: cy, cost }
    }
    if (!best) return null
    // The nearest free spot round it (inside a region, clear of everything with a margin).
    const inside = (sx, sy) => fly.regions.some((r) => sx >= r.left - 0.5 && sx <= r.left + Math.max(0, r.width) + 0.5 && sy >= r.top - 0.5 && sy <= r.top + Math.max(0, r.height) + 0.5)
    const clearAt = (sx, sy) => inside(sx, sy) && !fly.obstacles.some((o) => rectsOverlap(rect(sx, sy, w, h), o, 8))
    for (let radius = 0; radius <= 160; radius += 16) {
      for (let k = 0; k < (radius ? 12 : 1); k += 1) {
        const a = (k / 12) * Math.PI * 2
        const sx = best.x + Math.cos(a) * radius
        const sy = best.y + Math.sin(a) * radius
        if (clearAt(sx, sy)) return { x: sx - anchor.rect.left, y: sy - anchor.rect.top }
      }
    }
    return fly.follow ?? null
  }

  /* ------------------------------------------------------- album visit */
  let spotWatch = null // IntersectionObserver for content where the mascot stands
  const covering = new Set()

  /** Watches whether album content sits where the mascot stands; it tucks itself away if so. */
  const watchSpot = () => {
    if (!visit) return
    if (spotWatch) visit.unobserve(spotWatch)
    covering.clear()
    const line = stage.getBoundingClientRect()
    const width = layout.width || mascot.offsetWidth
    const height = layout.height || mascot.offsetHeight
    const viewportWidth = document.documentElement.clientWidth
    const viewportHeight = window.innerHeight
    const left = clamp(line.left + layout.homeLeft, 0, viewportWidth)
    const right = clamp(left + width, 0, viewportWidth)
    const bottom = Math.min(viewportHeight, line.top)
    const top = Math.max(0, bottom - height - layout.lift + (layout.sink ?? 0))
    const margin = `${-Math.round(top)}px ${-Math.round(viewportWidth - right)}px ${-Math.round(viewportHeight - bottom)}px ${-Math.round(left)}px`
    spotWatch = visit.observe(
      new IntersectionObserver(
        wrap((entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) covering.add(entry.target)
            else covering.delete(entry.target)
          }
          const covered = covering.size > 0 || layout.blocked
          mascot.toggleAttribute('data-covered', covered)
          mascotBrain.setTucked(covered)
        }),
        { rootMargin: margin, threshold: 0 },
      ),
    )
    for (const node of pocketRoot.querySelectorAll(CONTENT)) spotWatch.observe(node)
  }

  let relayoutFrame = null
  const relayout = () => {
    if (!visit || relayoutFrame !== null) return
    relayoutFrame = visit.frame(() => {
      relayoutFrame = null
      droneBrain.relayout()
      if (droneBrain.state !== 'drawing-heart') placeDrone()
      if (!['riding', 'leaving'].includes(mascotBrain.state)) measureFloor()
      else boundFloor()
      watchSpot()
      // On the floor (or on its way down): find the spot again, or fly it up if there is none.
      if (DRONE_GROUNDED.has(droneBrain.state) && droneBrain.state !== 'taking-off') {
        const spot = parkingSpot(fly.openParked ? [openSide] : inwardFirst)
        if (spot) {
          fly.spot = spot.flight
          if (droneBrain.state === 'landed') {
            Object.assign(flight, { x: spot.flight.x, y: spot.flight.y })
            applyFlight()
          }
        } else takeOffSoon(0)
      }
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

  /* ------------------------------------------------ cards: the body turns */
  let dwell = null // { sticker, timer } while a pointer rests on a card

  const lookAtCard = (sticker) => {
    const result = mascotBrain.cardDwell()
    if (result !== 'look') return
    look.card = centreOf(sticker)
    wakeMascot()
  }

  const endDwell = () => {
    if (dwell) visit?.clearTimeout(dwell.timer)
    dwell = null
  }

  /* ------------------------------------------------ the cursor's ripples */
  const onRipple = (ripple) => {
    if (!visit) return
    noteActivity()
    const reach = (point) => {
      if (!point) return null
      const d = Math.hypot(point.x - ripple.x, point.y - ripple.y)
      if (d > timing.rippleReach) return null
      // When the ring's front gets there (the ring eases out, so solve its curve).
      const u = 1 - (1 - d / timing.rippleReach) ** (1 / 2.2)
      return { delay: u * timing.rippleSpan, d }
    }
    const mascotPoint = rig?.lastEye && mascotBrain.context === 'pocket' ? toScreen(measureMascot(), rig.lastEye) : null
    const toMascot = reach(mascotPoint)
    if (toMascot) {
      visit.timeout(() => {
        look.ripple = { x: ripple.x, y: ripple.y }
        if (!mascotBrain.ripple()) return
        wakeMascot()
        // Its hands jerk on the sticks, and the drone lurches with them a beat later.
        if (piloting() && pilot.hold.x > 0.5 && !droneBrain.grounded && droneBrain.state !== 'dragging') {
          pilot.jolt = performance.now()
          visit?.timeout(() => {
            kick(flight, 150 + random() * 60, -110, 0)
            startDrone()
          }, timing.pilotLead)
        }
      }, toMascot.delay)
    }
    const droneAt = !drone.hidden ? droneCentre() : null
    const toDrone = reach(droneAt)
    if (toDrone) {
      visit.timeout(() => {
        if (!droneBrain.ripple()) return
        const c = droneCentre()
        const dx = c.x - ripple.x
        const dy = c.y - ripple.y
        const d = Math.hypot(dx, dy) || 1
        const strength = 420 * (1 - toDrone.d / timing.rippleReach) + 160
        kick(flight, (dx / d) * strength, (dy / d) * strength * 0.8, 40)
        startDrone()
      }, toDrone.delay)
    }
  }

  /** The cursor moved: the drone decides whether to come over and keep it company. */
  const onCursorMove = (p) => {
    pointer.x = p.x
    pointer.y = p.y
    pointer.at = clock.now()
    if (!visit || drone.hidden || !anchor) return
    const state = droneBrain.state
    const now = performance.now()
    const home = homeOnScreen()
    const near = home && Math.hypot(p.x - home.x, p.y - home.y) < timing.droneFollowReach
    const calm = p.inside && p.over === 'open' && p.slowSince && now - p.slowSince >= timing.droneFollowAfter
    if (state === 'home-hover' && calm && near) {
      const target = followTarget(p)
      if (target && droneBrain.follow()) fly.follow = target
    } else if (state === 'following') {
      const far = !home || Math.hypot(p.x - home.x, p.y - home.y) > timing.droneFollowReach * 1.4
      if (!p.inside || p.over === 'card' || p.over === 'control' || far || p.speed > timing.droneFollowSpeed * 2.5) droneBrain.unfollow()
      else {
        const target = followTarget(p)
        if (target) fly.follow = target
      }
    }
    startDrone()
  }

  let press = null // a pointer press on the drone that may become a drag
  let swallowClick = false

  const beginVisit = () => {
    visit?.dispose()
    visit = scope()
    dwell = null
    look.card = null
    const v = visit
    const activity = () => noteActivity()
    v.on(window, 'pointerdown', activity, { passive: true })
    v.on(window, 'keydown', activity)
    v.on(window, 'wheel', activity, { passive: true })
    v.on(window, 'touchstart', activity, { passive: true })
    v.on(window, 'focusin', activity)
    v.on(
      window,
      'scroll',
      () => {
        remeasureMascot()
        fly.layerBox = null
        boundFloor()
        noteActivity()
      },
      // A fixed floor: the page may scroll an element rather than the window (Vodafone's body).
      { passive: true, capture: fixedFloor },
    )
    v.on(window, 'resize', relayout)
    v.observe(new ResizeObserver(wrap(relayout))).observe(pocketRoot)
    // The drone flies only while it is on screen.
    v.observe(
      new IntersectionObserver(
        wrap(([entry]) => {
          fly.onScreen = entry.isIntersecting
          startDrone()
        }),
      ),
    ).observe(drone)

    // The cursor (mouse or trackpad): its light, the cards leaning toward it, its ripples.
    try {
      cursor = createPocketCursor({ root: pocketRoot, timing, reducedMotion, onRipple, onMove: onCursorMove, wrap, mark })
      v.defer(() => {
        cursor?.destroy()
        cursor = null
      })
    } catch (error) {
      cursor = null
      console.error('Pocket cursor:', error)
    }

    // Cards: a pointer that rests on one turns the body toward it; keyboard focus and taps at once.
    const grid = pocketRoot.querySelector('.pocket-grid')
    v.on(grid, 'pointerover', (event) => {
      const sticker = event.target.closest?.('.pocket-sticker')
      if (!sticker || (event.relatedTarget && sticker.contains(event.relatedTarget))) return
      noteActivity()
      endDwell()
      if (event.pointerType === 'touch') {
        lookAtCard(sticker)
        return
      }
      dwell = { sticker, timer: v.timeout(() => lookAtCard(sticker), timing.cardTurn) }
    })
    v.on(grid, 'pointerout', (event) => {
      const sticker = event.target.closest?.('.pocket-sticker')
      if (!sticker || (event.relatedTarget && sticker.contains(event.relatedTarget))) return
      if (dwell?.sticker === sticker) endDwell()
      look.card = null
    })
    v.on(grid, 'focusin', (event) => {
      const sticker = event.target.closest?.('.pocket-sticker')
      if (!sticker || (event.relatedTarget && sticker.contains(event.relatedTarget))) return
      if (event.target.matches(':focus-visible')) lookAtCard(sticker)
    })
    v.on(grid, 'focusout', (event) => {
      const sticker = event.target.closest?.('.pocket-sticker')
      if (!sticker || (event.relatedTarget && sticker.contains(event.relatedTarget))) return
      look.card = null
    })

    // Drone: the pointer makes it curious; click/tap/Enter/Space plays (the first time, a heart);
    // a mouse or pen drag always springs back.
    v.on(drone, 'pointerenter', (event) => {
      const c = droneCentre()
      if (c) fly.toward = { x: event.clientX - c.x, y: event.clientY - c.y }
      if (event.pointerType !== 'touch' && finePointer()) droneBrain.hoverEnter()
    })
    v.on(drone, 'pointerleave', () => {
      fly.toward = null
      droneBrain.hoverLeave()
    })
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
      const c = droneCentre()
      if (c && !press) fly.toward = { x: event.clientX - c.x, y: event.clientY - c.y }
      if (!press || event.pointerId !== press.id) return
      if (!droneBrain.pointerMove(event.clientX, event.clientY)) return
      fly.drag = {
        x: clamp(press.baseX + event.clientX - press.x, press.min.x, press.max.x),
        y: clamp(press.baseY + event.clientY - press.y, press.min.y, press.max.y),
        z: 6,
      }
      startDrone()
    })
    const release = (event, cancelled) => {
      if (!press || (event && event.pointerId !== press.id)) return
      if (drone.hasPointerCapture?.(press.id)) drone.releasePointerCapture(press.id)
      press = null
      fly.drag = null
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
      droneBrain.poke({ heart: Boolean(fly.path) })
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
        fly.drag = null
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
      pointer.x = event.clientX
      pointer.y = event.clientY
      pointer.at = clock.now()
      if (mascotAlive()) wakeMascot()
      noteActivity()
    },
    { passive: true },
  )
  life.on(window, 'resize', remeasureMascot)
  life.on(document, 'visibilitychange', () => {
    if (document.hidden) {
      mascotBrain.suspend()
      droneBrain.suspend()
    } else {
      mascotBrain.resume()
      wakeMascot()
      startDrone()
    }
  })

  /* ------------------------------------------------------------ assets */
  Promise.all([loadRig(ASSETS.mascot, life.signal), loadRig(ASSETS.drone, life.signal)])
    .then(
      wrap(([mascotSvg, droneSvg]) => {
        if (life.disposed) return
        mountRigs(mascotSvg, droneSvg)
        placeForPeek()
        place.x = layout.peekHide.x
        place.y = layout.peekHide.y
        ready = true
        pocketRoot.dataset.pocketActorReady = 'true'
      }),
    )
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
            try {
              if (report) report(error)
              else console.error(`Pocket actors (${name}):`, error)
            } catch {}
            return undefined
          }
        },
      ]),
    )

  instance = self
  return guard({
    /** The element pocket.js puts in the curl's `under` layer (what the page tip uncovers). */
    underStage: () => peekStage,

    /**
     * An item was just pocketed by the user (never for a restored pocket). `landsIn` is how
     * long until it lands in the pocket button.
     */
    itemPocketed: ({ landsIn } = {}) => {
      if (!ready || reducedMotion()) return
      mascotBrain.greet(Number.isFinite(landsIn) ? { landsIn } : {})
    },

    /** The item has landed in the pocket button: the moment the catch is timed to. */
    itemLanded: () => {
      if (ready) mascotBrain.landed()
    },

    /** The pocket button was pressed: let go of it right away. */
    openRequested: () => {
      if (ready) mascotBrain.interruptGreeting()
    },

    /** The page starts turning away; the album is mounted underneath. `phi` is the curl direction. */
    openStart: ({ phi = 0 } = {}) => {
      if (!ready || !Number.isFinite(phi)) return
      // With reduced motion the drone has nothing to perform, so it is plain decoration.
      drone.inert = reducedMotion()
      beginVisit()
      placeDrone()
      measureFloor()
      peekButton.removeAttribute('data-actor-hold')
      grip.removeAttribute('data-shown')
      resetSpring(body.grip, 0)
      // It starts on its board behind where the button was and rides to its spot on the drone's line.
      board.plan = null
      travel = null
      place.x = layout.startX
      place.y = 0
      applyPlace() // no frame at its old place
      resetBoard(layout.startX)
      resetSpring(body.yaw, layout.startX > 0 ? -30 : 30)
      // From the left corner it rides right: the board starts turned round, its nose leading.
      if (leftCorner && layout.startX < 0) resetSpring(board.flight.yaw, 180)
      const reduced = reducedMotion()
      // Its home on the corner's side and the button just by it (Arabic on Vodafone's pages): no ride, it rises there.
      const rises = leftSide && leftCorner && Math.abs(layout.startX) < RIDE_MIN
      const rideFor = reduced || layout.covered || rises ? 0 : rideTo(0, { delay: timing.rideLead, pace: leftCorner ? crossPace(timing.ride) : timing.ride })
      if (!rideFor) {
        board.plan = null
        place.x = 0
        resetBoard(0)
      }
      // The drone waits on the floor where the mascot will stand beside it (on the side it does not
      // ride in from, so it does not ride through it: toward the content from the right corner,
      // the outer side from the left one), and takes off once the mascot has raised the remote.
      // No free spot there: it hovers at home from the start, as before.
      resetSpring(pilot.hold, 0)
      const parked = anchor && !reduced && !layout.covered ? parkingSpot([openSide]) : null
      fly.spot = parked?.flight ?? null
      fly.openParked = Boolean(parked)
      if (anchor) droneBrain.open({ parked: Boolean(parked) })
      const reveal = mascotBrain.revealStart({ rideFor, covered: layout.covered })
      if (rises && reveal === 'there' && !reduced) {
        // Up from below the floor, as it untucks.
        place.y = layout.hideY
        applyPlace()
        travelTo({ x: 0, y: 0 }, timing.untuck, { ease: easeOutCubic, arc: 4 })
      }
      // Drawn now, on its board where it starts: never a frame in its old pose at the new place.
      if (rig && mascotAlive()) drawMascot(performance.now(), 0)
      wakeMascot()
    },

    openProgress: (t) => {
      if (visit) mascotBrain.revealProgress(t)
    },

    openComplete: () => {
      if (!visit) return
      mascotBrain.revealComplete()
      droneBrain.revealed()
      watchSpot()
      // Still parked with no pilot to fly it (it is tucked away): it goes up anyway.
      if (droneBrain.state === 'landed' && mascotBrain.state !== 'riding' && mascotBrain.state !== 'idle') takeOffSoon(timing.remoteRaise)
      startDrone()
    },

    closeStart: () => {
      if (!visit) return
      press = null
      endDwell()
      cursor?.destroy()
      cursor = null
      const distance = leftCorner ? Math.max(0, place.x - layout.startX) : Math.max(0, layout.startX + layout.width - place.x)
      mascotBrain.closeStart({ rideFor: reducedMotion() ? 0 : distance })
      droneBrain.close()
    },

    closeComplete: () => {
      if (!visit && mascotBrain.context !== 'pocket') return
      visit?.dispose()
      visit = null
      spotWatch = null
      dwell = null
      look.card = null
      covering.clear()
      mascot.removeAttribute('data-covered')
      mascotBrain.closeComplete()
      droneBrain.closeComplete()
    },

    destroy: () => {
      if (instance === self) instance = null
      visit?.dispose()
      visit = null
      mascotBrain.destroy()
      droneBrain.destroy()
      stopClip()
      life.dispose()
      layer.remove()
      floor.remove()
      peekStage.remove()
      grip.remove()
      peekButton.removeAttribute('data-actor-hold')
      delete pocketRoot.dataset.pocketActorReady
    },
  })
}
