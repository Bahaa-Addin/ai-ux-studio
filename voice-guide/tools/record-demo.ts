/**
 * npm run record:demo -- [--out recordings]
 * Records the demo flow at human pace in Chromium against the real platform
 * (gateway, services, Postgres, SDK) on the fixture site. Speech is simulated
 * at the browser API (no microphone or speakers in a headless browser), so
 * captions carry what the guide says. The agent scene uses the stand-in model
 * unless VG_LLM_BASE_URL is set.
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'

import { chromium, type Page } from 'playwright'

import { loadSiteConfig, ROOT } from '#shared/config.ts'

import { buildSdk } from '../packages/sdk/build.ts'
import { heard, SPEECH_STUB, speak, type } from '../tests/e2e/browser.ts'
import { startMockLlm } from '../tests/helpers/mock-llm.ts'
import { startPlatform } from '../tests/helpers/platform.ts'
import { startSiteServers } from './site-server.ts'

const { values } = parseArgs({ options: { out: { type: 'string', default: 'recordings' } } })
const outDir = path.resolve(ROOT, values.out!)
fs.mkdirSync(outDir, { recursive: true })
const WEB = 'http://localhost:4401'
const APP = 'http://localhost:4402'

await buildSdk({ minify: true })
const llm = process.env.VG_LLM_BASE_URL ? null : await startMockLlm()
const p = await startPlatform({ port: 4400, env: { VG_LLM_BASE_URL: process.env.VG_LLM_BASE_URL || llm!.url, VG_LLM_MODEL: process.env.VG_LLM_MODEL || 'stand-in-model' } })
const site = loadSiteConfig(path.join(ROOT, 'config/sites/demo-telco.yaml'))
const sites = await startSiteServers(site, { gatewayUrl: 'http://localhost:4400' })
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, recordVideo: { dir: outDir, size: { width: 1280, height: 800 } } })
await ctx.addInitScript(SPEECH_STUB)
await ctx.addCookies([{ url: APP, name: 'demo_session', value: 'demo' }])
await ctx.grantPermissions(['notifications'], { origin: WEB })
const page = await ctx.newPage()

/** A label for the viewer of the recording; not part of the product. */
const scene = async (pg: Page, text: string) => {
	await pg.evaluate((t) => {
		let el = document.getElementById('__scene')
		if (!el) {
			el = document.createElement('div')
			el.id = '__scene'
			el.style.cssText = 'position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:2147483647;background:#111;color:#fff;font:600 15px/1.3 system-ui,sans-serif;padding:8px 16px;border-radius:999px;opacity:.88;pointer-events:none;direction:ltr'
			document.body.appendChild(el)
		}
		el.textContent = t
	}, text)
}
const ready = () => page.waitForFunction(() => !!(window as any).voiceGuide?.ui)
const pause = (ms = 2600) => page.waitForTimeout(ms)

let current = ''
page.on('load', () => void scene(page, current).catch(() => {}))
const setScene = async (t: string) => {
	current = t
	await scene(page, t)
}

try {
	await page.goto(`${WEB}/ar/index.html`)
	await ready()
	await setScene('1 · Ask out loud in Arabic: "What\'s the cheapest internet bundle?"')
	await pause(1800)
	await speak(page, 'إيه أرخص باقة نت؟')
	await page.waitForURL(`${WEB}/ar/bundles.html`)
	await ready()
	await heard(page, /أرخص واحدة/)
	await pause(3500)

	await setScene('2 · Follow-up "How do I subscribe to it?": it remembers the bundle; it never presses pay')
	await pause(1500)
	await type(page, 'أشترك فيها إزاي؟')
	await page.waitForURL(/subscribe\.html/)
	await ready()
	await heard(page, /بنفسك/)
	await pause(4000)

	await setScene('3 · Switch to English: the hidden "Home internet" tab is opened for you')
	await pause(1500)
	await type(page, 'cheapest home internet plan')
	await page.waitForURL(`${WEB}/en/bundles.html`)
	await ready()
	await heard(page, /cheapest is/)
	await pause(3500)

	await page.goto(`${WEB}/en/index.html`)
	await ready()
	await setScene('4 · Read the pictures: an image-only banner, described at crawl time')
	await pause(1500)
	await type(page, 'What does this banner say?')
	await heard(page, /Double data weekend/)
	await pause(4000)

	await setScene('5 · Into the web app on another origin: same conversation, live balance')
	await pause(1500)
	await type(page, 'How much data do I have left?')
	await page.waitForURL(`${APP}/en/account.html`)
	await ready()
	await heard(page, /You have/)
	await pause(4000)

	await page.goto(`${WEB}/en/offers.html`)
	await ready()
	await setScene('6 · "Tell me when this changes": a real watch, then the offer changes on the clone')
	await pause(1500)
	await type(page, 'tell me when the weekend offer changes')
	const chip = page.locator('vg-guide').locator('.chip')
	await chip.waitFor()
	await pause(1500)
	await chip.click()
	await heard(page, /I will tell you/, 15_000)
	await pause(1500)
	const file = path.join(ROOT, 'fixtures/sites/demo-telco/web/en/offers.html')
	const original = fs.readFileSync(file, 'utf8')
	try {
		fs.writeFileSync(file, original.replace('Double data on all mobile internet bundles', 'Triple data on all mobile internet bundles'))
		const [w] = await p.store.listWatches({ sessionId: await page.evaluate(() => (window as any).voiceGuide.session.sessionId) })
		await p.store.updateWatch(w.id, { nextCheckAt: new Date(Date.now() - 1000).toISOString() })
		await fetch('http://localhost:4400/admin/watch/tick', { method: 'POST' })
		await page.waitForFunction(() => document.querySelector('vg-guide')!.shadowRoot!.querySelector('.toast.on'), null, { timeout: 10_000 })
		await pause(4000)
	} finally {
		fs.writeFileSync(file, original)
	}

	await page.goto(`${WEB}/en/subscribe.html?bundle=mi-25`)
	await ready()
	await setScene(`7 · Not in the knowledge base: the page-agent fallback acts on the page${llm ? ' (stand-in model)' : ''}`)
	await pause(1500)
	await type(page, 'select bank card as the payment method')
	await heard(page, /Done|selected/i, 30_000)
	await pause(3500)

	await setScene('8 · X-ray: every layer of every request, from real traces')
	await page.locator('vg-guide').locator('.xraybtn').click()
	await pause(6500)
} finally {
	const video = page.video()
	await ctx.close()
	await browser.close()
	await sites.close()
	await p.close()
	await llm?.close()
	if (video) {
		const webm = await video.path()
		const mp4 = path.join(outDir, 'voice-guide-demo.mp4')
		try {
			execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', webm, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '26', '-preset', 'veryfast', '-movflags', '+faststart', mp4])
			fs.rmSync(webm)
			console.log(`Recorded ${mp4}`)
		} catch {
			console.log(`Recorded ${webm} (ffmpeg not available for mp4)`)
		}
	}
}
