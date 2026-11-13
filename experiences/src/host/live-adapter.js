/**
 * The live adapter (voice-guide ADR-0046 §3; live plan §3.4, phase 2): reads Vodafone's own page
 * into the content model the demos already use (experiences/src/content/vodafone-services.js
 * describes it), in place of the clone's hand-typed content.
 *
 * - Sections are Vodafone's Liferay portlets in #main-content, keyed by their instance id
 *   (`..._INSTANCE_w9Jro8TDb1vH_` → `w9jro8tdb1vh`), which stays the same across days and languages.
 * - Items are the cards the recognisers (./recognisers.js) find; Owl's copies, dialogs, FAQ entries
 *   and the like are never read.
 * - An item's id should survive a re-crawl and, where the page allows, be the same in both
 *   languages, so it comes from, in order: its link's path, its picture's file name, its title's
 *   Latin letters and digits, its tab and title, its place in the section; the first of these that
 *   is unique on the page wins (the plan's path-only rule collided on real pages: six Shokran cards
 *   share one link, all bundles link /spa/miManagement; there the titles decide, so English and
 *   Arabic ids differ; O26, ADR-0049).
 * - Coverage: how many of the cards found have a title and an action (a link, or one of the page's
 *   own dialogs). A demo is offered on a page only above its threshold.
 *
 * readPage() only reads (it runs on any document, in tests too); createLiveAdapter() also tags what
 * it read (data-aixc-section, data-aixc-item) and can take the tags off again.
 */
import { normalizeContentModel } from '../aixc/content-index.js'
import { RECOGNISERS, SECTION_SUBTITLE, SECTION_TITLE, SKIP } from './recognisers.js'

const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/
const STORES = 'a[href*="apps.apple.com"], a[href*="play.google.com"], a[href*="appgallery"]'

const clean = (s) => (s || '').replace(/\s+/g, ' ').trim()
const textOf = (el) => clean(el?.textContent)

/** Lower-case ASCII words joined by '-' ('' when the text has no ASCII letters or digits). */
export const slug = (s) =>
  clean(s)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

const toId = (s) => {
  const id = slug(s).slice(0, 64).replace(/-+$/, '')
  return ID_PATTERN.test(id) ? id : ''
}

/**
 * A link or picture address as the browser resolves it: against the page's own address (Vodafone
 * writes `href="vodafone-cash"` on /ar/services and means /ar/vodafone-cash), or the page's <base>.
 */
const absolute = (href, base) => {
  if (!href || /^(javascript:|#$|mailto:|tel:)/i.test(href.trim())) return null
  try {
    return new URL(href.trim(), base).href
  } catch {
    return null
  }
}

/** The address relative links resolve against: the page's <base href> when it has one, else its own. */
const baseOf = (doc, origin, path, search = '') => {
  const own = `${origin}${path}${search}`
  const declared = doc.querySelector('base[href]')?.getAttribute('href')
  try {
    return declared ? new URL(declared, own).href : own
  } catch {
    return own
  }
}

/** The first element matching `selector` inside `root` that is not in a part we never read. */
const first = (root, selector) => {
  if (!selector) return null
  for (const el of root.querySelectorAll(selector)) if (!el.closest('.modal')) return el
  return null
}

const imageOf = (img, base) => {
  if (!img) return null
  const src = absolute(img.getAttribute('data-src') || img.getAttribute('src'), base)
  if (!src || src.startsWith('data:')) return null
  const n = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : null)
  return { src, width: n(img.naturalWidth) || n(img.getAttribute('width')), height: n(img.naturalHeight) || n(img.getAttribute('height')), alt: clean(img.getAttribute('alt')) || null }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** A CMS picture's file name: /documents/<group>/<folder>/<name>/<uuid>?t=… gives <name> ('+' is a space). */
const fileName = (src) => {
  const parts = src.split('?')[0].split('/').filter(Boolean)
  const name = UUID.test(parts.at(-1) || '') ? parts.at(-2) : parts.at(-1)
  try {
    return decodeURIComponent((name || '').replace(/\+/g, ' '))
  } catch {
    return name || ''
  }
}

/** Id candidates for a card, most stable first. */
const candidates = ({ href, image, title, el, sectionId, origin, path }) => {
  const out = []
  if (href) {
    try {
      const u = new URL(href)
      // A link into this same page is known by its fragment alone.
      const where = u.origin === origin && u.pathname === path && u.hash ? '/' : u.pathname.replace(/^\/(en|ar)(\/|$)/, '/')
      if (u.origin === origin || /vodafone/.test(u.hostname)) out.push(toId(`${where}${u.hash}`))
    } catch {}
  }
  const file = image?.src && /\/documents\//.test(image.src) ? fileName(image.src) : ''
  if (file) out.push(toId(file.replace(/\(\d+\)/g, '').replace(/\.[a-z0-9]+$/i, '')))
  out.push(toId(title))
  const pane = el.closest('[id]')
  if (pane && pane.id && !/^p_p_id|^portlet_/.test(pane.id)) out.push(toId(`${pane.id}-${slug(title) || slug(file)}`))
  return out.filter(Boolean).concat(`${sectionId}-item`)
}

/**
 * What a card can be known by, kind by kind, so a saved sticker can find its card again when its id
 * changes (an editor adds a card sharing its link), on the page in the other language, or on another
 * date (ADR-0049 §8): the link's path (without /en or /ar), the picture's file name, the title as
 * shown (lower case, spaces collapsed), the tab it sits in, and the numbers in its title ("1400",
 * "25-55"), which both languages share. The id is still the first unique candidate above.
 */
const keysOf = ({ href, image, title, el, origin, path }) => {
  const keys = []
  if (href) {
    try {
      const u = new URL(href)
      const where = u.origin === origin && u.pathname === path && u.hash ? '/' : u.pathname.replace(/^\/(en|ar)(\/|$)/, '/')
      if (u.origin === origin || /vodafone/.test(u.hostname)) keys.push({ kind: 'link', value: `${u.origin === origin ? '' : u.hostname}${where}${u.hash}` })
    } catch {}
  }
  const file = image?.src && /\/documents\//.test(image.src) ? fileName(image.src) : ''
  if (file) keys.push({ kind: 'picture', value: file.replace(/\(\d+\)/g, '').replace(/\.[a-z0-9]+$/i, '').toLowerCase() })
  const words = clean(title).toLowerCase()
  if (words) keys.push({ kind: 'title', value: words })
  const pane = el.closest('[id]')
  if (pane && pane.id && !/^p_p_id|^portlet_/.test(pane.id)) keys.push({ kind: 'tab', value: pane.id })
  const digits = (clean(title).replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660)).match(/\d+(?:[.,]\d+)?/g) || []).join('-')
  if (digits) keys.push({ kind: 'digits', value: digits })
  return keys
}

/**
 * Which knowledge destination each portlet is (the guide's own names for the page's sections): a
 * destination's first locator that finds exactly one element, inside one portlet. Where several land on
 * the same portlet: section destinations before card lists and FAQs; among those, the one whose title
 * is the section's (both titled); else the innermost (a locator for the whole portlet gives way to one
 * for the section inside it, as the trail's resolver does, deepest first). Kept on the model
 * (`section.destinationId`), never tagged on Vodafone's portlets: a tag there would make the whole
 * portlet the trail's target and hide its cards and pictures (ADR-0049).
 */
const matchDestinations = (doc, pageMap, sections, portletOf, lang) => {
  const norm = (t) => clean(t).toLowerCase()
  const titleOf = (d) => norm(d.title?.[lang] || d.title?.en)
  const found = []
  for (const d of pageMap?.sections || []) {
    const el = (d.css || [])
      .filter((c) => !/data-vg-destination/.test(c))
      .map((c) => {
        try {
          const all = doc.querySelectorAll(c)
          return all.length === 1 ? all[0] : null
        } catch {
          return null
        }
      })
      .find(Boolean)
    const pb = el && (el.closest('#layout-column_column-1 > .portlet-boundary') || el.closest('.portlet-boundary'))
    if (pb && !(el !== pb && el.contains(pb))) found.push({ d, el, pb })
  }
  for (const section of sections) {
    const pb = portletOf.get(section.id)
    const here = found.filter((f) => f.pb === pb)
    const own = here.filter((f) => f.d.kind === 'section')
    const pool = own.length ? own : here
    const title = norm(section.title)
    const titled = title ? pool.find((f) => titleOf(f.d) === title) : null
    const innermost = pool.find((f) => !pool.some((g) => g.el !== f.el && f.el.contains(g.el)))
    const pick = titled || innermost || pool[0]
    if (pick) section.destinationId = pick.d.id
  }
}

/** Never counted as an unread card: what we never read, navigation furniture, a section's own heading link, app-store badges. */
const NOT_CARDS = `${SKIP}, nav, .nav, [role="tablist"], .owl-dots, .owl-nav, .breadcrumb, .pagination, form, table, .section-title, .hello`
const PRESSABLE = 'a[href], button, [data-toggle="modal"]'
const CARD_SIGNS = 'img, picture, svg, h1, h2, h3, h4, h5, h6, .btn, button'

/**
 * Card-like blocks in a portlet that no recogniser row read. Each thing a person can press that no
 * read card holds is grown to the largest block that still holds only it; the block counts when it
 * has words and a picture, a heading or a button (a link in a sentence does not). They count against
 * coverage, so a card class Vodafone renames, which simply stops matching, lowers the ratio instead
 * of leaving it at 1 with the cards gone (ADR-0049 §3).
 */
const unreadCards = (pb, claimed) => {
  const read = [...claimed]
  const taken = (el) => read.some((c) => c === el || c.contains(el) || el.contains(c))
  const pressables = [...pb.querySelectorAll(PRESSABLE)].filter((a) => !a.closest(NOT_CARDS) && !a.matches(STORES) && !taken(a) && !/^(#|javascript:)/i.test(a.getAttribute('href') || ''))
  const holds = (el) => pressables.filter((a) => el === a || el.contains(a)).length
  const blocks = new Set()
  for (const a of pressables) {
    let block = a
    while (block.parentElement && block.parentElement !== pb && pb.contains(block.parentElement) && holds(block.parentElement) === 1 && !read.some((c) => block.parentElement.contains(c))) block = block.parentElement
    if (clean(block.textContent) && (block.matches(CARD_SIGNS) || block.querySelector(CARD_SIGNS))) blocks.add(block)
  }
  return [...blocks]
}

/** Reads the page. `origin` resolves relative links and pictures; `pageMap` (GET /v1/page-map) names the sections. */
export function readPage(doc, { origin = doc.defaultView?.location.origin || 'https://web.vodafone.com.eg', path = doc.defaultView?.location.pathname || '/', search = doc.defaultView?.location.search || '', pageMap = null } = {}) {
  const problems = []
  const main = doc.getElementById('main-content')
  if (!main) return { model: null, problems: ['No #main-content on this page.'], coverage: { ratio: 0, cards: 0, usable: 0, unread: 0, sections: [] }, tags: [] }
  const boundaries = [...main.querySelectorAll('#layout-column_column-1 > .portlet-boundary')]
  const portlets = boundaries.length ? boundaries : [...main.querySelectorAll('.portlet-boundary')].filter((b) => !b.parentElement?.closest('.portlet-boundary'))

  const base = baseOf(doc, origin, path, search)
  const page = { pageId: toId(path) || 'page', sourceUrl: `${origin}${path}`, title: null, intro: null, heroImage: null, sections: [], closingPromotion: null }
  const raw = []
  const coverage = { ratio: 0, cards: 0, usable: 0, unread: 0, sections: [] }
  const portletOf = new Map()

  portlets.forEach((pb, index) => {
    const instance = /_INSTANCE_([A-Za-z0-9]+)_?$/.exec(pb.id || '')?.[1]
    const sectionId = toId(instance || '') || `section-${index + 1}`
    // Cards, each once (a card can match two rows: .card-plan is also .card-collapsing), in page order.
    const claimed = new Set()
    // Known and left out on purpose (a sign-in ticket): not a card, and not an unread one either.
    const leftOut = new Set()
    const cards = []
    for (const row of RECOGNISERS) {
      for (const el of pb.querySelectorAll(row.match)) {
        if (row.exclude && row.exclude(el) && !(row.when && !row.when(el))) leftOut.add(el)
        if (claimed.has(el) || el.closest(SKIP) || (row.when && !row.when(el)) || (row.exclude && row.exclude(el))) continue
        claimed.add(el)
        cards.push({ el, row })
      }
    }
    cards.sort((a, b) => (a.el.compareDocumentPosition(b.el) & 4 ? -1 : 1))

    const titleEl = SECTION_TITLE.map((s) => first(pb, s)).find(Boolean)
    const subtitleEl = first(pb, SECTION_SUBTITLE)
    const sectionTitle = textOf(titleEl) || null
    const hero = pb.querySelector('.hello')

    // With no card read, one pressable block is the portlet's own button (a hero, a promo band); two or
    // more are cards no row knows.
    const found = unreadCards(pb, new Set([...claimed, ...leftOut]))
    const unread = cards.length || found.length > 1 ? found : []

    if (hero && !cards.length && !unread.length) {
      page.title = textOf(first(pb, '.hello-title')) || textOf(first(pb, 'h1')) || sectionTitle
      page.intro = textOf(first(pb, '.hello p, .hello h4')) || null
      page.heroImage = imageOf(first(pb, '.section-img-wrapper img, img'), base)
      return
    }
    const stores = [...pb.querySelectorAll(STORES)].filter((a) => !a.closest('.modal'))
    if (stores.length && !cards.length && !unread.length) {
      page.closingPromotion = {
        id: toId(sectionTitle || 'download-app') || 'download-app',
        title: sectionTitle,
        lead: null,
        description: textOf(first(pb, 'p')) || null,
        storesLabel: null,
        stores: stores.map((a) => ({ label: clean(a.getAttribute('aria-label') || a.getAttribute('title') || a.textContent) || new URL(a.href, base).hostname, icon: null, href: absolute(a.getAttribute('href'), base) })),
        qr: (() => {
          const img = [...pb.querySelectorAll('img')].find((i) => /qr/i.test(`${i.getAttribute('alt')} ${i.getAttribute('data-src') || i.getAttribute('src')}`))
          return img ? { title: clean(img.getAttribute('alt')) || null, image: imageOf(img, base) } : null
        })(),
      }
      raw.push({ kind: 'promotion', el: pb, sectionId, sectionEl: pb, item: null })
      return
    }

    const section = { id: sectionId, title: sectionTitle, description: textOf(subtitleEl) || null, cta: null, aside: null, items: [] }
    portletOf.set(sectionId, pb)
    // `cards` counts what looks like a card, read or not; `unread` says how many no row matched.
    const sectionCover = { id: sectionId, title: sectionTitle, cards: cards.length + unread.length, usable: 0, unread: unread.length }
    const sectionLink = first(pb, '.section-title a.btn[href]')
    if (sectionLink) section.cta = { label: textOf(sectionLink) || null, href: absolute(sectionLink.getAttribute('href'), base) }

    for (const { el, row } of cards) {
      const titleNode = first(el, row.title)
      const image = imageOf(row.image ? first(el, row.image) : null, base)
      const title = textOf(titleNode) || image?.alt || ''
      const linkEl = row.link === ':self' ? el : first(el, row.link) || el.closest('a[href]')
      const href = absolute(linkEl?.getAttribute('href'), base)
      const label = row.linkLabel ? textOf(first(el, row.linkLabel)) || null : null
      const descriptionParts =
        row.kind === 'card-plan'
          ? [textOf(first(el, row.price)), ...[...el.querySelectorAll(row.description)].slice(0, 4).map(textOf)]
          : [textOf(first(el, row.price)), textOf(first(el, row.description))]
      const description = descriptionParts.filter(Boolean).join(' · ') || null
      // No link, but the card opens one of the page's own dialogs (Great Entertainment: "Download Ana
      // Vodafone"): the action is the page's, so no link is invented; the original card stays tagged.
      const opensDialog = !href && (!!(linkEl || el).closest('[data-toggle="modal"]') || !!el.querySelector('[data-toggle="modal"]'))
      const cta = href ? { label, href } : opensDialog ? { label, href: null, opens: 'dialog' } : label ? { label, href: null } : null
      if (title && (href || opensDialog)) sectionCover.usable++
      if (!href && opensDialog) sectionCover.dialogs = (sectionCover.dialogs || 0) + 1
      raw.push({ kind: row.kind, el, sectionId, sectionEl: pb, item: { title, description, image, cta, kind: row.kind, keys: keysOf({ href, image, title, el, origin, path }) }, cand: candidates({ href, image, title, el, sectionId, origin, path }) })
    }

    // A section with no cards but a heading, a picture and a button reads as one item (a promo band).
    if (!cards.length && !unread.length && sectionTitle) {
      const btn = first(pb, 'a.btn[href]')
      const image = imageOf(first(pb, 'img'), base)
      if (btn && (image || subtitleEl)) {
        const href = absolute(btn.getAttribute('href'), base)
        raw.push({ kind: 'band', el: pb, sectionId, sectionEl: pb, item: { title: sectionTitle, description: textOf(subtitleEl) || null, image, cta: { label: textOf(btn) || null, href }, kind: 'band', keys: keysOf({ href, image, title: sectionTitle, el: pb, origin, path }) }, cand: candidates({ href, image, title: sectionTitle, el: pb, sectionId, origin, path }) })
      }
    }
    if (sectionCover.cards) coverage.sections.push(sectionCover)
    coverage.cards += sectionCover.cards
    coverage.usable += sectionCover.usable
    coverage.unread += sectionCover.unread
    page.sections.push(section)
  })

  // Ids: the first candidate that no other card on the page also has; else the section and its place.
  const items = raw.filter((r) => r.item)
  const counts = new Map()
  for (const r of items) for (const c of new Set(r.cand)) counts.set(c, (counts.get(c) || 0) + 1)
  const used = new Set(page.closingPromotion ? [page.closingPromotion.id] : [])
  const ordinals = new Map()
  for (const r of items) {
    let id = r.cand.find((c) => counts.get(c) === 1 && !used.has(c))
    if (!id) {
      const n = (ordinals.get(r.sectionId) || 0) + 1
      ordinals.set(r.sectionId, n)
      id = `${r.sectionId}-${n}`
      while (used.has(id)) id = `${id}-x`
    }
    used.add(id)
    r.item = { id, ...r.item }
    page.sections.find((s) => s.id === r.sectionId)?.items.push(r.item)
  }
  page.sections = page.sections.filter((s) => s.items.length)
  matchDestinations(doc, pageMap, page.sections, portletOf, /^\/ar(\/|$)/.test(path) ? 'ar' : 'en')
  coverage.ratio = coverage.cards ? Math.round((coverage.usable / coverage.cards) * 1000) / 1000 : 0

  const { model, problems: modelProblems } = normalizeContentModel(page)
  problems.push(...modelProblems)
  const tags = [
    ...new Map(raw.map((r) => [r.sectionEl, { el: r.sectionEl, name: 'aixcSection', value: r.sectionId }])).values(),
    ...items.filter((r) => r.kind !== 'band').map((r) => ({ el: r.el, name: 'aixcItem', value: r.item.id })),
    ...items.filter((r) => r.kind === 'band').map((r) => ({ el: r.el.querySelector('.journal-content-article') || r.el, name: 'aixcItem', value: r.item.id })),
  ]
  return { model, problems, coverage, tags }
}

/** The marks the layer puts on Vodafone's elements, as dataset names and as a selector. */
const MARKS = ['aixcItem', 'aixcSection']
const MARKED = '[data-aixc-item], [data-aixc-section]'

/**
 * True when a change to the page is the layer's own: it happened inside something the layer added, or
 * it is only the layer's own elements coming or going. Words changing in Vodafone's own elements (a
 * new price, a late title) are Vodafone's.
 */
const ours = (record) => {
  const where = record.target.nodeType === 1 ? record.target : record.target.parentElement
  if (where?.closest('[data-aixc]')) return true
  const nodes = [...record.addedNodes, ...record.removedNodes]
  return record.type === 'childList' && nodes.length > 0 && nodes.every((n) => n.nodeType === 1 && n.hasAttribute('data-aixc'))
}

/**
 * The adapter the demos take (src/aixc/page-adapters.js contract): pageId, label, renderOriginal()
 * (nothing to draw: the page is Vodafone's) and extractContent() (the model as last read).
 *
 * tag() marks what was read on Vodafone's elements and takes the marks off everything else: a
 * carousel builds its copies from the cards' own markup, so a copy made after tagging carries the
 * mark until the next tag(). untag() takes every mark off the page (the guard's clean-up).
 *
 * The page changes after it loads (carousels, lazy sections, an editor's banner): refresh() reads
 * it again, with the same ids for the same cards, and watch() does so whenever Vodafone's own
 * content under #main-content changes (ADR-0049 §7).
 */
export function createLiveAdapter({ doc = document, origin, path, pageMap = null } = {}) {
  let read = null
  let tagging = false
  const result = () => (read ??= readPage(doc, { origin, path, pageMap }))
  const adapter = {
    get pageId() {
      return result().model?.pageId ?? 'page'
    },
    get label() {
      return result().model?.title ?? doc.title
    },
    renderOriginal() {},
    extractContent() {
      const { model, problems, coverage } = result()
      return { model, problems, coverage }
    },
    tag() {
      tagging = true
      const wanted = new Map()
      for (const { el, name, value } of result().tags) wanted.set(el, { ...(wanted.get(el) || {}), [name]: value })
      for (const [el, marks] of wanted) for (const [name, value] of Object.entries(marks)) if (el.dataset[name] !== value) el.dataset[name] = value
      for (const el of doc.querySelectorAll(MARKED)) for (const name of MARKS) if (name in el.dataset && !(name in (wanted.get(el) || {}))) delete el.dataset[name]
    },
    untag() {
      tagging = false
      for (const el of doc.querySelectorAll(MARKED)) for (const name of MARKS) delete el.dataset[name]
    },
    /** Reads the page again; true when the model is not what it was. Re-tags if the page is tagged. */
    refresh() {
      const before = JSON.stringify(read?.model ?? null)
      read = null
      const changed = JSON.stringify(result().model ?? null) !== before
      if (tagging) adapter.tag()
      return changed
    },
    /**
     * Re-reads when Vodafone's content under #main-content changes (elements or words), `delay` ms
     * after the last change and at the latest `maxWait` ms after the first one not yet read.
     * `onChange({ model, problems, coverage, changed })` is called after each re-read, through
     * `run` (the layer's guard). Returns the function that stops watching.
     */
    watch(onChange, { delay = 250, maxWait = 2000, run = (fn) => fn() } = {}) {
      const main = doc.getElementById('main-content')
      const Observer = doc.defaultView?.MutationObserver
      if (!main || !Observer) return () => {}
      let timer = 0
      let since = 0
      const observer = new Observer((records) => {
        if (records.every(ours)) return
        const now = Date.now()
        since ||= now
        clearTimeout(timer)
        timer = setTimeout(
          () =>
            run(() => {
              since = 0
              const changed = adapter.refresh()
              onChange?.({ ...adapter.extractContent(), changed })
            }),
          Math.max(0, Math.min(delay, since + maxWait - now)),
        )
      })
      observer.observe(main, { childList: true, subtree: true, characterData: true })
      return () => {
        clearTimeout(timer)
        observer.disconnect()
      }
    },
  }
  return adapter
}
