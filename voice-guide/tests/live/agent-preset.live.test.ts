/**
 * Live check of the fallback agent's default demo model (ADR-0042): page-agent in the page, our
 * agent proxy (masking, quota, traces), page-agent's free testing API. Runs only with VG_LIVE=1
 * because it calls a real model over the internet; on the offline fixture site, no Vodafone data.
 *
 *   VG_LIVE=1 node --test tests/live/agent-preset.live.test.ts
 */
import assert from 'node:assert/strict'
import path from 'node:path'
import { after, before, test } from 'node:test'

import { type Browser, chromium, type Page } from 'playwright'

import { loadSiteConfig, ROOT } from '#shared/config.ts'

import { buildSdk } from '../../packages/sdk/build.ts'
import { startSiteServers } from '../../tools/site-server.ts'
import { heard, SPEECH_STUB, type } from '../e2e/browser.ts'
import { startPlatform, type TestPlatform } from '../helpers/platform.ts'

const LIVE = process.env.VG_LIVE === '1'
const WEB = 'http://localhost:4401'
let p: TestPlatform
let sites: { close: () => Promise<void> }
let browser: Browser
let page: Page

before(async () => {
	if (!LIVE) return
	await buildSdk({ minify: true })
	p = await startPlatform({ port: 4400, env: { VG_LLM_PRESET: 'page-agent-testing', VG_PUBLIC_URL: 'http://localhost:4400' } })
	sites = await startSiteServers(loadSiteConfig(path.join(ROOT, 'config/sites/demo-telco.yaml')), { gatewayUrl: 'http://localhost:4400' })
	browser = await chromium.launch()
	const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
	await ctx.addInitScript(SPEECH_STUB)
	page = await ctx.newPage()
})

after(async () => {
	await browser?.close()
	await sites?.close()
	await p?.close()
})

test("page-agent's testing API runs a fallback-agent task through our proxy", { skip: !LIVE && 'set VG_LIVE=1' }, async () => {
	await page.goto(`${WEB}/en/subscribe.html?bundle=mi-25`)
	await page.waitForFunction(() => !!(window as any).voiceGuide?.ui)
	const t0 = Date.now()
	await type(page, 'select bank card as the payment method')
	await heard(page, /./, 120_000)
	await page.waitForFunction(() => document.querySelector<HTMLInputElement>('input[value="card"]')?.checked, null, { timeout: 120_000 })
	const sessionId = await page.evaluate(() => (window as any).voiceGuide.session.sessionId as string)
	const trace = await p.store.listTrace(sessionId)
	const calls = trace.filter((e) => e.name === 'agent.llm')
	const errors = trace.filter((e) => e.name === 'agent.llm.error')
	console.log(`# ${calls.length} model calls (${calls.map((e) => `${e.attrs.model} ${Math.round(e.durationMs ?? 0)} ms`).join(', ')}), ${errors.length} errors, ${Date.now() - t0} ms in all`)
	assert.equal(errors.length, 0, JSON.stringify(errors.map((e) => e.attrs)))
	assert.ok(calls.length >= 1)
	assert.ok(calls.every((e) => String(e.attrs.model).startsWith('qwen')), 'answered by the preset model')
	assert.equal(await page.locator('#order-status').isHidden(), true, 'nothing was confirmed')
})
