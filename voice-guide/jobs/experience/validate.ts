/**
 * Validates suggested questions through the real router before publication (ADR-0036, SPEC-06
 * §5): the same `understand` and `buildPlan` that `/v1/turn` runs, from the destination's own
 * page and from the site's home page, with no model and no agent. A question is published only
 * if every context reaches the expected destination with a deterministic plan that stops before
 * any commit point and needs no account data.
 */
import { type Destination, questionTextIssues, resolveEvidence, type SuggestedQuestion } from '#kb'
import { buildPlan, variantUrl } from '#services/router/planner.ts'
import { type RouterSettings, understand } from '#services/router/understand.ts'
import type { KbIndex } from '#shared/kb-index.ts'
import type { SessionState } from '#shared/store/index.ts'

import type { Candidate } from './questions.ts'

/** Pages whose content belongs to one person: a question that leads there needs data the guide does not have. */
const PRIVATE_KINDS = new Set(['account', 'login', 'checkout'])

export function homePageId(kb: KbIndex): string | undefined {
	const pages = kb.manifest.pages
	return (pages.find((p) => /(^|\.)home$/.test(p.id)) || pages.find((p) => p.kind === 'content'))?.id
}

export async function validateCandidate(c: Candidate, kb: KbIndex, settings: Omit<RouterSettings, 'agentEnabled'>, contexts: string[]): Promise<SuggestedQuestion> {
	const m = kb.manifest
	const reasons: string[] = []
	const expected = kb.dest.get(c.expectedDestinationId)
	const page = expected ? kb.pages.get(expected.pageId) : undefined
	if (!expected) reasons.push(`unknown expected destination ${c.expectedDestinationId}`)
	if (page && (PRIVATE_KINDS.has(page.kind) || page.requiresAuth)) reasons.push(`needs account data (${page.kind} page)`)
	if (expected?.commit) reasons.push('the answer is a commit point')
	for (const ref of c.evidenceRefs) if (!resolveEvidence(ref, m)) reasons.push(`evidence ${ref} does not resolve`)
	const names = expected ? [...Object.values(expected.labels).flat(), ...collectionNames(kb, expected)].join(' ') : ''
	const source = kb.dest.get(c.destinationId)
	reasons.push(...questionTextIssues(c.text, `${names} ${source ? Object.values(source.labels).flat().join(' ') : ''}`))

	const commitCss = new Set(m.destinations.filter((d) => d.commit && d.target).flatMap((d) => d.target!.css))
	const results: SuggestedQuestion['validation']['contexts'] = []
	let confidence = 1
	let routerIntent: string | undefined
	if (!reasons.length) {
		for (const pageId of contexts) {
			const session: SessionState = { id: 'experience', siteId: m.site.id, lang: c.lang, createdAt: '', updatedAt: '', turns: [], usage: { agentSteps: 0, agentTokens: 0 } }
			const u = await understand({ utterance: c.text, uiLang: c.lang, pageId, session, kb, settings: { ...settings, agentEnabled: false } })
			const { plan } = buildPlan({ u, utterance: c.text, session, kb, page: { url: variantUrl(kb, pageId, c.lang), pageId }, turnId: 'experience', agent: { enabled: false, maxSteps: 0 } })
			const got = plan.meta.destinationId ?? u.decision.destinationId
			const select = u.select ? `${u.select.by}-${u.select.field}` : undefined
			const why: string[] = []
			if (plan.meta.route !== 'replay') why.push(`route ${plan.meta.route}`)
			if (got !== c.expectedDestinationId) why.push(`reached ${got ?? 'nothing'}`)
			if (!c.expectIntents.includes(plan.meta.intent)) why.push(`understood as ${plan.meta.intent}`)
			if (c.expectSelect && select !== c.expectSelect) why.push(`selector ${select ?? 'none'}`)
			if (plan.lang !== c.lang) why.push(`answered in ${plan.lang}`)
			if (!plan.steps.length && !plan.say) why.push('no plan')
			if (plan.steps.some((s) => s.op === 'agent')) why.push('needs the agent')
			if (plan.steps.some((s) => s.op === 'click' && s.target.css.some((css) => commitCss.has(css)))) why.push('presses a commit point')
			results.push({ pageId, destinationId: got, route: plan.meta.route, ok: why.length === 0 })
			if (why.length) reasons.push(`from ${pageId}: ${why.join(', ')}`)
			confidence = Math.min(confidence, u.decision.confidence)
			routerIntent = plan.meta.intent
		}
	}
	const status: SuggestedQuestion['validation']['status'] = reasons.length ? (reasons.some((r) => /needs account|commit|evidence|promises|price|number/.test(r)) ? 'rejected' : 'needs-review') : 'verified'
	return {
		id: c.id,
		text: c.text,
		intent: c.intent,
		evidenceRefs: c.evidenceRefs,
		expectedDestinationId: c.expectedDestinationId,
		routerIntent,
		provenance: { generator: 'template', template: c.template },
		validation: { status, routerConfidence: results.length ? Math.round(confidence * 1000) / 1000 : undefined, contexts: results, reasons },
	}
}

function collectionNames(kb: KbIndex, d: Destination): string[] {
	const c = d.collectionId ? kb.collections.get(d.collectionId) : undefined
	return c ? Object.values(c.labels).flat() : []
}
