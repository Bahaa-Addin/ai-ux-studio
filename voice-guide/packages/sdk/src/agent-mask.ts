/**
 * Personal data rules for the fallback agent (ADR-0018; live-site safety rules, T-308):
 *  - masking: page content is masked before it leaves the browser, and again by the agent
 *    proxy (which imports these same rules);
 *  - refusals: the agent never types credentials, one-time codes, card numbers or national IDs,
 *    even when the person said them (AGENTS.md §4.2).
 */

const AR_DIGITS = /[٠-٩]/g
/** Arabic-Indic digits to ASCII, so one set of patterns covers both. */
export const asciiDigitsOf = (s: string): string => s.replace(AR_DIGITS, (d) => String(d.charCodeAt(0) - 0x660))

/** Order matters: the most specific pattern first. */
const RULES: [RegExp, string][] = [
	[/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]'],
	// Egyptian national ID: 14 digits, century digit 2 or 3.
	[/(?<![\w\d])[23]\d{13}(?![\w\d])/g, '[national-id]'],
	// An Egyptian mobile written in groups ("010 1234 5678", "+20 10 1234 5678", "0101-234-5678"):
	// spaces, dashes, dots or brackets between the digits, and no further digits after it (a longer
	// run is a card or an account number, below).
	[/(?<![\w\d])(?:\(?(?:\+|00)20\)?[ \u00a0\u202f.\-–—]{0,3}\(?1[0125]\)?|\(?01[0125]\)?)(?:[ \u00a0\u202f.\-–—]{0,3}\d){8}(?![\w\d])(?![ \u00a0\u202f.\-–—]{1,3}\d)/g, '[phone]'],
	[/(?<![\w\d])(?:\d[ -]?){13,19}(?![\w\d])/g, '[card]'],
	[/(?<![\w\d])(?:\+?20|0)1[0125]\d{8}(?![\w\d])/g, '[phone]'],
	// Any other long number (account and line numbers); prices and amounts are shorter.
	[/(?<![\w\d.,])\d{10,}(?![\w\d])/g, '[number]'],
]

export function maskContent(content: string, onMask?: (kind: string) => void): string {
	let out = asciiDigitsOf(content)
	for (const [re, label] of RULES)
		out = out.replace(re, () => {
			onMask?.(label)
			return label
		})
	return out
}

export interface FieldInfo {
	type?: string
	autocomplete?: string
	name?: string
	id?: string
	placeholder?: string
	label?: string
}

const SECRET_WORDS = /(password|passcode|passwd|\bpin\b|otp|one[ -]?time|verification code|security code|cvv|cvc|card number|national id|كلمة (ال)?سر|كلمة المرور|الرقم السري|رمز (التحقق|التأكيد)|كود (التحقق|التأكيد)|الرقم القومي|رقم البطاقة|رقم الكارت)/i

/** Why the agent must not type into this field, or null. */
export function secretField(f: FieldInfo): string | null {
	if ((f.type || '').toLowerCase() === 'password') return 'a password field'
	const ac = (f.autocomplete || '').toLowerCase()
	if (/one-time-code|current-password|new-password|^cc-|\bcc-/.test(ac)) return `a field for ${ac}`
	const words = [f.name, f.id, f.placeholder, f.label].filter(Boolean).join(' ')
	const m = SECRET_WORDS.exec(words)
	return m ? `a field for "${m[0]}"` : null
}

/** Why this value must never be typed (a card number or national ID), or null. */
export function secretValue(text: string): string | null {
	const digits = asciiDigitsOf(text).replace(/[\s-]/g, '')
	if (/^[23]\d{13}$/.test(digits)) return 'a national ID number'
	if (/^\d{13,19}$/.test(digits)) return 'a card number'
	return null
}

/** The refusal the agent gets for an `input_text` call, or null when typing is allowed. */
export function inputRefusal(task: string, text: string, field: FieldInfo | null): string | null {
	const why = secretValue(text) || (field ? secretField(field) : null)
	if (why) return `❌ Refused: that is ${why}. The person types it themselves; tell them where.`
	const said = asciiDigitsOf(task).replace(/\s+/g, '')
	if (!said.includes(asciiDigitsOf(text).replace(/\s+/g, ''))) return `❌ Refused: "${text}" was not said by the user. Ask the user for it instead.`
	return null
}

/** What the agent can see of a field, for `secretField`. */
export function fieldInfo(el: Element | null | undefined): FieldInfo | null {
	if (!el || !(el instanceof HTMLElement)) return null
	const i = el as HTMLInputElement
	const labels = 'labels' in i && i.labels ? [...i.labels].map((l) => l.textContent || '').join(' ') : ''
	return { type: i.type, autocomplete: i.getAttribute('autocomplete') || '', name: i.name, id: i.id, placeholder: i.getAttribute('placeholder') || '', label: `${labels} ${i.getAttribute('aria-label') || ''}`.trim() }
}
