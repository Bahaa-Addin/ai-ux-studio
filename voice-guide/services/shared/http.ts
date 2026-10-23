/** Tiny HTTP helpers on node:http (ADR-0007: no framework). */
import type http from 'node:http'

export class HttpError extends Error {
	readonly status: number
	readonly code: string
	constructor(status: number, message: string, code = 'error') {
		super(message)
		this.status = status
		this.code = code
	}
}

export async function readJson<T = any>(req: http.IncomingMessage, limitBytes = 256 * 1024): Promise<T> {
	const chunks: Buffer[] = []
	let size = 0
	for await (const c of req) {
		size += (c as Buffer).length
		if (size > limitBytes) throw new HttpError(413, 'request body too large', 'too_large')
		chunks.push(c as Buffer)
	}
	if (!size) return {} as T
	try {
		return JSON.parse(Buffer.concat(chunks).toString('utf8'))
	} catch {
		throw new HttpError(400, 'invalid JSON', 'bad_json')
	}
}

export function sendJson(res: http.ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
	if (res.headersSent) return
	const data = JSON.stringify(body)
	res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers })
	res.end(data)
}

export type Handler = (req: http.IncomingMessage, res: http.ServerResponse, params: Record<string, string>, url: URL) => Promise<void> | void

/** Method + path routing with :params. */
export class Router {
	#routes: { method: string; re: RegExp; keys: string[]; handler: Handler }[] = []

	on(method: string, path: string, handler: Handler): this {
		const keys: string[] = []
		const re = new RegExp(
			'^' +
				path.replace(/:(\w+)/g, (_, k) => {
					keys.push(k)
					return '([^/]+)'
				}) +
				'$',
		)
		this.#routes.push({ method, re, keys, handler })
		return this
	}

	match(method: string, pathname: string): { handler: Handler; params: Record<string, string> } | null {
		for (const r of this.#routes) {
			if (r.method !== method) continue
			const m = r.re.exec(pathname)
			if (m) return { handler: r.handler, params: Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])])) }
		}
		return null
	}
}

export function clientIp(req: http.IncomingMessage): string {
	const fwd = req.headers['x-forwarded-for']
	if (typeof fwd === 'string' && fwd) return fwd.split(',')[0].trim()
	return req.socket.remoteAddress || 'unknown'
}
