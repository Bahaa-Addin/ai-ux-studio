/**
 * The mascot's state machine: what it is doing, for how long, and what may interrupt it.
 * No DOM here. Time comes from an injected clock and variation from an injected random
 * source, so tests can drive every transition deterministically. The DOM side
 * (pocket-actors.js) listens to `onChange` and plays the matching animation clip.
 *
 * Contexts
 *   page    the Services page: the mascot lives under the page-tip curl and only appears
 *           for the save greeting (peeking → waving → retreating → hidden)
 *   pocket  the album: caught by the page turn (page-reveal-hidden → startled → running →
 *           recovering), then a living presence in the opposite corner (corner-idle) with
 *           reactions, an idle ladder and ambient glances
 *
 * Priority (lower number wins; a state only interrupts states it outranks):
 *   1 transition    page opening/closing, the greeting, teardown
 *   2 constraint    tucked away because content is under its corner
 *   3 reaction      card hover/focus, waking
 *   4 idle          impatient, eating, yawning, sleeping
 *   5 ambient       glancing (pointer tracking runs inside corner-idle)
 *   6 rest          hidden, corner-idle
 */

import { TIMING, pick } from './timing.js'

export const PRIORITY = { transition: 1, constraint: 2, reaction: 3, idle: 4, ambient: 5, rest: 6 }

export const MASCOT_STATES = {
  hidden: 'rest',
  peeking: 'transition',
  waving: 'transition',
  retreating: 'transition',
  'page-reveal-hidden': 'transition',
  startled: 'transition',
  running: 'transition',
  recovering: 'transition',
  closing: 'transition',
  tucked: 'constraint',
  jumping: 'reaction',
  beaming: 'reaction',
  waking: 'reaction',
  impatient: 'idle',
  eating: 'idle',
  yawning: 'idle',
  sleeping: 'idle',
  glancing: 'ambient',
  'corner-idle': 'rest',
}

export const priorityOf = (state) => PRIORITY[MASCOT_STATES[state]]

const GREETING = new Set(['peeking', 'waving'])
const REVEAL = new Set(['page-reveal-hidden', 'startled', 'running', 'recovering'])

/**
 * @param {object} options
 * @param {{ now(): number, setTimeout(fn, ms): any, clearTimeout(id): void }} options.clock
 * @param {() => number} options.random  floats in [0, 1)
 * @param {object} [options.timing]      see ./timing.js
 * @param {() => boolean} [options.reduced] prefers-reduced-motion
 * @param {(state, previous, info) => void} [options.onChange]
 */
export const createMascotBrain = ({ clock, random, timing = TIMING, reduced = () => false, onChange = () => {} }) => {
  let state = 'hidden'
  let context = 'page'
  let side = 'right' // the side the page curl came from; the run starts there
  let tuckWanted = false
  let suspended = false
  let lastActivity = clock.now()
  let lastCard = -Infinity
  let thresholds = null // this ladder cycle's { impatientAt, eatAt, sleepAt }

  let stateTimer = null
  let greetTimer = null
  let glanceTimer = null
  const ladderTimers = new Set()

  /* ------------------------------------------------------------ timers */
  const clearStateTimer = () => {
    if (stateTimer !== null) clock.clearTimeout(stateTimer)
    stateTimer = null
  }
  const clearLadder = () => {
    for (const id of ladderTimers) clock.clearTimeout(id)
    ladderTimers.clear()
  }
  const clearGlance = () => {
    if (glanceTimer !== null) clock.clearTimeout(glanceTimer)
    glanceTimer = null
  }
  const clearGreet = () => {
    if (greetTimer !== null) clock.clearTimeout(greetTimer)
    greetTimer = null
  }
  const clearAll = () => {
    clearStateTimer()
    clearLadder()
    clearGlance()
    clearGreet()
  }

  /* ------------------------------------------------------------ states */
  /** Enters `next`; with a duration, `then` runs when it is over (unless interrupted). */
  const enter = (next, { duration = null, then = null, info = {} } = {}) => {
    clearStateTimer()
    const previous = state
    state = next
    onChange(next, previous, { context, side, ...info })
    if (duration !== null && then) {
      stateTimer = clock.setTimeout(() => {
        stateTimer = null
        then()
      }, duration)
    }
  }

  /** May `next` interrupt what is running now? */
  const outranks = (next) => MASCOT_STATES[state] === 'rest' || priorityOf(next) < priorityOf(state)

  /** The resting state for where the mascot is. */
  const rest = (info = {}) => {
    if (context === 'page') return enter('hidden', { info })
    if (tuckWanted) return enter('tucked', { info })
    return enter('corner-idle', { info })
  }

  /* ------------------------------------------------- idle ladder and glances */
  const ambientAllowed = () => context === 'pocket' && !suspended && !reduced()

  const scheduleGlance = () => {
    clearGlance()
    if (!ambientAllowed()) return
    glanceTimer = clock.setTimeout(() => {
      glanceTimer = null
      if (state === 'corner-idle') {
        const duration = timing.glance.reduce((sum, part) => sum + part, 0)
        enter('glancing', { duration, then: () => state === 'glancing' && rest() })
      }
      scheduleGlance()
    }, pick(timing.glanceEvery, random))
  }

  const ladderStep = (stage) => {
    const from = state
    const settled = from === 'corner-idle' || from === 'glancing'
    if (stage === 'impatient' && settled) {
      enter('impatient', { duration: timing.impatient, then: () => state === 'impatient' && rest() })
    } else if (stage === 'eating' && (settled || from === 'impatient')) {
      enter('eating', { duration: timing.eat, then: () => state === 'eating' && rest() })
    } else if (stage === 'yawning' && (settled || from === 'impatient' || from === 'eating')) {
      enter('yawning', { duration: timing.yawn, then: () => state === 'yawning' && enter('sleeping') })
    }
  }

  /** Starts the idle ladder from zero (any meaningful activity does this). */
  const restartLadder = () => {
    clearLadder()
    lastActivity = clock.now()
    if (!ambientAllowed()) return
    thresholds = { impatientAt: pick(timing.impatientAt, random), eatAt: pick(timing.eatAt, random), sleepAt: pick(timing.sleepAt, random) }
    const at = (ms, stage) => {
      const id = clock.setTimeout(() => {
        ladderTimers.delete(id)
        ladderStep(stage)
      }, ms)
      ladderTimers.add(id)
    }
    at(thresholds.impatientAt, 'impatient')
    at(thresholds.eatAt, 'eating')
    at(thresholds.sleepAt, 'yawning')
  }

  /** After a page transition: rest in the corner and start living there. */
  const settleInCorner = (info = {}) => {
    rest(info)
    restartLadder()
    scheduleGlance()
  }

  /* ----------------------------------------------------------- greeting */
  const rise = () =>
    enter('peeking', {
      duration: timing.rise,
      then: () =>
        enter('waving', {
          duration: timing.wave + timing.look,
          then: () => enter('retreating', { duration: timing.duck, then: () => enter('hidden') }),
        }),
    })

  /**
   * An item was pocketed (not restored): peek out from under the curl, wave, duck back.
   * Rapid saves coalesce into the greeting already under way.
   */
  const greet = () => {
    if (context !== 'page' || suspended || reduced()) return 'skipped'
    if (greetTimer !== null || GREETING.has(state)) return 'coalesced'
    if (state === 'retreating') {
      rise()
      return 'resumed'
    }
    greetTimer = clock.setTimeout(() => {
      greetTimer = null
      if (context === 'page' && state === 'hidden') rise()
    }, timing.greetDelay)
    return 'started'
  }

  /** The pocket is about to open: cut the greeting short. */
  const interruptGreeting = () => {
    clearGreet()
    if (GREETING.has(state)) enter('retreating', { duration: timing.quickDuck, then: () => enter('hidden'), info: { quick: true } })
  }

  /* --------------------------------------------------------- page turn */
  const startle = () =>
    enter('startled', {
      duration: timing.startle,
      then: () =>
        enter('running', {
          duration: timing.run,
          then: () => enter('recovering', { duration: timing.recover, then: () => settleInCorner() }),
        }),
    })

  /** The page starts turning away. `from` is the side of the sheet the curl comes from. */
  const revealStart = ({ from = 'right' } = {}) => {
    clearAll()
    context = 'pocket'
    side = from
    tuckWanted = false
    if (reduced()) {
      enter('corner-idle', { info: { instant: true } })
      return
    }
    enter('page-reveal-hidden')
  }

  const revealProgress = (t) => {
    if (state === 'page-reveal-hidden' && !suspended && t >= timing.revealAt) startle()
  }

  const revealComplete = () => {
    if (state === 'page-reveal-hidden' && !suspended) startle()
  }

  /** "Back to Services": duck before the returning page covers the corner. */
  const closeStart = () => {
    clearAll()
    if (context !== 'pocket' || state === 'hidden') return
    if (reduced() || suspended || state === 'page-reveal-hidden') {
      enter('hidden', { info: { instant: true } })
      return
    }
    enter('closing', { duration: timing.closeDuck, then: () => enter('hidden') })
  }

  const closeComplete = () => {
    clearAll()
    context = 'page'
    tuckWanted = false
    enter('hidden', { info: { instant: true, reset: true } })
  }

  /* ---------------------------------------------------------- reactions */
  /** Meaningful user activity: wake gently, drop idle business, restart the ladder. */
  const activity = () => {
    if (context !== 'pocket' || suspended) return
    lastActivity = clock.now()
    if (reduced()) return
    if (state === 'sleeping' || state === 'yawning') {
      clearLadder()
      enter('waking', { duration: timing.wake, then: () => state === 'waking' && settleInCorner() })
      return
    }
    if (state === 'impatient' || state === 'eating') rest({ interrupted: true })
    if (state !== 'waking') restartLadder()
  }

  /** A pocket card was entered: `input` is 'pointer' (jump), 'keyboard' or 'touch' (beam). */
  const cardEnter = (input = 'pointer') => {
    if (context !== 'pocket' || suspended || reduced()) return false
    const now = clock.now()
    if (now - lastCard < timing.cardDebounce) return false
    const next = input === 'pointer' ? 'jumping' : 'beaming'
    if (!outranks(next)) return false
    lastCard = now
    enter(next, { duration: input === 'pointer' ? timing.jump : timing.beam, then: () => state === next && rest(), info: { input } })
    return true
  }

  /** Content scrolled under the mascot's corner (or cleared again). */
  const setTucked = (value) => {
    tuckWanted = Boolean(value)
    if (context !== 'pocket' || REVEAL.has(state) || state === 'closing' || state === 'hidden') return
    if (tuckWanted && state !== 'tucked') {
      clearLadder()
      clearGlance()
      enter('tucked')
    } else if (!tuckWanted && state === 'tucked') {
      settleInCorner({ from: 'tucked' })
    }
  }

  /* --------------------------------------------------------- visibility */
  /** The document was hidden: settle into a resting pose; nothing stale replays later. */
  const suspend = () => {
    if (suspended) return
    suspended = true
    clearAll()
    if (context === 'page') {
      if (state !== 'hidden') enter('hidden', { info: { instant: true } })
    } else if (state !== 'sleeping' && state !== 'hidden') {
      enter(tuckWanted ? 'tucked' : 'corner-idle', { info: { instant: true } })
    }
  }

  const resume = () => {
    if (!suspended) return
    suspended = false
    if (context !== 'pocket' || state === 'hidden') return
    if (state === 'sleeping') {
      activity()
      return
    }
    restartLadder()
    scheduleGlance()
  }

  const destroy = () => {
    clearAll()
    state = 'hidden'
    context = 'page'
  }

  return {
    greet,
    interruptGreeting,
    revealStart,
    revealProgress,
    revealComplete,
    closeStart,
    closeComplete,
    activity,
    cardEnter,
    setTucked,
    suspend,
    resume,
    destroy,
    get state() {
      return state
    },
    get context() {
      return context
    },
    get side() {
      return side
    },
    get thresholds() {
      return thresholds
    },
    get lastActivity() {
      return lastActivity
    },
    /** Timers still pending (tests check that teardown leaves none). */
    get pendingTimers() {
      return ladderTimers.size + (stateTimer !== null) + (greetTimer !== null) + (glanceTimer !== null)
    },
  }
}
