/**
 * Platform configuration from the environment, and per-site configuration
 * from YAML (ADR-0025). Every knob documented in docs/pilot-tuning.md is read
 * here, so this file is the single place to look for defaults.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import YAML from 'yaml'
import * as z from 'zod/v4'

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

const num = (v: string | undefined, d: number) => (v === undefined || v === '' ? d : Number(v))

export interface PlatformConfig {
	port: number
	publicUrl: string
	store: 'postgres' | 'memory'
	databaseUrl: string
	dbPoolMax: number
	services: 'local' | 'http'
	serviceUrls: Record<string, string | undefined>
	rpcTimeoutMs: number
	secret: string
	sessionTtlMin: number
	traceRetentionDays: number
	rateLimit: { turnsPerMinute: number; burst: number }
	jev: { baseUrl: string; apiKey?: string; model: string; timeoutMs: number }
	laya: { baseUrl?: string; apiKey?: string; timeoutMs: number }
	llm: { baseUrl?: string; apiKey?: string; model?: string; fallbackBaseUrl?: string; fallbackApiKey?: string; fallbackModel?: string; timeoutMs: number }
	vision: { baseUrl?: string; apiKey?: string; model?: string }
	agentQuota: { stepsPerSession: number; tokensPerSession: number; tokensPerSiteDay: number }
	vapid: { subject: string; keyFile: string }
	sitesDir: string
	dataDir: string
	logLevel: 'debug' | 'info' | 'warn' | 'error'
}

export function loadPlatformConfig(env: NodeJS.ProcessEnv = process.env): PlatformConfig {
	const port = num(env.VG_PORT, 4400)
	return {
		port,
		publicUrl: env.VG_PUBLIC_URL || `http://localhost:${port}`,
		store: env.VG_STORE === 'memory' ? 'memory' : 'postgres',
		databaseUrl: env.DATABASE_URL || 'postgres://postgres:devpass@127.0.0.1:54329/voiceguide',
		dbPoolMax: num(env.VG_DB_POOL_MAX, 10),
		services: env.VG_SERVICES === 'http' ? 'http' : 'local',
		serviceUrls: {
			router: env.VG_ROUTER_URL,
			knowledge: env.VG_KNOWLEDGE_URL,
			sessions: env.VG_SESSIONS_URL,
			agent: env.VG_AGENT_URL,
			watch: env.VG_WATCH_URL,
		},
		rpcTimeoutMs: num(env.VG_RPC_TIMEOUT_MS, 4000),
		secret: env.VG_SECRET || 'dev-only-secret-change-me',
		sessionTtlMin: num(env.VG_SESSION_TTL_MIN, 60),
		traceRetentionDays: num(env.VG_TRACE_RETENTION_DAYS, 7),
		rateLimit: { turnsPerMinute: num(env.VG_RATE_TURNS_PER_MIN, 30), burst: num(env.VG_RATE_BURST, 10) },
		jev: {
			baseUrl: env.JEV_BASE_URL || 'https://api.typesafe.ai',
			apiKey: env.JEV_API_KEY,
			model: env.JEV_MODEL || 'jev-latest',
			timeoutMs: num(env.JEV_TIMEOUT_MS, 1500),
		},
		laya: { baseUrl: env.LAYA_BASE_URL, apiKey: env.LAYA_API_KEY, timeoutMs: num(env.LAYA_TIMEOUT_MS, 1500) },
		llm: {
			baseUrl: env.VG_LLM_BASE_URL,
			apiKey: env.VG_LLM_API_KEY,
			model: env.VG_LLM_MODEL,
			fallbackBaseUrl: env.VG_LLM_FALLBACK_BASE_URL,
			fallbackApiKey: env.VG_LLM_FALLBACK_API_KEY,
			fallbackModel: env.VG_LLM_FALLBACK_MODEL,
			timeoutMs: num(env.VG_LLM_TIMEOUT_MS, 30000),
		},
		vision: { baseUrl: env.VG_VISION_BASE_URL, apiKey: env.VG_VISION_API_KEY, model: env.VG_VISION_MODEL },
		agentQuota: {
			stepsPerSession: num(env.VG_AGENT_STEPS_PER_SESSION, 60),
			tokensPerSession: num(env.VG_AGENT_TOKENS_PER_SESSION, 400_000),
			tokensPerSiteDay: num(env.VG_AGENT_TOKENS_PER_SITE_DAY, 20_000_000),
		},
		vapid: { subject: env.VG_VAPID_SUBJECT || 'mailto:voice-guide@example.invalid', keyFile: env.VG_VAPID_KEY_FILE || path.join(ROOT, 'data/vapid.json') },
		sitesDir: env.VG_SITES_DIR || path.join(ROOT, 'config/sites'),
		dataDir: env.VG_DATA_DIR || path.join(ROOT, 'data'),
		logLevel: (env.VG_LOG_LEVEL as PlatformConfig['logLevel']) || 'info',
	}
}

const I18n = z.record(z.string(), z.string())

export const SiteConfig = z.object({
	id: z.string(),
	name: I18n,
	languages: z.array(z.string()).min(1),
	defaultLanguage: z.string(),
	siteKey: z.string().min(8),
	/** `key` prefixes page ids from that origin (web.bundles, app.account); defaults to web, o2, o3... */
	origins: z.array(z.object({ url: z.url(), key: z.string().regex(/^[a-z][a-z0-9-]*$/).optional(), serve: z.string().optional() })).min(1),
	crawl: z.object({
		start: z.array(z.url()).min(1),
		include: z.array(z.string()).default([]),
		exclude: z.array(z.string()).default([]),
		maxPages: z.number().int().positive().default(200),
		concurrency: z.number().int().positive().default(4),
		cookies: z.array(z.object({ url: z.url(), name: z.string(), value: z.string() })).default([]),
		collections: z.object({ minItems: z.number().int().min(2).default(3) }).default({ minItems: 3 }),
	}),
	curated: z.string().optional(),
	speech: z
		.object({ stt: I18n.default({}), tts: I18n.default({}) })
		.default({ stt: {}, tts: {} }),
	ui: z
		.object({
			accent: z.string().optional(),
			position: z.enum(['start', 'end']).default('end'),
			xray: z.enum(['off', 'button', 'open']).default('button'),
		})
		.default({ position: 'end', xray: 'button' }),
	router: z
		.object({
			decider: z.enum(['local', 'jev', 'laya']).default('local'),
			acceptAt: z.number().min(0).max(1).default(0.55),
			clarifyAt: z.number().min(0).max(1).default(0.3),
			topK: z.number().int().min(2).max(20).default(8),
		})
		.default({ decider: 'local', acceptAt: 0.55, clarifyAt: 0.3, topK: 8 }),
	agent: z
		.object({ enabled: z.boolean().default(true), maxSteps: z.number().int().positive().default(12), timeoutSec: z.number().positive().default(60) })
		.default({ enabled: true, maxSteps: 12, timeoutSec: 60 }),
	watch: z
		.object({ enabled: z.boolean().default(true), intervalSec: z.number().int().min(5).default(900) })
		.default({ enabled: true, intervalSec: 900 }),
})
export type SiteConfig = z.infer<typeof SiteConfig>

export function loadSiteConfig(file: string): SiteConfig {
	const raw = YAML.parse(fs.readFileSync(file, 'utf8'))
	const parsed = SiteConfig.safeParse(raw)
	if (!parsed.success) throw new Error(`Invalid site config ${file}: ${z.prettifyError(parsed.error)}`)
	return parsed.data
}

/** All site configs in the sites directory, keyed by site id. */
export function loadSites(dir: string): Map<string, SiteConfig> {
	const sites = new Map<string, SiteConfig>()
	if (!fs.existsSync(dir)) return sites
	for (const f of fs.readdirSync(dir)) {
		if (!/\.ya?ml$/.test(f)) continue
		const s = loadSiteConfig(path.join(dir, f))
		sites.set(s.id, s)
	}
	return sites
}

export function resolveFromRoot(p: string): string {
	return path.isAbsolute(p) ? p : path.join(ROOT, p)
}
