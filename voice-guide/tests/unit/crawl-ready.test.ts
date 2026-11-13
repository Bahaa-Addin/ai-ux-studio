/**
 * No crawl reaches the e-shop until its safeguards are in code (ADR-0060 §1, e-shop plan E4): the
 * site config marks it `crawl.origins.shop.ready: false`, and a crawl that includes it is refused
 * before robots.txt, a browser or any request. A web-only run is not.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import { loadSiteConfig, ROOT } from '#shared/config.ts'

import { crawlSite, notReadyOrigins } from '../../jobs/crawler/crawl.ts'
import { limitOrigins } from '../../jobs/sync-lib.ts'

const site = loadSiteConfig(path.join(ROOT, 'config/sites/vodafone-eg.yaml'))

test('a crawl that includes the shop is refused before anything is fetched; a web-only one passes the check', async () => {
	assert.deepEqual(notReadyOrigins(site), ['shop'])
	let fetched = 0
	const fetchImpl = (async () => {
		fetched++
		return new Response('', { status: 200 })
	}) as typeof fetch
	const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vg-ready-'))
	try {
		await assert.rejects(crawlSite(site, { outDir, fetchImpl }), /shop, which is not ready to be crawled[\s\S]*--origin web/)
		assert.equal(fetched, 0, 'not even robots.txt was asked for')
		assert.deepEqual(fs.readdirSync(outDir), [], 'no crawl folder was made')
	} finally {
		fs.rmSync(outDir, { recursive: true, force: true })
	}
	assert.deepEqual(notReadyOrigins(limitOrigins(site, ['web'])), [], '--origin web leaves the shop out')
	assert.deepEqual(notReadyOrigins(loadSiteConfig(path.join(ROOT, 'config/sites/demo-telco.yaml'))), [], 'a site that marks nothing is not held back')
})
