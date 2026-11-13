/**
 * Page values out of text (AGENTS.md 4.3; ADR-0059): prices with their currency, percentages,
 * instalments and stock phrases are removed, so a trace, a log or anything the guide says from the
 * knowledge base never carries one. Numbers that are part of a name ("25-55", "5 GB", "Flex 1400")
 * stay: only a number written with a currency, a percent sign or a stock phrase goes.
 * Western and Arabic-Indic digits alike. Pure.
 */

const D = '[0-9٠-٩۰-۹]'
// Read from the start of a number only, so a long run of digits is tried once (AIXC-81).
const AMOUNT = `(?<![0-9٠-٩۰-۹.,٬٫])${D}[0-9٠-٩۰-۹.,٬٫]*`
// Pounds and piasters as Vodafone writes them, bare "ج" included (AIXC-92): "ب6.5ج", "50 PT", "10 قروش", "£E 20".
const CURRENCY = '(?:egp|e\\.g\\.p|l\\.?e\\.?|le|£e|e£|£|pounds?|piasters?|pt|جني[هة](?:ا|ًا)?|جنيهات|ج\\.?\\s?م|ج|قروش|قرش|\\$|usd|eur|€|sar|aed|ريال|درهم)'
const PER = '(?:\\s*(?:/|per|في|فى|كل)\\s*(?:month|mo|call|minute|min|شهر|الشهر|مكالمه|مكالمة|دقيقه|دقيقة))?'

const PATTERNS: RegExp[] = [
	// 46 EGP, 1,400 LE, ٤٦ جنيه, 37ج.م, 46 EGP/month, ب6.5ج في الشهر, 50 PT per call
	new RegExp(`${AMOUNT}\\s*${CURRENCY}${PER}(?![\\p{L}])`, 'giu'),
	// EGP 46, LE 1,400, £E 20
	new RegExp(`(?<![\\p{L}])${CURRENCY}\\s*${AMOUNT}${PER}`, 'giu'),
	// 20%, %20, ٢٠٪, 20 percent, 20 في المية; not URL encoding ("%D8%A7")
	new RegExp(`${AMOUNT}\\s*(?:%(?![0-9a-f]{2})|٪|percent\\b|ف[يى] الم[يئ][ةه]|بالمي[ةه])|(?<![0-9a-z])[%٪]\\s*${AMOUNT}`, 'giu'),
	// Stock in both languages and its spellings: "only 3 left", "Only 1 item left", "out-of-stock", "OutOfStock",
	// "low stock", "sold out", "نفدت الكمية", "غير متاح", "متوفرة", "آخر قطعة", "فاضل 2 قطعة".
	new RegExp(
		`\\bonly\\s+(?:one|${D}+)(?:\\s+\\p{L}+)?\\s+left\\b|\\b(?:out|in)[\\s_-]*of[\\s_-]*stock\\b|\\b(?:out|in)stock\\b|\\bin[\\s_-]stock\\b|\\blow[\\s_-]stock\\b|\\bsold[\\s_-]?out\\b|نف[دذ]ت?\\s+الكمي[ةه]|غير\\s+متا?ح[ةه]?|غير\\s+متوفر[ةه]?|(?<![\\p{L}])متوفر[ةه]?(?![\\p{L}])|[اآ]خر\\s+قطع[ةه]|(?:باقي|فاضل)\\s+${D}+\\s+(?:قطع[ةه]?|بس)`,
		'giu',
	),
]

/**
 * The words that only join a value to a sentence ("from 25 EGP up to 55 EGP", "بـ 46 جنيه", "starting at"):
 * they go with the value, so "Flex From 25 EGP up to 55 EGP" leaves "Flex", not "Flex From up to".
 */
const BEFORE = String.raw`(?:(?:from|starting(?:\s+(?:at|from))?|up\s+to|to|for|at|only|just|priced\s+at|price|من|بـ?|بسعر|سعر|يبدأ\s+من|ابتداء\s+من|ابتداءً\s+من|لحد|حتى|حتي|إلى|الى|الي|ل|فقط|بس)\s*)*`
const AFTER = String.raw`(?:\s*(?:only|each|فقط|بس))*`
const JOINED = new RegExp(`${BEFORE}\u0000${AFTER}`, 'giu')

/** `text` with every price, percentage and stock phrase removed, with the words that joined them, spaces tidied. */
export function valueFree(text: string): string {
	let out = String(text || '')
	for (const re of PATTERNS) out = out.replace(re, ' \u0000 ')
	return out
		.replace(JOINED, ' ')
		.replace(/\u0000/g, ' ')
		.replace(/\(\s*\)|\[\s*\]/g, '')
		.replace(/\s+([)\]])/g, '$1')
		.replace(/\s*([·•|،,])\s*(?=[·•|،,]|$)/g, '')
		.replace(/\s{2,}/g, ' ')
		.replace(/\s+([.,!?؟،])/g, '$1')
		.trim()
}

const AMOUNT_CURRENCY = new RegExp(`(${AMOUNT})\\s*${CURRENCY}(\\s*(?:/|per|a|في|فى|كل)\\s*(?:month|mo|شهر|الشهر))?(?![\\p{L}])|(?<![\\p{L}])${CURRENCY}\\s*(${AMOUNT})(\\s*(?:/|per|a|في|فى|كل)\\s*(?:month|mo|شهر|الشهر))?`, 'giu')
// The gate's own stock wordings (AIXC-104): out first, so "غير متوفر" is not read as "متوفر".
const OUT_OF_STOCK = new RegExp(`\\b(?:out)[\\s_-]*of[\\s_-]*stock\\b|\\boutstock\\b|\\bsold[\\s_-]?out\\b|نف[دذ]ت?\\s+الكمي[ةه]|غير\\s+متا?ح[ةه]?|غير\\s+متوفر[ةه]?`, 'iu')
const IN_STOCK = new RegExp(`\\bin[\\s_-]*(?:of[\\s_-]*)?stock\\b|\\binstock\\b|\\blow[\\s_-]stock\\b|\\bonly\\s+(?:one|${D}+)(?:\\s+\\p{L}+)?\\s+left\\b|(?<![\\p{L}])متوفر[ةه]?(?![\\p{L}])|[اآ]خر\\s+قطع[ةه]|(?:باقي|فاضل)\\s+${D}+\\s+(?:قطع[ةه]?|بس)`, 'iu')

/** A written amount as a number: Arabic-Indic digits, thousands separators and decimal marks of either script. */
function amountOf(s: string): number {
	const ascii = s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x6f0))
	return Number(ascii.replace(/[,٬]/g, '').replace('٫', '.').replace(/\.$/, ''))
}

/**
 * The guide points in `text` (ADR-0059 §2): amounts written with a currency, and whether it says in or
 * out of stock. For ranking and finding only: never said or shown.
 */
export function guidePointsIn(text: string): { prices: number[]; monthly: number[]; stock?: 'in' | 'out' } {
	const t = String(text || '')
	const prices: number[] = []
	const monthly: number[] = []
	// An amount a month with a term ("EGP 999/month for 24 months", "تقسيط") is an instalment, not the
	// card's price; a bundle's "46 EGP/month" is its price (AIXC-104).
	const instalment = /\b(?:for|over|x)\s*\d+\s*months?\b|\binstal?lments?\b|تقسيط|(?:على|لمدة)\s*[\d٠-٩]+\s*شهر/iu.test(t)
	for (const m of t.matchAll(AMOUNT_CURRENCY)) {
		const n = amountOf(m[1] || m[3] || '')
		if (Number.isFinite(n) && n > 0) ((m[2] || m[4]) && instalment ? monthly : prices).push(n)
	}
	return { prices, monthly, stock: OUT_OF_STOCK.test(t) ? 'out' : IN_STOCK.test(t) ? 'in' : undefined }
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
