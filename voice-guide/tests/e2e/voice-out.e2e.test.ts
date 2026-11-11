/**
 * The guide's voice from VoiceTut in a real browser (ADR-0047), on the saved Vodafone pages, with a
 * stand-in VoiceTut behind the gateway (VG_VOICETUT_URL): the reply is played as audio from the
 * page's own origin and the browser voice stays quiet; when VoiceTut is slow the browser voice says the
 * reply within firstAudioMs; pressing the microphone while the audio plays stops it at once and the
 * guide listens.
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
import { type MockVoiceTut, startMockVoiceTut } from '../helpers/mock-voicetut.ts'
import { VOICE_STUB, writeVoiceWav } from './browser.ts'

const PORT = 4476
const V = 'https://web.vodafone.com.eg'

/** Records what the page plays (the audio element is not in the DOM). */
const AUDIO_SPY = `(() => {
	const play = HTMLMediaElement.prototype.play
	HTMLMediaElement.prototype.play = function () { (window.__played ||= []).push(this.src); window.__audio = this; return play.call(this) }
})()`

let vt: MockVoiceTut
let services: Awaited<ReturnType<typeof createServices>>
let gateway: ReturnType<typeof createGateway>
let b: DemoBrowser
let page: Page
let dataDir = ''

before(async () => {
	vt = await startMockVoiceTut({ delayMs: 20 })
	dataDir = fs.mkdtempSync(path.join(ROOT, 'data', 'test-voice-out-'))
	const wav = path.join(dataDir, 'voice.wav')
	writeVoiceWav(wav)
	const platform = loadPlatformConfig({ ...process.env, VG_STORE: 'memory', VG_PORT: String(PORT), VG_PUBLIC_URL: `http://127.0.0.1:${PORT}`, VG_VOICETUT_URL: vt.url, VG_DATA_DIR: dataDir, VG_RATE_TURNS_PER_MIN: '600', VG_RATE_BURST: '60' })
	await buildSdk({ minify: true })
	services = await createServices({ platform })
	const site = loadSiteConfig(path.join(platform.sitesDir, 'vodafone-eg.yaml'))
	const m = JSON.parse(fs.readFileSync(path.join(ROOT, 'config/kb/vodafone-eg.manifest.json'), 'utf8')) as Manifest
	await services.store.putKbVersion(site.id, m)
	await services.store.activateKb(site.id, m.version.id)
	gateway = createGateway({ services })
	await gateway.listen(PORT)
	b = await launchDemoBrowser({ site, gatewayUrl: `http://127.0.0.1:${PORT}`, start: 'about:blank', headless: true, channel: 'chromium', xray: 'off', replayDir: path.join(ROOT, 'fixtures/replay/vodafone-eg'), fakeMic: wav, initScripts: [VOICE_STUB, AUDIO_SPY], viewport: { width: 1366, height: 860 }, experiences: false })
	page = b.page
	page.on('pageerror', (e) => console.log('[pageerror]', e.message))
})

after(async () => {
	await b?.close()
	await gateway?.close()
	await services?.close()
	await vt?.close()
	if (dataDir) fs.rmSync(dataDir, { recursive: true, force: true })
})

const open = async (pathname: string) => {
	await page.goto(`${V}${pathname}`, { waitUntil: 'load' })
	await page.waitForFunction(() => (window as any).voiceGuide?.speech?.__vgVoiceOut === true, null, { timeout: 20_000 })
}
/** A typed question, through the guide's own request (the reply is spoken as for a spoken one). */
const ask = (text: string) => page.evaluate((t) => void (window as any).voiceGuide.request(t, 'typed'), text)
const state = () => page.evaluate(() => ({ played: ((window as any).__played as string[]) || [], spoken: ((window as any).__spoken as { text: string }[]).map((s) => s.text) }))

test('the reply is played as VoiceTut audio from the page\'s own origin; the browser voice stays quiet', async () => {
	await open('/en/mobile-internet-bundles')
	const before = vt.calls.length
	await ask('what is on this page')
	await page.waitForFunction(() => ((window as any).__played || []).length > 0, null, { timeout: 10_000 })
	const s = await state()
	assert.match(s.played[0], new RegExp(`^${V}/__vg/v1/speech/[a-f0-9]{64}\\.wav\\?k=`), 'from the page\'s own origin')
	assert.ok(vt.calls.slice(before).some((c) => c.endpoint === 'synthesize'), 'VoiceTut made it')
	await page.waitForTimeout(500)
	assert.deepEqual((await state()).spoken, [], 'the browser voice said nothing')
})

test('VoiceTut slow: the browser voice says the reply within firstAudioMs', async () => {
	await open('/en/home')
	vt.delayMs = 6000
	try {
		const t0 = Date.now()
		await ask('what is on this page')
		await page.waitForFunction(() => ((window as any).__spoken || []).length > 0, null, { timeout: 8000 })
		const ms = Date.now() - t0
		assert.ok(ms < 5000, `the browser voice spoke ${ms} ms after the question`)
		assert.match((await state()).spoken[0], /home|This is/i)
	} finally {
		vt.delayMs = 20
		await services.speechOut.drain({}, { trace: { traceId: 'a'.repeat(32), spanId: 'b'.repeat(16) } as never })
	}
})

test('barge-in: the microphone pressed while the audio plays stops it at once, and the guide listens', async () => {
	vt.audioSeconds = 4
	try {
		await open('/en/services')
		await ask('what is on this page')
		await page.waitForFunction(() => { const a = (window as any).__audio as HTMLAudioElement | undefined; return !!a && !a.paused && a.currentTime > 0 }, null, { timeout: 10_000 })
		const r = await page.evaluate(async () => {
			const a = (window as any).__audio as HTMLAudioElement
			const t0 = performance.now()
			;(document.querySelector('vg-guide')!.shadowRoot!.querySelector('.vg-mic') as HTMLElement).click()
			let stoppedAt = -1
			for (let i = 0; i < 50; i++) {
				if (a.paused && stoppedAt < 0) stoppedAt = performance.now() - t0
				if (stoppedAt >= 0 && (window as any).__activeRec) break
				await new Promise((res) => setTimeout(res, 10))
			}
			return { stoppedAt, paused: a.paused, src: a.getAttribute('src'), listening: !!(window as any).__activeRec }
		})
		assert.ok(r.paused && r.stoppedAt >= 0 && r.stoppedAt < 100, `audio stopped after ${r.stoppedAt} ms`)
		assert.equal(r.src, null, 'and let go of its source')
		assert.ok(r.listening, 'and the guide listens')
		await page.waitForTimeout(400)
		assert.deepEqual((await state()).spoken, [], 'no browser-voice fallback after the press')
	} finally {
		vt.audioSeconds = 0.2
		await page.evaluate(() => (window as any).voiceGuide.stopAll())
	}
})
