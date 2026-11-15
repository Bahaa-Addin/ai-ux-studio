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
 * Fetched once (`config.fetchOnce`, on by default on Vodafone's live pages; the phase 3 map, OD-4).
 * The frame never loads the destination's URL: the page is fetched once (fetch, same-origin
 * credentials) and that response is drawn in a frame with no scripts (srcdoc with a <base href>, a
 * sandbox without allow-scripts, and a policy that allows no scripts, frames, plugins, forms or
 * connections), so the real navigation afterwards can be served from the browser's HTTP cache
 * (Vodafone's pages: Cache-Control max-age=14400, public). A response that is not a page worth
 * showing (an error, not HTML, a bot challenge, too little in it, too slow) gets the preview, with
 * no second request; the navigation goes ahead natively either way.
 *
 * Handoff. The real navigation is a click on a fresh link carrying only the href, target, rel and
 * referrer policy of the one the person clicked (no ids, classes, data or inline handlers, so the
 * page's own onclick never runs twice), so they behave natively, with propagation stopped so page
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

const withTimeout = (promise, ms, wrap = (fn) => fn) => Promise.race([promise, new Promise((resolve) => setTimeout(wrap(resolve), ms))])

/* ------------------------------------------------------------------ fetched once */

/** Signs of a bot challenge or a block page instead of the page (rule 5: never try to get past one). */
const CHALLENGE = /captcha|challenge-platform|cf-chl-|_incapsula_resource|px-captcha|bm-verify|sec-if-cpt|<title>\s*(access denied|attention required|just a moment)/i

/** The text a reader would see in an HTML document, roughly (no DOM needed: no scripts, styles or tags). */
export const roughText = (html) =>
  String(html)
    .replace(/<(script|style|template|noscript|svg)\b[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&[#\w]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/**
 * Why a fetched response is not drawn (a short reason), or '' when it is. `response` needs
 * { ok, status, url, headers: { get(name) } }; `html` is its text (or null before it is read);
 * `here` the page's URL. The same rule as a frame loaded from its URL: more than 60 characters of
 * text or more than one picture.
 */
export const whyNotDrawn = ({ response, html = null, here }) => {
  if (!response) return 'no-response'
  if (!response.ok) return `http-${response.status}`
  const type = String(response.headers?.get?.('content-type') || '').toLowerCase()
  if (!/^\s*(text\/html|application\/xhtml\+xml)\b/.test(type)) return 'not-html'
  if (response.url && new URL(response.url).origin !== new URL(here).origin) return 'other-origin'
  if (html === null) return ''
  if (CHALLENGE.test(html)) return 'challenge'
  const pictures = (html.match(/<img\b[^>]*\ssrc\s*=\s*["']?[^"'\s>]/gi) || []).length
  if (!(roughText(html).length > 60 || pictures > 1)) return 'not-presentable'
  return ''
}

/** What may load inside the drawn page: its pictures, styles and fonts; nothing that runs or navigates. */
export const FRAME_POLICY = "script-src 'none'; object-src 'none'; frame-src 'none'; child-src 'none'; worker-src 'none'; connect-src 'none'; form-action 'none'; manifest-src 'none'"

const escapeAttribute = (value) => String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')

/**
 * The response's HTML made into a document that runs nothing and loads no other document: its
 * scripts, <noscript> (it would apply in a frame without scripts), frames, plugins, refreshes,
 * prefetches and own <base> taken out, then a policy and a <base href> to `base` put first in its
 * head, so its relative addresses resolve as on the page itself.
 */
export const inertDocument = (html, base) => {
  const body = String(html)
    .replace(/<(script|noscript|iframe|frame|object|embed|template)\b[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<(script|noscript|iframe|frame|frameset|object|embed|base|portal)\b[^>]*>/gi, '')
    .replace(/<meta\b[^>]*http-equiv\s*=\s*["']?\s*refresh[^>]*>/gi, '')
    .replace(/<link\b[^>]*\brel\s*=\s*["']?[^"'>]*\b(prefetch|prerender|preload|modulepreload|preconnect|dns-prefetch|manifest|serviceworker)\b[^>]*>/gi, '')
  const head = `<meta http-equiv="Content-Security-Policy" content="${FRAME_POLICY}"><base href="${escapeAttribute(base)}">`
  const at = body.search(/<head\b[^>]*>/i)
  if (at >= 0) {
    const end = body.indexOf('>', at) + 1
    return body.slice(0, end) + head + body.slice(end)
  }
  const html5 = body.match(/^\s*(<!doctype[^>]*>)?\s*(<html\b[^>]*>)?/i)[0]
  return `${html5}<head>${head}</head>${body.slice(html5.length)}`
}

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
export const createDestination = ({ url, link, camera, config, make, timeout, wrap = (fn) => fn }) => {
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
    return { node, kind, facts, ready: withTimeout(Promise.all(images), 600, wrap).then(() => ({ kind: 'preview', reason: 'cross-origin' })), destroy: () => {} }
  }

  if (config.fetchOnce) return fetchedDestination({ url, link, camera, make, timeout, wrap, facts, node, usePreview, setFrame: (f) => (frame = f), getKind: () => kind })

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

  const loaded = new Promise((resolve) => frame.addEventListener('load', wrap(resolve), { once: true }))
  const settle = async () => {
    await loaded
    const { blocked, doc, status } = inspect()
    if (blocked) return usePreview('blocked')
    if (status >= 400) return usePreview(`http-${status}`)
    if (!presentable(doc)) return usePreview('not-presentable')
    // Fonts and first-screen pictures, so the page does not change while it approaches.
    await withTimeout(Promise.all([doc.fonts?.ready, ...firstScreenImages(doc, camera.H).map((img) => img.decode().catch(() => {}))]), 1200, wrap)
    return { kind: 'frame', reason: 'loaded' }
  }
  const late = new Promise((resolve) =>
    setTimeout(wrap(() => {
      // Too slow: show what has arrived if it is presentable, else the preview.
      const { blocked, doc, status } = inspect()
      if (!blocked && status < 400 && doc && doc.readyState !== 'loading' && presentable(doc)) resolve({ kind: 'frame', reason: 'partial' })
      else resolve(usePreview('timeout'))
    }), timeout),
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

/** The only attributes of the person's link that the navigation keeps: what decides how it navigates. */
export const NAVIGATION_ATTRIBUTES = ['target', 'rel', 'referrerpolicy']

/** The attributes of the fresh link the handoff clicks (an object; no ids, classes, data or on* handlers). */
export const navigationAttributes = (link, url) => {
  const out = { href: url }
  for (const name of NAVIGATION_ATTRIBUTES) {
    const value = link.getAttribute(name)
    if (value !== null) out[name] = value
  }
  return { ...out, class: 'vf-portal__go', 'aria-hidden': 'true', tabindex: '-1' }
}

const defaultMake = (tag, props) => {
  const node = document.createElement(tag)
  for (const [key, value] of Object.entries(props)) node.setAttribute(key, value)
  return node
}

/** Navigates natively, as the person's own click would have. */
export const navigateLike = (link, url, host, { make = defaultMake, wrap = (fn) => fn } = {}) => {
  const proxy = make('a', navigationAttributes(link, url))
  // Page handlers already saw the person's click; this one is only for the browser.
  proxy.addEventListener('click', wrap((event) => event.stopPropagation()))
  host.append(proxy)
  proxy.click()
}

/**
 * The fetch-once destination: one fetch, drawn in a script-free frame, else the preview. Never a
 * second request for the page, whatever happens.
 */
const fetchedDestination = ({ url, link, camera, make, timeout, wrap, facts, node, usePreview, setFrame, getKind }) => {
  const here = location.href
  const abort = typeof AbortController === 'function' ? new AbortController() : null
  let frame = null
  let done = false
  const finish = (result) => {
    done = true
    return result
  }
  const referrerPolicy = link.getAttribute('referrerpolicy') || (/\bnoreferrer\b/i.test(link.getAttribute('rel') || '') ? 'no-referrer' : undefined)

  // Once the race is decided (drawn, preview or too slow), nothing that arrives later changes it.
  const decided = () => ({ kind: getKind(), reason: 'late' })
  const draw = async () => {
    const response = await fetch(url, {
      credentials: 'same-origin',
      // As a navigation would ask for it, so a cache that varies on Accept serves the navigation too.
      headers: { Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' },
      ...(referrerPolicy ? { referrerPolicy } : {}),
      ...(abort ? { signal: abort.signal } : {}),
    })
    const early = whyNotDrawn({ response, here })
    if (early) {
      // Not a page to draw: its body is not read (nothing else is asked for).
      response.body?.cancel?.().catch?.(() => {})
      return done ? decided() : usePreview(early)
    }
    // (Read whole even when it is too late to draw it: so the navigation can come from the cache.)
    const html = await response.text()
    if (done) return decided()
    const why = whyNotDrawn({ response, html, here })
    if (why) return usePreview(why)
    frame = make('iframe', {
      class: 'vf-portal__iframe',
      title: facts.title,
      tabindex: '-1',
      'aria-hidden': 'true',
      // No allow-scripts: nothing in it runs (allow-same-origin only so its fonts and pictures can be waited for).
      sandbox: 'allow-same-origin',
      style: { width: `${camera.W}px`, height: `${camera.H}px` },
    })
    setFrame(frame)
    const loaded = new Promise((resolve) => frame.addEventListener('load', wrap(resolve), { once: true }))
    frame.srcdoc = inertDocument(html, response.url || url)
    node.append(frame)
    await loaded
    if (done) return decided()
    let doc = null
    try {
      doc = frame.contentDocument
    } catch {
      doc = null
    }
    if (!doc || !presentable(doc)) return usePreview(doc ? 'not-presentable' : 'blocked')
    await withTimeout(Promise.all([doc.fonts?.ready, ...firstScreenImages(doc, camera.H).map((img) => img.decode().catch(() => {}))]), 1200, wrap)
    return { kind: 'frame', reason: 'fetched' }
  }

  let lateTimer = 0
  const late = new Promise((resolve) => {
    lateTimer = setTimeout(
      wrap(() => {
        if (done) return
        let doc = null
        try {
          doc = frame?.contentDocument ?? null
        } catch {
          doc = null
        }
        // Too slow: what has been drawn, if it is presentable, else the preview (the fetch goes on
        // for the cache, unless the transition is given up).
        if (doc && doc.URL === 'about:srcdoc' && doc.readyState !== 'loading' && presentable(doc)) resolve({ kind: 'frame', reason: 'partial' })
        else resolve(usePreview('timeout'))
      }),
      timeout,
    )
  })
  return {
    node,
    get kind() {
      return getKind()
    },
    facts,
    ready: Promise.race([draw().catch((error) => (done ? decided() : usePreview(error?.name === 'AbortError' ? 'cancelled' : 'error'))), late]).then(finish),
    destroy: () => {
      done = true
      clearTimeout(lateTimer)
      abort?.abort()
      frame?.remove()
    },
  }
}
