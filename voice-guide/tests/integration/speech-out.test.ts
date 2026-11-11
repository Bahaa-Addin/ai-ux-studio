/**
 * The guide's voice through the gateway (ADR-0047), with real Postgres and a stand-in VoiceTut:
 * the session says which engine speaks (VoiceTut only when the site asks and VG_VOICETUT_URL is set);
 * a turn's plan is made ahead without slowing the turn; the page's POST /v1/speech finds it ready
 * and GET /v1/speech/<hash>.wav serves it from the page's own origin; VoiceTut never sees the
 * person's words or the session.
 */
import assert from 'node:assert/strict'
import path from 'node:path'
import { after, before, test } from 'node:test'

import { knownLines } from '#kb'
import { loadSites, ROOT, type SiteConfig } from '#shared/config.ts'

import { splitSentences } from '../../packages/sdk/src/voice/sentences.ts'

import { type MockVoiceTut, startMockVoiceTut } from '../helpers/mock-voicetut.ts'
import { startPlatform, type TestPlatform } from '../helpers/platform.ts'

const ORIGIN = 'http://localhost:4401'
const KEY = 'pk_demo_telco'
let p: TestPlatform
let vt: MockVoiceTut

const sites = () => {
	const all = loadSites(path.join(ROOT, 'config/sites'))
	const telco = all.get('demo-telco')!
	all.set('demo-telco', { ...telco, speech: { ...telco.speech, out: { ...telco.speech.out, engine: 'voicetut' } } } as SiteConfig)
	return all
}

before(async () => {
	vt = await startMockVoiceTut({ delayMs: 15 })
	p = await startPlatform({ port: 4498, env: { VG_VOICETUT_URL: vt.url, VG_RATE_TURNS_PER_MIN: '600', VG_RATE_BURST: '40' }, options: { sites: sites() } })
})
after(async () => {
	await p?.close()
	await vt?.close()
})

async function call(path: string, body?: unknown) {
	const res = await fetch(`${p.url}${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', 'x-vg-site-key': KEY, Origin: ORIGIN }, body: body === undefined ? undefined : JSON.stringify(body) })
	return { status: res.status, body: (await res.json().catch(() => ({}))) as any }
}

test('the session tells the page VoiceTut speaks, and how long to wait for it', async () => {
	const s = (await call('/v1/session', { lang: 'ar', page: { url: `${ORIGIN}/ar/index.html` } })).body
	assert.deepEqual(s.site.speech.out, { engine: 'voicetut', firstAudioMs: 2500 })
	assert.equal(s.site.speech.out.voice, undefined, 'VoiceTut\'s settings stay on the server')
})

test('a turn\'s own words are made ahead; the page then finds them ready and plays them from its own origin', async () => {
	const s = (await call('/v1/session', { lang: 'en', page: { url: `${ORIGIN}/en/index.html` } })).body
	vt.calls.length = 0
	const utterance = 'coverage'
	const turn = (await call('/v1/turn', { sessionId: s.sessionId, utterance, page: { url: `${ORIGIN}/en/index.html` } })).body
	const lines = knownLines(turn.plan)
	assert.ok(lines.length, `the plan has words of its own: ${JSON.stringify(turn.plan)}`)
	await p.services.speechOut.drain({}, { trace: { traceId: 'a'.repeat(32), spanId: 'b'.repeat(16) } as never })
	const sent = JSON.stringify(vt.calls)
	assert.ok(vt.calls.some((c) => c.endpoint === 'synthesize'), 'made ahead')
	assert.ok(!sent.includes(utterance) && !sent.includes(s.sessionId), 'VoiceTut never sees the person\'s words or the session')
	const first = (await call('/v1/speech', { sessionId: s.sessionId, text: splitSentences(lines[0])[0], lang: 'en-US' })).body
	assert.equal(first.ready, true, JSON.stringify(first))
	assert.equal(first.cached, true, 'ready before the page asked')
	assert.match(first.url, /^\/v1\/speech\/[a-f0-9]{64}\.wav$/)
	const audio = await fetch(`${p.url}${first.url}?k=${KEY}`)
	assert.equal(audio.status, 200)
	assert.equal(audio.headers.get('content-type'), 'audio/wav')
	assert.equal(Buffer.from(await audio.arrayBuffer()).toString('ascii', 0, 4), 'RIFF')
	assert.equal((await fetch(`${p.url}${first.url}`)).status, 401, 'the site key is required')
	assert.equal((await fetch(`${p.url}/v1/speech/${'0'.repeat(64)}.wav?k=${KEY}`)).status, 404)
	assert.equal((await fetch(`${p.url}/v1/speech/..%2F..%2Fetc.wav?k=${KEY}`)).status, 404)
})

test('a separate speech-out service (VG_SPEECH_OUT_URL) is enough for the page to use VoiceTut', async () => {
	const q = await startPlatform({ port: 4487, env: { VG_VOICETUT_URL: '', VG_SPEECH_OUT_URL: 'http://127.0.0.1:4415' }, options: { sites: sites() } })
	try {
		const res = await fetch(`${q.url}/v1/session`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-vg-site-key': KEY, Origin: ORIGIN }, body: JSON.stringify({ lang: 'ar', page: { url: `${ORIGIN}/ar/index.html` } }) })
		assert.equal(((await res.json()) as any).site.speech.out.engine, 'voicetut')
	} finally {
		await q.close()
	}
})

test('without VG_VOICETUT_URL the browser voice speaks, whatever the site asks', async () => {
	const q = await startPlatform({ port: 4499, env: { VG_VOICETUT_URL: '' }, options: { sites: sites() } })
	try {
		const res = await fetch(`${q.url}/v1/session`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-vg-site-key': KEY, Origin: ORIGIN }, body: JSON.stringify({ lang: 'ar', page: { url: `${ORIGIN}/ar/index.html` } }) })
		assert.equal(((await res.json()) as any).site.speech.out.engine, 'system')
		const r = await fetch(`${q.url}/v1/speech`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-vg-site-key': KEY, Origin: ORIGIN }, body: JSON.stringify({ sessionId: 'x', text: 'مرحبا', lang: 'ar' }) })
		assert.equal(((await r.json()) as any).reason, 'off')
	} finally {
		await q.close()
	}
})
