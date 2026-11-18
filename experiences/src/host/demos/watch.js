/**
 * The page watch on Vodafone's own pages (voice-guide ADR-0078; phase 6 design §4.1, §4.6, §4.10): a chunk
 * the Pocket's chunk (./pocket.js) loads at idle where the site enables it, never the core.
 *
 * - It gets the Pocket's instance, its store and its reconcile (no chunk shared with the core), the adapter's
 *   readPage (adapter.read); it asks the gateway's page-map answer for its watch rules itself (none, no check).
 * - Its store (../../watch/store.js), its check on visit (../../watch/check.js) at idle once per page view,
 *   and its lines on the stickers, the liners and the Pocket button (../../watch/ui.js) in the page's language.
 * - window.__aixcWatch = { ready, fromGuide(step), fill(), reset() } for the guide's chip (watch-chunk.ts),
 *   announced by 'aixc:watch-ready' on window. fromGuide resolves the step's target in the live DOM; a card the
 *   adapter read (or one it sits in) already in the Pocket (pocket.keyOf, its own rule) is watched; else it is
 *   pocketed with the Pocket's own pocket() and its flight, then watched.
 * - Demo data (design §4.8): fill() loads ../../watch/demo.js (its own small chunk, only then), puts the two
 *   example stickers of the page's language in the Pocket's store (as a pocketed card is; one already there is
 *   kept), watches them (from 'demo', within maxWatched) on their 23 Oct baselines, and checks them at once,
 *   pacing kept. reset() deletes the watch's database and tells other tabs; it never touches the Pocket's own
 *   store, Vodafone's cookies or the cookie answer (phase 7's Reset demo clears the Pocket itself). In demo mode
 *   (layer.settings.demo) the album's empty state offers "Watch two example cards", and ?aixc-watch=fill runs
 *   fill() once after start (the switch then leaves the address, so a reload does not fill again).
 * - Isolation (ADR-0052 part 3): every handler runs through `safe`; any error, a checkpoint's included
 *   ('watch-start', 'watch-ui', 'watch-check'), drops only the watch: its lines, liner notes, count,
 *   listeners, stylesheet and window.__aixcWatch. The Pocket and the page carry on. A stop of the layer
 *   takes it away too.
 */
import css from '../../watch/watch.css'
import { LOCK, createChecker } from '../../watch/check.js'
import { maskContent } from '../../watch/mask.js'
import { READER_VERSION } from '../../watch/read.js'
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
  // The check's stop (F11): a dropped part, or a stopped layer, ends a run under way before its next request or write.
  const stopRuns = new AbortController()
  cleanups.push(() => stopRuns.abort())
  const api = { ready: true, fill: () => fill(), reset: () => reset(), fromGuide: (step) => fromGuide(step) }
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
  let store = null
  let checker = null
  let rules = () => null
  let loadRules = async () => {}
  /** The guide's chip (watch-chunk.ts): { ok: true } once the card is pocketed and watched, else { ok: false, reason }. */
  const fromGuide = async (step) => {
    if (gone || !ui) return { ok: false, reason: 'stopped' }
    try {
      const id = locate(step?.target)?.closest?.('[data-aixc-item]')?.dataset.aixcItem
      if (!id) return { ok: false, reason: 'not-a-card' }
      const here = () => pocketStore.all().find((r) => r.id === id && r.source?.path === location.pathname)
      // The Pocket's own key first (F6): a card kept on this page in the other language, or placed under a new id, is found.
      const known = pocket.keyOf?.(id)
      let record = (known != null && pocketStore.get(known)) || here()
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

  /** Runs fn holding the check's lock (waiting for a run in another tab or this one), so no run sees a half-made watch. */
  const holding = (fn) => (navigator.locks?.request ? navigator.locks.request(LOCK, fn) : fn())

  /**
   * The demo data (design §4.8): { ok: true, keys, added } or { ok: false, reason, keys? } ('stopped', 'no-rules',
   * 'max-watched', 'error'). Idempotent: stickers and watches already there are kept as they are.
   */
  let filling = null
  const fill = () => (filling ??= fillOnce().finally(() => (filling = null)))
  const fillOnce = async () => {
    if (gone || !ui) return { ok: false, reason: 'stopped' }
    try {
      await loadRules()
      if (gone) return { ok: false, reason: 'stopped' }
      const r = rules()
      if (!r?.origin) return { ok: false, reason: 'no-rules' }
      const { DEMO, READER, BASELINE_AT } = await import('../../watch/demo.js')
      if (gone) return { ok: false, reason: 'stopped' }
      // Read by another reader than today's: the dates and hashes of 23 Oct do not hold, so a baseline of today.
      const same = READER === READER_VERSION
      const max = r.maxWatched ?? 20
      const list = DEMO[host.lang === 'ar' ? 'ar' : 'en']
      const keys = []
      const added = []
      await holding(async () => {
        let count = (await store.listWatches()).length
        for (const d of list) {
          const s = d.sticker
          // This sticker, or the same card the visitor kept on its page.
          let record = pocketStore.get(s.key) ?? pocketStore.all().find((x) => x.id === s.id && x.source?.path === s.source.path)
          if (record && (await store.getWatch(record.key))) {
            keys.push(record.key)
            continue
          }
          if (count >= max) break
          if (!record) {
            await pocketStore.put(s)
            record = s
          }
          keys.push(record.key)
          const res = await checker.watchSticker(record, { from: 'demo', baselineAt: same ? BASELINE_AT : null })
          if (!res.ok || res.already) continue
          count++
          added.push(record.key)
          // The 23 Oct baselines, on the targets made just now (one another watch holds keeps its own).
          const seed = async (id, url, fields) => {
            const t = id && (await store.getTarget(id))
            if (!t || t.hash || t.url !== url) return false
            await store.putTarget({ ...t, ...fields, status: 'ok', checkedAt: BASELINE_AT, baselineAt: BASELINE_AT, readerVersion: READER })
            return true
          }
          const seeded = same && (await seed(res.watch.cardTargetId, d.card.url, { hash: d.card.hash, href: d.card.href })) && (!res.watch.pageTargetId || (await seed(res.watch.pageTargetId, d.page.url, { hash: d.page.hash, linksHash: d.page.linksHash })))
          if (same && !seeded) await store.putWatch({ ...res.watch, baselineAt: null })
        }
      })
      if (added.length) {
        // Checked at once (a person's press), pacing kept; a run already under way is waited for, then this one.
        const check = () => checker.run({ force: true, onlyStickers: added })
        if ((await check())?.reason === 'locked') await holding(() => null).then(check)
        await ui?.load()
      }
      return keys.length < list.length ? { ok: false, reason: 'max-watched', keys } : { ok: true, keys, added: added.length }
    } catch (error) {
      drop(error)
      return { ok: false, reason: 'error' }
    }
  }

  /** The watch's database deleted (other tabs told) and its lines cleared; the Pocket's stickers stay. */
  const reset = async () => {
    if (gone || !store) return { ok: false, reason: 'stopped' }
    try {
      await store.reset()
      await ui?.load()
      return { ok: true }
    } catch (error) {
      drop(error)
      return { ok: false, reason: 'error' }
    }
  }

  try {
    checkpoint('watch-start')
    ensureCss('watch', css)
    cleanups.push(() => document.head.querySelector('style[data-aixc-css="watch"]')?.remove())
    store = openWatchStore({ onError: (error) => console.warn(`[AIXC] the page watch keeps its watches for this page only: ${error?.message || error}`) })
    cleanups.push(() => store.close())
    // The watch rules come from the page-map answer, asked for here rather than carried through the core
    // (the core has 32 B left; ADR-0078 point 9), and only when the watch needs them: before a check when
    // there are watches, before a person's press, before fill. So a page view with nothing watched sends the
    // page map once, as before (ADR-0049). Same request as the core's: our own gateway, the page's address
    // only, no referrer, 2 s, once per page view; no answer means no rules, so no check (fail safe).
    let watchRules = null
    let asked = null
    const { siteKey, gateway } = layer.settings ?? {}
    loadRules = () =>
      (asked ??= (async () => {
        if (!siteKey || !gateway) return
        try {
          const res = await fetch(`${gateway}/v1/page-map?url=${encodeURIComponent(location.origin + location.pathname)}`, { headers: { 'x-vg-site-key': siteKey }, referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(2000) })
          if (res.ok) watchRules = (await res.json())?.watch ?? null
        } catch {}
      })())
    rules = () => watchRules
    checker = createChecker({
      store,
      read: adapter.read,
      reconcile,
      mask: maskContent,
      rules,
      recordFor: (key) => pocketStore.get(key),
      signal: stopRuns.signal,
      log: (...args) => layer.settings?.debug && console.info('[AIXC]', ...args),
    })
    checkpoint('watch-ui')
    // A person's press (the sticker, the guide's chip) asks for the rules first.
    const pressed = { ...checker, watchSticker: async (...a) => (await loadRules(), checker.watchSticker(...a)) }
    ui = createWatchUi({ pocket, open, pocketStore, store, checker: pressed, w: wordsFor(host.lang), origin: location.origin, safe, maxWatched: () => rules()?.maxWatched ?? 20 })
    cleanups.push(() => ui.destroy())
    await ui.start()
    if (gone) return null
    const demo = !!layer.settings?.demo
    // The album's empty state in demo mode: "Watch two example cards" (the Pocket's empty-state seam).
    if (demo && pocket.setEmptyExtra) {
      pocket.setEmptyExtra(
        safe((_, box) => {
          const b = document.createElement('button')
          b.type = 'button'
          b.className = 'aixc-watch__button'
          b.textContent = wordsFor(host.lang)('demoFill')
          b.addEventListener('click', safe(fill))
          const back = box.querySelector('.pocket-back')
          back ? back.before(b) : box.append(b)
          return () => b.remove()
        }),
      )
      cleanups.push(() => pocket.setEmptyExtra(null))
    }
    window.__aixcWatch = api
    window.dispatchEvent(new CustomEvent('aixc:watch-ready'))
    // A presenter's ?aixc-watch=fill: once; the switch leaves the address first, so a reload does not fill again.
    const params = new URLSearchParams(location.search)
    if (demo && params.get('aixc-watch') === 'fill') {
      params.delete('aixc-watch')
      const q = params.toString()
      history.replaceState(history.state, '', `${location.pathname}${q ? `?${q}` : ''}${location.hash}`)
      void fill()
    }
    // The check on visit, once per page view, at idle (design §4.4).
    const run = safe(async () => {
      checkpoint('watch-check')
      // Nothing watched: no request at all, not even for the rules.
      if (!(await store.listWatches()).length) return
      await loadRules()
      if (gone) return
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
