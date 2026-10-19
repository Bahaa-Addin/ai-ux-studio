/**
 * Deterministic built-in magazine composition.
 *
 * Used when Gemini is not configured, unavailable, or returns nothing usable and
 * there is no earlier valid layout to keep. It is derived from the content model's
 * structure (section order and item counts), not from hard-coded item ids, so it
 * keeps working when the captured content changes or a new page adapter is added.
 *
 * The UI always labels this as the built-in layout; it never claims to be AI output.
 */

const pickType = (count, previousGridLike) => {
  if (count === 1) return 'callout'
  if (count <= 3) return 'feature'
  if (count === 4) return 'split-spread'
  if (count <= 7) return previousGridLike ? 'shelf' : 'editorial-grid'
  return 'service-list'
}

/** Rule-based density hint for the built-in layout. Labelled as built-in in the UI. */
export const densityFromPrompt = (prompt = '') => {
  const text = prompt.toLowerCase()
  if (/\b(compact|dense|denser|tight|tighter|condens\w*|smaller|less space|less whitespace)\b/.test(text)) return 'compact'
  if (/\b(spacious|airy|more space|more whitespace|white ?space|bigger|larger|breathing)\b/.test(text)) return 'spacious'
  return 'balanced'
}

export const buildFallbackSchema = (index, { prompt = '' } = {}) => {
  const sections = []
  const modelSections = index.model.sections.filter((section) => section.items.length > 0)

  // Cover: the first item of the first section is the cover story.
  const [first, ...rest] = modelSections
  if (first) {
    sections.push({ id: 'cover', type: 'hero', title: null, description: null, itemIds: [first.items[0].id] })
    const remaining = first.items.slice(1).map((item) => item.id)
    if (remaining.length) {
      sections.push({ id: `${first.id}-more`, type: 'service-list', title: null, description: null, itemIds: remaining })
    }
  } else {
    sections.push({ id: 'cover', type: 'hero', title: null, description: null, itemIds: [] })
  }

  let previousGridLike = false
  for (const section of rest) {
    const type = pickType(section.items.length, previousGridLike)
    previousGridLike = type === 'editorial-grid' || type === 'shelf'
    sections.push({ id: section.id, type, title: null, description: null, itemIds: section.items.map((item) => item.id) })
  }

  if (index.promotionIds.length) {
    sections.push({ id: 'closing', type: 'closing-promotion', title: null, description: null, itemIds: [...index.promotionIds] })
  }

  return {
    version: 1,
    experience: 'magazine',
    theme: 'vodafone-editorial',
    density: densityFromPrompt(prompt),
    scope: 'all',
    unsupportedRequest: false,
    sections,
  }
}
