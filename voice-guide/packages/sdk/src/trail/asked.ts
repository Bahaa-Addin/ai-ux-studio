/**
 * What questions were about (ADR-0050 §5; SPEC-06): the trail watches the guide's turns and keeps, from
 * the plan's `meta` of each answered one, the destination it resolved, its page, the intent and a
 * price-free label. The words said or typed and the answer (live answers carry prices) are passed
 * through untouched and never read, kept or sent: only `plan.meta` and `plan.lang` are looked at.
 */
import { TRAIL_CONFIG } from './config.ts'
import { type AskedQuestion, cleanAsked, type TrailStepSummary } from './types.ts'

export type AskOrigin = AskedQuestion['origin']

interface Turns {
	api: { post(path: string, body: unknown, o?: { keepalive?: boolean }): Promise<any> }
	request(utterance: string, source: AskOrigin, ...rest: any[]): Promise<void>
}

const s = (v: unknown, max: number): string | undefined => (typeof v === 'string' && v ? v.slice(0, max) : undefined)
// A second check on the server's label (ADR-0050 §5): a number with a currency or a percentage, and it is dropped.
const PRICED = /[%٪]|[0-9٠-٩][0-9٠-٩.,٬٫]*\s*(?:egp|l\.?e\b|£|جني|ج\.?\s?م|ج(?![\p{L}]))|(?:egp|\bl\.?e\.?|£|جنيه|ج\.?\s?م)\s*[0-9٠-٩]/iu

/** One asked question from an answered plan, or null when it resolved no destination. Reads `meta` and `lang` only. */
export function askedFrom(plan: unknown, origin: AskOrigin, at: number, id: string): AskedQuestion | null {
	const p = plan as { lang?: unknown; meta?: Record<string, unknown> } | null
	const m = p && typeof p.meta === 'object' ? p.meta : null
	const destinationId = s(m?.destinationId, 200)
	if (!m || !destinationId) return null
	const label = s(m.label, 60)
	const pageId = s(m.pageId, 200)
	return { id, at, lang: s(p!.lang, 10) || '', origin, destinationId, ...(pageId ? { pageId } : {}), intent: s(m.intent, 80) || '', route: s(m.route, 20) || 'none', ...(label && !PRICED.test(label) ? { label } : {}) }
}

/** Adds a question to the step: at most `maxAskedPerStep`, the oldest dropped. */
export function addAsked(step: TrailStepSummary, q: AskedQuestion): void {
	step.asked = cleanAsked([...(step.asked || []), q], TRAIL_CONFIG.storage.maxAskedPerStep)
}

/**
 * Wraps the guide's `request` (how it was asked) and its `api.post` (the `/v1/turn` answer) on the guide
 * object itself; `guide.ts` is not changed. `onPlan` gets the origin and the plan of each turn the server
 * answered during a request. Returns the unwrap.
 */
export function watchTurns(g: Turns, onPlan: (origin: AskOrigin, plan: unknown) => void): () => void {
	const request = g.request
	const post = g.api.post
	let origin: AskOrigin | null = null
	let n = 0
	const req: Turns['request'] = function (this: unknown, ...args) {
		const mine = ++n
		origin = args[1] === 'voice' || args[1] === 'typed' || args[1] === 'chip' ? args[1] : null
		const done = () => {
			if (n === mine) origin = null
		}
		const p = request.apply(g, args)
		p.then(done, done)
		return p
	}
	const send: Turns['api']['post'] = function (this: unknown, path, body, o) {
		const p = post.call(g.api, path, body, o)
		const from = origin
		if (path === '/v1/turn' && from)
			p.then(
				(res) => {
					try {
						onPlan(from, (res as { plan?: unknown } | null)?.plan)
					} catch (e) {
						console.warn('[voice-guide] trail asked', e)
					}
				},
				() => {},
			)
		return p
	}
	g.request = req
	g.api.post = send
	return () => {
		if (g.request === req) g.request = request
		if (g.api.post === send) g.api.post = post
	}
}

/** Every asked question of the journey, newest first, with the step it was asked on. */
export function allAsked(steps: TrailStepSummary[]): (AskedQuestion & { stepId: string })[] {
	return steps.flatMap((st) => (st.asked || []).map((q) => ({ ...q, stepId: st.id }))).sort((a, b) => b.at - a.at)
}
