/**
 * Plan contract v1 (ADR-0015): what the router sends and the SDK executes.
 * Plans are data in one language (already resolved by the server). The SDK
 * imports these types only; validation happens on the server before sending.
 */
import * as z from 'zod/v4'

import { Target } from './manifest.ts'

export const PLAN_VERSION = 1 as const

/** How to read an answer from the live element. `{name}` placeholders map to fields. */
export const ReadSpec = z.object({
	fields: z.record(z.string(), Target).optional(),
	template: z.string().optional(),
	maxChars: z.number().int().positive().optional(),
})

export const ItemSelect = z.discriminatedUnion('by', [
	z.object({ by: z.literal('min'), field: z.string() }),
	z.object({ by: z.literal('max'), field: z.string() }),
	z.object({ by: z.literal('key'), key: z.string() }),
	z.object({ by: z.literal('name'), name: z.string() }),
])

export const CollectionRef = z.object({
	id: z.string(),
	itemCss: z.string(),
	keyAttr: z.string().optional(),
	nameField: z.string(),
	fields: z.record(z.string(), z.object({ css: z.string(), type: z.enum(['text', 'number', 'money', 'data']) })),
})

export const PlanStep = z.discriminatedUnion('op', [
	z.object({ op: z.literal('navigate'), url: z.string(), pageId: z.string().optional(), handoff: z.boolean().optional() }),
	z.object({ op: z.literal('waitForPage'), pageId: z.string().optional(), urlPrefix: z.string().optional(), timeoutMs: z.number().optional() }),
	z.object({ op: z.literal('reveal'), target: Target, until: Target.optional() }),
	z.object({ op: z.literal('scrollTo'), target: Target }),
	z.object({ op: z.literal('pickItem'), collection: CollectionRef, select: ItemSelect }),
	z.object({ op: z.literal('spotlight'), target: Target, caption: z.string().optional(), read: ReadSpec.optional() }),
	z.object({ op: z.literal('say'), text: z.string() }),
	z.object({ op: z.literal('click'), target: Target }),
	z.object({ op: z.literal('confirm'), target: Target, message: z.string() }),
	z.object({ op: z.literal('offerWatch'), target: Target, label: z.string(), url: z.string(), pageId: z.string().optional() }),
	z.object({ op: z.literal('ask'), question: z.string(), options: z.array(z.object({ label: z.string(), utterance: z.string() })) }),
	z.object({ op: z.literal('agent'), task: z.string(), hints: z.string().optional(), maxSteps: z.number().int().positive().optional() }),
])

export const Plan = z.object({
	v: z.literal(PLAN_VERSION),
	turnId: z.string(),
	lang: z.string(),
	/** What the guide says first, before executing (may be empty). */
	say: z.string().optional(),
	steps: z.array(PlanStep),
	/** Why: shown in the X-ray panel, never spoken. */
	meta: z.object({
		intent: z.string(),
		route: z.enum(['replay', 'agent', 'clarify', 'control', 'none']),
		destinationId: z.string().optional(),
		confidence: z.number().optional(),
	}),
})

export type ReadSpec = z.infer<typeof ReadSpec>
export type ItemSelect = z.infer<typeof ItemSelect>
export type CollectionRef = z.infer<typeof CollectionRef>
export type PlanStep = z.infer<typeof PlanStep>
export type Plan = z.infer<typeof Plan>
