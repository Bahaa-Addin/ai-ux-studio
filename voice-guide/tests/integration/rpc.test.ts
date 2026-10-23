/** ADR-0009: the same handlers give the same result in process and over HTTP. */
import assert from 'node:assert/strict'
import type http from 'node:http'
import { after, before, test } from 'node:test'

import { createRouter } from '#services/router/handlers.ts'
import { loadPlatformConfig, loadSites } from '#shared/config.ts'
import { KbCache } from '#shared/kb-index.ts'
import { httpClient, localClient, serveRpc } from '#shared/rpc.ts'
import { PostgresStore } from '#shared/store/index.ts'
import { newContext, Tracer } from '#shared/trace.ts'

import { TEST_DATABASE_URL } from '../helpers/env.ts'
import { emptySession, fixtureManifest } from '../helpers/kb.ts'

let store: PostgresStore
let server: http.Server
let handlers: ReturnType<typeof createRouter>

before(async () => {
	store = await PostgresStore.connect(TEST_DATABASE_URL, { max: 3 })
	await store.truncateAll()
	const m = fixtureManifest()
	await store.putKbVersion('demo-telco', m)
	await store.activateKb('demo-telco', m.version.id)
	const platform = loadPlatformConfig({ DATABASE_URL: TEST_DATABASE_URL } as NodeJS.ProcessEnv)
	handlers = createRouter({ platform, sites: loadSites(platform.sitesDir), kb: new KbCache(store), tracer: new Tracer(store, 'router') })
	server = await serveRpc('router', handlers as any, 4497)
})
after(async () => {
	server?.close()
	await store?.close()
})

test('a turn through the HTTP binding equals the in-process result', async () => {
	const local = localClient(handlers as any) as any
	const remote = httpClient('http://localhost:4497', 4000) as any
	const input = { siteId: 'demo-telco', session: emptySession('en'), utterance: 'cheapest home internet plan', page: { url: 'http://localhost:4401/en/index.html' } }
	const ctx = (turnId: string) => ({ trace: newContext({ siteId: 'demo-telco', sessionId: 'ses_rpc', turnId }) })
	const a = await local.turn(input, ctx('turn_same'))
	const b = await remote.turn(input, ctx('turn_same'))
	assert.deepEqual(b.plan, a.plan)
	assert.equal(b.understanding.decision.destinationId, 'web.bundles.home-internet')
	const tr = await store.listTrace('ses_rpc')
	assert.ok(tr.filter((e) => e.name === 'router.understood' && e.turnId === 'turn_same').length === 2, 'trace context crossed the HTTP hop')
	await assert.rejects(remote.turn({ ...input, siteId: 'nope' }, ctx('t')), /unknown site/)
})
