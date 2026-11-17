/*
 * Copyright (c) cobra_winfrey (https://codepen.io/cobra_winfrey/pen/podWgvv)
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
 * Service ring — adapted from "Infinite February" (codepen.io/cobra_winfrey/pen/podWgvv).
 *
 * The services stand on a huge ring seen from just inside it, as in the
 * reference (radius 200 units, perspective 35): the current service faces you
 * and its neighbours sweep past at the blurred edges as you scroll. Titles are
 * outlined capitals (the current one fills in) with a numbered badge on a stem,
 * alternating above and below like the reference's day numbers. Behind the
 * ring, one panel per service (its photo in grey, darkened through a Vodafone-red
 * gradient inside a black frame) slides vertically while the ring turns
 * horizontally, and fast scrolling stretches and blurs the scene like the
 * reference's velocity effect. Page scroll turns it and it settles on each
 * service; the ring closes on itself, so the last services wait behind the
 * first (to its left in English, to its right in Arabic). The details, counter
 * and prev/next sit under the ring.
 *
 * Right to left (the Arabic page): the ring turns the other way, so the next
 * service always waits on the side the line reads towards (the left), and
 * dragging right turns it forward. Arabic titles are never stroked (outlines
 * show seams where the joined letters overlap); they are filled faintly instead.
 */

import { h, pathIcon } from '../dom.js'
import {
  ICON_NEXT, ICON_PREV, arrowKeys, clamp, closingBand, ctaFor, dragToScroll, experienceRoot, flatItems, groupExtras,
  groupsOf, inlineSign, liveStatus, pad2, pageHeading, promotionOf, reducedMotion, scrollStepper, sidewaysWheel, t,
} from './shared.js'

const STEP_PX = 300
const RADIUS = 200 // ring radius, in units of 1% of the stage's short side
const PERSPECTIVE = 35
const MIN_RING = 12 // fewer services than this keep a 30° spacing and an open ring

/** Display size (in units) for an outlined title, from its longest word and length. */
const titleSize = (title) => {
  const words = String(title).split(/\s+/)
  const longest = Math.max(5, ...words.map((word) => word.length))
  return Math.min(title.length > 24 ? 6 : 7, 44 / (longest * 0.7)).toFixed(2)
}

export const renderRing = (schema, index) => {
  const groups = groupsOf(schema, index)
  const entries = flatItems(groups)
  const total = entries.length
  const promo = promotionOf(schema, index)
  const closed = total >= MIN_RING
  const stepDeg = closed ? 360 / total : 30

  /* ------------------------------------------------------------- the ring */
  const items = entries.map(({ item }, at) => {
    const node = h(
      'button',
      {
        type: 'button',
        class: `rg-item${at % 2 ? ' is-low' : ''}`,
        tabindex: '-1',
        'data-aixc-item': item.id,
        'data-drag-through': '',
        'aria-label': t('{title}, {n} of {total}', { title: item.title, n: at + 1, total }),
      },
      h('span', { class: 'rg-item__badge', 'aria-hidden': 'true' }, pad2(at + 1)),
      h('span', { class: 'rg-item__title', 'aria-hidden': 'true' }, item.title),
    )
    node.style.setProperty('--fs', titleSize(item.title))
    node.addEventListener('click', () => stepper.goTo(at))
    return node
  })
  const wheel = h('div', { class: 'rg-wheel' }, items)
  const ring = h('div', { class: 'rg-ring' }, wheel)

  /* ---------------------------------------------------------------- panels */
  const panels = entries.map(({ item }, at) => {
    const panel = h('div', { class: `rg-panel${at % 2 ? ' is-flip' : ''}${item.image?.fit === 'contain' ? ' is-mark' : ''}`, 'data-src-w': item.image?.width ?? null })
    if (item.image?.src) {
      const img = h('img', { src: item.image.src, alt: '', decoding: 'async' })
      img.addEventListener('error', () => img.remove(), { once: true })
      panel.append(img)
    }
    return panel
  })
  const backdrop = h('div', { class: 'rg-panels', 'aria-hidden': 'true' }, panels)

  /* ------------------------------------------------------ head, foot, nav */
  const headGroup = h('p', { class: 'rg-head__group' })
  const head = h('header', { class: 'rg-head', 'aria-hidden': 'true' }, h('p', { class: 'rg-head__brand' }, index.model.title), headGroup)

  const detailTitle = h('h2', { class: 'vx-sr-only' })
  const detailDesc = h('p', { class: 'rg-detail__desc' })
  const detailActions = h('div', { class: 'rg-detail__actions' })
  const detail = h('div', { class: 'rg-detail' }, detailTitle, detailDesc, detailActions)

  const counterNow = h('span', { class: 'rg-counter__now' }, '01')
  const prevButton = h('button', { type: 'button', class: 'vx-round vx-on-dark', 'aria-label': t('Previous service') }, pathIcon(ICON_PREV, ''))
  const nextButton = h('button', { type: 'button', class: 'vx-round vx-on-dark', 'aria-label': t('Next service') }, pathIcon(ICON_NEXT, ''))
  const foot = h(
    'div',
    { class: 'rg-foot' },
    h('p', { class: 'rg-counter', 'aria-hidden': 'true' }, counterNow, h('span', { class: 'rg-counter__total' }, `/ ${pad2(total)}`)),
    detail,
    h('div', { class: 'rg-nav' }, prevButton, nextButton),
  )
  const status = liveStatus()

  const stage = h(
    'section',
    { class: 'rg-stage vx-dark', 'aria-roledescription': t('carousel'), 'aria-label': t('Vodafone services, ring') },
    backdrop,
    ring,
    h('span', { class: 'rg-edge rg-edge--left', 'aria-hidden': 'true' }),
    h('span', { class: 'rg-edge rg-edge--right', 'aria-hidden': 'true' }),
    head,
    foot,
    h('p', { class: 'rg-hint', 'aria-hidden': 'true' }, t('Scroll to turn the ring')),
    status,
  )
  const track = h('div', { class: 'rg-track' }, stage)
  track.style.setProperty('--count', String(total))
  track.style.setProperty('--step', `${STEP_PX}px`)

  const root = experienceRoot('ring', schema, pageHeading(index), track, closingBand(promo))

  /* ----------------------------------------------------------------- state */
  const stepper = scrollStepper({ track, count: total, step: () => STEP_PX })
  let unit = 7
  let position = 0
  let velocity = 0
  let front = -1
  let drawn = ''
  let last = 0
  let frame = 0
  let mounted = false

  const measure = () => {
    const width = stage.clientWidth || window.innerWidth
    const height = stage.clientHeight || window.innerHeight
    unit = Math.min(width * 1.25, height) / 100
    stage.style.setProperty('--u', `${unit.toFixed(3)}px`)
    // Small photos are softened in proportion to how far the panel enlarges them.
    panels.forEach((panel) => {
      const source = Number(panel.dataset.srcW) || width
      panel.style.setProperty('--blur', `${clamp((width / source - 1.8) * 1.1, 0.8, 4).toFixed(2)}px`)
    })
    drawn = ''
  }

  const showFront = (next) => {
    const { item, group } = entries[next]
    items.forEach((node, at) => node.classList.toggle('is-front', at === next))
    headGroup.textContent = group.title
    detailTitle.textContent = item.title
    detailDesc.textContent = item.description ?? ''
    detailDesc.hidden = !item.description
    const extras = group.items[0] === item ? groupExtras(group, { onDark: true }) : null
    detailActions.replaceChildren(...[ctaFor(item, { variant: 'primary', standalone: true, onDark: true }), extras].filter(Boolean))
    detail.classList.remove('is-changing')
    void detail.offsetWidth
    detail.classList.add('is-changing')
    counterNow.textContent = pad2(next + 1)
    prevButton.disabled = next === 0
    nextButton.disabled = next === total - 1
    status.textContent = t('{n} of {total}: {title}, {group}', { n: next + 1, total, title: item.title, group: group.title })
    front = next
  }

  const draw = () => {
    const key = `${position.toFixed(4)}|${velocity.toFixed(3)}|${unit}`
    if (key === drawn) return
    drawn = key
    const radius = RADIUS * unit
    const limit = PERSPECTIVE * unit * 0.78
    items.forEach((node, at) => {
      let d = at - position
      if (closed) d = ((((d + total / 2) % total) + total) % total) - total / 2
      // Forward along the reading line: later services wait to the right in
      // English and to the left in Arabic, so the ring turns the other way.
      const deg = d * stepDeg * inlineSign
      const rad = (deg * Math.PI) / 180
      const depth = radius * (1 - Math.cos(rad))
      const visible = Math.abs(deg) < 60 && depth < limit
      node.classList.toggle('is-off', !visible)
      if (visible) node.style.transform = `translate3d(${(radius * Math.sin(rad)).toFixed(2)}px, 0, ${depth.toFixed(2)}px) rotateY(${(-deg).toFixed(3)}deg)`
    })
    panels.forEach((panel, at) => {
      const d = at - position
      const visible = Math.abs(d) < 1
      panel.classList.toggle('is-off', !visible)
      if (visible) panel.style.transform = `translateY(${(d * 100).toFixed(3)}%)`
    })
    // The reference's velocity: stretch and blur the ring, dim and blur the panels.
    const stretch = clamp(velocity, 1, 2.2)
    const blur = Math.max(0, velocity * 2 - 1)
    ring.style.transform = stretch > 1.001 ? `scaleX(${stretch.toFixed(3)})` : ''
    ring.style.filter = blur > 0.05 ? `blur(${blur.toFixed(2)}px)` : ''
    backdrop.style.opacity = String(clamp(1 - velocity / 5, 0.15, 1).toFixed(3))
    backdrop.style.filter = blur > 0.05 ? `blur(${blur.toFixed(2)}px)` : ''
    const next = clamp(Math.round(position), 0, total - 1)
    if (next !== front) showFront(next)
  }

  const loop = (now) => {
    if (!mounted) return
    // Two frames can share a timestamp; never divide by a zero step.
    const dt = last ? clamp((now - last) / 1000, 0.001, 0.05) : 0.016
    last = now
    const target = stepper.position()
    const previous = position
    if (reducedMotion()) {
      position = Math.round(target)
      velocity = 0
    } else {
      position += (target - position) * (1 - Math.exp(-dt * 11))
      if (Math.abs(target - position) < 0.0005) position = target
      const speed = (Math.abs(position - previous) / dt) * STEP_PX
      velocity += (speed / 3500 - velocity) * (1 - Math.exp(-dt * 7))
      if (!Number.isFinite(velocity) || velocity < 0.001) velocity = 0
    }
    draw()
    frame = window.requestAnimationFrame(loop)
  }

  prevButton.addEventListener('click', () => stepper.goTo(front - 1))
  nextButton.addEventListener('click', () => stepper.goTo(front + 1))
  arrowKeys(stage, { step: (direction) => stepper.goTo(front + direction), first: () => stepper.goTo(0), last: () => stepper.goTo(total - 1) })

  let stopDrag = null
  let stopWheel = null
  const onScroll = () => stepper.settle()
  const onResize = () => measure()

  showFront(0)

  return {
    element: root,
    afterMount: [measure],
    mount() {
      mounted = true
      last = 0
      measure()
      position = stepper.position()
      stopDrag = dragToScroll(stage, { axis: 'x', factor: STEP_PX / 140, touch: true })
      stopWheel = sidewaysWheel(stage) // sideways swipes walk it too, along the reading line
      window.addEventListener('scroll', onScroll, { passive: true })
      window.addEventListener('resize', onResize)
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
      window.removeEventListener('resize', onResize)
    },
  }
}

