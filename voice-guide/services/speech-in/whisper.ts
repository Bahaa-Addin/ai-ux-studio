/**
 * The gateway's speech-to-text (ADR-0055): one short clip of the person's voice to Whisper on Modal
 * (deploy/whisper/modal_app.py), the text back. Used only for browsers without speech recognition
 * (Firefox, some Brave setups), after the person has seen the notice. The clip is never stored or
 * logged here; the trace keeps its length and the text's length, never the text.
 *
 * POST <VG_WHISPER_URL>/transcribe?lang=ar|en, body: the audio as recorded (webm/ogg/mp4 Opus),
 * Authorization: Bearer <VG_WHISPER_TOKEN> → { text, language, duration }.
 */
import type { PlatformConfig } from '#shared/config.ts'
import { HttpError } from '#shared/http.ts'

export interface WhisperClient {
	readonly configured: boolean
	transcribe(audio: Buffer, contentType: string, lang: string): Promise<{ text: string; language?: string; duration?: number }>
}

const AUDIO = /^audio\/(webm|ogg|mp4|mpeg|wav|x-wav)(;.*)?$/i

export function createWhisperClient(platform: PlatformConfig, doFetch: typeof fetch = fetch): WhisperClient {
	const c = platform.stt
	let base: string | null = null
	if (c.url) {
		const u = new URL(c.url)
		const local = ['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname)
		if (u.protocol !== 'https:' && !local) throw new Error('VG_WHISPER_URL must be https (or http on this machine)')
		base = c.url.replace(/\/$/, '')
	}
	return {
		configured: !!base,
		async transcribe(audio, contentType, lang) {
			if (!base) throw new HttpError(503, 'speech-to-text is not configured', 'stt_off')
			if (!AUDIO.test(contentType)) throw new HttpError(415, 'not an audio clip', 'bad_audio')
			const res = await doFetch(`${base}/transcribe?lang=${encodeURIComponent(lang)}`, {
				method: 'POST',
				headers: { 'Content-Type': contentType, ...(c.token ? { Authorization: `Bearer ${c.token}` } : {}) },
				body: new Uint8Array(audio),
				signal: AbortSignal.timeout(c.timeoutMs),
				redirect: 'error',
			}).catch((e: Error) => {
				throw new HttpError(502, `speech-to-text unreachable (${e.name})`, 'stt_failed')
			})
			if (!res.ok) throw new HttpError(res.status === 429 ? 429 : 502, `speech-to-text answered ${res.status}`, res.status === 429 ? 'rate_limited' : 'stt_failed')
			const json = (await res.json().catch(() => ({}))) as { text?: unknown; language?: unknown; duration?: unknown }
			return { text: typeof json.text === 'string' ? json.text.trim().slice(0, 500) : '', language: typeof json.language === 'string' ? json.language : undefined, duration: typeof json.duration === 'number' ? json.duration : undefined }
		},
	}
}
