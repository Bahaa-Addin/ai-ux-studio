/**
 * The floating-control matrix on Vodafone's own pages (live plan §3.7; phase 3 map S16; ADR-0050, ADR-0052,
 * ADR-0064): on the saved pages with the live-page kit (./vodafone-layer.ts), English and Arabic, at
 * 1366×900 and 375×812, with the cookie banner answered (absent) and on a first visit (present, with its
 * filter), every floating control of Vodafone's and of ours is measured with one function
 * (./floating-controls.ts) in each state the demos can be in on a live page, and held to the rules there:
 *
 *   (a) no two shown fixed controls overlap (the exception list is the banner's own, and Vodafone's own pair);
 *   (b) the mascot and the drone keep 16 px from the accessibility button, the mic and (while they show) the
 *       keyboard button and bar; no drone under 640 px; neither over the album's content at rest;
 *   (c) a press at Vodafone's button (and at each of our shown controls) reaches it; nothing of ours has a
 *       z-index at or above OneTrust's filter (2147483645);
 *   (d) the accessibility button's box, style attribute and computed style are as with ?aixc=off;
 *   (e) with the banner, its points reach the banner or its filter, and so do the points of everything of ours;
 *   (f) in the album the Pocket button is hidden and the mascot, the drone and the journey's band are clear
 *       of the fixed controls;
 *   (g) at 375×812 every shown control is inside the viewport.
 *
 * The states, walked in order in one browser context per language and viewport: S1 on load (nothing
 * pocketed; then the trail's consent card from the pill, allowed), S2 one card pocketed by its chip and the
 * Pocket peeking, S5 the guide listening (mic pressed: the transcript bar and the keyboard button), S3 the
 * album open (the mascot and the drone standing), S4 "Your journey" open from the pill. With the banner,
 * whose filter blocks presses, the same states are reached with element.click() (a person cannot press
 * through the filter: the cells say only that nothing of ours is above it). /en/home (maintheme) is walked
 * too, for another theme. S6 (Tips open) is PENDING: Tips is not on live pages before phase 6; its cells are
 * skipped with that reason so they cannot be forgotten.
 *
 * S7, the reimagined view (phase 4c; ADR-0076 §2, §3, §7; design §4): in a browser of its own per language and
 * viewport (Vodafone's navigation pinning on scroll, its phone menu opened by its burger as its script does), on
 * /xx/services: a card pocketed (the Pocket peeking), the composer from the launcher, spotlight's view, the guide
 * listening over it, the composer over the view from "Change experience", canvas's and streaming's previews open in
 * the box, Vodafone's menu over the view (a hover on its navigation's dropdown at 1366, a press on its burger at
 * 375), then Original; /xx/home (maintheme) with the composer, the view and the menu; and with the banner the
 * composer and the view. The view bar and the composer are matrix controls there (rules a and c), and S7's own rules
 * hold (./floating-controls.ts viewViolations, menuHits): no launcher and no resting curl in a view, each corner's
 * zone on the box at least what its controls need, the previews non-modal inside the box, nothing of ours over
 * Vodafone's open menu. The gate's reading (coverage, sections) and the corners' sizes are in every cell.
 *
 * The microphone is stood in at the edge (a silent Web Audio stream for getUserMedia), so the mic press
 * reaches 'listening' with the kit's speech stub. A chip a fixed control lies over where a person would
 * press it (the pill over a RED card's chip on /home) is passed over for the next one and logged.
 *
 * With FLOATING_OUT set (a directory outside the repository), every measured cell is written there as JSON.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { after, before, test } from 'node:test'

import type { Page } from 'playwright'

import { ROOT } from '#shared/config.ts'

import { ACTORS_TEST, albumAtRest, cellHits, cellViolations, cornersLine, type GateReading, gateOf, gateViolations, type Hit, type Measure, measureControls, MENU_CLOSED, MENU_OPEN, menuHits, MIC_STAND_IN, OVERLAP_EXCEPTIONS, PREVIEW_OPENERS, pocketOne, type Press, press, reachableOpener, readView, S7, S7_TEMPLATE, settle, templateInView, underMenu, type ViewExpect, type ViewReading, viewViolations, vodafoneMenuTarget, WIDGET_DEFINED } from './floating-controls.ts'
import { BANNER_STAND_IN, DESKTOP, type LayerGateway, launchLayer, NAV_STAND_IN, open, PHONE, startLayerGateway, watch } from './vodafone-layer.ts'

const PORT = 4485
let gw: LayerGateway

before(async () => {
	gw = await startLayerGateway(PORT, { trail: true })
})
after(async () => {
	await gw?.close()
})

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Where the matrix's measures go (FLOATING_OUT), never inside the repository. */
const OUT = (() => {
	const dir = process.env.FLOATING_OUT
	if (!dir) return null
	const abs = path.resolve(dir)
	const repo = path.resolve(ROOT, '..')
	if (abs === repo || abs.startsWith(repo + path.sep)) throw new Error(`FLOATING_OUT must be outside the repository (${abs})`)
	fs.mkdirSync(abs, { recursive: true })
	return abs
})()

const IN_GUIDE = (sel: string) => `document.querySelector('vg-guide').shadowRoot.querySelector(${JSON.stringify(sel)})`

async function pocketReady(page: Page) {
	await page.waitForFunction(() => (window as any).__aixc?.demos?.pocket?.chips, null, { timeout: 15_000 })
	await page.evaluate(async () => {
		const { store } = (window as any).__aixc.demos.pocket
		await store.ready
		await store.clear()
	})
	// A sticker from an earlier page of the walk: the corner goes once the store is empty.
	await page.waitForFunction(() => [...document.querySelectorAll<HTMLElement>('.pocket-peek')].every((p) => p.dataset.state === 'hidden'), null, { timeout: 5_000 })
	await settle(page, 500)
}

interface Cell {
	page: string
	lang: string
	viewport: string
	banner: 'absent' | 'present'
	state: string
	press: Press
	measure: Measure
	hits: Awaited<ReturnType<typeof cellHits>>
	violations: string[]
	/** Chips passed over on the way to S2 because a fixed control was above them where a person would press. */
	chipsUnderFixed?: string[]
}

/** Walks the states on `pathname` and returns the measured cells. `full` walks S5, S3 and S4 too. */
async function walk(page: Page, o: { pathname: string; banner: boolean; vpName: string; full: boolean; consent: boolean }): Promise<Cell[]> {
	const cells: Cell[] = []
	const how: Press = o.banner ? 'click()' : 'mouse'
	const where = `${o.pathname} ${o.vpName} banner ${o.banner ? 'present' : 'absent'}`
	// Each walk starts with nothing pocketed: the sticker of the walk before is taken out on its own page.
	await page.evaluate(async () => {
		const store = (window as any).__aixc?.demos?.pocket?.store
		if (store) {
			await store.ready
			await store.clear()
		}
	})
	await open(page, o.pathname, '?aixc=off')
	await settle(page, 300)
	const off = (await measureControls(page, 'off')).button
	assert.ok(off, `${where}: the accessibility button stands in`)
	if (o.banner) assert.ok((await measureControls(page, 'off')).controls.banner?.shown, `${where}: the banner shows`)
	const take = async (state: string) => {
		const m = await measureControls(page, state)
		const hits = await cellHits(page, m)
		const violations = cellViolations(m, { where, off, ...hits })
		cells.push({ page: o.pathname, lang: o.pathname.slice(1, 3), viewport: o.vpName, banner: o.banner ? 'present' : 'absent', state, press: how, measure: m, hits, violations })
		return m
	}

	await open(page, o.pathname, '?aixc-debug')
	await pocketReady(page)
	await page.waitForSelector('#pocket-output[data-pocket-actor-ready]', { state: 'attached', timeout: 10_000 }).catch(() => {})
	await settle(page, 400)
	const s1 = await take('S1 on load')
	assert.equal(s1.controls.pocket?.shown ?? false, false, `${where}: no Pocket button before anything is pocketed (${JSON.stringify(s1.controls.pocket)})`)
	if (o.banner) assert.ok(s1.controls.banner?.shown, `${where}: the banner shows on load`)

	if (o.consent) {
		// The trail asks first: the pill opens its consent card; allowed, it records.
		await press(page, how, IN_GUIDE('.tr-pill'))
		await page.waitForFunction(() => !document.querySelector('vg-guide')!.shadowRoot!.querySelector<HTMLElement>('.tr-card')!.hidden, null, { timeout: 10_000 })
		await settle(page, 400)
		await take('S1 consent card')
		await press(page, how, IN_GUIDE('.tr-allow'))
		await page.waitForFunction(() => (window as any).__vgTrailActive?.state?.consent === 'granted', null, { timeout: 10_000 })
		await settle(page, 600)
	}

	const covered: string[] = []
	await pocketOne(page, how, covered)
	const s2 = await take('S2 pocketed, peeking')
	cells.at(-1)!.chipsUnderFixed = covered
	assert.ok(s2.controls.pocket?.shown, `${where}: the Pocket button peeks`)
	if (!o.full) return cells

	// S5: the guide listening, its transcript bar and keyboard button out.
	await press(page, how, IN_GUIDE('.vg-mic'))
	await page.waitForFunction(() => {
		const r = document.querySelector('vg-guide')!.shadowRoot!
		return !r.querySelector('.vg-bar')!.classList.contains('hidden') && r.querySelector('.vg-kbd')!.classList.contains('show')
	}, null, { timeout: 10_000 })
	await settle(page, 400)
	const s5 = await take('S5 listening')
	assert.ok(s5.controls.bar?.shown && s5.controls.kbd?.shown, `${where}: the transcript bar and the keyboard button show (${s5.state.mic})`)
	assert.equal(s5.state.mic, 'listening', `${where}: the guide listens`)
	// Stop listening with the mic's own stop press: the bar and the keyboard button go (the keyboard
	// button also peeks while the pointer is on the mic, so the pointer moves off it).
	await press(page, how, IN_GUIDE('.vg-mic'))
	await page.mouse.move(page.viewportSize()!.width / 2, page.viewportSize()!.height / 2, { steps: 4 })
	await page.waitForFunction(() => {
		const r = document.querySelector('vg-guide')!.shadowRoot!
		return r.querySelector('.vg-bar')!.classList.contains('hidden') && !r.querySelector('.vg-kbd')!.classList.contains('show')
	}, null, { timeout: 10_000 }).catch(async (e) => {
		throw new Error(`${where}: the guide's bar did not go after the stop press (${await page.evaluate(() => document.querySelector('vg-guide')!.shadowRoot!.querySelector<HTMLElement>('.vg-mic')!.dataset.state)}): ${(e as Error).message}`)
	})
	await settle(page, 600)

	// S3: the album open, the mascot and the drone standing, the journey closed.
	await page.mouse.wheel(0, -6000)
	await settle(page, 400)
	await press(page, how, `document.querySelector('.pocket-peek[data-state="shown"]')`)
	await albumAtRest(page)
	const s3 = await take('S3 album, journey closed')
	assert.equal(s3.state.pocketView, 'pocket', `${where}: the album is open`)
	assert.equal(s3.state.journey, false, `${where}: the journey is closed`)

	// S4: "Your journey" open from the pill (the trail allowed above).
	const pillShown = await page.evaluate(() => {
		const p = document.querySelector('vg-guide')!.shadowRoot!.querySelector<HTMLElement>('.tr-pill')
		return !!p && !p.hidden && !p.classList.contains('tucked') && p.getBoundingClientRect().width > 0
	})
	assert.ok(pillShown, `${where}: the pill shows in the album`)
	await press(page, how, IN_GUIDE('.tr-pill'))
	await page.waitForSelector('.pocket-journey-layer:not([hidden])', { timeout: 15_000 })
	await albumAtRest(page)
	const s4 = await take('S4 album, journey open')
	assert.equal(s4.state.journey, true, `${where}: the journey is open`)
	return cells
}

const report = (cells: Cell[]) => cells.flatMap((c) => c.violations)

const CASES = [
	{ lang: 'en', vp: DESKTOP, vpName: '1366x900', home: true },
	{ lang: 'en', vp: PHONE, vpName: '375x812', home: false },
	{ lang: 'ar', vp: DESKTOP, vpName: '1366x900', home: false },
	{ lang: 'ar', vp: PHONE, vpName: '375x812', home: true },
] as const

for (const c of CASES) {
	const name = `${c.lang} ${c.vpName}`
	test(`${name}: every floating control in every live state, banner absent and present: no overlaps, Vodafone's button and banner uncovered and untouched (S16)`, { timeout: 240_000 }, async () => {
		const l = await launchLayer(gw, { viewport: c.vp, owl: true, initScripts: [WIDGET_DEFINED, MIC_STAND_IN, ACTORS_TEST] })
		const t0 = Date.now()
		try {
			const seen = watch(l.page)
			const cells: Cell[] = []
			cells.push(...(await walk(l.page, { pathname: `/${c.lang}/services`, banner: false, vpName: c.vpName, full: true, consent: true })))
			if (c.home) cells.push(...(await walk(l.page, { pathname: `/${c.lang}/home`, banner: false, vpName: c.vpName, full: false, consent: false })))
			// A first visit: OneTrust's banner and filter from the next page on (the trail stays allowed).
			await l.page.addInitScript(BANNER_STAND_IN)
			cells.push(...(await walk(l.page, { pathname: `/${c.lang}/services`, banner: true, vpName: c.vpName, full: true, consent: false })))
			if (OUT) fs.writeFileSync(path.join(OUT, `floating-${c.lang}-${c.vpName}.json`), JSON.stringify({ at: new Date().toISOString(), viewport: c.vp, ms: Date.now() - t0, exceptions: OVERLAP_EXCEPTIONS, cells }, null, 2))
			for (const x of cells) if (x.chipsUnderFixed?.length) console.log(`${name} ${x.page} banner ${x.banner}: chips under a fixed control: ${x.chipsUnderFixed.join('; ')}`)
			console.log(`${name}: ${cells.length} cells measured in ${Math.round((Date.now() - t0) / 1000)} s (${cells.map((x) => `${x.page} ${x.banner} ${x.state.split(' ')[0]}`).join('; ')})`)
			assert.deepEqual(report(cells), [], 'every cell keeps the rules')
			assert.deepEqual(seen.pageErrors, [], 'no page errors')
			assert.ok(!seen.layer.some((x) => x.startsWith('error:')), `no layer error: ${seen.layer.join(' | ')}`)
			assert.deepEqual(l.reached, [], 'nothing reached the internet')
		} finally {
			await l.close()
		}
	})
}

/* PENDING cells: not on live pages yet. They are here so that the phase that brings them fills them in. */
for (const c of CASES)
	for (const [state, why] of [['S6 Tips open', "PENDING: Tips (.tips-entry) is not on live pages before the live plan's phase 6"]])
		test(`${c.lang} ${c.vpName}, banner absent and present: ${state} (S16)`, { skip: why }, () => {})

/* ------------------------------------------------------------------ S7: the reimagined view (phase 4c) */

const Q = (sel: string) => `document.querySelector(${JSON.stringify(sel)})`

interface S7Cell extends Cell {
	view: ViewReading
	gate: GateReading
	notes: string[]
	menuHits: Record<string, Hit[]>
}

/** Reimagine's launcher at the top of the page, shown and still (its chunk loads at idle; it tucks with the pill). */
async function launcherAtTop(page: Page, where: string) {
	const vs = page.viewportSize()!
	await page.mouse.move(vs.width / 2, vs.height / 2)
	await page.mouse.wheel(0, -8000)
	await page
		.waitForFunction(
			() => {
				const b = document.querySelector<HTMLElement>('.aixc-launcher')
				if (!b || b.hidden || b.hasAttribute('data-tucked') || getComputedStyle(b).visibility === 'hidden') return false
				const r = b.getBoundingClientRect()
				return r.width > 0 && r.top >= 0 && r.bottom <= innerHeight
			},
			null,
			{ timeout: 20_000 },
		)
		.catch(async (e) => {
			throw new Error(`${where}: Reimagine's launcher did not show at the top (${JSON.stringify(await page.evaluate(() => (window as any).__aixc?.demos?.reimagine?.debug?.() ?? null))}): ${(e as Error).message}`)
		})
	await settle(page, 400)
}

const composerShown = async (page: Page) => {
	await page.waitForSelector('.aixc-composer:not([hidden])', { timeout: 10_000 })
	// Its words in Vodafone's faces (rule h): read once the faces have loaded.
	await page.evaluate(() => document.fonts.ready.then(() => {}))
	await settle(page, 400)
}

/** The view of `template` shows, its stage mounted. */
const viewShown = async (page: Page, template: string) => {
	await page.waitForFunction(
		(t) => {
			const s = (window as any).__aixc?.demos?.reimagine?.state
			return s?.view === 'reimagined' && s.template === t && !!document.querySelector('.aixc-box:not([hidden]) > .aixc-stage > *')
		},
		template,
		{ timeout: 20_000 },
	)
	await page.evaluate(() => document.fonts.ready.then(() => {}))
	await settle(page, 900)
}

const pickTemplate = async (page: Page, how: Press, template: string) => {
	assert.ok(await templateInView(page, template), `the composer has ${template}`)
	await press(page, how, Q(`.aixc-composer:not([hidden]) .aixc-template[data-template="${template}"]`))
	await viewShown(page, template)
}

/** A preview opened from the card a press reaches nearest the box's middle; it shows, open in the box. */
async function openPreview(page: Page, how: Press, which: keyof typeof PREVIEW_OPENERS, where: string) {
	const id = await reachableOpener(page, which)
	assert.ok(id, `${where}: a ${which} card whose preview a press reaches`)
	const o = PREVIEW_OPENERS[which]
	await press(page, how, Q(`${o.item}[data-aixc-item="${CSS_ESC(id)}"]${o.button ? ` ${o.button}` : ''}`))
	await page.waitForFunction((item) => !!document.querySelector<HTMLDialogElement>(`${item.split(' ')[0]} dialog[open]`), o.item, { timeout: 5_000 })
	// Canvas's preview zooms in (600 ms, its words 650 ms later).
	await settle(page, 1400)
}
const closePreview = async (page: Page, how: Press, which: keyof typeof PREVIEW_OPENERS) => {
	await press(page, how, Q(PREVIEW_OPENERS[which].close))
	await page.waitForFunction(() => !document.querySelector('.aixc-box dialog[open]'), null, { timeout: 5_000 })
	await settle(page, 600)
}
const CSS_ESC = (s: string) => s.replace(/["\\]/g, '\\$&')

/**
 * S7 on `pathname`: a card pocketed (the Pocket peeking), the composer from the launcher, spotlight's view; with
 * `full` the guide listening over it, the composer over the view from "Change experience", canvas's and streaming's
 * previews open in the box; without the banner Vodafone's menu over the view (a hover on its navigation's dropdown on
 * a wide screen, a press on its burger on a narrow one); then Original. Each cell: rules a to h with the view bar and
 * the composer as controls, S7's rules (viewViolations), Vodafone's menu over ours (menuHits; our points under it
 * taken out of rule c, underMenu), the gate's reading and the corners' zones.
 */
async function walkS7(page: Page, o: { pathname: string; banner: boolean; vpName: string; full: boolean }): Promise<S7Cell[]> {
	const cells: S7Cell[] = []
	const how: Press = o.banner ? 'click()' : 'mouse'
	const where = `${o.pathname} ${o.vpName} banner ${o.banner ? 'present' : 'absent'}`
	await page.evaluate(async () => {
		const store = (window as any).__aixc?.demos?.pocket?.store
		if (store) {
			await store.ready
			await store.clear()
		}
	})
	await open(page, o.pathname, '?aixc=off')
	await settle(page, 300)
	const off = (await measureControls(page, 'off')).button
	assert.ok(off, `${where}: the accessibility button stands in`)
	await open(page, o.pathname, '?aixc-debug')
	await pocketReady(page)
	const gate = await gateOf(page)
	assert.ok(gate.passes, `${where}: the saved page passes the gate (${gate.why})`)
	assert.deepEqual(gateViolations(where, gate), [], `${where}: the launcher's gate as the reading says`)
	const take = async (state: string, expect: ViewExpect) => {
		const m = await measureControls(page, state)
		const r = await readView(page)
		const raw = await cellHits(page, m)
		const under = underMenu(raw.hits, r)
		const menu = expect.menu ? await menuHits(page, where, r) : { violations: [], notes: [], hits: {} }
		const s7 = viewViolations(where, r, m, expect)
		const violations = [...cellViolations(m, { where, off, hits: under.hits, bannerHits: raw.bannerHits }), ...s7.violations, ...menu.violations]
		cells.push({ page: o.pathname, lang: o.pathname.slice(1, 3), viewport: o.vpName, banner: o.banner ? 'present' : 'absent', state, press: how, measure: m, hits: { hits: under.hits, bannerHits: raw.bannerHits }, violations, view: r, gate, notes: [...under.notes, ...s7.notes, ...menu.notes], menuHits: menu.hits })
		return { m, r }
	}

	const covered: string[] = []
	await pocketOne(page, how, covered)
	await launcherAtTop(page, where)
	await press(page, how, Q('.aixc-launcher'))
	await composerShown(page)
	await take(S7.composer, { view: 'original', composer: true, pocket: true })
	await pickTemplate(page, how, S7_TEMPLATE)
	await take(S7.view, { view: 'reimagined', composer: false, pocket: true })

	if (o.full) {
		await press(page, how, IN_GUIDE('.vg-mic'))
		await page.waitForFunction(() => {
			const r = document.querySelector('vg-guide')!.shadowRoot!
			return !r.querySelector('.vg-bar')!.classList.contains('hidden') && r.querySelector('.vg-kbd')!.classList.contains('show')
		}, null, { timeout: 10_000 })
		await settle(page, 700)
		await take(S7.listening, { view: 'reimagined', composer: false, pocket: true, listening: true })
		await press(page, how, IN_GUIDE('.vg-mic'))
		await page.mouse.move(page.viewportSize()!.width / 2, page.viewportSize()!.height / 2, { steps: 4 })
		await page.waitForFunction(() => {
			const r = document.querySelector('vg-guide')!.shadowRoot!
			return r.querySelector('.vg-bar')!.classList.contains('hidden') && !r.querySelector('.vg-kbd')!.classList.contains('show')
		}, null, { timeout: 10_000 })
		await settle(page, 600)

		await press(page, how, Q('.aixc-viewbar .aixc-text-btn[aria-controls="aixc-composer"]'))
		await composerShown(page)
		await take(S7.change, { view: 'reimagined', composer: true, pocket: true })
		await pickTemplate(page, how, 'canvas')
		await openPreview(page, how, 'canvas', where)
		await take(S7.canvas, { view: 'reimagined', composer: false, pocket: true, preview: 'canvas' })
		await closePreview(page, how, 'canvas')

		await press(page, how, Q('.aixc-viewbar .aixc-text-btn[aria-controls="aixc-composer"]'))
		await composerShown(page)
		await pickTemplate(page, how, 'streaming')
		await openPreview(page, how, 'streaming', where)
		await take(S7.streaming, { view: 'reimagined', composer: false, pocket: true, preview: 'streaming' })
		await closePreview(page, how, 'streaming')
	}

	if (!o.banner) {
		let at = await vodafoneMenuTarget(page)
		if (!at?.reached) {
			// Its navigation off the screen (it pins only once the page scrolls): the window at its top, as the live walk does.
			await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
			await settle(page, 500)
			at = await vodafoneMenuTarget(page)
		}
		assert.ok(at?.reached, `${where}: Vodafone's menu is there to open, a hit test reaching it (${JSON.stringify(at)})`)
		if (at.how === 'hover') await page.mouse.move(at.x, at.y, { steps: 4 })
		else await page.mouse.click(at.x, at.y)
		await page.waitForFunction(MENU_OPEN, null, { timeout: 5_000 }).catch(() => assert.fail(`${where}: Vodafone's menu did not open (${at.what}, by ${at.how})`))
		await settle(page, 600)
		await take(S7.menu, { view: 'reimagined', composer: false, pocket: true, menu: true })
		// Closed as it was opened: the pointer off the navigation, or the burger again.
		if (at.how === 'hover') {
			const box = (await readView(page)).box!
			await page.mouse.move((box.left + box.right) / 2, (box.top + box.bottom) / 2, { steps: 4 })
		} else {
			const again = await vodafoneMenuTarget(page)
			if (again?.reached) await page.mouse.click(again.x, again.y)
			// The kit's menu over its own burger: closed as Vodafone's script would (the stand-in's class), and said.
			else {
				console.log(`${where}: the burger is under the open menu (${JSON.stringify(again)}): the stand-in's menu closed by its class and the burger's checkbox`)
				await page.evaluate(() => {
					document.querySelector('.nav-header')?.classList.remove('nav-opened')
					for (const c of document.querySelectorAll<HTMLInputElement>('.nav-header .checker')) c.checked = false
				})
			}
		}
		await page.waitForFunction(MENU_CLOSED, null, { timeout: 5_000 }).catch(() => assert.fail(`${where}: Vodafone's menu did not close`))
		await settle(page, 400)
	}

	// Original gives the page back.
	await press(page, how, Q('.aixc-viewbar .aixc-seg[data-view="original"]'))
	await page.waitForFunction(() => (window as any).__aixc?.demos?.reimagine?.state?.view === 'original', null, { timeout: 10_000 })
	await settle(page, 400)
	return cells
}

/** The S7 cells each walk measures, in order. */
const S7_FULL = [S7.composer, S7.view, S7.listening, S7.change, S7.canvas, S7.streaming, S7.menu]
const S7_SHORT = [S7.composer, S7.view, S7.menu]
const S7_BANNER = [S7.composer, S7.view]

for (const c of CASES) {
	const name = `${c.lang} ${c.vpName}`
	test(`${name}: S7 the reimagined view, banner absent and present: the view bar and the composer as controls, the previews in the box, the guide listening, the Pocket peeking, Vodafone's menu over the view; the gate and the corners' zones read (S16)`, { timeout: 480_000 }, async () => {
		// At 375, classic scrollbars, as the live walk's narrowed desktop Chrome has them: Vodafone's phone menu locks the
		// page's scroll and its scrollbar goes (NAV_STAND_IN), so the layout viewport widens under its fixed button (rule d).
		const l = await launchLayer(gw, { viewport: c.vp, owl: true, fixedHeader: 'scroll', scrollbars: c.vp === PHONE, initScripts: [WIDGET_DEFINED, MIC_STAND_IN, ACTORS_TEST, NAV_STAND_IN] })
		const t0 = Date.now()
		try {
			const seen = watch(l.page)
			const cells: S7Cell[] = []
			cells.push(...(await walkS7(l.page, { pathname: `/${c.lang}/services`, banner: false, vpName: c.vpName, full: true })))
			if (c.home) cells.push(...(await walkS7(l.page, { pathname: `/${c.lang}/home`, banner: false, vpName: c.vpName, full: false })))
			await l.page.addInitScript(BANNER_STAND_IN)
			cells.push(...(await walkS7(l.page, { pathname: `/${c.lang}/services`, banner: true, vpName: c.vpName, full: false })))
			if (OUT) fs.writeFileSync(path.join(OUT, `floating-s7-${c.lang}-${c.vpName}.json`), JSON.stringify({ at: new Date().toISOString(), viewport: c.vp, ms: Date.now() - t0, exceptions: OVERLAP_EXCEPTIONS, cells }, null, 2))
			for (const x of cells) console.log(`${name} ${x.page} banner ${x.banner} ${x.state}: corners ${cornersLine(x.view)}; gate ${x.gate.coverage} ${JSON.stringify(x.gate.sections)}${x.notes.length ? `; notes: ${x.notes.join(' | ')}` : ''}`)
			console.log(`${name}: ${cells.length} S7 cells measured in ${Math.round((Date.now() - t0) / 1000)} s`)
			// Every planned cell was reached, in order.
			const states = (page: string, banner: string) => cells.filter((x) => x.page === page && x.banner === banner).map((x) => x.state)
			assert.deepEqual(states(`/${c.lang}/services`, 'absent'), S7_FULL)
			if (c.home) assert.deepEqual(states(`/${c.lang}/home`, 'absent'), S7_SHORT)
			assert.deepEqual(states(`/${c.lang}/services`, 'present'), S7_BANNER)
			// The named controls were measured where they show: the composer in its cells, the view bar in every view but
			// while a preview is open, the preview's close then (the rest of the view inert by design: ADR-0076 §7, the
			// owner's decision of 2026-11-21).
			const inPreview = (x: S7Cell) => x.state === S7.canvas || x.state === S7.streaming
			for (const x of cells) {
				const where = `${x.page} ${x.banner} ${x.state}`
				if (x.state === S7.composer || x.state === S7.change) assert.ok(x.measure.controls.composer?.shown && x.measure.controls.composer.box, `${where}: the composer measured (${JSON.stringify(x.measure.controls.composer)})`)
				if (x.state !== S7.composer && !inPreview(x)) assert.ok(x.measure.controls.viewbar?.shown && x.measure.controls.viewbar.box, `${where}: the view bar measured (${JSON.stringify(x.measure.controls.viewbar)})`)
				if (inPreview(x)) {
					assert.ok(x.measure.controls.viewbar?.inert && !x.measure.controls.viewbar.shown, `${where}: the view bar inert under the open preview (${JSON.stringify(x.measure.controls.viewbar)})`)
					assert.ok(x.measure.controls.preview?.shown && x.measure.controls.preview.box, `${where}: the preview's close measured (${JSON.stringify(x.measure.controls.preview)})`)
				}
				if (x.state !== S7.composer) assert.ok(x.view.zones && x.view.boxZones, `${where}: the box's zones read`)
				assert.ok(x.view.corners.right, `${where}: the bottom-right corner read`)
				if (inPreview(x)) assert.ok(x.hits.hits.preview, `${where}: rule (c) hit-tested the preview's close`)
				else assert.ok(x.hits.hits.viewbar || x.state === S7.composer, `${where}: rule (c) hit-tested the view bar`)
			}
			// The previews: open in the box, not modal, the rest of the view inert, the accessibility button reached at its points (rule c above).
			for (const x of cells.filter(inPreview)) assert.ok(x.view.preview?.open && x.view.preview.inBox && !x.view.preview.modal && !x.view.preview.anyModal && x.view.preview.barInert === true && x.view.preview.usable.length === 0 && x.view.preview.focusInside, `${x.page} ${x.state}: the preview open in the box, not modal, the rest of the view inert, the focus in it (${JSON.stringify(x.view.preview)})`)
			for (const x of cells.filter((x) => x.state === S7.listening)) assert.ok(x.view.zones!.right.controls.includes('bar') || x.view.zones!.right.controls.includes('kbd'), `${x.page} ${x.state}: the right zone takes the guide's bar or keyboard button (${JSON.stringify(x.view.zones)})`)
			for (const x of cells.filter((x) => x.state === S7.menu)) assert.ok(x.view.menu.open && x.view.menu.boxes.length > 0 && Object.keys(x.menuHits).length > 0, `${x.page} ${x.state}: Vodafone's menu open, a part of it on the screen and its points hit-tested (${JSON.stringify(x.view.menu)})`)
			assert.deepEqual(report(cells), [], 'every S7 cell keeps the rules')
			// The saved pages run none of Vodafone's scripts: its burger's own onclick="navToggling()" throws when S7 presses it at 375 (as the menu suites allow).
			assert.deepEqual(seen.pageErrors.filter((e) => !/navToggling is not defined/.test(e)), [], 'no page errors')
			assert.ok(!seen.layer.some((x) => x.startsWith('error:')), `no layer error: ${seen.layer.join(' | ')}`)
			assert.deepEqual(l.reached, [], 'nothing reached the internet')
		} finally {
			await l.close()
		}
	})
}
