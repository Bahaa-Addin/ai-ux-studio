/**
 * O17 (voice-guide ADR-0076 §11, phase 4c): on an Arabic page the thirteen experiences, Reimagine's shell, its composer
 * and its view bar say nothing of ours in English, and on a page not about services nothing of ours says خدم (neither
 * خدمة / خدمات nor استخدم, which holds it). The page's language is read when i18n.js loads, so this file is a process of
 * its own with an Arabic document in place first.
 *
 * Latin letters our Arabic keeps on purpose: the names printed on the keys (Tab, Enter, Esc) and the QR code's; in the
 * views, the marks the design draws in Latin and hides from screen readers: the Vodafone wordmark of the streaming
 * showcase (.st-word), the canvas's X / Y readout (.cv-coords), the tunnel's catalogue codes VF-01... (.tn-card__id);
 * and the canvas's key caps (.cv-key: Enter, Esc).
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { ALL_KEYS, keysIn } from './microcopy-keys.mjs'
import { installRenderDom, placeholderModel, renderEachExperience, WEB_ADDRESS } from './render-fakes.mjs'

installRenderDom({ lang: 'ar' })
const { lang, t } = await import('../src/i18n.js')
const { NEUTRAL_WORDS } = await import('../src/aixc/experiences/shared.js')
const { say } = await import('../src/host/demos/reimagine/copy.js')
const { TEMPLATE_CARDS } = await import('../src/aixc/template-schema.js')
const { vodafoneServicesPageAr } = await import('../src/content/vodafone-services-ar.js')

const arabic = /[؀-ۿ]/
const KEY_NAMES = /\b(?:Tab|Enter|Esc|QR)\b/g
const LATIN_MARKS = '.st-word, .cv-coords, .tn-card__id, .cv-key'
const latinOf = (text) => text.replace(/\{\w+\}/g, '').replace(KEY_NAMES, '').match(/[A-Za-z]+/g) ?? []

test('the page is Arabic, and the sources name their words', () => {
  assert.equal(lang, 'ar')
  assert.ok(ALL_KEYS.length > 150, `${ALL_KEYS.length} calls read`)
  // A ternary's two keys and a values object's left out (flipbook's corner; ring's announcement).
  const flip = keysIn("x = t(isBack ? 'Turn back a page' : 'Turn the page'); t('{n} of {total}', { n: 'no' })").map((k) => k.key)
  assert.deepEqual(flip, ['Turn back a page', 'Turn the page', '{n} of {total}'])
})

test('every word the experiences, the shell, the composer and the view bar pass to t(), words() or say() has its Arabic, in Arabic letters', () => {
  const missing = []
  const latin = []
  for (const { fn, key, file } of ALL_KEYS) {
    const shown = fn === 'say' ? [say(key)] : fn === 'words' ? [t(key), t(NEUTRAL_WORDS[key] ?? key)] : [t(key)]
    for (const ar of shown) {
      if (ar === key || !arabic.test(ar)) missing.push(`${file}: ${fn}(${JSON.stringify(key)})`)
      else if (latinOf(ar).length) latin.push(`${file}: ${fn}(${JSON.stringify(key)}) -> ${ar}`)
    }
  }
  assert.deepEqual(missing, [], 'keys with no Arabic')
  assert.deepEqual(latin, [], 'Arabic with Latin letters other than the keys\' and the QR code\'s names')
})

test('the composer\'s names for the thirteen and the neutral words are Arabic', () => {
  for (const key of [...TEMPLATE_CARDS.map((card) => card.name), ...Object.values(NEUTRAL_WORDS), 'Ring', 'Cube', 'Reimagined view']) {
    const ar = t(key)
    assert.notEqual(ar, key, key)
    assert.match(ar, arabic, key)
    assert.deepEqual(latinOf(ar), [], `${key}: ${ar}`)
  }
})

const model = placeholderModel(vodafoneServicesPageAr, 'نص')
const SEAMS = [
  ['the clone', {}],
  ['a box on Vodafone\'s pages', { scroller: document.createElement('div') }],
]

for (const [where, seam] of SEAMS) {
  for (const copy of ['services', 'items']) {
    test(`each of the thirteen on an Arabic page (${where}, copy '${copy}'): nothing of ours in Latin letters`, async () => {
      const views = await renderEachExperience(model, { ...seam, copy })
      assert.equal(views.length, 13)
      const found = []
      for (const { id, words } of views) {
        assert.ok(words.length > 10, `${id}: ${words.length} words read`)
        for (const { text, where: from, el } of words) {
          if (from === 'text' && el?.closest?.(LATIN_MARKS)) continue
          const latin = latinOf(text.replace(WEB_ADDRESS, ''))
          if (latin.length) found.push(`${id} ${from}: ${text.trim()}`)
        }
      }
      assert.deepEqual([...new Set(found)], [])
    })
  }

  test(`each of the thirteen on an Arabic page not about services (${where}): nothing of ours says خدم`, async () => {
    const views = await renderEachExperience(model, { ...seam, copy: 'items' })
    const found = []
    for (const { id, words } of views) for (const { text, where: from } of words) if (/خدم/.test(text)) found.push(`${id} ${from}: ${text.trim()}`)
    assert.deepEqual([...new Set(found)], [])
  })
}

test('the checks above can see: Vodafone\'s own Latin content and the clone\'s خدم on Services are found', async () => {
  const views = await renderEachExperience(vodafoneServicesPageAr, { copy: 'services' })
  const latin = views.filter(({ words }) => words.some(({ text, where, el }) => !(where === 'text' && el?.closest?.(LATIN_MARKS)) && latinOf(text.replace(WEB_ADDRESS, '')).length))
  assert.equal(latin.length, 13, 'every view shows "VF Play" or a store\'s name')
  const services = (await renderEachExperience(model, { copy: 'services' })).filter(({ words }) => words.some(({ text }) => /خدم/.test(text)))
  assert.ok(services.length >= 9, services.map(({ id }) => id).join(', '))
})

test('the hints the five experiences give on pages not about services: move with the arrows (اتحرّك بالأسهم), not use (استخدم)', () => {
  assert.deepEqual(
    ['Scroll, drag or use the arrow keys', 'Drag the cards, scroll, or use the arrow keys', 'Drag or arrow keys to pan', 'Scroll, or use the arrows, to walk along the wall.'].map((key) => t(key)),
    ['انزل، اسحب أو اتحرّك بالأسهم', 'اسحب الكروت، انزل، أو اتحرّك بالأسهم', 'اسحب أو اتحرّك بالأسهم', 'انزل أو اتحرّك بالأسهم عشان تتمشى جنب الحيطة.'],
  )
})
