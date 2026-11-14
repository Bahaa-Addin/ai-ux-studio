/**
 * What questions were about (ADR-0050 §5; live plan phase 3 S14), the parts that need no browser: the
 * wrapper around the guide's request reads only the plan's meta of an answered turn, never the words
 * said or typed nor the answer; at most ten per step; nothing without a destination or for a failed
 * turn; the stored record round-trips through the parsers and older sessions still parse; the label
 * the server sends is dropped when it names a price; the consent copy says so in both languages.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { Plan } from '#kb'

import { addAsked, allAsked, askedFrom, type AskOrigin, watchTurns } from '../../packages/sdk/src/trail/asked.ts'
import { tt } from '../../packages/sdk/src/trail/i18n.ts'
import { parseSession, TRAIL_SCHEMA, type TrailSession, type TrailStepSummary } from '../../packages/sdk/src/trail/types.ts'
import { priceFreeLabel } from '../../services/router/planner.ts'

const UTTERANCE = 'my number is 01001234567 how much is roaming zebra-quokka'
const ANSWER = 'Roaming costs 46 EGP a month'
const PRICE = '46 EGP'

/** A plan as the server sends it: its say and steps carry a price, its meta the destination. */
const plan = (meta: Record<string, unknown> = { intent: 'navigate', route: 'replay', destinationId: 'web.roaming.week', pageId: 'web.roaming', label: 'Roaming week plans', confidence: 0.9 }) =>
	Plan.parse({ v: 1, turnId: 't1', lang: 'en', say: ANSWER, steps: [{ op: 'say', text: `Only ${PRICE}` }, { op: 'spotlight', target: { css: ['#x'] }, caption: PRICE }], meta })

/** A stand-in guide whose request posts the turn the way `guide.ts` does. */
function guide(answer: () => Promise<unknown>) {
	const posts: { path: string; body: unknown }[] = []
	const g = {
		api: {
			post: async (path: string, body: unknown) => {
				posts.push({ path, body })
				return path === '/v1/turn' ? answer() : {}
			},
		},
		async request(utterance: string, source: AskOrigin) {
			try {
				await g.api.post('/v1/turn', { utterance, source })
			} catch {}
		},
	}
	return { g, posts }
}

const page = (): TrailStepSummary => ({ id: 'stp_1', sessionId: 'trs_1', type: 'page', pageId: 'web.home', title: { en: 'Home' }, enteredAt: 1, durationMs: 0, navigationCause: { kind: 'direct' }, topDestinationIds: [], explored: [], replay: 'ok' })
const session = (steps: unknown[]): unknown => ({ schema: TRAIL_SCHEMA, id: 'trs_1', siteId: 's', locale: 'en', startedAt: 1, updatedAt: 1, expiresAt: 9e15, recordingState: 'recording', bytes: 0, steps })

test('the wrapper hands on only the answered plan and how it was asked; the stored question holds no words, no answer, no price', async () => {
	const { g, posts } = guide(async () => ({ turnId: 't1', plan: plan() }))
	const seen: [AskOrigin, unknown][] = []
	const unwatch = watchTurns(g, (o, p) => seen.push([o, p]))
	const step = page()
	for (const origin of ['voice', 'typed', 'chip'] as const) await g.request(UTTERANCE, origin)
	assert.equal(posts.length, 3, 'the request goes to the server unchanged')
	assert.deepEqual((posts[0].body as { utterance: string }).utterance, UTTERANCE)
	assert.deepEqual(seen.map(([o]) => o), ['voice', 'typed', 'chip'], 'how it was asked, as the guide names it')
	for (const [o, p] of seen) {
		const q = askedFrom(p, o, 5, `ask_${o}`)
		assert.ok(q)
		addAsked(step, q)
	}
	assert.deepEqual(step.asked?.[0], { id: 'ask_voice', at: 5, lang: 'en', origin: 'voice', destinationId: 'web.roaming.week', pageId: 'web.roaming', intent: 'navigate', route: 'replay', label: 'Roaming week plans' })
	const stored = JSON.stringify(parseSession(session([step])))
	for (const bad of [UTTERANCE, 'zebra-quokka', '01001234567', ANSWER, PRICE, '46', 'EGP']) assert.ok(!stored.includes(bad), `the stored journey never holds "${bad}"`)
	unwatch()
	await g.request(UTTERANCE, 'voice')
	assert.equal(seen.length, 3, 'unwrapped: no more turns are seen')
})

test('nothing for a failed turn, a turn outside a request, another path, or a plan with no destination', async () => {
	const fail = guide(() => Promise.reject(new Error('503')))
	const seen: unknown[] = []
	watchTurns(fail.g, (_o, p) => seen.push(p))
	await fail.g.request(UTTERANCE, 'typed')
	assert.equal(seen.length, 0, 'a failed request is not answered')

	const ok = guide(async () => ({ turnId: 't', plan: plan() }))
	watchTurns(ok.g, (_o, p) => seen.push(p))
	await ok.g.api.post('/v1/turn', { utterance: UTTERANCE })
	await ok.g.api.post('/v1/progress', {})
	assert.equal(seen.length, 0, 'only a turn the guide asked for')

	assert.equal(askedFrom(plan({ intent: 'stop', route: 'control' }), 'voice', 1, 'a'), null, 'no destination resolved: nothing')
	assert.equal(askedFrom(plan({ intent: 'navigate', route: 'none', destinationId: '' }), 'voice', 1, 'a'), null)
	assert.equal(askedFrom(undefined, 'voice', 1, 'a'), null)
	assert.equal(askedFrom({ say: UTTERANCE }, 'voice', 1, 'a'), null)
})

test('at most ten asked questions per step: the oldest goes first', () => {
	const step = page()
	for (let i = 0; i < 13; i++) addAsked(step, askedFrom(plan(), 'typed', i, `ask_${i}`)!)
	assert.equal(step.asked?.length, 10)
	assert.deepEqual(step.asked?.map((q) => q.id), Array.from({ length: 10 }, (_, i) => `ask_${i + 3}`))
	const all = allAsked([page(), step])
	assert.deepEqual(all.slice(0, 2).map((q) => [q.id, q.stepId]), [['ask_12', 'stp_1'], ['ask_11', 'stp_1']], 'newest first, with the step')
})

test('stored steps: the asked list round-trips; an older session without it still parses; damaged or extra fields are dropped', () => {
	const step = page()
	addAsked(step, askedFrom(plan(), 'chip', 7, 'ask_1')!)
	const back = parseSession(JSON.parse(JSON.stringify(session([step])))) as TrailSession
	assert.deepEqual(back.steps[0].asked, step.asked)

	const old = parseSession(session([page()])) as TrailSession
	assert.equal(old.steps.length, 1)
	assert.equal('asked' in old.steps[0], false, 'a step from before S14 has no asked list')

	const tampered = { ...page(), asked: [{ ...step.asked![0], utterance: UTTERANCE, say: ANSWER }, { id: 'x' }, 'junk', ...Array.from({ length: 12 }, (_, i) => ({ ...step.asked![0], id: `q${i}` }))] }
	const t = parseSession(session([tampered])) as TrailSession
	assert.equal(t.steps[0].asked?.length, 10, 'at most ten, the newest')
	assert.ok(!JSON.stringify(t).includes(UTTERANCE) && !JSON.stringify(t).includes(ANSWER), 'fields that are not an asked question are not kept')
	assert.deepEqual((parseSession(session([{ ...page(), asked: 'nope' }])) as TrailSession).steps[0].asked, [])
})

test('the label: kept when it names no price; dropped (never cleaned) when it names a price, a currency amount or a percentage, English and Arabic', () => {
	for (const ok of ['Roaming week plans', 'Flex 1400', 'Mega 25', '5 GB bundle', 'باقات التجوال', 'فليكس ١٤٠٠', 'Red Essential']) assert.equal(priceFreeLabel(ok), ok, ok)
	for (const priced of ['Flex 46 EGP', 'EGP 46', '46EGP', 'Mega 25 for 120 LE', 'L.E 99 bundle', '99 L.E.', 'باقة ٤٦ جنيه', 'باقة 46 جنيه', 'فليكس ٤٦ ج.م', '20% off', '%20 discount', 'خصم ٢٠٪', 'جنيه 46']) assert.equal(priceFreeLabel(priced), undefined, priced)
	assert.equal(priceFreeLabel(''), undefined)
	assert.equal(priceFreeLabel(undefined), undefined)
	assert.equal(priceFreeLabel('x'.repeat(90))?.length, 60, 'at most 60 characters')
	// The trail checks again: a label with a price from an older server is not kept.
	assert.equal(askedFrom(plan({ intent: 'navigate', route: 'replay', destinationId: 'd', label: 'Flex 46 EGP' }), 'voice', 1, 'a')?.label, undefined)
	assert.equal(askedFrom(plan({ intent: 'navigate', route: 'replay', destinationId: 'd', label: 'خصم ٢٠٪' }), 'voice', 1, 'a')?.label, undefined)
	assert.equal(askedFrom(plan({ intent: 'navigate', route: 'replay', destinationId: 'd', label: 'Roaming' }), 'voice', 1, 'a')?.label, 'Roaming')
})

test('the consent copy: the pages visited, what was explored there and what the questions were about, never the words said or typed (English and Arabic)', () => {
	assert.match(tt('consentWhat', 'en'), /the public pages you visited.*what you explored there, and what your questions were about, never the words you said or typed/)
	assert.match(tt('consentNot', 'en'), /the words you say or type, the guide’s answers/)
	assert.match(tt('consentWhat', 'ar'), /الصفحات العامة اللي زرتها.*اللي اكتشفته فيها، وأسئلتك كانت عن إيه، من غير أبدًا الكلام اللي قلته أو كتبته/)
	assert.match(tt('consentNot', 'ar'), /الكلام اللي بتقوله أو بتكتبه، ردود المرشد/)
})
