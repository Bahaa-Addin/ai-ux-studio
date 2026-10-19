/**
 * Page adapter for the Vodafone Egypt Services page.
 *
 * Knows two page-specific things and nothing about AIXC experiences:
 *   1. how this page's original content looks (renderOriginal / enhanceOriginal)
 *   2. how to obtain its normalized content model (extractContent)
 *
 * Original-view markup reuses the class names captured from the live page in
 * src/style.css. It is generated from the local content model (trusted data) and
 * all text is escaped. Every rendered card carries data-aixc-item so extraction
 * can cross-check that the model and the visible page agree.
 */

import { vodafoneServicesPage } from '../content/vodafone-services.js'
import { normalizeContentModel } from '../aixc/content-index.js'
import { svgUse } from '../shell.js'

const esc = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])

const newTab = (label) => `<span class="visually-hidden">${label ? ` – ${esc(label)}` : ''} (opens in a new tab)</span>`

const externalAttrs = (href) => `href="${esc(href)}" target="_blank" rel="noopener noreferrer"`

/** Title that becomes a stretched card link when the source card itself is the link. */
const cardTitle = (item) =>
  item.cta?.href && !item.cta?.label
    ? `<a class="card-link" ${externalAttrs(item.cta.href)}>${esc(item.title)}${newTab()}</a>`
    : esc(item.title)

/* ----------------------------------------------------------- section layouts */

const renderIntro = (section) => {
  const item = section.items[0]
  return `
    <section class="section section--intro" data-aixc-section="${esc(section.id)}">
      <div class="container cash-intro" data-aixc-item="${esc(item.id)}">
        <div class="cash-intro__media">
          <img src="${esc(item.image.src)}" alt="" />
        </div>
        <div class="cash-intro__copy">
          <h2>${esc(item.title)}</h2>
          <p>${esc(item.description)}</p>
        </div>
        <div class="cash-intro__cta">
          ${
            item.cta?.href
              ? `<a ${externalAttrs(item.cta.href)} class="button button--primary button--wide">${esc(item.cta.label)}${newTab(item.title)}</a>`
              : ''
          }
        </div>
      </div>
    </section>
  `
}

const renderStayCard = (item) => `
  <article class="action-card action-card--small action-card--center" data-aixc-item="${esc(item.id)}">
    <img src="${esc(item.image.src)}" alt="" class="action-card__image" />
    <div class="action-card__overlay action-card__overlay--red"></div>
    <div class="action-card__body action-card__body--center">
      <h3>${esc(item.title)}</h3>
      ${
        item.cta?.href
          ? `<a class="action-card__view card-link" ${externalAttrs(item.cta.href)}>${esc(item.cta.label)}${newTab(item.title)}</a>`
          : ''
      }
    </div>
  </article>
`

const renderSubscriptionCard = (item) => `
  <article class="subscription-card" data-aixc-item="${esc(item.id)}">
    <img src="${esc(item.image.src)}" alt="" class="subscription-card__image" />
    <div class="subscription-card__body">
      <h3>${cardTitle(item)}</h3>
      ${item.description ? `<p>${esc(item.description)}</p>` : ''}
    </div>
  </article>
`

const renderEntertainmentCard = (item) => `
  <article class="action-card action-card--entertainment" data-aixc-item="${esc(item.id)}">
    <img src="${esc(item.image.src)}" alt="" class="action-card__image" />
    <div class="action-card__overlay action-card__overlay--dark"></div>
    <div class="action-card__body">
      <div>
        <h3>${esc(item.title)}</h3>
        ${item.description ? `<p>${esc(item.description)}</p>` : ''}
      </div>
      ${item.cta?.label ? `<span class="button button--primary action-card__button">${esc(item.cta.label)}</span>` : ''}
    </div>
  </article>
`

const sectionHeading = (section, { centered = true } = {}) => `
  <div class="section-heading${centered ? ' section-heading--center' : ''}">
    <h2>${esc(section.title)}</h2>
    ${section.description ? `<p>${esc(section.description)}</p>` : ''}
  </div>
`

const renderStay = (section) => `
  <section class="section section--muted" data-aixc-section="${esc(section.id)}">
    <div class="container">
      ${sectionHeading(section)}
      <div class="stay-grid">${section.items.map(renderStayCard).join('')}</div>
    </div>
  </section>
`

const renderGrid = (section) => `
  <section class="section section--muted section--tight-top" data-aixc-section="${esc(section.id)}">
    <div class="container">
      ${sectionHeading(section)}
      <div class="subscription-grid">${section.items.map(renderSubscriptionCard).join('')}</div>
    </div>
  </section>
`

/** The captured rail groups cards as 1, 2, 3, 1 (single, double, triple, single). */
const RAIL_PATTERN = [
  { size: 1, className: 'widget widget--single' },
  { size: 2, className: 'widget widget--double' },
  { size: 3, className: 'widget widget--triple-reverse' },
  { size: 1, className: 'widget widget--single' },
]

const renderRail = (section) => {
  const widgets = []
  let cursor = 0
  let step = 0
  while (cursor < section.items.length) {
    const { size, className } = RAIL_PATTERN[step % RAIL_PATTERN.length]
    widgets.push(`<div class="${className}">${section.items.slice(cursor, cursor + size).map(renderEntertainmentCard).join('')}</div>`)
    cursor += size
    step += 1
  }
  return `
    <section class="section" data-aixc-section="${esc(section.id)}">
      <div class="container section-heading">
        <h2 class="heading-small">${esc(section.title)}</h2>
        ${section.description ? `<p>${esc(section.description)}</p>` : ''}
        ${
          section.cta?.href
            ? `<a ${externalAttrs(section.cta.href)} class="button button--primary">${esc(section.cta.label)}${newTab()}</a>`
            : ''
        }
      </div>
      <div class="container container--bleed-right">
        <div class="entertainment-rail" tabindex="0" role="region" aria-label="${esc(section.title)}">${widgets.join('')}</div>
      </div>
      ${
        section.aside
          ? `<div class="container">
              <div class="mini-qr-card">
                <img src="${esc(section.aside.image.src)}" alt="Ana Vodafone QR code" />
                <div>
                  <h3>${esc(section.aside.title)}</h3>
                  <p>${esc(section.aside.description)}</p>
                </div>
              </div>
            </div>`
          : ''
      }
    </section>
  `
}

const renderCarousel = (section, { tightTop = false } = {}) => `
  <section class="section section--muted${tightTop ? ' section--tight-top' : ''}" data-aixc-section="${esc(section.id)}">
    <div class="container">
      ${sectionHeading(section)}
      <div class="carousel-frame" data-carousel>
        <button class="carousel-frame__arrow" type="button" data-carousel-prev aria-label="Previous ${esc(section.title)}">‹</button>
        <div class="carousel-track" data-carousel-track tabindex="0" role="region" aria-label="${esc(section.title)}">
          ${section.items.map(renderSubscriptionCard).join('')}
        </div>
        <button class="carousel-frame__arrow" type="button" data-carousel-next aria-label="Next ${esc(section.title)}">›</button>
      </div>
      <div class="carousel-dots" data-carousel-dots aria-hidden="true"></div>
    </div>
  </section>
`

const renderClosing = (promo) => `
  <section class="download-band" data-aixc-item="${esc(promo.id)}">
    <div class="container download-band__inner">
      <div class="download-band__copy">
        <h2>${esc(promo.title)}</h2>
        ${promo.lead ? `<p class="download-band__lead">${esc(promo.lead)}</p>` : ''}
        ${promo.description ? `<p>${esc(promo.description)}</p>` : ''}
        <div class="download-band__stores">
          <span>${esc(promo.storesLabel)}</span>
          <div class="store-icons">
            ${promo.stores
              .map(
                (store) =>
                  `<a ${externalAttrs(store.href)} aria-label="${esc(store.label)} (opens in a new tab)">${svgUse(store.icon, 'store-icon')}</a>`,
              )
              .join('')}
          </div>
        </div>
      </div>
      ${
        promo.qr
          ? `<div class="download-band__qr">
              <h3>${esc(promo.qr.title)}</h3>
              <img src="${esc(promo.qr.image.src)}" alt="QR code to download the Ana Vodafone app" />
            </div>`
          : ''
      }
    </div>
  </section>
`

/** Which captured layout each source section uses. Unknown sections fall back to a grid. */
const LAYOUTS = {
  cash: renderIntro,
  'stay-in-control': renderStay,
  'call-and-connect-abroad': renderGrid,
  'great-entertainment': renderRail,
  'shokran-services': (section) => renderCarousel(section),
  'other-services': (section) => renderCarousel(section, { tightTop: true }),
}

const renderOriginal = (root, model) => {
  root.innerHTML = `
    <section class="hero-banner">
      <img src="${esc(model.heroImage.src)}" alt="" />
      <div class="hero-banner__overlay"></div>
      <div class="visually-hidden">
        <h1>${esc(model.title)}</h1>
        <p>${esc(model.intro)}</p>
      </div>
    </section>
    ${model.sections.map((section) => (LAYOUTS[section.id] ?? renderGrid)(section)).join('')}
    ${model.closingPromotion ? renderClosing(model.closingPromotion) : ''}
  `
  enhanceCarousels(root)
}

/* -------------------------------------------------------------- carousels */

const enhanceCarousels = (root) => {
  for (const frame of root.querySelectorAll('[data-carousel]')) {
    const track = frame.querySelector('[data-carousel-track]')
    const prev = frame.querySelector('[data-carousel-prev]')
    const next = frame.querySelector('[data-carousel-next]')
    const dots = frame.parentElement.querySelector('[data-carousel-dots]')
    const smooth = () => (window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth')

    const sync = () => {
      const max = track.scrollWidth - track.clientWidth
      prev.disabled = track.scrollLeft <= 2
      next.disabled = track.scrollLeft >= max - 2
      const pages = Math.max(1, Math.ceil(track.scrollWidth / Math.max(track.clientWidth, 1) - 0.05))
      const current = max <= 0 ? 0 : Math.round((track.scrollLeft / max) * (pages - 1))
      if (dots.childElementCount !== pages) dots.replaceChildren(...Array.from({ length: pages }, () => document.createElement('span')))
      ;[...dots.children].forEach((dot, at) => dot.classList.toggle('is-active', at === current))
    }
    prev.addEventListener('click', () => track.scrollBy({ left: -track.clientWidth, behavior: smooth() }))
    next.addEventListener('click', () => track.scrollBy({ left: track.clientWidth, behavior: smooth() }))
    track.addEventListener('scroll', sync, { passive: true })
    if (typeof ResizeObserver === 'function') new ResizeObserver(sync).observe(track)
    sync()
  }
}

/* ------------------------------------------------------------------ adapter */

export const vodafoneServicesAdapter = {
  pageId: vodafoneServicesPage.pageId,
  label: 'Vodafone Services',

  /** Renders the captured original presentation into the source root. */
  renderOriginal(sourceRoot) {
    const { model } = normalizeContentModel(vodafoneServicesPage)
    renderOriginal(sourceRoot, model)
  },

  /**
   * Returns the normalized content model. For this page the model is the local
   * capture; the rendered DOM is cross-checked so drift between the two is visible.
   */
  extractContent(sourceRoot) {
    const { model, problems } = normalizeContentModel(vodafoneServicesPage)
    if (!model) return { model: null, problems }
    const rendered = new Set([...sourceRoot.querySelectorAll('[data-aixc-item]')].map((node) => node.dataset.aixcItem))
    const expected = [...model.sections.flatMap((section) => section.items.map((item) => item.id)), model.closingPromotion?.id].filter(Boolean)
    for (const id of expected) {
      if (!rendered.has(id)) problems.push(`Item "${id}" is in the content model but not rendered in the original view.`)
    }
    return { model, problems }
  },
}
