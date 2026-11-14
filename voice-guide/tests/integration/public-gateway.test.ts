/**
 * A public gateway (ADR-0053) over HTTP with real Postgres: sessions hide X-ray and page watch,
 * speech-to-text (ADR-0055) goes to Whisper (a local stand-in) and never logs the words, clips are
 * size- and rate-limited, and the trusted proxy header is the client address.
 */
import assert from 'node:assert/strict'
import http from 'node:http'
import { after, before, test } from 'node:test'

import { startPlatform, type TestPlatform } from '../helpers/platform.ts'

const ORIGIN = 'http://localhost:4401'
const KEY = 'pk_demo_telco'
let p: TestPlatform
let whisper: http.Server
const heard: { lang: string | null; type: string | undefined; bytes: number; auth: string | undefined }[] = []

before(async () => {
	whisper = http.createServer((req, res) => {
		const chunks: Buffer[] = []
		req.on('data', (c) => chunks.push(c))
		req.on('end', () => {
			const u = new URL(req.url || '/', 'http://x')
			heard.push({ lang: u.searchParams.get('lang'), type: req.headers['content-type'], bytes: Buffer.concat(chunks).length, auth: req.headers.authorization })
			res.writeHead(200, { 'Content-Type': 'application/json' })
			res.end(JSON.stringify({ text: ' عايز أرخص باقة نت ', language: 'ar', duration: 2.4 }))
		})
	})
	await new Promise<void>((r) => whisper.listen(4493, '127.0.0.1', () => r()))
	p = await startPlatform({
		port: 4492,
		env: {
			VG_PUBLIC: 'on',
			VG_PUBLIC_URL: 'https://guide.example.com',
			VG_CLIENT_IP_HEADER: 'fly-client-ip',
			VG_WHISPER_URL: 'http://127.0.0.1:4493',
			VG_WHISPER_TOKEN: 'w-token',
			VG_STT_PER_SESSION_PER_HOUR: '3',
			VG_STT_MAX_BYTES: '4096',
		},
	})
})
after(async () => {
	await p?.close()
	await new Promise((r) => whisper?.close(r))
})

const call = async (path: string, body: unknown, headers: Record<string, string> = {}) => {
	const res = await fetch(`${p.url}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-vg-site-key': KEY, Origin: ORIGIN, ...headers }, body: JSON.stringify(body) })
	return { status: res.status, body: (await res.json().catch(() => ({}))) as any }
}
const clip = (sessionId: string, bytes = 1200, headers: Record<string, string> = {}) =>
	fetch(`${p.url}/v1/stt?session=${sessionId}&lang=ar&ms=2400`, { method: 'POST', headers: { 'Content-Type': 'audio/webm;codecs=opus', 'x-vg-site-key': KEY, Origin: ORIGIN, ...headers }, body: new Uint8Array(bytes) }).then(async (r) => ({ status: r.status, body: (await r.json().catch(() => ({}))) as any }))

test('a public session hides X-ray and page watch, and says the gateway can listen', async () => {
	const s = (await call('/v1/session', { lang: 'ar', page: { url: `${ORIGIN}/ar/index.html` } })).body
	assert.equal(s.site.ui.xray, 'off')
	assert.equal(s.site.watch.enabled, false)
	assert.equal(s.push, null)
	assert.equal(s.site.speech.server, true)
})

test('a clip goes to Whisper with its type and token; the text comes back; the trace has lengths, never words', async () => {
	const s = (await call('/v1/session', { lang: 'ar', page: { url: `${ORIGIN}/ar/index.html` } })).body
	const r = await clip(s.sessionId)
	assert.equal(r.status, 200, JSON.stringify(r.body))
	assert.equal(r.body.text, 'عايز أرخص باقة نت')
	assert.deepEqual(heard.at(-1), { lang: 'ar', type: 'audio/webm;codecs=opus', bytes: 1200, auth: 'Bearer w-token' })
	const trace = await p.store.listTrace(s.sessionId)
	const ev = trace.find((e) => e.name === 'stt.done')
	assert.ok(ev, 'traced')
	assert.equal(ev!.attrs.chars, 17)
	assert.ok(!JSON.stringify(trace).includes('باقة'), 'the words are not in the trace')
})

test('clips are limited: too large, not audio, no session, too many per session', async () => {
	const s = (await call('/v1/session', { lang: 'ar', page: { url: `${ORIGIN}/ar/index.html` } })).body
	assert.equal((await clip(s.sessionId, 5000)).status, 413)
	const notAudio = await fetch(`${p.url}/v1/stt?session=${s.sessionId}&lang=ar`, { method: 'POST', headers: { 'Content-Type': 'text/plain', 'x-vg-site-key': KEY, Origin: ORIGIN }, body: 'x'.repeat(500) })
	assert.equal(notAudio.status, 415)
	assert.notEqual((await clip('ses_nope')).status, 200)
	const other = (await call('/v1/session', { lang: 'ar', page: { url: `${ORIGIN}/ar/index.html` } })).body
	const codes: number[] = []
	for (let i = 0; i < 6; i++) codes.push((await clip(other.sessionId, 1200, { 'fly-client-ip': `9.9.9.${i}` })).status)
	assert.ok(codes.includes(429), `per-session cap: ${codes.join(',')}`)
})
