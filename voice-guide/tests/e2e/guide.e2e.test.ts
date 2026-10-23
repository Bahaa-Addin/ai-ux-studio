/**
 * The demo flow, end to end, in a real Chromium on the fixture site (ADR-0006):
 * voice in Arabic, follow-up across pages, language switch, pictures, the web
 * app across origins, page watch, the agent fallback, the commit guard, X-ray.
 * Set VG_E2E_VIDEO=<dir> to record the run.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { after, before, test } from 'node:test'

import { type Browser, type BrowserContext, chromium, type Page } from 'playwright'

import { loadSiteConfig, ROOT } from '#shared/config.ts'

import { buildSdk } from '../../packages/sdk/build.ts'
import { startSiteServers } from '../../tools/site-server.ts'
import { type MockLlm, startMockLlm } from '../helpers/mock-llm.ts'
import { startPlatform, type TestPlatform } from '../helpers/platform.ts'
import { heard, SPEECH_STUB, speak, spotlit, type } from './browser.ts'

const WEB = 'http://localhost:4401'
const APP = 'http://localhost:4402'
let p: TestPlatform
let llm: MockLlm
let sites: { close: () => Promise<void> }
let browser: Browser
let ctx: BrowserContext
let page: Page

before(async () => {
	await buildSdk({ minify: true })
	llm = await startMockLlm()
	p = await startPlatform({ port: 4400, env: { VG_LLM_BASE_URL: llm.url, VG_LLM_MODEL: 'mock-agent-1', VG_PUBLIC_URL: 'http://localhost:4400' } })
	const site = loadSiteConfig(path.join(ROOT, 'config/sites/demo-telco.yaml'))
	sites = await startSiteServers(site, { gatewayUrl: 'http://localhost:4400' })
	browser = await chromium.launch()
	const video = process.env.VG_E2E_VIDEO
	ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, ...(video ? { recordVideo: { dir: video, size: { width: 1280, height: 800 } } } : {}) })
	await ctx.addInitScript(SPEECH_STUB)
	// The demo account is signed in before the demo (no real customer data).
	await ctx.addCookies([{ url: APP, name: 'demo_session', value: 'demo' }])
	await ctx.grantPermissions(['notifications'], { origin: WEB })
	page = await ctx.newPage()
	page.on('pageerror', (e) => console.log('[pageerror]', e.message))
})

after(async () => {
	await ctx?.close()
	await browser?.close()
	await sites?.close()
	await p?.close()
	await llm?.close()
})

const sessionId = () => page.evaluate(() => (window as any).voiceGuide?.session?.sessionId as string)
const ready = () => page.waitForFunction(() => !!(window as any).voiceGuide?.ui)

test('Arabic by voice: cheapest bundle on another page, spotlit and read aloud', async () => {
	await page.goto(`${WEB}/ar/index.html`)
	await ready()
	assert.equal(await speak(page, 'إيه أرخص باقة نت؟'), 'ar-EG', 'Egyptian Arabic recognition on an Arabic page')
	await page.waitForURL(`${WEB}/ar/bundles.html`)
	await ready()
	const line = await heard(page, /أرخص واحدة/)
	assert.match(line, /سوبر ١٠/)
	assert.match(line, /١٥٠ جنيه/)
	await page.waitForFunction(() => document.querySelector('vg-guide')!.shadowRoot!.querySelector('.spot.on'))
	assert.ok((await spotlit(page)).overlaps.includes('mi-10'))
	const dir = await page.evaluate(() => document.querySelector('vg-guide')!.shadowRoot!.querySelector('.root')!.getAttribute('dir'))
	assert.equal(dir, 'rtl')
	const xray = await page.evaluate(() => document.querySelector('vg-guide')!.shadowRoot!.querySelector('.xray')!.getBoundingClientRect().right)
	assert.ok(xray <= 0, `the closed X-ray drawer is off-screen on a right-to-left page (right edge ${xray})`)
	const log = await page.evaluate(() => [...document.querySelector('vg-guide')!.shadowRoot!.querySelectorAll('.msg.user')].map((m) => m.textContent))
	assert.deepEqual(log, ['إيه أرخص باقة نت؟'], 'the question asked on the previous page is still in the panel')
})

test('follow-up "subscribe to it" carries the bundle to checkout and never presses pay', async () => {
	const before = await sessionId()
	await type(page, 'أشترك فيها إزاي؟')
	await page.waitForURL(/\/ar\/subscribe\.html\?bundle=mi-10$/)
	await ready()
	assert.equal(await sessionId(), before, 'same session after the page load')
	await heard(page, /دوس.*بنفسك/)
	await page.waitForFunction(() => document.querySelector('vg-guide')!.shadowRoot!.querySelector('.spot.commit'))
	const s = await spotlit(page)
	assert.ok(s.commit)
	assert.ok(s.overlaps.includes('confirm-pay'))
	assert.match(await page.locator('#order-summary').innerText(), /سوبر ١٠/)
	await page.waitForTimeout(800)
	assert.equal(await page.locator('#order-status').isHidden(), true, 'the order was not placed')
})

test('switching to English mid-conversation: home internet behind a hidden tab', async () => {
	await type(page, 'cheapest home internet plan')
	await page.waitForURL(`${WEB}/en/bundles.html`)
	await ready()
	const line = await heard(page, /cheapest is/)
	assert.match(line, /Home Lite: 140 GB for 225 EGP/)
	assert.equal(await page.locator('#tab-home').getAttribute('aria-selected'), 'true', 'the tab was opened')
	assert.ok((await spotlit(page)).overlaps.includes('hi-140'))
	const dir = await page.evaluate(() => document.querySelector('vg-guide')!.shadowRoot!.querySelector('.root')!.getAttribute('dir'))
	assert.equal(dir, 'ltr')
})

test('reading a picture: the image-only banner is described from the knowledge base', async () => {
	await page.goto(`${WEB}/en/index.html`)
	await ready()
	await type(page, 'What does this banner say?')
	const line = await heard(page, /Double data weekend/)
	assert.match(line, /Thursday to Saturday/)
	await page.waitForFunction(() => document.querySelector('vg-guide')!.shadowRoot!.querySelector('.spot.on'))
})

test('into the web app on another origin: the session follows and the live balance is read', async () => {
	const before = await sessionId()
	await type(page, 'How much data do I have left?')
	await page.waitForURL(`${APP}/en/account.html`)
	await ready()
	assert.equal(await sessionId(), before, 'handoff kept the session across origins')
	assert.ok(!page.url().includes('vgh='), 'the handoff token is removed from the address bar')
	const line = await heard(page, /You have/)
	assert.equal(line, 'You have 7.5 GB left of 25 GB. It renews on 1 November.')
})

test('page watch: "tell me when this changes" notifies when the clone changes', async () => {
	const file = path.join(ROOT, 'fixtures/sites/demo-telco/web/en/offers.html')
	const original = fs.readFileSync(file, 'utf8')
	try {
		await page.goto(`${WEB}/en/offers.html`)
		await ready()
		await type(page, 'tell me when the weekend offer changes')
		const chip = page.locator('vg-guide').locator('.chip')
		await chip.waitFor()
		await chip.click()
		await heard(page, /I will tell you when "weekend offer" changes/, 15_000)
		const sid = await sessionId()
		const [w] = await p.store.listWatches({ sessionId: sid })
		assert.ok(w, 'watch stored')
		assert.match(w.lastText || '', /Double data/)
		fs.writeFileSync(file, original.replace('Double data on all mobile internet bundles', 'Triple data on all mobile internet bundles'))
		await p.store.updateWatch(w.id, { nextCheckAt: new Date(Date.now() - 1000).toISOString() })
		const tick = await (await fetch('http://localhost:4400/admin/watch/tick', { method: 'POST' })).json()
		assert.equal((tick as any).changed, 1)
		await page.waitForFunction(() => document.querySelector('vg-guide')!.shadowRoot!.querySelector('.toast.on'), null, { timeout: 10_000 })
		const toast = await page.evaluate(() => document.querySelector('vg-guide')!.shadowRoot!.querySelector('.toast')!.textContent)
		assert.match(toast || '', /Changed: weekend offer/i)
		assert.match(toast || '', /Triple data/)
		await page.reload()
		await ready()
		await page.waitForTimeout(800)
		const replayed = await page.evaluate(() => document.querySelector('vg-guide')!.shadowRoot!.querySelector('.toast.on'))
		assert.equal(replayed, null, 'a change is announced once, not again on the next page load')
	} finally {
		fs.writeFileSync(file, original)
	}
})

test('fallback agent: a page action the knowledge base cannot plan is done by page-agent through the proxy', async () => {
	await page.goto(`${WEB}/en/subscribe.html?bundle=mi-25`)
	await ready()
	const calls = llm.requests.length
	await type(page, 'select bank card as the payment method')
	await heard(page, /Done, I selected it/, 20_000)
	assert.equal(await page.locator('input[value="card"]').isChecked(), true)
	assert.ok(llm.requests.length - calls >= 2, 'one model call per agent step')
	const state = /<browser_state>([\s\S]*?)<\/browser_state>/.exec(llm.requests.at(-1)!.body.messages[1].content)?.[1] || ''
	assert.ok(!/\[\d+\]<button[^\n]*Confirm and pay/.test(state), 'the commit button has no index: the agent cannot click it')
	assert.ok(!/aria-label=X-ray|Type your question/.test(state), "the guide's own panel is invisible to the agent")
	assert.equal(await page.locator('#order-status').isHidden(), true)
	const names = (await p.store.listTrace(await sessionId())).map((e) => e.name)
	assert.ok(names.includes('agent.llm') && names.includes('agent.step') && names.includes('agent.done'))
})

test('fallback agent never types a password, even when the person says it (T-308)', async () => {
	await page.goto(`${APP}/en/login.html`)
	await ready()
	await page.locator('#password').fill('')
	await type(page, 'type my password in the password field: hunter2')
	await heard(page, /type it yourself|اكتبه إنت/i, 20_000)
	assert.equal(await page.locator('#password').inputValue(), '', 'nothing was typed')
	const sent = llm.requests.map((r) => JSON.stringify(r.body)).join('\n')
	assert.match(sent, /Refused: that is a password field/, 'the tool refused and told the model why')
})

test('fallback agent when the model is down: the person hears a short line in their language, not the error', async () => {
	await page.goto(`${WEB}/ar/subscribe.html?bundle=mi-25`)
	await ready()
	llm.failNext = 20 // every attempt, including page-agent's retries
	try {
		await type(page, 'اختار الدفع بالكارت')
		await heard(page, /مش قادر أدور دلوقتي/, 20_000)
		const spoken: string[] = await page.evaluate(() => (window as any).__spoken.map((s: any) => s.text))
		assert.ok(!spoken.some((s) => /error|503|overloaded|Invoke/i.test(s)), `no raw error is spoken: ${spoken.join(' | ')}`)
		const done = (await p.store.listTrace(await sessionId())).filter((e) => e.name === 'agent.done').at(-1)
		assert.equal(done?.attrs.success, false)
		assert.ok(String(done?.attrs.error || '').length > 0, 'the error is kept in the trace')
	} finally {
		llm.failNext = 0
	}
})

test('fallback agent across pages: a click that navigates, then the agent continues on the next page', async () => {
	await page.goto(`${WEB}/en/help.html`)
	await ready()
	await type(page, 'click on coverage')
	await page.waitForURL(`${WEB}/en/coverage.html`)
	await ready()
	await heard(page, /Here it is: \/en\/coverage\.html/, 20_000)
	const sid = await sessionId()
	const steps = (await p.store.listTrace(sid)).filter((e) => e.name === 'agent.step')
	assert.ok(steps.some((e) => /click_element_by_index/.test(String(e.attrs.action))), 'the first page clicked')
	assert.ok(steps.some((e) => e.attrs.action === 'done' && Number(e.attrs.step) >= 2), 'the second page continued the step count')
	// The agent's end is saved right after its last line is spoken: wait for it, briefly.
	let agent = (await p.store.getSession(sid))?.agent
	for (let i = 0; agent && i < 30; i++) {
		await page.waitForTimeout(100)
		agent = (await p.store.getSession(sid))?.agent
	}
	assert.equal(agent, null, 'agent state is cleared when the task ends')
})

test('a plan step that keeps resuming is stopped on the third page load (loop guard)', async () => {
	await page.goto(`${WEB}/en/offers.html`)
	await ready()
	const sid = await sessionId()
	await p.store.patchSession(sid, { plan: { turnId: 'turn_loop', steps: [{ op: 'say', text: 'This line must not be spoken.' }], cursor: 0, startedAt: new Date().toISOString() } }, 60)
	await page.evaluate(() => sessionStorage.setItem('vg:resume:turn_loop:0', '2'))
	await page.reload()
	await ready()
	await page.waitForTimeout(800)
	const spoken = await page.evaluate(() => (window as any).__spoken.map((s: any) => s.text))
	assert.ok(!spoken.includes('This line must not be spoken.'))
	assert.equal((await p.store.getSession(sid))?.plan, null, 'the looping plan is cleared')
})

test('X-ray shows every layer of each request from real traces', async () => {
	await page.locator('vg-guide').locator('.xraybtn').click()
	await page.waitForFunction(() => document.querySelector('vg-guide')!.shadowRoot!.querySelectorAll('.xray .turn').length >= 1)
	// Events arrive by stream after the page load; give the backlog a moment to land.
	await page
		.waitForFunction(() => /understand[\s\S]*mock-agent-1|mock-agent-1[\s\S]*understand/.test(document.querySelector('vg-guide')!.shadowRoot!.querySelector('.xray')!.textContent || ''), null, { timeout: 5000 })
		.catch(() => {})
	const text = await page.evaluate(() => document.querySelector('vg-guide')!.shadowRoot!.querySelector('.xray')!.textContent || '')
	assert.match(text, /understand/)
	assert.match(text, /mock-agent-1/, 'the agent turn shows its model calls')
	assert.match(text, /no LLM/)
	await page.waitForTimeout(300)
})

test('"stop" ends what the guide is doing, instantly', async () => {
	await page.locator('vg-guide').locator('.xraybtn').click()
	await type(page, 'stop')
	await heard(page, /Okay, stopped/)
	assert.equal((await spotlit(page)).on, false)
})
