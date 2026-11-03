/**
 * The recorder (ADR-0035): rrweb's `record()` with the policy's options (ADR-0037 §4), and
 * nothing else: no console, network, clipboard or keystroke plugins. Loaded as its own chunk only
 * after consent on an eligible page. Every event goes to the controller, which decides whether
 * it is kept; a recorder error stops recording and leaves the page alone.
 */
import { record } from '@rrweb/record'

import type { RecorderOptions } from './policy.ts'
import type { RawEvent } from './types.ts'

export interface RecorderHandle {
	/** A fresh full snapshot: each step's chunks start from one, so a step replays on its own. */
	snapshot(): void
	stop(): void
}

export function startRecording(opts: RecorderOptions, emit: (e: RawEvent) => void, onError: (e: unknown) => void): RecorderHandle | null {
	let stopFn: (() => void) | undefined
	try {
		stopFn =
			record({
				...opts,
				emit: (e) => emit(e as unknown as RawEvent),
				errorHandler: (e) => {
					onError(e)
					return true
				},
				plugins: [],
			}) || undefined
	} catch (e) {
		onError(e)
		return null
	}
	if (!stopFn) return null
	let stopped = false
	return {
		snapshot() {
			if (stopped) return
			try {
				record.takeFullSnapshot(true)
			} catch (e) {
				onError(e)
			}
		},
		stop() {
			if (stopped) return
			stopped = true
			try {
				stopFn?.()
			} catch {}
		},
	}
}
