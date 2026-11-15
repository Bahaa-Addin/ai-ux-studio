/**
 * The demo kit's `seed()` and `reset()` (ADR-0050 §6; live plan S15), in a real Chromium with the real
 * controller, real IndexedDB and a stand-in guide; the recorder is a stand-in that records nothing. A seed
 * needs all four: consent granted, a real press (a click whose handler calls it), the session's `demoKit`
 * and a page the trail records; each missing one refuses with its reason and changes nothing. A seeded
 * journey has new ids, ends now, replaces the current one, survives the next index write and a reload,
 * reaches the host and the other tab, shows markup as text and leaves consent alone; "Clear" removes it.
 * `reset()` removes every journey and both copies of the consent, stops the recorder and shows the offer
 * again, in this tab and the other one.
 */
import assert from 'node:assert/strict'
import path from 'node:path'
import { after, before, test } from 'node:test'

import * as esbuild from 'esbuild'
import { type Browser, type BrowserContext, chromium, type Page } from 'playwright'

import { ROOT } from '#shared/config.ts'

const ORIGIN = 'http://localhost:4469'
const MIN = 60_000
const MARKUP = '<img src=x onerror="window.__pwned=1">Seeded bundles'
let browser: Browser
let bundle = ''

before(async () => {
	const out = await esbuild.build({
		stdin: { contents: `import { TrailController } from './controller.ts'; window.__TrailController = TrailController`, resolveDir: path.join(ROOT, 'packages/sdk/src/trail'), loader: 'ts' },
		bundle: true,
		format: 'iife',
		write: false,
		target: 'es2022',
		logLevel: 'error',
	})
	bundle = out.outputFiles[0].text
	browser = await chromium.launch()
})
after(async () => {
	await browser?.close()
})

/* eslint-disable @typescript-eslint/no-explicit-any */
type Opts = { consent?: 'granted' | 'paused' | null; demoKit?: boolean; optedOut?: boolean }

async function openPage(ctx: BrowserContext, o: Opts = {}): Promise<Page> {
	const page = await ctx.newPage()
	await page.route((url) => url.origin !== ORIGIN, (route) => route.abort())
	await page.route(`${ORIGIN}/**`, (route) =>
		route.fulfill({
			contentType: 'text/html',
			body: `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Trail seed</title>${o.optedOut ? '<meta name="vg-trail" content="off">' : ''}</head><body><main><h1>A page</h1></main><button id="seed" style="position:fixed;left:8px;bottom:8px">Load the sample journey</button></body></html>`,
		}),
	)
	await page.goto(`${ORIGIN}/en/one`)
	if (o.consent !== null) await page.evaluate((c) => localStorage.setItem('vg-trail:k:consent', JSON.stringify({ v: 1, state: c, at: 1, retentionHours: 24 })), o.consent ?? 'granted')
	await boot(page, o)
	return page
}

/** Starts the trail on the page as a page load does (again after a reload). */
async function boot(page: Page, o: Opts = {}): Promise<void> {
	await page.addScriptTag({ content: bundle })
	await page.evaluate(async ({ demoKit }) => {
		const w = window as any
		w.__starts = 0
		w.__stops = 0
		w.__vgTrailRecord = { startRecording: () => (w.__starts++, { snapshot() {}, stop: () => w.__stops++ }) }
		const holder = document.createElement('div')
		document.body.append(holder)
		const root = holder.attachShadow({ mode: 'open' })
		const g = {
			o: { gateway: 'http://localhost:4469', siteKey: 'k' },
			api: { get: async () => null, post: async () => ({}) },
			session: { site: { id: 't', trail: {} }, page: { kbVersion: null, pageId: null } },
			lang: 'en',
			ui: { root, open() {} },
			speech: { canSpeak: false, muted: true },
			executor: { running: false },
			busy: false,
			request: async () => {},
		}
		const c = new w.__TrailController(g, { enabled: true, retentionHours: 24, excludePaths: [], privateSelectors: [], aggregation: false, demoKit })
		w.__c = c
		w.__root = root
		const ready = new Promise((done) => addEventListener('vg:trail-ready', (e) => done((e as CustomEvent).detail), { once: true }))
		await c.start()
		w.__api = await ready
		// The demo kit's button: a press whose handler calls seed.
		document.querySelector<HTMLButtonElement>('#seed')!.onclick = () => (w.__res = w.__api.seed(w.__journey))
	}, { demoKit: o.demoKit ?? true })
}

/** A sample journey as the trail stores it, from two days ago, 12 minutes long. */
function journey(at: number, ids = { session: 'trs_in1', steps: ['stp_in1', 'stp_in2', 'stp_in3'] }): any {
	const T = at - 2 * 24 * 60 * MIN
	const step = (i: number, title: string, o: Record<string, unknown> = {}) => ({ id: ids.steps[i], sessionId: ids.session, type: 'page', pageId: 'web.x', canonicalPath: `${ORIGIN}/en/sample-${i}`, title: { en: title }, enteredAt: T + i * 5 * MIN, leftAt: T + i * 5 * MIN + 2 * MIN, durationMs: 90_000, navigationCause: { kind: 'direct' }, topDestinationIds: [], explored: [], replay: 'ok', ...o })
	return {
		v: 1,
		session: {
			schema: 'vg-trail/v1',
			id: ids.session,
			siteId: 'other',
			locale: 'en',
			startedAt: T,
			updatedAt: T,
			expiresAt: T,
			recordingState: 'stopped',
			bytes: 0,
			steps: [
				step(0, 'Seeded home', { asked: [{ id: 'ask_in1', at: T + MIN, lang: 'en', origin: 'typed', destinationId: 'd.flex', intent: 'info', route: 'replay', label: 'Flex' }] }),
				step(1, MARKUP, { explored: [{ destinationId: 'd.flex', pageId: 'web.x', kind: 'card', title: { en: MARKUP }, context: { en: '<b>bold</b>' }, reason: 'explored', questions: { en: [{ id: 'q1', text: '<i>Ask</i>', intent: 'info' }] } }] }),
				step(2, 'Seeded cash'),
			],
		},
		chunks: { [ids.steps[0]]: JSON.stringify([{ type: 4, timestamp: T + 1000, data: { href: `${ORIGIN}/en/sample-0`, width: 800, height: 600 } }, { type: 3, timestamp: T + 2000, data: { source: 1, positions: [] } }]) },
	}
}

const snap = (page: Page) => page.evaluate(() => (window as any).__api.snapshot())
const titles = async (page: Page) => (await snap(page)).steps.map((s: any) => s.title.en)
/** A press on the demo kit's button, and what seed answered. */
async function pressSeed(page: Page, j?: unknown): Promise<any> {
	await page.evaluate((j) => ((window as any).__journey = j ?? (window as any).__journey), j ?? null)
	await page.click('#seed')
	return page.evaluate(() => (window as any).__res)
}
/** Every database and store, localStorage and sessionStorage, as text. */
const kept = (page: Page) =>
	page.evaluate(async () => {
		const dbs: Record<string, unknown> = {}
		for (const { name } of await indexedDB.databases()) {
			const db: IDBDatabase = await new Promise((ok, no) => {
				const r = indexedDB.open(name!)
				r.onsuccess = () => ok(r.result)
				r.onerror = () => no(r.error)
			})
			for (const store of Array.from(db.objectStoreNames)) dbs[`${name}/${store}`] = await new Promise((ok) => {
				const r = db.transaction(store, 'readonly').objectStore(store).getAll()
				r.onsuccess = () => ok(r.result)
			})
			db.close()
		}
		return JSON.stringify({ dbs, local: { ...localStorage }, session: { ...sessionStorage } })
	})
const sessions = (page: Page) => page.evaluate(async () => ((await (window as any).__c.store.sessions()) as any[]).map((s) => s.id).sort())
const consentCopy = (page: Page) =>
	page.evaluate(async () => {
		if (!(await indexedDB.databases()).some((d) => d.name === 'vg-trail-consent')) return null
		const db: IDBDatabase = await new Promise((ok) => {
			const r = indexedDB.open('vg-trail-consent')
			r.onsuccess = () => ok(r.result)
		})
		const v = await new Promise((ok) => {
			const r = db.transaction('c').objectStore('c').get('k')
			r.onsuccess = () => ok(r.result ?? null)
		})
		db.close()
		return v
	})
const recording = (page: Page) => page.waitForFunction(() => (window as any).__api.snapshot().steps.length >= 1 && (window as any).__api.snapshot().rec === 'recording', null, { timeout: 5_000 })

/** A refused seed: the reason, nothing stored, the current journey untouched. */
async function refused(page: Page, why: string, call: () => Promise<any>): Promise<void> {
	const before = { steps: (await snap(page)).steps, kept: await kept(page) }
	const r = await call()
	assert.deepEqual(r, { ok: false, reason: why })
	await page.waitForTimeout(150)
	assert.deepEqual((await snap(page)).steps, before.steps, `${why}: the current journey is untouched`)
	const now = await kept(page)
	assert.ok(!/Seeded|stp_in|trs_in/.test(now), `${why}: nothing of the sample is stored`)
	assert.equal(JSON.parse(now).local['vg-trail:k:consent'], JSON.parse(before.kept).local['vg-trail:k:consent'], `${why}: consent unchanged`)
}

test('seed is refused without consent granted: paused, and unset (S15)', async () => {
	const ctx = await browser.newContext()
	try {
		const paused = await openPage(ctx, { consent: 'paused' })
		await refused(paused, 'no-consent', () => pressSeed(paused, journey(Date.now())))
		await paused.close()
		const ctx2 = await browser.newContext()
		const unset = await openPage(ctx2, { consent: null })
		assert.deepEqual(await pressSeed(unset, journey(Date.now())), { ok: false, reason: 'no-consent' })
		assert.equal((await snap(unset)).consent, 'unset')
		assert.ok(!(await kept(unset)).includes('Seeded'))
		await ctx2.close()
	} finally {
		await ctx.close()
	}
})

test('seed is refused without a press: a page script calling it, and a browser without userActivation (S15)', async () => {
	const ctx = await browser.newContext()
	try {
		const page = await openPage(ctx)
		await recording(page)
		// A page script with no press before it. Playwright's evaluate counts as a press for about five seconds
		// (Chromium's transient activation), so the script calls seed from a timer after that, as a page's own would.
		await refused(page, 'no-press', async () => {
			await page.evaluate((j) => {
				const w = window as any
				setTimeout(() => {
					w.__active = navigator.userActivation.isActive
					w.__late = w.__api.seed(j)
				}, 6_000)
			}, journey(Date.now()))
			await page.waitForTimeout(6_500)
			assert.equal(await page.evaluate(() => (window as any).__active), false, 'no press was active when it was called')
			return page.evaluate(() => (window as any).__late)
		})
		// Where userActivation is not supported, a press cannot be told apart: refused.
		await page.evaluate(() => Object.defineProperty(navigator, 'userActivation', { value: undefined, configurable: true }))
		await refused(page, 'no-press', () => pressSeed(page, journey(Date.now())))
	} finally {
		await ctx.close()
	}
})

test('seed and reset are refused when the session is not a demo (demoKit false) (S15)', async () => {
	const ctx = await browser.newContext()
	try {
		const page = await openPage(ctx, { demoKit: false })
		await recording(page)
		await refused(page, 'not-a-demo', () => pressSeed(page, journey(Date.now())))
		const before = await kept(page)
		assert.deepEqual(await page.evaluate(() => (window as any).__api.reset()), { ok: false, reason: 'not-a-demo' })
		assert.equal((await snap(page)).consent, 'granted', 'reset refused: consent stays')
		assert.equal(JSON.parse(await kept(page)).local['vg-trail:k:consent'], JSON.parse(before).local['vg-trail:k:consent'])
		assert.ok(((await consentCopy(page)) as any)?.state === undefined || ((await consentCopy(page)) as any).state === 'granted')
	} finally {
		await ctx.close()
	}
})

test('seed is refused on a page the trail does not record (S15)', async () => {
	const ctx = await browser.newContext()
	try {
		const page = await openPage(ctx, { optedOut: true })
		await page.waitForTimeout(300)
		await refused(page, 'not-here', () => pressSeed(page, journey(Date.now())))
	} finally {
		await ctx.close()
	}
})

test('a malformed, oversize or hostile journey is refused after a press, and nothing is stored (S15)', async () => {
	const ctx = await browser.newContext()
	try {
		const page = await openPage(ctx)
		await recording(page)
		const j = journey(Date.now())
		await refused(page, 'version', () => pressSeed(page, { ...j, v: 2 }))
		await refused(page, 'invalid', () => pressSeed(page, { ...j, session: { ...j.session, steps: [{ ...j.session.steps[0], html: '<b>x</b>' }] } }))
		await refused(page, 'too-big', () => pressSeed(page, { ...j, session: { ...j.session, steps: Array.from({ length: 21 }, (_, i) => ({ ...j.session.steps[0], id: `s${i}`, asked: [], enteredAt: j.session.steps[0].enteredAt + i })) } }))
		const hostile = await page.evaluate((text) => {
			const w = window as any
			w.__journey = JSON.parse(text)
			return Object.keys(w.__journey.session).includes('__proto__')
		}, JSON.stringify(j).replace('"locale":"en"', '"locale":"en","__proto__":{"polluted":"yes"}'))
		assert.equal(hostile, true, 'the hostile key is an own key')
		await page.click('#seed')
		assert.deepEqual(await page.evaluate(() => (window as any).__res), { ok: false, reason: 'invalid' })
		assert.equal(await page.evaluate(() => ({} as any).polluted), undefined)
	} finally {
		await ctx.close()
	}
})

test('a seeded journey: new ids, ends now, replaces the current one, reaches the host, survives the next index write and a reload; markup is text; consent unchanged; Clear removes it (S15)', async () => {
	const ctx = await browser.newContext()
	try {
		const page = await openPage(ctx)
		await recording(page)
		const realOld = (await sessions(page))[0]
		await page.evaluate(() => {
			const w = window as any
			w.__seen = []
			w.__api.subscribe((s: any) => w.__seen.push(s.steps.map((x: any) => x.title.en)))
		})
		const consentBefore = { local: JSON.parse(await kept(page)).local['vg-trail:k:consent'], copy: await consentCopy(page) }
		assert.deepEqual(await pressSeed(page, journey(Date.now())), { ok: true })
		const now = Date.now()
		const s = await snap(page)
		assert.deepEqual(s.steps.map((x: any) => x.title.en), ['Seeded home', MARKUP, 'Seeded cash', 'Trail seed'], 'the sample, then the page the person is on')
		assert.equal(s.currentStepId, s.steps[3].id, 'recording continues as a new step after the sample')
		assert.equal(s.rec, 'recording')
		assert.equal(s.consent, 'granted')
		const seeded = s.steps.slice(0, 3)
		assert.ok(Math.abs(now - seeded[2].leftAt) < 1_000, 'the sample ends now')
		assert.ok(seeded[2].leftAt - seeded[0].enteredAt < 30 * MIN, 'within the journey limit')
		assert.ok(seeded.every((x: any, i: number) => !i || x.enteredAt > seeded[i - 1].enteredAt), 'order preserved')
		assert.deepEqual(s.asked.map((q: any) => [q.label, q.stepId]), [['Flex', seeded[0].id]])
		assert.ok(await page.evaluate(() => (window as any).__seen.some((t: string[]) => t.includes('Seeded cash'))), 'the host was told')
		const all = await kept(page)
		for (const id of ['trs_in1', 'stp_in1', 'stp_in2', 'stp_in3', 'ask_in1']) assert.ok(!all.includes(id), `no input id ${id} is stored`)
		const ids = await sessions(page)
		assert.equal(ids.length, 1, 'one journey: the sample replaced the current one')
		assert.notEqual(ids[0], realOld, 'the old journey is gone')
		assert.equal(await page.evaluate((id) => (window as any).__c.store.chunks(id).then((c: any[]) => c.length), seeded[0].id), 1, 'the replay is stored')
		assert.equal(await page.evaluate((id) => (window as any).__c.store.chunks(id).then((c: any[]) => c.length), seeded[1].id), 0, 'a step without a replay has none')
		assert.equal(JSON.parse(all).local['vg-trail:k:consent'], consentBefore.local, 'consent unchanged')
		assert.deepEqual(await consentCopy(page), consentBefore.copy, 'and its copy')

		// The next index write (a route change writes at once) keeps it.
		await page.evaluate(() => history.pushState({}, '', '/en/two'))
		await page.waitForFunction(() => (window as any).__api.snapshot().steps.length === 5, null, { timeout: 5_000 })
		const stored = await page.evaluate((id) => (window as any).__c.store.session(id), ids[0])
		assert.deepEqual(stored.steps.slice(0, 3).map((x: any) => x.title.en), ['Seeded home', MARKUP, 'Seeded cash'], 'in the store after the index write')

		// Markup in a title is text, on the steps and in what was explored.
		await page.evaluate(() => (window as any).__root.querySelector('.tr-pill').click())
		await page.waitForTimeout(100)
		await page.evaluate((id) => (window as any).__api.select(id), seeded[1].id)
		await page.waitForTimeout(200)
		const shown = await page.evaluate(() => {
			const r = (window as any).__root as ShadowRoot
			return { imgs: r.querySelectorAll('img, [onerror], .tr-item b b').length, steps: [...r.querySelectorAll('.tr-t')].map((e) => e.textContent), item: r.querySelector('.tr-item b')?.textContent, pwned: (window as any).__pwned }
		})
		assert.equal(shown.imgs, 0, 'no element made from the sample')
		assert.ok(shown.steps.some((t) => t?.includes(MARKUP)), 'the step title shows as text')
		assert.ok(shown.item?.includes('<img'), 'the explored title shows as text')
		assert.equal(shown.pwned, undefined)

		// A reload: the same journey.
		await page.reload()
		await boot(page)
		await page.waitForFunction(() => (window as any).__api.snapshot().steps.length >= 4, null, { timeout: 5_000 })
		assert.deepEqual((await titles(page)).slice(0, 3), ['Seeded home', MARKUP, 'Seeded cash'], 'after a reload')

		// "Clear" removes it.
		await page.evaluate(() => (window as any).__api.clear())
		await page.waitForTimeout(300)
		assert.ok(!(await titles(page)).some((t: string) => t.startsWith('Seeded')))
		assert.ok(!(await kept(page)).includes('Seeded'), 'nothing of it is stored')
		assert.equal((await snap(page)).consent, 'granted')
	} finally {
		await ctx.close()
	}
})

test('a hostile input id equal to a stored journey\'s id overwrites nothing (S15)', async () => {
	const ctx = await browser.newContext()
	try {
		const page = await openPage(ctx)
		await recording(page)
		const before = await page.evaluate(async () => {
			const c = (window as any).__c
			const s = { schema: 'vg-trail/v1', id: 'trs_real', siteId: 't', locale: 'en', startedAt: Date.now() - 60_000, updatedAt: Date.now() - 60_000, expiresAt: Date.now() + 3_600_000, recordingState: 'stopped', bytes: 4, steps: [{ id: 'stp_real', sessionId: 'trs_real', type: 'page', title: { en: 'Real page' }, enteredAt: Date.now() - 60_000, durationMs: 1000, navigationCause: { kind: 'direct' }, topDestinationIds: [], explored: [], replay: 'ok' }] }
			await c.store.putSession(s)
			await c.store.putChunk({ id: 'stp_real:0', sessionId: 'trs_real', stepId: 'stp_real', seq: 0, t0: 1, t1: 2, bytes: 4, enc: 'json', data: '[{"type":4,"timestamp":1}]' })
			return { s: await c.store.session('trs_real'), chunks: await c.store.chunks('stp_real') }
		})
		const current = (await snap(page)).steps[0].id
		assert.deepEqual(await pressSeed(page, journey(Date.now(), { session: 'trs_real', steps: ['stp_real', current, 'stp_x'] })), { ok: true })
		const after = await page.evaluate(async () => {
			const c = (window as any).__c
			return { s: await c.store.session('trs_real'), chunks: await c.store.chunks('stp_real') }
		})
		assert.deepEqual(after, before, 'the stored journey with that id is unchanged')
		const steps = (await snap(page)).steps
		assert.ok(steps.every((x: any) => !['stp_real', current, 'stp_x'].includes(x.id)), 'no input id is kept')
	} finally {
		await ctx.close()
	}
})

test('two tabs: a seed shows in the other tab; reset unsets consent in both copies, empties the store, stops the recorders and shows the offer in both; a forged reset key is ignored (S15)', async () => {
	const ctx = await browser.newContext()
	try {
		const a = await openPage(ctx)
		const b = await openPage(ctx, { consent: 'granted' })
		await recording(a)
		await recording(b)
		// A page script writing the reset key while consent stands changes nothing in the other tab.
		await a.evaluate(() => localStorage.setItem('vg-trail:k:reset', 'forged'))
		await b.waitForTimeout(300)
		assert.equal((await snap(b)).consent, 'granted', 'a forged reset is ignored')

		assert.deepEqual(await pressSeed(a, journey(Date.now())), { ok: true })
		await b.waitForFunction(() => (window as any).__api.snapshot().steps.some((s: any) => s.title.en === 'Seeded cash'), null, { timeout: 5_000 })
		assert.equal((await snap(b)).rec, 'recording', 'the other tab still records, as a new step after the sample')

		await b.evaluate(() => sessionStorage.setItem('vg-trail:k:not-now', '1'))
		await a.evaluate(() => sessionStorage.setItem('vg-trail:k:not-now', '1'))
		const stopsBefore = await Promise.all([a, b].map((p) => p.evaluate(() => (window as any).__stops)))
		assert.deepEqual(await a.evaluate(() => (window as any).__api.reset()), { ok: true }, 'reset needs no press')
		for (const p of [a, b]) await p.waitForFunction(() => (window as any).__api.snapshot().consent === 'unset', null, { timeout: 5_000 })
		for (const [i, p] of [a, b].entries()) {
			const s = await snap(p)
			assert.equal(s.rec, 'awaiting-consent', 'the offer again')
			assert.deepEqual(s.steps, [], 'no journey shown')
			assert.equal(s.asked, undefined)
			assert.ok((await p.evaluate(() => (window as any).__stops)) > stopsBefore[i], 'the recorder stopped')
			assert.equal(await p.evaluate(() => sessionStorage.getItem('vg-trail:k:not-now')), null, '"Not now" is forgotten too')
			assert.equal(await p.evaluate(() => (window as any).__root.querySelector('.tr-pill')?.hidden ?? null), false, 'the pill offers again')
		}
		assert.equal(await a.evaluate(() => localStorage.getItem('vg-trail:k:consent')), null, 'no consent in localStorage')
		assert.equal(await consentCopy(a), null, 'nor in its IndexedDB copy')
		const dbs = JSON.parse(await kept(a)).dbs
		for (const store of ['sessions', 'chunks', 'interest']) assert.deepEqual(dbs[`vg-trail-v1/${store}`] ?? [], [], `${store} empty`)
		await a.waitForTimeout(300)
		assert.deepEqual(JSON.parse(await kept(a)).dbs['vg-trail-v1/sessions'] ?? [], [], 'and nothing written back after')
		// A trail started afresh reads no choice: the offer.
		await a.reload()
		await boot(a)
		assert.equal((await snap(a)).consent, 'unset')
	} finally {
		await ctx.close()
	}
})
