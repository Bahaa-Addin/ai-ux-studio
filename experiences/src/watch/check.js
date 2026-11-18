/**
 * The page watch's check on visit (voice-guide ADR-0078 points 1, 5, 6 and 10; phase 6 design §4.2,
 * §4.4): once per page view, never on a timer, in a service worker or by periodic sync. It fetches
 * Vodafone's public pages from the visitor's browser, signed out, one at a time, and compares hashes
 * of what it reads with the ones it kept.
 *
 * run(): skip on Save-Data, while blocked, outside a secure context, with no rules (fail safe) or no
 * watches; one tab at a time (Web Locks, ifAvailable); throttled to minIntervalMin unless a person
 * pressed (force); robots.txt once per run; the due pages oldest first, at most perVisitMax, spacingMs
 * apart, each with our own validators so a 304 reaches us; a 403/429/503 or a challenge stops the run
 * and blocks it for 24 h; then every target on each page is compared and one change per sticker
 * recorded (the most significant kind, KIND_ORDER).
 *
 * Nothing here touches the live page's DOM: the page the visitor is on is checked from fetched HTML
 * too, so script-added text can never disagree with the baseline. The adapter's readPage, the Pocket's
 * reconcile and records, and the mask are passed in (lesson E5: no shared chunk with the core).
 * The only waits are the pacing between requests (sleep) and the idle slot before a parse; there is
 * no setInterval and no recurring timer.
 */
import { READER_VERSION, cardDigest as realCardDigest, findCard as realFindCard, pageDigest as realPageDigest } from './read.js'
import { parseRobots } from './robots.js'
import { canonicalOf, isSameOrigin, isWatchablePath, normalise } from './url.js'

/**
 * The kinds of change, most significant first: when a run finds several for one sticker, it records
 * the first of these. The page is gone > the card is no longer on its page > the card opens another
 * page > the card reads differently > the page it opens reads differently > it is back.
 */
export const KIND_ORDER = ['gone', 'missing', 'link', 'card', 'page', 'back']
const rank = (k) => KIND_ORDER.indexOf(k)

export const LOCK = 'aixc-watch-check'
const BLOCK_MS = 24 * 3600_000
const TIMEOUT_MS = 10_000
const BLOCKING = new Set([403, 429, 503])

export const cardTargetId = (stickerKey, url) => `card ${stickerKey} ${url}`
export const pageTargetId = (url) => `page ${url}`

const defaultIdle = () => new Promise((resolve) => (typeof requestIdleCallback === 'function' ? requestIdleCallback(() => resolve(), { timeout: 2000 }) : setTimeout(resolve, 0)))
const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const defaultTimeout = (ms) => (typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(ms) : undefined)

/**
 * `rules`: the page-map answer's `watch` field ({ include, exclude, origin, minIntervalMin, perVisitMax,
 * spacingMs, maxWatched, minChars }), or a function returning it (null until the answer came).
 * `recordFor(key)`: the Pocket's record for a sticker (sync or async), or null.
 * `digest`: read.js's findCard, cardDigest and pageDigest unless a test passes its own.
 */
export function createChecker({
  store,
  read,
  reconcile,
  mask,
  rules,
  recordFor = () => null,
  fetchImpl = (...a) => fetch(...a),
  locks = globalThis.navigator?.locks,
  now = () => Date.now(),
  sleep = defaultSleep,
  idle = defaultIdle,
  parse = (html) => new DOMParser().parseFromString(html, 'text/html'),
  connection = globalThis.navigator?.connection,
  subtle = globalThis.crypto?.subtle,
  timeoutSignal = defaultTimeout,
  digest = {},
  log = () => {},
}) {
  const findCard = digest.findCard ?? realFindCard
  const cardDigest = digest.cardDigest ?? realCardDigest
  const pageDigest = digest.pageDigest ?? realPageDigest
  const rulesNow = () => (typeof rules === 'function' ? rules() : rules) || null

  /** The robots rules last read (meta.robots), for watchSticker. */
  const knownRobots = async () => (await store.getMeta('robots'))?.rules ?? null

  /** Why a card's link gets no page target, or null when it does. */
  const pageNoteFor = (href, r, robots) => {
    if (!href) return 'no-link'
    if (!isSameOrigin(href, r.origin)) return 'other-site'
    if (/\/spa(\/|$)/i.test(new URL(href).pathname)) return 'script'
    return isWatchablePath(href, { origin: r.origin, exclude: r.exclude || [], robots }) ? null : 'not-allowed'
  }

  /** Points `stickerKey`'s page target at `href` (or none, with a note); the old one goes when no sticker uses it. */
  const pointPage = async (watch, href, r, robots) => {
    const note = pageNoteFor(href, r, robots)
    const id = note ? null : pageTargetId(href)
    if (watch.pageTargetId && watch.pageTargetId !== id) await store.unlinkTarget(watch.pageTargetId, watch.key)
    if (id) await store.linkTarget({ id, kind: 'page', url: href, hash: null, linksHash: null, status: 'ok' }, watch.key)
    return { ...watch, pageTargetId: id, pageNote: note }
  }

  /**
   * Watches a sticker: its card on its own page, and the page its link opens when that may be fetched.
   * Returns { ok: true, watch, already? } or { ok: false, reason } ('no-rules', 'shop', 'max-watched',
   * 'not-allowed'). The caller then runs run({ force: true, onlyStickers: [key] }) for the baseline.
   */
  async function watchSticker(record, { from = 'sticker', baselineAt = null } = {}) {
    const r = rulesNow()
    if (!r?.origin) return { ok: false, reason: 'no-rules' }
    const existing = await store.getWatch(record.key)
    if (existing) return { ok: true, watch: existing, already: true }
    if (record.source?.site === 'shop') return { ok: false, reason: 'shop' }
    if ((await store.listWatches()).length >= (r.maxWatched ?? 20)) return { ok: false, reason: 'max-watched' }
    const robots = await knownRobots()
    const cardUrl = normalise(record.source?.path, r.origin)
    if (!cardUrl || !isWatchablePath(cardUrl, { origin: r.origin, exclude: r.exclude || [], robots })) return { ok: false, reason: 'not-allowed' }
    const cardId = cardTargetId(record.key, cardUrl)
    await store.linkTarget({ id: cardId, kind: 'card', url: cardUrl, hash: null, href: null, status: 'ok' }, record.key)
    const href = record.cta?.href ? normalise(record.cta.href, cardUrl) : null
    let watch = { key: record.key, lang: record.copy?.lang ?? null, createdAt: now(), from, cardTargetId: cardId, pageTargetId: null, pageNote: null, baselineAt }
    watch = await pointPage(watch, href, r, robots)
    await store.addWatch(watch)
    return { ok: true, watch }
  }

  /** Stops watching a sticker: its watch, its changes and the targets no other sticker uses. */
  const unwatchSticker = (key) => store.removeWatch(key)

  /** A request with our rules: signed out, our own validators, a 10 s limit. */
  const request = (url, { cache = 'no-store', headers = {} } = {}) => fetchImpl(url, { method: 'GET', credentials: 'omit', cache, redirect: 'follow', headers, signal: timeoutSignal(TIMEOUT_MS) })

  async function run({ force = false, onlyStickers = null } = {}) {
    if (connection?.saveData) return { ran: false, reason: 'save-data' }
    const meta0 = (await store.getMeta('run')) || {}
    if (meta0.blockedUntil && meta0.blockedUntil > now()) return { ran: false, reason: 'blocked' }
    if (!subtle) return { ran: false, reason: 'insecure' }
    const r = rulesNow()
    if (!r?.origin) return { ran: false, reason: 'no-rules' }
    let watches = await store.listWatches()
    if (onlyStickers) watches = watches.filter((w) => onlyStickers.includes(w.key))
    if (!watches.length) return { ran: false, reason: 'no-watches' }
    if (typeof locks?.request !== 'function') return { ran: false, reason: 'no-lock' }
    return locks.request(LOCK, { ifAvailable: true }, (lock) => (lock ? locked(r, watches, force) : { ran: false, reason: 'locked' }))
  }

  /** The run itself, inside the lock. */
  async function locked(r, watches, force) {
    const meta = (await store.getMeta('run')) || {}
    if (meta.blockedUntil && meta.blockedUntil > now()) return { ran: false, reason: 'blocked' }
    const minMs = (r.minIntervalMin ?? 30) * 60_000
    if (!force && meta.lastRunAt != null && now() - meta.lastRunAt < minMs) return { ran: false, reason: 'throttled' }
    await store.setMeta('run', { ...meta, lastRunAt: now() })
    const block = async () => store.setMeta('run', { ...((await store.getMeta('run')) || {}), blockedUntil: now() + BLOCK_MS })
    const spacing = r.spacingMs ?? 1000
    let lastAt = null
    const paced = async (fn) => {
      if (lastAt != null) {
        const wait = lastAt + spacing - now()
        if (wait > 0) await sleep(wait)
      }
      lastAt = now()
      return fn()
    }

    // robots.txt, once per run, same origin (the HTTP cache may answer it).
    let robots
    try {
      const res = await paced(() => request(new URL('/robots.txt', r.origin).href, { cache: 'default' }))
      if (BLOCKING.has(res.status)) {
        await block()
        return { ran: false, reason: 'blocked-by-site', fetched: 1 }
      }
      if (res.status >= 500) return { ran: false, reason: 'robots-error', fetched: 1 }
      robots = res.status >= 200 && res.status < 300 ? parseRobots(await res.text()) : { allow: [], disallow: [] }
    } catch (e) {
      log('watch: robots.txt', e)
      return { ran: false, reason: 'robots-error', fetched: 1 }
    }
    await store.setMeta('robots', { rules: robots, at: now() })
    const allowed = (url) => isWatchablePath(url, { origin: r.origin, exclude: r.exclude || [], robots })

    // The due pages: those with a target of a watch in this run, never checked first, then the oldest.
    // Every target on a fetched page is compared, a sticker's outside this run's too: the page's new
    // validators would otherwise hide from it a change it never saw.
    const everyWatch = await store.listWatches()
    const keys = new Set(everyWatch.map((w) => w.key))
    const byKey = new Map(everyWatch.map((w) => [w.key, w]))
    const inRun = new Set(watches.map((w) => w.key))
    const targets = (await store.listTargets()).filter((t) => (t.stickerKeys || []).some((k) => keys.has(k)))
    const urls = new Set(targets.filter((t) => t.stickerKeys.some((k) => inRun.has(k))).map((t) => t.url))
    const pages = (await store.listPages()).filter((p) => urls.has(p.url))
    pages.sort((a, b) => (a.lastCheckedAt ?? -Infinity) - (b.lastCheckedAt ?? -Infinity))
    const due = pages.slice(0, r.perVisitMax ?? 12)

    const found = new Map() // stickerKey → { kind, targetId }
    const note = (stickerKey, kind, targetId) => {
      if (!keys.has(stickerKey)) return
      const had = found.get(stickerKey)
      if (!had || rank(kind) < rank(had.kind)) found.set(stickerKey, { kind, targetId })
    }
    const linkChanges = [] // { watch }: re-pointed to the card's link once the pages are read
    let fetched = 1

    for (const page of due) {
      const here = targets.filter((t) => t.url === page.url)
      const t0 = now()
      if (!allowed(page.url)) {
        for (const t of here) await store.putTarget({ ...t, status: 'not-allowed', checkedAt: t0 })
        continue
      }
      // A target with no baseline, or read by another reader, needs the page itself, not a 304.
      const needsBody = here.some((t) => !t.hash || t.readerVersion !== READER_VERSION)
      const headers = {}
      if (!needsBody && page.etag) headers['If-None-Match'] = page.etag
      if (!needsBody && page.lastModified) headers['If-Modified-Since'] = page.lastModified
      let res
      try {
        fetched++
        res = await paced(() => request(page.url, { headers }))
      } catch (e) {
        log('watch: fetch failed', page.url, e)
        continue
      }
      const at = lastAt
      if (BLOCKING.has(res.status)) {
        await block()
        return { ran: false, reason: 'blocked-by-site', fetched }
      }
      if (res.status === 304) {
        await store.putPage({ ...page, lastCheckedAt: at })
        for (const t of here) await store.putTarget({ ...t, checkedAt: at })
        continue
      }
      const finalUrl = normalise(res.url || page.url) || page.url
      const movedAway = finalUrl !== page.url && new URL(finalUrl).pathname !== new URL(page.url).pathname
      if (res.status === 404 || res.status === 410 || movedAway) {
        for (const t of here) {
          const status = t.kind === 'card' && movedAway && res.status !== 404 && res.status !== 410 ? 'missing' : 'gone'
          const baselined = !!t.hash
          if (baselined && t.status !== status) for (const k of t.stickerKeys) note(k, status, t.id)
          await store.putTarget({ ...t, status, checkedAt: at, ...(baselined && t.status !== status ? { changedAt: at } : {}) })
        }
        await store.putPage({ ...page, lastCheckedAt: at, finalUrl, status: 'gone' })
        continue
      }
      if (res.status < 200 || res.status >= 300) {
        log('watch: unexpected status', page.url, res.status)
        continue
      }
      const type = res.headers?.get?.('content-type') || ''
      const body = await res.text()
      await idle()
      const doc = /html/i.test(type) ? parse(body) : null
      const main = doc?.getElementById?.('main-content') ?? null
      if (!main) {
        // A page that had a region and has none now looks like a bot check: stop, never try to get past it.
        if (page.status === 'ok') {
          await block()
          return { ran: false, reason: 'blocked-by-site', fetched }
        }
        for (const t of here) await store.putTarget({ ...t, status: 'not-static', checkedAt: at })
        await store.putPage({ ...page, lastCheckedAt: at, finalUrl, status: 'not-static' })
        continue
      }
      const pageRow = {
        ...page,
        etag: res.headers?.get?.('etag') ?? null,
        lastModified: res.headers?.get?.('last-modified') ?? null,
        lastCheckedAt: at,
        finalUrl,
        canonicalUrl: canonicalOf(doc, finalUrl),
        status: 'ok',
      }

      for (const t of here) {
        const fresh = !t.hash || t.readerVersion !== READER_VERSION
        if (t.kind === 'card') {
          const stickerKey = t.stickerKeys[0]
          const record = await recordFor(stickerKey)
          if (!record) continue
          const hit = findCard(doc, record, { read, reconcile, origin: r.origin })
          if (!hit.item) {
            if (!fresh && t.status !== 'missing') note(stickerKey, 'missing', t.id)
            await store.putTarget({ ...t, status: 'missing', checkedAt: at, ...(!fresh && t.status !== 'missing' ? { changedAt: at } : {}) })
            continue
          }
          const d = await cardDigest(hit.item, { mask })
          const href = d.href ?? (hit.section?.cta?.href ? normalise(hit.section.cta.href, finalUrl) : null)
          const watch = byKey.get(stickerKey)
          if (fresh) {
            await store.putTarget({ ...t, hash: d.hash, href, status: 'ok', checkedAt: at, baselineAt: at, readerVersion: READER_VERSION })
            // The link as the page has it now is the one to follow, silently: nothing was promised yet.
            if (watch && href !== ((await store.getTarget(watch.pageTargetId))?.url ?? null)) linkChanges.push({ watch })
            if (watch && !watch.baselineAt) await store.putWatch({ ...(await store.getWatch(watch.key)), baselineAt: at })
            continue
          }
          let changed = false
          if (t.status === 'missing' || t.status === 'gone') {
            note(stickerKey, 'back', t.id)
            changed = true
          }
          if (d.hash !== t.hash) {
            note(stickerKey, 'card', t.id)
            changed = true
          }
          if (href !== t.href) {
            note(stickerKey, 'link', t.id)
            changed = true
            if (watch) linkChanges.push({ watch })
          }
          await store.putTarget({ ...t, hash: d.hash, href, status: 'ok', checkedAt: at, ...(changed ? { changedAt: at } : {}) })
        } else {
          const d = await pageDigest(doc, { mask, origin: r.origin, url: finalUrl, minChars: r.minChars ?? 200 })
          if (!d || !d.staticEnough) {
            await store.putTarget({ ...t, status: 'not-static', checkedAt: at })
            continue
          }
          if (fresh) {
            await store.putTarget({ ...t, hash: d.textHash, linksHash: d.linksHash, status: 'ok', checkedAt: at, baselineAt: at, readerVersion: READER_VERSION })
            continue
          }
          let changed = false
          if (t.status === 'missing' || t.status === 'gone') {
            for (const k of t.stickerKeys) note(k, 'back', t.id)
            changed = true
          }
          if (d.textHash !== t.hash || d.linksHash !== t.linksHash) {
            for (const k of t.stickerKeys) note(k, 'page', t.id)
            changed = true
          }
          await store.putTarget({ ...t, hash: d.textHash, linksHash: d.linksHash, status: 'ok', checkedAt: at, ...(changed ? { changedAt: at } : {}) })
        }
      }
      await store.putPage(pageRow)
    }

    // Re-point page targets whose card now opens another page: a fresh target, a baseline next time.
    for (const { watch } of linkChanges) {
      const current = await store.getWatch(watch.key)
      if (!current) continue
      const card = await store.getTarget(current.cardTargetId)
      const next = await pointPage(current, card?.href ?? null, r, robots)
      await store.putWatch(next)
    }

    const at = now()
    const rows = [...found].map(([stickerKey, { kind, targetId }]) => ({ stickerKey, targetId, kind, detectedAt: at }))
    await store.addChanges(rows)
    return { ran: true, fetched, changes: rows.length }
  }

  return { run, watchSticker, unwatchSticker }
}
