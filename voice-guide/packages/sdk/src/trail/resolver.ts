/**
 * Maps an element a person interacted with to a knowledge destination (SPEC-06 §4), never to an
 * arbitrary `<span>` or layout box. Order:
 *   1. an explicit `data-vg-destination` the site renders;
 *   2. the destination's approved target selectors (deepest match wins: a card before its list);
 *   3. a constrained container's accessible name or heading equal to a destination's title;
 *   4. a link whose normalised target is a known page;
 *   5. a collection item's key attribute;
 *   6. a local-only fingerprint (never shown, never uploaded, never canonical).
 * Navigation, footer, cookie and guide regions resolve to nothing. Results are cached per element
 * and the target index is rebuilt only when the page's structure changes.
 */
import { valueFree } from '../../../text/src/values.ts'
import { TRAIL_CONFIG } from './config.ts'
import { pageKey } from './policy.ts'
import type { PageMap, PageMapDestination } from './types.ts'

export interface Resolution {
	key: string
	destinationId?: string
	pageId?: string
	/** Which rule matched (1 to 6), for tests and the X-ray. */
	via: 1 | 2 | 3 | 4 | 5 | 6
	fingerprint?: string
	/** The element the destination is: what visibility is measured on. */
	el: Element
}

/** More specific kinds first, so an item wins over the list that contains it. */
const KIND_ORDER: Record<string, number> = { item: 0, faq: 1, visual: 2, section: 3, collection: 4 }
const CONTAINERS = 'article, section, li, details, [role="region"], [role="listitem"], [role="article"], [role="group"], [role="tabpanel"]'

export const norm = (s: string) =>
	s
		.toLowerCase()
		.replace(/[إأآ]/g, 'ا')
		.replace(/ى/g, 'ي')
		.replace(/ة/g, 'ه')
		.replace(/[ً-ْـ]/g, '')
		.replace(/[^\p{L}\p{N}]+/gu, ' ')
		.trim()

/** A heading as the name rule compares it: without stored prices, like the titles (ADR-0059; AIXC-103). */
export const headingKey = (s: string) => norm(valueFree(s))

/**
 * The name rule's index: each destination title (3 characters or more) to its destination. A name several
 * destinations share ("Flex" for each tier once prices are gone) names none of them (AIXC-103).
 */
export function nameIndex(destinations: readonly { id: string; title: Record<string, string> }[]): Map<string, string> {
	const byName = new Map<string, string>()
	const shared = new Set<string>()
	for (const d of destinations)
		for (const t of Object.values(d.title)) {
			const k = t && t.length >= 3 ? norm(t) : ''
			if (!k) continue
			if (byName.has(k) && byName.get(k) !== d.id) shared.add(k)
			else byName.set(k, d.id)
		}
	for (const k of shared) byName.delete(k)
	return byName
}

export class Resolver {
	readonly map: PageMap
	#dest = new Map<string, PageMapDestination>()
	#targets = new Map<Element, string>()
	#byName = new Map<string, string>()
	#pagesByKey = new Map<string, string>()
	#cache = new WeakMap<Element, Resolution | null>()
	#doc: Document
	/** Sections that wrap two or more other destinations (a page's tab set): resolved, never shown as explored. */
	readonly containers = new Set<string>()

	constructor(map: PageMap, doc: Document = document) {
		this.map = map
		this.#doc = doc
		for (const d of map.destinations) this.#dest.set(d.id, d)
		this.#byName = nameIndex(map.destinations)
		for (const p of map.pages) for (const k of p.paths) this.#pagesByKey.set(k, p.id)
		this.index()
	}

	/** The destination elements on the page now, most specific first. Call again after the page changes structure. */
	index(): { el: Element; id: string }[] {
		this.#targets = new Map()
		this.#cache = new WeakMap()
		const sorted = [...this.map.destinations].sort((a, b) => (KIND_ORDER[a.kind] ?? 5) - (KIND_ORDER[b.kind] ?? 5))
		for (const d of sorted) {
			for (const css of d.css) {
				let found: Element[] = []
				try {
					found = [...this.#doc.querySelectorAll(css)]
				} catch {}
				if (!found.length) continue
				for (const el of found) if (!this.#targets.has(el) && !this.#furniture(el)) this.#targets.set(el, d.id)
				break
			}
		}
		const all = [...this.#targets]
		this.containers.clear()
		for (const [el, id] of all) {
			if (this.#dest.get(id)?.kind !== 'section') continue
			if (all.filter(([o, oid]) => oid !== id && el !== o && el.contains(o)).length >= 2) this.containers.add(id)
		}
		return all.map(([el, id]) => ({ el, id }))
	}

	destination(id: string): PageMapDestination | undefined {
		return this.#dest.get(id)
	}

	#furniture(el: Element): boolean {
		try {
			return !!el.closest(TRAIL_CONFIG.policy.furniture)
		} catch {
			return false
		}
	}

	resolve(target: EventTarget | null): Resolution | null {
		const start = target instanceof Element ? target : target instanceof Node ? target.parentElement : null
		if (!start) return null
		if (this.#cache.has(start)) return this.#cache.get(start)!
		const r = this.#furniture(start) ? null : this.#resolve(start)
		this.#cache.set(start, r)
		return r
	}

	#resolve(start: Element): Resolution | null {
		// 1. explicit identifier rendered by the site
		const explicit = start.closest('[data-vg-destination]')
		const eid = explicit?.getAttribute('data-vg-destination')
		if (explicit && eid && this.#dest.has(eid)) return { key: `dest:${eid}`, destinationId: eid, pageId: this.map.page?.id, via: 1, el: explicit }
		// 2. approved target selectors, deepest first
		for (let el: Element | null = start; el && el !== this.#doc.body; el = el.parentElement) {
			const id = this.#targets.get(el)
			if (id) return { key: `dest:${id}`, destinationId: id, pageId: this.map.page?.id, via: 2, el }
		}
		// 3. a card-like container named like a destination
		const box = start.closest(CONTAINERS)
		if (box && this.#constrained(box)) {
			// Titles come without stored prices (ADR-0059): the live heading is compared the same way (AIXC-103).
			const name = headingKey(accessibleName(box))
			const id = name ? this.#byName.get(name) : undefined
			if (id) return { key: `dest:${id}`, destinationId: id, pageId: this.map.page?.id, via: 3, el: box }
		}
		// 4. a link to a known page (a call to action that leads somewhere)
		const a = start.closest('a[href]') as HTMLAnchorElement | null
		if (a) {
			const pid = this.#pagesByKey.get(pageKey(a.href, this.map.keepQuery))
			const page = pid ? this.map.pages.find((p) => p.id === pid) : undefined
			if (page && page.eligible && page.id !== this.map.page?.id) return { key: `dest:${page.id}`, destinationId: page.id, pageId: page.id, via: 4, el: a }
		}
		// 5. a collection item by its key attribute
		for (const c of this.map.collections) {
			if (!c.keyAttr) continue
			let item: Element | null = null
			try {
				item = start.closest(c.itemCss)
			} catch {}
			const key = item?.getAttribute(c.keyAttr)
			const d = key ? this.map.destinations.find((x) => x.collectionId === c.id && x.key === key) : undefined
			if (item && d) return { key: `dest:${d.id}`, destinationId: d.id, pageId: this.map.page?.id, via: 5, el: item }
		}
		// 6. local only: a fingerprint of the nearest card, so the private replay can mark it
		if (box && this.#constrained(box)) {
			const fp = `fp:${hash(`${box.tagName}|${accessibleName(box).slice(0, 80)}`)}`
			return { key: fp, fingerprint: fp, via: 6, el: box }
		}
		return null
	}

	/** A container small enough to be one thing (not the whole main column). */
	#constrained(el: Element): boolean {
		const r = el.getBoundingClientRect()
		const vw = this.#doc.defaultView?.innerWidth || 1280
		const vh = this.#doc.defaultView?.innerHeight || 800
		return r.width > 0 && r.height > 0 && r.width * r.height <= 0.6 * vw * vh
	}
}

/** The name a screen reader would give a card: its label, else its heading or summary. */
export function accessibleName(el: Element): string {
	const label = el.getAttribute('aria-label')
	if (label) return label.trim()
	const by = el.getAttribute('aria-labelledby')
	if (by) {
		const t = by
			.split(/\s+/)
			.map((id) => el.ownerDocument.getElementById(id)?.textContent || '')
			.join(' ')
			.trim()
		if (t) return t
	}
	const h = el.querySelector('h1, h2, h3, h4, h5, h6, summary, [role="heading"]')
	return (h?.textContent || '').replace(/\s+/g, ' ').trim()
}

function hash(s: string): string {
	let h = 2166136261
	for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
	return (h >>> 0).toString(36)
}
