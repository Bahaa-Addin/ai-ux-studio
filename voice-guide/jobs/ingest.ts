/**
 * npm run ingest -- --site demo-telco [--activate] [--dry-run] [--serve]
 *
 * --serve starts the site's clone folders locally first (for clones that are
 * folders on disk rather than hosted pages).
 */
import path from 'node:path'
import { parseArgs } from 'node:util'

import { loadPlatformConfig, loadSiteConfig } from '#shared/config.ts'
import { openStore } from '#shared/store/index.ts'

import { startSiteServers } from '../tools/site-server.ts'
import { runIngest } from './ingest-lib.ts'

const { values } = parseArgs({
	options: {
		site: { type: 'string', default: 'demo-telco' },
		activate: { type: 'boolean', default: false },
		'dry-run': { type: 'boolean', default: false },
		serve: { type: 'boolean', default: false },
	},
})

const platform = loadPlatformConfig()
const site = loadSiteConfig(path.join(platform.sitesDir, `${values.site}.yaml`))
const store = await openStore(platform)
const servers = values.serve ? await startSiteServers(site, { gatewayUrl: platform.publicUrl, inject: false }) : null
try {
	const report = await runIngest({ site, platform, store, activate: values.activate, dryRun: values['dry-run'], log: (m) => console.log(m) })
	const errors = report.issues.filter((i) => i.level === 'error')
	console.log(`\nVersion ${report.versionId || '-'}: ${errors.length} errors, ${report.issues.length - errors.length} warnings. Report: ${report.reportFile}`)
	process.exitCode = errors.length ? 1 : 0
} finally {
	await servers?.close()
	await store.close()
}
