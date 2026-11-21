/**
 * How the page watch shows (voice-guide ADR-0078 point 8; phase 6 design §4.6, §4.7), in the Pocket's own
 * places and Vodafone's design language: nothing new floats.
 *
 * - On a sticker (the Pocket's sticker extra, a block above its actions row): "Tell me when this changes" on
 *   every web sticker; "Watching · No change since 23 Oct" with "Stop watching" once watched (and the page
 *   note when only the card can be watched); with an unseen change, a "Changed" tag, what changed and when,
 *   and "Open the page"; once seen, a quiet "Watching · Changed 18 Nov" until the next change.
 * - On Vodafone's page, the pocketed card's liner (the layer's overlay, never Vodafone's markup): "Changed"
 *   while that sticker has an unseen change; a press opens the album at that sticker.
 * - On the Pocket button: a red count of the stickers with unseen changes, and its label says so.
 * - Opening the album marks the changes it shows as seen (the count goes to 0); they keep their "Changed"
 *   tag until the album closes, so the visitor sees what they were told about.
 *
 * describe() is the whole of what a sticker says, without a DOM (tests/watch-ui.test.mjs). createWatchUi()
 * draws it through the Pocket's seams; every handler runs through `safe`, so an error drops only the watch.
 */

/** Refusals of watchSticker, as the sticker says them. */
const REFUSAL = { 'max-watched': 'maxWatched', 'not-allowed': 'not-allowed' }

/** The latest of `list` (by date found, then by row). */
const latest = (list) => list.reduce((a, c) => (!a || c.detectedAt > a.detectedAt || (c.detectedAt === a.detectedAt && c.id > a.id) ? c : a), null)

/**
 * Where "Open the page" goes: the card's own page when the card changed or left it; else the page its card
 * opens now (the watch's page target, re-pointed after a link change), else the link the sticker kept. After
 * a link change the kept link is the old one (F10): the card target's href now (`cardHref`), else the card's page.
 */
export function openHrefOf(kind, watch, record, origin = globalThis.location?.origin, cardHref = null) {
  let card = null
  try {
    card = new URL(record.source.path, origin).href
  } catch {}
  if (kind === 'card' || kind === 'missing') return card
  const page = watch?.pageTargetId?.startsWith('page ') ? watch.pageTargetId.slice(5) : null
  if (kind === 'link') return page ?? cardHref ?? card
  return page ?? record.cta?.href ?? card
}

/** The stickers with an unseen change, once each, that `alive(key)` says are still in the pocket. */
export const unseenKeys = (rows, alive = () => true) => [...new Set(rows.filter((c) => c.seenAt == null && alive(c.stickerKey)).map((c) => c.stickerKey))]

/**
 * What a sticker says: null for none (a shop sticker, or no record); else { tag, lines: [{ text, quiet }],
 * tell, stop, open (href or null), busy }. `w` is words.js's wordsFor(lang).
 */
export function describe({ record, watch = null, changes = [], refusal = null, busy = false, maxWatched = 20, origin, cardHref = null }, w) {
  if (!record?.source?.path || record.source.site === 'shop') return null
  const d = { tag: null, lines: [], tell: false, stop: false, open: null, busy: !!busy }
  if (!watch) {
    d.tell = true
    if (refusal) d.lines.push({ text: w(REFUSAL[refusal] ?? 'unavailable', { max: maxWatched }) })
    return d
  }
  d.stop = true
  const unseen = latest(changes.filter((c) => c.seenAt == null))
  if (unseen) {
    d.tag = w('changed')
    d.lines.push({ text: `${w(unseen.kind)} · ${w.date(unseen.detectedAt)}` })
    d.open = openHrefOf(unseen.kind, watch, record, origin, cardHref)
    return d
  }
  const seen = latest(changes)
  if (seen) d.lines.push({ text: `${w('watching')} · ${w('changedOn', { date: w.date(seen.detectedAt) })}`, quiet: true })
  else d.lines.push({ text: watch.baselineAt ? `${w('watching')} · ${w('noChange', { date: w.date(watch.baselineAt) })}` : w('watching') })
  if (watch.pageNote) d.lines.push({ text: w(watch.pageNote), quiet: true })
  return d
}

/**
 * Draws the watch through the Pocket's seams. `pocket`: initPocket's instance (setStickerExtra, setLinerExtra,
 * refreshExtras, setChanged, dock.root); `open()`: the Pocket's open, through the layer's guard; `pocketStore`:
 * the Pocket's records; `store`, `checker`: the watch's; `w`: its words; `safe(fn)`: fn whose errors drop the watch.
 * Returns { start, watch(key, from), stop(key), openAt(key), load(), destroy }; load() reads the store again and draws.
 */
export function createWatchUi({ pocket, open, pocketStore, store, checker, w, origin, safe, maxWatched = () => 20, doc = document }) {
  const watches = new Map()
  const changes = new Map()
  /** key → the href its card target has now (re-pointed after a link change), for "Open the page". */
  const hrefs = new Map()
  const refusals = new Map()
  const busy = new Set()
  /** While the album shows: key → the ids of the changes it showed unseen (they keep their tag until it closes). */
  let held = null
  let destroyed = false
  const offs = []

  const make = (tag, attrs, ...children) => {
    const node = doc.createElement(tag)
    for (const [name, value] of Object.entries(attrs)) if (value != null) node.setAttribute(name, value)
    node.append(...children)
    return node
  }
  const button = (cls, text, label, onClick) => {
    const b = make('button', { type: 'button', class: cls, 'aria-label': label }, text)
    b.addEventListener('click', safe(onClick))
    return b
  }

  const allChanges = () => [...changes.values()].flat()
  const stateOf = (record) => {
    const key = record.key
    let list = changes.get(key) ?? []
    const shown = held?.get(key)
    if (shown) list = list.map((c) => (shown.has(c.id) ? { ...c, seenAt: null } : c))
    return describe({ record, watch: watches.get(key) ?? null, changes: list, refusal: refusals.get(key), busy: busy.has(key), maxWatched: maxWatched(), origin, cardHref: hrefs.get(key) ?? null }, w)
  }

  /** The block above a sticker's actions row; its clean-up takes it away. */
  const stickerExtra = (record, actions) => {
    if (destroyed || !record || !actions?.parentNode) return undefined
    const d = stateOf(record)
    if (!d) return undefined
    const title = record.copy?.title ?? ''
    const box = make('div', { class: 'aixc-watch', 'data-watch-for': record.key })
    if (d.tag) box.append(make('span', { class: 'aixc-watch__tag' }, d.tag))
    for (const line of d.lines) box.append(make('p', { class: line.quiet ? 'aixc-watch__line is-quiet' : 'aixc-watch__line' }, line.text))
    const row = make('div', { class: 'aixc-watch__actions' })
    if (d.tell) row.append(button('aixc-watch__button', w('tell'), w('tellLabel', { title }), () => watch(record.key, 'sticker')))
    if (d.open) row.append(make('a', { class: 'aixc-watch__open', href: d.open }, w('open')))
    if (d.stop) row.append(button('aixc-watch__button is-quiet', w('stop'), w('stopLabel', { title }), () => stop(record.key)))
    if (d.busy) for (const b of row.querySelectorAll('button')) b.disabled = true
    if (row.childElementCount) box.append(row)
    actions.before(box)
    return () => box.remove()
  }

  /** "Changed" on the pocketed card's liner, while its sticker has an unseen change. */
  const linerExtra = (record, liner) => {
    if (destroyed || !record || !liner || !(changes.get(record.key) ?? []).some((c) => c.seenAt == null)) return undefined
    const b = button('aixc-watch-liner', w('changed'), w('linerLabel', { title: record.copy?.title ?? '' }), () => openAt(record.key))
    // In the overlay the liner's buttons stay out of the Tab order, as "Put back" does (ADR-0052 §10).
    if (liner.querySelector('.pocket-liner__undo')?.getAttribute('tabindex') === '-1') b.tabIndex = -1
    ;(liner.querySelector('.pocket-liner__content') ?? liner).append(b)
    return () => b.remove()
  }

  /** Draws everything again from what is known; a button that had focus hands it to its sticker's new one. */
  const apply = () => {
    if (destroyed) return
    const had = doc.activeElement?.closest?.('.aixc-watch')?.dataset.watchFor ?? null
    pocket.refreshExtras()
    if (had != null) [...pocket.dock.root.querySelectorAll('.aixc-watch')].find((box) => box.dataset.watchFor === had)?.querySelector('button:not([disabled]), a')?.focus({ preventScroll: true })
    const n = unseenKeys(allChanges(), (key) => !!pocketStore.get(key)).length
    pocket.setChanged(n, (base) => w('button', { base, count: n }))
  }

  /** Reads the watches and their changes from the store, one read at a time, then draws. */
  let chain = Promise.resolve()
  const load = () =>
    (chain = chain.then(async () => {
      if (destroyed) return
      const list = await store.listWatches()
      const next = new Map()
      const nextHrefs = new Map()
      for (const row of list) {
        next.set(row.key, await store.changesFor(row.key))
        nextHrefs.set(row.key, (await store.getTarget(row.cardTargetId))?.href ?? null)
      }
      hrefs.clear()
      for (const [key, href] of nextHrefs) hrefs.set(key, href)
      watches.clear()
      for (const row of list) watches.set(row.key, row)
      changes.clear()
      for (const [key, rows] of next) changes.set(key, rows)
      apply()
    }))

  /** Watches the sticker under `key` (a press, or the guide's chip); its baseline is taken at once, after. */
  const watch = async (key, from = 'sticker') => {
    const record = pocketStore.get(key)
    if (!record) return { ok: false, reason: 'not-pocketed' }
    if (busy.has(key)) return { ok: false, reason: 'busy' }
    busy.add(key)
    apply()
    let r
    try {
      r = await checker.watchSticker(record, { from })
    } finally {
      busy.delete(key)
    }
    if (r.ok) refusals.delete(key)
    else refusals.set(key, r.reason)
    await load()
    // The first baseline at once: a person pressed (design §4.4 step 4), with the pacing kept.
    if (r.ok && !r.already) void safe(async () => (await checker.run({ force: true, onlyStickers: [key] }), load()))()
    return r.ok ? { ok: true, ...(r.already ? { already: true } : {}) } : { ok: false, reason: r.reason }
  }

  const stop = async (key) => {
    refusals.delete(key)
    await checker.unwatchSticker(key)
  }

  /** Opens the album at the sticker under `key`. */
  const openAt = async (key) => {
    await open()
    if (destroyed) return
    const box = [...pocket.dock.root.querySelectorAll('.aixc-watch')].find((b) => b.dataset.watchFor === key)
    const reduce = doc.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    box?.closest('.pocket-grid__item')?.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' })
    box?.querySelector('a, button')?.focus({ preventScroll: true })
  }

  /** The album shows: what it shows unseen is seen now (the count goes to 0), and keeps its tag until it closes. */
  const onView = (event) => {
    if (event.detail === 'pocket') {
      held = new Map()
      for (const key of unseenKeys(allChanges(), (k) => !!pocketStore.get(k))) held.set(key, new Set((changes.get(key) ?? []).filter((c) => c.seenAt == null).map((c) => c.id)))
      if (held.size) return store.markSeen([...held.keys()])
    } else if (event.detail === 'page') {
      held = null
      apply()
    }
    return undefined
  }

  /** A sticker taken out of the pocket (Remove, Put back, Empty pocket, another tab) takes its watch with it. */
  const prune = async () => {
    const alive = new Set(pocketStore.all().map((r) => r.key))
    for (const key of [...watches.keys()]) if (!alive.has(key)) await checker.unwatchSticker(key)
    apply()
  }

  return {
    async start() {
      await load()
      offs.push(store.subscribe(safe(() => load())))
      const root = pocket.dock.root
      const viewHandler = safe(onView)
      root.addEventListener('pocket:view', viewHandler)
      offs.push(() => root.removeEventListener('pocket:view', viewHandler))
      pocket.setStickerExtra(safe(stickerExtra))
      pocket.setLinerExtra(safe(linerExtra))
      await pocketStore.ready
      if (destroyed) return
      await prune()
      offs.push(pocketStore.subscribe(safe(() => prune())))
    },
    watch,
    stop,
    openAt,
    load,
    destroy() {
      if (destroyed) return
      destroyed = true
      for (const off of offs.splice(0)) {
        try {
          off()
        } catch {}
      }
      try {
        pocket.setStickerExtra(null)
        pocket.setLinerExtra(null)
        pocket.setChanged(0)
      } catch {}
    },
  }
}
