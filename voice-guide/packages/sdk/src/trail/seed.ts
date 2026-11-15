/**
 * A sample journey for the demo kit (ADR-0050 §6, live plan S15): the check `seed()` runs on what a page
 * hands it. The journey is the trail's own stored data (`SeedJourney` in host.ts), checked with the trail's
 * own parsers and limits; anything malformed, over a limit or of an unknown shape is refused as a whole.
 * What passes is a copy with new session, step and question ids and its times moved to end now. Nothing
 * here stores, renders or sends anything.
 */
import { TRAIL_CONFIG } from './config.ts'
import type { SeedJourney, SeedReason } from './host.ts'
import { decodeChunk } from './storage.ts'
import { isAsked, parseSession, type RawEvent, TRAIL_SCHEMA, type TrailSession, type TrailStepSummary } from './types.ts'

export interface SeedOptions {
	now: number
	/** The page's origin: every step of a sample journey is a page of this site. */
	origin: string
	siteId: string
	kbVersionId?: string
	retentionHours: number
	recordingState: TrailSession['recordingState']
	id(prefix: string): string
}

export type SeedCheck = { ok: false; reason: SeedReason } | { ok: true; session: TrailSession; chunks: { stepId: string; events: RawEvent[] }[] }

const cfg = TRAIL_CONFIG.storage
/** Any string of a sample journey's index (titles, ids, paths), not its replay. */
export const SEED_MAX_STRING = 500
const no = (reason: SeedReason): SeedCheck => ({ ok: false, reason })
const K = {
	seed: 'v session chunks',
	session: 'schema id siteId kbVersionId locale startedAt updatedAt expiresAt recordingState bytes steps',
	step: 'id sessionId type pageId canonicalPath title enteredAt leftAt firstEventAt durationMs bytes navigationCause boundary topDestinationIds explored replay asked',
	cause: 'kind sourceDestinationId sourceStepId targetPageId',
	item: 'destinationId pageId kind title context reason questions popular',
	asked: 'id at lang origin destinationId pageId intent route label',
	q: 'id text intent',
}
const obj = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v)
const only = (v: unknown, keys: string) => obj(v) && Object.keys(v).every((k) => keys.split(' ').includes(k))
const str = (v: unknown) => typeof v === 'string'
const opt = (v: unknown) => v === undefined || str(v)
const num = (v: unknown) => typeof v === 'number' && v >= 0
const i18n = (v: unknown) => obj(v) && Object.values(v).every(str)
const among = (v: unknown, list: string) => str(v) && list.split(' ').includes(v as string)

/** Plain data only: short strings, finite numbers, booleans, plain objects and short lists, no prototype keys. */
function plain(v: unknown, d: number): SeedReason | '' {
	if (str(v)) return (v as string).length > SEED_MAX_STRING ? 'too-big' : ''
	if (v === undefined || typeof v === 'boolean' || Number.isFinite(v)) return ''
	if (d > 8 || !v || typeof v !== 'object') return 'invalid'
	const list = Array.isArray(v)
	const keys = Object.keys(v)
	if (!list && (Object.getPrototypeOf(v) !== Object.prototype || keys.some((k) => ['__proto__', 'constructor', 'prototype'].includes(k)))) return 'invalid'
	if (keys.length > 50) return 'too-big'
	for (const k of keys) {
		const why = plain((v as Record<string, unknown>)[k], d + 1)
		if (why) return why
	}
	return ''
}

const item = (x: unknown) =>
	only(x, K.item) &&
	str((x as any).destinationId) && !!(x as any).destinationId && str((x as any).pageId) &&
	// A kind names an icon: never a name every object has (`constructor`, `toString`).
	/^[a-z][a-z0-9-]{0,39}$/.test((x as any).kind) && !((x as any).kind in {}) &&
	i18n((x as any).title) && i18n((x as any).context) && among((x as any).reason, 'explored returned opened') &&
	obj((x as any).questions) && Object.values((x as any).questions).every((l) => Array.isArray(l) && l.every((q) => only(q, K.q) && str(q.id) && str(q.text) && str(q.intent))) &&
	((x as any).popular === undefined || typeof (x as any).popular === 'boolean')

function stepOk(st: Record<string, any>, origin: string): boolean {
	const c = st.navigationCause
	let path = true
	try {
		path = st.canonicalPath === undefined || new URL(st.canonicalPath).origin === origin
	} catch {
		path = false
	}
	return (
		path && only(st, K.step) && only(c, K.cause) && among(c.kind, 'direct history spa destination') && [c.sourceDestinationId, c.sourceStepId, c.targetPageId, st.pageId, st.canonicalPath].every(opt) &&
		i18n(st.title) && among(st.replay, 'ok evicted none') && (st.type === 'boundary') === among(st.boundary, 'private cross-origin unsaved') &&
		num(st.enteredAt) && num(st.durationMs) && [st.leftAt, st.firstEventAt, st.bytes].every((n) => n === undefined || num(n)) && !(st.leftAt < st.enteredAt) &&
		st.topDestinationIds.every(str) && st.explored.every(item) && (st.asked === undefined || (Array.isArray(st.asked) && st.asked.every((q: unknown) => isAsked(q) && only(q, K.asked))))
	)
}

/**
 * Checks a sample journey and returns the copy to store, or why it is refused. The input is copied first
 * (`structuredClone`: no getters, functions or proxies, read once); the input object is never changed.
 */
export async function checkSeed(input: unknown, o: SeedOptions): Promise<SeedCheck> {
	let j: SeedJourney & Record<string, unknown>
	try {
		j = structuredClone(input) as typeof j
	} catch {
		return no('invalid')
	}
	if (!obj(j)) return no('invalid')
	if (j.v !== 1) return no('version')
	const s = j.session as unknown as Record<string, any>
	const chunks = j.chunks ?? {}
	const why = plain(s, 0) || (obj(chunks) ? plain(Object.keys(chunks), 0) : 'invalid')
	if (why) return no(why)
	if (!only(j, K.seed) || !only(s, K.session) || Object.getPrototypeOf(chunks) !== Object.prototype || Object.keys(chunks).includes('__proto__')) return no('invalid')
	const p = parseSession(s)
	if (!p || !s.steps.length || p.steps.length !== s.steps.length) return no('invalid')
	if (s.steps.length > cfg.maxSteps || s.steps.some((st: TrailStepSummary) => (st.asked?.length || 0) > cfg.maxAskedPerStep)) return no('too-big')
	const ids = new Map<string, string>()
	const times: number[] = []
	let prev = 0
	for (const st of s.steps as Record<string, any>[]) {
		if (ids.has(st.id) || !stepOk(st, o.origin) || st.enteredAt < prev) return no('invalid')
		prev = st.enteredAt
		ids.set(st.id, o.id('stp'))
		times.push(st.enteredAt, st.enteredAt + st.durationMs, st.leftAt ?? prev, st.firstEventAt ?? prev, ...(st.asked || []).map((q: { at: number }) => q.at))
	}
	const start = Math.min(...times)
	const end = Math.max(...times)
	if (end - start >= cfg.maxSessionMs) return no('too-long')
	// The journey ends now.
	const d = o.now - end
	const replays: { stepId: string; events: RawEvent[] }[] = []
	let total = 0
	for (const [stepId, data] of Object.entries(chunks)) {
		const st = s.steps.find((x: TrailStepSummary) => x.id === stepId)
		if (!st || st.type !== 'page' || !str(data) || /"__proto__"\s*:/.test(data)) return no('invalid')
		const size = data.length > cfg.chunkBytes ? Infinity : new Blob([data]).size
		if (size > cfg.chunkBytes || (total += size) > cfg.maxBytes) return no('too-big')
		let events: RawEvent[]
		try {
			// The trail's own check of a stored chunk; an event it would drop refuses the whole journey.
			events = await decodeChunk({ id: stepId, sessionId: s.id, stepId, seq: 0, t0: 0, t1: 0, bytes: size, enc: 'json', data })
			if (!events.length || JSON.parse(data).length !== events.length || events.some((e, i) => i && e.timestamp < events[i - 1].timestamp)) return no('invalid')
		} catch {
			return no('invalid')
		}
		if (events.at(-1)!.timestamp - events[0].timestamp > cfg.maxSessionMs) return no('too-long')
		replays.push({ stepId: ids.get(stepId)!, events: events.map((e) => ({ ...e, timestamp: e.timestamp + d })) })
	}
	const id = o.id('trs')
	const steps = (s.steps as TrailStepSummary[]).map((st) => {
		const c = st.navigationCause as Record<string, string | undefined>
		const out: TrailStepSummary = { ...st, id: ids.get(st.id)!, sessionId: id, enteredAt: st.enteredAt + d, replay: 'none', bytes: 0, navigationCause: { ...c, sourceStepId: c.sourceStepId && ids.get(c.sourceStepId) } as TrailStepSummary['navigationCause'] }
		if (st.leftAt !== undefined) out.leftAt = st.leftAt + d
		if (st.firstEventAt !== undefined) out.firstEventAt = st.firstEventAt + d
		if (st.asked) out.asked = st.asked.map((q) => ({ ...q, id: o.id('ask'), at: q.at + d }))
		return out
	})
	const session: TrailSession = { schema: TRAIL_SCHEMA, id, siteId: o.siteId, kbVersionId: o.kbVersionId, locale: String(s.locale).slice(0, 20), startedAt: start + d, updatedAt: o.now, expiresAt: o.now + o.retentionHours * 3_600_000, recordingState: o.recordingState, bytes: 0, steps }
	return { ok: true, session, chunks: replays }
}
