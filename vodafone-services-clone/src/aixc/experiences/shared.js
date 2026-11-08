/**
 * Building blocks shared by the group-based experiences (spotlight, journey,
 * gallery, flipbook, cube). Facts always come from the content index; these
 * helpers only decide markup. Styles live in vodafone.css under .aixc-vx.
 */

import { h, pathIcon, svgIcon, visuallyHidden } from '../dom.js'
import { describeImageShape, PROMOTION_KIND } from '../content-index.js'
import { t } from '../../i18n.js'

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
        title: section.title ?? sourceTitles[0] ?? t('More services'),
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
  if (href && standalone) return externalLink(href, `vx-btn vx-btn--${variant}${tone}`, t('View service'))
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
  img.addEventListener('error', fallback, { once: true })
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
                promo.stores.map((store) =>
                  h(
                    'li',
                    null,
                    h(
                      'a',
                      { href: store.href, target: '_blank', rel: 'noopener noreferrer', 'aria-label': `${store.label} ${t('(opens in a new tab)')}` },
                      svgIcon(store.icon, 'vx-closing__store-icon'),
                    ),
                  ),
                ),
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

/** Visually hidden page heading so every experience has one h1 for screen readers. */
export const pageHeading = (index, { visible = false, className = '' } = {}) =>
  h(
    'h1',
    { class: visible ? className : 'vx-sr-only', id: 'aixc-cover-title', tabindex: '-1', 'data-aixc-focus': '' },
    index.model.title,
  )

/* ----------------------------------------------------------------- behaviour */

/**
 * Calls `callback` at most once per animation frame while the page scrolls or
 * resizes. Returns a function that stops listening.
 */
export const onScrollFrame = (callback) => {
  let frame = 0
  const schedule = () => {
    if (frame) return
    frame = window.requestAnimationFrame(() => {
      frame = 0
      callback()
    })
  }
  window.addEventListener('scroll', schedule, { passive: true })
  window.addEventListener('resize', schedule)
  schedule()
  return () => {
    window.removeEventListener('scroll', schedule)
    window.removeEventListener('resize', schedule)
    if (frame) window.cancelAnimationFrame(frame)
    frame = 0
  }
}

/** Height of the sticky chrome above the content (site header + AIXC view bar). */
export const chromeOffset = () => {
  const header = document.querySelector('#site-header')
  const viewbar = document.querySelector('#aixc-viewbar')
  const headerH = header ? header.getBoundingClientRect().height : 0
  const viewbarH = viewbar && !viewbar.hidden ? viewbar.getBoundingClientRect().height : 0
  return headerH + viewbarH
}

/** Smoothly scrolls the window to an absolute Y, honouring reduced motion. */
export const scrollToY = (y, { instant = false } = {}) =>
  window.scrollTo({ top: Math.max(0, y), behavior: instant || reducedMotion() ? 'auto' : 'smooth' })

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

/**
 * Pinned-stage stepping shared by the scroll-driven experiences. The stage is
 * sticky inside `track`, which is one stage tall plus `step()` pixels per item,
 * so page scroll (wheel, keys, scrollbar, touch) moves through the items.
 *
 *   position()  fractional item index from the scroll position (0 … count - 1)
 *   goTo(i)     scrolls to item i
 *   settle()    call on scroll: once scrolling stops inside the track, eases to
 *               the nearest item so the next step always starts from a whole item
 */
export const scrollStepper = ({ track, count, step, settleMs = 200, tolerance = 0.02 }) => {
  let timer = 0
  const last = Math.max(0, count - 1)
  const trackTop = () => track.getBoundingClientRect().top + window.scrollY
  const position = () => clamp((chromeOffset() - track.getBoundingClientRect().top) / step(), 0, last)
  const pinned = () => {
    const rect = track.getBoundingClientRect()
    return rect.top <= chromeOffset() + 1 && rect.bottom >= window.innerHeight - 1
  }
  const goTo = (at, { instant = false } = {}) => scrollToY(trackTop() + clamp(at, 0, last) * step() - chromeOffset() + 1, { instant })
  const settle = () => {
    window.clearTimeout(timer)
    timer = window.setTimeout(() => {
      if (!pinned()) return
      const at = position()
      if (Math.abs(at - Math.round(at)) > tolerance) goTo(Math.round(at))
    }, settleMs)
  }
  const stop = () => window.clearTimeout(timer)
  return { position, goTo, settle, stop, pinned }
}

/**
 * Lets a mouse (or pen) drag on `surface` scroll the page, so dragging moves a
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
    window.scrollBy({ top: -delta * factor, behavior: 'auto' })
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
      surface.addEventListener('click', swallow, { capture: true, once: true })
      window.setTimeout(() => surface.removeEventListener('click', swallow, { capture: true }), 0)
    }
  }
  surface.addEventListener('pointerdown', onDown)
  surface.addEventListener('pointermove', onMove)
  surface.addEventListener('pointerup', onUp)
  surface.addEventListener('pointercancel', onUp)
  return () => {
    surface.removeEventListener('pointerdown', onDown)
    surface.removeEventListener('pointermove', onMove)
    surface.removeEventListener('pointerup', onUp)
    surface.removeEventListener('pointercancel', onUp)
  }
}

/** Arrow-key stepping for a stage: calls step(-1 | 1) and first/last for Home/End. */
export const arrowKeys = (stage, { step, first, last, axis = 'both' }) => {
  // Horizontal keys follow the reading line: in RTL, ArrowLeft moves forward.
  const [backX, forwardX] = isRTL ? ['ArrowRight', 'ArrowLeft'] : ['ArrowLeft', 'ArrowRight']
  const back = axis === 'y' ? ['ArrowUp'] : axis === 'x' ? [backX] : [backX, 'ArrowUp']
  const forward = axis === 'y' ? ['ArrowDown'] : axis === 'x' ? [forwardX] : [forwardX, 'ArrowDown']
  stage.addEventListener('keydown', (event) => {
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
