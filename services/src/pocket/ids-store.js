/**
 * The clone's Pocket store as it has always been (localStorage `aixc.pocket.v1`, card ids only),
 * shaped like the live store (./store.js, voice-guide ADR-0051) so the Pocket has one interface on
 * both. Used by the Services clone until the live plan's phase 9 retires it.
 *
 * - Only ids of cards on this page are read (the clone has one page), as before.
 * - A sticker's record is made from its card each time it is read, so it always shows the card's
 *   current copy; its key is the card's id.
 * - Writes are synchronous; storage that is unavailable (private mode) keeps the Pocket for this visit.
 */
import { recordFrom } from './record.js'

export const IDS_KEY = 'aixc.pocket.v1'

/** `catalog`: Map(id → { item, section }) of this page's cards; `page`: { path, lang, dir, title }; `model`: the page's model. */
export function createIdsStore({ catalog, page, model = null, win = globalThis }) {
  const load = () => {
    try {
      const value = JSON.parse(win.localStorage.getItem(IDS_KEY) || '[]')
      return Array.isArray(value) ? value.filter((id) => typeof id === 'string' && catalog.has(id)) : []
    } catch {
      return []
    }
  }
  let ids = load()
  const listeners = new Set()
  const toRecord = (id) => {
    const { item, section } = catalog.get(id)
    return recordFrom({ item, section, page, model, key: id, now: 0 })
  }
  const persist = () => {
    try {
      win.localStorage.setItem(IDS_KEY, JSON.stringify(ids))
    } catch {
      // Storage can be unavailable (private mode); the pocket then lasts for this visit.
    }
  }
  const tell = () => {
    const list = ids.map(toRecord)
    for (const fn of listeners) fn(list)
  }
  return {
    ready: Promise.resolve(),
    persistent: true,
    all: () => ids.map(toRecord),
    get: (key) => (ids.includes(key) ? toRecord(key) : null),
    async put(record) {
      if (!catalog.has(record?.key)) throw new Error('not a card on this page')
      if (!ids.includes(record.key)) ids.push(record.key)
      persist()
      tell()
    },
    async remove(key) {
      if (!ids.includes(key)) return
      ids = ids.filter((id) => id !== key)
      persist()
      tell()
    },
    async clear() {
      ids = []
      persist()
      tell()
    },
    subscribe(fn) {
      listeners.add(fn)
      return () => void listeners.delete(fn)
    },
    legacyIds: () => [],
    dropLegacy() {},
    close() {
      listeners.clear()
    },
  }
}
