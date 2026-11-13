import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'

import { CircuitBreaker, localChoice, SystemOneDecider } from '#services/router/deciders.ts'
import { evaluate } from '#services/router/eval.ts'
import { buildPlan } from '#services/router/planner.ts'
import { understand } from '#services/router/understand.ts'

import type { PlanStep } from '#kb'

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
	// On the bundles page the person may have opened the other tab: the card's own tab is opened
	// first, and the executor skips that step when the card is already visible (SPEC-06 §6).
	assert.deepEqual(
		plan.steps.map((s) => s.op),
		['reveal', 'pickItem', 'click', 'waitForPage', 'spotlight', 'confirm'],
	)
	assert.equal((plan.steps[0] as any).target.css[0], '[aria-controls="mobile-internet"]')
	assert.deepEqual((plan.steps[1] as any).select, { by: 'key', key: 'mi-10' })
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

test('a card in a tab panel the crawler saw open is revealed again when asked from the same page (SPEC-06 §6)', async () => {
	// Bug: with the Home internet tab open, "What does Mega 25 include?" spotlit a hidden card.
	const session = emptySession('en')
	const u = await understand({ utterance: 'What does Mega 25 include?', pageId: 'web.bundles', session, kb, settings })
	const { plan } = buildPlan({ u, utterance: 'x', session, kb, page: { url: 'http://localhost:4401/en/bundles.html' }, turnId: 't', agent: { enabled: true, maxSteps: 12 } })
	assert.deepEqual(plan.steps.map((s) => s.op), ['reveal', 'pickItem', 'spotlight'])
	const reveal = plan.steps[0] as any
	assert.equal(reveal.target.css[0], '[aria-controls="mobile-internet"]')
	assert.match(reveal.until.css[0], /mi-25/, 'skipped when the card is already visible')
	// From another page the next page load opens the default tab: no extra step.
	const away = buildPlan({ u, utterance: 'x', session, kb, page: { url: 'http://localhost:4401/en/index.html' }, turnId: 't', agent: { enabled: true, maxSteps: 12 } }).plan
	assert.deepEqual(away.steps.map((s) => s.op), ['navigate', 'pickItem', 'spotlight'])
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

test('a request to commit itself is a guided confirm step at the control, never an agent task; other unmatched requests still go to the agent (ADR-0058)', async () => {
	const page = { url: 'http://localhost:4401/en/phones.html' }
	for (const [utterance, lang] of [['add the Galaxy A55 to the cart', 'en'], ['ضيفه للسلة', 'ar']] as const) {
		const session = emptySession(lang)
		const u = await understand({ utterance, pageId: undefined, session, kb, settings })
		if (u.route !== 'agent') continue // the local decider found a place for it: not this case
		const { plan } = buildPlan({ u, utterance, session, kb, page, turnId: 't', agent: { enabled: true, maxSteps: 12 } })
		assert.deepEqual(plan.steps.map((x) => x.op), ['confirm'], `${utterance}: one confirm step`)
		const step = plan.steps[0] as Extract<(typeof plan.steps)[number], { op: 'confirm' }>
		assert.ok(step.target.css.includes('button.cart') && step.target.text?.[lang], `${utterance}: the cart control, by markup and by its words`)
		assert.match(step.message, lang === 'ar' ? /بنفسك/ : /Press it yourself/)
	}
	const session = emptySession('en')
	const u = await understand({ utterance: 'sort the phones by price', pageId: undefined, session, kb, settings })
	if (u.route === 'agent') assert.deepEqual(buildPlan({ u, utterance: 'sort the phones by price', session, kb, page, turnId: 't', agent: { enabled: true, maxSteps: 12 } }).plan.steps.map((x) => x.op), ['agent'], 'sorting is still the agent\'s')
})

test('a commit step never points at the first of several: unscoped it carries a "which one" line and a "not on this page" line; just after an item was shown, on its page, it is that item\'s own button (AIXC-74)', async () => {
	const phones = { url: 'http://localhost:4401/en/phones.html' }
	const agent = { enabled: true, maxSteps: 12 }
	let session = emptySession('en')
	let u = await understand({ utterance: 'add it to the cart', pageId: undefined, session, kb, settings })
	assert.equal(u.route, 'agent', 'nothing on the site matches: the agent branch')
	{
		const step = buildPlan({ u, utterance: 'add it to the cart', session, kb, page: phones, turnId: 't', agent }).plan.steps[0] as Extract<PlanStep, { op: 'confirm' }>
		assert.equal(step.op, 'confirm')
		assert.match(step.which || '', /Which one do you mean/)
		assert.match(step.missing || '', /can't see that button/)
		assert.equal(step.target.within, undefined)
	}
	session = { ...emptySession('en'), last: { kind: 'item' as const, destinationId: 'web.bundles.mobile-internet.mi-10', collectionId: 'web.bundles.mobile-internet', key: 'mi-10', pageId: 'web.bundles' } }
	u = await understand({ utterance: 'add it to the cart', pageId: 'web.bundles', session, kb, settings })
	assert.equal(u.route, 'agent')
	{
		const { plan } = buildPlan({ u, utterance: 'add it to the cart', session, kb, page: { url: 'http://localhost:4401/en/bundles.html', pageId: 'web.bundles' }, turnId: 't', agent })
		assert.deepEqual(plan.steps.map((x) => x.op), ['pickItem', 'confirm'], 'the item first, then its own button')
		const [pick, confirm] = plan.steps as [Extract<PlanStep, { op: 'pickItem' }>, Extract<PlanStep, { op: 'confirm' }>]
		assert.deepEqual(pick.select, { by: 'key', key: 'mi-10' })
		assert.equal(confirm.target.within, 'item')
	}
})

test('questions about paying or booking reach the agent; they are not turned into a button to press (AIXC-77)', async () => {
	const page = { url: 'http://localhost:4401/en/phones.html' }
	for (const utterance of ['can I pay in installments', 'how do I book a store appointment', 'do I need to book before visiting a store']) {
		const session = emptySession('en')
		const u = await understand({ utterance, pageId: undefined, session, kb, settings })
		assert.equal(u.route, 'agent', utterance)
		assert.deepEqual(buildPlan({ u, utterance, session, kb, page, turnId: 't', agent: { enabled: true, maxSteps: 12 } }).plan.steps.map((x) => x.op), ['agent'], utterance)
	}
})

test('on the numbers page asking for a number is a guided step at "Choose this line", even when the router finds a page elsewhere (AIXC-70)', async () => {
	const session = emptySession('en')
	const utterance = 'I want the first number'
	const u = await understand({ utterance, pageId: undefined, session, kb, settings })
	const { plan } = buildPlan({ u, utterance, session, kb, page: { url: 'http://localhost:4401/en/lines/red/numbers/' }, turnId: 't', agent: { enabled: true, maxSteps: 12 } })
	assert.deepEqual(plan.steps.map((x) => x.op), ['confirm'], `route ${u.route}: no navigation away, one guided step`)
	const step = plan.steps[0] as Extract<PlanStep, { op: 'confirm' }>
	assert.equal(step.target.css[0], '#sl-lines-pool-choose-this-line-button')
	assert.match(step.message, /Pick the number you want/)
})

test('two choices that differ only by a stored price are both shown and read from the page, then asked as "the first or the second" (ADR-0059 §3)', async () => {
	const { answerTo } = await import('#services/router/handlers.ts')
	const alternatives = [
		{ id: 'web.bundles.mobile-internet.mi-10', label: 'Plus · 37 EGP', score: 0.5, absolute: 0.5 },
		{ id: 'web.bundles.mobile-internet.mi-25', label: 'Plus · 46 EGP', score: 0.49, absolute: 0.49 },
	]
	for (const lang of ['en', 'ar'] as const) {
		const session = emptySession(lang)
		const u = { ...(await understand({ utterance: 'plus', pageId: undefined, session, kb, settings })), route: 'clarify' as const, alternatives: alternatives as never, lang }
		const { plan } = buildPlan({ u, utterance: 'plus', session, kb, page: { url: 'http://localhost:4401/en/index.html' }, turnId: 't', agent: { enabled: true, maxSteps: 12 } })
		assert.deepEqual(plan.steps.map((x) => x.op).filter((op) => op !== 'navigate' && op !== 'reveal'), ['pickItem', 'spotlight', 'pickItem', 'spotlight', 'ask'], lang)
		const ask = plan.steps.at(-1) as Extract<PlanStep, { op: 'ask' }>
		assert.doesNotMatch(JSON.stringify(plan), /37|46 EGP/, 'no stored price anywhere in the plan')
		assert.deepEqual(ask.options?.map((o) => o.utterance), alternatives.map((a) => `#dest:${a.id}`))
	}
	const ids = alternatives.map((a) => a.id)
	for (const said of ['the first', 'first one', 'الأولى', 'الاول']) assert.equal(answerTo(said, ids, kb), ids[0], said)
	for (const said of ['the second', 'second one', 'التانية', 'التاني']) assert.equal(answerTo(said, ids, kb), ids[1], said)
})
