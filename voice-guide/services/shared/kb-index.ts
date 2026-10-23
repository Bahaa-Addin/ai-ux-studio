/**
 * Search structures built once per manifest version, cached per process
 * (ADR-0010: hot reads in process, refreshed when the active version changes).
 */
import type { Collection, Destination, Flow, Manifest, Page, Visual } from '#kb'
import { buildSynonyms, type Doc, RetrievalIndex, type SynonymMap, terms } from '#text'

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
	index: RetrievalIndex
	synonyms: SynonymMap
}

export function variantKey(url: string): string {
	try {
		const u = new URL(url)
		let p = u.pathname
		if (p.endsWith('/')) p += 'index.html'
		return `${u.origin}${p}`
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
	for (const p of m.pages) for (const [lang, v] of Object.entries(p.variants)) pageByUrl.set(variantKey(v.url), { pageId: p.id, lang })
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
		return index
	}

	invalidate(siteId?: string) {
		if (siteId) this.#entries.delete(siteId)
		else this.#entries.clear()
	}
}
