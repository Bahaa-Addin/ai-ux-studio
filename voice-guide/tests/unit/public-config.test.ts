/**
 * A public gateway (ADR-0053 §2) refuses to start with settings that are wrong for strangers on the
 * internet: the dev secret, no admin token, the testing agent preset, a forgeable client address,
 * plain http. A trusted proxy header names the client for the rate limits.
 */
import assert from 'node:assert/strict'
import type http from 'node:http'
import { test } from 'node:test'

import { checkPublicConfig, loadPlatformConfig } from '#shared/config.ts'
import { clientIp } from '#shared/http.ts'

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
