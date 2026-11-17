/*
 * Copyright (c) aleksa-rakocevic (https://codepen.io/aleksa-rakocevic/pen/pvbboZx)
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
 * Hyper tunnel — adapted from "Hyper Scroll" (codepen.io/aleksa-rakocevic/pen/pvbboZx).
 *
 * Scrolling flies a camera down a 3D tunnel (CSS 3D, no WebGL). Each category
 * opens with its name as giant outlined capitals, the reference's "every fourth
 * item is a word", followed by its services as dark glass cards on a spiral: a
 * red ID, the title, the image, the description and the link, a data footer and
 * a big faded number, with the reference's red hover frame and corner brackets.
 * Items fade in from the depth and out as they pass. Scroll speed warps the
 * perspective, stretches the starfield and splits the outlined words into red
 * and white; the pointer tilts the world; cards float. A HUD reports speed,
 * depth and position. The camera eases after the scroll (the reference used
 * Lenis) and settles on each title or card. Under reduced motion the tunnel is
 * laid out flat instead.
 *
 * Right to left (the Arabic page): the spiral and the cards' tilts are mirrored,
 * card text and corners follow the reading line, the Latin "VF-01" IDs keep their
 * order, and Arabic category words are filled faintly instead of outlined (a
 * stroke shows seams where the joined letters overlap).
 */

import { h, pathIcon } from '../dom.js'
import {
  ICON_NEXT, ICON_PREV, arrowKeys, chromeOffset, clamp, closingBand, ctaFor, experienceRoot, groupExtras, groupsOf, inlineSign,
  liveStatus, media, pad2, pageHeading, promotionOf, reducedMotion, scrollStepper, t,
} from './shared.js'

const STEP_PX = 320 // page scroll per tunnel slot
const Z_GAP = 800 // depth between slots (the reference's zGap)
const FOCUS_Z = -260 // where a settled item rests in front of the camera
const STAR_COUNT = 140
const STAR_LOOP = 6000

const domainOf = (href) => {
  try {
    return new URL(href).hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}

/** Small deterministic pseudo-random numbers, so the layout is the same every visit. */
const seeded = (seed) => {
  let value = seed % 2147483647 || 1
  return () => {
    value = (value * 16807) % 2147483647
    return (value - 1) / 2147483646
  }
}

export const renderTunnel = (schema, index) => {
  const groups = groupsOf(schema, index)
  const promo = promotionOf(schema, index)
  const total = groups.reduce((sum, group) => sum + group.items.length, 0)
  const random = seeded(29)

  /* ----------------------------------------------------------------- slots */
  // One slot per category word, then one per service card, in reading order.
  const slots = []
  let serial = 0
  groups.forEach((group, groupIndex) => {
    const heading = h('h2', { class: 'tn-word' }, h('span', { class: 'tn-word__num' }, pad2(groupIndex + 1)), group.title)
    heading.style.setProperty('--len', String(Math.max(5, ...String(group.title).split(/\s+/).map((part) => part.length))))
    const word = h('div', { class: 'tn-item tn-item--word' }, heading)
    slots.push({ el: word, heading, type: 'word', group, x: 0, y: 0, rot: 0, split: 0 })
    group.items.forEach((item) => {
      serial += 1
      const number = serial
      const domain = item.cta?.href ? domainOf(item.cta.href) : null
      const extras = group.items[0] === item ? groupExtras(group, { onDark: true }) : null
      const card = h(
        'article',
        { class: 'tn-card', 'data-aixc-item': item.id, 'aria-label': t('{n} of {total}: {title}', { n: number, total, title: item.title }) },
        // The ID is a Latin code: dir="ltr" keeps "VF-01" from reordering to "01-VF".
        h('div', { class: 'tn-card__head' }, h('span', { class: 'tn-card__id', dir: 'ltr' }, `VF-${pad2(number)}`), h('span', { class: 'tn-card__group' }, group.title), h('span', { class: 'tn-card__square', 'aria-hidden': 'true' })),
        media(item, { className: 'tn-card__media' }),
        h('h3', { class: 'tn-card__title' }, item.title),
        item.description ? h('p', { class: 'tn-card__desc' }, item.description) : null,
        h('div', { class: 'tn-card__actions' }, ctaFor(item, { variant: 'text', standalone: true, onDark: true }), extras),
        h(
          'div',
          { class: 'tn-card__foot', 'aria-hidden': 'true' },
          h('span', null, t('CAT: {n}/{total}', { n: pad2(groupIndex + 1), total: pad2(groups.length) })),
          h('span', null, domain ? t('LINK: {domain}', { domain }) : t('LINK: IN THE APP')),
        ),
        h('span', { class: 'tn-card__big', 'aria-hidden': 'true' }, pad2(number)),
      )
      const wrapper = h('div', { class: 'tn-item tn-item--card' }, card)
      // Tilts mirror with the page, like the spiral.
      slots.push({ el: wrapper, card, type: 'card', group, item, number, rot: (random() - 0.5) * 16 * inlineSign, phase: random() * Math.PI * 2 })
    })
  })
  const count = slots.length
  slots.forEach((slot, at) => {
    slot.at = at
    if (slot.type === 'card') {
      // The reference's spiral: three turns over the whole run. It starts on the
      // reading line's end side and its handedness mirrors in right to left.
      const angle = (at / count) * Math.PI * 6
      slot.ax = Math.cos(angle) * inlineSign
      slot.ay = Math.sin(angle)
    } else {
      slot.ax = 0
      slot.ay = 0
    }
  })
  const cardSlots = slots.filter((slot) => slot.type === 'card')

  const stars = Array.from({ length: STAR_COUNT }, () => {
    const el = h('span', { class: `tn-star${random() < 0.12 ? ' is-red' : ''}` })
    const x = (random() - 0.5) * 3000
    const y = (random() - 0.5) * 3000
    // Streaks point away from the centre, like light rushing past.
    return { el, x, y, z: -random() * STAR_LOOP, angle: (Math.atan2(y, x) * 180) / Math.PI }
  })

  const world = h('div', { class: 'tn-world' }, stars.map((star) => star.el), slots.map((slot) => slot.el))
  const viewport = h('div', { class: 'tn-viewport' }, world)

  /* ------------------------------------------------------------------- HUD */
  const speedOut = h('strong', null, '0.00')
  const velOut = h('strong', null, '0.00')
  const depthOut = h('strong', null, '000000')
  const placeOut = h('strong', null, '')
  const prevButton = h('button', { type: 'button', class: 'vx-round vx-on-dark', 'aria-label': t('Previous service') }, pathIcon(ICON_PREV, ''))
  const nextButton = h('button', { type: 'button', class: 'vx-round vx-on-dark', 'aria-label': t('Next service') }, pathIcon(ICON_NEXT, ''))
  const hud = h(
    'div',
    { class: 'tn-hud' },
    h('div', { class: 'tn-hud__row', 'aria-hidden': 'true' }, h('span', null, index.model.title), h('span', { class: 'tn-hud__line' }), h('span', null, `${t('Speed')} `, speedOut)),
    h('p', { class: 'tn-hud__side', 'aria-hidden': 'true' }, `${t('Scroll velocity')} // `, velOut),
    h(
      'div',
      { class: 'tn-hud__row' },
      h('span', { 'aria-hidden': 'true' }, `${t('Depth')} `, depthOut),
      h('span', { class: 'tn-hud__line', 'aria-hidden': 'true' }),
      h('span', { class: 'tn-hud__place', 'aria-hidden': 'true' }, placeOut),
      h('span', { class: 'tn-hud__nav' }, prevButton, nextButton),
    ),
  )
  const status = liveStatus()

  const stage = h(
    'section',
    { class: 'tn-stage vx-dark', 'aria-label': t('Vodafone services, hyper tunnel') },
    viewport,
    h('div', { class: 'tn-fx tn-fx--scanlines', 'aria-hidden': 'true' }),
    h('div', { class: 'tn-fx tn-fx--vignette', 'aria-hidden': 'true' }),
    h('div', { class: 'tn-fx tn-fx--noise', 'aria-hidden': 'true' }),
    hud,
    h('p', { class: 'tn-hint', 'aria-hidden': 'true' }, t('Scroll to fly through')),
    status,
  )
  const track = h('div', { class: 'tn-track' }, stage)
  track.style.setProperty('--count', String(count))
  track.style.setProperty('--step', `${STEP_PX}px`)

  const root = experienceRoot('tunnel', schema, pageHeading(index), track, closingBand(promo))

  /* ----------------------------------------------------------------- state */
  const stepper = scrollStepper({ track, count, step: () => STEP_PX })
  let position = 0
  let velocity = 0 // scroll px per frame, smoothed
  let spreadX = 400
  let spreadY = 200
  let mouseX = 0
  let mouseY = 0
  let current = -1
  let last = 0
  let frame = 0
  let mounted = false
  let staticMode = false

  const measure = () => {
    const width = stage.clientWidth || window.innerWidth
    const height = stage.clientHeight || window.innerHeight
    const narrow = width < 720
    spreadX = width * (narrow ? 0.16 : 0.3)
    spreadY = height * (narrow ? 0.12 : 0.16)
    slots.forEach((slot) => {
      slot.x = slot.ax * spreadX
      slot.y = slot.ay * spreadY
    })
  }

  const slotNear = (at) => slots[clamp(Math.round(at), 0, count - 1)]

  const announce = (slot) => {
    const label =
      slot.type === 'card'
        ? t('{n} of {total}: {title}, {group}', { n: slot.number, total, title: slot.item.title, group: slot.group.title })
        : t('{group}, category', { group: slot.group.title })
    status.textContent = label
    placeOut.textContent = slot.type === 'card' ? `${pad2(slot.number)} / ${pad2(total)} · ${slot.group.title}` : slot.group.title
    const firstCard = cardSlots[0]
    const lastCard = cardSlots[cardSlots.length - 1]
    prevButton.disabled = slot.at <= (firstCard?.at ?? 0)
    nextButton.disabled = slot.at >= (lastCard?.at ?? count - 1)
    slots.forEach((other) => other.el.classList.toggle('is-current', other === slot))
  }

  /** Next or previous service card from the current slot. */
  const stepCards = (direction) => {
    const from = Math.round(stepper.position())
    const target = direction > 0 ? cardSlots.find((slot) => slot.at > from) : [...cardSlots].reverse().find((slot) => slot.at < from)
    if (target) stepper.goTo(target.at)
  }

  const draw = (now) => {
    const cameraZ = position * Z_GAP + FOCUS_Z
    const lower = slotNear(Math.floor(position))
    const upper = slotNear(Math.ceil(position))
    const fraction = position - Math.floor(position)
    const camX = (lower.x + (upper.x - lower.x) * fraction) * 0.85
    const camY = (lower.y + (upper.y - lower.y) * fraction) * 0.85
    const speed = Math.abs(velocity)
    const seconds = now / 1000

    // Each item carries its own camera: perspective (narrowed by speed, the
    // reference's warp) and the pointer tilt. No shared 3D scene means the
    // browser never has to depth-sort or split planes, which dropped parts of
    // cards in Chrome; the depth order comes from z-index instead.
    const lens = `perspective(${(1000 - Math.min(speed * 10, 600)).toFixed(0)}px) rotateX(${(mouseY * 5 - velocity * 0.4).toFixed(2)}deg) rotateY(${(mouseX * 5).toFixed(2)}deg)`

    slots.forEach((slot) => {
      const z = -slot.at * Z_GAP + cameraZ
      // Fade in from the depth (words only once they are close, so two chapter
      // titles never stack up) and out as they pass the camera.
      const far = slot.type === 'word' ? -1700 : -3000
      const near = slot.type === 'word' ? -1100 : -2000
      let alpha = 1
      if (z < far) alpha = 0
      else if (z < near) alpha = (z - far) / (near - far)
      if (z > 100) alpha = 1 - (z - 100) / 400
      alpha = clamp(alpha, 0, 1)
      slot.el.style.opacity = alpha.toFixed(3)
      slot.el.classList.toggle('is-gone', alpha < 0.25)
      if (alpha <= 0) {
        // Out of sight: shrink to nothing (still focusable; focusing one flies the
        // camera to it).
        if (!slot.parked) slot.el.style.transform = 'scale(0.001)'
        slot.parked = true
        return
      }
      slot.parked = false
      let transform = `${lens} translate3d(${(slot.x - camX).toFixed(1)}px, ${(slot.y - camY).toFixed(1)}px, ${z.toFixed(1)}px)`
      if (slot.type === 'card') transform += ` rotateZ(${slot.rot.toFixed(2)}deg) rotateY(${(Math.sin(seconds + slot.phase) * 6).toFixed(2)}deg)`
      slot.el.style.transform = transform
      slot.el.style.zIndex = String(4000 + Math.round(z))
      if (slot.type === 'word') {
        // The reference's RGB split, in Vodafone red and white.
        const split = speed > 1 ? Math.round(clamp(velocity * 1.5, -14, 14)) : 0
        if (split !== slot.split) {
          slot.split = split
          slot.heading.style.textShadow = split ? `${split}px 0 rgba(230, 0, 0, 0.85), ${-split}px 0 rgba(255, 255, 255, 0.5)` : ''
        }
      }
    })

    const stretch = clamp(1 + speed * 0.12, 1, 10)
    stars.forEach((star) => {
      let z = (((star.z + cameraZ) % STAR_LOOP) + STAR_LOOP) % STAR_LOOP
      if (z > 500) z -= STAR_LOOP
      const alpha = z < -3000 ? 0 : z < -2000 ? (z + 3000) / 1000 : 1
      star.el.style.opacity = alpha.toFixed(2)
      if (alpha > 0) {
        star.el.style.transform = `${lens} translate3d(${(star.x - camX * 0.5).toFixed(0)}px, ${(star.y - camY * 0.5).toFixed(0)}px, ${z.toFixed(0)}px) rotate(${star.angle.toFixed(1)}deg) scaleX(${stretch.toFixed(2)})`
        star.el.style.zIndex = String(4000 + Math.round(z))
      }
    })

    speedOut.textContent = speed.toFixed(2)
    velOut.textContent = Math.abs(velocity).toFixed(2)
    depthOut.textContent = String(Math.max(0, Math.round(cameraZ - FOCUS_Z))).padStart(6, '0')
    const near = slotNear(position)
    if (near.at !== current) {
      current = near.at
      announce(near)
    }
  }

  const loop = (now) => {
    if (!mounted) return
    // Two frames can share a timestamp; never divide by a zero step.
    const dt = last ? clamp((now - last) / 1000, 0.001, 0.05) : 0.016
    last = now
    const rect = track.getBoundingClientRect()
    const onScreen = rect.bottom > chromeOffset() && rect.top < window.innerHeight
    if (onScreen) {
      const target = stepper.position()
      const previous = position
      position += (target - position) * (1 - Math.exp(-dt * 5.5))
      if (Math.abs(target - position) < 0.0004) position = target
      const perFrame = ((position - previous) * STEP_PX * 0.016) / dt
      velocity += (perFrame - velocity) * (1 - Math.exp(-dt * 6))
      if (!Number.isFinite(velocity) || Math.abs(velocity) < 0.005) velocity = 0
      draw(now)
    }
    frame = window.requestAnimationFrame(loop)
  }

  /* ---------------------------------------------------------------- events */
  prevButton.addEventListener('click', () => stepCards(-1))
  nextButton.addEventListener('click', () => stepCards(1))
  arrowKeys(stage, { step: stepCards, first: () => stepper.goTo(0), last: () => stepper.goTo(count - 1) })
  // Tabbing to a card's link flies to that card.
  stage.addEventListener('focusin', (event) => {
    if (staticMode) return
    const slot = slots.find((candidate) => candidate.card?.contains(event.target))
    if (slot && slot.at !== Math.round(stepper.position())) stepper.goTo(slot.at, { instant: true })
  })
  const onPointer = (event) => {
    if (reducedMotion()) return
    const rect = stage.getBoundingClientRect()
    mouseX = ((event.clientX - rect.left) / rect.width - 0.5) * 2
    mouseY = ((event.clientY - rect.top) / rect.height - 0.5) * 2
  }
  const onScroll = () => stepper.settle()
  const onResize = () => measure()

  const setStatic = (value) => {
    staticMode = value
    root.classList.toggle('is-static', value)
    if (value) {
      slots.forEach((slot) => {
        slot.el.style.transform = ''
        slot.el.style.zIndex = ''
        slot.el.style.opacity = ''
        slot.el.classList.remove('is-gone')
      })
      world.style.transform = ''
    }
  }

  measure()
  announce(slots[0])

  return {
    element: root,
    afterMount: [measure],
    mount() {
      setStatic(reducedMotion())
      if (staticMode) return
      mounted = true
      last = 0
      measure()
      position = stepper.position()
      window.addEventListener('scroll', onScroll, { passive: true })
      window.addEventListener('resize', onResize)
      stage.addEventListener('pointermove', onPointer)
      frame = window.requestAnimationFrame(loop)
    },
    unmount() {
      mounted = false
      window.cancelAnimationFrame(frame)
      stepper.stop()
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onResize)
      stage.removeEventListener('pointermove', onPointer)
    },
  }
}
