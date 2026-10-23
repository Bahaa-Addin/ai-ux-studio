/**
 * Fallback agent chunk (ADR-0017), loaded only when a plan has an `agent` step.
 * page-agent's headless core and page controller, pinned at 1.12.4, wrapped:
 *  - its model calls go to our agent proxy with a short-lived session token
 *  - commit buttons are removed from what it can see and click
 *  - personal data is masked in page content before it leaves the browser
 *  - its progress is saved after every step, so the task continues on the next page
 */
import { PageAgentCore, tool } from '@page-agent/core'
import { PageController } from '@page-agent/page-controller'
import * as z from 'zod/v4'

import { fieldInfo, inputRefusal, maskContent } from './agent-mask.ts'

export interface AgentRunOptions {
	gateway: string
	token: string
	turnId: string
	task: string
	hints?: string
	lang: string
	maxSteps: number
	timeoutSec: number
	commitSelectors: string[]
	previous?: { lines: string[]; steps: number }
	onStep(ev: { step: number; action: string; goal?: string; ms: number }): void
	onAsk(question: string, signal?: AbortSignal): Promise<string>
	onSave(state: { lines: string[]; steps: number }): void
	signal: AbortSignal
}

export interface AgentRunResult {
	success: boolean
	/** The model's own closing words (its `done` call), in the person's language. */
	text?: string
	/** Set when the task ended on an error (model unreachable, step limit, timeout); for traces, never spoken. */
	error?: string
	steps: number
}


const LANG_NAME: Record<string, string> = { ar: 'Egyptian Arabic', en: 'English' }

export async function runAgent(o: AgentRunOptions): Promise<AgentRunResult> {
	const blacklist: (() => Element)[] = []
	for (const css of o.commitSelectors) for (let i = 0; i < 4; i++) blacklist.push(() => document.querySelectorAll(css)[i] as Element)
	// Our own spotlight and pointer show what happens; page-agent's index labels stay hidden.
	const controller = new PageController({ enableMask: false, interactiveBlacklist: blacklist, highlightOpacity: 0, highlightLabelOpacity: 0 })
	const lines = [...(o.previous?.lines || [])]
	const offset = o.previous?.steps || 0
	let stepStart = performance.now()
	let clickedStep = 0

	const system = [
		`You are the guide of this website. Reply to the person in ${LANG_NAME[o.lang] || 'their language'}: the "done" text is read aloud, so keep it to one or two short sentences.`,
		'Show and explain; do not buy, pay, subscribe or change any setting on the person\'s behalf. Buttons that complete a purchase are hidden from you on purpose.',
		'If the answer is on the current page, scroll to it and stop. If you cannot find it in a few steps, say so and stop.',
		o.hints ? `Places on this site that may be relevant: ${o.hints}` : '',
	]
		.filter(Boolean)
		.join('\n')

	const agent = new PageAgentCore({
		pageController: controller,
		baseURL: `${o.gateway}/v1/agent`,
		apiKey: o.token,
		model: 'site-default',
		language: 'en-US',
		maxSteps: Math.max(1, o.maxSteps - offset),
		stepDelay: 0.2,
		instructions: { system },
		transformPageContent: (c) => maskContent(c),
		customFetch: (input, init) => {
			const headers = new Headers(init?.headers)
			headers.set('x-vg-turn', o.turnId)
			return fetch(input, { ...init, headers })
		},
		customTools: {
			// A click can unload the page before the step finishes, so the step is recorded and
			// saved first; the SDK on the next page continues from it (ADR-0017).
			click_element_by_index: tool({
				description: 'Click element by index',
				inputSchema: z.object({ index: z.int().min(0) }),
				execute: async function (this: PageAgentCore, input) {
					const n = offset + this.history.filter((e) => e.type === 'step').length + 1
					const el = (this.pageController as any).selectorMap?.get?.(input.index)?.ref as Element | undefined
					const label = el ? (el.textContent || el.getAttribute('aria-label') || el.getAttribute('value') || '').replace(/\s+/g, ' ').trim().slice(0, 60) : ''
					clickedStep = n
					o.onStep({ step: n, action: `click_element_by_index [${input.index}]`, goal: label, ms: performance.now() - stepStart })
					o.onSave({ lines: [...lines, `${n}. clicked [${input.index}] "${label}"`], steps: n })
					const r = await this.pageController.clickElement(input.index)
					return r.message
				},
			}),
			// Typing is limited to values the person said in this request (ADR-0017).
			input_text: tool({
				description: 'Type text into an input element. Only type values the user stated in their request.',
				inputSchema: z.object({ index: z.int().min(0), text: z.string() }),
				execute: async function (this: PageAgentCore, input) {
					// Credentials, one-time codes, card numbers and national IDs are never typed (T-308).
					let field: Element | null = null
					try {
						field = (this.pageController as any).selectorMap?.get(input.index)?.ref ?? null
					} catch {}
					const refused = inputRefusal(o.task, input.text, fieldInfo(field))
					if (refused) return refused
					const r = await this.pageController.inputText(input.index, input.text)
					return r.message
				},
			}),
		},
		onBeforeTask: (a) => {
			// pushObservation is left out of page-agent's published types but is part of 1.12.4's runtime.
			if (lines.length) (a as unknown as { pushObservation(text: string): void }).pushObservation(`This task started on an earlier page. Steps already done:\n${lines.slice(-12).join('\n')}\nYou are now on ${location.href}. Continue from here.`)
		},
		onBeforeStep: () => {
			stepStart = performance.now()
		},
		onAfterStep: (_a, history) => {
			const last = [...history].reverse().find((e) => e.type === 'step')
			if (!last || last.type !== 'step') return
			const n = offset + history.filter((e) => e.type === 'step').length
			const action = `${last.action.name}${last.action.input && typeof last.action.input === 'object' && 'index' in last.action.input ? ` [${(last.action.input as any).index}]` : ''}`
			lines.push(`${n}. ${action}: ${String(last.action.output).slice(0, 120)}${last.reflection.next_goal ? ` (goal: ${last.reflection.next_goal.slice(0, 100)})` : ''}`)
			if (clickedStep !== n) o.onStep({ step: n, action, goal: last.reflection.next_goal, ms: performance.now() - stepStart })
			o.onSave({ lines, steps: n })
		},
	})
	agent.onAskUser = (q, opts) => o.onAsk(q, opts?.signal)

	const stop = () => void agent.stop()
	o.signal.addEventListener('abort', stop)
	const timer = setTimeout(stop, o.timeoutSec * 1000)
	try {
		const r = await agent.execute(o.task)
		const steps = offset + r.history.filter((e) => e.type === 'step').length
		// page-agent returns error messages in the same field as the model's answer; only a
		// task that ended with the model's `done` call has words meant for the person.
		const ended = r.history.at(-1)
		if (ended?.type === 'error') return { success: false, error: String(r.data), steps }
		return { success: r.success, text: r.data, steps }
	} finally {
		clearTimeout(timer)
		o.signal.removeEventListener('abort', stop)
		agent.dispose()
	}
}

export interface GuideAgentContext {
	gateway: string
	token: string
	sessionId: string
	lang: string
	maxSteps: number
	timeoutSec: number
	commitSelectors: string[]
	post(path: string, body: unknown, opts?: { keepalive?: boolean }): Promise<unknown>
	say(text: string): Promise<void>
	unavailable: string
	report(turnId: string, events: { name: string; attrs: Record<string, unknown>; ms?: number }[]): void
	firstMotion(): void
	onAbort(abort: AbortController | null): void
	onAsk(resolve: ((answer: string) => void) | null): void
}

/**
 * The guide's side of an agent task (moved here from guide.js to keep the main script small,
 * T-504): saves progress in order after every step, reports steps, speaks only the model's own
 * closing words.
 */
export async function runForGuide(c: GuideAgentContext, step: { task: string; hints?: string; maxSteps?: number }, turnId: string, signal: AbortSignal, previous?: { lines: string[]; steps: number; startedAt?: string }): Promise<void> {
	const abort = new AbortController()
	signal.addEventListener('abort', () => abort.abort())
	c.onAbort(abort)
	const t0 = performance.now()
	// The time limit covers the whole task, across page loads.
	const startedAt = previous?.startedAt || new Date().toISOString()
	// Saves go out one after another: a step's save that is still in flight must never land
	// after the final "done" (null) and bring a finished task back to life on the next page.
	let saving: Promise<unknown> = Promise.resolve()
	const save = (state: { lines: string[]; steps: number } | null) =>
		(saving = saving.then(() =>
			c
				.post('/v1/agent/state', { sessionId: c.sessionId, agent: state ? { task: step.task, history: state.lines, steps: state.steps, startedAt, turnId, hints: step.hints, maxSteps: step.maxSteps } : null }, { keepalive: true })
				.catch(() => {}),
		))
	try {
		c.firstMotion()
		await save(previous ? { lines: previous.lines, steps: previous.steps } : { lines: [], steps: 0 })
		const r = await runAgent({
			gateway: c.gateway,
			token: c.token,
			turnId,
			task: step.task,
			hints: step.hints,
			lang: c.lang,
			maxSteps: step.maxSteps || c.maxSteps,
			timeoutSec: c.timeoutSec,
			commitSelectors: c.commitSelectors,
			previous,
			signal: abort.signal,
			onStep: (ev) => c.report(turnId, [{ name: 'agent.step', attrs: { step: ev.step, action: ev.action, goal: ev.goal }, ms: ev.ms }]),
			onSave: (state) => void save(state),
			onAsk: (q) => {
				void c.say(q)
				return new Promise<string>((resolve) => c.onAsk(resolve))
			},
		})
		await save(null)
		c.report(turnId, [{ name: 'agent.done', attrs: { success: r.success, steps: r.steps, error: r.error }, ms: performance.now() - t0 }])
		if (abort.signal.aborted) return
		if (r.text) await c.say(r.text)
		else if (r.error) await c.say(c.unavailable)
	} catch (e) {
		if (abort.signal.aborted) return
		await save(null)
		await c.say(c.unavailable)
		c.report(turnId, [{ name: 'sdk.step', attrs: { op: 'agent', ok: false, detail: (e as Error).message } }])
	} finally {
		c.onAbort(null)
	}
}

;(window as any).__vgAgent = { runAgent, runForGuide }
