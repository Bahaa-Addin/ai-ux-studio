/**
 * A sample journey for the demo kit (ADR-0050 §6; live plan S15), the check that needs no browser: what
 * `seed()` accepts is the trail's own stored data within its limits, nothing else; anything malformed,
 * oversize, of another version or shaped to pollute prototypes is refused as a whole; the copy gets new
 * ids and its times end now, in order and within the 30-minute journey limit.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { checkSeed, SEED_MAX_STRING, type SeedOptions } from '../../packages/sdk/src/trail/seed.ts'
import { parseSession, TRAIL_SCHEMA } from '../../packages/sdk/src/trail/types.ts'

const ORIGIN = 'http://localhost:4469'
const NOW = Date.UTC(2026, 10, 15, 12)
const T = Date.UTC(2026, 10, 1, 9)
const MIN = 60_000

/* eslint-disable @typescript-eslint/no-explicit-any */
const item = (title = 'Flex bundles') => ({ destinationId: 'd.flex', pageId: 'web.bundles', kind: 'card', title: { en: title }, context: { en: 'Bundles' }, reason: 'explored', questions: { en: [{ id: 'q1', text: 'What is Flex?', intent: 'info' }] } })
const step = (id: string, at: number, o: Record<string, unknown> = {}) => ({ id, sessionId: 'trs_in1', type: 'page', pageId: 'web.x', canonicalPath: `${ORIGIN}/en/p${id.replace(/\D/g, '')}`, title: { en: `Page ${id.replace(/\D/g, '')}` }, enteredAt: at, leftAt: at + 3 * MIN, firstEventAt: at + 1000, durationMs: 2 * MIN, navigationCause: { kind: 'direct' }, topDestinationIds: ['d.flex'], explored: [item()], replay: 'ok', ...o })
const events = (at: number) => JSON.stringify([{ type: 4, timestamp: at, data: { href: `${ORIGIN}/en/a`, width: 800, height: 600 } }, { type: 2, timestamp: at + 10, data: { node: { type: 0, childNodes: [], id: 1 }, initialOffset: { left: 0, top: 0 } } }, { type: 3, timestamp: at + 2000, data: { source: 1, positions: [] } }])

function journey(): any {
	return {
		v: 1,
		session: {
			schema: TRAIL_SCHEMA,
			id: 'trs_in1',
			siteId: 'elsewhere',
			locale: 'en',
			startedAt: T,
			updatedAt: T + 12 * MIN,
			expiresAt: T + 24 * 60 * MIN,
			recordingState: 'stopped',
			bytes: 0,
			steps: [
				step('stp_in1', T, { asked: [{ id: 'ask_in1', at: T + 2 * MIN, lang: 'en', origin: 'voice', destinationId: 'd.flex', intent: 'info', route: 'replay', label: 'Flex' }] }),
				step('stp_in2', T + 5 * MIN, { navigationCause: { kind: 'destination', sourceDestinationId: 'd.flex', sourceStepId: 'stp_in1' } }),
				{ id: 'stp_in3', sessionId: 'trs_in1', type: 'boundary', boundary: 'unsaved', title: { en: 'Unsaved' }, enteredAt: T + 9 * MIN, durationMs: 0, navigationCause: { kind: 'destination' }, topDestinationIds: [], explored: [], replay: 'none' },
				step('stp_in4', T + 9 * MIN),
			],
		},
		chunks: { stp_in1: events(T + 1000) },
	}
}

let n = 0
const opts = (o: Partial<SeedOptions> = {}): SeedOptions => ({ now: NOW, origin: ORIGIN, siteId: 'site', retentionHours: 24, recordingState: 'recording', id: (p) => `${p}_new${++n}`, ...o })
const reason = async (j: unknown) => {
	const r = await checkSeed(j, opts())
	return r.ok ? 'ok' : r.reason
}
const edit = (f: (j: any) => void) => {
	const j = journey()
	f(j)
	return j
}

test('a valid sample journey: new ids everywhere, times end now in order, within the journey limit; the input is not changed (S15)', async () => {
	const input = journey()
	const before = structuredClone(input)
	const r = await checkSeed(input, opts())
	assert.equal(r.ok, true)
	if (!r.ok) return
	assert.deepEqual(input, before, 'the input is not changed')
	const all = JSON.stringify(r)
	for (const id of ['trs_in1', 'stp_in1', 'stp_in2', 'stp_in3', 'stp_in4', 'ask_in1']) assert.ok(!all.includes(id), `no input id ${id}`)
	const s = r.session
	assert.ok(parseSession(s), 'parses as a stored journey')
	assert.equal(s.siteId, 'site')
	assert.equal(s.steps.length, 4)
	assert.ok(s.steps.every((st) => st.sessionId === s.id))
	assert.deepEqual(s.steps.map((st) => st.title.en), ['Page 1', 'Page 2', 'Unsaved', 'Page 4'], 'order preserved')
	assert.equal(s.steps[1].navigationCause.kind, 'destination')
	assert.equal((s.steps[1].navigationCause as any).sourceStepId, s.steps[0].id, 'the cause points at the new id')
	assert.equal(s.steps[3].leftAt, NOW, 'the last step ends now')
	assert.equal(s.startedAt, NOW - 12 * MIN)
	assert.ok(s.steps.every((st, i) => !i || st.enteredAt >= s.steps[i - 1].enteredAt))
	assert.equal(s.steps[0].asked![0].at, NOW - 10 * MIN)
	assert.notEqual(s.steps[0].asked![0].id, 'ask_in1')
	assert.ok(s.expiresAt > NOW && s.updatedAt === NOW && s.recordingState === 'recording')
	assert.deepEqual(r.chunks.map((c) => c.stepId), [s.steps[0].id])
	assert.equal(r.chunks[0].events[0].timestamp, NOW - 12 * MIN + 1000, 'replay times moved with the journey')
	assert.ok(s.steps.every((st) => st.replay === 'none' && st.bytes === 0), 'replay and bytes are set when stored, never taken from the input')
})

test('a step without a replay is allowed and has no preview (S15)', async () => {
	const r = await checkSeed(edit((j) => delete j.chunks), opts())
	assert.equal(r.ok, true)
})

test('another version is refused (S15)', async () => {
	assert.equal(await reason(edit((j) => (j.v = 2))), 'version')
	assert.equal(await reason(edit((j) => delete j.v)), 'version')
})

test('malformed or unknown shapes are refused as a whole (S15)', async () => {
	const cases: [string, unknown][] = [
		['not an object', 'journey'],
		['null', null],
		['no session', edit((j) => delete j.session)],
		['another schema', edit((j) => (j.session.schema = 'vg-trail/v2'))],
		['no steps', edit((j) => (j.session.steps = []))],
		['a step missing its id', edit((j) => delete j.session.steps[1].id)],
		['an unknown top-level key', edit((j) => (j.extra = 1))],
		['an unknown session key', edit((j) => (j.session.owner = 'x'))],
		['an unknown step key', edit((j) => (j.session.steps[0].html = '<b>x</b>'))],
		['an unknown cause key', edit((j) => (j.session.steps[0].navigationCause.href = 'x'))],
		['an unknown cause kind', edit((j) => (j.session.steps[0].navigationCause.kind = 'magic'))],
		['an unknown explored key', edit((j) => (j.session.steps[0].explored[0].onclick = 'x'))],
		['a kind every object has', edit((j) => (j.session.steps[0].explored[0].kind = 'constructor'))],
		['a kind with markup', edit((j) => (j.session.steps[0].explored[0].kind = '<svg>'))],
		['an unknown reason', edit((j) => (j.session.steps[0].explored[0].reason = 'liked'))],
		['a title that is not text', edit((j) => (j.session.steps[0].title = { en: 5 }))],
		['a question that is not text', edit((j) => (j.session.steps[0].explored[0].questions.en[0].text = {}))],
		['a broken asked question', edit((j) => (j.session.steps[0].asked[0].origin = 'mind'))],
		['an unknown asked key', edit((j) => (j.session.steps[0].asked[0].words = 'my number'))],
		['a page of another site', edit((j) => (j.session.steps[1].canonicalPath = 'https://evil.example/en/x'))],
		['a path that is not a URL', edit((j) => (j.session.steps[1].canonicalPath = 'javascript:alert(1)'))],
		['a page step that says boundary', edit((j) => (j.session.steps[0].boundary = 'private'))],
		['a boundary with no kind', edit((j) => delete j.session.steps[2].boundary)],
		['an unknown replay state', edit((j) => (j.session.steps[0].replay = 'maybe'))],
		['a negative duration', edit((j) => (j.session.steps[0].durationMs = -1))],
		['an infinite time', edit((j) => (j.session.steps[0].enteredAt = Infinity))],
		['left before it was entered', edit((j) => (j.session.steps[0].leftAt = T - 1))],
		['steps out of order', edit((j) => j.session.steps.reverse())],
		['two steps with one id', edit((j) => (j.session.steps[1].id = 'stp_in1'))],
		['a replay for no step', edit((j) => (j.chunks.stp_nope = events(T)))],
		['a replay for a boundary', edit((j) => (j.chunks.stp_in3 = events(T)))],
		['a replay that is not text', edit((j) => (j.chunks.stp_in1 = [1, 2]))],
		['a replay that is not JSON', edit((j) => (j.chunks.stp_in1 = '[{"type":4,'))],
		['a replay that is not a list', edit((j) => (j.chunks.stp_in1 = '{"type":4}'))],
		['an empty replay', edit((j) => (j.chunks.stp_in1 = '[]'))],
		['a replay with an unknown event', edit((j) => (j.chunks.stp_in1 = JSON.stringify([{ type: 4, timestamp: T }, { type: 99, timestamp: T + 1 }])))],
		['a replay out of order', edit((j) => (j.chunks.stp_in1 = JSON.stringify([{ type: 4, timestamp: T + 5 }, { type: 3, timestamp: T }])))],
		['a function', edit((j) => (j.session.steps[0].explored[0].popular = () => true))],
		['a date', edit((j) => (j.session.steps[0].title = new Date()))],
		['a Blob replay', edit((j) => (j.chunks.stp_in1 = new Blob([events(T)])))],
	]
	for (const [why, j] of cases) assert.equal(await reason(j), 'invalid', why)
	// A getter that throws, and one that answers differently each time: copied once, or refused.
	const throwing = journey()
	Object.defineProperty(throwing.session, 'locale', { enumerable: true, get: () => { throw new Error('no') } })
	assert.equal(await reason(throwing), 'invalid', 'a throwing getter')
	const proxy = new Proxy(journey(), {})
	assert.equal(await reason(proxy), 'invalid', 'a proxy')
})

test('prototype-pollution shapes are refused and pollute nothing (S15)', async () => {
	const base = JSON.stringify(journey())
	const hostile = [
		base.replace('"locale":"en"', '"locale":"en","__proto__":{"polluted":"yes"}'),
		base.replace('"replay":"ok"', '"replay":"ok","constructor":{"prototype":{"polluted":"yes"}}'),
		base.replace('"title":{"en":"Flex bundles"}', '"title":{"en":"Flex bundles","__proto__":{"polluted":"yes"}}'),
		base.replace('"chunks":{', '"chunks":{"__proto__":"[]",'),
	]
	for (const h of hostile) assert.equal(await reason(JSON.parse(h)), 'invalid', h.slice(0, 0))
	assert.equal(await reason(edit((j) => (j.chunks.stp_in1 = `[{"type":4,"timestamp":${T},"data":{"__proto__":{"polluted":"yes"}}}]`))), 'invalid', 'inside a replay')
	assert.equal(({} as any).polluted, undefined)
	assert.equal((Object.prototype as any).polluted, undefined)
})

test('over a limit: steps, asked questions, string lengths, replay bytes, minutes (S15)', async () => {
	assert.equal(await reason(edit((j) => (j.session.steps = Array.from({ length: 21 }, (_, i) => step(`stp_${i}`, T + i * 1000))))), 'too-big', '21 steps')
	assert.equal(await reason(edit((j) => ((j.session.steps = Array.from({ length: 20 }, (_, i) => step(`stp_${i}`, T + i * 1000))), delete j.chunks))), 'ok', '20 steps')
	const asked = (k: number) => Array.from({ length: k }, (_, i) => ({ id: `a${i}`, at: T + i, lang: 'en', origin: 'typed', destinationId: 'd.flex', intent: 'info', route: 'replay' }))
	assert.equal(await reason(edit((j) => (j.session.steps[0].asked = asked(11)))), 'too-big', '11 asked on a step')
	assert.equal(await reason(edit((j) => (j.session.steps[0].asked = asked(10)))), 'ok', '10 asked')
	assert.equal(await reason(edit((j) => (j.session.steps[0].title.en = 'x'.repeat(SEED_MAX_STRING + 1)))), 'too-big', 'a long title')
	assert.equal(await reason(edit((j) => (j.session.steps[0].explored[0].questions.en[0].text = 'x'.repeat(SEED_MAX_STRING + 1)))), 'too-big', 'a long question')
	assert.equal(await reason(edit((j) => (j.session.steps[0].topDestinationIds = Array.from({ length: 51 }, () => 'd')))), 'too-big', 'a long list')
	const big = (bytes: number) => JSON.stringify([{ type: 4, timestamp: T, data: { pad: 'x'.repeat(bytes) } }])
	assert.equal(await reason(edit((j) => (j.chunks.stp_in1 = big(256 * 1024)))), 'too-big', 'a replay over 256 KB')
	assert.equal(await reason(edit((j) => (j.chunks.stp_in1 = big(200 * 1024)))), 'ok', 'a replay under 256 KB')
	assert.equal(await reason(edit((j) => (j.chunks.stp_in1 = JSON.stringify([{ type: 4, timestamp: T, data: { pad: 'é'.repeat(140 * 1024) } }])))), 'too-big', 'measured in UTF-8 bytes')
	assert.equal(await reason(edit((j) => (j.session.steps[3].leftAt = T + 30 * MIN))), 'too-long', 'a journey of 30 minutes')
	assert.equal(await reason(edit((j) => (j.session.steps[3].leftAt = T + 29 * MIN))), 'ok', '29 minutes')
	assert.equal(await reason(edit((j) => (j.session.steps[0].asked[0].at = T - 31 * MIN))), 'too-long', 'a question asked long before')
	assert.equal(await reason(edit((j) => (j.chunks.stp_in1 = JSON.stringify([{ type: 4, timestamp: T }, { type: 3, timestamp: T + 31 * MIN }])))), 'too-long', 'a replay of 31 minutes')
})
