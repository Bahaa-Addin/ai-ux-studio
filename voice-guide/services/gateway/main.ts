/** Gateway entrypoint. With VG_SERVICES=local (default) every service runs in this process. */
import { createServices } from '../index.ts'
import { loadPlatformConfig } from '../shared/config.ts'
import { log } from '../shared/log.ts'
import { startScheduler } from '../watch/handlers.ts'
import { createGateway } from './server.ts'

const platform = loadPlatformConfig()
const services = await createServices({ platform })
const gateway = createGateway({ services, adminToken: process.env.VG_ADMIN_TOKEN })
await gateway.listen(platform.port)
// In local mode this process also runs the watch scheduler and the purge job.
const stops: (() => void)[] = []
if (platform.services === 'local' && process.env.VG_WATCH_SCHEDULER !== 'off') stops.push(startScheduler(services.local.watch, 5000))
const purge = setInterval(() => services.store.purgeExpired(new Date(), platform.traceRetentionDays).catch(() => {}), 10 * 60_000)
purge.unref()
log('info', 'gateway listening', { url: platform.publicUrl, store: services.store.kind, services: platform.services, sites: [...services.sites.keys()] })

const shutdown = async () => {
	for (const s of stops) s()
	await gateway.close()
	await services.close()
	process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
