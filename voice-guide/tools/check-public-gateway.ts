/**
 * Checks a deployed public gateway (ADR-0053) after a deploy, on any host (Render since ADR-0067).
 *
 *   npm run gateway:check -- https://vg-public-demo.onrender.com [--site vodafone-eg]
 *
 * Two checks: /health answers and says the trusted client-address header reached the gateway, and the
 * forged-address check (a visitor cannot pick their own rate-limit key by forging a client-address
 * header). Exits 0 when both pass, 1 otherwise. Sends only HTTP requests to the URL given; runs no
 * command and reads no account (runbook §3c).
 */
import fs from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'

import { loadPlatformConfig, loadSiteConfig, ROOT, type SiteConfig } from '#shared/config.ts'

/** VG_RATE_TURNS_PER_MIN on the public gateway (render.yaml; ADR-0053 §2). */
export const RATE_TURNS_PER_MIN = 20
/** The turn limiter's burst on the public gateway: the gateway's default (VG_RATE_BURST is not set). */
export const RATE_BURST = loadPlatformConfig({} as NodeJS.ProcessEnv).rateLimit.burst
/** How many turns the forged-address check sends: more than the burst, so a shared key must hit the limit. */
export const FORGED_TURNS = RATE_BURST + 5

/** Seconds until a caller's turn budget is full again after the check (the burst at the turn rate). */
const REFILL_SECONDS = Math.ceil((RATE_BURST / RATE_TURNS_PER_MIN) * 60)

export const USAGE = `Usage: npm run gateway:check -- <url> [--site vodafone-eg]

Checks a deployed public gateway (ADR-0067; runbook §3c):
  1. GET /health answers 200 with ok: true and clientHeader: true (the trusted client-address
     header reached the gateway).
  2. The forged-address check: turns sent at once with forged client-address headers; the gateway's
     own 429 must answer some of them. Each turn forges X-Forwarded-For, CF-Connecting-IP and
     True-Client-IP. It uses up your own turn budget on the gateway for about ${REFILL_SECONDS} seconds.
Exits 0 when both pass, 1 otherwise.`

/**
 * The forged client-address headers of turn `i`: every header a host might trust (Cloud Run's
 * X-Forwarded-For, Cloudflare's CF-Connecting-IP and True-Client-IP on Render), each value used once,
 * so the check holds whichever one VG_CLIENT_IP_HEADER names.
 */
export function forgedHeaders(i: number): Record<string, string> {
	return { 'x-forwarded-for': `198.51.100.${i + 1}`, 'cf-connecting-ip': `192.0.2.${i + 1}`, 'true-client-ip': `203.0.113.${i + 101}` }
}

export interface Deps {
	fetch: typeof fetch
	log: (line: string) => void
	site: SiteConfig
}

export interface CheckResult {
	ok: boolean
	problems: string[]
}

/**
 * The checks: /health, read twice with two forged client-address values, which must say the trusted
 * header reached the gateway (`clientHeader: true`; without it every visitor would be keyed on the
 * proxy's own address) and give the same client key both times (a key that follows the forged value is
 * one a visitor can choose), then the forged-address check. The turns are sent at the same time, so a slow
 * link cannot refill the limiter between them. Each answer is classified: the gateway's own 429 (code
 * `rate_limited`) means the limiter ran on a key the turns shared (each forged value is used once), so
 * one is proof; a 404 `no_session` is a turn the limiter let through (body `{}` names no session). The
 * deployment is called forgeable only when every turn was let through; anything else (a 401/403, a
 * 5xx, a 429 from the host's front end) means the check could not run.
 */
export async function runChecks(url: string, d: Deps): Promise<CheckResult> {
	const base = url.replace(/\/$/, '')
	const problems: string[] = []
	d.log(`Checking ${base}`)
	type Health = { ok?: unknown; store?: unknown; clientHeader?: unknown; clientKey?: unknown; boot?: unknown }
	// Forged headers here too: a host that passes the caller's header through (or a gateway reached without its
	// front end) shows clientHeader true and then a client key that follows the forged value; one that drops
	// the header shows clientHeader false. Two reads with two forged values tell the cases apart.
	const health = async (i: number): Promise<{ status: number; body: Health }> => {
		const r = await d.fetch(`${base}/health`, { headers: forgedHeaders(i), signal: AbortSignal.timeout(180_000) })
		return { status: r.status, body: (await r.json().catch(() => ({}))) as Health }
	}
	try {
		const first = await health(FORGED_TURNS)
		const { status, body } = first
		if (status !== 200 || body.ok !== true) problems.push(`/health answered ${status}${body.ok === true ? '' : ' without ok: true'}: the service may still be waking up (about a minute on Render's free plan); run the check again, and read the service's logs if it persists`)
		else {
			d.log(`  /health: 200, ok, store ${String(body.store ?? 'not reported')}, your client key ${String(body.clientKey ?? 'not reported')} (boot ${String(body.boot ?? 'not reported')})`)
			if (body.clientHeader !== true) problems.push(`the trusted client-address header did not reach the gateway (/health: clientHeader ${JSON.stringify(body.clientHeader ?? null)}), so every visitor would share one rate limit. Check VG_CLIENT_IP_HEADER against the host (Render: cf-connecting-ip).`)
			else {
				const second = await health(FORGED_TURNS + 1)
				if (second.status === 200 && second.body.boot === body.boot && typeof body.clientKey === 'string' && second.body.clientKey !== body.clientKey)
					problems.push(`your client key changed with the forged client-address header (${body.clientKey}, then ${String(second.body.clientKey)}): the gateway keys on a value the caller sends, so a visitor can forge their address and the rate limits do not hold. Do not share the extension (runbook §3c).`)
			}
		}
	} catch (e) {
		problems.push(`/health did not answer: ${(e as Error).message}. The service may still be waking up; run the check again.`)
	}
	if (problems.length) return { ok: false, problems }

	d.log(`  The forged-address check: ${FORGED_TURNS} turns at once, each with different forged client-address headers.`)
	d.log(`  It uses up your own turn budget on this gateway for about ${REFILL_SECONDS} seconds.`)
	const origin = new URL(d.site.origins[0].url).origin
	let answers: { status: number; kind: 'limited' | 'allowed' | 'other' }[]
	try {
		answers = await Promise.all(
			Array.from({ length: FORGED_TURNS }, async (_, i) => {
				const r = await d.fetch(`${base}/v1/turn`, {
					method: 'POST',
					headers: { 'content-type': 'application/json', 'x-vg-site-key': d.site.siteKey, origin, ...forgedHeaders(i) },
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
	else if (answers.every((a) => a.kind === 'allowed')) problems.push(`the gateway let all ${FORGED_TURNS} turns through: each forged address got its own rate limit, so a visitor can forge their address and the rate limits do not hold. Do not share the extension (runbook §3c).`)
	else if (answers.some((a) => a.status === 401 || a.status === 403)) problems.push(`the gateway refused the site key ${d.site.siteKey} or the origin ${origin} (answers ${codes}); the forged-address check could not run`)
	else problems.push(`the forged-address check could not run (answers ${codes}): no turn reached the gateway's limiter as expected (a 5xx, or a 429 from the host's front end). It proves nothing this time; run it again in a minute.`)
	return { ok: !problems.length, problems }
}

export async function main(argv: string[], deps: Partial<Deps> = {}): Promise<number> {
	const log = deps.log ?? ((l: string) => console.log(l))
	let parsed
	try {
		parsed = parseArgs({ args: argv, options: { site: { type: 'string', default: 'vodafone-eg' }, help: { type: 'boolean', default: false } }, allowPositionals: true, strict: true })
	} catch (e) {
		log(`${(e as Error).message}\n\n${USAGE}`)
		return 1
	}
	const { values, positionals } = parsed
	if (values.help) {
		log(USAGE)
		return 0
	}
	if (positionals.length !== 1 || !/^https?:\/\//.test(positionals[0])) {
		log(`${positionals.length ? `Expected one http(s) URL, got: ${positionals.join(' ')}` : 'The gateway URL is missing.'}\n\n${USAGE}`)
		return 1
	}
	let site = deps.site
	if (!site) {
		const file = path.join(ROOT, 'config/sites', `${values.site}.yaml`)
		if (!/^[a-z0-9-]+$/.test(values.site!) || !fs.existsSync(file)) {
			log(`Unknown site ${JSON.stringify(values.site)} (config/sites/<id>.yaml).\n\n${USAGE}`)
			return 1
		}
		site = loadSiteConfig(file)
	}
	const d: Deps = { fetch: deps.fetch ?? globalThis.fetch, log, site }
	const r = await runChecks(positionals[0], d)
	for (const p of r.problems) d.log(`FAILED: ${p}`)
	if (r.ok) {
		d.log(`All checks passed. Run them again with: npm run gateway:check -- ${positionals[0]}`)
		d.log('Once after a deploy, run it again from another network (a phone hotspot) within 15 minutes: the client key must differ.')
		d.log('The two keys compare only when both runs show the same boot id; if it changed (the service slept or was redeployed), run both again.')
		d.log("The same key from two networks, same boot, means every visitor shares one rate limit (the header is not the visitor's own address).")
	}
	return r.ok ? 0 : 1
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
	process.exitCode = await main(process.argv.slice(2))
}
