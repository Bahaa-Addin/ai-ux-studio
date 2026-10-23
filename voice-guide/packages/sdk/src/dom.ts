/**
 * Finding things on the page (ADR-0015): multi-locator targets with a visible-
 * text fallback, values parsed from live text, and the commit guard.
 */
import type { Target } from '#kb'

const ARABIC_DIGITS = /[٠-٩]/g
const PERSIAN_DIGITS = /[۰-۹]/g

export function asciiDigits(s: string): string {
	return s.replace(ARABIC_DIGITS, (d) => String(d.charCodeAt(0) - 0x0660)).replace(PERSIAN_DIGITS, (d) => String(d.charCodeAt(0) - 0x06f0))
}

/** First number in a text, e.g. "٢٥٠ جنيه / شهريًا" -> 250, "7.5 GB" -> 7.5. */
export function parseNumber(text: string): number | null {
	const s = asciiDigits(text).replace(/٫/g, '.').replace(/٬/g, ',')
	const m = /(\d{1,3}(?:,\d{3})+|\d+)(?:[.,](\d+))?/.exec(s)
	if (!m) return null
	return Number(m[1].replace(/,/g, '') + (m[2] ? `.${m[2]}` : ''))
}

/** Data amounts in GB, so "500 MB" compares correctly with "2 GB". */
export function parseData(text: string): number | null {
	const n = parseNumber(text)
	if (n === null) return null
	const t = asciiDigits(text).toLowerCase()
	if (/\btb\b|تيرا/.test(t)) return n * 1024
	if (/\bmb\b|ميجابايت|ميجا(?!بت)/.test(t)) return n / 1024
	return n
}

export function normText(s: string): string {
	return asciiDigits(s)
		.normalize('NFKC')
		.replace(/[ً-ٰٟـ]/g, '')
		.replace(/[أإآ]/g, 'ا')
		.replace(/ى/g, 'ي')
		.replace(/ة/g, 'ه')
		.replace(/\s+/g, ' ')
		.trim()
		.toLowerCase()
}

export function visible(el: Element): boolean {
	if (!(el instanceof HTMLElement) && !(el instanceof SVGElement)) return false
	if (el.closest('[hidden]')) return false
	const r = el.getBoundingClientRect()
	if (r.width === 0 && r.height === 0) return false
	const cs = getComputedStyle(el)
	return cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0
}

const TEXT_CANDIDATES = 'a, button, [role="tab"], [role="button"], summary, h1, h2, h3, h4, label, [role="menuitem"]'

/** Resolves a target now, or returns null. `item` scopes targets with within: 'item'. */
export function locateNow(t: Target, opts: { item?: Element | null; lang: string; root?: ParentNode }): Element | null {
	const scope: ParentNode = t.within === 'item' && opts.item ? opts.item : opts.root || document
	let fallback: Element | null = null
	for (const css of t.css) {
		if (css === ':scope') {
			if (opts.item) return opts.item
			continue
		}
		let els: Element[]
		try {
			els = [...scope.querySelectorAll(css)]
		} catch {
			continue
		}
		const vis = els.find(visible)
		if (vis) return vis
		fallback ??= els[0] || null
	}
	// Visible text is the last resort (ADR-0011): only when no selector matched at all.
	// A hidden match stays the answer, so "is the hidden tab panel visible?" is never
	// answered by a visible tab button that happens to carry the same words.
	if (fallback) return fallback
	const text = t.text?.[opts.lang] ?? Object.values(t.text || {})[0]
	if (text) {
		const want = normText(text)
		const cands = [...scope.querySelectorAll(TEXT_CANDIDATES)].filter((e) => !e.closest('vg-guide'))
		const exact = cands.find((e) => normText(e.textContent || '') === want && visible(e))
		if (exact) return exact
		const partial = cands.find((e) => normText(e.textContent || '').includes(want) && visible(e))
		if (partial) return partial
	}
	return null
}

/** Waits up to `timeoutMs` for a target to appear. */
export async function locate(t: Target, opts: { item?: Element | null; lang: string; timeoutMs?: number; signal?: AbortSignal }): Promise<Element | null> {
	const deadline = performance.now() + (opts.timeoutMs ?? 4000)
	for (;;) {
		opts.signal?.throwIfAborted()
		const el = locateNow(t, opts)
		if (el) return el
		if (performance.now() > deadline) return null
		await new Promise((r) => setTimeout(r, 100))
	}
}

/** Text a person would read, with spaces between blocks. */
export function readText(el: Element, maxChars = 400): string {
	const t = (el as HTMLElement).innerText ?? el.textContent ?? ''
	return t.replace(/\s+/g, ' ').trim().slice(0, maxChars)
}

/**
 * Commit points from the knowledge base (ADR-0015). The guide never clicks
 * them and the agent never sees them.
 */
export class CommitGuard {
	readonly selectors: string[]
	constructor(targets: string[][]) {
		this.selectors = targets.flat()
	}
	elements(): Element[] {
		const out: Element[] = []
		for (const css of this.selectors) {
			try {
				out.push(...document.querySelectorAll(css))
			} catch {}
		}
		return out
	}
	blocks(el: Element): boolean {
		if (this.elements().some((c) => c === el || c.contains(el))) return true
		// Belt and braces: a submit button of a payment form is a commit point even if the KB missed it.
		const form = el.closest('form')
		const isSubmit = (el instanceof HTMLButtonElement && el.type === 'submit') || (el instanceof HTMLInputElement && el.type === 'submit')
		return !!form && isSubmit && !!form.querySelector('[autocomplete^="cc-"], input[name*="card" i], input[value="card"], input[name="pay"]')
	}
}
