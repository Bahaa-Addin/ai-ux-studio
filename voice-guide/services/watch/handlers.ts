/**
 * Page watch on the platform (ADR-0023, follows ADR-0001/0004 of the page watch
 * prototype): server-side checks of a rendered section on a schedule, one
 * change record per change, delivered by Web Push or live to an open session.
 */
import type { Target } from '#kb'
import type { PlatformConfig, SiteConfig } from '#shared/config.ts'
import { HttpError } from '#shared/http.ts'
import { log } from '#shared/log.ts'
import type { RpcContext } from '#shared/rpc.ts'
import type { Store, Watch } from '#shared/store/index.ts'
import type { Tracer } from '#shared/trace.ts'

import { Checker, type Snapshot } from './checker.ts'
import { loadVapidKeys, sendPush, type VapidKeys } from './webpush.ts'

const MAX_ERRORS = 5
const MAX_MISSING = 3
const MAX_WATCHES_PER_SESSION = 20

export interface WatchDeps {
	platform: PlatformConfig
	store: Store
	sites: Map<string, SiteConfig>
	tracer: Tracer
	checker?: { read(url: string, target: Target): Promise<Snapshot>; close(): Promise<void> }
	fetchImpl?: typeof fetch
}

export function createWatchService(deps: WatchDeps) {
	const { store } = deps
	let vapid: VapidKeys | null = null
	const keys = () => (vapid ??= loadVapidKeys(deps.platform.vapid.keyFile))
	const checker =
		deps.checker ||
		new Checker([...deps.sites.values()].flatMap((s) => s.crawl.cookies.map((c) => ({ url: c.url, name: c.name, value: c.value }))))

	const site = (id: string) => {
		const s = deps.sites.get(id)
		if (!s?.watch.enabled) throw new HttpError(403, 'page watch is off for this site', 'watch_disabled')
		return s
	}
	const traceFor = (w: Watch) => ({ traceId: '0'.repeat(32), spanId: '0'.repeat(16), siteId: w.siteId, sessionId: w.sessionId || `watch:${w.id}` })

	async function notify(w: Watch, before: string, after: string, kind: 'changed' | 'removed') {
		const title = kind === 'changed' ? (w.lang === 'ar' ? `اتغير: ${w.label}` : `Changed: ${w.label}`) : w.lang === 'ar' ? `اختفى من الصفحة: ${w.label}` : `No longer on the page: ${w.label}`
		const payload = { type: 'watch.changed', kind, channel: w.channel, watchId: w.id, title, body: after.slice(0, 160), before: before.slice(0, 300), after: after.slice(0, 300), url: w.url, lang: w.lang }
		if (w.sessionId) await deps.tracer.event(traceFor(w), 'watch.changed', payload)
		if (w.channel === 'push' && w.subscriptionId) {
			const sub = await store.getSubscription(w.subscriptionId)
			if (!sub) return
			try {
				const r = await sendPush(sub, payload, { keys: keys(), subject: deps.platform.vapid.subject }, { fetchImpl: deps.fetchImpl })
				await deps.tracer.event(traceFor(w), 'watch.push', { status: r.status, ok: r.ok })
				if (r.gone) await store.deleteSubscription(sub.id)
			} catch (e) {
				log('warn', 'push failed', { watchId: w.id, error: (e as Error).message })
			}
		}
	}

	async function check(w: Watch): Promise<{ changed: boolean; status: Watch['status'] }> {
		const now = new Date()
		const next = new Date(now.getTime() + w.intervalSec * 1000).toISOString()
		try {
			const snap = await checker.read(w.url, w.target)
			if (!snap.found) {
				const missing = w.missingCount + 1
				if (missing >= MAX_MISSING) {
					await notify(w, w.lastText || '', '', 'removed')
					await store.updateWatch(w.id, { status: 'paused', missingCount: missing, lastCheckedAt: now.toISOString() })
					return { changed: true, status: 'paused' }
				}
				await store.updateWatch(w.id, { missingCount: missing, lastCheckedAt: now.toISOString(), nextCheckAt: next })
				return { changed: false, status: w.status }
			}
			const changed = !!w.lastHash && snap.hash !== w.lastHash
			if (changed) {
				await store.addChange({ watchId: w.id, at: now.toISOString(), before: w.lastText || '', after: snap.text })
				await notify(w, w.lastText || '', snap.text, 'changed')
			}
			await store.updateWatch(w.id, { lastHash: snap.hash, lastText: snap.text, lastCheckedAt: now.toISOString(), nextCheckAt: next, errorCount: 0, missingCount: 0, status: 'active' })
			return { changed, status: 'active' }
		} catch (e) {
			const errors = w.errorCount + 1
			const backoff = Math.min(3600, w.intervalSec * 2 ** errors)
			const status = errors >= MAX_ERRORS ? 'error' : w.status
			await store.updateWatch(w.id, { errorCount: errors, status, nextCheckAt: new Date(now.getTime() + backoff * 1000).toISOString() })
			log('warn', 'watch check failed', { watchId: w.id, error: (e as Error).message })
			return { changed: false, status }
		}
	}

	return {
		publicKey() {
			return { publicKey: keys().publicKey }
		},

		async subscribe(input: { siteId: string; subscription: { endpoint: string; keys: { p256dh: string; auth: string } } }) {
			site(input.siteId)
			const s = input.subscription
			if (!s?.endpoint?.startsWith('https://') || !s.keys?.p256dh || !s.keys?.auth) throw new HttpError(400, 'invalid push subscription', 'bad_subscription')
			const row = await store.upsertSubscription({ siteId: input.siteId, endpoint: s.endpoint, keys: s.keys })
			return { subscriptionId: row.id }
		},

		/** Creates a watch and records the current text as the baseline. */
		async create(
			input: { siteId: string; sessionId: string; subscriptionId?: string; url: string; pageId?: string; target: Target; label: string; lang: string },
			ctx: RpcContext,
		): Promise<{ watch: Watch; baseline: string }> {
			const s = site(input.siteId)
			const origins = new Set(s.origins.map((o) => new URL(o.url).origin))
			if (!origins.has(new URL(input.url).origin)) throw new HttpError(400, 'url outside the site', 'bad_url')
			if (!input.target?.css?.length) throw new HttpError(400, 'missing target', 'bad_target')
			const existing = await store.listWatches({ sessionId: input.sessionId })
			if (existing.length >= MAX_WATCHES_PER_SESSION) throw new HttpError(429, 'too many watches for this session', 'watch_limit')
			const dupe = existing.find((w) => w.url === input.url && w.target.css[0] === input.target.css[0])
			if (dupe) return { watch: dupe, baseline: dupe.lastText || '' }
			const snap = await checker.read(input.url, input.target)
			if (!snap.found) throw new HttpError(422, 'that section is not on the page', 'target_missing')
			const now = new Date()
			const watch = await store.createWatch({
				siteId: input.siteId,
				channel: input.subscriptionId ? 'push' : 'live',
				subscriptionId: input.subscriptionId,
				sessionId: input.sessionId,
				url: input.url,
				pageId: input.pageId,
				target: { css: input.target.css, text: input.target.text },
				label: input.label.slice(0, 120),
				lang: input.lang,
				lastHash: snap.hash,
				lastText: snap.text,
				lastCheckedAt: now.toISOString(),
				nextCheckAt: new Date(now.getTime() + s.watch.intervalSec * 1000).toISOString(),
				intervalSec: s.watch.intervalSec,
			})
			await deps.tracer.event(ctx.trace, 'watch.created', { watchId: watch.id, channel: watch.channel, label: watch.label, intervalSec: watch.intervalSec })
			return { watch, baseline: snap.text }
		},

		async list(input: { siteId: string; sessionId: string }) {
			const watches = await store.listWatches({ sessionId: input.sessionId })
			return { watches: watches.filter((w) => w.siteId === input.siteId) }
		},

		async remove(input: { siteId: string; sessionId: string; watchId: string }) {
			const w = await store.getWatch(input.watchId)
			if (!w || w.siteId !== input.siteId || w.sessionId !== input.sessionId) throw new HttpError(404, 'watch not found', 'no_watch')
			await store.deleteWatch(w.id)
			return { ok: true }
		},

		async changes(input: { siteId: string; sessionId: string; watchId: string }) {
			const w = await store.getWatch(input.watchId)
			if (!w || w.siteId !== input.siteId || w.sessionId !== input.sessionId) throw new HttpError(404, 'watch not found', 'no_watch')
			return { changes: await store.listChanges(w.id) }
		},

		/** One scheduler tick: claim due watches (safe with several replicas) and check them. */
		async tick(input: { limit?: number } = {}) {
			const due = await store.claimDueWatches(new Date(), input.limit ?? 20, 120)
			let changed = 0
			for (const w of due) if ((await check(w)).changed) changed++
			return { checked: due.length, changed }
		},

		async checkNow(input: { watchId: string }) {
			const w = await store.getWatch(input.watchId)
			if (!w) throw new HttpError(404, 'watch not found', 'no_watch')
			return check(w)
		},

		async close() {
			await checker.close()
		},
	}
}

export type WatchHandlers = ReturnType<typeof createWatchService>

/** Runs `tick` on an interval; one per process. Claiming makes several processes safe. */
export function startScheduler(watch: WatchHandlers, everyMs: number): () => void {
	let running = false
	const t = setInterval(async () => {
		if (running) return
		running = true
		try {
			await watch.tick({})
		} catch (e) {
			log('error', 'watch tick failed', { error: (e as Error).message })
		} finally {
			running = false
		}
	}, everyMs)
	t.unref()
	return () => clearInterval(t)
}
