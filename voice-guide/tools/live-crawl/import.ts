/**
 * Turns the in-browser crawler's exports (ADR-0032) into a normal crawl folder that ingest and
 * sync can build from: data/crawls/<id>/crawl.json plus pages/<hash>.html for captured pages.
 *
 *   node tools/live-crawl/import.ts --site vodafone-eg --out data/crawls  web.json shop.json ...
 *
 * Each input file is one origin's export: the JSON string the crawler's exportJson() parts make
 * when joined. Two other shapes are accepted:
 *  - app pages taken one at a time as the top document ({ snaps, spaHtml, spaCss }), and
 *  - --assets <file>: rendered HTML of key pages plus the site's stylesheets and fonts
 *    ({ origin, html, css, fonts }), kept under assets/ so the local replay can serve them.
 */
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'

import type { CrawlResult, PageSnap } from '#jobs/crawler/types.ts'
import { loadPlatformConfig } from '#shared/config.ts'

interface BrowserExport {
	siteId: string
	origin: string
	startedAt: string
	finishedAt?: string
	status: string
	reason?: string
	pages: PageSnap[]
	errors: { url: string; error: string }[]
	html: Record<string, string>
	left: string[]
}

const { values, positionals } = parseArgs({ allowPositionals: true, options: { site: { type: 'string', default: 'vodafone-eg' }, out: { type: 'string' }, assets: { type: 'string' } } })
const platform = loadPlatformConfig()

interface AppPages {
	snaps: PageSnap[]
	spaHtml: Record<string, string>
	spaCss: Record<string, string>
}
interface Assets {
	origin: string
	capturedAt: string
	html: Record<string, string>
	css: Record<string, string>
	fonts: Record<string, string>
}

const appCss: Record<string, string> = {}
const exports = positionals.map((f) => {
	const raw = JSON.parse(fs.readFileSync(f, 'utf8')) as BrowserExport | AppPages
	if (!('snaps' in raw)) return raw
	// App pages: same PageSnap, taken one by one in the top document.
	Object.assign(appCss, raw.spaCss)
	const origin = new URL(raw.snaps[0]?.url || 'https://invalid').origin
	return { siteId: values.site!, origin, startedAt: new Date(0).toISOString(), status: 'done', pages: raw.snaps, errors: [], html: raw.spaHtml, left: [] } as BrowserExport
})
const assets = values.assets ? (JSON.parse(fs.readFileSync(values.assets, 'utf8')) as Assets) : null
if (assets) for (const e of exports) if (e.origin === assets.origin) e.html = { ...assets.html, ...e.html }
if (!exports.length) throw new Error('give one export file per origin')
for (const e of exports) if (e.siteId !== values.site) throw new Error(`${e.origin}: export is for ${e.siteId}, not ${values.site}`)

const startedAt = exports.map((e) => e.startedAt).filter((d) => d > '1970-01-02').sort()[0] || new Date().toISOString()
const finishedAt = exports.map((e) => e.finishedAt || e.startedAt).sort().at(-1)!
const id = `crawl-${startedAt.replace(/[-:]/g, '').replace(/\..*/, '')}-browser`
const dir = path.join(values.out || path.join(platform.dataDir, 'crawls'), id)
fs.mkdirSync(path.join(dir, 'pages'), { recursive: true })

const pages: PageSnap[] = []
for (const e of exports) {
	for (const p of e.pages) {
		const html = e.html[p.url]
		if (html) {
			const key = createHash('sha1').update(p.url).digest('hex').slice(0, 10)
			p.snapshot = `pages/${key}.html`
			fs.writeFileSync(path.join(dir, p.snapshot), html)
		}
		pages.push(p)
	}
}
// Stylesheets and fonts for the replay, at their site paths (assets/<path>).
const assetFiles: string[] = []
const writeAsset = (sitePath: string, data: string | Buffer) => {
	const rel = path.join('assets', sitePath.replace(/^\/+/, '').replace(/[?#].*$/, ''))
	fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true })
	fs.writeFileSync(path.join(dir, rel), data)
	assetFiles.push(rel)
}
for (const [p, css] of Object.entries({ ...(assets?.css || {}), ...appCss })) writeAsset(p, css)
for (const [p, b64] of Object.entries(assets?.fonts || {})) writeAsset(p, Buffer.from(b64, 'base64'))

const errors = exports.flatMap((e) => e.errors)
const stopped = exports.filter((e) => e.status === 'stopped').map((e) => `${e.origin}: ${e.reason}`).join('; ')
const result: CrawlResult = { id, siteId: values.site!, startedAt, finishedAt, dir, pages, errors, method: 'browser', ...(stopped ? { stopped } : {}) }
fs.writeFileSync(path.join(dir, 'crawl.json'), JSON.stringify(result, null, 1))
const left = exports.reduce((n, e) => n + e.left.length, 0)
console.log(`${dir}: ${pages.length} pages, ${errors.length} errors, ${pages.filter((p) => p.snapshot).length} with rendered HTML, ${assetFiles.length} asset files, ${left} not crawled (page limit)`)
