/**
 * What the trail may record (ADR-0037 §3, §4): canonical URLs without tracking noise, route
 * eligibility (public pages only), and the recorder's masking and blocking options. Pure apart
 * from `privateFieldsOnPage`, so it is unit-tested in Node.
 */
import { TRAIL_CONFIG } from './config.ts'

export interface SitePolicy {
	excludePaths: string[]
	privateSelectors: string[]
}

/**
 * The page a URL is, as the knowledge base keys it (`variantKey` on the server): origin and path,
 * `/` → `/index.html`, only the site's meaningful query parameters, never the hash.
 */
export function pageKey(url: string, keepQuery: readonly string[] = []): string {
	try {
		const u = new URL(url)
		let p = u.pathname
		if (p.endsWith('/')) p += 'index.html'
		const q = new URLSearchParams()
		for (const k of keepQuery) {
			const v = u.searchParams.get(k)
			if (v !== null) q.set(k, v)
		}
		const qs = q.toString()
		return `${u.origin}${p}${qs ? `?${qs}` : ''}`
	} catch {
		return url
	}
}

/**
 * Where a step is: origin and path, a trailing slash and `index.html` folded, tracking parameters
 * dropped; the hash and other parameters are dropped too unless the site says they make a different
 * page. What is stored on a step never has more than this.
 */
export function canonicalPath(url: string, keepQuery: readonly string[] = []): string {
	try {
		const u = new URL(url)
		const path = u.pathname.replace(/\/index\.html?$/i, '/').replace(/(.)\/$/, '$1')
		const q = new URLSearchParams()
		for (const k of keepQuery) {
			const v = u.searchParams.get(k)
			if (v !== null && !TRAIL_CONFIG.policy.trackingParams.test(k)) q.set(k, v)
		}
		const qs = q.toString()
		return `${u.origin}${path || '/'}${qs ? `?${qs}` : ''}`
	} catch {
		return ''
	}
}

/** Whether a path looks like sign-in, account, checkout or payment, from the built-in list and the site's own. */
export function sensitivePath(url: string, policy: Pick<SitePolicy, 'excludePaths'> = { excludePaths: [] }): boolean {
	let path = ''
	try {
		path = decodeURIComponent(new URL(url).pathname).toLowerCase()
	} catch {
		return true
	}
	const words = TRAIL_CONFIG.policy.sensitivePaths.map((w) => new RegExp(`(^|[/._-])${w}([/._-]|$)`, 'i'))
	if (words.some((re) => re.test(path))) return true
	for (const p of policy.excludePaths) {
		try {
			if (new RegExp(p, 'i').test(path)) return true
		} catch {}
	}
	return false
}

export interface Eligibility {
	ok: boolean
	reason?: 'not-public' | 'sensitive-path' | 'private-fields' | 'other-origin' | 'not-http' | 'opted-out'
}

/**
 * A page may be recorded only when it is on the site's own origin, over HTTP(S), its path is not
 * sensitive, the knowledge base does not mark it private, and it shows no private fields.
 */
export function eligibility(input: { url: string; siteOrigins: string[]; kbPage?: { eligible: boolean } | null; hasPrivateFields?: boolean; optedOut?: boolean; policy?: SitePolicy }): Eligibility {
	let u: URL
	try {
		u = new URL(input.url)
	} catch {
		return { ok: false, reason: 'not-http' }
	}
	if (!/^https?:$/.test(u.protocol)) return { ok: false, reason: 'not-http' }
	if (input.siteOrigins.length && !input.siteOrigins.includes(u.origin)) return { ok: false, reason: 'other-origin' }
	if (input.kbPage && !input.kbPage.eligible) return { ok: false, reason: 'not-public' }
	if (sensitivePath(input.url, input.policy)) return { ok: false, reason: 'sensitive-path' }
	if (input.hasPrivateFields) return { ok: false, reason: 'private-fields' }
	if (input.optedOut) return { ok: false, reason: 'opted-out' }
	return { ok: true }
}

/** A page that says it is not part of journeys (`<meta name="vg-trail" content="off">`): browsed normally, never saved. */
export function optedOutPage(doc: Document = document): boolean {
	return !!doc.querySelector('meta[name="vg-trail"][content="off" i]')
}

export function privateFieldsOnPage(doc: Document = document): boolean {
	try {
		return !!doc.querySelector(TRAIL_CONFIG.policy.privateFields)
	} catch {
		return true
	}
}

/** Options for rrweb's `record()`: the most restrictive configuration that still shows the page. */
export interface RecorderOptions {
	blockSelector: string
	maskTextSelector: string
	ignoreSelector: string
	maskAllInputs: true
	maskInputOptions: Record<string, boolean>
	slimDOMOptions: 'all'
	inlineStylesheet: true
	inlineImages: false
	collectFonts: false
	recordCanvas: false
	recordCrossOriginIframes: false
	userTriggeredOnInput: false
	checkoutEveryNms: number
	sampling: {
		mousemove: number
		scroll: number
		media: number
		input: 'last'
		mouseInteraction: Record<string, boolean>
	}
}

const ALL_INPUTS = ['color', 'date', 'datetime-local', 'email', 'month', 'number', 'range', 'search', 'tel', 'text', 'time', 'url', 'week', 'textarea', 'select', 'password']

export function recorderOptions(site: Partial<SitePolicy> = {}): RecorderOptions {
	const p = TRAIL_CONFIG.policy
	const r = TRAIL_CONFIG.recorder
	const safe = (list: readonly string[]) => list.filter(validSelector)
	return {
		blockSelector: [...p.block, ...safe(site.privateSelectors || [])].join(', '),
		maskTextSelector: p.maskText.join(', '),
		ignoreSelector: p.ignoreInput,
		maskAllInputs: true,
		maskInputOptions: Object.fromEntries(ALL_INPUTS.map((k) => [k, true])),
		slimDOMOptions: 'all',
		inlineStylesheet: true,
		inlineImages: false,
		collectFonts: false,
		recordCanvas: false,
		recordCrossOriginIframes: false,
		userTriggeredOnInput: false,
		checkoutEveryNms: r.checkoutEveryNms,
		sampling: {
			mousemove: r.sampling.mousemove,
			scroll: r.sampling.scroll,
			media: r.sampling.media,
			input: 'last',
			// Clicks show where the person went; focus and blur on fields would reveal form use.
			mouseInteraction: { MouseUp: false, MouseDown: false, Click: true, ContextMenu: false, DblClick: false, Focus: false, Blur: false, TouchStart: false, TouchMove_Departed: false, TouchEnd: false, TouchCancel: false },
		},
	}
}

/** A site-supplied selector that the browser cannot parse would make rrweb throw: drop it. */
function validSelector(s: string): boolean {
	if (typeof document === 'undefined') {
		const count = (c: string) => s.split(c).length - 1
		return /^[^{}<>]+$/.test(s) && count('[') === count(']') && count('(') === count(')')
	}
	try {
		document.createDocumentFragment().querySelector(s)
		return true
	} catch {
		return false
	}
}
