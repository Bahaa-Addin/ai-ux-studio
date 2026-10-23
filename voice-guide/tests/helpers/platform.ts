/** Starts the whole platform against real Postgres for integration and end-to-end tests. */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { createGateway } from '#services/gateway/server.ts'
import { createServices, type PlatformOptions } from '#services/index.ts'
import { loadPlatformConfig, type PlatformConfig } from '#shared/config.ts'
import { PostgresStore } from '#shared/store/index.ts'

import { TEST_DATABASE_URL } from './env.ts'
import { fixtureManifest } from './kb.ts'

export interface TestPlatform {
	url: string
	port: number
	platform: PlatformConfig
	services: Awaited<ReturnType<typeof createServices>>
	gateway: ReturnType<typeof createGateway>
	store: PostgresStore
	close(): Promise<void>
}

export async function startPlatform(over: { env?: Record<string, string>; port?: number; options?: Partial<PlatformOptions>; seedKb?: boolean } = {}): Promise<TestPlatform> {
	const port = over.port ?? 4400
	const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vg-test-'))
	const platform = loadPlatformConfig({ VG_PORT: String(port), VG_DATA_DIR: dataDir, DATABASE_URL: TEST_DATABASE_URL, VG_SECRET: 'test-secret', ...over.env } as NodeJS.ProcessEnv)
	const store = await PostgresStore.connect(TEST_DATABASE_URL, { max: 6 })
	await store.truncateAll()
	if (over.seedKb !== false) {
		const m = fixtureManifest()
		await store.putKbVersion('demo-telco', m)
		await store.activateKb('demo-telco', m.version.id)
	}
	const services = await createServices({ platform, store, ...over.options })
	const gateway = createGateway({ services })
	await gateway.listen(port)
	return {
		url: `http://localhost:${port}`,
		port,
		platform,
		services,
		gateway,
		store,
		async close() {
			await gateway.close()
			await services.close()
			await store.close()
		},
	}
}
