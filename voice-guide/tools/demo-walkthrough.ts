/**
 * node tools/demo-walkthrough.ts <out-dir> [--lang en|ar] [--phone] [--reduced] [--video]
 *
 * The end-to-end demo walkthrough (2026-11-05 handoff, phase C step 11) on the saved Vodafone
 * pages with the Services clone at /en/services and /ar/services: trail consent, two spoken
 * questions, the clone where all four demos meet (controls measured for overlaps), the Pocket
 * with its actors and the journey, a question chip, Reimagine (magazine, then tunnel) with a
 * spoken question about Vodafone Cash, and the Pocket from the reimagined view.
 *
 * Headless Chromium, speech through the test stand-in (no microphone, no speech service), memory
 * store, no agent model. Real speech, Google Chrome and the live site are checked by hand on the
 * demo Mac (runbook §3). Writes screenshots, checks.json, controls.json and xray-turn.json.
 * For reviews and evidence, not a test: it records failures and carries on.
 */
import fs from 'node:fs'
import path from 'node:path'

import type { Manifest } from '#kb'
import { ensureExperienceProfile } from '#jobs/experience/build.ts'

import { buildSdk } from '../packages/sdk/build.ts'
import { createGateway } from '../services/gateway/server.ts'
import { createServices } from '../services/index.ts'
import { loadPlatformConfig, loadSiteConfig, ROOT } from '../services/shared/config.ts'
import { VOICE_STUB, writeVoiceWav } from '../tests/e2e/browser.ts'
import { launchDemoBrowser } from './demo-browser.ts'

const arg = (name: string) => process.argv.includes(name)
const out = path.resolve(process.argv[2] || 'data/walkthrough')
const lang = process.argv.includes('--lang') ? process.argv[process.argv.indexOf('--lang') + 1] : 'en'
const phone = arg('--phone')
const reduced = arg('--reduced')
const tag = `${lang}-${phone ? 'phone' : 'desktop'}${reduced ? '-reduced' : ''}`
const dir = path.join(out, tag)
fs.mkdirSync(dir, { recursive: true })
const V = 'https://web.vodafone.com.eg'
const PORT = 4411

const ASK = {
	en: { bundle: ["what's", 'the', 'cheapest', 'internet', 'bundle'], cash: ['tell', 'me', 'about', 'vodafone', 'cash'] },
	ar: { bundle: ['إيه', 'أرخص', 'باقة', 'نت'], cash: ['عايز', 'اعرف', 'عن', 'ڤودافون', 'كاش'] },
}[lang as 'en' | 'ar']

const platform = loadPlatformConfig({ ...process.env, VG_STORE: 'memory', VG_PORT: String(PORT), VG_PUBLIC_URL: `http://127.0.0.1:${PORT}`, VG_LLM_BASE_URL: '', VG_LLM_PRESET: '' })
const site = loadSiteConfig(path.join(platform.sitesDir, 'vodafone-eg.yaml'))
await buildSdk({ minify: true })
const services = await createServices({ platform })
const m = JSON.parse(fs.readFileSync(path.join(ROOT, 'config/kb/vodafone-eg.manifest.json'), 'utf8')) as Manifest
await services.store.putKbVersion(site.id, m)
await services.store.activateKb(site.id, m.version.id)
const live = services.sites.get(site.id)!
live.trail.enabled = true
await ensureExperienceProfile(services.store, live, m, JSON.parse(fs.readFileSync(path.join(ROOT, 'config/experience/vodafone-eg.profile.json'), 'utf8')), () => {})
const gateway = createGateway({ services })
await gateway.listen(PORT)

const wav = path.join(dir, 'voice.wav')
writeVoiceWav(wav)
const viewport = phone ? { width: 375, height: 812 } : { width: 1366, height: 900 }
const browser = await launchDemoBrowser({
	site,
	gatewayUrl: `http://127.0.0.1:${PORT}`,
	start: 'about:blank',
	headless: true,
	channel: 'chromium',
	xray: 'button',
	replayDir: path.join(ROOT, 'fixtures/replay/vodafone-eg'),
	clone: { path: '/en/services', dir: path.join(ROOT, '../vodafone-services-clone'), pages: { '/ar/services': 'ar/index.html' } },
	accessibilityStandIn: true,
	fakeMic: wav,
	initScripts: [VOICE_STUB],
	viewport,
	...(arg('--video') ? { recordVideoDir: path.join(dir, 'video') } : {}),
	log: () => {},
})
const { page } = browser
if (reduced) await page.emulateMedia({ reducedMotion: 'reduce' })
const errors: string[] = []
page.on('pageerror', (e) => errors.push(`${page.url()}: ${e.message}`))

const checks: { step: string; ok: boolean; detail?: unknown }[] = []
const check = (step: string, ok: boolean, detail?: unknown) => {
	checks.push({ step, ok, ...(detail === undefined ? {} : { detail }) })
	console.log(`${ok ? 'PASS' : 'FAIL'}  ${step}${!ok && detail !== undefined ? `  -- ${JSON.stringify(detail).slice(0, 300)}` : ''}`)
}
let shot = 0
const snap = async (name: string) => page.screenshot({ path: path.join(dir, `${String(++shot).padStart(2, '0')}-${name}.png`) }).catch(() => {})
const step = async (name: string, fn: () => Promise<void>) => {
	try {
		await fn()
	} catch (e) {
		check(`${name} (step failed)`, false, (e as Error).message.split('\n').slice(0, 3).join(' | '))
		await snap(`${name}-failed`)
	}
}
const shadow = <T>(fn: string) => page.evaluate(`(() => { const r = document.querySelector('vg-guide')?.shadowRoot; return (${fn})(r) })()`) as Promise<T>
const ready = () => page.waitForFunction(() => !!(window as any).voiceGuide?.ui, null, { timeout: 30_000 })
const recording = () => page.waitForFunction(() => document.querySelector('vg-guide')?.shadowRoot?.querySelector('.tr')?.getAttribute('data-rec') === 'recording', null, { timeout: 30_000 })
const spotOn = () => page.waitForFunction(() => document.querySelector('vg-guide')?.shadowRoot?.querySelector('.spot.on'), null, { timeout: 20_000 })
const spoken = () => page.evaluate(() => ((window as any).__spoken || []).map((s: any) => s.text) as string[])
async function say(words: string[]) {
	// A chip or typed turn leaves the guide's panel open; on stage you close it and press the microphone.
	const close = page.locator('vg-guide').locator('.closebtn')
	if (await close.isVisible().catch(() => false)) await close.click()
	await page.locator('vg-guide .vg-mic').click()
	await page.waitForFunction(() => !!(window as any).__activeRec, null, { timeout: 10_000 })
	await page.evaluate((w) => (window as any).__vgSayWords(w), words)
}
async function dwell(selector: string, ms = 2500) {
	const el = page.locator(selector).first()
	await el.scrollIntoViewIfNeeded()
	const b = await el.boundingBox()
	if (!b) return
	for (const end = Date.now() + ms; Date.now() < end; ) {
		await page.mouse.move(b.x + b.width * (0.3 + Math.random() * 0.4), b.y + Math.min(b.height, 300) * (0.3 + Math.random() * 0.4), { steps: 6 })
		await page.waitForTimeout(300)
	}
}

/** The floating controls: the guide's microphone and journey pill, Vodafone's accessibility button, the Pocket and Reimagine. */
const CONTROLS = `(() => {
	const r = document.querySelector('vg-guide')?.shadowRoot
	const box = (el) => { if (!el) return null; const s = getComputedStyle(el); const b = el.getBoundingClientRect(); return b.width && b.height && s.visibility !== 'hidden' && s.display !== 'none' && +s.opacity > 0.05 ? { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) } : null }
	return { mic: box(r?.querySelector('.vg-mic')), accessibility: box(document.getElementById('vodafone-aw-icon')), pocket: box(document.querySelector('.pocket-peek:not([data-state="hidden"])')), reimagine: box(document.querySelector('.aixc-launcher')), journey: box(r?.querySelector('.tr-pill')) }
})()`
const controls: Record<string, unknown> = {}
async function measure(when: string) {
	const c = (await page.evaluate(CONTROLS)) as Record<string, { x: number; y: number; w: number; h: number } | null>
	controls[when] = c
	const names = Object.keys(c).filter((k) => c[k])
	const hits: string[] = []
	for (let i = 0; i < names.length; i++)
		for (let j = i + 1; j < names.length; j++) {
			const a = c[names[i]]!
			const b = c[names[j]]!
			if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) hits.push(`${names[i]}×${names[j]}`)
		}
	check(`controls do not overlap (${when}): ${names.join(', ')}`, hits.length === 0, { overlaps: hits, boxes: c })
}

// 1. Home: Exploration Trail consent, local recording, Pause and Clear.
await step('home and consent', async () => {
	await page.goto(`${V}/${lang}/home`, { waitUntil: 'domcontentloaded' })
	await ready()
	await snap('home')
	await page.locator('vg-guide').locator('.tr-pill').click()
	await page.locator('vg-guide').locator('.tr-allow').waitFor({ timeout: 10_000 })
	await snap('consent')
	await page.locator('vg-guide').locator('.tr-allow').click()
	await recording()
	check('the trail records after consent', true)
	const stored = await page.evaluate(async () => ((await indexedDB.databases?.()) || []).map((d) => d.name))
	check('recorded locally (IndexedDB)', stored.some((n) => /trail/i.test(String(n))), stored)
	await page.locator('vg-guide').locator('.tr-more').click().catch(() => {})
	const controlsShown = await shadow<{ pause: boolean; clear: boolean }>(`(r) => ({ pause: !!r.querySelector('.tr-pause, [data-act="pause"]'), clear: !!r.querySelector('.tr-menu [data-act="clear"], [data-act="clear"]') })`)
	check('Pause and Clear are there', controlsShown.pause && controlsShown.clear, controlsShown)
	await snap('recording-menu')
	await page.keyboard.press('Escape')
})

// 2. Two spoken questions across saved pages: the guide navigates and spotlights.
await step('voice: cheapest bundle', async () => {
	await say(ASK.bundle)
	await page.waitForURL(/mobile-internet-bundles/, { timeout: 20_000 })
	await ready()
	await spotOn()
	check('voice question 1 navigates to the bundles page and spotlights the answer', true, page.url())
	await page.waitForTimeout(1200)
	check('the guide answered aloud', (await spoken()).length > 0, (await spoken()).slice(-1))
	await snap('voice-bundles')
})
await step('voice: Vodafone Cash', async () => {
	const sid = await page.evaluate(() => (window as any).voiceGuide.session.sessionId as string)
	const from = (await services.store.listTrace(sid)).length
	await say(ASK.cash)
	await page.waitForURL(/vodafone-cash/, { timeout: 20_000 })
	await ready()
	await page.waitForTimeout(2500)
	check('voice question 2 goes to the Vodafone Cash page', true, page.url())
	await snap('voice-cash')
	const sessionId = await page.evaluate(() => (window as any).voiceGuide.session.sessionId as string)
	fs.writeFileSync(path.join(dir, 'spoken.json'), JSON.stringify(await spoken(), null, 2))
	const trace = await services.store.listTrace(sessionId)
	// The X-ray's record of this one spoken turn: everything traced from the question on.
	fs.writeFileSync(path.join(dir, 'xray-turn.json'), JSON.stringify({ asked: ASK.cash.join(' '), events: trace.slice(from) }, null, 2))
	const listen = trace.filter((e) => /listen/.test(e.name)).at(-1)
	check('X-ray has a "listen" row for the spoken turn', !!listen, listen?.attrs)
})

// 3. The Services clone, where the four demos meet.
await step('services clone', async () => {
	await page.goto(`${V}/${lang}/services`, { waitUntil: 'domcontentloaded' })
	await ready()
	await recording()
	await page.waitForTimeout(1500)
	check('the clone is the host page', (await page.locator('meta[name="vg-trail-host"]').getAttribute('content')) === 'pocket')
	await measure('on load')
	await snap('services')
	await dwell('[data-vg-destination="web.services.vodafone-cash"]')
	await dwell('[data-vg-destination="web.services.call-connect-abroad"]')
	await page.mouse.wheel(0, -6000)
	await page.waitForTimeout(600)
})

// 4. The Pocket: two stickers, the actors, the journey, a question chip.
await step('pocket', async () => {
	for (const id of ['vodafone-cash', 'roaming']) {
		const cta = page.locator(`[data-aixc-item="${id}"] .pocket-cta`)
		await cta.scrollIntoViewIfNeeded()
		await cta.click()
		await page.waitForTimeout(1600)
	}
	await page.mouse.wheel(0, -6000)
	await page.waitForTimeout(1200)
	check('two stickers in the Pocket', (await page.locator('.pocket-peek__count').textContent()) === '2')
	await measure('Pocket peeking')
	check('the mascot is there', !!(await page.evaluate(() => document.querySelector('[data-mascot-state]')?.getAttribute('data-mascot-state'))))
	await snap('peek')
	await page.locator('.pocket-peek').click()
	await page.waitForFunction(() => document.body.dataset.pocketView === 'open', null, { timeout: 10_000 })
	await page.waitForTimeout(1500)
	const drone = await page.evaluate(() => document.querySelector('[data-drone-state]')?.getAttribute('data-drone-state'))
	check('the drone is in the open Pocket', !!drone, drone)
	await snap('pocket-open')
	await page.locator('.pocket-journey-cta').click()
	await page.waitForSelector('.pocket-journey-layer:not([hidden])', { timeout: 15_000 })
	await page.waitForTimeout(2000)
	// The drone should step aside: it must not sit over the journey's floating pieces.
	const droneOver = await page.evaluate(() => {
		const d = document.querySelector('[data-drone-state]')
		const r = d?.getBoundingClientRect()
		if (!r || !r.width) return { drone: null, over: [] }
		const over = [...document.querySelectorAll('.pocket-journey-float')].filter((el) => { const b = el.getBoundingClientRect(); return b.width && b.left < r.right && r.left < b.right && b.top < r.bottom && r.top < b.bottom }).map((el) => String(el.className).split(' ').find((c) => c.startsWith('pocket-journey-') && c !== 'pocket-journey-float') || 'piece')
		return { drone: { state: d!.getAttribute('data-drone-state'), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }, over }
	})
	check('the drone steps aside for the journey (not over its pieces)', droneOver.over.length === 0, droneOver)
	check('the journey has stepped page tabs', (await page.locator('.pocket-journey-step').count()) >= 3, await page.locator('.pocket-journey-step').count())
	await snap('journey')
	await page.locator('.pocket-journey-rail').focus()
	await page.keyboard.press('End')
	await page.waitForSelector('.pocket-journey-chip', { timeout: 10_000 })
	// The Vodafone Cash note's first question answers on Services; its "related" question goes to the Cash page by design.
	const note = page.locator('.pocket-journey-note').filter({ hasText: lang === 'ar' ? 'كاش' : 'Vodafone Cash' })
	const offered = await note.locator('.pocket-journey-chip').allTextContents()
	check('the trail logged Vodafone Cash (its note in the journey, with questions)', offered.length > 0, offered)
	const about = note.locator('.pocket-journey-chip').filter({ hasText: lang === 'ar' ? /^احكيلي عن ڤودافون كاش$/ : /^Tell me about the Vodafone Cash$/ })
	const chip = (await about.count()) ? about.first() : note.locator('.pocket-journey-chip').first()
	const asked = await chip.textContent()
	const sessionId = await page.evaluate(() => (window as any).voiceGuide.session.sessionId as string)
	const at = (await services.store.listTrace(sessionId)).length
	await chip.click()
	await page.waitForFunction(() => !document.body.dataset.pocketView, null, { timeout: 10_000 })
	check('a question chip turns the page back to Services first', true, asked)
	const lit = await spotOn().then(() => true, () => false)
	await page.waitForTimeout(2500)
	const turn = (await services.store.listTrace(sessionId)).slice(at)
	const understood = turn.find((e) => e.name === 'router.understood')?.attrs
	const hint = turn.find((e) => e.name === 'router.hint')?.attrs
	const onServices = /\/services/.test(new URL(page.url()).pathname)
	// O19: the profile offers only the "related" Cash question, which goes to the Cash page by design.
	check('the guide answers the chip on Services with a spotlight', onServices && lit, { asked, url: page.url(), lit, destination: understood?.destinationId, hint })
	await snap('chip-answered')
	if (!onServices) {
		await page.goto(`${V}/${lang}/services`, { waitUntil: 'domcontentloaded' })
		await ready()
	}
})

// 5. Reimagine: magazine, then tunnel; a spoken question lands on the visible reimagined item.
await step('reimagine', async () => {
	if (await page.evaluate(() => !!document.body.dataset.pocketView)) await page.keyboard.press('Escape')
	await page.waitForFunction(() => !document.body.dataset.pocketView, null, { timeout: 10_000 })
	await page.mouse.wheel(0, -6000)
	await page.locator('.aixc-launcher').click()
	await page.waitForSelector('#aixc-composer:not([hidden])', { timeout: 10_000 }).catch(() => {})
	await page.waitForTimeout(600)
	await snap('composer')
	await page.click('.aixc-template[data-template=magazine]')
	await page.waitForSelector('#experience-output .aixc-magazine', { timeout: 10_000 })
	await page.waitForTimeout(800)
	await snap('magazine')
	// The view bar's own buttons (Change experience, Reset) must not sit under a floating control.
	const bar = await page.evaluate(`(() => {
		const r = document.querySelector('vg-guide')?.shadowRoot
		const box = (el) => { const b = el.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) } }
		const floating = [r?.querySelector('.tr-pill'), r?.querySelector('.panel.open, .panel[open]'), r?.querySelector('.vg-mic')].filter(Boolean)
		return [...document.querySelectorAll('.aixc-viewbar button')].filter((b) => b.offsetParent).map((b) => {
			const c = b.getBoundingClientRect(); const top = document.elementFromPoint(c.x + c.width / 2, c.y + c.height / 2)
			return { label: b.textContent.trim(), box: box(b), reachable: !!top && (top === b || b.contains(top)), coveredBy: top && !(top === b || b.contains(top)) ? (top.tagName === 'VG-GUIDE' ? 'the guide (shadow root)' : top.className || top.tagName) : null }
		})
	})()`) as { label: string; box: unknown; reachable: boolean; coveredBy: string | null }[]
	check('the Reimagine view bar buttons are reachable (not under a floating control)', bar.every((b) => b.reachable), bar)
	await page.evaluate(() => (document.querySelectorAll('.aixc-viewbar__actions button')[0] as HTMLButtonElement).click())
	await page.click('.aixc-template[data-template=tunnel]')
	await page.waitForSelector('#experience-output [data-experience=tunnel]', { timeout: 10_000 })
	await page.waitForTimeout(1200)
	await snap('tunnel')
	const closePanel = page.locator('vg-guide').locator('.closebtn')
	if (await closePanel.isVisible().catch(() => false)) await closePanel.click()
	await measure('reimagined')
	// Every visible control of the reimagined view must be on top where you would press it.
	const covered = await page.evaluate(() =>
		[...document.querySelectorAll('#experience-output button, #experience-output a, .aixc-viewbar button')]
			.filter((el) => (el as HTMLElement).offsetParent && el.getBoundingClientRect().width > 0)
			.map((el) => {
				const c = el.getBoundingClientRect()
				if (c.bottom < 0 || c.top > innerHeight || c.right < 0 || c.left > innerWidth) return null
				const top = document.elementFromPoint(Math.min(innerWidth - 1, c.x + c.width / 2), Math.min(innerHeight - 1, c.y + c.height / 2))
				const floating = top && (top.tagName === 'VG-GUIDE' || !!top.closest('.pocket-peek, .pocket-curl, [class*="pocket-actor"], [class*="curl"], .voicetut-demo'))
				return floating && !(top === el || el.contains(top)) ? { control: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 40), at: [Math.round(c.x), Math.round(c.y)], under: top.tagName === 'VG-GUIDE' ? 'the guide' : String(top.className || top.tagName).slice(0, 40) } : null
			})
			.filter(Boolean),
	)
	check('tunnel: every control on screen can be pressed (none under a floating control)', covered.length === 0, covered)
	check('the composer is never recorded (data-vg)', await page.evaluate(() => [...document.querySelectorAll('.aixc-launcher, .aixc-composer')].every((el) => el.hasAttribute('data-vg'))))
	await page.locator('.pocket-peek').click()
	await page.waitForFunction(() => document.body.dataset.pocketView === 'open', null, { timeout: 10_000 })
	await page.waitForTimeout(1500)
	check('the Pocket opens from the reimagined view', true)
	await snap('pocket-from-reimagined')
	await page.keyboard.press('Escape')
	await page.waitForFunction(() => !document.body.dataset.pocketView, null, { timeout: 10_000 })
	await page.waitForTimeout(800)
	// O19: every phrasing of this question routes to the Vodafone Cash page, even "on this page".
	const sessionId = await page.evaluate(() => (window as any).voiceGuide.session.sessionId as string)
	const at = (await services.store.listTrace(sessionId)).length
	await say(ASK.cash)
	const lit = await spotOn().then(() => true, () => false)
	await page.waitForTimeout(2500)
	const landed = await page.evaluate(() => {
		const s = document.querySelector('vg-guide')?.shadowRoot?.querySelector('.spot') as HTMLElement | null
		const r = s?.getBoundingClientRect()
		const targets = r ? [...document.querySelectorAll('#experience-output [data-vg-destination="web.services.vodafone-cash"]')].filter((el) => { const b = el.getBoundingClientRect(); return b.width > 0 && b.left < r.right && r.left < b.right && b.top < r.bottom && r.top < b.bottom }) : []
		return { onReimagined: targets.length > 0, url: location.pathname }
	})
	const understood = (await services.store.listTrace(sessionId)).slice(at).find((e) => e.name === 'router.understood')?.attrs
	check('the spotlight lands on the visible reimagined Vodafone Cash item', lit && landed.onReimagined, { ...landed, lit, destination: understood?.destinationId })
	await snap('reimagined-question')
})

check('no page errors', errors.length === 0, errors.slice(0, 5))
fs.writeFileSync(path.join(dir, 'checks.json'), JSON.stringify({ run: tag, at: new Date().toISOString(), viewport, checks }, null, 2))
fs.writeFileSync(path.join(dir, 'controls.json'), JSON.stringify(controls, null, 2))
const failed = checks.filter((c) => !c.ok).length
console.log(`\n${tag}: ${checks.length - failed}/${checks.length} checks passed`)
await browser.close()
await gateway.close()
await services.close()
process.exit(0)
