/**
 * One microphone stream for recognition and the waveform (ADR-0027, SPEC-02 §5). Opens the
 * microphone once, feeds an AnalyserNode, and hands the same track to SpeechRecognition where the
 * browser accepts it. Level: RMS through a soft knee, attack 40 ms, release 180 ms. Bands: low
 * (80–300 Hz), mid (300–1,500 Hz), high (1.5–4 kHz).
 */

export type AudioMode = 'shared-track' | 'two-captures' | 'events-only'

export interface Sample {
	level: number
	low: number
	mid: number
	high: number
}

export const smooth = (prev: number, target: number, dtMs: number, attackMs = 40, releaseMs = 180): number => {
	const tau = target > prev ? attackMs : releaseMs
	return prev + (target - prev) * (1 - Math.exp(-dtMs / tau))
}

export const levelFromRms = (rms: number): number => Math.min(1, (rms / 0.12) ** 0.7)

export class MicStream {
	stream: MediaStream | null = null
	#ctx: AudioContext | null = null
	#analyser: AnalyserNode | null = null
	#time: Float32Array<ArrayBuffer> | null = null
	#freq: Uint8Array<ArrayBuffer> | null = null
	#last: Sample = { level: 0, low: 0, mid: 0, high: 0 }
	#lastAt = 0
	/** Synthetic level for events-only mode (set from recognition events). */
	synthetic = 0

	get track(): MediaStreamTrack | undefined {
		return this.stream?.getAudioTracks()[0]
	}

	async open(): Promise<void> {
		this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
		const AC = window.AudioContext || (window as any).webkitAudioContext
		this.#ctx = new AC()
		const src = this.#ctx.createMediaStreamSource(this.stream)
		this.#analyser = this.#ctx.createAnalyser()
		this.#analyser.fftSize = 1024
		this.#analyser.smoothingTimeConstant = 0.6
		src.connect(this.#analyser)
		this.#time = new Float32Array(this.#analyser.fftSize)
		this.#freq = new Uint8Array(this.#analyser.frequencyBinCount)
		if (this.#ctx.state === 'suspended') await this.#ctx.resume().catch(() => {})
	}

	/** Releases the microphone at once so the browser's recording indicator turns off. */
	close(): void {
		for (const t of this.stream?.getTracks() || []) t.stop()
		this.stream = null
		void this.#ctx?.close().catch(() => {})
		this.#ctx = null
		this.#analyser = null
	}

	get live(): boolean {
		return !!this.stream?.getAudioTracks().some((t) => t.readyState === 'live')
	}

	sample(now = performance.now()): Sample {
		const dt = this.#lastAt ? Math.min(100, now - this.#lastAt) : 16
		this.#lastAt = now
		let rms = 0
		let low = 0
		let mid = 0
		let high = 0
		if (this.#analyser && this.#time && this.#freq) {
			this.#analyser.getFloatTimeDomainData(this.#time)
			let sum = 0
			for (const v of this.#time) sum += v * v
			rms = Math.sqrt(sum / this.#time.length)
			this.#analyser.getByteFrequencyData(this.#freq)
			const hz = (this.#ctx?.sampleRate || 48000) / 2 / this.#freq.length
			const band = (a: number, b: number) => {
				const i0 = Math.max(1, Math.floor(a / hz))
				const i1 = Math.min(this.#freq!.length - 1, Math.ceil(b / hz))
				let s = 0
				for (let i = i0; i <= i1; i++) s += this.#freq![i]
				return s / ((i1 - i0 + 1) * 255)
			}
			low = band(80, 300)
			mid = band(300, 1500)
			high = band(1500, 4000)
		} else {
			rms = this.synthetic * 0.12
			low = mid = high = this.synthetic * 0.6
		}
		const target = levelFromRms(rms)
		this.#last = {
			level: smooth(this.#last.level, target, dt),
			low: smooth(this.#last.low, low, dt),
			mid: smooth(this.#last.mid, mid, dt),
			high: smooth(this.#last.high, high, dt),
		}
		return this.#last
	}
}
