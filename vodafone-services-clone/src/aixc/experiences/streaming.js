/**
 * Streaming showcase — rebuilt from the author's own pen "Flix"
 * (codepen.io/Bahaa-Addin/pen/YayLbo), in the design language of a streaming home.
 *
 * Opening: the VODAFONE wordmark (Roboto 900, the pen's font) appears in white
 * with a long extruded shadow, flashes to red, pushes toward the camera, then
 * flies into its slot in the experience's top bar while the page is revealed.
 * Everything animates transform/opacity only (Web Animations API) — the original
 * animated font-size and a 100-layer text-shadow, which is what made it stutter.
 *
 * Below: a billboard for the lead service, then one row per category with paged
 * sliders and cards that expand on hover/focus, a preview modal (native <dialog>)
 * for details and "Explore all", and the app promotion as a dark closing band.
 * "Skip intro" ends the opening; reduced motion skips it entirely.
 */

import { h, pathIcon, svgIcon, visuallyHidden } from '../dom.js'
import {
  ICON_NEXT, ICON_PREV, chromeOffset, clamp, experienceRoot, externalLink, groupsOf, media, onScrollFrame, pageHeading,
  promotionOf, reducedMotion, scrollToY,
} from './shared.js'

const WORD = 'VODAFONE'
const INTRO_MS = 3200
const ICON_PLAY = 'M8 5.14v13.72L19 12z'
const ICON_INFO = 'M11 7h2v2h-2zm0 4h2v6h-2zm1-9a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16z'
const ICON_CLOSE = 'M18.3 7.1 16.9 5.7 12 10.6 7.1 5.7 5.7 7.1l4.9 4.9-4.9 4.9 1.4 1.4 4.9-4.9 4.9 4.9 1.4-1.4-4.9-4.9z'
const ICON_CHEVRON = 'M8.6 16.6 10 18l6-6-6-6-1.4 1.4 4.6 4.6z'

const domainOf = (href) => {
  try {
    return new URL(href).hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}

/** The wordmark: letters taller toward the edges, the streaming logo's bowed silhouette. */
const wordmark = (className) => {
  const mark = h('span', { class: `st-word ${className}`, 'aria-hidden': 'true' })
  const middle = (WORD.length - 1) / 2
  ;[...WORD].forEach((char, at) => {
    const letter = h('span', { class: 'st-word__l' }, char)
    letter.style.setProperty('--k', (((at - middle) / middle) ** 2).toFixed(3))
    mark.append(letter)
  })
  return mark
}

const circleButton = (icon, label, extraClass = '') =>
  h('button', { type: 'button', class: `st-circle ${extraClass}`.trim(), 'aria-label': label }, pathIcon(icon, ''))

const circleLink = (href, icon, label) =>
  h('a', { class: 'st-circle st-circle--primary', href, target: '_blank', rel: 'noopener noreferrer', 'aria-label': `${label} (opens in a new tab)` }, pathIcon(icon, ''))

export const renderStreaming = (schema, index) => {
  const groups = groupsOf(schema, index)
  const promo = promotionOf(schema, index)
  const page = index.model
  const featured = groups[0]?.items[0] ?? null
  const featuredGroup = groups[0] ?? null
  // The billboard owns the lead service, so it is not repeated in its row.
  const rows = groups
    .map((group) => ({ group, items: group === featuredGroup ? group.items.slice(1) : group.items }))
    .filter((row) => row.items.length > 0)

  /* ---------------------------------------------------------------- modal */
  const modalBody = h('div', { class: 'st-modal__content' })
  const modalClose = h('button', { type: 'button', class: 'st-modal__close', 'aria-label': 'Close' }, pathIcon(ICON_CLOSE, ''))
  const modal = h('dialog', { class: 'st-modal', 'aria-labelledby': 'st-modal-title' }, modalClose, modalBody)
  modalClose.addEventListener('click', () => modal.close())
  modal.addEventListener('click', (event) => {
    if (event.target === modal) modal.close() // backdrop
  })

  const groupOf = (item) => groups.find((group) => group.items.includes(item)) ?? null

  const smallCard = (item) => {
    const button = h(
      'button',
      { type: 'button', class: 'st-more__card', 'aria-label': `More info: ${item.title}` },
      media(item, { className: 'st-more__media' }),
      h('span', { class: 'st-more__title' }, item.title),
      item.description ? h('span', { class: 'st-more__desc' }, item.description) : null,
    )
    button.addEventListener('click', () => openItem(item))
    return button
  }

  const primaryAction = (item, { large = false } = {}) => {
    const { label, href } = item.cta ?? {}
    const text = label ?? 'View service'
    if (href) {
      return h(
        'a',
        { class: `st-btn st-btn--play${large ? ' st-btn--large' : ''}`, href, target: '_blank', rel: 'noopener noreferrer' },
        pathIcon(ICON_PLAY, 'st-btn__icon'),
        h('span', null, text),
        visuallyHidden(' (opens in a new tab)'),
      )
    }
    // The source shows this label without a destination; show it as information.
    return label ? h('span', { class: 'st-tag' }, label) : null
  }

  const openItem = (item) => {
    const group = groupOf(item)
    const siblings = group ? group.items.filter((other) => other !== item) : []
    const domain = item.cta?.href ? domainOf(item.cta.href) : null
    modalBody.replaceChildren(
      h(
        'div',
        { class: 'st-modal__hero' },
        media(item, { className: 'st-modal__media', eager: true }),
        h('div', { class: 'st-modal__hero-info' }, h('h2', { class: 'st-modal__title', id: 'st-modal-title' }, item.title), h('div', { class: 'st-modal__actions' }, primaryAction(item, { large: true }))),
      ),
      h(
        'div',
        { class: 'st-modal__details' },
        h('div', { class: 'st-modal__main' }, item.description ? h('p', { class: 'st-modal__desc' }, item.description) : null),
        h(
          'dl',
          { class: 'st-modal__meta' },
          group ? h('div', null, h('dt', null, 'Category'), h('dd', null, group.title)) : null,
          h('div', null, h('dt', null, 'Link'), h('dd', null, domain ?? 'None on the source page')),
        ),
      ),
      siblings.length
        ? h('section', { class: 'st-more', 'aria-labelledby': 'st-more-title' }, h('h3', { class: 'st-more__heading', id: 'st-more-title' }, `More in ${group.title}`), h('div', { class: 'st-more__grid' }, siblings.map(smallCard)))
        : null,
    )
    if (!modal.open) modal.showModal()
    modal.scrollTop = 0
    modalClose.focus()
  }

  const openGroup = (group) => {
    modalBody.replaceChildren(
      h(
        'div',
        { class: 'st-modal__group-head' },
        h('h2', { class: 'st-modal__title', id: 'st-modal-title' }, group.title),
        group.description ? h('p', { class: 'st-modal__desc' }, group.description) : null,
        group.cta ? externalLink(group.cta.href, 'st-btn st-btn--play', group.cta.label) : null,
      ),
      h('div', { class: 'st-more__grid st-more__grid--all' }, group.items.map(smallCard)),
    )
    if (!modal.open) modal.showModal()
    modal.scrollTop = 0
    modalClose.focus()
  }

  /* ------------------------------------------------------------ top bar */
  const brand = h('a', { class: 'st-brand', href: '#st-top', 'aria-label': 'Vodafone, back to the top' }, wordmark('st-brand__word'))
  const navLinks = rows.map((row) => {
    const link = h('a', { class: 'st-nav__link', href: `#st-row-${row.group.id}` }, row.group.title)
    link.addEventListener('click', (event) => {
      event.preventDefault()
      const target = root.querySelector(`#st-row-${row.group.id}`)
      scrollToY(target.getBoundingClientRect().top + window.scrollY - chromeOffset() - navBar.offsetHeight)
      target.querySelector('.st-row__title')?.focus({ preventScroll: true })
    })
    return link
  })
  const homeLink = h('a', { class: 'st-nav__link is-current', href: '#st-top', 'aria-current': 'page' }, 'Home')
  const backToTop = (event) => {
    event.preventDefault()
    scrollToY(root.getBoundingClientRect().top + window.scrollY - chromeOffset())
  }
  homeLink.addEventListener('click', backToTop)
  brand.addEventListener('click', backToTop)
  const navBar = h('nav', { class: 'st-nav', 'aria-label': 'Streaming showcase' }, brand, h('ul', { class: 'st-nav__links' }, [homeLink, ...navLinks].map((link) => h('li', null, link))))

  /* ------------------------------------------------------------ billboard */
  let billboard = null
  if (featured) {
    const titleArt = featured.image?.fit === 'contain' && featured.image?.src
      ? h('img', { class: 'st-billboard__art', src: featured.image.src, alt: '', width: featured.image.width, height: featured.image.height })
      : null
    const moreInfo = h('button', { type: 'button', class: 'st-btn st-btn--info' }, pathIcon(ICON_INFO, 'st-btn__icon'), h('span', null, 'More info'))
    moreInfo.addEventListener('click', () => openItem(featured))
    billboard = h(
      'section',
      { class: 'st-billboard', 'aria-labelledby': 'st-billboard-title', 'data-aixc-item': featured.id },
      h(
        'div',
        { class: 'st-billboard__media', 'aria-hidden': 'true' },
        page.heroImage?.src ? h('img', { src: page.heroImage.src, alt: '', decoding: 'async' }) : null,
      ),
      h(
        'div',
        { class: 'st-billboard__info' },
        h('p', { class: 'st-badge' }, svgIcon('icon-vodafone-logo', 'st-badge__mark'), h('span', null, featuredGroup.title)),
        titleArt,
        h('h2', { class: 'st-billboard__title', id: 'st-billboard-title' }, featured.title),
        featured.description ? h('p', { class: 'st-billboard__synopsis' }, featured.description) : null,
        h('div', { class: 'st-billboard__actions' }, primaryAction(featured, { large: true }), moreInfo),
      ),
    )
  }

  /* ----------------------------------------------------------------- rows */
  const sliders = []
  const rowEls = rows.map((row) => {
    const titleId = `st-row-title-${row.group.id}`
    const exploreButton = h('button', { type: 'button', class: 'st-row__explore' }, h('span', null, 'Explore all'), pathIcon(ICON_CHEVRON, ''))
    exploreButton.addEventListener('click', () => openGroup(row.group))

    const cards = row.items.map((item) => {
      const open = h(
        'button',
        { type: 'button', class: 'st-card__open', 'aria-label': `More info: ${item.title}` },
        media(item, { className: 'st-card__media' }),
        h('span', { class: 'st-card__label', 'aria-hidden': 'true' }, item.title),
      )
      open.addEventListener('click', () => openItem(item))
      const info = circleButton(ICON_INFO, `More info: ${item.title}`, 'st-circle--ghost')
      info.addEventListener('click', () => openItem(item))
      const action = item.cta?.href ? circleLink(item.cta.href, ICON_PLAY, item.cta.label ?? `View ${item.title}`) : null
      return h(
        'li',
        { class: 'st-card', 'data-aixc-item': item.id },
        h(
          'div',
          { class: 'st-card__inner' },
          open,
          h(
            'div',
            { class: 'st-card__info' },
            h('div', { class: 'st-card__actions' }, action, info),
            h('p', { class: 'st-card__title' }, item.title),
            item.description ? h('p', { class: 'st-card__desc' }, item.description) : null,
            item.cta?.label && !item.cta?.href ? h('p', { class: 'st-card__note' }, item.cta.label) : null,
          ),
        ),
      )
    })

    const track = h('ul', { class: 'st-row__track' }, cards)
    const viewport = h('div', { class: 'st-row__viewport' }, track)
    const prev = h('button', { type: 'button', class: 'st-row__arrow st-row__arrow--prev', 'aria-label': `Previous ${row.group.title}` }, pathIcon(ICON_PREV, ''))
    const next = h('button', { type: 'button', class: 'st-row__arrow st-row__arrow--next', 'aria-label': `Next ${row.group.title}` }, pathIcon(ICON_NEXT, ''))
    const pager = h('ol', { class: 'st-row__pages', 'aria-hidden': 'true' })

    const slider = { page: 0, pages: 1, per: 1 }
    const layout = () => {
      slider.per = Math.max(1, parseInt(getComputedStyle(viewport).getPropertyValue('--per'), 10) || 1)
      slider.pages = Math.max(1, Math.ceil(cards.length / slider.per))
      slider.page = clamp(slider.page, 0, slider.pages - 1)
      // The last page stays full instead of trailing into empty space.
      const firstVisible = Math.min(slider.page * slider.per, Math.max(0, cards.length - slider.per))
      track.style.setProperty('--shift', String(firstVisible))
      cards.forEach((card, at) => {
        const visible = at >= firstVisible && at < firstVisible + slider.per
        card.classList.toggle('is-first', at === firstVisible)
        card.classList.toggle('is-last', at === firstVisible + slider.per - 1)
        card.classList.toggle('is-offpage', !visible)
      })
      prev.disabled = slider.page === 0
      next.disabled = slider.page >= slider.pages - 1
      const paged = slider.pages > 1
      prev.hidden = !paged
      next.hidden = !paged
      if (pager.childElementCount !== slider.pages) pager.replaceChildren(...Array.from({ length: slider.pages }, () => h('li', null)))
      ;[...pager.children].forEach((dash, at) => dash.classList.toggle('is-current', at === slider.page))
      pager.hidden = !paged
    }
    prev.addEventListener('click', () => {
      slider.page -= 1
      layout()
    })
    next.addEventListener('click', () => {
      slider.page += 1
      layout()
    })
    // Keyboard users tabbing past the visible cards page the row along with them.
    track.addEventListener('focusin', (event) => {
      const card = event.target.closest('.st-card')
      const at = cards.indexOf(card)
      if (at < 0 || !card.classList.contains('is-offpage')) return
      slider.page = Math.floor(at / slider.per)
      layout()
      viewport.scrollLeft = 0
    })
    sliders.push(layout)

    return h(
      'section',
      { class: 'st-row', id: `st-row-${row.group.id}`, 'aria-labelledby': titleId, 'data-group': row.group.id },
      h(
        'header',
        { class: 'st-row__head' },
        h('h2', { class: 'st-row__title', id: titleId, tabindex: '-1', 'data-aixc-authored': row.group.authored ? 'layout-label' : null }, row.group.title),
        exploreButton,
        pager,
      ),
      h('div', { class: 'st-row__slider' }, prev, viewport, next),
    )
  })

  /* -------------------------------------------------------------- closing */
  const closing = promo
    ? h(
        'section',
        { class: 'st-closing', 'aria-labelledby': 'st-closing-title', 'data-aixc-item': promo.id, 'data-section-type': 'closing-promotion' },
        h(
          'div',
          { class: 'st-closing__text' },
          h('h2', { class: 'st-closing__title', id: 'st-closing-title' }, promo.title),
          promo.lead ? h('p', { class: 'st-closing__lead' }, promo.lead) : null,
          promo.description ? h('p', { class: 'st-closing__desc' }, promo.description) : null,
          promo.stores?.length
            ? h(
                'div',
                { class: 'st-closing__stores' },
                promo.storesLabel ? h('p', null, promo.storesLabel) : null,
                h('ul', null, promo.stores.map((store) => h('li', null, h('a', { href: store.href, target: '_blank', rel: 'noopener noreferrer', 'aria-label': `${store.label} (opens in a new tab)` }, svgIcon(store.icon, 'st-closing__store'))))),
              )
            : null,
        ),
        promo.qr?.image?.src
          ? h('figure', { class: 'st-closing__qr' }, h('img', { src: promo.qr.image.src, alt: 'QR code to download the Ana Vodafone app', width: 330, height: 330, loading: 'lazy', decoding: 'async' }), promo.qr.title ? h('figcaption', null, promo.qr.title) : null)
          : null,
      )
    : null

  /* ---------------------------------------------------------------- intro */
  const introLogo = h(
    'div',
    { class: 'st-intro__logo' },
    wordmark('st-intro__depth'),
    wordmark('st-intro__white'),
    wordmark('st-intro__glow'),
    wordmark('st-intro__red'),
  )
  const curtain = h('div', { class: 'st-intro__curtain' })
  const intro = h('div', { class: 'st-intro', 'aria-hidden': 'true' }, curtain, introLogo)
  const skip = h('button', { type: 'button', class: 'st-skip' }, 'Skip intro')

  const root = experienceRoot(
    'streaming',
    schema,
    h('span', { id: 'st-top', class: 'st-anchor' }),
    pageHeading(index),
    navBar,
    billboard,
    h('div', { class: 'st-rows' }, rowEls),
    closing,
    modal,
    intro,
    skip,
  )

  let introPlayed = false
  let introAnimations = []
  let stopScroll = null

  const endIntro = () => {
    introAnimations.forEach((animation) => animation.finish())
  }

  const cleanupIntro = () => {
    introAnimations = []
    intro.hidden = true
    skip.hidden = true
    brand.classList.remove('is-waiting')
    root.classList.add('is-ready')
    root.classList.remove('is-intro')
  }

  /** Content rises in behind the curtain as the logo flies to its slot. */
  const revealContent = (delay) => {
    const targets = [
      ...root.querySelectorAll('.st-nav__links li'),
      ...root.querySelectorAll('.st-billboard__info > *'),
      ...root.querySelectorAll('.st-row'),
    ]
    return targets.map((target, at) =>
      target.animate([{ opacity: 0, transform: 'translateY(18px)' }, { opacity: 1, transform: 'none' }], {
        duration: 620,
        delay: delay + Math.min(at, 12) * 55,
        easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)',
        fill: 'backwards',
      }),
    )
  }

  const playIntro = async () => {
    introPlayed = true
    if (reducedMotion() || typeof introLogo.animate !== 'function') {
      cleanupIntro()
      return
    }
    root.classList.add('is-intro')
    brand.classList.add('is-waiting')
    intro.hidden = false
    skip.hidden = false
    // Measure only once the wordmark font is in, so the landing matches exactly.
    await Promise.race([document.fonts?.ready ?? Promise.resolve(), new Promise((resolve) => setTimeout(resolve, 1200))])
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    if (!root.isConnected) return

    const from = introLogo.getBoundingClientRect()
    const to = brand.querySelector('.st-word').getBoundingClientRect()
    const dx = to.left + to.width / 2 - (from.left + from.width / 2)
    const dy = to.top + to.height / 2 - (from.top + from.height / 2)
    const scale = to.width / from.width
    const timing = { duration: INTRO_MS, fill: 'both' }

    introAnimations = [
      // Slide in from the right, settle, push toward the camera, then fly to the bar.
      introLogo.animate(
        [
          { offset: 0, transform: 'translate3d(9%, 0, 0) scale(0.84)', easing: 'cubic-bezier(0.16, 1, 0.3, 1)' },
          { offset: 0.16, transform: 'translate3d(0, 0, 0) scale(0.94)', easing: 'ease-in-out' },
          { offset: 0.44, transform: 'translate3d(0, 0, 0) scale(1)', easing: 'cubic-bezier(0.3, 0, 0.2, 1)' },
          { offset: 0.56, transform: 'translate3d(0, 0, 0) scale(1.16)', easing: 'ease-out' },
          { offset: 0.64, transform: 'translate3d(0, 0, 0) scale(1.12)', easing: 'cubic-bezier(0.65, 0, 0.2, 1)' },
          { offset: 1, transform: `translate3d(${dx.toFixed(1)}px, ${dy.toFixed(1)}px, 0) scale(${scale.toFixed(4)})` },
        ],
        timing,
      ),
      // White with a long extruded shadow, flashing to red as the depth collapses.
      introLogo.querySelector('.st-intro__white').animate(
        [{ offset: 0, opacity: 0 }, { offset: 0.07, opacity: 1 }, { offset: 0.3, opacity: 1 }, { offset: 0.4, opacity: 0 }, { offset: 1, opacity: 0 }],
        timing,
      ),
      introLogo.querySelector('.st-intro__depth').animate(
        [
          { offset: 0, opacity: 0, transform: 'translate3d(0, 0, 0)' },
          { offset: 0.07, opacity: 1, transform: 'translate3d(0, 0, 0)' },
          { offset: 0.3, opacity: 1, transform: 'translate3d(0, 0, 0)' },
          { offset: 0.44, opacity: 0, transform: 'translate3d(-1.5%, -3%, 0)' },
          { offset: 1, opacity: 0, transform: 'translate3d(-1.5%, -3%, 0)' },
        ],
        timing,
      ),
      introLogo.querySelector('.st-intro__red').animate(
        [{ offset: 0, opacity: 0 }, { offset: 0.3, opacity: 0 }, { offset: 0.4, opacity: 1 }, { offset: 1, opacity: 1 }],
        timing,
      ),
      // A red bloom on the push toward the camera.
      introLogo.querySelector('.st-intro__glow').animate(
        [{ offset: 0, opacity: 0 }, { offset: 0.44, opacity: 0 }, { offset: 0.54, opacity: 0.85 }, { offset: 0.66, opacity: 0 }, { offset: 1, opacity: 0 }],
        timing,
      ),
      curtain.animate([{ offset: 0, opacity: 1 }, { offset: 0.66, opacity: 1 }, { offset: 0.94, opacity: 0 }, { offset: 1, opacity: 0 }], timing),
      skip.animate([{ offset: 0, opacity: 0 }, { offset: 0.1, opacity: 1 }, { offset: 0.8, opacity: 1 }, { offset: 1, opacity: 0 }], timing),
      ...revealContent(INTRO_MS * 0.66),
    ]
    await introAnimations[0].finished.catch(() => {})
    await Promise.all(introAnimations.map((animation) => animation.finished.catch(() => {})))
    cleanupIntro()
  }

  skip.addEventListener('click', () => {
    endIntro()
    brand.focus({ preventScroll: true })
  })

  const updateNav = () => {
    const stuck = root.getBoundingClientRect().top < chromeOffset() - 4
    navBar.classList.toggle('is-solid', stuck)
  }

  intro.hidden = true
  skip.hidden = true

  return {
    element: root,
    mount() {
      sliders.forEach((layout) => layout())
      window.addEventListener('resize', onResize)
      stopScroll = onScrollFrame(updateNav)
      if (!introPlayed) playIntro()
    },
    unmount() {
      window.removeEventListener('resize', onResize)
      stopScroll?.()
      stopScroll = null
      endIntro()
      if (modal.open) modal.close()
    },
  }

  function onResize() {
    sliders.forEach((layout) => layout())
  }
}
