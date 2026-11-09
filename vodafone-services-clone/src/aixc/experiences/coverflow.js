/**
 * Cover flow — adapted from "Infinite Cover Flow w/ GSAP" (codepen.io/jh3y/pen/WNRvqJP).
 *
 * Services flip past like album covers on a glossy floor. Each cover follows the
 * reference's timeline, computed directly from its distance to the front: it
 * pans from 250% to -350% on power1.inOut, turns from -50° to 50° on
 * power4.inOut, grows in and fades at the ends, and the front cover lifts
 * forward and scales 1.25×, with the reference's z-order ramp and reflections.
 * Page scroll (the reference pins the page and scrubs), a horizontal drag,
 * clicking a cover, prev/next and the arrow keys all move it; it eases after the
 * scroll and settles on a cover. The flow loops, so the last services wait
 * behind the first (to its left in English) and prev/next wrap round. The front
 * service's details sit below the floor.
 *
 * Right to left (the Arabic page) the whole flow mirrors: the next covers wait on
 * the left and travel rightward, turning the other way; dragging right, the left
 * arrow key and the A key move forward, so "next" always runs along the Arabic
 * reading line.
 */

import { h, pathIcon } from '../dom.js'
import {
  ICON_NEXT, ICON_PREV, arrowKeys, clamp, closingBand, ctaFor, dragToScroll, experienceRoot, flatItems, groupExtras, groupsOf,
  inlineSign, liveStatus, media, pad2, pageHeading, promotionOf, reducedMotion, scrollStepper, sidewaysWheel, t,
} from './shared.js'

const STEP_PX = 190
const DRAG_PX = 100 // the reference's drag: 0.001 of the loop per pixel, ten covers
const STAGGER = 0.1
const MIN_LOOP = 11 // fewer covers than this would show the same cover twice when looping
const ICON_MOUSE = 'M12 2a6 6 0 0 0-6 6v8a6 6 0 0 0 12 0V8a6 6 0 0 0-6-6zm0 2a4 4 0 0 1 4 4v8a4 4 0 0 1-8 0V8a4 4 0 0 1 4-4zm-1 2h2v4h-2z'

const power1InOut = (p) => (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2)
const power4InOut = (p) => (p < 0.5 ? 8 * p ** 4 : 1 - (-2 * p + 2) ** 4 / 2)
const power1Out = (p) => 1 - (1 - p) ** 2

export const renderCoverflow = (schema, index) => {
  const groups = groupsOf(schema, index)
  const entries = flatItems(groups)
  const total = entries.length
  const promo = promotionOf(schema, index)
  const loops = total >= MIN_LOOP

  /* ---------------------------------------------------------------- covers */
  const covers = entries.map(({ item }, at) => {
    const cover = h(
      'button',
      { type: 'button', class: 'cf-cover', tabindex: '-1', 'data-aixc-item': item.id, 'data-drag-through': '', 'aria-label': t('{title}, {n} of {total}', { title: item.title, n: at + 1, total }) },
      media(item, { className: 'cf-cover__media', eager: at < 6 || at > total - 6 }),
    )
    cover.addEventListener('click', () => goTo(at))
    return cover
  })
  const flow = h('div', { class: 'cf-flow' }, covers)

  /* ---------------------------------------------------------------- detail */
  const detailGroup = h('p', { class: 'cf-detail__group' })
  const detailTitle = h('h2', { class: 'cf-detail__title' })
  const detailDesc = h('p', { class: 'cf-detail__desc' })
  const detailActions = h('div', { class: 'cf-detail__actions' })
  const detail = h('div', { class: 'cf-detail' }, detailGroup, detailTitle, detailDesc, detailActions)

  const prevButton = h('button', { type: 'button', class: 'cf-button', 'aria-label': t('Previous service') }, pathIcon(ICON_PREV, ''))
  const nextButton = h('button', { type: 'button', class: 'cf-button', 'aria-label': t('Next service') }, pathIcon(ICON_NEXT, ''))
  const counterNow = h('span', { class: 'cf-counter__now' }, '01')
  const controls = h(
    'div',
    { class: 'cf-controls' },
    prevButton,
    h('p', { class: 'cf-counter', 'aria-hidden': 'true' }, counterNow, h('span', { class: 'cf-counter__total' }, ` / ${pad2(total)}`)),
    nextButton,
  )
  const status = liveStatus()

  const stage = h(
    'section',
    { class: 'cf-stage vx-dark', 'aria-roledescription': t('carousel'), 'aria-label': t('Vodafone services, cover flow') },
    h('header', { class: 'cf-head', 'aria-hidden': 'true' }, h('p', { class: 'cf-brand' }, index.model.title), h('p', { class: 'cf-scroll' }, pathIcon(ICON_MOUSE, 'cf-scroll__icon'), t('Scroll, drag or use the arrow keys'))),
    flow,
    h('div', { class: 'cf-floor', 'aria-hidden': 'true' }),
    h('div', { class: 'cf-panel' }, controls, detail),
    status,
  )
  const track = h('div', { class: 'cf-track' }, stage)
  track.style.setProperty('--count', String(total))
  track.style.setProperty('--step', `${STEP_PX}px`)

  const root = experienceRoot('coverflow', schema, pageHeading(index), track, closingBand(promo))

  /* ----------------------------------------------------------------- state */
  const stepper = scrollStepper({ track, count: total, step: () => STEP_PX })
  let position = 0
  let front = -1
  let drawn = ''
  let last = 0
  let frame = 0
  let mounted = false

  const wrap = (value) => (loops ? ((((value + total / 2) % total) + total) % total) - total / 2 : value)
  const mod = (value) => ((value % total) + total) % total

  /** Goes to a cover by the short way round; wrapping jumps the page scroll. */
  const goTo = (at) => {
    const from = front < 0 ? 0 : front
    const delta = wrap(at - from)
    const target = loops ? mod(from + delta) : clamp(at, 0, total - 1)
    stepper.goTo(target, { instant: loops && Math.abs(target - from) > total / 2 })
  }

  const showFront = (next) => {
    const { item, group } = entries[next]
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
    if (!loops) {
      prevButton.disabled = next === 0
      nextButton.disabled = next === total - 1
    }
    covers.forEach((cover, at) => cover.classList.toggle('is-front', at === next))
    status.textContent = t('{n} of {total}: {title}, {group}', { n: next + 1, total, title: item.title, group: group.title })
    front = next
  }

  /** The reference's per-cover timeline, evaluated at p = 0.5 - distance × stagger. */
  const draw = () => {
    const key = position.toFixed(4)
    if (key === drawn) return
    drawn = key
    covers.forEach((cover, at) => {
      const d = wrap(at - position)
      const p = 0.5 - d * STAGGER
      if (p <= 0 || p >= 1) {
        cover.classList.add('is-off')
        return
      }
      cover.classList.remove('is-off')
      // Mirrored in RTL: the next covers wait on the left and turn the other way.
      const pan = (300 - 600 * power1InOut(p)) * inlineSign // percent of a cover, 0 = centred
      const turn = (-50 + 100 * power4InOut(p)) * inlineSign
      const edge = p < 0.1 ? p / 0.1 : p > 0.9 ? (1 - p) / 0.1 : 1
      const lift = Math.abs(p - 0.5) < 0.1 ? power1Out(1 - Math.abs(p - 0.5) / 0.1) : 0
      const scale = (0.5 + 0.5 * edge) * (1 + 0.25 * lift)
      cover.style.transform = `translateX(${pan.toFixed(2)}%) translateZ(${(100 * lift).toFixed(1)}px) rotateY(${turn.toFixed(2)}deg) scale(${scale.toFixed(4)})`
      cover.style.opacity = edge.toFixed(3)
      cover.style.zIndex = String(Math.round(1 + (total - 1) * (1 - Math.abs(p - 0.5) * 2)))
    })
    const next = mod(Math.round(position))
    if (next !== front) showFront(loops ? next : clamp(Math.round(position), 0, total - 1))
  }

  const loop = (now) => {
    if (!mounted) return
    const dt = last ? Math.min((now - last) / 1000, 0.05) : 0.016
    last = now
    let target = stepper.position()
    // Take the short way round after a wrap jump.
    if (loops && Math.abs(target - position) > total / 2) position += target > position ? total : -total
    if (reducedMotion()) position = target
    else {
      position += (target - position) * (1 - Math.exp(-dt * 12))
      if (Math.abs(target - position) < 0.0005) position = target
    }
    draw()
    frame = window.requestAnimationFrame(loop)
  }

  prevButton.addEventListener('click', () => goTo(front - 1))
  nextButton.addEventListener('click', () => goTo(front + 1))
  arrowKeys(stage, { step: (direction) => goTo(front + direction), first: () => goTo(0), last: () => goTo(total - 1) })
  stage.addEventListener('keydown', (event) => {
    // The reference's A / D keys: A is the left-hand key, so it moves forward in RTL.
    if (event.target.closest?.('input, textarea')) return
    if (event.key === 'a' || event.key === 'A') goTo(front - inlineSign)
    else if (event.key === 'd' || event.key === 'D') goTo(front + inlineSign)
  })

  let stopDrag = null
  let stopWheel = null
  const onScroll = () => stepper.settle()

  showFront(0)
  draw()

  return {
    element: root,
    mount() {
      mounted = true
      last = 0
      position = stepper.position()
      drawn = ''
      stopDrag = dragToScroll(stage, { axis: 'x', factor: STEP_PX / DRAG_PX, touch: true })
      stopWheel = sidewaysWheel(stage) // sideways swipes walk it too, along the reading line
      window.addEventListener('scroll', onScroll, { passive: true })
      frame = window.requestAnimationFrame(loop)
    },
    unmount() {
      mounted = false
      window.cancelAnimationFrame(frame)
      stopDrag?.()
      stopWheel?.()
      stopWheel = null
      stopDrag = null
      stepper.stop()
      window.removeEventListener('scroll', onScroll)
    },
  }
}
