/** Gateway client. Every call carries the site key and a W3C traceparent. */

export class ApiError extends Error {
	readonly status: number
	readonly code: string
	constructor(status: number, message: string, code: string) {
		super(message)
		this.status = status
		this.code = code
	}
}

const hex = (n: number) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, '0')).join('')

export class Api {
	readonly base: string
	readonly siteKey: string
	constructor(base: string, siteKey: string) {
		this.base = base.replace(/\/$/, '')
		this.siteKey = siteKey
	}

	async post<T = any>(path: string, body: unknown, opts: { keepalive?: boolean; signal?: AbortSignal } = {}): Promise<T> {
		const res = await fetch(`${this.base}${path}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', 'x-vg-site-key': this.siteKey, traceparent: `00-${hex(16)}-${hex(8)}-01` },
			body: JSON.stringify(body),
			keepalive: opts.keepalive,
			signal: opts.signal,
		})
		const json = await res.json().catch(() => ({}))
		if (!res.ok) throw new ApiError(res.status, json.error || res.statusText, json.code || 'error')
		return json as T
	}

	async get<T = any>(path: string): Promise<T> {
		const res = await fetch(`${this.base}${path}`, { headers: { 'x-vg-site-key': this.siteKey } })
		const json = await res.json().catch(() => ({}))
		if (!res.ok) throw new ApiError(res.status, json.error || res.statusText, json.code || 'error')
		return json as T
	}

	events(sessionId: string): EventSource {
		return new EventSource(`${this.base}/v1/events?session=${encodeURIComponent(sessionId)}&k=${encodeURIComponent(this.siteKey)}`)
	}
}
