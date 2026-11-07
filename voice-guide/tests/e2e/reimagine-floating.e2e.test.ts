/**
 * The floating controls in the Reimagine view of the Services clone, with the guide on the page:
 * the view bar and the launcher keep clear of the journey pill (B-23), and the Pocket corner
 * tucks in so nothing covers an experience's own controls (ADR-0044, B-24). Split from
 * pocket-journey.e2e.test.ts so each file stays within the per-file test timeout.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { Page } from 'playwright'

import { recording, tr, V, vodafonePocket } from './vodafone-pocket.ts'

const { launch } = vodafonePocket(4473)

test('Reimagine: the view bar and its launcher stay clear of the journey pill, in English and Arabic (B-23)', async () => {
	const { b, page } = await launch({ consented: true })
	try {
		for (const lang of ['en', 'ar']) {
			await page.goto(`${V}/${lang}/services`, { waitUntil: 'domcontentloaded' })
			await recording(page)
			await page.waitForFunction(() => document.documentElement.dataset.vgTrail === 'on')
			const pill = (await tr(page, '.tr-pill').boundingBox())!
			const launcher = (await page.locator('.aixc-launcher').boundingBox())!
			assert.ok(launcher.y >= pill.y + pill.height, `${lang}: the launcher sits below the pill`)
			assert.ok(Math.abs(launcher.x + (lang === 'ar' ? 0 : launcher.width) - (pill.x + (lang === 'ar' ? 0 : pill.width))) <= 2, `${lang}: on the pill's side`)
			await page.locator('.aixc-launcher').click()
			await page.locator('.aixc-template[data-template=magazine]').click()
			await page.waitForSelector('#experience-output .aixc-magazine')
			await page.waitForTimeout(400)
			// Every button of the view bar is what you press at its centre, not the guide's pill.
			const covered = await page.evaluate(() =>
				[...document.querySelectorAll('.aixc-viewbar button')]
					.filter((el) => (el as HTMLElement).offsetParent)
					.filter((el) => {
						const r = el.getBoundingClientRect()
						const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
						return !(top === el || el.contains(top))
					})
					.map((el) => el.textContent!.trim()),
			)
			assert.deepEqual(covered, [], `${lang}: view bar buttons under the pill`)
		}
	} finally {
		await b.close()
	}
})

/** The reimagined view's controls on screen that something else covers where you would press them. */
const coveredControls = (page: Page) =>
	page.evaluate(() =>
		[...document.querySelectorAll('#experience-output button, .aixc-viewbar button')]
			.filter((el) => (el as HTMLElement).offsetParent)
			.map((el) => {
				const r = el.getBoundingClientRect()
				if (!r.width || r.bottom <= 0 || r.top >= innerHeight || r.right <= 0 || r.left >= innerWidth) return null
				const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
				if (!top || top === el || el.contains(top) || !top.closest('vg-guide, #vodafone-aw-icon, .pocket-peek, .pocket-layer')) return null
				return `${el.getAttribute('aria-label') || el.textContent!.trim()} under ${top.closest('vg-guide') ? 'the guide' : top.closest('#vodafone-aw-icon') ? 'accessibility' : 'the Pocket'}`
			})
			.filter(Boolean),
	)

/** The floating controls' boxes: microphone, accessibility, the Pocket button. */
const floating = (page: Page) =>
	page.evaluate(() => {
		const box = (el: Element | null | undefined) => {
			const r = el?.getBoundingClientRect()
			return r && r.width && getComputedStyle(el!).opacity !== '0' ? { x: r.x, y: r.y, w: r.width, h: r.height } : null
		}
		return {
			mic: box(document.querySelector('vg-guide')?.shadowRoot?.querySelector('.vg-mic')),
			accessibility: box(document.getElementById('vodafone-aw-icon')),
			pocket: box(document.querySelector('.pocket-peek:not([data-state="hidden"])')),
		}
	})

test('Reimagine: the Pocket corner tucks in and nothing covers the experience controls, empty or not, desktop and phone (O20)', async () => {
	for (const phone of [false, true]) {
		const { b, page } = await launch({ consented: true, phone })
		try {
			await page.goto(`${V}/en/services`, { waitUntil: 'domcontentloaded' })
			await recording(page)
			for (const pocketed of [0, 2]) {
				for (const id of ['vodafone-cash', 'roaming'].slice(0, pocketed)) {
					// "Pocket it" is on the original page: switch back to it first.
					if (await page.locator('.aixc-seg').first().isVisible()) await page.locator('.aixc-seg').first().click()
					await page.locator(`[data-aixc-item="${id}"] .pocket-cta`).scrollIntoViewIfNeeded()
					await page.locator(`[data-aixc-item="${id}"] .pocket-cta`).click()
					await page.waitForTimeout(1600)
				}
				for (const template of ['tunnel', 'spotlight']) {
					if (await page.locator('.aixc-launcher').isVisible()) await page.locator('.aixc-launcher').click()
					else await page.locator('.aixc-viewbar__actions button').first().click()
					await page.locator(`.aixc-template[data-template=${template}]`).click()
					await page.waitForSelector(`#experience-output [data-experience=${template}]`)
					await page.waitForTimeout(900)
					const where = `${phone ? 'phone' : 'desktop'}, ${pocketed} in the Pocket, ${template}`
					assert.deepEqual(await coveredControls(page), [], where)
					const f = await floating(page)
					const boxes = Object.entries(f).filter(([, v]) => v) as [string, { x: number; y: number; w: number; h: number }][]
					for (const [n, a] of boxes) for (const [m, c] of boxes) if (n < m) assert.ok(!(a.x < c.x + c.w && c.x < a.x + a.w && a.y < c.y + c.h && c.y < a.y + a.h), `${where}: ${n} and ${m} overlap`)
					assert.equal(!!f.pocket, pocketed > 0, `${where}: the Pocket button shows only with something in it`)
					// The curl is drawn with pointer-events: none, so the click checks above cannot see it.
					assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('.pocket-layer')].map((l) => getComputedStyle(l).opacity)), ['0', '0'], `${where}: no curl`)
				}
			}
			// The tucked button still opens the Pocket, with the page turn.
			await page.locator('.pocket-peek').click()
			await page.waitForFunction(() => document.body.dataset.pocketView === 'open')
		} finally {
			await b.close()
		}
	}
})
