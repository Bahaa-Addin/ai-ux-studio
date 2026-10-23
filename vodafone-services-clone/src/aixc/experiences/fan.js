/**
 * Card fan — adapted from "Carousel with drag and wheel" (codepen.io/supah/pen/xxJMbbg).
 *
 * Numbered service cards fan out along a diagonal: each step away from the
 * current card moves 80% of a card across, 20% down and turns 12° about its
 * bottom-left corner, with the reference's z-order and fading contents, and its
 * 0.8 s cubic-bezier(0, 0.02, 0, 1) settle. The reference spreads ten cards over
 * its whole range; here the spacing is per card so any number fans the same way.
 * Page scroll (wheel, trackpad, touch), a horizontal drag, a click on a card,
 * the arrow keys and prev/next all move it. The current service's details sit
 * in the free corner below the fan, and a lagging ring cursor follows a mouse.
 */

import { h, pathIcon } from '../dom.js'
import {
  ICON_NEXT, ICON_PREV, arrowKeys, closingBand, ctaFor, dragToScroll, experienceRoot, flatItems, groupExtras, groupsOf,
  liveStatus, media, onScrollFrame, pad2, pageHeading, promotionOf, reducedMotion, scrollStepper,
} from './shared.js'

const STEP_PX = 210
const DRAG_PX = 110 // horizontal drag per card
const VISIBLE = 4 // cards shown on each side of the current one

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
        'aria-label': `${item.title}, card ${at + 1} of ${total}`,
      },
      h(
        'span',
        { class: 'fn-card__box' },
        media(item, { className: 'fn-card__media', eager: at < 6 }),
        h('span', { class: 'fn-card__num', 'aria-hidden': 'true' }, pad2(at + 1)),
        h('span', { class: 'fn-card__text', 'aria-hidden': 'true' }, h('span', { class: 'fn-card__group' }, group.title), h('span', { class: 'fn-card__title' }, item.title)),
      ),
    )
    card.addEventListener('click', () => stepper.goTo(at))
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
  const prevButton = h('button', { type: 'button', class: 'vx-round vx-on-dark', 'aria-label': 'Previous card' }, pathIcon(ICON_PREV, ''))
  const nextButton = h('button', { type: 'button', class: 'vx-round vx-on-dark', 'aria-label': 'Next card' }, pathIcon(ICON_NEXT, ''))
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
    h('p', { class: 'fn-hint' }, 'Drag the cards, scroll, or use the arrow keys'),
  )
  const status = liveStatus()

  // The reference's frame: a double rule, a turned caption and a two-ring cursor.
  const decor = h(
    'div',
    { class: 'fn-decor', 'aria-hidden': 'true' },
    h('span', { class: 'fn-rule' }),
    h('p', { class: 'fn-turned' }, `${index.model.title} · ${total} services · ${groups.length} categories`),
  )
  const cursorRing = h('span', { class: 'fn-cursor', 'aria-hidden': 'true' })
  const cursorDot = h('span', { class: 'fn-cursor fn-cursor--dot', 'aria-hidden': 'true' })

  const stage = h(
    'section',
    { class: 'fn-stage vx-dark', 'aria-roledescription': 'carousel', 'aria-label': 'Vodafone services, card fan' },
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

  const show = (next, { announce = true } = {}) => {
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

  const onPointer = (event) => {
    if (event.pointerType !== 'mouse' || reducedMotion()) return
    const rect = stage.getBoundingClientRect()
    const x = `${(event.clientX - rect.left).toFixed(1)}px`
    const y = `${(event.clientY - rect.top).toFixed(1)}px`
    cursorRing.style.setProperty('--cx', x)
    cursorRing.style.setProperty('--cy', y)
    cursorDot.style.setProperty('--cx', x)
    cursorDot.style.setProperty('--cy', y)
    stage.classList.add('has-cursor')
  }
  const onLeave = () => stage.classList.remove('has-cursor')

  let stopFrames = null
  let stopDrag = null
  const onScroll = () => stepper.settle()

  show(0, { announce: false })

  return {
    element: root,
    mount() {
      stopFrames = onScrollFrame(render)
      stopDrag = dragToScroll(stage, { axis: 'x', factor: STEP_PX / DRAG_PX, touch: true })
      window.addEventListener('scroll', onScroll, { passive: true })
      stage.addEventListener('pointermove', onPointer)
      stage.addEventListener('pointerleave', onLeave)
    },
    unmount() {
      stopFrames?.()
      stopDrag?.()
      stopFrames = stopDrag = null
      stepper.stop()
      window.removeEventListener('scroll', onScroll)
      stage.removeEventListener('pointermove', onPointer)
      stage.removeEventListener('pointerleave', onLeave)
    },
  }
}
