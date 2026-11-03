/**
 * Local journey memory in IndexedDB (`vg-trail-v1`, ADR-0036 Layer A, limits in ADR-0037 §2).
 * Three stores: `sessions` (small indexes the timeline draws from), `chunks` (replay events,
 * gzip-compressed, read one step at a time through the `step` index) and `interest` (attention
 * per step and destination). Each write is its own transaction, so a crash loses at most the
 * unflushed buffer; chunks are found through the index, not a list that could be half-written.
 * Nothing here is ever sent anywhere.
 */
import { TRAIL_CONFIG } from './config.ts'
import { type ElementInterest, isChunk, isEvent, parseSession, type RawEvent, type ReplayChunk, type TrailSession } from './types.ts'

type Storage = (typeof TRAIL_CONFIG)['storage']

export class QuotaError extends Error {}
export class CorruptChunk extends Error {}

// ---- pure planning (unit-tested) ----

export interface EvictionPlan {
	sessions: string[]
	/** Replay of these steps is dropped; the step summaries stay. */
	steps: { sessionId: string; stepId: string; bytes: number }[]
}

/**
 * Expired journeys first, then the least recently updated beyond the count limit (never the
 * active one), then, while over the byte budget, other journeys oldest first and finally the
 * active journey's oldest steps' replay.
 */
export function planEviction(sessions: TrailSession[], now: number, activeId: string | null, stepBytes: (sessionId: string, stepId: string) => number, cfg: Storage = TRAIL_CONFIG.storage): EvictionPlan {
	const plan: EvictionPlan = { sessions: [], steps: [] }
	const drop = new Set<string>()
	for (const s of sessions) if (s.expiresAt <= now && s.id !== activeId) drop.add(s.id)
	const live = sessions.filter((s) => !drop.has(s.id)).sort((a, b) => b.updatedAt - a.updatedAt)
	let kept = live.filter((s) => s.id === activeId)
	for (const s of live) {
		if (s.id === activeId) continue
		if (kept.length < cfg.maxSessions) kept.push(s)
		else drop.add(s.id)
	}
	let total = kept.reduce((n, s) => n + s.bytes, 0)
	for (const s of [...kept].filter((x) => x.id !== activeId).sort((a, b) => a.updatedAt - b.updatedAt)) {
		if (total <= cfg.maxBytes) break
		drop.add(s.id)
		total -= s.bytes
	}
	kept = kept.filter((s) => !drop.has(s.id))
	const active = kept.find((s) => s.id === activeId)
	if (active && total > cfg.maxBytes) {
		// Never the step being recorded (the last one).
		for (const st of active.steps.slice(0, -1)) {
			if (total <= cfg.maxBytes) break
			if (st.replay !== 'ok') continue
			const bytes = stepBytes(active.id, st.id)
			plan.steps.push({ sessionId: active.id, stepId: st.id, bytes })
			total -= bytes
		}
	}
	plan.sessions = [...drop]
	return plan
}

// ---- chunk encoding ----

const canGzip = () => typeof CompressionStream === 'function' && typeof DecompressionStream === 'function' && typeof Blob === 'function'

export async function encodeEvents(events: RawEvent[]): Promise<{ enc: 'gzip' | 'json'; data: Blob | string; bytes: number }> {
	const json = JSON.stringify(events)
	if (!canGzip()) return { enc: 'json', data: json, bytes: json.length * 2 }
	const blob = await new Response(new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'))).blob()
	return { enc: 'gzip', data: blob, bytes: blob.size }
}

/** Decodes and checks one chunk; a damaged chunk throws `CorruptChunk` and is never half-used. */
export async function decodeChunk(c: unknown): Promise<RawEvent[]> {
	if (!isChunk(c)) throw new CorruptChunk('not a chunk')
	let text: string
	try {
		text = c.enc === 'gzip' ? await new Response((c.data as Blob).stream().pipeThrough(new DecompressionStream('gzip'))).text() : (c.data as string)
	} catch {
		throw new CorruptChunk('cannot decompress')
	}
	let parsed: unknown
	try {
		parsed = JSON.parse(text)
	} catch {
		throw new CorruptChunk('not JSON')
	}
	if (!Array.isArray(parsed)) throw new CorruptChunk('not a list of events')
	return parsed.filter(isEvent)
}

// ---- IndexedDB ----

const req = <T>(r: IDBRequest<T>) =>
	new Promise<T>((resolve, reject) => {
		r.onsuccess = () => resolve(r.result)
		r.onerror = () => reject(r.error)
	})

const done = (tx: IDBTransaction) =>
	new Promise<void>((resolve, reject) => {
		tx.oncomplete = () => resolve()
		tx.onabort = () => reject(tx.error?.name === 'QuotaExceededError' ? new QuotaError('storage is full') : tx.error || new Error('aborted'))
		tx.onerror = () => reject(tx.error?.name === 'QuotaExceededError' ? new QuotaError('storage is full') : tx.error || new Error('failed'))
	})

export class TrailStore {
	readonly db: IDBDatabase
	#closed = false
	constructor(db: IDBDatabase) {
		this.db = db
		// Another tab clearing or upgrading the database: let go at once.
		db.onversionchange = () => this.close()
	}

	/** Opens the database, or null where IndexedDB is unavailable (some private modes): the site then works without the trail. */
	static async open(cfg: Storage = TRAIL_CONFIG.storage): Promise<TrailStore | null> {
		if (typeof indexedDB === 'undefined') return null
		try {
			const r = indexedDB.open(cfg.db, cfg.dbVersion)
			r.onupgradeneeded = () => {
				const db = r.result
				if (!db.objectStoreNames.contains('sessions')) db.createObjectStore('sessions', { keyPath: 'id' })
				if (!db.objectStoreNames.contains('chunks')) {
					const c = db.createObjectStore('chunks', { keyPath: 'id' })
					c.createIndex('step', 'stepId')
					c.createIndex('session', 'sessionId')
				}
				if (!db.objectStoreNames.contains('interest')) {
					const i = db.createObjectStore('interest', { keyPath: ['stepId', 'key'] })
					i.createIndex('session', 'sessionId')
				}
			}
			const db = await Promise.race([req(r), new Promise<never>((_, rej) => setTimeout(() => rej(new Error('IndexedDB did not open')), 3000))])
			return new TrailStore(db)
		} catch (e) {
			console.info('[voice-guide] trail storage unavailable', (e as Error)?.message)
			return null
		}
	}

	get closed(): boolean {
		return this.#closed
	}

	close(): void {
		if (this.#closed) return
		this.#closed = true
		try {
			this.db.close()
		} catch {}
	}

	#tx(stores: string[], mode: IDBTransactionMode): IDBTransaction {
		if (this.#closed) throw new Error('trail storage closed')
		return this.db.transaction(stores, mode)
	}

	async sessions(): Promise<TrailSession[]> {
		const all = await req(this.#tx(['sessions'], 'readonly').objectStore('sessions').getAll())
		return all.map(parseSession).filter((s): s is TrailSession => !!s)
	}

	async session(id: string): Promise<TrailSession | null> {
		return parseSession(await req(this.#tx(['sessions'], 'readonly').objectStore('sessions').get(id)))
	}

	async putSession(s: TrailSession): Promise<void> {
		const tx = this.#tx(['sessions'], 'readwrite')
		tx.objectStore('sessions').put(s)
		await done(tx)
	}

	async putChunk(c: ReplayChunk): Promise<void> {
		const tx = this.#tx(['chunks'], 'readwrite')
		tx.objectStore('chunks').put(c)
		await done(tx)
	}

	/** Only this step's chunks, through the index: opening one step never reads the others. */
	async chunks(stepId: string): Promise<unknown[]> {
		const all = await req(this.#tx(['chunks'], 'readonly').objectStore('chunks').index('step').getAll(IDBKeyRange.only(stepId)))
		return all.sort((a: any, b: any) => (a?.seq ?? 0) - (b?.seq ?? 0))
	}

	async deleteStepReplay(stepId: string): Promise<void> {
		const tx = this.#tx(['chunks'], 'readwrite')
		const idx = tx.objectStore('chunks').index('step')
		const keys = await req(idx.getAllKeys(IDBKeyRange.only(stepId)))
		for (const k of keys) tx.objectStore('chunks').delete(k)
		await done(tx)
	}

	async putInterest(sessionId: string, records: ElementInterest[]): Promise<void> {
		if (!records.length) return
		const tx = this.#tx(['interest'], 'readwrite')
		const st = tx.objectStore('interest')
		for (const r of records) st.put({ ...r, sessionId })
		await done(tx)
	}

	async interest(stepId: string): Promise<ElementInterest[]> {
		const all = await req(this.#tx(['interest'], 'readonly').objectStore('interest').getAll(IDBKeyRange.bound([stepId], [stepId, []])))
		return all.filter((r: any) => r && typeof r.key === 'string' && typeof r.score === 'number')
	}

	/** Deletes one journey: its index, replay and attention. */
	async deleteSession(id: string): Promise<void> {
		const tx = this.#tx(['sessions', 'chunks', 'interest'], 'readwrite')
		tx.objectStore('sessions').delete(id)
		for (const name of ['chunks', 'interest']) {
			const st = tx.objectStore(name)
			const keys = await req(st.index('session').getAllKeys(IDBKeyRange.only(id)))
			for (const k of keys) st.delete(k)
		}
		await done(tx)
	}

	/** Deletes every saved journey on this device for this site's origin. */
	async clearAll(): Promise<void> {
		const tx = this.#tx(['sessions', 'chunks', 'interest'], 'readwrite')
		for (const name of ['sessions', 'chunks', 'interest']) tx.objectStore(name).clear()
		await done(tx)
	}
}
