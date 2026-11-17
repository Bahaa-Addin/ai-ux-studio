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

import * as esbuild from 'esbuild'

import { AIXC_ENTRY, aixcBuildOptions, buildSdk, EXPERIENCES } from '../../packages/sdk/build.ts'

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
 * (dynamic imports), never in it. 8,000 bytes on 2026-11-17 (W2-A: PageHost hides #main-content laid out at
 * its width, no height, transparent and inert, and gives back its style, inert and hidden attributes exactly,
 * so Owl's AutoRefresh never fades Vodafone's carousels out under the album; 7,886 before), so 7.875 KB.
 * 8,003 bytes on 2026-11-17 (phase 4a groundwork, from 7,999: the live adapter's marks scoped to #main-content
 * +4; normalizeContentModel moved to src/host/model.js +0, so content-index.js, which Reimagine's chunks will
 * import, stays out of the core: with a demo chunk importing it the core measured 8,852 bytes before the move,
 * 8,027 after, the same as with a chunk that does not import it).
 */
const AIXC_CORE_BUDGET = 7.875 * 1024

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
 *
 * 2026-11-17, the fixes of the live review (handoff 2026-11-17 §5), each measured from 32,155 bytes the same
 * day: four @font-face aliases for Vodafone's own bold and light files (F1) +139; the turn keeps Vodafone's
 * header uncovered (its layers cut at the header's bottom on every frame, the copy without what is fixed on
 * the live page, a pocketed card's liner in the closing copy, the chips shown the frame the page comes back;
 * F2, F3) +321. The portal's chunk 6,436 bytes (from 6,450: its stacks are now pocket.css's variables).
 *
 * 2026-11-17: the chips in their own chunk: Pocket 33,912 -> 30,118 bytes, chips 4,616. The chips' chunk
 * (./demos/chips.js with the overlay, its placement and chips-overlay.css as minified text) is asked for first
 * thing in the Pocket's start where chips can show (the website, coverage at least the gate), or when a later
 * reading lets them show; the Pocket's chunk keeps the chip, the liner and the lift (pocket.js decorate,
 * pocket.css), which the clone draws in its cards too. Budgets the measures rounded up to the next quarter KB:
 * the Pocket's 29.5 KB, back under the 32,000 bytes asked for; the chips' 4.75 KB.
 *
 * 2026-11-17, phase 4a groundwork: Vodafone's faces and our stacks in a stylesheet of their own
 * (src/host/vodafone-faces.css, ensureCss('vodafone-faces') before 'pocket'), so Reimagine's chunks load the
 * same sheet by the same name: the Pocket 30,143 bytes (from 30,118). Once another chunk imports that sheet,
 * esbuild moves it into a chunk of its own that both import: measured with a probe chunk the same day, that
 * chunk 364 bytes and the Pocket 30,284, over its budget by 76: measure again when Reimagine lands.
 */
/**
 * Reimagine on Vodafone's pages (phase 4a, ADR-0076): the launcher's chunk (./demos/reimagine.js: the gate, the
 * button, its place under the trail's pill, its stylesheet as text), which the core loads at idle where the site
 * enables the demo, and the shell's (./demos/reimagine/shell.js), which the launcher loads on its first press.
 * The launcher imports nothing the core or the Pocket imports (its words and the website check inline), so no
 * shared chunk comes with the core. Measured 2026-11-17 (stage 1): the launcher 2,778 bytes gzipped; with its tuck
 * the same day (it goes up off the screen with the trail's pill, and without a pill below the top of the page:
 * the stylesheet's transform and transition, the watch on the pill's class, the focus listeners) 3,029, so 3 KB;
 * after the review the same day (it finds the pill as it mounts, before the trail says it is up; it gives way to
 * the login card of a signed-out visitor) 3,151, so 3.125 KB, the smallest step that fits.
 * The shell's stub 100 bytes, so 0.125 KB (stage 2 measures the real shell and sets its budget). The core took
 * the DEMOS line within its budget (8,003 -> 8,026 bytes); the chips' chunk 4,616 -> 4,683 with the launcher in
 * their obstacle list, 4,801 after the review (a control hidden mid-page keeps its place at the top; measured
 * again there when one came or went); the Pocket's unchanged (30,143).
 *
 * 2026-11-17, stage 2 (the shell): the shell's chunk (./demos/reimagine/shell.js with the box's measures, its words,
 * live.css as text, the template cards, the validator, the content index, and what it shares with the experiences:
 * shared.js and dom.js, the clone's copy in i18n.js, the faces' sheet) 24,973 bytes gzipped, so 24.5 KB; i18n.js
 * (8,314) and the faces' sheet (364) are chunks the Pocket's chunk loads too, so on a page where the Pocket runs they
 * are there before the press. Each experience a chunk of its own the shell loads when its template is chosen, with
 * its renderer, experience-wrap.js and its stylesheets as text (vodafone.css shared by both): magazine 10,508 bytes,
 * so 10.5 KB; spotlight 7,733, so 7.75 KB. The Pocket's chunk 30,143 -> 30,393 bytes: i18n.js and the faces' sheet,
 * now shared with Reimagine's chunks, are files of their own in its closure (30,336 with its own code unchanged,
 * +193), and its composer handle and the turning copy's box scroll (+57); its budget the smallest dated step that
 * fits, 29.75 KB.
 *
 * 2026-11-17, stage 2's review: the clone composer's own words (its prompt, Gemini, key and model, 51 entries) moved
 * from i18n.js to src/aixc/composer-words.js, which only the clone's controller imports: the i18n.js chunk 8,314 ->
 * 6,171 bytes, so the Pocket's chunk 30,393 -> 28,249 and the shell's 24,973 -> 22,828; then the review's fixes in
 * the shell (a template still loading dropped when the reader moves on, the composer closed on the album and on
 * Original and never in Vodafone's header band, the box's rest read again on a resize) 22,980. The launcher 3,151 ->
 * 3,192 (one press at a time, busy meanwhile). Magazine 10,505 and spotlight 7,731 bytes. Every budget unchanged.
 */
const REIMAGINE_BUDGETS: Record<string, number> = {
	'src/host/demos/reimagine.js': 3.125 * 1024,
	'src/host/demos/reimagine/shell.js': 24.5 * 1024,
	'src/host/demos/reimagine/magazine.js': 10.5 * 1024,
	'src/host/demos/reimagine/spotlight.js': 7.75 * 1024,
}
/**
 * Never in a Reimagine chunk on live pages (templates only, owner 2026-11-10; the credits as comments, 2026-11-17):
 * Gemini's endpoint and header, the stored key and model, and any word that names Gemini or its key, in English or
 * Arabic (مفتاح, key: the clone composer's copy lives in experiences/src/aixc/composer-words.js, never in the i18n.js
 * the shell shares with the Pocket); Google Fonts; CodePen. Case-sensitive.
 */
const REIMAGINE_FORBIDDEN = /generativelanguage|aixc-key|aixc-model|fonts\.googleapis|x-goog-api-key|codepen|Gemini|API key|مفتاح/

const AIXC_DEMO_BUDGETS: Record<string, number> = {
	'src/host/demos/pocket.js': 29.75 * 1024,
	'src/host/demos/chips.js': 4.75 * 1024,
	'src/host/demos/journey.js': 8.75 * 1024,
	// 2026-11-17 F6b (the actors make room when a fixed control comes or goes mid-album: obstacles.js's watch, the refit, the eased move): 45,004 bytes, 44,277 before; rounded up to a quarter KB, 44 KB.
	// 2026-11-17: the rest mode (F11), approved by the owner after the side-by-side: 48,866 bytes (45,004 with F6b alone); rounded up to a quarter KB, 47.75 KB.
	// 2026-11-17, its review's fixes (input ends the rest before it changes what the rest ran on, a tick checks the rest may go on, the rider fitted by named points): 49,209 bytes; the next quarter KB.
	'src/host/demos/actors.js': 48.25 * 1024,
	'src/host/demos/portal.js': 6.5 * 1024,
	'src/pocket/portal/controller.js': 17.5 * 1024,
	...REIMAGINE_BUDGETS,
}

/** Which chunk loads a demo chunk on intent (a dynamic import), by entry; the core unless named here. */
const AIXC_LOADED_BY: Record<string, string> = {
	'src/host/demos/chips.js': 'src/host/demos/pocket.js',
	'src/host/demos/journey.js': 'src/host/demos/pocket.js',
	'src/host/demos/actors.js': 'src/host/demos/pocket.js',
	'src/host/demos/portal.js': 'src/host/demos/pocket.js',
	'src/pocket/portal/controller.js': 'src/host/demos/portal.js',
	// Reimagine (phase 4a, ADR-0076): the core loads the launcher at idle; the launcher loads the shell on its first press.
	'src/host/demos/reimagine/shell.js': 'src/host/demos/reimagine.js',
	// The shell loads each experience when its template is chosen (stage 2).
	'src/host/demos/reimagine/magazine.js': 'src/host/demos/reimagine/shell.js',
	'src/host/demos/reimagine/spotlight.js': 'src/host/demos/reimagine/shell.js',
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
	// content-index.js (the composer's and the experiences' index; these property names survive minifying) and Vodafone's faces never
	// come with the core: its model check is src/host/model.js, so a chunk that imports the index never makes it a chunk the core loads.
	for (const f of eager) assert.doesNotMatch(fs.readFileSync(path.join(aixc, f), 'utf8'), /serviceIds|promotionIds|sourceOrder|aixc-vodafone-/, `no content-index.js and no faces in the core (${f})`)
	assert.doesNotMatch(fs.readFileSync(path.join(dist, 'guide.js'), 'utf8'), /experience-output|aixc-viewbar|__aixc/, 'nothing of the layer in guide.js')
	// The check above passes on a build where nothing imports content-index.js. Reimagine's chunks will, so build once more in memory
	// with a probe entry that does (as they will) and walk the core's static imports in that build's metafile: the index must land in
	// a chunk of its own, never in one the core loads (which it would if the core's model check still lived in the index's module).
	const probeSrc = path.join(EXPERIENCES, 'src/host/demos/probe-content-index.js')
	const probe = await esbuild.build({
		...aixcBuildOptions({ minify: true }),
		write: false,
		entryPoints: { aixc: AIXC_ENTRY, probe: 'probe-content-index' },
		plugins: [
			{
				name: 'probe',
				setup(b) {
					b.onResolve({ filter: /^probe-content-index$/ }, () => ({ path: probeSrc, namespace: 'probe' }))
					b.onLoad({ filter: /.*/, namespace: 'probe' }, () => ({
						contents: "import { buildContentIndex } from '../../aixc/content-index.js'\nexport const probe = buildContentIndex",
						loader: 'js',
						resolveDir: path.dirname(probeSrc),
					}))
				},
			},
			...(aixcBuildOptions({ minify: true }).plugins ?? []),
		],
	})
	const outputs = probe.metafile?.outputs ?? {}
	const byName = (name: string) => Object.entries(outputs).find(([f]) => path.basename(f) === name)
	const probeCore = new Set<string>()
	const walk = (key: string | undefined) => {
		if (!key || probeCore.has(key)) return
		probeCore.add(key)
		for (const i of outputs[key]?.imports ?? []) if (i.kind === 'import-statement' && !i.external) walk(i.path)
	}
	walk(byName('aixc.js')?.[0])
	assert.ok(probeCore.size >= 1, 'the probe build has aixc.js')
	const indexChunks = Object.keys(outputs).filter((f) => f.endsWith('.js') && probe.outputFiles?.find((o) => o.path === path.resolve(f))?.text.match(/serviceIds|promotionIds|sourceOrder/))
	assert.ok(indexChunks.length > 0, 'the probe build carries content-index.js somewhere (else this proves nothing)')
	for (const f of indexChunks) assert.ok(!probeCore.has(f), `content-index.js is in ${f}, which the core loads statically: a chunk that imports the index must not move it into the core`)
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
	// Vodafone's faces come with the Pocket as a sheet of their own name (src/host/vodafone-faces.css), which Reimagine's chunks load too.
	assert.match(pocket, /vodafone-faces/, 'the Pocket asks for the faces\' sheet by its name')
	const pocketClosure = closure(manifest.files.find((x) => x.entry === 'src/host/demos/pocket.js')?.file ?? '').map((f) => fs.readFileSync(path.join(aixc, f), 'utf8'))
	for (const face of ['aixc-vodafone-bold-en', 'aixc-vodafone-bold-ar', 'aixc-vodafone-light-en', 'aixc-vodafone-light-ar', '--pocket-regular:', '--pocket-bold:', '--pocket-light:']) assert.ok(pocketClosure.some((src) => src.includes(face)), `${face} loads with the Pocket`)
	// The chips (S6) are a chunk of their own, with their stylesheet as text; the Pocket's chunk only names their region (the page turn's copy).
	const chips = fs.readFileSync(path.join(aixc, manifest.files.find((f) => f.entry === 'src/host/demos/chips.js')?.file ?? ''), 'utf8')
	assert.match(chips, /pocket-chips\[data-aixc\]/, 'the chips\' stylesheet is in their chunk as text')
	assert.match(chips, /pocket-cta--icon/, 'the overlay is in the chips\' chunk')
	for (const f of closure(manifest.files.find((x) => x.entry === 'src/host/demos/pocket.js')?.file ?? '')) assert.doesNotMatch(fs.readFileSync(path.join(aixc, f), 'utf8'), /pocket-chips\[data-aixc\]|pocket-cta--icon/, `no chips overlay or its stylesheet with the Pocket (${f}): they load on their own where chips can show`)
	// Reimagine (phase 4a): the launcher imports nothing (a module it shared with the core or the Pocket would become a
	// chunk the core loads); neither it nor the shell carries anything of Gemini, a key, Google Fonts or CodePen.
	const launcher = manifest.files.find((f) => f.entry === 'src/host/demos/reimagine.js')
	assert.ok(launcher, 'the launcher is a chunk of its own')
	assert.deepEqual(launcher.imports.filter((i) => i.kind === 'import-statement'), [], 'the launcher\'s chunk imports no other chunk statically')
	assert.match(fs.readFileSync(path.join(aixc, launcher.file), 'utf8'), /aixc-launcher/, 'the launcher\'s button and stylesheet are in its chunk')
	// The shell carries no experience: each renderer and its stylesheet come with their own chunk, on the template's choice.
	for (const f of closure(manifest.files.find((x) => x.entry === 'src/host/demos/reimagine/shell.js')?.file ?? '')) assert.doesNotMatch(fs.readFileSync(path.join(aixc, f), 'utf8'), /aixc-magazine|sp-stage|mag-cover/, `no experience in the shell's closure (${f})`)
	assert.match(fs.readFileSync(path.join(aixc, manifest.files.find((f) => f.entry === 'src/host/demos/reimagine/shell.js')?.file ?? ''), 'utf8'), /aixc-composer/, 'the composer is in the shell\'s chunk')
	for (const entry of Object.keys(REIMAGINE_BUDGETS))
		for (const f of closure(manifest.files.find((x) => x.entry === entry)?.file ?? '')) assert.doesNotMatch(fs.readFileSync(path.join(aixc, f), 'utf8'), REIMAGINE_FORBIDDEN, `nothing of Gemini, a key, Google Fonts or CodePen in ${f} (${entry})`)
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
