/**
 * The live adapter (experiences/src/host/live-adapter.js; ADR-0046 §3, live plan phase 2) on the
 * saved Vodafone pages of 2026-10-23, in Chromium: the page's own markup, scripts removed, nothing
 * fetched. What it finds per page (sections, cards, coverage) is printed as the runbook's table.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { after, before, test } from 'node:test'
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
	coverage: { ratio: number; cards: number; usable: number; sections: { id: string; cards: number; usable: number }[] }
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
