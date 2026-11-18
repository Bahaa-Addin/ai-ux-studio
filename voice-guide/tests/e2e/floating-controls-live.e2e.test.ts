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
 * too, for another theme. S6 (Tips open) and S7 (the reimagined view) are PENDING: neither is on live pages
 * before phases 6 and 4; their cells are skipped with that reason so they cannot be forgotten.
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

import { ACTORS_TEST, albumAtRest, cellHits, cellViolations, type Measure, measureControls, MIC_STAND_IN, OVERLAP_EXCEPTIONS, pocketOne, type Press, press, settle, WIDGET_DEFINED } from './floating-controls.ts'
import { BANNER_STAND_IN, DESKTOP, type LayerGateway, launchLayer, open, PHONE, startLayerGateway, watch } from './vodafone-layer.ts'

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
	for (const [state, why] of [
		['S6 Tips open', "PENDING: Tips (.tips-entry) is not on live pages before the live plan's phase 6"],
		['S7 the reimagined view', "PENDING: Reimagine's launcher (.aixc-launcher) and its view are not on live pages before phase 4"],
	])
		test(`${c.lang} ${c.vpName}, banner absent and present: ${state} (S16)`, { skip: why }, () => {})
