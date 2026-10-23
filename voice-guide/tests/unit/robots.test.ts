/**
 * robots.txt rules for both Vodafone origins (SPEC-04 §4, ADR-0032, AGENTS.md rule 5). The texts
 * are the ones recorded in the live-site audit §7 on 2026-10-23.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { parseRobots, robotsAllows } from '../../jobs/crawler/robots.ts'

const WEB = `User-agent: *
Allow: /

User-agent: OAI-SearchBot
User-agent: ChatGPT-User
Allow: /

Sitemap: https://web.vodafone.com.eg/site-a/sitemap-en.xml
Sitemap: https://web.vodafone.com.eg/site-a/sitemap-ar.xml
`

const SHOP = `# eshop
User-agent: *
Allow: /
Allow: /en/
Disallow: /cart
Disallow: /*/cart
Disallow: /checkout
Disallow: /*/checkout
Disallow: /wishlist
Disallow: /*/wishlist
Disallow: /register
Disallow: /*/register
Disallow: /account
Disallow: /*/account
Disallow: /*?*Color=
Disallow: /*?*Storage=
Disallow: /*?*Size=
Disallow: /*?*variantID=
`

const UA = 'VodafoneEG-VoiceGuide-Crawler/0.1'

test('web origin: everything public is allowed for our agent', () => {
	const r = parseRobots(WEB, UA)
	for (const p of ['/ar/home', '/en/mobile-internet-bundles', '/spa/storeLocator', '/ar/vodafone-cash?x=1']) assert.ok(robotsAllows(r, p), p)
})

test('shop origin: cart, checkout, wishlist, register and account are never crawled', () => {
	const r = parseRobots(SHOP, UA)
	for (const p of ['/cart', '/en/cart', '/ar/checkout/step-1', '/en/wishlist', '/ar/register', '/en/account/orders']) assert.equal(robotsAllows(r, p), false, p)
	for (const p of ['/en/', '/ar/', '/en/internetServices/dsl/bundles', '/en/smartphones?categoryUrls=apple']) assert.ok(robotsAllows(r, p), p)
})

test('shop origin: product-variant query combinations are disallowed', () => {
	const r = parseRobots(SHOP, UA)
	assert.equal(robotsAllows(r, '/en/product/iphone-16?Color=black'), false)
	assert.equal(robotsAllows(r, '/en/product/iphone-16?ref=1&Storage=256'), false)
	assert.equal(robotsAllows(r, '/en/product/iphone-16?variantID=9'), false)
	assert.ok(robotsAllows(r, '/en/product/iphone-16'))
})

test('a group naming our agent replaces the * group; longest match wins; $ anchors', () => {
	const txt = `User-agent: *
Disallow: /

User-agent: VodafoneEG-VoiceGuide-Crawler
Disallow: /private
Allow: /private/help$
`
	const r = parseRobots(txt, UA)
	assert.ok(robotsAllows(r, '/en/home'))
	assert.equal(robotsAllows(r, '/private/x'), false)
	assert.ok(robotsAllows(r, '/private/help'))
	assert.equal(robotsAllows(r, '/private/help/more'), false)
	// Anyone else gets the * group.
	assert.equal(robotsAllows(parseRobots(txt, 'OtherBot/1.0'), '/en/home'), false)
})

test('comments, blank lines and unknown keys are ignored; an empty Disallow allows all', () => {
	const r = parseRobots('# hi\nUser-agent: * # all\nCrawl-delay: 5\nDisallow:\n', UA)
	assert.ok(robotsAllows(r, '/anything'))
})
