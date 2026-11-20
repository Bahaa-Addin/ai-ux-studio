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
 *
 * On Vodafone's pages (voice-guide ADR-0076) the view scrolls in its own box instead of the page: every scroll read
 * and write goes through shared.js's seam, every handler and frame through on() and frame() while mounted. There
 * tunnel.css keeps the HUD's prev / next out of the bottom corners' safe zones (from 720 px in the bottom row between
 * them, lifted above the taller one where the row does not fit; on phones under the HUD's title row) and the cards'
 * column clear of them where it can; whatever flies past the stage's sides or into a zone is inert while there
 * (fence()). A box too short for the stage (SHORT_ROOM) lays the tunnel flat, as reduced motion does, its links taking
 * no press while they pass a zone (still in the Tab order). reveal(itemId) brings the camera to an item's card at once.
 */

import { h, pathIcon } from '../dom.js'
import {
  ICON_NEXT, ICON_PREV, arrowKeys, chromeOffset, clamp, closingBand, ctaFor, experienceRoot, frame, groupExtras, groupsOf, inlineSign,
  liveStatus, media, on, onScrollFrame, onViewResize, onViewScroll, onViewZones, pad2, pageHeading, promotionOf, reducedMotion,
  scrollByY, scrollStepper, scrollToElement, t, viewBottom, viewHeight, viewScroller, viewTop, words,
} from './shared.js'

const STEP_PX = 320 // page scroll per tunnel slot
// In a box, a room (under the view bar) shorter than this lays the tunnel flat: a card needs about 360 px (its
// copy with the image shrunk, tunnel.css) at 0.7 of the room, and the HUD's bottom row its 68 px under the card's
// 0.15 (measured 2026-11-18 on the Services copy; the clone's stage keeps 520 px too). A phone in landscape is flat.
const SHORT_ROOM = 520
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
    // What a press reaches in the slot (fence() reads where each one is, in a box).
    slot.presses = slot.card ? [...slot.card.querySelectorAll('a[href], button')] : []
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
  const prevButton = h('button', { type: 'button', class: 'vx-round vx-on-dark', 'aria-label': words('Previous service') }, pathIcon(ICON_PREV, ''))
  const nextButton = h('button', { type: 'button', class: 'vx-round vx-on-dark', 'aria-label': words('Next service') }, pathIcon(ICON_NEXT, ''))
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
    { class: 'tn-stage vx-dark', 'aria-label': words('Vodafone services, hyper tunnel') },
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
  let ticking = null // the next frame's cancel
  let mounted = false
  let staticMode = false
  let offs = []

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
    const onScreen = rect.bottom > viewTop() && rect.top < viewBottom()
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
    // In a box, every frame: what flies and what flows past the corners as the box scrolls (the stage on screen or not).
    fence()
    ticking = frame(loop)
  }

  /* ------------------------------------------------------- the box's fence */
  // The bottom corners' safe zones in the box (its --aixc-safe-{left,right}-{w,h}, which the shell writes): read on
  // mount and when they or the box's size change, not every frame.
  let zones = []
  const readZones = () => {
    const box = viewScroller()
    if (!box) return
    const style = getComputedStyle(box)
    const px = (name) => Number.parseFloat(style.getPropertyValue(`--aixc-safe-${name}`)) || 0
    zones = [
      ['right', px('right-w'), px('right-h')],
      ['left', px('left-w'), px('left-h')],
    ].filter(([, w, h]) => w > 0 && h > 0)
  }
  const fenced = new Set() // the flowing links fence() fenced (.tn-fenced) one by one
  // What follows the stage (the closing band's links): it flows past the corners as the box scrolls to its end.
  const after = [...root.querySelectorAll('a[href], button')].filter((node) => !stage.contains(node))
  const cardPresses = cardSlots.flatMap((slot) => slot.presses)

  /**
   * In a box: what a press could reach where it must not. The 3D tunnel: a word or a service flying past the stage's
   * left or right side, or a service with a link in a bottom corner's zone, is inert while there (every service is
   * still reached by prev / next, the keys, the scroll and Tab, which flies to it). What flows (the closing band's
   * links; laid flat, the services' too): each link in a zone takes no press while there (.tn-fenced: no pointer
   * events), but keeps its place in the Tab order and the accessibility tree, so Tab reaches it, and tunnel.css then
   * scrolls it clear of the zones (onFlowFocus(); scrolling on brings it clear too). Never what holds the focus.
   */
  const fence = () => {
    const box = viewScroller()
    if (!box || !mounted) return
    const b = box.getBoundingClientRect()
    const left = b.left + box.clientLeft
    const right = left + box.clientWidth
    const bottom = b.top + box.clientTop + box.clientHeight
    const inZone = (r) =>
      zones.some(([side, w, h]) => r.bottom > bottom - h && r.top < bottom && (side === 'right' ? r.right > right - w : r.left < left + w))
    const focused = document.activeElement
    for (const node of staticMode ? [...cardPresses, ...after] : after) {
      const out = node !== focused && inZone(node.getBoundingClientRect())
      node.classList.toggle('tn-fenced', out)
      if (out) fenced.add(node)
      else fenced.delete(node)
    }
    if (staticMode) return
    for (const slot of slots) {
      let out = false
      if (!slot.parked && !slot.el.contains(focused)) {
        const r = (slot.card ?? slot.heading).getBoundingClientRect()
        out = r.left < left - 1 || r.right > right + 1 || slot.presses.some((node) => inZone(node.getBoundingClientRect()))
      }
      if (slot.el.inert !== out) slot.el.inert = out
    }
  }

  /**
   * In a box: a flowing link the focus moves to (laid flat, a service's; the closing band's always) scrolled clear of
   * the bar and of the corners' zones on its side, the box's scroll only. The browser's own focus scroll then finds it
   * shown and keeps the window still (a scroll-margin on the link scrolled the window too: 50 px at 1366x900).
   */
  const onFlowFocus = (event) => {
    const node = event.target
    const box = viewScroller()
    const flows = after.includes(node) || (staticMode && cardPresses.includes(node))
    if (!box || !mounted || !flows) return
    const b = box.getBoundingClientRect()
    const left = b.left + box.clientLeft
    const right = left + box.clientWidth
    const bottom = b.top + box.clientTop + box.clientHeight
    const top = viewTop() + 16
    const r = node.getBoundingClientRect()
    // Over the zone on its side, if it meets one in width.
    const floor = Math.min(bottom, ...zones.filter(([side, w]) => (side === 'right' ? r.right > right - w : r.left < left + w)).map(([, , h]) => bottom - h - 16))
    let dy = r.bottom > floor ? r.bottom - floor : 0
    if (r.top - dy < top) dy = r.top - top
    if (Math.abs(dy) >= 1) scrollByY(dy)
  }

  /** Nothing fenced (a mode left, or the box left). */
  const unfence = () => {
    for (const slot of slots) slot.el.inert = false
    for (const node of fenced) node.classList.remove('tn-fenced')
    fenced.clear()
  }

  /* ---------------------------------------------------------------- events */
  // Tabbing to a card's link flies to that card.
  const onFocus = (event) => {
    if (staticMode) return
    const slot = slots.find((candidate) => candidate.card?.contains(event.target))
    if (slot && slot.at !== Math.round(stepper.position())) stepper.goTo(slot.at, { instant: true })
  }
  const onPointer = (event) => {
    if (reducedMotion()) return
    const rect = stage.getBoundingClientRect()
    mouseX = ((event.clientX - rect.left) / rect.width - 0.5) * 2
    mouseY = ((event.clientY - rect.top) / rect.height - 0.5) * 2
  }

  const setStatic = (value) => {
    staticMode = value
    root.classList.toggle('is-static', value)
    if (value) {
      slots.forEach((slot) => {
        slot.el.style.transform = ''
        slot.el.style.zIndex = ''
        slot.el.style.opacity = ''
        slot.el.classList.remove('is-gone')
        slot.parked = false
      })
      world.style.transform = ''
    }
  }

  /** Laid flat: under reduced motion; in a box, also in a room too short for the stage (SHORT_ROOM). */
  const flatNow = () => reducedMotion() || (Boolean(viewScroller()) && viewHeight() - chromeOffset() < SHORT_ROOM)

  /**
   * Everything the tunnel listens to while it shows, added on mount through the seam and undone on unmount (or by the
   * seam's reset). The clone: its prev / next, keys and Tab always, and with motion the scroll, the size and the
   * pointer, as before. In a box also the zones and the box's size (which can lay it flat or raise it again), and
   * laid flat the scroll, for fence(), but not the stops' arrow keys.
   */
  const listen = () => {
    const box = Boolean(viewScroller())
    return [
      on(prevButton, 'click', () => stepCards(-1)),
      on(nextButton, 'click', () => stepCards(1)),
      // Laid flat in a box there are no stops to step to: the arrow keys scroll the box as anywhere else.
      ...(box && staticMode ? [] : [arrowKeys(stage, { step: stepCards, first: () => stepper.goTo(0), last: () => stepper.goTo(count - 1) })]),
      on(stage, 'focusin', onFocus),
      ...(staticMode ? [] : [onViewScroll(() => stepper.settle()), on(stage, 'pointermove', onPointer)]),
      ...(!staticMode || box ? [onViewResize(resized)] : []),
      ...(box ? [onViewZones(rezone), on(root, 'focusin', onFlowFocus)] : []),
      ...(box && staticMode ? [onScrollFrame(fence)] : []),
    ]
  }

  const start = () => {
    setStatic(flatNow())
    readZones()
    offs = listen()
    if (staticMode) return fence()
    last = 0
    measure()
    position = stepper.position()
    ticking = frame(loop)
  }

  const stop = () => {
    for (const off of offs.splice(0)) off()
    ticking?.()
    ticking = null
    stepper.stop()
    unfence()
  }

  /** The box's size: measured again; laid flat or raised again where the room crossed SHORT_ROOM. */
  function resized() {
    measure()
    if (!viewScroller() || !mounted) return
    readZones()
    if (flatNow() !== staticMode) {
      stop()
      start()
    } else fence()
  }

  /** The zones alone changed (the Pocket's button showing, the guide listening). */
  function rezone() {
    readZones()
    fence()
  }

  measure()
  announce(slots[0])

  return {
    element: root,
    afterMount: [measure],
    mount() {
      mounted = true
      start()
    },
    unmount() {
      mounted = false
      stop()
    },
    /**
     * Brings the camera to the card of `itemId` at once (the guide's spotlight comes next): the scroll to its stop and
     * the camera there without its flight; laid flat, the card's top to the pin line. False if it has none.
     */
    reveal(itemId) {
      const slot = cardSlots.find((candidate) => candidate.item.id === itemId)
      if (!slot) return false
      if (staticMode) {
        scrollToElement(slot.card, { instant: true })
      } else {
        stepper.goTo(slot.at, { instant: true })
        position = slot.at
        velocity = 0
        if (mounted) draw(performance.now())
      }
      fence()
      return true
    },
  }
}
