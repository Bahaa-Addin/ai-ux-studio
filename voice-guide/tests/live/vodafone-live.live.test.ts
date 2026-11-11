/**
 * Live smoke test on the real web.vodafone.com.eg (T-503): the guide added to Vodafone's own public
 * pages, with Vodafone's scripts, cookie banner and accessibility widget, through the demo browser
 * exactly as `npm run demo:live` runs it. Speech goes through the test stand-in (no microphone).
 * A handful of public pages, no sign-in, no crawl; any bot check or access-denied page stops the
 * run (runbook §0). The cookie banner is left alone (AGENTS.md §4.6).
 *
 *   VG_LIVE=1 [VG_LIVE_VIDEO=<dir>] node --test --test-timeout=150000 tests/live/vodafone-live.live.test.ts
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'

import type { Page } from 'playwright'

import type { Manifest } from '#kb'
import { loadPlatformConfig, loadSiteConfig, ROOT } from '#shared/config.ts'

import { buildSdk } from '../../packages/sdk/build.ts'
import { createGateway } from '../../services/gateway/server.ts'
import { createServices } from '../../services/index.ts'
import { type DemoBrowser, launchDemoBrowser } from '../../tools/demo-browser.ts'
import { VOICE_STUB, writeVoiceWav } from '../e2e/browser.ts'

const LIVE = process.env.VG_LIVE === '1'
const PORT = 4481
const WEB = 'https://web.vodafone.com.eg'
let services: Awaited<ReturnType<typeof createServices>>
let gateway: ReturnType<typeof createGateway>
let browser: DemoBrowser
let page: Page
let tmp: string

before(async () => {
	if (!LIVE) return
	tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vg-live-'))
	const wav = path.join(tmp, 'voice.wav')
	writeVoiceWav(wav)
	await buildSdk({ minify: true })
	const platform = loadPlatformConfig({ ...process.env, VG_VOICETUT_URL: '', VG_STORE: 'memory', VG_PORT: String(PORT), VG_PUBLIC_URL: `http://127.0.0.1:${PORT}` })
	const site = loadSiteConfig(path.join(ROOT, 'config/sites/vodafone-eg.yaml'))
	services = await createServices({ platform })
	const m = JSON.parse(fs.readFileSync(path.join(ROOT, 'config/kb/vodafone-eg.manifest.json'), 'utf8')) as Manifest
	await services.store.putKbVersion(site.id, m)
	await services.store.activateKb(site.id, m.version.id)
	gateway = createGateway({ services })
	await gateway.listen(PORT)
	browser = await launchDemoBrowser({
		site,
		gatewayUrl: `http://127.0.0.1:${PORT}`,
		start: 'about:blank',
		headless: true,
		channel: 'chromium',
		fakeMic: wav,
		initScripts: [VOICE_STUB],
		viewport: { width: 1366, height: 900 },
		recordVideoDir: process.env.VG_LIVE_VIDEO,
	})
	page = browser.page
	page.on('pageerror', (e) => console.log('# [pageerror]', e.message))
})

after(async () => {
	await browser?.close()
	await gateway?.close()
	await services?.close()
	if (tmp) fs.rmSync(tmp, { recursive: true, force: true })
})

/** Opens a public Vodafone page; stops the whole run on a bot check or an error page. */
async function open(url: string) {
	const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 })
	const title = await page.title()
	if (!res || res.status() >= 400 || /access denied|attention required|captcha|just a moment|blocked/i.test(title)) {
		throw new Error(`Stopped: ${url} answered ${res?.status()} "${title}" (runbook §0: do not retry; use --replay)`)
	}
	await page.waitForFunction(() => !!(window as any).voiceGuide?.ui?.voice, null, { timeout: 30_000 })
}

// What covers the microphone's centre, when it is not the guide itself. On a first visit this is
// Vodafone's cookie-consent overlay (OneTrust). The tests never answer or hide it (runbook §4.6),
// so a question can only be asked once a person has answered it in that browser.
const micCover = () =>
	page.evaluate(() => {
		const mic = document.querySelector('vg-guide')?.shadowRoot?.querySelector('.vg-mic')
		const r = mic?.getBoundingClientRect()
		if (!r || !r.width) return 'no microphone'
		const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
		if (!top || top.tagName === 'VG-GUIDE') return null
		return `${top.tagName.toLowerCase()}${top.id ? '#' + top.id : ''}.${String(top.className).split(' ')[0]}`
	})

async function say(words: string[]) {
	await page.locator('vg-guide .vg-mic').click()
	await page.waitForFunction(() => !!(window as any).__activeRec, null, { timeout: 10_000 })
	await page.evaluate((w) => (window as any).__vgSayWords(w), words)
}

const spoken = () => page.evaluate(() => ((window as any).__spoken || []).map((s: any) => s.text) as string[])
const spotOn = () => page.waitForFunction(() => document.querySelector('vg-guide')?.shadowRoot?.querySelector('.spot.on'), null, { timeout: 30_000 })
const box = (sel: string, inGuide = false) =>
	page.evaluate(
		([s, g]) => {
			const el = g ? document.querySelector('vg-guide')?.shadowRoot?.querySelector(s as string) : document.querySelector(s as string)
			const r = el?.getBoundingClientRect()
			return r && r.width ? { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } : null
		},
		[sel, inGuide] as const,
	)

for (const lang of ['ar', 'en'] as const) {
	const words = lang === 'ar' ? ['إيه', 'أرخص', 'باقة', 'نت'] : ["what's", 'the', 'cheapest', 'internet', 'bundle']

	test(`live ${lang}: the guide loads on Vodafone's home page, and the microphone sits clear of Vodafone's accessibility button`, { skip: !LIVE && 'set VG_LIVE=1' }, async () => {
		await open(`${WEB}/${lang}/home`)
		await page.waitForTimeout(4000) // Vodafone's widgets load after the page
		const mic = await box('.vg-mic', true)
		const aw = await box('#vodafone-aw-icon')
		console.log(`# ${lang} home: mic ${JSON.stringify(mic)}, accessibility ${JSON.stringify(aw)}, title "${await page.title()}"`)
		assert.ok(mic, 'the microphone is on the page')
		if (aw) assert.ok(!(mic!.x < aw.x + aw.w && aw.x < mic!.x + mic!.w && mic!.y < aw.y + aw.h && aw.y < mic!.y + mic!.h), 'the microphone does not overlap the accessibility button')
		else console.log('# Vodafone\'s accessibility button was not on the page (not loaded or renamed)')
	})

	test(`live ${lang}: "${words.join(' ')}" goes to the bundles page, spotlights the answer and reads it`, { skip: !LIVE && 'set VG_LIVE=1' }, async (t) => {
		const cover = await micCover()
		if (cover) {
			console.log(`# ${lang}: the microphone is covered by ${cover}`)
			if (/onetrust|ot-/i.test(cover)) return t.skip(`Vodafone's cookie consent covers the page until a person answers it (${cover}); the test does not answer it`)
			assert.fail(`the microphone is covered by ${cover}`)
		}
		const t0 = Date.now()
		await say(words)
		await page.waitForURL(/mobile-internet-bundles/, { timeout: 30_000 })
		await page.waitForFunction(() => !!(window as any).voiceGuide?.ui?.voice, null, { timeout: 30_000 })
		await spotOn()
		await page.waitForTimeout(2500)
		const said = await spoken()
		console.log(`# ${lang}: ${page.url()} in ${Date.now() - t0} ms; said: ${said.join(' | ')}`)
		assert.ok(said.length > 0, 'the guide answered aloud')
	})
}
