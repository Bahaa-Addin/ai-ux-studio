/**
 * Single-page-app routes (ADR-0030, SPEC-03 §2, SPEC-05 acceptance 4 and 6): the guide follows
 * pushState route changes and the Back button without being rebuilt, on a fixture app whose views
 * render after the URL changes, as Vodafone's /spa/ Angular app does.
 */
import assert from 'node:assert/strict'
import path from 'node:path'
import { after, before, test } from 'node:test'

import { type Browser, type BrowserContext, chromium, type Page } from 'playwright'

import { loadSiteConfig, ROOT } from '#shared/config.ts'

import { buildSdk } from '../../packages/sdk/build.ts'
import { startSiteServers } from '../../tools/site-server.ts'
import { startPlatform, type TestPlatform } from '../helpers/platform.ts'
import { SPEECH_STUB, type } from './browser.ts'

const WEB = 'http://localhost:4401'
let p: TestPlatform
let sites: { close: () => Promise<void> }
let browser: Browser
let ctx: BrowserContext
let page: Page

before(async () => {
	await buildSdk({ minify: true })
	p = await startPlatform({ port: 4400, env: { VG_PUBLIC_URL: 'http://localhost:4400' } })
	const site = loadSiteConfig(path.join(ROOT, 'config/sites/demo-telco.yaml'))
	sites = await startSiteServers(site, { gatewayUrl: 'http://localhost:4400' })
	browser = await chromium.launch()
	ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
	await ctx.addInitScript(SPEECH_STUB)
	page = await ctx.newPage()
	page.on('pageerror', (e) => console.log('[pageerror]', e.message))
})

after(async () => {
	await ctx?.close()
	await browser?.close()
	await sites?.close()
	await p?.close()
})

const ready = () => page.waitForFunction(() => !!(window as any).voiceGuide?.ui)
const sessionId = () => page.evaluate(() => (window as any).voiceGuide.session.sessionId as string)
const routeEvents = async () => (await p.store.listTrace(await sessionId())).filter((e) => e.name === 'sdk.route')

test('an in-app route change is a page change for the guide, without rebuilding it', async () => {
	await page.goto(`${WEB}/en/app.html`)
	await ready()
	// A turn first, so route events have a turn to belong to. It must not navigate away.
	await type(page, "what's on this page")
	await page.waitForFunction(() => ((window as any).__spoken || []).length > 0)
	await page.waitForTimeout(300)
	assert.match(page.url(), /\/en\/app\.html$/, 'the first turn stayed on the app')
	await page.evaluate(() => ((window as any).__host = document.querySelector('vg-guide')))
	const before = (await routeEvents()).length

	await page.click('#to-stores', { timeout: 5000 })
	await page.waitForFunction(() => location.search === '?view=stores', null, { timeout: 5000 })
	await page.waitForSelector('#keyword')
	const deadline = Date.now() + 5000
	let events = await routeEvents()
	while (events.length === before && Date.now() < deadline) {
		await page.waitForTimeout(200)
		events = await routeEvents()
	}
	const ev = events.at(-1)
	assert.ok(ev && events.length > before, 'sdk.route was reported')
	assert.equal(ev.attrs.from, '/en/app.html')
	assert.equal(ev.attrs.to, '/en/app.html')
	assert.ok(Number(ev.durationMs) >= 300, `it waited for the view to settle (${ev.durationMs} ms)`)
	assert.ok(await page.evaluate(() => (window as any).__host === document.querySelector('vg-guide')), 'the same guide element, not a new one')
	const log = await page.evaluate(() => document.querySelector('vg-guide')!.shadowRoot!.querySelector('.log')!.textContent || '')
	assert.match(log, /on this page/i, 'the conversation is still there')
})

test('history wrappers are transparent: same return value, installed once', async () => {
	const r = await page.evaluate(() => {
		const ret = history.pushState({ a: 1 }, '', '?view=plans')
		const wrappedTwice = (window as any).__vgRoutes === true
		return { ret: ret === undefined, state: (history.state as any)?.a, wrappedTwice }
	})
	assert.deepEqual(r, { ret: true, state: 1, wrappedTwice: true })
})

test('Back during a plan stops it and says so once', async () => {
	// A plan that waits for a page that never comes keeps the executor busy.
	await page.evaluate(() => {
		const g = (window as any).voiceGuide
		void g.executor.run({ v: 1, turnId: g.session.lastTurnId || 'turn_back', lang: 'en', steps: [{ op: 'waitForPage', pageId: 'web.never', timeoutMs: 15000 }], meta: { intent: 'navigate', route: 'replay', confidence: 1 } })
	})
	await page.waitForFunction(() => (window as any).voiceGuide.executor.running)
	const spokenBefore = await page.evaluate(() => (window as any).__spoken.length)
	await page.goBack()
	await page.waitForFunction(() => !(window as any).voiceGuide.executor.running, null, { timeout: 5000 })
	await page.waitForTimeout(300)
	const said = await page.evaluate((n) => (window as any).__spoken.slice(n).map((s: any) => s.text), spokenBefore)
	assert.equal(said.filter((s: string) => /Stopped\. Tell me what you need\./.test(s)).length, 1)
})
