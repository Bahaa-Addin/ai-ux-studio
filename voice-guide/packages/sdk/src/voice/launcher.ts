/**
 * Voice-first launcher (ADR-0027, SPEC-02): the floating microphone, its audio-reactive halo, a
 * keyboard button that opens the existing panel, and the small black transcript bar with the
 * live waveform and the words as they are heard. Lives in the guide's shadow root; positions are
 * physical (bottom-right, stacked above Vodafone's accessibility button) and do not mirror.
 */
import { t } from '../i18n.ts'
import type { Sample } from './audio.ts'
import { diffWords, type Word, wordsOf } from './words.ts'
import { icon, MIC, svg } from '../icons.ts'

export type MicState = 'idle' | 'permission' | 'listening' | 'thinking' | 'speaking' | 'error' | 'unsupported'

export interface LauncherHandlers {
	onPress(): void
	onKeyboard(): void
	onLang(): void
	onCancel(): void
}

const GLYPHS: Record<string, string> = {
	mic: MIC,
	stop: svg('<rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor"/>'),
	dots: '<svg viewBox="0 0 24 24" aria-hidden="true" class="dots"><circle cx="6" cy="12" r="2" fill="currentColor"/><circle cx="12" cy="12" r="2" fill="currentColor"/><circle cx="18" cy="12" r="2" fill="currentColor"/></svg>',
	speaker: icon('M4 9v6h4l5 5V4L8 9H4Zm12.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4Zm-2.5-8.77v2.06A7 7 0 0 1 19 12a7 7 0 0 1-5 6.71v2.06A9 9 0 0 0 21 12a9 9 0 0 0-7-8.77Z'),
	off: svg('<path fill="currentColor" d="M12 15a3.5 3.5 0 0 0 3.5-3.5v-6a3.5 3.5 0 1 0-7 0v6A3.5 3.5 0 0 0 12 15Z"/><path d="M4 4l16 16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'),
	keyboard: icon('M4 6h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Zm1 3v2h2V9H5Zm4 0v2h2V9H9Zm4 0v2h2V9h-2Zm4 0v2h2V9h-2ZM7 13v2h10v-2H7Z'),
}

/** Styles for the launcher (SPEC-02 §2–§4), on top of the theme's CSS. */
export const LAUNCHER_CSS = `
.vg-mic { position: fixed; z-index: 2147483000; right: calc(15.5px + env(safe-area-inset-right, 0px)); bottom: calc(91px + env(safe-area-inset-bottom, 0px)); width: 64px; height: 64px; border-radius: 50%; border: 5px solid #fff; background: var(--vf-red, #e60000); color: #fff; box-shadow: 0 6px 20px rgba(230,0,0,.35); display: grid; place-items: center; padding: 0; transition: transform .14s cubic-bezier(.2,.8,.2,1), box-shadow .14s; }
.vg-mic:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(230,0,0,.45); }
.vg-mic:active { transform: scale(.96); }
.vg-mic:focus-visible { outline: 3px solid #00b0ca; outline-offset: 3px; }
.vg-mic svg { width: 28px; height: 28px; position: relative; z-index: 1; }
.vg-mic .halo { position: absolute; inset: -5px; border-radius: 50%; background: #e60000; opacity: 0; transform: scale(1); z-index: -1; pointer-events: none; will-change: transform, opacity; }
.vg-mic[data-state="permission"] .halo { animation: vgpulse 1.6s ease-out infinite; opacity: .3; }
.vg-mic[data-state="speaking"]::after { content: ''; position: absolute; inset: -9px; border-radius: 50%; border: 2px solid #fff; box-shadow: 0 0 0 2px rgba(230,0,0,.5); animation: vgring 1.2s ease-out infinite; }
.vg-mic .dots circle { animation: vgdot .9s ease-in-out infinite; }
.vg-mic .dots circle:nth-child(2) { animation-delay: .15s; }
.vg-mic .dots circle:nth-child(3) { animation-delay: .3s; }
.vg-mic.hidden { display: none; }
@keyframes vgpulse { from { transform: scale(1); opacity: .35; } to { transform: scale(1.5); opacity: 0; } }
@keyframes vgring { from { transform: scale(.92); opacity: .9; } to { transform: scale(1.18); opacity: 0; } }
@keyframes vgdot { 0%, 100% { opacity: .35; } 50% { opacity: 1; } }
.vg-kbd { position: fixed; z-index: 2147483000; right: calc(91.5px + env(safe-area-inset-right, 0px)); bottom: calc(103px + env(safe-area-inset-bottom, 0px)); width: 40px; height: 40px; border-radius: 50%; border: 0; background: #fff; color: #333; box-shadow: 0 2px 8px rgba(0,0,0,.16); display: grid; place-items: center; padding: 0; opacity: 0; transform: scale(.85); pointer-events: none; transition: opacity .14s, transform .14s; }
.vg-kbd svg { width: 20px; height: 20px; }
.vg-kbd:focus-visible, .vg-kbd.show { opacity: 1; transform: none; pointer-events: auto; }
.vg-kbd:focus-visible { outline: 3px solid #00b0ca; outline-offset: 2px; }
.vg-bar { position: fixed; z-index: 2147483000; right: calc(16px + env(safe-area-inset-right, 0px)); bottom: calc(167px + env(safe-area-inset-bottom, 0px)); min-width: 220px; max-width: min(440px, calc(100vw - 32px)); min-height: 48px; padding: 10px 14px; border-radius: 6px; background: rgba(0,0,0,.9); color: #fff; box-shadow: 0 2px 8px rgba(0,0,0,.16); display: flex; align-items: center; gap: 12px; transform-origin: bottom right; transition: transform .18s cubic-bezier(.2,.8,.2,1), opacity .18s; }
@supports ((-webkit-backdrop-filter: blur(8px)) or (backdrop-filter: blur(8px))) { .vg-bar { -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px); } }
.vg-bar.hidden { opacity: 0; transform: scaleY(.6) translateY(8px); pointer-events: none; }
.vg-bar canvas { flex: none; width: 72px; height: 28px; display: block; }
.vg-bar .words { flex: 1; min-width: 0; max-height: 44px; overflow: hidden; font-size: 16px; line-height: 22px; display: flex; flex-wrap: wrap; align-content: flex-end; gap: 0 .3em; -webkit-mask-image: linear-gradient(to bottom, transparent 0, #000 12px); mask-image: linear-gradient(to bottom, transparent 0, #000 12px); }
.vg-bar .w { display: inline-block; opacity: 1; transition: opacity .12s; }
.vg-bar .w.interim { opacity: .7; }
.vg-bar .w.enter { animation: vgword .14s cubic-bezier(.2,.8,.2,1) both; }
.vg-bar .w.swap { animation: vgswap .12s ease both; }
.vg-bar .ph { opacity: .7; }
.vg-bar .caret { display: inline-block; width: .5em; animation: vgcaret 1s steps(1) infinite; }
.vg-bar .msg { opacity: .9; }
.vg-bar .msg a, .vg-bar .msg button { color: #fff; text-decoration: underline; background: none; border: 0; padding: 0; font: inherit; cursor: pointer; }
.vg-bar .lang { flex: none; border: 1px solid rgba(255,255,255,.4); background: transparent; color: #fff; border-radius: 6px; font-size: 12.8px; padding: 2px 8px; }
.vg-bar.thinking .words { background: linear-gradient(90deg, transparent, rgba(255,255,255,.12), transparent) 0 0 / 200% 100% no-repeat; animation: vgsweep .9s linear infinite; }
@keyframes vgword { from { opacity: 0; transform: translateY(6px); } to { opacity: var(--o, 1); transform: none; } }
@keyframes vgswap { 0% { opacity: .2; } 100% { opacity: var(--o, 1); } }
@keyframes vgcaret { 50% { opacity: 0; } }
@keyframes vgsweep { from { background-position: 150% 0; } to { background-position: -50% 0; } }
.vg-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
@media (prefers-reduced-motion: reduce) {
  .vg-mic, .vg-bar, .vg-kbd, .vg-bar .w { transition: none; }
  .vg-mic .halo, .vg-mic::after, .vg-bar .w.enter, .vg-bar .w.swap, .vg-bar.thinking .words, .vg-mic .dots circle { animation: none !important; }
}
`

export class VoiceLauncher {
	readonly el: { mic: HTMLButtonElement; halo: HTMLElement; kbd: HTMLButtonElement; bar: HTMLElement; words: HTMLElement; canvas: HTMLCanvasElement; lang: HTMLButtonElement; sr: HTMLElement }
	state: MicState = 'idle'
	lang: string
	#words: Word[] = []
	#spans: HTMLSpanElement[] = []
	#raf = 0
	#sampler: (() => Sample) | null = null
	#phase = [0, 0, 0]
	#reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
	/** Measurements for telemetry (SPEC-02 §8). */
	readonly metrics = { renderMs: [] as number[], frameMs: [] as number[], firstWordAt: 0 }

	constructor(container: HTMLElement, h: LauncherHandlers, lang: string) {
		this.lang = lang
		const mic = document.createElement('button')
		mic.type = 'button'
		mic.className = 'vg-mic'
		mic.innerHTML = `<span class="halo"></span>${GLYPHS.mic}`
		const kbd = document.createElement('button')
		kbd.type = 'button'
		kbd.className = 'vg-kbd'
		kbd.innerHTML = GLYPHS.keyboard
		const bar = document.createElement('div')
		bar.className = 'vg-bar hidden'
		bar.setAttribute('aria-hidden', 'true')
		bar.innerHTML = '<canvas width="72" height="28"></canvas><div class="words" dir="auto"></div><button type="button" class="lang"></button>'
		const sr = document.createElement('div')
		sr.className = 'vg-sr'
		sr.setAttribute('role', 'status')
		sr.setAttribute('aria-live', 'polite')
		container.append(bar, kbd, mic, sr)
		this.el = { mic, halo: mic.querySelector('.halo') as HTMLElement, kbd, bar, words: bar.querySelector('.words') as HTMLElement, canvas: bar.querySelector('canvas') as HTMLCanvasElement, lang: bar.querySelector('.lang') as HTMLButtonElement, sr }

		mic.addEventListener('click', () => h.onPress())
		kbd.addEventListener('click', () => h.onKeyboard())
		this.el.lang.addEventListener('click', (e) => {
			e.stopPropagation()
			h.onLang()
		})
		// Show the keyboard button while the pointer or focus is on the microphone.
		const peek = (on: boolean) => this.el.kbd.classList.toggle('show', on || this.state === 'listening' || this.state === 'error')
		for (const el of [mic, kbd]) {
			el.addEventListener('pointerenter', () => peek(true))
			el.addEventListener('pointerleave', () => peek(false))
			el.addEventListener('focus', () => peek(true))
			el.addEventListener('blur', () => peek(false))
		}
		// Press and hold to talk on touch screens (SPEC-02 §3).
		let holdTimer = 0
		let held = false
		mic.addEventListener('pointerdown', (e) => {
			if (e.pointerType !== 'touch') return
			held = false
			holdTimer = window.setTimeout(() => {
				held = true
				if (this.state !== 'listening') h.onPress()
			}, 450)
		})
		mic.addEventListener('pointerup', () => {
			clearTimeout(holdTimer)
			if (held && this.state === 'listening') h.onPress()
		})
		mic.addEventListener('click', (e) => {
			if (held) {
				e.stopImmediatePropagation()
				held = false
			}
		}, true)
		document.addEventListener('keydown', (e) => {
			if (e.key === 'Escape' && this.state === 'listening') h.onCancel()
			if (e.altKey && e.shiftKey && (e.key === 'V' || e.key === 'v' || e.code === 'KeyV')) {
				e.preventDefault()
				mic.focus()
			}
		})
		this.setLang(lang)
		this.setState('idle')
	}

	setLang(lang: string): void {
		this.lang = lang
		this.el.kbd.setAttribute('aria-label', t('keyboard', lang))
		this.el.kbd.title = t('keyboard', lang)
		this.el.lang.textContent = t('switchLang', lang)
		this.el.lang.setAttribute('aria-label', t('switchLang', lang))
		this.el.bar.setAttribute('lang', lang)
		this.#labels()
	}

	#labels(): void {
		const key = this.state === 'listening' ? 'stopListening' : this.state === 'speaking' ? 'stopSpeaking' : 'talk'
		this.el.mic.setAttribute('aria-label', t(key, this.lang))
		this.el.mic.title = t(key, this.lang)
		this.el.mic.setAttribute('aria-pressed', String(this.state === 'listening'))
	}

	setState(state: MicState, message?: string): void {
		this.state = state
		this.el.mic.dataset.state = state
		const glyph = state === 'listening' ? GLYPHS.stop : state === 'thinking' ? GLYPHS.dots : state === 'speaking' ? GLYPHS.speaker : state === 'error' ? GLYPHS.off : state === 'unsupported' ? GLYPHS.keyboard : GLYPHS.mic
		this.el.mic.innerHTML = `<span class="halo"></span>${glyph}`
		this.el.halo = this.el.mic.querySelector('.halo') as HTMLElement
		this.el.bar.classList.toggle('thinking', state === 'thinking')
		this.el.kbd.classList.toggle('show', state === 'listening' || state === 'error')
		if (state === 'listening') {
			this.#resetWords()
			this.#placeholder(t('listening', this.lang))
			this.showBar(true)
		} else if (state === 'permission') {
			this.#resetWords()
			this.#message(t('allowMic', this.lang))
			this.showBar(true)
		} else if (state === 'error') {
			this.#resetWords()
			this.#message(message || t('noSpeech', this.lang), true)
			this.showBar(true)
		} else if (state === 'idle' || state === 'speaking' || state === 'unsupported') {
			this.showBar(false)
		}
		if (state !== 'listening') this.stopWave()
		this.#labels()
	}

	showBar(on: boolean): void {
		this.el.bar.classList.toggle('hidden', !on)
	}

	hide(on: boolean): void {
		this.el.mic.classList.toggle('hidden', on)
		if (on) {
			this.showBar(false)
			this.el.kbd.classList.remove('show')
		}
	}

	/** The words heard so far (SPEC-02 §4): unchanged words untouched, changes in place, new words animate in one by one. */
	update(finalText: string, interimText: string): void {
		const t0 = performance.now()
		const next = wordsOf(finalText, interimText)
		if (!next.length) return
		if (!this.#spans.length) this.el.words.textContent = ''
		const d = diffWords(this.#words, next)
		for (let i = 0; i < d.remove; i++) this.#spans.pop()?.remove()
		for (const c of d.change) {
			const s = this.#spans[c.index]
			if (s.textContent !== c.word.text) {
				s.textContent = c.word.text
				s.classList.remove('enter', 'swap')
				void s.offsetWidth
				s.classList.add('swap')
			}
			s.classList.toggle('interim', !c.word.final)
			s.style.setProperty('--o', c.word.final ? '1' : '.7')
		}
		const caret = this.el.words.querySelector('.caret')
		d.append.forEach((w, i) => {
			const s = document.createElement('span')
			s.className = `w enter${w.final ? '' : ' interim'}`
			s.textContent = w.text
			s.style.setProperty('--o', w.final ? '1' : '.7')
			s.style.animationDelay = `${i * 45}ms`
			this.el.words.insertBefore(s, caret)
			this.#spans.push(s)
		})
		if (!caret) {
			const c = document.createElement('span')
			c.className = 'caret'
			c.textContent = '▍'
			this.el.words.appendChild(c)
		}
		this.#words = next
		if (!this.metrics.firstWordAt) this.metrics.firstWordAt = performance.now()
		this.metrics.renderMs.push(performance.now() - t0)
	}

	/** The final transcript, announced once to screen readers (interim words are not). */
	finalize(text: string): void {
		this.el.words.querySelector('.caret')?.remove()
		for (const s of this.#spans) {
			s.classList.remove('interim')
			s.style.setProperty('--o', '1')
		}
		this.announce(text)
	}

	announce(text: string): void {
		this.el.sr.textContent = ''
		requestAnimationFrame(() => (this.el.sr.textContent = text))
	}

	#resetWords(): void {
		this.#words = []
		this.#spans = []
		this.el.words.textContent = ''
		this.metrics.renderMs = []
		this.metrics.frameMs = []
		this.metrics.firstWordAt = 0
	}

	#placeholder(text: string): void {
		this.el.words.innerHTML = ''
		const s = document.createElement('span')
		s.className = 'ph'
		s.textContent = text
		const c = document.createElement('span')
		c.className = 'caret'
		c.textContent = '▍'
		this.el.words.append(s, c)
	}

	#message(text: string, typeInstead = false): void {
		this.el.words.innerHTML = ''
		const s = document.createElement('span')
		s.className = 'msg'
		s.textContent = `${text} `
		if (typeInstead) {
			const b = document.createElement('button')
			b.type = 'button'
			b.textContent = t('keyboard', this.lang)
			b.addEventListener('click', () => this.el.kbd.click())
			s.appendChild(b)
		}
		this.el.words.appendChild(s)
	}

	// ---- waveform and halo (SPEC-02 §5) ----

	startWave(sampler: () => Sample): void {
		this.#sampler = sampler
		cancelAnimationFrame(this.#raf)
		const loop = () => {
			const t0 = performance.now()
			this.#draw(sampler())
			this.metrics.frameMs.push(performance.now() - t0)
			if (this.metrics.frameMs.length > 600) this.metrics.frameMs.shift()
			this.#raf = requestAnimationFrame(loop)
		}
		this.#raf = requestAnimationFrame(loop)
	}

	stopWave(): void {
		cancelAnimationFrame(this.#raf)
		this.#raf = 0
		this.#sampler = null
		this.el.halo.style.transform = ''
		this.el.halo.style.opacity = ''
	}

	get waving(): boolean {
		return !!this.#raf
	}

	#draw(s: Sample): void {
		const c = this.el.canvas
		const dpr = Math.min(3, window.devicePixelRatio || 1)
		const w = 72
		const h = 28
		if (c.width !== w * dpr) {
			c.width = w * dpr
			c.height = h * dpr
		}
		const ctx = c.getContext('2d')
		if (!ctx) return
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
		ctx.clearRect(0, 0, w, h)
		// Halo on the microphone follows the same level.
		if (!this.#reduced) {
			this.el.halo.style.transform = `scale(${(1 + 0.35 * s.level).toFixed(3)})`
			this.el.halo.style.opacity = (0.25 + 0.35 * s.level).toFixed(3)
		}
		if (this.#reduced) {
			// Static five-bar meter: heights step with the level, no easing or movement.
			ctx.fillStyle = '#ffffff'
			const bars = 5
			for (let i = 0; i < bars; i++) {
				const on = s.level * bars > i + 0.15
				const bh = on ? 6 + i * 4 : 3
				ctx.globalAlpha = on ? 1 : 0.35
				ctx.fillRect(10 + i * 11, (h - bh) / 2, 6, bh)
			}
			ctx.globalAlpha = 1
			return
		}
		const layers = [
			{ color: 'rgba(230,0,0,.45)', freq: 1.2, amp: 0.25 + 0.75 * s.low, width: 2 },
			{ color: '#e60000', freq: 1.8, amp: 0.2 + 0.8 * s.mid, width: 2 },
			{ color: '#ffffff', freq: 2.6, amp: 0.15 + 0.85 * s.high, width: 1.5 },
		]
		const idle = 0.04
		layers.forEach((L, k) => {
			this.#phase[k] += 0.12 + 0.25 * s.level + k * 0.03
			const A = (h / 2 - 2) * Math.max(idle, s.level * L.amp)
			ctx.beginPath()
			for (let x = 0; x <= w; x += 1) {
				const env = 0.5 - 0.5 * Math.cos((2 * Math.PI * x) / w)
				const y = h / 2 + A * env * Math.sin((2 * Math.PI * L.freq * x) / w + this.#phase[k])
				if (x === 0) ctx.moveTo(x, y)
				else ctx.lineTo(x, y)
			}
			ctx.strokeStyle = L.color
			ctx.lineWidth = L.width
			ctx.lineCap = 'round'
			ctx.stroke()
		})
	}
}
