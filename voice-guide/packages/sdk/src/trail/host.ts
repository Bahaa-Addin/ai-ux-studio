/**
 * The contract between the trail and a page that shows the journey itself (ADR-0040): the Vodafone
 * clone's Pocket page draws its own timeline and frosted overlay in its own design, and drives the
 * trail through these intents. The trail keeps recording, storage, the sandboxed preview, attention
 * and questions; nothing about the person leaves the browser through this API either.
 *
 * A page declares itself a host with `<meta name="vg-trail-host" content="pocket">` and listens for
 * `vg:trail-ready` (detail: the API) and `vg:trail-open` (the person asked to see the journey).
 */
import type { TrailKey } from './i18n.ts'
import type { ActionState, Consent, PreviewState, RecState } from './state.ts'
import type { ExploredItem, TrailStepSummary } from './types.ts'

export interface TrailHostSnapshot {
	consent: Consent
	rec: RecState
	/** The journey is open (attention is paused while it covers the page). */
	open: boolean
	preview: PreviewState
	action: ActionState
	lang: string
	steps: TrailStepSummary[]
	currentStepId: string | null
	selectedStepId: string | null
	/** 0..1 within the selected step. */
	position: number
	explored: ExploredItem[]
	activeQuestionId: string | null
	/** "Opened <page>" when the selected step's end is reached and a link led on. */
	transition: string | null
	retentionHours: number
	aggregation: boolean
	reducedMotion: boolean
}

export interface TrailHostApi {
	version: 1
	snapshot(): TrailHostSnapshot
	/** Called at once and after every change; returns the unsubscribe function. */
	subscribe(fn: (s: TrailHostSnapshot) => void): () => void
	/** Where the sandboxed preview renders: an element of the host's own design. */
	setPreviewRoot(el: HTMLElement | null): void
	open(): void
	close(): void
	select(stepId: string): void
	scrub(stepId: string, fraction: number, how?: 'pointer' | 'keyboard' | 'touch'): void
	/** The pointer rests: play on from here (not under reduced motion). */
	hold(): void
	/** The pointer left the timeline: stop playing. */
	leave(): void
	togglePlay(): void
	/** A question chip: becomes an ordinary guide turn with a verified hint (ADR-0038). */
	ask(destinationId: string, questionId: string): void
	allow(): void
	notNow(): void
	pause(): void
	resume(): void
	clear(): void
	clearAll(): void
	turnOff(): void
	/** The trail's localized words, so the host never hardcodes copy. */
	t(key: TrailKey, vars?: Record<string, string | number>): string
}
