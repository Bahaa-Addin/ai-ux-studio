/** Postgres store for the pilot (ADR-0010). One pool per process plus one LISTEN connection. */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import pg, { type Client, type Pool } from 'pg'

import type { Manifest } from '#kb'

import { newId } from '../ids.ts'
import type { KbVersionInfo, PushSubscriptionRow, SessionState, Store, TraceEvent, Watch, WatchChange } from './types.ts'

const SCHEMA = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'schema.sql'), 'utf8')
const NOTIFY_LIMIT = 7000

const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : undefined)

function rowToTrace(r: any): TraceEvent {
	return {
		seq: Number(r.seq),
		sessionId: r.session_id,
		siteId: r.site_id,
		turnId: r.turn_id ?? undefined,
		traceId: r.trace_id,
		name: r.name,
		service: r.service,
		at: iso(r.at)!,
		durationMs: r.duration_ms ?? undefined,
		attrs: r.attrs || {},
	}
}

function rowToWatch(r: any): Watch {
	return {
		id: r.id,
		siteId: r.site_id,
		channel: r.channel,
		subscriptionId: r.subscription_id ?? undefined,
		sessionId: r.session_id ?? undefined,
		url: r.url,
		pageId: r.page_id ?? undefined,
		target: r.target,
		label: r.label,
		lang: r.lang,
		status: r.status,
		lastHash: r.last_hash ?? undefined,
		lastText: r.last_text ?? undefined,
		lastCheckedAt: iso(r.last_checked_at),
		nextCheckAt: iso(r.next_check_at)!,
		intervalSec: r.interval_sec,
		errorCount: r.error_count,
		missingCount: r.missing_count ?? 0,
		createdAt: iso(r.created_at)!,
	}
}

const WATCH_COLUMNS: Record<string, string> = {
	status: 'status',
	lastHash: 'last_hash',
	lastText: 'last_text',
	lastCheckedAt: 'last_checked_at',
	nextCheckAt: 'next_check_at',
	intervalSec: 'interval_sec',
	errorCount: 'error_count',
	missingCount: 'missing_count',
	label: 'label',
	target: 'target',
}

export class PostgresStore implements Store {
	readonly kind = 'postgres' as const
	readonly #pool: Pool
	readonly #url: string
	#listener: Client | null = null
	#listeners = new Set<(ev: TraceEvent) => void>()

	private constructor(url: string, max: number) {
		this.#url = url
		this.#pool = new pg.Pool({ connectionString: url, max, idleTimeoutMillis: 30_000, application_name: 'voice-guide' })
		this.#pool.on('error', (e: Error) => console.error('[store] idle client error', e.message))
	}

	static async connect(url: string, opts: { max?: number; migrate?: boolean } = {}): Promise<PostgresStore> {
		const s = new PostgresStore(url, opts.max ?? 10)
		if (opts.migrate !== false) await s.migrate()
		return s
	}

	async migrate() {
		await this.#pool.query(SCHEMA)
	}

	/** Test helper: empties every table. */
	async truncateAll() {
		await this.#pool.query(
			'TRUNCATE kb_active, kb_versions, sessions, handoff_tokens, trace_events, watch_changes, watches, push_subscriptions, cache, usage_counters RESTART IDENTITY CASCADE',
		)
	}

	async putKbVersion(siteId: string, manifest: Manifest) {
		await this.#pool.query('INSERT INTO kb_versions (site_id, version_id, hash, manifest, created_at) VALUES ($1, $2, $3, $4, $5)', [
			siteId,
			manifest.version.id,
			manifest.version.hash,
			JSON.stringify(manifest),
			manifest.version.createdAt,
		])
	}
	async activateKb(siteId: string, versionId: string) {
		await this.#pool.query(
			`INSERT INTO kb_active (site_id, version_id) VALUES ($1, $2)
			 ON CONFLICT (site_id) DO UPDATE SET version_id = EXCLUDED.version_id, activated_at = now()`,
			[siteId, versionId],
		)
		await this.#pool.query('SELECT pg_notify($1, $2)', ['vg_kb', JSON.stringify({ siteId, versionId })])
	}
	async getActiveKb(siteId: string): Promise<Manifest | null> {
		const r = await this.#pool.query(
			'SELECT v.manifest FROM kb_active a JOIN kb_versions v ON v.site_id = a.site_id AND v.version_id = a.version_id WHERE a.site_id = $1',
			[siteId],
		)
		return r.rows[0]?.manifest ?? null
	}
	async getActiveKbId(siteId: string): Promise<string | null> {
		const r = await this.#pool.query('SELECT version_id FROM kb_active WHERE site_id = $1', [siteId])
		return r.rows[0]?.version_id ?? null
	}
	async getKbVersion(siteId: string, versionId: string): Promise<Manifest | null> {
		const r = await this.#pool.query('SELECT manifest FROM kb_versions WHERE site_id = $1 AND version_id = $2', [siteId, versionId])
		return r.rows[0]?.manifest ?? null
	}
	async listKbVersions(siteId: string, limit = 20): Promise<KbVersionInfo[]> {
		const r = await this.#pool.query(
			`SELECT v.version_id, v.created_at, v.hash, (a.version_id IS NOT NULL) AS active, jsonb_array_length(v.manifest->'destinations') AS destinations
			 FROM kb_versions v LEFT JOIN kb_active a ON a.site_id = v.site_id AND a.version_id = v.version_id
			 WHERE v.site_id = $1 ORDER BY v.created_at DESC LIMIT $2`,
			[siteId, limit],
		)
		return r.rows.map((x: any) => ({ id: x.version_id, createdAt: iso(x.created_at)!, hash: x.hash, active: x.active, destinations: Number(x.destinations) }))
	}

	async getSession(id: string) {
		const r = await this.#pool.query('SELECT state FROM sessions WHERE id = $1 AND expires_at > now()', [id])
		return (r.rows[0]?.state as SessionState) ?? null
	}
	async putSession(state: SessionState, ttlMin: number) {
		const s = { ...state, updatedAt: new Date().toISOString() }
		await this.#pool.query(
			`INSERT INTO sessions (id, site_id, state, updated_at, expires_at) VALUES ($1, $2, $3, now(), now() + make_interval(mins => $4))
			 ON CONFLICT (id) DO UPDATE SET state = EXCLUDED.state, updated_at = now(), expires_at = EXCLUDED.expires_at`,
			[s.id, s.siteId, JSON.stringify(s), ttlMin],
		)
	}
	async patchSession(id: string, patch: Partial<SessionState>, ttlMin: number) {
		const p = { ...patch, id, updatedAt: new Date().toISOString() }
		const r = await this.#pool.query(
			`UPDATE sessions SET state = state || $2::jsonb, updated_at = now(), expires_at = now() + make_interval(mins => $3)
			 WHERE id = $1 AND expires_at > now() RETURNING state`,
			[id, JSON.stringify(p), ttlMin],
		)
		return (r.rows[0]?.state as SessionState) ?? null
	}
	async createHandoff(token: string, sessionId: string, ttlSec: number) {
		await this.#pool.query('INSERT INTO handoff_tokens (token, session_id, expires_at) VALUES ($1, $2, now() + make_interval(secs => $3))', [
			token,
			sessionId,
			ttlSec,
		])
	}
	async redeemHandoff(token: string) {
		const r = await this.#pool.query('DELETE FROM handoff_tokens WHERE token = $1 RETURNING session_id, expires_at > now() AS valid', [token])
		const row = r.rows[0]
		return row && row.valid ? (row.session_id as string) : null
	}

	async appendTrace(ev: TraceEvent) {
		const r = await this.#pool.query(
			`INSERT INTO trace_events (session_id, site_id, turn_id, trace_id, name, service, at, duration_ms, attrs)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING seq`,
			[ev.sessionId, ev.siteId, ev.turnId ?? null, ev.traceId, ev.name, ev.service, ev.at, ev.durationMs ?? null, JSON.stringify(ev.attrs || {})],
		)
		const stored = { ...ev, seq: Number(r.rows[0].seq) }
		const payload = JSON.stringify(stored)
		await this.#pool.query('SELECT pg_notify($1, $2)', [
			'vg_trace',
			payload.length <= NOTIFY_LIMIT ? payload : JSON.stringify({ seq: stored.seq, sessionId: stored.sessionId, truncated: true }),
		])
		return stored
	}
	async listTrace(sessionId: string, sinceSeq = 0) {
		const r = await this.#pool.query('SELECT * FROM trace_events WHERE session_id = $1 AND seq > $2 ORDER BY seq', [sessionId, sinceSeq])
		return r.rows.map(rowToTrace)
	}
	async subscribeTrace(listener: (ev: TraceEvent) => void) {
		this.#listeners.add(listener)
		if (!this.#listener) {
			const c = new pg.Client({ connectionString: this.#url, application_name: 'voice-guide-listen' })
			await c.connect()
			c.on('notification', async (n) => {
				if (n.channel !== 'vg_trace' || !n.payload) return
				let ev: TraceEvent & { truncated?: boolean } = JSON.parse(n.payload)
				if (ev.truncated) {
					const r = await this.#pool.query('SELECT * FROM trace_events WHERE seq = $1', [ev.seq])
					if (!r.rows[0]) return
					ev = rowToTrace(r.rows[0])
				}
				for (const l of this.#listeners) l(ev)
			})
			c.on('error', (e) => console.error('[store] listen connection error', e.message))
			await c.query('LISTEN vg_trace')
			this.#listener = c
		}
		return async () => {
			this.#listeners.delete(listener)
			if (this.#listeners.size === 0 && this.#listener) {
				const c = this.#listener
				this.#listener = null
				await c.end().catch(() => {})
			}
		}
	}

	async upsertSubscription(sub: Omit<PushSubscriptionRow, 'id' | 'createdAt'>) {
		const r = await this.#pool.query(
			`INSERT INTO push_subscriptions (id, site_id, endpoint, keys) VALUES ($1, $2, $3, $4)
			 ON CONFLICT (endpoint) DO UPDATE SET keys = EXCLUDED.keys, site_id = EXCLUDED.site_id
			 RETURNING id, site_id, endpoint, keys, created_at`,
			[newId('sub'), sub.siteId, sub.endpoint, JSON.stringify(sub.keys)],
		)
		const x = r.rows[0]
		return { id: x.id, siteId: x.site_id, endpoint: x.endpoint, keys: x.keys, createdAt: iso(x.created_at)! }
	}
	async getSubscription(id: string) {
		const r = await this.#pool.query('SELECT * FROM push_subscriptions WHERE id = $1', [id])
		const x = r.rows[0]
		return x ? { id: x.id, siteId: x.site_id, endpoint: x.endpoint, keys: x.keys, createdAt: iso(x.created_at)! } : null
	}
	async deleteSubscription(id: string) {
		await this.#pool.query('DELETE FROM push_subscriptions WHERE id = $1', [id])
	}
	async createWatch(w: Omit<Watch, 'id' | 'createdAt' | 'errorCount' | 'missingCount' | 'status'>) {
		const r = await this.#pool.query(
			`INSERT INTO watches (id, site_id, subscription_id, session_id, url, page_id, target, label, lang, last_hash, last_text, last_checked_at, next_check_at, interval_sec, channel)
			 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
			[
				newId('wat'),
				w.siteId,
				w.subscriptionId ?? null,
				w.sessionId ?? null,
				w.url,
				w.pageId ?? null,
				JSON.stringify(w.target),
				w.label,
				w.lang,
				w.lastHash ?? null,
				w.lastText ?? null,
				w.lastCheckedAt ?? null,
				w.nextCheckAt,
				w.intervalSec,
				w.channel,
			],
		)
		return rowToWatch(r.rows[0])
	}
	async getWatch(id: string) {
		const r = await this.#pool.query('SELECT * FROM watches WHERE id = $1', [id])
		return r.rows[0] ? rowToWatch(r.rows[0]) : null
	}
	async listWatches(by: { subscriptionId?: string; sessionId?: string }) {
		const r = await this.#pool.query(
			'SELECT * FROM watches WHERE ($1::text IS NULL OR subscription_id = $1) AND ($2::text IS NULL OR session_id = $2) AND ($1::text IS NOT NULL OR $2::text IS NOT NULL) ORDER BY created_at',
			[by.subscriptionId ?? null, by.sessionId ?? null],
		)
		return r.rows.map(rowToWatch)
	}
	async claimDueWatches(now: Date, limit: number, leaseSec: number) {
		const r = await this.#pool.query(
			`UPDATE watches SET lease_until = $1::timestamptz + make_interval(secs => $3)
			 WHERE id IN (
			   SELECT id FROM watches WHERE status <> 'paused' AND next_check_at <= $1 AND (lease_until IS NULL OR lease_until < $1)
			   ORDER BY next_check_at LIMIT $2 FOR UPDATE SKIP LOCKED)
			 RETURNING *`,
			[now.toISOString(), limit, leaseSec],
		)
		return r.rows.map(rowToWatch)
	}
	async updateWatch(id: string, patch: Partial<Watch>) {
		const sets: string[] = ['lease_until = NULL']
		const values: unknown[] = [id]
		for (const [k, v] of Object.entries(patch)) {
			const col = WATCH_COLUMNS[k]
			if (!col) continue
			values.push(k === 'target' ? JSON.stringify(v) : (v ?? null))
			sets.push(`${col} = $${values.length}`)
		}
		await this.#pool.query(`UPDATE watches SET ${sets.join(', ')} WHERE id = $1`, values)
	}
	async deleteWatch(id: string) {
		await this.#pool.query('DELETE FROM watches WHERE id = $1', [id])
	}
	async addChange(c: Omit<WatchChange, 'id'>) {
		const id = newId('chg')
		await this.#pool.query('INSERT INTO watch_changes (id, watch_id, at, before, after) VALUES ($1, $2, $3, $4, $5)', [id, c.watchId, c.at, c.before, c.after])
		return { ...c, id }
	}
	async listChanges(watchId: string, limit = 20) {
		const r = await this.#pool.query('SELECT * FROM watch_changes WHERE watch_id = $1 ORDER BY at DESC LIMIT $2', [watchId, limit])
		return r.rows.map((x: any) => ({ id: x.id, watchId: x.watch_id, at: iso(x.at)!, before: x.before, after: x.after }))
	}

	async cacheGet<T>(ns: string, key: string) {
		const r = await this.#pool.query('SELECT value FROM cache WHERE ns = $1 AND key = $2', [ns, key])
		return (r.rows[0]?.value as T) ?? null
	}
	async cachePut(ns: string, key: string, value: unknown) {
		await this.#pool.query(
			'INSERT INTO cache (ns, key, value) VALUES ($1, $2, $3) ON CONFLICT (ns, key) DO UPDATE SET value = EXCLUDED.value, created_at = now()',
			[ns, key, JSON.stringify(value)],
		)
	}
	async addUsage(scope: string, amount: number) {
		const r = await this.#pool.query(
			`INSERT INTO usage_counters (scope, total) VALUES ($1, $2)
			 ON CONFLICT (scope) DO UPDATE SET total = usage_counters.total + EXCLUDED.total, updated_at = now() RETURNING total`,
			[scope, amount],
		)
		return Number(r.rows[0].total)
	}

	async purgeExpired(now: Date, traceRetentionDays: number) {
		const s = await this.#pool.query('DELETE FROM sessions WHERE expires_at < $1', [now.toISOString()])
		const h = await this.#pool.query('DELETE FROM handoff_tokens WHERE expires_at < $1', [now.toISOString()])
		const t = await this.#pool.query("DELETE FROM trace_events WHERE at < $1::timestamptz - make_interval(days => $2)", [now.toISOString(), traceRetentionDays])
		return { sessions: s.rowCount || 0, handoffs: h.rowCount || 0, traces: t.rowCount || 0 }
	}

	async close() {
		if (this.#listener) await this.#listener.end().catch(() => {})
		this.#listener = null
		this.#listeners.clear()
		await this.#pool.end()
	}
}
