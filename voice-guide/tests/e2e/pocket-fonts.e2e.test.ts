/**
 * Our words on Vodafone's pages are drawn in Vodafone's own faces, never in a system font (finding F1,
 * seen on the live /en/home on 2026-11-17: "Pocket it" and the liner drawn in Helvetica; AGENTS.md §4.8,
 * ADR-0052 §12). The home pages' theme (maintheme) and the bundles' (static-lite-theme) declare only
 * Vodafone's regular faces, so pocket.css names four aliases of Vodafone's own bold and light files on
 * Vodafone's origin, after the page's own names: a page whose theme has the face never fetches ours.
 *
 * On the saved pages with the live-page kit (./vodafone-layer.ts), at 1366×900: the chips drawn, one card
 * pocketed through its chip (its liner shows), the album opened with the Pocket button. In each state
 * every text of ours is read through CDP (CSS.getPlatformFontsForNode): where one of our stacks
 * (--pocket-regular, --pocket-bold, --pocket-light) draws it, every font is a web font of Vodafone's, by the
 * name its file carries ("Vodafone Rg", "Vodafone Lt", "vodafone_rgbold"; Vodafone's Arabic files,
 * vodafone-*-ar.woff, carry "GE SS Two"). Where Vodafone's theme sets the family itself (its heading
 * rules, `[dir=rtl] h3 { font-family: vodafone-regular-ar, sans-serif }`, outrank our classes), its stack
 * must start with Vodafone's face and draw in it; the Latin letters and digits its own Arabic stack sends
 * to the system font are printed, not failed: Vodafone's own headings draw them the same way.
 *
 * The replay did not save static-lite-theme's two font files (the bundles' theme: its regular faces,
 * refused offline); they are served from maintheme's saved copies, as the live site serves its own
 * (maintheme's and static-theme's regular files are byte for byte the same; static-lite's were not saved).
 */
import assert from 'node:assert/strict'
import path from 'node:path'
import { after, before, test } from 'node:test'

import type { CDPSession, Page } from 'playwright'

import { DESKTOP, type LayerGateway, launchLayer, open, PHONE, REPLAY, startLayerGateway, watch } from './vodafone-layer.ts'

const PORT = 4468
let gw: LayerGateway

before(async () => {
	gw = await startLayerGateway(PORT)
})
after(async () => {
	await gw?.close()
})

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Vodafone's own faces, by the names inside its font files. */
const VODAFONE = /vodafone|^GE SS Two/i

/** Each page, and the alias of ours it has to fetch (null: its theme has every face, so none). */
const CASES = [
	{ path: '/en/home', fetched: 'aixc-vodafone-bold-en' },
	{ path: '/ar/home', fetched: 'aixc-vodafone-bold-ar' },
	{ path: '/en/mobile-internet-bundles', fetched: 'aixc-vodafone-bold-en' },
	{ path: '/en/services', fetched: null },
]

/** Two frames and a little more. */
const settle = (page: Page, ms = 60) => page.evaluate((ms) => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(done, ms)))), ms)

/** Laid out, every font load that started done, laid out again. */
async function fontsSettled(page: Page) {
	await settle(page)
	await page.evaluate(() => document.fonts.ready.then(() => undefined))
	await settle(page)
}

/** The fonts that draw the text directly inside the element `selector` names, as Chromium reports them; null when there is no such element. */
async function fontsOf(cdp: CDPSession, selector: string) {
	const { root } = await cdp.send('DOM.getDocument', { depth: 0 })
	const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector })
	if (!nodeId) return null
	const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId })
	const { computedStyle } = await cdp.send('CSS.getComputedStyleForNode', { nodeId })
	const stack = computedStyle.find((p) => p.name === 'font-family')?.value ?? ''
	return { stack, fonts: fonts.map((f) => ({ family: f.familyName, custom: f.isCustomFont, glyphs: f.glyphCount })) }
}

/** Our three stacks as this page resolves them, and a stack compared without quotes or spaces. */
const ourStacks = (page: Page) => page.evaluate(() => ['--pocket-regular', '--pocket-bold', '--pocket-light'].map((v) => getComputedStyle(document.documentElement).getPropertyValue(v)))
const bare = (stack: string) => stack.replace(/["'\s]/g, '')

/**
 * Reads the fonts of each element (`name` → selector; a name ending in '?' may be absent), prints them,
 * and returns what is drawn in anything but Vodafone's own faces, or not drawn at all (see the file
 * comment for an element whose family Vodafone's theme sets).
 */
async function wrongFaces(cdp: CDPSession, where: string, ours: string[], probes: Record<string, string>, strict: string[] = []) {
	const wrong: string[] = []
	for (const [name, selector] of Object.entries(probes)) {
		const found = await fontsOf(cdp, selector)
		const optional = name.endsWith('?')
		if (!found?.fonts.length) {
			console.log(`${where} ${name}: ${found ? '(nothing drawn)' : '(none)'}`)
			if (!optional) wrong.push(`${name}: not drawn`)
			continue
		}
		const mine = ours.map(bare).includes(bare(found.stack))
		const drawn = found.fonts.map((f) => `${f.family}${f.custom ? '' : ' (system)'} ×${f.glyphs}`).join(', ')
		console.log(`${where} ${name}: ${drawn} [${mine ? 'ours' : "the theme's"}: ${found.stack}]`)
		const vodafone = (f: { family: string; custom: boolean }) => f.custom && VODAFONE.test(f.family)
		if (strict.length && strict.includes(name)) {
			// The album's own headings are ours, not Vodafone's content: they draw in our bold stack on every theme.
			const first = bare(ours[1]).split(',')[0]
			if (!bare(found.stack).startsWith(first)) wrong.push(`${name}: ${found.stack} does not start with ${first}`)
			for (const f of found.fonts.filter((f) => !vodafone(f))) wrong.push(`${name}: ${f.family}${f.custom ? '' : ' (system)'}`)
		} else if (mine) for (const f of found.fonts.filter((f) => !vodafone(f))) wrong.push(`${name}: ${f.family}${f.custom ? '' : ' (system)'}`)
		else if (!/^["']?(vodafone-|vf-)/.test(found.stack) || !found.fonts.some(vodafone)) wrong.push(`${name}: the theme's ${found.stack} draws in ${drawn}`)
	}
	return wrong
}

/** Our aliases in document.fonts, by family, with their status ('unloaded' until a word needs one). */
const aliases = (page: Page) => page.evaluate(() => Object.fromEntries([...document.fonts].filter((f) => /^["']?aixc-/.test(f.family)).map((f) => [f.family.replace(/["']/g, ''), f.status])) as Record<string, string>)

/** The first card whose chip shows its label where a press reaches it, brought to the middle of the screen. */
const firstChip = (page: Page) =>
	page.evaluate(async () => {
		for (const chip of document.querySelectorAll<HTMLElement>('.pocket-chips .pocket-cta[data-pocket-for]')) {
			const id = chip.dataset.pocketFor!
			const card = [...document.querySelectorAll<HTMLElement>(`#main-content [data-aixc-item="${CSS.escape(id)}"]`)].find((c) => !c.closest('.owl-item.cloned'))
			if (!card) continue
			card.scrollIntoView({ block: 'center', inline: 'nearest' })
			await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(done, 60))))
			const label = chip.querySelector<HTMLElement>('.pocket-cta__label')
			const r = chip.getBoundingClientRect()
			const x = r.left + r.width / 2
			const y = r.top + r.height / 2
			const at = r.width ? document.elementFromPoint(x, y) : null
			if (label && getComputedStyle(label).display !== 'none' && label.getBoundingClientRect().width > 0 && at && (at === chip || chip.contains(at))) return { id, x, y, label: `.pocket-chips .pocket-cta[data-pocket-for="${CSS.escape(id)}"] .pocket-cta__label` }
		}
		return null
	})

for (const c of CASES) {
	test(`${c.path} 1366: the chips, a pocketed card's liner and the album are drawn in Vodafone's own faces; ${c.fetched ? `${c.fetched} fetched from Vodafone's origin` : 'none of our aliases fetched'}`, async () => {
		const l = await launchLayer(gw, { viewport: DESKTOP, owl: true, reducedMotion: true })
		try {
			// static-lite-theme's own font files, which the replay did not save (see the file comment).
			await l.b.context.route('**/theme-assets/static-lite-theme/fonts/*.woff', (route) => route.fulfill({ path: path.join(REPLAY, 'assets/theme-assets/maintheme/fonts', path.basename(new URL(route.request().url()).pathname)), contentType: 'font/woff' }))
			const seen = watch(l.page)
			const where = `${c.path} 1366`
			await open(l.page, c.path, '?aixc-debug')
			await l.page.waitForFunction(() => (window as any).__aixc?.demos?.pocket?.chips, null, { timeout: 15_000 })
			const ours = await ourStacks(l.page)
			const cdp = await l.page.context().newCDPSession(l.page)
			await cdp.send('DOM.enable')
			await cdp.send('CSS.enable')
			const wrong: string[] = []

			// The chips.
			const chip = await firstChip(l.page)
			assert.ok(chip, `${where}: a chip with its label shows where a press reaches it`)
			await fontsSettled(l.page)
			wrong.push(...(await wrongFaces(cdp, `${where} chips`, ours, { 'chip label': chip.label })))

			// One card pocketed through its chip: its liner, and the Pocket button with its count.
			await l.page.mouse.click(chip.x, chip.y)
			await l.page.waitForFunction((id) => (window as any).__aixc.demos.pocket.store.all().some((r: any) => r.id === id), chip.id, { timeout: 5_000 })
			await l.page.waitForSelector('.pocket-chips .pocket-host.is-pocketed:not(.is-peeling) .pocket-liner__text', { state: 'visible', timeout: 5_000 })
			await l.page.waitForSelector('.pocket-peek[data-state="shown"]', { timeout: 5_000 })
			await l.page.waitForFunction(() => document.querySelectorAll('.curl-host--flying').length === 0, null, { timeout: 8_000 })
			await settle(l.page, 900)
			await fontsSettled(l.page)
			wrong.push(
				...(await wrongFaces(cdp, `${where} pocketed`, ours, {
					'liner title': '.pocket-chips .pocket-host.is-pocketed .pocket-liner__text',
					'liner Put back': '.pocket-chips .pocket-host.is-pocketed .pocket-liner__undo',
					'Pocket button count': '.pocket-peek[data-state="shown"] .pocket-peek__count',
				})),
			)

			// The album, opened with the Pocket button.
			const peek = await l.page.evaluate(() => {
				const r = document.querySelector('.pocket-peek[data-state="shown"]')!.getBoundingClientRect()
				return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
			})
			await l.page.mouse.click(peek.x, peek.y)
			await l.page.waitForFunction(() => {
				const s = (window as any).__aixc.demos.pocket.state
				return s.view === 'pocket' && !s.busy
			}, null, { timeout: 10_000 })
			await fontsSettled(l.page)
			wrong.push(
				...(await wrongFaces(cdp, `${where} album`, ours, {
					'album title': '#pocket-output .pocket-view__title',
					'album lead': '#pocket-output .pocket-view__lead',
					Back: '#pocket-output .pocket-view__start .pocket-back',
					'Empty pocket': '#pocket-output .pocket-clear',
					'group head': '#pocket-output .pocket-group__title',
					'This page?': '#pocket-output .pocket-group__here',
					'sticker from?': '#pocket-output .pocket-sticker__from',
					'sticker title': '#pocket-output .pocket-sticker__title',
					'sticker date?': '#pocket-output .pocket-sticker__date',
					'sticker link?': '#pocket-output .pocket-sticker__cta',
				}, ['album title', 'group head', 'sticker title'])),
			)
			const faces = await aliases(l.page)
			console.log(`${where} our aliases: ${JSON.stringify(faces)}`)
			console.log(`${where} fonts refused offline: ${JSON.stringify(l.refused.filter((r) => r.type === 'font').map((r) => new URL(r.url).pathname))}`)

			assert.deepEqual(wrong, [], `${where}: every word of ours is drawn in Vodafone's own faces`)
			if (c.fetched) assert.equal(faces[c.fetched], 'loaded', `${where}: the page's theme has no bold face, so ours is fetched from Vodafone's own files`)
			else assert.deepEqual(Object.entries(faces).filter(([, status]) => status === 'loaded'), [], `${where}: the page's theme has every face, so none of ours is fetched`)
			assert.deepEqual(seen.pageErrors, [], `${where}: no page errors`)
			assert.deepEqual(l.reached, [], `${where}: nothing reached the internet`)
		} finally {
			await l.close()
		}
	})
}

/** A sticker kept in Arabic, whatever page it is shown on (ADR-0052 §7: its words carry lang="ar"). */
const ARABIC_STICKER = {
	v: 2,
	key: 't-arabic',
	id: 'mega-1400',
	kind: 'card-action',
	keys: [{ kind: 'digits', value: '1400' }],
	copy: { title: 'ميجا 1400', description: 'بـ 37 جنيه', lang: 'ar', dir: 'rtl' },
	image: null,
	cta: { label: null, href: 'https://web.vodafone.com.eg/ar/mobile-internet-bundles' },
	source: { page: '/mobile-internet-bundles', path: '/ar/mobile-internet-bundles', pageId: null, title: { ar: 'باقات النت' }, section: { id: 'b', title: 'باقات' } },
	origin: 'person',
	savedAt: Date.UTC(2026, 10, 12, 9),
	seenAt: Date.UTC(2026, 10, 12, 9),
}

for (const p of ['/en/home', '/en/services']) {
	test(`${p} 1366: a sticker kept in Arabic draws its title and copy in Vodafone's Arabic faces, not a system font`, async () => {
		const l = await launchLayer(gw, { viewport: DESKTOP, owl: true, reducedMotion: true })
		try {
			await l.b.context.route('**/theme-assets/static-lite-theme/fonts/*.woff', (route) => route.fulfill({ path: path.join(REPLAY, 'assets/theme-assets/maintheme/fonts', path.basename(new URL(route.request().url()).pathname)), contentType: 'font/woff' }))
			await open(l.page, p, '?aixc-debug')
			await l.page.waitForFunction(() => (window as any).__aixc?.demos?.pocket?.store, null, { timeout: 15_000 })
			await l.page.evaluate(async (rec) => {
				const { store } = (window as any).__aixc.demos.pocket
				await store.ready
				await store.clear()
				await store.put(rec)
			}, ARABIC_STICKER)
			await l.page.reload({ waitUntil: 'load' })
			await l.page.waitForFunction(() => (window as any).__aixc?.demos?.pocket?.state.ids.length === 1, null, { timeout: 15_000 })
			await l.page.waitForSelector('.pocket-peek[data-state="shown"]', { timeout: 10_000 })
			const cdp = await l.page.context().newCDPSession(l.page)
			await cdp.send('DOM.enable')
			await cdp.send('CSS.enable')
			const peek = await l.page.evaluate(() => {
				const r = document.querySelector('.pocket-peek[data-state="shown"]')!.getBoundingClientRect()
				return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
			})
			await l.page.mouse.click(peek.x, peek.y)
			await l.page.waitForFunction(() => {
				const s = (window as any).__aixc.demos.pocket.state
				return s.view === 'pocket' && !s.busy
			}, null, { timeout: 10_000 })
			await fontsSettled(l.page)
			const wrong: string[] = []
			for (const [name, selector] of Object.entries({ 'Arabic sticker title': '#pocket-output .pocket-sticker__title[lang="ar"]', 'Arabic sticker copy': '#pocket-output .pocket-sticker__desc[lang="ar"]' })) {
				const found = await fontsOf(cdp, selector)
				assert.ok(found?.fonts.length, `${p}: ${name} is drawn`)
				console.log(`${p} ${name}: ${found.fonts.map((f) => `${f.family}${f.custom ? '' : ' (system)'} ×${f.glyphs}`).join(', ')} [${found.stack}]`)
				for (const f of found.fonts) if (!(f.custom && VODAFONE.test(f.family))) wrong.push(`${name}: ${f.family}${f.custom ? '' : ' (system)'}`)
			}
			assert.deepEqual(wrong, [], `${p}: a sticker kept in Arabic is drawn in Vodafone's own faces`)
		} finally {
			await l.close()
		}
	})
}

/** A sticker kept in English, from a page of the same site (ADR-0052 §7). */
const ENGLISH_STICKER = {
	...ARABIC_STICKER,
	key: 't-english',
	copy: { title: 'Mega 1400', description: 'For 37 EGP', lang: 'en', dir: 'ltr' },
	cta: { label: null, href: 'https://web.vodafone.com.eg/en/mobile-internet-bundles' },
	source: { page: '/mobile-internet-bundles', path: '/en/mobile-internet-bundles', pageId: null, title: { en: 'Internet bundles' }, section: { id: 'b', title: 'Bundles' } },
}

/** The album's three headings, which are ours and draw in our bold stack on every theme, at the two widths (ADR-0052 §12). */
const HEADINGS = { 'album title': '#pocket-output .pocket-view__title', 'group head': '#pocket-output .pocket-group__title', 'sticker title': '#pocket-output .pocket-sticker__title' }
const SIZES = [
	{ name: '1366', viewport: DESKTOP },
	{ name: '375', viewport: PHONE },
]

for (const p of ['/en/home', '/en/services', '/en/mobile-internet-bundles']) {
	for (const size of SIZES) {
		test(`${p} ${size.name}: the album's title, a group title and a sticker title are drawn in our bold stack, in Vodafone's own faces`, async () => {
			const l = await launchLayer(gw, { viewport: size.viewport, owl: true, reducedMotion: true })
			try {
				await l.b.context.route('**/theme-assets/static-lite-theme/fonts/*.woff', (route) => route.fulfill({ path: path.join(REPLAY, 'assets/theme-assets/maintheme/fonts', path.basename(new URL(route.request().url()).pathname)), contentType: 'font/woff' }))
				const where = `${p} ${size.name}`
				await open(l.page, p, '?aixc-debug')
				await l.page.waitForFunction(() => (window as any).__aixc?.demos?.pocket?.store, null, { timeout: 15_000 })
				await l.page.evaluate(async (rec) => {
					const { store } = (window as any).__aixc.demos.pocket
					await store.ready
					await store.clear()
					await store.put(rec)
				}, ENGLISH_STICKER)
				await l.page.reload({ waitUntil: 'load' })
				await l.page.waitForFunction(() => (window as any).__aixc?.demos?.pocket?.state.ids.length === 1, null, { timeout: 15_000 })
				await l.page.waitForSelector('.pocket-peek[data-state="shown"]', { timeout: 10_000 })
				const cdp = await l.page.context().newCDPSession(l.page)
				await cdp.send('DOM.enable')
				await cdp.send('CSS.enable')
				const peek = await l.page.evaluate(() => {
					const r = document.querySelector('.pocket-peek[data-state="shown"]')!.getBoundingClientRect()
					return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
				})
				await l.page.mouse.click(peek.x, peek.y)
				await l.page.waitForFunction(() => {
					const s = (window as any).__aixc.demos.pocket.state
					return s.view === 'pocket' && !s.busy
				}, null, { timeout: 10_000 })
				await fontsSettled(l.page)
				const ours = await ourStacks(l.page)
				const wrong = await wrongFaces(cdp, `${where} album`, ours, HEADINGS, Object.keys(HEADINGS))
				// What the theme's heading rules leave of the rest of our class values (printed, for the lead).
				const styles = await l.page.evaluate((heads) => {
					const rootPx = parseFloat(getComputedStyle(document.documentElement).fontSize)
					return Object.fromEntries(
						Object.entries(heads).map(([name, sel]) => {
							const el = document.querySelector(sel)
							if (!el) return [name, null]
							const c = getComputedStyle(el)
							return [name, { tag: el.tagName, rootPx, size: c.fontSize, weight: c.fontWeight, line: c.lineHeight, margin: c.margin, transform: c.textTransform, spacing: c.letterSpacing }]
						}),
					)
				}, HEADINGS)
				console.log(`${where} heading styles: ${JSON.stringify(styles)}`)
				assert.deepEqual(wrong, [], `${where}: the album's own headings are drawn in our bold stack`)
			} finally {
				await l.close()
			}
		})
	}
}
