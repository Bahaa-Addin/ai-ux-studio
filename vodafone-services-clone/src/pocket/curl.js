/**
 * Page-curl engine (Apple Books style). One engine drives all three Pocket moments:
 * a card peeling off like a sticker, the half-turned corner that peeks at the pocket,
 * and the whole page turning away to reveal it.
 *
 * Model. The sheet (W × H) curls around a cylinder of radius R whose axis is a straight
 * line at distance `x` from the peeled corner, perpendicular to the direction `phi`
 * (radians, screen coordinates, pointing from the page toward that corner). Measured
 * along that direction (s), the sheet has four parts:
 *
 *   s < a            flat, untouched                (front content)
 *   a .. a + πR      wrapped around the cylinder    (rising half is hidden from above,
 *                                                   so only the back half is drawn)
 *   s > a + πR       flipped over, lying on top     (back face, see-through optional)
 *   uncovered        what is underneath             (`under` layer)
 *
 * Rendering is DOM-only and compositor-friendly: every part is a "window" (a band
 * with overflow: hidden) that holds a sheet-size box counter-transformed so its
 * content stays put. Each frame only rewrites transforms; nothing is re-rasterised.
 * Front content is a static snapshot (a clone) supplied by the caller, so the live
 * page underneath is never touched.
 *
 * Coordinates: everything is placed relative to the sheet's top-left corner. Matrices
 * use DOMMatrix, whose *Self methods post-multiply exactly like a CSS transform list.
 */

const DEG = 180 / Math.PI
const HALF_PI = Math.PI / 2

/** Projection of the farthest sheet corner on the curl direction, from the sheet centre. */
export const cornerReach = (width, height, phi) =>
  (width / 2) * Math.abs(Math.cos(phi)) + (height / 2) * Math.abs(Math.sin(phi))

/** Axis distance at which the whole sheet has rolled off its own area. */
export const fullTurn = (width, height, phi, radius) => 2 * cornerReach(width, height, phi) + radius

export const ease = {
  linear: (t) => t,
  inQuad: (t) => t * t,
  outCubic: (t) => 1 - (1 - t) ** 3,
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  outBack: (t) => {
    const c = 1.5
    return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2
  },
}

export const lerp = (from, to, t) => from + (to - from) * t

/**
 * requestAnimationFrame tween. `update(easedT, rawT)` runs immediately with 0 and on
 * every frame until 1. Returns { promise, cancel }; a cancelled tween resolves false.
 */
export const tween = (duration, update, easing = ease.linear) => {
  let raf = 0
  let settle = () => {}
  const promise = new Promise((resolve) => {
    settle = resolve
    if (!(duration > 0)) {
      update(easing(1), 1)
      resolve(true)
      return
    }
    const start = performance.now()
    update(easing(0), 0)
    const frame = () => {
      const t = Math.min(1, (performance.now() - start) / duration)
      update(easing(t), t)
      if (t < 1) raf = requestAnimationFrame(frame)
      else resolve(true)
    }
    raf = requestAnimationFrame(frame)
  })
  return {
    promise,
    cancel: () => {
      cancelAnimationFrame(raf)
      settle(false)
    },
  }
}

/* ------------------------------------------------------------------ helpers */

const el = (className, styles) => {
  const node = document.createElement('div')
  if (className) node.className = className
  if (styles) Object.assign(node.style, styles)
  return node
}

const rgb = (base, brightness) => `rgb(${base.map((c) => Math.round(Math.max(0, Math.min(255, c * brightness)))).join(',')})`

/**
 * Brightness of the back face on the roll. t = 0 at the outer rim (normal sideways,
 * darkest), 1 at the top where the sheet lies flat again (fully lit), with a soft
 * specular ridge at `glossAt`.
 */
const rollBrightness = (t, { rim, gloss, glossAt }) => {
  const lift = Math.sin(t * HALF_PI)
  return 1 - rim * (1 - lift) ** 1.35 + gloss * Math.exp(-(((t - glossAt) / 0.16) ** 2))
}

const set = (node, transform) => {
  node.style.transform = transform.toString()
}

const show = (node, visible) => {
  const value = visible ? 'visible' : 'hidden'
  if (node.style.visibility !== value) node.style.visibility = value
}

/* ------------------------------------------------------------------- engine */

/**
 * @param {object} options
 * @param {number} options.width  sheet width in px
 * @param {number} options.height sheet height in px
 * @param {(box: HTMLElement) => void} [options.front] appends a sheet-size snapshot of the
 *        front face into `box`. Called once per layer that needs it. Omit for a transparent
 *        front (the live page under the rig shows through the flat part).
 * @param {(box: HTMLElement) => void} [options.under] appends what the curl uncovers.
 * @param {object} [options.back] back-face material: base [r,g,b], seeThrough 0..1 (how much
 *        of the front shows through the flipped part), rim and gloss for the roll shading.
 * @param {string} [options.radius] border-radius of the sheet (die-cut sticker corners)
 * @param {number} [options.strips] slices used for the visible half of the roll
 * @param {number} [options.perspective] camera distance in px
 * @param {[number, number]} [options.origin] perspective origin in sheet coordinates
 * @returns rig with `plane` (flat layers, no 3D) and `lift` (3D layers) elements to mount,
 *          `update({ x, phi, R })`, `setFront`, `setUnder`, `state` and `destroy()`.
 */
export const createCurl = ({
  width,
  height,
  front = null,
  under = null,
  back = {},
  radius = '0px',
  strips = 14,
  perspective = 2200,
  origin = [width / 2, height / 2],
} = {}) => {
  const W = Math.max(1, width)
  const H = Math.max(1, height)
  const material = { base: [252, 252, 250], seeThrough: 0, rim: 0.24, gloss: 0.05, glossAt: 0.6, ...back }

  const plane = el('curl-plane', {
    position: 'absolute', left: '0', top: '0', width: `${W}px`, height: `${H}px`,
    overflow: 'hidden', pointerEvents: 'none', contain: 'strict',
  })
  const lift = el('curl-lift', {
    position: 'absolute', left: '0', top: '0', width: `${W}px`, height: `${H}px`,
    pointerEvents: 'none', perspective: `${perspective}px`, perspectiveOrigin: `${origin[0]}px ${origin[1]}px`,
  })
  for (const root of [plane, lift]) {
    root.setAttribute('aria-hidden', 'true')
    root.inert = true
  }

  /** A band that clips, holding a sheet-size box whose transform keeps content in place. */
  const makeWindow = (className, parent) => {
    const win = el(`curl-win ${className}`, {
      position: 'absolute', left: '0', top: '0', overflow: 'hidden', transformOrigin: '0 0', willChange: 'transform', visibility: 'hidden',
    })
    const box = el('curl-box', {
      position: 'absolute', left: '0', top: '0', width: `${W}px`, height: `${H}px`, overflow: 'hidden',
      transformOrigin: '0 0', borderRadius: radius,
    })
    win.append(box)
    parent.append(win)
    return { win, box }
  }

  /** A gradient band laid across the sheet (shadows on the flat plane). */
  const makeBand = (className, background) => {
    const band = el(`curl-band ${className}`, {
      position: 'absolute', left: '0', top: '0', width: '100px', transformOrigin: '0 0', background, willChange: 'transform', visibility: 'hidden',
    })
    plane.append(band)
    return band
  }

  // --- plane: what lies flat (under, front, their shadows) ----------------------
  const underLayer = makeWindow('curl-under', plane)
  const underShadow = makeBand('curl-under-shadow', 'linear-gradient(to right, rgba(0,0,0,0.28), rgba(0,0,0,0.1) 38%, rgba(0,0,0,0))')
  const flat = makeWindow('curl-flat', plane)
  // The rising half of the roll is seen almost edge-on: a thin, shadowed band at the fold.
  const rimShade = makeBand(
    'curl-rim',
    'linear-gradient(to right, rgba(0,0,0,0), rgba(0,0,0,0.12) 25%, rgba(0,0,0,0.28) 60%, rgba(0,0,0,0.38))',
  )
  // The flipped part's shadow may fall outside the sheet (a sticker folding over its edge),
  // so it lives in the lift, unclipped, painted before the roll.
  const flapShadowWrap = el('curl-flap-shadow', { position: 'absolute', left: '0', top: '0', width: `${W}px`, height: `${H}px`, opacity: '0' })
  lift.append(flapShadowWrap)
  const flapShadow = makeWindow('curl-flap-shadow-win', flapShadowWrap)
  flapShadow.box.append(el('', { position: 'absolute', inset: '0', background: '#000' }))

  // --- lift: the roll and the flipped part --------------------------------------
  const roll = Array.from({ length: strips }, (_, index) => {
    const layer = makeWindow('curl-strip', lift)
    const t0 = index / strips
    const t1 = (index + 1) / strips
    const shade = el('curl-strip-shade', {
      position: 'absolute', left: '0', top: '0', width: '100px', transformOrigin: '0 0',
      background: `linear-gradient(to right, ${rgb(material.base, rollBrightness(t0, material))}, ${rgb(material.base, rollBrightness(t1, material))})`,
    })
    layer.box.append(shade)
    return { ...layer, shade, index }
  })
  const flap = makeWindow('curl-flap', lift)
  const flapPaper = el('curl-flap-paper', { position: 'absolute', inset: '0', background: rgb(material.base, 1) })

  // --- content ------------------------------------------------------------------
  let hasFront = false
  const setFront = (fill) => {
    flat.box.replaceChildren()
    flap.box.replaceChildren()
    hasFront = typeof fill === 'function'
    if (hasFront) {
      fill(flat.box)
      if (material.seeThrough > 0) fill(flap.box)
    }
    flapPaper.style.opacity = String(hasFront ? 1 - material.seeThrough : 1)
    flap.box.append(flapPaper)
    if (state) update(state)
  }

  let hasUnder = false
  const setUnder = (fill) => {
    underLayer.box.replaceChildren()
    hasUnder = typeof fill === 'function'
    if (hasUnder) fill(underLayer.box)
    if (state) update(state)
  }

  // --- geometry -----------------------------------------------------------------
  let state = null
  let grounded = true // false while the sheet is lifted clear of the surface (a flying sticker)
  let stripWidth = -1

  const update = ({ x, phi, R }) => {
    state = { x, phi, R }
    const reach = cornerReach(W, H, phi)
    const a = reach - x // axis position along the curl direction, from the centre
    const D = Math.hypot(W, H) + 4 * R + 64 // long enough to span the sheet at any angle
    const base = new DOMMatrix().translateSelf(W / 2, H / 2).rotateSelf(phi * DEG)
    const curled = x > 0.01
    const ramp = Math.min(1, Math.max(0, x / (2 * R)))

    // Flat front: everything up to the outer rim of the roll. Between the axis and the rim
    // it sits under the back of the roll, and shows only as the rising sliver under perspective.
    if (hasFront) {
      const m = base.translate(a + R - D, -D / 2)
      flat.win.style.width = `${D}px`
      flat.win.style.height = `${D}px`
      set(flat.win, m)
      set(flat.box, m.inverse())
    }
    show(flat.win, hasFront)

    // Uncovered region beyond the rim.
    if (hasUnder) {
      const m = base.translate(a + R, -D / 2)
      underLayer.win.style.width = `${D}px`
      underLayer.win.style.height = `${D}px`
      set(underLayer.win, m)
      set(underLayer.box, m.inverse())
    }
    show(underLayer.win, hasUnder && curled)

    // Shadow the lifted sheet casts on what is underneath, and the darkening at its base.
    const fall = R + 26
    set(underShadow, base.translate(a + R, -D / 2).scale(fall / 100, 1))
    underShadow.style.height = `${D}px`
    underShadow.style.opacity = String(ramp)
    show(underShadow, curled && grounded)
    set(rimShade, base.translate(a - R * 0.2, -D / 2).scale((R * 1.2) / 100, 1))
    rimShade.style.height = `${D}px`
    rimShade.style.opacity = String(ramp)
    show(rimShade, curled)

    // Back half of the roll: theta from pi/2 (rim) to pi (top), sliced into strips.
    const w = (R * HALF_PI) / strips
    const sizeChanged = Math.abs(w - stripWidth) > 0.01
    stripWidth = w
    for (const strip of roll) {
      const theta0 = HALF_PI + (strip.index / strips) * HALF_PI
      const thetaMid = theta0 + HALF_PI / strips / 2
      const sigma0 = R * theta0 // arc length from the axis to this strip
      const visible = curled && sigma0 < x
      show(strip.win, visible)
      if (!visible) continue
      if (sizeChanged) {
        strip.win.style.width = `${w + 1}px`
        strip.win.style.height = `${D}px`
        strip.shade.style.height = `${D}px`
      }
      const flatBand = base.translate(a + sigma0, -D / 2)
      const onRoll = base
        .translate(a + R * Math.sin(thetaMid), 0, R * (1 - Math.cos(thetaMid)))
        .rotateAxisAngleSelf(0, 1, 0, -thetaMid * DEG)
        .translateSelf(-w / 2, -D / 2)
      set(strip.win, onRoll)
      set(strip.box, flatBand.inverse())
      set(strip.shade, flatBand.scale((w + 1) / 100, 1))
    }

    // Flipped part: mirrored about the middle of the roll, lifted to 2R, seen from behind.
    const flapVisible = curled && Math.PI * R < x
    show(flap.win, flapVisible)
    show(flapShadow.win, flapVisible)
    if (flapVisible) {
      const mid = a + (Math.PI * R) / 2
      const flatPart = base.translate(a + Math.PI * R, -D / 2)
      const mirror = (lifted) =>
        base
          .translate(mid, 0, lifted)
          .rotateAxisAngleSelf(0, 1, 0, 180)
          .translateSelf(-mid, 0, 0)
          .translateSelf(a + Math.PI * R, -D / 2)
      for (const part of [flap, flapShadow]) {
        part.win.style.width = `${D}px`
        part.win.style.height = `${D}px`
        set(part.box, flatPart.inverse())
      }
      set(flap.win, mirror(2 * R))
      set(flapShadow.win, new DOMMatrix().translateSelf(0, 4 + R * 0.08).multiplySelf(mirror(0)))
      const lifted = Math.min(1, (x - Math.PI * R) / (2 * R))
      flapShadowWrap.style.opacity = String(0.34 * lifted)
      flapShadowWrap.style.filter = `blur(${Math.round(6 + R * 0.22)}px)`
    } else {
      flapShadowWrap.style.opacity = '0'
    }
  }

  const destroy = () => {
    plane.remove()
    lift.remove()
  }

  setFront(front)
  setUnder(under)

  return {
    plane,
    lift,
    width: W,
    height: H,
    update,
    setFront,
    setUnder,
    setGrounded: (value) => {
      grounded = Boolean(value)
      if (state) update(state)
    },
    setOrigin: ([ox, oy]) => {
      lift.style.perspectiveOrigin = `${ox}px ${oy}px`
    },
    get state() {
      return state
    },
    destroy,
  }
}
