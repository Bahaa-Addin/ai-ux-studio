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

// A reimagined view hides these sections, so each card it draws takes the destination of the
// section its service came from: the guide spotlights the card on screen, and the trail knows
// what was explored.
const itemDestinations = new Map()
for (const item of regions.sourceRoot.querySelectorAll('[data-vg-destination] [data-aixc-item]')) {
  itemDestinations.set(item.dataset.aixcItem, item.closest('[data-vg-destination]').dataset.vgDestination)
}
const markReimagined = () => {
  for (const item of regions.outputRoot.querySelectorAll('[data-aixc-item]:not([data-vg-destination])')) {
    const destination = itemDestinations.get(item.dataset.aixcItem)
    if (destination) item.dataset.vgDestination = destination
  }
}
new MutationObserver(markReimagined).observe(regions.outputRoot, { childList: true, subtree: true })

// Reimagine this page: the AIXC composer, its launcher top-right (below the guide's journey pill
// once the trail is on the page; aixc.css).
const composer = initComposer({ adapter, regions })
// The composer's own controls (prompt, Gemini key) are never part of a recorded journey.
for (const node of document.querySelectorAll('.aixc-launcher, .aixc-composer')) node.dataset.vg = ''
window.addEventListener('vg:trail-ready', () => {
  document.documentElement.dataset.vgTrail = 'on'
})
// Pocket: peel services off like stickers, keep them, turn the page to see them.
const pocket = initPocket({ adapter, regions, composer })
// Your journey: when the Voice Guide trail runs on this page, the journey lives in the pocket.
if (pocket) initJourney({ pocket })
