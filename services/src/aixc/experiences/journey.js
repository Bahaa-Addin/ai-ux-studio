/**
 * Scroll journey — adapted from "Parallax scroll animation" (codepen.io/isladjan/pen/abdyPBw).
 *
 * A layered landscape stays pinned behind the content: a red Vodafone sky, the
 * Vodafone mark as the sun, clouds, and five ranges of hills in the brand's red
 * shades down to ink. As you scroll, the layers move at different depths, the sun
 * sets behind the hills and day turns to night with stars. Each category is a
 * chapter that scrolls over the scene; its services sit on white Vodafone cards.
 * Native scroll only (no wheel hijacking); motion is removed under reduced motion.
 */

import { h, svgIcon } from '../dom.js'
import { closingBand, experienceRoot, groupExtras, groupTitle, groupsOf, onScrollFrame, promotionOf, serviceCard, clamp, t } from './shared.js'

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
    h('h1', { class: 'jr-intro__title', id: 'aixc-cover-title', tabindex: '-1', 'data-aixc-focus': '' }, index.model.title),
    index.model.intro ? h('p', { class: 'jr-intro__text' }, index.model.intro) : null,
    h('p', { class: 'jr-intro__hint', 'aria-hidden': 'true' }, h('span', null, t('Scroll to begin'))),
  )

  const scene = buildScene()
  const story = h('div', { class: 'jr-story' }, intro, chapters)
  const root = experienceRoot('journey', schema, scene, story, closingBand(promo))

  let stop = null
  const update = () => {
    const rect = root.getBoundingClientRect()
    const top = scene.getBoundingClientRect().height ? window.innerHeight - scene.getBoundingClientRect().height : 0
    const travel = Math.max(1, rect.height - scene.getBoundingClientRect().height)
    const progress = clamp((top - rect.top) / travel, 0, 1)
    root.style.setProperty('--p', progress.toFixed(4))
    // Day to night across the middle of the journey.
    root.style.setProperty('--night', clamp((progress - 0.3) / 0.45, 0, 1).toFixed(4))
  }

  return {
    element: root,
    mount() {
      stop = onScrollFrame(update)
    },
    unmount() {
      stop?.()
      stop = null
    },
  }
}
