/**
 * LLM presets for the fallback agent (ADR-0042): a preset is used only when asked for and no
 * model is configured, your own VG_LLM_* replaces it, and the proxy sends what the provider needs.
 */
import assert from 'node:assert/strict'
import path from 'node:path'
import { test } from 'node:test'

import { agentModelConfigured, loadPlatformConfig, loadSiteConfig, ROOT } from '#shared/config.ts'

import { createAgentProxy } from '../../services/agent/handlers.ts'
import { LLM_PRESETS } from '../../services/shared/llm-presets.ts'

test('no preset unless asked: tests and every other command have no agent model by default', () => {
	const p = loadPlatformConfig({} as NodeJS.ProcessEnv)
	assert.equal(p.llm.baseUrl, undefined)
	assert.equal(p.llm.preset, undefined)
	assert.equal(agentModelConfigured(p), false)
})

test("VG_LLM_PRESET=page-agent-testing fills the model with page-agent's testing API", () => {
	const p = loadPlatformConfig({ VG_LLM_PRESET: 'page-agent-testing' } as NodeJS.ProcessEnv)
	assert.equal(p.llm.baseUrl, 'https://page-ag-testing-ohftxirgbn.cn-shanghai.fcapp.run')
	assert.equal(p.llm.model, 'qwen3.5-plus')
	assert.equal(p.llm.preset, 'page-agent-testing')
	assert.deepEqual(p.llm.body, { enable_thinking: false })
	assert.equal(p.llm.sendOrigin, true)
	assert.equal(agentModelConfigured(p), true)
})

test('your own model replaces the preset', () => {
	const p = loadPlatformConfig({ VG_LLM_PRESET: 'page-agent-testing', VG_LLM_BASE_URL: 'https://llm.example/v1', VG_LLM_MODEL: 'own-model', VG_LLM_API_KEY: 'k' } as NodeJS.ProcessEnv)
	assert.equal(p.llm.baseUrl, 'https://llm.example/v1')
	assert.equal(p.llm.model, 'own-model')
	assert.equal(p.llm.preset, undefined)
	assert.equal(p.llm.body, undefined)
	assert.equal(p.llm.sendOrigin, undefined)
})

test('an unknown preset name is an error, not a silent "no agent"', () => {
	assert.throws(() => loadPlatformConfig({ VG_LLM_PRESET: 'nope' } as NodeJS.ProcessEnv), /Unknown VG_LLM_PRESET "nope"/)
})

test("the proxy adds the preset's body fields and the site's origin, and still masks page data", async () => {
	LLM_PRESETS['test-preset'] = { label: 'test', baseUrl: 'https://llm.test/v1', model: 'm-1', apiKey: 'NA', body: { enable_thinking: false }, sendOrigin: true, notice: '' }
	try {
		const platform = loadPlatformConfig({ VG_LLM_PRESET: 'test-preset' } as NodeJS.ProcessEnv)
		const site = loadSiteConfig(path.join(ROOT, 'config/sites/vodafone-eg.yaml'))
		const session = { id: 's1', siteId: site.id, usage: { agentSteps: 0, agentTokens: 0 } }
		const store = { getSession: async () => session, patchSession: async () => {}, addUsage: async () => 0 }
		const tracer = { event: async () => {} }
		const sent: { url: string; headers: Record<string, string>; body: any }[] = []
		const fetchImpl = (async (url: string, init: RequestInit) => {
			sent.push({ url, headers: init.headers as Record<string, string>, body: JSON.parse(init.body as string) })
			return new Response(JSON.stringify({ model: 'm-1', choices: [], usage: { total_tokens: 1 } }), { status: 200 })
		}) as unknown as typeof fetch
		const proxy = createAgentProxy({ platform, store: store as never, sites: new Map([[site.id, site]]), tracer: tracer as never, fetchImpl })
		await proxy.chat({ siteId: site.id, sessionId: 's1', body: { model: 'site-default', messages: [{ role: 'system', content: 'sys' }, { role: 'user', content: '<browser_state>call 01098765432</browser_state>' }] } }, { trace: {} as never })
		assert.equal(sent[0].url, 'https://llm.test/v1/chat/completions')
		assert.equal(sent[0].headers.Origin, 'https://web.vodafone.com.eg')
		assert.equal(sent[0].headers.Authorization, 'Bearer NA')
		assert.equal(sent[0].body.model, 'm-1')
		assert.equal(sent[0].body.enable_thinking, false)
		assert.equal(sent[0].body.messages[0].content, 'sys', 'the system prompt goes as page-agent wrote it')
		assert.ok(!sent[0].body.messages[1].content.includes('01098765432'), 'page data is still masked')
	} finally {
		delete LLM_PRESETS['test-preset']
	}
})
