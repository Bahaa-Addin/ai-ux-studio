/** npm run db:migrate: applies services/shared/store/schema.sql (idempotent). */
import { loadPlatformConfig } from './config.ts'
import { PostgresStore } from './store/index.ts'

const cfg = loadPlatformConfig()
const store = await PostgresStore.connect(cfg.databaseUrl, { max: 1, migrate: true })
await store.close()
console.log('schema up to date')
