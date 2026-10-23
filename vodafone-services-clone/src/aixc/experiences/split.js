/**
 * Split slideshow — adapted from "Split Slick Slideshow" (codepen.io/supah/pen/zZaPeE).
 *
 * Each service fills the stage, split down the middle. Moving on slides the two
 * halves past each other in opposite directions (the reference's mirrored
 * sliders) while the title rises through its mask, on the reference's
 * cubic-bezier(0.7, 0, 0.3, 1) with its 1000 / 950 / 900 ms timings. Page scroll
 * drives it (one step of scroll per service, settling on the nearest), and so do
 * the wheel, a mouse drag, the arrow keys, the up/down buttons and the rail,
 * which keeps the reference's line-per-slide look, grouped by category.
 * Photography is darkened under the type; illustrations (fit: contain) become a
 * white mark on Vodafone red.
 */

import { h, pathIcon } from '../dom.js'
import {
  arrowKeys, closingBand, ctaFor, dragToScroll, experienceRoot, flatItems, groupExtras, groupsOf, liveStatus, longestLine,
  onScrollFrame, pad2, pageHeading, promotionOf, scrollStepper,
} from './shared.js'

const STEP_PX = 380
const ICON_UP = 'M7.4 15.4 6 14l6-6 6 6-1.4 1.4-4.6-4.6z'
const ICON_DOWN = 'M16.6 8.6 18 10l-6 6-6-6 1.4-1.4 4.6 4.6z'

const paneFor = (item) => {
  const art = h('div', { class: 'ss-art' })
  if (item.image?.src) {
    const img = h('img', { src: item.image.src, alt: '', decoding: 'async' })
    img.addEventListener('error', () => img.remove(), { once: true })
    art.append(img)
    if (item.image.width) art.style.setProperty('--src-w', `${item.image.width}px`)
  }
  return h('div', { class: `ss-pane${item.image?.fit === 'contain' ? ' is-mark' : ''}`, 'data-pos': '1' }, art)
}

export const renderSplit = (schema, index) => {
  const groups = groupsOf(schema, index)
  const entries = flatItems(groups)
  const total = entries.length
  const promo = promotionOf(schema, index)

  /* ---------------------------------------------------------------- halves */
  // The left half runs in reverse (it moves down as the right half moves up).
  const leftPanes = entries.map(({ item }) => paneFor(item))
  const rightPanes = entries.map(({ item }) => paneFor(item))
  const halves = h(
    'div',
    { class: 'ss-halves', 'aria-hidden': 'true' },
    h('div', { class: 'ss-half ss-half--left' }, leftPanes),
    h('div', { class: 'ss-half ss-half--right' }, rightPanes),
    h('div', { class: 'ss-scrim' }),
  )

  /* ----------------------------------------------------------------- texts */
  const texts = entries.map(({ item, group }, at) => {
    const title = h('h2', { class: 'ss-title' }, h('span', { class: 'ss-title__mask' }, h('span', { class: 'ss-title__text' }, item.title)))
    title.style.setProperty('--cpl', String(longestLine(item.title)))
    const isFirstOfGroup = group.items[0] === item
    return h(
      'article',
      {
        class: 'ss-text',
        'data-aixc-item': item.id,
        'data-pos': at === 0 ? '0' : '1',
        role: 'group',
        'aria-roledescription': 'slide',
        'aria-label': `${at + 1} of ${total}: ${item.title}`,
        inert: at !== 0,
      },
      // Three rows with the title in the middle one, so every title sits on the same
      // line and the masks of the outgoing and incoming titles line up.
      h('div', { class: 'ss-text__top' }, h('p', { class: 'ss-place' }, h('span', { class: 'ss-place__num' }, pad2(at + 1)), h('span', { class: 'ss-place__group' }, group.title))),
      title,
      h(
        'div',
        { class: 'ss-text__bottom' },
        item.description ? h('p', { class: 'ss-desc' }, item.description) : null,
        h(
          'div',
          { class: 'ss-actions' },
          ctaFor(item, { variant: 'secondary', standalone: true, onDark: true }),
          // The category's own call to action travels with its first service.
          isFirstOfGroup ? groupExtras(group, { onDark: true }) : null,
        ),
      ),
    )
  })

  /* ------------------------------------------------------------------ rail */
  const firstIndexOf = new Map()
  entries.forEach((entry, at) => {
    if (!firstIndexOf.has(entry.group.id)) firstIndexOf.set(entry.group.id, at)
  })
  const ticks = []
  const railButtons = groups.map((group) => {
    const lines = group.items.map(() => {
      const tick = h('span', { class: 'ss-rail__tick' })
      ticks.push(tick)
      return tick
    })
    const button = h(
      'button',
      { type: 'button', class: 'ss-rail__group', 'data-group': group.id, 'aria-label': `Go to ${group.title}` },
      h('span', { class: 'ss-rail__label', 'aria-hidden': 'true' }, group.title),
      h('span', { class: 'ss-rail__ticks', 'aria-hidden': 'true' }, lines),
    )
    button.addEventListener('click', () => stepper.goTo(firstIndexOf.get(group.id)))
    return button
  })
  const rail = h('nav', { class: 'ss-rail', 'aria-label': 'Categories' }, h('ul', null, railButtons.map((button) => h('li', null, button))))

  /* -------------------------------------------------------------- controls */
  const prevButton = h('button', { type: 'button', class: 'vx-round vx-on-dark', 'aria-label': 'Previous service' }, pathIcon(ICON_UP, ''))
  const nextButton = h('button', { type: 'button', class: 'vx-round vx-on-dark', 'aria-label': 'Next service' }, pathIcon(ICON_DOWN, ''))
  const counterNow = h('span', { class: 'ss-counter__now' }, '01')
  const controls = h(
    'div',
    { class: 'ss-controls' },
    h('p', { class: 'ss-counter', 'aria-hidden': 'true' }, counterNow, h('span', { class: 'ss-counter__total' }, `/ ${pad2(total)}`)),
    prevButton,
    nextButton,
  )
  const status = liveStatus()

  const stage = h(
    'section',
    { class: 'ss-stage vx-dark', 'aria-roledescription': 'carousel', 'aria-label': 'Vodafone services, split slideshow' },
    halves,
    h(
      'header',
      { class: 'ss-head' },
      h('p', { class: 'ss-brand' }, index.model.title),
      h('p', { class: 'ss-hint' }, 'Scroll, drag or use the arrow keys'),
    ),
    h('div', { class: 'ss-texts' }, texts),
    rail,
    controls,
    status,
  )
  const track = h('div', { class: 'ss-track' }, stage)
  track.style.setProperty('--count', String(total))
  track.style.setProperty('--step', `${STEP_PX}px`)

  const root = experienceRoot('split', schema, pageHeading(index), track, closingBand(promo))

  /* ----------------------------------------------------------------- logic */
  const stepper = scrollStepper({ track, count: total, step: () => STEP_PX })
  let active = 0

  /** Moves every layer to its place for `next`; layers that would cross the stage jump. */
  const place = (nodes, next) => {
    const crossing = []
    nodes.forEach((node, at) => {
      const from = Number(node.dataset.pos)
      const to = Math.max(-1, Math.min(1, at - next))
      if (from === to) return
      if (from !== 0 && to !== 0) {
        node.classList.add('is-jump')
        crossing.push(node)
      }
      node.dataset.pos = String(to)
    })
    if (crossing.length) window.requestAnimationFrame(() => window.requestAnimationFrame(() => crossing.forEach((node) => node.classList.remove('is-jump'))))
  }

  const show = (next, { announce = true } = {}) => {
    place(leftPanes, next)
    place(rightPanes, next)
    place(texts, next)
    texts.forEach((text, at) => (text.inert = at !== next))
    const { item, group } = entries[next]
    counterNow.textContent = pad2(next + 1)
    ticks.forEach((tick, at) => tick.classList.toggle('is-current', at === next))
    railButtons.forEach((button) => {
      const current = button.dataset.group === group.id
      button.classList.toggle('is-current', current)
      if (current) button.setAttribute('aria-current', 'true')
      else button.removeAttribute('aria-current')
    })
    prevButton.disabled = next === 0
    nextButton.disabled = next === total - 1
    stage.dataset.tone = item.image?.fit === 'contain' ? 'mark' : 'photo'
    if (announce) status.textContent = `${next + 1} of ${total}: ${item.title}, ${group.title}`
    active = next
  }

  const render = () => {
    const next = Math.round(stepper.position())
    if (next !== active) show(next)
  }

  prevButton.addEventListener('click', () => stepper.goTo(active - 1))
  nextButton.addEventListener('click', () => stepper.goTo(active + 1))
  arrowKeys(stage, { step: (direction) => stepper.goTo(active + direction), first: () => stepper.goTo(0), last: () => stepper.goTo(total - 1) })

  let stopFrames = null
  let stopDrag = null
  const onScroll = () => stepper.settle()

  // Initial placement: the first service in view, everything else waiting below.
  place(leftPanes, 0)
  place(rightPanes, 0)
  show(0, { announce: false })

  return {
    element: root,
    mount() {
      stopFrames = onScrollFrame(render)
      stopDrag = dragToScroll(stage, { axis: 'y', factor: STEP_PX / 150 })
      window.addEventListener('scroll', onScroll, { passive: true })
    },
    unmount() {
      stopFrames?.()
      stopDrag?.()
      stopFrames = stopDrag = null
      stepper.stop()
      window.removeEventListener('scroll', onScroll)
    },
  }
}
