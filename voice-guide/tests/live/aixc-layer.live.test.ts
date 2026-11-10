/**
 * Live check of the experience layer (ADR-0048, phase 1 of the live plan) on the real
 * web.vodafone.com.eg: aixc.js beside guide.js on ten public pages in both languages, through the
 * demo browser as `npm run demo:live` runs it. For each page: the layer is ready and found its page,
 * it logged nothing wrong, no page error came from it, and it shifted nothing of Vodafone's page
 * (positions and widths of the header, #main-content and its first sections, with the layer and
 * with ?aixc=off; heights move with carousels and lazy pictures, so they are not compared). It also
 * prints what the live page has where the layer will need it (header, sticky nav, footer, the
 * accessibility button, the cookie banner), for the runbook.
 *
 * Public pages only, no sign-in, one page at a time with at least 1.2 s between loads; any bot check
 * or error page stops the run (runbook §0). The cookie banner is never answered (AGENTS.md §4.6).
 *
 *   VG_LIVE=1 node --test --test-timeout=600000 tests/live/aixc-layer.live.test.ts
 *   VG_LIVE=1 VG_LIVE_BROWSER=chrome …   # in the installed Google Chrome, window visible, as demo:live opens it
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { after, before, test } from 'node:test'

import type { Page } from 'playwright'

import type { Manifest } from '#kb'
import { loadPlatformConfig, loadSiteConfig, ROOT } from '#shared/config.ts'

import { buildSdk } from '../../packages/sdk/build.ts'
import { createGateway } from '../../services/gateway/server.ts'
import { createServices } from '../../services/index.ts'
import { type DemoBrowser, launchDemoBrowser } from '../../tools/demo-browser.ts'

const LIVE = process.env.VG_LIVE === '1'
const PORT = 4482
const WEB = 'https://web.vodafone.com.eg'
const PAGES = ['/en/home', '/ar/home', '/en/services', '/ar/services', '/en/mobile-internet-bundles', '/ar/mobile-internet-bundles', '/en/vodafone-red1', '/ar/vodafone-red1', '/en/vodafone-cash', '/ar/vodafone-cash']
const PAUSE_MS = 1200
/** The demo's own browser (Google Chrome, visible) instead of Playwright's headless Chromium. */
const CHROME = process.env.VG_LIVE_BROWSER === 'chrome'

let services: Awaited<ReturnType<typeof createServices>>
let gateway: ReturnType<typeof createGateway>
let browser: DemoBrowser
let page: Page
const pageErrors: string[] = []
const layerLog: string[] = []
let lastLoad = 0

before(async () => {
	if (!LIVE) return
	await buildSdk({ minify: true })
	const platform = loadPlatformConfig({ ...process.env, VG_STORE: 'memory', VG_PORT: String(PORT), VG_PUBLIC_URL: `http://127.0.0.1:${PORT}` })
	const site = loadSiteConfig(path.join(ROOT, 'config/sites/vodafone-eg.yaml'))
	services = await createServices({ platform })
	const m = JSON.parse(fs.readFileSync(path.join(ROOT, 'config/kb/vodafone-eg.manifest.json'), 'utf8')) as Manifest
	await services.store.putKbVersion(site.id, m)
	await services.store.activateKb(site.id, m.version.id)
	gateway = createGateway({ services })
	await gateway.listen(PORT)
	browser = await launchDemoBrowser({ site, gatewayUrl: `http://127.0.0.1:${PORT}`, start: 'about:blank', headless: !CHROME, channel: CHROME ? 'chrome' : 'chromium', xray: 'off', viewport: { width: 1366, height: 900 } })
	page = browser.page
	page.on('pageerror', (e) => pageErrors.push(`${page.url()} ${e.message} ${e.stack ?? ''}`))
	page.on('console', (msg) => {
		if (msg.text().startsWith('[AIXC]')) layerLog.push(`${msg.type()}: ${page.url()} ${msg.text()}`)
	})
})

after(async () => {
	await browser?.close()
	await gateway?.close()
	await services?.close()
})

/** Opens a public Vodafone page, no faster than one every 1.2 s; stops the run on a bot check or an error page. */
async function open(url: string) {
	const wait = lastLoad + PAUSE_MS - Date.now()
	if (wait > 0) await page.waitForTimeout(wait)
	lastLoad = Date.now()
	const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 })
	const title = await page.title()
	if (!res || res.status() >= 400 || /access denied|attention required|captcha|just a moment|blocked/i.test(title)) {
		throw new Error(`Stopped: ${url} answered ${res?.status()} "${title}" (runbook §0: do not retry; use --replay)`)
	}
	await page.waitForFunction(() => !!document.querySelector('script[data-vg-loader]'), null, { timeout: 30_000 })
	await page.waitForLoadState('load', { timeout: 45_000 }).catch(() => {})
	await page.waitForTimeout(800)
}

const geometry = () =>
	page.evaluate(() => {
		const r = (n: Element | null) => {
			if (!n) return null
			const b = n.getBoundingClientRect()
			return [b.top + scrollY, b.left, b.width].map(Math.round)
		}
		const main = document.getElementById('main-content')
		return { header: r(document.getElementById('header')), main: r(main), sections: [...(main?.children ?? [])].slice(0, 3).map(r) }
	})

const survey = () =>
	page.evaluate(() => {
		const box = (n: Element | null) => {
			if (!n) return null
			const b = n.getBoundingClientRect()
			return { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height), position: getComputedStyle(n).position }
		}
		const w = window as unknown as { __aixc?: { state: string; problem: string | null; host: { lang: string; dir: string; chromeBottom(): number } | null } }
		return {
			state: w.__aixc?.state ?? null,
			problem: w.__aixc?.problem ?? null,
			lang: w.__aixc?.host?.lang ?? null,
			dir: w.__aixc?.host?.dir ?? null,
			chromeBottom: w.__aixc?.host?.chromeBottom() ?? null,
			htmlLang: document.documentElement.lang,
			header: box(document.getElementById('header')),
			navHeader: box(document.getElementById('nav-header')),
			mainContent: box(document.getElementById('main-content')),
			footer: box(document.querySelector('footer.footer')) ?? box(document.querySelector('footer')),
			accessibility: box(document.getElementById('vodafone-aw-icon')),
			cookieBanner: box(document.getElementById('onetrust-banner-sdk')),
			portlets: document.querySelectorAll('#main-content .portlet-boundary').length,
			overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
		}
	})

test('aixc.js is ready on ten live pages in both languages and shifts nothing', { skip: !LIVE && 'set VG_LIVE=1' }, async () => {
	const report: Record<string, unknown> = {}
	for (const pathname of PAGES) {
		await open(`${WEB}${pathname}?aixc=off`)
		const without = await geometry()
		await open(`${WEB}${pathname}?aixc-debug`)
		const s = await survey()
		const lang = pathname.startsWith('/ar/') ? 'ar' : 'en'
		report[pathname] = s
		assert.equal(s.state, 'ready', `${pathname}: the layer is ready (${s.problem ?? ''})`)
		assert.equal(s.lang, lang, `${pathname}: language`)
		assert.equal(s.dir, lang === 'ar' ? 'rtl' : 'ltr', `${pathname}: direction`)
		assert.deepEqual(await geometry(), without, `${pathname}: Vodafone's page in the same place with the layer`)
	}
	console.log(`# live survey ${new Date().toISOString()}\n# ${JSON.stringify(report)}`)
	assert.deepEqual(layerLog.filter((l) => !l.startsWith('info:')), [], 'the layer logged no warning or error')
	assert.deepEqual(pageErrors.filter((e) => /\/__vg\/sdk\/aixc\//.test(e)), [], 'no page error came from the layer')
	if (pageErrors.length) console.log(`# page errors from Vodafone's own scripts (not the layer): ${pageErrors.length}`)
})
