/**
 * The floating-control matrix on the real web.vodafone.com.eg (live plan §3.7; phase 3, S16's matrix taken
 * live; ADR-0050, ADR-0052, ADR-0064, ADR-0065), run by the lead or the owner. It runs ./floating-walk.ts
 * (runFloatingMatrix, the same run the offline rehearsal tests/e2e/floating-live-rehearsal.e2e.test.ts proves
 * on the saved pages) in the installed Google Chrome, window visible:
 *  - the main pass on the demo profile (data/demo-profile, or VG_LIVE_PROFILE=<dir>), where you have answered
 *    the cookie banner yourself: /en/services and /ar/services in states S1, S2, S5, S3 and S4, /en/home in
 *    S1 and S2, at 1366×900 and then at 375×812; then S7, the reimagined view (phase 4c), on the same loads:
 *    on /en/services the composer, spotlight's view with the Pocket peeking, the guide listening, the composer
 *    over the view, canvas's and streaming's previews in the box and Vodafone's menu over the view, on /en/home
 *    (another theme) the composer, the view and the menu;
 *  - the banner pass on a throwaway profile, where OneTrust's banner shows: S1 on /en/services and
 *    /ar/services at both sizes, with no press at all.
 * Every cell is measured with S16's module and held to its rules a to h, and to the rule that none of our
 * controls overlaps Vodafone's other fixed or sticky elements, S7's cells to S7's rules too; a screenshot of each cell (and of each
 * ?aixc=off baseline) and the whole report as JSON (floating-live.json) go to VG_LIVE_OUT. The report holds the
 * gate's reading on every page with the layer (report.gates: coverage, sections, the launcher's decision) and the
 * corners' safe zones in every cell (cell.view: the controls in each bottom corner and their size; in a view, the
 * zones the shell wrote on the box against the same zones measured from the controls).
 *
 * Close any `npm run demo:live` first (the demo profile can be open in one browser at a time), then:
 *
 *   VG_LIVE=1 VG_LIVE_OUT=<a directory outside the repository> node --test --test-force-exit --test-timeout=1800000 tests/live/floating.live.test.ts
 *
 * Vodafone answers this Mac only through the installed Google Chrome, so both passes use it (there is no
 * Chromium fallback for this test). VG_LIVE_OUT inside the repository is refused; without it the run writes
 * to a new folder in the system's temporary directory and prints where.
 *
 * Page loads: exactly 20 when nothing stops the run (12 in the main pass, 8 in the banner pass: two per page
 * and size, ?aixc=off then the layer), never more than 24, at least 1.2 s apart. A bot check, a challenge
 * page, an HTTP error, a page that does not open or a page load the run did not start stops it at once;
 * nothing is retried (runbook §0).
 *
 * What it never does: sign in, type anything, answer or touch the cookie banner, move or restyle the
 * accessibility button, press anything of Vodafone's (only our chips, the Pocket button, the guide's mic,
 * the trail's pill and its consent's allow, the journey's close, the album's Back, and in S7 Reimagine's own
 * buttons, each after a hit test; the one exception is S7's menu cell: at 375 a press on Vodafone's burger
 * opens its phone menu (never a second press: the next page load closes it), at 1366 its dropdown is opened by a
 * hover, no press),
 * press anything while the banner shows, or write Vodafone's cookies or storage. The microphone and speech
 * are stand-ins: nothing listens to the room and nothing is spoken aloud. At the end of each page it removes
 * what the layer made there in this run: the sticker, and the trail's journey and consent if this run gave it.
 *
 * 'skipped: banner' means the banner showed in the demo profile: the main pass stopped pressing. Answer the
 * banner yourself in that window (reject non-essential cookies), close it, run the test again.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'

import type { Manifest } from '#kb'
import { loadPlatformConfig, loadSiteConfig, ROOT, type SiteConfig } from '#shared/config.ts'

import { buildSdk } from '../../packages/sdk/build.ts'
import { createGateway } from '../../services/gateway/server.ts'
import { createServices } from '../../services/index.ts'
import { launchDemoBrowser } from '../../tools/demo-browser.ts'
import { SPEECH_STUB } from '../e2e/browser.ts'
import { cornersLine } from '../e2e/floating-controls.ts'
import { ACTORS_TEST, DESKTOP, type FloatingReport, MAX_LOADS, MIC_STAND_IN, outsideRepo, PLAN, plannedLoads, runFloatingMatrix } from './floating-walk.ts'

const LIVE = process.env.VG_LIVE === '1'
const PORT = 4461
const WEB = 'https://web.vodafone.com.eg'
const PAUSE_MS = 1200
/** Speech recognition and synthesis stood in (nothing listens, nothing is spoken), the microphone silent, the actors seeded. */
const INIT = [SPEECH_STUB, MIC_STAND_IN, ACTORS_TEST]

let services: Awaited<ReturnType<typeof createServices>>
let gateway: ReturnType<typeof createGateway>
let site: SiteConfig
let profileDir: string

before(async () => {
	if (!LIVE) return
	await buildSdk({ minify: true })
	const platform = loadPlatformConfig({ ...process.env, VG_VOICETUT_URL: '', VG_STORE: 'memory', VG_PORT: String(PORT), VG_PUBLIC_URL: `http://127.0.0.1:${PORT}` })
	site = loadSiteConfig(path.join(platform.sitesDir, 'vodafone-eg.yaml'))
	// S4 needs the trail, as `npm run demo:live -- --trail` turns it on for one session.
	site.trail.enabled = true
	services = await createServices({ platform, sites: new Map([[site.id, site]]) })
	const m = JSON.parse(fs.readFileSync(path.join(ROOT, 'config/kb/vodafone-eg.manifest.json'), 'utf8')) as Manifest
	await services.store.putKbVersion(site.id, m)
	await services.store.activateKb(site.id, m.version.id)
	gateway = createGateway({ services })
	await gateway.listen(PORT)
	profileDir = process.env.VG_LIVE_PROFILE ? path.resolve(process.env.VG_LIVE_PROFILE) : path.join(platform.dataDir, 'demo-profile')
})

after(async () => {
	await gateway?.close()
	await services?.close()
})

/** The installed Google Chrome, window visible, on `profile` (a throwaway one when undefined); never Playwright's Chromium. */
const chrome = (profile: string | undefined) => async () => {
	const said: string[] = []
	const b = await launchDemoBrowser({ site, gatewayUrl: `http://127.0.0.1:${PORT}`, start: 'about:blank', profileDir: profile, headless: false, channel: 'chrome', xray: 'off', viewport: DESKTOP, initScripts: INIT, log: (m) => (said.push(m), console.log(`# browser: ${m}`)) })
	if (said.some((m) => /Falling back to Chromium|Browser: Chromium/.test(m))) {
		await b.close()
		throw new Error('Google Chrome did not start: this test runs only in the installed Google Chrome (Vodafone answers this Mac through it alone); nothing was opened')
	}
	return { page: b.page, close: () => b.close() }
}

const print = (r: FloatingReport) => {
	console.log(`# report: ${JSON.stringify({ outcome: r.outcome, main: r.main, banner: r.banner, message: r.message, loads: r.loads.map((l) => `${l.how} ${l.url} ${l.status}`), presses: r.presses.length, vodafone: r.vodafone.map((x) => `${x.how} ${x.what}`), cells: r.cells.length, violations: r.violations, notes: r.notes, cleanup: r.cleanup, environments: r.environments })}`)
	for (const g of r.gates) console.log(`# the gate: ${g.pass} ${g.page} ${g.viewport}: coverage ${g.coverage ?? 'not read'} (${g.usable ?? '-'} of ${g.cards ?? '-'} cards usable), sections ${JSON.stringify(g.sections)}, ${g.passes ? 'passes' : `does not pass (${g.why})`}; the launcher ${g.allowed === null ? 'not started' : g.allowed ? 'open' : 'closed'}`)
	for (const c of r.cells) if (c.view) console.log(`# corners: ${c.pass} ${c.page} ${c.viewport} ${c.state}: ${cornersLine(c.view)}`)
	console.log(`# the screenshots and floating-live.json are in ${r.out}`)
}

test('live: the floating-control matrix on /en/services, /ar/services and /en/home at 1366×900 and 375×812 (S7, the reimagined view, on /en/services and /en/home), the banner answered and on a first visit', { skip: !LIVE && 'set VG_LIVE=1', timeout: 1_800_000 }, async (t) => {
	const out = outsideRepo(process.env.VG_LIVE_OUT || fs.mkdtempSync(path.join(os.tmpdir(), 'vg-floating-live-')))
	console.log(`# output: ${out}; ${plannedLoads(PLAN)} page loads planned, at most ${MAX_LOADS}`)
	const report = await runFloatingMatrix({ base: WEB, out, pauseMs: PAUSE_MS, openMain: chrome(profileDir), openBanner: chrome(undefined) }).catch((e) => {
		if (e?.report) print(e.report)
		throw e
	})
	print(report)
	assert.ok(report.loads.length <= MAX_LOADS, `at most ${MAX_LOADS} page loads (${report.loads.length})`)
	assert.equal(report.presses.filter((p) => p.pass === 'banner').length, 0, 'no press in the banner pass')
	// Vodafone's: only its menu, in S7, a hover on its navigation's dropdown or a press on its burger; never in the banner pass.
	assert.ok(
		report.vodafone.every((x) => x.pass === 'main' && (x.how === 'hover' ? /^Vodafone's menu item /.test(x.what) : x.what === "Vodafone's phone menu (its burger)")),
		JSON.stringify(report.vodafone),
	)
	// The burger pressed only to open its menu: at most once per page S7 walks at 375 (/en/services, /en/home), never to close it.
	const burger = report.presses.filter((p) => /^Vodafone's/.test(p.what))
	assert.ok(burger.length <= 2 && burger.every((p) => / to open its menu$/.test(p.what)), burger.map((p) => p.what).join(' | '))
	assert.ok(
		report.cells.every((c) => c.screenshot),
		'a screenshot for every cell',
	)
	assert.equal(report.banner, 'done', 'the banner pass ran')
	assert.deepEqual(report.violations, [], 'every cell keeps the rules')
	if (report.main === 'skipped: banner') return t.skip(`skipped: banner. ${report.message}`)
	assert.equal(report.main, 'done', 'the main pass ran')
	assert.equal(report.loads.length, plannedLoads(PLAN), 'the planned page loads, no more')
	assert.ok(
		report.cleanup.every((l) => !/NOT reset|could not be removed/.test(l)),
		report.cleanup.join(' | '),
	)
})
