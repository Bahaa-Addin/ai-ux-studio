/**
 * Ingests the fixture site (stand-in vision model, memory store) and writes the
 * manifest to tests/fixtures/demo-telco.manifest.json, so router and planner
 * tests run without a browser. Rerun after changing fixtures, overlay or builder.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { runIngest } from '#jobs/ingest-lib.ts'
import { loadPlatformConfig, loadSiteConfig, ROOT } from '#shared/config.ts'
import { MemoryStore } from '#shared/store/index.ts'

import { startMockVision } from '../../tests/helpers/mock-vision.ts'
import { startSiteServers } from '../site-server.ts'

const site = loadSiteConfig(path.join(ROOT, 'config/sites/demo-telco.yaml'))
const servers = await startSiteServers(site, { gatewayUrl: 'http://localhost:4400', inject: false })
const vision = await startMockVision()
try {
	const platform = { ...loadPlatformConfig({ VG_DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'vg-snap-')) } as NodeJS.ProcessEnv), vision: { baseUrl: vision.url, model: 'mock-vision' } }
	const report = await runIngest({ site, platform, store: new MemoryStore(), activate: true })
	if (!report.manifest || report.issues.some((i) => i.level === 'error')) throw new Error(JSON.stringify(report.issues))
	const out = path.join(ROOT, 'tests/fixtures/demo-telco.manifest.json')
	fs.mkdirSync(path.dirname(out), { recursive: true })
	fs.writeFileSync(out, JSON.stringify(report.manifest, null, 1))
	console.log(`wrote ${out} (${report.manifest.destinations.length} destinations)`)
} finally {
	await vision.close()
	await servers.close()
}
