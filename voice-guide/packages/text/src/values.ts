/**
 * Page values out of text (AGENTS.md 4.3; ADR-0059): prices with their currency, percentages,
 * instalments and stock phrases are removed, so a trace, a log or anything the guide says from the
 * knowledge base never carries one. Numbers that are part of a name ("25-55", "5 GB", "Flex 1400")
 * stay: only a number written with a currency, a percent sign or a stock phrase goes.
 * Western and Arabic-Indic digits alike. Pure.
 */

const D = '[0-9٠-٩۰-۹]'
const AMOUNT = `${D}[0-9٠-٩۰-۹.,٬٫]*`
const CURRENCY = '(?:egp|e\\.g\\.p|l\\.?e\\.?|le|pounds?|جنيه(?:ا|ًا)?|جنيهات|ج\\.?\\s?م|قرش)'

const PATTERNS: RegExp[] = [
	// 46 EGP, 1,400 LE, ٤٦ جنيه, 37ج.م, 46 EGP/month
	new RegExp(`${AMOUNT}\\s*${CURRENCY}(?:\\s*(?:/|per|في|كل)\\s*(?:month|mo|شهر|الشهر))?(?![\\p{L}])`, 'giu'),
	// EGP 46, LE 1,400
	new RegExp(`(?<![\\p{L}])${CURRENCY}\\s*${AMOUNT}`, 'giu'),
	// 20%, ٢٠٪, 20 percent
	new RegExp(`${AMOUNT}\\s*(?:%|٪|percent\\b|في المية|بالمية)`, 'giu'),
	// Stock: "only 3 left", "out of stock", "in stock", "نفذت الكمية", "متوفر", "غير متوفر"
	new RegExp(`\\bonly\\s+${AMOUNT}\\s+left\\b|\\b(?:out of|in)\\s+stock\\b|\\bsold out\\b|نفذت?\\s+الكمي[ةه]|غير\\s+متوفر|(?<![\\p{L}])متوفر(?![\\p{L}])|باقي\\s+${AMOUNT}\\s+(?:قطع[ةه]?|بس)`, 'giu'),
]

/** `text` with every price, percentage and stock phrase removed, spaces tidied. */
export function valueFree(text: string): string {
	let out = String(text || '')
	for (const re of PATTERNS) out = out.replace(re, ' ')
	return out
		.replace(/\s*([·•|،,])\s*(?=[·•|،,]|$)/g, '')
		.replace(/\s{2,}/g, ' ')
		.replace(/\s+([.,!?؟،])/g, '$1')
		.trim()
}

/** True when `text` holds a price, a percentage or a stock phrase. */
export function hasValue(text: string): boolean {
	return PATTERNS.some((re) => {
		re.lastIndex = 0
		const hit = re.test(String(text || ''))
		re.lastIndex = 0
		return hit
	})
}
