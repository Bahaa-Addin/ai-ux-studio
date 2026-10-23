/**
 * Bundles the in-browser crawler (ADR-0032) into one IIFE that defines window.__vgCrawler,
 * and prints the start call for a site config, ready to paste into a DevTools console or to run
 * through a browser-automation tool on a tab of the site.
 *
 *   node tools/live-crawl/bundle.ts --site vodafone-eg --origin https://web.vodafone.com.eg \
 *     [--capture '<regex>'] [--max-pages N] [--max-depth N] [--no-minify]
 */
import fs from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'

import * as esbuild from 'esbuild'

import { loadPlatformConfig, loadSiteConfig, ROOT } from '#shared/config.ts'

import type { BrowserCrawlConfig } from './browser-crawler.ts'

const { values } = parseArgs({ options: { site: { type: 'string', default: 'vodafone-eg' }, origin: { type: 'string' }, capture: { type: 'string' }, out: { type: 'string' }, 'max-pages': { type: 'string' }, 'max-depth': { type: 'string' }, 'no-minify': { type: 'boolean', default: false }, 'scripts-for': { type: 'string' }, 'also-exclude': { type: 'string' } } })
const platform = loadPlatformConfig()
const site = loadSiteConfig(path.join(platform.sitesDir, `${values.site}.yaml`))
const origin = values.origin || site.origins[0].url
const outDir = values.out || path.join(platform.dataDir, 'live-crawl')
fs.mkdirSync(outDir, { recursive: true })

const built = await esbuild.build({
	entryPoints: [path.join(ROOT, 'tools/live-crawl/browser-crawler.ts')],
	bundle: true,
	format: 'iife',
	globalName: '__vgCrawler',
	platform: 'browser',
	target: 'es2022',
	minify: !values['no-minify'],
	write: false,
	legalComments: 'none',
	footer: { js: 'globalThis.__vgCrawler = __vgCrawler;' },
})
const code = built.outputFiles[0].text

const config: BrowserCrawlConfig = {
	siteId: site.id,
	start: site.crawl.start.filter((u) => new URL(u).origin === new URL(origin).origin && !(values['also-exclude'] && new RegExp(values['also-exclude']).test(u))),
	origins: [origin],
	include: site.crawl.include,
	exclude: [...site.crawl.exclude, ...(values['also-exclude'] ? [values['also-exclude']] : [])],
	keepQuery: site.crawl.keepQuery,
	maxPages: values['max-pages'] ? Number(values['max-pages']) : site.crawl.maxPages,
	maxDepth: values['max-depth'] ? Number(values['max-depth']) : (site.crawl.maxDepth ?? 2),
	delayMs: Math.max(site.crawl.delayMs, 1000),
	minItems: site.crawl.collections.minItems,
	ignoreSelectors: site.crawl.ignoreSelectors,
	scriptsFor: values['scripts-for'] ?? site.crawl.scriptsFor,
	captureHtml: values.capture,
}
const host = new URL(origin).host.replace(/[^a-z0-9]+/gi, '-')
const file = path.join(outDir, `crawler-${host}.js`)
fs.writeFileSync(file, `${code}\n;__vgCrawler.start(${JSON.stringify(config)});\n'started';\n`)
console.log(`${file} (${Math.round(fs.statSync(file).size / 1024)} KB), ${config.start.length} start pages on ${origin}`)
