/**
 * The demo's memory: what this customer activated, claimed, invited, redeemed or paid in this
 * browser, kept on top of their profile in ./data.js. Every change re-runs the engine and tells
 * the subscribers (the cards, the hero's counter and the status widget update together).
 *
 * Saved in localStorage under `aixc.pz.v1`, one entry per demo profile; without storage (private
 * mode, tests) it lasts for the visit. Nothing leaves the browser.
 */

import { DEFAULT_PROFILE, PROFILES } from './data.js'
import { personalize } from './engine.js'

export const STORE_KEY = 'aixc.pz.v1'
const EMPTY = () => ({ v: 1, profiles: {} })
const clone = (value) => JSON.parse(JSON.stringify(value))

export const readSaved = (storage) => {
  try {
    const value = JSON.parse(storage?.getItem(STORE_KEY) || 'null')
    return value && value.v === 1 && value.profiles && typeof value.profiles === 'object' ? value : EMPTY()
  } catch {
    return EMPTY()
  }
}

/** The demo profile named by `?pz=` (ahmed, mariam, karim), else the default. */
export const resolveProfileId = (search = '') => {
  const id = new URLSearchParams(search).get('pz')
  return id && PROFILES[id] ? id : DEFAULT_PROFILE
}

/** The profile with this browser's changes applied. Pure: the base profile is never changed. */
export const applySaved = (base, entry = {}) => {
  const profile = clone(base)
  profile.states = { ...profile.states, ...entry.states }
  if (entry.invited?.length) profile.family.members = [...profile.family.members, ...entry.invited]
  if (entry.addedServices?.length) {
    profile.entertainment.used += entry.addedServices.length
    profile.entertainment.services = [...profile.entertainment.services, ...entry.addedServices]
  }
  if (entry.pointsSpent && profile.points) profile.points.balance = Math.max(0, profile.points.balance - entry.pointsSpent)
  if (entry.homeBonusGB && profile.usage?.dsl) {
    profile.usage.dsl.left += entry.homeBonusGB
    profile.usage.dsl.total += entry.homeBonusGB
  }
  if (entry.billPaid && profile.bill) profile.bill.paid = true
  return profile
}

export const createStore = ({ profileId = DEFAULT_PROFILE, storage = null, now = () => new Date() } = {}) => {
  const base = PROFILES[profileId] ?? PROFILES[DEFAULT_PROFILE]
  const saved = readSaved(storage)
  const listeners = new Set()
  const compute = () => personalize(applySaved(base, saved.profiles[base.id]), { now: now() })
  let view = compute()

  const write = () => {
    try {
      storage?.setItem(STORE_KEY, JSON.stringify(saved))
    } catch {
      // Storage can be unavailable (private mode); the demo then lasts for this visit.
    }
  }

  /** Applies one change, recomputes, and tells every subscriber what happened. */
  const commit = (event, mutate) => {
    const entry = (saved.profiles[base.id] ??= {})
    mutate(entry)
    write()
    view = compute()
    for (const listener of listeners) listener(view, event)
    return event
  }
  const markState = (entry, id, state) => {
    entry.states = { ...entry.states, [id]: state }
  }
  const available = (id) => view.items.get(id)?.state === 'available'

  return {
    get view() {
      return view
    },
    profileId: base.id,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },

    /** Switches on an included perk ("+"). */
    activate(id) {
      if (!available(id)) return null
      return commit({ type: 'activated', id }, (entry) => {
        markState(entry, id, 'active')
        if (id === 'entertainment-pack') entry.addedServices = [...(entry.addedServices ?? []), 'Yango Play']
        if (id === 'home-bonus') entry.homeBonusGB = 50
      })
    },

    /** Claims an offer or a voucher. */
    claim(id) {
      if (!available(id)) return null
      return commit({ type: 'claimed', id }, (entry) => markState(entry, id, 'claimed'))
    },

    /** Adds someone to the family plan while a spot is free. */
    invite(member) {
      if (view.spots.family.left <= 0) return null
      const invited = { id: `invite-${Date.now()}`, name: member?.name || 'Invitation sent', relation: member?.relation || 'Pending', avatar: member?.avatar ?? 5, pending: true }
      return commit({ type: 'invited', id: 'family-share', member: invited }, (entry) => {
        entry.invited = [...(entry.invited ?? []), invited]
        markState(entry, 'family-share', 'active')
      })
    },

    /** Turns points into a voucher. */
    redeemPoints() {
      const points = view.points
      if (!points || points.balance < points.perVoucher) return null
      return commit({ type: 'redeemed-points', id: 'red-points', spent: points.perVoucher, value: points.voucherValue }, (entry) => {
        entry.pointsSpent = (entry.pointsSpent ?? 0) + points.perVoucher
      })
    },

    payBill() {
      if (!view.bill || view.bill.paid) return null
      return commit({ type: 'paid', id: 'bill' }, (entry) => {
        entry.billPaid = true
      })
    },

    requestUpgrade() {
      if (!available('elite-plus')) return null
      return commit({ type: 'upgrade-requested', id: 'elite-plus' }, (entry) => markState(entry, 'elite-plus', 'requested'))
    },

    /** Forgets this browser's changes for this customer. */
    reset() {
      return commit({ type: 'reset' }, () => {
        delete saved.profiles[base.id]
      })
    },
  }
}
