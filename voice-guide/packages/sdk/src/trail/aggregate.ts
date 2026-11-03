/**
 * The approved anonymous contribution (ADR-0037 §6), built only when the site and the platform
 * both enable aggregation (off by default). The batch is assembled from a whitelist, never by
 * copying records: destination and page ids from the knowledge base, a coarse band, whether it
 * was activated, and a UTC day. Nothing else exists in it to leak.
 */
import type { InterestContributionBatch } from '#kb'

import { TRAIL_CONFIG } from './config.ts'
import { band } from './interest.ts'
import type { ElementInterest } from './types.ts'

const ID = /^[a-z0-9][a-z0-9._:-]*$/i
export const MAX_CONTRIBUTIONS = 10

export function contributionBatch(input: { siteId: string; kbVersionId: string; records: ElementInterest[]; knownDestinations: Map<string, string>; now: number }): InterestContributionBatch | null {
	const best = new Map<string, { pageId: string; interestBand: 'warm' | 'hot'; activated: boolean; score: number }>()
	for (const r of input.records) {
		const id = r.destinationId
		const pageId = id ? input.knownDestinations.get(id) : undefined
		const b = band(r, TRAIL_CONFIG.attention)
		if (!id || !pageId || !b || !ID.test(id) || !ID.test(pageId)) continue
		const prev = best.get(id)
		if (!prev || r.score > prev.score) best.set(id, { pageId, interestBand: prev?.interestBand === 'hot' ? 'hot' : b, activated: (prev?.activated ?? false) || r.activationCount > 0, score: r.score })
	}
	const contributions = [...best.entries()]
		.sort((a, b) => b[1].score - a[1].score)
		.slice(0, MAX_CONTRIBUTIONS)
		.map(([destinationId, x]) => ({ pageId: x.pageId, destinationId, interestBand: x.interestBand, activated: x.activated }))
	if (!contributions.length) return null
	return { schema: 'vg-interest-contribution/v1', siteId: input.siteId, kbVersionId: input.kbVersionId, dayBucket: new Date(input.now).toISOString().slice(0, 10), contributions }
}
