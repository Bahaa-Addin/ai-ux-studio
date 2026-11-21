/**
 * The box's measures on Vodafone's own pages (live plan phase 4a; voice-guide ADR-0076, phase 4 design §3.1, §3.2,
 * §3.3): the raw numbers Reimagine's shell (./shell.js) writes on its own nodes, which the experiences' stylesheets
 * map (vodafone.css, spotlight.css). Nothing of Vodafone's is written; its controls are only read.
 *
 * On the box (#experience-output.aixc-box), in px (--aixc-box-h and --aixc-box-push are the shell's: its open scroll):
 *   --aixc-viewbar-h    the view bar's height (its first, sticky row)
 *   --aixc-pin-y        the viewport y of the pin line: the box's top plus the bar
 *   --aixc-safe-right-w/-h, --aixc-safe-left-w/-h
 *                       how far each physical bottom corner's controls reach into the box from its bottom edge and
 *                       its side, with SAFE px around them (0 where they do not reach it): bottom-right, Vodafone's
 *                       accessibility button and the guide's microphone (with its keyboard button and transcript bar
 *                       while they show); bottom-left, the Pocket's button while it shows. The same in both languages.
 * On the bar: --aixc-pill-room (the inline end kept free of the trail's pill: its width, its end gap and 16 px) and
 * --aixc-pill-drop (on phones the bar's buttons go on a row below the pill: the pill's height and 8 px).
 * On the composer, where it goes (the lead's decision, 2026-11-17), its data-placement and the raw numbers for it; it
 * never covers its opener, the pill, the launcher, a corner's controls or Vodafone's header band (the shell's
 * headerBottom()):
 *   below    under what opened it (the launcher, or the view bar) and the pill where it rests (not tucked away), GAP
 *            down: --aixc-composer-top, and --aixc-composer-room the room down to SAFE px above both corners' controls,
 *            when that room is at least H_MIN;
 *   beside   else in the column on the inline-start side of its opener (left of it in English, right of it in Arabic),
 *            its inline end GAP from the opener so the reader sees it next to what opened it, from the header's
 *            bottom + GAP down to EDGE above the screen's bottom, its own side EDGE from the screen's, cut clear of both
 *            corners' zones, the pill and the launcher, and the bar's controls and words (clear(): each may take its
 *            top, its bottom or a side, its inline end included), when that is at least W_MIN wide and H_MIN tall:
 *            --aixc-composer-top and -room the column's, --aixc-composer-w at most WIDE (600 px, wider than its own 400
 *            below: more columns, so its rows fit the short column), and
 *            --aixc-composer-left with its inline end at the column's;
 *   below    else as the first, its height the room there is however short (0 where there is none).
 * The choice reads only the other controls, never the composer itself, so placing it cannot change it. Vodafone's
 * pages do not ask for the notch's area (no viewport-fit), so the screen's safe-area insets are 0 on them.
 *
 * Measured again as ../../../pocket/obstacles.js watches the actors' obstacles: a ResizeObserver on each control and
 * on the box and the bar, the class of the guide's controls (its keyboard button and bar fade by class) and the end of
 * their transitions, the Pocket button's state, the guide or a control arriving (body's children, the guide's shadow
 * root), the trail's pill (its class and size), and the window's scroll and resize (the nav pins and unpins, the box
 * moves), at most once a frame; only what changed is written. The box's height is not among them: it is the screen
 * under where the box rests, which the shell sets after its open scroll and on a resize (./shell.js align, settle). Every callback goes through the guard; stop() leaves
 * no observer, listener or frame behind.
 */

/** The space kept around a corner's controls (px), and the bar's own gap past the pill. */
const SAFE = 16
/** The trail's pill is that far under Vodafone's header (voice-guide trail config ui.gap). */
const PILL_GAP = 8

const RIGHT = ['.vg-mic', '.vg-kbd', '.vg-bar']
const LEFT = '.pocket-peek'

/** The composer's distance from our own controls and Vodafone's header, and from the screen's sides and bottom (px). */
const GAP = 8
const EDGE = 16
/**
 * The composer's least room (px), measured on it in Vodafone's faces: H_MIN is its height down to its first row of
 * template buttons (its heading, the Original / Reimagined row, "Ready-made experiences" and that row, with its
 * padding), the most it is at any width from W_MIN to 400 px (measured there; wider, beside its opener, it is no taller)
 * in English and Arabic: 215, a row whose names take two lines
 * (one line: 199). The rest scrolls inside it (live.css: as many columns as fit, 2 to 4 below, up to 6 beside; six
 * templates are 277 to 371 px in all at 400 px, thirteen 449 to 684), so short screens keep it beside its opener: the
 * shortest column it is given there is
 * 219 px (812x375, opened from "Change experience"; 844x390 from it 234, 667x375 249, 1366x380 260).
 * W_MIN the narrowest width at which its heading stays on one line, in both languages. WIDE: the most it takes beside
 * its opener, six columns (2026-11-20: at 400 px, four columns, thirteen templates took 449 px in 1366x520's 400 px
 * column; at six they take three rows).
 */
const H_MIN = 215
const W_MIN = 240
const WIDE = 600

const meets = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
const grow = (r, m) => ({ left: r.left - m, top: r.top - m, right: r.right + m, bottom: r.bottom + m })
const score = (r) => Math.min(r.right - r.left, WIDE) * (r.bottom - r.top)

/**
 * The largest part of the column `col`, at least W_MIN by H_MIN, that meets none of `blocks`: each block it meets is cut
 * off on one of the block's sides (the column loses its top, its bottom or one of its sides to it), every way tried;
 * null when no part is that large. A handful of blocks: the corners' controls, the pill, the launcher and the bar's.
 */
const clear = (col, blocks) => {
  if (col.right - col.left < W_MIN || col.bottom - col.top < H_MIN) return null
  const hit = blocks.find((b) => meets(b, col))
  if (!hit) return col
  let best = null
  for (const cut of [{ top: hit.bottom }, { bottom: hit.top }, { left: hit.right }, { right: hit.left }]) {
    const found = clear({ ...col, ...cut }, blocks)
    if (found && (!best || score(found) > score(best))) best = found
  }
  return best
}

/** A control as a person meets it: a box, not hidden, not faded out (the guide's keyboard button and bar fade). */
const shown = (node) => {
  if (!node?.isConnected || !node.getClientRects().length) return null
  const r = node.getBoundingClientRect()
  if (!(r.width > 0 && r.height > 0)) return null
  const style = getComputedStyle(node)
  if (style.visibility === 'hidden' || Number(style.opacity) <= 0.05) return null
  if (node.matches(LEFT) && node.dataset.state === 'hidden') return null
  return r
}

/** The trail's pill where it rests (its transform taken off: hover and tuck move it by a transform only), or null. */
const pillRest = (pill) => {
  if (!pill?.isConnected || pill.hidden || !pill.getClientRects().length) return null
  const r = pill.getBoundingClientRect()
  if (!(r.width > 0)) return null
  const m = new DOMMatrixReadOnly(getComputedStyle(pill).transform)
  return { left: r.left - m.e, right: r.right - m.e, top: r.top - m.f, bottom: r.bottom - m.f, width: r.width, height: r.height, tucked: pill.classList.contains('tucked') }
}

/** A node as it shows now (its box), or null. */
const rectOf = (node) => (node?.isConnected && node.getClientRects().length ? node.getBoundingClientRect() : null)

/**
 * anchor(): what the composer goes below (the launcher, or the view bar); opener(): the button that opened it (the
 * launcher, or the bar's "Change experience"); launcher: the launcher's button.
 */
export const createBox = ({ host, guard, box, bar, composer, anchor, opener, launcher, headerBottom, onMeasure = null }) => {
  const set = (node, name, value) => {
    if (node.style.getPropertyValue(name) !== value) node.style.setProperty(name, value)
  }
  const px = (n) => `${Math.max(0, Math.ceil(n))}px`

  /** The controls as they are now. */
  const find = () => {
    const right = [document.getElementById('vodafone-aw-icon')]
    let pill = null
    for (const guide of document.querySelectorAll('vg-guide')) {
      const root = guide.shadowRoot
      if (!root) continue
      for (const selector of RIGHT) right.push(...root.querySelectorAll(selector))
      pill ??= root.querySelector('.tr-pill')
    }
    pill ??= document.querySelector('.tr-pill')
    return { right: right.filter(Boolean), left: [...document.querySelectorAll(LEFT)], pill }
  }

  /**
   * The column beside the composer's opener (the header comment), its inline end GAP px from the opener's inline start,
   * cut clear of the corners' zones (SAFE px around their controls), of the pill and the launcher, and of the bar's
   * controls and its words, the view's name, while the box shows (GAP px around each); null when no part of it is
   * W_MIN by H_MIN, or the opener does not show.
   */
  const beside = (header, pill, zones, boxShown) => {
    const from = rectOf(opener())
    if (!from) return null
    const width = document.documentElement.clientWidth
    const col = { top: header + GAP, bottom: innerHeight - EDGE }
    if (host.dir === 'rtl') Object.assign(col, { left: from.right + GAP, right: width - EDGE })
    else Object.assign(col, { left: EDGE, right: from.left - GAP })
    const blocks = zones.map((r) => grow(r, SAFE))
    // The pill where it rests (tucked too: it comes back on the way up) and the launcher, GAP px around them.
    for (const r of [pill, rectOf(launcher)]) if (r?.width) blocks.push(grow(r, GAP))
    if (boxShown && !bar.hidden) {
      for (const node of bar.querySelectorAll('button, .aixc-segmented')) {
        const r = rectOf(node)
        if (r?.width) blocks.push(grow(r, GAP))
      }
      const meta = bar.querySelector('.aixc-viewbar__meta')
      if (meta?.textContent.trim()) {
        const range = document.createRange()
        range.selectNodeContents(meta)
        const text = range.getBoundingClientRect()
        const own = meta.getBoundingClientRect()
        blocks.push(grow({ left: Math.max(text.left, own.left), top: text.top, right: Math.min(text.right, own.right), bottom: text.bottom }, GAP))
      }
    }
    return clear(col, blocks)
  }

  let last = { zones: null, pill: null, composer: null }

  const measure = () => {
    const boxShown = box.isConnected && !box.hidden
    const composerShown = composer.isConnected && !composer.hidden
    if (!boxShown && !composerShown) return
    const controls = find()
    const right = controls.right.map(shown).filter(Boolean)
    const left = controls.left.map(shown).filter(Boolean)
    const pill = pillRest(controls.pill)
    last.pill = pill
    if (boxShown) {
      const b = box.getBoundingClientRect()
      const barH = bar.hidden || bar.parentNode !== box ? 0 : bar.offsetHeight
      set(box, '--aixc-viewbar-h', px(barH))
      set(box, '--aixc-pin-y', `${Math.round(b.top + box.clientTop + barH)}px`)
      // The box's scrolling area (its own scrollbar is not part of it: the left one of a right-to-left box included).
      const area = { left: b.left + box.clientLeft, top: b.top + box.clientTop }
      area.right = area.left + box.clientWidth
      area.bottom = area.top + box.clientHeight
      const reaches = (r) => r.left - SAFE < area.right && r.right + SAFE > area.left && r.top - SAFE < area.bottom && r.bottom + SAFE > area.top
      const zone = (list, side) => {
        let w = 0
        let h = 0
        for (const r of list.filter(reaches)) {
          w = Math.max(w, side === 'right' ? area.right - (r.left - SAFE) : r.right + SAFE - area.left)
          h = Math.max(h, area.bottom - (r.top - SAFE))
        }
        return { w: Math.min(w, area.right - area.left), h: Math.min(h, area.bottom - area.top) }
      }
      const zones = { right: zone(right, 'right'), left: zone(left, 'left') }
      for (const side of ['right', 'left']) {
        set(box, `--aixc-safe-${side}-w`, px(zones[side].w))
        set(box, `--aixc-safe-${side}-h`, px(zones[side].h))
      }
      last.zones = zones
      // The bar's inline end, kept free of the pill: its width, its gap to the screen's edge and 16 px; on phones the
      // bar's buttons go below it. Kept whenever the pill shows (tucked too: it comes back on the way up), so the bar
      // does not reflow while the page scrolls.
      const inner = bar.firstElementChild
      if (inner && !bar.hidden) {
        const ib = inner.getBoundingClientRect()
        const rtl = host.dir === 'rtl'
        const room = pill ? (rtl ? pill.right - ib.left : ib.right - pill.left) + SAFE : 0
        set(bar, '--aixc-pill-room', px(room))
        set(bar, '--aixc-pill-drop', px(pill ? pill.height + PILL_GAP : 0))
      }
    }
    if (composerShown) {
      // Below what opened it (the launcher or the bar's "Change experience") and the pill where it rests, or beside its
      // opener where the room below is short (the header comment): our floating controls never overlap. Below, its height is
      // the room down to SAFE px above every bottom corner's control, however short (it scrolls inside; with no room it
      // shows nothing rather than cover one). Either stays under Vodafone's header where the header meets the top of
      // the screen, pinned or in the flow (host.chromeBottom() counts a pinned header only: at the top of the page 0).
      const header = headerBottom()
      const zones = [...right, ...left]
      // In whole pixels, the top rounded up and the floor down (Vodafone's header and the view bar end on a fraction):
      // rounding each of the top and the room up on its own put the composer's bottom (top + room) up to 1 px past
      // the floor, into a corner's zone.
      const floor = Math.floor(Math.min(innerHeight, ...zones.map((r) => r.top - SAFE)))
      const top = Math.ceil(Math.max(header, rectOf(anchor())?.bottom ?? 0, pill && !pill.tucked ? pill.bottom : 0) + GAP)
      const column = floor - top < H_MIN ? beside(header, pill, zones, boxShown) : null
      if (column) {
        // In whole pixels inside the column.
        const [l, t, r, b] = [Math.ceil(column.left), Math.ceil(column.top), Math.floor(column.right), Math.floor(column.bottom)]
        const w = Math.min(WIDE, r - l)
        set(composer, '--aixc-composer-top', px(t))
        set(composer, '--aixc-composer-room', px(b - t))
        set(composer, '--aixc-composer-w', px(w))
        set(composer, '--aixc-composer-left', px(host.dir === 'rtl' ? l : r - w))
      } else {
        set(composer, '--aixc-composer-top', px(top))
        set(composer, '--aixc-composer-room', px(floor - top))
      }
      if (composer.dataset.placement !== (column ? 'beside' : 'below')) composer.dataset.placement = column ? 'beside' : 'below'
      last.composer = { placement: composer.dataset.placement, column }
    }
    onMeasure?.(last)
  }

  let frame = 0
  const schedule = () => {
    if (!frame && !guard.stopped) frame = requestAnimationFrame(guard.wrap('reimagine measure', () => ((frame = 0), measure())))
  }

  // What is watched: the controls (their size, class, transitions), the guide's shadow roots, body's children, the
  // box and the bar.
  const seen = new Set()
  const roots = new Set()
  const ended = guard.wrap('reimagine control', (event) => event.target === event.currentTarget && schedule())
  const sizes = new ResizeObserver(guard.wrap('reimagine sizes', () => schedule()))
  const tree = new MutationObserver(
    guard.wrap('reimagine controls', (records) => {
      if (records.some((r) => r.type === 'childList')) scan()
      schedule()
    }),
  )
  const scan = () => {
    const { right, left, pill } = find()
    for (const node of [...right, ...left, pill].filter(Boolean)) {
      if (seen.has(node)) continue
      seen.add(node)
      sizes.observe(node)
      tree.observe(node, { attributes: true, attributeFilter: ['class', 'hidden', 'data-state'] })
      node.addEventListener('transitionend', ended)
    }
    for (const node of seen) {
      if (node.isConnected) continue
      seen.delete(node)
      sizes.unobserve(node)
      node.removeEventListener('transitionend', ended)
    }
    for (const guide of document.querySelectorAll('vg-guide')) {
      const root = guide.shadowRoot
      if (!root || roots.has(root)) continue
      roots.add(root)
      tree.observe(root, { childList: true, subtree: true })
    }
  }
  tree.observe(document.body, { childList: true })
  sizes.observe(box)
  sizes.observe(bar)
  scan()
  guard.listen(window, 'scroll', schedule, { passive: true })
  guard.listen(window, 'resize', schedule)
  guard.listen(window, 'vg:trail-ready', () => (scan(), schedule()))

  const stop = () => {
    cancelAnimationFrame(frame)
    frame = 0
    sizes.disconnect()
    tree.disconnect()
    for (const node of seen) node.removeEventListener('transitionend', ended)
    seen.clear()
    roots.clear()
  }

  return {
    measure,
    schedule,
    stop,
    /** The last zones and pill as measured: for `?aixc-debug` and the tests. */
    get last() {
      return last
    },
  }
}
