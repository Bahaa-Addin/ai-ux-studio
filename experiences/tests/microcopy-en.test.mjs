/**
 * O17 (voice-guide ADR-0076 §11, phase 4c), the English half: the English text is the key, so moving the experiences'
 * words into i18n.js changes no English word; and on a page not about services nothing of ours says "service". The
 * page's language is read when i18n.js loads, so this file is a process of its own with an English document first.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { ALL_KEYS, ENGLISH_RECORD, englishWords } from './microcopy-keys.mjs'
import { installRenderDom, placeholderModel, renderEachExperience } from './render-fakes.mjs'

installRenderDom({ lang: 'en' })
const { lang, t } = await import('../src/i18n.js')
const { NEUTRAL_WORDS, configure, words } = await import('../src/aixc/experiences/shared.js')
const { say } = await import('../src/host/demos/reimagine/copy.js')
const { vodafoneServicesPage } = await import('../src/content/vodafone-services.js')

// On an English page t(), words() and say() give their key back, so the test below holds for any key: it is the
// record that keeps the English byte for byte. A deliberate change of English is recorded anew with
// `node tests/microcopy-keys.mjs --write`, and the diff of microcopy-en.json shows the words that changed.
test('the English our words show is the recorded English, byte for byte (microcopy-en.json)', async () => {
  const recorded = JSON.parse(fs.readFileSync(ENGLISH_RECORD, 'utf8'))
  const now = await englishWords()
  assert.deepEqual(now.keys, recorded.keys, 'each file\'s keys to t(), words() and say()')
  assert.deepEqual(now.neutral, recorded.neutral, 'the neutral words')
  assert.deepEqual(now.cards, recorded.cards, 'the composer\'s names for the thirteen')
  const calls = Object.values(recorded.keys).flatMap((fns) => Object.values(fns).flat()).length
  assert.ok(calls > 140 && Object.keys(recorded.cards).length === 13, `${calls} keys recorded`)
})

test('on the English page every word is its own key, and the neutral words their own', () => {
  assert.equal(lang, 'en')
  assert.ok(ALL_KEYS.length > 150, `${ALL_KEYS.length} calls read`)
  for (const { fn, key } of ALL_KEYS) {
    if (fn === 'say') assert.equal(say(key), key)
    else assert.equal(t(key), key)
    if (fn === 'words') {
      configure()
      assert.equal(words(key), key, `${key}: the clone's words`)
      configure({ copy: 'items' })
      assert.equal(words(key), NEUTRAL_WORDS[key] ?? key, `${key}: the neutral words`)
      configure()
    }
  }
})

const model = placeholderModel(vodafoneServicesPage, 'Text')

for (const [where, seam] of [['the clone', {}], ['a box on Vodafone\'s pages', { scroller: document.createElement('div') }]]) {
  test(`each of the thirteen on an English page not about services (${where}): nothing of ours says "service"`, async () => {
    const views = await renderEachExperience(model, { ...seam, copy: 'items' })
    assert.equal(views.length, 13)
    const found = []
    for (const { id, words: shown } of views) {
      assert.ok(shown.length > 10, `${id}: ${shown.length} words read`)
      for (const { text, where: from } of shown) if (/servic/i.test(text)) found.push(`${id} ${from}: ${text.trim()}`)
    }
    assert.deepEqual([...new Set(found)], [])
  })
}

test('on Services the clone still says "services" (the check above can see the word)', async () => {
  const views = await renderEachExperience(model, { copy: 'services' })
  const saying = views.filter(({ words: shown }) => shown.some(({ text }) => /servic/i.test(text))).map(({ id }) => id)
  assert.ok(saying.length >= 9, `${saying.join(', ')}`)
})
