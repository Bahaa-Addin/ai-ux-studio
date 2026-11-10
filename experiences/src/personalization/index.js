/**
 * The RED world under the Pocket (demo 5): a personalization and contextual-benefits layer that
 * lives beneath the Pocket album and is discovered at its end.
 *
 *   store      ./store.js + ./engine.js + ./data.js   the customer, the rules, the ranking
 *   widget     ./status-widget.js                     the account at a glance (its own layer)
 *   extension  ./extension.js                         the lip, the push, the return, the scroll
 *   world      ./world.js (+ world.css)               the benefits themselves, loaded on demand
 *
 * Only the lip and the widget's shell load with the page; the world loads the first time the end
 * of the album comes into view, before anyone can press the lip.
 *
 * Demo switches: ?pz=ahmed|mariam|karim picks the customer, ?pz=off turns the layer off,
 * ?aixc-debug exposes window.__pz.
 */

import { make } from '../pocket/pocket.js'
import { lang } from '../i18n.js'
import { createExtension } from './extension.js'
import { createStatusWidget } from './status-widget.js'
import { createStore, resolveProfileId } from './store.js'
import { categoryIcon } from './art.js'
import { dockCategories } from './topics.js'

const storageOrNull = () => {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

let cssLoading = null
const loadWorldCss = () =>
  (cssLoading ??= new Promise((resolve) => {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = new URL('./world.css', import.meta.url).href
    link.dataset.pzWorld = ''
    const timer = window.setTimeout(resolve, 2500)
    const done = () => {
      window.clearTimeout(timer)
      resolve()
    }
    link.addEventListener('load', done)
    link.addEventListener('error', done)
    document.head.append(link)
  }))

/** The lip's words: personal, and true to what is waiting. */
export const lipCopy = (view, { hover = false } = {}) => {
  const waiting = view.progress.total - view.progress.claimed
  const name = view.customer.firstName
  return {
    title: waiting > 0 ? `${waiting} ${waiting === 1 ? 'benefit is' : 'benefits are'} waiting underneath` : 'Your RED world is underneath',
    hint: `Pick a category, or pull up to open your RED world, ${name}`,
  }
}

export const initPersonalization = ({ pocket, regions }) => {
  if (!pocket?.dock?.root || lang !== 'en') return null
  const params = new URLSearchParams(window.location.search)
  if (params.get('pz') === 'off') return null

  const store = createStore({ profileId: resolveProfileId(window.location.search), storage: storageOrNull() })
  const live = make('div', { class: 'aixc-sr-only', role: 'status', 'aria-live': 'polite', 'data-vg': '' })
  document.body.append(live)
  const announce = (text) => {
    live.textContent = ''
    window.setTimeout(() => (live.textContent = text), 60)
  }

  let world = null
  const widget = createStatusWidget({
    store,
    onNavigate: (target, metric) => world?.goTo(target, metric),
    onAction: (action, metric) => world?.act(action, { source: 'widget', metric }),
  })
  widget.floating.dataset.vg = ''

  const hover = () => window.matchMedia('(hover: hover) and (pointer: fine)').matches
  const extension = createExtension({
    pocketRoot: pocket.dock.root,
    header: regions.header,
    footer: regions.footer,
    widget,
    announce,
    lipCopy: () => lipCopy(store.view, { hover: hover() }),
    dockItems: dockCategories(store.view).map((c) => ({ ...c, art: categoryIcon(c.art) })),
    loadWorld: async () => {
      const [module] = await Promise.all([import('./world.js'), loadWorldCss()])
      world = module.createWorld({ store })
      return world
    },
  })
  extension.root.dataset.vg = ''
  store.subscribe(() => extension.phase === 'discoverable' && extension.refreshLip())

  const api = { store, extension, widget }
  if (params.has('aixc-debug')) window.__pz = api
  return api
}
