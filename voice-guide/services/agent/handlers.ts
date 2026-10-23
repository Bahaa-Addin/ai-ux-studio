/**
 * Agent proxy (ADR-0018): the only path from the browser to a large language
 * model. It holds the API keys, picks the model, masks personal data in page
 * content, enforces per-session and per-site budgets, falls back to a second
 * provider, and records every call for the X-ray panel and cost review.
 */
import type { PlatformConfig, SiteConfig } from '#shared/config.ts'
import { HttpError } from '#shared/http.ts'
import type { RpcContext } from '#shared/rpc.ts'
import type { Store } from '#shared/store/index.ts'
import type { Tracer } from '#shared/trace.ts'

export interface AgentDeps {
	platform: PlatformConfig
	store: Store
	sites: Map<string, SiteConfig>
	tracer: Tracer
	fetchImpl?: typeof fetch
}

interface Provider {
	name: 'primary' | 'fallback'
	baseUrl: string
	apiKey?: string
	model: string
}

/**
 * Masks personal data inside page content only (between <browser_state> tags),
 * so the person's own request ("type my number 0101...") still reaches the model.
 */
export function maskPageContent(text: string): { text: string; masked: number } {
	let masked = 0
	const mask = (s: string) =>
		s
			.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, () => (masked++, '[email]'))
			.replace(/(?<![\w\d])(?:\d[ -]?){13,19}(?![\w\d])/g, () => (masked++, '[card]'))
			.replace(/(?<![\w\d])(?:\+?20|0)1[0125]\d{8}(?![\w\d])/g, () => (masked++, '[phone]'))
			.replace(/(?<![\w\d])[٠-٩]{8,}(?![\w\d])/g, () => (masked++, '[number]'))
	const out = text.replace(/<browser_state>[\s\S]*?<\/browser_state>/g, (block) => mask(block))
	return { text: out, masked }
}

export function createAgentProxy(deps: AgentDeps) {
	const doFetch = deps.fetchImpl || fetch
	const providers = (): Provider[] => {
		const l = deps.platform.llm
		const out: Provider[] = []
		if (l.baseUrl && l.model) out.push({ name: 'primary', baseUrl: l.baseUrl, apiKey: l.apiKey, model: l.model })
		if (l.fallbackBaseUrl && l.fallbackModel) out.push({ name: 'fallback', baseUrl: l.fallbackBaseUrl, apiKey: l.fallbackApiKey, model: l.fallbackModel })
		return out
	}

	return {
		status() {
			const p = providers()
			return { available: p.length > 0, models: p.map((x) => `${x.name}:${x.model}`) }
		},

		/** OpenAI-compatible chat completion on behalf of one session's agent. */
		async chat(input: { siteId: string; sessionId: string; body: any }, ctx: RpcContext): Promise<any> {
			const site = deps.sites.get(input.siteId)
			if (!site?.agent.enabled) throw new HttpError(403, 'agent disabled for this site', 'agent_disabled')
			const list = providers()
			if (!list.length) throw new HttpError(503, 'no language model configured', 'agent_unavailable')

			const session = await deps.store.getSession(input.sessionId)
			if (!session || session.siteId !== input.siteId) throw new HttpError(404, 'session not found', 'no_session')
			const q = deps.platform.agentQuota
			if (session.usage.agentSteps >= q.stepsPerSession || session.usage.agentTokens >= q.tokensPerSession) {
				await deps.tracer.event(ctx.trace, 'agent.quota', { scope: 'session', usage: session.usage })
				throw new HttpError(429, 'agent budget for this session is used up', 'quota_session')
			}
			const day = new Date().toISOString().slice(0, 10)
			const siteScope = `agent-tokens:${input.siteId}:${day}`
			const siteUsed = await deps.store.addUsage(siteScope, 0)
			if (siteUsed >= q.tokensPerSiteDay) {
				await deps.tracer.event(ctx.trace, 'agent.quota', { scope: 'site', used: siteUsed })
				throw new HttpError(429, 'agent budget for this site is used up today', 'quota_site')
			}

			const body = { ...input.body }
			let masked = 0
			body.messages = (body.messages || []).map((m: any) => {
				if (typeof m.content !== 'string') return m
				const r = maskPageContent(m.content)
				masked += r.masked
				return { ...m, content: r.text }
			})
			delete body.stream

			let lastError = ''
			for (const p of list) {
				const t0 = performance.now()
				try {
					const res = await doFetch(`${p.baseUrl.replace(/\/$/, '')}/chat/completions`, {
						method: 'POST',
						headers: { 'Content-Type': 'application/json', ...(p.apiKey ? { Authorization: `Bearer ${p.apiKey}` } : {}) },
						body: JSON.stringify({ ...body, model: p.model }),
						signal: AbortSignal.timeout(deps.platform.llm.timeoutMs),
					})
					const text = await res.text()
					if (!res.ok) {
						lastError = `${p.name} ${res.status}: ${text.slice(0, 200)}`
						// Client errors are the request's fault; another provider will not help.
						if (res.status >= 400 && res.status < 500 && res.status !== 429 && res.status !== 408) break
						continue
					}
					const json = JSON.parse(text)
					const tokens = Number(json.usage?.total_tokens ?? 0)
					const usage = { agentSteps: session.usage.agentSteps + 1, agentTokens: session.usage.agentTokens + tokens }
					await deps.store.patchSession(session.id, { usage }, deps.platform.sessionTtlMin)
					await deps.store.addUsage(siteScope, tokens)
					await deps.tracer.event(
						ctx.trace,
						'agent.llm',
						{ provider: p.name, model: json.model || p.model, promptTokens: json.usage?.prompt_tokens, completionTokens: json.usage?.completion_tokens, masked, sessionUsage: usage },
						performance.now() - t0,
					)
					return json
				} catch (e) {
					lastError = `${p.name}: ${(e as Error).message}`
				}
			}
			await deps.tracer.event(ctx.trace, 'agent.llm.error', { error: lastError })
			throw new HttpError(502, `language model unavailable (${lastError})`, 'llm_failed')
		},
	}
}

export type AgentHandlers = ReturnType<typeof createAgentProxy>
