/**
 * App entry. Plain ES modules: runs as-is in the browser (scripts/serve.mjs)
 * or through Vite (`npm run dev`). Stylesheets are linked from index.html.
 */
import { renderShell } from './shell.js'
import { getPageAdapter } from './aixc/page-adapters.js'
import { initComposer } from './aixc/controller.js'

const regions = renderShell(document.querySelector('#app'))
const adapter = getPageAdapter(document.body.dataset.page)

adapter.renderOriginal(regions.sourceRoot)
initComposer({ adapter, regions })
