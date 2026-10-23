/**
 * Crawls the cloned pages with a real browser (ADR-0012): renders each page,
 * extracts structure, saves an HTML snapshot and element screenshots of the
 * visuals for the describer. Breadth-first, scoped by the site config.
 */
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import { type Browser, chromium } from 'playwright'

import type { SiteConfig } from '#shared/config.ts'

import { CANVAS_PROBE, extractPage } from './extract.ts'
import type { CrawlResult, PageSnap } from './types.ts'

export interface CrawlOptions {
	outDir: string
	browser?: Browser
	log?: (msg: string) => void
	/** Wait after load for late scripts (ms). */
	settleMs?: number
}

export function normalizeUrl(u: string): string {
	const url = new URL(u)
	url.hash = ''
	url.search = ''
	if (url.pathname.endsWith('/')) url.pathname += 'index.html'
	return url.toString()
}

export async function crawlSite(site: SiteConfig, opts: CrawlOptions): Promise<CrawlResult> {
	const log = opts.log || (() => {})
	const startedAt = new Date().toISOString()
	const id = `crawl-${startedAt.replace(/[-:]/g, '').replace(/\..*/, '')}`
	const dir = path.join(opts.outDir, id)
	fs.mkdirSync(path.join(dir, 'pages'), { recursive: true })
	fs.mkdirSync(path.join(dir, 'visuals'), { recursive: true })

	const include = site.crawl.include.map((r) => new RegExp(r))
	const exclude = site.crawl.exclude.map((r) => new RegExp(r))
	const origins = new Set(site.origins.map((o) => new URL(o.url).origin))
	const inScope = (u: string) => {
		const url = new URL(u)
		if (!origins.has(url.origin)) return false
		if (include.length && !include.some((r) => r.test(u))) return false
		if (exclude.some((r) => r.test(u))) return false
		return /\.html?$|\/[^.]*$/.test(url.pathname)
	}

	const ownBrowser = !opts.browser
	const browser = opts.browser || (await chromium.launch())
	const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 })
	await context.addInitScript(CANVAS_PROBE)
	if (site.crawl.cookies.length) await context.addCookies(site.crawl.cookies.map((c) => ({ url: c.url, name: c.name, value: c.value })))

	const queue = [...new Set(site.crawl.start.map(normalizeUrl))]
	const seen = new Set(queue)
	const pages: PageSnap[] = []
	const errors: { url: string; error: string }[] = []

	let active = 0
	const worker = async () => {
		const page = await context.newPage()
		while (pages.length + errors.length < site.crawl.maxPages) {
			if (!queue.length) {
				if (active === 0) break
				await new Promise((r) => setTimeout(r, 50))
				continue
			}
			const url = queue.shift()!
			active++
			try {
				const res = await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 })
				await page.waitForTimeout(opts.settleMs ?? 150)
				const finalUrl = normalizeUrl(page.url())
				if (finalUrl !== url && !inScope(finalUrl)) {
					errors.push({ url, error: `redirected out of scope to ${finalUrl}` })
					continue
				}
				const snap = (await page.evaluate(extractPage, { minItems: site.crawl.collections.minItems })) as PageSnap
				snap.url = finalUrl
				snap.status = res?.status() ?? 0
				const key = createHash('sha1').update(finalUrl).digest('hex').slice(0, 10)
				snap.snapshot = `pages/${key}.html`
				fs.writeFileSync(path.join(dir, snap.snapshot), await page.content())
				for (const v of snap.visuals) {
					if (v.hidden || v.width * v.height > 4096 * 4096) continue
					try {
						const png = await page.locator(v.css[0]).first().screenshot({ timeout: 5000, animations: 'disabled' })
						const sha256 = createHash('sha256').update(png).digest('hex')
						const file = `visuals/${key}-${v.index}.png`
						fs.writeFileSync(path.join(dir, file), png)
						v.screenshot = { file, sha256 }
					} catch (e) {
						log(`  screenshot failed for ${v.css[0]} on ${finalUrl}: ${(e as Error).message.split('\n')[0]}`)
					}
				}
				pages.push(snap)
				log(`crawled ${finalUrl} (${snap.lang}) sections=${snap.sections.length} collections=${snap.collections.length} visuals=${snap.visuals.length}`)
				const next = [...snap.links.map((l) => l.href), ...Object.values(snap.alternates)]
				for (const n of next) {
					let u: string
					try {
						u = normalizeUrl(n)
					} catch {
						continue
					}
					if (!seen.has(u) && inScope(u)) {
						seen.add(u)
						queue.push(u)
					}
				}
			} catch (e) {
				errors.push({ url, error: (e as Error).message.split('\n')[0] })
				log(`failed ${url}: ${(e as Error).message.split('\n')[0]}`)
			} finally {
				active--
			}
		}
		await page.close()
	}
	await Promise.all(Array.from({ length: site.crawl.concurrency }, () => worker()))

	await context.close()
	if (ownBrowser) await browser.close()
	const result: CrawlResult = { id, siteId: site.id, startedAt, finishedAt: new Date().toISOString(), dir, pages, errors }
	fs.writeFileSync(path.join(dir, 'crawl.json'), JSON.stringify(result, null, 1))
	return result
}
