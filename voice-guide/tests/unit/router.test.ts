import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'

import { CircuitBreaker, localChoice, SystemOneDecider } from '#services/router/deciders.ts'
import { evaluate } from '#services/router/eval.ts'
import { buildPlan } from '#services/router/planner.ts'
import { understand } from '#services/router/understand.ts'

import { cases, emptySession, fixtureKb } from '../helpers/kb.ts'
import { type MockJev, startMockJev } from '../helpers/mock-jev.ts'

const kb = fixtureKb()
const settings = { acceptAt: 0.55, clarifyAt: 0.3, topK: 8, agentEnabled: true }

test('tuning set: every case routes correctly with the local decider', async () => {
	const s = await evaluate(cases('utterances.yaml'), kb, settings)
	const failed = s.rows.filter((r) => !r.ok).map((r) => `${r.case.say}: ${r.failures.join('; ')}`)
	assert.deepEqual(failed, [])
	assert.ok(s.latency.p95 < 20, `p95 ${s.latency.p95} ms`)
})

test('held-out set: destination accuracy stays at or above 90% (regression floor, not a target)', async () => {
	const s = await evaluate(cases('utterances-heldout.yaml'), kb, settings)
	const d = s.byField.dest
	assert.ok(d.correct / d.checked >= 0.9, `destination ${d.correct}/${d.checked}`)
})

test('plans never click a commit point; flows end in a confirm step', async () => {
	const session = { ...emptySession('ar'), last: { kind: 'item' as const, destinationId: 'web.bundles.mobile-internet.mi-10', collectionId: 'web.bundles.mobile-internet', key: 'mi-10' } }
	const u = await understand({ utterance: 'أشترك فيها إزاي؟', pageId: 'web.bundles', session, kb, settings })
	const { plan } = buildPlan({ u, utterance: 'x', session, kb, page: { url: 'http://localhost:4401/ar/bundles.html' }, turnId: 't', agent: { enabled: true, maxSteps: 12 } })
	assert.deepEqual(
		plan.steps.map((s) => s.op),
		['pickItem', 'click', 'waitForPage', 'spotlight', 'confirm'],
	)
	assert.deepEqual((plan.steps[0] as any).select, { by: 'key', key: 'mi-10' })
	const commitCss = new Set(kb.manifest.destinations.filter((d) => d.commit).flatMap((d) => d.target?.css || []))
	for (const s of plan.steps) if (s.op === 'click') for (const c of s.target.css) assert.ok(!commitCss.has(c), `click on commit target ${c}`)
	assert.equal(plan.steps.at(-1)?.op, 'confirm')
})

test('hidden content is revealed before it is picked; Arabic answers use Arabic templates', async () => {
	const session = emptySession('ar')
	const u = await understand({ utterance: 'أرخص باقة نت للبيت', pageId: 'web.home', session, kb, settings })
	const { plan, last } = buildPlan({ u, utterance: 'x', session, kb, page: { url: 'http://localhost:4401/ar/index.html' }, turnId: 't', agent: { enabled: true, maxSteps: 12 } })
	assert.deepEqual(
		plan.steps.map((s) => s.op),
		['navigate', 'reveal', 'pickItem', 'spotlight'],
	)
	assert.equal((plan.steps[0] as any).url, 'http://localhost:4401/ar/bundles.html')
	assert.equal((plan.steps[1] as any).target.css[0], '#tab-home')
	assert.match((plan.steps[3] as any).read.template, /أرخص واحدة/)
	assert.equal(last?.collectionId, 'web.bundles.home-internet')
})

test('crossing to the web app origin asks for a session handoff', async () => {
	const session = emptySession('en')
	const u = await understand({ utterance: 'How much data do I have left?', pageId: 'web.home', session, kb, settings })
	const { plan } = buildPlan({ u, utterance: 'x', session, kb, page: { url: 'http://localhost:4401/en/index.html' }, turnId: 't', agent: { enabled: true, maxSteps: 12 } })
	const nav = plan.steps[0] as any
	assert.equal(nav.op, 'navigate')
	assert.equal(nav.url, 'http://localhost:4402/en/account.html')
	assert.equal(nav.handoff, true)
	assert.match((plan.steps.at(-1) as any).read.template, /\{remaining\}/)
})

test('local confidence is low when most of the request is not on the site', () => {
	const sure = localChoice([
		{ key: 'd1', score: 1, absolute: 1 },
		{ key: 'd2', score: 0.4, absolute: 0.5 },
	])
	const unsure = localChoice([{ key: 'd1', score: 1, absolute: 0.3 }])
	assert.equal(sure.choice, 'd1')
	assert.ok(sure.confidence > 0.9)
	assert.ok(unsure.confidence < 0.45)
})

let jev: MockJev
before(async () => {
	jev = await startMockJev()
})
after(async () => {
	await jev.close()
})

test('Jev/Laya adapter: sends the System One request and maps the answer back to a destination', async () => {
	jev.status = 200
	jev.answer = (body) => {
		const opts = body.questions.destination.criteria as Record<string, string>
		const key = Object.keys(opts).find((k) => /Home internet|الإنترنت المنزلي/.test(opts[k]))!
		return { destination: { choice: key, probabilities: { [key]: 0.88 }, confidence: 0.88 } }
	}
	const decider = new SystemOneDecider({ name: 'jev', baseUrl: jev.url, apiKey: 'test-key', model: 'jev-latest', timeoutMs: 1000 })
	const u = await understand({ utterance: 'internet for my house', pageId: 'web.home', session: emptySession('en'), kb, settings, decider, breaker: new CircuitBreaker() })
	const req = jev.requests.at(-1)!
	assert.equal(req.headers.authorization, 'Bearer test-key')
	assert.equal(req.body.model, 'jev-latest')
	assert.equal(req.body.questions.destination.type, 'choice')
	assert.ok('none' in req.body.questions.destination.criteria, 'a none option is always offered')
	assert.equal(req.body.state.utterance, 'internet for my house')
	assert.ok(req.body.questions.intent, 'intent is asked when the lexicon found none')
	assert.equal(u.decision.provider, 'jev')
	assert.equal(u.decision.model, 'jev-1.13.0')
	assert.equal(u.decision.destinationId, 'web.bundles.home-internet')
	assert.equal(u.route, 'replay')
})

test('Jev/Laya adapter: "none" from the model routes to the agent', async () => {
	jev.status = 200
	jev.answer = () => ({ destination: { choice: 'none', probabilities: { none: 0.93 }, confidence: 0.93 } })
	const decider = new SystemOneDecider({ name: 'laya', baseUrl: jev.url, timeoutMs: 1000 })
	const u = await understand({ utterance: 'cheapest internet bundle', pageId: 'web.home', session: emptySession('en'), kb, settings, decider })
	assert.equal(u.decision.destinationId, undefined)
	assert.equal(u.route, 'agent')
})

test('Jev/Laya adapter: failures fall back to the local decider, then the breaker stops calling', async () => {
	jev.status = 503
	const decider = new SystemOneDecider({ name: 'jev', baseUrl: jev.url, apiKey: 'k', timeoutMs: 1000 })
	const breaker = new CircuitBreaker(2, 30_000, 60_000)
	const before = jev.requests.length
	for (let i = 0; i < 4; i++) {
		const u = await understand({ utterance: 'cheapest internet bundle', pageId: 'web.home', session: emptySession('en'), kb, settings, decider, breaker })
		assert.equal(u.decision.provider, 'local')
		assert.equal(u.decision.destinationId, 'web.bundles.mobile-internet')
	}
	assert.equal(jev.requests.length - before, 2, 'two failures open the breaker; later turns skip the call')
	assert.ok(breaker.open)
})

test('Jev/Laya adapter: a slow provider times out and the turn still answers', async () => {
	jev.status = 200
	jev.delayMs = 400
	const decider = new SystemOneDecider({ name: 'jev', baseUrl: jev.url, apiKey: 'k', timeoutMs: 100 })
	const t0 = performance.now()
	const u = await understand({ utterance: 'cheapest internet bundle', pageId: 'web.home', session: emptySession('en'), kb, settings, decider })
	jev.delayMs = 0
	assert.equal(u.decision.provider, 'local')
	assert.match(u.decision.fallbackReason || '', /abort|timeout/i)
	assert.ok(performance.now() - t0 < 350)
})
