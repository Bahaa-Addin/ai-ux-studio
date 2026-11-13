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
 * - When: only on the website, where the page was read well enough (`gate`), while the page shows.
 * - Keyboard (owner, 2026-11-13): the buttons are out of the Tab order; screen readers reach them by
 *   name in the labelled group. From our own buttons, Escape and Shift+Tab go back to the card, Tab
 *   to what follows it. No key is handled anywhere on Vodafone's page.
 *
 * Every pass reads first and writes after. Every callback runs through the guard (`wrap`, `on`).
 */
import { clipBox, placeChip } from './chips-place.js'

/** Owl's loop copies of a slide, and anything the layer drew: never cards of their own. */
const COPIES = '.owl-item.cloned, [data-aixc]'
const HEADINGS = 'h1, h2, h3, h4, h5, h6'
const PRESSABLE = 'a[href], button, .btn, [role="button"]'
const PICTURES = 'img, svg, picture, video'
const TABBABLE = 'a[href], button, input, select, textarea, summary, iframe, [tabindex], [contenteditable="true"]'
/** How long the slots follow a transition in Vodafone's content (Owl's stage, the home slides). */
const FOLLOW_MS = 1000

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

  /** Vodafone's card → { id, slot, cta, clips, size, pick, radius } */
  const slots = new Map()
  let allowed = gate(coverage)
  let stopped = false
  let frame = 0
  let followUntil = 0
  let fonts = 0
  /** The full chip's size, measured once (the label is in the page's language), and the icon-only one. */
  let chipSize = null
  const unplaced = new Set()

  const resized = observe(new ResizeObserver(wrap('pocket chips resize', () => schedule())))

  /** The ancestors that cut what shows of `card` (Owl's stage, horizontal scrollers). */
  const clipsOf = (card) => {
    const out = []
    for (let node = card.parentElement; node && node !== document.documentElement; node = node.parentElement) {
      const style = getComputedStyle(node)
      if (style.overflowX !== 'visible' || style.overflowY !== 'visible') out.push(node)
    }
    return out
  }

  const add = (card, id) => {
    const slot = mark(document.createElement('div'))
    root.append(slot)
    const entry = decorate(card, id, slot)
    slots.set(card, { id, slot, cta: entry.cta, clips: clipsOf(card), size: '', pick: null, radius: '0px' })
    resized.observe(card)
  }

  const drop = (card) => {
    const s = slots.get(card)
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
    for (const [card, id] of want) if (!slots.has(card)) add(card, id)
    schedule()
  }

  /** The chip's corner on `card`, as offsets from the card's box (read phase only). */
  const pickFor = (card, box, s) => {
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
    const p = placeChip({ card: box, avoid, size: chipSize, iconSize: icon, dir: getComputedStyle(card).direction, small: window.innerWidth < 640 })
    return p && { dx: p.x - box.left, dy: p.y - box.top, icon: p.icon, unplaced: p.unplaced, corner: p.corner, id: s.id }
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
    const plans = []
    for (const [card, s] of slots) {
      const box = card.isConnected ? card.getBoundingClientRect() : null
      const shows = !!box && box.width > 0 && box.height > 0 && (card.checkVisibility?.({ visibilityProperty: true }) ?? true)
      const seen = shows ? clipBox(box, s.clips.map((node) => node.getBoundingClientRect())) : null
      if (!seen) {
        plans.push({ s, box: null })
        continue
      }
      const size = `${Math.round(box.width)}x${Math.round(box.height)}:${fonts}`
      if (size !== s.size) {
        s.size = size
        s.pick = pickFor(card, box, s)
        s.radius = getComputedStyle(card).borderRadius
      }
      plans.push({ s, box, seen })
    }
    // Writes.
    for (const { s, box, seen } of plans) {
      const hide = !box || !s.pick
      if (s.slot.hidden !== hide) s.slot.hidden = hide
      if (hide) continue
      const st = s.slot.style
      st.transform = `translate(${box.left - base.left}px, ${box.top - base.top}px)`
      st.width = `${box.width}px`
      st.height = `${box.height}px`
      st.borderRadius = s.radius
      const cut = seen.left > box.left || seen.top > box.top || seen.right < box.right || seen.bottom < box.bottom
      st.clipPath = cut ? `inset(${seen.top - box.top}px ${box.right - seen.right}px ${box.bottom - seen.bottom}px ${seen.left - box.left}px)` : ''
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
  on(window, 'resize', () => schedule())
  if (document.fonts)
    on(document.fonts, 'loadingdone', () => {
      fonts++
      schedule()
    })
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
        }
        if (marks) rekey()
        else if (moved) schedule()
      }),
    ),
  )
  watched.observe(content, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-aixc-item', 'style', 'class', 'hidden'] })

  /* While focus is inside a pocketed card, its liner lets the card show through (WCAG 2.4.11). */
  let focused = null
  on(document, 'focusin', (event) => {
    let next = null
    for (const [card, s] of slots) if (card.contains(event.target)) next = s.slot
    if (focused === next) return
    if (focused) delete focused.dataset.focusIn
    focused = next
    if (focused) focused.dataset.focusIn = ''
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
    const all = [...document.querySelectorAll(TABBABLE)].filter(isTabbable)
    const own = isTabbable(card) ? card : all.find((node) => card.contains(node))
    const before = all.filter((node) => card.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_PRECEDING && !node.contains(card)).at(-1)
    const after = all.find((node) => card.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING && !card.contains(node))
    const target = event.key === 'Tab' && !event.shiftKey ? after : own ?? before
    if (!target) return
    event.preventDefault()
    target.focus()
  })

  /* Before a chip or Put back does anything (a failure here takes the whole layer away, ADR-0048 §7). */
  on(root, 'click', () => checkpoint('pocket-chip'), true)

  rekey()

  return {
    /** The model or its coverage changed: which cards get chips, again. */
    refresh(next = null) {
      if (next) coverage = next
      allowed = gate(coverage)
      rekey()
    },
    /** The Pocket's view changed (album opened or closed). */
    view() {
      if (state.view !== 'page' || state.busy) root.hidden = true
      schedule()
    },
    debug: () => ({
      shown: [...slots.values()].filter((s) => !root.hidden && !s.slot.hidden).map((s) => s.id),
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
