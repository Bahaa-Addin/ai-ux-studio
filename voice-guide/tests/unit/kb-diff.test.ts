/**
 * The knowledge-base diff a held sync is reviewed with (jobs/kb-diff.ts; ADR-0049 §6, AIXC-45): a
 * destination under a new id is paired with its old one, and only what has no counterpart is
 * reported as lost or new.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { Manifest } from '#kb'
import { diffKb, diffLines } from '#jobs/kb-diff.ts'

type D = Manifest['destinations'][number]
const OLD = (n: number, rest = 'section.portlet > div > section.section-md') => `#layout-column_column-1 > div.portlet-boundary.portlet-static:nth-of-type(${n}) > ${rest}`
const NEW = (id: string, rest = 'section.portlet > div > section.section-md') => `#p_p_id_com_liferay_journal_content_web_portlet_JournalContentPortlet_INSTANCE_${id}_ > ${rest}`
const dest = (id: string, kind: string, css: string, labels: Record<string, string[]> = {}, pageId = 'web.page'): D => ({ id, pageId, kind, target: { css: [css] }, labels, provenance: 'auto' }) as unknown as D
const manifest = (destinations: D[]) => ({ destinations }) as unknown as Manifest

test('a held sync: renamed places are paired with their old ids; only what has no counterpart is lost or new', () => {
	const active = manifest([
		dest('web.page.offers', 'section', OLD(1), { en: ['Offers'], ar: ['العروض'] }),
		// Named after a hash of its locator (no English label): the locator changed, so the name did.
		dest('web.page.x0cee7a', 'section', OLD(2), { ar: ['باقات'] }),
		// A card list named after the column, and its cards.
		dest('web.page.layout-column_column-1', 'collection', OLD(3, 'section.portlet > div.list'), { en: ['Home Wireless Bundles'] }),
		dest('web.page.layout-column_column-1.0', 'item', `${OLD(3, 'section.portlet > div.list')} > div.card:nth-of-type(1)`, { en: ['Basic'] }),
		dest('web.page.layout-column_column-1.1', 'item', `${OLD(3, 'section.portlet > div.list')} > div.card:nth-of-type(2)`, { en: ['Plus'] }),
		// Two pictures without any label, in two portlets.
		dest('web.page.x111111.visual', 'visual', OLD(4, 'section.portlet > img'), {}),
		dest('web.page.x222222.visual', 'visual', OLD(5, 'section.portlet > img'), {}),
		// A section Vodafone took off the page.
		dest('web.page.ramadan-offer', 'section', OLD(6), { en: ['Ramadan offer'] }),
		// Another page's section with the same label: never paired across pages.
		dest('web.other.x999999', 'section', OLD(1), { ar: ['باقات'] }, 'web.other'),
	])
	const next = manifest([
		dest('web.page.offers', 'section', NEW('AAA1'), { en: ['Offers'], ar: ['العروض'] }),
		dest('web.page.x075a02', 'section', NEW('BBB2'), { ar: ['باقات'] }),
		dest('web.page.home-wireless-bundles', 'collection', NEW('CCC3', 'section.portlet > div.list'), { en: ['Home Wireless Bundles'] }),
		dest('web.page.home-wireless-bundles.0', 'item', `${NEW('CCC3', 'section.portlet > div.list')} > div.card:nth-of-type(1)`, { en: ['Basic'] }),
		dest('web.page.home-wireless-bundles.1', 'item', `${NEW('CCC3', 'section.portlet > div.list')} > div.card:nth-of-type(2)`, { en: ['Plus'] }),
		dest('web.page.xaaaaaa.visual', 'visual', NEW('DDD4', 'section.portlet > img'), {}),
		dest('web.page.xbbbbbb.visual', 'visual', NEW('EEE5', 'section.portlet > img'), {}),
		dest('web.page.new-year-offer', 'section', NEW('FFF6'), { en: ['New year offer'] }),
	])
	const d = diffKb(active, next)
	assert.equal(d.removed.length, 8, 'eight ids are gone')
	assert.deepEqual(
		d.renamed.map((r) => `${r.from} → ${r.to} (${r.by})`).sort(),
		[
			'web.page.layout-column_column-1 → web.page.home-wireless-bundles (label)',
			'web.page.layout-column_column-1.0 → web.page.home-wireless-bundles.0 (parent)',
			'web.page.layout-column_column-1.1 → web.page.home-wireless-bundles.1 (parent)',
			'web.page.x0cee7a → web.page.x075a02 (label)',
			'web.page.x111111.visual → web.page.xaaaaaa.visual (position)',
			'web.page.x222222.visual → web.page.xbbbbbb.visual (position)',
		],
		'six of them are the same places under new names',
	)
	assert.deepEqual(d.lost.sort(), ['web.other.x999999', 'web.page.ramadan-offer'], 'two places are really gone')
	assert.deepEqual(d.fresh, ['web.page.new-year-offer'], 'one is really new')
	const lines = diffLines(d).join('\n')
	assert.match(lines, /Renamed \(4;/)
	assert.match(lines, /Paired by position only \(2;[^\n]*check each on the site[^\n]*x111111\.visual → web\.page\.xaaaaaa\.visual/)
	assert.match(lines, /Removed with no counterpart \(2;[^\n]*web\.page\.ramadan-offer/)
	assert.match(lines, /Added with no counterpart \(1\): web\.page\.new-year-offer/)
})

test('when it cannot tell which is which, it pairs nothing: more gone than come, or two candidates alike', () => {
	// Three unlabelled pictures gone, two come: any of them may be the lost one.
	const active = manifest([1, 2, 3].map((n) => dest(`web.page.x00000${n}.visual`, 'visual', OLD(n, 'section.portlet > img'))))
	const next = manifest(['A', 'B'].map((id) => dest(`web.page.xnew00${id}.visual`, 'visual', NEW(id, 'section.portlet > img'))))
	const d = diffKb(active, next)
	assert.deepEqual([d.renamed.length, d.lost.length, d.fresh.length], [0, 3, 2])
	// Two sections with the same label at different places in their portlets, one candidate: no guess.
	const twins = diffKb(manifest([dest('web.page.a', 'section', OLD(1, 'x'), { en: ['Same'] }), dest('web.page.b', 'section', OLD(2, 'y'), { en: ['Same'] })]), manifest([dest('web.page.c', 'section', NEW('Q', 'z'), { en: ['Same'] })]))
	assert.deepEqual([twins.renamed.length, twins.lost.length, twins.fresh.length], [0, 2, 1])
	// Twins: two lists with the same heading and shape in two portlets, both renamed: paired in page order.
	const list = 'section.portlet > div.list'
	const pairOfLists = diffKb(
		manifest([dest('web.page.layout-column_column-1', 'collection', OLD(1, list), { en: ['Bundles'] }), dest('web.page.layout-column_column-1-2', 'collection', OLD(2, list), { en: ['Bundles'] })]),
		manifest([dest('web.page.bundles', 'collection', NEW('A', list), { en: ['Bundles'] }), dest('web.page.bundles-2', 'collection', NEW('B', list), { en: ['Bundles'] })]),
	)
	assert.deepEqual(pairOfLists.renamed.map((r) => `${r.from} → ${r.to} (${r.by})`), ['web.page.layout-column_column-1 → web.page.bundles (position)', 'web.page.layout-column_column-1-2 → web.page.bundles-2 (position)'], 'paired, and marked as told by place only')
	// Nothing changed: nothing reported.
	assert.deepEqual(diffKb(active, active), { added: [], removed: [], renamed: [], lost: [], fresh: [] })
})

test('a card that left a renamed list is lost, not renamed to the card that moved into its place', () => {
	const list = 'section.portlet > div.list'
	const card = (id: string, n: number, name: string, css: string) => dest(`${id}.${n}`, 'item', `${css} > div.card:nth-of-type(${n + 1})`, { en: [name] })
	const active = manifest([dest('web.page.layout-column_column-1', 'collection', OLD(3, list), { en: ['RED EXCLUSIVE'] }), ...['START+', 'PLUS+', 'PRIME+', 'ADVANCE+', 'ESSENTIAL+'].map((n, i) => card('web.page.layout-column_column-1', i, n, OLD(3, list)))])
	// PRIME+ is gone; the cards after it moved up one place.
	const without = manifest([dest('web.page.red-exclusive', 'collection', NEW('C', list), { en: ['RED EXCLUSIVE'] }), ...['START+', 'PLUS+', 'ADVANCE+', 'ESSENTIAL+'].map((n, i) => card('web.page.red-exclusive', i, n, NEW('C', list)))])
	const d = diffKb(active, without)
	assert.deepEqual(d.lost, ['web.page.layout-column_column-1.2'], 'PRIME+ is the one lost')
	assert.ok(d.renamed.some((r) => r.from === 'web.page.layout-column_column-1.3' && r.to === 'web.page.red-exclusive.2' && r.by === 'parent'), 'ADVANCE+ follows its name to its new place')
	assert.deepEqual(d.fresh, [])
	// PRIME+ gone and a new card at the end: one lost, one new; not five renames.
	const swapped = diffKb(active, manifest([dest('web.page.red-exclusive', 'collection', NEW('C', list), { en: ['RED EXCLUSIVE'] }), ...['START+', 'PLUS+', 'ADVANCE+', 'ESSENTIAL+', 'RED ULTRA'].map((n, i) => card('web.page.red-exclusive', i, n, NEW('C', list)))]))
	assert.deepEqual([swapped.lost, swapped.fresh], [['web.page.layout-column_column-1.2'], ['web.page.red-exclusive.4']])
})

test('pictures are told by their own words, not by "banner" or "picture", which every picture has', () => {
	const generic = { en: ['banner', 'image', 'picture'], ar: ['البانر', 'الصورة'] }
	const pic = (id: string, css: string, alt?: string) => dest(id, 'visual', css, { en: [...(alt ? [alt] : []), ...generic.en], ar: generic.ar })
	// A campaign picture swapped for another in the same template, in another portlet: one lost, one new.
	const d = diffKb(manifest([pic('web.page.x4db272.visual', OLD(2, 'section.portlet > img'), 'Ramadan offers')]), manifest([pic('web.page.znewpic.visual', NEW('Z', 'section.portlet > img'), 'Black Friday')]))
	assert.deepEqual([d.renamed, d.lost, d.fresh], [[], ['web.page.x4db272.visual'], ['web.page.znewpic.visual']])
	// The same picture under a new hash: told by its own alt text.
	const same = diffKb(manifest([pic('web.page.x4db272.visual', OLD(2, 'section.portlet > img'), 'Ramadan offers')]), manifest([pic('web.page.x9a7b86.visual', NEW('Z', 'section.portlet > img'), 'Ramadan offers')]))
	assert.deepEqual(same.renamed, [{ from: 'web.page.x4db272.visual', to: 'web.page.x9a7b86.visual', by: 'label' }])
	// No words of its own at all: only its place can say, and the report says so.
	const bare = diffKb(manifest([pic('web.page.x111111.visual', OLD(2, 'section.portlet > img'))]), manifest([pic('web.page.x222222.visual', NEW('Z', 'section.portlet > img'))]))
	assert.deepEqual(bare.renamed.map((r) => r.by), ['position'])
})

