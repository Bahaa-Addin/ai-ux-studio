/**
 * The public demo extension in Chromium (ADR-0056), offline: the built extension is loaded, a
 * stand-in Vodafone page is served by a route (nothing reaches Vodafone's site), and the guide boots
 * from the gateway named at build time, the experience layer is added, the storage keeper survives
 * the page's own localStorage.clear(), and nothing asks for the demo browser's /__vg routes.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'

import { chromium } from 'playwright'

import { buildExtension } from '../../tools/extension/build.ts'
import { type LayerGateway, startLayerGateway, V } from './vodafone-layer.ts'

const PORT = 4479
let gw: LayerGateway

before(async () => {
	gw = await startLayerGateway(PORT)
})
after(async () => {
	await gw?.close()
})

const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Stand-in</title></head>
<body><main id="main-content"><h1>Mobile internet bundles</h1><p>A stand-in page.</p></main>
<script>localStorage.setItem('site-own', '1'); localStorage.clear(); window.__cleared = true</script></body></html>`

test('the extension puts the guide and the layer on a Vodafone page, from the public gateway', async () => {
	const out = fs.mkdtempSync(path.join(os.tmpdir(), 'vg-ext-e2e-'))
	const { dirs } = buildExtension({ site: gw.site, gateway: gw.url, out })
	const ext = dirs.find((d) => d.endsWith('chrome'))!
	const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'vg-ext-profile-'))
	const ctx = await chromium.launchPersistentContext(profile, {
		channel: 'chromium',
		headless: true,
		args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`, '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1',
			// The test gateway is on this machine; the real one is a public https host, which needs no local-network permission.
			'--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessRespectPreflightResults,BlockInsecurePrivateNetworkRequests',
		],
	})
	try {
		const asked: string[] = []
		await ctx.route(`${V}/**`, (route) => {
			const u = new URL(route.request().url())
			asked.push(u.pathname)
			if (route.request().resourceType() === 'document') return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: PAGE })
			return route.abort()
		})
		// The background script registers the loader on install; wait for it.
		const sw = ctx.serviceWorkers()[0] || (await ctx.waitForEvent('serviceworker'))
		await sw.evaluate(async () => {
			const c = (globalThis as any).chrome
			for (let i = 0; i < 50; i++) {
				if ((await c.scripting.getRegisteredContentScripts({ ids: ['vg-loader'] })).length) return
				await new Promise((r) => setTimeout(r, 100))
			}
			throw new Error('loader not registered')
		})
		const page = await ctx.newPage()
		await page.addInitScript(() => localStorage.setItem('vg-test-kept', '1'))
		await page.goto(`${V}/en/mobile-internet-bundles`, { waitUntil: 'load' })
		await page.waitForSelector('vg-guide', { state: 'attached', timeout: 15_000 })
		const s = await page.evaluate(() => ({
			guide: (document.querySelector('script[data-vg-loader]') as HTMLScriptElement | null)?.src,
			events: (document.querySelector('script[data-vg-loader]') as HTMLScriptElement | null)?.dataset.events ?? null,
			layer: (document.querySelector('script[data-aixc-demo]') as HTMLScriptElement | null)?.src,
			kept: localStorage.getItem('vg-test-kept'),
			own: localStorage.getItem('site-own'),
			cleared: (window as unknown as { __cleared?: boolean }).__cleared,
		}))
		assert.equal(s.guide, `${gw.url}/sdk/guide.js`)
		assert.equal(s.events, null, 'server-sent events, not polling')
		assert.equal(s.layer, `${gw.url}/sdk/aixc/aixc.js`)
		assert.deepEqual([s.cleared, s.own, s.kept], [true, null, '1'], "the page's clear() ran; the guide's key survived it")
		assert.ok(!asked.some((p) => p.startsWith('/__vg/')), `no demo-browser routes asked: ${asked.join(', ')}`)
	} finally {
		await ctx.close()
	}
})
