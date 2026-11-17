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

// The schemas and the cards' names and icons live in template-schema.js (it carries no pens: Vodafone's
// pages load it, voice-guide ADR-0076); this file adds what the clone's composer shows and matches.
import { TEMPLATE_CARDS, buildGroupSchema, buildTemplateSchema } from './template-schema.js'

export { buildGroupSchema, buildTemplateSchema }

/** Each card's line, prompt, pen and keywords, by template id. */
const DETAILS = {
  streaming: {
    description: 'A cinematic logo intro, a billboard and rows of services, like a streaming home.',
    prompt: 'Make it a streaming-style home with a cinematic logo intro and rows of services.',
    reference: { title: 'Flix', author: 'Bahaa-Addin', url: 'https://codepen.io/Bahaa-Addin/pen/YayLbo' },
    keywords: /\b(netflix|streaming|stream|binge|movies?|tv app|billboard|thumbnails?)\b/,
  },
  split: {
    description: 'Each service fills a split screen whose halves slide past each other as you scroll.',
    prompt: 'Show each service as a full-screen split slideshow whose halves slide past each other as I scroll.',
    reference: { title: 'Split Slick Slideshow', author: 'supah', url: 'https://codepen.io/supah/pen/zZaPeE' },
    keywords: /\b(split(?:[- ]screen)?|two halves|halves|mirrored slides?)\b/,
  },
  fan: {
    description: 'Numbered service cards fan out on a diagonal; drag, scroll or swipe through them.',
    prompt: 'Fan the services out as a stack of numbered cards I can drag or scroll through.',
    reference: { title: 'Carousel with drag and wheel', author: 'supah', url: 'https://codepen.io/supah/pen/xxJMbbg' },
    keywords: /\b(fan(?:ned)?(?: out)?|card fan|deck(?: of cards)?|card deck|stack(?:ed)? (?:of )?cards|card stack|drag(?:gable)? cards|swipe(?:able)? cards)\b/,
  },
  ring: {
    description: 'Services stand on a 3D ring that turns as you scroll, each one stopping in front of you.',
    prompt: 'Put the services on a 3D ring that turns as I scroll, stopping on each one.',
    reference: { title: 'Infinite February', author: 'cobra_winfrey', url: 'https://codepen.io/cobra_winfrey/pen/podWgvv' },
    keywords: /\b(ring|wheel|merry[- ]go[- ]round|carousel ring|revolving|turntable|calendar)\b/,
  },
  tunnel: {
    description: 'Fly down a 3D tunnel of service cards; the faster you scroll, the more the view warps.',
    prompt: 'Fly me through a 3D tunnel of service cards that warps as I scroll faster.',
    reference: { title: 'Hyper Scroll', author: 'aleksa-rakocevic', url: 'https://codepen.io/aleksa-rakocevic/pen/pvbboZx' },
    keywords: /\b(tunnel|hyper ?scroll|hyperspace|warp(?: speed)?|fly(?:ing)? (?:me )?through|wormhole|star ?field|brutalist)\b/,
  },
  canvas: {
    description: 'Drag around an endless grid of services and open any card to zoom in.',
    prompt: 'Lay the services out on an endless canvas I can drag around, and zoom into any card.',
    reference: { title: 'Infinite Draggable Image Gallery', author: 'filipz', url: 'https://codepen.io/filipz/pen/dPPyJZX' },
    keywords: /\b(infinite (?:canvas|grid|gallery|wall)|canvas|draggable|drag around|pan(?:ning)? around|endless grid|mood ?board)\b/,
  },
  coverflow: {
    description: 'Flip through the services like album covers, with reflections on a glossy floor.',
    prompt: 'Let me flip through the services like album covers in a cover flow.',
    reference: { title: 'Infinite Cover Flow w/ GSAP', author: 'jh3y', url: 'https://codepen.io/jh3y/pen/WNRvqJP' },
    keywords: /\b(cover ?flow|album(?: art| covers?)?|vinyl|itunes|glossy floor)\b/,
  },
  spotlight: {
    description: 'Each service takes the stage in turn, with the next ones queued as cards.',
    prompt: 'Show each service as a full-screen spotlight, with the next services lined up as cards.',
    reference: { title: 'Timed Cards Opening', author: 'dilums', url: 'https://codepen.io/dilums/full/NWodZMd' },
    keywords: /\b(spotlight|timed cards?|slide ?show|carousel|slider|full[- ]?screen|cinematic|queued? cards?)\b/,
  },
  journey: {
    description: 'A layered Vodafone landscape moves from day to night as you scroll through each category.',
    prompt: 'Turn the page into a parallax scroll journey through each service category.',
    reference: { title: 'Parallax scroll animation', author: 'isladjan', url: 'https://codepen.io/isladjan/pen/abdyPBw' },
    keywords: /\b(parallax|journey|landscape|scroll(?:ing)? (?:story|animation|scene)|day to night|sunset|layers?)\b/,
  },
  gallery: {
    description: 'Walk along a 3D wall where every service hangs as a framed piece.',
    prompt: 'Present every service as a framed piece on a 3D gallery wall I can walk along.',
    reference: { title: 'Infinite Gallery Hall', author: 'nassimberrada', url: 'https://codepen.io/nassimberrada/pen/EayPjpM' },
    keywords: /\b(gallery|museum|exhibition|exhibit|art ?wall|framed|frames?)\b/,
  },
  flipbook: {
    description: 'A book with a spread for each category, turned like real pages.',
    prompt: 'Make the page a flipbook, with a two-page spread for each service category.',
    reference: { title: 'Pure CSS Magazine style layout', author: 'jcoulterdesign', url: 'https://codepen.io/jcoulterdesign/pen/oRRRPY' },
    keywords: /\b(flip ?book|book|page[- ]?flip|flip(?:ping)? pages?|turn(?:ing)? pages?|spreads?)\b/,
  },
  cube: {
    description: 'A 3D cube turns to a new face for each category as you read.',
    prompt: 'Put each service category on a face of a 3D cube that turns as I scroll.',
    reference: { title: 'Six Faces', author: 'luis-lessrain', url: 'https://codepen.io/luis-lessrain/pen/ZYpyoRV' },
    keywords: /\b(cube|3d box|six faces|faces?|rotat(?:e|ing))\b/,
  },
  magazine: {
    description: 'A cover story, asymmetric spreads and an index of every service.',
    prompt: 'Turn this into an editorial magazine.',
    reference: null, // the clone's own layout, no CodePen behind it
    keywords: /\b(magazine|editorial)\b/,
  },
}

export const TEMPLATES = TEMPLATE_CARDS.map(({ id, experience, name, icon }) => {
  const { description, prompt, reference, keywords } = DETAILS[id]
  return { id, experience, name, description, prompt, icon, reference, keywords }
})

export const getTemplate = (id) => TEMPLATES.find((template) => template.id === id) ?? null

/** Finds the template a free-text prompt is plainly asking for, or null. */
export const matchTemplate = (prompt = '') => {
  const text = String(prompt).toLowerCase()
  return TEMPLATES.find((template) => template.keywords.test(text)) ?? null
}
