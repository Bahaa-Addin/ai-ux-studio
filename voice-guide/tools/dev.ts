/**
 * npm run dev: one command for the demo on a laptop.
 *  1. builds the SDK
 *  2. serves the site's clones with the SDK tag injected
 *  3. ingests and activates the knowledge base if none is active (or with --ingest)
 *  4. builds the Exploration Trail's experience profile when the site enables the trail
 *  5. starts the gateway with every service in process and the watch scheduler
 */
import path from 'node:path'
import { parseArgs } from 'node:util'

import { ensureExperienceProfile } from '#jobs/experience/build.ts'
import { runIngest } from '#jobs/ingest-lib.ts'

import { buildSdk } from '../packages/sdk/build.ts'
import { createGateway } from '../services/gateway/server.ts'
import { createServices } from '../services/index.ts'
import { loadPlatformConfig, loadSiteConfig } from '../services/shared/config.ts'
import { startScheduler } from '../services/watch/handlers.ts'
import { startSiteServers } from './site-server.ts'

const { values } = parseArgs({ options: { site: { type: 'string', default: 'demo-telco' }, ingest: { type: 'boolean', default: false }, xray: { type: 'string' } } })
const platform = loadPlatformConfig()
await buildSdk({ minify: false })
const site = loadSiteConfig(path.join(platform.sitesDir, `${values.site}.yaml`))
const sites = await startSiteServers(site, { gatewayUrl: platform.publicUrl, tagAttributes: values.xray ? { 'data-xray': values.xray } : undefined })
const services = await createServices({ platform })
if (values.ingest || !(await services.store.getActiveKbId(site.id))) {
	console.log('Building the knowledge base...')
	const r = await runIngest({ site, platform, store: services.store, activate: true, log: () => {} })
	console.log(`  ${r.versionId}: ${r.crawl.pages} pages, ${r.issues.filter((i) => i.level === 'error').length} errors. Report: ${r.reportFile}`)
}
// Exploration Trail (SPEC-06): suggested questions for the active knowledge version.
const active = await services.store.getActiveKb(site.id)
if (active && site.trail.enabled) {
	const p = await ensureExperienceProfile(services.store, site, active, null, (m) => console.log(`  ${m}`))
	if (p) console.log(`  Experience profile ${p.id} active`)
}
const gateway = createGateway({ services, adminToken: process.env.VG_ADMIN_TOKEN })
await gateway.listen(platform.port)
startScheduler(services.local.watch, 5000)
console.log(`\nVoice guide running.\n  Gateway:  ${platform.publicUrl}  (store: ${services.store.kind}, agent: ${services.local.agent.status().available ? 'on' : 'no model configured'})`)
for (const u of site.crawl.start) console.log(`  Page:     ${u}`)
console.log('\nOpen a site URL in Chrome, press the mic button (or type) and ask.')
