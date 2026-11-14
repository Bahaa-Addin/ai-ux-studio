/**
 * How the Pocket's portal reaches Vodafone's own pages (live plan phase 3, S13; experiences ADR-0005): a
 * chunk of its own that the Pocket's chunk loads only when the album opens, or at once when this history
 * entry says the album was open (Back), on the saved pages with the live-page kit (./vodafone-layer.ts).
 * What the portal then does on a click is the portal's tests and the lead's integration test.
 *
 * - Nothing is asked for at load, nor with an empty album; pocketing a sticker through its chip is not
 *   opening the album either.
 * - Opening the album with the Pocket button asks for the portal's chunk, once; the sticker's link in the
 *   album has no target (it leaves in this tab).
 * - ?aixc=off: nothing of the layer is asked for, the portal's chunk least of all.
 * - Back to an entry marked { vfPortal } (here: the mark, then a reload, with every idle callback held
 *   back): the Pocket's and the portal's chunks are asked for without waiting for idle, and the album shows.
 * - The portal's chunk fails (its route aborted): the album still opens and closes, and a press on a
 *   sticker's link navigates in this tab, as a plain link; the layer carries on.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { after, before, test } from 'node:test'

import type { Page } from 'playwright'

import { ROOT } from '#shared/config.ts'

import { type LayerGateway, launchLayer, open, startLayerGateway, watch } from './vodafone-layer.ts'

const PORT = 4480
let gw: LayerGateway
/** The chunks as the build named them (the manifest of packages/sdk/dist/aixc). */
const chunks = { pocket: '', portal: '', scene: '' }

before(async () => {
	gw = await startLayerGateway(PORT)
	const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'packages/sdk/dist/aixc/manifest.json'), 'utf8')) as { files: { file: string; entry: string | null }[] }
	const named = (entry: string) => manifest.files.find((f) => f.entry === entry)?.file ?? ''
	chunks.pocket = named('src/host/demos/pocket.js')
	chunks.portal = named('src/host/demos/portal.js')
	chunks.scene = named('src/pocket/portal/controller.js')
})
after(async () => {
	await gw?.close()
})

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Every request for a file of the layer, and when each chunk was asked for (ms since `since`). */
function requests(page: Page) {
	const seen = { layer: [] as string[], at: {} as Record<string, number[]>, since: Date.now() }
	page.on('request', (r) => {
		const u = r.url()
		if (!/\/sdk\/aixc\//.test(u)) return
		seen.layer.push(u)
		for (const [name, file] of Object.entries(chunks)) if (file && u.endsWith(`/aixc/${file}`)) (seen.at[name] ??= []).push(Date.now() - seen.since)
	})
	return seen
}
const asked = (seen: ReturnType<typeof requests>, name: keyof typeof chunks) => seen.at[name]?.length ?? 0

async function pocketReady(page: Page) {
	await page.waitForFunction(() => (window as any).__aixc?.demos?.pocket?.chips, null, { timeout: 15_000 })
	await page.evaluate(() => (window as any).__aixc.demos.pocket.store.ready)
}

/** Longer than the idle wait's 2 s bound, with frames between. */
const pastIdle = (page: Page) => page.waitForTimeout(3_000)

const until = async (check: () => boolean | Promise<boolean>, ms: number) => {
	const end = Date.now() + ms
	while (!(await check()) && Date.now() < end) await new Promise((done) => setTimeout(done, 50))
	return check()
}

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

/** Opens the album with a press at the Pocket button, as a person would, and waits until it shows. */
async function pressPocketButton(page: Page) {
	await page.waitForSelector('.pocket-peek[data-state="shown"]', { timeout: 5_000 })
	await page.waitForFunction(() => document.querySelectorAll('.curl-host--flying').length === 0, null, { timeout: 8_000 })
	await page.waitForTimeout(900)
	const box = await page.evaluate(() => {
		const r = document.querySelector('.pocket-peek[data-state="shown"]')!.getBoundingClientRect()
		return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
	})
	await page.mouse.click(box.x, box.y)
	await albumShows(page)
}

const albumShows = (page: Page, timeout = 10_000) =>
	page.waitForFunction(
		() => {
			const s = (window as any).__aixc?.demos?.pocket?.state
			return s?.view === 'pocket' && !s.busy && !document.getElementById('pocket-output')?.hidden
		},
		null,
		{ timeout },
	)

/** The sticker links in the album: their href and target attribute. */
const stickerLinks = (page: Page) =>
	page.evaluate(() => [...document.querySelectorAll<HTMLAnchorElement>('#pocket-output .pocket-sticker a[href]')].map((a) => ({ href: a.href, target: a.getAttribute('target') })))

test('the portal\'s chunk is asked for only when the album opens; the sticker\'s link leaves in this tab', { timeout: 120_000 }, async () => {
	const l = await launchLayer(gw, { reducedMotion: true })
	try {
		const seen = watch(l.page)
		assert.ok(chunks.portal && chunks.scene && chunks.pocket, `the build has the portal's, the scene's and the Pocket's chunks (${JSON.stringify(chunks)})`)
		const req = requests(l.page)
		await open(l.page, '/en/services', '?aixc-debug')
		await pocketReady(l.page)
		await pastIdle(l.page)
		assert.equal(asked(req, 'pocket'), 1, 'the Pocket\'s chunk loaded')
		assert.equal(asked(req, 'portal'), 0, 'at load: the portal\'s chunk is not asked for')
		assert.equal(await l.page.evaluate(() => (window as any).__aixc.demos.pocket.store.all().length), 0, 'the Pocket is empty')

		// An empty album: Vodafone's page stays, nothing is asked for.
		await l.page.evaluate(() => (window as any).__aixc.demos.pocket.open())
		await l.page.waitForTimeout(500)
		assert.equal(await l.page.evaluate(() => (window as any).__aixc.demos.pocket.state.view), 'page', 'an empty album does not open')
		assert.equal(asked(req, 'portal'), 0, 'with an empty album: the portal\'s chunk is not asked for')

		// Pocketing through a chip is not opening the album.
		await pressFirstChip(l.page)
		await l.page.waitForTimeout(800)
		assert.equal(asked(req, 'portal'), 0, 'a sticker pocketed: still not asked for')

		await pressPocketButton(l.page)
		assert.ok(await until(() => asked(req, 'portal') > 0, 5_000), 'the album opened: the portal\'s chunk asked for')
		await l.page.waitForTimeout(800)
		assert.equal(asked(req, 'portal'), 1, 'once')
		const links = await stickerLinks(l.page)
		assert.ok(links.length >= 1, 'the album shows the sticker with its link')
		assert.deepEqual(
			links.map((x) => x.target),
			links.map(() => null),
			`the sticker links have no target attribute (${JSON.stringify(links)})`,
		)
		assert.deepEqual(seen.pageErrors, [], 'no page errors')
		assert.ok(!seen.layer.some((line) => line.startsWith('error') || line.includes('no portal')), `the layer carried on, the portal arrived (${seen.layer.join(' | ')})`)
		assert.equal(await l.page.evaluate(() => (window as any).__aixc.state), 'ready', 'the layer is up')
		assert.deepEqual(l.reached, [], 'nothing reached the internet')
	} finally {
		await l.close()
	}
})

test('?aixc=off: the portal\'s chunk is never asked for', { timeout: 60_000 }, async () => {
	const l = await launchLayer(gw)
	try {
		const req = requests(l.page)
		await open(l.page, '/en/services', '?aixc=off')
		await pastIdle(l.page)
		assert.equal(asked(req, 'portal'), 0, 'not the portal\'s chunk')
		assert.deepEqual(req.layer.filter((u) => !u.endsWith('/aixc/aixc.js')), [], 'no chunk of the layer at all')
	} finally {
		await l.close()
	}
})

/** Every idle callback is held back once the history entry is marked, so only the Back path can load the demos. */
const HOLD_IDLE_ON_BACK = `(() => {
	const idle = window.requestIdleCallback?.bind(window)
	if (!idle) return
	window.requestIdleCallback = (fn, o) => (history.state?.vfPortal ? 0 : idle(fn, o))
})()`

test('Back to an album the portal left open: the Pocket\'s and the portal\'s chunks without waiting for idle, and the album shows', { timeout: 120_000 }, async () => {
	const l = await launchLayer(gw, { reducedMotion: true, initScripts: [HOLD_IDLE_ON_BACK] })
	try {
		const seen = watch(l.page)
		await open(l.page, '/en/services', '?aixc-debug')
		await pocketReady(l.page)
		await pressFirstChip(l.page)
		// The mark the portal leaves on this entry before it navigates (experiences/src/pocket/portal/history.js).
		await l.page.evaluate(() => history.replaceState({ ...(history.state ?? {}), vfPortal: { view: 'pocket', scrollY: 0 } }, ''))
		const req = requests(l.page)
		await l.page.reload({ waitUntil: 'load' })
		assert.ok(await l.page.evaluate(() => !!history.state?.vfPortal), 'the entry is still marked after the reload')
		assert.ok(await until(() => asked(req, 'pocket') > 0 && asked(req, 'portal') > 0, 10_000), `both chunks asked for with idle held back (${JSON.stringify(req.at)})`)
		await albumShows(l.page)
		assert.ok((await stickerLinks(l.page)).length >= 1, 'the album shows the sticker')
		assert.deepEqual(seen.pageErrors, [], 'no page errors')
		assert.ok(!seen.layer.some((line) => line.startsWith('error') || line.includes('no portal')), `the layer carried on (${seen.layer.join(' | ')})`)

		// A fresh visit to the same address is not Back: no mark, and the demos wait for idle again (held here).
		const fresh = requests(l.page)
		await l.page.evaluate(() => history.replaceState(null, ''))
		await open(l.page, '/en/services', '?aixc-debug')
		await l.page.waitForTimeout(1_500)
		assert.equal(asked(fresh, 'portal'), 0, 'a fresh visit: the portal\'s chunk is not asked for')
	} finally {
		await l.close()
	}
})

test('the portal\'s chunk fails: the album works, a sticker\'s link navigates in this tab, the layer carries on', { timeout: 120_000 }, async () => {
	const l = await launchLayer(gw, { reducedMotion: true })
	try {
		const seen = watch(l.page)
		let aborted = 0
		await l.page.route(`**/aixc/${chunks.portal}`, (route) => {
			aborted++
			return route.abort()
		})
		await open(l.page, '/en/services', '?aixc-debug')
		await pocketReady(l.page)
		await pressFirstChip(l.page)
		await pressPocketButton(l.page)
		assert.ok(await until(() => aborted > 0, 5_000), 'the portal\'s chunk was asked for, and failed')
		await l.page.waitForTimeout(500)
		assert.ok(await until(() => seen.layer.some((line) => line.includes('no portal')), 3_000), `the failure is reported (${seen.layer.join(' | ')})`)
		assert.equal(await l.page.evaluate(() => (window as any).__aixc.state), 'ready', 'the layer is up')

		// The album still turns back and opens again.
		await l.page.evaluate(() => (window as any).__aixc.demos.pocket.close())
		await l.page.waitForFunction(() => (window as any).__aixc.demos.pocket.state.view === 'page' && !(window as any).__aixc.demos.pocket.state.busy, null, { timeout: 10_000 })
		await l.page.evaluate(() => (window as any).__aixc.demos.pocket.open())
		await albumShows(l.page)
		assert.equal(aborted, 1, 'asked for once only')

		const [link] = await stickerLinks(l.page)
		assert.ok(link, 'a sticker link')
		assert.equal(link.target, null, 'no target: it opens in this tab')
		const pages = l.b.context.pages().length
		const nav = l.page.waitForEvent('framenavigated', { predicate: (f) => f === l.page.mainFrame(), timeout: 10_000 })
		await l.page.locator('#pocket-output .pocket-sticker a[href]').first().click()
		await nav
		assert.equal(new URL(l.page.url()).pathname, new URL(link.href).pathname, `the tab went to the sticker's page (${l.page.url()})`)
		assert.equal(l.b.context.pages().length, pages, 'no new tab')
		assert.deepEqual(seen.pageErrors, [], 'no page errors')
		assert.ok(!seen.layer.some((line) => line.startsWith('error')), `the layer logged no error (${seen.layer.join(' | ')})`)
	} finally {
		await l.close()
	}
})
