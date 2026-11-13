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
	// 20%, ٢٠٪, 20 percent; not URL encoding ("%D8%A7")
	new RegExp(`${AMOUNT}\\s*(?:%(?![0-9a-f]{2})|٪|percent\\b|في المية|بالمية)`, 'giu'),
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

const AMOUNT_CURRENCY = new RegExp(`(${AMOUNT})\\s*${CURRENCY}(?![\\p{L}])|(?<![\\p{L}])${CURRENCY}\\s*(${AMOUNT})`, 'giu')
const OUT_OF_STOCK = /\bout of stock\b|\bsold out\b|نفذت?\s+الكمي[ةه]|غير\s+متوفر/iu
const IN_STOCK = /\bin stock\b|\bonly\s+\S+\s+left\b|(?<![\p{L}])متوفر(?![\p{L}])/iu

/** A written amount as a number: Arabic-Indic digits, thousands separators and decimal marks of either script. */
function amountOf(s: string): number {
	const ascii = s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x6f0))
	return Number(ascii.replace(/[,٬]/g, '').replace('٫', '.').replace(/\.$/, ''))
}

/**
 * The guide points in `text` (ADR-0059 §2): amounts written with a currency, and whether it says in or
 * out of stock. For ranking and finding only: never said or shown.
 */
export function guidePointsIn(text: string): { prices: number[]; stock?: 'in' | 'out' } {
	const t = String(text || '')
	const prices = [...t.matchAll(AMOUNT_CURRENCY)].map((m) => amountOf(m[1] || m[2] || '')).filter((n) => Number.isFinite(n) && n > 0)
	return { prices, stock: OUT_OF_STOCK.test(t) ? 'out' : IN_STOCK.test(t) ? 'in' : undefined }
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
