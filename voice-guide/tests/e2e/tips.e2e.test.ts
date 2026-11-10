/**
 * Tips, the walkthrough of the four demos in the Services clone (ADR-0045), with the real guide on
 * the page as `npm run demo:trail` runs it: the voice and journey tips can be tried, their coach
 * marks ring the guide's own microphone and "Your journey" pill and wait for a real press, and the
 * Tips button never overlaps a floating control, in English and Arabic, desktop and phone.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { Page } from 'playwright'

import { recording, tr, V, vodafonePocket } from './vodafone-pocket.ts'

const { launch } = vodafonePocket(4474)

type Box = { x: number; y: number; w: number; h: number } | null

/** The floating controls (runbook §5a) and the Tips button. */
const controls = (page: Page) =>
	page.evaluate(() => {
		const r = document.querySelector('vg-guide')?.shadowRoot
		const box = (el: Element | null | undefined) => {
			if (!el) return null
			const s = getComputedStyle(el)
			const b = el.getBoundingClientRect()
			return b.width && b.height && s.visibility !== 'hidden' && s.display !== 'none' && +s.opacity > 0.05 ? { x: b.x, y: b.y, w: b.width, h: b.height } : null
		}
		return {
			tips: box(document.querySelector('.tips-entry')),
			mic: box(r?.querySelector('.vg-mic')),
			accessibility: box(document.getElementById('vodafone-aw-icon')),
			pocket: box(document.querySelector('.pocket-peek:not([data-state="hidden"])')),
			reimagine: box(document.querySelector('.aixc-launcher')),
			journey: box(r?.querySelector('.tr-pill')),
		} as Record<string, Box>
	})

const overlaps = (a: Box, b: Box) => Boolean(a && b) && a!.x < b!.x + b!.w && b!.x < a!.x + a!.w && a!.y < b!.y + b!.h && b!.y < a!.y + a!.h
const contains = (outer: Box, inner: Box) => Boolean(outer && inner) && outer!.x <= inner!.x && outer!.y <= inner!.y && outer!.x + outer!.w >= inner!.x + inner!.w && outer!.y + outer!.h >= inner!.y + inner!.h
const pairs = (c: Record<string, Box>) => {
	const names = Object.keys(c).filter((k) => c[k])
	const hits: string[] = []
	for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) if (overlaps(c[names[i]], c[names[j]])) hits.push(`${names[i]}/${names[j]}`)
	return hits
}

const coach = (page: Page) =>
	page.evaluate(() => {
		const layer = document.querySelector('.tips-coach') as HTMLElement | null
		const box = (el: Element | null | undefined) => {
			if (!el || (el as HTMLElement).hidden) return null
			const b = el.getBoundingClientRect()
			return { x: b.x, y: b.y, w: b.width, h: b.height }
		}
		return {
			shown: Boolean(layer && !layer.hidden),
			title: layer?.querySelector('.tips-pop__title')?.textContent || '',
			success: Boolean(layer?.querySelector('.tips-pop.is-success')),
			pop: box(layer?.querySelector('.tips-pop')),
			ring: box(layer?.querySelector('.tips-coach__ring')),
		}
	})

const coachDone = async (page: Page) => {
	await page.waitForSelector('.tips-coach .tips-pop.is-success', { timeout: 15_000 })
	return coach(page)
}

const coachSays = async (page: Page, text: string) => {
	await page.waitForFunction((t) => (document.querySelector('.tips-coach .tips-pop__title')?.textContent || '').includes(t), text, { timeout: 15_000 })
	await page.waitForTimeout(500)
	return coach(page)
}

/** Opens the tips from the Tips button (they reopen at the last card seen) and pages to a card. */
const openAt = async (page: Page, card: string) => {
	await page.locator('.tips-entry').click()
	await page.waitForSelector('.tips.is-open')
	await page.waitForTimeout(600)
	const at = () => page.evaluate((id) => ({ now: Number((document.querySelector('.tips-card.is-active') as HTMLElement).dataset.index), want: Number((document.querySelector(`.tips-card[data-card="${id}"]`) as HTMLElement).dataset.index) }), card)
	for (let { now, want } = await at(); now !== want; { now, want } = await at()) {
		await page.locator(now < want ? '.tips-next' : '.tips-prev').click()
		await page.waitForTimeout(450)
	}
}

test('Tips: the voice and journey tips are tried on the guide’s own microphone and pill, English and Arabic', async () => {
	const { b, page } = await launch({ consented: true })
	try {
		for (const lang of ['en', 'ar']) {
			await page.goto(`${V}/${lang}/services`, { waitUntil: 'domcontentloaded' })
			await recording(page)
			await page.waitForFunction(() => document.documentElement.dataset.vgTrail === 'on')
			await page.waitForTimeout(600)
			const load = await controls(page)
			assert.ok(load.tips && load.mic && load.journey && load.accessibility, `${lang}: Tips button, microphone, pill and accessibility on the page`)
			assert.deepEqual(pairs(load), [], `${lang}: no floating controls overlap on load`)

			await openAt(page, 'voice-ask')
			assert.ok(await page.locator('.tips-card.is-active .tips-try').isVisible(), `${lang}: the voice tip offers Try it`)
			// The accessibility button stays reachable while the tips are open (AGENTS.md §4.6).
			const a11y = await page.evaluate(() => {
				const r = document.getElementById('vodafone-aw-icon')!.getBoundingClientRect()
				return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest('#vodafone-aw-icon')?.id
			})
			assert.equal(a11y, 'vodafone-aw-icon', `${lang}: accessibility button reachable over the tips`)
			await page.locator('.tips-card.is-active .tips-try').click()
			let state = await coachSays(page, lang === 'ar' ? 'المايك' : 'microphone')
			let c = await controls(page)
			assert.ok(contains(state.ring, c.mic), `${lang}: the coach rings the microphone`)
			for (const k of ['mic', 'accessibility', 'journey', 'reimagine', 'pocket']) assert.ok(!overlaps(state.pop, c[k]), `${lang}: the popover is clear of ${k}`)
			await tr(page, '.vg-mic').click()
			state = await coachDone(page)
			assert.match(state.title, lang === 'ar' ? /المرشد/ : /the guide/, `${lang}: pressing the microphone finishes the voice tip`)
			await page.keyboard.press('Escape')
			// Stop listening again, as a person would.
			await tr(page, '.vg-mic').click()
			await page.waitForTimeout(400)

			await openAt(page, 'journey-remember')
			await page.locator('.tips-card.is-active .tips-try').click()
			state = await coachSays(page, lang === 'ar' ? 'رحلتك' : 'Your journey')
			c = await controls(page)
			assert.ok(contains(state.ring, c.journey), `${lang}: the coach rings the Your journey pill`)
			for (const k of ['mic', 'accessibility', 'journey', 'reimagine']) assert.ok(!overlaps(state.pop, c[k]), `${lang}: the popover is clear of ${k}`)
			await tr(page, '.tr-pill').click()
			state = await coachDone(page)
			assert.match(state.title, lang === 'ar' ? /رحلتك/ : /your journey/, `${lang}: pressing the pill finishes the journey tip`)
			await page.waitForSelector('.pocket-journey-layer:not([hidden])', { timeout: 15_000 })
			const hidden = await page.evaluate(() => getComputedStyle(document.querySelector('.tips-entry')!).visibility)
			assert.equal(hidden, 'hidden', `${lang}: the Tips button steps aside in the open Pocket`)
			await page.keyboard.press('Escape')
		}
	} finally {
		await b.close()
	}
})

test('Tips: the button never overlaps a floating control, with the Pocket peeking, desktop and phone', async () => {
	for (const phone of [false, true]) {
		const { b, page } = await launch({ consented: true, phone })
		try {
			for (const lang of ['en', 'ar']) {
				await page.goto(`${V}/${lang}/services`, { waitUntil: 'domcontentloaded' })
				await recording(page)
				await page.waitForFunction(() => document.documentElement.dataset.vgTrail === 'on')
				await page.waitForTimeout(500)
				assert.deepEqual(pairs(await controls(page)), [], `${lang} ${phone ? 'phone' : 'desktop'}: on load`)
				await page.locator('#source-content [data-aixc-item="roaming"] .pocket-cta').click()
				await page.waitForSelector('.pocket-peek[data-state="shown"]')
				await page.waitForTimeout(1600)
				const peeking = await controls(page)
				assert.ok(peeking.pocket, 'the Pocket peeks')
				assert.deepEqual(pairs(peeking), [], `${lang} ${phone ? 'phone' : 'desktop'}: with the Pocket peeking`)
				await page.evaluate(() => localStorage.removeItem('aixc.pocket.v1'))
			}
		} finally {
			await b.close()
		}
	}
})
