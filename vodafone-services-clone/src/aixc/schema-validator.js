/**
 * Allowlist validator for AIXC composition schemas.
 *
 * Input:  anything (the parsed model response, or a JSON string)
 * Output: { ok, schema, warnings, errors, stats }
 *
 * `schema` is always a freshly built object containing only known fields, so a
 * renderer never sees anything the model added on its own. Content preservation is
 * enforced here rather than trusted to the model:
 *   - unknown / duplicate item ids are dropped
 *   - every source item omitted by the model is re-homed next to its siblings
 *   - the closing promotion is only ever rendered by `closing-promotion`
 * Omission is only allowed when the schema declares `scope: "filtered"` AND the
 * user's prompt plainly asks for filtering (see `promptRequestsFiltering`).
 */

import { PROMOTION_KIND } from './content-index.js'

export const SCHEMA_VERSION = 1
/**
 * Experience plugins. `magazine` composes with layout primitives; every other
 * experience takes ordered `group` sections and decides the visuals itself.
 */
export const EXPERIENCES = ['magazine', 'spotlight', 'journey', 'gallery', 'flipbook', 'cube']
export const THEMES = ['vodafone-editorial']
export const DENSITIES = ['compact', 'balanced', 'spacious']
export const SCOPES = ['all', 'filtered']
export const MAGAZINE_SECTION_TYPES = [
  'hero',
  'feature',
  'editorial-grid',
  'split-spread',
  'shelf',
  'callout',
  'section-heading',
  'service-list',
  'closing-promotion',
]
export const GROUP_SECTION_TYPES = ['group', 'closing-promotion']
export const SECTION_TYPES = [...MAGAZINE_SECTION_TYPES, 'group']

const sectionTypesFor = (experience) => (experience === 'magazine' ? MAGAZINE_SECTION_TYPES : GROUP_SECTION_TYPES)
const fallbackTypeFor = (experience) => (experience === 'magazine' ? 'service-list' : 'group')

/** Primitives that render fine with no items. Every other type needs at least one. */
const MAY_BE_EMPTY = new Set(['hero', 'section-heading'])

export const LIMITS = Object.freeze({
  rawChars: 40000,
  sections: 14,
  itemsPerSection: 40,
  titleChars: 60,
  descriptionChars: 160,
  sectionIdChars: 40,
})

const TOP_LEVEL_FIELDS = new Set(['version', 'experience', 'theme', 'density', 'scope', 'unsupportedRequest', 'sections'])
const SECTION_FIELDS = new Set(['id', 'type', 'title', 'description', 'itemIds'])

/**
 * Words that signal the user deliberately wants fewer items. Phrases that only
 * mention removal in order to forbid it ("without removing", "don't remove",
 * "keep all") are stripped first so they never unlock filtering.
 */
export const promptRequestsFiltering = (prompt = '') => {
  const text = String(prompt)
    .toLowerCase()
    .replace(/\b(without|no|not|never|don'?t|do not)\s+(removing|remove|hiding|hide|dropping|drop|losing|lose|filtering|filter|cutting|cut)\b/g, ' ')
    .replace(/\bkeep(ing)?\s+(all|every)\b/g, ' ')
  return /\b(only|just show|filter|hide|exclude|remove|drop|skip|leave out)\b/.test(text)
}

const cleanText = (value, max) => {
  if (typeof value !== 'string') return null
  // Collapse whitespace and strip control characters. Text is later set via
  // textContent, so markup is inert either way; this just keeps labels tidy.
  const text = value.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (!text) return null
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text
}

const cleanSectionId = (value) => {
  if (typeof value !== 'string') return null
  const id = value.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, LIMITS.sectionIdChars)
  return id || null
}

const parseInput = (raw) => {
  if (typeof raw !== 'string') return { value: raw }
  if (raw.length > LIMITS.rawChars) return { error: `Response is too large (${raw.length} characters).` }
  const unfenced = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  try {
    return { value: JSON.parse(unfenced) }
  } catch {
    return { error: 'Response is not valid JSON.' }
  }
}

const fail = (errors, warnings = []) => ({ ok: false, schema: null, errors, warnings, stats: null })

export const validateSchema = (raw, index, options = {}) => {
  const warnings = []
  const parsed = parseInput(raw)
  if (parsed.error) return fail([parsed.error])
  const input = parsed.value

  if (!input || typeof input !== 'object' || Array.isArray(input)) return fail(['Schema must be a JSON object.'])

  for (const key of Object.keys(input)) {
    if (!TOP_LEVEL_FIELDS.has(key)) warnings.push(`Ignored unknown field "${key}".`)
  }

  if (input.version !== undefined && input.version !== SCHEMA_VERSION) {
    return fail([`Unsupported schema version "${input.version}".`], warnings)
  }

  const experience = input.experience ?? 'magazine'
  if (!EXPERIENCES.includes(experience)) {
    return fail([`Experience "${String(experience).slice(0, 40)}" is not available yet.`], warnings)
  }

  let theme = THEMES[0]
  if (input.theme !== undefined && !THEMES.includes(input.theme)) warnings.push(`Unknown theme "${input.theme}"; using ${theme}.`)
  else if (input.theme) theme = input.theme

  let density = 'balanced'
  if (input.density !== undefined && !DENSITIES.includes(input.density)) warnings.push(`Unknown density "${input.density}"; using balanced.`)
  else if (input.density) density = input.density

  const filteringAllowed = input.scope === 'filtered' && promptRequestsFiltering(options.prompt)
  if (input.scope === 'filtered' && !filteringAllowed) {
    warnings.push('Schema asked to filter content, but the prompt did not request it; all content is kept.')
  }

  if (!Array.isArray(input.sections) || input.sections.length === 0) {
    return fail(['Schema has no sections.'], warnings)
  }

  const rawSections = input.sections.slice(0, LIMITS.sections)
  if (input.sections.length > LIMITS.sections) warnings.push(`Only the first ${LIMITS.sections} sections were kept.`)

  const used = new Set()
  const sectionIds = new Set()
  const sections = []

  rawSections.forEach((rawSection, position) => {
    if (!rawSection || typeof rawSection !== 'object' || Array.isArray(rawSection)) {
      warnings.push(`Section ${position + 1} is not an object; dropped.`)
      return
    }
    for (const key of Object.keys(rawSection)) {
      if (!SECTION_FIELDS.has(key)) warnings.push(`Section ${position + 1}: ignored unknown field "${key}".`)
    }

    let type = rawSection.type
    if (!sectionTypesFor(experience).includes(type)) {
      const fallbackType = fallbackTypeFor(experience)
      // Magazine primitives sent to a group-based experience are expected; anything else is worth a note.
      if (!(experience !== 'magazine' && MAGAZINE_SECTION_TYPES.includes(type))) {
        warnings.push(`Section ${position + 1}: unknown type "${String(type).slice(0, 30)}" rendered as ${fallbackType}.`)
      }
      type = fallbackType
    }

    let id = cleanSectionId(rawSection.id) ?? `section-${position + 1}`
    while (sectionIds.has(id)) id = `${id}-${position + 1}`
    sectionIds.add(id)

    const itemIds = []
    const rawIds = Array.isArray(rawSection.itemIds) ? rawSection.itemIds.slice(0, LIMITS.itemsPerSection) : []
    for (const itemId of rawIds) {
      if (typeof itemId !== 'string' || !index.items.has(itemId)) {
        warnings.push(`Section "${id}": dropped unknown item "${String(itemId).slice(0, 40)}".`)
        continue
      }
      if (used.has(itemId)) {
        warnings.push(`Section "${id}": dropped duplicate item "${itemId}".`)
        continue
      }
      const isPromotion = index.get(itemId).kind === PROMOTION_KIND
      // The promotion belongs to closing-promotion only, and closing-promotion only
      // renders promotions. Anything misplaced is left for the completeness pass.
      if (isPromotion !== (type === 'closing-promotion')) {
        warnings.push(`Section "${id}": "${itemId}" cannot be shown in a ${type}; it was moved.`)
        continue
      }
      used.add(itemId)
      itemIds.push(itemId)
    }

    sections.push({
      id,
      type,
      title: cleanText(rawSection.title, LIMITS.titleChars),
      // Accepted for compatibility but never rendered: model-authored prose next to
      // factual service copy is the main hallucination risk. Kept for debugging only.
      description: cleanText(rawSection.description, LIMITS.descriptionChars),
      itemIds,
    })
  })

  // A magazine opens with exactly one cover. Other experiences draw their own opening.
  if (experience === 'magazine') {
    const heroes = sections.filter((section) => section.type === 'hero')
    heroes.slice(1).forEach((section) => {
      section.type = 'feature'
      warnings.push(`Extra hero "${section.id}" rendered as feature.`)
    })
    if (heroes.length === 0) {
      sections.unshift({ id: 'cover', type: 'hero', title: null, description: null, itemIds: [] })
      warnings.push('No hero section; added a cover.')
    } else if (sections[0] !== heroes[0]) {
      sections.splice(sections.indexOf(heroes[0]), 1)
      sections.unshift(heroes[0])
    }
  }

  // Completeness: re-home anything the model left out.
  const missing = index.order.filter((itemId) => !used.has(itemId))
  const omitted = []
  for (const itemId of missing) {
    const item = index.get(itemId)
    if (item.kind === PROMOTION_KIND) {
      let closing = sections.find((section) => section.type === 'closing-promotion')
      if (!closing) {
        closing = { id: 'closing-promotion', type: 'closing-promotion', title: null, description: null, itemIds: [] }
        while (sectionIds.has(closing.id)) closing.id += '-x'
        sectionIds.add(closing.id)
        sections.push(closing)
      }
      closing.itemIds.push(itemId)
      used.add(itemId)
      continue
    }
    if (filteringAllowed) {
      omitted.push(itemId)
      continue
    }
    // Prefer a section that already shows this item's source siblings.
    const home = sections.find(
      (section) =>
        section.type !== 'closing-promotion' &&
        section.itemIds.some((otherId) => index.get(otherId).sectionId === item.sectionId),
    )
    if (home) {
      // Insert after the last sibling so source order is roughly preserved.
      const lastSibling = home.itemIds.reduce(
        (last, otherId, at) => (index.get(otherId).sectionId === item.sectionId ? at : last),
        -1,
      )
      home.itemIds.splice(lastSibling + 1, 0, itemId)
    } else {
      const sourceSection = index.sectionOf(itemId)
      let restored = sections.find((section) => section.id === `restored-${sourceSection.id}`)
      if (!restored) {
        restored = { id: `restored-${sourceSection.id}`, type: fallbackTypeFor(experience), title: null, description: null, itemIds: [] }
        sectionIds.add(restored.id)
        const closingAt = sections.findIndex((section) => section.type === 'closing-promotion')
        sections.splice(closingAt === -1 ? sections.length : closingAt, 0, restored)
      }
      restored.itemIds.push(itemId)
    }
    used.add(itemId)
    warnings.push(`Restored omitted item "${itemId}".`)
  }

  // Drop sections that ended up with nothing to show.
  const finalSections = sections.filter((section) => {
    if (section.itemIds.length > 0 || MAY_BE_EMPTY.has(section.type)) return true
    warnings.push(`Dropped empty ${section.type} "${section.id}".`)
    return false
  })

  // The closing promotion always closes the magazine.
  finalSections.sort((a, b) => (a.type === 'closing-promotion') - (b.type === 'closing-promotion'))

  const schema = {
    version: SCHEMA_VERSION,
    experience,
    theme,
    density,
    scope: filteringAllowed && omitted.length > 0 ? 'filtered' : 'all',
    unsupportedRequest: input.unsupportedRequest === true,
    sections: finalSections,
  }

  const placed = finalSections.flatMap((section) => section.itemIds)
  return {
    ok: true,
    schema,
    errors: [],
    warnings,
    stats: {
      totalItems: index.order.length,
      placedItems: placed.length,
      omittedItems: omitted,
      restoredItems: missing.length - omitted.length,
    },
  }
}

/** Throws in development if a validated schema ever breaks the invariants. */
export const assertComplete = (schema, index) => {
  const placed = schema.sections.flatMap((section) => section.itemIds)
  const unique = new Set(placed)
  if (unique.size !== placed.length) throw new Error('AIXC: schema places an item more than once.')
  if (schema.scope === 'all' && unique.size !== index.order.length) {
    throw new Error('AIXC: schema does not place every item.')
  }
}
