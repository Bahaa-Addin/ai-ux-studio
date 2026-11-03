/**
 * Pocket: peel a service off the page like a sticker, keep it for later, and turn the
 * page to see everything you kept.
 *
 *   1. "Pocket it" on a card peels it off (Apple Books curl from its top-right corner),
 *      it lifts, and flies into the pocket. A liner stays in its place with "Put back".
 *   2. While anything is pocketed, the page's bottom-right corner sits half-turned,
 *      peeking at the pocket underneath, with a floating pocket button in the gap.
 *   3. The button turns the whole page away (same curl) to reveal the pocket: a sticker
 *      album of everything peeled off. "Back to Services" turns the page back.
 *
 * Every animation uses the one engine in ./curl.js. Content comes from the page's own
 * content model, so a pocketed sticker always shows the real title, copy and link.
 * Nothing here changes the protected header/footer; the pocket lives inside <main>.
 */

import { createCurl, cornerReach, fullTurn, tween, ease, lerp } from './curl.js'

const STORE_KEY = 'aixc.pocket.v1'
const RAD = Math.PI / 180
const PEEL_MS = 560 // peel back to halfway (the adhesive holds, then gives)
const LIFT_MS = 520 // keep peeling while lifting it off, until the last corner lets go
const THROW_MS = 820 // thrown into the pocket
const LIFTED_ANGLE = 0.72 * Math.PI // how steeply a small freed sticker is held up
const LIFT_HEIGHT = 170 // px: a long sticker droops instead, so it never rises higher than this
const PEEK_PHI = 38 * RAD // the page corner curls from the bottom-right
const TURNED_PHI = 12 * RAD // a turning page straightens toward a vertical fold
const SVG_NS = 'http://www.w3.org/2000/svg'

const PAGE_BACK = { base: [251, 251, 249], seeThrough: 0.12, rim: 0.12, gloss: 0.07, glossAt: 0.34 }
const STICKER_BACK = { base: [246, 246, 246], seeThrough: 0, rim: 0.28, gloss: 0.12, glossAt: 0.55 }

/** How each source section's stickers are tinted in the album (echoes the original cards). */
const TONES = { cash: 'cash', 'stay-in-control': 'red', 'great-entertainment': 'dark' }

/* --------------------------------------------------------------- utilities */

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))
const smoothstep = (from, to, value) => {
  const t = clamp((value - from) / (to - from), 0, 1)
  return t * t * (3 - 2 * t)
}
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

const make = (tag, props = {}, ...children) => {
  const node = document.createElement(tag)
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value === null || value === undefined || value === false) continue
    if (key === 'class') node.className = value
    else if (key === 'style') for (const [name, rule] of Object.entries(value)) node.style.setProperty(name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`), rule)
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value)
    else node.setAttribute(key, value === true ? '' : String(value))
  }
  node.append(...children.flat().filter((child) => child !== null && child !== undefined && child !== false))
  return node
}

/** 24×24 stroke icons drawn for the pocket (not taken from any icon set). */
const ICONS = {
  pocket: ['M5 4h14v9.5L12 20l-7-6.5z', 'M8.5 8h7'],
  pocketAdd: ['M5 4h14v9.5L12 20l-7-6.5z', 'M12 8v6.5M8.75 11.25h6.5'],
  back: ['M14.5 5.5 8 12l6.5 6.5'],
  external: ['M14 5h5v5', 'M19 5l-8 8', 'M17 14v5H5V7h5'],
  remove: ['M7 7l10 10M17 7 7 17'],
}

const icon = (name, className) => {
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('class', className)
  svg.setAttribute('aria-hidden', 'true')
  svg.setAttribute('focusable', 'false')
  svg.setAttribute('fill', 'none')
  svg.setAttribute('stroke', 'currentColor')
  svg.setAttribute('stroke-width', '2')
  svg.setAttribute('stroke-linecap', 'round')
  svg.setAttribute('stroke-linejoin', 'round')
  for (const d of ICONS[name]) {
    const path = document.createElementNS(SVG_NS, 'path')
    path.setAttribute('d', d)
    svg.append(path)
  }
  return svg
}

const stripIds = (root) => {
  root.removeAttribute?.('id')
  for (const node of root.querySelectorAll('[id]')) node.removeAttribute('id')
}

/** First opaque background behind an element, so a snapshot never turns see-through. */
const backdropOf = (node) => {
  for (let current = node; current && current.nodeType === 1; current = current.parentElement) {
    const color = getComputedStyle(current).backgroundColor
    if (color && color !== 'transparent' && !/rgba\(.*,\s*0\)$/.test(color)) return color
  }
  return '#fff'
}

/**
 * Wraps a detached copy in display:contents replicas of the original's ancestors, so
 * descendant selectors in the page CSS still match without changing layout.
 */
const wrapInAncestry = (node, parent) => {
  let wrapped = node
  for (let ancestor = parent; ancestor && ancestor !== document.body && ancestor !== document.documentElement; ancestor = ancestor.parentElement) {
    const tag = /^(MAIN|HEADER|FOOTER|NAV)$/.test(ancestor.tagName) ? 'div' : ancestor.tagName.toLowerCase()
    const replica = document.createElement(tag)
    replica.className = ancestor.className
    replica.style.display = 'contents'
    replica.append(wrapped)
    wrapped = replica
  }
  return wrapped
}

/** A frozen copy of a card at its current size and visual state (hover included). */
const snapshotCard = (card, width, height) => {
  const clone = card.cloneNode(true)
  const live = [card, ...card.querySelectorAll('*')]
  const copy = [clone, ...clone.querySelectorAll('*')]
  live.forEach((node, index) => {
    const target = copy[index]
    if (!target?.style) return
    const style = getComputedStyle(node)
    if (index > 0 && style.transform !== 'none') target.style.transform = style.transform
    if (style.opacity !== '1') target.style.opacity = style.opacity
    target.style.transition = 'none'
    target.style.animation = 'none'
  })
  for (const node of clone.querySelectorAll('.pocket-cta, .pocket-liner, .curl-host')) node.remove()
  clone.classList.remove('is-pocketed', 'is-peeling', 'is-returning')
  stripIds(clone)
  const ownBackground = getComputedStyle(card).backgroundColor
  Object.assign(clone.style, {
    position: 'absolute',
    left: '0',
    top: '0',
    width: `${width}px`,
    height: `${height}px`,
    minHeight: '0',
    maxWidth: 'none',
    margin: '0',
    transform: 'none',
    pointerEvents: 'none',
    backgroundColor: /rgba\(.*,\s*0\)$|transparent/.test(ownBackground) ? backdropOf(card.parentElement) : ownBackground,
  })
  return wrapInAncestry(clone, card.parentElement)
}

const stickerRadius = (width, height) => clamp(Math.min(width, height) * 0.11, 14, 32)

/**
 * Peel direction for a card: along its diagonal, from the top-right corner (where "Pocket it"
 * sits) toward the bottom-left. A long strip peels from one end along its length, like a
 * label, so the peeled part folds back within the card's own footprint.
 */
const stickerPhi = (width, height) => -clamp(Math.atan2(height, width) / RAD, 5, 82) * RAD

/** Deterministic small tilt per sticker so the album looks hand-placed but stays stable. */
const tiltFor = (id) => {
  let hash = 0
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) | 0
  return ((((hash % 9) + 9) % 9) - 4) * 0.55
}

const loadIds = () => {
  try {
    const value = JSON.parse(window.localStorage.getItem(STORE_KEY) || '[]')
    return Array.isArray(value) ? value.filter((id) => typeof id === 'string') : []
  } catch {
    return []
  }
}

/* -------------------------------------------------------------- controller */

export const initPocket = ({ adapter, regions, composer = null }) => {
  const { sourceRoot, outputRoot, viewbar, header, main } = regions
  const pageShell = main.closest('.page-shell') ?? document.querySelector('.page-shell')
  const { model } = adapter.extractContent(sourceRoot)
  if (!model) return null

  /** id → { item, section } for everything that can be pocketed (not the closing promo). */
  const catalog = new Map()
  for (const section of model.sections) for (const item of section.items) catalog.set(item.id, { item, section })

  const state = {
    ids: loadIds().filter((id) => catalog.has(id)), // oldest first
    view: 'page', // 'page' | 'pocket'
    busy: false, // a page turn is running
    peek: null, // { rig, sheet, phi, R, tween }
    saved: null, // where the page was when the pocket opened
    flights: new Set(), // stickers in the air
  }
  const cards = new Map()
  const isPocketed = (id) => state.ids.includes(id)
  const persist = () => {
    try {
      window.localStorage.setItem(STORE_KEY, JSON.stringify(state.ids))
    } catch {
      // Storage can be unavailable (private mode); the pocket then lasts for this visit.
    }
  }

  const live = make('div', { class: 'aixc-sr-only', role: 'status', 'aria-live': 'polite' })
  const announce = (text) => {
    live.textContent = ''
    window.setTimeout(() => (live.textContent = text), 60)
  }
  const countLabel = (n) => `${n} ${n === 1 ? 'item' : 'items'}`

  /* ------------------------------------------------------- fixed layers */
  // plane (z 6): what lies flat; flying stickers (z 7) pass between; lift (z 8): the curl.
  const planeLayer = make('div', { class: 'pocket-layer pocket-layer--plane', 'aria-hidden': 'true' })
  const liftLayer = make('div', { class: 'pocket-layer pocket-layer--lift', 'aria-hidden': 'true' })

  const peekCount = make('span', { class: 'pocket-peek__count', 'aria-hidden': 'true' }, '0')
  const peekButton = make(
    'button',
    { type: 'button', class: 'pocket-peek', 'data-state': 'hidden', 'aria-label': 'Open your pocket', inert: true },
    icon('pocket', 'pocket-peek__icon'),
    peekCount,
    make('span', { class: 'pocket-peek__tip', 'aria-hidden': 'true' }, 'Your pocket'),
  )

  /* ------------------------------------------------------- pocket view */
  const pocketTitle = make('h1', { class: 'pocket-view__title', id: 'pocket-title', tabindex: '-1' }, 'Your pocket')
  const pocketLead = make('p', { class: 'pocket-view__lead' })
  const grid = make('ul', { class: 'pocket-grid', role: 'list' })
  const backButton = make('button', { type: 'button', class: 'pocket-back' }, icon('back', 'pocket-back__icon'), 'Back to Services')
  const clearButton = make('button', { type: 'button', class: 'pocket-clear' }, 'Empty pocket')
  const emptyBack = make('button', { type: 'button', class: 'pocket-back pocket-back--solid' }, 'Back to Services')
  const empty = make(
    'div',
    { class: 'pocket-empty', hidden: true },
    icon('pocket', 'pocket-empty__icon'),
    make('p', { class: 'pocket-empty__title' }, 'Your pocket is empty'),
    make('p', { class: 'pocket-empty__text' }, 'Peel services off the page with “Pocket it” and they wait here for later.'),
    emptyBack,
  )
  const pocketRoot = make(
    'div',
    { id: 'pocket-output', class: 'pocket-output pocket-album', hidden: true },
    make(
      'section',
      { class: 'pocket-view', 'aria-labelledby': 'pocket-title' },
      make(
        'div',
        { class: 'container pocket-view__inner' },
        make('div', { class: 'pocket-view__bar' }, backButton, clearButton),
        make('header', { class: 'pocket-view__head' }, make('span', { class: 'pocket-view__mark' }, icon('pocket', 'pocket-view__mark-icon')), make('div', null, pocketTitle, pocketLead)),
        grid,
        empty,
      ),
    ),
  )
  main.append(pocketRoot)
  document.body.append(planeLayer, liftLayer, peekButton, live)

  /* ----------------------------------------------------- page geometry */
  const sheetRect = () => {
    const top = Math.max(0, Math.round(header.getBoundingClientRect().bottom))
    return { top, width: document.documentElement.clientWidth, height: Math.max(1, window.innerHeight - top) }
  }
  const small = () => window.innerWidth < 640
  const peekRadius = () => (small() ? 26 : 34)
  /** Distance of the fold from the corner: the roll plus a gap wide enough for the button. */
  const peekX = (extra = 0) => peekRadius() + (small() ? 100 : 120) + extra
  const pageRadius = (sheet) => clamp(sheet.width * 0.05, 44, 72)
  const peekTarget = () => {
    const rect = peekButton.getBoundingClientRect()
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
  }

  const placeLayers = (sheet) => {
    for (const layer of [planeLayer, liftLayer]) {
      Object.assign(layer.style, { top: `${sheet.top}px`, width: `${sheet.width}px`, height: `${sheet.height}px` })
    }
  }

  const albumUnder = (box) => box.append(make('div', { class: 'pocket-album pocket-album--under' }))

  /** A frozen copy of the page as it looks right now (or as `prepare` makes it look). */
  const snapshotPage = ({ scrollY, sheet, prepare = null }) => (box) => {
    const scroller = make('div', {
      class: 'curl-snapshot',
      style: {
        position: 'absolute',
        left: '0',
        top: `${-sheet.top}px`,
        width: `${sheet.width}px`,
        height: `${sheet.top + sheet.height}px`,
        overflow: 'hidden',
        background: getComputedStyle(document.body).backgroundColor || '#fff',
      },
    })
    const shell = pageShell.cloneNode(true)
    prepare?.(shell)
    for (const img of shell.querySelectorAll('img[loading="lazy"]')) img.loading = 'eager'
    stripIds(shell)
    scroller.append(shell)
    box.append(scroller)
    // The copy is its own scroll container, so sticky parts sit where they do on screen.
    scroller.scrollTop = scrollY
  }

  /* -------------------------------------------------------------- peek */
  const setPeekButton = (visible) => {
    peekButton.dataset.state = visible ? 'shown' : 'hidden'
    peekButton.inert = !visible
  }

  const updateCount = (n = state.ids.length) => {
    peekCount.textContent = String(n)
    peekCount.hidden = n === 0
    peekButton.setAttribute('aria-label', `Open your pocket, ${countLabel(n)}`)
  }

  const destroyPeek = () => {
    state.peek?.tween?.cancel()
    state.peek?.rig.destroy()
    state.peek = null
  }

  const buildPeek = (x) => {
    destroyPeek()
    const sheet = sheetRect()
    placeLayers(sheet)
    const rig = createCurl({
      width: sheet.width,
      height: sheet.height,
      under: albumUnder,
      back: PAGE_BACK,
      strips: 16,
      perspective: 2400,
    })
    planeLayer.replaceChildren(rig.plane)
    liftLayer.replaceChildren(rig.lift)
    state.peek = { rig, sheet, phi: PEEK_PHI, R: peekRadius(), tween: null }
    rig.update({ x, phi: PEEK_PHI, R: state.peek.R })
    return state.peek
  }

  /** Moves the peeking corner to `toX` (0 folds it flat). */
  const movePeek = (toX, duration, easing = ease.outCubic) => {
    const peek = state.peek
    if (!peek) return Promise.resolve(false)
    peek.tween?.cancel()
    const from = peek.rig.state?.x ?? 0
    peek.tween = tween(reducedMotion() ? 0 : duration, (e) => peek.rig.update({ x: lerp(from, toX, e), phi: peek.phi, R: peek.R }), easing)
    return peek.tween.promise
  }

  const openPeek = ({ animate = true } = {}) => {
    if (state.view !== 'page') return
    if (!state.peek) buildPeek(0)
    setPeekButton(true)
    movePeek(peekX(), animate ? 680 : 0)
  }

  const closePeek = async () => {
    setPeekButton(false)
    const done = await movePeek(0, 380, ease.inOutCubic)
    if (done && !state.ids.length && state.view === 'page') destroyPeek()
  }

  const bumpPeek = async () => {
    peekButton.classList.remove('is-bump')
    void peekButton.offsetWidth
    peekButton.classList.add('is-bump')
    if (await movePeek(peekX(22), 150)) movePeek(peekX(), 420, ease.outBack)
  }

  peekButton.addEventListener('pointerenter', () => !state.busy && movePeek(peekX(30), 260))
  peekButton.addEventListener('pointerleave', () => !state.busy && movePeek(peekX(), 320))
  // Keyboard focus turns the corner further too (not focus that follows a mouse click).
  peekButton.addEventListener('focus', () => !state.busy && peekButton.matches(':focus-visible') && movePeek(peekX(30), 260))
  peekButton.addEventListener('blur', () => !state.busy && movePeek(peekX(), 320))
  peekButton.addEventListener('animationend', () => peekButton.classList.remove('is-bump'))

  /* ------------------------------------------------- stickers on the page */
  let hover = null // a corner lifted while the pointer is on "Pocket it"

  const stickerRig = (card, width, height, rect, span = width + height) =>
    createCurl({
      width,
      height,
      front: (box) => box.append(snapshotCard(card, width, height)),
      back: STICKER_BACK,
      radius: getComputedStyle(card).borderRadius,
      strips: 12,
      perspective: Math.max(2200, span * 3), // big cards lift without ballooning toward the camera
      origin: [window.innerWidth / 2 - rect.left, window.innerHeight / 2 - rect.top],
    })

  const liftCorner = (card, id) => {
    if (reducedMotion() || state.view !== 'page' || isPocketed(id) || hover?.card === card) return
    dropCorner({ immediate: true })
    const style = getComputedStyle(card)
    const width = card.offsetWidth
    const height = card.offsetHeight
    const rig = stickerRig(card, width, height, card.getBoundingClientRect())
    const host = make('div', {
      class: 'curl-host curl-host--inside',
      style: { left: `${-parseFloat(style.borderLeftWidth) || 0}px`, top: `${-parseFloat(style.borderTopWidth) || 0}px`, width: `${width}px`, height: `${height}px` },
    })
    host.append(rig.plane, rig.lift)
    card.append(host)
    card.classList.add('is-peeling')
    const R = stickerRadius(width, height)
    const phi = stickerPhi(width, height)
    // Enough lift to clear the chip sitting on the corner, so the curl is visible.
    const lifted = clamp(2 * cornerReach(width, height, phi) * 0.24, 50, 96)
    hover = { card, id, host, rig, R, phi, tween: null }
    hover.tween = tween(280, (e) => rig.update({ x: lerp(0, lifted, e), phi, R }), ease.outCubic)
  }

  const dropCorner = ({ immediate = false } = {}) => {
    const current = hover
    if (!current) return
    hover = null
    current.tween?.cancel()
    const finish = () => {
      current.host.remove()
      current.rig.destroy()
      if (hover?.card !== current.card && !isPocketed(current.id)) current.card.classList.remove('is-peeling')
    }
    if (immediate) return finish()
    const from = current.rig.state?.x ?? 0
    tween(200, (e) => current.rig.update({ x: lerp(from, 0, e), phi: current.phi, R: current.R }), ease.outCubic).promise.then(finish)
  }

  /**
   * A sticker's whole trip as a function of time, so pocketing plays it forward and Put back
   * plays the very same frames in reverse:
   *
   *   peel   0 .. PEEL_MS          the corner folds back over the card to halfway
   *   lift   .. + LIFT_MS          the peel runs on to the far corner while the peeled part is
   *                                pulled up off the page; the last corner lets go
   *   throw  .. + THROW_MS         the freed sticker arcs into the pocket, relaxing a little,
   *                                shrinking and slipping under the turned page
   */
  const stickerJourney = (card, { startX = 0 } = {}) => {
    const rect = card.getBoundingClientRect()
    const { width, height } = rect
    const R = stickerRadius(width, height)
    const phi = stickerPhi(width, height)
    const span = 2 * cornerReach(width, height, phi)
    const rig = stickerRig(card, width, height, rect, span)
    const host = make('div', {
      class: 'curl-host curl-host--flying',
      style: { left: `${rect.left}px`, top: `${rect.top}px`, width: `${width}px`, height: `${height}px` },
    })
    host.append(rig.plane, rig.lift)
    document.body.append(host)

    const halfway = Math.max(startX, span * 0.5)
    const free = span + R * 1.2 // the roll has passed the far corner: nothing is stuck
    const relaxed = span * 0.45
    const liftedAngle = Math.PI - Math.asin(clamp(LIFT_HEIGHT / span, 0.14, Math.sin(Math.PI - LIFTED_ANGLE)))
    const relaxedAngle = Math.max(liftedAngle, 0.82 * Math.PI)
    const endScale = clamp(40 / Math.max(width, height), 0.05, 0.3)
    const onPage = PEEL_MS + LIFT_MS
    const duration = onPage + THROW_MS
    const reach = span / 2

    /**
     * Where the card's middle has got to for a curl state, as a point in the card's own box.
     * Once peeled past its far corner the sticker hangs beyond its slot, so the motion is
     * steered by this point: it is pulled back over the slot and the throw spins around it.
     */
    const body = (x, angle) => {
      const a = reach - x
      const sigma = -a // arc length from the fold to the middle
      const along = a >= 0 ? 0 : sigma <= R * angle ? a + R * Math.sin(sigma / R) : a + R * Math.sin(angle) + (sigma - R * angle) * Math.cos(angle)
      return { x: width / 2 + Math.cos(phi) * along, y: height / 2 + Math.sin(phi) * along }
    }
    const place = (point, dx, dy, scale, rotate = 0) => {
      host.style.transformOrigin = `${point.x}px ${point.y}px`
      host.style.transform = `translate(${dx}px, ${dy}px) rotate(${rotate}deg) scale(${scale})`
    }

    let path = null
    const shadow = (k) => (k > 0.01 ? `drop-shadow(0 ${Math.round(14 * k)}px ${Math.round(16 * k)}px rgba(20, 20, 30, ${(0.28 * k).toFixed(3)}))` : 'none')

    const at = (time) => {
      if (time <= onPage) {
        path = null
        const now = card.getBoundingClientRect() // stay on the card if the page scrolls
        host.style.left = `${now.left}px`
        host.style.top = `${now.top}px`
        host.style.opacity = '1'
        if (time <= PEEL_MS) {
          const x = lerp(startX, halfway, ease.inQuad(time / PEEL_MS))
          rig.update({ x, phi, R })
          host.dataset.peel = (x / span).toFixed(2) // how much is peeled, 1 = all of it
          host.style.transform = 'none'
          host.style.filter = 'none'
        } else {
          const u = ease.inOutSine((time - PEEL_MS) / LIFT_MS)
          const x = lerp(halfway, free, u)
          const angle = lerp(Math.PI, liftedAngle, u)
          rig.update({ x, phi, R, angle, ground: 1 - u })
          host.dataset.peel = Math.min(1, x / span).toFixed(2)
          // As the last corner lets go, the hand draws the sticker up over its own slot.
          // Barely anything is still stuck by the time this pull is noticeable.
          const pull = smoothstep(0.15, 1, u)
          const point = body(x, angle)
          place(point, (width / 2 - point.x) * pull, (height / 2 - point.y) * pull, 1 + 0.04 * pull)
          host.style.filter = shadow(u ** 3)
        }
        return
      }
      if (!path) {
        const now = card.getBoundingClientRect()
        const from = { x: now.left + width / 2, y: now.top + height / 2 }
        const to = peekTarget()
        path = { left: now.left, top: now.top, from, to, via: { x: lerp(from.x, to.x, 0.32), y: Math.min(from.y, to.y) - Math.min(240, window.innerHeight * 0.26) } }
        host.style.left = `${now.left}px`
        host.style.top = `${now.top}px`
      }
      const t = (time - onPage) / THROW_MS
      const e = ease.inOutSine(t)
      const { left, top, from, to, via } = path
      const x = lerp(free, relaxed, ease.outCubic(t))
      const angle = lerp(liftedAngle, relaxedAngle, t)
      rig.update({ x, phi, R, angle, ground: 0 })
      // The sticker itself (not its empty box) follows the arc into the pocket.
      const point = body(x, angle)
      const bx = (1 - e) ** 2 * from.x + 2 * (1 - e) * e * via.x + e * e * to.x
      const by = (1 - e) ** 2 * from.y + 2 * (1 - e) * e * via.y + e * e * to.y
      const scale = lerp(1.04, endScale, ease.inOutCubic(clamp((t - 0.08) / 0.92, 0, 1))) * (1 + 0.05 * Math.sin(Math.min(1, t / 0.3) * Math.PI))
      place(point, bx - (left + point.x), by - (top + point.y), scale, 16 * t - 9 * Math.sin(t * Math.PI))
      host.style.opacity = t > 0.84 ? String(1 - (t - 0.84) / 0.16) : '1'
      host.style.filter = shadow(1)
    }

    return {
      duration,
      at,
      destroy: () => {
        host.remove()
        rig.destroy()
      },
    }
  }

  /** Plays a journey forward (pocketing) or backward (Put back); resolves when it ends. */
  const play = (journey, direction) =>
    tween(journey.duration, (_, t) => journey.at((direction === 'forward' ? t : 1 - t) * journey.duration)).promise

  const peelAndFly = async (card, startX) => {
    const journey = stickerJourney(card, { startX })
    await play(journey, 'forward')
    journey.destroy()
  }

  /** The same journey backwards. Returns the cleanup so the caller can swap in the card first. */
  const flyBack = async (card) => {
    const journey = stickerJourney(card)
    await play(journey, 'backward')
    return journey.destroy
  }

  const fly = async (job) => {
    state.flights.add(job)
    try {
      return await job
    } finally {
      state.flights.delete(job)
    }
  }

  const pocketItem = async (id) => {
    if (isPocketed(id) || state.view !== 'page' || state.busy) return
    const card = cards.get(id)
    const { item } = catalog.get(id)
    const startX = hover?.card === card ? hover.rig.state?.x ?? 0 : 0
    const fromKeyboard = card.querySelector('.pocket-cta')?.matches(':focus-visible')
    state.ids.push(id)
    persist()
    dropCorner({ immediate: true })
    card.classList.remove('is-peeling')
    card.classList.add('is-pocketed')
    // Keep a keyboard user's place: the chip is gone, so focus moves to "Put back".
    if (fromKeyboard) card.querySelector('.pocket-liner__undo')?.focus({ preventScroll: true })
    announce(`${item.title} is in your pocket. ${countLabel(state.ids.length)}.`)
    if (reducedMotion()) {
      openPeek({ animate: false })
      updateCount()
      return
    }
    const landing = fly(peelAndFly(card, startX))
    openPeek()
    await landing
    if (state.view === 'page') {
      updateCount()
      bumpPeek()
    }
  }

  const putBack = async (id) => {
    if (!isPocketed(id) || state.view !== 'page' || state.busy) return
    const card = cards.get(id)
    const { item } = catalog.get(id)
    const fromKeyboard = card.querySelector('.pocket-liner__undo')?.matches(':focus-visible')
    state.ids = state.ids.filter((other) => other !== id)
    persist()
    updateCount()
    announce(`${item.title} is back on the page. ${countLabel(state.ids.length)} in your pocket.`)
    card.classList.replace('is-pocketed', 'is-returning')
    if (!reducedMotion() && state.peek) {
      bumpPeek()
      const cleanup = await fly(flyBack(card))
      card.classList.remove('is-returning')
      cleanup()
    } else {
      card.classList.remove('is-returning')
    }
    if (fromKeyboard) card.querySelector('.pocket-cta')?.focus({ preventScroll: true })
    if (!state.ids.length) closePeek()
  }

  const decorate = (card, id) => {
    const { item } = catalog.get(id)
    card.classList.add('pocket-host')
    const cta = make(
      'button',
      { type: 'button', class: 'pocket-cta', 'aria-label': `Pocket it: ${item.title}` },
      icon('pocketAdd', 'pocket-cta__icon'),
      make('span', { class: 'pocket-cta__label' }, 'Pocket it'),
    )
    cta.addEventListener('pointerenter', (event) => event.pointerType !== 'touch' && liftCorner(card, id))
    cta.addEventListener('pointerleave', () => hover?.card === card && dropCorner())
    cta.addEventListener('click', () => pocketItem(id))
    const undo = make('button', { type: 'button', class: 'pocket-liner__undo', 'aria-label': `Put back ${item.title}` }, 'Put back')
    undo.addEventListener('click', () => putBack(id))
    const liner = make(
      'div',
      { class: 'pocket-liner' },
      make('div', { class: 'pocket-liner__content' }, icon('pocket', 'pocket-liner__icon'), make('p', { class: 'pocket-liner__text' }, 'In your pocket'), undo),
    )
    card.append(liner, cta)
    if (isPocketed(id)) card.classList.add('is-pocketed')
    cards.set(id, card)
  }

  for (const card of sourceRoot.querySelectorAll('[data-aixc-item]')) {
    const id = card.dataset.aixcItem
    if (catalog.has(id)) decorate(card, id)
  }

  /* --------------------------------------------------------- the album */
  const stickerFor = (id) => {
    const { item, section } = catalog.get(id)
    const tone = TONES[section.id] ?? 'light'
    const titleId = `pocket-sticker-${id}`
    const link = item.cta?.href ? { href: item.cta.href, label: item.cta.label || 'View more' } : section.cta?.href ? { href: section.cta.href, label: section.cta.label } : null
    const remove = make('button', { type: 'button', class: 'pocket-sticker__remove', 'aria-label': `Remove ${item.title} from your pocket` }, icon('remove', 'pocket-sticker__remove-icon'), make('span', null, 'Remove'))
    const sticker = make(
      'article',
      { class: `pocket-sticker pocket-sticker--${tone}`, 'aria-labelledby': titleId, style: { '--tilt': `${tiltFor(id)}deg` } },
      make('div', { class: 'pocket-sticker__media' }, make('img', { src: item.image.src, alt: '', class: item.image.fit === 'contain' ? 'is-contain' : null })),
      make(
        'div',
        { class: 'pocket-sticker__body' },
        make('p', { class: 'pocket-sticker__from' }, section.title),
        make('h2', { class: 'pocket-sticker__title', id: titleId }, item.title),
        item.description ? make('p', { class: 'pocket-sticker__desc' }, item.description) : null,
        make(
          'div',
          { class: 'pocket-sticker__actions' },
          link
            ? make('a', { class: 'pocket-sticker__cta', href: link.href, target: '_blank', rel: 'noopener noreferrer' }, link.label, icon('external', 'pocket-sticker__cta-icon'), make('span', { class: 'aixc-sr-only' }, ' (opens in a new tab)'))
            : make('span'),
          remove,
        ),
      ),
    )
    const cell = make('li', { class: 'pocket-grid__item', 'data-pocket-id': id }, sticker)
    remove.addEventListener('click', () => removeFromPocket(id, cell))
    return cell
  }

  const renderLead = () => {
    const n = state.ids.length
    pocketLead.textContent = n
      ? `${n} ${n === 1 ? 'service' : 'services'} you peeled off the Services page, kept here for later.`
      : 'Nothing here yet.'
    grid.hidden = n === 0
    empty.hidden = n > 0
    clearButton.hidden = n === 0
  }

  const renderPocket = () => {
    grid.replaceChildren(...[...state.ids].reverse().map(stickerFor))
    renderLead()
  }

  /** Peels an album sticker off with the same curl, then lets the grid close the gap. */
  const peelAway = async (sticker) => {
    const rect = sticker.getBoundingClientRect()
    const width = sticker.offsetWidth
    const height = sticker.offsetHeight
    const tilt = parseFloat(sticker.style.getPropertyValue('--tilt')) || 0
    const centre = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
    const R = stickerRadius(width, height)
    const rig = createCurl({
      width,
      height,
      front: (box) => box.append(snapshotCard(sticker, width, height)),
      back: STICKER_BACK,
      radius: getComputedStyle(sticker).borderRadius,
      strips: 12,
      origin: [window.innerWidth / 2 - (centre.x - width / 2), window.innerHeight / 2 - (centre.y - height / 2)],
    })
    const host = make('div', {
      class: 'curl-host curl-host--flying',
      style: { left: `${centre.x - width / 2}px`, top: `${centre.y - height / 2}px`, width: `${width}px`, height: `${height}px`, transform: `rotate(${tilt}deg)`, zIndex: '9' },
    })
    host.append(rig.plane, rig.lift)
    document.body.append(host)
    sticker.style.visibility = 'hidden'
    const phi = stickerPhi(width, height)
    const end = fullTurn(width, height, phi, R)
    await tween(
      620,
      (e, t) => {
        rig.update({ x: lerp(0, end, e), phi, R })
        host.style.transform = `rotate(${tilt}deg) translateY(${-24 * t}px)`
        host.style.opacity = t > 0.6 ? String(1 - (t - 0.6) / 0.4) : '1'
      },
      ease.inQuad,
    ).promise
    host.remove()
    rig.destroy()
  }

  const unpocketCard = (id) => cards.get(id)?.classList.remove('is-pocketed', 'is-returning')

  const removeFromPocket = async (id, cell) => {
    if (state.busy || !isPocketed(id)) return
    const { item } = catalog.get(id)
    const next = cell.nextElementSibling ?? cell.previousElementSibling
    if (!reducedMotion()) await peelAway(cell.querySelector('.pocket-sticker'))
    state.ids = state.ids.filter((other) => other !== id)
    persist()
    unpocketCard(id)
    updateCount()
    cell.remove()
    renderLead()
    announce(`${item.title} removed from your pocket. ${countLabel(state.ids.length)} left.`)
    ;(next?.querySelector('.pocket-sticker__remove') ?? (state.ids.length ? pocketTitle : emptyBack)).focus({ preventScroll: true })
  }

  clearButton.addEventListener('click', () => {
    if (state.busy) return
    for (const id of state.ids) unpocketCard(id)
    state.ids = []
    persist()
    updateCount()
    grid.replaceChildren()
    renderLead()
    announce('Your pocket is empty.')
    emptyBack.focus({ preventScroll: true })
  })

  /* --------------------------------------------------------- page turn */
  const coveredRegions = () => {
    const note = viewbar.nextElementSibling?.classList.contains('aixc-viewnote') ? viewbar.nextElementSibling : null
    return [sourceRoot, outputRoot, viewbar, note].filter(Boolean)
  }

  const openPocket = async () => {
    if (state.busy || state.view !== 'page' || !state.ids.length) return
    state.busy = true
    await Promise.allSettled([...state.flights])
    dropCorner({ immediate: true })
    if (!state.peek) buildPeek(peekX())
    const peek = state.peek
    peek.tween?.cancel()
    const { sheet } = peek
    const scrollY = window.scrollY

    // Freeze what is on screen into the turning sheet, then swap the live page for the
    // pocket underneath it. Both happen before the next paint, so nothing flickers.
    peek.rig.setFront(snapshotPage({ scrollY, sheet }))
    const hidden = new Map(coveredRegions().map((node) => [node, node.hidden]))
    state.saved = { scrollY, hidden }
    for (const node of hidden.keys()) node.hidden = true
    composer?.state?.activeExperience?.unmount?.()
    renderPocket()
    pocketRoot.hidden = false
    state.view = 'pocket'
    document.body.dataset.pocketView = 'open'
    window.scrollTo(0, 0)
    peek.rig.setUnder(null)
    setPeekButton(false)

    const from = { x: peek.rig.state?.x ?? peekX(), phi: peek.phi, R: peek.R }
    const toR = pageRadius(sheet)
    await tween(
      reducedMotion() ? 0 : 1150,
      (e, t) => {
        const phi = lerp(from.phi, TURNED_PHI, ease.inOutSine(t))
        const R = lerp(from.R, toR, ease.inOutSine(t))
        peek.rig.update({ x: lerp(from.x, fullTurn(sheet.width, sheet.height, phi, R) + 80, e), phi, R })
      },
      ease.inOutSine,
    ).promise
    destroyPeek()
    pocketTitle.focus({ preventScroll: true })
    announce(`Your pocket, ${countLabel(state.ids.length)}.`)
    state.busy = false
  }

  const closePocket = async () => {
    if (state.busy || state.view !== 'pocket') return
    state.busy = true
    const saved = state.saved ?? { scrollY: 0, hidden: new Map() }
    const sheet = sheetRect()
    placeLayers(sheet)
    const fromR = pageRadius(sheet)
    const toR = peekRadius()
    const landX = state.ids.length ? peekX() : 0

    // The services page comes back over the pocket: a sheet that starts fully turned.
    const restoreInCopy = (shell) => {
      shell.querySelector('.pocket-output')?.setAttribute('hidden', '')
      for (const [node, wasHidden] of saved.hidden) {
        const copy = shell.querySelector(`.${node.classList[0]}`)
        if (copy) copy.hidden = wasHidden
      }
    }
    const rig = createCurl({ width: sheet.width, height: sheet.height, back: PAGE_BACK, strips: 16, perspective: 2400 })
    destroyPeek()
    planeLayer.replaceChildren(rig.plane)
    liftLayer.replaceChildren(rig.lift)
    // Snapshot only once mounted: the copy needs layout to restore its scroll position.
    rig.setFront(snapshotPage({ scrollY: saved.scrollY, sheet, prepare: restoreInCopy }))
    state.peek = { rig, sheet, phi: PEEK_PHI, R: toR, tween: null }
    rig.update({ x: fullTurn(sheet.width, sheet.height, TURNED_PHI, fromR) + 80, phi: TURNED_PHI, R: fromR })

    await tween(
      reducedMotion() ? 0 : 1100,
      (e, t) => {
        const phi = lerp(TURNED_PHI, PEEK_PHI, ease.inOutSine(t))
        const R = lerp(fromR, toR, ease.inOutSine(t))
        const start = fullTurn(sheet.width, sheet.height, phi, R) + 80
        rig.update({ x: lerp(start, landX, e), phi, R })
      },
      ease.inOutSine,
    ).promise

    // Landed: put the live page back under the sheet, then let the sheet go transparent.
    rig.setUnder(albumUnder)
    pocketRoot.hidden = true
    for (const [node, wasHidden] of saved.hidden) node.hidden = wasHidden
    state.view = 'page'
    delete document.body.dataset.pocketView
    window.scrollTo(0, saved.scrollY)
    rig.setFront(null)
    if (composer?.state?.view === 'reimagined') composer.state.activeExperience?.mount?.()
    state.saved = null
    state.busy = false
    if (state.ids.length) {
      setPeekButton(true)
      peekButton.focus({ preventScroll: true })
    } else {
      setPeekButton(false)
      destroyPeek()
      ;(sourceRoot.hidden ? document.querySelector('.aixc-launcher') : sourceRoot.querySelector('.pocket-cta'))?.focus({ preventScroll: true })
    }
  }

  peekButton.addEventListener('click', openPocket)
  backButton.addEventListener('click', closePocket)
  emptyBack.addEventListener('click', closePocket)
  pocketRoot.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && state.view === 'pocket') {
      event.preventDefault()
      closePocket()
    }
  })

  /* ------------------------------------------------------- lifecycle */
  let resizeTimer = 0
  window.addEventListener('resize', () => {
    window.clearTimeout(resizeTimer)
    resizeTimer = window.setTimeout(() => {
      if (state.busy || state.view !== 'page' || !state.peek) return
      buildPeek(peekX())
    }, 160)
  })

  updateCount()
  if (state.ids.length) {
    // Returning visitor: the corner turns up shortly after the page settles.
    window.setTimeout(() => openPeek({ animate: true }), 500)
  }

  return {
    state,
    pocket: pocketItem,
    putBack,
    open: openPocket,
    close: closePocket,
  }
}
