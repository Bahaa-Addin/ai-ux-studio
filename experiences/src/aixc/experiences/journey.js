/*
 * Copyright (c) isladjan (https://codepen.io/isladjan/pen/abdyPBw)
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and
 * associated documentation files (the "Software"), to deal in the Software without restriction,
 * including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense,
 * and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or substantial
 * portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT
 * LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
 * NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
 * WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
 * SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

/**
 * Scroll journey — adapted from "Parallax scroll animation" (codepen.io/isladjan/pen/abdyPBw).
 *
 * A layered landscape stays pinned behind the content: a red Vodafone sky, the
 * Vodafone mark as the sun, clouds, and five ranges of hills in the brand's red
 * shades down to ink. As you scroll, the layers move at different depths, the sun
 * sets behind the hills and day turns to night with stars. Each category is a
 * chapter that scrolls over the scene; its services sit on white Vodafone cards.
 * Native scroll only (no wheel hijacking); motion is removed under reduced motion.
 *
 * On Vodafone's pages (voice-guide ADR-0076) the view scrolls in its own box instead of the page: the scene
 * pins at the box's bar and its progress reads the box (shared.js's seam: viewBottom(), onScrollFrame()). The
 * scene is drawn only (nothing to press, no controls); the story is a document that scrolls past the box's
 * bottom corners, where Vodafone's accessibility button and the guide's microphone (right) and the Pocket's
 * button (left) sit over it. A link or button of the story is not pressable by a pointer while it passes under a
 * corner's safe zone (keepClear(): pointer-events off, the class jr-under, never inert, so the keyboard and a
 * screen reader still meet every one in order), and one that takes the focus there is scrolled clear of the
 * zones (clearFocus()). journey.css keeps the closing band over the taller zone at the box's end, where nothing
 * follows to scroll it clear. reveal(itemId) scrolls the view to an item's card at once.
 */

import { h, svgIcon } from '../dom.js'
import {
  closingBand, experienceRoot, frame, groupExtras, groupTitle, groupsOf, on, onScrollFrame, onViewZones, promotionOf, scrollByY,
  scrollToElement, serviceCard, clamp, t, viewBottom, viewScroller, viewTop,
} from './shared.js'

const SVG_NS = 'http://www.w3.org/2000/svg'

const svgEl = (tag, attributes = {}) => {
  const node = document.createElementNS(SVG_NS, tag)
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, String(value))
  return node
}

/** Deterministic pseudo-random sequence, so the landscape is the same every time. */
const seeded = (seed) => () => {
  seed = (seed * 16807) % 2147483647
  return (seed - 1) / 2147483646
}

/** A smooth ridge line across a 1440×400 box, closed to the bottom. */
const ridgePath = (seed, { base, amplitude, peaks }) => {
  const rand = seeded(seed)
  const width = 1440
  const step = width / peaks
  const points = Array.from({ length: peaks + 1 }, (_, i) => [i * step, base - amplitude * (0.35 + rand() * 0.65)])
  let d = `M0 400 L0 ${points[0][1].toFixed(1)}`
  for (let i = 1; i < points.length; i += 1) {
    const [x0, y0] = points[i - 1]
    const [x1, y1] = points[i]
    const mid = (x0 + x1) / 2
    d += ` C${mid.toFixed(1)} ${y0.toFixed(1)} ${mid.toFixed(1)} ${y1.toFixed(1)} ${x1.toFixed(1)} ${y1.toFixed(1)}`
  }
  return `${d} L1440 400 Z`
}

const RANGES = [
  { seed: 11, base: 210, amplitude: 120, peaks: 5, fill: 'rgba(255, 255, 255, 0.22)', depth: 0.15 },
  { seed: 23, base: 250, amplitude: 110, peaks: 6, fill: '#c20000', depth: 0.3 },
  { seed: 37, base: 290, amplitude: 100, peaks: 7, fill: '#990000', depth: 0.5 },
  { seed: 51, base: 330, amplitude: 90, peaks: 8, fill: '#5e0000', depth: 0.75 },
  { seed: 67, base: 370, amplitude: 70, peaks: 9, fill: '#14141e', depth: 1 },
]

const buildScene = () => {
  const layer = (className, depth, child) => {
    const node = h('div', { class: `jr-layer ${className}` }, child)
    node.style.setProperty('--depth', String(depth))
    return node
  }

  const stars = svgEl('svg', { class: 'jr-stars__svg', viewBox: '0 0 1440 600', preserveAspectRatio: 'xMidYMid slice', 'aria-hidden': 'true' })
  const rand = seeded(97)
  for (let i = 0; i < 90; i += 1) {
    stars.append(svgEl('circle', { cx: (rand() * 1440).toFixed(1), cy: (rand() * 420).toFixed(1), r: (0.6 + rand() * 1.6).toFixed(2), fill: '#fff', opacity: (0.4 + rand() * 0.6).toFixed(2) }))
  }

  const clouds = svgEl('svg', { class: 'jr-clouds__svg', viewBox: '0 0 1440 300', preserveAspectRatio: 'xMidYMid slice', 'aria-hidden': 'true' })
  const cloud = (x, y, scale) => {
    const g = svgEl('g', { transform: `translate(${x} ${y}) scale(${scale})`, fill: '#fff' })
    ;[
      [0, 30, 60],
      [55, 10, 45],
      [100, 32, 52],
      [-50, 40, 40],
    ].forEach(([cx, cy, r]) => g.append(svgEl('circle', { cx, cy, r })))
    g.append(svgEl('rect', { x: -60, y: 40, width: 220, height: 50, rx: 25 }))
    return g
  }
  // Kept to the top band so they never drift across the intro title.
  clouds.append(cloud(250, 18, 0.42), cloud(720, 56, 0.6), cloud(1080, 16, 0.48), cloud(1330, 100, 0.66))

  const ranges = RANGES.map((range, at) => {
    const svg = svgEl('svg', { class: 'jr-range__svg', viewBox: '0 0 1440 400', preserveAspectRatio: 'none', 'aria-hidden': 'true' })
    svg.append(svgEl('path', { d: ridgePath(range.seed, range), fill: range.fill }))
    const node = layer(`jr-range jr-range--${at + 1}`, range.depth, svg)
    return node
  })

  return h(
    'div',
    { class: 'jr-scene', 'aria-hidden': 'true' },
    h('div', { class: 'jr-sky' }),
    h('div', { class: 'jr-night' }),
    layer('jr-stars', 0.05, stars),
    layer('jr-sun', 0, svgIcon('icon-vodafone-logo-white', 'jr-sun__mark')),
    layer('jr-clouds', 0.2, clouds),
    ranges,
    h('div', { class: 'jr-ground' }),
  )
}

export const renderJourney = (schema, index) => {
  const groups = groupsOf(schema, index)
  const promo = promotionOf(schema, index)

  const chapters = groups.map((group) => {
    const headingId = `jr-h-${group.id}`
    return h(
      'section',
      { class: 'jr-chapter', 'aria-labelledby': headingId, 'data-group': group.id },
      h(
        'header',
        { class: 'jr-chapter__head' },
        group.provenance ? h('p', { class: 'jr-chapter__from' }, group.provenance) : null,
        groupTitle(group, 'h2', 'jr-chapter__title', headingId),
        group.description ? h('p', { class: 'jr-chapter__desc' }, group.description) : null,
        groupExtras(group, { onDark: true }),
      ),
      h('div', { class: `jr-cards${group.items.length === 1 ? ' is-single' : ''}` }, group.items.map((item) => serviceCard(item))),
    )
  })

  const intro = h(
    'header',
    { class: 'jr-intro' },
    // The view's one h1 (no pageHeading beside it); a page with no title has none, never an empty one (the shell
    // gives a blank model title the document's).
    String(index.model.title ?? '').trim() ? h('h1', { class: 'jr-intro__title', id: 'aixc-cover-title', tabindex: '-1', 'data-aixc-focus': '' }, index.model.title) : null,
    index.model.intro ? h('p', { class: 'jr-intro__text' }, index.model.intro) : null,
    h('p', { class: 'jr-intro__hint', 'aria-hidden': 'true' }, h('span', null, t('Scroll to begin'))),
  )

  const scene = buildScene()
  const story = h('div', { class: 'jr-story' }, intro, chapters)
  const root = experienceRoot('journey', schema, scene, story, closingBand(promo))

  /**
   * In a box: each link and button of the view that meets a bottom corner's safe zone (the box's
   * --aixc-safe-{left,right}-{w,h}) takes jr-under (journey.css: no pointer events) while there, the others lose it.
   * A card's stretched title link (.vx-story-link: its ::after covers the card) takes jr-under-card while its card
   * meets one (journey.css: the stretch takes no pointer events, the title itself still does where it is clear), so
   * a card taller than the room clear of the zones keeps its title pressable. Reads first, then writes.
   */
  const pressables = [...root.querySelectorAll('a[href], button')]
  const cards = pressables.map((node) => (node.classList.contains('vx-story-link') ? node.closest('.vx-card') : null))
  const zonesNow = () => {
    const box = viewScroller()
    const style = getComputedStyle(box)
    const px = (name) => Number.parseFloat(style.getPropertyValue(`--aixc-safe-${name}`)) || 0
    const b = box.getBoundingClientRect()
    const left = b.left + box.clientLeft
    const right = left + box.clientWidth
    const bottom = viewBottom()
    return [
      { left: right - px('right-w'), top: bottom - px('right-h'), right, bottom },
      { left, top: bottom - px('left-h'), right: left + px('left-w'), bottom },
    ].filter((z) => z.right > z.left && z.top < z.bottom)
  }
  const meets = (r, z) => r.width > 0 && r.left < z.right && r.right > z.left && r.top < z.bottom && r.bottom > z.top
  const keepClear = () => {
    const zones = zonesNow()
    const inZone = (node) => {
      const r = node.getBoundingClientRect()
      return zones.some((z) => meets(r, z))
    }
    const under = pressables.map((node, at) => [inZone(node), Boolean(cards[at]) && inZone(cards[at])])
    pressables.forEach((node, at) => {
      node.classList.toggle('jr-under', under[at][0])
      if (cards[at]) node.classList.toggle('jr-under-card', under[at][1])
    })
  }
  /** A link or button of the view that took the focus in a corner's zone: the box scrolled until it is clear (16 px over the zone), its top kept under the bar. */
  const clearFocus = (node) => {
    if (!pressables.includes(node) || document.activeElement !== node) return
    const r = node.getBoundingClientRect()
    const dy = Math.min(Math.max(0, ...zonesNow().filter((z) => meets(r, z)).map((z) => r.bottom - z.top + 16)), r.top - viewTop())
    if (dy > 0) scrollByY(dy)
  }

  const update = () => {
    const rect = root.getBoundingClientRect()
    const top = scene.getBoundingClientRect().height ? viewBottom() - scene.getBoundingClientRect().height : 0
    const travel = Math.max(1, rect.height - scene.getBoundingClientRect().height)
    const progress = clamp((top - rect.top) / travel, 0, 1)
    root.style.setProperty('--p', progress.toFixed(4))
    // Day to night across the middle of the journey.
    root.style.setProperty('--night', clamp((progress - 0.3) / 0.45, 0, 1).toFixed(4))
    if (viewScroller()) keepClear()
  }

  let offs = []

  return {
    element: root,
    mount() {
      offs = [
        onScrollFrame(update),
        // In a box: the zones alone change (the Pocket's button showing, the guide listening); a focus taken under a
        // corner (the keyboard reaching a link from below the box's view), after the browser's own scroll to it.
        ...(viewScroller() ? [onViewZones(keepClear), on(root, 'focusin', (event) => frame(() => clearFocus(event.target)))] : []),
      ]
    },
    unmount() {
      for (const off of offs.splice(0)) off()
      for (const node of pressables) node.classList.remove('jr-under', 'jr-under-card')
    },
    /** Scrolls the view to the item's card at once (its top to the pin line); false if the view has none. */
    reveal(itemId) {
      const item = [...root.querySelectorAll('[data-aixc-item]')].find((node) => node.dataset.aixcItem === itemId)
      if (!item) return false
      scrollToElement(item, { instant: true })
      return true
    },
  }
}
