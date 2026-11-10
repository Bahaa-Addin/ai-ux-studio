/**
 * The Pocket's portal transition: leaving the Pocket page through a door of light
 * (docs/adr/0005-pocket-portal-transition.md).
 *
 * A plain click on a link that leaves the Pocket page for another Vodafone page does not just
 * navigate: the whole page falls back like a wall, revealing a passage of white light; the
 * destination, framed in Vodafone red, travels toward you until it is the screen; then the real
 * navigation happens underneath, on the very same picture.
 *
 * This file is the small, always-loaded part: configuration, the click interceptor, history and
 * bfcache care, and the stylesheet. The scene (./controller.js and what it imports) is loaded
 * when the Pocket opens, and the hall is painted while the person reads their stickers, so the
 * click starts the animation in the same frame.
 *
 * Responsibilities (ADR-0005, "Architecture"):
 *   interceptor.js  NavigationInterceptor     which clicks become a transition
 *   controller.js   PortalTransitionController one clock, one state, the choreography
 *   wall.js         PocketWall3D              the page as one slab, falling backwards
 *   environment.js  PortalEnvironment         the hall of white light
 *   gate.js         DestinationPortalFrame    the red frame and the travelling page
 *   handoff.js      NavigationHandoff         readiness, the real navigation
 *   history.js      (with handoff)            Back and Forward return to the Pocket
 *   motion.js       the geometry and curves   (pure; unit-tested)
 */

import { resolvePortalConfig } from './config.js'
import { installInterceptor } from './interceptor.js'
import { forgetPocket, pocketToRestore } from './history.js'

const make = (tag, props = {}, ...children) => {
  const node = document.createElement(tag)
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value === null || value === undefined || value === false) continue
    if (key === 'class') node.className = value
    else if (key === 'style') for (const [name, rule] of Object.entries(value)) node.style.setProperty(name.startsWith('--') ? name : name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`), rule)
    else node.setAttribute(key, value === true ? '' : String(value))
  }
  node.append(...children.flat().filter((child) => child !== null && child !== undefined && child !== false))
  return node
}

const STYLESHEET = new URL('./portal.css', import.meta.url).href

const addStylesheet = () => {
  if (document.querySelector('link[data-vf-portal-css]')) return
  document.head.append(make('link', { rel: 'stylesheet', href: STYLESHEET, 'data-vf-portal-css': '' }))
}

const idle = (fn) => (window.requestIdleCallback ? window.requestIdleCallback(fn, { timeout: 1200 }) : setTimeout(fn, 200))

/**
 * Wires the portal to the Pocket.
 *   isPocketPage()   true while the Pocket page is what the person sees
 *   openPocket(opts) opens the Pocket (used with { instant: true } when Back returns here)
 *   viewEvents       the element that dispatches 'pocket:view' ('pocket' | 'closing' | 'page')
 * Returns { enabled, config, current(), destroy() }.
 */
export const initPocketPortal = ({ options = {}, isPocketPage, openPocket, viewEvents }) => {
  const config = resolvePortalConfig(options)
  const api = { enabled: Boolean(config.enabled), config, current: () => null, destroy: () => {} }
  if (!config.enabled) return api

  const log = config.debug ? (...args) => console.info('[portal]', ...args) : () => {}
  const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
  addStylesheet()

  let scene = null // the loaded controller module
  let loading = null
  const load = () =>
    (loading ??= import('./controller.js').then((module) => {
      scene = module
      return module
    }))

  const warmUp = () => {
    load()
      .then((module) => idle(() => isPocketPage() && module.prepareEnvironment({ config, make, later: idle })))
      .catch((error) => log('scene failed to load; links will navigate natively', error))
  }

  let current = null
  const emit = (state, detail) => document.dispatchEvent(new CustomEvent('vf-portal:state', { detail: { state, ...detail } }))

  const start = (module, url, link) => {
    current = module.runTransition({
      url,
      link,
      config,
      make,
      log,
      onState: emit,
      onDone: (reason) => {
        log('released', reason)
        current = null
      },
    })
  }

  const interceptor = installInterceptor({
    active: () => isPocketPage() && !(config.reducedMotion === 'navigate' && reducedMotion()),
    hosts: config.hosts,
    exclude: config.exclude,
    log,
    onNavigate: ({ url, link }) => {
      // One transition at a time: the first click wins, later ones wait for it.
      if (current) return true
      try {
        if (scene) start(scene, url, link)
        else {
          current = { pending: true }
          load()
            .then((module) => start(module, url, link))
            .catch(() => location.assign(url))
        }
        return true
      } catch (error) {
        log('could not start; navigating natively', error)
        current = null
        return false
      }
    },
  })

  // The Pocket opened: load the scene and paint the hall while the person reads.
  const onView = (event) => {
    if (event.detail === 'pocket') warmUp()
    if (event.detail === 'page') {
      forgetPocket()
      scene?.forgetEnvironment()
    }
  }
  viewEvents?.addEventListener('pocket:view', onView)
  let resizeTimer = 0
  const onResize = () => {
    clearTimeout(resizeTimer)
    resizeTimer = setTimeout(() => isPocketPage() && scene?.prepareEnvironment({ config, make, later: idle }), 250)
  }
  window.addEventListener('resize', onResize)

  // Back from the destination. From the bfcache the page is exactly as it was, so only the
  // transition is removed; otherwise the history entry says the Pocket was open.
  const onShow = (event) => {
    if (event.persisted && current?.cancel) current.cancel()
  }
  window.addEventListener('pageshow', onShow)
  // After the Pocket has finished starting up, but before the first paint (a microtask).
  const saved = pocketToRestore()
  if (saved) {
    queueMicrotask(() =>
      Promise.resolve()
        .then(() => openPocket({ instant: true }))
        .then(() => window.scrollTo(0, saved.scrollY || 0))
        .catch(() => {}),
    )
  }

  if (config.debug) window.__vfPortal = { config, current: () => current, start: (url, link) => scene && start(scene, url, link) }

  api.current = () => current
  api.destroy = () => {
    interceptor.destroy()
    viewEvents?.removeEventListener('pocket:view', onView)
    window.removeEventListener('resize', onResize)
    window.removeEventListener('pageshow', onShow)
    current?.cancel?.()
  }
  return api
}
