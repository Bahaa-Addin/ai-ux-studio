/**
 * Size budget for the main SDK script (PRD §9, T-504): guide.js ≤ 20 KB (20,480 bytes) gzipped,
 * voice UI included. The X-ray drawer, page watch and the fallback agent load on demand.
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
