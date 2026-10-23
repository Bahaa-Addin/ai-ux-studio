/**
 * The on-demand sync (SPEC-04 §5 and §7, ADR-0028, ADR-0032) on real Vodafone pages saved for
 * replay: the paused schedule refuses, a first run activates, an identical run publishes nothing,
 * a run that loses many destinations is held for review, and public-only crawling is forced.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'

import { limitOrigins, publicOnlySite, runSync, scheduleRefusal } from '#jobs/sync-lib.ts'
import { loadPlatformConfig, loadSiteConfig, ROOT, type SiteConfig } from '#shared/config.ts'
import { MemoryStore } from '#shared/store/index.ts'

const REPLAY = path.join(ROOT, 'fixtures/replay/vodafone-eg')
const tmp = fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', 'vg-sync-'))
const platform = { ...loadPlatformConfig({ VG_DATA_DIR: tmp } as NodeJS.ProcessEnv), vision: {} }
const crawl = JSON.parse(fs.readFileSync(path.join(REPLAY, 'crawl.json'), 'utf8'))

// The real site config, scoped to the 14 saved pages: seeds are the saved pages, and the curated
// overlay (which names pages outside this sample) is left out.
const real = loadSiteConfig(path.join(ROOT, 'config/sites/vodafone-eg.yaml'))
const site: SiteConfig = { ...real, curated: undefined, crawl: { ...real.crawl, start: ['https://web.vodafone.com.eg/ar/home', 'https://web.vodafone.com.eg/en/mobile-internet-bundles', 'https://web.vodafone.com.eg/spa/storeLocator', 'https://eshop.vodafone.com.eg/en/'] } }

/** A saved crawl folder holding only some of the pages. */
function crawlWith(name: string, keep: (url: string) => boolean): string {
	const dir = path.join(tmp, name)
	fs.mkdirSync(dir, { recursive: true })
	fs.writeFileSync(path.join(dir, 'crawl.json'), JSON.stringify({ ...crawl, id: `crawl-${name}`, pages: crawl.pages.filter((p: { url: string }) => keep(p.url)) }))
	return dir
}

const store = new MemoryStore()
const quiet = () => {}

test('a scheduled run refuses while the schedule is paused, and touches nothing', async () => {
	assert.equal(real.sync.schedule.enabled, false)
	assert.match(scheduleRefusal(real, true)!, /paused/)
	assert.equal(scheduleRefusal(real, false), null)
	const r = await runSync({ site, platform, store, crawlDir: REPLAY, scheduled: true, log: quiet })
	assert.equal(r.outcome, 'refused')
	assert.deepEqual(await store.listKbVersions(site.id), [])
})

test('sync forces public-only crawling whatever the config says', () => {
	const signedIn: SiteConfig = { ...site, crawl: { ...site.crawl, publicOnly: false, cookies: [{ url: 'https://web.vodafone.com.eg', name: 'session', value: 'x' }] } }
	const forced = publicOnlySite(signedIn)
	assert.equal(forced.crawl.publicOnly, true)
	assert.deepEqual(forced.crawl.cookies, [])
	assert.equal(signedIn.crawl.cookies.length, 1, 'the original config object is not changed')
})

test('a first on-demand run gates and activates; seeds on an origin not crawled are reported apart', async () => {
	const r = await runSync({ site, platform, store, crawlDir: REPLAY, log: quiet })
	assert.equal(r.outcome, 'activated', JSON.stringify(r.gate))
	assert.equal(await store.getActiveKbId(site.id), r.versionId)
	assert.deepEqual(r.seeds!.missing, [])
	assert.deepEqual(r.seeds!.notCrawled, ['https://eshop.vodafone.com.eg/en/'])
	assert.ok(r.gate.find((g) => g.name === 'router evaluation'), 'the evaluation set was scored')
	assert.ok(fs.existsSync(r.reportFile!))
	assert.match(fs.readFileSync(r.reportFile!, 'utf8'), /public pages only, no cookies/)
})

test('the same pages again publish nothing (same hash)', async () => {
	const before = (await store.listKbVersions(site.id)).length
	const r = await runSync({ site, platform, store, crawlDir: REPLAY, log: quiet })
	assert.equal(r.outcome, 'unchanged')
	assert.equal((await store.listKbVersions(site.id)).length, before)
})

test('losing many destinations holds the new version for review; --force activates it', async () => {
	const active = await store.getActiveKbId(site.id)
	const dir = crawlWith('shrunk', (u) => !/(vodafone-red1|wireless-net|services|vodafone-cash|promotions)$/.test(u))
	const held = await runSync({ site, platform, store, crawlDir: dir, log: quiet })
	assert.equal(held.outcome, 'held', JSON.stringify(held.gate))
	const churn = held.gate.find((g) => g.name === 'destination churn')!
	assert.equal(churn.ok, false, churn.detail)
	assert.equal(await store.getActiveKbId(site.id), active, 'the active version did not change')
	assert.ok(await store.getKbVersion(site.id, held.versionId!), 'the held version is stored for review')
	assert.match(fs.readFileSync(held.reportFile!, 'utf8'), /npm run kb -- --site vodafone-eg --activate/)

	const forced = await runSync({ site, platform, store, crawlDir: dir, force: true, log: quiet })
	assert.equal(forced.outcome, 'activated')
	assert.equal(await store.getActiveKbId(site.id), forced.versionId)
})

test('a missing seed page holds the version', async () => {
	const dir = crawlWith('no-bundles', (u) => !u.endsWith('/mobile-internet-bundles'))
	const r = await runSync({ site, platform, store, crawlDir: dir, dryRun: true, log: quiet })
	const seeds = r.gate.find((g) => g.name === 'seed pages present')!
	assert.equal(seeds.ok, false)
	assert.deepEqual(r.seeds!.missing, ['https://web.vodafone.com.eg/en/mobile-internet-bundles'])
	assert.equal(r.outcome, 'dry-run')
})

test('--origin web leaves the shop out of the run entirely', () => {
	const web = limitOrigins(real, ['web'])
	assert.deepEqual(web.origins.map((o) => o.key), ['web'])
	assert.ok(web.crawl.start.length > 0 && web.crawl.start.every((u) => u.startsWith('https://web.vodafone.com.eg/')))
	assert.throws(() => limitOrigins(real, ['nope']), /unknown origin/)
	assert.equal(limitOrigins(real, undefined), real)
})
