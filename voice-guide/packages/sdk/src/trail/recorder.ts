/**
 * The recorder (ADR-0035): rrweb's `record()` with the policy's options (ADR-0037 §4), and
 * nothing else: no console, network, clipboard or keystroke plugins. Loaded as its own chunk only
 * after consent on an eligible page. Every event goes to the controller, which decides whether
 * it is kept; a recorder error stops recording and leaves the page alone.
 *
 * What a host covers with its own views (the trail host API's `setCover`: the Pocket's album, a reimagined
 * view; F12) is recorded as it shows, never as the host hides it: a full snapshot taken while it is covered
 * gives its node the attributes it has shown, and the host's changes to those attributes are left out, so a
 * memory never replays an empty page under the header.
 */
import { record } from '@rrweb/record'

import type { TrailHostCover } from './host.ts'
import type { RecorderOptions } from './policy.ts'
import type { RawEvent } from './types.ts'

export interface RecorderHandle {
	/** A fresh full snapshot: each step's chunks start from one, so a step replays on its own. */
	snapshot(): void
	stop(): void
}

type SNode = { id?: number; attributes?: Record<string, unknown>; childNodes?: SNode[] }

/** The covered node as it shows, in an rrweb event, in place (before it is kept). A host that throws leaves the event as it is. */
function asShown(e: { type: number; data?: any }, cover: TrailHostCover | null): void {
	if (!cover) return
	try {
		const id = record.mirror.getId(cover.node)
		const changes = e.type === 3 && e.data?.source === 0 && Array.isArray(e.data.attributes) ? e.data.attributes.filter((a: SNode) => a.id === id) : []
		if (id < 0 || (e.type !== 2 && !changes.length)) return
		// Read first: the host refreshes what it shows while it is not covered.
		const shown = cover.shown()
		if (!shown || !cover.covered()) return
		if (e.type === 2) {
			const find = (n: SNode): SNode | undefined => (n.id === id ? n : n.childNodes?.reduce<SNode | undefined>((hit, c) => hit || find(c), undefined))
			const n = find(e.data.node)
			if (!n) return
			// A copy: rrweb's mirror keeps the node's serialized object.
			const attrs = { ...n.attributes }
			for (const [k, v] of Object.entries(shown)) v === null ? delete attrs[k] : (attrs[k] = v)
			n.attributes = attrs
		} else {
			for (const a of changes) for (const k in shown) delete a.attributes?.[k]
			e.data.attributes = e.data.attributes.filter((a: SNode) => a.id !== id || Object.keys(a.attributes || {}).length)
		}
	} catch {}
}

export function startRecording(opts: RecorderOptions, emit: (e: RawEvent) => void, onError: (e: unknown) => void, cover: () => TrailHostCover | null = () => null): RecorderHandle | null {
	let stopFn: (() => void) | undefined
	try {
		stopFn =
			record({
				...opts,
				emit: (e) => {
					asShown(e, cover())
					emit(e as unknown as RawEvent)
				},
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
