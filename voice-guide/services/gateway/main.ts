/**
 * Gateway entrypoint. With VG_SERVICES=local (default) every service runs in this process.
 *
 * VG_PUBLIC=on (ADR-0053): a gateway on the internet for the public demo extension. It refuses to
 * start with unsafe settings (checkPublicConfig), never runs the page-watch scheduler (no service
 * worker on Vodafone's origin, and no fetching Vodafone's pages from a cloud address, O29), and
 * with the memory store (VG_STORE=memory, one machine) activates the committed knowledge base and
 * experience profile at start, so a fresh machine serves the demo with no database.
 */
import fs from 'node:fs'
import path from 'node:path'

import type { Manifest } from '#kb'
import { ensureExperienceProfile } from '#jobs/experience/build.ts'

import { createServices } from '../index.ts'
import { checkPublicConfig, loadPlatformConfig, ROOT } from '../shared/config.ts'
import { log } from '../shared/log.ts'
import { startScheduler } from '../watch/handlers.ts'
import { createGateway } from './server.ts'

const platform = loadPlatformConfig()
const problems = checkPublicConfig(platform)
if (problems.length) {
	for (const p of problems) log('error', 'public gateway refused to start', { problem: p })
	process.exit(1)
}
const services = await createServices({ platform })
// The Exploration Trail for this gateway's sites, as `npm run demo:trail` does (each person still says yes).
if (process.env.VG_TRAIL === 'on') for (const site of services.sites.values()) site.trail.enabled = true
if (process.env.VG_KB_SEED === 'committed' || (platform.public && services.store.kind === 'memory')) await seedCommitted()
const gateway = createGateway({ services, adminToken: process.env.VG_ADMIN_TOKEN })
await gateway.listen(platform.port)
// In local mode this process also runs the watch scheduler and the purge job.
const stops: (() => void)[] = []
if (platform.services === 'local' && !platform.public && process.env.VG_WATCH_SCHEDULER !== 'off') stops.push(startScheduler(services.local.watch, 5000))
const purge = setInterval(() => services.store.purgeExpired(new Date(), platform.traceRetentionDays).catch(() => {}), 10 * 60_000)
purge.unref()
log('info', 'gateway listening', { url: platform.publicUrl, public: platform.public, store: services.store.kind, services: platform.services, sites: [...services.sites.keys()], agent: services.local.agent.status(), stt: !!platform.stt.url })

/** Each site with no active knowledge base gets config/kb/<site>.manifest.json, and its experience profile. */
async function seedCommitted(): Promise<void> {
	for (const site of services.sites.values()) {
		const file = path.join(ROOT, 'config/kb', `${site.id}.manifest.json`)
		if (!(await services.store.getActiveKbId(site.id)) && fs.existsSync(file)) {
			const m = JSON.parse(fs.readFileSync(file, 'utf8')) as Manifest
			await services.store.putKbVersion(site.id, m)
			await services.store.activateKb(site.id, m.version.id)
			log('info', 'knowledge base seeded', { site: site.id, version: m.version.id })
		}
		const kb = await services.store.getActiveKb(site.id)
		const profileFile = path.join(ROOT, 'config/experience', `${site.id}.profile.json`)
		if (kb && site.trail.enabled) await ensureExperienceProfile(services.store, site, kb, fs.existsSync(profileFile) ? JSON.parse(fs.readFileSync(profileFile, 'utf8')) : null, () => {})
	}
}

const shutdown = async () => {
	for (const s of stops) s()
	await gateway.close()
	await services.close()
	process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
