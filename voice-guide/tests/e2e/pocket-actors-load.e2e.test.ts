/**
 * How the Pocket's mascot and drone reach Vodafone's own pages (live plan phase 3, S12): a chunk of
 * their own that the Pocket's chunk loads only when they can be of use, on the saved pages with the
 * live-page kit (./vodafone-layer.ts). What the actors then do is the actors' tests and S12's own.
 *
 * - An empty Pocket on a page without chips (wireless-net, below the coverage gate): the actors' chunk
 *   is never asked for, and nothing of the actors is on the page.
 * - A page with chips: the chunk loads at idle, without a press, and puts its stylesheet on the page
 *   once, marked; nothing throws on the page.
 * - Something pocketed: on the next page, even one without chips, the chunk loads at idle.
 * - The first press on a "Pocket it" chip loads it at once (idle held back, so only the press can).
 * - ?aixc=off: nothing of the layer is asked for, the actors' chunk least of all.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { after, before, test } from 'node:test'

import type { Page } from 'playwright'

import { ROOT } from '#shared/config.ts'

import { type LayerGateway, launchLayer, open, startLayerGateway, watch } from './vodafone-layer.ts'

const PORT = 4493
let gw: LayerGateway
/** The actors' chunk as the build named it (the manifest of packages/sdk/dist/aixc), or null when there is none. */
let chunk: string | null = null

before(async () => {
	gw = await startLayerGateway(PORT)
	const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'packages/sdk/dist/aixc/manifest.json'), 'utf8')) as { files: { file: string; entry: string | null }[] }
	chunk = manifest.files.find((f) => f.entry === 'src/host/demos/actors.js')?.file ?? null
})
after(async () => {
	await gw?.close()
})

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Every request for a file of the layer, and the actors' chunk's answers. */
function requests(page: Page) {
	const seen = { layer: [] as string[], actors: [] as string[], answers: [] as number[] }
	page.on('request', (r) => {
		const u = r.url()
		if (/\/sdk\/aixc\//.test(u)) seen.layer.push(u)
		if (chunk && u.endsWith(`/aixc/${chunk}`)) seen.actors.push(u)
	})
	page.on('response', (r) => {
		if (chunk && r.url().endsWith(`/aixc/${chunk}`)) seen.answers.push(r.status())
	})
	return seen
}

/** Nodes of the actors (their stage, floor, layer, grip, mascot, drone, cursor) and their stylesheet. */
const actorsOnPage = (page: Page) =>
	page.evaluate(() => ({
		nodes: document.querySelectorAll('[class*="pocket-actor"], [class*="pocket-mascot"], [class*="pocket-drone"], .pocket-cursor').length,
		styles: [...document.querySelectorAll<HTMLStyleElement>('style[data-aixc-css="pocket-actors"]')].map((s) => ({ marked: s.hasAttribute('data-aixc') && s.hasAttribute('data-vg'), floor: s.textContent!.includes('pocket-actor-floor') })),
	}))

async function pocketReady(page: Page) {
	await page.waitForFunction(() => (window as any).__aixc?.demos?.pocket?.chips, null, { timeout: 15_000 })
	await page.evaluate(() => (window as any).__aixc.demos.pocket.store.ready)
}

/** Longer than the idle wait's 2 s bound, with frames between. */
const pastIdle = (page: Page) => page.waitForTimeout(3_000)

/** Pockets the first card whose chip a press reaches; returns its id. */
async function pressFirstChip(page: Page) {
	const at = await page.evaluate(async () => {
		const tick = () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(done, 60))))
		for (const chip of document.querySelectorAll<HTMLElement>('.pocket-chips .pocket-cta[data-pocket-for]')) {
			const id = chip.dataset.pocketFor!
			const card = [...document.querySelectorAll<HTMLElement>(`#main-content [data-aixc-item="${CSS.escape(id)}"]`)].find((c) => !c.closest('.owl-item.cloned'))
			if (!card) continue
			card.scrollIntoView({ block: 'center', inline: 'nearest' })
			await tick()
			const r = chip.getBoundingClientRect()
			const x = r.left + r.width / 2
			const y = r.top + r.height / 2
			const hit = document.elementFromPoint(x, y)
			if (r.width && hit && (hit === chip || chip.contains(hit))) return { id, x, y }
		}
		return null
	})
	assert.ok(at, 'a chip a press reaches')
	await page.mouse.click(at.x, at.y)
	await page.waitForFunction((id) => (window as any).__aixc.demos.pocket.store.all().some((r: any) => r.id === id), at.id, { timeout: 5_000 })
	return at.id
}

const until = async (check: () => boolean, ms: number) => {
	const end = Date.now() + ms
	while (!check() && Date.now() < end) await new Promise((done) => setTimeout(done, 50))
	return check()
}

test('the actors load only where they can be of use: at idle with chips or a sticker, never for an empty Pocket without chips', { timeout: 120_000 }, async () => {
	const l = await launchLayer(gw)
	try {
		const seen = watch(l.page)
		const req = requests(l.page)
		assert.ok(chunk, 'the build has a chunk for src/host/demos/actors.js')

		// An empty Pocket, no chips: nothing asked for, nothing of the actors.
		await open(l.page, '/en/wireless-net', '?aixc-debug')
		await pocketReady(l.page)
		assert.equal(await l.page.evaluate(() => (window as any).__aixc.demos.pocket.chips()?.shown.length ?? 0), 0, 'wireless-net: no chips')
		await pastIdle(l.page)
		assert.deepEqual(req.actors, [], 'wireless-net, empty Pocket: the actors\' chunk is not asked for')
		assert.deepEqual(await actorsOnPage(l.page), { nodes: 0, styles: [] }, 'wireless-net, empty Pocket: nothing of the actors on the page')

		// A page with chips: at idle, without any press.
		await open(l.page, '/en/services', '?aixc-debug')
		await pocketReady(l.page)
		assert.equal(await l.page.evaluate(() => (window as any).__aixc.demos.pocket.store.all().length), 0, 'services: the Pocket is empty')
		assert.ok(await until(() => req.answers.length > 0, 5_000), `services: the actors' chunk asked for at idle (${req.actors.length} requests)`)
		assert.deepEqual(req.answers, [200], 'services: the chunk answered once')
		await l.page.waitForTimeout(500)
		assert.deepEqual(await actorsOnPage(l.page).then((a) => a.styles), [{ marked: true, floor: true }], 'services: the actors\' stylesheet once, marked')
		const id = await pressFirstChip(l.page)

		// Something pocketed: the next page, though it has no chips, loads them at idle.
		const before = req.actors.length
		await open(l.page, '/en/wireless-net', '?aixc-debug')
		await pocketReady(l.page)
		assert.ok(await l.page.evaluate((id) => (window as any).__aixc.demos.pocket.store.all().some((r: any) => r.id === id), id), 'wireless-net: the sticker kept on Services is there')
		assert.ok(await until(() => req.actors.length > before, 5_000), 'wireless-net with a sticker: the actors\' chunk asked for at idle')

		assert.deepEqual(seen.pageErrors, [], 'no page errors')
		assert.deepEqual(
			seen.layer.filter((line) => line.startsWith('error')),
			[],
			'the layer logged no error',
		)
		assert.ok(!seen.layer.some((line) => line.includes('the Pocket actors stopped')), `the actors did not stop (${seen.layer.join(' | ')})`)
		assert.deepEqual(l.reached, [], 'nothing reached the internet')
	} finally {
		await l.close()
	}
})

/** Idle callbacks asked for once the Pocket is up are held back, so that only a press can load the actors. */
const HOLD_IDLE = `(() => {
	const idle = window.requestIdleCallback?.bind(window)
	if (!idle) return
	window.requestIdleCallback = (fn, o) => (window.__aixc?.demos?.pocket ? 0 : idle(fn, o))
})()`

test('the first press on a "Pocket it" chip loads the actors at once', { timeout: 120_000 }, async () => {
	const l = await launchLayer(gw, { initScripts: [HOLD_IDLE] })
	try {
		const seen = watch(l.page)
		const req = requests(l.page)
		assert.ok(chunk, 'the build has a chunk for src/host/demos/actors.js')
		await open(l.page, '/en/services', '?aixc-debug')
		await pocketReady(l.page)
		await pastIdle(l.page)
		assert.deepEqual(req.actors, [], 'idle held back: not asked for before a press')
		assert.deepEqual(await actorsOnPage(l.page), { nodes: 0, styles: [] }, 'nothing of the actors before a press')
		const pressed = Date.now()
		await pressFirstChip(l.page)
		assert.ok(await until(() => req.answers.length > 0, 3_000), 'the press asked for the actors\' chunk')
		assert.ok(Date.now() - pressed < 3_000, `at once (${Date.now() - pressed} ms)`)
		assert.deepEqual(req.answers, [200])
		await l.page.waitForTimeout(800)
		assert.equal((await actorsOnPage(l.page)).styles.length, 1, 'their stylesheet is on the page once')
		assert.deepEqual(seen.pageErrors, [], 'no page errors (a save before the actors arrive has no greeting, and no error)')
		assert.ok(!seen.layer.some((line) => line.startsWith('error') || line.includes('the Pocket actors stopped')), `the layer and the actors carried on (${seen.layer.join(' | ')})`)
		assert.equal(await l.page.evaluate(() => (window as any).__aixc.state), 'ready', 'the layer is up')
	} finally {
		await l.close()
	}
})

test('?aixc=off: the actors\' chunk is never asked for', { timeout: 60_000 }, async () => {
	const l = await launchLayer(gw)
	try {
		const req = requests(l.page)
		await open(l.page, '/en/services', '?aixc=off')
		await pastIdle(l.page)
		assert.deepEqual(req.actors, [], 'not the actors\' chunk')
		assert.deepEqual(req.layer.filter((u) => !u.endsWith('/aixc/aixc.js')), [], 'no chunk of the layer at all')
		assert.deepEqual(await actorsOnPage(l.page), { nodes: 0, styles: [] }, 'nothing of the actors on the page')
	} finally {
		await l.close()
	}
})
