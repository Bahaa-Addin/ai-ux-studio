/**
 * Listening through the gateway (ADR-0055): for browsers without speech recognition (Firefox, some
 * Brave setups) or whose recognition service fails with `network`. The guide's own microphone track
 * is recorded (MediaRecorder) until the person stops talking (a pause after speech), presses again,
 * or MAX_MS passes; the clip goes to POST /v1/stt, and the text comes back as one final result.
 * Same handler contract as the browser's recognition (speech.ts), so the guide does not care which.
 *
 * Pure logic with its edges injected (the recorder, the request, the level meter, the clock), so it
 * is tested in Node; stt-chunk.ts wires it to the page.
 */
import type { ListenHandlers, ListenInfo, ListenOptions } from '../speech.ts'

export interface Recorder {
	start(): void
	/** Resolves with the recorded audio (stop) or null (abort). */
	stop(): Promise<{ blob: Blob; ms: number } | null>
	abort(): void
}

export interface ServerListenDeps {
	/** A recorder on this track (or on a microphone it opens itself, when there is no track). */
	recorder(track: MediaStreamTrack | undefined): Promise<Recorder>
	transcribe(audio: Blob, lang: string, ms: number): Promise<{ text: string }>
	/** The microphone's level, 0..1, when the guide has a meter; without one only a press or MAX_MS ends the clip. */
	level?: () => number
	now?: () => number
	every?: (fn: () => void, ms: number) => () => void
}

/** A clip never runs longer than this (the gateway refuses longer ones too). */
export const MAX_MS = 15_000
/** Speech ends after this much quiet, once there was speech. */
export const QUIET_MS = 1_200
/** Quiet from the start: the person said nothing. */
export const NOTHING_MS = 6_000
export const SPEECH_LEVEL = 0.18

export class ServerListener {
	#d: ServerListenDeps
	#rec: Recorder | null = null
	#stopTick: (() => void) | null = null
	#finish: ((send: boolean) => void) | null = null

	constructor(deps: ServerListenDeps) {
		this.#d = deps
	}

	get listening(): boolean {
		return !!this.#rec
	}

	async listen(lang: string, h: ListenHandlers, opts: ListenOptions = {}): Promise<ListenInfo> {
		this.abort()
		const rec = await this.#d.recorder(opts.track)
		this.#rec = rec
		const now = this.#d.now || (() => performance.now())
		const every = this.#d.every || ((fn: () => void, ms: number) => {
			const id = setInterval(fn, ms)
			return () => clearInterval(id)
		})
		const t0 = now()
		let spokeAt = 0
		let quietSince = t0
		let done = false
		const finish = async (send: boolean) => {
			if (done) return
			done = true
			this.#stopTick?.()
			this.#stopTick = null
			this.#finish = null
			const clip = send ? await rec.stop() : (rec.abort(), null)
			if (this.#rec === rec) this.#rec = null
			if (!send) return h.onEnd()
			if (!clip || (!spokeAt && this.#d.level)) return h.onError('no-speech')
			h.onUpdate?.('', '…')
			try {
				const r = await this.#d.transcribe(clip.blob, lang, clip.ms)
				const text = (r.text || '').trim()
				if (!text) return h.onError('no-speech')
				h.onUpdate?.(text, '')
				h.onFinal(text, 1)
			} catch (e) {
				h.onError((e as { code?: string })?.code === 'rate_limited' ? 'server-busy' : 'network')
			}
		}
		this.#finish = (send) => void finish(send)
		rec.start()
		this.#stopTick = every(() => {
			const t = now()
			if (t - t0 >= MAX_MS) return void finish(true)
			const level = this.#d.level?.()
			if (level === undefined) return
			if (level >= SPEECH_LEVEL) {
				if (!spokeAt) {
					spokeAt = t
					h.onSpeechStart?.()
					h.onSound?.(true)
				}
				quietSince = t
			} else if (spokeAt && t - quietSince >= QUIET_MS) void finish(true)
			else if (!spokeAt && t - t0 >= NOTHING_MS) void finish(true)
		}, 100)
		return { mode: opts.track ? 'shared-track' : 'own-capture', onDevice: false }
	}

	/** Second press, or the guide's time limit: send what was said. */
	stop(): void {
		this.#finish?.(true)
	}

	/** Cancel: nothing is sent. */
	abort(): void {
		this.#finish?.(false)
	}
}
