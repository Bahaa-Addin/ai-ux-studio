/**
 * One synthesis at a time (ADR-0047): VoiceTut's Gradio queue runs one job and keeps two waiting,
 * so the service queues its own work. Three lanes, served in order: `now` (the page waits for this
 * sentence), `ahead` (a plan's lines made before the page asks) and `warm` (fixed phrases before a
 * demo). A job already queued or running is not queued twice; asking `now` for a sentence waiting
 * in a later lane moves it up.
 */

export type Lane = 'now' | 'ahead' | 'warm'

const ORDER: Lane[] = ['now', 'ahead', 'warm']

interface Waiting {
	key: string
	lane: Lane
	run: () => Promise<void>
	done: Promise<void>
	settle: { resolve: () => void; reject: (e: unknown) => void }
}

export class SynthQueue {
	#waiting: Waiting[] = []
	#inFlight = new Map<string, Promise<void>>()
	#running: string | null = null
	#closed = false
	#lastJobAt = 0

	/** Queues `run` under `key` (or joins it if already queued or running); resolves when it has run. */
	enqueue(key: string, run: () => Promise<void>, lane: Lane): Promise<void> {
		if (this.#closed) return Promise.reject(new Error('speech queue closed'))
		const queued = this.#waiting.find((w) => w.key === key)
		if (queued) {
			if (ORDER.indexOf(lane) < ORDER.indexOf(queued.lane)) queued.lane = lane
			return queued.done
		}
		const running = this.#inFlight.get(key)
		if (running) return running
		let settle!: Waiting['settle']
		const done = new Promise<void>((resolve, reject) => (settle = { resolve, reject }))
		// A caller that never awaits must not see an unhandled rejection.
		done.catch(() => {})
		this.#waiting.push({ key, lane, run, done, settle })
		this.#inFlight.set(key, done)
		queueMicrotask(() => this.#next())
		return done
	}

	async #next(): Promise<void> {
		if (this.#running || this.#closed) return
		const pick = ORDER.map((lane) => this.#waiting.find((w) => w.lane === lane)).find(Boolean)
		if (!pick) return
		this.#waiting.splice(this.#waiting.indexOf(pick), 1)
		this.#running = pick.key
		try {
			await pick.run()
			pick.settle.resolve()
		} catch (e) {
			pick.settle.reject(e)
		} finally {
			this.#inFlight.delete(pick.key)
			this.#running = null
			this.#lastJobAt = Date.now()
			void this.#next()
		}
	}

	/** Already waiting or running (joining it costs VoiceTut nothing). */
	has(key: string): boolean {
		return this.#inFlight.has(key)
	}

	get busy(): boolean {
		return this.#running !== null || this.#waiting.length > 0
	}

	get size(): number {
		return this.#waiting.length + (this.#running ? 1 : 0)
	}

	get lastJobAt(): number {
		return this.#lastJobAt
	}

	/** Resolves when nothing is queued or running. */
	async drain(): Promise<void> {
		while (this.busy) await Promise.allSettled([...this.#inFlight.values()])
	}

	close(): void {
		this.#closed = true
		for (const w of this.#waiting.splice(0)) {
			this.#inFlight.delete(w.key)
			w.settle.reject(new Error('speech queue closed'))
		}
	}
}
