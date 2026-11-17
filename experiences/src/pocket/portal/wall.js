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

/**
 * Elements that stay live above the transition and are never copied (they exist on every page, so
 * they hold still): the guide, Vodafone's accessibility widget (on live a body-level
 * <accessibility-widget> holding button#vodafone-aw-icon; copying it would run Vodafone's widget
 * code again) and the cookie banner.
 */
export const KEEP_LIVE = 'vg-guide, accessibility-widget, #onetrust-consent-sdk, #vodafone-aw-icon'

/** Elements whose copy would load or run something: each becomes an inert stub of its size. */
const MEDIA = 'video, audio, iframe, canvas, object, embed'

/** The overlay's own z-index (portal.css .vf-portal): what floats above it is seen live. */
export const OVERLAY_Z = 2147482000

/** Is `node` a custom element the page has defined (copying it would construct it again)? */
const isDefinedCustom = (node) => {
  if (typeof customElements !== 'object' || !customElements) return false
  const name = node.localName
  const is = node.getAttribute?.('is')
  return Boolean((name.includes('-') && customElements.get(name)) || (is && customElements.get(is)))
}

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

/** An inert box the size and place in the flow of `live` (a custom element: nothing of it is copied). */
const stubOf = (live, make) => {
  const rect = live.getBoundingClientRect()
  const style = getComputedStyle(live)
  const display = style.display === 'none' ? 'none' : style.display === 'inline' ? 'inline-block' : style.display.includes('inline') ? 'inline-block' : 'block'
  return make('div', {
    class: 'vf-portal__media-stub',
    style: {
      display,
      boxSizing: 'border-box',
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      margin: style.margin,
      position: style.position === 'static' || style.position === 'relative' ? style.position : 'absolute',
      ...(style.position === 'fixed' || style.position === 'absolute' ? { left: `${rect.left}px`, top: `${rect.top}px`, margin: '0', position: style.position } : {}),
    },
  })
}

/**
 * A deep copy of `node` in which every defined custom element is a stub: such an element is
 * never cloned, since a clone of it is constructed at once (Vodafone's Angular widget would run
 * again). Only the branches that hold one are copied node by node; the rest is cloned whole.
 */
const copyOf = (node, make) => {
  const defined = [node, ...node.querySelectorAll('*')].filter((element) => element.localName.includes('-') || element.hasAttribute('is')).filter(isDefinedCustom)
  if (!defined.length) return node.cloneNode(true)
  const branches = new Set()
  for (const element of defined) for (let up = element.parentElement; up && up !== node.parentElement; up = up.parentElement) branches.add(up)
  const stubs = new Set(defined)
  const copy = (live) => {
    if (stubs.has(live)) return stubOf(live, make)
    if (!branches.has(live)) return live.cloneNode(true)
    const shallow = live.cloneNode(false)
    for (const child of live.childNodes) shallow.append(child.nodeType === 1 ? copy(child) : child.cloneNode(true))
    return shallow
  }
  return copy(node)
}

/**
 * What the page keeps off screen (F5, 2026-11-17): a skip link above the top, an off-canvas menu beside
 * the screen, a label clipped to a pixel. The elements under `root` (itself included) positioned
 * absolute or fixed, or transformed, whose box lies wholly outside the `width` × `height` viewport with
 * nothing of theirs on it, or is clipped to a pixel or less. Copied, they would show on the tipping wall:
 * a fixed copy is placed from the wall (a transformed box) instead of the screen, outside the face's
 * clip, and a rule that kept one away may name an id the copy has lost. Bounded: only those elements are
 * measured (a branch once, by its outermost; none under display: none), and every box is read before
 * anything is written.
 */
export const offScreen = (root, width, height) => {
  const away = []
  // A box on screen; `e` -1 lets one with no area touch an edge (it stands for what it holds).
  const on = (r, e = 0) => r.right > e && r.bottom > e && r.left < width - e && r.top < height - e
  let skip = null
  for (const node of [root, ...root.querySelectorAll('*')]) {
    if (skip?.contains(node)) continue
    const style = getComputedStyle(node)
    if (style.display === 'none') skip = node
    else if (/^(absolute|fixed)$/.test(style.position) || style.transform !== 'none' || (style.translate || 'none') !== 'none') {
      const r = node.getBoundingClientRect()
      const clipped = style.overflow !== 'visible' || style.clip !== 'auto' || style.clipPath !== 'none'
      // Wholly outside or clipped to a pixel, with nothing in it on screen (inside its clip only a fixed
      // part can be: it escapes the clip).
      if (
        ((r.width <= 1 && r.height <= 1 && clipped) || !on(r, r.width * r.height > 0 ? 0 : -1)) &&
        ![...node.querySelectorAll('*')].some((child) => {
          const c = child.getBoundingClientRect()
          return c.width * c.height > 0 && on(c) && (!clipped || getComputedStyle(child).position === 'fixed')
        })
      )
        away.push((skip = node))
    }
  }
  return away
}

/**
 * Hides the copies of `away` (elements under `live`) in `copy`, a frozen copy of `live`, where they stand,
 * so the copy's layout is unchanged; opacity too, so a part that sets its own visibility stays hidden.
 * (In a stub only `live` itself has a copy.)
 */
export const hideIn = (live, copy, away) => {
  for (const node of away) {
    const twin = follow(copy, pathFrom(live, node))
    if (twin) twin.style.cssText += ';visibility:hidden!important;opacity:0!important'
  }
}

/**
 * A frozen copy of one element for the wall: its look right now, no ids, no lazy images, no live
 * media and no custom elements (each an inert stub), the copied element itself included; what the page
 * keeps off screen is hidden in it (`view`: the viewport's size).
 */
const freeze = (node, make, view) => {
  const away = offScreen(node, view.W, view.H)
  if (node.matches(MEDIA) || isDefinedCustom(node)) {
    const stub = stubOf(node, make)
    stub.setAttribute('aria-hidden', 'true')
    stub.inert = true
    hideIn(node, stub, away)
    return stub
  }
  const copy = copyOf(node, make)
  freezeState(node, copy, view.W * view.H)
  stripIds(copy)
  for (const img of copy.querySelectorAll('img[loading="lazy"]')) img.loading = 'eager'
  for (const media of copy.querySelectorAll(MEDIA)) media.replaceWith(make('div', { class: 'vf-portal__media-stub' }))
  hideIn(node, copy, away)
  copy.setAttribute('aria-hidden', 'true')
  copy.inert = true
  return copy
}

/**
 * The layer's own nodes ([data-aixc], live pages) floating above the overlay (the Tips, z-index
 * 2147483500) are seen live through it; a copy on the wall would show them twice.
 */
const floatsAbove = (node) => {
  if (!node.matches('[data-aixc]')) return false
  const z = Number.parseInt(getComputedStyle(node).zIndex, 10)
  return Number.isFinite(z) && z > OVERLAY_Z
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

/**
 * Builds the slab from the page as it is now. Call in the click handler: the copy is taken
 * before the next paint, so the first frame of the overlay is identical to the page.
 */
export const createWall = ({ camera, config, make, exclude = [] }) => {
  const { W, H } = camera
  const mark = (node) => (config.mark ? (config.mark(node) ?? node) : node)
  const d = config.wall.thickness
  const scrollY = window.scrollY
  const scrollX = window.scrollX
  const background = getComputedStyle(document.body).backgroundColor
  const pageBackground = /rgba\(.*,\s*0\)$|transparent/.test(background) ? getComputedStyle(document.documentElement).backgroundColor || '#fff' : background

  // As wide as the page: a classic scrollbar's gutter is kept beside the overlay (portal.css, F4), so the
  // wall stands for the page alone and carries no copy of the scrollbar.
  const flow = make('div', { class: 'vf-portal__flow', style: { width: `${W}px`, height: `${H}px`, background: pageBackground } })
  const floating = []
  for (const child of document.body.children) {
    if (exclude.includes(child) || child.matches('script, style, link, template, noscript') || child.matches(KEEP_LIVE)) continue
    if (child.matches('[role="status"], [aria-live]') && !child.children.length) continue
    if (!isShown(child)) continue
    // (Each copy is marked as the portal's own, as everything it adds: config.mark.)
    if (isFloating(child)) {
      if (!floatsAbove(child)) floating.push(mark(freeze(child, make, camera)))
    } else flow.append(mark(freeze(child, make, camera)))
  }

  const shade = make('div', { class: 'vf-portal__shade' })
  const seep = make('div', { class: 'vf-portal__seep' })
  const haze = make('div', { class: 'vf-portal__haze' })
  const wash = make('div', { class: 'vf-portal__wash' })
  const face = make('div', { class: 'vf-portal__face', style: { background: pageBackground } }, flow, ...floating, shade, seep, haze, wash)

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
