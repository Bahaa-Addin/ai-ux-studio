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
import { VODAFONE_THEME } from './theme/vodafone.ts'
import { GuideUi } from './ui.ts'
import { MicStream } from './voice/audio.ts'
import { type TraceEv, XrayModel } from './xray.ts'

export interface GuideOptions {
	gateway: string
	siteKey: string
	xray?: 'off' | 'button' | 'open'
	autoOpen?: boolean
	/** 'poll' when the page reaches the gateway through a router that cannot stream (ADR-0031). */
	events?: 'auto' | 'poll'
}

interface SessionResponse {
	sessionId: string
	via: 'resumed' | 'handoff' | 'new'
	lang: string
	plan: { turnId: string; steps: PlanStep[]; cursor: number; startedAt: string; awaitingNavigation?: boolean; itemKey?: string } | null
	agent: { task: string; history: unknown[]; steps: number; startedAt: string; turnId: string } | null
	agentToken: string | null
	page: { kbVersion: string | null; pageId: string | null; pageLang: string | null; variants: Record<string, string>; commitTargets: string[][]; visuals: number }
	site: {
		id: string
		languages: string[]
		defaultLanguage: string
		speech: { stt: Record<string, string>; tts: Record<string, string>; onDevice?: 'prefer' | 'require' | 'off'; phrases?: string[] }
		ui: { accent?: string; xray: string; theme?: 'page' | 'vodafone'; voiceFirst?: boolean }
		agent: { enabled: boolean; maxSteps: number; timeoutSec: number }
		watch: { enabled: boolean }
	}
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
	#events: { close(): void } | null = null
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

		const brand = this.session.site.ui.theme === 'vodafone' ? 'vodafone' : 'page'
		const theme = brand === 'vodafone' ? VODAFONE_THEME : themeFromPage(this.session.site.ui.accent)
		this.ui = new GuideUi(
			{
				onMic: () => void this.#toggleMic(),
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
				onLangSwitch: () => {
					const langs = this.session.site.languages
					const next = langs[(langs.indexOf(this.lang) + 1) % langs.length] || this.lang
					this.#setLang(next)
					// A language switch while listening restarts recognition in the new language.
					if (this.speech.listening) {
						this.#cancelListening()
						void this.#toggleMic()
					}
				},
				onCancelListen: () => this.#cancelListening(),
			},
			theme,
			this.lang,
			{ voiceFirst: !!this.session.site.ui.voiceFirst, brand },
		)
		this.ui.mount()
		// Same session, same conversation: show what was said on the previous page.
		if (this.session.via !== 'new') this.ui.restore(readStore(LOG_KEY(this.o.siteKey), []))
		this.ui.onTranscript = (items) => writeStore(LOG_KEY(this.o.siteKey), items)
		this.executor = new Executor(this.#host())
		;(window as any).voiceGuide = this
		this.#followRoutes()

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

	// ---- single-page-app routes (ADR-0030) ----

	#routeUrl = location.href

	/** Treats in-app route changes as page changes: the /spa/ app moves without loading pages. */
	#followRoutes(): void {
		const w = window as any
		if (w.__vgRoutes) return
		w.__vgRoutes = true
		const changed = (back: boolean) => queueMicrotask(() => void this.#onRoute(back))
		// Both signals, deduplicated by URL in #onRoute: the Navigation API where it exists, and
		// transparent wrappers on pushState/replaceState (same arguments, same return value).
		const nav = w.navigation
		if (nav && typeof nav.addEventListener === 'function') nav.addEventListener('navigatesuccess', () => changed(false))
		for (const m of ['pushState', 'replaceState'] as const) {
			const orig = history[m]
			history[m] = function (this: History, ...args: Parameters<History['pushState']>) {
				const r = orig.apply(this, args)
				changed(false)
				return r
			} as History['pushState']
		}
		addEventListener('popstate', () => changed(true))
	}

	async #onRoute(back: boolean): Promise<void> {
		// Back during a plan stops it (SPEC-05 §3): the person took the wheel. Checked before the
		// URL de-duplication: in Chromium the Navigation API's `navigatesuccess` (not a Back signal)
		// can arrive before `popstate` for the same traversal and would otherwise swallow it.
		if (back && (this.executor.running || this.#busy)) {
			this.stopAll()
			void this.#say(t('planStopped', this.lang))
		}
		const from = this.#routeUrl
		if (location.href === from) return
		const strip = (u: string) => u.replace(/#.*$/, '')
		this.#routeUrl = location.href
		if (strip(location.href) === strip(from)) return
		const t0 = performance.now()
		await this.#settle()
		try {
			const r = await this.api.post<SessionResponse>('/v1/session', { sessionId: this.session.sessionId, lang: this.lang, page: { url: location.href } })
			this.session.page = r.page
			this.guard = new CommitGuard(r.page.commitTargets || [])
		} catch (e) {
			console.warn('[voice-guide] route update failed', e)
		}
		if (!this.executor.running) this.ui.clearSpotlight()
		const turnId = this.#lastTurnId
		if (turnId) void this.#report(turnId, [{ name: 'sdk.route', attrs: { from: new URL(from).pathname, to: location.pathname, pageId: this.session.page.pageId }, ms: performance.now() - t0 }])
	}

	/** Waits until the app's view stops changing: 300 ms without mutations, at most 6 s. */
	#settle(): Promise<void> {
		return new Promise((resolve) => {
			const root = document.querySelector('app-root, vf-root') || document.body
			let last = performance.now()
			const mo = new MutationObserver(() => (last = performance.now()))
			mo.observe(root, { subtree: true, childList: true, characterData: true })
			const t0 = performance.now()
			const tick = () => {
				const now = performance.now()
				if (now - last >= 300 || now - t0 > 6000) {
					mo.disconnect()
					resolve()
				} else setTimeout(tick, 100)
			}
			setTimeout(tick, 100)
		})
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
			void this.#report(plan.turnId, [{ name: 'sdk.listen', attrs: { source, text: shown || utterance, confidence, ...(source === 'voice' ? this.#listenMeta : {}) }, ms: listenMs }])
			this.ui.thinking(false)
			if (this.ui.voice?.state === 'thinking') this.ui.voice.setState('idle')
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
			if (this.ui.voice?.state === 'thinking') this.ui.voice.setState('idle')
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
		if (this.ui?.voice?.state === 'speaking') this.ui.voice.setState('idle')
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
		const v = this.ui.voice
		if (v && !this.speech.muted && this.speech.canSpeak) v.setState('speaking')
		const p = this.speech.speak(text, tag).then(() => {
			if (v?.state === 'speaking' && !this.speech.speaking) v.setState('idle')
		})
		if (opts.wait) await Promise.race([p, new Promise((r) => setTimeout(r, 2500))])
	}

	// ---- listening ----

	#mic: MicStream | null = null
	#maxTimer = 0
	#listenMeta: Record<string, unknown> = {}

	#releaseMic(): void {
		clearTimeout(this.#maxTimer)
		this.#mic?.close()
		this.#mic = null
	}

	#cancelListening(): void {
		this.speech.abortListening()
		this.#releaseMic()
		this.ui.setListening(false)
		this.ui.voice?.setState('idle')
	}

	async #toggleMic(): Promise<void> {
		const v = this.ui.voice
		if (this.speech.listening) {
			// Second press: finish now and send what was heard.
			this.speech.stopListening()
			return
		}
		if (!this.speech.canListen) {
			v?.setState('unsupported')
			this.ui.open()
			this.ui.note(t('noMic', this.lang))
			this.ui.focusInput()
			return
		}
		// Barge-in: pressing while the guide speaks stops it and listens (SPEC-02 §3).
		this.stopAll({ keepUi: true })
		const tag = this.session.site.speech.stt[this.lang] || this.lang
		const t0 = performance.now()
		let speechStartAt = 0
		this.ui.setListening(true)
		let mode: string = 'own-capture'
		if (v) {
			try {
				const perm = await (navigator.permissions?.query({ name: 'microphone' as PermissionName }) ?? Promise.resolve(null)).catch(() => null)
				if (perm?.state === 'prompt') v.setState('permission')
				this.#mic = new MicStream()
				await this.#mic.open()
			} catch (e) {
				this.#releaseMic()
				this.ui.setListening(false)
				const denied = (e as DOMException)?.name === 'NotAllowedError'
				v.setState('error', t(denied ? 'micDenied' : 'noMic', this.lang))
				return
			}
			v.setState('listening')
			const mic = this.#mic
			v.startWave(() => mic.sample())
		}
		const failed = (code: string) => {
			this.#releaseMic()
			this.ui.setListening(false)
			if (code === 'aborted') return v?.setState('idle')
			if (code === 'not-allowed' || code === 'service-not-allowed' || code === 'audio-capture') {
				if (v) v.setState('error', t('micDenied', this.lang))
				else {
					this.ui.note(t('noMic', this.lang))
					this.ui.focusInput()
				}
				return
			}
			if (v) {
				v.setState('error', t('noSpeech', this.lang))
				setTimeout(() => v.state === 'error' && v.setState('idle'), 4000)
			}
		}
		try {
			const info = await this.speech.listen(
				tag,
				{
					onUpdate: (finalText, interim) => {
						v?.update(finalText, interim)
						this.ui.interim([finalText, interim].filter(Boolean).join(' '))
					},
					onSpeechStart: () => (speechStartAt = performance.now()),
					onSound: (on) => {
						if (this.#mic && !this.#mic.live) this.#mic.synthetic = on ? 0.6 : 0
					},
					onFinal: (text, confidence) => {
						const m = v?.metrics
						const p95 = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * 0.95))] : undefined)
						this.#listenMeta = {
							mode,
							firstWordMs: m?.firstWordAt && speechStartAt ? Math.round(m.firstWordAt - speechStartAt) : undefined,
							renderP95: m ? p95(m.renderMs) : undefined,
							frameP95: m ? p95(m.frameMs) : undefined,
						}
						this.#releaseMic()
						this.ui.setListening(false)
						v?.finalize(text)
						if (!text) return v?.setState('idle')
						v?.setState('thinking')
						if (this.answerAgent(text)) {
							this.ui.message('user', text)
							v?.setState('idle')
						} else void this.request(text, 'voice', undefined, performance.now() - t0, confidence)
					},
					onError: failed,
					onEnd: () => {
						this.#releaseMic()
						this.ui.setListening(false)
						if (v?.state === 'listening' || v?.state === 'permission') v.setState('idle')
					},
				},
				{ track: this.#mic?.track, phrases: this.session.site.speech.phrases, onDevice: this.session.site.speech.onDevice },
			)
			mode = this.#mic ? (info.mode === 'shared-track' ? 'shared-track' : 'two-captures') : 'own-capture'
			this.#listenMeta = { mode, onDevice: info.onDevice }
			clearTimeout(this.#maxTimer)
			this.#maxTimer = window.setTimeout(() => this.speech.stopListening(), 15_000)
		} catch (e) {
			console.warn('[voice-guide] listen failed', e)
			failed('error')
		}
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
		this.#events = this.api.events(
			this.session.sessionId,
			(kind, ev: TraceEv) => {
				if (kind === 'trace') {
					this.xray.add(ev)
					if (this.ui.xrayOpen) this.ui.renderXray(this.xray.view())
					return
				}
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
			},
			this.o.events || 'auto',
		)
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
