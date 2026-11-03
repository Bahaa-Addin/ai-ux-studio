/**
 * Site experience profile, version 1 (ADR-0036, SPEC-06 §5).
 *
 * A separate, versioned artifact next to the site knowledge manifest: for the destinations
 * people explore, up to three suggested questions per locale, each validated through the router,
 * and (only after approved aggregation met its cohort) a coarse rank. It targets exactly one
 * knowledge version (`kbVersionId`) and never carries recordings, coordinates or selectors.
 */
import * as z from 'zod/v4'

import type { Manifest } from './manifest.ts'

export const EXPERIENCE_STANDARD = 'site-experience-profile/v1' as const

const Id = z.string().regex(/^[a-z0-9][a-z0-9._:-]*$/i)
const LangCode = z.string().regex(/^[a-z]{2,3}(-[A-Za-z0-9]+)*$/)

/** Where a question's answer comes from in the manifest: `kb:<destination>#labels.en`, `collection:<id>#fields.data`, `page:<id>#summary.ar`, `flow:<id>`. */
export const EvidenceRef = z.string().regex(/^(kb|collection|page|flow|visual):[a-z0-9][a-z0-9._:-]*(#[\w.-]+)?$/i)

export const QuestionIntent = z.enum(['what', 'included', 'compare', 'next', 'faq', 'page'])

export const SuggestedQuestion = z.object({
	id: Id,
	text: z.string().min(3).max(80),
	intent: QuestionIntent,
	evidenceRefs: z.array(EvidenceRef).min(1),
	expectedDestinationId: Id,
	/** What the router understood when it was validated (`navigate`, `describe`, `flow:subscribe`, ...). */
	routerIntent: z.string().optional(),
	provenance: z.object({
		generator: z.enum(['template', 'curated', 'model']),
		template: z.string().optional(),
		model: z.string().optional(),
	}),
	validation: z.object({
		status: z.enum(['verified', 'rejected', 'needs-review']),
		routerConfidence: z.number().min(0).max(1).optional(),
		/** Each starting page the question was routed from, and what happened. */
		contexts: z.array(z.object({ pageId: Id, destinationId: z.string().optional(), route: z.string(), ok: z.boolean() })).default([]),
		reasons: z.array(z.string()).default([]),
	}),
})

export const DestinationExperience = z.object({
	destinationId: Id,
	pageId: Id,
	/** Destinations that share a topic are near-variants (items of one collection): the trail shows at most one per topic first. */
	topic: z.string().optional(),
	/** Present only when approved aggregation met the cohort threshold (ADR-0037 §6). */
	rank: z.number().int().positive().optional(),
	interestBand: z.enum(['warm', 'hot']).optional(),
	evidenceBucket: z.enum(['20-49', '50-199', '200+']).optional(),
	minimumCohortMet: z.boolean().default(false),
	suggestedQuestions: z.record(LangCode, z.array(SuggestedQuestion)),
})

export const SiteExperienceProfile = z.object({
	standard: z.literal(EXPERIENCE_STANDARD),
	id: z.string().min(1),
	siteId: Id,
	/** The one knowledge version this profile was built and validated against. */
	kbVersionId: z.string().min(1),
	generatedAt: z.iso.datetime(),
	window: z.object({ from: z.iso.date(), to: z.iso.date() }).optional(),
	generator: z.object({ name: z.string(), version: z.string() }),
	cohort: z.object({ minimum: z.number().int().positive(), aggregationEnabled: z.boolean() }),
	destinations: z.array(DestinationExperience),
})

/**
 * The only thing the browser may ever send about attention, and only when approved aggregation is
 * on (ADR-0037 §6): destination ids and coarse bands for one UTC day. Strict: any other key fails.
 */
export const INTEREST_CONTRIBUTION = 'vg-interest-contribution/v1' as const
export const MAX_CONTRIBUTIONS = 10
export const InterestContributionBatch = z.strictObject({
	schema: z.literal(INTEREST_CONTRIBUTION),
	siteId: Id,
	kbVersionId: z.string().min(1).max(80),
	dayBucket: z.iso.date(),
	contributions: z
		.array(z.strictObject({ pageId: Id, destinationId: Id, interestBand: z.enum(['warm', 'hot']), activated: z.boolean() }))
		.min(1)
		.max(MAX_CONTRIBUTIONS),
})
export type InterestContributionBatch = z.infer<typeof InterestContributionBatch>

export type EvidenceRef = z.infer<typeof EvidenceRef>
export type QuestionIntent = z.infer<typeof QuestionIntent>
export type SuggestedQuestion = z.infer<typeof SuggestedQuestion>
export type DestinationExperience = z.infer<typeof DestinationExperience>
export type SiteExperienceProfile = z.infer<typeof SiteExperienceProfile>
export type SiteExperienceProfileInput = z.input<typeof SiteExperienceProfile>

/** A chip must fit on one line of a phone: at most this many characters. */
export const MAX_CHIP_CHARS = 60
/** Verified questions per destination and locale. */
export const MAX_QUESTIONS = 3

/** Words that would promise something or imply this person's eligibility (SPEC-06 §5). */
const PROMISES = /(?:^|[^a-z])(free|guaranteed?|guarantees|eligible|for me|my line|available to me|can i get)(?=[^a-z]|$)|مجان|مضمون|(?:^|\s)(ليا|خطي)(?=\s|$|[؟?])/i
/** Prices and other fast-changing values are read live, never baked into a question. */
const VOLATILE = /(?:^|[^a-z])(egp|le|usd|piastres?|percent)(?=[^a-z]|$)|[$€%٪]|جنيه|قرش/i

/** Normalised text for de-duplication: case, spacing, punctuation and Arabic letter variants. */
export function questionKey(text: string): string {
	return text
		.toLowerCase()
		.replace(/[؟?!.,،:;"'«»()]/g, ' ')
		.replace(/[إأآ]/g, 'ا')
		.replace(/ى/g, 'ي')
		.replace(/ة/g, 'ه')
		.replace(/\s+/g, ' ')
		.trim()
}

/** Text checks every published question must pass, whatever generated it. Returns reasons for failure. */
export function questionTextIssues(text: string, allowedNumbers: string): string[] {
	const out: string[] = []
	if (text.length > MAX_CHIP_CHARS) out.push(`longer than ${MAX_CHIP_CHARS} characters`)
	if (PROMISES.test(text)) out.push('promises something or implies eligibility')
	if (VOLATILE.test(text)) out.push('contains a price or other volatile value')
	// Numbers are allowed only when they are part of the name the question is about ("Mega 25").
	const digits = (s: string) => (s.match(/[0-9٠-٩]+/g) || []).map((d) => d.replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x0660)))
	const allowed = new Set(digits(allowedNumbers))
	for (const d of digits(text)) if (!allowed.has(d)) out.push(`number ${d} is not part of the destination's name`)
	return out
}

export interface ExperienceIssue {
	level: 'error' | 'warning'
	path: string
	message: string
}

/** Whether an evidence reference points at something that exists and is non-empty in the manifest. */
export function resolveEvidence(ref: string, m: Manifest): boolean {
	const [head, field] = ref.split('#')
	const colon = head.indexOf(':')
	const kind = head.slice(0, colon)
	const id = head.slice(colon + 1)
	const at = (obj: unknown, path: string | undefined): unknown => {
		if (!path) return obj
		let v: unknown = obj
		for (const k of path.split('.')) v = v && typeof v === 'object' ? (v as Record<string, unknown>)[k] : undefined
		return v
	}
	const present = (v: unknown) => v !== undefined && v !== null && (typeof v !== 'string' || v.trim().length > 0) && (!Array.isArray(v) || v.length > 0)
	if (kind === 'kb') return present(at(m.destinations.find((d) => d.id === id), field))
	if (kind === 'collection') return present(at(m.collections.find((c) => c.id === id), field))
	if (kind === 'page') return present(at(m.pages.find((p) => p.id === id), field))
	if (kind === 'flow') return present(at(m.flows.find((f) => f.id === id), field))
	if (kind === 'visual') return present(at(m.visuals.find((v) => v.id === id), field))
	return false
}

export interface ExperienceValidation {
	ok: boolean
	profile?: SiteExperienceProfile
	issues: ExperienceIssue[]
}

/**
 * Schema plus the join with the knowledge version it targets: every id must exist there, every
 * verified question must be grounded, short, deduplicated and free of prices and promises.
 */
export function validateExperienceProfile(input: unknown, m: Manifest): ExperienceValidation {
	const parsed = SiteExperienceProfile.safeParse(input)
	if (!parsed.success) return { ok: false, issues: parsed.error.issues.map((i) => ({ level: 'error' as const, path: i.path.join('.'), message: i.message })) }
	const p = parsed.data
	const issues: ExperienceIssue[] = []
	const err = (path: string, message: string) => issues.push({ level: 'error', path, message })
	if (p.siteId !== m.site.id) err('siteId', `profile is for ${p.siteId}, manifest is for ${m.site.id}`)
	if (p.kbVersionId !== m.version.id) err('kbVersionId', `profile targets ${p.kbVersionId}, manifest is ${m.version.id}`)
	const dests = new Map(m.destinations.map((d) => [d.id, d]))
	const pages = new Map(m.pages.map((pg) => [pg.id, pg]))
	const seen = new Set<string>()
	for (const [i, d] of p.destinations.entries()) {
		const at = `destinations.${i}`
		if (seen.has(d.destinationId)) err(at, `duplicate destination ${d.destinationId}`)
		seen.add(d.destinationId)
		const dest = dests.get(d.destinationId)
		if (!dest) err(at, `unknown destination ${d.destinationId}`)
		else if (dest.pageId !== d.pageId) err(at, `destination ${d.destinationId} is on ${dest.pageId}, not ${d.pageId}`)
		if (!pages.has(d.pageId)) err(at, `unknown page ${d.pageId}`)
		if ((d.rank !== undefined || d.interestBand !== undefined) && !d.minimumCohortMet) err(at, 'rank or interest band without a met cohort')
		for (const [lang, qs] of Object.entries(d.suggestedQuestions)) {
			const verified = qs.filter((q) => q.validation.status === 'verified')
			if (verified.length > MAX_QUESTIONS) err(`${at}.${lang}`, `${verified.length} verified questions, at most ${MAX_QUESTIONS}`)
			const keys = new Set<string>()
			for (const [j, q] of qs.entries()) {
				const qat = `${at}.suggestedQuestions.${lang}.${j}`
				if (!dests.has(q.expectedDestinationId)) err(qat, `unknown expected destination ${q.expectedDestinationId}`)
				// Unpublished questions are kept with the reasons they failed (often this very evidence).
				const level = q.validation.status === 'verified' ? 'error' : 'warning'
				for (const ref of q.evidenceRefs) if (!resolveEvidence(ref, m)) issues.push({ level, path: qat, message: `evidence ${ref} does not resolve` })
				if (q.validation.status !== 'verified') continue
				const key = questionKey(q.text)
				if (keys.has(key)) err(qat, 'duplicate question for this destination')
				keys.add(key)
				const names = dest ? Object.values(dest.labels).flat().join(' ') : ''
				const coll = dest?.collectionId ? Object.values(m.collections.find((c) => c.id === dest.collectionId)?.labels || {}).flat().join(' ') : ''
				for (const issue of questionTextIssues(q.text, `${names} ${coll}`)) err(qat, issue)
				if (!q.validation.contexts.length || q.validation.contexts.some((c) => !c.ok)) err(qat, 'verified without a passing router check from every context')
			}
		}
	}
	return { ok: !issues.some((x) => x.level === 'error'), profile: p, issues }
}

/** The questions a browser may show: verified only, at most three per locale. */
export function publishedQuestions(d: DestinationExperience): Record<string, { id: string; text: string; intent: QuestionIntent }[]> {
	const out: Record<string, { id: string; text: string; intent: QuestionIntent }[]> = {}
	for (const [lang, qs] of Object.entries(d.suggestedQuestions)) {
		const v = qs.filter((q) => q.validation.status === 'verified').slice(0, MAX_QUESTIONS)
		if (v.length) out[lang] = v.map((q) => ({ id: q.id, text: q.text, intent: q.intent }))
	}
	return out
}
