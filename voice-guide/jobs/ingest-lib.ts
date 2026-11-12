/**
 * The ingestion pipeline (ADR-0012): crawl the clones, describe visuals, merge
 * the curated overlay, validate, and publish an immutable KB version. Only an
 * explicit activation makes a version live, so a bad crawl never reaches users.
 */
import fs from 'node:fs'
import path from 'node:path'

import type { Browser } from 'playwright'

import type { Issue, Manifest } from '#kb'
import { type PlatformConfig, resolveFromRoot, type SiteConfig } from '#shared/config.ts'
import type { Store } from '#shared/store/index.ts'

import { crawlSite, loadCrawl } from './crawler/crawl.ts'
import { makeInScope } from './crawler/url.ts'
import { describeCrawl } from './describer/describe.ts'
import { diffKb, diffLines, type KbDiff } from './kb-diff.ts'
import { buildManifest, type BuildStats } from './kb-builder/build.ts'
import { loadOverlay } from './kb-builder/overlay.ts'

export interface IngestOptions {
	site: SiteConfig
	platform: PlatformConfig
	store: Store
	activate?: boolean
	dryRun?: boolean
	browser?: Browser
	log?: (m: string) => void
	fetchImpl?: typeof fetch
	/** Build from a crawl taken earlier (for example by the in-browser crawler, ADR-0032) instead of crawling. */
	crawlDir?: string
}

export interface IngestReport {
	siteId: string
	versionId?: string
	published: boolean
	activated: boolean
	unchanged: boolean
	crawl: { id: string; pages: number; errors: { url: string; error: string }[]; ms: number; stopped?: string }
	describe: { visionCalls: number; cacheHits: number }
	stats?: BuildStats
	issues: Issue[]
	diff?: KbDiff & { previous?: string }
	reportFile?: string
	manifest?: Manifest
}

export async function runIngest(opts: IngestOptions): Promise<IngestReport> {
	const log = opts.log || (() => {})
	const { site, platform, store } = opts
	const t0 = Date.now()
	const crawl = opts.crawlDir ? loadCrawl(opts.crawlDir) : await crawlSite(site, { outDir: path.join(platform.dataDir, 'crawls'), browser: opts.browser, log, fetchImpl: opts.fetchImpl })
	if (opts.crawlDir) {
		// A saved crawl is re-scoped with today's config, so tightening include/exclude never needs a new crawl.
		const inScope = makeInScope({ origins: site.origins.map((o) => o.url), include: site.crawl.include, exclude: site.crawl.exclude })
		const before = crawl.pages.length
		crawl.pages = crawl.pages.filter((p) => inScope(p.url))
		if (crawl.pages.length !== before) log(`scope: ${before - crawl.pages.length} saved pages are outside today's scope and were left out`)
	}
	const crawlMs = Date.now() - t0
	log(`crawl ${crawl.id}: ${crawl.pages.length} pages, ${crawl.errors.length} errors in ${crawlMs} ms`)

	const described = await describeCrawl(crawl, { languages: site.languages, vision: platform.vision, store, log, fetchImpl: opts.fetchImpl })
	log(`describe: ${described.results.size} visuals, ${described.visionCalls} vision calls, ${described.cacheHits} cache hits`)

	const overlay = site.curated ? loadOverlay(resolveFromRoot(site.curated)) : undefined
	const built = buildManifest({ site, crawl, descriptions: described.results, overlay })
	const report: IngestReport = {
		siteId: site.id,
		published: false,
		activated: false,
		unchanged: false,
		crawl: { id: crawl.id, pages: crawl.pages.length, errors: crawl.errors, ms: crawlMs, ...(crawl.stopped ? { stopped: crawl.stopped } : {}) },
		describe: { visionCalls: described.visionCalls, cacheHits: described.cacheHits },
		stats: built.stats,
		issues: built.issues,
		manifest: built.manifest,
	}
	if (!built.ok || !built.manifest) {
		log(`build failed with ${built.issues.filter((i) => i.level === 'error').length} errors`)
		report.reportFile = writeReport(platform, report)
		return report
	}
	const m = built.manifest
	report.versionId = m.version.id
	const active = await store.getActiveKb(site.id)
	if (active) {
		report.diff = { previous: active.version.id, ...diffKb(active, m) }
		report.unchanged = active.version.hash === m.version.hash
	}
	if (!opts.dryRun && !report.unchanged) {
		await store.putKbVersion(site.id, m)
		report.published = true
		log(`published ${m.version.id}`)
		if (opts.activate) {
			await store.activateKb(site.id, m.version.id)
			report.activated = true
			log(`activated ${m.version.id}`)
		}
	} else if (report.unchanged) {
		log(`content unchanged since ${active?.version.id}; nothing published`)
	}
	report.reportFile = writeReport(platform, report)
	return report
}

function writeReport(platform: PlatformConfig, r: IngestReport): string {
	const dir = path.join(platform.dataDir, 'reports')
	fs.mkdirSync(dir, { recursive: true })
	const file = path.join(dir, `${r.siteId}-${r.versionId || r.crawl.id}.md`)
	const errors = r.issues.filter((i) => i.level === 'error')
	const warnings = r.issues.filter((i) => i.level === 'warning')
	const lines = [
		`# Ingest report: ${r.siteId}`,
		'',
		`- Version: ${r.versionId || 'not built'}${r.unchanged ? ' (unchanged, not published)' : ''}`,
		`- Published: ${r.published}; activated: ${r.activated}`,
		`- Crawl: ${r.crawl.id}, ${r.crawl.pages} pages, ${r.crawl.errors.length} errors, ${r.crawl.ms} ms`,
		`- Visuals: ${JSON.stringify(r.stats?.visuals || {})}; vision calls ${r.describe.visionCalls}, cache hits ${r.describe.cacheHits}`,
		`- Destinations: ${JSON.stringify(r.stats?.destinations || {})}; collections ${r.stats?.collections ?? 0}; flows ${r.stats?.flows ?? 0}; curated entries ${r.stats?.curated ?? 0}`,
		'',
		r.diff ? `## Changes since ${r.diff.previous}\n\n${diffLines(r.diff).join('\n')}\n` : '',
		`## Errors (${errors.length})`,
		...errors.map((i) => `- ${i.path}: ${i.message}`),
		'',
		`## Warnings (${warnings.length})`,
		...warnings.map((i) => `- ${i.path}: ${i.message}`),
		'',
		r.crawl.errors.length ? `## Crawl errors\n\n${r.crawl.errors.map((e) => `- ${e.url}: ${e.error}`).join('\n')}` : '',
	]
	fs.writeFileSync(file, lines.join('\n'))
	if (r.manifest) fs.writeFileSync(file.replace(/\.md$/, '.manifest.json'), JSON.stringify(r.manifest, null, 1))
	return file
}
