/**
 * Listening through the gateway (ADR-0055) with a fake recorder, meter and clock: a clip ends on a
 * pause after speech, on a second press, or at the cap; silence sends nothing; a cancel sends
 * nothing; the text comes back as one final result; a busy service says so.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { MAX_MS, NOTHING_MS, QUIET_MS, ServerListener } from '../../packages/sdk/src/voice/server-listen.ts'

function rig(o: { text?: string; fail?: { code: string } } = {}) {
	let t = 0
	let level = 0
	let tick: (() => void) | null = null
	const sent: { lang: string; ms: number }[] = []
	const events: string[] = []
	let aborted = 0
	const l = new ServerListener({
		recorder: async () => ({
			start: () => events.push('start'),
			stop: async () => ({ blob: new Blob(['x'.repeat(500)], { type: 'audio/webm' }), ms: t }),
			abort: () => void aborted++,
		}),
		transcribe: async (_b, lang, ms) => {
			sent.push({ lang, ms })
			if (o.fail) throw o.fail
			return { text: o.text ?? 'عايز باقة نت' }
		},
		level: () => level,
		now: () => t,
		every: (fn) => {
			tick = fn
			return () => (tick = null)
		},
	})
	const done = new Promise<{ final?: string; error?: string; ended?: boolean }>((resolve) => {
		void l.listen('ar-EG', {
			onFinal: (text) => resolve({ final: text }),
			onError: (code) => resolve({ error: code }),
			onEnd: () => resolve({ ended: true }),
			onSpeechStart: () => events.push('speech'),
		})
	})
	const advance = async (ms: number, lv: number) => {
		await new Promise((r) => setImmediate(r))
		for (let i = 0; i < ms / 100; i++) {
			t += 100
			level = lv
			tick?.()
		}
	}
	return { l, done, advance, sent, events, aborted: () => aborted }
}

test('speech, then a pause: the clip is sent and its text comes back as the final result', async () => {
	const r = rig()
	await r.advance(800, 0.5)
	await r.advance(QUIET_MS + 100, 0.02)
	assert.deepEqual(await r.done, { final: 'عايز باقة نت' })
	assert.equal(r.sent.length, 1)
	assert.equal(r.sent[0].lang, 'ar-EG')
	assert.deepEqual(r.events, ['start', 'speech'])
})

test('nothing said: no clip leaves the browser', async () => {
	const r = rig()
	await r.advance(NOTHING_MS + 100, 0.01)
	assert.deepEqual(await r.done, { error: 'no-speech' })
	assert.equal(r.sent.length, 0)
})

test('a second press sends at once; a cancel sends nothing', async () => {
	const a = rig()
	await a.advance(500, 0.5)
	a.l.stop()
	assert.deepEqual(await a.done, { final: 'عايز باقة نت' })
	const b = rig()
	await b.advance(500, 0.5)
	b.l.abort()
	assert.deepEqual(await b.done, { ended: true })
	assert.equal(b.sent.length, 0)
	assert.equal(b.aborted(), 1)
})

test('talking past the cap: the clip ends at MAX_MS', async () => {
	const r = rig()
	await r.advance(MAX_MS + 200, 0.5)
	const out = await r.done
	assert.ok(out.final)
	assert.ok(r.sent[0].ms <= MAX_MS + 100)
})

test('a busy service says so; an empty transcript is "no speech"', async () => {
	const busy = rig({ fail: { code: 'rate_limited' } })
	await busy.advance(500, 0.5)
	busy.l.stop()
	assert.deepEqual(await busy.done, { error: 'server-busy' })
	const empty = rig({ text: '  ' })
	await empty.advance(500, 0.5)
	empty.l.stop()
	assert.deepEqual(await empty.done, { error: 'no-speech' })
})
