/**
 * When a journey gets a new step (SPEC-06 §2): one step per page visit, not per event. A full
 * load, an in-app route change (`pushState`, a meaningful `replaceState`, `popstate`) or a known
 * link or call to action starts one; redirects, reloads, title changes, hash changes and tracking
 * parameters do not. Pure, so the rules are unit-tested.
 */
import type { NavigationCause, TrailStepSummary } from './types.ts'

export type RouteSignal = 'load' | 'push' | 'replace' | 'pop' | 'poll'

/** Pending transition saved when a person activates a link, read on the next page (same tab). */
export interface PendingTransition {
	fromStepId: string
	sourceDestinationId?: string
	/** Canonical path of the link's target. */
	target: string
	targetPageId?: string
	at: number
}

export interface StepDecision {
	action: 'new' | 'continue' | 'replace'
	cause: NavigationCause
}

/** A redirect or reload this soon after a step began is the same visit. */
export const SAME_VISIT_MS = 10_000
/** A pending link transition older than this is stale (the person did something else). */
export const PENDING_MS = 30_000

/**
 * Decides what a route signal means for the journey.
 * - Same canonical path as the current step: continue (hash, tracking, title, reload).
 * - `replace` soon after the step began: the app normalised its URL (a redirect) → replace in place.
 * - Otherwise a new step, caused by the pending link if it points here, else by the signal.
 */
export function decideStep(input: {
	current?: Pick<TrailStepSummary, 'canonicalPath' | 'enteredAt' | 'type'>
	path: string
	signal: RouteSignal
	navType?: 'navigate' | 'reload' | 'back_forward' | 'prerender'
	pending?: PendingTransition | null
	now: number
}): StepDecision {
	const { current, path, signal, pending, now } = input
	const fromLink = pending && pending.target === path && now - pending.at <= PENDING_MS
	const cause: NavigationCause = fromLink
		? { kind: 'destination', sourceDestinationId: pending!.sourceDestinationId, sourceStepId: pending!.fromStepId, targetPageId: pending!.targetPageId }
		: signal === 'pop' || input.navType === 'back_forward'
			? { kind: 'history' }
			: signal === 'push' || signal === 'replace' || signal === 'poll'
				? { kind: 'spa' }
				: { kind: 'direct' }
	if (!current) return { action: 'new', cause }
	if (current.type === 'page' && current.canonicalPath === path) return { action: 'continue', cause }
	if (current.type === 'page' && signal === 'replace' && now - current.enteredAt < SAME_VISIT_MS && !fromLink) return { action: 'replace', cause: { kind: 'spa' } }
	return { action: 'new', cause }
}
