/**
 * The VoiceTut client (ADR-0047 §1): Egyptian Arabic and English text to speech behind a Gradio
 * API with two calls, `info` and `synthesize`. Ported from experiments/voicetut and the clone's
 * client (experiences/src/voicetut/client.js), server side: the endpoint comes only from
 * VG_VOICETUT_URL, never from the page or the repository.
 *
 * A call is POST /gradio_api/call/<endpoint> → { event_id }, then GET .../<endpoint>/<event_id>, a
 * stream of server-sent events ending in `complete` (the result) or `error`. A synthesis returns a
 * file URL on the same host; the WAV is downloaded at once (Gradio clears its files).
 */

const ENDPOINTS = ['info', 'synthesize'] as const
const MAX_WAV_BYTES = 8 * 1024 * 1024
const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])

/** HTTPS, or HTTP on this machine only; no path, credentials, query or fragment. */
export function voiceTutBase(raw: string): string {
	let url: URL
	try {
		url = new URL(raw.trim())
	} catch {
		throw new Error('VG_VOICETUT_URL is not a valid URL')
	}
	const loopback = LOOPBACK.has(url.hostname.toLowerCase())
	if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
		throw new Error('VG_VOICETUT_URL must be an HTTPS origin (or HTTP on this machine), without a path or credentials')
	}
	return url.origin
}

export function parseEvent(block: string): { event?: string; data: string } {
	const lines = block.replace(/\r/g, '').split('\n')
	const event = lines.find((l) => l.startsWith('event:'))?.slice(6).trim()
	const data = lines
		.filter((l) => l.startsWith('data:'))
		.map((l) => l.slice(5).trimStart())
		.join('\n')
	return { event, data }
}

const errorText = (data: string): string => {
	let message = data.trim()
	try {
		const detail = JSON.parse(data)
		if (typeof detail === 'string') message = detail
		else if (detail && typeof detail === 'object') {
			const c = detail.message ?? detail.error ?? detail.detail
			message = typeof c === 'string' ? c : typeof c?.message === 'string' ? c.message : ''
		} else message = ''
	} catch {}
	return message.slice(0, 400) || 'VoiceTut returned an error without details'
}

/** Reads a Gradio event stream to its `complete` result; heartbeats are skipped, `error` throws. */
export async function readResult(body: ReadableStream<Uint8Array>): Promise<unknown> {
	const reader = body.getReader()
	const decoder = new TextDecoder()
	let pending = ''
	try {
		while (true) {
			const { value, done } = await reader.read()
			pending += decoder.decode(value, { stream: !done }).replace(/\r/g, '')
			let boundary: number
			while ((boundary = pending.indexOf('\n\n')) !== -1) {
				const { event, data } = parseEvent(pending.slice(0, boundary))
				pending = pending.slice(boundary + 2)
				if (event === 'error') throw new Error(errorText(data))
				if (event === 'complete') return JSON.parse(data)
			}
			if (done) throw new Error('VoiceTut closed the connection before returning a result')
		}
	} finally {
		await reader.cancel().catch(() => {})
		reader.releaseLock()
	}
}

/** The audio file's URL, which must be on the configured host. */
export function audioUrl(file: unknown, base: string): string {
	const u = (file as { url?: unknown } | null)?.url
	if (typeof u !== 'string' || !u) throw new Error('VoiceTut returned no audio URL')
	const url = new URL(u, `${base}/`)
	if (url.origin !== base) throw new Error('VoiceTut returned audio from an unexpected host')
	return url.href
}

export interface VoiceTutInfo {
	mock: boolean
	modelVersion: string
	samplingRate: number
	voices: string[]
}

/** VoiceTut's accepted settings (its Gradio API refuses anything else). */
export type Steps = 16 | 32 | 48
export type Speed = 0.85 | 1 | 1.15

export interface SynthesisRequest {
	text: string
	/** VoiceTut's language: `arz` for Egyptian Arabic and mixed lines, `en` for English. */
	mode: string
	voice: string
	steps: Steps
	speed: Speed
	normalize: boolean
}

export interface Synthesis {
	wav: Buffer
	audioSeconds: number
	generationSeconds: number
	ms: number
}

/** Reads a body up to `max` bytes, stopping as soon as it goes past (a missing or false length header included). */
async function readCapped(body: ReadableStream<Uint8Array> | null, max: number): Promise<Buffer> {
	if (!body) throw new Error('VoiceTut audio is empty')
	const reader = body.getReader()
	const parts: Uint8Array[] = []
	let total = 0
	try {
		while (true) {
			const { value, done } = await reader.read()
			if (done) break
			total += value.length
			if (total > max) throw new Error('VoiceTut audio is too large')
			parts.push(value)
		}
	} finally {
		await reader.cancel().catch(() => {})
		reader.releaseLock()
	}
	return Buffer.concat(parts)
}

const isWav = (b: Buffer) => b.length > 44 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WAVE'

export class VoiceTut {
	readonly base: string
	#fetch: typeof fetch
	#infoTimeoutMs: number
	#synthTimeoutMs: number

	constructor(o: { url: string; fetchImpl?: typeof fetch; infoTimeoutMs?: number; synthTimeoutMs?: number }) {
		this.base = voiceTutBase(o.url)
		this.#fetch = o.fetchImpl || fetch
		this.#infoTimeoutMs = o.infoTimeoutMs ?? 300_000
		this.#synthTimeoutMs = o.synthTimeoutMs ?? 120_000
	}

	async #call(endpoint: (typeof ENDPOINTS)[number], data: unknown[], timeoutMs: number): Promise<unknown> {
		const signal = AbortSignal.timeout(timeoutMs)
		// No redirects anywhere: the reply text goes to the configured host and nowhere else.
		const res = await this.#fetch(`${this.base}/gradio_api/call/${endpoint}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data }), signal, redirect: 'error' })
		if (!res.ok) throw new Error(`VoiceTut ${endpoint} failed (${res.status}): the service may be starting, unavailable or at its limit`)
		const { event_id: id } = (await res.json()) as { event_id?: unknown }
		if (typeof id !== 'string' || !/^[\w-]+$/.test(id)) throw new Error('VoiceTut answered without a valid job id')
		const events = await this.#fetch(`${this.base}/gradio_api/call/${endpoint}/${id}`, { signal, redirect: 'error' })
		if (!events.ok || !events.body) throw new Error(`VoiceTut result unavailable (${events.status})`)
		return readResult(events.body as ReadableStream<Uint8Array>)
	}

	/** Wakes the model and reads its voices and version. A mock model is refused. */
	async info(): Promise<VoiceTutInfo> {
		const out = (await this.#call('info', [], this.#infoTimeoutMs)) as unknown[]
		const i = (Array.isArray(out) ? out[0] : out) as { mock?: unknown; model_version?: unknown; sampling_rate?: unknown; speakers?: { speaker_name?: unknown }[] } | null
		if (!i || typeof i !== 'object') throw new Error('VoiceTut info returned nothing')
		if (i.mock === true) throw new Error('VoiceTut is running in mock mode')
		const voices = (Array.isArray(i.speakers) ? i.speakers : []).map((s) => s?.speaker_name).filter((n): n is string => typeof n === 'string')
		if (!voices.length) throw new Error('VoiceTut lists no voices')
		return { mock: false, modelVersion: String(i.model_version || 'unknown'), samplingRate: Number(i.sampling_rate) || 24_000, voices }
	}

	/** One line to a WAV. Only the line and the settings are sent. */
	async synthesize(r: SynthesisRequest): Promise<Synthesis> {
		const t0 = performance.now()
		const out = (await this.#call('synthesize', [r.text, r.mode, 'builtin', r.voice, null, '', r.steps, 2.0, r.speed, r.normalize], this.#synthTimeoutMs)) as unknown[]
		const [file, stats] = Array.isArray(out) ? out : []
		// No redirects: the audio must come from the configured host, not wherever a reply points.
		const res = await this.#fetch(audioUrl(file, this.base), { signal: AbortSignal.timeout(30_000), redirect: 'error' })
		if (!res.ok) throw new Error(`VoiceTut audio unavailable (${res.status})`)
		if (Number(res.headers.get('content-length')) > MAX_WAV_BYTES) throw new Error('VoiceTut audio is too large')
		const wav = await readCapped(res.body as ReadableStream<Uint8Array> | null, MAX_WAV_BYTES)
		if (!isWav(wav)) throw new Error('VoiceTut audio is not a WAV file')
		const s = (stats || {}) as { audio?: unknown; audio_seconds?: unknown; generation_seconds?: unknown }
		return { wav, audioSeconds: Number(s.audio ?? s.audio_seconds) || 0, generationSeconds: Number(s.generation_seconds) || 0, ms: Math.round(performance.now() - t0) }
	}
}
