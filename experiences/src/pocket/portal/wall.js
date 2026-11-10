/**
 * PocketWall3D: the whole visible Pocket page as one physical slab that tips over backwards
 * (docs/adr/0005-pocket-portal-transition.md, "The wall").
 *
 * The front face is a frozen copy of exactly what is on screen, made the same way the page
 * turn makes its sheet (../pocket.js): the page's flowing content cloned into a box scrolled to
 * the same place, plus clones of the page's own floating layers. The live page underneath is
 * never moved, restyled or split into parts; the slab moves as one object.
 *
 * Geometry. The slab is W × H × d. It is hinged on its bottom-back edge, so as it tips its
 * underside turns toward the viewer and shows the thickness (from about 20°), and lying flat
 * its face is d above the floor, like a real board. Its top, back and sides never face a
 * viewer standing in front of it, so they are not drawn.
 *
 * Light. Behind it is the source. From the click, light seeps in at its edges (`seep`: the first
 * sign, while the viewer's push is still gentle), leaks round its edges as it goes (`spill`), its
 * face is a touch backlit at first (`shade`), then turns up toward the hall's light and hazes
 * with distance (`haze`), and once down it is absorbed into the luminous floor (`wash`), fully
 * when the viewer stays still, partly when the viewer walks over it.
 *
 * Walking. A walking viewer (./controller.js) pushes the slab over and goes on over it: it moves
 * toward the eye by the distance walked (`walked`) and slides out under the bottom of the screen
 * (often before it is quite flat), rising and falling a little with each step (`eye`). Once it
 * has passed beneath, it is hidden. It never reaches the eye's own plane.
 */

import { clamp, smootherstep } from './motion.js'

/** Elements that stay live above the transition (they exist on every page, so they hold still). */
export const KEEP_LIVE = 'vg-guide, #vodafone-aw-icon'

const stripIds = (root) => {
  root.removeAttribute?.('id')
  for (const node of root.querySelectorAll('[id]')) node.removeAttribute('id')
}

/**
 * Interaction state a clone does not have: the element under the pointer (and its ancestors)
 * shows :hover styles, the focused one :focus-visible. These properties are copied from the
 * live element onto its copy, so the sticker the person is pointing at does not snap back
 * the moment the wall appears. Small components keep their whole subtree's look (rules such
 * as `.card:hover .title`); big containers only their own.
 */
const STATEFUL = [
  'transform', 'translate', 'rotate', 'scale', 'box-shadow', 'background-color', 'color', 'opacity', 'filter',
  'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
  'outline-style', 'outline-width', 'outline-color', 'outline-offset',
  'text-decoration-line', 'text-decoration-color', 'text-decoration-thickness', 'text-underline-offset',
]

const pathFrom = (root, node) => {
  const path = []
  for (let current = node; current && current !== root; current = current.parentElement) path.unshift([...current.parentElement.children].indexOf(current))
  return path
}

const follow = (root, path) => path.reduce((node, index) => node?.children[index], root)

const copyState = (live, copy) => {
  const style = getComputedStyle(live)
  for (const name of STATEFUL) copy.style.setProperty(name, style.getPropertyValue(name))
  copy.style.transition = 'none'
}

const freezeState = (live, copy, viewportArea) => {
  const active = new Set([...live.querySelectorAll(':hover, :focus-visible')])
  if (live.matches(':hover, :focus-visible')) active.add(live)
  for (const node of active) {
    const twin = follow(copy, pathFrom(live, node))
    if (!twin) continue
    const rect = node.getBoundingClientRect()
    const small = rect.width * rect.height < viewportArea * 0.25
    copyState(node, twin)
    if (!small) continue
    const descendants = node.querySelectorAll('*')
    const twins = twin.querySelectorAll('*')
    if (descendants.length !== twins.length || descendants.length > 400) continue
    descendants.forEach((child, i) => copyState(child, twins[i]))
  }
}

/** A frozen copy of one element for the wall: its look right now, no ids, no lazy images, no live media. */
const freeze = (node) => {
  const copy = node.cloneNode(true)
  freezeState(node, copy, window.innerWidth * window.innerHeight)
  stripIds(copy)
  for (const img of copy.querySelectorAll('img[loading="lazy"]')) img.loading = 'eager'
  for (const media of copy.querySelectorAll('video, audio, iframe, canvas')) media.replaceWith(Object.assign(document.createElement('div'), { className: 'vf-portal__media-stub' }))
  copy.setAttribute('aria-hidden', 'true')
  copy.inert = true
  return copy
}

const isFloating = (node) => {
  const position = getComputedStyle(node).position
  return position === 'fixed'
}

const isShown = (node) => {
  if (node.hidden) return false
  const style = getComputedStyle(node)
  return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0
}

/** Classic (non-overlay) scrollbars take width; the wall carries a copy so it matches the screen. */
const scrollbarStrip = ({ width, height, scrollY, scrollHeight, make }) => {
  const thumbHeight = Math.max(30, (height * height) / Math.max(height, scrollHeight))
  const thumbTop = ((height - thumbHeight) * scrollY) / Math.max(1, scrollHeight - height)
  return make(
    'div',
    { class: 'vf-portal__scrollbar', style: { width: `${width}px` } },
    make('div', { class: 'vf-portal__scrollbar-thumb', style: { top: `${thumbTop}px`, height: `${thumbHeight}px` } }),
  )
}

/**
 * Builds the slab from the page as it is now. Call in the click handler: the copy is taken
 * before the next paint, so the first frame of the overlay is identical to the page.
 */
export const createWall = ({ camera, config, make, exclude = [] }) => {
  const { W, H } = camera
  const d = config.wall.thickness
  const scrollY = window.scrollY
  const scrollX = window.scrollX
  const pageWidth = document.documentElement.clientWidth
  const background = getComputedStyle(document.body).backgroundColor
  const pageBackground = /rgba\(.*,\s*0\)$|transparent/.test(background) ? getComputedStyle(document.documentElement).backgroundColor || '#fff' : background

  const flow = make('div', { class: 'vf-portal__flow', style: { width: `${pageWidth}px`, height: `${H}px`, background: pageBackground } })
  const floating = []
  for (const child of document.body.children) {
    if (exclude.includes(child) || child.matches('script, style, link, template, noscript') || child.matches(KEEP_LIVE)) continue
    if (child.matches('[role="status"], [aria-live]') && !child.children.length) continue
    if (!isShown(child)) continue
    if (isFloating(child)) floating.push(freeze(child))
    else flow.append(freeze(child))
  }

  const shade = make('div', { class: 'vf-portal__shade' })
  const seep = make('div', { class: 'vf-portal__seep' })
  const haze = make('div', { class: 'vf-portal__haze' })
  const wash = make('div', { class: 'vf-portal__wash' })
  const face = make('div', { class: 'vf-portal__face', style: { background: pageBackground } }, flow, ...floating)
  if (W > pageWidth) face.append(scrollbarStrip({ width: W - pageWidth, height: H, scrollY, scrollHeight: document.documentElement.scrollHeight, make }))
  face.append(shade, seep, haze, wash)

  const underside = make('div', { class: 'vf-portal__underside', style: { height: `${d}px` } })
  const spill = make('div', { class: 'vf-portal__spill', style: { transform: `translateZ(${-d - 2}px)` } })
  const root = make(
    'div',
    { class: 'vf-portal__wall', style: { width: `${W}px`, height: `${H}px`, transformOrigin: `50% 100% ${-d}px` } },
    spill,
    face,
    underside,
  )

  // Contact shadow on the floor where the slab will lie (a plane on the floor, reaching back).
  const reach = H + d + Math.min(320, H * 0.36)
  const shadow = make('div', {
    class: 'vf-portal__floor-shadow',
    style: { left: `${-W * 0.12}px`, width: `${W * 1.24}px`, top: `${H}px`, height: `${reach}px` },
  })

  /** Must run once the root is in the document: scrolling needs layout. */
  const mount = () => {
    flow.scrollTop = scrollY
    flow.scrollLeft = scrollX
  }

  const push = config.wall.push * camera.P
  return {
    root,
    shadow,
    mount,
    thickness: d,
    /**
     * pushed 0..1 (unlatch), angle in radians (0 upright, π/2 down), light levels spill 0..1,
     * seep 0..1 (light at its edges, on its face), shade 0..1, washed 0..1; walked: px the viewer has walked toward it; eye: { x, rise } px,
     * where the walking viewer's eye is in its step.
     */
    update: ({ pushed, angle, spill: spillLevel, seep: seepLevel = 0, shade: shadeLevel, washed, walked = 0, eye = { x: 0, rise: 0 } }) => {
      const z = -push * pushed + walked
      // Passed beneath the viewer: its top edge, the highest part of it on screen, is below the
      // screen's bottom edge (pushed over, it can leave before it is flat). Or, as a safeguard,
      // its hinge is nearly at the eye's own plane, which a CSS layer must never reach.
      const topY = H - H * Math.cos(angle) - d * Math.sin(angle) + eye.rise
      const topZ = z - d - H * Math.sin(angle) + d * Math.cos(angle)
      const topOnScreen = topZ < camera.P ? camera.cy + ((topY - camera.cy) * camera.P) / (camera.P - topZ) : Infinity
      const gone = walked > 0 && (topOnScreen > H + 4 || z > 0.85 * camera.P)
      const at = `translate3d(${(-eye.x).toFixed(2)}px, ${eye.rise.toFixed(2)}px, ${z.toFixed(2)}px)`
      root.style.transform = `${at} rotateX(${angle.toFixed(5)}rad)`
      const down = angle / (Math.PI / 2)
      spill.style.opacity = clamp(spillLevel, 0, 1).toFixed(3)
      shade.style.opacity = clamp(shadeLevel, 0, 1).toFixed(3)
      seep.style.opacity = clamp(seepLevel, 0, 1).toFixed(3)
      haze.style.opacity = clamp(0.62 * Math.sin(angle) ** 1.5, 0, 1).toFixed(3)
      // Absorbed into the floor's light: it whitens a little while the slab fades away (a slab washed
      // to pure white and then removed would pop against the softly lit floor). The thickness goes
      // first, so the slab is a single plane by the time it turns translucent (which flattens it).
      wash.style.opacity = (0.7 * smootherstep(0, 0.7, washed)).toFixed(3)
      underside.style.opacity = (1 - smootherstep(0, 0.45, washed)).toFixed(3)
      root.style.opacity = (1 - smootherstep(0.45, 1, washed)).toFixed(3)
      root.style.visibility = washed >= 1 || gone ? 'hidden' : 'visible'
      shadow.style.transform = `${at} rotateX(-90deg)`
      shadow.style.opacity = gone ? '0' : clamp(down ** 3 * (1 - washed), 0, 1).toFixed(3)
    },
  }
}
