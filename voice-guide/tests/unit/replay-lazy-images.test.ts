/**
 * Saved pages run without scripts, so Vodafone's lazy loader never fills `data-src`: the replay
 * gives such pictures their `src` itself (tools/demo-browser.ts, showLazyImages).
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { gunzipSync } from 'node:zlib'

import { showLazyImages } from '../../tools/demo-browser.ts'

test('a lazy picture gets its src and srcset; one that has them keeps its own', () => {
	assert.equal(showLazyImages('<img alt="" class="lazy" data-src="/documents/a.png?t=1">'), '<img alt="" class="lazy" src="/documents/a.png?t=1">')
	assert.equal(showLazyImages('<IMG data-srcset="/a.png 1x, /b.png 2x" data-src="/a.png">'), '<IMG srcset="/a.png 1x, /b.png 2x" src="/a.png">')
	assert.equal(showLazyImages('<img src="/b.png" data-src="/c.png">'), '<img src="/b.png" data-src="/c.png">')
	assert.equal(showLazyImages('<div data-src="/x.png"></div>'), '<div data-src="/x.png"></div>')
})

test('no saved page keeps a picture with only data-src', () => {
	const dir = path.join(import.meta.dirname, '../../fixtures/replay/vodafone-eg/pages')
	let lazy = 0
	for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.html.gz'))) {
		const html = showLazyImages(gunzipSync(fs.readFileSync(path.join(dir, f))).toString('utf8'))
		lazy += (html.match(/<img\b[^>]*>/gi) || []).filter((t) => !/\ssrc\s*=/i.test(t) && /\sdata-src\s*=/i.test(t)).length
	}
	assert.equal(lazy, 0)
})
