/**
 * Language detection, normalisation and tokenisation for Arabic (including
 * Egyptian dialect spellings) and English. Pure functions, used by the router,
 * the KB builder and the SDK. See ADR-0014.
 */

export type Lang = string

const ARABIC_LETTER = /[ء-ي٠-٩ٮ-ۓ۰-۹ݐ-ݿ]/g
const LATIN_LETTER = /[A-Za-z]/g

/** Primary language of a short text by script: 'ar' when Arabic letters dominate, else 'en'. */
export function detectLanguage(text: string, fallback: Lang = 'en'): Lang {
	const ar = (text.match(ARABIC_LETTER) || []).length
	const la = (text.match(LATIN_LETTER) || []).length
	if (ar === 0 && la === 0) return fallback
	return ar >= la ? 'ar' : 'en'
}

/** Text direction for a language. */
export function dirOf(lang: Lang): 'rtl' | 'ltr' {
	return ['ar', 'fa', 'he', 'ur'].includes(lang.slice(0, 2)) ? 'rtl' : 'ltr'
}

const TASHKEEL = /[ؐ-ًؚ-ٰٟۖ-ۭ]/g
const TATWEEL = /ـ/g

/**
 * Canonical form for matching (never for display):
 * - Arabic: drop diacritics and tatweel, unify alef/hamza/ya/ta marbuta forms
 * - digits: Arabic-Indic and Eastern Arabic-Indic to ASCII
 * - Latin: lower case, strip accents
 */
export function normalize(input: string): string {
	let s = input.normalize('NFKC')
	s = s.replace(TASHKEEL, '').replace(TATWEEL, '')
	s = s
		.replace(/[أإآٱ]/g, 'ا')
		.replace(/ى/g, 'ي')
		.replace(/ؤ/g, 'و')
		.replace(/ئ/g, 'ي')
		.replace(/ة/g, 'ه')
		.replace(/ء/g, '')
	s = s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
	s = s.replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
	s = s.replace(/[،]/g, ',').replace(/[؛]/g, ';').replace(/[؟]/g, '?')
	s = s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').normalize('NFC')
	return s
}

/** Split into word tokens; letters and digits are split apart ("10gb" -> "10", "gb"). */
export function words(normalized: string): string[] {
	const out: string[] = []
	for (const m of normalized.matchAll(/[\p{L}\p{N}]+/gu)) {
		const w = m[0]
		for (const part of w.split(/(?<=\p{N})(?=\p{L})|(?<=\p{L})(?=\p{N})/u)) if (part) out.push(part)
	}
	return out
}

/** True when a token is written in Arabic script. */
export function isArabicToken(t: string): boolean {
	return /[ء-ي]/.test(t)
}
