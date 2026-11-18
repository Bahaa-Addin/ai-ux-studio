/*
 * Copyright (c) supah (https://codepen.io/supah/pen/zZaPeE)
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
 *
 * On Vodafone's pages (voice-guide ADR-0076) the view scrolls in its own box instead of the page: every
 * scroll read and write goes through shared.js's seam, every handler and frame through on() and frame()
 * while mounted, and split.css keeps the controls and the rail out of the bottom corners' safe zones (on
 * phones the controls row sits under the slide's title, placed by placeRow()). reveal(itemId) steps the
 * stage to an item's slide.
 */

import { h, pathIcon } from '../dom.js'
import {
  arrowKeys, closingBand, ctaFor, dragToScroll, experienceRoot, flatItems, frame, groupExtras, groupsOf, guarded, liveStatus, longestLine,
  observeResize, on, onScrollFrame, onViewResize, onViewScroll, pad2, pageHeading, promotionOf, scrollStepper, t, viewScroller, words,
} from './shared.js'

const STEP_PX = 380
const ICON_UP = 'M7.4 15.4 6 14l6-6 6 6-1.4 1.4-4.6-4.6z'
const ICON_DOWN = 'M16.6 8.6 18 10l-6 6-6-6 1.4-1.4 4.6 4.6z'

const paneFor = (item) => {
  const art = h('div', { class: 'ss-art' })
  if (item.image?.src) {
    const img = h('img', { src: item.image.src, alt: '', decoding: 'async' })
    img.addEventListener('error', guarded('image error', () => img.remove()), { once: true })
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
  // The start half (left in English, right in Arabic) runs in reverse: it moves
  // down as the end half moves up, so the pair mirrors with the reading line.
  const startPanes = entries.map(({ item }) => paneFor(item))
  const endPanes = entries.map(({ item }) => paneFor(item))
  const halves = h(
    'div',
    { class: 'ss-halves', 'aria-hidden': 'true' },
    h('div', { class: 'ss-half ss-half--start' }, startPanes),
    h('div', { class: 'ss-half ss-half--end' }, endPanes),
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
        'aria-roledescription': t('slide'),
        'aria-label': t('{n} of {total}: {title}', { n: at + 1, total, title: item.title }),
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
      { type: 'button', class: 'ss-rail__group', 'data-group': group.id, 'aria-label': t('Go to {title}', { title: group.title }) },
      h('span', { class: 'ss-rail__label', 'aria-hidden': 'true' }, group.title),
      h('span', { class: 'ss-rail__ticks', 'aria-hidden': 'true' }, lines),
    )
    return button
  })
  const rail = h('nav', { class: 'ss-rail', 'aria-label': t('Categories') }, h('ul', null, railButtons.map((button) => h('li', null, button))))

  /* -------------------------------------------------------------- controls */
  const prevButton = h('button', { type: 'button', class: 'vx-round vx-on-dark', 'aria-label': words('Previous service') }, pathIcon(ICON_UP, ''))
  const nextButton = h('button', { type: 'button', class: 'vx-round vx-on-dark', 'aria-label': words('Next service') }, pathIcon(ICON_DOWN, ''))
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
    { class: 'ss-stage vx-dark', 'aria-roledescription': t('carousel'), 'aria-label': words('Vodafone services, split slideshow') },
    halves,
    h(
      'header',
      { class: 'ss-head' },
      h('p', { class: 'ss-brand' }, index.model.title),
      h('p', { class: 'ss-hint' }, t('Scroll, drag or use the arrow keys')),
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

  // Layers that jumped across the stage, and the frames that let them move again: one clear for all of them, put off
  // by every new jump so the latest gets its two frames too (cancelled on unmount, which clears at once).
  const jumping = new Set()
  let unjump = null
  const unjumpAll = () => {
    jumping.forEach((node) => node.classList.remove('is-jump'))
    jumping.clear()
  }

  /** Moves every layer to its place for `next`; layers that would cross the stage jump. */
  const place = (nodes, next) => {
    let jumped = false
    nodes.forEach((node, at) => {
      const from = Number(node.dataset.pos)
      const to = Math.max(-1, Math.min(1, at - next))
      if (from === to) return
      if (from !== 0 && to !== 0) {
        node.classList.add('is-jump')
        jumping.add(node)
        jumped = true
      }
      node.dataset.pos = String(to)
    })
    if (!jumped) return
    unjump?.()
    unjump = frame(() => {
      unjump = frame(() => {
        unjump = null
        unjumpAll()
      })
    })
  }

  const show = (next, { announce = true } = {}) => {
    place(startPanes, next)
    place(endPanes, next)
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
    if (announce) status.textContent = t('{n} of {total}: {title}, {group}', { n: next + 1, total, title: item.title, group: group.title })
    active = next
    placeRow()
  }

  /**
   * On phones in a box the controls row sits right under the shown slide's title (split.css keeps the room for it
   * there), so a heading, not a link, is above it: the title's bottom in the stage, from offsets (its entrance is a
   * transform and does not move it). Unused from 720 px and on the clone.
   */
  const placeRow = () => {
    if (!viewScroller()) return
    const title = texts[active].querySelector('.ss-title')
    let bottom = title.offsetHeight
    for (let at = title; at && at !== stage; at = at.offsetParent) bottom += at.offsetTop
    stage.style.setProperty('--ss-row-top', `${bottom}px`)
  }

  const render = () => {
    const next = Math.round(stepper.position())
    if (next !== active) show(next)
  }

  // Everything the stage listens to while it shows, added on mount through the seam and undone on unmount
  // (or by the seam's reset), so a kept view mounted again listens again.
  const listen = () => [
    onScrollFrame(render),
    dragToScroll(stage, { axis: 'y', factor: STEP_PX / 150 }),
    onViewScroll(() => stepper.settle()),
    on(prevButton, 'click', () => stepper.goTo(active - 1)),
    on(nextButton, 'click', () => stepper.goTo(active + 1)),
    arrowKeys(stage, { step: (direction) => stepper.goTo(active + direction), first: () => stepper.goTo(0), last: () => stepper.goTo(total - 1) }),
    // A long jump is one clean split transition rather than a scroll through every slide.
    ...railButtons.map((button) =>
      on(button, 'click', () => {
        const target = firstIndexOf.get(button.dataset.group)
        stepper.goTo(target, { instant: Math.abs(target - active) > 2 })
      }),
    ),
    // In a box, on phones, keep the row under the title when the copy moves or reflows: a resize; the safe zones
    // changing (the copy's bottom inset follows them, as when the guide starts listening); a font arriving. Neither
    // of the last two resizes the stage, so each slide's copy and title are watched too.
    ...(viewScroller()
      ? [
          onViewResize(placeRow),
          observeResize(stage, placeRow),
          ...texts.flatMap((text) => [observeResize(text, placeRow), observeResize(text.querySelector('.ss-title'), placeRow)]),
        ]
      : []),
  ]
  let offs = []

  // Initial placement: the first service in view, everything else waiting below.
  place(startPanes, 0)
  place(endPanes, 0)
  show(0, { announce: false })

  return {
    element: root,
    mount() {
      placeRow()
      offs = listen()
    },
    unmount() {
      for (const off of offs.splice(0)) off()
      stepper.stop()
      unjump?.()
      unjump = null
      unjumpAll()
    },
    /** Steps the stage to the slide of `itemId` at once (the guide's spotlight comes next); false if it has none. */
    reveal(itemId) {
      const at = entries.findIndex((entry) => entry.item.id === itemId)
      if (at < 0) return false
      stepper.goTo(at, { instant: true })
      if (at !== active) show(at)
      return true
    },
  }
}
