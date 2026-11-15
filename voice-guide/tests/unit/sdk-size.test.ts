/**
 * Size budget for the main SDK script (PRD §9, T-504, ADR-0057): guide.js ≤ 21 KB (21,504 bytes) gzipped,
 * voice UI included. The X-ray drawer, page watch, the fallback agent and the Exploration Trail
 * load on demand; the trail's recorder and replayer are chunks of their own (ADR-0035).
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { gzipSync } from 'node:zlib'

import { ROOT } from '#shared/config.ts'

import { buildSdk } from '../../packages/sdk/build.ts'

const BUDGET = 21 * 1024

test('guide.js stays within 21 KB gzipped; on-demand parts are separate files', async () => {
	await buildSdk({ minify: true })
	const dist = path.join(ROOT, 'packages/sdk/dist')
	const gz = (f: string) => gzipSync(fs.readFileSync(path.join(dist, f)), { level: 9 }).length
	const main = gz('guide.js')
	assert.ok(main <= BUDGET, `guide.js is ${main} bytes gzipped, over the ${BUDGET}-byte budget`)
	for (const f of ['xray.js', 'watch.js', 'agent.js']) assert.ok(fs.existsSync(path.join(dist, f)), `${f} is built`)
	const src = fs.readFileSync(path.join(dist, 'guide.js'), 'utf8')
	assert.doesNotMatch(src, /\.turns \.turn|class XrayModel|pushManager\.subscribe/, 'X-ray and push code are not in the main script')
})

/**
 * Exploration Trail budgets (ADR-0035), measured 2026-11-03 and set a little above. trail.js raised on purpose
 * on 2026-11-15 (S15, ADR-0050 §6): the demo kit's seed() and reset(), with the strict check of a sample
 * journey, took it from 29,743 to 32,061 B; the budget is that rounded up to a quarter KB.
 */
const TRAIL_BUDGETS: Record<string, number> = { 'trail.js': 31.5 * 1024, 'trail-record.js': 26 * 1024, 'trail-replay.js': 72 * 1024 }

test('the trail adds only a gate to guide.js; rrweb lives in its own on-demand chunks', async () => {
	await buildSdk({ minify: true })
	const dist = path.join(ROOT, 'packages/sdk/dist')
	const read = (f: string) => fs.readFileSync(path.join(dist, f), 'utf8')
	const gz = (f: string) => gzipSync(fs.readFileSync(path.join(dist, f)), { level: 9 }).length
	for (const [f, max] of Object.entries(TRAIL_BUDGETS)) assert.ok(gz(f) <= max, `${f} is ${gz(f)} bytes gzipped, over ${max}`)
	const guide = read('guide.js')
	assert.doesNotMatch(guide, /takeFullSnapshot|rrweb|Replayer|vg-trail|tr-pill|IndexedDB|indexedDB/, 'no recorder, replayer, trail UI or storage in guide.js')
	const trail = read('trail.js')
	assert.doesNotMatch(trail, /takeFullSnapshot|rrweb-paused|createSandboxedIframe|MutationBuffer/, 'no rrweb in trail.js (its CSS only names the replayer elements)')
	assert.match(read('trail-record.js'), /takeFullSnapshot/)
	assert.doesNotMatch(read('trail-record.js'), /replayer-wrapper|createSandboxedIframe/, 'the recorder chunk has no replayer')
	const replay = read('trail-replay.js')
	assert.match(replay, /createSandboxedIframe|allow-same-origin/)
	assert.doesNotMatch(replay, /takeFullSnapshot/, 'the replay chunk has no recorder')
	// Our wrapper never asks for the unsafe paths (the strings exist inside rrweb itself, as options it checks).
	const wrapper = fs.readFileSync(path.join(ROOT, 'packages/sdk/src/trail/replay.ts'), 'utf8')
	assert.match(wrapper, /UNSAFE_replayCanvas: false/)
	assert.doesNotMatch(wrapper, /UNSAFE_allowUnprotectedRebuild|UNSAFE_replayCanvas: true|allow-scripts/)
	assert.doesNotMatch(fs.readFileSync(path.join(ROOT, 'packages/sdk/src/trail/recorder.ts'), 'utf8'), /getRecordConsolePlugin|getRecordNetworkPlugin|recordCanvas: true/)
})

/**
 * The experience layer (ADR-0048): its own script beside guide.js, ES modules. The core is aixc.js
 * and every chunk it imports statically (the browser loads those with it). Measured: 1,791 bytes
 * gzipped on 2026-11-10 (phase 1: settings, PageHost, guard); 5,343 on 2026-11-11 (phase 2 adds the
 * live adapter and its recognisers, which decide what the layer can offer on a page); 6,933 and then 7,072 on
 * 2026-11-12 (the review's fixes: links resolved against the page, unread card-like blocks counted
 * in coverage, two more recogniser rows, re-reading when the page changes); 7,647 on 2026-11-13
 * (phase 3 S5: the demo loader and ensureCss, which put a demo's CSS on the page). The budget is
 * set a little above and raised on purpose when a phase adds to the core. Demos load on intent
 * (dynamic imports), never in it.
 */
const AIXC_CORE_BUDGET = 7.75 * 1024

/**
 * Each demo chunk with what it imports statically, by the source module it is the entry of
 * (ADR-0052). Measured 2026-11-13: the Pocket's album on live pages (S5: pocket.js, curl.js, its
 * store and record, pocket.css as minified text, the UI copy in both languages) 24,830 bytes
 * gzipped, without the mascot, the drone or the portal, which are passed in only where they run;
 * 29,287 bytes the same day with S6 ("Pocket it" on Vodafone's cards: the overlay, its placement,
 * clipping and observers, the live chip's look; ADR-0052 §10-§14); 29,801 bytes on 2026-11-14 with
 * the review's fixes (AIXC-107 to AIXC-118: clips read again, slots cut to what shows, focus kept);
 * 31,522 bytes on 2026-11-14 with S7 (one Pocket across pages: the album's groups, the page read again
 * against its stickers, the note on a sticker whose card is gone; ADR-0051 §7 and §8).
 * Raised on purpose; a chunk of its own for the chips, loaded only where the coverage gate lets them
 * show, is the follow-up. 31,715 bytes on 2026-11-14 with S10 (the Pocket finds a trail host it can
 * claim and loads the journey's chunk).
 *
 * The journey in the live Pocket (S10, ADR-0050 §2-§3) is a chunk of its own that the Pocket's chunk
 * loads, never the core: journey.js and journey.css as minified text, 8,226 bytes gzipped on
 * 2026-11-14; budget a little above.
 *
 * The mascot and the drone on live pages (S12) are a chunk of their own that the Pocket's chunk loads
 * (at idle where something is pocketed or chips show, at once on a first press): actors.js with
 * pocket-actors.js, the cursor, the rigs as data: URLs and both stylesheets as minified text, 41,871
 * bytes gzipped on 2026-11-14 before the S12 changes to the actors themselves, without what it shares
 * with the Pocket's chunk (already loaded when it loads; 8,209 bytes then). Budget the measure rounded
 * up to a quarter KB, raised on purpose when the actors grow. The Pocket's chunk with its stand-in for
 * them measured 31,718 bytes (the code it shares with the actors now a chunk of its own). 44,170 bytes
 * on 2026-11-14 with S12's changes to the actors (the left corner's ride across, the fixed floor, wrap
 * and mark on every node, ./obstacles.js, and the album's inline end: mascot and drone on the left of a
 * right-to-left album), so 43.25 KB; the Pocket's chunk 31,952 bytes with the actors' side seam.
 *
 * The portal on live pages (S13, experiences ADR-0005) is two chunks: the portal's (./demos/portal.js with
 * the clone's portal.js, config, interceptor, history and portal.css as minified text), which the Pocket's
 * chunk loads when the album opens or at once on Back to it, 5,627 bytes gzipped on 2026-11-14 with the
 * code it shares with the scene; and the scene's (controller.js with the wall, the hall, the gate, the
 * handoff and the curves), which the portal's chunk loads, 15,281 bytes. Budgets the measures rounded up
 * to the next quarter KB, before the portal's live mode (T1) lands: measure again then. Measured again on
 * 2026-11-14 with the live mode (sticker scope, the fetch-once frame, the wall's stubs and marks, the
 * catch-all wrap, the 'portal-start' checkpoint): the portal's chunk 6,450 bytes, so 6.5 KB; the scene's
 * 17,667 bytes, so 17.5 KB (raised on purpose: the live mode's handoff and wall). The Pocket's chunk
 * with the portal's stand-in 32,102 bytes (the stand-in and the import, about 150 bytes), so 31.5 KB:
 * raised on purpose, over the 32,000 asked for (the lead's call).
 */
const AIXC_DEMO_BUDGETS: Record<string, number> = {
	'src/host/demos/pocket.js': 31.5 * 1024,
	'src/host/demos/journey.js': 8.75 * 1024,
	'src/host/demos/actors.js': 43.25 * 1024,
	'src/host/demos/portal.js': 6.5 * 1024,
	'src/pocket/portal/controller.js': 17.5 * 1024,
}

/** Which chunk loads a demo chunk on intent (a dynamic import), by entry; the core unless named here. */
const AIXC_LOADED_BY: Record<string, string> = {
	'src/host/demos/journey.js': 'src/host/demos/pocket.js',
	'src/host/demos/actors.js': 'src/host/demos/pocket.js',
	'src/host/demos/portal.js': 'src/host/demos/pocket.js',
	'src/pocket/portal/controller.js': 'src/host/demos/portal.js',
}

test('the experience layer is its own small script; guide.js carries none of it', async () => {
	const sizes = await buildSdk({ minify: true })
	const dist = path.join(ROOT, 'packages/sdk/dist')
	const aixc = path.join(dist, 'aixc')
	assert.ok(sizes['aixc/aixc.js'], 'aixc.js is built (experiences/src/host/index.js exists)')
	const manifest = JSON.parse(fs.readFileSync(path.join(aixc, 'manifest.json'), 'utf8')) as { files: { file: string; entry: string | null; imports: { file: string; kind: string }[] }[] }
	assert.equal(manifest.files.find((f) => f.file === 'aixc.js')?.entry, 'src/host/index.js')
	for (const f of manifest.files) assert.ok(fs.existsSync(path.join(aixc, f.file)), `${f.file} in the manifest is built`)
	// What loads with the core: aixc.js and, transitively, every chunk it imports statically.
	const eager = new Set(['aixc.js'])
	for (const file of eager) for (const i of manifest.files.find((f) => f.file === file)?.imports ?? []) if (i.kind === 'import-statement') eager.add(i.file)
	const core = [...eager].reduce((sum, f) => sum + gzipSync(fs.readFileSync(path.join(aixc, f)), { level: 9 }).length, 0)
	assert.ok(core <= AIXC_CORE_BUDGET, `the core (${[...eager].join(', ')}) is ${core} bytes gzipped, over the ${AIXC_CORE_BUDGET}-byte budget`)
	for (const f of eager) assert.doesNotMatch(fs.readFileSync(path.join(aixc, f), 'utf8'), /pocket-peek|pocket-chips|pocket-journey|aixc-composer|pz-world|tips-coach|vf-portal/, `no demo code in the core (${f})`)
	assert.doesNotMatch(fs.readFileSync(path.join(dist, 'guide.js'), 'utf8'), /experience-output|aixc-viewbar|__aixc/, 'nothing of the layer in guide.js')
	// Each demo chunk within its budget; a file next to a module (new URL('./x', import.meta.url)) would 404 on the gateway, which serves only .js.
	const closure = (file: string) => {
		const files = new Set([file])
		for (const f of files) for (const i of manifest.files.find((x) => x.file === f)?.imports ?? []) if (i.kind === 'import-statement') files.add(i.file)
		return [...files]
	}
	for (const [entry, max] of Object.entries(AIXC_DEMO_BUDGETS)) {
		const chunk = manifest.files.find((f) => f.entry === entry)
		assert.ok(chunk, `${entry} is built as its own chunk`)
		const loader = AIXC_LOADED_BY[entry]
		const by = loader ? manifest.files.find((f) => f.entry === loader) : manifest.files.find((f) => f.file === 'aixc.js')
		assert.ok(by?.imports.some((i) => i.file === chunk.file && i.kind === 'dynamic-import'), `${loader ?? 'the core'} loads ${entry} on intent`)
		if (loader) assert.ok(!manifest.files.find((f) => f.file === 'aixc.js')?.imports.some((i) => i.file === chunk.file), `the core does not load ${entry}`)
		const files = closure(chunk.file)
		// What its loaders brought already (the one that loads it, and the ones that loaded that) is not counted again.
		const had = new Set(eager)
		for (let at = loader; at; at = AIXC_LOADED_BY[at]) for (const f of closure(manifest.files.find((x) => x.entry === at)?.file ?? '')) had.add(f)
		const gz = files.filter((f) => !had.has(f)).reduce((sum, f) => sum + gzipSync(fs.readFileSync(path.join(aixc, f)), { level: 9 }).length, 0)
		assert.ok(gz <= max, `${entry} (${files.join(', ')}) is ${gz} bytes gzipped, over its ${max}-byte budget`)
	}
	for (const f of manifest.files) assert.doesNotMatch(fs.readFileSync(path.join(aixc, f.file), 'utf8'), /new URL\(["'`]\.\//, `no asset beside a module in ${f.file}`)
	// The actors' rigs are data: URLs in their chunk (S12); only the core names import.meta.url, to find its own script and the gateway.
	for (const f of manifest.files) {
		const src = fs.readFileSync(path.join(aixc, f.file), 'utf8')
		assert.doesNotMatch(src, /new URL\([^)]*\.svg|new URL\([^)]*import\.meta\.url/, `no new URL(...) to a picture or beside a module in ${f.file}`)
		if (f.file !== 'aixc.js') assert.doesNotMatch(src, /import\.meta\.url/, `no import.meta.url in ${f.file}`)
	}
	const actors = fs.readFileSync(path.join(aixc, manifest.files.find((f) => f.entry === 'src/host/demos/actors.js')?.file ?? ''), 'utf8')
	assert.equal(actors.match(/data:image\/svg\+xml,%3Csvg /g)?.length, 2, 'the mascot\'s and the drone\'s rigs are in the actors\' chunk as data: URLs')
	assert.match(actors, /pocket-actor-floor/, 'the actors\' stylesheet is in their chunk as text')
	const pocket = fs.readFileSync(path.join(aixc, manifest.files.find((f) => f.entry === 'src/host/demos/pocket.js')?.file ?? ''), 'utf8')
	assert.doesNotMatch(pocket, /vf-portal|pocket-mascot|pocket-drone|generativelanguage|aixc-composer__/, 'the Pocket on live pages carries no portal, mascot, drone or composer (pocket.css only hides the composer\'s launcher)')
	assert.match(pocket, /pocket-chips/, 'the Pocket on live pages carries its chips (S6)')
	assert.doesNotMatch(pocket, /pocket-journey/, 'the journey is not in the Pocket\'s chunk: it loads only where a trail host can be claimed (S10)')
	for (const f of closure(manifest.files.find((x) => x.entry === 'src/host/demos/pocket.js')?.file ?? '')) assert.doesNotMatch(fs.readFileSync(path.join(aixc, f), 'utf8'), /pocket-mascot|pocket-drone|pocket-actor|data:image\/svg|vf-portal/, `no mascot, drone or portal with the Pocket (${f}): they load on their own (S12, S13)`)
})

/**
 * The guide's voice from VoiceTut (ADR-0047): its own on-demand chunk. guide.js only loads it when
 * the session says so (the gate cost 31 bytes gzipped on the Mac, 2026-11-10). voice-out.js measured
 * 1,969 bytes gzipped on 2026-11-11 (after the review fixes); budget a little above.
 */
const VOICE_OUT_BUDGET = 2304

test('the VoiceTut voice is its own chunk; guide.js only knows when to load it', async () => {
	await buildSdk({ minify: true })
	const dist = path.join(ROOT, 'packages/sdk/dist')
	const gz = gzipSync(fs.readFileSync(path.join(dist, 'voice-out.js')), { level: 9 }).length
	assert.ok(gz <= VOICE_OUT_BUDGET, `voice-out.js is ${gz} bytes gzipped, over ${VOICE_OUT_BUDGET}`)
	const guide = fs.readFileSync(path.join(dist, 'guide.js'), 'utf8')
	assert.match(guide, /voice-out/, 'guide.js names the chunk')
	assert.doesNotMatch(guide, /\/v1\/speech|__vgVoiceOut/, 'no VoiceTut playback code in guide.js')
	assert.match(fs.readFileSync(path.join(dist, 'voice-out.js'), 'utf8'), /\/v1\/speech/)
})
