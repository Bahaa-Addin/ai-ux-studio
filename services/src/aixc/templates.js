/**
 * Ready-made experience templates.
 *
 * A template is a one-click prompt: it names an experience and builds its
 * composition schema locally from the content model, so no Gemini call (and no
 * API key) is needed. The schema still goes through the validator, so templates
 * get the same completeness guarantee as AI output.
 *
 * Visual references: every template but `magazine` is adapted from a CodePen
 * (to Vodafone's palette, fonts and components). Each template's `reference`
 * names that pen ({ title, author, url }), and the composer credits it under
 * the template's card. `magazine` is the clone's own layout (reference: null).
 *
 * Order matters twice: it is the order of the composer grid, and matchTemplate
 * takes the first template whose keywords match, so specific wording ("split
 * slideshow", "infinite gallery") is checked before the broader templates.
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

export const TEMPLATES = [
  {
    id: 'streaming',
    experience: 'streaming',
    name: 'Streaming showcase',
    description: 'A cinematic logo intro, a billboard and rows of services, like a streaming home.',
    prompt: 'Make it a streaming-style home with a cinematic logo intro and rows of services.',
    icon: ICONS.streaming,
    reference: { title: 'Flix', author: 'Bahaa-Addin', url: 'https://codepen.io/Bahaa-Addin/pen/YayLbo' },
    keywords: /\b(netflix|streaming|stream|binge|movies?|tv app|billboard|thumbnails?)\b/,
  },
  {
    id: 'split',
    experience: 'split',
    name: 'Split slideshow',
    description: 'Each service fills a split screen whose halves slide past each other as you scroll.',
    prompt: 'Show each service as a full-screen split slideshow whose halves slide past each other as I scroll.',
    icon: ICONS.split,
    reference: { title: 'Split Slick Slideshow', author: 'supah', url: 'https://codepen.io/supah/pen/zZaPeE' },
    keywords: /\b(split(?:[- ]screen)?|two halves|halves|mirrored slides?)\b/,
  },
  {
    id: 'fan',
    experience: 'fan',
    name: 'Card fan',
    description: 'Numbered service cards fan out on a diagonal; drag, scroll or swipe through them.',
    prompt: 'Fan the services out as a stack of numbered cards I can drag or scroll through.',
    icon: ICONS.fan,
    reference: { title: 'Carousel with drag and wheel', author: 'supah', url: 'https://codepen.io/supah/pen/xxJMbbg' },
    keywords: /\b(fan(?:ned)?(?: out)?|card fan|deck(?: of cards)?|card deck|stack(?:ed)? (?:of )?cards|card stack|drag(?:gable)? cards|swipe(?:able)? cards)\b/,
  },
  {
    id: 'ring',
    experience: 'ring',
    name: 'Service ring',
    description: 'Services stand on a 3D ring that turns as you scroll, each one stopping in front of you.',
    prompt: 'Put the services on a 3D ring that turns as I scroll, stopping on each one.',
    icon: ICONS.ring,
    reference: { title: 'Infinite February', author: 'cobra_winfrey', url: 'https://codepen.io/cobra_winfrey/pen/podWgvv' },
    keywords: /\b(ring|wheel|merry[- ]go[- ]round|carousel ring|revolving|turntable|calendar)\b/,
  },
  {
    id: 'tunnel',
    experience: 'tunnel',
    name: 'Hyper tunnel',
    description: 'Fly down a 3D tunnel of service cards; the faster you scroll, the more the view warps.',
    prompt: 'Fly me through a 3D tunnel of service cards that warps as I scroll faster.',
    icon: ICONS.tunnel,
    reference: { title: 'Hyper Scroll', author: 'aleksa-rakocevic', url: 'https://codepen.io/aleksa-rakocevic/pen/pvbboZx' },
    keywords: /\b(tunnel|hyper ?scroll|hyperspace|warp(?: speed)?|fly(?:ing)? (?:me )?through|wormhole|star ?field|brutalist)\b/,
  },
  {
    id: 'canvas',
    experience: 'canvas',
    name: 'Infinite canvas',
    description: 'Drag around an endless grid of services and open any card to zoom in.',
    prompt: 'Lay the services out on an endless canvas I can drag around, and zoom into any card.',
    icon: ICONS.canvas,
    reference: { title: 'Infinite Draggable Image Gallery', author: 'filipz', url: 'https://codepen.io/filipz/pen/dPPyJZX' },
    keywords: /\b(infinite (?:canvas|grid|gallery|wall)|canvas|draggable|drag around|pan(?:ning)? around|endless grid|mood ?board)\b/,
  },
  {
    id: 'coverflow',
    experience: 'coverflow',
    name: 'Cover flow',
    description: 'Flip through the services like album covers, with reflections on a glossy floor.',
    prompt: 'Let me flip through the services like album covers in a cover flow.',
    icon: ICONS.coverflow,
    reference: { title: 'Infinite Cover Flow w/ GSAP', author: 'jh3y', url: 'https://codepen.io/jh3y/pen/WNRvqJP' },
    keywords: /\b(cover ?flow|album(?: art| covers?)?|vinyl|itunes|glossy floor)\b/,
  },
  {
    id: 'spotlight',
    experience: 'spotlight',
    name: 'Spotlight cards',
    description: 'Each service takes the stage in turn, with the next ones queued as cards.',
    prompt: 'Show each service as a full-screen spotlight, with the next services lined up as cards.',
    icon: ICONS.spotlight,
    reference: { title: 'Timed Cards Opening', author: 'dilums', url: 'https://codepen.io/dilums/full/NWodZMd' },
    keywords: /\b(spotlight|timed cards?|slide ?show|carousel|slider|full[- ]?screen|cinematic|queued? cards?)\b/,
  },
  {
    id: 'journey',
    experience: 'journey',
    name: 'Scroll journey',
    description: 'A layered Vodafone landscape moves from day to night as you scroll through each category.',
    prompt: 'Turn the page into a parallax scroll journey through each service category.',
    icon: ICONS.journey,
    reference: { title: 'Parallax scroll animation', author: 'isladjan', url: 'https://codepen.io/isladjan/pen/abdyPBw' },
    keywords: /\b(parallax|journey|landscape|scroll(?:ing)? (?:story|animation|scene)|day to night|sunset|layers?)\b/,
  },
  {
    id: 'gallery',
    experience: 'gallery',
    name: 'Gallery wall',
    description: 'Walk along a 3D wall where every service hangs as a framed piece.',
    prompt: 'Present every service as a framed piece on a 3D gallery wall I can walk along.',
    icon: ICONS.gallery,
    reference: { title: 'Infinite Gallery Hall', author: 'nassimberrada', url: 'https://codepen.io/nassimberrada/pen/EayPjpM' },
    keywords: /\b(gallery|museum|exhibition|exhibit|art ?wall|framed|frames?)\b/,
  },
  {
    id: 'flipbook',
    experience: 'flipbook',
    name: 'Flipbook',
    description: 'A book with a spread for each category, turned like real pages.',
    prompt: 'Make the page a flipbook, with a two-page spread for each service category.',
    icon: ICONS.flipbook,
    reference: { title: 'Pure CSS Magazine style layout', author: 'jcoulterdesign', url: 'https://codepen.io/jcoulterdesign/pen/oRRRPY' },
    keywords: /\b(flip ?book|book|page[- ]?flip|flip(?:ping)? pages?|turn(?:ing)? pages?|spreads?)\b/,
  },
  {
    id: 'cube',
    experience: 'cube',
    name: 'Service cube',
    description: 'A 3D cube turns to a new face for each category as you read.',
    prompt: 'Put each service category on a face of a 3D cube that turns as I scroll.',
    icon: ICONS.cube,
    reference: { title: 'Six Faces', author: 'luis-lessrain', url: 'https://codepen.io/luis-lessrain/pen/ZYpyoRV' },
    keywords: /\b(cube|3d box|six faces|faces?|rotat(?:e|ing))\b/,
  },
  {
    id: 'magazine',
    experience: 'magazine',
    name: 'Editorial magazine',
    description: 'A cover story, asymmetric spreads and an index of every service.',
    prompt: 'Turn this into an editorial magazine.',
    icon: ICONS.magazine,
    reference: null, // the clone's own layout, no CodePen behind it
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
