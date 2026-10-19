/**
 * Ready-made experience templates.
 *
 * A template is a one-click prompt: it names an experience and builds its
 * composition schema locally from the content model, so no Gemini call (and no
 * API key) is needed. The schema still goes through the validator, so templates
 * get the same completeness guarantee as AI output.
 *
 * Visual references (adapted to Vodafone's palette, fonts and components):
 *   spotlight  codepen.io/dilums/full/NWodZMd          "Timed Cards Opening"
 *   journey    codepen.io/isladjan/pen/abdyPBw         "Parallax scroll animation"
 *   gallery    codepen.io/nassimberrada/pen/EayPjpM    "Infinite Gallery Hall"
 *   flipbook   codepen.io/jcoulterdesign/pen/oRRRPY    "Pure CSS Magazine style layout"
 *   cube       codepen.io/luis-lessrain/pen/ZYpyoRV    "Six Faces"
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
}

export const TEMPLATES = [
  {
    id: 'spotlight',
    experience: 'spotlight',
    name: 'Spotlight cards',
    description: 'Each service takes the stage in turn, with the next ones queued as cards.',
    prompt: 'Show each service as a full-screen spotlight, with the next services lined up as cards.',
    icon: ICONS.spotlight,
    keywords: /\b(spotlight|timed cards?|slide ?show|carousel|slider|full[- ]?screen|cinematic|queued? cards?)\b/,
  },
  {
    id: 'journey',
    experience: 'journey',
    name: 'Scroll journey',
    description: 'A layered Vodafone landscape moves from day to night as you scroll through each category.',
    prompt: 'Turn the page into a parallax scroll journey through each service category.',
    icon: ICONS.journey,
    keywords: /\b(parallax|journey|landscape|scroll(?:ing)? (?:story|animation|scene)|day to night|sunset|layers?)\b/,
  },
  {
    id: 'gallery',
    experience: 'gallery',
    name: 'Gallery wall',
    description: 'Walk along a 3D wall where every service hangs as a framed piece.',
    prompt: 'Present every service as a framed piece on a 3D gallery wall I can walk along.',
    icon: ICONS.gallery,
    keywords: /\b(gallery|museum|exhibition|exhibit|art ?wall|framed|frames?)\b/,
  },
  {
    id: 'flipbook',
    experience: 'flipbook',
    name: 'Flipbook',
    description: 'A book with a spread for each category, turned like real pages.',
    prompt: 'Make the page a flipbook, with a two-page spread for each service category.',
    icon: ICONS.flipbook,
    keywords: /\b(flip ?book|book|page[- ]?flip|flip(?:ping)? pages?|turn(?:ing)? pages?|spreads?)\b/,
  },
  {
    id: 'cube',
    experience: 'cube',
    name: 'Service cube',
    description: 'A 3D cube turns to a new face for each category as you read.',
    prompt: 'Put each service category on a face of a 3D cube that turns as I scroll.',
    icon: ICONS.cube,
    keywords: /\b(cube|3d box|six faces|faces?|rotat(?:e|ing))\b/,
  },
  {
    id: 'magazine',
    experience: 'magazine',
    name: 'Editorial magazine',
    description: 'A cover story, asymmetric spreads and an index of every service.',
    prompt: 'Turn this into an editorial magazine.',
    icon: ICONS.magazine,
    keywords: /\b(magazine|editorial)\b/,
  },
]

export const getTemplate = (id) => TEMPLATES.find((template) => template.id === id) ?? null

/** Finds the template a free-text prompt is plainly asking for, or null. */
export const matchTemplate = (prompt = '') => {
  const text = String(prompt).toLowerCase()
  return TEMPLATES.find((template) => template.keywords.test(text)) ?? null
}

export const buildTemplateSchema = (template, index, { prompt = '' } = {}) =>
  template.experience === 'magazine' ? buildFallbackSchema(index, { prompt }) : buildGroupSchema(index, template.experience)
