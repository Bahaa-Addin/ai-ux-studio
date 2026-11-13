/**
 * The Pocket's sticker record and how a sticker finds its card again (src/pocket/record.js;
 * voice-guide ADR-0051). Pure: synthetic cards here; the saved Vodafone pages are checked in
 * voice-guide/tests/integration/live-adapter.test.ts.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isRecord, pageKeyOf, recordFrom, rematch, scoreOf, seen } from '../src/pocket/record.js'

const keys = (o) => Object.entries(o).map(([kind, value]) => ({ kind, value }))
const card = (id, k, extra = {}) => ({ id, title: extra.title || id, description: extra.description ?? null, image: extra.image ?? null, cta: extra.cta ?? { label: null, href: `https://web.vodafone.com.eg/en/${id}` }, kind: 'card-action', keys: keys(k) })
const model = (...sections) => ({ sections: sections.map(([id, items]) => ({ id, title: id, items })) })
const page = { path: '/en/services', lang: 'en', dir: 'ltr', title: 'Vodafone Services' }

test('one page whatever its language: the page key drops /en and /ar and a trailing slash', () => {
  assert.equal(pageKeyOf('/en/services'), '/services')
  assert.equal(pageKeyOf('/ar/services/'), '/services')
  assert.equal(pageKeyOf('/en'), '/')
  assert.equal(pageKeyOf('/spa/storeLocator'), '/spa/storeLocator')
  assert.equal(pageKeyOf('/english-page'), '/english-page', 'only a language segment is dropped')
})

test('a record keeps the copy as published, its picture, link, keys, source page and section, and the day', () => {
  const item = card('roaming', { link: '/spa/roaming', title: 'roaming' }, { title: 'Roaming', description: 'From EGP 50', image: { src: 'https://web.vodafone.com.eg/documents/1/roaming.png', alt: 'Roaming', width: 10 }, cta: { label: 'Know more', href: 'https://web.vodafone.com.eg/spa/roaming' } })
  const r = recordFrom({ item, section: { id: 'xsg0av63s0tv', title: 'Call & Connect abroad' }, page: { ...page, pageId: 'web.services' }, now: Date.UTC(2026, 10, 12), key: 's-1' })
  assert.equal(isRecord(r), true)
  assert.deepEqual(r.copy, { title: 'Roaming', description: 'From EGP 50', lang: 'en', dir: 'ltr' }, 'the price is kept as published (owner, 2026-11-13)')
  assert.deepEqual(r.image, { src: 'https://web.vodafone.com.eg/documents/1/roaming.png', alt: 'Roaming' })
  assert.deepEqual(r.cta, { label: 'Know more', href: 'https://web.vodafone.com.eg/spa/roaming' })
  assert.deepEqual(r.source, { page: '/services', path: '/en/services', pageId: 'web.services', title: { en: 'Vodafone Services' }, section: { id: 'xsg0av63s0tv', title: 'Call & Connect abroad' } })
  assert.deepEqual([r.savedAt, r.seenAt, r.origin, r.id], [Date.UTC(2026, 10, 12), Date.UTC(2026, 10, 12), 'person', 'roaming'])
  assert.equal(recordFrom({ item: { ...item, image: null, cta: null }, section: null, page }).image, null, 'a card without a picture keeps none')
  assert.deepEqual(recordFrom({ item: { ...item, image: { src: 'x.png', alt: '', fit: 'contain' } }, section: null, page }).image, { src: 'x.png', alt: '', fit: 'contain' }, 'how the picture is fitted, when the card says')
  assert.deepEqual(recordFrom({ item: { ...item, cta: { label: 'Open', href: null } }, section: { id: 's', cta: { label: 'All', href: 'https://web.vodafone.com.eg/en/all' } }, page }).cta, { label: 'All', href: 'https://web.vodafone.com.eg/en/all' }, 'a card that leads nowhere takes its section\'s link')
  assert.deepEqual(recordFrom({ item: { ...item, cta: { label: 'Details', href: null, opens: 'dialog' } }, section: null, page }).cta, { label: 'Details', href: null, opens: 'dialog' }, 'a card that opens the page\'s dialog says so')
  assert.equal(isRecord({ ...r, v: 1 }), false)
  assert.equal(isRecord({ ...r, copy: null }), false)
})

test('a sticker finds its card again when an editor adds a card sharing its link (AIXC-41)', () => {
  const saved = recordFrom({ item: card('spa-roaming', { link: '/spa/roaming', picture: 'roaming', title: 'roaming' }), section: { id: 's1' }, page })
  // A second card now links /spa/roaming too: the first card's id becomes its picture's name.
  const now = model(['s1', [card('roaming', { link: '/spa/roaming', picture: 'roaming', title: 'roaming' }), card('mini-call', { link: '/spa/roaming', picture: 'mini-call', title: 'mini call' })]])
  assert.deepEqual([...rematch([saved], now, { lang: 'en' })], [[saved.key, 'roaming']])
})

test('in the other language: titles do not count, but links, pictures, tabs and numbers do', () => {
  const saved = recordFrom({ item: card('mega-1400', { title: '1400 mega', tab: 'plus-37', digits: '1400' }), section: { id: 'bundles' }, page })
  // Two cards in one tab: the tab (+2) and the section (+1) for both, the unique number (+2) for one.
  const ar = model(['bundles', [card('1400', { title: '1400 ميجا', tab: 'plus-37', digits: '1400' }), card('3000', { title: '3000 ميجا', tab: 'plus-37', digits: '3000' })]])
  assert.deepEqual([...rematch([saved], ar, { lang: 'ar' })], [[saved.key, '1400']], 'the tab and its number: matched')
  // Only the tab and the section (3): enough only when the tab is the card's alone (the prepaid-lines cards).
  const alone = recordFrom({ item: card('prepaid', { title: 'prepaid lines', tab: 'lines' }), section: { id: 'bundles' }, page })
  assert.deepEqual([...rematch([alone], model(['bundles', [card('x', { title: 'خطوط', tab: 'lines' }), card('y', { title: 'أخرى', tab: 'other' })]]), { lang: 'ar' })], [[alone.key, 'x']], 'a tab of its own: 3 is enough')
  assert.deepEqual([...rematch([alone], model(['bundles', [card('x', { title: 'خطوط', tab: 'lines' }), card('y', { title: 'أخرى', tab: 'lines' })]]), { lang: 'ar' })], [], 'a shared tab and nothing else: no guess')
  const counts = new Map([['title 1400 mega', 1], ['digits 1400', 1]])
  const ctx = { counts, lang: 'ar', sectionId: 'other' }
  assert.equal(scoreOf(saved, card('x', { title: '1400 mega', digits: '1400' }), ctx).score, scoreOf(saved, card('x', { digits: '1400' }), ctx).score, 'an English title scores nothing on an Arabic page')
  assert.ok(scoreOf(saved, card('x', { title: '1400 mega', digits: '1400' }), { ...ctx, lang: 'en' }).score > scoreOf(saved, card('x', { digits: '1400' }), ctx).score, 'on an English page it does')
})

test('a card gone from the page, or two cards alike: no match, never a guess', () => {
  const saved = recordFrom({ item: card('shokran', { link: '/en/shokran', title: 'shokran' }), section: { id: 's' }, page })
  assert.deepEqual([...rematch([saved], model(['s', [card('other', { link: '/en/other', title: 'other' })]]), { lang: 'en' })], [], 'gone')
  const twins = model(['s', [card('a', { link: '/en/shokran' }), card('b', { link: '/en/shokran' })]])
  assert.deepEqual([...rematch([saved], twins, { lang: 'en' })], [], 'two cards score the same')
})

test('one card is one sticker: the better fit takes it', () => {
  const page2 = model(['s', [card('cash', { link: '/en/vodafone-cash', picture: 'cash', title: 'vodafone cash' })]])
  const exact = recordFrom({ item: card('cash', { link: '/en/vodafone-cash', picture: 'cash', title: 'vodafone cash' }), section: { id: 's' }, page, key: 'exact' })
  const loose = recordFrom({ item: card('old-cash', { link: '/en/vodafone-cash' }), section: { id: 'x' }, page, key: 'loose' })
  assert.deepEqual([...rematch([loose, exact], page2, { lang: 'en' })], [['exact', 'cash']])
  const again = seen(exact, 'cash', 5)
  assert.deepEqual([again.id, again.seenAt, again.savedAt, again.copy], ['cash', 5, exact.savedAt, exact.copy], 'seen again: the id and the day it was seen, the copy as saved')
})

test('numbers in the title tell products apart: a card without them is not the one with them', () => {
  const tab = (id, title, digits) => card(id, { title, tab: 'vf-plus-youtube', link: '/spa/miManagement', ...(digits ? { digits } : {}) })
  const saved = recordFrom({ item: tab('prepaid', 'vf plus youtube prepaid lines'), section: { id: 'b' }, page })
  const ar = model(['b', [tab('y25', 'يوتيوب 25 55', '25-55'), tab('y60', 'يوتيوب 60 100', '60-100'), tab('yp', 'يوتيوب خطوط الكارت')]])
  assert.deepEqual([...rematch([saved], ar, { lang: 'ar' })], [[saved.key, 'yp']], 'the one card without numbers')
  const flex = recordFrom({ item: tab('flex', 'flex from 25 to 55', '25-55'), section: { id: 'b' }, page })
  assert.deepEqual([...rematch([flex], ar, { lang: 'ar' })], [[flex.key, 'y25']], 'the one with the same numbers')
})

