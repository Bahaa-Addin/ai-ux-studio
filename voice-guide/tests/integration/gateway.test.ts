/** The public API over HTTP with real Postgres: sessions, turns, progress, handoff, SSE, agent proxy, watch, edge checks. */
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'

import { COMMIT_SELECTORS, type Target } from '#kb'

import { type MockLlm, startMockLlm } from '../helpers/mock-llm.ts'
import { startPlatform, type TestPlatform } from '../helpers/platform.ts'

const ORIGIN = 'http://localhost:4401'
const KEY = 'pk_demo_telco'
let p: TestPlatform
let llm: MockLlm
const pageText = new Map<string, string>()

before(async () => {
	llm = await startMockLlm()
	p = await startPlatform({
		port: 4490,
		env: { VG_LLM_BASE_URL: llm.url, VG_LLM_MODEL: 'mock-agent-1', VG_LLM_FALLBACK_BASE_URL: llm.url, VG_LLM_FALLBACK_MODEL: 'mock-agent-fallback', VG_RATE_TURNS_PER_MIN: '600', VG_RATE_BURST: '40', VG_AGENT_STEPS_PER_SESSION: '3' },
		options: {
			// The watch checker reads a section; here it reads from a map the test controls.
			watchChecker: {
				read: async (url: string, t: Target) => {
					const text = pageText.get(`${url} ${t.css[0]}`)
					return text === undefined ? { found: false, text: '', hash: '' } : { found: true, text, hash: `h:${text}` }
				},
				close: async () => {},
			},
		},
	})
})
after(async () => {
	await p?.close()
	await llm?.close()
})

async function call(path: string, body?: unknown, opts: { origin?: string | null; key?: string; method?: string; headers?: Record<string, string> } = {}) {
	const headers: Record<string, string> = { 'Content-Type': 'application/json', 'x-vg-site-key': opts.key ?? KEY, ...opts.headers }
	if (opts.origin !== null) headers.Origin = opts.origin ?? ORIGIN
	const res = await fetch(`${p.url}${path}`, { method: opts.method || (body === undefined ? 'GET' : 'POST'), headers, body: body === undefined ? undefined : JSON.stringify(body) })
	return { status: res.status, body: (await res.json().catch(() => ({}))) as any, headers: res.headers }
}

const newSession = async (lang = 'ar', url = `${ORIGIN}/ar/index.html`) => (await call('/v1/session', { lang, page: { url } })).body

test('a session starts, resumes by id, and crosses origins with a single-use handoff token', async () => {
	const s = await newSession()
	assert.match(s.sessionId, /^ses_/)
	assert.equal(s.via, 'new')
	assert.equal(s.page.pageId, 'web.home')
	// The knowledge base's own commit points, then the built-in floor every page gets (ADR-0058).
	assert.deepEqual(s.page.commitTargets, [['#confirm-pay', '#checkout-form > button.btn'], [...COMMIT_SELECTORS]])
	assert.ok(s.agentToken)
	assert.ok(s.push.publicKey.length > 80)
	const again = (await call('/v1/session', { sessionId: s.sessionId, lang: 'ar', page: { url: `${ORIGIN}/ar/bundles.html` } })).body
	assert.equal(again.sessionId, s.sessionId)
	assert.equal(again.via, 'resumed')
	const { token } = (await call('/v1/handoff', { sessionId: s.sessionId })).body
	const there = (await call('/v1/session', { handoff: token, lang: 'ar', page: { url: 'http://localhost:4402/ar/account.html' } }, { origin: 'http://localhost:4402' })).body
	assert.equal(there.sessionId, s.sessionId)
	assert.equal(there.via, 'handoff')
	assert.equal(there.page.pageId, 'app.account')
	const replay = (await call('/v1/session', { handoff: token, lang: 'ar', page: { url: 'http://localhost:4402/ar/account.html' } }, { origin: 'http://localhost:4402' })).body
	assert.notEqual(replay.sessionId, s.sessionId, 'a used token starts a new session')
})

test('a turn returns a validated plan, records it in the session and traces every layer', async () => {
	const s = await newSession()
	const r = await call('/v1/turn', { sessionId: s.sessionId, utterance: 'إيه أرخص باقة نت؟', page: { url: `${ORIGIN}/ar/index.html` } })
	assert.equal(r.status, 200, JSON.stringify(r.body))
	assert.deepEqual(
		r.body.plan.steps.map((x: any) => x.op),
		['navigate', 'pickItem', 'spotlight'],
	)
	assert.equal(r.body.plan.meta.route, 'replay')
	const state = await p.store.getSession(s.sessionId)
	assert.equal(state?.plan?.turnId, r.body.turnId)
	// The turn is recorded with its route and language, none of the person's words (AIXC-83).
	assert.equal(state?.turns.at(-1)?.id, r.body.turnId)
	assert.equal(state?.turns.at(-1)?.utterance, '')
	const names = (await p.store.listTrace(s.sessionId)).filter((e) => e.turnId === r.body.turnId).map((e) => e.name)
	for (const n of ['turn.received', 'router.understood', 'planner.plan', 'turn.planned']) assert.ok(names.includes(n), `${n} in ${names}`)
})

test('progress carries the picked item into the next request ("subscribe to it")', async () => {
	const s = await newSession()
	const t1 = (await call('/v1/turn', { sessionId: s.sessionId, utterance: 'إيه أرخص باقة نت؟', page: { url: `${ORIGIN}/ar/index.html` } })).body
	await call('/v1/progress', { sessionId: s.sessionId, turnId: t1.turnId, cursor: 1, awaitingNavigation: true })
	await call('/v1/progress', { sessionId: s.sessionId, turnId: t1.turnId, cursor: 2, item: { collectionId: 'web.bundles.mobile-internet', key: 'mi-10', name: 'سوبر ١٠' } })
	const mid = await p.store.getSession(s.sessionId)
	assert.equal(mid?.plan?.cursor, 2)
	assert.equal(mid?.last?.destinationId, 'web.bundles.mobile-internet.mi-10')
	await call('/v1/progress', { sessionId: s.sessionId, turnId: t1.turnId, cursor: 3, done: true })
	assert.equal((await p.store.getSession(s.sessionId))?.plan, null)
	const t2 = (await call('/v1/turn', { sessionId: s.sessionId, utterance: 'أشترك فيها إزاي؟', page: { url: `${ORIGIN}/ar/bundles.html` } })).body
	// On the bundles page the card's tab is opened first if it was closed (SPEC-06 §6).
	assert.equal(t2.plan.steps[0].op, 'reveal')
	assert.deepEqual(t2.plan.steps[1], {
		op: 'pickItem',
		collection: t2.plan.steps[1].collection,
		select: { by: 'key', key: 'mi-10' },
	})
	assert.equal(t2.plan.steps.at(-1).op, 'confirm')
	// stale progress from the old turn is ignored
	assert.equal((await call('/v1/progress', { sessionId: s.sessionId, turnId: t1.turnId, cursor: 1 })).body.stale, true)
})

// Before the flood test below, which uses up the turn rate limit.
test('a live event that arrives while the X-ray backlog loads does not drop the backlog', async () => {
	const s = await newSession('en', `${ORIGIN}/en/index.html`)
	const turn = (await call('/v1/turn', { sessionId: s.sessionId, utterance: 'coverage', page: { url: `${ORIGIN}/en/index.html` } })).body
	// Hold the backlog read until a newer event for the same session has been delivered live.
	const listTrace = p.store.listTrace.bind(p.store)
	p.store.listTrace = async (sessionId: string, since?: number) => {
		const backlog = await listTrace(sessionId, since)
		await p.services.tracer('test').event({ sessionId: s.sessionId, siteId: 'demo-telco', turnId: 'turn_live', traceId: 'tr_live', spanId: 'sp_live' }, 'test.live')
		await new Promise((r) => setTimeout(r, 300))
		return backlog
	}
	const ac = new AbortController()
	try {
		const res = await fetch(`${p.url}/v1/events?session=${s.sessionId}&k=${KEY}`, { headers: { Origin: ORIGIN }, signal: ac.signal })
		const reader = res.body!.getReader()
		let buf = ''
		const deadline = Date.now() + 3000
		while (!(buf.includes('test.live') && buf.includes('turn.planned')) && Date.now() < deadline) {
			const { value } = await Promise.race([reader.read(), new Promise<any>((r) => setTimeout(() => r({ value: undefined }), 500))])
			if (value) buf += new TextDecoder().decode(value)
		}
		assert.ok(buf.includes(`"turnId":"${turn.turnId}"`), 'the earlier turn is in the backlog')
		assert.ok(buf.includes('"name":"test.live"'), 'the live event follows it')
	} finally {
		ac.abort()
		p.store.listTrace = listTrace
	}
})

test('an X-ray client that leaves while the backlog loads leaves no ping running', async () => {
	const s = await newSession('en', `${ORIGIN}/en/index.html`)
	const ac = new AbortController()
	let release!: () => void
	const held = new Promise<void>((r) => (release = r))
	const listTrace = p.store.listTrace.bind(p.store)
	p.store.listTrace = async (sessionId: string, since?: number) => {
		await held
		return listTrace(sessionId, since)
	}
	const setIntervalBefore = globalThis.setInterval
	const pings: ReturnType<typeof setInterval>[] = []
	globalThis.setInterval = ((fn: () => void, ms?: number) => {
		const t = setIntervalBefore(fn, ms)
		if (ms === 20_000) pings.push(t)
		return t
	}) as typeof setInterval
	try {
		const res = fetch(`${p.url}/v1/events?session=${s.sessionId}&k=${KEY}`, { headers: { Origin: ORIGIN }, signal: ac.signal }).catch(() => null)
		await new Promise((r) => setTimeout(r, 200))
		ac.abort()
		await res
		await new Promise((r) => setTimeout(r, 100))
		release()
		await new Promise((r) => setTimeout(r, 200))
		assert.equal(pings.length, 0, 'no ping is started for a stream that already ended')
	} finally {
		globalThis.setInterval = setIntervalBefore
		for (const t of pings) clearInterval(t)
		p.store.listTrace = listTrace
	}
})

test('the edge rejects unknown site keys, foreign origins and floods', async () => {
	assert.equal((await call('/v1/session', { lang: 'ar' }, { key: 'pk_nope' })).status, 401)
	const foreign = await call('/v1/session', { lang: 'ar' }, { origin: 'https://evil.example' })
	assert.equal(foreign.status, 403)
	assert.equal(foreign.body.code, 'bad_origin')
	const s = await newSession()
	assert.equal((await call('/v1/turn', { sessionId: 'ses_forged', utterance: 'offers', page: { url: ORIGIN } })).status, 404)
	const pre = await fetch(`${p.url}/v1/turn`, { method: 'OPTIONS', headers: { Origin: ORIGIN, 'Access-Control-Request-Method': 'POST' } })
	assert.equal(pre.status, 204)
	assert.equal(pre.headers.get('access-control-allow-origin'), ORIGIN)
	let limited = 0
	for (let i = 0; i < 60; i++) if ((await call('/v1/turn', { sessionId: s.sessionId, utterance: 'offers', page: { url: `${ORIGIN}/en/index.html` } })).status === 429) limited++
	assert.ok(limited > 0, 'burst of 40 then 429')
})

test('the X-ray stream delivers the session\'s trace events live', async () => {
	const s = await newSession('en', `${ORIGIN}/en/index.html`)
	const ac = new AbortController()
	const res = await fetch(`${p.url}/v1/events?session=${s.sessionId}&k=${KEY}`, { headers: { Origin: ORIGIN }, signal: ac.signal })
	assert.equal(res.headers.get('content-type'), 'text/event-stream; charset=utf-8')
	const reader = res.body!.getReader()
	await new Promise((r) => setTimeout(r, 100))
	const turn = (await call('/v1/turn', { sessionId: s.sessionId, utterance: 'coverage', page: { url: `${ORIGIN}/en/index.html` } })).body
	let buf = ''
	const deadline = Date.now() + 3000
	while (!buf.includes('turn.planned') && Date.now() < deadline) {
		const { value } = await Promise.race([reader.read(), new Promise<any>((r) => setTimeout(() => r({ value: undefined }), 500))])
		if (value) buf += new TextDecoder().decode(value)
	}
	ac.abort()
	assert.ok(buf.includes(`"turnId":"${turn.turnId}"`))
	for (const n of ['router.understood', 'planner.plan', 'turn.planned']) assert.ok(buf.includes(`"name":"${n}"`), n)
	assert.match(buf, /^id: \d+$/m)
})

test('long polling returns the backlog at once, then waits for new events, then times out empty (ADR-0031)', async () => {
	const s = await newSession('en', `${ORIGIN}/en/index.html`)
	const poll = (since: number, wait: number) => call(`/v1/events/poll?session=${s.sessionId}&k=${KEY}&since=${since}&wait=${wait}`)
	// The flood test above may have used up the turn budget: wait for it to refill.
	const turnNow = async (utterance: string) => {
		for (let i = 0; i < 50; i++) {
			const r = await call('/v1/turn', { sessionId: s.sessionId, utterance, page: { url: `${ORIGIN}/en/index.html` } })
			if (r.status !== 429) return r.body
			await new Promise((res) => setTimeout(res, 200))
		}
		throw new Error('rate limit did not refill')
	}
	// Backlog: the session's own events come back without waiting.
	await turnNow('coverage')
	let t0 = Date.now()
	const first = await poll(0, 20)
	assert.equal(first.status, 200)
	assert.ok(Date.now() - t0 < 2000, 'backlog is immediate')
	assert.ok(first.body.events.some((e: any) => e.name === 'turn.planned'), JSON.stringify(first.body).slice(0, 400))
	let last = Math.max(...first.body.events.map((e: any) => e.seq))
	// Drain anything still landing from that turn, so the next poll starts quiet.
	await new Promise((r) => setTimeout(r, 300))
	last = Math.max(last, ...(await poll(last, 0)).body.events.map((e: any) => e.seq))
	// Waiting: a turn that arrives during the poll ends it with that turn's events in one response.
	t0 = Date.now()
	const pending = poll(last, 10)
	await new Promise((r) => setTimeout(r, 300))
	const turn = await turnNow('offers')
	const next = await pending
	const waited = Date.now() - t0
	assert.ok(waited >= 300 && waited < 5000, `woke on the event (${waited} ms)`)
	assert.ok(next.body.events.length > 0)
	assert.ok(next.body.events.every((e: any) => e.seq > last), 'only events after `since`')
	assert.ok(next.body.events.some((e: any) => e.turnId === turn.turnId), JSON.stringify(next.body.events.map((e: any) => [e.name, e.turnId])))
	// Nothing new: the poll ends empty after `wait` seconds.
	await new Promise((r) => setTimeout(r, 300))
	const after = Math.max(...next.body.events.map((e: any) => e.seq))
	const end = Math.max(after, ...(await poll(after, 0)).body.events.map((e: any) => e.seq))
	t0 = Date.now()
	const empty = await poll(end, 1)
	assert.deepEqual(empty.body.events, [])
	assert.ok(Date.now() - t0 >= 900, 'held for the wait time')
	// Another site's key cannot read this session.
	assert.notEqual((await call(`/v1/events/poll?session=${s.sessionId}&wait=0`, undefined, { key: 'pk_unknown' })).status, 200)
})

test('the agent proxy needs a valid token, masks page data and enforces the session budget', async () => {
	const s = await newSession('en', `${ORIGIN}/en/subscribe.html`)
	const body = {
		model: 'whatever-the-browser-says',
		messages: [
			{ role: 'system', content: 'sys' },
			{ role: 'user', content: '<user_request>\nselect bank card and type my number 01012345678\n</user_request>\n<browser_state>\n[3]<input value=01098765432 /> contact a@b.co\n[4]<input type=radio name=pay value=card />\n</browser_state>' },
		],
		tools: [],
	}
	const agentCall = (token: string) => fetch(`${p.url}/v1/agent/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, Origin: ORIGIN }, body: JSON.stringify(body) })
	assert.equal((await agentCall('forged.token')).status, 401)
	const ok = await agentCall(s.agentToken)
	assert.equal(ok.status, 200)
	const sent = llm.requests.at(-1)!.body
	assert.equal(sent.model, 'mock-agent-1', 'the proxy picks the model')
	const user = sent.messages[1].content as string
	assert.ok(user.includes('type my number 01012345678'), "the person's own request is kept")
	assert.ok(!user.includes('01098765432') && user.includes('[phone]'), 'page phone masked')
	assert.ok(!user.includes('a@b.co') && user.includes('[email]'), 'page email masked')
	const usage = (await p.store.getSession(s.sessionId))!.usage
	assert.equal(usage.agentSteps, 1)
	assert.ok(usage.agentTokens > 0)
	assert.equal((await agentCall(s.agentToken)).status, 200)
	assert.equal((await agentCall(s.agentToken)).status, 200)
	const over = await agentCall(s.agentToken)
	assert.equal(over.status, 429, 'budget of 3 steps per session')
	const names = (await p.store.listTrace(s.sessionId)).map((e) => e.name)
	assert.ok(names.includes('agent.llm') && names.includes('agent.quota'))
})

test('the agent proxy falls back to the second provider when the first fails', async () => {
	const s = await newSession('en', `${ORIGIN}/en/subscribe.html`)
	llm.failNext = 1
	const res = await fetch(`${p.url}/v1/agent/chat/completions`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.agentToken}`, Origin: ORIGIN },
		body: JSON.stringify({ messages: [{ role: 'user', content: '<user_request>\nselect card\n</user_request>' }] }),
	})
	assert.equal(res.status, 200)
	assert.equal(llm.requests.at(-1)!.body.model, 'mock-agent-fallback')
	const ev = (await p.store.listTrace(s.sessionId)).find((e) => e.name === 'agent.llm')!
	assert.equal(ev.attrs.provider, 'fallback')
})

test('page watch: a live watch records a baseline, then a change reaches the session stream', async () => {
	const s = await newSession('en', `${ORIGIN}/en/offers.html`)
	const url = `${ORIGIN}/en/offers.html`
	pageText.set(`${url} #weekend-offer`, 'Weekend offer Double data on all mobile internet bundles')
	const w = await call('/v1/watch', { sessionId: s.sessionId, url, pageId: 'web.offers', target: { css: ['#weekend-offer'] }, label: 'Weekend offer', lang: 'en' })
	assert.equal(w.status, 200, JSON.stringify(w.body))
	assert.equal(w.body.channel, 'live')
	assert.match(w.body.baseline, /Double data/)
	assert.equal((await call('/v1/watch', { sessionId: s.sessionId, url, target: { css: ['#nope'] }, label: 'x', lang: 'en' })).status, 422)
	assert.equal((await call('/v1/watch', { sessionId: s.sessionId, url: 'https://evil.example/x', target: { css: ['#a'] }, label: 'x', lang: 'en' })).status, 400)

	await p.store.updateWatch(w.body.watchId, { nextCheckAt: new Date(Date.now() - 1000).toISOString() })
	let tick = await p.services.local.watch.tick({})
	assert.equal(tick.changed, 0, 'same text, no change')
	pageText.set(`${url} #weekend-offer`, 'Weekend offer Triple data on all mobile internet bundles')
	await p.store.updateWatch(w.body.watchId, { nextCheckAt: new Date(Date.now() - 1000).toISOString() })
	tick = await p.services.local.watch.tick({})
	assert.equal(tick.changed, 1)
	const changes = await p.store.listChanges(w.body.watchId)
	assert.match(changes[0].after, /Triple data/)
	assert.match(changes[0].before, /Double data/)
	const ev = (await p.store.listTrace(s.sessionId)).find((e) => e.name === 'watch.changed')!
	assert.equal(ev.attrs.title, 'Changed: Weekend offer')
	const list = await call(`/v1/watches?session=${s.sessionId}`)
	assert.equal(list.body.watches.length, 1)
	assert.equal((await call(`/v1/watch/${w.body.watchId}?session=${s.sessionId}`, undefined, { method: 'DELETE' })).status, 200)
})

test('admin endpoints list and activate knowledge versions from loopback', async () => {
	const r = await fetch(`${p.url}/admin/sites/demo-telco/kb`)
	const body = (await r.json()) as any
	assert.equal(body.versions.length, 1)
	assert.equal(body.versions[0].active, true)
	assert.equal((await fetch(`${p.url}/admin/sites/demo-telco/kb/nope/activate`, { method: 'POST' })).status, 404)
	const health = (await (await fetch(`${p.url}/health`)).json()) as any
	assert.equal(health.store, 'postgres')
	assert.equal(health.agent.available, true)
})

test('traces and the saved session hold no page value, no personal data and no private query value (AGENTS.md 4.3, 4.4; e-shop plan E3)', async () => {
	const page = `${ORIGIN}/en/index.html?msisdn=01012345678&tab=offers`
	const s = await newSession('en', page)
	const t = (await call('/v1/turn', { sessionId: s.sessionId, utterance: 'call me on 01012345678 about the cheapest internet bundle', page: { url: page } })).body
	assert.ok(t.turnId, JSON.stringify(t))
	const agentStep = t.plan.steps.find((st: { op: string }) => st.op === 'agent')
	if (agentStep) assert.match(agentStep.task, /01012345678/, 'the plan sent to the page keeps the person\'s words, so the agent may type a number they said (ADR-0018 §3)')
	await call('/v1/progress', {
		sessionId: s.sessionId,
		turnId: t.turnId,
		cursor: -1,
		events: [
			{ name: 'sdk.step', attrs: { op: 'spotlight', ok: true, detail: 'Your balance is 46.50 EGP', i: 0 } },
			{ name: 'agent.step', attrs: { step: 1, action: 'click_element_by_index [3]', goal: 'Super 10 · 46 EGP/month, only 3 left, my id 29001011234567' } },
		],
	})
	await call('/v1/progress', { sessionId: s.sessionId, turnId: t.turnId, cursor: 1, item: { collectionId: 'web.bundles.mobile-internet', key: 'mi-10', name: 'Super 10 46 EGP' } })
	await call('/v1/agent/state', { sessionId: s.sessionId, agent: { task: 'call 01012345678', history: ['1. clicked [3] "Super 10 46 EGP, only 3 left"'], steps: 1, startedAt: new Date().toISOString(), turnId: t.turnId } })

	const trace = JSON.stringify(await p.store.listTrace(s.sessionId))
	const row = JSON.stringify(await p.store.getSession(s.sessionId))
	for (const [where, text] of [
		['trace', trace],
		['session', row],
	]) {
		assert.doesNotMatch(text, /01012345678/, `${where}: a phone number`)
		assert.doesNotMatch(text, /29001011234567/, `${where}: a national ID`)
		assert.doesNotMatch(text, /46(\.50)? EGP/, `${where}: a price`)
		assert.doesNotMatch(text, /only 3 left/, `${where}: stock`)
		assert.doesNotMatch(text, /msisdn/, `${where}: a private query value`)
	}
	assert.match(trace, /call me on \[phone\]/, 'the request is still traced, masked')
	assert.match(trace, /index\.html\?tab=offers/, 'the page keeps its path and its harmless query')
	assert.doesNotMatch(JSON.stringify((await p.store.getSession(s.sessionId))?.turns), /call me on/, 'the turns keep none of the person\'s words')
	assert.match(row, /call me on \[phone\]/, 'the agent\'s task is kept, masked, for the next page (ADR-0017)')
	assert.match(row, /Super 10/, 'the chosen item keeps its name')
})
