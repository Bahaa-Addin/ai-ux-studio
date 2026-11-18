// What the page watch says on a sticker (src/watch/ui.js's describe(); voice-guide ADR-0078 point 8,
// phase 6 design §4.6, §4.7): the state of a sticker's watch and its changes, turned into its lines,
// without a DOM. The DOM side runs in Chromium (voice-guide tests/integration/watch-ui.test.ts).
import test from 'node:test'
import assert from 'node:assert/strict'

import { describe, openHrefOf, unseenKeys } from '../src/watch/ui.js'
import { wordsFor } from '../src/watch/words.js'

const ORIGIN = 'https://web.vodafone.com.eg'
const OCT23 = Date.UTC(2026, 9, 23, 10)
const NOV18 = Date.UTC(2026, 10, 18, 10)
const en = wordsFor('en')
const ar = wordsFor('ar')

const record = (over = {}) => ({
  key: 'k1',
  id: 'card-1',
  copy: { title: 'Mega 1400', lang: 'en', dir: 'ltr' },
  cta: { label: null, href: `${ORIGIN}/en/mobile-internet-bundles` },
  source: { page: '/home', path: '/en/home', site: 'web' },
  ...over,
})
const watch = (over = {}) => ({ key: 'k1', lang: 'en', from: 'sticker', cardTargetId: `card k1 ${ORIGIN}/en/home`, pageTargetId: `page ${ORIGIN}/en/mobile-internet-bundles`, pageNote: null, baselineAt: OCT23, ...over })
const change = (over = {}) => ({ id: 1, stickerKey: 'k1', targetId: `page ${ORIGIN}/en/mobile-internet-bundles`, kind: 'page', detectedAt: NOV18, seenAt: null, ...over })
const texts = (d) => d.lines.map((l) => l.text)

test('a web sticker with no watch offers "Tell me when this changes"; a shop sticker offers nothing', () => {
  const d = describe({ record: record() }, en)
  assert.equal(d.tell, true)
  assert.equal(d.stop, false)
  assert.equal(d.tag, null)
  assert.deepEqual(d.lines, [])
  assert.equal(describe({ record: record({ source: { page: '/x', path: '/x', site: 'shop' } }) }, en), null)
  assert.equal(describe({ record: null }, en), null)
})

test('a refusal is said politely under the button, which stays', () => {
  assert.deepEqual(texts(describe({ record: record(), refusal: 'max-watched', maxWatched: 20 }, en)), ['You are watching 20, the most at once'])
  assert.deepEqual(texts(describe({ record: record(), refusal: 'not-allowed' }, en)), ['Its page can’t be watched'])
  assert.deepEqual(texts(describe({ record: record(), refusal: 'no-rules' }, en)), ['Watching isn’t available right now'])
  assert.deepEqual(texts(describe({ record: record(), refusal: 'shop' }, en)), ['Watching isn’t available right now'])
  assert.equal(describe({ record: record(), refusal: 'no-rules' }, en).tell, true)
})

test('watching: "Watching · No change since" its baseline, with "Stop watching"; before the baseline, "Watching"', () => {
  const d = describe({ record: record(), watch: watch() }, en)
  assert.equal(d.tell, false)
  assert.equal(d.stop, true)
  assert.equal(d.tag, null)
  assert.deepEqual(texts(d), ['Watching · No change since 23 Oct'])
  assert.equal(d.open, null)
  assert.deepEqual(texts(describe({ record: record(), watch: watch({ baselineAt: null }) }, en)), ['Watching'])
})

test('card only: the page note under the line', () => {
  const d = describe({ record: record(), watch: watch({ pageTargetId: null, pageNote: 'script' }) }, en)
  assert.deepEqual(texts(d), ['Watching · No change since 23 Oct', 'Its page is drawn by script, so only the card is watched'])
  assert.equal(d.lines[1].quiet, true)
  for (const note of ['other-site', 'not-allowed', 'no-link']) assert.equal(describe({ record: record(), watch: watch({ pageTargetId: null, pageNote: note }) }, en).lines[1].text, en(note))
})

test('an unseen change: the "Changed" tag, what changed and when, and "Open the page"', () => {
  const d = describe({ record: record(), watch: watch(), changes: [change()] }, en)
  assert.equal(d.tag, 'Changed')
  assert.deepEqual(texts(d), ['The page it opens changed · 18 Nov'])
  assert.equal(d.open, `${ORIGIN}/en/mobile-internet-bundles`)
  assert.equal(d.stop, true)
  for (const [kind, words] of [['card', 'This card changed'], ['link', 'It now opens a different page'], ['missing', 'No longer on its page'], ['gone', 'Its page is gone'], ['back', 'Back on its page']]) assert.equal(describe({ record: record(), watch: watch(), changes: [change({ kind })] }, en).lines[0].text, `${words} · 18 Nov`)
})

test('the latest unseen change is the one said', () => {
  const d = describe({ record: record(), watch: watch(), changes: [change({ id: 1, kind: 'card', detectedAt: NOV18 - 86400_000 }), change({ id: 2, kind: 'gone' })] }, en)
  assert.deepEqual(texts(d), ['Its page is gone · 18 Nov'])
})

test('after it was seen: a quiet "Changed 18 Nov" until the next change', () => {
  const d = describe({ record: record(), watch: watch(), changes: [change({ seenAt: NOV18 + 1000 })] }, en)
  assert.equal(d.tag, null)
  assert.deepEqual(texts(d), ['Watching · Changed 18 Nov'])
  assert.equal(d.lines[0].quiet, true)
  assert.equal(d.open, null)
})

test('"Open the page" goes where the change is: the card\'s page, or the page it opens now', () => {
  const r = record()
  assert.equal(openHrefOf('card', watch(), r, ORIGIN), `${ORIGIN}/en/home`)
  assert.equal(openHrefOf('missing', watch(), r, ORIGIN), `${ORIGIN}/en/home`)
  assert.equal(openHrefOf('page', watch(), r, ORIGIN), `${ORIGIN}/en/mobile-internet-bundles`)
  // Re-pointed after a link change: the page it opens now, not the one the sticker kept.
  assert.equal(openHrefOf('link', watch({ pageTargetId: `page ${ORIGIN}/en/new-bundles` }), r, ORIGIN), `${ORIGIN}/en/new-bundles`)
  // No page target: the link the sticker kept, else its card's page.
  assert.equal(openHrefOf('gone', watch({ pageTargetId: null }), r, ORIGIN), `${ORIGIN}/en/mobile-internet-bundles`)
  assert.equal(openHrefOf('page', watch({ pageTargetId: null }), record({ cta: null }), ORIGIN), `${ORIGIN}/en/home`)
})

test('Arabic: the same lines in Arabic', () => {
  const r = record({ copy: { title: 'ميجا 1400', lang: 'ar', dir: 'rtl' }, source: { page: '/home', path: '/ar/home', site: 'web' } })
  assert.deepEqual(texts(describe({ record: r, watch: watch() }, ar)), [`بنتابعها · مفيش تغيير من ${ar.date(OCT23)}`])
  const d = describe({ record: r, watch: watch(), changes: [change()] }, ar)
  assert.equal(d.tag, 'اتغيّرت')
  assert.deepEqual(texts(d), [`الصفحة اللي بتفتحها اتغيّرت · ${ar.date(NOV18)}`])
})

test('busy while a press is being answered', () => {
  assert.equal(describe({ record: record(), busy: true }, en).busy, true)
  assert.equal(describe({ record: record() }, en).busy, false)
})

test('unseenKeys: the stickers with an unseen change that are still in the pocket, once each', () => {
  const rows = [change({ stickerKey: 'a' }), change({ stickerKey: 'a', id: 2 }), change({ stickerKey: 'b', seenAt: 1 }), change({ stickerKey: 'c' })]
  assert.deepEqual(unseenKeys(rows), ['a', 'c'])
  assert.deepEqual(unseenKeys(rows, (key) => key !== 'c'), ['a'])
  assert.deepEqual(unseenKeys([]), [])
})
