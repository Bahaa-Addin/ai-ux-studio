/**
 * The personalization engine: a deterministic, local stand-in for a recommendation service.
 *
 *   personalize(profile, { now }) → the view model every component draws from
 *
 * It does not pretend to be AI. Each rule below is a small pure function that looks at one fact
 * about the customer (an unclaimed perk, a free family spot, a voucher about to expire, an
 * interest, an allowance running low, an upgrade that fits) and returns a boost and the sentence
 * that explains it. An item's score is its base priority plus its boosts; sections are ordered by
 * their best item, so two customers see the same components in a different order. A real backend
 * can replace `personalize` as long as it returns the same shape.
 */

import { CATALOG, CATEGORIES, GLANCE_METRICS, INCLUDED_BENEFITS, LIFESTYLE, PARTNERS, planById, tierRank } from './data.js'

const DAY = 24 * 60 * 60 * 1000
const numberFormat = new Intl.NumberFormat('en-US')

/* ------------------------------------------------------------- formatting */

export const formatNumber = (n) => numberFormat.format(Math.round(n))
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
const pad = (n) => String(n).padStart(2, '0')
export const addDays = (now, days) => new Date(now.getTime() + days * DAY)
/** 15.11.2026, as the reference prints validity dates. */
export const formatShortDate = (date) => `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`
/** Sat 12 Dec 2026 */
export const formatEventDate = (date) =>
  `${date.toLocaleDateString('en-GB', { weekday: 'short' })} ${date.getDate()} ${date.toLocaleDateString('en-GB', { month: 'short' })} ${date.getFullYear()}`
const fill = (text, values) => (text ?? '').replace(/\{(\w+)\}/g, (match, key) => (key in values ? String(values[key]) : match))

/* ------------------------------------------------------------------ facts */

/** The plain facts the rules read: the plan, spots, how much of each allowance is left. */
export const factsFor = (profile, now = new Date()) => {
  const plan = planById(profile.plan)
  const familyUsed = profile.family?.members?.length ?? 0
  const entertainmentUsed = profile.entertainment?.used ?? 0
  const fractions = {}
  for (const [key, value] of Object.entries(profile.usage ?? {})) fractions[key] = value.total > 0 ? value.left / value.total : 1
  return {
    profile,
    plan,
    now,
    spots: {
      family: { used: familyUsed, total: plan.familyCapacity, left: Math.max(0, plan.familyCapacity - familyUsed) },
      entertainment: { used: entertainmentUsed, total: plan.entertainmentSpots, left: Math.max(0, plan.entertainmentSpots - entertainmentUsed) },
    },
    fractions,
  }
}

/**
 * An item's activation state for this customer:
 *   'hidden' (not for this plan), 'locked' (needs a higher plan), 'expired', 'full' (no spots left),
 *   then whatever the profile says ('active', 'claimed', 'redeemed'), else 'available'.
 */
export const stateOf = (item, facts) => {
  const rank = tierRank(facts.plan.id)
  if (item.maxTier && rank > tierRank(item.maxTier)) return 'hidden'
  if (item.requires && !facts.profile.usage?.[item.requires]) return 'hidden'
  if (item.minTier && rank < tierRank(item.minTier)) return 'locked'
  const saved = facts.profile.states?.[item.id]
  if (saved && saved !== 'available') return saved
  if (typeof item.expiresInDays === 'number' && item.expiresInDays < 0) return 'expired'
  if (item.capacity && facts.spots[item.capacity].left === 0) return item.capacity === 'family' && facts.spots.family.total === 0 ? 'locked' : 'full'
  return 'available'
}

const isOpen = (state) => state === 'available'
const isInUse = (state) => state === 'active' || state === 'claimed' || state === 'full'

/* ------------------------------------------------------------------ rules */

/**
 * The rules, each independent and pure: (item, facts, state) → { boost, reason?, tag } | null.
 * A reason is shown on the card ("Because …"), so it states the fact, not a guess.
 */
export const RULES = {
  /** A benefit the plan already pays for that the customer has not switched on. */
  unclaimedIncluded: (item, facts, state) =>
    item.included && isOpen(state) ? { boost: 24, reason: 'Included in your plan, not activated yet', tag: 'unclaimed' } : null,

  /** Spare family or entertainment spots. */
  capacityLeft: (item, facts, state) => {
    if (!item.capacity || !isOpen(state)) return null
    const { left } = facts.spots[item.capacity]
    if (left <= 0) return null
    const reason = item.capacity === 'family' ? `${plural(left, 'family spot')} left on your plan` : `${plural(left, 'free spot')} waiting on your plan`
    return { boost: 10 + 4 * left, reason, tag: 'capacity' }
  },

  /** A voucher or offer close to its end date (two weeks out, stronger as it nears). */
  expiringSoon: (item, facts, state) => {
    if (typeof item.expiresInDays !== 'number' || item.expiresInDays < 0 || item.expiresInDays > 14) return null
    if (state !== 'available' && state !== 'claimed') return null
    const days = item.expiresInDays
    return { boost: Math.round(30 * (1 - days / 14)) + 8, reason: days === 0 ? 'Expires today' : `Expires in ${plural(days, 'day')}`, tag: 'expiring' }
  },

  /** Something the customer's own signals point at (food orders, music, the gym). */
  interestMatch: (item, facts, state) => {
    if (!isOpen(state) && state !== 'claimed') return null
    let best = null
    for (const interest of item.interests ?? []) {
      const affinity = facts.profile.affinity?.[interest] ?? 0
      if (affinity >= 0.5 && (!best || affinity > best.affinity)) best = { interest, affinity }
    }
    if (!best) return null
    // Strong signals count for much more than lukewarm ones (0.5 → 10, 0.9 → 32).
    return { boost: Math.round(40 * best.affinity ** 2), reason: facts.profile.signals?.[best.interest] ?? `Picked for your interest in ${best.interest}`, tag: `interest:${best.interest}` }
  },

  /** A dated moment in the customer's life the item is made for (a trip next week). */
  upcomingMoment: (item, facts, state) => {
    const moment = item.moment && facts.profile.moments?.[item.moment]
    if (!moment || !isOpen(state) || moment.inDays < 0 || moment.inDays > 45) return null
    const soon = moment.inDays <= 14
    const where = moment.place ? ` to ${moment.place}` : ''
    return { boost: soon ? 40 : 24, reason: `You travel${where} in ${plural(moment.inDays, 'day')}`, tag: `moment:${item.moment}` }
  },

  /** An allowance under a fifth of its size makes whatever relieves it urgent. */
  usagePressure: (item, facts, state) => {
    if (!item.relieves || !isOpen(state)) return null
    const fraction = facts.fractions[item.relieves]
    if (fraction === undefined || fraction >= 0.2) return null
    const { left, unit = '' } = facts.profile.usage[item.relieves]
    return { boost: 34, reason: `Only ${formatNumber(left)} ${unit} left this cycle`.replace(/\s+/g, ' ').trim(), tag: 'pressure' }
  },

  /** The higher plan, when the customer has outgrown this one. */
  upgradeOpportunity: (item, facts, state) => {
    if (item.kind !== 'upgrade' || state !== 'available') return null
    const { family, entertainment } = facts.spots
    const reasons = []
    let boost = 0
    if (family.total > 0 && family.left === 0) {
      boost += 30
      reasons.push(`All ${family.total} family spots are taken`)
    }
    if ((facts.fractions.data ?? 1) < 0.2) {
      boost += 22
      reasons.push('Elite+ doubles your monthly data')
    }
    if (entertainment.left === 0) {
      boost += 10
      reasons.push(`All ${entertainment.total} entertainment spots are in use`)
    }
    return boost ? { boost, reason: reasons[0], tag: 'outgrown' } : null
  },

  /** Already in use, redeemed, expired or out of reach: keep it visible, lower down. */
  alreadySettled: (item, facts, state) => {
    const penalty = { active: -30, claimed: -18, full: -26, redeemed: -40, expired: -60, locked: -50 }[state]
    return penalty ? { boost: penalty, tag: state } : null
  },
}

/** Runs every rule for one item: its score, its reasons (strongest first) and tags. */
export const scoreItem = (item, facts) => {
  const state = stateOf(item, facts)
  let score = item.priority ?? 0
  const fired = []
  for (const [name, rule] of Object.entries(RULES)) {
    const result = rule(item, facts, state)
    if (!result) continue
    score += result.boost
    fired.push({ rule: name, ...result })
  }
  const reasons = fired.filter((f) => f.reason && f.boost > 0).sort((a, b) => b.boost - a.boost).map((f) => f.reason)
  return { state, score, reasons, tags: fired.map((f) => f.tag), fired }
}

/* --------------------------------------------------------------- sections */

/**
 * The content sections. `base` nudges a section; `order` is the reference's order and only breaks
 * ties. Navigation sections (categories, lifestyle) are placed after ranking, and the hero is first.
 */
export const SECTIONS = [
  { id: 'unclaimed', kinds: ['perk'], title: 'Don’t leave these on the table', subtitle: '{n} perks included in your plan but not activated yet', base: 14, order: 1, onlyOpen: true },
  { id: 'plan', kinds: ['home'], title: 'Your plan', subtitle: 'Renews in {renews} · {status}', base: 0, order: 0, always: true, pinned: true },
  { id: 'recommended', kinds: ['offer'], title: 'Ready when you are', base: 0, order: 3 },
  { id: 'brands', kinds: ['voucher'], eyebrow: 'What’s new', title: 'Discover your favourite brands', base: 0, order: 4 },
  { id: 'included', kinds: ['promo'], title: 'Included in your plan', base: -2, order: 5 },
  { id: 'coffee', kinds: ['partner'], title: 'RED Coffee', base: -2, order: 6 },
  { id: 'experiences', kinds: ['experience'], title: 'RED Experiences', base: -4, order: 7 },
  { id: 'points', kinds: ['points'], title: 'Included in your plan', base: -6, order: 8 },
  { id: 'upgrade', kinds: ['upgrade'], title: 'RED Elite+', base: -12, order: 10 },
]

/**
 * Sections ranked by their best item (ties: the reference order), plus the navigation grids. The
 * hero and the plan overview stay first: who you are, then what you could be using.
 */
export const orderSections = (sections) => {
  const pinned = sections.filter((s) => s.pinned)
  const out = sections.filter((s) => !s.pinned).sort((a, b) => b.score - a.score || a.order - b.order)
  // "Explore by category" follows the first ranked section, as on the Benefits screen.
  out.splice(Math.min(1, out.length), 0, { id: 'categories', title: 'Explore by category', nav: true, items: CATEGORIES })
  // "Explore more with RED Lifestyle" comes before the upgrade unless the upgrade has risen above it.
  const upgradeAt = out.findIndex((s) => s.id === 'upgrade')
  const lifestyle = { id: 'lifestyle', title: 'Explore more with RED Lifestyle', nav: true, items: LIFESTYLE }
  if (upgradeAt === out.length - 1) out.splice(upgradeAt, 0, lifestyle)
  else out.push(lifestyle)
  return [{ id: 'hero', pinned: true }, ...pinned, ...out]
}

/* ------------------------------------------------------------- the glance */

const usageMetric = (facts, key, { label, short, unit, icon, action = 'plan' }) => {
  const usage = facts.profile.usage?.[key]
  if (!usage) return null
  const fraction = usage.total > 0 ? Math.max(0, Math.min(1, usage.left / usage.total)) : 1
  return {
    id: key,
    kind: 'usage',
    label,
    short,
    icon,
    action,
    value: usage.left,
    display: formatNumber(usage.left),
    unit: usage.unit ?? unit,
    caption: `of ${formatNumber(usage.total)}`,
    fraction,
    tone: fraction < 0.2 ? 'low' : null,
    describe: `${label}: ${formatNumber(usage.left)} ${usage.unit ?? unit} left of ${formatNumber(usage.total)}`,
  }
}

/** The status widget's metrics, in the profile's order (any metric can be dropped). */
export const glanceFor = (facts) => {
  const { profile } = facts
  const build = {
    minutes: () => usageMetric(facts, 'minutes', { label: 'Minutes', short: 'Minutes', unit: 'min', icon: 'minutes' }),
    sms: () => usageMetric(facts, 'sms', { label: 'SMS', short: 'SMS', unit: 'SMS', icon: 'sms' }),
    data: () => usageMetric(facts, 'data', { label: 'Mobile Internet', short: 'Data', unit: 'GB', icon: 'data' }),
    dsl: () => usageMetric(facts, 'dsl', { label: 'Home Internet', short: 'DSL', unit: 'GB', icon: 'dsl' }),
    bill: () =>
      profile.bill && {
        id: 'bill',
        kind: 'account',
        label: 'Bill',
        short: 'Bill',
        icon: 'bill',
        action: 'bill',
        display: `EGP ${formatNumber(profile.bill.amount)}`,
        caption: profile.bill.paid ? 'Paid' : profile.bill.dueInDays <= 0 ? 'Due today' : `Due in ${plural(profile.bill.dueInDays, 'day')}`,
        tone: profile.bill.paid ? 'done' : profile.bill.dueInDays <= 3 && !profile.bill.autoPay ? 'due' : null,
        describe: profile.bill.paid
          ? `Bill: EGP ${formatNumber(profile.bill.amount)}, paid`
          : `Bill: EGP ${formatNumber(profile.bill.amount)}, due in ${plural(profile.bill.dueInDays, 'day')}`,
      },
    points: () =>
      profile.points && {
        id: 'points',
        kind: 'account',
        label: 'RED Points',
        short: 'Points',
        icon: 'points',
        target: 'points',
        display: formatNumber(profile.points.balance),
        caption: 'points',
        describe: `RED Points: ${formatNumber(profile.points.balance)}`,
      },
    family: () => {
      const { family } = facts.spots
      return {
        id: 'family',
        kind: 'account',
        label: 'Family',
        short: 'Family',
        icon: 'family',
        target: 'family',
        display: family.total ? `${family.used}/${family.total}` : String(family.used),
        caption: family.used === 1 ? 'member' : 'members',
        describe: family.total ? `Family: ${plural(family.used, 'member')} of ${family.total}` : `Family: ${plural(family.used, 'member')}`,
      }
    },
  }
  return (profile.glance ?? GLANCE_METRICS).map((id) => build[id]?.()).filter(Boolean)
}

/* ------------------------------------------------------------ personalize */

/** Resolves an item for drawing: templated copy, dates, partner, state, score and reasons. */
const resolve = (item, facts) => {
  const { state, score, reasons, tags } = scoreItem(item, facts)
  const values = {
    plan: facts.plan.name,
    spots: facts.spots.entertainment.left,
    roaming: formatNumber(facts.profile.usage?.roaming?.total ?? facts.plan.allowances.roaming),
  }
  const resolved = {
    ...item,
    title: fill(item.title, values),
    eyebrow: fill(item.eyebrow, values),
    description: fill(item.description, values),
    partnerInfo: item.partner ? PARTNERS[item.partner] : null,
    state,
    score,
    reasons,
    tags,
  }
  if (typeof item.expiresInDays === 'number') {
    const date = addDays(facts.now, item.expiresInDays)
    resolved.expiresAt = date.toISOString()
    resolved.expiresLabel = state === 'expired' ? `Ended ${formatShortDate(date)}` : `till ${formatShortDate(date)}`
  }
  if (item.event) {
    const date = addDays(facts.now, item.event.startsInDays)
    resolved.event = { ...item.event, audience: fill(item.event.audience, values), date: date.toISOString(), when: `${formatEventDate(date)} · ${item.event.time} · ${item.event.venue}` }
  }
  return resolved
}

/**
 * The whole view model for one customer. `catalog` can be swapped (a remote source) as long as
 * it keeps the item shape documented in ./data.js.
 */
export const personalize = (profile, { now = new Date(), catalog = CATALOG } = {}) => {
  const facts = factsFor(profile, now)
  const items = catalog.map((item) => resolve(item, facts)).filter((item) => item.state !== 'hidden')
  const byId = new Map(items.map((item) => [item.id, item]))

  const sections = SECTIONS.map((def) => {
    const members = items.filter((item) => def.kinds.includes(item.kind) && (!def.onlyOpen || item.state === 'available')).sort((a, b) => b.score - a.score)
    if (!members.length && !def.always) return null
    const top = members[0]?.score ?? 0
    const openCount = members.filter((item) => item.state === 'available').length
    return {
      id: def.id,
      eyebrow: def.eyebrow ?? null,
      title: def.title,
      subtitle: fill(def.subtitle, { n: openCount, renews: plural(profile.renewsInDays, 'day'), status: profile.planStatus }),
      items: members,
      score: def.base + top,
      order: def.order,
      pinned: Boolean(def.pinned),
      reasons: top ? members[0].reasons : [],
    }
  }).filter(Boolean)

  const included = INCLUDED_BENEFITS.filter((id) => byId.has(id))
  const claimed = included.filter((id) => isInUse(byId.get(id).state)).length
  const offers = items.filter((item) => item.kind === 'offer').sort((a, b) => b.score - a.score)

  return {
    now: now.toISOString(),
    profileId: profile.id,
    customer: {
      firstName: profile.firstName,
      msisdn: profile.msisdn,
      planId: facts.plan.id,
      planName: facts.plan.name,
      price: `EGP ${formatNumber(facts.plan.priceEGP)}/mo`,
      renews: `Your plan renews in ${plural(profile.renewsInDays, 'day')} · ${profile.planStatus}`,
      allowances: facts.plan.allowances,
    },
    spots: facts.spots,
    progress: { claimed, total: included.length },
    usage: profile.usage,
    bill: profile.bill,
    points: profile.points,
    family: { ...facts.spots.family, members: profile.family?.members ?? [] },
    entertainment: { ...facts.spots.entertainment, services: profile.entertainment?.services ?? [] },
    glance: glanceFor(facts),
    latest: latestFor(facts, items),
    items: byId,
    sections: orderSections(sections),
    featured: offers[0] ?? null,
    upgrade: byId.get('elite-plus') ?? null,
  }
}

/** "Latest" from My Lines: the bill and what is still unclaimed. */
const latestFor = (facts, items) => {
  const rows = []
  const { bill } = facts.profile
  if (bill) {
    rows.push({
      id: 'bill',
      icon: 'bill',
      eyebrow: `EGP ${formatNumber(bill.amount)} · Auto-pay is ${bill.autoPay ? 'on' : 'off'}`,
      title: bill.paid ? 'Bill paid, thank you' : bill.dueInDays <= 0 ? 'Bill due today' : `Bill due in ${plural(bill.dueInDays, 'day')}`,
      cta: bill.autoPay || bill.paid ? { label: 'View bill', action: 'bill' } : { label: 'Pay now', action: 'bill', strong: true },
    })
  }
  const open = items.filter((item) => item.included && item.state === 'available')
  if (open.length) {
    rows.push({
      id: 'perks',
      icon: 'gift',
      eyebrow: 'Netflix & Spotify available this month',
      title: `${plural(open.length, 'perk')} unclaimed`,
      cta: { label: 'Get your card', action: 'claim', target: 'qanz-card' },
    })
  }
  return rows
}
