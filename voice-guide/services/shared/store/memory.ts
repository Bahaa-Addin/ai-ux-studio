/** In-memory store: tests and single-process local runs (VG_STORE=memory). */
import { EventEmitter } from 'node:events'

import type { Manifest } from '#kb'

import { newId } from '../ids.ts'
import type { KbVersionInfo, PushSubscriptionRow, SessionState, Store, TraceEvent, Watch, WatchChange } from './types.ts'

const clone = <T>(v: T): T => structuredClone(v)

export class MemoryStore implements Store {
	readonly kind = 'memory' as const
	#kb = new Map<string, Map<string, { manifest: Manifest; createdAt: string }>>()
	#active = new Map<string, string>()
	#sessions = new Map<string, { state: SessionState; expiresAt: number }>()
	#handoffs = new Map<string, { sessionId: string; expiresAt: number }>()
	#traces: TraceEvent[] = []
	#seq = 0
	#bus = new EventEmitter()
	#subs = new Map<string, PushSubscriptionRow>()
	#watches = new Map<string, Watch & { leaseUntil?: number }>()
	#changes: WatchChange[] = []
	#cache = new Map<string, unknown>()
	#usage = new Map<string, number>()

	async putKbVersion(siteId: string, manifest: Manifest) {
		const versions = this.#kb.get(siteId) || new Map()
		if (versions.has(manifest.version.id)) throw new Error(`KB version ${manifest.version.id} already exists`)
		versions.set(manifest.version.id, { manifest: clone(manifest), createdAt: manifest.version.createdAt })
		this.#kb.set(siteId, versions)
	}
	async activateKb(siteId: string, versionId: string) {
		if (!this.#kb.get(siteId)?.has(versionId)) throw new Error(`Unknown KB version ${versionId}`)
		this.#active.set(siteId, versionId)
	}
	async getActiveKb(siteId: string) {
		const id = this.#active.get(siteId)
		return id ? this.getKbVersion(siteId, id) : null
	}
	async getActiveKbId(siteId: string) {
		return this.#active.get(siteId) ?? null
	}
	async getKbVersion(siteId: string, versionId: string) {
		const v = this.#kb.get(siteId)?.get(versionId)
		return v ? clone(v.manifest) : null
	}
	async listKbVersions(siteId: string, limit = 20): Promise<KbVersionInfo[]> {
		const active = this.#active.get(siteId)
		return [...(this.#kb.get(siteId)?.values() || [])]
			.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
			.slice(0, limit)
			.map((v) => ({
				id: v.manifest.version.id,
				createdAt: v.createdAt,
				hash: v.manifest.version.hash,
				active: v.manifest.version.id === active,
				destinations: v.manifest.destinations.length,
			}))
	}

	async getSession(id: string) {
		const s = this.#sessions.get(id)
		if (!s || s.expiresAt < Date.now()) return null
		return clone(s.state)
	}
	async putSession(state: SessionState, ttlMin: number) {
		this.#sessions.set(state.id, { state: clone({ ...state, updatedAt: new Date().toISOString() }), expiresAt: Date.now() + ttlMin * 60_000 })
	}
	async patchSession(id: string, patch: Partial<SessionState>, ttlMin: number) {
		const s = this.#sessions.get(id)
		if (!s || s.expiresAt < Date.now()) return null
		s.state = clone({ ...s.state, ...patch, id, updatedAt: new Date().toISOString() })
		s.expiresAt = Date.now() + ttlMin * 60_000
		return clone(s.state)
	}
	async createHandoff(token: string, sessionId: string, ttlSec: number) {
		this.#handoffs.set(token, { sessionId, expiresAt: Date.now() + ttlSec * 1000 })
	}
	async redeemHandoff(token: string) {
		const h = this.#handoffs.get(token)
		this.#handoffs.delete(token)
		return h && h.expiresAt >= Date.now() ? h.sessionId : null
	}

	async appendTrace(ev: TraceEvent) {
		const stored = { ...clone(ev), seq: ++this.#seq }
		this.#traces.push(stored)
		this.#bus.emit('trace', clone(stored))
		return stored
	}
	async listTrace(sessionId: string, sinceSeq = 0) {
		return this.#traces.filter((t) => t.sessionId === sessionId && (t.seq || 0) > sinceSeq).map(clone)
	}
	async subscribeTrace(listener: (ev: TraceEvent) => void) {
		this.#bus.on('trace', listener)
		return async () => void this.#bus.off('trace', listener)
	}

	async upsertSubscription(sub: Omit<PushSubscriptionRow, 'id' | 'createdAt'>) {
		for (const s of this.#subs.values()) {
			if (s.endpoint === sub.endpoint) {
				Object.assign(s, sub)
				return clone(s)
			}
		}
		const row = { ...sub, id: newId('sub'), createdAt: new Date().toISOString() }
		this.#subs.set(row.id, row)
		return clone(row)
	}
	async getSubscription(id: string) {
		const s = this.#subs.get(id)
		return s ? clone(s) : null
	}
	async deleteSubscription(id: string) {
		this.#subs.delete(id)
		for (const [wid, w] of this.#watches) if (w.subscriptionId === id) this.#watches.delete(wid)
	}
	async createWatch(w: Omit<Watch, 'id' | 'createdAt' | 'errorCount' | 'missingCount' | 'status'>) {
		const row: Watch = { ...clone(w), id: newId('wat'), createdAt: new Date().toISOString(), errorCount: 0, missingCount: 0, status: 'active' }
		this.#watches.set(row.id, row)
		return clone(row)
	}
	async getWatch(id: string) {
		const w = this.#watches.get(id)
		if (!w) return null
		const { leaseUntil: _l, ...rest } = w
		return clone(rest)
	}
	async listWatches(by: { subscriptionId?: string; sessionId?: string }) {
		if (!by.subscriptionId && !by.sessionId) return []
		return [...this.#watches.values()]
			.filter((w) => (!by.subscriptionId || w.subscriptionId === by.subscriptionId) && (!by.sessionId || w.sessionId === by.sessionId))
			.map(({ leaseUntil: _l, ...w }) => clone(w))
	}
	async claimDueWatches(now: Date, limit: number, leaseSec: number) {
		const out: Watch[] = []
		for (const w of [...this.#watches.values()].sort((a, b) => a.nextCheckAt.localeCompare(b.nextCheckAt))) {
			if (out.length >= limit) break
			if (w.status === 'paused' || new Date(w.nextCheckAt) > now) continue
			if (w.leaseUntil && w.leaseUntil > now.getTime()) continue
			w.leaseUntil = now.getTime() + leaseSec * 1000
			const { leaseUntil: _l, ...rest } = w
			out.push(clone(rest))
		}
		return out
	}
	async updateWatch(id: string, patch: Partial<Watch>) {
		const w = this.#watches.get(id)
		if (w) Object.assign(w, clone(patch), { leaseUntil: undefined })
	}
	async deleteWatch(id: string) {
		this.#watches.delete(id)
	}
	async addChange(c: Omit<WatchChange, 'id'>) {
		const row = { ...c, id: newId('chg') }
		this.#changes.push(row)
		return clone(row)
	}
	async listChanges(watchId: string, limit = 20) {
		return this.#changes.filter((c) => c.watchId === watchId).slice(-limit).reverse().map(clone)
	}

	async cacheGet<T>(ns: string, key: string) {
		const v = this.#cache.get(`${ns}\u0000${key}`)
		return v === undefined ? null : (clone(v) as T)
	}
	async cachePut(ns: string, key: string, value: unknown) {
		this.#cache.set(`${ns}\u0000${key}`, clone(value))
	}
	async addUsage(scope: string, amount: number) {
		const total = (this.#usage.get(scope) || 0) + amount
		this.#usage.set(scope, total)
		return total
	}

	async purgeExpired(now: Date, traceRetentionDays: number) {
		let sessions = 0
		let handoffs = 0
		for (const [id, s] of this.#sessions) if (s.expiresAt < now.getTime()) (this.#sessions.delete(id), sessions++)
		for (const [t, h] of this.#handoffs) if (h.expiresAt < now.getTime()) (this.#handoffs.delete(t), handoffs++)
		const cutoff = now.getTime() - traceRetentionDays * 86_400_000
		const before = this.#traces.length
		this.#traces = this.#traces.filter((t) => new Date(t.at).getTime() >= cutoff)
		return { sessions, handoffs, traces: before - this.#traces.length }
	}
	async close() {
		this.#bus.removeAllListeners()
	}
}
