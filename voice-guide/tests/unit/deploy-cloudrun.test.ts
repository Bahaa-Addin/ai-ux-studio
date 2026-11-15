/**
 * The Cloud Run deploy (ADR-0066): the gcloud arguments carry each setting, the deployed settings
 * pass the gateway's own start-up checks (ADR-0053 §2), the client address is X-Forwarded-For's last
 * entry, and the tool runs (or prints) its steps and the forged-address check with stand-ins only:
 * no process is spawned, no gcloud is called, nothing leaves this machine.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import type http from 'node:http'
import path from 'node:path'
import { test } from 'node:test'

import { checkPublicConfig, loadPlatformConfig, loadSiteConfig, ROOT } from '#shared/config.ts'
import { clientIp } from '#shared/http.ts'

import { RateLimiter } from '../../services/gateway/limits.ts'
import { DEFAULTS, deployArgs, ENV, FORGED_TURNS, main, publicUrl, RATE_BURST, type Runner, runChecks, SECRETS, secretFlags, spawnRunner } from '../../tools/deploy-cloudrun.ts'

const site = loadSiteConfig(path.join(ROOT, 'config/sites/vodafone-eg.yaml'))
const REQUIRED = Object.values(SECRETS.required)
const ALL = [...REQUIRED, ...Object.values(SECRETS.whisper), ...Object.values(SECRETS.optional)]
const URL_ = publicUrl(DEFAULTS.service, '123456789012', DEFAULTS.region)
/** Dummy values for the required secrets, long enough for the gateway's checks. */
const DUMMY: Record<string, string> = { VG_SECRET: 'x'.repeat(64), VG_ADMIN_TOKEN: 'y'.repeat(64), ANTHROPIC_API_KEY: 'sk-dummy' }

const opts = { service: 'vg-public-demo', image: 'europe-west1-docker.pkg.dev/p/vg/gateway:abc', region: 'europe-west1', project: 'p', serviceAccount: 'vg-gateway@p.iam.gserviceaccount.com', env: { ...ENV, VG_PUBLIC_URL: URL_ }, secrets: secretFlags(REQUIRED) }

test('gcloud run deploy carries every setting', () => {
	const a = deployArgs(opts)
	assert.deepEqual(a.slice(0, 3), ['run', 'deploy', 'vg-public-demo'])
	for (const f of ['--image=europe-west1-docker.pkg.dev/p/vg/gateway:abc', '--region=europe-west1', '--project=p', '--port=8080', '--cpu=1', '--memory=1Gi', '--concurrency=400', '--max-instances=1', '--min-instances=0', '--no-cpu-throttling', '--timeout=3600', '--service-account=vg-gateway@p.iam.gserviceaccount.com', '--allow-unauthenticated']) assert.ok(a.includes(f), f)
	const env = a.find((x) => x.startsWith('--set-env-vars='))!
	assert.match(env, /VG_CLIENT_IP_HEADER=x-forwarded-for/)
	assert.match(env, new RegExp(`VG_PUBLIC_URL=${URL_.replace(/\./g, '\\.')}`))
	assert.equal(a.find((x) => x.startsWith('--set-secrets=')), '--set-secrets=VG_SECRET=vg-secret:latest,VG_ADMIN_TOKEN=vg-admin-token:latest,ANTHROPIC_API_KEY=anthropic-api-key:latest')
	for (const kv of a.find((x) => x.startsWith('--set-secrets='))!.slice('--set-secrets='.length).split(',')) assert.match(kv, /^[A-Z_]+=[a-z0-9-]+:latest$/, 'secrets are references, never values')
	for (const name of ['VG_SECRET', 'vg_secret', ' Anthropic_Api_Key', 'VG_WHISPER_TOKEN']) assert.throws(() => deployArgs({ ...opts, env: { ...opts.env, [name]: DUMMY.VG_SECRET } }), /Secret Manager/, `${JSON.stringify(name)} among the plain settings is refused`)
	assert.throws(() => deployArgs({ ...opts, env: { A: 'one,two' } }), /comma/)
})

test("the deployed settings pass the gateway's own public checks; a missing required secret is caught", () => {
	const env = { ...ENV, VG_PUBLIC_URL: URL_, ...DUMMY } as unknown as NodeJS.ProcessEnv
	assert.deepEqual(checkPublicConfig(loadPlatformConfig(env), env), [])
	for (const [envName, secret] of Object.entries(SECRETS.required)) {
		assert.throws(() => secretFlags(ALL.filter((n) => n !== secret)), new RegExp(secret), `${secret} missing`)
		const without = { ...env } as Record<string, unknown>
		delete without[envName]
		assert.ok(checkPublicConfig(loadPlatformConfig(without as NodeJS.ProcessEnv), without as NodeJS.ProcessEnv).length, `the gateway would also refuse to start without ${envName}`)
	}
})

test('with the deployed VG_CLIENT_IP_HEADER a forged chain gives the last entry', () => {
	const req = { headers: { 'x-forwarded-for': '6.6.6.6, 7.7.7.7, 203.0.113.9' }, socket: { remoteAddress: '169.254.1.1' } } as unknown as http.IncomingMessage
	assert.equal(clientIp(req, loadPlatformConfig(ENV as unknown as NodeJS.ProcessEnv).clientIpHeader), '203.0.113.9')
})

test('publicUrl: the deterministic run.app address, and the 63-character limit', () => {
	assert.equal(URL_, 'https://vg-public-demo-123456789012.europe-west1.run.app')
	assert.equal(publicUrl('a'.repeat(50), '123456789012', 'europe-west1'), `https://${'a'.repeat(50)}-123456789012.europe-west1.run.app`)
	assert.throws(() => publicUrl('a'.repeat(51), '123456789012', 'europe-west1'), /63/)
})

test('secrets: Whisper both or neither, VoiceTut optional, full resource names accepted', () => {
	assert.deepEqual(Object.keys(secretFlags(REQUIRED)), ['VG_SECRET', 'VG_ADMIN_TOKEN', 'ANTHROPIC_API_KEY'])
	assert.deepEqual(Object.keys(secretFlags(ALL)), ['VG_SECRET', 'VG_ADMIN_TOKEN', 'ANTHROPIC_API_KEY', 'VG_WHISPER_URL', 'VG_WHISPER_TOKEN', 'VG_VOICETUT_URL'])
	assert.throws(() => secretFlags([...REQUIRED, 'vg-whisper-url']), /vg-whisper-token/)
	assert.throws(() => secretFlags([...REQUIRED, 'vg-whisper-token']), /vg-whisper-url/)
	assert.deepEqual(Object.keys(secretFlags([...REQUIRED, 'vg-voicetut-url'])), ['VG_SECRET', 'VG_ADMIN_TOKEN', 'ANTHROPIC_API_KEY', 'VG_VOICETUT_URL'])
	assert.equal(secretFlags(REQUIRED.map((n) => `projects/1/secrets/${n}`)).VG_SECRET, 'vg-secret:latest')
})

/** A stand-in for gcloud, git and tar: records every call, spawns nothing. */
function fakeRunner(o: { secrets?: string[]; failOn?: string } = {}) {
	const calls: { cmd: string; args: string[] }[] = []
	const run: Runner = async (cmd, args) => {
		calls.push({ cmd, args })
		const line = [cmd, ...args].join(' ')
		if (o.failOn && line.includes(o.failOn)) return { status: 1, stdout: '' }
		if (line.startsWith('git rev-parse')) return { status: 0, stdout: 'abcdef0123456789abcdef0123456789abcdef01\n' }
		if (line.startsWith('git status')) return { status: 0, stdout: ' M voice-guide/x.ts\n' }
		if (line.startsWith('gcloud projects describe')) return { status: 0, stdout: '123456789012\n' }
		if (line.startsWith('gcloud secrets list')) return { status: 0, stdout: `${(o.secrets ?? REQUIRED).join('\n')}\n` }
		if (line.startsWith('git show')) return { status: 0, stdout: 'FROM node\n' }
		return { status: 0, stdout: '' }
	}
	return { run, calls }
}

/** A stand-in gateway: /health is ok; /v1/turn answers 429 after `limit` calls (never, when null). */
function fakeFetch(limit: number | null) {
	const seen: { url: string; xff?: string }[] = []
	let turns = 0
	const f = (async (url: string, init?: RequestInit) => {
		const h = (init?.headers ?? {}) as Record<string, string>
		seen.push({ url, xff: h['x-forwarded-for'] })
		if (url.endsWith('/health')) return new Response(JSON.stringify({ ok: true }), { status: 200 })
		assert.equal(h['x-vg-site-key'], site.siteKey)
		assert.equal(h.origin, 'https://web.vodafone.com.eg')
		turns++
		return limit !== null && turns > limit ? LIMITED() : ALLOWED()
	}) as unknown as typeof fetch
	return { f, seen }
}

/** The gateway's own 429 (services/gateway/server.ts: HttpError(429, …, 'rate_limited')). */
const LIMITED = () => new Response(JSON.stringify({ error: 'too many requests', code: 'rate_limited' }), { status: 429 })
/** A turn the limiter let through: body `{}` names no session (services/sessions/handlers.ts: 404 no_session). */
const ALLOWED = () => new Response(JSON.stringify({ error: 'session not found', code: 'no_session' }), { status: 404 })
const HEALTHY = () => new Response(JSON.stringify({ ok: true }), { status: 200 })
/** A gateway that answers each turn with `answer(i)`. */
const answering = (answer: (i: number) => Response) => {
	let i = 0
	return (async (url: string) => (url.endsWith('/health') ? HEALTHY() : answer(i++))) as unknown as typeof fetch
}

test('the forged-address check passes when the limiter answers 429, fails when it never does', async () => {
	const lines: string[] = []
	const pass = fakeFetch(10)
	const ok = await runChecks(URL_, { fetch: pass.f, log: (l) => lines.push(l), site })
	assert.equal(ok.ok, true, ok.problems.join(' | '))
	const forged = pass.seen.filter((s) => s.url.endsWith('/v1/turn')).map((s) => s.xff)
	assert.equal(forged.length, FORGED_TURNS)
	assert.equal(new Set(forged).size, FORGED_TURNS, 'a different forged address each time')
	assert.ok(lines.some((l) => /turn budget/.test(l)), 'says it uses up the caller’s own budget')

	const bad = await runChecks(URL_, { fetch: fakeFetch(null).f, log: () => {}, site })
	assert.equal(bad.ok, false)
	assert.match(bad.problems.join(' '), /forge/)
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
	const forgeable = await run(() => ALLOWED())
	assert.match(forgeable.problems.join(' '), /forge their address/)
})

test('a slow link does not fail a correct gateway: the turns reach the real limiter together', async (t) => {
	// The real limiter (20 a minute, burst 10) keyed as Cloud Run would key it: on the visitor's real
	// address, whatever they forge in front of it. Each answer takes 1.1 s of (mocked) clock time; turns
	// sent one after another would let the bucket refill between them and never see a 429.
	t.mock.timers.enable({ apis: ['Date'], now: 0 })
	const limiter = new RateLimiter(Number(ENV.VG_RATE_TURNS_PER_MIN), RATE_BURST)
	const slow = (async (url: string, init?: RequestInit) => {
		if (url.endsWith('/health')) return new Response(JSON.stringify({ ok: true }), { status: 200 })
		const real = clientIp({ headers: { 'x-forwarded-for': `${(init!.headers as Record<string, string>)['x-forwarded-for']}, 203.0.113.9` }, socket: {} } as unknown as http.IncomingMessage, 'x-forwarded-for')
		const allowed = limiter.take(`vodafone-eg:${real}`)
		await Promise.resolve()
		t.mock.timers.tick(1100)
		return allowed ? ALLOWED() : LIMITED()
	}) as unknown as typeof fetch
	const r = await runChecks(URL_, { fetch: slow, log: () => {}, site })
	assert.equal(r.ok, true, r.problems.join(' | '))
	assert.ok(FORGED_TURNS > RATE_BURST, 'more turns than the burst')
})

test('--dry-run prints the commands and runs nothing', async () => {
	const { run, calls } = fakeRunner()
	const { f, seen } = fakeFetch(10)
	const lines: string[] = []
	assert.equal(await main(['--project', 'demo-project', '--dry-run'], { run, fetch: f, log: (l) => lines.push(l), site }), 0)
	assert.equal(calls.length, 0, 'no command')
	assert.equal(seen.length, 0, 'no request')
	const out = lines.join('\n')
	assert.match(out, /\$ gcloud builds submit/)
	assert.match(out, /\$ gcloud run deploy vg-public-demo .*--no-cpu-throttling/)
})

test('a deploy runs each step through the runner, removes its temp directory, and checks the result', async () => {
	const { run, calls } = fakeRunner()
	const lines: string[] = []
	assert.equal(await main(['--project', 'demo-project'], { run, fetch: fakeFetch(10).f, log: (l) => lines.push(l), site }), 0, lines.join('\n'))
	const shape = calls.map((c) => `${c.cmd} ${c.args.slice(0, 2).join(' ')}`)
	assert.deepEqual(shape, ['git rev-parse --verify', 'git status --porcelain', 'gcloud projects describe', 'gcloud secrets list', 'git archive --format=tar', 'tar -xf ' + calls[5].args[1], 'git show abcdef0123456789abcdef0123456789abcdef01:voice-guide/deploy/gateway/gateway.Dockerfile', 'git show abcdef0123456789abcdef0123456789abcdef01:voice-guide/deploy/gateway/gateway.Dockerfile.dockerignore', 'gcloud builds submit', 'gcloud run deploy'])
	const tmp = calls[8].args[2]
	assert.ok(!fs.existsSync(tmp), 'the temp directory is removed')
	assert.ok(calls[8].args.includes('--tag=europe-west1-docker.pkg.dev/demo-project/vg/gateway:abcdef012345'))
	assert.ok(calls[9].args.some((a) => a.includes('VG_PUBLIC_URL=https://vg-public-demo-123456789012.europe-west1.run.app')))
	assert.ok(lines.some((l) => /NOT deployed/.test(l)), 'warns that uncommitted changes are not deployed')
	assert.ok(lines.some((l) => /All checks passed/.test(l)))
})

test('a deploy stops at the first failing step and says which; a missing secret stops it before any build', async () => {
	const failing = fakeRunner({ failOn: 'builds submit' })
	const lines: string[] = []
	assert.equal(await main(['--project', 'p'], { run: failing.run, fetch: fakeFetch(10).f, log: (l) => lines.push(l), site }), 1)
	assert.ok(!failing.calls.some((c) => c.args[1] === 'deploy'), 'no deploy after a failed build')
	assert.ok(lines.some((l) => /Stopped at "Build the image with Cloud Build"/.test(l)))

	const noKey = fakeRunner({ secrets: ['vg-secret', 'vg-admin-token'] })
	const out: string[] = []
	assert.equal(await main(['--project', 'p'], { run: noKey.run, fetch: fakeFetch(10).f, log: (l) => out.push(l), site }), 1)
	assert.ok(!noKey.calls.some((c) => c.cmd === 'git' && c.args[0] === 'archive'))
	assert.ok(out.some((l) => /anthropic-api-key/.test(l)))
})

/** A runner whose build step is a real child process (a shell running `script`); every other step is the fake. */
function realBuild(script: string) {
	const base = fakeRunner()
	const calls: string[] = []
	const run: Runner = (cmd, args, o) => {
		calls.push(`${cmd} ${args.slice(0, 2).join(' ')}`)
		return args[0] === 'builds' ? spawnRunner('sh', ['-c', script], o) : base.run(cmd, args, o)
	}
	return { run, calls, tmp: () => base.calls.find((c) => c.cmd === 'tar')!.args[3] }
}

test('a stop (SIGTERM) sent to the tool during the build is passed on to the build, and no deploy follows', async () => {
	const before = process.listenerCount('SIGTERM')
	// The build's shell sends SIGTERM to this process (its parent), then would sleep 30 s and succeed.
	const b = realBuild('kill -TERM $PPID; sleep 30; exit 0')
	const lines: string[] = []
	const t0 = Date.now()
	assert.equal(await main(['--project', 'p'], { run: b.run, fetch: fakeFetch(10).f, log: (l) => lines.push(l), site }), 1)
	assert.ok(Date.now() - t0 < 10_000, 'the build was ended, not waited for')
	assert.ok(!b.calls.some((c) => c.startsWith('gcloud run deploy')), 'no deploy after the stop')
	assert.ok(lines.some((l) => /Stopped .*"Build the image with Cloud Build"/.test(l)), lines.join('\n'))
	assert.ok(!fs.existsSync(b.tmp()), 'the temp directory is removed')
	assert.equal(process.listenerCount('SIGTERM'), before, 'the listeners are removed afterwards')
})

test('Ctrl-C (SIGINT) while the build runs: the build ends on its own (gcloud cancels), and no later step starts', async () => {
	const before = process.listenerCount('SIGINT')
	// As in a terminal, where gcloud gets the same SIGINT and exits; here the child signals and succeeds,
	// so only the tool's own check can stop the deploy.
	const b = realBuild('kill -INT $PPID; sleep 0.2; exit 0')
	const lines: string[] = []
	assert.equal(await main(['--project', 'p'], { run: b.run, fetch: fakeFetch(10).f, log: (l) => lines.push(l), site }), 1)
	assert.ok(!b.calls.some((c) => c.startsWith('gcloud run deploy')), 'no deploy after Ctrl-C')
	assert.ok(lines.some((l) => /Stopped during "Build the image with Cloud Build": SIGINT/.test(l)), lines.join('\n'))
	assert.ok(!fs.existsSync(b.tmp()), 'the temp directory is removed')
	assert.equal(process.listenerCount('SIGINT'), before, 'the listeners are removed afterwards')
})

test('--check runs only the checks; a gateway that never limits fails it', async () => {
	const { run, calls } = fakeRunner()
	assert.equal(await main(['--check', URL_], { run, fetch: fakeFetch(10).f, log: () => {}, site }), 0)
	assert.equal(await main(['--check', URL_], { run, fetch: fakeFetch(null).f, log: () => {}, site }), 1)
	assert.equal(calls.length, 0)
})
