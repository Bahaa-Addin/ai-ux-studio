/**
 * The page watch's check on visit (voice-guide ADR-0078 points 1, 5, 6 and 10; phase 6 design §4.2,
 * §4.4): once per page view, never on a timer, in a service worker or by periodic sync. It fetches
 * Vodafone's public pages from the visitor's browser, signed out, one at a time, and compares hashes
 * of what it reads with the ones it kept.
 *
 * run(): skip on Save-Data, while blocked, outside a secure context, with no rules (fail safe) or no
 * watches; one tab at a time (Web Locks, ifAvailable); throttled to minIntervalMin unless a person
 * pressed (force); robots.txt once per run; the due pages oldest first, at most perVisitMax, spacingMs
 * apart (across runs too), each with our own validators so a 304 reaches us; a redirect is never followed
 * (a 3xx is the page moved); a 403/429/503, a 200 without #main-content or an answer from a URL we may not
 * read is a challenge: it stops the run and blocks it for 24 h; then every target on each page is
 * compared and one change per sticker recorded (the most significant kind, KIND_ORDER), written however
 * the run ends. A forced run (a person's press) waits for the lock; the part's stop (`signal`) ends a run.
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
 * `signal`: the watch part's stop (F11): once aborted, a run stops before its next request or write and
 * answers { ran: false, reason: 'stopped' } (the changes it already wrote targets for are still kept).
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
  signal = null,
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

  /** This checker's stop (F11): its part was dropped or the layer stopped. */
  const stopped = () => !!signal?.aborted
  const STOPPED = { ran: false, reason: 'stopped' }
  /** Thrown inside a run when the stop comes; run() answers STOPPED. */
  const STOP = new Error('the page watch stopped')

  /** The 10 s limit, and the stop, on every request. */
  const signalFor = () => {
    const t = timeoutSignal(TIMEOUT_MS)
    if (!signal || !t) return t ?? signal ?? undefined
    return typeof AbortSignal.any === 'function' ? AbortSignal.any([t, signal]) : t
  }
  /**
   * A request with our rules: signed out, our own validators, a 10 s limit, and never a redirect followed
   * (F1): a 3xx comes back as itself (an opaqueredirect), so no request ever reaches where it points.
   */
  const request = (url, { cache = 'no-store', headers = {} } = {}) => fetchImpl(url, { method: 'GET', credentials: 'omit', cache, redirect: 'manual', headers, signal: signalFor() })
  /** A 3xx, as fetch gives it with redirect 'manual'. */
  const isRedirect = (res) => res.type === 'opaqueredirect' || (res.status >= 300 && res.status < 400 && res.status !== 304)
  /** The URL the answer came from, when a browser followed a redirect anyway (null when it is the one asked for). */
  const elsewhere = (res, url) => {
    if (!res.url) return null
    const final = normalise(res.url) || res.url
    return final === url ? null : final
  }

  /**
   * run(): unforced, it skips when another run holds the lock (ifAvailable); forced (a person's press), it
   * waits its turn and then runs (F7). It never rejects: an error is logged and answered { ran: false, reason: 'error' }.
   */
  async function run({ force = false, onlyStickers = null } = {}) {
    if (stopped()) return STOPPED
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
    try {
      return await (force
        ? locks.request(LOCK, { mode: 'exclusive' }, () => locked(r, onlyStickers, force))
        : locks.request(LOCK, { ifAvailable: true }, (lock) => (lock ? locked(r, onlyStickers, force) : { ran: false, reason: 'locked' })))
    } catch (e) {
      if (e === STOP || stopped()) return STOPPED
      log('watch: the run failed', e)
      return { ran: false, reason: 'error' }
    }
  }

  /** The run itself, inside the lock. */
  async function locked(r, onlyStickers, force) {
    if (stopped()) return STOPPED
    const meta = (await store.getMeta('run')) || {}
    if (meta.blockedUntil && meta.blockedUntil > now()) return { ran: false, reason: 'blocked' }
    const minMs = (r.minIntervalMin ?? 30) * 60_000
    if (!force && meta.lastRunAt != null && now() - meta.lastRunAt < minMs) return { ran: false, reason: 'throttled' }
    // Read again inside the lock: a queued run may find a sticker removed meanwhile.
    const everyWatch = await store.listWatches()
    const watches = onlyStickers ? everyWatch.filter((w) => onlyStickers.includes(w.key)) : everyWatch
    if (!watches.length) return { ran: false, reason: 'no-watches' }
    await store.setMeta('run', { ...meta, lastRunAt: now() })
    const keys = new Set(everyWatch.map((w) => w.key))
    const byKey = new Map(everyWatch.map((w) => [w.key, w]))
    // Orphans first (F8): targets and pages no live watch uses, so no sticker ever links to a stale hash.
    await store.sweep(keys)
    const block = async () => store.setMeta('run', { ...((await store.getMeta('run')) || {}), blockedUntil: now() + BLOCK_MS })
    const spacing = r.spacingMs ?? 1000
    // The last request of any run (F7), kept in meta: two presses in a row still keep the spacing.
    let lastAt = meta.lastRequestAt ?? null
    const paced = async (fn) => {
      if (lastAt != null) {
        const wait = lastAt + spacing - now()
        if (wait > 0) await sleep(wait)
      }
      if (stopped()) throw STOP
      lastAt = now()
      // The request starts at lastAt itself, and is recorded after: a slow write never brings the next one closer.
      const out = fn()
      out?.catch?.(() => {})
      await store.setMeta('run', { ...((await store.getMeta('run')) || {}), lastRequestAt: lastAt })
      return out
    }

    // robots.txt, once per run, same origin (the HTTP cache may answer it).
    let robots
    try {
      const url = new URL('/robots.txt', r.origin).href
      const res = await paced(() => request(url, { cache: 'default' }))
      if (BLOCKING.has(res.status)) {
        await block()
        return { ran: false, reason: 'blocked-by-site', fetched: 1 }
      }
      // A redirected robots.txt is not one we can trust: stop, as for a 5xx (fail safe).
      if (res.status >= 500 || isRedirect(res) || elsewhere(res, url)) return { ran: false, reason: 'robots-error', fetched: 1 }
      robots = res.status >= 200 && res.status < 300 ? parseRobots(await res.text()) : { allow: [], disallow: [] }
    } catch (e) {
      if (e === STOP || stopped()) throw STOP
      log('watch: robots.txt', e)
      return { ran: false, reason: 'robots-error', fetched: 1 }
    }
    if (stopped()) throw STOP
    await store.setMeta('robots', { rules: robots, at: now() })
    const allowed = (url) => isWatchablePath(url, { origin: r.origin, exclude: r.exclude || [], robots })

    // The due pages: those with a target of a watch in this run, never checked first, then the oldest.
    // Every target on a fetched page is compared, a sticker's outside this run's too: the page's new
    // validators would otherwise hide from it a change it never saw.
    const inRun = new Set(watches.map((w) => w.key))
    const targets = (await store.listTargets()).filter((t) => (t.stickerKeys || []).some((k) => keys.has(k)))
    const urls = new Set(targets.filter((t) => t.stickerKeys.some((k) => inRun.has(k))).map((t) => t.url))
    const pages = (await store.listPages()).filter((p) => urls.has(p.url))
    pages.sort((a, b) => (a.lastCheckedAt ?? -Infinity) - (b.lastCheckedAt ?? -Infinity))
    const due = pages.slice(0, r.perVisitMax ?? 12)

    const found = new Map() // stickerKey → { kind, targetId }
    const note = (stickerKey, kind, targetId) => {
      const had = found.get(stickerKey)
      if (!had || rank(kind) < rank(had.kind)) found.set(stickerKey, { kind, targetId })
    }
    const linkChanges = [] // { watch }: re-pointed to the card's link once the pages are read
    let fetched = 1

    /**
     * Writes target `t`'s new fields, and only then tells its stickers of `kinds` (F3, F4, F8, F11): not
     * after the stop; not when the target was removed or made again since the run read it (F8), or no live
     * watch holds it; never to a key that joined after its last read (pending, F4). `settle`: this read is
     * the pending keys' baseline. Returns whether it wrote.
     */
    const saveTarget = async (t, fields, { kinds = [], settle = false } = {}) => {
      if (stopped()) throw STOP
      const cur = await store.getTarget(t.id)
      if (!cur || (cur.hash ?? null) !== (t.hash ?? null)) return false
      const live = []
      for (const k of cur.stickerKeys || []) if (await store.getWatch(k)) live.push(k)
      if (!live.length) return false
      const before = new Set(t.pendingKeys || [])
      const pending = cur.pendingKeys || []
      const row = { ...cur, ...fields }
      if (settle) row.pendingKeys = pending.filter((k) => !before.has(k))
      await store.putTarget(row)
      for (const k of live) if ((t.stickerKeys || []).includes(k) && !before.has(k) && !pending.includes(k)) for (const kind of kinds) note(k, kind, t.id)
      return true
    }
    /** Writes the page's row, unless the stop came or the page went (no target left on it, F8). */
    const savePage = async (page, fields) => {
      if (stopped()) throw STOP
      const cur = await store.getPage(page.url)
      if (cur) await store.putPage({ ...cur, ...fields })
    }
    const blockedBySite = async () => {
      await block()
      return { ran: false, reason: 'blocked-by-site', fetched }
    }

    /** One target on a page that was read. */
    const compare = async (t, { doc, finalUrl, at }) => {
      const fresh = !t.hash || t.readerVersion !== READER_VERSION
      if (t.kind === 'card') {
        const stickerKey = t.stickerKeys[0]
        const record = await recordFor(stickerKey)
        if (!record) return
        const hit = findCard(doc, record, { read, reconcile, origin: r.origin })
        if (!hit.item) {
          const told = !fresh && t.status !== 'missing'
          await saveTarget(t, { status: 'missing', checkedAt: at, ...(told ? { changedAt: at } : {}) }, { kinds: told ? ['missing'] : [], settle: true })
          return
        }
        const d = await cardDigest(hit.item, { mask })
        const href = d.href ?? (hit.section?.cta?.href ? normalise(hit.section.cta.href, finalUrl) : null)
        const watch = byKey.get(stickerKey)
        if (fresh) {
          if (!(await saveTarget(t, { hash: d.hash, href, status: 'ok', checkedAt: at, baselineAt: at, readerVersion: READER_VERSION }, { settle: true }))) return
          // The link as the page has it now is the one to follow, silently: nothing was promised yet.
          if (watch && href !== ((await store.getTarget(watch.pageTargetId))?.url ?? null)) linkChanges.push({ watch })
          const current = watch && (await store.getWatch(watch.key))
          if (current && !current.baselineAt) await store.putWatch({ ...current, baselineAt: at })
          return
        }
        const kinds = []
        if (t.status === 'missing' || t.status === 'gone') kinds.push('back')
        if (d.hash !== t.hash) kinds.push('card')
        if (href !== t.href) kinds.push('link')
        const wrote = await saveTarget(t, { hash: d.hash, href, status: 'ok', checkedAt: at, ...(kinds.length ? { changedAt: at } : {}) }, { kinds, settle: true })
        if (wrote && watch && kinds.includes('link')) linkChanges.push({ watch })
        return
      }
      const d = await pageDigest(doc, { mask, origin: r.origin, url: finalUrl, minChars: r.minChars ?? 200 })
      if (!d || !d.staticEnough) {
        // A page that was read and is now too thin to watch: said once as a change of the page (F9), then quiet.
        const told = !fresh && t.status !== 'not-static'
        await saveTarget(t, { status: 'not-static', checkedAt: at, ...(told ? { changedAt: at } : {}) }, { kinds: told ? ['page'] : [] })
        return
      }
      if (fresh) {
        await saveTarget(t, { hash: d.textHash, linksHash: d.linksHash, status: 'ok', checkedAt: at, baselineAt: at, readerVersion: READER_VERSION }, { settle: true })
        return
      }
      const kinds = []
      if (t.status === 'missing' || t.status === 'gone') kinds.push('back')
      if (d.textHash !== t.hash || d.linksHash !== t.linksHash) kinds.push('page')
      await saveTarget(t, { hash: d.textHash, linksHash: d.linksHash, status: 'ok', checkedAt: at, ...(kinds.length ? { changedAt: at } : {}) }, { kinds, settle: true })
    }

    /** One due page: null to go on, or the run's answer when it must stop. */
    const checkPage = async (page) => {
      const here = targets.filter((t) => t.url === page.url)
      const t0 = now()
      if (!allowed(page.url)) {
        for (const t of here) await saveTarget(t, { status: 'not-allowed', checkedAt: t0 })
        return null
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
        if (e === STOP || stopped()) throw STOP
        log('watch: fetch failed', page.url, e)
        return null
      }
      const at = lastAt
      if (BLOCKING.has(res.status)) return blockedBySite()
      // A browser that followed a redirect anyway (F1): somewhere we may not read, a sign-in or a challenge. Stop.
      const away = elsewhere(res, page.url)
      if (away && (!isSameOrigin(away, r.origin) || !allowed(away))) return blockedBySite()
      if (res.status === 304) {
        for (const t of here) await saveTarget(t, { checkedAt: at }, { settle: true })
        await savePage(page, { lastCheckedAt: at })
        return null
      }
      const redirected = isRedirect(res)
      const finalUrl = away ?? page.url
      const movedAway = redirected || (!!away && new URL(away).pathname !== new URL(page.url).pathname)
      if (res.status === 404 || res.status === 410 || movedAway) {
        for (const t of here) {
          const status = t.kind === 'card' && movedAway ? 'missing' : 'gone'
          const told = !!t.hash && t.status !== status
          await saveTarget(t, { status, checkedAt: at, ...(told ? { changedAt: at } : {}) }, { kinds: told ? [status] : [], settle: true })
        }
        await savePage(page, { lastCheckedAt: at, finalUrl, status: redirected ? 'moved' : 'gone' })
        return null
      }
      if (res.status < 200 || res.status >= 300) {
        log('watch: unexpected status', page.url, res.status)
        return null
      }
      const type = res.headers?.get?.('content-type') || ''
      const body = await res.text()
      await idle()
      const doc = /html/i.test(type) ? parse(body) : null
      const main = doc?.getElementById?.('main-content') ?? null
      // Every page we fetch is one isWatchablePath allows: a CMS page, which always has #main-content (M2).
      // A 200 without it, on the first fetch or any later one, is a challenge (F2): stop, never try to get past it.
      if (!main && allowed(finalUrl)) return blockedBySite()
      for (const t of here) {
        try {
          await compare(t, { doc, finalUrl, at })
        } catch (e) {
          if (e === STOP || stopped()) throw STOP
          log('watch: a target failed', t.id, e)
        }
      }
      await savePage(page, {
        etag: res.headers?.get?.('etag') ?? null,
        lastModified: res.headers?.get?.('last-modified') ?? null,
        lastCheckedAt: at,
        finalUrl,
        canonicalUrl: canonicalOf(doc, finalUrl),
        status: 'ok',
      })
      return null
    }

    // The changes found are written however the run ends (F3): a block, an error, the stop. Each was
    // noted only once its target's new hash was written, so none is lost and none is told twice.
    try {
      for (const page of due) {
        if (stopped()) throw STOP
        try {
          const out = await checkPage(page)
          if (out) return out
        } catch (e) {
          if (e === STOP || stopped()) throw STOP
          log('watch: a page failed', page.url, e)
        }
      }

      // Re-point page targets whose card now opens another page: a fresh target, a baseline next time.
      for (const { watch } of linkChanges) {
        if (stopped()) throw STOP
        const current = await store.getWatch(watch.key)
        if (!current) continue
        const card = await store.getTarget(current.cardTargetId)
        const next = await pointPage(current, card?.href ?? null, r, robots)
        await store.putWatch(next)
      }
      return { ran: true, fetched, changes: found.size }
    } finally {
      const at = now()
      const rows = [...found].filter(([stickerKey]) => keys.has(stickerKey)).map(([stickerKey, { kind, targetId }]) => ({ stickerKey, targetId, kind, detectedAt: at }))
      try {
        await store.addChanges(rows)
      } catch (e) {
        log('watch: changes not written', e)
      }
    }
  }

  return { run, watchSticker, unwatchSticker }
}
