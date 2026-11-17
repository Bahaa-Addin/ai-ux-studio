/*
 * Copyright (c) dilums (https://codepen.io/dilums/full/NWodZMd)
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
 * Spotlight cards — adapted from "Timed Cards Opening" (codepen.io/dilums/full/NWodZMd).
 *
 * One service fills the stage; the next services wait as cards at the bottom
 * end corner (right in English, left in Arabic, where the queue runs leftward). Advancing expands the next card into the stage (a clip-path reveal),
 * slides the queue along, and animates the details panel in. A red timer bar
 * auto-advances; it pauses on hover, focus, the pause button, a hidden tab, and is
 * off by default under reduced motion. The stage is pinned while the page scrolls
 * through the services, so the wheel, a trackpad swipe (sideways too), a drag on
 * the stage, touch and the scrollbar all move between cards; the timer, arrow
 * keys, prev/next and category jumps scroll the page to their card. The closing
 * app promotion follows the stage.
 *
 * On Vodafone's pages (voice-guide ADR-0076) the view scrolls in its own box instead of the page: every
 * scroll read and write goes through shared.js's seam, every handler, frame and timer through on(),
 * frame() and later() while mounted, and spotlight.css keeps the controls and the queue out of the
 * bottom corners' safe zones (below 1180 px, and in a window too short for the desktop layout, the queue is
 * not shown there; on phones the controls row sits under the slide's title, placed by placeRow()).
 * reveal(itemId) steps the stage to an item's card.
 */

import { h, pathIcon } from '../dom.js'
import {
  ICON_NEXT, ICON_PAUSE, ICON_PLAY, ICON_PREV, arrowKeys, chromeOffset, closingBand, ctaFor, dragToScroll, experienceRoot, flatItems,
  frame, groupsOf, guarded, media, observeResize, on, onScrollFrame, onViewResize, onViewScroll, pad2, pageHeading, promotionOf,
  reducedMotion, scrollStepper, sidewaysWheel, t, viewHeight, viewScroller, words,
} from './shared.js'

const DWELL_MS = 6500
const STEP_PX = 200 // page scroll per service
const DRAG_PX = 120 // dragged pixels per service
const QUEUE_DESKTOP = 4
const QUEUE_MOBILE = 2

export const renderSpotlight = (schema, index) => {
  const groups = groupsOf(schema, index)
  const entries = flatItems(groups)
  const total = entries.length
  const promo = promotionOf(schema, index)

  const state = { active: 0, playing: !reducedMotion(), hovered: false, focused: false, elapsed: 0, last: 0, frame: null, mounted: false }

  /* ------------------------------------------------------------- backdrops */
  const backdropFor = (entry) => {
    const layer = h('div', { class: 'sp-backdrop', 'aria-hidden': 'true' })
    if (entry.item.image?.src) {
      const img = h('img', { src: entry.item.image.src, alt: '', decoding: 'async' })
      if (entry.item.image.fit === 'contain') layer.classList.add('is-contain')
      img.addEventListener('error', guarded('image error', () => img.remove()), { once: true })
      layer.append(img)
    }
    return layer
  }
  const backdrops = h('div', { class: 'sp-backdrops' }, backdropFor(entries[0]))

  /* ---------------------------------------------------------------- slides */
  const slides = entries.map(({ item, group }, at) =>
    h(
      'article',
      {
        class: 'sp-slide',
        'data-aixc-item': item.id,
        role: 'group',
        'aria-roledescription': t('slide'),
        'aria-label': t('{n} of {total}: {title}', { n: at + 1, total, title: item.title }),
        hidden: at !== 0,
      },
      h('p', { class: 'sp-slide__place' }, group.title),
      h('h2', { class: 'sp-slide__title' }, item.title),
      item.description ? h('p', { class: 'sp-slide__desc' }, item.description) : null,
      h('div', { class: 'sp-slide__actions' }, ctaFor(item, { variant: 'primary', standalone: true, onDark: true })),
    ),
  )
  const slideList = h('div', { class: 'sp-slides', 'aria-live': state.playing ? 'off' : 'polite' }, slides)

  /* ----------------------------------------------------------------- queue */
  const cards = entries.map(({ item, group }, at) =>
    h(
      'button',
      // data-drag-through: a drag that starts on a card still moves the queue.
      { type: 'button', class: 'sp-card', 'aria-label': words('Show {title}', { title: item.title }), 'data-index': String(at), 'data-drag-through': '' },
      media(item, { className: 'sp-card__media' }),
      h('span', { class: 'sp-card__text', 'aria-hidden': 'true' }, h('span', { class: 'sp-card__place' }, group.title), h('span', { class: 'sp-card__title' }, item.title)),
    ),
  )
  const queue = h('div', { class: 'sp-queue', role: 'group', 'aria-label': t('Up next') }, cards)

  /* -------------------------------------------------------------- controls */
  const prevButton = h('button', { type: 'button', class: 'vx-round vx-on-dark', 'aria-label': words('Previous service') }, pathIcon(ICON_PREV, ''))
  const nextButton = h('button', { type: 'button', class: 'vx-round vx-on-dark', 'aria-label': words('Next service') }, pathIcon(ICON_NEXT, ''))
  const playButton = h('button', { type: 'button', class: 'vx-round vx-on-dark sp-play', 'aria-pressed': 'false' })
  const progressFill = h('span', { class: 'sp-progress__fill' })
  const counter = h('span', { class: 'sp-counter__now' }, '01')
  const controls = h(
    'div',
    { class: 'sp-controls' },
    prevButton,
    nextButton,
    h('div', { class: 'sp-progress', role: 'presentation' }, progressFill),
    h('p', { class: 'sp-counter' }, counter, h('span', { class: 'sp-counter__total' }, ` / ${pad2(total)}`)),
    playButton,
  )
  const timer = h('div', { class: 'sp-timer', 'aria-hidden': 'true' }, h('span', { class: 'sp-timer__fill' }))

  /* -------------------------------------------------------- category jumps */
  const firstIndexOf = new Map()
  entries.forEach((entry, at) => {
    if (!firstIndexOf.has(entry.group.id)) firstIndexOf.set(entry.group.id, at)
  })
  const jumpButtons = groups.map((group) => h('button', { type: 'button', class: 'sp-jump', 'data-group': group.id }, group.title))
  const jumps = h('nav', { class: 'sp-jumps', 'aria-label': words('Jump to a category') }, h('ul', null, jumpButtons.map((button) => h('li', null, button))))
  const details = h('div', { class: 'sp-details' }, slideList)

  const stage = h(
    'section',
    { class: 'sp-stage vx-dark', 'aria-roledescription': t('carousel'), 'aria-label': words('Vodafone services spotlight') },
    backdrops,
    timer,
    jumps,
    details,
    queue,
    controls,
  )

  // The run after the stage is the scroll distance it stays pinned for.
  const track = h('div', { class: 'sp-track' }, stage, h('div', { class: 'sp-track__run', 'aria-hidden': 'true' }))
  track.style.setProperty('--count', String(total))
  track.style.setProperty('--step', `${STEP_PX}px`)

  const root = experienceRoot('spotlight', schema, pageHeading(index), track, closingBand(promo))
  const stepper = scrollStepper({ track, count: total, step: () => STEP_PX })

  /* ----------------------------------------------------------------- logic */
  const queueSize = () => (window.matchMedia('(max-width: 719px)').matches ? QUEUE_MOBILE : QUEUE_DESKTOP)


  const layoutQueue = () => {
    const size = queueSize()
    cards.forEach((card, at) => {
      // 0 = next up; cards already shown park before the queue, later ones after it.
      const slot = at - state.active - 1
      const visible = slot >= 0 && slot < size
      card.style.setProperty('--slot', String(Math.max(-1, Math.min(slot, size))))
      card.classList.toggle('is-queued', visible)
      card.classList.toggle('is-parked', !visible)
      card.inert = !visible
    })
  }

  const syncControls = () => {
    const group = entries[state.active].group
    counter.textContent = pad2(state.active + 1)
    progressFill.style.transform = `scaleX(${(state.active + 1) / total})`
    prevButton.disabled = state.active === 0
    nextButton.disabled = state.active === total - 1
    jumpButtons.forEach((button) => {
      const current = button.dataset.group === group.id
      button.classList.toggle('is-current', current)
      if (current) button.setAttribute('aria-current', 'true')
      else button.removeAttribute('aria-current')
    })
    playButton.replaceChildren(pathIcon(state.playing ? ICON_PAUSE : ICON_PLAY, ''))
    playButton.setAttribute('aria-label', state.playing ? t('Pause automatic rotation') : t('Start automatic rotation'))
    playButton.setAttribute('aria-pressed', String(!state.playing))
    slideList.setAttribute('aria-live', state.playing ? 'off' : 'polite')
  }

  let growing = null

  /** Expands a new backdrop from `fromEl` (a queue card) to the full stage. */
  const revealBackdrop = (entry, fromEl) => {
    // Scrolling fast through several services: drop the reveal still running.
    growing?.cancel()
    growing = null
    const layer = backdropFor(entry)
    backdrops.append(layer)
    const previous = [...backdrops.children].slice(0, -1)
    const finish = () => previous.forEach((node) => node.remove())
    if (reducedMotion() || !fromEl || typeof layer.animate !== 'function') {
      finish()
      return
    }
    const stageRect = stage.getBoundingClientRect()
    const rect = fromEl.getBoundingClientRect()
    const inset = [
      Math.max(0, rect.top - stageRect.top),
      Math.max(0, stageRect.right - rect.right),
      Math.max(0, stageRect.bottom - rect.bottom),
      Math.max(0, rect.left - stageRect.left),
    ]
      .map((value) => `${Math.round(value)}px`)
      .join(' ')
    const animation = layer.animate(
      [{ clipPath: `inset(${inset} round 8px)` }, { clipPath: 'inset(0px 0px 0px 0px round 0px)' }],
      { duration: 650, easing: 'cubic-bezier(0.45, 0, 0.2, 1)' },
    )
    animation.onfinish = finish
    animation.oncancel = finish
    growing = animation
  }

  /** Shows service `next` (called as the scroll position reaches it). */
  const show = (next) => {
    if (next === state.active) return
    const outgoing = slides[state.active]
    const incoming = slides[next]
    // Stepping forward, the backdrop grows out of the card that was next up (when it shows: on phones in a
    // box the queue is not shown, and a card with no box has nothing to grow from).
    const fromEl = next === state.active + 1 ? cards[next] : null
    revealBackdrop(entries[next], fromEl && !fromEl.inert && fromEl.getClientRects().length ? fromEl : null)
    outgoing.hidden = true
    incoming.hidden = false
    incoming.classList.remove('is-entering')
    // Restart the entrance animation.
    void incoming.offsetWidth
    incoming.classList.add('is-entering')
    state.active = next
    state.elapsed = 0
    layoutQueue()
    syncControls()
    placeRow()
    if (document.activeElement && cards.includes(document.activeElement) && document.activeElement.inert) {
      // The clicked card moved away; keep focus on the stage controls.
      nextButton.focus({ preventScroll: true })
    }
  }

  /** Scrolls the page to service `target`; `show` follows from the scroll. */
  const goTo = (target) => stepper.goTo(target)

  const render = () => show(Math.round(stepper.position()))

  /**
   * Pinned under the chrome (the site's on the clone, the view bar in the box); when the stage is taller
   * than the view (a short window, long copy) it pins higher instead, so its controls stay in view.
   */
  const pinTop = () => {
    stage.style.setProperty('--sp-top', `${Math.round(Math.min(chromeOffset(), viewHeight() - stage.offsetHeight))}px`)
  }

  /**
   * On phones in a box the controls row sits right under the shown slide's title (spotlight.css keeps the room
   * for it there), so only the title's lines move it and a heading, not a link, is above it: its top in the
   * stage, from offsets (the title's entrance is a transform and does not move it). Unused from 720 px.
   */
  const placeRow = () => {
    if (!viewScroller()) return
    const title = slides[state.active].querySelector('.sp-slide__title')
    let bottom = title.offsetHeight
    for (let at = title; at && at !== stage; at = at.offsetParent) bottom += at.offsetTop
    stage.style.setProperty('--sp-row-top', `${bottom}px`)
  }

  const fit = () => {
    pinTop()
    placeRow()
  }

  // The timer only runs while the stage is pinned, so it never scrolls the page
  // from elsewhere; on the last service it holds.
  const paused = () => !state.playing || state.hovered || state.focused || document.hidden || !stepper.pinned() || state.active === total - 1

  const tick = (now) => {
    if (!state.mounted) return
    const delta = state.last ? Math.min(now - state.last, 100) : 0
    state.last = now
    if (!paused()) {
      state.elapsed += delta
      if (state.elapsed >= DWELL_MS) {
        state.elapsed = 0
        goTo(state.active + 1)
      }
    }
    timer.firstChild.style.transform = `scaleX(${Math.min(state.elapsed / DWELL_MS, 1)})`
    timer.classList.toggle('is-paused', paused())
    state.frame = frame(tick)
  }

  /* ---------------------------------------------------------------- events */
  const resized = () => {
    layoutQueue()
    fit()
  }
  // Everything the stage listens to while it shows, added on mount through the seam and undone on unmount
  // (or by the seam's reset), so a kept view mounted again listens again.
  const listen = () => [
    onScrollFrame(render),
    dragToScroll(stage, { axis: 'x', factor: STEP_PX / DRAG_PX, touch: true }),
    sidewaysWheel(stage),
    onViewScroll(() => stepper.settle()),
    onViewResize(resized),
    on(prevButton, 'click', () => goTo(state.active - 1)),
    on(nextButton, 'click', () => goTo(state.active + 1)),
    on(playButton, 'click', () => {
      state.playing = !state.playing
      syncControls()
    }),
    on(stage, 'pointerenter', () => (state.hovered = true)),
    on(stage, 'pointerleave', () => (state.hovered = false)),
    on(stage, 'focusin', () => (state.focused = true)),
    on(stage, 'focusout', (event) => {
      if (!stage.contains(event.relatedTarget)) state.focused = false
    }),
    // Left/right follow the reading line (ArrowLeft advances in Arabic).
    arrowKeys(stage, { step: (direction) => goTo(state.active + direction), first: () => goTo(0), last: () => goTo(total - 1), axis: 'x' }),
    ...cards.map((card, at) => on(card, 'click', () => goTo(at))),
    ...jumpButtons.map((button) => on(button, 'click', () => goTo(firstIndexOf.get(button.dataset.group)))),
    // In a box, where the stage flows (below 1180 px, or a short window) it is as tall as each service's copy:
    // pin it again when that changes, so a stage taller than the view keeps its bottom (and its controls) at
    // the box's bottom; and on phones keep the row under the title when the copy reflows (a font arriving).
    ...(viewScroller() ? [observeResize(stage, fit), observeResize(details, placeRow)] : []),
  ]
  let offs = []

  layoutQueue()
  syncControls()

  return {
    element: root,
    mount() {
      state.mounted = true
      state.last = 0
      // Focus left the stage while it was away (its focusout was not heard): start from where it is.
      state.focused = stage.contains(document.activeElement)
      fit()
      offs = listen()
      state.frame = frame(tick)
    },
    unmount() {
      state.mounted = false
      for (const off of offs.splice(0)) off()
      stepper.stop()
      growing?.cancel()
      state.frame?.()
      state.frame = null
    },
    /** Steps the stage to the card of `itemId` at once (the guide's spotlight comes next); false if it has none. */
    reveal(itemId) {
      const at = entries.findIndex((entry) => entry.item.id === itemId)
      if (at < 0) return false
      stepper.goTo(at, { instant: true })
      show(at)
      return true
    },
  }
}
