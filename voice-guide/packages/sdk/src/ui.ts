/**
 * The guide's on-page UI in one shadow root (ADR-0020): launcher, panel with
 * captions and a typing box, spotlight and pointer overlays, and the X-ray
 * drawer. Styles never leak into the host page and the page's never leak in.
 */
import { t } from './i18n.ts'
import type { Theme } from './theme.ts'

export interface UiHandlers {
	onMic(): void
	onSubmit(text: string): void
	onChip(utterance: string, label: string): void
	onWatch(): void
	onMute(muted: boolean): void
	onXray(open: boolean): void
	onClose(): void
}

const ICONS = {
	mic: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 15a3.5 3.5 0 0 0 3.5-3.5v-6a3.5 3.5 0 1 0-7 0v6A3.5 3.5 0 0 0 12 15Zm6.5-3.5a.75.75 0 0 0-1.5 0 5 5 0 0 1-10 0 .75.75 0 0 0-1.5 0 6.5 6.5 0 0 0 5.75 6.46V20.5H9a.75.75 0 0 0 0 1.5h6a.75.75 0 0 0 0-1.5h-2.25v-2.54A6.5 6.5 0 0 0 18.5 11.5Z"/></svg>',
	send: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3.4 20.4 21 12 3.4 3.6l.02 6.53L15 12 3.42 13.87z"/></svg>',
	close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M6.4 5 5 6.4 10.6 12 5 17.6 6.4 19l5.6-5.6 5.6 5.6 1.4-1.4-5.6-5.6L19 6.4 17.6 5 12 10.6z"/></svg>',
	sound: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M4 9v6h4l5 5V4L8 9H4Zm12.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4Z"/></svg>',
	muted: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M4 9v6h4l5 5V4L8 9H4Zm16.6 6.2-1.4 1.4-2.2-2.2-2.2 2.2-1.4-1.4 2.2-2.2-2.2-2.2 1.4-1.4 2.2 2.2 2.2-2.2 1.4 1.4-2.2 2.2z"/></svg>',
	xray: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3 5h18v2H3zm0 6h12v2H3zm0 6h18v2H3zm14-6h4v2h-4z"/></svg>',
	bell: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22Zm7-6V11a7 7 0 0 0-5.5-6.84V3a1.5 1.5 0 0 0-3 0v1.16A7 7 0 0 0 5 11v5l-2 2v1h18v-1z"/></svg>',
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
.toast { position: fixed; z-index: 2147483602; top: 20px; inset-inline-end: 20px; width: min(360px, calc(100vw - 40px)); background: #fff; border-inline-start: 5px solid var(--accent); border-radius: 12px; box-shadow: 0 10px 32px rgba(0,0,0,.25); padding: 12px 14px; display: none; }
.toast.on { display: block; animation: slide .3s ease; }
.toast b { display: block; margin-bottom: 4px; }
@keyframes slide { from { transform: translateY(-12px); opacity: 0; } }
.xray { position: fixed; z-index: 2147483603; top: 0; bottom: 0; left: 0; width: min(420px, 92vw); background: #0f1418; color: #dbe3e8; font: 12.5px/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; transform: translateX(-102%); transition: transform .25s ease; display: flex; flex-direction: column; direction: ltr; }
.xray.open { transform: none !important; }
.xray header { padding: 14px 16px; border-bottom: 1px solid #253038; display: flex; align-items: baseline; gap: 10px; }
.xray header b { font-family: ${th.font}; font-size: 15px; color: #fff; }
.xray header span { color: #8aa0ad; }
.xray .totals { padding: 10px 16px; border-bottom: 1px solid #253038; display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
.xray .totals div { background: #172027; border-radius: 8px; padding: 6px 8px; }
.xray .totals em { display: block; font-style: normal; color: #8aa0ad; font-size: 11px; }
.xray .totals strong { font-size: 16px; color: #fff; }
.xray .turns { flex: 1; overflow-y: auto; padding: 8px 12px 16px; }
.turn { border: 1px solid #253038; border-radius: 10px; margin: 8px 0; overflow: hidden; }
.turn > .u { padding: 8px 10px; background: #172027; color: #fff; font-family: ${th.font}; font-size: 14px; }
.ev { display: grid; grid-template-columns: 74px 1fr 58px; gap: 6px; padding: 4px 10px; border-top: 1px solid #1c262d; }
.ev .layer { color: #7fd1c4; }
.ev .layer.agent { color: #f2b84b; }
.ev .layer.err { color: #ff7a7a; }
.ev .ms { text-align: end; color: #8aa0ad; }
.ev .d { color: #c3cfd6; overflow-wrap: anywhere; }
.badge { display: inline-block; border-radius: 6px; padding: 0 6px; font-size: 11px; margin-inline-end: 4px; background: #24323b; color: #fff; }
.badge.replay { background: #0b6e6e; }
.badge.agent { background: #8a5a00; }
.badge.clarify { background: #4b4f9a; }
@media (prefers-reduced-motion: reduce) { .pointer, .spot, .xray, .launcher { transition: none; } .mic.listening::after { animation: none; } }
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
	#toastTimer = 0

	constructor(h: UiHandlers, theme: Theme, lang: string) {
		this.h = h
		this.lang = lang
		this.host = document.createElement('vg-guide')
		this.host.setAttribute('data-vg', '')
		// The fallback agent must not see or click the guide's own panel (ADR-0017).
		this.host.setAttribute('data-page-agent-ignore', 'true')
		this.root = this.host.attachShadow({ mode: 'open' })
		const style = document.createElement('style')
		style.textContent = CSS(theme)
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
			this.#spotRaf = requestAnimationFrame(follow)
		}
		follow()
	}

	clearSpotlight(): void {
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

	toast(title: string, body: string): void {
		const el = this.#els.toast
		el.innerHTML = ''
		const b = document.createElement('b')
		b.textContent = title
		const p = document.createElement('div')
		p.textContent = body
		el.append(b, p)
		el.dir = 'auto'
		el.classList.add('on')
		clearTimeout(this.#toastTimer)
		this.#toastTimer = window.setTimeout(() => el.classList.remove('on'), 9000)
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

	renderXray(view: XrayView): void {
		this.#els.kb.textContent = view.kbVersion ? `KB ${view.kbVersion}` : ''
		const tot = view.totals
		this.#els.totals.innerHTML = ''
		const cell = (k: string, v: string) => {
			const d = document.createElement('div')
			const em = document.createElement('em')
			em.textContent = k
			const s = document.createElement('strong')
			s.textContent = v
			d.append(em, s)
			this.#els.totals.appendChild(d)
		}
		cell('requests', String(tot.turns))
		cell('no LLM', tot.turns ? `${Math.round((100 * tot.replayed) / tot.turns)}%` : '-')
		cell('1st motion p50', tot.firstMotionP50 !== null ? `${tot.firstMotionP50} ms` : '-')
		const list = this.#els.turns
		list.innerHTML = ''
		for (const turn of [...view.turns].reverse()) {
			const box = document.createElement('div')
			box.className = 'turn'
			const u = document.createElement('div')
			u.className = 'u'
			u.dir = 'auto'
			if (turn.route) {
				const b = document.createElement('span')
				b.className = `badge ${turn.route}`
				b.textContent = turn.route
				u.appendChild(b)
			}
			u.append(turn.utterance || '…')
			box.appendChild(u)
			for (const ev of turn.events) {
				const row = document.createElement('div')
				row.className = 'ev'
				const layer = document.createElement('span')
				layer.className = `layer ${ev.kind}`
				layer.textContent = ev.layer
				const d = document.createElement('span')
				d.className = 'd'
				d.dir = 'auto'
				d.textContent = ev.detail
				const ms = document.createElement('span')
				ms.className = 'ms'
				ms.textContent = ev.ms !== undefined ? `${ev.ms} ms` : ''
				row.append(layer, d, ms)
				box.appendChild(row)
			}
			list.appendChild(box)
		}
	}
}

export interface XrayView {
	kbVersion?: string
	totals: { turns: number; replayed: number; firstMotionP50: number | null }
	turns: { id: string; utterance: string; route?: string; events: { layer: string; detail: string; ms?: number; kind: '' | 'agent' | 'err' }[] }[]
}
