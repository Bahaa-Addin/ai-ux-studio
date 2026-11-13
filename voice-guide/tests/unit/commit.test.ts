/**
 * Commit controls as data (packages/kb/src/commit.ts; ADR-0058): the words that make a control one
 * in both languages, the near misses that stay clickable, requests that ask to commit, and the
 * pages where nothing is pressed for the person.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { COMMIT_SELECTORS, commitIntent, isCommitPage, isCommitWords } from '../../packages/kb/src/commit.ts'

test('controls that buy, pay, reserve, subscribe, choose a number or give consent are commit controls, in both languages', () => {
	for (const w of ['Add to cart', 'ADD TO CART', 'Buy now', 'Buy', 'Checkout', 'Proceed to payment', 'Pay', 'Subscribe', 'Reserve', 'Choose your number', 'Select', 'Accept All Cookies', 'Reject All', 'Verify code', 'Upload documents', 'Pick up in store', 'cart'])
		assert.equal(isCommitWords(w === 'cart' ? 'Add to cart' : w), true, w)
	for (const w of ['أضف إلى السلة', 'اضف للسلة', 'اشتري الآن', 'اشتري', 'اشترك', 'احجز', 'ادفع', 'إتمام الشراء', 'تأكيد الطلب', 'اختار الرقم', 'اختار', 'قبول الكل', 'استلام من الفرع'])
		assert.equal(isCommitWords(w), true, w)
})

test('near misses stay clickable: sorting, filtering, details, comparing, and links that only open a page', () => {
	for (const w of ['Sort by price', 'Sort', 'Filter', 'Details', 'Compare', 'View more', 'Know more', 'رتب حسب السعر', 'التفاصيل', 'قارن', 'اعرف اكتر', 'Select language', 'Vodafone Cash', 'حول فودافون'])
		assert.equal(isCommitWords(w), false, w)
	// A link titled "Balance transfer" opens a page about it; a button labelled "Transfer" acts.
	assert.equal(isCommitWords('Balance transfer', { link: true }), false)
	assert.equal(isCommitWords('Transfer to a friend', { link: true }), false)
	assert.equal(isCommitWords('Transfer'), true)
	assert.equal(isCommitWords('Buy now', { link: true }), true, 'an unmistakable phrase on a link still counts')
	assert.equal(isCommitWords('Pay', { link: true }), false, 'a bare verb on a link leads to a page')
	assert.equal(isCommitWords('Order now', { extra: ['order now'] }), true, 'a site adds its own words')
})

test('requests that ask to commit are told apart from questions about it', () => {
	assert.equal(commitIntent('add the Galaxy A55 to the cart'), 'cart')
	assert.equal(commitIntent('ضيفه للسلة'), 'cart')
	assert.equal(commitIntent('buy this phone for me'), 'buy')
	assert.equal(commitIntent('اشتريه'), 'buy')
	assert.equal(commitIntent('accept all the cookies'), 'consent')
	assert.equal(commitIntent('choose a number for my new line'), 'number')
	assert.equal(commitIntent('ادفع الفاتورة'), 'checkout')
	for (const q of ['what is in my cart', 'where is my order', 'how much is the Galaxy', 'sort the phones by price', 'show me the details', 'باقات النت', 'select bank card as the payment method', 'اختار الدفع بالبطاقة'])
		assert.equal(commitIntent(q), null, q)
})

test('commit pages: the cart, checkout, a number\'s review, DSL checkout, payment; not the shop\'s lists or the numbers page', () => {
	for (const u of ['https://eshop.vodafone.com.eg/en/cart', 'https://eshop.vodafone.com.eg/ar/checkout/shipping', 'https://eshop.vodafone.com.eg/en/lines/red/review', 'https://eshop.vodafone.com.eg/en/internetServices/dsl/dsl-checkout', 'https://eshop.vodafone.com.eg/en/internetServices/at-home/at-home-subscription-details', '/en/payment'])
		assert.equal(isCommitPage(u), true, u)
	for (const u of ['https://eshop.vodafone.com.eg/en/list?categoryUrls=*smart-phones', 'https://eshop.vodafone.com.eg/en/lines/red/numbers', 'https://web.vodafone.com.eg/en/services', 'https://eshop.vodafone.com.eg/en/'])
		assert.equal(isCommitPage(u), false, u)
})

test('the floor names the shop\'s buy buttons, the cookie banner and the accessibility widget', () => {
	for (const css of ['#sl-add-to-cart-button', '#sl-button-buy-now', '#onetrust-accept-btn-handler', '#vodafone-aw-icon']) assert.ok(COMMIT_SELECTORS.includes(css), css)
})

test('the shop\'s real commit labels are commit controls: add-to-cart in any wording, buy again, the DSL device choice, choosing a line (AIXC-70, 71, 75)', () => {
	// Read from the shop's cached code and translations (E1 review, 2026-11-13).
	for (const w of ['Add 2 products to cart', 'Add All To Cart', 'Add Galaxy A55 to cart', 'Move to cart', 'Buy again', 'أضف 2 منتج للسلة', 'أضف الكل لسلة التسوق', 'أضف الى السلة', 'اشتريه تاني', 'Rent', 'Cash', 'ايجار', 'شراء', 'Choose this line', 'إختر هذا الخط'])
		assert.equal(isCommitWords(w), true, w)
	for (const css of ['button.add-to-cart', '.device-payment-options button', '[id^="sl-device-card-button-1"]', '.red-number-card', '.msisdn-container', '#sl-lines-pool-choose-this-line-button']) assert.ok(COMMIT_SELECTORS.includes(css), css)
})

test('SPEC-03 §4.1\'s own examples and the rest of its lexicon are commit words, in both languages (AIXC-72)', () => {
	for (const w of ['Confirm', 'Submit', 'Submit order', 'Complete purchase', 'Complete payment', 'Make a payment', 'Purchase', 'Order now', 'Top up', 'Send money', 'Confirm transfer', 'Confirm payment', 'Confirm subscription', 'Renew', 'Activate', 'I accept the terms and conditions'])
		assert.equal(isCommitWords(w), true, w)
	for (const w of ['تأكيد', 'تأكيد التحويل', 'تأكيد الاشتراك', 'تأكيد الدفع', 'تأكيد والدفع', 'شراء', 'حول', 'تحويل', 'جدد', 'فعّل']) assert.equal(isCommitWords(w), true, w)
	assert.equal(isCommitWords('حول فودافون'), false, '"About Vodafone" is not a transfer')
})

test('on a link a phrase counts only where the link begins with it: offer tiles and product cards open their pages (AIXC-76)', () => {
	for (const w of ['Check out the best personalized offers for you', 'Learn How to Subscribe Now!', 'Galaxy A55 18,999 EGP 10% OFF at Checkout View details for Galaxy A55', 'Top up your balance with Vodafone Cash'])
		assert.equal(isCommitWords(w, { link: true }), false, w)
	for (const w of ['Buy now', 'Checkout', 'Move to cart', 'Add to cart']) assert.equal(isCommitWords(w, { link: true }), true, w)
})

test('a question about paying, booking or buying is answered, never turned into a button to press; a polite request is still a request (AIXC-77)', () => {
	for (const q of ['can I pay in installments', 'what payment methods do you accept at checkout', 'اقدر ادفع بفودافون كاش؟', 'ازاي ادفع الفاتورة', 'is there a pay as you go option', 'pay as you go bundles', 'how do I book a store appointment', 'do I need to book before visiting a store', 'which store can I book an appointment at', 'what does the pay button do on this page', 'where can I buy a phone?', 'معلومات حول الباقات'])
		assert.equal(commitIntent(q), null, q)
	assert.equal(commitIntent('can you add it to the cart?'), 'cart')
	assert.equal(commitIntent('ممكن تضيفه للسلة؟'), 'cart')
	assert.equal(commitIntent('move it to my cart'), 'cart')
	assert.equal(commitIntent('rent this router'), 'buy')
	assert.equal(commitIntent('عايز الراوتر ده ايجار'), 'buy')
})

test('moving money and choosing a number are commit requests; on the numbers page asking for one is choosing it (AIXC-70, 72)', () => {
	for (const u of ['transfer 100 pounds to my brother', 'حول ١٠٠ جنيه لأخويا', 'recharge my line with 50 pounds', 'اشحن خطي بخمسين جنيه', 'confirm the transfer']) assert.equal(commitIntent(u), 'transfer', u)
	for (const u of ['choose this line for me', 'اختار الخط ده']) assert.equal(commitIntent(u), 'number', u)
	const url = 'https://eshop.vodafone.com.eg/en/lines/red/numbers'
	for (const u of ['I want the first number on the list', 'I will take 010 1234 5678', 'عايز أول رقم', 'pick the first one for me']) assert.equal(commitIntent(u, { url }), 'number', u)
	for (const u of ['sort the numbers', 'show me more numbers']) assert.equal(commitIntent(u, { url }), null, u)
	assert.equal(commitIntent('I want the first one', { url: 'https://eshop.vodafone.com.eg/en/list?categoryUrls=*smart-phones' }), null, 'elsewhere it is not a number')
})
