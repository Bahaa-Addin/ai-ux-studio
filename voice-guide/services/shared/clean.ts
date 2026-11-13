/**
 * What a trace, a log line or a saved agent step may hold of a string (AGENTS.md 4.3, 4.4;
 * ADR-0059; e-shop plan step E3): personal data masked with the browser's own rules (ADR-0018),
 * prices, percentages and stock phrases removed, every URL cut to its origin and path plus the
 * query values that are plainly not personal, and a length cap. Numbers, booleans and the shape
 * of objects stay; identifiers (a knowledge version, a destination id, a hash) pass as they are.
 * A string is cut before any pattern runs, so a long one costs no more than a short one. Pure.
 */
import { normalize, stem, valueFree } from '#text'

import { maskContent } from '../../packages/sdk/src/agent-mask.ts'

const URL_IN_TEXT = /\bhttps?:\/\/[^\s"'<>]+/gi
/** Query keys whose values may stay, when they are short and hold nothing personal: the ones that name a page or a view (AIXC-85). */
const PAGE_KEY = /^(categoryUrls?|category|tab|page|sort|lang|type|view|section|filter)$/i
/** Attributes that are identifiers: kept as they are, so traces still join the knowledge base (AIXC-87). */
const ID_KEY = /^(id|ids|hash|kbVersion|versionId|model|provider)$|Id$|Ids$/
/** How much past the cap a string is read before it is cleaned. */
const SLACK = 64

/** A URL as a trace keeps it: origin and path, and only the page's own query values that are short, not personal and hold no page value. */
export function cleanUrl(url: string): string {
	try {
		const u = new URL(String(url).slice(0, 2048))
		const q = new URLSearchParams()
		for (const [k, v] of u.searchParams) if (PAGE_KEY.test(k) && v.length <= 40 && maskContent(v) === v && valueFree(v) === v.trim()) q.set(k, v)
		const qs = q.toString()
		return `${u.origin}${u.pathname}${qs ? `?${qs}` : ''}`
	} catch {
		return ''
	}
}

/** Cut a string to what will be kept, plus a little: a number cut in half at the edge is dropped, never left in pieces. */
function head(s: string, max: number): string {
	const t = String(s)
	return t.length > max + SLACK ? t.slice(0, max + SLACK).replace(/[\d٠-٩۰-۹][\d٠-٩۰-۹\s.()+/-]*$/u, '') : t
}
const cap = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s)

/** A string as a trace or a log keeps it. */
export function cleanText(s: string, max = 300): string {
	return cap(valueFree(maskContent(head(s, max).replace(URL_IN_TEXT, (u) => cleanUrl(u)))), max)
}

/** The person's own words: masked, but their prices stay, since they are not the page's (AIXC-89). */
export function cleanWords(s: string, max = 300): string {
	return cap(maskContent(head(s, max).replace(URL_IN_TEXT, (u) => cleanUrl(u))), max)
}

/** Each site's own words: its knowledge base's labels, titles, button texts and synonyms, as written and as stems. */
const vocabularies = new Map<string, Set<string>>()

/** Registers a site's own words (called when its knowledge base is loaded). */
export function setVocabulary(siteId: string, texts: Iterable<string>): void {
	const set = new Set<string>()
	for (const t of texts)
		for (const m of normalize(String(t)).matchAll(/\p{L}+/gu)) {
			set.add(m[0])
			set.add(stem(m[0]))
		}
	vocabularies.set(siteId, set)
}

/**
 * The person's words as a trace keeps them (owner, 2026-11-13; AIXC-94): masked, and only the words
 * the site itself uses; every other run of words becomes "…". A name or an address the site does not
 * use is never kept. With no vocabulary for the site, only the masks are left.
 */
export function siteWords(s: string, siteId: string, max = 300): string {
	const vocab = vocabularies.get(siteId)
	const out: string[] = []
	for (const w of cleanWords(s, max).split(/\s+/).filter(Boolean)) {
		const mask = /\[(phone|card|email|national-id|number)\]/.exec(w)?.[0]
		const key = normalize(w).replace(/[^\p{L}]+/gu, '')
		const keep = mask || (key && (vocab?.has(key) || vocab?.has(stem(key))) ? w : '')
		if (keep) out.push(keep)
		else if (out.at(-1) !== '…') out.push('…')
	}
	return out.join(' ')
}

/**
 * Every string in `v`, at any depth up to 4, cleaned; long lists cut at 50 entries. `words` names the
 * keys that hold the person's own words: with `site`, only the site's own words of them are kept
 * (AIXC-94); without, they are masked only.
 */
export function cleanAttrs<T>(v: T, max = 300, words: readonly string[] = [], site?: string, depth = 0, key = ''): T {
	if (typeof v === 'string') return (ID_KEY.test(key) ? v.slice(0, 200) : words.includes(key) ? (site ? siteWords(v, site, max) : cleanWords(v, max)) : cleanText(v, max)) as T
	if (v === null || typeof v !== 'object') return v
	if (depth >= 4) return undefined as T
	if (Array.isArray(v)) return v.slice(0, 50).map((x) => cleanAttrs(x, max, words, site, depth + 1, key)) as T
	const out: Record<string, unknown> = {}
	for (const [k, x] of Object.entries(v as Record<string, unknown>)) out[k] = cleanAttrs(x, max, words, site, depth + 1, k)
	return out as T
}
