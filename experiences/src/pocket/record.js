/**
 * A Pocket sticker as it is kept (voice-guide ADR-0051; live plan phase 3): one record per sticker,
 * holding what it showed when it was saved and what its card can be known by, so it can be shown on
 * any page and found again on its own page.
 *
 * - A sticker keeps the card's copy as Vodafone published it, price included, with the day it was
 *   saved, which the album shows ("12 Nov"). Owner decision 2026-11-13: the visitor's own browser
 *   is outside AGENTS.md 4.3 (knowledge base, traces, logs).
 * - Its card is found again by a score over the card's keys (link, picture, title, tab, the numbers
 *   in the title; experiences/src/host/live-adapter.js keysOf), not by its id alone: an id changes
 *   when an editor adds a card sharing its link (AIXC-41), and differs between languages on some
 *   pages (O26). Measured on the saved pages (phase 3 map): every card found across 20 days, and
 *   in the other language home 10/10, Cash 8/8, Services 29/30, RED 7/8, bundles 16/20, with no
 *   wrong match.
 *
 * Pure functions: no DOM, no storage.
 */

/** A page's address without its language and trailing slash: /en/services and /ar/services are one page. */
export const pageKeyOf = (path) => (String(path || '/').replace(/^\/(en|ar)(?=\/|$)/, '') || '/').replace(/(.)\/+$/, '$1')

const newKey = () => `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

/**
 * A record from an item of the live model, its section and its page.
 * `page`: { path, lang, dir, title, pageId? } (pageId: the knowledge base's page id when known).
 */
export function recordFrom({ item, section, page, origin = 'person', now = Date.now(), key = newKey() }) {
  return {
    v: 2,
    key,
    id: item.id,
    kind: item.kind ?? null,
    keys: Array.isArray(item.keys) ? item.keys.map((k) => ({ kind: k.kind, value: k.value })) : [],
    copy: { title: item.title, description: item.description ?? null, lang: page.lang, dir: page.dir || (page.lang === 'ar' ? 'rtl' : 'ltr') },
    image: item.image ? { src: item.image.src, alt: item.image.alt ?? null } : null,
    cta: item.cta ? { label: item.cta.label ?? null, href: item.cta.href ?? null, ...(item.cta.opens ? { opens: item.cta.opens } : {}) } : null,
    source: {
      page: pageKeyOf(page.path),
      path: page.path,
      pageId: page.pageId ?? null,
      title: page.title ? { [page.lang]: page.title } : {},
      section: section ? { id: section.id, title: section.title ?? null } : null,
    },
    origin,
    savedAt: now,
    seenAt: now,
  }
}

/** True when `x` is a record this version can show. */
export function isRecord(x) {
  return !!x && x.v === 2 && typeof x.key === 'string' && typeof x.id === 'string' && !!x.copy && typeof x.copy.title === 'string' && !!x.source && typeof x.source.page === 'string' && Number.isFinite(x.savedAt)
}

/** Points per key kind: [only card on the page with it, one of several]. A tab holds several cards, so it counts either way. */
const POINTS = { link: [4, 1], picture: [4, 1], title: [3, 1], tab: [2, 2], digits: [2, 0.5] }

/**
 * How well a stored record fits a card on the page: per key kind, more when the card's value is
 * the only one of its kind on the page; a title counts only in the record's own language; numbers
 * in the title that differ count against; the same id and the same section add a little. `counts` maps "kind value" to how many cards carry it.
 */
export function scoreOf(record, item, { counts, lang, sectionId }) {
  let score = 0
  const unique = new Set()
  for (const k of record.keys) {
    if (k.kind === 'title' && record.copy.lang !== lang) continue
    if (!item.keys?.some((x) => x.kind === k.kind && x.value === k.value)) continue
    const only = counts.get(`${k.kind} ${k.value}`) === 1
    const [hi, lo] = POINTS[k.kind] || [0, 0]
    score += only ? hi : lo
    if (only) unique.add(k.kind)
  }
  // The numbers in a title tell products apart ("1400 Mega", "Flex from 25 to 55"): different numbers,
  // or numbers on one side only, count against the pair (the bundles page's "prepaid lines" cards).
  const mine = record.keys.find((k) => k.kind === 'digits')?.value
  const theirs = item.keys?.find((k) => k.kind === 'digits')?.value
  if (mine !== theirs) score -= mine && theirs ? 2 : 1
  if (record.id === item.id) score += 2
  if (record.source.section && record.source.section.id === sectionId) score += 1
  return { score, unique }
}

/**
 * Which card on this page each record is: `model` is the live content model, `records` those whose
 * source is this page. A record is matched to the card it scores best on, with at least 4 points
 * and no tie (3 when the tab alone is unique, the bundles page's cards across languages), and each
 * card to one record at most. Returns Map(record.key → item.id).
 */
export function rematch(records, model, { lang }) {
  const cards = (model?.sections || []).flatMap((s) => s.items.map((item) => ({ item, sectionId: s.id })))
  const counts = new Map()
  for (const { item } of cards) for (const k of new Set((item.keys || []).map((x) => `${x.kind} ${x.value}`))) counts.set(k, (counts.get(k) || 0) + 1)
  const offers = []
  for (const r of records) {
    const scored = cards.map(({ item, sectionId }) => ({ id: item.id, ...scoreOf(r, item, { counts, lang, sectionId }) })).sort((a, b) => b.score - a.score)
    const [best, next] = scored
    if (!best) continue
    const enough = best.score >= 4 || (best.score >= 3 && best.unique.has('tab'))
    if (enough && !(next && next.score === best.score)) offers.push({ key: r.key, id: best.id, score: best.score })
  }
  // Best fits first, so two records never take one card.
  offers.sort((a, b) => b.score - a.score)
  const out = new Map()
  const taken = new Set()
  for (const o of offers) {
    if (taken.has(o.id)) continue
    taken.add(o.id)
    out.set(o.key, o.id)
  }
  return out
}

/** The record seen again on its page: the card's id now, and when. Copy stays as saved. */
export const seen = (record, id, now = Date.now()) => ({ ...record, id, seenAt: now })
