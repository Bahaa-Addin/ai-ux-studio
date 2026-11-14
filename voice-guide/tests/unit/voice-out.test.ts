/**
 * The guide's voice in the page (ADR-0047 §3–§5), with fakes for the gateway, the audio player and
 * the browser voice: sentences play in order, the first sentence has `firstAudioMs` to be ready or
 * the browser voice says the line, a failure or a blocked play falls back from that sentence on, a
 * press of the microphone stops everything and nothing late speaks after it, and a line with
 * personal data is never sent.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { maskContent } from '../../packages/sdk/src/agent-mask.ts'
import { type SpeechReply, VoiceOut } from '../../packages/sdk/src/voice/out.ts'
import { type AudioLike, AudioPlayer } from '../../packages/sdk/src/voice/player.ts'
import { XrayModel } from '../../packages/sdk/src/xray.ts'

interface Rig {
	vo: VoiceOut
	asked: string[]
	played: string[]
	spoken: string[]
	reports: Record<string, unknown>[]
	resolve(text: string, reply: SpeechReply): void
	playError: Error | null
	stops: number
}

/** Requests stay pending until the test answers them; time is real but short. */
function rig(o: { firstAudioMs?: number; isPrivate?: (t: string) => boolean; autoReply?: (text: string, n: number) => SpeechReply | null; playMs?: number } = {}): Rig {
	const pending = new Map<string, ((r: SpeechReply) => void)[]>()
	const counts = new Map<string, number>()
	const r: Rig = {
		vo: null as unknown as VoiceOut,
		asked: [],
		played: [],
		spoken: [],
		reports: [],
		playError: null,
		stops: 0,
		resolve(text, reply) {
			for (const f of pending.get(text) ?? []) f(reply)
			pending.delete(text)
		},
	}
	let stopPlay: ((e: Error) => void) | null = null
	r.vo = new VoiceOut({
		request: (text) => {
			r.asked.push(text)
			const n = (counts.get(text) ?? 0) + 1
			counts.set(text, n)
			const auto = o.autoReply?.(text, n)
			if (auto) return Promise.resolve(auto)
			return new Promise((res) => pending.set(text, [...(pending.get(text) ?? []), res]))
		},
		player: {
			play: (url) =>
				new Promise((res, rej) => {
					if (r.playError) return rej(r.playError)
					stopPlay = rej
					r.played.push(url)
					setTimeout(res, o.playMs ?? 5)
				}),
			stop: () => {
				r.stops++
				stopPlay?.(Object.assign(new Error('stopped'), { name: 'AbortError' }))
			},
		},
		fallback: {
			speak: async (text) => void r.spoken.push(text),
			cancel: () => {},
			speaking: false,
		},
		firstAudioMs: o.firstAudioMs ?? 60,
		isPrivate: o.isPrivate,
		report: (attrs) => void r.reports.push(attrs),
	})
	return r
}

const ready = (text: string): SpeechReply => ({ url: `/a/${encodeURIComponent(text)}`, ready: true })
const LINE = 'Taking you to the bundles now. The cheapest one is first on the page.'
const [S1, S2] = ['Taking you to the bundles now.', 'The cheapest one is first on the page.']

test('every sentence is asked at once, and they play in order', async () => {
	const r = rig()
	const speaking = r.vo.speak(LINE, 'en-US')
	await new Promise((res) => setTimeout(res, 5))
	assert.deepEqual(r.asked, [S1, S2], 'both asked before either reply came back')
	r.resolve(S2, ready(S2))
	r.resolve(S1, ready(S1))
	await speaking
	assert.deepEqual(r.asked, [S1, S2])
	assert.deepEqual(r.played, [ready(S1).url, ready(S2).url])
	assert.deepEqual(r.spoken, [])
	assert.equal(r.reports.at(-1)?.fallback, null)
	assert.equal(r.reports.at(-1)?.played, 2)
})

test('the first sentence not ready within firstAudioMs: the browser voice says the whole line', async () => {
	const r = rig({ firstAudioMs: 40 })
	const t0 = Date.now()
	await r.vo.speak(LINE, 'en-US')
	assert.ok(Date.now() - t0 < 200)
	assert.deepEqual(r.spoken, [`${S1} ${S2}`])
	assert.deepEqual(r.played, [])
	assert.equal(r.reports.at(-1)?.fallback, 'budget')
})

test('VoiceTut failing on a later sentence: the browser voice takes over from that sentence', async () => {
	const r = rig({ autoReply: (t) => (t === S1 ? ready(t) : { url: null, ready: false, reason: 'error' }) })
	await r.vo.speak(LINE, 'en-US')
	assert.deepEqual(r.played, [ready(S1).url])
	assert.deepEqual(r.spoken, [S2])
	assert.equal(r.reports.at(-1)?.fallback, 'error')
})

test('a later sentence not ready at first is asked again when its turn comes', async () => {
	const r = rig({ autoReply: (t, n) => (t === S1 || n > 1 ? ready(t) : { url: null, ready: false, reason: 'budget' }) })
	await r.vo.speak(LINE, 'en-US')
	assert.deepEqual(r.played, [ready(S1).url, ready(S2).url])
	assert.deepEqual(r.asked, [S1, S2, S2])
	assert.deepEqual(r.spoken, [])
})

test('the browser will not play (autoplay blocked): the browser voice says it', async () => {
	const r = rig({ autoReply: (t) => ready(t) })
	r.playError = Object.assign(new Error('not allowed'), { name: 'NotAllowedError' })
	await r.vo.speak(LINE, 'en-US')
	assert.deepEqual(r.spoken, [`${S1} ${S2}`])
	assert.equal(r.reports.at(-1)?.fallback, 'blocked')
})

test('the microphone pressed while waiting: nothing plays and nothing speaks, even when the reply comes', async () => {
	const r = rig({ firstAudioMs: 200 })
	const speaking = r.vo.speak(LINE, 'en-US')
	await new Promise((res) => setTimeout(res, 10))
	r.vo.cancel()
	r.resolve(S1, ready(S1))
	r.resolve(S2, ready(S2))
	await speaking
	await new Promise((res) => setTimeout(res, 250))
	assert.deepEqual(r.played, [])
	assert.deepEqual(r.spoken, [], 'no late fallback after the press')
})

test('the microphone pressed while playing: the audio stops and the rest is not said', async () => {
	const r = rig({ autoReply: (t) => ready(t), playMs: 200 })
	const speaking = r.vo.speak(LINE, 'en-US')
	await new Promise((res) => setTimeout(res, 1))
	assert.equal(r.vo.speaking, true)
	const stopsBefore = r.stops
	r.vo.cancel()
	await speaking
	assert.equal(r.stops, stopsBefore + 1, 'the player was stopped')
	assert.equal(r.vo.speaking, false)
	assert.deepEqual(r.played, [ready(S1).url], 'the second sentence never started')
	assert.deepEqual(r.spoken, [])
})

test('a new line replaces the one being said', async () => {
	const r = rig({ firstAudioMs: 200 })
	const first = r.vo.speak(LINE, 'en-US')
	const second = r.vo.speak('Here is the Vodafone Cash page for you.', 'en-US')
	r.resolve(S1, ready(S1))
	r.resolve('Here is the Vodafone Cash page for you.', ready('Here is the Vodafone Cash page for you.'))
	await Promise.all([first, second])
	assert.deepEqual(r.played, [ready('Here is the Vodafone Cash page for you.').url])
})

const realRules = (t: string) => {
	let hit = false
	maskContent(t, () => (hit = true))
	return hit
}

test('a line with personal data is never sent: the browser voice says it, and the report says why without the words', async () => {
	const r = rig({ isPrivate: realRules, autoReply: (t) => ready(t) })
	await r.vo.speak('Your line 01012345678 is ready.', 'en-US')
	assert.deepEqual(r.asked, [])
	assert.deepEqual(r.spoken, ['Your line 01012345678 is ready.'])
	assert.equal(r.reports.at(-1)?.fallback, 'private')
	assert.doesNotMatch(JSON.stringify(r.reports), /01012345678|Your line/)
})

test('Arabic prices in Arabic-Indic digits are not personal data: VoiceTut says them', async () => {
	const r = rig({ isPrivate: realRules, autoReply: (t) => ready(t) })
	const line = 'أرخص واحدة فليكس ١٠٠: ٥٠ جيجا بـ ٢٥٠ جنيه.'
	await r.vo.speak(line, 'ar-EG')
	assert.deepEqual(r.asked, [line])
	assert.deepEqual(r.spoken, [])
})

test('personal data broken over lines is caught on the line as one: nothing is sent', async () => {
	const r = rig({ isPrivate: realRules, autoReply: (t) => ready(t) })
	// Cut at its line breaks, no sentence holds the whole card number; the normalised line does.
	await r.vo.speak('Card\n4111\n1111\n1111\n1111 is on file.', 'en-US')
	assert.deepEqual(r.asked, [])
	assert.equal(r.reports.at(-1)?.fallback, 'private')
})

test('personal data that only stands alone once a long line is cut is caught on the sentence as sent', async () => {
	const r = rig({ isPrivate: realRules, autoReply: (t) => ready(t) })
	// 400 characters with no space are cut hard, right before the number: whole, a letter sits in front of it
	// (no rule matches); as the sentence sent, it stands alone and the phone rule matches.
	const line = `${'x'.repeat(400)}01012345678`
	assert.equal(realRules(line), false)
	await r.vo.speak(line, 'en-US')
	assert.deepEqual(r.asked, [])
	assert.equal(r.reports.at(-1)?.fallback, 'private')
})

test('the report never carries the words', async () => {
	const r = rig({ autoReply: (t) => (t === S1 ? ready(t) : { url: null, ready: false, reason: 'error' }) })
	await r.vo.speak(LINE, 'en-US')
	assert.doesNotMatch(JSON.stringify(r.reports), /bundles|cheapest/)
})

test('the first sentence answered "not ready": the browser voice says the line at once', async () => {
	const r = rig({ firstAudioMs: 2000, autoReply: () => ({ url: null, ready: false, reason: 'budget' }) })
	const t0 = Date.now()
	await r.vo.speak(LINE, 'en-US')
	assert.ok(Date.now() - t0 < 200, 'no waiting out the budget once the gateway has answered')
	assert.deepEqual(r.spoken, [`${S1} ${S2}`])
	assert.equal(r.reports.at(-1)?.fallback, 'budget')
})

test('speaking stays true while the next sentence\'s audio is on its way', async () => {
	const r = rig({ firstAudioMs: 500 })
	const speaking = r.vo.speak(LINE, 'en-US')
	await new Promise((res) => setTimeout(res, 20))
	assert.equal(r.vo.speaking, true, 'waiting for the first audio is speaking')
	r.resolve(S1, ready(S1))
	await new Promise((res) => setTimeout(res, 30))
	assert.equal(r.vo.speaking, true, 'between sentences too')
	r.resolve(S2, ready(S2))
	await speaking
	assert.equal(r.vo.speaking, false)
})

/** A stand-in audio element: play() stays pending until the test settles it, like a browser can. */
function fakeAudio() {
	const plays: { resolve(): void; reject(e: Error): void }[] = []
	const el: AudioLike & { plays: typeof plays } = {
		plays,
		src: '',
		preload: '',
		paused: true,
		onended: null,
		onerror: null,
		play() {
			el.paused = false
			return new Promise<void>((resolve, reject) => plays.push({ resolve, reject }))
		},
		pause() {
			el.paused = true
		},
		load() {},
		removeAttribute(name: string) {
			if (name === 'src') el.src = ''
		},
	}
	return el
}

test('the player: ended resolves, stop rejects at once, and a late rejection from an earlier play cannot end the next one', async () => {
	const el = fakeAudio()
	const p = new AudioPlayer(() => el)
	const first = p.play('/a.wav')
	el.plays[0].resolve()
	el.onended!()
	await first
	const second = p.play('/b.wav')
	p.stop()
	await assert.rejects(second, (e: Error) => e.name === 'AbortError')
	assert.equal(el.paused, true)
	assert.equal(el.src, '')
	const third = p.play('/c.wav')
	let settled = false
	void third.then(() => (settled = true), () => (settled = true))
	// The browser now rejects the play() that stop() interrupted; it must not touch the third play.
	el.plays[1].reject(Object.assign(new Error('interrupted'), { name: 'AbortError' }))
	await new Promise((res) => setTimeout(res, 10))
	assert.equal(settled, false, 'the third play is still playing')
	el.onended!()
	await third
})

test('the X-ray shows each line\'s voice, timings and fallbacks, never its words', () => {
	const x = new XrayModel()
	const ev = (seq: number, name: string, attrs: Record<string, unknown>, durationMs?: number) => x.add({ seq, turnId: 'turn_1', name, service: 'sdk', at: '', attrs, durationMs })
	ev(1, 'turn.received', { utterance: 'cheapest bundle' })
	ev(2, 'speech.prepare', { sentences: 3, queued: 2, cached: 1 })
	ev(3, 'speech.synth', { hash: 'abc', chars: 31, lane: 'ahead', kept: 'disk' }, 2900)
	ev(4, 'sdk.speak', { engine: 'voicetut', sentences: 2, played: 2, fallback: null, firstAudioMs: 140 }, 4100)
	ev(5, 'sdk.speak', { engine: 'voicetut', sentences: 1, played: 0, fallback: 'budget', firstAudioMs: null }, 2500)
	ev(6, 'sdk.speak', { engine: 'voicetut', sentences: 1, played: 0, fallback: 'private', firstAudioMs: null }, 1)
	const rows = x.view().turns[0].events.filter((e) => e.layer === 'speak')
	assert.equal(rows.length, 5)
	assert.match(rows[0].detail, /made ahead: 3 sentence\(s\), 1 already cached/)
	assert.match(rows[1].detail, /VoiceTut · 31 chars · ahead · kept in disk/)
	assert.match(rows[2].detail, /^VoiceTut · 2\/2 sentences · first audio 140 ms · reply text → VoiceTut \(Modal\)/)
	assert.equal(rows[3].kind, 'err', 'a fallback is marked')
	assert.match(rows[3].detail, /browser voice \(budget\)/)
	assert.match(rows[4].detail, /not sent \(personal data\)/)
	assert.equal(rows[4].kind, '', 'keeping personal data back is not an error')
})

test('autoplay blocked with a "tap to hear" hook: the rest of the line waits for the tap, the browser voice stays quiet (ADR-0053 §4)', async () => {
	const held: { text: string; tag: string }[] = []
	const spoken: string[] = []
	const vo = new VoiceOut({
		request: async (text) => ready(text),
		player: { play: () => Promise.reject(Object.assign(new Error('not allowed'), { name: 'NotAllowedError' })), stop: () => {} },
		fallback: { speak: async (t) => void spoken.push(t), cancel: () => {}, speaking: false },
		firstAudioMs: 60,
		onBlocked: (text, tag) => void held.push({ text, tag }),
	})
	await vo.speak(LINE, 'en-US')
	assert.deepEqual(held, [{ text: `${S1} ${S2}`, tag: 'en-US' }])
	assert.deepEqual(spoken, [])
})
