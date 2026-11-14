/**
 * A cleanup scope: every listener, timer, animation frame, observer and Web Animation
 * started through it is released by one `dispose()`. The actors open a scope per pocket
 * visit (and one for their whole life), so closing the pocket or destroying the controller
 * leaves nothing running. The clock and frame source are injectable for tests.
 *
 * `wrap` (default: none) wraps every listener, timer and frame callback started through it (and
 * `wrap(fn)` hands it out for observer callbacks and promises): pocket.js passes
 * one that catches, so an error in an actor drops only the actors and never reaches the page.
 */

const browserFrames = {
  request: (fn) => globalThis.requestAnimationFrame(fn),
  cancel: (id) => globalThis.cancelAnimationFrame(id),
}

const browserClock = {
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (id) => globalThis.clearTimeout(id),
}

export const createScope = ({ clock = browserClock, frames = browserFrames, wrap = (fn) => fn } = {}) => {
  const controller = new AbortController()
  const timers = new Set()
  const rafs = new Set()
  const observers = new Set()
  const animations = new Set()
  const cleanups = new Set()
  let disposed = false

  return {
    signal: controller.signal,
    wrap,
    get disposed() {
      return disposed
    },

    on(target, type, listener, options = {}) {
      if (disposed || !target) return
      target.addEventListener(type, wrap(listener), { ...options, signal: controller.signal })
    },

    timeout(fn, ms) {
      if (disposed) return null
      const run = wrap(fn)
      const id = clock.setTimeout(() => {
        timers.delete(id)
        run()
      }, ms)
      timers.add(id)
      return id
    },

    clearTimeout(id) {
      if (id === null || id === undefined) return
      clock.clearTimeout(id)
      timers.delete(id)
    },

    frame(fn) {
      if (disposed) return null
      const run = wrap(fn)
      const id = frames.request((time) => {
        rafs.delete(id)
        run(time)
      })
      rafs.add(id)
      return id
    },

    cancelFrame(id) {
      if (id === null || id === undefined) return
      frames.cancel(id)
      rafs.delete(id)
    },

    observe(observer) {
      if (disposed) {
        observer.disconnect()
        return observer
      }
      observers.add(observer)
      return observer
    },

    unobserve(observer) {
      observer?.disconnect()
      observers.delete(observer)
    },

    animation(animation) {
      if (disposed) {
        animation.cancel()
        return animation
      }
      animations.add(animation)
      const forget = () => animations.delete(animation)
      animation.finished?.then(forget, forget)
      return animation
    },

    /** Any other teardown (temporary DOM, a nested scope). */
    defer(fn) {
      if (disposed) fn()
      else cleanups.add(fn)
    },

    /** Counts of what is still live; used by tests to prove teardown is complete. */
    get live() {
      return { timers: timers.size, frames: rafs.size, observers: observers.size, animations: animations.size, cleanups: cleanups.size }
    },

    dispose() {
      if (disposed) return
      disposed = true
      controller.abort()
      for (const id of timers) clock.clearTimeout(id)
      for (const id of rafs) frames.cancel(id)
      for (const observer of observers) observer.disconnect()
      for (const animation of animations) animation.cancel()
      for (const fn of cleanups) fn()
      timers.clear()
      rafs.clear()
      observers.clear()
      animations.clear()
      cleanups.clear()
    },
  }
}
