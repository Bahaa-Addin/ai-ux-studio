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

/** Builds an element; `mark` (config.mark) is called on every node made, so the host can tag it. */
const maker =
  (mark = (node) => node) =>
  (tag, props = {}, ...children) => {
    const node = document.createElement(tag)
    for (const [key, value] of Object.entries(props ?? {})) {
      if (value === null || value === undefined || value === false) continue
      if (key === 'class') node.className = value
      else if (key === 'style') for (const [name, rule] of Object.entries(value)) node.style.setProperty(name.startsWith('--') ? name : name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`), rule)
      else node.setAttribute(key, value === true ? '' : String(value))
    }
    node.append(...children.flat().filter((child) => child !== null && child !== undefined && child !== false))
    return mark(node) ?? node
  }

const STYLESHEET = new URL('./portal.css', import.meta.url).href

/** The clone's way: a <link> to portal.css next to this module. Returns it if this call added it. */
const addStylesheet = (make) => {
  if (document.querySelector('link[data-vf-portal-css]')) return null
  const link = make('link', { rel: 'stylesheet', href: STYLESHEET, 'data-vf-portal-css': '' })
  document.head.append(link)
  return link
}

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
  // On live the portal takes only the stickers' links inside the album root; without one, nothing.
  if (config.live && !viewEvents) {
    api.enabled = false
    return api
  }

  const { mark, wrap } = config
  const make = maker(mark)
  const log = config.debug ? (...args) => console.info('[portal]', ...args) : () => {}
  const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
  let destroyed = false
  // After any error the portal stays off for the rest of the page: links navigate natively.
  let broken = false
  const report = (error) => {
    try {
      config.report?.(error)
    } catch {
      // A reporter that fails must not change what happens to the click.
    }
  }
  const breakDown = (error) => {
    broken = true
    log('error; the portal is off for this page, links navigate natively', error)
    report(error)
  }

  const timers = new Set()
  const later = (fn, ms) => {
    const id = setTimeout(
      wrap(() => {
        timers.delete(id)
        if (!destroyed) fn()
      }),
      ms,
    )
    timers.add(id)
    return id
  }
  const idle = (fn) => {
    let cancel = null
    const run = wrap(() => {
      timers.delete(cancel)
      if (destroyed) return
      try {
        fn()
      } catch (error) {
        breakDown(error)
      }
    })
    if (window.requestIdleCallback) {
      const id = window.requestIdleCallback(run, { timeout: 1200 })
      cancel = () => window.cancelIdleCallback?.(id)
      timers.add(cancel)
    } else later(run, 200)
  }
  const listeners = []
  const on = (target, type, fn, opts) => {
    if (!target) return
    const handler = wrap(fn)
    target.addEventListener(type, handler, opts)
    listeners.push(() => target.removeEventListener(type, handler, opts))
  }

  let stylesheet = null
  if (config.stylesheet) config.stylesheet()
  else stylesheet = addStylesheet(make)

  let scene = null // the loaded controller module
  let loading = null
  const load = () =>
    (loading ??= import('./controller.js').then((module) => {
      scene = module
      return module
    }))

  const warmUp = () => {
    if (broken || destroyed) return
    load()
      .then((module) => idle(() => isPocketPage() && module.prepareEnvironment({ config, make, later: idle })))
      .catch((error) => log('scene failed to load; links will navigate natively', error))
  }

  let current = null
  const emit = (state, detail) => document.dispatchEvent(new CustomEvent('vf-portal:state', { detail: { state, ...detail } }))

  const start = (module, url, link) => {
    config.checkpoint?.('portal-start')
    let mine = null
    mine = module.runTransition({
      url,
      link,
      config,
      make,
      log,
      wrap,
      onState: emit,
      onError: breakDown,
      onDone: (reason) => {
        log('released', reason)
        if (current === mine) current = null
      },
    })
    current = mine
  }

  const interceptor = installInterceptor({
    root: config.live ? viewEvents : document,
    links: config.live ? config.links : null,
    active: () => !broken && !destroyed && isPocketPage() && !(config.reducedMotion === 'navigate' && reducedMotion()),
    hosts: config.hosts,
    exclude: config.exclude,
    log,
    wrap,
    onNavigate: ({ url, link }) => {
      // One transition at a time: the first click wins, later ones wait for it.
      if (current) return true
      try {
        if (scene) start(scene, url, link)
        else {
          const pending = {
            pending: true,
            cancel: () => {
              pending.cancelled = true
              if (current === pending) current = null
            },
          }
          current = pending
          load()
            .then((module) => {
              if (pending.cancelled || destroyed) return
              current = null
              start(module, url, link)
            })
            .catch((error) => {
              // The click was taken; whatever went wrong, the person still gets where they asked.
              if (current === pending) current = null
              breakDown(error)
              if (!pending.cancelled && !destroyed) location.assign(url)
            })
        }
        return true
      } catch (error) {
        current = null
        breakDown(error)
        return false
      }
    },
  })

  // The Pocket opened: load the scene and paint the hall while the person reads.
  on(viewEvents, 'pocket:view', (event) => {
    if (event.detail === 'pocket') warmUp()
    if (event.detail === 'page') {
      forgetPocket()
      scene?.forgetEnvironment()
    }
  })
  let resizeTimer = 0
  on(window, 'resize', () => {
    clearTimeout(resizeTimer)
    timers.delete(resizeTimer)
    resizeTimer = later(() => isPocketPage() && !broken && scene?.prepareEnvironment({ config, make, later: idle }), 250)
  })

  // Back from the destination. From the bfcache the page is exactly as it was, so only the
  // transition is removed; otherwise the history entry says the Pocket was open.
  on(window, 'pageshow', (event) => {
    if (event.persisted && current?.cancel) current.cancel()
  })
  // After the Pocket has finished starting up, but before the first paint (a microtask).
  const saved = pocketToRestore()
  if (saved) {
    queueMicrotask(
      wrap(() =>
        Promise.resolve()
          .then(() => !destroyed && openPocket({ instant: true }))
          .then(() => !destroyed && window.scrollTo(0, saved.scrollY || 0))
          .catch(() => {}),
      ),
    )
  }

  if (config.debug) window.__vfPortal = { config, current: () => current, start: (url, link) => scene && start(scene, url, link) }

  api.current = () => current
  api.destroy = () => {
    if (destroyed) return
    destroyed = true
    interceptor.destroy()
    for (const off of listeners.splice(0)) off()
    for (const timer of timers) typeof timer === 'function' ? timer() : clearTimeout(timer)
    timers.clear()
    const running = current
    current = null
    try {
      running?.cancel?.()
    } finally {
      // Whatever the transition left, the page is given back.
      for (const node of document.querySelectorAll('.vf-portal')) node.remove()
      delete document.documentElement.dataset.vfPortal
      delete document.documentElement.dataset.vfPortalGutter
      stylesheet?.remove()
      if (config.debug && window.__vfPortal?.config === config) delete window.__vfPortal
    }
  }
  return api
}
