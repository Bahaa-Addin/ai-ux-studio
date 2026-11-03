/**
 * Builds a site experience profile for one knowledge version (ADR-0036): candidate questions per
 * destination and locale, router validation from two starting pages, at most three verified
 * questions per locale with distinct intents, and (only when approved aggregation is on and the
 * cohort is met, ADR-0037 §6) a coarse rank. Deterministic: the same manifest and counts give the
 * same profile apart from its timestamp.
 */
import { createHash } from 'node:crypto'

import { type DestinationExperience, EXPERIENCE_STANDARD, MAX_QUESTIONS, type Manifest, questionKey, type SiteExperienceProfile, type SuggestedQuestion, stableStringify, validateExperienceProfile } from '#kb'
import type { SiteConfig } from '#shared/config.ts'
import { buildKbIndex } from '#shared/kb-index.ts'
import type { InterestCount, Store } from '#shared/store/index.ts'

import { candidatesFor } from './questions.ts'
import { homePageId, validateCandidate } from './validate.ts'

export const GENERATOR = { name: 'vg-experience-builder', version: '1' }

/** Destinations nobody explores as content: commit buttons, actions, pages that belong to one person. */
const PRIVATE_KINDS = new Set(['account', 'login', 'checkout'])

export interface BuildExperienceOptions {
	manifest: Manifest
	site: Pick<SiteConfig, 'id' | 'router' | 'trail'>
	/** Approved anonymous counts (ADR-0037 §6); ignored unless the site's aggregation is enabled. */
	counts?: InterestCount[]
	window?: { from: string; to: string }
	now?: Date
	log?: (m: string) => void
}

export interface ExperienceReport {
	profile: SiteExperienceProfile
	stats: { destinations: number; withQuestions: number; verified: number; rejected: number; needsReview: number; byLang: Record<string, number>; ms: number }
	issues: { level: string; path: string; message: string }[]
}

export async function buildExperienceProfile(o: BuildExperienceOptions): Promise<ExperienceReport> {
	const t0 = performance.now()
	const m = o.manifest
	const kb = buildKbIndex(m)
	const settings = { acceptAt: o.site.router.acceptAt, clarifyAt: o.site.router.clarifyAt, topK: o.site.router.topK }
	const home = homePageId(kb)
	const ranking = rank(o)
	const destinations: DestinationExperience[] = []
	let verified = 0
	let rejected = 0
	let needsReview = 0
	const byLang: Record<string, number> = {}
	for (const d of m.destinations) {
		const page = kb.pages.get(d.pageId)
		if (!page || d.commit || d.kind === 'action' || PRIVATE_KINDS.has(page.kind) || page.requiresAuth) continue
		const contexts = [...new Set([d.pageId, ...(home ? [home] : [])])]
		const suggestedQuestions: Record<string, SuggestedQuestion[]> = {}
		for (const lang of m.site.languages) {
			const kept: SuggestedQuestion[] = []
			const keys = new Set<string>()
			// One question per intent (SPEC-06 §5: distinct intents), trying each intent's wordings in
			// order until the router understands one; an intent with none verified keeps its most
			// natural wording, unpublished, so the report says why.
			const byIntent = new Map<string, ReturnType<typeof candidatesFor>>()
			for (const c of candidatesFor(m, d, lang)) byIntent.set(c.intent, [...(byIntent.get(c.intent) || []), c])
			for (const group of byIntent.values()) {
				if (kept.filter((q) => q.validation.status === 'verified').length >= MAX_QUESTIONS) break
				let firstFailure: SuggestedQuestion | undefined
				let ok: SuggestedQuestion | undefined
				for (const c of group) {
					if (keys.has(questionKey(c.text))) continue
					const q = await validateCandidate(c, kb, settings, contexts)
					if (q.validation.status === 'verified') {
						ok = q
						break
					}
					firstFailure ||= q
				}
				if (ok) {
					kept.push(ok)
					keys.add(questionKey(ok.text))
					verified++
					byLang[lang] = (byLang[lang] || 0) + 1
				} else if (firstFailure) {
					kept.push(firstFailure)
					if (firstFailure.validation.status === 'rejected') rejected++
					else needsReview++
				}
			}
			if (kept.length) suggestedQuestions[lang] = kept
		}
		const r = ranking.get(d.id)
		destinations.push({
			destinationId: d.id,
			pageId: d.pageId,
			topic: d.collectionId || d.id,
			...(r ? { rank: r.rank, interestBand: r.band, evidenceBucket: r.bucket } : {}),
			minimumCohortMet: !!r,
			suggestedQuestions,
		})
	}
	const body = { siteId: m.site.id, kbVersionId: m.version.id, destinations }
	const profile: SiteExperienceProfile = {
		standard: EXPERIENCE_STANDARD,
		id: `exp-${m.version.id}-${createHash('sha256').update(stableStringify(body)).digest('hex').slice(0, 8)}`,
		siteId: m.site.id,
		kbVersionId: m.version.id,
		generatedAt: (o.now || new Date()).toISOString(),
		...(o.window ? { window: o.window } : {}),
		generator: GENERATOR,
		cohort: { minimum: o.site.trail.aggregation.minCohort, aggregationEnabled: o.site.trail.aggregation.enabled },
		destinations,
	}
	const v = validateExperienceProfile(profile, m)
	const withQuestions = destinations.filter((d) => Object.values(d.suggestedQuestions).some((qs) => qs.some((q) => q.validation.status === 'verified'))).length
	o.log?.(`experience: ${destinations.length} destinations, ${withQuestions} with questions, ${verified} verified, ${rejected} rejected, ${needsReview} for review`)
	return { profile, stats: { destinations: destinations.length, withQuestions, verified, rejected, needsReview, byLang, ms: Math.round(performance.now() - t0) }, issues: v.issues }
}

/**
 * Ranks from approved counts: only destinations with at least `minCohort` contributions in the
 * window, never on private pages; sparse rows are suppressed rather than shown as zero.
 */
function rank(o: BuildExperienceOptions): Map<string, { rank: number; band: 'warm' | 'hot'; bucket: '20-49' | '50-199' | '200+' }> {
	const out = new Map<string, { rank: number; band: 'warm' | 'hot'; bucket: '20-49' | '50-199' | '200+' }>()
	if (!o.site.trail.aggregation.enabled || !o.counts?.length) return out
	const min = o.site.trail.aggregation.minCohort
	const totals = new Map<string, { warm: number; hot: number }>()
	for (const c of o.counts) {
		if (c.kbVersionId !== o.manifest.version.id) continue
		const t = totals.get(c.destinationId) || { warm: 0, hot: 0 }
		totals.set(c.destinationId, { warm: t.warm + c.warm, hot: t.hot + c.hot })
	}
	const pages = new Map(o.manifest.pages.map((p) => [p.id, p]))
	const dests = new Map(o.manifest.destinations.map((d) => [d.id, d]))
	const eligible = [...totals.entries()]
		.filter(([id, t]) => {
			const d = dests.get(id)
			const p = d ? pages.get(d.pageId) : undefined
			return d && p && !PRIVATE_KINDS.has(p.kind) && !p.requiresAuth && t.warm + t.hot >= min
		})
		.sort((a, b) => b[1].hot * 2 + b[1].warm - (a[1].hot * 2 + a[1].warm) || a[0].localeCompare(b[0]))
	eligible.forEach(([id, t], i) => {
		const n = t.warm + t.hot
		out.set(id, { rank: i + 1, band: t.hot * 2 >= n ? 'hot' : 'warm', bucket: n >= 200 ? '200+' : n >= 50 ? '50-199' : '20-49' })
	})
	return out
}

/**
 * For `npm run dev` and `npm run demo:live`: makes sure the active profile targets the active
 * knowledge version, using a committed profile when it matches, otherwise building one.
 */
export async function ensureExperienceProfile(store: Store, site: BuildExperienceOptions['site'], manifest: Manifest, committed?: SiteExperienceProfile | null, log: (m: string) => void = () => {}): Promise<SiteExperienceProfile | null> {
	if (!site.trail.enabled) return null
	const active = await store.getActiveExperienceProfile(site.id)
	if (active?.kbVersionId === manifest.version.id) return active
	let profile = committed && committed.kbVersionId === manifest.version.id && validateExperienceProfile(committed, manifest).ok ? committed : null
	if (!profile) {
		const r = await buildExperienceProfile({ manifest, site, log })
		if (r.issues.some((i) => i.level === 'error')) {
			log(`experience: profile has errors, not activated (${r.issues[0]?.message})`)
			return null
		}
		profile = r.profile
	}
	await store.putExperienceProfile(site.id, profile).catch(() => {})
	await store.activateExperienceProfile(site.id, profile.id)
	return profile
}
