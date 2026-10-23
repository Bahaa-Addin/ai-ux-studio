/**
 * A stand-in OpenAI-compatible model for page-agent, so the fallback agent path
 * runs end to end without network access. Policy: on the first step, click the
 * indexed element whose text and attributes best match the request; on the next
 * step, call `done`. It also records every request for assertions (masking).
 */
import http from 'node:http'

export interface MockLlm {
	url: string
	requests: any[]
	failNext: number
	close: () => Promise<void>
}

const STOP = new Set('the a an to as my me please for of on in and is it this that select choose pick click press tick اختار اختر دوس اضغط علي على في من ال'.split(' '))

function keywords(text: string): string[] {
	return text
		.toLowerCase()
		.split(/[^\p{L}\p{N}]+/u)
		.filter((w) => w.length >= 3 && !STOP.has(w))
}

function reply(args: unknown, promptChars: number) {
	return {
		id: `chatcmpl-mock-${Date.now()}`,
		object: 'chat.completion',
		model: 'mock-agent-1',
		choices: [{ index: 0, finish_reason: 'tool_calls', message: { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'AgentOutput', arguments: JSON.stringify(args) } }] } }],
		usage: { prompt_tokens: Math.ceil(promptChars / 4), completion_tokens: 42, total_tokens: Math.ceil(promptChars / 4) + 42 },
	}
}

export function decide(userPrompt: string) {
	const request = /<user_request>\n([\s\S]*?)\n<\/user_request>/.exec(userPrompt)?.[1] || ''
	const steps = (userPrompt.match(/<step_\d+>/g) || []).length
	const arabic = /[؀-ۿ]/.test(request)
	// Continued from an earlier page (the SDK injects what was already done): finish here.
	if (steps === 0 && /Steps already done:/.test(userPrompt)) {
		const here = /You are now on (\S+)/.exec(userPrompt)?.[1] || ''
		return { evaluation_previous_goal: 'Arrived after navigation', memory: 'Continued on a new page', next_goal: 'Finish', action: { done: { text: `Here it is: ${new URL(here).pathname}`, success: true } } }
	}
	if (steps >= 1) {
		const result = /Action Results: ([^\n]*)/.exec(userPrompt.split('</agent_history>')[0].split('<step_').at(-1) || '')?.[1] || ''
		const ok = /✅|Clicked|clicked/.test(result)
		return {
			evaluation_previous_goal: ok ? 'Success' : 'Failed',
			memory: 'Selected the option the user asked for.',
			next_goal: 'Finish',
			action: { done: { text: ok ? (arabic ? 'تمام، اخترتها لك.' : 'Done, I selected it for you.') : arabic ? 'مقدرتش ألاقيها.' : "I couldn't do that on this page.", success: ok } },
		}
	}
	const state = /<browser_state>([\s\S]*?)<\/browser_state>/.exec(userPrompt)?.[1] || ''
	const want = keywords(request)
	let best: { index: number; score: number } | null = null
	for (const line of state.split('\n')) {
		const m = /\*?\[(\d+)\]<([^>]*?)(?:>([^\n]*?))? \/>/.exec(line)
		if (!m) continue
		const hay = `${m[2]} ${m[3] || ''}`.toLowerCase()
		const score = want.filter((w) => hay.includes(w)).length
		// Ties go to the later (more specific) element: a label inside its fieldset.
		if (score > 0 && (!best || score >= best.score)) best = { index: Number(m[1]), score }
	}
	if (!best) return { evaluation_previous_goal: 'Start', memory: '', next_goal: 'Give up', action: { done: { text: arabic ? 'مش لاقي ده في الصفحة.' : "I couldn't find that on this page.", success: false } } }
	return { evaluation_previous_goal: 'Start', memory: `Request: ${request}`, next_goal: `Click element ${best.index}`, action: { click_element_by_index: { index: best.index } } }
}

export async function startMockLlm(): Promise<MockLlm> {
	const mock: MockLlm = { url: '', requests: [], failNext: 0, close: async () => {} }
	const server = http.createServer(async (req, res) => {
		let raw = ''
		for await (const c of req) raw += c
		const body = JSON.parse(raw || '{}')
		mock.requests.push({ headers: req.headers, body })
		if (mock.failNext > 0) {
			mock.failNext--
			res.writeHead(503, { 'Content-Type': 'application/json' })
			return res.end(JSON.stringify({ error: { message: 'overloaded' } }))
		}
		const user = [...(body.messages || [])].reverse().find((m: any) => m.role === 'user')?.content || ''
		res.writeHead(200, { 'Content-Type': 'application/json' })
		res.end(JSON.stringify(reply(decide(String(user)), raw.length)))
	})
	await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
	mock.url = `http://127.0.0.1:${(server.address() as any).port}/v1`
	mock.close = () => new Promise((r) => server.close(() => r()))
	return mock
}
