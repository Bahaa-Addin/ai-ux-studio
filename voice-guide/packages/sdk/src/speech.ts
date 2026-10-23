/**
 * Speech in the browser (ADR-0019): Web Speech API for listening and speaking,
 * with a typing box when recognition is missing or denied. One utterance at a
 * time; speaking never blocks the plan longer than the line takes.
 */

type Rec = {
	lang: string
	interimResults: boolean
	continuous: boolean
	maxAlternatives: number
	start(): void
	stop(): void
	abort(): void
	onresult: ((e: any) => void) | null
	onerror: ((e: any) => void) | null
	onend: (() => void) | null
	onstart: (() => void) | null
}

export interface ListenHandlers {
	onInterim(text: string): void
	onFinal(text: string, confidence: number): void
	onError(code: string): void
	onEnd(): void
}

export class Speech {
	readonly canListen: boolean
	readonly canSpeak: boolean
	#rec: Rec | null = null
	#speaking: SpeechSynthesisUtterance | null = null
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

	listen(lang: string, h: ListenHandlers): void {
		this.stopListening()
		this.cancelSpeech()
		const w = window as any
		const R = w.SpeechRecognition || w.webkitSpeechRecognition
		const rec: Rec = new R()
		rec.lang = lang
		rec.interimResults = true
		rec.continuous = false
		rec.maxAlternatives = 1
		let finalSent = false
		rec.onresult = (e: any) => {
			let interim = ''
			for (let i = e.resultIndex; i < e.results.length; i++) {
				const r = e.results[i]
				if (r.isFinal && !finalSent) {
					finalSent = true
					h.onFinal(r[0].transcript.trim(), r[0].confidence ?? 1)
				} else interim += r[0].transcript
			}
			if (interim && !finalSent) h.onInterim(interim)
		}
		rec.onerror = (e: any) => h.onError(e.error || 'error')
		rec.onend = () => {
			this.#rec = null
			h.onEnd()
		}
		this.#rec = rec
		rec.start()
	}

	stopListening(): void {
		try {
			this.#rec?.stop()
		} catch {}
		this.#rec = null
	}

	get listening(): boolean {
		return !!this.#rec
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
			this.#speaking = u
			speechSynthesis.speak(u)
		})
	}

	cancelSpeech(): void {
		if (this.canSpeak) speechSynthesis.cancel()
		this.#speaking = null
	}
}
