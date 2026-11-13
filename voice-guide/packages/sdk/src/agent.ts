/**
 * Fallback agent chunk (ADR-0017), loaded only when a plan has an `agent` step.
 * page-agent's headless core and page controller, pinned at 1.12.4, wrapped:
 *  - its model calls go to our agent proxy with a short-lived session token
 *  - commit controls (ADR-0058) are hidden from what it can see, and every click, select and input
 *    is checked against them live, what lies at the click point included (after the scroll that
 *    brings it into view); while it runs, synthetic presses on them (pointer, mouse, click) are
 *    stopped; on commit pages it presses nothing at all, and on the numbers page it chooses none
 *  - at a commit control it shows the person where to press (the guide's pointer and a pulsing
 *    highlight, a line in their language) and ends the task: the person presses it themselves
 *  - personal data is masked in page content before it leaves the browser
 *  - its progress is saved after every step, so the task continues on the next page
 */
import { PageAgentCore, tool } from '@page-agent/core'
import { PageController } from '@page-agent/page-controller'
import * as z from 'zod/v4'

import { COMMIT_SELECTORS, commitIntent, isCommitPage, isCommitWords } from '../../kb/src/commit.ts'
import { asciiDigitsOf, fieldInfo, inputRefusal, maskContent } from './agent-mask.ts'

/** Anything a person presses: links, buttons, inputs that act, labels and choices (AIXC-80). */
const CONTROL = 'a[href], button, [role="button"], [role="link"], [role="checkbox"], [role="radio"], [role="option"], [role="menuitem"], input[type="submit"], input[type="button"], input[type="image"], input[type="checkbox"], input[type="radio"], label, summary, [onclick]'

/** Text as read, one space between the pieces: "EGP 19,999" and "Add to cart" in two spans stay two phrases (AIXC-80). */
const textOf = (el: Element): string => {
	const out: string[] = []
	const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
	for (let n = walk.nextNode(); n; n = walk.nextNode()) out.push(n.nodeValue || '')
	return out.join(' ')
}
/** A control's words as a person meets them: its text, label, title and value, and its pictures' alt text (icon-only buttons). */
const wordsOf = (el: Element): string =>
	[textOf(el), el.getAttribute('aria-label'), el.getAttribute('title'), (el as HTMLInputElement).value, ...[...el.querySelectorAll('img[alt]')].map((i) => i.getAttribute('alt'))].filter(Boolean).join(' ')

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
	if (control) return isCommitWords(wordsOf(control), { link: control.matches('a[href], [role="link"]') && !control.matches('[role="button"]') }) ? control : null
	// Anything else page-agent can press (a div or span with a click handler): its own words, read as a
	// link's when they are long (a card), as a button's when they are a label's length.
	const words = wordsOf(el)
	return isCommitWords(words, { link: words.trim().length > 40 }) ? el : null
}

/** On the numbers page a press on a number (a card, a radio, a label holding one) chooses it (AIXC-70). */
const NUMBERS_PAGE = /\/lines\/[^/]+\/numbers(\/|$)/i
const MOBILE = /(?:\+?20|0)?1[0125](?:[\s.-]?\d){8}/
export function numberChoice(el: Element | null | undefined): Element | null {
	if (!el || !NUMBERS_PAGE.test(location.pathname)) return null
	const c = el.closest('label, [role="radio"], [role="option"], [role="button"], button, li, [onclick]') || el
	return c.matches('input[type="radio"], [role="radio"]') || c.querySelector('input[type="radio"], [role="radio"]') || MOBILE.test(asciiDigitsOf(wordsOf(c))) ? c : null
}

/** What pressing `el` would press: the element, the control it sits in, and what lies at its centre (page-agent clicks there). */
export function commitTarget(el: Element, selectors: readonly string[]): Element | null {
	const hit = commitControl(el, selectors) || numberChoice(el)
	if (hit) return hit
	const r = el.getBoundingClientRect()
	const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
	return at && el.contains(at) ? commitControl(at, selectors) || numberChoice(at) : null
}

/** page-agent scrolls an element into view before it presses its centre; the check looks there too (AIXC-73). */
async function intoView(el: Element): Promise<void> {
	const r = el.getBoundingClientRect()
	if (r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight && r.right <= innerWidth) return
	const s = el as Element & { scrollIntoViewIfNeeded?: () => void }
	if (s.scrollIntoViewIfNeeded) s.scrollIntoViewIfNeeded()
	else el.scrollIntoView({ block: 'center' })
	await new Promise((r) => setTimeout(r, 50))
}

/** The guide never points at the person's accessibility widget, and at the cookie banner only when asked about it. */
const PERSONS_OWN = '#vodafone-aw-icon, accessibility-widget'

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
	if (/\bnumber\b|\bthis line\b|رقم|الخط/.test(w) || NUMBERS_PAGE.test(location.pathname) || matchesAny(el, ['.red-number-card', '.msisdn-container', '.number-card'])) return 'number'
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
/** The events a synthetic press is made of. */
const PRESSES = ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click', 'dblclick', 'submit']

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
	/** A commit control the guard stopped a synthetic press on, during the agent's own click. */
	let stopped: Element | null = null
	/** What the person told the agent when it asked: theirs to have typed, like the request itself (AIXC-86). */
	const told: string[] = []

	const system = [
		`You are the guide of this website. Reply to the person in ${LANG_NAME[o.lang] || 'their language'}: the "done" text is read aloud, so keep it to one or two short sentences.`,
		'Show and explain; you never press anything that buys, pays, subscribes, reserves, adds to the cart, checks out, chooses a number or answers the cookie banner, and you never change a setting on the person\'s behalf. Those buttons are hidden from you. When the person\'s task needs one, call show_person_where (with the index of the item it belongs to, if there is one): the guide points at it and the person presses it. On a page of numbers to choose from, the person picks the number themselves.',
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
			// It ends when the person presses the control, presses Escape or anything of the guide's own
			// (the microphone), or after 30 s; a route change or the control going clears it in the guide.
			const done = () => {
				el.removeEventListener('click', onPress, true)
				removeEventListener('keydown', onKey, true)
				g.ui.root.removeEventListener('pointerdown', done, true)
				clearTimeout(timer)
				if (g.ui.root.querySelector('.spot.commit')) g.ui.clearSpotlight()
			}
			const onPress = (e: Event) => e.isTrusted && done()
			const onKey = (e: KeyboardEvent) => e.key === 'Escape' && done()
			el.addEventListener('click', onPress, true)
			addEventListener('keydown', onKey, true)
			g.ui.root.addEventListener('pointerdown', done, true)
			const timer = setTimeout(done, 30_000)
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
					if (el) await intoView(el)
					const no = await refused(el)
					if (no) return no
					// Page words leave the browser masked (ADR-0018); the server also strips prices from what it keeps (E3).
					const label = el ? maskContent((el.textContent || el.getAttribute('aria-label') || el.getAttribute('value') || '').replace(/\s+/g, ' ').trim()).slice(0, 60) : ''
					clickedStep = n
					o.onStep({ step: n, action: `click_element_by_index [${input.index}]`, goal: label, ms: performance.now() - stepStart })
					o.onSave({ lines: [...lines, `${n}. clicked [${input.index}] "${label}"`], steps: n })
					stopped = null
					const r = await this.pageController.clickElement(input.index)
					// A press the guard stopped on its way (the click landed on a commit control after all) is shown to the person, not reported done.
					if (stopped) return showPerson(stopped)
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
					const refusal = inputRefusal([o.task, ...told].join(' '), input.text, fieldInfo(field))
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
					if (el) await intoView(el)
					const no = await refused(el)
					if (no) return no
					if (el && (NUMBERS_PAGE.test(location.pathname) || isCommitWords(input.text))) return showPerson(el)
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
					const kind = commitIntent(o.task, { url: location.href })
					const all = commitControls(selectors).filter((e) => ((e as HTMLElement).offsetParent !== null || e.getClientRects().length > 0) && !e.closest(PERSONS_OWN) && (kind === 'consent' || !e.closest('#onetrust-consent-sdk')))
					// The item's own button, never one past its card (another product's), and never the first of several (AIXC-74).
					const mine = (list: Element[]) => list.find((e) => lineFor(e) === kind) || (list.length === 1 ? list[0] : undefined)
					let target: Element | undefined
					if (near) {
						for (let n: Element | null = near; n && !target; n = n.parentElement) {
							const inside = all.filter((e) => n!.contains(e))
							if (!inside.length) continue
							target = n === near ? mine(inside) || inside[0] : inside.length === 1 ? inside[0] : undefined
							if (!target) return "That item has no such button of its own. Tell the person you can't see one for it."
						}
					} else {
						target = mine(all)
						if (!target && all.length > 1) return 'There are several such buttons on this page. Call show_person_where with the index of the item the person means, or ask them which one.'
					}
					if (!target) return 'There is no such button on this page.'
					return showPerson(target)
				},
			}),
			// No script runs on Vodafone's page from the model (ADR-0058). page-agent 1.12.4 adds this tool only
			// when `experimentalScriptExecutionTool` is set, which we never set; null keeps it out if that changes.
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
			// What was typed or chosen is never kept, even masked: only that it was done or refused (AIXC-83).
			const output = String(last.action.output)
			const said = /^(input_text|select_dropdown_option)$/.test(last.action.name) ? (output.startsWith('❌') ? 'refused' : 'done') : maskContent(output).slice(0, 120)
			lines.push(`${n}. ${action}: ${said}${goal ? ` (goal: ${goal})` : ''}`)
			if (clickedStep !== n) o.onStep({ step: n, action, goal: goal || undefined, ms: performance.now() - stepStart })
			o.onSave({ lines, steps: n })
		},
	})
	agent.onAskUser = async (q, opts) => {
		const answer = await o.onAsk(q, opts?.signal)
		told.push(answer)
		return answer
	}

	const stop = () => void agent.stop()
	o.signal.addEventListener('abort', stop)
	const timer = setTimeout(stop, o.timeoutSec * 1000)
	// While the agent runs, a press no person made never reaches a commit control: page-agent sends
	// pointer and mouse events before its click (AIXC-73), and the target is the element itself, inside
	// a shadow root too (AIXC-80).
	const block = (e: Event) => {
		if (e.isTrusted) return
		const path = e.composedPath()
		const t = path[0]
		if (!(t instanceof Element) || path.some((n) => n instanceof Element && n.localName === 'vg-guide')) return
		const c = commitControl(t, selectors) || numberChoice(t) || (e.type === 'submit' ? commitControls(selectors).find((x) => t.contains(x)) : null)
		if (c) {
			// page-agent sends pointer and mouse events only to the element at the click point: a stopped one
			// means its own click landed on a commit control. A page script's nested click is stopped quietly.
			if (e.type !== 'click' && e.type !== 'submit' && e.type !== 'dblclick') stopped ??= c
			e.preventDefault()
			e.stopImmediatePropagation()
		}
	}
	for (const type of PRESSES) window.addEventListener(type, block, true)
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
		for (const type of PRESSES) window.removeEventListener(type, block, true)
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
	// The server keeps the task masked (AGENTS.md 4.3); the person's own words stay in this tab for the
	// next page of the same task, so a number they said can still be typed there (ADR-0018 §3; AIXC-86).
	const KEY = 'vg.agent.task'
	let task = step.task
	try {
		const kept = JSON.parse(sessionStorage.getItem(KEY) || 'null') as { turnId: string; task: string } | null
		if (previous && kept?.turnId === turnId && maskContent(kept.task) === maskContent(step.task)) task = kept.task
		else if (!previous) sessionStorage.setItem(KEY, JSON.stringify({ turnId, task }))
	} catch {}
	const forget = () => {
		try {
			sessionStorage.removeItem(KEY)
		} catch {}
	}
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
			task,
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
		forget()
		c.report(turnId, [{ name: 'agent.done', attrs: { success: r.success, steps: r.steps, error: r.error, guided: r.guided }, ms: performance.now() - t0 }])
		if (abort.signal.aborted) return
		if (r.text) await c.say(r.text)
		else if (r.error) await c.say(c.unavailable)
	} catch (e) {
		if (abort.signal.aborted) return
		await save(null)
		forget()
		await c.say(c.unavailable)
		c.report(turnId, [{ name: 'sdk.step', attrs: { op: 'agent', ok: false, detail: (e as Error).message } }])
	} finally {
		c.onAbort(null)
	}
}

;(window as any).__vgAgent = { runAgent, runForGuide }
