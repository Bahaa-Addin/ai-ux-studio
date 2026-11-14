/**
 * The public demo extension (ADR-0056): both manifests ask only for the site's two origins, the
 * Firefox one carries its id and Android support, and the generated loader is the shared loader
 * pointed at the public gateway with server-sent events and the storage keeper.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import { loadSiteConfig, ROOT } from '#shared/config.ts'

import { buildExtension, extensionLoader, icon, manifest } from '../../tools/extension/build.ts'

const site = loadSiteConfig(path.join(ROOT, 'config/sites/vodafone-eg.yaml'))

test('the manifests ask for the two Vodafone origins and nothing else', () => {
	for (const b of ['chrome', 'firefox'] as const) {
		const m = manifest(b, site) as any
		assert.equal(m.manifest_version, 3)
		assert.deepEqual(m.host_permissions, ['https://web.vodafone.com.eg/*', 'https://eshop.vodafone.com.eg/*'])
		assert.deepEqual(m.permissions, ['scripting', 'storage'])
		assert.doesNotMatch(m.name, /vodafone/i, 'a neutral name (store review, brand)')
	}
	assert.equal((manifest('chrome', site) as any).background.service_worker, 'background.js')
	const ff = manifest('firefox', site) as any
	assert.deepEqual(ff.background.scripts, ['background.js'])
	assert.ok(ff.browser_specific_settings.gecko.id)
	assert.ok(ff.browser_specific_settings.gecko_android, 'Firefox for Android')
})

test('the loader is the shared one, pointed at the public gateway', () => {
	const js = extensionLoader(site, 'https://guide.example.com')
	assert.match(js, /"https:\/\/guide\.example\.com"/)
	assert.doesNotMatch(js, /dataset\.events = 'poll'/, 'server-sent events, not the demo browser\'s polling')
	assert.match(js, /__vgKeep/, 'the storage keeper')
	assert.match(js, /aixc\/aixc\.js/, 'the experience layer')
	assert.doesNotThrow(() => new Function(js))
})

test('a build writes both folders; plain http is refused for a remote gateway', () => {
	const out = fs.mkdtempSync(path.join(os.tmpdir(), 'vg-ext-'))
	const { dirs } = buildExtension({ site, gateway: 'https://guide.example.com', out })
	for (const d of dirs) {
		for (const f of ['manifest.json', 'loader.js', 'background.js', 'popup.html', 'popup.js', 'icons/128.png']) assert.ok(fs.existsSync(path.join(d, f)), `${d}/${f}`)
		assert.doesNotMatch(fs.readFileSync(path.join(d, 'background.js'), 'utf8'), /__MATCHES__/)
		assert.doesNotMatch(fs.readFileSync(path.join(d, 'popup.js'), 'utf8'), /__START__|__GATEWAY__/)
	}
	assert.throws(() => buildExtension({ site, gateway: 'http://guide.example.com', out }), /https/)
	assert.deepEqual([...icon(16).subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10])
})
