/**
 * The Guide: boots a session (resuming across page loads and origins), turns
 * speech or text into requests, runs plans, and keeps the X-ray panel live.
 */
import type { Plan, PlanStep } from '#kb'

import type { AgentRunResult } from './agent.ts'
import { Api, ApiError } from './api.ts'
import { CommitGuard } from './dom.ts'
import { Executor, type ExecutorHost, type StepEvent } from './executor.ts'
import { t } from './i18n.ts'
import { Speech } from './speech.ts'
import { themeFromPage } from './theme.ts'
import { GuideUi } from './ui.ts'
import { type TraceEv, XrayModel } from './xray.ts'

export interface GuideOptions {
	gateway: string
	siteKey: string
	xray?: 'off' | 'button' | 'open'
	autoOpen?: boolean
}

interface SessionResponse {
	sessionId: string
	via: 'resumed' | 'handoff' | 'new'
	lang: string
	plan: { turnId: string; steps: PlanStep[]; cursor: number; startedAt: string; awaitingNavigation?: boolean; itemKey?: string } | null
	agent: { task: string; history: unknown[]; steps: number; startedAt: string; turnId: string } | null
	agentToken: string | null
	page: { kbVersion: string | null; pageId: string | null; pageLang: string | null; variants: Record<string, string>; commitTargets: string[][]; visuals: number }
	site: { id: string; languages: string[]; defaultLanguage: string; speech: { stt: Record<string, string>; tts: Record<string, string> }; ui: { accent?: string; xray: string }; agent: { enabled: boolean; maxSteps: number; timeoutSec: number }; watch: { enabled: boolean } }
	push: { publicKey: string } | null
}

const STORE_KEY = (siteKey: string) => `vg:${siteKey}:session`
const OPEN_KEY = (siteKey: string) => `vg:${siteKey}:open`
const LOG_KEY = (siteKey: string) => `vg:${siteKey}:log`
const NOTIFIED_KEY = (siteKey: string) => `vg:${siteKey}:notified`

function readStore<T>(key: string, fallback: T): T {
	try {
		const v = sessionStorage.getItem(key)
		return v === null ? fallback : (JSON.parse(v) as T)
	} catch {
		return fallback
	}
}
function writeStore(key: string, value: unknown): void {
	try {
		sessionStorage.setItem(key, JSON.stringify(value))
	} catch {}
}

export class Guide {
	readonly o: GuideOptions
	readonly api: Api
	readonly speech = new Speech()
	readonly xray = new XrayModel()
	ui!: GuideUi
	executor!: Executor
	guard = new CommitGuard([])
	session!: SessionResponse
	lang: string
	#events: EventSource | null = null
	#turnStartedAt = 0
	#motionReported = false
	#lastSpoken = ''
	#pendingWatch: { step: Extract<PlanStep, { op: 'offerWatch' }>; turnId: string } | null = null
	#askResolver: ((answer: string) => void) | null = null
	#agentAbort: AbortController | null = null
	#busy = false

	constructor(o: GuideOptions) {
		this.o = o
		this.api = new Api(o.gateway, o.siteKey)
		this.lang = (document.documentElement.lang || 'ar').slice(0, 2)
	}

	async start(): Promise<void> {
		const handoff = /[#&]vgh=([\w-]+)/.exec(location.hash)?.[1]
		if (handoff) history.replaceState(null, '', location.href.replace(/[#&]vgh=[\w-]+/, '').replace(/#$/, ''))
		let stored: string | null = null
		try {
			stored = sessionStorage.getItem(STORE_KEY(this.o.siteKey))
		} catch {}
		this.session = await this.api.post<SessionResponse>('/v1/session', { sessionId: stored, handoff, lang: this.lang, page: { url: location.href } })
		try {
			sessionStorage.setItem(STORE_KEY(this.o.siteKey), this.session.sessionId)
		} catch {}
		this.lang = this.session.page.pageLang || this.session.lang || this.lang
		this.guard = new CommitGuard(this.session.page.commitTargets || [])
		this.xray.kbVersion = this.session.page.kbVersion || undefined

		const theme = themeFromPage(this.session.site.ui.accent)
		this.ui = new GuideUi(
			{
				onMic: () => this.#toggleMic(),
				onSubmit: (text) => {
					if (this.answerAgent(text)) this.ui.message('user', text)
					else void this.request(text, 'typed')
				},
				onChip: (utterance, label) => {
					this.ui.message('user', label)
					void this.request(utterance, 'chip', label)
				},
				onWatch: () => void this.#createWatch(),
				onMute: (m) => {
					this.speech.muted = m
					if (m) this.speech.cancelSpeech()
				},
				onXray: (open) => {
					if (open) {
						this.#openEvents()
						this.ui.renderXray(this.xray.view())
					}
				},
				onClose: () => {
					this.stopAll()
					try {
						sessionStorage.removeItem(OPEN_KEY(this.o.siteKey))
					} catch {}
				},
			},
			theme,
			this.lang,
		)
		this.ui.mount()
		// Same session, same conversation: show what was said on the previous page.
		if (this.session.via !== 'new') this.ui.restore(readStore(LOG_KEY(this.o.siteKey), []))
		this.ui.onTranscript = (items) => writeStore(LOG_KEY(this.o.siteKey), items)
		this.executor = new Executor(this.#host())
		;(window as any).voiceGuide = this

		let wasOpen = false
		try {
			wasOpen = sessionStorage.getItem(OPEN_KEY(this.o.siteKey)) === '1'
		} catch {}
		const resuming = !!this.session.plan || !!this.session.agent
		if (wasOpen || resuming || this.o.autoOpen || this.session.via === 'handoff') this.ui.open()
		const xray = this.o.xray || this.session.site.ui.xray
		if (xray === 'open') this.ui.toggleXray(true)
		if (this.session.via !== 'new') this.#openEvents()

		if (this.session.plan) await this.#resumePlan()
		else if (this.session.agent && this.session.site.agent.enabled) await this.#resumeAgent()
	}

	// ---- requests ----

	async request(utterance: string, source: 'voice' | 'typed' | 'chip', shown?: string, listenMs?: number, confidence?: number): Promise<void> {
		this.stopAll({ keepUi: true })
		this.#markOpen()
		if (source !== 'chip') this.ui.message('user', shown || utterance)
		this.ui.chips([])
		this.ui.thinking(true)
		this.#openEvents()
		this.#turnStartedAt = performance.now()
		this.#motionReported = false
		this.#busy = true
		try {
			const res = await this.api.post<{ turnId: string; plan: Plan }>('/v1/turn', { sessionId: this.session.sessionId, utterance, uiLang: this.lang, page: { url: location.href } })
			const plan = res.plan
			this.#lastTurnId = plan.turnId
			void this.#report(plan.turnId, [{ name: 'sdk.listen', attrs: { source, text: shown || utterance, confidence }, ms: listenMs }])
			this.ui.thinking(false)
			if (plan.lang !== this.lang) this.#setLang(plan.lang)
			if (plan.meta.intent === 'repeat') {
				if (this.#lastSpoken) await this.#say(this.#lastSpoken)
				else await this.#say(t('error', this.lang))
				return
			}
			if (plan.say) await this.#say(plan.say, { wait: plan.steps[0]?.op === 'navigate' })
			if (!plan.steps.length) return
			await this.executor.run(plan)
		} catch (e) {
			this.ui.thinking(false)
			const err = e as ApiError
			this.ui.note(err.status === 429 ? '…' : t('error', this.lang))
			console.warn('[voice-guide]', e)
		} finally {
			this.#busy = false
		}
	}

	stopAll(opts: { keepUi?: boolean } = {}): void {
		this.executor?.stop()
		this.#agentAbort?.abort()
		this.#agentAbort = null
		this.speech.cancelSpeech()
		this.speech.stopListening()
		this.#askResolver = null
		if (!opts.keepUi) this.ui?.clearSpotlight()
	}

	#markOpen(): void {
		try {
			sessionStorage.setItem(OPEN_KEY(this.o.siteKey), '1')
		} catch {}
	}

	#setLang(lang: string): void {
		this.lang = lang
		this.ui.setLang(lang)
	}

	async #say(text: string, opts: { wait?: boolean } = {}): Promise<void> {
		if (!text) return
		this.#lastSpoken = text
		this.ui.message('guide', text)
		const tag = this.session.site.speech.tts[this.lang] || this.lang
		const p = this.speech.speak(text, tag)
		if (opts.wait) await Promise.race([p, new Promise((r) => setTimeout(r, 2500))])
	}

	// ---- listening ----

	#toggleMic(): void {
		if (this.speech.listening) {
			this.speech.stopListening()
			return
		}
		if (!this.speech.canListen) {
			this.ui.note(t('noMic', this.lang))
			this.ui.focusInput()
			return
		}
		this.stopAll({ keepUi: true })
		const tag = this.session.site.speech.stt[this.lang] || this.lang
		const t0 = performance.now()
		this.ui.setListening(true)
		this.speech.listen(tag, {
			onInterim: (text) => this.ui.interim(text),
			onFinal: (text, confidence) => {
				this.ui.setListening(false)
				if (!text) return
				if (this.answerAgent(text)) this.ui.message('user', text)
				else void this.request(text, 'voice', undefined, performance.now() - t0, confidence)
			},
			onError: (code) => {
				this.ui.setListening(false)
				if (code === 'not-allowed' || code === 'service-not-allowed' || code === 'audio-capture') {
					this.ui.note(t('noMic', this.lang))
					this.ui.focusInput()
				}
			},
			onEnd: () => this.ui.setListening(false),
		})
	}

	// ---- plan execution host ----

	#host(): ExecutorHost {
		const self = this
		return {
			get ui() {
				return self.ui
			},
			get guard() {
				return self.guard
			},
			get lang() {
				return self.lang
			},
			pageMatches(pageId, urlPrefix) {
				if (pageId && self.session.page.pageId === pageId) return true
				if (urlPrefix) {
					try {
						const want = new URL(urlPrefix)
						return want.origin === location.origin && location.pathname === want.pathname
					} catch {}
				}
				return false
			},
			say: (text, opts) => self.#say(text, opts),
			progress: async (p) => {
				try {
					await self.api.post('/v1/progress', { sessionId: self.session.sessionId, ...p, events: p.events }, { keepalive: !!p.awaitingNavigation })
				} catch (e) {
					console.warn('[voice-guide] progress', e)
				}
			},
			handoffUrl: async (url) => {
				const r = await self.api.post<{ token: string }>('/v1/handoff', { sessionId: self.session.sessionId })
				const u = new URL(url)
				u.hash = `vgh=${r.token}`
				return u.toString()
			},
			offerWatch(step, turnId) {
				if (!self.session.site.watch.enabled) return
				self.#pendingWatch = { step, turnId }
				self.ui.chips([{ label: t('watch', self.lang), utterance: '', kind: 'watch' }])
			},
			ask(step) {
				self.ui.chips(step.options.map((o) => ({ label: o.label, utterance: o.utterance })))
			},
			runAgent: (step, turnId, signal) => self.#runAgent(step, turnId, signal),
			firstMotion() {
				if (self.#motionReported || !self.#turnStartedAt) return
				self.#motionReported = true
				const ms = performance.now() - self.#turnStartedAt
				const turnId = self.#currentTurnId()
				if (turnId) void self.#report(turnId, [{ name: 'sdk.first_motion', attrs: {}, ms }])
			},
		}
	}

	#currentTurnId(): string | undefined {
		return this.#lastTurnId || this.session.plan?.turnId
	}
	#lastTurnId?: string

	async #report(turnId: string, events: StepEvent[]): Promise<void> {
		this.#lastTurnId = turnId
		try {
			await this.api.post('/v1/progress', { sessionId: this.session.sessionId, turnId, cursor: -1, events })
		} catch {}
	}

	/** Counts resumes of the same point; a third resume means a navigation loop (ADR-0016). */
	#resumeAllowed(key: string): boolean {
		try {
			const k = `vg:resume:${key}`
			const n = Number(sessionStorage.getItem(k) || 0) + 1
			sessionStorage.setItem(k, String(n))
			return n <= 2
		} catch {
			return true
		}
	}

	async #resumePlan(): Promise<void> {
		const p = this.session.plan!
		this.#lastTurnId = p.turnId
		if (!this.#resumeAllowed(`${p.turnId}:${p.cursor}`)) {
			await this.#host().progress({ turnId: p.turnId, cursor: p.cursor, done: true, events: [{ name: 'sdk.step', attrs: { op: p.steps[p.cursor]?.op || 'resume', ok: false, detail: 'stopped a resume loop' } }] })
			this.ui.note(t('error', this.lang))
			return
		}
		try {
			await this.executor.run({ turnId: p.turnId, steps: p.steps }, p.cursor, { itemKey: p.itemKey })
		} catch (e) {
			this.ui.note(t('error', this.lang))
			console.warn('[voice-guide] resume failed', e)
		}
	}

	// ---- fallback agent ----

	async #loadAgent(): Promise<{ runAgent: (o: any) => Promise<AgentRunResult> }> {
		const w = window as any
		if (w.__vgAgent) return w.__vgAgent
		await new Promise<void>((resolve, reject) => {
			const s = document.createElement('script')
			s.src = `${this.o.gateway}/sdk/agent.js`
			s.async = true
			s.onload = () => resolve()
			s.onerror = () => reject(new Error('agent chunk failed to load'))
			document.head.appendChild(s)
		})
		return w.__vgAgent
	}

	async #runAgent(step: Extract<PlanStep, { op: 'agent' }>, turnId: string, signal: AbortSignal, previous?: { lines: string[]; steps: number; startedAt?: string }): Promise<void> {
		if (!this.session.agentToken || !this.session.site.agent.enabled) {
			await this.#say(t('agentUnavailable', this.lang))
			return
		}
		const mod = await this.#loadAgent()
		const abort = new AbortController()
		signal.addEventListener('abort', () => abort.abort())
		this.#agentAbort = abort
		const t0 = performance.now()
		// The time limit covers the whole task, across page loads.
		const startedAt = previous?.startedAt || new Date().toISOString()
		const save = (state: { lines: string[]; steps: number } | null) =>
			this.api
				.post('/v1/agent/state', { sessionId: this.session.sessionId, agent: state ? { task: step.task, history: state.lines, steps: state.steps, startedAt, turnId, hints: step.hints, maxSteps: step.maxSteps } : null }, { keepalive: true })
				.catch(() => {})
		try {
			this.#host().firstMotion()
			await save(previous ? { lines: previous.lines, steps: previous.steps } : { lines: [], steps: 0 })
			const r = await mod.runAgent({
				gateway: this.o.gateway,
				token: this.session.agentToken,
				turnId,
				task: step.task,
				hints: step.hints,
				lang: this.lang,
				maxSteps: step.maxSteps || this.session.site.agent.maxSteps,
				timeoutSec: this.session.site.agent.timeoutSec,
				commitSelectors: this.guard.selectors,
				previous,
				signal: abort.signal,
				onStep: (ev: { step: number; action: string; goal?: string; ms: number }) => void this.#report(turnId, [{ name: 'agent.step', attrs: { step: ev.step, action: ev.action, goal: ev.goal }, ms: ev.ms }]),
				onSave: (state: { lines: string[]; steps: number }) => void save(state),
				onAsk: (q: string) => {
					void this.#say(q)
					return new Promise<string>((resolve) => (this.#askResolver = resolve))
				},
			})
			await save(null)
			void this.#report(turnId, [{ name: 'agent.done', attrs: { success: r.success, steps: r.steps, error: r.error }, ms: performance.now() - t0 }])
			if (abort.signal.aborted) return
			if (r.text) await this.#say(r.text)
			else if (r.error) await this.#say(t('agentUnavailable', this.lang))
		} catch (e) {
			if (abort.signal.aborted) return
			await save(null)
			await this.#say(t('agentUnavailable', this.lang))
			void this.#report(turnId, [{ name: 'sdk.step', attrs: { op: 'agent', ok: false, detail: (e as Error).message } }])
		} finally {
			this.#agentAbort = null
		}
	}

	async #resumeAgent(): Promise<void> {
		const a = this.session.agent!
		if (Date.now() - new Date(a.startedAt).getTime() > this.session.site.agent.timeoutSec * 1000) return
		this.#lastTurnId = a.turnId
		if (!this.#resumeAllowed(`agent:${a.turnId}:${a.steps}`)) {
			await this.api.post('/v1/agent/state', { sessionId: this.session.sessionId, agent: null }).catch(() => {})
			return
		}
		const lines = (a.history as string[]) || []
		await this.#runAgent({ op: 'agent', task: a.task, hints: (a as any).hints, maxSteps: (a as any).maxSteps }, a.turnId, new AbortController().signal, { lines, steps: a.steps, startedAt: a.startedAt })
	}

	// ---- page watch ----

	async #createWatch(): Promise<void> {
		const pw = this.#pendingWatch
		if (!pw) return
		const { step, turnId } = pw
		let subscriptionId: string | undefined
		try {
			subscriptionId = await this.#pushSubscription()
		} catch (e) {
			console.info('[voice-guide] push unavailable, using live delivery', e)
		}
		try {
			if (!subscriptionId && 'Notification' in window && Notification.permission === 'default') await Notification.requestPermission().catch(() => 'denied')
			await this.api.post('/v1/watch', { sessionId: this.session.sessionId, turnId, subscriptionId, url: step.url, pageId: step.pageId, target: step.target, label: step.label, lang: this.lang })
			this.#pendingWatch = null
			await this.#say(t('watching', this.lang, { label: step.label }))
			this.#openEvents()
		} catch (e) {
			await this.#say(t('watchFailed', this.lang))
			console.warn('[voice-guide] watch', e)
		}
	}

	async #pushSubscription(): Promise<string | undefined> {
		if (!this.session.push || !('serviceWorker' in navigator) || !('PushManager' in window)) return undefined
		const perm = await Notification.requestPermission()
		if (perm !== 'granted') return undefined
		const reg = await navigator.serviceWorker.register('/vg-sw.js', { scope: '/' })
		await navigator.serviceWorker.ready
		const key = Uint8Array.from(atob(this.session.push.publicKey.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))
		// A browser that cannot reach its push service can stall here; fall back to live delivery.
		const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('push subscribe timed out')), 4000))
		const sub = (await reg.pushManager.getSubscription()) || (await Promise.race([reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key }), timeout]))
		const r = await this.api.post<{ subscriptionId: string }>('/v1/push/subscribe', { sessionId: this.session.sessionId, subscription: sub.toJSON() })
		return r.subscriptionId
	}

	// ---- live events: X-ray and notifications ----

	#openEvents(): void {
		if (this.#events) return
		const es = this.api.events(this.session.sessionId)
		es.addEventListener('trace', (e) => {
			this.xray.add(JSON.parse((e as MessageEvent).data) as TraceEv)
			if (this.ui.xrayOpen) this.ui.renderXray(this.xray.view())
		})
		es.addEventListener('notify', (e) => {
			const ev = JSON.parse((e as MessageEvent).data) as TraceEv
			this.xray.add(ev)
			// The stream replays its backlog on every page load; announce each change once.
			const seen = readStore<number>(NOTIFIED_KEY(this.o.siteKey), 0)
			const stale = Date.now() - Date.parse(ev.at) > 5 * 60_000
			if ((ev.seq ?? 0) <= seen || stale) return
			writeStore(NOTIFIED_KEY(this.o.siteKey), ev.seq ?? 0)
			const a = ev.attrs
			this.ui.toast(a.title, a.body)
			void this.#say(`${a.title}. ${a.body}`)
			// Push watches are shown by the service worker; live ones by the page.
			if ('Notification' in window && Notification.permission === 'granted' && a.channel !== 'push') {
				try {
					new Notification(a.title, { body: a.body, lang: a.lang, dir: a.lang === 'ar' ? 'rtl' : 'ltr', tag: a.watchId })
				} catch {}
			}
		})
		this.#events = es
	}

	/** Answers an agent's question (typed or spoken) instead of starting a new request. */
	answerAgent(text: string): boolean {
		if (!this.#askResolver) return false
		const r = this.#askResolver
		this.#askResolver = null
		r(text)
		return true
	}

	get busy(): boolean {
		return this.#busy
	}
}
