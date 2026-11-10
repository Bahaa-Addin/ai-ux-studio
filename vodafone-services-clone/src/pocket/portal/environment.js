/**
 * PortalEnvironment: the world behind the Pocket wall (docs/adr/0005-pocket-portal-transition.md,
 * "The world of light"). Three looks, chosen with `config.tunnel.style`:
 *
 *   'glow' (default)  a glowing, dreamlike white space with nothing in it but light: a soft white
 *                     that settles to a pale pearl at the edges of sight, and a white-hot light
 *                     behind the portal that blooms round it (no mist, no fog, no ground).
 *   'mist'            an infinite, dreamlike white void of glowing fog: lit from within by a
 *                     white-hot light behind the portal (it travels with it, blooms through the
 *                     fog and sends soft shafts out through it), glowing mist round the light,
 *                     settling to a soft cool white with a little body at the edges, the barest
 *                     hint of ground and a fine grain, like a photograph of fog. Two layers of
 *                     lit mist drift and flow toward the viewer in front of the portal, which
 *                     emerges out of the light as it comes near (./controller.js fades it with
 *                     distance). No architecture at all.
 *   'hall'            a gleaming passage: cool-neutral whites fading into pure white, receding
 *                     frames with tubes of light, a glossy floor, a bloom of light (glow layer)
 *                     and waves of light flowing past.
 *
 * Everything static is painted once, ahead of time, with the same projection the browser uses
 * for the CSS layers (./motion.js). What changes over time is a few layers moved and faded with
 * transform and opacity only. Palette: white, soft whites and neutrals; the red belongs to the
 * portal (./gate.js).
 */

import { clamp, fogAt, lerp, project, smoothstep } from './motion.js'

const WHITE = [255, 255, 255]
const FLOOR = [196, 197, 205]
const WALL = [206, 207, 214]
const CEILING = [214, 215, 221]
const RIB = [168, 169, 180]

const mix = (a, b, t) => a.map((v, i) => Math.round(lerp(v, b[i], t)))
const rgb = (c, alpha = 1) => (alpha >= 1 ? `rgb(${c[0]}, ${c[1]}, ${c[2]})` : `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${alpha.toFixed(3)})`)

/** The hall's cross-section and length for a camera (world units are CSS px). */
export const tunnelGeometry = (camera, config) => {
  const [mx, my] = config.tunnel.margin
  return {
    left: -mx * camera.W,
    right: camera.W * (1 + mx),
    top: -my * camera.H,
    floor: camera.H,
    depth: config.tunnel.depth * camera.P,
    fog: config.tunnel.fog * camera.P,
    ribs: config.tunnel.ribs * camera.P,
  }
}

/** Screen rectangle of the hall's cross-section at depth z. */
const sectionAt = (camera, g, z) => {
  const a = project(camera, g.left, g.top, z)
  const b = project(camera, g.right, g.floor, z)
  return { left: a.x, top: a.y, right: b.x, bottom: b.y, k: a.k }
}

/** Depths of the frames, nearest first, until the haze swallows them. */
const ribDepths = (g) => {
  const out = []
  for (let z = -g.ribs * 0.6; z > -g.depth; z -= g.ribs) {
    if (fogAt(z, g.fog) > 0.985) break
    out.push(z)
  }
  return out
}

const quad = (ctx, points) => {
  ctx.beginPath()
  ctx.moveTo(points[0].x, points[0].y)
  for (const p of points.slice(1)) ctx.lineTo(p.x, p.y)
  ctx.closePath()
}

const line = (ctx, a, b, width, style) => {
  ctx.lineWidth = width
  ctx.strokeStyle = style
  ctx.beginPath()
  ctx.moveTo(a.x, a.y)
  ctx.lineTo(b.x, b.y)
  ctx.stroke()
}

/** Every light in the hall, drawn as white of varying strength (the hall paints it crisp, the glow blurs it). */
const paintLights = (ctx, camera, g, strength = 1) => {
  const { cx, cy, W, H } = camera
  const span = g.right - g.left
  const lane = span * 0.075
  // Ceiling strips, and their reflection in the floor.
  for (const side of [-1, 1]) {
    const x0 = cx + side * span * 0.17 - lane / 2
    for (const [y, alpha, widen] of [
      [g.top, 1, 0],
      [g.floor, 0.4, 0.25],
    ]) {
      const end = -g.depth * 0.9
      const a = project(camera, x0 - lane * widen, y, 0)
      const b = project(camera, x0 + lane * (1 + widen), y, 0)
      const c = project(camera, x0 + lane * (1 + widen), y, end)
      const d = project(camera, x0 - lane * widen, y, end)
      const gradient = ctx.createLinearGradient(0, a.y, 0, d.y)
      gradient.addColorStop(0, rgb(WHITE, alpha * strength))
      gradient.addColorStop(1, rgb(WHITE, alpha * strength * 0.5))
      quad(ctx, [a, b, c, d])
      ctx.fillStyle = gradient
      ctx.fill()
    }
  }
  // Tubes of light on the frames; the uprights mirrored in the glossy floor.
  for (const z of ribDepths(g)) {
    const fog = fogAt(z, g.fog)
    const lit = sectionAt(camera, g, z + 26)
    const alpha = strength * (1 - fog * 0.75)
    const width = Math.max(0.9, 3.4 * lit.k)
    ctx.lineWidth = width
    ctx.strokeStyle = rgb(WHITE, alpha)
    ctx.strokeRect(lit.left, lit.top, lit.right - lit.left, lit.bottom - lit.top)
    const drop = (lit.bottom - lit.top) * 0.42
    for (const x of [lit.left, lit.right]) {
      const gradient = ctx.createLinearGradient(0, lit.bottom, 0, lit.bottom + drop)
      gradient.addColorStop(0, rgb(WHITE, alpha * 0.55))
      gradient.addColorStop(1, rgb(WHITE, 0))
      line(ctx, { x, y: lit.bottom }, { x, y: lit.bottom + drop }, width * 1.6, gradient)
    }
  }
  // The source, and its long shine down the glossy floor.
  const far = sectionAt(camera, g, -g.depth)
  const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(far.right - far.left, 40) * 1.4)
  core.addColorStop(0, rgb(WHITE, strength))
  core.addColorStop(0.5, rgb(WHITE, strength * 0.85))
  core.addColorStop(1, rgb(WHITE, 0))
  ctx.fillStyle = core
  ctx.fillRect(0, 0, W, H)
  const horizon = far.bottom
  ctx.save()
  ctx.translate(cx, horizon)
  ctx.scale(1, 0.3)
  const sheen = ctx.createRadialGradient(0, 0, 0, 0, 0, W * 0.55)
  sheen.addColorStop(0, rgb(WHITE, strength * 0.9))
  sheen.addColorStop(0.4, rgb(WHITE, strength * 0.35))
  sheen.addColorStop(1, rgb(WHITE, 0))
  ctx.fillStyle = sheen
  ctx.fillRect(-W, 0, W * 2, W * 2.2)
  ctx.restore()
}

/** Paints the static hall into a 2D context sized camera.W × camera.H (already scaled). */
export const paintTunnel = (ctx, camera, config, ambient = config.light.ambient) => {
  const g = tunnelGeometry(camera, config)
  const { W, H, cx, cy } = camera
  const far = sectionAt(camera, g, -g.depth)
  const colourAt = (base, z) => mix(base, WHITE, fogAt(z, g.fog))
  const depths = Array.from({ length: 28 }, (_, i) => -g.depth * (i / 27) ** 2.2)

  ctx.save()
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, W, H)

  // Floor and ceiling: colour by depth, which on a plane is a function of the screen row.
  const plane = (y, base) => {
    const nearRow = project(camera, cx, y, 0).y
    const farRow = project(camera, cx, y, -g.depth).y
    const gradient = ctx.createLinearGradient(0, nearRow, 0, farRow)
    for (const z of depths) gradient.addColorStop(clamp((project(camera, cx, y, z).y - nearRow) / (farRow - nearRow), 0, 1), rgb(colourAt(base, z)))
    quad(ctx, [project(camera, g.left, y, 0), project(camera, g.right, y, 0), project(camera, g.right, y, -g.depth), project(camera, g.left, y, -g.depth)])
    ctx.fillStyle = gradient
    ctx.fill()
  }
  // Side walls: colour by depth as a function of the screen column.
  const wall = (x, base) => {
    const nearCol = project(camera, x, cy, 0).x
    const farCol = project(camera, x, cy, -g.depth).x
    const gradient = ctx.createLinearGradient(nearCol, 0, farCol, 0)
    for (const z of depths) gradient.addColorStop(clamp((project(camera, x, cy, z).x - nearCol) / (farCol - nearCol), 0, 1), rgb(colourAt(base, z)))
    quad(ctx, [project(camera, x, g.top, 0), project(camera, x, g.floor, 0), project(camera, x, g.floor, -g.depth), project(camera, x, g.top, -g.depth)])
    ctx.fillStyle = gradient
    ctx.fill()
  }
  plane(g.top, CEILING)
  plane(g.floor, FLOOR)
  wall(g.left, WALL)
  wall(g.right, WALL)

  // Seams running into the distance: floor boards, ceiling panels, wall courses.
  const seam = (x, y, alpha) => {
    const p = project(camera, x, y, 0)
    const q = project(camera, x, y, -g.depth * 0.7)
    const gradient = ctx.createLinearGradient(p.x, p.y, q.x, q.y)
    gradient.addColorStop(0, rgb(RIB, alpha))
    gradient.addColorStop(1, rgb(WHITE, 0))
    line(ctx, p, q, 1, gradient)
  }
  const span = g.right - g.left
  for (let i = 1; i < 8; i++) {
    const x = g.left + (span * i) / 8
    seam(x, g.floor, 0.45)
    if (i % 2) seam(x, g.top, 0.3)
  }
  for (const y of [g.top + (g.floor - g.top) * 0.33, g.top + (g.floor - g.top) * 0.66]) {
    seam(g.left, y, 0.3)
    seam(g.right, y, 0.3)
  }

  // The frames' structure: a grey line just behind each tube of light.
  for (const z of ribDepths(g)) {
    const fog = fogAt(z, g.fog)
    const r = sectionAt(camera, g, z)
    ctx.lineWidth = Math.max(0.75, 8 * r.k)
    ctx.strokeStyle = rgb(mix(RIB, WHITE, fog), 0.8)
    ctx.strokeRect(r.left, r.top, r.right - r.left, r.bottom - r.top)
  }

  // The lights themselves, crisp, then the far end and the source's own bloom.
  paintLights(ctx, camera, g, 1)
  ctx.fillStyle = '#fff'
  ctx.fillRect(far.left, far.top, far.right - far.left, far.bottom - far.top)
  const reach = Math.hypot(W, H) * 0.5
  const bloom = ctx.createRadialGradient(cx, cy, 0, cx, cy, reach)
  bloom.addColorStop(0, rgb(WHITE, 1))
  bloom.addColorStop(0.18, rgb(WHITE, 0.9))
  bloom.addColorStop(0.5, rgb(WHITE, 0.28))
  bloom.addColorStop(1, rgb(WHITE, 0))
  ctx.fillStyle = bloom
  ctx.fillRect(0, 0, W, H)

  // The haze of light left once the eye has adapted (baked in: no layer needed for it).
  ctx.fillStyle = rgb(WHITE, ambient)
  ctx.fillRect(0, 0, W, H)

  // A breath of shadow in the far corners of the frame, so the white keeps its depth.
  const vignette = ctx.createRadialGradient(cx, cy, Math.min(W, H) * 0.35, cx, cy, Math.hypot(W, H) * 0.62)
  vignette.addColorStop(0, 'rgba(20, 20, 30, 0)')
  vignette.addColorStop(1, 'rgba(20, 20, 30, 0.08)')
  ctx.fillStyle = vignette
  ctx.fillRect(0, 0, W, H)
  ctx.restore()
  return { geometry: g }
}

const canvasOf = (width, height) => {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width))
  canvas.height = Math.max(1, Math.round(height))
  return canvas
}

/** Halves a canvas `times` times (each halving averages 2 × 2 pixels: a true box blur). */
const halve = (source, times) => {
  let current = source
  for (let i = 0; i < times; i++) {
    const next = canvasOf(current.width / 2, current.height / 2)
    const ctx = next.getContext('2d')
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(current, 0, 0, next.width, next.height)
    current = next
  }
  return current
}

/**
 * The glow: the light map at a quarter of the screen's size, blurred by halving into a tight
 * halo (1/16) and a wide one (1/64), summed back up. Shown stretched to the screen (which
 * smooths it further), as white of varying strength over the hall.
 */
export const paintGlow = (target, camera, config) => {
  const g = tunnelGeometry(camera, config)
  const k = target.width / camera.W
  const map = canvasOf(target.width, target.height)
  const mctx = map.getContext('2d')
  mctx.scale(k, k)
  paintLights(mctx, camera, g, 1)
  const tight = halve(map, 2)
  const wide = halve(tight, 2)
  const ctx = target.getContext('2d')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.globalCompositeOperation = 'lighter'
  ctx.globalAlpha = 1
  ctx.drawImage(wide, 0, 0, target.width, target.height)
  ctx.drawImage(wide, 0, 0, target.width, target.height)
  ctx.globalAlpha = 0.9
  ctx.drawImage(tight, 0, 0, target.width, target.height)
  ctx.globalAlpha = 0.5
  ctx.drawImage(halve(map, 1), 0, 0, target.width, target.height)
  paintRays(ctx, camera, k, config.light.rays)
}

/**
 * Soft shafts of light from the source, painted into the glow (centred on the source, reaching
 * past the corners). Drawn small and blurred by halving, so their edges are soft.
 */
const paintRays = (out, camera, k, strength) => {
  const size = Math.hypot(camera.W, camera.H) * k
  const small = canvasOf(size / 4, size / 4)
  const ctx = small.getContext('2d')
  const c = small.width / 2
  ctx.globalCompositeOperation = 'lighter'
  for (let i = 0; i < 18; i++) {
    const angle = (i / 18) * Math.PI * 2 + (i % 3) * 0.09
    const spread = 0.022 + ((i * 7) % 5) * 0.009
    const reach = c * (0.7 + ((i * 3) % 4) * 0.08)
    const strength = 0.32 + ((i * 5) % 3) * 0.08
    const gradient = ctx.createRadialGradient(c, c, 0, c, c, reach)
    gradient.addColorStop(0, rgb(WHITE, strength))
    gradient.addColorStop(0.4, rgb(WHITE, strength * 0.4))
    gradient.addColorStop(1, rgb(WHITE, 0))
    ctx.fillStyle = gradient
    ctx.beginPath()
    ctx.moveTo(c, c)
    ctx.arc(c, c, reach, angle - spread, angle + spread)
    ctx.closePath()
    ctx.fill()
  }
  const soft = halve(small, 3)
  out.save()
  out.globalAlpha = strength
  out.drawImage(soft, camera.cx * k - size / 2, camera.cy * k - size / 2, size, size)
  out.restore()
}

/* ------------------------------------------------------------------ the misty void */

// The look comes from the reference image the owner gave (2026-11-07: a figure in white fog, "this
// kind of dream white gleam"), then "the mist should be glowing": the fog is lit from within. A
// white-hot light sits behind the portal and travels with it; the fog around it glows, brightest
// near the light and settling to a soft cool white at the edges, where the mist keeps a little
// body so the glow has something to shine against. The cool cast is kept faint (soft white,
// never cyan); the only colour is the portal's red.
const CORE = [240, 244, 246] // the unlit fog at the centre (the light adds the glow)
const AMBIENT = [228, 233, 236] // the unlit fog half way out
const EDGE = [210, 216, 220] // the fog at the edges of sight, where the light hardly reaches
const LUMEN = [255, 255, 255] // mist lit by the light: it glows
const BODY = [207, 214, 219] // the unlit body of the mist, away from the light
const GROUND = [214, 221, 226] // the hint of ground near the viewer

// The glowing white space ('glow'): asked for on 2026-11-08 ("Remove any mist. Just a glowing
// dreaming white background"). Brighter than the misty void at the edges (no fog to grey it), with
// just enough fall-off for the light behind the portal to glow against.
const DREAM_CORE = [246, 247, 249]
const DREAM_MID = [236, 238, 241]
const DREAM_EDGE = [222, 225, 229]

/** A small deterministic random generator (mulberry32), so the fog looks the same every time. */
const randomFrom = (seed) => () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

/**
 * Fractal value noise (smooth noise summed over octaves), normalised to 0..1, for a w × h grid.
 * Its features are wider than they are tall (`stretch`): mist lies in banks.
 */
const fogNoise = (w, h, seed, { octaves = 5, base = 2.5, stretch = 2.4 } = {}) => {
  const rand = randomFrom(seed)
  const out = new Float32Array(w * h)
  let amplitude = 1
  for (let o = 0; o < octaves; o++) {
    const cells = base * 2 ** o
    const gx = Math.ceil(cells) + 2
    const gy = Math.ceil(((cells * h) / w) * stretch) + 2
    const grid = Float32Array.from({ length: gx * gy }, rand)
    for (let y = 0; y < h; y++) {
      const fy = (y / h) * (gy - 2)
      const iy = fy | 0
      const ty = (fy - iy) * (fy - iy) * (3 - 2 * (fy - iy))
      for (let x = 0; x < w; x++) {
        const fx = (x / w) * (gx - 2)
        const ix = fx | 0
        const tx = (fx - ix) * (fx - ix) * (3 - 2 * (fx - ix))
        const a = grid[iy * gx + ix]
        const b = grid[iy * gx + ix + 1]
        const c = grid[(iy + 1) * gx + ix]
        const d = grid[(iy + 1) * gx + ix + 1]
        out[y * w + x] += amplitude * (a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty)
      }
    }
    amplitude *= 0.52
  }
  let min = Infinity
  let max = -Infinity
  for (const v of out) {
    if (v < min) min = v
    if (v > max) max = v
  }
  for (let i = 0; i < out.length; i++) out[i] = (out[i] - min) / (max - min || 1)
  return out
}

/**
 * Banks of mist with gaps between them, lit by the light at the centre: near it the mist glows
 * white; towards the edges, where the light hardly reaches, the same mist is a soft cool grey.
 * `cover`: the noise levels where mist begins and where it is at its thickest; `lumen`/`body`:
 * its opacity near the light and at the edges.
 */
const mistOf = (width, height, seed, { lumen, body, cover = [0.3, 0.66], base = 2.5 }) => {
  // Computed at half the size it is drawn at (it is soft, and this keeps the one-off paint short).
  const canvas = canvasOf(width / 2, height / 2)
  const w = canvas.width
  const h = canvas.height
  const noise = fogNoise(w, h, seed, { base })
  const ctx = canvas.getContext('2d')
  const image = ctx.createImageData(w, h)
  const data = image.data
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // 0 at the light (the centre), 1 at the corners; how much light reaches the mist there.
      const out = Math.min(1, Math.hypot((x - w / 2) / (w / 2), (y - h / 2) / (h / 2)) / Math.SQRT2)
      const lit = 1 - smoothstep(0.12, 0.95, out)
      const dense = smoothstep(cover[0], cover[1], noise[y * w + x])
      const tint = Math.sqrt(lit)
      const i = (y * w + x) * 4
      data[i] = Math.round(lerp(BODY[0], LUMEN[0], tint))
      data[i + 1] = Math.round(lerp(BODY[1], LUMEN[1], tint))
      data[i + 2] = Math.round(lerp(BODY[2], LUMEN[2], tint))
      data[i + 3] = Math.round(255 * dense * lerp(body, lumen, lit))
    }
  }
  ctx.putImageData(image, 0, 0)
  return canvas
}

/** Fine grain, like a photograph of fog: a small tile of light and dark specks. */
const grainTile = (seed, size = 160, strength = 0.05) => {
  const tile = canvasOf(size, size)
  const ctx = tile.getContext('2d')
  const image = ctx.createImageData(size, size)
  const rand = randomFrom(seed)
  for (let i = 0; i < image.data.length; i += 4) {
    const v = rand()
    const dark = v < 0.5
    image.data[i] = image.data[i + 1] = image.data[i + 2] = dark ? 120 : 255
    image.data[i + 3] = Math.round(255 * strength * Math.abs(v - 0.5) * 2)
  }
  ctx.putImageData(image, 0, 0)
  return tile
}

/**
 * Paints the still part of the misty void into a 2D context sized camera.W × camera.H (already
 * scaled), in two parts (`part` 0: the fog and its still mist; 1: the ground and the grain), or
 * both when `part` is left out.
 */
export const paintVoid = (ctx, camera, config, part, dream = false) => {
  if (part === undefined) {
    paintVoid(ctx, camera, config, 0, dream)
    return paintVoid(ctx, camera, config, 1, dream)
  }
  const { W, H, cx, cy } = camera
  ctx.save()
  if (dream) {
    if (part === 1) {
      // A dither too fine to see, so the soft gradient never shows bands.
      ctx.fillStyle = ctx.createPattern(grainTile(11, 160, config.glow.grain), 'repeat')
      ctx.fillRect(0, 0, W, H)
      return ctx.restore()
    }
    const reach = Math.hypot(W, H) * 0.58
    const field = ctx.createRadialGradient(cx, cy, 0, cx, cy, reach)
    field.addColorStop(0, rgb(DREAM_CORE))
    field.addColorStop(0.5, rgb(DREAM_MID))
    field.addColorStop(1, rgb(DREAM_EDGE))
    ctx.fillStyle = field
    ctx.fillRect(0, 0, W, H)
    return ctx.restore()
  }
  if (part === 1) {
    // The barest hint of ground near the viewer, lost in the fog by the horizon.
    const ground = ctx.createLinearGradient(0, cy, 0, H)
    ground.addColorStop(0, rgb(GROUND, 0))
    ground.addColorStop(1, rgb(GROUND, 0.07))
    ctx.fillStyle = ground
    ctx.fillRect(0, cy, W, H - cy)
    // Grain over everything.
    ctx.fillStyle = ctx.createPattern(grainTile(11, 160, config.mist.grain), 'repeat')
    ctx.fillRect(0, 0, W, H)
    return ctx.restore()
  }
  // The fog's own light: glowing round the centre, where the portal will be, settling to a soft
  // cool white at the edges.
  const reach = Math.hypot(W, H) * 0.56
  const field = ctx.createRadialGradient(cx, cy * 0.97, 0, cx, cy * 0.97, reach)
  field.addColorStop(0, rgb(CORE))
  field.addColorStop(0.5, rgb(AMBIENT))
  field.addColorStop(1, rgb(EDGE))
  ctx.fillStyle = field
  ctx.fillRect(0, 0, W, H)
  // Banks of mist that never move: glowing near the light, with a little body at the edges.
  // Smooth noise scales up cleanly with plain bilinear smoothing ('high' is bicubic and took
  // about 20 ms here, a long task on the Pocket page).
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'low'
  ctx.drawImage(mistOf(W / 4, H / 4, 7, { lumen: 0.5 * config.mist.lit, body: 0.4, cover: config.mist.cover }), 0, 0, W, H)
  ctx.restore()
}

/** One drifting layer of mist (painted at a quarter size; it is shown stretched and grows as it flows). */
export const paintMist = (target, seed, config, fine = false) => {
  const ctx = target.getContext('2d')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  // Lit mist: white veils glowing in the light (it veils what is behind it, like the fog in front
  // of a far figure), with a little of the mist's cooler body towards the edges.
  // The nearer layer is finer wisps: small, crisp enough to be seen streaming past (the cue that
  // the viewer is moving); the farther one is broad banks.
  const wisps = fine ? { base: 6, cover: [config.mist.cover[0] + 0.12, config.mist.cover[1] + 0.06] } : { cover: config.mist.cover }
  ctx.drawImage(mistOf(target.width, target.height, seed, { lumen: config.mist.lit, body: 0.3, ...wisps }), 0, 0, target.width, target.height)
}

/**
 * The light in the fog, behind the portal: a white-hot core, a wide bloom (a sum of soft
 * halos, like light scattering in mist) and soft shafts streaming out through the fog. Painted
 * once into a square canvas; it is moved, grown and faded with transform and opacity only.
 */
export const paintLight = (target, config, rays = config.mist.rays) => {
  const size = target.width
  const c = size / 2
  const ctx = target.getContext('2d')
  // The bloom: white-hot at the centre, falling off softly (close to a bell curve) so the fog
  // glows well beyond the portal's frame.
  const bloom = ctx.createRadialGradient(c, c, 0, c, c, c)
  for (const [at, alpha] of [
    [0, 1],
    [0.1, 0.98],
    [0.2, 0.9],
    [0.3, 0.74],
    [0.42, 0.5],
    [0.56, 0.28],
    [0.72, 0.11],
    [0.88, 0.03],
    [1, 0],
  ])
    bloom.addColorStop(at, rgb(LUMEN, alpha))
  ctx.fillStyle = bloom
  ctx.fillRect(0, 0, size, size)
  if (!(rays > 0)) return
  // Shafts: wedges of light from the centre, drawn at a quarter size and softened by halving.
  const small = canvasOf(size / 2, size / 2)
  const sc = small.width / 2
  const shafts = small.getContext('2d')
  shafts.globalCompositeOperation = 'lighter'
  const rand = randomFrom(5)
  const count = 15
  for (let i = 0; i < count; i++) {
    const angle = ((i + rand() * 0.7) / count) * Math.PI * 2
    const spread = 0.025 + rand() * 0.05
    const reach = sc * (0.75 + rand() * 0.25)
    const strength = 0.35 + rand() * 0.35
    const gradient = shafts.createRadialGradient(sc, sc, sc * 0.04, sc, sc, reach)
    gradient.addColorStop(0, rgb(LUMEN, strength))
    gradient.addColorStop(0.5, rgb(LUMEN, strength * 0.55))
    gradient.addColorStop(1, rgb(LUMEN, 0))
    shafts.fillStyle = gradient
    shafts.beginPath()
    shafts.moveTo(sc, sc)
    shafts.arc(sc, sc, reach, angle - spread, angle + spread)
    shafts.closePath()
    shafts.fill()
  }
  ctx.globalCompositeOperation = 'source-over'
  ctx.globalAlpha = clamp(rays, 0, 1)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(halve(small, 2), 0, 0, size, size)
  ctx.globalAlpha = 1
}

/**
 * The environment's DOM: the world's backdrop and the light layers above and in front of it.
 * `paint()` draws everything static (call it ahead of time when possible, or step by step with
 * `paintStep()`); `update()` sets the light for a frame.
 */
export const createEnvironment = ({ camera, config, make }) => {
  const style = ['hall', 'mist'].includes(config.tunnel.style) ? config.tunnel.style : 'glow'
  const dream = style === 'glow'
  const dpr = clamp(window.devicePixelRatio || 1, 1, 2)
  const canvas = make('canvas', { class: 'vf-portal__tunnel', width: Math.round(camera.W * dpr), height: Math.round(camera.H * dpr) })
  const glare = make('div', { class: 'vf-portal__glare' })
  const g = tunnelGeometry(camera, config)
  const quarter = { width: Math.round(camera.W / 4), height: Math.round(camera.H / 4) }
  const glow = style === 'hall' ? make('canvas', { class: 'vf-portal__glowmap', ...quarter }) : null
  const pulses =
    style === 'hall'
      ? Array.from({ length: 5 }, () =>
          make('div', {
            class: 'vf-portal__pulse',
            style: { left: `${g.left}px`, top: `${g.top}px`, width: `${g.right - g.left}px`, height: `${g.floor - g.top}px` },
          }),
        )
      : []
  const mist = style === 'mist' ? [23, 41].map(() => make('canvas', { class: 'vf-portal__mist', ...quarter })) : []
  // The light behind the portal: a square as wide as the screen's diagonal, centred on the
  // screen, moved and grown with the portal.
  const reach = Math.round(Math.hypot(camera.W, camera.H))
  const light =
    style !== 'hall'
      ? make('canvas', {
          class: 'vf-portal__light',
          width: 512,
          height: 512,
          style: { left: `${Math.round(camera.cx - reach / 2)}px`, top: `${Math.round(camera.cy - reach / 2)}px`, width: `${reach}px`, height: `${reach}px` },
        })
      : null
  // Painted in steps, so ahead of time it can be spread over idle moments (each step is a few
  // to about 20 ms; the drawing is finished in the step, not left for the first frame).
  const finish = (target) => target.getContext('2d').getImageData(0, 0, 1, 1)
  const backdrop = canvas.getContext('2d')
  backdrop.scale(dpr, dpr)
  const steps =
    style === 'hall'
      ? [() => (paintTunnel(backdrop, camera, config), finish(canvas)), () => (paintGlow(glow, camera, config), finish(glow))]
      : [
          () => (paintVoid(backdrop, camera, config, 0, dream), finish(canvas)),
          () => (paintVoid(backdrop, camera, config, 1, dream), finish(canvas)),
          () => (paintLight(light, config, dream ? config.glow.rays : config.mist.rays), finish(light)),
          ...mist.map((layer, i) => () => (paintMist(layer, [23, 41][i], config, i === 1), finish(layer))),
        ]
  /** Paints the next part; true while there is more to paint. */
  const paintStep = () => {
    steps.shift()?.()
    return steps.length > 0
  }
  const paint = () => {
    while (paintStep());
  }
  return {
    style,
    /** Behind the portal. */
    back: [canvas, glow, light, glare].filter(Boolean),
    pulses,
    /** In front of the portal, behind the wall: the mist it emerges from. */
    front: mist,
    paint,
    paintStep,
    geometry: g,
    /**
     * glare 0..1 (white over everything behind the portal); glow 0..1 (the hall's bloom);
     * pulses: { z, alpha } waves of light (hall); mist: { scale, x, y, alpha } per mist layer;
     * light: { x, y, scale, alpha } the light behind the portal (mist);
     * warm (true for the first frames: every layer is drawn faintly once, so none is painted for
     * the first time mid-motion; afterwards an invisible layer is exactly 0 and costs nothing).
     */
    update: ({ glare: glareLevel, glow: glowLevel = 0, pulses: waves = [], mist: banks = [], light: source, warm = false }) => {
      const floor = warm ? 0.002 : 0
      const level = (value) => {
        const v = clamp(value, 0, 1)
        return (v < 0.004 ? floor : v).toFixed(3)
      }
      glare.style.opacity = level(glareLevel)
      if (glow) glow.style.opacity = level(glowLevel)
      pulses.forEach((pulse, i) => {
        const wave = waves[i]
        pulse.style.opacity = level(wave?.alpha ?? 0)
        pulse.style.transform = `translateZ(${(wave?.z ?? 0).toFixed(1)}px)`
      })
      if (light) {
        const at = source ?? { x: 0, y: 0, scale: 1, alpha: 0 }
        light.style.opacity = level(at.alpha)
        light.style.transform = `translate3d(${at.x.toFixed(1)}px, ${at.y.toFixed(1)}px, 0) scale(${at.scale.toFixed(4)})`
      }
      mist.forEach((layer, i) => {
        const bank = banks[i] ?? { scale: 1, x: 0, y: 0, alpha: 0 }
        layer.style.opacity = level(bank.alpha)
        layer.style.transform = `translate3d(${bank.x.toFixed(1)}px, ${bank.y.toFixed(1)}px, 0) scale(${bank.scale.toFixed(4)})`
      })
    },
  }
}
