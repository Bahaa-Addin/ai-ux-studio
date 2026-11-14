/**
 * aixc.js: the experience layer on Vodafone's real pages (voice-guide ADR-0046, ADR-0048), added
 * beside guide.js by the same loader (the demo browser today, Vodafone's tag manager later).
 *
 * Phases 1 and 2 of the live plan: the layer reads its settings, finds the page, builds its regions
 * (hidden), reads Vodafone's cards into the content model (./live-adapter.js) and tags them, names
 * each section's knowledge destination on the model (GET /v1/page-map, ADR-0049), reads the page
 * again whenever Vodafone's content changes (an `aixc:model` event on the document says the model
 * changed), and waits. Phase 3 loads the demos the site enables (the tag's data-aixc-demos) at idle,
 * each a chunk of this bundle (./demos/<name>.js exporting start()); a demo's CSS comes as text and
 * goes into one marked <style> (ensureCss).
 * Everything runs through one guard (./guard.js): any error removes the layer and leaves the page
 * as Vodafone served it.
 *
 * URL switches: ?aixc=off (the layer does nothing), ?aixc-debug (window.__aixc), ?aixc-demo=off
 * (no demo-data actions even where the loader marks the page as a demo).
 */
import { createGuard } from './guard.js'
import { createLiveAdapter } from './live-adapter.js'
import { createPageHost } from './page-host.js'

const params = new URLSearchParams(location.search)

// Module scripts have no document.currentScript: find this tag by its address.
const ownTag = () => [...document.querySelectorAll('script[type="module"][src]')].find((tag) => tag.src === import.meta.url) ?? null

const settingsFrom = (tag) => ({
  off: params.get('aixc') === 'off',
  debug: params.has('aixc-debug'),
  demo: tag?.dataset.aixcDemo === '1' && params.get('aixc-demo') !== 'off',
  demos: (tag?.dataset.aixcDemos ?? '').split(/\s+/).filter(Boolean),
  siteKey: tag?.dataset.aixcSiteKey || null,
  gateway: import.meta.url.replace(/\/sdk\/aixc\/[^/]*$/, ''),
})

/**
 * Which knowledge destination each section is (GET /v1/page-map, ADR-0049); the page is read without it
 * if it does not come. Only the page's address goes, never its query or fragment (not even as a referrer).
 */
const pageMapFor = (settings) =>
  settings.siteKey
    ? fetch(`${settings.gateway}/v1/page-map?url=${encodeURIComponent(location.origin + location.pathname)}`, { headers: { 'x-vg-site-key': settings.siteKey }, referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(2000) })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null)
    : Promise.resolve(null)

/** The demos this core can load, each its own chunk (voice-guide ADR-0052). */
const DEMOS = { pocket: () => import('./demos/pocket.js') }

/** A demo's stylesheet, once, in <head>; marked, so a stop removes it with the rest of the layer. */
const ensureCss = (name, text) => {
  if ([...document.head.querySelectorAll('style[data-aixc-css]')].some((s) => s.dataset.aixcCss === name)) return
  const style = document.createElement('style')
  style.dataset.aixc = ''
  style.dataset.vg = ''
  style.dataset.aixcCss = name
  style.textContent = text
  document.head.append(style)
}

const whenIdle = (fn) => (window.requestIdleCallback ? requestIdleCallback(() => fn(), { timeout: 2000 }) : setTimeout(fn, 200))

/** Test-only: throws at a named step (window.__AIXC_TEST__ = { failAt }), to prove the guard. */
const checkpoint = (step) => {
  if (window.__AIXC_TEST__?.failAt === step) throw new Error(`test failure at "${step}"`)
}

const start = () => {
  if (window.__aixcStarted) return
  window.__aixcStarted = true

  const tag = ownTag()
  const settings = settingsFrom(tag)
  if (settings.off) return

  const guard = createGuard()
  // Stopped, the layer leaves no trace, not even the tag the loader added for it.
  guard.onStop(() => tag?.remove())
  const layer = { state: 'starting', settings, host: null, problem: null, guard, adapter: null, model: null, coverage: null, pageMap: null, reads: 0, demos: {} }
  if (settings.debug) {
    window.__aixc = layer
    guard.onStop((reason) => {
      layer.state = reason
      layer.failure = guard.failure
    })
  }

  guard.run('start', async () => {
    checkpoint('start')
    const { host, problem } = createPageHost(document)
    if (!host) {
      layer.state = 'idle'
      layer.problem = problem
      if (settings.debug) console.info(`[AIXC] not on this page: ${problem}`)
      return
    }
    layer.host = host
    guard.onStop(() => host.destroy())
    checkpoint('host')
    const pageMap = await pageMapFor(settings)
    if (guard.stopped) return
    // Which map the sections were named from (null: it did not come, so none are named).
    layer.pageMap = pageMap ? { kbVersionId: pageMap.kbVersionId ?? null, pageId: pageMap.pageId ?? null, sections: pageMap.sections?.length ?? 0 } : null
    const adapter = createLiveAdapter({ doc: document, pageMap })
    const { model, problems, coverage } = adapter.extractContent()
    adapter.tag()
    guard.onStop(() => adapter.untag())
    layer.adapter = adapter
    layer.model = model
    layer.coverage = coverage
    layer.reads = 1
    // Vodafone's page changes after it loads (carousels, lazy sections): read it again when it does.
    const stopWatching = adapter.watch(
      (next) => {
        const was = layer.coverage?.ratio
        layer.model = next.model
        layer.coverage = next.coverage
        layer.reads++
        // The model changed, or how much of the page it covers did (unread cards come or go): a demo may switch.
        if (next.changed || next.coverage?.ratio !== was) document.dispatchEvent(new CustomEvent('aixc:model', { detail: { model: next.model, coverage: next.coverage } }))
      },
      { run: (fn) => guard.run('re-read', fn) },
    )
    guard.onStop(stopWatching)
    if (problems.length) console.warn(`[AIXC] reading the page: ${problems.join(' ')}`)
    checkpoint('read')
    layer.state = 'ready'
    const named = model?.sections.filter((x) => x.destinationId).length ?? 0
    if (settings.debug) console.info(`[AIXC] ready (${host.lang}, ${host.dir}): ${model?.sections.length ?? 0} sections, coverage ${coverage.ratio}, ${layer.pageMap ? `${named} named from the page map` : 'no page map'}`)
    checkpoint('ready')
    // Back to a page whose album the portal left open (experiences ADR-0005): the demos now, not at idle.
    const soon = history.state?.vfPortal ? queueMicrotask : whenIdle
    for (const name of settings.demos) {
      if (!DEMOS[name]) continue
      soon(
        guard.wrap(`demo ${name}`, async () => {
          const demo = await DEMOS[name]()
          if (guard.stopped) return
          checkpoint(`demo-${name}`)
          layer.demos[name] = await demo.start({ host, adapter, guard, layer, ensureCss, checkpoint })
        }),
      )
    }
  })
}

start()
