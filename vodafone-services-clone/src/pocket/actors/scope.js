/**
 * A cleanup scope: every listener, timer, animation frame, observer and Web Animation
 * started through it is released by one `dispose()`. The actors open a scope per pocket
 * visit (and one for their whole life), so closing the pocket or destroying the controller
 * leaves nothing running. The clock and frame source are injectable for tests.
 */

const browserFrames = {
  request: (fn) => globalThis.requestAnimationFrame(fn),
  cancel: (id) => globalThis.cancelAnimationFrame(id),
}

const browserClock = {
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (id) => globalThis.clearTimeout(id),
}

export const createScope = ({ clock = browserClock, frames = browserFrames } = {}) => {
  const controller = new AbortController()
  const timers = new Set()
  const rafs = new Set()
  const observers = new Set()
  const animations = new Set()
  const cleanups = new Set()
  let disposed = false

  return {
    signal: controller.signal,
    get disposed() {
      return disposed
    },

    on(target, type, listener, options = {}) {
      if (disposed || !target) return
      target.addEventListener(type, listener, { ...options, signal: controller.signal })
    },

    timeout(fn, ms) {
      if (disposed) return null
      const id = clock.setTimeout(() => {
        timers.delete(id)
        fn()
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
      const id = frames.request((time) => {
        rafs.delete(id)
        fn(time)
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
