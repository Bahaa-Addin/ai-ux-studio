/**
 * Shared set-up for the end-to-end tests on the saved Vodafone pages with the Services clone at
 * /en/services and /ar/services, as `npm run demo:trail` runs it (ADR-0040, ADR-0043): the SDK,
 * the gateway, every service, the committed knowledge base and experience profile, the demo
 * browser with the accessibility stand-in. Each test file calls `vodafonePocket(port)` once.
 */
import fs from 'node:fs'
import path from 'node:path'
import { after, before } from 'node:test'

import type { Page } from 'playwright'

import type { Manifest } from '#kb'
import { ensureExperienceProfile } from '#jobs/experience/build.ts'
import { loadPlatformConfig, loadSiteConfig, ROOT } from '#shared/config.ts'

import { buildSdk } from '../../packages/sdk/build.ts'
import { createGateway } from '../../services/gateway/server.ts'
import { createServices } from '../../services/index.ts'
import { type DemoBrowser, launchDemoBrowser } from '../../tools/demo-browser.ts'
import { SPEECH_STUB } from './browser.ts'

export const V = 'https://web.vodafone.com.eg'
const CLONE = path.join(ROOT, '../vodafone-services-clone')

export interface Run {
	b: DemoBrowser
	page: Page
	requests: { url: string; body: string }[]
}

export interface LaunchOptions {
	consented?: boolean
	phone?: boolean
	reducedMotion?: boolean
	noGuide?: boolean
}

/** Starts the gateway for this test file (before) and stops it (after); returns the browser launcher. */
export function vodafonePocket(PORT: number): { launch: (o?: LaunchOptions) => Promise<Run> } {
	const platform = loadPlatformConfig({ ...process.env, VG_STORE: 'memory', VG_PORT: String(PORT), VG_PUBLIC_URL: `http://127.0.0.1:${PORT}`, VG_RATE_TURNS_PER_MIN: '600', VG_RATE_BURST: '60' })
	const site = loadSiteConfig(path.join(platform.sitesDir, 'vodafone-eg.yaml'))
	const CONSENTED = `try { if (location.origin === '${V}' && !localStorage.getItem('vg-trail:${site.siteKey}:consent')) localStorage.setItem('vg-trail:${site.siteKey}:consent', JSON.stringify({ v: 1, state: 'granted', at: 1, retentionHours: 24 })) } catch {}`

	let services: Awaited<ReturnType<typeof createServices>>
	let gateway: ReturnType<typeof createGateway>

	before(async () => {
		await buildSdk({ minify: true })
		services = await createServices({ platform })
		const m = JSON.parse(fs.readFileSync(path.join(ROOT, 'config/kb/vodafone-eg.manifest.json'), 'utf8')) as Manifest
		await services.store.putKbVersion(site.id, m)
		await services.store.activateKb(site.id, m.version.id)
		const live = services.sites.get(site.id)!
		live.trail.enabled = true
		const committed = JSON.parse(fs.readFileSync(path.join(ROOT, 'config/experience/vodafone-eg.profile.json'), 'utf8'))
		await ensureExperienceProfile(services.store, live, m, committed, () => {})
		gateway = createGateway({ services })
		await gateway.listen(PORT)
	})

	after(async () => {
		await gateway?.close()
		await services?.close()
	})


	async function launch(o: LaunchOptions = {}): Promise<Run> {
		const b = await launchDemoBrowser({
			site,
			gatewayUrl: `http://127.0.0.1:${PORT}`,
			start: 'about:blank',
			headless: true,
			channel: 'chromium',
			xray: 'off',
			replayDir: path.join(ROOT, 'fixtures/replay/vodafone-eg'),
			clone: { path: '/en/services', dir: CLONE, pages: { '/ar/services': 'ar/index.html' } },
			initScripts: [SPEECH_STUB, ...(o.consented ? [CONSENTED] : [])],
			viewport: o.phone ? { width: 390, height: 844 } : { width: 1366, height: 860 },
		})
		const { page } = b
		if (o.reducedMotion) await page.emulateMedia({ reducedMotion: 'reduce' })
		if (o.noGuide) await b.context.route('**/__vg/**', (route) => route.abort())
		const requests: Run['requests'] = []
		b.context.on('request', (r) => requests.push({ url: r.url(), body: r.postData() || '' }))
		page.on('pageerror', (e) => console.log('[pageerror]', e.message))
		return { b, page, requests }
	}

	return { launch }
}

export const tr = (page: Page, sel: string) => page.locator('vg-guide').locator(sel)
export const until = (page: Page, fn: string, timeout = 15_000) => page.waitForFunction(fn, null, { timeout })
export const rec = (page: Page) => page.evaluate(() => (document.querySelector('vg-guide')?.shadowRoot?.querySelector('.tr') as HTMLElement | null)?.dataset.rec)
export const recording = (page: Page) => until(page, `document.querySelector('vg-guide')?.shadowRoot?.querySelector('.tr')?.dataset.rec === 'recording'`, 30_000)
export const layerOpen = (page: Page) => page.waitForSelector('.pocket-journey-layer:not([hidden])', { timeout: 15_000 })
export const snapshot = (page: Page) => page.evaluate(() => (window as any).voiceGuide.trailHost.snapshot())
