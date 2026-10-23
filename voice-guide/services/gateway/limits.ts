/** Per-process token buckets (ADR-0022). Exact limits across replicas need Redis (ADR-0010). */
export class RateLimiter {
	#buckets = new Map<string, { tokens: number; at: number }>()
	readonly perMinute: number
	readonly burst: number

	constructor(perMinute: number, burst: number) {
		this.perMinute = perMinute
		this.burst = burst
	}

	/** True when the call is allowed. */
	take(key: string, cost = 1): boolean {
		const now = Date.now()
		const b = this.#buckets.get(key) || { tokens: this.burst, at: now }
		b.tokens = Math.min(this.burst, b.tokens + ((now - b.at) / 60_000) * this.perMinute)
		b.at = now
		const ok = b.tokens >= cost
		if (ok) b.tokens -= cost
		this.#buckets.set(key, b)
		if (this.#buckets.size > 50_000) this.#buckets.clear()
		return ok
	}
}

/** Rolling counters and latencies for /metrics. */
export class Metrics {
	counters: Record<string, number> = {}
	#lat: Record<string, number[]> = {}

	inc(name: string, by = 1) {
		this.counters[name] = (this.counters[name] || 0) + by
	}

	observe(name: string, ms: number) {
		const a = (this.#lat[name] ||= [])
		a.push(ms)
		if (a.length > 1000) a.shift()
	}

	snapshot() {
		const q = (a: number[], p: number) => {
			const s = [...a].sort((x, y) => x - y)
			return s.length ? Math.round(s[Math.min(s.length - 1, Math.floor(p * s.length))] * 10) / 10 : 0
		}
		return {
			counters: this.counters,
			latencyMs: Object.fromEntries(Object.entries(this.#lat).map(([k, a]) => [k, { n: a.length, p50: q(a, 0.5), p95: q(a, 0.95), max: q(a, 1) }])),
		}
	}
}
