/**
 * The demo on Vodafone's real pages, end to end (SPEC-02, SPEC-03, SPEC-05; ADR-0026, ADR-0027,
 * ADR-0031). Pages are the rendered HTML captured from web.vodafone.com.eg on 2026-10-23
 * (public, signed out), replayed under their real URLs by the demo browser, so nothing here
 * needs the internet. Everything between the microphone and the speaker is real: the demo
 * browser's loader and /__vg bridge, the SDK, the gateway with every service, the knowledge base
 * built from the live crawl (config/kb/vodafone-eg.manifest.json), and long-polled events.
 *
 * Stand-ins at the edges only (ADR-0024): Chromium's fake microphone plays a synthesized
 * voice-like signal (real getUserMedia, real AnalyserNode), recognition is a stand-in that emits
 * interim results word by word, and speech synthesis records what the guide says.
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
import { heard, type } from './browser.ts'

const PORT = 4471
const WEB = 'https://web.vodafone.com.eg'

/** Recognition that emits growing interim results, one word at a time, then the final text. */
const VOICE_STUB = `(() => {
	window.__spoken = [];
	window.__vgStreams = [];
	const gum = navigator.mediaDevices && navigator.mediaDevices.getUserMedia && navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
	if (gum) navigator.mediaDevices.getUserMedia = async (c) => { const s = await gum(c); window.__vgStreams.push(s); return s; };
	class FakeRecognition {
		constructor() { this.lang = ''; this.interimResults = false; this.continuous = false; this.maxAlternatives = 1; }
		start(track) {
			if (track !== undefined && !(track instanceof MediaStreamTrack)) throw new TypeError('not a track');
			window.__activeRec = this; window.__recTrack = track ? track.kind : null; window.__recLang = this.lang;
			setTimeout(() => this.onsoundstart && this.onsoundstart(), 30);
		}
		stop() { if (window.__activeRec === this) { window.__activeRec = null; setTimeout(() => this.onend && this.onend(), 0); } }
		abort() { this.stop(); }
	}
	window.SpeechRecognition = FakeRecognition;
	window.webkitSpeechRecognition = FakeRecognition;
	window.__vgSayWords = async (words, stepMs = 140, confidence = 0.92) => {
		const rec = window.__activeRec;
		if (!rec) return false;
		rec.onspeechstart && rec.onspeechstart();
		for (let i = 1; i <= words.length; i++) {
			const r = [{ transcript: words.slice(0, i).join(' '), confidence }]; r.isFinal = false;
			rec.onresult && rec.onresult({ resultIndex: 0, results: [r] });
			await new Promise((ok) => setTimeout(ok, stepMs));
		}
		const fin = [{ transcript: words.join(' '), confidence }]; fin.isFinal = true;
		rec.onresult && rec.onresult({ resultIndex: 0, results: [fin] });
		await new Promise((ok) => setTimeout(ok, 30));
		window.__activeRec = null;
		rec.onend && rec.onend();
		return true;
	};
	const synth = {
		speak(u) { window.__spoken.push({ text: u.text, lang: u.lang }); setTimeout(() => u.onend && u.onend(), 30); },
		cancel() {}, pause() {}, resume() {}, getVoices() { return []; }, addEventListener() {}, speaking: false, pending: false,
	};
	Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
	window.SpeechSynthesisUtterance = window.SpeechSynthesisUtterance || function (t) { this.text = t; };
})();`

/** A voice-like signal: three partials under a 4 Hz syllable envelope with pauses, 4 s, looped by Chromium. */
function writeVoiceWav(file: string): void {
	const rate = 16000
	const n = rate * 4
	const data = Buffer.alloc(n * 2)
	for (let i = 0; i < n; i++) {
		const t = i / rate
		const syllable = Math.max(0, Math.sin(2 * Math.PI * 4 * t)) ** 2
		const phrase = t % 2 < 1.4 ? 1 : 0.03
		const v = (0.5 * Math.sin(2 * Math.PI * 180 * t) + 0.3 * Math.sin(2 * Math.PI * 720 * t) + 0.2 * Math.sin(2 * Math.PI * 2400 * t)) * syllable * phrase * 0.8
		data.writeInt16LE(Math.round(v * 32767), i * 2)
	}
	const h = Buffer.alloc(44)
	h.write('RIFF', 0)
	h.writeUInt32LE(36 + data.length, 4)
	h.write('WAVEfmt ', 8)
	h.writeUInt32LE(16, 16)
	h.writeUInt16LE(1, 20)
	h.writeUInt16LE(1, 22)
	h.writeUInt32LE(rate, 24)
	h.writeUInt32LE(rate * 2, 28)
	h.writeUInt16LE(2, 32)
	h.writeUInt16LE(16, 34)
	h.write('data', 36)
	h.writeUInt32LE(data.length, 40)
	fs.writeFileSync(file, Buffer.concat([h, data]))
}

let services: Awaited<ReturnType<typeof createServices>>
let gateway: ReturnType<typeof createGateway>
let browser: DemoBrowser
let page: Page
let tmp: string

before(async () => {
	tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vg-replay-'))
	const wav = path.join(tmp, 'voice.wav')
	writeVoiceWav(wav)
	await buildSdk({ minify: true })
	const platform = loadPlatformConfig({ ...process.env, VG_STORE: 'memory', VG_PORT: String(PORT), VG_PUBLIC_URL: `http://127.0.0.1:${PORT}` })
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
		start: `${WEB}/ar/home`,
		headless: true,
		replayDir: path.join(ROOT, 'fixtures/replay/vodafone-eg'),
		fakeMic: wav,
		initScripts: [VOICE_STUB],
		viewport: { width: 1280, height: 800 },
		recordVideoDir: process.env.VG_E2E_VIDEO,
	})
	page = browser.page
	page.on('pageerror', (e) => console.log('[pageerror]', e.message))
	await ready()
})

after(async () => {
	await browser?.close()
	await gateway?.close()
	await services?.close()
	if (tmp) fs.rmSync(tmp, { recursive: true, force: true })
})

const ready = () => page.waitForFunction(() => !!(window as any).voiceGuide?.ui?.voice, null, { timeout: 15_000 })
const shadow = <T>(fn: (root: ShadowRoot) => T) => page.evaluate(`(${fn.toString()})(document.querySelector('vg-guide').shadowRoot)`) as Promise<T>
const rect = (sel: string, inShadow = false) =>
	page.evaluate(
		([s, sh]) => {
			const root: ParentNode = sh ? (document.querySelector('vg-guide')!.shadowRoot as ShadowRoot) : document
			const el = root.querySelector(s as string)
			if (!el) return null
			const r = el.getBoundingClientRect()
			return { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom }
		},
		[sel, inShadow] as const,
	)

/** Presses the microphone, waits for listening, then says the words one by one. */
async function say(words: string[]): Promise<void> {
	await page.locator('vg-guide .vg-mic').click()
	await page.waitForFunction(() => !!(window as any).__activeRec, null, { timeout: 10_000 })
	await page.evaluate((w) => (window as any).__vgSayWords(w), words)
}

test("the microphone takes Vodafone's floating-button style and stacks above the accessibility button", async () => {
	const mic = (await rect('.vg-mic', true))!
	const aw = (await rect('#vodafone-aw-icon'))!
	assert.ok(mic && aw, 'both buttons are on the page')
	assert.equal(Math.round(mic.w), 64)
	assert.ok(Math.abs(mic.x + mic.w / 2 - (aw.x + aw.w / 2)) <= 1, 'same vertical axis')
	assert.ok(Math.abs(aw.y - mic.bottom - 16) <= 1, '16px above the accessibility button')
	assert.ok(mic.bottom <= aw.y, 'never overlaps it')
	const css = await shadow((root) => {
		const cs = getComputedStyle(root.querySelector('.vg-mic')!)
		return { bg: cs.backgroundColor, border: `${cs.borderTopWidth} ${cs.borderTopStyle} ${cs.borderTopColor}`, shadow: cs.boxShadow, radius: cs.borderRadius }
	})
	assert.equal(css.bg, 'rgb(230, 0, 0)')
	assert.equal(css.border, '5px solid rgb(255, 255, 255)')
	assert.match(css.shadow, /rgba\(230, 0, 0, 0\.35\) 0px 6px 20px/)
	assert.equal(css.radius, '50%')
})

test('Arabic, by voice: the words appear one by one, the wave follows the microphone, the cheapest bundle is found on another page and read live', async () => {
	// Watch the transcript bar: how many words it shows after each change.
	await page.evaluate(() => {
		const words = document.querySelector('vg-guide')!.shadowRoot!.querySelector('.vg-bar .words')!
		;(window as any).__wordCounts = []
		new MutationObserver(() => {
			const n = words.querySelectorAll('.w').length
			const arr = (window as any).__wordCounts as number[]
			if (n && arr.at(-1) !== n) arr.push(n)
			// Kept across the navigation the request starts (same-origin session storage).
			sessionStorage.setItem('__vgWordCounts', JSON.stringify(arr))
		}).observe(words, { childList: true, subtree: true })
	})
	await page.locator('vg-guide .vg-mic').click()
	await page.waitForFunction(() => !!(window as any).__activeRec)
	assert.equal(await page.evaluate(() => (window as any).__recTrack), 'audio', 'recognition got the same microphone track as the waveform')
	assert.equal(await page.evaluate(() => (window as any).__recLang), 'ar-EG', 'Egyptian Arabic, not the page lang ar-SA')
	assert.equal(await shadow((r) => (r.querySelector('.vg-mic') as HTMLElement).dataset.state), 'listening')
	assert.equal(await shadow((r) => r.querySelector('.vg-bar')!.classList.contains('hidden')), false, 'the black bar is showing')

	// The waveform and the halo move with the (fake) microphone.
	const frames: string[] = []
	const scales: number[] = []
	for (let i = 0; i < 8; i++) {
		const s = await shadow((r) => ({
			px: (r.querySelector('.vg-bar canvas') as HTMLCanvasElement).toDataURL().slice(-200),
			scale: Number(/scale\(([\d.]+)\)/.exec((r.querySelector('.vg-mic .halo') as HTMLElement).style.transform)?.[1] || 1),
		}))
		frames.push(s.px)
		scales.push(s.scale)
		await page.waitForTimeout(120)
	}
	assert.ok(new Set(frames).size >= 4, 'the canvas changes from frame to frame')
	assert.ok(Math.max(...scales) - Math.min(...scales) > 0.1, `the halo grows and shrinks with the voice (${Math.min(...scales)}–${Math.max(...scales)})`)

	// Word by word.
	// The request may navigate before this call returns: the page that ran it can be gone.
	await page.evaluate(() => (window as any).__vgSayWords(['إيه', 'أرخص', 'باقة', 'نت؟'])).catch(() => {})

	// Plan: another page, the bundles tab, the cheapest card, its price read from the page.
	await page.waitForURL(`${WEB}/ar/mobile-internet-bundles`, { timeout: 15_000 })
	await ready()
	const counts = JSON.parse((await page.evaluate(() => sessionStorage.getItem('__vgWordCounts'))) || '[]') as number[]
	assert.deepEqual(counts.slice(0, 4), [1, 2, 3, 4], `one new word at a time (saw ${counts.join(',')})`)
	const said = await heard(page, /37/, 15_000)
	assert.match(said, /أرخص/)
	await page.waitForTimeout(600) // the spotlight glides to its target (0.35 s)
	const spot = await page.evaluate(() => {
		const s = document.querySelector('vg-guide')!.shadowRoot!.querySelector('.spot') as HTMLElement
		const r = s.getBoundingClientRect()
		const cards = [...document.querySelectorAll('#Vodafone-Plus .card-subscription')]
		const hit = cards.find((c) => {
			const b = c.getBoundingClientRect()
			return b.width > 0 && b.left >= r.left - 2 && b.top >= r.top - 2 && b.right <= r.right + 2 && b.bottom <= r.bottom + 2
		})
		return { on: s.classList.contains('on'), card: hit?.textContent?.replace(/\s+/g, ' ').trim() }
	})
	assert.ok(spot.on, 'the spotlight is on')
	assert.match(spot.card || '', /37/, 'and it frames the 37 EGP card')
	assert.equal(await shadow((root) => getComputedStyle(root.querySelector('.panel')!).display), 'none', 'a spoken request does not open the panel over the answer (SPEC-02 §1)')
	assert.ok(await page.evaluate(() => ((window as any).__vgStreams as MediaStream[]).every((s) => s.getTracks().every((t) => t.readyState === 'ended'))), 'the microphone was released')
})

test('"subscribe to it" remembers the bundle, shows where to subscribe, and stops before signing in', async () => {
	await say(['اشترك', 'فيها'])
	await heard(page, /بنفسك/, 15_000)
	assert.equal(page.url(), `${WEB}/ar/mobile-internet-bundles`, 'no navigation into the signed-in app')
	const framed = await page.evaluate(() => {
		const s = document.querySelector('vg-guide')!.shadowRoot!.querySelector('.spot') as HTMLElement
		const r = s.getBoundingClientRect()
		const link = [...document.querySelectorAll('#Vodafone-Plus a[href*="miManagement"]')].find((a) => {
			const b = a.getBoundingClientRect()
			return b.width > 0 && b.left >= r.left - 2 && b.top >= r.top - 2 && b.right <= r.right + 2 && b.bottom <= r.bottom + 2
		})
		return link?.closest('.card-subscription')?.textContent?.replace(/\s+/g, ' ').trim()
	})
	assert.match(framed || '', /37/, "the spotlight is on that card's Subscribe now link")
})

test('reading a picture: the bundles banner, whose text is only inside the image', async () => {
	await say(['What', 'does', 'this', 'banner', 'say?'])
	await heard(page, /PlayStation/, 15_000)
})

test('"what\'s on this page?" is answered from the page the person is on', async () => {
	await say(['إيه', 'اللي', 'في', 'الصفحة', 'دي؟'])
	await heard(page, /باقات النت للموبايل/, 15_000)
	assert.equal(page.url(), `${WEB}/ar/mobile-internet-bundles`)
})

test('English, into the /spa/ app: the store finder, with the microphone in the same place', async () => {
	const before = (await rect('.vg-mic', true))!
	await say(['Where\'s', 'the', 'nearest', 'store?'])
	await page.waitForURL(`${WEB}/spa/storeLocator`, { timeout: 15_000 })
	await ready()
	await page.waitForFunction(() => document.querySelector('vg-guide')!.shadowRoot!.querySelector('.spot')!.classList.contains('on'), null, { timeout: 15_000 })
	const framed = await page.evaluate(() => {
		const s = document.querySelector('vg-guide')!.shadowRoot!.querySelector('.spot') as HTMLElement
		const r = s.getBoundingClientRect()
		const k = document.querySelector('#keyword')!.getBoundingClientRect()
		return k.left >= r.left - 2 && k.right <= r.right + 2 && k.top >= r.top - 2 && k.bottom <= r.bottom + 2
	})
	assert.ok(framed, 'the store search box is spotlit')
	const now = (await rect('.vg-mic', true))!
	assert.deepEqual([Math.round(now.x), Math.round(now.y)], [Math.round(before.x), Math.round(before.y)], 'the microphone does not move between page types')
	const transcript = await page.evaluate(() => document.querySelector('vg-guide')!.shadowRoot!.querySelector('.log')!.textContent || '')
	assert.match(transcript, /أرخص باقة نت/, 'the conversation came along')
})

test('"stop" ends what the guide is doing', async () => {
	await say(['خلاص'])
	await heard(page, /وقفت|stopped/i, 10_000)
})

test('X-ray fills from long-polled events through the page origin', async () => {
	// The X-ray is its own chunk (T-504): load it, and it gets every event seen so far.
	const turns = await page.evaluate(async () => (await (window as any).voiceGuide.loadXray()).view().turns.length)
	assert.ok(turns >= 1, `the X-ray has turns (${turns})`)
	const view = await page.evaluate(() => (window as any).voiceGuide.xray.view())
	const layers = view.turns.flatMap((t: any) => t.events.map((e: any) => e.layer))
	assert.ok(layers.includes('understand'), 'server-side events (router.understood) arrived by polling')
	assert.ok(view.turns.some((t: any) => /أرخص باقة نت/.test(t.utterance)), 'with the utterance from turn.received')
	const listen = view.turns.flatMap((t: any) => t.events).find((e: any) => e.layer === 'listen' && /shared-track/.test(e.detail))
	assert.ok(listen, 'the listen row shows the audio mode')
	assert.match(listen.detail, /first word \d+ ms/, 'and the time to the first word')
})

test('no speech service (Chromium, offline): the bar says so, the mic is released and typing is offered', async () => {
	await page.locator('vg-guide .vg-mic').click()
	await page.waitForFunction(() => !!(window as any).__activeRec, null, { timeout: 10_000 })
	await page.evaluate(() => {
		const rec = (window as any).__activeRec
		;(window as any).__activeRec = null
		rec.onerror && rec.onerror({ error: 'network' })
		rec.onend && rec.onend()
	})
	const ui = await page.waitForFunction(
		() => {
			const root = document.querySelector('vg-guide')!.shadowRoot!
			const bar = root.querySelector('.vg-bar')?.textContent || ''
			return /مش متاح|not available/.test(bar) ? { bar, focused: root.activeElement?.tagName || '' } : null
		},
		null,
		{ timeout: 5000 },
	)
	const v = (await ui.jsonValue()) as { bar: string; focused: string }
	assert.match(v.bar, /تكتب|type/i, 'it offers typing instead of "try again"')
	assert.equal(v.focused, 'INPUT', 'the text box has focus')
	assert.ok(await page.evaluate(() => ((window as any).__vgStreams as MediaStream[]).every((s) => s.getTracks().every((t) => t.readyState === 'ended'))), 'the microphone was released')
})

test('a typed request with the panel open: the panel moves so it never covers the highlighted card', async () => {
	await page.goto(`${WEB}/ar/mobile-internet-bundles`)
	await ready()
	await page.evaluate(() => (window as any).voiceGuide.ui.open())
	const before = (await rect('.panel', true))!
	await type(page, 'إيه أرخص باقة نت')
	await heard(page, /37/, 15_000)
	await page.waitForTimeout(700)
	const r = await shadow((root) => {
		const box = (el: Element | null) => {
			if (!el || getComputedStyle(el).display === 'none') return null
			const b = el.getBoundingClientRect()
			return { l: b.left, t: b.top, r: b.right, b: b.bottom }
		}
		return { spot: box(root.querySelector('.spot.on')), panel: box(root.querySelector('.panel')) }
	})
	assert.ok(r.spot, 'the card is highlighted')
	if (r.panel) {
		const overlap = r.spot!.l < r.panel.r && r.spot!.r > r.panel.l && r.spot!.t < r.panel.b && r.spot!.b > r.panel.t
		assert.equal(overlap, false, `panel ${JSON.stringify(r.panel)} covers spotlight ${JSON.stringify(r.spot)}`)
		assert.notEqual(Math.round(r.panel.l), Math.round(before.x), 'the panel moved to the other side')
	}
	// When the spotlight ends, the panel goes back where the person had it.
	await page.evaluate(() => (window as any).voiceGuide.ui.clearSpotlight())
	const after = (await rect('.panel', true))!
	assert.equal(Math.round(after.x), Math.round(before.x))
})
