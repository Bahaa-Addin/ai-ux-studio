/**
 * The active site experience profile per site (ADR-0036), indexed for the knowledge service (the
 * browser's page map) and the router (validating a chip's hint). A profile is used only while it
 * targets the active knowledge version: after a knowledge activation the old profile is ignored
 * and chips simply do not appear until a new profile is built.
 */
import { type DestinationExperience, publishedQuestions, questionKey, type SiteExperienceProfile, type SuggestedQuestion } from '#kb'

import type { Store } from './store/index.ts'

export interface ExperienceIndex {
	profile: SiteExperienceProfile
	byDestination: Map<string, DestinationExperience>
	/** Verified questions only, by id. */
	questions: Map<string, { destinationId: string; lang: string; question: SuggestedQuestion }>
	published(destinationId: string): Record<string, { id: string; text: string; intent: string }[]>
}

export function buildExperienceIndex(profile: SiteExperienceProfile): ExperienceIndex {
	const byDestination = new Map(profile.destinations.map((d) => [d.destinationId, d]))
	const questions = new Map<string, { destinationId: string; lang: string; question: SuggestedQuestion }>()
	for (const d of profile.destinations)
		for (const [lang, qs] of Object.entries(d.suggestedQuestions))
			for (const q of qs) if (q.validation.status === 'verified') questions.set(q.id, { destinationId: d.destinationId, lang, question: q })
	return {
		profile,
		byDestination,
		questions,
		published: (id) => {
			const d = byDestination.get(id)
			return d ? publishedQuestions(d) : {}
		},
	}
}

/**
 * A chip's hint is trusted only as far as the profile vouches for it: a verified question with
 * this id, shown for this destination, whose text is what the person sent (ADR-0038).
 */
export function verifiedHint(x: ExperienceIndex | null, hint: { destinationId: string; questionId?: string }, utterance: string): SuggestedQuestion | null {
	if (!x || !hint.questionId) return null
	const q = x.questions.get(hint.questionId)
	if (!q || q.destinationId !== hint.destinationId) return null
	return questionKey(q.question.text) === questionKey(utterance) ? q.question : null
}

export class ExperienceCache {
	#entries = new Map<string, { index: ExperienceIndex | null; checkedAt: number }>()
	readonly store: Store
	readonly checkMs: number
	constructor(store: Store, checkMs = 5000) {
		this.store = store
		this.checkMs = checkMs
	}

	/** The active profile, if it targets this knowledge version. */
	async get(siteId: string, kbVersionId: string): Promise<ExperienceIndex | null> {
		const e = this.#entries.get(siteId)
		const now = Date.now()
		let index = e && now - e.checkedAt < this.checkMs ? e.index : undefined
		if (index === undefined) {
			const p = await this.store.getActiveExperienceProfile(siteId)
			index = p ? (e?.index?.profile.id === p.id ? e.index : buildExperienceIndex(p)) : null
			this.#entries.set(siteId, { index, checkedAt: now })
		}
		return index && index.profile.kbVersionId === kbVersionId ? index : null
	}

	invalidate(siteId?: string) {
		if (siteId) this.#entries.delete(siteId)
		else this.#entries.clear()
	}
}
