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
 */

import { h, pathIcon } from '../dom.js'
import {
  ICON_NEXT, ICON_PREV, arrowKeys, chromeOffset, clamp, closingBand, ctaFor, dragToScroll, experienceRoot, flatItems, groupsOf, inlineSign,
  ltrMark, media, onScrollFrame, pad2, pageHeading, promotionOf, reducedMotion, scrollToY, sidewaysWheel,
  t,
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
    piece.addEventListener('click', () => goTo(at))
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

  const stage = h('section', { class: 'gl-stage', 'aria-label': t('Gallery of Vodafone services') }, viewport, intro, caption, controls)
  const track = h('div', { class: 'gl-track' }, stage)
  track.style.setProperty('--pieces', String(total))
  track.style.setProperty('--step', `${STEP_PX}px`)

  const root = experienceRoot('gallery', schema, pageHeading(index), track, closingBand(promo))

  /* ---------------------------------------------------------------- state */
  let offsets = []
  let active = -1
  let settleTimer = 0
  let stop = null
  let stopDrag = null
  let stopWheel = null

  /**
   * Frame widths follow the image ratio at the current frame height. `--x` is the
   * distance from the wall's origin to the piece's start edge (CSS places it with
   * inset-inline-start, so in RTL pieces hang leftward); `offsets` are the signed
   * physical centres the camera travels to.
   */
  const measure = () => {
    const styles = getComputedStyle(root)
    const height = parseFloat(styles.getPropertyValue('--gl-frame-h')) || 300
    // Never wider than most of the stage, so wide images still fit on phones.
    let stageCap = (stage.clientWidth || window.innerWidth) * 0.8
    // Beside the caption (wide screens), the active piece stops short of it.
    if (window.matchMedia('(min-width: 900px)').matches) {
      const stageRect = stage.getBoundingClientRect()
      const capRect = caption.getBoundingClientRect()
      const anchorX = stageRect.left + (stageRect.width * (parseFloat(styles.getPropertyValue('--gl-anchor')) || 50)) / 100
      const room = inlineSign > 0 ? anchorX - capRect.right : capRect.left - anchorX
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

  const trackTop = () => track.getBoundingClientRect().top + window.scrollY

  const positionFor = () => {
    const travelled = chromeOffset() - track.getBoundingClientRect().top
    return clamp(travelled / STEP_PX, 0, total - 1)
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

  const render = () => {
    const position = positionFor()
    const lower = Math.floor(position)
    const upper = Math.min(lower + 1, total - 1)
    const x = offsets[lower] + (offsets[upper] - offsets[lower]) * (position - lower)
    wall.style.setProperty('--camera', `${-x.toFixed(1)}px`)
    const nearest = Math.round(position)
    if (nearest !== active) {
      active = nearest
      showCaption(active)
    }
  }

  const settle = () => {
    window.clearTimeout(settleTimer)
    settleTimer = window.setTimeout(() => {
      const rect = track.getBoundingClientRect()
      const top = chromeOffset()
      const inside = rect.top <= top && rect.bottom >= window.innerHeight
      if (!inside) return
      const position = positionFor()
      if (Math.abs(position - Math.round(position)) > 0.02) goTo(Math.round(position))
    }, SETTLE_MS)
  }

  const goTo = (at) => {
    const target = clamp(at, 0, total - 1)
    scrollToY(trackTop() + target * STEP_PX - chromeOffset() + 1)
  }

  /* --------------------------------------------------------------- events */
  prevButton.addEventListener('click', () => goTo(active - 1))
  nextButton.addEventListener('click', () => goTo(active + 1))
  // Left/right follow the reading line (ArrowLeft walks forward in Arabic).
  arrowKeys(stage, { step: (direction) => goTo(active + direction), axis: 'x' })
  const onPointer = (event) => {
    if (reducedMotion()) return
    const rect = stage.getBoundingClientRect()
    wall.style.setProperty('--tilt-x', (((event.clientY - rect.top) / rect.height - 0.5) * -2).toFixed(3))
    wall.style.setProperty('--tilt-y', (((event.clientX - rect.left) / rect.width - 0.5) * 2).toFixed(3))
  }
  const onScroll = () => settle()
  const onResize = () => {
    measure()
    render()
  }

  measure()
  showCaption(0)

  return {
    element: root,
    mount() {
      measure()
      stop = onScrollFrame(render)
      window.addEventListener('scroll', onScroll, { passive: true })
      window.addEventListener('resize', onResize)
      stage.addEventListener('pointermove', onPointer)
      // Dragging or swiping sideways walks the wall, along the reading line.
      stopDrag = dragToScroll(stage, { axis: 'x', factor: STEP_PX / 160, touch: true })
      stopWheel = sidewaysWheel(stage)
    },
    unmount() {
      stop?.()
      stopDrag?.()
      stopWheel?.()
      stop = stopDrag = stopWheel = null
      window.clearTimeout(settleTimer)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onResize)
      stage.removeEventListener('pointermove', onPointer)
    },
  }
}
