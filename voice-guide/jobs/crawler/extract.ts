/**
 * Runs inside the crawled page (page.evaluate). Self-contained: no imports,
 * no closures. Finds sections, collections, visuals, actions, links and
 * data-kb-* annotations, with multi-locator CSS for each (ADR-0011, ADR-0012).
 */
import type { PageSnap } from './types.ts'

export interface ExtractOptions {
	minItems: number
}

export function extractPage(opts: ExtractOptions): Omit<PageSnap, 'status' | 'snapshot'> {
	const MONEY = /([\d٠-٩][\d٠-٩.,٬٫]*\s*(egp|le\b|l\.e|جنيه|ج\.م|\$|usd|eur|€|£|sar|aed|ريال|درهم))|((egp|\$|€|£)\s*[\d٠-٩])/i
	const DATA = /[\d٠-٩][\d٠-٩.,٫]*\s*(gb|mb|tb|جيجابايت|ميجابايت|جيجا|ميجا|giga)/i
	// Commit points (AGENTS.md §4.1): payment, subscription confirmation, recharge, transfer, line changes.
	const COMMIT_WORDS = /(pay|purchase|buy now|place order|confirm|checkout|subscribe|recharge|top up|transfer|send money|activate|ادفع|الدفع|دفع|شراء|اشتري|تأكيد|أكد|اكد|اطلب|اشترك|اشحن|حوّل|حول|تحويل|فعّل|فعل|تفعيل)/i
	const STABLE_ATTRS = ['data-testid', 'data-test', 'data-qa', 'data-cy', 'data-kb-destination', 'data-bundle', 'data-id', 'data-key', 'data-sku', 'name', 'aria-controls', 'for']
	const SECTION_SEL = 'section, article, [role="region"], [role="tabpanel"], details, figure, form, main > div[id]'
	const HEADING_SEL = 'h1, h2, h3, h4, h5, h6, [role="heading"]'

	const clean = (s: string | null | undefined, max = 400) => (s || '').replace(/\s+/g, ' ').trim().slice(0, max)
	const esc = (s: string) => (window as any).CSS.escape(s)
	// A Liferay portlet's id (`p_p_id_<portlet>_INSTANCE_<id>_`) is set when an editor places it and stays
	// the same across days and languages, whatever its length or digits: locators start there rather than
	// at the column's nth portlet, which shifts when a section is added above (ADR-0049 §6).
	const isPortletId = (id: string) => /^p_p_id_\w{1,160}_INSTANCE_[A-Za-z0-9]{4,32}_?$/.test(id)
	const isStableId = (id: string) => isPortletId(id) || (/^[A-Za-z][\w-]{0,63}$/.test(id) && !/\d{4,}|^(ember|react|ng-|mui|radix|headlessui|__)/i.test(id))
	const stableClasses = (el: Element) =>
		[...el.classList].filter((c) => /^[A-Za-z][\w-]{1,40}$/.test(c) && !/\d{3,}|^(is-|has-|js-)|^(active|selected|open|hover|focus|visible|hidden|show)$|--[a-z0-9]{5,}$/i.test(c))
	const unique = (sel: string, el: Element) => {
		try {
			const m = document.querySelectorAll(sel)
			return m.length === 1 && m[0] === el
		} catch {
			return false
		}
	}
	const isHidden = (el: Element): boolean => {
		if (el.closest('[hidden]')) return true
		let cur: Element | null = el
		while (cur) {
			const cs = getComputedStyle(cur)
			if (cs.display === 'none' || cs.visibility === 'hidden') return true
			if (cur.tagName === 'DETAILS' && cur !== el && !(cur as HTMLDetailsElement).open && !el.matches('summary') && cur.contains(el)) {
				const summary = cur.querySelector(':scope > summary')
				if (summary !== el && !summary?.contains(el)) return true
			}
			cur = cur.parentElement
		}
		return false
	}
	const segment = (el: Element, withNth = true) => {
		const tag = el.tagName.toLowerCase()
		let s = tag + stableClasses(el).slice(0, 2).map((c) => '.' + esc(c)).join('')
		const parent = el.parentElement
		if (withNth && parent) {
			const sameTag = [...parent.children].filter((c) => c.tagName === el.tagName)
			if ([...parent.children].filter((c) => c.matches(s)).length > 1) s += `:nth-of-type(${sameTag.indexOf(el) + 1})`
		}
		return s
	}
	const pathFrom = (el: Element) => {
		const parts: string[] = []
		let cur: Element | null = el
		while (cur && cur !== document.body && cur !== document.documentElement) {
			if (cur !== el && cur.id && isStableId(cur.id) && unique('#' + esc(cur.id), cur)) {
				parts.unshift('#' + esc(cur.id))
				break
			}
			parts.unshift(segment(cur))
			cur = cur.parentElement
		}
		return parts.join(' > ')
	}
	const cssFor = (el: Element): string[] => {
		const out: string[] = []
		if (el.id && isStableId(el.id) && unique('#' + esc(el.id), el)) out.push('#' + esc(el.id))
		for (const a of STABLE_ATTRS) {
			const v = el.getAttribute(a)
			if (!v || v.length > 80) continue
			const s = `${el.tagName.toLowerCase()}[${a}="${esc(v)}"]`
			if (unique(s, el)) {
				out.push(s)
				break
			}
		}
		const p = pathFrom(el)
		if (p) out.push(p)
		return [...new Set(out)].slice(0, 3)
	}
	/** Text with a space between text nodes, so "Super 10" and "10 GB" do not run together. */
	const spacedText = (el: Element | null | undefined, max = 600) => {
		if (!el) return ''
		const parts: string[] = []
		const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
		let n: Node | null
		while ((n = walker.nextNode())) {
			const p = n.parentElement
			if (p && p.closest('script, style, noscript, template, vg-guide')) continue
			parts.push(n.textContent || '')
		}
		return clean(parts.join(' '), max)
	}
	const textOf = (el: Element | null | undefined, max = 120) => spacedText(el, max)
	const byIds = (ids: string | null) =>
		clean(
			(ids || '')
				.split(/\s+/)
				.map((id) => document.getElementById(id)?.textContent || '')
				.join(' '),
		)

	const revealPath = (el: Element) => {
		const steps: { css: string[]; text: string; role: string }[] = []
		const panel = el.closest('[role="tabpanel"]')
		if (panel && panel.id && isHidden(panel)) {
			const tab = document.querySelector(`[role="tab"][aria-controls="${esc(panel.id)}"]`)
			if (tab) steps.push({ css: cssFor(tab), text: textOf(tab), role: 'tab' })
		}
		const det = el.closest('details')
		if (det && !(det as HTMLDetailsElement).open) {
			const summary = det.querySelector(':scope > summary')
			if (summary && summary !== el) steps.push({ css: cssFor(summary), text: textOf(summary), role: 'summary' })
		}
		let cur: Element | null = el
		while (cur) {
			if (cur.id) {
				const ctl = document.querySelector(`[aria-controls="${esc(cur.id)}"][aria-expanded="false"]:not([role="tab"])`)
				if (ctl) steps.push({ css: cssFor(ctl), text: textOf(ctl), role: 'button' })
			}
			cur = cur.parentElement
		}
		return steps
	}

	const headingFor = (el: Element) => {
		const labelled = byIds(el.getAttribute('aria-labelledby'))
		if (labelled) return labelled
		const aria = clean(el.getAttribute('aria-label'))
		if (aria) return aria
		if (el.tagName === 'DETAILS') return textOf(el.querySelector(':scope > summary'))
		if (el.tagName === 'FIELDSET') return textOf(el.querySelector(':scope > legend'))
		// A plain container right after its heading: <h2>Popular bundles</h2><div id="popular">...
		if (el.tagName === 'DIV' && !el.querySelector(':scope > h1, :scope > h2, :scope > h3, :scope > h4')) {
			const prev = el.previousElementSibling
			if (prev && prev.matches(HEADING_SEL)) return textOf(prev)
		}
		for (const h of el.querySelectorAll(HEADING_SEL)) {
			const owner = h.parentElement?.closest(SECTION_SEL)
			if (owner === el || (!owner && el.contains(h))) return textOf(h)
			if (owner && el.contains(owner) && owner !== el) continue
		}
		return ''
	}

	const annotationsOf = (el: Element) => {
		const out: Record<string, string> = {}
		for (const a of el.getAttributeNames()) if (a.startsWith('data-kb-')) out[a.slice(8)] = el.getAttribute(a) || ''
		return out
	}

	// ---- collections ----
	const collections: any[] = []
	const itemElements = new Set<Element>()
	const seenContainers = new Set<Element>()
	for (const el of document.querySelectorAll('body *')) {
		if (el.closest('header, nav, footer, vg-guide')) continue
		const kids = [...el.children]
		if (kids.length < opts.minItems) continue
		const groups = new Map<string, Element[]>()
		for (const k of kids) {
			const sig = k.tagName + '.' + stableClasses(k).sort().join('.')
			groups.set(sig, [...(groups.get(sig) || []), k])
		}
		for (const items of groups.values()) {
			if (items.length < opts.minItems || seenContainers.has(el)) continue
			const valued = items.filter((i) => MONEY.test(i.textContent || '') || DATA.test(i.textContent || ''))
			if (valued.length < Math.ceil(items.length * 0.8)) continue
			seenContainers.add(el)
			const first = items[0]
			const rel = (root: Element, node: Element) => {
				const parts: string[] = []
				let c: Element | null = node
				while (c && c !== root) {
					parts.unshift(segment(c, false))
					c = c.parentElement
				}
				return parts.join(' > ')
			}
			const leafMatching = (root: Element, re: RegExp) =>
				[...root.querySelectorAll('*')].find((n) => re.test(n.textContent || '') && ![...n.children].some((ch) => re.test(ch.textContent || '')))
			const fields: Record<string, { css: string; type: 'text' | 'money' | 'data' }> = {}
			const nameEl = first.querySelector(HEADING_SEL) || first.querySelector('strong, b')
			if (nameEl) fields.name = { css: rel(first, nameEl), type: 'text' }
			const moneyEl = leafMatching(first, MONEY)
			if (moneyEl) fields.price = { css: rel(first, moneyEl), type: 'money' }
			const dataEl = leafMatching(first, DATA)
			if (dataEl && dataEl !== moneyEl) fields.data = { css: rel(first, dataEl), type: 'data' }
			// keep only fields that resolve in at least 80% of items
			for (const [k, f] of Object.entries(fields)) {
				const ok = items.filter((i) => i.querySelector(f.css)).length
				if (ok < Math.ceil(items.length * 0.8)) delete fields[k]
			}
			const dataAttrs = first.getAttributeNames().filter((a) => a.startsWith('data-'))
			const keyAttr = dataAttrs
				.sort((a, b) => Number(/id|key|sku|bundle|plan|product/.test(b)) - Number(/id|key|sku|bundle|plan|product/.test(a)))
				.find((a) => {
					const vals = items.map((i) => i.getAttribute(a))
					return vals.every(Boolean) && new Set(vals).size === vals.length
				})
			const containerCss = cssFor(el)
			const panel = el.closest('[role="tabpanel"]')
			const heading = (panel && byIds(panel.getAttribute('aria-labelledby'))) || headingFor(el.closest(SECTION_SEL) || el) || ''
			for (const i of items) itemElements.add(i)
			collections.push({
				containerCss,
				itemCss: `${containerCss[0]} > ${segment(first, false)}`,
				keyAttr,
				heading,
				hidden: isHidden(el),
				reveal: revealPath(el),
				fields,
				items: items.map((i) => ({
					key: keyAttr ? i.getAttribute(keyAttr) || undefined : undefined,
					name: fields.name ? textOf(i.querySelector(fields.name.css)) : textOf(i, 60),
					values: Object.fromEntries(Object.entries(fields).map(([k, f]) => [k, textOf(i.querySelector(f.css))])),
				})),
			})
		}
	}

	// ---- sections ----
	const sections: any[] = []
	for (const el of document.querySelectorAll(SECTION_SEL)) {
		if (el.closest('header, nav, footer, vg-guide') || itemElements.has(el)) continue
		if (el.tagName === 'FIGURE') continue // figures are handled as visuals
		const heading = headingFor(el)
		if (!heading) continue
		const kind = el.tagName === 'DETAILS' ? 'faq' : el.getAttribute('role') === 'tabpanel' ? 'tabpanel' : el.tagName === 'FORM' ? 'form' : 'section'
		const body = spacedText(el, 600).replace(heading, '').trim()
		sections.push({
			css: cssFor(el),
			kind,
			heading,
			text: body.slice(0, 400),
			hidden: kind === 'faq' ? isHidden(el.querySelector(':scope > summary') || el) : isHidden(el),
			reveal: revealPath(kind === 'faq' ? el.querySelector(':scope > :not(summary)') || el : el),
			annotations: annotationsOf(el),
		})
	}

	// ---- visuals ----
	const visuals: any[] = []
	const nearestHeading = (el: Element) => {
		const owner = el.closest('figure, section, article, [role="region"]')
		if (owner) {
			const h = owner.querySelector(HEADING_SEL)
			if (h) return textOf(h)
		}
		let cur: Element | null = el
		while (cur && cur !== document.body) {
			let sib = cur.previousElementSibling
			while (sib) {
				if (sib.matches(HEADING_SEL)) return textOf(sib)
				const inner = sib.querySelector?.(HEADING_SEL)
				if (inner) return textOf(inner)
				sib = sib.previousElementSibling
			}
			cur = cur.parentElement
		}
		return ''
	}
	const candidates = document.querySelectorAll('img, canvas, svg, video')
	let vi = 0
	for (const el of candidates) {
		if (el.closest('header, nav, footer')) continue
		if (el.tagName.toLowerCase() === 'svg' && el.parentElement?.closest('svg')) continue
		const r = el.getBoundingClientRect()
		const tag = el.tagName.toLowerCase()
		let kind: string = tag === 'img' ? 'image' : tag === 'video' ? 'video' : tag === 'svg' ? 'svg' : 'canvas'
		if (tag === 'canvas' && /webgl/i.test(el.getAttribute('data-vg-context') || '')) kind = 'webgl'
		const w = tag === 'img' ? (el as HTMLImageElement).naturalWidth || r.width : r.width
		const h = tag === 'img' ? (el as HTMLImageElement).naturalHeight || r.height : r.height
		if (tag === 'svg' && el.getAttribute('role') !== 'img' && (r.width < 120 || r.height < 80)) continue
		if (w < 80 || h < 40) continue
		if (tag === 'img' && el.getAttribute('alt') === '' && (w < 300 || h < 120)) continue
		const link = el.closest('a[href]') as HTMLAnchorElement | null
		const fig = el.closest('figure')
		const meta: Record<string, unknown> = {
			alt: clean(el.getAttribute('alt')) || undefined,
			title: clean(el.getAttribute('title')) || undefined,
			ariaLabel: clean(el.getAttribute('aria-label')) || undefined,
			labelledBy: byIds(el.getAttribute('aria-labelledby')) || undefined,
			describedBy: byIds(el.getAttribute('aria-describedby')) || undefined,
			figcaption: textOf(fig?.querySelector('figcaption'), 300) || undefined,
			heading: nearestHeading(el) || undefined,
			linkHref: link?.href || undefined,
			linkText: link ? textOf(link, 80) || undefined : undefined,
			src: tag === 'img' ? (el as HTMLImageElement).currentSrc || (el as HTMLImageElement).src : undefined,
		}
		if (tag === 'svg') {
			meta.svgTitle = textOf(el.querySelector(':scope > title'), 200) || undefined
			meta.svgDesc = textOf(el.querySelector(':scope > desc'), 400) || undefined
			const parts = [...el.querySelectorAll('title, text')].map((t) => clean(t.textContent)).filter(Boolean)
			meta.svgText = clean([...new Set(parts)].join(' · '), 600) || undefined
		}
		const kb: Record<string, string> = {}
		for (const a of el.getAttributeNames()) if (a.startsWith('data-kb-describe-')) kb[a.slice(17)] = el.getAttribute(a) || ''
		if (Object.keys(kb).length) meta.kbDescribe = kb
		visuals.push({ index: vi++, css: cssFor(el), kind, width: Math.round(w), height: Math.round(h), hidden: isHidden(el), meta })
	}

	// ---- actions ----
	const actions: any[] = []
	for (const el of document.querySelectorAll('button, input[type="submit"], a.btn, a.button, [role="button"]')) {
		if (el.closest('header, nav, footer')) continue
		if (el.getAttribute('role') === 'tab') continue
		const form = el.closest('form')
		const text = textOf(el, 80) || clean(el.getAttribute('value')) || clean(el.getAttribute('aria-label'))
		const type = el.getAttribute('type') || undefined
		const isSubmit = !!form && (el.tagName === 'BUTTON' ? (type || 'submit') === 'submit' : type === 'submit')
		const paymentForm = !!form?.querySelector('[autocomplete^="cc-"], input[name*="card" i], input[value="card"], input[name="pay"]')
		const annotated = el.hasAttribute('data-kb-commit')
		const commit = annotated || (isSubmit && (COMMIT_WORDS.test(text) || paymentForm))
		actions.push({
			css: cssFor(el),
			text,
			tag: el.tagName.toLowerCase(),
			type,
			href: (el as HTMLAnchorElement).href || undefined,
			inForm: !!form,
			commit,
			reason: annotated ? 'data-kb-commit' : commit ? (paymentForm ? 'submit in a payment form' : 'submit with a payment word') : undefined,
			hidden: isHidden(el),
		})
	}

	// ---- links, alternates, annotations ----
	const links = [...document.querySelectorAll('a[href]')]
		.map((a) => ({
			href: (a as HTMLAnchorElement).href,
			text: textOf(a, 80),
			hreflang: a.getAttribute('hreflang') || undefined,
			inNav: !!a.closest('nav, header'),
		}))
		.filter((l) => /^https?:/.test(l.href))
	const alternates: Record<string, string> = {}
	for (const l of document.querySelectorAll('link[rel="alternate"][hreflang]')) {
		const lang = (l.getAttribute('hreflang') || '').toLowerCase().slice(0, 2)
		if (lang) alternates[lang] = (l as HTMLLinkElement).href
	}
	const annotations = [...document.querySelectorAll('*')]
		.filter((el) => el.getAttributeNames().some((a) => a.startsWith('data-kb-') && !a.startsWith('data-kb-describe-')))
		.map((el) => ({ css: cssFor(el), attrs: annotationsOf(el), text: textOf(el, 160) }))

	const lang = (document.documentElement.lang || '').toLowerCase().slice(0, 2)
	return {
		url: location.href,
		lang,
		dir: (document.documentElement.dir || getComputedStyle(document.documentElement).direction) === 'rtl' ? 'rtl' : 'ltr',
		title: clean(document.title, 200),
		h1: textOf(document.querySelector('h1'), 200),
		alternates,
		sections,
		collections,
		visuals,
		actions,
		links,
		annotations,
		textLength: (document.body?.innerText || '').length,
	}
}

/** Injected before any page script: records which context each canvas uses (2d or webgl). */
export const CANVAS_PROBE = `(() => {
	const orig = HTMLCanvasElement.prototype.getContext;
	HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
		try { this.setAttribute('data-vg-context', String(type)); } catch (e) {}
		return orig.call(this, type, ...rest);
	};
})();`
