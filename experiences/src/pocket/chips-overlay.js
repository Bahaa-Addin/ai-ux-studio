/**
 * "Pocket it" on Vodafone's own cards (live plan phase 3 S6; voice-guide ADR-0052 §10-§14).
 *
 * Nothing is written into Vodafone's cards beyond the adapter's two marks (ADR-0049). The chips live
 * in one region of our own after the page's content (`place`, PageHost.addRegion): a slot per card,
 * absolutely placed over it, holding the chip, the liner and the lift (pocket.js `decorate` draws them
 * on the slot exactly as the clone draws them on its cards).
 *
 * - Which cards: the adapter's marked cards that the current model knows, one element per id, never
 *   Owl's loop copies or our own copies. Re-keyed when the model changes (`refresh`) or a mark moves.
 * - Where: each slot follows its card's box; the chip takes a corner that meets none of the words of
 *   the card's headings and links, none of its smaller buttons and none of its smaller pictures
 *   (./chips-place.js), picked again only when the card's size or the fonts change. A card cut by Owl's stage (or any clipping ancestor) is cut the same way, hit-testing included.
 * - On the first screen (the page at scroll 0, as a visitor first sees it), a chip is not under the trail's
 *   pill (F9) or the guide's microphone (F8b; its keyboard button and transcript bar too while they show)
 *   either: a card whose corner one of them would cover there takes the next corner. Picked again when the
 *   pill or the mic shows, goes or changes size (a ResizeObserver on each), when the trail says it is up
 *   (vg:trail-ready) and when the guide's host arrives on the page; never on scroll.
 * - When: only on the website, where the page was read well enough (`gate`), while the page shows.
 * - A slot is as big as the part of its card that shows: a card cut by Owl's stage or a scroller gets
 *   a slot cut the same way, so nothing of ours extends past what shows (and body never scrolls
 *   sideways from a chip). A card wholly cut keeps its buttons for screen readers in a 1 px clipped
 *   slot, because its card is still in Vodafone's page; focus is never left on a button that goes away.
 * - Keyboard (owner, 2026-11-13): the buttons are out of the Tab order; screen readers reach them by
 *   name in the labelled group. From our own buttons, Escape and Shift+Tab go back to the card, Tab
 *   to what follows it. No key is handled anywhere on Vodafone's page.
 *
 * Every pass reads first and writes after. Every callback runs through the guard (`wrap`, `on`).
 */
import { clipBox, overFirstScreen, placeChip } from './chips-place.js'

/** Owl's loop copies of a slide, and anything the layer drew: never cards of their own. */
const COPIES = '.owl-item.cloned, [data-aixc]'
const HEADINGS = 'h1, h2, h3, h4, h5, h6'
const PRESSABLE = 'a[href], button, .btn, [role="button"]'
const PICTURES = 'img, svg, picture, video'
const TABBABLE = 'a[href], button, input, select, textarea, summary, iframe, [tabindex], [contenteditable="true"]'
/** How long the slots follow a transition in Vodafone's content (Owl's stage, the home slides). */
const FOLLOW_MS = 1000
/**
 * The fixed controls the chips of the first screen keep clear of, found where ./obstacles.js finds them for
 * the actors (its TRAIL, GUIDE_ALWAYS and GUIDE_WHILE_SHOWN): read here, not imported, since that module
 * would come whole into the chunk the Pocket loads at once (1,147 bytes gzipped more, measured 2026-11-17).
 * The trail's pill (F9); the guide's microphone, and its keyboard button and transcript bar while they
 * show (F8b), faded out otherwise.
 */
const FIXED = '.tr-pill, .vg-mic'
const FADING = '.vg-kbd, .vg-bar'

/** Every match of `selector`, in the guide's shadow root (where they mount) and in the page. */
const inGuide = (selector) =>
  [...document.querySelectorAll('vg-guide')].flatMap((host) => [...(host.shadowRoot?.querySelectorAll(selector) ?? [])]).concat(...document.querySelectorAll(selector))

/** True while `node` shows (tucked away above the screen or not); one that `fades` also not faded out (opacity 0.05 or less, as for the actors). */
const showing = (node, fades) => {
  if (!node.getClientRects().length) return false
  const style = getComputedStyle(node)
  return style.visibility !== 'hidden' && !(fades && +style.opacity <= 0.05)
}

/** True when a button shows its own box (a fill or a border); a plain link shows only its words. */
const drawn = (node) => {
  const style = getComputedStyle(node)
  const fill = style.backgroundColor
  return (!!fill && fill !== 'transparent' && !/rgba\(.*,\s*0\)$/.test(fill)) || style.backgroundImage !== 'none' || parseFloat(style.borderTopWidth) > 0 || parseFloat(style.borderBottomWidth) > 0
}

const isTabbable = (node) =>
  node.tabIndex >= 0 && !node.disabled && !node.closest('[data-aixc], [inert], [hidden]') && (node.checkVisibility?.({ visibilityProperty: true }) ?? true)

/**
 * `place(root)`: puts the region on the page. `content`: Vodafone's content (#main-content), watched
 * for marks and moves. `cards()`: its marked cards. `hidden()`: true while the layer hides it.
 * `gate(coverage)`: true where chips may show. The rest is the Pocket's (pocket.js): its catalog,
 * decorate/undecorate, state and guarded helpers.
 */
export const createChips = ({ place, content, cards, hidden = () => false, gate = () => true, coverage = null, catalog, decorate, undecorate, state, page, on, observe, wrap, mark, checkpoint, t }) => {
  const root = mark(document.createElement('div'))
  root.className = 'pocket-chips'
  root.setAttribute('role', 'group')
  root.setAttribute('aria-label', t('Pocket it on this page'))
  root.lang = page().lang
  root.dir = page().dir
  root.style.cssText = 'position:relative;height:0;margin:0;padding:0;z-index:2'
  place(root)

  /** Vodafone's card → { id, slot, cta, undo, clips, key, pick, radius } */
  const slots = new Map()
  /** The clipping ancestors may have changed (a stage was added, a row became a scroller): read them again. */
  let reclip = true
  let allowed = gate(coverage)
  let stopped = false
  let frame = 0
  let followUntil = 0
  let fonts = 0
  /** The full chip's size, measured once (the label is in the page's language), and the icon-only one. */
  let chipSize = null
  const unplaced = new Set()

  const resized = observe(
    new ResizeObserver(
      wrap('pocket chips resize', () => {
        reclip = true
        schedule()
      }),
    ),
  )

  /** The fixed controls that show, each where it rests at scroll 0, in viewport coordinates there (F9, F8b); and the ones watched. */
  let rests = new Map()
  const fixedNodes = new Set()
  const fixedWatch = observe(new ResizeObserver(wrap('pocket chips fixed', () => schedule())))
  /** Reads them (read phase only): the guide and its trail can come after the chips, change size or go. */
  const readFixed = () => {
    // The pill and the mic are watched once found, shown or not: their size says when they go or come back.
    for (const node of fixedNodes)
      if (!node.isConnected) {
        fixedNodes.delete(node)
        fixedWatch.unobserve(node)
      }
    const fixed = inGuide(FIXED)
    for (const node of fixed)
      if (!fixedNodes.has(node)) {
        fixedNodes.add(node)
        fixedWatch.observe(node)
      }
    const now = new Map()
    for (const node of [...fixed, ...inGuide(FADING)]) {
      if (!showing(node, node.matches(FADING))) continue
      // Where it rests: without the transform that moves it (the trail tucks its pill away while the page scrolls down).
      const r = node.getBoundingClientRect()
      const m = new DOMMatrixReadOnly(getComputedStyle(node).transform)
      // Further down it keeps the top it had at scroll 0: the trail may raise its pill under a header that has left.
      const top = window.scrollY > 0 && rests.has(node) ? rests.get(node).top : r.top - m.f
      now.set(node, { left: r.left - m.e, top, right: r.right - m.e, bottom: top + r.height })
    }
    rests = now
  }

  /** The ancestors that cut what shows of `card` (Owl's stage, horizontal scrollers). */
  const clipsOf = (card) => {
    const out = []
    for (let node = card.parentElement; node && node !== document.documentElement; node = node.parentElement) {
      const style = getComputedStyle(node)
      if (style.overflowX !== 'visible' || style.overflowY !== 'visible') out.push(node)
    }
    return out
  }

  /** The stops around `card` on Vodafone's page: its own link, the one before it, the one after it. */
  const stopsAround = (card) => {
    const all = [...document.querySelectorAll(TABBABLE)].filter(isTabbable)
    const own = isTabbable(card) ? card : all.find((node) => card.contains(node))
    const before = all.filter((node) => card.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_PRECEDING && !node.contains(card)).at(-1)
    const after = all.find((node) => card.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING && !card.contains(node))
    return { own, before, after }
  }

  /** Takes focus off a slot's buttons before the slot is hidden or removed, so a screen-reader user is not dropped on the page. */
  const release = (card, s) => {
    if (!card.isConnected || !s.slot.contains(document.activeElement)) return
    const { own, before } = stopsAround(card)
    ;(own ?? before)?.focus({ preventScroll: true })
  }

  /** Puts card `id`'s slot before `before` (the next card's), so the buttons stay in the page's card order. */
  const add = (card, id, before = null) => {
    const slot = mark(document.createElement('div'))
    root.insertBefore(slot, before)
    const entry = decorate(card, id, slot)
    const s = { id, slot, cta: entry.cta, undo: entry.undo, clips: clipsOf(card), key: '', pick: null, radius: '0px' }
    slots.set(card, s)
    resized.observe(card)
    return s
  }

  const drop = (card) => {
    const s = slots.get(card)
    release(card, s)
    slots.delete(card)
    unplaced.delete(s.id)
    resized.unobserve(card)
    undecorate(s.id)
    s.slot.remove()
  }

  /** Which of Vodafone's cards get a chip now: the first element per id the model knows, never a copy. */
  const rekey = () => {
    checkpoint('pocket-chips')
    const want = new Map()
    const ids = new Set()
    if (allowed)
      for (const card of cards()) {
        const id = card.dataset.aixcItem
        if (!id || ids.has(id) || !catalog.has(id) || card.closest(COPIES)) continue
        ids.add(id)
        want.set(card, id)
      }
    for (const [card, s] of [...slots]) if (want.get(card) !== s.id || !card.isConnected) drop(card)
    // The cards that stay: Vodafone may have changed what clips them or what they are called.
    for (const [card, s] of slots) {
      s.clips = clipsOf(card)
      const { title } = catalog.get(s.id).item
      s.cta.setAttribute('aria-label', t('Pocket it: {title}', { title }))
      s.undo.setAttribute('aria-label', t('Put back {title}', { title }))
    }
    reclip = false
    // From the last card to the first, each new slot goes before the next card's, so the buttons keep the page's order.
    let next = null
    for (const [card, id] of [...want].reverse()) next = (slots.get(card) ?? add(card, id, next)).slot
    schedule()
  }

  /** The chip's corner on `card`, as offsets from the part of it that shows (read phase only). `fixed`: the fixed controls over the first screen. */
  const pickFor = (card, box, seen, s, fixed) => {
    const area = box.width * box.height
    const avoid = []
    // Words, line by line: a heading's or a plain link's box often spans the card while its words do not.
    const words = document.createRange()
    const wordsOf = (node) => {
      words.selectNodeContents(node)
      for (const r of words.getClientRects()) if (r.width && r.height) avoid.push(r)
    }
    for (const node of card.querySelectorAll(HEADINGS)) wordsOf(node)
    // The card's own smaller buttons and pictures (icons, logos), never the card itself when it is the link.
    for (const node of card.querySelectorAll(`${PRESSABLE}, ${PICTURES}`)) {
      const r = node.getBoundingClientRect()
      if (!r.width || !r.height || r.width * r.height >= area / 2) continue
      if (node.matches(PICTURES) || drawn(node)) avoid.push(r)
      else wordsOf(node)
    }
    const icon = { width: chipSize.height, height: chipSize.height }
    const p = placeChip({ card: box, clips: [seen], avoid, fixed, size: chipSize, iconSize: icon, dir: getComputedStyle(card).direction, small: window.innerWidth < 640 })
    return p && { dx: p.x - seen.left, dy: p.y - seen.top, icon: p.icon, unplaced: p.unplaced, corner: p.corner, id: s.id }
  }

  const pass = () => {
    frame = 0
    if (stopped) return
    checkpoint('pocket-chips')
    const off = !allowed || state.view !== 'page' || state.busy || hidden()
    if (root.hidden !== off) root.hidden = off
    if (off || !slots.size) return
    if (!chipSize) {
      // Measured once on a copy of a chip in its full state (a pocketed card's chip is not drawn).
      const probe = slots.values().next().value.cta.cloneNode(true)
      probe.classList.remove('pocket-cta--icon')
      probe.setAttribute('aria-hidden', 'true')
      probe.style.cssText = 'visibility:hidden;left:0;top:0'
      root.append(probe)
      chipSize = { width: Math.ceil(probe.offsetWidth), height: Math.ceil(probe.offsetHeight) || 32 }
      probe.remove()
      if (!chipSize.width) return void (chipSize = null)
    }
    // Reads.
    const base = root.getBoundingClientRect()
    if (reclip) {
      for (const [card, s] of slots) s.clips = clipsOf(card)
      reclip = false
    }
    readFixed()
    const scroll = { x: window.scrollX, y: window.scrollY }
    const atRest = [...rests.values()]
    const restKey = atRest.map((r) => [r.left, r.top, r.right, r.bottom].map(Math.round)).join(';')
    const plans = []
    for (const [card, s] of slots) {
      const box = card.isConnected ? card.getBoundingClientRect() : null
      const shows = !!box && box.width > 0 && box.height > 0 && (card.checkVisibility?.({ visibilityProperty: true }) ?? true)
      if (!shows) {
        plans.push({ card, s, shows })
        continue
      }
      const seen = clipBox(box, s.clips.map((node) => node.getBoundingClientRect()))
      if (seen) {
        // The fixed controls, for a card of the first screen; moving with the page, so the same pick at any scroll.
        const fixed = atRest.map((rest) => overFirstScreen(rest, { card: box, scroll, height: window.innerHeight })).filter(Boolean)
        // Picked again when the card's size, the fonts, the part that shows or (first screen) the fixed controls change, not while it merely moves.
        const key = `${Math.round(box.width)}x${Math.round(box.height)}:${fonts}:${Math.round(seen.left - box.left)},${Math.round(seen.top - box.top)},${Math.round(box.right - seen.right)},${Math.round(box.bottom - seen.bottom)}:${fixed.length ? restKey : ''}`
        if (key !== s.key) {
          s.key = key
          s.pick = pickFor(card, box, seen, s, fixed)
          s.radius = getComputedStyle(card).borderRadius
        }
      }
      plans.push({ card, s, shows, box, seen })
    }
    // Writes.
    for (const { card, s, shows, box, seen } of plans) {
      if (s.slot.hidden === shows) {
        if (!shows) release(card, s)
        s.slot.hidden = !shows
      }
      if (!shows) continue
      const st = s.slot.style
      if (!seen) {
        // Wholly cut by its carousel or scroller: nothing to see or press, but its card is still in Vodafone's
        // page, so a screen reader keeps finding the buttons (in a 1 px clipped box that cannot move the page).
        s.slot.dataset.cut = ''
        st.transform = 'translate(0px, 0px)'
        st.width = '1px'
        st.height = '1px'
        st.overflow = 'hidden'
        st.clipPath = 'inset(50%)'
        continue
      }
      delete s.slot.dataset.cut
      const cut = seen.left > box.left + 0.5 || seen.top > box.top + 0.5 || seen.right < box.right - 0.5 || seen.bottom < box.bottom - 0.5
      st.transform = `translate(${seen.left - base.left}px, ${seen.top - base.top}px)`
      st.width = `${seen.right - seen.left}px`
      st.height = `${seen.bottom - seen.top}px`
      st.clipPath = ''
      st.overflow = cut ? 'hidden' : ''
      st.borderRadius = cut ? '0' : s.radius
      // Where the card's own corner is, for the lift (pocket.js liftCorner).
      st.setProperty('--pocket-cut-x', `${seen.left - box.left}px`)
      st.setProperty('--pocket-cut-y', `${seen.top - box.top}px`)
      if (!s.pick) continue
      s.cta.style.left = `${s.pick.dx}px`
      s.cta.style.top = `${s.pick.dy}px`
      s.cta.classList.toggle('pocket-cta--icon', s.pick.icon)
      if (s.pick.unplaced) unplaced.add(s.id)
      else unplaced.delete(s.id)
    }
    if (performance.now() < followUntil) schedule()
  }

  function schedule() {
    if (!frame && !stopped) frame = requestAnimationFrame(wrap('pocket chips', pass))
  }

  /* Triggers. The region is in the page's flow, so the page's own scroll needs nothing. */
  resized.observe(document.body)
  on(window, 'resize', () => {
    reclip = true
    schedule()
  })
  if (document.fonts)
    on(document.fonts, 'loadingdone', () => {
      fonts++
      schedule()
    })
  // The trail's own word that it is up (its pill shown): the pass finds the pill and watches its size from then on.
  on(window, 'vg:trail-ready', () => schedule())
  // The guide has no word of its own that it is up: its host arrives on body, before the chips or after them
  // (its script is not ours to order), and the pass then finds its mic and watches its size.
  observe(new MutationObserver(wrap('pocket chips guide', (records) => records.some((r) => [...r.addedNodes].some((node) => node.localName === 'vg-guide')) && schedule()))).observe(document.body, { childList: true })
  // Inner scrollers (Owl's stage outer when focus moves into a hidden slide, horizontal lists).
  on(document, 'scroll', (event) => event.target !== document && schedule(), { capture: true, passive: true })
  const follow = (event) => {
    if (event.target.closest?.('[data-aixc]')) return
    followUntil = performance.now() + FOLLOW_MS
    schedule()
  }
  on(document, 'transitionrun', follow, true)
  on(document, 'transitionend', follow, true)
  const watched = observe(
    new MutationObserver(
      wrap('pocket chips watch', (records) => {
        let marks = false
        let moved = false
        for (const r of records) {
          if (r.target.closest?.('[data-aixc]')) continue
          if (r.attributeName === 'data-aixc-item') marks = true
          else moved = true
          // A stage wrapped around cards, a class that makes a row scroll: what clips a card may have changed.
          if (r.type === 'childList' || r.attributeName === 'class' || r.attributeName === 'hidden') reclip = true
        }
        if (marks) rekey()
        else if (moved) schedule()
      }),
    ),
  )
  watched.observe(content, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-aixc-item', 'style', 'class', 'hidden'] })

  /* While focus is inside a pocketed card, its liner lets the card show through (WCAG 2.4.11). */
  let focused = null
  let focusedCard = null
  const setFocused = (card, s) => {
    if (focused === (s?.slot ?? null)) return
    if (focused) delete focused.dataset.focusIn
    focused = s?.slot ?? null
    focusedCard = card
    if (focused) focused.dataset.focusIn = ''
  }
  on(document, 'focusin', (event) => {
    for (const [card, s] of slots) if (card.contains(event.target)) return setFocused(card, s)
    setFocused(null, null)
  })
  // Focus left without going anywhere (a click on empty space, a removed link): the card shows as it is again.
  on(document, 'focusout', (event) => {
    if (focused && !(event.relatedTarget && focusedCard?.contains(event.relatedTarget))) setFocused(null, null)
  })

  /* From our own buttons only: back to the card (Escape, Shift+Tab) or on to what follows it (Tab). */
  const cardOf = (node) => {
    for (const [card, s] of slots) if (s.slot.contains(node)) return card
    return null
  }
  on(root, 'keydown', (event) => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || (event.key !== 'Escape' && event.key !== 'Tab')) return
    const card = cardOf(event.target)
    if (!card) return
    const { own, before, after } = stopsAround(card)
    const target = event.key === 'Tab' && !event.shiftKey ? after : own ?? before
    if (!target) return
    event.preventDefault()
    target.focus()
  })

  /* Before a chip or Put back does anything (a failure here takes the whole layer away, ADR-0048 §7). */
  on(root, 'click', () => checkpoint('pocket-chip'), true)

  try {
    rekey()
  } catch (error) {
    // The Pocket's own clean-up (offs) takes the listeners and observers; the region goes here.
    root.remove()
    throw error
  }

  return {
    /** The model or its coverage changed: which cards get chips, again. */
    refresh(next = null) {
      if (next) coverage = next
      allowed = gate(coverage)
      rekey()
    },
    /**
     * The Pocket's view changed (album opened or closed). Back on the page, the chips are placed and shown at once,
     * in the frame the page comes back, not one later (W2-A).
     */
    view() {
      if (state.view !== 'page' || state.busy) root.hidden = true
      else {
        cancelAnimationFrame(frame)
        pass()
      }
      schedule()
    },
    debug: () => ({
      shown: [...slots.values()].filter((s) => !root.hidden && !s.slot.hidden && !('cut' in s.slot.dataset)).map((s) => s.id),
      unplaced: [...unplaced],
      icon: [...slots.values()].filter((s) => s.pick?.icon).map((s) => s.id),
    }),
    destroy() {
      stopped = true
      cancelAnimationFrame(frame)
      for (const card of [...slots.keys()]) drop(card)
      root.remove()
    },
  }
}
