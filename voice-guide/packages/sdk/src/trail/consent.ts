/**
 * The person's choice about the trail on this site, in this browser (ADR-0037 §1). Stored in
 * `localStorage` so every tab sees it, and every tab hears a change through the `storage` event.
 * No other cookie or consent category is read as consent.
 *
 * It is also kept in a small IndexedDB database of its own (ADR-0050 §8, T-806), because Vodafone's
 * signed-out theme clears `localStorage` on every load of some pages: when the key is missing the copy
 * is read and the key put back. The journey's own database is deleted when the person turns the trail
 * off; the consent copy is not, since "off" is a choice that has to be remembered. `Storage.prototype`
 * is never patched.
 */
import type { Consent } from './state.ts'

export interface ConsentRecord {
	v: 1
	state: Exclude<Consent, 'unset'>
	at: number
	retentionHours: number
}

export const consentKey = (siteKey: string) => `vg-trail:${siteKey}:consent`
const dismissKey = (siteKey: string) => `vg-trail:${siteKey}:not-now`

/** The choice a stored record says, or 'unset' (a missing, damaged or foreign record). */
export function parseConsent(raw: string | null): Consent {
	try {
		const v = JSON.parse(raw || 'null') as ConsentRecord | null
		return v && v.v === 1 && ['granted', 'paused', 'declined', 'off'].includes(v.state) ? v.state : 'unset'
	} catch {
		return 'unset'
	}
}

export const readConsent = (siteKey: string): Consent => {
	try {
		return parseConsent(localStorage.getItem(consentKey(siteKey)))
	} catch {
		return 'unset'
	}
}

export function writeConsent(siteKey: string, state: ConsentRecord['state'], retentionHours: number): void {
	const record = { v: 1, state, at: Date.now(), retentionHours } satisfies ConsentRecord
	try {
		localStorage.setItem(consentKey(siteKey), JSON.stringify(record))
	} catch {}
	void keepCopy(siteKey, record)
}

/**
 * The consent database, or null. Reading never creates it (a visitor who has chosen nothing has nothing
 * stored): a database that does not exist yet is cancelled as it is being made.
 */
function openCopy(create: boolean): Promise<IDBDatabase | null> {
	return new Promise((done) => {
		try {
			const r = indexedDB.open('vg-trail-consent', 1)
			r.onupgradeneeded = () => (create ? r.result.createObjectStore('c', { keyPath: 'k' }) : r.transaction?.abort())
			r.onsuccess = () => done(r.result)
			r.onerror = r.onblocked = () => done(null)
		} catch {
			done(null)
		}
	})
}

/** Writes in the order they were made: the last choice is the one kept. */
let kept: Promise<void> = Promise.resolve()
const keepCopy = (siteKey: string, record: ConsentRecord): Promise<void> =>
	(kept = kept.then(async () => {
		const db = await openCopy(true)
		if (!db) return
		await new Promise<void>((done) => {
			try {
				const t = db.transaction('c', 'readwrite')
				t.objectStore('c').put({ k: siteKey, ...record })
				t.oncomplete = t.onerror = t.onabort = () => done()
			} catch {
				done()
			}
		})
		db.close()
	}))

/**
 * The choice, with the copy as the second place to look: when `localStorage` has none (the theme cleared
 * it, or a private window never kept it) and the database has one, the key is put back. Nothing is
 * created when there is nothing to read.
 */
export async function recoverConsent(siteKey: string): Promise<Consent> {
	const now = readConsent(siteKey)
	if (now !== 'unset') return now
	const db = await openCopy(false)
	if (!db) return 'unset'
	const found = await new Promise<(ConsentRecord & { k: string }) | undefined>((done) => {
		try {
			const r = db.transaction('c').objectStore('c').get(siteKey)
			r.onsuccess = () => done(r.result)
			r.onerror = () => done(undefined)
		} catch {
			done(undefined)
		}
	})
	db.close()
	const state = parseConsent(JSON.stringify(found ?? null))
	if (state === 'unset' || !found) return 'unset'
	try {
		localStorage.setItem(consentKey(siteKey), JSON.stringify({ v: 1, state: found.state, at: found.at, retentionHours: found.retentionHours } satisfies ConsentRecord))
	} catch {}
	return state
}

/** "Not now" hides the offer for this browser session only. */
export function notNow(siteKey: string, set?: boolean): boolean {
	try {
		if (set) sessionStorage.setItem(dismissKey(siteKey), '1')
		return sessionStorage.getItem(dismissKey(siteKey)) === '1'
	} catch {
		return false
	}
}
