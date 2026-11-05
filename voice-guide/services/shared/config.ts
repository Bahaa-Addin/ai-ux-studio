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

import { type LlmPreset, llmPreset } from './llm-presets.ts'

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
	/** Approved anonymous trail aggregation (ADR-0037 §6): off unless VG_TRAIL_AGGREGATION=on, and the site enables it too. */
	trailAggregation: boolean
	interestRetentionDays: number
	rateLimit: { turnsPerMinute: number; burst: number }
	jev: { baseUrl: string; apiKey?: string; model: string; timeoutMs: number }
	laya: { baseUrl?: string; apiKey?: string; timeoutMs: number }
	llm: { baseUrl?: string; apiKey?: string; model?: string; fallbackBaseUrl?: string; fallbackApiKey?: string; fallbackModel?: string; timeoutMs: number; preset?: string; body?: Record<string, unknown>; sendOrigin?: boolean }
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
		trailAggregation: env.VG_TRAIL_AGGREGATION === 'on',
		interestRetentionDays: num(env.VG_TRAIL_AGGREGATE_RETENTION_DAYS, 90),
		rateLimit: { turnsPerMinute: num(env.VG_RATE_TURNS_PER_MIN, 30), burst: num(env.VG_RATE_BURST, 10) },
		jev: {
			baseUrl: env.JEV_BASE_URL || 'https://api.typesafe.ai',
			apiKey: env.JEV_API_KEY,
			model: env.JEV_MODEL || 'jev-latest',
			timeoutMs: num(env.JEV_TIMEOUT_MS, 1500),
		},
		laya: { baseUrl: env.LAYA_BASE_URL, apiKey: env.LAYA_API_KEY, timeoutMs: num(env.LAYA_TIMEOUT_MS, 1500) },
		llm: {
			// A preset fills the primary model only when none is configured (ADR-0042).
			...(env.VG_LLM_BASE_URL ? {} : presetModel(llmPreset(env.VG_LLM_PRESET), env.VG_LLM_PRESET)),
			...(env.VG_LLM_BASE_URL ? { baseUrl: env.VG_LLM_BASE_URL, apiKey: env.VG_LLM_API_KEY, model: env.VG_LLM_MODEL } : {}),
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
		/** Links followed from the start pages; unset = no limit (SPEC-04 §2: 2 for live sites). */
		maxDepth: z.number().int().min(0).optional(),
		/** Query parameters that make a different page (the shop's category lists). */
		keepQuery: z.array(z.string()).default([]),
		/** Appended to URLs ending in "/" (fixture servers only). */
		directoryIndex: z.string().optional(),
		/** Public pages only: no cookies are sent, pages behind a login are skipped (ADR-0032). */
		publicOnly: z.boolean().default(false),
		/** Pause between page loads per worker, in ms (SPEC-04 §4: 1,000 for live sites). */
		delayMs: z.number().int().min(0).default(0),
		/** Elements removed before extraction: cookie banners, accessibility widgets. */
		ignoreSelectors: z.array(z.string()).default([]),
		/** Paths that need the page's own scripts to render (single-page apps); others may be crawled without. */
		scriptsFor: z.string().optional(),
		/** Sitemaps used for lastmod, never for discovery (ADR-0028). */
		sitemaps: z.array(z.url()).default([]),
		userAgent: z.string().optional(),
		/** Which pages count as the same page in another language (ADR-0028): hreflang links, or /en/x <-> /ar/x. */
		pairLanguagesBy: z.enum(['hreflang', 'path']).default('hreflang'),
	}),
	/** Knowledge sync (SPEC-04). The schedule is paused unless enabled; on-demand runs always work. */
	sync: z
		.object({
			schedule: z
				.object({
					enabled: z.boolean().default(false),
					everyMinutes: z.number().int().min(15).default(120),
					window: z.string().regex(/^\d\d:\d\d-\d\d:\d\d$/).default('07:00-23:00'),
					timezone: z.string().default('Africa/Cairo'),
				})
				.default({ enabled: false, everyMinutes: 120, window: '07:00-23:00', timezone: 'Africa/Cairo' }),
			gate: z
				.object({
					maxDestinationChurn: z.number().min(0).max(1).default(0.15),
					requireSeeds: z.boolean().default(true),
					/** Router evaluation set scored against the new and the active version (SPEC-04 §5 step 6). */
					evalCases: z.string().optional(),
					/** Largest allowed drop in that score, as a fraction (0.02 = 2 points). */
					maxEvalDrop: z.number().min(0).max(1).default(0.02),
				})
				.default({ maxDestinationChurn: 0.15, requireSeeds: true, maxEvalDrop: 0.02 }),
			keepVersions: z.number().int().min(1).default(10),
		})
		.default({
			schedule: { enabled: false, everyMinutes: 120, window: '07:00-23:00', timezone: 'Africa/Cairo' },
			gate: { maxDestinationChurn: 0.15, requireSeeds: true, maxEvalDrop: 0.02 },
			keepVersions: 10,
		}),
	curated: z.string().optional(),
	speech: z
		.object({
			stt: I18n.default({}),
			tts: I18n.default({}),
			/** On-device recognition (SPEC-02 §6): prefer it when the browser has the language pack. */
			onDevice: z.enum(['prefer', 'require', 'off']).default('prefer'),
		})
		.default({ stt: {}, tts: {}, onDevice: 'prefer' }),
	ui: z
		.object({
			accent: z.string().optional(),
			position: z.enum(['start', 'end']).default('end'),
			xray: z.enum(['off', 'button', 'open']).default('button'),
			/** `vodafone`: the fixed Vodafone tokens (ADR-0029); `page`: derived from the host page (ADR-0020). */
			theme: z.enum(['page', 'vodafone']).default('page'),
			/** Voice-first launcher (ADR-0027): the floating button is the microphone. */
			voiceFirst: z.boolean().default(false),
		})
		.default({ position: 'end', xray: 'button', theme: 'page', voiceFirst: false }),
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
	/**
	 * Exploration Trail (SPEC-06, ADR-0035 to ADR-0039). Off unless enabled; recording still needs
	 * each person's consent. Aggregation is a separate, approved channel and stays off (ADR-0037 §6).
	 */
	trail: z
		.object({
			enabled: z.boolean().default(false),
			retentionHours: z.number().min(1).max(168).default(24),
			/** Extra paths (regular expressions) never recorded, on top of the built-in sensitive patterns. */
			excludePaths: z.array(z.string()).default([]),
			/** Extra regions blocked from recordings (account widgets, personal banners). */
			privateSelectors: z.array(z.string()).default([]),
			/** Fixed distance from the top for the timeline, in px, when the header cannot be measured. */
			topOffset: z.number().int().min(0).optional(),
			/** The page that shows the journey (the Pocket on the Services clone, ADR-0040); other pages keep only the status pill. */
			hostUrl: z.url().optional(),
			/**
			 * Same-origin path prefixes whose files a replay may copy even without a file extension or with
			 * a query (a CMS's images, e.g. /documents/). The copy is still credential-free, GET only, no
			 * redirects, and kept only if it comes back as an image, font or stylesheet (ADR-0037 §5).
			 */
			replayAssetPaths: z.array(z.string().regex(/^\/[\w\-./]*\/$/)).max(10).default([]),
			aggregation: z
				.object({ enabled: z.boolean().default(false), minCohort: z.number().int().min(5).default(20), windowDays: z.number().int().min(1).max(90).default(28) })
				.default({ enabled: false, minCohort: 20, windowDays: 28 }),
		})
		.default({ enabled: false, retentionHours: 24, excludePaths: [], privateSelectors: [], replayAssetPaths: [], aggregation: { enabled: false, minCohort: 20, windowDays: 28 } }),
})
export type SiteConfig = z.infer<typeof SiteConfig>

/** Whether the agent proxy has a model to call (ADR-0018). Without one, nothing is routed to the agent. */
function presetModel(p: LlmPreset | undefined, name: string | undefined): Partial<PlatformConfig['llm']> {
	return p ? { baseUrl: p.baseUrl, apiKey: p.apiKey, model: p.model, preset: name, body: p.body, sendOrigin: p.sendOrigin } : {}
}

export function agentModelConfigured(p: PlatformConfig): boolean {
	return !!((p.llm.baseUrl && p.llm.model) || (p.llm.fallbackBaseUrl && p.llm.fallbackModel))
}

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
