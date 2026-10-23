/**
 * Knowledge sync for live sites (SPEC-04 §5, ADR-0028, ADR-0032): crawl public pages (or reuse a
 * saved crawl), build, diff against the active version, gate, then activate or hold for review.
 *
 * Two rules from the owner (2026-10-23) are enforced here, not just in config:
 * - public pages only: whatever the site config says, a sync crawls with `publicOnly` on and no
 *   cookies, so no signed-in page can enter the knowledge base;
 * - scheduled crawling is paused: a run marked `scheduled` (what a cron or scheduler calls)
 *   refuses while `sync.schedule.enabled` is false. On-demand runs always work.
 *
 * A held version stays in the store, inactive, so a person can read the report and activate it
 * with `npm run kb -- --activate <id>`. Old versions are never deleted by the sync (AGENTS.md §7).
 */
import fs from 'node:fs'
import path from 'node:path'

import YAML from 'yaml'

import type { Manifest } from '#kb'
import { type EvalCase, evaluate } from '#services/router/eval.ts'
import { type PlatformConfig, resolveFromRoot, type SiteConfig } from '#shared/config.ts'
import { buildKbIndex } from '#shared/kb-index.ts'
import type { Store } from '#shared/store/index.ts'

import { normalizeUrl } from './crawler/url.ts'
import { type IngestReport, runIngest } from './ingest-lib.ts'

export interface SyncOptions {
	site: SiteConfig
	platform: PlatformConfig
	store: Store
	/** Build from a saved crawl folder instead of crawling. */
	crawlDir?: string
	/** Set by schedulers and cron entries; refused while the site's schedule is paused. */
	scheduled?: boolean
	/** Build, diff and gate, but publish and activate nothing. */
	dryRun?: boolean
	/** Activate even when the gate holds (a person read the report and decided). */
	force?: boolean
	log?: (m: string) => void
	/** For tests: crawl without a real browser. */
	ingest?: typeof runIngest
}

export interface GateCheck {
	name: string
	ok: boolean
	detail: string
}

export interface SyncReport {
	siteId: string
	outcome: 'refused' | 'failed' | 'unchanged' | 'activated' | 'held' | 'dry-run'
	reason?: string
	versionId?: string
	previous?: string
	gate: GateCheck[]
	ingest?: Omit<IngestReport, 'manifest'>
	seeds?: { present: string[]; missing: string[]; notCrawled: string[] }
	reportFile?: string
}

/** The same site with public-only crawling forced on (owner's instruction, ADR-0032). */
export function publicOnlySite(site: SiteConfig): SiteConfig {
	return { ...site, crawl: { ...site.crawl, publicOnly: true, cookies: [] } }
}

/** Null when a scheduled run may start, else the reason it may not. */
export function scheduleRefusal(site: SiteConfig, scheduled: boolean): string | null {
	if (!scheduled) return null
	if (!site.sync.schedule.enabled) return `scheduled crawling is paused for ${site.id} (sync.schedule.enabled: false); run it on demand instead`
	return null
}

/** Which seed pages made it into the manifest. Seeds on an origin the crawl never reached are listed apart. */
export function seedCoverage(site: SiteConfig, m: Manifest, crawledOrigins: Set<string>): NonNullable<SyncReport['seeds']> {
	const norm = (u: string) => normalizeUrl(u, { keepQuery: site.crawl.keepQuery })
	const known = new Set<string>()
	for (const p of m.pages)
		for (const v of Object.values(p.variants)) {
			if (!v) continue
			known.add(norm(v.url))
			for (const a of (v as { aliases?: string[] }).aliases || []) known.add(norm(a))
		}
	const out = { present: [] as string[], missing: [] as string[], notCrawled: [] as string[] }
	for (const s of site.crawl.start) {
		if (!crawledOrigins.has(new URL(s).origin)) out.notCrawled.push(s)
		else if (known.has(norm(s))) out.present.push(s)
		else out.missing.push(s)
	}
	return out
}

/** Destinations removed or re-targeted, as a share of the active version's destinations. */
export function destinationChurn(active: Manifest, next: Manifest): { churn: number; removed: string[]; retargeted: string[] } {
	const after = new Map(next.destinations.map((d) => [d.id, d]))
	const removed: string[] = []
	const retargeted: string[] = []
	for (const d of active.destinations) {
		const n = after.get(d.id)
		if (!n) removed.push(d.id)
		else if (JSON.stringify(n.target?.css || []) !== JSON.stringify(d.target?.css || []) || n.pageId !== d.pageId) retargeted.push(d.id)
	}
	const total = active.destinations.length || 1
	return { churn: (removed.length + retargeted.length) / total, removed, retargeted }
}

export async function runSync(opts: SyncOptions): Promise<SyncReport> {
	const log = opts.log || (() => {})
	const refusal = scheduleRefusal(opts.site, !!opts.scheduled)
	if (refusal) {
		log(refusal)
		return { siteId: opts.site.id, outcome: 'refused', reason: refusal, gate: [] }
	}
	const site = publicOnlySite(opts.site)
	const store = opts.store
	const active = await store.getActiveKb(site.id)
	const ingest = await (opts.ingest || runIngest)({ site, platform: opts.platform, store, crawlDir: opts.crawlDir, dryRun: true, log })
	const { manifest, ...ingestSummary } = ingest
	const report: SyncReport = { siteId: site.id, outcome: 'failed', previous: active?.version.id, gate: [], ingest: ingestSummary, versionId: ingest.versionId }

	// ---- gate (SPEC-04 §5 step 6) ----
	const errors = ingest.issues.filter((i) => i.level === 'error')
	report.gate.push({ name: 'integrity', ok: !!manifest && errors.length === 0, detail: `${errors.length} errors` })
	if (!manifest) return finish(opts, report, log, 'the build failed')

	const crawlStopped = ingest.crawl.stopped
	const blocked = ingest.crawl.errors.filter((e) => /challenge|403|429|blocked/i.test(e.error))
	report.gate.push({ name: 'no bot challenge', ok: !crawlStopped && blocked.length === 0, detail: crawlStopped || (blocked.length ? `${blocked.length} blocked pages` : 'none') })

	const crawledOrigins = new Set(manifest.pages.flatMap((p) => Object.values(p.variants).flatMap((v) => (v ? [new URL(v.url).origin] : []))))
	report.seeds = seedCoverage(site, manifest, crawledOrigins)
	if (site.sync.gate.requireSeeds)
		report.gate.push({
			name: 'seed pages present',
			ok: report.seeds.missing.length === 0 && report.seeds.present.length > 0,
			detail: `${report.seeds.present.length} present, ${report.seeds.missing.length} missing${report.seeds.missing.length ? ` (${report.seeds.missing.join(', ')})` : ''}${report.seeds.notCrawled.length ? `; ${report.seeds.notCrawled.length} on origins not crawled in this run` : ''}`,
		})

	if (active) {
		const c = destinationChurn(active, manifest)
		report.gate.push({
			name: 'destination churn',
			ok: c.churn <= site.sync.gate.maxDestinationChurn,
			detail: `${(c.churn * 100).toFixed(1)}% (limit ${(site.sync.gate.maxDestinationChurn * 100).toFixed(0)}%): ${c.removed.length} removed, ${c.retargeted.length} re-targeted`,
		})
	}

	if (site.sync.gate.evalCases) {
		const cases = YAML.parse(fs.readFileSync(resolveFromRoot(site.sync.gate.evalCases), 'utf8')) as EvalCase[]
		const settings = { acceptAt: site.router.acceptAt, clarifyAt: site.router.clarifyAt, topK: site.router.topK, agentEnabled: site.agent.enabled }
		const score = async (m: Manifest) => (await evaluate(cases, buildKbIndex(m), settings)).accuracy
		const next = await score(manifest)
		if (active) {
			const before = await score(active)
			report.gate.push({ name: 'router evaluation', ok: before - next <= site.sync.gate.maxEvalDrop, detail: `${(next * 100).toFixed(1)}% (active ${(before * 100).toFixed(1)}%, allowed drop ${(site.sync.gate.maxEvalDrop * 100).toFixed(0)} points)` })
		} else {
			report.gate.push({ name: 'router evaluation', ok: true, detail: `${(next * 100).toFixed(1)}% (no active version to compare)` })
		}
	}

	// ---- publish, then activate or hold ----
	if (active && active.version.hash === manifest.version.hash) {
		report.outcome = 'unchanged'
		return finish(opts, report, log, `content unchanged since ${active.version.id}; nothing published`)
	}
	if (opts.dryRun) {
		report.outcome = 'dry-run'
		return finish(opts, report, log, 'dry run: nothing published')
	}
	// The same content held earlier is reused, not stored twice.
	const same = (await store.listKbVersions(site.id, 50)).find((v) => v.hash === manifest.version.hash)
	if (same) report.versionId = same.id
	else await store.putKbVersion(site.id, manifest)
	const versionId = report.versionId || manifest.version.id
	const passed = report.gate.every((g) => g.ok)
	if (passed || opts.force) {
		await store.activateKb(site.id, versionId)
		report.outcome = 'activated'
		return finish(opts, report, log, passed ? 'gate passed' : 'gate held; activated by --force')
	}
	report.outcome = 'held'
	return finish(opts, report, log, `gate held: ${report.gate.filter((g) => !g.ok).map((g) => g.name).join(', ')}`)
}

function finish(opts: SyncOptions, r: SyncReport, log: (m: string) => void, reason: string): SyncReport {
	r.reason = reason
	if (r.outcome === 'failed' && !r.reason) r.reason = 'failed'
	const dir = path.join(opts.platform.dataDir, 'reports')
	fs.mkdirSync(dir, { recursive: true })
	const stamp = new Date().toISOString().replace(/[:.]/g, '-')
	const file = path.join(dir, `sync-${r.siteId}-${stamp}.md`)
	const lines = [
		`# Sync report: ${r.siteId}`,
		'',
		`- Outcome: **${r.outcome}** (${reason})`,
		`- New version: ${r.versionId || '-'}; previously active: ${r.previous || 'none'}`,
		`- Crawl: ${r.ingest?.crawl.id || '-'}, ${r.ingest?.crawl.pages ?? 0} pages, ${r.ingest?.crawl.errors.length ?? 0} errors; public pages only, no cookies`,
		'',
		'## Gate',
		'',
		'| Check | Result | Detail |',
		'|---|---|---|',
		...r.gate.map((g) => `| ${g.name} | ${g.ok ? 'pass' : '**hold**'} | ${g.detail.replace(/\|/g, '\\|')} |`),
		'',
		r.seeds?.notCrawled.length ? `Seeds on origins not crawled in this run: ${r.seeds.notCrawled.join(', ')}\n` : '',
		r.outcome === 'held' ? `To activate after review: \`npm run kb -- --site ${r.siteId} --activate ${r.versionId}\`` : '',
		r.ingest?.reportFile ? `Build report: ${path.relative(path.dirname(file), r.ingest.reportFile)}` : '',
	]
	fs.writeFileSync(file, lines.join('\n'))
	fs.writeFileSync(file.replace(/\.md$/, '.json'), JSON.stringify(r, null, 1))
	r.reportFile = file
	log(`${r.outcome}: ${reason}. Report: ${file}`)
	return r
}
