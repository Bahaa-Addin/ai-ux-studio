/**
 * Fallback agent chunk (ADR-0017), loaded only when a plan has an `agent` step.
 * page-agent's headless core and page controller, pinned at 1.12.4, wrapped:
 *  - its model calls go to our agent proxy with a short-lived session token
 *  - commit controls (ADR-0058) are hidden from what it can see, and every click, select and input
 *    is checked against them live, what lies at the click point included; while it runs, synthetic
 *    clicks on them are stopped; on commit pages it presses nothing at all
 *  - at a commit control it shows the person where to press (the guide's pointer and a pulsing
 *    highlight, a line in their language) and ends the task: the person presses it themselves
 *  - personal data is masked in page content before it leaves the browser
 *  - its progress is saved after every step, so the task continues on the next page
 */
import { PageAgentCore, tool } from '@page-agent/core'
import { PageController } from '@page-agent/page-controller'
import * as z from 'zod/v4'

import { COMMIT_SELECTORS, isCommitPage, isCommitWords } from '../../kb/src/commit.ts'
import { fieldInfo, inputRefusal, maskContent } from './agent-mask.ts'

/** Anything a person presses: links, buttons, inputs that act. */
const CONTROL = 'a[href], button, [role="button"], [role="link"], input[type="submit"], input[type="button"], input[type="image"], summary'

/** A control's words as a person meets them: its text, label, title and value, and its pictures' alt text (icon-only buttons). */
const wordsOf = (el: Element): string =>
	[el.textContent, el.getAttribute('aria-label'), el.getAttribute('title'), (el as HTMLInputElement).value, ...[...el.querySelectorAll('img[alt]')].map((i) => i.getAttribute('alt'))].filter(Boolean).join(' ')

const matchesAny = (el: Element, selectors: readonly string[]) =>
	selectors.some((css) => {
		try {
			return el.matches(css)
		} catch {
			return false
		}
	})

/** The commit control an element is or sits in, by its markup or its words (ADR-0058); null when none. */
export function commitControl(el: Element | null | undefined, selectors: readonly string[]): Element | null {
	if (!el) return null
	for (let n: Element | null = el; n && n !== document.documentElement; n = n.parentElement) if (matchesAny(n, selectors)) return n
	const control = el.closest(CONTROL)
	if (control && isCommitWords(wordsOf(control), { link: control.matches('a[href]') && !control.matches('[role="button"]') })) return control
	return null
}

/** What pressing `el` would press: the element, the control it sits in, and what lies at its centre (page-agent clicks there). */
export function commitTarget(el: Element, selectors: readonly string[]): Element | null {
	const hit = commitControl(el, selectors)
	if (hit) return hit
	const r = el.getBoundingClientRect()
	const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
	return at && el.contains(at) ? commitControl(at, selectors) : null
}

/** Every commit control on the page, to keep out of the model's view. */
function commitControls(selectors: readonly string[]): Element[] {
	const out = new Set<Element>()
	for (const css of selectors) {
		try {
			for (const e of document.querySelectorAll(css)) out.add(e)
		} catch {}
	}
	for (const e of document.querySelectorAll(CONTROL)) if (!e.closest('vg-guide') && commitControl(e, [])) out.add(e)
	return [...out]
}

type CommitLine = 'cart' | 'buy' | 'consent' | 'number' | 'any'
/** What the guide says at a commit control, in the person's language. */
const LINES: Record<CommitLine, { en: string; ar: string }> = {
	cart: { en: "This is where you add it to your cart. Press it yourself when you're ready.", ar: 'ده مكان إضافته للسلة. دوس عليه بنفسك لما تكون جاهز.' },
	buy: { en: "This is where you buy it. Press it yourself when you're ready.", ar: 'ده مكان الشراء. دوس عليه بنفسك لما تكون جاهز.' },
	consent: { en: 'This is your cookie choice. Make it yourself.', ar: 'ده اختيار الكوكيز بتاعك. اختاره بنفسك.' },
	number: { en: 'Choose your number yourself, here.', ar: 'اختار رقمك بنفسك، من هنا.' },
	any: { en: "This step is yours: press it yourself when you're ready.", ar: 'الخطوة دي بتاعتك: دوس عليها بنفسك لما تكون جاهز.' },
}
const lineFor = (el: Element): CommitLine => {
	if (el.closest('#onetrust-consent-sdk')) return 'consent'
	const w = wordsOf(el).toLowerCase()
	if (/cart|basket|سل[ةه]/.test(w) || matchesAny(el, ['#sl-add-to-cart-button', 'button.cart', '[id*="add-to-cart" i]'])) return 'cart'
	if (/\bnumber\b|رقم/.test(w)) return 'number'
	if (/\bbuy\b|اشتر/.test(w) || matchesAny(el, ['#sl-button-buy-now', '[id*="buy-now" i]'])) return 'buy'
	return 'any'
}

/** The highlight pulses slowly while it waits for the person (none with reduced motion); in the guide's own root. */
const PULSE = '.spot.commit{animation:vg-commit 1.6s ease-in-out infinite}@keyframes vg-commit{50%{box-shadow:0 0 0 8px #d97706,0 0 0 9999px rgba(10,14,18,.42)}}@media (prefers-reduced-motion:reduce){.spot.commit{animation:none}}'

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
	/** The task ended at a commit control the guide showed the person (ADR-0058). */
	guided?: boolean
	/** The model's own closing words (its `done` call), in the person's language. */
	text?: string
	/** Set when the task ended on an error (model unreachable, step limit, timeout); for traces, never spoken. */
	error?: string
	steps: number
}


const LANG_NAME: Record<string, string> = { ar: 'Egyptian Arabic', en: 'English' }

export async function runAgent(o: AgentRunOptions): Promise<AgentRunResult> {
	// The built-in floor and the page's own commit points (ADR-0058). A commit page's ':root' mark is
	// for the guide's own executor; here a commit page is known from its address.
	const selectors = [...new Set([...COMMIT_SELECTORS, ...o.commitSelectors.filter((c) => c !== ':root')])]
	const onCommitPage = () => isCommitPage(location.href) || o.commitSelectors.includes(':root')
	// Every commit control is out of the model's view, found again whenever page-agent reads the page.
	const blacklist: Element[] = []
	// Our own spotlight and pointer show what happens; page-agent's index labels stay hidden.
	const controller = new PageController({ enableMask: false, interactiveBlacklist: blacklist, highlightOpacity: 0, highlightLabelOpacity: 0 })
	const updateTree = controller.updateTree.bind(controller)
	controller.updateTree = async () => {
		blacklist.splice(0, blacklist.length, ...commitControls(selectors))
		return updateTree()
	}
	const lines = [...(o.previous?.lines || [])]
	const offset = o.previous?.steps || 0
	let stepStart = performance.now()
	let clickedStep = 0
	/** The line said when the task ended at a commit control the person presses. */
	let guided: string | null = null

	const system = [
		`You are the guide of this website. Reply to the person in ${LANG_NAME[o.lang] || 'their language'}: the "done" text is read aloud, so keep it to one or two short sentences.`,
		'Show and explain; you never press anything that buys, pays, subscribes, reserves, adds to the cart, checks out, chooses a number or answers the cookie banner, and you never change a setting on the person\'s behalf. Those buttons are hidden from you. When the person\'s task needs one, call show_person_where (with the index of the item it belongs to, if there is one): the guide points at it and the person presses it.',
		'Never state a price or stock you did not read on this page in this task.',
		'If the answer is on the current page, scroll to it and stop. If you cannot find it in a few steps, say so and stop.',
		o.hints ? `Places on this site that may be relevant: ${o.hints}` : '',
	]
		.filter(Boolean)
		.join('\n')

	/** Shows the person the control to press (the guide's pointer and a pulsing highlight, a line) and ends the task. */
	const showPerson = async (el: Element): Promise<string> => {
		const g = (window as any).voiceGuide
		const line = LINES[lineFor(el)][o.lang === 'ar' ? 'ar' : 'en']
		guided = line
		const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
		el.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' })
		await new Promise((r) => setTimeout(r, 350))
		if (g?.ui) {
			if (!g.ui.root.querySelector('style[data-vg-commit]')) {
				const style = document.createElement('style')
				style.dataset.vgCommit = ''
				style.textContent = PULSE
				g.ui.root.appendChild(style)
			}
			g.ui.spotlight(el, { caption: line, commit: true })
			// The pointer glides to the control and never taps; with reduced motion, the highlight alone.
			if (!reduce) await g.ui.pointAt(el, false)
			const done = () => {
				el.removeEventListener('click', onPress, true)
				if (g.ui.root.querySelector('.spot.commit')) g.ui.clearSpotlight()
			}
			const onPress = (e: Event) => e.isTrusted && done()
			el.addEventListener('click', onPress, true)
			setTimeout(done, 30_000)
		}
		queueMicrotask(() => void agent.stop())
		return `Shown to the person, who presses it themselves (${line}). The task is over: do nothing more.`
	}
	/** What a press on the element at `index` would press, if it is a commit control. */
	const refused = async (el: Element | undefined): Promise<string | null> => {
		if (!el) return null
		const c = commitTarget(el, selectors)
		if (c) return showPerson(c)
		if (onCommitPage()) return showPerson(el)
		return null
	}
	const at = (controller: unknown, index: number) => ((controller as any).selectorMap?.get?.(index)?.ref as Element | undefined) ?? undefined

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
					const el = at(this.pageController, input.index)
					const no = await refused(el)
					if (no) return no
					// Page words leave the browser masked (ADR-0018); the server also strips prices from what it keeps (E3).
					const label = el ? maskContent((el.textContent || el.getAttribute('aria-label') || el.getAttribute('value') || '').replace(/\s+/g, ' ').trim()).slice(0, 60) : ''
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
					const refusal = inputRefusal(o.task, input.text, fieldInfo(field))
					if (refusal) return refusal
					// Nothing is typed on a commit page, nor into a commit control.
					const no = await refused(field ?? undefined)
					if (no) return no
					const r = await this.pageController.inputText(input.index, input.text)
					return r.message
				},
			}),
			// Choosing an option (a number, a plan) can be the commit itself.
			select_dropdown_option: tool({
				description: 'Select dropdown option for interactive element index by the text of the option you want to select',
				inputSchema: z.object({ index: z.int().min(0), text: z.string() }),
				execute: async function (this: PageAgentCore, input) {
					const el = at(this.pageController, input.index)
					const no = await refused(el)
					if (no) return no
					if (el && (/\/lines\/[^/]+\/numbers/i.test(location.pathname) || isCommitWords(input.text))) return showPerson(el)
					const r = await this.pageController.selectOption(input.index, input.text)
					return r.message
				},
			}),
			// The person presses commit controls; the guide shows them where (ADR-0058).
			show_person_where: tool({
				description: 'Show the person where to press a button that buys, pays, subscribes, reserves, adds to the cart, checks out, chooses a number or answers the cookie banner. Give the index of the item it belongs to, if any. Ends the task.',
				inputSchema: z.object({ index: z.int().min(0).optional() }),
				execute: async function (this: PageAgentCore, input) {
					const near = input.index === undefined ? undefined : at(this.pageController, input.index)
					const all = commitControls(selectors).filter((e) => (e as HTMLElement).offsetParent !== null || e.getClientRects().length > 0)
					let target: Element | undefined
					for (let n: Element | null | undefined = near; n && !target; n = n.parentElement) target = all.find((e) => n!.contains(e))
					target ??= all[0]
					if (!target) return 'There is no such button on this page.'
					return showPerson(target)
				},
			}),
			// No script runs on Vodafone's page from the model (ADR-0058).
			execute_javascript: null as never,
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
			const goal = last.reflection.next_goal ? maskContent(last.reflection.next_goal).slice(0, 100) : ''
			lines.push(`${n}. ${action}: ${maskContent(String(last.action.output)).slice(0, 120)}${goal ? ` (goal: ${goal})` : ''}`)
			if (clickedStep !== n) o.onStep({ step: n, action, goal: goal || undefined, ms: performance.now() - stepStart })
			o.onSave({ lines, steps: n })
		},
	})
	agent.onAskUser = (q, opts) => o.onAsk(q, opts?.signal)

	const stop = () => void agent.stop()
	o.signal.addEventListener('abort', stop)
	const timer = setTimeout(stop, o.timeoutSec * 1000)
	// While the agent runs, a click or submit no person made never reaches a commit control.
	const block = (e: Event) => {
		if (e.isTrusted) return
		const t = e.target
		if (t instanceof Element && !t.closest('vg-guide') && (commitControl(t, selectors) || (e.type === 'submit' && commitControls(selectors).some((c) => t.contains(c))))) {
			e.preventDefault()
			e.stopImmediatePropagation()
		}
	}
	for (const type of ['click', 'submit']) window.addEventListener(type, block, true)
	try {
		const r = await agent.execute(o.task)
		const steps = offset + r.history.filter((e) => e.type === 'step').length
		if (guided) return { success: true, guided: true, text: guided, steps }
		// page-agent returns error messages in the same field as the model's answer; only a
		// task that ended with the model's `done` call has words meant for the person.
		const ended = r.history.at(-1)
		if (ended?.type === 'error') return { success: false, error: String(r.data), steps }
		return { success: r.success, text: r.data, steps }
	} finally {
		clearTimeout(timer)
		o.signal.removeEventListener('abort', stop)
		for (const type of ['click', 'submit']) window.removeEventListener(type, block, true)
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
		c.report(turnId, [{ name: 'agent.done', attrs: { success: r.success, steps: r.steps, error: r.error, guided: r.guided }, ms: performance.now() - t0 }])
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
