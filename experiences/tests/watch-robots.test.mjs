// The page watch's robots rule (src/watch/robots.js; voice-guide ADR-0078 point 1, AGENTS §4.5): a port
// of the crawler's (voice-guide/jobs/crawler/robots.ts), which the browser cannot import (TypeScript,
// another package). The parity test runs both over the same cases; Node strips the crawler's types.
import test from 'node:test'
import assert from 'node:assert/strict'

import { parseRobots, robotsAllows } from '../src/watch/robots.js'

const crawler = () => import('../../voice-guide/jobs/crawler/robots.ts')

const TEXTS = {
  empty: '',
  star: 'User-agent: *\nDisallow: /spa/\nDisallow: /auth/\nAllow: /spa/storeLocator$\n',
  comments: '# hello\nUser-agent: * # everyone\nDisallow: /ar/private # no\n\nSitemap: https://web.vodafone.com.eg/sitemap.xml\n',
  crlf: 'User-agent: *\r\nDisallow: /en/cart\r\nAllow: /en/cart/help\r\n',
  wildcards: 'User-agent: *\nDisallow: /*?utm_\nDisallow: /*.pdf$\nAllow: /ar/*bundles\nDisallow: /ar/\n',
  own: 'User-agent: Googlebot\nDisallow: /\n\nUser-agent: AIXC-Watch\nDisallow: /en/\n\nUser-agent: *\nDisallow: /ar/\n',
  grouped: 'User-agent: a\nUser-agent: *\nDisallow: /x\nUser-agent: b\nDisallow: /y\n',
  emptyDisallow: 'User-agent: *\nDisallow:\n',
  everything: 'User-agent: *\nDisallow: /\n',
  tie: 'User-agent: *\nAllow: /ar/home\nDisallow: /ar/home\n',
  noGroup: 'Disallow: /ar/\n',
  oddCase: 'USER-AGENT: *\ndisallow: /EN/\nALLOW: /EN/ok\n',
  regexChars: 'User-agent: *\nDisallow: /a+b(c)[d]{e}|f^g.h\n',
}
const AGENTS = ['*', 'AIXC-Watch/1.0', 'googlebot']
const PATHS = ['/', '/ar/home', '/ar/mobile-internet-bundles', '/ar/private/x', '/en/cart', '/en/cart/help', '/en/HomeDSLcatalog', '/spa/storeLocator', '/spa/storeLocator/x', '/spa/miManagement', '/auth/realms/vf-realm', '/x', '/y', '/doc.pdf', '/doc.pdf?x=1', '/ar/home?utm_source=1', '/EN/ok', '/EN/no', '/en/ok', '/a+b(c)[d]{e}|f^g.h', '/aab']

test('parseRobots reads the * group, a group naming our agent, Allow and Disallow, comments and CRLF', () => {
  assert.deepEqual(parseRobots(TEXTS.star), { allow: ['/spa/storeLocator$'], disallow: ['/spa/', '/auth/'] })
  assert.deepEqual(parseRobots(TEXTS.comments), { allow: [], disallow: ['/ar/private'] })
  assert.deepEqual(parseRobots(TEXTS.own, 'AIXC-Watch/1.0'), { allow: [], disallow: ['/en/'] })
  assert.deepEqual(parseRobots(TEXTS.own), { allow: [], disallow: ['/ar/'] })
  assert.deepEqual(parseRobots(TEXTS.noGroup), { allow: [], disallow: [] })
})

test('robotsAllows: longest match wins, a tie goes to Disallow, * and $ work', () => {
  const r = parseRobots(TEXTS.wildcards)
  assert.equal(robotsAllows(r, '/ar/mobile-internet-bundles'), true)
  assert.equal(robotsAllows(r, '/ar/home'), false)
  assert.equal(robotsAllows(r, '/doc.pdf'), false)
  assert.equal(robotsAllows(r, '/doc.pdf?x=1'), true)
  assert.equal(robotsAllows(parseRobots(TEXTS.tie), '/ar/home'), false)
  assert.equal(robotsAllows(parseRobots(TEXTS.empty), '/anything'), true)
  assert.equal(robotsAllows(parseRobots(TEXTS.everything), '/ar/home'), false)
})

test('parity: the port answers as the crawler does on every case', async () => {
  const ts = await crawler()
  let n = 0
  for (const [name, text] of Object.entries(TEXTS))
    for (const agent of AGENTS) {
      const mine = parseRobots(text, agent)
      const theirs = ts.parseRobots(text, agent)
      assert.deepEqual(mine, theirs, `${name} / ${agent}: parsed alike`)
      for (const p of PATHS) {
        assert.equal(robotsAllows(mine, p), ts.robotsAllows(theirs, p), `${name} / ${agent} / ${p}`)
        n++
      }
    }
  assert.ok(n >= 500, `${n} cases compared`)
})

test('parity: the default agent is the crawler\'s', async () => {
  const ts = await crawler()
  for (const text of Object.values(TEXTS)) assert.deepEqual(parseRobots(text), ts.parseRobots(text))
})
