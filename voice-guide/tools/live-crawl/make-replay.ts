/**
 * Makes the committed replay fixture (fixtures/replay/<site>/) from a crawl folder: only the pages
 * that have rendered HTML, gzipped, plus the site's stylesheets (gzipped) and fonts. The demo
 * browser's replay mode and the live-replay end-to-end tests serve it (ADR-0031, T-207).
 *
 *   node tools/live-crawl/make-replay.ts --site vodafone-eg data/crawls/<crawl id>
 *
 * Private repository only: the pages, stylesheets and fonts are Vodafone's (risk register R12).
 */
import fs from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { gzipSync } from 'node:zlib'

import { loadCrawl } from '#jobs/crawler/crawl.ts'
import { ROOT } from '#shared/config.ts'

const { values, positionals } = parseArgs({ allowPositionals: true, options: { site: { type: 'string', default: 'vodafone-eg' } } })
const src = path.resolve(positionals[0] || '')
const crawl = loadCrawl(src)
if (crawl.siteId !== values.site) throw new Error(`${src} is a crawl of ${crawl.siteId}, not ${values.site}`)
const out = path.join(ROOT, 'fixtures/replay', values.site!)
fs.rmSync(out, { recursive: true, force: true })
fs.mkdirSync(path.join(out, 'pages'), { recursive: true })

const pages = crawl.pages.filter((p) => p.snapshot && fs.existsSync(path.join(src, p.snapshot)))
for (const p of pages) {
	const rel = `${p.snapshot}.gz`
	fs.writeFileSync(path.join(out, rel), gzipSync(fs.readFileSync(path.join(src, p.snapshot!)), { level: 9 }))
	p.snapshot = rel
}
let assets = 0
const walk = (dir: string) => {
	for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
		const f = path.join(dir, e.name)
		if (e.isDirectory()) walk(f)
		else {
			const rel = path.relative(src, f)
			fs.mkdirSync(path.dirname(path.join(out, rel)), { recursive: true })
			const data = fs.readFileSync(f)
			if (/\.(css|svg|js)$/.test(f) || !path.extname(f)) fs.writeFileSync(path.join(out, `${rel}.gz`), gzipSync(data, { level: 9 }))
			else fs.writeFileSync(path.join(out, rel), data)
			assets++
		}
	}
}
if (fs.existsSync(path.join(src, 'assets'))) walk(path.join(src, 'assets'))
const { dir: _dir, ...rest } = crawl
fs.writeFileSync(path.join(out, 'crawl.json'), JSON.stringify({ ...rest, pages, errors: [], note: `Replay fixture made from ${crawl.id} on ${new Date().toISOString().slice(0, 10)}: pages with rendered HTML only.` }, null, 1))
fs.writeFileSync(
	path.join(out, 'README.md'),
	`# Replay fixture: ${values.site}\n\nRendered HTML of ${pages.length} public pages captured on ${crawl.startedAt.slice(0, 10)} (signed out, no cookies), with the site's stylesheets and fonts. Served by the demo browser's replay mode (\`npm run demo:live -- --replay\`) and by \`tests/e2e/live-replay.e2e.test.ts\`. Made by \`tools/live-crawl/make-replay.ts\`.\n\nPrivate repository only: the content, stylesheets and fonts belong to Vodafone Egypt.\n\n${pages.map((p) => `- ${p.url}`).join('\n')}\n`,
)
console.log(`${path.relative(ROOT, out)}: ${pages.length} pages, ${assets} asset files`)
