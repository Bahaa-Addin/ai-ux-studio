/**
 * Where the Pocket keeps its stickers on Vodafone's pages (voice-guide ADR-0051; O23): its own
 * IndexedDB database in the visitor's browser, never localStorage, which Vodafone's signed-out
 * theme clears on every load of home, Services, RED and Vodafone Cash. IndexedDB is not touched by
 * any theme script (phase 3 map, storage). One store for every page: records are never filtered by
 * the page they are read on.
 *
 * - `ready` resolves once the records are read; `all()` is the in-memory copy.
 * - Every change is written through to IndexedDB and told to other tabs on a BroadcastChannel; a
 *   tab that hears it reads the store again.
 * - When IndexedDB does not open (a private window, blocked storage), the store lives in memory for
 *   this page only and says so (`persistent: false`); nothing throws.
 * - The clone's earlier store (localStorage `aixc.pocket.v1`, ids only) is moved over once, by the
 *   caller, which knows the page's cards (`legacyIds()` then `dropLegacy()`).
 *
 * No navigator.storage.persist() on Vodafone's origin; nothing leaves the browser.
 */
import { isRecord } from './record.js'

const DB = 'aixc-v1'
const STORE = 'pocket'
const CHANNEL = 'aixc-pocket'
const LEGACY = 'aixc.pocket.v1'

const request = (r) =>
  new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
  })

const openDb = (idb) =>
  new Promise((resolve, reject) => {
    let r
    try {
      r = idb.open(DB, 1)
    } catch (e) {
      reject(e)
      return
    }
    r.onupgradeneeded = () => {
      if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE, { keyPath: 'key' })
    }
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
    r.onblocked = () => reject(new Error('blocked'))
  })

/**
 * `win`: the window (tests pass their own); `onError(e)`: told once if IndexedDB fails (the layer
 * logs it). Returns { ready, persistent, all, get, put, remove, clear, subscribe, legacyIds, dropLegacy, close }.
 */
export function openPocketStore({ win = globalThis, onError = () => {} } = {}) {
  const records = new Map()
  const listeners = new Set()
  let db = null
  let persistent = false
  let closed = false
  const channel = typeof win.BroadcastChannel === 'function' ? new win.BroadcastChannel(CHANNEL) : null
  const tell = () => {
    const list = [...records.values()]
    for (const fn of listeners) {
      try {
        fn(list)
      } catch (e) {
        onError(e)
      }
    }
  }
  const tx = (mode) => db.transaction(STORE, mode).objectStore(STORE)
  const readAll = async () => {
    if (!db) return
    const rows = await request(tx('readonly').getAll())
    records.clear()
    for (const row of rows) if (isRecord(row)) records.set(row.key, row)
  }
  const write = async (fn) => {
    if (!db || closed) return
    try {
      await fn()
      channel?.postMessage('changed')
    } catch (e) {
      onError(e)
    }
  }

  const ready = (async () => {
    try {
      if (!win.indexedDB) throw new Error('no IndexedDB')
      db = await openDb(win.indexedDB)
      persistent = true
      await readAll()
    } catch (e) {
      db = null
      persistent = false
      onError(e)
    }
    tell()
  })()

  if (channel)
    channel.onmessage = () => {
      if (closed) return
      void readAll()
        .then(tell)
        .catch(onError)
    }

  return {
    ready,
    get persistent() {
      return persistent
    },
    all: () => [...records.values()],
    get: (key) => records.get(key) ?? null,
    async put(record) {
      if (!isRecord(record)) throw new Error('not a Pocket record')
      records.set(record.key, record)
      tell()
      await write(() => request(tx('readwrite').put(record)))
    },
    async remove(key) {
      if (!records.delete(key)) return
      tell()
      await write(() => request(tx('readwrite').delete(key)))
    },
    async clear() {
      records.clear()
      tell()
      await write(() => request(tx('readwrite').clear()))
    },
    /** Called with every record, now and after each change (here or in another tab); returns the unsubscribe function. */
    subscribe(fn) {
      listeners.add(fn)
      return () => void listeners.delete(fn)
    },
    /** The clone's ids-only store, if this browser still has it. */
    legacyIds() {
      try {
        const ids = JSON.parse(win.localStorage?.getItem(LEGACY) || '[]')
        return Array.isArray(ids) ? ids.filter((x) => typeof x === 'string') : []
      } catch {
        return []
      }
    },
    dropLegacy() {
      try {
        win.localStorage?.removeItem(LEGACY)
      } catch {}
    },
    close() {
      closed = true
      listeners.clear()
      channel?.close()
      db?.close()
    },
  }
}
