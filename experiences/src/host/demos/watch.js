/**
 * The page watch on Vodafone's own pages (voice-guide ADR-0078; phase 6 design §4.1, §4.6, §4.10): a chunk
 * the Pocket's chunk (./pocket.js) loads at idle where the site enables it, never the core.
 *
 * - It gets the Pocket's instance, its store and its reconcile (no chunk shared with the core), the adapter's
 *   readPage (adapter.read); it asks the gateway's page-map answer for its watch rules itself (none, no check).
 * - Its store (../../watch/store.js), its check on visit (../../watch/check.js) at idle once per page view,
 *   and its lines on the stickers, the liners and the Pocket button (../../watch/ui.js) in the page's language.
 * - window.__aixcWatch = { ready, fromGuide(step), fill } for the guide's chip (watch-chunk.ts), announced
 *   by 'aixc:watch-ready' on window. fromGuide resolves the step's target in the live DOM; a card the adapter
 *   read (or one it sits in) is pocketed with the Pocket's own pocket() and its flight, then watched.
 *   fill() comes with the demo data (step 5).
 * - Isolation (ADR-0052 part 3): every handler runs through `safe`; any error, a checkpoint's included
 *   ('watch-start', 'watch-ui', 'watch-check'), drops only the watch: its lines, liner notes, count,
 *   listeners, stylesheet and window.__aixcWatch. The Pocket and the page carry on. A stop of the layer
 *   takes it away too.
 */
import css from '../../watch/watch.css'
import { createChecker } from '../../watch/check.js'
import { maskContent } from '../../watch/mask.js'
import { openWatchStore } from '../../watch/store.js'
import { createWatchUi } from '../../watch/ui.js'
import { wordsFor } from '../../watch/words.js'

/** The element a guide's target names now: the first shown match of its selectors, else the first match. */
const locate = (target) => {
  const list = typeof target === 'string' ? [target] : [].concat(target?.css ?? [])
  let first = null
  for (const sel of list) {
    let found
    try {
      found = [...document.querySelectorAll(sel)]
    } catch {
      continue
    }
    const shown = found.find((el) => el.getClientRects().length)
    if (shown) return shown
    first ??= found[0] ?? null
  }
  return first
}

export async function start({ host, adapter, guard, layer, ensureCss, checkpoint, pocket, pocketStore, reconcile, open }) {
  let gone = false
  const cleanups = []
  const api = { ready: true, fill: undefined, fromGuide: (step) => fromGuide(step) }
  const destroy = () => {
    if (gone) return
    gone = true
    for (const fn of cleanups.splice(0).reverse()) {
      try {
        fn()
      } catch {}
    }
    if (window.__aixcWatch === api) delete window.__aixcWatch
  }
  const drop = (error) => {
    if (gone) return
    console.warn('[AIXC] the page watch stopped; the Pocket carries on', error)
    destroy()
  }
  /** fn, its errors (thrown or rejected) dropping the watch only. */
  const safe =
    (fn) =>
    (...args) => {
      if (gone || guard.stopped) return undefined
      try {
        const out = fn(...args)
        return out && typeof out.then === 'function' ? out.catch(drop) : out
      } catch (error) {
        drop(error)
        return undefined
      }
    }
  guard.onStop(destroy)

  let ui = null
  /** The guide's chip (watch-chunk.ts): { ok: true } once the card is pocketed and watched, else { ok: false, reason }. */
  const fromGuide = async (step) => {
    if (gone || !ui) return { ok: false, reason: 'stopped' }
    try {
      const id = locate(step?.target)?.closest?.('[data-aixc-item]')?.dataset.aixcItem
      if (!id) return { ok: false, reason: 'not-a-card' }
      const here = () => pocketStore.all().find((r) => r.id === id && r.source?.path === location.pathname)
      let record = here()
      if (!record) {
        const before = new Set(pocket.state.ids)
        // The Pocket's own press, with its flight; its errors are the Pocket's (the layer's guard).
        await guard.run('pocket it', () => pocket.pocket(id))
        record = pocketStore.get(pocket.state.ids.find((key) => !before.has(key))) ?? here()
      }
      if (!record) return { ok: false, reason: 'not-pocketed' }
      return await ui.watch(record.key, 'guide')
    } catch (error) {
      drop(error)
      return { ok: false, reason: 'error' }
    }
  }

  try {
    checkpoint('watch-start')
    ensureCss('watch', css)
    cleanups.push(() => document.head.querySelector('style[data-aixc-css="watch"]')?.remove())
    const store = openWatchStore({ onError: (error) => console.warn(`[AIXC] the page watch keeps its watches for this page only: ${error?.message || error}`) })
    cleanups.push(() => store.close())
    // The watch rules come from the page-map answer, asked for here rather than carried through the core
    // (the core has 32 B left; ADR-0078 point 9). Same request as the core's: our own gateway, the page's
    // address only, no referrer, 2 s; no answer means no rules, so no check (fail safe).
    let watchRules = null
    const { siteKey, gateway } = layer.settings ?? {}
    if (siteKey && gateway) {
      try {
        const res = await fetch(`${gateway}/v1/page-map?url=${encodeURIComponent(location.origin + location.pathname)}`, { headers: { 'x-vg-site-key': siteKey }, referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(2000) })
        if (res.ok) watchRules = (await res.json())?.watch ?? null
      } catch {}
    }
    if (gone) return null
    const rules = () => watchRules
    const checker = createChecker({
      store,
      read: adapter.read,
      reconcile,
      mask: maskContent,
      rules,
      recordFor: (key) => pocketStore.get(key),
      log: (...args) => layer.settings?.debug && console.info('[AIXC]', ...args),
    })
    checkpoint('watch-ui')
    ui = createWatchUi({ pocket, open, pocketStore, store, checker, w: wordsFor(host.lang), origin: location.origin, safe, maxWatched: () => rules()?.maxWatched ?? 20 })
    cleanups.push(() => ui.destroy())
    await ui.start()
    if (gone) return null
    window.__aixcWatch = api
    window.dispatchEvent(new CustomEvent('aixc:watch-ready'))
    // The check on visit, once per page view, at idle (design §4.4).
    const run = safe(async () => {
      checkpoint('watch-check')
      await checker.run()
    })
    const idle = window.requestIdleCallback ? requestIdleCallback(() => run(), { timeout: 2000 }) : setTimeout(run, 200)
    cleanups.push(() => (window.cancelIdleCallback ? cancelIdleCallback(idle) : clearTimeout(idle)))
  } catch (error) {
    drop(error)
    return null
  }
  return { destroy, fromGuide }
}
