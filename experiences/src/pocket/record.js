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
 *   pages (O26). Measured on the saved pages (voice-guide tests/integration/live-adapter.test.ts,
 *   2026-11-13): every card found across 20 days; in the other language home 10/10, Cash 8/8,
 *   Services 29/30, RED 7/8, bundles 19/20 (19/21 from Arabic); with any one card removed, no
 *   sticker ever takes another (AIXC-54).
 *
 * Pure functions: no DOM, no storage.
 */
/*
 * Vodafone's two sites (e-shop plan E5). The adapter in the core keeps its own copy of categoryOf: a
 * module shared by the core and this chunk would become a third file, counted in the core's budget.
 * tests/pocket-record.test.mjs checks that the two agree.
 */
/** 'shop' for the e-shop's host, 'web' for anything else. */
export const siteOf = (host) => (/^eshop\./i.test(String(host || '')) ? 'shop' : 'web')

/**
 * A shop list's category, whichever of the shop's three spellings the address uses ("*smart-phones",
 * "/smart-phones", "%2Fsmart-phones"), or null.
 */
export const categoryOf = (search) => {
  let v = null
  try {
    v = new URLSearchParams(String(search || '')).get('categoryUrls')
  } catch {}
  let c = v || ''
  try {
    c = decodeURIComponent(c)
  } catch {}
  c = c.replace(/^[*/]+/, '').trim().toLowerCase()
  return c || null
}


/** A page's address without its language and trailing slash: /en/services and /ar/services are one page. */
const pathKeyOf = (path) => (String(path || '/').replace(/^\/(en|ar)(?=\/|$)/, '') || '/').replace(/(.)\/+$/, '$1')

/**
 * The page a record was kept on, the same in both languages. On the website, the path without its
 * language (unchanged, so web records keep their keys). On the shop, "shop:" plus that path plus the
 * list's category, so two lists are two pages and the shop's home is not the website's.
 */
export const pageKeyOf = (path, { site = 'web', search = '' } = {}) => {
  const key = pathKeyOf(path)
  if (site !== 'shop') return key
  const c = categoryOf(search)
  return `shop:${key}${c ? `?c=${c}` : ''}`
}

/**
 * True when `record` was kept on `page` (its path in either language, on the same site): the cards a page
 * shows as pocketed are its own records', never another page's with the same card id (S6; ADR-0052 §14).
 */
export const onPage = (record, page) => record?.source?.page === pageKeyOf(page.path, page) && siteOfRecord(record) === (page.site === 'shop' ? 'shop' : 'web')

/** A record's site: records kept before E5 have none and are the website's. */
export const siteOfRecord = (r) => (r?.source?.site === 'shop' ? 'shop' : 'web')

/** A call to action that does something (a link or the page's own dialog), as kept. */
const ctaOf = (cta) => (cta && (cta.href || cta.opens) ? { label: cta.label ?? null, href: cta.href ?? null, ...(cta.opens ? { opens: cta.opens } : {}) } : null)

const newKey = () => `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

/** How many cards of a model carry each "kind value" key. */
const countsOf = (model) => {
  const counts = new Map()
  for (const s of model?.sections || []) for (const item of s.items) for (const k of new Set((item.keys || []).map((x) => `${x.kind} ${x.value}`))) counts.set(k, (counts.get(k) || 0) + 1)
  return counts
}

/**
 * A record from an item of the live model, its section and its page.
 * `page`: { path, lang, dir, title, pageId?, site?, search? } (pageId: the knowledge base's page id when known;
 * site: 'web' or 'shop', web when missing; search: the address's query, which names a shop list).
 * `model`: the page it was kept on, when known: a key other cards there shared is marked `shared`,
 * and never counts as the card's own later, even when the others have gone (AIXC-63).
 */
export function recordFrom({ item, section, page, model = null, origin = 'person', now = Date.now(), key = newKey() }) {
  const counts = model ? countsOf(model) : null
  return {
    v: 2,
    key,
    id: item.id,
    kind: item.kind ?? null,
    keys: Array.isArray(item.keys) ? item.keys.map((k) => ({ kind: k.kind, value: k.value, ...(counts && (counts.get(`${k.kind} ${k.value}`) || 0) > 1 ? { shared: true } : {}) })) : [],
    copy: { title: item.title, description: item.description ?? null, lang: page.lang, dir: page.dir || (page.lang === 'ar' ? 'rtl' : 'ltr') },
    image: item.image ? { src: item.image.src, alt: item.image.alt ?? null, ...(item.image.fit ? { fit: item.image.fit } : {}) } : null,
    // The card's own link or dialog, else its section's (the clone's Cash cards share one).
    cta: ctaOf(item.cta) ?? ctaOf(section?.cta),
    source: {
      site: page.site === 'shop' ? 'shop' : 'web',
      page: pageKeyOf(page.path, page),
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
 * Points against a pair whose keys of a kind both have and do not share: another picture, another
 * link, another title in the record's own language (AIXC-54: Vodafone's slips give two cards one
 * link, or one title). Not tabs: a tab's id can differ between the languages (the bundles' Plus tab).
 */
const AGAINST = { link: 2, picture: 3, title: 2 }

/**
 * How well a stored record fits a card on the page: per key kind, more when the card's value is
 * the only one of its kind on the page; a title counts only in the record's own language; numbers
 * in the title that differ count against; the same id and the same section add a little. `counts` maps "kind value" to how many cards carry it.
 */
export function scoreOf(record, item, { counts, lang, sectionId }) {
  let score = 0
  const unique = new Set()
  const agreed = new Set()
  const compared = (kind) => kind !== 'title' || record.copy.lang === lang
  for (const k of record.keys) {
    if (!compared(k.kind)) continue
    if (!item.keys?.some((x) => x.kind === k.kind && x.value === k.value)) continue
    // The only card with it now, and not one of several where the sticker was kept.
    const only = counts.get(`${k.kind} ${k.value}`) === 1 && !k.shared
    const [hi, lo] = POINTS[k.kind] || [0, 0]
    score += only ? hi : lo
    agreed.add(k.kind)
    if (only) unique.add(k.kind)
  }
  for (const [kind, points] of Object.entries(AGAINST)) {
    if (!compared(kind) || agreed.has(kind)) continue
    if (record.keys.some((k) => k.kind === kind) && item.keys?.some((x) => x.kind === kind)) score -= points
  }
  // The numbers in a title tell products apart ("1400 Mega", "Flex from 25 to 55"): different numbers,
  // or numbers on one side only, count against the pair (the bundles page's "prepaid lines" cards).
  const mine = record.keys.find((k) => k.kind === 'digits')?.value
  const theirs = item.keys?.find((k) => k.kind === 'digits')?.value
  if (mine !== theirs) score -= mine && theirs ? 2 : 1
  if (record.id === item.id) score += 2
  if (record.source.section && record.source.section.id === sectionId) score += 1
  // Two signs that agree, of different kinds (the same id is one): one alone is a guess.
  const signs = agreed.size + (record.id === item.id ? 1 : 0)
  return { score, unique, signs }
}

/**
 * Which card on this page each record is: `model` is the live content model, `records` those whose
 * source is this page. A record is matched to the card it scores best on, with at least 4 points
 * (3 when the tab alone is unique, the bundles page's cards across languages), no tie, and two
 * agreeing signs of different kinds; each card to one record at most, and to none when two fit it
 * equally (AIXC-55). Returns Map(record.key → item.id).
 */
export function rematch(records, model, { lang }) {
  const cards = (model?.sections || []).flatMap((s) => s.items.map((item) => ({ item, sectionId: s.id })))
  const counts = countsOf(model)
  const offers = []
  for (const r of records) {
    const scored = cards.map(({ item, sectionId }) => ({ id: item.id, ...scoreOf(r, item, { counts, lang, sectionId }) })).sort((a, b) => b.score - a.score)
    const [best, next] = scored
    if (!best) continue
    const enough = best.signs >= 2 && (best.score >= 4 || (best.score >= 3 && best.unique.has('tab')))
    if (enough && !(next && next.score === best.score)) offers.push({ key: r.key, id: best.id, score: best.score })
  }
  // Best fits first, so two records never take one card; two records that fit one card equally
  // well both go without it, whatever order they were kept in (AIXC-55).
  offers.sort((a, b) => b.score - a.score)
  const out = new Map()
  const taken = new Set()
  for (const o of offers) {
    if (taken.has(o.id)) continue
    taken.add(o.id)
    if (offers.some((other) => other !== o && other.id === o.id && other.score === o.score)) continue
    out.set(o.key, o.id)
  }
  return out
}

/** The record seen again on its page: the card's id now, and when. Copy stays as saved. */
export const seen = (record, id, now = Date.now()) => ({ ...record, id, seenAt: now })
