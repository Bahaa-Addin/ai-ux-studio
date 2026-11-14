/**
 * The Exploration Trail's consent on Vodafone's own pages, where the signed-out theme clears
 * `localStorage` on every load of home, Services, RED and Vodafone Cash (T-806; ADR-0050 §8; live plan
 * phase 3 S9), on the saved pages with the live-page kit (./vodafone-layer.ts) and the theme's clear stood in.
 *
 * - A person who allows the trail once is still recording on the next page, and the next, in both languages,
 *   on the pages that clear storage and the ones that do not.
 * - A person who turned it off is not offered it again after a clear.
 * - Nothing is stored for a person who has chosen nothing.
 */
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'

import type { Page } from 'playwright'

import { type LayerGateway, launchLayer, open, startLayerGateway, watch } from './vodafone-layer.ts'

const PORT = 4488
let gw: LayerGateway

before(async () => {
	gw = await startLayerGateway(PORT, { trail: true })
})
after(async () => {
	await gw?.close()
})

/* eslint-disable @typescript-eslint/no-explicit-any */
/** The trail has started on this page, and what it believes. */
async function trailOn(page: Page, path: string) {
	await open(page, path)
	await page.waitForFunction(() => (window as any).__vgTrailActive?.state?.rec !== undefined, null, { timeout: 20_000 })
	await page.waitForTimeout(500)
	return page.evaluate(() => {
		const w = window as any
		const c = w.__vgTrailActive
		return { consent: c.state.consent as string, rec: c.state.rec as string, steps: (c.session?.steps?.length ?? 0) as number, cleared: (w.__themeCleared ?? 0) as number, key: localStorage.getItem('vg-trail:' + c.siteKey + ':consent') !== null }
	})
}

const sitekey = (page: Page) => page.evaluate(() => (window as any).__vgTrailActive.siteKey as string)

test('allowed once, the trail is still recording on every next page, the ones that clear storage included, in both languages (S9, T-806)', async () => {
	const l = await launchLayer(gw, { themeClear: true, reducedMotion: true })
	try {
		const seen = watch(l.page)
		const first = await trailOn(l.page, '/en/home')
		assert.deepEqual([first.consent, first.rec], ['unset', 'awaiting-consent'], 'no choice yet: the offer')
		assert.ok(first.cleared >= 1, 'the theme cleared storage on home')
		assert.equal(await l.page.evaluate(async () => (await indexedDB.databases()).some((d) => d.name === 'vg-trail-consent')), false, 'nothing is stored for a person who has chosen nothing')
		// The person presses the pill and allows it.
		await l.page.locator('.tr-pill').click()
		await l.page.locator('.tr-allow').click()
		await l.page.waitForFunction(() => (window as any).__vgTrailActive.state.consent === 'granted', null, { timeout: 5_000 })
		await l.page.waitForTimeout(500)
		let steps = 0
		for (const path of ['/en/services', '/en/mobile-internet-bundles', '/en/vodafone-cash', '/en/home', '/ar/services', '/ar/mobile-internet-bundles', '/ar/home']) {
			const now = await trailOn(l.page, path)
			assert.equal(now.consent, 'granted', `${path}: still allowed${now.cleared ? ' after the theme cleared storage' : ''}`)
			assert.equal(now.key, true, `${path}: the key is back for the other tabs`)
			assert.ok(['recording', 'blocked'].includes(now.rec) && now.rec !== 'awaiting-consent', `${path}: not asking again (${now.rec})`)
			assert.ok(now.steps >= steps, `${path}: the journey goes on (${now.steps} steps)`)
			steps = now.steps
		}
		assert.ok(steps >= 3, `the journey grew across the pages (${steps} steps)`)
		assert.deepEqual(seen.pageErrors, [], 'no page errors')
		assert.deepEqual(l.reached, [], 'nothing reached the internet')
	} finally {
		await l.close()
	}
})

test('turned off, the trail stays off after the theme clears storage: the offer does not come back (S9)', async () => {
	const l = await launchLayer(gw, { themeClear: true, reducedMotion: true })
	try {
		await trailOn(l.page, '/en/services')
		await l.page.locator('.tr-pill').click()
		await l.page.locator('.tr-allow').click()
		await l.page.waitForFunction(() => (window as any).__vgTrailActive.state.consent === 'granted', null, { timeout: 5_000 })
		await l.page.waitForTimeout(400)
		await l.page.evaluate(() => (window as any).voiceGuide.trailHost.turnOff())
		await l.page.waitForFunction(() => (window as any).__vgTrailActive.state.consent === 'off', null, { timeout: 5_000 })
		await l.page.waitForTimeout(300)
		for (const path of ['/en/home', '/ar/vodafone-cash', '/en/services']) {
			const now = await trailOn(l.page, path)
			assert.deepEqual([now.consent, now.rec], ['off', 'disabled'], `${path}: still off after a page that clears storage`)
		}
		assert.ok((await sitekey(l.page)).length > 0)
	} finally {
		await l.close()
	}
})
