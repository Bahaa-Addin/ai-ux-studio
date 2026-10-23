/**
 * Curated overlay: the human-maintained part of a site's knowledge base
 * (ADR-0011). Merged over the crawler's output by the KB builder. Entries bind
 * to crawled entries by id, or by page id plus CSS when ids are not known yet.
 */
import fs from 'node:fs'

import YAML from 'yaml'
import * as z from 'zod/v4'

import { AnswerSpec, Collection, Destination, Flow, I18nList, I18nText, Lexicon, Target } from '#kb'

const Match = z.object({ page: z.string(), css: z.string() })

export const OverlayDestination = z
	.object({
		id: z.string().optional(),
		match: Match.optional(),
		pageId: z.string().optional(),
		kind: Destination.shape.kind.optional(),
		target: Target.optional(),
		labels: I18nList.optional(),
		examples: I18nList.optional(),
		description: I18nText.optional(),
		reveal: z.array(Target).optional(),
		answer: AnswerSpec.optional(),
		watchable: z.boolean().optional(),
		commit: z.boolean().optional(),
		collectionId: z.string().optional(),
		flows: z.array(z.string()).optional(),
		priority: z.number().min(0.1).max(3).optional(),
	})
	.refine((d) => d.id || d.match, 'a curated destination needs an id or a match')

export const OverlayCollection = Collection.omit({ provenance: true })
	.partial()
	.extend({ id: z.string() })

export const OverlayVisual = z
	.object({
		id: z.string().optional(),
		match: Match.optional(),
		description: I18nText,
		labels: I18nList.optional(),
		confidence: z.number().min(0).max(1).optional(),
	})
	.refine((v) => v.id || v.match, 'a curated visual needs an id or a match')

export const Overlay = z.object({
	pages: z
		.array(
			z.object({
				id: z.string(),
				kind: z.enum(['content', 'listing', 'checkout', 'account', 'login', 'help']).optional(),
				requiresAuth: z.boolean().optional(),
				summary: I18nText.optional(),
				labels: I18nList.optional(),
				examples: I18nList.optional(),
			}),
		)
		.default([]),
	destinations: z.array(OverlayDestination).default([]),
	collections: z.array(OverlayCollection).default([]),
	flows: z.array(Flow.omit({ provenance: true })).default([]),
	visuals: z.array(OverlayVisual).default([]),
	lexicon: Lexicon.partial().default({}),
	exclude: z.object({ destinations: z.array(z.string()).default([]) }).default({ destinations: [] }),
})

export type Overlay = z.infer<typeof Overlay>

export function loadOverlay(file: string): Overlay {
	const parsed = Overlay.safeParse(YAML.parse(fs.readFileSync(file, 'utf8')) ?? {})
	if (!parsed.success) throw new Error(`Invalid curated overlay ${file}: ${z.prettifyError(parsed.error)}`)
	return parsed.data
}
