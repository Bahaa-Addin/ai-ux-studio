/**
 * Building blocks shared by the group-based experiences (spotlight, journey,
 * gallery, flipbook, cube). Facts always come from the content index; these
 * helpers only decide markup. Styles live in vodafone.css under .aixc-vx.
 *
 * The seam (voice-guide ADR-0076, phase 4a): where the experiences scroll (the window on the clone, the
 * reimagined view's own box on Vodafone's pages), how their listeners, frames and timers run (plain, or
 * through the layer's guard) and which words they use about the page's items. Nothing is configured on
 * the clone, so every number and word there is as before.
 */

import { h, pathIcon, svgIcon, visuallyHidden } from '../dom.js'
import { describeImageShape, PROMOTION_KIND } from '../content-index.js'
import { countServices, lang, t } from '../../i18n.js'

export { t }

/**
 * Right-to-left (the Arabic page). Experiences read these instead of assuming
 * left-to-right:
 *   isRTL       the page runs right to left
 *   inlineSign  +1 in LTR, -1 in RTL: multiply any horizontal offset, translateX,
 *               rotateY or drag delta that means "forward along the reading line"
 *   ltrMark     wrap Latin wordmarks (VODAFONE, letter-by-letter animations) so
 *               their letters never reorder: h('span', { dir: 'ltr' }, …)
 */
// From the document's direction only: the CSS keys on [dir='rtl'], so the JS signs
// must agree with it even on a page whose language and direction disagree.
export const isRTL = typeof document !== 'undefined' && document.documentElement.dir === 'rtl'
export const inlineSign = isRTL ? -1 : 1
export const ltrMark = (...children) => h('span', { dir: 'ltr', class: 'vx-ltr' }, ...children)

const ICON_EXTERNAL = 'M14 3h7v7h-2V6.4l-9.3 9.3-1.4-1.4L17.6 5H14V3zM5 5h6v2H7v10h10v-4h2v6H5V5z'
const CHEVRON_LEFT = 'M15.4 7.4 14 6l-6 6 6 6 1.4-1.4L10.8 12z'
const CHEVRON_RIGHT = 'M8.6 16.6 10 18l6-6-6-6-1.4 1.4 4.6 4.6z'
/** Previous/next chevrons, already pointing the way the reading line runs. */
export const ICON_PREV = isRTL ? CHEVRON_RIGHT : CHEVRON_LEFT
export const ICON_NEXT = isRTL ? CHEVRON_LEFT : CHEVRON_RIGHT
export const ICON_PAUSE = 'M7 5h3.5v14H7zM13.5 5H17v14h-3.5z'
export const ICON_PLAY = 'M8 5v14l11-7z'

export const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

export const pad2 = (value) => String(value).padStart(2, '0')

/* ------------------------------------------------------------------ the seam */

const settings = { scroller: null, wrap: null, copy: 'services', configured: false }
/**
 * Every off and cancel the seam handed out while configured whose work is not undone or done yet. The
 * clone never configures the seam, so it holds nothing there (and keeps no old view alive: some
 * experiences still add their arrow keys when they render).
 */
const kept = new Set()

/** Keeps `undo` until it runs (off) or its work ends by itself (done: a frame or timer that ran). */
const hold = (undo) => {
  let live = true
  const done = () => {
    live = false
    kept.delete(off)
  }
  const off = () => {
    if (!live) return
    done()
    undo()
  }
  if (settings.configured) kept.add(off)
  return { off, done }
}
const keep = (undo) => hold(undo).off

/**
 * Sets where the experiences scroll and how they listen, after undoing every listener, frame, timer and
 * observer the seam handed out while configured (so a reset, or the guard's stop, leaves none behind).
 * No argument: the clone's settings (the window, plain listeners, the clone's words).
 *   scroller  the element the view scrolls in, or null for the window
 *   wrap      the guard's wrap(name, fn), or null: every handler, frame, timer and observer runs through it
 *   copy      'services' (the clone's words) or 'items' (neutral words, for pages not about services)
 * The guard's listen is not part of this: it keeps a clean-up for each listener until the guard stops, which
 * would hold every old view and every drag's click swallow for the page's life. The seam adds and removes its
 * own listeners (wrapped) and keeps their offs instead, and the shell's configure() on the guard's stop undoes
 * them; a `listen` passed here is ignored.
 */
export const configure = ({ scroller = null, wrap = null, copy = 'services' } = {}) => {
  const offs = [...kept]
  kept.clear()
  let failure = null
  for (const off of offs) {
    try {
      off()
    } catch (error) {
      failure ??= error
    }
  }
  settings.scroller = scroller
  settings.wrap = wrap
  settings.copy = copy === 'items' ? 'items' : 'services'
  settings.configured = Boolean(scroller || wrap || settings.copy === 'items')
  if (failure) throw failure
}

/** How many offs the seam holds (listeners, frames, timers, observers not undone yet, while configured): for checks. */
export const keptCount = () => kept.size

/** `fn` through the guard's wrap, named `name`, when one is configured; else `fn` itself. Not kept. */
export const guarded = (name, fn) => (settings.wrap ? settings.wrap(name, fn) : fn)

/** addEventListener with the handler through the guard's wrap; returns an off, kept until it runs. */
export const on = (target, type, handler, options) => {
  const added = guarded(`${type} handler`, handler)
  target.addEventListener(type, added, options)
  return keep(() => target.removeEventListener(type, added, options))
}

/** requestAnimationFrame through the guard; returns a cancel. */
export const frame = (callback) => {
  const run = guarded('frame', callback)
  let id = 0
  const { off, done } = hold(() => window.cancelAnimationFrame(id))
  id = window.requestAnimationFrame((now) => {
    done()
    run(now)
  })
  return off
}

/** setTimeout through the guard; returns a cancel. */
export const later = (callback, ms) => {
  const run = guarded('timer', callback)
  let id = 0
  const { off, done } = hold(() => window.clearTimeout(id))
  id = window.setTimeout(() => {
    done()
    run()
  }, ms)
  return off
}

/** A ResizeObserver on `element` through the guard; returns an off (disconnect). */
export const observeResize = (element, callback) => {
  if (typeof ResizeObserver !== 'function') return () => {}
  const run = guarded('resize observer', callback)
  const observer = new ResizeObserver(() => run())
  observer.observe(element)
  return keep(() => observer.disconnect())
}

/** The element the view scrolls in, or null when the window scrolls (the clone). */
export const viewScroller = () => settings.scroller

const scrollerTop = () => (settings.scroller ? settings.scroller.getBoundingClientRect().top + settings.scroller.clientTop : 0)

/** The scroller's scrollTop, or the window's scrollY. */
export const scrollTop = () => (settings.scroller ? settings.scroller.scrollTop : window.scrollY)

/** The scrolling area's height: the scroller's clientHeight, or the window's innerHeight. */
export const viewHeight = () => (settings.scroller ? settings.scroller.clientHeight : window.innerHeight)

/**
 * Height of the sticky chrome above the content, inside the scrolling area: for sticky tops and scroll
 * targets. The clone: the site header and the AIXC view bar. A scroller: its own view bar row when shown.
 */
export const chromeOffset = () => {
  const scroller = settings.scroller
  if (scroller) {
    const bar = scroller.querySelector(':scope > .aixc-viewbar')
    return bar && !bar.hidden ? bar.getBoundingClientRect().height : 0
  }
  const header = document.querySelector('#site-header')
  const viewbar = document.querySelector('#aixc-viewbar')
  const headerH = header ? header.getBoundingClientRect().height : 0
  const viewbarH = viewbar && !viewbar.hidden ? viewbar.getBoundingClientRect().height : 0
  return headerH + viewbarH
}

/** Viewport y of the pin line (compare with getBoundingClientRect values, not chromeOffset()). */
export const viewTop = () => scrollerTop() + chromeOffset()

/** Viewport y of the scrolling area's bottom. */
export const viewBottom = () => (settings.scroller ? scrollerTop() + settings.scroller.clientHeight : window.innerHeight)

/** Smoothly scrolls the view to an absolute y (the scroller's content coordinates), honouring reduced motion. */
export const scrollToY = (y, { instant = false } = {}) =>
  (settings.scroller ?? window).scrollTo({ top: Math.max(0, y), behavior: instant || reducedMotion() ? 'auto' : 'smooth' })

/** Scrolls the view by `dy` at once. */
export const scrollByY = (dy) => (settings.scroller ?? window).scrollBy({ top: dy, behavior: 'auto' })

/** Scrolls the view so `element`'s top meets the pin line; with a scroller the window never moves. */
export const scrollToElement = (element, { instant = false } = {}) =>
  scrollToY(element.getBoundingClientRect().top - viewTop() + scrollTop(), { instant })

/** The view's scroll (the scroller's, or the window's), every event; returns an off. */
export const onViewScroll = (callback) => on(settings.scroller ?? window, 'scroll', callback, { passive: true })

/** The window's resize and, with a scroller, the scroller's size; returns an off. */
export const onViewResize = (callback) => {
  const offs = [on(window, 'resize', callback)]
  if (settings.scroller) offs.push(observeResize(settings.scroller, callback))
  return keep(() => offs.forEach((off) => off()))
}

/**
 * With a scroller: a change of its inline style, where the shell writes the bottom corners' safe zones
 * (--aixc-safe-*) and writes each only when it changes (the Pocket's button showing, the guide listening, without
 * the box changing size); returns an off. Without one, nothing.
 */
export const onViewZones = (callback) => {
  const box = settings.scroller
  if (!box || typeof MutationObserver !== 'function') return () => {}
  const run = guarded('zones observer', callback)
  const observer = new MutationObserver(() => run())
  observer.observe(box, { attributes: true, attributeFilter: ['style'] })
  return keep(() => observer.disconnect())
}

/**
 * The words the clone says about its services, and what pages that are not about services say instead. Each key is
 * an experience's own t('...') string; each experience's label is its card's name in the composer where that name
 * is neutral (Ring: the card says "Service ring"). Exported for the checks only.
 */
export const NEUTRAL_WORDS = Object.freeze({
  'Previous service': 'Previous',
  'Next service': 'Next',
  'Vodafone services spotlight': 'Spotlight',
  'View service': 'View details',
  'More services': 'More on this page',
  Services: 'Items',
  // Neutral in English, but the clone's Arabic for it says services.
  'Jump to a category': 'Jump to a section',
  // The other eleven experiences (ADR-0076, phases 2-4), as their stages' labels.
  'Vodafone services, card fan': 'Card fan',
  'Gallery of Vodafone services': 'Gallery wall',
  'Vodafone services flipbook': 'Flipbook',
  'Vodafone services, ring': 'Ring',
  'Vodafone services, cover flow': 'Cover flow',
  'Vodafone services, split slideshow': 'Split slideshow',
  'Vodafone services, hyper tunnel': 'Hyper tunnel',
  'Vodafone services, infinite canvas': 'Infinite canvas',
  'Services canvas. Use the arrow keys to pan, Tab to move between services.': 'Canvas. Use the arrow keys to pan, Tab to move between items.',
  // The canvas's sign: "Services" was the clone page's name, so the page's own name takes its place. Canvas passes it
  // (phase 4): words('Vodafone Egypt · Services', { page }); the clone's sign has no placeholder and ignores it.
  'Vodafone Egypt · Services': 'Vodafone Egypt · {page}',
})

/** UI copy about the page's items, in the page's language: the clone's words, or neutral ones (copy 'items'). */
export const words = (key, values) => t(settings.copy === 'items' ? (NEUTRAL_WORDS[key] ?? key) : key, values)

/**
 * A count of the page's items, in the page's language: the clone's countServices(n) ("12 services" / "12 خدمة"), or
 * with copy 'items' "1 item" / "12 items", and in Arabic عنصر counted as countServices and countCategories count:
 * one, two, 3 to 10 the plural (عناصر), 11 and up the singular (عنصر). Zero takes the singular too ("0 عنصر"), as
 * theirs does.
 */
export const countWords = (n) => {
  if (settings.copy !== 'items') return countServices(n)
  if (lang !== 'ar') return `${n} ${n === 1 ? 'item' : 'items'}`
  if (n === 1) return 'عنصر واحد'
  if (n === 2) return 'عنصرين'
  return n >= 3 && n <= 10 ? `${n} عناصر` : `${n} عنصر`
}

/* ------------------------------------------------------------------ content */

/** Validated sections resolved against the index (closing promotion excluded). */
export const groupsOf = (schema, index) =>
  schema.sections
    .filter((section) => section.type !== 'closing-promotion')
    .map((section) => {
      const items = section.itemIds.map((id) => index.get(id)).filter(Boolean)
      const sources = []
      for (const item of items) {
        const source = index.sectionOf(item.id)
        if (source && !sources.includes(source)) sources.push(source)
      }
      const sourceTitles = sources.map((source) => source.title)
      const authored = Boolean(section.title) && !sourceTitles.includes(section.title)
      return {
        id: section.id,
        items,
        sources,
        title: section.title ?? sourceTitles[0] ?? words('More services'),
        authored,
        // Real source names to show next to a model-authored label.
        provenance: authored && sourceTitles.length ? t('From {sources}', { sources: sourceTitles.join(isRTL ? '، ' : ', ') }) : null,
        description: sources.length === 1 ? sources[0].description : null,
        cta: sources.length === 1 && sources[0].cta?.href ? sources[0].cta : null,
        aside: sources.length === 1 ? sources[0].aside : null,
      }
    })
    .filter((group) => group.items.length > 0)

export const promotionOf = (schema, index) =>
  schema.sections
    .filter((section) => section.type === 'closing-promotion')
    .flatMap((section) => section.itemIds)
    .map((id) => index.get(id))
    .find((item) => item?.kind === PROMOTION_KIND) ?? null

/** Flat, ordered list of every service with its group for card-per-item experiences. */
export const flatItems = (groups) =>
  groups.flatMap((group, groupIndex) => group.items.map((item) => ({ item, group, groupIndex })))

/* ------------------------------------------------------------------- markup */

export const externalLink = (href, className, ...children) =>
  h(
    'a',
    { class: className, href, target: '_blank', rel: 'noopener noreferrer' },
    ...children,
    visuallyHidden(` ${t('(opens in a new tab)')}`),
    pathIcon(ICON_EXTERNAL, 'vx-ext'),
  )

/**
 * The item's call to action. A source label with no destination (e.g. "Subscribe
 * now") is shown as plain information, never as an invented link.
 * When the card itself is the link (no label), returns a "View service" link only
 * if `standalone` is set (for layouts where the title is not clickable).
 */
export const ctaFor = (item, { variant = 'primary', standalone = false, onDark = false } = {}) => {
  const { label, href } = item.cta ?? {}
  const tone = onDark ? ' vx-on-dark' : ''
  if (label && href) return externalLink(href, `vx-btn vx-btn--${variant}${tone}`, label)
  if (label) return h('span', { class: `vx-inert${tone}` }, label)
  if (href && standalone) return externalLink(href, `vx-btn vx-btn--${variant}${tone}`, words('View service'))
  return null
}

/** Title text, or a stretched link when the source card itself was the link. */
export const titleContent = (item) => {
  const { label, href } = item.cta ?? {}
  if (href && !label) {
    return h(
      'a',
      { class: 'vx-story-link', href, target: '_blank', rel: 'noopener noreferrer' },
      item.title,
      visuallyHidden(` ${t('(opens in a new tab)')}`),
    )
  }
  return item.title
}

export const storyLinkClass = (item) => (item.cta?.href && !item.cta?.label ? ' vx-has-story-link' : '')

/** Image with a designed fallback (Vodafone mark on red) if it fails or is missing. */
export const media = (item, { className = '', eager = false, alt = '' } = {}) => {
  const image = item.image
  const figure = h('figure', { class: `vx-media ${className}`.trim(), 'data-shape': describeImageShape(image) })
  if (image?.fit === 'contain') figure.classList.add('is-contain')
  if (image?.width && image?.height) figure.style.setProperty('--img-ratio', `${image.width} / ${image.height}`)
  if (image?.width) figure.style.setProperty('--img-w', String(image.width))
  const fallback = () => {
    figure.replaceChildren(h('span', { class: 'vx-media__fallback' }, svgIcon('icon-vodafone-logo-white', 'vx-media__mark')))
    figure.classList.add('is-fallback')
  }
  if (!image?.src) {
    fallback()
    return figure
  }
  const img = h('img', { src: image.src, alt, width: image.width, height: image.height, loading: eager ? 'eager' : 'lazy', decoding: 'async' })
  img.addEventListener('error', guarded('image error', fallback), { once: true })
  figure.append(img)
  return figure
}

/** Compact service card used inside several experiences. */
export const serviceCard = (item, { headingLevel = 'h3', className = '', withMedia = true } = {}) =>
  h(
    'article',
    { class: `vx-card${storyLinkClass(item)} ${className}`.trim(), 'data-aixc-item': item.id },
    withMedia ? media(item, { className: 'vx-card__media' }) : null,
    h(
      'div',
      { class: 'vx-card__body' },
      h(headingLevel, { class: 'vx-card__title' }, titleContent(item)),
      item.description ? h('p', { class: 'vx-card__desc' }, item.description) : null,
      ctaFor(item, { variant: 'text' }),
    ),
  )

/** The source section's extras (section CTA, QR aside), rendered with its group. */
export const groupExtras = (group, { onDark = false } = {}) => {
  const nodes = []
  if (group.cta) nodes.push(externalLink(group.cta.href, `vx-btn vx-btn--primary${onDark ? ' vx-on-dark' : ''}`, group.cta.label))
  if (group.aside) {
    nodes.push(
      h(
        'figure',
        { class: `vx-aside${onDark ? ' vx-on-dark' : ''}` },
        group.aside.image?.src ? h('img', { src: group.aside.image.src, alt: '', width: 72, height: 72, loading: 'lazy', decoding: 'async' }) : null,
        h(
          'figcaption',
          null,
          h('strong', null, group.aside.title),
          group.aside.description ? h('span', null, group.aside.description) : null,
        ),
      ),
    )
  }
  return nodes.length ? h('div', { class: 'vx-extras' }, nodes) : null
}

/** Group heading label: real section title, or a layout label with its provenance. */
export const groupTitle = (group, level = 'h2', className = 'vx-group-title', id) =>
  h(level, { class: className, id, 'data-aixc-authored': group.authored ? 'layout-label' : null }, group.title)

/**
 * A store's badge link, or its name as a text link when the store has no icon (Vodafone's own pages give
 * none): never a <use> of a symbol that is not there.
 */
export const storeLink = (store, iconClass, textClass) =>
  store.icon
    ? h(
        'a',
        { href: store.href, target: '_blank', rel: 'noopener noreferrer', 'aria-label': `${store.label} ${t('(opens in a new tab)')}` },
        svgIcon(store.icon, iconClass),
      )
    : h('a', { class: textClass, href: store.href, target: '_blank', rel: 'noopener noreferrer' }, store.label, visuallyHidden(` ${t('(opens in a new tab)')}`))

/** The Vodafone app promotion, styled like the original page's download band. */
export const closingBand = (promo) => {
  if (!promo) return null
  return h(
    'section',
    { class: 'vx-closing', 'aria-labelledby': 'vx-closing-title', 'data-aixc-item': promo.id, 'data-section-type': 'closing-promotion' },
    h(
      'div',
      { class: 'vx-closing__inner' },
      h(
        'div',
        { class: 'vx-closing__text' },
        h('h2', { class: 'vx-closing__title', id: 'vx-closing-title' }, promo.title),
        promo.lead ? h('p', { class: 'vx-closing__lead' }, promo.lead) : null,
        promo.description ? h('p', { class: 'vx-closing__desc' }, promo.description) : null,
        promo.stores?.length
          ? h(
              'div',
              { class: 'vx-closing__stores' },
              promo.storesLabel ? h('p', { class: 'vx-closing__stores-label' }, promo.storesLabel) : null,
              h(
                'ul',
                null,
                promo.stores.map((store) => h('li', null, storeLink(store, 'vx-closing__store-icon', 'vx-btn vx-btn--secondary vx-on-dark'))),
              ),
            )
          : null,
      ),
      promo.qr?.image?.src
        ? h(
            'figure',
            { class: 'vx-closing__qr' },
            promo.qr.title ? h('figcaption', null, promo.qr.title) : null,
            h('img', { src: promo.qr.image.src, alt: t('QR code to download the Ana Vodafone app'), width: 330, height: 330, loading: 'lazy', decoding: 'async' }),
          )
        : null,
    ),
  )
}

/** Experience root with the shared Vodafone tokens. */
export const experienceRoot = (name, schema, ...children) =>
  h('div', { class: `aixc-vx aixc-vx--${name}`, 'data-experience': name, 'data-density': schema.density }, ...children)

/**
 * Visually hidden page heading so every experience has one h1 for screen readers. A page with no title (empty or
 * blank) gets none, never an empty h1: h() skips the null, and whoever focuses the heading on a new view
 * (#aixc-cover-title, [data-aixc-focus]) finds nothing and focuses something else that shows (Reimagine's shell: its
 * view bar's Reimagined button), never leaving the focus on what the view's opening hid.
 */
export const pageHeading = (index, { visible = false, className = '' } = {}) =>
  String(index.model.title ?? '').trim()
    ? h(
        'h1',
        { class: visible ? className : 'vx-sr-only', id: 'aixc-cover-title', tabindex: '-1', 'data-aixc-focus': '' },
        index.model.title,
      )
    : null

/* ----------------------------------------------------------------- behaviour */

/**
 * Calls `callback` at most once per animation frame while the view scrolls (the scroller, or the window)
 * or resizes (the window; with a scroller, its size too), and once at the start. Returns an off.
 */
export const onScrollFrame = (callback) => {
  let cancel = null
  const schedule = () => {
    if (cancel) return
    cancel = frame(() => {
      cancel = null
      callback()
    })
  }
  const offs = [on(settings.scroller ?? window, 'scroll', schedule, { passive: true }), on(window, 'resize', schedule)]
  if (settings.scroller) offs.push(observeResize(settings.scroller, schedule))
  schedule()
  return keep(() => {
    for (const off of offs) off()
    cancel?.()
    cancel = null
  })
}

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

/**
 * Pinned-stage stepping shared by the scroll-driven experiences. The stage is
 * sticky inside `track`, which is one stage tall plus `step()` pixels per item,
 * so the view's scroll (wheel, keys, scrollbar, touch) moves through the items.
 * Positions are in the scroller's coordinates (the page's on the clone).
 *
 *   position()  fractional item index from the scroll position (0 … count - 1)
 *   goTo(i)     scrolls to item i
 *   settle()    call on scroll: once scrolling stops inside the track, eases to
 *               the nearest item so the next step always starts from a whole item
 */
export const scrollStepper = ({ track, count, step, settleMs = 200, tolerance = 0.02 }) => {
  let cancel = null
  const last = Math.max(0, count - 1)
  // The track's top in the scroller's content.
  const trackTop = () => track.getBoundingClientRect().top - scrollerTop() + scrollTop()
  const position = () => clamp((viewTop() - track.getBoundingClientRect().top) / step(), 0, last)
  const pinned = () => {
    const rect = track.getBoundingClientRect()
    return rect.top <= viewTop() + 1 && rect.bottom >= viewBottom() - 1
  }
  const goTo = (at, { instant = false } = {}) => scrollToY(trackTop() + clamp(at, 0, last) * step() - chromeOffset() + 1, { instant })
  const stop = () => {
    cancel?.()
    cancel = null
  }
  const settle = () => {
    stop()
    cancel = later(() => {
      cancel = null
      if (!pinned()) return
      const at = position()
      if (Math.abs(at - Math.round(at)) > tolerance) goTo(Math.round(at))
    }, settleMs)
  }
  return { position, goTo, settle, stop, pinned }
}

/**
 * Lets a mouse (or pen) drag on `surface` scroll the view, so dragging moves a
 * scroll-driven stage like the references' drag handlers did. `axis` is the drag
 * direction that maps onto scrolling; `factor` is scroll pixels per dragged pixel
 * (drag up, or against the reading line, = forward). With `touch`, horizontal touch drags are handled too
 * (vertical touch keeps native scrolling via `touch-action: pan-y` in CSS).
 * A drag that moved suppresses the click that follows it. Returns a cleanup.
 */
export const dragToScroll = (surface, { axis = 'y', factor = 1, touch = false } = {}) => {
  let pointer = null
  let start = 0
  let moved = false
  // Forward is a drag against the reading line: left in LTR, right in RTL.
  const coord = (event) => (axis === 'x' ? event.clientX * inlineSign : event.clientY)
  const onDown = (event) => {
    if (event.button !== 0 || (event.pointerType === 'touch' && !touch)) return
    if (event.target.closest('a, button:not([data-drag-through]), input, textarea, select, [data-no-drag]')) return
    pointer = event.pointerId
    start = coord(event)
    moved = false
  }
  const onMove = (event) => {
    if (event.pointerId !== pointer) return
    const delta = coord(event) - start
    if (!moved && Math.abs(delta) < 6) return
    if (!moved) {
      moved = true
      surface.setPointerCapture?.(event.pointerId)
      surface.classList.add('is-dragging')
    }
    start = coord(event)
    scrollByY(-delta * factor)
  }
  const onUp = (event) => {
    if (event.pointerId !== pointer) return
    pointer = null
    surface.classList.remove('is-dragging')
    if (moved) {
      const swallow = (click) => {
        click.stopPropagation()
        click.preventDefault()
      }
      later(on(surface, 'click', swallow, { capture: true, once: true }), 0)
    }
  }
  const offs = [on(surface, 'pointerdown', onDown), on(surface, 'pointermove', onMove), on(surface, 'pointerup', onUp), on(surface, 'pointercancel', onUp)]
  return () => offs.forEach((off) => off())
}

/**
 * Forward amount of a sideways wheel or trackpad swipe, in pixels, or 0 when the
 * gesture is mostly vertical (or a pinch). Forward follows the reading line, as a
 * native horizontal scroller does: content moving toward the start edge, so a
 * swipe to the left in English and to the right in Arabic.
 */
const sidewaysDelta = (event) => {
  if (event.ctrlKey || Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return 0
  const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? (settings.scroller?.clientWidth ?? window.innerWidth) : 1
  return event.deltaX * unit * inlineSign
}

/**
 * Lets a sideways swipe on `surface` scroll the view, so a horizontal gesture
 * walks a scroll-driven stage the same way as the wheel. The browser's
 * swipe-to-go-back is held off while the gesture is over the stage. Returns a cleanup.
 */
export const sidewaysWheel = (surface, { factor = 1 } = {}) => {
  const onWheel = (event) => {
    const delta = sidewaysDelta(event)
    if (!delta) return
    event.preventDefault()
    scrollByY(delta * factor)
  }
  return on(surface, 'wheel', onWheel, { passive: false })
}

/**
 * Sideways swipes on `surface` as steps: calls step(1 | -1) once per gesture
 * (forward along the reading line, as in sidewaysWheel), for paged layouts such as
 * the flipbook and the streaming rows. While `enabled()` is false the gesture is
 * left to the browser (a row that scrolls natively, say). Returns a cleanup.
 */
export const sidewaysSwipe = (surface, step, { threshold = 40, quietMs = 260, enabled = () => true } = {}) => {
  let total = 0
  let fired = false
  let cancel = null
  const onWheel = (event) => {
    const delta = sidewaysDelta(event)
    if (!delta || !enabled()) return
    event.preventDefault()
    // A trackpad swipe is a stream of events (with momentum): one step per stream.
    cancel?.()
    cancel = later(() => {
      cancel = null
      total = 0
      fired = false
    }, quietMs)
    if (fired) return
    total += delta
    if (Math.abs(total) >= threshold) {
      fired = true
      step(Math.sign(total))
    }
  }
  const off = on(surface, 'wheel', onWheel, { passive: false })
  return () => {
    cancel?.()
    cancel = null
    off()
  }
}

/** Arrow-key stepping for a stage: calls step(-1 | 1) and first/last for Home/End. Returns an off. */
export const arrowKeys = (stage, { step, first, last, axis = 'both' }) => {
  // Horizontal keys follow the reading line: in RTL, ArrowLeft moves forward.
  const [backX, forwardX] = isRTL ? ['ArrowRight', 'ArrowLeft'] : ['ArrowLeft', 'ArrowRight']
  const back = axis === 'y' ? ['ArrowUp'] : axis === 'x' ? [backX] : [backX, 'ArrowUp']
  const forward = axis === 'y' ? ['ArrowDown'] : axis === 'x' ? [forwardX] : [forwardX, 'ArrowDown']
  return on(stage, 'keydown', (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return
    if (event.target.closest?.('input, textarea, select')) return
    if (back.includes(event.key)) step(-1)
    else if (forward.includes(event.key)) step(1)
    else if (event.key === 'Home' && first) first()
    else if (event.key === 'End' && last) last()
    else return
    event.preventDefault()
  })
}

/** Balanced line split for big display titles: returns the longest line's length. */
export const longestLine = (text, maxLines = 3) => {
  const words = String(text).trim().split(/\s+/)
  const width = (from, to) => words.slice(from, to).join(' ').length
  let best = width(0, words.length)
  if (maxLines >= 2) {
    for (let i = 1; i < words.length; i += 1) best = Math.min(best, Math.max(width(0, i), width(i, words.length)))
  }
  if (maxLines >= 3 && best > 18) {
    for (let i = 1; i < words.length - 1; i += 1) {
      for (let j = i + 1; j < words.length; j += 1) best = Math.min(best, Math.max(width(0, i), width(i, j), width(j, words.length)))
    }
  }
  return Math.max(4, best)
}

/** A polite, visually hidden status line for announcing the current item. */
export const liveStatus = () => h('p', { class: 'vx-sr-only', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' })
