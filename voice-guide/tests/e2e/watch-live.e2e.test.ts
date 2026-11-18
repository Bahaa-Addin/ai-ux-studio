/**
 * The page watch end to end on Vodafone's saved pages, with the real layer and the real guide (Way 2 phase 6;
 * ADR-0078; phase 6 design §5 "End to end" and §10). The offline kit (./vodafone-layer.ts) is used as it is;
 * this file's own glue is ./vodafone-watch.ts. Ports 4722 and 4723 only (this file's range is 4720-4729).
 *
 * The watch is turned on for this test's site objects only (`experiences.demos.watch`, which stays false in
 * config/sites/vodafone-eg.yaml). The layer's own fetches to web.vodafone.com.eg are answered by a route on
 * the browser context from the saved pages: 12 Nov 2026 where that capture has the page (Arabic: home,
 * bundles, services, RED), else 23 Oct's (the replay; /ar/vodafone-cash has no 12-Nov copy). Change paths use
 * TEST-ONLY edited copies of the 12-Nov pages, made in memory by the test and marked "TEST-ONLY EDIT" in the
 * HTML. Nothing leaves the machine (the kit's recorder, `reached`).
 *
 * 1. Fill (Arabic on 12-Nov pages, English on 23-Oct pages): two stickers, "No change since 23 Oct" (M4).
 * 2. Change paths: page changed (count, label, liner, seen), card changed, link changed, card removed, 404.
 * 3. Pacing and the site's rules, from the request log: 304 without a parse, two tabs one run, a redirect not
 *    followed, a 403 stops the run and blocks, the 30-minute throttle, at most 12 pages a visit, ≥ 1 s apart,
 *    signed out (no Cookie reaches the route; credentials 'omit', redirect 'manual').
 * 4. "Tell me when this changes", and the guide's chip on a card and on something that is not one: no
 *    POST /v1/watch, no notification permission asked.
 * 5. Removal, "Empty pocket" and reset().
 * 6. A throw at each checkpoint drops only the watch.
 * 7. Screenshots at 1366×900 and 375×812, English and Arabic, to $TMPDIR/e2e-shots; no overlap with
 *    Vodafone's accessibility button, the cookie banner or the guide's mic.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'

import type { Page } from 'playwright'

import { ROOT } from '#shared/config.ts'

import { DESKTOP, type Layer, type LayerGateway, launchLayer, open, PHONE, startLayerGateway, V } from './vodafone-layer.ts'
import {
	type Answers,
	answerWatch,
	block,
	boxes,
	closeAlbum,
	countIs,
	editBundlePrice,
	editCashLink,
	editCashTitle,
	editMainParagraph,
	gaps,
	intersects,
	liner,
	lineIs,
	noCount,
	openAlbum,
	PAGE_PROBE,
	peek,
	pressIn,
	ready,
	removeCash,
	rows,
	runMeta,
	stickers,
	watchKeys,
} from './vodafone-watch.ts'

const PORT_EVERY_VISIT = 4722
const PORT_THROTTLED = 4723
const SHOTS = path.join(process.env.TMPDIR || os.tmpdir(), 'e2e-shots')
/** Facts for the report, printed at the end. */
const facts: Record<string, unknown> = {}
const spacing: number[] = []
const shots: string[] = []

let gw: LayerGateway
let gwSlow: LayerGateway

before(async () => {
	gw = await startLayerGateway(PORT_EVERY_VISIT)
	// This test's site objects only: the watch on (it stays off in the site's config).
	gw.site.experiences.demos.watch = true
	// A check on every visit, so a reload runs one at once.
	gw.site.experiences.watch.minIntervalMin = 0
	gwSlow = await startLayerGateway(PORT_THROTTLED)
	gwSlow.site.experiences.demos.watch = true
	assert.equal(gwSlow.site.experiences.watch.minIntervalMin, 30, 'the site config\'s 30 minutes')
	fs.mkdirSync(SHOTS, { recursive: true })
})

after(async () => {
	await gw?.close()
	await gwSlow?.close()
	console.log(`[watch-live facts] ${JSON.stringify({ ...facts, minSpacingMs: spacing.length ? Math.min(...spacing) : null, shots })}`)
})

interface Run {
	l: Layer
	page: Page
	a: Answers
	errors: string[]
}
async function launch(g: LayerGateway, o: { nov12?: boolean; viewport?: { width: number; height: number }; initScripts?: string[]; banner?: boolean } = {}): Promise<Run> {
	const l = await launchLayer(g, { viewport: o.viewport ?? DESKTOP, reducedMotion: true, banner: o.banner, initScripts: [PAGE_PROBE, ...(o.initScripts ?? [])] })
	// A cookie on Vodafone's origin, as a visitor has: the watch's fetches must never carry it.
	await l.b.context.addCookies([{ name: 'vg_e2e_cookie', value: 'visitor', domain: 'web.vodafone.com.eg', path: '/', secure: true, sameSite: 'Lax' }])
	const a = await answerWatch(l.b.context, { nov12: o.nov12 })
	const errors: string[] = []
	l.page.on('pageerror', (e) => errors.push(e.message))
	return { l, page: l.page, a, errors }
}
/** Every fetch's gaps and signed-out headers, checked and kept for the report. */
function checkLog(r: Run, name: string) {
	const g = gaps(r.a.log.map((x) => x.at))
	// The route sees each request some time after the page made it, and that delay varies (up to about 0.6 s
	// while a page loads), so the gaps here are reported, not asserted; the page-side gaps (PAGE_PROBE, kept in
	// the tab across reloads) are where the spacing is asserted.
	facts[`${name}.routeMinGapMs`] = g.length ? Math.min(...g) : null
	assert.deepEqual(r.a.log.filter((x) => x.cookie).map((x) => x.path), [], `${name}: no Cookie reached the route`)
	assert.ok(r.a.navigations.some((n) => n.cookie), `${name}: the control: navigations do carry the visitor's cookie`)
	facts[`${name}.requests`] = r.a.log.length
	facts[`${name}.cookiesSeen`] = r.a.log.filter((x) => x.cookie).length
}
type Call = { path: string; at: number; credentials: string; redirect: string; cache: string; ifNoneMatch: string | null }
/**
 * The page-side record: every call this tab made (across reloads) with credentials 'omit' and redirect 'manual',
 * ≥ 1000 ms apart. Returns the calls since the last load.
 */
async function checkPageSide(page: Page, name: string) {
	const all: Call[] = await page.evaluate(() => JSON.parse(sessionStorage.getItem('__watchFetchLog') || '[]'))
	for (const c of all) {
		assert.equal(c.credentials, 'omit', `${name}: ${c.path} signed out`)
		assert.equal(c.redirect, 'manual', `${name}: ${c.path} never follows a redirect`)
	}
	const g = gaps(all.map((c) => c.at))
	assert.ok(g.every((d) => d >= 1000), `${name}: the page made its requests ≥ 1000 ms apart (${g.join(', ')})`)
	spacing.push(...g)
	facts[`${name}.pageSide`] = { requests: all.length, minGapMs: g.length ? Math.min(...g) : null }
	const calls: Call[] = await page.evaluate(() => (window as any).__watchFetches)
	return calls
}

const fill = async (page: Page) => {
	const r = await page.evaluate(() => (window as any).__aixcWatch.fill())
	assert.equal(r.ok, true, `fill: ${JSON.stringify(r)}`)
}
/** Waits until no request reached the route for `quietMs` (the run is over). */
async function settle(a: Answers, quietMs = 2500, maxMs = 30_000) {
	const t0 = Date.now()
	for (;;) {
		const last = a.log.at(-1)?.at ?? 0
		if (Date.now() - Math.max(last, t0) >= quietMs) return
		if (Date.now() - t0 > maxMs) return
		await new Promise((r) => setTimeout(r, 200))
	}
}
const reload = async (page: Page) => {
	await page.reload({ waitUntil: 'load' })
	await ready(page)
}
const shoot = async (page: Page, name: string) => {
	const file = path.join(SHOTS, `watch-live-${name}.png`)
	await page.screenshot({ path: file })
	shots.push(file)
	return file
}
const centre = (page: Page, key: string) => page.evaluate((key) => [...document.querySelectorAll<HTMLElement>('.aixc-watch')].find((b) => b.dataset.watchFor === key)?.closest('.pocket-grid__item')?.scrollIntoView({ block: 'center' }), key)
const toCard = (page: Page, id: string) => page.evaluate((id) => document.querySelector(`[data-aixc-item="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'center' }), id)
/** The count and the liner overlap none of Vodafone's accessibility button, the cookie banner, the guide's mic. */
async function noOverlap(page: Page, id: string, name: string) {
	const b = await boxes(page, id)
	assert.ok(b.count, `${name}: the count shows`)
	assert.ok(b.liner, `${name}: the liner shows`)
	assert.ok(b.widget, `${name}: the accessibility button stand-in shows`)
	assert.ok(b.mic, `${name}: the guide's mic shows`)
	for (const mine of ['count', 'liner'] as const)
		for (const theirs of ['widget', 'banner', 'mic'] as const) assert.ok(!intersects(b[mine], b[theirs]), `${name}: the ${mine} overlaps the ${theirs} (${JSON.stringify(b)})`)
	facts[`${name}.boxes`] = b
}

const DEMO = { home: 'mobile-internet-bundles', cash: 'vodafone-cash' }
const keyOf = async (page: Page, id: string) => (await stickers(page)).find((s) => s.id === id)!.key

// ---- 1. Fill ----

test('1. fill on /ar/home answered with the 12-Nov pages: two stickers, both "Watching · No change since 23 Oct" in Arabic (M4)', { timeout: 180_000 }, async () => {
	const r = await launch(gw, { nov12: true })
	try {
		await open(r.page, '/ar/home', '?aixc-debug')
		await ready(r.page)
		await fill(r.page)
		const list = await stickers(r.page)
		assert.deepEqual(list.map((s) => [s.id, s.path]).sort(), [
			[DEMO.home, '/ar/home'],
			[DEMO.cash, '/ar/services'],
		])
		assert.deepEqual(await watchKeys(r.page), list.map((s) => s.key).sort())
		await openAlbum(r.page)
		for (const s of list) await lineIs(r.page, s.key, /^بنتابعها · مفيش تغيير من 23 أكتوبر$/)
		for (const s of list) assert.equal((await block(r.page, s.key))!.dir, 'rtl')
		await closeAlbum(r.page)
		assert.equal((await peek(r.page)).changed, null, 'no change counted')
		// Which day answered each page: 12 Nov where that capture has it.
		const dates = Object.fromEntries(r.a.log.filter((x) => x.date).map((x) => [x.path, x.date]))
		assert.equal(dates['/ar/home'], '2026-11-12')
		assert.equal(dates['/ar/mobile-internet-bundles'], '2026-11-12')
		assert.equal(dates['/ar/services'], '2026-11-12')
		facts['1.answeredWith'] = dates
		const targets = await rows(r.page, 'targets')
		for (const t of targets) assert.equal(t.changedAt ?? null, null, `${t.id}: no change`)
		checkLog(r, 'fill-ar')
		await checkPageSide(r.page, 'fill-ar')
		assert.deepEqual(r.errors, [])
		assert.deepEqual(r.l.reached, [], 'nothing left the machine')
	} finally {
		await r.l.close()
	}
})

// ---- 2. Change paths (Arabic, 12-Nov pages, TEST-ONLY edits) ----

test('2. change paths on TEST-ONLY copies of the 12-Nov pages: page changed (count, label, liner, seen), card changed, new link, card removed, page gone', { timeout: 300_000 }, async () => {
	const r = await launch(gw, { nov12: true })
	const { page, a } = r
	try {
		await open(page, '/ar/home', '?aixc-debug')
		await ready(page)
		await fill(page)
		const home = await keyOf(page, DEMO.home)
		const cash = await keyOf(page, DEMO.cash)
		await settle(a)

		// a. A bundle's price on /ar/mobile-internet-bundles (the page the Home sticker opens).
		a.edits.set('/ar/mobile-internet-bundles', [editBundlePrice])
		await reload(page)
		await countIs(page, '1')
		const p = await peek(page)
		assert.match(p.label!, /^افتح جيبك، .+، 1 اتغيّرت$/, `the button's label: ${p.label}`)
		await page.waitForFunction((id) => !!document.querySelector(`[data-aixc-item="${CSS.escape(id)}"]`) && !!document.querySelector(`.pocket-chips .pocket-cta[data-pocket-for="${CSS.escape(id)}"]`)?.parentElement?.querySelector('.aixc-watch-liner'), DEMO.home, { timeout: 15_000 })
		assert.equal((await liner(page, DEMO.home))?.text, 'اتغيّرت', "the card's liner says Changed")
		assert.match((await liner(page, DEMO.home))!.label!, /اتغيّرت\. شوفها في جيبك$/)
		await toCard(page, DEMO.home)
		await noOverlap(page, DEMO.home, 'ar-1366-page')
		await shoot(page, 'ar-1366-page-count-liner')
		await page.setViewportSize(PHONE)
		await page.waitForTimeout(400)
		await toCard(page, DEMO.home)
		await page.waitForTimeout(200)
		await noOverlap(page, DEMO.home, 'ar-375-page')
		await shoot(page, 'ar-375-page-count-liner')
		await page.setViewportSize(DESKTOP)
		await openAlbum(page)
		await noCount(page)
		const hb = (await block(page, home))!
		assert.equal(hb.tag, 'اتغيّرت')
		assert.match(hb.lines[0]!, /^الصفحة اللي بتفتحها اتغيّرت · /, `the Home sticker: ${JSON.stringify(hb)}`)
		assert.match((await block(page, cash))!.lines[0]!, /^بنتابعها · مفيش تغيير من 23 أكتوبر$/, 'the Cash sticker is unchanged')
		await centre(page, home)
		await shoot(page, 'ar-1366-album-changed')
		await page.setViewportSize(PHONE)
		await page.waitForTimeout(400)
		await centre(page, home)
		await shoot(page, 'ar-375-album-changed')
		await page.setViewportSize(DESKTOP)
		await closeAlbum(page)
		assert.equal((await peek(page)).changed, null, 'opening the album: count 0')
		assert.equal(await liner(page, DEMO.home), null, 'seen: no liner note')

		// b. The Cash card's title on /ar/services.
		a.edits.set('/ar/services', [editCashTitle])
		await reload(page)
		await countIs(page, '1')
		await openAlbum(page)
		await lineIs(page, cash, /^الكارت ده اتغيّر · /)
		await closeAlbum(page)

		// c. The Cash card's link opens another page (its title as published again: with both its title and its
		// link changed, only its picture would still match the sticker, and the Pocket's rule calls that another card).
		a.edits.set('/ar/services', [editCashLink])
		await reload(page)
		await countIs(page, '1')
		await openAlbum(page)
		await lineIs(page, cash, /^بقت بتفتح صفحة تانية · /)
		await closeAlbum(page)
		await settle(a)
		const re = (await rows(page, 'watches')).find((w) => w.key === cash)
		assert.equal(re.pageTargetId, `page ${V}/ar/vodafone-red1`, 'the page target follows the new link')

		// d. The Cash card removed from /ar/services.
		a.edits.set('/ar/services', [removeCash])
		await reload(page)
		await countIs(page, '1')
		await openAlbum(page)
		await lineIs(page, cash, /^مبقتش موجودة في صفحتها · /)
		await closeAlbum(page)

		// e. The page the Home sticker opens answers 404.
		a.status.set('/ar/mobile-internet-bundles', { status: 404 })
		await reload(page)
		await countIs(page, '1')
		await openAlbum(page)
		await lineIs(page, home, /^صفحتها اتشالت · /)
		await closeAlbum(page)
		await settle(a)
		checkLog(r, 'changes-ar')
		await checkPageSide(r.page, 'changes-ar')
		assert.deepEqual(r.errors, [])
		assert.deepEqual(r.l.reached, [], 'nothing left the machine')
	} finally {
		await r.l.close()
	}
})

// ---- 1 (English) and 7 (English screenshots) ----

test('1b/7. English: fill on /en/home answered with the 23-Oct pages -> "Watching · No change since 23 Oct"; then a TEST-ONLY change, the count, the liner, the album; screenshots', { timeout: 240_000 }, async () => {
	const r = await launch(gw, { nov12: false })
	const { page, a } = r
	try {
		await open(page, '/en/home', '?aixc-debug')
		await ready(page)
		await fill(page)
		const list = await stickers(page)
		assert.deepEqual(list.map((s) => s.title).sort(), ['Internet Bundles', 'Vodafone Cash'])
		await openAlbum(page)
		for (const s of list) await lineIs(page, s.key, /^Watching · No change since 23 Oct$/)
		await closeAlbum(page)
		assert.ok(a.log.every((x) => !x.date || x.date === '2026-10-23'))
		await settle(a)
		const home = await keyOf(page, DEMO.home)
		a.edits.set('/en/mobile-internet-bundles', [editMainParagraph])
		await reload(page)
		await countIs(page, '1')
		assert.match((await peek(page)).label!, /^Open your pocket, \d+ \w+, 1 changed$/)
		await page.waitForFunction((id) => !!document.querySelector(`.pocket-chips .pocket-cta[data-pocket-for="${CSS.escape(id)}"]`)?.parentElement?.querySelector('.aixc-watch-liner'), DEMO.home, { timeout: 15_000 })
		assert.equal((await liner(page, DEMO.home))?.text, 'Changed')
		await toCard(page, DEMO.home)
		await noOverlap(page, DEMO.home, 'en-1366-page')
		await shoot(page, 'en-1366-page-count-liner')
		await page.setViewportSize(PHONE)
		await page.waitForTimeout(400)
		await toCard(page, DEMO.home)
		await page.waitForTimeout(200)
		await noOverlap(page, DEMO.home, 'en-375-page')
		await shoot(page, 'en-375-page-count-liner')
		await page.setViewportSize(DESKTOP)
		await openAlbum(page)
		const b = (await block(page, home))!
		assert.equal(b.tag, 'Changed')
		assert.match(b.lines[0]!, /^The page it opens changed · \d{1,2} [A-Z][a-z]{2}$/)
		await centre(page, home)
		await shoot(page, 'en-1366-album-changed')
		await page.setViewportSize(PHONE)
		await page.waitForTimeout(400)
		await centre(page, home)
		await shoot(page, 'en-375-album-changed')
		await page.setViewportSize(DESKTOP)
		await closeAlbum(page)
		checkLog(r, 'fill-en')
		await checkPageSide(r.page, 'fill-en')
		assert.deepEqual(r.errors, [])
		assert.deepEqual(r.l.reached, [])
	} finally {
		await r.l.close()
	}
})

// ---- 3. Pacing and the site's rules ----

test('3a. 304 -> no parse, validators sent; two tabs -> one run; a redirect is never followed; a 403 stops the run and blocks it', { timeout: 300_000 }, async () => {
	const r = await launch(gw, { nov12: true })
	const { page, a } = r
	try {
		await open(page, '/ar/home', '?aixc-debug')
		await ready(page)
		await fill(page)
		await settle(a)
		assert.ok((await page.evaluate(() => (window as any).__parses)) > 0, 'the fill run parsed what it fetched (the probe works)')
		await checkPageSide(page, 'fill-3a')

		// A visit: every page unchanged, so each answers 304 to our own validators, and nothing is parsed.
		let t = Date.now()
		await reload(page)
		await settle(a)
		const visit = a.since(t)
		const pages = visit.filter((x) => x.path !== '/robots.txt')
		assert.deepEqual(visit.map((x) => x.path).filter((p) => p === '/robots.txt'), ['/robots.txt'], 'robots.txt once')
		assert.ok(pages.length >= 4, `the watched pages were checked: ${pages.map((x) => x.path)}`)
		for (const x of pages) {
			assert.ok(x.ifNoneMatch, `${x.path}: If-None-Match sent`)
			assert.equal(x.status, 304, `${x.path}: 304`)
		}
		assert.equal(await page.evaluate(() => (window as any).__parses), 0, 'a 304 is not parsed')
		facts['3a.otherParsesOnThatLoad'] = await page.evaluate(() => (window as any).__allParses)
		const calls = await checkPageSide(page, 'visit-304')
		for (const c of calls.filter((c) => c.path !== '/robots.txt')) assert.equal(c.cache, 'no-store', 'no-store, so the 304 reaches the code')
		facts['3a.visit304'] = pages.map((x) => `${x.path} ${x.status}`)
		await openAlbum(page)
		for (const s of await stickers(page)) await lineIs(page, s.key, /^بنتابعها · مفيش تغيير من 23 أكتوبر$/)
		await closeAlbum(page)

		// Two tabs at once: one run between them (Web Locks), each page fetched once.
		t = Date.now()
		const second = await r.l.b.context.newPage()
		await Promise.all([page.reload({ waitUntil: 'load' }), second.goto(`${V}/ar/services?aixc-debug`, { waitUntil: 'load' })])
		await Promise.all([ready(page), ready(second)])
		await settle(a, 4000)
		const both = a.since(t)
		const per = new Map<string, number>()
		for (const x of both) per.set(x.path, (per.get(x.path) ?? 0) + 1)
		assert.ok(both.length >= 5, `a run happened (${both.map((x) => x.path)})`)
		for (const [p, n] of per) assert.equal(n, 1, `two tabs, one run: ${p} fetched ${n} times`)
		facts['3a.twoTabs'] = Object.fromEntries(per)
		await second.close()

		// A redirect: never followed; the page the card opens is gone for the watch.
		const cash = await keyOf(page, DEMO.cash)
		a.status.set('/ar/vodafone-cash', { status: 302, location: '/ar/vodafone-red1' })
		t = Date.now()
		await reload(page)
		await countIs(page, '1')
		await settle(a)
		const redirected = a.since(t)
		assert.ok(redirected.some((x) => x.path === '/ar/vodafone-cash' && x.status === 302))
		assert.ok(!redirected.some((x) => x.path === '/ar/vodafone-red1'), 'the redirect\'s target was never asked for')
		await openAlbum(page)
		await lineIs(page, cash, /^صفحتها اتشالت · /)
		await closeAlbum(page)
		facts['3a.redirect'] = redirected.map((x) => `${x.path} ${x.status}`)
		await checkPageSide(page, 'redirect')
		a.status.delete('/ar/vodafone-cash')

		// A 403: the run stops at once, nothing more is fetched, and the watch waits a day.
		for (const p of ['/ar/home', '/ar/services', '/ar/mobile-internet-bundles', '/ar/vodafone-cash']) a.status.set(p, { status: 403 })
		t = Date.now()
		await reload(page)
		await settle(a, 4000)
		const blocked = a.since(t)
		assert.equal(blocked[0]?.path, '/robots.txt')
		assert.equal(blocked.length, 2, `robots.txt, then one page that answered 403, then nothing (${blocked.map((x) => `${x.path} ${x.status}`)})`)
		assert.equal(blocked[1]!.status, 403)
		const meta = await runMeta(page)
		assert.ok(meta.blockedUntil > Date.now() + 23 * 3600_000, `blockedUntil a day ahead (${meta.blockedUntil})`)
		facts['3a.blocked'] = { requests: blocked.map((x) => `${x.path} ${x.status}`), blockedForH: Math.round((meta.blockedUntil - Date.now()) / 360_000) / 10 }
		t = Date.now()
		await reload(page)
		await page.waitForTimeout(5000)
		assert.deepEqual(a.since(t).map((x) => x.path), [], 'blocked: the next visit fetches nothing')
		checkLog(r, 'pacing')
		await checkPageSide(r.page, 'pacing')
		assert.deepEqual(r.errors, [])
		assert.deepEqual(r.l.reached, [], 'nothing left the machine')
		facts['3a.refusedByOfflineReplay'] = r.l.refused.filter((x) => new URL(x.url).origin === V && x.type === 'fetch').length
	} finally {
		await r.l.close()
	}
})

test('3b. a second load within 30 min fetches nothing (the site config\'s minIntervalMin)', { timeout: 180_000 }, async () => {
	const r = await launch(gwSlow, { nov12: true })
	const { page, a } = r
	try {
		await open(page, '/ar/home', '?aixc-debug')
		await ready(page)
		await fill(page)
		await settle(a)
		assert.ok(a.log.length >= 5, 'the fill checked at once (a person pressed)')
		const t = Date.now()
		await reload(page)
		await page.waitForTimeout(6000)
		assert.deepEqual(a.since(t).map((x) => x.path), [], 'within 30 min: no fetch')
		const meta = await runMeta(page)
		assert.ok(Date.now() - meta.lastRunAt < 30 * 60_000)
		checkLog(r, 'throttle')
		await checkPageSide(r.page, 'throttle')
		assert.deepEqual(r.l.reached, [])
	} finally {
		await r.l.close()
	}
})

test('3c. at most 12 pages a visit, ≥ 1 s apart, signed out', { timeout: 240_000 }, async () => {
	const r = await launch(gw, { nov12: true })
	const { page, a } = r
	try {
		await open(page, '/ar/home', '?aixc-debug')
		await ready(page)
		await fill(page)
		await settle(a)
		// 13 more stickers, each opening its own page (/ar/watch-cap-NN, answered 404 by the route), watched as
		// the sticker action leaves them: a card target on /ar/home and a page target, no baseline yet. With the
		// demo's four pages that is 17 pages due.
		const n = await page.evaluate(async () => {
			const s = (window as any).__aixc.demos.pocket.store
			const base = s.all().find((x: any) => x.id === 'mobile-internet-bundles')
			const made: string[] = []
			for (let i = 1; i <= 13; i++) {
				const nn = String(i).padStart(2, '0')
				const key = `s-e2e-cap-${nn}`
				await s.put({ ...base, key, id: `e2e-cap-${nn}`, cta: { ...base.cta, href: `${location.origin}/ar/watch-cap-${nn}` } })
				made.push(key)
			}
			const db: IDBDatabase = await new Promise((res, rej) => {
				const q = indexedDB.open('aixc-watch-v1')
				q.onsuccess = () => res(q.result)
				q.onerror = () => rej(q.error)
			})
			const tx = db.transaction(['watches', 'targets', 'pages'], 'readwrite')
			const home = `${location.origin}/ar/home`
			const homeRow: any = await new Promise((res) => {
				const q = tx.objectStore('pages').get(home)
				q.onsuccess = () => res(q.result)
			})
			for (const key of made) {
				const url = `${location.origin}/ar/watch-cap-${key.slice(-2)}`
				const card = `card ${key} ${home}`
				tx.objectStore('targets').put({ id: card, kind: 'card', url: home, stickerKeys: [key], hash: null, href: null, status: 'ok' })
				tx.objectStore('targets').put({ id: `page ${url}`, kind: 'page', url, stickerKeys: [key], hash: null, linksHash: null, status: 'ok' })
				tx.objectStore('pages').put({ url, targetIds: [`page ${url}`], lastCheckedAt: null, status: null })
				homeRow.targetIds.push(card)
				tx.objectStore('watches').put({ key, lang: 'ar', createdAt: Date.now(), from: 'sticker', cardTargetId: card, pageTargetId: `page ${url}`, pageNote: null, baselineAt: null })
			}
			tx.objectStore('pages').put(homeRow)
			await new Promise((res, rej) => {
				tx.oncomplete = () => res(null)
				tx.onerror = () => rej(tx.error)
			})
			db.close()
			return (await new Promise<number>((res) => {
				const q = indexedDB.open('aixc-watch-v1')
				q.onsuccess = () => {
					const c = q.result.transaction('pages').objectStore('pages').count()
					c.onsuccess = () => res((q.result.close(), c.result))
				}
			})) as number
		})
		assert.equal(n, 17, '17 pages with targets')
		const t = Date.now()
		await reload(page)
		await settle(a, 4000, 60_000)
		const visit = a.since(t)
		const pages = visit.filter((x) => x.path !== '/robots.txt')
		assert.equal(pages.length, 12, `at most 12 pages a visit (${pages.length}: ${pages.map((x) => x.path)})`)
		assert.equal(new Set(pages.map((x) => x.path)).size, 12, 'each once')
		facts['3c.maxPagesPerVisit'] = pages.length
		facts['3c.duePages'] = n
		await checkPageSide(page, 'cap')
		checkLog(r, 'cap')
		assert.deepEqual(r.l.reached, [])
	} finally {
		await r.l.close()
	}
})

// ---- 4. The sticker action and the guide's chip ----

/** The KB's destinations on a page, as the planner takes them: their targets. */
function destinationsOn(pathname: string) {
	const m = JSON.parse(fs.readFileSync(path.join(ROOT, 'config/kb/vodafone-eg.manifest.json'), 'utf8'))
	const want = `${V}${pathname}`
	const page = m.pages.find((p: any) => Object.values(p.variants ?? {}).some((v: any) => [].concat(v).some((x: any) => x?.url === want)))
	if (!page) return { pageId: null, targets: [] as { id: string; target: any; label: string }[] }
	return {
		pageId: page.id as string,
		targets: m.destinations.filter((d: any) => d.pageId === page.id && d.target).map((d: any) => ({ id: d.id, target: d.target, label: d.label?.ar ?? d.title?.ar ?? d.name?.ar ?? d.id })),
	}
}

test('4. "Tell me when this changes"; the guide\'s chip on a card pockets and watches it, no POST /v1/watch; on something else watchFailed, no POST, no permission asked', { timeout: 240_000 }, async () => {
	const r = await launch(gw, { nov12: true })
	const { page, a } = r
	const posts: string[] = []
	r.l.b.context.on('request', (q) => {
		if (q.method() === 'POST' && /\/v1\/watch(\?|$)/.test(new URL(q.url()).pathname)) posts.push(q.url())
	})
	try {
		// The sticker action.
		await open(page, '/ar/services', '?aixc-debug')
		await ready(page)
		const card = await page.evaluate(() => {
			for (const section of (window as any).__aixc.model?.sections ?? [])
				for (const item of section.items) {
					const href = item.cta?.href
					if (!href) continue
					const u = new URL(href, location.href)
					if (u.origin === location.origin && u.pathname.startsWith('/ar/') && document.querySelector(`.pocket-chips .pocket-cta[data-pocket-for="${CSS.escape(item.id)}"]`)) return item.id as string
				}
			return null
		})
		assert.ok(card, 'a card with a chip on /ar/services')
		await page.evaluate((id) => document.querySelector<HTMLElement>(`.pocket-chips .pocket-cta[data-pocket-for="${CSS.escape(id)}"]`)!.click(), card)
		await page.waitForFunction(() => (window as any).__aixc.demos.pocket.state.ids.length === 1, null, { timeout: 10_000 })
		await page.waitForFunction(() => !(window as any).__aixc.demos.pocket.state.busy, null, { timeout: 10_000 })
		const key = (await stickers(page))[0]!.key
		await openAlbum(page)
		assert.deepEqual((await block(page, key))!.buttons, ['قولّي لما تتغيّر'])
		await pressIn(page, key, 'قولّي لما تتغيّر')
		await lineIs(page, key, /^بنتابعها · مفيش تغيير من /)
		assert.deepEqual((await block(page, key))!.buttons, ['وقّف المتابعة'])
		assert.deepEqual(await watchKeys(page), [key])
		await closeAlbum(page)
		await settle(a)

		// The guide's chip, as the planner makes the plan: spotlight, then offerWatch with the destination's target.
		await open(page, '/ar/home', '?aixc-debug')
		await ready(page)
		await page.waitForFunction(() => (window as any).voiceGuide?.executor && (window as any).voiceGuide?.session, null, { timeout: 20_000 })
		const { pageId, targets } = destinationsOn('/ar/home')
		assert.ok(pageId, 'the KB knows /ar/home')
		const kinds = await page.evaluate((targets) => {
			const locate = (t: any) => {
				let first: Element | null = null
				for (const sel of t.css) {
					let found: Element[] = []
					try {
						found = [...document.querySelectorAll(sel)]
					} catch {
						continue
					}
					const shown = found.find((el) => el.getClientRects().length)
					if (shown) return shown
					first ??= found[0] ?? null
				}
				return first
			}
			return targets.map((d: any) => {
				const el = locate(d.target)
				return { id: d.id, found: !!el, card: (el?.closest('[data-aixc-item]') as HTMLElement | null)?.dataset.aixcItem ?? null }
			})
		}, targets)
		facts['4.homeDestinations'] = kinds
		const onCard = targets.find((d: { id: string }) => kinds.find((k: any) => k.id === d.id)?.card)
		const notCard = targets.find((d: { id: string }) => {
			const k = kinds.find((k: any) => k.id === d.id)
			return k?.found && !k.card
		})
		assert.ok(onCard, `a KB destination on /ar/home that is a card: ${JSON.stringify(kinds)}`)
		assert.ok(notCard, 'a KB destination on /ar/home that is not a card')
		const cardId = kinds.find((k: any) => k.id === onCard.id)!.card as string
		const before = (await stickers(page)).length
		const runPlan = (d: { target: any; label: string }) =>
			page.evaluate(
				({ d, pageId, url }) => {
					;(window as any).__spoken.length = 0
					return (window as any).voiceGuide.executor.run({ v: 1, turnId: `turn_e2e_${Date.now()}`, lang: 'ar', steps: [{ op: 'offerWatch', target: d.target, label: d.label, url, pageId }], meta: { intent: 'watch', route: 'replay', confidence: 1 } })
				},
				{ d, pageId, url: `${V}/ar/home` },
			)
		const pressChip = () =>
			page.waitForFunction(() => {
				const chip = document.querySelector('vg-guide')?.shadowRoot?.querySelector<HTMLElement>('.chips .chip')
				if (!chip) return false
				chip.click()
				return true
			}, null, { timeout: 10_000 })
		const said = (re: RegExp) => page.waitForFunction((src) => ((window as any).__spoken || []).some((s: any) => new RegExp(src).test(s.text)), re.source, { timeout: 15_000 })

		await runPlan(onCard)
		await pressChip()
		await said(/^تمام، هعرفك لما/)
		const after = await stickers(page)
		assert.equal(after.length, before + 1, 'the card was pocketed')
		const guideKey = after.find((s) => s.id === cardId)?.key
		assert.ok(guideKey, `the sticker of ${cardId}`)
		assert.ok((await watchKeys(page)).includes(guideKey!), 'and watched')
		assert.equal((await rows(page, 'watches')).find((w) => w.key === guideKey).from, 'guide')
		assert.deepEqual(posts, [], 'no POST /v1/watch reached the gateway')
		assert.equal(await page.evaluate(() => (window as any).__permissionAsks), 0)

		await runPlan(notCard!)
		await pressChip()
		await said(/^مقدرتش أراقب الجزء ده\.$/)
		assert.deepEqual(posts, [], 'still no POST /v1/watch')
		assert.equal(await page.evaluate(() => (window as any).__permissionAsks), 0, 'no notification permission asked')
		assert.equal((await stickers(page)).length, before + 1, 'nothing more pocketed')
		facts['4.guide'] = { card: onCard.id, cardId, notCard: notCard!.id, posts: posts.length }
		checkLog(r, 'guide')
		await checkPageSide(r.page, 'guide')
		assert.deepEqual(r.errors, [])
		assert.deepEqual(r.l.reached, [])
	} finally {
		await r.l.close()
	}
})

// ---- 5. Lifecycle ----

test('5. removing a sticker and "Empty pocket" remove its watch; reset() deletes aixc-watch-v1 and leaves the stickers', { timeout: 180_000 }, async () => {
	const r = await launch(gw, { nov12: true })
	const { page } = r
	try {
		await open(page, '/ar/home', '?aixc-debug')
		await ready(page)
		await fill(page)
		const home = await keyOf(page, DEMO.home)
		const cash = await keyOf(page, DEMO.cash)
		await openAlbum(page)
		await page.evaluate((key) => document.querySelector<HTMLElement>(`.pocket-grid__item[data-pocket-id="${CSS.escape(key)}"] .pocket-sticker__remove`)!.click(), home)
		await page.waitForFunction(async (home) => {
			const r = indexedDB.open('aixc-watch-v1')
			const db: IDBDatabase = await new Promise((res) => (r.onsuccess = () => res(r.result)))
			const keys: unknown[] = await new Promise((res) => {
				const q = db.transaction('watches').objectStore('watches').getAllKeys()
				q.onsuccess = () => res(q.result)
			})
			db.close()
			return !keys.includes(home)
		}, home, { timeout: 10_000 })
		assert.deepEqual(await watchKeys(page), [cash], 'the removed sticker\'s watch went')
		const targets = await rows(page, 'targets')
		assert.ok(targets.every((t) => !t.stickerKeys.includes(home)), 'no target keeps it')
		// Empty pocket.
		await page.evaluate(() => document.querySelector<HTMLElement>('.pocket-clear')!.click())
		await page.waitForFunction(() => (window as any).__aixc.demos.pocket.store.all().length === 0, null, { timeout: 10_000 })
		await page.waitForFunction(async () => {
			const r = indexedDB.open('aixc-watch-v1')
			const db: IDBDatabase = await new Promise((res) => (r.onsuccess = () => res(r.result)))
			const n: number = await new Promise((res) => {
				const q = db.transaction('watches').objectStore('watches').count()
				q.onsuccess = () => res(q.result)
			})
			db.close()
			return n === 0
		}, null, { timeout: 10_000 })
		assert.deepEqual(await rows(page, 'targets'), [], 'no target left')
		await closeAlbum(page).catch(() => {})

		// Reset: the database goes, the stickers stay.
		await fill(page)
		assert.equal((await stickers(page)).length, 2)
		assert.equal((await watchKeys(page)).length, 2)
		const names = () => page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name))
		assert.ok((await names()).includes('aixc-watch-v1'))
		const res = await page.evaluate(() => (window as any).__aixcWatch.reset())
		assert.deepEqual(res, { ok: true })
		const left = await names()
		facts['5.databasesAfterReset'] = left
		// The watch's store may reopen an empty database at once (its next read); either way no watch is kept.
		if (left.includes('aixc-watch-v1')) for (const s of ['watches', 'targets', 'pages', 'changes', 'meta'] as const) assert.deepEqual(await rows(page, s), [], `after reset: ${s} empty`)
		assert.equal((await stickers(page)).length, 2, "the Pocket's stickers stay")
		assert.ok((await names()).includes('aixc-v1'), "the Pocket's own database stays")
		assert.deepEqual(r.errors, [])
		assert.deepEqual(r.l.reached, [])
	} finally {
		await r.l.close()
	}
})

// ---- 6. Isolation ----

const FAIL_AT = `Object.defineProperty(window, '__AIXC_TEST__', { configurable: true, get: () => { try { const f = sessionStorage.getItem('aixc-test-failAt'); return f ? { failAt: f } : undefined } catch { return undefined } } })`

test('6. a throw at each checkpoint (watch-start, watch-check, watch-ui) -> no watch lines, notes or count; the Pocket still pockets and opens', { timeout: 300_000 }, async () => {
	const r = await launch(gw, { nov12: true, initScripts: [FAIL_AT] })
	const { page, a } = r
	const warns: string[] = []
	page.on('console', (m) => m.text().startsWith('[AIXC]') && warns.push(m.text()))
	try {
		await open(page, '/ar/home', '?aixc-debug')
		await ready(page)
		await fill(page)
		await settle(a)
		// A change waiting, so every piece of the watch would show.
		a.edits.set('/ar/mobile-internet-bundles', [editBundlePrice])
		const out: Record<string, unknown> = {}
		for (const step of ['watch-start', 'watch-check', 'watch-ui']) {
			warns.length = 0
			await page.evaluate((step) => sessionStorage.setItem('aixc-test-failAt', step), step)
			await page.reload({ waitUntil: 'load' })
			await page.waitForFunction(() => (window as any).__aixc?.demos?.pocket, null, { timeout: 15_000 })
			await page.waitForTimeout(5000)
			const s = await page.evaluate(() => ({
				state: (window as any).__aixc.state,
				watch: !!(window as any).__aixcWatch,
				lines: document.querySelectorAll('.aixc-watch, .aixc-watch-liner').length,
				count: !!document.querySelector('.pocket-peek__changed:not([hidden])'),
				label: document.querySelector('.pocket-peek')?.getAttribute('aria-label') ?? '',
			}))
			assert.equal(s.state, 'ready', `${step}: the layer carries on`)
			assert.equal(s.watch, false, `${step}: no window.__aixcWatch`)
			assert.equal(s.lines, 0, `${step}: no watch lines or liner notes`)
			assert.equal(s.count, false, `${step}: no count`)
			assert.doesNotMatch(s.label, /اتغيّرت/, `${step}: the button's label is the Pocket's own`)
			assert.ok(warns.some((w) => /page watch stopped/.test(w)), `${step}: said in the console (${warns.join(' | ')})`)
			// The Pocket still pockets (a card's chip) and opens.
			const before = await page.evaluate(() => (window as any).__aixc.demos.pocket.state.ids.length)
			const pocketed = await page.evaluate(() => {
				const ids = new Set((window as any).__aixc.demos.pocket.state.ids.map((k: string) => (window as any).__aixc.demos.pocket.store.get(k)?.id))
				const chip = [...document.querySelectorAll<HTMLElement>('.pocket-chips .pocket-cta')].find((c) => !ids.has(c.dataset.pocketFor))
				chip?.click()
				return chip?.dataset.pocketFor ?? null
			})
			assert.ok(pocketed, `${step}: a card to pocket`)
			await page.waitForFunction((n) => (window as any).__aixc.demos.pocket.state.ids.length === n + 1, before, { timeout: 10_000 })
			await page.waitForFunction(() => !(window as any).__aixc.demos.pocket.state.busy, null, { timeout: 10_000 })
			await openAlbum(page)
			assert.ok((await page.evaluate(() => document.querySelectorAll('.pocket-grid__item').length)) >= 3, `${step}: the album shows its stickers`)
			assert.equal(await page.evaluate(() => document.querySelectorAll('.aixc-watch').length), 0)
			await closeAlbum(page)
			out[step] = s
		}
		await page.evaluate(() => sessionStorage.removeItem('aixc-test-failAt'))
		facts['6.isolation'] = out
		assert.deepEqual(r.errors, [], 'no error reached the page')
		assert.deepEqual(r.l.reached, [])
	} finally {
		await r.l.close()
	}
})
