/**
 * The RED world's topics: what the spotlight (the sheet's first section) can show, one at a time,
 * and what the compact bento under it offers as small tiles. Eight topics are the Dock's
 * categories; the others are the rest of the world (perks, family, the bill, coffee...).
 *
 * Pure (no DOM), so `npm test` checks it: which topics a customer has, how they rank (by their
 * best item's score from ./engine.js), the one-line hook and the reason a tile shows.
 */

import { CATEGORIES, LIFESTYLE } from './data.js'
import { formatNumber } from './engine.js'

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
const byScore = (a, b) => b.score - a.score
const OPEN = new Set(['available', 'claimed'])

/**
 * Each topic: its id, a label (the tile's eyebrow), the items it is about (for ranking and its
 * reason), whether it is one of the Dock's categories, and its hook (the tile's one line).
 */
export const TOPICS = [
  {
    id: 'for-you',
    label: 'Waiting for you',
    art: 'sparkle',
    items: (view) => [...view.items.values()].filter((i) => i.kind === 'perk' && i.state === 'available'),
    hook: (view, items) => `${plural(items.length, 'perk')} not switched on`,
  },
  {
    id: 'lifestyle',
    dock: true,
    label: 'Lifestyle',
    art: 'bag',
    items: (view) => [...view.items.values()].filter((i) => i.kind === 'offer'),
    hook: (view, items) => `${plural(items.filter((i) => i.state === 'available').length, 'offer')} ready for you`,
  },
  {
    id: 'home',
    dock: true,
    label: 'Home Connectivity',
    art: 'router',
    items: (view) => ids(view, ['home-bonus']),
    hook: (view, items) => (items[0]?.state === 'available' ? '50 GB a month, free' : 'Home data added'),
  },
  {
    id: 'entertainment',
    dock: true,
    label: 'Entertainment',
    art: 'play',
    always: true,
    items: (view) => ids(view, ['entertainment-pack']),
    hook: (view) => `${view.entertainment.used}/${view.entertainment.total} spots used`,
  },
  {
    id: 'roaming',
    dock: true,
    label: 'Roaming',
    art: 'plane',
    items: (view) => ids(view, ['roaming-ready']),
    hook: (view) => `${formatNumber(view.usage?.roaming?.left ?? 0)} roaming minutes ready`,
  },
  {
    id: 'red-experience',
    dock: true,
    label: 'RED Experience',
    art: 'envelope',
    items: (view) => ids(view, ['red-night']),
    hook: (view, items) => items[0]?.event?.name.split(' · ')[1] ?? 'Members-only events',
  },
  {
    id: 'red-fitness',
    dock: true,
    label: 'RED Fitness',
    art: 'dumbbell',
    items: (view) => ids(view, ['befit']),
    hook: () => 'Two months of BeFit, free',
  },
  {
    id: 'red-food',
    dock: true,
    label: 'RED Food & Groceries',
    art: 'grocery',
    items: (view) => ids(view, ['talabat-pro']),
    hook: (view, items) => (items[0]?.state === 'available' ? 'Talabat Pro, on your plan' : 'Talabat Pro is on'),
  },
  {
    id: 'red-shopping',
    dock: true,
    label: 'RED Shopping',
    art: 'shopping',
    items: (view) => [...view.items.values()].filter((i) => i.kind === 'voucher' || i.id === 'qanz-card'),
    hook: (view, items) => `${plural(items.filter((i) => OPEN.has(i.state) && i.kind === 'voucher').length, 'voucher')} to use`,
  },
  {
    id: 'family',
    label: 'Family',
    art: 'family',
    always: true,
    items: (view) => ids(view, ['family-share']),
    hook: (view) => `${view.family.used} of ${view.family.total} family spots used`,
  },
  {
    id: 'bill',
    label: 'Your bill',
    art: 'bill',
    always: true,
    items: () => [],
    hook: (view) => (view.bill?.paid ? 'Paid, thank you' : `EGP ${formatNumber(view.bill?.amount ?? 0)} due in ${plural(view.bill?.dueInDays ?? 0, 'day')}`),
    score: (view) => (view.bill && !view.bill.paid && view.bill.dueInDays <= 3 && !view.bill.autoPay ? 70 : 16),
    reason: (view) => (view.bill && !view.bill.paid && !view.bill.autoPay ? 'Auto-pay is off' : null),
  },
  {
    id: 'coffee',
    label: 'RED Coffee',
    art: 'coffee',
    items: (view) => ids(view, ['red-coffee']),
    hook: () => '20% off your coffee',
  },
  {
    id: 'installments',
    label: 'RED Installments',
    art: 'zero',
    items: (view) => ids(view, ['red-installments']),
    hook: () => 'A new phone at 0% interest',
  },
  {
    id: 'points',
    label: 'RED Points',
    art: 'points',
    items: (view) => ids(view, ['red-points']),
    hook: (view) => `${formatNumber(view.points?.balance ?? 0)} points to spend`,
  },
  {
    id: 'upgrade',
    label: 'RED Elite+',
    art: 'elite',
    items: (view) => ids(view, ['elite-plus']),
    hook: () => 'Share with up to 5, not just 2',
  },
]

const ids = (view, list) => list.map((id) => view.items.get(id)).filter(Boolean)

/** A tile's line of "why": the most personal reason first; the plain "not switched on" one is shortened. */
const GENERIC = 'Included in your plan, not activated yet'
const tileReason = (item) => {
  const reasons = item?.reasons ?? []
  const personal = reasons.find((r) => r !== GENERIC)
  return personal ?? (reasons.length ? 'On your plan, not switched on yet' : null)
}

export const topicById = (id) => TOPICS.find((t) => t.id === id) ?? null
export const DOCK_TOPICS = TOPICS.filter((t) => t.dock).map((t) => t.id)

/** Where a widget metric or an old anchor goes in the topic model. */
const ALIASES = { points: 'points', family: 'family', bill: 'bill', home: 'home', entertainment: 'entertainment', unclaimed: 'for-you', recommended: 'lifestyle', brands: 'red-shopping', experiences: 'red-experience', 'roaming-ready': 'roaming', befit: 'red-fitness', 'talabat-pro': 'red-food' }
export const topicFor = (target) => (topicById(target) ? target : ALIASES[target] ?? null)

/**
 * The topics this customer has, ranked: score is the best item's score (settled items count for
 * less, as in the engine), the reason is that item's strongest reason. A topic with nothing to
 * show is left out, except the ones that always have something (entertainment, family, bill).
 */
export const rankTopics = (view) =>
  TOPICS.map((topic, order) => {
    const items = topic.items(view).sort(byScore)
    if (!items.length && !topic.always) return null
    const top = items[0]
    return {
      id: topic.id,
      label: topic.label,
      art: topic.art,
      dock: Boolean(topic.dock),
      hook: topic.hook(view, items),
      reason: topic.reason ? topic.reason(view) : tileReason(top),
      score: topic.score ? topic.score(view) : (top?.score ?? 0),
      order,
    }
  })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || a.order - b.order)

/**
 * The Dock's icons for this customer: "Explore by category" then "RED Lifestyle", without the
 * categories they cannot have (no icon may open an empty spotlight). Claiming never removes a
 * category, only eligibility does, so the Dock is built once.
 */
export const dockCategories = (view) => {
  const present = new Set(rankTopics(view).map((topic) => topic.id))
  return [...CATEGORIES.map((c) => ({ ...c, group: 'explore' })), ...LIFESTYLE.map((c) => ({ ...c, group: 'lifestyle' }))].filter((c) => present.has(c.id))
}

/** What the spotlight shows when the world opens without a chosen category: the best topic. */
export const defaultTopic = (view) => rankTopics(view)[0]?.id ?? 'lifestyle'

/**
 * The compact bento's spans (1 or 2 columns) for `count` tiles in `columns` columns: the best
 * ranked tiles take two columns, as few as it takes for every row to close. Placed in order, wide
 * tiles first, rows never leave a hole. When no number of wide tiles closes the last row (one tile
 * in four columns), the last tile stretches to the end of its row.
 */
export const bentoSpans = (count, columns) => {
  if (count <= 0) return []
  if (columns <= 1) return Array(count).fill(1)
  for (let wide = 1; wide <= count; wide++) {
    if ((count + wide) % columns === 0) return Array.from({ length: count }, (_, i) => (i < wide ? 2 : 1))
  }
  const spans = Array(count).fill(1)
  spans[count - 1] = columns - ((count - 1) % columns)
  return spans
}
