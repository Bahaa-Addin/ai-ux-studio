/**
 * What the ready-made templates are, without the clone's composer copy: the composition schema each one
 * builds from the content model (no Gemini call, no key; the schema still goes through the validator), and
 * the composer's cards (id, experience, name, icon). Vodafone's pages load this module (voice-guide
 * ADR-0076, phase 4a); the clone's templates.js adds each card's line, prompt, keywords and credit, and
 * re-exports the builders.
 */

import { buildFallbackSchema } from './fallback-schema.js'

/** One `group` per source section, in source order, then the closing promotion. */
export const buildGroupSchema = (index, experience) => ({
  version: 1,
  experience,
  theme: 'vodafone-editorial',
  density: 'balanced',
  scope: 'all',
  unsupportedRequest: false,
  sections: [
    ...index.model.sections
      .filter((section) => section.items.length > 0)
      .map((section) => ({ id: section.id, type: 'group', title: null, description: null, itemIds: section.items.map((item) => item.id) })),
    ...(index.promotionIds.length
      ? [{ id: 'closing', type: 'closing-promotion', title: null, description: null, itemIds: [...index.promotionIds] }]
      : []),
  ],
})

/** 24×24 single-path icons (non-overlapping shapes, filled with currentColor). */
const ICONS = {
  magazine: 'M3 4h8v10H3zM13 4h8v4h-8zM13 10h8v4h-8zM3 16h18v4H3z',
  spotlight: 'M2 4h12v16H2zM15.5 12H19v8h-3.5zM20 12h2.5v8H20z',
  journey: 'M2 20l6-8 4 4 3-3 7 7zM17 4.5a2.5 2.5 0 1 1 0 5a2.5 2.5 0 1 1 0-5z',
  gallery: 'M2.5 6 9 7.6v8.8L2.5 18zM11 8.1l5 1.2v5.4l-5 1.2zM18 9.8l3.5.8v2.8l-3.5.8z',
  flipbook: 'M2 5.5c3-1.2 6-1 9 .8v13.2c-3-1.8-6-2-9-.8zM22 5.5c-3-1.2-6-1-9 .8v13.2c3-1.8 6-2 9-.8z',
  cube: 'M12 2.8l8 4.4-8 4.4-8-4.4zM3.4 8.6l7.8 4.3v8.5l-7.8-4.3zM20.6 8.6v8.5l-7.8 4.3v-8.5z',
  streaming: 'M2 3h20v9H2zM2 14h6v4H2zM9 14h6v4H9zM16 14h6v4h-6zM2 19.5h20V21H2z',
  split: 'M2 5h9v16H2zM13 3h9v16h-9z',
  fan: 'M2 2h5v6H2zM8 7h6v7H8zM15 13h7v9h-7z',
  coverflow: 'M8 5h8v10H8zM2 7l4.5 1.2v6L2 15.4zM22 7l-4.5 1.2v6l4.5 1.2zM8 17h8v2.5H8z',
  canvas: 'M2 2h9v7H2zM13 2h9v11h-9zM2 11h9v11H2zM13 15h9v7h-9z',
  tunnel: 'M2 2h20v20H2zm3 3v14h14V5zm3 3h8v8H8z',
  ring: 'M12 6c5.5 0 10 2.7 10 6s-4.5 6-10 6S2 15.3 2 12s4.5-6 10-6zm0 2c-4.4 0-8 1.8-8 4s3.6 4 8 4 8-1.8 8-4-3.6-4-8-4zM9 14h6v7H9z',
}

/** The composer's cards, in the composer grid's order. */
export const TEMPLATE_CARDS = [
  { id: 'streaming', experience: 'streaming', name: 'Streaming showcase', icon: ICONS.streaming },
  { id: 'split', experience: 'split', name: 'Split slideshow', icon: ICONS.split },
  { id: 'fan', experience: 'fan', name: 'Card fan', icon: ICONS.fan },
  { id: 'ring', experience: 'ring', name: 'Service ring', icon: ICONS.ring },
  { id: 'tunnel', experience: 'tunnel', name: 'Hyper tunnel', icon: ICONS.tunnel },
  { id: 'canvas', experience: 'canvas', name: 'Infinite canvas', icon: ICONS.canvas },
  { id: 'coverflow', experience: 'coverflow', name: 'Cover flow', icon: ICONS.coverflow },
  { id: 'spotlight', experience: 'spotlight', name: 'Spotlight cards', icon: ICONS.spotlight },
  { id: 'journey', experience: 'journey', name: 'Scroll journey', icon: ICONS.journey },
  { id: 'gallery', experience: 'gallery', name: 'Gallery wall', icon: ICONS.gallery },
  { id: 'flipbook', experience: 'flipbook', name: 'Flipbook', icon: ICONS.flipbook },
  { id: 'cube', experience: 'cube', name: 'Service cube', icon: ICONS.cube },
  { id: 'magazine', experience: 'magazine', name: 'Editorial magazine', icon: ICONS.magazine },
]

export const buildTemplateSchema = (template, index, { prompt = '' } = {}) =>
  template.experience === 'magazine' ? buildFallbackSchema(index, { prompt }) : buildGroupSchema(index, template.experience)
