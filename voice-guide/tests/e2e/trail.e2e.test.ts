/**
 * Exploration Trail end to end (SPEC-06 §11) in Chromium on the fixture site, with the real SDK,
 * gateway, services, Postgres and an experience profile built from the fixture knowledge base.
 * No model is configured, so the page agent is unavailable throughout: every chip must be answered
 * by the deterministic router. Speech synthesis is recorded at the browser boundary (ADR-0024).
 */
import assert from 'node:assert/strict'
import path from 'node:path'
import { after, before, test } from 'node:test'

import { type Browser, type BrowserContext, chromium, type Page } from 'playwright'

import { buildExperienceProfile } from '#jobs/experience/build.ts'
import { loadSiteConfig, ROOT } from '#shared/config.ts'

import { buildSdk } from '../../packages/sdk/build.ts'
import { startSiteServers } from '../../tools/site-server.ts'
import { fixtureManifest } from '../helpers/kb.ts'
import { startPlatform, type TestPlatform } from '../helpers/platform.ts'
import { SPEECH_STUB, spotlit } from './browser.ts'

const WEB = 'http://localhost:4401'
const APP = 'http://localhost:4402'
let p: TestPlatform
let sites: { close: () => Promise<void> }
let browser: Browser
let profileId = ''

before(async () => {
	await buildSdk({ minify: true })
	p = await startPlatform({ port: 4400, env: { VG_PUBLIC_URL: 'http://localhost:4400', VG_RATE_TURNS_PER_MIN: '600', VG_RATE_BURST: '60' } })
	const site = loadSiteConfig(path.join(ROOT, 'config/sites/demo-telco.yaml'))
	const { profile } = await buildExperienceProfile({ manifest: fixtureManifest(), site })
	await p.store.putExperienceProfile(site.id, profile)
	await p.store.activateExperienceProfile(site.id, profile.id)
	profileId = profile.id
	sites = await startSiteServers(site, { gatewayUrl: 'http://localhost:4400' })
	browser = await chromium.launch()
})

after(async () => {
	await browser?.close()
	await sites?.close()
	await p?.close()
})

/** Counts reads of replay chunks by step, so a test can prove one step loads only its own. */
const STEP_READS = `(() => {
	const orig = IDBIndex.prototype.getAll
	IDBIndex.prototype.getAll = function (q, ...rest) {
		if (this.name === 'step' && this.objectStore.name === 'chunks') (window.__stepReads = window.__stepReads || []).push(q instanceof IDBKeyRange ? q.lower : q)
		return orig.call(this, q, ...rest)
	}
})();`
/** Consent already given on the website's origin (each origin asks for its own). */
const CONSENTED = `if (location.origin === '${WEB}' && !localStorage.getItem('vg-trail:pk_demo_telco:consent')) localStorage.setItem('vg-trail:pk_demo_telco:consent', JSON.stringify({ v: 1, state: 'granted', at: 1, retentionHours: 24 }));`

interface Ctx {
	ctx: BrowserContext
	page: Page
	requests: { url: string; body: string }[]
}

async function open(opts: { consented?: boolean; mobile?: boolean; reducedMotion?: boolean; noSpeech?: boolean; init?: string[]; lang?: 'en' | 'ar'; start?: string } = {}): Promise<Ctx> {
	const ctx = await browser.newContext({
		...(opts.mobile ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } : { viewport: { width: 1280, height: 800 } }),
		reducedMotion: opts.reducedMotion ? 'reduce' : 'no-preference',
	})
	if (!opts.noSpeech) await ctx.addInitScript(SPEECH_STUB)
	else await ctx.addInitScript(() => {
		delete (window as any).speechSynthesis
		;(window as any).SpeechSynthesisUtterance = undefined
	})
	await ctx.addInitScript(STEP_READS)
	if (opts.consented) await ctx.addInitScript(CONSENTED)
	for (const s of opts.init || []) await ctx.addInitScript(s)
	const requests: Ctx['requests'] = []
	ctx.on('request', (r) => requests.push({ url: r.url(), body: r.postData() || '' }))
	const page = await ctx.newPage()
	page.on('pageerror', (e) => console.log('[pageerror]', e.message))
	if (process.env.VG_TRAIL_DEBUG) page.on('console', (m) => console.log('[console]', m.type(), m.text()))
	await page.goto(`${WEB}${opts.start || `/${opts.lang || 'en'}/offers.html`}`)
	await pill(page)
	return { ctx, page, requests }
}

const pill = (page: Page) => page.locator('vg-guide').locator('.tr-pill').waitFor({ timeout: 15_000 })
const tr = (page: Page, sel: string) => page.locator('vg-guide').locator(sel)
const state = (page: Page) => page.evaluate(() => ({ ...(document.querySelector('vg-guide')!.shadowRoot!.querySelector('.tr') as HTMLElement).dataset }))
const until = (page: Page, fn: string, timeout = 10_000) => page.waitForFunction(fn, null, { timeout })
const recording = (page: Page) => until(page, `document.querySelector('vg-guide')?.shadowRoot?.querySelector('.tr')?.dataset.rec === 'recording'`)

/** Everything the trail keeps in this origin's IndexedDB, with chunks decompressed. */
function readTrail(page: Page) {
	return page.evaluate(async () => {
		if (!(await indexedDB.databases()).some((d) => d.name === 'vg-trail-v1')) return { exists: false, sessions: [] as any[], chunks: [] as { stepId: string; seq: number; text: string }[], interest: [] as any[] }
		const db = await new Promise<IDBDatabase>((res, rej) => {
			const r = indexedDB.open('vg-trail-v1')
			r.onsuccess = () => res(r.result)
			r.onerror = () => rej(r.error)
		})
		const all = (name: string) =>
			new Promise<any[]>((res) => {
				const r = db.transaction(name).objectStore(name).getAll()
				r.onsuccess = () => res(r.result)
			})
		const [sessions, chunks, interest] = [await all('sessions'), await all('chunks'), await all('interest')]
		db.close()
		const text = async (c: any) => {
			try {
				return c.enc === 'gzip' ? await new Response((c.data as Blob).stream().pipeThrough(new DecompressionStream('gzip'))).text() : String(c.data)
			} catch {
				return '<corrupt>'
			}
		}
		return { exists: true, sessions, chunks: await Promise.all(chunks.map(async (c: any) => ({ stepId: c.stepId, seq: c.seq, text: await text(c) }))), interest }
	})
}

async function hover(page: Page, sel: string, ms: number) {
	const b = (await page.locator(sel).boundingBox())!
	await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 6 })
	await page.waitForTimeout(ms)
}

/** Offers → (linger, return) → the weekend offer's call to action → bundles (explore, open the Home tab). */
async function explore(page: Page, lang = 'en') {
	await hover(page, '#weekend-offer', 1400)
	await hover(page, '#roaming-offer', 900)
	await hover(page, '#students-offer', 1800)
	await hover(page, '#roaming-offer', 1200)
	await hover(page, '#weekend-offer', 1000)
	await page.locator('#weekend-offer a.btn').click()
	await page.waitForURL(`**/${lang}/bundles.html`)
	await pill(page)
	await recording(page)
	await hover(page, '[data-bundle="mi-25"]', 1300)
	await hover(page, '[data-bundle="mi-10"]', 900)
	await hover(page, 'h1', 1700)
	await hover(page, '[data-bundle="mi-25"]', 1200)
	await page.locator('#tab-home').click()
	await hover(page, '[data-bundle="hi-140"]', 1200)
	await page.waitForTimeout(2500) // the 2 s flush
}

const explored = (page: Page) => page.evaluate(() => [...document.querySelector('vg-guide')!.shadowRoot!.querySelectorAll('.tr-item')].map((x) => ({ title: x.querySelector('b')!.textContent, why: x.querySelector('em')!.textContent, chips: [...x.querySelectorAll('.tr-chip')].map((c) => c.textContent) })))
const sessionId = (page: Page) => page.evaluate(() => (window as any).voiceGuide?.session?.sessionId as string)

test('the journey: consent, private recording, timeline, scrubbing, explored items, a chip answered in place, clear', async () => {
	const { ctx, page, requests } = await open()
	try {
		assert.equal((await state(page)).rec, 'awaiting-consent')
		assert.ok(!requests.some((r) => r.url.includes('trail-record.js')), 'no recorder before consent')
		assert.equal((await readTrail(page)).exists, false, 'nothing stored before consent')
		assert.equal(await page.evaluate(() => (window as any).voiceGuide.session.site.agent.enabled), false, 'no model: the page agent is unavailable')

		// 1. Consent, plainly worded.
		await tr(page, '.tr-pill').click()
		const card = await tr(page, '.tr-card').innerText()
		// What is saved includes what the questions were about, never their words (ADR-0050 §5, S14).
		for (const re of [/Remember my journey on this device/, /What is saved: the public pages you visited .*what you explored there, and what your questions were about, never the words you said or typed/, /Never saved: the words you say or type, the guide’s answers/, /stays in this browser and deletes itself after 24 hours/, /Pause or clear it any time/, /No anonymous statistics are sent/]) assert.match(card, re)
		await tr(page, '.tr-allow').click()
		await recording(page)
		assert.ok(requests.some((r) => r.url.endsWith('/sdk/trail-record.js')), 'the recorder chunk loads after consent')
		assert.ok(!requests.some((r) => r.url.includes('trail-replay.js')), 'the replayer waits for a preview')

		// Typed text never enters a recording.
		await page.evaluate(() => {
			const i = document.createElement('input')
			i.id = 'secret'
			document.querySelector('main')!.prepend(i)
		})
		await page.locator('#secret').fill('hunter2-secret')

		// 2–5. Explore, linger, return, follow a call to action.
		await explore(page)
		const db = await readTrail(page)
		assert.equal(db.sessions.length, 1)
		const steps = db.sessions[0].steps
		assert.deepEqual(steps.map((s: any) => [s.type, s.pageId]), [['page', 'web.offers'], ['page', 'web.bundles']])
		assert.deepEqual(steps[1].navigationCause, { kind: 'destination', sourceDestinationId: 'web.offers.weekend-offer', sourceStepId: steps[0].id, targetPageId: 'web.bundles' })
		for (const s of steps) assert.ok(!s.canonicalPath.includes('?') && !s.canonicalPath.includes('#'))
		const all = db.chunks.map((c) => c.text).join('\n')
		assert.ok(db.chunks.some((c) => c.stepId === steps[0].id) && db.chunks.some((c) => c.stepId === steps[1].id))
		assert.match(all, /Double data on all mobile internet bundles/, 'the public page is recorded')
		assert.ok(!all.includes('hunter2'), 'typed text is masked and never stored')
		assert.ok(!/Your journey|Remember my journey|Talk to the/.test(all), 'the guide and the trail are blocked from recordings')
		assert.ok(!db.chunks.some((c) => c.text === '<corrupt>'))

		// 6–9. The timeline, a hover preview at the step's beginning, scrubbing both ways, the CTA transition.
		await tr(page, '.tr-pill').click()
		await until(page, `document.querySelector('vg-guide').shadowRoot.querySelector('.tr-sheet:not([hidden])')`)
		// Opening shows the current page's memory first; from here on, count what each preview reads.
		await until(page, `document.querySelector('vg-guide').shadowRoot.querySelector('.tr-frame iframe')`)
		await page.evaluate(() => ((window as any).__stepReads = []))
		assert.equal(await tr(page, '.tr-seg[data-step]').count(), 2)
		assert.equal(await tr(page, '.tr-seg[aria-current="page"]').getAttribute('data-step'), steps[1].id)
		const seg = tr(page, `.tr-seg[data-step="${steps[0].id}"]`)
		const b = (await seg.boundingBox())!
		await page.mouse.move(b.x + 2, b.y + b.height / 2)
		await until(page, `(window.__stepReads || []).length > 0 && document.querySelector('vg-guide').shadowRoot.querySelector('.tr-frame iframe')`)
		assert.ok(requests.some((r) => r.url.endsWith('/sdk/trail-replay.js')), 'the replayer loads with the first preview')
		await page.waitForTimeout(300)
		const reads = (await page.evaluate(() => (window as any).__stepReads)) as string[]
		assert.ok(reads.length > 0 && reads.every((id) => id === steps[0].id), `only the selected step's chunks were read: ${reads}`)
		const at = () => page.evaluate(() => Number(document.querySelector('vg-guide')!.shadowRoot!.querySelector('.tr-slider')!.getAttribute('aria-valuenow')))
		assert.ok((await at()) <= 5, 'a hover shows the step from its beginning')
		const mouse = () => page.evaluate(() => (document.querySelector('vg-guide')!.shadowRoot!.querySelector('.replayer-mouse') as HTMLElement | null)?.style.left || '')
		const seen = new Set<string>()
		const forward: number[] = []
		for (let i = 1; i <= 8; i++) {
			await page.mouse.move(b.x + 2 + ((b.width - 4) * i) / 10, b.y + b.height / 2)
			await page.waitForTimeout(80)
			forward.push(await at())
			seen.add(await mouse())
		}
		assert.ok(forward.every((v, i) => i === 0 || v >= forward[i - 1]), `scrubbing forward moves forward: ${forward}`)
		assert.ok(seen.size >= 3, 'the recorded cursor moves as the replay scrubs')
		await page.mouse.move(b.x + b.width * 0.3, b.y + b.height / 2)
		await page.waitForTimeout(80)
		assert.ok((await at()) < forward.at(-1)!, 'moving back seeks back')
		await page.mouse.move(b.x + b.width - 2, b.y + b.height / 2)
		await until(page, `!document.querySelector('vg-guide').shadowRoot.querySelector('.tr-cta').hidden`)
		assert.equal(await tr(page, '.tr-cta').innerText(), 'Opened Internet bundles')
		assert.deepEqual(await explored(page), [
			{ title: 'Weekend offer', why: 'You returned to this', chips: ['Tell me about the weekend offer'] },
			{ title: 'Roaming offer', why: 'You returned to this', chips: ['Tell me about the Roaming offer'] },
			{ title: 'Students offer', why: 'You explored this', chips: ['Tell me about the Students offer'] },
		])
		const frame = await page.evaluate(() => {
			const f = document.querySelector('vg-guide')!.shadowRoot!.querySelector('.tr-frame iframe')!
			return { sandbox: f.getAttribute('sandbox'), tabindex: f.getAttribute('tabindex'), hidden: f.getAttribute('aria-hidden'), badge: document.querySelector('vg-guide')!.shadowRoot!.querySelector('.tr-badge')!.textContent }
		})
		assert.deepEqual(frame, { sandbox: 'allow-same-origin', tabindex: '-1', hidden: 'true', badge: 'A memory of Offers, not the live page' })

		// 10–11. The second step and what was explored there: known, diverse, at most three.
		await tr(page, `.tr-seg[data-step="${steps[1].id}"]`).click()
		await page.waitForTimeout(400)
		const items = await explored(page)
		assert.deepEqual(items.map((x) => x.title), ['Mega 25', 'Home internet bundles', 'Home Lite'], 'one per topic first: a second mobile card loses to the Home tab the person opened')
		assert.equal(items[0].why, 'You returned to this')
		assert.deepEqual(items[0].chips, ['What does Mega 25 include?', 'How do I subscribe to Mega 25?', 'Which of the mobile internet bundles is the cheapest?'])
		for (const x of items) assert.ok(x.chips.length <= 3)
		const visible = await page.evaluate(() => document.querySelector('vg-guide')!.shadowRoot!.querySelector('.tr-sheet')!.textContent || '')
		assert.doesNotMatch(visible, /\d+\s*(ms|s|seconds|times)|tracked|watched|popular/i, 'no dwell times, counts or surveillance language')

		// 12–17. A chip becomes an ordinary guide turn: the timeline yields, the hidden tab opens, the card is spotlit and read.
		assert.equal(await page.locator('#tab-home').getAttribute('aria-selected'), 'true', 'the Home tab is open, so Mega 25 is hidden')
		const turnAt = requests.length
		await tr(page, '.tr-chip', ).filter({ hasText: 'What does Mega 25 include?' }).click()
		await until(page, `(window.__spoken || []).some((s) => /Mega 25/.test(s.text))`)
		const turn = requests.slice(turnAt).find((r) => r.url.endsWith('/v1/turn'))!
		const body = JSON.parse(turn.body)
		assert.equal(body.utterance, 'What does Mega 25 include?')
		assert.deepEqual({ ...body.hint, trailStepId: typeof body.hint.trailStepId, questionId: typeof body.hint.questionId }, { source: 'trail-suggestion', destinationId: 'web.bundles.mobile-internet.mi-25', pageId: 'web.bundles', trailStepId: 'string', questionId: 'string' })
		assert.equal((await state(page)).view, 'collapsed', 'the timeline yields to the guide')
		assert.equal(await page.locator('#tab-mobile').getAttribute('aria-selected'), 'true', 'the guide revealed the hidden tab')
		assert.ok((await spotlit(page)).overlaps.includes('mi-25'), 'the card is spotlit')
		const spoken = await page.evaluate(() => (window as any).__spoken.map((s: any) => s.text))
		assert.ok(spoken.some((t: string) => t === 'Mega 25: 25 GB for 250 EGP / month.'), spoken.join(' | '))
		const trace = await p.store.listTrace(await sessionId(page))
		const hint = trace.find((e) => e.name === 'router.hint')
		assert.equal(hint?.attrs.outcome, 'agree')
		assert.ok(trace.some((e) => e.name === 'planner.plan' && e.attrs.route === 'replay'), 'the deterministic router planned it')
		assert.equal(await page.evaluate(() => document.querySelector('vg-guide')!.shadowRoot!.querySelector('.panel')!.classList.contains('open')), false, 'no panel opened: no chatbot')
		assert.equal(await tr(page, '.tr input, .tr textarea, .tr [contenteditable]').count(), 0, 'the trail has no text box')

		// Nothing recorded ever left the browser.
		for (const r of requests) {
			const blob = `${r.url} ${r.body}`
			assert.ok(!/"type":\s*[23],\s*"(data|timestamp)"|rr_width|"source":\s*\d|hunter2|"childNodes"|IncrementalSnapshot/.test(blob), `replay data in ${r.url}`)
		}
		assert.ok(!requests.some((r) => r.url.includes('/v1/experience/contributions')), 'no aggregate is sent')

		// 18–19. Clear the journey: the old pages cannot be replayed.
		await tr(page, '.tr-pill').click()
		await tr(page, '.tr-more').click()
		await tr(page, '.tr-menu [data-act="clear"]').click()
		await page.waitForTimeout(800)
		const left = await readTrail(page)
		assert.ok(!left.sessions.some((s: any) => s.id === db.sessions[0].id), 'the journey is gone')
		assert.ok(!left.chunks.some((c) => c.stepId === steps[0].id || c.stepId === steps[1].id), 'and so is its replay')
		assert.ok(!left.interest.some((x: any) => x.stepId === steps[0].id))
		assert.equal(await tr(page, `.tr-seg[data-step="${steps[0].id}"]`).count(), 0)
	} finally {
		await ctx.close()
	}
})

test('keyboard only: open with Enter, move between pages with arrows, scrub with the slider, Space plays, Escape returns focus', async () => {
	const { ctx, page } = await open({ consented: true })
	try {
		await recording(page)
		await page.locator('#weekend-offer a.btn').focus()
		await page.keyboard.press('Tab')
		await page.locator('#weekend-offer a.btn').focus()
		await page.waitForTimeout(500)
		await page.keyboard.press('Enter')
		await page.waitForURL('**/en/bundles.html')
		await recording(page)
		await page.locator('[data-bundle="mi-25"] a').focus()
		await page.waitForTimeout(800)
		await page.waitForTimeout(2200)
		await tr(page, '.tr-pill').focus()
		await page.keyboard.press('Enter')
		await until(page, `document.querySelector('vg-guide').shadowRoot.activeElement?.classList.contains('tr-seg')`)
		const focused = () => page.evaluate(() => (document.querySelector('vg-guide')!.shadowRoot!.activeElement as HTMLElement | null)?.getAttribute('aria-label') || '')
		assert.match(await focused(), /^Page 2 of 2: Internet bundles/)
		await page.keyboard.press('ArrowLeft')
		assert.match(await focused(), /^Page 1 of 2: Offers/)
		assert.equal(await tr(page, '.tr-seg[aria-pressed="true"]').getAttribute('aria-label'), 'Page 1 of 2: Offers')
		await until(page, `document.querySelector('vg-guide').shadowRoot.querySelector('.tr-frame iframe')`)
		assert.match(await tr(page, '.tr-sr').innerText(), /Page 1 of 2: Offers/, 'the selected page is announced')
		const slider = tr(page, '.tr-slider')
		await slider.focus()
		for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowRight')
		assert.equal(await slider.getAttribute('aria-valuenow'), '20')
		assert.equal(await slider.getAttribute('aria-valuetext'), '20% through Offers')
		await page.keyboard.press('End')
		assert.equal(await slider.getAttribute('aria-valuenow'), '100')
		await page.keyboard.press('Home')
		await page.keyboard.press(' ')
		await until(page, `document.querySelector('vg-guide').shadowRoot.querySelector('.tr-play').getAttribute('aria-label') === 'Pause'`)
		await page.keyboard.press(' ')
		await until(page, `document.querySelector('vg-guide').shadowRoot.querySelector('.tr-play').getAttribute('aria-label') === 'Play'`)
		await page.keyboard.press('Escape')
		assert.equal((await state(page)).view, 'collapsed')
		assert.equal(await page.evaluate(() => document.querySelector('vg-guide')!.shadowRoot!.activeElement?.classList.contains('tr-pill')), true, 'focus back on the trail button')
		const sizes = await page.evaluate(() => [...document.querySelector('vg-guide')!.shadowRoot!.querySelectorAll('.tr-pill, .tr-seg[data-step], .tr-chip, .tr-icon, .tr-btn')].map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0).map((r) => Math.min(r.width, r.height)))
		assert.ok(sizes.every((s) => s >= 44), `touch targets are at least 44px: ${sizes}`)
	} finally {
		await ctx.close()
	}
})

test('Arabic: right-to-left order, mirrored arrows and keys, Arabic copy and questions', async () => {
	const { ctx, page } = await open({ lang: 'ar' })
	try {
		await tr(page, '.tr-pill').click()
		assert.match(await tr(page, '.tr-card').innerText(), /افتكر رحلتي على الجهاز ده/)
		await tr(page, '.tr-allow').click()
		await recording(page)
		await explore(page, 'ar')
		await tr(page, '.tr-pill').click()
		await until(page, `document.querySelector('vg-guide').shadowRoot.querySelector('.tr-sheet:not([hidden])')`)
		assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('vg-guide')!.shadowRoot!.querySelector('.tr-sheet')!).direction), 'rtl')
		const [first, second] = await page.evaluate(() => [...document.querySelector('vg-guide')!.shadowRoot!.querySelectorAll('.tr-seg[data-step]')].map((e) => e.getBoundingClientRect().x))
		assert.ok(first > second, 'the first page is on the right')
		const arrow = await page.evaluate(() => document.querySelector('vg-guide')!.shadowRoot!.querySelector('.tr-link path')!.getAttribute('d'))
		assert.match(arrow!, /^M15 6l-6 6/, 'the transition arrow points left')
		await tr(page, '.tr-seg[aria-pressed="true"]').focus()
		await page.keyboard.press('ArrowRight')
		assert.match((await tr(page, '.tr-seg[aria-pressed="true"]').getAttribute('aria-label'))!, /^صفحة ١|^صفحة 1/, 'ArrowRight goes back towards the start in Arabic')
		await page.waitForTimeout(500)
		const items = await explored(page)
		assert.equal(items[0].title, 'عرض نهاية الأسبوع')
		assert.equal(items[0].why, 'رجعت لده')
		assert.deepEqual(items[0].chips, ['احكيلي عن عرض نهاية الأسبوع'])
		await page.keyboard.press('ArrowLeft')
		await page.waitForTimeout(500)
		const two = await explored(page)
		assert.ok(two.some((x) => x.title === 'ميجا ٢٥' && x.chips.includes('أشترك في ميجا ٢٥ إزاي؟')), JSON.stringify(two))
	} finally {
		await ctx.close()
	}
})

test('touch and reduced motion: tap and drag scrub, nothing plays by itself, no cursor trail, the page underneath is untouched', async () => {
	const { ctx, page } = await open({ consented: true, mobile: true, reducedMotion: true })
	try {
		await recording(page)
		// rrweb takes its first full snapshot just after it starts; a visit shorter than that has no preview.
		await page.waitForTimeout(1000)
		await page.locator('#weekend-offer a.btn').tap()
		await page.waitForURL('**/en/bundles.html')
		await recording(page)
		await page.locator('[data-bundle="mi-25"] h3').tap()
		await page.waitForTimeout(2500)
		const saved = await readTrail(page)
		const first = saved.sessions[0].steps[0]
		assert.ok(saved.chunks.some((c) => c.stepId === first.id), 'a short first visit is saved before the link navigates')
		await tr(page, '.tr-pill').tap()
		await until(page, `document.querySelector('vg-guide').shadowRoot.querySelector('.tr-sheet:not([hidden])')`)
		const seg = tr(page, '.tr-seg[data-step]').first()
		await seg.tap()
		await until(page, `document.querySelector('vg-guide').shadowRoot.querySelector('.tr-frame iframe')`)
		await page.waitForTimeout(1200)
		assert.equal(await tr(page, '.tr-play').getAttribute('aria-label'), 'Play', 'no autoplay under reduced motion')
		assert.equal(await tr(page, '.replayer-mouse-tail').count(), 0, 'no animated cursor trail')
		const b = (await seg.boundingBox())!
		const url = page.url()
		for (const [type, f] of [['pointerdown', 0.1], ['pointermove', 0.5], ['pointermove', 0.9], ['pointerup', 0.9]] as const)
			await seg.dispatchEvent(type, { pointerType: 'touch', pointerId: 7, isPrimary: true, clientX: b.x + b.width * f, clientY: b.y + b.height / 2, bubbles: true })
		assert.ok(Number(await tr(page, '.tr-slider').getAttribute('aria-valuenow')) >= 80, 'dragging scrubs')
		assert.equal(page.url(), url, 'touching the timeline does not activate the page underneath')
	} finally {
		await ctx.close()
	}
})

test('pause, resume and revocation reach every tab at once; turning off deletes everything', async () => {
	const a = await open({ consented: true })
	const pageB = await a.ctx.newPage()
	try {
		await pageB.goto(`${WEB}/en/help.html`)
		await pill(pageB)
		await recording(a.page)
		await recording(pageB)
		await a.page.waitForTimeout(2500)
		await tr(a.page, '.tr-pill').click()
		await tr(a.page, '.tr-pause').click()
		await until(pageB, `document.querySelector('vg-guide').shadowRoot.querySelector('.tr').dataset.rec === 'paused'`)
		assert.equal((await state(a.page)).rec, 'paused')
		const before = (await readTrail(a.page)).chunks.length
		await hover(a.page, '#roaming-offer', 1500)
		await hover(pageB, '#faq-balance', 1500)
		await a.page.waitForTimeout(2500)
		assert.equal((await readTrail(a.page)).chunks.length, before, 'nothing is written while paused')
		await tr(a.page, '.tr-pause').click()
		await recording(a.page)
		await recording(pageB)
		await tr(a.page, '.tr-more').click()
		await tr(a.page, '.tr-menu [data-act="off"]').click()
		await until(pageB, `document.querySelector('vg-guide').shadowRoot.querySelector('.tr').dataset.rec === 'disabled'`)
		assert.equal((await state(a.page)).rec, 'disabled')
		await a.page.waitForTimeout(800)
		const gone = await readTrail(a.page)
		assert.deepEqual([gone.sessions.length, gone.chunks.length, gone.interest.length], [0, 0, 0])
		await hover(pageB, '#faq-renewal', 1500)
		await pageB.waitForTimeout(2500)
		assert.equal((await readTrail(pageB)).chunks.length, 0, 'the other tab stopped recording too')
	} finally {
		await a.ctx.close()
	}
})

test('private pages, Back and another origin: boundaries without replay, never a private URL', async () => {
	const { ctx, page, requests } = await open({ consented: true })
	try {
		await recording(page)
		await page.locator('#weekend-offer a.btn').click()
		await page.waitForURL('**/en/bundles.html')
		await recording(page)
		await page.locator('[data-bundle="mi-10"] a.btn').click()
		await page.waitForURL('**/en/subscribe.html?bundle=mi-10')
		await pill(page)
		await until(page, `document.querySelector('vg-guide').shadowRoot.querySelector('.tr').dataset.rec === 'blocked'`)
		await page.locator('#msisdn').fill('01012345678')
		await page.waitForTimeout(2500)
		await page.goBack()
		await page.waitForURL('**/en/bundles.html')
		await recording(page)
		await page.locator('nav.main a[href*="4402"]').click()
		await page.waitForURL(`${APP}/en/account.html`)
		await pill(page)
		assert.equal((await state(page)).rec, 'awaiting-consent', 'consent is per origin')
		await page.goBack()
		await page.waitForURL('**/en/bundles.html')
		await recording(page)
		await page.waitForTimeout(2500)
		const db = await readTrail(page)
		const steps = db.sessions[0].steps
		assert.deepEqual(steps.map((s: any) => s.type === 'boundary' ? `boundary:${s.boundary}` : `${s.pageId}:${s.navigationCause.kind}`), ['web.offers:direct', 'web.bundles:destination', 'boundary:private', 'web.bundles:history', 'boundary:cross-origin', 'web.bundles:history'])
		const priv = steps[2]
		assert.equal(priv.canonicalPath, undefined, 'no path for a private page')
		assert.equal(priv.replay, 'none')
		assert.ok(!db.chunks.some((c) => c.stepId === priv.id))
		const all = db.chunks.map((c) => c.text).join('\n')
		assert.ok(!/Confirm and pay|01012345678|order-summary/.test(all), 'nothing from the checkout page was stored')
		assert.ok(!JSON.stringify(db.sessions).includes('bundle=mi-10'), 'no private query string anywhere')
		assert.equal(steps[4].title.en, 'My account', 'the other origin is named, not replayed')
		assert.ok(!requests.some((r) => r.url.startsWith(APP) && r.url.includes('trail-record')), 'no recorder on the other origin without its own consent')
	} finally {
		await ctx.close()
	}
})

test('failures degrade to the normal site and guide: recorder, replayer, corrupt replay, full storage', async () => {
	// The recorder cannot load.
	const r1 = await open()
	try {
		await r1.page.route('**/sdk/trail-record.js', (route) => route.fulfill({ status: 500, body: '' }))
		await tr(r1.page, '.tr-pill').click()
		await tr(r1.page, '.tr-allow').click()
		await until(r1.page, `document.querySelector('vg-guide').shadowRoot.querySelector('.tr').dataset.rec === 'error'`)
		await r1.page.locator('#weekend-offer a.btn').click()
		await r1.page.waitForURL('**/en/bundles.html')
		await r1.page.waitForFunction(() => !!(window as any).voiceGuide?.ui)
	} finally {
		await r1.ctx.close()
	}
	// The replayer cannot load, and a step's replay is corrupt: no preview, the chip still works.
	const r2 = await open({ consented: true })
	try {
		await recording(r2.page)
		await hover(r2.page, '#weekend-offer', 1500)
		await hover(r2.page, '#roaming-offer', 1500)
		await r2.page.waitForTimeout(2500)
		await r2.page.evaluate(async () => {
			const db = await new Promise<IDBDatabase>((res) => {
				const r = indexedDB.open('vg-trail-v1')
				r.onsuccess = () => res(r.result)
			})
			const tx = db.transaction('chunks', 'readwrite')
			const st = tx.objectStore('chunks')
			const all = await new Promise<any[]>((res) => {
				const r = st.getAll()
				r.onsuccess = () => res(r.result)
			})
			for (const c of all) st.put({ ...c, data: new Blob([new Uint8Array([9, 9, 9])]) })
			await new Promise((res) => (tx.oncomplete = res))
			db.close()
		})
		await r2.page.route('**/sdk/trail-replay.js', (route) => route.abort())
		await tr(r2.page, '.tr-pill').click()
		await until(r2.page, `document.querySelector('vg-guide').shadowRoot.querySelector('.tr-veil:not([hidden])')?.textContent === 'No preview for this page'`)
		await r2.page.unroute('**/sdk/trail-replay.js')
		await tr(r2.page, '.tr-chip').first().click()
		await until(r2.page, `(window.__spoken || []).some((s) => /offer|Double data|roaming/i.test(s.text))`)
	} finally {
		await r2.ctx.close()
	}
	// Storage is full.
	const full = `(() => { const put = IDBObjectStore.prototype.put; IDBObjectStore.prototype.put = function (...a) { if (this.name === 'chunks') throw new DOMException('full', 'QuotaExceededError'); return put.apply(this, a) } })();`
	const r3 = await open({ consented: true, init: [full] })
	try {
		await hover(r3.page, '#weekend-offer', 1200)
		await until(r3.page, `document.querySelector('vg-guide').shadowRoot.querySelector('.tr').dataset.rec === 'storage-full'`)
		await r3.page.locator('#weekend-offer a.btn').click()
		await r3.page.waitForURL('**/en/bundles.html')
	} finally {
		await r3.ctx.close()
	}
})

test('without speech the answer is shown in the guide\'s existing panel; without a profile, explored items have no questions; fewer than three is fine', async () => {
	const { ctx, page } = await open({ consented: true, noSpeech: true })
	try {
		await recording(page)
		await hover(page, '#roaming-offer', 1500)
		await page.waitForTimeout(2500)
		await tr(page, '.tr-pill').click()
		await page.waitForTimeout(500)
		const items = await explored(page)
		assert.deepEqual(items.map((x) => x.title), ['Roaming offer'], 'only what was explored, no filler')
		await tr(page, '.tr-chip').first().click()
		await until(page, `document.querySelector('vg-guide').shadowRoot.querySelector('.panel.open .msg.guide')`)
		assert.match(await page.locator('vg-guide').locator('.panel .msg.guide').last().innerText(), /50% off roaming|Roaming offer/)
		// A profile for another knowledge version is never used.
		const stale = structuredClone((await p.store.getActiveExperienceProfile('demo-telco'))!)
		stale.id = 'exp-e2e-stale'
		stale.kbVersionId = 'older'
		await p.store.putExperienceProfile('demo-telco', stale)
		await p.store.activateExperienceProfile('demo-telco', stale.id)
		p.services.experience.invalidate()
		await page.goto(`${WEB}/en/help.html`)
		await recording(page)
		await page.locator('#faq-balance summary').click()
		await hover(page, '#faq-balance', 1500)
		await page.waitForTimeout(2500)
		await tr(page, '.tr-pill').click()
		await page.waitForTimeout(500)
		const again = await explored(page)
		assert.ok(again.some((x) => x.title === 'How do I check my balance?' && x.chips.length === 0), JSON.stringify(again))
	} finally {
		await p.store.activateExperienceProfile('demo-telco', profileId)
		p.services.experience.invalidate()
		await ctx.close()
	}
})
