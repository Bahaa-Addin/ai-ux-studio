/**
 * Browser helpers for end-to-end tests. Speech is simulated at the browser API
 * boundary: a fake SpeechRecognition that the test "speaks" into, and a
 * speechSynthesis that records what the guide says. Everything between the
 * microphone and the speaker is the real SDK, gateway, services and Postgres.
 */
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
