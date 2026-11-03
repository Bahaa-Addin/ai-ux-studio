/**
 * The drone's state machine (no DOM; clock injected like the mascot's).
 *
 *   hidden ─open→ entering ─revealed→ drawing-heart → returning-home → home-hover
 *                                   └──(no room / reduced motion)───→ home-hover
 *   home-hover ─hover/poke→ evading → home-hover
 *   home-hover|evading|returning-home ─press + drag past threshold→ dragging
 *   dragging ─release/cancel/Escape/resize→ returning-home → home-hover
 *   any ─close→ closing ─closeComplete→ hidden
 *
 * Dragging is direct manipulation and interrupts evading or returning. It is never allowed
 * while the drone is entering or drawing the heart, and never with reduced motion.
 */

import { TIMING } from './timing.js'

export const DRONE_STATES = ['hidden', 'entering', 'drawing-heart', 'home-hover', 'evading', 'dragging', 'returning-home', 'closing']

export const createDroneBrain = ({ clock, timing = TIMING, reduced = () => false, onChange = () => {} }) => {
  let state = 'hidden'
  let timer = null
  let press = null // { x, y } where a press started, until it becomes a drag or ends
  let hoverArmed = true // one evasion per pointer entry
  let lastEvade = -Infinity

  const clearTimer = () => {
    if (timer !== null) clock.clearTimeout(timer)
    timer = null
  }

  const enter = (next, { duration = null, then = null, info = {} } = {}) => {
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
  const returnHome = (info = {}) => enter('returning-home', { duration: timing.droneSpringBack, then: hover, info })

  /** The pocket starts opening: the drone waits at home under the turning page. */
  const open = () => {
    press = null
    hoverArmed = true
    enter(reduced() ? 'home-hover' : 'entering', { info: { instant: reduced() } })
  }

  /**
   * The pocket is fully revealed: draw the heart once, then settle at home. `withHeart` is
   * false when the final layout has no room for the heart.
   */
  const revealed = ({ withHeart = true } = {}) => {
    if (state !== 'entering') return
    if (!withHeart || reduced()) return hover()
    enter('drawing-heart', {
      duration: timing.droneHeart,
      then: () => enter('returning-home', { duration: timing.droneReturn, then: hover, info: { from: 'heart' } }),
    })
  }

  const evade = (cause, cooldown) => {
    const now = clock.now()
    if (state !== 'home-hover' || reduced() || now - lastEvade < cooldown) return false
    lastEvade = now
    enter('evading', { duration: timing.droneEvade, then: hover, info: { cause } })
    return true
  }

  /** Fine pointer entered the drone: one startled hop per entry. */
  const hoverEnter = () => {
    if (!hoverArmed) return false
    hoverArmed = false
    return evade('hover', timing.droneEvadeCooldown)
  }
  const hoverLeave = () => {
    hoverArmed = true
  }

  /** Click, tap, Enter or Space: the single-pointer alternative to dragging. */
  const poke = () => evade('poke', timing.dronePokeCooldown)

  const pointerDown = (x, y) => {
    if (reduced() || !['home-hover', 'evading', 'returning-home'].includes(state)) return false
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
    if (state !== 'dragging' && state !== 'evading') return false
    returnHome({ cause: 'escape' })
    return true
  }

  /** The layout changed (resize, cards removed): never leave it stranded mid-drag or mid-heart. */
  const relayout = () => {
    press = null
    if (state === 'dragging' || state === 'evading' || state === 'drawing-heart') returnHome({ cause: 'relayout' })
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

  /** Document hidden: drop anything in flight and rest at home. */
  const suspend = () => {
    press = null
    if (state === 'hidden' || state === 'closing' || state === 'home-hover') return clearTimer()
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
    hoverEnter,
    hoverLeave,
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
    get pressing() {
      return press !== null
    },
    get pendingTimers() {
      return timer !== null ? 1 : 0
    },
  }
}
