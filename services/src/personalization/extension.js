/**
 * The hidden extension under the Pocket: a second, personal world that lies beneath the album.
 *
 *   hidden ──end of the album in view──► discoverable (a red lip peeks out from under the page)
 *   discoverable ──press, Enter, or pull the lip up──► opening ──► open (peek)
 *   open: peek ⇄ expanded follow the page's own scroll (or the handle, "See everything", a drag)
 *   open ──Back to pocket, Esc, or drag the handle down──► closing ──► discoverable (exact scroll back)
 *   any ──the pocket closes──► hidden
 *
 * It is not an overlay. The world is a block in the page's flow, right after the album (inside
 * #pocket-output, so the Pocket's own hide/show covers it). Opening pushes the page up: one
 * progress value drives a programmatic scroll (the album rises) and a transform on the world
 * (it comes up from the bottom edge), in one frame loop, so the two move as one. The document
 * keeps owning the scroll: no nested scroller, wheel/touch/keys stay native once it is open.
 *
 * The status widget is a separate layer (./status-widget.js): the world only gives it a dock,
 * the "well", the dedicated space above the sheet, and tells it when to float.
 *
 * The Dock and the widget swap places as the world opens: the widget materialises where the Dock
 * was (right under the album) while the Dock glides down into the well, under the widget and just
 * above the sheet, where it chooses what the sheet's spotlight shows. Closing glides it back.
 */

import { make } from '../pocket/pocket.js'
import { lerp, tween } from '../pocket/curl.js'
import { icon } from './icons.js'
import { EASE, clamp, glideTo, holdScroll, reducedMotion, scrollPageTo, segment } from './motion.js'

const OPEN_MS = 760
const CLOSE_MS = 660
const RETURN_MS = 360 // a pull that was let go early springs back
const DRAG_COMMIT = 0.26 // how far a pull must go to open when let go
const DRAG_FLICK = 0.55 // px/ms: a quick flick opens or closes whatever the distance
const MIN_ALBUM = 150 // px of the Pocket kept in view above the widget when the world peeks
const MIN_SHEET = 220 // px of the world shown when it peeks
const PULL_ENGAGE = { mouse: 8, touch: 14 } // px a pull must travel before it moves the page
const DOCK_GAP = 10 // px between the header and the Dock when a category is in focus
const MAGNIFIED = 1.6 // the Dock's largest scale (extension.css)

/** An ease-in-out for the Dock's glide between its two places. */
const smooth = (t) => t * t * (3 - 2 * t)

export const createExtension = ({ pocketRoot, header, footer, widget, loadWorld, lipCopy, dockItems = [], announce, onPhase = () => {} }) => {
  const state = {
    phase: 'hidden', // 'hidden' | 'discoverable' | 'pulling' | 'opening' | 'open' | 'closing'
    position: null, // when open: 'peek' | 'expanded' | 'away' (scrolled back up into the album)
    saved: null, // { scrollY, focus, viaKeyboard } when it opened
    world: null, // the loaded world: { mount(body, barEnd), focusTarget() }
    loading: null,
    drag: null,
    sheetDrag: null,
    near: false,
    gen: 0, // bumped by a teardown: a transition that awaited across one must not finish
    tween: null, // the running push or return, so a teardown can cancel it
    hold: null, // releases the scroll guard of the running transition
    leaving: false, // the Pocket is closing: no new opens
    request: null, // the latest Dock press while the world loads or opens: { topic, viaKeyboard }
    pending: false, // an open is waiting for the world to load
    closeWhenOpen: false, // Escape arrived while it was opening
  }

  /** Runs one transition, kept in state so a teardown can cancel it. Resolves false if cancelled. */
  const run = (ms, frame, easing) => {
    const t = tween(ms, frame, easing)
    state.tween = t
    return t.promise.then((done) => {
      if (state.tween === t) state.tween = null
      return done
    })
  }
  const hold = () => {
    state.hold?.()
    state.hold = holdScroll()
  }
  const unhold = () => {
    state.hold?.()
    state.hold = null
  }
  /** Stops whatever is moving: the transition, its scroll guard, a pull, a queued press. */
  const stop = () => {
    state.gen += 1
    state.tween?.cancel()
    state.tween = null
    unhold()
    state.drag = null
    state.request = null
    state.closeWhenOpen = false
  }

  /* ------------------------------------------------------------- the dock */
  // At the album's end a Dock of the world's categories rises from under the page (in the manner
  // of the macOS Dock, magnifying downward, toward the world beneath). Pressing an icon opens the
  // world at that category; pulling the Dock up opens it too. A toolbar: one tab stop, arrow keys.
  let lastItem = null
  const items = dockItems.map((entry, index) => {
    const art = make('span', { class: 'pz-dock__tile', 'aria-hidden': 'true' })
    art.innerHTML = entry.art
    const item = make(
      'button',
      {
        type: 'button',
        class: 'pz-dock__item',
        'data-dock': entry.id,
        'data-group-start': index > 0 && entry.group !== dockItems[index - 1].group ? '' : null,
        'aria-controls': 'pz-sheet',
        'aria-label': entry.caption ? `${entry.label}, ${entry.caption}` : entry.label,
        tabindex: '-1',
      },
      art,
      make('span', { class: 'pz-dock__label', 'aria-hidden': 'true' }, entry.label),
    )
    item.addEventListener('click', (event) => {
      if (suppressClick) return
      lastItem = item
      activate(entry, event.detail === 0)
    })
    return item
  })
  const dock = make('div', { class: 'pz-dock', role: 'toolbar', 'aria-orientation': 'horizontal' }, ...items)
  const lipClip = make('div', { class: 'pz-lip__clip' }, dock)
  const lip = make('div', { class: 'pz-lip' }, lipClip)

  // Magnification is for a mouse only: the last pointer's type decides (a touch laptop reports hover).
  dock.addEventListener('pointerover', (event) => {
    if (dock.dataset.pointer !== event.pointerType) dock.dataset.pointer = event.pointerType
  })

  /** Roving focus: the toolbar is one tab stop, arrow keys move between its icons. */
  const setTabStop = (target) => items.forEach((item) => (item.tabIndex = item === target ? 0 : -1))
  dock.addEventListener('keydown', (event) => {
    const at = items.indexOf(document.activeElement)
    if (at < 0) return
    const to = { ArrowRight: at + 1, ArrowLeft: at - 1, Home: 0, End: items.length - 1 }[event.key]
    if (to === undefined) return
    event.preventDefault()
    const next = items[(to + items.length) % items.length]
    setTabStop(next)
    next.focus()
  })
  dock.addEventListener('focusin', (event) => {
    if (items.includes(event.target)) setTabStop(event.target)
    delete dock.dataset.quiet
  })
  // A name shown under a magnified icon can be dismissed with Escape (it covers what is beneath);
  // it comes back with the next icon the pointer or focus reaches.
  dock.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || dock.dataset.quiet !== undefined || state.phase !== 'discoverable') return
    const shown = items.some((item) => item.matches(':focus-visible') || (dock.dataset.pointer === 'mouse' && item.matches(':hover')))
    if (!shown) return
    dock.dataset.quiet = ''
    event.preventDefault()
    event.stopPropagation()
  })
  dock.addEventListener('pointerover', (event) => {
    if (dock.dataset.quiet !== undefined && items.some((item) => item.contains(event.target) && !item.contains(event.relatedTarget))) delete dock.dataset.quiet
  })

  // The icons magnify downward, so a pointer arriving at a Dock that sits at the bottom edge first
  // makes the page glide down just enough for the magnified icons and their names to show.
  dock.addEventListener('pointerenter', (event) => {
    if (event.pointerType !== 'mouse' || state.phase !== 'discoverable' || reducedMotion()) return
    const size = items[0]?.offsetWidth ?? 0
    const missing = dock.getBoundingClientRect().top + 7 + size * MAGNIFIED + 30 - window.innerHeight
    const room = document.documentElement.scrollHeight - window.innerHeight - window.scrollY
    if (missing > 8 && room > 0) glideTo(window.scrollY + Math.min(missing, room), { duration: 360, easing: EASE.settle })
  })

  /* ------------------------------------------------------------ the stage */
  const glow = make('div', { class: 'pz-underlay__glow' })
  const underlay = make('div', { class: 'pz-underlay', 'aria-hidden': 'true' }, glow)
  const dockSlot = make('div', { class: 'pz-well__dock' })
  const well = make('div', { class: 'pz-well' }, make('div', { class: 'pz-well__widget' }, widget.docked), dockSlot)

  const handleButton = make('button', { type: 'button', class: 'pz-bar__handle', 'aria-label': 'Show all of your RED world' }, make('span', { class: 'pz-bar__handle-bar', 'aria-hidden': 'true' }))
  const backButton = make('button', { type: 'button', class: 'pz-bar__back' }, icon('chevronDown', 'pz-bar__back-icon'), make('span', { class: 'pz-bar__back-label' }, 'Back to pocket'))
  const barTitle = make('p', { class: 'pz-bar__title' }, 'RED Benefits')
  const barEnd = make('div', { class: 'pz-bar__end' })
  const bar = make('div', { class: 'pz-bar' }, make('div', { class: 'pz-bar__grab' }, handleButton), make('div', { class: 'pz-bar__row' }, backButton, barTitle, barEnd))
  const body = make('div', { class: 'pz-sheet__body' })
  const sheet = make('div', { class: 'pz-sheet', id: 'pz-sheet', role: 'region', 'aria-label': 'Your RED world', tabindex: '-1' }, bar, body)

  const lift = make('div', { class: 'pz-stage__lift' }, underlay, well, sheet)
  // Laid out ahead of time inside a zero-height clip, so opening only changes one box's height.
  const stage = make('div', { class: 'pz-stage', 'data-open': 'false' }, lift)
  const setStageOpen = (open) => {
    stage.dataset.open = String(open)
  }
  const root = make('section', { class: 'pz-world', 'data-phase': 'hidden', 'aria-label': 'Your RED world, under your pocket' }, lip, stage)
  pocketRoot.append(root)

  /** "See everything for you": the invitation to go further while the world only peeks. */
  const explore = make('button', { type: 'button', class: 'pz-explore', tabindex: '-1', 'aria-hidden': 'true' }, make('span', null, 'See everything for you'), icon('chevronDown', 'pz-explore__icon'))
  document.body.append(explore)

  /* ------------------------------------------------------------- helpers */
  const headerBottom = () => Math.max(0, Math.round(header.getBoundingClientRect().bottom))
  const stageTopInDocument = () => stage.getBoundingClientRect().top + window.scrollY

  /** Moves the Dock between the lip and the well, keeping keyboard focus on the icon it was on. */
  const moveDock = (host) => {
    if (dock.parentElement === host) return
    const focused = dock.contains(document.activeElement) ? document.activeElement : null
    host.append(dock)
    focused?.focus({ preventScroll: true })
  }
  const homeDock = () => {
    dock.style.translate = ''
    moveDock(lipClip)
  }
  const setPhase = (phase) => {
    state.phase = phase
    root.dataset.phase = phase
    if (phase === 'open') dock.setAttribute('aria-label', 'Your RED categories: choose what is in focus')
    else root.classList.remove('is-stuck') // only track() sets it, and only while open
    paintDock()
    // The mascot rests on the album's floor line, which is where the world begins: it steps away
    // while the world is out (a class on the floor itself: no page-wide style recalculation).
    pocketRoot.querySelector('.pocket-actor-floor')?.classList.toggle('pz-tucked', phase !== 'hidden' && phase !== 'discoverable')
    onPhase(phase)
  }
  const setPosition = (position) => {
    if (state.position === position) return
    state.position = position
    if (position) root.dataset.position = position
    else delete root.dataset.position
    handleButton.setAttribute('aria-label', position === 'expanded' ? 'Show less of your RED world' : 'Show all of your RED world')
  }

  /**
   * "See everything for you" invites once: it appears after the widget has settled, while the world
   * still only peeks, and leaves for good as soon as the page moves.
   */
  let exploreTimer = 0
  const setExplore = (on) => {
    if (!on && document.activeElement === explore) {
      if (state.phase === 'open' || state.phase === 'closing') sheet.focus({ preventScroll: true })
      else explore.blur()
    }
    explore.classList.toggle('is-shown', on)
    explore.tabIndex = on ? 0 : -1
    explore.setAttribute('aria-hidden', String(!on))
  }
  const inviteToExplore = () => {
    window.clearTimeout(exploreTimer)
    state.peekScroll = window.scrollY
    exploreTimer = window.setTimeout(() => {
      if (state.phase !== 'open' || state.position !== 'peek' || Math.abs(window.scrollY - state.peekScroll) > 12) return
      // A pointer gets a floating invitation; a finger already knows to swipe, so the handle nudges.
      if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) setExplore(true)
      else if (!reducedMotion()) {
        root.classList.remove('is-nudging')
        void root.offsetWidth
        root.classList.add('is-nudging')
      }
    }, reducedMotion() ? 0 : 1100)
  }
  const stopInviting = () => {
    window.clearTimeout(exploreTimer)
    state.peekScroll = null
    setExplore(false)
    root.classList.remove('is-nudging')
  }

  /** Where the sheet's top settles when the world peeks: a peek, never the whole screen. */
  const peekTop = (V, hb, wellH) => {
    const room = V - hb - wellH
    const lo = hb + wellH + Math.min(MIN_ALBUM, Math.max(40, room * 0.35))
    const hi = V - Math.min(MIN_SHEET, room * 0.5)
    return Math.round(clamp(V * (V < 720 ? 0.6 : 0.62), lo, Math.max(lo, hi)))
  }

  /**
   * A stand-in for the footer, drawn where the real one is (or will be) in the world's own
   * coordinates, so the footer never pops while the world takes its place in the flow.
   */
  const footerStandIn = () => {
    const copy = footer.cloneNode(true)
    copy.removeAttribute('id')
    for (const node of copy.querySelectorAll('[id]')) node.removeAttribute('id')
    copy.classList.add('pz-footer-stand-in')
    copy.setAttribute('aria-hidden', 'true')
    copy.inert = true
    // Closed, the footer follows the lip; open, the stage starts at the lip's top (it overlaps it).
    copy.style.top = `${lip.offsetHeight}px`
    stage.prepend(copy)
    return copy
  }

  const loadOnce = () => {
    if (state.world) return Promise.resolve(state.world)
    if (!state.loading) {
      state.loading = loadWorld()
        .then((world) => {
          state.world = world
          world.mount({ body, barEnd, sheet, extension: api })
          return world
        })
        .catch((error) => {
          state.loading = null
          console.warn('[personalization] could not load the RED world:', error)
          return null
        })
    }
    return state.loading
  }

  /* ---------------------------------------------------------- discovery */
  const refreshLip = () => {
    const { title, hint } = lipCopy()
    dock.setAttribute('aria-label', `${title}. ${hint}`)
  }

  const reveal = () => {
    if (state.phase !== 'hidden') return
    refreshLip()
    setPhase('discoverable')
    setTabStop(lastItem ?? items[0])
    loadOnce() // ready before the press
  }

  const endObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) if (entry.isIntersecting && entry.intersectionRatio >= 0.6) reveal()
    },
    { threshold: [0, 0.6, 1] },
  )

  // The cursor drifting to the bottom edge is a second hint (never the only one): the lip lifts.
  let nearFrame = 0
  const onPointerMove = (event) => {
    if (event.pointerType !== 'mouse' || nearFrame) return
    nearFrame = requestAnimationFrame(() => {
      nearFrame = 0
      const near = state.phase === 'discoverable' && event.clientY > window.innerHeight - 150 && lip.getBoundingClientRect().top < window.innerHeight
      if (near !== state.near) {
        state.near = near
        root.toggleAttribute('data-near', near)
      }
    })
  }

  /* --------------------------------------------------------- the push */
  /** Measures everything the push needs, then lets the world join the page's flow. */
  const prepareOpen = () => {
    const S0 = window.scrollY
    const V = window.innerHeight
    const hb = headerBottom()
    const footerVisible = footer.getBoundingClientRect().top < V
    const dockFrom = dock.getBoundingClientRect().top
    document.documentElement.style.overflowAnchor = 'none'
    setStageOpen(true)
    // The Dock moves into the well now; renderOpen keeps it where it was and then glides it down.
    moveDock(dockSlot)
    const a0 = stage.getBoundingClientRect().top // the stage's top on screen (the album's end), now
    const A = a0 + S0
    const dOff = dockFrom - a0 // the Dock's place in the lip, from the album's end
    const slotOff = dockSlot.getBoundingClientRect().top - a0 // its place in the well
    state.dockOff = dOff
    const wellH = well.offsetHeight
    const target = peekTop(V, hb, wellH)
    // The album moves up into place; only when the lip was pressed high on the screen does it settle
    // down a little, so the world still only peeks (never more than half the screen).
    const aT = Math.max(Math.min(a0, target - wellH), Math.round(V * 0.5) - wellH)
    const enter = Math.max(a0, V) // the world's content enters from the bottom edge
    const standIn = footerVisible ? footerStandIn() : null
    lift.style.zIndex = '3'
    return { S0, V, hb, a0, A, aT, enter, wellH, dOff, slotOff, standIn, widgetShown: false }
  }

  /** One frame of the push; k is the share of the distance travelled (0 → 1). */
  const renderOpen = (g, k) => {
    const pageTop = lerp(g.a0, g.aT, k)
    scrollPageTo(g.A - pageTop)
    const contentTop = lerp(g.enter, g.aT, k)
    lift.style.transform = `translate3d(0, ${(contentTop - pageTop).toFixed(2)}px, 0)`
    // The Dock glides straight from its place in the lip to its place under the widget (eased, never
    // past either end), while the slot it lands in rises with the world.
    const dockTop = lerp(g.a0 + g.dOff, g.aT + g.slotOff, smooth(segment(k, 0.08, 0.92)))
    dock.style.translate = `0 ${(dockTop - contentTop - g.slotOff).toFixed(2)}px`
    glow.style.opacity = String(segment(k, 0.2, 0.62) * (1 - 0.55 * segment(k, 0.8, 1)))
    if (g.standIn) {
      const f = segment(k, 0, 0.42)
      g.standIn.style.opacity = String(1 - f)
      g.standIn.style.transform = `translate3d(0, ${(36 * f).toFixed(2)}px, 0)`
    }
    // The widget materialises out of the glow once the dock has room (a pulled-back drag undoes it).
    if (k >= 0.52 && !g.widgetShown) {
      g.widgetShown = true
      widget.materialize()
    } else if (k < 0.4 && g.widgetShown) {
      g.widgetShown = false
      widget.dematerialize()
    }
  }

  const finishOpen = (g, { viaKeyboard, fromDock = false }) => {
    lift.style.transform = ''
    lift.style.zIndex = ''
    dock.style.translate = ''
    glow.style.opacity = ''
    g.standIn?.remove()
    document.documentElement.style.overflowAnchor = ''
    if (!g.widgetShown) widget.materialize()
    setPhase('open')
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll, { passive: true })
    track()
    // Escape while it was opening: it goes straight back.
    if (state.closeWhenOpen) {
      state.closeWhenOpen = false
      state.request = null
      close()
      return
    }
    inviteToExplore()
    // Opened from a Dock icon, focus stays on that icon (it moved with the Dock), so arrows and
    // Enter keep choosing. Otherwise: keyboard to the world's heading (with its ring); pointer to the
    // sheet itself (no ring), and the next Tab continues inside the world.
    if (fromDock && dock.contains(document.activeElement)) {
      // stays
    } else if (viaKeyboard) state.world?.focusTarget?.()?.focus({ preventScroll: true })
    else if (document.activeElement === document.body) sheet.focus({ preventScroll: true })
    announce(state.world?.openAnnouncement?.() ?? 'Your RED world is open.')
    // An icon pressed while it was opening: the latest press wins.
    const late = state.request
    state.request = null
    if (late?.topic && late.topic !== state.marked) state.world?.select?.(late.topic, { from: 'dock' })
  }

  const open = async ({ viaKeyboard = false, topic = null } = {}) => {
    if (state.phase !== 'discoverable' || state.leaving) return
    const gen = state.gen
    const world = await loadOnce()
    if (!world || gen !== state.gen || state.phase !== 'discoverable') {
      if (gen === state.gen && state.phase === 'discoverable') state.request = null
      return
    }
    // Several presses while the world loaded: the latest one is the one meant.
    const request = state.request ?? { topic, viaKeyboard }
    state.request = null
    // The spotlight is set before anything is measured: a category from the Dock (with the hero
    // condensed), or the customer's best topic.
    world.prepare?.(request.topic)
    setPhase('opening')
    state.saved = { scrollY: window.scrollY, focus: document.activeElement, viaKeyboard: request.viaKeyboard }
    const g = prepareOpen()
    const how = { viaKeyboard: request.viaKeyboard, fromDock: Boolean(request.topic) }
    if (reducedMotion()) {
      renderOpen(g, 1)
      finishOpen(g, how)
      return
    }
    hold()
    const done = await run(OPEN_MS, (k) => renderOpen(g, k), EASE.sheet)
    if (gen !== state.gen) return // torn down meanwhile (the teardown released everything)
    unhold()
    if (done) finishOpen(g, how)
  }

  /**
   * Follows one pointer from its pointerdown, at window level, so a fast flick that leaves the
   * small lip or handle still drives the drag. Returns nothing; calls onMove / onEnd.
   */
  const followPointer = (event, { onMove, onEnd }) => {
    const id = event.pointerId
    const move = (e) => e.pointerId === id && onMove(e)
    const end = (e) => {
      if (e.pointerId !== id) return
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
      onEnd(e, e.type === 'pointercancel')
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
  }

  /* ------------------------------------------------------- pull to open */
  // Pulling the lip up drags the page and the world with the finger; let go past a quarter of
  // the way (or flick) and it opens, otherwise it settles back. A plain press just opens.
  let suppressClick = false

  const endPull = async (event, cancelled = false) => {
    const drag = state.drag
    if (!drag) return
    state.drag = null
    if (!drag.engaged) return
    suppressClick = true
    window.setTimeout(() => (suppressClick = false), 0)
    const recent = drag.samples.filter((s) => performance.now() - s.t < 90)
    const first = recent[0] ?? drag.samples.at(-1)
    const last = drag.samples.at(-1)
    const velocity = first && last && last.t > first.t ? (first.y - last.y) / (last.t - first.t) : 0 // px/ms, up is positive
    const commit = !cancelled && (drag.k > DRAG_COMMIT || velocity > DRAG_FLICK) && velocity > -DRAG_FLICK
    const g = drag.g
    const gen = state.gen
    const from = drag.k
    if (commit) {
      setPhase('opening')
      const done = await run(Math.max(260, OPEN_MS * (1 - from)), (e) => renderOpen(g, lerp(from, 1, e)), EASE.settle)
      if (gen !== state.gen) return
      unhold()
      if (done) finishOpen(g, { viaKeyboard: false })
    } else {
      const done = await run(RETURN_MS, (e) => renderOpen(g, lerp(from, 0, e)), EASE.settle)
      if (gen !== state.gen) return
      unhold()
      if (done) undoOpen(g)
    }
  }

  /** Takes a pulled-back world out of the flow again, exactly as it was before the pull. */
  const undoOpen = (g) => {
    widget.dematerialize({ immediate: true })
    state.request = null
    homeDock()
    setStageOpen(false)
    lift.style.transform = ''
    lift.style.zIndex = ''
    glow.style.opacity = ''
    g.standIn?.remove()
    scrollPageTo(g.S0)
    document.documentElement.style.overflowAnchor = ''
    setPhase('discoverable')
  }

  const pullMove = (event) => {
    const drag = state.drag
    if (!drag) return
    const pulled = drag.y0 - event.clientY
    drag.samples.push({ y: event.clientY, t: performance.now() })
    if (drag.samples.length > 8) drag.samples.shift()
    if (!drag.engaged) {
      // A finger wobbles while it taps: only a clear, mostly vertical pull moves the page.
      const threshold = PULL_ENGAGE[drag.type] ?? PULL_ENGAGE.touch
      const sideways = Math.abs(event.clientX - drag.x0)
      if (pulled < threshold) return
      if (sideways > pulled * 0.75) {
        state.drag = null
        return
      }
      drag.engaged = true
      setPhase('pulling')
      state.saved = { scrollY: window.scrollY, focus: document.activeElement, viaKeyboard: false }
      hold()
      state.request = null // a pull opens on the customer's best topic
      state.world?.prepare?.(null)
      drag.g = prepareOpen()
      drag.y0 = event.clientY + threshold // the threshold is not a jump
    }
    const distance = Math.max(1, drag.g.enter - drag.g.aT)
    drag.k = clamp((drag.y0 - event.clientY) / distance, 0, 1)
    renderOpen(drag.g, drag.k)
  }

  dock.addEventListener('pointerdown', (event) => {
    if (state.phase !== 'discoverable' || state.leaving || !state.world || (event.pointerType === 'mouse' && event.button !== 0)) return
    state.drag = { id: event.pointerId, type: event.pointerType, x0: event.clientX, y0: event.clientY, engaged: false, k: 0, g: null, samples: [{ y: event.clientY, t: performance.now() }] }
    followPointer(event, { onMove: pullMove, onEnd: (e, cancelled) => endPull(e, cancelled) })
  })
  // WebKit ignores directional touch-action and only asks the first touchmove whether to scroll:
  // decide there, once per touch. A finger going up (more up than sideways) is held for the pull;
  // down, sideways or two fingers stay native. The threshold above still decides when the page moves.
  dock.addEventListener(
    'touchmove',
    (event) => {
      const drag = state.drag
      if (!drag || !event.cancelable) return
      if (drag.engaged) return event.preventDefault()
      if (drag.touchHold === undefined) {
        const touch = event.touches[0]
        const up = drag.y0 - touch.clientY
        drag.touchHold = event.touches.length === 1 && up >= 0 && Math.abs(touch.clientX - drag.x0) <= up + 2
      }
      if (drag.touchHold) event.preventDefault()
    },
    { passive: false },
  )

  /**
   * An icon: open the world with that category in the spotlight (the hero condensed), or, once
   * open, bring that category into the spotlight.
   */
  async function activate(entry, viaKeyboard) {
    if (state.leaving) return
    if (state.phase === 'open') return state.world?.select?.(entry.id, { from: 'dock' })
    if (state.phase !== 'discoverable' && state.phase !== 'opening') return
    // While the world loads or opens, the latest press is the one that counts (finishOpen applies it).
    state.request = { topic: entry.id, viaKeyboard }
    if (state.phase !== 'discoverable' || state.pending) return
    state.pending = true
    try {
      await open(state.request)
    } finally {
      state.pending = false
    }
  }

  /** Marks the Dock icon whose category is in the spotlight (shown only while the world is out). */
  function markDock(id) {
    state.marked = id
    paintDock()
  }
  function paintDock() {
    const id = state.phase === 'opening' || state.phase === 'open' ? state.marked : null
    for (const item of items) {
      if (id && item.dataset.dock === id) item.setAttribute('aria-current', 'true')
      else item.removeAttribute('aria-current')
    }
  }

  /* ------------------------------------------------------ the return */
  /**
   * Measures the return. From deep inside the world the page first jumps (invisibly: the sheet is
   * shifted by the same amount and clipped at the header) so that only the screen's worth of the
   * world slides away, never thousands of pixels, and the scroll lands exactly where it was.
   */
  const prepareClose = () => {
    const V = window.innerHeight
    const hb = headerBottom()
    const S0 = state.saved?.scrollY ?? 0
    const A = stageTopInDocument()
    const wellH = well.offsetHeight
    let pageTop = A - window.scrollY
    let clip = 0
    const sheetTop = pageTop + wellH
    let visibleTop = Math.max(sheetTop, hb)
    if (pageTop < hb - wellH) {
      const jump = hb - wellH - pageTop
      clip = hb - sheetTop
      document.documentElement.style.overflowAnchor = 'none'
      scrollPageTo(window.scrollY - jump)
      pageTop = hb - wellH
      visibleTop = hb
    }
    document.documentElement.style.overflowAnchor = 'none'
    root.classList.toggle('is-deep-return', clip > 0)
    if (clip > 0) sheet.style.clipPath = `inset(${clip.toFixed(1)}px 0 0 0 round var(--pz-sheet-radius) var(--pz-sheet-radius) 0 0)`
    const finalTop = A - S0 // where the stage's top (the album's end) will be on screen
    const standIn = finalTop + lip.offsetHeight < V ? footerStandIn() : null
    if (standIn) standIn.style.opacity = '0'
    // The Dock glides from the well back to its place in the lip.
    const dockLift = (state.dockOff ?? 6) - (dockSlot.getBoundingClientRect().top - (A - window.scrollY))
    return { V, hb, S0, A, wellH, pageFrom: pageTop, pageTo: finalTop, clip, visibleFrom: visibleTop, standIn, dockLift }
  }

  const renderClose = (g, k) => {
    const pageTop = lerp(g.pageFrom, g.pageTo, k)
    scrollPageTo(g.A - pageTop)
    const visibleTop = lerp(g.visibleFrom, g.V + 48, k)
    sheet.style.transform = `translate3d(0, ${(visibleTop - (pageTop + g.wellH) - g.clip).toFixed(2)}px, 0)`
    glow.style.opacity = String(0.45 * (1 - segment(k, 0, 0.5)))
    if (g.standIn) g.standIn.style.opacity = String(segment(k, 0.55, 1))
    dock.style.translate = `0 ${(g.dockLift * smooth(segment(k, 0.1, 0.9))).toFixed(2)}px`
  }

  const finishClose = (g, { restoreFocus = false } = {}) => {
    root.classList.remove('is-deep-return')
    homeDock()
    setStageOpen(false)
    sheet.style.transform = ''
    sheet.style.clipPath = ''
    glow.style.opacity = ''
    g.standIn?.remove()
    scrollPageTo(g.S0)
    document.documentElement.style.overflowAnchor = ''
    setPhase('discoverable')
    refreshLip()
    if (restoreFocus) (lastItem ?? items[0])?.focus({ preventScroll: true })
    state.saved = null
    state.request = null
    announce('Back to your pocket.')
  }

  const close = async ({ immediate = false } = {}) => {
    if (state.phase !== 'open' || state.leaving) return
    // Decided before anything is hidden: was focus in the world (or opened by keyboard)? Focus on
    // the widget or the invitation goes to the Dock icon now, before they become inert or hidden.
    const active = document.activeElement
    const restoreFocus = Boolean(state.saved?.viaKeyboard) || root.contains(active) || widget.contains(active) || active === explore
    if (widget.contains(active) || active === explore) (lastItem ?? items[0])?.focus({ preventScroll: true })
    setPhase('closing')
    stopTracking()
    stopInviting()
    setPosition(null)
    widget.setFloating(false)
    widget.dematerialize({ immediate: immediate || reducedMotion() })
    const g = prepareClose()
    if (immediate || reducedMotion()) {
      renderClose(g, 1)
      finishClose(g, { restoreFocus })
      return
    }
    const gen = state.gen
    hold()
    const done = await run(CLOSE_MS, (k) => renderClose(g, k), EASE.inOut)
    if (gen !== state.gen) return
    unhold()
    if (done) finishClose(g, { restoreFocus })
  }

  /* --------------------------------------------- while it is open */
  let trackFrame = 0
  const track = () => {
    trackFrame = 0
    if (state.phase !== 'open') return
    const V = window.innerHeight
    const hb = headerBottom()
    const sheetTop = sheet.getBoundingClientRect().top
    setPosition(sheetTop <= hb + 2 ? 'expanded' : sheetTop < V - 24 ? 'peek' : 'away')
    root.classList.toggle('is-stuck', sheetTop <= hb + 1)
    if (state.peekScroll !== null && state.peekScroll !== undefined && (state.position !== 'peek' || Math.abs(window.scrollY - state.peekScroll) > 12)) stopInviting()
    // The widget floats once its place has gone under the header, and steps aside for the footer.
    const placeBottom = widget.docked.getBoundingClientRect().bottom
    const footerTop = footer.getBoundingClientRect().top
    widget.setFloating(placeBottom < hb + 4 && footerTop > V - 8)
  }
  const onScroll = () => {
    if (!trackFrame) trackFrame = requestAnimationFrame(track)
  }
  const stopTracking = () => {
    cancelAnimationFrame(trackFrame)
    trackFrame = 0
    window.removeEventListener('scroll', onScroll)
    window.removeEventListener('resize', onScroll)
  }

  /** Scroll positions for the two resting places of the open world. */
  const restingScroll = (position) => {
    const hb = headerBottom()
    const A = stageTopInDocument()
    const wellH = well.offsetHeight
    if (position === 'expanded') return A + wellH - hb
    return A - (peekTop(window.innerHeight, hb, wellH) - wellH)
  }

  const expand = () => state.phase === 'open' && glideTo(restingScroll('expanded'), { duration: 560, easing: EASE.sheet })
  const toPeek = () => state.phase === 'open' && glideTo(restingScroll('peek'), { duration: 520, easing: EASE.sheet })

  /** Scrolls the open world so `target` sits just under the sticky bar, and marks it briefly. */
  const reveal_ = async (target) => {
    if (state.phase !== 'open' || !target) return
    const hb = headerBottom()
    const barH = bar.offsetHeight
    const y = target.getBoundingClientRect().top + window.scrollY - hb - barH - 16
    await glideTo(Math.max(restingScroll('expanded'), y), { duration: 620, easing: EASE.sheet })
    target.classList.remove('pz-is-pointed')
    void target.offsetWidth
    target.classList.add('pz-is-pointed')
    target.addEventListener('animationend', () => target.classList.remove('pz-is-pointed'), { once: true })
  }

  /**
   * A category came into the spotlight: the page settles with the Dock just under the header, so
   * the Dock, the condensed hero and the spotlight are in view together. Measured now (call it
   * after the spotlight's content is in place and before anything animates); nothing moves when
   * the Dock is in view and the spotlight starts in the upper half of the screen.
   */
  const focusSpot = (spot) => {
    if (state.phase !== 'open' || !spot) return null
    stopInviting()
    const hb = headerBottom()
    const V = window.innerHeight
    const dockTop = dock.getBoundingClientRect().top
    const spotTop = spot.getBoundingClientRect().top
    if (dockTop >= hb && spotTop <= V * 0.55) return null
    return glideTo(Math.max(0, window.scrollY + dockTop - hb - DOCK_GAP), { duration: 620, easing: EASE.sheet })
  }

  handleButton.addEventListener('click', () => {
    if (state.sheetDragged) return
    if (state.position === 'expanded') toPeek()
    else expand()
  })
  explore.addEventListener('click', (event) => {
    // Focus goes where finishOpen would put it before the invitation hides itself.
    const target = event.detail === 0 ? (state.world?.focusTarget?.() ?? sheet) : sheet
    target.focus({ preventScroll: true })
    stopInviting()
    expand()
  })
  backButton.addEventListener('click', () => close())

  // Dragging the handle moves the world with the pointer; let go low enough (or flick down) to close.
  const grab = bar.querySelector('.pz-bar__grab')
  const sheetMove = (event) => {
    const drag = state.sheetDrag
    if (!drag) return
    const dy = event.clientY - drag.y0
    drag.samples.push({ y: event.clientY, t: performance.now() })
    if (drag.samples.length > 8) drag.samples.shift()
    if (!drag.engaged) {
      if (Math.abs(dy) < 6) return
      drag.engaged = true
      state.sheetDragged = true
    }
    scrollPageTo(Math.max(0, drag.s0 - dy))
  }
  const endSheetDrag = () => {
    const drag = state.sheetDrag
    state.sheetDrag = null
    window.setTimeout(() => (state.sheetDragged = false), 0)
    if (!drag?.engaged) return
    const recent = drag.samples.filter((s) => performance.now() - s.t < 90)
    const first = recent[0] ?? drag.samples.at(-1)
    const last = drag.samples.at(-1)
    const velocity = last.t > first.t ? (last.y - first.y) / (last.t - first.t) : 0 // px/ms, down is positive
    const V = window.innerHeight
    const sheetTop = sheet.getBoundingClientRect().top
    const peek = peekTop(V, headerBottom(), well.offsetHeight)
    if (velocity > DRAG_FLICK || sheetTop > peek + (V - peek) * 0.4) close()
    else if (velocity < -DRAG_FLICK || sheetTop < (peek + headerBottom()) / 2) expand()
    else toPeek()
  }
  grab.addEventListener('pointerdown', (event) => {
    if (state.phase !== 'open' || (event.pointerType === 'mouse' && event.button !== 0)) return
    state.sheetDrag = { y0: event.clientY, s0: window.scrollY, engaged: false, samples: [{ y: event.clientY, t: performance.now() }] }
    followPointer(event, { onMove: sheetMove, onEnd: endSheetDrag })
  })

  // Escape anywhere in the world (or on the floating widget) returns to the pocket.
  const onKeydown = (event) => {
    if (event.key !== 'Escape' || event.defaultPrevented) return
    // While the world moves, Escape is the world's, never the Pocket's (it would close the Pocket
    // under a moving page): it cancels a pull, closes as soon as an open lands, waits out a close.
    if (state.phase === 'pulling' || state.phase === 'opening' || state.phase === 'closing') {
      event.preventDefault()
      event.stopPropagation()
      if (state.phase === 'pulling' && state.drag?.engaged) endPull(null, true)
      else if (state.phase === 'opening') state.closeWhenOpen = true
      return
    }
    if (state.phase !== 'open') return
    if (!root.contains(event.target) && !widget.contains(event.target) && event.target !== explore) return
    event.preventDefault()
    event.stopPropagation()
    close()
  }
  document.addEventListener('keydown', onKeydown, true)

  /* -------------------------------------------------- pocket lifecycle */
  const reset = () => {
    stop()
    stopTracking()
    stopInviting()
    root.classList.remove('is-deep-return')
    glow.style.opacity = ''
    setPosition(null)
    widget.setFloating(false)
    widget.dematerialize({ immediate: true })
    homeDock()
    setStageOpen(false)
    for (const node of [lift, sheet]) {
      node.style.transform = ''
      node.style.clipPath = ''
    }
    lift.style.zIndex = ''
    stage.querySelector('.pz-footer-stand-in')?.remove()
    setTabStop(null)
    state.saved = null
    state.near = false
    root.removeAttribute('data-near')
    document.documentElement.style.overflowAnchor = ''
    setPhase('hidden')
  }

  pocketRoot.addEventListener('pocket:view', (event) => {
    if (event.detail === 'pocket') {
      state.leaving = false
      reset()
      endObserver.observe(lip)
      window.addEventListener('pointermove', onPointerMove, { passive: true })
    } else if (event.detail === 'closing') {
      // The page turns away: nothing in the world may keep moving the page or start again.
      state.leaving = true
      stop()
      endObserver.disconnect()
      window.removeEventListener('pointermove', onPointerMove)
      widget.setFloating(false)
      stopInviting()
    } else if (event.detail === 'page') {
      reset()
    }
  })

  const api = {
    root,
    sheet,
    well,
    get phase() {
      return state.phase
    },
    get position() {
      return state.position
    },
    open,
    close,
    expand,
    peek: toPeek,
    reveal: reveal_,
    focusSpot,
    markDock,
    announce,
    refreshLip,
    /** For demos and tests: show the lip without scrolling to the end. */
    discover: reveal,
  }
  return api
}
