/**
 * What questions were about (ADR-0050 §5; live plan phase 3 S14), in a real Chromium with the real
 * controller, real IndexedDB and a stand-in guide whose request posts the turn as `guide.ts` does. The
 * recorder is a stand-in that records nothing (no rrweb here). A question asked on the second page shows
 * in `snapshot().asked` and through `askAbout` from the host on the next page; the words said and the
 * answer (with its price) are nowhere in the snapshot, IndexedDB, localStorage or sessionStorage;
 * nothing is kept while paused, on a page that is not saved, without a destination or for a failed
 * turn; "Clear", "Clear all" and "Turn off" remove the asked questions with the rest.
 */
import assert from 'node:assert/strict'
import path from 'node:path'
import { after, before, test } from 'node:test'

import * as esbuild from 'esbuild'
import { type Browser, chromium, type Page } from 'playwright'

import { ROOT } from '#shared/config.ts'

const ORIGIN = 'http://localhost:4496'
const UTTERANCE = 'my number is 01001234567 tell me about roaming zebra-quokka'
const ANSWER = 'Roaming week plans start at 46 EGP a month'
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
async function trailPage(o: { consent?: 'granted' | 'paused'; optedOut?: boolean } = {}): Promise<Page> {
	const page = await browser.newPage()
	await page.route((url) => url.origin !== ORIGIN, (route) => route.abort())
	await page.route(`${ORIGIN}/**`, (route) =>
		route.fulfill({ contentType: 'text/html', body: `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Trail asked</title>${o.optedOut ? '<meta name="vg-trail" content="off">' : ''}</head><body><main><h1>A page</h1></main></body></html>` }),
	)
	await page.goto(`${ORIGIN}/en/one`)
	await page.addScriptTag({ content: bundle })
	await page.evaluate(
		async ({ consent, UTTERANCE, ANSWER }) => {
			const w = window as any
			localStorage.setItem('vg-trail:k:consent', JSON.stringify({ v: 1, state: consent, at: Date.now(), retentionHours: 24 }))
			// The recorder chunk, stood in: it records nothing.
			w.__vgTrailRecord = { startRecording: () => ({ snapshot() {}, stop() {} }) }
			const holder = document.createElement('div')
			document.body.append(holder)
			const root = holder.attachShadow({ mode: 'open' })
			const map = {
				standard: 'vg-experience-page/v1',
				siteId: 't',
				kbVersionId: null,
				profileId: null,
				keepQuery: [],
				page: { id: 'web.page', kind: 'page', eligible: true, title: { en: 'A page' } },
				destinations: [{ id: 'd.roaming', kind: 'section', css: ['#roam'], title: { en: 'Roaming' }, context: { en: 'A page' }, topic: 'roaming', questions: { en: [{ id: 'q1', text: 'How do I roam?', intent: 'info' }] } }],
				collections: [],
				pages: [{ id: 'web.cash', kind: 'page', eligible: true, title: { en: 'Cash' }, paths: [], questions: { en: [{ id: 'qc', text: 'What is Cash?', intent: 'info' }] } }],
			}
			w.__meta = { intent: 'navigate', route: 'replay', destinationId: 'd.roaming', pageId: 'web.roaming', label: 'Roaming week plans', confidence: 0.9 }
			w.__fail = false
			w.__turns = []
			const g: any = {
				o: { gateway: 'http://localhost:4496', siteKey: 'k' },
				api: {
					get: async () => structuredClone(map),
					post: async (p: string) => {
						if (p !== '/v1/turn') return {}
						if (w.__fail) throw new Error('503')
						return { turnId: 't', plan: { v: 1, turnId: 't', lang: 'en', say: ANSWER, steps: [{ op: 'say', text: ANSWER }], meta: structuredClone(w.__meta) } }
					},
				},
				session: { site: { id: 't', trail: {} }, page: { kbVersion: null, pageId: null } },
				lang: 'en',
				ui: { root, open() {} },
				speech: { canSpeak: false, muted: true },
				executor: { running: false },
				busy: false,
				// As guide.ts does: the turn goes to the server with the words; the answer is said.
				async request(utterance: string, source: string, _shown?: string, _l?: number, _c?: number, hint?: unknown) {
					w.__turns.push([source, hint])
					try {
						const res = await g.api.post('/v1/turn', { sessionId: 's', utterance, uiLang: 'en', page: { url: location.href }, hint })
						w.__said = res.plan.say
					} catch {}
				},
			}
			w.__g = g
			const c = new w.__TrailController(g, { enabled: true, retentionHours: 24, excludePaths: [], privateSelectors: [], aggregation: false })
			w.__c = c
			w.__ready = new Promise((done) => addEventListener('vg:trail-ready', (e) => done((e as CustomEvent).detail), { once: true }))
			await c.start()
			w.__api = await w.__ready
			w.__UTTERANCE = UTTERANCE
		},
		{ consent: o.consent ?? 'granted', UTTERANCE, ANSWER },
	)
	return page
}

const snap = (page: Page) => page.evaluate(() => (window as any).__api.snapshot())
const ask = (page: Page, source = 'typed') => page.evaluate(async (source) => {
	const w = window as any
	await w.__g.request(w.__UTTERANCE, source)
	await new Promise((r) => setTimeout(r, 50))
}, source)
const pages = async (page: Page) => (await snap(page)).steps.filter((s: any) => s.type === 'page')
async function go(page: Page, to: string, n: number) {
	await page.evaluate((to) => history.pushState({}, '', to), to)
	await page.waitForFunction((n) => ((window as any).__api.snapshot().steps as any[]).filter((s) => s.type === 'page').length === n, n, { timeout: 5_000 })
}
/** Everything the trail keeps in the browser: IndexedDB (every store), localStorage and sessionStorage. */
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
const PRIVATE = [UTTERANCE, 'zebra-quokka', '01001234567', ANSWER, '46 EGP']

test('a question asked on the second page: in snapshot().asked, in askAbout from the next page, never its words or answer; Clear empties it (S14)', async () => {
	const page = await trailPage()
	try {
		assert.equal((await snap(page)).rec, 'recording')
		await page.waitForFunction(() => (window as any).__api.snapshot().steps.length === 1, null, { timeout: 5_000 })
		await go(page, '/en/two', 2)
		await ask(page, 'voice')
		const step2 = (await pages(page))[1].id
		let s = await snap(page)
		assert.equal(s.asked.length, 1)
		const { id, at, ...q } = s.asked[0]
		assert.ok(typeof id === 'string' && typeof at === 'number')
		assert.deepEqual(q, { lang: 'en', origin: 'voice', destinationId: 'd.roaming', pageId: 'web.roaming', intent: 'navigate', route: 'replay', label: 'Roaming week plans', stepId: step2 })
		assert.ok(s.steps.every((st: any) => !('asked' in st)), 'steps keep the version 1 shape')
		assert.equal(await page.evaluate(() => (window as any).__said), ANSWER, 'the guide still says its answer')

		await go(page, '/en/three', 3)
		const about = await page.evaluate(() => (window as any).__api.askAbout('d.roaming'))
		assert.deepEqual(about.map((x: any) => [x.destinationId, x.stepId]), [['d.roaming', step2]], 'from another page, across steps')
		assert.deepEqual(await page.evaluate(() => (window as any).__api.askAbout('nope')), [], 'an unknown destination: nothing')
		assert.deepEqual(await page.evaluate(() => (window as any).__api.questionsFor('d.roaming')), [{ id: 'q1', text: 'How do I roam?', intent: 'info' }], 'the verified questions, from the page map')
		assert.deepEqual(await page.evaluate(() => (window as any).__api.questionsFor('web.cash')), [{ id: 'qc', text: 'What is Cash?', intent: 'info' }], 'a page of the site')
		assert.deepEqual(await page.evaluate(() => (window as any).__api.questionsFor('nope')), [])

		// Asking again from a host card: an ordinary chip turn with the trail's hint, recorded on this page.
		await page.evaluate(() => (window as any).__api.askAbout('d.roaming', 'q1'))
		await page.waitForFunction(() => (window as any).__api.snapshot().asked.length === 2, null, { timeout: 5_000 })
		const turn = await page.evaluate(() => (window as any).__turns.at(-1))
		assert.equal(turn[0], 'chip')
		assert.equal(turn[1].destinationId, 'd.roaming')
		assert.equal(turn[1].questionId, 'q1')
		s = await snap(page)
		assert.deepEqual(s.asked.map((x: any) => [x.origin, x.stepId === s.currentStepId]), [['chip', true], ['voice', false]], 'newest first')

		await page.waitForTimeout(200)
		const all = await kept(page)
		assert.match(all, /Roaming week plans/, 'the asked questions are stored')
		for (const bad of PRIVATE) assert.ok(!all.includes(bad), `nothing kept holds "${bad}"`)
		assert.ok(!JSON.stringify(await snap(page)).includes(UTTERANCE))

		await page.evaluate(() => (window as any).__api.clear())
		await page.waitForTimeout(300)
		assert.deepEqual((await snap(page)).asked, [], 'Clear: no asked questions')
		assert.deepEqual(await page.evaluate(() => (window as any).__api.askAbout('d.roaming')), [])
		assert.ok(!(await kept(page)).includes('Roaming week plans'), 'and none stored')
	} finally {
		await page.close()
	}
})

test('nothing is kept without a destination, for a failed turn, while paused, or on a page that is not saved (S14)', async () => {
	const page = await trailPage()
	try {
		await page.waitForFunction(() => (window as any).__api.snapshot().steps.length === 1, null, { timeout: 5_000 })
		await page.evaluate(() => ((window as any).__meta = { intent: 'stop', route: 'control' }))
		await ask(page)
		await page.evaluate(() => {
			const w = window as any
			w.__meta = { intent: 'navigate', route: 'replay', destinationId: 'd.roaming' }
			w.__fail = true
		})
		await ask(page)
		assert.deepEqual((await snap(page)).asked, [], 'no destination, or no answer: nothing')
		await page.evaluate(() => ((window as any).__fail = false))
		await page.evaluate(() => (window as any).__api.pause())
		await ask(page)
		assert.deepEqual((await snap(page)).asked, [], 'paused: nothing')
		await page.evaluate(() => (window as any).__api.resume())
		await page.waitForFunction(() => (window as any).__api.snapshot().rec === 'recording', null, { timeout: 5_000 })
		for (let i = 0; i < 12; i++) await ask(page)
		assert.equal((await snap(page)).asked.length, 10, 'at most ten on a step')
		await page.evaluate(() => (window as any).__api.clearAll())
		await page.waitForTimeout(300)
		assert.deepEqual((await snap(page)).asked, [], 'Clear all')
		// A destination that is not on this page's map, nor explored: still found by what was asked about it.
		await page.evaluate(() => ((window as any).__meta = { intent: 'navigate', route: 'replay', destinationId: 'd.elsewhere', pageId: 'web.other' }))
		await ask(page)
		assert.equal((await snap(page)).asked.length, 1)
		assert.deepEqual(await page.evaluate(() => (window as any).__api.askAbout('d.elsewhere').map((x: any) => [x.destinationId, x.pageId, 'label' in x])), [['d.elsewhere', 'web.other', false]])
		assert.deepEqual(await page.evaluate(() => (window as any).__api.questionsFor('d.elsewhere')), [], 'no verified questions known for it')
		await page.evaluate(() => (window as any).__api.turnOff())
		await page.waitForTimeout(300)
		const s = await snap(page)
		assert.equal(s.asked, undefined, 'turned off: no journey, no asked field')
		assert.deepEqual(await page.evaluate(() => (window as any).__api.askAbout('d.roaming')), [])
		assert.ok(!/Roaming|d\.elsewhere/.test(await kept(page)), 'turned off: nothing stored')
	} finally {
		await page.close()
	}
	const unsaved = await trailPage({ optedOut: true })
	try {
		await ask(unsaved)
		assert.deepEqual((await snap(unsaved)).asked, [], 'a page that is not saved has no page step: nothing')
	} finally {
		await unsaved.close()
	}
})
