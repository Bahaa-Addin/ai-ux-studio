/*
 * Copyright (c) jcoulterdesign (https://codepen.io/jcoulterdesign/pen/oRRRPY)
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
 * Flipbook — adapted from "Pure CSS Magazine style layout with transitions"
 * (codepen.io/jcoulterdesign/pen/oRRRPY).
 *
 * The page becomes a book. Leaves hinge on the spine and turn in 3D; each
 * category opens on a page whose title letters fly in from depth and whose lead
 * image is revealed with a clip-path wipe; page numbers grow an underline. Wide
 * screens show two-page spreads; narrow screens show one page at a time. Pages that
 * are not open are `inert`, so keyboard and screen-reader users only reach what is
 * visible. The back cover carries the Ana Vodafone app promotion.
 *
 * On Vodafone's pages (voice-guide ADR-0076) the view scrolls in its own box instead of the page; the book does not
 * pin (it turns its pages in place) and nothing here reads or moves the window: every listener, frame and timer
 * goes through shared.js's seam, added on mount and given back on unmount. The box's bottom corners belong to
 * Vodafone's accessibility button and the guide's microphone, with its transcript bar while it listens (right), and
 * the Pocket's button (left). From 720 px the book keeps beside both (flipbook.css) and its controls run along the
 * bottom between them (held at the box's bottom while a book taller than the room scrolls by), moved to the stage's top where that lane is too narrow (the guide listening on a narrow
 * screen); on phones they sit at the stage's top, above the book (placeRow()). A link or button of the book that
 * meets a corner's zone is not pressable by a pointer while there (keepClear(): the class fb-under, never inert, so
 * the keyboard and a screen reader still reach it), and one that takes the focus there is scrolled clear
 * (clearFocus()). A contents link turns to its category and, when the book's top has scrolled past the bar,
 * scrolls the box (never the window, never a #fragment) back to it. reveal(itemId) turns to an item's page at once.
 */

import { h, pathIcon, svgIcon } from '../dom.js'
import { countCategories } from '../../i18n.js'
import {
  ICON_NEXT, ICON_PREV, countWords, ctaFor, experienceRoot, frame, groupExtras, groupsOf, isRTL, later, media, on, onScrollFrame,
  onViewResize, onViewZones, pad2, promotionOf, reducedMotion, scrollByY, scrollToElement, sidewaysSwipe, storyLinkClass, t,
  titleContent, viewBottom, viewScroller, viewTop, words,
} from './shared.js'

const SPREAD_QUERY = '(min-width: 900px)'
const PHONE_QUERY = '(max-width: 719px)'
/** The controls' row at its narrowest (two 48 px buttons, the status, a short progress bar, three gaps). */
const ROW_MIN = 300

/** Deterministic depths for the letter fly-in, like the reference's per-letter translateZ. */
const depthFor = (at) => 140 + ((at * 137) % 560)

const ARABIC = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/
const LATIN = /[A-Za-z]/
const NUMERIC = /^[\d.,%+-]+$/

/**
 * Words for the RTL fly-in: Arabic letters join, so each word flies in whole.
 * Consecutive Latin words (e.g. a brand name) stay one LTR unit, otherwise the
 * inline-blocks would be laid out right to left and reorder them.
 */
const flyUnits = (text) => {
  const units = []
  for (const word of text.split(' ').filter(Boolean)) {
    const prev = units.at(-1)
    // A number right after Latin words belongs to that run ("Vodafone 2025").
    const latin = (LATIN.test(word) && !ARABIC.test(word)) || (Boolean(prev?.latin) && NUMERIC.test(word))
    if (latin && prev?.latin) prev.text += ` ${word}`
    else units.push({ text: word, latin })
  }
  return units
}

const lettered = (text, className, id) => {
  let count = 0
  const heading = h('h2', { class: `fb-letters ${className}`, id, 'aria-label': text })
  // Never split Arabic into letters: on the Arabic page (or for Arabic text) fly in by word.
  if (isRTL || ARABIC.test(text)) {
    heading.classList.add('fb-letters--words')
    for (const unit of flyUnits(text)) {
      if (heading.childNodes.length) heading.append(' ')
      const span = h('span', { class: 'fb-char fb-char--word', 'aria-hidden': 'true', dir: unit.latin ? 'ltr' : null }, unit.text)
      span.style.setProperty('--d', `${depthFor(count)}px`)
      // Fewer, longer pieces: stagger them more than letters (4 letter-steps per word).
      span.style.setProperty('--i', String(count * 4))
      count += 1
      heading.append(span)
    }
    return heading
  }
  for (const word of text.split(' ')) {
    if (heading.childNodes.length) heading.append(' ')
    const wordEl = h('span', { class: 'fb-word', 'aria-hidden': 'true' })
    for (const char of word) {
      const span = h('span', { class: 'fb-char' }, char)
      span.style.setProperty('--d', `${depthFor(count)}px`)
      span.style.setProperty('--i', String(count))
      count += 1
      wordEl.append(span)
    }
    heading.append(wordEl)
  }
  return heading
}

/** "6 categories, 40 services" in the page's language (Arabic plural forms for services); "items" where the page is not about services. */
const countLine = (categories, services) =>
  `${countCategories(categories)}${isRTL ? '، ' : ', '}${countWords(services)}`

const bookItem = (item) =>
  h(
    'article',
    { class: `fb-item${storyLinkClass(item)}`, 'data-aixc-item': item.id },
    media(item, { className: 'fb-item__media' }),
    h(
      'div',
      { class: 'fb-item__body' },
      h('h3', { class: 'fb-item__title' }, titleContent(item)),
      item.description ? h('p', { class: 'fb-item__desc' }, item.description) : null,
      ctaFor(item, { variant: 'text' }),
    ),
  )

/**
 * Fills pages by how much copy the items carry, at most `size` per page, so a
 * run of long descriptions (Arabic runs longer) moves to the next page instead
 * of overflowing it. An item costs its picture and title (ITEM_COST) plus its
 * characters; a page holds `size` items of COPY_PER_ITEM characters each.
 */
const ITEM_COST = 70
const COPY_PER_ITEM = 105
const fill = (list, size) => {
  const budget = size * (ITEM_COST + COPY_PER_ITEM)
  const cost = (item) => ITEM_COST + String(item.title ?? '').length + String(item.description ?? '').length
  const pages = []
  let page = []
  let used = 0
  list.forEach((item) => {
    if (page.length && (page.length === size || used + cost(item) > budget)) {
      pages.push(page)
      page = []
      used = 0
    }
    page.push(item)
    used += cost(item)
  })
  if (page.length) pages.push(page)
  return pages
}

export const renderFlipbook = (schema, index) => {
  const groups = groupsOf(schema, index)
  const promo = promotionOf(schema, index)
  const page = index.model

  /* ------------------------------------------------------------ page plan */
  const buildPages = (spread) => {
    const perPage = spread ? 3 : 2
    const plan = [{ kind: 'cover', key: 'cover' }, { kind: 'contents', key: 'contents' }]
    groups.forEach((group, groupIndex) => {
      const [lead, ...rest] = group.items
      plan.push({ kind: 'opener', key: `group:${group.id}`, group, groupIndex, lead })
      fill(rest, perPage).forEach((items, part) => plan.push({ kind: 'items', key: `items:${group.id}:${part}`, group, items }))
    })
    if (promo) plan.push({ kind: 'back', key: 'back' })
    if (spread && plan.length % 2 === 1) plan.splice(plan.length - 1, 0, { kind: 'endpaper', key: 'endpaper' })
    return plan
  }

  /** Number of the page a category opens on, for the contents page. */
  const openerNumbers = (plan) => new Map(plan.map((entry, at) => [entry.key, at + 1]))

  const pageFolio = (number) => h('p', { class: 'fb-folio', 'aria-hidden': 'true' }, h('span', null, pad2(number)))

  const renderPage = (entry, at, plan) => {
    const number = at + 1
    const shell = (className, ...children) =>
      h('div', { class: `fb-page fb-page--${className}`, 'data-page': String(number), 'data-key': entry.key }, h('div', { class: 'fb-page__inner' }, ...children))

    switch (entry.kind) {
      case 'cover':
        return shell(
          'cover',
          h(
            'div',
            { class: 'fb-cover__photo fb-reveal' },
            page.heroImage?.src ? h('img', { src: page.heroImage.src, alt: '', width: page.heroImage.width, height: page.heroImage.height, decoding: 'async' }) : null,
          ),
          svgIcon('icon-vodafone-logo-white', 'fb-cover__mark'),
          h('h1', { class: 'fb-cover__title', id: 'aixc-cover-title', tabindex: '-1', 'data-aixc-focus': '' }, page.title),
          page.intro ? h('p', { class: 'fb-cover__intro' }, page.intro) : null,
          h('p', { class: 'fb-cover__count' }, countLine(groups.length, groups.reduce((sum, group) => sum + group.items.length, 0))),
        )
      case 'contents': {
        const numbers = openerNumbers(plan)
        return shell(
          'contents',
          h('h2', { class: 'fb-contents__title' }, t('Contents')),
          h(
            'ol',
            { class: 'fb-contents__list' },
            groups.map((group) =>
              h(
                'li',
                null,
                h(
                  'button',
                  { type: 'button', class: 'fb-contents__link', 'data-go': `group:${group.id}` },
                  h('span', { class: 'fb-contents__name' }, group.title),
                  h('span', { class: 'fb-contents__page' }, pad2(numbers.get(`group:${group.id}`))),
                ),
              ),
            ),
          ),
          pageFolio(number),
        )
      }
      case 'opener': {
        const headingId = `fb-h-${entry.group.id}`
        return shell(
          'opener',
          entry.group.provenance ? h('p', { class: 'fb-opener__from' }, entry.group.provenance) : null,
          lettered(entry.group.title, 'fb-opener__title', headingId),
          entry.group.description ? h('p', { class: 'fb-opener__desc' }, entry.group.description) : null,
          groupExtras(entry.group),
          entry.lead
            ? h(
                'article',
                { class: `fb-lead${storyLinkClass(entry.lead)}`, 'data-aixc-item': entry.lead.id },
                h('div', { class: 'fb-reveal fb-lead__media' }, media(entry.lead, { className: 'fb-lead__img' })),
                h(
                  'div',
                  { class: 'fb-lead__body' },
                  h('h3', { class: 'fb-lead__title' }, titleContent(entry.lead)),
                  entry.lead.description ? h('p', { class: 'fb-lead__desc' }, entry.lead.description) : null,
                  ctaFor(entry.lead, { variant: 'primary' }),
                ),
              )
            : null,
          pageFolio(number),
        )
      }
      case 'items':
        return shell('items', h('p', { class: 'fb-running' }, entry.group.title), h('div', { class: 'fb-items' }, entry.items.map(bookItem)), pageFolio(number))
      case 'back':
        return shell(
          'back',
          h('div', { class: 'fb-back', 'data-aixc-item': promo.id },
            h('h2', { class: 'fb-back__title' }, promo.title),
            promo.lead ? h('p', { class: 'fb-back__lead' }, promo.lead) : null,
            promo.description ? h('p', { class: 'fb-back__desc' }, promo.description) : null,
            promo.stores?.length
              ? h(
                  'div',
                  { class: 'fb-back__stores' },
                  promo.storesLabel ? h('p', null, promo.storesLabel) : null,
                  h(
                    'ul',
                    null,
                    promo.stores.map((store) =>
                      h('li', null, h('a', { href: store.href, target: '_blank', rel: 'noopener noreferrer', 'aria-label': `${store.label} ${t('(opens in a new tab)')}` }, svgIcon(store.icon, 'fb-back__store'))),
                    ),
                  ),
                )
              : null,
            promo.qr?.image?.src
              ? h('figure', { class: 'fb-back__qr' }, h('img', { src: promo.qr.image.src, alt: t('QR code to download the Ana Vodafone app'), width: 330, height: 330, loading: 'lazy', decoding: 'async' }), promo.qr.title ? h('figcaption', null, promo.qr.title) : null)
              : null,
          ),
        )
      default:
        return shell('endpaper', svgIcon('icon-vodafone-logo-white', 'fb-endpaper__mark'))
    }
  }

  /* -------------------------------------------------------------- the book */
  const book = h('div', { class: 'fb-book' })
  const desk = h('div', { class: 'fb-desk' }, book)
  const status = h('p', { class: 'fb-status', 'aria-live': 'polite' })
  const prevButton = h('button', { type: 'button', class: 'vx-round', 'aria-label': t('Previous page') }, pathIcon(ICON_PREV, ''))
  const nextButton = h('button', { type: 'button', class: 'vx-round', 'aria-label': t('Next page') }, pathIcon(ICON_NEXT, ''))
  const progressFill = h('span', { class: 'fb-progress__fill' })
  const controls = h('div', { class: 'fb-controls' }, prevButton, h('div', { class: 'fb-progress' }, progressFill), status, nextButton)
  const stage = h('section', { class: 'fb-stage', 'aria-label': words('Vodafone services flipbook'), 'aria-roledescription': t('book') }, desk, controls)
  const root = experienceRoot('flipbook', schema, stage)

  const media_ = matchMedia(SPREAD_QUERY)
  let spread = media_.matches
  let plan = []
  let pageNodes = []
  let leaves = []
  let position = 0 // spread index (spread mode) or page index (single mode)
  let mounted = false
  /** Frames and timers this view started (a turn's re-fence, the contents' focus): cancelled on unmount. */
  const pending = new Set()
  const soon = (start) => {
    const cancel = start(() => pending.delete(cancel))
    pending.add(cancel)
  }

  const maxPosition = () => (spread ? leaves.length : pageNodes.length - 1)

  const visiblePages = () => (spread ? [position * 2 - 1, position * 2] : [position]).filter((i) => i >= 0 && i < pageNodes.length)

  const build = () => {
    plan = buildPages(spread)
    pageNodes = plan.map((entry, at) => renderPage(entry, at, plan))
    leaves = []
    if (spread) {
      for (let i = 0; i < pageNodes.length; i += 2) {
        leaves.push(h('div', { class: 'fb-leaf' }, h('div', { class: 'fb-face fb-face--front' }, pageNodes[i]), h('div', { class: 'fb-face fb-face--back' }, pageNodes[i + 1] ?? null)))
      }
    } else {
      pageNodes.forEach((node) => leaves.push(h('div', { class: 'fb-leaf' }, h('div', { class: 'fb-face fb-face--front' }, node))))
    }
    book.classList.toggle('is-spread', spread)
    book.classList.toggle('is-single', !spread)
    book.replaceChildren(...leaves)
    // Corner turns inside the pages. A leaf's back face is the page already read
    // (left in LTR, right in RTL, where the CSS places its corner on the outer edge).
    // Their presses, and the contents links', reach the book's one click listener (mount()).
    pageNodes.forEach((node, at) => {
      const isBack = spread ? at % 2 === 1 : false
      const corner = h(
        'button',
        { type: 'button', class: `fb-corner fb-corner--${isBack ? 'prev' : 'next'}`, 'aria-label': isBack ? t('Turn back a page') : t('Turn the page') },
      )
      if (!(isBack && at === 0) && !(!isBack && at === pageNodes.length - 1)) node.append(corner)
    })
  }

  /* ------------------------------------------------- the box's bottom corners */
  /**
   * In a box: the bottom corners' safe zones (the box's --aixc-safe-{left,right}-{w,h}) as viewport rectangles,
   * and the box's inner sides.
   */
  const zonesNow = () => {
    const box = viewScroller()
    const style = getComputedStyle(box)
    const px = (name) => Number.parseFloat(style.getPropertyValue(`--aixc-safe-${name}`)) || 0
    const b = box.getBoundingClientRect()
    const left = b.left + box.clientLeft
    const right = left + box.clientWidth
    const bottom = viewBottom()
    return {
      px,
      left,
      right,
      zones: [
        { left: right - px('right-w'), top: bottom - px('right-h'), right, bottom },
        { left, top: bottom - px('left-h'), right: left + px('left-w'), bottom },
      ].filter((z) => z.right > z.left && z.top < z.bottom),
    }
  }
  const meets = (r, z) => r.width > 0 && r.left < z.right && r.right > z.left && r.top < z.bottom && r.bottom > z.top

  /**
   * In a box: each link and button of the book that meets a corner's zone takes fb-under (flipbook.css: no pointer
   * events) while there, the others lose it; a card's stretched title link (.vx-story-link) takes fb-under-card while
   * its card meets one (the stretch takes no pointer events, the title itself still does where it is clear). What is
   * on a closed page is inert and never fenced (a turned leaf of a single page lies off the book's side). Reads first,
   * then writes. The controls are never fenced: placeRow() keeps them clear.
   */
  const keepClear = () => {
    if (!viewScroller()) return
    const { zones } = zonesNow()
    const pressables = [...book.querySelectorAll('a[href], button')]
    const inZone = (node) => {
      const r = node?.getBoundingClientRect()
      return Boolean(r) && !node.closest('.fb-page')?.inert && zones.some((z) => meets(r, z))
    }
    const under = pressables.map((node) => [inZone(node), node.classList.contains('vx-story-link') && inZone(node.closest('.vx-has-story-link'))])
    pressables.forEach((node, at) => {
      node.classList.toggle('fb-under', under[at][0])
      node.classList.toggle('fb-under-card', under[at][1])
    })
  }

  /**
   * A link or button of the book that took the focus in a corner's zone or under the row held at the box's bottom: the
   * box scrolled until it is clear (16 px over the zone, 8 over the row), or one under the bar and the row held there
   * (Shift+Tab to a link above the view) scrolled down into view: either way its top kept 8 px under the bar and that row.
   */
  const clearFocus = (node) => {
    if (!book.contains(node) || !node.matches('a[href], button') || document.activeElement !== node) return
    const r = node.getBoundingClientRect()
    const under = zonesNow().zones.filter((z) => meets(r, z)).map((z) => r.bottom - z.top + 16)
    const top = viewTop() + rowCover()
    const down = Math.max(0, r.bottom - viewFloor() + 8, ...under)
    const dy = r.top < top + 8 ? r.top - top - 8 : Math.min(down, r.top - top - 8)
    if (dy) scrollByY(dy)
  }

  /**
   * In a box: where the controls' row goes. From 720 px at the bottom centre, between the corners' zones (each side
   * kept 16 px clear of its zone, never nearer the box's edge than the gutter): under the book where the whole stage
   * fits the room under the bar (the row in view at the box's top), else held 12 px over the box's bottom while the
   * book scrolls by (fb-row-low; flipbook.css), resting under the book at its end. Elsewhere (phones, a lane between
   * the zones narrower than the row: the guide listening on a narrow screen) at the stage's top, above the book, held
   * under the bar while the book scrolls past (fb-row-top), kept clear of a zone that reaches up to it there (a short
   * box): scrolling only moves that row up or holds it, so a row clear at the box's top stays clear. Its insets go to
   * the row as --fb-row-ml/-mr (from the stage's padding, which keeps the book beside the zones: flipbook.css).
   */
  const placeRow = () => {
    const box = viewScroller()
    if (!box) return
    const { px, left, right } = zonesNow()
    const s = getComputedStyle(stage)
    const b = box.getBoundingClientRect()
    // The stage's top in the box's own coordinates (the stage does not move with the row), and its height with the
    // row at the bottom: the book, the gap, the row's buttons, the paddings.
    const stageTop = stage.getBoundingClientRect().top - b.top - box.clientTop + box.scrollTop
    const pad = (name) => Number.parseFloat(s[name]) || 0
    const below = pad('paddingTop') + desk.offsetHeight + pad('rowGap') + nextButton.offsetHeight + pad('paddingBottom')
    const gutter = Math.min(48, Math.max(16, document.documentElement.clientWidth * 0.04))
    const lane = (w) => Math.max(gutter, w > 0 ? w + 16 : 0)
    let [l, r] = [lane(px('left-w')), lane(px('right-w'))]
    const top = matchMedia(PHONE_QUERY).matches || right - left - l - r < ROW_MIN
    stage.classList.toggle('fb-row-top', top)
    stage.classList.toggle('fb-row-low', !top && stageTop + below > box.clientHeight + 1)
    if (top) {
      // The row at the box's top (its lowest place): its bottom against how far up each zone reaches.
      const rowBottom = stageTop + pad('paddingTop') + controls.offsetHeight
      const reaches = (h) => h > 0 && rowBottom > box.clientHeight - h
      ;[l, r] = [reaches(px('left-h')) ? l : gutter, reaches(px('right-h')) ? r : gutter]
    }
    controls.style.setProperty('--fb-row-ml', `${Math.round(l - pad('paddingLeft'))}px`)
    controls.style.setProperty('--fb-row-mr', `${Math.round(r - pad('paddingRight'))}px`)
  }

  /** In a box: how much of the view's top the row covers while it is held under the bar (0 when it sits elsewhere). */
  const rowCover = () => (stage.classList.contains('fb-row-top') ? controls.offsetHeight : 0)

  /** In a box: the view's bottom for what should show, over the row while it is held at the box's bottom. */
  const viewFloor = () => Math.min(viewBottom(), stage.classList.contains('fb-row-low') ? controls.getBoundingClientRect().top : Infinity)

  /** In a box: the stage's top to the bar when the book's top has scrolled past the bar (or under the row held there). */
  const showBook = (options) => {
    if (desk.getBoundingClientRect().top < viewTop() + rowCover() - 1) scrollToElement(stage, options)
  }

  /** keepClear() once the book has its new places: at the next frame, and once a turn's animation has run. */
  const refence = () => {
    if (!viewScroller() || !mounted) return
    soon((done) => frame(() => (done(), keepClear())))
    if (!reducedMotion()) soon((done) => later(() => (done(), keepClear()), 1000))
  }

  const apply = ({ instant = false } = {}) => {
    book.classList.toggle('is-instant', instant || reducedMotion())
    leaves.forEach((leaf, at) => {
      const turned = at < position
      leaf.classList.toggle('is-turned', turned)
      // Turned leaves stack with the latest on top; unturned ones with the next on top.
      leaf.style.zIndex = String(turned ? at + 1 : leaves.length - at)
    })
    const open = new Set(visiblePages())
    pageNodes.forEach((node, at) => {
      const isOpen = open.has(at)
      node.inert = !isOpen
      node.classList.toggle('is-open', isOpen)
    })
    // Never leave keyboard focus on a page that just closed.
    const focused = document.activeElement
    if (focused && book.contains(focused) && focused.closest('.fb-page')?.inert) {
      ;(position < maxPosition() ? nextButton : prevButton).focus({ preventScroll: true })
    }
    book.classList.toggle('is-closed-front', spread && position === 0)
    book.classList.toggle('is-closed-back', spread && position === leaves.length)
    prevButton.disabled = position === 0
    nextButton.disabled = position === maxPosition()
    const pages = visiblePages().map((i) => i + 1)
    status.textContent =
      pages.length > 1
        ? t('Pages {from}–{to} of {total}', { from: pages[0], to: pages[1], total: pageNodes.length })
        : t('Page {page} of {total}', { page: pages[0], total: pageNodes.length })
    progressFill.style.transform = `scaleX(${maxPosition() ? position / maxPosition() : 1})`
    refence()
  }

  const turn = (direction) => {
    const next = Math.min(maxPosition(), Math.max(0, position + direction))
    if (next === position) return
    position = next
    apply()
  }

  const positionForPage = (pageIndex) => (spread ? Math.ceil(pageIndex / 2) : pageIndex)

  const goToKey = (key) => {
    const at = plan.findIndex((entry) => entry.key === key)
    if (at < 0) return
    position = positionForPage(at)
    apply()
    // In a box, a book whose top has scrolled past the bar comes back to it (the box's scroll, never the window's).
    if (viewScroller()) showBook()
    const heading = pageNodes[at].querySelector('h2, h1')
    if (heading) {
      heading.setAttribute('tabindex', '-1')
      soon((done) =>
        later(() => {
          done()
          if (!heading.closest('.fb-page')?.inert) heading.focus({ preventScroll: true })
        }, reducedMotion() ? 0 : 950),
      )
    }
  }

  // The next page lies along the reading line: ArrowRight in LTR, ArrowLeft in RTL.
  const [backKey, forwardKey] = isRTL ? ['ArrowRight', 'ArrowLeft'] : ['ArrowLeft', 'ArrowRight']
  const onKey = (event) => {
    // Alt+Arrow is the browser's Back/Forward; modified keys are not page turns.
    if (event.altKey || event.ctrlKey || event.metaKey) return
    if (event.target.closest('input, textarea')) return
    if (event.key === forwardKey || event.key === 'PageDown') {
      event.preventDefault()
      turn(1)
    } else if (event.key === backKey || event.key === 'PageUp') {
      event.preventDefault()
      turn(-1)
    }
  }

  /** A press on a page's corner turns the page; on a contents link, goes to its category. */
  const onBookClick = (event) => {
    const corner = event.target.closest('.fb-corner')
    if (corner) return turn(corner.classList.contains('fb-corner--prev') ? -1 : 1)
    const go = event.target.closest('[data-go]')
    if (go) goToKey(go.dataset.go)
  }

  const onModeChange = () => {
    if (media_.matches === spread) return
    const keepKey = plan[visiblePages().at(-1)]?.key ?? 'cover'
    spread = media_.matches
    build()
    const at = Math.max(0, plan.findIndex((entry) => entry.key === keepKey))
    position = positionForPage(at)
    apply({ instant: true })
    placeRow()
  }

  /** In a box: a page's own scroll (its copy runs past it) moves its links too: fenced again at the next frame, once per frame. */
  let fencing = false
  const onPageScroll = () => {
    if (fencing) return
    fencing = true
    soon((done) => frame(() => (done(), (fencing = false), keepClear())))
  }

  /** In a box: the row placed and the book fenced again (the zones or the box's size changed). */
  const place = () => {
    placeRow()
    keepClear()
  }

  build()
  apply({ instant: true })

  let offs = []
  return {
    element: root,
    mount() {
      mounted = true
      offs = [
        on(media_, 'change', onModeChange),
        on(prevButton, 'click', () => turn(-1)),
        on(nextButton, 'click', () => turn(1)),
        on(book, 'click', onBookClick),
        on(stage, 'keydown', onKey),
        // A sideways swipe turns one page per gesture, along the reading line too.
        sidewaysSwipe(stage, turn),
        // In a box: the row and the fence follow the box's scroll and size and the zones (the Pocket's button showing,
        // the guide listening); a focus taken under a corner is scrolled clear, after the browser's own scroll to it.
        ...(viewScroller()
          ? [
              onScrollFrame(keepClear),
              onViewResize(place),
              onViewZones(place),
              on(book, 'scroll', onPageScroll, { capture: true, passive: true }),
              on(root, 'focusin', (event) => soon((done) => frame(() => (done(), clearFocus(event.target))))),
            ]
          : []),
      ]
      onModeChange()
      place()
    },
    unmount() {
      mounted = false
      for (const off of offs.splice(0)) off()
      for (const cancel of [...pending]) cancel()
      pending.clear()
      fencing = false
      for (const node of book.querySelectorAll('.fb-under, .fb-under-card')) node.classList.remove('fb-under', 'fb-under-card')
    },
    /** Turns to the item's page at once and, in a box, scrolls the box to it where it is not in view; false if the book has none. */
    reveal(itemId) {
      const item = [...book.querySelectorAll('[data-aixc-item]')].find((node) => node.dataset.aixcItem === itemId)
      const at = item ? pageNodes.findIndex((node) => node.contains(item)) : -1
      if (at < 0) return false
      position = positionForPage(at)
      apply({ instant: true })
      // A page whose copy runs past it scrolls on its own: the item to its top.
      const inner = item.closest('.fb-page__inner')
      const r = item.getBoundingClientRect()
      const i = inner.getBoundingClientRect()
      if (r.top < i.top || r.bottom > i.bottom) inner.scrollTop += r.top - i.top - 8
      if (viewScroller()) {
        // In view: under the bar and the row held there (8 px under, less where the room is only a little taller than
        // the item), and above the box's bottom and the row held there (or its top there, if taller).
        const gap = () => {
          const x = item.getBoundingClientRect()
          const from = viewTop() + rowCover()
          const floor = viewFloor()
          const margin = Math.min(8, Math.max(0, (floor - from - x.height) / 2))
          return x.top < from - 1 || (x.bottom > floor + 1 && x.top > from + margin + 1) ? x.top - from - margin : 0
        }
        if (gap()) showBook({ instant: true })
        if (gap()) scrollByY(gap())
      }
      return true
    },
  }
}
