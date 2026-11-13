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
