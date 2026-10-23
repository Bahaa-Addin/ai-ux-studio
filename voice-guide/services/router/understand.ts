/**
 * Understanding a turn: retrieve, then decide (ADR-0014).
 *
 * 1. Language from the words themselves (the UI toggle is only a fallback).
 * 2. Control intents (stop, repeat) from the lexicon, instantly.
 * 3. Intent and modifiers (watch, describe, flows, cheapest/most data) from
 *    the lexicon; a decision model may override a weak lexicon guess.
 * 4. Retrieval narrows hundreds of destinations to the top K for this intent.
 * 5. A decision model (Jev or Laya) or the local scorer picks one, with a
 *    confidence that decides between acting, asking and falling back.
 */
import type { Destination } from '#kb'
import type { KbIndex } from '#shared/kb-index.ts'
import type { SessionState } from '#shared/store/index.ts'
import { detectLanguage, type Hit, terms } from '#text'

import { type CircuitBreaker, type Decider, type DecisionRequest, localChoice } from './deciders.ts'
import { ACT_PHRASES, BACK_REFERENCES, containsPhrase, INTENT_PHRASES, type IntentId, matchPhrases, PAGE_WORDS, padded, SELECTORS, stripPhrases, THIS_PAGE, WATCH_FILLER } from './lexicon.ts'

export interface RouterSettings {
	acceptAt: number
	clarifyAt: number
	topK: number
	agentEnabled: boolean
}

export interface Candidate {
	id: string
	kind: Destination['kind']
	score: number
	absolute: number
	label: string
}

export interface Understanding {
	lang: string
	intent: IntentId
	intentSource: 'lexicon' | 'model' | 'default'
	flowId?: string
	select?: { by: 'min' | 'max'; field: string }
	refersBack: boolean
	usedContext: boolean
	query: string
	candidates: Candidate[]
	alternatives: Candidate[]
	decision: {
		destinationId?: string
		confidence: number
		provider: string
		model?: string
		latencyMs: number
		fallbackReason?: string
	}
	route: 'replay' | 'clarify' | 'agent' | 'control' | 'none'
	ms: number
}

export interface UnderstandInput {
	utterance: string
	uiLang?: string
	pageId?: string
	session: SessionState
	kb: KbIndex
	settings: RouterSettings
	decider?: Decider
	breaker?: CircuitBreaker
}

const labelOf = (d: Destination, lang: string) => d.labels[lang]?.[0] || Object.values(d.labels).flat()[0] || d.id

export async function understand(input: UnderstandInput): Promise<Understanding> {
	const t0 = performance.now()
	const { kb, session, settings } = input
	const m = kb.manifest
	const lang = detectLanguage(input.utterance, input.uiLang || session.lang || m.site.defaultLanguage)
	const text = padded(input.utterance)
	const wordCount = text.trim().split(' ').filter(Boolean).length
	const base = { lang, refersBack: false, usedContext: false, query: '', candidates: [], alternatives: [], ms: 0 }

	// ---- control intents: instant, never sent to a model ----
	// Only when the control phrase is the whole request: "stop" yes, "help me find my invoice" no.
	for (const control of ['stop', 'repeat', 'help'] as const) {
		const hits = matchPhrases(text, INTENT_PHRASES[control])
		if (hits.length && terms(stripPhrases(text, hits)).length === 0) {
			return done({ ...base, intent: control, intentSource: 'lexicon', route: 'control', decision: { confidence: 1, provider: 'lexicon', latencyMs: 0 } })
		}
	}
	void wordCount

	// ---- "what's on this page?": answered from the page the person is on (T-303) ----
	const thisPage = matchPhrases(text, THIS_PAGE)
	if (thisPage.length && terms(stripPhrases(text, thisPage)).length === 0) {
		const pid = input.pageId && kb.dest.has(input.pageId) ? input.pageId : undefined
		const d = pid ? kb.dest.get(pid)! : undefined
		return done({
			...base,
			intent: 'describe',
			intentSource: 'lexicon',
			route: d ? 'replay' : 'none',
			candidates: d ? [{ id: d.id, kind: d.kind, score: 1, absolute: 1, label: labelOf(d, lang) }] : [],
			decision: { destinationId: d?.id, confidence: d ? 1 : 0, provider: 'context', latencyMs: 0 },
		})
	}

	// ---- intent and modifiers from the lexicon ----
	const siteIntents = m.lexicon.intents
	const watchHits = matchPhrases(text, INTENT_PHRASES.watch, siteIntents.watch)
	const describeHits = matchPhrases(text, INTENT_PHRASES.describe, siteIntents.describe)
	const selector = SELECTORS.find((s) => matchPhrases(text, s.phrases).length)
	const selectorHits = selector ? matchPhrases(text, selector.phrases) : []
	const utteranceTerms = new Set(terms(input.utterance))
	let flowId: string | undefined
	for (const [id, ft] of kb.flowTerms) if ([...ft].some((t) => utteranceTerms.has(t))) flowId = flowId ?? id
	const refersBack = Object.values(BACK_REFERENCES)
		.flat()
		.some((p) => containsPhrase(text, p))
	const actHits = matchPhrases(text, ACT_PHRASES)
	const pageHits = matchPhrases(text, PAGE_WORDS)

	let intent: IntentId = 'navigate'
	let intentSource: Understanding['intentSource'] = 'default'
	if (watchHits.length) [intent, intentSource] = ['watch', 'lexicon']
	else if (flowId) [intent, intentSource] = ['flow', 'lexicon']
	else if (describeHits.length) [intent, intentSource] = ['describe', 'lexicon']
	else if (actHits.length) [intent, intentSource] = ['act', 'lexicon']
	else if (selector) intentSource = 'lexicon'

	// What is left once intent words are removed is what the person is looking for.
	let query = stripPhrases(text, [...watchHits, ...describeHits, ...selectorHits, ...pageHits, ...matchPhrases(text, INTENT_PHRASES.help), ...(watchHits.length ? matchPhrases(text, WATCH_FILLER) : []), ...(settings.agentEnabled ? [] : actHits)])
	if (flowId) {
		const flowQuery = query.split(' ').filter((w) => !terms(w).some((t) => kb.flowTerms.get(flowId!)!.has(t))).join(' ')
		// "How do I activate roaming": a flow verb, but the rest names something outside the flow's
		// collections that the site answers directly. That is a question, not the flow.
		const flowCols = new Set(kb.flows.get(flowId)!.appliesTo?.collectionIds || [])
		if (terms(flowQuery).length) {
			const inFlow = kb.index.search(flowQuery, { limit: 3, filter: (id) => flowCols.has(kb.dest.get(id)!.collectionId || '') })
			const anywhere = kb.index.search(query, { limit: 3 })
			const bestIn = Math.max(0, ...inFlow.map((h) => h.coverage))
			const bestOut = anywhere.find((h) => !flowCols.has(kb.dest.get(h.id)!.collectionId || ''))
			if (bestIn < 0.5 && bestOut && bestOut.coverage >= 0.6) {
				flowId = undefined
				intent = 'navigate'
				intentSource = 'default'
			}
		}
		if (flowId) query = flowQuery
	}

	// ---- retrieval, narrowed by intent ----
	const currentPage = input.pageId
	const flow = flowId ? kb.flows.get(flowId) : undefined
	const flowCollections = new Set(flow?.appliesTo?.collectionIds || [])
	const filter = (id: string) => {
		const d = kb.dest.get(id)!
		if (intent === 'describe') return d.kind === 'visual'
		if (intent === 'flow') return !!d.collectionId && flowCollections.has(d.collectionId)
		if (selector) return d.kind === 'collection' && !!d.collectionId && !!kb.collections.get(d.collectionId)?.fields[selector.field]
		if (intent === 'watch') return d.kind !== 'page' && d.kind !== 'action'
		return true
	}
	const boost = (id: string) => {
		const d = kb.dest.get(id)!
		let b = d.pageId === currentPage ? (intent === 'describe' ? 2 : 1.25) : 1
		if (intent === 'watch' && d.watchable) b *= 1.5
		if (pageHits.length && d.kind === 'page') b *= 1.6
		// Prefer what is labelled in the language being spoken: on sites whose pages differ by
		// language (Vodafone's Arabic and English bundle markup), the other language's copy of a
		// destination may not exist on the page the person is on.
		const labelled = Object.entries(d.labels).filter(([, xs]) => xs.length).map(([l]) => l)
		if (labelled.length && !labelled.includes(lang) && !d.examples?.[lang]?.length) b *= 0.7
		return b * (d.priority ?? 1)
	}
	const hits: Hit[] = query.trim() ? kb.index.search(query, { limit: settings.topK, filter, boost }) : []
	let candidates: Candidate[] = hits
		.filter((h) => h.bm25 > 0 || h.trigram > 0.35)
		.map((h) => {
			const d = kb.dest.get(h.id)!
			return { id: h.id, kind: d.kind, score: h.score, absolute: Math.max(h.coverage, h.trigram), label: labelOf(d, lang) }
		})
	// "What does this banner say?" with nothing else: the visuals on this page are the candidates.
	if (intent === 'describe' && !candidates.length && currentPage) {
		candidates = [...kb.visuals.values()]
			.filter((v) => v.pageId === currentPage)
			.map((v) => kb.manifest.destinations.find((d) => d.visualId === v.id))
			.filter((d): d is Destination => !!d)
			.map((d) => ({ id: d.id, kind: d.kind, score: 0.5, absolute: 0.5, label: labelOf(d, lang) }))
	}

	// "What's the cheapest?" without naming anything: collections that have the field, current page first, then by priority.
	if (selector && !candidates.length) {
		candidates = kb.manifest.destinations
			.filter((d) => d.kind === 'collection' && !!d.collectionId && !!kb.collections.get(d.collectionId)?.fields[selector.field])
			.map((d) => ({ id: d.id, kind: d.kind, score: (d.priority ?? 1) * (d.pageId === currentPage ? 1.25 : 1), absolute: 0.6, label: labelOf(d, lang) }))
			.sort((a, b) => b.score - a.score)
	}

	// A short query that matches a page as well as one of its sections means the page ("offers").
	const topC = candidates[0]
	const pageC = candidates.find((c) => c.kind === 'page' && c.absolute >= 0.99 && kb.dest.get(topC?.id || '')?.pageId === kb.dest.get(c.id)!.pageId)
	if (topC && pageC && pageC !== topC && intent === 'navigate' && !selector && pageC.score >= 0.8 * topC.score) {
		candidates = [{ ...pageC, score: topC.score * 1.05 }, ...candidates.filter((c) => c !== pageC)]
	}

	// ---- follow-ups: "subscribe to it", "tell me when this changes" ----
	const last = session.last
	const strong = candidates.find((c) => c.absolute >= 0.6)
	if (refersBack && last?.destinationId && kb.dest.has(last.destinationId) && (intent === 'flow' || intent === 'watch' || intent === 'describe') && !strong) {
		const d = kb.dest.get(last.destinationId)!
		return done({
			lang,
			intent,
			intentSource,
			flowId,
			select: selector ? { by: selector.by, field: selector.field } : undefined,
			refersBack,
			usedContext: true,
			query,
			candidates,
			alternatives: [],
			decision: { destinationId: d.id, confidence: 0.9, provider: 'context', latencyMs: 0 },
			route: 'replay',
			ms: 0,
		})
	}

	// "How do I subscribe?" with nothing on screen yet: the flow's first collection, then the planner asks which item.
	if (intent === 'flow' && flowId && !candidates.length) {
		const colId = kb.flows.get(flowId)?.appliesTo?.collectionIds[0]
		const colDest = colId ? kb.manifest.destinations.find((d) => d.kind === 'collection' && d.collectionId === colId) : undefined
		if (colDest) {
			return done({
				lang,
				intent,
				intentSource,
				flowId,
				refersBack,
				usedContext: false,
				query,
				candidates,
				alternatives: [],
				decision: { destinationId: colDest.id, confidence: 0.6, provider: 'flow-default', latencyMs: 0 },
				route: 'replay',
				ms: 0,
			})
		}
	}

	// "Select bank card", "fill my number": doing something on this page is the agent's job.
	// Without an agent, the request is answered like any other: show the closest place.
	if (intent === 'act' && settings.agentEnabled) {
		return done({
			lang,
			intent,
			intentSource,
			refersBack,
			usedContext: false,
			query,
			candidates,
			alternatives: [],
			decision: { confidence: 0, provider: 'lexicon', latencyMs: 0 },
			route: 'agent',
			ms: 0,
		})
	}

	// ---- decide ----
	let decision: Understanding['decision'] = { confidence: 0, provider: 'local', latencyMs: 0 }
	const keyed = candidates.map((c, i) => ({ key: `d${i + 1}`, c }))
	const useRemote = input.decider && !input.breaker?.open && keyed.length > 0
	if (useRemote) {
		const req: DecisionRequest = {
			state: {
				utterance: input.utterance,
				language: lang,
				current_page: currentPage ? Object.values(kb.pages.get(currentPage)?.variants || {})[0]?.title || currentPage : 'unknown',
				previous: last?.destinationId ? labelOf(kb.dest.get(last.destinationId) || ({ labels: {}, id: last.destinationId } as never), lang) : 'none',
			},
			questions: {
				destination: {
					instructions: 'Which destination on the website best answers the visitor\'s `utterance`? Use `previous` for words like "it" or "this". Choose none if nothing fits.',
					options: Object.fromEntries([
						...keyed.map(({ key, c }) => {
							const d = kb.dest.get(c.id)!
							const page = kb.pages.get(d.pageId)
							const title = page ? page.variants[lang]?.title || Object.values(page.variants)[0]?.title : ''
							const other = Object.entries(d.labels).find(([l]) => l !== lang)?.[1]?.[0]
							return [key, `${labelOf(d, lang)}${other ? ` / ${other}` : ''} (${d.kind} on ${title})`.slice(0, 140)]
						}),
						['none', 'None of these: the visitor wants something else'],
					]),
				},
			},
		}
		if (intentSource !== 'lexicon') {
			req.questions.intent = {
				instructions: 'What does the visitor want to do?',
				options: {
					navigate: 'find, see or check something on the website',
					describe: 'know what an image, banner, chart or map shows',
					watch: 'be told later when something changes',
					...Object.fromEntries([...kb.flows.values()].map((f) => [`flow:${f.id}`, `${f.labels.en?.[0] || f.id}: ${(f.labels.en || []).slice(1, 3).join(', ')}`])),
				},
			}
		}
		try {
			const r = await input.decider!.decide(req)
			input.breaker?.success()
			const ans = r.answers.destination
			if (!ans) throw new Error(`${r.provider}: no destination answer`)
			const chosen = keyed.find((k) => k.key === ans.choice)
			decision = { destinationId: chosen?.c.id, confidence: chosen ? ans.confidence : 0, provider: r.provider, model: r.model, latencyMs: r.latencyMs }
			for (const k of keyed) k.c.score = ans.probabilities[k.key] ?? k.c.score
			const it = r.answers.intent
			if (it && it.confidence >= 0.5) {
				if (it.choice.startsWith('flow:')) [intent, flowId] = ['flow', it.choice.slice(5)]
				else intent = it.choice as IntentId
				intentSource = 'model'
			}
		} catch (e) {
			input.breaker?.failure()
			decision.fallbackReason = (e as Error).message.slice(0, 160)
		}
	}
	if (!useRemote || decision.fallbackReason) {
		const t1 = performance.now()
		const ans = localChoice(keyed.map(({ key, c }) => ({ key, score: c.score, absolute: c.absolute })))
		const chosen = keyed.find((k) => k.key === ans.choice)
		decision = { ...decision, destinationId: chosen?.c.id, confidence: chosen ? ans.confidence : 0, provider: 'local', latencyMs: performance.now() - t1 }
	}

	// ---- route ----
	let route: Understanding['route']
	let alternatives: Candidate[] = []
	const ranked = [...candidates].sort((a, b) => b.score - a.score)
	if (!decision.destinationId || decision.confidence < settings.clarifyAt) {
		route = settings.agentEnabled ? 'agent' : 'none'
	} else if (decision.confidence >= settings.acceptAt) {
		route = 'replay'
	} else {
		const top = ranked.find((c) => c.id === decision.destinationId)!
		const second = ranked.find((c) => c.id !== decision.destinationId)
		if (top.absolute < 0.5) {
			// Most of the request is not on the site: asking "A or B?" would be a guess.
			route = settings.agentEnabled ? 'agent' : 'none'
		} else if (second && second.score >= 0.75 * top.score) {
			// Ask only when both options cover the request. Two half-matches on different words
			// ("open a business": a router guide's "open the wifi" and "Business International")
			// make "A or B?" a guess about two things the person did not ask for.
			if (second.absolute < 0.5) route = settings.agentEnabled ? 'agent' : 'none'
			else {
				route = 'clarify'
				alternatives = [top, second]
			}
		} else route = 'replay'
	}
	return done({
		lang,
		intent,
		intentSource,
		flowId,
		select: selector ? { by: selector.by, field: selector.field } : undefined,
		refersBack,
		usedContext: false,
		query,
		candidates: ranked,
		alternatives,
		decision,
		route,
		ms: 0,
	})

	function done(u: Understanding): Understanding {
		u.ms = performance.now() - t0
		return u
	}
}
