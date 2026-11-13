/**
 * Search structures built once per manifest version, cached per process
 * (ADR-0010: hot reads in process, refreshed when the active version changes).
 */
import type { Collection, Destination, Flow, Manifest, Page, Visual } from '#kb'
import { buildSynonyms, type Doc, guidePointsIn, RetrievalIndex, type SynonymMap, terms } from '#text'

import { setVocabulary } from './clean.ts'
import type { Store } from './store/index.ts'

export interface KbIndex {
	manifest: Manifest
	versionId: string
	dest: Map<string, Destination>
	pages: Map<string, Page>
	collections: Map<string, Collection>
	visuals: Map<string, Visual>
	flows: Map<string, Flow>
	/** Stemmed label words per flow, for intent detection. */
	flowTerms: Map<string, Set<string>>
	itemsByCollection: Map<string, Destination[]>
	/** Normalised variant URL -> page and language. */
	pageByUrl: Map<string, { pageId: string; lang: string }>
	/** The page and language a URL belongs to: exact variant, then redirect alias (T-303). */
	pageFor(url: string): { pageId: string; lang: string } | undefined
	index: RetrievalIndex
	synonyms: SynonymMap
}

/** A site's own short words: labels, page titles, button texts and synonyms; not long descriptions. */
export function vocabularyOf(m: Manifest): string[] {
	const out: string[] = []
	for (const d of m.destinations) out.push(...Object.values(d.labels || {}).flat(), ...Object.values(d.target?.text || {}))
	for (const c of m.collections) out.push(...Object.values(c.labels || {}).flat())
	for (const p of m.pages) out.push(...Object.values(p.variants).map((v) => v.title))
	out.push(...(m.lexicon?.synonyms || []).flat())
	return out.filter((t) => typeof t === 'string')
}

/**
 * A destination's guide points (ADR-0059 §2): the price and stock its labels and target text name,
 * as they were when the page was crawled. Used to rank and find ("around 50 pounds"), never said or
 * shown: the live page answers. The lowest amount is the one a card starts from.
 */
export function guidePoints(d: Destination): { price?: number; monthly?: number; stock?: 'in' | 'out' } {
	const found = [...Object.values(d.labels || {}).flat(), ...Object.values(d.target?.text || {})].map(guidePointsIn)
	const low = (ns: number[]) => (ns.length ? Math.min(...ns) : undefined)
	// An instalment is kept apart: "999 a month" is not a 999 card (AIXC-104).
	return { price: low(found.flatMap((f) => f.prices)), monthly: low(found.flatMap((f) => f.monthly)), stock: found.find((f) => f.stock)?.stock }
}

export function variantKey(url: string, keepQuery: string[] = []): string {
	try {
		const u = new URL(url)
		let p = u.pathname
		if (p.endsWith('/')) p += 'index.html'
		const q = new URLSearchParams()
		for (const k of keepQuery) {
			const v = u.searchParams.get(k)
			if (v !== null) q.set(k, v)
		}
		const qs = q.toString()
		return `${u.origin}${p}${qs ? `?${qs}` : ''}`
	} catch {
		return url
	}
}

export function buildKbIndex(m: Manifest): KbIndex {
	const synonyms = buildSynonyms(m.lexicon.synonyms)
	const pages = new Map(m.pages.map((p) => [p.id, p]))
	const collections = new Map(m.collections.map((c) => [c.id, c]))
	const docs: Doc[] = m.destinations.map((d) => {
		const all = (l?: Record<string, string[]>) => Object.values(l || {}).flat()
		const page = pages.get(d.pageId)
		const pageTitles = page ? Object.values(page.variants).map((v) => v.title) : []
		const col = d.collectionId ? collections.get(d.collectionId) : undefined
		return {
			id: d.id,
			fields: [
				{ text: all(d.labels).join(' . '), weight: 3 },
				{ text: all(d.examples).join(' . '), weight: 2 },
				{ text: Object.values(d.description || {}).join(' . '), weight: 0.5 },
				{ text: pageTitles.join(' . '), weight: d.kind === 'page' ? 1 : 0.5 },
				{ text: d.kind === 'item' && col ? all(col.labels).join(' . ') : '', weight: 0.5 },
			],
			names: [...all(d.labels), ...all(d.examples)],
		}
	})
	const pageByUrl = new Map<string, { pageId: string; lang: string }>()
	const keep = m.site.keepQuery || []
	for (const p of m.pages)
		for (const [lang, v] of Object.entries(p.variants)) {
			pageByUrl.set(variantKey(v.url, keep), { pageId: p.id, lang })
			for (const a of v.aliases || []) if (!pageByUrl.has(variantKey(a, keep))) pageByUrl.set(variantKey(a, keep), { pageId: p.id, lang })
		}
	const pageFor = (url: string) => pageByUrl.get(variantKey(url, keep))
	const itemsByCollection = new Map<string, Destination[]>()
	for (const d of m.destinations) if (d.kind === 'item' && d.collectionId) itemsByCollection.set(d.collectionId, [...(itemsByCollection.get(d.collectionId) || []), d])
	// Flow intent words are the verbs ("subscribe", "اشترك"), not the objects they act on
	// ("bundle", "باقة"): words that also name the flow's collections or items are dropped.
	const flowTerms = new Map<string, Set<string>>()
	for (const f of m.flows) {
		const objects = new Set<string>()
		for (const cid of f.appliesTo?.collectionIds || []) {
			const words = [
				...Object.values(collections.get(cid)?.labels || {}).flat(),
				...m.destinations.filter((d) => d.collectionId === cid).flatMap((d) => Object.values(d.labels).flat()),
			]
			for (const w of words) for (const t of terms(w, synonyms)) objects.add(t)
		}
		flowTerms.set(f.id, new Set(Object.values(f.labels).flat().flatMap((l) => terms(l)).filter((t) => !objects.has(t))))
	}
	return {
		manifest: m,
		versionId: m.version.id,
		dest: new Map(m.destinations.map((d) => [d.id, d])),
		pages,
		collections,
		visuals: new Map(m.visuals.map((v) => [v.id, v])),
		flows: new Map(m.flows.map((f) => [f.id, f])),
		flowTerms,
		itemsByCollection,
		pageByUrl,
		pageFor,
		index: new RetrievalIndex(docs, { synonyms }),
		synonyms,
	}
}

/** Active manifest per site, re-checked at most every `checkMs`. */
export class KbCache {
	#entries = new Map<string, { index: KbIndex; checkedAt: number }>()
	readonly store: Store
	readonly checkMs: number
	constructor(store: Store, checkMs = 5000) {
		this.store = store
		this.checkMs = checkMs
	}

	async get(siteId: string): Promise<KbIndex | null> {
		const e = this.#entries.get(siteId)
		const now = Date.now()
		if (e && now - e.checkedAt < this.checkMs) return e.index
		const activeId = await this.store.getActiveKbId(siteId)
		if (!activeId) return null
		if (e && e.index.versionId === activeId) {
			e.checkedAt = now
			return e.index
		}
		const m = await this.store.getKbVersion(siteId, activeId)
		if (!m) return null
		const index = buildKbIndex(m)
		this.#entries.set(siteId, { index, checkedAt: now })
		// The site's own words, the only words of a request its traces keep (AIXC-94).
		setVocabulary(siteId, vocabularyOf(m))
		return index
	}

	invalidate(siteId?: string) {
		if (siteId) this.#entries.delete(siteId)
		else this.#entries.clear()
	}
}
