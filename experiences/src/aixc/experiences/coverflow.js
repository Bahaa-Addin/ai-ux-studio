/*
 * Copyright (c) jh3y (https://codepen.io/jh3y/pen/WNRvqJP)
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
 *
 * On Vodafone's pages (voice-guide ADR-0076) the view scrolls in its own box instead of the page: every
 * scroll read and write goes through shared.js's seam, every handler, frame and timer through on(),
 * frame() and later() while mounted, and coverflow.css keeps the panel (the controls and the front
 * service's details) and the closing band out of the bottom corners' safe zones. The far covers run past
 * the stage's sides by design (the reference's flow): there, a cover cut by the box's side or in a
 * corner's safe zone is inert until it is clear again (keepClear(), on every move and when the box or the
 * zones change); prev, next, the arrow keys, a drag and the scroll still reach every cover. reveal(itemId)
 * brings an item's cover to the front at once.
 */

import { h, pathIcon } from '../dom.js'
import {
  ICON_NEXT, ICON_PREV, arrowKeys, clamp, closingBand, ctaFor, dragToScroll, experienceRoot, flatItems, frame, groupExtras, groupsOf,
  inlineSign, liveStatus, media, on, onScrollFrame, onViewScroll, onViewZones, pad2, pageHeading, promotionOf, reducedMotion,
  scrollStepper, sidewaysWheel, t, viewScroller, words,
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
    return cover
  })
  const flow = h('div', { class: 'cf-flow' }, covers)

  /* ---------------------------------------------------------------- detail */
  const detailGroup = h('p', { class: 'cf-detail__group' })
  const detailTitle = h('h2', { class: 'cf-detail__title' })
  const detailDesc = h('p', { class: 'cf-detail__desc' })
  const detailActions = h('div', { class: 'cf-detail__actions' })
  const detail = h('div', { class: 'cf-detail' }, detailGroup, detailTitle, detailDesc, detailActions)

  const prevButton = h('button', { type: 'button', class: 'cf-button', 'aria-label': words('Previous service') }, pathIcon(ICON_PREV, ''))
  const nextButton = h('button', { type: 'button', class: 'cf-button', 'aria-label': words('Next service') }, pathIcon(ICON_NEXT, ''))
  const counterNow = h('span', { class: 'cf-counter__now' }, '01')
  const controls = h(
    'div',
    { class: 'cf-controls' },
    prevButton,
    h('p', { class: 'cf-counter', 'aria-hidden': 'true' }, counterNow, h('span', { class: 'cf-counter__total' }, ` / ${pad2(total)}`)),
    nextButton,
  )
  const status = liveStatus()
  const panel = h('div', { class: 'cf-panel' }, controls, detail)

  const stage = h(
    'section',
    { class: 'cf-stage vx-dark', 'aria-roledescription': t('carousel'), 'aria-label': words('Vodafone services, cover flow') },
    h('header', { class: 'cf-head', 'aria-hidden': 'true' }, h('p', { class: 'cf-brand' }, index.model.title), h('p', { class: 'cf-scroll' }, pathIcon(ICON_MOUSE, 'cf-scroll__icon'), t('Scroll, drag or use the arrow keys'))),
    flow,
    h('div', { class: 'cf-floor', 'aria-hidden': 'true' }),
    panel,
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
  let ticking = null
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

  /** A service's details into the panel's (or a copy's) group, title, description and actions. */
  const fill = ({ item, group }, [into, title, desc, actions] = [detailGroup, detailTitle, detailDesc, detailActions]) => {
    into.textContent = group.title
    title.textContent = item.title
    desc.textContent = item.description ?? ''
    desc.hidden = !item.description
    const extras = group.items[0] === item ? groupExtras(group, { onDark: true }) : null
    actions.replaceChildren(...[ctaFor(item, { variant: 'primary', standalone: true, onDark: true }), extras].filter(Boolean))
  }

  const showFront = (next) => {
    const { item, group } = entries[next]
    fill(entries[next])
    detail.classList.remove('is-changing')
    void detail.offsetWidth
    detail.classList.add('is-changing')
    counterNow.textContent = pad2(next + 1)
    if (!loops) {
      const had = document.activeElement
      prevButton.disabled = next === 0
      nextButton.disabled = next === total - 1
      // In a box: a focused button that turns disabled (the flow at its first or last cover) hands focus to the other.
      if (viewScroller() && (had === prevButton || had === nextButton) && had.disabled) (had === nextButton ? prevButton : nextButton).focus({ preventScroll: true })
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
    // Which cover has focus, before a cover is hidden or the details' reflow below can take it away.
    const focused = covers.includes(document.activeElement) ? document.activeElement : null
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
    keepClear(focused)
  }

  /**
   * In a box: each cover shown that the box's left or right side cuts, or that meets a bottom corner's safe zone
   * (the box's --aixc-safe-{left,right}-{w,h}), is inert, the others not; from the covers' rects as drawn. The
   * clone (no scroller) leaves them as they are.
   */
  const keepClear = (focused = covers.includes(document.activeElement) ? document.activeElement : null) => {
    const box = viewScroller()
    if (!box || !mounted) return
    fitRoom()
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
    for (const cover of covers) {
      if (cover.classList.contains('is-off')) {
        cover.inert = false
        continue
      }
      const r = cover.getBoundingClientRect()
      const cut = r.left < left - 1 || r.right > right + 1
      cover.inert = cut || zones.some((z) => r.left < z.right && r.right > z.left && r.bottom > z.top && r.top < bottom)
    }
    // A focused cover that turned inert, or went past the flow's end (hidden), would leave focus on the page's body:
    // it goes to Next, or Previous where Next is disabled (the last cover of a flow that does not loop).
    if (focused && (focused.inert || focused.classList.contains('is-off'))) [nextButton, prevButton].find((button) => !button.disabled)?.focus({ preventScroll: true })
  }

  /**
   * In a box: the covers' room is the stage less the head, the panel and the zones under it. The panel's height is
   * its tallest over every service at its width (--cf-panel-h on the stage), measured on a hidden copy of it (the
   * panel itself, and focus in it, untouched; offsets, so the details' entrance does not count), so the front cover
   * stays clear of it whichever service is in front, and the covers change size only when the box or the zones do.
   * Where that room, under the head, would hold covers under 96 px (a phone, the guide listening), the head gives way
   * (is-tight, coverflow.css). Measured again when the panel's width or the stage's height changes (the stage's
   * regimes hide some details) and when fonts load; the head read again when the panel's place changes too. Not where
   * the panel stands beside the covers (a short box, --cf-beside), which has a layout of its own.
   */
  let fitted = ''
  let tallest = 0
  const fitRoom = () => {
    if (getComputedStyle(panel).getPropertyValue('--cf-beside').trim() === '1') {
      stage.classList.remove('is-tight')
      fitted = ''
      return
    }
    const s = stage.getBoundingClientRect()
    const p = panel.getBoundingClientRect()
    const size = `${Math.round(p.width)}|${Math.round(s.height)}|`
    const key = `${size}${Math.round(s.bottom - p.bottom)}`
    if (key === fitted) return
    if (!fitted.startsWith(size)) {
      const copy = panel.cloneNode(true)
      copy.inert = true
      copy.setAttribute('aria-hidden', 'true')
      copy.style.visibility = 'hidden'
      stage.append(copy)
      const parts = ['.cf-controls', '.cf-detail__group', '.cf-detail__title', '.cf-detail__desc', '.cf-detail__actions'].map((name) => copy.querySelector(name))
      tallest = 0
      for (const entry of entries) {
        fill(entry, parts.slice(1))
        let top = Number.POSITIVE_INFINITY
        let bottom = 0
        for (const part of parts) {
          if (!part.offsetHeight) continue
          top = Math.min(top, part.offsetTop)
          bottom = Math.max(bottom, part.offsetTop + part.offsetHeight)
        }
        tallest = Math.max(tallest, bottom - Math.min(top, bottom))
      }
      copy.remove()
      stage.style.setProperty('--cf-panel-h', `${Math.ceil(tallest)}px`)
    }
    fitted = key
    const head = Number.parseFloat(getComputedStyle(root).getPropertyValue('--cf-head-h')) || 0
    stage.classList.toggle('is-tight', (p.bottom - s.top - Math.ceil(tallest) - 8 - head) / 1.45 < 96)
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
    ticking = frame(loop)
  }

  // Everything the stage listens to while it shows, added on mount through the seam and undone on unmount
  // (or by the seam's reset), so a kept view mounted again listens again.
  const listen = () => [
    dragToScroll(stage, { axis: 'x', factor: STEP_PX / DRAG_PX, touch: true }),
    sidewaysWheel(stage), // sideways swipes walk it too, along the reading line
    onViewScroll(() => stepper.settle()),
    on(prevButton, 'click', () => goTo(front - 1)),
    on(nextButton, 'click', () => goTo(front + 1)),
    ...covers.map((cover, at) => on(cover, 'click', () => goTo(at))),
    arrowKeys(stage, { step: (direction) => goTo(front + direction), first: () => goTo(0), last: () => goTo(total - 1) }),
    on(stage, 'keydown', (event) => {
      // The reference's A / D keys: A is the left-hand key, so it moves forward in RTL.
      if (event.target.closest?.('input, textarea')) return
      if (event.key === 'a' || event.key === 'A') goTo(front - inlineSign)
      else if (event.key === 'd' || event.key === 'D') goTo(front + inlineSign)
    }),
    // In a box: which covers are clear changes as the box scrolls past the track's end or changes size, and with
    // the zones alone (the Pocket's button showing, the guide listening).
    // The panel's tallest is measured again once fonts load (the text's width changes).
    ...(viewScroller() ? [onScrollFrame(keepClear), onViewZones(keepClear), on(document.fonts, 'loadingdone', () => { fitted = ''; keepClear() })] : []),
  ]
  let offs = []

  showFront(0)
  draw()

  return {
    element: root,
    mount() {
      mounted = true
      last = 0
      position = stepper.position()
      drawn = ''
      offs = listen()
      ticking = frame(loop)
    },
    unmount() {
      mounted = false
      ticking?.()
      ticking = null
      for (const off of offs.splice(0)) off()
      stepper.stop()
    },
    /** Brings the cover of `itemId` to the front at once (the guide's spotlight comes next); false if it has none. */
    reveal(itemId) {
      const at = entries.findIndex((entry) => entry.item.id === itemId)
      if (at < 0) return false
      stepper.goTo(at, { instant: true })
      position = at
      draw()
      return true
    },
  }
}
