/*
 * Copyright (c) supah (https://codepen.io/supah/pen/xxJMbbg)
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
 * Card fan — adapted from "Carousel with drag and wheel" (codepen.io/supah/pen/xxJMbbg).
 *
 * Numbered service cards fan out along a diagonal: each step away from the
 * current card moves 80% of a card across, 20% down and turns 12° about its
 * bottom-left corner (in Arabic the whole fan mirrors: it runs toward the left,
 * turning the other way about the bottom-right corner, and a drag to the right
 * advances it), with the reference's z-order and fading contents, and its
 * 0.8 s cubic-bezier(0, 0.02, 0, 1) settle. The reference spreads ten cards over
 * its whole range; here the spacing is per card so any number fans the same way.
 * Page scroll (wheel, trackpad, touch), a horizontal drag, a click on a card,
 * the arrow keys and prev/next all move it. The current service's details sit
 * in the free corner below the fan, and a lagging ring cursor follows a mouse.
 *
 * On Vodafone's pages (voice-guide ADR-0076) the view scrolls in its own box instead of the page: every
 * scroll read and write goes through shared.js's seam, every handler, frame and timer through on(),
 * frame() and later() while mounted, and fan.css keeps the details, the controls and the closing band out
 * of the bottom corners' safe zones. The fan itself runs past the stage's sides and into the corner it
 * points at by design (the reference's far cards): there, a card that rests in a corner's safe zone or past
 * the box's side, or is on its way to another place, is inert until it rests clear (keepClear(), again when
 * the zones change); the current card is pressable where it rests but while a zone covers it (the guide
 * listening); prev, next, the arrow keys, a drag and the scroll still reach every card. reveal(itemId) steps
 * the fan to an item's card at once (in a box without the cards' move, so it is pressable at once).
 */

import { h, pathIcon } from '../dom.js'
import { countCategories } from '../../i18n.js'
import {
  ICON_NEXT, ICON_PREV, arrowKeys, closingBand, countWords, ctaFor, dragToScroll, experienceRoot, flatItems, frame, groupExtras,
  groupsOf, later, liveStatus, media, on, onScrollFrame, onViewResize, onViewScroll, onViewZones, pad2, pageHeading, promotionOf, reducedMotion,
  scrollStepper, sidewaysWheel, t, viewScroller, viewTop, words,
} from './shared.js'

const STEP_PX = 210
const DRAG_PX = 110 // horizontal drag per card
const VISIBLE = 4 // cards shown on each side of the current one
const SETTLE_MS = 820 // a card's move (fan.css: 0.8 s) and a frame

export const renderFan = (schema, index) => {
  const groups = groupsOf(schema, index)
  const entries = flatItems(groups)
  const total = entries.length
  const promo = promotionOf(schema, index)

  /* ----------------------------------------------------------------- cards */
  const cards = entries.map(({ item, group }, at) => {
    const card = h(
      'button',
      {
        type: 'button',
        class: 'fn-card',
        tabindex: '-1',
        'data-aixc-item': item.id,
        'data-drag-through': '',
        'aria-label': t('{title}, card {n} of {total}', { title: item.title, n: at + 1, total }),
      },
      h(
        'span',
        { class: 'fn-card__box' },
        media(item, { className: 'fn-card__media', eager: at < 6 }),
        h('span', { class: 'fn-card__num', 'aria-hidden': 'true' }, pad2(at + 1)),
        h('span', { class: 'fn-card__text', 'aria-hidden': 'true' }, h('span', { class: 'fn-card__group' }, group.title), h('span', { class: 'fn-card__title' }, item.title)),
      ),
    )
    return card
  })
  const deck = h('div', { class: 'fn-deck' }, cards)

  /* ---------------------------------------------------------------- detail */
  const detailGroup = h('p', { class: 'fn-detail__group' })
  const detailTitle = h('h2', { class: 'fn-detail__title' })
  const detailDesc = h('p', { class: 'fn-detail__desc' })
  const detailActions = h('div', { class: 'fn-detail__actions' })
  const detail = h('div', { class: 'fn-detail' }, detailGroup, detailTitle, detailDesc, detailActions)

  /* -------------------------------------------------------------- controls */
  const prevButton = h('button', { type: 'button', class: 'vx-round vx-on-dark', 'aria-label': t('Previous card') }, pathIcon(ICON_PREV, ''))
  const nextButton = h('button', { type: 'button', class: 'vx-round vx-on-dark', 'aria-label': t('Next card') }, pathIcon(ICON_NEXT, ''))
  const counterNow = h('span', { class: 'fn-counter__now' }, '01')
  const progressFill = h('span', { class: 'fn-progress__fill' })
  const controls = h(
    'div',
    { class: 'fn-controls' },
    h(
      'div',
      { class: 'fn-controls__row' },
      h('p', { class: 'fn-counter', 'aria-hidden': 'true' }, counterNow, h('span', { class: 'fn-counter__total' }, `/ ${pad2(total)}`)),
      h('span', { class: 'fn-progress', 'aria-hidden': 'true' }, progressFill),
      prevButton,
      nextButton,
    ),
    h('p', { class: 'fn-hint' }, t('Drag the cards, scroll, or use the arrow keys')),
  )
  const status = liveStatus()

  // The reference's frame: a double rule, a turned caption and a two-ring cursor.
  const decor = h(
    'div',
    { class: 'fn-decor', 'aria-hidden': 'true' },
    h('span', { class: 'fn-rule' }),
    h('p', { class: 'fn-turned' }, `${index.model.title} · ${countWords(total)} · ${countCategories(groups.length)}`),
  )
  const cursorRing = h('span', { class: 'fn-cursor', 'aria-hidden': 'true' })
  const cursorDot = h('span', { class: 'fn-cursor fn-cursor--dot', 'aria-hidden': 'true' })

  const stage = h(
    'section',
    { class: 'fn-stage vx-dark', 'aria-roledescription': t('carousel'), 'aria-label': words('Vodafone services, card fan') },
    decor,
    deck,
    detail,
    controls,
    cursorRing,
    cursorDot,
    status,
  )
  const track = h('div', { class: 'fn-track' }, stage)
  track.style.setProperty('--count', String(total))
  track.style.setProperty('--step', `${STEP_PX}px`)

  const root = experienceRoot('fan', schema, pageHeading(index), track, closingBand(promo))

  /* ----------------------------------------------------------------- logic */
  const stepper = scrollStepper({ track, count: total, step: () => STEP_PX })
  let active = -1
  let mounted = false
  let settling = null

  const layout = (current) => {
    cards.forEach((card, at) => {
      const d = at - current
      const far = Math.abs(d)
      card.style.setProperty('--d', String(d))
      card.style.setProperty('--z', String(total - far))
      card.style.setProperty('--fade', String(Math.max(0, 1 - far * 0.3)))
      card.classList.toggle('is-active', d === 0)
      card.classList.toggle('is-away', far > VISIBLE)
    })
  }

  /**
   * In a box: each card that rests in a bottom corner's safe zone (the box's --aixc-safe-{left,right}-{w,h}) or
   * past the box's left or right side is inert, the others not. The current card only while a zone covers it (the
   * guide's transcript bar while it listens; fan.css keeps it clear of the corners' controls otherwise): its title and
   * link are in the details too, and the focus moves to the controls. Read where the stage pins (at the box's end it
   * has scrolled up from there), from the cards' own rects at rest (settleCards()).
   */
  const keepClear = () => {
    const box = viewScroller()
    if (!box || !mounted) return
    const style = getComputedStyle(box)
    const px = (name) => Number.parseFloat(style.getPropertyValue(`--aixc-safe-${name}`)) || 0
    const b = box.getBoundingClientRect()
    const left = b.left + box.clientLeft
    const right = left + box.clientWidth
    const bottom = b.top + box.clientTop + box.clientHeight
    const zones = [
      { left: right - px('right-w'), top: bottom - px('right-h'), right },
      { left, top: bottom - px('left-h'), right: left + px('left-w') },
    ].filter((z) => z.right > z.left && z.top < bottom)
    const dy = viewTop() - stage.getBoundingClientRect().top
    const focused = cards.includes(document.activeElement) ? document.activeElement : null
    cards.forEach((card, at) => {
      const r = card.getBoundingClientRect()
      const cut = r.left < left - 1 || r.right > right + 1
      const inZone = zones.some((z) => r.left < z.right && r.right > z.left && r.bottom + dy > z.top && r.top + dy < bottom)
      card.inert = inZone || (at !== active && (card.classList.contains('is-away') || cut))
    })
    if (focused?.inert) handFocus()
  }

  /** The focus from a card turned inert: Next, or Previous where Next is off, or the stage itself where both are (one card). */
  const handFocus = () => {
    const to = [nextButton, prevButton].find((button) => !button.disabled) ?? stage
    if (to === stage && !stage.hasAttribute('tabindex')) stage.tabIndex = -1
    to.focus({ preventScroll: true })
  }

  /**
   * In a box, after a step: every card is inert while it moves, the current one too (a card on its way crosses the
   * box's sides and the corners: no place to press), then keepClear() where they rest; at once when they do not move
   * (reduced motion, or reveal(), which places them without their move).
   */
  const settleCards = (instant) => {
    if (!viewScroller() || !mounted) return
    settling?.()
    settling = null
    if (instant || reducedMotion()) return keepClear()
    if (cards.includes(document.activeElement)) handFocus()
    for (const card of cards) card.inert = true
    // Then where they rest: a frame late on a busy page, a card can still be on its way at SETTLE_MS (a few more checks).
    const moving = () => cards.some((card) => card.getAnimations?.().some((a) => a.transitionProperty === 'transform' && a.playState === 'running'))
    let tries = 0
    const rest = () => {
      if (moving() && tries++ < 20) {
        settling = later(rest, 50)
        return
      }
      settling = null
      keepClear()
    }
    settling = later(rest, SETTLE_MS)
  }

  /** keepClear() unless the cards are moving (it follows their move). */
  const refit = () => {
    if (!settling) keepClear()
  }

  const show = (next, { announce = true, instant = false } = {}) => {
    const { item, group } = entries[next]
    layout(next)
    detailGroup.textContent = group.title
    detailTitle.textContent = item.title
    detailDesc.textContent = item.description ?? ''
    detailDesc.hidden = !item.description
    const extras = group.items[0] === item ? groupExtras(group, { onDark: true }) : null
    detailActions.replaceChildren(...[ctaFor(item, { variant: 'primary', standalone: true, onDark: true }), extras].filter(Boolean))
    detail.classList.remove('is-changing')
    void detail.offsetWidth
    detail.classList.add('is-changing')
    counterNow.textContent = pad2(next + 1)
    progressFill.style.transform = `scaleX(${(next + 1) / total})`
    prevButton.disabled = next === 0
    nextButton.disabled = next === total - 1
    if (announce) status.textContent = t('{n} of {total}: {title}, {group}', { n: next + 1, total, title: item.title, group: group.title })
    active = next
    settleCards(instant)
  }

  const render = () => {
    const next = Math.round(stepper.position())
    if (next !== active) show(next)
  }

  const onPointer = (event) => {
    if (event.pointerType !== 'mouse' || reducedMotion()) return
    // Physical coordinates on purpose: the cursor follows the mouse in either direction.
    const rect = stage.getBoundingClientRect()
    const x = `${(event.clientX - rect.left).toFixed(1)}px`
    const y = `${(event.clientY - rect.top).toFixed(1)}px`
    cursorRing.style.setProperty('--cx', x)
    cursorRing.style.setProperty('--cy', y)
    cursorDot.style.setProperty('--cx', x)
    cursorDot.style.setProperty('--cy', y)
    stage.classList.add('has-cursor')
  }

  // Everything the stage listens to while it shows, added on mount through the seam and undone on unmount
  // (or by the seam's reset), so a kept view mounted again listens again.
  const listen = () => [
    onScrollFrame(render),
    dragToScroll(stage, { axis: 'x', factor: STEP_PX / DRAG_PX, touch: true }),
    sidewaysWheel(stage), // sideways swipes walk it too, along the reading line
    onViewScroll(() => stepper.settle()),
    on(prevButton, 'click', () => stepper.goTo(active - 1)),
    on(nextButton, 'click', () => stepper.goTo(active + 1)),
    arrowKeys(stage, { step: (direction) => stepper.goTo(active + direction), first: () => stepper.goTo(0), last: () => stepper.goTo(total - 1) }),
    ...cards.map((card, at) => on(card, 'click', () => stepper.goTo(at))),
    on(stage, 'pointermove', onPointer),
    on(stage, 'pointerleave', () => stage.classList.remove('has-cursor')),
    // In a box: which cards are clear changes with the box's size (fan.css sizes them by the room) and with the
    // zones alone (the Pocket's button showing, the guide listening); and once now.
    ...(viewScroller() ? [onViewResize(refit), onViewZones(refit), frame(refit)] : []),
  ]
  let offs = []

  show(0, { announce: false })

  return {
    element: root,
    mount() {
      mounted = true
      offs = listen()
    },
    unmount() {
      mounted = false
      for (const off of offs.splice(0)) off()
      stepper.stop()
      settling?.()
      settling = null
      deck.classList.remove('is-instant')
    },
    /**
     * Steps the fan to the card of `itemId` at once (the guide's spotlight comes next); false if it has none. In a
     * box the cards take their places without their move (fan.css: .fn-deck.is-instant, for a frame), so the card is
     * pressable at once where it is clear.
     */
    reveal(itemId) {
      const at = entries.findIndex((entry) => entry.item.id === itemId)
      if (at < 0) return false
      stepper.goTo(at, { instant: true })
      if (at === active && !settling) return true
      const instant = Boolean(viewScroller()) && mounted
      if (instant) {
        deck.classList.add('is-instant')
        frame(() => deck.classList.remove('is-instant'))
      }
      // Already current but still on its way (a step just before): it only rests at once.
      if (at === active) settleCards(true)
      else show(at, { instant })
      return true
    },
  }
}
