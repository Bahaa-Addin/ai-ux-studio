/** Tiny HTTP helpers on node:http (ADR-0007: no framework). */
import crypto from 'node:crypto'
import type http from 'node:http'
import net from 'node:net'

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

/** The raw body, up to a limit (an audio clip for speech-to-text). */
export async function readBody(req: http.IncomingMessage, limitBytes: number): Promise<Buffer> {
	const chunks: Buffer[] = []
	let size = 0
	for await (const c of req) {
		size += (c as Buffer).length
		if (size > limitBytes) throw new HttpError(413, 'request body too large', 'too_large')
		chunks.push(c as Buffer)
	}
	return Buffer.concat(chunks)
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

export function clientIp(req: http.IncomingMessage, trustedHeader: string | undefined = process.env.VG_CLIENT_IP_HEADER?.toLowerCase()): string {
	// Behind a public proxy only its own header counts: anyone can send X-Forwarded-For (ADR-0053 §2).
	if (trustedHeader === 'x-forwarded-for') {
		// Cloud Run's front end appends the caller's address as the last entry; a visitor can only write
		// entries in front of it, so the last non-empty one is the key (ADR-0066 §2).
		const v = req.headers['x-forwarded-for']
		const last = typeof v === 'string' ? v.split(',').map((x) => x.trim()).filter(Boolean).at(-1) : undefined
		return addressKey(last || req.socket.remoteAddress || 'unknown')
	}
	if (trustedHeader) {
		const v = req.headers[trustedHeader]
		return addressKey((typeof v === 'string' && v.trim()) || req.socket.remoteAddress || 'unknown')
	}
	const fwd = req.headers['x-forwarded-for']
	if (typeof fwd === 'string' && fwd) return addressKey(fwd.split(',')[0].trim())
	return addressKey(req.socket.remoteAddress || 'unknown')
}

/**
 * The rate-limit key of an address (ADR-0067). An IPv6 address counts by its /64 network, since one
 * visitor usually holds a whole /64 and could otherwise take a fresh limit from each address in it.
 * Exceptions, after the address is written out in full: an IPv4-mapped address (::ffff:0:0/96, in any
 * form) and a NAT64 address (64:ff9b::/96) count as their IPv4 address, and a Teredo address
 * (2001:0::/32, whose low 64 bits are the client's) counts whole. IPv4, and anything that is not a valid
 * address, as given.
 */
export function addressKey(address: string): string {
	const given = address.trim()
	const a = given.replace(/^\[|\]$/g, '').replace(/%.*$/, '').toLowerCase()
	if (!net.isIPv6(a)) return given
	const groups = expandIPv6(a)
	const v4 = () => `${groups[6] >> 8}.${groups[6] & 255}.${groups[7] >> 8}.${groups[7] & 255}`
	if (groups.slice(0, 5).every((g) => g === 0) && groups[5] === 0xffff) return v4()
	if (groups[0] === 0x64 && groups[1] === 0xff9b && groups.slice(2, 6).every((g) => g === 0)) return v4()
	if (groups[0] === 0x2001 && groups[1] === 0) return groups.map((g) => g.toString(16)).join(':')
	return `${groups.slice(0, 4).map((g) => g.toString(16)).join(':')}::/64`
}

/** The eight 16-bit groups of a valid IPv6 address (net.isIPv6), a dotted IPv4 tail included. */
function expandIPv6(a: string): number[] {
	const dotted = /(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(a)
	const hex = dotted ? `${a.slice(0, dotted.index)}${((+dotted[1] << 8) | +dotted[2]).toString(16)}:${((+dotted[3] << 8) | +dotted[4]).toString(16)}` : a
	const [head, tail] = hex.includes('::') ? hex.split('::') : [hex, undefined]
	const part = (s: string | undefined) => (s ? s.split(':').map((g) => parseInt(g, 16)) : [])
	const h = part(head)
	const t = part(tail)
	return tail === undefined ? h : [...h, ...Array.from({ length: 8 - h.length - t.length }, () => 0), ...t]
}

/** Whether the trusted client-address header reached the gateway on this request (for /health; never its value). */
export function trustedHeaderPresent(req: http.IncomingMessage, trustedHeader: string | undefined): boolean {
	const v = trustedHeader ? req.headers[trustedHeader] : undefined
	return typeof v === 'string' && v.trim() !== ''
}

/** Salted once per process: a fingerprint means nothing outside this process and cannot be reversed to an address. */
const FINGERPRINT_SALT = crypto.randomBytes(16)

/**
 * A random id of this process, shown on /health beside the client key: two client keys compare only when
 * both runs show the same boot id, since a restart (Render's sleep, a deploy) makes a new salt (ADR-0067).
 */
export const PROCESS_BOOT_ID = crypto.randomBytes(4).toString('hex')

/**
 * A short fingerprint of a rate-limit key, for /health (ADR-0067): the same caller gets the same one,
 * another network another one, and the address is never shown. gateway:check prints it, so two runs
 * from two networks show whether visitors really get keys of their own.
 */
export function clientKeyFingerprint(key: string): string {
	return crypto.createHash('sha256').update(FINGERPRINT_SALT).update(key).digest('hex').slice(0, 8)
}
