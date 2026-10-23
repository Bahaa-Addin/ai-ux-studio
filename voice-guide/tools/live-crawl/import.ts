/**
 * Turns the in-browser crawler's exports (ADR-0032) into a normal crawl folder that ingest and
 * sync can build from: data/crawls/<id>/crawl.json plus pages/<hash>.html for captured pages.
 *
 *   node tools/live-crawl/import.ts --site vodafone-eg --out data/crawls  web.json shop.json ...
 *
 * Each input file is one origin's export: the JSON string the crawler's exportJson() parts make
 * when joined.
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

const { values, positionals } = parseArgs({ allowPositionals: true, options: { site: { type: 'string', default: 'vodafone-eg' }, out: { type: 'string' } } })
const platform = loadPlatformConfig()
const exports = positionals.map((f) => JSON.parse(fs.readFileSync(f, 'utf8')) as BrowserExport)
if (!exports.length) throw new Error('give one export file per origin')
for (const e of exports) if (e.siteId !== values.site) throw new Error(`${e.origin}: export is for ${e.siteId}, not ${values.site}`)

const startedAt = exports.map((e) => e.startedAt).sort()[0]
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
const errors = exports.flatMap((e) => e.errors)
const stopped = exports.filter((e) => e.status === 'stopped').map((e) => `${e.origin}: ${e.reason}`).join('; ')
const result: CrawlResult = { id, siteId: values.site!, startedAt, finishedAt, dir, pages, errors, method: 'browser', ...(stopped ? { stopped } : {}) }
fs.writeFileSync(path.join(dir, 'crawl.json'), JSON.stringify(result, null, 1))
const left = exports.reduce((n, e) => n + e.left.length, 0)
console.log(`${dir}: ${pages.length} pages, ${errors.length} errors, ${Object.values(exports).reduce((n, e) => n + Object.keys(e.html).length, 0)} captured, ${left} not crawled (page limit)`)
