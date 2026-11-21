// Reading and hashing for the page watch (src/watch/read.js; voice-guide ADR-0078 point 4, phase 6
// design §4.2): the region is #main-content only, text is normalised, masked, then hashed; a card is
// hashed from the adapter's reading of it. The fake DOM below is as much of a parsed Document as
// read.js touches; Chromium runs the real thing on the saved pages (voice-guide
// tests/integration/watch-read.test.ts).
import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'

import { READER_VERSION, cardDigest, findCard, normaliseText, pageDigest, region, sha256, staticEnough } from '../src/watch/read.js'
import { maskContent } from '../src/watch/mask.js'

const ORIGIN = 'https://web.vodafone.com.eg'
const hex = (s) => createHash('sha256').update(s, 'utf8').digest('hex')

// ---- a tiny DOM: elements, text, simple selectors (tag, .class.class, [attr], comma lists) ----
const matchesOne = (el, sel) => {
  const m = /^([a-z0-9]*)((?:\.[\w-]+)*)((?:\[[\w-]+\])*)$/i.exec(sel.trim())
  if (!m) throw new Error(`fake DOM: unsupported selector ${sel}`)
  const [, tag, classes, attrs] = m
  if (tag && el.tagName.toLowerCase() !== tag.toLowerCase()) return false
  const cls = (el.attrs.class || '').split(/\s+/)
  if (classes && !classes.split('.').filter(Boolean).every((c) => cls.includes(c))) return false
  if (attrs && !attrs.slice(1, -1).split('][').every((a) => a in el.attrs)) return false
  return true
}
const el = (tag, attrs = {}, ...children) => {
  const node = {
    nodeType: 1,
    tagName: tag.toUpperCase(),
    attrs,
    childNodes: children.map((c) => (typeof c === 'string' ? { nodeType: 3, nodeValue: c } : c)),
    getAttribute: (n) => (n in attrs ? attrs[n] : null),
    matches: (sel) => sel.split(',').some((s) => matchesOne(node, s)),
  }
  return node
}
const walk = function* (n) {
  yield n
  for (const c of n.childNodes || []) yield* walk(c)
}
const docOf = (body, { canonical = null } = {}) => ({
  body,
  getElementById: (id) => [...walk(body)].find((n) => n.nodeType === 1 && n.attrs.id === id) || null,
  querySelector: (sel) => (/canonical/.test(sel) && canonical ? { getAttribute: () => canonical } : null),
})

const LONG = 'باقات الانترنت '.repeat(20)
const page = (...main) => docOf(el('body', {}, el('header', {}, 'Header text '.repeat(60)), el('div', { id: 'main-content', role: 'main' }, ...main), el('footer', {}, 'Footer '.repeat(80))))

test('READER_VERSION is a non-empty string (bump it when recognisers, normalisation or mask rules change)', () => {
  assert.equal(typeof READER_VERSION, 'string')
  assert.ok(READER_VERSION.length > 0)
})

test('normaliseText collapses every kind of whitespace and trims', () => {
  assert.equal(normaliseText('  a\n\t b  c  '), 'a b c')
  assert.equal(normaliseText(''), '')
  assert.equal(normaliseText(null), '')
})

test('sha256 is SHA-256 in lowercase hex of the UTF-8 text', async () => {
  assert.equal(await sha256('abc'), hex('abc'))
  assert.equal(await sha256('ڤودافون كاش'), hex('ڤودافون كاش'))
})

test('region: #main-content only, never the body (a /spa/ page\'s header and footer would pass the 200 test)', () => {
  const spa = docOf(el('body', {}, el('header', {}, 'Header text '.repeat(60)), el('div', { id: 'root' }), el('footer', {}, 'Footer '.repeat(80))))
  assert.equal(region(spa), null)
})

test('region leaves out script, style, template, noscript, svg, Owl copies, the layer\'s own and data-watch-ignore', () => {
  const doc = page(
    el('h1', {}, '  Internet   bundles '),
    el('script', {}, 'var x = 1'),
    el('style', {}, '.a{}'),
    el('template', {}, 'tpl'),
    el('noscript', {}, 'no js'),
    el('svg', {}, el('title', {}, 'icon')),
    el('div', { class: 'owl-item cloned' }, 'copy'),
    el('div', { class: 'owl-item' }, ' real '),
    el('div', { 'data-aixc': '' }, 'ours'),
    el('div', { 'data-watch-ignore': '' }, 'a clock 12:00'),
    el('p', {}, 'end'),
  )
  const r = region(doc)
  assert.equal(r.text, 'Internet bundles real end')
  assert.equal(r.chars, r.text.length)
  assert.equal(r.staticEnough, false)
})

test('staticEnough: at least 200 characters (the knob can change it)', () => {
  assert.equal(staticEnough('x'.repeat(199)), false)
  assert.equal(staticEnough('x'.repeat(200)), true)
  assert.equal(staticEnough('x'.repeat(50), 50), true)
  assert.equal(region(page(el('p', {}, LONG))).staticEnough, true)
  assert.equal(region(page(el('p', {}, 'x'.repeat(150))), { minChars: 100 }).staticEnough, true)
})

test('pageDigest: no mask, no hash (a page is never hashed unmasked)', async () => {
  await assert.rejects(() => pageDigest(page(el('p', {}, LONG)), { origin: ORIGIN }), TypeError)
})

test('pageDigest masks before it hashes', async () => {
  const doc = page(el('p', {}, `${LONG} call 01012345678 or write to a@b.co`))
  const seen = []
  const spy = (t) => (seen.push(t), maskContent(t))
  const d = await pageDigest(doc, { mask: spy, origin: ORIGIN })
  assert.equal(seen.length, 1)
  assert.match(seen[0], /01012345678/, 'the mask gets the normalised text')
  assert.equal(d.textHash, hex(maskContent(region(doc).text)))
  const raw = await pageDigest(doc, { mask: (t) => t, origin: ORIGIN })
  assert.notEqual(d.textHash, raw.textHash, 'masking changes what is hashed')
  // A different phone number is the same masked text: no personal data in the hash's input.
  const other = await pageDigest(page(el('p', {}, `${LONG} call 01198765432 or write to z@y.org`)), { mask: maskContent, origin: ORIGIN })
  assert.equal(other.textHash, d.textHash)
})

test('pageDigest: no #main-content, null', async () => {
  assert.equal(await pageDigest(docOf(el('body', {}, LONG)), { mask: maskContent, origin: ORIGIN }), null)
})

test('pageDigest hashes the sorted, normalised, de-duplicated same-origin links of the region', async () => {
  const a = (href) => el('a', { href }, 'link')
  const one = page(el('p', {}, LONG), a('/ar/services'), a('https://web.vodafone.com.eg/ar/vodafone-cash/'), a('/ar/services#x'), a('https://eshop.vodafone.com.eg/ar/x'), a('mailto:a@b.c'), el('div', { class: 'owl-item cloned' }, a('/ar/hidden-copy')))
  const two = page(el('p', {}, LONG), a('/ar/vodafone-cash?utm_source=x'), a('/ar/services'))
  const d1 = await pageDigest(one, { mask: maskContent, origin: ORIGIN, url: `${ORIGIN}/ar/home` })
  const d2 = await pageDigest(two, { mask: maskContent, origin: ORIGIN, url: `${ORIGIN}/ar/home` })
  assert.equal(d1.links, 2)
  assert.equal(d1.linksHash, hex([`${ORIGIN}/ar/services`, `${ORIGIN}/ar/vodafone-cash`].join('\n')))
  assert.equal(d1.linksHash, d2.linksHash, 'order, slashes, fragments and tracking do not count')
  const three = page(el('p', {}, LONG), a('/ar/services'))
  assert.notEqual((await pageDigest(three, { mask: maskContent, origin: ORIGIN })).linksHash, d1.linksHash)
})

test('pageDigest: a whitespace-only change is no change; a word is', async () => {
  const d1 = await pageDigest(page(el('p', {}, `${LONG}  999 EGP`)), { mask: maskContent, origin: ORIGIN })
  const d2 = await pageDigest(page(el('p', {}, `\n${LONG}\n\n999   EGP `)), { mask: maskContent, origin: ORIGIN })
  const d3 = await pageDigest(page(el('p', {}, `${LONG} 1099 EGP`)), { mask: maskContent, origin: ORIGIN })
  assert.equal(d1.textHash, d2.textHash)
  assert.notEqual(d1.textHash, d3.textHash)
})

// ---- the card ----

const ITEM = {
  id: 'mobile-internet-bundles',
  kind: 'card-collapsing',
  title: 'باقات الانترنت',
  description: '  اشترك  في باقات الانترنت ',
  image: { src: 'https://web.vodafone.com.eg/documents/20126/0/internet.png/abc-123?t=1698000000', alt: 'x', width: 10, height: 10 },
  cta: { label: 'اعرف أكتر', href: 'https://web.vodafone.com.eg/ar/mobile-internet-bundles/' },
  keys: [{ kind: 'link', value: '/mobile-internet-bundles' }],
}

test('cardDigest hashes the adapter\'s reading (title, description with its price, CTA label, picture file name), masked', async () => {
  const d = await cardDigest(ITEM, { mask: maskContent })
  assert.match(d.hash, /^[0-9a-f]{64}$/)
  assert.equal(d.href, `${ORIGIN}/ar/mobile-internet-bundles`, 'the link apart, normalised')
  const same = await cardDigest({ ...ITEM, id: 'another-id', description: 'اشترك في باقات الانترنت', image: { ...ITEM.image, src: 'https://web.vodafone.com.eg/documents/20126/0/internet.png/abc-123?t=1700000000', width: 99 }, keys: [] }, { mask: maskContent })
  assert.equal(same.hash, d.hash, 'id, keys, size, whitespace and the picture\'s cache query do not count')
  for (const change of [{ title: 'باقات' }, { description: 'اشترك · 25 جنيه' }, { cta: { ...ITEM.cta, label: 'اشترك' } }, { image: { ...ITEM.image, src: 'https://web.vodafone.com.eg/documents/20126/0/new.png/abc-124' } }])
    assert.notEqual((await cardDigest({ ...ITEM, ...change }, { mask: maskContent })).hash, d.hash, JSON.stringify(change))
  const moved = await cardDigest({ ...ITEM, cta: { ...ITEM.cta, href: `${ORIGIN}/ar/other` } }, { mask: maskContent })
  assert.equal(moved.hash, d.hash, 'a new link is the link\'s change, not the card\'s')
  assert.equal(moved.href, `${ORIGIN}/ar/other`)
})

test('cardDigest masks before it hashes, and refuses without a mask', async () => {
  const seen = []
  await cardDigest({ ...ITEM, description: 'call 01012345678' }, { mask: (t) => (seen.push(t), maskContent(t)) })
  assert.ok(seen.length >= 1 && seen.some((t) => t.includes('01012345678')))
  const a = await cardDigest({ ...ITEM, description: 'call 01012345678' }, { mask: maskContent })
  const b = await cardDigest({ ...ITEM, description: 'call 01198765432' }, { mask: maskContent })
  assert.equal(a.hash, b.hash)
  await assert.rejects(() => cardDigest(ITEM, {}), TypeError)
})

test('cardDigest reads a Pocket record as it reads the model item it was made from', async () => {
  const record = { v: 2, key: 's-1', id: ITEM.id, kind: ITEM.kind, keys: ITEM.keys, copy: { title: ITEM.title, description: ITEM.description, lang: 'ar', dir: 'rtl' }, image: { src: ITEM.image.src, alt: 'x' }, cta: ITEM.cta, source: { site: 'web', page: '/home', path: '/ar/home' } }
  assert.deepEqual(await cardDigest(record, { mask: maskContent }), await cardDigest(ITEM, { mask: maskContent }))
})

test('cardDigest: a card with no link or picture still hashes; its href is null', async () => {
  const d = await cardDigest({ id: 'x', title: 'T', description: null, image: null, cta: { label: null, href: null, opens: 'dialog' } }, { mask: maskContent })
  assert.match(d.hash, /^[0-9a-f]{64}$/)
  assert.equal(d.href, null)
})

test('findCard reads the fetched document with the injected readPage and finds the card with the injected reconcile', () => {
  const model = { sections: [{ id: 's1', title: 'Other services', items: [ITEM] }] }
  const doc = page(el('p', {}, LONG))
  const calls = []
  const read = (d, o) => (calls.push(['read', d, o]), { model, problems: [], coverage: {} })
  const reconcile = (records, m, o) => (calls.push(['reconcile', records, m, o]), { ids: new Map([[records[0].key, ITEM.id]]), missing: new Set(), changed: [] })
  const record = { key: 's-1', copy: { lang: 'ar' }, source: { path: '/ar/home', page: '/home' } }
  const r = findCard(doc, record, { read, reconcile, origin: ORIGIN })
  assert.equal(r.item, ITEM)
  assert.equal(r.section.id, 's1')
  assert.deepEqual(calls[0][2], { origin: ORIGIN, path: '/ar/home', search: '' })
  assert.deepEqual(calls[1][3], { page: { path: '/ar/home', lang: 'ar', site: 'web', search: '' } })
})

test('findCard: no model (no #main-content), or the card is not on the page', () => {
  const record = { key: 's-1', copy: { lang: 'en' }, source: { path: '/en/home', page: '/home' } }
  const none = findCard({}, record, { read: () => ({ model: null }), reconcile: () => assert.fail('not called'), origin: ORIGIN })
  assert.deepEqual(none, { item: null, section: null, model: null })
  const model = { sections: [{ id: 's1', items: [ITEM] }] }
  const gone = findCard({}, record, { read: () => ({ model }), reconcile: () => ({ ids: new Map(), missing: new Set(['s-1']) }), origin: ORIGIN })
  assert.equal(gone.item, null)
  assert.equal(gone.model, model)
})

test('findCard: a page passed in is used as given (another path for a re-pointed card)', () => {
  let seen
  const record = { key: 'k', copy: { lang: 'en' }, source: { path: '/en/home' } }
  findCard({}, record, { read: (d, o) => ((seen = o), { model: null }), reconcile: () => ({ ids: new Map() }), origin: ORIGIN, page: { path: '/en/services', lang: 'en', search: '?a=1' } })
  assert.deepEqual(seen, { origin: ORIGIN, path: '/en/services', search: '?a=1' })
})

test('read.js imports neither the live adapter nor the Pocket\'s record.js (they are injected; lesson E5)', async () => {
  const { readFileSync } = await import('node:fs')
  for (const f of ['read.js', 'url.js', 'robots.js', 'mask.js']) {
    const src = readFileSync(new URL(`../src/watch/${f}`, import.meta.url), 'utf8')
    assert.doesNotMatch(src, /from\s+['"][^'"]*(live-adapter|pocket\/|host\/)/, `${f} imports nothing from the core or the Pocket`)
    assert.match(src, /ADR-0078/, `${f} cites ADR-0078`)
  }
})
