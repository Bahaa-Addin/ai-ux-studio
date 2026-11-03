/**
 * Meaningful attention (SPEC-06 §4): a deterministic, explainable score from capped visible time,
 * deliberate pointer dwell, focus, returns, activation and reveals, minus a penalty for passing
 * through; then up to three diverse knowledge destinations for a step. Pure: unit-tested in Node.
 */
import { TRAIL_CONFIG } from './config.ts'
import type { ElementInterest, ExploredItem } from './types.ts'

type Attention = (typeof TRAIL_CONFIG)['attention']

export function emptyInterest(stepId: string, key: string, at = 0): ElementInterest {
	return { stepId, key, visibleDwellMs: 0, engagedHoverMs: 0, focusMs: 0, focusCount: 0, revisitCount: 0, activationCount: 0, revealCount: 0, passThroughCount: 0, deliberate: false, score: 0, lastEngagedAt: at }
}

/** Deliberate attention: lingering, focusing, opening, returning or revealing. Seeing it scroll past is not. */
export function isDeliberate(r: ElementInterest, cfg: Attention = TRAIL_CONFIG.attention): boolean {
	return r.engagedHoverMs >= cfg.dwellMs || r.focusMs >= cfg.focusMs || r.activationCount > 0 || r.revisitCount > 0 || r.revealCount > 0
}

export function scoreInterest(r: ElementInterest, cfg: Attention = TRAIL_CONFIG.attention): number {
	const c = cfg.caps
	const w = cfg.weights
	const s =
		(w.visiblePerSec * Math.min(r.visibleDwellMs, c.visibleMs)) / 1000 +
		(w.hoverPerSec * Math.min(r.engagedHoverMs, c.hoverMs)) / 1000 +
		w.focus * Math.min(r.focusCount, c.focus) +
		w.revisit * Math.min(r.revisitCount, c.revisit) +
		w.activation * Math.min(r.activationCount, c.activation) +
		w.reveal * Math.min(r.revealCount, c.reveal) -
		w.passThrough * Math.min(r.passThroughCount, c.passThrough)
	return Math.round(Math.max(0, s) * 1000) / 1000
}

/** Recomputes the derived fields after the counters changed. */
export function settle(r: ElementInterest, cfg: Attention = TRAIL_CONFIG.attention): ElementInterest {
	r.deliberate = isDeliberate(r, cfg)
	r.score = scoreInterest(r, cfg)
	return r
}

export function band(r: ElementInterest, cfg: Attention = TRAIL_CONFIG.attention): 'warm' | 'hot' | null {
	if (!r.deliberate) return null
	return r.score >= cfg.bands.hot ? 'hot' : r.score >= cfg.bands.warm ? 'warm' : null
}

export interface CatalogEntry {
	id: string
	pageId: string
	kind: string
	topic: string
	title: ExploredItem['title']
	context: ExploredItem['context']
	questions: ExploredItem['questions']
	popular?: boolean
	/** Never shown as explored: navigation, footer, commit points, the page itself. */
	excluded?: boolean
}

/**
 * Up to `maxShown` explored destinations for one step: known destinations only, deliberate only,
 * deduplicated, at most one per topic before a second from the same topic is considered (and that
 * one at a penalty), deliberate activation before accidental hover. Fewer is fine; never filler.
 */
export function selectTop(records: ElementInterest[], catalog: Map<string, CatalogEntry>, cfg: Attention = TRAIL_CONFIG.attention): ExploredItem[] {
	const pool = records
		.filter((r) => r.destinationId && r.deliberate && r.score >= cfg.minScore)
		.map((r) => ({ r, c: catalog.get(r.destinationId!) }))
		.filter((x): x is { r: ElementInterest; c: CatalogEntry } => !!x.c && !x.c.excluded)
	const seen = new Set<string>()
	const unique = pool.filter((x) => (seen.has(x.c.id) ? false : (seen.add(x.c.id), true)))
	const picked: { r: ElementInterest; c: CatalogEntry }[] = []
	const topics = new Map<string, number>()
	while (picked.length < cfg.maxShown) {
		let best: { r: ElementInterest; c: CatalogEntry; s: number } | null = null
		for (const x of unique) {
			if (picked.includes(x)) continue
			const same = topics.get(x.c.topic) || 0
			const s = x.r.score * cfg.diversityPenalty ** same + (x.r.activationCount > 0 ? 0.001 : 0)
			if (s < cfg.minScore) continue
			if (!best || s > best.s || (s === best.s && x.c.id < best.c.id)) best = { ...x, s }
		}
		if (!best) break
		const chosen = unique.find((x) => x.c.id === best!.c.id)!
		picked.push(chosen)
		topics.set(best.c.topic, (topics.get(best.c.topic) || 0) + 1)
	}
	return picked.map(({ r, c }) => ({
		destinationId: c.id,
		pageId: c.pageId,
		kind: c.kind,
		title: c.title,
		context: c.context,
		reason: r.revisitCount > 0 ? 'returned' : r.activationCount > 0 || r.revealCount > 0 ? 'opened' : 'explored',
		questions: c.questions,
		...(c.popular ? { popular: true } : {}),
	}))
}
