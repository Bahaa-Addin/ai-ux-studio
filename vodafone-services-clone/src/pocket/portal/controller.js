/**
 * PortalTransitionController: one transition, one clock, one authoritative state
 * (docs/adr/0005-pocket-portal-transition.md, "Choreography").
 *
 *   idle → preparing → wall-falling → portal-revealing → destination-approaching → handoff → completed
 *                                                         (any) → error → native navigation
 *
 * Everything is a function of one clock, evaluated once per frame in a single
 * requestAnimationFrame loop (the light round the portal's frame included); the scene modules
 * only turn the numbers into transforms and opacities. The scene appears in the click exactly
 * as the page looked, and the clock starts two frames later, once every layer has been painted.
 * The phases overlap, so nothing waits for the one before it and there is never a still frame
 * or a stop-start between them (the cue sheet is config.timing; times at speed 1, 1440 × 900):
 *
 *   0 ms           the click: light seeps in at the page's edges and the viewer starts to move in
 *                  on the page, easing in (it is 3% bigger on screen by 0.16 s, 12% by 0.3 s)
 *   ~0.12 s        the viewer pushes it at eye height: it tips away from them as they come
 *                  (one-sided contact: it only goes where they push it, or further)
 *   ~0.4 s         past 45°, it falls on its own (the page 30% bigger by now); the viewer keeps coming
 *   ~0.66 s        the light at its brightest; then it settles and breathes
 *   ~0.67 s        it touches down, cushioned, as the viewer goes through where it stood and over it
 *   ~0.77 s        two lights set off from opposite corners of the destination, drawing its thin
 *                  red line; the destination sets off toward the viewer too
 *   ~1.4 s         it seems to come closer fastest (the middle of the move)
 *   ~1.8 s         it grows fastest on screen; from here a long, soft ease-out, as long as the way in
 *   ~2.06 s        the line is drawn all round; the lights go on circling it
 *   ~3.25 s        it is the viewport (snapped once it is within 0.6 px); the real navigation
 *                  happens under the last frame
 *
 * The move is two motions on one clock (./motion.js splitApproach): the viewer's, planned in
 * distance (`camera.travel`, `camera.ease`), which is what the wall and the floor show, so the
 * viewer is plainly moving in while they push the wall over; and the destination's own approach
 * (`portal.ease`), setting off a little later and rising a little off the floor as it comes. The
 * wall's fall is simulated against the viewer's move (./motion.js planPushedFall), in shares of
 * their way, so it is the same on every screen.
 *
 * With `camera.mode: 'still'` the viewer stays where they are and the portal comes to them
 * instead (the wall falls on its own timer, the portal starts toward them as it ignites, and the
 * fallen wall is absorbed into the light).
 * Either way the portal's on-screen motion runs through ./motion.js planApproach (the hover for a
 * slow page and the exact last frame are shared): for the portal itself only the distance between
 * it and the viewer counts; what differs is everything near, which passes by a moving viewer.
 *
 * If the page is not ready by the hold point the portal hovers (the frame's light keeps
 * flowing, a soft shimmer shows it is loading), then continues smoothly once it is.
 * Escape skips straight to the destination. A watchdog navigates whatever happens.
 */

import { timingFor } from './config.js'
import { bumpEase, clamp, ease, lerp, perspectiveFor, planApproach, planFall, planPushedFall, smoothstep, smootherstep, splitApproach, strideAt } from './motion.js'
import { createEnvironment } from './environment.js'
import { createWall } from './wall.js'
import { createGate, forgetFrames, prepareFrame } from './gate.js'
import { createDestination, navigateLike } from './handoff.js'
import { rememberPocket } from './history.js'
import { t as say } from '../../i18n.js'

/** If the browser has not left this page this long after the handoff, the page is given back. */
const STAY_TIMEOUT = 10000

export const STATES = ['idle', 'preparing', 'wall-falling', 'portal-revealing', 'destination-approaching', 'handoff', 'completed', 'error']

export const cameraFor = (W = window.innerWidth, H = window.innerHeight) => ({ W, H, cx: W / 2, cy: H / 2, P: perspectiveFor(W, H) })

/** Environments painted ahead of time, by viewport size (the hall never changes otherwise). */
const prepared = new Map()
const envKey = (camera) => `${camera.W}x${camera.H}@${window.devicePixelRatio || 1}`

/**
 * Builds and paints the environment ahead of time. With `later` (e.g. requestIdleCallback) it is
 * painted one part per call, so no single task is long on the Pocket page; whatever is left when a
 * transition starts is painted then.
 */
export const prepareEnvironment = ({ config, make, later }) => {
  const camera = cameraFor()
  const key = envKey(camera)
  if (prepared.has(key)) return
  const environment = createEnvironment({ camera, config, make })
  prepared.clear()
  prepared.set(key, environment)
  if (!later) {
    prepareFrame({ camera, config })
    return environment.paint()
  }
  // The red line's parts first (one step), then the world, one part per idle moment.
  const next = () => prepared.get(key) === environment && environment.paintStep() && later(next)
  later(() => {
    prepareFrame({ camera, config })
    later(next)
  })
}

export const forgetEnvironment = () => {
  prepared.clear()
  forgetFrames()
}

const takeEnvironment = ({ camera, config, make }) => {
  const key = envKey(camera)
  const ready = prepared.get(key)
  prepared.delete(key)
  if (ready) {
    ready.paint() // anything not painted yet
    return ready
  }
  const environment = createEnvironment({ camera, config, make })
  environment.paint()
  return environment
}

/**
 * Runs one transition to `url`, started by a click on `link`. Must be called synchronously
 * in the click handler (it snapshots the page before the next paint).
 */
export const runTransition = ({ url, link, config, make, onState = () => {}, onDone = () => {}, log = () => {} }) => {
  const T = timingFor(config)
  const camera = cameraFor()
  const narrow = camera.W < 700 || camera.W < camera.H
  let state = 'idle'
  let raf = 0
  let finished = false
  const timers = []
  const clicked = performance.now()

  const setState = (next, detail = {}) => {
    if (state === next) return
    state = next
    root.dataset.state = next
    onState(next, { url, ...detail })
    log(`state: ${next}`, detail)
  }

  /* ------------------------------------------------------------ build the scene */
  const root = make('div', { class: 'vf-portal', 'data-vg': '', 'data-state': 'idle', style: { perspective: `${camera.P}px` } })
  const status = make('p', { class: 'vf-portal__status', role: 'status' })
  const destination = createDestination({ url, link, camera, config, make, timeout: T.readyTimeout })
  const environment = takeEnvironment({ camera, config, make })
  const misty = environment.style === 'mist'
  // The glowing white space and the misty void both have a light behind the portal; only the mist has fog.
  const lightWorld = environment.style !== 'hall'
  const walking = config.camera.mode !== 'still'
  const startScale = narrow ? config.portal.startScale.narrow : config.portal.startScale.wide
  // Walking, the portal starts on the floor like a door and rises a little as it comes toward the
  // viewer; coming to a still viewer, it floats.
  const gate = createGate({ camera, config, make, content: destination.node, lift: walking ? 0 : config.portal.lift, hover: walking ? config.portal.hover : 0 })
  const wall = createWall({ camera, config, make, exclude: [root] })
  const layers = make('div', { class: 'vf-portal__scene', 'aria-hidden': 'true', style: { perspective: `${camera.P}px` } })
  layers.append(...environment.back, ...environment.pulses, gate.reflection, gate.redlight, gate.root, ...environment.front, wall.shadow, wall.root)
  root.append(layers, status)

  setState('preparing')
  document.documentElement.dataset.vfPortal = 'active'
  document.body.append(root)
  wall.mount()

  /* ------------------------------------------------------------ readiness */
  let ready = null // { kind, reason, at }
  destination.ready.then((result) => {
    ready = { ...result, at: performance.now() - clicked }
    root.dataset.destination = result.kind
    log('destination', ready)
  })

  /* ------------------------------------------------------------ the plan */
  // The cue sheet (config.timing, ms from the click). Every phase starts while the one before is
  // still in motion, so nothing waits and nothing stops between them.
  // The portal starts to glow in the light while the wall still hides it, so the falling wall
  // uncovers something already there.
  const gateAt = T.ignite
  // The motion toward it is two motions on one clock (./motion.js splitApproach): the viewer moves
  // in from the click, planned in distance, so the wall in front of them grows on screen at once
  // while they push it over, gathering speed through where it stood; and the portal comes the rest
  // of the way toward them, setting off later, so it is what the eye follows once the wall has
  // gone, with a long, soft ease-out into the page. For a still viewer only the portal moves,
  // starting as it ignites. Either way it arrives at T.arrive.
  const moveAt = walking ? 0 : T.ignite
  const approachingAt = walking ? gateAt : gateAt + T.gateIn
  const plan = splitApproach({
    P: camera.P,
    startScale,
    travel: walking ? config.camera.travel * camera.P : 0,
    viewer: bumpEase(...config.camera.ease),
    door: bumpEase(...config.portal.ease),
  })
  const { shape } = plan
  // How far the viewer has come (px) when the portal looks `scale` big: what near things show.
  const travel = Math.max(1, plan.travel)
  // The red line is traced round the page once it is out from behind the wall.
  const traceAt = gateAt + T.gateIn * 0.6
  const duration = Math.max(600, T.arrive - moveAt)
  let approach = planApproach({ startScale, duration, hold: T.hold, shape, brake: 600 / config.speed })
  // The wall. Walking: the viewer's own move pushes it over (it tips exactly as far as they push
  // it, then gravity takes it away from them); still: it is let go at the click (a shove from rest
  // that fades into the fall, so it does not hang near upright) and lands at T.fall.
  const { shove, shoveFor, cushion, cushionFrom, bounce } = config.wall
  const fall = walking
    ? planPushedFall({
        // In shares of the viewer's way, so the push is timed the same on every screen.
        reach: (ms) => plan.walkedAt(approach.plannedScale(ms)) / travel,
        gap: config.camera.push[0],
        lever: config.camera.push[1] - config.camera.push[0],
        soft: config.camera.contact,
        gravity: config.wall.gravity / config.speed,
        cushion,
        from: cushionFrom,
        bounce,
      })
    : planFall({ duration: T.fall, th0: 0, w0: 0, shove, shoveFor, cushion, from: cushionFrom, bounce })
  const landAt = fall.landAt
  // A slow page is waited for only once the viewer has let go of the wall, so its fall (planned
  // with the move) is the fall that happens.
  if (walking && approach.holdAt <= fall.lastTouch) approach = planApproach({ startScale, duration, hold: (fall.lastTouch + 50) / duration, shape, brake: 600 / config.speed })
  const u0 = Math.log(startScale)
  let arrivedAt = 0
  let veilClearedFrom = 0
  let loadingShown = false

  /** Everything on screen as a function of t (ms on the transition's clock); `warm`: see the start. */
  const render = (t, warm = false) => {
    // How big the destination looks: it ignites far away; then the viewer walks to it (or it
    // comes to them). In the mist it starts half lost in the fog and comes out of it as it nears
    // (fog by distance: e^(-|z| / fog)).
    const planned = t >= moveAt ? approach.at(t - moveAt, Boolean(ready)) : { u: u0, scale: startScale, phase: 'waiting' }
    // The ease-out's last sub-pixel is not drawn: with under 0.6 px left to cover at the screen's
    // edges it has arrived (those steps would only make the text shimmer as it is resampled).
    const step = planned.phase === 'approach' && (1 - planned.scale) * Math.max(camera.W, camera.H) < 0.6 ? { ...planned, u: 0, scale: 1, phase: 'arrived' } : planned
    const progress = clamp(1 - step.u / u0, 0, 1)
    const scale = step.phase === 'arrived' ? 1 : Math.min(1, step.scale)
    // The walk: how far the viewer has come, how far the portal has come on its own, and where
    // the viewer's eye is in its step.
    const walked = walking ? plan.walkedAt(scale) : 0
    const own = plan.ownAt(scale)
    const { bob, steps, sway } = config.camera
    const eye = walking
      ? strideAt({ walking: Math.max(0, t - moveAt), progress, height: camera.H, bob, steps: steps * config.speed, sway, fadeIn: 300 / config.speed })
      : { x: 0, rise: 0 }

    // Wall. Walking, the fallen page stays in sight (the light takes only some of it) and is walked over.
    // Still viewer: it eases back as it is let go. Walking: the viewer pushes it, it does not move off on its own.
    const pushed = walking ? 0 : ease.outCubic(clamp(t / T.unlatch, 0, 1))
    const angle = fall.angleAt(t)
    const washed = smootherstep(landAt - 180, landAt - 180 + config.wall.wash / config.speed, t) * (walking ? config.camera.wash : 1)
    wall.update({
      pushed,
      angle,
      // Light round its edges: it leaks out as the wall lets go and rims the wall while it falls
      // (backlit by the rising light), fading just before it lands.
      spill: 0.9 * smootherstep(0, T.unlatch * 0.8, t) * (1 - smootherstep(landAt * 0.55, landAt + 50 / config.speed, t)),
      // The first sign, at the click, while the push is still gentle (the launch): light seeps in
      // at the page's edges; it goes as the wall tips away and the light pours over its top.
      // (It keeps building until the push takes over, so the start never plateaus.)
      seep: (walking ? 0.85 : 0.5) * smootherstep(0, T.unlatch * 1.6, t) * (1 - smoothstep(0.17, 0.87, angle)),
      shade: 0.12 * smootherstep(0, T.unlatch, t) * (1 - smootherstep(T.unlatch * 0.5, T.unlatch * 0.5 + 440 / config.speed, t)),
      washed,
      walked,
      eye,
    })

    const depth = camera.P * (1 / scale - 1)
    const clear = misty ? 1 - config.mist.depth * (1 - Math.exp(-depth / (config.mist.fog * camera.P))) : 1
    // The portal appears in stages: the page in the light, then two lights trace its red line
    // round it from opposite corners (from traceAt; ./gate.js), and go on circling it slowly.
    const shown = smootherstep(gateAt, gateAt + T.gateIn * 0.7, t) * clear

    // Light. It rises from the click: first round the wall's edges as it lets go, then over its
    // top as it tips, to its brightest at T.rise (a slow swell, not a flash), then it settles and
    // breathes, and swells again as the portal comes close. The hall adds a glare the eye adapts to.
    const { glare: glareMax, ambient, red } = config.light
    const adapt = 1 - smootherstep(100 / config.speed, landAt + 400 / config.speed, t)
    const flood = smootherstep(0, T.rise, t)
    const breathe = 0.5 - 0.5 * Math.cos((t / (2600 / config.speed)) * Math.PI * 2)
    const flowing = smootherstep(0.03, 0.14, progress) * (1 - smootherstep(0.72, 0.93, progress))
    // The flare: the swell overshoots a little at its height, then settles.
    const flare = 0.28 * flood * (1 - smootherstep(T.rise, T.rise + 1000 / config.speed, t))
    // The red's own slow breath (slower than the light's, so the two never beat together).
    const ember = 0.5 - 0.5 * Math.cos((t / (3600 / config.speed)) * Math.PI * 2)
    // The mist: two banks drifting on their own, then flowing past while the portal travels
    // (each grows evenly in log scale, fading in and out of its own cycle), gone before the page
    // takes over.
    const mist = environment.front.map((_, i) => {
      const passed = walking ? (walked / travel) * config.camera.passes : progress * config.mist.flow
      const cycle = (((i / environment.front.length + t / (config.mist.drift / config.speed) + passed) % 1) + 1) % 1
      return {
        scale: Math.exp(lerp(Math.log(0.9), Math.log(2.9), cycle)),
        // (near the eye: a step moves it almost as much as it moves the eye)
        x: Math.sin(t / (6100 / config.speed) + i * 2.1) * camera.W * 0.018 - eye.x * 0.8,
        y: Math.sin(t / (7900 / config.speed) + i * 1.3) * camera.H * 0.01 + eye.rise * 0.8,
        alpha: config.mist.density * Math.sin(Math.PI * cycle) ** 2 * flood * (1 - smootherstep(0.68, 0.95, progress)),
      }
    })
    // The light in the fog (mist): it floods out as the wall goes and the portal ignites in front
    // of it; then it travels with the portal, growing with it but always well beyond its frame,
    // so the portal comes out of the light, backlit through the glowing fog. It flares, breathes,
    // swells as the portal nears, and fades as the page fills the screen. (It does not turn:
    // turning a layer this size cost about a quarter of the frames when measured.)
    // Walking, the light stays where the portal started (deep in the space) and only the viewer's
    // own move brings it closer, so the portal comes forward out of it, toward the viewer.
    const centre = gate.offsetAt(scale, eye, own)
    const anchored = walking ? 1 / (1 / startScale - walked / camera.P) : 0
    const light = lightWorld
      ? {
          x: walking ? -eye.x * anchored : centre.x,
          y: walking ? eye.rise * anchored : centre.y,
          scale: walking ? (0.7 + 1.5 * startScale) * (anchored / startScale) : 0.7 + 1.5 * scale,
          alpha: (misty ? config.mist.glow : config.glow.light) * flood * (0.8 + flare + 0.1 * breathe + 0.12 * smootherstep(0.1, 0.8, progress)) * (1 - smootherstep(0.82, 0.985, scale)),
        }
      : undefined
    environment.update({
      warm,
      mist,
      light,
      // Round the light behind the portal the white has a shape (its bloom), so a flat white glare is kept low.
      glare: (glareMax - ambient) * adapt * (lightWorld ? 0.35 : 1),
      glow: config.light.glow * flood * (0.78 + flare + 0.08 * breathe + 0.16 * smootherstep(0.1, 0.8, progress)),
      // Each wave grows at a constant rate on screen (evenly in log scale, from the portal's size to
      // the screen plane), so none rushes past the eye as it comes near.
      pulses: environment.pulses.map((_, i) => {
        const phase = (i / environment.pulses.length + progress * 1.8) % 1
        const grown = Math.exp(Math.log(scale) * (1 - phase))
        return { z: -camera.P * (1 / grown - 1), alpha: 0.65 * Math.sin(Math.PI * phase) ** 2 * flowing }
      }),
    })

    // The page inside: white until it is ready (a slow band of light while it keeps us waiting),
    // a little haze while far; a preview fades to white at the very end, matching what a page
    // from another site shows while it loads.
    if (ready && !veilClearedFrom) veilClearedFrom = Math.max(t, gateAt)
    const loading = ready ? 1 - smootherstep(veilClearedFrom, veilClearedFrom + 350 / config.speed, t) : 1
    const waiting = !ready && step.phase === 'hover'
    if (waiting !== loadingShown) {
      loadingShown = waiting
      gate.veil.toggleAttribute('data-loading', waiting)
    }
    const haze = lightWorld ? 0 : 0.24 * (1 - progress)
    const whiteout = ready?.kind === 'preview' ? smootherstep(0.84, 0.985, progress) : 0
    const drawn = gate.update({
      warm,
      scale,
      own,
      shown,
      veil: Math.max(loading, haze, whiteout),
      red: red * (0.85 + 0.15 * progress) * (1 - 0.35 * smootherstep(0.55, 0.95, progress)) * (0.9 + 0.1 * ember),
      reflect: lightWorld ? 0.35 : 1,
      // In the light its red scatters further.
      spread: lightWorld ? 2.5 : 1.9,
      eye,
      // Soft focus only while it is far: it sharpens as it comes closer, and is crisp (filter off)
      // from about 40% of the screen, so the page is recognisable early.
      soften: lightWorld ? (misty ? config.mist.soften : config.glow.soften) * (1 - smootherstep(startScale, 0.4, scale)) : 0,
      time: t - traceAt,
    })

    if (config.debug)
      (window.__vfPortalTrace ||= []).push({
        t: Math.round(t),
        scale,
        phase: step.phase,
        angle,
        ready: Boolean(ready),
        walked,
        eye: eye.rise,
        flood,
        light: light?.alpha ?? 0,
        glare: (glareMax - ambient) * adapt * (misty ? 0.35 : 1),
        mist: mist.reduce((sum, bank) => sum + bank.alpha, 0),
        shown,
        drawn,
        spill: 0.9 * smootherstep(0, T.unlatch * 0.8, t) * (1 - smootherstep(landAt * 0.55, landAt + 50 / config.speed, t)),
      })
    return step
  }

  let started = Infinity // the clock starts two frames after the scene is on screen
  const frame = () => {
    raf = 0
    if (finished) return
    try {
      const t = performance.now() - started
      const step = render(t)

      // States.
      if (t >= gateAt && state === 'wall-falling') setState('portal-revealing')
      else if (t >= approachingAt && state === 'portal-revealing') setState('destination-approaching')

      if (step.phase === 'arrived') {
        if (!arrivedAt) arrivedAt = t
        // Two frames at rest, flat and unscaled, then the real navigation under it.
        if (t - arrivedAt > 34) return handoff('arrived')
      }
      if (t > T.watchdog) return handoff('watchdog')
      raf = requestAnimationFrame(frame)
    } catch (error) {
      fail(error)
    }
  }

  /* ------------------------------------------------------------ handoff */
  const handoff = (reason) => {
    if (finished) return
    setState('handoff', { reason, destination: ready?.kind ?? 'pending' })
    finished = true
    cancelAnimationFrame(raf)
    for (const layer of [wall.root, gate.root]) layer.style.willChange = 'auto'
    rememberPocket(window.scrollY)
    try {
      navigateLike(link, url, root)
    } catch {
      location.assign(url)
    }
    setState('completed')
    // If the browser stays here (a 204, a download, a cancelled unload), give the page back.
    // Long enough for a slow server to answer: until it does, the last frame stays on screen.
    timers.push(setTimeout(() => teardown('stayed'), STAY_TIMEOUT))
  }

  const fail = (error) => {
    log('transition error, navigating natively', error)
    if (finished) return
    setState('error', { error: String(error?.message || error) })
    finished = true
    cancelAnimationFrame(raf)
    rememberPocket(window.scrollY)
    location.assign(url)
    timers.push(setTimeout(() => teardown('stayed'), STAY_TIMEOUT))
  }

  const teardown = (reason) => {
    finished = true
    cancelAnimationFrame(raf)
    for (const timer of timers) clearTimeout(timer)
    document.removeEventListener('keydown', onKey, true)
    window.removeEventListener('resize', onResize)
    gate.destroy()
    destination.destroy()
    root.remove()
    delete document.documentElement.dataset.vfPortal
    state = 'idle'
    onDone(reason)
  }

  const onKey = (event) => {
    if (event.key === 'Escape' && !finished) {
      event.preventDefault()
      event.stopPropagation()
      handoff('skipped')
    }
  }
  document.addEventListener('keydown', onKey, true)
  // The scene is built for this viewport; if its width changes (rotation, a resized window),
  // go straight to the destination rather than finish with the wrong geometry. Height alone
  // changes as phone toolbars slide, which the scene tolerates.
  const onResize = () => {
    if (!finished && Math.abs(window.innerWidth - camera.W) > 1) handoff('resized')
  }
  window.addEventListener('resize', onResize)

  status.textContent = say('Opening {title}', { title: destination.facts.title })
  // Transform only on the wall: will-change: opacity would flatten its 3D (the underside, the light behind it).
  wall.root.style.willChange = 'transform'
  gate.root.style.willChange = 'transform, opacity'
  // The scene appears exactly as the page was (t = 0) and the clock starts two frames later, so
  // the first paint of every layer happens while nothing moves: the motion never starts with a jump.
  render(0, true)
  raf = requestAnimationFrame(() => {
    raf = requestAnimationFrame(() => {
      started = performance.now()
      setState('wall-falling')
      frame()
    })
  })

  return {
    get state() {
      return state
    },
    url,
    skip: () => handoff('skipped'),
    /** Removes everything and gives the page back (bfcache restore, tests). */
    cancel: () => teardown('cancelled'),
  }
}
