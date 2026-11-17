/**
 * The mascot's state machine: what it is doing, for how long, and what may interrupt it.
 * No DOM here. Time comes from an injected clock, so tests can drive every transition
 * deterministically. The DOM side (pocket-actors.js) listens to `onChange` and moves the
 * character.
 *
 * Direction: "live stage" (docs/adr/0002-pocket-actors-live-stage.md).
 *
 * Contexts
 *   page    the Services page. The mascot hides behind the pocket button, under the paper.
 *           Every save: it comes out (emerging), takes hold of the button and pulls it open
 *           (holding) until the peeled item lands (catching), then lets go and sinks back
 *           (slipping → hidden). Saves that follow while it is out keep it holding on.
 *   pocket  the album. Every opening: it rides its hoverboard a short way from the corner to
 *           stand under the drone (riding), then lives there (idle): breathing, shifting its weight, its body
 *           turned toward the saved cards. It flies the drone with a remote (ADR-0003): its eye
 *           is on the drone while the drone does something, on the cursor otherwise. A ripple
 *           makes it flinch; after 60 s without input it first lands the drone beside it
 *           (parking, when there is a drone and a free spot) and then dozes. "Back to
 *           Services": it rides off toward the corner (leaving) as the page covers it.
 *
 * Priority (lower number wins; a state only interrupts states it outranks):
 *   1 transition    the save, riding in and out, teardown
 *   2 constraint    tucked away because content is where it stands
 *   3 reaction      flinching, waking
 *   4 idle          parking, yawning, sleeping
 *   5 rest          hidden, idle
 */

import { TIMING } from './timing.js'

export const PRIORITY = { transition: 1, constraint: 2, reaction: 3, idle: 4, rest: 5 }

export const MASCOT_STATES = {
  hidden: 'rest',
  emerging: 'transition',
  holding: 'transition',
  catching: 'transition',
  slipping: 'transition',
  riding: 'transition',
  leaving: 'transition',
  tucked: 'constraint',
  flinching: 'reaction',
  waking: 'reaction',
  parking: 'idle',
  yawning: 'idle',
  sleeping: 'idle',
  idle: 'rest',
}

export const priorityOf = (state) => PRIORITY[MASCOT_STATES[state]]

const GREETING = new Set(['emerging', 'holding', 'catching', 'slipping'])

/**
 * @param {object} options
 * @param {{ now(): number, setTimeout(fn, ms): any, clearTimeout(id): void }} options.clock
 * @param {object} [options.timing]      see ./timing.js
 * @param {() => boolean} [options.reduced] prefers-reduced-motion
 * @param {(state, previous, info) => void} [options.onChange]
 * @param {(next, state) => void} [options.beforeChange]  just before a change of state, the old one still in force
 * @param {() => number} [options.parkFor]  how long landing the drone takes before it dozes (0: none)
 */
export const createMascotBrain = ({ clock, timing = TIMING, reduced = () => false, onChange = () => {}, beforeChange = () => {}, parkFor = () => 0 }) => {
  let state = 'hidden'
  let context = 'page'
  let tuckWanted = false
  let suspended = false
  let lastActivity = clock.now()
  let landingAt = 0 // when the last item on its way is expected to land
  let pending = 0 // items on their way that have not landed yet
  let greetings = 0 // saves greeted on this page load

  let stateTimer = null
  let greetTimer = null
  let sleepTimer = null

  /* ------------------------------------------------------------ timers */
  const clearStateTimer = () => {
    if (stateTimer !== null) clock.clearTimeout(stateTimer)
    stateTimer = null
  }
  const clearGreet = () => {
    if (greetTimer !== null) clock.clearTimeout(greetTimer)
    greetTimer = null
  }
  const clearSleep = () => {
    if (sleepTimer !== null) clock.clearTimeout(sleepTimer)
    sleepTimer = null
  }
  const clearAll = () => {
    clearStateTimer()
    clearGreet()
    clearSleep()
  }

  /* ------------------------------------------------------------ states */
  /** Enters `next`; with a duration, `then` runs when it is over (unless interrupted). */
  const enter = (next, { duration = null, then = null, info = {} } = {}) => {
    beforeChange(next, state)
    clearStateTimer()
    const previous = state
    state = next
    onChange(next, previous, { context, ...info })
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
    return enter('idle', { info })
  }

  /* -------------------------------------------------------- the doze */
  const ambientAllowed = () => context === 'pocket' && !suspended && !reduced()

  /** Starts the idle clock from zero (any input does this): a doze at `sleepAt`. */
  const restartSleep = () => {
    clearSleep()
    lastActivity = clock.now()
    if (!ambientAllowed()) return
    sleepTimer = clock.setTimeout(() => {
      sleepTimer = null
      if (state !== 'idle') return
      // A pilot lands its drone first (beside it), then dozes.
      const park = Math.max(0, Number(parkFor()) || 0)
      if (park > 0) enter('parking', { duration: park, then: () => state === 'parking' && doze() })
      else doze()
    }, timing.sleepAt)
  }

  const doze = () => enter('yawning', { duration: timing.yawn, then: () => state === 'yawning' && enter('sleeping') })

  /** The drone is down (or cannot land after all): it dozes now. */
  const parked = () => {
    if (state === 'parking') doze()
  }

  const settle = (info = {}) => {
    rest(info)
    restartSleep()
  }

  /* -------------------------------------------------------------- the save */
  const sink = ({ quick = false } = {}) => {
    pending = 0
    enter('slipping', { duration: quick ? timing.quickSlip : timing.slip, then: () => enter('hidden'), info: { quick } })
  }

  /** Holds the button open until the item lands (or a little past when it should have). */
  const hold = () => {
    const wait = Math.max(0, landingAt - clock.now()) + timing.greetLanding
    enter('holding', { duration: wait, then: () => state === 'holding' && sink(), info: { landsIn: Math.max(0, landingAt - clock.now()) } })
  }

  const emerge = () => enter('emerging', { duration: timing.emerge, then: () => state === 'emerging' && hold() })

  const catchIt = () => {
    pending = Math.max(0, pending - 1)
    enter('catching', { duration: timing.catch, then: () => (pending > 0 ? hold() : sink()) })
  }

  /**
   * An item was pocketed (not restored). `landsIn` is how long until it lands in the button.
   * Every save gets the catch; a save while the mascot is out keeps it holding the button
   * open. Returns 'started', 'extended' or 'skipped'.
   */
  const greet = ({ landsIn = 1900 } = {}) => {
    if (context !== 'page' || suspended || reduced()) return 'skipped'
    greetings += 1
    pending += 1
    landingAt = Math.max(landingAt, clock.now() + landsIn)
    if (state === 'emerging' || state === 'holding' || state === 'catching') {
      if (state === 'holding') hold() // wait for the newest landing
      return 'extended'
    }
    if (state === 'slipping') {
      hold() // it reaches back up
      return 'extended'
    }
    if (greetTimer !== null) return 'extended'
    const lead = timing.emerge + timing.grabLead
    greetTimer = clock.setTimeout(() => {
      greetTimer = null
      if (context === 'page' && state === 'hidden') emerge()
    }, Math.max(0, landsIn - lead))
    return 'started'
  }

  /** An item has landed in the button: the beat the catch is timed to (each item gets one). */
  const landed = () => {
    if (state === 'holding' || state === 'emerging' || state === 'catching') catchIt()
    else pending = Math.max(0, pending - 1)
  }

  /** The pocket is about to open: let go at once. */
  const interruptGreeting = () => {
    clearGreet()
    pending = 0
    if (GREETING.has(state) && state !== 'slipping') sink({ quick: true })
  }

  /* --------------------------------------------------------- page turn */
  /**
   * The page starts turning away. `rideFor` is how long its ride to the drone's line takes
   * (0: it is already there); `covered` says content already sits where it stands.
   */
  const revealStart = ({ rideFor = 0, covered = false } = {}) => {
    clearAll()
    context = 'pocket'
    pending = 0
    tuckWanted = Boolean(covered)
    if (reduced() || suspended) {
      enter(tuckWanted ? 'tucked' : 'idle', { info: { instant: true } })
      return 'instant'
    }
    if (rideFor > 0) {
      enter('riding', { duration: rideFor, then: () => state === 'riding' && settle({ from: 'riding' }), info: { rideFor } })
      return 'ride'
    }
    settle({ quiet: true })
    return 'there'
  }

  /** Kept for the lifecycle API: the ride does not depend on how far the page has turned. */
  const revealProgress = () => {}
  const revealComplete = () => {}

  /** "Back to Services": it rides off toward the corner while the page covers it. */
  const closeStart = ({ rideFor = 0 } = {}) => {
    clearAll()
    if (context !== 'pocket' || state === 'hidden') return
    if (reduced() || suspended || state === 'tucked' || rideFor <= 0) {
      enter('hidden', { info: { instant: true } })
      return
    }
    enter('leaving', { info: { rideFor } })
  }

  const closeComplete = () => {
    clearAll()
    context = 'page'
    tuckWanted = false
    pending = 0
    enter('hidden', { info: { instant: true, reset: true } })
  }

  /* ---------------------------------------------------------- reactions */
  /** Meaningful user activity: wake gently, restart the idle clock. */
  const activity = () => {
    if (context !== 'pocket' || suspended) return
    lastActivity = clock.now()
    if (reduced()) return
    if (state === 'sleeping' || state === 'yawning') {
      clearSleep()
      enter('waking', { duration: timing.wake, then: () => state === 'waking' && settle() })
      return
    }
    if (state === 'parking') {
      settle({ from: 'parking' })
      return
    }
    if (state === 'waking') return
    restartSleep()
  }

  /**
   * A pointer rested on a card (or a card got keyboard focus, or a tap): the body turns toward
   * it. Returns 'look' when it can, false when it cannot (hidden, riding, asleep, reduced).
   */
  const cardDwell = () => {
    if (context !== 'pocket' || suspended || reduced()) return false
    return state === 'idle' || state === 'flinching' ? 'look' : false
  }

  /** A click's ripple reached it: a small flinch. Returns true if it flinched. */
  const ripple = () => {
    if (context !== 'pocket' || suspended || reduced()) return false
    if (state !== 'idle' || !outranks('flinching')) return false
    enter('flinching', { duration: timing.flinch, then: () => state === 'flinching' && rest() })
    return true
  }

  /** Content moved over where it stands (or cleared again). */
  const setTucked = (value) => {
    tuckWanted = Boolean(value)
    if (context !== 'pocket' || state === 'riding' || state === 'leaving' || state === 'hidden') return
    if (tuckWanted && state !== 'tucked') {
      clearSleep()
      enter('tucked')
    } else if (!tuckWanted && state === 'tucked') {
      settle({ from: 'tucked' })
    }
  }

  /* --------------------------------------------------------- visibility */
  /** The document was hidden: settle into a resting pose; nothing stale replays later. */
  const suspend = () => {
    if (suspended) return
    suspended = true
    clearAll()
    pending = 0
    if (context === 'page') {
      if (state !== 'hidden') enter('hidden', { info: { instant: true } })
    } else if (state === 'parking') {
      enter('sleeping', { info: { instant: true } })
    } else if (state !== 'sleeping' && state !== 'hidden') {
      enter(tuckWanted ? 'tucked' : 'idle', { info: { instant: true } })
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
    restartSleep()
  }

  const destroy = () => {
    clearAll()
    state = 'hidden'
    context = 'page'
  }

  return {
    greet,
    landed,
    interruptGreeting,
    revealStart,
    revealProgress,
    revealComplete,
    closeStart,
    closeComplete,
    activity,
    parked,
    cardDwell,
    ripple,
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
    get lastActivity() {
      return lastActivity
    },
    get greetings() {
      return greetings
    },
    get pending() {
      return pending
    },
    /** Timers still pending (tests check that teardown leaves none). */
    get pendingTimers() {
      return (stateTimer !== null) + (greetTimer !== null) + (sleepTimer !== null)
    },
  }
}
