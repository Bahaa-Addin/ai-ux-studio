/**
 * The guide's voice in the page (ADR-0047 §3–§5): a reply is split into sentences, each asked of the
 * gateway (POST /v1/speech) at once; the first plays as soon as its audio is ready, the rest follow
 * in order. If the first is not ready within `firstAudioMs`, or VoiceTut fails, or the browser will
 * not play it, the line (from that sentence on) is spoken by the browser's own voice: a reply is never
 * silent because of VoiceTut. cancel() (the person pressed the microphone) stops at once, and a reply
 * that arrives after it is ignored.
 *
 * Pure logic with its edges injected (the request, the player, the browser voice, the clock), so it
 * is tested in Node; voice-out-chunk.ts wires it to the page.
 */
import { canonicalSpeech, splitSentences } from './sentences.ts'

export interface SpeechReply {
	url: string | null
	ready: boolean
	cached?: boolean
	reason?: string
}

export interface Player {
	/** Resolves when the audio has played to its end; rejects if it cannot play (or is stopped). */
	play(url: string): Promise<void>
	stop(): void
}

export interface BrowserVoice {
	speak(text: string, tag: string): Promise<void>
	cancel(): void
	readonly speaking: boolean
}

export interface VoiceOutDeps {
	request(text: string, lang: string): Promise<SpeechReply>
	player: Player
	fallback: BrowserVoice
	firstAudioMs: number
	/** What happened to a line (for the X-ray): never its text. */
	report?(attrs: Record<string, unknown>, ms: number): void
	/**
	 * Personal data rules (ADR-0018): true when a masking rule matches. Such a line is never sent; the
	 * browser voice says it. Checked on the line, the line normalised, and each sentence as sent.
	 */
	isPrivate?(text: string): boolean
	/**
	 * The browser would not play without a tap in this page (autoplay rules after a page change).
	 * Given: the rest of the line is handed here (the guide shows "tap to hear") instead of to the
	 * browser voice, which the same rules silence too (ADR-0053 §4).
	 */
	onBlocked?(text: string, tag: string): void
	now?(): number
	wait?(ms: number): Promise<void>
}

const LATE = Symbol('late')

export class VoiceOut {
	#d: VoiceOutDeps
	#gen = 0
	/** A line is under way (asking, playing or handed to the browser voice). */
	#busy = false

	constructor(deps: VoiceOutDeps) {
		this.#d = deps
	}

	/** True from the start of a line to its end, the wait for its audio included. */
	get speaking(): boolean {
		return this.#busy || this.#d.fallback.speaking
	}

	cancel(): void {
		this.#gen++
		this.#busy = false
		this.#d.player.stop()
		this.#d.fallback.cancel()
	}

	#within<T>(p: Promise<T>, ms: number): Promise<T | typeof LATE> {
		const wait = this.#d.wait || ((t: number) => new Promise<void>((r) => setTimeout(r, t)))
		return Promise.race([p, wait(ms).then((): typeof LATE => LATE)])
	}

	async speak(text: string, tag: string): Promise<void> {
		this.cancel()
		const gen = this.#gen
		this.#busy = true
		try {
			await this.#line(text, tag, gen)
		} finally {
			if (gen === this.#gen) this.#busy = false
		}
	}

	async #line(text: string, tag: string, gen: number): Promise<void> {
		const now = this.#d.now || (() => performance.now())
		const t0 = now()
		const lang = tag.slice(0, 2)
		const sentences = splitSentences(text)
		if (!sentences.length) return
		const report = (fallback: string | null, played: number, firstAudio: number | null) => this.#d.report?.({ engine: 'voicetut', sentences: sentences.length, played, fallback, firstAudioMs: firstAudio === null ? null : Math.round(firstAudio) }, now() - t0)
		const fallBack = async (from: number, reason: string, played: number, firstAudio: number | null) => {
			report(reason, played, firstAudio)
			if (gen !== this.#gen) return
			if (reason === 'blocked' && this.#d.onBlocked) return this.#d.onBlocked(sentences.slice(from).join(' '), tag)
			await this.#d.fallback.speak(sentences.slice(from).join(' '), tag)
		}
		const isPrivate = this.#d.isPrivate
		// The line as written, as one normalised line (a number broken over lines is whole again), and each sentence as sent.
		if (isPrivate && (isPrivate(text) || isPrivate(canonicalSpeech(text)) || sentences.some((s) => isPrivate(s)))) return fallBack(0, 'private', 0, null)

		const ask = (s: string) => this.#d.request(s, lang).catch((): SpeechReply => ({ url: null, ready: false, reason: 'error' }))
		const replies = sentences.map(ask)
		let firstAudio: number | null = null
		for (let i = 0; i < sentences.length; i++) {
			let reply = await this.#within(replies[i], this.#d.firstAudioMs)
			if (gen !== this.#gen) return
			// A later sentence was asked at the start; while the earlier ones played it went on being made.
			if (i > 0 && reply !== LATE && !reply.ready && reply.reason === 'budget') reply = await this.#within(ask(sentences[i]), this.#d.firstAudioMs)
			if (gen !== this.#gen) return
			if (reply === LATE || !reply.ready || !reply.url) return fallBack(i, reply === LATE ? 'budget' : reply.reason || 'error', i, firstAudio)
			try {
				if (firstAudio === null) firstAudio = now() - t0
				await this.#d.player.play(reply.url)
			} catch (e) {
				if (gen !== this.#gen) return
				return fallBack(i, (e as Error)?.name === 'NotAllowedError' ? 'blocked' : 'error', i, firstAudio)
			}
			if (gen !== this.#gen) return
		}
		report(null, sentences.length, firstAudio)
	}
}
