import assert from 'node:assert/strict'
import { createECDH, createPublicKey, randomBytes, verify } from 'node:crypto'
import http from 'node:http'
import { test } from 'node:test'

import { decryptPayload, encryptPayload, generateVapidKeys, sendPush, vapidHeader } from '#services/watch/webpush.ts'

function browserSubscription() {
	const ua = createECDH('prime256v1')
	ua.generateKeys()
	const auth = randomBytes(16).toString('base64url')
	return { ua, keys: { p256dh: ua.getPublicKey().toString('base64url'), auth } }
}

test('aes128gcm payloads decrypt with the browser key (RFC 8291 round trip)', () => {
	const { ua, keys } = browserSubscription()
	const msg = Buffer.from(JSON.stringify({ title: 'اتغير: عرض نهاية الأسبوع', body: 'Triple data' }))
	const record = encryptPayload(msg, keys.p256dh, keys.auth)
	assert.equal(record.readUInt32BE(16), 4096, 'record size')
	assert.equal(record[20], 65, 'key id is the 65-byte server public key')
	assert.deepEqual(decryptPayload(record, ua, keys.auth), msg)
	assert.throws(() => decryptPayload(record, ua, randomBytes(16).toString('base64url')), 'wrong auth secret must fail')
})

test('the VAPID token is a valid ES256 JWT for the push service origin', () => {
	const keys = generateVapidKeys()
	const h = vapidHeader('https://push.example.net/send/abc', keys, 'mailto:ops@example.invalid')
	const m = /^vapid t=([\w-]+)\.([\w-]+)\.([\w-]+), k=([\w-]+)$/.exec(h)
	assert.ok(m, h)
	const claims = JSON.parse(Buffer.from(m[2], 'base64url').toString())
	assert.equal(claims.aud, 'https://push.example.net')
	assert.equal(claims.sub, 'mailto:ops@example.invalid')
	assert.ok(claims.exp > Date.now() / 1000)
	const pub = Buffer.from(m[4], 'base64url')
	const key = createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: pub.subarray(1, 33).toString('base64url'), y: pub.subarray(33).toString('base64url') }, format: 'jwk' })
	assert.ok(verify('sha256', Buffer.from(`${m[1]}.${m[2]}`), { key, dsaEncoding: 'ieee-p1363' }, Buffer.from(m[3], 'base64url')))
})

test('sendPush posts an encrypted record a push service accepts, and reports gone subscriptions', async () => {
	const { ua, keys } = browserSubscription()
	let got: { headers: http.IncomingHttpHeaders; body: Buffer } | undefined
	let status = 201
	const server = http.createServer(async (req, res) => {
		const chunks: Buffer[] = []
		for await (const c of req) chunks.push(c as Buffer)
		got = { headers: req.headers, body: Buffer.concat(chunks) }
		res.writeHead(status)
		res.end()
	})
	await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
	const endpoint = `http://127.0.0.1:${(server.address() as any).port}/push/xyz`
	const vapid = { keys: generateVapidKeys(), subject: 'mailto:ops@example.invalid' }
	try {
		const r = await sendPush({ endpoint, keys }, { title: 'Changed: Weekend offer' }, vapid, { ttlSec: 60, urgency: 'high' })
		assert.equal(r.ok, true)
		assert.equal(got!.headers['content-encoding'], 'aes128gcm')
		assert.equal(got!.headers.ttl, '60')
		assert.match(String(got!.headers.authorization), /^vapid t=/)
		assert.deepEqual(JSON.parse(decryptPayload(got!.body, ua, keys.auth).toString()), { title: 'Changed: Weekend offer' })
		status = 410
		assert.equal((await sendPush({ endpoint, keys }, {}, vapid)).gone, true)
	} finally {
		server.close()
	}
})
