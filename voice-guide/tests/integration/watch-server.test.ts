/**
 * The page watch on the server for a browser-mode site (ADR-0078 points 5 and 10, phase 6 design
 * §4.11): Vodafone's watches live in the visitor's browser, so POST /v1/watch answers 409 browser_only
 * and tick() never checks a vodafone-eg row, rows made before the change included. A server-mode site
 * (the demo-telco fixture) still works as before. The page-map answer carries the browser's rules only
 * when the site's experiences.demos.watch is on. Real Postgres; the gateway on port 4720; the section
 * reader is a stand-in that records what it was asked to read (nothing leaves the machine).
 */
import assert from 'node:assert/strict'
import path from 'node:path'
import { after, before, test } from 'node:test'

import type { Target } from '#kb'
import { createKnowledge } from '#services/knowledge/handlers.ts'
import { loadSites, ROOT, SiteConfig } from '#shared/config.ts'

import { startPlatform, type TestPlatform } from '../helpers/platform.ts'

const VODAFONE = 'https://web.vodafone.com.eg'
const TELCO = 'http://localhost:4401'
const sites = loadSites(path.join(ROOT, 'config/sites'))
let p: TestPlatform
const reads: string[] = []
const pageText = new Map<string, string>()

before(async () => {
	p = await startPlatform({
		port: 4720,
		options: {
			sites,
			watchChecker: {
				read: async (url: string, t: Target) => {
					reads.push(url)
					const text = pageText.get(`${url} ${t.css[0]}`)
					return text === undefined ? { found: false, text: '', hash: '' } : { found: true, text, hash: `h:${text}` }
				},
				close: async () => {},
			},
		},
	})
})
after(async () => {
	await p?.close()
})

async function call(urlPath: string, body: unknown, origin: string, key: string) {
	const res = await fetch(`${p.url}${urlPath}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-vg-site-key': key, Origin: origin }, body: JSON.stringify(body) })
	return { status: res.status, body: (await res.json().catch(() => ({}))) as any }
}

test('config: watch.mode defaults to server; vodafone-eg is browser with the layer knobs, and demos.watch on (the phase\'s last commit)', () => {
	const telco = sites.get('demo-telco')!
	assert.equal(telco.watch.mode, 'server', 'other sites are unchanged')
	const v = sites.get('vodafone-eg')!
	assert.deepEqual(v.watch, { enabled: true, mode: 'browser', intervalSec: 900 })
	assert.deepEqual(v.experiences.watch, { minIntervalMin: 30, perVisitMax: 12, spacingMs: 1000, maxWatched: 20, minChars: 200 })
	assert.equal(v.experiences.demos.watch, true, 'switched on in the phase\'s last commit (ADR-0078)')
	assert.equal(SiteConfig.safeParse({ ...structuredClone(v), watch: { mode: 'cron' } }).success, false, 'an unknown mode is refused')
})

// F5 (critic, phase 6): the guide's chunk must know a browser-mode site, so it never asks for notifications or push there.
test('the session answer carries the site\'s watch mode: browser for vodafone-eg, server for the others', async () => {
	const v = await call('/v1/session', { lang: 'ar', page: { url: `${VODAFONE}/ar/home` } }, VODAFONE, 'pk_vodafone_eg')
	assert.equal(v.status, 200, JSON.stringify(v.body))
	assert.deepEqual(v.body.site.watch, { enabled: true, mode: 'browser' })
	const t = await call('/v1/session', { lang: 'en', page: { url: `${TELCO}/en/offers.html` } }, TELCO, 'pk_demo_telco')
	assert.equal(t.status, 200, JSON.stringify(t.body))
	assert.equal(t.body.site.watch.mode, 'server')
})

test('POST /v1/watch for vodafone-eg answers 409 browser_only, whatever its enabled flag', async () => {
	const s = await call('/v1/session', { lang: 'ar', page: { url: `${VODAFONE}/ar/home` } }, VODAFONE, 'pk_vodafone_eg')
	assert.equal(s.status, 200, JSON.stringify(s.body))
	const w = await call('/v1/watch', { sessionId: s.body.sessionId, url: `${VODAFONE}/ar/home`, target: { css: ['#a'] }, label: 'x', lang: 'ar' }, VODAFONE, 'pk_vodafone_eg')
	assert.equal(w.status, 409)
	// The gateway's error shape is { error: message, code }.
	assert.equal(w.body.code, 'browser_only')
	const v = sites.get('vodafone-eg')!
	v.watch.enabled = false
	try {
		await assert.rejects(p.services.local.watch.create({ siteId: 'vodafone-eg', sessionId: s.body.sessionId, url: `${VODAFONE}/ar/home`, target: { css: ['#a'] }, label: 'x', lang: 'ar' }, { trace: { traceId: '0'.repeat(32), spanId: '0'.repeat(16), siteId: 'vodafone-eg', sessionId: s.body.sessionId } } as never), (e: any) => e.status === 409 && e.code === 'browser_only')
	} finally {
		v.watch.enabled = true
	}
	assert.deepEqual(reads, [], 'nothing was read for it')
})

test('tick() never checks a browser-mode row, one made before the change or after; a server-mode site works as before', async () => {
	const past = new Date(Date.now() - 60_000).toISOString()
	const row = (sessionId: string, url: string) => ({ siteId: 'vodafone-eg', channel: 'live' as const, sessionId, url, target: { css: ['#cash'] }, label: 'Cash', lang: 'ar', lastHash: 'h:old', lastText: 'old', nextCheckAt: past, intervalSec: 900 })
	const vs = await call('/v1/session', { lang: 'ar', page: { url: `${VODAFONE}/ar/services` } }, VODAFONE, 'pk_vodafone_eg')
	// A row the server made before vodafone-eg became browser-mode, inserted directly as it would sit in the table.
	const before = await p.store.createWatch(row(vs.body.sessionId, `${VODAFONE}/ar/services`))
	// A server-mode site's watch, through the API.
	const ts = await call('/v1/session', { lang: 'en', page: { url: `${TELCO}/en/offers.html` } }, TELCO, 'pk_demo_telco')
	const telcoUrl = `${TELCO}/en/offers.html`
	pageText.set(`${telcoUrl} #weekend-offer`, 'Weekend offer')
	const tw = await call('/v1/watch', { sessionId: ts.body.sessionId, url: telcoUrl, target: { css: ['#weekend-offer'] }, label: 'Weekend offer', lang: 'en' }, TELCO, 'pk_demo_telco')
	assert.equal(tw.status, 200, JSON.stringify(tw.body))
	await p.store.updateWatch(tw.body.watchId, { nextCheckAt: past })
	pageText.set(`${telcoUrl} #weekend-offer`, 'Weekend offer, now double')
	reads.length = 0

	const t1 = await p.services.local.watch.tick({})
	assert.deepEqual(reads, [telcoUrl], 'only the server-mode site was read')
	assert.equal(t1.checked, 1)
	assert.equal(t1.changed, 1, 'the server-mode watch still finds its change')
	assert.equal(t1.skipped, 1)

	// A row inserted after, and the first one again once its next check is due.
	const after = await p.store.createWatch(row(vs.body.sessionId, `${VODAFONE}/ar/home`))
	await p.store.updateWatch(before.id, { nextCheckAt: past })
	reads.length = 0
	const t2 = await p.services.local.watch.tick({})
	assert.deepEqual(reads, [])
	assert.equal(t2.skipped, 2)
	for (const id of [before.id, after.id]) {
		const w = (await p.store.getWatch(id))!
		assert.equal(w.lastHash, 'h:old', 'untouched')
		assert.equal(w.status, 'active', 'not paused: the row is left as it was')
		assert.ok(new Date(w.nextCheckAt).getTime() > Date.now() + 3600_000, 'not claimed again on every tick')
	}
	const now = await p.services.local.watch.checkNow({ watchId: before.id })
	assert.equal(now.changed, false)
	assert.deepEqual(reads, [], 'checkNow does not read it either')
})

test('the page-map answer carries the browser\'s rules only when experiences.demos.watch is on', async () => {
	const offSite = structuredClone(sites.get('vodafone-eg')!)
	offSite.experiences.demos.watch = false
	const off = createKnowledge({ store: null as never, kb: { get: async () => null } as never, sites: new Map([['vodafone-eg', offSite]]) })
	const m0 = (await off.pageMap({ siteId: 'vodafone-eg', url: `${VODAFONE}/ar/home` })) as Record<string, unknown>
	assert.equal('watch' in m0, false)
	const on = structuredClone(sites.get('vodafone-eg')!)
	on.experiences.demos.watch = true
	const knowledge = createKnowledge({ store: null as never, kb: { get: async () => null } as never, sites: new Map([['vodafone-eg', on]]) })
	const m1 = (await knowledge.pageMap({ siteId: 'vodafone-eg', url: `${VODAFONE}/ar/home` })) as any
	assert.deepEqual(m1.watch, {
		include: ['^/(en|ar)/'],
		exclude: on.crawl.exclude,
		origin: VODAFONE,
		minIntervalMin: 30,
		perVisitMax: 12,
		spacingMs: 1000,
		maxWatched: 20,
		minChars: 200,
	})
	assert.ok(m1.watch.exclude.length > 5 && m1.watch.exclude.every((x: unknown) => typeof x === 'string'))
	assert.deepEqual(m1.sections, [], 'the rest of the answer is as before')
	const telco = createKnowledge({ store: null as never, kb: { get: async () => null } as never, sites })
	assert.equal('watch' in ((await telco.pageMap({ siteId: 'demo-telco', url: `${TELCO}/en/offers.html` })) as object), false)
})
