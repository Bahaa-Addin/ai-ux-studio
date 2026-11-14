/**
 * The trail's consent survives Vodafone's storage clear (T-806; ADR-0050 §8; live plan phase 3 S9), in a
 * real Chromium: the choice is also kept in a small IndexedDB database of its own, read when
 * `localStorage` has none and the key put back; a visitor who chose nothing has nothing stored; the last
 * choice is the one kept; a tab follows what another tab wrote, not what a clear left behind.
 */
import assert from 'node:assert/strict'
import path from 'node:path'
import { after, before, test } from 'node:test'

import * as esbuild from 'esbuild'
import { type Browser, chromium, type Page } from 'playwright'

import { ROOT } from '#shared/config.ts'

const ORIGIN = 'http://localhost:4498'
let browser: Browser
let bundle = ''

before(async () => {
	const out = await esbuild.build({
		stdin: {
			contents: `import { TrailController } from './controller.ts'; import { consentKey, readConsent, recoverConsent, writeConsent } from './consent.ts'; window.__t = { TrailController, consentKey, readConsent, recoverConsent, writeConsent }`,
			resolveDir: path.join(ROOT, 'packages/sdk/src/trail'),
			loader: 'ts',
		},
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
async function blankPage(): Promise<Page> {
	const page = await browser.newPage()
	await page.route(`${ORIGIN}/**`, (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Consent</title></head><body><main><h1>A page</h1></main></body></html>' }))
	await page.goto(`${ORIGIN}/en/page`)
	await page.addScriptTag({ content: bundle })
	return page
}

const databases = (page: Page) => page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name))

/** Starts the real controller with a stand-in guide, as a page load does, and says what it believes. */
const startTrail = (page: Page) =>
	page.evaluate(async () => {
		const w = window as any
		const holder = document.createElement('div')
		document.body.append(holder)
		const g = {
			o: { gateway: 'http://localhost:4498', siteKey: 'k' },
			api: { get: async () => null, post: async () => ({}) },
			session: { site: { id: 't', trail: {} }, page: { kbVersion: null, pageId: null } },
			lang: 'en',
			ui: { root: holder.attachShadow({ mode: 'open' }), open() {} },
			speech: { canSpeak: false, muted: true },
			executor: { running: false },
			busy: false,
			request: async () => {},
		}
		const c = new w.__t.TrailController(g, { enabled: true, retentionHours: 24, excludePaths: [], privateSelectors: [], aggregation: false })
		w.__c = c
		await c.start()
		return { consent: c.state.consent as string, rec: c.state.rec as string }
	})

test('a visitor who chose nothing has nothing stored: reading the copy creates no database (S9)', async () => {
	const page = await blankPage()
	try {
		assert.equal(await page.evaluate(() => (window as any).__t.recoverConsent('k')), 'unset')
		assert.equal((await databases(page)).includes('vg-trail-consent'), false, 'no database was made by a read')
		assert.equal((await startTrail(page)).consent, 'unset', 'no choice: the offer')
		assert.equal((await databases(page)).includes('vg-trail-consent'), false, 'nor did starting the trail')
	} finally {
		await page.close()
	}
})

test('after the theme clears localStorage the choice is read from the copy and the key is put back, for every state (S9, T-806)', async () => {
	const page = await blankPage()
	try {
		for (const state of ['granted', 'paused', 'off']) {
			await page.evaluate(async (state) => {
				const t = (window as any).__t
				t.writeConsent('k', state, 24)
				await new Promise((done) => setTimeout(done, 100))
			}, state)
			const record = await page.evaluate(() => localStorage.getItem('vg-trail:k:consent'))
			await page.evaluate(() => localStorage.clear())
			assert.equal(await page.evaluate(() => localStorage.getItem('vg-trail:k:consent')), null, 'cleared')
			assert.equal(await page.evaluate(() => (window as any).__t.recoverConsent('k')), state, `${state}: read from the copy`)
			assert.equal(await page.evaluate(() => localStorage.getItem('vg-trail:k:consent')), record, `${state}: the key is back, as it was written`)
		}
		assert.ok((await databases(page)).includes('vg-trail-consent'))
	} finally {
		await page.close()
	}
})

test('the last choice is the one kept, however fast they come (S9)', async () => {
	const page = await blankPage()
	try {
		await page.evaluate(() => {
			const t = (window as any).__t
			for (const state of ['granted', 'paused', 'granted', 'off', 'granted', 'paused']) t.writeConsent('k', state, 24)
		})
		await page.waitForTimeout(300)
		await page.evaluate(() => localStorage.clear())
		assert.equal(await page.evaluate(() => (window as any).__t.recoverConsent('k')), 'paused')
	} finally {
		await page.close()
	}
})

test('a page that loads after the clear starts with the person\'s choice, and "off" stays off (S9)', async () => {
	const page = await blankPage()
	try {
		await page.evaluate(async () => {
			;(window as any).__t.writeConsent('k', 'paused', 24)
			await new Promise((done) => setTimeout(done, 100))
			localStorage.clear()
		})
		assert.equal((await startTrail(page)).consent, 'paused', 'the choice survived the clear')
		assert.notEqual(await page.evaluate(() => localStorage.getItem('vg-trail:k:consent')), null, 'and the key is back for the other tabs')
	} finally {
		await page.close()
	}
	const off = await blankPage()
	try {
		await off.evaluate(async () => {
			;(window as any).__t.writeConsent('k', 'off', 24)
			await new Promise((done) => setTimeout(done, 100))
			localStorage.clear()
		})
		assert.equal((await startTrail(off)).consent, 'off', 'turned off stays off: the offer does not come back')
	} finally {
		await off.close()
	}
})

test('a tab follows what another tab wrote, and a clear is not a change (S9)', async () => {
	const page = await blankPage()
	try {
		await page.evaluate(async () => {
			;(window as any).__t.writeConsent('k', 'granted', 24)
			await new Promise((done) => setTimeout(done, 100))
		})
		const before = await startTrail(page)
		assert.equal(before.consent, 'granted')
		const consent = () => page.evaluate(() => (window as any).__c.state.consent as string)
		// The theme's clear in another tab: a storage event with no key, or the key removed. Nothing changes.
		await page.evaluate(() => dispatchEvent(new StorageEvent('storage', { key: null })))
		await page.evaluate(() => dispatchEvent(new StorageEvent('storage', { key: 'vg-trail:k:consent', newValue: null })))
		await page.waitForTimeout(80)
		assert.equal(await consent(), 'granted', 'a clear leaves the trail as it was')
		// Another tab turns the trail off, and its page's theme clears storage straight after: what it wrote counts.
		await page.evaluate(() => {
			localStorage.clear()
			dispatchEvent(new StorageEvent('storage', { key: 'vg-trail:k:consent', newValue: JSON.stringify({ v: 1, state: 'off', at: 1, retentionHours: 24 }) }))
		})
		await page.waitForFunction(() => (window as any).__c.state.consent === 'off', null, { timeout: 2_000 })
	} finally {
		await page.close()
	}
})
