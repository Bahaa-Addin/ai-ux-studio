/**
 * The page watch's demo data cannot drift from the capture (ADR-0078 Decision 11; phase 6 design §4.8, Q8, M6):
 * tools/watch-baselines.ts, run on the 23 Oct capture (fixtures/replay/vodafone-eg) in Chromium with the real
 * readPage, recordFrom, read.js and mask, writes experiences/src/watch/demo.js byte for byte as it is committed
 * (the header's generation date is taken from the file itself). Nothing is fetched.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { test } from 'node:test'

import { buildDemo, DEMO_FILE, generatedOnOf } from '../../tools/watch-baselines.ts'

test('demo.js is what the tool makes from the 23 Oct capture, byte for byte', { timeout: 120_000 }, async () => {
	assert.ok(fs.existsSync(DEMO_FILE), 'experiences/src/watch/demo.js exists (npm run watch:baselines)')
	const committed = fs.readFileSync(DEMO_FILE, 'utf8')
	const generatedOn = generatedOnOf(committed)
	assert.match(generatedOn ?? '', /^\d{4}-\d{2}-\d{2}$/, 'the header names the day it was generated')
	const made = await buildDemo({ generatedOn: generatedOn! })
	assert.equal(made, committed, 'demo.js differs from the capture: run npm run watch:baselines, never edit it by hand')
})

test('demo.js holds the two cards in both languages, dated 23 Oct, public copy only', async () => {
	const { DEMO, BASELINE_AT, READER } = await import(DEMO_FILE)
	const { READER_VERSION } = await import(DEMO_FILE.replace(/demo\.js$/, 'read.js'))
	assert.equal(READER, READER_VERSION, 'read with the reader of today')
	assert.equal(new Date(BASELINE_AT).toISOString().slice(0, 10), '2026-10-23')
	for (const lang of ['en', 'ar']) {
		const list = DEMO[lang]
		assert.deepEqual(
			list.map((d: any) => [d.sticker.id, d.sticker.source.path, d.card.url, d.page.url]),
			[
				['mobile-internet-bundles', `/${lang}/home`, `https://web.vodafone.com.eg/${lang}/home`, `https://web.vodafone.com.eg/${lang}/mobile-internet-bundles`],
				['vodafone-cash', `/${lang}/services`, `https://web.vodafone.com.eg/${lang}/services`, `https://web.vodafone.com.eg/${lang}/vodafone-cash`],
			],
		)
		for (const d of list) {
			assert.equal(d.sticker.copy.lang, lang)
			assert.equal(d.sticker.savedAt, BASELINE_AT)
			assert.match(d.card.hash, /^[0-9a-f]{64}$/)
			assert.match(d.page.hash, /^[0-9a-f]{64}$/)
			assert.match(d.page.linksHash, /^[0-9a-f]{64}$/)
			assert.equal(d.card.href, d.page.url, 'the card opens the page watched')
			// No digits that could be a phone number, an id or a balance beyond the published copy's own.
			assert.doesNotMatch(JSON.stringify(d.sticker), /01[0125]\d{8}|@[a-z]+\./i)
		}
	}
})
