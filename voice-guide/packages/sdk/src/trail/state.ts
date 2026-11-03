/**
 * The trail's state machine (ADR-0038): a pure reducer with two regions, recording and view, and
 * explicit effects. Cancellation priorities, highest first:
 *   1. teardown, an ineligible route, consent revocation
 *   2. storage or security failure
 *   3. the guide executing a plan
 *   4. direct timeline interaction
 *   5. replay playback
 *   6. ambient UI transitions
 * A higher-priority event always ends lower-priority work through effects, so no recorder or
 * replayer is left running behind it.
 */

export type RecState = 'disabled' | 'awaiting-consent' | 'recording' | 'paused' | 'blocked' | 'storage-full' | 'error' | 'destroyed'
export type ViewState = 'collapsed' | 'expanded'
export type PreviewState = 'idle' | 'loading' | 'ready' | 'scrubbing' | 'playing' | 'error'
export type ActionState = 'none' | 'question-submitting' | 'guide-executing'
export type Consent = 'unset' | 'granted' | 'paused' | 'declined' | 'off'

export interface TrailState {
	rec: RecState
	view: ViewState
	preview: PreviewState
	action: ActionState
	consent: Consent
	/** The consent card is open (inside the expanded view or on its own from the pill). */
	consentCard: boolean
	selectedStepId: string | null
}

export type TrailEvent =
	| { type: 'START'; consent: Consent; eligible: boolean }
	| { type: 'OFFER' }
	| { type: 'CONSENT_GRANTED'; eligible: boolean }
	| { type: 'CONSENT_DECLINED' }
	| { type: 'TURN_OFF' }
	| { type: 'PAUSE' }
	| { type: 'RESUME'; eligible: boolean }
	| { type: 'ROUTE'; eligible: boolean }
	| { type: 'STORAGE_FULL' }
	| { type: 'FAILURE' }
	| { type: 'EXPAND' }
	| { type: 'COLLAPSE' }
	| { type: 'SELECT_STEP'; stepId: string }
	| { type: 'PREVIEW_READY' }
	| { type: 'PREVIEW_FAILED' }
	| { type: 'SCRUB' }
	| { type: 'PLAY' }
	| { type: 'STOP_PLAYBACK' }
	| { type: 'QUESTION' }
	| { type: 'GUIDE_BUSY' }
	| { type: 'GUIDE_IDLE' }
	| { type: 'CLEARED'; all: boolean }
	| { type: 'TEARDOWN' }

export type Effect = 'startRecorder' | 'stopRecorder' | 'destroyReplayer' | 'loadPreview' | 'clearCurrent' | 'clearAll' | 'focusPill' | 'submitQuestion'

export const INITIAL: TrailState = { rec: 'disabled', view: 'collapsed', preview: 'idle', action: 'none', consent: 'unset', consentCard: false, selectedStepId: null }

const stopPreview = (s: TrailState): TrailState => ({ ...s, preview: 'idle' })

export function reduce(s: TrailState, e: TrailEvent): { state: TrailState; effects: Effect[] } {
	if (s.rec === 'destroyed') return { state: s, effects: [] }
	const fx: Effect[] = []
	const out = (state: TrailState) => ({ state, effects: fx })
	switch (e.type) {
		// ---- priority 1 ----
		case 'TEARDOWN':
			fx.push('stopRecorder', 'destroyReplayer')
			return out({ ...stopPreview(s), rec: 'destroyed', view: 'collapsed', consentCard: false })
		case 'TURN_OFF':
			fx.push('stopRecorder', 'destroyReplayer', 'clearAll')
			return out({ ...stopPreview(s), rec: 'disabled', consent: 'off', view: 'collapsed', consentCard: false, selectedStepId: null })
		case 'ROUTE': {
			if (s.rec === 'recording' && !e.eligible) {
				fx.push('stopRecorder')
				return out({ ...s, rec: 'blocked' })
			}
			if (s.rec === 'blocked' && e.eligible) {
				fx.push('startRecorder')
				return out({ ...s, rec: 'recording' })
			}
			return out(s)
		}
		// ---- priority 2 ----
		case 'STORAGE_FULL':
			if (s.rec === 'recording') fx.push('stopRecorder')
			return out({ ...s, rec: s.rec === 'recording' || s.rec === 'paused' ? 'storage-full' : s.rec })
		case 'FAILURE':
			fx.push('stopRecorder', 'destroyReplayer')
			return out({ ...stopPreview(s), rec: s.consent === 'granted' ? 'error' : s.rec })
		// ---- consent ----
		case 'START': {
			if (e.consent === 'granted') {
				if (e.eligible) fx.push('startRecorder')
				return out({ ...s, consent: 'granted', rec: e.eligible ? 'recording' : 'blocked' })
			}
			if (e.consent === 'paused') return out({ ...s, consent: 'paused', rec: 'paused' })
			return out({ ...s, consent: e.consent, rec: e.consent === 'unset' ? 'awaiting-consent' : 'disabled' })
		}
		case 'OFFER':
			if (s.action === 'guide-executing') return out(s)
			return out({ ...s, consentCard: true })
		case 'CONSENT_GRANTED':
			if (e.eligible) fx.push('startRecorder')
			return out({ ...s, consent: 'granted', consentCard: false, rec: e.eligible ? 'recording' : 'blocked' })
		case 'CONSENT_DECLINED':
			fx.push('focusPill')
			return out({ ...s, consent: 'declined', consentCard: false, rec: 'disabled' })
		case 'PAUSE':
			if (s.rec !== 'recording' && s.rec !== 'blocked') return out(s)
			fx.push('stopRecorder')
			return out({ ...s, consent: 'paused', rec: 'paused' })
		case 'RESUME':
			if (s.rec !== 'paused' && s.rec !== 'error') return out(s)
			if (e.eligible) fx.push('startRecorder')
			return out({ ...s, consent: 'granted', rec: e.eligible ? 'recording' : 'blocked' })
		case 'CLEARED':
			fx.push('destroyReplayer', e.all ? 'clearAll' : 'clearCurrent')
			return out({ ...stopPreview(s), selectedStepId: null, rec: s.rec === 'storage-full' ? 'recording' : s.rec })
		// ---- priority 3: the guide ----
		case 'GUIDE_BUSY':
			fx.push('destroyReplayer')
			return out({ ...stopPreview(s), view: 'collapsed', consentCard: false, action: 'guide-executing' })
		case 'GUIDE_IDLE':
			return out({ ...s, action: s.action === 'guide-executing' ? 'none' : s.action })
		case 'QUESTION':
			fx.push('destroyReplayer', 'submitQuestion')
			return out({ ...stopPreview(s), view: 'collapsed', action: 'question-submitting' })
		// ---- priority 4: the timeline ----
		case 'EXPAND':
			if (s.action === 'guide-executing') return out(s)
			return out({ ...s, view: 'expanded', action: 'none' })
		case 'COLLAPSE':
			fx.push('destroyReplayer')
			return out({ ...stopPreview(s), view: 'collapsed', consentCard: false })
		case 'SELECT_STEP':
			if (s.view !== 'expanded') return out(s)
			if (s.selectedStepId === e.stepId && s.preview !== 'error') return out(s)
			fx.push('destroyReplayer', 'loadPreview')
			return out({ ...s, selectedStepId: e.stepId, preview: 'loading' })
		case 'SCRUB':
			return out(s.preview === 'ready' || s.preview === 'playing' || s.preview === 'scrubbing' ? { ...s, preview: 'scrubbing' } : s)
		// ---- priority 5: playback ----
		case 'PREVIEW_READY':
			return out(s.preview === 'loading' ? { ...s, preview: 'ready' } : s)
		case 'PREVIEW_FAILED':
			fx.push('destroyReplayer')
			return out({ ...s, preview: 'error' })
		case 'PLAY':
			return out(s.preview === 'ready' || s.preview === 'scrubbing' ? { ...s, preview: 'playing' } : s)
		case 'STOP_PLAYBACK':
			return out(s.preview === 'playing' || s.preview === 'scrubbing' ? { ...s, preview: 'ready' } : s)
	}
}
