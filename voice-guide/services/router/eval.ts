/**
 * Router evaluation (ADR-0014): runs an utterance set through understanding
 * and planning and scores destination, intent, route and selector. Used by the
 * unit tests (regression gate) and by `npm run eval:router` (pilot tuning).
 */
import type { KbIndex } from '#shared/kb-index.ts'
import type { Entity, SessionState } from '#shared/store/index.ts'

import type { CircuitBreaker, Decider } from './deciders.ts'
import { buildPlan, variantUrl } from './planner.ts'
import { type RouterSettings, understand } from './understand.ts'

export interface EvalCase {
	say: string
	page?: string
	lang?: string
	last?: Entity
	dest?: string
	intent?: string
	route?: string
	select?: string
}

export interface EvalRow {
	case: EvalCase
	ok: boolean
	failures: string[]
	got: { dest?: string; intent: string; route: string; select?: string; confidence: number; provider: string; ms: number; fallbackReason?: string }
}

export interface EvalSummary {
	total: number
	passed: number
	accuracy: number
	byField: Record<string, { checked: number; correct: number }>
	byLang: Record<string, { total: number; passed: number }>
	latency: { p50: number; p95: number; max: number }
	providers: Record<string, number>
	rows: EvalRow[]
}

export async function evaluate(cases: EvalCase[], kb: KbIndex, settings: RouterSettings, decider?: Decider, breaker?: CircuitBreaker): Promise<EvalSummary> {
	const rows: EvalRow[] = []
	for (const c of cases) {
		const pageId = c.page || 'web.home'
		const lang = c.lang || kb.manifest.site.defaultLanguage
		const session: SessionState = {
			id: 'eval',
			siteId: kb.manifest.site.id,
			lang,
			createdAt: '',
			updatedAt: '',
			turns: [],
			last: c.last,
			usage: { agentSteps: 0, agentTokens: 0 },
		}
		const u = await understand({ utterance: c.say, uiLang: lang, pageId, session, kb, settings, decider, breaker })
		const { plan } = buildPlan({ u, utterance: c.say, session, kb, page: { url: variantUrl(kb, pageId, lang) }, turnId: 't', agent: { enabled: settings.agentEnabled, maxSteps: 12 } })
		const got = {
			dest: plan.meta.destinationId ?? u.decision.destinationId,
			intent: u.intent,
			route: plan.meta.route,
			select: u.select ? `${u.select.by}-${u.select.field}` : undefined,
			confidence: Math.round(u.decision.confidence * 100) / 100,
			provider: u.decision.provider,
			ms: Math.round(u.ms * 10) / 10,
			fallbackReason: u.decision.fallbackReason,
		}
		const failures: string[] = []
		if (c.dest && got.dest !== c.dest) failures.push(`dest ${got.dest} != ${c.dest}`)
		if (c.intent && got.intent !== c.intent) failures.push(`intent ${got.intent} != ${c.intent}`)
		if (c.route && got.route !== c.route) failures.push(`route ${got.route} != ${c.route}`)
		if (c.select && got.select !== c.select) failures.push(`select ${got.select} != ${c.select}`)
		if (c.dest && !c.route && got.route !== 'replay') failures.push(`route ${got.route} != replay`)
		rows.push({ case: c, ok: failures.length === 0, failures, got })
	}
	const byField: EvalSummary['byField'] = {}
	for (const f of ['dest', 'intent', 'route', 'select'] as const) {
		const checked = rows.filter((r) => r.case[f])
		byField[f] = { checked: checked.length, correct: checked.filter((r) => !r.failures.some((x) => x.startsWith(f))).length }
	}
	const byLang: EvalSummary['byLang'] = {}
	for (const r of rows) {
		const l = /[؀-ۿ]/.test(r.case.say) ? 'ar' : 'en'
		byLang[l] = byLang[l] || { total: 0, passed: 0 }
		byLang[l].total++
		if (r.ok) byLang[l].passed++
	}
	const ms = rows.map((r) => r.got.ms).sort((a, b) => a - b)
	const q = (p: number) => ms[Math.min(ms.length - 1, Math.floor(p * ms.length))] || 0
	const providers: Record<string, number> = {}
	for (const r of rows) providers[r.got.provider] = (providers[r.got.provider] || 0) + 1
	const passed = rows.filter((r) => r.ok).length
	return { total: rows.length, passed, accuracy: rows.length ? passed / rows.length : 0, byField, byLang, latency: { p50: q(0.5), p95: q(0.95), max: ms.at(-1) || 0 }, providers, rows }
}
