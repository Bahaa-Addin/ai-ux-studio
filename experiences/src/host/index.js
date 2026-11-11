/**
 * aixc.js: the experience layer on Vodafone's real pages (voice-guide ADR-0046, ADR-0048), added
 * beside guide.js by the same loader (the demo browser today, Vodafone's tag manager later).
 *
 * Phases 1 and 2 of the live plan: the layer reads its settings, finds the page, builds its regions
 * (hidden), reads Vodafone's cards into the content model (./live-adapter.js) and tags them, names
 * each section's knowledge destination on the model (GET /v1/page-map, ADR-0049), and waits. The
 * demos load on intent in later phases, as chunks of this bundle.
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
  const layer = { state: 'starting', settings, host: null, problem: null, guard, adapter: null, model: null, coverage: null, pageMap: null }
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
    if (problems.length) console.warn(`[AIXC] reading the page: ${problems.join(' ')}`)
    checkpoint('read')
    layer.state = 'ready'
    const named = model?.sections.filter((x) => x.destinationId).length ?? 0
    if (settings.debug) console.info(`[AIXC] ready (${host.lang}, ${host.dir}): ${model?.sections.length ?? 0} sections, coverage ${coverage.ratio}, ${layer.pageMap ? `${named} named from the page map` : 'no page map'}`)
    checkpoint('ready')
  })
}

start()
