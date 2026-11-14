/**
 * The trail's host interface, version 2 (ADR-0050; live plan phase 3 S8), in a real Chromium with the
 * real controller and a stand-in guide: a host claims the journey at run time, the pill then asks the
 * host to open it instead of opening the guide's own sheet, and giving it back (or a host that fails)
 * brings the sheet back at once. Nothing here records: the consent is "paused".
 */
import assert from 'node:assert/strict'
import path from 'node:path'
import { after, before, test } from 'node:test'

import * as esbuild from 'esbuild'
import { type Browser, chromium, type Page } from 'playwright'

import { ROOT } from '#shared/config.ts'

const ORIGIN = 'http://localhost:4497'
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
/** A page with the trail started on it: its controller, a stand-in guide, and a count of `vg:trail-open`. */
async function trailPage(o: { meta?: boolean; lang?: string } = {}): Promise<Page> {
	const page = await browser.newPage()
	await page.route(`${ORIGIN}/**`, (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Trail host</title></head><body><main><h1>A page</h1></main></body></html>' }))
	await page.goto(`${ORIGIN}/en/page`)
	await page.addScriptTag({ content: bundle })
	await page.evaluate(
		async ({ meta, lang }) => {
			const w = window as any
			localStorage.setItem('vg-trail:k:consent', JSON.stringify({ v: 1, state: 'paused', at: 1, retentionHours: 24 }))
			if (meta) document.head.append(Object.assign(document.createElement('meta'), { name: 'vg-trail-host', content: 'pocket' }))
			const holder = document.createElement('div')
			document.body.append(holder)
			const root = holder.attachShadow({ mode: 'open' })
			const asked: unknown[][] = []
			const g = {
				o: { gateway: 'http://localhost:4497', siteKey: 'k' },
				api: { get: async () => null, post: async () => ({}) },
				session: { site: { id: 't', trail: {} }, page: { kbVersion: null, pageId: null } },
				lang,
				ui: { root, open() {} },
				speech: { canSpeak: false, muted: true },
				executor: { running: false },
				busy: false,
				request: async (...args: unknown[]) => void asked.push(args),
			}
			const c = new w.__TrailController(g, { enabled: true, retentionHours: 24, excludePaths: [], privateSelectors: [], aggregation: false })
			w.__c = c
			w.__root = root
			w.__asked = asked
			w.__opens = 0
			addEventListener('vg:trail-open', () => w.__opens++)
			w.__ready = new Promise((done) => addEventListener('vg:trail-ready', (e) => done((e as CustomEvent).detail), { once: true }))
			await c.start()
			w.__api = await w.__ready
		},
		{ meta: !!o.meta, lang: o.lang ?? 'en' },
	)
	return page
}

/** What a person sees of the trail. */
const seen = (page: Page) =>
	page.evaluate(() => {
		const w = window as any
		return { view: w.__c.state.view as string, sheet: !w.__root.querySelector('.tr-sheet').hidden, hosted: w.__c.hosted as boolean, opens: w.__opens as number }
	})
const press = (page: Page) => page.evaluate(() => (window as any).__root.querySelector('.tr-pill').click())
const settle = (page: Page) => page.waitForTimeout(80)

test('a claimed journey: the pill asks the host to open it and never the sheet; giving it back brings the sheet back at once (S8)', async () => {
	const page = await trailPage()
	try {
		assert.equal(await page.evaluate(() => (window as any).__api.version), 2, 'version 2')
		assert.deepEqual(await seen(page), { view: 'collapsed', sheet: false, hosted: false, opens: 0 })
		await press(page)
		await settle(page)
		assert.deepEqual(await seen(page), { view: 'expanded', sheet: true, hosted: false, opens: 0 }, 'unclaimed: the guide\'s own sheet opens')
		await press(page)
		await settle(page)
		assert.equal((await seen(page)).sheet, false)

		await page.evaluate(() => {
			const w = window as any
			w.__release = w.__api.claim()
			w.__second = w.__api.claim()
		})
		assert.deepEqual(await page.evaluate(() => [typeof (window as any).__release, (window as any).__second]), ['function', null], 'one host at a time: a second claim is refused')
		assert.equal((await seen(page)).hosted, true)
		await press(page)
		await settle(page)
		assert.deepEqual(await seen(page), { view: 'collapsed', sheet: false, hosted: true, opens: 1 }, 'claimed: the host is asked, the sheet stays shut')

		await page.evaluate(() => (window as any).__release())
		assert.equal((await seen(page)).hosted, false, 'given back')
		await press(page)
		await settle(page)
		assert.deepEqual(await seen(page), { view: 'expanded', sheet: true, hosted: false, opens: 1 }, 'the pill works again at once: the sheet')
		await page.evaluate(() => (window as any).__release())
		assert.equal((await seen(page)).hosted, false, 'a second release does nothing')
	} finally {
		await page.close()
	}
})

test('a claim made while the sheet is open hands over: the sheet closes, then the host is asked to open (S8)', async () => {
	const page = await trailPage()
	try {
		await press(page)
		await settle(page)
		assert.equal((await seen(page)).sheet, true)
		await page.evaluate(() => ((window as any).__release = (window as any).__api.claim()))
		await page.waitForFunction(() => (window as any).__opens === 1, null, { timeout: 2_000 })
		assert.deepEqual(await seen(page), { view: 'collapsed', sheet: false, hosted: true, opens: 1 })
		// A host that already gave the journey back is not asked.
		await page.evaluate(() => (window as any).__release())
		await press(page)
		await page.evaluate(() => {
			const w = window as any
			w.__api.close()
			w.__release = w.__api.claim()
			w.__release()
		})
		await settle(page)
		assert.equal((await seen(page)).opens, 1, 'no second request to open')
	} finally {
		await page.close()
	}
})

test('giving the journey back while the host has it open closes it, empties the host\'s preview root, and leaves the sheet working (S8)', async () => {
	const page = await trailPage()
	try {
		await page.evaluate(() => {
			const w = window as any
			w.__release = w.__api.claim()
			const frame = document.createElement('div')
			frame.append(document.createElement('iframe'))
			document.body.append(frame)
			w.__frame = frame
			w.__api.setPreviewRoot(frame)
			w.__api.open()
		})
		await settle(page)
		assert.deepEqual(await seen(page), { view: 'expanded', sheet: false, hosted: true, opens: 0 }, 'the host has the journey open: no sheet of ours')
		await page.evaluate(() => (window as any).__release())
		await settle(page)
		assert.deepEqual(await seen(page), { view: 'collapsed', sheet: false, hosted: false, opens: 0 }, 'closed')
		assert.equal(await page.evaluate(() => (window as any).__frame.childElementCount), 0, 'the host\'s preview root is empty')
		await press(page)
		await settle(page)
		assert.equal((await seen(page)).sheet, true, 'the sheet opens')
	} finally {
		await page.close()
	}
})

test('a release that is not the current claim does nothing (S8)', async () => {
	const page = await trailPage()
	try {
		await page.evaluate(() => {
			const w = window as any
			w.__first = w.__api.claim()
			w.__first()
			w.__second = w.__api.claim()
			w.__first()
		})
		assert.equal((await seen(page)).hosted, true, 'the first host\'s old release leaves the second host in place')
	} finally {
		await page.close()
	}
})

test('a page that declares itself a host in its HTML (the clone\'s meta) keeps it for good: no claim, the pill asks it (S8)', async () => {
	const page = await trailPage({ meta: true })
	try {
		assert.equal(await page.evaluate(() => (window as any).__api.claim()), null, 'already held')
		await press(page)
		await settle(page)
		assert.deepEqual(await seen(page), { view: 'collapsed', sheet: false, hosted: true, opens: 1 })
	} finally {
		await page.close()
	}
})

test('a question chip is found in the page\'s language or its first two letters (S8)', async () => {
	const page = await trailPage({ lang: 'en-GB' })
	try {
		await page.evaluate(() => {
			const w = window as any
			const step = { id: 's1', type: 'page', explored: [{ destinationId: 'web.x', title: { en: 'X' }, questions: { en: [{ id: 'q1', text: 'What is X?' }] } }], canonicalPath: 'http://localhost:4497/en/page' }
			w.__c.session = { id: 'j', steps: [step] }
			w.__c.state = { ...w.__c.state, selectedStepId: 's1' }
			w.__api.ask('web.x', 'q1')
		})
		await settle(page)
		const asked = await page.evaluate(() => (window as any).__asked as unknown[][])
		assert.equal(asked.length, 1, 'asked once')
		assert.equal(asked[0][0], 'What is X?')
		assert.equal(asked[0][1], 'chip')
	} finally {
		await page.close()
	}
})
