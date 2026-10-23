/**
 * Checks a schema-valid manifest for broken references and risky content.
 * Errors block publishing; warnings are shown in the ingest report (ADR-0012).
 */
import type { Manifest } from './manifest.ts'

export interface Issue {
	level: 'error' | 'warning'
	path: string
	message: string
}

export function checkIntegrity(m: Manifest): Issue[] {
	const issues: Issue[] = []
	const err = (path: string, message: string) => issues.push({ level: 'error', path, message })
	const warn = (path: string, message: string) => issues.push({ level: 'warning', path, message })

	const dupes = (kind: string, ids: string[]) => {
		const seen = new Set<string>()
		for (const id of ids) {
			if (seen.has(id)) err(`${kind}.${id}`, `duplicate ${kind} id`)
			seen.add(id)
		}
		return seen
	}
	const pages = dupes('page', m.pages.map((p) => p.id))
	dupes('destination', m.destinations.map((d) => d.id))
	const collections = dupes('collection', m.collections.map((c) => c.id))
	const flows = dupes('flow', m.flows.map((f) => f.id))
	const visuals = dupes('visual', m.visuals.map((v) => v.id))

	if (!m.site.languages.includes(m.site.defaultLanguage)) err('site.defaultLanguage', 'default language is not in site.languages')

	const origins = new Set(m.site.origins.map((o) => new URL(o).origin))
	for (const p of m.pages) {
		for (const [lang, v] of Object.entries(p.variants)) {
			if (!m.site.languages.includes(lang)) warn(`page.${p.id}.variants.${lang}`, `language ${lang} is not in site.languages`)
			if (!origins.has(new URL(v.url).origin)) err(`page.${p.id}.variants.${lang}`, `url ${v.url} is outside the site's origins`)
		}
		if (Object.keys(p.variants).length === 0) err(`page.${p.id}`, 'page has no variants')
	}

	for (const d of m.destinations) {
		const at = `destination.${d.id}`
		if (!pages.has(d.pageId)) err(at, `unknown page ${d.pageId}`)
		if (d.kind !== 'page' && !d.target) err(at, `kind ${d.kind} needs a target`)
		if (d.collectionId && !collections.has(d.collectionId)) err(at, `unknown collection ${d.collectionId}`)
		if (d.visualId && !visuals.has(d.visualId)) err(at, `unknown visual ${d.visualId}`)
		for (const f of d.flows || []) if (!flows.has(f)) err(at, `unknown flow ${f}`)
		const labelCount = Object.values(d.labels).reduce((n, l) => n + l.length, 0)
		if (labelCount === 0) warn(at, 'no labels: the router cannot find this destination')
		for (const lang of m.site.languages) {
			if (!d.labels[lang]?.length && !d.examples?.[lang]?.length) warn(at, `no ${lang} labels or examples`)
		}
		if (d.commit && d.reveal?.length) warn(at, 'commit point with reveal steps: check that revealing does not commit')
	}

	for (const c of m.collections) {
		if (!pages.has(c.pageId)) err(`collection.${c.id}`, `unknown page ${c.pageId}`)
		if (!c.fields[c.nameField]) err(`collection.${c.id}`, `name field "${c.nameField}" is not defined`)
	}

	for (const f of m.flows) {
		const at = `flow.${f.id}`
		for (const c of f.appliesTo?.collectionIds || []) if (!collections.has(c)) err(at, `unknown collection ${c}`)
		for (const [i, s] of f.steps.entries()) {
			if ((s.op === 'navigate' || s.op === 'waitForPage') && !pages.has(s.pageId)) err(`${at}.steps.${i}`, `unknown page ${s.pageId}`)
		}
		const last = f.steps.at(-1)
		if (last && last.op === 'click') warn(at, 'flow ends with a click; flows that commit should end with a confirm step')
	}

	for (const v of m.visuals) {
		if (!pages.has(v.pageId)) err(`visual.${v.id}`, `unknown page ${v.pageId}`)
		if (v.confidence < 0.3) warn(`visual.${v.id}`, `low-confidence description (${v.confidence}); consider curating it`)
	}
	return issues
}
