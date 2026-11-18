/**
 * words() on the Arabic page (voice-guide ADR-0076, phase 4a spec A.6): the clone's Arabic by default, and
 * the neutral words in Arabic for pages that are not about services. The page's language is read when
 * i18n.js loads, so this file is a process of its own with an Arabic document in place first.
 */
import test from 'node:test'
import assert from 'node:assert/strict'

globalThis.document = { documentElement: { lang: 'ar', dir: 'rtl' }, querySelector: () => null }
const { configure, countWords, words, NEUTRAL_WORDS } = await import('../src/aixc/experiences/shared.js')
const { countServices, lang, t } = await import('../src/i18n.js')

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

test('every neutral word has its Arabic, none about services; copy \'services\' keeps each key\'s own Arabic', () => {
  const entries = Object.entries(NEUTRAL_WORDS)
  assert.equal(entries.length, 17, 'stage 1\'s seven and the other eleven experiences\' ten')
  for (const [key, neutral] of entries) {
    const arabicNeutral = t(neutral)
    assert.notEqual(arabicNeutral, neutral, `${neutral}: translated`)
    assert.match(arabicNeutral, arabic, neutral)
    assert.doesNotMatch(arabicNeutral, /خدم/, `${neutral} (${arabicNeutral}): not about services`)
    configure({ copy: 'items' })
    assert.equal(words(key), arabicNeutral, `${key}: the neutral word's Arabic with copy 'items'`)
    configure()
    assert.equal(words(key), t(key), `${key}: the clone's own Arabic with copy 'services'`)
    assert.notEqual(t(key), key, `${key}: the clone has its Arabic`)
  }
  // The other eleven's labels: the composer's Arabic card names where the card's name is the label.
  configure({ copy: 'items' })
  assert.deepEqual(
    ['Vodafone services, card fan', 'Gallery of Vodafone services', 'Vodafone services flipbook', 'Vodafone services, ring', 'Vodafone services, cover flow', 'Vodafone services, split slideshow', 'Vodafone services, hyper tunnel', 'Vodafone services, infinite canvas'].map((key) => words(key)),
    ['مروحة كروت', 'حيطة معرض', 'كتاب بيتقلّب', 'حلقة', 'تقليب الأغلفة', 'شرائح مقسومة', 'النفق السريع', 'لوحة مفتوحة'],
  )
  assert.equal(words('Services canvas. Use the arrow keys to pan, Tab to move between services.'), 'اللوحة. اتحرّك بالأسهم، وTab عشان تنقل بين العناصر.')
  // The canvas's sign takes the page's name (phase 4 passes it); the clone's sign keeps its own.
  assert.equal(words('Vodafone Egypt · Services', { page: 'التجوال' }), 'ڤودافون مصر · التجوال')
  configure()
  assert.equal(words('Vodafone Egypt · Services', { page: 'التجوال' }), 'ڤودافون مصر · الخدمات')
})

test('countWords() in Arabic: the clone\'s countServices by default; with copy \'items\' عنصر in its number\'s form, none about services', () => {
  const counts = [0, 1, 2, 3, 10, 11, 12, 100]
  configure()
  assert.deepEqual(counts.map((n) => countWords(n)), counts.map((n) => countServices(n)), 'copy \'services\': the clone\'s count')
  configure({ copy: 'items' })
  const neutral = counts.map((n) => countWords(n))
  // One, two, 3 to 10 (the plural), 11 and up and zero (the singular), as countServices and countCategories count.
  assert.deepEqual(neutral, ['0 عنصر', 'عنصر واحد', 'عنصرين', '3 عناصر', '10 عناصر', '11 عنصر', '12 عنصر', '100 عنصر'])
  for (const word of neutral) {
    assert.match(word, arabic, word)
    assert.doesNotMatch(word, /خدم/, `${word}: not about services`)
  }
  configure()
})
