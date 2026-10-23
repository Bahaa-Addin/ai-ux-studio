/**
 * npm run demo:live: the voice guide on the real Vodafone site, from one command (runbook §3).
 *
 *   npm run demo:live                                   # live site, start on /ar/home
 *   npm run demo:live -- --start https://web.vodafone.com.eg/en/mobile-internet-bundles
 *   npm run demo:live -- --replay                       # offline: captured pages, no internet needed
 *   npm run demo:live -- --kiosk --xray open            # on stage
 *
 * 1. builds the SDK;
 * 2. starts the gateway with every service in process (memory store by default, so no Postgres;
 *    --store postgres uses DATABASE_URL);
 * 3. activates a knowledge base: --kb <manifest.json>, else the one already active in the store,
 *    else config/kb/<site>.manifest.json (committed), else the newest crawl in data/crawls;
 * 4. opens the demo browser (tools/demo-browser.ts) on the start page.
 * Closing the browser window stops everything. No crawl runs on a schedule (ADR-0032).
 */
import fs from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'

import type { Manifest } from '#kb'
import { runIngest } from '#jobs/ingest-lib.ts'

import { buildSdk } from '../packages/sdk/build.ts'
import { createGateway } from '../services/gateway/server.ts'
import { createServices } from '../services/index.ts'
import { loadPlatformConfig, loadSiteConfig, ROOT } from '../services/shared/config.ts'
import { startScheduler } from '../services/watch/handlers.ts'
import { launchDemoBrowser } from './demo-browser.ts'

const { values } = parseArgs({
	options: {
		site: { type: 'string', default: 'vodafone-eg' },
		start: { type: 'string' },
		replay: { type: 'string' },
		kb: { type: 'string' },
		store: { type: 'string', default: 'memory' },
		port: { type: 'string', default: '4400' },
		xray: { type: 'string', default: 'button' },
		kiosk: { type: 'boolean', default: false },
		headless: { type: 'boolean', default: false },
		profile: { type: 'string' },
	},
	allowNegative: false,
	strict: true,
	args: process.argv.slice(2).map((a) => (a === '--replay' ? '--replay=default' : a)),
})

const port = Number(values.port)
const platform = loadPlatformConfig({ ...process.env, VG_STORE: values.store, VG_PORT: String(port), VG_PUBLIC_URL: `http://127.0.0.1:${port}` })
const site = loadSiteConfig(path.join(platform.sitesDir, `${values.site}.yaml`))
const replayDir = values.replay ? (values.replay === 'default' ? defaultReplayDir(site.id) : path.resolve(values.replay)) : undefined
const start = values.start || site.crawl.start[0]

console.log('Building the SDK...')
await buildSdk({ minify: true })
const services = await createServices({ platform })

// ---- knowledge base ----
const committed = path.join(ROOT, 'config/kb', `${site.id}.manifest.json`)
if (values.kb) await activate(JSON.parse(fs.readFileSync(path.resolve(values.kb), 'utf8')) as Manifest, values.kb)
else if (await services.store.getActiveKbId(site.id)) console.log(`Knowledge base: ${await services.store.getActiveKbId(site.id)} (already active)`)
else if (fs.existsSync(committed)) await activate(JSON.parse(fs.readFileSync(committed, 'utf8')) as Manifest, path.relative(ROOT, committed))
else {
	const crawl = newestCrawl(site.id)
	if (!crawl) throw new Error(`No knowledge base for ${site.id}. Crawl public pages first (runbook §4): npm run sync -- --site ${site.id}`)
	const r = await runIngest({ site, platform, store: services.store, activate: true, crawlDir: crawl, log: () => {} })
	console.log(`Knowledge base: ${r.versionId} built from ${path.relative(ROOT, crawl)} (${r.issues.filter((i) => i.level === 'error').length} errors)`)
}

const gateway = createGateway({ services, adminToken: process.env.VG_ADMIN_TOKEN })
await gateway.listen(port)
const stopWatches = startScheduler(services.local.watch, 5000)
console.log(`Gateway: http://127.0.0.1:${port} (store: ${services.store.kind}, agent: ${services.local.agent.status().available ? 'on' : 'no model configured'})`)
console.log(replayDir ? `Replay: ${path.relative(ROOT, replayDir)} (offline)` : 'Live: real Vodafone pages')

const browser = await launchDemoBrowser({
	site,
	gatewayUrl: `http://127.0.0.1:${port}`,
	start,
	profileDir: values.profile ? path.resolve(values.profile) : path.join(platform.dataDir, 'demo-profile'),
	headless: values.headless,
	kiosk: values.kiosk,
	xray: values.xray as 'off' | 'button' | 'open',
	replayDir,
	log: (m) => console.log(m),
})
console.log(`Demo browser open on ${start}. Press the red microphone and ask. Close the window to stop.`)

const shutdown = async () => {
	stopWatches?.()
	await browser.close()
	await gateway.close()
	await services.close()
	process.exit(0)
}
browser.context.on('close', () => void shutdown())
process.on('SIGINT', () => void shutdown())
process.on('SIGTERM', () => void shutdown())

async function activate(m: Manifest, from: string): Promise<void> {
	if (m.site.id !== site.id) throw new Error(`${from} is for ${m.site.id}, not ${site.id}`)
	await services.store.putKbVersion(site.id, m)
	await services.store.activateKb(site.id, m.version.id)
	console.log(`Knowledge base: ${m.version.id} from ${from}`)
}

function newestCrawl(siteId: string): string | undefined {
	const dir = path.join(platform.dataDir, 'crawls')
	if (!fs.existsSync(dir)) return undefined
	const found = fs
		.readdirSync(dir)
		.map((d) => path.join(dir, d))
		.filter((d) => fs.existsSync(path.join(d, 'crawl.json')) && JSON.parse(fs.readFileSync(path.join(d, 'crawl.json'), 'utf8')).siteId === siteId)
		.sort()
	return found.at(-1)
}

function defaultReplayDir(siteId: string): string {
	const committedReplay = path.join(ROOT, 'fixtures/replay', siteId)
	if (fs.existsSync(path.join(committedReplay, 'crawl.json'))) return committedReplay
	const crawl = newestCrawl(siteId)
	if (!crawl) throw new Error(`No replay for ${siteId}: fixtures/replay/${siteId} is missing and there is no crawl in data/crawls`)
	return crawl
}
