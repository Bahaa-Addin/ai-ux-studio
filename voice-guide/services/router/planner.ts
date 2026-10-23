/**
 * Turns an understanding into a plan the SDK can execute (ADR-0015).
 * Everything here is deterministic and model-free: the same knowledge base,
 * session and request always give the same steps.
 */
import { type Collection, type Destination, pick, type Plan, type PlanStep, type ReadSpec, type Target } from '#kb'
import { type KbIndex, variantKey } from '#shared/kb-index.ts'
import type { Entity, SessionState } from '#shared/store/index.ts'

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
	const meta = (route: Plan['meta']['route'], destinationId?: string): Plan['meta'] => ({ intent: u.flowId ? `flow:${u.flowId}` : u.intent, route, destinationId, confidence: u.decision.confidence })
	const out = (route: Plan['meta']['route'], sayText?: string, destinationId?: string, last?: Entity): PlanOutput => ({
		plan: { v: 1, turnId: input.turnId, lang, say: sayText, steps, meta: meta(route, destinationId) },
		last,
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
		steps.push({
			op: 'ask',
			question: say('clarify', lang, { a: a.label, b: b.label }),
			options: [
				{ label: a.label, utterance: `#dest:${a.id}` },
				{ label: b.label, utterance: `#dest:${b.id}` },
			],
		})
		return out('clarify')
	}

	// ---- nothing matched well enough ----
	if (u.route === 'agent' || u.route === 'none' || !u.decision.destinationId) {
		const hints = u.candidates
			.slice(0, 3)
			.map((c) => {
				const d = kb.dest.get(c.id)!
				const url = variantUrl(kb, d.pageId, lang)
				return `${c.label} (${url})`
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
		return out('none', say('notFound', lang))
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
		const label = pick(d.labels, lang, m.site.defaultLanguage)?.[0] || ''
		steps.push({ op: 'spotlight', target })
		steps.push({ op: 'offerWatch', target, label, url: variantUrl(kb, d.pageId, lang), pageId: d.pageId })
		return out('replay', say('watchOffer', lang, { label }), d.id, { kind: 'destination', destinationId: d.id, pageId: d.pageId, target })
	}

	// ---- navigate / describe ----
	pushNavigate(d.pageId)
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
		const here = kb.pageByUrl.get(variantKey(page.url))
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
	}
	function pageTitle(pageId: string): string {
		const p = kb.pages.get(pageId)
		return p ? pick(Object.fromEntries(Object.entries(p.variants).map(([l, v]) => [l, v.title])), lang, m.site.defaultLanguage) || pageId : pageId
	}
}

export function variantUrl(kb: KbIndex, pageId: string, lang: string): string {
	const p = kb.pages.get(pageId)
	if (!p) return ''
	return (p.variants[lang] || p.variants[kb.manifest.site.defaultLanguage] || Object.values(p.variants)[0]).url
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
	return m?.[1] || d.id.split('.').at(-1) || ''
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
