/**
 * Router service (ADR-0014, ADR-0015): one turn in, one validated plan out.
 * Stateless: the session comes in with the request and the patch goes back
 * out; the gateway writes it through the sessions service.
 */
import { Plan } from '#kb'
import { agentModelConfigured, type PlatformConfig, type SiteConfig } from '#shared/config.ts'
import { HttpError } from '#shared/http.ts'
import { newId } from '#shared/ids.ts'
import { type KbCache, type KbIndex } from '#shared/kb-index.ts'
import type { RpcContext } from '#shared/rpc.ts'
import type { Entity, SessionState, Turn } from '#shared/store/index.ts'
import type { Tracer } from '#shared/trace.ts'
import { termGroups, terms } from '#text'

import { CircuitBreaker, type Decider, SystemOneDecider } from './deciders.ts'
import { buildPlan } from './planner.ts'
import { type Understanding, understand } from './understand.ts'

export interface TurnInput {
	siteId: string
	session: SessionState
	utterance: string
	uiLang?: string
	page: { url: string }
}

export interface TurnOutput {
	turnId: string
	plan: Plan
	understanding: Omit<Understanding, 'candidates'> & { candidates: Understanding['candidates'] }
	turn: Turn
	last?: Entity
	kbVersion: string
}

export interface RouterDeps {
	platform: PlatformConfig
	sites: Map<string, SiteConfig>
	kb: KbCache
	tracer: Tracer
	/** Tests inject deciders; production builds them from site config. */
	deciderFor?: (site: SiteConfig) => Decider | undefined
}

export function createRouter(deps: RouterDeps) {
	const breakers = new Map<string, CircuitBreaker>()
	const deciders = new Map<string, Decider | undefined>()

	const deciderFor =
		deps.deciderFor ||
		((site: SiteConfig): Decider | undefined => {
			const p = deps.platform
			if (site.router.decider === 'jev' && p.jev.apiKey) return new SystemOneDecider({ name: 'jev', baseUrl: p.jev.baseUrl, apiKey: p.jev.apiKey, model: p.jev.model, timeoutMs: p.jev.timeoutMs })
			if (site.router.decider === 'laya' && p.laya.baseUrl) return new SystemOneDecider({ name: 'laya', baseUrl: p.laya.baseUrl, apiKey: p.laya.apiKey, timeoutMs: p.laya.timeoutMs })
			return undefined
		})

	return {
		async turn(input: TurnInput, ctx: RpcContext): Promise<TurnOutput> {
			const site = deps.sites.get(input.siteId)
			if (!site) throw new HttpError(404, `unknown site ${input.siteId}`, 'unknown_site')
			const kb = await deps.kb.get(site.id)
			if (!kb) throw new HttpError(503, `no active knowledge base for ${site.id}`, 'no_kb')
			const utterance = String(input.utterance || '').trim().slice(0, 500)
			if (!utterance) throw new HttpError(400, 'empty utterance', 'empty')
			if (!deciders.has(site.id)) deciders.set(site.id, deciderFor(site))
			const decider = deciders.get(site.id)
			if (decider && !breakers.has(decider.name)) breakers.set(decider.name, new CircuitBreaker())

			const turnId = ctx.trace.turnId || newId('turn', 9)
			const tctx = { ...ctx.trace, turnId }
			const pageId = kb.pageFor(input.page.url)?.pageId
			await deps.tracer.event(tctx, 'turn.received', { utterance, uiLang: input.uiLang, page: input.page.url, pageId, kbVersion: kb.versionId })

			// With no model behind the agent proxy, a turn sent to the agent can only fail (a 503 and
			// "I can't search right now"); the closest page or "not found" is the better answer.
			const agent = { ...site.agent, enabled: site.agent.enabled && agentModelConfigured(deps.platform) }
			const u = direct(utterance, kb, input) ?? (await understand({
				utterance,
				uiLang: input.uiLang,
				pageId,
				session: input.session,
				kb,
				settings: { ...site.router, agentEnabled: agent.enabled },
				decider,
				breaker: decider ? breakers.get(decider.name) : undefined,
			}))
			await deps.tracer.event(
				tctx,
				'router.understood',
				{
					lang: u.lang,
					intent: u.intent,
					intentSource: u.intentSource,
					flowId: u.flowId,
					select: u.select,
					route: u.route,
					usedContext: u.usedContext,
					destinationId: u.decision.destinationId,
					confidence: round(u.decision.confidence),
					provider: u.decision.provider,
					model: u.decision.model,
					deciderMs: round(u.decision.latencyMs),
					fallbackReason: u.decision.fallbackReason,
					candidates: u.candidates.slice(0, 5).map((c) => ({ id: c.id, score: round(c.score), absolute: round(c.absolute) })),
				},
				u.ms,
			)

			const t0 = performance.now()
			const { plan, last } = buildPlan({ u, utterance, session: input.session, kb, page: { url: input.page.url, pageId }, turnId, agent })
			const valid = Plan.safeParse(plan)
			if (!valid.success) {
				await deps.tracer.event(tctx, 'planner.invalid', { issues: valid.error.issues.slice(0, 5) })
				throw new HttpError(500, 'planner produced an invalid plan', 'bad_plan')
			}
			await deps.tracer.event(tctx, 'planner.plan', { route: plan.meta.route, steps: plan.steps.map((s) => s.op), say: plan.say }, performance.now() - t0)

			const turn: Turn = { id: turnId, utterance, lang: u.lang, intent: plan.meta.intent, route: plan.meta.route, destinationId: plan.meta.destinationId, at: new Date().toISOString() }
			if (plan.meta.route === 'clarify') turn.options = u.alternatives.map((a) => a.id)
			return { turnId, plan, understanding: u, turn, last, kbVersion: kb.versionId }
		},
	}
}

/**
 * Choices from a clarification skip retrieval: a tapped option ("#dest:<id>"), or an answer typed
 * or spoken that names one of the options ("400 mega" after "400 mega or ...?"). The answer keeps
 * the question's language and intent: a short Latin-script label must not switch an Arabic
 * conversation to the English pages.
 */
function direct(utterance: string, kb: KbIndex, input: TurnInput): Understanding | null {
	const prev = input.session.turns.at(-1)
	const id = /^#dest:(\S+)$/.exec(utterance)?.[1] ?? (prev?.route === 'clarify' ? answerTo(utterance, prev.options || [], kb) : undefined)
	if (!id || !kb.dest.has(id)) return null
	const lang = prev?.lang || input.uiLang || kb.manifest.site.defaultLanguage
	const [intent, flowId] = prev?.intent?.startsWith('flow:') ? (['flow', prev.intent.slice(5)] as const) : ([(prev?.intent as Understanding['intent']) || 'navigate', undefined] as const)
	return {
		lang,
		intent: intent === 'flow' || intent === 'watch' || intent === 'describe' ? intent : 'navigate',
		intentSource: 'default',
		flowId,
		refersBack: false,
		usedContext: true,
		query: '',
		candidates: [],
		alternatives: [],
		decision: { destinationId: id, confidence: 1, provider: 'user-choice', latencyMs: 0 },
		route: 'replay',
		ms: 0,
	}
}

/** The option an answer names: all of its words appear in one option's labels and in no other's. */
function answerTo(utterance: string, options: string[], kb: KbIndex): string | undefined {
	const said = termGroups(utterance, kb.synonyms)
	if (!said.length) return undefined
	const named = options.filter((id) => {
		const d = kb.dest.get(id)
		if (!d) return false
		const words = new Set(Object.values(d.labels).flat().flatMap((l) => terms(l, kb.synonyms)))
		return said.every((group) => group.some((t) => words.has(t)))
	})
	return named.length === 1 ? named[0] : undefined
}

const round = (n: number | undefined) => (n === undefined ? undefined : Math.round(n * 1000) / 1000)
