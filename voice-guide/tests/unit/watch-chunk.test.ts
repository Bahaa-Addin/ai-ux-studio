/**
 * The guide's watch chip hands its step to the experience layer first (watch-chunk.ts createWatch;
 * ADR-0078 point 7, phase 6 design §4.6): the layer present and watching → success (the guide says its
 * `watching` line); the layer's refusal → failure (`watchFailed`), with no request to the server; no layer
 * within the wait → the old server path (POST /v1/watch), which answers 409 for a browser-mode site.
 * Also: the layer announced late by 'aixc:watch-ready' is waited for. No DOM: a window stand-in.
 */
import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'

const win = new EventTarget() as EventTarget & Record<string, any>
;(globalThis as any).window = win

const { createWatch } = await import('../../packages/sdk/src/watch-chunk.ts')

const STEP = { op: 'offerWatch', target: { css: ['#main-content .card:nth-of-type(2)'] }, label: 'Mega 1400', url: 'https://web.vodafone.com.eg/en/mobile-internet-bundles', pageId: 'p1' }

const context = () => {
	const posts: { path: string; body: any }[] = []
	return {
		posts,
		c: {
			lang: 'en',
			sessionId: 's1',
			push: null,
			async post(path: string, body: unknown): Promise<any> {
				posts.push({ path, body })
				if (path === '/v1/watch') throw new Error('409 browser_only')
				return {}
			},
		},
	}
}

beforeEach(() => {
	delete win.__aixcWatch
})

test('the layer is there and watches the card: success, and nothing goes to the server', async () => {
	const seen: unknown[] = []
	win.__aixcWatch = { ready: true, fromGuide: async (step: unknown) => (seen.push(step), { ok: true }) }
	const { c, posts } = context()
	assert.equal(await createWatch(c, STEP, 't1'), true)
	assert.deepEqual(seen, [STEP], 'the guide\'s step goes to the layer as it is')
	assert.deepEqual(posts, [])
})

test('the layer refuses (not a card): failure, and nothing goes to the server', async () => {
	win.__aixcWatch = { ready: true, fromGuide: async () => ({ ok: false, reason: 'not-a-card' }) }
	const { c, posts } = context()
	assert.equal(await createWatch(c, STEP, 't1'), false)
	assert.deepEqual(posts, [])
})

test('the layer announces itself late (after a navigation): it is waited for', async () => {
	const { c, posts } = context()
	setTimeout(() => {
		win.__aixcWatch = { ready: true, fromGuide: async () => ({ ok: true }) }
		win.dispatchEvent(new Event('aixc:watch-ready'))
	}, 50)
	const t0 = Date.now()
	assert.equal(await createWatch(c, STEP, 't1', { layerWaitMs: 2000 }), true)
	assert.ok(Date.now() - t0 < 1500, 'answered when the layer was ready, not at the end of the wait')
	assert.deepEqual(posts, [])
})

test('no layer within the wait: the server path, which refuses a browser-mode site, so the guide fails', async () => {
	const { c, posts } = context()
	await assert.rejects(createWatch(c, STEP, 't1', { layerWaitMs: 30 }), /409/)
	assert.equal(posts.length, 1)
	assert.equal(posts[0].path, '/v1/watch')
	assert.equal(posts[0].body.url, STEP.url)
	assert.equal(posts[0].body.turnId, 't1')
})

test('the wait is 3 s by default', async () => {
	const { c } = context()
	const t0 = Date.now()
	await assert.rejects(createWatch(c, STEP, 't1'))
	const waited = Date.now() - t0
	assert.ok(waited >= 2900 && waited < 4500, `waited ${waited} ms`)
})

// F5 (critic, phase 6): a browser-mode site (the session's site.watch.mode, read from window.voiceGuide) never
// asks for notifications, registers a service worker or posts a push subscription or a watch: no layer, false at once.
test('no layer on a browser-mode site: false at once, no permission asked, nothing sent', async () => {
	let asked = 0
	win.Notification = { permission: 'default', requestPermission: async () => (asked++, 'granted') }
	win.voiceGuide = { session: { site: { watch: { enabled: true, mode: 'browser' } } } }
	try {
		const { c, posts } = context()
		;(c as any).push = { publicKey: 'BAAA' }
		assert.equal(await createWatch(c, STEP, 't1', { layerWaitMs: 30 }), false)
		assert.equal(asked, 0, 'no notification permission asked')
		assert.deepEqual(posts, [], 'no push subscription, no POST /v1/watch')
	} finally {
		delete win.Notification
		delete win.voiceGuide
	}
})
