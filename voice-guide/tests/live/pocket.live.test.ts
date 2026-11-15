/**
 * The Pocket's live smoke on the real web.vodafone.com.eg (live plan phase 3, step S17; ADR-0052, ADR-0064,
 * ADR-0065), run by the owner. It runs the flow of ./pocket-smoke.ts (the same flow the offline rehearsal
 * tests/e2e/pocket-smoke-rehearsal.e2e.test.ts proves on the saved pages) on /en/services and, if that
 * passes, on /ar/services after a pause: one signed-out page, a card pocketed through its chip, the album
 * opened and closed (the same scroll), a reload (the signed-out theme's localStorage clear: the sticker
 * stays), "Your journey" in place, the sticker's link pressed and its requests counted (OD-4), Back.
 *
 * Run it only after O29 is updated (docs/qa/bugs-and-open-issues.md: the demo profile shows Vodafone's
 * pages answering again). Close any `npm run demo:live` first: the demo profile can be open in one
 * browser at a time.
 *
 *   VG_LIVE=1 VG_LIVE_BROWSER=chrome node --test --test-timeout=600000 tests/live/pocket.live.test.ts
 *
 * VG_LIVE_BROWSER=chrome opens the installed Google Chrome, window visible, on the demo profile
 * (data/demo-profile, or VG_LIVE_PROFILE=<dir>), where you have answered the cookie banner yourself.
 * Without it, Playwright's headless Chromium on a throwaway profile: the banner shows there, so the run
 * says 'skipped: banner'.
 *
 * 'skipped: banner' means OneTrust's cookie banner was showing: the test pressed nothing and stopped.
 * Answer the banner yourself in that window (reject non-essential cookies), close it, run the test again.
 *
 * What it never does: sign in, type anything, answer or touch the cookie banner, move or restyle the
 * accessibility button, press a script click, press anything of Vodafone's but the link of a sticker
 * the test made (a public page of the same site), load more than six pages per language, or load
 * pages less than 1.2 s apart. A bot check, a challenge page or an HTTP error stops the run at once,
 * nothing is retried (runbook §0). At the end it removes only what the layer made in this run: the
 * sticker, and the trail's journey and consent if this run gave it.
 *
 * What it prints: each step in words with its numbers, the page loads with their status, and the line
 * 'the destination was requested N times from the network (fetch: a, navigation: b, from cache: c)' with
 * the response's Cache-Control and Vary and the names of the cookies it sets (never their values).
 */
import fs from 'node:fs'
import path from 'node:path'
import { after, before, test } from 'node:test'

import type { Page } from 'playwright'

import type { Manifest } from '#kb'
import { loadPlatformConfig, loadSiteConfig, ROOT } from '#shared/config.ts'

import { buildSdk } from '../../packages/sdk/build.ts'
import { createGateway } from '../../services/gateway/server.ts'
import { createServices } from '../../services/index.ts'
import { type DemoBrowser, launchDemoBrowser } from '../../tools/demo-browser.ts'
import { runPocketSmoke, type SmokeReport } from './pocket-smoke.ts'

const LIVE = process.env.VG_LIVE === '1'
const PORT = 4484
const WEB = 'https://web.vodafone.com.eg'
const PAUSE_MS = 1200
/** The demo's own browser (Google Chrome, visible, the demo profile) instead of Playwright's headless Chromium. */
const CHROME = process.env.VG_LIVE_BROWSER === 'chrome'

let services: Awaited<ReturnType<typeof createServices>>
let gateway: ReturnType<typeof createGateway>
let browser: DemoBrowser
let page: Page

before(async () => {
	if (!LIVE) return
	await buildSdk({ minify: true })
	const platform = loadPlatformConfig({ ...process.env, VG_VOICETUT_URL: '', VG_STORE: 'memory', VG_PORT: String(PORT), VG_PUBLIC_URL: `http://127.0.0.1:${PORT}` })
	const site = loadSiteConfig(path.join(platform.sitesDir, 'vodafone-eg.yaml'))
	// The journey step needs the trail, as `npm run demo:live -- --trail` turns it on for one session.
	site.trail.enabled = true
	services = await createServices({ platform, sites: new Map([[site.id, site]]) })
	const m = JSON.parse(fs.readFileSync(path.join(ROOT, 'config/kb/vodafone-eg.manifest.json'), 'utf8')) as Manifest
	await services.store.putKbVersion(site.id, m)
	await services.store.activateKb(site.id, m.version.id)
	gateway = createGateway({ services })
	await gateway.listen(PORT)
	const profileDir = CHROME ? (process.env.VG_LIVE_PROFILE ? path.resolve(process.env.VG_LIVE_PROFILE) : path.join(platform.dataDir, 'demo-profile')) : undefined
	browser = await launchDemoBrowser({ site, gatewayUrl: `http://127.0.0.1:${PORT}`, start: 'about:blank', profileDir, headless: !CHROME, channel: CHROME ? 'chrome' : 'chromium', xray: 'off', viewport: { width: 1366, height: 900 } })
	page = browser.page
})

after(async () => {
	await browser?.close()
	await gateway?.close()
	await services?.close()
})

const print = (r: SmokeReport) => console.log(`# report ${r.path}: ${JSON.stringify({ outcome: r.outcome, message: r.message, steps: r.steps, loads: r.loads, presses: r.presses, requests: r.requests, cleanup: r.cleanup })}`)

test('live: the Pocket on /en/services, then /ar/services: pocket a card, the album, the reload, the journey, the portal', { skip: !LIVE && 'set VG_LIVE=1', timeout: 600_000 }, async (t) => {
	for (const pathname of ['/en/services', '/ar/services']) {
		const report = await runPocketSmoke(page, { base: WEB, path: pathname, pauseMs: PAUSE_MS, log: (line) => console.log(`# ${pathname} ${line}`) }).catch((e) => {
			if (e?.report) print(e.report)
			throw e
		})
		print(report)
		if (report.outcome === 'skipped: banner') return t.skip(`skipped: banner. ${report.message}`)
		// A pause between the two languages, beyond the pacing inside each run.
		await new Promise((done) => setTimeout(done, PAUSE_MS * 3))
	}
})
