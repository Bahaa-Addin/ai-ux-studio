/**
 * Knowledge service (ADR-0011, ADR-0012): the active manifest version per
 * site, what the SDK needs to know about the current page, and activation.
 */
import { type I18nText, type Page } from '#kb'
import type { SiteConfig } from '#shared/config.ts'
import type { ExperienceCache } from '#shared/experience.ts'
import { HttpError } from '#shared/http.ts'
import { type KbCache, variantKey } from '#shared/kb-index.ts'
import type { Store } from '#shared/store/index.ts'

export interface KnowledgeDeps {
	store: Store
	kb: KbCache
	sites: Map<string, SiteConfig>
	experience?: ExperienceCache
}

/** Pages that belong to one person: never recorded, never offered as an explored item (ADR-0037 §3). */
const PRIVATE_KINDS = new Set(['account', 'login', 'checkout'])
const eligible = (p: Page) => !PRIVATE_KINDS.has(p.kind) && !p.requiresAuth
const titles = (labels: Record<string, string[]> | undefined): I18nText => Object.fromEntries(Object.entries(labels || {}).filter(([, l]) => l[0]).map(([lang, l]) => [lang, l[0]]))

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

		/**
		 * The Exploration Trail's map of one page (SPEC-06 §4, ADR-0036): where its destinations are,
		 * what they are called, which verified questions they have, and the site's page paths, so the
		 * browser can name what a person explored without asking the server per hover. Public
		 * knowledge only; nothing about the person is in the request beyond the page they are on.
		 */
		async experience(input: { siteId: string; url: string }) {
			const kb = await deps.kb.get(input.siteId)
			if (!kb) return { standard: 'vg-experience-page/v1', siteId: input.siteId, kbVersionId: null, profileId: null, keepQuery: [], page: null, destinations: [], collections: [], pages: [] }
			const x = (await deps.experience?.get(input.siteId, kb.versionId)) ?? null
			const hit = kb.pageFor(input.url)
			const page = hit ? kb.pages.get(hit.pageId) : undefined
			const m = kb.manifest
			const keep = m.site.keepQuery || []
			const pageTitle = (p: Page): I18nText => Object.fromEntries(Object.entries(p.variants).map(([lang, v]) => [lang, v.title]))
			const here = page
				? m.destinations
						.filter((d) => d.pageId === page.id && d.kind !== 'page' && d.kind !== 'action' && !d.commit && d.target)
						.map((d) => {
							const col = d.collectionId ? kb.collections.get(d.collectionId) : undefined
							const key = d.kind === 'item' && col?.keyAttr ? new RegExp(`\\[${col.keyAttr}=["']?([^"'\\]]+)`).exec(d.target!.css.join(' '))?.[1] : undefined
							const xd = x?.byDestination.get(d.id)
							return {
								id: d.id,
								kind: d.kind,
								// A page that recreates this destination marks its copy (the Services clone, ADR-0040).
								css: [...d.target!.css, `[data-vg-destination="${d.id}"]`],
								title: titles(d.labels),
								context: col ? titles(col.labels) : pageTitle(page),
								topic: xd?.topic || d.collectionId || d.id,
								collectionId: d.collectionId,
								key,
								questions: x?.published(d.id) ?? {},
								popular: !!xd?.minimumCohortMet,
							}
						})
				: []
			return {
				standard: 'vg-experience-page/v1',
				siteId: input.siteId,
				kbVersionId: kb.versionId,
				profileId: x?.profile.id ?? null,
				keepQuery: keep,
				page: page ? { id: page.id, kind: page.kind, eligible: eligible(page), title: pageTitle(page) } : null,
				destinations: here.slice(0, 300),
				collections: page ? m.collections.filter((c) => c.pageId === page.id).map((c) => ({ id: c.id, itemCss: c.itemCss, keyAttr: c.keyAttr })) : [],
				pages: m.pages.map((p) => ({
					id: p.id,
					kind: p.kind,
					eligible: eligible(p),
					title: pageTitle(p),
					paths: [...new Set(Object.values(p.variants).flatMap((v) => [v.url, ...(v.aliases || [])]).map((u) => variantKey(u, keep)))],
					questions: eligible(p) ? (x?.published(p.id) ?? {}) : {},
				})),
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
