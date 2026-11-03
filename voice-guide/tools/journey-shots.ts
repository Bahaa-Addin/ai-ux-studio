/**
 * node tools/journey-shots.ts <out-dir> [--phone] [--reduced]
 *
 * Screenshots of the journey in the Pocket (ADR-0040): the saved Vodafone pages with the trail on,
 * a short scripted visit, then the Services clone at /en/services and "Your journey" opened there.
 * Headless Chromium, memory store, offline replay. For reviews and docs, not a test.
 */
import fs from 'node:fs'
import path from 'node:path'

import type { Manifest } from '#kb'
import { ensureExperienceProfile } from '#jobs/experience/build.ts'

import { buildSdk } from '../packages/sdk/build.ts'
import { createGateway } from '../services/gateway/server.ts'
import { createServices } from '../services/index.ts'
import { loadPlatformConfig, loadSiteConfig, ROOT } from '../services/shared/config.ts'
import { launchDemoBrowser } from './demo-browser.ts'

const out = path.resolve(process.argv[2] || 'data/journey-shots')
const phone = process.argv.includes('--phone')
const reduced = process.argv.includes('--reduced')
fs.mkdirSync(out, { recursive: true })
const tag = phone ? 'phone' : 'desktop'
const V = 'https://web.vodafone.com.eg'

const platform = loadPlatformConfig({ ...process.env, VG_STORE: 'memory', VG_PORT: '4410', VG_PUBLIC_URL: 'http://127.0.0.1:4410' })
const site = loadSiteConfig(path.join(platform.sitesDir, 'vodafone-eg.yaml'))
await buildSdk({ minify: true })
const services = await createServices({ platform })
const m = JSON.parse(fs.readFileSync(path.join(ROOT, 'config/kb/vodafone-eg.manifest.json'), 'utf8')) as Manifest
await services.store.putKbVersion(site.id, m)
await services.store.activateKb(site.id, m.version.id)
const live = services.sites.get(site.id)!
live.trail.enabled = true
const committed = JSON.parse(fs.readFileSync(path.join(ROOT, 'config/experience/vodafone-eg.profile.json'), 'utf8'))
await ensureExperienceProfile(services.store, live, m, committed, () => {})
const gateway = createGateway({ services })
await gateway.listen(4410)

const consent = `try { if (location.origin === '${V}' && !localStorage.getItem('vg-trail:${site.siteKey}:consent')) localStorage.setItem('vg-trail:${site.siteKey}:consent', JSON.stringify({ v: 1, state: 'granted', at: 1, retentionHours: 24 })) } catch {}`
const browser = await launchDemoBrowser({
	site,
	gatewayUrl: 'http://127.0.0.1:4410',
	start: 'about:blank',
	headless: true,
	channel: 'chromium',
	xray: 'off',
	replayDir: path.join(ROOT, 'fixtures/replay/vodafone-eg'),
	clone: { path: '/en/services', dir: path.join(ROOT, '../vodafone-services-clone') },
	initScripts: [consent],
	viewport: phone ? { width: 390, height: 844 } : { width: 1366, height: 860 },
	log: (x) => console.log(x),
})
const { page } = browser
if (reduced) await page.emulateMedia({ reducedMotion: 'reduce' })
page.on('console', (msg) => msg.type() === 'error' && console.log('console:', msg.text()))
page.on('pageerror', (e) => console.log('pageerror:', e.message))

const recording = () => page.waitForFunction(() => document.querySelector('vg-guide')?.shadowRoot?.querySelector('.tr')?.getAttribute('data-rec') === 'recording', null, { timeout: 30_000 })
const wander = async (ms: number) => {
	const end = Date.now() + ms
	const box = page.viewportSize()!
	while (Date.now() < end) {
		await page.mouse.move(80 + Math.random() * (box.width - 160), 160 + Math.random() * (box.height - 260), { steps: 8 })
		await page.mouse.wheel(0, 220)
		await page.waitForTimeout(350)
	}
}
/** Rests the pointer on a destination's own element, so the trail counts it as explored. */
const dwell = async (selector: string, ms = 4500) => {
	const el = page.locator(selector).first()
	if (!(await el.count())) return console.log(`no ${selector}`)
	await el.scrollIntoViewIfNeeded()
	const b = await el.boundingBox()
	if (!b) return
	const end = Date.now() + ms
	while (Date.now() < end) {
		await page.mouse.move(b.x + b.width * (0.3 + Math.random() * 0.4), b.y + Math.min(b.height, 300) * (0.3 + Math.random() * 0.4), { steps: 6 })
		await page.waitForTimeout(300)
	}
}

for (const url of [`${V}/en/home`, `${V}/en/vodafone-cash`, `${V}/en/mobile-internet-bundles`]) {
	await page.goto(url, { waitUntil: 'domcontentloaded' })
	await recording()
	await wander(3000)
}
await page.goto(`${V}/en/services`, { waitUntil: 'domcontentloaded' })
await recording()
await dwell('[data-vg-destination="web.services.vodafone-cash"]')
await dwell('[data-vg-destination="web.services.call-connect-abroad"]')
await page.mouse.wheel(0, -4000)
await page.waitForTimeout(800)
await page.screenshot({ path: path.join(out, `${tag}-0-services-clone.png`) })

// The guide's pill on this page opens the journey in the Pocket.
await page.locator('vg-guide').locator('.tr-pill').click()
await page.waitForSelector('.pocket-journey-layer:not([hidden])', { timeout: 15_000 })
await page.waitForTimeout(140)
await page.screenshot({ path: path.join(out, `${tag}-1-entering.png`) })
await page.waitForFunction(() => !!document.querySelector('.pocket-journey-memory__frame iframe'), null, { timeout: 30_000 }).catch(() => console.log('no preview iframe'))
await page.waitForTimeout(1600)
await page.screenshot({ path: path.join(out, `${tag}-2-journey.png`) })
await page.screenshot({ path: path.join(out, `${tag}-2-journey-full.png`), fullPage: true })

// The last stop is this page's own memory: what was explored on the Services clone, with questions.
await page.locator('.pocket-journey-rail').focus()
await page.keyboard.press('End')
await page.waitForTimeout(2200)
await page.screenshot({ path: path.join(out, `${tag}-2b-explored.png`) })
await page.screenshot({ path: path.join(out, `${tag}-2b-explored-full.png`), fullPage: true })

// Scrub along the slider to the first page.
const rail = await page.locator('.pocket-journey-rail').boundingBox()
if (rail) {
	await page.mouse.move(rail.x + rail.width * 0.05, rail.y + rail.height / 2)
	await page.mouse.down()
	await page.mouse.move(rail.x + rail.width * 0.18, rail.y + rail.height / 2, { steps: 10 })
	await page.waitForTimeout(1800)
	await page.screenshot({ path: path.join(out, `${tag}-3-scrubbing.png`) })
	await page.mouse.up()
}
await page.waitForTimeout(1200)
const state = await page.evaluate(() => {
	const api = (window as any).voiceGuide?.trailHost
	const s = api?.snapshot()
	return { steps: s?.steps.map((x: any) => `${x.type}:${x.title?.en}:${x.replay}`), selected: s?.selectedStepId, preview: s?.preview, explored: s?.explored.map((x: any) => x.destinationId), chips: document.querySelectorAll('.pocket-journey-chip').length }
})
console.log(JSON.stringify(state, null, 2))
await page.screenshot({ path: path.join(out, `${tag}-4-after-scrub.png`) })

// The entrance is staggered: each floating piece starts a little after the one before.
console.log('delays', await page.evaluate(() => [...document.querySelectorAll('.pocket-journey-float')].map((el) => getComputedStyle(el).animationDelay).join(' ')))

// A question chip turns the page back to Services and the guide answers there.
await page.locator('.pocket-journey-rail').focus()
await page.keyboard.press('End')
await page.waitForSelector('.pocket-journey-chip', { timeout: 10_000 }).catch(() => console.log('no chip on the last page'))
const chip = page.locator('.pocket-journey-chip').first()
if (await chip.count()) {
	console.log('asking:', await chip.textContent())
	await chip.click()
	await page.waitForFunction(() => !document.body.dataset.pocketView, null, { timeout: 10_000 })
	await page.waitForTimeout(3500)
	const spot = await page.evaluate(() => {
		const s = document.querySelector('vg-guide')!.shadowRoot!.querySelector('.spot') as HTMLElement
		const r = s.getBoundingClientRect()
		const hit = [...document.querySelectorAll('[data-vg-destination]')].find((el) => {
			const b = el.getBoundingClientRect()
			return Math.abs(b.top - r.top) < 40 && Math.abs(b.left - r.left) < 40
		})
		return { on: s.classList.contains('on'), target: hit?.getAttribute('data-vg-destination') ?? null }
	})
	console.log('spotlight', JSON.stringify(spot))
	await page.screenshot({ path: path.join(out, `${tag}-5-answered.png`) })
}

await browser.close()
await gateway.close()
await services.close()
process.exit(0)
