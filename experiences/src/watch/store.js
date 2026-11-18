/**
 * Where the page watch keeps its watches (voice-guide ADR-0078 point 5; phase 6 design §4.3): its own
 * IndexedDB database, `aixc-watch-v1` version 1, beside the Pocket's `aixc-v1` and never inside it, in
 * the visitor's browser only. Never localStorage, which Vodafone's signed-out theme clears.
 *
 * - Stores: watches (sticker key), targets (id), pages (url), changes (auto id, indexed by stickerKey),
 *   meta (key). Rows keep only the fields the design lists: hashes, link URLs, validators, dates and
 *   statuses. No page text is ever stored (owner, Q5): every write picks its fields, so a caller that
 *   passes more cannot store it.
 * - Every call is async and reads or writes the database itself; there is no second copy in memory
 *   to drift. The unseen count is derived from `changes`.
 * - Writes that matter (watches added or removed, changes added or seen, reset) are told to this tab's
 *   subscribers and to other tabs on BroadcastChannel('aixc-watch') as { type: 'changed' }. Meta
 *   writes (the run's dates, robots) are not news.
 * - IndexedDB missing or failing to open (a private window, blocked storage): the same API in memory,
 *   for this page only (`persistent: false`); nothing throws.
 * - reset() deletes the database (other tabs close theirs when asked) and tells everyone; the next
 *   call opens a new, empty one.
 */
export const DB = 'aixc-watch-v1'
export const CHANNEL = 'aixc-watch'
const VERSION = 1

const FIELDS = {
  watches: ['key', 'lang', 'createdAt', 'from', 'cardTargetId', 'pageTargetId', 'pageNote', 'baselineAt'],
  targets: ['id', 'kind', 'url', 'stickerKeys', 'hash', 'linksHash', 'href', 'status', 'checkedAt', 'changedAt', 'baselineAt', 'readerVersion'],
  pages: ['url', 'etag', 'lastModified', 'lastCheckedAt', 'finalUrl', 'canonicalUrl', 'targetIds', 'status'],
  changes: ['id', 'stickerKey', 'targetId', 'kind', 'detectedAt', 'seenAt'],
  meta: ['key', 'value'],
}
const KEYS = { watches: 'key', targets: 'id', pages: 'url', changes: 'id', meta: 'key' }
const STORES = Object.keys(FIELDS)

/** Only the listed fields, and none that is undefined. */
const pick = (store, row) => {
  const out = {}
  for (const f of FIELDS[store]) if (row[f] !== undefined) out[f] = row[f]
  return out
}

const request = (r) =>
  new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
  })

/** The same five operations over plain Maps. */
const memoryBackend = () => {
  const maps = Object.fromEntries(STORES.map((s) => [s, new Map()]))
  let seq = 0
  const copy = (x) => (x == null ? null : structuredClone(x))
  return {
    get: async (s, k) => copy(maps[s].get(k)),
    getAll: async (s) => [...maps[s].values()].map(copy),
    put: async (s, row) => {
      if (s === 'changes' && row.id == null) row = { ...row, id: ++seq }
      maps[s].set(row[KEYS[s]], copy(row))
      return row[KEYS[s]]
    },
    del: async (s, k) => {
      maps[s].delete(k)
    },
    clear: async () => {
      for (const m of Object.values(maps)) m.clear()
    },
  }
}

const openDb = (idb) =>
  new Promise((resolve, reject) => {
    let r
    try {
      r = idb.open(DB, VERSION)
    } catch (e) {
      reject(e)
      return
    }
    r.onupgradeneeded = () => {
      const db = r.result
      if (!db.objectStoreNames.contains('watches')) db.createObjectStore('watches', { keyPath: 'key' })
      if (!db.objectStoreNames.contains('targets')) db.createObjectStore('targets', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('pages')) db.createObjectStore('pages', { keyPath: 'url' })
      if (!db.objectStoreNames.contains('changes')) db.createObjectStore('changes', { keyPath: 'id', autoIncrement: true }).createIndex('stickerKey', 'stickerKey')
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' })
    }
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
    r.onblocked = () => reject(new Error('blocked'))
  })

/** The five operations over IndexedDB, opened on first use and again after a reset or another tab's. */
const idbBackend = (idb) => {
  let db = null
  let opening = null
  const open = () =>
    db
      ? Promise.resolve(db)
      : (opening ??= openDb(idb).then(
          (d) => {
            // Another tab's reset: let it delete the database; this tab opens a new one when next asked.
            d.onversionchange = () => {
              d.close()
              if (db === d) db = null
            }
            db = d
            opening = null
            return d
          },
          (e) => {
            opening = null
            throw e
          },
        ))
  /** Resolves with the request's result once the transaction commits. */
  const run = async (s, mode, fn) => {
    const d = await open()
    return new Promise((resolve, reject) => {
      const t = d.transaction(s, mode)
      let result
      const r = fn(t.objectStore(s))
      r.onsuccess = () => (result = r.result)
      t.oncomplete = () => resolve(result)
      t.onabort = t.onerror = () => reject(t.error || r.error || new Error('the write was aborted'))
    })
  }
  return {
    open,
    get: async (s, k) => (await run(s, 'readonly', (o) => o.get(k))) ?? null,
    getAll: (s) => run(s, 'readonly', (o) => o.getAll()),
    put: (s, row) => run(s, 'readwrite', (o) => o.put(row)),
    del: (s, k) => run(s, 'readwrite', (o) => o.delete(k)),
    clear: async () => {
      if (db) db.close()
      db = null
      await new Promise((resolve, reject) => {
        const r = idb.deleteDatabase(DB)
        r.onsuccess = () => resolve()
        r.onerror = () => reject(r.error)
        // Blocked: another tab has not closed yet; it does on versionchange, and then this succeeds.
      })
    },
  }
}

/**
 * `win`: the window (tests pass their own); `onError(e)`: told once if IndexedDB fails. Returns the
 * store's API (all async): watches, targets, pages, changes, meta, reset, subscribe, close.
 */
export function openWatchStore({ win = globalThis, onError = () => {} } = {}) {
  const listeners = new Set()
  const channel = typeof win.BroadcastChannel === 'function' ? new win.BroadcastChannel(CHANNEL) : null
  let persistent = false
  let b = memoryBackend()

  const ready = (async () => {
    const idb = win.indexedDB
    if (!idb) return
    try {
      const real = idbBackend(idb)
      await real.open()
      b = real
      persistent = true
    } catch (e) {
      onError(e)
    }
  })()
  /** The backend once the first open has settled. */
  const be = async () => {
    await ready
    return b
  }

  const tell = (msg) => {
    for (const fn of listeners) {
      try {
        fn(msg)
      } catch (e) {
        onError(e)
      }
    }
  }
  const changed = () => {
    const msg = { type: 'changed' }
    try {
      channel?.postMessage(msg)
    } catch (e) {
      onError(e)
    }
    tell(msg)
  }
  if (channel) channel.onmessage = (e) => tell(e?.data && typeof e.data === 'object' ? e.data : { type: 'changed' })

  const get = async (s, k) => (k == null ? null : (await be()).get(s, k))
  const all = async (s) => (await be()).getAll(s)
  const put = async (s, row) => (await be()).put(s, pick(s, row))
  const del = async (s, k) => (await be()).del(s, k)

  /** Removes `stickerKey` from a target; deletes the target when no sticker is left, and its page when no target is. */
  const unlinkTarget = async (targetId, stickerKey) => {
    const t = await get('targets', targetId)
    if (!t) return
    const keys = (t.stickerKeys || []).filter((k) => k !== stickerKey)
    if (keys.length) {
      await put('targets', { ...t, stickerKeys: keys })
      return
    }
    await del('targets', targetId)
    const p = await get('pages', t.url)
    if (!p) return
    const ids = (p.targetIds || []).filter((id) => id !== targetId)
    if (ids.length) await put('pages', { ...p, targetIds: ids })
    else await del('pages', t.url)
  }

  return {
    ready,
    get persistent() {
      return persistent
    },

    // ---- watches ----
    getWatch: (key) => get('watches', key),
    listWatches: () => all('watches'),
    /** Adds or replaces a watch row. */
    async addWatch(row) {
      await put('watches', row)
      changed()
    },
    /** Updates a watch row in place (no news: a re-point or a baseline date). */
    putWatch: (row) => put('watches', row),
    /** Removes the watch, its changes, and the targets and pages no other watch uses. */
    async removeWatch(key) {
      const w = await get('watches', key)
      for (const t of await all('targets')) if ((t.stickerKeys || []).includes(key)) await unlinkTarget(t.id, key)
      for (const c of await all('changes')) if (c.stickerKey === key) await del('changes', c.id)
      if (w) await del('watches', key)
      changed()
    },

    // ---- targets and pages ----
    getTarget: (id) => get('targets', id),
    listTargets: () => all('targets'),
    putTarget: (row) => put('targets', row),
    /** Adds `stickerKey` to the target (made from `target` when new) and the target to its page's row (made when new). */
    async linkTarget(target, stickerKey) {
      const t = (await get('targets', target.id)) ?? { status: 'ok', hash: null, ...target, stickerKeys: [] }
      if (!t.stickerKeys.includes(stickerKey)) t.stickerKeys = [...t.stickerKeys, stickerKey]
      await put('targets', t)
      const p = (await get('pages', t.url)) ?? { url: t.url, targetIds: [], lastCheckedAt: null, status: null }
      if (!p.targetIds.includes(t.id)) await put('pages', { ...p, targetIds: [...p.targetIds, t.id] })
      return t
    },
    unlinkTarget,
    getPage: (url) => get('pages', url),
    listPages: () => all('pages'),
    putPage: (row) => put('pages', row),

    // ---- changes ----
    /** Records a change (seenAt null) and tells everyone. */
    async addChange(c) {
      await put('changes', { ...c, id: undefined, seenAt: c.seenAt ?? null })
      changed()
    },
    /** Several changes, one message. */
    async addChanges(list) {
      if (!list.length) return
      for (const c of list) await put('changes', { ...c, id: undefined, seenAt: c.seenAt ?? null })
      changed()
    },
    async changesFor(stickerKey) {
      return (await all('changes')).filter((c) => c.stickerKey === stickerKey).sort((a, b) => a.id - b.id)
    },
    async unseenStickers() {
      return [...new Set((await all('changes')).filter((c) => c.seenAt == null).map((c) => c.stickerKey))]
    },
    async unseenCount() {
      return (await this.unseenStickers()).length
    },
    async markSeen(stickerKeys, at = Date.now()) {
      const keys = new Set(stickerKeys)
      let n = 0
      for (const c of await all('changes'))
        if (keys.has(c.stickerKey) && c.seenAt == null) {
          await put('changes', { ...c, seenAt: at })
          n++
        }
      if (n) changed()
    },

    // ---- meta ----
    async getMeta(key) {
      return (await get('meta', key))?.value ?? null
    },
    setMeta: (key, value) => put('meta', { key, value }),

    /** Deletes the database (the memory copy is emptied) and tells everyone. */
    async reset() {
      try {
        await (await be()).clear()
      } catch (e) {
        onError(e)
      }
      changed()
    },
    /** fn({ type: 'changed' }) after this tab's writes that matter and other tabs'. Returns an unsubscribe. */
    subscribe(fn) {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    close() {
      listeners.clear()
      channel?.close()
    },
  }
}
