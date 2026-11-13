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
	'button.add-to-cart',
	'button:has(img[alt*="cart" i])',
	'.card-bundle-action-select-btn',
	'.device-select-btn',
	// The DSL device card's own choice: "Rent" and "Cash" pick the router and go to its checkout (AIXC-75).
	'.device-payment-options button',
	'[id^="sl-device-card-button-1"]',
	'[id^="sl-device-card-button-2"]',
	// Choosing a number: the shop's number cards and the button that takes one (AIXC-70).
	'.red-number-card',
	'.msisdn-container',
	'.number-card',
	'#sl-lines-pool-choose-this-line-button',
	'#sl-confirm-button',
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
		'move to cart',
		'buy now',
		'buy again',
		'order again',
		'order now',
		'complete purchase',
		'complete payment',
		'complete order',
		'make a payment',
		'make payment',
		'confirm transfer',
		'confirm payment',
		'confirm subscription',
		'send money',
		'choose this line',
		'choose line',
		'select this line',
		'accept the terms',
		'agree to the terms',
		'i agree',
		'i accept',
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
		'اختر هذا الخط',
		'اختار هذا الخط',
		'اختار الخط ده',
		'اختر الخط',
		'اختار الخط',
		'تاكيد التحويل',
		'تاكيد الاشتراك',
		'تاكيد الدفع',
		'تاكيد والدفع',
		'اتمام الدفع',
		'اشتريه تاني',
		'اوافق علي الشروط',
	],
	// SPEC-03 §4.1's lexicon (AIXC-72): confirm, submit, purchase, top up, renew, activate, and their Arabic;
	// Arabic verbs also with the object joined on ("اشتريه", "اطلبها").
	start: [
		'buy',
		'pay',
		'subscribe',
		'reserve',
		'book',
		'recharge',
		'transfer',
		'upload',
		'verify',
		'confirm',
		'submit',
		'purchase',
		'top up',
		'renew',
		'activate',
		'rent',
		'اشتري',
		'اشتريه',
		'اشتريها',
		'اشترك',
		'احجز',
		'احجزه',
		'احجزها',
		'ادفع',
		'اشحن',
		'ارفع',
		'تاكيد',
		'اكد',
		'شرا',
		'تحويل',
		'حول الرصيد',
		'جدد',
		'تجديد',
		'فعل',
		'تفعيل',
		'ايجار',
		'اطلبه',
		'اطلبها',
	],
	exact: ['select', 'choose', 'order', 'accept', 'اختار', 'اختر', 'اطلب', 'موافق', 'حول', 'cash'],
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
	const starts = (p: string) => w === norm(p) || w.startsWith(`${norm(p)} `)
	// On a link a phrase counts only where its words begin with it: "Check out the best offers" and a
	// product card that says "10% OFF at Checkout" open pages (AIXC-76).
	if (opts.link) return [...PHRASES.any.filter((p) => !LINK_SKIP.includes(p)), ...(opts.extra || [])].some(starts) || (CART.test(w) && CART_VERB.test(w))
	if ([...PHRASES.any, ...(opts.extra || [])].some((p) => has(w, norm(p)))) return true
	// "Add 2 products to cart", "Add All To Cart", "أضف الكل لسلة التسوق" (AIXC-71).
	if (CART.test(w)) return true
	if (PHRASES.start.some(starts)) return true
	return PHRASES.exact.some((p) => w === norm(p))
}

/** "Check out the best offers" on a link is an invitation to look, not checkout. */
const LINK_SKIP = ['check out']

/** Adding or moving something to the cart, whatever lies between the verb and the cart. */
const CART = /(^| )(add|move)( .*)? (to|into) (the |my |your )?(cart|bag|basket)( |$)|(^| )(اضف|ضيف|ضيفه|ضيفها|اضافه|اضيف|حط|حطه|حطها)( .*)? (لل|ل|ال|الي ال|في ال)?سله( |$)/u
const CART_VERB = /^(add|move|اضف|ضيف|ضيفه|ضيفها|اضافه|اضيف|حط|حطه|حطها) /u

/** A request asking to do a commit itself ("add it to the cart", "ضيفه للسلة"): the guide shows the control and lets the person press it. */
const INTENTS: { kind: CommitKind; words: RegExp }[] = [
	{ kind: 'cart', words: /\b(add|put|move)\b.*\b(cart|basket|bag)\b|(ضيف|ضيفه|ضيفها|اضف|اضيف|حط|حطه|حطها).*سله/ },
	{ kind: 'buy', words: /\b(buy|purchase|rent)\b|\border (it|this|that|one|now)\b|اشتري|اشتريه|اشتريها|اطلبه|اطلبها|ايجار/ },
	// "Pay", not "payment": choosing how to pay (the demo's card payment) is not the commit; paying is.
	{ kind: 'checkout', words: /\bcheck ?out\b|\bpay\b|اتمام الشراء|(^| )ادفع/ },
	{ kind: 'reserve', words: /\b(reserve|book)\b|احجز|احجزه/ },
	// Money moving: a transfer, a recharge, a top-up (AGENTS.md 4.1; AIXC-72). "حول" leads only: inside a sentence it means "about".
	{ kind: 'transfer', words: /\btransfer\b|\b(send)\b.*\b(money|pounds?|egp|balance|credit|cash)\b|\brecharge\b|\btop ?up\b|^(حول|حولي|حوللي)( |$)|(^| )(احول|اشحن|اشحنلي|اشحنهولي)( |$)|تحويل (رصيد|فلوس)/ },
	{ kind: 'number', words: /\b(choose|pick|select|take)\b.*\b(number|this line)\b|اختار.*(رقم|الخط ده|خط ده)|اختر.*(رقم|الخط ده|هذا الخط)/ },
	{ kind: 'consent', words: /\b(accept|allow|reject)\b.*\bcookies?\b|الكوكيز|ملفات تعريف الارتباط/ },
]
export type CommitKind = 'cart' | 'buy' | 'checkout' | 'reserve' | 'transfer' | 'number' | 'consent'

/**
 * A question about a commit is not a request to commit (AIXC-77): "can I pay in installments",
 * "ازاي ادفع الفاتورة", "how do I book a store appointment" are answered, not turned into a button
 * to press. A polite request is still a request: "can you add it to the cart?", "ممكن تضيفه للسلة؟".
 */
const QUESTION = /^(how|what|whats|which|where|when|why|who|is|are|does|do|did|can i|could i|should i|may i|can we|will i|would i|is there|are there)( |$)|^(ازاي|ايه|هل|فين|امتي|امتى|ليه|مين|اقدر|ينفع|اعرف|ممكن اعرف|عايز اعرف|عاوز اعرف)( |$)/
const POLITE = /^(please )?(can|could|would|will) you( |$)|^please( |$)|^(ممكن|لو سمحت) (ت|ن)/
/** On the numbers page, asking for one is choosing it; sorting or seeing more is not. */
const NUMBERS_PAGE = /\/lines\/[^/]+\/numbers(\/|$|\?)/i
const NUMBER_HERE = /\b(want|take|get|pick|choose|select|give me|first|second|third|last)\b|عايز|عاوز|اختار|اختر|هات|خد|اول|تاني|تالت|اخر|01[0125]\d{8}/
const NUMBER_BROWSE = /\b(sort|filter|more|load|next|search|find|show)\b|رتب|فلتر|اكتر|كمان|دور|وريني/
const ascii = (s: string) => s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x6f0))

/** True on a page of numbers to choose from (`/lines/<plan>/numbers`). */
export function isNumbersPage(url: string): boolean {
	let path = url
	try {
		path = new URL(url).pathname
	} catch {}
	return NUMBERS_PAGE.test(path)
}

/** What a request asks to commit, if anything; `url` is the page it was asked on. */
export function commitIntent(utterance: string, ctx: { url?: string } = {}): CommitKind | null {
	const raw = String(utterance || '')
	const w = norm(raw.replace(/\bpay[\s-]+as[\s-]+you[\s-]+go\b/gi, ' '))
	if ((QUESTION.test(w) || /[?؟]\s*$/.test(raw)) && !POLITE.test(w)) return null
	for (const i of INTENTS) if (i.words.test(w)) return i.kind
	let path = ctx.url || ''
	try {
		path = new URL(path).pathname
	} catch {}
	if (path && NUMBERS_PAGE.test(path) && NUMBER_HERE.test(ascii(w).replace(/(\d) (?=\d)/g, '$1')) && !NUMBER_BROWSE.test(w)) return 'number'
	return null
}

/** The control a guided commit step points at, by kind: the built-in selectors and its usual words. */
export const COMMIT_TARGETS: Record<CommitKind, { css: string[]; text: { en: string; ar: string } }> = {
	cart: { css: ['#sl-add-to-cart-button', 'button.cart', '[id*="add-to-cart" i]', 'button.add-to-cart', '[aria-label*="add to cart" i]'], text: { en: 'Add to cart', ar: 'أضف إلى السلة' } },
	buy: { css: ['#sl-button-buy-now', '[id*="buy-now" i]', '.device-payment-options button'], text: { en: 'Buy now', ar: 'اشتري الآن' } },
	checkout: { css: ['[id*="checkout" i]'], text: { en: 'Checkout', ar: 'إتمام الشراء' } },
	reserve: { css: ['[id*="reserve" i]'], text: { en: 'Reserve', ar: 'احجز' } },
	transfer: { css: ['[id*="transfer" i] button[type="submit"]', '[id*="recharge" i] button[type="submit"]'], text: { en: 'Confirm', ar: 'تأكيد' } },
	number: { css: ['#sl-lines-pool-choose-this-line-button', '[id*="choose-this-line" i]', '.red-number-card', '.msisdn-container', '.number-card'], text: { en: 'Choose this line', ar: 'اختر هذا الخط' } },
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
