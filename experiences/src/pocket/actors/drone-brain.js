/**
 * The drone's state machine (no DOM; clock injected like the mascot's). The flight itself is
 * physical (./drone-flight.js): each state only says where it is heading.
 *
 * Direction: "live stage" (docs/adr/0002-pocket-actors-live-stage.md). It hovers around its
 * home, drifting gently on all six axes, and plays with the cursor.
 *
 *   hidden ─open→ entering ─revealed→ home-hover (hovering round its home, rotors spinning)
 *   home-hover|following ─pointer arrives on it→ curious (turns to the pointer) ─leaves→ home-hover
 *   home-hover ─cursor moves slowly in open space nearby→ following (keeps a little way off it)
 *   following ─cursor goes fast, far, onto content, or after a while→ returning-home → home-hover
 *   home-hover|curious|following ─first click of the page load→ drawing-heart → returning-home
 *   home-hover|curious|following ─later clicks→ evading (a hop with one turn) → home-hover
 *   home-hover|curious|following|returning-home ─a click's ripple reaches it→ dodging → back
 *   home-hover|curious|following|evading|dodging|returning-home ─press + drag→ dragging
 *   dragging ─release/cancel/Escape/resize→ returning-home → home-hover
 *   any ─close→ closing ─closeComplete→ hidden
 *
 * The mascot flies it (ADR-0003). It lands beside the mascot before the mascot dozes and takes
 * off again when it wakes; when the pocket opens with a free spot beside the mascot, it starts
 * there, parked, and takes off when the mascot has walked in and raised the remote:
 *   home-hover|curious|following|returning-home ─park→ landing ─→ landed (rotors stopped)
 *   hidden ─open (parked)→ landed
 *   landing|landed ─takeOff→ taking-off (rotors spin up, it climbs home) ─→ home-hover
 *
 * Dragging is direct manipulation and interrupts a hop, a dodge or a return. It is never
 * allowed while the drone is entering or drawing the heart, and never with reduced motion.
 */

import { TIMING } from './timing.js'

export const DRONE_STATES = ['hidden', 'entering', 'home-hover', 'curious', 'following', 'drawing-heart', 'evading', 'dodging', 'dragging', 'returning-home', 'landing', 'landed', 'taking-off', 'closing']

/** States in which it is performing something the person started. */
export const DRONE_BUSY = new Set(['drawing-heart', 'evading', 'dragging'])

/** States in which the pilot watches the drone (otherwise it watches the cursor). */
export const DRONE_WATCHED = new Set(['curious', 'following', 'drawing-heart', 'evading', 'dodging', 'dragging', 'returning-home', 'landing', 'taking-off'])

/** On the ground or on its way down/up: nothing to play with, no pointer events. */
export const DRONE_GROUNDED = new Set(['landing', 'landed', 'taking-off'])

const PLAYFUL = new Set(['home-hover', 'curious', 'following'])

/** `beforeChange(next, state)` runs just before a change of state, the old one still in force; `onChange` just after. */
export const createDroneBrain = ({ clock, timing = TIMING, reduced = () => false, onChange = () => {}, beforeChange = () => {} }) => {
  let state = 'hidden'
  let timer = null
  let press = null // { x, y } where a press started, until it becomes a drag or ends
  let lastPoke = -Infinity
  let heartDrawn = false // one heart per page load

  const clearTimer = () => {
    if (timer !== null) clock.clearTimeout(timer)
    timer = null
  }

  const enter = (next, { duration = null, then = null, info = {} } = {}) => {
    beforeChange(next, state)
    clearTimer()
    const previous = state
    state = next
    onChange(next, previous, info)
    if (duration !== null && then) {
      timer = clock.setTimeout(() => {
        timer = null
        then()
      }, duration)
    }
  }

  const hover = () => enter('home-hover')
  const returnHome = (info = {}) => enter('returning-home', { duration: info.cause === 'heart' ? timing.droneReturn : timing.droneSpringBack, then: hover, info })

  /**
   * The pocket starts opening: the drone waits under the turning page, hovering at home or
   * (`parked`) on the floor beside where the mascot will stand, until the mascot flies it up.
   */
  const open = ({ parked = false } = {}) => {
    press = null
    if (reduced()) enter('home-hover', { info: { instant: true } })
    else if (parked) enter('landed', { info: { instant: true, from: 'open' } })
    else enter('entering')
  }

  /** The pilot lands it (before it dozes). Returns true if it started down. */
  const park = () => {
    if (reduced() || !(PLAYFUL.has(state) || state === 'returning-home')) return false
    enter('landing', { duration: timing.droneLand, then: () => state === 'landing' && enter('landed') })
    return true
  }

  /** The pilot flies it back up (it woke, or it has walked in and raised the remote). */
  const takeOff = () => {
    if (state !== 'landing' && state !== 'landed') return false
    enter('taking-off', { duration: timing.droneTakeOff, then: () => state === 'taking-off' && hover(), info: { from: state } })
    return true
  }

  /** The pocket is fully revealed: it starts hovering. */
  const revealed = () => {
    if (state === 'entering') hover()
  }

  /** A fine pointer arrived on the drone: it turns toward it, curious. */
  const hoverEnter = () => {
    if (reduced()) return false
    if (state === 'curious') {
      clearTimer() // came back before it settled
      return false
    }
    if (state !== 'home-hover' && state !== 'following') return false
    enter('curious', { info: { from: state } })
    return true
  }

  /** The pointer left: it goes back to hovering a moment later. */
  const hoverLeave = () => {
    if (state !== 'curious') return
    clearTimer()
    timer = clock.setTimeout(() => {
      timer = null
      if (state === 'curious') hover()
    }, timing.droneSettle)
  }

  /** The cursor is moving slowly in open space nearby: it comes over and keeps it company. */
  const follow = () => {
    if (reduced() || state !== 'home-hover') return false
    enter('following', { duration: timing.droneFollowFor, then: () => state === 'following' && returnHome({ cause: 'bored' }) })
    return true
  }

  /** The cursor went fast, far away or onto content: it goes home. */
  const unfollow = () => {
    if (state !== 'following') return false
    returnHome({ cause: 'unfollow' })
    return true
  }

  /** A click's ripple reached it: it is shoved aside and recovers. */
  const ripple = () => {
    if (reduced() || !(PLAYFUL.has(state) || state === 'returning-home')) return false
    const back = state === 'following' ? 'following' : 'home-hover'
    enter('dodging', { duration: timing.droneDodge, then: () => (back === 'following' ? enter('following', { duration: timing.droneFollowFor, then: () => state === 'following' && returnHome({ cause: 'bored' }) }) : returnHome({ cause: 'dodge' })) })
    return true
  }

  /**
   * Click, tap, Enter or Space. The first one of a page load draws the heart (when `heart` says
   * the layout has room for it); later ones get a hop. Returns 'heart', 'hop' or false.
   */
  const poke = ({ heart = false } = {}) => {
    const now = clock.now()
    if (reduced() || !PLAYFUL.has(state) || now - lastPoke < timing.dronePokeCooldown) return false
    lastPoke = now
    if (heart && !heartDrawn) {
      heartDrawn = true
      enter('drawing-heart', { duration: timing.droneHeart, then: () => returnHome({ cause: 'heart', from: 'heart' }) })
      return 'heart'
    }
    enter('evading', { duration: timing.droneHop, then: hover, info: { cause: 'poke' } })
    return 'hop'
  }

  const pointerDown = (x, y) => {
    if (reduced() || !(PLAYFUL.has(state) || ['evading', 'dodging', 'returning-home'].includes(state))) return false
    press = { x, y }
    return true
  }

  /** Returns true while dragging (the caller then follows the pointer). */
  const pointerMove = (x, y) => {
    if (state === 'dragging') return true
    if (!press || Math.hypot(x - press.x, y - press.y) < timing.droneDragThreshold) return false
    enter('dragging')
    return true
  }

  /** Returns true if the press was a drag (so the click that follows is not a poke). */
  const pointerUp = () => {
    press = null
    if (state !== 'dragging') return false
    returnHome({ cause: 'release' })
    return true
  }

  const pointerCancel = () => {
    press = null
    if (state === 'dragging') returnHome({ cause: 'cancel' })
  }

  /** Escape: brings the drone home if it is away. Returns true if it handled the key. */
  const escape = () => {
    press = null
    if (!['dragging', 'evading', 'following', 'dodging'].includes(state)) return false
    returnHome({ cause: 'escape' })
    return true
  }

  /** The layout changed (resize, cards removed): never leave it stranded away from home. */
  const relayout = () => {
    press = null
    if (['dragging', 'evading', 'drawing-heart', 'following', 'dodging'].includes(state)) returnHome({ cause: 'relayout' })
    else if (state === 'curious') hover()
  }

  const close = () => {
    press = null
    if (state === 'hidden') return
    enter('closing')
  }

  const closeComplete = () => {
    press = null
    enter('hidden', { info: { reset: true } })
  }

  /** Document hidden: drop anything in flight and rest (at home, or on the ground if landing). */
  const suspend = () => {
    press = null
    if (state === 'hidden' || state === 'closing' || state === 'home-hover' || state === 'landed') return clearTimer()
    if (state === 'landing') return enter('landed', { info: { instant: true } })
    enter('home-hover', { info: { instant: true } })
  }

  const destroy = () => {
    clearTimer()
    press = null
    state = 'hidden'
  }

  return {
    open,
    revealed,
    park,
    takeOff,
    hoverEnter,
    hoverLeave,
    follow,
    unfollow,
    ripple,
    poke,
    pointerDown,
    pointerMove,
    pointerUp,
    pointerCancel,
    escape,
    relayout,
    close,
    closeComplete,
    suspend,
    destroy,
    get state() {
      return state
    },
    get busy() {
      return DRONE_BUSY.has(state)
    },
    get watched() {
      return DRONE_WATCHED.has(state)
    },
    get grounded() {
      return DRONE_GROUNDED.has(state)
    },
    get heartDrawn() {
      return heartDrawn
    },
    get pressing() {
      return press !== null
    },
    get pendingTimers() {
      return timer !== null ? 1 : 0
    },
  }
}
