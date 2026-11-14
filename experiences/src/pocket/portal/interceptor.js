/**
 * NavigationInterceptor: decides which clicks on the Pocket page become a portal
 * transition, and leaves every other navigation exactly as the browser would do it
 * (docs/adr/0005-pocket-portal-transition.md, "What is intercepted").
 *
 * Intercepted: a plain primary-button click (or Enter on a focused link, which the browser
 * turns into a click) on an <a href>/<area href> that navigates this tab to another page on
 * an eligible host, while the page says it is the Pocket (`active()`), when nothing else
 * has already handled the click.
 *
 * Never intercepted: modified clicks (Ctrl, ⌘, Shift, Alt) and the middle button (new tab or
 * window), target="_blank" or any other target but this tab, `download` links, non-http(s)
 * schemes, jumps within this same page, links marked data-portal="off", links under the
 * configured exclusions, clicks another script already prevented, and the synthetic click the
 * handoff itself makes to navigate natively.
 *
 * On Vodafone's live pages (`live`, ADR-0005 for the clone; the phase 3 map, OD-3) the listener
 * sits on the album root, not the document, and only the stickers' own links (`links`) are taken:
 * Vodafone's header, footer and cards, and the guide's and the layer's own links, are never
 * handled and never prevented. The page's own origin is the only eligible host.
 */

const SAME_TAB_TARGETS = new Set(['', '_self'])

/** The link a click activates, or null (a click may land on an icon inside the link). */
export const linkFrom = (target) => {
  const node = target?.nodeType === 1 ? target : target?.parentElement
  return node?.closest?.('a[href], area[href]') ?? null
}

/**
 * Why a click is not eligible (a short reason), or '' when it is.
 * `event` needs { button, metaKey, ctrlKey, shiftKey, altKey, defaultPrevented };
 * `here` is the page's URL; `hosts` a list of RegExp; `excluded(link)` a predicate.
 */
export const whyNotEligible = ({ event, link, here, hosts = [], excluded = () => false, inScope = () => true, topLevel = true }) => {
  if (!link) return 'no-link'
  if (!inScope(link)) return 'out-of-scope'
  if (event.defaultPrevented) return 'handled'
  if (event.button !== 0) return 'not-primary-button'
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return 'modified-click'
  if (link.hasAttribute('download')) return 'download'
  const target = (link.getAttribute('target') || '').trim().toLowerCase()
  const sameTab = SAME_TAB_TARGETS.has(target) || (topLevel && (target === '_top' || target === '_parent'))
  if (!sameTab) return 'other-target'
  if (excluded(link)) return 'excluded'
  let url
  try {
    url = new URL(link.getAttribute('href'), here)
  } catch {
    return 'bad-url'
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return 'not-http'
  const current = new URL(here)
  if (url.origin === current.origin && url.pathname === current.pathname && url.search === current.search) return 'same-page'
  const eligibleHost = url.origin === current.origin || hosts.some((host) => host.test(url.hostname))
  if (!eligibleHost) return 'other-host'
  return ''
}

/**
 * Listens for clicks and hands eligible ones to `onNavigate({ url, link, event })`, which
 * must decide synchronously whether it takes over (return true: the default is prevented).
 * Returns { bypass(link), destroy() }: `bypass` lets the very next click on that link through,
 * which is how the handoff performs the real navigation with native semantics.
 */
/**
 * Is `link` one the portal may take? With `links` (a selector; live), only a link matching it
 * inside `root`; otherwise any link.
 */
export const scopeFor = (root, links) => (links ? (link) => Boolean(link?.matches?.(links)) && root !== link && Boolean(root?.contains?.(link)) : () => true)

export const installInterceptor = ({ root = document, links = null, active, hosts, exclude, onNavigate, log = () => {}, wrap = (fn) => fn }) => {
  let bypassed = null
  const excluded = (link) => Boolean(exclude) && Boolean(link.closest(exclude))
  const inScope = scopeFor(root, links)
  const onClick = wrap((event) => {
    try {
      const link = linkFrom(event.target)
      if (!link) return
      if (bypassed === link) {
        bypassed = null
        return
      }
      if (!active()) return
      const reason = whyNotEligible({ event, link, here: location.href, hosts, excluded, inScope, topLevel: window.top === window })
      if (reason) {
        log(`native navigation (${reason})`, link.href)
        return
      }
      if (onNavigate({ url: new URL(link.getAttribute('href'), location.href).href, link, event })) event.preventDefault()
    } catch (error) {
      // Never break a link: whatever went wrong, the browser navigates as usual.
      log('interceptor error, navigating natively', error)
    }
  })
  // Bubble phase on the document (live: on the album root): page handlers run first and can prevent or stop it.
  root.addEventListener('click', onClick)
  return {
    bypass: (link) => {
      bypassed = link
    },
    destroy: () => root.removeEventListener('click', onClick),
  }
}
