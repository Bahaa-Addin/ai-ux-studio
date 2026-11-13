/**
 * What a trace, a log line or a saved agent step may hold of a string (AGENTS.md 4.3, 4.4;
 * ADR-0059; e-shop plan step E3): personal data masked with the browser's own rules (ADR-0018),
 * prices, percentages and stock phrases removed, every URL cut to its origin and path plus the
 * query values that are plainly not personal, and a length cap. Numbers, booleans and the shape
 * of objects stay. Pure.
 */
import { valueFree } from '#text'

import { maskContent } from '../../packages/sdk/src/agent-mask.ts'

const URL_IN_TEXT = /\bhttps?:\/\/[^\s"'<>]+/gi
/** Query keys whose values are never kept: anything that can name or reach a person, and tracking. */
const PRIVATE_KEY = /(token|code|otp|key|secret|session|auth|pass|pin|msisdn|phone|mobile|dial|number|email|mail|user|name|nid|national|card|account|address|^id$|^utm_|gclid|fbclid|^mc_)/i

/** A URL as a trace keeps it: origin and path, and only query values that are short, not personal and hold no page value. */
export function cleanUrl(url: string): string {
	try {
		const u = new URL(url)
		const q = new URLSearchParams()
		for (const [k, v] of u.searchParams) if (!PRIVATE_KEY.test(k) && v.length <= 40 && maskContent(v) === v && valueFree(v) === v.trim()) q.set(k, v)
		const qs = q.toString()
		return `${u.origin}${u.pathname}${qs ? `?${qs}` : ''}`
	} catch {
		return ''
	}
}

/** A string as a trace or a log keeps it. */
export function cleanText(s: string, max = 300): string {
	const out = valueFree(maskContent(String(s).replace(URL_IN_TEXT, (u) => cleanUrl(u))))
	return out.length > max ? `${out.slice(0, max - 1)}…` : out
}

/** Every string in `v`, at any depth up to 4, cleaned; long lists cut at 50 entries. */
export function cleanAttrs<T>(v: T, max = 300, depth = 0): T {
	if (typeof v === 'string') return cleanText(v, max) as T
	if (v === null || typeof v !== 'object') return v
	if (depth >= 4) return undefined as T
	if (Array.isArray(v)) return v.slice(0, 50).map((x) => cleanAttrs(x, max, depth + 1)) as T
	const out: Record<string, unknown> = {}
	for (const [k, x] of Object.entries(v as Record<string, unknown>)) out[k] = cleanAttrs(x, max, depth + 1)
	return out as T
}
