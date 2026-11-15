/**
 * Deploys the public gateway (ADR-0053) to Google Cloud Run (ADR-0066), then checks it.
 *
 *   npm run deploy:cloudrun -- --project <id> --dry-run      print every command; run nothing
 *   npm run deploy:cloudrun -- --project <id>                build the committed tree and deploy it
 *   npm run deploy:cloudrun -- --check https://vg-public-demo-123456789012.europe-west1.run.app
 *
 * Options: --region (europe-west1), --service (vg-public-demo), --repo (the Artifact Registry
 * repository, vg), --service-account (vg-gateway@<project>.iam.gserviceaccount.com), --ref (HEAD).
 *
 * A deploy builds only what is committed at --ref (git archive of voice-guide/ and experiences/,
 * built by Cloud Build with deploy/gateway/gateway.Dockerfile); uncommitted changes are not deployed.
 * Secrets come from Secret Manager (SECRETS below), never from this file or the command line.
 * After a deploy, and with --check, it runs two checks: /health answers, and the forged-address
 * check (a visitor cannot pick their own rate-limit key by sending X-Forwarded-For). Needs gcloud on
 * PATH, logged in to an account that may deploy to the project (runbook §3c).
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { parseArgs } from 'node:util'

import { loadSiteConfig, ROOT, type SiteConfig } from '#shared/config.ts'

/** The repository root: git archive and git status run there. */
const REPO = path.resolve(ROOT, '..')

export const DEFAULTS = { region: 'europe-west1', service: 'vg-public-demo', repo: 'vg', ref: 'HEAD' }

/** The gateway's non-secret settings (what fly.toml set, ADR-0053; the client address rule, ADR-0066 §2). */
export const ENV: Record<string, string> = {
	VG_PUBLIC: 'on',
	VG_STORE: 'memory',
	VG_TRAIL: 'on',
	VG_LLM_PROVIDER: 'anthropic',
	VG_LLM_EFFORT: 'low',
	VG_AGENT_TOKENS_PER_SITE_DAY: '3000000',
	// VoiceTut for public visitors, capped per day (owner, 2026-11-13; ADR-0053 §5).
	VG_VOICETUT_SENTENCES_PER_DAY: '300',
	VG_STT_SECONDS_PER_DAY: '14400',
	VG_RATE_TURNS_PER_MIN: '20',
	// Cloud Run appends the caller's address to X-Forwarded-For; clientIp reads the last entry.
	VG_CLIENT_IP_HEADER: 'x-forwarded-for',
}

/** Environment variable → Secret Manager secret name. */
export const SECRETS = {
	required: { VG_SECRET: 'vg-secret', VG_ADMIN_TOKEN: 'vg-admin-token', ANTHROPIC_API_KEY: 'anthropic-api-key' } as Record<string, string>,
	/** Both or neither: the speech-to-text fallback on Modal (ADR-0055). */
	whisper: { VG_WHISPER_URL: 'vg-whisper-url', VG_WHISPER_TOKEN: 'vg-whisper-token' } as Record<string, string>,
	/** Optional: VoiceTut on Modal (ADR-0047). */
	optional: { VG_VOICETUT_URL: 'vg-voicetut-url' } as Record<string, string>,
}

/** Cloud Run's deterministic URL; it exists only when SERVICE-PROJECT_NUMBER is at most 63 characters. */
export function publicUrl(service: string, projectNumber: string, region: string): string {
	const label = `${service}-${projectNumber}`
	if (label.length > 63) throw new Error(`${label} is ${label.length} characters; Cloud Run gives a deterministic URL only up to 63. Use a shorter --service.`)
	return `https://${label}.${region}.run.app`
}

/** The secrets to mount (environment variable → `name:latest`), from the names that exist in Secret Manager. */
export function secretFlags(existingSecretNames: string[]): Record<string, string> {
	const have = new Set(existingSecretNames.map((n) => n.split('/').at(-1)!))
	const missing = Object.values(SECRETS.required).filter((n) => !have.has(n))
	if (missing.length) throw new Error(`Secret Manager is missing ${missing.join(', ')} (runbook §3c)`)
	const whisper = Object.values(SECRETS.whisper).filter((n) => have.has(n))
	if (whisper.length === 1) throw new Error(`Secret Manager has ${whisper[0]} but not ${Object.values(SECRETS.whisper).find((n) => n !== whisper[0])}: the Whisper URL and token go together, both or neither`)
	const out: Record<string, string> = {}
	for (const [env, name] of Object.entries({ ...SECRETS.required, ...SECRETS.whisper, ...SECRETS.optional })) if (have.has(name)) out[env] = `${name}:latest`
	return out
}

export function imageName(o: { region: string; project: string; repo: string; commit: string }): string {
	return `${o.region}-docker.pkg.dev/${o.project}/${o.repo}/gateway:${o.commit.slice(0, 12)}`
}

/** gcloud arguments that build the image with Cloud Build from a directory holding a Dockerfile. */
export function buildArgs(dir: string, image: string, project: string): string[] {
	return ['builds', 'submit', dir, `--tag=${image}`, `--project=${project}`]
}

export interface DeployOptions {
	service: string
	image: string
	region: string
	project: string
	serviceAccount: string
	env: Record<string, string>
	/** Environment variable → `name:version` (from secretFlags). */
	secrets: Record<string, string>
}

const pairs = (o: Record<string, string>, what: string) =>
	Object.entries(o)
		.map(([k, v]) => {
			if (v.includes(',')) throw new Error(`${what} ${k} contains a comma, which gcloud would split`)
			return `${k}=${v}`
		})
		.join(',')

/** The environment variables that only ever come from Secret Manager. */
const SECRET_ENV = new Set(Object.keys({ ...SECRETS.required, ...SECRETS.whisper, ...SECRETS.optional }))

/** gcloud arguments for `gcloud run deploy`, each setting with its reason (ADR-0066 §1). */
export function deployArgs(o: DeployOptions): string[] {
	const leaked = Object.keys(o.env).filter((k) => SECRET_ENV.has(k.trim().toUpperCase()))
	if (leaked.length) throw new Error(`${leaked.join(', ')} must come from Secret Manager (--set-secrets), never as a plain setting on the command line`)
	return [
		'run',
		'deploy',
		o.service,
		`--image=${o.image}`,
		`--region=${o.region}`,
		`--project=${o.project}`,
		'--port=8080',
		'--cpu=1',
		'--memory=1Gi',
		// As many requests per instance as Fly's hard limit was.
		'--concurrency=400',
		// Sessions live in memory: a second instance would not know a visitor's session.
		'--max-instances=1',
		// Nothing runs when nobody visits.
		'--min-instances=0',
		// Instance-based billing: CPU for the instance's life, for work sent after a reply and for timers.
		'--no-cpu-throttling',
		// Server-sent-event streams are cut at the timeout; the browser reconnects.
		'--timeout=3600',
		`--service-account=${o.serviceAccount}`,
		'--allow-unauthenticated',
		`--set-env-vars=${pairs(o.env, 'Setting')}`,
		`--set-secrets=${pairs(o.secrets, 'Secret')}`,
	]
}

export interface RunOptions {
	cwd?: string
	capture?: boolean
	/** Aborted when the tool is told to stop: the running command is sent SIGTERM. */
	signal?: AbortSignal
}

export type Runner = (cmd: string, args: string[], o?: RunOptions) => Promise<{ status: number | null; stdout: string; error?: string }>

/**
 * Spawns with an argument array, never a shell, and waits without blocking Node, so a stop signal is
 * seen while the command runs. Captured output is returned; otherwise the person sees it.
 */
export const spawnRunner: Runner = (cmd, args, o = {}) =>
	new Promise((resolve) => {
		let stdout = ''
		const child = spawn(cmd, args, { cwd: o.cwd, stdio: o.capture ? ['ignore', 'pipe', 'inherit'] : 'inherit', signal: o.signal, killSignal: 'SIGTERM' })
		child.stdout?.setEncoding('utf8')
		child.stdout?.on('data', (chunk: string) => (stdout += chunk))
		child.on('error', (e) => resolve({ status: null, stdout, error: e.message }))
		child.on('close', (status) => resolve({ status, stdout }))
	})

export interface Deps {
	run: Runner
	fetch: typeof fetch
	log: (line: string) => void
	site: SiteConfig
}

/** Shown as a person could paste it. */
export function shown(cmd: string, args: string[]): string {
	return `$ ${[cmd, ...args].map((a) => (/^[\w@%+=:,./-]+$/.test(a) ? a : `'${a.replace(/'/g, "'\\''")}'`)).join(' ')}`
}

export interface CheckResult {
	ok: boolean
	problems: string[]
}

/** The turn limiter's burst on the deployed gateway (VG_RATE_BURST; the gateway's default is 10). */
export const RATE_BURST = Number(ENV.VG_RATE_BURST ?? 10)
/** How many turns the forged-address check sends: more than the burst, so a shared key must hit the limit. */
export const FORGED_TURNS = RATE_BURST + 5

/** Seconds until a caller's turn budget is full again after the check (the burst at the turn rate). */
const REFILL_SECONDS = Math.ceil((RATE_BURST / Number(ENV.VG_RATE_TURNS_PER_MIN)) * 60)

/**
 * The checks after a deploy: /health, then the forged-address check (ADR-0066 §2). The turns are sent
 * at the same time, so a slow link cannot refill the limiter between them. Each answer is classified:
 * the gateway's own 429 (code `rate_limited`) means the limiter ran on a key the turns shared (each
 * forged value is used once), so one is proof; a 404 `no_session` is a turn the limiter let through
 * (body `{}` names no session). The deployment is called forgeable only when every turn was let through;
 * anything else (a 401/403, a 5xx, a 429 from Cloud Run's front end) means the check could not run.
 */
export async function runChecks(url: string, d: Pick<Deps, 'fetch' | 'log' | 'site'>): Promise<CheckResult> {
	const base = url.replace(/\/$/, '')
	const problems: string[] = []
	d.log(`Checking ${base}`)
	try {
		const r = await d.fetch(`${base}/health`, { signal: AbortSignal.timeout(120_000) })
		const body = (await r.json().catch(() => ({}))) as { ok?: unknown }
		if (r.status === 200 && body.ok === true) d.log('  /health: 200, ok')
		else problems.push(`/health answered ${r.status}${body.ok === true ? '' : ' without ok: true'}`)
	} catch (e) {
		problems.push(`/health did not answer: ${(e as Error).message}`)
	}
	if (problems.length) return { ok: false, problems }

	d.log(`  The forged-address check: ${FORGED_TURNS} turns at once, each with a different forged X-Forwarded-For.`)
	d.log(`  It uses up your own turn budget on this gateway for about ${REFILL_SECONDS} seconds.`)
	const origin = new URL(d.site.origins[0].url).origin
	let answers: { status: number; kind: 'limited' | 'allowed' | 'other' }[]
	try {
		answers = await Promise.all(
			Array.from({ length: FORGED_TURNS }, async (_, i) => {
				const r = await d.fetch(`${base}/v1/turn`, {
					method: 'POST',
					headers: { 'content-type': 'application/json', 'x-vg-site-key': d.site.siteKey, origin, 'x-forwarded-for': `198.51.100.${i + 1}` },
					body: '{}',
					signal: AbortSignal.timeout(30_000),
				})
				const body = (await r.json().catch(() => ({}))) as { code?: unknown }
				const kind = r.status === 429 && body.code === 'rate_limited' ? 'limited' : r.status === 404 && body.code === 'no_session' ? 'allowed' : 'other'
				return { status: r.status, kind } as const
			}),
		)
	} catch (e) {
		problems.push(`a turn did not answer: ${(e as Error).message}`)
		return { ok: false, problems }
	}
	const codes = answers.map((a) => a.status).join(' ')
	d.log(`  answers: ${codes}`)
	if (answers.some((a) => a.kind === 'limited')) d.log('  passed: the limiter keyed the turns on one real address, whatever was forged')
	else if (answers.every((a) => a.kind === 'allowed')) problems.push(`the gateway let all ${FORGED_TURNS} turns through: each forged X-Forwarded-For got its own rate limit, so a visitor can forge their address and the rate limits do not hold. The last-entry rule (ADR-0066 §2) does not hold on this deployment. Do not share the extension (runbook §3c).`)
	else if (answers.some((a) => a.status === 401 || a.status === 403)) problems.push(`the gateway refused the site key ${d.site.siteKey} or the origin ${origin} (answers ${codes}); the forged-address check could not run`)
	else problems.push(`the forged-address check could not run (answers ${codes}): no turn reached the gateway's limiter as expected (a 5xx, or a 429 from Cloud Run's front end). It proves nothing this time; run it again with --check in a minute.`)
	return { ok: !problems.length, problems }
}

class StepError extends Error {}

async function runStep(d: Deps, name: string, cmd: string, args: string[], o: RunOptions = {}): Promise<string> {
	d.log(`\n${name}\n${shown(cmd, args)}`)
	const r = await d.run(cmd, args, o)
	if (r.status !== 0) throw new StepError(`Stopped at "${name}": ${cmd} ${r.error ? `did not finish (${r.error})` : `exited with ${r.status}`}. Nothing after it ran.`)
	return r.stdout.trim()
}

export async function main(argv: string[], deps: Partial<Deps> = {}): Promise<number> {
	const { values } = parseArgs({
		args: argv,
		options: {
			project: { type: 'string' },
			region: { type: 'string', default: DEFAULTS.region },
			service: { type: 'string', default: DEFAULTS.service },
			repo: { type: 'string', default: DEFAULTS.repo },
			'service-account': { type: 'string' },
			ref: { type: 'string', default: DEFAULTS.ref },
			'dry-run': { type: 'boolean', default: false },
			check: { type: 'string' },
		},
		strict: true,
	})
	const d: Deps = {
		run: deps.run ?? spawnRunner,
		fetch: deps.fetch ?? globalThis.fetch,
		log: deps.log ?? ((l) => console.log(l)),
		site: deps.site ?? loadSiteConfig(path.join(ROOT, 'config/sites/vodafone-eg.yaml')),
	}
	const region = values.region!
	const service = values.service!
	const dry = values['dry-run']!

	if (values.check) {
		if (dry) {
			d.log(`Would check ${values.check}: GET /health, then ${FORGED_TURNS} POST /v1/turn with forged X-Forwarded-For (needs a 429).`)
			return 0
		}
		const r = await runChecks(values.check, d)
		for (const p of r.problems) d.log(`FAILED: ${p}`)
		return r.ok ? 0 : 1
	}
	if (!values.project) {
		d.log('--project <id> is required (or --check <url> to check a deployed gateway)')
		return 2
	}
	const project = values.project
	const serviceAccount = values['service-account'] || `vg-gateway@${project}.iam.gserviceaccount.com`

	if (dry) {
		// Placeholders for what a real run reads from git and from the account.
		const commit = '<commit>'
		const tmp = '<tmp>'
		const url = `https://${service}-<project-number>.${region}.run.app`
		const image = `${region}-docker.pkg.dev/${project}/${values.repo}/gateway:<commit-12>`
		const allSecrets = secretFlags([...Object.values(SECRETS.required), ...Object.values(SECRETS.whisper), ...Object.values(SECRETS.optional)])
		d.log('Dry run: nothing is run, no gcloud is called, no account is read.')
		const lines: [string, string, string[], string?][] = [
			['Resolve the ref to a commit', 'git', ['rev-parse', '--verify', `${values.ref}^{commit}`]],
			['Warn about uncommitted changes (they are not deployed)', 'git', ['status', '--porcelain', '--', 'voice-guide', 'experiences']],
			['Read the project number', 'gcloud', ['projects', 'describe', project, '--format=value(projectNumber)']],
			['List the secrets', 'gcloud', ['secrets', 'list', `--project=${project}`, '--format=value(name)']],
			['Archive the commit', 'git', ['archive', '--format=tar', `--output=${tmp}/src.tar`, commit, 'voice-guide', 'experiences']],
			['Unpack it', 'tar', ['-xf', `${tmp}/src.tar`, '-C', tmp]],
			['Take the Dockerfile from the commit (to <tmp>/Dockerfile)', 'git', ['show', `${commit}:voice-guide/deploy/gateway/gateway.Dockerfile`]],
			['Take its ignore file from the commit (to <tmp>/.dockerignore)', 'git', ['show', `${commit}:voice-guide/deploy/gateway/gateway.Dockerfile.dockerignore`]],
			['Build the image with Cloud Build', 'gcloud', buildArgs(tmp, image, project)],
			['Deploy to Cloud Run', 'gcloud', deployArgs({ service, image, region, project, serviceAccount, env: { ...ENV, VG_PUBLIC_URL: url }, secrets: allSecrets })],
		]
		for (const [name, cmd, args] of lines) d.log(`\n${name}\n${shown(cmd, args)}`)
		d.log(`\nThe optional secrets (${[...Object.values(SECRETS.whisper), ...Object.values(SECRETS.optional)].join(', ')}) are mounted only when they exist in Secret Manager.`)
		d.log(`Then: remove <tmp>, print ${url}, and check it: GET /health, then ${FORGED_TURNS} POST /v1/turn with forged X-Forwarded-For (needs a 429).`)
		return 0
	}

	let tmp = ''
	let url = ''
	// A stop must not end the run with a later step still to come, nor before `finally` removes the temp
	// directory (a copy of the committed tree). With these listeners Node does not exit on the signal; the
	// steps await their commands, so the signal is seen while one runs. Ctrl-C in the terminal reaches the
	// running gcloud too (same process group), which cancels and exits non-zero. A SIGTERM sent to this
	// tool alone (a `kill`, a supervisor) is passed on to the running command. Either way no later step
	// starts. The listeners stay until the last step has been checked.
	let interrupted = ''
	const stop = new AbortController()
	const onSignal = (signal: NodeJS.Signals) => {
		interrupted ||= signal
		if (signal === 'SIGTERM') stop.abort()
	}
	process.on('SIGINT', onSignal)
	process.on('SIGTERM', onSignal)
	const step = async (name: string, cmd: string, args: string[], o: RunOptions = {}): Promise<string> => {
		if (interrupted) throw new StepError(`Stopped before "${name}": ${interrupted}. Nothing after it ran.`)
		const out = await runStep(d, name, cmd, args, { ...o, signal: stop.signal })
		if (interrupted) throw new StepError(`Stopped during "${name}": ${interrupted}. Nothing after it ran.`)
		return out
	}
	try {
		const commit = await step('Resolve the ref to a commit', 'git', ['rev-parse', '--verify', `${values.ref}^{commit}`], { cwd: REPO, capture: true })
		const dirty = await step('Look for uncommitted changes', 'git', ['status', '--porcelain', '--', 'voice-guide', 'experiences'], { cwd: REPO, capture: true })
		if (dirty) d.log(`WARNING: ${dirty.split('\n').length} uncommitted change(s) under voice-guide/ or experiences/. They are NOT deployed: only commit ${commit.slice(0, 12)} is.`)
		const projectNumber = await step('Read the project number', 'gcloud', ['projects', 'describe', project, '--format=value(projectNumber)'], { capture: true })
		if (!/^\d+$/.test(projectNumber)) throw new StepError(`Stopped at "Read the project number": got ${JSON.stringify(projectNumber)}`)
		url = publicUrl(service, projectNumber, region)
		const names = await step('List the secrets', 'gcloud', ['secrets', 'list', `--project=${project}`, '--format=value(name)'], { capture: true })
		const secrets = secretFlags(names.split('\n').map((n) => n.trim()).filter(Boolean))
		d.log(`  mounting ${Object.keys(secrets).join(', ')}`)

		tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vg-cloudrun-'))
		await step('Archive the commit', 'git', ['archive', '--format=tar', `--output=${path.join(tmp, 'src.tar')}`, commit, 'voice-guide', 'experiences'], { cwd: REPO })
		await step('Unpack it', 'tar', ['-xf', path.join(tmp, 'src.tar'), '-C', tmp])
		fs.rmSync(path.join(tmp, 'src.tar'), { force: true })
		const dockerfile = await step('Take the Dockerfile from the commit', 'git', ['show', `${commit}:voice-guide/deploy/gateway/gateway.Dockerfile`], { cwd: REPO, capture: true })
		fs.writeFileSync(path.join(tmp, 'Dockerfile'), `${dockerfile}\n`)
		const ignore = await step('Take its ignore file from the commit', 'git', ['show', `${commit}:voice-guide/deploy/gateway/gateway.Dockerfile.dockerignore`], { cwd: REPO, capture: true })
		fs.writeFileSync(path.join(tmp, '.dockerignore'), `${ignore}\n`)

		const image = imageName({ region, project, repo: values.repo!, commit })
		await step('Build the image with Cloud Build', 'gcloud', buildArgs(tmp, image, project))
		await step('Deploy to Cloud Run', 'gcloud', deployArgs({ service, image, region, project, serviceAccount, env: { ...ENV, VG_PUBLIC_URL: url }, secrets }))
	} catch (e) {
		d.log(e instanceof StepError ? e.message : `Stopped: ${(e as Error).message}`)
		return 1
	} finally {
		process.off('SIGINT', onSignal)
		process.off('SIGTERM', onSignal)
		if (tmp) fs.rmSync(tmp, { recursive: true, force: true })
	}

	d.log(`\nDeployed: ${url}`)
	const r = await runChecks(url, d)
	for (const p of r.problems) d.log(`FAILED: ${p}`)
	if (r.ok) d.log(`All checks passed. Run them again with: npm run deploy:cloudrun -- --check ${url}`)
	return r.ok ? 0 : 1
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
	process.exitCode = await main(process.argv.slice(2))
}
