/**
 * What the page watch reads from a fetched page, and the hashes it keeps (voice-guide ADR-0078 point 1
 * and 4; phase 6 design §4.2, §4.3). Only hashes leave this module: never page text (owner, Q5).
 *
 * - The page's region is #main-content, Vodafone's div[role=main] on every CMS page, and nothing else:
 *   no body fallback, which would pass a /spa/ page's header and footer as content (design M2, C2).
 *   Its text leaves out script, style, template, noscript, svg, Owl's copies, the layer's own elements
 *   and anything marked data-watch-ignore; whitespace is collapsed.
 * - A page is hashed twice: its region's text, masked, and its sorted same-origin links.
 * - A card is hashed from the live adapter's reading of it (title, description with its price, the call
 *   to action's label, the picture's file name), normalised and masked; its link is kept apart, so a
 *   new link says "It now opens a different page" and not "This card changed".
 *
 * The adapter's readPage and the Pocket's reconcile are passed in, never imported: a module the core or
 * the Pocket chunk shares with the watch chunk would become a shared chunk counted in the core (lesson
 * E5). The mask is passed in too (./mask.js in the layer), and nothing is hashed without it.
 */
import { normalise, isSameOrigin } from './url.js'

/**
 * The reading's version: the adapter's recognisers, this module's normalisation and serialisation, and
 * the mask's rules. Bump it whenever any of them changes (a recogniser fix, phase 4b, a mask rule copied
 * from agent-mask.ts): targets read with another version take a new baseline silently, so a code change
 * never reports a false "changed" (design §4.3, C9).
 */
export const READER_VERSION = 'watch-read-1 2026-11-18'

/** What the region's text leaves out. */
export const IGNORE = 'script,style,template,noscript,svg,.owl-item.cloned,[data-aixc],[data-watch-ignore]'

/** Whitespace of every kind collapsed to one space, trimmed. */
export const normaliseText = (s) => String(s ?? '').replace(/\s+/g, ' ').trim()

/** True when a region's text is long enough to be a static CMS page (the 200-character test, design M2). */
export const staticEnough = (text, minChars = 200) => String(text ?? '').length >= minChars

/** SHA-256 of the UTF-8 text, lowercase hex. */
export async function sha256(text) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** The text and the link targets under `root`, leaving out IGNORE's subtrees, in document order. */
const collect = (root) => {
  const text = []
  const hrefs = []
  const visit = (node) => {
    for (const child of node.childNodes) {
      if (child.nodeType === 3) text.push(child.nodeValue)
      else if (child.nodeType === 1 && !child.matches(IGNORE)) {
        if (child.tagName === 'A') {
          const href = child.getAttribute('href')
          if (href) hrefs.push(href)
        }
        visit(child)
      }
    }
  }
  visit(root)
  return { text: normaliseText(text.join('')), hrefs }
}

/**
 * The page's region: { text, chars, staticEnough }, or null when the page has no #main-content.
 * `text` stays in memory for the hash; it is never stored.
 */
export function region(doc, { minChars = 200 } = {}) {
  const main = doc?.getElementById?.('main-content')
  if (!main) return null
  const { text } = collect(main)
  return { text, chars: text.length, staticEnough: staticEnough(text, minChars) }
}

const needMask = (mask) => {
  if (typeof mask !== 'function') throw new TypeError('the watch hashes masked text only: pass { mask }')
}

/**
 * The page's hashes: { textHash, linksHash, chars, staticEnough, links }, or null with no #main-content.
 * `origin` keeps the links to the page's own site; `url` (the fetched page's final URL) resolves them.
 */
export async function pageDigest(doc, { mask, origin, url = origin, minChars = 200 } = {}) {
  needMask(mask)
  const main = doc?.getElementById?.('main-content')
  if (!main) return null
  const { text, hrefs } = collect(main)
  const links = [...new Set(hrefs.map((h) => normalise(h, url)).filter((h) => h && isSameOrigin(h, origin)))].sort()
  const [textHash, linksHash] = await Promise.all([sha256(mask(text)), sha256(links.join('\n'))])
  return { textHash, linksHash, chars: text.length, staticEnough: staticEnough(text, minChars), links: links.length }
}

/** A picture's file name: the last segment of its path that is not an id, decoded, without the query. */
const pictureOf = (src) => {
  if (!src) return null
  let path
  try {
    path = new URL(src, 'https://x.invalid').pathname
  } catch {
    return null
  }
  const parts = path.split('/').filter(Boolean)
  const file = [...parts].reverse().find((p) => /\.[a-z0-9]{2,5}$/i.test(p)) ?? parts.at(-1) ?? null
  try {
    return file && decodeURIComponent(file)
  } catch {
    return file
  }
}

/**
 * A card's reading as the hash takes it, from a model item (the adapter's) or a Pocket record (made
 * from one): kind, title, description (its price included), the call to action's label and kind, the
 * picture's file name. Not its id or keys (they say where it is, not what it says), not its link.
 */
const fieldsOf = (x) => {
  const copy = x.copy || x
  const cta = x.cta || null
  return [x.kind ?? null, normaliseText(copy.title), normaliseText(copy.description) || null, normaliseText(cta?.label) || null, cta?.opens ?? null, pictureOf(x.image?.src)]
}

/** The card's hash (its reading, normalised, masked) and its link (normalised, or null): { hash, href }. */
export async function cardDigest(x, { mask } = {}) {
  needMask(mask)
  const hash = await sha256(mask(JSON.stringify(fieldsOf(x))))
  const href = x.cta?.href ? normalise(x.cta.href) : null
  return { hash, href }
}

/**
 * The sticker's card in a fetched document, found as the Pocket finds it on a live page: `read` (the
 * adapter's readPage) gives the model, `reconcile` (the Pocket's) the card. `page` is the page the
 * document is, by default the sticker's own ({ path, lang, site, search }). Returns { item, section,
 * model }; item is null when the card is not there, and model too when the page could not be read.
 */
export function findCard(doc, record, { read, reconcile, origin, page = null }) {
  const at = page ?? { path: record.source.path, lang: record.copy.lang, site: record.source.site === 'shop' ? 'shop' : 'web', search: '' }
  const { model } = read(doc, { origin, path: at.path, search: at.search ?? '' })
  if (!model) return { item: null, section: null, model: null }
  const id = reconcile([record], model, { page: at }).ids.get(record.key)
  for (const section of model.sections) for (const item of section.items) if (item.id === id) return { item, section, model }
  return { item: null, section: null, model }
}
