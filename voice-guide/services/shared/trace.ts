/**
 * Turn tracing (ADR-0021). Every service records what it did for a turn as
 * trace events in the store; the X-ray panel streams them live and the pilot
 * analysis reads them later. The W3C traceparent header carries the trace id
 * between the SDK, the gateway and the services. Every attribute is cleaned on the way in
 * (`clean.ts`; AGENTS.md 4.3, 4.4): no personal data, no price or stock, no query value that can
 * name a person, whoever wrote the event.
 */
import { cleanAttrs } from './clean.ts'
import { newSpanId, newTraceId } from './ids.ts'
import { log } from './log.ts'
import type { Store, TraceEvent } from './store/index.ts'

export interface TraceContext {
	traceId: string
	spanId: string
	siteId: string
	sessionId: string
	turnId?: string
}

export function parseTraceparent(h: string | undefined): { traceId: string; spanId: string } | null {
	const m = /^00-([0-9a-f]{32})-([0-9a-f]{16})-[0-9a-f]{2}$/.exec(h || '')
	return m ? { traceId: m[1], spanId: m[2] } : null
}

export function traceparent(ctx: { traceId: string; spanId: string }): string {
	return `00-${ctx.traceId}-${ctx.spanId}-01`
}

export function newContext(base: { siteId: string; sessionId: string; turnId?: string }, parent?: string): TraceContext {
	const p = parseTraceparent(parent)
	return { traceId: p?.traceId || newTraceId(), spanId: newSpanId(), ...base }
}

/** Where an event holds the person's own words. */
const PERSONS_WORDS: Record<string, string[]> = { 'turn.received': ['utterance'], 'sdk.listen': ['text'] }

export class Tracer {
	readonly store: Store
	readonly service: string
	constructor(store: Store, service: string) {
		this.store = store
		this.service = service
	}

	async event(ctx: TraceContext, name: string, attrs: Record<string, unknown> = {}, durationMs?: number): Promise<void> {
		const ev: TraceEvent = {
			sessionId: ctx.sessionId,
			siteId: ctx.siteId,
			turnId: ctx.turnId,
			traceId: ctx.traceId,
			name,
			service: this.service,
			at: new Date().toISOString(),
			durationMs,
			// The request as heard keeps its own words' prices (they are the person's, not the page's): masked only.
			attrs: cleanAttrs(attrs, 300, PERSONS_WORDS[name] || []),
		}
		try {
			await this.store.appendTrace(ev)
		} catch (e) {
			// Tracing must never break a turn.
			log('warn', 'trace write failed', { name, error: (e as Error).message })
		}
	}

	/** Runs fn and records one event with its duration and any attrs it returns. */
	async span<T>(ctx: TraceContext, name: string, fn: () => Promise<T>, attrs: (r: T) => Record<string, unknown> = () => ({})): Promise<T> {
		const t0 = performance.now()
		try {
			const r = await fn()
			await this.event(ctx, name, attrs(r), performance.now() - t0)
			return r
		} catch (e) {
			await this.event(ctx, `${name}.error`, { error: (e as Error).message }, performance.now() - t0)
			throw e
		}
	}
}
