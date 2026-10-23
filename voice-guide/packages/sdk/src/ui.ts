/**
 * The guide's on-page UI in one shadow root (ADR-0020): launcher, panel with
 * captions and a typing box, spotlight and pointer overlays, and the X-ray
 * drawer. Styles never leak into the host page and the page's never leak in.
 */
import { t } from './i18n.ts'
import type { Theme } from './theme.ts'
import { VODAFONE_CSS } from './theme/vodafone.ts'
import { LAUNCHER_CSS, VoiceLauncher } from './voice/launcher.ts'
import { icon, MIC, svg } from './icons.ts'

export interface UiHandlers {
	onMic(): void
	onSubmit(text: string): void
	onChip(utterance: string, label: string): void
	onWatch(): void
	onMute(muted: boolean): void
	onXray(open: boolean): void
	onClose(): void
	/** Voice-first launcher (ADR-0027): the language chip and Esc while listening. */
	onLangSwitch?(): void
	onCancelListen?(): void
}

export interface UiOptions {
	/** The floating button is the microphone, with the transcript bar (ADR-0027). */
	voiceFirst?: boolean
	/** Fixed Vodafone tokens and component styles (ADR-0029). */
	brand?: 'vodafone' | 'page'
}

const ICONS = {
	mic: MIC,
	send: icon('M3.4 20.4 21 12 3.4 3.6l.02 6.53L15 12 3.42 13.87z'),
	close: icon('M6.4 5 5 6.4 10.6 12 5 17.6 6.4 19l5.6-5.6 5.6 5.6 1.4-1.4-5.6-5.6L19 6.4 17.6 5 12 10.6z'),
	sound: icon('M4 9v6h4l5 5V4L8 9H4Zm12.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4Z'),
	muted: icon('M4 9v6h4l5 5V4L8 9H4Zm16.6 6.2-1.4 1.4-2.2-2.2-2.2 2.2-1.4-1.4 2.2-2.2-2.2-2.2 1.4-1.4 2.2 2.2 2.2-2.2 1.4 1.4-2.2 2.2z'),
	xray: icon('M3 5h18v2H3zm0 6h12v2H3zm0 6h18v2H3zm14-6h4v2h-4z'),
	bell: icon('M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22Zm7-6V11a7 7 0 0 0-5.5-6.84V3a1.5 1.5 0 0 0-3 0v1.16A7 7 0 0 0 5 11v5l-2 2v1h18v-1z'),
}

const CSS = (th: Theme) => `
:host { all: initial; }
* { box-sizing: border-box; }
.root { font-family: ${th.font}; color: #14181c; font-size: 15px; line-height: 1.45; --accent: ${th.accent}; --ink: ${th.accentInk}; --radius: ${th.radius}; }
button { font: inherit; cursor: pointer; }
button:focus-visible, input:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }
.launcher { position: fixed; bottom: 24px; inset-inline-end: 24px; z-index: 2147483600; width: 60px; height: 60px; border-radius: 50%; border: 0; background: var(--accent); color: var(--ink); box-shadow: 0 6px 24px rgba(0,0,0,.24); display: grid; place-items: center; transition: transform .15s ease; }
.launcher:hover { transform: scale(1.05); }
.launcher svg { width: 28px; height: 28px; }
.launcher.hidden { display: none; }
.panel { position: fixed; bottom: 24px; inset-inline-end: 24px; z-index: 2147483601; width: min(380px, calc(100vw - 32px)); max-height: min(560px, calc(100vh - 48px)); display: none; flex-direction: column; background: #fff; border-radius: 18px; box-shadow: 0 12px 48px rgba(0,0,0,.28); overflow: hidden; }
.panel.open { display: flex; }
.head { display: flex; align-items: center; gap: 8px; padding: 12px 12px 12px 16px; background: var(--accent); color: var(--ink); }
.head .title { flex: 1; font-weight: 700; font-size: 16px; }
.icon { width: 34px; height: 34px; border-radius: 50%; border: 0; background: transparent; color: inherit; display: grid; place-items: center; opacity: .9; }
.icon:hover { background: rgba(255,255,255,.18); opacity: 1; }
.icon svg { width: 20px; height: 20px; }
.icon[aria-pressed="true"] { background: rgba(255,255,255,.28); }
.log { flex: 1; overflow-y: auto; padding: 14px 16px 6px; display: flex; flex-direction: column; gap: 8px; min-height: 120px; }
.msg { max-width: 88%; padding: 8px 12px; border-radius: 14px; white-space: pre-wrap; word-wrap: break-word; }
.msg.user { align-self: flex-end; background: #eef1f3; }
.msg.guide { align-self: flex-start; background: color-mix(in srgb, var(--accent) 12%, white); }
.msg.note { align-self: center; color: #5b6770; font-size: 13px; background: none; padding: 0; }
.hint { color: #5b6770; font-size: 14px; }
.chips { display: flex; flex-wrap: wrap; gap: 8px; padding: 0 16px 8px; }
.chip { border: 1.5px solid var(--accent); color: #14181c; background: #fff; border-radius: 999px; padding: 6px 14px; font-size: 14px; display: inline-flex; align-items: center; gap: 6px; }
.chip svg { width: 16px; height: 16px; color: var(--accent); }
.chip:hover { background: color-mix(in srgb, var(--accent) 10%, white); }
.live { min-height: 22px; padding: 0 16px 6px; color: #5b6770; font-size: 14px; font-style: italic; }
.bar { display: flex; gap: 8px; align-items: center; padding: 10px 12px 12px; border-top: 1px solid #e6eaed; }
.bar input { flex: 1; min-width: 0; border: 1px solid #d5dbdf; border-radius: 999px; padding: 10px 14px; font: inherit; color: inherit; }
.mic, .send { flex: none; width: 44px; height: 44px; border-radius: 50%; border: 0; background: var(--accent); color: var(--ink); display: grid; place-items: center; position: relative; }
.send { background: #eef1f3; color: #14181c; }
.mic svg, .send svg { width: 22px; height: 22px; }
.mic.listening::after { content: ''; position: absolute; inset: -6px; border-radius: 50%; border: 3px solid var(--accent); animation: pulse 1.1s ease-out infinite; }
@keyframes pulse { from { transform: scale(.9); opacity: .9; } to { transform: scale(1.35); opacity: 0; } }
.spot { position: fixed; z-index: 2147483500; pointer-events: none; border-radius: 12px; box-shadow: 0 0 0 4px var(--accent), 0 0 0 9999px rgba(10,14,18,.42); transition: all .35s ease; display: none; }
.spot.on { display: block; }
.spot.commit { box-shadow: 0 0 0 4px #d97706, 0 0 0 9999px rgba(10,14,18,.42); }
.bubble { position: fixed; z-index: 2147483501; pointer-events: none; max-width: min(360px, calc(100vw - 32px)); background: #14181c; color: #fff; padding: 10px 14px; border-radius: 12px; font-size: 15px; box-shadow: 0 8px 24px rgba(0,0,0,.3); display: none; }
.bubble.on { display: block; }
.pointer { position: fixed; z-index: 2147483502; pointer-events: none; width: 28px; height: 28px; margin: -14px 0 0 -14px; border-radius: 50%; background: var(--accent); border: 3px solid #fff; box-shadow: 0 2px 10px rgba(0,0,0,.35); opacity: 0; transition: left .55s cubic-bezier(.2,.8,.2,1), top .55s cubic-bezier(.2,.8,.2,1), opacity .2s; }
.pointer.on { opacity: .95; }
.pointer.tap { animation: tap .35s ease; }
@keyframes tap { 50% { transform: scale(.7); } }
.xray { display: none; }
@media (prefers-reduced-motion: reduce) { .pointer, .spot, .launcher { transition: none; } .mic.listening::after { animation: none; } }
`

export class GuideUi {
	readonly host: HTMLElement
	readonly root: ShadowRoot
	readonly h: UiHandlers
	lang: string
	onTranscript?: (t: { who: 'user' | 'guide'; text: string }[]) => void
	#els: Record<string, HTMLElement> = {}
	#spotEl: Element | null = null
	#spotRaf = 0

	/** The microphone launcher and transcript bar, when voice first. */
	voice: VoiceLauncher | null = null

	constructor(h: UiHandlers, theme: Theme, lang: string, opts: UiOptions = {}) {
		this.h = h
		this.lang = lang
		this.host = document.createElement('vg-guide')
		this.host.setAttribute('data-vg', '')
		// The fallback agent must not see or click the guide's own panel (ADR-0017).
		this.host.setAttribute('data-page-agent-ignore', 'true')
		this.root = this.host.attachShadow({ mode: 'open' })
		const style = document.createElement('style')
		style.textContent = CSS(theme) + (opts.brand === 'vodafone' ? VODAFONE_CSS : '') + (opts.voiceFirst ? `${LAUNCHER_CSS}\n.launcher { display: none !important; }` : '')
		const wrap = document.createElement('div')
		wrap.className = 'root'
		wrap.innerHTML = `
			<div class="spot" part="spot"></div>
			<div class="bubble" role="status"></div>
			<div class="pointer"></div>
			<div class="toast" role="alert"></div>
			<aside class="xray" aria-label="X-ray"><header><b>X-ray</b><span class="kb"></span></header><div class="totals"></div><div class="turns"></div></aside>
			<button class="launcher" type="button">${ICONS.mic}</button>
			<section class="panel" role="dialog" aria-modal="false">
				<div class="head"><div class="title"></div>
					<button class="icon xraybtn" type="button" aria-pressed="false">${ICONS.xray}</button>
					<button class="icon mutebtn" type="button" aria-pressed="false">${ICONS.sound}</button>
					<button class="icon closebtn" type="button">${ICONS.close}</button></div>
				<div class="log" aria-live="polite"></div>
				<div class="live"></div>
				<div class="chips"></div>
				<form class="bar"><button class="mic" type="button">${ICONS.mic}</button><input type="text" autocomplete="off" enterkeyhint="send"><button class="send" type="submit">${ICONS.send}</button></form>
			</section>`
		this.root.append(style, wrap)
		const q = (s: string) => wrap.querySelector(s) as HTMLElement
		for (const k of ['spot', 'bubble', 'pointer', 'toast', 'xray', 'launcher', 'panel', 'log', 'live', 'chips', 'mic', 'title']) this.#els[k] = q(`.${k}`)
		this.#els.root = wrap
		this.#els.input = q('.bar input')
		this.#els.xraybtn = q('.xraybtn')
		this.#els.mutebtn = q('.mutebtn')
		this.#els.closebtn = q('.closebtn')
		this.#els.turns = q('.xray .turns')
		this.#els.totals = q('.xray .totals')
		this.#els.kb = q('.xray .kb')

		if (opts.voiceFirst) {
			this.voice = new VoiceLauncher(
				wrap,
				{
					onPress: () => h.onMic(),
					onKeyboard: () => {
						this.open()
						this.focusInput()
					},
					onLang: () => h.onLangSwitch?.(),
					onCancel: () => h.onCancelListen?.(),
				},
				lang,
			)
		}
		this.#els.launcher.addEventListener('click', () => {
			this.open()
			h.onMic()
		})
		this.#els.mic.addEventListener('click', () => h.onMic())
		q('.bar').addEventListener('submit', (e) => {
			e.preventDefault()
			const input = this.#els.input as HTMLInputElement
			const v = input.value.trim()
			if (!v) return
			input.value = ''
			h.onSubmit(v)
		})
		this.#els.closebtn.addEventListener('click', () => {
			this.close()
			h.onClose()
		})
		this.#els.mutebtn.addEventListener('click', () => {
			const m = this.#els.mutebtn.getAttribute('aria-pressed') !== 'true'
			this.#els.mutebtn.setAttribute('aria-pressed', String(m))
			this.#els.mutebtn.innerHTML = m ? ICONS.muted : ICONS.sound
			this.#labels()
			h.onMute(m)
		})
		this.#els.xraybtn.addEventListener('click', () => this.toggleXray())
		// Any real interaction with the page clears the spotlight.
		document.addEventListener(
			'pointerdown',
			(e) => {
				if (!e.composedPath().includes(this.host)) this.clearSpotlight()
			},
			true,
		)
		this.setLang(lang)
	}

	mount(): void {
		document.body.appendChild(this.host)
	}

	setLang(lang: string): void {
		this.lang = lang
		const dir = /^(ar|fa|he|ur)/.test(lang) ? 'rtl' : 'ltr'
		this.#els.root.setAttribute('dir', dir)
		this.host.setAttribute('dir', dir)
		this.#els.root.setAttribute('lang', lang)
		this.voice?.setLang(lang)
		this.#labels()
	}

	#labels(): void {
		const l = this.lang
		this.#els.title.textContent = t('guide', l)
		this.#els.launcher.setAttribute('aria-label', t('open', l))
		this.#els.mic.setAttribute('aria-label', t('listen', l))
		;(this.#els.input as HTMLInputElement).placeholder = t('placeholder', l)
		this.#els.closebtn.setAttribute('aria-label', t('close', l))
		this.#els.xraybtn.setAttribute('aria-label', t('xray', l))
		this.#els.mutebtn.setAttribute('aria-label', this.#els.mutebtn.getAttribute('aria-pressed') === 'true' ? t('unmute', l) : t('mute', l))
		this.root.querySelector('.bar .send')?.setAttribute('aria-label', t('send', l))
	}

	get isOpen(): boolean {
		return this.#els.panel.classList.contains('open')
	}

	open(): void {
		this.#els.panel.classList.add('open')
		this.#els.launcher.classList.add('hidden')
		// The panel sits where the transcript bar would; it shows the live words itself.
		this.voice?.showBar(false)
		if (!this.#els.log.childElementCount) this.note(t('hint', this.lang), 'hint')
	}

	restore(items: { who: 'user' | 'guide'; text: string }[]): void {
		for (const m of items) {
			this.transcript.push(m)
			this.message(m.who, m.text, false)
		}
	}

	close(): void {
		this.#els.panel.classList.remove('open')
		this.#els.launcher.classList.remove('hidden')
		this.clearSpotlight()
	}

	focusInput(): void {
		;(this.#els.input as HTMLInputElement).focus()
	}

	setListening(on: boolean): void {
		this.#els.mic.classList.toggle('listening', on)
		this.#els.live.textContent = on ? t('listening', this.lang) : ''
	}

	interim(text: string): void {
		this.#els.live.textContent = text
	}

	thinking(on: boolean): void {
		this.#els.live.textContent = on ? t('thinking', this.lang) : ''
	}

	/** Messages shown so far, so the conversation survives page loads (ADR-0016). */
	readonly transcript: { who: 'user' | 'guide'; text: string }[] = []

	message(who: 'user' | 'guide', text: string, persist = true): void {
		if (persist) {
			this.transcript.push({ who, text })
			if (this.transcript.length > 12) this.transcript.shift()
			this.onTranscript?.(this.transcript)
		}
		const div = document.createElement('div')
		div.className = `msg ${who}`
		div.textContent = text
		div.dir = 'auto'
		this.#els.log.querySelector('.hint')?.remove()
		this.#els.log.appendChild(div)
		while (this.#els.log.childElementCount > 30) this.#els.log.firstElementChild?.remove()
		this.#els.log.scrollTop = this.#els.log.scrollHeight
	}

	note(text: string, cls = 'note'): void {
		const div = document.createElement('div')
		div.className = `msg ${cls}`
		div.textContent = text
		this.#els.log.appendChild(div)
	}

	chips(items: { label: string; utterance: string; kind?: 'watch' }[]): void {
		const c = this.#els.chips
		c.textContent = ''
		for (const it of items) {
			const b = document.createElement('button')
			b.type = 'button'
			b.className = 'chip'
			b.dir = 'auto'
			b.innerHTML = it.kind === 'watch' ? ICONS.bell : ''
			b.append(it.label)
			b.addEventListener('click', () => {
				c.textContent = ''
				if (it.kind === 'watch') this.h.onWatch()
				else this.h.onChip(it.utterance, it.label)
			})
			c.appendChild(b)
		}
	}

	// ---- overlays ----

	spotlight(el: Element, opts: { caption?: string; commit?: boolean } = {}): void {
		this.#spotEl = el
		const spot = this.#els.spot
		spot.classList.add('on')
		spot.classList.toggle('commit', !!opts.commit)
		const bubble = this.#els.bubble
		if (opts.caption) {
			bubble.textContent = opts.caption
			bubble.dir = 'auto'
			bubble.classList.add('on')
		} else bubble.classList.remove('on')
		cancelAnimationFrame(this.#spotRaf)
		const follow = () => {
			if (!this.#spotEl || !this.#spotEl.isConnected) return this.clearSpotlight()
			const r = this.#spotEl.getBoundingClientRect()
			const pad = 8
			Object.assign(spot.style, { left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` })
			if (bubble.classList.contains('on')) {
				const below = r.bottom + 16 + bubble.offsetHeight < innerHeight
				const top = below ? r.bottom + 16 : Math.max(8, r.top - 16 - bubble.offsetHeight)
				const left = Math.min(Math.max(8, r.left), innerWidth - bubble.offsetWidth - 8)
				Object.assign(bubble.style, { top: `${top}px`, left: `${left}px` })
			}
			this.#keepPanelClear(r)
			this.#spotRaf = requestAnimationFrame(follow)
		}
		follow()
	}

	/**
	 * An open panel never covers what the guide points at: it moves to the other side of the
	 * screen until the spotlight ends.
	 */
	#keepPanelClear(r: DOMRect): void {
		const panel = this.#els.panel
		if (!panel.classList.contains('open')) return
		const pr = panel.getBoundingClientRect()
		const w = pr.width
		const m = 16
		const hits = (left: number) => r.left - 8 < left + w && r.right + 8 > left && r.top - 8 < pr.bottom && r.bottom + 8 > pr.top
		if (!hits(pr.left)) return
		const onRight = pr.left + w / 2 > innerWidth / 2
		const there = onRight ? m : innerWidth - m - w
		// A wide target is under the panel on both sides: stay put (hiding the panel would take
		// away the text box mid-conversation); most of the target stays visible.
		if (hits(there)) return
		panel.classList.add('aside')
		panel.style.setProperty('left', onRight ? `${m}px` : 'auto', 'important')
		panel.style.setProperty('right', onRight ? 'auto' : `${m}px`, 'important')
	}

	clearSpotlight(): void {
		const panel = this.#els.panel
		panel.classList.remove('aside')
		panel.style.removeProperty('left')
		panel.style.removeProperty('right')
		this.#spotEl = null
		cancelAnimationFrame(this.#spotRaf)
		this.#els.spot.classList.remove('on', 'commit')
		this.#els.bubble.classList.remove('on')
		this.#els.pointer.classList.remove('on')
	}

	/** Moves the branded pointer onto an element, so the person sees where the guide clicks. */
	async pointAt(el: Element, tap = false): Promise<void> {
		const p = this.#els.pointer
		const r = el.getBoundingClientRect()
		if (!p.classList.contains('on')) Object.assign(p.style, { left: `${innerWidth / 2}px`, top: `${innerHeight - 60}px` })
		p.classList.add('on')
		await new Promise((res) => requestAnimationFrame(res))
		Object.assign(p.style, { left: `${r.left + r.width / 2}px`, top: `${r.top + r.height / 2}px` })
		const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
		await new Promise((res) => setTimeout(res, reduce ? 50 : 600))
		if (tap) {
			p.classList.remove('tap')
			void p.offsetWidth
			p.classList.add('tap')
			await new Promise((res) => setTimeout(res, 200))
		}
	}

	/** The notification toast arrives with the page-watch chunk (T-504); it lives in this root. */
	get toastEl(): HTMLElement {
		return this.#els.toast
	}

	// ---- X-ray ----

	toggleXray(force?: boolean): void {
		const open = force ?? !this.#els.xray.classList.contains('open')
		this.#els.xray.classList.toggle('open', open)
		this.#els.xraybtn.setAttribute('aria-pressed', String(open))
		this.h.onXray(open)
	}

	get xrayOpen(): boolean {
		return this.#els.xray.classList.contains('open')
	}

	/** The X-ray drawer's styles and renderer arrive with the X-ray chunk (demo only, T-504). */
	installXray(css: string, render: (els: XrayEls, view: XrayView) => void): void {
		if (this.#xrayRender) return
		const style = document.createElement('style')
		style.textContent = css
		this.root.appendChild(style)
		this.#xrayRender = render
	}

	#xrayRender: ((els: XrayEls, view: XrayView) => void) | null = null

	renderXray(view: XrayView): void {
		this.#xrayRender?.({ kb: this.#els.kb, totals: this.#els.totals, turns: this.#els.turns }, view)
	}
}

export interface XrayEls {
	kb: HTMLElement
	totals: HTMLElement
	turns: HTMLElement
}

export interface XrayView {
	kbVersion?: string
	totals: { turns: number; replayed: number; firstMotionP50: number | null }
	turns: { id: string; utterance: string; route?: string; events: { layer: string; detail: string; ms?: number; kind: '' | 'agent' | 'err' }[] }[]
}
