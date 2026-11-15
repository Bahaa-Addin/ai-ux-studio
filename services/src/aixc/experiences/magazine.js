/**
 * Magazine experience: maps a validated schema to DOM.
 *
 * Every primitive reads facts (titles, descriptions, images, links) from the
 * content index. The only schema-authored text that can appear is a section's
 * short layout title, which is marked with data-aixc-authored and always shown
 * next to the real source section name.
 *
 * Styling lives in magazine.css, fully scoped under .aixc-magazine. Variants are
 * chosen here as semantic classes (is-lead, is-flipped, shape) rather than CSS
 * nth-child rules, so any composition renders predictably.
 */

import { h, pathIcon, slug, svgIcon, visuallyHidden } from '../dom.js'
import { describeImageShape, PROMOTION_KIND } from '../content-index.js'
// Direction-aware chevrons, the reading direction and the page's UI copy.
import { ICON_NEXT, ICON_PREV, inlineSign, isRTL, t } from './shared.js'

const ICON_EXTERNAL = 'M14 3h7v7h-2V6.4l-9.3 9.3-1.4-1.4L17.6 5H14V3zM5 5h6v2H7v10h10v-4h2v6H5V5z'
/** List separator for source names: the Arabic comma on the Arabic page. */
const listJoin = (names) => names.join(isRTL ? '، ' : ', ')

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/* ------------------------------------------------------------------ helpers */

const sectionDomId = (section) => `aixc-s-${slug(section.id)}`
const headingDomId = (section) => `aixc-h-${slug(section.id)}`

const externalLink = (href, className, ...children) =>
  h(
    'a',
    { class: className, href, target: '_blank', rel: 'noopener noreferrer' },
    ...children,
    visuallyHidden(` ${t('(opens in a new tab)')}`),
    pathIcon(ICON_EXTERNAL, 'mag-ext'),
  )

/** The item's own CTA, or null when the title itself carries the link. */
const ctaFor = (item, { quiet = false } = {}) => {
  const { label, href } = item.cta ?? {}
  if (!label) return null
  if (href) return externalLink(href, quiet ? 'mag-cta mag-cta--quiet' : 'mag-cta', label)
  // The source has a label but no destination (e.g. "Subscribe now"). Show it as
  // information, not as a control, rather than inventing a link.
  return h('span', { class: 'mag-cta mag-cta--inert' }, label)
}

/** Title as plain text, or as the story link when the source card is the link. */
const titleContent = (item) => {
  const { label, href } = item.cta ?? {}
  if (href && !label) {
    return h(
      'a',
      { class: 'mag-story-link', href, target: '_blank', rel: 'noopener noreferrer' },
      item.title,
      visuallyHidden(` ${t('(opens in a new tab)')}`),
    )
  }
  return item.title
}

const linkedStoryClass = (item) => (item.cta?.href && !item.cta?.label ? ' has-story-link' : '')

const media = (item, variant = 'default') => {
  const image = item.image
  const shape = describeImageShape(image)
  const figure = h('figure', { class: `mag-frame mag-frame--${variant}`, 'data-shape': shape })
  if (image?.fit === 'contain') figure.classList.add('is-contain')
  if (image?.width) figure.style.setProperty('--img-w', String(image.width))
  if (image?.width && image?.height) figure.style.setProperty('--img-ratio', `${image.width} / ${image.height}`)

  const showFallback = () => {
    figure.replaceChildren(h('span', { class: 'mag-frame__fallback' }, svgIcon('icon-vodafone-logo-white', 'mag-frame__mark')))
    figure.classList.add('is-fallback')
  }
  if (!image?.src) {
    showFallback()
    return figure
  }
  const img = h('img', {
    src: image.src,
    alt: '', // decorative: the title next to it names the service
    width: image.width,
    height: image.height,
    loading: variant === 'cover' ? 'eager' : 'lazy',
    decoding: 'async',
  })
  img.addEventListener('error', showFallback, { once: true })
  figure.append(img)
  return figure
}

const description = (item, className = 'mag-desc') => (item.description ? h('p', { class: className }, item.description) : null)

const uniqueSourceSections = (section, ctx) => {
  const seen = new Set()
  const sources = []
  for (const id of section.itemIds) {
    const source = ctx.index.sectionOf(id)
    if (source && !seen.has(source.id)) {
      seen.add(source.id)
      sources.push(source)
    }
  }
  return sources
}

/**
 * Works out what a section is called and how to label its provenance.
 *   title     the visible h2 text
 *   authored  true when the title came from the schema rather than the source page
 *   kicker    real source section names, shown whenever they are not the title
 */
const naming = (section, ctx) => {
  const sources = uniqueSourceSections(section, ctx)
  const sourceTitles = sources.map((source) => source.title)
  const authored = Boolean(section.title) && !sourceTitles.includes(section.title)
  const title = section.title ?? sourceTitles[0] ?? null
  let kicker = null
  if (authored && sourceTitles.length) kicker = t('From {sources}', { sources: listJoin(sourceTitles) })
  else if (!authored && sourceTitles.length > 1) kicker = listJoin(sourceTitles.slice(1))
  return { title, authored, kicker, sources }
}

const kickerEl = (text) => (text ? h('p', { class: 'mag-kicker' }, text) : null)

const headingEl = (section, { title, authored }, level = 'h2', className = 'mag-title') =>
  title
    ? h(level, { class: className, id: headingDomId(section), 'data-aixc-authored': authored ? 'layout-label' : null }, title)
    : null

/**
 * Source-section extras (description, section CTA, aside) render once, with the
 * first composed section that contains that source section's items.
 */
const sourceExtras = (section, ctx, names) => {
  const nodes = { dek: [], actions: [], asides: [] }
  for (const source of names.sources) {
    if (ctx.extrasRendered.has(source.id)) continue
    ctx.extrasRendered.add(source.id)
    if (source.description && (names.sources.length === 1 || !names.authored)) {
      nodes.dek.push(h('p', { class: 'mag-dek' }, source.description))
    }
    if (source.cta?.label && source.cta?.href) nodes.actions.push(externalLink(source.cta.href, 'mag-cta', source.cta.label))
    if (source.aside) {
      nodes.asides.push(
        h(
          'figure',
          { class: 'mag-aside' },
          source.aside.image?.src
            ? h('img', { src: source.aside.image.src, alt: '', width: 96, height: 96, loading: 'lazy', decoding: 'async' })
            : null,
          h(
            'figcaption',
            null,
            h('strong', { class: 'mag-aside__title' }, source.aside.title),
            source.aside.description ? h('span', { class: 'mag-aside__text' }, source.aside.description) : null,
          ),
        ),
      )
    }
  }
  return nodes
}

const sectionHead = (section, ctx, names, className = 'mag-head') => {
  const extras = sourceExtras(section, ctx, names)
  return h(
    'header',
    { class: className },
    h('div', { class: 'mag-head__text' }, kickerEl(names.kicker), headingEl(section, names), extras.dek),
    extras.actions.length || extras.asides.length ? h('div', { class: 'mag-head__aside' }, extras.actions, extras.asides) : null,
  )
}

const spread = (section, className, ...children) =>
  h(
    'section',
    { class: `mag-spread ${className}`, id: sectionDomId(section), 'aria-labelledby': headingDomId(section), 'data-section-type': section.type },
    ...children,
  )

const items = (section, ctx) => section.itemIds.map((id) => ctx.index.get(id)).filter(Boolean)

/** A compact story used by several primitives for "the rest" of their items. */
const compactStory = (item, level = 'h3') =>
  h(
    'article',
    { class: `mag-story mag-story--compact${linkedStoryClass(item)}`, 'data-aixc-item': item.id },
    media(item, 'thumb'),
    h('div', { class: 'mag-story__text' }, h(level, { class: 'mag-story__title' }, titleContent(item)), description(item), ctaFor(item, { quiet: true })),
  )

/* --------------------------------------------------------------- primitives */

const hero = (section, ctx) => {
  const page = ctx.index.model
  const [story, ...more] = items(section, ctx)
  const contents = ctx.schema.sections.filter((other) => other !== section && other.type !== 'closing-promotion')

  const el = h(
    'section',
    { class: 'mag-spread mag-cover', id: sectionDomId(section), 'aria-labelledby': 'aixc-cover-title', 'data-section-type': 'hero' },
    page.heroImage?.src
      ? h('div', { class: 'mag-cover__photo' }, h('img', { src: page.heroImage.src, alt: '', width: page.heroImage.width, height: page.heroImage.height, loading: 'eager', decoding: 'async' }))
      : null,
    h(
      'div',
      { class: 'mag-cover__inner' },
      h(
        'div',
        { class: 'mag-cover__masthead' },
        section.title && section.title !== page.title
          ? h('p', { class: 'mag-cover__label', 'data-aixc-authored': 'layout-label' }, section.title)
          : null,
        h('h1', { class: 'mag-cover__title', id: 'aixc-cover-title', tabindex: '-1' }, page.title),
        page.intro ? h('p', { class: 'mag-cover__intro' }, page.intro) : null,
      ),
      story
        ? h(
            'article',
            { class: `mag-cover__story${linkedStoryClass(story)}`, 'data-aixc-item': story.id },
            media(story, 'cover'),
            h(
              'div',
              { class: 'mag-cover__story-text' },
              h('h2', { class: 'mag-cover__story-title' }, titleContent(story)),
              description(story, 'mag-cover__story-desc'),
              ctaFor(story),
            ),
          )
        : null,
      contents.length
        ? h(
            'nav',
            { class: 'mag-cover__contents', 'aria-label': t('Sections in this view') },
            h('h2', { class: 'mag-cover__contents-title' }, t('Inside')),
            h(
              'ul',
              null,
              contents.map((other) => {
                const label = naming(other, ctx).title ?? t('More services')
                return h('li', null, h('a', { href: `#${sectionDomId(other)}` }, label))
              }),
            ),
          )
        : null,
    ),
  )
  if (more.length) el.append(h('div', { class: 'mag-cover__more' }, more.map((item) => compactStory(item))))
  return el
}

const feature = (section, ctx) => {
  const names = naming(section, ctx)
  const [lead, ...rest] = items(section, ctx)
  const flipped = ctx.nextFlip('feature')
  return spread(
    section,
    `mag-feature${flipped ? ' is-flipped' : ''}`,
    sectionHead(section, ctx, names),
    h(
      'article',
      { class: `mag-feature__lead${linkedStoryClass(lead)}`, 'data-aixc-item': lead.id },
      media(lead, 'lead'),
      h(
        'div',
        { class: 'mag-feature__text' },
        h('h3', { class: 'mag-feature__title' }, titleContent(lead)),
        description(lead, 'mag-feature__desc'),
        ctaFor(lead),
      ),
    ),
    rest.length ? h('div', { class: 'mag-feature__more' }, rest.map((item) => compactStory(item))) : null,
  )
}

const tile = (item, isLead) => {
  const shape = describeImageShape(item.image)
  return h(
    'article',
    { class: `mag-tile mag-tile--${shape}${isLead ? ' is-lead' : ''}${linkedStoryClass(item)}`, 'data-aixc-item': item.id },
    media(item, 'tile'),
    h('div', { class: 'mag-tile__text' }, h('h3', { class: 'mag-tile__title' }, titleContent(item)), description(item), ctaFor(item, { quiet: true })),
  )
}

/**
 * Lead story across the full width, then the rest flowing in balanced columns.
 * Columns (rather than a row grid) let portrait, square and landscape images sit
 * together without leaving holes, whatever mix of items the schema assigns.
 */
const editorialGrid = (section, ctx) => {
  const names = naming(section, ctx)
  const list = items(section, ctx)
  const hasLead = list.length >= 4
  const [lead, rest] = hasLead ? [list[0], list.slice(1)] : [null, list]
  return spread(
    section,
    'mag-grid-spread',
    sectionHead(section, ctx, names, 'mag-head mag-head--row'),
    lead ? tile(lead, true) : null,
    h('div', { class: `mag-grid${rest.length < 3 ? ' is-sparse' : ''}` }, rest.map((item) => tile(item, false))),
  )
}

const splitSpread = (section, ctx) => {
  const names = naming(section, ctx)
  const flipped = ctx.nextFlip('split')
  const extras = sourceExtras(section, ctx, names)
  return spread(
    section,
    `mag-split${flipped ? ' is-flipped' : ''}`,
    h(
      'header',
      { class: 'mag-split__panel' },
      kickerEl(names.kicker),
      headingEl(section, names, 'h2', 'mag-split__title'),
      extras.dek,
      extras.actions,
      extras.asides,
    ),
    h(
      'div',
      { class: 'mag-split__stories' },
      items(section, ctx).map((item) =>
        h(
          'article',
          { class: `mag-row${linkedStoryClass(item)}`, 'data-aixc-item': item.id },
          media(item, 'row'),
          h('div', { class: 'mag-row__text' }, h('h3', { class: 'mag-row__title' }, titleContent(item)), description(item), ctaFor(item, { quiet: true })),
        ),
      ),
    ),
  )
}

const shelf = (section, ctx) => {
  const names = naming(section, ctx)
  const label = names.title ?? t('Services')
  const track = h(
    'div',
    { class: 'mag-shelf__track', role: 'region', 'aria-label': t('{label}, scrollable list', { label }), tabindex: '0' },
    items(section, ctx).map((item) =>
      h(
        'article',
        { class: `mag-card${linkedStoryClass(item)}`, 'data-aixc-item': item.id },
        media(item, 'card'),
        h('div', { class: 'mag-card__text' }, h('h3', { class: 'mag-card__title' }, titleContent(item)), description(item), ctaFor(item, { quiet: true })),
      ),
    ),
  )
  const prev = h('button', { type: 'button', class: 'mag-shelf__button', 'aria-label': t('Scroll {label} back', { label }) }, pathIcon(ICON_PREV, 'mag-shelf__icon'))
  const next = h('button', { type: 'button', class: 'mag-shelf__button', 'aria-label': t('Scroll {label} forward', { label }) }, pathIcon(ICON_NEXT, 'mag-shelf__icon'))
  // Forward runs along the reading line: toward the left on the Arabic page.
  const scrollByPage = (direction) =>
    track.scrollBy({ left: direction * inlineSign * track.clientWidth * 0.85, behavior: reducedMotion() ? 'auto' : 'smooth' })
  prev.addEventListener('click', () => scrollByPage(-1))
  next.addEventListener('click', () => scrollByPage(1))
  const sync = () => {
    const max = track.scrollWidth - track.clientWidth - 2
    // In RTL scrollLeft is 0 at the start and grows negative going forward.
    const at = track.scrollLeft * inlineSign
    prev.disabled = at <= 2
    next.disabled = at >= max
  }
  track.addEventListener('scroll', sync, { passive: true })
  ctx.afterMount.push(() => {
    sync()
    if (typeof ResizeObserver === 'function') new ResizeObserver(sync).observe(track)
  })

  const head = sectionHead(section, ctx, names, 'mag-head mag-head--row')
  head.append(h('div', { class: 'mag-shelf__controls' }, prev, next))
  return spread(section, 'mag-shelf', head, track)
}

const callout = (section, ctx) => {
  const names = naming(section, ctx)
  const [item, ...rest] = items(section, ctx)
  const extras = sourceExtras(section, ctx, names)
  return spread(
    section,
    `mag-callout${linkedStoryClass(item)}`,
    h(
      'div',
      { class: 'mag-callout__body', 'data-aixc-item': item.id },
      kickerEl(names.authored ? names.kicker : null),
      // The section heading is the service title so the large text below is clearly its description.
      // Without a description, the title itself is set large instead of repeating it.
      h('h2', { class: `mag-callout__title${item.description ? '' : ' is-large'}`, id: headingDomId(section) }, titleContent(item)),
      item.description ? h('p', { class: 'mag-callout__text' }, item.description) : null,
      h('div', { class: 'mag-callout__actions' }, ctaFor(item), extras.actions),
      extras.dek,
    ),
    media(item, 'callout'),
    rest.length ? h('div', { class: 'mag-callout__more' }, rest.map((other) => compactStory(other))) : null,
  )
}

const sectionHeading = (section, ctx) => {
  const names = naming(section, ctx)
  const list = items(section, ctx)
  return spread(
    section,
    'mag-opener',
    sectionHead(section, ctx, names, 'mag-head mag-head--opener'),
    list.length ? h('div', { class: 'mag-opener__items' }, list.map((item) => compactStory(item))) : null,
  )
}

const serviceList = (section, ctx) => {
  const names = naming(section, ctx)
  return spread(
    section,
    'mag-list-spread',
    sectionHead(section, ctx, names),
    h(
      'ul',
      { class: 'mag-index' },
      items(section, ctx).map((item) =>
        h(
          'li',
          { class: `mag-entry${linkedStoryClass(item)}`, 'data-aixc-item': item.id },
          media(item, 'thumb'),
          h('div', { class: 'mag-entry__text' }, h('h3', { class: 'mag-entry__title' }, titleContent(item)), description(item), ctaFor(item, { quiet: true })),
        ),
      ),
    ),
  )
}

const closingPromotion = (section, ctx) => {
  const promo = items(section, ctx).find((item) => item.kind === PROMOTION_KIND)
  if (!promo) return null
  return h(
    'section',
    { class: 'mag-spread mag-closing', id: sectionDomId(section), 'aria-labelledby': headingDomId(section), 'data-section-type': 'closing-promotion', 'data-aixc-item': promo.id },
    h(
      'div',
      { class: 'mag-closing__text' },
      h('h2', { class: 'mag-closing__title', id: headingDomId(section) }, promo.title),
      promo.lead ? h('p', { class: 'mag-closing__lead' }, promo.lead) : null,
      promo.description ? h('p', { class: 'mag-closing__desc' }, promo.description) : null,
      promo.stores?.length
        ? h(
            'div',
            { class: 'mag-closing__stores' },
            promo.storesLabel ? h('p', { class: 'mag-closing__stores-label' }, promo.storesLabel) : null,
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
                    svgIcon(store.icon, 'mag-closing__store-icon'),
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
          { class: 'mag-closing__qr' },
          h('img', { src: promo.qr.image.src, alt: t('QR code to download the Ana Vodafone app'), width: 330, height: 330, loading: 'lazy', decoding: 'async' }),
          promo.qr.title ? h('figcaption', null, promo.qr.title) : null,
        )
      : null,
  )
}

/** Generic, always-safe block used when a primitive fails to render. */
export const genericBlock = (section, ctx) => serviceList(section, ctx)

export const magazinePrimitives = {
  hero,
  feature,
  'editorial-grid': editorialGrid,
  'split-spread': splitSpread,
  shelf,
  callout,
  'section-heading': sectionHeading,
  'service-list': serviceList,
  'closing-promotion': closingPromotion,
}

export const renderMagazine = (schema, index, { onPrimitiveError } = {}) => {
  const flips = new Map()
  const ctx = {
    schema,
    index,
    extrasRendered: new Set(),
    afterMount: [],
    nextFlip(kind) {
      const count = flips.get(kind) ?? 0
      flips.set(kind, count + 1)
      return count % 2 === 1
    },
  }

  const root = h('div', { class: 'aixc-magazine', 'data-density': schema.density, 'data-theme': schema.theme })
  for (const section of schema.sections) {
    const render = magazinePrimitives[section.type] ?? genericBlock
    let node
    try {
      node = render(section, ctx)
    } catch (error) {
      onPrimitiveError?.(section, error)
      node = genericBlock(section, ctx)
    }
    if (node) root.append(node)
  }
  return { element: root, afterMount: ctx.afterMount }
}
