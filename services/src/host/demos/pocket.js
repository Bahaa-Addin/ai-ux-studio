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
 * - "Pocket it" (S6, ADR-0052 §10-§14) sits on Vodafone's cards from an overlay of our own after the
 *   content (../../pocket/chips-overlay.js): nothing is written into the cards, the buttons stay out of
 *   the Tab order (screen readers reach them by name), and only on the website where the page was
 *   read well enough (coverage at least CHIPS_COVERAGE).
 *
 * - "Your journey" (S10, ADR-0050 §2-§3): where the guide's Exploration Trail runs and offers a host
 *   API that can be claimed (version 2), the journey is drawn in this album, in place, from a chunk of
 *   its own (./journey.js), loaded once; nowhere else is anything loaded. When the layer stops, the
 *   claim is given back and the trail's pill opens the guide's own sheet.
 *
 * - The page corner and the Pocket button (S11, ADR-0064) sit at the page's bottom-left, physical left in
 *   both languages: nothing of Vodafone's moves, and the Voice Guide's microphone keeps its place above
 *   the accessibility button at the bottom-right. A pocketed sticker flies there, and the page turns
 *   from there to the album.
 *
 * - The mascot and the drone (S12) are a chunk of their own (./actors.js). Until it is needed, initPocket
 *   gets a stand-in that does nothing (its stage is an empty marked holder, swapped for the real one when
 *   the actors arrive): it loads at idle where something is pocketed or the page has chips, and at once
 *   when a chip or the Pocket button is first pressed or focused. A save before it arrives has no greeting.
 *   If the chunk or the actors fail, only the actors go (seams.report); the Pocket and the layer stay.
 *
 * - The portal (S13) is a chunk of its own (./portal.js). initPocket gets a stand-in that is enabled at once
 *   (the album's sticker links open in this tab) and loads the chunk when the album opens, or at once when
 *   this history entry says the album was open (Back). If the chunk fails, a sticker's link is a plain link.
 */
import css from '../../pocket/pocket.css'
import { createChips } from '../../pocket/chips-overlay.js'
import { initPocket } from '../../pocket/pocket.js'
import { recordFrom, siteOf } from '../../pocket/record.js'
import { openPocketStore } from '../../pocket/store.js'
import { countItems, t } from '../../i18n.js'

/** The page's own name, without the site's ("Services | Vodafone Egypt" → "Services"). */
const titleOf = (doc) => (doc.title || '').split(/\s+[|–-]\s+/)[0].trim() || null

/** Chips show where at least this share of the page's content was read (a pilot knob; ADR-0052 §11). */
const CHIPS_COVERAGE = 0.6

/** A read that counts: on the website (the shop's come with E16), where at least that share of the page's content was read. */
const wellRead = (coverage) => siteOf(location.hostname) === 'web' && (coverage?.ratio ?? 0) >= CHIPS_COVERAGE

/** A trail host this album can claim the journey from (ADR-0050): version 2 or later, with claim(). A fake or version 1 host is not. */
const claimable = (api) => !!api && typeof api.version === 'number' && api.version >= 2 && typeof api.claim === 'function'

/** The page's back face: nothing of the copy shows through it, so one copy per turn is enough. */
const PAGE_BACK = { base: [251, 251, 249], seeThrough: 0, rim: 0.12, gloss: 0.07, glossAt: 0.34 }

export async function start({ host, adapter, guard, layer, ensureCss, checkpoint }) {
  ensureCss('pocket', css)
  const store = openPocketStore({ onError: (error) => console.warn(`[AIXC] the Pocket keeps its stickers for this page only: ${error?.message || error}`) })
  guard.onStop(() => store.close())
  // The page as it is now, read on every use: on the shop a route can change it after the start (E5).
  const pageNow = () => ({ path: location.pathname, search: location.search, site: siteOf(location.hostname), lang: host.lang, dir: host.dir, title: titleOf(document), pageId: layer.pageMap?.pageId ?? null })

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
          // The chips stand where the cards were; the turning copy shows the page without them.
          set('.pocket-chips', true)
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
    get page() {
      return pageNow()
    },
    // The corner at the bottom-left: the bottom-right is Vodafone's accessibility button and the guide's (ADR-0064).
    corner: true,
    cornerSide: 'left',
    // The mascot and the drone stand at the album's inline end: the right in English, the left in Arabic,
    // where the album runs right to left (S12, the owner 2026-11-14).
    actorSide: 'inline-end',
    // A record keeps its own key (not the clone's card id): stickers of two pages never share one (ADR-0052 §14).
    recordKey: null,
    chips: 'overlay',
    overlay: {
      place: (root) => host.addRegion(root),
      content: host.main,
      cards: () => host.main.querySelectorAll('[data-aixc-item]'),
      hidden: () => host.sourceHidden,
      // On the website only (the shop's chips come with E16), where the page was read well enough.
      gate: wellRead,
      coverage: layer.coverage ?? null,
    },
    dated: true,
    // The album groups its stickers by the page they were kept on, and says which have lost their card
    // when the page was read well (S7; ADR-0051 §6).
    groups: true,
    wellRead,
    eagerImages: false,
    pageBack: PAGE_BACK,
    report: (error) => console.warn('[AIXC] the Pocket actors stopped; the Pocket carries on', error),
  }

  // The mascot and drone (S12): a stand-in until their chunk arrives, then the real ones; every call forwards.
  let actorsWith = null // what initPocket gave them
  let actors = null
  let actorsGone = false // destroyed, or failed to arrive
  let actorsAsked = false
  const holders = []
  const createActors = (options) => {
    actorsWith = options
    return new Proxy(
      {},
      {
        get: (_, name) =>
          name === 'then'
            ? undefined
            : (...args) => {
                if (actors) return actors[name]?.(...args)
                if (name === 'destroy') actorsGone = true
                if (name === 'underStage') return holders[holders.push(seams.mark(document.createElement('div'))) - 1]
              },
      },
    )
  }
  const loadActors = () => {
    if (actorsAsked || !actorsWith) return
    actorsAsked = true
    void guard.run('actors', async () => {
      try {
        const demo = await import('./actors.js')
        if (guard.stopped || actorsGone) return
        actors = demo.createActors(actorsWith, { ensureCss })
        const stage = actors.underStage()
        const shown = holders.find((holder) => holder.isConnected)
        for (const holder of holders) holder === shown ? holder.replaceWith(stage) : holder.remove()
        holders.length = 0
      } catch (error) {
        actorsGone = true
        try {
          actors?.destroy()
        } catch {}
        actors = null
        seams.report(error)
      }
    })
  }

  // The portal (S13): a stand-in until its chunk (./portal.js) arrives, when the album opens or at once on Back
  // to it; the chunk then gives it the real portal's current() and destroy(). A failed import leaves plain links.
  const portal = { enabled: true, current: () => null }
  const loadPortal = (args) =>
    (portal.asked ||= guard.run('portal', async () => {
      try {
        const demo = await import('./portal.js')
        if (guard.stopped) return
        await demo.attach(portal, args, { guard, store, ensureCss, seams })
      } catch (error) {
        console.warn('[AIXC] no portal', error)
      }
    }))
  const createPortal = (args) => {
    guard.listen(args.viewEvents, 'pocket:view', (event) => event.detail === 'pocket' && loadPortal(args))
    if (history.state?.vfPortal) loadPortal(args)
    return portal
  }

  const regions = { sourceRoot: host.main, outputRoot: host.outputRoot, viewbar: host.viewbar, header: host.header, main: host.main }
  const pocket = initPocket({ adapter, regions, store, seams, createChips, createActors, createPortal, portal: { live: true }, model: layer.model ?? null })
  guard.onStop(() => pocket.destroy())
  // The actors at idle where something is pocketed or there are chips to pocket with; at once on a first press or focus.
  const actorsIfUseful = () => (pocket.state.ids.length || pocket.chips()?.shown.length) && loadActors()
  const atIdle = (fn) => (window.requestIdleCallback ? requestIdleCallback(fn, { timeout: 2000 }) : setTimeout(fn, 200))
  void store.ready.then(() => atIdle(guard.wrap('pocket actors', actorsIfUseful)))
  const pressed = (event) => event.target?.closest?.('.pocket-cta, .pocket-peek') && loadActors()
  guard.listen(document, 'pointerdown', pressed, true)
  guard.listen(document, 'focusin', pressed, true)
  // Vodafone's page changed and was read again: the cards to pocket are the new ones.
  guard.listen(document, 'aixc:model', (event) => {
    pocket.setModel(event.detail.model, event.detail.coverage)
    atIdle(guard.wrap('pocket actors', actorsIfUseful))
  })

  // The clone's ids-only store, if this browser has one here: moved over once, for the cards this
  // page knows; left in place while some belong to another page.
  void store.ready.then(
    guard.wrap('pocket legacy', async () => {
      const ids = store.legacyIds()
      if (!ids.length) return
      const known = new Map((layer.model?.sections ?? []).flatMap((section) => section.items.map((item) => [item.id, { item, section }])))
      for (const id of ids) {
        const hit = known.get(id)
        const page = pageNow()
        if (hit && !store.all().some((r) => r.id === id && r.source.path === page.path)) await store.put(recordFrom({ ...hit, page, model: layer.model }))
      }
      if (ids.every((id) => known.has(id))) store.dropLegacy()
    }),
  )

  const open = (options) => guard.run('pocket-open', () => pocket.open(options))
  const close = () => guard.run('pocket-close', () => pocket.close())

  // Your journey, in this album, when the trail offers a host to claim: now, or when it starts (S10).
  let journey = null
  let journeyAsked = false
  const hostJourney = (api) => {
    if (journeyAsked || !claimable(api)) return undefined
    journeyAsked = true
    return guard.run('journey', async () => {
      const demo = await import('./journey.js')
      if (guard.stopped) return
      const handle = { state: pocket.state, dock: pocket.dock, openWhenEmpty: pocket.openWhenEmpty, open, close }
      journey = await demo.start({ host, guard, ensureCss, checkpoint, pocket: handle, api })
    })
  }
  guard.listen(window, 'vg:trail-ready', (event) => hostJourney(event.detail))
  void hostJourney(window.voiceGuide?.trailHost)

  return {
    state: pocket.state,
    store,
    open,
    close,
    /** The journey drawn in this album ({ open, close, destroy }), or null: for `?aixc-debug` and the tests. */
    journey: () => journey,
    /** The chips by card id: { shown, unplaced, icon } (ADR-0052 §12). */
    chips: () => pocket.chips(),
  }
}
