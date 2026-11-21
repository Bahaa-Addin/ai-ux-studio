/**
 * The page watch's URL rules (voice-guide ADR-0078 point 1 and 7; phase 6 design §4.5, measured as M3):
 * one key per page, so a page linked two ways is fetched once, and the checks that say whether a page
 * may be fetched at all. Resolve; lowercase the host (the URL parser does) and never the path
 * (/en/HomeDSLcatalog); drop the default port, the fragment, utm_*, gclid and fbclid; sort the rest of
 * the query; strip a trailing / except the root. Only the page's own origin, under /en/ or /ar/, never
 * /spa/ or /auth/, never the site's crawl excludes, and only what robots.txt allows.
 */
import { robotsAllows } from './robots.js'

const TRACKING = /^(utm_.*|gclid|fbclid)$/i

/** The normalised absolute URL of `url` (resolved against `base`), or null when it is not an http(s) address. */
export function normalise(url, base) {
  if (url == null || url === '') return null
  let u
  try {
    u = new URL(String(url), base)
  } catch {
    return null
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
  u.hash = ''
  const params = [...u.searchParams].filter(([k]) => !TRACKING.test(k))
  params.sort(([a, x], [b, y]) => (a < b ? -1 : a > b ? 1 : x < y ? -1 : x > y ? 1 : 0))
  u.search = params.length ? new URLSearchParams(params).toString() : ''
  u.pathname = u.pathname.replace(/(.)\/+$/, '$1')
  return u.href
}

/** True when `url` is on `origin` (scheme, host and port). */
export function isSameOrigin(url, origin) {
  try {
    return new URL(url).origin === new URL(origin).origin
  } catch {
    return false
  }
}

const asRegExp = (r) => {
  if (r instanceof RegExp) return r
  try {
    return new RegExp(r)
  } catch {
    return null
  }
}

/**
 * True when the watch may fetch `url` (absolute, or a path on `rules.origin`): same origin, under
 * /en/ or /ar/, no /spa/ or /auth/ anywhere in the path, not matched by `rules.exclude` (the site's crawl
 * excludes, strings or RegExps, tested on the whole URL as the crawler does) and allowed by
 * `rules.robots` ({ allow, disallow } from robots.js) when given. No origin, or a broken exclude
 * pattern: false (fail safe).
 */
export function isWatchablePath(url, rules = {}) {
  const { origin, exclude = [], robots = null } = rules
  if (!origin) return false
  const href = normalise(url, origin)
  if (!href || !isSameOrigin(href, origin)) return false
  const u = new URL(href)
  if (!/^\/(en|ar)\//.test(u.pathname)) return false
  if (/\/(spa|auth)(\/|$)/i.test(u.pathname)) return false
  for (const r of exclude) {
    const re = asRegExp(r)
    if (!re || re.test(href)) return false
  }
  if (robots && !robotsAllows(robots, u.pathname + u.search)) return false
  return true
}

/** The page's key after a fetch: its same-origin `<link rel=canonical>`, else the final URL, normalised. */
export function canonicalOf(doc, finalUrl) {
  const own = normalise(finalUrl)
  const href = doc?.querySelector?.('link[rel~="canonical"][href]')?.getAttribute('href')
  const canonical = href ? normalise(href, finalUrl) : null
  return canonical && own && isSameOrigin(canonical, own) ? canonical : own
}
