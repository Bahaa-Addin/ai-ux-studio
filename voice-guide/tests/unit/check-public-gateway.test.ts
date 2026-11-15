/**
 * The post-deploy checks of the public gateway (ADR-0067): /health must say the trusted client-address
 * header reached the gateway, and the forged-address check forges X-Forwarded-For, CF-Connecting-IP
 * and True-Client-IP at once, so it holds whichever header the deployment trusts. Stand-ins only: the
 * fetch is a function, nothing leaves this machine, no process is spawned.
 */
import assert from 'node:assert/strict'
import type http from 'node:http'
import path from 'node:path'
import { test } from 'node:test'

import { loadSiteConfig, ROOT } from '#shared/config.ts'
import { clientIp, clientKeyFingerprint, trustedHeaderPresent } from '#shared/http.ts'

import { RateLimiter } from '../../services/gateway/limits.ts'
import { FORGED_TURNS, forgedHeaders, main, RATE_BURST, RATE_TURNS_PER_MIN, runChecks } from '../../tools/check-public-gateway.ts'

const site = loadSiteConfig(path.join(ROOT, 'config/sites/vodafone-eg.yaml'))
const URL_ = 'https://vg-public-demo.onrender.com'
const FORGED = ['x-forwarded-for', 'cf-connecting-ip', 'true-client-ip']

/** The gateway's own 429 (services/gateway/server.ts: HttpError(429, …, 'rate_limited')). */
const LIMITED = () => new Response(JSON.stringify({ error: 'too many requests', code: 'rate_limited' }), { status: 429 })
/** A turn the limiter let through: body `{}` names no session (services/sessions/handlers.ts: 404 no_session). */
const ALLOWED = () => new Response(JSON.stringify({ error: 'session not found', code: 'no_session' }), { status: 404 })
const HEALTHY = (o: { clientHeader?: boolean; clientKey?: string } = {}) => new Response(JSON.stringify({ ok: true, store: 'postgres', clientHeader: o.clientHeader ?? true, clientKey: o.clientKey ?? '1a2b3c4d', boot: '0b0071d1' }), { status: 200 })
const headersOf = (init?: RequestInit) => (init?.headers ?? {}) as Record<string, string>

/** A stand-in gateway: /health is ok; /v1/turn answers 429 after `limit` calls (never, when null). */
function fakeFetch(limit: number | null, health = HEALTHY) {
	const seen: { url: string; headers: Record<string, string> }[] = []
	let turns = 0
	const f = (async (url: string, init?: RequestInit) => {
		const h = headersOf(init)
		seen.push({ url, headers: h })
		if (url.endsWith('/health')) return health()
		assert.equal(h['x-vg-site-key'], site.siteKey)
		assert.equal(h.origin, 'https://web.vodafone.com.eg')
		turns++
		return limit !== null && turns > limit ? LIMITED() : ALLOWED()
	}) as unknown as typeof fetch
	return { f, seen }
}

/** A gateway that answers each turn with `answer(i)`. */
const answering = (answer: (i: number) => Response) => {
	let i = 0
	return (async (url: string) => (url.endsWith('/health') ? HEALTHY() : answer(i++))) as unknown as typeof fetch
}

/**
 * Render as fact 8 of the ADR-0067 brief describes it: Cloudflare in front, then Render's proxy, then the
 * gateway with VG_CLIENT_IP_HEADER=cf-connecting-ip, keyed through the real clientIp and RateLimiter.
 * `cloudflare` turns the caller's headers into what reaches the gateway.
 */
function render(cloudflare: (caller: Record<string, string>) => Record<string, string>) {
	const limiter = new RateLimiter(RATE_TURNS_PER_MIN, RATE_BURST)
	const req = (h: Record<string, string>) => ({ headers: h, socket: { remoteAddress: '10.214.0.7' } }) as unknown as http.IncomingMessage
	return (async (url: string, init?: RequestInit) => {
		const reached = cloudflare(Object.fromEntries(Object.entries(headersOf(init)).map(([k, v]) => [k.toLowerCase(), v])))
		if (url.endsWith('/health')) return HEALTHY({ clientHeader: trustedHeaderPresent(req(reached), 'cf-connecting-ip'), clientKey: clientKeyFingerprint(clientIp(req(reached), 'cf-connecting-ip')) })
		return limiter.take(`${site.id}:${clientIp(req(reached), 'cf-connecting-ip')}`) ? ALLOWED() : LIMITED()
	}) as unknown as typeof fetch
}
const VISITOR = '203.0.113.9'
const EDGE = '172.68.1.1'
/** Render's proxy appends to X-Forwarded-For and never strips what the caller sent. */
const xff = (caller: Record<string, string>) => [caller['x-forwarded-for'], VISITOR, EDGE].filter(Boolean).join(', ')

test('the forged-address check passes when the limiter answers 429, fails when it never does', async () => {
	const lines: string[] = []
	const pass = fakeFetch(10)
	const ok = await runChecks(URL_, { fetch: pass.f, log: (l) => lines.push(l), site })
	assert.equal(ok.ok, true, ok.problems.join(' | '))
	assert.equal(pass.seen.filter((s) => s.url.endsWith('/v1/turn')).length, FORGED_TURNS)
	assert.ok(lines.some((l) => /turn budget/.test(l)), 'says it uses up the caller’s own budget')
	assert.ok(lines.some((l) => /store postgres/.test(l)), 'logs the store /health reports')

	const bad = await runChecks(URL_, { fetch: fakeFetch(null).f, log: () => {}, site })
	assert.equal(bad.ok, false)
	assert.match(bad.problems.join(' '), /forge/)
})

test('each turn forges X-Forwarded-For, CF-Connecting-IP and True-Client-IP, each value used once', async () => {
	const { f, seen } = fakeFetch(10)
	await runChecks(URL_, { fetch: f, log: () => {}, site })
	const turns = seen.filter((s) => s.url.endsWith('/v1/turn'))
	assert.equal(turns.length, FORGED_TURNS)
	const values: string[] = []
	for (const t of turns)
		for (const h of FORGED) {
			assert.ok(t.headers[h], `${h} is forged`)
			values.push(t.headers[h])
		}
	assert.equal(new Set(values).size, FORGED_TURNS * FORGED.length, 'a different value in every header of every turn')
	assert.deepEqual(Object.keys(forgedHeaders(0)).sort(), [...FORGED].sort())
})

test('/health without clientHeader: true fails: the trusted header did not reach the gateway', async () => {
	const lines: string[] = []
	const { f, seen } = fakeFetch(10, () => HEALTHY({ clientHeader: false }))
	const r = await runChecks(URL_, { fetch: f, log: (l) => lines.push(l), site })
	assert.equal(r.ok, false)
	assert.match(r.problems.join(' '), /trusted client-address header did not reach the gateway/)
	assert.match(r.problems.join(' '), /share one rate limit/)
	assert.match(r.problems.join(' '), /VG_CLIENT_IP_HEADER/)
	assert.ok(lines.some((l) => /store postgres/.test(l)), 'still logs the store')
	assert.equal(seen.filter((s) => s.url.endsWith('/v1/turn')).length, 0, 'no turns are spent')
	const older = await runChecks(URL_, { fetch: fakeFetch(10, () => new Response(JSON.stringify({ ok: true }), { status: 200 })).f, log: () => {}, site })
	assert.equal(older.ok, false, 'a gateway that does not report clientHeader fails too')
	const down = await runChecks(URL_, { fetch: fakeFetch(10, () => new Response('no', { status: 503 })).f, log: () => {}, site })
	assert.match(down.problems.join(' '), /\/health answered 503/)
})

test('each answer is classified: one gateway 429 is proof; only all-let-through means forgeable; anything else could not run', async () => {
	const html429 = () => new Response('<html>Rate exceeded.</html>', { status: 429 })
	const run = (answer: (i: number) => Response) => runChecks(URL_, { fetch: answering(answer), log: () => {}, site })
	assert.equal((await run((i) => (i < 10 ? ALLOWED() : i < 14 ? LIMITED() : html429()))).ok, true, 'gateway 429s prove the key was shared, even beside a front-end 429')
	const front = await run(() => html429())
	assert.equal(front.ok, false)
	assert.match(front.problems.join(' '), /could not run/)
	assert.doesNotMatch(front.problems.join(' '), /forge their address/, 'a front-end 429 is not called forgeable')
	const down = await run(() => new Response('unavailable', { status: 503 }))
	assert.match(down.problems.join(' '), /could not run/)
	assert.doesNotMatch(down.problems.join(' '), /forge their address/, 'a broken gateway is not called forgeable')
	const refused = await run(() => new Response(JSON.stringify({ code: 'bad_site_key' }), { status: 401 }))
	assert.match(refused.problems.join(' '), /refused the site key/)
	const forbidden = await run(() => new Response(JSON.stringify({ code: 'bad_origin' }), { status: 403 }))
	assert.match(forbidden.problems.join(' '), /refused the site key .* or the origin/)
	const forgeable = await run(() => ALLOWED())
	assert.match(forgeable.problems.join(' '), /forge their address/)
})

test('a slow link does not fail a correct gateway: the turns reach the real limiter together', async (t) => {
	// The real limiter (20 a minute, burst 10) keyed on CF-Connecting-IP as Cloudflare sets it. Each answer
	// takes 1.1 s of (mocked) clock time; turns sent one after another would let the bucket refill between
	// them and never see a 429.
	t.mock.timers.enable({ apis: ['Date'], now: 0 })
	const limiter = new RateLimiter(RATE_TURNS_PER_MIN, RATE_BURST)
	const slow = (async (url: string, init?: RequestInit) => {
		if (url.endsWith('/health')) return HEALTHY()
		const reached = { ...headersOf(init), 'cf-connecting-ip': VISITOR }
		const allowed = limiter.take(`${site.id}:${clientIp({ headers: reached, socket: {} } as unknown as http.IncomingMessage, 'cf-connecting-ip')}`)
		await Promise.resolve()
		t.mock.timers.tick(1100)
		return allowed ? ALLOWED() : LIMITED()
	}) as unknown as typeof fetch
	const r = await runChecks(URL_, { fetch: slow, log: () => {}, site })
	assert.equal(r.ok, true, r.problems.join(' | '))
	assert.ok(FORGED_TURNS > RATE_BURST, 'more turns than the burst')
})

test('on a stand-in Render: a Cloudflare that sets CF-Connecting-IP passes; one that passes the caller’s through is forgeable', async () => {
	const overwrites = render((c) => ({ ...c, 'x-forwarded-for': xff(c), 'cf-connecting-ip': VISITOR, 'true-client-ip': VISITOR }))
	const good = await runChecks(URL_, { fetch: overwrites, log: () => {}, site })
	assert.equal(good.ok, true, good.problems.join(' | '))

	const passesThrough = render((c) => ({ ...c, 'x-forwarded-for': xff(c), 'cf-connecting-ip': c['cf-connecting-ip'] || VISITOR, 'true-client-ip': c['true-client-ip'] || VISITOR }))
	const bad = await runChecks(URL_, { fetch: passesThrough, log: () => {}, site })
	assert.equal(bad.ok, false)
	assert.match(bad.problems.join(' '), /forge their address/)

	// A front end that adds nothing (or a gateway reached without its front end): only what the caller sent
	// arrives. The /health request forges a header too, so this is named forgeable, not "missing".
	const onlyTheCallers = render((c) => ({ ...c, 'x-forwarded-for': xff(c) }))
	const open = await runChecks(URL_, { fetch: onlyTheCallers, log: () => {}, site })
	assert.equal(open.ok, false)
	assert.match(open.problems.join(' '), /forge their address/)

	const noHeader = render((c) => ({ ...c, 'x-forwarded-for': xff(c), 'cf-connecting-ip': '' }))
	const missing = await runChecks(URL_, { fetch: noHeader, log: () => {}, site })
	assert.equal(missing.ok, false, 'without the header every visitor shares the proxy’s socket address: caught by /health')
	assert.match(missing.problems.join(' '), /did not reach the gateway/)
})

test('main: --help and a missing URL print the usage and send nothing; a URL runs the checks; exit 0 or 1', async () => {
	const { f, seen } = fakeFetch(10)
	const lines: string[] = []
	const log = (l: string) => lines.push(l)
	assert.equal(await main(['--help'], { fetch: f, log, site }), 0)
	assert.match(lines.join('\n'), /npm run gateway:check -- <url>/)
	assert.equal(await main([], { fetch: f, log, site }), 1)
	assert.equal(await main(['vg-public-demo.onrender.com'], { fetch: f, log, site }), 1, 'not an http(s) URL')
	assert.equal(await main(['--bogus', URL_], { fetch: f, log, site }), 1)
	assert.equal(seen.length, 0, 'no request without a URL')
	assert.equal(await main([URL_], { fetch: f, log, site }), 0)
	assert.ok(lines.some((l) => /All checks passed/.test(l)))
	assert.ok(lines.some((l) => /your client key 1a2b3c4d \(boot 0b0071d1\)/.test(l)), 'prints the client key and boot id /health reports')
	assert.ok(lines.some((l) => /same boot id/.test(l)), 'says the two runs compare only with the same boot id')
	assert.ok(lines.some((l) => /another network .*client key must differ/.test(l)), 'asks for a second run from another network')
	assert.equal(await main([URL_, '--site', 'vodafone-eg'], { fetch: fakeFetch(null).f, log, site }), 1)
	assert.ok(lines.some((l) => /^FAILED: /.test(l)))
})

test('main: an unknown --site says so and prints the usage, with no stack trace and no request', async () => {
	const { f, seen } = fakeFetch(10)
	const lines: string[] = []
	assert.equal(await main([URL_, '--site', 'nope'], { fetch: f, log: (l) => lines.push(l) }), 1)
	assert.equal(await main([URL_, '--site', '../sites/vodafone-eg'], { fetch: f, log: (l) => lines.push(l) }), 1, 'no path tricks')
	assert.match(lines.join('\n'), /Unknown site "nope"/)
	assert.match(lines.join('\n'), /npm run gateway:check -- <url>/)
	assert.equal(seen.length, 0)
})

test('a client key that follows the forged header fails at /health, before any turn is sent', async () => {
	let turns = 0
	const keys: string[] = []
	const follows = (async (url: string, init?: RequestInit) => {
		if (!url.endsWith('/health')) {
			turns++
			return ALLOWED()
		}
		const key = clientKeyFingerprint(String(headersOf(init)['cf-connecting-ip']))
		keys.push(key)
		return HEALTHY({ clientKey: key })
	}) as unknown as typeof fetch
	const r = await runChecks(URL_, { fetch: follows, log: () => {}, site })
	assert.equal(r.ok, false)
	assert.match(r.problems.join(' '), /client key changed with the forged client-address header/)
	assert.equal(keys.length, 2, 'two reads of /health with two forged values')
	assert.equal(turns, 0, 'no turn spent')
})

test('/health failing (asleep, 5xx, no answer) says to run again, and sends no turn', async () => {
	let turns = 0
	const asleep = (async (url: string) => {
		if (!url.endsWith('/health')) turns++
		return new Response('waking up', { status: 503 })
	}) as unknown as typeof fetch
	const r = await runChecks(URL_, { fetch: asleep, log: () => {}, site })
	assert.equal(r.ok, false)
	assert.match(r.problems.join(' '), /answered 503.*run the check again/)
	assert.equal(turns, 0)
})
