/**
 * The contract between the trail and a page that shows the journey itself (ADR-0040): the Vodafone
 * clone's Pocket page draws its own timeline and frosted overlay in its own design, and drives the
 * trail through these intents. The trail keeps recording, storage, the sandboxed preview, attention
 * and questions; nothing about the person leaves the browser through this API either.
 *
 * A page declares itself a host with `<meta name="vg-trail-host" content="pocket">` (the clone's
 * static declaration, kept until the live plan's phase 9), or claims the journey at run time with
 * `claim()` (version 2: the experience layer on Vodafone's own pages; ADR-0050). It listens for
 * `vg:trail-ready` (detail: the API, also `voiceGuide.trailHost`) and `vg:trail-open` (the person
 * asked to see the journey). The pill never navigates (S10): where no host claims the journey, the
 * guide's own sheet shows it.
 *
 * Changelog
 * - 2 (ADR-0050): `claim()`, which returns the function that gives the journey back (or null when
 *   another host holds it); `ask()` finds a question in the page's language or its first two
 *   letters. A host written for version 1 works unchanged against version 2.
 * - 2, part 2 (ADR-0050 §5, S14): what questions were about. `snapshot().asked` (newest first, across
 *   the visit's steps, each with its `stepId`; present only while there is a journey, consent granted
 *   or paused), `askAbout(destinationId, questionId?)` and `questionsFor(destinationId)`. Never the
 *   words said or typed, never the answer. `snapshot().steps` keep the version 1 shape (no `asked`).
 * - 2, part 3 (ADR-0050 §6, S15): `seed(journey)` and `reset()`, for the demo kit only (the session's
 *   `site.trail.demoKit`). `seed` replaces the current journey with a sample one (`SeedJourney`) only with
 *   consent granted, right after a press on the page and on a page the trail records; `reset` removes every
 *   journey and both copies of the consent ("Reset demo"). Both resolve to `{ ok }` or `{ ok: false, reason }`.
 * - 1 (ADR-0040): the first contract, for a page that declares itself with the meta.
 */
import type { TrailKey } from './i18n.ts'
import type { ActionState, Consent, PreviewState, RecState } from './state.ts'
import type { AskedQuestion, ExploredItem, TrailSession, TrailStepSummary } from './types.ts'

/**
 * A sample journey for the demo kit (version 2, S15): the trail's own stored data, as an export of it gives.
 * `session` is a journey's index as stored (`vg-trail/v1`); `chunks` holds, for a page step's id, its
 * replay: the JSON text of the step's recorded events (the `data` of a stored `json` chunk, or a `gzip`
 * one decompressed; a step's chunks joined in order), at most 256 KB. A step without one has no preview.
 * Ids are never kept (the seeded journey gets new ones) and its times are moved to end now.
 */
export interface SeedJourney {
	v: 1
	session: TrailSession
	chunks?: Record<string, string>
}

/**
 * Why a seed or reset was refused: not a demo (`site.trail.demoKit` off), no consent granted, no press just
 * before the call (or no `navigator.userActivation`), not a page the trail records, another seed under way,
 * a malformed or unknown shape, a version other than 1, over a limit (steps, asked questions, string or
 * replay sizes), longer than the 30-minute journey limit, or storage failed.
 */
export type SeedReason = 'not-a-demo' | 'no-consent' | 'no-press' | 'not-here' | 'busy' | 'invalid' | 'version' | 'too-big' | 'too-long' | 'failed'
export type SeedResult = { ok: true } | { ok: false; reason: SeedReason }

export interface TrailHostSnapshot {
	consent: Consent
	rec: RecState
	/** The journey is open (attention is paused while it covers the page). */
	open: boolean
	preview: PreviewState
	action: ActionState
	lang: string
	steps: TrailStepSummary[]
	/** What questions were about, newest first (version 2; absent without a journey). Read it only when present. */
	asked?: (AskedQuestion & { stepId: string })[]
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
	version: 2
	snapshot(): TrailHostSnapshot
	/** Called at once and after every change; returns the unsubscribe function. */
	subscribe(fn: (s: TrailHostSnapshot) => void): () => void
	/**
	 * The page takes over showing the journey (version 2): "Your journey" then asks it to open
	 * (`vg:trail-open`) instead of opening the guide's own sheet. Returns `release`, which gives the
	 * journey back (the journey closes, its preview goes, the guide's sheet works again), or null when
	 * another host holds it: one host at a time. A claim made while the sheet is open hands over to the host.
	 * A host that can fail calls `release` when it does.
	 */
	claim(): (() => void) | null
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
	/**
	 * Version 2: the asked questions about a destination (newest first; empty for one nothing was asked
	 * about, or an unknown id). With `questionId`, also asks that verified question of the destination,
	 * found across every step and the page map, as an ordinary guide turn (like `ask`).
	 */
	askAbout(destinationId: string, questionId?: string): (AskedQuestion & { stepId: string })[]
	/** Version 2: the verified questions of a destination in the guide's language, from every step and the page map; empty when none. */
	questionsFor(destinationId: string): { id: string; text: string; intent: string }[]
	allow(): void
	notNow(): void
	pause(): void
	resume(): void
	clear(): void
	clearAll(): void
	turnOff(): void
	/**
	 * Version 2, demo kit only: replaces the current journey (it is deleted) with a sample one. Only with
	 * consent granted, during a press on the page (`navigator.userActivation.isActive`), with the session's
	 * `demoKit` and on a page the trail records. Consent and recording are unchanged: the page the person is
	 * on becomes a new step after the sample. Local only; other tabs show it too. Never throws.
	 */
	seed(journey: SeedJourney): Promise<SeedResult>
	/** Version 2, demo kit only ("Reset demo"): every journey removed, consent back to unset in both copies, the offer shown again; other tabs follow. */
	reset(): Promise<SeedResult>
	/** The trail's localized words, so the host never hardcodes copy. */
	t(key: TrailKey, vars?: Record<string, string | number>): string
}
