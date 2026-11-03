/**
 * Collects attention on knowledge destinations for the current step (SPEC-06 §4), with delegated
 * listeners and one IntersectionObserver: no per-mousemove DOM queries. Pointer visits shorter
 * than the pass-through threshold count against an element; time is not counted while the tab is
 * hidden or the trail itself covers the page. Records stay in this browser.
 */
import { TRAIL_CONFIG } from './config.ts'
import { emptyInterest, settle } from './interest.ts'
import type { Resolution, Resolver } from './resolver.ts'
import type { ElementInterest } from './types.ts'

type Attention = (typeof TRAIL_CONFIG)['attention']

export interface AttentionHooks {
	onChange?(): void
}

export class AttentionTracker {
	readonly resolver: Resolver
	readonly cfg: Attention
	readonly hooks: AttentionHooks
	stepId: string
	#records = new Map<string, ElementInterest & { episodes: number; lastEndAt: number }>()
	#hover: { key: string; at: number } | null = null
	#focus: { key: string; at: number } | null = null
	#visible = new Set<string>()
	#io: IntersectionObserver | null = null
	#mo: MutationObserver | null = null
	#elKey = new WeakMap<Element, string>()
	#tick = 0
	#lastTick = 0
	#reindex = 0
	#suspended = false
	#abort = new AbortController()

	constructor(resolver: Resolver, stepId: string, hooks: AttentionHooks = {}, cfg: Attention = TRAIL_CONFIG.attention) {
		this.resolver = resolver
		this.stepId = stepId
		this.hooks = hooks
		this.cfg = cfg
	}

	start(): void {
		const o = { capture: true, passive: true, signal: this.#abort.signal }
		const d = document
		d.addEventListener('pointerover', (e) => this.#pointer(e as PointerEvent), o)
		d.addEventListener('pointerout', (e) => {
			if (!(e as PointerEvent).relatedTarget) this.#endHover(performance.now())
		}, o)
		d.addEventListener('focusin', (e) => this.#focusIn(e.target), o)
		d.addEventListener('focusout', () => this.#endFocus(performance.now()), o)
		// Enter and Space on links and buttons arrive as clicks too: one listener counts both.
		d.addEventListener('click', (e) => this.#activate(e.target), o)
		// <details> opening is a deliberate reveal; `toggle` does not bubble, so listen in capture.
		d.addEventListener('toggle', (e) => {
			if ((e.target as HTMLDetailsElement).open) this.#bump(this.resolver.resolve(e.target), 'revealCount')
		}, o)
		d.addEventListener('visibilitychange', () => {
			if (d.visibilityState === 'hidden') {
				const now = performance.now()
				this.#endHover(now)
				this.#endFocus(now)
			}
			this.#lastTick = performance.now()
		}, o)
		this.#io = new IntersectionObserver(
			(entries) => {
				for (const en of entries) {
					const key = this.#elKey.get(en.target)
					if (!key) continue
					if (en.isIntersecting && en.intersectionRatio >= this.cfg.visibleRatio) this.#visible.add(key)
					else this.#visible.delete(key)
				}
			},
			{ threshold: [0, this.cfg.visibleRatio] },
		)
		this.#observeTargets()
		// The page's structure changes (tabs, lazy lists): re-index at most twice a second.
		this.#mo = new MutationObserver(() => {
			if (this.#reindex) return
			this.#reindex = window.setTimeout(() => {
				this.#reindex = 0
				this.#observeTargets()
			}, 500)
		})
		this.#mo.observe(document.body, { childList: true, subtree: true })
		this.#lastTick = performance.now()
		this.#tick = window.setInterval(() => this.#tickVisible(), this.cfg.tickMs)
	}

	stop(): void {
		const now = performance.now()
		this.#endHover(now)
		this.#endFocus(now)
		this.#abort.abort()
		this.#io?.disconnect()
		this.#mo?.disconnect()
		clearInterval(this.#tick)
		clearTimeout(this.#reindex)
		this.#io = null
		this.#mo = null
	}

	/** Ends the open pointer and focus visits now (the page is about to go), so they count. */
	checkpoint(): void {
		const now = performance.now()
		const h = this.#hover
		const f = this.#focus
		this.#endHover(now)
		this.#endFocus(now)
		if (h) this.#hover = { key: h.key, at: now }
		if (f) this.#focus = { key: f.key, at: now }
	}

	/** While the trail's own sheet or another dialog covers the page, nothing on it is being looked at. */
	suspend(on: boolean): void {
		if (on === this.#suspended) return
		const now = performance.now()
		if (on) {
			this.#tickVisible()
			this.#endHover(now)
		}
		this.#suspended = on
		this.#lastTick = now
	}

	/** Starts counting for a new step (an in-app route change); returns the finished step's records. */
	newStep(stepId: string): ElementInterest[] {
		const now = performance.now()
		this.#endHover(now)
		this.#endFocus(now)
		const old = this.records()
		this.stepId = stepId
		this.#records = new Map()
		this.#observeTargets()
		return old
	}

	records(): ElementInterest[] {
		return [...this.#records.values()].map(({ episodes: _e, lastEndAt: _l, ...r }) => settle({ ...r }, this.cfg))
	}

	#observeTargets(): void {
		if (!this.#io) return
		this.#io.disconnect()
		this.#visible.clear()
		for (const { el, id } of this.resolver.index()) {
			this.#elKey.set(el, `dest:${id}`)
			this.#io.observe(el)
		}
	}

	#rec(r: Resolution): ElementInterest & { episodes: number; lastEndAt: number } {
		let x = this.#records.get(r.key)
		if (!x) {
			x = { ...emptyInterest(this.stepId, r.key), episodes: 0, lastEndAt: 0 }
			if (r.destinationId) x.destinationId = r.destinationId
			if (r.pageId) x.pageId = r.pageId
			if (r.fingerprint) x.localFingerprint = r.fingerprint
			this.#records.set(r.key, x)
		}
		return x
	}

	/** A deliberate visit ended; a second one after a gap is a return. */
	#episode(x: ElementInterest & { episodes: number; lastEndAt: number }, startedAt: number, endedAt: number): void {
		if (x.episodes > 0 && startedAt - x.lastEndAt >= this.cfg.returnGapMs) x.revisitCount++
		x.episodes++
		x.lastEndAt = endedAt
		x.lastEngagedAt = Date.now()
	}

	#pointer(e: PointerEvent): void {
		if (e.pointerType === 'touch' || this.#suspended) return
		const r = this.resolver.resolve(e.target)
		const key = r?.key ?? null
		if (this.#hover?.key === key) return
		const now = performance.now()
		this.#endHover(now)
		if (r) {
			this.#rec(r)
			this.#hover = { key: r.key, at: now }
		}
	}

	#endHover(now: number): void {
		const h = this.#hover
		this.#hover = null
		if (!h) return
		const x = this.#records.get(h.key)
		if (!x) return
		const ms = now - h.at
		if (ms < this.cfg.passThroughMs) x.passThroughCount++
		else x.engagedHoverMs += ms
		if (ms >= this.cfg.dwellMs) this.#episode(x, h.at, now)
		this.hooks.onChange?.()
	}

	#focusIn(target: EventTarget | null): void {
		const now = performance.now()
		this.#endFocus(now)
		const r = this.resolver.resolve(target)
		if (!r) return
		this.#rec(r)
		this.#focus = { key: r.key, at: now }
	}

	#endFocus(now: number): void {
		const f = this.#focus
		this.#focus = null
		if (!f) return
		const x = this.#records.get(f.key)
		if (!x) return
		const ms = now - f.at
		x.focusMs += ms
		if (ms >= this.cfg.focusMs) {
			x.focusCount++
			this.#episode(x, f.at, now)
		}
		this.hooks.onChange?.()
	}

	#activate(target: EventTarget | null): void {
		const r = this.resolver.resolve(target)
		if (!r) return
		const now = performance.now()
		const x = this.#rec(r)
		x.activationCount++
		this.#episode(x, now, now)
		const el = target instanceof Element ? target : null
		// Opening a tab or an accordion is also a reveal.
		const ctl = el?.closest('[role="tab"], [aria-expanded], summary')
		if (ctl) {
			x.revealCount++
			// A tab or toggle reveals the panel it controls: that is what the person chose to see.
			const panel = ctl.getAttribute('aria-controls')
			const shown = panel ? this.resolver.resolve(document.getElementById(panel)) : null
			if (shown && shown.key !== r.key) this.#rec(shown).revealCount++
		}
		this.hooks.onChange?.()
	}

	#bump(r: Resolution | null, field: 'revealCount'): void {
		if (!r) return
		this.#rec(r)[field]++
		this.hooks.onChange?.()
	}

	#tickVisible(): void {
		const now = performance.now()
		const dt = Math.min(now - this.#lastTick, this.cfg.tickMs * 2)
		this.#lastTick = now
		if (this.#suspended || document.visibilityState !== 'visible' || !this.#visible.size) return
		// Another dialog covers the page (a site modal): nothing under it is being looked at.
		if (document.querySelector('dialog[open], [aria-modal="true"]')) return
		for (const key of this.#visible) {
			const x = this.#records.get(key)
			if (x) x.visibleDwellMs += dt
			else {
				const id = key.slice(5)
				const r = { ...emptyInterest(this.stepId, key), destinationId: id, pageId: this.resolver.map.page?.id, episodes: 0, lastEndAt: 0, visibleDwellMs: dt }
				this.#records.set(key, r)
			}
		}
		this.hooks.onChange?.()
	}
}
