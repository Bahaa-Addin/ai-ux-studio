/**
 * The clone's Pocket store (src/pocket/ids-store.js): the ids-only localStorage list the Services
 * clone has always kept, behind the live store's interface (voice-guide ADR-0051, ADR-0052), so the
 * clone's suites (pocket_e2e.py, portal_e2e.py) see exactly what they saw before.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createIdsStore, IDS_KEY } from '../src/pocket/ids-store.js'
import { recordFrom } from '../src/pocket/record.js'

const memory = (seed = {}) => {
  const data = new Map(Object.entries(seed))
  return { localStorage: { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, String(v)), removeItem: (k) => data.delete(k) }, data }
}
const item = (id, extra = {}) => ({ id, title: id, description: null, image: null, cta: { label: 'Know more', href: `https://web.vodafone.com.eg/spa/${id}` }, ...extra })
const catalog = new Map([
  ['roaming', { item: item('roaming'), section: { id: 'abroad', title: 'Call & Connect abroad' } }],
  ['cash', { item: item('cash', { cta: null }), section: { id: 'cash', title: 'Cash', cta: { label: 'Discover', href: 'https://web.vodafone.com.eg/en/vodafone-cash' } } }],
])
const page = { path: '/en/services', lang: 'en', dir: 'ltr', title: 'Services' }

test('reads only ids of cards on this page, in order, and makes each record from its card', () => {
  const win = memory({ [IDS_KEY]: JSON.stringify(['cash', 'gone', 7, 'roaming']) })
  const store = createIdsStore({ catalog, page, win })
  assert.deepEqual(store.all().map((r) => r.key), ['cash', 'roaming'])
  const cash = store.get('cash')
  assert.deepEqual([cash.id, cash.copy.title, cash.source.section.title], ['cash', 'cash', 'Cash'])
  assert.deepEqual(cash.cta, { label: 'Discover', href: 'https://web.vodafone.com.eg/en/vodafone-cash' }, 'a card without a link of its own keeps its section\'s')
  assert.equal(store.get('gone'), null)
})

test('writes the ids back as before, and tells its subscribers at once', async () => {
  const win = memory()
  const store = createIdsStore({ catalog, page, win })
  const seen = []
  store.subscribe((list) => seen.push(list.map((r) => r.key).join(',')))
  await store.put(recordFrom({ item: catalog.get('roaming').item, section: catalog.get('roaming').section, page, key: 'roaming' }))
  await store.put(recordFrom({ item: catalog.get('cash').item, section: catalog.get('cash').section, page, key: 'cash' }))
  assert.equal(win.data.get(IDS_KEY), '["roaming","cash"]')
  await store.remove('roaming')
  assert.equal(win.data.get(IDS_KEY), '["cash"]')
  await store.clear()
  assert.equal(win.data.get(IDS_KEY), '[]')
  assert.deepEqual(seen, ['roaming', 'roaming,cash', 'cash', ''])
  await assert.rejects(store.put({ key: 'not-here' }), /not a card on this page/)
})

test('storage that throws (private mode) keeps the Pocket for this visit', async () => {
  const win = { localStorage: { getItem: () => { throw new Error('denied') }, setItem: () => { throw new Error('denied') } } }
  const store = createIdsStore({ catalog, page, win })
  assert.deepEqual(store.all(), [])
  await store.put(recordFrom({ item: catalog.get('roaming').item, section: null, page, key: 'roaming' }))
  assert.deepEqual(store.all().map((r) => r.key), ['roaming'])
})
