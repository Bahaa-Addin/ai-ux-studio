/**
 * npm run kb -- --site vodafone-eg --status
 * npm run kb -- --site vodafone-eg --activate <versionId>      (after reading a held sync report)
 * npm run kb -- --site vodafone-eg --rollback <versionId>      (same, for an older version)
 * npm run kb -- --site vodafone-eg --import <manifest.json> [--activate]
 * npm run kb -- --site vodafone-eg --export <file>             (the active version, e.g. to freeze it in config/kb)
 *
 * Knowledge-base versions in the store (SPEC-04 §5 step 9). Versions are immutable and never
 * deleted here; activation only moves the pointer, so every action can be undone by another.
 */
import fs from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'

import { validateManifest } from '#kb'
import { loadPlatformConfig, loadSiteConfig } from '#shared/config.ts'
import { openStore } from '#shared/store/index.ts'

const { values } = parseArgs({
	options: {
		site: { type: 'string', default: 'vodafone-eg' },
		status: { type: 'boolean', default: false },
		activate: { type: 'string' },
		rollback: { type: 'string' },
		import: { type: 'string' },
		export: { type: 'string' },
	},
	allowNegative: false,
	strict: false,
})

const platform = loadPlatformConfig()
const site = loadSiteConfig(path.join(platform.sitesDir, `${values.site}.yaml`))
const store = await openStore(platform)

async function status(): Promise<void> {
	const versions = await store.listKbVersions(site.id, 20)
	if (!versions.length) {
		console.log(`No knowledge versions for ${site.id}. Import the frozen one: npm run kb -- --site ${site.id} --import config/kb/${site.id}.manifest.json --activate`)
		return
	}
	console.log(`${site.id}: ${versions.length} version(s), newest first`)
	for (const v of versions) console.log(`${v.active ? '* ' : '  '}${v.id.padEnd(28)} ${v.createdAt}  ${String(v.destinations).padStart(4)} destinations  ${v.hash.slice(0, 12)}`)
	console.log(`\nScheduled sync: ${site.sync.schedule.enabled ? `on, every ${site.sync.schedule.everyMinutes} min` : 'PAUSED'}; crawl: ${site.crawl.publicOnly ? 'public pages only' : 'may use cookies'}`)
}

async function activate(id: string): Promise<void> {
	const m = await store.getKbVersion(site.id, id)
	if (!m) throw new Error(`no version ${id} for ${site.id} (see --status)`)
	const before = await store.getActiveKbId(site.id)
	await store.activateKb(site.id, id)
	console.log(`Active version for ${site.id}: ${id} (was ${before || 'none'}). Undo: npm run kb -- --site ${site.id} --activate ${before || '<id>'}`)
}

try {
	if (values.import) {
		const file = String(values.import)
		const r = validateManifest(JSON.parse(fs.readFileSync(file, 'utf8')))
		const errors = r.issues.filter((i) => i.level === 'error')
		if (!r.ok || !r.manifest) throw new Error(`${file} is not a valid manifest: ${errors.map((e) => `${e.path}: ${e.message}`).join('; ')}`)
		if (r.manifest.site.id !== site.id) throw new Error(`${file} is for site ${r.manifest.site.id}, not ${site.id}`)
		const existing = await store.getKbVersion(site.id, r.manifest.version.id)
		if (!existing) await store.putKbVersion(site.id, r.manifest)
		console.log(`${existing ? 'Already stored' : 'Stored'}: ${r.manifest.version.id} (${r.manifest.pages.length} pages, ${r.manifest.destinations.length} destinations)`)
		if (values.activate !== undefined) await activate(r.manifest.version.id)
	} else if (typeof values.activate === 'string' || typeof values.rollback === 'string') {
		await activate(String(values.activate ?? values.rollback))
	} else if (values.export) {
		const m = await store.getActiveKb(site.id)
		if (!m) throw new Error(`no active version for ${site.id}`)
		fs.writeFileSync(String(values.export), JSON.stringify(m, null, 1))
		console.log(`Wrote ${m.version.id} to ${values.export}`)
	} else {
		await status()
	}
} catch (e) {
	console.error((e as Error).message)
	process.exitCode = 1
} finally {
	await store.close()
}
