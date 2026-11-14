/**
 * Speech in the browser (ADR-0019, ADR-0027): Web Speech API for listening and speaking, with a
 * typing box when recognition is missing or denied. Recognition takes the guide's own microphone
 * track where the browser accepts one (`start(track)`), reports final and interim text together
 * so the transcript bar can show words as they arrive, and uses contextual phrases and on-device
 * recognition where the browser has them.
 */

type Rec = {
	lang: string
	interimResults: boolean
	continuous: boolean
	maxAlternatives: number
	processLocally?: boolean
	stopped?: boolean
	phrases?: unknown[]
	start(track?: MediaStreamTrack): void
	stop(): void
	abort(): void
	onresult: ((e: any) => void) | null
	onerror: ((e: any) => void) | null
	onend: (() => void) | null
	onstart: (() => void) | null
	onspeechstart: (() => void) | null
	onsoundstart: (() => void) | null
	onsoundend: (() => void) | null
}

export interface ListenHandlers {
	/** All final text so far and the current interim text (both cumulative). */
	onUpdate?(finalText: string, interimText: string): void
	onInterim?(text: string): void
	onFinal(text: string, confidence: number): void
	onError(code: string): void
	onEnd(): void
	onSpeechStart?(): void
	/** Sound on or off, for drawing the wave when the microphone cannot be shared. */
	onSound?(on: boolean): void
}

export interface ListenOptions {
	track?: MediaStreamTrack
	phrases?: string[]
	onDevice?: 'prefer' | 'require' | 'off'
}

export interface ListenInfo {
	mode: 'shared-track' | 'own-capture'
	onDevice: boolean
}

export class Speech {
	/** The browser has speech recognition, or stt.js gave it the gateway's (ADR-0055; it wraps listen, stop and abort). */
	canListen: boolean
	readonly canSpeak: boolean
	/**
	 * The browser refused to speak without a tap in this page (autoplay rules after a page change).
	 * The guide shows "tap to hear" with the line (ADR-0053 §4).
	 */
	onBlocked: ((text: string, lang: string) => void) | null = null
	#rec: Rec | null = null
	#voices: SpeechSynthesisVoice[] = []
	muted = false
	/** Set when a shared track produced no words: some builds accept start(track) and then hear nothing. */
	#noTrack = false

	constructor() {
		const w = window as any
		this.canListen = !!(w.SpeechRecognition || w.webkitSpeechRecognition)
		this.canSpeak = 'speechSynthesis' in window
		if (this.canSpeak) {
			const load = () => (this.#voices = speechSynthesis.getVoices())
			load()
			speechSynthesis.addEventListener?.('voiceschanged', load)
		}
	}

	async listen(lang: string, h: ListenHandlers, opts: ListenOptions = {}): Promise<ListenInfo> {
		this.stopListening()
		this.cancelSpeech()
		const w = window as any
		const R = w.SpeechRecognition || w.webkitSpeechRecognition
		const rec: Rec = new R()
		rec.lang = lang
		rec.interimResults = true
		rec.continuous = false
		rec.maxAlternatives = 1
		const onDevice = await this.#preferOnDevice(R, rec, lang, opts.onDevice || 'off')
		// Chrome takes phrase hints only for on-device recognition; the server engine fails the whole
		// request with "phrases-not-supported" (seen on the live demo, 2026-10-24).
		if (onDevice && opts.phrases?.length) {
			try {
				rec.phrases = opts.phrases.slice(0, 50).map((p) => new w.SpeechRecognitionPhrase(p, 2))
			} catch {}
		}
		let finalSent = false
		let heard = false
		const useTrack = opts.track && !this.#noTrack
		rec.onresult = (e: any) => {
			heard = true
			let finalText = ''
			let interim = ''
			let confidence = 1
			for (let i = 0; i < e.results.length; i++) {
				const r = e.results[i]
				if (r.isFinal) {
					finalText += `${r[0].transcript} `
					confidence = r[0].confidence || confidence
				} else interim += `${r[0].transcript} `
			}
			h.onUpdate?.(finalText.trim(), interim.trim())
			if (interim.trim()) h.onInterim?.(interim.trim())
			if (finalText.trim() && !interim.trim() && !finalSent) {
				finalSent = true
				h.onFinal(finalText.trim(), confidence)
			}
		}
		// "no-speech" is left to onend, which follows every error.
		rec.onerror = (e: any) => e.error !== 'no-speech' && ((heard = true), h.onError(e.error || 'error'))
		rec.onspeechstart = () => h.onSpeechStart?.()
		rec.onsoundstart = () => h.onSound?.(true)
		rec.onsoundend = () => h.onSound?.(false)
		rec.onend = () => {
			if (this.#rec === rec) this.#rec = null
			// Ended with no words and no error: "nothing happens" for the person. Say so, and stop
			// handing this browser our track (the next press lets recognition open the microphone).
			if (heard || rec.stopped) return h.onEnd()
			if (useTrack) this.#noTrack = true
			h.onError('no-speech')
		}
		this.#rec = rec
		let mode: ListenInfo['mode'] = 'own-capture'
		if (useTrack) {
			try {
				rec.start(opts.track)
				mode = 'shared-track'
			} catch {
				rec.start()
			}
		} else rec.start()
		return { mode, onDevice }
	}

	async #preferOnDevice(R: any, rec: Rec, lang: string, pref: 'prefer' | 'require' | 'off'): Promise<boolean> {
		if (pref === 'off' || typeof R.available !== 'function' || !('processLocally' in rec)) return false
		try {
			// Some builds never settle this promise; recognition must not wait on it.
			const status = await Promise.race([R.available({ langs: [lang], processLocally: true }), new Promise((r) => setTimeout(r, 800))])
			if (status === 'available') {
				rec.processLocally = true
				return true
			}
			// Start the language pack download for next time; this request uses the browser's default engine.
			if (status === 'downloadable' && typeof R.install === 'function') void R.install({ langs: [lang], processLocally: true }).catch(() => {})
		} catch {}
		return false
	}

	stopListening(): void {
		try {
			// Stopped by the guide (a second press, the time limit): ending empty is expected.
			if (this.#rec) this.#rec.stopped = true
			this.#rec?.stop()
		} catch {}
	}

	abortListening(): void {
		const r = this.#rec
		this.#rec = null
		try {
			if (r) r.stopped = true
			r?.abort()
		} catch {}
	}

	get listening(): boolean {
		return !!this.#rec
	}

	get speaking(): boolean {
		return this.canSpeak && speechSynthesis.speaking
	}

	#voiceFor(lang: string): SpeechSynthesisVoice | undefined {
		const exact = this.#voices.find((v) => v.lang.toLowerCase() === lang.toLowerCase())
		return exact || this.#voices.find((v) => v.lang.toLowerCase().startsWith(lang.slice(0, 2).toLowerCase()))
	}

	/** Resolves when the line is spoken, or after a duration estimate if the engine stays silent. */
	speak(text: string, lang: string): Promise<void> {
		if (!text || this.muted || !this.canSpeak) return Promise.resolve()
		this.cancelSpeech()
		return new Promise((resolve) => {
			const u = new SpeechSynthesisUtterance(text)
			u.lang = lang
			const v = this.#voiceFor(lang)
			if (v) u.voice = v
			u.rate = 1.02
			const cap = setTimeout(done, Math.min(12_000, 900 + text.length * 70))
			let check: ReturnType<typeof setTimeout> | undefined
			const blocked = () => {
				speechSynthesis.cancel()
				this.onBlocked?.(text, lang)
				done()
			}
			function done() {
				clearTimeout(cap)
				clearTimeout(check)
				resolve()
			}
			// Started: not blocked.
			u.onstart = () => clearTimeout(check)
			u.onend = done
			// Chrome says "not-allowed" when a page that was never tapped asks to speak.
			u.onerror = (e: SpeechSynthesisErrorEvent) => (e.error === 'not-allowed' ? blocked() : done())
			speechSynthesis.speak(u)
			// Safari stays silent without an error: a page never tapped that has not started speaking in 1.5 s is blocked.
			if ((navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation?.hasBeenActive === false) check = setTimeout(blocked, 1500)
		})
	}

	cancelSpeech(): void {
		if (this.canSpeak) speechSynthesis.cancel()
	}
}
