/**
 * DestinationPortalFrame: the destination page with a thin, soft line of Vodafone red round it,
 * standing in the light like a door while the viewer comes toward it, and coming toward them too
 * (or travelling toward a viewer who stays still), until it is the viewport
 * (docs/adr/0005-pocket-portal-transition.md, "The portal").
 *
 *   view        exactly W × H, the size of the viewport: the destination is laid out as it
 *               will be after the navigation, so at depth 0 it is pixel for pixel the page.
 *   frame       a soft line of #e60000 just outside the view (so at the end it passes beyond the
 *               screen edges). Two lights start at opposite corners and draw it round the page
 *               (`time`, from when the tracing starts), then go on circling it slowly, each with a
 *               fading trail. Its width is kept about the same on screen however far the portal
 *               is (each side's track is widened as the portal shrinks: transform only, nothing is
 *               repainted). One clipped track per side, so the trails turn the corners.
 *   glow        a close, soft red glow round the line, once it is drawn.
 *   reflection  its mirror image in the floor, faint and fading.
 *   redlight    the red it casts on the white around it.
 *
 * Its depth comes from how big it looks (`scale`). Walking, it rises a little off the floor as it
 * comes toward the viewer (`hover`) and lands exactly on the viewport.
 */

import { clamp, liftAt, smoothstep, smootherstep } from './motion.js'

const SIDES = ['top', 'right', 'bottom', 'left']
// The line, the trails and the lights are painted once into small canvases (soft in both
// directions, which CSS gradients cannot do in one layer), then only moved and stretched.
const RED = [230, 0, 0]
const HOT = [255, 92, 80] // the lights' cores: a lighter red, never white

const canvasOf = (width, height) => {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width))
  canvas.height = Math.max(1, Math.round(height))
  return canvas
}

/** Across the line: a thin core in a wide soft halo (it reads as blurred light); near 0 at the track's edges. */
const across = (d, band) => Math.min(1, 0.62 * Math.exp(-((d / (band * 0.085)) ** 2) / 2) + 0.42 * Math.exp(-((d / (band * 0.19)) ** 2) / 2))

/**
 * A soft strip `length` long and `band` wide, horizontal or vertical, its opacity along it given
 * by `along(u)` (u: 0 at the trailing end, 1 at the leading end) and coloured from RED to HOT by
 * `heat(u)`. `reverse`: the leading end is at the left (or top).
 */
const strip = ({ length, band, vertical, reverse, along, heat = () => 0, strength = 1 }) => {
  const canvas = vertical ? canvasOf(band, length) : canvasOf(length, band)
  const ctx = canvas.getContext('2d')
  const image = ctx.createImageData(canvas.width, canvas.height)
  const n = vertical ? canvas.height : canvas.width
  const m = vertical ? canvas.width : canvas.height
  // (Painted in the click, so kept cheap: the profile across is the same for every column.)
  const profile = Float32Array.from({ length: m }, (_, b) => across(b + 0.5 - m / 2, m))
  const data = image.data
  for (let a = 0; a < n; a++) {
    const u = reverse ? 1 - (a + 0.5) / n : (a + 0.5) / n
    const level = along(u) * strength
    if (!(level > 0)) continue
    const h = heat(u)
    const r = Math.round(RED[0] + (HOT[0] - RED[0]) * h)
    const g = Math.round(RED[1] + (HOT[1] - RED[1]) * h)
    const bl = Math.round(RED[2] + (HOT[2] - RED[2]) * h)
    for (let b = 0; b < m; b++) {
      const i = (vertical ? a * m + b : b * n + a) * 4
      data[i] = r
      data[i + 1] = g
      data[i + 2] = bl
      data[i + 3] = Math.min(255, Math.round(255 * level * profile[b]))
    }
  }
  ctx.putImageData(image, 0, 0)
  return canvas
}

/** A light: a soft round glow with a lighter core, `size` across. */
const spark = (size) => {
  const canvas = canvasOf(size, size)
  const ctx = canvas.getContext('2d')
  const c = size / 2
  const g = ctx.createRadialGradient(c, c, 0, c, c, c)
  g.addColorStop(0, `rgba(${HOT.join(', ')}, 0.95)`)
  g.addColorStop(0.07, `rgba(${HOT.join(', ')}, 0.85)`)
  g.addColorStop(0.16, `rgba(${RED.join(', ')}, 0.5)`)
  g.addColorStop(0.32, `rgba(${RED.join(', ')}, 0.2)`)
  g.addColorStop(0.6, `rgba(${RED.join(', ')}, 0.05)`)
  g.addColorStop(1, `rgba(${RED.join(', ')}, 0)`)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  return canvas
}

/**
 * The frame's measurements for a viewport (in the portal's own px). The line runs `gap` outside the
 * page. Each side is a track `band` wide, clipped, holding that side's line and the lights' trails;
 * it reaches half a band past the corners so the sides meet.
 */
const frameGeometry = ({ W, H }, config) => {
  const short = Math.min(W, H)
  const gap = Math.max(3, Math.round(config.portal.frame * short))
  const band = 20
  const Lh = W + 2 * gap
  const Lv = H + 2 * gap
  const count = clamp(Math.round(config.portal.lights), 1, 2)
  return {
    short,
    gap,
    band,
    Lh,
    Lv,
    perimeter: 2 * (Lh + Lv),
    lengths: { top: Lh, right: Lv, bottom: Lh, left: Lv },
    starts: { top: 0, right: Lh, bottom: Lh + Lv, left: 2 * Lh + Lv },
    count,
    trail: Math.round(short * 0.5),
    // Each track fades out over a quarter band either side of its corners (a mask, so the line and
    // the trails alike), so two sides meet in a soft corner, with no ends sticking out.
    feather: band / 4,
    spot: band * 4.5,
  }
}

/** Paints the frame's line, trails and lights (a few small canvases; about 20 ms at 1440 × 900). */
const paintFrame = (camera, config) => {
  const { band, lengths, count, trail, feather, spot } = frameGeometry(camera, config)
  const sides = {}
  for (const side of SIDES) {
    const vertical = side === 'right' || side === 'left'
    const reverse = side === 'bottom' || side === 'left'
    const length = lengths[side] + band
    // The line: even, then brighter and hotter over its last `trail` px, its leading end soft.
    // While a side is drawn its leading end is under the light, so that bright end is the light's
    // trail; once the light turns the corner, the line slides on and its bright end leaves under
    // the mask (so it is one long strip: track, trail and a band to spare).
    const span = length + trail + band
    const line = strip({
      length: span,
      band,
      vertical,
      reverse,
      strength: 0.5,
      along: (u) => {
        const px = u * span
        const near = clamp((px - (span - trail)) / trail, 0, 1)
        return (1 + near ** 2) * (1 - smoothstep(span - 2 * feather, span, px))
      },
      heat: (u) => smoothstep(0.5, 1, clamp((u * span - (span - trail)) / trail, 0, 1)) * 0.75,
    })
    // A light's trail: brighter and hotter toward the light, fading to nothing behind it.
    const trails = Array.from({ length: count }, () =>
      strip({ length: trail, band, vertical, reverse, strength: 1, along: (u) => u ** 2 * (1 - smoothstep(0.97, 1, u)), heat: (u) => smoothstep(0.5, 1, u) * 0.75 }),
    )
    sides[side] = { line, trails, span }
  }
  return { sides, lights: Array.from({ length: count }, () => spark(spot)) }
}

/** Frames painted ahead of time, by viewport and look (used once each: their canvases go into the scene). */
const painted = new Map()
const frameKey = (camera, config) => `${camera.W}x${camera.H}:${config.portal.frame}:${config.portal.lights}`

/** Paints the frame for this viewport ahead of time (call when idle, e.g. while the Pocket is open). */
export const prepareFrame = ({ camera, config }) => {
  const key = frameKey(camera, config)
  if (!painted.has(key)) painted.set(key, paintFrame(camera, config))
}

export const forgetFrames = () => painted.clear()

export const createGate = ({ camera, config, make, content, lift: liftShare = config.portal.lift, hover: hoverShare = 0 }) => {
  const { W, H } = camera
  const veil = make('div', { class: 'vf-portal__veil' })
  const view = make('div', { class: 'vf-portal__view', style: { width: `${W}px`, height: `${H}px` } }, content, veil)

  const { short, gap, band, Lh, Lv, perimeter, lengths, starts, count, trail, feather, spot } = frameGeometry(camera, config)
  const run = perimeter / count // how far each light goes while drawing the line
  const key = frameKey(camera, config)
  const parts = painted.get(key) ?? paintFrame(camera, config)
  painted.delete(key)
  const sides = SIDES.map((side) => {
    const vertical = side === 'right' || side === 'left'
    const reverse = side === 'bottom' || side === 'left'
    const length = lengths[side] + band
    const { line, trails, span } = parts.sides[side]
    line.className = 'vf-portal__line'
    for (const node of trails) node.className = 'vf-portal__trail'
    // (Painted ahead of time, not made with `make`: marked here, as everything the portal adds.)
    for (const node of [line, ...trails]) config.mark?.(node)
    const ends = `linear-gradient(to ${vertical ? 'bottom' : 'right'}, transparent ${band / 2 - feather}px, #000 ${band / 2 + feather}px, #000 calc(100% - ${band / 2 + feather}px), transparent calc(100% - ${band / 2 - feather}px))`
    const node = make('div', { class: `vf-portal__track vf-portal__track--${side}`, style: { '--vf-portal-band': `${band}px`, maskImage: ends, WebkitMaskImage: ends } }, line, ...trails)
    return { side, vertical, reverse, length, span, node, line, trails }
  })
  const lights = parts.lights.map((node) => {
    node.className = 'vf-portal__spark'
    config.mark?.(node)
    return node
  })
  const frame = make('div', { class: 'vf-portal__frame', style: { '--vf-portal-frame': `${gap + band / 2}px` } }, ...sides.map((s) => s.node), ...lights)
  // A close, soft red glow round the line (as wide as the old frame's glow, so it reads as light).
  const halo = Math.max(8, Math.round(0.022 * short))
  const glow = make('div', { class: 'vf-portal__glow', style: { '--vf-portal-frame': `${gap}px`, '--vf-portal-halo': `${halo}px` } })
  const root = make('div', { class: 'vf-portal__gate', style: { width: `${W}px`, height: `${H}px` } }, glow, view, frame)

  const reflection = make(
    'div',
    { class: 'vf-portal__reflection', style: { width: `${W}px`, height: `${H}px`, '--vf-portal-frame': `${gap}px` } },
    make('div', { class: 'vf-portal__reflection-ring' }),
  )
  const redlight = make('div', { class: 'vf-portal__redlight', style: { width: `${W}px`, height: `${H}px` } })

  // How far each light has gone round (px along the line's centre, from its starting corner): from
  // rest, drawing its half of the line in `trace` ms (an ease in and out that lands on the slow
  // circling speed), then circling once every `flow` ms.
  const drawFor = config.portal.trace / config.speed
  const cruise = perimeter / (config.portal.flow / config.speed)
  const a = (3 * run) / drawFor ** 2 - cruise / drawFor
  const b = (cruise * drawFor - 2 * run) / drawFor ** 3
  const travelAt = (ms) => (ms <= 0 ? 0 : ms <= drawFor ? a * ms * ms + b * ms * ms * ms : run + cruise * (ms - drawFor))

  /** Where a point `p` px round the line's centre is, in the frame's own px (from its top left). */
  const pointAt = (p) => {
    const q = ((p % perimeter) + perimeter) % perimeter
    const o = band / 2
    if (q < Lh) return [o + q, o]
    if (q < Lh + Lv) return [o + Lh, o + q - Lh]
    if (q < 2 * Lh + Lv) return [o + Lh - (q - Lh - Lv), o + Lv]
    return [o, o + Lv - (q - 2 * Lh - Lv)]
  }

  /** Places the line, trails and lights for a time on the tracing clock, `widen`: the tracks' stretch. */
  const draw = (ms, widen) => {
    const travel = travelAt(ms)
    const drawing = travel < run
    // The trails grow in once the line is drawn (while drawing, the line's bright end is the trail).
    const trailing = smootherstep(drawFor * 0.8, drawFor + 600 / config.speed, ms)
    for (const { side, vertical, reverse, length, span, node, line, trails } of sides) {
      node.style.transform = vertical ? `scaleX(${widen.toFixed(4)})` : `scaleY(${widen.toFixed(4)})`
      // How much of this side is drawn: the light that draws it set off `offset` px before it.
      const offset = starts[side] % run
      // (Once its light has turned the corner the line runs on past it, under the mask, so its own
      // soft end never dims the corner.)
      const drawn = clamp(travel - offset, 0, lengths[side] + band + trail)
      const lead = band / 2 + feather + drawn // the line's leading end; its soft end is centred on the light
      const at = reverse ? length - lead : lead - span
      line.style.transform = vertical ? `translateY(${at.toFixed(1)}px)` : `translateX(${at.toFixed(1)}px)`
      line.style.opacity = drawn > 0 ? '1' : '0'
      trails.forEach((node, i) => {
        // How far past this side's start the light is (wrapping round, so a trail can still be on
        // a side its light has left).
        let d = (((travel + (i * perimeter) / count - starts[side]) % perimeter) + perimeter) % perimeter
        if (d > lengths[side] + band + trail) d -= perimeter
        const head = band / 2 + d
        const pos = reverse ? length - head : head - trail
        node.style.transform = vertical ? `translateY(${pos.toFixed(1)}px)` : `translateX(${pos.toFixed(1)}px)`
        node.style.opacity = trailing.toFixed(3)
      })
    }
    lights.forEach((node, i) => {
      const [x, y] = pointAt(travel + (i * perimeter) / count)
      node.style.transform = `translate(${(x - spot / 2).toFixed(1)}px, ${(y - spot / 2).toFixed(1)}px) scale(${widen.toFixed(4)})`
      // A light appears as it sets off; it is a little brighter while drawing.
      node.style.opacity = (smootherstep(0, 140 / config.speed, ms) * (drawing ? 1 : 0.85 + 0.15 * (1 - trailing))).toFixed(3)
    })
    return clamp(travel / run, 0, 1)
  }

  const P = camera.P
  const lift = liftShare * H
  const reach = 0.35 * P
  const hover = hoverShare * H
  /** Walking: how high it has risen off the floor (world px), from how far it has come on its own
   * (`own`, 0..1): it rises as it sets off and lands as it arrives. */
  const hoverAt = (own) => (hover > 0 ? hover * Math.sin(Math.PI * clamp(own, 0, 1)) ** 2 : 0)
  /** How high it is (world px, up), at a depth `z`. */
  const heightAt = (z, own) => liftAt(z, lift, reach) + hoverAt(own)
  /**
   * Where its centre is on screen, as an offset from the screen's centre, at a given scale, seen
   * from an eye moved by `eye` ({ x, rise } px: a step's sway and rise).
   */
  const offsetAt = (scale, eye = { x: 0, rise: 0 }, own = 0) => {
    const z = -P * (1 / scale - 1)
    return { x: -eye.x * scale, y: (-heightAt(z, own) + eye.rise) * scale }
  }
  // The line's width on screen: about `line` px whatever the distance (a little wider near).
  const unit = clamp(short / 900, 0.6, 1.25)
  const [far, near] = config.portal.line
  return {
    root,
    reflection,
    redlight,
    veil,
    view,
    frameWidth: gap,
    offsetAt,
    /**
     * scale: how big it looks (1 = the viewport); own 0..1: how far it has come toward the viewer
     * on its own (walking: it rises off the floor while it travels); shown 0..1 (it ignites); veil 0..1 (white
     * over the page: loading or haze); red 0..1 (glow strength); time: ms since the line started
     * to be drawn (negative: not yet); reflect 0..1 (its mirror image in the floor); soften: soft
     * focus in px; spread: how far its red light reaches round it (multiples of its size); eye:
     * where a walking viewer's eye is in its step ({ x, rise } px; nothing at the arrival).
     * Returns how much of the line is drawn (0..1).
     */
    update: ({ scale, own = 0, shown, veil: veilLevel, red, reflect = 1, soften = 0, spread = 1.9, eye = { x: 0, rise: 0 }, time = 0, warm = false }) => {
      // Drawn faintly in the first frames so nothing is painted for the first time mid-motion.
      const floor = warm ? 0.002 : 0
      const z = -P * (1 / scale - 1)
      const y = -heightAt(z, own)
      const arrived = scale >= 0.9999
      // The eye moving right and up moves the world left and down.
      const ex = -eye.x
      const ey = y + eye.rise
      root.style.transform = arrived ? 'none' : `translate3d(${ex.toFixed(2)}px, ${ey.toFixed(2)}px, ${z.toFixed(2)}px)`
      root.style.opacity = Math.max(floor, clamp(shown, 0, 1)).toFixed(3)
      // Soft focus while far (px in the portal's own space, so it shrinks with distance like the portal).
      const blur = soften >= 0.5 ? `blur(${soften.toFixed(1)}px)` : 'none'
      if (root.style.filter !== blur) root.style.filter = blur
      // The line (and its glow) fade as they pass the screen's edges, so the last frames are the
      // page alone, with nothing switching off at the end.
      const leaving = 1 - smoothstep(0.955, 0.997, scale)
      const width = unit * (far + (near - far) * clamp(scale, 0, 1))
      const drawn = draw(warm ? Math.max(time, 0) : time, width / (band * Math.max(scale, 0.05)))
      const tracing = time > 0 ? 1 : 0
      frame.style.opacity = (arrived ? 0 : Math.max(floor, leaving * tracing)).toFixed(3)
      const lit = smootherstep(0.35, 1, drawn)
      glow.style.opacity = Math.max(floor, clamp(red, 0, 1) * clamp(shown, 0, 1) * leaving * lit).toFixed(3)
      veil.style.opacity = clamp(veilLevel, 0, 1).toFixed(3)
      // Mirror about the floor plane y = H: (x, y) → (x, 2H − (y + height)).
      reflection.style.transform = `translate3d(${ex.toFixed(2)}px, ${(2 * H - y + eye.rise).toFixed(2)}px, ${z.toFixed(2)}px) scaleY(-1)`
      reflection.style.opacity = Math.max(floor, 0.75 * reflect * clamp(red, 0, 1) * clamp(shown, 0, 1) * lit * clamp((1 - scale) / 0.35, 0, 1)).toFixed(3)
      // The red it casts on the white around it: follows its projection, fades as it fills the screen.
      const k = scale
      redlight.style.transform = `translate(${(ex * k).toFixed(2)}px, ${(ey * k).toFixed(2)}px) scale(${(k * spread).toFixed(4)})`
      redlight.style.opacity = Math.max(floor, clamp(red, 0, 1) * clamp(shown, 0, 1) * lit * clamp((1 - scale) / 0.5, 0, 1) * 0.9).toFixed(3)
      return drawn
    },
    destroy: () => {},
  }
}
