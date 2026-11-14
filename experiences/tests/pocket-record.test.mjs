/**
 * The Pocket's sticker record and how a sticker finds its card again (src/pocket/record.js;
 * voice-guide ADR-0051). Pure: synthetic cards here; the saved Vodafone pages are checked in
 * voice-guide/tests/integration/live-adapter.test.ts.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { linkKeyOf } from '../src/host/live-adapter.js'
import { categoryOf, groupsOf, isRecord, onPage, pageKeyOf, reconcile, recordFrom, rematch, scoreOf, seen, siteOf, siteOfRecord } from '../src/pocket/record.js'

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
  assert.deepEqual(r.source, { site: 'web', page: '/services', path: '/en/services', pageId: 'web.services', title: { en: 'Vodafone Services' }, section: { id: 'xsg0av63s0tv', title: 'Call & Connect abroad' } })
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
  // The tab, the link every card in it shares, and the section (4): enough when the tab is the card's
  // alone (the prepaid-lines cards); the tab alone is one sign, and one sign is a guess (AIXC-54).
  const alone = recordFrom({ item: card('prepaid', { title: 'prepaid lines', tab: 'lines', link: '/spa/miManagement' }), section: { id: 'bundles' }, page })
  const lines = (tabY) => model(['bundles', [card('x', { title: 'خطوط', tab: 'lines', link: '/spa/miManagement' }), card('y', { title: 'أخرى', tab: tabY, link: '/spa/miManagement' })]])
  assert.deepEqual([...rematch([alone], lines('other'), { lang: 'ar' })], [[alone.key, 'x']], 'a tab of its own and the shared link: enough')
  assert.deepEqual([...rematch([alone], lines('lines'), { lang: 'ar' })], [], 'a shared tab and nothing else: no guess')
  const tabOnly = recordFrom({ item: card('prepaid', { title: 'prepaid lines', tab: 'lines' }), section: { id: 'bundles' }, page })
  assert.deepEqual([...rematch([tabOnly], model(['bundles', [card('x', { title: 'خطوط', tab: 'lines' }), card('y', { title: 'أخرى', tab: 'other' })]]), { lang: 'ar' })], [], 'the tab alone is one sign: no guess')
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


test('keys that disagree count against: a card sharing only a sticker\'s link or title is not its card (AIXC-54)', () => {
  // Vodafone's Arabic Mini Call card also links /spa/roaming: with Roaming gone, its sticker finds nothing.
  const roaming = recordFrom({ item: card('roaming', { link: '/spa/roaming', picture: 'roaming', title: 'خدمات التجوال' }), section: { id: 'abroad' }, page: { ...page, lang: 'ar' } })
  const withoutRoaming = model(['other', [card('mini-call', { link: '/spa/roaming', picture: 'mini call', title: 'خدمة الميني كول' })]])
  assert.deepEqual([...rematch([roaming], withoutRoaming, { lang: 'ar' })], [], 'the link agrees, the picture and the title do not')
  // Two English cards titled "Balance transfer": with one gone, the other is not it.
  const balance = recordFrom({ item: card('spa-balancetransfer', { link: '/spa/balanceTransfer', picture: 'transfer', title: 'balance transfer', tab: 'test' }), section: { id: 'w9' }, page })
  const twin = model(['w9', [card('mobile-repair', { link: '/shokran-services', picture: 'mobile repair', title: 'balance transfer', tab: 'test' })]])
  assert.deepEqual([...rematch([balance], twin, { lang: 'en' })], [], 'the title and the tab agree, the link and the picture do not')
  // A link alone, in the other language, is one sign.
  const dsl = recordFrom({ item: card('internetservices-dsl-bundles', { link: 'eshop.vodafone.com.eg/internetServices/dsl/bundles', title: 'dsl' }), section: { id: 'u' }, page })
  assert.deepEqual([...rematch([dsl], model(['u', [card('ubytreluayel-1', { link: 'eshop.vodafone.com.eg/internetServices/dsl/bundles', title: 'اتحكم في حسابك' })]]), { lang: 'ar' })], [], 'one sign: no guess')
})

test('two stickers that fit one card equally both go without it, whatever order they were kept in (AIXC-55)', () => {
  const ar = { ...page, lang: 'ar', path: '/ar/mobile-internet-bundles' }
  const control = recordFrom({ item: card('ubytreluayel-1', { link: 'eshop/dsl', title: 'اتحكم في حسابك' }), section: { id: 'u' }, page: ar, key: 'control' })
  const services = recordFrom({ item: card('dsl', { link: 'eshop/dsl', title: 'خدمات ال dsl', picture: 'dsl' }), section: { id: 'u' }, page: ar, key: 'services' })
  const en = model(['u', [card('internetservices-dsl-bundles', { link: 'eshop/dsl', title: 'dsl', picture: 'dsl' })]])
  assert.deepEqual([...rematch([control, services], en, { lang: 'en' })], [['services', 'internetservices-dsl-bundles']], 'the one with more in common takes it')
  const tied = recordFrom({ item: card('dsl', { link: 'eshop/dsl', title: 'خدمات ال dsl', picture: 'dsl' }), section: { id: 'u' }, page: ar, key: 'tied' })
  assert.deepEqual([...rematch([services, tied], en, { lang: 'en' })], [], 'equal fits: neither')
  assert.deepEqual([...rematch([tied, services], en, { lang: 'en' })], [], 'in either order')
})

test('a key other cards shared where the sticker was kept never becomes its own when they go (AIXC-63)', () => {
  // The RED page: three plans share one picture ('alll') and one link; two of them are retired.
  const red = (id, title) => card(id, { link: 'eshop/lines/red/numbers', picture: 'alll', title })
  const kept = model(['plans', [red('red-exclusive', 'red exclusive'), red('red-elite', 'red elite+'), red('red-prime', 'red prime+')]])
  const sticker = recordFrom({ item: kept.sections[0].items[0], section: kept.sections[0], page, model: kept })
  assert.deepEqual(sticker.keys.filter((k) => k.shared).map((k) => k.kind).sort(), ['link', 'picture'], 'the picture and the link were shared')
  const later = model(['plans', [red('red-elite', 'red elite+')]])
  assert.deepEqual([...rematch([sticker], later, { lang: 'en' })], [], 'RED Elite is not RED Exclusive, though it now has the picture alone')
  assert.equal(recordFrom({ item: kept.sections[0].items[0], section: kept.sections[0], page }).keys.some((k) => k.shared), false, 'without the page, nothing is marked')
})

test('records know their site: the shop\'s home is not the website\'s, two lists are two pages, the three spellings of a list are one (E5)', () => {
  assert.equal(pageKeyOf('/en/'), '/')
  assert.equal(pageKeyOf('/en/', { site: 'shop' }), 'shop:/')
  const list = (search) => pageKeyOf('/en/list', { site: 'shop', search })
  assert.notEqual(list('?categoryUrls=*smart-phones'), list('?categoryUrls=*tablets'))
  assert.equal(list('?categoryUrls=*smart-phones'), list('?categoryUrls=/smart-phones'))
  assert.equal(list('?categoryUrls=*smart-phones'), list('?categoryUrls=%2Fsmart-phones'))
  assert.equal(list('?categoryUrls=*smart-phones'), pageKeyOf('/ar/list', { site: 'shop', search: '?categoryUrls=*smart-phones' }), 'both languages')
  const shop = recordFrom({ item: { id: 'a', title: 'Galaxy A55', keys: [] }, page: { path: '/en/list', search: '?categoryUrls=*smart-phones', site: 'shop', lang: 'en' } })
  assert.equal(shop.source.site, 'shop')
  assert.equal(shop.source.page, 'shop:/list?c=smart-phones')
  assert.equal(isRecord(shop), true, 'still a version 2 record')
  // A record kept before E5 has no site: it is the website's, and its page key is unchanged.
  const old = { v: 2, key: 'k', id: 'x', copy: { title: 'T' }, source: { page: '/services', path: '/en/services' }, savedAt: 1 }
  assert.equal(isRecord(old), true)
  assert.equal(siteOfRecord(old), 'web')
})

test('a link into the shop has one key, read on the website or on the shop, whatever spelling its list uses (E5)', () => {
  const web = 'https://web.vodafone.com.eg'
  const shop = 'https://eshop.vodafone.com.eg'
  const a = linkKeyOf(`${shop}/en/list?categoryUrls=*smart-phones`, web, '/en/home')
  assert.equal(a, 'eshop.vodafone.com.eg/list?c=smart-phones')
  assert.equal(linkKeyOf(`${shop}/ar/list?categoryUrls=%2Fsmart-phones`, shop, '/ar/'), a, 'read on the shop, in Arabic, another spelling')
  assert.notEqual(linkKeyOf(`${shop}/en/list?categoryUrls=*tablets`, web, '/en/home'), a, 'another list, another link')
  // Website links keep the keys they had.
  assert.equal(linkKeyOf(`${web}/en/services`, web, '/en/home'), '/services')
  assert.equal(linkKeyOf('https://example.com/x', web, '/en/home'), null)
})

test('the adapter and the Pocket name a shop list the same way (two copies, one rule)', () => {
  for (const search of ['?categoryUrls=*smart-phones', '?categoryUrls=/smart-phones', '?categoryUrls=%2Fsmart-phones', '?categoryUrls=%252FTablets', '', '?x=1']) {
    const c = categoryOf(search)
    const link = linkKeyOf(`https://eshop.vodafone.com.eg/en/list${search}`, 'https://web.vodafone.com.eg', '/en/home')
    assert.equal(link, `eshop.vodafone.com.eg/list${c ? `?c=${c}` : ''}`, search)
  }
  assert.equal(siteOf('eshop.vodafone.com.eg'), 'shop')
  assert.equal(siteOf('web.vodafone.com.eg'), 'web')
})

test('a record belongs to the page it was kept on, in either language, on its own site (S6)', () => {
  const kept = recordFrom({ item: { id: 'cash-1', title: 'Cash', keys: [] }, page: { path: '/en/services', lang: 'en' } })
  assert.equal(onPage(kept, { path: '/en/services' }), true)
  assert.equal(onPage(kept, { path: '/ar/services' }), true, 'the same page in Arabic')
  assert.equal(onPage(kept, { path: '/en/home' }), false, 'another page, even with a card of the same id')
  assert.equal(onPage(kept, { path: '/en/services', site: 'shop' }), false, 'the shop is another site')
  const shop = recordFrom({ item: { id: 'a', title: 'A', keys: [] }, page: { path: '/en/list', search: '?categoryUrls=*tablets', site: 'shop', lang: 'en' } })
  assert.equal(onPage(shop, { path: '/ar/list', search: '?categoryUrls=%2Ftablets', site: 'shop' }), true)
  assert.equal(onPage(shop, { path: '/en/list', search: '?categoryUrls=*smart-phones', site: 'shop' }), false)
})

/* ---------------------------------------------------------------- S7: one Pocket across pages */

test('a page read again places its stickers on the cards they stand on now; the stored id is never rewritten (S7, AIXC-41)', () => {
  const saved = recordFrom({ item: card('spa-roaming', { link: '/spa/roaming', picture: 'roaming', title: 'roaming' }), section: { id: 's1' }, page, key: 'r' })
  const now = model(['s1', [card('roaming', { link: '/spa/roaming', picture: 'roaming', title: 'roaming' }), card('mini-call', { link: '/spa/roaming', picture: 'mini-call', title: 'mini call' })]])
  const out = reconcile([saved], now, { page })
  assert.deepEqual([...out.ids], [['r', 'roaming']], 'the card, though its id changed')
  assert.equal(out.missing.size, 0)
  assert.equal(saved.id, 'spa-roaming', 'the record keeps the id it was saved with: ids differ between languages, and two tabs would write them back and forth')
  assert.deepEqual(out.changed, [], 'nothing to write: the page name is already known')
})

test('stickers of other pages are left alone: not matched, not missing, not written (S7)', () => {
  const here = recordFrom({ item: card('a', { link: '/en/a', title: 'a' }), section: { id: 's' }, page, key: 'here' })
  const there = recordFrom({ item: card('b', { link: '/en/b', title: 'b' }), section: { id: 's' }, page: { ...page, path: '/en/vodafone-cash', title: 'Vodafone Cash' }, key: 'there' })
  const out = reconcile([here, there], model(['s', [card('a', { link: '/en/a', title: 'a' })]]), { page })
  assert.deepEqual([...out.ids], [['here', 'a']])
  assert.equal(out.missing.has('there'), false)
  assert.deepEqual(out.changed, [])
})

test('a sticker whose card is gone is missing; a sticker just made keeps its card even when the score cannot tell twins apart (S7)', () => {
  const gone = recordFrom({ item: card('shokran', { link: '/en/shokran', title: 'shokran' }), section: { id: 's' }, page, key: 'gone' })
  const twins = model(['s', [card('a', { link: '/en/same', title: 'same' }), card('b', { link: '/en/same', title: 'same' })]])
  const out = reconcile([gone], twins, { page })
  assert.deepEqual([...out.missing], ['gone'])
  // A sticker made on card "b" in this page view (its stored id has since changed): nothing tells the twins apart but where it was made.
  const made = { ...recordFrom({ item: twins.sections[0].items[1], section: twins.sections[0], page, model: twins, key: 'made' }), id: 'old-id' }
  assert.deepEqual([...reconcile([made], twins, { page }).missing], ['made'], 'the score alone cannot place it')
  const alone = reconcile([made], twins, { page, kept: new Map([['made', 'b']]) })
  assert.deepEqual([...alone.ids], [['made', 'b']], 'it stays on the card it was made on')
  assert.equal(reconcile([made], model(['s', [card('a', { link: '/en/same', title: 'same' })]]), { page, kept: new Map([['made', 'b']]) }).missing.has('made'), true, 'but not on a card that has gone')
  // Two stickers cannot stand on one card: the kept card is not given twice.
  const other = recordFrom({ item: card('c', { link: '/en/same', title: 'same' }), section: { id: 's' }, page, key: 'other' })
  const both = reconcile([made, other], twins, { page, kept: new Map([['made', 'b'], ['other', 'b']]) })
  assert.equal(new Set(both.ids.values()).size, both.ids.size, 'one card, one sticker')
})

test('the page\'s own name is added in the language it is read in, once (S7)', () => {
  const saved = recordFrom({ item: card('a', { link: '/en/a', title: 'a' }), section: { id: 's' }, page: { ...page, title: 'Services' }, key: 'k' })
  const ar = { ...page, path: '/ar/services', lang: 'ar', dir: 'rtl', title: 'الخدمات' }
  const out = reconcile([saved], model(['s', [card('a', { link: '/en/a', title: 'a' })]]), { page: ar })
  assert.deepEqual(out.changed.map((r) => r.source.title), [{ en: 'Services', ar: 'الخدمات' }])
  assert.deepEqual(saved.source.title, { en: 'Services' }, 'a new record, the old one untouched')
  assert.deepEqual(reconcile(out.changed, model(['s', []]), { page: ar }).changed, [], 'already known: nothing more to write')
})

test('the album groups stickers by the page they were kept on, this page first, then by the newest sticker (S7)', () => {
  const at = (id, path, title, savedAt, lang = 'en') => recordFrom({ item: card(id, { link: `/${id}` }), section: { id: 's' }, page: { path, lang, dir: lang === 'ar' ? 'rtl' : 'ltr', title }, now: savedAt, key: id })
  const rs = [at('a', '/en/mobile-internet-bundles', 'Mobile Internet Bundles', 10), at('b', '/en/vodafone-cash', 'Vodafone Cash', 30), at('c', '/ar/mobile-internet-bundles', 'باقات الإنترنت', 20, 'ar'), at('d', '/en/home', 'Home', 5)]
  const groups = groupsOf(rs, { path: '/en/home', lang: 'en', site: 'web' })
  assert.deepEqual(groups.map((g) => g.key), ['/home', '/vodafone-cash', '/mobile-internet-bundles'], 'this page first, then the newest')
  assert.deepEqual(groups.map((g) => g.here), [true, false, false])
  assert.deepEqual(groups[2].records.map((r) => r.key), ['c', 'a'], 'both languages of one page are one group, newest first')
  assert.deepEqual(groups[2].title, { text: 'Mobile Internet Bundles', lang: 'en', dir: 'ltr' }, 'named in the page\'s language')
  const inArabic = groupsOf(rs, { path: '/ar/home', lang: 'ar', site: 'web' })
  assert.deepEqual(inArabic.find((g) => g.key === '/mobile-internet-bundles').title, { text: 'باقات الإنترنت', lang: 'ar', dir: 'rtl' }, 'in Arabic, the Arabic name when a sticker knows it')
  assert.deepEqual(inArabic.find((g) => g.key === '/vodafone-cash').title, { text: 'Vodafone Cash', lang: 'en', dir: 'ltr' }, 'else the name it has, said to be English')
  assert.equal(groupsOf([{ ...rs[0], source: { ...rs[0].source, title: {} } }], { path: '/en/home', lang: 'en' })[0].title, null, 'no name known')
  const shop = recordFrom({ item: card('x', {}), section: null, page: { path: '/en/list', search: '?categoryUrls=*smart-phones', site: 'shop', lang: 'en', title: 'Smart phones' }, key: 'x' })
  assert.deepEqual(groupsOf([shop, rs[0]], { path: '/en/mobile-internet-bundles', lang: 'en', site: 'web' }).map((g) => g.key), ['/mobile-internet-bundles', 'shop:/list?c=smart-phones'], 'the shop\'s lists are pages of their own')
})
