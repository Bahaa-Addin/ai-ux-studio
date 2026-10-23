/**
 * npm run sync -- --site vodafone-eg [--origin web] [--from-crawl <dir>] [--dry-run] [--force] [--scheduled]
 *
 * On-demand knowledge sync (SPEC-04 §5, ADR-0028). Crawls public pages only (no cookies, pages
 * behind a login skipped) or builds from a saved crawl, gates the result against the active
 * version, then activates it or holds it for review. `--scheduled` is what a cron entry passes:
 * it refuses while the site's schedule is paused (owner's instruction, 2026-10-23).
 *
 * The live Vodafone crawl needs a machine that can reach web.vodafone.com.eg; from a machine
 * that cannot, take the crawl in a browser (ADR-0032, docs/ops/runbook.md §5) and pass
 * --from-crawl.
 */
import fs from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'

import { loadPlatformConfig, loadSiteConfig } from '#shared/config.ts'
import { openStore } from '#shared/store/index.ts'

import { runSync } from './sync-lib.ts'

const { values } = parseArgs({
	options: {
		site: { type: 'string', default: 'vodafone-eg' },
		'from-crawl': { type: 'string' },
		'dry-run': { type: 'boolean', default: false },
		force: { type: 'boolean', default: false },
		scheduled: { type: 'boolean', default: false },
		origin: { type: 'string', multiple: true },
	},
})

const platform = loadPlatformConfig()
const site = loadSiteConfig(path.join(platform.sitesDir, `${values.site}.yaml`))
const store = await openStore(platform)
try {
	const r = await runSync({ site, platform, store, crawlDir: values['from-crawl'], dryRun: values['dry-run'], force: values.force, scheduled: values.scheduled, onlyOrigins: values.origin, log: (m) => console.log(m) })
	console.log('')
	for (const g of r.gate) console.log(`${g.ok ? 'pass' : 'HOLD'}  ${g.name.padEnd(20)} ${g.detail}`)
	console.log(`\n${r.outcome.toUpperCase()}: ${r.reason}`)
	const manifest = r.ingest?.reportFile?.replace(/\.md$/, '.manifest.json')
	if (manifest && fs.existsSync(manifest)) console.log(`Manifest: ${manifest}\n  without a database: npm run demo:live -- --kb ${path.relative(process.cwd(), manifest)}`)
	process.exitCode = r.outcome === 'failed' || r.outcome === 'refused' ? 1 : r.outcome === 'held' ? 2 : 0
} finally {
	await store.close()
}
