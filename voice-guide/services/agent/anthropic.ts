/**
 * Claude for the fallback agent (ADR-0054), through Anthropic's official SDK. page-agent speaks the
 * OpenAI chat-completions shape (tools, tool_calls, role "tool"); the proxy keeps that contract with
 * the page and translates here, in both directions, so nothing in the browser changes.
 *
 * - Forced tool choice ("required" or a named tool) is not accepted by current Claude models: it
 *   becomes tool_choice auto plus one system line that says which tool to call. One tool call per
 *   step (parallel_tool_calls: false) stays one (disable_parallel_tool_use).
 * - Effort is low by default (VG_LLM_EFFORT): a page step is a short decision, and people wait on it.
 * - The conversation prefix is cached (page-agent resends the whole history every step).
 * - A refusal comes back as finish_reason "content_filter", which page-agent reports as such; the
 *   server-side fallback ("default") answers with another model where the refusal category allows.
 */
import Anthropic from '@anthropic-ai/sdk'

export interface ClaudeCall {
	apiKey: string
	baseUrl?: string
	model: string
	effort: 'low' | 'medium' | 'high'
	timeoutMs: number
	fetch?: typeof fetch
}

type OpenAiMessage = { role: string; content?: unknown; tool_calls?: { id: string; function: { name: string; arguments: string } }[]; tool_call_id?: string }

const MAX_TOKENS = 16_000

function textOf(content: unknown): string {
	if (typeof content === 'string') return content
	if (Array.isArray(content)) return content.map((p) => (p && typeof p === 'object' && typeof (p as { text?: unknown }).text === 'string' ? (p as { text: string }).text : '')).join('')
	return ''
}

function userBlocks(content: unknown): Anthropic.ContentBlockParam[] {
	if (!Array.isArray(content)) return [{ type: 'text', text: textOf(content) || ' ' }]
	const out: Anthropic.ContentBlockParam[] = []
	for (const p of content as { type?: string; text?: string; image_url?: { url?: string } }[]) {
		if (p?.type === 'text' && p.text) out.push({ type: 'text', text: p.text })
		else if (p?.type === 'image_url' && p.image_url?.url) {
			const m = /^data:(image\/(?:png|jpeg|gif|webp));base64,(.+)$/.exec(p.image_url.url)
			if (m) out.push({ type: 'image', source: { type: 'base64', media_type: m[1] as 'image/png', data: m[2] } })
			else if (/^https:\/\//.test(p.image_url.url)) out.push({ type: 'image', source: { type: 'url', url: p.image_url.url } })
		}
	}
	return out.length ? out : [{ type: 'text', text: ' ' }]
}

/** The OpenAI-shaped request page-agent sends, as Messages API parameters. */
export function toClaudeRequest(body: Record<string, any>, c: Pick<ClaudeCall, 'model' | 'effort'>): Anthropic.MessageCreateParamsNonStreaming {
	const system: string[] = []
	const messages: Anthropic.MessageParam[] = []
	const push = (role: 'user' | 'assistant', blocks: Anthropic.ContentBlockParam[]) => {
		const last = messages.at(-1)
		if (last && last.role === role) (last.content as Anthropic.ContentBlockParam[]).push(...blocks)
		else messages.push({ role, content: blocks })
	}
	for (const m of (body.messages || []) as OpenAiMessage[]) {
		if (m.role === 'system' || m.role === 'developer') system.push(textOf(m.content))
		else if (m.role === 'user') push('user', userBlocks(m.content))
		else if (m.role === 'assistant') {
			const blocks: Anthropic.ContentBlockParam[] = []
			const text = textOf(m.content)
			if (text) blocks.push({ type: 'text', text })
			for (const call of m.tool_calls || []) {
				let input: unknown = {}
				try {
					input = JSON.parse(call.function.arguments || '{}')
				} catch {}
				blocks.push({ type: 'tool_use', id: call.id, name: call.function.name, input })
			}
			if (blocks.length) push('assistant', blocks)
		} else if (m.role === 'tool') push('user', [{ type: 'tool_result', tool_use_id: String(m.tool_call_id || ''), content: textOf(m.content) || ' ' }])
	}
	const tools: Anthropic.Tool[] = ((body.tools || []) as { function?: { name: string; description?: string; parameters?: Record<string, unknown> } }[])
		.filter((t) => t.function?.name)
		.map((t) => ({ name: t.function!.name, description: t.function!.description || '', input_schema: { type: 'object', ...(t.function!.parameters || {}) } as Anthropic.Tool.InputSchema }))
	const named = typeof body.tool_choice === 'object' ? body.tool_choice?.function?.name : undefined
	if (tools.length && (body.tool_choice === 'required' || named)) system.push(named ? `Answer by calling the ${named} tool. Do not answer in plain text.` : 'Answer by calling one of the tools. Do not answer in plain text.')
	return {
		model: c.model,
		max_tokens: Math.min(Number(body.max_tokens || body.max_completion_tokens) || MAX_TOKENS, MAX_TOKENS),
		...(system.length ? { system: system.join('\n\n') } : {}),
		messages,
		...(tools.length ? { tools, tool_choice: { type: 'auto', disable_parallel_tool_use: body.parallel_tool_calls === false } } : {}),
		output_config: { effort: c.effort },
		cache_control: { type: 'ephemeral' },
	}
}

/** Claude's reply in the chat-completions shape page-agent reads. */
export function toOpenAiResponse(m: Anthropic.Message): Record<string, unknown> {
	let text = ''
	const toolCalls: { id: string; type: 'function'; function: { name: string; arguments: string } }[] = []
	for (const b of m.content) {
		if (b.type === 'text') text += b.text
		else if (b.type === 'tool_use') toolCalls.push({ id: b.id, type: 'function', function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) } })
	}
	const finish = m.stop_reason === 'tool_use' ? 'tool_calls' : m.stop_reason === 'max_tokens' ? 'length' : m.stop_reason === 'refusal' ? 'content_filter' : toolCalls.length ? 'tool_calls' : 'stop'
	const u = m.usage
	const prompt = (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0)
	return {
		id: m.id,
		object: 'chat.completion',
		model: m.model,
		choices: [{ index: 0, message: { role: 'assistant', content: text || null, ...(toolCalls.length ? { tool_calls: toolCalls } : {}) }, finish_reason: finish }],
		usage: { prompt_tokens: prompt, completion_tokens: u.output_tokens || 0, total_tokens: prompt + (u.output_tokens || 0), cached_tokens: u.cache_read_input_tokens || 0 },
	}
}

/** One step; errors keep the API's status so the proxy can tell a retryable failure from a bad request. */
export async function claudeChat(body: Record<string, any>, c: ClaudeCall): Promise<{ status: number; json?: Record<string, unknown>; error?: string }> {
	const client = new Anthropic({ apiKey: c.apiKey, ...(c.baseUrl && c.baseUrl !== 'https://api.anthropic.com' ? { baseURL: c.baseUrl } : {}), timeout: c.timeoutMs, maxRetries: 1, ...(c.fetch ? { fetch: c.fetch } : {}) })
	try {
		// Server-side refusal fallback (beta): Anthropic answers with another model where the refusal
		// category allows, so a step is not lost to a false positive. The request is otherwise the
		// plain Messages one built above.
		const params = { ...toClaudeRequest(body, c), betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' }
		const msg = (await client.beta.messages.create(params as unknown as Anthropic.Beta.Messages.MessageCreateParamsNonStreaming)) as unknown as Anthropic.Message
		return { status: 200, json: toOpenAiResponse(msg) }
	} catch (e) {
		if (e instanceof Anthropic.APIError) return { status: e.status ?? 502, error: e.message }
		return { status: 0, error: (e as Error).message }
	}
}
