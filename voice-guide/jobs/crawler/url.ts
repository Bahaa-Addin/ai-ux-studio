/**
 * URL rules shared by the Playwright crawler and the in-browser crawler (ADR-0012, ADR-0032).
 * Pure functions only: this module is bundled into the browser crawler.
 */

export interface UrlRules {
	/** Query parameters that identify a different page (the shop's `categoryUrls`). Others are dropped. */
	keepQuery?: string[]
	/** Appended to paths ending in `/` (fixture servers need `index.html`; real sites do not). */
	directoryIndex?: string
}

export function normalizeUrl(u: string, rules: UrlRules = {}): string {
	const url = new URL(u)
	url.hash = ''
	const keep = rules.keepQuery || []
	const params = new URLSearchParams()
	for (const k of keep) {
		const v = url.searchParams.get(k)
		if (v !== null) params.set(k, v)
	}
	url.search = params.toString()
	if (rules.directoryIndex && url.pathname.endsWith('/')) url.pathname += rules.directoryIndex
	return url.toString()
}

export interface Scope {
	origins: string[]
	include: string[]
	exclude: string[]
}

/** True when the URL is on an allowed origin, matches an include pattern and no exclude pattern. */
export function makeInScope(scope: Scope): (u: string) => boolean {
	const include = scope.include.map((r) => new RegExp(r))
	const exclude = scope.exclude.map((r) => new RegExp(r))
	const origins = new Set(scope.origins.map((o) => new URL(o).origin))
	return (u: string) => {
		let url: URL
		try {
			url = new URL(u)
		} catch {
			return false
		}
		if (!origins.has(url.origin)) return false
		if (include.length && !include.some((r) => r.test(u))) return false
		if (exclude.some((r) => r.test(u))) return false
		// Pages, not files: no extension, or .html/.htm.
		return /\.html?$|\/[^.]*$/.test(url.pathname)
	}
}

/** Signs that a page needs a signed-in account (public-only crawls skip these). */
export const LOGIN_URL = /\/(login|signin|sign-in|sso|auth|oauth)(\/|$|\?)/i

/** Titles of bot-protection and error interstitials: a crawl that sees these must stop, not retry. */
export const CHALLENGE_TITLE = /(access denied|attention required|just a moment|are you a robot|captcha|request rejected|forbidden|too many requests)/i
