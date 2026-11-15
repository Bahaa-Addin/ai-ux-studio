/**
 * A public gateway (ADR-0053 §2) refuses to start with settings that are wrong for strangers on the
 * internet: the dev secret, no admin token, the testing agent preset, a forgeable client address,
 * plain http. A trusted proxy header names the client for the rate limits.
 */
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import type http from 'node:http'
import { test } from 'node:test'

import { checkPublicConfig, loadPlatformConfig } from '#shared/config.ts'
import { addressKey, clientIp, clientKeyFingerprint, trustedHeaderPresent } from '#shared/http.ts'

const GOOD = {
	VG_PUBLIC: 'on',
	VG_PUBLIC_URL: 'https://guide.example.com',
	VG_SECRET: 'x'.repeat(40),
	VG_ADMIN_TOKEN: 'y'.repeat(30),
	VG_CLIENT_IP_HEADER: 'Fly-Client-IP',
	VG_LLM_PROVIDER: 'anthropic',
	ANTHROPIC_API_KEY: 'sk',
}

test('a well-configured public gateway starts', () => {
	const env = GOOD as unknown as NodeJS.ProcessEnv
	assert.deepEqual(checkPublicConfig(loadPlatformConfig(env), env), [])
})

test('each unsafe setting is named', () => {
	const cases: [Record<string, string | undefined>, RegExp][] = [
		[{ VG_PUBLIC_URL: 'http://guide.example.com' }, /https/],
		[{ VG_SECRET: undefined }, /VG_SECRET/],
		[{ VG_ADMIN_TOKEN: undefined }, /VG_ADMIN_TOKEN/],
		[{ VG_CLIENT_IP_HEADER: undefined }, /VG_CLIENT_IP_HEADER/],
		[{ VG_LLM_PROVIDER: undefined, VG_LLM_PRESET: 'page-agent-testing' }, /technical evaluation only/],
		[{ ANTHROPIC_API_KEY: undefined }, /ANTHROPIC_API_KEY/],
		[{ VG_TRAIL_AGGREGATION: 'on' }, /AGGREGATION/],
	]
	for (const [over, re] of cases) {
		const env = { ...GOOD, ...over } as unknown as NodeJS.ProcessEnv
		for (const [k, v] of Object.entries(over)) if (v === undefined) delete (env as Record<string, unknown>)[k]
		const problems = checkPublicConfig(loadPlatformConfig(env), env)
		assert.ok(problems.some((p) => re.test(p)), `${JSON.stringify(over)} → ${problems.join(' | ')}`)
	}
})

test('not public: nothing is checked', () => {
	assert.deepEqual(checkPublicConfig(loadPlatformConfig({} as NodeJS.ProcessEnv), {} as NodeJS.ProcessEnv), [])
})

test("behind a trusted proxy only its header names the client; X-Forwarded-For can't forge it", () => {
	const req = { headers: { 'x-forwarded-for': '1.1.1.1', 'fly-client-ip': '2.2.2.2' }, socket: { remoteAddress: '10.0.0.1' } } as unknown as http.IncomingMessage
	assert.equal(clientIp(req, 'fly-client-ip'), '2.2.2.2')
	assert.equal(clientIp(req, undefined), '1.1.1.1', 'unchanged when no header is trusted (local runs)')
	const none = { headers: { 'x-forwarded-for': '1.1.1.1' }, socket: { remoteAddress: '10.0.0.1' } } as unknown as http.IncomingMessage
	assert.equal(clientIp(none, 'fly-client-ip'), '10.0.0.1')
})

test('on Cloud Run X-Forwarded-For counts from its last entry, the one the platform added; a forged prefix changes nothing', () => {
	const at = (xff: string | undefined) => ({ headers: xff === undefined ? {} : { 'x-forwarded-for': xff }, socket: { remoteAddress: '10.0.0.1' } }) as unknown as http.IncomingMessage
	assert.equal(clientIp(at('6.6.6.6, 7.7.7.7, 203.0.113.9'), 'x-forwarded-for'), '203.0.113.9')
	assert.equal(clientIp(at('1.2.3.4, 203.0.113.9'), 'x-forwarded-for'), clientIp(at('198.51.100.7,5.5.5.5, 203.0.113.9'), 'x-forwarded-for'), 'two forged prefixes, one key')
	assert.equal(clientIp(at('203.0.113.9'), 'x-forwarded-for'), '203.0.113.9')
	assert.equal(clientIp(at('  6.6.6.6 ,  203.0.113.9  '), 'x-forwarded-for'), '203.0.113.9', 'spaces trimmed')
	assert.equal(clientIp(at('6.6.6.6, 203.0.113.9, '), 'x-forwarded-for'), '203.0.113.9', 'the last non-empty entry')
	assert.equal(clientIp(at(undefined), 'x-forwarded-for'), '10.0.0.1', 'missing header: the socket')
	assert.equal(clientIp(at('   '), 'x-forwarded-for'), '10.0.0.1', 'blank header: the socket')
	assert.equal(clientIp(at(' , '), 'x-forwarded-for'), '10.0.0.1', 'only empty entries: the socket')
})

test('on Render the public address comes from RENDER_EXTERNAL_URL when VG_PUBLIC_URL is unset; VG_PUBLIC_URL wins (ADR-0067)', () => {
	const { VG_PUBLIC_URL: _unset, ...rest } = GOOD
	const render = { ...rest, RENDER_EXTERNAL_URL: 'https://vg-public-demo.onrender.com' } as unknown as NodeJS.ProcessEnv
	assert.equal(loadPlatformConfig(render).publicUrl, 'https://vg-public-demo.onrender.com')
	assert.deepEqual(checkPublicConfig(loadPlatformConfig(render), render), [])
	const both = { ...render, VG_PUBLIC_URL: 'https://guide.example.com' } as unknown as NodeJS.ProcessEnv
	assert.equal(loadPlatformConfig(both).publicUrl, 'https://guide.example.com')
	assert.equal(loadPlatformConfig({ VG_PORT: '8080' } as unknown as NodeJS.ProcessEnv).publicUrl, 'http://localhost:8080', 'neither: localhost')
})

test("on Render CF-Connecting-IP (Cloudflare's, the visitor's address) names the client; X-Forwarded-For is ignored; missing: the socket", () => {
	const at = (h: Record<string, string>) => ({ headers: h, socket: { remoteAddress: '10.0.0.1' } }) as unknown as http.IncomingMessage
	assert.equal(clientIp(at({ 'cf-connecting-ip': '203.0.113.9', 'x-forwarded-for': '6.6.6.6, 203.0.113.9, 172.68.1.1' }), 'cf-connecting-ip'), '203.0.113.9')
	assert.equal(clientIp(at({ 'cf-connecting-ip': '203.0.113.9', 'x-forwarded-for': '1.2.3.4' }), 'cf-connecting-ip'), clientIp(at({ 'cf-connecting-ip': '203.0.113.9', 'x-forwarded-for': '5.6.7.8' }), 'cf-connecting-ip'), 'a forged X-Forwarded-For changes nothing')
	assert.equal(clientIp(at({ 'x-forwarded-for': '6.6.6.6' }), 'cf-connecting-ip'), '10.0.0.1', 'missing: the socket')
	assert.equal(clientIp(at({ 'cf-connecting-ip': '  ' }), 'cf-connecting-ip'), '10.0.0.1', 'blank: the socket')
	assert.equal(clientIp(at({ 'cf-connecting-ip': '203.0.113.9' }), loadPlatformConfig({ VG_CLIENT_IP_HEADER: 'CF-Connecting-IP' } as unknown as NodeJS.ProcessEnv).clientIpHeader), '203.0.113.9', 'the setting is lower-cased')
})

test('an IPv6 visitor counts by their /64 network: rotating addresses inside it gives no fresh rate limit (ADR-0067)', () => {
	assert.equal(addressKey('2001:db8:1:2::1'), '2001:db8:1:2::/64')
	assert.equal(addressKey('2001:db8:1:2::64'), addressKey('2001:db8:1:2:ffff:ffff:ffff:ffff'), 'one /64, one key')
	assert.notEqual(addressKey('2001:db8:1:2::1'), addressKey('2001:db8:1:3::1'), 'another /64, another key')
	assert.equal(addressKey('2001:0DB8:0001:0002:0000:0000:0000:0001'), '2001:db8:1:2::/64', 'written out in full, any case')
	assert.equal(addressKey('[2001:db8:1:2::1]'), '2001:db8:1:2::/64', 'in brackets')
	assert.equal(addressKey('fe80::1%en0'), 'fe80:0:0:0::/64', 'with a zone')
	assert.equal(addressKey('::1'), '0:0:0:0::/64')
	assert.equal(addressKey('::ffff:203.0.113.9'), '203.0.113.9', 'IPv4-mapped: the IPv4 address')
	assert.equal(addressKey('::ffff:cb00:7109'), '203.0.113.9', 'IPv4-mapped written in hex')
	assert.equal(addressKey('0:0:0:0:0:ffff:203.0.113.9'), '203.0.113.9', 'IPv4-mapped written out')
	assert.equal(addressKey('64:ff9b::192.0.2.1'), '192.0.2.1', 'NAT64: the IPv4 address')
	assert.equal(addressKey('2001:db8:1:2::192.0.2.1'), '2001:db8:1:2::/64', 'a dotted tail is still in its /64')
	assert.equal(addressKey('2001:0:4136:e378:8000:63bf:3fff:fdd2'), '2001:0:4136:e378:8000:63bf:3fff:fdd2', 'Teredo: whole (the client is in the low 64 bits)')
	assert.equal(addressKey('1::2::3'), '1::2::3', 'not an address: as given')
	assert.equal(addressKey('203.0.113.9'), '203.0.113.9', 'IPv4 as it is')
	assert.equal(addressKey('not-an-address'), 'not-an-address', 'anything else as it is')
	const at = (v: string) => ({ headers: { 'cf-connecting-ip': v }, socket: { remoteAddress: '::ffff:10.0.0.1' } }) as unknown as http.IncomingMessage
	const keys = new Set(Array.from({ length: 100 }, (_, i) => clientIp(at(`2001:db8:1:2::${(i + 1).toString(16)}`), 'cf-connecting-ip')))
	assert.equal(keys.size, 1, '100 addresses of one /64 share one key')
	assert.equal(clientIp({ headers: {}, socket: { remoteAddress: '::ffff:10.0.0.1' } } as unknown as http.IncomingMessage, 'cf-connecting-ip'), '10.0.0.1', 'the socket fallback too')
})

test("/health's clientHeader and clientKey: whether the trusted header arrived, and a salted fingerprint of the key, never the address", () => {
	const req = (headers: Record<string, string>) => ({ headers, socket: { remoteAddress: '10.0.0.1' } }) as unknown as http.IncomingMessage
	assert.equal(trustedHeaderPresent(req({ 'cf-connecting-ip': '203.0.113.9' }), 'cf-connecting-ip'), true)
	assert.equal(trustedHeaderPresent(req({ 'cf-connecting-ip': '  ' }), 'cf-connecting-ip'), false, 'blank')
	assert.equal(trustedHeaderPresent(req({}), 'cf-connecting-ip'), false, 'missing')
	assert.equal(trustedHeaderPresent(req({ 'cf-connecting-ip': '203.0.113.9' }), undefined), false, 'no trusted header configured')
	const a = clientKeyFingerprint('203.0.113.9')
	assert.match(a, /^[0-9a-f]{8}$/)
	assert.equal(clientKeyFingerprint('203.0.113.9'), a, 'stable within the process')
	assert.notEqual(clientKeyFingerprint('203.0.113.10'), a, 'another key, another fingerprint')
	assert.notEqual(a, crypto.createHash('sha256').update('203.0.113.9').digest('hex').slice(0, 8), 'salted: not the plain hash of the key')
})
