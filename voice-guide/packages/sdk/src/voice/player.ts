/**
 * Plays the guide's VoiceTut audio (ADR-0047 §5) through one reused audio element, outside the
 * page's DOM. play(url) resolves when the audio ends and rejects if it cannot play or is stopped;
 * stop() ends the current play at once (the person pressed the microphone).
 *
 * Each play owns its settle: a late callback from an earlier play (the browser rejecting a play()
 * the next stop() interrupted) can only settle that earlier play, never the next one. If 'ended'
 * never comes (a broken file, a stalled stream), the play ends after CAP_MS.
 */
import type { Player } from './out.ts'

const CAP_MS = 30_000

/** The part of HTMLAudioElement the player uses (a fake in tests). */
export interface AudioLike {
	src: string
	preload: string
	paused: boolean
	onended: ((ev?: unknown) => void) | null
	onerror: ((ev?: unknown) => void) | null
	play(): Promise<void>
	pause(): void
	load(): void
	removeAttribute(name: string): void
}

interface Current {
	settle(error?: Error): void
}

export class AudioPlayer implements Player {
	#el: AudioLike
	#current: Current | null = null

	constructor(make: () => AudioLike = () => new Audio() as unknown as AudioLike) {
		this.#el = make()
	}

	play(url: string): Promise<void> {
		this.stop()
		return new Promise((resolve, reject) => {
			const el = this.#el
			let cap: ReturnType<typeof setTimeout> | null = null
			const mine: Current = {
				settle: (error) => {
					if (this.#current !== mine) return
					this.#current = null
					if (cap) clearTimeout(cap)
					el.onended = el.onerror = null
					if (error) reject(error)
					else resolve()
				},
			}
			this.#current = mine
			cap = setTimeout(() => mine.settle(), CAP_MS)
			el.onended = () => mine.settle()
			el.onerror = () => mine.settle(new Error('audio error'))
			el.preload = 'auto'
			el.src = url
			el.play().catch((e: Error) => mine.settle(e))
		})
	}

	stop(): void {
		this.#current?.settle(Object.assign(new Error('stopped'), { name: 'AbortError' }))
		const el = this.#el
		try {
			el.pause()
			el.removeAttribute('src')
			el.load()
		} catch {}
	}
}
