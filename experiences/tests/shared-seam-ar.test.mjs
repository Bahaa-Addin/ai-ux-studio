/**
 * words() on the Arabic page (voice-guide ADR-0076, phase 4a spec A.6): the clone's Arabic by default, and
 * the neutral words in Arabic for pages that are not about services. The page's language is read when
 * i18n.js loads, so this file is a process of its own with an Arabic document in place first.
 */
import test from 'node:test'
import assert from 'node:assert/strict'

globalThis.document = { documentElement: { lang: 'ar', dir: 'rtl' }, querySelector: () => null }
const { configure, words } = await import('../src/aixc/experiences/shared.js')
const { lang } = await import('../src/i18n.js')

// 'Jump to a category' is neutral in English, but its Arabic (the clone's) says services.
const KEYS = ['Previous service', 'Next service', 'Vodafone services spotlight', 'Show {title}', 'View service', 'More services', 'Services', 'Jump to a category']
const arabic = /[؀-ۿ]/

test('the clone\'s Arabic words by default', () => {
  assert.equal(lang, 'ar')
  configure()
  assert.deepEqual(
    KEYS.map((key) => words(key, { title: 'Flex' })),
    ['الخدمة اللي قبلها', 'الخدمة اللي بعدها', 'خدمات ڤودافون تحت الضوء', 'اعرض Flex', 'شوف الخدمة', 'خدمات تانية', 'الخدمات', 'روح لنوع خدمات'],
  )
})

test('neutral words in Arabic with copy \'items\': every one translated, none about services', () => {
  configure({ copy: 'items' })
  const neutral = KEYS.map((key) => words(key, { title: 'Flex' }))
  assert.deepEqual(neutral, ['السابق', 'التالي', 'تحت الضوء', 'اعرض Flex', 'شوف التفاصيل', 'كمان في الصفحة دي', 'العناصر', 'روح لقسم'])
  for (const word of neutral) {
    assert.match(word, arabic, word)
    assert.doesNotMatch(word, /خدم/, `${word}: not about services`)
  }
  configure()
})
