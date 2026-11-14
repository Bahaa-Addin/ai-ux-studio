/**
 * Local journey memory contracts, `vg-trail/v1` (ADR-0036 Layer A), and the page map the
 * knowledge service sends (`vg-experience-page/v1`). Everything read back from IndexedDB is
 * checked here before use: storage is the person's to clear or corrupt, never trusted.
 */
import { TRAIL_CONFIG } from './config.ts'

export const TRAIL_SCHEMA = 'vg-trail/v1' as const
const ASKED_MAX = TRAIL_CONFIG.storage.maxAskedPerStep

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

/**
 * What one answered question was about (ADR-0050 §5), from the plan's meta: the destination the guide
 * resolved, its page, the intent and a price-free label. Never the words said or typed, never the answer.
 */
export interface AskedQuestion {
	id: string
	at: number
	lang: Lang
	/** How it was asked, as the guide's request names it. */
	origin: 'voice' | 'typed' | 'chip'
	destinationId: string
	pageId?: string
	intent: string
	route: string
	label?: string
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
	/** What questions on this step were about, oldest first, at most `maxAskedPerStep` (ADR-0050 §5). Absent on older sessions. */
	asked?: AskedQuestion[]
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

const opt = (v: unknown) => v === undefined || str(v)

export function isAsked(v: unknown): v is AskedQuestion {
	if (!obj(v)) return false
	return str(v.id) && num(v.at) && str(v.lang) && (v.origin === 'voice' || v.origin === 'typed' || v.origin === 'chip') && str(v.destinationId) && !!v.destinationId && str(v.intent) && str(v.route) && opt(v.pageId) && opt(v.label)
}

/** Only the fields of an asked question, and only valid ones, at most the limit (the newest). */
export function cleanAsked(v: unknown, max: number): AskedQuestion[] {
	if (!Array.isArray(v)) return []
	return v.filter(isAsked).slice(-max).map(({ id, at, lang, origin, destinationId, pageId, intent, route, label }) => ({ id, at, lang, origin, destinationId, ...(pageId ? { pageId } : {}), intent, route, ...(label ? { label } : {}) }))
}

/** A session index read from storage, or null when it is not one of ours or is damaged. */
export function parseSession(v: unknown): TrailSession | null {
	if (!obj(v) || v.schema !== TRAIL_SCHEMA) return null
	if (!str(v.id) || !str(v.siteId) || !str(v.locale) || !num(v.startedAt) || !num(v.updatedAt) || !num(v.expiresAt) || !num(v.bytes)) return null
	if (!['recording', 'paused', 'stopped'].includes(v.recordingState as string) || !Array.isArray(v.steps)) return null
	// A step from before the asked questions has none; a damaged list keeps only the valid ones, nothing else.
	const steps = v.steps.filter(isStep).map((st) => {
		const { asked, ...rest } = st
		return asked === undefined ? st : { ...rest, asked: cleanAsked(asked, ASKED_MAX) }
	})
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
