/**
 * Your journey, in the pocket. When the Voice Guide's Exploration Trail runs on this page
 * (voice-guide ADR-0040), the journey is shown here, in the album's own design, instead of
 * in a sheet of the guide's:
 *
 *   1. "Your journey" sits beside "Back to Services", and a slim slider of the pages you
 *      visited runs under the bar: album dots on a stitched thread, red where you have been.
 *   2. Pressing either lays a lightly frosted layer over the album. The memory of a page
 *      (a sandboxed replay the trail renders into our frame), what you explored there and
 *      the questions you could ask float in one after another.
 *   3. A question turns the page back to Services and asks the guide, which answers there.
 *
 * The trail owns recording, storage, the replay and every word (api.t); this file only draws
 * and forwards intents. Everything here is marked data-vg, so it is never recorded itself.
 * Without the guide on the page nothing here appears.
 */

import { make } from './pocket.js'

const SVG_NS = 'http://www.w3.org/2000/svg'
const STAGGER_FROM = 4 // explored notes float in after the heading, memory and tools
const LEAVE_MS = 220
const KEY_STEP = 0.05 // arrow keys move 5% through a page

/** 24×24 stroke icons drawn for the journey, in the pocket's icon style. */
const ICONS = {
  journey: ['M4 18a2 2 0 1 0 4 0a2 2 0 1 0-4 0', 'M16 6a2 2 0 1 0 4 0a2 2 0 1 0-4 0', 'M8 18h8a3 3 0 0 0 0-6H8a3 3 0 0 1 0-6h8'],
  play: ['M8 5.5v13l10.5-6.5z'],
  pause: ['M8.5 5.5v13M15.5 5.5v13'],
  close: ['M7 7l10 10M17 7 7 17'],
  ask: ['M5 6h14v9.5h-8L7 19v-3.5H5z', 'M9 10.75h6'],
  lock: ['M7 11V8a5 5 0 0 1 10 0v3', 'M5.5 11h13v9h-13z'],
}

const icon = (name, className) => {
  const svg = document.createElementNS(SVG_NS, 'svg')
  for (const [key, value] of Object.entries({ viewBox: '0 0 24 24', class: className, 'aria-hidden': 'true', focusable: 'false', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' })) {
    svg.setAttribute(key, value)
  }
  for (const d of ICONS[name]) {
    const path = document.createElementNS(SVG_NS, 'path')
    path.setAttribute('d', d)
    svg.append(path)
  }
  return svg
}

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
const granted = (s) => s.consent === 'granted' || s.consent === 'paused'
const titleIn = (lang) => (t) => (t ? t[lang] || t[lang.slice(0, 2)] || t.en || Object.values(t)[0] || '' : '')

export const initJourney = ({ pocket }) => {
  const { root, view, barStart, stage } = pocket.dock
  const header = document.querySelector('.site-header')

  let api = null
  let snap = null
  let open = false // the frosted layer is showing
  let leaving = 0
  let asking = false // a question is turning the page back; the trail must keep its selection
  let pending = null // { stepId, fraction, how }: a position waiting for that page's memory to load
  let dragging = false
  let pages = []
  let stopsKey = ''
  let notesKey = ''
  const t = (key, vars) => api?.t(key, vars) ?? ''

  /* ---------------------------------------------- the button beside Back */
  const ctaLabel = make('span')
  const cta = make(
    'button',
    { type: 'button', class: 'pocket-back pocket-journey-cta', 'aria-expanded': 'false', 'aria-controls': 'pocket-journey-layer', hidden: true, 'data-vg': '' },
    icon('journey', 'pocket-journey-cta__icon'),
    ctaLabel,
    make('span', { class: 'pocket-journey-cta__dot', 'aria-hidden': 'true' }),
  )
  barStart.append(cta)

  /* ------------------------------------------ the slim slider under the bar */
  const stops = make('ol', { class: 'pocket-journey-rail__stops', 'aria-hidden': 'true' })
  const tag = make('span', { class: 'pocket-journey-rail__tag', 'aria-hidden': 'true' })
  const rail = make(
    'div',
    { class: 'pocket-journey-rail', role: 'slider', tabindex: '0', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': '0' },
    make('span', { class: 'pocket-journey-rail__thread', 'aria-hidden': 'true' }),
    make('span', { class: 'pocket-journey-rail__fill', 'aria-hidden': 'true' }),
    stops,
    make('span', { class: 'pocket-journey-rail__knob', 'aria-hidden': 'true' }, tag),
  )
  const where = make('span', { class: 'pocket-journey__where', dir: 'auto' })
  const savedText = make('span')
  const band = make(
    'div',
    { class: 'pocket-journey', hidden: true, 'data-vg': '' },
    make(
      'div',
      { class: 'container pocket-journey__inner' },
      rail,
      make('p', { class: 'pocket-journey__caption' }, where, make('span', { class: 'pocket-journey__saved' }, icon('lock', 'pocket-journey__saved-icon'), savedText)),
    ),
  )
  view.insertBefore(band, stage)

  /* -------------------------------------------------- the frosted layer */
  const layerTitle = make('h2', { class: 'pocket-journey-layer__title', id: 'pocket-journey-title' })
  // Saving is controlled where it is described: "Saved on this device · Pause · Clear journey".
  const layerSubText = make('span')
  const layerSub = make('p', { class: 'pocket-journey-layer__sub' })
  const closeLabel = make('span')
  const closeButton = make('button', { type: 'button', class: 'pocket-clear pocket-journey-close' }, icon('close', 'pocket-journey-close__icon'), closeLabel)

  // The trail renders the sandboxed replay into this frame (api.setPreviewRoot).
  const frame = make('div', { class: 'pocket-journey-memory__frame', inert: true, 'aria-hidden': 'true' })
  const veil = make('div', { class: 'pocket-journey-memory__veil' })
  const led = make('p', { class: 'pocket-journey-memory__led', hidden: true })
  const memoryFrom = make('span', { class: 'pocket-journey-memory__from' })
  const memoryTitle = make('span', { class: 'pocket-journey-memory__title', dir: 'auto' })
  const memory = make(
    'figure',
    { class: 'pocket-journey-memory pocket-journey-float', style: { '--i': '1' } },
    make('div', { class: 'pocket-journey-memory__window' }, frame, veil, led),
    make('figcaption', { class: 'pocket-journey-memory__caption' }, memoryFrom, memoryTitle),
  )

  const playLabel = make('span')
  const playIcon = make('span', { class: 'pocket-journey-play__icon' })
  const playButton = make('button', { type: 'button', class: 'pocket-back pocket-back--solid pocket-journey-play' }, playIcon, playLabel)
  const savingButton = make('button', { type: 'button', class: 'pocket-clear pocket-journey-saving' })
  const clearJourney = make('button', { type: 'button', class: 'pocket-clear pocket-journey-saving' })
  const tools = make('div', { class: 'pocket-journey-tools pocket-journey-float', style: { '--i': '2' } }, playButton)
  layerSub.append(layerSubText, savingButton, clearJourney)

  const exploredHead = make('h3', { class: 'pocket-journey-heading pocket-journey-float', style: { '--i': '3' } })
  const notes = make('ul', { class: 'pocket-journey-notes', role: 'list' })
  const none = make('p', { class: 'pocket-journey-none pocket-journey-float', style: { '--i': String(STAGGER_FROM) }, hidden: true })

  const consentTitle = make('h3', { class: 'pocket-journey-consent__title' })
  const consentBody = make('p', { class: 'pocket-journey-consent__body' })
  const consentList = make('ul', { class: 'pocket-journey-consent__list', role: 'list' })
  const allowButton = make('button', { type: 'button', class: 'pocket-back pocket-back--solid' })
  const notNowButton = make('button', { type: 'button', class: 'pocket-clear' })
  const consent = make(
    'div',
    { class: 'pocket-journey-consent pocket-journey-float', style: { '--i': '1' } },
    consentTitle,
    consentBody,
    consentList,
    make('div', { class: 'pocket-journey-consent__actions' }, allowButton, notNowButton),
  )

  const layer = make(
    'div',
    { id: 'pocket-journey-layer', class: 'pocket-journey-layer', role: 'region', 'aria-labelledby': 'pocket-journey-title', hidden: true, 'data-vg': '' },
    make(
      'div',
      { class: 'container pocket-journey-layer__inner' },
      make('div', { class: 'pocket-journey-layer__top pocket-journey-float', style: { '--i': '0' } }, make('div', null, layerTitle, layerSub), closeButton),
      make(
        'div',
        { class: 'pocket-journey-layer__grid' },
        make('div', { class: 'pocket-journey-layer__main' }, memory, tools),
        make('div', { class: 'pocket-journey-layer__side' }, exploredHead, notes, none),
      ),
      consent,
    ),
  )
  stage.append(layer)

  /* ----------------------------------------------------------- render */
  const selectedIndex = (s) => {
    const i = pages.findIndex((p) => p.id === s.selectedStepId)
    if (i >= 0) return i
    // Closed: the thread ends at the page you are on.
    const here = pages.findIndex((p) => p.id === s.currentStepId)
    return here >= 0 ? here : pages.length - 1
  }

  const renderStops = (s) => {
    const key = pages.map((p) => p.id).join(' ') + `|${s.currentStepId}`
    if (key === stopsKey) return
    stopsKey = key
    stops.replaceChildren(
      ...pages.map((p, i) =>
        make('li', { class: `pocket-journey-rail__stop${p.id === s.currentStepId ? ' is-here' : ''}`, 'data-step': p.id, style: { '--at': String(i / pages.length) } }),
      ),
    )
  }

  const renderRail = (s) => {
    const title = titleIn(s.lang)
    const n = pages.length
    const i = selectedIndex(s)
    const fraction = s.selectedStepId ? s.position : i === n - 1 ? 1 : 0
    const at = n ? clamp((i + fraction) / n, 0, 1) : 0
    rail.style.setProperty('--at', String(at))
    for (const [k, stop] of [...stops.children].entries()) stop.classList.toggle('is-passed', k < i || (k === i && s.selectedStepId !== null))
    const page = pages[i]
    const name = page ? (page.id === s.currentStepId ? t('here') : title(page.title)) : ''
    tag.textContent = name
    const stepText = page ? t('step', { n: i + 1, total: n, title: title(page.title) }) : ''
    where.textContent = stepText
    rail.setAttribute('aria-label', t('steps'))
    rail.setAttribute('aria-valuenow', String(Math.round(at * 100)))
    rail.setAttribute('aria-valuetext', page ? `${stepText}. ${t('positionValue', { pct: Math.round(fraction * 100), title: title(page.title) })}` : t('empty'))
    savedText.textContent = s.consent === 'paused' || s.rec === 'paused' ? t('paused') : t('saved')
  }

  const noteFor = (item, k, s) => {
    const title = titleIn(s.lang)
    const questions = (item.questions?.[s.lang] || item.questions?.[s.lang.slice(0, 2)] || []).slice(0, 3)
    const busy = s.action !== 'none'
    const chips = questions.map((q) => {
      const chip = make(
        'button',
        { type: 'button', class: 'pocket-journey-chip', 'aria-busy': s.activeQuestionId === q.id ? 'true' : null, disabled: busy },
        icon('ask', 'pocket-journey-chip__icon'),
        make('span', null, q.text),
      )
      chip.addEventListener('click', () => ask(item, q))
      return chip
    })
    const context = title(item.context)
    return make(
      'li',
      { class: 'pocket-journey-note pocket-journey-float', style: { '--i': String(STAGGER_FROM + k), '--tilt': `${k % 2 ? 0.7 : -0.6}deg` } },
      make('p', { class: 'pocket-journey-note__why' }, t(`why_${item.reason}`)),
      make('p', { class: 'pocket-journey-note__title', dir: 'auto' }, title(item.title)),
      context && context !== title(item.title) ? make('p', { class: 'pocket-journey-note__context', dir: 'auto' }, context) : null,
      item.popular ? make('p', { class: 'pocket-journey-note__popular' }, t('popular')) : null,
      chips.length ? make('div', { class: 'pocket-journey-note__chips', role: 'group', 'aria-label': t('ask') }, chips) : null,
    )
  }

  const renderNotes = (s) => {
    const key = [s.selectedStepId, s.activeQuestionId, s.action, s.lang, ...s.explored.map((x) => x.destinationId)].join('|')
    none.hidden = s.explored.length > 0 || s.preview === 'loading'
    none.textContent = t('nothingExplored')
    if (key === notesKey) return
    notesKey = key
    notes.replaceChildren(...s.explored.map((item, k) => noteFor(item, k, s)))
  }

  const renderConsent = (s) => {
    consentTitle.textContent = t('consentTitle')
    consentBody.textContent = t('consentBody')
    const lines = [t('consentWhat'), t('consentNot'), t('consentWhere', { hours: s.retentionHours }), t(s.aggregation ? 'consentAggregateOn' : 'consentAggregateOff'), t('consentControl')]
    if (consentList.childElementCount !== lines.length || consentList.textContent !== lines.join('')) consentList.replaceChildren(...lines.map((line) => make('li', null, line)))
    allowButton.textContent = t('allow')
    notNowButton.textContent = t('notNow')
  }

  const render = (s) => {
    snap = s
    const title = titleIn(s.lang)
    pages = s.steps.filter((step) => step.type === 'page')
    const rtl = /^ar/.test(s.lang)
    for (const node of [band, layer]) {
      node.lang = s.lang
      node.dir = rtl ? 'rtl' : 'ltr'
    }
    cta.hidden = false
    cta.dataset.rec = s.rec
    ctaLabel.textContent = t('journey')
    cta.setAttribute('aria-label', open ? t('close') : t('open'))
    band.hidden = !granted(s) || pages.length === 0
    renderStops(s)
    renderRail(s)

    // The trail closed the journey itself (a question, clearing it, turning it off).
    if (open && layer.dataset.mode === 'journey' && !s.open && !asking) hideLayer({ tell: false })
    // Consent given from the layer: the journey opens in its place.
    if (open && layer.dataset.mode === 'consent' && granted(s)) {
      layer.dataset.mode = 'journey'
      api.open()
      return
    }
    if (!open) return

    layerTitle.textContent = t('journey')
    layerSubText.textContent = s.consent === 'paused' || s.rec === 'paused' ? t('paused') : t('saved')
    closeLabel.textContent = t('close')
    if (layer.dataset.mode === 'consent') return renderConsent(s)

    const page = pages.find((p) => p.id === s.selectedStepId)
    memoryFrom.textContent = t('memoryShort')
    memoryTitle.textContent = page ? title(page.title) : ''
    memory.setAttribute('aria-label', page ? t('memory', { title: title(page.title) }) : t('journey'))
    const veilText = !pages.length ? t('empty') : s.preview === 'loading' ? t('loading') : s.preview === 'error' ? t('noPreview') : ''
    veil.textContent = veilText
    veil.hidden = !veilText
    led.textContent = s.transition ?? ''
    led.hidden = !s.transition
    const playing = s.preview === 'playing'
    playIcon.replaceChildren(icon(playing ? 'pause' : 'play', 'pocket-journey-play__svg'))
    playLabel.textContent = t(playing ? 'stop' : 'play')
    playButton.disabled = !['ready', 'playing', 'scrubbing'].includes(s.preview)
    savingButton.textContent = s.consent === 'paused' || s.rec === 'paused' ? t('resume') : t('pause')
    clearJourney.textContent = t('clear')
    exploredHead.textContent = t('explored')
    renderNotes(s)

    // A position chosen on another page's thread, now that its memory is ready.
    if (pending && pending.stepId === s.selectedStepId && s.preview === 'ready') {
      const { stepId, fraction, how } = pending
      pending = null
      api.scrub(stepId, fraction, how)
      if (!dragging && how !== 'keyboard') api.hold()
    }
  }

  /* ---------------------------------------------------- open and close */
  const placeBand = () => band.style.setProperty('--pocket-journey-top', `${Math.round(header?.getBoundingClientRect().height ?? 0)}px`)

  const showLayer = () => {
    window.clearTimeout(leaving)
    layer.classList.remove('is-leaving')
    const s = api.snapshot()
    layer.dataset.mode = granted(s) ? 'journey' : 'consent'
    notesKey = ''
    placeBand()
    layer.hidden = false
    open = true
    root.dataset.journey = 'open'
    cta.setAttribute('aria-expanded', 'true')
    if (layer.dataset.mode === 'journey') api.open()
    render(api.snapshot())
  }

  const hideLayer = ({ tell = true, focus = null } = {}) => {
    if (!open) return
    open = false
    pending = null
    delete root.dataset.journey
    cta.setAttribute('aria-expanded', 'false')
    cta.setAttribute('aria-label', t('open'))
    if (tell && layer.dataset.mode === 'journey') api.close()
    if (reducedMotion()) layer.hidden = true
    else {
      layer.classList.add('is-leaving')
      leaving = window.setTimeout(() => {
        layer.hidden = true
        layer.classList.remove('is-leaving')
      }, LEAVE_MS)
    }
    focus?.focus({ preventScroll: true })
  }

  const openJourney = async () => {
    if (!api) return
    if (pocket.state.view !== 'pocket') {
      await pocket.open()
      if (pocket.state.view !== 'pocket') return
    }
    if (!open) showLayer()
  }

  /** A question is asked on the Services page, where the guide can point at the answer. */
  const ask = async (item, q) => {
    asking = true
    hideLayer({ tell: false })
    await pocket.close()
    asking = false
    api.ask(item.destinationId, q.id)
  }

  /* ------------------------------------------------- slider interaction */
  const isRtl = () => getComputedStyle(rail).direction === 'rtl'

  const locate = (clientX) => {
    const box = rail.getBoundingClientRect()
    let x = clamp((clientX - box.left) / Math.max(1, box.width), 0, 0.9999)
    if (isRtl()) x = 0.9999 - x
    const i = Math.floor(x * pages.length)
    return { page: pages[i], fraction: clamp(x * pages.length - i, 0, 1) }
  }

  const seek = async (page, fraction, how) => {
    if (!page || !api) return
    if (!open) await openJourney()
    if (!open) return
    if (snap.selectedStepId === page.id && snap.preview !== 'loading') {
      api.scrub(page.id, fraction, how)
      return
    }
    pending = fraction > 0.01 ? { stepId: page.id, fraction, how } : null
    if (snap.selectedStepId !== page.id) api.select(page.id)
  }

  rail.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || !pages.length) return
    event.preventDefault()
    dragging = true
    rail.classList.add('is-dragging')
    try {
      rail.setPointerCapture(event.pointerId)
    } catch {
      // A pointer that is already gone (or a synthetic one) still scrubs, just without capture.
    }
    rail.focus({ preventScroll: true })
    const { page, fraction } = locate(event.clientX)
    seek(page, fraction, event.pointerType === 'touch' ? 'touch' : 'pointer')
  })
  rail.addEventListener('pointermove', (event) => {
    if (!dragging) return
    const { page, fraction } = locate(event.clientX)
    seek(page, fraction, event.pointerType === 'touch' ? 'touch' : 'pointer')
  })
  const release = () => {
    if (!dragging) return
    dragging = false
    rail.classList.remove('is-dragging')
    // Letting go plays on from there (the trail never autoplays under reduced motion).
    if (!pending) api?.hold()
  }
  rail.addEventListener('pointerup', release)
  rail.addEventListener('pointercancel', release)
  rail.addEventListener('lostpointercapture', release)

  rail.addEventListener('keydown', (event) => {
    if (!pages.length || !snap) return
    const n = pages.length
    let i = selectedIndex(snap)
    let fraction = snap.selectedStepId ? snap.position : 0
    const [back, forward] = isRtl() ? ['ArrowRight', 'ArrowLeft'] : ['ArrowLeft', 'ArrowRight']
    switch (event.key) {
      case forward:
      case 'ArrowUp':
        if (fraction >= 1 && i < n - 1) [i, fraction] = [i + 1, 0]
        else fraction = Math.min(1, fraction + KEY_STEP)
        break
      case back:
      case 'ArrowDown':
        if (fraction <= 0 && i > 0) [i, fraction] = [i - 1, 1]
        else fraction = Math.max(0, fraction - KEY_STEP)
        break
      case 'PageUp':
        ;[i, fraction] = [Math.min(n - 1, i + 1), 0]
        break
      case 'PageDown':
        ;[i, fraction] = [Math.max(0, i - 1), 0]
        break
      case 'Home':
        ;[i, fraction] = [0, 0]
        break
      case 'End':
        ;[i, fraction] = [n - 1, 0]
        break
      case 'Enter':
      case ' ':
        event.preventDefault()
        if (open) api.togglePlay()
        else openJourney()
        return
      default:
        return
    }
    event.preventDefault()
    seek(pages[i], fraction, 'keyboard')
  })

  /* --------------------------------------------------------- the rest */
  cta.addEventListener('click', () => (open ? hideLayer({ focus: cta }) : openJourney()))
  closeButton.addEventListener('click', () => hideLayer({ focus: cta }))
  playButton.addEventListener('click', () => api?.togglePlay())
  savingButton.addEventListener('click', () => (snap?.consent === 'paused' || snap?.rec === 'paused' ? api.resume() : api.pause()))
  clearJourney.addEventListener('click', () => {
    api.clear()
    hideLayer({ tell: false, focus: cta })
  })
  allowButton.addEventListener('click', () => api.allow())
  notNowButton.addEventListener('click', () => {
    api.notNow()
    hideLayer({ tell: false, focus: cta })
  })
  // Escape closes the journey first; the pocket's own Escape (turn the page back) comes next.
  for (const node of [layer, band, cta]) {
    node.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || !open) return
      event.preventDefault()
      event.stopPropagation()
      hideLayer({ focus: cta })
    })
  }
  root.addEventListener('pocket:view', (event) => {
    if (event.detail === 'closing') hideLayer({ tell: !asking })
  })
  window.addEventListener('resize', () => open && placeBand())

  const attach = (host) => {
    if (api || !host || host.version !== 1) return
    api = host
    api.setPreviewRoot(frame)
    // With a journey to show, the page turns to the pocket even when no stickers are kept.
    pocket.openWhenEmpty(() => true)
    api.subscribe(render)
  }
  attach(window.voiceGuide?.trailHost)
  window.addEventListener('vg:trail-ready', (event) => attach(event.detail))
  window.addEventListener('vg:trail-open', () => openJourney())

  return { open: openJourney, close: () => hideLayer({ focus: cta }) }
}
