/**
 * Crawls a site with a real browser (ADR-0012): renders each page, extracts structure, saves
 * an HTML snapshot and element screenshots of the visuals for the describer. Breadth-first,
 * scoped by the site config. For live sites (ADR-0028, SPEC-04 §4) it also honours
 * robots.txt, limits depth, paces requests, can stay public-only (no cookies, pages behind a
 * login skipped), removes cookie banners and widgets before extraction, and stops on bot
 * challenges instead of retrying.
 */
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import { type Browser, chromium } from 'playwright'

import type { SiteConfig } from '#shared/config.ts'

import { CANVAS_PROBE, extractPage } from './extract.ts'
import { parseRobots, type RobotsRules, robotsAllows } from './robots.ts'
import type { CrawlResult, PageSnap } from './types.ts'
import { CHALLENGE_TITLE, LOGIN_URL, makeInScope, normalizeUrl as normalizeWith } from './url.ts'

export interface CrawlOptions {
	outDir: string
	browser?: Browser
	log?: (msg: string) => void
	/** Wait after load for late scripts (ms). */
	settleMs?: number
	fetchImpl?: typeof fetch
}

/** Kept for callers that normalise fixture URLs (fixture servers need index.html). */
export function normalizeUrl(u: string): string {
	return normalizeWith(u, { directoryIndex: 'index.html' })
}

/**
 * The origins a crawl may not reach yet (`crawl.origins.<key>.ready: false`): the e-shop until its
 * safeguards are in code (ADR-0060 §1). Checked before anything is fetched.
 */
export function notReadyOrigins(site: SiteConfig): string[] {
	return site.origins.filter((o) => o.key && site.crawl.origins?.[o.key]?.ready === false).map((o) => o.key!)
}

export async function crawlSite(site: SiteConfig, opts: CrawlOptions): Promise<CrawlResult> {
	const blocked = notReadyOrigins(site)
	if (blocked.length) throw new Error(`this crawl includes ${blocked.join(', ')}, which is not ready to be crawled (crawl.origins.${blocked[0]}.ready: false, ADR-0060); leave it out with --origin ${site.origins.filter((o) => !blocked.includes(o.key || '')).map((o) => o.key).join(',') || '<key>'}`)
	const log = opts.log || (() => {})
	const startedAt = new Date().toISOString()
	const id = `crawl-${startedAt.replace(/[-:]/g, '').replace(/\..*/, '')}`
	const dir = path.join(opts.outDir, id)
	fs.mkdirSync(path.join(dir, 'pages'), { recursive: true })
	fs.mkdirSync(path.join(dir, 'visuals'), { recursive: true })

	const rules = { keepQuery: site.crawl.keepQuery, directoryIndex: site.crawl.directoryIndex }
	const norm = (u: string) => normalizeWith(u, rules)
	const inScope = makeInScope({ origins: site.origins.map((o) => o.url), include: site.crawl.include, exclude: site.crawl.exclude })
	const robots = await loadRobots(site, opts.fetchImpl || fetch, log)
	const allowed = (u: string) => {
		const url = new URL(u)
		const r = robots.get(url.origin)
		return !r || robotsAllows(r, url.pathname + url.search)
	}

	const ownBrowser = !opts.browser
	const browser = opts.browser || (await chromium.launch())
	const context = await browser.newContext({
		viewport: { width: 1280, height: 900 },
		deviceScaleFactor: 1,
		...(site.crawl.userAgent ? { userAgent: site.crawl.userAgent } : {}),
	})
	await context.addInitScript(CANVAS_PROBE)
	if (site.crawl.cookies.length && !site.crawl.publicOnly) await context.addCookies(site.crawl.cookies.map((c) => ({ url: c.url, name: c.name, value: c.value })))

	const queue: { url: string; depth: number }[] = []
	const seen = new Set<string>()
	for (const s of site.crawl.start) {
		const u = norm(s)
		if (!seen.has(u)) {
			seen.add(u)
			queue.push({ url: u, depth: 0 })
		}
	}
	const pages: PageSnap[] = []
	const errors: { url: string; error: string }[] = []
	let challenges = 0
	let stopped = ''

	let active = 0
	const worker = async () => {
		const page = await context.newPage()
		while (!stopped && pages.length + errors.length < site.crawl.maxPages) {
			if (!queue.length) {
				if (active === 0) break
				await new Promise((r) => setTimeout(r, 50))
				continue
			}
			const { url, depth } = queue.shift()!
			if (!allowed(url)) {
				errors.push({ url, error: 'disallowed by robots.txt' })
				continue
			}
			active++
			try {
				if (site.crawl.delayMs) await new Promise((r) => setTimeout(r, site.crawl.delayMs))
				const res = await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 })
				await page.waitForTimeout(opts.settleMs ?? 150)
				const status = res?.status() ?? 0
				const title = await page.title()
				if (status === 403 || status === 429 || CHALLENGE_TITLE.test(title)) {
					challenges++
					errors.push({ url, error: `blocked (${status} ${title.slice(0, 60)})` })
					if (challenges >= 3 || challenges / (pages.length + errors.length) > 0.05) stopped = `stopped after ${challenges} blocked responses`
					continue
				}
				const finalUrl = norm(page.url())
				if (finalUrl !== url && !inScope(finalUrl)) {
					errors.push({ url, error: `redirected out of scope to ${finalUrl}` })
					continue
				}
				if (site.crawl.publicOnly && (LOGIN_URL.test(new URL(finalUrl).pathname) || (await page.locator('input[type="password"]:visible').count()) > 0)) {
					errors.push({ url, error: 'login required (skipped: public-only crawl)' })
					continue
				}
				if (site.crawl.ignoreSelectors.length) {
					await page.evaluate((sels) => {
						for (const s of sels) for (const el of document.querySelectorAll(s)) el.remove()
					}, site.crawl.ignoreSelectors)
				}
				const existing = finalUrl !== url ? pages.find((p) => p.url === finalUrl) : undefined
				if (existing) {
					existing.aliases = [...new Set([...(existing.aliases || []), url])]
					continue
				}
				const snap = (await page.evaluate(extractPage, { minItems: site.crawl.collections.minItems })) as PageSnap
				snap.url = finalUrl
				snap.status = status
				if (finalUrl !== url) snap.aliases = [url]
				const key = createHash('sha1').update(finalUrl).digest('hex').slice(0, 10)
				snap.snapshot = `pages/${key}.html`
				fs.writeFileSync(path.join(dir, snap.snapshot), await page.content())
				for (const v of snap.visuals) {
					if (v.hidden || v.width * v.height > 4096 * 4096) continue
					try {
						// Retried once with more time: a missed screenshot drops the picture's description and
						// changes the manifest, so an unchanged site would publish a new version (B-22).
						const shoot = (timeout: number) => page.locator(v.css[0]).first().screenshot({ timeout, animations: 'disabled' })
						const png = await shoot(5000).catch(() => shoot(15_000))
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
				if (site.crawl.maxDepth !== undefined && depth >= site.crawl.maxDepth) continue
				const next = [...snap.links.map((l) => l.href), ...Object.values(snap.alternates)]
				for (const n of next) {
					let u: string
					try {
						u = norm(n)
					} catch {
						continue
					}
					if (!seen.has(u) && inScope(u)) {
						seen.add(u)
						queue.push({ url: u, depth: depth + 1 })
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
	if (stopped) log(`crawl ${stopped}`)

	await context.close()
	if (ownBrowser) await browser.close()
	const result: CrawlResult = { id, siteId: site.id, startedAt, finishedAt: new Date().toISOString(), dir, pages, errors, ...(stopped ? { stopped } : {}) }
	fs.writeFileSync(path.join(dir, 'crawl.json'), JSON.stringify(result, null, 1))
	return result
}

async function loadRobots(site: SiteConfig, fetchImpl: typeof fetch, log: (m: string) => void): Promise<Map<string, RobotsRules>> {
	const out = new Map<string, RobotsRules>()
	// Local fixture servers have no robots.txt; only real origins are checked.
	for (const o of site.origins) {
		const origin = new URL(o.url).origin
		if (/^https?:\/\/(localhost|127\.0\.0\.1)(:|$)/.test(origin)) continue
		try {
			const res = await fetchImpl(`${origin}/robots.txt`, { signal: AbortSignal.timeout(10_000) })
			if (res.ok) out.set(origin, parseRobots(await res.text(), site.crawl.userAgent || '*'))
		} catch (e) {
			log(`robots.txt unavailable for ${origin}: ${(e as Error).message}`)
		}
	}
	return out
}

/** Loads a crawl saved earlier (or taken by the in-browser crawler, ADR-0032). */
export function loadCrawl(dir: string): CrawlResult {
	const result = JSON.parse(fs.readFileSync(path.join(dir, 'crawl.json'), 'utf8')) as CrawlResult
	return { ...result, dir }
}
