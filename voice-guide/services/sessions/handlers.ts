/**
 * Sessions service (ADR-0016): conversation state, plan progress across page
 * loads, and single-use handoff tokens for crossing origins (website to web app).
 */
import type { Plan } from '#kb'
import type { PlatformConfig } from '#shared/config.ts'
import { HttpError } from '#shared/http.ts'
import { newId } from '#shared/ids.ts'
import type { RpcContext } from '#shared/rpc.ts'
import type { AgentState, Entity, SessionState, Store, Turn } from '#shared/store/index.ts'
import type { Tracer } from '#shared/trace.ts'

const MAX_TURNS = 20
const HANDOFF_TTL_SEC = 60

export interface SessionsDeps {
	platform: PlatformConfig
	store: Store
	tracer: Tracer
}

export function createSessions(deps: SessionsDeps) {
	const { store, platform } = deps
	const ttl = platform.sessionTtlMin

	async function mustGet(sessionId: string, siteId: string): Promise<SessionState> {
		const s = await store.getSession(sessionId)
		if (!s || s.siteId !== siteId) throw new HttpError(404, 'session not found', 'no_session')
		return s
	}

	return {
		/** Resume by id (same origin), by handoff token (other origin), or start fresh. */
		async start(input: { siteId: string; lang: string; sessionId?: string; handoff?: string }, ctx: RpcContext): Promise<{ session: SessionState; via: 'resumed' | 'handoff' | 'new' }> {
			if (input.handoff) {
				const id = await store.redeemHandoff(input.handoff)
				const s = id ? await store.getSession(id) : null
				if (s && s.siteId === input.siteId) {
					await deps.tracer.event({ ...ctx.trace, sessionId: s.id }, 'session.handoff', { from: 'token' })
					return { session: s, via: 'handoff' }
				}
			}
			if (input.sessionId) {
				const s = await store.getSession(input.sessionId)
				if (s && s.siteId === input.siteId) return { session: s, via: 'resumed' }
			}
			const now = new Date().toISOString()
			const session: SessionState = { id: newId('ses'), siteId: input.siteId, lang: input.lang, createdAt: now, updatedAt: now, turns: [], plan: null, agent: null, usage: { agentSteps: 0, agentTokens: 0 } }
			await store.putSession(session, ttl)
			await deps.tracer.event({ ...ctx.trace, sessionId: session.id }, 'session.start', { lang: input.lang })
			return { session, via: 'new' }
		},

		async get(input: { siteId: string; sessionId: string }): Promise<SessionState> {
			return mustGet(input.sessionId, input.siteId)
		},

		/** Records a turn and makes its plan the active one (cursor 0). */
		async applyTurn(input: { siteId: string; sessionId: string; turn: Turn; last?: Entity; plan: Plan }): Promise<SessionState> {
			const s = await mustGet(input.sessionId, input.siteId)
			const turns = [...s.turns, input.turn].slice(-MAX_TURNS)
			const runnable = input.plan.steps.length > 0
			const patch: Partial<SessionState> = {
				turns,
				lang: input.turn.lang,
				plan: runnable ? { turnId: input.turn.id, steps: input.plan.steps, cursor: 0, startedAt: new Date().toISOString() } : null,
				// A new request ends any agent run that was carried across pages.
				agent: null,
			}
			if (input.last) patch.last = input.last
			return (await store.patchSession(s.id, patch, ttl))!
		},

		/**
		 * The SDK reports progress through the active plan. `item` is what pickItem chose,
		 * so "subscribe to it" refers to the bundle the person actually saw.
		 */
		async progress(input: {
			siteId: string
			sessionId: string
			turnId: string
			cursor: number
			awaitingNavigation?: boolean
			done?: boolean
			item?: { collectionId: string; key?: string; name?: string }
		}): Promise<{ ok: boolean; stale?: boolean }> {
			const s = await mustGet(input.sessionId, input.siteId)
			if (!s.plan || s.plan.turnId !== input.turnId) return { ok: false, stale: true }
			const patch: Partial<SessionState> = {}
			if (input.done) patch.plan = null
			else patch.plan = { ...s.plan, cursor: input.cursor, awaitingNavigation: !!input.awaitingNavigation, itemKey: input.item?.key ?? s.plan.itemKey }
			if (input.item) {
				const destinationId = input.item.key ? `${input.item.collectionId}.${slugKey(input.item.key)}` : undefined
				patch.last = { kind: 'item', collectionId: input.item.collectionId, key: input.item.key, name: input.item.name, destinationId: destinationId ?? s.last?.destinationId, pageId: s.last?.pageId }
			}
			await store.patchSession(s.id, patch, ttl)
			return { ok: true }
		},

		async handoff(input: { siteId: string; sessionId: string }, ctx: RpcContext): Promise<{ token: string; ttlSec: number }> {
			const s = await mustGet(input.sessionId, input.siteId)
			const token = newId('hof', 18)
			await store.createHandoff(token, s.id, HANDOFF_TTL_SEC)
			await deps.tracer.event({ ...ctx.trace, sessionId: s.id }, 'session.handoff.issued', {})
			return { token, ttlSec: HANDOFF_TTL_SEC }
		},

		/** Carries a fallback agent's progress across page loads (ADR-0017). */
		async saveAgent(input: { siteId: string; sessionId: string; agent: AgentState | null }): Promise<{ ok: true }> {
			const s = await mustGet(input.sessionId, input.siteId)
			const agent = input.agent ? { ...input.agent, history: (input.agent.history || []).slice(-30) } : null
			await store.patchSession(s.id, { agent }, ttl)
			return { ok: true }
		},

		async addUsage(input: { siteId: string; sessionId: string; steps: number; tokens: number }): Promise<{ agentSteps: number; agentTokens: number }> {
			const s = await mustGet(input.sessionId, input.siteId)
			const usage = { agentSteps: s.usage.agentSteps + input.steps, agentTokens: s.usage.agentTokens + input.tokens }
			await store.patchSession(s.id, { usage }, ttl)
			return usage
		},
	}
}

/** Same rule as the KB builder uses for item destination ids. */
function slugKey(k: string): string {
	return k
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[^\p{L}\p{N}]+/gu, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 40)
		.replace(/[^a-z0-9-]/g, '')
}

export type SessionsHandlers = ReturnType<typeof createSessions>
