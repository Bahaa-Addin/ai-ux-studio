/**
 * The value gate on the committed Vodafone knowledge base (ADR-0059 §3; e-shop plan E2): for every
 * destination, in both languages, whatever the guide would plan for it (go there, describe it, watch
 * it, the flows that apply to it, a choice between two items, the agent's hints) says and shows no
 * stored price or stock, nor does the item name the session keeps. The live page answers.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'

import { knownLines, type Manifest, Plan, type PlanStep } from '#kb'
import { buildPlan } from '#services/router/planner.ts'
import type { Understanding } from '#services/router/understand.ts'
import { ROOT } from '#shared/config.ts'
import { buildKbIndex } from '#shared/kb-index.ts'
import { hasValue } from '#text'

import { emptySession } from '../helpers/kb.ts'

const m: Manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'config/kb/vodafone-eg.manifest.json'), 'utf8'))
const kb = buildKbIndex(m)
const agent = { enabled: true, maxSteps: 12 }

function understanding(lang: string, over: Partial<Understanding>): Understanding {
	return { lang, intent: 'navigate', intentSource: 'default', refersBack: false, usedContext: false, query: '', candidates: [], alternatives: [], decision: { destinationId: undefined, confidence: 1, provider: 'test', latencyMs: 0 }, route: 'replay', ms: 0, ...over } as Understanding
}

/** Everything a plan says or shows, and what the session keeps of it. */
function lines(plan: Plan, last?: { name?: string }): string[] {
	const out = [plan.say, ...knownLines(plan), last?.name]
	for (const s of plan.steps as (PlanStep & Record<string, any>)[]) out.push(s.text, s.caption, s.message, s.which, s.missing, s.question, s.label, s.hints, s.select?.name, ...(s.options || []).map((o: { label: string }) => o.label))
	return out.filter((t): t is string => typeof t === 'string' && t !== '')
}

test('no plan the guide makes from the knowledge base says or shows a stored price or stock (ADR-0059 §3)', () => {
	const bad: string[] = []
	const check = (what: string, r: { plan: Plan; last?: { name?: string } }) => {
		assert.equal(Plan.safeParse(r.plan).success, true, `${what}: a valid plan`)
		for (const t of lines(r.plan, r.last)) if (hasValue(t)) bad.push(`${what}: ${t}`)
	}
	let plans = 0
	for (const lang of ['en', 'ar']) {
		const page = { url: Object.values(m.pages[0].variants)[0].url }
		for (const d of m.destinations) {
			for (const intent of ['navigate', 'describe', 'watch'] as const) {
				check(`${d.id} ${intent} ${lang}`, buildPlan({ u: understanding(lang, { intent, decision: { destinationId: d.id, confidence: 1, provider: 'test', latencyMs: 0 } }), utterance: 'x', session: emptySession(lang), kb, page, turnId: 't', agent }))
				plans++
			}
			for (const f of m.flows || [])
				if (d.collectionId && f.appliesTo?.collectionIds?.includes(d.collectionId)) {
					check(`${d.id} flow ${f.id} ${lang}`, buildPlan({ u: understanding(lang, { intent: 'flow', flowId: f.id, decision: { destinationId: d.id, confidence: 1, provider: 'test', latencyMs: 0 } }), utterance: 'x', session: emptySession(lang), kb, page, turnId: 't', agent }))
					plans++
				}
		}
		// A choice between two items of one list, and the agent's hints naming three of them.
		for (const c of m.collections) {
			const items = m.destinations.filter((d) => d.collectionId === c.id && d.kind === 'item')
			for (let i = 0; i + 1 < items.length; i++) {
				const pair = [items[i], items[i + 1]].map((d) => ({ id: d.id, label: d.labels[lang]?.[0] || d.labels.en?.[0] || d.id, score: 0.5, absolute: 0.5 }))
				check(`${c.id} clarify ${i} ${lang}`, buildPlan({ u: understanding(lang, { route: 'clarify', alternatives: pair as never, candidates: pair as never }), utterance: 'x', session: emptySession(lang), kb, page, turnId: 't', agent }))
				plans++
			}
			const three = items.slice(0, 3).map((d) => ({ id: d.id, label: d.labels[lang]?.[0] || d.id, score: 0.2, absolute: 0.2 }))
			if (three.length) {
				check(`${c.id} agent ${lang}`, buildPlan({ u: understanding(lang, { route: 'agent', candidates: three as never }), utterance: 'x', session: emptySession(lang), kb, page, turnId: 't', agent }))
				plans++
			}
		}
	}
	assert.ok(plans > 1000, `${plans} plans checked`)
	assert.deepEqual(bad.slice(0, 20), [], `${bad.length} lines with a stored price or stock`)
})

test('every string of the committed knowledge base comes out of the gate with nothing the crawler\'s own money pattern finds (AIXC-92)', async () => {
	const { valueFree } = await import('#text')
	// The crawler's pattern (jobs/crawler/extract.ts), independent of the gate's own.
	const MONEY = /([\d٠-٩][\d٠-٩.,٬٫]*\s*(egp|le\b|l\.e|جنيه|ج\.م|\$|usd|eur|€|£|sar|aed|ريال|درهم))|((egp|\$|€|£)\s*[\d٠-٩])/i
	const strings = new Set<string>()
	const add = (t: unknown) => typeof t === 'string' && strings.add(t)
	for (const d of m.destinations) {
		for (const l of Object.values(d.labels || {}).flat()) add(l)
		for (const t of Object.values(d.target?.text || {})) add(t)
		for (const t of Object.values(d.description || {})) add(t)
	}
	for (const p of m.pages) for (const t of Object.values(p.summary || {})) add(t)
	const left = [...strings].map((t) => [t, valueFree(t)]).filter(([, v]) => MONEY.test(v))
	assert.ok(strings.size > 1000, `${strings.size} strings`)
	assert.deepEqual(left.slice(0, 10), [], `${left.length} still name a price`)
	for (const [t, want] of [['(with 50 PT per call)', '(with)'], ['كارت واشتركت في Plus Play ب6.5ج في الشهر', 'كارت واشتركت في Plus Play'], ['10 piasters will be charged', 'will be charged'], ['نفدت الكمية', ''], ['Only 1 item left', ''], ['out-of-stock', ''], ['%20', ''], ['٤٦ ج', ''], ['متوفرة', '']] as const)
		assert.equal(valueFree(t), want, t)
	assert.equal(valueFree('5 جيجا'), '5 جيجا', 'a size with ج at its start is not money')
})

test('a destination whose name is only a stored price, asked about beside any other, never shows that price or leaves the question half-asked (AIXC-96)', async () => {
	const { valueFree } = await import('#text')
	const priceOnly = m.destinations.filter((d) => d.kind === 'item' && Object.values(d.labels || {}).some((l) => l[0] && !valueFree(l[0])))
	assert.ok(priceOnly.length >= 9, `${priceOnly.length} price-only items`)
	const others = m.destinations.filter((d) => d.kind !== 'item' && !priceOnly.includes(d)).filter((_, i) => i % 7 === 0)
	const bad: string[] = []
	for (const lang of ['en', 'ar'])
		for (const p of priceOnly)
			for (const o of others)
				for (const pair of [
					[o, p],
					[p, o],
				]) {
					const alternatives = pair.map((d) => ({ id: d.id, label: d.labels[lang]?.[0] || d.labels.en?.[0] || d.id, score: 0.5, absolute: 0.5 }))
					const { plan } = buildPlan({ u: understanding(lang, { route: 'clarify', alternatives: alternatives as never }), utterance: 'x', session: emptySession(lang), kb, page: { url: Object.values(m.pages[0].variants)[0].url }, turnId: 't', agent })
					for (const t of lines(plan)) if (hasValue(t)) bad.push(`${p.id}/${o.id} ${lang}: ${t}`)
					const ask = plan.steps.at(-1) as PlanStep & { question?: string; options?: { label: string }[] }
					if (ask.options?.some((x) => !x.label.trim()) || /\bor\s*\?$|ولا\s*؟$/.test(ask.question || '')) bad.push(`${p.id}/${o.id} ${lang}: ${ask.question} ${JSON.stringify(ask.options)}`)
				}
	assert.deepEqual(bad.slice(0, 5), [], `${bad.length} problems`)
})

test('no line the guide makes ends on a word that only joined a stored price ("Flex From up to", "when  changes"; AIXC-100)', () => {
	const DANGLING = /(?:\b(?:from|up to|to|for|at|starting)|(?:^|\s)(?:من|حتى|لحد|بـ|ب))\s*[.?!؟]?\s*$|\s{2,}|\(\s*\)|"\s*"/i
	const bad: string[] = []
	for (const lang of ['en', 'ar']) {
		const page = { url: Object.values(m.pages[0].variants)[0].url }
		for (const d of m.destinations)
			for (const intent of ['navigate', 'watch'] as const) {
				// Only what the gate made: a label the crawler cut short ("… dedicated to") is not the gate's.
				if (Object.values(d.labels || {}).some((l) => DANGLING.test(l[0] || ''))) continue
				const { plan } = buildPlan({ u: understanding(lang, { intent, decision: { destinationId: d.id, confidence: 1, provider: 'test', latencyMs: 0 } }), utterance: 'x', session: emptySession(lang), kb, page, turnId: 't', agent })
				for (const t of lines(plan)) if (DANGLING.test(t)) bad.push(`${d.id} ${intent} ${lang}: ${t}`)
			}
	}
	assert.deepEqual(bad.slice(0, 8), [], `${bad.length} lines left dangling`)
})
