/**
 * The Pocket on Vodafone's own pages (live plan phase 3; voice-guide ADR-0052): a chunk the layer's
 * core (../index.js) loads at idle where the site enables the demo.
 *
 * It gives the Pocket (../../pocket/pocket.js) Vodafone's page instead of the clone's shell:
 *
 * - the album is a region of its own after #experience-output (PageHost.addRegion), so the turn can
 *   hide #main-content (host.hideSource) and the reimagined view without hiding itself;
 * - the turn freezes #wrapper below whatever Vodafone pins at the top, in one copy per turn, with
 *   no ids, no layer tags, no frames, videos or scripts, and no picture fetched for it;
 * - every node it adds carries data-aixc and data-vg, every handler, timer and frame runs through
 *   the guard, and a stop takes all of it away (pocket.destroy is registered with the guard);
 * - stickers are records in the Pocket's own IndexedDB store (../../pocket/store.js, ADR-0051),
 *   shown as they were saved, in their own language, dated, with or without a picture.
 *
 * Step S5 is the album alone: no "Pocket it" on the cards yet (S6), no page corner or Pocket button
 * (S11 places it beside Vodafone's accessibility button), no mascot (S12), no portal (S13).
 */
import css from '../../pocket/pocket.css'
import { initPocket } from '../../pocket/pocket.js'
import { recordFrom } from '../../pocket/record.js'
import { openPocketStore } from '../../pocket/store.js'
import { countItems, t } from '../../i18n.js'

/** The page's own name, without the site's ("Services | Vodafone Egypt" → "Services"). */
const titleOf = (doc) => (doc.title || '').split(/\s+[|–-]\s+/)[0].trim() || null

/** The page's back face: nothing of the copy shows through it, so one copy per turn is enough. */
const PAGE_BACK = { base: [251, 251, 249], seeThrough: 0, rim: 0.12, gloss: 0.07, glossAt: 0.34 }

export async function start({ host, adapter, guard, layer, ensureCss, checkpoint }) {
  ensureCss('pocket', css)
  const store = openPocketStore({ onError: (error) => console.warn(`[AIXC] the Pocket keeps its stickers for this page only: ${error?.message || error}`) })
  guard.onStop(() => store.close())
  const page = { path: location.pathname, lang: host.lang, dir: host.dir, title: titleOf(document), pageId: layer.pageMap?.pageId ?? null }

  const seams = {
    snapshotRoot: () => document.getElementById('wrapper') ?? document.body,
    sheetTop: () => host.chromeBottom(),
    place: (root) => host.addRegion(root),
    cover: () => {
      // As the page was: the reimagined view (phase 4) may already hide #main-content.
      const was = { source: host.sourceHidden, main: host.main.hidden, output: host.outputRoot.hidden, viewbar: host.viewbar.hidden }
      host.hideSource()
      host.outputRoot.hidden = true
      host.viewbar.hidden = true
      return {
        restore: () => {
          if (!was.source) host.showSource()
          host.outputRoot.hidden = was.output
          host.viewbar.hidden = was.viewbar
        },
        inCopy: (shell) => {
          const set = (selector, hidden) => {
            const copy = shell.querySelector(selector)
            if (copy) copy.hidden = hidden
          }
          set('#main-content', was.main)
          set('#experience-output', was.output)
          set('#aixc-viewbar', was.viewbar)
        },
      }
    },
    mark: (node) => {
      node.dataset.aixc = ''
      node.dataset.vg = ''
      return node
    },
    wrap: guard.wrap,
    checkpoint,
    labels: {
      back: t('Back to the page'),
      lead: (n) => (n ? t('Kept for later: {count}.', { count: countItems(n) }) : t('Nothing here yet.')),
    },
    page,
    corner: false,
    chips: false,
    dated: true,
    eagerImages: false,
    pageBack: PAGE_BACK,
  }

  const regions = { sourceRoot: host.main, outputRoot: host.outputRoot, viewbar: host.viewbar, header: host.header, main: host.main }
  const pocket = initPocket({ adapter, regions, store, seams, model: layer.model ?? null })
  guard.onStop(() => pocket.destroy())

  // The clone's ids-only store, if this browser has one here: moved over once, for the cards this
  // page knows; left in place while some belong to another page.
  void store.ready.then(
    guard.wrap('pocket legacy', async () => {
      const ids = store.legacyIds()
      if (!ids.length) return
      const known = new Map((layer.model?.sections ?? []).flatMap((section) => section.items.map((item) => [item.id, { item, section }])))
      for (const id of ids) {
        const hit = known.get(id)
        if (hit && !store.all().some((r) => r.id === id && r.source.path === page.path)) await store.put(recordFrom({ ...hit, page }))
      }
      if (ids.every((id) => known.has(id))) store.dropLegacy()
    }),
  )

  return {
    state: pocket.state,
    store,
    open: (options) => guard.run('pocket-open', () => pocket.open(options)),
    close: () => guard.run('pocket-close', () => pocket.close()),
  }
}
