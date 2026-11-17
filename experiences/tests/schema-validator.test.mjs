// Run with: npm test   (Node's built-in test runner, no dependencies)
import test from 'node:test'
import assert from 'node:assert/strict'

import { vodafoneServicesPage } from '../src/content/vodafone-services.js'
import { buildContentIndex, buildModelPayload } from '../src/aixc/content-index.js'
import { normalizeContentModel } from '../src/host/model.js'
import { validateSchema, assertComplete, promptRequestsFiltering } from '../src/aixc/schema-validator.js'
import { buildFallbackSchema, densityFromPrompt } from '../src/aixc/fallback-schema.js'
import { shellLinks } from '../src/shell.js'

const { model, problems } = normalizeContentModel(vodafoneServicesPage)
const index = buildContentIndex(model)
const placed = (schema) => schema.sections.flatMap((section) => section.itemIds)

test('content model is clean and complete', () => {
  assert.deepEqual(problems, [])
  assert.equal(index.serviceIds.length, 29)
  assert.deepEqual(index.promotionIds, ['ana-vodafone-app'])
  for (const id of index.serviceIds) {
    const item = index.get(id)
    assert.ok(item.title, `${id} has a title`)
    assert.ok(item.image?.src?.startsWith('/assets/images/'), `${id} has a local image`)
    if (item.cta?.href) assert.match(item.cta.href, /^https:\/\//, `${id} href is absolute https`)
  }
})

test('every entertainment subscription has a working Vodafone destination', () => {
  const entertainment = model.sections.find((section) => section.id === 'great-entertainment')
  assert.ok(entertainment)
  for (const item of entertainment.items) {
    assert.match(item.cta?.href ?? '', /^https:\/\//, `${item.id} has an absolute subscription URL`)
  }
  assert.equal(index.get('play-and-win').cta.href, 'https://web.vodafone.com.eg/en/play-win')
})

test('the protected shell contains no placeholder destinations', () => {
  const collect = (value) => {
    if (Array.isArray(value)) return value.flatMap(collect)
    if (!value || typeof value !== 'object') return []
    return [...('href' in value ? [value.href] : []), ...Object.values(value).flatMap(collect)]
  }
  const destinations = [
    shellLinks.home,
    shellLinks.language,
    shellLinks.search,
    ...collect(shellLinks),
  ]
  assert.ok(destinations.length >= 28)
  for (const href of destinations) assert.match(href, /^https:\/\//, href)
})

test('model payload carries no URLs or markup', () => {
  const text = JSON.stringify(buildModelPayload(index))
  assert.doesNotMatch(text, /https?:\/\//)
  assert.doesNotMatch(text, /<[a-z]/i)
})

test('fallback schema is valid and places every item exactly once', () => {
  const result = validateSchema(buildFallbackSchema(index), index)
  assert.equal(result.ok, true)
  assert.deepEqual(result.warnings, [])
  assert.deepEqual([...placed(result.schema)].sort(), [...index.order].sort())
  assertComplete(result.schema, index)
  assert.equal(result.schema.sections[0].type, 'hero')
  assert.equal(result.schema.sections.at(-1).type, 'closing-promotion')
})

test('fallback uses varied primitives', () => {
  const types = new Set(buildFallbackSchema(index).sections.map((section) => section.type))
  assert.ok(types.size >= 5, `expected variety, got ${[...types]}`)
})

test('accepts a JSON string with code fences', () => {
  const raw = '```json\n' + JSON.stringify(buildFallbackSchema(index)) + '\n```'
  assert.equal(validateSchema(raw, index).ok, true)
})

test('rejects invalid JSON, non-objects, wrong version and unsupported experiences', () => {
  assert.equal(validateSchema('{not json', index).ok, false)
  assert.equal(validateSchema([], index).ok, false)
  assert.equal(validateSchema({ version: 2, sections: [{ type: 'hero', itemIds: [] }] }, index).ok, false)
  const dashboard = validateSchema({ version: 1, experience: 'dashboard', sections: [{ type: 'hero', itemIds: [] }] }, index)
  assert.equal(dashboard.ok, false)
  assert.match(dashboard.errors[0], /not available/)
  assert.equal(validateSchema({ version: 1, sections: [] }, index).ok, false)
})

test('drops unknown ids, duplicates and unknown fields; restores omissions', () => {
  const result = validateSchema(
    {
      version: 1,
      experience: 'magazine',
      density: 'ultra',
      html: '<script>alert(1)</script>',
      sections: [
        { id: 'Lead Feature!', type: 'hero', itemIds: ['vodafone-cash', 'not-real'], href: 'javascript:alert(1)' },
        { id: 'grid', type: 'editorial-grid', title: 'Great Entertainment', itemIds: ['mo-salah-world', 'mo-salah-world', 'vf-play'] },
      ],
    },
    index,
  )
  assert.equal(result.ok, true)
  assert.equal(result.schema.density, 'balanced')
  assert.equal(result.schema.sections[0].id, 'lead-feature')
  assert.ok(!('href' in result.schema.sections[0]))
  assert.ok(!('html' in result.schema))
  assertComplete(result.schema, index)
  // Missing entertainment siblings join the grid that already holds Mo Salah World.
  const grid = result.schema.sections.find((section) => section.id === 'grid')
  assert.ok(grid.itemIds.includes('el-hadaba-world'))
  // Sections with no siblings present come back as service lists, before the closing promotion.
  assert.ok(result.schema.sections.some((section) => section.id === 'restored-other-services'))
  assert.equal(result.schema.sections.at(-1).type, 'closing-promotion')
  assert.ok(result.warnings.some((warning) => warning.includes('not-real')))
})

test('unknown section types degrade to service-list and promotion is kept out of other primitives', () => {
  const result = validateSchema(
    {
      version: 1,
      sections: [
        { type: 'hero', itemIds: [] },
        { type: 'netflix-row', itemIds: ['roaming', 'ana-vodafone-app'] },
        { type: 'closing-promotion', itemIds: ['multi-sim'] },
      ],
    },
    index,
  )
  assert.equal(result.ok, true)
  assert.equal(result.schema.sections[1].type, 'service-list')
  const closing = result.schema.sections.filter((section) => section.type === 'closing-promotion')
  assert.equal(closing.length, 1)
  assert.deepEqual(closing[0].itemIds, ['ana-vodafone-app'])
  assertComplete(result.schema, index)
})

test('hero is moved first and only one hero survives', () => {
  const result = validateSchema(
    {
      version: 1,
      sections: [
        { id: 'a', type: 'service-list', itemIds: ['roaming'] },
        { id: 'b', type: 'hero', itemIds: ['vodafone-cash'] },
        { id: 'c', type: 'hero', itemIds: ['multi-sim'] },
      ],
    },
    index,
  )
  assert.equal(result.schema.sections[0].id, 'b')
  assert.equal(result.schema.sections.filter((section) => section.type === 'hero').length, 1)
  assert.equal(result.schema.sections.find((section) => section.id === 'c').type, 'feature')
})

test('long and control-character titles are cleaned', () => {
  const result = validateSchema(
    { version: 1, sections: [{ type: 'hero', title: 'A\u0000B   ' + 'x'.repeat(200), itemIds: [] }] },
    index,
  )
  const title = result.schema.sections[0].title
  assert.ok(title.length <= 60)
  assert.doesNotMatch(title, /\u0000/)
})

test('filtering needs both scope:"filtered" and a filtering prompt', () => {
  const partial = { version: 1, scope: 'filtered', sections: [{ type: 'hero', itemIds: ['vodafone-cash'] }] }
  const denied = validateSchema(partial, index, { prompt: 'Make it compact without removing descriptions or links' })
  assert.equal(denied.schema.scope, 'all')
  assertComplete(denied.schema, index)

  const allowed = validateSchema(partial, index, { prompt: 'Only show the Shokran services' })
  assert.equal(allowed.schema.scope, 'filtered')
  assert.ok(allowed.stats.omittedItems.length > 0)
  assert.ok(placed(allowed.schema).includes('ana-vodafone-app'), 'promotion is never filtered')
})

test('prompt filter detection ignores negated removal', () => {
  assert.equal(promptRequestsFiltering('Make the layout more compact, but do not remove content.'), false)
  assert.equal(promptRequestsFiltering("Keep every original service, description, and link."), false)
  assert.equal(promptRequestsFiltering('Make the content more compact without removing descriptions or links'), false)
  assert.equal(promptRequestsFiltering('Hide the entertainment section'), true)
  assert.equal(promptRequestsFiltering('Only entertainment please'), true)
})

test('density hints for the built-in layout', () => {
  assert.equal(densityFromPrompt('Make it more compact but keep all service details.'), 'compact')
  assert.equal(densityFromPrompt('Use more whitespace and bigger headlines'), 'spacious')
  assert.equal(densityFromPrompt('Turn this into a magazine.'), 'balanced')
})

test('poor content degrades instead of throwing', () => {
  const broken = normalizeContentModel({
    pageId: 'x',
    sections: [{ id: 'ok', items: [{ id: 'a', title: 'A' }, { id: 'a', title: 'dup' }, { id: 'BAD ID', title: 'x' }] }, { id: '' }],
  })
  assert.equal(broken.model.sections.length, 1)
  assert.equal(broken.model.sections[0].items.length, 1)
  assert.ok(broken.problems.length >= 3)
  assert.equal(normalizeContentModel(null).model, null)
})

/* ------------------------------------------------------------- templates */

import { TEMPLATES, buildTemplateSchema, matchTemplate } from '../src/aixc/templates.js'

test('every template builds a valid, complete schema with no warnings', () => {
  assert.equal(TEMPLATES.length, 13)
  for (const template of TEMPLATES) {
    const result = validateSchema(buildTemplateSchema(template, index), index, { prompt: template.prompt })
    assert.equal(result.ok, true, template.id)
    assert.deepEqual(result.warnings, [], `${template.id}: ${result.warnings.join('; ')}`)
    assert.equal(result.schema.experience, template.experience)
    assertComplete(result.schema, index)
    assert.equal(result.schema.sections.at(-1).type, 'closing-promotion', template.id)
  }
})

test('every template experience is allowed by the validator and has a renderer label', async () => {
  const { EXPERIENCES } = await import('../src/aixc/schema-validator.js')
  for (const template of TEMPLATES) assert.ok(EXPERIENCES.includes(template.experience), template.experience)
  assert.equal(new Set(TEMPLATES.map((template) => template.id)).size, TEMPLATES.length)
})

test('group experiences get one group per source section, in source order', () => {
  const schema = buildTemplateSchema(TEMPLATES.find((t) => t.id === 'cube'), index)
  const groups = schema.sections.filter((section) => section.type === 'group')
  assert.deepEqual(groups.map((group) => group.id), index.model.sections.map((section) => section.id))
})

test('group experiences coerce magazine primitives to groups and need no hero', () => {
  const result = validateSchema(
    {
      version: 1,
      experience: 'gallery',
      sections: [
        { type: 'hero', itemIds: ['vodafone-cash'] },
        { type: 'editorial-grid', itemIds: ['roaming', 'roaming', 'nope'] },
      ],
    },
    index,
  )
  assert.equal(result.ok, true)
  assert.ok(result.schema.sections.every((section) => section.type === 'group' || section.type === 'closing-promotion'))
  assert.ok(!result.schema.sections.some((section) => section.type === 'hero'))
  assertComplete(result.schema, index)
  // Restored sections use the experience's own section type.
  assert.ok(result.schema.sections.some((section) => section.id.startsWith('restored-') && section.type === 'group'))
})

test('typed prompts are matched to templates by plain wording', () => {
  assert.equal(matchTemplate('Make it a flip book please')?.id, 'flipbook')
  assert.equal(matchTemplate('show everything on a 3D cube')?.id, 'cube')
  assert.equal(matchTemplate('like an art gallery')?.id, 'gallery')
  assert.equal(matchTemplate('a parallax scroll journey')?.id, 'journey')
  assert.equal(matchTemplate('full-screen spotlight cards')?.id, 'spotlight')
  assert.equal(matchTemplate('Turn this into a magazine.')?.id, 'magazine')
  assert.equal(matchTemplate('make it look like Netflix')?.id, 'streaming')
  assert.equal(matchTemplate('a split screen slideshow')?.id, 'split')
  assert.equal(matchTemplate('fan out the cards like a deck')?.id, 'fan')
  assert.equal(matchTemplate('put them on a 3D ring')?.id, 'ring')
  assert.equal(matchTemplate('a hyperspace tunnel')?.id, 'tunnel')
  assert.equal(matchTemplate('an infinite gallery I can drag around')?.id, 'canvas')
  assert.equal(matchTemplate('like album covers in a cover flow')?.id, 'coverflow')
  assert.equal(matchTemplate('a simple slideshow')?.id, 'spotlight')
  assert.equal(matchTemplate('Use more white space'), null)
  assert.equal(matchTemplate('make it nicer'), null)
  assert.equal(matchTemplate('share on facebook'), null)
})
