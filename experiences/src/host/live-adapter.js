/**
 * The live adapter (voice-guide ADR-0046 §3; live plan §3.4, phase 2): reads Vodafone's own page
 * into the content model the demos already use (experiences/src/content/vodafone-services.js
 * describes it), in place of the clone's hand-typed content.
 *
 * - Sections are Vodafone's Liferay portlets in #main-content, keyed by their instance id
 *   (`..._INSTANCE_w9Jro8TDb1vH_` → `w9jro8tdb1vh`), which stays the same across days and languages.
 * - Items are the cards the recognisers (./recognisers.js) find; Owl's copies, dialogs, FAQ entries
 *   and the like are never read.
 * - An item's id must survive a re-crawl and work in both languages, so it comes from, in order:
 *   its link's path, its picture's file name, its English title, its tab and title, its place in the
 *   section; the first of these that is unique on the page wins (the plan's path-only rule collided
 *   on real pages: six Shokran cards share one link, all bundles link /spa/miManagement; O26).
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

const absolute = (href, origin) => {
  if (!href || /^(javascript:|#$|mailto:|tel:)/i.test(href.trim())) return null
  try {
    return new URL(href.trim(), `${origin}/`).href
  } catch {
    return null
  }
}

/** The first element matching `selector` inside `root` that is not in a part we never read. */
const first = (root, selector) => {
  if (!selector) return null
  for (const el of root.querySelectorAll(selector)) if (!el.closest('.modal')) return el
  return null
}

const imageOf = (img, origin) => {
  if (!img) return null
  const src = absolute(img.getAttribute('data-src') || img.getAttribute('src'), origin)
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
const candidates = ({ href, image, title, el, sectionId, origin }) => {
  const out = []
  if (href) {
    try {
      const u = new URL(href)
      if (u.origin === origin || /vodafone/.test(u.hostname)) out.push(toId(`${u.pathname.replace(/^\/(en|ar)(\/|$)/, '/')}${u.hash}`))
    } catch {}
  }
  const file = image?.src && /\/documents\//.test(image.src) ? fileName(image.src) : ''
  if (file) out.push(toId(file.replace(/\(\d+\)/g, '').replace(/\.[a-z0-9]+$/i, '')))
  out.push(toId(title))
  const pane = el.closest('[id]')
  if (pane && pane.id && !/^p_p_id|^portlet_/.test(pane.id)) out.push(toId(`${pane.id}-${slug(title) || slug(file)}`))
  return out.filter(Boolean).concat(`${sectionId}-item`)
}

/** Reads the page. `origin` resolves relative links and pictures. */
export function readPage(doc, { origin = doc.defaultView?.location.origin || 'https://web.vodafone.com.eg', path = doc.defaultView?.location.pathname || '/' } = {}) {
  const problems = []
  const main = doc.getElementById('main-content')
  if (!main) return { model: null, problems: ['No #main-content on this page.'], coverage: { ratio: 0, cards: 0, usable: 0, sections: [] }, tags: [] }
  const boundaries = [...main.querySelectorAll('#layout-column_column-1 > .portlet-boundary')]
  const portlets = boundaries.length ? boundaries : [...main.querySelectorAll('.portlet-boundary')].filter((b) => !b.parentElement?.closest('.portlet-boundary'))

  const page = { pageId: toId(path) || 'page', sourceUrl: `${origin}${path}`, title: null, intro: null, heroImage: null, sections: [], closingPromotion: null }
  const raw = []
  const coverage = { ratio: 0, cards: 0, usable: 0, sections: [] }

  portlets.forEach((pb, index) => {
    const instance = /_INSTANCE_([A-Za-z0-9]+)_?$/.exec(pb.id || '')?.[1]
    const sectionId = toId(instance || '') || `section-${index + 1}`
    // Cards, each once (a card can match two rows: .card-plan is also .card-collapsing), in page order.
    const claimed = new Set()
    const cards = []
    for (const row of RECOGNISERS) {
      for (const el of pb.querySelectorAll(row.match)) {
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

    if (hero && !cards.length) {
      page.title = textOf(first(pb, '.hello-title')) || textOf(first(pb, 'h1')) || sectionTitle
      page.intro = textOf(first(pb, '.hello p, .hello h4')) || null
      page.heroImage = imageOf(first(pb, '.section-img-wrapper img, img'), origin)
      return
    }
    const stores = [...pb.querySelectorAll(STORES)].filter((a) => !a.closest('.modal'))
    if (stores.length && !cards.length) {
      page.closingPromotion = {
        id: toId(sectionTitle || 'download-app') || 'download-app',
        title: sectionTitle,
        lead: null,
        description: textOf(first(pb, 'p')) || null,
        storesLabel: null,
        stores: stores.map((a) => ({ label: clean(a.getAttribute('aria-label') || a.getAttribute('title') || a.textContent) || new URL(a.href, `${origin}/`).hostname, icon: null, href: absolute(a.getAttribute('href'), origin) })),
        qr: (() => {
          const img = [...pb.querySelectorAll('img')].find((i) => /qr/i.test(`${i.getAttribute('alt')} ${i.getAttribute('data-src') || i.getAttribute('src')}`))
          return img ? { title: clean(img.getAttribute('alt')) || null, image: imageOf(img, origin) } : null
        })(),
      }
      raw.push({ kind: 'promotion', el: pb, sectionId, sectionEl: pb, item: null })
      return
    }

    const section = { id: sectionId, title: sectionTitle, description: textOf(subtitleEl) || null, cta: null, aside: null, items: [] }
    const sectionCover = { id: sectionId, title: sectionTitle, cards: cards.length, usable: 0 }
    const sectionLink = first(pb, '.section-title a.btn[href]')
    if (sectionLink) section.cta = { label: textOf(sectionLink) || null, href: absolute(sectionLink.getAttribute('href'), origin) }

    for (const { el, row } of cards) {
      const titleNode = first(el, row.title)
      const image = imageOf(row.image ? first(el, row.image) : null, origin)
      const title = textOf(titleNode) || image?.alt || ''
      const linkEl = row.link === ':self' ? el : first(el, row.link) || el.closest('a[href]')
      const href = absolute(linkEl?.getAttribute('href'), origin)
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
      raw.push({ kind: row.kind, el, sectionId, sectionEl: pb, item: { title, description, image, cta }, cand: candidates({ href, image, title, el, sectionId, origin }) })
    }

    // A section with no cards but a heading, a picture and a button reads as one item (a promo band).
    if (!cards.length && sectionTitle) {
      const btn = first(pb, 'a.btn[href]')
      const image = imageOf(first(pb, 'img'), origin)
      if (btn && (image || subtitleEl)) {
        const href = absolute(btn.getAttribute('href'), origin)
        raw.push({ kind: 'band', el: pb, sectionId, sectionEl: pb, item: { title: sectionTitle, description: textOf(subtitleEl) || null, image, cta: { label: textOf(btn) || null, href } }, cand: candidates({ href, image, title: sectionTitle, el: pb, sectionId, origin }) })
      }
    }
    if (sectionCover.cards) coverage.sections.push(sectionCover)
    coverage.cards += sectionCover.cards
    coverage.usable += sectionCover.usable
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

/**
 * The adapter the demos take (src/aixc/page-adapters.js contract): pageId, label, renderOriginal()
 * (nothing to draw: the page is Vodafone's) and extractContent() (the model, read once). tag() marks
 * what was read on Vodafone's elements; untag() takes every mark off again (the guard's clean-up).
 */
export function createLiveAdapter({ doc = document, origin, path } = {}) {
  let read = null
  const tagged = []
  const result = () => (read ??= readPage(doc, { origin, path }))
  return {
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
      for (const { el, name, value } of result().tags) {
        if (el.dataset[name] === value) continue
        el.dataset[name] = value
        tagged.push({ el, name })
      }
    },
    untag() {
      for (const { el, name } of tagged.splice(0)) delete el.dataset[name]
    },
  }
}
