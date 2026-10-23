/**
 * Crawl scope and public-only rules for the Vodafone site (ADR-0028, ADR-0032, SPEC-04 §2). Uses
 * the real site config, so a config edit that widens the scope or turns the schedule back on fails
 * here first.
 */
import assert from 'node:assert/strict'
import path from 'node:path'
import { test } from 'node:test'

import { CHALLENGE_TITLE, LOGIN_URL, makeInScope, normalizeUrl } from '../../jobs/crawler/url.ts'
import { loadSiteConfig, ROOT } from '#shared/config.ts'

const site = loadSiteConfig(path.join(ROOT, 'config/sites/vodafone-eg.yaml'))
const inScope = makeInScope({ origins: site.origins.map((o) => o.url), include: site.crawl.include, exclude: site.crawl.exclude })

test('the owner instruction holds: public pages only, no cookies, scheduled crawling paused', () => {
	assert.equal(site.crawl.publicOnly, true)
	assert.deepEqual(site.crawl.cookies || [], [])
	assert.equal(site.sync?.schedule?.enabled, false)
	// SPEC-04 §4 limits.
	assert.ok((site.crawl.concurrency ?? 2) <= 2)
	assert.ok((site.crawl.delayMs ?? 1000) >= 1000)
})

test('navigation pages on both origins are in scope', () => {
	for (const u of [
		'https://web.vodafone.com.eg/ar/home',
		'https://web.vodafone.com.eg/en/mobile-internet-bundles',
		'https://web.vodafone.com.eg/spa/storeLocator',
		'https://web.vodafone.com.eg/spa/NetworkCoverageChecker',
		'https://eshop.vodafone.com.eg/en/',
		'https://eshop.vodafone.com.eg/en/internetServices/dsl/bundles',
	])
		assert.ok(inScope(u), u)
	for (const s of site.crawl.start) assert.ok(inScope(s), `seed ${s}`)
})

test('signed-in, transactional and noise pages are out of scope', () => {
	for (const u of [
		// Logged-in SPA views.
		'https://web.vodafone.com.eg/spa/myHome',
		'https://web.vodafone.com.eg/spa/miManagement?bundle=1',
		// Shop journeys behind robots and accounts.
		'https://eshop.vodafone.com.eg/en/cart',
		'https://eshop.vodafone.com.eg/ar/checkout',
		'https://eshop.vodafone.com.eg/en/account',
		'https://eshop.vodafone.com.eg/en/product/x?Color=black',
		// Sitemap noise (audit §7).
		'https://web.vodafone.com.eg/en/bbbbbbb',
		'https://web.vodafone.com.eg/en/testing4admin',
		'https://web.vodafone.com.eg/en/home-old',
		'https://web.vodafone.com.eg/en/323',
		// Out of the personal-products scope.
		'https://web.vodafone.com.eg/en/business',
		'https://web.vodafone.com.eg/en/careers',
		// Other origins and files.
		'https://www.vodafone.com/',
		'https://web.vodafone.com.eg/en/brochure.pdf',
	])
		assert.equal(inScope(u), false, u)
})

test('URLs normalize without fragments and keep only the shop category query', () => {
	const rules = { keepQuery: site.crawl.keepQuery }
	assert.equal(normalizeUrl('https://web.vodafone.com.eg/ar/home?utm_source=x#top', rules), 'https://web.vodafone.com.eg/ar/home')
	assert.equal(normalizeUrl('https://eshop.vodafone.com.eg/en/smartphones?sort=1&categoryUrls=apple', rules), 'https://eshop.vodafone.com.eg/en/smartphones?categoryUrls=apple')
})

test('login URLs and bot-challenge titles are recognised', () => {
	for (const u of ['https://web.vodafone.com.eg/auth/realms/vf', 'https://x.example/en/login', 'https://x.example/sso?next=/', 'https://x.example/oauth/authorize']) assert.ok(LOGIN_URL.test(u), u)
	for (const u of ['https://web.vodafone.com.eg/en/authentic-offers', 'https://web.vodafone.com.eg/ar/home']) assert.equal(LOGIN_URL.test(u), false, u)
	for (const t of ['Access Denied', 'Just a moment...', 'Attention Required! | Cloudflare', 'Request Rejected']) assert.ok(CHALLENGE_TITLE.test(t), t)
	assert.equal(CHALLENGE_TITLE.test('Vodafone Egypt | Home'), false)
})
