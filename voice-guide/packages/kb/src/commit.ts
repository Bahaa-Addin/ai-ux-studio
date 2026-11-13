/**
 * Commit controls, as data (ADR-0058; AGENTS.md 4.1): what neither the guide nor the fallback agent
 * ever presses, on every origin, whether or not the knowledge base marked it. A built-in floor that a
 * site's config can extend and never shrink. Shared by the planner (words in a request), the agent
 * chunk (the controls on the page) and the crawler. Pure: no DOM, no node: imports; the DOM side
 * reads a control's words with `controlWords` and asks `isCommitWords`.
 */
import { normalize } from '../../text/src/normalize.ts'

/** Controls known by their markup: the shop's buy buttons, cart icons, the cookie banner, the accessibility widget. */
export const COMMIT_SELECTORS: readonly string[] = [
	'#sl-add-to-cart-button',
	'#sl-button-buy-now',
	'button.cart',
	'[id*="add-to-cart" i]',
	'[id*="buy-now" i]',
	'[aria-label*="add to cart" i]',
	'button:has(> img[alt="cart" i])',
	'.card-bundle-action-select-btn',
	'.device-select-btn',
	// Consent is a commit point (AGENTS.md 4.1): OneTrust's banner and preference centre.
	'#onetrust-consent-sdk button',
	'#onetrust-consent-sdk a[role="button"]',
	'#onetrust-accept-btn-handler',
	'#onetrust-reject-all-handler',
	'#onetrust-pc-btn-handler',
	// Vodafone's accessibility widget is the person's own (AGENTS.md 4.6).
	'#vodafone-aw-icon',
	'accessibility-widget',
]

/**
 * Words that make a control a commit control, after normalisation (Arabic forms unified, lower case).
 * `any`: the phrase anywhere in the control's words. `start`: the control's words begin with it.
 * `exact`: the control's words are exactly it (a bare "Select" on a bundle or device card, but not
 * "Select language"). A link titled "Balance transfer" leads to a page; a button labelled "Transfer" acts.
 */
const PHRASES: { any: string[]; start: string[]; exact: string[] } = {
	any: [
		'add to cart',
		'add to bag',
		'add to basket',
		'buy now',
		'checkout',
		'check out',
		'place order',
		'place your order',
		'confirm order',
		'confirm and pay',
		'pay now',
		'proceed to payment',
		'choose number',
		'choose your number',
		'select number',
		'select your number',
		'pick up in store',
		'store pickup',
		'reserve now',
		'subscribe now',
		'accept all',
		'allow all',
		'reject all',
		'verify code',
		'send code',
		'upload document',
		'upload documents',
		'اضف الي السله',
		'اضف للسله',
		'ضيف للسله',
		'اضافه للسله',
		'اشتري الان',
		'اشتري دلوقتي',
		'اتمام الشراء',
		'تاكيد الطلب',
		'تاكيد الشراء',
		'ادفع الان',
		'اختر الرقم',
		'اختار الرقم',
		'اختار رقمك',
		'اختر رقمك',
		'استلام من الفرع',
		'قبول الكل',
		'رفض الكل',
		'تاكيد الكود',
		'ارسال الكود',
		'ارفع المستندات',
	],
	start: ['buy', 'pay', 'subscribe', 'reserve', 'book', 'recharge', 'transfer', 'upload', 'verify', 'اشتري', 'اشترك', 'احجز', 'ادفع', 'اشحن', 'ارفع'],
	exact: ['select', 'choose', 'order', 'accept', 'اختار', 'اختر', 'اطلب', 'موافق'],
}

/** Clickable on a page, but never a commit control: the near misses (demo moment 6 sorts by price). */
const NEAR_MISSES = ['sort', 'filter', 'details', 'detail', 'compare', 'view more', 'see more', 'know more', 'more info', 'learn more', 'رتب', 'ترتيب', 'فلتر', 'التفاصيل', 'تفاصيل', 'قارن', 'اعرف اكتر', 'شوف اكتر']

const norm = (s: string) => normalize(s).replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
const has = (hay: string, phrase: string) => ` ${hay} `.includes(` ${phrase} `)

/**
 * True when a control's words (its text, label, title, value and pictures' alt text) say it commits.
 * `link`: the control is a link to a page, which only the unmistakable phrases make a commit
 * ("Buy now" on a link; not "Balance transfer", which opens a page about it).
 */
export function isCommitWords(words: string, opts: { link?: boolean; extra?: readonly string[] } = {}): boolean {
	const w = norm(words)
	if (!w) return false
	if (NEAR_MISSES.some((p) => w === norm(p) || w.startsWith(`${norm(p)} `))) return false
	if ([...PHRASES.any, ...(opts.extra || [])].some((p) => has(w, norm(p)))) return true
	if (opts.link) return false
	if (PHRASES.start.some((p) => w === norm(p) || w.startsWith(`${norm(p)} `))) return true
	return PHRASES.exact.some((p) => w === norm(p))
}

/** A request asking to do a commit itself ("add it to the cart", "ضيفه للسلة"): the guide shows the control and lets the person press it. */
const INTENTS: { kind: CommitKind; words: RegExp }[] = [
	{ kind: 'cart', words: /\b(add|put)\b.*\b(cart|basket|bag)\b|(ضيف|ضيفه|ضيفها|اضف|اضيف|حط|حطه|حطها).*سله/ },
	{ kind: 'buy', words: /\b(buy|purchase)\b|\border (it|this|that|one|now)\b|اشتري|اشتريه|اشتريها|اطلبه|اطلبها/ },
	// "Pay", not "payment": choosing how to pay (the demo's card payment) is not the commit; paying is.
	{ kind: 'checkout', words: /\bcheck ?out\b|\bpay\b|اتمام الشراء|(^| )ادفع/ },
	{ kind: 'reserve', words: /\b(reserve|book)\b|احجز|احجزه/ },
	{ kind: 'number', words: /\b(choose|pick|select)\b.*\bnumber\b|اختار.*رقم|اختر.*رقم/ },
	{ kind: 'consent', words: /\b(accept|allow|reject)\b.*\bcookies?\b|الكوكيز|ملفات تعريف الارتباط/ },
]
export type CommitKind = 'cart' | 'buy' | 'checkout' | 'reserve' | 'number' | 'consent'

/** What a request asks to commit, if anything. */
export function commitIntent(utterance: string): CommitKind | null {
	const w = norm(utterance)
	for (const i of INTENTS) if (i.words.test(w)) return i.kind
	return null
}

/** The control a guided commit step points at, by kind: the built-in selectors and its usual words. */
export const COMMIT_TARGETS: Record<CommitKind, { css: string[]; text: { en: string; ar: string } }> = {
	cart: { css: ['#sl-add-to-cart-button', 'button.cart', '[id*="add-to-cart" i]', '[aria-label*="add to cart" i]'], text: { en: 'Add to cart', ar: 'أضف إلى السلة' } },
	buy: { css: ['#sl-button-buy-now', '[id*="buy-now" i]'], text: { en: 'Buy now', ar: 'اشتري الآن' } },
	checkout: { css: ['[id*="checkout" i]'], text: { en: 'Checkout', ar: 'إتمام الشراء' } },
	reserve: { css: ['[id*="reserve" i]'], text: { en: 'Reserve', ar: 'احجز' } },
	number: { css: ['[id*="number" i] button', '.number-card'], text: { en: 'Choose number', ar: 'اختار الرقم' } },
	consent: { css: ['#onetrust-accept-btn-handler'], text: { en: 'Accept All Cookies', ar: 'قبول الكل' } },
}

/** Pages where every action is the person's own: nothing is pressed there for them at all. */
const COMMIT_PAGES = [/\/cart(\/|$|\?)/i, /\/checkout(\/|$|\?)/i, /\/lines\/[^/]+\/review(\/|$|\?)/i, /dsl-checkout/i, /subscription-details/i, /\/payment(\/|$|\?)/i, /\/order-summary(\/|$|\?)/i]

/** True for a commit page (the cart, checkout, a number's review, payment). */
export function isCommitPage(url: string, extra: readonly string[] = []): boolean {
	let path = url
	try {
		const u = new URL(url)
		path = `${u.pathname}${u.search}`
	} catch {}
	return COMMIT_PAGES.some((r) => r.test(path)) || extra.some((p) => new RegExp(p, 'i').test(path))
}
