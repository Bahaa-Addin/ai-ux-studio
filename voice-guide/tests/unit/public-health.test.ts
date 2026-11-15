/**
 * The real GET /health of a public gateway (ADR-0067), on the memory store and a free port: it says
 * whether the trusted client-address header arrived (`clientHeader`), gives a salted fingerprint of the
 * caller's rate-limit key (`clientKey`) and the process's `boot` id, and never an address.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import type { AddressInfo } from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'

import { createServices } from '#services/index.ts'
import { createGateway } from '#services/gateway/server.ts'
import { loadPlatformConfig } from '#shared/config.ts'
import { MemoryStore } from '#shared/store/index.ts'

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vg-health-'))
let gateway: ReturnType<typeof createGateway>
let services: Awaited<ReturnType<typeof createServices>>
let base = ''

before(async () => {
	const platform = loadPlatformConfig({ VG_STORE: 'memory', VG_CLIENT_IP_HEADER: 'cf-connecting-ip', VG_DATA_DIR: tmp } as unknown as NodeJS.ProcessEnv)
	services = await createServices({ platform, store: new MemoryStore() })
	gateway = createGateway({ services })
	await gateway.listen(0)
	base = `http://127.0.0.1:${(gateway.server.address() as AddressInfo).port}`
})

after(async () => {
	await gateway.close()
	await services.close()
	fs.rmSync(tmp, { recursive: true, force: true })
})

const health = async (headers: Record<string, string> = {}) => {
	const r = await fetch(`${base}/health`, { headers })
	const text = await r.text()
	return { status: r.status, text, body: JSON.parse(text) as { ok: boolean; clientHeader: boolean; clientKey: string; boot: string } }
}

test('/health: clientHeader says whether the trusted header arrived; clientKey follows the key; boot is the same; no address is shown', async () => {
	const a = await health({ 'cf-connecting-ip': '203.0.113.9' })
	assert.equal(a.status, 200)
	assert.equal(a.body.ok, true)
	assert.equal(a.body.clientHeader, true)
	assert.match(a.body.clientKey, /^[0-9a-f]{8}$/)
	assert.match(a.body.boot, /^[0-9a-f]{8}$/)
	assert.ok(!a.text.includes('203.0.113.9'), 'the address is never in the answer')

	const again = await health({ 'cf-connecting-ip': '203.0.113.9', 'x-forwarded-for': '6.6.6.6' })
	assert.equal(again.body.clientKey, a.body.clientKey, 'the same caller, the same key, whatever X-Forwarded-For says')
	assert.equal(again.body.boot, a.body.boot)

	const other = await health({ 'cf-connecting-ip': '198.51.100.20' })
	assert.notEqual(other.body.clientKey, a.body.clientKey, 'another caller, another key')

	const sameNet = await health({ 'cf-connecting-ip': '2001:db8:1:2::1' })
	const sameNet2 = await health({ 'cf-connecting-ip': '2001:db8:1:2::ffff' })
	assert.equal(sameNet2.body.clientKey, sameNet.body.clientKey, 'one IPv6 /64, one key: the limiters key the same way')

	const none = await health()
	assert.equal(none.body.clientHeader, false, 'no trusted header: false (the key is then the socket address)')
})
