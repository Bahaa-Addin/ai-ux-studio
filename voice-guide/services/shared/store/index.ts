import type { PlatformConfig } from '../config.ts'
import { MemoryStore } from './memory.ts'
import { PostgresStore } from './postgres.ts'
import type { Store } from './types.ts'

export type * from './types.ts'
export { MemoryStore } from './memory.ts'
export { PostgresStore } from './postgres.ts'

export async function openStore(cfg: Pick<PlatformConfig, 'store' | 'databaseUrl' | 'dbPoolMax'>): Promise<Store> {
	if (cfg.store === 'memory') return new MemoryStore()
	return PostgresStore.connect(cfg.databaseUrl, { max: cfg.dbPoolMax })
}
