/**
 * NavigationHandoff: what is shown inside the portal, when it is ready, and the real
 * navigation at the end (docs/adr/0005-pocket-portal-transition.md, "Destination" and
 * "Handoff").
 *
 * Destination. A same-origin page (the demo: the clone runs at web.vodafone.com.eg/en/services
 * beside the saved Vodafone pages) is rendered for real in a temporary, sandboxed iframe the
 * size of the viewport: no scripts by default (no analytics hit, no storage side effects, no
 * frame busting), no top navigation, no popups, not focusable, hidden from assistive tech.
 * It is "ready" once loaded, readable, not an HTTP error, with fonts and first-screen images
 * decoded. A page that cannot be shown (cross-origin and not allow-listed, blocked by
 * X-Frame-Options or CSP frame-ancestors, an error status, a script-only shell, or too slow)
 * gets an honest preview instead: the sticker's own picture, title and copy and the address
 * it leads to, never a mock of the page. Browser security is never worked around.
 *
 * Handoff. The real navigation is a click on a private copy of the link the person clicked,
 * so href, target, rel and referrer policy behave natively, with propagation stopped so page
 * handlers do not see a second click. (Before it, ./history.js marks the history entry so Back
 * returns to the Pocket.)
 */

/** How a destination can be shown: 'frame' (rendered for real) or 'preview'. */
export const embedModeFor = (url, config, here = location.href) => {
  const mode = config.destination.embed
  if (mode === 'never') return 'preview'
  const target = new URL(url, here)
  if (target.origin === new URL(here).origin) return 'frame'
  if (mode === 'allowlist' && config.destination.allow.some((origin) => new URL(origin).origin === target.origin)) return 'frame'
  return 'preview'
}

const withTimeout = (promise, ms) => Promise.race([promise, new Promise((resolve) => setTimeout(resolve, ms))])

/** Facts about the link the person clicked, for the preview (all from the page itself). */
export const describeLink = (link, url) => {
  const sticker = link.closest('.pocket-sticker')
  const text = (selector) => sticker?.querySelector(selector)?.textContent.trim() || ''
  const target = new URL(url)
  return {
    title: text('.pocket-sticker__title') || link.getAttribute('aria-label')?.replace(/\s*\(opens in a new tab\)\s*$/, '') || link.textContent.trim() || target.hostname,
    from: text('.pocket-sticker__from'),
    description: text('.pocket-sticker__desc'),
    image: sticker?.querySelector('.pocket-sticker__media img')?.currentSrc || '',
    contain: Boolean(sticker?.querySelector('.pocket-sticker__media img.is-contain')),
    address: `${target.hostname}${target.pathname === '/' ? '' : target.pathname}`,
  }
}

const buildPreview = (facts, make) =>
  make(
    'div',
    { class: 'vf-portal__preview' },
    make(
      'div',
      { class: 'vf-portal__preview-inner' },
      facts.image ? make('div', { class: 'vf-portal__preview-media' }, make('img', { src: facts.image, alt: '', class: facts.contain ? 'is-contain' : null })) : null,
      make(
        'div',
        { class: 'vf-portal__preview-body' },
        facts.from ? make('p', { class: 'vf-portal__preview-from' }, facts.from) : null,
        make('p', { class: 'vf-portal__preview-title' }, facts.title),
        facts.description ? make('p', { class: 'vf-portal__preview-text' }, facts.description) : null,
        make('p', { class: 'vf-portal__preview-address' }, facts.address),
      ),
    ),
  )

/** Is there something worth showing in a loaded document? (A script-only shell is not.) */
const presentable = (doc) => {
  const body = doc?.body
  if (!body) return false
  const text = (body.innerText || '').replace(/\s+/g, ' ').trim().length
  const pictures = doc.images.length
  return text > 60 || pictures > 1
}

const firstScreenImages = (doc, height) =>
  [...doc.images].filter((img) => {
    const rect = img.getBoundingClientRect()
    return rect.bottom > 0 && rect.top < height && rect.width > 0
  })

/**
 * Creates what the portal shows. Returns { node, kind, ready, describe, destroy } where `ready`
 * resolves to { kind: 'frame' | 'preview', reason } once something presentable is in place.
 */
export const createDestination = ({ url, link, camera, config, make, timeout }) => {
  const facts = describeLink(link, url)
  const node = make('div', { class: 'vf-portal__destination' })
  const preview = buildPreview(facts, make)
  let kind = embedModeFor(url, config)
  let frame = null

  const usePreview = (reason) => {
    kind = 'preview'
    frame?.remove()
    if (!preview.isConnected) node.append(preview)
    return { kind, reason }
  }

  if (kind === 'preview') {
    node.append(preview)
    const images = [...preview.querySelectorAll('img')].map((img) => img.decode().catch(() => {}))
    return { node, kind, facts, ready: withTimeout(Promise.all(images), 600).then(() => ({ kind: 'preview', reason: 'cross-origin' })), destroy: () => {} }
  }

  frame = make('iframe', {
    class: 'vf-portal__iframe',
    src: url,
    title: facts.title,
    tabindex: '-1',
    'aria-hidden': 'true',
    loading: 'eager',
    referrerpolicy: link.getAttribute('referrerpolicy') || (/\bnoreferrer\b/i.test(link.rel) ? 'no-referrer' : null),
    sandbox: config.destination.scripts ? 'allow-same-origin allow-scripts' : 'allow-same-origin',
    style: { width: `${camera.W}px`, height: `${camera.H}px` },
  })
  node.append(frame)

  const inspect = () => {
    let doc
    try {
      doc = frame.contentDocument
    } catch {
      return { blocked: true }
    }
    if (!doc || doc.URL === 'about:blank') return { blocked: true }
    let status = 0
    try {
      status = frame.contentWindow.performance.getEntriesByType('navigation')[0]?.responseStatus ?? 0
    } catch {
      status = 0
    }
    return { doc, status }
  }

  const loaded = new Promise((resolve) => frame.addEventListener('load', resolve, { once: true }))
  const settle = async () => {
    await loaded
    const { blocked, doc, status } = inspect()
    if (blocked) return usePreview('blocked')
    if (status >= 400) return usePreview(`http-${status}`)
    if (!presentable(doc)) return usePreview('not-presentable')
    // Fonts and first-screen pictures, so the page does not change while it approaches.
    await withTimeout(Promise.all([doc.fonts?.ready, ...firstScreenImages(doc, camera.H).map((img) => img.decode().catch(() => {}))]), 1200)
    return { kind: 'frame', reason: 'loaded' }
  }
  const late = new Promise((resolve) =>
    setTimeout(() => {
      // Too slow: show what has arrived if it is presentable, else the preview.
      const { blocked, doc, status } = inspect()
      if (!blocked && status < 400 && doc && doc.readyState !== 'loading' && presentable(doc)) resolve({ kind: 'frame', reason: 'partial' })
      else resolve(usePreview('timeout'))
    }, timeout),
  )
  return {
    node,
    get kind() {
      return kind
    },
    facts,
    ready: Promise.race([settle(), late]).catch(() => usePreview('error')),
    destroy: () => frame?.remove(),
  }
}

/** Navigates natively, as the person's own click would have. */
export const navigateLike = (link, url, host) => {
  const proxy = link.cloneNode(false)
  proxy.removeAttribute('id')
  proxy.setAttribute('href', url)
  proxy.setAttribute('aria-hidden', 'true')
  proxy.tabIndex = -1
  proxy.className = 'vf-portal__go'
  proxy.textContent = ''
  // Page handlers already saw the person's click; this one is only for the browser.
  proxy.addEventListener('click', (event) => event.stopPropagation())
  host.append(proxy)
  proxy.click()
}
