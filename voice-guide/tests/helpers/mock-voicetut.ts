/**
 * A stand-in for VoiceTut's Gradio API (ADR-0047), so the speech-out service is tested without
 * Modal: POST /gradio_api/call/{info|synthesize} → { event_id }; GET .../{id} streams a heartbeat,
 * then `complete` (or `error`) after `delayMs`; the synthesis result points at a WAV on the same host.
 * It validates the settings as VoiceTut's own API does (experiments/voicetut/local_api.py) and
 * records every request body and how many syntheses ran at once.
 */
import http from 'node:http'

export interface MockVoiceTut {
	url: string
	calls: { endpoint: 'info' | 'synthesize'; data: unknown[] }[]
	/** Each synthesis waits this long before completing (set it per test). */
	delayMs: number
	/** info waits this long (a cold start). */
	infoDelayMs: number
	/** The next N syntheses end in an error event. */
	failNext: number
	mock: boolean
	modelVersion: string
	/** Where the audio file says it is (to test the host check). Default: this server. */
	audioOrigin?: string
	/** The most syntheses running at the same time. */
	inFlightMax: number
	/** How long each WAV lasts (seconds of silence). */
	audioSeconds: number
	/** Serve a 9 MB body with no length header (chunked), to test the size cap. */
	oversizeAudio: boolean
	close(): Promise<void>
}

/** A short RIFF/WAVE (silence, 24 kHz, 16-bit mono). */
export function wavBytes(seconds = 0.2): Buffer {
	const rate = 24_000
	const data = Math.round(rate * seconds) * 2
	const b = Buffer.alloc(44 + data)
	b.write('RIFF', 0)
	b.writeUInt32LE(36 + data, 4)
	b.write('WAVE', 8)
	b.write('fmt ', 12)
	b.writeUInt32LE(16, 16)
	b.writeUInt16LE(1, 20)
	b.writeUInt16LE(1, 22)
	b.writeUInt32LE(rate, 24)
	b.writeUInt32LE(rate * 2, 28)
	b.writeUInt16LE(2, 32)
	b.writeUInt16LE(16, 34)
	b.write('data', 36)
	b.writeUInt32LE(data, 40)
	return b
}

export async function startMockVoiceTut(o: Partial<Pick<MockVoiceTut, 'delayMs' | 'infoDelayMs' | 'mock' | 'modelVersion'>> = {}): Promise<MockVoiceTut> {
	const jobs = new Map<string, { endpoint: 'info' | 'synthesize'; data: unknown[] }>()
	let seq = 0
	let inFlight = 0
	const m: MockVoiceTut = {
		url: '',
		calls: [],
		delayMs: o.delayMs ?? 20,
		infoDelayMs: o.infoDelayMs ?? 0,
		failNext: 0,
		mock: o.mock ?? false,
		modelVersion: o.modelVersion ?? 'VoiceTut stand-in · test001',
		inFlightMax: 0,
		audioSeconds: 0.2,
		oversizeAudio: false,
		close: async () => {},
	}
	const server = http.createServer(async (req, res) => {
		const url = new URL(req.url || '/', 'http://local')
		const call = /^\/gradio_api\/call\/(info|synthesize)$/.exec(url.pathname)
		if (req.method === 'POST' && call) {
			let raw = ''
			for await (const chunk of req) raw += chunk
			const body = JSON.parse(raw || '{}') as { data?: unknown[] }
			const endpoint = call[1] as 'info' | 'synthesize'
			const data = Array.isArray(body.data) ? body.data : []
			m.calls.push({ endpoint, data })
			const id = `job${++seq}`
			jobs.set(id, { endpoint, data })
			res.writeHead(200, { 'Content-Type': 'application/json' })
			return res.end(JSON.stringify({ event_id: id }))
		}
		const events = /^\/gradio_api\/call\/(info|synthesize)\/([\w-]+)$/.exec(url.pathname)
		if (req.method === 'GET' && events) {
			const job = jobs.get(events[2])
			if (!job) {
				res.writeHead(404)
				return res.end()
			}
			res.writeHead(200, { 'Content-Type': 'text/event-stream' })
			res.write('event: heartbeat\ndata: null\n\n')
			if (job.endpoint === 'info') {
				await new Promise((r) => setTimeout(r, m.infoDelayMs))
				const info = { mock: m.mock, model_version: m.modelVersion, sampling_rate: 24000, speakers: [{ speaker_id: 1, speaker_name: 'Mohammed', arabic_name: 'محمد', gender: 'male' }, { speaker_id: 2, speaker_name: 'Yasmin', arabic_name: 'ياسمين', gender: 'female' }] }
				return res.end(`event: complete\ndata: ${JSON.stringify([info])}\n\n`)
			}
			inFlight++
			m.inFlightMax = Math.max(m.inFlightMax, inFlight)
			await new Promise((r) => setTimeout(r, m.delayMs))
			inFlight--
			const [text, , mode, , , , steps, guidance, speed] = job.data as [string, string, string, string, null, string, number, number, number]
			// VoiceTut's own checks (local_api.py): anything else is an error event.
			if (m.failNext > 0 || !text || mode !== 'builtin' || ![16, 32, 48].includes(steps) || guidance !== 2 || ![0.85, 1, 1.15].includes(speed)) {
				if (m.failNext > 0) m.failNext--
				return res.end(`event: error\ndata: ${JSON.stringify('Choose the generation settings offered by the demo.')}\n\n`)
			}
			const origin = m.audioOrigin ?? m.url
			const file = { path: `/tmp/gradio/${events[2]}.wav`, url: `${origin}/gradio_api/file=/tmp/gradio/${events[2]}.wav`, meta: { _type: 'gradio.FileData' } }
			return res.end(`event: complete\ndata: ${JSON.stringify([file, { audio: m.audioSeconds, generation_seconds: 0.01 }])}\n\n`)
		}
		if (req.method === 'GET' && url.pathname.startsWith('/gradio_api/file=')) {
			if (m.oversizeAudio) {
				res.writeHead(200, { 'Content-Type': 'audio/wav' })
				const head = wavBytes(0.01)
				res.write(head)
				const chunk = Buffer.alloc(1024 * 1024)
				for (let i = 0; i < 9 && !res.destroyed; i++) await new Promise<void>((r) => res.write(chunk, () => r()))
				return res.end()
			}
			const wav = wavBytes(m.audioSeconds)
			res.writeHead(200, { 'Content-Type': 'audio/wav', 'Content-Length': String(wav.length) })
			return res.end(wav)
		}
		res.writeHead(404)
		res.end()
	})
	await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
	const { port } = server.address() as { port: number }
	m.url = `http://127.0.0.1:${port}`
	m.close = () => new Promise<void>((r) => server.close(() => r()))
	return m
}
