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

	/**
	 * Live events (trace and notify). Server-sent events by default; long polling when asked, or
	 * when the stream cannot open (a proxy that buffers, a request router that cannot stream).
	 */
	events(sessionId: string, on: (kind: 'trace' | 'notify', data: any) => void, mode: 'auto' | 'poll' = 'auto'): { close(): void } {
		let closed = false
		let since = 0
		const deliver = (ev: any) => {
			if ((ev.seq || 0) <= since) return
			since = ev.seq || since
			on(String(ev.name).startsWith('watch.changed') ? 'notify' : 'trace', ev)
		}
		const poll = async () => {
			while (!closed) {
				try {
					const r = await this.get<{ events: any[] }>(`/v1/events/poll?session=${encodeURIComponent(sessionId)}&since=${since}&wait=20`)
					for (const ev of r.events) deliver(ev)
				} catch {
					await new Promise((res) => setTimeout(res, 3000))
				}
			}
		}
		if (mode === 'poll' || typeof EventSource === 'undefined') {
			void poll()
			return { close: () => (closed = true) }
		}
		const es = new EventSource(`${this.base}/v1/events?session=${encodeURIComponent(sessionId)}&k=${encodeURIComponent(this.siteKey)}`)
		let opened = false
		es.addEventListener('open', () => (opened = true))
		for (const kind of ['trace', 'notify'] as const) es.addEventListener(kind, (e) => deliver(JSON.parse((e as MessageEvent).data)))
		const fallback = setTimeout(() => {
			if (!opened && !closed) {
				es.close()
				void poll()
			}
		}, 4000)
		return {
			close: () => {
				closed = true
				clearTimeout(fallback)
				es.close()
			},
		}
	}
}
