// The page watch's store (src/watch/store.js; voice-guide ADR-0078 point 5, phase 6 design §4.3): the
// in-memory store node runs, with the same API as the IndexedDB one. Here `openWatchStore({ win: {} })`
// has no indexedDB, so it falls back to memory; voice-guide tests/integration/watch-store.test.ts runs
// the IndexedDB store in Chromium (reload, localStorage.clear(), two tabs, reset).
import test from 'node:test'
import assert from 'node:assert/strict'

import { openWatchStore, DB, CHANNEL } from '../src/watch/store.js'

/** A fake BroadcastChannel bus: every channel of the same name hears the others' messages. */
const bus = () => {
  const all = new Set()
  return class FakeChannel {
    constructor(name) {
      this.name = name
      this.onmessage = null
      all.add(this)
    }
    postMessage(data) {
      for (const c of all) if (c !== this && c.name === this.name) c.onmessage?.({ data })
    }
    close() {
      all.delete(this)
    }
  }
}

const watchRow = (key, over = {}) => ({ key, lang: 'en', createdAt: 1, from: 'sticker', cardTargetId: `card ${key} https://x.test/en/a`, pageTargetId: null, pageNote: null, baselineAt: null, ...over })

test('names: one database, one channel', () => {
  assert.equal(DB, 'aixc-watch-v1')
  assert.equal(CHANNEL, 'aixc-watch')
})

test('no indexedDB: memory, says so, nothing throws', async () => {
  const s = openWatchStore({ win: {} })
  await s.ready
  assert.equal(s.persistent, false)
  assert.deepEqual(await s.listWatches(), [])
  assert.equal(await s.unseenCount(), 0)
})

test('an indexedDB that fails to open falls back to memory', async () => {
  const errors = []
  const win = { indexedDB: { open: () => { throw new Error('denied') } } }
  const s = openWatchStore({ win, onError: (e) => errors.push(e) })
  await s.ready
  assert.equal(s.persistent, false)
  await s.addWatch(watchRow('a'))
  assert.equal((await s.listWatches()).length, 1)
  assert.equal(errors.length, 1)
})

test('watches, targets and pages: put, get, list', async () => {
  const s = openWatchStore({ win: {} })
  await s.addWatch(watchRow('a'))
  assert.equal((await s.getWatch('a')).lang, 'en')
  await s.linkTarget({ id: 't1', kind: 'card', url: 'https://x.test/en/a', hash: null }, 'a')
  await s.linkTarget({ id: 't1', kind: 'card', url: 'https://x.test/en/a', hash: null }, 'b')
  const t = await s.getTarget('t1')
  assert.deepEqual(t.stickerKeys, ['a', 'b'], 'a target lists every sticker that uses it, once')
  const p = await s.getPage('https://x.test/en/a')
  assert.deepEqual(p.targetIds, ['t1'], 'its page row is made with it')
  await s.putTarget({ ...t, hash: 'h' })
  assert.equal((await s.getTarget('t1')).hash, 'h')
  await s.putPage({ ...p, etag: '"e"' })
  assert.equal((await s.getPage('https://x.test/en/a')).etag, '"e"')
  assert.equal((await s.listPages()).length, 1)
  assert.equal((await s.listTargets()).length, 1)
})

test('removeWatch deletes its targets and pages no other watch uses, and its changes', async () => {
  const s = openWatchStore({ win: {} })
  await s.addWatch(watchRow('a'))
  await s.addWatch(watchRow('b'))
  await s.linkTarget({ id: 'card-a', kind: 'card', url: 'https://x.test/en/a' }, 'a')
  await s.linkTarget({ id: 'page-p', kind: 'page', url: 'https://x.test/en/p' }, 'a')
  await s.linkTarget({ id: 'page-p', kind: 'page', url: 'https://x.test/en/p' }, 'b')
  await s.addChange({ stickerKey: 'a', targetId: 'card-a', kind: 'card', detectedAt: 5 })
  await s.removeWatch('a')
  assert.equal(await s.getWatch('a'), null)
  assert.equal(await s.getTarget('card-a'), null, 'its own target is gone')
  assert.equal(await s.getPage('https://x.test/en/a'), null, 'and the page only it used')
  assert.deepEqual((await s.getTarget('page-p')).stickerKeys, ['b'], 'a shared target stays for the other sticker')
  assert.ok(await s.getPage('https://x.test/en/p'))
  assert.deepEqual(await s.changesFor('a'), [], 'its changes go with it')
})

test('changes: unseen count is per sticker, markSeen clears it', async () => {
  const s = openWatchStore({ win: {} })
  await s.addChange({ stickerKey: 'a', targetId: 't', kind: 'card', detectedAt: 1 })
  await s.addChange({ stickerKey: 'a', targetId: 't', kind: 'page', detectedAt: 2 })
  await s.addChange({ stickerKey: 'b', targetId: 'u', kind: 'gone', detectedAt: 3 })
  assert.equal(await s.unseenCount(), 2, 'two stickers with unseen changes')
  assert.deepEqual((await s.unseenStickers()).sort(), ['a', 'b'])
  const a = await s.changesFor('a')
  assert.equal(a.length, 2)
  assert.ok(a.every((c) => c.seenAt === null && Number.isFinite(c.id)))
  await s.markSeen(['a'], 10)
  assert.equal(await s.unseenCount(), 1)
  assert.ok((await s.changesFor('a')).every((c) => c.seenAt === 10))
})

test('meta: get and set', async () => {
  const s = openWatchStore({ win: {} })
  assert.equal(await s.getMeta('run'), null)
  await s.setMeta('run', { lastRunAt: 5, blockedUntil: null })
  assert.deepEqual(await s.getMeta('run'), { lastRunAt: 5, blockedUntil: null })
})

test('subscribe: this tab hears its writes that matter, another tab hears them on the channel', async () => {
  const BroadcastChannel = bus()
  const a = openWatchStore({ win: { BroadcastChannel } })
  const b = openWatchStore({ win: { BroadcastChannel } })
  const heardA = []
  const heardB = []
  a.subscribe((m) => heardA.push(m))
  b.subscribe((m) => heardB.push(m))
  await a.addWatch(watchRow('a'))
  await a.addChange({ stickerKey: 'a', targetId: 't', kind: 'card', detectedAt: 1 })
  await a.markSeen(['a'])
  await a.setMeta('run', { lastRunAt: 1 })
  await a.removeWatch('a')
  assert.equal(heardA.length, 4, 'meta writes are not news')
  assert.ok(heardA.every((m) => m.type === 'changed'))
  assert.equal(heardB.length, 4)
  const off = b.subscribe(() => assert.fail('unsubscribed'))
  off()
  await a.reset()
  assert.equal(heardB.length, 5, 'reset is told too')
})

test('no page text: rows keep only what the design lists', async () => {
  const s = openWatchStore({ win: {} })
  await s.addChange({ stickerKey: 'a', targetId: 't', kind: 'card', detectedAt: 1, text: 'secret page text' })
  const [c] = await s.changesFor('a')
  assert.deepEqual(Object.keys(c).sort(), ['detectedAt', 'id', 'kind', 'seenAt', 'stickerKey', 'targetId'])
  await s.linkTarget({ id: 't', kind: 'page', url: 'https://x.test/en/p', text: 'secret' }, 'a')
  assert.equal((await s.getTarget('t')).text, undefined)
})

test('reset empties everything', async () => {
  const s = openWatchStore({ win: {} })
  await s.addWatch(watchRow('a'))
  await s.linkTarget({ id: 't', kind: 'card', url: 'https://x.test/en/a' }, 'a')
  await s.addChange({ stickerKey: 'a', targetId: 't', kind: 'card', detectedAt: 1 })
  await s.setMeta('run', { lastRunAt: 1 })
  await s.reset()
  assert.deepEqual(await s.listWatches(), [])
  assert.deepEqual(await s.listTargets(), [])
  assert.deepEqual(await s.listPages(), [])
  assert.equal(await s.unseenCount(), 0)
  assert.equal(await s.getMeta('run'), null)
  await s.addWatch(watchRow('b'))
  assert.equal((await s.listWatches()).length, 1, 'still usable after a reset')
})
