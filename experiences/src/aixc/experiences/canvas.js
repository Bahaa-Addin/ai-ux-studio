/*
 * Copyright (c) filipz (https://codepen.io/filipz/pen/dPPyJZX)
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
 *
 * Right to left (the Arabic page): the grid reads from the top right, so the brand
 * tile and the first services sit at the right of each row and the order runs
 * leftward; the title's words rise in Arabic order, with Latin runs kept whole.
 * Dragging, sideways swipes and the arrow keys stay physical: the canvas moves
 * with the hand (or the arrow) the same way in both languages.
 */

import { h, pathIcon, svgIcon } from '../dom.js'
import { countCategories } from '../../i18n.js'
import {
  chromeOffset, clamp, closingBand, countWords, ctaFor, experienceRoot, flatItems, frame, groupExtras, groupsOf, guarded, isRTL, later,
  liveStatus, media, on, onViewResize, onViewScroll, onViewZones, pageHeading, promotionOf, reducedMotion, scrollToElement,
  t, viewBottom, viewHeight, viewScroller, viewTop, words,
} from './shared.js'
import { viewDialog } from './view-dialog.js'

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

const wordsOf = (text) => String(text).split(/\s+/).filter(Boolean)

const ARABIC = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/
const LATIN = /[A-Za-z]/

/**
 * The title's rising chunks. Left to right these are the words. Right to left the
 * flex row runs from the right, which would reverse a Latin run inside an Arabic
 * title ("Anghami Plus" → "Plus Anghami"), so consecutive non-Arabic words travel
 * as one left-to-right chunk.
 */
const titleChunks = (text) => {
  const list = wordsOf(text)
  if (!isRTL) return list.map((word) => ({ text: word, ltr: false }))
  const chunks = []
  for (const word of list) {
    const previous = chunks[chunks.length - 1]
    if (!ARABIC.test(word) && previous && !ARABIC.test(previous.text)) previous.text += ` ${word}`
    else chunks.push({ text: word })
  }
  return chunks.map((chunk) => ({ text: chunk.text, ltr: !ARABIC.test(chunk.text) && LATIN.test(chunk.text) }))
}

/** Fills a translated template like "Press {enter} to open" with nodes for its placeholders. */
const withNodes = (template, nodes) =>
  template.split(/(\{\w+\})/).filter(Boolean).map((part) => {
    const name = /^\{(\w+)\}$/.exec(part)?.[1]
    return name && nodes[name] ? nodes[name] : part
  })

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
    h('span', { class: 'cv-tile__text' }, `${countWords(total)} · ${countCategories(groups.length)}`),
    h('span', { class: 'cv-tile__text' }, t('Drag to explore')),
  )
  const cards = entries.map(({ item, group }, at) => {
    const card = h(
      'button',
      { type: 'button', class: 'cv-tile cv-card', 'data-aixc-item': item.id, 'aria-label': t('{title}, {group}. Open details', { title: item.title, group: group.title }) },
      media(item, { className: 'cv-card__media', eager: at < 10 }),
      h('span', { class: 'cv-card__caption', 'aria-hidden': 'true' }, h('span', { class: 'cv-card__name' }, item.title), h('span', { class: 'cv-card__num' }, `#${String(at + 1).padStart(5, '0')} · ${group.title}`)),
    )
    return card
  })
  const tiles = [brand, ...cards]
  tiles.forEach((tile, cell) => {
    // Reading order: from the left in English, from the right in Arabic.
    tile.dataset.col = String(isRTL ? columns - 1 - (cell % columns) : cell % columns)
    tile.dataset.row = String(Math.floor(cell / columns))
    // The reference alternates two heights; a checkerboard keeps rows varied
    // (counted in reading order, so the brand tile stays short in both languages).
    const tall = (Math.floor(cell / columns) + (cell % columns)) % 2 === 1
    tile.classList.add(tall ? 'is-tall' : 'is-short')
  })
  const plane = h('div', { class: 'cv-plane' }, tiles)
  const surface = h('div', { class: 'cv-surface', tabindex: '0', 'aria-label': words('Services canvas. Use the arrow keys to pan, Tab to move between services.') }, plane)

  /* --------------------------------------------------------- header/footer */
  const jumpButtons = groups.map((group) => h('button', { type: 'button', class: 'cv-link', 'data-group': group.id }, group.title))
  const half = Math.ceil(jumpButtons.length / 2)
  const coords = h('p', { class: 'cv-coords', dir: 'ltr', 'aria-hidden': 'true' }, 'X +0000 · Y +0000')
  const head = h(
    'header',
    { class: 'cv-head' },
    h('div', { class: 'cv-col cv-col--brand' }, h('span', { class: 'cv-logo', 'aria-hidden': 'true' }, h('span', { class: 'cv-logo__dot' }), h('span', { class: 'cv-logo__dot' })), h('p', { class: 'cv-brand' }, index.model.title)),
    h('nav', { class: 'cv-col cv-col--cats', 'aria-label': words('Jump to a category') }, h('h3', null, t('+Categories')), h('ul', null, jumpButtons.slice(0, half).map((button) => h('li', null, button)))),
    h('div', { class: 'cv-col cv-col--cats2' }, h('h3', { 'aria-hidden': 'true' }, ' '), h('ul', null, jumpButtons.slice(half).map((button) => h('li', null, button)))),
    h('div', { class: 'cv-col cv-col--count', 'aria-hidden': 'true' }, h('h3', null, t('+On the canvas')), h('p', null, countWords(total)), h('p', null, countCategories(groups.length))),
    h('div', { class: 'cv-col cv-col--keys', 'aria-hidden': 'true' }, h('h3', null, t('+Controls')), h('p', null, t('Drag or arrow keys to pan')), h('p', null, t('Click or Enter to open'))),
  )
  const foot = h(
    'footer',
    { class: 'cv-foot', 'aria-hidden': 'true' },
    coords,
    h('p', { class: 'cv-keys' }, withNodes(t('Press {enter} to open, {esc} to close'), { enter: h('span', { class: 'cv-key' }, 'Enter'), esc: h('span', { class: 'cv-key' }, 'Esc') })),
    h('p', { class: 'cv-sign' }, words('Vodafone Egypt · Services', { page: index.model.title })),
  )

  /* ---------------------------------------------------------------- dialog */
  const zoomBox = h('div', { class: 'cv-zoom' })
  const titleLine = h('h2', { class: 'cv-dialog__title', id: 'cv-dialog-title' })
  const dialogMeta = h('p', { class: 'cv-dialog__meta' })
  const dialogDesc = h('p', { class: 'cv-dialog__desc' })
  const dialogActions = h('div', { class: 'cv-dialog__actions' })
  const closeButton = h('button', { type: 'button', class: 'vx-round vx-on-dark cv-dialog__close', 'aria-label': t('Close') }, pathIcon(ICON_CLOSE, ''))
  const overlay = h('div', { class: 'cv-dialog__overlay', 'aria-hidden': 'true' })
  const dialogBody = h('div', { class: 'cv-dialog__body' }, zoomBox, titleLine, h('div', { class: 'cv-dialog__more' }, dialogMeta, dialogDesc, dialogActions))
  const dialog = h('dialog', { class: 'cv-dialog vx-dark', 'aria-labelledby': 'cv-dialog-title' }, overlay, dialogBody, closeButton)

  const status = liveStatus()
  const stage = h(
    'section',
    { class: 'cv-stage vx-dark', 'aria-label': words('Vodafone services, infinite canvas') },
    surface,
    h('div', { class: 'cv-vignette', 'aria-hidden': 'true' }, h('span'), h('span'), h('span')),
    h('div', { class: 'cv-grain', 'aria-hidden': 'true' }),
    head,
    foot,
    status,
  )
  const root = experienceRoot('canvas', schema, pageHeading(index), stage, closingBand(promo), dialog)
  /** What passes the corners as the box scrolls, besides the cards (fence()). */
  const flowing = [...jumpButtons, ...root.querySelectorAll('.vx-closing a[href], .vx-closing button')]

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
  /** Each tile's place on the surface (its translate), as place() last drew it. */
  const spots = []

  const measure = () => {
    viewW = surface.clientWidth || document.documentElement.clientWidth
    viewH = surface.clientHeight || viewHeight()
    const narrow = viewW < 720
    // In a box whose room is shorter than the clone's shortest stage (440 px) can be (a phone in landscape), smaller
    // tiles still, so a tall card fits the room whole.
    const low = Boolean(viewScroller()) && viewH < 420
    // A phone's box: two columns of cards whole side by side (one of the clone's 190 px in its 375 px would leave every
    // card beside it cut by the box's sides, inert there), the canvas starting at the reading edge (afterMount).
    const twin = Boolean(viewScroller()) && narrow && !low
    tileW = low ? 150 : twin ? Math.min(190, Math.floor((viewW - 56) / 2)) : narrow ? 190 : 300
    shortH = Math.round(tileW * 0.77)
    tallH = Math.round(tileW * 1.27)
    gap = narrow || low ? 24 : 48
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
  /**
   * In a box, where a card is brought to (centerOn: Tab, reveal, the jump links): a grid that does not wrap may move
   * past its usual bounds, as far as one cell left in the view, so that any card can rest at a spot clear of the
   * corners (clearSpot); a later drag or key brings it back within them.
   */
  const reach = (value, view, world, cell) => {
    const lo = Math.min(world <= view ? (view - world) / 2 : view - world - 24, cell - world)
    const hi = Math.max(world <= view ? (view - world) / 2 : 24, view - cell)
    return clamp(value, lo, hi)
  }

  const place = () => {
    const key = `${current.x.toFixed(1)}|${current.y.toFixed(1)}|${viewW}|${viewH}`
    if (key === drawn) return
    drawn = key
    tiles.forEach((tile, cell) => {
      const col = Number(tile.dataset.col)
      const row = Number(tile.dataset.row)
      let x = col * cellW + current.x
      let y = row * cellH + current.y
      if (wrapX) x = ((((x + cellW) % worldW) + worldW) % worldW) - cellW
      if (wrapY) y = ((((y + cellH) % worldH) + worldH) % worldH) - cellH
      spots[cell] = { x, y }
      tile.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`
    })
    const sign = (value) => (value >= 0 ? '+' : '-')
    // Measured from the brand tile, so the first frame reads the same in both
    // directions (in RTL the brand tile sits in the last column, not the first).
    const ox = Math.round(-(current.x + Number(brand.dataset.col) * cellW))
    const oy = Math.round(-current.y)
    coords.textContent = `X ${sign(ox)}${String(Math.abs(ox)).padStart(4, '0')} · Y ${sign(oy)}${String(Math.abs(oy)).padStart(4, '0')}`
    fence()
  }

  /** The target within the grid's bounds; `wide` (in a box: a card brought to, a resize) within reach() instead. */
  const settleTarget = (wide = false) => {
    const limit = wide ? reach : bound
    if (!wrapX) target.x = limit(target.x, viewW, worldW, cellW)
    if (!wrapY) target.y = limit(target.y, viewH, worldH, cellH)
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

  /**
   * Where a w×h card rests when brought to (its centre, in the surface's coordinates): the view's middle; in a box the
   * spot nearest it where the card shows whole in the box's room and meets neither bottom corner's zone (the guide's
   * transcript bar may take most of a short room), else the middle.
   */
  const clearSpot = (w, h) => {
    const middle = { x: viewW / 2, y: viewH / 2 }
    const box = viewScroller()
    if (!box || !zones) return middle
    const s = surface.getBoundingClientRect()
    const b = box.getBoundingClientRect()
    const left = b.left + box.clientLeft - s.left
    const right = left + box.clientWidth
    const bottom = b.top + box.clientTop + box.clientHeight - s.top
    const room = { left: Math.max(0, left) + 8, right: Math.min(viewW, right) - 8, top: Math.max(0, viewTop() - s.top) + 8, bottom: Math.min(viewH, bottom) - 8 }
    const corners = [
      { left: right - zones.rw, right, top: bottom - zones.rh },
      { left, right: left + zones.lw, top: bottom - zones.lh },
    ].filter((z) => z.right > z.left && z.top < bottom)
    // A press at the card's middle must reach it, not a jump link of the head above it.
    const links = jumpButtons.filter((button) => button.getClientRects().length && !button.inert)
    const floor = links.length ? Math.max(...links.map((button) => button.getBoundingClientRect().bottom)) - s.top + 4 : 0
    const xs = [middle.x, ...corners.flatMap((z) => [z.left - w / 2 - 8, z.right + w / 2 + 8])]
    const ys = [middle.y, ...corners.map((z) => z.top - h / 2 - 8)]
    const clear = (x, y, under) =>
      x - w / 2 >= room.left && x + w / 2 <= room.right && y - h / 2 >= room.top && y + h / 2 <= room.bottom && y > under &&
      !corners.some((z) => x - w / 2 < z.right && x + w / 2 > z.left && y + h / 2 > z.top)
    const all = xs.flatMap((x) => ys.map((y) => ({ x, y })))
    all.sort((a, c) => Math.hypot(a.x - middle.x, a.y - middle.y) - Math.hypot(c.x - middle.x, c.y - middle.y))
    // Its middle below the links where it can be, else anywhere clear of the corners, else the view's middle.
    return all.find(({ x, y }) => clear(x, y, floor)) ?? all.find(({ x, y }) => clear(x, y, -Infinity)) ?? middle
  }

  const centerOn = (at, { focus = true, instant = false } = {}) => {
    const card = cards[clamp(at, 0, total - 1)]
    const spot = screenSpot(card)
    const to = clearSpot(spot.w, spot.h)
    target.x = current.x + nearest(to.x - (spot.x + spot.w / 2), worldW, wrapX)
    target.y = current.y + nearest(to.y - (spot.y + spot.h / 2), worldH, wrapY)
    settleTarget(Boolean(viewScroller()))
    if (instant || reducedMotion()) current = { ...target }
    if (focus) card.focus({ preventScroll: true })
  }


  /* ---------------------------------------------------------------- motion */
  let stopLoop = null
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
    stopLoop = frame(loop)
  }

  /* ----------------------------------------------------------------- fence */
  /** The box's bottom corners' safe zones (px), as the shell measures them on the box; read when they change. */
  let zones = null
  const readZones = () => {
    const box = viewScroller()
    if (!box) return
    const style = getComputedStyle(box)
    const px = (name) => Number.parseFloat(style.getPropertyValue(`--aixc-safe-${name}`)) || 0
    zones = { rw: px('right-w'), rh: px('right-h'), lw: px('left-w'), lh: px('left-h') }
  }

  /**
   * In a box: each card that the box's left or right side cuts (or that lies wholly past one), or that meets a bottom
   * corner's safe zone (the box's --aixc-safe-*), is inert while there; the others not. Read from where place() drew the
   * tiles, after each drawing and whenever the box scrolls or the zones change. The focused card is left alone while
   * the canvas glides to it (Tab, the jump links); at rest a focused card that turns inert hands the focus to the
   * surface, so the arrow keys still pan.
   */
  const fence = () => {
    const box = viewScroller()
    if (!box || !mounted || !zones) return
    const b = box.getBoundingClientRect()
    const left = b.left + box.clientLeft
    const right = left + box.clientWidth
    const bottom = b.top + box.clientTop + box.clientHeight
    const s = surface.getBoundingClientRect()
    const moving = current.x !== target.x || current.y !== target.y
    const focused = cards.find((card) => card === document.activeElement)
    cards.forEach((card, at) => {
      const spot = spots[at + 1]
      if (!spot) return
      const x = s.left + spot.x
      const y = s.top + spot.y
      const r = x + tileW
      const h = y + (card.classList.contains('is-tall') ? tallH : shortH)
      const low = y < bottom
      const out = x < left - 1 || r > right + 1 || (low && h > bottom - zones.rh && r > right - zones.rw) || (low && h > bottom - zones.lh && x < left + zones.lw)
      const inert = out && !(moving && card === focused)
      if (card.inert !== inert) card.inert = inert
    })
    if (focused?.inert) surface.focus({ preventScroll: true })
    // The head's jump links and the closing band's links pass the corners as the box scrolls (the band ends the view
    // under a stage as tall as the room): one that meets a zone is inert while there, never the focused one.
    for (const node of flowing) {
      const r = node.getBoundingClientRect()
      const out = node !== document.activeElement && r.top < bottom && ((r.bottom > bottom - zones.rh && r.right > right - zones.rw) || (r.bottom > bottom - zones.lh && r.left < left + zones.lw))
      if (node.inert !== out) node.inert = out
    }
  }

  /* ------------------------------------------------------------------ drag */
  // On Vodafone's pages the stage takes the drag (the surface itself takes no press: a corner of it lies under the
  // corners' controls; canvas.css); on the clone the surface, as before.
  const dragArea = viewScroller() ? stage : surface
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
    dragArea.classList.add('is-grabbing')
  }
  const onMove = (event) => {
    if (event.pointerId !== pointer) return
    const dx = event.clientX - lastPoint.x
    const dy = event.clientY - lastPoint.y
    if (!moved && Math.abs(event.clientX - lastPoint.x) + Math.abs(event.clientY - lastPoint.y) < 5) return
    if (!moved) {
      moved = true
      dragArea.setPointerCapture?.(event.pointerId)
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
    dragArea.classList.remove('is-grabbing')
    if (moved && (Math.abs(velocity.x) > 0.1 || Math.abs(velocity.y) > 0.1)) {
      target.x += velocity.x * MOMENTUM
      target.y += velocity.y * MOMENTUM
    }
    settleTarget()
    // Let the click that ends a drag see `moved`, then clear it.
    later(() => (moved = false), 0)
  }
  const onWheel = (event) => {
    // Sideways swipes pan; vertical scrolling stays with the page (the box on Vodafone's pages).
    if (Math.abs(event.deltaX) <= Math.abs(event.deltaY) || dialog.open) return
    event.preventDefault()
    target.x -= event.deltaX
    settleTarget()
  }

  const onKey = (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return
    // In a box, Tab steps from card to card itself: a card resting past the box's sides is inert there, so the
    // browser's own order would skip it. From the surface it starts at the first card; past either end it leaves.
    if (event.key === 'Tab' && viewScroller()) {
      const from = cards.indexOf(event.target)
      const to = from < 0 ? (event.target === surface && !event.shiftKey ? 0 : -1) : from + (event.shiftKey ? -1 : 1)
      if (to < 0 || to >= total) return
      event.preventDefault()
      cards[to].inert = false
      cards[to].focus({ preventScroll: true })
      return
    }
    const step = { ArrowLeft: [cellW, 0], ArrowRight: [-cellW, 0], ArrowUp: [0, cellH], ArrowDown: [0, -cellH] }[event.key]
    if (!step) return
    event.preventDefault()
    target.x += step[0]
    target.y += step[1]
    settleTarget()
  }
  // Tab glides the canvas to the focused card (and keeps the stage in the view: the window, or the box).
  const onFocus = (event) => {
    const at = cards.indexOf(event.target)
    if (at < 0) return
    // In a box a card focused by a press (a mouse's or a tap: not :focus-visible) stays where it is (it is pressable
    // there: the fence), so the click that follows lands on it even under reduced motion, where a glide would be a jump
    // from under the finger. On touch the focus comes after pointerup, so a pointer still down cannot tell.
    if (!(viewScroller() && !event.target.matches(':focus-visible'))) {
      const rect = stage.getBoundingClientRect()
      if (rect.top < viewTop() - 2 || rect.bottom > viewBottom() + 2) scrollToElement(stage, { instant: true })
      centerOn(at, { focus: false })
      // Drawn at once (in a box the fence then reads where the tiles are, before the box's scroll event can).
      place()
    }
    const { item, group } = entries[at]
    status.textContent = t('{n} of {total}: {title}, {group}', { n: at + 1, total, title: item.title, group: group.title })
  }

  /* --------------------------------------------------------- open / close */
  let openIndex = -1
  let closing = false

  const fillDialog = (at) => {
    const { item, group } = entries[at]
    zoomBox.replaceChildren(media(item, { className: 'cv-zoom__media', eager: true }))
    // Real spaces between the word spans keep the heading's text (and its spoken
    // name) intact; the flex layout ignores them.
    titleLine.replaceChildren(
      ...titleChunks(item.title)
        .flatMap((chunk, n) => [n ? ' ' : null, h('span', { class: 'cv-word', dir: chunk.ltr ? 'ltr' : null }, h('span', { class: 'cv-word__inner' }, chunk.text))])
        .filter(Boolean),
    )
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

  // The clone's modal dialog; on Vodafone's pages one in the box, never in the top layer (view-dialog.js viewDialog).
  const sheet = viewDialog(dialog, { onEscape: () => close() })

  const open = (at) => {
    if (dialog.open) return
    openIndex = at
    const card = cards[at]
    const cardMedia = card.querySelector('.cv-card__media')
    const fromRect = cardMedia.getBoundingClientRect()
    zoomBox.style.setProperty('--ratio', `${(card.offsetWidth / card.offsetHeight).toFixed(4)}`)
    fillDialog(at)
    sheet.open(card)
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

  /** The card back in its place, the stage as it was; `focus` false (an unmount) leaves the focus alone. */
  const finish = ({ focus = true } = {}) => {
    const card = cards[openIndex]
    closing = false
    card?.classList.remove('is-lifted')
    stage.classList.remove('is-open')
    // The card shows again before the dialog gives it the focus back.
    sheet.close({ focus })
  }

  const close = () => {
    if (!dialog.open || closing) return
    const card = cards[openIndex]
    // The fence may have made its card inert while the preview showed (the zones changed: the guide listening, a
    // resize). Brought to its clear spot first, so the zoom flies back there and the dialog can give it the focus back.
    if (card.inert) {
      centerOn(openIndex, { focus: false, instant: true })
      place()
      card.inert = false
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
    zoom.onfinish = guarded('canvas close', () => {
      if (!closing) return
      finish()
      zoomBox.getAnimations().forEach((animation) => animation.cancel())
      overlay.getAnimations().forEach((animation) => animation.cancel())
    })
  }

  /**
   * In a box, the head's jump links keep out of a corner's zone that reaches up to them (a short room, the guide's
   * transcript bar): the head steps in from that side (canvas.css .cv-head--clear-r / --clear-l), its other columns
   * giving way where that leaves it narrow (.cv-head--tight). Read on the head as laid out without them.
   */
  const fitHead = () => {
    const box = viewScroller()
    if (!box || !zones) return
    head.classList.remove('cv-head--clear-r', 'cv-head--clear-l', 'cv-head--tight')
    const shown = jumpButtons.filter((button) => button.getClientRects().length)
    if (!shown.length) return
    const b = box.getBoundingClientRect()
    const room = viewHeight() - chromeOffset()
    const tall = head.offsetHeight
    const meets = (zoneH, side) => zoneH > 0 && room - zoneH < tall + 8 && shown.some(side)
    const r = meets(zones.rh, (button) => button.getBoundingClientRect().right > b.left + box.clientLeft + box.clientWidth - zones.rw - 16)
    const l = meets(zones.lh, (button) => button.getBoundingClientRect().left < b.left + box.clientLeft + zones.lw + 16)
    head.classList.toggle('cv-head--clear-r', r)
    head.classList.toggle('cv-head--clear-l', l)
    head.classList.toggle('cv-head--tight', (r || l) && box.clientWidth - (r ? zones.rw : 0) - (l ? zones.lw : 0) < 640)
  }

  const onResize = () => {
    measure()
    settleTarget(Boolean(viewScroller()))
    readZones()
    fitHead()
    fence()
  }

  // Everything the canvas listens to while it shows, added on mount through the seam and undone on unmount (or by the
  // seam's reset), so a kept view mounted again listens again.
  const listen = () => [
    on(dragArea, 'pointerdown', onDown),
    on(dragArea, 'pointermove', onMove),
    on(dragArea, 'pointerup', onUp),
    on(dragArea, 'pointercancel', onUp),
    on(dragArea, 'wheel', onWheel, { passive: false }),
    on(surface, 'keydown', onKey),
    on(surface, 'focusin', onFocus),
    ...cards.map((card, at) =>
      on(card, 'click', (event) => {
        if (moved) {
          event.preventDefault()
          return
        }
        open(at)
      }),
    ),
    ...jumpButtons.map((button) => {
      const at = entries.findIndex((entry) => entry.group.id === button.dataset.group)
      return on(button, 'click', () => centerOn(at, { focus: false }))
    }),
    on(closeButton, 'click', close),
    on(dialog, 'cancel', (event) => {
      event.preventDefault()
      close()
    }),
    on(overlay, 'click', close),
    on(zoomBox, 'click', close),
    onViewResize(onResize),
    // In a box: which cards are clear changes with the box's scroll and the zones alone too (the Pocket's button
    // showing, the guide listening).
    ...(viewScroller() ? [onViewScroll(fence), onViewZones(onResize)] : []),
  ]
  let offs = []

  measure()
  place()

  return {
    element: root,
    afterMount: [
      () => {
        measure()
        // Start with the brand tile in the middle of the view, the services around it
        // (its column is the last one in Arabic, where the grid reads from the right). In a phone's box at the
        // reading edge instead, with the next column whole beside it.
        const edge = isRTL ? viewW - 16 - tileW : 16
        const spotX = (viewScroller() && viewW < 720 && viewH >= 420 ? edge : viewW / 2 - tileW / 2) - Number(brand.dataset.col) * cellW
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
      readZones()
      fitHead()
      drawn = ''
      place()
      offs = listen()
      stopLoop = frame(loop)
    },
    unmount() {
      mounted = false
      stopLoop?.()
      stopLoop = null
      for (const off of offs.splice(0)) off()
      // The clone (no scroller: the surface takes the drag) closes its modal dialog as before; in a box the preview's
      // card and stage are put back too.
      if (dialog.open && dragArea === surface) dialog.close()
      else if (dialog.open) {
        zoomBox.getAnimations?.().forEach((animation) => animation.cancel())
        overlay.getAnimations?.().forEach((animation) => animation.cancel())
        finish({ focus: false })
      }
    },
    /**
     * Glides the canvas to the card of `itemId` at once (the guide's spotlight comes next), the stage brought into the
     * view first (the box, or the window); false if it has none. In a box the card rests clear of the corners where the
     * box's room allows, pressable at once; with the guide's transcript bar over a short room it may rest in a zone,
     * inert there.
     */
    reveal(itemId) {
      const at = entries.findIndex((entry) => entry.item.id === itemId)
      if (at < 0) return false
      const rect = stage.getBoundingClientRect()
      if (rect.top < viewTop() - 2 || rect.bottom > viewBottom() + 2) scrollToElement(stage, { instant: true })
      centerOn(at, { focus: false, instant: true })
      place()
      // The inert flags current even when place() drew nothing new (the same spot as before the box scrolled).
      fence()
      return true
    },
  }
}
