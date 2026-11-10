/**
 * Size budget for the main SDK script (PRD §9, T-504): guide.js ≤ 20 KB (20,480 bytes) gzipped,
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

const BUDGET = 20 * 1024

test('guide.js stays within 20 KB gzipped; on-demand parts are separate files', async () => {
	await buildSdk({ minify: true })
	const dist = path.join(ROOT, 'packages/sdk/dist')
	const gz = (f: string) => gzipSync(fs.readFileSync(path.join(dist, f)), { level: 9 }).length
	const main = gz('guide.js')
	assert.ok(main <= BUDGET, `guide.js is ${main} bytes gzipped, over the ${BUDGET}-byte budget`)
	for (const f of ['xray.js', 'watch.js', 'agent.js']) assert.ok(fs.existsSync(path.join(dist, f)), `${f} is built`)
	const src = fs.readFileSync(path.join(dist, 'guide.js'), 'utf8')
	assert.doesNotMatch(src, /\.turns \.turn|class XrayModel|pushManager\.subscribe/, 'X-ray and push code are not in the main script')
})

/** Exploration Trail budgets (ADR-0035), measured 2026-11-03 and set a little above. */
const TRAIL_BUDGETS: Record<string, number> = { 'trail.js': 30 * 1024, 'trail-record.js': 26 * 1024, 'trail-replay.js': 72 * 1024 }

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
 * and every chunk it imports statically (the browser loads those with it); it measured 1,791 bytes
 * gzipped on 2026-11-10 (phase 1: settings, PageHost, guard); budget set a little above, raised on
 * purpose when a phase adds to the core. Demos load on intent (dynamic imports), never in it.
 */
const AIXC_CORE_BUDGET = 2 * 1024

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
	for (const f of eager) assert.doesNotMatch(fs.readFileSync(path.join(aixc, f), 'utf8'), /pocket-peek|aixc-composer|pz-world|tips-coach|vf-portal/, `no demo code in the core (${f})`)
	assert.doesNotMatch(fs.readFileSync(path.join(dist, 'guide.js'), 'utf8'), /experience-output|aixc-viewbar|__aixc/, 'nothing of the layer in guide.js')
})
