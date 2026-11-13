/**
 * The live-page test kit itself (tests/e2e/vodafone-layer.ts; live plan phase 3, S1): nothing a test
 * opens reaches Vodafone's site, and the stand-ins for what replay cannot run (the accessibility
 * widget, OneTrust's banner, the signed-out theme's storage clear, Owl's carousel layout) sit and
 * behave as measured on the live site, so the Pocket's tests check what a live page would show.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'

import { OFFLINE_ARGS } from '../../tools/demo-browser.ts'
import { CMS_PAGES, DESKTOP, furniture, type LayerGateway, launchLayer, layerState, open, PHONE, startLayerGateway, watch } from './vodafone-layer.ts'

const PORT = 4478
let gw: LayerGateway

before(async () => {
	gw = await startLayerGateway(PORT)
})
after(async () => {
	await gw?.close()
})

test('no request leaves for Vodafone\'s site: every saved CMS page in both languages, with the layer and every stand-in', async () => {
	const l = await launchLayer(gw, { owl: true, themeClear: true, banner: true })
	try {
		const seen = watch(l.page)
		for (const pathname of CMS_PAGES) {
			await open(l.page, pathname, '?aixc-debug')
			assert.equal((await layerState(l.page)).state, 'ready', `${pathname}: the layer is ready`)
		}
		assert.deepEqual(l.reached, [], 'no response came from a server: nothing reached the internet')
		// What replay would have fetched from Vodafone without offline mode (pictures and fonts it did not save).
		assert.ok(l.refused.length > 0 && l.refused.every((r) => ['image', 'font', 'stylesheet', 'media'].includes(r.type)), `refused: ${l.refused.length} pictures and fonts`)
		console.log(`# offline replay refused ${l.refused.length} requests (${l.refused.filter((r) => r.type === 'font').length} fonts) that would have gone to Vodafone's site`)
		assert.deepEqual(seen.pageErrors, [], 'no page errors')
	} finally {
		await l.close()
	}
})

test('the accessibility widget stand-in: where the live button is, on top of everything, styled below an id rule', async () => {
	for (const [viewport, at] of [[DESKTOP, { x: 1291, y: 825 }], [PHONE, { x: 300, y: 737 }]] as const) {
		const l = await launchLayer(gw, { viewport })
		try {
			for (const pathname of ['/en/services', '/ar/services']) {
				await open(l.page, pathname)
				const f = await furniture(l.page)
				assert.deepEqual([f.button?.x, f.button?.y, f.button?.w, f.button?.h], [at.x, at.y, 55, 55], `${pathname} ${viewport.width}: at the measured place`)
				assert.equal(f.button?.onTop, true, `${pathname}: a person hits the button`)
				// The widget's host paints at the top of the stack: above an element at the guide's own z-index.
				const above = await l.page.evaluate(() => {
					const cover = Object.assign(document.createElement('div'), { id: 'cover' })
					cover.style.cssText = 'position:fixed;inset:0;z-index:2147483600'
					document.body.append(cover)
					const r = document.getElementById('vodafone-aw-icon')!.getBoundingClientRect()
					const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
					cover.remove()
					return hit?.id
				})
				assert.equal(above, 'vodafone-aw-icon', 'above a layer at z-index 2147483600')
				// Its own transition, overridable by an id rule, as Vodafone's stylesheet is.
				const t = await l.page.evaluate(() => {
					const b = document.getElementById('vodafone-aw-icon')!
					const own = getComputedStyle(b).transition
					const s = document.createElement('style')
					s.textContent = '#vodafone-aw-icon{transition:bottom 0.28s ease}'
					document.head.append(s)
					const overridden = getComputedStyle(b).transition
					s.remove()
					return { own, overridden }
				})
				assert.match(t.own, /^(all )?0\.25s cubic-bezier\(0\.4, 0, 0\.2, 1\)/)
				assert.match(t.overridden, /^bottom 0\.28s( ease)?$/)
			}
		} finally {
			await l.close()
		}
	}
})

test('the cookie banner stand-in: bottom-left in English, bottom-right in Arabic, its filter over the page; answering hides both', async () => {
	const l = await launchLayer(gw, { banner: true })
	try {
		for (const [pathname, side] of [['/en/home', 'left'], ['/ar/home', 'right']] as const) {
			await open(l.page, pathname)
			const f = await furniture(l.page)
			assert.ok(f.banner?.visible && f.filter?.visible, `${pathname}: banner and filter shown`)
			// As rendered from the capture with Vodafone's fonts: English 375×321, Arabic 975,524 375×360 (AIXC-61).
			const h = pathname.startsWith('/ar/') ? 360 : 321
			assert.deepEqual([f.banner!.w, f.banner!.h, f.banner!.y], [375, h, DESKTOP.height - 16 - h], `${pathname}: the banner's box`)
			assert.equal(side === 'left' ? f.banner!.x : DESKTOP.width - f.banner!.x - f.banner!.w, 16, `${pathname}: 16 px from the ${side}`)
			assert.equal(f.banner!.onTop, true, 'the banner is on top of its filter')
			assert.deepEqual([f.filter!.w, f.filter!.h], [DESKTOP.width, DESKTOP.height], 'the filter covers the page')
			await l.page.click('#onetrust-accept-btn-handler')
			const after = await furniture(l.page)
			assert.deepEqual([after.banner?.visible, after.filter?.visible], [false, false], 'answered: both hidden')
		}
	} finally {
		await l.close()
	}
})

test('the theme\'s storage clear runs where Vodafone\'s signed-out theme does it (home, Services, RED, Cash), not on static-lite pages', async () => {
	const l = await launchLayer(gw, { themeClear: true })
	try {
		const clears = { '/en/home': true, '/en/services': true, '/en/vodafone-red1': true, '/ar/vodafone-cash': true, '/en/mobile-internet-bundles': false, '/en/wireless-net': false, '/en/promotions': false }
		for (const [pathname, clears_] of Object.entries(clears)) {
			await open(l.page, pathname)
			await l.page.evaluate(() => localStorage.setItem('aixc.kit-test', 'kept'))
			await l.page.reload({ waitUntil: 'load' })
			await l.page.waitForTimeout(200)
			const s = await l.page.evaluate(() => ({ kept: localStorage.getItem('aixc.kit-test'), loggedIn: localStorage.getItem('isLogedIn'), cleared: (window as unknown as { __themeCleared?: number }).__themeCleared ?? 0 }))
			if (clears_) assert.deepEqual(s, { kept: null, loggedIn: 'false', cleared: 1 }, `${pathname}: cleared on load`)
			else assert.deepEqual([s.kept, s.cleared], ['kept', 0], `${pathname}: left alone`)
			await l.page.evaluate(() => localStorage.removeItem('aixc.kit-test'))
		}
	} finally {
		await l.close()
	}
})

test('the carousel stand-in: Owl\'s stage, its copies on looping carousels; the layer reads each card once', async () => {
	const l = await launchLayer(gw, { owl: true })
	try {
		await open(l.page, '/en/vodafone-red1', '?aixc-debug')
		const red = await l.page.evaluate(() => ({
			plans: document.querySelectorAll('#main-content .owl-item:not(.cloned) .card-plan').length,
			copies: document.querySelectorAll('#main-content .owl-item.cloned .card-plan').length,
			read: (window as unknown as { __aixc: { model: { sections: { items: { kind?: string }[] }[] } } }).__aixc.model.sections.flatMap((s) => s.items).filter((i) => i.kind === 'card-plan').length,
			tagged: document.querySelectorAll('.owl-item.cloned [data-aixc-item]').length,
		}))
		assert.deepEqual(red, { plans: 5, copies: 6, read: 5, tagged: 0 }, 'RED: 5 plans, 6 copies (as live), 5 read, no copy tagged')
		await open(l.page, '/en/services', '?aixc-debug')
		const services = await l.page.evaluate(() => {
			const cards = [...document.querySelectorAll('#main-content [data-aixc-item]')]
			const shown = cards.filter((c) => {
				const r = c.getBoundingClientRect()
				return r.width > 0 && r.height > 0
			}).length
			return { cards: cards.length, shown, active: document.querySelectorAll('#main-content .owl-item.active').length }
		})
		assert.ok(services.shown >= 25, `Services: the carousels' cards are laid out (${services.shown} of ${services.cards} have a size; without the stand-in 7 do)`)
		assert.equal((await layerState(l.page)).coverage, 1)
	} finally {
		await l.close()
	}
})

/** The addresses Chromium started a network request for, from its own log (written as it closes). */
function startedRequests(file: string): string[] {
	let text = fs.readFileSync(file, 'utf8').trim()
	let log: { constants: { logEventTypes: Record<string, number> }; events: { type: number; params?: { url?: string } }[] }
	try {
		log = JSON.parse(text)
	} catch {
		// A log cut short at exit: end the events list ourselves.
		text = text.replace(/,\s*$/, '')
		log = JSON.parse(`${text}]}`)
	}
	const start = log.constants.logEventTypes.URL_REQUEST_START_JOB
	return log.events.filter((e) => e.type === start && e.params?.url).map((e) => e.params!.url!)
}

test('nothing leaves as the browser closes: a request still waiting on the gateway is ended, never handed to the network (AIXC-53)', async () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vg-netlog-'))
	const netLog = path.join(dir, 'net.json')
	try {
		const l = await launchLayer(gw, { netLog })
		try {
			await open(l.page, '/en/home')
			// From the second page the guide's session resumes and it holds a long-poll open on the gateway (20 s).
			const poll = l.page.waitForRequest(/\/__vg\/v1\/events\/poll/, { timeout: 15_000 })
			await open(l.page, '/en/services')
			await poll
			await l.page.waitForTimeout(500)
		} finally {
			await l.close()
		}
		const local = (u: string) => /^(data|blob|about|chrome|chrome-extension):/.test(u) || ['127.0.0.1', 'localhost'].includes(new URL(u).hostname)
		const out = startedRequests(netLog).filter((u) => !local(u))
		assert.deepEqual(out, [], 'Chromium started no request to another host, even while closing')
	} finally {
		fs.rmSync(dir, { recursive: true, force: true })
	}
})

test('offline, Chromium resolves no host but localhost and uses no proxy, so a request that escapes cannot leave (AIXC-65)', () => {
	assert.ok(OFFLINE_ARGS.includes('--no-proxy-server'), 'no proxy: one from the system or the environment would resolve the host itself')
	assert.ok(OFFLINE_ARGS.some((a) => /^--host-resolver-rules=MAP \* ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127\.0\.0\.1$/.test(a)), 'no host name resolves but localhost')
})
