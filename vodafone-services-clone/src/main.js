/**
 * App entry. Plain ES modules: runs as-is in the browser (scripts/serve.mjs)
 * or through Vite (`npm run dev`). Stylesheets are linked from index.html.
 */
import { renderShell } from './shell.js'
import { getPageAdapter } from './aixc/page-adapters.js'
import { initComposer } from './aixc/controller.js'
import { initPocket } from './pocket/pocket.js'
import { initJourney } from './pocket/journey.js'

const regions = renderShell(document.querySelector('#app'))
const adapter = getPageAdapter(document.body.dataset.page)

adapter.renderOriginal(regions.sourceRoot)

// Voice Guide: each section carries the knowledge base destination it recreates, so a guide
// answer about "Vodafone Cash" spotlights this copy of it (ADR-0040 in voice-guide).
const GUIDE_DESTINATIONS = {
  cash: 'web.services.vodafone-cash',
  'stay-in-control': 'web.services.test',
  'call-and-connect-abroad': 'web.services.call-connect-abroad',
  'great-entertainment': 'web.services.great-entertainment',
  'shokran-services': 'web.services.shokran-services',
  'other-services': 'web.services.enjoy-other-services',
}
for (const section of regions.sourceRoot.querySelectorAll('[data-aixc-section]')) {
  const destination = GUIDE_DESTINATIONS[section.dataset.aixcSection]
  if (destination) section.dataset.vgDestination = destination
}

// Reimagine this page: the AIXC composer, its launcher top-right.
const composer = initComposer({ adapter, regions })
// Pocket: peel services off like stickers, keep them, turn the page to see them.
const pocket = initPocket({ adapter, regions, composer })
// Your journey: when the Voice Guide trail runs on this page, the journey lives in the pocket.
if (pocket) initJourney({ pocket })
