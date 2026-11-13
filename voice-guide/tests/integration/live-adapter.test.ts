/**
 * The live adapter (experiences/src/host/live-adapter.js; ADR-0046 §3, live plan phase 2) on the
 * saved Vodafone pages of 2026-10-23, in Chromium: the page's own markup, scripts removed, nothing
 * fetched. What it finds per page (sections, cards, coverage) is printed as the runbook's table.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'

import * as esbuild from 'esbuild'
import { type Browser, chromium, type Page } from 'playwright'

import { ROOT } from '#shared/config.ts'

const ORIGIN = 'https://web.vodafone.com.eg'
const REPLAY = path.join(ROOT, 'fixtures/replay/vodafone-eg')
const ADAPTER = path.join(ROOT, '../experiences/src/host/live-adapter.js')

interface Saved {
	url: string
	snapshot?: string
}
const saved = (JSON.parse(fs.readFileSync(path.join(REPLAY, 'crawl.json'), 'utf8')) as { pages: Saved[] }).pages.filter((p) => p.snapshot && /^\/(en|ar)\//.test(new URL(p.url).pathname))
const htmlOf = (p: Saved) => {
	const buf = fs.readFileSync(path.join(REPLAY, p.snapshot!))
	return (p.snapshot!.endsWith('.gz') ? gunzipSync(buf) : buf).toString('utf8')
}

let browser: Browser
let bundle: string

before(async () => {
	const r = await esbuild.build({ entryPoints: [ADAPTER], bundle: true, format: 'iife', globalName: '__live', write: false, target: 'es2022' })
	bundle = r.outputFiles[0].text
	browser = await chromium.launch()
})
after(async () => {
	await browser?.close()
})

interface Read {
	model: { pageId: string; title: string | null; sections: { id: string; title: string | null; items: { id: string; title: string; description: string | null; image: { src: string } | null; cta: { label: string | null; href: string | null } | null }[] }[]; closingPromotion: { id: string } | null } | null
	problems: string[]
	coverage: { ratio: number; cards: number; usable: number; unread: number; sections: { id: string; cards: number; usable: number; unread: number }[] }
	portlets: number
}

/** Opens saved markup with its scripts taken out and nothing fetched, and reads it. */
async function read(page: Page, html: string, pathname: string): Promise<Read> {
	await page.route('**/*', (route) => route.abort())
	await page.setContent(html.replace(/<script\b[\s\S]*?<\/script>/gi, ''), { waitUntil: 'domcontentloaded' })
	await page.addScriptTag({ content: bundle })
	return page.evaluate(
		([origin, p]) => {
			const r = (window as any).__live.readPage(document, { origin, path: p })
			return { model: r.model, problems: r.problems, coverage: r.coverage, portlets: document.querySelectorAll('#layout-column_column-1 > .portlet-boundary').length }
		},
		[ORIGIN, pathname],
	)
}

test('every saved CMS page: sections and cards found, ids unique and valid, coverage printed', async () => {
	const page = await browser.newPage()
	const rows: string[] = []
	try {
		for (const p of saved) {
			const pathname = new URL(p.url).pathname
			const r = await read(page, htmlOf(p), pathname)
			assert.ok(r.model, `${pathname}: a model (${r.problems.join('; ')})`)
			const items = r.model!.sections.flatMap((s) => s.items)
			const ids = items.map((i) => i.id)
			assert.equal(new Set(ids).size, ids.length, `${pathname}: unique ids`)
			assert.ok(ids.every((id) => /^[a-z0-9][a-z0-9-]{0,63}$/.test(id)), `${pathname}: valid ids`)
			assert.deepEqual(r.problems.filter((x) => /duplicate|invalid/i.test(x)), [], `${pathname}: nothing dropped`)
			rows.push(`| ${pathname} | ${r.portlets} | ${r.model!.sections.length} | ${items.length} | ${r.coverage.cards} | ${r.coverage.usable} | ${r.coverage.ratio} |`)
		}
	} finally {
		await page.close()
	}
	console.log(`# saved pages of 2026-10-23\n# | page | portlets | sections | items | cards | with title and link | coverage |\n${rows.map((r) => `# ${r}`).join('\n')}`)
})

const savedAt = (pathname: string) => saved.find((p) => new URL(p.url).pathname === pathname)!

test('/en/services: the eight portlets, 12 action cards and 17 service cards, the hero and the app band as on the page', async () => {
	const page = await browser.newPage()
	try {
		const r = await read(page, htmlOf(savedAt('/en/services')), '/en/services')
		const m = r.model!
		assert.equal(r.portlets, 8)
		assert.equal(m.title, 'Vodafone Services', 'the hero is the page title')
		const bySection = Object.fromEntries(m.sections.map((s) => [s.id, s.items.length]))
		assert.deepEqual(bySection, { umh7uxmmgjvk: 1, w9jro8tdb1vh: 5, xsg0av63s0tv: 3, fkwenp1q3ubi: 7, crxwnpmfox6c: 6, wfhgzwfxieab: 8 }, 'sections keyed by their portlet instance ids')
		assert.equal(bySection.w9jro8tdb1vh + bySection.fkwenp1q3ubi, 12, 'card-action')
		assert.equal(bySection.xsg0av63s0tv + bySection.crxwnpmfox6c + bySection.wfhgzwfxieab, 17, 'card-subscription')
		assert.equal(m.sections.find((s) => s.id === 'w9jro8tdb1vh')!.title, 'Stay In Control')
		assert.ok(m.closingPromotion, 'the Ana Vodafone band is the closing promotion')
		const entertainment = m.sections.find((s) => s.id === 'fkwenp1q3ubi')!.items
		assert.ok(entertainment.every((i) => i.cta?.href === null && (i.cta as { opens?: string }).opens === 'dialog'), 'Great Entertainment opens the page\'s own dialog; no link is invented')
		const roaming = m.sections.flatMap((s) => s.items).find((i) => i.id === 'spa-roaming')
		assert.ok(roaming, 'the roaming card, keyed by its link')
		assert.equal(roaming!.cta?.href, `${ORIGIN}/spa/roaming`)
		assert.match(roaming!.title, /roaming/i)
		assert.ok(m.sections.flatMap((s) => s.items).filter((i) => i.image).every((i) => i.image!.src.startsWith(`${ORIGIN}/documents/`)), 'pictures from Vodafone\'s own origin, data-src first')
		assert.equal(r.coverage.ratio, 1, 'every card has a title and an action')
	} finally {
		await page.close()
	}
})

test('item ids are mostly the same in English and Arabic (links and picture names, not titles)', async () => {
	const page = await browser.newPage()
	try {
		const ids = async (p: string) => new Set((await read(page, htmlOf(savedAt(p)), p)).model!.sections.flatMap((s) => s.items.map((i) => i.id)))
		// Services: 28 of 30 on 2026-10-23; the two others are the Arabic page's own CMS slips (Mini Call links
		// /spa/roaming, 3alam Mama's picture has another name).
		for (const [en, ar, atLeast] of [['/en/services', '/ar/services', 28], ['/en/vodafone-red1', '/ar/vodafone-red1', 5]] as const) {
			const a = await ids(en)
			const b = await ids(ar)
			const same = [...a].filter((x) => b.has(x)).length
			console.log(`# ${en} and ${ar}: ${same} of ${a.size} ids the same`)
			assert.ok(same >= atLeast, `${same} of ${a.size} the same in both languages`)
		}
	} finally {
		await page.close()
	}
})

test('Owl\'s copies of cards are never read; reading changes nothing; tags come off cleanly', async () => {
	const page = await browser.newPage()
	try {
		const card = (n: number) => `<div class="carousel-item"><div class="card-plan card-collapsing"><div class="card-plan-header"><div class="card-plan-header-type"><h3>Plan ${n}</h3></div><p class="text-2x">EGP ${n}00</p></div><a class="btn btn-primary" href="/en/plan-${n}">Buy now</a></div></div>`
		const owl = `<div class="owl-stage-outer"><div class="owl-stage">${[1, 2, 3].map((n) => `<div class="owl-item">${card(n)}</div>`).join('')}${[1, 2].map((n) => `<div class="owl-item cloned">${card(n)}</div>`).join('')}</div></div>`
		const html = `<html><body><div id="main-content"><div id="layout-column_column-1"><div class="portlet-boundary" id="p_p_id_com_liferay_journal_content_web_portlet_JournalContentPortlet_INSTANCE_AbCdEf123456_"><div class="section-title"><h2>Plans</h2></div><div class="owl-carousel">${owl}</div></div></div></div></body></html>`
		const r = await read(page, html, '/en/test')
		assert.deepEqual(r.model!.sections.map((s) => [s.id, s.items.map((i) => i.id)]), [['abcdef123456', ['plan-1', 'plan-2', 'plan-3']]], 'three plans, not five')
		const outcome = await page.evaluate(() => {
			const before = document.documentElement.outerHTML
			const a = (window as any).__live.createLiveAdapter({ doc: document, origin: 'https://web.vodafone.com.eg', path: '/en/test' })
			a.extractContent()
			const untouched = document.documentElement.outerHTML === before
			a.tag()
			const tagged = { items: document.querySelectorAll('[data-aixc-item]').length, sections: document.querySelectorAll('[data-aixc-section]').length, clones: document.querySelectorAll('.cloned [data-aixc-item]').length }
			a.untag()
			return { untouched, tagged, after: document.documentElement.outerHTML === before }
		})
		assert.equal(outcome.untouched, true, 'reading writes nothing')
		assert.deepEqual(outcome.tagged, { items: 3, sections: 1, clones: 0 })
		assert.equal(outcome.after, true, 'untag leaves the page exactly as it was')
	} finally {
		await page.close()
	}
})

/** The knowledge base's map of a page, as GET /v1/page-map serves it (services/knowledge pageMap). */
const pageMapOf = (pageId: string) => {
	const m = JSON.parse(fs.readFileSync(path.join(ROOT, 'config/kb/vodafone-eg.manifest.json'), 'utf8')) as { destinations: { id: string; pageId: string; kind: string; commit?: boolean; target?: { css: string[] }; labels?: Record<string, string[]> }[] }
	return {
		sections: m.destinations
			.filter((d) => d.pageId === pageId && ['section', 'collection', 'faq'].includes(d.kind) && !d.commit && d.target)
			.map((d) => ({ id: d.id, kind: d.kind, css: d.target!.css, title: Object.fromEntries(Object.entries(d.labels || {}).map(([l, v]) => [l, v[0]])) })),
	}
}

test('each Services section knows its knowledge destination (the ones the clone hand-mapped), in both languages', async () => {
	const page = await browser.newPage()
	try {
		// The clone's hand-made map (experiences/src/main.js GUIDE_DESTINATIONS), now found from the page.
		const expected = { umh7uxmmgjvk: 'web.services.vodafone-cash', w9jro8tdb1vh: 'web.services.test', xsg0av63s0tv: 'web.services.call-connect-abroad', fkwenp1q3ubi: 'web.services.great-entertainment', crxwnpmfox6c: 'web.services.shokran-services', wfhgzwfxieab: 'web.services.enjoy-other-services' }
		for (const p of ['/en/services', '/ar/services']) {
			await page.route('**/*', (route) => route.abort())
			await page.setContent(htmlOf(savedAt(p)).replace(/<script\b[\s\S]*?<\/script>/gi, ''), { waitUntil: 'domcontentloaded' })
			await page.addScriptTag({ content: bundle })
			const before = await page.evaluate(() => document.documentElement.outerHTML)
			const sections = await page.evaluate(([origin, path, map]) => (window as any).__live.readPage(document, { origin, path, pageMap: map }).model.sections.map((s: { id: string; destinationId?: string }) => [s.id, s.destinationId ?? null]), [ORIGIN, p, pageMapOf('web.services')] as const)
			assert.deepEqual(Object.fromEntries(sections), expected, `${p}: the Great Entertainment portlet gets its own destination, not the one mislabelled from its dialog`)
			assert.equal(await page.evaluate(() => document.documentElement.outerHTML), before, `${p}: reading writes nothing`)
			// What the layer does (createLiveAdapter, then tag()): its own marks only, never a destination on Vodafone's elements.
			const tagged = await page.evaluate(([origin, path, map]) => {
				const a = (window as any).__live.createLiveAdapter({ doc: document, origin, path, pageMap: map })
				const named = a.extractContent().model.sections.filter((s: { destinationId?: string }) => s.destinationId).length
				a.tag()
				const out = { named, destinations: document.querySelectorAll('[data-vg-destination]').length, marked: document.querySelectorAll('[data-aixc-section]').length > 0 }
				a.untag()
				return out
			}, [ORIGIN, p, pageMapOf('web.services')] as const)
			assert.deepEqual(tagged, { named: 6, destinations: 0, marked: true }, `${p}: six sections named on the model; tag() marks the sections but puts no data-vg-destination on the page`)
			assert.equal(await page.evaluate(() => document.documentElement.outerHTML), before, `${p}: untag() leaves the page as it was`)
		}
	} finally {
		await page.close()
	}
})

test('the destinations hold when Vodafone rewords or drops a heading the knowledge base still has', async () => {
	const page = await browser.newPage()
	try {
		/** The page's sections and their destinations, after `change` ran on the page's section headings. */
		const named = async (p: string, pageId: string, change: 'reword' | 'drop') => {
			await page.route('**/*', (route) => route.abort())
			await page.setContent(htmlOf(savedAt(p)).replace(/<script\b[\s\S]*?<\/script>/gi, ''), { waitUntil: 'domcontentloaded' })
			await page.addScriptTag({ content: bundle })
			return Object.fromEntries(
				await page.evaluate(
					([origin, path, map, change]) => {
						for (const h of document.querySelectorAll('#main-content .section-title h2, #main-content .section-title h3')) {
							if (change === 'drop') h.remove()
							else h.textContent = `${h.textContent} (new)`
						}
						return (window as any).__live.readPage(document, { origin, path, pageMap: map }).model.sections.map((x: { id: string; destinationId?: string }) => [x.id, x.destinationId ?? null])
					},
					[ORIGIN, p, pageMapOf(pageId), change] as const,
				),
			)
		}
		// Great Entertainment's portlet also holds the dialog's section, located as the whole portlet: the inner one wins.
		for (const p of ['/en/services', '/ar/services']) assert.equal((await named(p, 'web.services', 'reword')).fkwenp1q3ubi, 'web.services.great-entertainment', `${p}: reworded heading, still its own destination`)
		// No heading: never an unlabelled card list in place of the section's own destination.
		for (const p of ['/en/mobile-internet-bundles', '/ar/mobile-internet-bundles']) assert.equal((await named(p, 'web.mobile-internet-bundles', 'drop')).evw9yawjuhob, 'web.mobile-internet-bundles.vodafone-plus-2', `${p}: no heading, the section destination`)
	} finally {
		await page.close()
	}
})

test('links are the ones the browser would follow: relative to the page, so an Arabic page keeps /ar/ (AIXC-29)', async () => {
	const page = await browser.newPage()
	try {
		for (const [p, lang] of [['/ar/services', 'ar'], ['/en/services', 'en'], ['/ar/home', 'ar'], ['/ar/vodafone-cash', 'ar']] as const) {
			const html = htmlOf(savedAt(p))
			const r = await read(page, html, p)
			const hrefs = r.model!.sections.flatMap((x) => x.items.map((i) => i.cta?.href)).filter((h): h is string => !!h && h.startsWith(ORIGIN))
			// What the browser makes of every card link on the page, given the page's own address.
			const expected = await page.evaluate(([base]) => [...document.querySelectorAll('#main-content a[href]')].map((a) => { try { return new URL(a.getAttribute('href')!.trim(), base).href } catch { return '' } }), [`${ORIGIN}${p}`])
			for (const h of hrefs) assert.ok(expected.includes(h), `${p}: ${h} is a link of the page`)
			const cash = r.model!.sections.flatMap((x) => x.items).find((i) => i.id === 'vodafone-cash')
			if (cash) assert.equal(cash.cta?.href, `${ORIGIN}/${lang}/vodafone-cash`, `${p}: href="vodafone-cash" stays in the page's language`)
			assert.ok(!hrefs.some((h) => /^https:\/\/web\.vodafone\.com\.eg\/(?!en\/|ar\/|spa\/|documents\/|web\/|o\/)[a-z]/.test(h)), `${p}: no link lost its language`)
		}
		// A <base>, a link into the page itself, and the ids they give.
		const card = (href: string, title: string) => `<div class="card-action"><a href="${href}"><div class="card-action-body"><h4>${title}</h4></div></a></div>`
		const html = `<html><head><base href="/en/hub/"></head><body><div id="main-content"><div id="layout-column_column-1"><div class="portlet-boundary" id="p_p_id_x_INSTANCE_AbCdEf123456_">${card('offers', 'Offers')}${card('#plans', 'Plans')}${card('/ar/roaming', 'Roaming')}</div></div></div></body></html>`
		const r = await read(page, html, '/en/test')
		assert.deepEqual(r.model!.sections[0].items.map((i) => [i.id, i.cta?.href]), [['hub-offers', `${ORIGIN}/en/hub/offers`], ['hub-plans', `${ORIGIN}/en/hub/#plans`], ['roaming', `${ORIGIN}/ar/roaming`]], 'resolved against the page\'s <base>')
		// A page opened with a query: a link into the page keeps it, as in the browser.
		await page.setContent(html.replace('<base href="/en/hub/">', ''), { waitUntil: 'domcontentloaded' })
		await page.addScriptTag({ content: bundle })
		const q = await page.evaluate(([origin]) => (window as any).__live.readPage(document, { origin, path: '/en/test', search: '?promo=1' }).model.sections[0].items.map((i: { id: string; cta: { href: string } }) => [i.id, i.cta.href]), [ORIGIN])
		assert.deepEqual(q, [['offers', `${ORIGIN}/en/offers`], ['plans', `${ORIGIN}/en/test?promo=1#plans`], ['roaming', `${ORIGIN}/ar/roaming`]])
	} finally {
		await page.close()
	}
})

test('coverage falls when Vodafone renames a card class: the cards no row reads still count (AIXC-30)', async () => {
	const page = await browser.newPage()
	try {
		const html = htmlOf(savedAt('/en/services'))
		const before = await read(page, html, '/en/services')
		assert.deepEqual([before.coverage.ratio, before.coverage.unread], [1, 0])
		// The 17 service cards get another class: no recogniser row matches them any more.
		const renamed = await read(page, html.replace(/\bcard-subscription\b/g, 'card-offer'), '/en/services')
		assert.equal(renamed.model!.sections.flatMap((x) => x.items).length, 13, 'only the action cards and the band are read')
		assert.ok(renamed.coverage.unread >= 15, `the renamed cards are seen as unread (${renamed.coverage.unread})`)
		assert.ok(renamed.coverage.ratio < 0.6, `coverage ${renamed.coverage.ratio} is under the Pocket's 0.6 and Reimagine's 0.9: the demos are not offered`)
		assert.deepEqual(renamed.coverage.sections.filter((x) => x.unread).map((x) => x.id).sort(), ['crxwnpmfox6c', 'wfhgzwfxieab', 'xsg0av63s0tv'], 'the three sections that lost their cards are named')
		// Every kind of card, on every saved page it is on: renamed, it is seen as unread and the page falls under Reimagine's 0.9.
		// (The first rule missed cards that are themselves the link, cards without a picture or a button, and cards one to a column.)
		const kinds = ['card-action', 'card-subscription', 'card-plan', 'card-horizontal', 'tiles', 'ticket', 'carousel-item']
		let checked = 0
		for (const p of saved) {
			const pathname = new URL(p.url).pathname
			const source = htmlOf(p)
			const asIs = await read(page, source, pathname)
			// Nothing is unread today, except on the home-wireless page, whose router offer and price table no row reads (it is not offered there).
			if (/wireless-net/.test(pathname)) assert.deepEqual([asIs.coverage.ratio, asIs.coverage.unread > 0], [0, true], pathname)
			else assert.equal(asIs.coverage.unread, 0, `${pathname}: nothing card-like left unread`)
			for (const kind of kinds) {
				const cls = new RegExp(`(class="[^"]*?)\\b${kind}\\b(?![-\\w])`, 'g')
				if (!cls.test(source)) continue
				const r = await read(page, source.replace(new RegExp(`(class="[^"]*?)\\b${kind}\\b(?![-\\w])`, 'g'), `$1${kind}-x`), pathname)
				if (r.coverage.usable === asIs.coverage.usable) continue
				checked++
				assert.ok(r.coverage.ratio < 0.9, `${pathname}: ${kind} renamed, ${asIs.coverage.usable - r.coverage.usable} cards gone, coverage ${r.coverage.ratio} (unread ${r.coverage.unread})`)
				assert.equal(r.coverage.usable + r.coverage.unread, r.coverage.cards)
			}
		}
		assert.equal(checked, 19, `renames checked: ${checked}`)
		// A card left out on purpose (the sign-in ticket on the bundles page) is not an unread one.
		assert.equal((await read(page, htmlOf(savedAt('/en/mobile-internet-bundles')), '/en/mobile-internet-bundles')).coverage.unread, 0)
	} finally {
		await page.close()
	}
})

test('the page changes after load: a carousel\'s new copies lose the layer\'s marks, a new card is read, ids stay (AIXC-28)', async () => {
	const page = await browser.newPage()
	try {
		const card = (n: number) => `<div class="owl-item"><div class="carousel-item"><div class="card-plan card-collapsing"><div class="card-plan-header"><div class="card-plan-header-type"><h3>Plan ${n}</h3></div><p class="text-2x">EGP ${n}00</p></div><a class="btn btn-primary" href="/en/plan-${n}">Buy now</a></div></div></div>`
		const html = `<html><body><div id="main-content"><div id="layout-column_column-1"><div class="portlet-boundary" id="p_p_id_x_INSTANCE_AbCdEf123456_"><div class="section-title"><h2>Plans</h2></div><div class="owl-carousel"><div class="owl-stage-outer"><div class="owl-stage">${[1, 2, 3].map(card).join('')}</div></div></div></div></div></div></body></html>`
		await page.route('**/*', (route) => route.abort())
		await page.setContent(html, { waitUntil: 'domcontentloaded' })
		await page.addScriptTag({ content: bundle })
		const out = await page.evaluate(async (fourth) => {
			const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
			const marks = (sel: string) => document.querySelectorAll(sel).length
			const stage = document.querySelector('.owl-stage')!
			const pristine = document.documentElement.outerHTML
			const a = (window as any).__live.createLiveAdapter({ doc: document, origin: 'https://web.vodafone.com.eg', path: '/en/test' })
			const ids = () => a.extractContent().model.sections.flatMap((x: any) => x.items.map((i: any) => i.id))
			const first = ids()
			a.tag()
			const calls: boolean[] = []
			const stop = a.watch((next: { changed: boolean }) => calls.push(next.changed), { delay: 60 })
			// Owl refreshes (a resize): its copies are rebuilt from the cards' own markup, marks and all.
			const copies = () => {
				stage.querySelectorAll('.owl-item.cloned').forEach((c) => c.remove())
				const real = [...stage.querySelectorAll('.owl-item:not(.cloned)')]
				for (const el of real.slice(0, 2)) stage.insertAdjacentHTML('beforeend', el.outerHTML.replace('class="owl-item"', 'class="owl-item cloned"'))
				stage.insertAdjacentHTML('afterbegin', real.at(-1)!.outerHTML.replace('class="owl-item"', 'class="owl-item cloned"'))
			}
			copies()
			const copied = marks('.cloned [data-aixc-item]')
			await wait(250)
			const afterCopies = { onCopies: marks('.cloned [data-aixc-item]'), onCards: marks('.owl-item:not(.cloned) [data-aixc-item]'), calls: [...calls], ids: ids() }
			// Vodafone adds a card (a lazy section, an editor's change): it is read and marked; the others keep their ids.
			stage.querySelector('.owl-item:not(.cloned):last-of-type')
			;[...stage.querySelectorAll('.owl-item:not(.cloned)')].at(-1)!.insertAdjacentHTML('afterend', fourth)
			copies()
			await wait(250)
			const afterCard = { onCopies: marks('.cloned [data-aixc-item]'), onCards: marks('.owl-item:not(.cloned) [data-aixc-item]'), calls: [...calls], ids: ids() }
			// Only words change (a price, a late title): Vodafone's content changed all the same.
			stage.querySelector('.owl-item:not(.cloned) h3')!.textContent = 'Plan One'
			await wait(250)
			const afterWords = { calls: [...calls], title: a.extractContent().model.sections[0].items[0].title }
			;(stage.querySelector('.owl-item:not(.cloned) h3')!.firstChild as Text).data = 'Plan 1'
			await wait(250)
			const afterData = { calls: calls.length, title: a.extractContent().model.sections[0].items[0].title }
			// The layer's own nodes coming and going are not Vodafone's page changing.
			const own = Object.assign(document.createElement('div'), { textContent: 'ours' })
			own.setAttribute('data-aixc', '')
			document.getElementById('main-content')!.append(own)
			await wait(200)
			own.textContent = 'ours, changed'
			await wait(200)
			const afterOwn = calls.length
			own.remove()
			stop()
			stage.querySelectorAll('.owl-item.cloned').forEach((c) => c.remove())
			;[...stage.querySelectorAll('.owl-item')].at(-1)!.remove()
			await wait(200)
			a.untag()
			return { first, copied, afterCopies, afterCard, afterWords, afterData, afterOwn, callsAtEnd: calls.length, marksLeft: marks('[data-aixc-item], [data-aixc-section]'), restored: document.documentElement.outerHTML === pristine }
		}, card(4))
		assert.deepEqual(out.first, ['plan-1', 'plan-2', 'plan-3'])
		assert.equal(out.copied, 3, 'the copies do carry the marks at first: Owl copies the cards\' markup')
		assert.deepEqual(out.afterCopies, { onCopies: 0, onCards: 3, calls: [false], ids: ['plan-1', 'plan-2', 'plan-3'] }, 're-read once: marks off the copies, on the cards, same model')
		assert.deepEqual(out.afterCard, { onCopies: 0, onCards: 4, calls: [false, true], ids: ['plan-1', 'plan-2', 'plan-3', 'plan-4'] }, 'the new card is read and marked; the others keep their ids')
		assert.deepEqual(out.afterWords, { calls: [false, true, true], title: 'Plan One' }, 'a title replaced: read again, the model has the new words')
		assert.deepEqual(out.afterData, { calls: 4, title: 'Plan 1' }, 'a text node edited in place: read again')
		assert.equal(out.afterOwn, 4, 'the layer\'s own nodes, and words inside them, do not cause a re-read')
		assert.equal(out.callsAtEnd, 4, 'stopped: no more re-reads')
		assert.equal(out.marksLeft, 0, 'untag() leaves no mark anywhere')
		assert.equal(out.restored, true, 'and the page is as it was')
	} finally {
		await page.close()
	}
})

test('the layer\'s own nodes inside Vodafone\'s cards are never read: the same model, coverage and tags (phase 3 S3, AIXC-59)', async () => {
	const page = await browser.newPage()
	try {
		for (const p of saved) {
			const pathname = new URL(p.url).pathname
			await page.route('**/*', (route) => route.abort())
			await page.setContent(htmlOf(p).replace(/<script\b[\s\S]*?<\/script>/gi, ''), { waitUntil: 'domcontentloaded' })
			await page.addScriptTag({ content: bundle })
			const out = await page.evaluate(([origin, path]) => {
				const a = (window as any).__live.createLiveAdapter({ doc: document, origin, path })
				const state = () => {
					const { model, coverage } = a.extractContent()
					return { ids: model?.sections.flatMap((x: { items: { id: string }[] }) => x.items.map((i) => i.id)) ?? [], model: JSON.stringify(model), coverage, tags: [...document.querySelectorAll('[data-aixc-item]')].map((e) => (e as HTMLElement).dataset.aixcItem).sort() }
				}
				a.tag()
				const before = state()
				// What the Pocket puts in a card (a button and its "In your pocket" liner), a layer node with a
				// link and a picture ahead of the card's own, and its lifted copy of a card.
				const cards = [...document.querySelectorAll('[data-aixc-item]')]
				for (const card of cards) {
					const chip = Object.assign(document.createElement('button'), { type: 'button', textContent: 'Pocket it' })
					chip.setAttribute('data-aixc', '')
					const liner = document.createElement('div')
					liner.setAttribute('data-aixc', '')
					liner.innerHTML = '<div class="pocket-liner__content"><p class="pocket-liner__text">In your pocket</p><button type="button">Put back</button></div>'
					const ahead = document.createElement('a')
					ahead.setAttribute('data-aixc', '')
					ahead.className = 'btn'
					ahead.href = '/en/not-vodafones'
					ahead.innerHTML = '<img src="https://web.vodafone.com.eg/documents/1/not-vodafones.png" alt="layer"><h3>Layer</h3>'
					card.prepend(ahead)
					card.append(chip, liner)
				}
				if (cards[0]) {
					const lift = document.createElement('div')
					lift.setAttribute('data-aixc', '')
					const copy = cards[0].cloneNode(true) as Element
					copy.removeAttribute('data-aixc-item')
					lift.append(copy)
					cards[0].append(lift)
				}
				a.refresh()
				a.tag()
				return { before, after: state(), band: !!document.querySelector('[data-aixc-item="vodafone-cash"]') }
			}, [ORIGIN, pathname] as const)
			assert.deepEqual(out.after.ids, out.before.ids, `${pathname}: same items and ids`)
			assert.equal(out.after.model, out.before.model, `${pathname}: the same model, word for word (titles, descriptions, links, pictures, keys)`)
			assert.deepEqual(out.after.coverage, out.before.coverage, `${pathname}: same coverage`)
			assert.deepEqual(out.after.tags, out.before.tags, `${pathname}: same tags`)
			if (/\/services$/.test(pathname)) assert.equal(out.band, true, `${pathname}: the Vodafone Cash band keeps its tag`)
			await page.unroute('**/*')
		}
	} finally {
		await page.close()
	}
})

test('each card carries what it can be known by, and the same card has keys in common in both languages (phase 3 S3)', async () => {
	const page = await browser.newPage()
	try {
		const keysOf = async (p: string) => {
			const r = await read(page, htmlOf(savedAt(p)), p)
			return r.model!.sections.flatMap((x) => x.items as unknown as { id: string; kind: string; keys: { kind: string; value: string }[] }[])
		}
		for (const p of ['/en/services', '/en/home', '/en/mobile-internet-bundles', '/ar/vodafone-red1']) {
			const items = await keysOf(p)
			assert.ok(items.every((i) => typeof i.kind === 'string' && Array.isArray(i.keys) && i.keys.length > 0), `${p}: every item has a kind and keys`)
			assert.ok(items.every((i) => i.keys.every((k) => ['link', 'picture', 'title', 'tab', 'digits'].includes(k.kind) && typeof k.value === 'string' && k.value)), `${p}: known key kinds`)
		}
		// The same cards in the other language share a link or a picture key (home and Vodafone Cash: every card).
		for (const [en, ar] of [['/en/home', '/ar/home'], ['/en/vodafone-cash', '/ar/vodafone-cash']] as const) {
			const a = await keysOf(en)
			const b = await keysOf(ar)
			const shared = (x: (typeof a)[number]) => b.some((y) => y.keys.some((k) => (k.kind === 'link' || k.kind === 'picture') && x.keys.some((j) => j.kind === k.kind && j.value === k.value)))
			assert.equal(a.filter(shared).length, a.length, `${en}: every card shares a link or picture key with ${ar}`)
		}
		// Bundles: ids differ between languages, but the numbers in the titles are shared.
		const en = await keysOf('/en/mobile-internet-bundles')
		const ar = await keysOf('/ar/mobile-internet-bundles')
		const digits = (xs: typeof en) => new Set(xs.flatMap((x) => x.keys.filter((k) => k.kind === 'digits').map((k) => k.value)))
		const common = [...digits(en)].filter((d) => digits(ar).has(d))
		assert.ok(common.length >= 8, `bundles: numbers in titles shared across languages (${common.length})`)
	} finally {
		await page.close()
	}
})

// ---- a Pocket sticker finds its card again (experiences/src/pocket/record.js; ADR-0051) ----

type Item = { id: string; kind: string; title: string; keys: { kind: string; value: string }[] }
type Model = { sections: { id: string; title: string | null; items: Item[] }[] }
type Rec = { key: string; id: string }
const recordModule = () =>
	import(pathToFileURL(path.join(ROOT, '../experiences/src/pocket/record.js')).href) as Promise<{
		recordFrom(o: { item: Item; section: { id: string; title: string | null }; page: { path: string; lang: string; title?: string }; model?: Model; key?: string }): Rec
		rematch(records: Rec[], model: Model, o: { lang: string }): Map<string, string>
	}>
/** Every card of a model as a sticker, keyed by where it sits (section and place: the same in both languages). */
const stickersOf = async (model: Model, pathname: string) => {
	const { recordFrom } = await recordModule()
	const lang = pathname.slice(1, 3)
	return model.sections.flatMap((s) => s.items.map((item, i) => ({ at: `${s.id}#${i}`, id: item.id, r: recordFrom({ item, section: s, page: { path: pathname, lang }, model, key: `${s.id}#${i}` }) })))
}
const placeOf = (model: Model) => new Map<string, string>(model.sections.flatMap((s) => s.items.map((item, i) => [item.id, `${s.id}#${i}`] as const)))
/**
 * Cards that are the same card in the other language where neither the id nor the place says so:
 * the Arabic bundles page has one more ticket than the English one ("اتحكم في حسابك" also links the
 * shop's DSL page and has no English card), so its "خدمات ال DSL" is the English "DSL".
 */
const TWINS: Record<string, string | null> = { 'ubytreluayel-1': null, dsl: 'internetservices-dsl-bundles', 'internetservices-dsl-bundles': 'dsl' }
/** Each sticker's own card on `target`: the same id; else its named twin; else the same place, where the section holds as many cards in both. */
const truthOf = (stickers: { r: { key: string }; id: string; at: string }[], source: Model, target: Model) => {
	const at = placeOf(target)
	const count = (m: Model, id: string) => m.sections.find((x) => x.id === id)?.items.length
	return new Map(
		stickers.map((x) => {
			if (at.has(x.id)) return [x.r.key, x.id] as const
			if (x.id in TWINS) return [x.r.key, TWINS[x.id] && at.has(TWINS[x.id]!) ? TWINS[x.id] : undefined] as const
			const section = x.at.split('#')[0]
			if (count(source, section) !== count(target, section)) return [x.r.key, undefined] as const
			return [x.r.key, [...at].find(([, place]) => place === x.at)?.[0]] as const
		}),
	)
}

test('a sticker saved in one language finds its card in the other, never a wrong one (ADR-0051)', async () => {
	const { rematch } = await recordModule()
	const page = await browser.newPage()
	try {
		// At least as many as the phase 3 map measured; never a wrong card.
		const pairs = [['/en/home', '/ar/home', 10], ['/en/vodafone-cash', '/ar/vodafone-cash', 8], ['/en/services', '/ar/services', 29], ['/en/vodafone-red1', '/ar/vodafone-red1', 7], ['/en/mobile-internet-bundles', '/ar/mobile-internet-bundles', 19]] as const
		for (const [a, b, atLeast] of pairs)
			for (const [en, ar, lang] of [[a, b, 'ar'], [b, a, 'en']] as const) {
			const from = (await read(page, htmlOf(savedAt(en)), en)).model as unknown as Model
			const to = (await read(page, htmlOf(savedAt(ar)), ar)).model as unknown as Model
			const stickers = await stickersOf(from, en)
			const found = rematch(stickers.map((x) => x.r), to, { lang })
			// The right card: the one with the same id where the other page has it (Services lists two Shokran
			// cards in another order in Arabic), else its named twin, else the one in the same section and place.
			const truth = truthOf(stickers, from, to)
			const right = [...found].filter(([key, id]) => truth.get(key) === id).length
			const wrong = [...found].filter(([key, id]) => truth.get(key) !== id)
			console.log(`# ${en} -> ${ar}: ${right} of ${stickers.length} found, ${wrong.length} wrong`)
			assert.deepEqual(wrong, [], `${en} -> ${ar}: no sticker finds a wrong card`)
			// From Arabic to English the bundles page has one more ticket than its twin, and Services and RED
			// the same one card neither direction finds.
			const least = lang === 'ar' ? atLeast : en === '/ar/mobile-internet-bundles' ? 19 : atLeast
			assert.ok(right >= least, `${en} -> ${ar}: ${right} of ${stickers.length} found (at least ${least}; AIXC-66)`)
		}
	} finally {
		await page.close()
	}
})

test('a sticker saved on 23 Oct finds its card on 12 Nov (Arabic home, bundles, Services, RED; ADR-0051, O26)', async () => {
	const { rematch } = await recordModule()
	const later = path.join(ROOT, 'fixtures/replay/vodafone-eg-2026-11-12')
	const pages = (JSON.parse(fs.readFileSync(path.join(later, 'pages.json'), 'utf8')) as { pages: { url: string; snapshot: string }[] }).pages
	const page = await browser.newPage()
	let total = 0
	try {
		for (const p of pages) {
			const pathname = new URL(p.url).pathname
			const before = (await read(page, htmlOf(savedAt(pathname)), pathname)).model as unknown as Model
			const after = (await read(page, gunzipSync(fs.readFileSync(path.join(later, p.snapshot))).toString('utf8'), pathname)).model as unknown as Model
			const stickers = await stickersOf(before, pathname)
			const found = rematch(stickers.map((x) => x.r), after, { lang: 'ar' })
			const ids = new Set(after.sections.flatMap((s) => s.items.map((i) => i.id)))
			for (const x of stickers) {
				if (!ids.has(x.id)) continue
				assert.equal(found.get(x.r.key), x.id, `${pathname}: ${x.id} found again`)
				total++
			}
			const wrong = stickers.filter((x) => found.has(x.r.key) && found.get(x.r.key) !== x.id)
			assert.deepEqual(wrong.map((x) => x.id), [], `${pathname}: never a wrong card`)
			console.log(`# ${pathname} 23 Oct -> 12 Nov: ${stickers.filter((x) => found.get(x.r.key) === x.id).length} of ${stickers.length} found`)
		}
		assert.ok(total >= 60, `cards on both dates, each found: ${total}`)
	} finally {
		await page.close()
	}
})

test('Vodafone adds a card that shares a link: the cards\' ids change, every sticker still finds its own card (AIXC-41)', async () => {
	const { rematch } = await recordModule()
	const page = await browser.newPage()
	try {
		const html = htmlOf(savedAt('/en/services'))
		const before = (await read(page, html, '/en/services')).model as unknown as Model
		const stickers = await stickersOf(before, '/en/services')
		// A new action card linking where "Balance transfer" links, added after it in the same carousel.
		const balance = before.sections.flatMap((s) => s.items).find((i) => /balance transfer/i.test(i.title))!
		const link = balance.keys.find((k) => k.kind === 'link')!.value
		const added = html.replace(/(<div class="carousel-item">\s*<!--------- START: Card action --------->)/, `<div class="carousel-item"><div class="card-action"><a href="/en${link}"><div class="card-action-body"><h4>Transfer to a friend</h4></div></a></div></div>$1`)
		assert.notEqual(added, html, 'the card was added')
		const after = (await read(page, added, '/en/services')).model as unknown as Model
		const renamed = stickers.filter((x) => !after.sections.some((s) => s.items.some((i) => i.id === x.id)))
		assert.ok(renamed.length >= 1, `an id changed (${renamed.map((x) => x.id).join(', ')})`)
		const found = rematch(stickers.map((x) => x.r), after, { lang: 'en' })
		// The same card is the one with the same link, picture and title (two cards here are titled
		// "Balance transfer": a title alone cannot tell them apart, AIXC-60).
		const sign = (m: Model, id: string) => JSON.stringify(m.sections.flatMap((s) => s.items).find((i) => i.id === id)?.keys.filter((k) => ['link', 'picture', 'title'].includes(k.kind)) ?? null)
		assert.equal(new Set(before.sections.flatMap((s) => s.items.map((i) => sign(before, i.id)))).size, before.sections.flatMap((s) => s.items).length, 'every card has its own link, picture and title together')
		for (const x of stickers) assert.equal(sign(after, found.get(x.r.key) ?? ''), sign(before, x.id), `${x.id}: found its own card again`)
	} finally {
		await page.close()
	}
})


test('a sticker alone whose card is gone takes no other card, even when another card goes with it (AIXC-54, AIXC-63)', async () => {
	const { rematch } = await recordModule()
	const page = await browser.newPage()
	const guesses: string[] = []
	let tried = 0
	try {
		const pairs = [['/en/home', '/ar/home'], ['/en/vodafone-cash', '/ar/vodafone-cash'], ['/en/services', '/ar/services'], ['/en/vodafone-red1', '/ar/vodafone-red1'], ['/en/mobile-internet-bundles', '/ar/mobile-internet-bundles']] as const
		for (const [a, b] of pairs)
			for (const [from, to, lang] of [[a, a, 'en'], [b, b, 'ar'], [a, b, 'ar'], [b, a, 'en']] as const) {
				const source = (await read(page, htmlOf(savedAt(from)), from)).model as unknown as Model
				const target = (await read(page, htmlOf(savedAt(to)), to)).model as unknown as Model
				const stickers = await stickersOf(source, from)
				const truth = truthOf(stickers, source, target)
				const ids = target.sections.flatMap((s) => s.items.map((i) => i.id))
				const without = (...gone: (string | null | undefined)[]) => ({ ...target, sections: target.sections.map((s) => ({ ...s, items: s.items.filter((i) => !gone.includes(i.id)) })) }) as Model
				// A visitor's Pocket holds a few stickers, not the whole page: each sticker alone, its own
				// card gone, and with it no other card or any one other card (two leaving at once).
				for (const x of stickers) {
					const own = truth.get(x.r.key)
					for (const also of [undefined, ...ids.filter((id) => id !== own)]) {
						const found = rematch([x.r], without(own, also), { lang })
						tried++
						for (const [, id] of found) guesses.push(`${from} -> ${to} without ${own}${also ? ` and ${also}` : ''}: ${x.id} took ${id}`)
					}
				}
			}
		console.log(`# ${tried} stickers alone with their card gone (and one more card); ${guesses.length} took another card`)
		assert.deepEqual(guesses.slice(0, 20), [], 'a sticker never takes another card when its own is gone')
	} finally {
		await page.close()
	}
})

test('two stickers that fit one card equally: neither takes it (AIXC-55)', async () => {
	const { rematch } = await recordModule()
	const page = await browser.newPage()
	try {
		const ar = (await read(page, htmlOf(savedAt('/ar/mobile-internet-bundles')), '/ar/mobile-internet-bundles')).model as unknown as Model
		const en = (await read(page, htmlOf(savedAt('/en/mobile-internet-bundles')), '/en/mobile-internet-bundles')).model as unknown as Model
		const stickers = await stickersOf(ar, '/ar/mobile-internet-bundles')
		const records = stickers.map((x) => x.r)
		const one = rematch(records, en, { lang: 'en' })
		const other = rematch([...records].reverse(), en, { lang: 'en' })
		assert.deepEqual([...one].sort(), [...other].sort(), 'the order the stickers were kept in decides nothing')
	} finally {
		await page.close()
	}
})
