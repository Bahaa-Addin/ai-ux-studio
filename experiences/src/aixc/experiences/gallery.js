/*
 * Copyright (c) nassimberrada (https://codepen.io/nassimberrada/pen/EayPjpM)
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
 * Gallery wall — adapted from "Infinite Gallery Hall" (codepen.io/nassimberrada/pen/EayPjpM).
 *
 * Every service hangs as a framed piece on an angled 3D wall (CSS 3D, no WebGL).
 * Scrolling the page walks the camera along the wall; when scrolling settles it
 * eases to the nearest piece, and the caption (catalogue number, category, title,
 * description, link) changes with it. The pointer tilts the wall slightly. Arrow
 * keys and prev/next work too. The caption sits on the active piece's start side
 * (left; right in Arabic), so the pieces still to come stay in view. In Arabic the
 * wall is mirrored: the pieces hang leftward, the wall recedes the other way, and
 * walking forward moves left. The reference wraps infinitely; here the walk has a
 * start and an end so the page can continue to the footer.
 *
 * On Vodafone's pages (voice-guide ADR-0076) the view scrolls in its own box instead of the page: every
 * scroll read and write goes through shared.js's seam, every handler, frame and timer through on(),
 * frame() and later() while mounted, and gallery.css keeps the controls and the caption out of the
 * bottom corners' safe zones (the row at the bottom centre from 720 px, under the stage's title on phones).
 * The wall runs past the stage's sides by design (the pieces still to come, the pieces passed): there, a
 * piece that rests past the box's side or in a corner's safe zone, or is on its way while the wall walks,
 * is inert until it rests clear (fence(), again when the zones change); the shown piece is pressable where
 * it rests but while a zone covers it (the guide listening); prev, next, the arrow keys, a drag and the
 * scroll still reach every piece. reveal(itemId) walks to an item's piece at once.
 */

import { h, pathIcon } from '../dom.js'
import {
  ICON_NEXT, ICON_PREV, arrowKeys, closingBand, ctaFor, dragToScroll, experienceRoot, flatItems, frame, groupsOf, inlineSign, later,
  ltrMark, media, on, onScrollFrame, onViewResize, onViewScroll, onViewZones, pad2, pageHeading, promotionOf, reducedMotion,
  scrollStepper, sidewaysWheel, t, viewScroller, words,
} from './shared.js'

const STEP_PX = 240 // page scroll per piece
const GAP_PX = 84 // space between frames on the wall
const SETTLE_MS = 180

const domainOf = (href) => {
  try {
    return new URL(href).hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}

export const renderGallery = (schema, index) => {
  const groups = groupsOf(schema, index)
  const entries = flatItems(groups)
  const total = entries.length
  const promo = promotionOf(schema, index)

  /* ------------------------------------------------------------- the wall */
  const pieces = entries.map(({ item, group }, at) => {
    const piece = h(
      'button',
      { type: 'button', class: 'gl-piece', tabindex: '-1', 'data-aixc-item': item.id, 'aria-label': t('{title}, piece {n} of {total}', { title: item.title, n: at + 1, total }) },
      h('span', { class: 'gl-frame' }, media(item, { className: 'gl-frame__media' })),
      h('span', { class: 'gl-plate', 'aria-hidden': 'true' }, h('span', { class: 'gl-plate__title' }, item.title), h('span', { class: 'gl-plate__group' }, group.title)),
    )
    const ratio = item.image?.width && item.image?.height ? item.image.width / item.image.height : 4 / 3
    piece.style.setProperty('--ratio', ratio.toFixed(4))
    piece.style.setProperty('--max-w', `${Math.round((item.image?.width ?? 300) * 1.6)}px`)
    return piece
  })
  const wall = h('div', { class: 'gl-wall' }, h('span', { class: 'gl-rail gl-rail--top', 'aria-hidden': 'true' }), h('span', { class: 'gl-rail gl-rail--bottom', 'aria-hidden': 'true' }), pieces)
  const viewport = h('div', { class: 'gl-viewport' }, wall)

  /* -------------------------------------------------------------- caption */
  const capNumber = h('p', { class: 'gl-caption__number' })
  const capGroup = h('p', { class: 'gl-caption__group' })
  const capTitle = h('h2', { class: 'gl-caption__title' })
  const capDesc = h('p', { class: 'gl-caption__desc' })
  const capAction = h('div', { class: 'gl-caption__action' })
  const capMeta = h('dl', { class: 'gl-caption__meta' })
  const caption = h('div', { class: 'gl-caption', 'aria-live': 'polite' }, capNumber, capGroup, capTitle, capDesc, capAction, capMeta)

  /* ------------------------------------------------------------- controls */
  const prevButton = h('button', { type: 'button', class: 'vx-round', 'aria-label': t('Previous piece') }, pathIcon(ICON_PREV, ''))
  const nextButton = h('button', { type: 'button', class: 'vx-round', 'aria-label': t('Next piece') }, pathIcon(ICON_NEXT, ''))
  const progressFill = h('span', { class: 'gl-progress__fill' })
  const counter = h('p', { class: 'gl-counter' })
  const controls = h('div', { class: 'gl-controls' }, prevButton, nextButton, h('div', { class: 'gl-progress' }, progressFill), counter)

  const intro = h(
    'div',
    { class: 'gl-intro' },
    h('p', { class: 'gl-intro__brand' }, index.model.title),
    h('p', { class: 'gl-intro__hint' }, t('Scroll, or use the arrows, to walk along the wall.')),
  )

  const stage = h('section', { class: 'gl-stage', 'aria-label': words('Gallery of Vodafone services') }, viewport, intro, caption, controls)
  const track = h('div', { class: 'gl-track' }, stage)
  track.style.setProperty('--pieces', String(total))
  track.style.setProperty('--step', `${STEP_PX}px`)

  const root = experienceRoot('gallery', schema, pageHeading(index), track, closingBand(promo))

  /* ---------------------------------------------------------------- state */
  const stepper = scrollStepper({ track, count: total, step: () => STEP_PX, settleMs: SETTLE_MS })
  let offsets = []
  let active = -1
  let mounted = false
  let resting = null
  let tilted = null

  /**
   * Frame widths follow the image ratio at the current frame height. `--x` is the
   * distance from the wall's origin to the piece's start edge (CSS places it with
   * inset-inline-start, so in RTL pieces hang leftward); `offsets` are the signed
   * physical centres the camera travels to.
   */
  const measure = () => {
    const styles = getComputedStyle(root)
    // In a box, the frame's height as laid out (gallery.css sizes it by the room); the clone's as before.
    const boxed = Boolean(viewScroller())
    const height = (boxed ? pieces[0]?.firstElementChild.offsetHeight : parseFloat(styles.getPropertyValue('--gl-frame-h'))) || 300
    // Never wider than most of the stage, so wide images still fit on phones.
    let stageCap = (stage.clientWidth || window.innerWidth) * 0.8
    // Beside the caption (wide screens; in a box where gallery.css says so: --gl-beside), the active piece stops short of it.
    if (boxed ? styles.getPropertyValue('--gl-beside').trim() === '1' : window.matchMedia('(min-width: 900px)').matches) {
      const stageRect = stage.getBoundingClientRect()
      const capRect = caption.getBoundingClientRect()
      // In a box the anchor may be a calc() (gallery.css's short room): read where the wall stands (its left, before
      // its transforms), and the room on whichever side of the caption it stands.
      const anchorX = boxed
        ? stageRect.left + stage.clientLeft + wall.offsetLeft
        : stageRect.left + (stageRect.width * (parseFloat(styles.getPropertyValue('--gl-anchor')) || 50)) / 100
      const room = boxed ? Math.max(anchorX - capRect.right, capRect.left - anchorX) : inlineSign > 0 ? anchorX - capRect.right : capRect.left - anchorX
      if (stageRect.width && capRect.width) stageCap = Math.min(stageCap, Math.max(160, 2 * (room - 32)))
    }
    let x = 0
    offsets = pieces.map((piece) => {
      const ratio = parseFloat(piece.style.getPropertyValue('--ratio'))
      const maxW = parseFloat(piece.style.getPropertyValue('--max-w'))
      const width = Math.min(height * ratio, maxW, height * 2.4, stageCap)
      piece.style.setProperty('--w', `${Math.round(width)}px`)
      piece.style.setProperty('--x', `${Math.round(x)}px`)
      const center = x + width / 2
      x += width + GAP_PX
      return center * inlineSign
    })
  }

  const showCaption = (at) => {
    const { item, group } = entries[at]
    const inGroup = group.items.indexOf(item) + 1
    capNumber.textContent = t('No. {n}', { n: pad2(at + 1) })
    capGroup.textContent = group.title
    capTitle.textContent = item.title
    capDesc.textContent = item.description ?? ''
    capDesc.hidden = !item.description
    capAction.replaceChildren(...[ctaFor(item, { variant: 'primary', standalone: true })].filter(Boolean))
    const domain = item.cta?.href ? domainOf(item.cta.href) : null
    capMeta.replaceChildren(
      h('div', null, h('dt', null, t('Category')), h('dd', null, group.title)),
      h('div', null, h('dt', null, t('In this category')), h('dd', null, t('{n} of {total}', { n: inGroup, total: group.items.length }))),
      // The domain is Latin: keep it left to right inside the Arabic caption.
      h('div', null, h('dt', null, t('Link')), h('dd', null, domain ? ltrMark(domain) : t('None on the source page'))),
    )
    caption.classList.remove('is-changing')
    void caption.offsetWidth
    caption.classList.add('is-changing')
    counter.textContent = `${pad2(at + 1)} / ${pad2(total)}`
    progressFill.style.transform = `scaleX(${(at + 1) / total})`
    prevButton.disabled = at === 0
    nextButton.disabled = at === total - 1
    pieces.forEach((piece, i) => {
      piece.classList.toggle('is-active', i === at)
      piece.classList.toggle('is-past', i < at)
    })
  }

  /**
   * In a box: each piece that rests past the box's left or right side or in a bottom corner's safe zone (the box's
   * --aixc-safe-{left,right}-{w,h}) is inert, the others not; the shown piece too while a zone covers it (the guide's
   * transcript bar while it listens; gallery.css keeps it clear of the corners' controls otherwise): its title and link
   * are in the caption too. Read from the pieces' own rects (the wall at rest, rest()).
   */
  const fence = (only) => {
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
    pieces.forEach((piece, at) => {
      if (only !== undefined && at !== only) return
      const r = piece.getBoundingClientRect()
      const out = r.left < left - 1 || r.right > right + 1 || zones.some((z) => r.left < z.right && r.right > z.left && r.bottom > z.top && r.top < bottom)
      if (piece.inert !== out) piece.inert = out
    })
    keepFocus()
  }

  /**
   * A piece that had the focus and turned inert hands it to the row (prev when next is off), or to the stage itself
   * when both are off (one piece only), never the page's body.
   */
  const keepFocus = () => {
    const focused = pieces.includes(document.activeElement) ? document.activeElement : null
    if (!focused?.inert) return
    const to = [nextButton, prevButton].find((button) => !button.disabled) ?? stage
    if (to === stage && !stage.hasAttribute('tabindex')) stage.tabIndex = -1
    to.focus({ preventScroll: true })
  }

  /**
   * In a box, as the wall walks: the pieces other than the shown one are inert while they move (on their way past
   * the box's sides and the corners: no place to press), the shown one fenced where it is; then fence() where they
   * rest, once neither the wall nor a piece is moving (at once without motion).
   */
  const walked = () => {
    if (!viewScroller() || !mounted) return
    resting?.()
    resting = null
    if (reducedMotion()) return fence()
    pieces.forEach((piece, at) => {
      if (at !== active && !piece.inert) piece.inert = true
    })
    fence(active)
    const moving = () => [wall, ...pieces].some((node) => node.getAnimations?.().some((a) => a.transitionProperty === 'transform' && a.playState === 'running'))
    let tries = 0
    const rest = () => {
      if (moving() && tries++ < 20) {
        resting = later(rest, 50)
        return
      }
      resting = null
      fence()
    }
    resting = later(rest, 140)
  }

  /** fence() unless the wall is walking (it follows the walk). */
  const refit = () => {
    if (!resting) fence()
  }

  let camera = ''
  const render = () => {
    const position = stepper.position()
    const lower = Math.floor(position)
    const upper = Math.min(lower + 1, total - 1)
    const x = offsets[lower] + (offsets[upper] - offsets[lower]) * (position - lower)
    const next = `${-x.toFixed(1)}px`
    const nearest = Math.round(position)
    const moved = next !== camera || nearest !== active
    camera = next
    wall.style.setProperty('--camera', next)
    if (nearest !== active) {
      active = nearest
      showCaption(active)
    }
    if (moved) walked()
  }

  const goTo = (at) => stepper.goTo(at)

  /* --------------------------------------------------------------- events */
  const onPointer = (event) => {
    if (reducedMotion()) return
    const rect = stage.getBoundingClientRect()
    wall.style.setProperty('--tilt-x', (((event.clientY - rect.top) / rect.height - 0.5) * -2).toFixed(3))
    wall.style.setProperty('--tilt-y', (((event.clientX - rect.left) / rect.width - 0.5) * 2).toFixed(3))
    // In a box the tilt moves the pieces a little too: fenced again once the pointer rests (its 0.12 s turn done).
    if (viewScroller()) {
      tilted?.()
      tilted = later(() => {
        tilted = null
        refit()
      }, 160)
    }
  }
  const onResize = () => {
    measure()
    render()
    refit()
  }

  // Everything the stage listens to while it shows, added on mount through the seam and undone on unmount
  // (or by the seam's reset), so a kept view mounted again listens again.
  const listen = () => [
    onScrollFrame(render),
    onViewScroll(() => stepper.settle()),
    onViewResize(onResize),
    on(prevButton, 'click', () => goTo(active - 1)),
    on(nextButton, 'click', () => goTo(active + 1)),
    ...pieces.map((piece, at) => on(piece, 'click', () => goTo(at))),
    // Left/right follow the reading line (ArrowLeft walks forward in Arabic).
    arrowKeys(stage, { step: (direction) => goTo(active + direction), axis: 'x' }),
    on(stage, 'pointermove', onPointer),
    // Dragging or swiping sideways walks the wall, along the reading line.
    dragToScroll(stage, { axis: 'x', factor: STEP_PX / 160, touch: true }),
    sidewaysWheel(stage),
    // In a box: which pieces are clear changes with the zones alone too (the Pocket's button showing, the guide
    // listening, without the box changing size), and in a short box the caption's column with them; and with the
    // box's scroll past the wall's last stop, where the stage scrolls up out of its pin while the wall stays put.
    ...(viewScroller() ? [onViewZones(onResize), onScrollFrame(refit)] : []),
  ]
  let offs = []

  measure()
  showCaption(0)

  return {
    element: root,
    mount() {
      mounted = true
      measure()
      offs = listen()
    },
    unmount() {
      mounted = false
      for (const off of offs.splice(0)) off()
      stepper.stop()
      resting?.()
      tilted?.()
      resting = tilted = null
      wall.classList.remove('is-instant')
    },
    /**
     * Walks the wall to the piece of `itemId` at once (the guide's spotlight comes next); false if it has none. In a
     * box the wall takes its place without its move (gallery.css: .gl-wall.is-instant, for a frame), so the piece is
     * pressable at once where it is clear.
     */
    reveal(itemId) {
      const at = entries.findIndex((entry) => entry.item.id === itemId)
      if (at < 0) return false
      const instant = Boolean(viewScroller()) && mounted
      if (instant) {
        wall.classList.add('is-instant')
        frame(() => wall.classList.remove('is-instant'))
      }
      stepper.goTo(at, { instant: true })
      render()
      if (instant) {
        resting?.()
        resting = null
        fence()
      }
      return true
    },
  }
}
