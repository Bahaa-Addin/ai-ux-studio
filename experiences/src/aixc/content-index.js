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
