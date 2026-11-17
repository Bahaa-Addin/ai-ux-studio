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
 */

import { h, pathIcon, svgIcon } from '../dom.js'
import { countCategories, countServices } from '../../i18n.js'
import {
  ICON_NEXT, ICON_PREV, ctaFor, experienceRoot, groupExtras, groupsOf, isRTL, media, pad2, promotionOf, reducedMotion, sidewaysSwipe, storyLinkClass,
  t, titleContent,
} from './shared.js'

const SPREAD_QUERY = '(min-width: 900px)'

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

/** "6 categories, 40 services" in the page's language (Arabic plural forms for services). */
const countLine = (categories, services) =>
  `${countCategories(categories)}${isRTL ? '، ' : ', '}${countServices(services)}`

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
  const status = h('p', { class: 'fb-status', 'aria-live': 'polite' })
  const prevButton = h('button', { type: 'button', class: 'vx-round', 'aria-label': t('Previous page') }, pathIcon(ICON_PREV, ''))
  const nextButton = h('button', { type: 'button', class: 'vx-round', 'aria-label': t('Next page') }, pathIcon(ICON_NEXT, ''))
  const progressFill = h('span', { class: 'fb-progress__fill' })
  const controls = h('div', { class: 'fb-controls' }, prevButton, h('div', { class: 'fb-progress' }, progressFill), status, nextButton)
  const stage = h('section', { class: 'fb-stage', 'aria-label': t('Vodafone services flipbook'), 'aria-roledescription': t('book') }, h('div', { class: 'fb-desk' }, book), controls)
  const root = experienceRoot('flipbook', schema, stage)

  let spread = window.matchMedia(SPREAD_QUERY).matches
  let plan = []
  let pageNodes = []
  let leaves = []
  let position = 0 // spread index (spread mode) or page index (single mode)

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
    pageNodes.forEach((node, at) => {
      const isBack = spread ? at % 2 === 1 : false
      const corner = h(
        'button',
        { type: 'button', class: `fb-corner fb-corner--${isBack ? 'prev' : 'next'}`, 'aria-label': isBack ? t('Turn back a page') : t('Turn the page') },
      )
      corner.addEventListener('click', () => turn(isBack ? -1 : 1))
      if (!(isBack && at === 0) && !(!isBack && at === pageNodes.length - 1)) node.append(corner)
    })
    book.querySelectorAll('[data-go]').forEach((button) => button.addEventListener('click', () => goToKey(button.dataset.go)))
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
    const heading = pageNodes[at].querySelector('h2, h1')
    if (heading) {
      heading.setAttribute('tabindex', '-1')
      window.setTimeout(() => {
        if (!heading.closest('.fb-page')?.inert) heading.focus({ preventScroll: true })
      }, reducedMotion() ? 0 : 950)
    }
  }

  prevButton.addEventListener('click', () => turn(-1))
  nextButton.addEventListener('click', () => turn(1))
  // The next page lies along the reading line: ArrowRight in LTR, ArrowLeft in RTL.
  const [backKey, forwardKey] = isRTL ? ['ArrowRight', 'ArrowLeft'] : ['ArrowLeft', 'ArrowRight']
  stage.addEventListener('keydown', (event) => {
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
  })

  // A sideways swipe turns one page per gesture, along the reading line too.
  sidewaysSwipe(stage, turn)

  const media_ = window.matchMedia(SPREAD_QUERY)
  const onModeChange = () => {
    if (media_.matches === spread) return
    const keepKey = plan[visiblePages().at(-1)]?.key ?? 'cover'
    spread = media_.matches
    build()
    const at = Math.max(0, plan.findIndex((entry) => entry.key === keepKey))
    position = positionForPage(at)
    apply({ instant: true })
  }

  build()
  apply({ instant: true })

  return {
    element: root,
    mount() {
      media_.addEventListener('change', onModeChange)
      onModeChange()
    },
    unmount() {
      media_.removeEventListener('change', onModeChange)
    },
  }
}
