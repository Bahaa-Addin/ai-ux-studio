/**
 * The service seam (ADR-0009). A service is a map of named handlers. The
 * gateway reaches it through a client that either calls the handler in
 * process or POSTs to {url}/rpc/{method}. Same code either way.
 */
import http from 'node:http'

import { HttpError, readJson, sendJson } from './http.ts'
import { log } from './log.ts'
import type { TraceContext } from './trace.ts'
import { parseTraceparent, traceparent } from './trace.ts'

export interface RpcContext {
	trace: TraceContext
}

export type Handlers = Record<string, (input: any, ctx: RpcContext) => Promise<any>>

export type Client<H extends Handlers> = {
	[K in keyof H]: (input: Parameters<H[K]>[0], ctx: RpcContext) => ReturnType<H[K]>
}

/**
 * In-process binding. Inputs and outputs go through JSON exactly as they would
 * over HTTP, so anything that does not survive the wire (undefined, Dates,
 * shared object references) fails in development, not in the scaled pilot.
 */
export function localClient<H extends Handlers>(handlers: H): Client<H> {
	const wire = <T>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)))
	return new Proxy({} as Client<H>, {
		get(_t, method: string) {
			const h = handlers[method]
			if (typeof h !== 'function') return undefined
			return async (input: unknown, ctx: RpcContext) => wire(await h(wire(input), ctx))
		},
	})
}

export function httpClient<H extends Handlers>(baseUrl: string, timeoutMs: number): Client<H> {
	return new Proxy({} as Client<H>, {
		get(_t, method: string) {
			return async (input: unknown, ctx: RpcContext) => {
				const res = await fetch(`${baseUrl.replace(/\/$/, '')}/rpc/${method}`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						traceparent: traceparent(ctx.trace),
						'x-vg-trace': JSON.stringify({ siteId: ctx.trace.siteId, sessionId: ctx.trace.sessionId, turnId: ctx.trace.turnId }),
					},
					body: JSON.stringify(input ?? {}),
					signal: AbortSignal.timeout(timeoutMs),
				})
				const body = (await res.json().catch(() => ({}))) as any
				if (!res.ok) throw new HttpError(res.status, body?.error || `rpc ${method} failed`, body?.code || 'rpc_error')
				return body
			}
		},
	})
}

/** Standalone HTTP server for a service (services/<name>/main.ts). */
export function serveRpc(name: string, handlers: Handlers, port: number): Promise<http.Server> {
	const server = http.createServer(async (req, res) => {
		const url = new URL(req.url || '/', 'http://local')
		if (req.method === 'GET' && url.pathname === '/health') return sendJson(res, 200, { ok: true, service: name })
		const m = /^\/rpc\/(\w+)$/.exec(url.pathname)
		if (req.method !== 'POST' || !m || !handlers[m[1]]) return sendJson(res, 404, { error: 'not found' })
		try {
			const input = await readJson(req, 4 * 1024 * 1024)
			const p = parseTraceparent(req.headers.traceparent as string | undefined)
			const extra = JSON.parse((req.headers['x-vg-trace'] as string) || '{}')
			const trace: TraceContext = { traceId: p?.traceId || '0'.repeat(32), spanId: p?.spanId || '0'.repeat(16), siteId: extra.siteId || '', sessionId: extra.sessionId || '', turnId: extra.turnId }
			const out = await handlers[m[1]](input, { trace })
			sendJson(res, 200, out ?? {})
		} catch (e) {
			const err = e as HttpError
			log(err.status && err.status < 500 ? 'warn' : 'error', `${name}.${m[1]} failed`, { error: err.message })
			sendJson(res, err.status || 500, { error: err.message, code: err.code || 'error' })
		}
	})
	return new Promise((resolve) => server.listen(port, () => resolve(server)))
}
