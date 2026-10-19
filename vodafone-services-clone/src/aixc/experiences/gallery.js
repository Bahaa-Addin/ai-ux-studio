/**
 * Gallery wall — adapted from "Infinite Gallery Hall" (codepen.io/nassimberrada/pen/EayPjpM).
 *
 * Every service hangs as a framed piece on an angled 3D wall (CSS 3D, no WebGL).
 * Scrolling the page walks the camera along the wall; when scrolling settles it
 * eases to the nearest piece, and the caption (catalogue number, category, title,
 * description, link) changes with it. The pointer tilts the wall slightly. Arrow
 * keys and prev/next work too. The reference wraps infinitely; here the walk has a
 * start and an end so the page can continue to the footer.
 */

import { h, pathIcon } from '../dom.js'
import {
  ICON_NEXT, ICON_PREV, chromeOffset, clamp, closingBand, ctaFor, experienceRoot, flatItems, groupsOf, media, onScrollFrame,
  pad2, pageHeading, promotionOf, reducedMotion, scrollToY,
} from './shared.js'

const STEP_PX = 240 // page scroll per piece
const GAP_PX = 110 // space between frames on the wall
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
      { type: 'button', class: 'gl-piece', tabindex: '-1', 'data-aixc-item': item.id, 'aria-label': `${item.title}, piece ${at + 1} of ${total}` },
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
  const prevButton = h('button', { type: 'button', class: 'vx-round', 'aria-label': 'Previous piece' }, pathIcon(ICON_PREV, ''))
  const nextButton = h('button', { type: 'button', class: 'vx-round', 'aria-label': 'Next piece' }, pathIcon(ICON_NEXT, ''))
  const progressFill = h('span', { class: 'gl-progress__fill' })
  const counter = h('p', { class: 'gl-counter' })
  const controls = h('div', { class: 'gl-controls' }, prevButton, nextButton, h('div', { class: 'gl-progress' }, progressFill), counter)

  const intro = h(
    'div',
    { class: 'gl-intro' },
    h('p', { class: 'gl-intro__brand' }, index.model.title),
    h('p', { class: 'gl-intro__hint' }, 'Scroll, or use the arrows, to walk along the wall.'),
  )

  const stage = h('section', { class: 'gl-stage', 'aria-label': 'Gallery of Vodafone services' }, viewport, intro, caption, controls)
  const track = h('div', { class: 'gl-track' }, stage)
  track.style.setProperty('--pieces', String(total))
  track.style.setProperty('--step', `${STEP_PX}px`)

  const root = experienceRoot('gallery', schema, pageHeading(index), track, closingBand(promo))

  /* ---------------------------------------------------------------- state */
  let offsets = []
  let active = -1
  let settleTimer = 0
  let stop = null

  /** Frame widths follow the image ratio at the current frame height. */
  const measure = () => {
    const height = parseFloat(getComputedStyle(root).getPropertyValue('--gl-frame-h')) || 300
    // Never wider than most of the stage, so wide images still fit on phones.
    const stageCap = (stage.clientWidth || window.innerWidth) * 0.8
    let x = 0
    offsets = pieces.map((piece) => {
      const ratio = parseFloat(piece.style.getPropertyValue('--ratio'))
      const maxW = parseFloat(piece.style.getPropertyValue('--max-w'))
      const width = Math.min(height * ratio, maxW, height * 2.4, stageCap)
      piece.style.setProperty('--w', `${Math.round(width)}px`)
      piece.style.setProperty('--x', `${Math.round(x)}px`)
      const center = x + width / 2
      x += width + GAP_PX
      return center
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
    capNumber.textContent = `No. ${pad2(at + 1)}`
    capGroup.textContent = group.title
    capTitle.textContent = item.title
    capDesc.textContent = item.description ?? ''
    capDesc.hidden = !item.description
    capAction.replaceChildren(...[ctaFor(item, { variant: 'primary', standalone: true })].filter(Boolean))
    const domain = item.cta?.href ? domainOf(item.cta.href) : null
    capMeta.replaceChildren(
      h('div', null, h('dt', null, 'Category'), h('dd', null, group.title)),
      h('div', null, h('dt', null, 'In this category'), h('dd', null, `${inGroup} of ${group.items.length}`)),
      h('div', null, h('dt', null, 'Link'), h('dd', null, domain ?? 'None on the source page')),
    )
    caption.classList.remove('is-changing')
    void caption.offsetWidth
    caption.classList.add('is-changing')
    counter.textContent = `${pad2(at + 1)} / ${pad2(total)}`
    progressFill.style.transform = `scaleX(${(at + 1) / total})`
    prevButton.disabled = at === 0
    nextButton.disabled = at === total - 1
    pieces.forEach((piece, i) => piece.classList.toggle('is-active', i === at))
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
  stage.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowRight') {
      event.preventDefault()
      goTo(active + 1)
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault()
      goTo(active - 1)
    }
  })
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
    },
    unmount() {
      stop?.()
      stop = null
      window.clearTimeout(settleTimer)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onResize)
      stage.removeEventListener('pointermove', onPointer)
    },
  }
}
