/**
 * The gateway (ADR-0022): the only public endpoint. Serves the SDK, checks site
 * keys and origins, rate-limits, opens a trace per request, orchestrates one
 * turn across services, streams X-ray events, and fronts the agent proxy.
 */
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'

import { InterestContributionBatch } from '#kb'

import type { Services } from '../index.ts'
import type { SiteConfig } from '../shared/config.ts'
import { agentModelConfigured, ROOT } from '../shared/config.ts'
import { clientIp, HttpError, readJson, Router, sendJson } from '../shared/http.ts'
import { newId, signToken, verifyToken } from '../shared/ids.ts'
import { log } from '../shared/log.ts'
import type { RpcContext } from '../shared/rpc.ts'
import type { TraceEvent } from '../shared/store/index.ts'
import { newContext } from '../shared/trace.ts'
import { Metrics, RateLimiter } from './limits.ts'

const AGENT_TOKEN_TTL_SEC = 30 * 60

/** What the SDK needs to run the trail (SPEC-06): never anything about a person. */
function trailSettings(site: SiteConfig, aggregationApproved: boolean) {
	const t = site.trail
	return { enabled: t.enabled, retentionHours: t.retentionHours, excludePaths: t.excludePaths, privateSelectors: t.privateSelectors, topOffset: t.topOffset, hostUrl: t.hostUrl, replayAssetPaths: t.replayAssetPaths, aggregation: t.enabled && t.aggregation.enabled && aggregationApproved }
}

/** A trail chip's metadata (ADR-0038), or nothing: strict shape, short ids, one known source. */
function turnHint(h: unknown): { source: 'trail-suggestion'; destinationId: string; pageId?: string; trailStepId?: string; questionId?: string } | undefined {
	if (!h || typeof h !== 'object') return undefined
	const o = h as Record<string, unknown>
	const id = (v: unknown) => (typeof v === 'string' && v.length <= 160 && /^[a-z0-9][a-z0-9._:-]*$/i.test(v) ? v : undefined)
	const destinationId = id(o.destinationId)
	if (o.source !== 'trail-suggestion' || !destinationId) return undefined
	return { source: 'trail-suggestion', destinationId, pageId: id(o.pageId), trailStepId: id(o.trailStepId), questionId: id(o.questionId) }
}

export interface GatewayOptions {
	services: Services
	sdkDir?: string
	adminToken?: string
}

export function createGateway(opts: GatewayOptions) {
	const s = opts.services
	const { platform } = s
	const sdkDir = opts.sdkDir || path.join(ROOT, 'packages/sdk/dist')
	const bySiteKey = new Map([...s.sites.values()].map((x) => [x.siteKey, x]))
	const turnLimiter = new RateLimiter(platform.rateLimit.turnsPerMinute, platform.rateLimit.burst)
	const agentLimiter = new RateLimiter(platform.rateLimit.turnsPerMinute * 4, platform.rateLimit.burst * 4)
	// Approved aggregation only (ADR-0037 §6): one batch per address and site every ten minutes.
	const contributionLimiter = new RateLimiter(0.1, 1)
	const metrics = new Metrics()
	const router = new Router()

	// ---- live X-ray fan-out: one store subscription per process ----
	const listeners = new Map<string, Set<(ev: TraceEvent) => void>>()
	let unsubscribe: (() => Promise<void>) | null = null
	const ensureSubscribed = async () => {
		if (unsubscribe) return
		unsubscribe = await s.store.subscribeTrace((ev) => {
			for (const l of listeners.get(ev.sessionId) || []) l(ev)
		})
	}

	const siteFor = (req: http.IncomingMessage, url: URL): SiteConfig => {
		const key = (req.headers['x-vg-site-key'] as string) || url.searchParams.get('k') || ''
		const site = bySiteKey.get(key)
		if (!site) throw new HttpError(401, 'unknown site key', 'bad_site_key')
		const origin = req.headers.origin
		if (origin && !site.origins.some((o) => new URL(o.url).origin === origin)) throw new HttpError(403, `origin ${origin} is not allowed for this site`, 'bad_origin')
		return site
	}
	const ctxFor = (req: http.IncomingMessage, site: SiteConfig, sessionId: string, turnId?: string): RpcContext => ({
		trace: newContext({ siteId: site.id, sessionId, turnId }, req.headers.traceparent as string | undefined),
	})
	const agentToken = (siteId: string, sessionId: string) => signToken({ s: siteId, ses: sessionId }, platform.secret, AGENT_TOKEN_TTL_SEC)

	// ---- SDK files ----
	router.on('GET', '/sdk/:file', (_req, res, p) => {
		if (!/^[\w.-]+\.js(\.map)?$/.test(p.file)) throw new HttpError(404, 'not found')
		const file = path.join(sdkDir, p.file)
		if (!fs.existsSync(file)) throw new HttpError(404, 'SDK not built: npm run build:sdk')
		res.writeHead(200, {
			'Content-Type': 'text/javascript; charset=utf-8',
			'Access-Control-Allow-Origin': '*',
			'Cache-Control': process.env.NODE_ENV === 'production' ? 'public, max-age=300' : 'no-store',
		})
		res.end(fs.readFileSync(file))
	})

	router.on('GET', '/health', async (_req, res) => {
		sendJson(res, 200, { ok: true, store: s.store.kind, services: platform.services, sites: [...s.sites.keys()], agent: s.local.agent.status() })
	})
	router.on('GET', '/metrics', async (_req, res) => sendJson(res, 200, metrics.snapshot()))

	// ---- session: resume, hand off, or start; plus page context ----
	router.on('POST', '/v1/session', async (req, res, _p, url) => {
		const site = siteFor(req, url)
		const body = await readJson(req)
		const lang = site.languages.includes(body.lang) ? body.lang : site.defaultLanguage
		const ctx = ctxFor(req, site, body.sessionId || 'new')
		const { session, via } = await s.sessions.start({ siteId: site.id, lang, sessionId: body.sessionId, handoff: body.handoff }, ctx)
		const page = await s.knowledge.pageContext({ siteId: site.id, url: String(body.page?.url || '') }, ctx)
		const plan = session.plan && Date.now() - new Date(session.plan.startedAt).getTime() < 120_000 ? session.plan : null
		metrics.inc(`session.${via}`)
		const agentOn = site.agent.enabled && agentModelConfigured(platform)
		sendJson(res, 200, {
			sessionId: session.id,
			via,
			lang: session.lang,
			plan,
			last: session.last ?? null,
			agent: session.agent ?? null,
			agentToken: agentOn ? agentToken(site.id, session.id) : null,
			page,
			site: { id: site.id, name: site.name, languages: site.languages, defaultLanguage: site.defaultLanguage, speech: { ...site.speech, phrases: (page as { phrases?: string[] }).phrases || [] }, ui: site.ui, agent: { enabled: agentOn, maxSteps: site.agent.maxSteps, timeoutSec: site.agent.timeoutSec }, watch: { enabled: site.watch.enabled }, trail: trailSettings(site, platform.trailAggregation) },
			push: site.watch.enabled ? s.local.watch.publicKey() : null,
		})
	})

	// ---- one turn: router plans, sessions records ----
	router.on('POST', '/v1/turn', async (req, res, _p, url) => {
		const t0 = performance.now()
		const site = siteFor(req, url)
		const body = await readJson(req)
		if (!turnLimiter.take(`${site.id}:${clientIp(req)}`)) throw new HttpError(429, 'too many requests', 'rate_limited')
		const sessionId = String(body.sessionId || '')
		const turnId = newId('turn', 9)
		const ctx = ctxFor(req, site, sessionId, turnId)
		const session = await s.sessions.get({ siteId: site.id, sessionId }, ctx)
		const out = await s.router.turn({ siteId: site.id, session, utterance: String(body.utterance || ''), uiLang: body.uiLang, page: { url: String(body.page?.url || '') }, hint: turnHint(body.hint) }, ctx)
		await s.sessions.applyTurn({ siteId: site.id, sessionId, turn: out.turn, last: out.last, plan: out.plan }, ctx)
		const ms = performance.now() - t0
		metrics.inc(`turn.${out.plan.meta.route}`)
		metrics.observe('turn', ms)
		await s.tracer('gateway').event(ctx.trace, 'turn.planned', { route: out.plan.meta.route, ms: Math.round(ms * 10) / 10 }, ms)
		sendJson(res, 200, { turnId, plan: out.plan, kbVersion: out.kbVersion, understanding: { lang: out.understanding.lang, intent: out.understanding.intent, confidence: out.understanding.decision.confidence, provider: out.understanding.decision.provider } })
	})

	// ---- progress through a plan, and SDK-side events for the X-ray panel ----
	router.on('POST', '/v1/progress', async (req, res, _p, url) => {
		const site = siteFor(req, url)
		const body = await readJson(req)
		const ctx = ctxFor(req, site, String(body.sessionId || ''), body.turnId)
		// cursor < 0: events only (timings, agent steps); the plan does not move.
		const r =
			Number(body.cursor) < 0
				? { ok: true }
				: await s.sessions.progress({ siteId: site.id, sessionId: body.sessionId, turnId: body.turnId, cursor: Number(body.cursor) || 0, awaitingNavigation: body.awaitingNavigation, done: body.done, item: body.item }, ctx)
		if (Number(body.cursor) < 0) await s.sessions.get({ siteId: site.id, sessionId: String(body.sessionId || '') }, ctx)
		for (const ev of (Array.isArray(body.events) ? body.events : []).slice(0, 20)) {
			if (typeof ev?.name !== 'string' || !/^(sdk|agent)\.[\w.]+$/.test(ev.name)) continue
			await s.tracer('sdk').event(ctx.trace, ev.name, typeof ev.attrs === 'object' && ev.attrs ? ev.attrs : {}, typeof ev.ms === 'number' ? ev.ms : undefined)
			if (ev.name === 'sdk.first_motion') metrics.observe('first_motion', Number(ev.ms) || 0)
		}
		sendJson(res, 200, r)
	})

	// ---- Exploration Trail (SPEC-06): the page map, and approved anonymous counts (off by default) ----
	router.on('GET', '/v1/experience', async (req, res, _p, url) => {
		const site = siteFor(req, url)
		if (!site.trail.enabled) throw new HttpError(404, 'the trail is not enabled for this site', 'trail_off')
		const ctx = ctxFor(req, site, 'experience')
		const map = await s.knowledge.experience({ siteId: site.id, url: String(url.searchParams.get('url') || '') }, ctx)
		// Public knowledge only: the browser may reuse it for a couple of minutes.
		sendJson(res, 200, map, { 'Cache-Control': 'private, max-age=120' })
	})

	router.on('POST', '/v1/experience/contributions', async (req, res, _p, url) => {
		const site = siteFor(req, url)
		if (!site.trail.enabled || !site.trail.aggregation.enabled || !platform.trailAggregation) throw new HttpError(404, 'aggregation is disabled', 'aggregation_off')
		if (!contributionLimiter.take(`${site.id}:${clientIp(req)}`)) throw new HttpError(429, 'too many contributions', 'rate_limited')
		const parsed = InterestContributionBatch.safeParse(await readJson(req, 4096))
		if (!parsed.success) throw new HttpError(400, 'invalid contribution batch', 'bad_batch')
		const b = parsed.data
		const kb = await s.kb.get(site.id)
		if (!kb || b.siteId !== site.id || b.kbVersionId !== kb.versionId) throw new HttpError(409, 'not the active knowledge version', 'stale_kb')
		const today = new Date().toISOString().slice(0, 10)
		const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)
		if (b.dayBucket !== today && b.dayBucket !== yesterday) throw new HttpError(400, 'day bucket out of range', 'bad_day')
		const seen = new Set<string>()
		for (const c of b.contributions) {
			const d = kb.dest.get(c.destinationId)
			const page = d ? kb.pages.get(d.pageId) : undefined
			if (!d || d.pageId !== c.pageId || !page || seen.has(d.id)) throw new HttpError(400, 'unknown or repeated destination', 'bad_destination')
			if (['account', 'login', 'checkout'].includes(page.kind) || page.requiresAuth || d.commit) throw new HttpError(400, 'private destinations are not counted', 'private_destination')
			seen.add(d.id)
		}
		// Counts only: no address, no session, no trace event with the payload.
		await s.store.addInterestCounts(b.contributions.map((c) => ({ siteId: site.id, kbVersionId: b.kbVersionId, day: b.dayBucket, pageId: c.pageId, destinationId: c.destinationId, warm: c.interestBand === 'warm' ? 1 : 0, hot: c.interestBand === 'hot' ? 1 : 0, activated: c.activated ? 1 : 0 })))
		metrics.inc('experience.contributions')
		sendJson(res, 202, { accepted: b.contributions.length })
	})

	router.on('POST', '/v1/handoff', async (req, res, _p, url) => {
		const site = siteFor(req, url)
		const body = await readJson(req)
		const ctx = ctxFor(req, site, String(body.sessionId || ''))
		sendJson(res, 200, await s.sessions.handoff({ siteId: site.id, sessionId: body.sessionId }, ctx))
	})

	// A fresh X-ray (a page load) gets whole turns, not the last N events: an agent turn alone can
	// write dozens of events and would push earlier turns' first rows out of a fixed-size window.
	const recentTurns = (events: TraceEvent[], turns = 8, max = 600): TraceEvent[] => {
		const ids = [...new Set(events.map((e) => e.turnId).filter(Boolean))].slice(-turns)
		const keep = new Set(ids)
		return events.filter((e) => !e.turnId || keep.has(e.turnId)).slice(-max)
	}

	// ---- X-ray and notifications: server-sent events for one session ----
	router.on('GET', '/v1/events', async (req, res, _p, url) => {
		const site = siteFor(req, url)
		const sessionId = url.searchParams.get('session') || ''
		const ctx = ctxFor(req, site, sessionId)
		await s.sessions.get({ siteId: site.id, sessionId }, ctx)
		await ensureSubscribed()
		res.writeHead(200, {
			'Content-Type': 'text/event-stream; charset=utf-8',
			'Cache-Control': 'no-store',
			Connection: 'keep-alive',
			'Access-Control-Allow-Origin': req.headers.origin || '*',
			'X-Accel-Buffering': 'no',
		})
		const since = Number(req.headers['last-event-id'] || url.searchParams.get('since') || 0)
		let lastSeq = since
		const write = (ev: TraceEvent) => {
			if ((ev.seq || 0) <= lastSeq) return
			lastSeq = ev.seq || lastSeq
			res.write(`id: ${ev.seq}\nevent: ${ev.name.startsWith('watch.changed') ? 'notify' : 'trace'}\ndata: ${JSON.stringify(ev)}\n\n`)
		}
		// Live events that arrive while the backlog loads wait for it: written first, their higher
		// seq would make `write` drop the whole backlog (an X-ray with "requests 0" after a reload).
		let pending: TraceEvent[] | null = []
		const listener = (ev: TraceEvent) => (pending ? pending.push(ev) : write(ev))
		const set = listeners.get(sessionId) || new Set()
		set.add(listener)
		listeners.set(sessionId, set)
		// Backlog: everything since `since` (only the latest turns when starting fresh).
		const backlog = await s.store.listTrace(sessionId, since)
		for (const ev of since ? backlog : recentTurns(backlog)) write(ev)
		for (const ev of pending.sort((a, b) => (a.seq || 0) - (b.seq || 0))) write(ev)
		pending = null
		const ping = setInterval(() => res.write(': ping\n\n'), 20_000)
		req.on('close', () => {
			clearInterval(ping)
			set.delete(listener)
			if (!set.size) listeners.delete(sessionId)
		})
	})

	// ---- live events by long polling, for clients that cannot hold a stream open (ADR-0031) ----
	router.on('GET', '/v1/events/poll', async (req, res, _p, url) => {
		const site = siteFor(req, url)
		const sessionId = url.searchParams.get('session') || ''
		const ctx = ctxFor(req, site, sessionId)
		await s.sessions.get({ siteId: site.id, sessionId }, ctx)
		await ensureSubscribed()
		const since = Number(url.searchParams.get('since') || 0)
		const wait = Math.max(0, Math.min(25, Number(url.searchParams.get('wait') || 20)))
		let events = await s.store.listTrace(sessionId, since)
		if (!since) events = recentTurns(events)
		if (!events.length && wait) {
			events = await new Promise<TraceEvent[]>((resolve) => {
				const got: TraceEvent[] = []
				let settle: ReturnType<typeof setTimeout> | undefined
				const set = listeners.get(sessionId) || new Set()
				const finish = () => {
					clearTimeout(timer)
					clearTimeout(settle)
					set.delete(write)
					if (!set.size) listeners.delete(sessionId)
					resolve(got)
				}
				// Collect for a moment after the first event so a burst comes back in one response.
				const write = (ev: TraceEvent) => {
					if ((ev.seq || 0) <= since) return
					got.push(ev)
					if (!settle) settle = setTimeout(finish, 120)
				}
				set.add(write)
				listeners.set(sessionId, set)
				const timer = setTimeout(finish, wait * 1000)
				req.on('close', finish)
			})
		}
		sendJson(res, 200, { events })
	})

	// ---- the fallback agent's model calls (OpenAI-compatible) ----
	router.on('POST', '/v1/agent/chat/completions', async (req, res) => {
		const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '')
		const claims = verifyToken<{ s: string; ses: string }>(token, platform.secret)
		if (!claims) throw new HttpError(401, 'invalid or expired agent token', 'bad_agent_token')
		const site = s.sites.get(claims.s)
		if (!site) throw new HttpError(401, 'unknown site', 'bad_site_key')
		const origin = req.headers.origin
		if (origin && !site.origins.some((o) => new URL(o.url).origin === origin)) throw new HttpError(403, 'origin not allowed', 'bad_origin')
		if (!agentLimiter.take(`${site.id}:${claims.ses}`)) throw new HttpError(429, 'too many agent steps', 'rate_limited')
		const body = await readJson(req, 2 * 1024 * 1024)
		const ctx = ctxFor(req, site, claims.ses, (req.headers['x-vg-turn'] as string) || undefined)
		const t0 = performance.now()
		const out = await s.agent.chat({ siteId: site.id, sessionId: claims.ses, body }, ctx)
		metrics.inc('agent.calls')
		metrics.observe('agent.llm', performance.now() - t0)
		sendJson(res, 200, out)
	})

	router.on('POST', '/v1/agent/state', async (req, res, _p, url) => {
		const site = siteFor(req, url)
		const body = await readJson(req, 512 * 1024)
		const ctx = ctxFor(req, site, String(body.sessionId || ''))
		sendJson(res, 200, await s.sessions.saveAgent({ siteId: site.id, sessionId: body.sessionId, agent: body.agent ?? null }, ctx))
	})

	// ---- page watch ----
	router.on('POST', '/v1/push/subscribe', async (req, res, _p, url) => {
		const site = siteFor(req, url)
		const body = await readJson(req)
		const ctx = ctxFor(req, site, String(body.sessionId || ''))
		sendJson(res, 200, await s.watch.subscribe({ siteId: site.id, subscription: body.subscription }, ctx))
	})
	router.on('POST', '/v1/watch', async (req, res, _p, url) => {
		const site = siteFor(req, url)
		const body = await readJson(req)
		const sessionId = String(body.sessionId || '')
		const ctx = ctxFor(req, site, sessionId, body.turnId)
		await s.sessions.get({ siteId: site.id, sessionId }, ctx)
		const r = await s.watch.create({ siteId: site.id, sessionId, subscriptionId: body.subscriptionId, url: body.url, pageId: body.pageId, target: body.target, label: String(body.label || ''), lang: body.lang || site.defaultLanguage }, ctx)
		metrics.inc(`watch.created.${r.watch.channel}`)
		sendJson(res, 200, { watchId: r.watch.id, channel: r.watch.channel, intervalSec: r.watch.intervalSec, baseline: r.baseline.slice(0, 300) })
	})
	router.on('GET', '/v1/watches', async (req, res, _p, url) => {
		const site = siteFor(req, url)
		const sessionId = url.searchParams.get('session') || ''
		const r = await s.watch.list({ siteId: site.id, sessionId }, ctxFor(req, site, sessionId))
		sendJson(res, 200, { watches: r.watches.map((w: any) => ({ id: w.id, label: w.label, url: w.url, channel: w.channel, status: w.status, lastCheckedAt: w.lastCheckedAt })) })
	})
	router.on('DELETE', '/v1/watch/:id', async (req, res, p, url) => {
		const site = siteFor(req, url)
		const sessionId = url.searchParams.get('session') || ''
		sendJson(res, 200, await s.watch.remove({ siteId: site.id, sessionId, watchId: p.id }, ctxFor(req, site, sessionId)))
	})

	// ---- admin: knowledge versions and activation, traces ----
	const admin = (req: http.IncomingMessage) => {
		const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '')
		const local = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress || '')
		if (opts.adminToken ? token !== opts.adminToken : !local) throw new HttpError(401, 'admin token required', 'admin')
	}
	router.on('GET', '/admin/sites/:site/kb', async (req, res, p) => {
		admin(req)
		sendJson(res, 200, await s.knowledge.versions({ siteId: p.site }, { trace: newContext({ siteId: p.site, sessionId: 'admin' }) }))
	})
	router.on('POST', '/admin/sites/:site/kb/:version/activate', async (req, res, p) => {
		admin(req)
		sendJson(res, 200, await s.knowledge.activate({ siteId: p.site, versionId: p.version }, { trace: newContext({ siteId: p.site, sessionId: 'admin' }) }))
	})
	router.on('GET', '/admin/sessions/:id/trace', async (req, res, p) => {
		admin(req)
		sendJson(res, 200, { events: await s.store.listTrace(p.id) })
	})
	router.on('POST', '/admin/watch/tick', async (req, res) => {
		admin(req)
		sendJson(res, 200, await s.watch.tick({}, { trace: newContext({ siteId: '', sessionId: 'admin' }) }))
	})

	const server = http.createServer(async (req, res) => {
		const url = new URL(req.url || '/', platform.publicUrl)
		const origin = req.headers.origin
		if (origin) {
			res.setHeader('Access-Control-Allow-Origin', origin)
			res.setHeader('Vary', 'Origin')
			res.setHeader('Access-Control-Allow-Headers', 'content-type, x-vg-site-key, traceparent, authorization, x-vg-turn')
			res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
			res.setHeader('Access-Control-Max-Age', '600')
		}
		if (req.method === 'OPTIONS') {
			res.writeHead(204)
			return res.end()
		}
		const m = router.match(req.method || 'GET', url.pathname)
		if (!m) return sendJson(res, 404, { error: 'not found', code: 'not_found' })
		try {
			await m.handler(req, res, m.params, url)
		} catch (e) {
			const err = e as HttpError
			const status = err.status || 500
			metrics.inc(`error.${status}`)
			if (status >= 500) log('error', 'request failed', { path: url.pathname, error: err.message, stack: (e as Error).stack?.split('\n').slice(0, 4).join(' | ') })
			sendJson(res, status, { error: err.message, code: err.code || 'error' })
		}
	})

	return {
		server,
		metrics,
		listen(port = platform.port): Promise<void> {
			return new Promise((resolve) => server.listen(port, () => resolve()))
		},
		async close() {
			server.closeAllConnections?.()
			await new Promise<void>((r) => server.close(() => r()))
			if (unsubscribe) await unsubscribe()
			unsubscribe = null
		},
	}
}
