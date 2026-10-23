/**
 * Turns a crawl, its visual descriptions and the curated overlay into a site
 * manifest (ADR-0011, ADR-0012). Deterministic: the same inputs give the same
 * manifest hash, so an unchanged clone does not produce a new version.
 */
import { createHash } from 'node:crypto'

import {
	type Collection,
	type Destination,
	type Flow,
	type I18nList,
	type I18nText,
	type Issue,
	type Manifest,
	manifestHash,
	type Page,
	STANDARD,
	type Target,
	validateManifest,
	type Visual,
} from '#kb'
import type { SiteConfig } from '#shared/config.ts'

import type { CollectionSnap, CrawlResult, PageSnap, RevealSnap } from '../crawler/types.ts'
import { type VisualDescription, visualKey } from '../describer/describe.ts'
import type { Overlay } from './overlay.ts'

export interface BuildInput {
	site: SiteConfig
	crawl: CrawlResult
	descriptions: Map<string, VisualDescription>
	overlay?: Overlay
	now?: Date
}

export interface BuildStats {
	pages: number
	destinations: Record<string, number>
	collections: number
	visuals: Record<string, number>
	curated: number
	flows: number
}

export interface BuildOutput {
	ok: boolean
	manifest?: Manifest
	issues: Issue[]
	stats?: BuildStats
}

const slug = (s: string) =>
	s
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[^\p{L}\p{N}]+/gu, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 40)
const asciiSlug = (s: string) => slug(s).replace(/[^a-z0-9-]/g, '')
const shortHash = (s: string) => createHash('sha1').update(s).digest('hex').slice(0, 6)
const uniq = <T>(xs: T[]) => [...new Set(xs.filter(Boolean))]

const GENERIC_VISUAL_WORDS: Record<string, Record<string, string[]>> = {
	image: { en: ['banner', 'image', 'picture'], ar: ['البانر', 'الصورة'] },
	video: { en: ['video'], ar: ['الفيديو'] },
	canvas: { en: ['chart', 'graph'], ar: ['الرسم البياني', 'الشارت'] },
	webgl: { en: ['chart', 'graphic'], ar: ['الرسم البياني', 'الرسم'] },
	svg: { en: ['graphic', 'diagram'], ar: ['الرسم', 'الشكل'] },
	map: { en: ['map', 'coverage map'], ar: ['الخريطة', 'خريطة التغطية'] },
}

function addTo(list: I18nList, lang: string, ...values: (string | undefined)[]) {
	const v = values.map((x) => (x || '').trim()).filter((x) => x && x.length <= 80)
	if (!v.length) return
	list[lang] = uniq([...(list[lang] || []), ...v])
}

/** Fragment for ids: the element id when the locator is an id, else a slug of a label. */
function fragmentFor(css: string, labels: I18nList): string {
	const id = /^#([A-Za-z][\w-]*)$/.exec(css)?.[1]
	if (id) return id.toLowerCase()
	const en = labels.en?.[0]
	const s = en ? asciiSlug(en) : ''
	return s || `x${shortHash(css)}`
}

export function buildManifest(input: BuildInput): BuildOutput {
	const { site, crawl, descriptions, overlay } = input
	const now = input.now || new Date()
	const languages = site.languages
	const originKey = (url: string) => {
		const origin = new URL(url).origin
		const i = site.origins.findIndex((o) => new URL(o.url).origin === origin)
		return site.origins[i]?.key || (i <= 0 ? 'web' : `o${i + 1}`)
	}
	const siteNames = new Set(Object.values(site.name).map((n) => n.trim().toLowerCase()))
	const cleanTitle = (t: string) => {
		const parts = t
			.split(/\s+[|\-–—]\s+/)
			.map((p) => p.trim())
			.filter((p) => p && !siteNames.has(p.toLowerCase()))
		return parts[0] || t
	}

	// ---- group pages by hreflang alternates ----
	const byUrl = new Map(crawl.pages.map((p) => [p.url, p]))
	const parent = new Map<string, string>()
	const find = (u: string): string => {
		const p = parent.get(u) ?? u
		if (p === u) return u
		const r = find(p)
		parent.set(u, r)
		return r
	}
	const union = (a: string, b: string) => {
		const ra = find(a)
		const rb = find(b)
		if (ra !== rb) parent.set(rb, ra)
	}
	for (const p of crawl.pages) {
		for (const alt of Object.values(p.alternates)) {
			const u = alt.split('#')[0].split('?')[0]
			if (byUrl.has(u)) union(p.url, u)
		}
	}
	const groups = new Map<string, PageSnap[]>()
	for (const p of [...crawl.pages].sort((a, b) => a.url.localeCompare(b.url))) {
		const r = find(p.url)
		groups.set(r, [...(groups.get(r) || []), p])
	}

	const pages: Page[] = []
	const pageIdByUrl = new Map<string, string>()
	const variantsOf = new Map<string, Map<string, PageSnap>>()
	const usedIds = new Set<string>()
	for (const members of groups.values()) {
		const ref = members.find((m) => m.lang === site.defaultLanguage) || members[0]
		const segs = new URL(ref.url).pathname.split('/').filter(Boolean)
		if (segs.length && languages.includes(segs[0])) segs.shift()
		let s = segs.join('-').replace(/\.html?$/, '')
		if (!s || s === 'index') s = 'home'
		let id = `${originKey(ref.url)}.${asciiSlug(s) || shortHash(ref.url)}`
		for (let n = 2; usedIds.has(id); n++) id = `${id}-${n}`
		usedIds.add(id)
		const variants: Record<string, { url: string; title: string }> = {}
		const vmap = new Map<string, PageSnap>()
		for (const m of members) {
			const lang = languages.includes(m.lang) ? m.lang : site.defaultLanguage
			if (variants[lang]) continue
			variants[lang] = { url: m.url, title: cleanTitle(m.title) || m.h1 }
			vmap.set(lang, m)
			pageIdByUrl.set(m.url, id)
		}
		variantsOf.set(id, vmap)
		pages.push({ id, kind: 'content', variants, provenance: 'auto' })
	}

	const destinations: Destination[] = []
	const collections: Collection[] = []
	const visuals: Visual[] = []

	// ---- page destinations, labelled by titles, h1 and the anchor texts that point at them ----
	const anchorLabels = new Map<string, I18nList>()
	const languageNames = /^(english|العربية|عربي|français|deutsch)$/i
	for (const p of crawl.pages) {
		for (const l of p.links) {
			const u = l.href.split('#')[0].split('?')[0]
			const target = pageIdByUrl.get(u)
			if (!target || languageNames.test(l.text) || l.hreflang) continue
			const list = anchorLabels.get(target) || {}
			addTo(list, p.lang, l.text)
			anchorLabels.set(target, list)
		}
	}
	for (const page of pages) {
		const labels: I18nList = {}
		for (const [lang, snap] of variantsOf.get(page.id)!) addTo(labels, lang, cleanTitle(snap.title), snap.h1)
		for (const [lang, list] of Object.entries(anchorLabels.get(page.id) || {})) addTo(labels, lang, ...list)
		destinations.push({ id: page.id, pageId: page.id, kind: 'page', labels, provenance: 'auto' })
	}

	const revealTargets = (steps: { lang: string; reveal: RevealSnap[] }[]): Target[] | undefined => {
		const first = steps.find((s) => s.reveal.length)
		if (!first) return undefined
		return first.reveal.map((r, i) => {
			const text: I18nText = {}
			for (const s of steps) if (s.reveal[i]?.text) text[s.lang] = s.reveal[i].text
			return { css: r.css, text, role: r.role }
		})
	}

	// ---- collections (paired across languages by container locator and item key) ----
	const collectionByContainer = new Map<string, { col: Collection; destId: string }>()
	for (const page of pages) {
		const vmap = variantsOf.get(page.id)!
		const byCss = new Map<string, { lang: string; c: CollectionSnap }[]>()
		for (const [lang, snap] of vmap) for (const c of snap.collections) byCss.set(c.containerCss[0], [...(byCss.get(c.containerCss[0]) || []), { lang, c }])
		for (const [css, vs] of byCss) {
			const ref = vs.find((v) => v.lang === site.defaultLanguage) || vs[0]
			const labels: I18nList = {}
			for (const v of vs) addTo(labels, v.lang, v.c.heading)
			const containerId = /^#([A-Za-z][\w-]*)/.exec(css)?.[1]
			const id = `${page.id}.${containerId ? containerId.toLowerCase() : fragmentFor(css, labels)}`
			const col: Collection = {
				id,
				pageId: page.id,
				itemCss: ref.c.itemCss,
				keyAttr: ref.c.keyAttr,
				nameField: ref.c.fields.name ? 'name' : Object.keys(ref.c.fields)[0] || 'name',
				fields: Object.fromEntries(Object.entries(ref.c.fields).map(([k, f]) => [k, { css: f.css, type: f.type }])),
				labels,
				provenance: 'auto',
			}
			if (!col.fields[col.nameField]) col.fields[col.nameField] = { css: '*', type: 'text' }
			collections.push(col)
			const reveal = revealTargets(vs.map((v) => ({ lang: v.lang, reveal: v.c.reveal })))
			const destId = id
			destinations.push({ id: destId, pageId: page.id, kind: 'collection', target: { css: ref.c.containerCss, text: {} }, labels, reveal, collectionId: id, provenance: 'auto' })
			collectionByContainer.set(`${page.id} ${css}`, { col, destId })
			// one destination per item, paired across languages by key
			const items = new Map<string, I18nList>()
			for (const v of vs) {
				for (const [i, it] of v.c.items.entries()) {
					const k = it.key || `#${i}`
					const l = items.get(k) || {}
					addTo(l, v.lang, it.name)
					items.set(k, l)
				}
			}
			for (const [k, l] of items) {
				const itemCss = ref.c.keyAttr && !k.startsWith('#') ? `${ref.c.itemCss}[${ref.c.keyAttr}="${k}"]` : `${ref.c.itemCss}:nth-of-type(${Number(k.slice(1)) + 1})`
				destinations.push({
					id: `${id}.${asciiSlug(k) || shortHash(k)}`,
					pageId: page.id,
					kind: 'item',
					target: { css: [itemCss], text: Object.fromEntries(Object.entries(l).map(([lang, xs]) => [lang, xs[0]])) },
					labels: l,
					reveal,
					collectionId: id,
					provenance: 'auto',
				})
			}
		}
	}

	// ---- sections (paired across languages by their first locator) ----
	for (const page of pages) {
		const vmap = variantsOf.get(page.id)!
		const byCss = new Map<string, { lang: string; s: PageSnap['sections'][number] }[]>()
		for (const [lang, snap] of vmap) for (const s of snap.sections) byCss.set(s.css[0], [...(byCss.get(s.css[0]) || []), { lang, s }])
		for (const [css, vs] of byCss) {
			const ref = vs.find((v) => v.lang === site.defaultLanguage) || vs[0]
			// A section that wraps a collection becomes that collection's destination.
			const wrapped = [...collectionByContainer.entries()].find(([k]) => k.startsWith(`${page.id} ${css} `) || k === `${page.id} ${css}`)
			if (wrapped) {
				const d = destinations.find((x) => x.id === wrapped[1].destId)!
				d.target = { css: ref.s.css, text: Object.fromEntries(vs.map((v) => [v.lang, v.s.heading])) }
				for (const v of vs) addTo(d.labels, v.lang, v.s.heading)
				continue
			}
			const labels: I18nList = {}
			const description: I18nText = {}
			for (const v of vs) {
				addTo(labels, v.lang, v.s.heading)
				if (v.s.text) description[v.lang] = v.s.text.slice(0, 240)
			}
			const kind = ref.s.kind === 'faq' ? 'faq' : 'section'
			const d: Destination = {
				id: `${page.id}.${fragmentFor(css, labels)}`,
				pageId: page.id,
				kind,
				target: { css: ref.s.css, text: Object.fromEntries(vs.map((v) => [v.lang, v.s.heading])) },
				labels,
				description,
				reveal: revealTargets(vs.map((v) => ({ lang: v.lang, reveal: v.s.reveal }))),
				provenance: 'auto',
			}
			if (kind === 'faq') d.answer = { fields: { answer: { css: [`${ref.s.css[0]} > :not(summary)`] } }, template: Object.fromEntries(vs.map((v) => [v.lang, '{answer}'])) }
			if (ref.s.annotations.watch !== undefined) d.watchable = true
			destinations.push(d)
		}
	}

	// ---- visuals ----
	const visualStats: Record<string, number> = {}
	for (const page of pages) {
		const vmap = variantsOf.get(page.id)!
		const byCss = new Map<string, { lang: string; snap: PageSnap; v: PageSnap['visuals'][number] }[]>()
		for (const [lang, snap] of vmap) for (const v of snap.visuals) byCss.set(v.css[0], [...(byCss.get(v.css[0]) || []), { lang, snap, v }])
		for (const [css, vs] of byCss) {
			const ref = vs.find((x) => x.lang === site.defaultLanguage) || vs[0]
			const description: I18nText = {}
			let source: Visual['source'] = 'metadata'
			let confidence = 0
			// Same-language descriptions win; vision results may also fill other languages.
			for (const x of vs) {
				const d = descriptions.get(visualKey(x.snap.url, x.v.index))
				if (!d) continue
				if (d.source !== 'metadata') source = d.source
				confidence = Math.max(confidence, d.confidence)
				for (const [l, text] of Object.entries(d.descriptions)) if (l === x.lang || !description[l]) description[l] = text
			}
			if (!Object.keys(description).length) continue
			const labels: I18nList = {}
			for (const x of vs) addTo(labels, x.lang, x.v.meta.svgTitle, x.v.meta.alt, x.v.meta.ariaLabel, x.v.meta.heading)
			const id = `${page.id}.${fragmentFor(css, labels)}`
			// Generic words people use for this kind of visual ("this banner", "the chart").
			const isMap = /map|خريط/i.test(JSON.stringify(labels))
			const generic = isMap ? GENERIC_VISUAL_WORDS.map : GENERIC_VISUAL_WORDS[ref.v.kind] || GENERIC_VISUAL_WORDS.image
			for (const l of languages) addTo(labels, l, ...(generic[l] || []))
			visuals.push({ id, pageId: page.id, kind: ref.v.kind, target: { css: ref.v.css }, description, source, confidence })
			visualStats[source] = (visualStats[source] || 0) + 1
			destinations.push({ id: `${id}.visual`, pageId: page.id, kind: 'visual', target: { css: ref.v.css }, labels, description, visualId: id, provenance: 'auto' })
		}
	}

	// ---- commit points ----
	for (const page of pages) {
		const vmap = variantsOf.get(page.id)!
		const byCss = new Map<string, { lang: string; text: string; css: string[]; reason?: string }[]>()
		for (const [lang, snap] of vmap) for (const a of snap.actions) if (a.commit) byCss.set(a.css[0], [...(byCss.get(a.css[0]) || []), { lang, text: a.text, css: a.css, reason: a.reason }])
		for (const [css, vs] of byCss) {
			const labels: I18nList = {}
			for (const v of vs) addTo(labels, v.lang, v.text)
			destinations.push({
				id: `${page.id}.${fragmentFor(css, labels)}`,
				pageId: page.id,
				kind: 'action',
				target: { css: vs[0].css, text: Object.fromEntries(vs.map((v) => [v.lang, v.text])) },
				labels,
				commit: true,
				provenance: 'auto',
			})
		}
	}

	// ---- curated overlay ----
	let curated = 0
	let flows: Flow[] = []
	const lexicon = { synonyms: [] as string[][], intents: {} as Record<string, I18nList> }
	if (overlay) {
		for (const p of overlay.pages) {
			const page = pages.find((x) => x.id === p.id)
			if (!page) continue
			if (p.kind) page.kind = p.kind
			if (p.requiresAuth !== undefined) page.requiresAuth = p.requiresAuth
			if (p.summary) page.summary = p.summary
			page.provenance = 'merged'
			const d = destinations.find((x) => x.id === p.id && x.kind === 'page')
			if (d) {
				for (const [l, xs] of Object.entries(p.labels || {})) d.labels[l] = uniq([...xs, ...(d.labels[l] || [])])
				if (p.examples) d.examples = p.examples
				d.provenance = 'merged'
			}
			curated++
		}
		for (const c of overlay.collections) {
			const existing = collections.find((x) => x.id === c.id)
			if (existing) {
				Object.assign(existing, { ...c, fields: { ...existing.fields, ...(c.fields || {}) }, labels: { ...existing.labels, ...(c.labels || {}) }, provenance: 'merged' })
			} else if (c.pageId && c.itemCss && c.fields) {
				collections.push({ nameField: 'name', labels: {}, ...c, provenance: 'curated' } as Collection)
			}
			curated++
		}
		for (const o of overlay.destinations) {
			let d = o.id ? destinations.find((x) => x.id === o.id) : undefined
			if (!d && o.match) d = destinations.find((x) => x.pageId === o.match!.page && x.target?.css.includes(o.match!.css))
			const { match: _m, id: newIdValue, labels, examples, ...rest } = o
			if (d) {
				for (const [l, xs] of Object.entries(labels || {})) d.labels[l] = uniq([...xs, ...(d.labels[l] || [])])
				if (examples) d.examples = { ...(d.examples || {}), ...examples }
				Object.assign(d, Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined)))
				if (newIdValue && newIdValue !== d.id) {
					const old = d.id
					d.id = newIdValue
					for (const x of destinations) if (x.id === old) x.id = newIdValue
				}
				d.provenance = 'merged'
			} else if (newIdValue && o.pageId && o.kind) {
				destinations.push({ id: newIdValue, pageId: o.pageId, kind: o.kind, labels: labels || {}, examples, ...rest, provenance: 'curated' } as Destination)
			} else {
				continue
			}
			curated++
		}
		for (const v of overlay.visuals) {
			const vis = v.id ? visuals.find((x) => x.id === v.id) : visuals.find((x) => x.pageId === v.match!.page && x.target.css.includes(v.match!.css))
			if (!vis) continue
			vis.description = { ...vis.description, ...v.description }
			vis.source = 'curated'
			vis.confidence = v.confidence ?? 1
			const d = destinations.find((x) => x.visualId === vis.id)
			if (d) {
				d.description = vis.description
				for (const [l, xs] of Object.entries(v.labels || {})) d.labels[l] = uniq([...xs, ...(d.labels[l] || [])])
				d.provenance = 'merged'
			}
			curated++
		}
		flows = overlay.flows.map((f) => ({ ...f, provenance: 'curated' as const }))
		lexicon.synonyms = overlay.lexicon.synonyms || []
		lexicon.intents = overlay.lexicon.intents || {}
		const excluded = new Set(overlay.exclude.destinations)
		for (let i = destinations.length - 1; i >= 0; i--) if (excluded.has(destinations[i].id)) destinations.splice(i, 1)
	}

	const content = {
		standard: STANDARD,
		site: {
			id: site.id,
			name: site.name,
			origins: site.origins.map((o) => new URL(o.url).origin),
			languages,
			defaultLanguage: site.defaultLanguage,
		},
		pages,
		destinations,
		collections,
		flows,
		visuals,
		lexicon,
	}
	const hash = manifestHash(content as never)
	const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\..*/, '').replace('T', '-')
	const manifest = {
		...content,
		version: {
			id: `${stamp}-${hash.slice(0, 6)}`,
			createdAt: now.toISOString(),
			hash,
			crawl: { id: crawl.id, startedAt: crawl.startedAt, pages: crawl.pages.length },
		},
	}
	const v = validateManifest(manifest)
	const stats: BuildStats = {
		pages: pages.length,
		destinations: destinations.reduce<Record<string, number>>((acc, d) => ((acc[d.kind] = (acc[d.kind] || 0) + 1), acc), {}),
		collections: collections.length,
		visuals: visualStats,
		curated,
		flows: flows.length,
	}
	return { ok: v.ok, manifest: v.manifest, issues: v.issues, stats }
}
