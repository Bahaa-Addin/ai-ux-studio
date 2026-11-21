/**
 * The page watch's floating-control cells (Way 2 phase 6, ADR-0078 Decision 8; AGENTS.md 4.6): the watch's
 * changed count on the Pocket button, the pocketed card's "Changed" liner and the album's changed sticker,
 * measured with the floating-control matrix's own reader and rules (./floating-controls.ts) on Vodafone's
 * saved pages with the live-page kit (./vodafone-layer.ts, its in-memory gateway on 4730), English and
 * Arabic, at 1366×900 and 375×812, with the cookie banner answered (absent) and on a first visit (present),
 * with the matrix's microphone stand-in (the guide listening is a cell too).
 *
 * A real change makes the count: demos.watch on for this test's gateway (its site object only) and a check
 * on every visit (minIntervalMin 0); the card the matrix pockets is watched ("Tell me when this changes"),
 * and after the baseline every page the watch fetches is answered with a test-only edited copy
 * ("TEST-ONLY EDIT", as tests/integration/watch-ui.test.ts does), so the next visit finds a change. Nothing
 * leaves the machine: the watch's fetches are answered by a route on the page.
 *
 * The cells, for each language, viewport and banner: (a) the page with the Pocket button carrying the count
 * 1, and the same with the guide listening; (b) the pocketed card's liner showing "Changed" in view, held
 * like the matrix's chipsUnderFixed (a press at the liner that reaches a fixed control is a violation);
 * (c) the album open from the liner at the changed sticker (its tag, line, "Open the page", "Stop watching").
 * Each cell asserts what it is about was measured and shown, so it cannot pass on an empty box. Opening the
 * album marks the change seen and hides the Pocket button (rule f), so in (c) the count is asserted gone and
 * the changed sticker's lines are what is measured shown.
 *
 * Screenshots of every cell go to $TMPDIR/floating-shots (never into the repository).
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import zlib from 'node:zlib'

import type { Page } from 'playwright'

import { ACTORS_TEST, albumAtRest, cellHits, cellViolations, FIXED, hitsAt, type Measure, measureControls, MIC_STAND_IN, OVERLAP_EXCEPTIONS, pocketOne, points, type Press, press, settle, WIDGET_DEFINED } from './floating-controls.ts'
import { BANNER_STAND_IN, DESKTOP, type LayerGateway, launchLayer, open, PHONE, REPLAY, startLayerGateway, V, watch } from './vodafone-layer.ts'

const PORT = 4730
const SHOTS = path.join(process.env.TMPDIR || os.tmpdir(), 'floating-shots')
let gw: LayerGateway

before(async () => {
	gw = await startLayerGateway(PORT)
	// This test's site object only: the watch on (the site's config keeps it off), a check on every visit.
	gw.site.experiences.demos.watch = true
	gw.site.experiences.watch.minIntervalMin = 0
})
after(async () => {
	await gw?.close()
})

/* eslint-disable @typescript-eslint/no-explicit-any */

const SNAPSHOTS = new Map(
	(JSON.parse(fs.readFileSync(path.join(REPLAY, 'crawl.json'), 'utf8')) as { pages: { url: string; snapshot?: string }[] }).pages.filter((p) => p.snapshot).map((p) => [new URL(p.url).pathname, path.join(REPLAY, p.snapshot!)]),
)
const saved = (pathname: string) => {
	const file = SNAPSHOTS.get(pathname)
	return file ? zlib.gunzipSync(fs.readFileSync(file)).toString('utf8') : null
}
/** A test-only edited copy: one paragraph more in #main-content. */
const edited = (html: string) => html.replace(/(<[^>]+id="main-content"[^>]*>)/, '$1<p data-test-edit>TEST-ONLY EDIT: a new bundle price, written by this test.</p>')

/** The watch's fetches answered on the page (robots.txt and the saved pages, edited once `edit` is set); navigations go to the replay. */
async function answerWatch(page: Page) {
	const f = { edit: false, log: [] as string[] }
	await page.route(
		(url) => url.origin === V,
		async (route) => {
			const req = route.request()
			const url = new URL(req.url())
			if (req.resourceType() !== 'fetch' || url.pathname.startsWith('/__vg/')) return route.fallback()
			f.log.push(`${f.edit ? 'edited ' : ''}${url.pathname}`)
			if (url.pathname === '/robots.txt') return route.fulfill({ status: 200, contentType: 'text/plain', body: 'User-agent: *\nAllow: /\n' })
			const html = saved(url.pathname)
			if (!html) return route.fulfill({ status: 404, contentType: 'text/html', body: '<!doctype html><title>404</title>' })
			return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: f.edit ? edited(html) : html })
		},
	)
	return f
}

const ready = (page: Page) => page.waitForFunction(() => (window as any).__aixcWatch?.ready === true, null, { timeout: 15_000 })
const view = (page: Page, v: 'page' | 'pocket') => page.waitForFunction((v) => (window as any).__aixc.demos.pocket.state.view === v && !(window as any).__aixc.demos.pocket.state.busy, v, { timeout: 15_000 })
const BLOCK = (key: string) => `[...document.querySelectorAll('.aixc-watch')].find((b) => b.dataset.watchFor === ${JSON.stringify(key)})`
const LINER = (id: string) => `document.querySelector('.pocket-chips .pocket-cta[data-pocket-for="${id.replace(/["\\]/g, '\\$&')}"]')?.parentElement?.querySelector('.pocket-liner .aixc-watch-liner')`
const IN_GUIDE = (sel: string) => `document.querySelector('vg-guide').shadowRoot.querySelector(${JSON.stringify(sel)})`
const badge = (page: Page) => page.evaluate(() => document.querySelector<HTMLElement>('.pocket-peek__changed:not([hidden])')?.textContent ?? null)

interface Cell {
	page: string
	lang: string
	viewport: string
	banner: 'absent' | 'present'
	state: string
	measure: Measure
	violations: string[]
	shot: string
	/** Points of the liner a press reaches a fixed control at (cell b), as the matrix's chipsUnderFixed. */
	linerUnderFixed?: string[]
}

/** Pockets the matrix's card, watches it, edits its pages and comes back: the count 1, then cells (a), (b), (c). */
async function walk(page: Page, o: { lang: string; banner: boolean; vpName: string }): Promise<Cell[]> {
	const cells: Cell[] = []
	const pathname = `/${o.lang}/services`
	const how: Press = o.banner ? 'click()' : 'mouse'
	const where = `${pathname} ${o.vpName} banner ${o.banner ? 'present' : 'absent'}`
	const f = await answerWatch(page)
	if (o.banner) await page.addInitScript(BANNER_STAND_IN)
	await open(page, pathname, '?aixc=off')
	await settle(page, 300)
	const off = (await measureControls(page, 'off')).button
	assert.ok(off, `${where}: the accessibility button stands in`)
	const take = async (state: string) => {
		const m = await measureControls(page, state)
		const hits = await cellHits(page, m)
		const violations = cellViolations(m, { where, off, ...hits })
		fs.mkdirSync(SHOTS, { recursive: true })
		const shot = path.join(SHOTS, `watch-${o.lang}-${o.vpName}-banner-${o.banner ? 'present' : 'absent'}-${state.split(' ')[0]}.png`)
		await page.screenshot({ path: shot })
		cells.push({ page: pathname, lang: o.lang, viewport: o.vpName, banner: o.banner ? 'present' : 'absent', state, measure: m, violations, shot })
		if (o.banner) assert.ok(m.controls.banner?.shown, `${where} ${state}: the banner shows`)
		return cells.at(-1)!
	}
	const countShown = async (c: Cell) => {
		// The count is part of the Pocket button (a child of .pocket-peek), so a press on it opens the Pocket: that is why
		// rule (c) may take 'pocket' as its hit (the live-demos session's condition). A sibling with its own handler would be a real overlap.
		assert.ok(await page.evaluate(() => !!document.querySelector('.pocket-peek')?.contains(document.querySelector('.pocket-peek__changed'))), `${where} ${c.state}: the count sits inside the Pocket button`)
		const w = c.measure.controls.watch
		assert.ok(w && w.box && w.box.right - w.box.left > 0 && w.box.bottom - w.box.top > 0, `${where} ${c.state}: the count was measured (${JSON.stringify(w)})`)
		assert.ok(w.shown, `${where} ${c.state}: the count shows (${JSON.stringify(w)})`)
		assert.ok(c.measure.controls.pocket?.shown, `${where} ${c.state}: the Pocket button shows`)
	}

	// Setup: nothing pocketed, the matrix's card pocketed, watched in the album; the baseline read.
	await open(page, pathname, '?aixc-debug')
	await ready(page)
	await page.evaluate(async () => {
		const { store } = (window as any).__aixc.demos.pocket
		await store.ready
		await store.clear()
	})
	await page.waitForSelector('#pocket-output[data-pocket-actor-ready]', { state: 'attached', timeout: 10_000 }).catch(() => {})
	await settle(page, 400)
	const before = await page.evaluate(() => [...(window as any).__aixc.demos.pocket.state.ids])
	const covered: string[] = []
	await pocketOne(page, how, covered)
	const key: string = await page.evaluate((before) => (window as any).__aixc.demos.pocket.state.ids.find((k: string) => !before.includes(k)), before)
	// The store was empty: its one record is the card the matrix pocketed.
	const id: string = await page.evaluate(() => (window as any).__aixc.demos.pocket.store.all()[0]?.id ?? null)
	assert.ok(key && id, `${where}: the card is pocketed (${key}, ${id})`)
	await page.evaluate(() => (window as any).__aixc.demos.pocket.open())
	await view(page, 'pocket')
	await page.waitForFunction((b) => !!eval(b)?.querySelector('button'), BLOCK(key), { timeout: 10_000 })
	await page.evaluate((b) => (eval(b) as HTMLElement).querySelector<HTMLElement>('button')!.click(), BLOCK(key))
	await page.waitForFunction((b) => (eval(b) as HTMLElement | undefined)?.querySelector('.aixc-watch__line') && (eval(b) as HTMLElement).querySelectorAll('button').length === 1, BLOCK(key), { timeout: 15_000 })
	// The baseline reads the card's page, then (spacingMs later) the page its link opens: wait for both.
	for (const t = Date.now(); !f.log.some((p) => p !== '/robots.txt' && p !== pathname) && Date.now() - t < 15_000; ) await page.waitForTimeout(200)
	assert.ok(f.log.some((p) => p !== '/robots.txt' && p !== pathname), `${where}: the baseline read the page the card opens (${f.log.join(', ')})`)
	await settle(page, 600)
	await page.evaluate(() => (window as any).__aixc.demos.pocket.close())
	await view(page, 'page')

	// The pages change (test-only copies); the next visit's check finds it: the count 1 on the Pocket button.
	f.edit = true
	await page.reload({ waitUntil: 'load' })
	await ready(page)
	await page.waitForFunction(() => document.querySelector<HTMLElement>('.pocket-peek__changed:not([hidden])')?.textContent === '1', null, { timeout: 20_000 }).catch((e) => {
		throw new Error(`${where}: no count after the edit (fetches: ${f.log.join(', ')}): ${(e as Error).message}`)
	})
	await page.waitForSelector('.pocket-peek[data-state="shown"]', { timeout: 5_000 })
	await page.mouse.wheel(0, -6000)
	await settle(page, 900)
	assert.equal(await badge(page), '1')

	// (a) The page, the Pocket button with its count.
	await countShown(await take('(a) count on the Pocket button'))

	// (a) The guide listening (the matrix's S5): its bar and keyboard button out beside the count.
	await press(page, how, IN_GUIDE('.vg-mic'))
	await page.waitForFunction(() => {
		const r = document.querySelector('vg-guide')!.shadowRoot!
		return !r.querySelector('.vg-bar')!.classList.contains('hidden') && r.querySelector('.vg-kbd')!.classList.contains('show')
	}, null, { timeout: 10_000 })
	await settle(page, 400)
	const listening = await take('(a)+mic count, the guide listening')
	await countShown(listening)
	assert.ok(listening.measure.controls.bar?.shown && listening.measure.controls.kbd?.shown, `${where}: the transcript bar and the keyboard button show`)
	await press(page, how, IN_GUIDE('.vg-mic'))
	await page.mouse.move(page.viewportSize()!.width / 2, page.viewportSize()!.height / 2, { steps: 4 })
	await page.waitForFunction(() => {
		const r = document.querySelector('vg-guide')!.shadowRoot!
		return r.querySelector('.vg-bar')!.classList.contains('hidden') && !r.querySelector('.vg-kbd')!.classList.contains('show')
	}, null, { timeout: 10_000 })
	await settle(page, 600)

	// (b) The pocketed card's liner, "Changed", in view.
	await page.waitForFunction((l) => !!eval(l), LINER(id), { timeout: 10_000 })
	await page.evaluate((l) => (eval(l) as HTMLElement).scrollIntoView({ block: 'center', inline: 'nearest' }), LINER(id))
	await settle(page, 900)
	const liner = await page.evaluate((l) => {
		const b = eval(l) as HTMLElement
		const r = b.getBoundingClientRect()
		return { text: b.textContent, box: { left: r.left, top: r.top, right: r.right, bottom: r.bottom } }
	}, LINER(id))
	const b = await take('(b) the liner, Changed')
	await countShown(b)
	assert.match(liner.text ?? '', o.lang === 'en' ? /^Changed$/ : /^اتغيّرت$/, `${where}: the liner says it changed`)
	assert.ok(liner.box.right - liner.box.left > 0 && liner.box.bottom - liner.box.top > 0 && liner.box.top >= 0 && liner.box.bottom <= page.viewportSize()!.height, `${where}: the liner is measured on the screen (${JSON.stringify(liner.box)})`)
	// As chipsUnderFixed: a press at the liner must not reach a fixed control (with the banner, its filter is on top by rule e).
	const ours = new Set<string>(FIXED.filter((n) => n !== 'banner'))
	const lhits = await hitsAt(page, points(liner.box))
	b.linerUnderFixed = lhits.filter((h) => ours.has(h.at) || (!o.banner && (h.at === 'banner' || h.at === 'filter'))).map((h) => `(${h.x},${h.y}) ${h.at}`)
	for (const h of lhits) if (!o.banner ? !/aixc-watch-liner/.test(h.at) : !['banner', 'filter'].includes(h.at) && !/aixc-watch-liner/.test(h.at)) b.violations.push(`${where} ${b.state}: a press at the liner's point (${h.x},${h.y}) reaches ${h.at}`)
	for (const x of b.linerUnderFixed) b.violations.push(`${where} ${b.state}: the liner is under a fixed control at ${x}`)

	// (c) The album, opened from the liner at the changed sticker: its tag, its line, Open the page, Stop watching.
	await press(page, how, LINER(id))
	await albumAtRest(page)
	await page.evaluate((b) => (eval(b) as HTMLElement).closest('.pocket-grid__item')?.scrollIntoView({ block: 'center' }), BLOCK(key))
	await albumAtRest(page)
	const sticker = await page.evaluate((b) => {
		const box = eval(b) as HTMLElement
		const shown = (n: Element | null) => {
			if (!n) return false
			const r = n.getBoundingClientRect()
			return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && getComputedStyle(n).visibility !== 'hidden'
		}
		const tag = box.querySelector('.aixc-watch__tag')
		return {
			tag: tag?.textContent ?? null,
			tagShown: shown(tag),
			lines: [...box.querySelectorAll('.aixc-watch__line')].map((p) => p.textContent),
			buttons: [...box.querySelectorAll('button, a')].map((x) => [x.textContent, shown(x)] as [string | null, boolean]),
		}
	}, BLOCK(key))
	const c = await take('(c) album, the changed sticker')
	assert.equal(c.measure.state.pocketView, 'pocket', `${where}: the album is open`)
	assert.equal(await badge(page), null, `${where}: the album marked the change seen (the count goes)`)
	assert.equal(c.measure.controls.watch?.shown ?? false, false, `${where}: no count in the album (${JSON.stringify(c.measure.controls.watch)})`)
	assert.equal(sticker.tag, o.lang === 'en' ? 'Changed' : 'اتغيّرت', `${where}: the sticker's tag (${JSON.stringify(sticker)})`)
	assert.ok(sticker.tagShown, `${where}: the tag shows`)
	assert.match(sticker.lines[0] ?? '', o.lang === 'en' ? /changed · \d{1,2} [A-Z][a-z]{2}$/ : /اتغيّرت · /, `${where}: the changed line`)
	assert.equal(sticker.buttons.length, 2, `${where}: Open the page and Stop watching (${JSON.stringify(sticker.buttons)})`)
	if (o.lang === 'en') assert.deepEqual(sticker.buttons.map((x) => x[0]), ['Open the page', 'Stop watching'])
	assert.ok(sticker.buttons.every((x) => x[1]), `${where}: both show (${JSON.stringify(sticker.buttons)})`)
	if (covered.length) console.log(`${where}: chips under a fixed control on the way: ${covered.join('; ')}`)
	return cells
}

const report = (cells: Cell[]) => cells.flatMap((c) => c.violations)

const CASES = [
	{ lang: 'en', vp: DESKTOP, vpName: '1366x900' },
	{ lang: 'en', vp: PHONE, vpName: '375x812' },
	{ lang: 'ar', vp: DESKTOP, vpName: '1366x900' },
	{ lang: 'ar', vp: PHONE, vpName: '375x812' },
] as const

for (const c of CASES)
	for (const banner of [false, true]) {
		const name = `${c.lang} ${c.vpName} banner ${banner ? 'present' : 'absent'}`
		test(`${name}: the watch's count, the Changed liner and the changed sticker keep the matrix's rules (ADR-0078 Decision 8)`, { timeout: 240_000 }, async () => {
			const l = await launchLayer(gw, { viewport: c.vp, owl: true, initScripts: [WIDGET_DEFINED, MIC_STAND_IN, ACTORS_TEST] })
			const t0 = Date.now()
			try {
				const seen = watch(l.page)
				const cells = await walk(l.page, { lang: c.lang, banner, vpName: c.vpName })
				for (const x of cells) console.log(`${name} ${x.state}: watch ${JSON.stringify(x.measure.controls.watch?.box ?? null)} shown ${x.measure.controls.watch?.shown ?? false}; pocket ${JSON.stringify(x.measure.controls.pocket?.box ?? null)}; ${x.violations.length} violations; ${x.shot}`)
				console.log(`${name}: ${cells.length} cells in ${Math.round((Date.now() - t0) / 1000)} s; exceptions ${OVERLAP_EXCEPTIONS.map((e) => e.pair.join('/')).join(', ')}`)
				assert.deepEqual(report(cells), [], 'every cell keeps the rules')
				assert.deepEqual(seen.pageErrors, [], 'no page errors')
				assert.ok(!seen.layer.some((x) => x.startsWith('error:')), `no layer error: ${seen.layer.join(' | ')}`)
				assert.deepEqual(l.reached, [], 'nothing reached the internet')
			} finally {
				await l.close()
			}
		})
	}
