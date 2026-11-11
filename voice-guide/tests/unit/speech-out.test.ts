/**
 * The guide's voice, server side (ADR-0047): the VoiceTut client, sentences, the cache key, the
 * queue, the cache, and the speech-out service against a stand-in VoiceTut. What matters most here:
 * only the reply text and VoiceTut's settings are sent; a cached sentence never calls VoiceTut; a slow
 * one answers within its budget and is cached for next time; only lines known ahead reach the disk;
 * traces never hold text.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'

import { knownLines, type Plan } from '#kb'
import { loadPlatformConfig, loadSiteConfig, ROOT, type SiteConfig } from '#shared/config.ts'
import type { RpcContext } from '#shared/rpc.ts'
import type { Tracer } from '#shared/trace.ts'

import { canonicalSpeech, splitSentences } from '../../packages/sdk/src/voice/sentences.ts'
import { SpeechCache, speechKey } from '../../services/speech-out/cache.ts'
import { createSpeechOut } from '../../services/speech-out/handlers.ts'
import { SynthQueue } from '../../services/speech-out/queue.ts'
import { audioUrl, parseEvent, readResult, voiceTutBase } from '../../services/speech-out/voicetut.ts'
import { type MockVoiceTut, startMockVoiceTut, wavBytes } from '../helpers/mock-voicetut.ts'

const ctx: RpcContext = { trace: { traceId: 't'.repeat(32), spanId: 's'.repeat(16), siteId: 'vodafone-eg', sessionId: 'ses_test' } as RpcContext['trace'] }

const stream = (...parts: string[]) =>
	new ReadableStream<Uint8Array>({
		start(c) {
			for (const p of parts) c.enqueue(new TextEncoder().encode(p))
			c.close()
		},
	})

test('VoiceTut address: HTTPS origin, or HTTP on this machine only', () => {
	assert.equal(voiceTutBase('https://example.modal.run/'), 'https://example.modal.run')
	assert.equal(voiceTutBase('http://127.0.0.1:7860'), 'http://127.0.0.1:7860')
	for (const bad of ['http://example.com', 'https://u:p@example.com', 'https://example.com/path', 'https://example.com/?x=1', 'not a url']) assert.throws(() => voiceTutBase(bad), bad)
})

test('the Gradio event stream: heartbeat skipped, result across chunk boundaries, errors and early close', async () => {
	assert.deepEqual(parseEvent('event: complete\ndata: [1]'), { event: 'complete', data: '[1]' })
	assert.deepEqual(await readResult(stream('event: heartbeat\ndata: null\n\nevent: comp', 'lete\ndata: [{"a":', '1}]\n\n')), [{ a: 1 }])
	await assert.rejects(readResult(stream('event: error\ndata: "Choose the generation settings offered by the demo."\n\n')), /generation settings/)
	await assert.rejects(readResult(stream('event: heartbeat\ndata: null\n\n')), /closed the connection/)
	assert.equal(audioUrl({ url: '/gradio_api/file=/tmp/a.wav' }, 'https://v.example'), 'https://v.example/gradio_api/file=/tmp/a.wav')
	assert.throws(() => audioUrl({ url: 'https://elsewhere.example/a.wav' }, 'https://v.example'), /unexpected host/)
	assert.throws(() => audioUrl({}, 'https://v.example'), /no audio URL/)
})

test('sentences: cut after a full stop or ؟, numbers stay whole, short pieces join, long ones are cut', () => {
	assert.deepEqual(splitSentences('The cheapest bundle is 1.5 GB for EGP 1,250.50. Shall I open it? Press subscribe.'), ['The cheapest bundle is 1.5 GB for EGP 1,250.50.', 'Shall I open it?', 'Press subscribe.'])
	assert.deepEqual(splitSentences('أرخص باقة هي باقة الإنترنت الشهرية. تحب أفتحها لك؟ دوس اشترك وأنا هوقف هنا.'), ['أرخص باقة هي باقة الإنترنت الشهرية.', 'تحب أفتحها لك؟', 'دوس اشترك وأنا هوقف هنا.'])
	assert.deepEqual(splitSentences('OK. Here is the Vodafone Cash page.'), ['OK. Here is the Vodafone Cash page.'])
	const long = Array.from({ length: 60 }, (_, i) => `word${i}`).join(' ')
	const cut = splitSentences(long, 100)
	assert.ok(cut.length > 1 && cut.every((s) => s.length <= 100), 'cut at spaces under the cap')
	assert.equal(cut.join(' '), long, 'nothing lost, order kept')
	assert.deepEqual(splitSentences('   '), [])
	assert.equal(canonicalSpeech(' a\n  b '), 'a b')
})

test('the cache key changes with every setting and the text, not with spacing or Unicode form', () => {
	const base = { engine: 'voicetut' as const, modelVersion: 'v1', voice: 'Mohammed', mode: 'arz', steps: 16, speed: 1, normalize: true, guidance: 2, text: 'باقة الإنترنت' }
	const k = speechKey(base)
	assert.match(k, /^[a-f0-9]{64}$/)
	assert.equal(speechKey({ ...base, text: '  باقة   الإنترنت ' }), k)
	assert.equal(speechKey({ ...base, text: base.text.normalize('NFD') }), k)
	for (const change of [{ modelVersion: 'v2' }, { voice: 'Yasmin' }, { mode: 'en' }, { steps: 32 }, { speed: 1.15 }, { normalize: false }, { text: 'باقة' }]) assert.notEqual(speechKey({ ...base, ...change }), k, JSON.stringify(change))
})

test('known lines: the plan\'s own words, never a value read on the page', () => {
	const plan = {
		v: 1,
		turnId: 't',
		lang: 'en',
		say: 'Taking you to the bundles.',
		steps: [
			{ op: 'navigate', url: 'https://x/b' },
			{ op: 'spotlight', target: { css: ['#a'] }, read: { kind: 'text' } },
			{ op: 'say', text: 'Here they are.' },
			{ op: 'confirm', target: { css: ['#b'] }, message: 'Press subscribe yourself.' },
			{ op: 'ask', question: 'Which one?', options: [] },
		],
		meta: { intent: 'navigate', route: 'replay' },
	} as unknown as Plan
	assert.deepEqual(knownLines(plan), ['Taking you to the bundles.', 'Here they are.', 'Press subscribe yourself.', 'Which one?'])
})

test('the queue runs one job at a time: now before ahead before warm, never the same job twice', async () => {
	const q = new SynthQueue()
	const order: string[] = []
	let running = 0
	let most = 0
	const job = (name: string) => async () => {
		running++
		most = Math.max(most, running)
		await new Promise((r) => setTimeout(r, 5))
		order.push(name)
		running--
	}
	const first = q.enqueue('a', job('a'), 'ahead')
	const runs: Promise<void>[] = [first, q.enqueue('w', job('w'), 'warm'), q.enqueue('b', job('b'), 'ahead'), q.enqueue('n', job('n'), 'now')]
	runs.push(q.enqueue('b', job('b-again'), 'ahead'))
	runs.push(q.enqueue('w', job('w-again'), 'now'))
	await Promise.all(runs)
	assert.equal(most, 1, 'never two at once')
	// All were queued in one tick, before the first ran: w moved up to now (queued before n), then ahead in order.
	assert.deepEqual(order, ['w', 'n', 'a', 'b'])
	q.close()
	await assert.rejects(q.enqueue('x', job('x'), 'now'), /closed/)
})

test('the cache: known lines on disk without their text; anything else in memory only', () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vg-speech-'))
	try {
		const c = new SpeechCache(path.join(dir, 'speech'), { memoryMax: 2 })
		const meta = { chars: 5, mode: 'en', voice: 'Mohammed', modelVersion: 'v1', ms: 10, audioSeconds: 0.2, at: 'now' }
		const [h1, h2, h3, h4] = ['1', '2', '3', '4'].map((x) => x.repeat(64))
		c.write(h1, wavBytes(), meta, true)
		assert.ok(fs.existsSync(path.join(dir, 'speech', `${h1}.wav`)))
		assert.doesNotMatch(fs.readFileSync(path.join(dir, 'speech', `${h1}.json`), 'utf8'), /text/)
		c.write(h2, wavBytes(), meta, false)
		c.write(h3, wavBytes(), meta, false)
		c.write(h4, wavBytes(), meta, false)
		assert.deepEqual(fs.readdirSync(path.join(dir, 'speech')).sort(), [`${h1}.json`, `${h1}.wav`], 'memory-only lines never touch the disk')
		assert.equal(c.has(h2), false, 'the oldest memory entry gives way')
		assert.ok(c.has(h3) && c.has(h4) && c.has(h1))
		assert.equal(c.read('../../etc/passwd'), null)
		c.setModelVersion('v9')
		assert.equal(new SpeechCache(path.join(dir, 'speech')).modelVersion(), 'v9')
	} finally {
		fs.rmSync(dir, { recursive: true, force: true })
	}
})

test('the site config takes only VoiceTut\'s own settings; the engine is the browser\'s unless a site asks', () => {
	const site = loadSiteConfig(path.join(ROOT, 'config/sites/demo-telco.yaml'))
	assert.equal(site.speech.out.engine, 'system')
	assert.equal(site.speech.out.firstAudioMs, 2500)
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vg-site-'))
	try {
		const src = fs.readFileSync(path.join(ROOT, 'config/sites/demo-telco.yaml'), 'utf8').replace(/^speech:/m, 'speech:\n  out: { engine: voicetut, steps: 20 }')
		fs.writeFileSync(path.join(dir, 'bad.yaml'), src)
		assert.throws(() => loadSiteConfig(path.join(dir, 'bad.yaml')), 'steps 20 is not one of VoiceTut\'s')
	} finally {
		fs.rmSync(dir, { recursive: true, force: true })
	}
})

// ---- the service against a stand-in VoiceTut ----

let vt: MockVoiceTut
let dataDir: string
const events: { name: string; attrs: Record<string, unknown> }[] = []
const tracer = { event: async (_c: unknown, name: string, attrs: Record<string, unknown> = {}) => void events.push({ name, attrs }) } as unknown as Tracer
const vodafone = loadSiteConfig(path.join(ROOT, 'config/sites/vodafone-eg.yaml'))
const withEngine = (engine: 'voicetut' | 'system'): Map<string, SiteConfig> => new Map([[vodafone.id, { ...vodafone, speech: { ...vodafone.speech, out: { ...vodafone.speech.out, engine } } }]])

const service = (o: { url?: string | null; engine?: 'voicetut' | 'system'; dir?: string } = {}) =>
	createSpeechOut({
		platform: loadPlatformConfig({ VG_VOICETUT_URL: o.url === null ? '' : (o.url ?? vt.url), VG_DATA_DIR: o.dir ?? dataDir } as NodeJS.ProcessEnv),
		sites: withEngine(o.engine ?? 'voicetut'),
		tracer,
	})

before(async () => {
	vt = await startMockVoiceTut()
})
after(async () => {
	await vt?.close()
})

const fresh = () => {
	dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vg-speech-svc-'))
	vt.calls.length = 0
	vt.delayMs = 20
	vt.infoDelayMs = 0
	vt.failNext = 0
	vt.mock = false
	vt.inFlightMax = 0
	vt.audioOrigin = undefined
	vt.oversizeAudio = false
	vt.modelVersion = 'VoiceTut stand-in · test001'
	events.length = 0
}

test('off: the system engine, or no VoiceTut address, calls nothing', async () => {
	fresh()
	for (const s of [service({ engine: 'system' }), service({ url: null })]) {
		const r = await s.speak({ siteId: vodafone.id, lang: 'en', text: 'Hello there, here are the bundles.' }, ctx)
		assert.equal(r.reason, 'off')
		assert.equal(r.engine, 'system')
		assert.deepEqual(await s.prepare({ siteId: vodafone.id, lang: 'en', lines: ['Hello there.'] }, ctx), { queued: 0, cached: 0, skipped: 'off' })
		await s.close()
	}
	assert.equal(vt.calls.length, 0)
	assert.equal(fs.existsSync(path.join(dataDir, 'speech')), false, 'no cache folder either')
})

test('a sentence: one info, one synthesis with only the text and VoiceTut\'s settings; the next time from the cache', async () => {
	fresh()
	const s = service()
	const text = 'Here are the mobile internet bundles.'
	const a = await s.speak({ siteId: vodafone.id, lang: 'en', text, waitMs: 3000 }, ctx)
	assert.equal(a.ready, true, JSON.stringify(a))
	assert.equal(a.cached, false)
	assert.deepEqual(
		vt.calls.map((c) => c.endpoint),
		['info', 'synthesize'],
	)
	assert.deepEqual(vt.calls[0].data, [], 'info sends nothing')
	assert.deepEqual(vt.calls[1].data, [text, 'en', 'builtin', 'Mohammed', null, '', 16, 2, 1, true], 'the text and the settings, nothing else')
	const b = await s.speak({ siteId: vodafone.id, lang: 'en', text: `  ${text} ` }, ctx)
	assert.equal(b.cached, true)
	assert.equal(b.hash, a.hash)
	assert.equal(vt.calls.length, 2, 'a cached sentence calls nothing')
	const audio = await s.audio({ hash: a.hash! })
	assert.ok('base64' in audio && Buffer.from(audio.base64, 'base64').toString('ascii', 0, 4) === 'RIFF')
	const ar = await s.speak({ siteId: vodafone.id, lang: 'ar', text: 'دي باقات الإنترنت للموبايل.', waitMs: 3000 }, ctx)
	assert.equal(ar.ready, true)
	assert.equal(vt.calls.at(-1)!.data[1], 'arz', 'Arabic in VoiceTut\'s Egyptian mode')
	await s.close()
})

test('slow: the page gets "not ready" within its wait, the synthesis goes on and the next ask is cached', async () => {
	fresh()
	const s = service()
	await s.speak({ siteId: vodafone.id, lang: 'en', text: 'Warm up the model version first.', waitMs: 3000 }, ctx)
	vt.delayMs = 600
	const t0 = Date.now()
	const r = await s.speak({ siteId: vodafone.id, lang: 'en', text: 'This one takes its time.', waitMs: 150 }, ctx)
	assert.ok(Date.now() - t0 < 450, `answered in ${Date.now() - t0} ms`)
	assert.equal(r.ready, false)
	assert.equal(r.reason, 'budget')
	await s.drain({}, ctx)
	const again = await s.speak({ siteId: vodafone.id, lang: 'en', text: 'This one takes its time.' }, ctx)
	assert.equal(again.cached, true)
	await s.close()
})

test('errors: reported as such, nothing cached; a mock model is refused', async () => {
	fresh()
	let s = service()
	await s.speak({ siteId: vodafone.id, lang: 'en', text: 'Warm up the model version first.', waitMs: 3000 }, ctx)
	vt.failNext = 1
	const r = await s.speak({ siteId: vodafone.id, lang: 'en', text: 'This line fails once.', waitMs: 3000 }, ctx)
	assert.equal(r.reason, 'error')
	assert.equal(r.ready, false)
	assert.equal((await s.speak({ siteId: vodafone.id, lang: 'en', text: 'This line fails once.', waitMs: 3000 }, ctx)).ready, true, 'tried again, not cached as a failure')
	await s.close()
	fresh()
	vt.mock = true
	s = service()
	const m = await s.speak({ siteId: vodafone.id, lang: 'en', text: 'A mock model is not a voice.', waitMs: 3000 }, ctx)
	assert.equal(m.reason, 'error')
	assert.ok(vt.calls.every((c) => c.endpoint === 'info'), 'no synthesis from a mock model')
	await s.close()
})

test('prepare: a plan\'s lines made ahead, one at a time, first sentences first, kept on disk; other lines in memory only; traces without text', async () => {
	fresh()
	const s = service()
	const lines = ['Taking you to the bundles. They are on the next page.', 'Here they are, the cheapest one first.', 'Press subscribe yourself; I will stop here.']
	const out = await s.prepare({ siteId: vodafone.id, lang: 'en', lines }, ctx)
	assert.equal(out.queued, 4, 'four sentences')
	await s.drain({}, ctx)
	const synth = vt.calls.filter((c) => c.endpoint === 'synthesize').map((c) => c.data[0])
	assert.deepEqual(synth, ['Taking you to the bundles.', 'Here they are, the cheapest one first.', 'Press subscribe yourself; I will stop here.', 'They are on the next page.'], 'first sentences first')
	assert.equal(vt.inFlightMax, 1, 'one synthesis at a time')
	const files = fs.readdirSync(path.join(dataDir, 'speech'))
	assert.equal(files.filter((f) => f.endsWith('.wav')).length, 4)
	const cached = await s.speak({ siteId: vodafone.id, lang: 'en', text: 'Here they are, the cheapest one first.' }, ctx)
	assert.equal(cached.cached, true, 'made ahead, ready when the page asks')
	const price = 'The cheapest bundle costs EGP 25 a month.'
	const live = await s.speak({ siteId: vodafone.id, lang: 'en', text: price, waitMs: 3000 }, ctx)
	assert.equal(live.ready, true)
	assert.equal(fs.readdirSync(path.join(dataDir, 'speech')).filter((f) => f.endsWith('.wav')).length, 4, 'a line read on the page is never written to disk')
	const traced = JSON.stringify(events)
	for (const l of [...lines, price]) for (const piece of splitSentences(l)) assert.ok(!traced.includes(piece), `no text in traces: ${piece}`)
	assert.ok(events.some((e) => e.name === 'speech.prepare') && events.some((e) => e.name === 'speech.synth'))
	await s.close()
})

test('cold start: while VoiceTut wakes, the page gets "not ready" within its wait; once awake the line is made', async () => {
	fresh()
	vt.infoDelayMs = 600
	const s = service()
	const t0 = Date.now()
	const r = await s.speak({ siteId: vodafone.id, lang: 'en', text: 'The first line after a scale-down.', waitMs: 150 }, ctx)
	assert.ok(Date.now() - t0 < 450, `answered in ${Date.now() - t0} ms`)
	assert.deepEqual([r.ready, r.reason], [false, 'budget'])
	vt.infoDelayMs = 0
	await new Promise((res) => setTimeout(res, 700))
	const again = await s.speak({ siteId: vodafone.id, lang: 'en', text: 'The first line after a scale-down.', waitMs: 3000 }, ctx)
	assert.equal(again.ready, true)
	assert.equal(vt.calls.filter((c) => c.endpoint === 'info').length, 1, 'one wake-up, shared')
	await s.close()
})

test('audio from another host is refused', async () => {
	fresh()
	const s = service()
	vt.audioOrigin = 'http://127.0.0.2:9'
	try {
		const r = await s.speak({ siteId: vodafone.id, lang: 'en', text: 'Audio that lives elsewhere.', waitMs: 3000 }, ctx)
		assert.equal(r.reason, 'error')
		assert.match(String((await s.status({}, ctx)).lastError), /unexpected host/, 'refused by the host check, not by a failed download')
	} finally {
		vt.audioOrigin = undefined
		await s.close()
	}
})

test('prepare again: what is already made counts as cached, nothing is made twice', async () => {
	fresh()
	const s = service()
	const lines = ['Taking you to the bundles. They are on the next page.']
	await s.prepare({ siteId: vodafone.id, lang: 'en', lines }, ctx)
	await s.drain({}, ctx)
	const made = vt.calls.length
	assert.deepEqual(await s.prepare({ siteId: vodafone.id, lang: 'en', lines }, ctx), { queued: 0, cached: 2 })
	await s.drain({}, ctx)
	assert.equal(vt.calls.length, made)
	await s.close()
})

test('the page\'s sentence goes before lines made ahead; past a backed-up queue the browser voice speaks', async () => {
	fresh()
	const s = service()
	await s.speak({ siteId: vodafone.id, lang: 'en', text: 'Warm up the model version first.', waitMs: 3000 }, ctx)
	vt.delayMs = 120
	const ahead = Array.from({ length: 10 }, (_, i) => `Line number ${i + 1} of the plan, made ahead.`)
	await s.prepare({ siteId: vodafone.id, lang: 'en', lines: ahead }, ctx)
	await new Promise((res) => setTimeout(res, 20))
	const busy = await s.speak({ siteId: vodafone.id, lang: 'en', text: 'The page asks for this one now.', waitMs: 50 }, ctx)
	assert.deepEqual([busy.ready, busy.reason], [false, 'budget'], 'ten waiting: refused at once, not queued')
	await s.drain({}, ctx)
	vt.calls.length = 0
	await s.prepare({ siteId: vodafone.id, lang: 'en', lines: ahead.map((l) => l.replace('plan', 'next plan')).slice(0, 4) }, ctx)
	await new Promise((res) => setTimeout(res, 20))
	const now = s.speak({ siteId: vodafone.id, lang: 'en', text: 'The page asks for this one now.', waitMs: 3000 }, ctx)
	assert.equal((await now).ready, true)
	await s.drain({}, ctx)
	const order = vt.calls.filter((c) => c.endpoint === 'synthesize').map((c) => c.data[0])
	assert.ok(order.indexOf('The page asks for this one now.') < order.length - 1, `the page's sentence before the rest of the plan: ${JSON.stringify(order)}`)
	await s.close()
})

test('a new model: refresh adopts its version, so lines are made again in its voice; a mock model found later is refused', async () => {
	fresh()
	let s = service()
	const text = 'The same line in a new voice.'
	await s.speak({ siteId: vodafone.id, lang: 'en', text, waitMs: 3000 }, ctx)
	vt.modelVersion = 'VoiceTut stand-in · test002'
	assert.equal((await s.refresh({}, ctx)).modelVersion, 'VoiceTut stand-in · test002')
	const again = await s.speak({ siteId: vodafone.id, lang: 'en', text, waitMs: 3000 }, ctx)
	assert.deepEqual([again.ready, again.cached], [true, false], 'a new key, made again')
	await s.close()
	vt.mock = true
	s = service()
	await s.speak({ siteId: vodafone.id, lang: 'en', text, waitMs: 3000 }, ctx)
	await new Promise((res) => setTimeout(res, 100))
	const off = await s.speak({ siteId: vodafone.id, lang: 'en', text: 'Never from a mock model.', waitMs: 3000 }, ctx)
	assert.equal(off.reason, 'off', 'the background check found a mock model')
	vt.modelVersion = 'VoiceTut stand-in · test001'
	await s.close()
})

test('speech:warm fails loudly when VoiceTut does not answer', async () => {
	const { spawnSync } = await import('node:child_process')
	const r = spawnSync(process.execPath, ['tools/speech-warm.ts', '--limit', '2'], { cwd: ROOT, env: { ...process.env, VG_VOICETUT_URL: 'http://127.0.0.1:9', VG_DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'vg-warm-')), VG_STORE: 'memory' }, encoding: 'utf8', timeout: 60_000 })
	assert.equal(r.status, 1, r.stdout + r.stderr)
	assert.match(r.stderr, /VoiceTut did not answer/)
})

test('audio over 8 MB is refused while it downloads, even without a length header', async () => {
	fresh()
	const s = service()
	vt.oversizeAudio = true
	try {
		const r = await s.speak({ siteId: vodafone.id, lang: 'en', text: 'A suspiciously long answer.', waitMs: 3000 }, ctx)
		assert.equal(r.reason, 'error')
		assert.match(String((await s.status({}, ctx)).lastError), /too large/)
	} finally {
		vt.oversizeAudio = false
		await s.close()
	}
})

test('a version from an earlier run: a new synthesis waits for VoiceTut\'s answer, so a mock model makes nothing', async () => {
	fresh()
	let s = service()
	await s.speak({ siteId: vodafone.id, lang: 'en', text: 'Remember this model version.', waitMs: 3000 }, ctx)
	await s.close()
	vt.mock = true
	vt.infoDelayMs = 150
	s = service()
	const before = vt.calls.filter((c) => c.endpoint === 'synthesize').length
	const r = await s.speak({ siteId: vodafone.id, lang: 'en', text: 'A new line, right after a restart.', waitMs: 3000 }, ctx)
	assert.notEqual(r.ready, true)
	assert.equal(vt.calls.filter((c) => c.endpoint === 'synthesize').length, before, 'nothing made by a mock model')
	assert.equal(fs.readdirSync(path.join(dataDir, 'speech')).filter((f) => f.endsWith('.wav')).length, 0, 'nothing on disk (the earlier line was not prepared, so it was only ever in memory)')
	await s.close()
})

test('a sentence already queued is joined and moved up, even when the queue is full', async () => {
	fresh()
	const s = service()
	await s.speak({ siteId: vodafone.id, lang: 'en', text: 'Warm up the model version first.', waitMs: 3000 }, ctx)
	vt.delayMs = 40
	const ahead = Array.from({ length: 10 }, (_, i) => `Queued line number ${i + 1}, made ahead.`)
	await s.prepare({ siteId: vodafone.id, lang: 'en', lines: ahead }, ctx)
	await new Promise((res) => setTimeout(res, 20))
	const r = await s.speak({ siteId: vodafone.id, lang: 'en', text: 'Queued line number 10, made ahead.', waitMs: 3000 }, ctx)
	assert.equal(r.ready, true, 'joined, not refused')
	await s.drain({}, ctx)
	const order = vt.calls.filter((c) => c.endpoint === 'synthesize').map((c) => c.data[0]).filter((t) => String(t).startsWith('Queued line'))
	assert.equal(order.length, 10, 'each made once')
	assert.ok(order.indexOf('Queued line number 10, made ahead.') < 3, `moved up past the rest: ${JSON.stringify(order)}`)
	await s.close()
})
