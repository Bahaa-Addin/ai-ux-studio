import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

/** Random URL-safe id with a readable prefix, e.g. ses_3k9f... (128 bits). */
export function newId(prefix: string, bytes = 16): string {
	return `${prefix}_${randomBytes(bytes).toString('base64url')}`
}

/** 16-byte W3C trace id and 8-byte span id, as lowercase hex. */
export function newTraceId(): string {
	return randomBytes(16).toString('hex')
}
export function newSpanId(): string {
	return randomBytes(8).toString('hex')
}

/**
 * Short-lived signed tokens (ADR-0022): `<payload base64url>.<hmac>`.
 * Used for the agent proxy so only a live session can spend LLM budget.
 */
export function signToken(payload: Record<string, unknown>, secret: string, ttlSec: number): string {
	const body = Buffer.from(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + ttlSec })).toString('base64url')
	const mac = createHmac('sha256', secret).update(body).digest('base64url')
	return `${body}.${mac}`
}

export function verifyToken<T extends Record<string, unknown>>(token: string | undefined, secret: string): (T & { exp: number }) | null {
	if (!token) return null
	const [body, mac] = token.split('.')
	if (!body || !mac) return null
	const expected = createHmac('sha256', secret).update(body).digest()
	const got = Buffer.from(mac, 'base64url')
	if (got.length !== expected.length || !timingSafeEqual(got, expected)) return null
	try {
		const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
		if (typeof payload.exp !== 'number' || payload.exp < Date.now() / 1000) return null
		return payload
	} catch {
		return null
	}
}
