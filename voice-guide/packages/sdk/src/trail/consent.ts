/**
 * The person's choice about the trail on this site, in this browser (ADR-0037 §1). Stored in
 * `localStorage` so every tab sees it, and every tab hears a change through the `storage` event.
 * No other cookie or consent category is read as consent.
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

export function readConsent(siteKey: string): Consent {
	try {
		const v = JSON.parse(localStorage.getItem(consentKey(siteKey)) || 'null') as ConsentRecord | null
		return v && v.v === 1 && ['granted', 'paused', 'declined', 'off'].includes(v.state) ? v.state : 'unset'
	} catch {
		return 'unset'
	}
}

export function writeConsent(siteKey: string, state: ConsentRecord['state'], retentionHours: number): void {
	try {
		localStorage.setItem(consentKey(siteKey), JSON.stringify({ v: 1, state, at: Date.now(), retentionHours } satisfies ConsentRecord))
	} catch {}
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
