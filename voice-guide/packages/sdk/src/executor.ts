/**
 * Runs a plan on the live page (ADR-0015). Before any step that may unload
 * the page the cursor is saved, so the SDK on the next page resumes exactly
 * there (ADR-0016). Each step reports its outcome for the X-ray panel.
 */
import type { CollectionRef, Plan, PlanStep, ReadSpec } from '#kb'

import { type CommitGuard, locate, locateNow, normText, parseData, parseNumber, readText, visible } from './dom.ts'
import type { GuideUi } from './ui.ts'

export interface StepEvent {
	name: string
	attrs: Record<string, unknown>
	ms?: number
}

export interface ExecutorHost {
	ui: GuideUi
	guard: CommitGuard
	lang: string
	pageMatches(pageId: string | undefined, urlPrefix: string | undefined): boolean
	say(text: string, opts?: { wait?: boolean }): Promise<void>
	/** Persists plan progress; awaited before anything that may unload the page. */
	progress(p: { turnId: string; cursor: number; awaitingNavigation?: boolean; done?: boolean; item?: { collectionId: string; key?: string; name?: string }; events?: StepEvent[] }): Promise<void>
	handoffUrl(url: string): Promise<string>
	offerWatch(step: Extract<PlanStep, { op: 'offerWatch' }>, turnId: string): void
	ask(step: Extract<PlanStep, { op: 'ask' }>): void
	runAgent(step: Extract<PlanStep, { op: 'agent' }>, turnId: string, signal: AbortSignal): Promise<void>
	firstMotion(): void
}

export class StepFailed extends Error {}

export class Executor {
	readonly host: ExecutorHost
	#abort: AbortController | null = null
	#item: Element | null = null

	constructor(host: ExecutorHost) {
		this.host = host
	}

	stop(): void {
		this.#abort?.abort()
		this.#abort = null
	}

	get running(): boolean {
		return !!this.#abort
	}

	async run(plan: Pick<Plan, 'turnId' | 'steps'>, from = 0, ctx: { itemKey?: string; collection?: CollectionRef } = {}): Promise<boolean> {
		this.stop()
		const abort = new AbortController()
		this.#abort = abort
		const signal = abort.signal
		this.#item = null
		// Resuming after a page load: re-select the item the earlier page picked.
		if (from > 0 && ctx.itemKey) {
			const pick = plan.steps.slice(0, from).findLast((s) => s.op === 'pickItem') as Extract<PlanStep, { op: 'pickItem' }> | undefined
			if (pick) this.#item = findItem(pick.collection, { by: 'key', key: ctx.itemKey })
		}
		for (let i = from; i < plan.steps.length; i++) {
			if (signal.aborted) return false
			const step = plan.steps[i]
			const t0 = performance.now()
			let detail = ''
			try {
				detail = (await this.#step(step, plan.turnId, i, signal)) || ''
				if (signal.aborted) return false
				await this.host.progress({ turnId: plan.turnId, cursor: i + 1, events: [{ name: 'sdk.step', attrs: { op: step.op, ok: true, detail, i }, ms: performance.now() - t0 }] })
			} catch (e) {
				if (signal.aborted || (e as Error).name === 'AbortError') return false
				await this.host.progress({ turnId: plan.turnId, cursor: i, done: true, events: [{ name: 'sdk.step', attrs: { op: step.op, ok: false, detail: (e as Error).message, i }, ms: performance.now() - t0 }] })
				this.#abort = null
				throw e
			}
		}
		await this.host.progress({ turnId: plan.turnId, cursor: plan.steps.length, done: true })
		if (this.#abort === abort) this.#abort = null
		return true
	}

	async #step(step: PlanStep, turnId: string, i: number, signal: AbortSignal): Promise<string | void> {
		const h = this.host
		const lang = h.lang
		switch (step.op) {
			case 'navigate': {
				if (samePage(step.url)) return 'already here'
				const url = step.handoff ? await h.handoffUrl(step.url) : step.url
				await h.progress({ turnId, cursor: i + 1, awaitingNavigation: true, events: [{ name: 'sdk.step', attrs: { op: 'navigate', ok: true, detail: new URL(step.url).pathname, i } }] })
				h.firstMotion()
				location.assign(url)
				await new Promise((r) => setTimeout(r, 15_000)) // the page unloads; the next page resumes
				throw new StepFailed('navigation did not happen')
			}
			case 'waitForPage': {
				if (h.pageMatches(step.pageId, step.urlPrefix)) return step.pageId
				await h.progress({ turnId, cursor: i, awaitingNavigation: true })
				// A full page load resumes the plan on the next page; an in-app route change (the /spa/
				// app, ADR-0030) arrives here instead, so keep checking until the page matches.
				const until = Date.now() + (step.timeoutMs ?? 10_000)
				while (Date.now() < until) {
					if (signal.aborted) throw new StepFailed('stopped')
					await new Promise((r) => setTimeout(r, 200))
					if (h.pageMatches(step.pageId, step.urlPrefix)) return step.pageId
				}
				throw new StepFailed(`page ${step.pageId} did not load`)
			}
			case 'reveal': {
				if (step.until) {
					const already = locateNow(step.until, { lang })
					if (already && visible(already)) return 'already visible'
				}
				const el = await locate(step.target, { lang, signal })
				if (!el) throw new StepFailed('control to reveal not found')
				if (h.guard.blocks(el)) throw new StepFailed('refused: commit point')
				el.scrollIntoView({ block: 'center', behavior: 'smooth' })
				h.firstMotion()
				await h.ui.pointAt(el, true)
				;(el as HTMLElement).click()
				if (step.until) await locate(step.until, { lang, timeoutMs: 2000, signal })
				return readText(el, 40)
			}
			case 'scrollTo': {
				const el = await locate(step.target, { lang, item: this.#item, signal })
				if (!el) throw new StepFailed('target not found')
				h.firstMotion()
				el.scrollIntoView({ block: 'center', behavior: 'smooth' })
				return
			}
			case 'pickItem': {
				const deadline = performance.now() + 4000
				let item: Element | null = null
				while (!item && performance.now() < deadline) {
					item = findItem(step.collection, step.select)
					if (!item) await new Promise((r) => setTimeout(r, 100))
				}
				if (!item) throw new StepFailed('no matching item')
				this.#item = item
				// Without a key attribute the item is named by its position, so a follow-up ("subscribe to it") finds it again.
				const key = step.collection.keyAttr ? item.getAttribute(step.collection.keyAttr) || undefined : `#${[...document.querySelectorAll(step.collection.itemCss)].indexOf(item)}`
				const nameField = step.collection.fields[step.collection.nameField]
				const nameEl = nameField ? item.querySelector(nameField.css) : null
				const name = nameEl ? readText(nameEl, 80) : undefined
				await h.progress({ turnId, cursor: i + 1, item: { collectionId: step.collection.id, key, name } })
				return `${name || key || 'item'}${step.select.by === 'min' || step.select.by === 'max' ? ` (${step.select.by} ${step.select.field})` : ''}`
			}
			case 'spotlight': {
				const el = await locate(step.target, { lang, item: this.#item, signal })
				if (!el) throw new StepFailed('target not found')
				el.scrollIntoView({ block: 'center', behavior: 'smooth' })
				h.firstMotion()
				await new Promise((r) => setTimeout(r, 350))
				const text = step.read ? readAnswer(step.read, el, this.#item, lang) : ''
				h.ui.spotlight(el, { caption: text || step.caption })
				if (text) await h.say(text, { wait: false })
				// What was read is a live page value (a price, a balance): the trace says only that it was read (AGENTS.md 4.3; E3).
				return text ? 'read' : step.caption || ''
			}
			case 'say':
				await h.say(step.text, { wait: false })
				return step.text.slice(0, 80)
			case 'click': {
				const el = await locate(step.target, { lang, item: this.#item, signal })
				if (!el) throw new StepFailed('button not found')
				if (h.guard.blocks(el)) throw new StepFailed('refused: commit point')
				el.scrollIntoView({ block: 'center', behavior: 'smooth' })
				h.firstMotion()
				await h.ui.pointAt(el, true)
				// The click may unload the page: save first, so the next page continues at i + 1.
				await h.progress({ turnId, cursor: i + 1, awaitingNavigation: true })
				;(el as HTMLElement).click()
				await new Promise((r) => setTimeout(r, 400))
				return readText(el, 40)
			}
			case 'confirm': {
				const el = await locate(step.target, { lang, item: this.#item, signal })
				if (!el) {
					if (!step.missing) throw new StepFailed('confirm button not found')
					await h.say(step.missing, { wait: false })
					return 'not on the page'
				}
				// Several such buttons and none chosen: pointing at the first could be another product's (ADR-0058).
				if (step.which && step.target.within !== 'item' && (step.target.css.map((c) => [...document.querySelectorAll(c)].filter(visible)).find((l) => l.length)?.length || 0) > 1) {
					await h.say(step.which, { wait: false })
					return 'which one'
				}
				el.scrollIntoView({ block: 'center', behavior: 'smooth' })
				await new Promise((r) => setTimeout(r, 350))
				h.ui.spotlight(el, { caption: step.message, commit: true })
				// The pointer glides to it and never taps: the person presses it (ADR-0058).
				void h.ui.pointAt(el)
				await h.say(step.message, { wait: false })
				return 'left for the person to press'
			}
			case 'offerWatch':
				h.offerWatch(step, turnId)
				return step.label
			case 'ask':
				h.ask(step)
				await h.say(step.question, { wait: false })
				return step.question
			case 'agent':
				// The agent keeps its own continuation state across pages (ADR-0017); the plan
				// hands over now, so a page load never restarts the agent from scratch.
				await h.progress({ turnId, cursor: i + 1, done: true })
				await h.runAgent(step, turnId, signal)
				// The task is the person's own words, and the server has the plan: the trace says only which op ran (AIXC-82).
				return 'agent'
		}
	}
}

function samePage(url: string): boolean {
	try {
		const u = new URL(url, location.href)
		return u.origin === location.origin && u.pathname === location.pathname
	} catch {
		return false
	}
}

export function findItem(c: CollectionRef, select: Extract<PlanStep, { op: 'pickItem' }>['select']): Element | null {
	let items = [...document.querySelectorAll(c.itemCss)]
	const shown = items.filter(visible)
	if (shown.length) items = shown
	if (!items.length) return null
	if (select.by === 'key') {
		// Positional keys ("#2") for collections without a key attribute (real sites rarely have
		// one): the Nth item in document order, as the KB builder numbered them.
		const pos = /^#(\d+)$/.exec(select.key)
		if (pos && !c.keyAttr) return document.querySelectorAll(c.itemCss)[Number(pos[1])] || null
		return items.find((el) => c.keyAttr && el.getAttribute(c.keyAttr) === select.key) || null
	}
	if (select.by === 'name') {
		const want = normText(select.name)
		const nf = c.fields[c.nameField]
		return items.find((el) => normText(nf ? el.querySelector(nf.css)?.textContent || '' : el.textContent || '').includes(want)) || null
	}
	const f = c.fields[select.field]
	if (!f) return null
	let best: Element | null = null
	let bestV = select.by === 'min' ? Infinity : -Infinity
	for (const el of items) {
		const node = el.querySelector(f.css)
		if (!node) continue
		const v = f.type === 'data' ? parseData(node.textContent || '') : parseNumber(node.textContent || '')
		if (v === null) continue
		if (select.by === 'min' ? v < bestV : v > bestV) {
			bestV = v
			best = el
		}
	}
	return best
}

/** Fills a template from the live page: values are read now, never cached. */
export function readAnswer(spec: ReadSpec, el: Element, item: Element | null, lang: string): string {
	if (spec.fields && Object.keys(spec.fields).length) {
		const vals: Record<string, string> = {}
		for (const [k, target] of Object.entries(spec.fields)) {
			const node = locateNow(target, { lang, item: item || el, root: target.within === 'item' ? item || el : document })
			vals[k] = node ? readText(node, 120) : ''
		}
		const tpl = spec.template || Object.keys(vals).map((k) => `{${k}}`).join(' ')
		return tpl.replace(/\{(\w+)\}/g, (_, k) => vals[k] ?? '').replace(/\s+/g, ' ').trim()
	}
	return readText(el, spec.maxChars ?? 220)
}
