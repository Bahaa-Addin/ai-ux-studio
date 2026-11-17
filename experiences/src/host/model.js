/**
 * The content model's check (src/content/vodafone-services.js describes the model): a frozen deep copy
 * of a page's model and the problems found in it, for the live adapter (./live-adapter.js, the layer's
 * core) and the clone's (../adapters/vodafone-services.js). It lives here, apart from
 * ../aixc/content-index.js, and imports nothing: the composer and the experiences import that index on
 * intent, and esbuild puts a file that both they and the core reach into a chunk the core loads with it
 * (phase 4 design §2.6, §3.5; content-index.js measured +825 B gzipped on the core, over its budget, on
 * 2026-11-17). For the same reason no demo chunk of the layer imports this module: it reads the model the
 * core made (layer.model).
 *
 * No DOM access here so the same code runs in Node tests.
 */

const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/

const deepFreeze = (value) => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const child of Object.values(value)) deepFreeze(child)
  }
  return value
}

/**
 * Checks the model is usable and returns a frozen deep copy plus any problems found.
 * Problems never throw: poorly extracted content degrades to "nothing to recompose".
 */
export const normalizeContentModel = (model) => {
  const problems = []
  if (!model || typeof model !== 'object') {
    return { model: null, problems: ['Content model is missing.'] }
  }
  const copy = structuredClone(model)
  const seen = new Set()
  copy.sections = Array.isArray(copy.sections) ? copy.sections : []

  copy.sections = copy.sections
    .filter((section) => {
      if (!section || !ID_PATTERN.test(section.id ?? '')) {
        problems.push(`Dropped a section with an invalid id (${section?.id}).`)
        return false
      }
      return true
    })
    .map((section) => {
      const items = (Array.isArray(section.items) ? section.items : []).filter((item) => {
        if (!item || !ID_PATTERN.test(item.id ?? '') || typeof item.title !== 'string' || !item.title.trim()) {
          problems.push(`Dropped an item without a valid id/title in "${section.id}".`)
          return false
        }
        if (seen.has(item.id)) {
          problems.push(`Dropped duplicate item id "${item.id}".`)
          return false
        }
        seen.add(item.id)
        return true
      })
      return { ...section, items }
    })

  if (copy.closingPromotion) {
    const promoId = copy.closingPromotion.id
    if (!ID_PATTERN.test(promoId ?? '') || seen.has(promoId)) {
      problems.push('Closing promotion has an invalid or duplicate id; it was dropped.')
      copy.closingPromotion = null
    }
  }

  return { model: deepFreeze(copy), problems }
}
