/**
 * Failure isolation for the experience layer on Vodafone's pages (voice-guide ADR-0048 §7).
 *
 * Every entry point of the layer (its start, each event handler it adds, each import() of a demo)
 * runs through one guard. On the first error the guard logs it with [AIXC], runs the clean-ups the
 * layer registered (listeners, observers, regions), removes every node marked data-aixc and stops:
 * the page is left as Vodafone served it, and the error never reaches the page.
 */

const ADDED = '[data-aixc]'

export const createGuard = ({ log = console, root = document } = {}) => {
  const cleanups = []
  let stopped = false
  let failure = null

  const stop = (reason = 'stopped') => {
    if (stopped) return
    stopped = true
    // Last registered, first undone: a demo's clean-up runs before the regions it lived in go.
    for (const cleanup of cleanups.splice(0).reverse()) {
      try {
        cleanup(reason)
      } catch (error) {
        log.warn?.('[AIXC] a clean-up failed', error)
      }
    }
    try {
      for (const node of root.querySelectorAll(ADDED)) node.remove()
    } catch (error) {
      log.warn?.('[AIXC] could not remove the layer', error)
    }
  }

  const fail = (step, error) => {
    if (stopped) return
    failure = { step, message: String(error?.message || error) }
    log.error?.(`[AIXC] ${step} failed; the experience layer removed itself`, error)
    stop('failed')
  }

  /** Runs `fn` (sync or async) as `step`; an error stops the layer. */
  const run = (step, fn) => {
    if (stopped) return undefined
    try {
      const result = fn()
      if (result && typeof result.then === 'function') return result.catch((error) => fail(step, error))
      return result
    } catch (error) {
      fail(step, error)
      return undefined
    }
  }

  /** `fn` wrapped so that every call runs through the guard. */
  const wrap = (step, fn) => (...args) => run(step, () => fn(...args))

  /** addEventListener through the guard; removed again when the layer stops. */
  const listen = (target, type, handler, options) => {
    const guarded = wrap(`${type} handler`, handler)
    target.addEventListener(type, guarded, options)
    cleanups.push(() => target.removeEventListener(type, guarded, options))
    return guarded
  }

  return {
    run,
    wrap,
    listen,
    /** Registers a clean-up for when the layer stops (failure, ?aixc=off at run time, or stop()). */
    onStop: (cleanup) => cleanups.push(cleanup),
    stop,
    get stopped() {
      return stopped
    },
    get failure() {
      return failure
    },
  }
}
