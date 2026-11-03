import test from 'node:test'
import assert from 'node:assert/strict'
import { sectionSpeech } from '../src/voicetut/sections.js'
import { vodafoneServicesPage } from '../src/content/vodafone-services.js'

test('section reading includes the selected section copy without navigation or other sections', () => {
  const cash = vodafoneServicesPage.sections.find(section => section.id === 'cash')
  const input = sectionSpeech(cash)
  assert.equal(input, `${cash.title}\n\n${cash.items[0].description}`)
  assert.doesNotMatch(input, /View more|https?:|Stay In Control|Read this section/)
})

test('every current section fits one VoiceTut request without dropping any service description', () => {
  assert.equal(vodafoneServicesPage.sections.length, 6)
  for (const section of vodafoneServicesPage.sections) {
    const input = sectionSpeech(section)
    assert.ok(input.length <= 1500, `${section.title} exceeds the model input limit`)
    for (const item of section.items) {
      assert.ok(input.includes(item.title), `${section.title} is missing ${item.title}`)
      if (item.description) assert.ok(input.includes(item.description), `${item.title} description is missing`)
    }
  }
})
