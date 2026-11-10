/**
 * aixc.js: the experience layer on Vodafone's real pages (voice-guide ADR-0046, ADR-0048), added
 * beside guide.js by the same loader (the demo browser today, Vodafone's tag manager later).
 *
 * Phase 1 of the live plan: the layer reads its settings, finds the page, builds its regions
 * (hidden) and waits. The demos load on intent in later phases, as chunks of this bundle.
 * Everything runs through one guard (./guard.js): any error removes the layer and leaves the page
 * as Vodafone served it.
 *
 * URL switches: ?aixc=off (the layer does nothing), ?aixc-debug (window.__aixc), ?aixc-demo=off
 * (no demo-data actions even where the loader marks the page as a demo).
 */
import { createGuard } from './guard.js'
import { createPageHost } from './page-host.js'

const params = new URLSearchParams(location.search)

// Module scripts have no document.currentScript: find this tag by its address.
const ownTag = () => [...document.querySelectorAll('script[type="module"][src]')].find((tag) => tag.src === import.meta.url) ?? null

const settingsFrom = (tag) => ({
  off: params.get('aixc') === 'off',
  debug: params.has('aixc-debug'),
  demo: tag?.dataset.aixcDemo === '1' && params.get('aixc-demo') !== 'off',
  demos: (tag?.dataset.aixcDemos ?? '').split(/\s+/).filter(Boolean),
  gateway: import.meta.url.replace(/\/sdk\/aixc\/[^/]*$/, ''),
})

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
  const layer = { state: 'starting', settings, host: null, problem: null, guard }
  if (settings.debug) {
    window.__aixc = layer
    guard.onStop((reason) => {
      layer.state = reason
      layer.failure = guard.failure
    })
  }

  guard.run('start', () => {
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
    layer.state = 'ready'
    if (settings.debug) console.info(`[AIXC] ready (${host.lang}, ${host.dir})`)
    checkpoint('ready')
  })
}

start()
