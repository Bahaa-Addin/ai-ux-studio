/**
 * Local journey memory contracts, `vg-trail/v1` (ADR-0036 Layer A), and the page map the
 * knowledge service sends (`vg-experience-page/v1`). Everything read back from IndexedDB is
 * checked here before use: storage is the person's to clear or corrupt, never trusted.
 */

export const TRAIL_SCHEMA = 'vg-trail/v1' as const

export type Lang = string
export type I18n = Record<Lang, string>

export type NavigationCause =
	| { kind: 'direct' }
	| { kind: 'history' }
	| { kind: 'spa' }
	| { kind: 'destination'; sourceDestinationId?: string; sourceStepId?: string; targetPageId?: string }

/** What a person explored on a step, as the timeline shows it (public knowledge only). */
export interface ExploredItem {
	destinationId: string
	pageId: string
	kind: string
	title: I18n
	context: I18n
	reason: 'explored' | 'returned' | 'opened'
	questions: Record<Lang, { id: string; text: string; intent: string }[]>
	popular?: boolean
}

export interface TrailStepSummary {
	id: string
	sessionId: string
	/** `page`: a recorded public page; `boundary`: the journey left the public area or the origin. */
	type: 'page' | 'boundary'
	pageId?: string
	/** Origin and path, never the query or hash; absent on private boundaries. */
	canonicalPath?: string
	title: I18n
	enteredAt: number
	leftAt?: number
	/** Timestamp of the step's first recorded event: the slider's zero. */
	firstEventAt?: number
	/** Recorded milliseconds of replay (the slider's length). */
	durationMs: number
	/** Stored replay bytes, kept here so the storage budget is checked without reading any chunk. */
	bytes?: number
	navigationCause: NavigationCause
	/** `unsaved`: a public page of the site that opts out of journeys (`<meta name="vg-trail" content="off">`), named but never saved. */
	boundary?: 'private' | 'cross-origin' | 'unsaved'
	topDestinationIds: string[]
	explored: ExploredItem[]
	/** Replay is gone (evicted for space, or corrupt): the step stays, without a preview. */
	replay: 'ok' | 'evicted' | 'none'
}

export interface TrailSession {
	schema: typeof TRAIL_SCHEMA
	id: string
	siteId: string
	kbVersionId?: string
	locale: Lang
	startedAt: number
	updatedAt: number
	expiresAt: number
	recordingState: 'recording' | 'paused' | 'stopped'
	bytes: number
	steps: TrailStepSummary[]
}

export interface ReplayChunk {
	id: string
	sessionId: string
	stepId: string
	seq: number
	t0: number
	t1: number
	bytes: number
	enc: 'gzip' | 'json'
	data: Blob | string
}

export interface ElementInterest {
	stepId: string
	/** `dest:<id>` for knowledge destinations, `fp:<hash>` for local-only fingerprints. */
	key: string
	pageId?: string
	destinationId?: string
	/** Never uploaded, never shown, never canonical (SPEC-06 §4). */
	localFingerprint?: string
	visibleDwellMs: number
	engagedHoverMs: number
	focusMs: number
	focusCount: number
	revisitCount: number
	activationCount: number
	revealCount: number
	passThroughCount: number
	deliberate: boolean
	score: number
	lastEngagedAt: number
}

// ---- the knowledge service's page map (GET /v1/experience) ----

export interface PageMapDestination {
	id: string
	kind: string
	css: string[]
	title: I18n
	context: I18n
	topic: string
	collectionId?: string
	key?: string
	questions: Record<Lang, { id: string; text: string; intent: string }[]>
	popular?: boolean
}

export interface PageMapPage {
	id: string
	kind: string
	eligible: boolean
	title: I18n
	paths: string[]
	questions: Record<Lang, { id: string; text: string; intent: string }[]>
}

export interface PageMap {
	standard: 'vg-experience-page/v1'
	siteId: string
	kbVersionId: string | null
	profileId: string | null
	keepQuery: string[]
	page: { id: string; kind: string; eligible: boolean; title: I18n } | null
	destinations: PageMapDestination[]
	collections: { id: string; itemCss: string; keyAttr?: string }[]
	pages: PageMapPage[]
}

// ---- runtime checks ----

const str = (v: unknown): v is string => typeof v === 'string'
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

function isStep(v: unknown): v is TrailStepSummary {
	if (!obj(v)) return false
	return str(v.id) && str(v.sessionId) && (v.type === 'page' || v.type === 'boundary') && num(v.enteredAt) && num(v.durationMs) && obj(v.navigationCause) && obj(v.title) && Array.isArray(v.explored) && Array.isArray(v.topDestinationIds)
}

/** A session index read from storage, or null when it is not one of ours or is damaged. */
export function parseSession(v: unknown): TrailSession | null {
	if (!obj(v) || v.schema !== TRAIL_SCHEMA) return null
	if (!str(v.id) || !str(v.siteId) || !str(v.locale) || !num(v.startedAt) || !num(v.updatedAt) || !num(v.expiresAt) || !num(v.bytes)) return null
	if (!['recording', 'paused', 'stopped'].includes(v.recordingState as string) || !Array.isArray(v.steps)) return null
	const steps = v.steps.filter(isStep)
	return { ...(v as unknown as TrailSession), steps }
}

export function isChunk(v: unknown): v is ReplayChunk {
	if (!obj(v)) return false
	return str(v.id) && str(v.sessionId) && str(v.stepId) && num(v.seq) && num(v.t0) && num(v.t1) && num(v.bytes) && (v.enc === 'gzip' || v.enc === 'json') && (str(v.data) || (typeof Blob !== 'undefined' && v.data instanceof Blob))
}

/** A recorded event as the replayer needs it at least: a type and a time. Anything else is dropped. */
export interface RawEvent {
	type: number
	timestamp: number
	data?: unknown
	[k: string]: unknown
}

export function isEvent(v: unknown): v is RawEvent {
	return obj(v) && Number.isInteger(v.type) && (v.type as number) >= 0 && (v.type as number) <= 6 && num(v.timestamp)
}
