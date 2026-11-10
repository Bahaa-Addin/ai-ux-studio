/**
 * Motion helpers for the RED world: one easing curve family, a cubic-bezier solver (the same
 * curves the CSS uses, so JS-driven and CSS-driven motion feel like one system), and a scroll
 * guard used only while the page is being pushed (a transition must not fight a wheel).
 */

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value))
export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** cubic-bezier(x1, y1, x2, y2) as a function of time, solved with Newton's method. */
export const bezier = (x1, y1, x2, y2) => {
  const cx = 3 * x1
  const bx = 3 * (x2 - x1) - cx
  const ax = 1 - cx - bx
  const cy = 3 * y1
  const by = 3 * (y2 - y1) - cy
  const ay = 1 - cy - by
  const sampleX = (t) => ((ax * t + bx) * t + cx) * t
  const sampleY = (t) => ((ay * t + by) * t + cy) * t
  const slopeX = (t) => (3 * ax * t + 2 * bx) * t + cx
  return (x) => {
    if (x <= 0) return 0
    if (x >= 1) return 1
    let t = x
    for (let i = 0; i < 8; i += 1) {
      const error = sampleX(t) - x
      if (Math.abs(error) < 1e-5) break
      const slope = slopeX(t)
      if (Math.abs(slope) < 1e-6) break
      t -= error / slope
    }
    // Bisection fallback for flat regions.
    let lo = 0
    let hi = 1
    t = clamp(t, 0, 1)
    for (let i = 0; i < 20 && Math.abs(sampleX(t) - x) > 1e-5; i += 1) {
      if (sampleX(t) < x) lo = t
      else hi = t
      t = (lo + hi) / 2
    }
    return sampleY(t)
  }
}

/**
 * The curves. `sheet` is the long, settling curve of a native sheet (fast start, no overshoot);
 * `settle` brings a released drag home; `standard` is for small UI changes.
 * CSS mirrors: --pz-ease-sheet, --pz-ease-settle, --pz-ease-standard (extension.css).
 */
export const EASE = {
  sheet: bezier(0.32, 0.72, 0, 1),
  settle: bezier(0.2, 0.9, 0.25, 1),
  standard: bezier(0.4, 0, 0.2, 1),
  exit: bezier(0.55, 0, 0.75, 0.25),
  inOut: bezier(0.65, 0, 0.35, 1),
}

/** Maps t from [from, to] onto [0, 1] (clamped): a sub-range of a longer transition. */
export const segment = (t, from, to) => clamp((t - from) / (to - from), 0, 1)

/**
 * Stops wheel, touch and keyboard scrolling while a transition moves the page itself.
 * Returns the release function. Only used for the push and its return (well under a second).
 */
export const holdScroll = () => {
  const keys = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' ', 'Spacebar'])
  const stop = (event) => event.cancelable && event.preventDefault()
  const stopKeys = (event) => {
    if (!keys.has(event.key)) return
    const target = event.target
    if (target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return
    event.preventDefault()
  }
  const options = { passive: false, capture: true }
  window.addEventListener('wheel', stop, options)
  window.addEventListener('touchmove', stop, options)
  window.addEventListener('keydown', stopKeys, true)
  return () => {
    window.removeEventListener('wheel', stop, options)
    window.removeEventListener('touchmove', stop, options)
    window.removeEventListener('keydown', stopKeys, true)
  }
}

/** Scrolls the page to `y` without any smooth-behaviour the page might have. */
export const scrollPageTo = (y) => window.scrollTo({ top: Math.round(y), left: 0, behavior: 'instant' })

/**
 * A rAF loop that animates the page scroll to `to`, interrupted by any user scroll input.
 * Resolves true when it arrived, false when the user took over.
 */
export const glideTo = (to, { duration = 520, easing = EASE.inOut } = {}) => {
  const from = window.scrollY
  if (reducedMotion() || Math.abs(to - from) < 2) {
    scrollPageTo(to)
    return Promise.resolve(true)
  }
  return new Promise((resolve) => {
    let raf = 0
    const start = performance.now()
    const cancel = () => {
      cancelAnimationFrame(raf)
      cleanup()
      resolve(false)
    }
    const cleanup = () => {
      window.removeEventListener('wheel', cancel, true)
      window.removeEventListener('touchstart', cancel, true)
      window.removeEventListener('keydown', cancel, true)
    }
    window.addEventListener('wheel', cancel, { capture: true, passive: true })
    window.addEventListener('touchstart', cancel, { capture: true, passive: true })
    window.addEventListener('keydown', cancel, true)
    const frame = () => {
      const t = Math.min(1, (performance.now() - start) / duration)
      scrollPageTo(from + (to - from) * easing(t))
      if (t < 1) raf = requestAnimationFrame(frame)
      else {
        cleanup()
        resolve(true)
      }
    }
    raf = requestAnimationFrame(frame)
  })
}
