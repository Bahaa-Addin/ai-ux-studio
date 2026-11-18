// The page watch's words (src/watch/words.js; voice-guide ADR-0078 point 8, phase 6 design §4.7): every
// key in English and Arabic, the dates in the page's language, and the gaps filled.
import test from 'node:test'
import assert from 'node:assert/strict'

import { WORDS, dayOf, wordsFor } from '../src/watch/words.js'

const KEYS = ['tell', 'tellLabel', 'watching', 'stop', 'stopLabel', 'noChange', 'changed', 'changedOn', 'card', 'page', 'link', 'missing', 'gone', 'back', 'open', 'script', 'other-site', 'not-allowed', 'no-link', 'maxWatched', 'unavailable', 'button', 'linerLabel']
// 18 Nov 2026, noon in Cairo.
const NOV18 = Date.UTC(2026, 10, 18, 10)

test('every key in both languages, the same keys, none empty', () => {
  for (const lang of ['en', 'ar']) {
    assert.deepEqual(Object.keys(WORDS[lang]).sort(), [...KEYS].sort(), `${lang} has exactly the watch's keys`)
    for (const key of KEYS) assert.ok(WORDS[lang][key].trim().length > 0, `${lang}.${key}`)
  }
  // The Arabic is Arabic (not a copy of the English), and every {gap} of a key is in both languages.
  for (const key of KEYS) {
    assert.match(WORDS.ar[key], /[؀-ۿ]/, `ar.${key} is written in Arabic`)
    const gaps = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()
    assert.deepEqual(gaps(WORDS.ar[key]), gaps(WORDS.en[key]), `${key} has the same gaps in both`)
  }
})

test('the English words the design names', () => {
  const w = wordsFor('en')
  assert.equal(w('tell'), 'Tell me when this changes')
  assert.equal(w('watching'), 'Watching')
  assert.equal(w('stop'), 'Stop watching')
  assert.equal(w('changed'), 'Changed')
  assert.equal(w('card'), 'This card changed')
  assert.equal(w('page'), 'The page it opens changed')
  assert.equal(w('link'), 'It now opens a different page')
  assert.equal(w('missing'), 'No longer on its page')
  assert.equal(w('gone'), 'Its page is gone')
  assert.equal(w('open'), 'Open the page')
})

test('dates: day and short month in the page language', () => {
  assert.equal(dayOf(NOV18, 'en'), '18 Nov')
  const ar = dayOf(NOV18, 'ar')
  assert.match(ar, /18/, 'Latin digits, as the Pocket writes its dates')
  assert.match(ar, /نوفمبر/)
  assert.equal(wordsFor('en').date(NOV18), '18 Nov')
  assert.equal(wordsFor('ar').date(NOV18), ar)
  assert.equal(dayOf(Number.NaN, 'en'), '', 'a date that cannot be written is blank, never a throw')
})

test('gaps filled; another language falls back to English; an unknown gap stays', () => {
  const en = wordsFor('en')
  assert.equal(en('noChange', { date: en.date(NOV18) }), 'No change since 18 Nov')
  assert.equal(en('changedOn', { date: '18 Nov' }), 'Changed 18 Nov')
  assert.equal(en('button', { base: 'Open your pocket, 6 items', count: 1 }), 'Open your pocket, 6 items, 1 changed')
  assert.equal(en('tellLabel', {}), 'Tell me when {title} changes')
  const ar = wordsFor('ar')
  assert.equal(ar.lang, 'ar')
  assert.equal(ar('button', { base: 'افتح جيبك، 6 حاجات', count: 1 }), 'افتح جيبك، 6 حاجات، 1 اتغيّرت')
  assert.equal(wordsFor('fr').lang, 'en')
  assert.equal(wordsFor(undefined)('tell'), 'Tell me when this changes')
})
