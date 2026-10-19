/**
 * Building blocks shared by the group-based experiences (spotlight, journey,
 * gallery, flipbook, cube). Facts always come from the content index; these
 * helpers only decide markup. Styles live in vodafone.css under .aixc-vx.
 */

import { h, pathIcon, svgIcon, visuallyHidden } from '../dom.js'
import { describeImageShape, PROMOTION_KIND } from '../content-index.js'

const ICON_EXTERNAL = 'M14 3h7v7h-2V6.4l-9.3 9.3-1.4-1.4L17.6 5H14V3zM5 5h6v2H7v10h10v-4h2v6H5V5z'
export const ICON_PREV = 'M15.4 7.4 14 6l-6 6 6 6 1.4-1.4L10.8 12z'
export const ICON_NEXT = 'M8.6 16.6 10 18l6-6-6-6-1.4 1.4 4.6 4.6z'
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
        title: section.title ?? sourceTitles[0] ?? 'More services',
        authored,
        // Real source names to show next to a model-authored label.
        provenance: authored && sourceTitles.length ? `From ${sourceTitles.join(', ')}` : null,
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
    visuallyHidden(' (opens in a new tab)'),
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
  if (href && standalone) return externalLink(href, `vx-btn vx-btn--${variant}${tone}`, 'View service')
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
      visuallyHidden(' (opens in a new tab)'),
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
                      { href: store.href, target: '_blank', rel: 'noopener noreferrer', 'aria-label': `${store.label} (opens in a new tab)` },
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
            h('img', { src: promo.qr.image.src, alt: 'QR code to download the Ana Vodafone app', width: 330, height: 330, loading: 'lazy', decoding: 'async' }),
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
export const scrollToY = (y) => window.scrollTo({ top: Math.max(0, y), behavior: reducedMotion() ? 'auto' : 'smooth' })

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value))
