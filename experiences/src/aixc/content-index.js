/**
 * Turns a normalized page model into a lookup index shared by the validator,
 * the renderers and the Gemini payload builder.
 *
 * Content kinds
 * - "service":   an item inside a page section
 * - "promotion": the page's closing promotion (rendered only by `closing-promotion`)
 *
 * No DOM access here so the same code runs in Node tests.
 */

export const PROMOTION_KIND = 'promotion'
export const SERVICE_KIND = 'service'

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

/** Builds the lookup structures used everywhere else. */
export const buildContentIndex = (model) => {
  const items = new Map()
  const sections = new Map()
  const order = []

  model.sections.forEach((section, sectionIndex) => {
    sections.set(section.id, section)
    section.items.forEach((item, itemIndex) => {
      items.set(item.id, {
        ...item,
        kind: SERVICE_KIND,
        sectionId: section.id,
        sourceOrder: order.length,
        sectionIndex,
        itemIndex,
      })
      order.push(item.id)
    })
  })

  if (model.closingPromotion) {
    const promo = model.closingPromotion
    items.set(promo.id, { ...promo, kind: PROMOTION_KIND, sectionId: null, sourceOrder: order.length })
    order.push(promo.id)
  }

  return {
    pageId: model.pageId,
    model,
    items,
    sections,
    order,
    serviceIds: order.filter((id) => items.get(id).kind === SERVICE_KIND),
    promotionIds: order.filter((id) => items.get(id).kind === PROMOTION_KIND),
    get: (id) => items.get(id) ?? null,
    sectionOf: (id) => sections.get(items.get(id)?.sectionId) ?? null,
  }
}

const imageShape = (image) => {
  if (!image?.width || !image?.height) return 'none'
  const ratio = image.width / image.height
  if (ratio < 0.8) return 'portrait'
  if (ratio > 1.6) return 'landscape'
  return 'square'
}

export const describeImageShape = imageShape

const clip = (text, max) => (typeof text === 'string' && text.length > max ? `${text.slice(0, max - 1)}…` : text ?? null)

/**
 * Compact, data-only description of the page for the model. No URLs, no HTML,
 * no shell content. Descriptions are clipped because the model only needs gist.
 */
export const buildModelPayload = (index) => ({
  page: { id: index.pageId, title: index.model.title, intro: clip(index.model.intro, 160) },
  sections: index.model.sections.map((section) => ({
    id: section.id,
    title: section.title,
    description: clip(section.description, 160),
    items: section.items.map((item) => ({
      id: item.id,
      title: item.title,
      description: clip(item.description, 140),
      image: imageShape(item.image),
      hasLink: Boolean(item.cta?.href),
    })),
  })),
  closingPromotion: index.model.closingPromotion
    ? { id: index.model.closingPromotion.id, title: index.model.closingPromotion.title }
    : null,
})

/** Stable fingerprint of the content, used in cache keys. */
export const contentFingerprint = (index) => {
  const text = index.order.map((id) => `${id}:${index.get(id).title}`).join('|')
  let hash = 0
  for (let i = 0; i < text.length; i += 1) hash = (hash * 31 + text.charCodeAt(i)) | 0
  return `${index.pageId}:${index.order.length}:${(hash >>> 0).toString(36)}`
}
