/**
 * Infinite canvas — adapted from "Infinite Draggable Image Gallery" (codepen.io/filipz/pen/dPPyJZX).
 *
 * The services lie on a grid you drag around with momentum (the reference's
 * 0.075 ease and ×200 release), small and tall cards alternating. The grid wraps
 * at its edges so it pans without end, yet each service exists exactly once: the
 * reference repeats tiles, here the tiles travel round instead. Opening a card
 * zooms its image to the centre on the reference's "hop" ease (0.9, 0, 0.1, 1),
 * the canvas fades under a dark overlay and the title rises word by word, with
 * the description and link below. Arrow keys pan a card at a time, Tab glides
 * from card to card, Enter opens, Escape closes. The reference's twelve-column
 * header and footer frame it: categories to jump to, counts, coordinates and key
 * hints, plus layered vignettes and moving grain. If the grid is too small to
 * wrap without showing a tile twice, it stays put and simply pans within bounds.
 */

import { h, pathIcon, svgIcon } from '../dom.js'
import {
  chromeOffset, clamp, closingBand, ctaFor, experienceRoot, flatItems, groupExtras, groupsOf, liveStatus, media, pad2,
  pageHeading, promotionOf, reducedMotion,
} from './shared.js'

const HOP = 'cubic-bezier(0.9, 0, 0.1, 1)'
const POWER3_OUT = 'cubic-bezier(0.215, 0.61, 0.355, 1)'
const POWER2_IN_OUT = 'cubic-bezier(0.455, 0.03, 0.515, 0.955)'
const ICON_CLOSE = 'M18.3 5.7 16.9 4.3 12 9.2 7.1 4.3 5.7 5.7l4.9 4.9-4.9 4.9 1.4 1.4 4.9-4.9 4.9 4.9 1.4-1.4-4.9-4.9z'
const EASE_PER_SECOND = 4.7 // the reference's 0.075 per 60 fps frame
const MOMENTUM = 200

/** Columns that leave the fewest empty cells, preferring a landscape grid. */
const columnsFor = (cells) => {
  let best = { columns: Math.ceil(Math.sqrt(cells)), holes: Infinity }
  for (let columns = Math.ceil(Math.sqrt(cells)); columns <= Math.ceil(Math.sqrt(cells)) + 3; columns += 1) {
    const holes = Math.ceil(cells / columns) * columns - cells
    if (holes < best.holes) best = { columns, holes }
  }
  return best.columns
}

const words = (text) => String(text).split(/\s+/).filter(Boolean)

export const renderCanvas = (schema, index) => {
  const groups = groupsOf(schema, index)
  const entries = flatItems(groups)
  const total = entries.length
  const promo = promotionOf(schema, index)
  const cellCount = total + 1 // one brand tile opens the grid
  const columns = columnsFor(cellCount)
  const rows = Math.ceil(cellCount / columns)

  /* ----------------------------------------------------------------- cards */
  const brand = h(
    'div',
    { class: 'cv-tile cv-tile--brand', 'aria-hidden': 'true' },
    svgIcon('icon-vodafone-logo-white', 'cv-tile__mark'),
    h('span', { class: 'cv-tile__title' }, index.model.title),
    h('span', { class: 'cv-tile__text' }, `${total} services · ${groups.length} categories`),
    h('span', { class: 'cv-tile__text' }, 'Drag to explore'),
  )
  const cards = entries.map(({ item, group }, at) => {
    const card = h(
      'button',
      { type: 'button', class: 'cv-tile cv-card', 'data-aixc-item': item.id, 'aria-label': `${item.title}, ${group.title}. Open details` },
      media(item, { className: 'cv-card__media', eager: at < 10 }),
      h('span', { class: 'cv-card__caption', 'aria-hidden': 'true' }, h('span', { class: 'cv-card__name' }, item.title), h('span', { class: 'cv-card__num' }, `#${String(at + 1).padStart(5, '0')} · ${group.title}`)),
    )
    card.addEventListener('click', (event) => {
      if (moved) {
        event.preventDefault()
        return
      }
      open(at)
    })
    return card
  })
  const tiles = [brand, ...cards]
  tiles.forEach((tile, cell) => {
    tile.dataset.col = String(cell % columns)
    tile.dataset.row = String(Math.floor(cell / columns))
    // The reference alternates two heights; a checkerboard keeps rows varied.
    const tall = (Math.floor(cell / columns) + (cell % columns)) % 2 === 1
    tile.classList.add(tall ? 'is-tall' : 'is-short')
  })
  const plane = h('div', { class: 'cv-plane' }, tiles)
  const surface = h('div', { class: 'cv-surface', tabindex: '0', 'aria-label': 'Services canvas. Use the arrow keys to pan, Tab to move between services.' }, plane)

  /* --------------------------------------------------------- header/footer */
  const jumpButtons = groups.map((group) => {
    const button = h('button', { type: 'button', class: 'cv-link', 'data-group': group.id }, group.title)
    button.addEventListener('click', () => centerOn(entries.findIndex((entry) => entry.group === group), { focus: false }))
    return button
  })
  const half = Math.ceil(jumpButtons.length / 2)
  const coords = h('p', { class: 'cv-coords', 'aria-hidden': 'true' }, 'X +0000 · Y +0000')
  const head = h(
    'header',
    { class: 'cv-head' },
    h('div', { class: 'cv-col cv-col--brand' }, h('span', { class: 'cv-logo', 'aria-hidden': 'true' }, h('span', { class: 'cv-logo__dot' }), h('span', { class: 'cv-logo__dot' })), h('p', { class: 'cv-brand' }, index.model.title)),
    h('nav', { class: 'cv-col cv-col--cats', 'aria-label': 'Jump to a category' }, h('h3', null, '+Categories'), h('ul', null, jumpButtons.slice(0, half).map((button) => h('li', null, button)))),
    h('div', { class: 'cv-col cv-col--cats2' }, h('h3', { 'aria-hidden': 'true' }, ' '), h('ul', null, jumpButtons.slice(half).map((button) => h('li', null, button)))),
    h('div', { class: 'cv-col cv-col--count', 'aria-hidden': 'true' }, h('h3', null, '+On the canvas'), h('p', null, `${total} services`), h('p', null, `${groups.length} categories`)),
    h('div', { class: 'cv-col cv-col--keys', 'aria-hidden': 'true' }, h('h3', null, '+Controls'), h('p', null, 'Drag or arrow keys to pan'), h('p', null, 'Click or Enter to open')),
  )
  const foot = h(
    'footer',
    { class: 'cv-foot', 'aria-hidden': 'true' },
    coords,
    h('p', { class: 'cv-keys' }, 'Press ', h('span', { class: 'cv-key' }, 'Enter'), ' to open, ', h('span', { class: 'cv-key' }, 'Esc'), ' to close'),
    h('p', { class: 'cv-sign' }, 'Vodafone Egypt · Services'),
  )

  /* ---------------------------------------------------------------- dialog */
  const zoomBox = h('div', { class: 'cv-zoom' })
  const titleLine = h('h2', { class: 'cv-dialog__title', id: 'cv-dialog-title' })
  const dialogMeta = h('p', { class: 'cv-dialog__meta' })
  const dialogDesc = h('p', { class: 'cv-dialog__desc' })
  const dialogActions = h('div', { class: 'cv-dialog__actions' })
  const closeButton = h('button', { type: 'button', class: 'vx-round vx-on-dark cv-dialog__close', 'aria-label': 'Close' }, pathIcon(ICON_CLOSE, ''))
  const overlay = h('div', { class: 'cv-dialog__overlay', 'aria-hidden': 'true' })
  const dialogBody = h('div', { class: 'cv-dialog__body' }, zoomBox, titleLine, h('div', { class: 'cv-dialog__more' }, dialogMeta, dialogDesc, dialogActions))
  const dialog = h('dialog', { class: 'cv-dialog vx-dark', 'aria-labelledby': 'cv-dialog-title' }, overlay, dialogBody, closeButton)

  const status = liveStatus()
  const stage = h(
    'section',
    { class: 'cv-stage vx-dark', 'aria-label': 'Vodafone services, infinite canvas' },
    surface,
    h('div', { class: 'cv-vignette', 'aria-hidden': 'true' }, h('span'), h('span'), h('span')),
    h('div', { class: 'cv-grain', 'aria-hidden': 'true' }),
    head,
    foot,
    status,
  )
  const root = experienceRoot('canvas', schema, pageHeading(index), stage, closingBand(promo), dialog)

  /* ---------------------------------------------------------------- layout */
  let tileW = 300
  let shortH = 230
  let tallH = 380
  let gap = 48
  let cellW = 348
  let cellH = 428
  let worldW = 0
  let worldH = 0
  let wrapX = true
  let wrapY = true
  let viewW = 0
  let viewH = 0
  let current = { x: 0, y: 0 }
  let target = { x: 0, y: 0 }
  let drawn = ''

  const measure = () => {
    viewW = surface.clientWidth || window.innerWidth
    viewH = surface.clientHeight || window.innerHeight
    const narrow = viewW < 720
    tileW = narrow ? 190 : 300
    shortH = Math.round(tileW * 0.77)
    tallH = Math.round(tileW * 1.27)
    gap = narrow ? 24 : 48
    cellW = tileW + gap
    cellH = tallH + gap
    worldW = columns * cellW
    worldH = rows * cellH
    // Wrapping needs a full spare column and row, or a tile would show twice.
    wrapX = worldW >= viewW + cellW
    wrapY = worldH >= viewH + cellH
    plane.style.setProperty('--tile-w', `${tileW}px`)
    plane.style.setProperty('--short-h', `${shortH}px`)
    plane.style.setProperty('--tall-h', `${tallH}px`)
    drawn = ''
  }

  const bound = (value, view, world) => (world <= view ? (view - world) / 2 : clamp(value, view - world - 24, 24))

  const place = () => {
    const key = `${current.x.toFixed(1)}|${current.y.toFixed(1)}|${viewW}|${viewH}`
    if (key === drawn) return
    drawn = key
    tiles.forEach((tile) => {
      const col = Number(tile.dataset.col)
      const row = Number(tile.dataset.row)
      let x = col * cellW + current.x
      let y = row * cellH + current.y
      if (wrapX) x = ((((x + cellW) % worldW) + worldW) % worldW) - cellW
      if (wrapY) y = ((((y + cellH) % worldH) + worldH) % worldH) - cellH
      tile.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`
    })
    const sign = (value) => (value >= 0 ? '+' : '-')
    const ox = Math.round(-current.x)
    const oy = Math.round(-current.y)
    coords.textContent = `X ${sign(ox)}${String(Math.abs(ox)).padStart(4, '0')} · Y ${sign(oy)}${String(Math.abs(oy)).padStart(4, '0')}`
  }

  const settleTarget = () => {
    if (!wrapX) target.x = bound(target.x, viewW, worldW)
    if (!wrapY) target.y = bound(target.y, viewH, worldH)
  }

  /** Where a tile currently sits on screen (after wrapping). */
  const screenSpot = (tile) => {
    const matrix = new DOMMatrixReadOnly(getComputedStyle(tile).transform)
    return { x: matrix.m41, y: matrix.m42, w: tile.offsetWidth, h: tile.offsetHeight }
  }

  /** Shortest way round the wrapped grid to bring `delta` to zero. */
  const nearest = (delta, world, wraps) => {
    if (!wraps) return delta
    const options = [delta, delta - world, delta + world]
    return options.reduce((best, option) => (Math.abs(option) < Math.abs(best) ? option : best))
  }

  const centerOn = (at, { focus = true, instant = false } = {}) => {
    const card = cards[clamp(at, 0, total - 1)]
    const spot = screenSpot(card)
    target.x = current.x + nearest(viewW / 2 - (spot.x + spot.w / 2), worldW, wrapX)
    target.y = current.y + nearest(viewH / 2 - (spot.y + spot.h / 2), worldH, wrapY)
    settleTarget()
    if (instant || reducedMotion()) current = { ...target }
    if (focus) card.focus({ preventScroll: true })
  }

  /* ---------------------------------------------------------------- motion */
  let frame = 0
  let last = 0
  let mounted = false

  const loop = (now) => {
    if (!mounted) return
    const dt = last ? Math.min((now - last) / 1000, 0.05) : 0.016
    last = now
    if (reducedMotion()) current = { ...target }
    else {
      const k = 1 - Math.exp(-dt * EASE_PER_SECOND)
      current = { x: current.x + (target.x - current.x) * k, y: current.y + (target.y - current.y) * k }
      if (Math.abs(target.x - current.x) < 0.05 && Math.abs(target.y - current.y) < 0.05) current = { ...target }
    }
    place()
    frame = window.requestAnimationFrame(loop)
  }

  /* ------------------------------------------------------------------ drag */
  let pointer = null
  let lastPoint = null
  let lastTime = 0
  let velocity = { x: 0, y: 0 }
  let moved = false

  const onDown = (event) => {
    if (event.button !== 0 || dialog.open) return
    if (event.target.closest('.cv-head, .cv-foot')) return
    pointer = event.pointerId
    lastPoint = { x: event.clientX, y: event.clientY }
    lastTime = performance.now()
    velocity = { x: 0, y: 0 }
    moved = false
    surface.classList.add('is-grabbing')
  }
  const onMove = (event) => {
    if (event.pointerId !== pointer) return
    const dx = event.clientX - lastPoint.x
    const dy = event.clientY - lastPoint.y
    if (!moved && Math.abs(event.clientX - lastPoint.x) + Math.abs(event.clientY - lastPoint.y) < 5) return
    if (!moved) {
      moved = true
      surface.setPointerCapture?.(event.pointerId)
    }
    const now = performance.now()
    const dt = Math.max(10, now - lastTime)
    lastTime = now
    velocity = { x: dx / dt, y: dy / dt }
    target.x += dx
    target.y += dy
    lastPoint = { x: event.clientX, y: event.clientY }
  }
  const onUp = (event) => {
    if (event.pointerId !== pointer) return
    pointer = null
    surface.classList.remove('is-grabbing')
    if (moved && (Math.abs(velocity.x) > 0.1 || Math.abs(velocity.y) > 0.1)) {
      target.x += velocity.x * MOMENTUM
      target.y += velocity.y * MOMENTUM
    }
    settleTarget()
    // Let the click that ends a drag see `moved`, then clear it.
    window.setTimeout(() => (moved = false), 0)
  }
  const onWheel = (event) => {
    // Sideways swipes pan; vertical scrolling stays with the page.
    if (Math.abs(event.deltaX) <= Math.abs(event.deltaY) || dialog.open) return
    event.preventDefault()
    target.x -= event.deltaX
    settleTarget()
  }

  surface.addEventListener('keydown', (event) => {
    const step = { ArrowLeft: [cellW, 0], ArrowRight: [-cellW, 0], ArrowUp: [0, cellH], ArrowDown: [0, -cellH] }[event.key]
    if (!step || event.altKey || event.ctrlKey || event.metaKey) return
    event.preventDefault()
    target.x += step[0]
    target.y += step[1]
    settleTarget()
  })
  // Tab glides the canvas to the focused card (and keeps the stage on screen).
  surface.addEventListener('focusin', (event) => {
    const at = cards.indexOf(event.target)
    if (at < 0) return
    const stageTop = stage.getBoundingClientRect().top
    if (stageTop < chromeOffset() - 2 || stage.getBoundingClientRect().bottom > window.innerHeight + 2) {
      window.scrollTo({ top: window.scrollY + stageTop - chromeOffset(), behavior: 'auto' })
    }
    centerOn(at, { focus: false })
    const { item, group } = entries[at]
    status.textContent = `${at + 1} of ${total}: ${item.title}, ${group.title}`
  })

  /* --------------------------------------------------------- open / close */
  let openIndex = -1
  let closing = false

  const fillDialog = (at) => {
    const { item, group } = entries[at]
    zoomBox.replaceChildren(media(item, { className: 'cv-zoom__media', eager: true }))
    // Real spaces between the word spans keep the heading's text (and its spoken
    // name) intact; the flex layout ignores them.
    titleLine.replaceChildren(...words(item.title).flatMap((word, n) => [n ? ' ' : null, h('span', { class: 'cv-word' }, h('span', { class: 'cv-word__inner' }, word))]).filter(Boolean))
    dialogMeta.textContent = `#${String(at + 1).padStart(5, '0')} · ${group.title}`
    dialogDesc.textContent = item.description ?? ''
    dialogDesc.hidden = !item.description
    const extras = groupExtras(group, { onDark: true })
    dialogActions.replaceChildren(...[ctaFor(item, { variant: 'primary', standalone: true, onDark: true }), extras].filter(Boolean))
  }

  const flipFrom = (fromRect) => {
    const toRect = zoomBox.getBoundingClientRect()
    if (!toRect.width || !fromRect.width) return null
    return `translate(${(fromRect.left - toRect.left).toFixed(1)}px, ${(fromRect.top - toRect.top).toFixed(1)}px) scale(${(fromRect.width / toRect.width).toFixed(4)}, ${(fromRect.height / toRect.height).toFixed(4)})`
  }

  const open = (at) => {
    if (dialog.open) return
    openIndex = at
    const card = cards[at]
    const cardMedia = card.querySelector('.cv-card__media')
    const fromRect = cardMedia.getBoundingClientRect()
    zoomBox.style.setProperty('--ratio', `${(card.offsetWidth / card.offsetHeight).toFixed(4)}`)
    fillDialog(at)
    dialog.showModal()
    closeButton.focus({ preventScroll: true })
    card.classList.add('is-lifted')
    stage.classList.add('is-open')
    if (reducedMotion() || typeof zoomBox.animate !== 'function') return
    const from = flipFrom(fromRect)
    if (from) zoomBox.animate([{ transform: from }, { transform: 'none' }], { duration: 600, easing: HOP })
    overlay.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 800, easing: POWER2_IN_OUT, fill: 'both' })
    titleLine.querySelectorAll('.cv-word__inner').forEach((word, n) => {
      word.animate([{ transform: 'translateY(100%)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 1000, delay: 500 + n * 100, easing: POWER3_OUT, fill: 'backwards' })
    })
    dialogBody.querySelector('.cv-dialog__more').animate([{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'none' }], { duration: 600, delay: 650, easing: POWER3_OUT, fill: 'backwards' })
  }

  const close = () => {
    if (!dialog.open || closing) return
    const card = cards[openIndex]
    const finish = () => {
      closing = false
      dialog.close()
      card.classList.remove('is-lifted')
      stage.classList.remove('is-open')
      card.focus({ preventScroll: true })
    }
    if (reducedMotion() || typeof zoomBox.animate !== 'function') {
      finish()
      return
    }
    closing = true
    stage.classList.remove('is-open')
    const toRect = card.querySelector('.cv-card__media').getBoundingClientRect()
    const fromNow = zoomBox.getBoundingClientRect()
    const back = toRect.width
      ? `translate(${(toRect.left - fromNow.left).toFixed(1)}px, ${(toRect.top - fromNow.top).toFixed(1)}px) scale(${(toRect.width / fromNow.width).toFixed(4)}, ${(toRect.height / fromNow.height).toFixed(4)})`
      : 'scale(0.6)'
    titleLine.querySelectorAll('.cv-word__inner').forEach((word, n) => {
      word.animate([{ transform: 'none', opacity: 1 }, { transform: 'translateY(-100%)', opacity: 0 }], { duration: 600, delay: n * 60, easing: POWER3_OUT, fill: 'forwards' })
    })
    dialogBody.querySelector('.cv-dialog__more').animate([{ opacity: 1 }, { opacity: 0 }], { duration: 250, fill: 'forwards' })
    overlay.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 800, easing: POWER2_IN_OUT, fill: 'forwards' })
    const zoom = zoomBox.animate([{ transform: 'none' }, { transform: back }], { duration: 600, delay: 150, easing: HOP, fill: 'forwards' })
    zoom.onfinish = () => {
      finish()
      zoomBox.getAnimations().forEach((animation) => animation.cancel())
      overlay.getAnimations().forEach((animation) => animation.cancel())
    }
  }

  closeButton.addEventListener('click', close)
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault()
    close()
  })
  overlay.addEventListener('click', close)
  zoomBox.addEventListener('click', close)

  const onResize = () => {
    measure()
    settleTarget()
  }

  measure()
  place()

  return {
    element: root,
    afterMount: [
      () => {
        measure()
        // Start with the brand tile in the middle of the view, the services around it.
        const spotX = viewW / 2 - tileW / 2
        const spotY = viewH / 2 - shortH / 2
        target = { x: spotX, y: spotY }
        settleTarget()
        current = { ...target }
        drawn = ''
        place()
      },
    ],
    mount() {
      mounted = true
      last = 0
      measure()
      surface.addEventListener('pointerdown', onDown)
      surface.addEventListener('pointermove', onMove)
      surface.addEventListener('pointerup', onUp)
      surface.addEventListener('pointercancel', onUp)
      surface.addEventListener('wheel', onWheel, { passive: false })
      window.addEventListener('resize', onResize)
      frame = window.requestAnimationFrame(loop)
    },
    unmount() {
      mounted = false
      window.cancelAnimationFrame(frame)
      if (dialog.open) dialog.close()
      surface.removeEventListener('pointerdown', onDown)
      surface.removeEventListener('pointermove', onMove)
      surface.removeEventListener('pointerup', onUp)
      surface.removeEventListener('pointercancel', onUp)
      surface.removeEventListener('wheel', onWheel)
      window.removeEventListener('resize', onResize)
    },
  }
}
