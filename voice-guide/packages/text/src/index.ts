export { detectLanguage, dirOf, isArabicToken, normalize, words, type Lang } from './normalize.ts'
export { stem, stemArabic, stemEnglish } from './stem.ts'
export { STOPWORDS } from './stopwords.ts'
export {
	buildSynonyms,
	containment,
	jaccard,
	RetrievalIndex,
	termGroups,
	terms,
	trigrams,
	type Doc,
	type Field,
	type Hit,
	type IndexOptions,
	type SynonymMap,
} from './retrieval.ts'

/** Numbers in a string, after normalisation (handles Arabic-Indic digits and decimal commas). */
export function numbersIn(text: string): number[] {
	const out: number[] = []
	const s = text
		.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
		.replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
		.replace(/٫/g, '.')
	for (const m of s.matchAll(/\d+(?:[.,]\d+)?/g)) out.push(Number(m[0].replace(',', '.')))
	return out
}
