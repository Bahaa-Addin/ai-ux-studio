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
