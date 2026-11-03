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
