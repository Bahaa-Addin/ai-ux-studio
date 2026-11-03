/** One contract, two stores (ADR-0010): the same assertions run on memory and Postgres. */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { type Manifest, validateManifest } from '#kb'
import type { SessionState, Store, TraceEvent } from '#shared/store/index.ts'

export function tinyManifest(versionId = 'v1'): Manifest {
	const r = validateManifest({
		standard: 'site-knowledge/0.1',
		site: { id: 's1', name: { en: 'S1' }, origins: ['http://localhost:4401'], languages: ['en'], defaultLanguage: 'en' },
		version: { id: versionId, createdAt: new Date().toISOString(), hash: `h-${versionId}` },
		pages: [{ id: 'web.home', variants: { en: { url: 'http://localhost:4401/en/index.html', title: 'Home' } }, provenance: 'auto' }],
		destinations: [{ id: 'web.home', pageId: 'web.home', kind: 'page', labels: { en: ['home'] }, provenance: 'auto' }],
	})
	assert.ok(r.ok, JSON.stringify(r.issues))
	return r.manifest!
}

function session(id: string): SessionState {
	const now = new Date().toISOString()
	return { id, siteId: 's1', lang: 'en', createdAt: now, updatedAt: now, turns: [], usage: { agentSteps: 0, agentTokens: 0 } }
}

export function storeContract(name: string, open: () => Promise<Store>, reset: (s: Store) => Promise<void> = async () => {}) {
	let store: Store
	test.before(async () => {
		store = await open()
		await reset(store)
	})
	test.after(async () => {
		await store?.close()
	})

	test(`${name}: knowledge versions are immutable and activated explicitly`, async () => {
		await store.putKbVersion('s1', tinyManifest('v1'))
		await store.putKbVersion('s1', tinyManifest('v2'))
		await assert.rejects(store.putKbVersion('s1', tinyManifest('v1')))
		assert.equal(await store.getActiveKb('s1'), null)
		await store.activateKb('s1', 'v2')
		assert.equal((await store.getActiveKb('s1'))?.version.id, 'v2')
		assert.equal(await store.getActiveKbId('s1'), 'v2')
		const list = await store.listKbVersions('s1')
		assert.equal(list.length, 2)
		assert.equal(list.find((v) => v.active)?.id, 'v2')
		await assert.rejects(store.activateKb('s1', 'nope'))
	})

	test(`${name}: sessions merge shallow patches and expire`, async () => {
		await store.putSession(session('ses_a'), 60)
		await Promise.all([
			store.patchSession('ses_a', { lang: 'ar' }, 60),
			store.patchSession('ses_a', { usage: { agentSteps: 2, agentTokens: 10 } }, 60),
		])
		const s = await store.getSession('ses_a')
		assert.equal(s?.lang, 'ar')
		assert.equal(s?.usage.agentSteps, 2)
		assert.equal(await store.patchSession('ses_missing', { lang: 'ar' }, 60), null)
		await store.putSession(session('ses_old'), -1)
		assert.equal(await store.getSession('ses_old'), null)
	})

	test(`${name}: handoff tokens are single use`, async () => {
		await store.createHandoff('tok1', 'ses_a', 60)
		assert.equal(await store.redeemHandoff('tok1'), 'ses_a')
		assert.equal(await store.redeemHandoff('tok1'), null)
		await store.createHandoff('tok2', 'ses_a', -1)
		assert.equal(await store.redeemHandoff('tok2'), null)
	})

	test(`${name}: traces are listed per session and pushed live`, async () => {
		const got: TraceEvent[] = []
		const off = await store.subscribeTrace((ev) => got.push(ev))
		const base = { siteId: 's1', traceId: 't1', service: 'test', at: new Date().toISOString() }
		const a = await store.appendTrace({ ...base, sessionId: 'ses_t', name: 'turn.start', attrs: { utterance: 'hi' } })
		await store.appendTrace({ ...base, sessionId: 'ses_t', name: 'big', attrs: { blob: 'x'.repeat(9000) } })
		await store.appendTrace({ ...base, sessionId: 'ses_other', name: 'x', attrs: {} })
		const list = await store.listTrace('ses_t')
		assert.deepEqual(
			list.map((e) => e.name),
			['turn.start', 'big'],
		)
		assert.equal((await store.listTrace('ses_t', a.seq)).length, 1)
		for (let i = 0; i < 50 && got.length < 3; i++) await new Promise((r) => setTimeout(r, 20))
		assert.equal(got.length, 3)
		assert.equal((got.find((e) => e.name === 'big')?.attrs.blob as string).length, 9000)
		await off()
	})

	test(`${name}: watches are claimed once per lease`, async () => {
		const sub = await store.upsertSubscription({ siteId: 's1', endpoint: 'https://push.example/1', keys: { p256dh: 'p', auth: 'a' } })
		const again = await store.upsertSubscription({ siteId: 's1', endpoint: 'https://push.example/1', keys: { p256dh: 'p2', auth: 'a2' } })
		assert.equal(sub.id, again.id)
		const w = await store.createWatch({
			siteId: 's1',
			channel: 'push',
			subscriptionId: sub.id,
			sessionId: 'ses_w',
			url: 'http://localhost:4401/en/offers.html',
			target: { css: ['#weekend-offer'] },
			label: 'Weekend offer',
			lang: 'en',
			nextCheckAt: new Date(Date.now() - 1000).toISOString(),
			intervalSec: 60,
		})
		assert.equal((await store.listWatches({ sessionId: 'ses_w' })).length, 1)
		assert.equal((await store.listWatches({ subscriptionId: sub.id })).length, 1)
		assert.equal((await store.listWatches({})).length, 0)
		const live = await store.createWatch({ siteId: 's1', channel: 'live', sessionId: 'ses_w', url: 'http://localhost:4401/en/offers.html', target: { css: ['#roaming-offer'] }, label: 'Roaming', lang: 'en', nextCheckAt: new Date(Date.now() + 60_000).toISOString(), intervalSec: 60 })
		assert.equal(live.subscriptionId, undefined)
		assert.equal(live.channel, 'live')
		await store.updateWatch(live.id, { missingCount: 2 })
		assert.equal((await store.getWatch(live.id))?.missingCount, 2)
		const now = new Date()
		assert.equal((await store.claimDueWatches(now, 10, 30)).length, 1)
		assert.equal((await store.claimDueWatches(now, 10, 30)).length, 0)
		await store.updateWatch(w.id, { lastHash: 'abc', nextCheckAt: new Date(Date.now() - 1).toISOString(), errorCount: 1 })
		const claimed = await store.claimDueWatches(new Date(), 10, 30)
		assert.equal(claimed[0]?.lastHash, 'abc')
		await store.addChange({ watchId: w.id, at: new Date().toISOString(), before: 'a', after: 'b' })
		assert.equal((await store.listChanges(w.id))[0].after, 'b')
		await store.deleteSubscription(sub.id)
		assert.equal(await store.getWatch(w.id), null)
	})

	test(`${name}: cache and usage counters`, async () => {
		await store.cachePut('vision', 'k', { en: 'x' })
		assert.deepEqual(await store.cacheGet('vision', 'k'), { en: 'x' })
		assert.equal(await store.cacheGet('vision', 'missing'), null)
		assert.equal(await store.addUsage('tokens:s1:2026-10-22', 5), 5)
		assert.equal(await store.addUsage('tokens:s1:2026-10-22', 7), 12)
	})

	test(`${name}: experience profiles are immutable and activated explicitly; interest counts add up per day`, async () => {
		const profile = (id: string) => ({
			standard: 'site-experience-profile/v1' as const,
			id,
			siteId: 's1',
			kbVersionId: 'v1',
			generatedAt: new Date().toISOString(),
			generator: { name: 'test', version: '1' },
			cohort: { minimum: 20, aggregationEnabled: false },
			destinations: [{ destinationId: 'web.home', pageId: 'web.home', minimumCohortMet: false, suggestedQuestions: {} }],
		})
		await store.putExperienceProfile('s1', profile('p1'))
		await assert.rejects(store.putExperienceProfile('s1', profile('p1')))
		assert.equal(await store.getActiveExperienceProfile('s1'), null)
		await store.activateExperienceProfile('s1', 'p1')
		assert.equal((await store.getActiveExperienceProfile('s1'))?.id, 'p1')
		const row = { siteId: 's1', kbVersionId: 'v1', day: '2026-11-02', pageId: 'web.home', destinationId: 'web.home', warm: 1, hot: 0, activated: 1 }
		await store.addInterestCounts([row])
		await store.addInterestCounts([{ ...row, warm: 0, hot: 1, activated: 0 }])
		const got = await store.listInterestCounts('s1', 'v1', '2026-11-01', '2026-11-03')
		assert.deepEqual(got.map((r) => [r.day, r.warm, r.hot, r.activated]), [['2026-11-02', 1, 1, 1]])
		const purged = await store.purgeExpired(new Date('2027-06-01T00:00:00Z'), 7, 90)
		assert.equal(purged.interest, 1)
		assert.deepEqual(await store.listInterestCounts('s1', 'v1', '2026-01-01', '2027-12-31'), [])
	})
}
