/**
 * The Exploration Trail controller (SPEC-06; ADR-0035 to ADR-0039): consent, route policy, the lazy
 * recorder, step boundaries, chunked local storage, attention on knowledge destinations, the
 * timeline and its sandboxed preview, and question chips that become ordinary guide turns. It owns
 * every listener, timer, observer, recorder and replayer it starts and releases them on teardown.
 * Every failure is caught: the page and the guide keep working without the trail.
 */
import { addAsked, allAsked, askedFrom, type AskOrigin, watchTurns } from './asked.ts'
import { AttentionTracker } from './attention.ts'
import { decideStep, type PendingTransition, type RouteSignal } from './boundaries.ts'
import { TRAIL_CONFIG } from './config.ts'
import { consentKey, forgetConsent, forgetNotNow, notNow, parseConsent, readConsent, recoverConsent, writeConsent } from './consent.ts'
import { tt } from './i18n.ts'
import { type CatalogEntry, selectTop } from './interest.ts'
import { contributionBatch } from './aggregate.ts'
import { canonicalPath, eligibility, optedOutPage, privateFieldsOnPage, recorderOptions, type SitePolicy } from './policy.ts'
import type { Preview, PreviewOptions } from './replay.ts'
import type { RecorderHandle } from './recorder.ts'
import { checkSeed } from './seed.ts'
import { Resolver } from './resolver.ts'
import { type Effect, INITIAL, reduce, type TrailEvent, type TrailState } from './state.ts'
import { CorruptChunk, decodeChunk, encodeEvents, planEviction, QuotaError, TrailStore } from './storage.ts'
import { type ExploredItem, type I18n, type PageMap, type RawEvent, TRAIL_SCHEMA, type TrailSession, type TrailStepSummary } from './types.ts'
import type { SeedResult, TrailHostApi, TrailHostSnapshot } from './host.ts'
import { TRAIL_CSS, TrailView, type ViewIntents } from './view.ts'

/** What the trail needs from the guide (`packages/sdk/src/guide.ts`), and nothing more. */
export interface GuideLike {
	o: { gateway: string; siteKey: string }
	api: { get<T = any>(path: string): Promise<T>; post<T = any>(path: string, body: unknown, o?: { keepalive?: boolean }): Promise<T> }
	session: { site: { id: string; trail?: TrailSettings; ui?: { theme?: string } }; page: { kbVersion: string | null; pageId: string | null } }
	lang: string
	ui: { root: ShadowRoot; open(): void; voice?: { finalize(t: string): void; setState(s: string): void } | null }
	speech: { canSpeak: boolean; muted: boolean }
	executor: { running: boolean }
	busy: boolean
	request(utterance: string, source: 'voice' | 'typed' | 'chip', shown?: string, listenMs?: number, confidence?: number, hint?: Record<string, string | undefined>): Promise<void>
}

export interface TrailSettings {
	enabled: boolean
	retentionHours: number
	excludePaths: string[]
	privateSelectors: string[]
	topOffset?: number
	/** Same-origin folders a replay may copy files from despite a query or no extension (checked by type after fetching). */
	replayAssetPaths?: string[]
	aggregation: boolean
	/** The site's demo kit (`experiences.demos.demoKit`): only then may a page seed or reset the journey (ADR-0050 §6). */
	demoKit?: boolean
}

interface InflightChunk {
	id: string
	seq: number
	sessionId: string
	step: TrailStepSummary
	t0: number
	t1: number
	events: RawEvent[]
}

interface SpilledChunk {
	id: string
	sessionId: string
	stepId: string
	seq: number
	t0: number
	t1: number
	json: string
}

const SS = (siteKey: string, k: string) => `vg-trail:${siteKey}:${k}`
const rid = (p: string) => `${p}_${crypto.getRandomValues(new Uint32Array(2)).reduce((s, n) => s + n.toString(36), '')}`

function loadScript(src: string): Promise<void> {
	return new Promise((resolve, reject) => {
		const s = document.createElement('script')
		s.src = src
		s.async = true
		s.onload = () => resolve()
		s.onerror = () => reject(new Error(`${src} failed to load`))
		document.head.appendChild(s)
	})
}

function ssGet<T>(key: string): T | null {
	try {
		return JSON.parse(sessionStorage.getItem(key) || 'null') as T
	} catch {
		return null
	}
}
function ssSet(key: string, v: unknown): void {
	try {
		if (v === null) sessionStorage.removeItem(key)
		else sessionStorage.setItem(key, JSON.stringify(v))
	} catch {}
}

export class TrailController {
	readonly g: GuideLike
	readonly settings: TrailSettings
	readonly policy: SitePolicy
	readonly siteKey: string
	state: TrailState = INITIAL
	store: TrailStore | null = null
	view: TrailView | null = null
	map: PageMap | null = null
	resolver: Resolver | null = null
	attention: AttentionTracker | null = null
	session: TrailSession | null = null
	step: TrailStepSummary | null = null
	#recorder: RecorderHandle | null = null
	#preview: Preview | null = null
	#previewToken = 0
	#buffer: RawEvent[] = []
	/** Chunks taken from the buffer whose write has not finished yet. */
	#inflight = new Map<string, InflightChunk>()
	#bufferBytes = 0
	#chunkSeq = 0
	#chunkStartedAt = 0
	#writing: Promise<void> = Promise.resolve()
	#timers = new Set<number>()
	#abort = new AbortController()
	#routeUrl = location.href
	#lastIndexWrite = 0
	#indexPending = 0
	#lastEviction = 0
	#activeQuestion: string | null = null
	#notice: string | null = null
	#transition: string | null = null
	#position = 0
	#guideWatch = 0
	#style: HTMLStyleElement | null = null
	readonly reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches
	/** The page declared itself a host in its HTML (`<meta name="vg-trail-host">`, the clone's; ADR-0040): for good. */
	readonly #metaHost = !!document.querySelector('meta[name="vg-trail-host"]')
	/** The host that claimed the journey at run time (ADR-0050), or null. */
	#claim: object | null = null
	/** The page shows the journey itself, declared or claimed: no sheet of our own, only the status pill (ADR-0040, ADR-0050). */
	get hosted(): boolean {
		return this.#metaHost || this.#claim !== null
	}
	#hostRoot: HTMLElement | null = null
	/** Gives the guide's `request` and `api.post` back (ADR-0050 §5). */
	#unwatch: (() => void) | null = null
	#subscribers = new Set<(s: TrailHostSnapshot) => void>()
	#seeding = false

	constructor(g: GuideLike, settings: TrailSettings) {
		this.g = g
		this.settings = settings
		this.policy = { excludePaths: settings.excludePaths || [], privateSelectors: settings.privateSelectors || [] }
		this.siteKey = g.o.siteKey
	}

	// ---- start-up ----

	async start(): Promise<void> {
		const w = window as any
		if (w.__vgTrailActive) return
		w.__vgTrailActive = this
		// No IndexedDB (some private windows): no trail, and no offer of one. The database itself is
		// created only once the person has said yes: nothing is stored before consent.
		if (typeof indexedDB === 'undefined') return
		// What questions were about, from each answered turn's plan meta; never the words or the answer (ADR-0050 §5).
		this.#unwatch = watchTurns(this.g, (origin, plan) => this.#answered(origin, plan))
		// Vodafone's theme clears localStorage on some pages: the copy in IndexedDB is the second place to look (T-806).
		const consent = await recoverConsent(this.siteKey)
		if (consent === 'granted' || consent === 'paused') await this.#openStore()
		this.map = await this.g.api.get<PageMap>(`/v1/experience?url=${encodeURIComponent(location.href)}`).catch(() => null)
		this.#mountView()
		this.#listen()
		this.dispatch({ type: 'START', consent: consent !== 'unset' && consent !== 'declined' && consent !== 'off' && !this.store ? 'declined' : consent, eligible: this.#eligible() })
		if (consent === 'granted' || consent === 'paused') await this.#enterPage('load')
		void this.#evict()
		this.#announceHost()
	}

	/** Opens (or creates) the local database; null when the browser refuses (the trail then stays off). */
	async #openStore(): Promise<TrailStore | null> {
		if (!this.store || this.store.closed) this.store = await TrailStore.open()
		return this.store
	}

	#siteOrigins(): string[] {
		return [location.origin]
	}

	#eligible(): boolean {
		return this.#eligibility().ok
	}

	#eligibility() {
		return eligibility({ url: location.href, siteOrigins: this.#siteOrigins(), kbPage: this.map?.page, hasPrivateFields: privateFieldsOnPage(), optedOut: optedOutPage(), policy: this.policy })
	}

	#mountView(): void {
		const root = (this.g.ui.root.querySelector('.root') as HTMLElement | null) || (this.g.ui.root as unknown as HTMLElement)
		this.#style = document.createElement('style')
		this.#style.textContent = TRAIL_CSS
		this.g.ui.root.appendChild(this.#style)
		this.view = new TrailView(root, this.#intents())
		this.view.host.dataset.brand = this.g.session.site.ui?.theme === 'vodafone' ? 'vodafone' : 'page'
		this.#placeBelowHeader()
		this.#render()
	}

	/** Below the site's header: persistent (fixed or sticky) headers and the page's own header while it is on screen. */
	#placeBelowHeader(): void {
		if (!this.view) return
		if (typeof this.settings.topOffset === 'number') return this.view.setTop(this.settings.topOffset)
		let bottom = 0
		const vh = innerHeight
		try {
			for (const f of [0.08, 0.5, 0.92]) {
				for (const el of document.elementsFromPoint(innerWidth * f, 6)) {
					if (el.closest('vg-guide')) continue
					const header = el.closest('header, [role="banner"], nav')
					for (let e: Element | null = el; e && e !== document.documentElement; e = e.parentElement) {
						const pos = getComputedStyle(e).position
						if (pos === 'fixed' || pos === 'sticky' || e === header) {
							const r = e.getBoundingClientRect()
							if (r.top <= 10 && r.bottom > 0 && r.height <= vh * TRAIL_CONFIG.ui.headerMaxFraction) bottom = Math.max(bottom, r.bottom)
							if (pos === 'fixed' || pos === 'sticky') break
						}
					}
				}
			}
		} catch {}
		this.view.setTop(bottom + TRAIL_CONFIG.ui.gap)
	}

	#listen(): void {
		const o = { signal: this.#abort.signal }
		let raf = 0
		// The pill tucks away after 24px of scrolling down and comes back after 8px up (or near the top).
		let anchor = scrollY
		const place = () => {
			cancelAnimationFrame(raf)
			raf = requestAnimationFrame(() => {
				this.#placeBelowHeader()
				const y = scrollY
				const open = this.state.view === 'expanded' || this.state.consentCard
				if (open || y < 120) {
					this.view?.tuck(false)
					anchor = y
				} else if (y - anchor > 24) {
					this.view?.tuck(true)
					anchor = y
				} else if (anchor - y > 8) {
					this.view?.tuck(false)
					anchor = y
				}
			})
		}
		addEventListener('scroll', place, { ...o, passive: true })
		addEventListener('resize', place, o)
		// Another tab changed consent or cleared journeys: follow it at once.
		addEventListener('storage', (ev) => {
			const e = ev as StorageEvent
			// What the other tab wrote, not what is left in storage now: a clear that follows must not undo it. A clear
			// ("key" null) or a removal reads as no change.
			if (e.key === consentKey(this.siteKey)) {
				const c = parseConsent(e.newValue)
				if (c === 'off') this.dispatch({ type: 'TURN_OFF' })
				else if (c === 'paused' || c === 'declined') this.dispatch({ type: 'PAUSE' })
				else if (c === 'granted' && this.state.rec === 'paused') void this.#openStore().then(() => this.dispatch({ type: 'RESUME', eligible: this.#eligible() }))
			} else if (e.key === SS(this.siteKey, 'cleared')) void this.#forgetSession()
			// A sample journey seeded in another tab: show it here too (ADR-0050 §6).
			else if (e.key === SS(this.siteKey, 'seeded') && e.newValue && (this.state.consent === 'granted' || this.state.consent === 'paused'))
				void this.#openStore().then(async (store) => {
					const s = await store?.session(e.newValue!.split(' ')[0])
					if (s && s.siteId === this.g.session.site.id && s.id !== this.session?.id) await this.#adopt(s)
				})
			// "Reset demo" in another tab, only once the consent really is gone (a forged key alone does nothing).
			else if (e.key === SS(this.siteKey, 'reset') && readConsent(this.siteKey) === 'unset') this.#forget()
		}, o)
		// Leaving or hiding the page: write what is buffered without delaying the navigation.
		addEventListener('pagehide', (e) => {
			this.#flush(true)
			this.#stashStep()
			this.#writeIndex(true)
			if (!(e as PageTransitionEvent).persisted) this.#contribute()
		}, o)
		document.addEventListener('visibilitychange', () => {
			if (document.visibilityState === 'hidden') {
				this.#flush(true)
				this.#writeIndex(true)
			}
		}, o)
		document.addEventListener('freeze', () => this.#flush(true), o)
		// Back to a page kept in the back-forward cache: a new visit.
		addEventListener('pageshow', (e) => {
			if ((e as PageTransitionEvent).persisted) void this.#route('pop')
		}, o)
		// In-app route changes (ADR-0030): the Navigation API where it exists, Back and Forward, and a
		// cheap check of the address for the rest. No history wrapping: the guide already does that once.
		const nav = (window as any).navigation
		if (nav && typeof nav.addEventListener === 'function') nav.addEventListener('currententrychange', () => queueMicrotask(() => void this.#route('push')), o)
		addEventListener('popstate', () => void this.#route('pop'), o)
		this.#every(500, () => {
			if (location.href !== this.#routeUrl) void this.#route('poll')
		})
		// The guide working on a plan outranks the timeline (ADR-0038 priority 3).
		this.#guideWatch = window.setInterval(() => {
			const busy = this.g.busy || this.g.executor.running
			if (busy && this.state.action !== 'guide-executing' && this.state.view === 'expanded') this.dispatch({ type: 'GUIDE_BUSY' })
			else if (busy && this.state.action === 'question-submitting') this.dispatch({ type: 'GUIDE_BUSY' })
			else if (!busy && this.state.action === 'guide-executing') this.dispatch({ type: 'GUIDE_IDLE' })
		}, 300)
		this.#timers.add(this.#guideWatch)
		this.#every(TRAIL_CONFIG.storage.flushMs, () => this.#flush())
		// Any link (navigation included): where the next page came from. Only cards and calls to action
		// inside the page name a source destination.
		document.addEventListener('click', (e) => {
			const a = (e.target as Element | null)?.closest?.('a[href]')
			if (a && this.state.consent === 'granted') this.#linkActivated(this.resolver?.resolve(e.target) || { via: 0 }, a)
		}, { ...o, capture: true })
		this.#every(TRAIL_CONFIG.recorder.privateFieldCheckMs, () => {
			if (this.state.rec === 'recording' && privateFieldsOnPage()) this.dispatch({ type: 'ROUTE', eligible: false })
		})
	}

	#every(ms: number, fn: () => void): void {
		this.#timers.add(window.setInterval(() => {
			try {
				fn()
			} catch (e) {
				console.warn('[voice-guide] trail', e)
			}
		}, ms))
	}

	// ---- the state machine ----

	dispatch(e: TrailEvent): void {
		const { state, effects } = reduce(this.state, e)
		const was = this.state
		this.state = state
		for (const fx of effects) this.#effect(fx)
		this.attention?.suspend(state.view === 'expanded' || state.consentCard)
		if (was.view !== state.view && state.view === 'expanded') void this.#openSheet()
		this.#render()
	}

	#effect(fx: Effect): void {
		try {
			switch (fx) {
				case 'startRecorder':
					void this.#startRecorder()
					break
				case 'stopRecorder':
					this.#stopRecorder()
					break
				case 'destroyReplayer':
					this.#destroyPreview()
					break
				case 'loadPreview':
					void this.#loadPreview()
					break
				case 'clearCurrent':
					void this.#clear(false)
					break
				case 'clearAll':
					void this.#clear(true)
					break
				case 'focusPill':
					this.view?.focusPill()
					break
				case 'submitQuestion':
					break
			}
		} catch (e) {
			console.warn('[voice-guide] trail', e)
		}
	}

	#intents(): ViewIntents {
		return {
			togglePill: () => {
				const s = this.state
				if (s.consent !== 'granted' && s.consent !== 'paused') {
					if (s.consentCard) this.dispatch({ type: 'COLLAPSE' })
					else this.dispatch({ type: 'OFFER' })
					return
				}
				// A page that shows the journey itself (the meta or a claim; ADR-0040, ADR-0050) is asked to open it;
				// anywhere else the guide's own sheet opens. The pill never leaves the page (S10, OD-5).
				if (this.hosted) return void dispatchEvent(new CustomEvent('vg:trail-open'))
				this.dispatch({ type: s.view === 'expanded' ? 'COLLAPSE' : 'EXPAND' })
			},
			allow: () => {
				writeConsent(this.siteKey, 'granted', this.settings.retentionHours)
				void this.#openStore().then((store) => {
					if (!store) return this.dispatch({ type: 'FAILURE' })
					this.dispatch({ type: 'CONSENT_GRANTED', eligible: this.#eligible() })
					void this.#enterPage('load')
					this.view?.announce(tt('recording', this.g.lang))
				})
			},
			notNow: () => {
				notNow(this.siteKey, true)
				this.dispatch({ type: 'COLLAPSE' })
				this.view?.focusPill()
			},
			pause: () => {
				writeConsent(this.siteKey, 'paused', this.settings.retentionHours)
				this.#flush()
				this.dispatch({ type: 'PAUSE' })
			},
			resume: () => {
				writeConsent(this.siteKey, 'granted', this.settings.retentionHours)
				void this.#openStore().then(() => {
					this.dispatch({ type: 'RESUME', eligible: this.#eligible() })
					if (!this.step) void this.#enterPage('load')
				})
			},
			clear: () => {
				this.dispatch({ type: 'CLEARED', all: false })
				this.view?.announce(tt('cleared', this.g.lang))
			},
			clearAll: () => {
				this.dispatch({ type: 'CLEARED', all: true })
				this.view?.announce(tt('clearedAll', this.g.lang))
			},
			turnOff: () => {
				writeConsent(this.siteKey, 'off', this.settings.retentionHours)
				this.dispatch({ type: 'TURN_OFF' })
				this.view?.announce(tt('turnedOff', this.g.lang))
				this.view?.focusPill()
			},
			close: () => {
				this.dispatch({ type: 'COLLAPSE' })
			},
			select: (stepId) => {
				this.#position = 0
				this.#transition = null
				this.dispatch({ type: 'SELECT_STEP', stepId })
				const st = this.session?.steps.find((s) => s.id === stepId)
				if (st) {
					const pages = this.session!.steps.filter((s) => s.type === 'page')
					this.view?.announce(tt('step', this.g.lang, { n: pages.indexOf(st) + 1, total: pages.length, title: this.#title(st.title) }))
				}
			},
			scrub: (stepId, f, how) => {
				if (this.state.selectedStepId !== stepId) return
				this.#position = f
				if (this.#preview) {
					this.#preview.seek(f * this.#preview.duration)
					this.dispatch({ type: 'SCRUB' })
				} else this.#render()
				this.#maybeTransition()
				if (how === 'keyboard') {
					const st = this.session?.steps.find((s) => s.id === stepId)
					this.view?.announce(tt('positionValue', this.g.lang, { pct: Math.round(f * 100), title: st ? this.#title(st.title) : '' }))
				}
			},
			hold: () => {
				// Holding still on a step plays on from there, at normal speed (never under reduced motion).
				if (this.reducedMotion || !this.#preview || this.state.preview === 'playing') return
				this.#preview.play(this.#position * this.#preview.duration)
				this.dispatch({ type: 'PLAY' })
			},
			leaveRail: () => {
				if (this.state.preview === 'playing' || this.state.preview === 'scrubbing') {
					this.#preview?.pause()
					this.dispatch({ type: 'STOP_PLAYBACK' })
				}
			},
			togglePlay: () => {
				if (!this.#preview) return
				if (this.state.preview === 'playing') {
					this.#preview.pause()
					this.dispatch({ type: 'STOP_PLAYBACK' })
				} else {
					const from = this.#position >= 0.999 ? 0 : this.#position
					// Reduced motion: no autoplay of the recorded cursor; Play shows the next frames on request only.
					this.#preview.play(from * this.#preview.duration)
					this.dispatch({ type: 'PLAY' })
				}
			},
			open: () => {
				if (!this.#preview && this.state.selectedStepId) void this.#loadPreview()
				else this.#intents().togglePlay()
			},
			chip: (item, q) => void this.#ask(item, q),
		}
	}

	#title(t: I18n | undefined): string {
		if (!t) return ''
		return t[this.g.lang] || t[this.g.lang.slice(0, 2)] || t.en || Object.values(t)[0] || ''
	}

	#render(): void {
		if (this.#subscribers.size) {
			const snap = this.#snapshot()
			for (const fn of this.#subscribers) {
				try {
					fn(snap)
				} catch (e) {
					console.warn('[voice-guide] trail host', e)
				}
			}
		}
		if (!this.view) return
		const s = this.state
		const steps = this.session?.steps || []
		const sel = steps.find((x) => x.id === s.selectedStepId)
		const notice = this.#notice || (s.rec === 'storage-full' ? tt('full', this.g.lang) : s.rec === 'error' ? tt('failed', this.g.lang) : s.rec === 'blocked' ? tt('notHere', this.g.lang) : null)
		this.view.render({
			...s,
			consentCard: s.consentCard || (s.rec === 'awaiting-consent' && s.view === 'expanded'),
			// On a page that hosts, the pill's job is done once the journey is open there (ADR-0040, ADR-0050).
			pillHidden: ((s.consent === 'unset' || s.consent === 'declined') && notNow(this.siteKey)) || (this.hosted && s.view === 'expanded'),
			lang: this.g.lang,
			steps,
			currentStepId: this.step?.id || null,
			position: this.#position,
			explored: sel ? (sel.id === this.step?.id ? this.#exploredNow() : sel.explored) : [],
			activeQuestionId: this.#activeQuestion,
			aggregation: this.settings.aggregation,
			retentionHours: this.settings.retentionHours,
			notice,
			reducedMotion: this.reducedMotion,
			transition: this.#transition,
			hosted: this.hosted,
		})
	}

	// ---- a page that shows the journey itself (the clone's Pocket by its meta, ADR-0040; the experience layer's Pocket by a claim, ADR-0050) ----

	#snapshot(): TrailHostSnapshot {
		const s = this.state
		const steps = this.session?.steps || []
		const sel = steps.find((x) => x.id === s.selectedStepId)
		return {
			consent: s.consent,
			rec: s.rec,
			open: s.view === 'expanded',
			preview: s.preview,
			action: s.action,
			lang: this.g.lang,
			// The asked questions are their own field, present only with a journey (ADR-0050 §5); steps keep the version 1 shape.
			steps: steps.map(({ asked: _, ...st }) => structuredClone(st)),
			...(s.consent === 'granted' || s.consent === 'paused' ? { asked: allAsked(steps) } : {}),
			currentStepId: this.step?.id || null,
			selectedStepId: s.selectedStepId,
			position: this.#position,
			explored: sel ? structuredClone(sel.id === this.step?.id ? this.#exploredNow() : sel.explored) : [],
			activeQuestionId: this.#activeQuestion,
			transition: this.#transition,
			retentionHours: this.settings.retentionHours,
			aggregation: this.settings.aggregation,
			reducedMotion: this.reducedMotion,
		}
	}

	/** The host's handle on the trail: the same intents the built-in sheet uses, nothing more. */
	hostApi(): TrailHostApi {
		const i = this.#intents()
		return {
			version: 2,
			snapshot: () => this.#snapshot(),
			subscribe: (fn) => {
				this.#subscribers.add(fn)
				fn(this.#snapshot())
				return () => void this.#subscribers.delete(fn)
			},
			claim: () => this.#claimHost(),
			setPreviewRoot: (el) => {
				this.#hostRoot = el
			},
			open: () => {
				if (this.state.consent !== 'granted' && this.state.consent !== 'paused') return
				this.dispatch({ type: 'EXPAND' })
			},
			close: () => this.dispatch({ type: 'COLLAPSE' }),
			select: (id) => i.select(id, 'pointer'),
			scrub: (id, f, how = 'pointer') => i.scrub(id, f, how),
			hold: () => i.hold(''),
			leave: () => i.leaveRail(),
			togglePlay: () => i.togglePlay(),
			ask: (destinationId, questionId) => {
				const sel = this.#snapshot().explored.find((x) => x.destinationId === destinationId)
				const q = sel ? (sel.questions[this.g.lang] || sel.questions[this.g.lang.slice(0, 2)] || []).find((x) => x.id === questionId) : undefined
				if (sel && q) void this.#ask(sel, q)
			},
			askAbout: (destinationId, questionId) => {
				const d = this.#destination(destinationId)
				const q = questionId ? this.#questions(d).find((x) => x.id === questionId) : undefined
				if (d && q) void this.#ask(d, q)
				// The asked questions do not depend on the destination being on this page's map: they were kept on their own step.
				return this.state.consent === 'granted' || this.state.consent === 'paused' ? allAsked(this.session?.steps || []).filter((x) => x.destinationId === destinationId) : []
			},
			questionsFor: (destinationId) => structuredClone(this.#questions(this.#destination(destinationId))),
			allow: () => i.allow(),
			notNow: () => i.notNow(),
			pause: () => i.pause(),
			resume: () => i.resume(),
			clear: () => i.clear(),
			clearAll: () => i.clearAll(),
			turnOff: () => i.turnOff(),
			seed: (j) => this.#seed(j),
			reset: () => this.#reset(),
			t: (key, vars) => tt(key, this.g.lang, vars),
		}
	}

	/**
	 * A host takes the journey (ADR-0050): one at a time. A claim made while the guide's own sheet is open
	 * hands over (the sheet closes, then the host is asked to open). The returned function gives it back, once:
	 * the journey closes, its preview goes, the host's preview root is emptied, and the pill works again at once.
	 */
	#claimHost(): (() => void) | null {
		if (this.hosted) return null
		const mine = {}
		this.#claim = mine
		const handOver = this.state.view === 'expanded'
		if (handOver) this.dispatch({ type: 'COLLAPSE' })
		this.#render()
		if (handOver)
			setTimeout(() => {
				if (this.#claim === mine) dispatchEvent(new CustomEvent('vg:trail-open'))
			}, 0)
		return () => {
			if (this.#claim !== mine) return
			this.#claim = null
			// Collapsing destroys the preview (the state machine's effect).
			this.dispatch({ type: 'COLLAPSE' })
			this.#hostRoot?.replaceChildren()
			this.#hostRoot = null
			this.#render()
		}
	}

	/** Tells a host page the trail is ready (the API as `voiceGuide.trailHost` and the event's detail). */
	#announceHost(): void {
		const api = this.hostApi()
		;(this.g as unknown as { trailHost?: TrailHostApi }).trailHost = api
		dispatchEvent(new CustomEvent('vg:trail-ready', { detail: api }))
	}

	// ---- steps ----

	/** A full page load (or consent just given): continue the journey or start one, then a step for this page. */
	async #enterPage(signal: RouteSignal): Promise<void> {
		try {
			const now = Date.now()
			this.session = await this.#currentSession(now)
			if (!this.session) return
			this.#applyStash(this.session)
			await this.#recoverSpill()
			const pending = ssGet<PendingTransition & { crossOrigin?: boolean; targetTitle?: I18n }>(SS(this.siteKey, 'pending'))
			ssSet(SS(this.siteKey, 'pending'), null)
			const navType = (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined)?.type
			await this.#nextStep(signal, now, pending, navType)
		} catch (e) {
			console.warn('[voice-guide] trail', e)
			this.dispatch({ type: 'FAILURE' })
		}
	}

	async #currentSession(now: number): Promise<TrailSession | null> {
		if (!this.store) return null
		const id = ssGet<string>(SS(this.siteKey, 'session'))
		let s = id ? await this.store.session(id).catch(() => null) : null
		const cfg = TRAIL_CONFIG.storage
		if (s && (s.expiresAt <= now || now - s.startedAt > cfg.maxSessionMs || s.siteId !== this.g.session.site.id)) s = null
		if (!s) {
			s = { schema: TRAIL_SCHEMA, id: rid('trs'), siteId: this.g.session.site.id, kbVersionId: this.map?.kbVersionId || undefined, locale: this.g.lang, startedAt: now, updatedAt: now, expiresAt: now + this.settings.retentionHours * 3_600_000, recordingState: 'recording', bytes: 0, steps: [] }
			ssSet(SS(this.siteKey, 'session'), s.id)
			await this.store.putSession(s).catch((e) => this.#storageError(e))
		}
		return s
	}

	async #nextStep(signal: RouteSignal, now: number, pending: (PendingTransition & { crossOrigin?: boolean; targetTitle?: I18n }) | null, navType?: string, fresh = false): Promise<void> {
		const s = this.session
		if (!s) return
		const why = this.#eligibility()
		const eligible = why.ok
		const path = canonicalPath(location.href, this.map?.keepQuery || [])
		// The person left the origin and came back: show where the journey went in between.
		if (pending?.crossOrigin && now - pending.at < 30 * 60_000) s.steps.push(this.#boundaryStep(s, 'cross-origin', pending.at, pending.targetPageId, pending.targetTitle))
		const last = s.steps.at(-1)
		if (!eligible && why.reason === 'opted-out') {
			// A public page that is not part of journeys: browsed normally, named on the timeline, never saved.
			if (last?.type !== 'boundary' || last.boundary !== 'unsaved' || last.canonicalPath !== path) s.steps.push({ ...this.#boundaryStep(s, 'unsaved', now, this.map?.page?.id, this.#pageTitle()), canonicalPath: path })
			this.step = null
			this.dispatch({ type: 'ROUTE', eligible: false })
			this.#writeIndex(true)
			if (this.state.consent === 'granted') this.view?.toast(tt('notHere', this.g.lang))
			return
		}
		if (!eligible) {
			// Stop before anything from this page is kept; leave only "a private page" on the timeline.
			if (last?.type !== 'boundary' || last.boundary !== 'private') s.steps.push(this.#boundaryStep(s, 'private', now, this.map?.page && !this.map.page.eligible ? this.map.page.id : undefined))
			this.step = null
			this.dispatch({ type: 'ROUTE', eligible: false })
			this.#writeIndex(true)
			return
		}
		// After a sample journey, the page the person is on is always a step of its own (ADR-0050 §6).
		const d = fresh ? ({ action: 'new', cause: { kind: 'direct' } } as const) : decideStep({ current: last?.type === 'page' ? last : undefined, path, signal, navType: navType as never, pending, now })
		if (d.action === 'continue' && last?.type === 'page') {
			this.step = last
		} else if (d.action === 'replace' && last?.type === 'page') {
			last.canonicalPath = path
			last.title = this.#pageTitle()
			last.pageId = this.map?.page?.id
			this.step = last
		} else {
			if (this.step) this.#finishStep()
			const st: TrailStepSummary = { id: rid('stp'), sessionId: s.id, type: 'page', pageId: this.map?.page?.id, canonicalPath: path, title: this.#pageTitle(), enteredAt: now, durationMs: 0, navigationCause: d.cause, topDestinationIds: [], explored: [], replay: 'ok' }
			s.steps.push(st)
			this.step = st
			this.#chunkSeq = 0
			// Steps beyond the limit roll off, oldest first, with their replay.
			while (s.steps.filter((x) => x.type === 'page').length > TRAIL_CONFIG.storage.maxSteps) {
				const old = s.steps.shift()
				if (old?.type === 'page') void this.store?.deleteStepReplay(old.id).catch(() => {})
			}
		}
		this.#setupAttention()
		this.dispatch({ type: 'ROUTE', eligible: true })
		if (this.state.rec === 'recording') this.#recorder?.snapshot()
		this.#writeIndex(true)
	}

	/**
	 * IndexedDB writes started while a page unloads may not finish; the step's summary (what was
	 * explored, how long) also goes to sessionStorage synchronously and is merged on the next page.
	 */
	#stashStep(): void {
		if (!this.step || this.step.type !== 'page' || !this.session) return
		this.attention?.checkpoint()
		this.step.explored = this.#exploredNow()
		this.step.topDestinationIds = this.step.explored.map((x) => x.destinationId)
		this.step.leftAt = Date.now()
		ssSet(SS(this.siteKey, 'last'), { sessionId: this.session.id, step: this.step })
	}

	#applyStash(s: TrailSession): void {
		const x = ssGet<{ sessionId: string; step: TrailStepSummary }>(SS(this.siteKey, 'last'))
		ssSet(SS(this.siteKey, 'last'), null)
		if (!x || x.sessionId !== s.id || !x.step?.id) return
		const i = s.steps.findIndex((st) => st.id === x.step.id)
		if (i >= 0) s.steps[i] = { ...s.steps[i], ...x.step, durationMs: Math.max(s.steps[i].durationMs, x.step.durationMs || 0) }
		else if (x.step.type === 'page') s.steps.push(x.step)
	}

	#boundaryStep(s: TrailSession, kind: 'private' | 'cross-origin' | 'unsaved', at: number, pageId?: string, title?: I18n): TrailStepSummary {
		const known = pageId ? this.map?.pages.find((p) => p.id === pageId) : undefined
		return { id: rid('stp'), sessionId: s.id, type: 'boundary', boundary: kind, pageId, title: title || known?.title || {}, enteredAt: at, durationMs: 0, navigationCause: { kind: 'destination' }, topDestinationIds: [], explored: [], replay: 'none' }
	}

	#pageTitle(): I18n {
		const t = this.map?.page?.title
		if (t && Object.keys(t).length) return t
		return { [this.g.lang]: (document.title || location.pathname).split('|').pop()!.trim().slice(0, 80) }
	}

	/** In-app route changes and Back/Forward: same rules as a page load, plus a fresh full snapshot. */
	async #route(signal: RouteSignal): Promise<void> {
		if (location.href === this.#routeUrl) return
		const from = this.#routeUrl
		this.#routeUrl = location.href
		if (canonicalPath(from) === canonicalPath(location.href) && signal !== 'pop') return
		if (this.state.view === 'expanded') this.dispatch({ type: 'COLLAPSE' })
		if (this.state.consent !== 'granted') return
		this.#flush()
		this.map = await this.g.api.get<PageMap>(`/v1/experience?url=${encodeURIComponent(location.href)}`).catch(() => this.map)
		const pending = ssGet<PendingTransition>(SS(this.siteKey, 'pending'))
		ssSet(SS(this.siteKey, 'pending'), null)
		await this.#nextStep(signal, Date.now(), pending)
	}

	#setupAttention(): void {
		if (!this.map || !this.step) return
		const stepId = this.step.id
		if (this.attention && this.resolver && this.resolver.map === this.map) {
			if (this.attention.stepId !== stepId) this.attention.newStep(stepId)
			return
		}
		this.attention?.stop()
		this.resolver = new Resolver(this.map)
		this.attention = new AttentionTracker(this.resolver, stepId, { onChange: () => this.#writeIndex(false) })
		this.attention.start()
	}

	/** A link inside the page was activated: remember where it leads, for the next step's cause (same tab only). */
	#linkActivated(r: { destinationId?: string; via: number }, el: Element): void {
		const a = el.closest('a[href]') as HTMLAnchorElement | null
		if (!a || !this.step || (a.target && a.target !== '_self')) return
		let target: URL
		try {
			target = new URL(a.href)
		} catch {
			return
		}
		const crossOrigin = target.origin !== location.origin
		const keep = this.map?.keepQuery || []
		const path = canonicalPath(target.href, keep)
		const key = `${target.origin}${target.pathname.endsWith('/') ? `${target.pathname}index.html` : target.pathname}`
		const page = this.map?.pages.find((p) => p.paths.some((x) => x.split('?')[0] === key))
		// The page is about to go: write what is buffered while it is still alive.
		this.#flush(true)
		ssSet(SS(this.siteKey, 'pending'), {
			fromStepId: this.step.id,
			sourceDestinationId: r.via === 4 ? undefined : r.destinationId,
			target: path,
			targetPageId: page?.id,
			at: Date.now(),
			...(crossOrigin ? { crossOrigin: true, targetTitle: page?.title || { [this.g.lang]: target.host } } : {}),
		})
	}

	#finishStep(): void {
		if (!this.step || this.step.type !== 'page') return
		this.step.leftAt = Date.now()
		this.step.explored = this.#exploredNow()
		this.step.topDestinationIds = this.step.explored.map((x) => x.destinationId)
		void this.store?.putInterest(this.session!.id, this.attention?.records() || []).catch(() => {})
	}

	/** The catalog for this page: its destinations and the site's pages (for links that led somewhere). */
	#catalog(): Map<string, CatalogEntry> {
		const c = new Map<string, CatalogEntry>()
		const m = this.map
		if (!m) return c
		for (const d of m.destinations) c.set(d.id, { id: d.id, pageId: m.page?.id || '', kind: d.kind, topic: d.topic, title: d.title, context: d.context, questions: d.questions, popular: d.popular, excluded: this.resolver?.containers.has(d.id) })
		for (const p of m.pages) c.set(p.id, { id: p.id, pageId: p.id, kind: 'page', topic: p.id, title: p.title, context: p.title, questions: p.questions, excluded: !p.eligible || p.id === m.page?.id })
		return c
	}

	#exploredNow(): ExploredItem[] {
		if (!this.attention) return this.step?.explored || []
		return selectTop(this.attention.records(), this.#catalog())
	}

	// ---- recording ----

	async #startRecorder(): Promise<void> {
		if (this.#recorder || !this.store) return
		try {
			const w = window as any
			if (!w.__vgTrailRecord) await loadScript(`${this.g.o.gateway}/sdk/trail-record.js`)
			if (this.state.rec !== 'recording') return
			const t0 = performance.now()
			// Before rrweb's first emit, so its Meta and full snapshot land in the same chunk.
			this.#chunkStartedAt = Date.now()
			this.#recorder = w.__vgTrailRecord.startRecording(recorderOptions(this.policy), (e: RawEvent) => this.#onEvent(e), (err: unknown) => {
				console.warn('[voice-guide] trail recorder', err)
			})
			if (!this.#recorder) throw new Error('recorder did not start')
			;(window as any).__vgTrailInitMs = Math.round(performance.now() - t0)
		} catch (e) {
			console.warn('[voice-guide] trail recorder unavailable', e)
			this.#recorder = null
			this.dispatch({ type: 'FAILURE' })
		}
	}

	#stopRecorder(): void {
		this.#recorder?.stop()
		this.#recorder = null
		this.#flush()
	}

	#onEvent(e: RawEvent): void {
		// The address changed under the recorder (an in-app route): only keep events while it still
		// shows the step's page; anything after a move to a private route is dropped, never stored.
		if (!this.step || this.state.rec !== 'recording') return
		const path = canonicalPath(location.href, this.map?.keepQuery || [])
		if (path !== this.step.canonicalPath) {
			if (!eligibility({ url: location.href, siteOrigins: this.#siteOrigins(), policy: this.policy, hasPrivateFields: false }).ok) {
				this.#buffer = []
				this.#bufferBytes = 0
				this.dispatch({ type: 'ROUTE', eligible: false })
			}
			return
		}
		this.#buffer.push(e)
		this.#bufferBytes += 64
		if (e.type === 2 || e.type === 3) this.#bufferBytes += 512
		if (this.#bufferBytes >= TRAIL_CONFIG.storage.chunkBytes || Date.now() - this.#chunkStartedAt >= TRAIL_CONFIG.storage.chunkMs) this.#flush()
	}

	/** Writes buffered events as one chunk. Never awaited by navigation; writes are chained in order. */
	#flush(urgent = false): void {
		const step = this.step
		const session = this.session
		if (this.#buffer.length && step && session && this.store) {
			const events = this.#buffer
			this.#buffer = []
			this.#bufferBytes = 0
			this.#chunkStartedAt = Date.now()
			const c: InflightChunk = { id: `${step.id}:${this.#chunkSeq}`, seq: this.#chunkSeq++, sessionId: session.id, step, t0: events[0].timestamp, t1: events.at(-1)!.timestamp, events }
			step.firstEventAt ??= c.t0
			step.durationMs = Math.max(step.durationMs, c.t1 - step.firstEventAt)
			this.#inflight.set(c.id, c)
			if (!urgent) {
				const write = () => this.#writeChunk(c, false)
				this.#writing = this.#writing.then(write, write)
			}
		}
		// Leaving the page: every chunk not yet stored (including compressed writes still in progress)
		// is written now as plain JSON, and kept in sessionStorage (same tab) in case the browser aborts
		// the write with the unload; the next page finishes it.
		if (urgent && this.#inflight.size) {
			const spill: SpilledChunk[] = []
			let size = 0
			for (const c of this.#inflight.values()) {
				const json = JSON.stringify(c.events)
				size += json.length
				if (size < 1_500_000) spill.push({ id: c.id, sessionId: c.sessionId, stepId: c.step.id, seq: c.seq, t0: c.t0, t1: c.t1, json })
				void this.#writeChunk(c, true, json)
			}
			ssSet(SS(this.siteKey, 'spill'), spill)
		}
	}

	async #writeChunk(c: InflightChunk, urgent: boolean, json?: string): Promise<void> {
		try {
			const enc = urgent ? { enc: 'json' as const, data: json ?? JSON.stringify(c.events), bytes: 0 } : await encodeEvents(c.events)
			if (enc.enc === 'json') enc.bytes = (enc.data as string).length * 2
			// Written already as JSON on the way out: the compressed copy is not needed.
			if (!urgent && !this.#inflight.has(c.id)) return
			await this.store!.putChunk({ id: c.id, sessionId: c.sessionId, stepId: c.step.id, seq: c.seq, t0: c.t0, t1: c.t1, bytes: enc.bytes, enc: enc.enc, data: enc.data })
			if (!this.#inflight.delete(c.id)) return
			const session = this.session?.id === c.sessionId ? this.session : null
			if (session) {
				session.bytes += enc.bytes
				session.updatedAt = Date.now()
			}
			c.step.bytes = (c.step.bytes || 0) + enc.bytes
			this.#writeIndex(urgent)
			if (Date.now() - this.#lastEviction > 30_000) void this.#evict()
		} catch (e) {
			this.#storageError(e)
		}
	}

	/** Finishes chunks the previous page could not write before it unloaded. */
	async #recoverSpill(): Promise<void> {
		const spill = ssGet<SpilledChunk[]>(SS(this.siteKey, 'spill'))
		ssSet(SS(this.siteKey, 'spill'), null)
		if (!Array.isArray(spill) || !this.store) return
		for (const x of spill) {
			if (typeof x?.json !== 'string') continue
			const step = this.session?.id === x.sessionId ? this.session.steps.find((st) => st.id === x.stepId) : undefined
			if (!step) continue
			const bytes = x.json.length * 2
			await this.store.putChunk({ id: x.id, sessionId: x.sessionId, stepId: x.stepId, seq: x.seq, t0: x.t0, t1: x.t1, bytes, enc: 'json', data: x.json }).catch((e) => this.#storageError(e))
			step.firstEventAt = Math.min(step.firstEventAt ?? x.t0, x.t0)
			step.durationMs = Math.max(step.durationMs, x.t1 - step.firstEventAt)
		}
	}

	#storageError(e: unknown): void {
		if (e instanceof QuotaError || (e as DOMException)?.name === 'QuotaExceededError') {
			this.dispatch({ type: 'STORAGE_FULL' })
			void this.#evict()
		} else console.warn('[voice-guide] trail storage', e)
	}

	/** The small session index, at most every couple of seconds (or now, when leaving). */
	#writeIndex(now: boolean): void {
		if (!this.session || !this.store) return
		const run = () => {
			this.#indexPending = 0
			this.#lastIndexWrite = Date.now()
			const s = this.session
			if (!s) return
			if (this.step?.type === 'page') {
				this.step.explored = this.#exploredNow()
				this.step.topDestinationIds = this.step.explored.map((x) => x.destinationId)
			}
			s.updatedAt = Date.now()
			s.recordingState = this.state.rec === 'recording' ? 'recording' : this.state.rec === 'paused' ? 'paused' : 'stopped'
			const snapshot = structuredClone(s)
			this.#writing = this.#writing.then(() => this.store?.putSession(snapshot).catch((e) => this.#storageError(e)))
			if (this.attention && this.step) void this.store?.putInterest(s.id, this.attention.records()).catch(() => {})
			if (this.state.view === 'expanded') this.#render()
		}
		if (now) return run()
		if (this.#indexPending) return
		const wait = Math.max(0, TRAIL_CONFIG.storage.indexWriteMs - (Date.now() - this.#lastIndexWrite))
		this.#indexPending = window.setTimeout(run, wait)
		this.#timers.add(this.#indexPending)
	}

	async #evict(): Promise<void> {
		if (!this.store) return
		this.#lastEviction = Date.now()
		try {
			const sessions = await this.store.sessions()
			// Sizes come from the small index: checking the budget never reads a replay chunk.
			const bytes = new Map(sessions.flatMap((s) => s.steps.map((st) => [st.id, st.bytes || 0] as const)))
			for (const st of this.session?.steps || []) bytes.set(st.id, st.bytes || 0)
			const plan = planEviction(sessions, Date.now(), this.session?.id || null, (_s, stepId) => bytes.get(stepId) || 0)
			for (const id of plan.sessions) await this.store.deleteSession(id)
			for (const x of plan.steps) {
				await this.store.deleteStepReplay(x.stepId)
				const st = this.session?.steps.find((s) => s.id === x.stepId)
				if (st) st.replay = 'evicted'
				if (this.session) this.session.bytes = Math.max(0, this.session.bytes - x.bytes)
			}
			if (plan.steps.length) this.#writeIndex(true)
		} catch (e) {
			console.warn('[voice-guide] trail eviction', e)
		}
	}

	async #clear(all: boolean): Promise<void> {
		const keepRecording = this.state.rec === 'recording'
		this.#buffer = []
		this.#bufferBytes = 0
		this.#inflight.clear()
		ssSet(SS(this.siteKey, 'spill'), null)
		const old = this.session
		this.session = null
		this.step = null
		ssSet(SS(this.siteKey, 'session'), null)
		try {
			await this.#writing
			const exists = this.store || (await indexedDB.databases?.().then((d) => d.some((x) => x.name === TRAIL_CONFIG.storage.db)).catch(() => true))
			const store = exists ? await this.#openStore() : null
			if (all) await store?.clearAll()
			else if (old) await store?.deleteSession(old.id)
			try {
				localStorage.setItem(SS(this.siteKey, 'cleared'), String(Date.now()))
			} catch {}
		} catch (e) {
			console.warn('[voice-guide] trail clear', e)
		}
		// Consent is unchanged: from now on this page is the start of a new journey.
		if (keepRecording && this.state.consent === 'granted') await this.#enterPage('load')
		this.#render()
	}

	async #forgetSession(): Promise<void> {
		this.#buffer = []
		this.#inflight.clear()
		const id = this.session?.id
		if (!id || !this.store) return
		const still = await this.store.session(id).catch(() => null)
		if (still) return
		this.session = null
		this.step = null
		ssSet(SS(this.siteKey, 'session'), null)
		if (this.state.rec === 'recording') await this.#enterPage('load')
		this.#render()
	}

	// ---- the demo kit (ADR-0050 §6): a sample journey, and "Reset demo" ----

	/**
	 * Replaces the current journey with a checked sample (seed.ts), only with all four: the session's demo kit,
	 * consent granted, a press on the page right now, a page the trail records. Never throws to the page.
	 */
	async #seed(j: unknown): Promise<SeedResult> {
		const store = this.store
		const why = this.settings.demoKit !== true ? 'not-a-demo' : this.state.consent !== 'granted' ? 'no-consent' : (navigator as any).userActivation?.isActive !== true ? 'no-press' : !this.#eligible() ? 'not-here' : !store ? 'failed' : this.#seeding ? 'busy' : ''
		if (why) return { ok: false, reason: why }
		this.#seeding = true
		try {
			const r = await checkSeed(j, { now: Date.now(), origin: location.origin, siteId: this.g.session.site.id, kbVersionId: this.map?.kbVersionId || undefined, retentionHours: this.settings.retentionHours, recordingState: this.state.rec === 'recording' ? 'recording' : 'stopped', id: rid })
			if (!r.ok) return r
			const s = r.session
			try {
				for (const c of r.chunks) {
					const st = s.steps.find((x) => x.id === c.stepId)!
					const enc = await encodeEvents(c.events)
					if (enc.enc === 'json') enc.bytes = (enc.data as string).length * 2
					await store!.putChunk({ id: `${st.id}:0`, sessionId: s.id, stepId: st.id, seq: 0, t0: c.events[0].timestamp, t1: c.events.at(-1)!.timestamp, ...enc })
					st.replay = 'ok'
					st.bytes = enc.bytes
					s.bytes += enc.bytes
				}
				await store!.putSession(s)
				// Consent may have changed while the sample was being written.
				if (this.state.consent !== 'granted') throw new Error('consent changed')
			} catch {
				await store!.deleteSession(s.id).catch(() => {})
				return { ok: false, reason: this.state.consent !== 'granted' ? 'no-consent' : 'failed' }
			}
			const old = this.session
			await this.#adopt(s)
			if (old && old.id !== s.id) await store!.deleteSession(old.id).catch(() => {})
			try {
				localStorage.setItem(SS(this.siteKey, 'seeded'), `${s.id} ${Date.now()}`)
			} catch {}
			return { ok: true }
		} catch (e) {
			console.warn('[voice-guide] trail seed', e)
			return { ok: false, reason: 'failed' }
		} finally {
			this.#seeding = false
		}
	}

	/** Shows a journey from the store as the current one; the page the person is on becomes a new step after it. */
	async #adopt(s: TrailSession): Promise<void> {
		this.#buffer = []
		this.#bufferBytes = 0
		this.#inflight.clear()
		for (const k of ['spill', 'pending', 'last']) ssSet(SS(this.siteKey, k), null)
		ssSet(SS(this.siteKey, 'session'), s.id)
		this.session = s
		this.step = null
		this.#destroyPreview()
		if (this.state.view !== 'expanded') this.state = { ...this.state, selectedStepId: null }
		await this.#writing
		await this.#nextStep('load', Date.now(), null, undefined, true)
		if (this.state.view === 'expanded') await this.#openSheet()
		this.#render()
	}

	/** "Reset demo": every journey and both consent copies removed, the recorder stopped, the offer shown; other tabs follow. */
	async #reset(): Promise<SeedResult> {
		if (this.settings.demoKit !== true) return { ok: false, reason: 'not-a-demo' }
		try {
			this.#forget()
			await forgetConsent(this.siteKey)
			try {
				localStorage.setItem(SS(this.siteKey, 'reset'), String(Date.now()))
			} catch {}
			await this.#clear(true)
			return { ok: true }
		} catch (e) {
			console.warn('[voice-guide] trail reset', e)
			return { ok: false, reason: 'failed' }
		}
	}

	/** This tab's side of a reset: nothing buffered is written, no journey, no choice. Touches no storage but this tab's own. */
	#forget(): void {
		this.#buffer = []
		this.#bufferBytes = 0
		this.#inflight.clear()
		this.session = null
		this.step = null
		for (const k of ['session', 'spill', 'pending', 'last']) ssSet(SS(this.siteKey, k), null)
		forgetNotNow(this.siteKey)
		this.dispatch({ type: 'RESET' })
	}

	// ---- the timeline ----

	async #openSheet(): Promise<void> {
		if (!this.session && this.store && this.state.consent === 'granted') this.session = await this.#currentSession(Date.now())
		this.#flush()
		this.#writeIndex(true)
		const pages = this.session?.steps.filter((s) => s.type === 'page') || []
		// On the clone's Pocket page (the meta) the journey is about where the person has been, not the page
		// they are on: that page is not a step of interest. A live page that hosts is a real step of the visit (ADR-0050).
		const start = this.#metaHost ? (pages.filter((p) => p.id !== this.step?.id).at(-1) ?? pages.at(-1)) : this.step?.type === 'page' ? this.step : pages.at(-1)
		if (start) this.#intents().select(start.id, 'keyboard')
		this.#render()
		if (!this.hosted) requestAnimationFrame(() => this.view?.focusSheet())
	}

	/** Loads only the selected step's chunks and the replayer chunk, then shows its first frame. */
	async #loadPreview(): Promise<void> {
		const token = ++this.#previewToken
		const stepId = this.state.selectedStepId
		const st = this.session?.steps.find((s) => s.id === stepId)
		if (!st || !this.store || !this.view) return
		try {
			if (st.replay !== 'ok') throw new Error('no replay for this step')
			if (st.id === this.step?.id) this.#flush()
			await this.#writing
			const w = window as any
			const [chunks] = await Promise.all([this.store.chunks(st.id), w.__vgTrailReplay ? null : loadScript(`${this.g.o.gateway}/sdk/trail-replay.js`)])
			const events: RawEvent[] = []
			for (const [i, c] of chunks.entries()) {
				try {
					events.push(...(await decodeChunk(c)))
				} catch (e) {
					// A damaged first chunk means there is no snapshot to start from; later ones just end the memory early.
					if (i === 0 || !(e instanceof CorruptChunk)) throw e
					break
				}
			}
			if (token !== this.#previewToken || this.state.selectedStepId !== stepId) return
			const t0 = performance.now()
			const opts: PreviewOptions = {
				root: (this.hosted && this.#hostRoot) || this.view.frame,
				events,
				origin: location.origin,
				assetPaths: this.settings.replayAssetPaths || [],
				reducedMotion: this.reducedMotion,
				label: tt('memory', this.g.lang, { title: this.#title(st.title) }),
				onTime: (ms) => {
					if (!this.#preview) return
					this.#position = this.#preview.duration ? Math.min(1, ms / this.#preview.duration) : 0
					this.#maybeTransition()
					this.#render()
				},
				onFinish: () => this.dispatch({ type: 'STOP_PLAYBACK' }),
			}
			const preview = (await w.__vgTrailReplay.createPreview(opts)) as Preview
			if (token !== this.#previewToken) return preview.destroy()
			this.#preview = preview
			;(window as any).__vgTrailPreviewMs = Math.round(performance.now() - t0)
			this.dispatch({ type: 'PREVIEW_READY' })
		} catch (e) {
			if (token !== this.#previewToken) return
			console.info('[voice-guide] trail preview', (e as Error)?.message)
			this.dispatch({ type: 'PREVIEW_FAILED' })
		}
	}

	#destroyPreview(): void {
		this.#previewToken++
		this.#preview?.destroy()
		this.#preview = null
		this.#transition = null
	}

	/** Reaching the end of a step that a link or call to action left: show where it led. */
	#maybeTransition(): void {
		const steps = this.session?.steps || []
		const i = steps.findIndex((s) => s.id === this.state.selectedStepId)
		const next = steps[i + 1]
		const near = this.#position >= 0.97
		this.#transition = near && next && next.navigationCause.kind === 'destination' ? tt('ledTo', this.g.lang, { title: next.type === 'boundary' && next.boundary === 'private' ? tt('privatePage', this.g.lang) : this.#title(next.title) }) : null
	}

	// ---- questions: an ordinary guide turn, with a hint the server checks (ADR-0038) ----

	/** An answered turn: what it was about goes on the current page step, while recording (ADR-0050 §5). */
	#answered(origin: AskOrigin, plan: unknown): void {
		const step = this.step
		if (this.state.rec !== 'recording' || step?.type !== 'page' || !this.session) return
		const q = askedFrom(plan, origin, Date.now(), rid('ask'))
		if (!q) return
		addAsked(step, q)
		this.#writeIndex(true)
		this.#render()
	}

	/** A destination by id: from what was explored on any step (newest first), else this page's map, else the site's pages. */
	#destination(id: string): Pick<ExploredItem, 'destinationId' | 'pageId' | 'questions'> | undefined {
		for (const st of [...(this.session?.steps || [])].reverse()) {
			const x = (st.id === this.step?.id ? this.#exploredNow() : st.explored).find((e) => e.destinationId === id)
			if (x) return x
		}
		const m = this.map
		const d = m?.destinations.find((x) => x.id === id)
		if (d) return { destinationId: d.id, pageId: m!.page?.id || '', questions: d.questions }
		const p = m?.pages.find((x) => x.id === id)
		return p && { destinationId: p.id, pageId: p.id, questions: p.questions }
	}

	/** The verified questions of a destination in the guide's language, or its first two letters. */
	#questions(d: Pick<ExploredItem, 'questions'> | undefined): { id: string; text: string; intent: string }[] {
		return (d && (d.questions[this.g.lang] || d.questions[this.g.lang.slice(0, 2)])) || []
	}

	async #ask(item: Pick<ExploredItem, 'destinationId' | 'pageId'>, q: { id: string; text: string }): Promise<void> {
		this.#activeQuestion = q.id
		this.dispatch({ type: 'QUESTION' })
		const v = this.g.ui.voice
		try {
			v?.finalize(q.text)
			v?.setState('thinking')
		} catch {}
		// Without a voice the answer must still be seen: the guide's existing panel shows it.
		if (!this.g.speech.canSpeak || this.g.speech.muted) this.g.ui.open()
		try {
			await this.g.request(q.text, 'chip', q.text, undefined, undefined, { source: 'trail-suggestion', destinationId: item.destinationId, pageId: item.pageId, trailStepId: this.state.selectedStepId || this.step?.id, questionId: q.id })
		} catch (e) {
			console.warn('[voice-guide] trail question', e)
		} finally {
			this.#activeQuestion = null
			if (this.state.action !== 'none') this.dispatch({ type: 'GUIDE_IDLE' })
		}
	}

	// ---- approved aggregation only (ADR-0037 §6; off unless the site and platform both enable it) ----

	#contribute(): void {
		if (!this.settings.aggregation || !this.map?.kbVersionId || !this.attention) return
		const dayKey = SS(this.siteKey, 'contributed')
		const day = new Date().toISOString().slice(0, 10)
		try {
			if (localStorage.getItem(dayKey) === day) return
		} catch {
			return
		}
		const known = new Map<string, string>()
		for (const d of this.map.destinations) if (this.map.page) known.set(d.id, this.map.page.id)
		const batch = contributionBatch({ siteId: this.g.session.site.id, kbVersionId: this.map.kbVersionId, records: this.attention.records(), knownDestinations: known, now: Date.now() })
		if (!batch) return
		try {
			localStorage.setItem(dayKey, day)
		} catch {}
		void this.g.api.post('/v1/experience/contributions', batch, { keepalive: true }).catch(() => {})
	}

	// ---- teardown ----

	destroy(): void {
		this.dispatch({ type: 'TEARDOWN' })
		this.#unwatch?.()
		this.#unwatch = null
		this.#flush(true)
		this.attention?.stop()
		this.attention = null
		this.#abort.abort()
		for (const t of this.#timers) {
			clearInterval(t)
			clearTimeout(t)
		}
		this.#timers.clear()
		this.view?.destroy()
		this.view = null
		this.#style?.remove()
		void this.#writing.finally(() => this.store?.close())
		const w = window as any
		if (w.__vgTrailActive === this) w.__vgTrailActive = null
	}
}

export async function startTrail(g: GuideLike): Promise<TrailController | null> {
	const settings = g.session.site.trail
	if (!settings?.enabled) return null
	try {
		const c = new TrailController(g, settings)
		await c.start()
		;(g as unknown as { trail?: TrailController }).trail = c
		return c
	} catch (e) {
		console.warn('[voice-guide] trail failed to start', e)
		return null
	}
}
