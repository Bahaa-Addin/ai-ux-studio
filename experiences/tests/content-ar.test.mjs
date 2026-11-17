// The Arabic Services model (captured 2026-11-05) stays in step with the English one.
import test from 'node:test'
import assert from 'node:assert/strict'
import { vodafoneServicesPage as en } from '../src/content/vodafone-services.js'
import { vodafoneServicesPageAr as ar } from '../src/content/vodafone-services-ar.js'
import { normalizeContentModel } from '../src/host/model.js'

const items = (page) => page.sections.flatMap((section) => section.items.map((item) => ({ ...item, section: section.id })))
const arabic = /[؀-ۿ]/

test('same sections and the same items as the English page', () => {
  assert.deepEqual(ar.sections.map((s) => s.id), en.sections.map((s) => s.id))
  assert.deepEqual(items(ar).map((i) => i.id).sort(), items(en).map((i) => i.id).sort())
  assert.equal(ar.pageId, 'vodafone-services-ar')
  assert.equal(ar.lang, 'ar')
})

test('every title and section is Arabic (VF Play is Latin on the live page too)', () => {
  for (const section of ar.sections) assert.match(section.title, arabic, section.id)
  for (const item of items(ar)) if (item.id !== 'vf-play') assert.match(item.title, arabic, item.id)
})

test('the pictures are the English files (pixel-identical on 2026-11-05)', () => {
  const enImages = Object.fromEntries(items(en).map((i) => [i.id, i.image.src]))
  for (const item of items(ar)) assert.equal(item.image.src, enImages[item.id], item.id)
})

test('links go to Arabic pages, the web app or the Ana Vodafone flow, never to /en/', () => {
  for (const item of items(ar)) {
    const href = item.cta?.href
    if (!href) continue
    assert.match(href, /^https:\/\/(web\.vodafone\.com\.eg\/(ar|spa)\/|vf\.eg\/anavodafone$)/, item.id)
  }
})

test('the model is valid for every experience', () => {
  const { model, problems } = normalizeContentModel(ar)
  assert.ok(model, problems.join('; '))
  assert.deepEqual(problems, [])
})
