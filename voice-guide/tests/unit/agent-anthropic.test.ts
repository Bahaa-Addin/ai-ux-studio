/**
 * Claude for the fallback agent (ADR-0054): page-agent's OpenAI-shaped steps become Messages API
 * requests and come back in the shape page-agent reads, through the official SDK with a fake fetch
 * (no network). Forced tool choice becomes "auto" plus a system line; one tool per step stays one.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { claudeChat, toClaudeRequest, toOpenAiResponse } from '#services/agent/anthropic.ts'
import { loadPlatformConfig } from '#shared/config.ts'

const STEP = {
	model: 'site-default',
	messages: [
		{ role: 'system', content: 'You are a web agent.' },
		{ role: 'user', content: 'Find the cheapest bundle. <browser_state>[1]<a>Bundles</a></browser_state>' },
		{ role: 'assistant', content: null, tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'AgentOutput', arguments: '{"action":{"click":{"index":1}}}' } }] },
		{ role: 'tool', tool_call_id: 'call_1', content: 'Clicked.' },
		{ role: 'user', content: 'Next step.' },
	],
	tools: [{ type: 'function', function: { name: 'AgentOutput', description: 'The next action', parameters: { type: 'object', properties: { action: { type: 'object' } }, required: ['action'] } } }],
	parallel_tool_calls: false,
	tool_choice: { type: 'function', function: { name: 'AgentOutput' } },
}

test('a page-agent step becomes a Messages request: system apart, tool calls and results paired, no forced tool choice', () => {
	const r = toClaudeRequest(STEP, { model: 'claude-opus-5-5', effort: 'low' })
	assert.equal(r.model, 'claude-opus-5-5')
	assert.match(String(r.system), /You are a web agent\./)
	assert.match(String(r.system), /calling the AgentOutput tool/)
	assert.deepEqual(r.tool_choice, { type: 'auto', disable_parallel_tool_use: true })
	assert.deepEqual(r.output_config, { effort: 'low' })
	assert.deepEqual(r.cache_control, { type: 'ephemeral' })
	assert.deepEqual(
		r.messages.map((m) => m.role),
		['user', 'assistant', 'user'],
	)
	const assistant = r.messages[1].content as any[]
	assert.deepEqual(assistant[0], { type: 'tool_use', id: 'call_1', name: 'AgentOutput', input: { action: { click: { index: 1 } } } })
	const user = r.messages[2].content as any[]
	assert.equal(user[0].type, 'tool_result')
	assert.equal(user[0].tool_use_id, 'call_1')
	assert.equal(user[1].text, 'Next step.')
	assert.equal((r.tools?.[0] as any).name, 'AgentOutput')
	assert.equal((r.tools?.[0] as any).input_schema.type, 'object')
})

test("Claude's tool call comes back as an OpenAI tool_calls reply, with usage counted", () => {
	const out = toOpenAiResponse({
		id: 'msg_1',
		type: 'message',
		role: 'assistant',
		model: 'claude-opus-5-5',
		content: [{ type: 'thinking', thinking: '', signature: 's' }, { type: 'tool_use', id: 'toolu_1', name: 'AgentOutput', input: { done: true } }],
		stop_reason: 'tool_use',
		usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 100, cache_creation_input_tokens: 0 },
	} as any) as any
	assert.equal(out.choices[0].finish_reason, 'tool_calls')
	assert.deepEqual(out.choices[0].message.tool_calls, [{ id: 'toolu_1', type: 'function', function: { name: 'AgentOutput', arguments: '{"done":true}' } }])
	assert.equal(out.usage.prompt_tokens, 110)
	assert.equal(out.usage.total_tokens, 115)
})

test('a refusal is a content filter to page-agent', () => {
	const out = toOpenAiResponse({ id: 'm', type: 'message', role: 'assistant', model: 'x', content: [], stop_reason: 'refusal', usage: { input_tokens: 1, output_tokens: 0 } } as any) as any
	assert.equal(out.choices[0].finish_reason, 'content_filter')
})

test('through the SDK: the key goes in its header, the reply is translated, an API error keeps its status', async () => {
	const seen: { url: string; headers: Headers; body: any }[] = []
	const ok = (async (url: string, init: RequestInit) => {
		seen.push({ url: String(url), headers: new Headers(init.headers), body: JSON.parse(String(init.body)) })
		return new Response(JSON.stringify({ id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [{ type: 'tool_use', id: 't1', name: 'AgentOutput', input: {} }], stop_reason: 'tool_use', stop_sequence: null, usage: { input_tokens: 3, output_tokens: 2 } }), { status: 200, headers: { 'content-type': 'application/json' } })
	}) as unknown as typeof fetch
	const r = await claudeChat(STEP, { apiKey: 'sk-test', model: 'claude-opus-5-5', effort: 'low', timeoutMs: 5000, fetch: ok })
	assert.equal(r.status, 200)
	assert.equal((r.json as any).choices[0].finish_reason, 'tool_calls')
	assert.match(seen[0].url, /\/v1\/messages/)
	assert.equal(seen[0].headers.get('authorization'), 'Bearer sk-test', 'SDK 1.x (API 2026-10-21) sends the key as a bearer token')
	assert.equal(seen[0].body.model, 'claude-opus-5-5')
	assert.equal(seen[0].body.fallbacks, 'default')
	const bad = (async () => new Response(JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: 'bad' } }), { status: 400, headers: { 'content-type': 'application/json' } })) as unknown as typeof fetch
	const e = await claudeChat(STEP, { apiKey: 'sk-test', model: 'claude-opus-5-5', effort: 'low', timeoutMs: 5000, fetch: bad })
	assert.equal(e.status, 400)
	assert.ok(!e.json)
})

test('VG_LLM_PROVIDER=anthropic: Claude Opus 5.5 by default, key from ANTHROPIC_API_KEY, no preset', () => {
	const p = loadPlatformConfig({ VG_LLM_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'k', VG_LLM_PRESET: 'page-agent-testing' } as NodeJS.ProcessEnv)
	assert.equal(p.llm.provider, 'anthropic')
	assert.equal(p.llm.model, 'claude-opus-5-5')
	assert.equal(p.llm.apiKey, 'k')
	assert.equal(p.llm.preset, undefined, 'the testing preset never fills in under our own model')
	assert.equal(p.llm.effort, 'low')
})
