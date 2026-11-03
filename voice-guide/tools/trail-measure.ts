/**
 * npm run measure:trail [-- --minutes 10]
 *
 * Measures the Exploration Trail on the fixture site (SPEC-06 §7, ADR-0035): bundle sizes, time to
 * start recording, IndexedDB growth over a scripted journey of N minutes, long tasks while
 * recording, time to open a preview, scrub latency, and heap after repeated open/close cycles.
 * Memory store, Chromium, one machine: numbers for the budget, not for the field.
 */
import fs from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { gzipSync } from 'node:zlib'

import { chromium } from 'playwright'

import type { Manifest } from '#kb'
import { ensureExperienceProfile } from '#jobs/experience/build.ts'

import { buildSdk, SDK_FILES } from '../packages/sdk/build.ts'
import { createGateway } from '../services/gateway/server.ts'
import { createServices } from '../services/index.ts'
import { loadPlatformConfig, loadSiteConfig, ROOT } from '../services/shared/config.ts'
import { startSiteServers } from './site-server.ts'

const { values } = parseArgs({ options: { minutes: { type: 'string', default: '10' }, out: { type: 'string' } } })
const minutes = Number(values.minutes)
const WEB = 'http://localhost:4401'
const platform = loadPlatformConfig({ ...process.env, VG_STORE: 'memory', VG_PORT: '4400', VG_PUBLIC_URL: 'http://localhost:4400' })
const site = loadSiteConfig(path.join(ROOT, 'config/sites/demo-telco.yaml'))
await buildSdk({ minify: true })
const sizes = Object.fromEntries(SDK_FILES.map((f) => {
	const b = fs.readFileSync(path.join(ROOT, 'packages/sdk/dist', f))
	return [f, { raw: b.length, gzip: gzipSync(b, { level: 9 }).length }]
}))
const services = await createServices({ platform })
const m = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/fixtures/demo-telco.manifest.json'), 'utf8')) as Manifest
await services.store.putKbVersion(site.id, m)
await services.store.activateKb(site.id, m.version.id)
await ensureExperienceProfile(services.store, site, m)
const sites = await startSiteServers(site, { gatewayUrl: platform.publicUrl })
const gateway = createGateway({ services })
await gateway.listen(4400)
const browser = await chromium.launch({ args: ['--enable-precise-memory-info', '--js-flags=--expose-gc'] })
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
await ctx.addInitScript(`localStorage.setItem('vg-trail:pk_demo_telco:consent', JSON.stringify({ v: 1, state: 'granted', at: 1, retentionHours: 24 }));
window.__long = []; try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__long.push(Math.round(e.duration)) }).observe({ type: 'longtask', buffered: true }) } catch {}`)
const page = await ctx.newPage()
const ready = () => page.waitForFunction(() => document.querySelector('vg-guide')?.shadowRoot?.querySelector('.tr')?.getAttribute('data-rec') === 'recording', null, { timeout: 20_000 })
const longTasks: number[] = []
const collectLong = async () => longTasks.push(...((await page.evaluate(() => (window as any).__long || [])) as number[]))

// ---- a scripted journey: pointer, scroll, tabs and links across the public pages ----
const pagesCycle = ['/en/offers.html', '/en/bundles.html', '/en/help.html', '/en/index.html', '/en/coverage.html']
const t0 = Date.now()
let initMs: number[] = []
let visits = 0
while (Date.now() - t0 < minutes * 60_000) {
	const url = `${WEB}${pagesCycle[visits % pagesCycle.length]}`
	await page.goto(url)
	await ready()
	await page.waitForTimeout(300)
	initMs.push(Number(await page.evaluate(() => (window as any).__vgTrailInitMs ?? -1)))
	const end = Date.now() + Math.min(45_000, minutes * 60_000 - (Date.now() - t0))
	while (Date.now() < end) {
		await page.mouse.move(100 + Math.random() * 1000, 120 + Math.random() * 600, { steps: 12 })
		await page.mouse.wheel(0, Math.random() < 0.5 ? 240 : -240)
		if (Math.random() < 0.1) await page.locator('#tab-home, #tab-mobile, details summary').first().click({ timeout: 500 }).catch(() => {})
		await page.waitForTimeout(400)
	}
	await collectLong()
	visits++
}
await page.waitForTimeout(2500)
const storage = await page.evaluate(async () => {
	const db = await new Promise<IDBDatabase>((res) => {
		const r = indexedDB.open('vg-trail-v1')
		r.onsuccess = () => res(r.result)
	})
	const all = (n: string) => new Promise<any[]>((res) => {
		const r = db.transaction(n).objectStore(n).getAll()
		r.onsuccess = () => res(r.result)
	})
	const sessions = await all('sessions')
	const chunks = await all('chunks')
	db.close()
	const est = await navigator.storage?.estimate?.()
	return { sessions: sessions.length, steps: sessions.reduce((n, s) => n + s.steps.length, 0), chunks: chunks.length, chunkBytes: chunks.reduce((n, c) => n + (c.bytes || 0), 0), usage: est?.usage ?? null }
})

// ---- previews: open, scrub, close, repeatedly ----
const heap = () => page.evaluate(() => {
	;(window as any).gc?.()
	return (performance as any).memory?.usedJSHeapSize as number
})
const openMs: number[] = []
const scrubMs: number[] = []
let previewFailures = 0
const heapBefore = await heap()
for (let i = 0; i < 20; i++) {
	await page.locator('vg-guide').locator('.tr-pill').click()
	// Each cycle previews an earlier page (the current one may still be writing its first chunk).
	await page.waitForFunction(() => document.querySelector('vg-guide')!.shadowRoot!.querySelectorAll('.tr-seg[data-step]').length > 1, null, { timeout: 20_000 })
	const segs = page.locator('vg-guide').locator('.tr-seg[data-step]')
	await segs.nth(i % Math.max(1, (await segs.count()) - 1)).click()
	const ok = await page
		.waitForFunction(() => {
			const r = document.querySelector('vg-guide')!.shadowRoot!
			return r.querySelector('.tr-frame iframe') ? 'ok' : r.querySelector('.tr-veil:not([hidden])')?.textContent === 'No preview for this page' ? 'none' : null
		}, null, { timeout: 30_000 })
		.then((h) => h.jsonValue())
		.catch(() => 'timeout')
	if (ok !== 'ok') {
		previewFailures++
		await page.keyboard.press('Escape')
		continue
	}
	openMs.push(Number(await page.evaluate(() => (window as any).__vgTrailPreviewMs)))
	const lat = await page.evaluate(async () => {
		const c = (window as any).voiceGuide.trail
		const id = c.state.selectedStepId
		const out: number[] = []
		for (let k = 0; k < 15; k++) {
			const t = performance.now()
			c.view.i.scrub(id, Math.random(), 'keyboard')
			out.push(performance.now() - t)
			await new Promise((r) => requestAnimationFrame(r))
		}
		return out
	})
	scrubMs.push(...lat)
	await page.keyboard.press('Escape')
	await page.waitForTimeout(150)
}
const heapAfter = await heap()
await collectLong()
await browser.close()
await gateway.close()
await sites.close()
await services.close()

const q = (xs: number[], p: number) => {
	const s = [...xs].filter((x) => x >= 0).sort((a, b) => a - b)
	return s.length ? Math.round(s[Math.min(s.length - 1, Math.floor(p * s.length))] * 10) / 10 : null
}
const report = {
	date: new Date().toISOString(),
	conditions: `fixture site, Chromium ${browser.version()}, 1280x800, one machine, memory store; ${minutes}-minute scripted journey over ${visits} page visits`,
	bundles: sizes,
	recorder: { initMs: { p50: q(initMs, 0.5), p95: q(initMs, 0.95) } },
	storage: { ...storage, bytesPerMinute: Math.round(storage.chunkBytes / Math.max(1, minutes)) },
	longTasks: { count: longTasks.length, over100ms: longTasks.filter((x) => x > 100).length, max: longTasks.length ? Math.max(...longTasks) : 0 },
	preview: { failures: previewFailures, openMs: { p50: q(openMs, 0.5), p95: q(openMs, 0.95) }, scrubMs: { p50: q(scrubMs, 0.5), p95: q(scrubMs, 0.95), max: q(scrubMs, 1) } },
	heap: { before: heapBefore, after20OpenClose: heapAfter, deltaKB: heapBefore && heapAfter ? Math.round((heapAfter - heapBefore) / 1024) : null },
}
console.log(JSON.stringify(report, null, 2))
if (values.out) fs.writeFileSync(values.out, JSON.stringify(report, null, 2))
process.exit(0)
