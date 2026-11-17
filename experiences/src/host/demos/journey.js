/**
 * Your journey in the Pocket on Vodafone's own pages (live plan phase 3 S10; voice-guide ADR-0050
 * §2-§3, ADR-0052): a chunk of its own, which the Pocket chunk (./pocket.js) loads only when a trail
 * host that can be claimed (version 2) is on the page, so no other page pays for it.
 *
 * It draws the clone's journey (../../pocket/journey.js) in the live album with the layer's seams:
 * Vodafone's header and pinned chrome for the band's place, data-aixc and data-vg on every node it
 * adds, every handler through the guard, and a run-time claim of the journey that the guard gives
 * back when the layer stops (a failure, ?aixc=off at run time): the trail's pill then opens the
 * guide's own sheet (owner, 2026-11-13, OD-5), never nothing.
 *
 * It also tells the trail what the layer covers (its host API's setCover; F12): #main-content, hidden
 * while the album (or a reimagined view) shows, so the trail records it as it shows and the memory of
 * this page is the page the visitor saw, never an empty page under the header.
 */
import css from '../../pocket/journey.css'
import { initJourney } from '../../pocket/journey.js'

/** What PageHost.hideSource changes on #main-content (and showSource gives back exactly). */
const HIDING = ['style', 'inert', 'hidden']

export async function start({ host, guard, ensureCss, checkpoint, pocket, api }) {
  ensureCss('journey', css)
  // #main-content's attributes as they are while it shows, read again whenever the trail asks with it shown.
  let shown = null
  const asShown = () => (host.sourceHidden ? shown : (shown = Object.fromEntries(HIDING.map((name) => [name, host.main.getAttribute(name)]))))
  asShown()
  api.setCover?.({ node: host.main, covered: () => host.sourceHidden, shown: asShown })
  // Registered before the journey exists: a stop while it starts (its first render failing in the
  // guard, say) still gives the claim back once initJourney has returned.
  let journey = null
  let stoppedEarly = false
  guard.onStop(() => {
    api.setCover?.(null)
    journey ? journey.destroy() : (stoppedEarly = true)
  })
  journey = initJourney({
    pocket,
    api,
    seams: {
      header: () => host.header,
      // Sticky cannot hold on Vodafone's themes (overflow-x: hidden on html and body): the band is held
      // below whatever Vodafone pins at the top, its navigation after a scroll (68 px), or the window's top.
      bandTop: () => host.chromeBottom(),
      mark: (node) => {
        node.dataset.aixc = ''
        node.dataset.vg = ''
        return node
      },
      wrap: guard.wrap,
      listen: guard.listen,
      claim: true,
      checkpoint,
    },
  })
  if (stoppedEarly || guard.stopped) journey.destroy()
  return journey
}
