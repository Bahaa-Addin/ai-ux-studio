/**
 * Visual understanding at crawl time (ADR-0013). Each image, canvas, SVG or
 * WebGL element gets a short text description per language, so at runtime the
 * guide can answer "what does this banner say?" without any model call.
 *
 * Order of sources: page annotations (data-kb-describe-*), vision model
 * (OpenAI-compatible chat API with image input, cached by image hash), then
 * whatever the markup says (alt, aria, SVG title/desc, figcaption, heading).
 */
import fs from 'node:fs'
import path from 'node:path'

import type { Store } from '#shared/store/index.ts'

import type { CrawlResult, PageSnap, VisualSnap } from '../crawler/types.ts'

export interface VisualDescription {
	descriptions: Record<string, string>
	source: 'metadata' | 'vision' | 'curated'
	confidence: number
}

export interface VisionConfig {
	baseUrl?: string
	apiKey?: string
	model?: string
}

export interface DescribeOptions {
	languages: string[]
	vision: VisionConfig
	store?: Store
	/** Upper bound of vision calls per crawl (cost control). */
	maxVisionCalls?: number
	log?: (m: string) => void
	fetchImpl?: typeof fetch
}

/** Key of a visual inside a crawl: page URL plus element index. */
export const visualKey = (pageUrl: string, index: number) => `${pageUrl}#${index}`

const PHRASES: Record<string, Record<string, (s: string) => string>> = {
	en: {
		link: (t) => `An image that links to ${t}.`,
		chart: (t) => `A chart: ${t}.`,
		image: (t) => `An image near "${t}".`,
		map: (t) => `${t}.`,
	},
	ar: {
		link: (t) => `صورة بتفتح صفحة ${t}.`,
		chart: (t) => `رسم بياني: ${t}.`,
		image: (t) => `صورة بجانب «${t}».`,
		map: (t) => `${t}.`,
	},
}

const sentence = (s: string) => (/[.!؟?。]$/.test(s.trim()) ? s.trim() : `${s.trim()}.`)

/**
 * Alt and title texts as authors write them on real sites: HTML pasted into alt attributes, layout
 * words ("main desktop banner") and file names ("pablo", "img_23"). Returns '' when nothing
 * meaningful is left, so the next source (heading, vision, curation) is used instead.
 */
export function cleanAlt(s: string | undefined): string {
	if (!s) return ''
	let t = s
		.replace(/<[^>]*>/g, ' ')
		.replace(/&nbsp;/g, ' ')
		.replace(/&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/&#39;|&apos;/g, "'")
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/\s+/g, ' ')
		.trim()
	t = t.replace(/\s*(main\s+)?(desktop|mobile|tablet|web)\s+(banner|image|img|version)\s*$/i, '').trim()
	if (/^(pablo|image|img|photo|picture|banner|untitled|screenshot|logo|icon|frame|welcome|h1)\d*$/i.test(t)) return ''
	if (/^[a-z0-9]+([_-][a-z0-9]+)+(\.(png|jpe?g|webp|gif|svg))?$/i.test(t)) return ''
	return t
}

/** Description from markup only, in the page's own language. */
export function describeFromMetadata(v: VisualSnap, page: PageSnap, linkTitle?: string): VisualDescription | null {
	const m = v.meta
	const lang = page.lang || 'en'
	const ph = PHRASES[lang] || PHRASES.en
	if (m.kbDescribe && Object.keys(m.kbDescribe).length) return { descriptions: m.kbDescribe, source: 'curated', confidence: 1 }
	if (v.kind === 'svg') {
		const t = m.svgTitle || m.labelledBy || m.ariaLabel
		const parts = [t, m.svgDesc, m.figcaption].filter(Boolean) as string[]
		if (parts.length) return { descriptions: { [lang]: parts.map(sentence).join(' ') }, source: 'metadata', confidence: m.svgDesc ? 0.8 : 0.6 }
		if (m.svgText) return { descriptions: { [lang]: ph.map(m.svgText) }, source: 'metadata', confidence: 0.5 }
	}
	const explicit = [m.alt, m.ariaLabel, m.labelledBy, m.title, m.describedBy, m.figcaption].map(cleanAlt).filter(Boolean)
	if (explicit.length) {
		const base = v.kind === 'canvas' || v.kind === 'webgl' ? [m.heading, ...explicit].filter(Boolean) : explicit
		return { descriptions: { [lang]: [...new Set(base as string[])].map(sentence).join(' ') }, source: 'metadata', confidence: 0.6 }
	}
	if ((v.kind === 'canvas' || v.kind === 'webgl') && m.heading) return { descriptions: { [lang]: ph.chart(m.heading) }, source: 'metadata', confidence: 0.3 }
	if (m.linkHref && linkTitle) return { descriptions: { [lang]: ph.link(linkTitle) }, source: 'metadata', confidence: 0.25 }
	if (m.heading) return { descriptions: { [lang]: ph.image(m.heading) }, source: 'metadata', confidence: 0.2 }
	return null
}

export async function describeWithVision(
	png: Buffer,
	ctx: { languages: string[]; pageTitle: string; heading?: string; kind: string },
	cfg: Required<Pick<VisionConfig, 'baseUrl' | 'model'>> & { apiKey?: string },
	fetchImpl: typeof fetch = fetch,
): Promise<VisualDescription> {
	const prompt =
		`Page: ${ctx.pageTitle}. Nearby heading: ${ctx.heading || 'none'}. Element type: ${ctx.kind}.\n` +
		`Describe what this ${ctx.kind} shows for a voice assistant that reads it aloud: at most two short sentences per language. ` +
		`Include visible text, offers, prices, dates and chart values; do not guess what is not visible. ` +
		`Languages: ${ctx.languages.join(', ')}. Reply with JSON only: {"descriptions": {${ctx.languages.map((l) => `"${l}": "..."`).join(', ')}}, "confidence": 0.0-1.0}`
	const res = await fetchImpl(`${cfg.baseUrl.replace(/\/$/, '')}/chat/completions`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}) },
		body: JSON.stringify({
			model: cfg.model,
			response_format: { type: 'json_object' },
			messages: [
				{ role: 'system', content: 'You describe website images for a multilingual voice assistant. Reply with JSON only.' },
				{
					role: 'user',
					content: [
						{ type: 'text', text: prompt },
						{ type: 'image_url', image_url: { url: `data:image/png;base64,${png.toString('base64')}` } },
					],
				},
			],
		}),
		signal: AbortSignal.timeout(60_000),
	})
	if (!res.ok) throw new Error(`vision ${res.status}: ${(await res.text()).slice(0, 200)}`)
	const body = (await res.json()) as any
	const text: string = body.choices?.[0]?.message?.content || ''
	const json = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ''))
	const descriptions: Record<string, string> = {}
	for (const l of ctx.languages) if (typeof json.descriptions?.[l] === 'string' && json.descriptions[l].trim()) descriptions[l] = json.descriptions[l].trim()
	if (!Object.keys(descriptions).length) throw new Error('vision returned no descriptions')
	const confidence = Math.max(0, Math.min(1, Number(json.confidence ?? 0.7)))
	return { descriptions, source: 'vision', confidence }
}

/** Describes every visual of a crawl. Returns descriptions keyed by visualKey(). */
export async function describeCrawl(crawl: CrawlResult, opts: DescribeOptions): Promise<{ results: Map<string, VisualDescription>; visionCalls: number; cacheHits: number }> {
	const log = opts.log || (() => {})
	const results = new Map<string, VisualDescription>()
	const titleByUrl = new Map(crawl.pages.map((p) => [p.url, p.h1 || p.title]))
	const vision = opts.vision.baseUrl && opts.vision.model ? { baseUrl: opts.vision.baseUrl, model: opts.vision.model, apiKey: opts.vision.apiKey } : null
	let visionCalls = 0
	let cacheHits = 0
	for (const page of crawl.pages) {
		for (const v of page.visuals) {
			const key = visualKey(page.url, v.index)
			const linkTitle = v.meta.linkHref ? titleByUrl.get(v.meta.linkHref.split('#')[0].split('?')[0]) : undefined
			const meta = describeFromMetadata(v, page, linkTitle)
			if (meta?.source === 'curated') {
				results.set(key, meta)
				continue
			}
			if (vision && v.screenshot) {
				const cacheKey = `${v.screenshot.sha256}:${vision.model}:${opts.languages.join(',')}`
				const cached = opts.store ? await opts.store.cacheGet<VisualDescription>('vision', cacheKey) : null
				if (cached) {
					cacheHits++
					results.set(key, cached)
					continue
				}
				if (visionCalls < (opts.maxVisionCalls ?? 200)) {
					try {
						visionCalls++
						const png = fs.readFileSync(path.join(crawl.dir, v.screenshot.file))
						const d = await describeWithVision(png, { languages: opts.languages, pageTitle: page.title, heading: v.meta.heading, kind: v.kind }, vision, opts.fetchImpl)
						results.set(key, d)
						await opts.store?.cachePut('vision', cacheKey, d)
						continue
					} catch (e) {
						log(`vision failed for ${key}: ${(e as Error).message}`)
					}
				}
			}
			if (meta) results.set(key, meta)
		}
	}
	return { results, visionCalls, cacheHits }
}
