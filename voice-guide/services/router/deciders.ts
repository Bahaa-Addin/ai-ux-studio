/**
 * Decision model adapters (ADR-0014). Jev (hosted) and Laya (self-hosted)
 * share the same "System One" HTTP API: POST {base}/v1/systemone with a JSON
 * state and typed questions; each answer has a choice, per-option
 * probabilities and a confidence. The local decider turns retrieval scores
 * into the same shape so the rest of the router never knows which ran.
 */

export interface ChoiceQuestion {
	instructions: string
	/** option key -> description; keys are short and opaque (d1, d2, none). */
	options: Record<string, string>
}

export interface ChoiceAnswer {
	choice: string
	probabilities: Record<string, number>
	confidence: number
}

export interface DecisionRequest {
	state: Record<string, unknown>
	questions: Record<string, ChoiceQuestion>
}

export interface DecisionResult {
	answers: Record<string, ChoiceAnswer>
	provider: string
	model?: string
	latencyMs: number
}

export interface Decider {
	readonly name: string
	decide(req: DecisionRequest, signal?: AbortSignal): Promise<DecisionResult>
}

export interface SystemOneOptions {
	name: 'jev' | 'laya'
	baseUrl: string
	apiKey?: string
	model?: string
	timeoutMs: number
	fetchImpl?: typeof fetch
}

/** Jev or Laya over HTTP. Throws on any failure; the router falls back to local. */
export class SystemOneDecider implements Decider {
	readonly name: string
	readonly #o: SystemOneOptions

	constructor(o: SystemOneOptions) {
		this.name = o.name
		this.#o = o
	}

	async decide(req: DecisionRequest, signal?: AbortSignal): Promise<DecisionResult> {
		const t0 = performance.now()
		const questions: Record<string, unknown> = {}
		for (const [k, q] of Object.entries(req.questions)) questions[k] = { type: 'choice', instructions: q.instructions, criteria: q.options }
		const res = await (this.#o.fetchImpl || fetch)(`${this.#o.baseUrl.replace(/\/$/, '')}/v1/systemone`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', ...(this.#o.apiKey ? { Authorization: `Bearer ${this.#o.apiKey}` } : {}) },
			body: JSON.stringify({ ...(this.#o.model ? { model: this.#o.model } : {}), state: req.state, questions }),
			signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(this.#o.timeoutMs)]) : AbortSignal.timeout(this.#o.timeoutMs),
		})
		if (!res.ok) throw new Error(`${this.name} ${res.status}: ${(await res.text()).slice(0, 200)}`)
		const body = (await res.json()) as { answers?: Record<string, any>; model?: string }
		const answers: Record<string, ChoiceAnswer> = {}
		for (const k of Object.keys(req.questions)) {
			const a = body.answers?.[k]
			if (!a || typeof a.choice !== 'string') continue // a missing answer is the caller's call
			const probabilities: Record<string, number> = a.probabilities || {}
			const confidence = typeof a.confidence === 'number' ? a.confidence : (probabilities[a.choice] ?? 0)
			answers[k] = { choice: a.choice, probabilities, confidence }
		}
		return { answers, provider: this.name, model: body.model, latencyMs: performance.now() - t0 }
	}
}

/**
 * Turns retrieval scores into a choice with calibrated-looking confidence:
 * a softmax over the candidates' scores, scaled by how well the best one
 * matched in absolute terms (so a "best of bad options" stays low).
 */
export function localChoice(scores: { key: string; score: number; absolute: number }[], temperature = 0.08): ChoiceAnswer {
	if (!scores.length) return { choice: 'none', probabilities: { none: 1 }, confidence: 1 }
	const max = Math.max(...scores.map((s) => s.score))
	const exps = scores.map((s) => Math.exp((s.score - max) / temperature))
	const sum = exps.reduce((a, b) => a + b, 0)
	const probabilities: Record<string, number> = {}
	scores.forEach((s, i) => (probabilities[s.key] = exps[i] / sum))
	const best = scores.reduce((a, b) => (b.score > a.score ? b : a))
	// Coverage below half the query means most of what was asked is not on the site.
	const confidence = probabilities[best.key] * Math.min(1, Math.max(0, best.absolute) ** 0.75)
	return { choice: best.key, probabilities, confidence }
}

/** Opens or closes after repeated failures so a slow provider cannot stall every turn. */
export class CircuitBreaker {
	#failures: number[] = []
	#openUntil = 0
	readonly maxFailures: number
	readonly windowMs: number
	readonly cooldownMs: number
	constructor(maxFailures = 3, windowMs = 30_000, cooldownMs = 60_000) {
		this.maxFailures = maxFailures
		this.windowMs = windowMs
		this.cooldownMs = cooldownMs
	}
	get open(): boolean {
		return Date.now() < this.#openUntil
	}
	success() {
		this.#failures = []
	}
	failure() {
		const now = Date.now()
		this.#failures = [...this.#failures.filter((t) => now - t < this.windowMs), now]
		if (this.#failures.length >= this.maxFailures) this.#openUntil = now + this.cooldownMs
	}
}
