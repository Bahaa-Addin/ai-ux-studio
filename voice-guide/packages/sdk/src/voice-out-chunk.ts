/**
 * voice-out.js (ADR-0047 §5): the guide's voice from VoiceTut, an on-demand chunk loaded at session
 * start only when the gateway says the engine is `voicetut`. It takes over the guide's
 * speech.speak / cancelSpeech / speaking with the same contract, keeping the browser voice as the
 * fallback; pressing the microphone (cancelSpeech) stops the audio at once.
 *
 * Audio comes from the page's own origin (<gateway>/v1/speech/<hash>.wav?k=<site key>): an <audio>
 * element cannot send the site key as a header.
 */
import { maskContent } from './agent-mask.ts'
import { type BrowserVoice, type SpeechReply, VoiceOut } from './voice/out.ts'
import { AudioPlayer } from './voice/player.ts'

interface GuideLike {
	api: { base: string; siteKey: string; post<T>(path: string, body: unknown): Promise<T> }
	session: { sessionId: string; site: { speech: { out?: { engine: string; firstAudioMs: number } } } }
	speech: { speak(text: string, tag: string): Promise<void>; cancelSpeech(): void; readonly speaking: boolean; muted: boolean; onBlocked: ((text: string, lang: string) => void) | null }
}

function start(g: GuideLike): void {
	const out = g.session.site.speech.out
	const sys = g.speech
	if (!out || out.engine !== 'voicetut' || (sys as { __vgVoiceOut?: boolean }).__vgVoiceOut) return
	const speakingOf = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(sys), 'speaking')?.get
	const fallback: BrowserVoice = {
		speak: sys.speak.bind(sys),
		cancel: sys.cancelSpeech.bind(sys),
		get speaking() {
			return !!speakingOf?.call(sys)
		},
	}
	const key = encodeURIComponent(g.api.siteKey)
	const vo = new VoiceOut({
		request: (text, lang) =>
			g.api.post<SpeechReply>('/v1/speech', { sessionId: g.session.sessionId, text, lang }).then((r) => ({ ...r, url: r.url ? `${g.api.base}${r.url}?k=${key}` : null })),
		player: new AudioPlayer(),
		fallback,
		firstAudioMs: out.firstAudioMs,
		// Private only when a masking rule matches (Arabic-Indic digits alone are not personal data).
		isPrivate: (text) => {
			let hit = false
			maskContent(text, () => (hit = true))
			return hit
		},
		// Autoplay refused after a page change: the guide's "tap to hear" (ADR-0053 §4), read when the guide installs it.
		onBlocked: (text, tag) => (sys.onBlocked ? sys.onBlocked(text, tag) : void fallback.speak(text, tag)),
		report: (attrs, ms) => void g.api.post('/v1/progress', { sessionId: g.session.sessionId, cursor: -1, events: [{ name: 'sdk.speak', attrs, ms: Math.round(ms) }] }).catch(() => {}),
	})
	;(sys as { __vgVoiceOut?: boolean }).__vgVoiceOut = true
	sys.speak = (text, tag) => (!text || sys.muted ? Promise.resolve() : vo.speak(text, tag).catch(() => fallback.speak(text, tag)))
	sys.cancelSpeech = () => vo.cancel()
	Object.defineProperty(sys, 'speaking', { get: () => vo.speaking, configurable: true })
}

;(window as unknown as Record<string, unknown>)['__vgVoice-out'] = { start }
