/**
 * npm run fixtures -- --site demo-telco [--no-inject] [--gateway http://localhost:4400]
 * Serves the site's clone folders with the Guide SDK injected.
 */
import path from 'node:path'
import { parseArgs } from 'node:util'

import { loadPlatformConfig, loadSiteConfig } from '#shared/config.ts'

import { startSiteServers } from './site-server.ts'

const { values } = parseArgs({
	options: { site: { type: 'string', default: 'demo-telco' }, 'no-inject': { type: 'boolean', default: false }, gateway: { type: 'string' } },
})
const platform = loadPlatformConfig()
const site = loadSiteConfig(path.join(platform.sitesDir, `${values.site}.yaml`))
const { urls } = await startSiteServers(site, { gatewayUrl: values.gateway || platform.publicUrl, inject: !values['no-inject'] })
console.log(`Serving ${site.id}:`)
for (const u of urls) console.log(`  ${u}`)
