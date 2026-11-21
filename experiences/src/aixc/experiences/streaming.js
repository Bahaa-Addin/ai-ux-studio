/**
 * Streaming showcase — rebuilt from the author's own pen "Flix"
 * (codepen.io/Bahaa-Addin/pen/YayLbo), in the design language of a streaming home.
 *
 * Opening: the VODAFONE wordmark (Roboto 900, the pen's font) rises from the
 * bottom of the screen, white, leaving its long extruded shadow stretched out
 * behind it; as it reaches the centre the shadow catches up and snaps onto it;
 * the shadow folds into the letters in a red flash; the logo pushes toward the
 * camera, then flies into its slot in the experience's top bar as the curtain
 * lifts and the billboard copy rises (timeline: T, below). The pen this grew
 * from animated font-size and a 100-layer text-shadow, which stutters; here
 * every move is a transform or an opacity on the compositor (the red is a
 * clip-path sweep), and the shadow is a stack of slabs that move on their own.
 *
 * Below: a billboard for the lead service, then one row per category with paged
 * sliders and cards that expand on hover/focus, a preview modal (native <dialog>)
 * for details and "Explore all", and the app promotion as a dark closing band.
 * "Skip intro" ends the opening; reduced motion skips it entirely.
 *
 * On Vodafone's pages (voice-guide ADR-0076; a scroller configured) it scrolls in the box through the seam: the opening
 * covers the box's room and ends on the box's scroll; the wordmark is in Vodafone's bold face (no Roboto, nothing asked
 * of Google: wordmarkFont() does nothing there); the preview opens in the box, never in the top layer (view-dialog.js);
 * what passes a bottom corner's safe zone takes no press while there and what the box's sides cut is inert (fence());
 * reveal(itemId) brings an item into view.
 */

import { h, pathIcon, svgIcon, visuallyHidden } from '../dom.js'
import {
  ICON_NEXT, ICON_PREV, clamp, experienceRoot, externalLink, frame, groupsOf, later, media, on, onScrollFrame,
  onViewResize, onViewScroll, onViewZones, pageHeading, promotionOf, reducedMotion, scrollByY, scrollTop, scrollToY,
  sidewaysSwipe, t, viewScroller, viewTop, words,
} from './shared.js'
import { viewDialog } from './view-dialog.js'

const WORD = 'VODAFONE'

/**
 * The opening, in ms from its start. One lead (the wordmark) and everything
 * else hung on its moments:
 *   rise    the lockup comes up from below the bottom edge to the centre, white;
 *           its shadow is left behind, stretching out below it as it climbs
 *   catch   as the lockup settles in the centre, the shadow snaps up onto it
 *           (a short hold follows, the 3D wordmark at rest)
 *   fold    the shadow folds into the letters while red sweeps across them,
 *           with a flash: the bloom spikes and decays
 *   push    a push toward the camera on the red, then a settle
 *   fly     it flies to its slot in the top bar while the curtain lifts
 *   reveal  the billboard copy rises once the logo is clear of it (no crossing)
 */
const T = {
  rise: 0,
  riseMs: 800,
  catch: 660, // the rise is 99% done here: the shadow lands as the lockup does
  catchMs: 280,
  fold: 1320,
  foldMs: 320,
  wipe: 1420,
  wipeMs: 200,
  flash: 1540, // peaks 12% in, at 1602: as the red lands
  flashMs: 520,
  push: 1700,
  pushMs: 360,
  settleMs: 200,
  fly: 2260,
  flyMs: 940,
  reveal: 2980,
}
const EASE_OUT = 'cubic-bezier(0.16, 1, 0.3, 1)'
/** The rise: fast off the bottom, easing into the centre. */
const RISE_EASE = 'cubic-bezier(0.3, 0.7, 0.2, 1)'
/** The catch: the stretched shadow whips up and lands on the letters, pressing in a little before it rests. */
const CATCH_EASE = 'cubic-bezier(0.5, 0, 0.15, 1.18)'
const FOLD_EASE = 'cubic-bezier(0.6, 0, 0.3, 1)'

/**
 * The pen's long shadow (100 layers at 45°), as a stack of slabs that can move:
 * each is a copy of the lockup carrying one slice of the extrusion in 0.01em
 * steps (about a pixel, so the edges stay smooth), set one slice further along
 * the diagonal than the last. Greys run light to dark with depth.
 */
const DEPTH_EM = 0.96
const DEPTH_STEP = 0.01
/**
 * Slabs: as many as a texture budget allows (each is a composited copy of the
 * lockup, sized like .st-intro__logo's font-size clamp), from 10 (slices of
 * ~0.1em, still continuous) to 24. Touch devices get the tighter budget.
 */
const depthLayerCount = () => {
  const fontPx = Math.min(200, Math.max(40, window.innerWidth * 0.125))
  const dpr = window.devicePixelRatio || 1
  const slabBytes = 6.2 * fontPx * 1.45 * fontPx * 4 * dpr * dpr
  const budget = (window.matchMedia('(hover: hover)').matches ? 96 : 32) * 1024 * 1024
  return Math.max(10, Math.min(24, Math.floor(budget / slabBytes)))
}
/** The shadow's angle at rest, y over x (the pen's steepens to 1.5). */
const DEPTH_LEAN = 1.3
/**
 * How far the shadow stretches behind the rising lockup, as a multiple of the
 * stack's own height: enough to run to the bottom edge of the intro where the
 * type is small, at least 1.8× (it runs off the edge) where the type is large.
 */
const STRETCH_MIN = 1.8
const STRETCH_MAX = 2.6
const depthGrey = (at) => {
  const v = Math.round(0xb4 + (0x3a - 0xb4) * Math.min(1, at)).toString(16).padStart(2, '0')
  return `#${v}${v}${v}`
}
const ICON_PLAY = 'M8 5.14v13.72L19 12z'
const ICON_INFO = 'M11 7h2v2h-2zm0 4h2v6h-2zm1-9a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16z'
const ICON_CLOSE = 'M18.3 7.1 16.9 5.7 12 10.6 7.1 5.7 5.7 7.1l4.9 4.9-4.9 4.9 1.4 1.4 4.9-4.9 4.9 4.9 1.4-1.4-4.9-4.9z'
const NEW_TAB = () => ` ${t('(opens in a new tab)')}`

const domainOf = (href) => {
  try {
    return new URL(href).hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}

/* The Vodafone mark, from the page's own icon sprite (src/shell.js, icon-vodafone-logo). */
const MARK_DISC = 'M47.95 23.952a23.993 23.993 0 0 1-24 24 23.907 23.907 0 0 1-23.9-24 23.886 23.886 0 0 1 23.9-23.9 23.972 23.972 0 0 1 24 23.9'
const MARK_GLYPH = 'M37.877 25.142a13.023 13.023 0 0 1-13.222 12.822c-8.051 0-13.536-7.04-13.395-14.929 0-11.532 9.626-20.867 21.519-20.867q.743 0 1.472.049c-4.245 2.056-7.143 5.907-7.288 10.353a12.92 12.92 0 0 1 10.914 12.572'
const SVG_NS = 'http://www.w3.org/2000/svg'
const svgEl = (tag, attributes = {}) => {
  const node = document.createElementNS(SVG_NS, tag)
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, String(value))
  return node
}

/**
 * The mark as recolourable SVG: disc and speech mark take CSS colours, so the
 * intro can show it white, grey (in the shadow slabs) and red.
 */
const markSvg = () => {
  const svg = svgEl('svg', { class: 'st-mark', viewBox: '0 0 48 48', overflow: 'visible', 'aria-hidden': 'true', focusable: 'false' })
  svg.append(svgEl('path', { class: 'st-mark__disc', d: MARK_DISC, 'fill-rule': 'evenodd' }), svgEl('path', { class: 'st-mark__glyph', d: MARK_GLYPH, 'fill-rule': 'evenodd' }))
  return svg
}

/**
 * The lockup: Vodafone mark + VODAFONE, always built and animated as one element.
 * The lockup is a Latin wordmark: it stays left to right on the Arabic page too
 * (its letters are separate flex items, which a right-to-left flex row would reverse).
 */
const wordmark = (className) => {
  const lockup = h('span', { class: `st-word vx-ltr ${className}`, dir: 'ltr', 'aria-hidden': 'true' }, markSvg())
  const letters = h('span', { class: 'st-word__letters' }, [...WORD].map((char) => h('span', { class: 'st-word__l' }, char)))
  lockup.append(letters)
  return lockup
}

/**
 * Roboto 900 is used by nothing else on the page, so it is only fetched when first
 * asked for. Waiting for just this face (not fonts.ready, which also waits for every
 * other font the new page pulls in) and fetching it early keeps the curtain from
 * sitting empty before the intro: about a third of a second on a first visit.
 * On Vodafone's pages (a scroller) nothing: the wordmark is in Vodafone's bold face there (streaming.css's box rules),
 * and nothing of ours asks Google for a font (voice-guide AGENTS.md §4.8).
 */
let wordmarkFontLoad = null
const wordmarkFont = () => {
  if (viewScroller()) return Promise.resolve()
  wordmarkFontLoad ??=document.fonts?.load ? document.fonts.load('900 64px Roboto', WORD).catch(() => {}) : Promise.resolve()
  return wordmarkFontLoad
}

/** Called when the composer opens: starts fetching the wordmark font while the user chooses. */
export const warmStreaming = () => {
  wordmarkFont()
}

const circleButton = (icon, label, extraClass = '') =>
  h('button', { type: 'button', class: `st-circle ${extraClass}`.trim(), 'aria-label': label }, pathIcon(icon, ''))

const circleLink = (href, icon, label) =>
  h('a', { class: 'st-circle st-circle--primary', href, target: '_blank', rel: 'noopener noreferrer', 'aria-label': `${label}${NEW_TAB()}` }, pathIcon(icon, ''))

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

  // In a box (Vodafone's pages): the view scrolls in it, the preview opens in it (below), what a bottom corner's zone
  // covers takes no press and what the box's sides cut is inert (fence()). Without one (the clone) all as before.
  const boxed = Boolean(viewScroller())
  /** Each press the view handles, [element, handler]: added on mount through the seam and taken off on unmount. */
  const presses = []
  const onPress = (element, handler) => presses.push([element, handler])
  /** The rows' focusin handlers, [track, handler], and their sideways swipes (each a start that returns its off). */
  const onFocus = []
  const swipes = []

  /* ---------------------------------------------------------------- modal */
  const modalBody = h('div', { class: 'st-modal__content' })
  const modalClose = h('button', { type: 'button', class: 'st-modal__close', 'aria-label': t('Close') }, pathIcon(ICON_CLOSE, ''))
  // In a box the dialog is the box's room (its backdrop) and a panel inside it scrolls, between the corners' zones or
  // above them (streaming.css); the clone's dialog is the panel itself, in the top layer.
  const panel = boxed ? h('div', { class: 'st-modal__panel' }, modalClose, modalBody) : null
  const modal = boxed ? h('dialog', { class: 'st-modal', 'aria-labelledby': 'st-modal-title' }, panel) : h('dialog', { class: 'st-modal', 'aria-labelledby': 'st-modal-title' }, modalClose, modalBody)
  const sheet = viewDialog(modal, { onEscape: () => hideModal() })
  // The clone: showModal() through viewDialog, its own Escape and close() as before.
  const hideModal = () => (boxed ? sheet.close() : modal.close())
  onPress(modalClose, () => hideModal())
  onPress(modal, (event) => {
    if (event.target === modal) hideModal() // backdrop
  })
  /** The "More in" cards the preview shows now, by button: one press handler on the preview's body reads them. */
  const smallItems = new WeakMap()
  onPress(modalBody, (event) => {
    const card = event.target.closest?.('.st-more__card')
    if (card && smallItems.has(card)) openItem(smallItems.get(card))
  })

  const groupOf = (item) => groups.find((group) => group.items.includes(item)) ?? null

  const smallCard = (item) => {
    const button = h(
      'button',
      { type: 'button', class: 'st-more__card', 'aria-label': t('More info: {title}', { title: item.title }) },
      media(item, { className: 'st-more__media' }),
      h('span', { class: 'st-more__title' }, item.title),
      item.description ? h('span', { class: 'st-more__desc' }, item.description) : null,
    )
    smallItems.set(button, item)
    return button
  }

  /** Shows the preview (`from` gets the focus back when it closes), at its top, the focus on its close button. */
  const showModal = (from) => {
    sheet.open(from ?? document.activeElement)
    ;(panel ?? modal).scrollTop = 0
    if (boxed) modalClose.focus({ preventScroll: true })
    else modalClose.focus()
    scheduleFence()
  }

  const primaryAction = (item, { large = false } = {}) => {
    const { label, href } = item.cta ?? {}
    const text = label ?? words('View service')
    if (href) {
      return h(
        'a',
        { class: `st-btn st-btn--play${large ? ' st-btn--large' : ''}`, href, target: '_blank', rel: 'noopener noreferrer' },
        pathIcon(ICON_PLAY, 'st-btn__icon'),
        h('span', null, text),
        visuallyHidden(NEW_TAB()),
      )
    }
    // The source shows this label without a destination; show it as information.
    return label ? h('span', { class: 'st-tag' }, label) : null
  }

  const openItem = (item, from) => {
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
          group ? h('div', null, h('dt', null, t('Category')), h('dd', null, group.title)) : null,
          h('div', null, h('dt', null, t('Link')), h('dd', null, domain ? h('bdi', null, domain) : t('None on the source page'))),
        ),
      ),
      siblings.length
        ? h('section', { class: 'st-more', 'aria-labelledby': 'st-more-title' }, h('h3', { class: 'st-more__heading', id: 'st-more-title' }, t('More in {category}', { category: group.title })), h('div', { class: 'st-more__grid' }, siblings.map(smallCard)))
        : null,
    )
    showModal(from)
  }

  const openGroup = (group, from) => {
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
    showModal(from)
  }

  /* ------------------------------------------------------------ top bar */
  // Scroll targets in the view's coordinates (the box's, or the page's): an element's top under the bar.
  const yOf = (element) => element.getBoundingClientRect().top - viewTop() + scrollTop()
  const brand = h('a', { class: 'st-brand', href: '#st-top', 'aria-label': t('Vodafone, back to the top') }, wordmark('st-brand__word'))
  const navLinks = rows.map((row) => {
    const link = h('a', { class: 'st-nav__link', href: `#st-row-${row.group.id}` }, row.group.title)
    onPress(link, (event) => {
      event.preventDefault()
      const target = root.querySelector(`#st-row-${row.group.id}`)
      scrollToY(yOf(target) - navBar.offsetHeight)
      target.querySelector('.st-row__title')?.focus({ preventScroll: true })
    })
    return link
  })
  const homeLink = h('a', { class: 'st-nav__link is-current', href: '#st-top', 'aria-current': 'page' }, t('Home'))
  const backToTop = (event) => {
    event.preventDefault()
    scrollToY(yOf(root))
  }
  onPress(homeLink, backToTop)
  onPress(brand, backToTop)
  const navList = h('ul', { class: 'st-nav__links' }, [homeLink, ...navLinks].map((link) => h('li', null, link)))
  const navBar = h('nav', { class: 'st-nav', 'aria-label': t('Streaming showcase') }, brand, navList)

  /* ------------------------------------------------------------ billboard */
  let billboard = null
  if (featured) {
    const titleArt = featured.image?.fit === 'contain' && featured.image?.src
      ? h('img', { class: 'st-billboard__art', src: featured.image.src, alt: '', width: featured.image.width, height: featured.image.height })
      : null
    const moreInfo = h('button', { type: 'button', class: 'st-btn st-btn--info' }, pathIcon(ICON_INFO, 'st-btn__icon'), h('span', null, t('More info')))
    onPress(moreInfo, () => openItem(featured, moreInfo))
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
  /** Where each row card is, by item id: its card and how to bring it onto its row's page (reveal). */
  const cardsById = new Map()
  /** Each row's parts the fence reads and listens to. */
  const viewports = []
  const tracks = []
  const rowCards = []
  const rowEls = rows.map((row) => {
    const titleId = `st-row-title-${row.group.id}`
    const exploreButton = h('button', { type: 'button', class: 'st-row__explore' }, h('span', null, t('Explore all')), pathIcon(ICON_NEXT, ''))
    onPress(exploreButton, () => openGroup(row.group, exploreButton))

    const cards = row.items.map((item) => {
      const open = h(
        'button',
        { type: 'button', class: 'st-card__open', 'aria-label': t('More info: {title}', { title: item.title }) },
        media(item, { className: 'st-card__media' }),
        h('span', { class: 'st-card__label', 'aria-hidden': 'true' }, item.title),
      )
      onPress(open, () => openItem(item, open))
      const info = circleButton(ICON_INFO, t('More info: {title}', { title: item.title }), 'st-circle--ghost')
      onPress(info, () => openItem(item, info))
      const action = item.cta?.href ? circleLink(item.cta.href, ICON_PLAY, item.cta.label ?? t('View {title}', { title: item.title })) : null
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
    const prev = h('button', { type: 'button', class: 'st-row__arrow st-row__arrow--prev', 'aria-label': t('Previous {title}', { title: row.group.title }) }, pathIcon(ICON_PREV, ''))
    const next = h('button', { type: 'button', class: 'st-row__arrow st-row__arrow--next', 'aria-label': t('Next {title}', { title: row.group.title }) }, pathIcon(ICON_NEXT, ''))
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
      scheduleFence()
    }
    onPress(prev, () => {
      slider.page -= 1
      layout()
    })
    onPress(next, () => {
      slider.page += 1
      layout()
    })
    // Keyboard users tabbing past the visible cards page the row along with them.
    onFocus.push([track, (event) => {
      const card = event.target.closest('.st-card')
      const at = cards.indexOf(card)
      // In a box not where the row scrolls natively (phones): there a press on a card scrolled into view focuses it, and
      // paging back to the row's start under the press took the click from it.
      if (at < 0 || !card.classList.contains('is-offpage') || (boxed && getComputedStyle(viewport).overflowX === 'auto')) return
      slider.page = Math.floor(at / slider.per)
      layout()
      viewport.scrollLeft = 0
    }])
    // A sideways swipe pages the row along the reading line. Where the row
    // scrolls natively (touch, narrow screens) the browser keeps the gesture.
    swipes.push(() => sidewaysSwipe(viewport, (direction) => {
      const page = clamp(slider.page + direction, 0, slider.pages - 1)
      if (page === slider.page) return
      slider.page = page
      layout()
    }, { enabled: () => getComputedStyle(viewport).overflowX !== 'auto' }))
    sliders.push(layout)
    // reveal(): the card onto its row's page at once (paged), or the row scrolled to it (a row that scrolls natively).
    cards.forEach((card, at) =>
      cardsById.set(card.dataset.aixcItem, {
        card,
        show() {
          if (getComputedStyle(viewport).overflowX === 'auto') {
            const v = viewport.getBoundingClientRect()
            const c = card.getBoundingClientRect()
            viewport.scrollBy({ left: getComputedStyle(viewport).direction === 'rtl' ? c.right - v.right : c.left - v.left, behavior: 'instant' })
            return
          }
          slider.page = Math.floor(at / slider.per)
          track.style.transition = 'none'
          layout()
          void track.offsetWidth
          track.style.transition = ''
        },
      }),
    )
    viewports.push(viewport)
    tracks.push(track)
    rowCards.push(...cards)

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
                h('ul', null, promo.stores.map((store) => h('li', null, h('a', { href: store.href, target: '_blank', rel: 'noopener noreferrer', 'aria-label': `${store.label}${NEW_TAB()}` }, svgIcon(store.icon, 'st-closing__store'))))),
              )
            : null,
        ),
        promo.qr?.image?.src
          ? h('figure', { class: 'st-closing__qr' }, h('img', { src: promo.qr.image.src, alt: t('QR code to download the Ana Vodafone app'), width: 330, height: 330, loading: 'lazy', decoding: 'async' }), promo.qr.title ? h('figcaption', null, promo.qr.title) : null)
          : null,
      )
    : null

  /* ---------------------------------------------------------------- intro */
  // The shadow: slab k sits k slices down the diagonal and paints its own slice of
  // the extrusion (its glyphs in that depth's grey, a few 0.01em text-shadow steps
  // behind them). Its disc is a plain grey disc; the stacked discs make the mark's
  // band at whatever angle the stack leans to.
  const depthCount = depthLayerCount()
  const depthSlice = DEPTH_EM / depthCount
  const depthLayers = Array.from({ length: depthCount }, (_, k) => {
    const start = k * depthSlice
    const layer = wordmark('st-intro__depth')
    const grey = depthGrey(start / DEPTH_EM)
    layer.style.color = grey
    layer.style.setProperty('--st-mark-disc', grey)
    layer.style.setProperty('--st-mark-glyph', grey)
    const steps = Math.max(1, Math.round(depthSlice / DEPTH_STEP))
    // The steps run at the stack's own lean, so slab meets slab without a jog.
    layer.style.textShadow = Array.from({ length: steps }, (_, i) => {
      const d = (i + 1) * DEPTH_STEP
      return `${d.toFixed(2)}em ${(d * DEPTH_LEAN).toFixed(3)}em 0 ${depthGrey((start + d) / DEPTH_EM)}`
    }).join(', ')
    layer.style.transform = `translate3d(${start.toFixed(3)}em, ${(start * DEPTH_LEAN).toFixed(3)}em, 0)`
    layer.dataset.depth = start.toFixed(3)
    return layer
  })
  // Farthest slab first, so the nearest paints on top; the faces go above them all.
  const depthStack = h('div', { class: 'st-intro__depth-stack' }, [...depthLayers].reverse())
  const whiteLayer = wordmark('st-intro__white')
  const glowLayer = wordmark('st-intro__glow')
  const redLayer = wordmark('st-intro__red')
  // Each face sits in a box that carries a fixed slanted clip (wipe): the sweep moves
  // the box and counter-moves the face, so the clip edge travels and nothing repaints.
  const whiteClip = h('div', { class: 'st-intro__clip' }, whiteLayer)
  const redClip = h('div', { class: 'st-intro__clip' }, redLayer)
  // Two nested boxes so two motions never fight over one transform: the stage
  // rises from the bottom; the logo around it pushes and flies.
  // The glow sits under the faces: it halos the letters without tinting the white
  // ones pink while the red is still sweeping in.
  const introStage = h('div', { class: 'st-intro__stage' }, depthStack, glowLayer, whiteClip, redClip)
  const introLogo = h('div', { class: 'st-intro__logo' }, introStage)
  const curtain = h('div', { class: 'st-intro__curtain' })
  const intro = h('div', { class: 'st-intro', 'aria-hidden': 'true' }, curtain, introLogo)
  const skip = h('button', { type: 'button', class: 'st-skip' }, t('Skip intro'))

  const root = experienceRoot(
    'streaming',
    schema,
    h('span', { id: 'st-top', class: 'st-anchor' }),
    pageHeading(index),
    skip, // the first Tab stop after the heading (fixed in place, so order is only for focus)
    navBar,
    billboard,
    h('div', { class: 'st-rows' }, rowEls),
    closing,
    modal,
    intro,
  )

  let introPlayed = false
  let introAnimations = []
  let skipRequested = false

  // "Skip intro", a click on the curtain, a scroll, a touch drag or a key ends the
  // intro at its final frame. A request made while the intro still waits for the
  // wordmark font is kept and ends it as soon as it starts.
  const endIntro = () => {
    skipRequested = true
    introAnimations.forEach((animation) => animation.finish())
  }
  const PASSIVE_KEYS = new Set(['Tab', 'Shift', 'Control', 'Alt', 'Meta', 'CapsLock'])
  /** Wheel travel (px) before a scroll counts as a skip: a trackpad still coasting from the composer's list stays under it. */
  const WHEEL_SKIP_PX = 80
  let introStartedAt = 0
  let introWidth = 0
  let introScrollY = 0
  let wheelTravel = 0
  /** True for an event that was already in flight when the opening began: the Enter that submitted the composer's prompt (which mounts this experience) is not a request to skip it. */
  const predatesIntro = (event) => event.timeStamp <= introStartedAt
  const onInterrupt = (event) => {
    if (predatesIntro(event)) return
    if (event.type === 'keydown' && (event.repeat || PASSIVE_KEYS.has(event.key))) return
    endIntro()
  }
  // Over the curtain: short wheel travel is swallowed (the page must not move under
  // the curtain, or the landing it was measured for goes stale); past the threshold
  // it is a skip, and the scroll goes through.
  const onWheel = (event) => {
    if (predatesIntro(event)) return
    wheelTravel += Math.abs(event.deltaY) + Math.abs(event.deltaX)
    if (wheelTravel < WHEEL_SKIP_PX) event.preventDefault()
    else endIntro()
  }
  // Anything else that moves the view (the scrollbar, a wheel over the site header, a script): the page's scroll, or
  // in a box the box's.
  const onScroll = () => {
    if (scrollTop() !== introScrollY) endIntro()
  }
  let interruptOffs = []
  const listenForInterrupt = (start) => {
    for (const off of interruptOffs.splice(0)) off()
    if (!start) return
    interruptOffs = [
      on(window, 'touchmove', onInterrupt, { passive: true }),
      on(window, 'keydown', onInterrupt, { passive: true }),
      onViewScroll(onScroll),
      on(curtain, 'wheel', onWheel, { passive: false }),
      // click, not pointerdown: a tap's click must still find the curtain, not what lies under it.
      on(curtain, 'click', onInterrupt),
    ]
  }
  /** The opening's waits (its font's timeout, its frames): undone with the view in a box. */
  const introWaits = new Set()
  const wait = (start) =>
    new Promise((resolve) => {
      const cancel = start(() => {
        introWaits.delete(cancel)
        resolve()
      })
      introWaits.add(cancel)
    })
  const stopWaits = () => {
    for (const cancel of introWaits) cancel()
    introWaits.clear()
  }

  /** Skip leaves once there is nothing left to skip, passing keyboard focus to the brand it would have. */
  const retireSkip = () => {
    const focused = document.activeElement === skip
    skip.hidden = true
    if (focused) brand.focus({ preventScroll: true })
  }

  /** The logo has landed: the real brand link takes over and the overlay goes. */
  const handOff = () => {
    brand.classList.remove('is-waiting')
    intro.hidden = true
    retireSkip()
  }

  const cleanupIntro = () => {
    introAnimations = []
    listenForInterrupt(false)
    handOff()
    root.classList.add('is-ready')
    root.classList.remove('is-intro', 'is-fallback-face')
  }

  /** A moment on the intro's clock with no visuals of its own; finish() still resolves it. */
  const cue = (at) => new Animation(new KeyframeEffect(null, [], { duration: at }), document.timeline)

  /** Rise into place: opacity plus a short lift, the distance set by importance. */
  const rise = (target, { delay, distance, duration }) =>
    target?.animate([{ opacity: 0, transform: `translateY(${distance}px)` }, { opacity: 1, transform: 'none' }], {
      delay,
      duration,
      easing: EASE_OUT,
      fill: 'backwards',
    })

  /**
   * The page behind the curtain. The billboard's photo and the rows below are
   * simply uncovered by the curtain; only the copy moves, and only once the
   * flying logo has passed above it. The bar's links appear as the logo lands.
   * Created when the curtain starts to lift (T.fly), so the copy is not held
   * composited while the shadow stack needs the memory; until then the is-intro
   * class keeps it invisible. Delays are from that moment.
   */
  const revealContent = () => {
    const info = root.querySelector('.st-billboard__info')
    const pick = (selector) => info?.querySelector(selector) ?? null
    const at = T.reveal - T.fly
    return [
      rise(pick('.st-badge'), { delay: at, distance: 12, duration: 640 }),
      rise(pick('.st-billboard__art'), { delay: at, distance: 18, duration: 700 }),
      rise(pick('.st-billboard__title'), { delay: at + 60, distance: 24, duration: 720 }),
      rise(pick('.st-billboard__synopsis'), { delay: at + 110, distance: 14, duration: 640 }),
      rise(pick('.st-billboard__actions'), { delay: at + 150, distance: 10, duration: 600 }),
      root.querySelector('.st-nav__links')?.animate([{ opacity: 0 }, { opacity: 1 }], {
        delay: T.flyMs - 200,
        duration: 360,
        easing: 'ease-out',
        fill: 'backwards',
      }),
    ].filter(Boolean)
  }

  /**
   * The red sweep: each face sits in a box with a fixed clip whose edge leans at
   * 45°, the shadow's direction, so a letter turns red as one piece from its face
   * back. The sweep slides the box along the lockup and slides the face inside it
   * the other way, so the letters stay put while the clip edge travels: nothing is
   * repainted. The lockup is Latin and always left to right, so the red starts at
   * the mark on the Arabic page too. Polygons reach past the box (in em) for the
   * taller edge letters.
   */
  const wipe = ({ fontPx, width }) => {
    const TOP = -0.5 // em, above the tallest (edge) letters
    const BOTTOM = 2 // em, below the shadow's end
    // Points (x, y) on the edge satisfy x - y = c, with c = `pct`% + `em`em of the box.
    const at = (pct, em, y) => `calc(${pct}% + ${(em + y).toFixed(2)}em) ${y}em`
    const before = ({ pct, em }) => `polygon(-1em ${TOP}em, ${at(pct, em, TOP)}, ${at(pct, em, BOTTOM)}, -1em ${BOTTOM}em)`
    const after = ({ pct, em }) =>
      `polygon(${at(pct, em, TOP)}, calc(100% + 1em) ${TOP}em, calc(100% + 1em) ${BOTTOM}em, ${at(pct, em, BOTTOM)})`
    // Edge positions clear of every letter at either end, and the distance between them.
    const start = { pct: 0, em: -1.5 }
    const end = { pct: 100, em: 0.5 }
    const travel = width + 2 * fontPx
    // Red keeps what lies before the end edge, white what lies after the start edge:
    // at rest each shows the whole lockup; offset by the travel, nothing.
    redClip.style.clipPath = before(end)
    whiteClip.style.clipPath = after(start)
    const slide = (px) => `translate3d(${px.toFixed(1)}px, 0, 0)`
    const timing = { delay: T.wipe, duration: T.wipeMs, easing: 'cubic-bezier(0.65, 0, 0.35, 1)', fill: 'both' }
    return [
      redClip.animate([{ transform: slide(-travel) }, { transform: slide(0) }], timing),
      redLayer.animate([{ transform: slide(travel) }, { transform: slide(0) }], timing),
      whiteClip.animate([{ transform: slide(0) }, { transform: slide(travel) }], timing),
      whiteLayer.animate([{ transform: slide(0) }, { transform: slide(-travel) }], timing),
    ]
  }

  /**
   * The shadow's motion. The stack as a whole stretches down behind the rising
   * lockup (a scaleY anchored at the letters, on the lockup's own easing, so the
   * shadow is left behind in proportion to the climb) and whips back onto it at
   * the catch. Then each slab, in px of this run, slides onto the letters at the
   * fold so the extrusion shortens into nothing; the stack fades over its last
   * stretch, where only the slabs' own few steps would be left peeking past the red.
   */
  const shadowMotion = ({ fontPx, stretch }) => {
    const end = T.fold + T.foldMs
    const catchEnd = T.catch + T.catchMs
    const slide = (x, y) => `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0)`
    const slabs = depthLayers.map((layer) => {
      const start = Number(layer.dataset.depth) * fontPx
      const [bx, by] = [start, start * DEPTH_LEAN]
      return layer.animate(
        [
          { offset: 0, transform: slide(bx, by) },
          { offset: T.fold / end, transform: slide(bx, by), easing: FOLD_EASE },
          { offset: 1, transform: slide(0, 0) },
        ],
        { duration: end, fill: 'both' },
      )
    })
    const stretched = depthStack.animate(
      [
        { offset: 0, transform: 'scaleY(1)', easing: RISE_EASE },
        { offset: T.catch / catchEnd, transform: `scaleY(${stretch.toFixed(3)})`, easing: CATCH_EASE },
        { offset: 1, transform: 'scaleY(1)' },
      ],
      { duration: catchEnd, fill: 'both' },
    )
    const fade = depthStack.animate([{ opacity: 1 }, { opacity: 0 }], { delay: end - 150, duration: 170, easing: 'ease-in', fill: 'both' })
    return [...slabs, stretched, fade]
  }

  const playIntro = async () => {
    introPlayed = true
    const canAnimate = typeof introLogo.animate === 'function' && typeof KeyframeEffect === 'function' && typeof Animation === 'function'
    if (reducedMotion() || !canAnimate) {
      cleanupIntro()
      return
    }
    root.classList.add('is-intro')
    brand.classList.add('is-waiting')
    intro.hidden = false
    skip.hidden = false
    // The lockup waits just below the bottom edge of the intro (it sits in its centre):
    // out of sight, but close enough that its layers raster before the first frame.
    const riseFrom = intro.getBoundingClientRect().height / 2 + introLogo.getBoundingClientRect().height / 2 + 24
    introStage.style.transform = `translate3d(0, ${riseFrom.toFixed(1)}px, 0)`
    introStartedAt = performance.now()
    introWidth = window.innerWidth
    introScrollY = scrollTop()
    wheelTravel = 0
    listenForInterrupt(true)
    // Measure only once the wordmark font is in, so the landing matches exactly (usually
    // already fetched: warmStreaming runs when the composer opens).
    const fontArrived = await Promise.race([wordmarkFont().then(() => true), wait((done) => later(done, 1200)).then(() => false)])
    stopWaits()
    // Still not in: pin this run to the fallback face, so a late arrival cannot reflow the
    // lockups mid-move or shift the slot they were measured against. The brand swaps once
    // the opening is over.
    if (!fontArrived) root.classList.add('is-fallback-face')
    await wait((done) => frame(() => introWaits.add(frame(done))))
    if (!root.isConnected) {
      listenForInterrupt(false)
      return
    }

    try {
      const from = introLogo.getBoundingClientRect()
      const to = brand.querySelector('.st-word').getBoundingClientRect()
      const dx = to.left + to.width / 2 - (from.left + from.width / 2)
      const dy = to.top + to.height / 2 - (from.top + from.height / 2)
      const scale = to.width / from.width
      const flightMs = T.fly + T.flyMs - T.push
      const fontPx = parseFloat(getComputedStyle(introLogo).fontSize)
      // How far the shadow can stretch: to the bottom edge where there is room, never less than STRETCH_MIN.
      const stackExtent = from.height + (DEPTH_EM * DEPTH_LEAN + 0.2) * fontPx
      const stretch = clamp((intro.getBoundingClientRect().bottom - from.top) / stackExtent, STRETCH_MIN, STRETCH_MAX)

      // The push toward the camera, its settle, then the flight (measured, so it
      // lands wherever the brand sits).
      const flight = introLogo.animate(
        [
          { offset: 0, transform: 'none', easing: 'cubic-bezier(0.2, 0, 0.1, 1)' },
          { offset: T.pushMs / flightMs, transform: 'scale(1.16)', easing: 'cubic-bezier(0.4, 0, 0.6, 1)' },
          { offset: (T.pushMs + T.settleMs) / flightMs, transform: 'scale(1.12)', easing: 'cubic-bezier(0.6, 0, 0.15, 1)' },
          { offset: 1, transform: `translate3d(${dx.toFixed(1)}px, ${dy.toFixed(1)}px, 0) scale(${scale.toFixed(4)})` },
        ],
        { id: 'st-flight', delay: T.push, duration: flightMs, fill: 'both' },
      )
      // The rise: up from below the bottom edge into the centre.
      const rise = introStage.animate(
        [{ transform: `translate3d(0, ${riseFrom.toFixed(1)}px, 0)` }, { transform: 'translate3d(0, 0, 0)' }],
        { duration: T.riseMs, easing: RISE_EASE, fill: 'both' },
      )
      const curtainLift = cue(T.fly)
      const skipFade = skip.animate([{ opacity: 0 }, { offset: 0.14, opacity: 0 }, { offset: 0.25, opacity: 1 }, { offset: 0.9, opacity: 1 }, { opacity: 0 }], {
        duration: T.fly,
        fill: 'both',
      })
      introAnimations = [
        rise,
        ...shadowMotion({ fontPx, stretch }),
        ...wipe({ fontPx, width: from.width }),
        // The flash: the bloom spikes as the red lands, then decays.
        glowLayer.animate(
          [
            { opacity: 0, easing: 'linear' },
            { offset: 0.12, opacity: 0.95, easing: 'cubic-bezier(0.2, 0.6, 0.4, 1)' },
            { opacity: 0 },
          ],
          { delay: T.flash, duration: T.flashMs, fill: 'both' },
        ),
        flight,
        curtain.animate([{ opacity: 1 }, { opacity: 0 }], { delay: T.fly, duration: 720, easing: 'cubic-bezier(0.4, 0, 0.6, 1)', fill: 'both' }),
        skipFade,
        curtainLift,
      ]
      curtainLift.play()
      // Once the curtain starts to lift: clicks reach the page; Skip has nothing left to
      // skip (a focused Skip stays visible until the brand it hands focus to is showing);
      // and the page's copy gets its animations.
      curtainLift.finished.then(() => {
        curtain.style.pointerEvents = 'none'
        if (document.activeElement === skip) {
          skipFade.cancel()
          skip.style.opacity = '1'
        } else {
          skip.hidden = true
        }
        const reveals = revealContent()
        introAnimations.push(...reveals)
        if (skipRequested) reveals.forEach((animation) => animation.finish())
      }, () => {})
      flight.finished.then(handOff, () => {})
    } catch (error) {
      // A failure here must degrade to "no opening", never to a curtain left over the page.
      introAnimations.forEach((animation) => animation.cancel())
      cleanupIntro()
      console.error('AIXC streaming: the opening was skipped', error)
      return
    }
    if (skipRequested) endIntro()
    await Promise.all(introAnimations.map((animation) => animation.finished.catch(() => {})))
    cleanupIntro()
  }

  onPress(skip, () => {
    endIntro()
    brand.focus({ preventScroll: true })
  })

  const updateNav = () => {
    const stuck = root.getBoundingClientRect().top < viewTop() - 4
    navBar.classList.toggle('is-solid', stuck)
  }

  /* ---------------------------------------------------------- in a box: the fence */
  /**
   * In a box (voice-guide ADR-0076): each link and button of the view that a bottom corner's safe zone (the box's
   * --aixc-safe-{left,right}-{w,h}) covers takes no press while there (.st-fenced: no pointer events; Tab and a screen
   * reader still reach it, and one focused there is scrolled clear first); each row card and bar link the box's left or
   * right side cuts (a page of cards off to the side, a row or the bar scrolled sideways) is inert while there. Read
   * from their rects once a frame, as the box, a row or the preview scrolls, a row pages, the zones or the box change.
   */
  let fencing = null
  let focusedNow = null
  const scheduleFence = () => {
    if (!boxed || fencing || !mounted) return
    fencing = frame(() => {
      fencing = null
      fence()
    })
  }
  const zonesNow = () => {
    const box = viewScroller()
    const style = getComputedStyle(box)
    const px = (name) => Number.parseFloat(style.getPropertyValue(`--aixc-safe-${name}`)) || 0
    const b = box.getBoundingClientRect()
    const left = b.left + box.clientLeft
    const right = left + box.clientWidth
    const bottom = b.top + box.clientTop + box.clientHeight
    const zones = [
      { left: right - px('right-w'), top: bottom - px('right-h'), right, bottom },
      { left, top: bottom - px('left-h'), right: left + px('left-w'), bottom },
    ].filter((z) => z.right > z.left && z.top < bottom)
    return { left, right, zones }
  }
  const meets = (r, z) => r.width > 0 && r.height > 0 && r.left < z.right && r.right > z.left && r.top < z.bottom && r.bottom > z.top
  const fence = () => {
    if (!boxed || !mounted) return
    let { left, right, zones } = zonesNow()
    // A focused link or button in a zone: the box scrolled so it rests above it (Tab, a screen reader's focus). Only
    // those: a row's title a bar link focuses is left alone, so the (smooth) scroll the link started runs to its row.
    const focused = focusedNow
    focusedNow = null
    if (focused?.isConnected && focused.matches('a[href], button') && root.contains(focused) && !modal.contains(focused)) {
      const r = focused.getBoundingClientRect()
      const zone = zones.find((z) => meets(r, z))
      if (zone) {
        scrollByY(r.bottom - zone.top + 12)
        ;({ left, right, zones } = zonesNow())
      }
    }
    const sides = [...navList.children, ...rowCards]
    const cut = sides.map((node) => {
      const r = node.getBoundingClientRect()
      return r.width > 0 && (r.left < left - 1 || r.right > right + 1)
    })
    const pressables = [...root.querySelectorAll('a[href], button')]
    const covered = pressables.map((node) => {
      const r = node.getBoundingClientRect()
      return zones.some((z) => meets(r, z))
    })
    sides.forEach((node, at) => {
      if (node.inert !== cut[at]) node.inert = cut[at]
    })
    pressables.forEach((node, at) => node.classList.toggle('st-fenced', covered[at]))
  }
  const onViewFocus = (event) => {
    focusedNow = event.target
    scheduleFence()
  }

  /** Everything the view listens to while it shows, through the seam: added on mount, undone on unmount (or the seam's reset). */
  const listen = () => [
    ...presses.map(([element, handler]) => on(element, 'click', handler)),
    ...onFocus.map(([element, handler]) => on(element, 'focusin', handler)),
    ...swipes.map((start) => start()),
    onViewResize(onResize),
    onScrollFrame(updateNav),
    ...(boxed
      ? [
          onViewScroll(scheduleFence),
          onViewZones(scheduleFence),
          on(root, 'focusin', onViewFocus),
          on(navList, 'scroll', scheduleFence, { passive: true }),
          on(panel, 'scroll', scheduleFence, { passive: true }),
          ...viewports.map((viewport) => on(viewport, 'scroll', scheduleFence, { passive: true })),
          ...tracks.map((track) => on(track, 'transitionend', scheduleFence)),
        ]
      : []),
  ]
  let offs = []
  let mounted = false

  intro.hidden = true
  skip.hidden = true

  return {
    element: root,
    mount() {
      mounted = true
      offs = listen()
      sliders.forEach((layout) => layout())
      if (!introPlayed) playIntro()
      scheduleFence()
    },
    unmount() {
      mounted = false
      for (const off of offs.splice(0)) off()
      fencing?.()
      fencing = null
      endIntro()
      listenForInterrupt(false) // also when it ends before the intro has started
      if (boxed) {
        // Still waiting for its first frames: no opening then (it would wait on frames the seam no longer runs).
        stopWaits()
        if (root.classList.contains('is-intro') && !introAnimations.length) cleanupIntro()
        if (modal.open) sheet.close({ focus: false })
      } else if (modal.open) modal.close()
    },
    /**
     * Brings the item of `itemId` into the view at once, its top under the bar (the experience's own bar too): the
     * billboard's, a row's card (its row paged to it, or scrolled sideways to it) or the closing band; false if the view
     * has none. The box, or the window on the clone.
     */
    reveal(itemId) {
      const card = cardsById.get(itemId)
      const target = card ? card.card : featured?.id === itemId ? root : promo?.id === itemId ? closing : null
      if (!target) return false
      endIntro()
      card?.show()
      scrollToY(target === root ? yOf(root) : yOf(target) - navBar.offsetHeight, { instant: true })
      fence()
      return true
    },
  }

  function onResize() {
    sliders.forEach((layout) => layout())
    // The opening's landing was measured for the old width: end it at its last frame. A
    // height-only change (a phone's keyboard closing after a typed prompt) moves nothing it depends on.
    if (root.classList.contains('is-intro') && window.innerWidth !== introWidth) endIntro()
  }
}
