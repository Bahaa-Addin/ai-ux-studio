/**
 * The journey in the Pocket, on Vodafone pages only (ADR-0040, SPEC-06 §6a). The saved pages of
 * web.vodafone.com.eg are replayed under their real URLs, and /en/services is the Services clone
 * with Pocket (../vodafone-services-clone), exactly as `npm run demo:trail` runs it. The SDK, the
 * gateway, every service, the committed knowledge base and the committed experience profile are
 * real; speech synthesis is recorded at the browser boundary (ADR-0024). No microphone is used.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { Page } from 'playwright'

import { layerOpen, rec, recording, snapshot, tr, until, V, vodafonePocket } from './vodafone-pocket.ts'

const { launch } = vodafonePocket(4472)

/** Rests the pointer on an element for a while, as someone reading it would. */
async function dwell(page: Page, selector: string, ms: number) {
	const el = page.locator(selector).first()
	await el.scrollIntoViewIfNeeded()
	const box = (await el.boundingBox())!
	const end = Date.now() + ms
	while (Date.now() < end) {
		await page.mouse.move(box.x + box.width * (0.3 + Math.random() * 0.4), box.y + Math.min(box.height, 280) * (0.3 + Math.random() * 0.4), { steps: 5 })
		await page.waitForTimeout(250)
	}
}

/** Home, Cash and Internet Bundles (saved Vodafone pages), then the Services clone. */
async function visit(page: Page) {
	for (const url of [`${V}/en/home`, `${V}/en/vodafone-cash`, `${V}/en/mobile-internet-bundles`]) {
		await page.goto(url, { waitUntil: 'domcontentloaded' })
		await recording(page)
		await page.mouse.move(400, 400, { steps: 4 })
		await page.mouse.wheel(0, 300)
		await page.waitForTimeout(1800)
	}
	await page.goto(`${V}/en/services`, { waitUntil: 'domcontentloaded' })
	await recording(page)
	await dwell(page, '[data-vg-destination="web.services.vodafone-cash"]', 4500)
	await page.mouse.wheel(0, -4000)
	await page.waitForTimeout(2500) // the 2 s flush
}

test('on the Services clone, the pill opens the journey inside the Pocket: frosted, staggered, no modal, no sheet of the guide', async () => {
	const { b, page, requests } = await launch()
	try {
		// Consent is still asked, on a saved Vodafone page, by the guide's own pill.
		await page.goto(`${V}/en/home`, { waitUntil: 'domcontentloaded' })
		await tr(page, '.tr-pill').waitFor({ timeout: 20_000 })
		assert.equal(await rec(page), 'awaiting-consent')
		await tr(page, '.tr-pill').click()
		await tr(page, '.tr-allow').click()
		await recording(page)
		await visit(page)

		// The clone is the host: its sections carry the destinations they recreate.
		assert.equal(await page.locator('meta[name="vg-trail-host"]').getAttribute('content'), 'pocket')
		assert.equal(await page.locator('[data-vg-destination]').count(), 6)
		assert.equal(await page.locator('.pocket-journey-cta').isVisible(), false, 'nothing of the journey shows on the services page itself')

		await tr(page, '.tr-pill').click()
		await layerOpen(page)
		assert.equal(await page.evaluate(() => document.body.dataset.pocketView), 'open', 'the page turned to the Pocket')
		assert.equal(await tr(page, '.tr-sheet:not([hidden])').count(), 0, 'the guide never opens its own sheet here')
		assert.equal(await tr(page, '.tr-pill').isHidden(), true, 'the pill steps aside while the journey is open')

		// Inside the Pocket, beside "Back to Services", in the album's own buttons.
		const cta = page.locator('.pocket-journey-cta')
		assert.equal(await cta.innerText(), 'Your journey')
		assert.equal(await cta.getAttribute('aria-expanded'), 'true')
		assert.equal(await page.evaluate(() => document.querySelector('.pocket-journey-cta')!.parentElement!.firstElementChild!.textContent), 'Back to Services')
		assert.ok(await page.evaluate(() => document.querySelector('.pocket-journey-cta')!.classList.contains('pocket-back')))

		// Lightly frosted, see-through, never an opaque white modal.
		const look = await page.evaluate(() => {
			const s = getComputedStyle(document.querySelector('.pocket-journey-layer')!)
			return { bg: s.backgroundColor, blur: s.backdropFilter || (s as any).webkitBackdropFilter, inStage: !!document.querySelector('.pocket-stage > .pocket-journey-layer'), dialogs: document.querySelectorAll('[role="dialog"], [aria-modal="true"], dialog').length }
		})
		const alpha = Number(/rgba\([^)]*,\s*([\d.]+)\)/.exec(look.bg)?.[1] ?? 1)
		assert.ok(alpha < 0.8, `the layer is see-through: ${look.bg}`)
		assert.match(look.blur, /blur\(/)
		assert.ok(look.inStage, 'it floats over the album, in the Pocket page itself')
		assert.equal(look.dialogs, 0, 'no modal')

		// Staggered entrance: each piece floats in a little after the one before.
		const delays = await page.evaluate(() => [...document.querySelectorAll('.pocket-journey-layer .pocket-journey-float')].filter((el) => (el as HTMLElement).offsetParent).map((el) => parseFloat(getComputedStyle(el).animationDelay)))
		assert.ok(delays.length >= 4, String(delays))
		assert.ok(delays.slice(0, 4).every((d, i) => i === 0 || d > delays[i - 1]), `staggered: ${delays}`)

		// The slider: one stop per page visited, the person is on the last one.
		const steps = (await snapshot(page)).steps.filter((s: any) => s.type === 'page')
		assert.deepEqual(steps.map((s: any) => s.pageId), ['web.home', 'web.vodafone-cash', 'web.mobile-internet-bundles', 'web.services'])
		assert.equal(await page.locator('.pocket-journey-step').count(), 4, 'one stepped tab per page')
		assert.equal(await page.locator('.pocket-journey-step.is-here').getAttribute('data-step'), steps[3].id)
		assert.match(await page.locator('.pocket-journey-step.is-here').innerText(), /You are here\s*Services/)
		assert.equal(await page.locator('.pocket-journey-step.is-selected').getAttribute('data-step'), steps[2].id, 'the selected page is the lifted tab')
		assert.match((await page.locator('.pocket-journey-rail').getAttribute('aria-valuetext'))!, /^Page 3 of 4: Internet Bundles/, 'it opens on where you were before the Pocket')

		// The memory renders in the Pocket's own frame, still sandboxed.
		await until(page, `!!document.querySelector('.pocket-journey-memory__frame iframe')`, 30_000)
		const frame = await page.evaluate(() => {
			const f = document.querySelector('.pocket-journey-memory__frame iframe')!
			return { sandbox: f.getAttribute('sandbox'), tabindex: f.getAttribute('tabindex'), hidden: f.getAttribute('aria-hidden'), caption: document.querySelector('.pocket-journey-memory__caption')!.textContent }
		})
		assert.deepEqual(frame, { sandbox: 'allow-same-origin', tabindex: '-1', hidden: 'true', caption: 'MemoryInternet Bundles' })

		// The Services page's own memory: what was explored there, with verified questions.
		await page.locator('.pocket-journey-rail').focus()
		await page.keyboard.press('End')
		await page.waitForSelector('.pocket-journey-note', { timeout: 15_000 })
		const notes = await page.evaluate(() => [...document.querySelectorAll('.pocket-journey-note')].map((n) => ({ title: n.querySelector('.pocket-journey-note__title')!.textContent, why: n.querySelector('.pocket-journey-note__why')!.textContent, chips: [...n.querySelectorAll('.pocket-journey-chip')].map((c) => c.textContent) })))
		const cash = notes.find((n) => n.title === 'Vodafone Cash')
		assert.ok(cash && cash.chips.length >= 1 && cash.chips.length <= 3, JSON.stringify(notes))
		assert.ok(notes.length <= 3)

		// A chip turns the page back to Services and becomes an ordinary guide turn with a verified hint.
		const turnAt = requests.length
		await page.locator('.pocket-journey-note').filter({ hasText: 'Vodafone Cash' }).locator('.pocket-journey-chip').first().click()
		await until(page, `!document.body.dataset.pocketView`)
		await until(page, `(window.__spoken || []).length > 0`, 20_000)
		const turn = requests.slice(turnAt).find((r) => r.url.includes('/v1/turn'))!
		assert.equal(JSON.parse(turn.body).hint.destinationId, 'web.services.vodafone-cash')
		assert.equal(JSON.parse(turn.body).hint.source, 'trail-suggestion')

		// Nothing recorded left the browser, and the journey's own UI was never recorded.
		for (const r of requests) assert.ok(!/"childNodes"|IncrementalSnapshot|rr_width/.test(`${r.url} ${r.body}`), `replay data in ${r.url}`)
		assert.ok(!requests.some((r) => r.url.includes('/v1/experience/contributions')), 'no aggregate is sent')
		const blocked = await page.evaluate(() => [...document.querySelectorAll('.pocket-journey, .pocket-journey-layer, .pocket-journey-cta')].every((el) => el.hasAttribute('data-vg')))
		assert.ok(blocked, 'every piece of the journey is marked data-vg (blocked from recordings)')
	} finally {
		await b.close()
	}
})

test('the pill on any other Vodafone page takes you to the Pocket and opens the journey there', async () => {
	const { b, page } = await launch({ consented: true })
	try {
		await page.goto(`${V}/en/home`, { waitUntil: 'domcontentloaded' })
		await recording(page)
		await page.waitForTimeout(1500)
		await page.goto(`${V}/en/vodafone-cash`, { waitUntil: 'domcontentloaded' })
		await recording(page)
		await page.waitForTimeout(1500)
		await tr(page, '.tr-pill').click()
		await page.waitForURL(`${V}/en/services#journey`)
		await layerOpen(page)
		assert.equal(await page.evaluate(() => document.body.dataset.pocketView), 'open')
		assert.equal(await tr(page, '.tr-sheet:not([hidden])').count(), 0)
		assert.match((await page.locator('.pocket-journey-rail').getAttribute('aria-valuetext'))!, /^Page 2 of 3: Cash/)
	} finally {
		await b.close()
	}
})

test('Arabic: the pill on an Arabic page opens the journey in the Arabic Pocket, right to left (ADR-0043)', async () => {
	const { b, page } = await launch({ consented: true })
	try {
		await page.goto(`${V}/ar/home`, { waitUntil: 'domcontentloaded' })
		await recording(page)
		await page.waitForTimeout(1500)
		await page.goto(`${V}/ar/vodafone-cash`, { waitUntil: 'domcontentloaded' })
		await recording(page)
		await page.waitForTimeout(1500)
		await tr(page, '.tr-pill').click()
		await page.waitForURL(`${V}/ar/services#journey`)
		await layerOpen(page)
		assert.equal(await page.evaluate(() => document.documentElement.dir), 'rtl')
		assert.equal(await page.evaluate(() => document.body.dataset.pocketView), 'open')
		assert.equal(await tr(page, '.tr-sheet:not([hidden])').count(), 0)
		assert.match((await page.locator('.pocket-back').first().textContent())!, /ارجع للخدمات/)
		const value = (await page.locator('.pocket-journey-rail').getAttribute('aria-valuetext'))!
		assert.match(value, /[\u0600-\u06FF]/, `the journey speaks Arabic: ${value}`)
		// The clone's sections still carry the destinations they recreate, in Arabic too.
		assert.equal(await page.locator('[data-vg-destination="web.services.vodafone-cash"]').count(), 1)
	} finally {
		await b.close()
	}
})

test('keyboard and reduced motion: slider keys, Escape closes the journey before the Pocket, nothing animates', async () => {
	const { b, page } = await launch({ consented: true, reducedMotion: true })
	try {
		await visit(page)
		await tr(page, '.tr-pill').focus()
		await page.keyboard.press('Enter')
		await layerOpen(page)
		const anim = await page.evaluate(() => [...document.querySelectorAll('.pocket-journey-layer, .pocket-journey-float')].map((el) => getComputedStyle(el).animationName))
		assert.ok(anim.every((n) => n === 'none'), `no animation under reduced motion: ${anim}`)
		const rail = page.locator('.pocket-journey-rail')
		assert.equal(await rail.getAttribute('role'), 'slider')
		await rail.focus()
		await page.keyboard.press('Home')
		await until(page, `/^Page 1 of 4: Home/.test(document.querySelector('.pocket-journey-rail').getAttribute('aria-valuetext'))`)
		await until(page, `!!document.querySelector('.pocket-journey-memory__frame iframe')`, 30_000)
		for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowRight')
		await until(page, `/20% through Home/.test(document.querySelector('.pocket-journey-rail').getAttribute('aria-valuetext'))`)
		await page.keyboard.press('PageUp')
		await until(page, `/^Page 2 of 4: Cash/.test(document.querySelector('.pocket-journey-rail').getAttribute('aria-valuetext'))`)
		assert.match(await page.locator('.pocket-journey-step.is-selected').innerText(), /Cash/)
		await page.waitForTimeout(1500)
		assert.equal((await snapshot(page)).preview === 'playing', false, 'nothing plays by itself under reduced motion')
		assert.equal(await page.locator('.replayer-mouse-tail').count(), 0, 'no animated cursor trail')

		await page.keyboard.press('Escape')
		await page.waitForSelector('.pocket-journey-layer', { state: 'hidden' })
		assert.equal(await page.evaluate(() => document.activeElement?.classList.contains('pocket-journey-cta')), true, 'focus returns to "Your journey"')
		assert.equal(await page.evaluate(() => document.body.dataset.pocketView), 'open', 'the Pocket stays open')
		assert.equal((await snapshot(page)).open, false)
		await page.keyboard.press('Escape')
		await until(page, `!document.body.dataset.pocketView`)

		const sizes = await page.evaluate(() => [...document.querySelectorAll('.pocket-journey-cta, .pocket-journey-chip, .pocket-journey-play')].map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0).map((r) => Math.min(r.width, r.height)))
		assert.ok(sizes.every((s) => s >= 36), `targets: ${sizes}`)
	} finally {
		await b.close()
	}
})

test('phone: one column, the slider scrubs by touch, the page underneath is untouched', async () => {
	const { b, page } = await launch({ consented: true, phone: true })
	try {
		await visit(page)
		await tr(page, '.tr-pill').click()
		await layerOpen(page)
		await until(page, `!!document.querySelector('.pocket-journey-memory__frame iframe')`, 30_000)
		const cols = await page.evaluate(() => getComputedStyle(document.querySelector('.pocket-journey-layer__grid')!).gridTemplateColumns.split(' ').length)
		assert.equal(cols, 1)
		const scroll = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
		assert.ok(scroll, 'no sideways scrolling')
		const rail = page.locator('.pocket-journey-rail')
		// On a phone the tabs scroll sideways; bring the first page's tab into view and drag along it.
		await rail.evaluate((el) => el.scrollTo({ left: 0 }))
		const box = (await page.locator('.pocket-journey-step').first().boundingBox())!
		const before = Number(await rail.getAttribute('aria-valuenow'))
		for (const [type, f] of [['pointerdown', 0.2], ['pointermove', 0.4], ['pointermove', 0.6], ['pointerup', 0.6]] as const)
			await rail.dispatchEvent(type, { pointerType: 'touch', pointerId: 3, isPrimary: true, button: 0, clientX: box.x + box.width * f, clientY: box.y + box.height / 2, bubbles: true })
		await until(page, `/^Page 1 of 4: Home/.test(document.querySelector('.pocket-journey-rail').getAttribute('aria-valuetext'))`)
		assert.notEqual(Number(await rail.getAttribute('aria-valuenow')), before, 'dragging moved the slider')
		assert.equal(page.url(), `${V}/en/services`, 'touching the slider does not activate anything underneath')
	} finally {
		await b.close()
	}
})

test('without the guide the Pocket is just the Pocket: no journey button, no slider', async () => {
	const { b, page } = await launch({ noGuide: true })
	try {
		await page.goto(`${V}/en/services`, { waitUntil: 'domcontentloaded' })
		await page.locator('.pocket-cta').first().waitFor({ state: 'attached' })
		await page.waitForTimeout(1500)
		assert.equal(await page.locator('vg-guide').count(), 0)
		assert.equal(await page.locator('.pocket-journey-cta').isHidden(), true)
		assert.equal(await page.locator('.pocket-journey').isHidden(), true)
	} finally {
		await b.close()
	}
})
