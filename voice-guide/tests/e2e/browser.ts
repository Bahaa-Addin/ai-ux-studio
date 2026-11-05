/**
 * Browser helpers for end-to-end tests. Speech is simulated at the browser API
 * boundary: a fake SpeechRecognition that the test "speaks" into, and a
 * speechSynthesis that records what the guide says. Everything between the
 * microphone and the speaker is the real SDK, gateway, services and Postgres.
 */
import fs from 'node:fs'

import type { Page } from 'playwright'

export const SPEECH_STUB = `(() => {
	window.__spoken = [];
	class FakeRecognition {
		constructor() { this.lang = ''; this.onresult = null; this.onerror = null; this.onend = null; this.interimResults = false; this.continuous = false; this.maxAlternatives = 1; }
		start() { window.__activeRec = this; }
		stop() { if (window.__activeRec === this) { window.__activeRec = null; setTimeout(() => this.onend && this.onend(), 0); } }
		abort() { this.stop(); }
	}
	window.SpeechRecognition = FakeRecognition;
	window.webkitSpeechRecognition = FakeRecognition;
	window.__vgHear = (text, confidence = 0.92) => {
		const rec = window.__activeRec;
		if (!rec) return false;
		window.__lastRecLang = rec.lang;
		const interim = [{ transcript: text.slice(0, Math.ceil(text.length / 2)), confidence }];
		interim.isFinal = false;
		rec.onresult && rec.onresult({ resultIndex: 0, results: [interim] });
		const fin = [{ transcript: text, confidence }];
		fin.isFinal = true;
		setTimeout(() => {
			rec.onresult && rec.onresult({ resultIndex: 0, results: [fin] });
			window.__activeRec = null;
			rec.onend && rec.onend();
		}, 120);
		return true;
	};
	const synth = {
		speak(u) { window.__spoken.push({ text: u.text, lang: u.lang }); setTimeout(() => u.onend && u.onend(), 30); },
		cancel() {}, pause() {}, resume() {}, getVoices() { return []; }, addEventListener() {}, speaking: false, pending: false,
	};
	Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
	window.SpeechSynthesisUtterance = window.SpeechSynthesisUtterance || function (t) { this.text = t; };
})();`

/** Opens the panel with the launcher (which starts listening) and speaks a request. */
export async function speak(page: Page, text: string) {
	const ui = page.locator('vg-guide')
	const launcher = ui.locator('.launcher')
	if (await launcher.isVisible()) await launcher.click()
	else await ui.locator('.mic').click()
	await page.waitForFunction(() => !!(window as any).__activeRec)
	/** Returns the language the recognizer was started with. */
	return page.evaluate((t) => {
		const lang = (window as any).__activeRec.lang as string
		;(window as any).__vgHear(t)
		return lang
	}, text)
}

export async function type(page: Page, text: string) {
	const ui = page.locator('vg-guide')
	if (await ui.locator('.launcher').isVisible()) {
		await ui.locator('.launcher').click()
		await page.evaluate(() => (window as any).voiceGuide.speech.stopListening())
	}
	await ui.locator('.bar input').fill(text)
	await ui.locator('.bar input').press('Enter')
}

/** Waits until the guide has said something matching `re` on this page. */
export async function heard(page: Page, re: RegExp, timeout = 10_000): Promise<string> {
	const h = await page.waitForFunction(
		(src) => {
			const r = new RegExp(src, 'u')
			const hit = ((window as any).__spoken || []).find((s: any) => r.test(s.text))
			return hit ? hit.text : null
		},
		re.source,
		{ timeout },
	)
	return (await h.jsonValue()) as string
}

/** The element the spotlight currently frames, by its id or key attribute. */
export async function spotlit(page: Page): Promise<{ on: boolean; commit: boolean; overlaps: string[] }> {
	await page.waitForTimeout(500) // the spotlight glides to its target (0.35 s)
	return page.evaluate(() => {
		const host = document.querySelector('vg-guide')!
		const spot = host.shadowRoot!.querySelector('.spot') as HTMLElement
		const on = spot.classList.contains('on')
		const s = spot.getBoundingClientRect()
		const overlaps: string[] = []
		for (const el of document.querySelectorAll('[id], [data-bundle]')) {
			const r = el.getBoundingClientRect()
			if (r.width === 0) continue
			const inside = r.left >= s.left - 1 && r.top >= s.top - 1 && r.right <= s.right + 1 && r.bottom <= s.bottom + 1
			const tight = inside && r.width * r.height >= 0.6 * s.width * s.height
			if (tight) overlaps.push((el as HTMLElement).dataset.bundle || el.id)
		}
		return { on, commit: spot.classList.contains('commit'), overlaps }
	})
}

/* The voice-first microphone (the Vodafone replay suite and tools/demo-walkthrough.ts). */

/** Recognition that emits growing interim results, one word at a time, then the final text. */
export const VOICE_STUB = `(() => {
	window.__spoken = [];
	window.__vgStreams = [];
	const gum = navigator.mediaDevices && navigator.mediaDevices.getUserMedia && navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
	if (gum) navigator.mediaDevices.getUserMedia = async (c) => { const s = await gum(c); window.__vgStreams.push(s); return s; };
	class FakeRecognition {
		constructor() { this.lang = ''; this.interimResults = false; this.continuous = false; this.maxAlternatives = 1; this.phrases = []; }
		start(track) {
			if (track !== undefined && !(track instanceof MediaStreamTrack)) throw new TypeError('not a track');
			window.__activeRec = this; window.__recTrack = track ? track.kind : null; window.__recLang = this.lang;
			// Like Chrome: phrase hints work only on-device; the server engine fails the request.
			if (this.phrases && this.phrases.length && !this.processLocally) { window.__activeRec = null; setTimeout(() => { this.onerror && this.onerror({ error: 'phrases-not-supported' }); this.onend && this.onend(); }, 10); return; }
			setTimeout(() => this.onsoundstart && this.onsoundstart(), 30);
		}
		stop() { if (window.__activeRec === this) { window.__activeRec = null; setTimeout(() => this.onend && this.onend(), 0); } }
		abort() { this.stop(); }
	}
	window.SpeechRecognitionPhrase = class { constructor(phrase, boost) { this.phrase = phrase; this.boost = boost; } };
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
		speak(u) { window.__spoken.push({ text: u.text, lang: u.lang }); if (window.__holdSpeech) { synth.speaking = true; window.__held = u; return; } setTimeout(() => u.onend && u.onend(), 30); },
		cancel() { window.__cancelledAt = performance.now(); synth.speaking = false; const u = window.__held; window.__held = null; if (u) { u.onerror ? u.onerror({ error: 'interrupted' }) : u.onend && u.onend(); } },
		pause() {}, resume() {}, getVoices() { return []; }, addEventListener() {}, speaking: false, pending: false,
	};
	Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
	window.SpeechSynthesisUtterance = window.SpeechSynthesisUtterance || function (t) { this.text = t; };
})();`

/** A voice-like signal: three partials under a 4 Hz syllable envelope with pauses, 4 s, looped by Chromium. */
export function writeVoiceWav(file: string): void {
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
