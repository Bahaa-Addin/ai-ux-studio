/**
 * Reimagine's launcher on Vodafone's own pages (live plan phase 4a; ADR-0076; phase 4 design §3.3, §3.4), on the
 * saved pages with the live-page kit (./vodafone-layer.ts) and the trail on, in English and Arabic, at 1366x900
 * and 375x812.
 *
 * - The gate: shown on Services, the bundles, home and RED (Benefits); never on Vodafone Cash, Wireless Net or
 *   Promotions. Marked as ours, named in the page's language, stacked between Vodafone's content and its pinned
 *   navigation.
 * - Under the trail's pill on its side, within 2 px, at the top of the page and after a scroll (the pill moved
 *   by Vodafone's navigation pinning); off the screen with the pill when it tucks away (nothing of ours over a chip),
 *   back under it within 2 px when it comes back mid-page or at the top, and on the screen while a keyboard focus
 *   is on it. Without a pill, under Vodafone's header at the inline end near the top (scrolled less than 120 px),
 *   off the screen below that, the way back up included. The pill found as it mounts, before the trail says it is
 *   up, and never under it meanwhile.
 * - Hidden while the trail's consent card or toast, the Pocket's album, a reimagined view, one of Vodafone's menus
 *   (the end-most desktop dropdown, the Shop dropdown, the phone menu, a signed-out visitor's login card, at the top
 *   of the page: a press at their points reaches Vodafone's menu) or a dialog shows, and when a later reading fails
 *   the gate; shown again after.
 * - Clear of the first screen's "Pocket it" chips (home and Services, both languages, both sizes), and in their
 *   obstacle list: a chip under it takes another corner when it arrives, and keeps it while a menu of Vodafone's
 *   opens over it; the chips keep its place at the top of the page through what happens mid-page.
 * - The shell's chunk is asked for only on a press; the kill switches (?aixc=off, demos.reimagine false, the
 *   guard's stop: no observer or subscription of its own left) leave no launcher and ask for nothing; a failure at
 *   its press gives the page back.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { after, before, test } from 'node:test'

import type { Page } from 'playwright'

import { ROOT } from '#shared/config.ts'

import { DESKTOP, geometry, type LayerGateway, launchLayer, layerState, open, PHONE, startLayerGateway, watch } from './vodafone-layer.ts'

const PORT = 4481
let gw: LayerGateway
/** The launcher's and the shell's chunks as the build named them (packages/sdk/dist/aixc/manifest.json). */
const chunk = { launcher: '', shell: '' }

before(async () => {
	gw = await startLayerGateway(PORT, { trail: true })
	const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'packages/sdk/dist/aixc/manifest.json'), 'utf8')) as { files: { file: string; entry: string | null }[] }
	chunk.launcher = manifest.files.find((f) => f.entry === 'src/host/demos/reimagine.js')?.file ?? ''
	chunk.shell = manifest.files.find((f) => f.entry === 'src/host/demos/reimagine/shell.js')?.file ?? ''
})
after(async () => {
	await gw?.close()
})

/* eslint-disable @typescript-eslint/no-explicit-any */
const PASS = ['/en/services', '/ar/services', '/en/mobile-internet-bundles', '/ar/mobile-internet-bundles', '/en/home', '/ar/home', '/en/vodafone-red1', '/ar/vodafone-red1']
const FAIL = ['/en/vodafone-cash', '/ar/vodafone-cash', '/en/wireless-net', '/ar/wireless-net', '/en/promotions']
const LABEL = { en: 'Reimagine this page', ar: 'غيّر شكل الصفحة' }
const langOf = (p: string) => (p.startsWith('/ar/') ? 'ar' : 'en')
const sizeOf = (v: { width: number }) => (v.width === DESKTOP.width ? 'desktop' : 'phone')

type Box = { left: number; top: number; right: number; bottom: number }
const meets = (a: Box, b: Box) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
const fmt = (b: Box | null | undefined) => (b ? `[${[b.left, b.top, b.right, b.bottom].map((n) => Math.round(n)).join(',')}]` : 'none')

/** Two frames and a little more. */
const settle = (page: Page, ms = 60) => page.evaluate((ms) => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(done, ms)))), ms)

/** The layer is up and the launcher's chunk has started (with ?aixc-debug). */
async function launcherReady(page: Page) {
	await page.waitForFunction(() => (window as any).__aixc?.demos?.reimagine, null, { timeout: 15_000 })
	await settle(page)
}

/** The trail's pill shows (the trail is on in this gateway). */
const pillReady = (page: Page) => page.waitForFunction(() => !!document.querySelector('vg-guide')?.shadowRoot?.querySelector('.tr-pill:not([hidden])'), null, { timeout: 20_000 })

/** The launcher as a person meets it. */
const launcherOf = (page: Page) =>
	page.evaluate(() => {
		const b = document.querySelector<HTMLButtonElement>('.aixc-launcher')
		if (!b) return null
		const r = b.getBoundingClientRect()
		const s = getComputedStyle(b)
		return {
			box: { left: r.left, top: r.top, right: r.right, bottom: r.bottom },
			hidden: b.hidden,
			visibility: s.visibility,
			shown: !b.hidden && s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0,
			z: s.zIndex,
			position: s.position,
			marked: b.hasAttribute('data-aixc') && b.hasAttribute('data-vg'),
			expanded: b.getAttribute('aria-expanded'),
			controls: b.getAttribute('aria-controls'),
			type: b.type,
			label: (b.textContent ?? '').trim(),
			lang: b.lang,
			beforeMain: !!b.nextElementSibling && (b.nextElementSibling.id === 'main-content' || b.nextElementSibling.id === 'aixc-viewbar'),
			count: document.querySelectorAll('.aixc-launcher').length,
			view: { width: document.documentElement.clientWidth, height: innerHeight },
			debug: (window as any).__aixc?.demos?.reimagine?.debug?.() ?? null,
		}
	})

/** The trail's pill where it rests (its transform taken off: hover and tuck move it by a transform only). */
const pillOf = (page: Page) =>
	page.evaluate(() => {
		const p = document.querySelector('vg-guide')?.shadowRoot?.querySelector<HTMLElement>('.tr-pill')
		if (!p || p.hidden || !p.getClientRects().length) return null
		const r = p.getBoundingClientRect()
		const m = new DOMMatrixReadOnly(getComputedStyle(p).transform)
		return { left: r.left - m.e, top: r.top - m.f, right: r.right - m.e, bottom: r.bottom - m.f, tucked: p.classList.contains('tucked'), rtl: getComputedStyle(p).direction === 'rtl' }
	})

/** Under the pill on its side within 2 px: its top 12 px under the pill's bottom, its inline end at the pill's. */
async function underPill(page: Page, where: string) {
	const pill = await pillOf(page)
	const l = await launcherOf(page)
	assert.ok(pill, `${where}: the pill is on the page`)
	assert.ok(l?.shown, `${where}: the launcher shows (${JSON.stringify(l?.debug)})`)
	assert.ok(Math.abs(l.box.top - (pill.bottom + 12)) <= 2, `${where}: its top ${Math.round(l.box.top)} is 12 px under the pill's bottom ${Math.round(pill.bottom)}`)
	if (pill.rtl) assert.ok(Math.abs(l.box.left - pill.left) <= 2, `${where}: its left ${Math.round(l.box.left)} is the pill's ${Math.round(pill.left)} (right to left)`)
	else assert.ok(Math.abs(l.box.right - pill.right) <= 2, `${where}: its right ${Math.round(l.box.right)} is the pill's ${Math.round(pill.right)}`)
	assert.ok(!meets(l.box, pill), `${where}: clear of the pill ${fmt(l.box)} ${fmt(pill)}`)
	assert.ok(l.box.left >= -0.5 && l.box.right <= l.view.width + 0.5, `${where}: inside the screen's width ${fmt(l.box)}`)
	return { pill, launcher: l }
}

/** What a press at each point reaches: inside `selector` (Vodafone's), the launcher, or something else. */
const hits = (page: Page, points: [number, number][], selector: string) =>
	page.evaluate(
		({ points, selector }) =>
			points.map(([x, y]) => {
				const at = document.elementFromPoint(x, y)
				const menu = [...document.querySelectorAll(selector)].find((m) => at && m.contains(at))
				return { x: Math.round(x), y: Math.round(y), at: at ? `${at.localName}.${String(at.getAttribute('class') ?? '').split(' ')[0]}` : 'nothing', menu: !!menu, ours: !!at?.closest('[data-aixc]') }
			}),
		{ points, selector },
	)

/** A grid of points in the part of `a` that lies in `b`, out of `avoid` (the pill, which sits over everything). */
const pointsIn = (a: Box, b: Box, avoid: Box | null) => {
	const box = { left: Math.max(a.left, b.left) + 2, top: Math.max(a.top, b.top) + 1, right: Math.min(a.right, b.right) - 2, bottom: Math.min(a.bottom, b.bottom) - 1 }
	const out: [number, number][] = []
	if (box.right <= box.left || box.bottom <= box.top) return out
	for (const fx of [0, 0.5, 1]) for (const fy of [0, 0.5, 1]) {
		const p: [number, number] = [box.left + (box.right - box.left) * fx, box.top + (box.bottom - box.top) * fy]
		if (!avoid || !(p[0] >= avoid.left && p[0] <= avoid.right && p[1] >= avoid.top && p[1] <= avoid.bottom)) out.push(p)
	}
	return out
}

const boxOf = (page: Page, selector: string) =>
	page.evaluate((selector) => {
		const n = [...document.querySelectorAll(selector)].find((x) => x.getClientRects().length && x.getBoundingClientRect().height > 0)
		if (!n) return null
		const r = n.getBoundingClientRect()
		return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }
	}, selector)

/** Every request for the launcher's and the shell's chunks. */
function requests(page: Page) {
	const seen = { launcher: 0, shell: 0, shellAnswers: [] as number[] }
	page.on('request', (r) => {
		if (chunk.launcher && r.url().endsWith(`/aixc/${chunk.launcher}`)) seen.launcher++
		if (chunk.shell && r.url().endsWith(`/aixc/${chunk.shell}`)) seen.shell++
	})
	page.on('response', (r) => {
		if (chunk.shell && r.url().endsWith(`/aixc/${chunk.shell}`)) seen.shellAnswers.push(r.status())
	})
	return seen
}

const until = async (fn: () => boolean, ms: number) => {
	const end = Date.now() + ms
	while (Date.now() < end) {
		if (fn()) return true
		await new Promise((done) => setTimeout(done, 50))
	}
	return fn()
}

test('shown on the pages that pass the gate, in both languages at both sizes; never on the others', { timeout: 600_000 }, async () => {
	assert.ok(chunk.launcher && chunk.shell, 'the build has the launcher\'s and the shell\'s chunks')
	for (const viewport of [DESKTOP, PHONE]) {
		const l = await launchLayer(gw, { viewport, reducedMotion: true })
		try {
			const seen = watch(l.page)
			for (const p of [...PASS, ...FAIL]) {
				const where = `${p} ${sizeOf(viewport)}`
				await open(l.page, p, '?aixc-debug')
				await launcherReady(l.page)
				const s = await layerState(l.page)
				assert.ok(s.demos?.includes('reimagine'), `${where}: the site enables it`)
				const b = await launcherOf(l.page)
				assert.ok(b, `${where}: the launcher's button is made`)
				assert.equal(b.count, 1, `${where}: one launcher`)
				if (FAIL.includes(p)) {
					assert.equal(b.shown, false, `${where}: not shown (${JSON.stringify(b.debug)})`)
					assert.equal(b.hidden, true, `${where}: hidden`)
					assert.equal(b.debug.allowed, false, `${where}: the gate says no`)
					continue
				}
				assert.equal(b.shown, true, `${where}: shown (${JSON.stringify(b.debug)})`)
				assert.equal(b.debug.allowed, true, `${where}: the gate says yes`)
				assert.ok(b.marked, `${where}: marked data-aixc and data-vg`)
				assert.deepEqual([b.type, b.expanded, b.controls], ['button', 'false', 'aixc-composer'], `${where}: a button that names the composer it opens`)
				assert.equal(b.label, LABEL[langOf(p)], `${where}: named in the page's language`)
				assert.equal(b.lang, langOf(p), `${where}: its lang`)
				assert.equal(b.position, 'fixed', `${where}: fixed`)
				assert.ok(Number(b.z) >= 10 && Number(b.z) <= 19, `${where}: z-index ${b.z}, above Vodafone's content and below its pinned navigation (20)`)
				assert.ok(b.beforeMain, `${where}: before Vodafone's content in the document (after its header in the Tab order)`)
				assert.ok(b.box.left >= -0.5 && b.box.right <= b.view.width + 0.5 && b.box.top >= 0 && b.box.bottom <= b.view.height, `${where}: inside the screen ${fmt(b.box)}`)
			}
			assert.deepEqual(seen.pageErrors, [], `${sizeOf(viewport)}: no page errors`)
			assert.deepEqual(seen.layer.filter((x) => x.startsWith('error')), [], `${sizeOf(viewport)}: the layer logged no error`)
			assert.deepEqual(l.reached, [], 'nothing reached the internet')
		} finally {
			await l.close()
		}
	}
})

/** No part of the launcher's box is inside the screen (it went up with the pill, or tucked away on its own). */
function offScreen(l: NonNullable<Awaited<ReturnType<typeof launcherOf>>>, where: string) {
	const { box, view } = l
	assert.ok(box.bottom <= 0 || box.top >= view.height || box.right <= 0 || box.left >= view.width, `${where}: the launcher is off the screen ${fmt(box)} (${JSON.stringify(l.debug)})`)
}

/**
 * Nothing of ours covers a "Pocket it" chip on the screen: a press at the centre of every chip whose centre is on the
 * screen reaches neither the launcher nor the guide (the trail's pill is in its shadow root), and on the screen the
 * launcher's box meets no chip's (above the screen's top neither covers anything). Returns how many chips were checked.
 */
async function chipsUncovered(page: Page, where: string) {
	const r = await page.evaluate(() => {
		type Box = { left: number; top: number; right: number; bottom: number }
		const onScreen = (r: Box): Box => ({ left: Math.max(r.left, 0), top: Math.max(r.top, 0), right: Math.min(r.right, innerWidth), bottom: Math.min(r.bottom, innerHeight) })
		const meets = (a: Box, b: Box) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
		const launcher = onScreen(document.querySelector('.aixc-launcher')!.getBoundingClientRect())
		const out = { checked: 0, covered: [] as string[], met: [] as string[] }
		for (const chip of document.querySelectorAll<HTMLElement>('.pocket-chips .pocket-cta[data-pocket-for]')) {
			const c = chip.getBoundingClientRect()
			const x = (c.left + c.right) / 2
			const y = (c.top + c.bottom) / 2
			if (!c.width || !c.height || x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) continue
			out.checked++
			const at = document.elementFromPoint(x, y)
			if (at?.closest('.aixc-launcher, vg-guide')) out.covered.push(`${chip.dataset.pocketFor} under ${at.closest('.aixc-launcher') ? 'the launcher' : 'the guide'}`)
			if (meets(onScreen(c), launcher)) out.met.push(chip.dataset.pocketFor!)
		}
		return out
	})
	assert.deepEqual(r.covered, [], `${where}: nothing of ours covers a chip`)
	assert.deepEqual(r.met, [], `${where}: the launcher's box meets no chip`)
	return r.checked
}

/** The layer's chips are drawn (the Pocket is on in this gateway). */
const chipsReady = (page: Page) => page.waitForFunction(() => (window as any).__aixc?.demos?.pocket?.chips?.()?.shown?.length > 0, null, { timeout: 15_000 })

test('under the trail\'s pill on its side within 2 px, at the top of the page and after a scroll; off the screen with the pill when it tucks, back under it when it comes back', { timeout: 300_000 }, async () => {
	const cases = [
		{ path: '/en/services', viewport: DESKTOP, motion: false },
		{ path: '/ar/services', viewport: DESKTOP, motion: false },
		{ path: '/en/services', viewport: PHONE, motion: false },
		{ path: '/ar/home', viewport: PHONE, motion: false },
		// With motion: the launcher's move up and back is a transition, like the pill's; it ends at the same places.
		{ path: '/en/home', viewport: DESKTOP, motion: true },
	]
	for (const c of cases) {
		const l = await launchLayer(gw, { viewport: c.viewport, reducedMotion: !c.motion, fixedHeader: 'scroll' })
		try {
			const seen = watch(l.page)
			const where = `${c.path} ${sizeOf(c.viewport)}${c.motion ? ' with motion' : ''}`
			await open(l.page, c.path, '?aixc-debug')
			await launcherReady(l.page)
			await pillReady(l.page)
			await chipsReady(l.page)
			await settle(l.page, 300)
			const top = await underPill(l.page, `${where} at the top`)
			// A little scroll: Vodafone's navigation pins, the trail moves its pill up under it, and the launcher follows.
			await l.page.evaluate(() => scrollTo(0, 100))
			await settle(l.page, 350)
			const pinned = await underPill(l.page, `${where} scrolled 100 px`)
			assert.equal(pinned.pill.tucked, false, `${where}: the pill is not tucked 100 px down`)
			if (c.viewport === DESKTOP) assert.ok(pinned.pill.top < top.pill.top - 1, `${where}: the trail moved its pill under the pinned navigation (${Math.round(top.pill.top)} -> ${Math.round(pinned.pill.top)}), and the launcher with it`)
			// Further down the pill tucks away (up, off the screen): the launcher leaves the screen with it, and covers no chip.
			let checked = 0
			for (const y of [900, 1500]) {
				await l.page.evaluate((y) => scrollTo(0, y), y)
				await settle(l.page, 350)
				const pill = await pillOf(l.page)
				assert.equal(pill?.tucked, true, `${where} at ${y}: the pill tucked away on the way down`)
				const b = (await launcherOf(l.page))!
				assert.ok(!b.hidden && b.visibility !== 'hidden', `${where} at ${y}: still on the page, only moved (${JSON.stringify(b.debug)})`)
				offScreen(b, `${where} at ${y}`)
				checked += await chipsUncovered(l.page, `${where} at ${y}`)
			}
			assert.ok(checked > 0, `${where}: chips were on the screen while the pill was tucked (${checked})`)
			// A keyboard user who reaches it while it is tucked away sees it (as the pill comes back on focus).
			await l.page.keyboard.press('Shift')
			await l.page.evaluate(() => document.querySelector<HTMLElement>('.aixc-launcher')!.focus({ preventScroll: true }))
			await settle(l.page, 350)
			const focused = (await launcherOf(l.page))!
			assert.ok(await l.page.evaluate(() => document.querySelector('.aixc-launcher')!.matches(':focus-visible')), `${where}: the launcher has keyboard focus`)
			assert.ok(focused.box.top >= 0 && focused.box.bottom <= focused.view.height, `${where}: focused, it is on the screen ${fmt(focused.box)}`)
			await l.page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
			await settle(l.page, 350)
			offScreen((await launcherOf(l.page))!, `${where} focus gone`)
			// A little way back up (40 px from where the page stopped: the phone's Services ends before 1500) the pill comes
			// back, mid-page: the launcher with it, under it within 2 px.
			const deep = await l.page.evaluate(() => scrollY)
			assert.ok(deep >= 1300, `${where}: the page went far down (${deep})`)
			await l.page.evaluate((y) => scrollTo(0, y), deep - 40)
			await settle(l.page, 350)
			const up = await underPill(l.page, `${where} scrolled back up to ${deep - 40} px`)
			assert.equal(up.pill.tucked, false, `${where}: the pill came back on the way up`)
			await l.page.evaluate(() => scrollTo(0, 0))
			await settle(l.page, 350)
			const back = await underPill(l.page, `${where} back at the top`)
			assert.ok(Math.abs(back.launcher.box.top - top.launcher.box.top) <= 1, `${where}: back where it was`)
			assert.deepEqual(seen.pageErrors, [], `${where}: no page errors`)
		} finally {
			await l.close()
		}
	}
})

/**
 * The trail's word that it is up (vg:trail-ready, and voiceGuide.trailHost) comes after it has read its storage for a
 * returning visitor (IndexedDB, and a write for each chunk it spilled on the page before): its pill is on the screen
 * for that long first. Held here so the window is long enough to see: the trail's own request (/v1/experience) 3 s,
 * so the launcher is up before the pill mounts, and its word 1.5 s more. A frame by frame watch from the page's start
 * records every frame where the launcher and the pill both show and meet.
 */
const HOLD_TRAIL = `(() => {
	const t0 = performance.now()
	const seen = { overlaps: [], said: 0, mounted: 0, launcher: 0 }
	window.__hold = seen
	const fetch0 = window.fetch
	window.fetch = function (input, init) {
		const url = String((input && input.url) || input)
		if (!url.includes('/v1/experience?')) return fetch0.call(this, input, init)
		return new Promise((done) => setTimeout(done, 3000)).then(() => fetch0.call(window, input, init))
	}
	const dispatch0 = window.dispatchEvent
	window.dispatchEvent = function (event) {
		if (!event || event.type !== 'vg:trail-ready') return dispatch0.call(this, event)
		setTimeout(() => {
			seen.said = performance.now() - t0
			dispatch0.call(window, event)
		}, 1500)
		return true
	}
	const shows = (n) => {
		if (!n || n.hidden) return null
		const s = getComputedStyle(n)
		const r = n.getBoundingClientRect()
		return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0 ? r : null
	}
	const frame = () => {
		const pill = document.querySelector('vg-guide')?.shadowRoot?.querySelector('.tr-pill')
		const b = document.querySelector('.aixc-launcher')
		const now = Math.round(performance.now() - t0)
		if (pill && !seen.mounted) seen.mounted = now
		if (b && !seen.launcher) seen.launcher = now
		const p = shows(pill)
		const l = shows(b)
		if (p && l && l.left < p.right && p.left < l.right && l.top < p.bottom && p.top < l.bottom && seen.overlaps.length < 20)
			seen.overlaps.push(now + 'ms: launcher ' + [l.left, l.top, l.right, l.bottom].map(Math.round) + ' pill ' + [p.left, p.top, p.right, p.bottom].map(Math.round))
		requestAnimationFrame(frame)
	}
	requestAnimationFrame(frame)
})()`

test('finds the trail\'s pill before the trail says it is up (a returning visitor\'s pill shows first), and is never over it meanwhile', { timeout: 300_000 }, async () => {
	for (const c of [
		{ path: '/en/services', viewport: DESKTOP },
		{ path: '/ar/home', viewport: PHONE },
	]) {
		const l = await launchLayer(gw, { viewport: c.viewport, reducedMotion: true, initScripts: [HOLD_TRAIL] })
		try {
			const seen = watch(l.page)
			const where = `${c.path} ${sizeOf(c.viewport)}`
			await open(l.page, c.path, '?aixc-debug')
			await launcherReady(l.page)
			await pillReady(l.page)
			await settle(l.page)
			const hold = await l.page.evaluate(() => ({ ...(window as any).__hold }))
			assert.equal(hold.said, 0, `${where}: the trail has not said it is up yet (${JSON.stringify(hold)})`)
			assert.ok(hold.launcher > 0 && hold.launcher < hold.mounted, `${where}: the launcher was up before the pill mounted (${JSON.stringify(hold)})`)
			await underPill(l.page, `${where} before the trail's word`)
			await l.page.waitForFunction(() => (window as any).__hold.said > 0, null, { timeout: 10_000 })
			await settle(l.page, 200)
			await underPill(l.page, `${where} after the trail's word`)
			const after = await l.page.evaluate(() => ({ ...(window as any).__hold }))
			assert.deepEqual(after.overlaps, [], `${where}: in no frame were the launcher and the pill over each other (pill mounted at ${after.mounted} ms, the trail's word at ${after.said} ms)`)
			assert.deepEqual(seen.pageErrors, [], `${where}: no page errors`)
		} finally {
			await l.close()
		}
	}
})

test('without a pill ("Not now"): under Vodafone\'s header at the inline end near the top, pinned or in the flow; tucked away below that, never over the content further down', { timeout: 300_000 }, async () => {
	for (const c of [
		{ path: '/en/services', viewport: DESKTOP },
		{ path: '/ar/services', viewport: PHONE },
	]) {
		const l = await launchLayer(gw, { viewport: c.viewport, reducedMotion: true, fixedHeader: 'scroll' })
		try {
			const seen = watch(l.page)
			const where = `${c.path} ${sizeOf(c.viewport)}`
			await open(l.page, c.path, '?aixc-debug')
			await launcherReady(l.page)
			await pillReady(l.page)
			await chipsReady(l.page)
			await l.page.locator('.tr-pill').click()
			await l.page.locator('.tr-later').click()
			await l.page.waitForFunction(() => !!document.querySelector('vg-guide')?.shadowRoot?.querySelector('.tr-pill[hidden]'), null, { timeout: 5_000 })
			await l.page.mouse.move(c.viewport.width / 2, c.viewport.height - 200)
			let checked = 0
			// Near the top (the trail's own 120 px, where its pill never tucks): in the flow at 0, pinned at 60 (Vodafone's
			// navigation pins once the page scrolls). Further down, and on the way back up below 120 px, off the screen.
			for (const y of [0, 60, 300, 900, 860, 1500, 60, 0]) {
				await l.page.evaluate((y) => scrollTo(0, y), y)
				await settle(l.page, 350)
				const b = await launcherOf(l.page)
				assert.ok(b && !b.hidden && b.visibility !== 'hidden', `${where} at ${y}: on the page without a pill (${JSON.stringify(b?.debug)})`)
				if (y >= 120) {
					offScreen(b, `${where} at ${y}`)
					checked += await chipsUncovered(l.page, `${where} at ${y}`)
					continue
				}
				const header = await l.page.evaluate(() => {
					let bottom = 0
					for (const n of [document.getElementById('header'), document.getElementById('nav-header')]) {
						const r = n?.getBoundingClientRect()
						if (r && r.top <= 10 && r.bottom > 0) bottom = Math.max(bottom, r.bottom)
					}
					return bottom
				})
				assert.ok(b.shown, `${where} at ${y}: shown without a pill (${JSON.stringify(b.debug)})`)
				assert.ok(header > 0, `${where} at ${y}: Vodafone's header meets the top of the screen`)
				assert.ok(Math.abs(b.box.top - (header + 16)) <= 2, `${where} at ${y}: its top ${Math.round(b.box.top)} is 16 px under the header's bottom ${Math.round(header)}`)
				if (langOf(c.path) === 'ar') assert.ok(Math.abs(b.box.left - 16) <= 2, `${where} at ${y}: 16 px from the left (${Math.round(b.box.left)})`)
				else assert.ok(Math.abs(b.view.width - b.box.right - 16) <= 2, `${where} at ${y}: 16 px from the right (${Math.round(b.view.width - b.box.right)})`)
			}
			assert.ok(checked > 0, `${where}: chips were on the screen while the launcher was tucked away (${checked})`)
			assert.deepEqual(seen.pageErrors, [], `${where}: no page errors`)
		} finally {
			await l.close()
		}
	}
})

/** Pockets the first card whose chip a press reaches. */
async function pocketOne(page: Page) {
	const at = await page.evaluate(async () => {
		const tick = () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(done, 60))))
		for (const chip of document.querySelectorAll<HTMLElement>('.pocket-chips .pocket-cta[data-pocket-for]')) {
			const id = chip.dataset.pocketFor!
			const card = [...document.querySelectorAll<HTMLElement>(`#main-content [data-aixc-item="${CSS.escape(id)}"]`)].find((c) => !c.closest('.owl-item.cloned'))
			if (!card) continue
			card.scrollIntoView({ block: 'center', inline: 'nearest' })
			await tick()
			const r = chip.getBoundingClientRect()
			const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
			if (r.width && hit && (hit === chip || chip.contains(hit))) return { id, x: r.left + r.width / 2, y: r.top + r.height / 2 }
		}
		return null
	})
	assert.ok(at, 'a chip a press reaches')
	await page.mouse.click(at.x, at.y)
	await page.waitForFunction((id) => (window as any).__aixc.demos.pocket.store.all().some((r: any) => r.id === id), at.id, { timeout: 5_000 })
}

/** Waits until the launcher shows (true) or does not (false). */
const launcherShows = (page: Page, shown: boolean, why: string) =>
	page
		.waitForFunction(
			(shown) => {
				const b = document.querySelector<HTMLElement>('.aixc-launcher')
				if (!b) return !shown
				const s = getComputedStyle(b)
				return (!b.hidden && s.display !== 'none' && s.visibility !== 'hidden') === shown
			},
			shown,
			{ timeout: 5_000 },
		)
		.catch(() => assert.fail(`the launcher ${shown ? 'does not show' : 'still shows'}: ${why}`))

test('hidden while the trail\'s card or toast, the album, a view, a dialog or one of Vodafone\'s menus shows, and when the gate fails; shown again after', { timeout: 300_000 }, async () => {
	for (const p of ['/en/services', '/ar/services']) {
		const l = await launchLayer(gw, { viewport: DESKTOP, reducedMotion: true, owl: true })
		try {
			const seen = watch(l.page)
			const where = `${p} desktop`
			await open(l.page, p, '?aixc-debug')
			await launcherReady(l.page)
			await pillReady(l.page)
			await settle(l.page, 300)
			await launcherShows(l.page, true, `${where}: at rest`)
			const rest = (await launcherOf(l.page))!.box
			const pill = await pillOf(l.page)

			// The trail's consent card opens where the launcher is.
			await l.page.locator('.tr-pill').click()
			await l.page.waitForFunction(() => !!document.querySelector('vg-guide')?.shadowRoot?.querySelector('.tr-card:not([hidden])'), null, { timeout: 5_000 })
			await launcherShows(l.page, false, `${where}: the consent card shows`)
			await l.page.locator('.tr-pill').click()
			await l.page.waitForFunction(() => !!document.querySelector('vg-guide')?.shadowRoot?.querySelector('.tr-card[hidden]'), null, { timeout: 5_000 })
			await launcherShows(l.page, true, `${where}: the consent card closed`)

			// The end-most desktop dropdown: the user menu under the avatar (its label checks its flag), at the top of the page.
			await l.page.locator('#avatar').click()
			await launcherShows(l.page, false, `${where}: Vodafone's user menu is open`)
			const menu = await boxOf(l.page, '#SignedItem .nav-step-three')
			assert.ok(menu && meets(menu, rest), `${where}: the user menu ${fmt(menu)} opens where the launcher is ${fmt(rest)}`)
			const userHits = await hits(l.page, pointsIn(menu, rest, pill), '#SignedItem .nav-step-three')
			assert.ok(userHits.length >= 3, `${where}: points of the user menu under the launcher's place`)
			for (const h of userHits) assert.ok(h.menu && !h.ours, `${where}: a press at the user menu's point (${h.x},${h.y}) reaches ${h.at}`)
			await l.page.locator('#avatar').click()
			await launcherShows(l.page, true, `${where}: the user menu closed`)

			// The Shop dropdown, open while hovered (the theme's own hover rule).
			const shop = l.page.locator('#js-remove-mobile > li:has(> .nav-step-two:not(.d-lg-none)) > a.nav-item-link').first()
			await shop.hover()
			await settle(l.page, 350)
			await launcherShows(l.page, false, `${where}: the Shop dropdown is open`)
			const strip = await boxOf(l.page, '#js-remove-mobile .nav-step-two:not(.d-lg-none)')
			assert.ok(strip, `${where}: the Shop dropdown shows`)
			if (meets(strip, rest)) for (const h of await hits(l.page, pointsIn(strip, rest, pill), '#js-remove-mobile .nav-step-two')) assert.ok(h.menu && !h.ours, `${where}: a press at the dropdown's point (${h.x},${h.y}) reaches ${h.at}`)
			await l.page.mouse.move(DESKTOP.width / 2, 600)
			await launcherShows(l.page, true, `${where}: the dropdown closed`)

			// A dialog of Vodafone's (Bootstrap marks body), and the trail's toast (it shows under the pill).
			await l.page.evaluate(() => document.body.classList.add('modal-open'))
			await launcherShows(l.page, false, `${where}: a dialog is open`)
			await l.page.evaluate(() => document.body.classList.remove('modal-open'))
			await launcherShows(l.page, true, `${where}: the dialog closed`)
			await l.page.evaluate(() => ((document.querySelector('vg-guide')!.shadowRoot!.querySelector('.tr-toast') as HTMLElement).hidden = false))
			await launcherShows(l.page, false, `${where}: the trail's toast shows`)
			await l.page.evaluate(() => ((document.querySelector('vg-guide')!.shadowRoot!.querySelector('.tr-toast') as HTMLElement).hidden = true))
			await launcherShows(l.page, true, `${where}: the toast went`)

			// A reimagined view (the shell sets it in stage 2).
			await l.page.evaluate(() => (document.body.dataset.aixcView = 'reimagined'))
			await launcherShows(l.page, false, `${where}: a reimagined view shows`)
			await l.page.evaluate(() => (document.body.dataset.aixcView = 'original'))
			await launcherShows(l.page, true, `${where}: the original page shows`)

			// A later reading that fails the gate, then one that passes.
			await l.page.evaluate(() => document.dispatchEvent(new CustomEvent('aixc:model', { detail: { model: (window as any).__aixc.model, coverage: { ...(window as any).__aixc.coverage, ratio: 0.5 } } })))
			await launcherShows(l.page, false, `${where}: a reading below the gate`)
			await l.page.evaluate(() => document.dispatchEvent(new CustomEvent('aixc:model', { detail: { model: (window as any).__aixc.model, coverage: (window as any).__aixc.coverage } })))
			await launcherShows(l.page, true, `${where}: a reading that passes again`)

			// The Pocket's album.
			await l.page.waitForFunction(() => (window as any).__aixc?.demos?.pocket?.chips?.()?.shown?.length > 0, null, { timeout: 15_000 })
			await pocketOne(l.page)
			await l.page.evaluate(() => (window as any).__aixc.demos.pocket.open())
			await l.page.waitForFunction(() => (window as any).__aixc.demos.pocket.state.view === 'pocket' && !(window as any).__aixc.demos.pocket.state.busy, null, { timeout: 10_000 })
			await launcherShows(l.page, false, `${where}: the album shows`)
			await l.page.evaluate(() => (window as any).__aixc.demos.pocket.close())
			await l.page.waitForFunction(() => (window as any).__aixc.demos.pocket.state.view === 'page' && !(window as any).__aixc.demos.pocket.state.busy, null, { timeout: 10_000 })
			await launcherShows(l.page, true, `${where}: the album closed`)
			// The saved pages keep Vodafone's inline handlers (onclick="navUserToggling(event)") without its scripts.
			assert.deepEqual(seen.pageErrors.filter((e) => !/navUserToggling|navToggling/.test(e)), [], `${where}: no page errors`)
			assert.deepEqual(seen.layer.filter((x) => x.startsWith('error')), [], `${where}: the layer logged no error`)
		} finally {
			await l.close()
		}
	}
	// The phone menu at the top of the page, as Vodafone's script opens it (its theme shows the menu on .nav-opened).
	for (const p of ['/en/services', '/ar/services']) {
		const l = await launchLayer(gw, { viewport: PHONE, reducedMotion: true })
		try {
			const where = `${p} phone`
			await open(l.page, p, '?aixc-debug')
			await launcherReady(l.page)
			await pillReady(l.page)
			await settle(l.page, 300)
			await launcherShows(l.page, true, `${where}: at rest`)
			const rest = (await launcherOf(l.page))!.box
			const pill = await pillOf(l.page)
			await l.page.evaluate(() => document.querySelector('.nav-header')!.classList.add('nav-opened'))
			await settle(l.page, 350)
			await launcherShows(l.page, false, `${where}: the phone menu is open`)
			const menu = await boxOf(l.page, '#js-remove-desktop .nav-list-items')
			assert.ok(menu && meets(menu, rest), `${where}: the phone menu ${fmt(menu)} opens where the launcher is ${fmt(rest)}`)
			const menuHits = await hits(l.page, pointsIn(menu, rest, pill), '#js-remove-desktop .nav-list-items')
			assert.ok(menuHits.length >= 3, `${where}: points of the phone menu under the launcher's place`)
			for (const h of menuHits) assert.ok(h.menu && !h.ours, `${where}: a press at the phone menu's point (${h.x},${h.y}) reaches ${h.at}`)
			await l.page.evaluate(() => document.querySelector('.nav-header')!.classList.remove('nav-opened'))
			await launcherShows(l.page, true, `${where}: the phone menu closed`)
		} finally {
			await l.close()
		}
	}
})

/*
 * A signed-out visitor has no avatar menu: every theme's guest branch removes #SignedItem, and the login icon
 * (#notSignedItem) is then the end-most item of the navigation. A press on it opens Vodafone's login card ("Yes, log me
 * in" / "No thanks"): the theme marks the item `.active`, and `.active .nav-startup` shows the card (maintheme on home,
 * static-lite on the bundles). static-theme (Services) has the same rule, though its press goes to the sign-in page:
 * checked there too. The saved pages keep both items and none of Vodafone's scripts, so the test does what the guest
 * branch and the press do.
 */
test('hidden while a signed-out visitor\'s login card is open (no avatar menu), on maintheme, static-lite and static-theme pages, both languages, both sizes', { timeout: 600_000 }, async () => {
	for (const viewport of [DESKTOP, PHONE]) {
		const l = await launchLayer(gw, { viewport, reducedMotion: true })
		try {
			const seen = watch(l.page)
			for (const p of ['/en/home', '/ar/home', '/en/mobile-internet-bundles', '/ar/mobile-internet-bundles', '/en/services', '/ar/services']) {
				const where = `${p} ${sizeOf(viewport)}`
				await open(l.page, p, '?aixc-debug')
				await launcherReady(l.page)
				await pillReady(l.page)
				await settle(l.page, 300)
				await l.page.evaluate(() => document.getElementById('SignedItem')?.remove())
				await settle(l.page)
				await launcherShows(l.page, true, `${where}: at rest, signed out`)
				const rest = (await launcherOf(l.page))!.box
				const pill = await pillOf(l.page)
				await l.page.evaluate(() => document.getElementById('notSignedItem')!.classList.add('active'))
				await launcherShows(l.page, false, `${where}: Vodafone's login card is open`)
				const card = await boxOf(l.page, '#notSignedItem .nav-startup')
				assert.ok(card && meets(card, rest), `${where}: the login card ${fmt(card)} opens where the launcher is ${fmt(rest)}`)
				const cardHits = await hits(l.page, pointsIn(card, rest, pill), '#notSignedItem .nav-startup')
				assert.ok(cardHits.length >= 3, `${where}: points of the login card under the launcher's place (${cardHits.length})`)
				for (const h of cardHits) assert.ok(h.menu && !h.ours, `${where}: a press at the login card's point (${h.x},${h.y}) reaches ${h.at}`)
				await l.page.evaluate(() => document.getElementById('notSignedItem')!.classList.remove('active'))
				await launcherShows(l.page, true, `${where}: the login card closed`)
			}
			assert.deepEqual(seen.pageErrors, [], `${sizeOf(viewport)}: no page errors`)
		} finally {
			await l.close()
		}
	}
})

test('clear of the first screen\'s "Pocket it" chips, and in their obstacle list', { timeout: 300_000 }, async () => {
	for (const viewport of [DESKTOP, PHONE]) {
		const l = await launchLayer(gw, { viewport, reducedMotion: true, owl: true })
		try {
			const seen = watch(l.page)
			for (const p of ['/en/home', '/ar/home', '/en/services', '/ar/services']) {
				const where = `${p} ${sizeOf(viewport)}`
				await open(l.page, p, '?aixc-debug')
				await launcherReady(l.page)
				await pillReady(l.page)
				await l.page.waitForFunction(() => (window as any).__aixc?.demos?.pocket?.chips?.()?.shown?.length > 0, null, { timeout: 15_000 })
				await settle(l.page, 300)
				const b = await launcherOf(l.page)
				assert.ok(b?.shown, `${where}: the launcher shows`)
				const chips = await l.page.evaluate(() =>
					[...document.querySelectorAll<HTMLElement>('.pocket-chips .pocket-cta[data-pocket-for]')]
						.filter((c) => c.checkVisibility({ visibilityProperty: true }) && !c.closest('[hidden]'))
						.map((c) => {
							const r = c.getBoundingClientRect()
							return { id: c.dataset.pocketFor!, box: { left: r.left, top: r.top, right: r.right, bottom: r.bottom } }
						})
						.filter((c) => c.box.bottom > 0 && c.box.top < innerHeight),
				)
				for (const c of chips) assert.ok(!meets(c.box, b.box), `${where}: the chip of ${c.id} ${fmt(c.box)} is clear of the launcher ${fmt(b.box)}`)
			}
			// The obstacle list (on the last page, /ar/services), with no resize or other nudge: the launcher leaves the page
			// (the chips forget it) and comes back over a first-screen chip, as it arrives at idle after the chips' last
			// pass. The chips' watch for it arriving beside Vodafone's content runs a pass, which moves that chip off it.
			const p = '/ar/services'
			const where = `${p} ${sizeOf(viewport)}`
			const moved = await l.page.evaluate(async () => {
				const tick = () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(done, 120))))
				const counted = () => ((window as any).__aixc.demos.pocket.chips().fixed as { name: string }[]).some((f) => f.name === 'aixc-launcher')
				const launcher = document.querySelector<HTMLElement>('.aixc-launcher')!
				const lb = launcher.getBoundingClientRect()
				const parent = launcher.parentNode!
				const next = launcher.nextSibling
				const unplaced = () => new Set<string>((window as any).__aixc.demos.pocket.chips().unplaced)
				const box = (n: Element) => {
					const r = n.getBoundingClientRect()
					return [r.left, r.top, r.right, r.bottom].map(Math.round)
				}
				for (const chip of document.querySelectorAll<HTMLElement>('.pocket-chips .pocket-cta[data-pocket-for]')) {
					const r = chip.getBoundingClientRect()
					if (!r.width || r.top < 0 || r.bottom > innerHeight - 160 || !chip.checkVisibility({ visibilityProperty: true })) continue
					if (unplaced().has(chip.dataset.pocketFor!)) continue
					const before = { counted: counted() }
					launcher.remove()
					await tick()
					const gone = !counted()
					// Back over the chip: its own box put there (its place is its own until the trail or the page moves).
					launcher.style.top = `${r.top - 4}px`
					launcher.style.left = `${Math.max(0, r.left - Math.max(0, lb.width - r.width) / 2)}px`
					launcher.style.right = 'auto'
					parent.insertBefore(launcher, next)
					const over = launcher.getBoundingClientRect()
					await tick()
					const now = chip.getBoundingClientRect()
					const meets = (a: DOMRect, b: DOMRect) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
					return { id: chip.dataset.pocketFor!, countedBefore: before.counted, gone, back: counted(), before: [r.left, r.top, r.right, r.bottom].map(Math.round), after: box(chip), launcher: [over.left, over.top, over.right, over.bottom].map(Math.round), wasUnder: meets(r, over), stillUnder: meets(now, over), unplaced: unplaced().has(chip.dataset.pocketFor!) }
				}
				return null
			})
			assert.ok(moved, `${where}: a first-screen chip to put the launcher over`)
			assert.ok(moved.countedBefore && moved.gone, `${where}: the chips counted the launcher, and forgot it while it was off the page (${JSON.stringify(moved)})`)
			assert.ok(moved.wasUnder, `${where}: the launcher came back over it (${JSON.stringify(moved)})`)
			assert.ok(moved.back, `${where}: the chips found the launcher when it came back, with no resize (${JSON.stringify(moved)})`)
			assert.ok(!moved.stillUnder, `${where}: the chip took another corner (${JSON.stringify(moved)})`)

			// One of Vodafone's menus opens over the launcher, which gives way by visibility only (desktop: the user menu
			// under the avatar; phone: the phone menu). A pass of the chips while the menu is open (a transition of the page,
			// a carousel's move, a resize: here a resize) still counts it, so the chip it moved stays where it went, off the
			// launcher's spot, and stays there once the menu closes: no chip moves into its spot and back.
			const chipNow = (id: string) =>
				l.page.evaluate(async (id) => {
					await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(done, 120))))
					const chip = document.querySelector<HTMLElement>(`.pocket-chips .pocket-cta[data-pocket-for="${CSS.escape(id)}"]`)!
					const card = [...document.querySelectorAll<HTMLElement>(`#main-content [data-aixc-item="${CSS.escape(id)}"]`)].find((c) => !c.closest('.owl-item.cloned'))!
					const c = chip.getBoundingClientRect()
					const k = card.getBoundingClientRect()
					return {
						box: [c.left, c.top, c.right, c.bottom].map(Math.round),
						corner: [c.left - k.left, c.top - k.top].map(Math.round),
						card: [k.left, k.top].map(Math.round),
						counted: ((window as any).__aixc.demos.pocket.chips().fixed as { name: string }[]).some((f) => f.name === 'aixc-launcher'),
					}
				}, id)
			const atRest = await chipNow(moved.id)
			const menu = viewport === DESKTOP ? { open: () => l.page.locator('#avatar').click(), close: () => l.page.locator('#avatar').click(), name: 'the user menu' } : { open: () => l.page.evaluate(() => document.querySelector('.nav-header')!.classList.add('nav-opened')), close: () => l.page.evaluate(() => document.querySelector('.nav-header')!.classList.remove('nav-opened')), name: 'the phone menu' }
			await menu.open()
			await launcherShows(l.page, false, `${where}: ${menu.name} is open`)
			await l.page.evaluate(() => dispatchEvent(new Event('resize')))
			const during = await chipNow(moved.id)
			assert.deepEqual(during.card, atRest.card, `${where}: ${menu.name} did not move the chip's card (${JSON.stringify({ atRest, during })})`)
			assert.ok(during.counted, `${where}: with ${menu.name} open the chips still count the launcher`)
			assert.deepEqual(during.corner, atRest.corner, `${where}: with ${menu.name} open the chip kept its corner, off the launcher's spot (${JSON.stringify({ atRest, during, launcher: moved.launcher })})`)
			await menu.close()
			await launcherShows(l.page, true, `${where}: ${menu.name} closed`)
			const closed = await chipNow(moved.id)
			assert.deepEqual(closed.corner, atRest.corner, `${where}: ${menu.name} closed, the chip is where it was (${JSON.stringify({ atRest, closed })})`)
			assert.deepEqual(seen.pageErrors.filter((e) => !/navUserToggling|navToggling/.test(e)), [], `${sizeOf(viewport)}: no page errors`)
		} finally {
			await l.close()
		}
	}
})

/** Where the chips hold the launcher for the first screen (where it rests at scroll 0), from their debug. */
const chipsRest = (page: Page) => page.evaluate(() => (((window as any).__aixc.demos.pocket.chips()?.fixed ?? []) as ({ name: string } & Box)[]).find((f) => f.name === 'aixc-launcher') ?? null)

/** Within 1 px on every side. */
const sameBox = (a: Box | null, b: Box | null) => !!a && !!b && (['left', 'top', 'right', 'bottom'] as const).every((k) => Math.abs(a[k] - b[k]) <= 1)

/**
 * Vodafone's navigation pinned with its place in the flow held (a spacer of its height while it is fixed, as a site's
 * sticky header often does): the page's height does not change when it pins or unpins, so going back to the top
 * resizes nothing, and the chips get no pass from it.
 */
const HOLD_NAV_PLACE = `(() => {
	if (window.top !== window || !/^\\/(en|ar)\\//.test(location.pathname)) return
	const start = () => {
		const nav = document.querySelector('.nav-header')
		if (!nav) return
		const spacer = document.createElement('div')
		spacer.setAttribute('data-stand-in', 'nav-place')
		nav.after(spacer)
		const hold = () => { spacer.style.height = nav.classList.contains('nav-fixed') ? nav.getBoundingClientRect().height + 'px' : '0px' }
		new MutationObserver(hold).observe(nav, { attributes: true, attributeFilter: ['class'] })
		hold()
	}
	if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true }); else start()
})()`

test('the chips keep the launcher\'s place at the top of the page through what happens mid-page: the consent card, a reading that fails the gate, "Not now"', { timeout: 300_000 }, async () => {
	// Desktop: on a phone Vodafone's header is its navigation alone, so the launcher's place is the same pinned or not.
	for (const c of [
		{ path: '/en/services', viewport: DESKTOP },
		{ path: '/ar/services', viewport: DESKTOP },
	]) {
		// Vodafone's navigation pins once the page scrolls, and the trail raises its pill under it: mid-page the launcher
		// is higher than at the top, which is where the chips of the first screen keep clear of it.
		const l = await launchLayer(gw, { viewport: c.viewport, reducedMotion: true, fixedHeader: 'scroll', initScripts: [HOLD_NAV_PLACE] })
		try {
			const seen = watch(l.page)
			const where = `${c.path} ${sizeOf(c.viewport)}`
			await open(l.page, c.path, '?aixc-debug')
			await launcherReady(l.page)
			await pillReady(l.page)
			await chipsReady(l.page)
			await settle(l.page, 300)
			const top = (await launcherOf(l.page))!.box
			assert.ok(sameBox(await chipsRest(l.page), top), `${where}: at the top the chips hold the launcher where it is ${fmt(top)} (${fmt(await chipsRest(l.page))})`)
			/** Mid-page with the pill back (it tucks on the way down and comes back on the way up). */
			const midPage = async () => {
				await l.page.evaluate(() => scrollTo(0, 640))
				await settle(l.page, 350)
				await l.page.evaluate(() => scrollTo(0, 600))
				await settle(l.page, 350)
				const pill = await pillOf(l.page)
				assert.ok(pill && !pill.tucked, `${where}: the pill is back mid-page`)
				const mid = (await launcherOf(l.page))!.box
				assert.ok(mid.top < top.top - 10, `${where}: mid-page the launcher is higher than at the top (${Math.round(mid.top)} against ${Math.round(top.top)})`)
			}
			const backAtTop = async (why: string, expect: Box | null) => {
				await l.page.evaluate(() => scrollTo(0, 0))
				await settle(l.page, 350)
				const now = (await launcherOf(l.page))!
				assert.ok(now.shown, `${where} after ${why}: the launcher shows at the top (${JSON.stringify(now.debug)})`)
				if (expect) assert.ok(sameBox(now.box, expect), `${where} after ${why}: the launcher is back where it was ${fmt(expect)} (${fmt(now.box)})`)
				const rest = await chipsRest(l.page)
				assert.ok(sameBox(rest, now.box), `${where} after ${why}: the chips hold the launcher where it is at the top ${fmt(now.box)}, not ${fmt(rest)}`)
				await chipsUncovered(l.page, `${where} after ${why}`)
				return now.box
			}

			// The consent card, opened and closed mid-page (the launcher gives way while it shows).
			await midPage()
			await l.page.locator('.tr-pill').click()
			await l.page.waitForFunction(() => !!document.querySelector('vg-guide')?.shadowRoot?.querySelector('.tr-card:not([hidden])'), null, { timeout: 5_000 })
			await launcherShows(l.page, false, `${where}: the consent card shows mid-page`)
			await l.page.locator('.tr-pill').click()
			await l.page.waitForFunction(() => !!document.querySelector('vg-guide')?.shadowRoot?.querySelector('.tr-card[hidden]'), null, { timeout: 5_000 })
			await launcherShows(l.page, true, `${where}: the consent card closed mid-page`)
			await settle(l.page, 200)
			// Still mid-page, the chips hold it where it rests at the top, not where it is now (under the pinned navigation).
			const afterCard = await chipsRest(l.page)
			assert.ok(sameBox(afterCard, top), `${where}: mid-page after the consent card the chips hold the launcher where it rests at the top ${fmt(top)}, not ${fmt(afterCard)}`)
			await backAtTop('the consent card mid-page', top)

			// A reading that fails the gate mid-page, then one that passes.
			await midPage()
			await l.page.evaluate(() => document.dispatchEvent(new CustomEvent('aixc:model', { detail: { model: (window as any).__aixc.model, coverage: { ...(window as any).__aixc.coverage, ratio: 0.5 } } })))
			await launcherShows(l.page, false, `${where}: a reading below the gate mid-page`)
			await settle(l.page, 200)
			await l.page.evaluate(() => document.dispatchEvent(new CustomEvent('aixc:model', { detail: { model: (window as any).__aixc.model, coverage: (window as any).__aixc.coverage } })))
			await launcherShows(l.page, true, `${where}: a reading that passes again mid-page`)
			await settle(l.page, 200)
			const afterGate = await chipsRest(l.page)
			assert.ok(sameBox(afterGate, top), `${where}: mid-page after the failed reading the chips hold the launcher where it rests at the top ${fmt(top)}, not ${fmt(afterGate)}`)
			await backAtTop('a reading that failed the gate mid-page', top)

			// "Not now" mid-page: the pill goes, and at the top the launcher is under Vodafone's header instead.
			await midPage()
			await l.page.locator('.tr-pill').click()
			await l.page.locator('.tr-later').click()
			await l.page.waitForFunction(() => !!document.querySelector('vg-guide')?.shadowRoot?.querySelector('.tr-pill[hidden]'), null, { timeout: 5_000 })
			await settle(l.page, 200)
			const header = await backAtTop('"Not now" mid-page', null)
			assert.ok(header.top < top.top - 30, `${where}: without the pill the launcher is under the header (${Math.round(header.top)} against ${Math.round(top.top)} under the pill)`)
			assert.deepEqual(seen.pageErrors, [], `${where}: no page errors`)
		} finally {
			await l.close()
		}
	}
})

/**
 * Counts the launcher's own observers and its subscriptions to the trail's host API (as pocket-chips' TRACK counts the
 * chips' observers): an observer is the launcher's when it observes from the launcher's chunk (`file`), and so is a
 * subscription made from it. Disconnecting the observer, or calling the off the subscription gave, takes it out.
 */
const TRACK_LAUNCHER = (file: string) => `(() => {
	const live = { mo: new Set(), ro: new Set(), subs: new Set() }
	window.__track = live
	const ours = () => (new Error().stack || '').includes(${JSON.stringify(`/aixc/${file}`)})
	for (const [Ctor, set] of [[MutationObserver, live.mo], [ResizeObserver, live.ro]]) {
		const observe = Ctor.prototype.observe
		const disconnect = Ctor.prototype.disconnect
		Ctor.prototype.observe = function (target, o) { if (ours()) { set.add(this); (this.__targets ||= []).push(target) } return observe.call(this, target, o) }
		Ctor.prototype.disconnect = function () { set.delete(this); return disconnect.call(this) }
	}
	const track = (api) => {
		if (!api || typeof api.subscribe !== 'function' || api.__tracked) return
		const subscribe = api.subscribe
		api.__tracked = true
		api.subscribe = function (fn) {
			const off = subscribe.call(this, fn)
			if (!ours()) return off
			const token = {}
			live.subs.add(token)
			return () => { live.subs.delete(token); return off() }
		}
	}
	let guide
	Object.defineProperty(window, 'voiceGuide', { configurable: true, enumerable: true, get: () => guide, set(g) {
		guide = g
		if (!g || typeof g !== 'object') return
		let host = g.trailHost
		track(host)
		Object.defineProperty(g, 'trailHost', { configurable: true, enumerable: true, get: () => host, set(api) { host = api; track(api) } })
	} })
})()`

test('the shell\'s chunk is asked for only on a press; the kill switches leave no launcher and ask for nothing', { timeout: 300_000 }, async () => {
	// A press, and only a press, asks for the shell's chunk, once.
	{
		const l = await launchLayer(gw, { viewport: DESKTOP, reducedMotion: true })
		try {
			const seen = watch(l.page)
			const req = requests(l.page)
			await open(l.page, '/en/services', '?aixc-debug')
			await launcherReady(l.page)
			assert.equal(req.launcher, 1, 'the launcher\'s chunk was asked for once')
			const b = l.page.locator('.aixc-launcher')
			await b.hover()
			await b.focus()
			await l.page.evaluate(() => scrollTo(0, 400))
			await l.page.waitForTimeout(2_500)
			assert.equal(req.shell, 0, 'hover, focus, a scroll and idle time ask for nothing more')
			await l.page.evaluate(() => scrollTo(0, 0))
			await settle(l.page, 200)
			await b.click()
			assert.ok(await until(() => req.shellAnswers.length > 0, 5_000), 'the press asked for the shell\'s chunk')
			assert.deepEqual(req.shellAnswers, [200])
			await b.click()
			await l.page.waitForTimeout(500)
			assert.equal(req.shell, 1, 'once')
			assert.equal(await l.page.evaluate(() => (window as any).__aixc.state), 'ready', 'the layer is up')
			assert.deepEqual(seen.pageErrors, [], 'no page errors')
		} finally {
			await l.close()
		}
	}
	// ?aixc=off: no layer, no launcher, nothing asked for.
	{
		const l = await launchLayer(gw, { viewport: DESKTOP })
		try {
			const req = requests(l.page)
			await open(l.page, '/en/services', '?aixc=off')
			await l.page.waitForTimeout(2_500)
			assert.equal(await l.page.locator('.aixc-launcher').count(), 0, '?aixc=off: no launcher')
			assert.deepEqual([req.launcher, req.shell], [0, 0], '?aixc=off: neither chunk asked for')
		} finally {
			await l.close()
		}
	}
	// demos.reimagine false in the site config: the loader leaves it out, the core never loads it; the Pocket is there.
	{
		const was = gw.site.experiences.demos.reimagine
		gw.site.experiences.demos.reimagine = false
		const l = await launchLayer(gw, { viewport: DESKTOP })
		gw.site.experiences.demos.reimagine = was
		try {
			const req = requests(l.page)
			await open(l.page, '/en/services', '?aixc-debug')
			await l.page.waitForFunction(() => (window as any).__aixc?.demos?.pocket, null, { timeout: 15_000 })
			await l.page.waitForTimeout(2_500)
			const s = await layerState(l.page)
			assert.ok(!s.demos?.includes('reimagine'), `demos.reimagine false: not in the tag (${s.demos?.join(' ')})`)
			assert.equal(await l.page.locator('.aixc-launcher').count(), 0, 'demos.reimagine false: no launcher')
			assert.equal(req.launcher, 0, 'demos.reimagine false: its chunk is not asked for')
		} finally {
			await l.close()
		}
	}
	// The guard's stop: the launcher, its stylesheet, its listeners, its observers and its subscription to the trail
	// go; nothing comes back.
	{
		const l = await launchLayer(gw, { viewport: DESKTOP, reducedMotion: true, initScripts: [TRACK_LAUNCHER(chunk.launcher)] })
		try {
			const seen = watch(l.page)
			await open(l.page, '/en/services', '?aixc-debug')
			await launcherReady(l.page)
			await pillReady(l.page)
			await launcherShows(l.page, true, 'before the stop')
			await l.page.waitForFunction(() => (window as any).__track.subs.size > 0, null, { timeout: 5_000 }).catch(() => {})
			const counts = () =>
				l.page.evaluate(() => {
					const t = (window as any).__track
					const pill = document.querySelector('vg-guide')?.shadowRoot?.querySelector('.tr-pill')
					const all = [...t.mo, ...t.ro] as { __targets?: Node[] }[]
					return { mo: t.mo.size as number, ro: t.ro.size as number, subs: t.subs.size as number, onBody: all.filter((o) => o.__targets?.includes(document.body)).length, onPill: all.filter((o) => !!pill && o.__targets?.includes(pill)).length }
				})
			const running = await counts()
			assert.ok(running.mo >= 2 && running.ro >= 1 && running.onBody >= 1 && running.onPill >= 2, `before the stop the launcher observes body, the trail and its pill (${JSON.stringify(running)})`)
			assert.equal(running.subs, 1, `before the stop the launcher is subscribed to the trail's host API (${JSON.stringify(running)})`)
			await l.page.evaluate(() => (window as any).__aixc.guard.stop())
			for (const act of [() => scrollTo(0, 500), () => dispatchEvent(new Event('resize')), () => document.dispatchEvent(new CustomEvent('aixc:model', { detail: { model: null, coverage: { ratio: 1 } } })), () => (document.body.dataset.aixcView = 'reimagined')]) await l.page.evaluate(act)
			await settle(l.page, 300)
			const left = await l.page.evaluate(() => ({ launcher: document.querySelectorAll('.aixc-launcher').length, css: document.querySelectorAll('style[data-aixc-css="reimagine-launcher"]').length, ours: document.querySelectorAll('[data-aixc]').length }))
			assert.deepEqual(left, { launcher: 0, css: 0, ours: 0 }, 'the guard\'s stop: nothing of the launcher left')
			const stopped = await counts()
			assert.deepEqual(stopped, { mo: 0, ro: 0, subs: 0, onBody: 0, onPill: 0 }, `the guard's stop: no observer of the launcher's and no subscription to the trail left (before: ${JSON.stringify(running)})`)
			assert.deepEqual(seen.pageErrors, [], 'no page errors')
		} finally {
			await l.close()
		}
	}
	// A failure at the press: the layer gives the page back as Vodafone served it.
	{
		const l = await launchLayer(gw, { viewport: DESKTOP, reducedMotion: true, initScripts: ['window.__AIXC_TEST__ = { failAt: "reimagine-press" }'] })
		try {
			const seen = watch(l.page)
			const req = requests(l.page)
			await open(l.page, '/en/services', '?aixc=off')
			const without = await geometry(l.page)
			await open(l.page, '/en/services', '?aixc-debug')
			await launcherReady(l.page)
			await l.page.locator('.aixc-launcher').click()
			await l.page.waitForFunction(() => (window as any).__aixc.state === 'failed', null, { timeout: 5_000 })
			const s = await layerState(l.page)
			assert.equal(s.added, 0, 'nothing of the layer is left')
			assert.equal(s.mainHidden, false, 'Vodafone\'s content is shown')
			assert.deepEqual(await geometry(l.page), without, 'the page is as without the layer')
			assert.equal(req.shell, 0, 'the shell was never asked for')
			assert.deepEqual(seen.pageErrors, [], 'no error reached the page')
			assert.ok(seen.layer.some((x) => x.startsWith('error: [AIXC] click handler failed')), `the layer said so (${seen.layer.join(' | ')})`)
		} finally {
			await l.close()
		}
	}
})
