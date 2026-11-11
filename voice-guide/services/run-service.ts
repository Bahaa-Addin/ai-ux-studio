/**
 * Runs one service on its own port for a scaled deployment (ADR-0009):
 *   node services/run-service.ts router 4410
 * Point the gateway at it with VG_SERVICES=http and VG_ROUTER_URL=http://host:4410.
 * The guide's voice (ADR-0047) runs as `speechOut`; point every other process at it with
 * VG_SPEECH_OUT_URL, so VoiceTut sees one queue.
 * The watch service also runs the scheduler (set VG_WATCH_SCHEDULER=off on all but one
 * replica if you prefer; claiming makes several schedulers safe either way).
 */
import { createServices } from './index.ts'
import { loadPlatformConfig } from './shared/config.ts'
import { log } from './shared/log.ts'
import { serveRpc } from './shared/rpc.ts'
import { startScheduler } from './watch/handlers.ts'

const [name, portArg] = process.argv.slice(2)
const names = ['router', 'sessions', 'knowledge', 'agent', 'watch', 'speechOut'] as const
if (!names.includes(name as never)) {
	console.error(`usage: node services/run-service.ts <${names.join('|')}> [port]`)
	process.exit(2)
}
const platform = { ...loadPlatformConfig(), services: 'local' as const }
const services = await createServices({ platform })
const handlers = services.local[name as (typeof names)[number]] as unknown as Record<string, (i: any, c: any) => Promise<any>>
const port = Number(portArg || 4410 + names.indexOf(name as never))
await serveRpc(name, handlers, port)
if (name === 'watch' && process.env.VG_WATCH_SCHEDULER !== 'off') startScheduler(services.local.watch, 5000)
log('info', 'service listening', { service: name, port })
