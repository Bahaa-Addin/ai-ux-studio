/**
 * The shared store contract (ADR-0010). Two implementations: Postgres for the
 * pilot and memory for tests and quick local runs. Services never share
 * process memory; anything shared goes through this interface.
 */
import type { Manifest, PlanStep, Target } from '#kb'

export interface Turn {
	id: string
	utterance: string
	lang: string
	intent: string
	route: string
	destinationId?: string
	at: string
}

/** What a follow-up like "subscribe to it" refers to. */
export interface Entity {
	kind: 'item' | 'destination' | 'visual'
	destinationId?: string
	collectionId?: string
	key?: string
	name?: string
	pageId?: string
	target?: Target
}

export interface ActivePlan {
	turnId: string
	steps: PlanStep[]
	cursor: number
	startedAt: string
	/** Set while a step that navigates is in flight. */
	awaitingNavigation?: boolean
	itemKey?: string
}

export interface AgentState {
	task: string
	/** page-agent history events carried across page loads (ADR-0017). */
	history: unknown[]
	steps: number
	startedAt: string
	turnId: string
}

export interface SessionState {
	id: string
	siteId: string
	lang: string
	createdAt: string
	updatedAt: string
	turns: Turn[]
	last?: Entity
	plan?: ActivePlan | null
	agent?: AgentState | null
	usage: { agentSteps: number; agentTokens: number }
}

export interface TraceEvent {
	seq?: number
	sessionId: string
	siteId: string
	turnId?: string
	traceId: string
	name: string
	service: string
	at: string
	durationMs?: number
	attrs: Record<string, unknown>
}

export interface KbVersionInfo {
	id: string
	createdAt: string
	hash: string
	active: boolean
	destinations: number
}

export interface PushSubscriptionRow {
	id: string
	siteId: string
	endpoint: string
	keys: { p256dh: string; auth: string }
	createdAt: string
}

export interface Watch {
	id: string
	siteId: string
	/** 'push': Web Push to the subscription; 'live': to the session's open pages (ADR-0023). */
	channel: 'push' | 'live'
	subscriptionId?: string
	sessionId?: string
	url: string
	pageId?: string
	target: Target
	label: string
	lang: string
	status: 'active' | 'error' | 'paused'
	lastHash?: string
	lastText?: string
	lastCheckedAt?: string
	nextCheckAt: string
	intervalSec: number
	errorCount: number
	missingCount: number
	createdAt: string
}

export interface WatchChange {
	id: string
	watchId: string
	at: string
	before: string
	after: string
}

export interface Store {
	readonly kind: 'postgres' | 'memory'

	putKbVersion(siteId: string, manifest: Manifest): Promise<void>
	activateKb(siteId: string, versionId: string): Promise<void>
	getActiveKb(siteId: string): Promise<Manifest | null>
	getActiveKbId(siteId: string): Promise<string | null>
	getKbVersion(siteId: string, versionId: string): Promise<Manifest | null>
	listKbVersions(siteId: string, limit?: number): Promise<KbVersionInfo[]>

	getSession(id: string): Promise<SessionState | null>
	/** Insert or replace a whole session. */
	putSession(state: SessionState, ttlMin: number): Promise<void>
	/** Atomic shallow merge of top-level keys (concurrent writers touching different keys never lose updates). */
	patchSession(id: string, patch: Partial<SessionState>, ttlMin: number): Promise<SessionState | null>
	createHandoff(token: string, sessionId: string, ttlSec: number): Promise<void>
	/** Single use: returns the session id once, then null. */
	redeemHandoff(token: string): Promise<string | null>

	appendTrace(ev: TraceEvent): Promise<TraceEvent>
	listTrace(sessionId: string, sinceSeq?: number): Promise<TraceEvent[]>
	/** Live events from every process (Postgres LISTEN/NOTIFY). Returns an unsubscribe function. */
	subscribeTrace(listener: (ev: TraceEvent) => void): Promise<() => Promise<void>>

	upsertSubscription(sub: Omit<PushSubscriptionRow, 'id' | 'createdAt'>): Promise<PushSubscriptionRow>
	getSubscription(id: string): Promise<PushSubscriptionRow | null>
	deleteSubscription(id: string): Promise<void>
	createWatch(w: Omit<Watch, 'id' | 'createdAt' | 'errorCount' | 'missingCount' | 'status'>): Promise<Watch>
	getWatch(id: string): Promise<Watch | null>
	listWatches(by: { subscriptionId?: string; sessionId?: string }): Promise<Watch[]>
	/** Due watches, claimed for checking so two schedulers never check the same watch at once. */
	claimDueWatches(now: Date, limit: number, leaseSec: number): Promise<Watch[]>
	updateWatch(id: string, patch: Partial<Watch>): Promise<void>
	deleteWatch(id: string): Promise<void>
	addChange(c: Omit<WatchChange, 'id'>): Promise<WatchChange>
	listChanges(watchId: string, limit?: number): Promise<WatchChange[]>

	cacheGet<T = unknown>(ns: string, key: string): Promise<T | null>
	cachePut(ns: string, key: string, value: unknown): Promise<void>

	/** Adds to a counter (e.g. tokens per site per day) and returns the new total. */
	addUsage(scope: string, amount: number): Promise<number>

	purgeExpired(now: Date, traceRetentionDays: number): Promise<{ sessions: number; handoffs: number; traces: number }>
	close(): Promise<void>
}
