/**
 * The crawler anchors locators on Liferay portlet ids (ADR-0049 §6, live plan phase 2c): on Vodafone's
 * CMS pages a section's locator starts at its portlet (`#p_p_id_…_INSTANCE_<id>_ > …`), the same in
 * English and Arabic, so it still finds its section when an editor adds one above it; the positional
 * locators it replaces (`#layout-column_column-1 > div.portlet-boundary:nth-of-type(4) > …`) do not.
 * Runs `extractPage` (as the crawler does) on the saved pages of 2026-10-23, scripts removed, nothing
 * fetched, then the knowledge builder on what it found: no destination is named after a portlet id.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { gunzipSync } from 'node:zlib'

import { type Browser, chromium, type Page } from 'playwright'

import { extractPage } from '#jobs/crawler/extract.ts'
import type { PageSnap } from '#jobs/crawler/types.ts'
import { buildManifest } from '#jobs/kb-builder/build.ts'
import { loadSiteConfig, ROOT } from '#shared/config.ts'

const ORIGIN = 'https://web.vodafone.com.eg'
const REPLAY = path.join(ROOT, 'fixtures/replay/vodafone-eg')
const PORTLET = /^#p_p_id_\w+_INSTANCE_[A-Za-z0-9]+_ > /

interface Saved {
	url: string
	snapshot?: string
}
const saved = (JSON.parse(fs.readFileSync(path.join(REPLAY, 'crawl.json'), 'utf8')) as { pages: Saved[] }).pages
const htmlOf = (pathname: string) => {
	const p = saved.find((x) => new URL(x.url).pathname === pathname && x.snapshot)!
	const buf = fs.readFileSync(path.join(REPLAY, p.snapshot!))
	return (p.snapshot!.endsWith('.gz') ? gunzipSync(buf) : buf).toString('utf8')
}

let browser: Browser
before(async () => {
	browser = await chromium.launch()
})
after(async () => {
	await browser?.close()
})

/** Opens a saved page with its scripts taken out and nothing fetched, at its own address. */
async function open(pathname: string): Promise<Page> {
	const page = await browser.newPage()
	await page.route('**/*', (route) => (route.request().url() === `${ORIGIN}${pathname}` ? route.fulfill({ status: 200, contentType: 'text/html', body: htmlOf(pathname).replace(/<script\b[\s\S]*?<\/script>/gi, '') }) : route.abort()))
	await page.goto(`${ORIGIN}${pathname}`, { waitUntil: 'domcontentloaded' })
	return page
}

const extract = async (page: Page) => ({ ...((await page.evaluate(extractPage, { minItems: 3 })) as PageSnap), url: page.url(), status: 200 })

/** The sections of Vodafone's journal-content portlets (the ones in #layout-column_column-1). */
const portletSections = (snap: PageSnap) => snap.sections.filter((s) => s.css.some((c) => c.includes('_INSTANCE_') || c.startsWith('#layout-column_column-1 >')))

test('a portlet\'s sections, cards and pictures are located from the portlet, in both languages alike', async () => {
	const snaps: Record<string, PageSnap> = {}
	for (const p of ['/en/services', '/ar/services']) {
		const page = await open(p)
		try {
			const snap = await extract(page)
			snaps[p] = snap
			const sections = portletSections(snap)
			assert.ok(sections.length >= 6, `${p}: the portlets' sections (${sections.length})`)
			for (const s of sections) {
				// Its own stable id first where it has one (`#test`), else its portlet; never the column's nth portlet.
				assert.ok(PORTLET.test(s.css[0]) || /^#[A-Za-z][\w-]*$/.test(s.css[0]), `${p}: "${s.heading}" starts at its portlet or its own id: ${s.css[0]}`)
				assert.ok(s.css.some((c) => PORTLET.test(c)), `${p}: "${s.heading}" has a locator from its portlet`)
				assert.ok(!s.css.some((c) => c.startsWith('#layout-column_column-1 > div.portlet-boundary')), `${p}: "${s.heading}" has no positional locator`)
				for (const c of s.css) assert.equal(await page.evaluate((css) => document.querySelectorAll(css).length, c), 1, `${p}: ${c} finds one element`)
			}
			assert.ok(sections.filter((s) => PORTLET.test(s.css[0])).length >= 5, `${p}: most start at their portlet`)
			// Pictures and buttons inside portlets too (offline, unstyled and without images, the crawler finds few).
			const all = [...snap.collections.map((c) => c.containerCss[0]), ...snap.visuals.map((v) => v.css[0]), ...snap.actions.map((a) => a.css[0])]
			assert.ok(all.filter((c) => PORTLET.test(c)).length >= 3, `${p}: pictures and buttons start at their portlet (${all.filter((c) => PORTLET.test(c)).length})`)
			assert.ok(!all.some((c) => c.includes('column_column-1 > div.portlet-boundary')), `${p}: no positional step between the column and a portlet`)
		} finally {
			await page.close()
		}
	}
	// The builder joins a section's languages by its first locator: the same portlet in both.
	const en = new Set(portletSections(snaps['/en/services']).map((s) => s.css[0]))
	const ar = portletSections(snaps['/ar/services']).map((s) => s.css[0])
	assert.ok(ar.filter((c) => en.has(c)).length >= 6, 'the Arabic sections have the English locators')
	// Card lists: Services has none the crawler finds offline; the RED and home-wireless pages have.
	for (const p of ['/en/vodafone-red1', '/en/wireless-net']) {
		const page = await open(p)
		try {
			const lists = (await extract(page)).collections
			assert.ok(lists.length >= 1, `${p}: card lists found (${lists.length})`)
			for (const c of lists) {
				assert.match(c.containerCss[0], PORTLET, `${p}: "${c.heading}" starts at its portlet`)
				assert.equal(await page.evaluate((css) => document.querySelectorAll(css).length, c.itemCss) >= 3, true, `${p}: ${c.itemCss} finds the cards`)
			}
		} finally {
			await page.close()
		}
	}
})

test('an editor adds a section above: the portlet locators still find theirs; the positional ones do not', async () => {
	const page = await open('/en/services')
	try {
		const snap = await extract(page)
		const sections = portletSections(snap).filter((s) => s.heading && PORTLET.test(s.css[0]))
		assert.ok(sections.length >= 5)
		// The same sections located as the crawler did before (the column's nth portlet, as in the knowledge base of 2026-10-23).
		const positional = await page.evaluate(
			(list) =>
				list.map((css) => {
					const [anchor, ...rest] = css.split(' > ')
					const portlet = document.querySelector(anchor)!
					const n = [...portlet.parentElement!.children].filter((c) => c.tagName === 'DIV').indexOf(portlet) + 1
					return [`#layout-column_column-1 > div.portlet-boundary.portlet-static:nth-of-type(${n})`, ...rest].join(' > ')
				}),
			sections.map((s) => s.css[0]),
		)
		const headingAt = (css: string) => page.evaluate((c) => [...document.querySelectorAll(c)].map((el) => (el.querySelector('h1, h2, h3')?.textContent || '').replace(/\s+/g, ' ').trim()), css)
		const before = await Promise.all(positional.map(headingAt))
		const ours = await Promise.all(sections.map((s) => headingAt(s.css[0])))
		// A new journal-content portlet at the top of the column, as an editor's "add section" makes it.
		await page.evaluate(() => {
			const column = document.getElementById('layout-column_column-1')!
			const copy = column.querySelector(':scope > .portlet-boundary')!.cloneNode(true) as Element
			copy.id = 'p_p_id_com_liferay_journal_content_web_portlet_JournalContentPortlet_INSTANCE_NewSection01_'
			copy.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'))
			column.prepend(copy)
		})
		assert.deepEqual(await Promise.all(sections.map((s) => headingAt(s.css[0]))), ours, 'every portlet locator finds the same section')
		const after = await Promise.all(positional.map(headingAt))
		assert.ok(after.some((h, i) => JSON.stringify(h) !== JSON.stringify(before[i])), 'a positional locator now finds another section (the reason for the change)')
	} finally {
		await page.close()
	}
})

test('the knowledge builder keeps the portlet locator first and never names a destination after a portlet id', async () => {
	const site = loadSiteConfig(path.join(ROOT, 'config/sites/vodafone-eg.yaml'))
	const pages: PageSnap[] = []
	for (const p of ['/en/services', '/ar/services', '/en/vodafone-red1', '/ar/vodafone-red1', '/en/wireless-net', '/ar/wireless-net']) {
		const page = await open(p)
		try {
			pages.push(await extract(page))
		} finally {
			await page.close()
		}
	}
	const now = new Date('2026-11-11T00:00:00Z')
	const out = buildManifest({ site, crawl: { id: 'test', siteId: site.id, startedAt: now.toISOString(), finishedAt: now.toISOString(), dir: REPLAY, pages, errors: [] }, descriptions: new Map(), now })
	assert.ok(out.manifest, JSON.stringify(out.issues.slice(0, 3)))
	const sections = out.manifest!.destinations.filter((d) => d.kind === 'section' && d.target?.css[0].includes('_INSTANCE_'))
	assert.ok(sections.length >= 6, `section destinations on portlets (${sections.length})`)
	for (const d of sections) assert.match(d.target!.css[0], PORTLET, d.id)
	assert.ok(sections.filter((d) => d.labels?.en?.length && d.labels?.ar?.length).length >= 5, 'English and Arabic joined on one destination')
	assert.deepEqual(out.manifest!.destinations.filter((d) => /p_p_id/i.test(d.id)).map((d) => d.id), [], 'no destination is named after a portlet id')
	// A card list in a portlet is named after its heading, as a section is (it was the column's id before).
	const lists = out.manifest!.destinations.filter((d) => d.kind === 'collection').map((d) => d.id)
	assert.ok(lists.includes('web.vodafone-red1.red-exclusive'), lists.join(' '))
	assert.ok(lists.includes('web.wireless-net.home-wireless-bundles'), lists.join(' '))
	assert.ok(out.manifest!.destinations.filter((d) => d.kind === 'collection').every((d) => PORTLET.test(d.target!.css[0])), 'their locators start at the portlet')
})
