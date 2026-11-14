/**
 * The guide's side of the gateway's speech-to-text, now in stt.js (ADR-0055): which listener a press
 * uses (routeSpeech), the notice before the first clip (once per site key), the switch after a
 * `network` failure, and "busy". Fake Speech, launcher, storage and listener; no browser.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { type OtherListener, routeSpeech, type SpeechLike, STT_STRINGS, sttHooks } from '../../packages/sdk/src/voice/stt-ui.ts'

class FakeSpeech implements SpeechLike {
	canListen: boolean
	log: string[] = []
	#rec = false
	constructor(native: boolean) {
		this.canListen = native
	}
	get listening(): boolean {
		return this.#rec
	}
	async listen(_lang?: string, _h?: unknown) {
		this.stopListening()
		this.#rec = true
		this.log.push('native.listen')
		return { mode: 'own-capture' as const, onDevice: false }
	}
	stopListening() {
		this.#rec = false
		this.log.push('native.stop')
	}
	abortListening() {
		this.#rec = false
		this.log.push('native.abort')
	}
	cancelSpeech() {
		this.log.push('cancelSpeech')
	}
}

function fakeServer(log: string[]): OtherListener & { on: boolean } {
	return {
		on: false,
		get listening() {
			return this.on
		},
		async listen(_lang?: string, _h?: unknown) {
			this.on = true
			log.push('server.listen')
			return { mode: 'own-capture' as const, onDevice: false }
		},
		stop() {
			this.on = false
			log.push('server.stop')
		},
		abort() {
			this.on = false
			log.push('server.abort')
		},
	}
}

const H = { onUpdate() {}, onFinal() {}, onError() {}, onEnd() {} } as any

function fakeGuide(lang = 'en', voice = true) {
	const seen: string[] = []
	const v = {
		offer: (text: string, label: string, onTap: () => void) => {
			seen.push(`offer:${text}|${label}`)
			v.tap = onTap
		},
		setState: (state: string, message?: string) => void seen.push(`${state}:${message}`),
		tap: () => {},
	}
	const ui = { voice: voice ? v : null, note: (t: string) => void seen.push(`note:${t}`), open: () => void seen.push('open'), focusInput: () => void seen.push('focus') }
	return { g: { api: { siteKey: 'site-1' }, lang, ui }, seen, v }
}

function memStore() {
	const m = new Map<string, string>()
	return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m }
}

test('Firefox (no recognition): every press goes to the gateway; stop, abort and "listening" cover it', async () => {
	const sp = new FakeSpeech(false)
	const srv = fakeServer(sp.log)
	const route = routeSpeech(sp, srv)
	assert.equal(sp.canListen, true)
	assert.equal(route.server, true)
	await sp.listen('ar-EG', H)
	assert.equal(sp.listening, true)
	sp.stopListening()
	assert.equal(sp.listening, false)
	await sp.listen('ar-EG', H)
	sp.abortListening()
	assert.deepEqual(sp.log, ['native.stop', 'cancelSpeech', 'server.listen', 'server.stop', 'native.stop', 'native.stop', 'cancelSpeech', 'server.listen', 'server.abort', 'native.abort'])
})

test('a browser with recognition keeps it until prefer(), then the gateway', async () => {
	const sp = new FakeSpeech(true)
	const route = routeSpeech(sp, fakeServer(sp.log))
	assert.equal(route.server, false)
	await sp.listen('en-US', H)
	assert.deepEqual(sp.log.slice(-1), ['native.listen'])
	assert.equal(sp.listening, true, 'the native getter still answers')
	route.prefer()
	assert.equal(route.server, true)
	await sp.listen('en-US', H)
	assert.deepEqual(sp.log.slice(-1), ['server.listen'])
})

test('the notice comes once per site key before the first clip; agreeing presses again', () => {
	const { g, seen, v } = fakeGuide('ar')
	const store = memStore()
	const sp = new FakeSpeech(false)
	const hooks = sttHooks(g, routeSpeech(sp, fakeServer([])), store)
	let pressed = 0
	assert.equal(hooks.gate(() => pressed++), true)
	assert.deepEqual(seen, [`offer:${STT_STRINGS.notice.ar}|${STT_STRINGS.ok.ar}`])
	assert.equal(pressed, 0, 'nothing is recorded before the person agrees')
	v.tap()
	assert.equal(pressed, 1)
	assert.equal(store.m.get('vg-stt-notice:site-1'), '1')
	assert.equal(hooks.gate(() => pressed++), false, 'remembered')
})

test('no notice while the browser recognition is used; storage that throws shows the notice again', () => {
	const { g } = fakeGuide()
	const native = sttHooks(g, routeSpeech(new FakeSpeech(true), fakeServer([])), memStore())
	assert.equal(native.gate(() => {}), false)
	const broken = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } }
	let pressed = 0
	const { g: g2, v } = fakeGuide()
	const hooks = sttHooks(g2, routeSpeech(new FakeSpeech(false), fakeServer([])), broken)
	assert.equal(hooks.gate(() => pressed++), true)
	v.tap()
	assert.equal(pressed, 1, 'agreeing still works when storage is blocked')
})

test('without the voice launcher the notice is a note in the panel and listening goes ahead', () => {
	const { g, seen } = fakeGuide('en', false)
	let pressed = 0
	const hooks = sttHooks(g, routeSpeech(new FakeSpeech(false), fakeServer([])), memStore())
	assert.equal(hooks.gate(() => pressed++), true)
	assert.deepEqual(seen, [`note:${STT_STRINGS.notice.en}`])
	assert.equal(pressed, 1)
})

test('"network" from the browser recognition: the gateway next time, and the bar says press again', () => {
	const { g, seen } = fakeGuide('en')
	const route = routeSpeech(new FakeSpeech(true), fakeServer([]))
	const hooks = sttHooks(g, route, memStore())
	assert.equal(hooks.failed('network'), true)
	assert.equal(route.server, true)
	assert.deepEqual(seen, [`error:${STT_STRINGS.retry.en}`])
	assert.equal(hooks.failed('network'), false, "the gateway's own network failure is the guide's plain message")
	assert.equal(hooks.failed('no-speech'), false)
})

test('"server-busy": the bar says so and typing is offered; without the launcher, a note', () => {
	const { g, seen } = fakeGuide('ar')
	assert.equal(sttHooks(g, routeSpeech(new FakeSpeech(false), fakeServer([])), memStore()).failed('server-busy'), true)
	assert.deepEqual(seen, [`error:${STT_STRINGS.busy.ar}`, 'open', 'focus'])
	const { g: g2, seen: seen2 } = fakeGuide('en', false)
	assert.equal(sttHooks(g2, routeSpeech(new FakeSpeech(false), fakeServer([])), memStore()).failed('server-busy'), true)
	assert.deepEqual(seen2, [`note:${STT_STRINGS.busy.en}`, 'open', 'focus'])
})
