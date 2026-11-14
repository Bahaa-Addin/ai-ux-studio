/**
 * Turns an understanding into a plan the SDK can execute (ADR-0015).
 * Everything here is deterministic and model-free: the same knowledge base,
 * session and request always give the same steps.
 */
import { COMMIT_TARGETS, type Collection, commitIntent, type Destination, isNumbersPage, pick, type Plan, type PlanStep, type ReadSpec, type Target } from '#kb'
import type { KbIndex } from '#shared/kb-index.ts'
import type { Entity, SessionState } from '#shared/store/index.ts'
import { valueFree } from '#text'

import { type PhraseKey, say, template } from './phrases.ts'
import type { Understanding } from './understand.ts'

export interface PlanInput {
	u: Understanding
	utterance: string
	session: SessionState
	kb: KbIndex
	page: { url: string; pageId?: string }
	turnId: string
	agent: { enabled: boolean; maxSteps: number }
}

export interface PlanOutput {
	plan: Plan
	/** What a follow-up ("it", "this") will refer to. */
	last?: Entity
}

export function buildPlan(input: PlanInput): PlanOutput {
	const { u, kb, session, page } = input
	const lang = u.lang
	const m = kb.manifest
	const steps: PlanStep[] = []
	// What the trail keeps of an answered turn (ADR-0050 §5): the destination's page and a price-free title, never the words.
	const meta = (route: Plan['meta']['route'], destinationId?: string): Plan['meta'] => {
		const d = destinationId ? kb.dest.get(destinationId) : undefined
		const label = d && priceFreeLabel(pick(d.labels, lang, m.site.defaultLanguage)?.[0])
		return { intent: u.flowId ? `flow:${u.flowId}` : u.intent, route, destinationId, confidence: u.decision.confidence, ...(d ? { pageId: d.pageId } : {}), ...(label ? { label } : {}) }
	}
	// Every plan leaves through the value gate (ADR-0059 §3): nothing the guide says or shows carries a
	// stored price or stock; the live page answers. What the session keeps of an item is its key and a
	// price-free name.
	const out = (route: Plan['meta']['route'], sayText?: string, destinationId?: string, last?: Entity): PlanOutput => ({
		plan: gatePlan({ v: 1, turnId: input.turnId, lang, say: sayText, steps: marked(steps, destinationId ? kb.dest.get(destinationId) : undefined), meta: meta(route, destinationId) }, lang),
		last: last?.name ? { ...last, name: free(last.name) } : last,
	})

	// ---- control ----
	if (u.route === 'control') {
		if (u.intent === 'stop') return out('control', say('stopped', lang))
		if (u.intent === 'help') return out('control', say('help', lang))
		return out('control') // repeat: the SDK repeats what it last said
	}

	// ---- clarify: two close candidates ----
	if (u.route === 'clarify' && u.alternatives.length === 2) {
		const [a, b] = u.alternatives
		// What each is called once its stored price is gone (ADR-0059 §3): a name that was only a price has none.
		const names = [free(a.label), free(b.label)]
		if (!names[0] || !names[1] || names[0] === names[1]) {
			const both = [a, b].map((x) => kb.dest.get(x.id)).map((d) => ({ d, c: d?.collectionId ? kb.collections.get(d.collectionId) : undefined }))
			if (both.every((x) => x.d?.kind === 'item' && x.c) && both[0].d!.pageId === both[1].d!.pageId) {
				// Two cards on one page: each, in its own tab, picked and read from the page, and the reading
				// heard to its end before the next; then the question (AIXC-96, AIXC-97).
				pushNavigate(both[0].d!.pageId)
				for (const { d, c } of both) {
					const colDest = m.destinations.find((x) => x.kind === 'collection' && x.collectionId === c!.id)
					if (colDest) pushReveal(colDest)
					steps.push({ op: 'pickItem', collection: collectionRef(c!), select: { by: 'key', key: itemKey(d!, c!) } })
					steps.push({ op: 'spotlight', target: { css: [':scope'], within: 'item' }, read: itemRead(c!, lang, 'itemRead'), wait: true })
				}
				steps.push({
					op: 'ask',
					question: say('clarifyBoth', lang),
					options: [
						{ label: say('theFirst', lang), utterance: `#dest:${a.id}` },
						{ label: say('theSecond', lang), utterance: `#dest:${b.id}` },
					],
				})
				return out('clarify')
			}
			// Anything else that reads the same: each is named by where it is, its list or its page (AIXC-98).
			const named = [a, b].map((x, i) => {
				const d = kb.dest.get(x.id)
				const place = d ? placeOf(d) : undefined
				return names[i] && place ? `${names[i]} (${place})` : names[i] || place || say(i ? 'theSecond' : 'theFirst', lang)
			})
			if (named[0] === named[1]) [named[0], named[1]] = [say('theFirst', lang), say('theSecond', lang)]
			names[0] = named[0]
			names[1] = named[1]
		}
		steps.push({
			op: 'ask',
			question: say('clarify', lang, { a: names[0]!, b: names[1]! }),
			options: [
				{ label: names[0]!, utterance: `#dest:${a.id}` },
				{ label: names[1]!, utterance: `#dest:${b.id}` },
			],
		})
		return out('clarify')
	}

	// A request to commit itself ("add it to the cart", "ضيفه للسلة") is never an agent task: the
	// guide shows the person the control and they press it (ADR-0058).
	const commit = commitIntent(input.utterance, { url: page.url })
	// On the numbers page asking for a number is choosing one, wherever the router would have gone (AIXC-70).
	if (commit && (u.route === 'agent' || (commit === 'number' && isNumbersPage(page.url)))) {
		const t = COMMIT_TARGETS[commit]
		const message = say(commit === 'number' ? 'commitNumber' : commit === 'cart' || commit === 'buy' || commit === 'checkout' ? 'commit' : 'commitYours', lang)
		// "Add it to the cart" just after the person was shown an item, on its page: the step points at that
		// item's own button, never at the first such button on the list (AIXC-74). Otherwise the
		// executor asks which one when the page has several.
		const last = session.last?.kind === 'item' && session.last.collectionId ? session.last : undefined
		const col = last ? kb.collections.get(last.collectionId!) : undefined
		if (col && last && onPage(col.pageId) && (commit === 'cart' || commit === 'buy') && (last.key || last.name)) {
			steps.push({ op: 'pickItem', collection: collectionRef(col), select: last.key ? { by: 'key', key: last.key } : { by: 'name', name: last.name || '' } })
			steps.push({ op: 'confirm', target: { css: t.css, text: { en: t.text.en, ar: t.text.ar }, within: 'item' }, message, missing: say('commitMissing', lang) })
			return out('none')
		}
		steps.push({ op: 'confirm', target: { css: t.css, text: { en: t.text.en, ar: t.text.ar } }, message, which: say(commit === 'number' ? 'commitNumber' : 'commitWhich', lang), missing: say('commitMissing', lang) })
		return out('none')
	}

	// ---- nothing matched well enough ----
	if (u.route === 'agent' || u.route === 'none' || !u.decision.destinationId) {
		const hints = u.candidates
			.slice(0, 3)
			.map((c) => {
				const d = kb.dest.get(c.id)!
				const url = variantUrl(kb, d.pageId, lang)
				// The agent's model gets no stored price either (ADR-0059 §3); the address stays as it is.
				return `${free(c.label) || pageTitle(d.pageId)} (${url})`
			})
			.join('; ')
		if (u.route === 'agent' && input.agent.enabled) {
			steps.push({ op: 'agent', task: input.utterance, hints: hints || undefined, maxSteps: input.agent.maxSteps })
			return out('agent', say('agent', lang))
		}
		const top = u.candidates[0]
		if (top && top.absolute >= 0.3) {
			const d = kb.dest.get(top.id)!
			pushNavigate(d.pageId)
			return out('none', say('closest', lang, { page: pageTitle(d.pageId) }), d.id)
		}
		return out('none', say(u.intent === 'describe' && u.decision.provider === 'context' ? 'unknownPage' : 'notFound', lang))
	}

	const d = kb.dest.get(u.decision.destinationId)!
	const col = d.collectionId ? kb.collections.get(d.collectionId) : undefined

	// ---- flows (subscribe ...) bound to an item ----
	if (u.intent === 'flow' && u.flowId) {
		const flow = kb.flows.get(u.flowId)
		if (flow) {
			let item: { key?: string; name?: string; collection: Collection; destId?: string } | undefined
			if (d.kind === 'item' && col) item = { key: itemKey(d, col), name: pick(d.labels, lang, m.site.defaultLanguage)?.[0], collection: col, destId: d.id }
			else if (session.last?.collectionId && session.last.key && (!col || session.last.collectionId === col.id)) {
				const c = kb.collections.get(session.last.collectionId)
				if (c) item = { key: session.last.key, name: session.last.name, collection: c, destId: session.last.destinationId }
			}
			const flowCols = new Set(flow.appliesTo?.collectionIds || [])
			if (!item || !flowCols.has(item.collection.id)) {
				// No item yet: show the bundles and ask which one.
				const target = col ? (m.destinations.find((x) => x.kind === 'collection' && x.collectionId === col.id) ?? d) : d
				pushNavigate(target.pageId)
				pushReveal(target)
				if (target.target) steps.push({ op: 'spotlight', target: target.target })
				return out('replay', say('whichItem', lang), target.id, { kind: 'destination', destinationId: target.id, pageId: target.pageId, collectionId: target.collectionId })
			}
			const colDest = m.destinations.find((x) => x.kind === 'collection' && x.collectionId === item!.collection.id)
			pushNavigate(item.collection.pageId)
			if (colDest) pushReveal(colDest)
			steps.push({ op: 'pickItem', collection: collectionRef(item.collection), select: item.key ? { by: 'key', key: item.key } : { by: 'name', name: item.name || '' } })
			for (const s of flow.steps) {
				if (s.op === 'click') steps.push({ op: 'click', target: s.target })
				else if (s.op === 'navigate') pushNavigate(s.pageId, true)
				else if (s.op === 'waitForPage') steps.push({ op: 'waitForPage', pageId: s.pageId, urlPrefix: variantUrl(kb, s.pageId, lang) })
				else if (s.op === 'spotlight') steps.push({ op: 'spotlight', target: s.target, caption: pick(s.caption, lang, m.site.defaultLanguage) })
				else if (s.op === 'say') steps.push({ op: 'say', text: pick(s.text, lang, m.site.defaultLanguage) || '' })
				else if (s.op === 'confirm') steps.push({ op: 'confirm', target: s.target, message: pick(s.message, lang, m.site.defaultLanguage) || say('commit', lang) })
			}
			return out('replay', undefined, item.destId, {
				kind: 'item',
				destinationId: item.destId,
				collectionId: item.collection.id,
				key: item.key,
				name: item.name,
				pageId: item.collection.pageId,
			})
		}
	}

	// ---- watch: spotlight it and offer to watch ----
	if (u.intent === 'watch') {
		const target = d.target
		if (!target) {
			steps.push({ op: 'say', text: say('watchWhich', lang) })
			return out('replay', undefined, d.id)
		}
		pushNavigate(d.pageId)
		pushReveal(d)
		// Never "when  changes" or "Flex From up to": its name without a price, or where it is (AIXC-100).
		const label = nameOf(d)
		steps.push({ op: 'spotlight', target })
		steps.push({ op: 'offerWatch', target, label, url: variantUrl(kb, d.pageId, lang), pageId: d.pageId })
		return out('replay', say('watchOffer', lang, { label }), d.id, { kind: 'destination', destinationId: d.id, pageId: d.pageId, target })
	}

	// ---- "what's on this page?": no navigation, the page's summary (T-303) ----
	if (d.kind === 'page' && u.intent === 'describe') {
		const p = kb.pages.get(d.pageId)
		const title = pageTitle(d.pageId)
		const curated = pick(p?.summary, lang, m.site.defaultLanguage)
		const sections = m.destinations
			.filter((x) => x.pageId === d.pageId && (x.kind === 'section' || x.kind === 'collection') && x.labels[lang]?.length)
			.map((x) => x.labels[lang]![0])
			.filter((l, i, a) => l.length <= 60 && a.indexOf(l) === i)
			.slice(0, 3)
		const text = curated || (sections.length ? say('pageSummary', lang, { title, sections: sections.join(lang === 'ar' ? '، ' : ', ') }) : say('pageTitleOnly', lang, { title }))
		return out('replay', text, d.id, { kind: 'destination', destinationId: d.id, pageId: d.pageId })
	}

	// ---- navigate / describe ----
	// Describing something on the page the person is looking at never moves them, whatever
	// language they asked in ("what does this banner say?" on the Arabic page, in English).
	const describingHere = u.intent === 'describe' && kb.pageFor(page.url)?.pageId === d.pageId
	if (!describingHere) pushNavigate(d.pageId)
	pushReveal(d)
	const label = pick(d.labels, lang, m.site.defaultLanguage)?.[0] || ''
	switch (d.kind) {
		case 'page':
			return out('replay', onPage(d.pageId) ? say('here', lang) : say('taking', lang, { page: pageTitle(d.pageId) }), d.id, { kind: 'destination', destinationId: d.id, pageId: d.pageId })
		case 'collection': {
			if (u.select && col?.fields[u.select.field]) {
				steps.push({ op: 'pickItem', collection: collectionRef(col), select: { by: u.select.by, field: u.select.field } })
				const key: PhraseKey = u.select.field === 'price' ? (u.select.by === 'min' ? 'minPrice' : 'maxPrice') : u.select.by === 'max' ? 'maxData' : 'minData'
				steps.push({ op: 'spotlight', target: { css: [':scope'], within: 'item' }, read: itemRead(col, lang, key) })
				return out('replay', undefined, d.id, { kind: 'item', destinationId: d.id, collectionId: col.id, pageId: d.pageId })
			}
			if (d.target) steps.push({ op: 'spotlight', target: d.target, caption: label })
			return out('replay', label, d.id, { kind: 'destination', destinationId: d.id, collectionId: col?.id, pageId: d.pageId, target: d.target })
		}
		case 'item': {
			if (col) {
				steps.push({ op: 'pickItem', collection: collectionRef(col), select: { by: 'key', key: itemKey(d, col) } })
				steps.push({ op: 'spotlight', target: { css: [':scope'], within: 'item' }, read: itemRead(col, lang, 'itemRead') })
				return out('replay', undefined, d.id, { kind: 'item', destinationId: d.id, collectionId: col.id, key: itemKey(d, col), name: label, pageId: d.pageId })
			}
			break
		}
		case 'visual': {
			const v = d.visualId ? kb.visuals.get(d.visualId) : undefined
			// A picture known only by its alt text ("400 mega."): read the card it sits in instead
			// of echoing the alt, which usually just repeats what the person said.
			const card = v?.source === 'metadata' ? cardAround(d.target!) : undefined
			if (card) {
				steps.push({ op: 'spotlight', target: card, read: { maxChars: 220 } })
				return out('replay', undefined, d.id, { kind: 'visual', destinationId: d.id, pageId: d.pageId, target: d.target })
			}
			steps.push({ op: 'spotlight', target: d.target! })
			const text = pick(v?.description, lang, m.site.defaultLanguage) || pick(d.description, lang, m.site.defaultLanguage) || label
			steps.push({ op: 'say', text })
			return out('replay', undefined, d.id, { kind: 'visual', destinationId: d.id, pageId: d.pageId, target: d.target })
		}
		case 'action': {
			steps.push({ op: 'spotlight', target: d.target! })
			if (d.commit) steps.push({ op: 'confirm', target: d.target!, message: say('commit', lang) })
			return out('replay', undefined, d.id, { kind: 'destination', destinationId: d.id, pageId: d.pageId, target: d.target })
		}
	}
	// sections, FAQ answers, anything else with a target
	if (d.target) steps.push({ op: 'spotlight', target: d.target, read: answerRead(d, lang) })
	return out('replay', undefined, d.id, { kind: 'destination', destinationId: d.id, pageId: d.pageId, target: d.target })

	// ---- helpers (closures over steps, kb, lang) ----
	function onPage(pageId: string): boolean {
		const here = kb.pageFor(page.url)
		return !!here && here.pageId === pageId && here.lang === lang
	}
	function pushNavigate(pageId: string, force = false) {
		if (!force && onPage(pageId)) return
		const url = variantUrl(kb, pageId, lang)
		let handoff = false
		try {
			handoff = new URL(url).origin !== new URL(page.url).origin
		} catch {}
		steps.push({ op: 'navigate', url, pageId, handoff })
	}
	function pushReveal(dest: Destination) {
		for (const r of dest.reveal || []) steps.push({ op: 'reveal', target: r, until: dest.target })
		// After a page load the crawled default tab is open again; only on the page itself can it be closed.
		if (dest.reveal?.length || !dest.target || !onPage(dest.pageId)) return
		// A list in a tab panel that was open when the page was crawled has no reveal step, but the
		// person may have opened another tab since (SPEC-06 §6: a trail question asked from there).
		// On pages with tabs, open the list's own tab; the executor skips this when it is already visible.
		const holder = dest.kind === 'collection' ? dest : dest.collectionId ? m.destinations.find((x) => x.kind === 'collection' && x.collectionId === dest.collectionId) : undefined
		const panel = /^#([\w-]+)$/.exec(holder?.target?.css[0] || '')?.[1]
		const tabs = !!panel && !holder?.reveal?.length && m.destinations.some((x) => x.pageId === dest.pageId && x.reveal?.some((r) => r.role === 'tab' || r.css.some((c) => c.includes('aria-controls'))))
		if (panel && tabs) steps.push({ op: 'reveal', target: { css: [`[aria-controls="${panel}"]`], role: 'tab' }, until: dest.target })
	}
	function pageTitle(pageId: string): string {
		const p = kb.pages.get(pageId)
		const title = p ? pick(Object.fromEntries(Object.entries(p.variants).map(([l, v]) => [l, v.title])), lang, m.site.defaultLanguage) || pageId : pageId
		// A title the gate would empty is no title to say ("Taking you to ."; AIXC-100).
		return free(title) || say('thePage', lang)
	}
	/** Where a destination is: its list's name, else its page's, without a stored price. */
	function placeOf(d: Destination): string | undefined {
		const col = d.collectionId ? kb.collections.get(d.collectionId) : undefined
		return free(pick(col?.labels, lang, m.site.defaultLanguage)?.[0]) || free(pageTitle(d.pageId)) || undefined
	}
	/** What a destination is called, without a stored price; where it is when its name was only a price (AIXC-100). */
	function nameOf(d: Destination): string {
		return free(pick(d.labels, lang, m.site.defaultLanguage)?.[0]) || placeOf(d) || say('thisOne', lang)
	}
}

export function variantUrl(kb: KbIndex, pageId: string, lang: string): string {
	const p = kb.pages.get(pageId)
	if (!p) return ''
	return (p.variants[lang] || p.variants[kb.manifest.site.defaultLanguage] || Object.values(p.variants)[0]).url
}

/** The link or card that holds a picture, from the picture's own locator ("... > a.tiles-link > div > img"). */
export function cardAround(t: Target): Target | undefined {
	const parts = (t.css[0] || '').split(' > ')
	const upTo = (test: (p: string) => boolean) => {
		for (let i = parts.length - 2; i >= 0; i--) if (test(parts[i])) return { css: [parts.slice(0, i + 1).join(' > ')] }
		return undefined
	}
	return upTo((p) => /^a([.#:[]|$)/.test(p)) ?? upTo((p) => /\.(tiles?|card|banner)(-(?!img|image)[\w-]*)?($|[.:[])/.test(p))
}

// A number written with a currency, either side, in English or Arabic (EGP, LE, L.E, جنيه, ج.م, ...).
const CUR = String.raw`(?:e\.?g\.?p|l\.?e\.?|£e?|e£|pounds?|piasters?|pt|جني[هة]|جنيهات|ج\.?\s?م|ج|قروش|قرش)`
const PRICED = new RegExp(String.raw`[%٪]|[0-9٠-٩۰-۹][0-9٠-٩۰-۹.,٬٫]*\s*${CUR}(?![\p{L}])|(?<![\p{L}])${CUR}\s*[0-9٠-٩۰-۹]`, 'iu')

/**
 * A destination's title as the trail may keep it (ADR-0050 §5): left out, not cleaned, when it names a
 * price, an amount with a currency or a percentage, or anything else the value gate would take out.
 * At most 60 characters.
 */
export function priceFreeLabel(title: string | undefined): string | undefined {
	const t = String(title || '').replace(/\s+/g, ' ').trim()
	if (!t || PRICED.test(t) || valueFree(t) !== t) return undefined
	return t.slice(0, 60)
}

/** A line through the value gate; nothing when only a value was left. */
const free = (s: string | undefined): string | undefined => (s ? valueFree(s) || undefined : s)

/** Every line of a plan through the value gate (ADR-0059 §3). Read specs stay: they read the live page. */
function gatePlan(plan: Plan, lang: string): Plan {
	const steps: PlanStep[] = []
	for (const s of plan.steps) {
		if (s.op === 'say') {
			const text = free(s.text)
			if (text) steps.push({ ...s, text })
		} else if (s.op === 'spotlight') steps.push(s.caption ? { ...s, caption: free(s.caption) } : s)
		else if (s.op === 'confirm') steps.push({ ...s, message: free(s.message) || say('commitYours', lang), which: free(s.which), missing: free(s.missing) })
		// A button is never a stored price: a label the gate empties becomes "The first" or "The second" (AIXC-96).
		else if (s.op === 'ask') steps.push({ ...s, question: free(s.question) || say('clarifyBoth', lang), options: s.options?.map((o, i) => ({ ...o, label: free(o.label) || say(i ? 'theSecond' : 'theFirst', lang) })) })
		else if (s.op === 'offerWatch') steps.push({ ...s, label: free(s.label) || say('thisOne', lang) })
		else if (s.op === 'pickItem' && s.select.by === 'name') steps.push({ ...s, select: { ...s.select, name: free(s.select.name) || s.select.name } })
		else steps.push(s)
	}
	return { ...plan, say: free(plan.say), steps }
}

function collectionRef(c: Collection) {
	return {
		id: c.id,
		itemCss: c.itemCss,
		keyAttr: c.keyAttr,
		nameField: c.nameField,
		fields: Object.fromEntries(Object.entries(c.fields).map(([k, f]) => [k, { css: f.css, type: f.type }])),
	}
}

function itemKey(d: Destination, c: Collection): string {
	const css = d.target?.css[0] || ''
	const m = c.keyAttr ? new RegExp(`\\[${c.keyAttr}="([^"]+)"\\]`).exec(css) : null
	if (m?.[1]) return m[1]
	// Positional items (no key attribute): ":nth-of-type(N)" in the target is item #N-1.
	const nth = !c.keyAttr ? /:nth-of-type\((\d+)\)$/.exec(css) : null
	if (nth) return `#${Number(nth[1]) - 1}`
	return d.id.split('.').at(-1) || ''
}

function itemRead(c: Collection, lang: string, key: PhraseKey): ReadSpec {
	const fields: Record<string, Target> = {}
	for (const [k, f] of Object.entries(c.fields)) fields[k] = { css: [f.css], within: 'item' }
	const tpl = c.fields.data ? template(key, lang) : template('itemReadNoData', lang)
	return { fields, template: tpl }
}

function answerRead(d: Destination, lang: string): ReadSpec | undefined {
	if (d.answer?.fields) {
		return { fields: d.answer.fields, template: pick(d.answer.template, lang) || Object.keys(d.answer.fields).map((k) => `{${k}}`).join(' '), maxChars: d.answer.maxChars }
	}
	return { maxChars: 220 }
}

/**
 * A page may mark its own element for a destination with `data-vg-destination` (a clone that
 * re-renders the live page, SPEC-06 §4). The destination's own target gets that marker as its last
 * locator, so the guide finds it where the crawled selectors do not exist; on the live site it is
 * never reached.
 */
function marked(steps: PlanStep[], d: Destination | undefined): PlanStep[] {
	if (!d?.target) return steps
	const t = d.target
	const withMarker = (x: Target): Target => (x === t ? { ...x, css: [...x.css, `[data-vg-destination="${d.id}"]`] } : x)
	return steps.map((s) => {
		if (!('target' in s)) return s
		const out = { ...s, target: withMarker(s.target) } as PlanStep
		if (out.op === 'reveal' && out.until) out.until = withMarker(out.until)
		return out
	})
}

