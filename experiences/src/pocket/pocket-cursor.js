/**
 * The cursor on the Pocket page (the album), for a mouse or trackpad only.
 *
 * The pointer becomes a small Vodafone-red light: an exact dot (so precision never suffers)
 * inside a soft halo that trails it a little, and a wide, gentle pool of light around it on
 * the page. Saved cards near it lean toward it and catch a sheen where the light falls. A
 * click sends a ring of light across the page; the characters react when it reaches them
 * (pocket-actors.js listens). Over text fields the normal caret comes back.
 *
 * Off with reduced motion, on touch screens, while the journey covers the album, and whenever
 * anything here fails: the native cursor is only hidden once this is running, and it comes
 * back the moment it stops. Framework-free; everything is torn down by `destroy()`.
 */

const INTERACTIVE = 'a, button, [role="button"], summary, label, select, [tabindex]:not([tabindex="-1"])'
const TEXT = 'input, textarea, [contenteditable=""], [contenteditable="true"]'
const CARD = '.pocket-sticker'

const finePointer = () => window.matchMedia('(hover: hover) and (pointer: fine)').matches

const make = (tag, className, attributes = {}) => {
  const node = document.createElement(tag)
  node.className = className
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value)
  return node
}

/**
 * @param {object} options
 * @param {HTMLElement} options.root          #pocket-output (the album)
 * @param {object} options.timing             ./actors/timing.js (rippleSpan, rippleReach, lightLag)
 * @param {() => boolean} options.reducedMotion
 * @param {(ripple: {x:number,y:number,at:number}) => void} [options.onRipple]
 * @param {(pointer: object) => void} [options.onMove]
 * @param {(fn: Function) => Function} [options.wrap]  wraps every callback it registers (pocket-actors.js's)
 * @param {(node: Element) => Element} [options.mark]  called on every node it adds
 * @returns {{ pointer: object, light: object, active: boolean, destroy(): void }}
 */
export const createPocketCursor = ({ root, timing, reducedMotion, onRipple = () => {}, onMove = () => {}, wrap = (fn) => fn, mark = (node) => node }) => {
  const pointer = { x: -1, y: -1, vx: 0, vy: 0, speed: 0, at: 0, over: 'none', inside: false, slowSince: 0 }
  const light = { x: -1, y: -1 }
  const off = []
  let frame = null
  let last = 0
  let active = false
  let disposed = false
  let layout = null // cards' boxes and the album's top, measured when the layout changes (not per frame)
  let leanDue = false

  const cursor = mark(make('div', 'pocket-cursor', { 'aria-hidden': 'true' }))
  const halo = mark(make('div', 'pocket-cursor__halo'))
  const dot = mark(make('div', 'pocket-cursor__dot'))
  cursor.append(halo, dot)
  const pool = mark(make('div', 'pocket-light', { 'aria-hidden': 'true' }))
  const ripples = mark(make('div', 'pocket-ripples', { 'aria-hidden': 'true' }))

  const on = (target, type, handler, options) => {
    const wrapped = wrap(handler)
    target.addEventListener(type, wrapped, options)
    off.push(() => target.removeEventListener(type, wrapped, options))
  }

  const usable = () => !disposed && finePointer() && !reducedMotion() && !root.hidden && root.dataset.journey !== 'open'

  const setActive = (value) => {
    if (active === value) return
    active = value
    layout = null
    root.toggleAttribute('data-cursor', value)
    if (!value) {
      for (const card of root.querySelectorAll(CARD)) for (const name of ['--lean-x', '--lean-y', '--sheen-x', '--sheen-y', '--sheen-a']) card.style.removeProperty(name)
    }
  }

  const classify = (target) => {
    if (!(target instanceof Element) || !root.contains(target)) return 'outside'
    if (target.closest(TEXT)) return 'text'
    if (target.closest('.pocket-drone')) return 'drone'
    if (target.closest(INTERACTIVE)) return 'control'
    if (target.closest(CARD)) return 'card'
    return 'open'
  }

  /* -------------------------------------------- the light and the cards */
  const measure = () => {
    if (layout) return layout
    const cards = [...root.querySelectorAll(CARD)].map((card) => ({ card, box: card.getBoundingClientRect(), on: false }))
    layout = { cards, top: Math.max(0, root.getBoundingClientRect().top) }
    pool.style.setProperty('--top', `${layout.top.toFixed(0)}px`)
    return layout
  }

  /** Cards near the light lean toward it; the rest are left alone (no style work for them). */
  const leanCards = () => {
    const reach = 320
    for (const entry of measure().cards) {
      const { card, box } = entry
      if (!box.width) continue
      const cx = box.left + box.width / 2
      const cy = box.top + box.height / 2
      const dx = pointer.x - cx
      const dy = pointer.y - cy
      const outside = Math.max(0, Math.hypot(Math.max(0, Math.abs(dx) - box.width / 2), Math.max(0, Math.abs(dy) - box.height / 2)))
      const near = Math.max(0, 1 - outside / reach)
      const lean = near * near
      if (lean <= 0.001) {
        if (entry.on) {
          for (const name of ['--lean-x', '--lean-y', '--sheen-a']) card.style.removeProperty(name)
          entry.on = false
        }
        continue
      }
      entry.on = true
      card.style.setProperty('--lean-x', `${(-(dy / box.height) * 5 * lean).toFixed(2)}deg`)
      card.style.setProperty('--lean-y', `${((dx / box.width) * 5 * lean).toFixed(2)}deg`)
      card.style.setProperty('--sheen-x', `${(((pointer.x - box.left) / box.width) * 100).toFixed(1)}%`)
      card.style.setProperty('--sheen-y', `${(((pointer.y - box.top) / box.height) * 100).toFixed(1)}%`)
      card.style.setProperty('--sheen-a', (0.55 * lean).toFixed(3))
    }
  }

  const tick = wrap((now) => {
    frame = null
    if (!active) return
    const dt = last ? Math.min(64, now - last) : 16
    last = now
    // The light trails the pointer by about `lightLag` seconds.
    const k = 1 - Math.exp(-dt / 1000 / Math.max(0.01, timing.lightLag))
    light.x += (pointer.x - light.x) * k
    light.y += (pointer.y - light.y) * k
    const top = measure().top
    if (leanDue) {
      leanDue = false
      leanCards()
    }
    pool.style.setProperty('--lx', `${light.x.toFixed(1)}px`)
    pool.style.setProperty('--ly', `${(light.y - top).toFixed(1)}px`)
    halo.style.transform = `translate3d(${(light.x - pointer.x) * 0.5}px, ${(light.y - pointer.y) * 0.5}px, 0)`
    // The speed decays when the pointer rests (no events arrive then).
    if (now - pointer.at > 60) pointer.speed *= Math.exp(-dt / 120)
    const moving = Math.hypot(pointer.x - light.x, pointer.y - light.y) > 0.4 || pointer.speed > 2 || leanDue
    if (moving) frame = requestAnimationFrame(tick)
    else last = 0
  })

  const wake = () => {
    if (frame === null && active) frame = requestAnimationFrame(tick)
  }

  /* ------------------------------------------------------------ input */
  on(window, 'pointermove', (event) => {
    if (event.pointerType === 'touch') return
    const now = performance.now()
    const dt = Math.max(1, now - (pointer.at || now - 16))
    const vx = ((event.clientX - pointer.x) / dt) * 1000
    const vy = ((event.clientY - pointer.y) / dt) * 1000
    const fresh = pointer.x < 0
    pointer.vx = fresh ? 0 : pointer.vx * 0.6 + vx * 0.4
    pointer.vy = fresh ? 0 : pointer.vy * 0.6 + vy * 0.4
    pointer.speed = Math.hypot(pointer.vx, pointer.vy)
    pointer.x = event.clientX
    pointer.y = event.clientY
    pointer.at = now
    pointer.over = classify(event.target)
    pointer.inside = pointer.over !== 'outside'
    if (pointer.speed > timing.droneFollowSpeed || pointer.over !== 'open') pointer.slowSince = 0
    else if (!pointer.slowSince) pointer.slowSince = now
    const wanted = usable() && pointer.inside
    setActive(wanted)
    if (!active) return
    if (fresh || light.x < 0) {
      light.x = pointer.x
      light.y = pointer.y
    }
    cursor.style.transform = `translate3d(${pointer.x}px, ${pointer.y}px, 0)`
    if (cursor.dataset.over !== pointer.over) cursor.dataset.over = pointer.over
    leanDue = true
    wake()
    onMove(pointer)
  }, { passive: true })

  on(document.documentElement, 'pointerleave', () => {
    pointer.inside = false
    setActive(false)
    onMove(pointer)
  })

  on(window, 'blur', () => setActive(false))
  // Cards move only when the page scrolls or the layout changes: measure again then.
  const remeasure = () => {
    layout = null
    leanDue = true
    wake()
  }
  on(window, 'scroll', remeasure, { passive: true })
  on(window, 'resize', remeasure)
  const resized = new ResizeObserver(wrap(remeasure))
  resized.observe(root)
  off.push(() => resized.disconnect())
  // The journey opening over the album (or the album closing) hands the cursor back at once,
  // even if the pointer does not move.
  const watched = new MutationObserver(
    wrap(() => {
      if (active && !usable()) setActive(false)
    }),
  )
  watched.observe(root, { attributes: true, attributeFilter: ['data-journey', 'hidden'] })
  off.push(() => watched.disconnect())

  on(window, 'pointerdown', (event) => {
    if (!active || event.button !== 0 || event.pointerType === 'touch') return
    const over = classify(event.target)
    cursor.toggleAttribute('data-pressed', true)
    if (over === 'outside' || over === 'drone' || over === 'text') return
    const ripple = mark(make('div', 'pocket-ripple'))
    ripple.style.left = `${event.clientX}px`
    ripple.style.top = `${event.clientY}px`
    ripple.style.setProperty('--reach', `${timing.rippleReach}px`)
    ripples.append(ripple)
    const animation = ripple.animate(
      [
        { transform: 'translate(-50%, -50%) scale(0.04)', opacity: 0.9 },
        { transform: 'translate(-50%, -50%) scale(0.55)', opacity: 0.55, offset: 0.4 },
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 0 },
      ],
      { duration: timing.rippleSpan, easing: 'cubic-bezier(.2,.7,.35,1)' },
    )
    animation.onfinish = animation.oncancel = () => ripple.remove()
    onRipple({ x: event.clientX, y: event.clientY, at: performance.now() })
  })

  on(window, 'pointerup', () => cursor.removeAttribute('data-pressed'))

  root.append(pool, ripples, cursor)

  return {
    pointer,
    light,
    get active() {
      return active
    },
    /** Where a ripple's front is `elapsed` ms after it started (px from its centre). */
    rippleRadius: (elapsed) => {
      const t = Math.min(1, Math.max(0, elapsed / timing.rippleSpan))
      return timing.rippleReach * (1 - (1 - t) ** 2.2)
    },
    destroy: () => {
      disposed = true
      if (frame !== null) cancelAnimationFrame(frame)
      frame = null
      setActive(false)
      for (const fn of off.splice(0)) fn()
      pool.remove()
      ripples.remove()
      cursor.remove()
    },
  }
}
