/**
 * Reimagine's shell on Vodafone's own pages (live plan phase 4a; voice-guide ADR-0076, phase 4 design §3.1 to §3.5):
 * the composer, the view bar and the box the reimagined view scrolls in. A chunk of its own: the launcher
 * (../reimagine.js) imports it on its first press and calls open(ctx) on every press; each experience is a chunk of
 * its own again (./registry.js), asked for when its template is chosen.
 *
 * - The composer: templates only (no prompt, no key, no Gemini, owner 2026-11-10), one button per experience the
 *   registry has, from the cards of ../../../aixc/template-schema.js, and an Original / Reimagined segment
 *   (Reimagined once a view exists). Non-modal, below what opened it, or beside it on a short screen (./box.js);
 *   Escape closes it and gives the focus back; a press on the launcher opens or closes it; it closes when one of
 *   Vodafone's menus or dialogs opens (live.css), when the Pocket's album opens and on Original. A template whose
 *   chunk is still loading is dropped once the reader moves on (another template, Original, Reset, the composer closed
 *   by Escape, its close button or the launcher, the album), and kept when one of Vodafone's menus closes the
 *   composer; no view opens or closes under the album.
 * - The box: #experience-output becomes .aixc-box, in the flow after #main-content, as tall as the screen under
 *   where it rests below Vodafone's header, with its own scroll; PageHost's view bar is its first, sticky row; the experience
 *   renders into a stage after it, and an end band leads back to the page ("Original page") or on past the box to
 *   Vodafone's footer ("Continue to the page"). Its raw measures and the bottom corners' safe zones: ./box.js.
 * - Views: Reimagined hides #main-content (PageHost.hideSource, ADR-0075 §2), shows the box, scrolls the window so
 *   the box's top meets the header's bottom (or rests as close as the page lets it, its bottom at the screen's:
 *   align), and mounts the experience at the box's scroll the reader left it at (a new experience at its top). Original unmounts it, gives #main-content back as served (showSource), puts
 *   the window's scroll back where the reader left the page (B-28) and the launcher shows again. Reset is Original
 *   with the view dropped.
 * - The experiences' seam (shared.js configure): the box as their scroller, the guard's wrap, and the clone's words
 *   about services only on Vodafone's Services page ('items' elsewhere) while a view shows; configure() again on
 *   Original, Reset and the guard's stop, which undoes every listener, frame and timer they keep.
 * - The model: re-indexed from a copy on every new reading (the core's model is frozen), with the page's own name
 *   as the title where it has no hero; a view that shows is not drawn again under the reader's eyes (a note says the
 *   page changed). Each section's destination (ADR-0049 §4) is put on its container in the view.
 * - The Pocket reads state.view and state.activeExperience (its album unmounts and mounts the view; mount puts the
 *   box's scroll back) and state.boxScroll (its turning copy). The trail's cover (ADR-0075 §8) is #main-content with
 *   the attributes it has while it shows, set when the shell loads, on vg:trail-ready and before each hide.
 * - The icons the experiences draw from a sprite: only those the page lacks, prefixed aixc-, in one marked holder.
 * - Everything added carries data-aixc and data-vg; every handler, observer, frame and timer goes through the guard,
 *   and one destroy on the guard's stop gives the page back as Vodafone served it. Forced failures for the tests:
 *   checkpoints 'reimagine-open' and 'reimagine-render'.
 */
import faces from '../../vodafone-faces.css'
import css from './live.css'
import { h, pathIcon } from '../../../aixc/dom.js'
import { buildContentIndex } from '../../../aixc/content-index.js'
import { validateSchema } from '../../../aixc/schema-validator.js'
import { TEMPLATE_CARDS, buildTemplateSchema } from '../../../aixc/template-schema.js'
import { configure, keptCount } from '../../../aixc/experiences/shared.js'
import { t } from '../../../i18n.js'
import { EXPERIENCES } from './registry.js'
import { createBox } from './box.js'
import { say } from './copy.js'

const ICON_CLOSE = 'M18.3 7.1 16.9 5.7 12 10.6 7.1 5.7 5.7 7.1l4.9 4.9-4.9 4.9 1.4 1.4 4.9-4.9 4.9 4.9 1.4-1.4-4.9-4.9z'

/** The clone's words about services fit Vodafone's Services page only; elsewhere the experiences say 'items'. */
const SERVICES = /^\/(?:en|ar)\/services\/?$/i

/** What PageHost.hideSource changes on #main-content (and showSource gives back exactly). */
const HIDING = ['style', 'inert', 'hidden']

/** The page's own name, without the site's ("Services | Vodafone Egypt" → "Services"); as ../pocket.js reads it. */
const titleOf = (doc) => (doc.title || '').split(/\s+[|–-]\s+/)[0].trim() || null

/**
 * The symbols the experiences draw (dom.js svgIcon), as the clone's sprite has them: Vodafone's own pages carry them
 * today; a page that lacks one gets ours, id aixc-<id>.
 */
const SYMBOLS = {
  'icon-vodafone-logo-white': {
    viewBox: '0 0 36 36',
    d: 'M36 18c0 9.941-8.059 18-18 18S0 27.941 0 18 8.059 0 18 0c2.746 0 5.35.615 7.678 1.715-.31-.097-.796-.133-1.262-.133-3.746.013-7.877 1.615-10.892 4.112-3.09 2.565-5.509 6.88-5.497 11.361.021 6.778 5.167 11 10.113 10.983 6.11-.02 9.722-5.04 9.706-9.615-.015-4.576-2.503-7.883-7.984-9.218a1.871 1.871 0 0 1-.022-.293c-.011-3.456 2.592-6.502 5.864-7.185C31.791 4.614 36 10.816 36 18z',
  },
}

/**
 * The trail's cover (ADR-0075 §8): #main-content with the attributes it has while it shows, kept from the last time it
 * showed. One per page, on the host, so the journey's chunk (../journey.js) keeps it when it starts later.
 */
const coverOf = (host) => {
  let shown = null
  return {
    node: host.main,
    covered: () => host.sourceHidden,
    shown: () => (host.sourceHidden ? shown : (shown = Object.fromEntries(HIDING.map((name) => [name, host.main.getAttribute(name)])))),
  }
}

let shell = null

/** A press on the launcher: the composer opens, or closes when it is open. Resolves to { state } (the launcher keeps it). */
export const open = async (ctx) => {
  ctx.checkpoint('reimagine-open')
  if (ctx.guard.stopped) return null
  if (shell?.guard === ctx.guard) shell.toggle()
  else shell = createShell(ctx)
  return shell.handle
}

const createShell = ({ host, guard, layer, ensureCss, checkpoint, launcher }) => {
  ensureCss('vodafone-faces', faces)
  ensureCss('reimagine', css)
  const mark = (node) => {
    node.dataset.aixc = ''
    node.dataset.vg = ''
    return node
  }
  const copy = SERVICES.test(location.pathname) ? 'services' : 'items'

  /* ------------------------------------------------------------- the model */
  let index = null
  const reindex = (model) => {
    index = model?.sections?.some((section) => section.items?.length) ? buildContentIndex({ ...model, title: model.title?.trim() || titleOf(document) }) : null
  }
  reindex(layer.model)

  /* ------------------------------------------- frames and timers of our own */
  const frames = new Set()
  const timers = new Set()
  const nextFrame = (fn) => {
    const id = requestAnimationFrame(
      guard.wrap('reimagine frame', () => {
        frames.delete(id)
        fn()
      }),
    )
    frames.add(id)
  }
  const after = (fn, ms) => {
    const id = setTimeout(
      guard.wrap('reimagine timer', () => {
        timers.delete(id)
        fn()
      }),
      ms,
    )
    timers.add(id)
  }

  /* ------------------------------------------------------------- the state */
  let current = null // the experience (experience-wrap.js) the stage holds
  let kept = 0 // the box's scroll where the reader left the view, from the box's own scroll events
  let leftAt = null // the window's scroll where the reader left the page (B-28)
  let choosing = 0
  let returnTo = null
  let api = window.voiceGuide?.trailHost ?? null
  const box = host.outputRoot
  const bar = host.viewbar

  /** Mounted through the box: the box's scroll goes back where the reader left it first (the Pocket's album uses it). */
  const active = {
    get mounted() {
      return !!current?.mounted
    },
    mount() {
      if (!current || current.mounted) return
      box.scrollTop = kept
      current.mount()
    },
    unmount() {
      current?.unmount()
    },
    reveal: (itemId) => current?.reveal(itemId) ?? false,
  }
  const state = {
    /** 'original' or 'reimagined' (the Pocket and Tips read it, with body[data-aixc-view]). */
    view: 'original',
    activeExperience: null,
    template: null,
    composerOpen: false,
    /** The box's scroll as the reader sees it: the box's own while the view is mounted, else where it was left. */
    get boxScroll() {
      return state.view === 'reimagined' && !box.hidden && current?.mounted ? box.scrollTop : kept
    },
    /** For `?aixc-debug` and the tests. */
    debug: () => ({ kept: keptCount(), zones: measures.last.zones, pill: measures.last.pill, composer: measures.last.composer, leftAt, boxScroll: kept, copy }),
  }

  /* ------------------------------------------------------------- the trail */
  const cover = (host.trailCover ??= coverOf(host))
  const setCover = (to = api) => {
    api = to ?? api
    try {
      api?.setCover?.(cover)
    } catch {}
  }

  /* ------------------------------------------------------------- the words */
  const liveRegion = mark(h('div', { class: 'aixc-live', role: 'status', 'aria-live': 'polite' }))
  const announce = (text) => {
    liveRegion.textContent = ''
    after(() => (liveRegion.textContent = text), 60)
  }

  /* ---------------------------------------------------------- the composer */
  const seg = (view) => h('button', { type: 'button', class: 'aixc-seg', 'data-view': view, 'aria-pressed': String(view === 'original') }, t(view === 'original' ? 'Original' : 'Reimagined'))
  const segmented = (...buttons) => h('div', { class: 'aixc-segmented', role: 'group', 'aria-label': t('Page view') }, ...buttons)
  const composerSegs = [seg('original'), seg('reimagined')]
  const cards = TEMPLATE_CARDS.filter((card) => EXPERIENCES[card.experience])
  const templateButtons = cards.map((card) =>
    h('button', { type: 'button', class: 'aixc-template', 'data-template': card.id, 'aria-pressed': 'false' }, pathIcon(card.icon, 'aixc-template__icon'), h('span', { class: 'aixc-template__name' }, t(card.name))),
  )
  const closeButton = h('button', { type: 'button', class: 'aixc-icon-btn', 'aria-label': t('Close composer') }, pathIcon(ICON_CLOSE, 'aixc-icon'))
  const composer = mark(
    h(
      'section',
      { id: 'aixc-composer', class: 'aixc-composer', 'aria-labelledby': 'aixc-composer-title', lang: host.lang, dir: host.dir, hidden: true },
      h('div', { class: 'aixc-composer__head' }, h('h2', { id: 'aixc-composer-title', class: 'aixc-composer__title' }, t('Reimagine this page')), closeButton),
      segmented(...composerSegs),
      h('h3', { id: 'aixc-templates-title', class: 'aixc-templates__title' }, t('Ready-made experiences')),
      h('ul', { class: 'aixc-templates__list', 'aria-labelledby': 'aixc-templates-title' }, templateButtons.map((button) => h('li', null, button))),
    ),
  )
  // After the launcher (before #main-content): the Tab order goes from the launcher into the composer.
  launcher.button.after(composer, liveRegion)

  /* ----------------------------------------------------------- the view bar */
  const barSegs = [seg('original'), seg('reimagined')]
  const segs = [...composerSegs, ...barSegs]
  const meta = h('p', { class: 'aixc-viewbar__meta' })
  // As the clone's bar says it: "Change experience", "Change" on a narrow screen (and in Arabic).
  const changeButton = h('button', { type: 'button', class: 'aixc-text-btn', 'aria-controls': 'aixc-composer', 'aria-expanded': 'false' }, t('Change'), host.lang === 'ar' ? null : h('span', { class: 'aixc-wide-only' }, '\u00a0experience'))
  const resetButton = h('button', { type: 'button', class: 'aixc-text-btn' }, t('Reset'))
  bar.setAttribute('role', 'region')
  bar.setAttribute('aria-label', t('Page view controls'))
  bar.replaceChildren(h('div', { class: 'aixc-viewbar__inner' }, segmented(...barSegs), meta, h('div', { class: 'aixc-viewbar__actions' }, changeButton, resetButton)))

  /* ------------------------------------------------------------- the box */
  /** The bottom of Vodafone's header where it meets the top of the screen, pinned or in the flow (as the launcher reads it). */
  const headerBottom = () => {
    let bottom = host.chromeBottom()
    for (const node of [host.header, document.getElementById('nav-header')]) {
      const r = node?.isConnected ? node.getBoundingClientRect() : null
      if (r && r.top <= 10 && r.bottom > 0 && r.height <= innerHeight * 0.35) bottom = Math.max(bottom, r.bottom)
    }
    return bottom
  }
  const note = mark(h('p', { class: 'aixc-viewnote', hidden: true }))
  const stage = h('div', { class: 'aixc-stage' })
  const originalButton = h('button', { type: 'button', class: 'aixc-end__btn' }, say('Original page'))
  const continueButton = h('button', { type: 'button', class: 'aixc-end__btn aixc-end__btn--primary' }, say('Continue to the page'))
  const end = h('div', { class: 'aixc-end' }, originalButton, continueButton)
  box.classList.add('aixc-box')
  box.replaceChildren(bar, note, stage, end)
  bar.hidden = false
  const measures = createBox({ host, guard, box, bar, composer, headerBottom, anchor: () => (returnTo === changeButton ? bar : launcher.button), opener: () => returnTo, launcher: launcher.button })

  /* ------------------------------------------------------------ the icons */
  const pageHas = (id) => [...document.getElementsByTagName('symbol')].some((symbol) => symbol.id === id && !symbol.closest('[data-aixc]'))
  const missing = Object.keys(SYMBOLS).filter((id) => !pageHas(id))
  let sprite = null
  if (missing.length) {
    const svgNs = 'http://www.w3.org/2000/svg'
    sprite = mark(document.createElementNS(svgNs, 'svg'))
    sprite.setAttribute('aria-hidden', 'true')
    sprite.setAttribute('focusable', 'false')
    sprite.setAttribute('style', 'position:absolute;width:0;height:0;overflow:hidden')
    for (const id of missing) {
      const symbol = document.createElementNS(svgNs, 'symbol')
      symbol.id = `aixc-${id}`
      symbol.setAttribute('viewBox', SYMBOLS[id].viewBox)
      const path = document.createElementNS(svgNs, 'path')
      path.setAttribute('d', SYMBOLS[id].d)
      path.setAttribute('fill', '#fff')
      path.setAttribute('fill-rule', 'evenodd')
      symbol.append(path)
      sprite.append(symbol)
    }
    document.body.append(sprite)
  }

  /* ----------------------------------------------------- composer: open, close */
  const openComposer = (opener) => {
    returnTo = opener
    state.composerOpen = true
    composer.hidden = false
    launcher.button.setAttribute('aria-expanded', String(opener === launcher.button))
    changeButton.setAttribute('aria-expanded', String(opener === changeButton))
    measures.measure()
    ;(templateButtons.find((button) => button.getAttribute('aria-pressed') === 'true') ?? templateButtons[0])?.focus()
  }
  const closeComposer = ({ focus = true, keep = false } = {}) => {
    // A template still loading is dropped when the reader moved on (closed it, Original, Reset, the album); one of
    // Vodafone's menus closing it keeps the choice (`keep`): its view opens when its chunk arrives.
    if (!keep) choosing++
    if (!state.composerOpen) return
    state.composerOpen = false
    composer.hidden = true
    launcher.button.setAttribute('aria-expanded', 'false')
    changeButton.setAttribute('aria-expanded', 'false')
    if (focus) [returnTo, launcher.button, changeButton].find((node) => node?.isConnected && node.getClientRects().length)?.focus()
  }
  const toggle = (opener = launcher.button) => (state.composerOpen ? closeComposer() : openComposer(opener))

  const sync = () => {
    for (const button of segs) {
      button.setAttribute('aria-pressed', String(button.dataset.view === state.view))
      if (button.dataset.view === 'reimagined') button.disabled = !current
    }
    for (const button of templateButtons) button.setAttribute('aria-pressed', String(button.dataset.template === state.template))
    const card = cards.find((c) => c.id === state.template)
    meta.textContent = card ? t(card.name) : ''
  }

  /* ----------------------------------------------------------------- views */
  /** The Pocket's album covers the page (body[data-pocket-view], from the turn's first frame to its landing): no view changes under it. */
  const album = () => 'pocketView' in document.body.dataset

  /**
   * The open scroll: the window scrolls so the box's top meets the header's bottom, then (two frames later, when
   * Vodafone's navigation has pinned or unpinned on that scroll) again, up or down, at most four times. Where it cannot
   * meet it, the box rests as close as it can: below the header with only Vodafone's own page between them (the
   * navigation pins on any scroll and the page above the box is shorter than it: on Vodafone's saved pages the box
   * then rests at the top of the page), or, at the top of the page under a navigation that is always pinned, with a
   * margin of its own that brings its top to the header's bottom. Its height is the screen under where it rests, so
   * its bottom meets the screen's (set here and on a resize, never per frame of the page's scroll).
   */
  const align = () => {
    set(box, '--aixc-box-push', '0px')
    set(box, '--aixc-box-h', `${Math.max(0, Math.round(innerHeight - headerBottom()))}px`)
    measures.measure()
    restY = null
    let tries = 0
    let down = false
    const step = (overshot) => {
      if (state.view !== 'reimagined' || box.hidden) return
      const header = headerBottom()
      const top = box.getBoundingClientRect().top
      const off = top - header
      const room = document.documentElement.scrollHeight - innerHeight - scrollY
      if (tries < 4 && ((off > 0.5 && !overshot && room > 0.5) || (off < -0.5 && scrollY > 0.5))) {
        tries++
        down = off > 0
        window.scrollTo({ top: Math.max(0, scrollY + off), behavior: 'instant' })
        nextFrame(() => nextFrame(() => step(overshot || (down && box.getBoundingClientRect().top < headerBottom() - 0.5))))
        return
      }
      settle(top, header)
    }
    step(false)
  }
  /** Where the box's top rests after the open scroll (viewport y): a new size keeps its bottom at the screen's. */
  let rest = 0
  /** The window's scroll when the box came to rest; null while the open scroll runs. */
  let restY = null
  /** The box rests with its top at `top` (no margin of its own) under a header ending at `header`. */
  const settle = (top, header) => {
    if (top < header - 0.5) set(box, '--aixc-box-push', `${Math.round(header - top)}px`)
    rest = Math.max(top, header)
    restY = scrollY
    set(box, '--aixc-box-h', `${Math.max(0, Math.round(innerHeight - rest))}px`)
    measures.measure()
  }
  const set = (node, name, value) => {
    if (node.style.getPropertyValue(name) !== value) node.style.setProperty(name, value)
  }

  const seam = () => configure({ scroller: box, wrap: guard.wrap, copy })

  const showReimagined = ({ fresh = false } = {}) => {
    const wasOriginal = state.view !== 'reimagined'
    if (!current || (!wasOriginal && !fresh) || album()) return
    if (wasOriginal) {
      leftAt = scrollY
      // The trail records #main-content as it shows: what it shows now, before it is hidden.
      cover.shown()
      setCover()
      host.hideSource()
      // Configure, render, mount: a new experience was rendered after its own configure().
      if (!fresh) seam()
    }
    box.hidden = false
    state.view = 'reimagined'
    state.activeExperience = active
    document.body.dataset.aixcView = 'reimagined'
    checkpoint('reimagine-render')
    sync()
    align()
    if (fresh) kept = 0
    active.mount()
    // A new view: its heading (a page with no title has none: the bar's Reimagined, so the focus does not stay on the
    // template button the composer just hid); the same one again: the bar's Reimagined, where the press was.
    if (fresh) (box.querySelector('#aixc-cover-title, [data-aixc-focus]') ?? barSegs[1])?.focus({ preventScroll: true })
    else barSegs[1].focus({ preventScroll: true })
  }

  const showOriginal = () => {
    // A template still loading is dropped; a composer opened from "Change experience" closes (its bar goes with the view).
    closeComposer({ focus: false })
    if (state.view !== 'reimagined' || album()) return
    current?.unmount()
    configure()
    host.showSource()
    box.hidden = true
    state.view = 'original'
    document.body.dataset.aixcView = 'original'
    if (leftAt !== null) window.scrollTo({ top: leftAt, behavior: 'instant' })
    sync()
    // The launcher shows again (it watches body[data-aixc-view]): the focus, which was on what just went, goes to it.
    nextFrame(() => launcher.button.focus({ preventScroll: true }))
  }

  /** Each section's knowledge destination (ADR-0049 §4) on its container in the view: one element per destination. */
  const markDestinations = (root) => {
    const items = [...root.querySelectorAll('[data-aixc-item]')]
    for (const section of index.model.sections) {
      if (!section.destinationId || root.querySelector(`[data-vg-destination="${CSS.escape(section.destinationId)}"]`)) continue
      const ids = new Set(section.items.map((item) => item.id))
      const own = items.filter((node) => ids.has(node.dataset.aixcItem))
      if (!own.length) continue
      let at = own[0]
      while (at !== root && !own.every((node) => at.contains(node))) at = at.parentElement
      const pure = at !== root && [...at.querySelectorAll('[data-aixc-item]')].every((node) => ids.has(node.dataset.aixcItem))
      ;(pure ? at : own[0]).dataset.vgDestination = section.destinationId
    }
  }

  /** A template: its experience's chunk, its schema from the model (validated), configure, render, then the view. */
  const choose = async (card) => {
    const seq = ++choosing
    const mod = await EXPERIENCES[card.experience]()
    // Dropped if the reader moved on while its chunk loaded (another template, Original, Reset, the composer closed by
    // the reader, the album opened: each counts `choosing` on), or if the album shows now.
    if (guard.stopped || seq !== choosing || !index || album()) return
    const result = validateSchema(buildTemplateSchema(card, index), index)
    if (!result.ok) throw new Error(`template "${card.id}" schema is invalid: ${result.errors.join('; ')}`)
    const render = mod.load({ ensureCss })
    current?.unmount()
    seam()
    const experience = render(result.schema, index, { onPrimitiveError: (section, error) => console.warn(`[AIXC] ${section.type} "${section.id}" failed; shown as a list.`, error) })
    markDestinations(experience.element)
    stage.replaceChildren(experience.element)
    current = experience
    state.template = card.id
    note.hidden = true
    closeComposer({ focus: false })
    showReimagined({ fresh: true })
    announce(t('{name} ready.', { name: t(card.name) }))
  }

  const reset = () => {
    showOriginal()
    current?.unmount()
    configure()
    stage.replaceChildren()
    current = null
    kept = 0
    state.activeExperience = null
    state.template = null
    note.hidden = true
    sync()
    closeComposer({ focus: false })
    announce(t('Page reset to the original view.'))
  }

  /* --------------------------------------------------------------- events */
  for (const button of templateButtons) guard.listen(button, 'click', () => choose(cards.find((card) => card.id === button.dataset.template)))
  // A view chosen in the composer closes it (the view's own controls take over); the bar's segment switches in place.
  for (const button of segs)
    guard.listen(button, 'click', () => {
      if (button.getAttribute('aria-pressed') === 'true') {
        // Original pressed again while a template loads: the reader stays with the page, the template is dropped.
        if (button.dataset.view === 'original') choosing++
        return
      }
      if (composer.contains(button)) closeComposer({ focus: false })
      if (button.dataset.view === 'original') showOriginal()
      else showReimagined()
    })
  guard.listen(closeButton, 'click', () => closeComposer())
  guard.listen(composer, 'keydown', (event) => {
    if (event.key !== 'Escape') return
    event.preventDefault()
    closeComposer()
  })
  // Hidden by the stylesheet while one of Vodafone's menus or dialogs is open (its visibility transition ends): closed,
  // a template still loading kept (the reader did not move on from it).
  guard.listen(composer, 'transitionend', (event) => {
    if (event.target === composer && event.propertyName === 'visibility' && getComputedStyle(composer).visibility === 'hidden') closeComposer({ focus: false, keep: true })
  })
  guard.listen(changeButton, 'click', () => toggle(changeButton))
  guard.listen(resetButton, 'click', reset)
  guard.listen(originalButton, 'click', showOriginal)
  // On past the box: Vodafone's footer comes up under its navigation.
  guard.listen(continueButton, 'click', () => window.scrollTo({ top: scrollY + box.getBoundingClientRect().bottom - host.chromeBottom(), behavior: 'instant' }))
  guard.listen(
    box,
    'scroll',
    () => {
      if (state.view === 'reimagined' && !box.hidden && current?.mounted) kept = box.scrollTop
    },
    { passive: true },
  )
  guard.listen(document, 'aixc:model', (event) => {
    const was = index
    reindex(event.detail?.model)
    // The view that shows stays as it is; the next one is drawn from the new reading.
    const ids = (i) => i?.order.join('|') ?? ''
    if (current && ids(was) !== ids(index)) {
      note.textContent = say('The page changed after this view was made. Choose an experience again to see it.')
      note.hidden = false
    }
  })
  guard.listen(window, 'vg:trail-ready', (event) => setCover(event.detail))
  // A new size (a phone's address bar, a window resized): the box is as tall as the screen under where it rests. The
  // window is not scrolled for it (a phone resizes while the reader scrolls). If the window has not moved since the box
  // came to rest, where it rests is read again (Vodafone's header changes its height between phone and desktop).
  guard.listen(window, 'resize', () => {
    if (state.view !== 'reimagined') return
    if (!box.hidden && restY !== null && Math.abs(scrollY - restY) <= 0.5) {
      set(box, '--aixc-box-push', '0px')
      settle(box.getBoundingClientRect().top, headerBottom())
    } else set(box, '--aixc-box-h', `${Math.max(0, Math.round(innerHeight - rest))}px`)
  })
  // The Pocket's album opens: the composer closes and a template still loading is dropped. (pocket.css takes the
  // composer out of the layout then, so no visibility transition tells it, as one does for Vodafone's menus.)
  const albumWatch = new MutationObserver(guard.wrap('reimagine album', () => album() && closeComposer({ focus: false })))
  albumWatch.observe(document.body, { attributes: true, attributeFilter: ['data-pocket-view'] })
  setCover()

  guard.onStop(() => {
    for (const run of [
      () => current?.unmount(),
      () => configure(),
      () => measures.stop(),
      () => albumWatch.disconnect(),
      () => frames.forEach((id) => cancelAnimationFrame(id)),
      () => timers.forEach((id) => clearTimeout(id)),
      () => composer.remove(),
      () => liveRegion.remove(),
      () => note.remove(),
      () => sprite?.remove(),
      () => host.showSource(),
      () => delete document.body.dataset.aixcView,
      () => api?.setCover?.(null),
      () => launcher.button.setAttribute('aria-expanded', 'false'),
    ]) {
      try {
        run()
      } catch {}
    }
    frames.clear()
    timers.clear()
    current = null
    if (shell?.guard === guard) shell = null
  })

  sync()
  openComposer(launcher.button)
  return { guard, toggle: () => toggle(launcher.button), handle: { state } }
}
