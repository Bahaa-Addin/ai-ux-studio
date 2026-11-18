// Page watch URL rules (src/watch/url.js; voice-guide ADR-0078 point 7, phase 6 design §4.5), with the
// real cases measured on the saved pages (design M3).
import test from 'node:test'
import assert from 'node:assert/strict'

import { canonicalOf, isSameOrigin, isWatchablePath, normalise } from '../src/watch/url.js'

const ORIGIN = 'https://web.vodafone.com.eg'
const HOME = `${ORIGIN}/ar/home`

test('normalise resolves against the page and keeps the path\'s case (/en/HomeDSLcatalog)', () => {
  assert.equal(normalise('/en/HomeDSLcatalog', HOME), `${ORIGIN}/en/HomeDSLcatalog`)
  assert.equal(normalise('mobile-internet-bundles', `${ORIGIN}/ar/home`), `${ORIGIN}/ar/mobile-internet-bundles`)
  assert.equal(normalise('../en/services', `${ORIGIN}/ar/home`), `${ORIGIN}/en/services`)
})

test('normalise lowercases the host only and drops the default port', () => {
  assert.equal(normalise('HTTPS://WEB.Vodafone.COM.EG:443/en/Services'), `${ORIGIN}/en/Services`)
  assert.equal(normalise('http://web.vodafone.com.eg:80/ar/home'), 'http://web.vodafone.com.eg/ar/home')
  assert.equal(normalise('https://web.vodafone.com.eg:8443/ar/home'), 'https://web.vodafone.com.eg:8443/ar/home')
})

test('normalise drops the fragment, utm_*, gclid and fbclid, and sorts the rest of the query', () => {
  assert.equal(normalise('/ar/home#top', HOME), HOME)
  assert.equal(normalise('/ar/home?utm_source=x&utm_medium=y&gclid=1&fbclid=2', HOME), HOME)
  assert.equal(normalise('/ar/home?b=2&utm_campaign=z&a=1#x', HOME), `${HOME}?a=1&b=2`)
  assert.equal(normalise('/ar/home?a=2&a=1', HOME), normalise('/ar/home?a=2&a=1', HOME), 'stable')
})

test('normalise strips one or more trailing slashes, except the root', () => {
  assert.equal(normalise('/ar/home/', HOME), HOME)
  assert.equal(normalise('/ar/home//', HOME), HOME)
  assert.equal(normalise('/', HOME), `${ORIGIN}/`)
  assert.equal(normalise(ORIGIN), `${ORIGIN}/`)
})

test('normalise gives null for what is not a web address', () => {
  for (const x of ['mailto:a@b.c', 'tel:16888', 'javascript:void(0)', '', null, undefined, 'http://[bad']) assert.equal(normalise(x, HOME), null, String(x))
})

test('normalise: the same page written two ways is one key', () => {
  assert.equal(normalise('https://web.vodafone.com.eg/ar/home/?utm_source=sms#hero'), normalise('/ar/home', HOME))
})

test('isSameOrigin: www., eshop. and the mistyped web.vodafone.com.egen are other origins', () => {
  assert.equal(isSameOrigin(`${ORIGIN}/ar/services`, ORIGIN), true)
  assert.equal(isSameOrigin('https://WEB.vodafone.com.eg:443/x', ORIGIN), true)
  assert.equal(isSameOrigin('https://www.vodafone.com.eg/ar/home', ORIGIN), false)
  assert.equal(isSameOrigin('https://eshop.vodafone.com.eg/ar/lines/red/numbers', ORIGIN), false)
  assert.equal(isSameOrigin('https://web.vodafone.com.egen/shokran-services', ORIGIN), false)
  assert.equal(isSameOrigin('http://web.vodafone.com.eg/ar/home', ORIGIN), false, 'scheme counts')
  assert.equal(isSameOrigin('not a url', ORIGIN), false)
})

const RULES = {
  origin: ORIGIN,
  // Two of vodafone-eg.yaml's crawl excludes, as strings (as the page-map answer carries them).
  exclude: ['(terms|t-c|tandc|termsandconditions|tcs)', '/(en|ar)/(business|foundation)'],
}

test('isWatchablePath: same-origin CMS pages under /en/ or /ar/ only', () => {
  assert.equal(isWatchablePath(`${ORIGIN}/ar/mobile-internet-bundles`, RULES), true)
  assert.equal(isWatchablePath('/en/vodafone-cash', RULES), true, 'a path is on the rules\' origin')
  assert.equal(isWatchablePath(`${ORIGIN}/en/HomeDSLcatalog`, RULES), true)
  assert.equal(isWatchablePath(`${ORIGIN}/fr/home`, RULES), false)
  assert.equal(isWatchablePath(`${ORIGIN}/`, RULES), false)
  assert.equal(isWatchablePath(`${ORIGIN}/en`, RULES), false)
})

test('isWatchablePath: /spa/ and /auth/ are never fetched (the sign-in /auth/realms/...)', () => {
  assert.equal(isWatchablePath(`${ORIGIN}/spa/miManagement`, RULES), false)
  assert.equal(isWatchablePath(`${ORIGIN}/spa/storeLocator`, RULES), false)
  const signIn = `${ORIGIN}/auth/realms/vf-realm/protocol/openid-connect/auth?client_id=website&redirect_uri=https%3A%2F%2Fweb.vodafone.com.eg%2Fspa%2FmyHome`
  assert.equal(isWatchablePath(signIn, RULES), false)
  assert.equal(isWatchablePath(`${ORIGIN}/en/auth/x`, RULES), false, '/auth/ anywhere in the path')
  assert.equal(isWatchablePath(`${ORIGIN}/ar/spa/x`, RULES), false, '/spa/ anywhere in the path')
})

test('isWatchablePath: other origins are never watched (eshop., www., the mistyped host)', () => {
  assert.equal(isWatchablePath('https://eshop.vodafone.com.eg/ar/lines/red/numbers', RULES), false)
  assert.equal(isWatchablePath('https://www.vodafone.com.eg/ar/home', RULES), false)
  assert.equal(isWatchablePath('https://web.vodafone.com.egen/shokran-services', RULES), false)
})

test('isWatchablePath: the site\'s crawl exclude list (strings or RegExps) and robots rules', () => {
  assert.equal(isWatchablePath(`${ORIGIN}/en/terms-of-use`, RULES), false)
  assert.equal(isWatchablePath(`${ORIGIN}/ar/business-solutions`, RULES), false)
  assert.equal(isWatchablePath(`${ORIGIN}/ar/home`, { ...RULES, exclude: [/home/] }), false)
  assert.equal(isWatchablePath(`${ORIGIN}/ar/home`, { ...RULES, robots: { allow: [], disallow: ['/ar/'] } }), false)
  assert.equal(isWatchablePath(`${ORIGIN}/ar/home`, { ...RULES, robots: { allow: ['/ar/home'], disallow: ['/ar/'] } }), true)
  assert.equal(isWatchablePath(`${ORIGIN}/ar/home`, { ...RULES, exclude: ['(['] }), false, 'a broken pattern fails safe')
})

test('isWatchablePath: no origin in the rules, nothing is watchable (fail safe)', () => {
  assert.equal(isWatchablePath(`${ORIGIN}/ar/home`, {}), false)
  assert.equal(isWatchablePath(`${ORIGIN}/ar/home`), false)
})

/** A parsed document as far as canonicalOf reads it. */
const docWith = (href) => ({ querySelector: (sel) => (href !== null && /canonical/.test(sel) ? { getAttribute: (n) => (n === 'href' ? href : null) } : null) })

test('canonicalOf prefers a same-origin canonical, normalised', () => {
  assert.equal(canonicalOf(docWith('https://web.vodafone.com.eg/ar/home'), `${ORIGIN}/ar/home?x=1`), `${ORIGIN}/ar/home`)
  assert.equal(canonicalOf(docWith('/ar/home/'), `${ORIGIN}/ar/home?x=1`), `${ORIGIN}/ar/home`, 'relative, trailing slash')
})

test('canonicalOf falls back to the final URL: no canonical (/spa/), another origin, or a broken one', () => {
  assert.equal(canonicalOf(docWith(null), `${ORIGIN}/spa/storeLocator#map`), `${ORIGIN}/spa/storeLocator`)
  assert.equal(canonicalOf(docWith('https://www.vodafone.com.eg/ar/home'), `${ORIGIN}/ar/home/`), `${ORIGIN}/ar/home`)
  assert.equal(canonicalOf(docWith('mailto:x@y.z'), `${ORIGIN}/ar/home`), `${ORIGIN}/ar/home`)
  assert.equal(canonicalOf(null, `${ORIGIN}/ar/home`), `${ORIGIN}/ar/home`)
})
