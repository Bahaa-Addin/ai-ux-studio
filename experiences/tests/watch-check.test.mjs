// The page watch's check on visit (src/watch/check.js; voice-guide ADR-0078 points 1, 5, 6, 10; phase 6
// design §4.4): every rule of the run on fakes at the edges only.
//
// What is real and what is not, so the tests stay honest:
// - Real: the checker, the in-memory store (src/watch/store.js), read.js's findCard, cardDigest and
//   pageDigest (so the hashes are the real SHA-256 of masked text), mask.js, url.js and robots.js.
// - Fake: fetch (answers per URL, records every request with the fake clock's time), the clock and
//   sleep (sleep moves the clock), idle, Web Locks, and the parsed Document: node has no DOMParser, so
//   `parse` turns a small JSON page description into as much of a Document as read.js touches
//   (#main-content's text nodes and links, no canonical), and the adapter's readPage and the Pocket's
//   reconcile are stand-ins that read the page description's cards (Chromium runs the real ones on the
//   saved pages in voice-guide tests/integration/watch-read.test.ts).
import test from 'node:test'
import assert from 'node:assert/strict'

import { createChecker, KIND_ORDER } from '../src/watch/check.js'
import { openWatchStore } from '../src/watch/store.js'
import { maskContent } from '../src/watch/mask.js'
import { READER_VERSION } from '../src/watch/read.js'

const ORIGIN = 'https://web.vodafone.com.eg'
const RULES = { include: ['^/(en|ar)/'], exclude: ['nudge'], origin: ORIGIN, minIntervalMin: 30, perVisitMax: 12, spacingMs: 1000, maxWatched: 20, minChars: 200 }
const LONG = 'Bundles for every day of the month, with minutes, units and gigabytes that last. '.repeat(4)

// ---- a page as the fake server sends it: JSON the fake parser reads ----
const html = ({ main = LONG, links = [], cards = [], noMain = false } = {}) => JSON.stringify({ main: noMain ? null : main, links, cards })

const el = (tag, attrs, children) => ({ nodeType: 1, tagName: tag, childNodes: children, getAttribute: (n) => attrs[n] ?? null, matches: () => false })
const textNode = (s) => ({ nodeType: 3, nodeValue: s })
const parse = (s) => {
  const d = JSON.parse(s)
  const main = d.main == null ? null : el('DIV', { id: 'main-content' }, [textNode(d.main), ...d.links.map((h) => el('A', { href: h }, [textNode(' link ')]))])
  return { cards: d.cards, getElementById: (id) => (id === 'main-content' ? main : null), querySelector: () => null }
}
/** The adapter's readPage, stood in: one section with the page description's cards. */
const read = (doc) => ({ model: { sections: [{ id: 's', items: doc.cards.map((c) => ({ id: c.id, kind: 'card', title: c.title, description: c.description ?? null, cta: c.href ? { label: 'More', href: c.href } : null })) }] } })
/** The Pocket's reconcile, stood in: the card with the record's id. */
const reconcile = (records, model) => {
  const ids = new Map()
  for (const r of records) for (const s of model.sections) for (const i of s.items) if (i.id === r.id) ids.set(r.key, i.id)
  return { ids }
}

const record = (key, { path = '/en/home', id = `card-${key}`, href = `${ORIGIN}/en/bundles`, site = 'web', lang = 'en' } = {}) => ({
  v: 2,
  key,
  id,
  kind: 'card',
  keys: [],
  copy: { title: `Card ${key}`, description: null, lang, dir: 'ltr' },
  image: null,
  cta: href ? { label: 'More', href } : null,
  source: { site, page: `${site}:${path}`, path, pageId: null, title: {}, section: null },
  origin: 'person',
  savedAt: 1,
  seenAt: 1,
})

/** A server: `pages` maps URL → { status, body, headers, url (final), redirected }; every request is recorded. */
const server = (clock, pages) => {
  const requests = []
  const fetchImpl = async (url, init) => {
    requests.push({ url, init, at: clock.t })
    if (init?.signal && !(init.signal instanceof AbortSignal)) throw new Error('signal is not an AbortSignal')
    const p = typeof pages[url] === 'function' ? pages[url](init) : pages[url]
    if (!p) return answer({ status: 404, body: 'not found' }, url)
    if (p.throws) throw new TypeError('network')
    return answer(p, url)
  }
  return { requests, fetchImpl, pages }
}
const answer = (p, url) => {
  const headers = new Map(Object.entries({ 'content-type': 'text/html; charset=utf-8', ...(p.headers || {}) }).map(([k, v]) => [k.toLowerCase(), v]))
  return { status: p.status ?? 200, ok: (p.status ?? 200) >= 200 && (p.status ?? 200) < 300, url: p.url ?? url, redirected: !!p.url && p.url !== url, headers: { get: (n) => headers.get(n.toLowerCase()) ?? null }, text: async () => p.body ?? '' }
}

const fakeLocks = () => {
  let held = false
  return {
    get held() {
      return held
    },
    hold: () => (held = true),
    async request(name, opts, fn) {
      assert.equal(name, 'aixc-watch-check')
      assert.equal(opts.ifAvailable, true)
      if (held) return fn(null)
      held = true
      try {
        return await fn({ name })
      } finally {
        held = false
      }
    },
  }
}

/** A world: a clock, a server, a store, the Pocket's records and a checker over them. */
const world = (pages = {}, over = {}) => {
  const clock = { t: Date.UTC(2026, 10, 18, 9) }
  const srv = server(clock, { [`${ORIGIN}/robots.txt`]: { status: 200, body: 'User-agent: *\nDisallow: /en/private', headers: { 'content-type': 'text/plain' } }, ...pages })
  const store = openWatchStore({ win: {} })
  const records = new Map()
  let idles = 0
  const checker = createChecker({
    store,
    read,
    reconcile,
    mask: maskContent,
    rules: RULES,
    recordFor: (key) => records.get(key) ?? null,
    fetchImpl: srv.fetchImpl,
    locks: fakeLocks(),
    now: () => clock.t,
    sleep: async (ms) => {
      clock.t += ms
    },
    idle: async () => {
      idles++
    },
    parse,
    connection: {},
    subtle: globalThis.crypto.subtle,
    log: () => {},
    ...over,
  })
  return {
    clock,
    srv,
    store,
    records,
    checker,
    get idles() {
      return idles
    },
    /** Pockets and watches a record. */
    async watch(r, opts) {
      records.set(r.key, r)
      return checker.watchSticker(r, opts)
    },
    later: (min) => (clock.t += min * 60_000),
    fetched: () => srv.requests.map((r) => r.url.replace(ORIGIN, '')),
  }
}

const homeWith = (cards, extra = {}) => ({ status: 200, body: html({ cards, ...extra }), headers: { etag: '"h1"', 'last-modified': 'Wed, 18 Nov 2026 08:00:00 GMT' } })
const bundles = (main = LONG, extra = {}) => ({ status: 200, body: html({ main, ...extra }), headers: { etag: '"b1"' } })
const cardA = { id: 'card-a', title: 'Super bundle', href: `${ORIGIN}/en/bundles` }

/** A world with sticker `a` on /en/home whose card opens /en/bundles, baselined. */
const baselined = async (over) => {
  const w = world({ [`${ORIGIN}/en/home`]: homeWith([cardA]), [`${ORIGIN}/en/bundles`]: bundles() }, over)
  const r = await w.watch(record('a'))
  assert.equal(r.ok, true, r.reason)
  const first = await w.checker.run({ force: true })
  assert.equal(first.ran, true, first.reason)
  assert.deepEqual(await w.store.changesFor('a'), [], 'the first check is a silent baseline')
  w.srv.requests.length = 0
  w.later(31)
  return w
}

test('the kinds in order of significance', () => {
  assert.deepEqual(KIND_ORDER, ['gone', 'missing', 'link', 'card', 'page', 'back'])
})

test('watchSticker: a card target on its own page and a page target on its link', async () => {
  const w = world()
  const r = await w.watch(record('a'), { from: 'sticker' })
  assert.equal(r.ok, true)
  const watch = await w.store.getWatch('a')
  assert.equal(watch.from, 'sticker')
  assert.equal(watch.lang, 'en')
  const card = await w.store.getTarget(watch.cardTargetId)
  assert.equal(card.kind, 'card')
  assert.equal(card.url, `${ORIGIN}/en/home`)
  const page = await w.store.getTarget(watch.pageTargetId)
  assert.equal(page.kind, 'page')
  assert.equal(page.url, `${ORIGIN}/en/bundles`)
  assert.equal(watch.pageNote ?? null, null)
})

test('watchSticker: no page target, with the reason, for /spa/, another site, an excluded page; none for the shop', async () => {
  const w = world()
  await w.watch(record('s', { href: `${ORIGIN}/spa/storeLocator` }))
  assert.equal((await w.store.getWatch('s')).pageNote, 'script')
  await w.watch(record('o', { href: 'https://eshop.vodafone.com.eg/en/phones' }))
  assert.equal((await w.store.getWatch('o')).pageNote, 'other-site')
  await w.watch(record('x', { href: `${ORIGIN}/en/nudge-offer` }))
  assert.equal((await w.store.getWatch('x')).pageNote, 'not-allowed')
  for (const k of ['s', 'o', 'x']) assert.equal((await w.store.getWatch(k)).pageTargetId ?? null, null)
  const shop = await w.watch(record('e', { site: 'shop', path: '/en/phones' }))
  assert.equal(shop.ok, false)
  assert.equal(shop.reason, 'shop')
})

test('watchSticker: at most maxWatched (20), refused with a reason; watching twice is one watch', async () => {
  const w = world()
  for (let i = 0; i < 20; i++) assert.equal((await w.watch(record(`k${i}`))).ok, true)
  const r = await w.watch(record('k20'))
  assert.equal(r.ok, false)
  assert.equal(r.reason, 'max-watched')
  const again = await w.watch(record('k0'))
  assert.equal(again.ok, true)
  assert.equal(again.already, true)
  assert.equal((await w.store.listWatches()).length, 20)
})

test('no watches: no run, no request', async () => {
  const w = world()
  const r = await w.checker.run()
  assert.equal(r.ran, false)
  assert.equal(r.reason, 'no-watches')
  assert.equal(w.srv.requests.length, 0)
})

test('throttle: a second run within minIntervalMin fetches nothing; force does; lastRunAt is set at the start', async () => {
  const w = await baselined()
  w.clock.t -= 31 * 60_000 - 10 * 60_000 // ten minutes after the baseline
  const r = await w.checker.run()
  assert.equal(r.reason, 'throttled')
  assert.equal(w.srv.requests.length, 0)
  const forced = await w.checker.run({ force: true })
  assert.equal(forced.ran, true)
  assert.ok(w.srv.requests.length > 0, 'a person\'s press checks at once')
  const run = await w.store.getMeta('run')
  assert.ok(run.lastRunAt <= w.srv.requests[0].at, 'set when the run starts')
})

test('saveData: no run', async () => {
  const connection = {}
  const w = await baselined({ connection })
  connection.saveData = true
  const r = await w.checker.run({ force: true })
  assert.equal(r.reason, 'save-data')
  assert.equal(w.srv.requests.length, 0)
})

test('blockedUntil ahead: no run, even forced', async () => {
  const w = await baselined()
  await w.store.setMeta('run', { lastRunAt: 0, blockedUntil: w.clock.t + 1000 })
  const r = await w.checker.run({ force: true })
  assert.equal(r.reason, 'blocked')
  assert.equal(w.srv.requests.length, 0)
})

test('the lock is held (another tab): no run; no Web Locks: no run', async () => {
  const w = await baselined()
  const locks = fakeLocks()
  locks.hold()
  const busy = createChecker({ store: w.store, read, reconcile, mask: maskContent, rules: RULES, recordFor: (k) => w.records.get(k), fetchImpl: w.srv.fetchImpl, locks, now: () => w.clock.t, sleep: async () => {}, idle: async () => {}, parse, connection: {}, subtle: crypto.subtle })
  assert.equal((await busy.run()).reason, 'locked')
  const none = createChecker({ store: w.store, read, reconcile, mask: maskContent, rules: RULES, recordFor: (k) => w.records.get(k), fetchImpl: w.srv.fetchImpl, locks: null, now: () => w.clock.t, sleep: async () => {}, idle: async () => {}, parse, connection: {}, subtle: crypto.subtle })
  assert.equal((await none.run()).reason, 'no-lock')
  assert.equal(w.srv.requests.length, 0)
})

test('no rules (no page-map answer): fail safe, no run, no watch', async () => {
  const w = world({}, { rules: () => null })
  assert.equal((await w.watch(record('a'))).reason, 'no-rules')
  await w.store.addWatch({ key: 'a', lang: 'en', createdAt: 1, from: 'sticker', cardTargetId: 't', baselineAt: null })
  assert.equal((await w.checker.run({ force: true })).reason, 'no-rules')
  assert.equal(w.srv.requests.length, 0)
})

test('no crypto.subtle (not a secure context): stops quietly', async () => {
  const w = await baselined()
  const insecure = createChecker({ store: w.store, read, reconcile, mask: maskContent, rules: RULES, recordFor: (k) => w.records.get(k), fetchImpl: w.srv.fetchImpl, locks: fakeLocks(), now: () => w.clock.t, sleep: async () => {}, idle: async () => {}, parse, connection: {}, subtle: null })
  const r = await insecure.run({ force: true })
  assert.equal(r.reason, 'insecure')
  assert.equal(w.srv.requests.length, 0)
})

test('fetches: robots once, then one at a time at least spacingMs apart; omit credentials, no-store, a timeout signal', async () => {
  const w = await baselined()
  await w.checker.run()
  const urls = w.fetched()
  assert.equal(urls[0], '/robots.txt')
  assert.equal(urls.filter((u) => u === '/robots.txt').length, 1, 'robots.txt once per run')
  assert.deepEqual(urls.slice(1).sort(), ['/en/bundles', '/en/home'])
  for (let i = 1; i < w.srv.requests.length; i++) assert.ok(w.srv.requests[i].at - w.srv.requests[i - 1].at >= 1000, `request ${i} is ${w.srv.requests[i].at - w.srv.requests[i - 1].at} ms after the one before`)
  for (const r of w.srv.requests) {
    assert.equal(r.init.credentials, 'omit')
    assert.ok(r.init.signal instanceof AbortSignal, 'a timeout signal')
  }
  for (const r of w.srv.requests.slice(1)) {
    assert.equal(r.init.cache, 'no-store')
    assert.equal(r.init.redirect, 'follow')
  }
})

test('conditional headers from the stored validators', async () => {
  const w = await baselined()
  await w.checker.run()
  const home = w.srv.requests.find((r) => r.url === `${ORIGIN}/en/home`)
  assert.equal(home.init.headers['If-None-Match'], '"h1"')
  assert.equal(home.init.headers['If-Modified-Since'], 'Wed, 18 Nov 2026 08:00:00 GMT')
  const b = w.srv.requests.find((r) => r.url === `${ORIGIN}/en/bundles`)
  assert.equal(b.init.headers['If-None-Match'], '"b1"')
})

test('a 304: no parse, targets unchanged, lastCheckedAt moves', async () => {
  const w = await baselined()
  w.srv.pages[`${ORIGIN}/en/home`] = { status: 304 }
  w.srv.pages[`${ORIGIN}/en/bundles`] = { status: 304 }
  const before = w.idles
  const r = await w.checker.run()
  assert.equal(r.ran, true)
  assert.equal(w.idles, before, 'nothing parsed')
  assert.deepEqual(await w.store.changesFor('a'), [])
  assert.equal((await w.store.getPage(`${ORIGIN}/en/home`)).lastCheckedAt, w.srv.requests.find((x) => x.url.endsWith('/en/home')).at)
})

test('a new target on a page already validated is fetched without validators, so it gets a baseline', async () => {
  const w = await baselined()
  const r2 = record('b', { id: 'card-b', href: `${ORIGIN}/en/bundles` })
  w.srv.pages[`${ORIGIN}/en/home`] = homeWith([cardA, { id: 'card-b', title: 'Other', href: `${ORIGIN}/en/bundles` }])
  await w.watch(r2)
  await w.checker.run({ force: true, onlyStickers: ['b'] })
  const home = w.srv.requests.find((r) => r.url === `${ORIGIN}/en/home`)
  assert.equal(home.init.headers['If-None-Match'], undefined)
  const t = await w.store.getTarget((await w.store.getWatch('b')).cardTargetId)
  assert.ok(t.hash, 'baseline taken')
})

test('perVisitMax: at most that many pages, oldest lastCheckedAt first', async () => {
  const pages = {}
  for (let i = 0; i < 5; i++) pages[`${ORIGIN}/en/p${i}`] = homeWith([{ id: `card-k${i}`, title: `T${i}`, href: `${ORIGIN}/en/p${i}` }])
  const w = world(pages, { rules: { ...RULES, perVisitMax: 2 } })
  for (let i = 0; i < 5; i++) await w.watch(record(`k${i}`, { path: `/en/p${i}`, href: `${ORIGIN}/en/p${i}` }))
  for (let i = 0; i < 5; i++) await w.store.putPage({ ...(await w.store.getPage(`${ORIGIN}/en/p${i}`)), lastCheckedAt: [50, 10, 40, null, 30][i] })
  await w.checker.run()
  assert.deepEqual(w.fetched(), ['/robots.txt', '/en/p3', '/en/p1'], 'never checked first, then the oldest')
})

test('one fetch per URL per run, shared by every target on it', async () => {
  const w = world({ [`${ORIGIN}/en/home`]: homeWith([cardA, { id: 'card-b', title: 'B', href: `${ORIGIN}/en/home` }]), [`${ORIGIN}/en/bundles`]: bundles() })
  await w.watch(record('a'))
  await w.watch(record('b', { id: 'card-b', href: `${ORIGIN}/en/home` }))
  const tA = await w.store.getTarget((await w.store.getWatch('a')).cardTargetId)
  const tB = await w.store.getTarget((await w.store.getWatch('b')).cardTargetId)
  assert.notEqual(tA.id, tB.id, 'two cards on one page are two targets')
  await w.checker.run({ force: true })
  assert.deepEqual(w.fetched().sort(), ['/en/bundles', '/en/home', '/robots.txt'], 'home once, for two card targets and a page target')
})

test('a 404: the page is gone, once', async () => {
  const w = await baselined()
  w.srv.pages[`${ORIGIN}/en/bundles`] = { status: 404 }
  await w.checker.run()
  const c = await w.store.changesFor('a')
  assert.equal(c.length, 1)
  assert.equal(c[0].kind, 'gone')
  assert.equal((await w.store.getTarget((await w.store.getWatch('a')).pageTargetId)).status, 'gone')
  w.later(31)
  await w.checker.run()
  assert.equal((await w.store.changesFor('a')).length, 1, 'gone is said once')
})

test('a redirect to another path: the page target is gone, the card on it missing', async () => {
  const w = await baselined()
  w.srv.pages[`${ORIGIN}/en/bundles`] = { ...bundles(), url: `${ORIGIN}/en/home` }
  await w.checker.run()
  assert.equal((await w.store.changesFor('a'))[0].kind, 'gone')
  const w2 = await baselined()
  w2.srv.pages[`${ORIGIN}/en/home`] = { ...homeWith([cardA]), url: `${ORIGIN}/en/other` }
  await w2.checker.run()
  const card = await w2.store.getTarget((await w2.store.getWatch('a')).cardTargetId)
  assert.equal(card.status, 'missing')
  assert.equal((await w2.store.changesFor('a'))[0].kind, 'missing')
})

test('a 403 (or 429, 503) stops the run and blocks for 24 h; nothing fetched after it', async () => {
  for (const status of [403, 429, 503]) {
    const w = await baselined()
    w.srv.pages[`${ORIGIN}/en/home`] = { status }
    w.srv.pages[`${ORIGIN}/en/bundles`] = { status }
    const r = await w.checker.run()
    assert.equal(r.reason, 'blocked-by-site')
    assert.equal(w.srv.requests.length, 2, `${status}: robots and the one page`)
    assert.equal((await w.store.getMeta('run')).blockedUntil, w.srv.requests[1].at + 24 * 3600_000)
    w.later(60)
    assert.equal((await w.checker.run({ force: true })).reason, 'blocked')
    assert.equal(w.srv.requests.length, 2)
  }
})

test('a challenge: a page that had #main-content comes back without it; the run stops', async () => {
  const w = await baselined()
  w.srv.pages[`${ORIGIN}/en/home`] = { status: 200, body: html({ noMain: true }) }
  w.srv.pages[`${ORIGIN}/en/bundles`] = { status: 200, body: html({ noMain: true }) }
  const r = await w.checker.run()
  assert.equal(r.reason, 'blocked-by-site')
  assert.equal(w.srv.requests.length, 2)
  assert.ok((await w.store.getMeta('run')).blockedUntil > w.clock.t)
  assert.deepEqual(await w.store.changesFor('a'), [], 'a challenge is not a change')
})

test('robots.txt: a 404 allows all; a 5xx stops the run; a disallowed page is not fetched', async () => {
  const w = await baselined()
  w.srv.pages[`${ORIGIN}/robots.txt`] = { status: 404 }
  assert.equal((await w.checker.run()).ran, true)
  assert.equal(w.srv.requests.length, 3)
  w.srv.requests.length = 0
  w.later(31)
  w.srv.pages[`${ORIGIN}/robots.txt`] = { status: 500 }
  assert.equal((await w.checker.run()).reason, 'robots-error')
  assert.equal(w.srv.requests.length, 1)
  w.srv.requests.length = 0
  w.later(31)
  w.srv.pages[`${ORIGIN}/robots.txt`] = { status: 200, body: 'User-agent: *\nDisallow: /en/bundles' }
  await w.checker.run()
  assert.deepEqual(w.fetched(), ['/robots.txt', '/en/home'])
  assert.equal((await w.store.getTarget((await w.store.getWatch('a')).pageTargetId)).status, 'not-allowed')
})

test('a network error skips that page and the run goes on', async () => {
  const w = await baselined()
  w.srv.pages[`${ORIGIN}/en/home`] = { throws: true }
  w.srv.pages[`${ORIGIN}/en/bundles`] = bundles(LONG + ' New price.')
  const r = await w.checker.run()
  assert.equal(r.ran, true)
  assert.equal(w.srv.requests.length, 3)
  assert.equal((await w.store.changesFor('a'))[0].kind, 'page')
})

test('card change: the fetched card reads differently', async () => {
  const w = await baselined()
  w.srv.pages[`${ORIGIN}/en/home`] = homeWith([{ ...cardA, title: 'Super bundle, now 20 GB' }])
  await w.checker.run()
  const c = await w.store.changesFor('a')
  assert.equal(c.length, 1)
  assert.equal(c[0].kind, 'card')
  assert.equal(c[0].seenAt, null)
  assert.equal(await w.store.unseenCount(), 1)
})

test('the card is hashed from the fetched item, never from the stored record', async () => {
  const w = await baselined()
  w.records.set('a', { ...w.records.get('a'), copy: { ...w.records.get('a').copy, title: 'An old title the sticker kept' } })
  await w.checker.run()
  assert.deepEqual(await w.store.changesFor('a'), [], 'the page did not change, so nothing changed')
})

test('page change: its text or its links', async () => {
  const w = await baselined()
  w.srv.pages[`${ORIGIN}/en/bundles`] = bundles(LONG + ' Now with more.')
  await w.checker.run()
  assert.equal((await w.store.changesFor('a'))[0].kind, 'page')
  const w2 = await baselined()
  w2.srv.pages[`${ORIGIN}/en/bundles`] = bundles(LONG, { links: ['/en/new-offer'] })
  await w2.checker.run()
  assert.equal((await w2.store.changesFor('a'))[0].kind, 'page')
})

test('a page region below minChars: not-static, no change', async () => {
  const w = world({ [`${ORIGIN}/en/home`]: homeWith([cardA]), [`${ORIGIN}/en/bundles`]: bundles('Short.') })
  await w.watch(record('a'))
  await w.checker.run({ force: true })
  w.srv.pages[`${ORIGIN}/en/bundles`] = bundles('Shorter.')
  w.later(31)
  await w.checker.run()
  assert.equal((await w.store.getTarget((await w.store.getWatch('a')).pageTargetId)).status, 'not-static')
  assert.deepEqual(await w.store.changesFor('a'), [])
})

test('link change: one "link" row, the page target re-pointed with a fresh baseline', async () => {
  const w = await baselined()
  w.srv.pages[`${ORIGIN}/en/home`] = homeWith([{ ...cardA, href: `${ORIGIN}/en/new-bundles` }])
  w.srv.pages[`${ORIGIN}/en/bundles`] = bundles(LONG + ' changed too')
  w.srv.pages[`${ORIGIN}/en/new-bundles`] = bundles('Something else entirely. '.repeat(20))
  await w.checker.run()
  const c = await w.store.changesFor('a')
  assert.equal(c.length, 1, 'one row per sticker per run')
  assert.equal(c[0].kind, 'link', 'link outranks page')
  const watch = await w.store.getWatch('a')
  const page = await w.store.getTarget(watch.pageTargetId)
  assert.equal(page.url, `${ORIGIN}/en/new-bundles`)
  assert.equal(await w.store.getPage(`${ORIGIN}/en/bundles`), null, 'the old page, no longer used, is gone')
  w.srv.requests.length = 0
  w.later(31)
  await w.checker.run()
  assert.ok(w.fetched().includes('/en/new-bundles'))
  assert.equal((await w.store.changesFor('a')).length, 1, 'the new page takes a baseline: no change for it')
  assert.ok((await w.store.getTarget(watch.pageTargetId)).hash)
})

test('missing: the card is no longer on its page, said once; back when it returns', async () => {
  const w = await baselined()
  w.srv.pages[`${ORIGIN}/en/home`] = homeWith([])
  await w.checker.run()
  assert.equal((await w.store.changesFor('a'))[0].kind, 'missing')
  w.later(31)
  await w.checker.run()
  assert.equal((await w.store.changesFor('a')).length, 1, 'missing is said once')
  w.srv.pages[`${ORIGIN}/en/home`] = homeWith([cardA])
  w.later(31)
  await w.checker.run()
  const c = await w.store.changesFor('a')
  assert.equal(c.length, 2)
  assert.equal(c[1].kind, 'back')
  assert.equal((await w.store.getTarget((await w.store.getWatch('a')).cardTargetId)).status, 'ok')
})

test('readerVersion: a target read with another version re-baselines silently', async () => {
  const w = await baselined()
  const watch = await w.store.getWatch('a')
  const t = await w.store.getTarget(watch.cardTargetId)
  assert.equal(t.readerVersion, READER_VERSION)
  await w.store.putTarget({ ...t, hash: 'from-an-older-reader', readerVersion: 'watch-read-0' })
  const p = await w.store.getTarget(watch.pageTargetId)
  await w.store.putTarget({ ...p, hash: 'older', linksHash: 'older', readerVersion: 'watch-read-0' })
  await w.checker.run()
  assert.deepEqual(await w.store.changesFor('a'), [])
  assert.equal((await w.store.getTarget(watch.cardTargetId)).readerVersion, READER_VERSION)
  assert.notEqual((await w.store.getTarget(watch.cardTargetId)).hash, 'from-an-older-reader')
  const home = w.srv.requests.find((r) => r.url === `${ORIGIN}/en/home`)
  assert.equal(home.init.headers['If-None-Match'], undefined, 'a re-baseline needs the page, not a 304')
})

test('one change per sticker per run: the most significant kind', async () => {
  const w = await baselined()
  w.srv.pages[`${ORIGIN}/en/home`] = homeWith([{ ...cardA, title: 'New title' }])
  w.srv.pages[`${ORIGIN}/en/bundles`] = { status: 410 }
  await w.checker.run()
  const c = await w.store.changesFor('a')
  assert.equal(c.length, 1)
  assert.equal(c[0].kind, 'gone')
})

test('validators, final and canonical URL, statuses and dates are stored; no page text', async () => {
  const w = await baselined()
  const p = await w.store.getPage(`${ORIGIN}/en/home`)
  assert.equal(p.etag, '"h1"')
  assert.equal(p.lastModified, 'Wed, 18 Nov 2026 08:00:00 GMT')
  assert.equal(p.finalUrl, `${ORIGIN}/en/home`)
  assert.equal(p.canonicalUrl, `${ORIGIN}/en/home`)
  assert.equal(p.status, 'ok')
  const t = await w.store.getTarget((await w.store.getWatch('a')).cardTargetId)
  assert.equal(t.href, `${ORIGIN}/en/bundles`)
  assert.ok(Number.isFinite(t.checkedAt) && Number.isFinite(t.baselineAt))
  assert.ok(Number.isFinite((await w.store.getWatch('a')).baselineAt), 'the watch says when its baseline was taken')
  const all = JSON.stringify([await w.store.listPages(), await w.store.listTargets(), await w.store.listWatches()])
  assert.ok(!all.includes('Bundles for every day') && !all.includes('Super bundle'), 'no page text anywhere')
})

test('parse happens at an idle slot', async () => {
  const w = await baselined()
  const before = w.idles
  await w.checker.run()
  assert.equal(w.idles - before, 2, 'one idle slot per parsed page')
})

test('removing a sticker removes its targets and stops fetching for it', async () => {
  const w = await baselined()
  await w.checker.unwatchSticker('a')
  assert.deepEqual(await w.store.listTargets(), [])
  assert.deepEqual(await w.store.listPages(), [])
  const r = await w.checker.run({ force: true })
  assert.equal(r.reason, 'no-watches')
  assert.equal(w.srv.requests.length, 0)
})

test('onlyStickers: a person\'s press checks only that sticker\'s pages', async () => {
  const w = world({ [`${ORIGIN}/en/home`]: homeWith([cardA]), [`${ORIGIN}/en/bundles`]: bundles(), [`${ORIGIN}/en/services`]: homeWith([{ id: 'card-b', title: 'B', href: null }]) })
  await w.watch(record('a'))
  await w.watch(record('b', { path: '/en/services', href: null }))
  await w.checker.run({ force: true, onlyStickers: ['b'] })
  assert.deepEqual(w.fetched(), ['/robots.txt', '/en/services'])
  assert.equal((await w.store.getWatch('b')).pageNote, 'no-link')
})
