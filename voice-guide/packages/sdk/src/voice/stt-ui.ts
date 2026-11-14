/**
 * The gateway's speech-to-text in the guide (ADR-0055), all in stt.js so guide.js keeps its size
 * budget (ADR-0057): which listener a press uses (routeSpeech wraps the guide's Speech), and the guide's words
 * around it (sttHooks): the notice before the first clip leaves the browser (remembered per site
 * key), the switch to the gateway after the browser's recognition fails with `network`, and "busy"
 * when the gateway's rate limit answers. The guide asks these hooks first and does the rest itself.
 */
import type { ListenHandlers, ListenInfo, ListenOptions } from '../speech.ts'

const S = {
	notice: { ar: 'علشان أفهمك، صوتك هيتبعت لخدمة تحويل الكلام لنص بتاعتنا برّه مصر، وبيتمسح بعدها.', en: 'To understand you, your voice is sent to our speech-to-text service outside Egypt, then deleted.' },
	ok: { ar: 'تمام، كمّل', en: 'OK, continue' },
	retry: { ar: 'هستخدم خدمة الكلام بتاعتنا. دوس على الميكروفون تاني.', en: 'Switching to our own speech service. Press the microphone again.' },
	busy: { ar: 'خدمة الكلام مشغولة دلوقتي. تقدر تكتب سؤالك.', en: 'The speech service is busy right now. You can type instead.' },
}

export const STT_STRINGS = S

interface VoiceLike {
	offer(text: string, label: string, onTap: () => void): void
	setState(state: 'error', message?: string): void
}

/** The guide's Speech, as far as routing goes. */
export interface SpeechLike {
	canListen: boolean
	readonly listening: boolean
	listen(lang: string, h: ListenHandlers, opts?: ListenOptions): Promise<ListenInfo>
	stopListening(): void
	abortListening(): void
	cancelSpeech(): void
}

/** The gateway's listener (voice/server-listen.ts), with the same contract as the browser's recognition. */
export interface OtherListener {
	readonly listening: boolean
	listen(lang: string, h: ListenHandlers, opts?: ListenOptions): Promise<ListenInfo>
	stop(): void
	abort(): void
}

export interface Route {
	/** This press goes to the gateway (the person's voice leaves the browser for it). */
	readonly server: boolean
	/** From now on, even though the browser has recognition (its service failed with `network`). */
	prefer(): void
}

/**
 * Gives the guide's Speech the gateway's listener: a press goes there when the browser has no
 * recognition or after `prefer()`; stop, abort and "listening" cover both.
 */
export function routeSpeech(sp: SpeechLike, other: OtherListener): Route {
	const native = sp.canListen
	let preferred = false
	const uses = () => !native || preferred
	const { listen, stopListening, abortListening } = sp
	const nativeListening = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(sp), 'listening')?.get
	sp.canListen = true
	sp.listen = (lang, h, opts) => {
		if (!uses()) return listen.call(sp, lang, h, opts)
		sp.stopListening()
		sp.cancelSpeech()
		return other.listen(lang, h, opts)
	}
	sp.stopListening = () => {
		if (other.listening) other.stop()
		stopListening.call(sp)
	}
	sp.abortListening = () => {
		if (other.listening) other.abort()
		abortListening.call(sp)
	}
	Object.defineProperty(sp, 'listening', { configurable: true, get: () => other.listening || !!nativeListening?.call(sp) })
	return {
		get server() {
			return uses()
		},
		prefer: () => void (preferred = true),
	}
}

export interface SttGuide {
	api: { siteKey: string }
	lang: string
	ui: { voice?: VoiceLike | null; note(text: string): void; open(): void; focusInput(): void }
}

export interface SttHooks {
	/** Before a press listens: true when the notice is shown instead (`go` presses again once agreed). */
	gate(go: () => void): boolean
	/** A listening failure the gateway's speech-to-text answers: true when handled here. */
	failed(code: string): boolean
}

export function sttHooks(g: SttGuide, route: Route, store?: Pick<Storage, 'getItem' | 'setItem'>): SttHooks {
	const key = `vg-stt-notice:${g.api.siteKey}`
	const say = (k: keyof typeof S) => (S[k] as Record<string, string>)[g.lang.slice(0, 2)] ?? S[k].en
	const agreed = () => {
		try {
			return (store || localStorage).getItem(key) === '1'
		} catch {
			return false
		}
	}
	return {
		gate(go) {
			if (!route.server || agreed()) return false
			const ok = () => {
				try {
					;(store || localStorage).setItem(key, '1')
				} catch {}
				go()
			}
			const v = g.ui.voice
			if (v) v.offer(say('notice'), say('ok'), ok)
			else {
				g.ui.note(say('notice'))
				ok()
			}
			return true
		},
		failed(code) {
			const v = g.ui.voice
			// The browser's recognition service is unreachable (some Brave setups, no Google keys): the gateway's next time.
			if (code === 'network' && !route.server) {
				route.prefer()
				if (!v) return false
				v.setState('error', say('retry'))
				return true
			}
			if (code !== 'server-busy') return false
			console.warn('[voice-guide] speech: server-busy')
			if (v) v.setState('error', say('busy'))
			else g.ui.note(say('busy'))
			g.ui.open()
			g.ui.focusInput()
			return true
		},
	}
}
