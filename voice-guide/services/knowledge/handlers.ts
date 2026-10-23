/**
 * Knowledge service (ADR-0011, ADR-0012): the active manifest version per
 * site, what the SDK needs to know about the current page, and activation.
 */
import type { SiteConfig } from '#shared/config.ts'
import { HttpError } from '#shared/http.ts'
import type { KbCache } from '#shared/kb-index.ts'
import type { Store } from '#shared/store/index.ts'

export interface KnowledgeDeps {
	store: Store
	kb: KbCache
	sites: Map<string, SiteConfig>
}

export function createKnowledge(deps: KnowledgeDeps) {
	return {
		/**
		 * What the SDK needs on page load: which page this is, the other language
		 * variants, and the commit targets the guide must never press (ADR-0015).
		 */
		async pageContext(input: { siteId: string; url: string }) {
			const kb = await deps.kb.get(input.siteId)
			if (!kb) return { kbVersion: null, pageId: null, variants: {}, commitTargets: [], visuals: 0, phrases: [] }
			const hit = kb.pageFor(input.url)
			const page = hit ? kb.pages.get(hit.pageId) : undefined
			const commitTargets = kb.manifest.destinations.filter((d) => d.commit && d.target).map((d) => d.target!.css)
			return {
				kbVersion: kb.versionId,
				pageId: hit?.pageId ?? null,
				pageLang: hit?.lang ?? null,
				variants: page ? Object.fromEntries(Object.entries(page.variants).map(([l, v]) => [l, v.url])) : {},
				commitTargets,
				visuals: hit ? [...kb.visuals.values()].filter((v) => v.pageId === hit.pageId).length : 0,
				// Product names for the recogniser's contextual biasing (SPEC-02 §6): short synonym entries.
				phrases: [...new Set((kb.manifest.lexicon?.synonyms || []).flat().filter((w) => w.split(/\s+/).length <= 3 && w.length >= 3))].slice(0, 50),
			}
		},

		async versions(input: { siteId: string }) {
			return { versions: await deps.store.listKbVersions(input.siteId) }
		},

		async activate(input: { siteId: string; versionId: string }) {
			if (!deps.sites.has(input.siteId)) throw new HttpError(404, 'unknown site', 'unknown_site')
			const m = await deps.store.getKbVersion(input.siteId, input.versionId)
			if (!m) throw new HttpError(404, 'unknown version', 'unknown_version')
			await deps.store.activateKb(input.siteId, input.versionId)
			deps.kb.invalidate(input.siteId)
			return { active: input.versionId }
		},
	}
}

export type KnowledgeHandlers = ReturnType<typeof createKnowledge>
