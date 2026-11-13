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
	await type(page, 'click on coverage for 01012345678')
	await page.waitForURL(`${WEB}/en/coverage.html`)
	await ready()
	await heard(page, /Here it is: \/en\/coverage\.html/, 20_000)
	const sid = await sessionId()
	// The second page's model still has the number the person said: kept in this tab, not on our server (AIXC-86).
	const resumed = llm.requests.map((r) => String([...(r.body.messages || [])].reverse().find((m: any) => m.role === 'user')?.content || '')).filter((c) => /Steps already done:/.test(c)).at(-1) || ''
	assert.match(/<user_request>\n([\s\S]*?)\n<\/user_request>/.exec(resumed)?.[1] || '', /01012345678/, 'the task on the next page is the person\'s own words')
	assert.equal(await page.evaluate(() => sessionStorage.getItem('vg.agent.task')), null, 'the tab forgets the task when it ends')
	assert.doesNotMatch(JSON.stringify(await p.store.listTrace(sid)), /01012345678/, 'no trace holds the number')
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

/**
 * A shop-like page of our own (no Vodafone code or copy), served by the test: a product card whose
 * centre lies on its icon-only cart button, a "Sort by price" button, a "quick view" button whose own
 * script presses the cart button, an Arabic "Buy now" link and a cookie-banner stand-in. Every press
 * is counted on window.__pressed.
 */
const SHOP = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Demo Telco | Phones</title>
<style>body{font:16px sans-serif;margin:40px} .card{position:relative;width:320px;height:200px;border:1px solid #ccc;border-radius:8px;padding:12px;cursor:pointer}
.card .cart{position:absolute;left:135px;top:75px;width:50px;height:50px} #onetrust-consent-sdk{position:fixed;left:16px;bottom:16px;background:#fff;border:1px solid #333;padding:12px}</style></head>
<body><h1>Phones</h1>
<button id="sort" onclick="window.__pressed.push('sort')">Sort by price</button>
<button id="quick" onclick="window.__pressed.push('quick');document.querySelector('.card .cart').click()">Galaxy quick view</button>
<div class="card" role="link" tabindex="0" onclick="window.__pressed.push('card')"><h3>Galaxy A55 phone card</h3>
<button type="button" class="cart" onclick="event.stopPropagation();window.__pressed.push('cart')"><img alt="cart" src="data:image/gif;base64,R0lGODlhAQABAAAAACw="></button></div>
<p><a href="#buy" onclick="window.__pressed.push('buy-ar')">اشتري الآن</a></p>
<div id="onetrust-consent-sdk"><p>We use cookies.</p><button id="onetrust-accept-btn-handler" onclick="window.__pressed.push('consent')">Accept All Cookies</button></div>
<script>window.__pressed = []</script>
</body></html>`

/** Puts the stand-in page in the fixture site for one test (the site server adds the guide's tag), and takes it away again. */
async function openShop(): Promise<() => void> {
	const file = path.join(ROOT, 'fixtures/sites/demo-telco/web/en/phones-standin.html')
	fs.writeFileSync(file, SHOP)
	await page.goto(`${WEB}/en/phones-standin.html`)
	await ready()
	return () => fs.rmSync(file, { force: true })
}
const pressed = () => page.evaluate(() => (window as any).__pressed as string[])
/** Where the guide's pointer is, and how far from the centre of `css`. */
const pointerOff = (css: string) =>
	page.evaluate((sel) => {
		const p = document.querySelector('vg-guide')!.shadowRoot!.querySelector('.pointer') as HTMLElement
		const r = document.querySelector(sel)!.getBoundingClientRect()
		return { on: p.classList.contains('on'), dx: Math.abs(parseFloat(p.style.left) - (r.left + r.width / 2)), dy: Math.abs(parseFloat(p.style.top) - (r.top + r.height / 2)) }
	}, css)

test('the agent never presses a commit control: its click on a card lands on the cart button, so it shows the person where to press instead (ADR-0058)', async () => {
	const removeShop = await openShop()
	try {
		await type(page, 'open the Galaxy A55 phone card')
		await heard(page, /add it to your cart\. Press it yourself/, 20_000)
		assert.deepEqual(await pressed(), [], 'nothing was pressed for the person: not the cart button, not the card')
		const s = await spotlit(page)
		assert.equal(s.on && s.commit, true, 'the cart button is highlighted as a commit control')
		const off = await pointerOff('.card .cart')
		assert.ok(off.on && off.dx <= 2 && off.dy <= 2, `the pointer rests on the cart button (${off.dx}, ${off.dy})`)
		const done = (await p.store.listTrace(await sessionId())).filter((e) => e.name === 'agent.done').at(-1)
		assert.equal(done?.attrs.guided, true, 'the task ended at the commit control, guided')
		// The model never saw the cart button, the cookie banner's button or the Arabic "Buy now" link.
		const state = /<browser_state>([\s\S]*?)<\/browser_state>/.exec(llm.requests.at(-1)!.body.messages[1].content)?.[1] || ''
		assert.doesNotMatch(state, /\[\d+\]<[^\n]*(cart|Accept All Cookies|اشتري الآن)/, 'commit controls are not among what it can press')
		assert.match(state, /\[\d+\]<div role=link>Galaxy A55 phone card/, 'the card itself is')
		const tools = JSON.stringify(llm.requests.at(-1)!.body.tools || '')
		assert.match(tools, /show_person_where/, 'it can show the person where to press')
		assert.doesNotMatch(tools, /execute_javascript/, 'no script runs on the page from the model')
	} finally {
		removeShop()
	}
})

test('asking to add something to the cart is a guided step, never an agent task; sorting stays the agent\'s (ADR-0058)', async () => {
	const removeShop = await openShop()
	try {
		const agentRuns = async () => (await p.store.listTrace(await sessionId())).filter((e) => e.name === 'agent.done').length
		const runs = await agentRuns()
		await type(page, 'add the Galaxy A55 to the cart')
		await heard(page, /Press it yourself when you are ready/, 15_000)
		assert.deepEqual(await pressed(), [], 'the cart button was not pressed')
		assert.equal(await agentRuns(), runs, 'no agent ran for it')
		const off = await pointerOff('.card .cart')
		assert.ok(off.on && off.dx <= 2 && off.dy <= 2, `the pointer rests on the cart button (${off.dx}, ${off.dy})`)
		await type(page, 'sort the phones by price')
		await page.waitForFunction(() => (window as any).__pressed.includes('sort'), null, { timeout: 20_000 })
		assert.deepEqual(await pressed(), ['sort'], 'a near miss stays clickable: only "Sort by price" was pressed')
	} finally {
		removeShop()
	}
})

test('while the agent runs, a click no person made never reaches a commit control: a button whose script presses the cart does not get through (ADR-0058)', async () => {
	const removeShop = await openShop()
	try {
		await type(page, 'show the galaxy quick view')
		await heard(page, /Done, I selected it/, 20_000)
		assert.deepEqual(await pressed(), ['quick'], 'the quick view opened; the cart button its script pressed did not')
		// The person's own press is theirs: a real click on the cart button gets through.
		await page.locator('.card .cart').click()
		assert.deepEqual(await pressed(), ['quick', 'cart'])
	} finally {
		removeShop()
	}
})

/** A stand-in page of our own at `rel` in the fixture site for one test, and its removal. Every press is counted on window.__pressed. */
async function standIn(rel: string, body: string): Promise<() => void> {
	const file = path.join(ROOT, 'fixtures/sites/demo-telco/web', rel)
	// The first folder this creates, if any, goes again with the page.
	const made = fs.mkdirSync(path.dirname(file), { recursive: true })
	fs.writeFileSync(file, `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Demo Telco | Stand-in</title><style>body{font:16px sans-serif;margin:40px} .card{position:relative;width:320px;height:200px;border:1px solid #ccc;border-radius:8px;padding:12px;margin:12px 0;cursor:pointer} .card .cart{position:absolute;left:135px;top:75px;width:50px;height:50px} #onetrust-consent-sdk{position:fixed;right:16px;bottom:16px;background:#fff;border:1px solid #333;padding:12px}</style></head><body>${body}<script>window.__pressed = []</script></body></html>`)
	await page.goto(`${WEB}/${rel.replace(/index\.html$/, '')}`)
	await ready()
	return () => fs.rmSync(made || file, { recursive: true, force: true })
}
const hush = () => page.evaluate(() => ((window as any).__spoken || []).splice(0))
const GIF = 'data:image/gif;base64,R0lGODlhAQABAAAAACw='
const card = (id: string, title: string, cart = `onclick="event.stopPropagation();window.__pressed.push('cart-${id}')"`) =>
	`<div class="card" id="card-${id}" role="link" tabindex="0" onclick="window.__pressed.push('card-${id}')"><h3>${title}</h3><button type="button" class="cart" id="cart-${id}" ${cart}><img alt="cart" src="${GIF}"></button></div>`

test('what the agent pressed reaches the trace masked, and a spotlight that read a value is traced as "read" (E3; AIXC-84)', async () => {
	const remove = await standIn('en/call-standin.html', `<h1>Contact</h1><button id="call" onclick="window.__pressed.push('call')">Call us on 010 1234 5678</button>`)
	try {
		await type(page, 'press the call us button')
		await heard(page, /Done, I selected it/, 20_000)
		assert.deepEqual(await pressed(), ['call'])
		const trace = await p.store.listTrace(await sessionId())
		const step = trace.filter((e) => e.name === 'agent.step' && /click_element_by_index/.test(String(e.attrs.action))).at(-1)
		assert.match(String(step?.attrs.goal || ''), /\[phone\]/, 'the label is masked in the browser')
		assert.doesNotMatch(JSON.stringify(trace), /1234 5678|01012345678/, 'no trace holds the number')
	} finally {
		remove()
	}
	await page.goto(`${WEB}/ar/index.html`)
	await ready()
	await type(page, 'إيه أرخص باقة نت؟')
	await page.waitForURL(`${WEB}/ar/bundles.html`)
	await ready()
	await heard(page, /أرخص واحدة/)
	// The step's event is sent after the line starts: wait for it rather than read the trace at once.
	let spots: { attrs: Record<string, unknown> }[] = []
	for (let i = 0; i < 50 && !spots.some((e) => e.attrs.detail === 'read'); i++) {
		spots = (await p.store.listTrace(await sessionId())).filter((e) => e.name === 'sdk.step' && e.attrs.op === 'spotlight')
		await page.waitForTimeout(100)
	}
	assert.ok(spots.some((e) => e.attrs.detail === 'read'), `what was read from the page is traced as "read" (${JSON.stringify(spots.map((e) => e.attrs.detail))})`)
	assert.ok(!spots.some((e) => /أرخص واحدة|\d/.test(String(e.attrs.detail))), 'never the words or numbers that were read')
})

test('below the fold the card is checked where page-agent will press it: a cart button that acts on pointer and mouse events is never pressed (AIXC-73)', async () => {
	const remove = await standIn('en/far-standin.html', `<h1>Phones</h1><div style="height:1600px"></div>${card('far', 'Galaxy far phone card', `onpointerdown="window.__pressed.push('cart:pointerdown')" onmousedown="window.__pressed.push('cart:mousedown')" onclick="event.stopPropagation();window.__pressed.push('cart:click')"`)}`)
	try {
		await type(page, 'open the Galaxy far phone card')
		await heard(page, /add it to your cart\. Press it yourself/, 20_000)
		assert.deepEqual(await pressed(), [], 'no pointer, mouse or click event reached the cart button, and the card was not pressed')
		const off = await pointerOff('#cart-far')
		assert.ok(off.on && off.dx <= 2 && off.dy <= 2, `the pointer rests on the cart button (${off.dx}, ${off.dy})`)
	} finally {
		remove()
	}
})

test('with several products the guide never points at the first cart button: it asks which one, and show_person_where points at the named item\'s own, never at the cookie banner (AIXC-74, 78)', async () => {
	const remove = await standIn('en/two-standin.html', `<h1>Phones</h1>${card('iphone', 'iPhone 15 phone card')}${card('galaxy', 'Galaxy A55 phone card')}<div id="onetrust-consent-sdk"><p>We use cookies.</p><button id="onetrust-pc-btn-handler" onclick="window.__pressed.push('consent-settings')">Cookie Settings</button><button id="onetrust-accept-btn-handler" onclick="window.__pressed.push('consent')">Accept All Cookies</button></div>`)
	try {
		// A commit request with no item chosen: the guide asks, and points at nothing.
		await type(page, 'add it to the cart')
		await heard(page, /There are several of these here\. Which one do you mean/, 15_000)
		assert.equal((await spotlit(page)).on, false, 'nothing is highlighted')
		assert.deepEqual(await pressed(), [])
		// The agent's own tool, at the item the person named: that item's cart button.
		await hush()
		await type(page, 'show me where to get the Galaxy A55')
		await heard(page, /add it to your cart\. Press it yourself/, 20_000)
		const off = await pointerOff('#cart-galaxy')
		assert.ok(off.on && off.dx <= 2 && off.dy <= 2, `the pointer rests on the Galaxy's cart button, not the iPhone's (${off.dx}, ${off.dy})`)
		// Escape ends the guided step.
		await page.keyboard.press('Escape')
		assert.equal((await spotlit(page)).on, false, 'Escape clears the highlight')
		// No item named and two cart buttons: the agent is told to ask; the cookie banner is never the answer.
		await hush()
		await type(page, 'show me where to start')
		await heard(page, /couldn't do that on this page/, 20_000)
		assert.equal((await spotlit(page)).on, false, 'not the cookie banner, not the first cart button')
		assert.deepEqual(await pressed(), [], 'nothing was pressed')
		// What the model can call, exactly (ADR-0058): no script tool, the guided step's own tool.
		const action = llm.requests.at(-1)!.body.tools[0].function.parameters.properties.action
		const names = (action.anyOf || action.oneOf).map((b: any) => Object.keys(b.properties)[0]).sort()
		assert.deepEqual(names, ['ask_user', 'click_element_by_index', 'done', 'input_text', 'scroll', 'scroll_horizontally', 'select_dropdown_option', 'show_person_where', 'wait'])
	} finally {
		remove()
	}
})

test('on the numbers page no number is chosen for the person: a request to pick one is a guided step, and the agent\'s press on a number is shown, not made (AIXC-70)', async () => {
	const remove = await standIn(
		'en/lines/red/numbers/index.html',
		`<h1>Pick your new number</h1><div class="red-number-card" role="button" onclick="window.__pressed.push('card')">010 1234 5678</div>
<p><label class="opt"><input type="radio" name="msisdn" value="01055556666" onclick="window.__pressed.push('radio-gold')"> Gold 010 5555 6666</label></p>
<button id="sl-lines-pool-choose-this-line-button" onclick="window.__pressed.push('choose')">Choose this line</button>`,
	)
	try {
		await type(page, 'I want the first number')
		await heard(page, /Pick the number you want, then press this button yourself/, 15_000)
		const off = await pointerOff('#sl-lines-pool-choose-this-line-button')
		assert.ok(off.on && off.dx <= 2 && off.dy <= 2, `the pointer rests on "Choose this line" (${off.dx}, ${off.dy})`)
		await hush()
		await type(page, 'open the gold')
		await heard(page, /Choose your number yourself, here/, 20_000)
		assert.deepEqual(await pressed(), [], 'no number card, radio or "Choose this line" was pressed')
		assert.equal(await page.evaluate(() => (document.querySelector('input[type=radio]') as HTMLInputElement).checked), false, 'the number is not chosen')
	} finally {
		remove()
	}
})

test('on a commit page the agent presses, types and selects nothing: each is shown to the person instead (ADR-0058; AIXC-78)', async () => {
	const remove = await standIn(
		'en/cart/index.html',
		`<h1>Your cart</h1><button id="apply" onclick="window.__pressed.push('apply')">Apply promo</button>
<p><label>Code <input id="promo" name="promo" placeholder="Promo code"></label></p>
<p><label>Delivery <select id="delivery" onchange="window.__pressed.push('delivery:' + this.value)"><option>Standard</option><option>Express</option></select></label></p>`,
	)
	try {
		await type(page, 'apply the promo')
		await heard(page, /This step is yours/, 20_000)
		await hush()
		await type(page, 'in the promo code field type SAVE10')
		await heard(page, /This step is yours/, 20_000)
		await hush()
		await type(page, 'select Express from the delivery list')
		await heard(page, /This step is yours/, 20_000)
		assert.deepEqual(await pressed(), [], 'nothing pressed')
		assert.equal(await page.inputValue('#promo'), '', 'nothing typed')
		assert.equal(await page.inputValue('#delivery'), 'Standard', 'nothing selected')
	} finally {
		remove()
	}
})
