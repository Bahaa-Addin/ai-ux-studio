/**
 * Site knowledge standard, version 0.1 (ADR-0011).
 *
 * One manifest describes one site at one point in time: its pages (with
 * language variants), the destinations people ask for, repeating collections
 * (bundle cards, price lists), flows (subscribe), visuals with text
 * descriptions, and the lexicon (synonyms, intent phrases). Manifests are
 * immutable; a new crawl publishes a new version (ADR-0012).
 */
import * as z from 'zod/v4'

export const STANDARD = 'site-knowledge/0.1' as const

const Id = z.string().regex(/^[a-z0-9][a-z0-9._:-]*$/i, 'ids use letters, digits, dot, dash, underscore, colon')
const LangCode = z.string().regex(/^[a-z]{2,3}(-[A-Za-z0-9]+)*$/)
/** Text per language, e.g. { ar: 'باقات', en: 'Bundles' }. */
export const I18nText = z.record(LangCode, z.string())
/** Lists per language, e.g. labels or example requests. */
export const I18nList = z.record(LangCode, z.array(z.string()))
export const Provenance = z.enum(['auto', 'curated', 'merged'])

/**
 * Where something is on a page. Several CSS locators, most stable first, then
 * visible text (per language) as the last resort. `within: 'item'` means the
 * locators are relative to the collection item the plan is working on.
 */
export const Target = z.object({
	css: z.array(z.string().min(1)).min(1),
	text: I18nText.optional(),
	role: z.string().optional(),
	within: z.enum(['page', 'item']).optional(),
})

export const PageVariant = z.object({
	url: z.url(),
	title: z.string(),
})

export const Page = z.object({
	id: Id,
	kind: z.enum(['content', 'listing', 'checkout', 'account', 'login', 'help']).default('content'),
	/** One entry per language, keyed by language code. */
	variants: z.record(LangCode, PageVariant),
	requiresAuth: z.boolean().optional(),
	summary: I18nText.optional(),
	provenance: Provenance,
})

/** How to read an answer out loud from the live page (values are never cached). */
export const AnswerSpec = z.object({
	fields: z.record(z.string(), Target).optional(),
	template: I18nText.optional(),
	maxChars: z.number().int().positive().optional(),
})

export const Destination = z.object({
	id: Id,
	pageId: Id,
	kind: z.enum(['page', 'section', 'item', 'action', 'visual', 'collection', 'faq']),
	/** Absent for kind 'page': the top of the page is the destination. */
	target: Target.optional(),
	labels: I18nList,
	examples: I18nList.optional(),
	description: I18nText.optional(),
	/** Clicks that make the target visible (tabs, accordions), in order. */
	reveal: z.array(Target).optional(),
	answer: AnswerSpec.optional(),
	watchable: z.boolean().optional(),
	/** Pressing this commits the user (purchase, plan change). The guide never clicks it. */
	commit: z.boolean().optional(),
	collectionId: Id.optional(),
	visualId: Id.optional(),
	/** Flow ids that apply here, e.g. ['subscribe'] on a bundle collection. */
	flows: z.array(Id).optional(),
	/**
	 * Prior for ambiguous requests (default 1). "Cheapest internet bundle" fits mobile
	 * and home internet; the more commonly meant one gets a higher priority. Set from
	 * curation now, from pilot analytics later (ADR-0014).
	 */
	priority: z.number().min(0.1).max(3).optional(),
	provenance: Provenance,
})

export const FieldSpec = z.object({
	/** CSS relative to the item element. */
	css: z.string().min(1),
	type: z.enum(['text', 'number', 'money', 'data']),
	/** Unit word to read out, per language. */
	unit: I18nText.optional(),
})

/** Repeating items with comparable fields (bundle cards, price rows). */
export const Collection = z.object({
	id: Id,
	pageId: Id,
	itemCss: z.string().min(1),
	/** Attribute that identifies an item across crawls and languages (e.g. data-bundle). */
	keyAttr: z.string().optional(),
	nameField: z.string().default('name'),
	fields: z.record(z.string(), FieldSpec),
	labels: I18nList,
	provenance: Provenance,
})

const StepClick = z.object({ op: z.literal('click'), target: Target })
const StepNavigate = z.object({ op: z.literal('navigate'), pageId: Id })
const StepWaitForPage = z.object({ op: z.literal('waitForPage'), pageId: Id })
const StepSpotlight = z.object({ op: z.literal('spotlight'), target: Target, caption: I18nText.optional() })
const StepSay = z.object({ op: z.literal('say'), text: I18nText })
const StepConfirm = z.object({ op: z.literal('confirm'), target: Target, message: I18nText })
export const FlowStep = z.discriminatedUnion('op', [StepClick, StepNavigate, StepWaitForPage, StepSpotlight, StepSay, StepConfirm])

/**
 * A known multi-step journey, optionally bound to an item of a collection.
 * The planner prepends the steps that reach the item (navigate, reveal, pick).
 */
export const Flow = z.object({
	id: Id,
	labels: I18nList,
	examples: I18nList.optional(),
	appliesTo: z.object({ collectionIds: z.array(Id).min(1) }).optional(),
	steps: z.array(FlowStep).min(1),
	provenance: Provenance,
})

export const Visual = z.object({
	id: Id,
	pageId: Id,
	kind: z.enum(['image', 'canvas', 'svg', 'webgl', 'video']),
	target: Target,
	description: I18nText,
	source: z.enum(['metadata', 'vision', 'curated']),
	confidence: z.number().min(0).max(1),
})

export const Lexicon = z.object({
	/** Groups of interchangeable words across languages and dialects. */
	synonyms: z.array(z.array(z.string()).min(2)).default([]),
	/** Extra phrases per intent id (see router intents), per language. */
	intents: z.record(z.string(), I18nList).default({}),
})

export const Site = z.object({
	id: Id,
	name: I18nText,
	origins: z.array(z.url()).min(1),
	languages: z.array(LangCode).min(1),
	defaultLanguage: LangCode,
})

export const Version = z.object({
	id: z.string(),
	createdAt: z.iso.datetime(),
	hash: z.string(),
	crawl: z
		.object({
			id: z.string(),
			startedAt: z.iso.datetime(),
			pages: z.number().int().nonnegative(),
		})
		.optional(),
})

export const Manifest = z.object({
	standard: z.literal(STANDARD),
	site: Site,
	version: Version,
	pages: z.array(Page),
	destinations: z.array(Destination),
	collections: z.array(Collection).default([]),
	flows: z.array(Flow).default([]),
	visuals: z.array(Visual).default([]),
	lexicon: Lexicon.default({ synonyms: [], intents: {} }),
})

export type I18nText = z.infer<typeof I18nText>
export type I18nList = z.infer<typeof I18nList>
export type Target = z.infer<typeof Target>
export type Page = z.infer<typeof Page>
export type AnswerSpec = z.infer<typeof AnswerSpec>
export type Destination = z.infer<typeof Destination>
export type FieldSpec = z.infer<typeof FieldSpec>
export type Collection = z.infer<typeof Collection>
export type FlowStep = z.infer<typeof FlowStep>
export type Flow = z.infer<typeof Flow>
export type Visual = z.infer<typeof Visual>
export type Lexicon = z.infer<typeof Lexicon>
export type Site = z.infer<typeof Site>
export type Manifest = z.infer<typeof Manifest>
export type ManifestInput = z.input<typeof Manifest>
