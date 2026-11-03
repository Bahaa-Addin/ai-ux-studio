/**
 * Every threshold, weight, limit and selector of the Exploration Trail in one typed object
 * (SPEC-06; pilot parameters in ADR-0035, ADR-0037, ADR-0038). Site config can tighten the
 * policy (more private selectors and paths, shorter retention) but never loosen it.
 */

export const TRAIL_CONFIG = {
	/** Meaningful attention (SPEC-06 §4): a brief crossing is not interest. */
	attention: {
		/** Fraction of the element that must be on screen for visible time to count. */
		visibleRatio: 0.5,
		/** Pointer resting on a destination at least this long is deliberate. */
		dwellMs: 600,
		/** Keyboard focus at least this long is deliberate. */
		focusMs: 400,
		/** Shorter pointer visits are passing through on the way somewhere else. */
		passThroughMs: 300,
		/** A return counts when the person left the destination for at least this long. */
		returnGapMs: 1500,
		/** Visible time is sampled at this interval (no per-frame work). */
		tickMs: 1000,
		/** Long dwell stops adding after these caps, so leaving a tab open does not dominate. */
		caps: { visibleMs: 30_000, hoverMs: 8_000, focus: 2, revisit: 3, activation: 2, reveal: 2, passThrough: 8 },
		/** Score = sum of capped contributions minus the pass-through penalty. Explainable, not learned. */
		weights: { visiblePerSec: 0.05, hoverPerSec: 0.5, focus: 1, revisit: 1.5, activation: 3, reveal: 2, passThrough: 0.25 },
		/** Same-topic results (items of one collection) are scored down after the first one. */
		diversityPenalty: 0.5,
		/** Below this a deliberate destination is still not shown. */
		minScore: 0.5,
		/** Interest bands for the optional aggregate (ADR-0037 §6). */
		bands: { warm: 1, hot: 4 },
		maxShown: 3,
	},
	/** Local storage limits (ADR-0037 §2). */
	storage: {
		db: 'vg-trail-v1',
		dbVersion: 1,
		retentionHours: 24,
		maxSessions: 3,
		maxSteps: 20,
		maxSessionMs: 30 * 60_000,
		maxBytes: 20 * 1024 * 1024,
		chunkBytes: 256 * 1024,
		chunkMs: 10_000,
		/** In-memory events are written at least this often, so a navigation loses at most this much. */
		flushMs: 2_000,
		/** The session index is rewritten at most this often while attention changes. */
		indexWriteMs: 2_000,
	},
	/** The recorder (ADR-0035, ADR-0037 §4). */
	recorder: {
		sampling: { mousemove: 50, scroll: 150, media: 800 },
		/** A fresh full snapshot within one long page, so a seek never replays from far back. */
		checkoutEveryNms: 120_000,
		/** How often the page is re-checked for password, one-time-code and card fields. */
		privateFieldCheckMs: 2_000,
	},
	/** Replay (ADR-0037 §5). */
	replay: {
		maxResources: 60,
		maxResourceBytes: 5 * 1024 * 1024,
		resourceTimeoutMs: 4_000,
		staticExtensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'svg', 'ico', 'css', 'woff', 'woff2', 'ttf', 'otf'],
		maxEvents: 60_000,
	},
	/** The timeline (ADR-0038). */
	ui: {
		holdToPlayMs: 300,
		/** Fixed or sticky elements at most this tall (fraction of the viewport) count as the site header. */
		headerMaxFraction: 0.35,
		/** Arrow keys on the position slider move this fraction of a step; Page Up/Down four times as much. */
		keyboardStep: 0.05,
		gap: 8,
	},
	/** What is never recorded (ADR-0037 §3, §4). Policy, not scattered constants. */
	policy: {
		sensitivePaths: [
			'log-?in',
			'sign-?in',
			'sign-?up',
			'log-?out',
			'register',
			'my-?account',
			'account',
			'profile',
			'checkout',
			'cart',
			'basket',
			'payment',
			'pay',
			'otp',
			'verify',
			'password',
			'reset',
			'auth',
			'oauth',
			'sso',
			'wallet',
		],
		/** Fields whose presence makes a page private. */
		privateFields: 'input[type="password"], input[autocomplete="one-time-code"], input[autocomplete^="cc-"], input[name*="otp" i], input[name*="card" i][inputmode="numeric"]',
		/** Blocked from recordings: an empty box of the same size. */
		block: [
			'vg-guide',
			'[data-vg]',
			'[data-vg-private]',
			'#onetrust-consent-sdk',
			'#onetrust-banner-sdk',
			'[id^="onetrust-"]',
			'#vodafone-aw-icon',
			'[id*="accessibility" i]',
			'[class*="accessibility-widget" i]',
			'input[type="password"]',
			'input[type="email"]',
			'input[type="tel"]',
			'input[type="search"]',
			'input[autocomplete^="cc-"]',
			'input[autocomplete="one-time-code"]',
			'textarea',
			'select',
			'[contenteditable]:not([contenteditable="false"])',
			'form[action*="login" i]',
			'form[action*="pay" i]',
			'[class*="basket" i]',
			'[class*="cart" i]',
			'video',
			'audio',
			'canvas',
			'iframe',
			'object',
			'embed',
			'lottie-player',
			'dotlottie-player',
		],
		/** Text replaced by a fixed mask (balances, names a site renders on public pages). */
		maskText: ['[data-vg-mask]', '[class*="balance" i]', '[class*="msisdn" i]', '[class*="user-name" i]'],
		/** Input events are never recorded on these. */
		ignoreInput: 'input, textarea, select, [contenteditable]',
		/** Page regions whose links and cards are never "explored": navigation and furniture. */
		furniture: 'header, nav, footer, [role="navigation"], [role="banner"], [role="contentinfo"], [id^="onetrust-"], vg-guide, [data-vg]',
		trackingParams: /^(utm_\w+|gclid|fbclid|msclkid|dclid|gbraid|wbraid|_ga|_gl|mc_cid|mc_eid|igshid|ref|referrer|source|cmpid|icid|vgh)$/i,
	},
} as const

export type TrailConfig = typeof TRAIL_CONFIG
