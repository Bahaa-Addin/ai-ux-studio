/**
 * Spotlight cards — adapted from "Timed Cards Opening" (codepen.io/dilums/full/NWodZMd).
 *
 * One service fills the stage; the next services wait as cards at the bottom
 * end corner (right in English, left in Arabic, where the queue runs leftward). Advancing expands the next card into the stage (a clip-path reveal),
 * slides the queue along, and animates the details panel in. A red timer bar
 * auto-advances; it pauses on hover, focus, the pause button, a hidden tab, and is
 * off by default under reduced motion. Arrow keys, prev/next and category jumps
 * reach every service, and the closing app promotion follows the stage.
 */

import { h, pathIcon } from '../dom.js'
import {
  ICON_NEXT, ICON_PAUSE, ICON_PLAY, ICON_PREV, arrowKeys, closingBand, ctaFor, experienceRoot, flatItems, groupsOf, media, pad2,
  pageHeading, promotionOf, reducedMotion, t,
} from './shared.js'

const DWELL_MS = 6500
const QUEUE_DESKTOP = 4
const QUEUE_MOBILE = 2

export const renderSpotlight = (schema, index) => {
  const groups = groupsOf(schema, index)
  const entries = flatItems(groups)
  const total = entries.length
  const promo = promotionOf(schema, index)

  const state = { active: 0, playing: !reducedMotion(), hovered: false, focused: false, elapsed: 0, last: 0, frame: 0, mounted: false }

  /* ------------------------------------------------------------- backdrops */
  const backdropFor = (entry) => {
    const layer = h('div', { class: 'sp-backdrop', 'aria-hidden': 'true' })
    if (entry.item.image?.src) {
      const img = h('img', { src: entry.item.image.src, alt: '', decoding: 'async' })
      if (entry.item.image.fit === 'contain') layer.classList.add('is-contain')
      img.addEventListener('error', () => img.remove(), { once: true })
      layer.append(img)
    }
    return layer
  }
  const backdrops = h('div', { class: 'sp-backdrops' }, backdropFor(entries[0]))

  /* ---------------------------------------------------------------- slides */
  const slides = entries.map(({ item, group }, at) =>
    h(
      'article',
      {
        class: 'sp-slide',
        'data-aixc-item': item.id,
        role: 'group',
        'aria-roledescription': t('slide'),
        'aria-label': t('{n} of {total}: {title}', { n: at + 1, total, title: item.title }),
        hidden: at !== 0,
      },
      h('p', { class: 'sp-slide__place' }, group.title),
      h('h2', { class: 'sp-slide__title' }, item.title),
      item.description ? h('p', { class: 'sp-slide__desc' }, item.description) : null,
      h('div', { class: 'sp-slide__actions' }, ctaFor(item, { variant: 'primary', standalone: true, onDark: true })),
    ),
  )
  const slideList = h('div', { class: 'sp-slides', 'aria-live': state.playing ? 'off' : 'polite' }, slides)

  /* ----------------------------------------------------------------- queue */
  const cards = entries.map(({ item, group }, at) => {
    const card = h(
      'button',
      { type: 'button', class: 'sp-card', 'aria-label': t('Show {title}', { title: item.title }), 'data-index': String(at) },
      media(item, { className: 'sp-card__media' }),
      h('span', { class: 'sp-card__text', 'aria-hidden': 'true' }, h('span', { class: 'sp-card__place' }, group.title), h('span', { class: 'sp-card__title' }, item.title)),
    )
    card.addEventListener('click', () => goTo(at, { from: card }))
    return card
  })
  const queue = h('div', { class: 'sp-queue', role: 'group', 'aria-label': t('Up next') }, cards)

  /* -------------------------------------------------------------- controls */
  const prevButton = h('button', { type: 'button', class: 'vx-round vx-on-dark', 'aria-label': t('Previous service') }, pathIcon(ICON_PREV, ''))
  const nextButton = h('button', { type: 'button', class: 'vx-round vx-on-dark', 'aria-label': t('Next service') }, pathIcon(ICON_NEXT, ''))
  const playButton = h('button', { type: 'button', class: 'vx-round vx-on-dark sp-play', 'aria-pressed': 'false' })
  const progressFill = h('span', { class: 'sp-progress__fill' })
  const counter = h('span', { class: 'sp-counter__now' }, '01')
  const controls = h(
    'div',
    { class: 'sp-controls' },
    prevButton,
    nextButton,
    h('div', { class: 'sp-progress', role: 'presentation' }, progressFill),
    h('p', { class: 'sp-counter' }, counter, h('span', { class: 'sp-counter__total' }, ` / ${pad2(total)}`)),
    playButton,
  )
  const timer = h('div', { class: 'sp-timer', 'aria-hidden': 'true' }, h('span', { class: 'sp-timer__fill' }))

  /* -------------------------------------------------------- category jumps */
  const firstIndexOf = new Map()
  entries.forEach((entry, at) => {
    if (!firstIndexOf.has(entry.group.id)) firstIndexOf.set(entry.group.id, at)
  })
  const jumpButtons = groups.map((group) => {
    const button = h('button', { type: 'button', class: 'sp-jump', 'data-group': group.id }, group.title)
    button.addEventListener('click', () => goTo(firstIndexOf.get(group.id)))
    return button
  })
  const jumps = h('nav', { class: 'sp-jumps', 'aria-label': t('Jump to a category') }, h('ul', null, jumpButtons.map((button) => h('li', null, button))))

  const stage = h(
    'section',
    { class: 'sp-stage vx-dark', 'aria-roledescription': t('carousel'), 'aria-label': t('Vodafone services spotlight') },
    backdrops,
    timer,
    jumps,
    h('div', { class: 'sp-details' }, slideList),
    queue,
    controls,
  )

  const root = experienceRoot('spotlight', schema, pageHeading(index), stage, closingBand(promo))

  /* ----------------------------------------------------------------- logic */
  const queueSize = () => (window.matchMedia('(max-width: 719px)').matches ? QUEUE_MOBILE : QUEUE_DESKTOP)


  const layoutQueue = () => {
    const size = queueSize()
    cards.forEach((card, at) => {
      const slot = (at - state.active - 1 + total) % total // 0 = next up
      const visible = slot < size
      card.style.setProperty('--slot', String(Math.min(slot, size)))
      card.classList.toggle('is-queued', visible)
      card.classList.toggle('is-parked', !visible)
      card.inert = !visible
    })
  }

  const syncControls = () => {
    const group = entries[state.active].group
    counter.textContent = pad2(state.active + 1)
    progressFill.style.transform = `scaleX(${(state.active + 1) / total})`
    jumpButtons.forEach((button) => {
      const current = button.dataset.group === group.id
      button.classList.toggle('is-current', current)
      if (current) button.setAttribute('aria-current', 'true')
      else button.removeAttribute('aria-current')
    })
    playButton.replaceChildren(pathIcon(state.playing ? ICON_PAUSE : ICON_PLAY, ''))
    playButton.setAttribute('aria-label', state.playing ? t('Pause automatic rotation') : t('Start automatic rotation'))
    playButton.setAttribute('aria-pressed', String(!state.playing))
    slideList.setAttribute('aria-live', state.playing ? 'off' : 'polite')
  }

  /** Expands a new backdrop from `fromRect` (a queue card) to the full stage. */
  const revealBackdrop = (entry, fromEl) => {
    const layer = backdropFor(entry)
    backdrops.append(layer)
    const previous = [...backdrops.children].slice(0, -1)
    const finish = () => previous.forEach((node) => node.remove())
    if (reducedMotion() || !fromEl || typeof layer.animate !== 'function') {
      finish()
      return
    }
    const stageRect = stage.getBoundingClientRect()
    const rect = fromEl.getBoundingClientRect()
    const inset = [
      Math.max(0, rect.top - stageRect.top),
      Math.max(0, stageRect.right - rect.right),
      Math.max(0, stageRect.bottom - rect.bottom),
      Math.max(0, rect.left - stageRect.left),
    ]
      .map((value) => `${Math.round(value)}px`)
      .join(' ')
    const animation = layer.animate(
      [{ clipPath: `inset(${inset} round 8px)` }, { clipPath: 'inset(0px 0px 0px 0px round 0px)' }],
      { duration: 650, easing: 'cubic-bezier(0.45, 0, 0.2, 1)' },
    )
    animation.onfinish = finish
    animation.oncancel = finish
  }

  const goTo = (target, { from = null, user = true } = {}) => {
    const next = ((target % total) + total) % total
    if (next === state.active) return
    const outgoing = slides[state.active]
    const incoming = slides[next]
    const fromEl = from ?? (next === (state.active + 1) % total ? cards[next] : null)
    revealBackdrop(entries[next], fromEl && !fromEl.inert ? fromEl : null)
    outgoing.hidden = true
    incoming.hidden = false
    incoming.classList.remove('is-entering')
    // Restart the entrance animation.
    void incoming.offsetWidth
    incoming.classList.add('is-entering')
    state.active = next
    state.elapsed = 0
    layoutQueue()
    syncControls()
    if (user && document.activeElement && cards.includes(document.activeElement)) {
      // The clicked card moves away; keep focus on the stage controls.
      nextButton.focus({ preventScroll: true })
    }
  }

  const paused = () => !state.playing || state.hovered || state.focused || document.hidden

  const tick = (now) => {
    if (!state.mounted) return
    const delta = state.last ? Math.min(now - state.last, 100) : 0
    state.last = now
    if (!paused()) {
      state.elapsed += delta
      if (state.elapsed >= DWELL_MS) goTo(state.active + 1, { user: false })
    }
    timer.firstChild.style.transform = `scaleX(${Math.min(state.elapsed / DWELL_MS, 1)})`
    timer.classList.toggle('is-paused', paused())
    state.frame = window.requestAnimationFrame(tick)
  }

  /* ---------------------------------------------------------------- events */
  prevButton.addEventListener('click', () => goTo(state.active - 1))
  nextButton.addEventListener('click', () => goTo(state.active + 1))
  playButton.addEventListener('click', () => {
    state.playing = !state.playing
    syncControls()
  })
  stage.addEventListener('pointerenter', () => (state.hovered = true))
  stage.addEventListener('pointerleave', () => (state.hovered = false))
  stage.addEventListener('focusin', () => (state.focused = true))
  stage.addEventListener('focusout', (event) => {
    if (!stage.contains(event.relatedTarget)) state.focused = false
  })
  // Left/right follow the reading line (ArrowLeft advances in Arabic).
  arrowKeys(stage, { step: (direction) => goTo(state.active + direction), first: () => goTo(0), last: () => goTo(total - 1), axis: 'x' })
  const onResize = () => layoutQueue()

  layoutQueue()
  syncControls()

  return {
    element: root,
    mount() {
      state.mounted = true
      state.last = 0
      window.addEventListener('resize', onResize)
      state.frame = window.requestAnimationFrame(tick)
    },
    unmount() {
      state.mounted = false
      window.removeEventListener('resize', onResize)
      window.cancelAnimationFrame(state.frame)
    },
  }
}
