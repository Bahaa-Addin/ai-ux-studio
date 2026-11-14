/**
 * stt.js (ADR-0055): listening through the gateway's speech-to-text (Whisper on Modal), an on-demand
 * chunk loaded only when the session says the gateway has it and the browser has no recognition (or
 * its recognition service failed). It gives the guide's Speech a second listener with the same
 * contract, and the guide its words around it (the notice before the first clip leaves the browser,
 * the switch after a `network` failure, "busy"; voice/stt-ui.ts), kept here for guide.js's budget.
 */
import { ApiError } from './api.ts'
import { type Recorder, ServerListener } from './voice/server-listen.ts'
import { routeSpeech, type SpeechLike, type SttGuide, type SttHooks, sttHooks } from './voice/stt-ui.ts'

interface GuideLike extends SttGuide {
	api: { base: string; siteKey: string }
	session: { sessionId: string }
	speech: SpeechLike
	stt: SttHooks | null
	/** The guide's microphone meter while it listens, if any. */
	micLevel(): number | undefined
}

const TYPES = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/webm', 'audio/mp4']

async function recorder(track: MediaStreamTrack | undefined): Promise<Recorder> {
	let own: MediaStream | null = null
	const stream = track ? new MediaStream([track]) : (own = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }))
	const mimeType = TYPES.find((t) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.(t))
	const mr = new MediaRecorder(stream, mimeType ? { mimeType, audioBitsPerSecond: 32_000 } : undefined)
	const parts: Blob[] = []
	let t0 = 0
	mr.ondataavailable = (e) => e.data.size && parts.push(e.data)
	const release = () => {
		for (const t of own?.getTracks() || []) t.stop()
	}
	return {
		start() {
			t0 = performance.now()
			mr.start(250)
		},
		stop() {
			return new Promise((resolve) => {
				if (mr.state === 'inactive') return resolve(null)
				mr.onstop = () => {
					release()
					resolve({ blob: new Blob(parts, { type: mr.mimeType || mimeType || 'audio/webm' }), ms: performance.now() - t0 })
				}
				mr.stop()
			})
		},
		abort() {
			mr.onstop = null
			if (mr.state !== 'inactive') mr.stop()
			release()
		},
	}
}

function start(g: GuideLike): void {
	if (g.stt) return
	const server = new ServerListener({
		recorder,
		level: () => g.micLevel() ?? 0,
		transcribe: async (audio, lang, ms) => {
			const q = `session=${encodeURIComponent(g.session.sessionId)}&lang=${encodeURIComponent(lang)}&ms=${Math.round(ms)}`
			const res = await fetch(`${g.api.base}/v1/stt?${q}`, { method: 'POST', headers: { 'Content-Type': audio.type || 'audio/webm', 'x-vg-site-key': g.api.siteKey }, body: audio })
			const json = await res.json().catch(() => ({}))
			if (!res.ok) throw new ApiError(res.status, json.error || res.statusText, json.code || 'error')
			return { text: String(json.text || '') }
		},
	})
	g.stt = sttHooks(g, routeSpeech(g.speech, server))
}

;(window as unknown as Record<string, unknown>).__vgStt = { start }
