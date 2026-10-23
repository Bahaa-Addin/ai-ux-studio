/**
 * Retrieval over knowledge base entries: BM25 over weighted fields, plus a
 * character-trigram similarity that tolerates spelling variants and typos in
 * either script. One index holds every language; Arabic and English tokens
 * never collide. See ADR-0014.
 */
import { normalize, words } from './normalize.ts'
import { stem } from './stem.ts'
import { STOPWORDS } from './stopwords.ts'

export interface Field {
	text: string
	/** Relative importance, e.g. labels 3, examples 2, description 1. */
	weight: number
}

export interface Doc {
	id: string
	fields: Field[]
	/** Strings compared with trigram similarity (usually labels). */
	names: string[]
}

export interface Hit {
	id: string
	/** Relative score in this result set (0..1), used for ranking. */
	score: number
	bm25: number
	trigram: number
	/** Share of the query's words (weighted by rarity) that this entry matched (0..1): an absolute signal. */
	coverage: number
}

/** Tokens used for retrieval: normalised, stopwords removed, stemmed. */
export function terms(text: string, synonyms?: SynonymMap): string[] {
	return termGroups(text, synonyms).flat()
}

/** One group per query word: its stem followed by the stems of its synonyms. */
export function termGroups(text: string, synonyms?: SynonymMap): string[][] {
	const out: string[][] = []
	for (const w of words(normalize(text))) {
		if (STOPWORDS.has(w)) continue
		const s = stem(w)
		const group = [s]
		for (const g of synonyms?.get(s) || []) if (g !== s) group.push(g)
		out.push(group)
	}
	return out
}

/** Map from a stemmed term to the stemmed members of its synonym group. */
export type SynonymMap = Map<string, string[]>

export function buildSynonyms(groups: string[][]): SynonymMap {
	const map: SynonymMap = new Map()
	for (const group of groups) {
		const stems = [...new Set(group.flatMap((g) => terms(g)))]
		for (const s of stems) map.set(s, [...new Set([...(map.get(s) || []), ...stems])])
	}
	return map
}

export function trigrams(text: string): Set<string> {
	const s = ` ${words(normalize(text))
		.filter((w) => !STOPWORDS.has(w))
		.join(' ')} `
	const grams = new Set<string>()
	for (let i = 0; i < s.length - 2; i++) grams.add(s.slice(i, i + 3))
	return grams
}

export function jaccard(a: Set<string>, b: Set<string>): number {
	if (a.size === 0 || b.size === 0) return 0
	let inter = 0
	for (const g of a) if (b.has(g)) inter++
	return inter / (a.size + b.size - inter)
}

/** Containment of the query's trigrams in the name: favours short queries inside long names. */
export function containment(query: Set<string>, name: Set<string>): number {
	if (query.size === 0) return 0
	let inter = 0
	for (const g of query) if (name.has(g)) inter++
	return inter / query.size
}

export interface IndexOptions {
	k1?: number
	b?: number
	synonyms?: SynonymMap
	/** Weight of BM25 vs trigram similarity in the final score (0..1). */
	bm25Weight?: number
}

export class RetrievalIndex {
	readonly #k1: number
	readonly #b: number
	readonly #w: number
	readonly #synonyms?: SynonymMap
	readonly #docs = new Map<string, { tf: Map<string, number>; len: number; names: Set<string>[] }>()
	readonly #df = new Map<string, number>()
	#avgLen = 0

	constructor(docs: Doc[], options: IndexOptions = {}) {
		this.#k1 = options.k1 ?? 1.2
		this.#b = options.b ?? 0.75
		this.#w = options.bm25Weight ?? 0.7
		this.#synonyms = options.synonyms
		let total = 0
		for (const d of docs) {
			const tf = new Map<string, number>()
			let len = 0
			for (const f of d.fields) {
				for (const t of terms(f.text)) {
					tf.set(t, (tf.get(t) || 0) + f.weight)
					len += f.weight
				}
			}
			for (const t of tf.keys()) this.#df.set(t, (this.#df.get(t) || 0) + 1)
			this.#docs.set(d.id, { tf, len, names: d.names.filter(Boolean).map(trigrams) })
			total += len
		}
		this.#avgLen = docs.length ? total / docs.length : 1
	}

	get size(): number {
		return this.#docs.size
	}

	#idf(t: string): number {
		const n = this.#docs.size
		const df = this.#df.get(t) || 0
		return Math.log(1 + (n - df + 0.5) / (df + 0.5))
	}

	/**
	 * Score every document. `boost` multiplies a document's final score
	 * (e.g. documents on the current page).
	 */
	search(query: string, opts: { limit?: number; filter?: (id: string) => boolean; boost?: (id: string) => number } = {}): Hit[] {
		const groups = termGroups(query, this.#synonyms)
		const uniqueGroups = [...new Map(groups.map((g) => [g.join('|'), g])).values()]
		const groupWeight = groups.map((g) => Math.max(...g.map((t) => this.#idf(t))))
		const totalWeight = groupWeight.reduce((a, b) => a + b, 0) || 1
		const qGrams = trigrams(query)
		const raw: Hit[] = []
		for (const [id, d] of this.#docs) {
			if (opts.filter && !opts.filter(id)) continue
			// Each query word counts once, through its best-matching synonym, so a document that
			// lists many synonyms of one word does not outrank one that matches every word.
			let bm25 = 0
			for (const g of uniqueGroups) {
				let best = 0
				for (const t of g) {
					const f = d.tf.get(t)
					if (!f) continue
					const norm = f + this.#k1 * (1 - this.#b + (this.#b * d.len) / this.#avgLen)
					best = Math.max(best, this.#idf(t) * ((f * (this.#k1 + 1)) / norm))
				}
				bm25 += best
			}
			let covered = 0
			groups.forEach((g, i) => {
				if (g.some((t) => d.tf.has(t))) covered += groupWeight[i]
			})
			let tri = 0
			for (const n of d.names) tri = Math.max(tri, 0.5 * jaccard(qGrams, n) + 0.5 * containment(qGrams, n))
			raw.push({ id, score: 0, bm25, trigram: tri, coverage: groups.length ? covered / totalWeight : 0 })
		}
		const maxB = Math.max(1e-9, ...raw.map((h) => h.bm25))
		for (const h of raw) {
			const b = h.bm25 / maxB
			h.score = (this.#w * b + (1 - this.#w) * h.trigram) * (opts.boost ? opts.boost(h.id) : 1)
			// Keep an absolute signal: a perfect relative BM25 on a nonsense query must not look confident.
			if (h.bm25 === 0) h.score *= 0.5
		}
		raw.sort((a, b) => b.score - a.score || b.bm25 - a.bm25)
		return raw.slice(0, opts.limit ?? 10)
	}
}
