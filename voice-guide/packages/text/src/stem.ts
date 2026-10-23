/**
 * Light stemmers. Retrieval only needs related forms to meet, not linguistic
 * correctness: "الباقات", "باقة", "باقه" all reduce to "باق"; "bundles" and
 * "bundle" to "bundl"... close enough for BM25. See ADR-0014.
 */
import { isArabicToken } from './normalize.ts'

const AR_PREFIXES = ['وال', 'بال', 'كال', 'فال', 'لل', 'ال']
// Normalised forms (ة -> ه, ى -> ي). Longest first.
const AR_SUFFIXES = ['ها', 'ان', 'ات', 'ون', 'ين', 'يه', 'ه', 'ي']

/** Light stemming in the style of Larkey's light10, on normalised text. */
export function stemArabic(token: string): string {
	let t = token
	if (t.length > 3 && t.startsWith('و')) t = t.slice(1)
	for (const p of AR_PREFIXES) {
		if (t.startsWith(p) && t.length - p.length >= 2) {
			t = t.slice(p.length)
			break
		}
	}
	for (const s of AR_SUFFIXES) {
		if (t.endsWith(s) && t.length - s.length >= 2) {
			t = t.slice(0, -s.length)
			break
		}
	}
	return t
}

const VOWEL = /[aeiouy]/

function undouble(t: string): string {
	const a = t.at(-1)
	const b = t.at(-2)
	if (a && a === b && !'lsz'.includes(a)) return t.slice(0, -1)
	return t
}

/** A deliberately small English suffix stripper (plural, -ing, -ed, final e). */
export function stemEnglish(token: string): string {
	const t = token
	if (t.length <= 3) return t
	const dropE = (s: string) => (s.length > 4 && s.endsWith('e') && !s.endsWith('ee') ? s.slice(0, -1) : s)
	if (t.endsWith('ies') && t.length > 4) return t.slice(0, -3) + 'y'
	if (t.endsWith('sses')) return t.slice(0, -2)
	if (t.endsWith('ing') && t.length > 5 && VOWEL.test(t.slice(0, -3))) return undouble(t.slice(0, -3))
	if (t.endsWith('ed') && t.length > 4 && VOWEL.test(t.slice(0, -2))) return undouble(t.slice(0, -2))
	if (t.endsWith('es') && /(ch|sh|x|z|ss)es$/.test(t)) return t.slice(0, -2)
	if (t.endsWith('s') && !t.endsWith('ss') && !t.endsWith('us') && t.length > 3) return dropE(t.slice(0, -1))
	return dropE(t)
}

export function stem(token: string): string {
	if (/^\d+$/.test(token)) return token
	return isArabicToken(token) ? stemArabic(token) : stemEnglish(token)
}
