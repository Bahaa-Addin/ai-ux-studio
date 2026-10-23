/**
 * Web Push on Node built-ins (ADR-0023, ADR-0008): VAPID (RFC 8292) and
 * aes128gcm payload encryption (RFC 8188, RFC 8291). No dependency.
 */
import { createCipheriv, createDecipheriv, createECDH, createPrivateKey, generateKeyPairSync, hkdfSync, randomBytes, sign } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const b64u = (b: Buffer | Uint8Array) => Buffer.from(b).toString('base64url')
const fromB64u = (s: string) => Buffer.from(s, 'base64url')

export interface VapidKeys {
	publicKey: string // uncompressed P-256 point, base64url (65 bytes)
	privateKey: string // raw scalar, base64url (32 bytes)
}

export function generateVapidKeys(): VapidKeys {
	const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
	const jwk = privateKey.export({ format: 'jwk' }) as { x: string; y: string; d: string }
	void publicKey
	const pub = Buffer.concat([Buffer.from([4]), fromB64u(jwk.x), fromB64u(jwk.y)])
	return { publicKey: b64u(pub), privateKey: jwk.d }
}

/** Keys from VG_VAPID_PUBLIC_KEY/PRIVATE_KEY, else from (or into) the key file. */
export function loadVapidKeys(file: string, env: NodeJS.ProcessEnv = process.env): VapidKeys {
	if (env.VG_VAPID_PUBLIC_KEY && env.VG_VAPID_PRIVATE_KEY) return { publicKey: env.VG_VAPID_PUBLIC_KEY, privateKey: env.VG_VAPID_PRIVATE_KEY }
	if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'))
	const keys = generateVapidKeys()
	fs.mkdirSync(path.dirname(file), { recursive: true })
	fs.writeFileSync(file, JSON.stringify(keys, null, 1), { mode: 0o600 })
	return keys
}

/** `Authorization: vapid t=<jwt>, k=<public key>` for one push service origin. */
export function vapidHeader(endpoint: string, keys: VapidKeys, subject: string, ttlSec = 12 * 3600): string {
	const aud = new URL(endpoint).origin
	const header = b64u(Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
	const claims = b64u(Buffer.from(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + ttlSec, sub: subject })))
	const pub = fromB64u(keys.publicKey)
	const key = createPrivateKey({
		key: { kty: 'EC', crv: 'P-256', d: keys.privateKey, x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)) },
		format: 'jwk',
	})
	const sig = sign('sha256', Buffer.from(`${header}.${claims}`), { key, dsaEncoding: 'ieee-p1363' })
	return `vapid t=${header}.${claims}.${b64u(sig)}, k=${keys.publicKey}`
}

/** RFC 8291 encryption of one payload for one subscription. */
export function encryptPayload(payload: Buffer, p256dh: string, auth: string, opts: { salt?: Buffer; serverKey?: ReturnType<typeof createECDH> } = {}): Buffer {
	const uaPublic = fromB64u(p256dh)
	const authSecret = fromB64u(auth)
	const server = opts.serverKey || createECDH('prime256v1')
	if (!opts.serverKey) server.generateKeys()
	const asPublic = server.getPublicKey()
	const ecdhSecret = server.computeSecret(uaPublic)
	const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic])
	const ikm = Buffer.from(hkdfSync('sha256', ecdhSecret, authSecret, keyInfo, 32))
	const salt = opts.salt || randomBytes(16)
	const cek = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16))
	const nonce = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12))
	const cipher = createCipheriv('aes-128-gcm', cek, nonce)
	const body = Buffer.concat([cipher.update(Buffer.concat([payload, Buffer.from([2])])), cipher.final(), cipher.getAuthTag()])
	const rs = Buffer.alloc(4)
	rs.writeUInt32BE(4096)
	return Buffer.concat([salt, rs, Buffer.from([asPublic.length]), asPublic, body])
}

/** Inverse of encryptPayload, as a browser would do it. Used by tests. */
export function decryptPayload(record: Buffer, uaPrivate: ReturnType<typeof createECDH>, auth: string): Buffer {
	const salt = record.subarray(0, 16)
	const idlen = record[20]
	const asPublic = record.subarray(21, 21 + idlen)
	const ciphertext = record.subarray(21 + idlen)
	const ecdhSecret = uaPrivate.computeSecret(asPublic)
	const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), uaPrivate.getPublicKey(), asPublic])
	const ikm = Buffer.from(hkdfSync('sha256', ecdhSecret, fromB64u(auth), keyInfo, 32))
	const cek = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16))
	const nonce = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12))
	const d = createDecipheriv('aes-128-gcm', cek, nonce)
	d.setAuthTag(ciphertext.subarray(ciphertext.length - 16))
	const plain = Buffer.concat([d.update(ciphertext.subarray(0, ciphertext.length - 16)), d.final()])
	let end = plain.length - 1
	while (end >= 0 && plain[end] === 0) end--
	return plain.subarray(0, end) // drop the 0x02 delimiter and padding
}

export interface PushResult {
	ok: boolean
	status: number
	/** The subscription is gone (404/410): delete it. */
	gone: boolean
}

export async function sendPush(
	sub: { endpoint: string; keys: { p256dh: string; auth: string } },
	payload: unknown,
	vapid: { keys: VapidKeys; subject: string },
	opts: { ttlSec?: number; urgency?: 'very-low' | 'low' | 'normal' | 'high'; fetchImpl?: typeof fetch } = {},
): Promise<PushResult> {
	const body = encryptPayload(Buffer.from(JSON.stringify(payload)), sub.keys.p256dh, sub.keys.auth)
	const res = await (opts.fetchImpl || fetch)(sub.endpoint, {
		method: 'POST',
		headers: {
			'Content-Encoding': 'aes128gcm',
			'Content-Type': 'application/octet-stream',
			TTL: String(opts.ttlSec ?? 24 * 3600),
			Urgency: opts.urgency || 'normal',
			Authorization: vapidHeader(sub.endpoint, vapid.keys, vapid.subject),
		},
		body: new Uint8Array(body),
		signal: AbortSignal.timeout(10_000),
	})
	await res.arrayBuffer().catch(() => undefined)
	return { ok: res.status >= 200 && res.status < 300, status: res.status, gone: res.status === 404 || res.status === 410 }
}
