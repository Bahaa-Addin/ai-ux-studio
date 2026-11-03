/**
 * npm run experience -- --site demo-telco [--activate] [--dry-run]
 * npm run experience -- --site vodafone-eg --manifest config/kb/vodafone-eg.manifest.json --out config/experience/vodafone-eg.profile.json --dry-run
 *
 * Builds the site experience profile (ADR-0036) for the active knowledge version (or a manifest
 * file), validates every suggested question through the router, writes a report to
 * data/reports/, publishes the profile to the store and, with --activate, makes it the one the
 * guide serves. Approved aggregate counts are read only when the site's aggregation is enabled
 * (ADR-0037 §6, off by default).
 */
import fs from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'

import type { Manifest } from '#kb'
import { loadPlatformConfig, loadSiteConfig, resolveFromRoot } from '#shared/config.ts'
import { openStore } from '#shared/store/index.ts'

import { buildExperienceProfile } from './experience/build.ts'

const { values } = parseArgs({
	options: {
		site: { type: 'string', default: 'demo-telco' },
		manifest: { type: 'string' },
		out: { type: 'string' },
		activate: { type: 'boolean', default: false },
		'dry-run': { type: 'boolean', default: false },
	},
})

const platform = loadPlatformConfig()
const site = loadSiteConfig(path.join(platform.sitesDir, `${values.site}.yaml`))
const needStore = !values['dry-run'] || !values.manifest
const store = needStore ? await openStore(platform) : null
try {
	const manifest: Manifest | null = values.manifest ? JSON.parse(fs.readFileSync(resolveFromRoot(values.manifest), 'utf8')) : await store!.getActiveKb(site.id)
	if (!manifest) throw new Error(`no active knowledge version for ${site.id}: run npm run ingest -- --site ${site.id} --activate first`)
	const to = new Date().toISOString().slice(0, 10)
	const from = new Date(Date.now() - site.trail.aggregation.windowDays * 86_400_000).toISOString().slice(0, 10)
	const counts = site.trail.aggregation.enabled && platform.trailAggregation && store ? await store.listInterestCounts(site.id, manifest.version.id, from, to) : []
	const report = await buildExperienceProfile({ manifest, site, counts, window: counts.length ? { from, to } : undefined, log: (m) => console.log(m) })
	const errors = report.issues.filter((i) => i.level === 'error')
	fs.mkdirSync(path.join(platform.dataDir, 'reports'), { recursive: true })
	const reportFile = path.join(platform.dataDir, 'reports', `experience-${site.id}-${report.profile.id}.json`)
	fs.writeFileSync(reportFile, JSON.stringify({ stats: report.stats, issues: report.issues, profile: report.profile }, null, 2))
	if (values.out) fs.writeFileSync(resolveFromRoot(values.out), `${JSON.stringify(report.profile, null, 1)}\n`)
	if (errors.length) {
		for (const e of errors.slice(0, 20)) console.error(`  ${e.path}: ${e.message}`)
		throw new Error(`${errors.length} error(s); nothing published. Report: ${reportFile}`)
	}
	if (!values['dry-run']) {
		await store!.putExperienceProfile(site.id, report.profile)
		if (values.activate) await store!.activateExperienceProfile(site.id, report.profile.id)
	}
	console.log(`\nProfile ${report.profile.id} for knowledge ${manifest.version.id}: ${report.stats.verified} verified questions (${Object.entries(report.stats.byLang).map(([l, n]) => `${l} ${n}`).join(', ')}), ${report.stats.ms} ms. ${values['dry-run'] ? 'Dry run: not published.' : values.activate ? 'Published and active.' : 'Published; activate with --activate.'} Report: ${reportFile}`)
} finally {
	await store?.close()
}
