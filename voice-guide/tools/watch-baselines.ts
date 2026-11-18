/**
 * Builds the page watch's demo data (ADR-0078 Decision 11; phase 6 design §4.8, Q8, M6): writes
 * experiences/src/watch/demo.js from the 23 Oct capture (fixtures/replay/vodafone-eg, the rendered pages; the
 * 23 Oct baseline, never overwritten). In Chromium (Playwright, offline: every request is refused but one blank
 * page on Vodafone's https origin, so crypto.subtle works), with the real code the layer runs: the live adapter's
 * readPage, the Pocket's recordFrom and reconcile, the watch's read.js (findCard, cardDigest, pageDigest,
 * READER_VERSION) and its mask, bundled with esbuild as the watch-read integration test does.
 *
 * For each language, the two demo stickers exactly as the Pocket keeps them when pocketed on the day of the
 * capture (Home › Other services › "Internet Bundles", Services › Vodafone Cash › "Vodafone Cash"): Vodafone's
 * public copy as published, dated (AGENTS §4.3); no personal data. With them, the baselines check.js compares:
 * the card's hash and link on its own page, the page its link opens (text and links hashes).
 *
 *   npm run watch:baselines            writes demo.js, dated today
 *   tests/integration/watch-baselines.test.ts checks demo.js is what buildDemo() makes, byte for byte
 */
import fs from 'node:fs'
import path from 'node:path'
import { gunzipSync } from 'node:zlib'

import * as esbuild from 'esbuild'
import { chromium } from 'playwright'

import { ROOT } from '#shared/config.ts'

const ORIGIN = 'https://web.vodafone.com.eg'
const CAPTURE = 'vodafone-eg'
const REPLAY = path.join(ROOT, 'fixtures/replay', CAPTURE)
const SRC = path.join(ROOT, '../experiences/src')
export const DEMO_FILE = path.join(SRC, 'watch/demo.js')

/** The two demo cards (design M6): the page each is on, its item, the page it opens. Same ids in both languages. */
const CARDS = [
	{ page: 'home', item: 'mobile-internet-bundles', opens: 'mobile-internet-bundles' },
	{ page: 'services', item: 'vodafone-cash', opens: 'vodafone-cash' },
]
const LANGS = ['en', 'ar'] as const

interface Saved {
	url: string
	snapshot?: string
}
interface Crawl {
	startedAt: string
	pages: Saved[]
}
interface Manifest {
	pages: { id: string; variants: Record<string, { url: string; aliases?: string[] }> }[]
}

const crawl = () => JSON.parse(fs.readFileSync(path.join(REPLAY, 'crawl.json'), 'utf8')) as Crawl

/** The saved page at `pathname`, as served (the rendered capture). */
const htmlOf = (c: Crawl, pathname: string) => {
	const p = c.pages.find((x) => x.snapshot && new URL(x.url).pathname === pathname)
	if (!p) throw new Error(`${pathname} is not in the ${CAPTURE} capture`)
	const buf = fs.readFileSync(path.join(REPLAY, p.snapshot!))
	return (p.snapshot!.endsWith('.gz') ? gunzipSync(buf) : buf).toString('utf8')
}

/** The knowledge base's page id for a URL, as the page-map answer gives the layer (services/shared/kb-index.ts), or null. */
const pageIdOf = (url: string) => {
	const m = JSON.parse(fs.readFileSync(path.join(ROOT, 'config/kb/vodafone-eg.manifest.json'), 'utf8')) as Manifest
	for (const p of m.pages) for (const v of Object.values(p.variants || {})) if (v.url === url || v.aliases?.includes(url)) return p.id
	return null
}

/** The `generated` date in a demo.js header, or null. */
export const generatedOnOf = (text: string) => text.match(/^ \* Generated (\d{4}-\d{2}-\d{2}) /m)?.[1] ?? null

/** What the layer hands the Pocket and the watch, bundled together. */
const ENTRY = `
import { readPage } from './host/live-adapter.js'
import { reconcile, recordFrom } from './pocket/record.js'
import * as read from './watch/read.js'
import { normalise } from './watch/url.js'
import { maskContent } from './watch/mask.js'
window.__w = { readPage, reconcile, recordFrom, read, normalise, maskContent }
`

interface Job {
	lang: string
	path: string
	html: string
	title: string | null
	pageId: string | null
	item: string
	opensPath: string
	opensHtml: string
	key: string
}

/** demo.js's text, made from the capture; `generatedOn` (YYYY-MM-DD) is the header's date. */
export async function buildDemo({ generatedOn }: { generatedOn: string }): Promise<string> {
	const c = crawl()
	const at = Date.parse(c.startedAt)
	const jobs: Job[] = LANGS.flatMap((lang) =>
		CARDS.map((d) => {
			const p = `/${lang}/${d.page}`
			const html = htmlOf(c, p)
			// The Pocket's page title: the document's, before its " | Vodafone" tail (host/demos/pocket.js titleOf).
			const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '').trim()
			return { lang, path: p, html, title, pageId: pageIdOf(ORIGIN + p), item: d.item, opensPath: `/${lang}/${d.opens}`, opensHtml: htmlOf(c, `/${lang}/${d.opens}`), key: `s-demo-${lang}-${d.item}` }
		}),
	)
	const bundle = await esbuild.build({ stdin: { contents: ENTRY, resolveDir: SRC, loader: 'js' }, bundle: true, format: 'iife', write: false, target: 'es2022' })
	const browser = await chromium.launch()
	try {
		const page = await browser.newPage()
		const blank = `${ORIGIN}/__aixc-watch-baselines`
		await page.route('**/*', (route) => (route.request().url() === blank ? route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>baselines</title>' }) : route.abort()))
		await page.goto(blank)
		await page.addScriptTag({ content: bundle.outputFiles[0]!.text })
		const out = await page.evaluate(
			async ([jobs, origin, at]) => {
				const w = (window as any).__w
				const parse = (h: string) => new DOMParser().parseFromString(h, 'text/html')
				// The document title as the browser has it, cut as the Pocket cuts it.
				const titleOf = (t: string) => {
					const d = parse(`<title>${t}</title>`)
					return (d.title || '').split(/\s+[|–-]\s+/)[0]!.trim() || null
				}
				const list: any[] = []
				for (const j of jobs) {
					const doc = parse(j.html)
					const { model } = w.readPage(doc, { origin, path: j.path, search: '' })
					const section = model?.sections.find((s: any) => s.items.some((i: any) => i.id === j.item))
					if (!section) throw new Error(`${j.path}: no card ${j.item}`)
					const item = section.items.find((i: any) => i.id === j.item)
					const dir = j.lang === 'ar' ? 'rtl' : 'ltr'
					// As the Pocket's pocket() makes it on that page (pocket.js recordFrom with seams.page, the host's pageNow()).
					const sticker = w.recordFrom({ item, section, page: { path: j.path, search: '', site: 'web', lang: j.lang, dir, title: titleOf(j.title ?? ''), pageId: j.pageId }, model, now: at, key: j.key })
					// The card as check.js reads it from the fetched page: found by reconcile, hashed, its link kept apart.
					const cardUrl = w.normalise(j.path, origin)
					const hit = w.read.findCard(doc, sticker, { read: w.readPage, reconcile: w.reconcile, origin })
					if (hit.item?.id !== j.item) throw new Error(`${j.path}: reconcile finds ${hit.item?.id} for ${j.item}`)
					const d = await w.read.cardDigest(hit.item, { mask: w.maskContent })
					const href = d.href ?? (hit.section?.cta?.href ? w.normalise(hit.section.cta.href, cardUrl) : null)
					// The page its link opens, as check.js reads it after a fetch of that URL.
					const pageUrl = w.normalise(sticker.cta?.href, cardUrl)
					if (pageUrl !== w.normalise(j.opensPath, origin)) throw new Error(`${j.path}: ${j.item} opens ${pageUrl}, not ${j.opensPath}`)
					const p = await w.read.pageDigest(parse(j.opensHtml), { mask: w.maskContent, origin, url: pageUrl, minChars: 200 })
					if (!p?.staticEnough) throw new Error(`${pageUrl}: not a static page`)
					list.push({ lang: j.lang, sticker, card: { url: cardUrl, hash: d.hash, href }, page: { url: pageUrl, hash: p.textHash, linksHash: p.linksHash } })
				}
				return { list, reader: w.read.READER_VERSION as string }
			},
			[jobs, ORIGIN, at] as const,
		)
		const demo = Object.fromEntries(LANGS.map((lang) => [lang, out.list.filter((x) => x.lang === lang).map(({ lang: _, ...rest }) => rest)]))
		return [
			'/**',
			' * The page watch\'s demo data (voice-guide ADR-0078 Decision 11; phase 6 design §4.8): GENERATED by',
			' * voice-guide/tools/watch-baselines.ts (npm run watch:baselines). Never edit by hand:',
			' * tests/integration/watch-baselines.test.ts checks it is what the tool makes, byte for byte.',
			` * Generated ${generatedOn} from the ${CAPTURE} capture of ${c.startedAt.slice(0, 10)} (the 23 Oct baseline), reader ${out.reader}.`,
			' *',
			' * Per language, the two example stickers as the Pocket keeps them when pocketed on the day of the capture',
			' * (Vodafone\'s public copy as published, dated; no personal data) and the hashes check.js compares: the card',
			' * on its own page (its reading and its link) and the page its link opens (text and links). No page text.',
			' * host/demos/watch.js loads this module only when fill() runs.',
			' */',
			`export const CAPTURE = ${JSON.stringify(CAPTURE)}`,
			`export const READER = ${JSON.stringify(out.reader)}`,
			`export const BASELINE_AT = ${at}`,
			`export const DEMO = ${JSON.stringify(demo, null, 2)}`,
			'',
		].join('\n')
	} finally {
		await browser.close()
	}
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
	const text = await buildDemo({ generatedOn: new Date().toISOString().slice(0, 10) })
	fs.writeFileSync(DEMO_FILE, text)
	console.log(`wrote ${path.relative(process.cwd(), DEMO_FILE)} (${text.length} bytes)`)
}
