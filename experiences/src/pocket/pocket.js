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
 *
 * The mascot and drone (./pocket-actors.js) are told about each step through a few
 * lifecycle calls; they are decoration and never hold up a save, an open or a close.
 *
 * Two hosts (voice-guide ADR-0052). The Services clone (src/shell.js) is the default; on Vodafone's
 * own pages the experience layer passes `seams` (src/host/demos/pocket.js): where the album goes,
 * what the turn freezes, how the page's content is covered and restored, how every node is marked
 * and every handler guarded. Stickers come from a store of records (./store.js on live; the clone's
 * ids-only ./ids-store.js), and the mascot, the drone and the portal are passed in, so a page that
 * does not use them never loads them.
 */

import { createCurl, cornerReach, fullTurn, tween as runTween, ease, lerp } from './curl.js'
import { createIdsStore } from './ids-store.js'
import { onPage, recordFrom } from './record.js'
import { countItems, lang as pageLang, t } from '../i18n.js'

const RAD = Math.PI / 180
const PEEL_MS = 560 // peel back to halfway (the adhesive holds, then gives)
const LIFT_MS = 520 // keep peeling while lifting it off, until the last corner lets go
const THROW_MS = 820 // thrown into the pocket
const FLIGHT_MS = PEEL_MS + LIFT_MS + THROW_MS // a pocketed sticker lands in the corner this long after the click
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

export const make = (tag, props = {}, ...children) => {
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

/** Drops the layer's tags (data-aixc-item, data-aixc-section…) from a copy, so nothing finds a card twice. */
const stripMarks = (root) => {
  for (const node of [root, ...root.querySelectorAll('*')]) {
    for (const name of [...(node.getAttributeNames?.() ?? [])]) if (name.startsWith('data-aixc-')) node.removeAttribute(name)
  }
}

/**
 * Makes a frozen copy of a page quiet: no frame, video or plugin loads again, no script or stylesheet
 * link is copied (the page's own styles still apply). Each is replaced by an empty box of its size.
 */
const quietCopy = (source, copy) => {
  const LOUD = 'iframe, video, audio, object, embed'
  const live = [...source.querySelectorAll(LOUD)]
  for (const [index, node] of [...copy.querySelectorAll(LOUD)].entries()) {
    const box = live[index]?.getBoundingClientRect()
    const stand = document.createElement('div')
    stand.style.cssText = `width:${Math.round(box?.width ?? 0)}px;height:${Math.round(box?.height ?? 0)}px`
    node.replaceWith(stand)
  }
  for (const node of copy.querySelectorAll('script, link, noscript, template')) node.remove()
}

/** True for a colour nothing shows through, so a snapshot never turns see-through. */
const opaque = (color) => !!color && color !== 'transparent' && !/rgba\(.*,\s*0\)$/.test(color)

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
  // A copy is never one of the page's cards: without the adapter's marks there is one element per id (B-49).
  stripMarks(clone)
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

/* ------------------------------------------------------------------- hosts */

/**
 * The Services clone's page (src/shell.js): the album inside <main>, the turn freezing `.page-shell`
 * below the sticky header, the page's regions hidden while the album shows. Exactly what the Pocket
 * did before it learned to run on Vodafone's pages.
 */
const shellSeams = ({ sourceRoot, outputRoot, viewbar, header, main }) => {
  const pageShell = main.closest('.page-shell') ?? document.querySelector('.page-shell')
  return {
    snapshotRoot: () => pageShell,
    sheetTop: () => header.getBoundingClientRect().bottom,
    place: (root) => main.append(root),
    cover: () => {
      const note = viewbar.nextElementSibling?.classList.contains('aixc-viewnote') ? viewbar.nextElementSibling : null
      const hidden = new Map([sourceRoot, outputRoot, viewbar, note].filter(Boolean).map((node) => [node, node.hidden]))
      for (const node of hidden.keys()) node.hidden = true
      return {
        restore: () => {
          for (const [node, wasHidden] of hidden) node.hidden = wasHidden
        },
        inCopy: (shell) => {
          for (const [node, wasHidden] of hidden) {
            const copy = shell.querySelector(`.${node.classList[0]}`)
            if (copy) copy.hidden = wasHidden
          }
        },
      }
    },
    mark: (node) => node,
    wrap: (_step, fn) => fn,
    checkpoint: () => {},
    labels: {
      back: t('Back to Services'),
      lead: (n) => (n ? `${n} ${n === 1 ? 'service' : 'services'} you peeled off the Services page, kept here for later.` : t('Nothing here yet.')),
    },
    page: { path: location.pathname, lang: pageLang, dir: pageLang === 'ar' ? 'rtl' : 'ltr', title: document.title },
    corner: true,
    chips: true,
    // The clone's ids-only store keys a sticker by its card's id; on live pages a record has its own key.
    recordKey: (id) => id,
    dated: false,
    eagerImages: true,
    pageBack: PAGE_BACK,
  }
}

/* -------------------------------------------------------------- controller */

/**
 * `store`: the Pocket's records (./store.js interface); the clone's ids-only store when omitted.
 * `createActors`, `createPortal`: the mascot and drone (./pocket-actors.js) and the portal
 * (./portal/portal.js), or nothing. `seams`: the host's (see shellSeams); `model`: the page's
 * content model when the host has read it already.
 */
export const initPocket = ({ adapter, regions, composer = null, portal: portalOptions = {}, createActors = null, createPortal = null, createChips = null, store = null, seams: given = null, model: givenModel }) => {
  const { sourceRoot } = regions
  // The host's seams over the shell's, getters kept: a host's `page` can follow a route change (E5).
  const seams = Object.defineProperties({ ...shellSeams(regions) }, Object.getOwnPropertyDescriptors(given || {}))
  let model = givenModel !== undefined ? givenModel : adapter.extractContent(sourceRoot).model
  // The clone has no Pocket without its page; on Vodafone's pages the album is there on every page.
  if (!model && seams.chips === true) return null

  /** id → { item, section } for everything that can be pocketed (not the closing promo). */
  const catalog = new Map()
  for (const section of model?.sections ?? []) for (const item of section.items) catalog.set(item.id, { item, section })
  const ownStore = !store
  store ??= createIdsStore({ catalog, page: seams.page, model })

  const state = {
    ids: [], // the stickers' keys, oldest first (in the clone, a sticker's key is its card's id)
    view: 'page', // 'page' | 'pocket'
    busy: false, // a page turn is running
    peek: null, // { rig, sheet, phi, R, tween }
    saved: null, // where the page was when the pocket opened
    flights: new Set(), // stickers in the air
  }
  /** key → record, as the store has it. */
  let records = new Map()
  const sync = (list) => {
    records = new Map([...list].sort((a, b) => a.savedAt - b.savedAt).map((record) => [record.key, record]))
    state.ids = [...records.keys()]
  }
  sync(store.all())
  /**
   * id → { card, host, cta, undo }: Vodafone's card, and the node its chip, liner and lift live on (the
   * card itself in the clone; a slot in the overlay on live pages, ADR-0052 §10).
   */
  const cards = new Map()
  /** This page's record for card `id`: a sticker kept on another page never marks this page's card (S6). */
  const keyOf = (id, page = seams.page) => {
    for (const [key, record] of records) if (record.id === id && onPage(record, page)) return key
    return undefined
  }
  const isPocketed = (id, page) => keyOf(id, page) !== undefined
  /** The overlay of chips on live pages (./chips-overlay.js), or nothing. */
  let chips = null
  /** The Pocket's own writes: the store tells its subscribers at once, and this one already knows. */
  let writing = false
  const save = (fn) => {
    writing = true
    let out
    try {
      out = fn()
    } finally {
      writing = false
    }
    return Promise.resolve(out).catch((error) =>
      wrap('pocket save', () => {
        throw error
      })(),
    )
  }

  /* Everything the Pocket adds to the page, listens to or schedules goes through these, so it can be
     marked (data-aixc), guarded and taken away again completely. */
  const { mark, wrap, checkpoint } = seams
  const offs = []
  const on = (target, type, handler, options) => {
    const guarded = wrap(`pocket ${type}`, handler)
    target.addEventListener(type, guarded, options)
    offs.push(() => target.removeEventListener(type, guarded, options))
  }
  const timers = new Set()
  const later = (fn, ms) => {
    const id = window.setTimeout(
      wrap('pocket timer', () => {
        timers.delete(id)
        fn()
      }),
      ms,
    )
    timers.add(id)
    return id
  }
  /** Every animation, guarded and cancelled when the Pocket goes. */
  const running = new Set()
  const tween = (duration, update, easing) => {
    const job = runTween(duration, wrap('pocket frame', update), easing)
    running.add(job)
    job.promise.then(() => running.delete(job))
    return job
  }
  let destroyed = false
  /** Puts a node in <body>, marked; destroy() takes every one away. */
  const added = new Set()
  const attach = (...nodes) => {
    for (const node of nodes) added.add(mark(node))
    document.body.append(...nodes)
  }

  const live = make('div', { class: 'aixc-sr-only', role: 'status', 'aria-live': 'polite' })
  const announce = (text) => {
    live.textContent = ''
    later(() => (live.textContent = text), 60)
  }
  const countLabel = countItems

  /* ------------------------------------------------------- fixed layers */
  // plane (z 6): what lies flat; flying stickers (z 7) pass between; lift (z 8): the curl.
  const planeLayer = make('div', { class: 'pocket-layer pocket-layer--plane', 'aria-hidden': 'true' })
  const liftLayer = make('div', { class: 'pocket-layer pocket-layer--lift', 'aria-hidden': 'true' })

  const peekCount = make('span', { class: 'pocket-peek__count', 'aria-hidden': 'true' }, '0')
  const peekButton = make(
    'button',
    { type: 'button', class: 'pocket-peek', 'data-state': 'hidden', 'aria-label': t('Open your pocket'), inert: true },
    icon('pocket', 'pocket-peek__icon'),
    peekCount,
    make('span', { class: 'pocket-peek__tip', 'aria-hidden': 'true' }, t('Your pocket')),
  )

  /* ------------------------------------------------------- pocket view */
  const pocketTitle = make('h1', { class: 'pocket-view__title', id: 'pocket-title', tabindex: '-1' }, t('Your pocket'))
  const pocketLead = make('p', { class: 'pocket-view__lead' })
  const grid = make('ul', { class: 'pocket-grid', role: 'list' })
  const backButton = make('button', { type: 'button', class: 'pocket-back' }, icon('back', 'pocket-back__icon'), seams.labels.back)
  const clearButton = make('button', { type: 'button', class: 'pocket-clear' }, t('Empty pocket'))
  const emptyBack = make('button', { type: 'button', class: 'pocket-back pocket-back--solid' }, seams.labels.back)
  const empty = make(
    'div',
    { class: 'pocket-empty', hidden: true },
    icon('pocket', 'pocket-empty__icon'),
    make('p', { class: 'pocket-empty__title' }, t('Your pocket is empty')),
    make('p', { class: 'pocket-empty__text' }, t('Peel services off the page with “Pocket it” and they wait here for later.')),
    emptyBack,
  )
  // The bar's start group and the stage are where a companion (the journey, ./journey.js) docks:
  // a button beside "Back to Services", and a layer that floats over the album in the same cell.
  const barStart = make('div', { class: 'pocket-view__start' }, backButton)
  const stage = make(
    'div',
    { class: 'pocket-stage' },
    make(
      'div',
      { class: 'pocket-stage__album container' },
      make('header', { class: 'pocket-view__head' }, make('span', { class: 'pocket-view__mark' }, icon('pocket', 'pocket-view__mark-icon')), make('div', null, pocketTitle, pocketLead)),
      grid,
      empty,
    ),
  )
  const pocketView = make(
    'section',
    { class: 'pocket-view', 'aria-labelledby': 'pocket-title' },
    make('div', { class: 'container pocket-view__inner' }, make('div', { class: 'pocket-view__bar' }, barStart, clearButton)),
    stage,
  )
  const pocketRoot = make('div', { id: 'pocket-output', class: 'pocket-output pocket-album', hidden: true }, pocketView)
  /** The page turns to the pocket even with no stickers while this says so (a saved journey). */
  let openableEmpty = () => false
  const viewChanged = (view) => {
    pocketRoot.dispatchEvent(new CustomEvent('pocket:view', { detail: view }))
    // The chips stand aside while the album shows, and come back where the cards are (S6).
    chips?.view()
  }
  seams.place(mark(pocketRoot))
  // Without the page's corner (the host has not given it a place yet) there is no Pocket button.
  attach(planeLayer, liftLayer, ...(seams.corner ? [peekButton] : []), live)

  /**
   * Leaving the Pocket page through the portal (./portal/portal.js, ADR-0005). Optional: if it
   * cannot start, links behave exactly as before. `open` is late-bound (defined further down).
   */
  let portal = { enabled: false }
  try {
    if (createPortal)
      portal = createPortal({
        options: portalOptions,
        isPocketPage: () => state.view === 'pocket' && !state.busy,
        openPocket: (options) => openPocket(options),
        viewEvents: pocketRoot,
      })
  } catch {
    portal = { enabled: false }
  }

  /** Mascot and drone. Optional: if they cannot start, the pocket works exactly as before. */
  let actors = null
  try {
    actors = createActors?.({ pocketRoot, peekButton, sheet: () => state.peek?.sheet ?? sheetRect(), reducedMotion }) ?? null
  } catch {
    actors = null
  }

  /* ----------------------------------------------------- page geometry */
  const sheetRect = () => {
    const top = Math.max(0, Math.round(seams.sheetTop()))
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

  /** What the page-tip curl uncovers: the album's paper, and the mascot living under the page. */
  const albumUnder = (box) => box.append(make('div', { class: 'pocket-album pocket-album--under' }), ...(actors ? [actors.underStage()] : []))

  /** A frozen copy of the page as it looks right now (or as `prepare` makes it look). */
  const snapshotPage = ({ scrollY, sheet, prepare = null }) => (box) => {
    const body = getComputedStyle(document.body).backgroundColor
    const scroller = make('div', {
      class: 'curl-snapshot',
      style: {
        position: 'absolute',
        left: '0',
        top: `${-sheet.top}px`,
        width: `${sheet.width}px`,
        height: `${sheet.top + sheet.height}px`,
        overflow: 'hidden',
        background: opaque(body) ? body : backdropOf(document.documentElement),
      },
    })
    const source = seams.snapshotRoot() ?? document.body
    const shell = source.cloneNode(true)
    prepare?.(shell)
    // The clone's own pictures load eagerly in the copy; Vodafone's are never fetched for it.
    if (seams.eagerImages) for (const img of shell.querySelectorAll('img[loading="lazy"]')) img.loading = 'eager'
    quietCopy(source, shell)
    stripIds(shell)
    stripMarks(shell)
    scroller.append(shell)
    box.append(scroller)
    // The copy is its own scroll container, so sticky parts sit where they do on screen.
    scroller.scrollTop = scrollY
  }

  /* -------------------------------------------------------------- peek */
  const setPeekButton = (visible) => {
    const shown = visible && seams.corner
    peekButton.dataset.state = shown ? 'shown' : 'hidden'
    peekButton.inert = !shown
  }

  const updateCount = (n = state.ids.length) => {
    peekCount.textContent = String(n)
    peekCount.hidden = n === 0
    peekButton.setAttribute('aria-label', t('Open your pocket, {count}', { count: countLabel(n) }))
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
      back: seams.pageBack,
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
    if (state.view !== 'page' || !seams.corner || destroyed) return
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

  on(peekButton, 'pointerenter', () => !state.busy && movePeek(peekX(30), 260))
  on(peekButton, 'pointerleave', () => !state.busy && movePeek(peekX(), 320))
  // Keyboard focus turns the corner further too (not focus that follows a mouse click).
  on(peekButton, 'focus', () => !state.busy && peekButton.matches(':focus-visible') && movePeek(peekX(30), 260))
  on(peekButton, 'blur', () => !state.busy && movePeek(peekX(), 320))
  on(peekButton, 'animationend', () => peekButton.classList.remove('is-bump'))

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
    const entry = cards.get(id)
    const inSlot = entry.host !== card
    const style = getComputedStyle(card)
    const width = card.offsetWidth
    const height = card.offsetHeight
    const rig = stickerRig(card, width, height, card.getBoundingClientRect())
    const host = make('div', {
      class: 'curl-host curl-host--inside',
      'aria-hidden': 'true',
      inert: true,
      style: { left: `${inSlot ? 0 : -parseFloat(style.borderLeftWidth) || 0}px`, top: `${inSlot ? 0 : -parseFloat(style.borderTopWidth) || 0}px`, width: `${width}px`, height: `${height}px` },
    })
    host.append(rig.plane, rig.lift)
    entry.host.append(host)
    entry.host.classList.add('is-peeling')
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
      if (hover?.card !== current.card && !isPocketed(current.id)) cards.get(current.id)?.host.classList.remove('is-peeling')
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
      'aria-hidden': 'true',
      inert: true,
      style: { left: `${rect.left}px`, top: `${rect.top}px`, width: `${width}px`, height: `${height}px` },
    })
    host.append(rig.plane, rig.lift)
    attach(host)

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

  /** True when the visitor pressed `button` from the keyboard or a screen reader (a slot's buttons are only reached that way). */
  const pressedByKeys = (entry, button) => button.matches(':focus-visible') || (entry.host !== entry.card && document.activeElement === button)

  const pocketItem = async (id) => {
    const entry = cards.get(id)
    if (!entry || !catalog.has(id) || isPocketed(id) || state.view !== 'page' || state.busy) return
    const { card, host } = entry
    const { item, section } = catalog.get(id)
    const startX = hover?.card === card ? hover.rig.state?.x ?? 0 : 0
    const fromKeyboard = pressedByKeys(entry, entry.cta)
    // The clone's ids-only store keys a sticker by its card's id; a live record keeps its own key (S6).
    const record = recordFrom({ item, section, page: seams.page, model, ...(seams.recordKey ? { key: seams.recordKey(id) } : {}) })
    records.set(record.key, record)
    state.ids.push(record.key)
    save(() => store.put(record))
    dropCorner({ immediate: true })
    host.classList.remove('is-peeling')
    host.classList.add('is-pocketed')
    // Keep a keyboard user's place: the chip is gone, so focus moves to "Put back".
    if (fromKeyboard) entry.undo.focus({ preventScroll: true })
    announce(t('{title} is in your pocket. {count}.', { title: item.title, count: countLabel(state.ids.length) }))
    // No flight before the Pocket has its corner on the page (S11): the card peels in place.
    if (reducedMotion() || !seams.corner) {
      openPeek({ animate: false })
      updateCount()
      return
    }
    const landing = fly(peelAndFly(card, startX))
    openPeek()
    actors?.itemPocketed({ phi: state.peek?.phi, landsIn: FLIGHT_MS })
    await landing
    if (destroyed) return
    actors?.itemLanded()
    if (state.view === 'page') {
      updateCount()
      bumpPeek()
    }
  }

  const putBack = async (id) => {
    const key = keyOf(id)
    const entry = cards.get(id)
    if (!entry || key === undefined || state.view !== 'page' || state.busy) return
    const { card, host } = entry
    const title = catalog.get(id)?.item.title ?? records.get(key).copy.title
    const fromKeyboard = pressedByKeys(entry, entry.undo)
    records.delete(key)
    state.ids = state.ids.filter((other) => other !== key)
    save(() => store.remove(key))
    updateCount()
    announce(t('{title} is back on the page. {count} in your pocket.', { title, count: countLabel(state.ids.length) }))
    host.classList.replace('is-pocketed', 'is-returning')
    if (!reducedMotion() && state.peek) {
      bumpPeek()
      const cleanup = await fly(flyBack(card))
      host.classList.remove('is-returning')
      cleanup()
      if (destroyed) return
    } else {
      host.classList.remove('is-returning')
    }
    if (fromKeyboard) entry.cta.focus({ preventScroll: true })
    if (!state.ids.length) closePeek()
  }

  /**
   * Draws "Pocket it" and the liner for card `id` on `host`: the card itself in the clone, or a slot of
   * the overlay on Vodafone's pages (ADR-0052 §10), whose buttons stay out of the Tab order (owner,
   * 2026-11-13: screen readers reach them in the labelled group, by name).
   */
  const decorate = (card, id, host = card) => {
    const { item } = catalog.get(id)
    const inSlot = host !== card
    // This card's listeners, so they go with it when the overlay draws it again (undecorate).
    const mine = offs.length
    host.classList.add('pocket-host')
    const cta = make(
      'button',
      { type: 'button', class: 'pocket-cta', tabindex: inSlot ? '-1' : null, 'data-pocket-for': id, 'aria-label': t('Pocket it: {title}', { title: item.title }) },
      icon('pocketAdd', 'pocket-cta__icon'),
      make('span', { class: 'pocket-cta__label' }, t('Pocket it')),
    )
    on(cta, 'pointerenter', (event) => event.pointerType !== 'touch' && liftCorner(card, id))
    on(cta, 'pointerleave', () => hover?.card === card && dropCorner())
    on(cta, 'click', () => pocketItem(id))
    const undo = make('button', { type: 'button', class: 'pocket-liner__undo', tabindex: inSlot ? '-1' : null, 'aria-label': t('Put back {title}', { title: item.title }) }, t('Put back'))
    on(undo, 'click', () => putBack(id))
    const liner = make(
      'div',
      { class: 'pocket-liner' },
      make('div', { class: 'pocket-liner__content' }, icon('pocket', 'pocket-liner__icon'), make('p', { class: 'pocket-liner__text' }, t('In your pocket')), undo),
    )
    host.append(liner, cta)
    if (isPocketed(id)) host.classList.add('is-pocketed')
    const entry = { card, host, cta, undo, offs: offs.splice(mine) }
    cards.set(id, entry)
    return entry
  }

  /** Takes card `id`'s chip and liner away (the overlay, when Vodafone's card left or changed). */
  const undecorate = (id) => {
    const entry = cards.get(id)
    if (!entry) return
    if (hover?.id === id) dropCorner({ immediate: true })
    cards.delete(id)
    for (const off of entry.offs) off()
    if (entry.host !== entry.card) return entry.host.remove()
    entry.card.classList.remove('pocket-host', 'is-pocketed', 'is-peeling', 'is-returning')
    for (const node of entry.card.querySelectorAll(':scope > .pocket-cta, :scope > .pocket-liner, :scope > .curl-host')) node.remove()
  }

  // "Pocket it" on the cards: the clone draws it inside them; on Vodafone's pages the overlay draws it (S6).
  if (seams.chips === true)
    for (const card of sourceRoot.querySelectorAll('[data-aixc-item]')) {
      const id = card.dataset.aixcItem
      if (catalog.has(id)) decorate(card, id)
    }

  /** An observer that stops when the Pocket goes. */
  const observe = (observer) => {
    offs.push(() => observer.disconnect())
    return observer
  }

  /** Vodafone's page was read again (aixc:model): the cards to pocket are the new model's, in place. */
  const setModel = (next, coverage = null) => {
    if (destroyed) return
    model = next ?? null
    catalog.clear()
    for (const section of model?.sections ?? []) for (const item of section.items) catalog.set(item.id, { item, section })
    chips?.refresh(coverage)
  }

  chips =
    seams.chips === 'overlay' && createChips
      ? createChips({ ...seams.overlay, catalog, decorate, undecorate, state, page: () => seams.page, on, later, observe, wrap, mark, checkpoint, t })
      : null

  /* --------------------------------------------------------- the album */
  /** The day a sticker was kept, in the page's language ("12 Nov", "١٢ نوفمبر" in Latin digits). */
  const dayOf = (ms) => {
    try {
      return new Intl.DateTimeFormat(seams.page.lang === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB', { day: 'numeric', month: 'short' }).format(ms)
    } catch {
      return ''
    }
  }

  /** A sticker as kept: its copy as published when it was saved, in its own language, with its picture or without one. */
  const stickerFor = (key) => {
    const record = records.get(key)
    const { copy, image, cta, source } = record
    const tone = TONES[source.section?.id] ?? 'light'
    const titleId = `pocket-sticker-${key}`
    const link = cta?.href ? { href: cta.href, label: cta.label || t('View more') } : null
    const own = copy.lang === seams.page.lang
    const remove = make('button', { type: 'button', class: 'pocket-sticker__remove', 'aria-label': t('Remove {title} from your pocket', { title: copy.title }) }, icon('remove', 'pocket-sticker__remove-icon'), make('span', null, t('Remove')))
    const sticker = make(
      'article',
      { class: `pocket-sticker pocket-sticker--${tone}${image ? '' : ' pocket-sticker--plain'}`, 'aria-labelledby': titleId, style: { '--tilt': `${tiltFor(key)}deg` } },
      image ? make('div', { class: 'pocket-sticker__media' }, make('img', { src: image.src, alt: '', class: image.fit === 'contain' ? 'is-contain' : null })) : null,
      make(
        'div',
        { class: 'pocket-sticker__body' },
        source.section?.title ? make('p', { class: 'pocket-sticker__from', lang: own ? null : copy.lang, dir: own ? null : copy.dir }, source.section.title) : null,
        // Kept in the other language: it says so, so it is read and laid out in its own.
        make('h2', { class: 'pocket-sticker__title', id: titleId, lang: own ? null : copy.lang, dir: own ? null : copy.dir }, copy.title),
        copy.description ? make('p', { class: 'pocket-sticker__desc', lang: own ? null : copy.lang, dir: own ? null : copy.dir }, copy.description) : null,
        // The copy is as it was that day, price included (ADR-0051): the day says so.
        seams.dated && record.savedAt ? make('p', { class: 'pocket-sticker__date' }, t('Saved {date}', { date: dayOf(record.savedAt) })) : null,
        make(
          'div',
          { class: 'pocket-sticker__actions' },
          link
            ? // With the portal (./portal/portal.js) the link leaves through it, in this tab; without it, a new tab as before.
              make(
                'a',
                { class: 'pocket-sticker__cta', href: link.href, target: portal.enabled ? null : '_blank', rel: 'noopener noreferrer' },
                link.label,
                icon('external', 'pocket-sticker__cta-icon'),
                portal.enabled ? null : make('span', { class: 'aixc-sr-only' }, ` ${t('(opens in a new tab)')}`),
              )
            : make('span'),
          remove,
        ),
      ),
    )
    const cell = make('li', { class: 'pocket-grid__item', 'data-pocket-id': key }, sticker)
    on(remove, 'click', () => removeFromPocket(key, cell))
    return cell
  }

  const renderLead = () => {
    const n = state.ids.length
    pocketLead.textContent = seams.labels.lead(n)
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
      'aria-hidden': 'true',
      inert: true,
      style: { left: `${centre.x - width / 2}px`, top: `${centre.y - height / 2}px`, width: `${width}px`, height: `${height}px`, transform: `rotate(${tilt}deg)`, zIndex: '9' },
    })
    host.append(rig.plane, rig.lift)
    attach(host)
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

  /** The card of the sticker under `key` stands on the page again, when that sticker was kept on this page. Call it before the record goes. */
  const unpocketCard = (key) => {
    const record = records.get(key)
    if (record && onPage(record, seams.page)) cards.get(record.id)?.host.classList.remove('is-pocketed', 'is-returning')
  }

  const removeFromPocket = async (key, cell) => {
    if (state.busy || !records.has(key)) return
    const { title } = records.get(key).copy
    const next = cell.nextElementSibling ?? cell.previousElementSibling
    if (!reducedMotion()) await peelAway(cell.querySelector('.pocket-sticker'))
    if (destroyed || !records.has(key)) return
    unpocketCard(key)
    records.delete(key)
    state.ids = state.ids.filter((other) => other !== key)
    save(() => store.remove(key))
    updateCount()
    cell.remove()
    renderLead()
    announce(t('{title} removed from your pocket. {count} left.', { title, count: countLabel(state.ids.length) }))
    ;(next?.querySelector('.pocket-sticker__remove') ?? (state.ids.length ? pocketTitle : emptyBack)).focus({ preventScroll: true })
  }

  on(clearButton, 'click', () => {
    if (state.busy) return
    for (const key of state.ids) unpocketCard(key)
    records.clear()
    state.ids = []
    save(() => store.clear())
    updateCount()
    grid.replaceChildren()
    renderLead()
    announce(t('Your pocket is empty.'))
    emptyBack.focus({ preventScroll: true })
  })

  /* --------------------------------------------------------- page turn */

  /**
   * Takes the album away and gives the page back as it was before the Pocket opened: the end of a
   * turn that failed half way, and the Pocket going (destroy). Nothing here can throw.
   */
  const giveBackPage = () => {
    const saved = state.saved
    state.saved = null
    try {
      destroyPeek()
    } catch {}
    pocketRoot.hidden = true
    try {
      saved?.cover.restore()
    } catch {}
    delete document.body.dataset.pocketView
    if (saved && state.view === 'pocket') window.scrollTo(0, saved.scrollY)
    state.view = 'page'
    state.busy = false
  }

  /** `instant`: no page turn (Back from a page the portal opened returns straight to the album). */
  const openPocket = async ({ instant = false } = {}) => {
    if (destroyed || state.busy || state.view !== 'page' || (!state.ids.length && !openableEmpty())) return
    state.busy = true
    const opener = document.activeElement
    try {
      actors?.openRequested()
      await Promise.allSettled([...state.flights])
      if (destroyed) return
      dropCorner({ immediate: true })
      // Without the corner the page turns from flat.
      if (!state.peek) buildPeek(seams.corner ? peekX() : 0)
      const peek = state.peek
      peek.tween?.cancel()
      const { sheet } = peek
      const scrollY = window.scrollY

      // Freeze what is on screen into the turning sheet, then swap the live page for the
      // pocket underneath it. Both happen before the next paint, so nothing flickers.
      peek.rig.setFront(snapshotPage({ scrollY, sheet }))
      state.saved = { scrollY, cover: seams.cover(), opener }
      // The chips stand over cards that are no longer shown.
      chips?.view()
      checkpoint('pocket-open')
      composer?.state?.activeExperience?.unmount?.()
      renderPocket()
      checkpoint('pocket-render')
      pocketRoot.hidden = false
      state.view = 'pocket'
      document.body.dataset.pocketView = 'open'
      window.scrollTo(0, 0)
      peek.rig.setUnder(null)
      setPeekButton(false)
      actors?.openStart({ phi: peek.phi })

      const from = { x: peek.rig.state?.x ?? peekX(), phi: peek.phi, R: peek.R }
      const toR = pageRadius(sheet)
      await tween(
        reducedMotion() || instant ? 0 : 1150,
        (e, t) => {
          const phi = lerp(from.phi, TURNED_PHI, ease.inOutSine(t))
          const R = lerp(from.R, toR, ease.inOutSine(t))
          peek.rig.update({ x: lerp(from.x, fullTurn(sheet.width, sheet.height, phi, R) + 80, e), phi, R })
          actors?.openProgress(t)
        },
        ease.inOutSine,
      ).promise
      if (destroyed) return
      destroyPeek()
      pocketTitle.focus({ preventScroll: true })
      announce(t('Your pocket, {count}.', { count: countLabel(state.ids.length) }))
      state.busy = false
      viewChanged('pocket')
      actors?.openComplete()
    } catch (error) {
      giveBackPage()
      throw error
    }
  }

  const closePocket = async () => {
    if (destroyed || state.busy || state.view !== 'pocket') return
    state.busy = true
    try {
      viewChanged('closing')
      actors?.closeStart()
      checkpoint('pocket-close')
      const saved = state.saved ?? { scrollY: 0, cover: { restore() {}, inCopy() {} }, opener: null }
      const sheet = sheetRect()
      placeLayers(sheet)
      const fromR = pageRadius(sheet)
      const toR = peekRadius()
      const corner = seams.corner && state.ids.length > 0
      const landX = corner ? peekX() : 0

      // The page comes back over the pocket: a sheet that starts fully turned.
      const restoreInCopy = (shell) => {
        shell.querySelector('.pocket-output')?.setAttribute('hidden', '')
        saved.cover.inCopy(shell)
      }
      const rig = createCurl({ width: sheet.width, height: sheet.height, back: seams.pageBack, strips: 16, perspective: 2400 })
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
      if (destroyed) return

      // Landed: put the live page back under the sheet, then let the sheet go transparent.
      rig.setUnder(albumUnder)
      pocketRoot.hidden = true
      saved.cover.restore()
      state.view = 'page'
      delete document.body.dataset.pocketView
      actors?.closeComplete()
      window.scrollTo(0, saved.scrollY)
      rig.setFront(null)
      if (composer?.state?.view === 'reimagined') composer.state.activeExperience?.mount?.()
      state.saved = null
      state.busy = false
      viewChanged('page')
      if (corner) {
        setPeekButton(true)
        peekButton.focus({ preventScroll: true })
      } else {
        setPeekButton(false)
        destroyPeek()
        // Back where the visitor was: the clone's chips, else whatever opened the Pocket.
        const back = seams.chips === true ? (sourceRoot.hidden ? document.querySelector('.aixc-launcher') : sourceRoot.querySelector('.pocket-cta')) : saved.opener?.isConnected && saved.opener !== document.body ? saved.opener : null
        back?.focus({ preventScroll: true })
      }
    } catch (error) {
      giveBackPage()
      throw error
    }
  }

  on(peekButton, 'click', () => openPocket())
  on(backButton, 'click', () => closePocket())
  on(emptyBack, 'click', () => closePocket())
  on(pocketRoot, 'keydown', (event) => {
    if (event.key === 'Escape' && state.view === 'pocket') {
      event.preventDefault()
      closePocket()
    }
  })

  /* ------------------------------------------------------- lifecycle */
  let resizeTimer = 0
  on(window, 'resize', () => {
    window.clearTimeout(resizeTimer)
    resizeTimer = later(() => {
      if (state.busy || state.view !== 'page' || !state.peek) return
      buildPeek(peekX())
    }, 160)
  })

  /** Another tab changed the Pocket (or the store finished reading): show what it holds now. */
  let settled = false
  const fromStore = (list) => {
    sync(list)
    const page = seams.page
    for (const [id, entry] of cards) entry.host.classList.toggle('is-pocketed', isPocketed(id, page))
    updateCount()
    if (state.view === 'pocket' && !state.busy) renderPocket()
    if (state.view === 'page' && !state.busy && settled) {
      if (!state.ids.length && state.peek) closePeek()
      else if (state.ids.length && !state.peek) openPeek()
    }
  }
  const unsubscribe = store.subscribe(
    wrap('pocket sync', (list) => {
      if (!writing && !destroyed) fromStore(list)
    }),
  )

  updateCount()
  store.ready.then(
    wrap('pocket ready', () => {
      if (destroyed) return
      fromStore(store.all())
      settled = true
      // Returning visitor: the corner turns up shortly after the page settles.
      if (state.ids.length) later(() => openPeek({ animate: true }), 500)
    }),
  )

  /** Everything the Pocket added or changed, taken away; the page as it was. */
  const destroy = () => {
    if (destroyed) return
    destroyed = true
    for (const job of running) job.cancel()
    running.clear()
    for (const id of timers) window.clearTimeout(id)
    timers.clear()
    for (const off of offs.splice(0)) off()
    unsubscribe()
    try {
      dropCorner({ immediate: true })
    } catch {}
    giveBackPage()
    try {
      chips?.destroy()
    } catch {}
    for (const id of [...cards.keys()]) undecorate(id)
    for (const node of added) node.remove()
    added.clear()
    pocketRoot.remove()
    try {
      actors?.destroy()
    } catch {}
    try {
      portal.destroy?.()
    } catch {}
    if (ownStore) store.close?.()
  }

  return {
    state,
    pocket: pocketItem,
    putBack,
    open: openPocket,
    close: closePocket,
    dock: { root: pocketRoot, view: pocketView, barStart, stage },
    openWhenEmpty: (fn) => {
      openableEmpty = fn
    },
    portal,
    store,
    setModel,
    /** Where each chip is on Vodafone's page, by card id (ADR-0052 §12): for `?aixc-debug` and the tests. */
    chips: () => chips?.debug() ?? null,
    destroy,
  }
}
