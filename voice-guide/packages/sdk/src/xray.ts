/**
 * Builds the X-ray view from real trace events (ADR-0021): what each layer did
 * for each request, and how long it took. Nothing here is computed for show;
 * every number comes from an event a service or the SDK recorded.
 */
import type { XrayView } from './ui.ts'

export interface TraceEv {
	seq?: number
	turnId?: string
	name: string
	service: string
	at: string
	durationMs?: number
	attrs: Record<string, any>
}

const LAYER: Record<string, string> = {
	navigate: 'navigate',
	waitForPage: 'navigate',
	reveal: 'act',
	scrollTo: 'act',
	pickItem: 'act',
	click: 'act',
	spotlight: 'show',
	say: 'show',
	confirm: 'show',
	offerWatch: 'show',
	ask: 'show',
	agent: 'agent',
}

const r = (n?: number) => (n === undefined ? undefined : Math.round(n))

export class XrayModel {
	#events = new Map<number | string, TraceEv>()
	kbVersion?: string

	add(ev: TraceEv): void {
		this.#events.set(ev.seq ?? `${ev.at}${ev.name}`, ev)
	}

	view(): XrayView {
		const turns = new Map<string, XrayView['turns'][number]>()
		const firstMotion: number[] = []
		let replayed = 0
		const sorted = [...this.#events.values()].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))
		for (const ev of sorted) {
			if (!ev.turnId) continue
			let t = turns.get(ev.turnId)
			if (!t) {
				t = { id: ev.turnId, utterance: '', events: [] }
				turns.set(ev.turnId, t)
			}
			const a = ev.attrs || {}
			const push = (layer: string, detail: string, ms?: number, kind: '' | 'agent' | 'err' = '') => t!.events.push({ layer, detail, ms: r(ms), kind })
			switch (ev.name) {
				case 'sdk.listen':
					push('listen', `${a.source === 'voice' ? 'voice' : 'typed'} · "${a.text}"${a.confidence !== undefined ? ` · conf ${Number(a.confidence).toFixed(2)}` : ''}`, ev.durationMs)
					break
				case 'turn.received':
					t.utterance = a.utterance
					if (a.kbVersion) this.kbVersion = a.kbVersion
					break
				case 'router.understood': {
					const cands = (a.candidates || [])
						.slice(0, 3)
						.map((c: any) => `${c.id.split('.').slice(-1)[0]} ${c.score}`)
						.join(', ')
					push('understand', `${a.lang} · ${a.intent}${a.flowId ? `:${a.flowId}` : ''}${a.select ? ` · ${a.select.by} ${a.select.field}` : ''} → ${a.destinationId || 'none'} · ${a.provider} ${a.confidence ?? ''}${a.fallbackReason ? ' (fallback)' : ''}${cands ? ` · [${cands}]` : ''}`, ev.durationMs)
					break
				}
				case 'planner.plan':
					t.route = a.route
					if (a.route === 'replay') replayed++
					push('plan', `${a.route} · ${(a.steps || []).join(' → ') || 'answer only'}`, ev.durationMs)
					break
				case 'turn.planned':
					push('server', `total server time`, a.ms)
					break
				case 'sdk.step':
					push(LAYER[a.op] || 'act', `${a.op}${a.detail ? ` · ${a.detail}` : ''}${a.ok === false ? ' · FAILED' : ''}`, ev.durationMs, a.ok === false ? 'err' : a.op === 'agent' ? 'agent' : '')
					break
				case 'sdk.first_motion':
					firstMotion.push(ev.durationMs ?? 0)
					push('motion', 'first visible movement after the request', ev.durationMs)
					break
				case 'agent.step':
					push('agent', `#${a.step} ${a.action}${a.goal ? ` · ${a.goal}` : ''}`, ev.durationMs, 'agent')
					break
				case 'agent.llm':
					push('llm', `${a.model} · ${a.promptTokens ?? '?'}+${a.completionTokens ?? '?'} tokens${a.masked ? ` · ${a.masked} masked` : ''}`, ev.durationMs, 'agent')
					break
				case 'agent.done':
					push('agent', `${a.success ? 'done' : 'gave up'} · ${a.steps} steps`, ev.durationMs, 'agent')
					break
				case 'agent.llm.error':
				case 'agent.quota':
					push('agent', ev.name === 'agent.quota' ? `budget reached (${a.scope})` : `model error: ${a.error}`, undefined, 'err')
					break
				case 'watch.created':
					push('watch', `watching "${a.label}" via ${a.channel}, every ${a.intervalSec}s`)
					break
				default:
					if (ev.name.endsWith('.error')) push(ev.service, `${ev.name}: ${a.error}`, ev.durationMs, 'err')
			}
		}
		const fm = [...firstMotion].sort((a, b) => a - b)
		const all = [...turns.values()].filter((t) => t.utterance || t.events.length)
		return {
			kbVersion: this.kbVersion,
			totals: { turns: all.filter((t) => t.route).length, replayed, firstMotionP50: fm.length ? Math.round(fm[Math.floor(fm.length / 2)]) : null },
			turns: all.slice(-25),
		}
	}
}
