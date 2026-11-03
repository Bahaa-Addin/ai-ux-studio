/**
 * Suggested-question candidates from the knowledge base (ADR-0036, SPEC-06 §5): localized
 * templates over manifest facts, never a per-hover model call. Each candidate names the facts it
 * rests on (evidence) and the destination the router must reach; `validate.ts` decides which
 * ones are published. Arabic is written in the Egyptian register the guide already speaks
 * ("إيه أرخص باقة نت؟"), not translated from the English.
 */
import { type Collection, type Destination, type Manifest, MAX_CHIP_CHARS, type QuestionIntent } from '#kb'

export interface Candidate {
	/** Stable per destination, template and locale, so ids survive rebuilds. */
	id: string
	/** The explored destination the chip is shown for. */
	destinationId: string
	lang: string
	text: string
	intent: QuestionIntent
	template: string
	expectedDestinationId: string
	evidenceRefs: string[]
	/** Router intents that count as a correct reading of this question. */
	expectIntents: string[]
	/** For comparisons: the selector the router must apply (`min-price`, `max-data`). */
	expectSelect?: string
}

interface Ctx {
	m: Manifest
	d: Destination
	lang: string
	name: string
	collection?: Collection
	collectionName?: string
}

type Template = {
	id: string
	intent: QuestionIntent
	applies(c: Ctx): boolean
	/** Wordings per locale, most natural first; validation keeps the first one the router understands. */
	text: Record<string, ((c: Ctx) => string)[]>
	evidence(c: Ctx): string[]
	expect(c: Ctx): { dest: string; intents: string[]; select?: string }
}

const first = (l: Record<string, string[]> | undefined, lang: string) => l?.[lang]?.[0]?.trim()
const isQuestion = (s: string) => /[?؟]\s*$/.test(s) || /^(how|what|where|when|which|can|do|does|is|are|إزاي|ازاي|إيه|ايه|فين|امتى|إمتى|ليه|هل|أنهي|انهي)\b/i.test(s)
/** A field the router can compare on (SPEC-06 §5 "comparing options"). */
const field = (c: Ctx, types: string[], names: RegExp) => Object.entries(c.collection?.fields || {}).find(([k, f]) => types.includes(f.type) && names.test(k))?.[0]

const TEMPLATES: Template[] = [
	// ---- an item of a collection (a bundle card) ----
	{
		id: 'item.included',
		intent: 'included',
		applies: (c) => c.d.kind === 'item' && !!c.collection && Object.keys(c.collection.fields).length > 1,
		text: { en: [(c) => `What's included in ${c.name}?`, (c) => `What does ${c.name} include?`, (c) => `What comes with ${c.name}?`], ar: [(c) => `مميزات ${c.name} إيه؟`, (c) => `${c.name} فيها إيه؟`, (c) => `إيه اللي في ${c.name}؟`] },
		evidence: (c) => [`kb:${c.d.id}#labels.${c.lang}`, `collection:${c.collection!.id}#fields`],
		expect: (c) => ({ dest: c.d.id, intents: ['navigate', 'describe'] }),
	},
	{
		id: 'item.subscribe',
		intent: 'next',
		applies: (c) => c.d.kind === 'item' && !!c.collection && c.m.flows.some((f) => f.id === 'subscribe' && f.appliesTo?.collectionIds.includes(c.collection!.id)),
		text: { en: [(c) => `How do I subscribe to ${c.name}?`], ar: [(c) => `أشترك في ${c.name} إزاي؟`, (c) => `إزاي أشترك في ${c.name}؟`] },
		evidence: (c) => [`kb:${c.d.id}#labels.${c.lang}`, 'flow:subscribe#steps'],
		expect: (c) => ({ dest: c.d.id, intents: ['flow:subscribe'] }),
	},
	{
		id: 'item.compare-price',
		intent: 'compare',
		applies: (c) => c.d.kind === 'item' && !!c.collectionName && !!field(c, ['money', 'number'], /price|cost|fee/i),
		text: { en: [(c) => `Which of the ${c.collectionName} is the cheapest?`], ar: [(c) => `إيه أرخص حاجة في ${c.collectionName}؟`] },
		evidence: (c) => [`collection:${c.collection!.id}#labels.${c.lang}`, `collection:${c.collection!.id}#fields.${field(c, ['money', 'number'], /price|cost|fee/i)}`],
		expect: (c) => ({ dest: collectionDest(c)?.id || '', intents: ['navigate'], select: 'min-price' }),
	},
	{
		id: 'item.about',
		intent: 'what',
		applies: (c) => c.d.kind === 'item',
		text: { en: [(c) => `Tell me about ${c.name}`], ar: [(c) => `احكيلي عن ${c.name}`, (c) => `عرّفني أكتر على ${c.name}`, (c) => `عايز أعرف عن ${c.name}`] },
		evidence: (c) => [`kb:${c.d.id}#labels.${c.lang}`, ...(c.collection ? [`collection:${c.collection.id}#fields`] : [])],
		expect: (c) => ({ dest: c.d.id, intents: ['navigate', 'describe'] }),
	},
	// ---- a list of items (a bundle group) ----
	{
		id: 'collection.show',
		intent: 'what',
		applies: (c) => c.d.kind === 'collection',
		text: { en: [(c) => `Show me the ${c.name}`], ar: [(c) => `وريني ${c.name}`] },
		evidence: (c) => [`kb:${c.d.id}#labels.${c.lang}`],
		expect: (c) => ({ dest: c.d.id, intents: ['navigate', 'describe'] }),
	},
	{
		id: 'collection.compare-price',
		intent: 'compare',
		applies: (c) => c.d.kind === 'collection' && !!field(c, ['money', 'number'], /price|cost|fee/i),
		text: { en: [(c) => `Which of the ${c.name} is the cheapest?`], ar: [(c) => `إيه أرخص حاجة في ${c.name}؟`] },
		evidence: (c) => [`kb:${c.d.id}#labels.${c.lang}`, `collection:${c.collection!.id}#fields.${field(c, ['money', 'number'], /price|cost|fee/i)}`],
		expect: (c) => ({ dest: c.d.id, intents: ['navigate'], select: 'min-price' }),
	},
	{
		id: 'collection.compare-data',
		intent: 'compare',
		applies: (c) => c.d.kind === 'collection' && !!field(c, ['data'], /data|quota|gb/i),
		text: { en: [(c) => `Which of the ${c.name} has the most data?`], ar: [(c) => `أنهي واحدة في ${c.name} فيها أكبر داتا؟`] },
		evidence: (c) => [`kb:${c.d.id}#labels.${c.lang}`, `collection:${c.collection!.id}#fields.${field(c, ['data'], /data|quota|gb/i)}`],
		expect: (c) => ({ dest: c.d.id, intents: ['navigate'], select: 'max-data' }),
	},
	// ---- a frequently asked question: its own wording is the best chip ----
	{
		id: 'faq.self',
		intent: 'faq',
		applies: (c) => c.d.kind === 'faq' && isQuestion(c.name),
		text: { en: [(c) => c.name], ar: [(c) => c.name] },
		evidence: (c) => [`kb:${c.d.id}#labels.${c.lang}`, `kb:${c.d.id}#target`],
		expect: (c) => ({ dest: c.d.id, intents: ['navigate', 'describe'] }),
	},
	// ---- a section of a page (an offer, a panel) ----
	{
		id: 'section.about',
		intent: 'what',
		applies: (c) => c.d.kind === 'section',
		text: { en: [(c) => `Tell me about the ${c.name}`], ar: [(c) => `احكيلي عن ${c.name}`, (c) => `عرّفني أكتر على ${c.name}`] },
		evidence: (c) => [`kb:${c.d.id}#labels.${c.lang}`, `kb:${c.d.id}#target`],
		expect: (c) => ({ dest: c.d.id, intents: ['navigate', 'describe'] }),
	},
	{
		id: 'section.show',
		intent: 'what',
		applies: (c) => c.d.kind === 'section',
		text: { en: [(c) => `Show me the ${c.name}`], ar: [(c) => `وريني ${c.name}`] },
		evidence: (c) => [`kb:${c.d.id}#labels.${c.lang}`, `kb:${c.d.id}#target`],
		expect: (c) => ({ dest: c.d.id, intents: ['navigate', 'describe'] }),
	},
	// ---- a section that has a page of its own elsewhere ("Vodafone Cash" on Services → the Vodafone Cash page) ----
	{
		id: 'section.related',
		intent: 'next',
		applies: (c) => (c.d.kind === 'section' || c.d.kind === 'collection') && !!relatedPage(c),
		text: { en: [(c) => `Tell me about ${c.name}`, (c) => `Open the ${c.name} page`], ar: [(c) => `احكيلي عن ${c.name}`, (c) => `افتحلي صفحة ${c.name}`] },
		evidence: (c) => [`kb:${c.d.id}#labels.${c.lang}`, `kb:${relatedPage(c)!.id}#labels.${c.lang}`],
		expect: (c) => ({ dest: relatedPage(c)!.id, intents: ['navigate', 'describe'] }),
	},
	// ---- a picture, chart or map described at crawl time ----
	{
		id: 'visual.show',
		intent: 'what',
		// A picture labelled only with the site's name (a hero banner) has nothing specific to ask about.
		// One-word labels are usually file names or alt fragments ("pablo"), not something to ask about.
		applies: (c) => c.d.kind === 'visual' && !!c.d.visualId && c.name.trim().includes(' ') && !/^(banner|chart|image|picture|بانر|صورة|رسم بياني)$/i.test(c.name) && c.name !== c.m.site.name[c.lang],
		text: { en: [(c) => `What does the ${c.name} show?`], ar: [(c) => `اشرحلي ${c.name}`] },
		evidence: (c) => [`kb:${c.d.id}#labels.${c.lang}`, `visual:${c.d.visualId}#description.${c.lang}`],
		expect: (c) => ({ dest: c.d.id, intents: ['describe', 'navigate'] }),
	},
	// ---- a whole page (a link or call to action that led somewhere) ----
	{
		id: 'page.go',
		intent: 'page',
		applies: (c) => c.d.kind === 'page',
		text: { en: [(c) => `Take me to ${c.name}`, (c) => `Open the ${c.name} page`], ar: [(c) => `وديني على ${c.name}`, (c) => `افتحلي صفحة ${c.name}`, (c) => `روح على ${c.name}`] },
		evidence: (c) => [`page:${c.d.pageId}#variants.${c.lang}.title`],
		expect: (c) => ({ dest: c.d.id, intents: ['navigate'] }),
	},
]

const fold = (t: string) => t.toLowerCase().replace(/[إأآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/[\u064B-\u0652]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\b(the|page)\b/g, '').trim()

/** Another page whose own name is this section's name: where a question about it really goes. */
function relatedPage(c: Ctx): Destination | undefined {
	const name = fold(c.name)
	if (name.length < 3) return undefined
	return c.m.destinations.find((x) => x.kind === 'page' && x.pageId !== c.d.pageId && (x.labels[c.lang] || []).some((l) => fold(l) === name))
}

function collectionDest(c: Ctx): Destination | undefined {
	return c.collection ? c.m.destinations.find((x) => x.kind === 'collection' && x.collectionId === c.collection!.id) : undefined
}

/** Candidates for one destination in one locale, in preference order (validation keeps the first that pass). */
export function candidatesFor(m: Manifest, d: Destination, lang: string): Candidate[] {
	const name = first(d.labels, lang)
	if (!name) return []
	const collection = d.collectionId ? m.collections.find((c) => c.id === d.collectionId) : undefined
	const ctx: Ctx = { m, d, lang, name, collection, collectionName: collection ? first(collection.labels, lang) : undefined }
	const out: Candidate[] = []
	for (const tpl of TEMPLATES) {
		const wordings = tpl.text[lang]
		if (!wordings || !tpl.applies(ctx)) continue
		const e = tpl.expect(ctx)
		if (!e.dest) continue
		for (const [i, write] of wordings.entries()) {
			const text = write(ctx).replace(/\s+/g, ' ').trim()
			// Too long for a chip: never a candidate (long labels get no question rather than a cut one).
			if (text.length > MAX_CHIP_CHARS) continue
			out.push({
				id: `${d.id}:${tpl.id}${i ? `.${i}` : ''}:${lang}`,
				destinationId: d.id,
				lang,
				text,
				intent: tpl.intent,
				template: tpl.id,
				expectedDestinationId: e.dest,
				evidenceRefs: tpl.evidence(ctx),
				expectIntents: e.intents,
				expectSelect: e.select,
			})
		}
	}
	return out
}
