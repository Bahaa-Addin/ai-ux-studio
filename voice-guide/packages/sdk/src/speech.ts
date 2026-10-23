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
	readonly canListen: boolean
	readonly canSpeak: boolean
	#rec: Rec | null = null
	#voices: SpeechSynthesisVoice[] = []
	muted = false

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
		if (opts.phrases?.length && w.SpeechRecognitionPhrase && 'phrases' in rec) {
			try {
				rec.phrases = opts.phrases.slice(0, 50).map((p) => new w.SpeechRecognitionPhrase(p, 2))
			} catch {}
		}
		let finalSent = false
		rec.onresult = (e: any) => {
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
		rec.onerror = (e: any) => h.onError(e.error || 'error')
		rec.onspeechstart = () => h.onSpeechStart?.()
		rec.onsoundstart = () => h.onSound?.(true)
		rec.onsoundend = () => h.onSound?.(false)
		rec.onend = () => {
			if (this.#rec === rec) this.#rec = null
			h.onEnd()
		}
		this.#rec = rec
		let mode: ListenInfo['mode'] = 'own-capture'
		if (opts.track) {
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
			const status = await R.available({ langs: [lang], processLocally: true })
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
			this.#rec?.stop()
		} catch {}
	}

	abortListening(): void {
		const r = this.#rec
		this.#rec = null
		try {
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
			function done() {
				clearTimeout(cap)
				resolve()
			}
			u.onend = done
			u.onerror = done
			speechSynthesis.speak(u)
		})
	}

	cancelSpeech(): void {
		if (this.canSpeak) speechSynthesis.cancel()
	}
}
