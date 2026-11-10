/**
 * Tips: the collection itself (voice-guide ADR-0045), loaded on demand by ./entry.js.
 *
 * A sheet that pages sideways like Apple's Tips app: a cover, two tips for each demo, a closing
 * card. Each tip loops its scene while it is on screen (./scenes.js), the picture moves a little
 * slower than the card as you swipe, and "Try it" hands over to a coach mark on the real control
 * (./coach.js). Paging is the browser's own scroll snapping, so touch, trackpad and the keyboard
 * all feel native. A bottom sheet on phones (drag down to close), a centred card elsewhere.
 *
 * The sheet dims the page but never covers Vodafone's accessibility button (AGENTS.md §4.6): the
 * scrim has a hole for it.
 */

import { CARDS, FEATURES, TIP_COUNT, featureAvailable, featureById, firstTipOf, tipPosition, unavailableReason, writeState } from './catalog.js'
import { createScene } from './scenes.js'
import { buildFlows, createCoach, guideMic, journeyPill } from './coach.js'
import { box, inflate, scrimPath } from './geometry.js'
import { icon } from './icons.js'
import { TEMPLATES } from '../aixc/templates.js'

const SVG_NS = 'http://www.w3.org/2000/svg'
const SHEET_EASE = 'cubic-bezier(.32,.72,0,1)' // the iOS sheet curve
const POP_EASE = 'cubic-bezier(.2,.9,.25,1.05)'

const make = (tag, className, ...children) => {
  const node = document.createElement(tag)
  if (className) node.className = className
  for (const child of children) if (child !== null && child !== undefined && child !== false) node.append(child)
  return node
}
const button = (className, ...children) => {
  const node = make('button', className, ...children)
  node.type = 'button'
  return node
}

/** The spoken example, from the router's tuning set (voice-guide tests/fixtures/vodafone-utterances.yaml). */
const EXAMPLE = {
  en: 'What’s the cheapest internet bundle?',
  ar: 'إيه أرخص باقة نت؟',
}
/** Three of the guide's verified journey questions about this page (voice-guide config/experience). */
const QUESTIONS = {
  en: ['Tell me about Vodafone Cash', 'Tell me about the Call & Connect abroad', 'Open the Shokran services page'],
  ar: ['افتحلي صفحة ڤودافون كاش', 'احكيلي عن خليك على اتصال مع كل مكان في العالم', 'افتحلي صفحة خدمات شكرا'],
}

/** What is on this page right now (the guide arrives after the page, so this is asked each time). */
export const detectEnv = ({ pocket }) => ({
  guide: Boolean(guideMic()),
  trail: Boolean(journeyPill()),
  pocket: Boolean(pocket),
  composer: Boolean(document.querySelector('.aixc-launcher')),
})

let uid = 0

export const createTips = ({ t, lang, model, pocket, storage, state, entryButton }) => {
  const rtl = lang === 'ar'
  const reducedQuery = matchMedia('(prefers-reduced-motion: reduce)')
  const phoneQuery = matchMedia('(max-width: 767px)')
  const items = new Map()
  const sections = new Map()
  for (const section of model?.sections ?? []) {
    sections.set(section.id, section)
    for (const item of section.items) items.set(item.id, item)
  }
  const ctx = {
    lang,
    rtl,
    t,
    get reduced() {
      return reducedQuery.matches
    },
    uid: (uid += 1),
    mx: (x, w) => (rtl ? 400 - x - w : x),
    item: (id) => items.get(id) ?? null,
    section: (id) => sections.get(id) ?? null,
    template: (id) => TEMPLATES.find((template) => template.id === id) ?? null,
    pageTitle: model?.title ?? '',
    heroImage: model?.heroImage?.src ?? '',
    features: FEATURES,
    example: (EXAMPLE[lang] ?? EXAMPLE.en).split(' '),
    questions: QUESTIONS[lang] ?? QUESTIONS.en,
  }
  const save = () => writeState(storage, state)
  const featureIcon = (id) => featureById(id)?.icon ?? 'bulb'

  /* ------------------------------------------------------------------ layer and scrim */
  const root = make('div', 'tips')
  root.dataset.vg = '' // never part of a recorded journey (voice-guide SPEC-06)
  root.hidden = true
  root.dir = rtl ? 'rtl' : 'ltr'
  root.lang = lang
  const scrim = document.createElementNS(SVG_NS, 'svg')
  scrim.setAttribute('class', 'tips-scrim')
  scrim.setAttribute('aria-hidden', 'true')
  const scrimShape = document.createElementNS(SVG_NS, 'path')
  scrimShape.setAttribute('fill-rule', 'evenodd')
  scrim.append(scrimShape)
  const blur = make('div', 'tips-blur')
  blur.setAttribute('aria-hidden', 'true')

  /* ------------------------------------------------------------------ the sheet */
  const eyebrow = make('p', 'tips-eyebrow')
  const closeButton = button('tips-icon tips-close', icon('close'))
  closeButton.setAttribute('aria-label', t('Close tips'))
  const track = make('div', 'tips-track')
  track.setAttribute('role', 'group')
  track.setAttribute('aria-roledescription', t('carousel'))
  track.setAttribute('aria-label', t('Tips'))
  const prevButton = button('tips-btn tips-btn--ghost tips-prev', icon(rtl ? 'next' : 'back'), make('span', null, t('Back')))
  const nextLabel = make('span')
  const nextButton = button('tips-btn tips-btn--primary tips-next', nextLabel, icon(rtl ? 'back' : 'next'))
  const dots = make('div', 'tips-dots')
  const grabber = make('span', 'tips-grabber')
  grabber.setAttribute('aria-hidden', 'true')
  const sheet = make(
    'section',
    'tips-sheet',
    grabber,
    make('header', 'tips-head', eyebrow, closeButton),
    track,
    make('footer', 'tips-foot', prevButton, dots, nextButton),
  )
  sheet.setAttribute('role', 'dialog')
  sheet.setAttribute('aria-modal', 'true')
  sheet.setAttribute('aria-label', t('Tips'))
  const live = make('p', 'aixc-sr-only')
  live.setAttribute('role', 'status')
  live.setAttribute('aria-live', 'polite')
  root.append(blur, scrim, sheet, live)
  document.body.append(root)

  /* ------------------------------------------------------------------ the cards */
  const cards = CARDS.map((card, index) => {
    const article = make('article', `tips-card tips-card--${card.kind}`)
    article.dataset.index = String(index)
    article.dataset.card = card.id
    article.setAttribute('role', 'group')
    article.setAttribute('aria-roledescription', t('tip'))
    article.setAttribute('aria-label', t('{n} of {total}', { n: index + 1, total: CARDS.length }))
    const media = make('div', 'tips-media')
    const text = make('div', 'tips-text')
    const heading = make('h2', 'tips-title', t(card.title))
    heading.id = `tips-title-${index}`
    heading.tabIndex = -1
    article.setAttribute('aria-labelledby', heading.id)
    if (card.kind === 'tip') {
      const feature = featureById(card.feature)
      const position = tipPosition(index)
      text.append(make('p', 'tips-kicker', make('span', `tips-kicker__disc tips-kicker__disc--${feature.id}`, icon(feature.icon)), make('span', null, t(feature.name))))
      article.dataset.feature = feature.id
      article.dataset.position = `${position.n}/${position.of}`
    }
    text.append(heading, make('p', 'tips-body', t(card.body)))
    const action = make('div', 'tips-action')
    text.append(action)
    if (card.kind === 'cover') {
      text.append(make('p', 'tips-meta', t('{count} tips · about 2 minutes', { count: TIP_COUNT })))
    }
    if (card.kind === 'finale') {
      const grid = make('div', 'tips-grid')
      media.append(grid)
      media.classList.add('tips-media--grid')
    }
    article.append(media, text)
    track.append(article)
    return { card, article, media, text, action, scene: null }
  })

  /** "Try it", or a plain note when the demo is not on this page. */
  const renderActions = () => {
    const env = detectEnv({ pocket })
    for (const entry of cards) {
      const { card, action } = entry
      if (card.kind === 'tip') {
        const available = featureAvailable(card.feature, env)
        const tried = state.tried[card.feature]
        action.replaceChildren(
          available
            ? (() => {
                const tryButton = button('tips-try', make('span', null, t(tried ? 'Try it again' : 'Try it')), icon(rtl ? 'back' : 'next'))
                tryButton.dataset.feature = card.feature
                tryButton.addEventListener('click', () => startTry(card.feature, tryButton))
                return tryButton
              })()
            : make('p', 'tips-note', icon('bulb'), make('span', null, t(unavailableReason(card.feature)))),
        )
      }
      if (card.kind === 'finale') {
        const grid = entry.media.querySelector('.tips-grid')
        grid.replaceChildren(
          ...FEATURES.map((feature, i) => {
            const available = featureAvailable(feature.id, env)
            const tried = state.tried[feature.id]
            const tile = make(
              'div',
              `tips-tile${tried ? ' is-tried' : ''}${available ? '' : ' is-off'}`,
              make('span', `tips-tile__disc tips-kicker__disc--${feature.id}`, icon(feature.icon), tried ? make('span', 'tips-tile__check', icon('check')) : null),
              make('span', 'tips-tile__name', t(feature.name)),
            )
            tile.style.setProperty('--i', String(i))
            if (available) {
              const go = button('tips-tile__try', t(tried ? 'Try it again' : 'Try it'))
              go.setAttribute('aria-label', `${t(tried ? 'Try it again' : 'Try it')}: ${t(feature.name)}`)
              go.addEventListener('click', () => startTry(feature.id, go))
              tile.append(go)
            } else {
              tile.append(make('span', 'tips-tile__off', t('Not on this page')))
            }
            return tile
          }),
        )
      }
    }
  }

  const dotButtons = CARDS.map((card, index) => {
    const dot = button('tips-dot')
    dot.setAttribute('aria-label', t('Go to {n} of {total}', { n: index + 1, total: CARDS.length }))
    dot.addEventListener('click', () => goTo(index))
    dots.append(dot)
    return dot
  })

  /* ------------------------------------------------------------------ paging */
  let active = -1
  let isOpen = false
  let settleTimer = 0
  let jumpTimer = 0
  let raf = 0

  const sceneFor = (index) => {
    const entry = cards[index]
    if (!entry || entry.scene || !entry.card.scene) return entry?.scene ?? null
    entry.scene = createScene(entry.card.scene, ctx)
    if (entry.scene) entry.media.append(entry.scene.stage)
    return entry.scene
  }

  const updateChrome = () => {
    const card = CARDS[active]
    const position = tipPosition(active)
    eyebrow.textContent = position ? `${t(featureById(position.feature).name)} · ${t('{n} of {total}', { n: position.n, total: position.of })}` : t('Tips')
    eyebrow.dataset.feature = position?.feature ?? ''
    prevButton.disabled = active <= 0
    prevButton.classList.toggle('is-hidden', active <= 0)
    nextLabel.textContent = card.kind === 'cover' ? t('Get started') : card.kind === 'finale' ? t('Done') : t('Next')
    dotButtons.forEach((dot, i) => {
      dot.classList.toggle('is-on', i === active)
      if (i === active) dot.setAttribute('aria-current', 'step')
      else dot.removeAttribute('aria-current')
    })
    cards.forEach((entry, i) => {
      entry.article.toggleAttribute('inert', i !== active)
      entry.article.setAttribute('aria-hidden', String(i !== active))
      entry.article.classList.toggle('is-active', i === active)
    })
  }

  const setActive = (index) => {
    if (index === active) return
    active = index
    state.at = index
    save()
    updateChrome()
    live.textContent = `${t('{n} of {total}', { n: index + 1, total: CARDS.length })}: ${t(CARDS[index].title)}`
    // Build the scenes beside this one, so the next swipe starts with its picture drawn.
    sceneFor(index)
    sceneFor(index + 1)
    sceneFor(index - 1)
  }

  /** Plays only the card that has settled in view; the others wait at their first frame. */
  let held = -1 // a scene held still for review (`hold`)
  const settle = () => {
    cards.forEach((entry, i) => {
      if (!entry.scene || i === held) return
      if (i === active && isOpen && document.visibilityState === 'visible') {
        if (!entry.scene.isPlaying()) {
          entry.scene.restart()
          entry.scene.play()
        }
      } else if (entry.scene.isPlaying() || i !== active) {
        entry.scene.restart()
      }
    })
    cards[active]?.article.classList.add('is-settled')
  }

  /** Parallax and the active card, from where each card is in the track. */
  const measure = () => {
    raf = 0
    const trackBox = track.getBoundingClientRect()
    if (!trackBox.width) return
    let best = 0
    let bestDistance = Infinity
    cards.forEach((entry, i) => {
      const r = entry.article.getBoundingClientRect()
      const p = (r.left - trackBox.left) / trackBox.width
      const distance = Math.abs(p)
      if (distance < bestDistance) {
        bestDistance = distance
        best = i
      }
      if (distance < 1.5) {
        entry.article.style.setProperty('--p', p.toFixed(4))
        entry.article.style.setProperty('--q', Math.min(1, distance).toFixed(4))
      }
    })
    if (best !== active) {
      cards[active]?.article.classList.remove('is-settled')
      setActive(best)
    }
  }
  const onScroll = () => {
    if (!raf) raf = requestAnimationFrame(measure)
    window.clearTimeout(settleTimer)
    settleTimer = window.setTimeout(settle, 140)
  }
  track.addEventListener('scroll', onScroll, { passive: true })

  const goTo = (index, { instant = false } = {}) => {
    const target = cards[Math.max(0, Math.min(CARDS.length - 1, index))]
    if (!target) return
    const behavior = instant || reducedQuery.matches ? 'auto' : 'smooth'
    // Scroll the track only: scrollIntoView could move the page behind the sheet.
    const trackBox = track.getBoundingClientRect()
    const r = target.article.getBoundingClientRect()
    // A jump past several cards (a dot, Home, End) fades across rather than sliding through them.
    const far = Math.abs(Number(target.article.dataset.index) - active) > 1
    if (far && behavior === 'smooth') {
      window.clearTimeout(jumpTimer)
      track.classList.add('is-jumping')
      track.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 120, easing: 'ease-in', fill: 'forwards' })
      jumpTimer = window.setTimeout(() => {
        const now = track.getBoundingClientRect()
        const there = target.article.getBoundingClientRect()
        track.scrollBy({ left: there.left - now.left, behavior: 'auto' })
        measure()
        settle()
        track.classList.remove('is-jumping')
        track.getAnimations().forEach((a) => a.cancel())
        track.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'ease-out' })
      }, 120)
      return
    }
    if (far) track.classList.add('is-jumping')
    track.scrollBy({ left: r.left - trackBox.left, behavior })
    if (far) track.classList.remove('is-jumping')
    if (behavior === 'auto') {
      measure()
      settle()
    }
  }
  const step = (delta) => {
    if (delta > 0 && active >= CARDS.length - 1) return close()
    goTo(active + delta)
  }
  prevButton.addEventListener('click', () => step(-1))
  nextButton.addEventListener('click', () => step(1))
  closeButton.addEventListener('click', () => close())

  /* ------------------------------------------------------------------ keyboard and focus */
  const focusables = () => [...sheet.querySelectorAll('button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')].filter((el) => !el.closest('[inert]') && el.offsetParent !== null)
  const onKey = (event) => {
    if (!isOpen) return
    const forward = rtl ? 'ArrowLeft' : 'ArrowRight'
    const backward = rtl ? 'ArrowRight' : 'ArrowLeft'
    if (event.key === 'Escape') {
      event.preventDefault()
      close()
    } else if (event.key === forward && !event.altKey) {
      event.preventDefault()
      if (active < CARDS.length - 1) goTo(active + 1)
    } else if (event.key === backward && !event.altKey) {
      event.preventDefault()
      goTo(active - 1)
    } else if (event.key === 'Home') {
      event.preventDefault()
      goTo(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      goTo(CARDS.length - 1)
    } else if (event.key === 'Tab') {
      const list = focusables()
      if (!list.length) return
      const index = list.indexOf(document.activeElement)
      if (event.shiftKey && (index <= 0 || index === -1)) {
        event.preventDefault()
        list[list.length - 1].focus()
      } else if (!event.shiftKey && index === list.length - 1) {
        event.preventDefault()
        list[0].focus()
      } else if (index === -1) {
        event.preventDefault()
        list[0].focus()
      }
    }
  }

  // The page behind does not scroll while the sheet is open; sideways swipes page the tips.
  const onWheel = (event) => {
    const inTrack = track.contains(event.target)
    const sideways = Math.abs(event.deltaX) > Math.abs(event.deltaY)
    const text = event.target.closest?.('.tips-text')
    const textScrolls = text && text.scrollHeight > text.clientHeight + 1
    if ((inTrack && sideways) || textScrolls) return
    event.preventDefault()
  }
  const onTouchMove = (event) => {
    if (!sheet.contains(event.target)) event.preventDefault()
  }

  /* ------------------------------------------------------------------ the scrim's hole */
  let scrimRaf = 0
  let lastPath = ''
  const drawScrim = () => {
    scrimRaf = 0
    const vp = { width: document.documentElement.clientWidth, height: window.innerHeight }
    scrim.setAttribute('viewBox', `0 0 ${vp.width} ${vp.height}`)
    const widget = document.getElementById('vodafone-aw-icon')
    const holes = []
    if (widget?.isConnected) {
      const r = widget.getBoundingClientRect()
      if (r.width && r.height) {
        const hole = inflate(box(r), 4)
        hole.radius = hole.width / 2
        holes.push(hole)
      }
    }
    const path = scrimPath(vp, holes)
    if (path !== lastPath) {
      scrimShape.setAttribute('d', path)
      lastPath = path
    }
    blur.style.clipPath = holes.length ? `path(evenodd, '${path}')` : ''
  }
  const queueScrim = () => {
    if (!scrimRaf) scrimRaf = requestAnimationFrame(drawScrim)
  }

  /* ------------------------------------------------------------------ drag down to close (phones) */
  let drag = null
  const onDragStart = (event) => {
    if (!phoneQuery.matches || event.button > 0) return
    if (!(event.target === grabber || event.target.closest('.tips-head'))) return
    if (event.target.closest('button')) return
    drag = { id: event.pointerId, y: event.clientY, t: performance.now(), dy: 0 }
    sheet.setPointerCapture(event.pointerId)
    sheet.classList.add('is-dragging')
  }
  const onDragMove = (event) => {
    if (!drag || event.pointerId !== drag.id) return
    drag.dy = Math.max(0, event.clientY - drag.y)
    sheet.style.transform = `translateY(${drag.dy}px)`
  }
  const onDragEnd = (event) => {
    if (!drag || event.pointerId !== drag.id) return
    const velocity = drag.dy / Math.max(1, performance.now() - drag.t)
    const { dy } = drag
    drag = null
    sheet.classList.remove('is-dragging')
    if (dy > 110 || velocity > 0.6) return close({ fromDrag: dy })
    sheet.animate([{ transform: `translateY(${dy}px)` }, { transform: 'translateY(0)' }], { duration: 320, easing: SHEET_EASE })
    sheet.style.transform = ''
  }
  sheet.addEventListener('pointerdown', onDragStart)
  sheet.addEventListener('pointermove', onDragMove)
  sheet.addEventListener('pointerup', onDragEnd)
  sheet.addEventListener('pointercancel', onDragEnd)

  /* ------------------------------------------------------------------ open and close */
  let returnFocus = null
  let animating = null

  const sheetFrom = (rect) => {
    const s = sheet.getBoundingClientRect()
    if (!rect || !s.width) return null
    const scale = Math.max(0.08, Math.min(rect.width / s.width, rect.height / s.height))
    const dx = rect.left + rect.width / 2 - (s.left + s.width / 2)
    const dy = rect.top + rect.height / 2 - (s.top + s.height / 2)
    return `translate(${dx}px, ${dy}px) scale(${scale})`
  }

  const open = async ({ at = state.at, from = null } = {}) => {
    try {
      if (isOpen) return goTo(at)
      coach.stop()
      isOpen = true
      returnFocus = document.activeElement
      renderActions()
      root.hidden = false
      document.documentElement.classList.add('tips-open')
      state.seen = true
      save()
      drawScrim()
      window.addEventListener('resize', queueScrim)
      window.addEventListener('scroll', queueScrim, { passive: true })
      document.addEventListener('keydown', onKey, true)
      root.addEventListener('wheel', onWheel, { passive: false })
      root.addEventListener('touchmove', onTouchMove, { passive: false })
      // Lay the cards out, jump to the saved one without animation, then animate the sheet in.
      active = -1
      await new Promise((resolve) => requestAnimationFrame(resolve))
      goTo(at, { instant: true })
      measure()
      updateChrome()
      const reduced = reducedQuery.matches
      animating?.cancel()
      root.classList.add('is-open')
      if (reduced) {
        animating = sheet.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160, easing: 'linear' })
      } else if (phoneQuery.matches) {
        animating = sheet.animate([{ transform: 'translateY(100%)' }, { transform: 'translateY(0)' }], { duration: 480, easing: SHEET_EASE })
      } else {
        const fromTransform = sheetFrom(from)
        animating = sheet.animate(
          fromTransform
            ? [
                { transform: fromTransform, opacity: 0.2, borderRadius: '40px' },
                { transform: 'none', opacity: 1, borderRadius: '20px' },
              ]
            : [
                { transform: 'translateY(18px) scale(.94)', opacity: 0 },
                { transform: 'none', opacity: 1 },
              ],
          { duration: fromTransform ? 520 : 380, easing: POP_EASE },
        )
      }
      cards[active]?.article.querySelector('.tips-title')?.focus({ preventScroll: true })
      await animating.finished.catch(() => {})
      animating = null
      settle()
    } catch (error) {
      console.warn('[tips] the tips could not open:', error)
      try {
        hideNow()
      } catch {
        // Nothing more to undo.
      }
    }
  }

  const hideNow = () => {
    isOpen = false
    root.classList.remove('is-open')
    root.hidden = true
    document.documentElement.classList.remove('tips-open')
    window.removeEventListener('resize', queueScrim)
    window.removeEventListener('scroll', queueScrim)
    document.removeEventListener('keydown', onKey, true)
    root.removeEventListener('wheel', onWheel)
    root.removeEventListener('touchmove', onTouchMove)
    sheet.style.transform = ''
    for (const entry of cards) entry.scene?.restart()
  }

  /** Closes the sheet; `to` is a rect it shrinks into (the control a "Try it" leads to). */
  const close = async ({ to = null, fromDrag = 0, restoreFocus = true } = {}) => {
    if (!isOpen) return
    isOpen = false
    for (const entry of cards) entry.scene?.pause()
    const reduced = reducedQuery.matches
    animating?.cancel()
    root.classList.add('is-closing')
    try {
      if (reduced) {
        animating = sheet.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 140, easing: 'linear', fill: 'forwards' })
      } else if (phoneQuery.matches && !to) {
        animating = sheet.animate([{ transform: `translateY(${fromDrag}px)` }, { transform: 'translateY(100%)' }], { duration: 300, easing: SHEET_EASE, fill: 'forwards' })
      } else {
        const toTransform = sheetFrom(to ?? (entryButton?.isConnected ? entryButton.getBoundingClientRect() : null))
        animating = sheet.animate(
          toTransform
            ? [
                { transform: 'none', opacity: 1 },
                { transform: toTransform, opacity: 0 },
              ]
            : [
                { transform: 'none', opacity: 1 },
                { transform: 'translateY(12px) scale(.96)', opacity: 0 },
              ],
          { duration: toTransform ? 420 : 240, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' },
        )
      }
      root.classList.remove('is-open')
      await animating.finished.catch(() => {})
    } catch {
      // Close anyway.
    }
    animating?.cancel()
    animating = null
    root.classList.remove('is-closing')
    hideNow()
    if (restoreFocus) {
      const back = returnFocus?.isConnected && returnFocus !== document.body ? returnFocus : entryButton
      back?.focus?.({ preventScroll: true })
    }
  }

  /* ------------------------------------------------------------------ "Try it" */
  const flows = buildFlows({
    t,
    pocket,
    example: EXAMPLE[lang] ?? EXAMPLE.en,
    templateName: t(ctx.template('coverflow')?.name ?? 'Cover flow'),
    rtl,
  })
  const coach = createCoach({
    t,
    rtl,
    isReduced: () => reducedQuery.matches,
    featureIcon,
    onBackToTips: (featureId) => {
      state.tried[featureId] = true
      save()
      // Back to the tips, on the card after this demo's tips.
      const next = CARDS.findIndex((card, i) => i > firstTipOf(featureId) && card.feature !== featureId)
      open({ at: next === -1 ? CARDS.length - 1 : next, from: entryButton?.isConnected ? entryButton.getBoundingClientRect() : null })
    },
  })

  const startTry = async (featureId, source) => {
    const flow = flows[featureId]
    if (!flow) return
    const first = flow.steps[0]?.target?.()
    const rect = first?.getBoundingClientRect?.()
    await close({ to: rect && rect.width ? rect : null, restoreFocus: false })
    const result = await coach.run(flow)
    if (result === 'done' || result === 'tips') {
      state.tried[featureId] = true
      save()
    }
    if (result === 'missing') {
      live.textContent = t(unavailableReason(featureId))
      open({ at: firstTipOf(featureId) })
    }
    if (result === 'exit' && entryButton?.isConnected) entryButton.focus({ preventScroll: true })
    return result
  }

  const onVisibility = () => settle()
  document.addEventListener('visibilitychange', onVisibility)
  const onMotion = () => {
    for (const entry of cards) entry.scene?.restart()
    settle()
  }
  reducedQuery.addEventListener?.('change', onMotion)

  return {
    open,
    close,
    isOpen: () => isOpen,
    goTo,
    active: () => active,
    tryFeature: (featureId) => startTry(featureId, null),
    /** Testing and review (`?aixc-debug`): hold a scene at a moment. */
    hold: (index, time) => {
      held = index
      const scene = sceneFor(index)
      scene?.pause()
      scene?.seek(time)
      return Boolean(scene)
    },
    coach,
    destroy: () => {
      hideNow()
      coach.destroy()
      document.removeEventListener('visibilitychange', onVisibility)
      reducedQuery.removeEventListener?.('change', onMotion)
      for (const entry of cards) entry.scene?.destroy()
      root.remove()
    },
  }
}
