/**
 * The trail's UI (SPEC-06 §2–§5, ADR-0038), inside the guide's shadow root: a slim pill below the
 * site's header, the consent card, and the expanded sheet (step rail with scrubbing, an accessible
 * position slider, the sandboxed preview, and up to three explored items with question chips).
 * Vodafone tokens from the guide's theme; logical properties so Arabic mirrors; no animation under
 * reduced motion. The view only renders and reports intents; the controller decides.
 */
import { TRAIL_CONFIG } from './config.ts'
import { tt } from './i18n.ts'
import type { ExploredItem, TrailStepSummary } from './types.ts'
import type { RecState, TrailState } from './state.ts'

export interface ViewModel extends TrailState {
	lang: string
	steps: TrailStepSummary[]
	currentStepId: string | null
	position: number
	explored: ExploredItem[]
	activeQuestionId: string | null
	aggregation: boolean
	retentionHours: number
	notice: string | null
	reducedMotion: boolean
	transition: string | null
	/** "Not now" this session: no offer at all. */
	pillHidden: boolean
	/** This page shows the journey itself (the meta or a claim; ADR-0040, ADR-0050): no sheet here, only the pill and consent. */
	hosted: boolean
}

export interface ViewIntents {
	togglePill(): void
	allow(): void
	notNow(): void
	pause(): void
	resume(): void
	clear(): void
	clearAll(): void
	turnOff(): void
	close(): void
	select(stepId: string, how: 'pointer' | 'keyboard' | 'touch'): void
	scrub(stepId: string, fraction: number, how: 'pointer' | 'keyboard' | 'touch'): void
	hold(stepId: string): void
	leaveRail(): void
	togglePlay(): void
	open(): void
	chip(item: ExploredItem, q: { id: string; text: string }): void
}

const svg = (d: string, cls = '') => `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"${cls ? ` class="${cls}"` : ''}><path fill="currentColor" d="${d}"/></svg>`
const ICON = {
	journey: svg('M5 4a2 2 0 1 1 0 4 2 2 0 0 1 0-4Zm14 12a2 2 0 1 1 0 4 2 2 0 0 1 0-4ZM6 9h7a4 4 0 0 1 0 8H8v-2h5a2 2 0 0 0 0-4H6a4 4 0 0 1 0-8h1v2H6a2 2 0 0 0 0 4Z'),
	lock: svg('M7 10V8a5 5 0 0 1 10 0v2h1a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h1Zm2 0h6V8a3 3 0 0 0-6 0v2Z'),
	close: svg('M6.4 5 5 6.4 10.6 12 5 17.6 6.4 19l5.6-5.6 5.6 5.6 1.4-1.4-5.6-5.6L19 6.4 17.6 5 12 10.6z'),
	more: svg('M5 10a2 2 0 1 1 0 4 2 2 0 0 1 0-4Zm7 0a2 2 0 1 1 0 4 2 2 0 0 1 0-4Zm7 0a2 2 0 1 1 0 4 2 2 0 0 1 0-4Z'),
	play: svg('M8 5v14l11-7z'),
	pause: svg('M7 5h4v14H7zm6 0h4v14h-4z'),
	arrow: svg('M9 6l6 6-6 6-1.4-1.4L12.2 12 7.6 7.4z'),
	/** The same arrow for right-to-left reading: chosen at render time, not mirrored with CSS. */
	arrowRtl: svg('M15 6l-6 6 6 6 1.4-1.4L11.8 12l4.6-4.6z'),
	chevron: svg('M7.4 9 12 13.6 16.6 9 18 10.4l-6 6-6-6z'),
	ask: svg('M12 2a10 10 0 0 1 8.7 15l1.3 4.9-5-1.3A10 10 0 1 1 12 2Zm-1 13v2h2v-2h-2Zm1-9a4 4 0 0 0-4 4h2a2 2 0 1 1 3 1.7c-.9.6-2 1.3-2 3.3h2c0-1 .5-1.4 1.2-1.9A4 4 0 0 0 12 6Z'),
	item: svg('M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm1 2v10h14V7H5Zm2 2h6v2H7V9Zm0 4h10v2H7v-2Z'),
	section: svg('M4 4h16v6H4V4Zm0 8h7v8H4v-8Zm9 0h7v8h-7v-8Z'),
	faq: svg('M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20Zm-1 14v2h2v-2h-2Zm1-10a4 4 0 0 0-4 4h2a2 2 0 1 1 3 1.7c-.9.6-2 1.3-2 3.3h2c0-1 .5-1.4 1.2-1.9A4 4 0 0 0 12 6Z'),
	visual: svg('M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm1 11h14l-4.5-6-3.5 4.5-2.5-3L5 16Zm3-6a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z'),
	page: svg('M6 2h9l5 5v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1Zm8 1.5V8h4.5L14 3.5ZM8 12h8v2H8v-2Zm0 4h8v2H8v-2Z'),
	collection: svg('M4 4h7v7H4V4Zm9 0h7v7h-7V4ZM4 13h7v7H4v-7Zm9 0h7v7h-7v-7Z'),
}

export const TRAIL_CSS = `
.tr { --tr-strong: 700;  --tr-accent: var(--vf-red, var(--accent)); --tr-accent-dark: var(--vf-red-dark, var(--accent)); --tr-ink: var(--vf-ink, #14181c); --tr-ink-2: var(--vf-ink-2, #5b6770); --tr-bg: var(--vf-bg, #f4f4f4); --tr-surface: var(--vf-surface, #ffffff); --tr-shadow: var(--vf-shadow-float, 0 2px 8px rgba(0,0,0,.16)); --tr-radius: var(--radius, 6px); --tr-top: 72px; font-family: inherit; color: var(--tr-ink); }
.tr [hidden] { display: none !important; }
.tr button { font: inherit; color: inherit; cursor: pointer; }
.tr-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.tr-pill { position: fixed; z-index: 2147483400; top: var(--tr-top); inset-inline-end: calc(16px + env(safe-area-inset-right, 0px)); min-height: 44px; display: inline-flex; align-items: center; gap: 10px; padding: 6px 14px 6px 12px; border: 1px solid rgba(0,0,0,.08); border-radius: 999px; background: var(--tr-surface); box-shadow: var(--tr-shadow); font-size: 14px; line-height: 20px; transition: transform .18s cubic-bezier(.2,.8,.2,1), box-shadow .18s; }
.tr-pill:hover { box-shadow: 0 4px 14px rgba(0,0,0,.18); transform: translateY(-1px); }
/* A short note under the pill, e.g. "This page is not saved"; it goes away by itself. */
.tr-toast { position: fixed; z-index: 2147483400; top: calc(var(--tr-top) + 52px); inset-inline-end: calc(16px + env(safe-area-inset-right, 0px)); max-width: min(320px, calc(100vw - 32px)); margin: 0; display: inline-flex; align-items: center; gap: 8px; padding: 6px 12px; border-radius: 999px; background: rgba(20,20,30,.86); color: #fff; font-size: 13px; line-height: 18px; box-shadow: var(--tr-shadow); animation: tr-toast 4.2s ease both; pointer-events: none; }
.tr-toast svg { width: 14px; height: 14px; flex: none; }
@keyframes tr-toast { 0% { opacity: 0; transform: translateY(-4px); } 6%, 88% { opacity: 1; transform: none; } 100% { opacity: 0; } }
/* Scrolling down tucks the pill away so it never sits on the content being read; scrolling up or focusing it brings it back. */
.tr-pill.tucked:not(:focus-visible) { transform: translateY(calc(-1 * var(--tr-top) - 56px)); box-shadow: none; pointer-events: none; }
.tr-pill svg { width: 18px; height: 18px; color: var(--tr-accent); flex: none; }
.tr-dot { width: 8px; height: 8px; border-radius: 50%; background: #bebebe; flex: none; box-shadow: 0 0 0 3px rgba(190,190,190,.25); }
.tr[data-rec="recording"] .tr-dot { background: var(--tr-accent); box-shadow: 0 0 0 3px rgba(230,0,0,.18); }
.tr[data-rec="recording"] .tr-dot { animation: tr-breathe 2.4s ease-in-out infinite; }
.tr-ticks { display: inline-flex; gap: 3px; align-items: center; }
.tr-ticks i { width: 14px; height: 4px; border-radius: 2px; background: #d8d8d8; }
.tr-ticks i.on { background: var(--tr-accent); }
.tr-ticks i.boundary { background: transparent; border: 1px dashed #b4b4b4; height: 2px; }
.tr-card, .tr-sheet { position: fixed; z-index: 2147483401; top: calc(var(--tr-top) + 52px); background: var(--tr-surface); border-radius: var(--tr-radius); box-shadow: 0 12px 40px rgba(0,0,0,.18), 0 2px 8px rgba(0,0,0,.08); }
.tr-card { inset-inline-end: calc(16px + env(safe-area-inset-right, 0px)); width: min(420px, calc(100vw - 32px)); max-height: calc(100vh - var(--tr-top) - 68px); overflow-y: auto; padding: 20px 20px 16px; border-top: 4px solid var(--tr-accent); }
.tr-card h2 { margin: 0 0 6px; font-size: 20px; line-height: 26px; }
.tr-card .tr-lead { margin: 0 0 14px; color: var(--tr-ink); font-size: 15px; line-height: 22px; }
.tr-card ul { margin: 0 0 16px; padding: 0; list-style: none; display: grid; gap: 8px; }
.tr-card li { display: grid; grid-template-columns: 18px 1fr; gap: 10px; font-size: 14px; line-height: 20px; color: var(--tr-ink-2); }
.tr-card li svg { width: 18px; height: 18px; color: var(--tr-ink-2); margin-top: 1px; }
.tr-row { display: flex; gap: 10px; flex-wrap: wrap; }
.tr-primary, .tr-secondary, .tr-btn { min-height: 44px; padding: 10px 18px; border-radius: var(--tr-radius); border: 1px solid transparent; font-size: 15px; line-height: 22px; }
.tr-primary { background: var(--tr-accent); color: #fff !important; box-shadow: var(--vf-shadow-btn, none); }
.tr-primary:hover { background: var(--tr-accent-dark); }
.tr-secondary, .tr-btn { background: var(--tr-surface); border-color: #cccccc; }
.tr-secondary:hover, .tr-btn:hover { background: var(--tr-bg); }
.tr-sheet { inset-inline: calc(16px + env(safe-area-inset-left, 0px)); margin-inline: auto; max-width: 1040px; max-height: calc(100vh - var(--tr-top) - 68px); display: flex; flex-direction: column; overflow: hidden; }
.tr-head { display: flex; align-items: center; gap: 12px; padding: 14px 16px 10px 20px; }
.tr-head .tr-titles { flex: 1; min-width: 0; }
.tr-head h2 { margin: 0; font-size: 18px; line-height: 24px; }
.tr-sub { margin: 2px 0 0; display: flex; align-items: center; gap: 6px; font-size: 13px; line-height: 18px; color: var(--tr-ink-2); }
.tr-sub svg { width: 14px; height: 14px; }
.tr-icon { width: 44px; height: 44px; border: 0; border-radius: 50%; background: transparent; display: grid; place-items: center; }
.tr-icon:hover { background: var(--tr-bg); }
.tr-icon svg { width: 22px; height: 22px; }
.tr-menu-wrap { position: relative; }
.tr-menu { position: absolute; z-index: 1; top: 48px; inset-inline-end: 0; min-width: 240px; padding: 6px 0; background: var(--tr-surface); border-radius: var(--tr-radius); box-shadow: var(--tr-shadow), 0 0 0 1px rgba(0,0,0,.06); }
.tr-menu button { display: block; width: 100%; min-height: 44px; padding: 10px 16px; border: 0; background: none; text-align: start; font-size: 15px; }
.tr-menu button:hover, .tr-menu button:focus-visible { background: var(--tr-bg); }
.tr-menu button[data-act="off"] { color: var(--tr-accent-dark); }
.tr-rail { padding: 2px 20px 4px; overflow-x: auto; scrollbar-width: thin; }
.tr-steps { display: flex; align-items: stretch; gap: 0; margin: 0; padding: 0 0 6px; list-style: none; min-width: min-content; }
.tr-steps li { display: flex; align-items: center; flex: 1 1 auto; min-width: 128px; max-width: 320px; }
.tr-steps li.tr-b { flex: 0 0 auto; min-width: 104px; }
.tr-seg { position: relative; flex: 1; min-width: 0; min-height: 56px; display: flex; flex-direction: column; justify-content: center; gap: 6px; padding: 8px 10px; border: 1px solid transparent; border-radius: var(--tr-radius); background: none; text-align: start; touch-action: none; }
.tr-seg:hover { background: var(--tr-bg); }
.tr-seg[aria-pressed="true"] { background: var(--tr-bg); border-color: #e2e2e2; }
.tr-seg .tr-t { display: flex; align-items: center; gap: 6px; font-size: 14px; line-height: 18px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tr-seg .tr-here { flex: none; font-size: 11px; line-height: 16px; padding: 0 6px; border-radius: 999px; background: var(--tr-ink); color: #fff; }
.tr-track { position: relative; height: 6px; border-radius: 3px; background: #e2e2e2; overflow: visible; }
.tr-fill { position: absolute; inset-block: 0; inset-inline-start: 0; width: 0; border-radius: 3px; background: var(--tr-accent); }
.tr-knob { position: absolute; top: 50%; inset-inline-start: 0; width: 14px; height: 14px; margin-inline-start: -7px; margin-top: -7px; border-radius: 50%; background: #fff; box-shadow: 0 0 0 2px var(--tr-accent), 0 1px 4px rgba(0,0,0,.25); opacity: 0; }
.tr-seg[aria-pressed="true"] .tr-knob { opacity: 1; }
.tr-b .tr-seg { cursor: default; color: var(--tr-ink-2); }
.tr-b .tr-track { background: repeating-linear-gradient(90deg, #cfcfcf 0 6px, transparent 6px 10px); }
.tr-link { flex: none; width: 22px; display: grid; place-items: center; color: #b4b4b4; }
.tr-link svg { width: 18px; height: 18px; }
.tr-link.cta { color: var(--tr-accent); }
.tr-scrub { display: flex; align-items: center; gap: 12px; padding: 0 20px 10px; }
.tr-slider { position: relative; flex: 1; height: 44px; display: flex; align-items: center; cursor: pointer; touch-action: none; border-radius: var(--tr-radius); }
.tr-slider .tr-track { flex: 1; height: 4px; }
.tr-slider .tr-knob { opacity: 1; width: 18px; height: 18px; margin-inline-start: -9px; margin-top: -9px; }
.tr-slider:focus-visible { outline: 3px solid #00b0ca; outline-offset: 2px; }
.tr-play { flex: none; }
.tr-play svg { width: 22px; height: 22px; }
.tr-body { display: grid; grid-template-columns: minmax(0, 3fr) minmax(0, 2fr); gap: 16px; padding: 0 20px 20px; overflow-y: auto; min-height: 0; }
.tr-preview { position: relative; margin: 0; border-radius: var(--tr-radius); background: var(--tr-bg); overflow: hidden; aspect-ratio: 16 / 10; box-shadow: inset 0 0 0 1px rgba(0,0,0,.06); }
.tr-frame { position: absolute; inset: 0; overflow: hidden; pointer-events: none; }
.tr-stage { position: absolute; top: 0; left: 0; transform-origin: 0 0; }
.tr-stage .replayer-wrapper { position: relative; }
.tr-stage iframe { border: 0; display: block; background: #fff; }
.tr-stage .replayer-mouse { position: absolute; width: 22px; height: 22px; margin: -11px 0 0 -11px; border-radius: 50%; background: rgba(230,0,0,.18); box-shadow: 0 0 0 2px #fff, 0 0 0 4px var(--tr-accent); transition: left .05s linear, top .05s linear; z-index: 2; }
.tr-stage .replayer-mouse.active { background: rgba(230,0,0,.45); }
.tr-stage .replayer-mouse-tail { position: absolute; pointer-events: none; z-index: 1; }
.tr-badge { position: absolute; z-index: 3; bottom: 12px; inset-inline-start: 12px; display: inline-flex; align-items: center; gap: 6px; max-width: calc(100% - 24px); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding: 4px 10px; border-radius: 999px; background: rgba(20,20,30,.82); color: #fff; font-size: 12.8px; line-height: 18px; }
.tr-badge svg { width: 14px; height: 14px; }
.tr-veil { position: absolute; z-index: 2; inset: 0; display: grid; place-items: center; padding: 20px; text-align: center; color: var(--tr-ink-2); font-size: 14px; background: linear-gradient(135deg, var(--tr-bg), #ececec); }
.tr-preview::after { content: ''; position: absolute; inset: 0; z-index: 2; pointer-events: none; box-shadow: inset 0 -36px 32px -28px rgba(20,20,30,.28); }
.tr-cta { position: absolute; z-index: 3; inset-inline-end: 12px; top: 12px; display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: var(--tr-radius); background: var(--tr-accent); color: #fff; font-size: 14px; box-shadow: var(--vf-shadow-btn, 0 3px 6px rgba(0,0,0,.1)); }
.tr-cta svg { width: 16px; height: 16px; display: block; }
.tr-cta-icon { display: contents; }
.tr-explored h3 { margin: 2px 0 10px; font-size: 15px; line-height: 20px; }
.tr-items { margin: 0; padding: 0; list-style: none; display: grid; gap: 10px; }
.tr-item { display: grid; grid-template-columns: 40px minmax(0, 1fr); gap: 10px 12px; padding: 12px; border-radius: var(--tr-radius); background: var(--tr-surface); box-shadow: 0 0 0 1px #e6e6e6; }
.tr-thumb { width: 40px; height: 40px; border-radius: var(--tr-radius); background: var(--tr-bg); display: grid; place-items: center; color: var(--tr-accent); }
.tr-thumb svg { width: 22px; height: 22px; }
.tr-meta { min-width: 0; display: grid; gap: 2px; }
.tr-meta b { font-size: 15px; line-height: 20px; overflow: hidden; text-overflow: ellipsis; }
.tr-meta span { font-size: 13px; line-height: 18px; color: var(--tr-ink-2); }
.tr-meta em { font-style: normal; font-size: 13px; line-height: 18px; color: var(--tr-ink); display: inline-flex; align-items: center; gap: 6px; }
.tr-meta em::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: var(--tr-accent); flex: none; }
.tr-chips { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: 8px; }
.tr-chip { min-height: 44px; display: inline-flex; align-items: center; gap: 8px; padding: 8px 12px; border: 1px solid var(--tr-accent); border-radius: var(--tr-radius); background: var(--tr-surface); color: var(--tr-ink) !important; font-size: 14px; line-height: 20px; text-align: start; }
.tr-chip svg { width: 16px; height: 16px; flex: none; color: var(--tr-accent); }
.tr-chip:hover { background: var(--tr-bg); }
.tr-chip[aria-pressed="true"] { background: var(--tr-accent); color: #fff !important; }
.tr-chip[aria-pressed="true"] svg { color: #fff; }
.tr-none { margin: 0; color: var(--tr-ink-2); font-size: 14px; }
.tr-notice { margin: 0 20px 10px; padding: 8px 12px; border-radius: var(--tr-radius); background: var(--tr-bg); font-size: 14px; }
.tr-empty { padding: 4px 20px 22px; color: var(--tr-ink-2); }
@media (min-width: 1180px) { .tr-item { grid-template-columns: 40px minmax(0, 1fr); } }
@media (max-width: 760px) {
  .tr-body { grid-template-columns: 1fr; grid-auto-rows: max-content; }
  .tr-preview { aspect-ratio: auto; height: min(64vw, 300px); }
  .tr[data-consent="granted"] .tr-pill .tr-label, .tr[data-consent="paused"] .tr-pill .tr-label { display: none; }
  .tr-pill { padding-inline: 12px; }
  .tr-head { padding-inline-start: 16px; }
  .tr-rail, .tr-scrub, .tr-body { padding-inline: 12px; }
  .tr-steps li { min-width: 112px; }
  .tr-pill .tr-ticks { display: none; }
}
/* Vodafone's bold face is its own family, used at normal weight (SPEC-01); elsewhere, a bold weight. */
.tr h2, .tr h3, .tr-meta b, .tr-primary, .tr-pill .tr-label, .tr-seg[aria-pressed="true"] .tr-t { font-family: var(--vf-font-bold, inherit); font-weight: var(--tr-strong); }
.tr[data-brand="vodafone"] { --tr-strong: normal; }
@keyframes tr-breathe { 50% { box-shadow: 0 0 0 6px rgba(230,0,0,.08); } }
@media (prefers-reduced-motion: reduce) { .tr *, .tr-pill, .tr-stage .replayer-mouse { transition: none !important; animation: none !important; } }
`

const kindIcon = (k: string) => (ICON as Record<string, string>)[k] || ICON.section

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] {
	const e = document.createElement(tag)
	if (cls) e.className = cls
	if (html) e.innerHTML = html
	return e
}

const pick = (m: Record<string, string> | undefined, lang: string) => (m ? m[lang] || m[lang.slice(0, 2)] || m.en || Object.values(m)[0] || '' : '')
/** KB labels are often lower case ("weekend offer"): show them as titles. */
const titleCase = (s: string) => (s ? s.charAt(0).toLocaleUpperCase() + s.slice(1) : s)

export class TrailView {
	readonly host: HTMLElement
	readonly i: ViewIntents
	readonly frame: HTMLElement
	#els: Record<string, HTMLElement> = {}
	#m: ViewModel | null = null
	#stepsKey = ''
	#exploredKey = ''
	#holdTimer = 0
	#toastTimer = 0
	#drag: { stepId: string; el: HTMLElement; how: 'pointer' | 'touch' } | null = null
	#abort = new AbortController()

	constructor(parent: HTMLElement, intents: ViewIntents) {
		this.i = intents
		this.host = el('div', 'tr')
		this.host.innerHTML = `
			<div class="tr-sr" role="status" aria-live="polite"></div>
			<p class="tr-toast" role="status" hidden>${ICON.lock}<span></span></p>
			<button class="tr-pill" type="button" aria-expanded="false" aria-controls="tr-sheet">${ICON.journey}<span class="tr-label"></span><span class="tr-dot" aria-hidden="true"></span><span class="tr-ticks" aria-hidden="true"></span></button>
			<section class="tr-card" role="dialog" aria-modal="false" aria-labelledby="tr-card-title" hidden>
				<h2 id="tr-card-title"></h2><p class="tr-lead"></p>
				<ul><li class="tr-what"></li><li class="tr-not"></li><li class="tr-where"></li><li class="tr-ctl"></li><li class="tr-agg"></li></ul>
				<div class="tr-row"><button class="tr-primary tr-allow" type="button"></button><button class="tr-secondary tr-later" type="button"></button></div>
			</section>
			<section class="tr-sheet" id="tr-sheet" hidden>
				<div class="tr-head"><div class="tr-titles"><h2></h2><p class="tr-sub">${ICON.lock}<span></span></p></div>
					<button class="tr-btn tr-pause" type="button"></button>
					<div class="tr-menu-wrap"><button class="tr-icon tr-more" type="button" aria-haspopup="menu" aria-expanded="false">${ICON.more}</button>
						<div class="tr-menu" role="menu" hidden><button type="button" role="menuitem" data-act="clear"></button><button type="button" role="menuitem" data-act="clear-all"></button><button type="button" role="menuitem" data-act="off"></button></div></div>
					<button class="tr-icon tr-close" type="button">${ICON.close}</button></div>
				<p class="tr-notice" hidden></p>
				<p class="tr-empty" hidden></p>
				<div class="tr-rail"><ol class="tr-steps"></ol></div>
				<div class="tr-scrub"><div class="tr-slider" role="slider" tabindex="0" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><div class="tr-track"><span class="tr-fill"></span><span class="tr-knob"></span></div></div><button class="tr-icon tr-play" type="button"></button></div>
				<div class="tr-body">
					<figure class="tr-preview"><figcaption class="tr-badge">${ICON.lock}<span></span></figcaption><div class="tr-frame" inert aria-hidden="true"></div><div class="tr-veil"></div><div class="tr-cta" hidden><i class="tr-cta-icon"></i><span></span></div></figure>
					<section class="tr-explored"><h3></h3><ul class="tr-items"></ul><p class="tr-none" hidden></p></section>
				</div>
			</section>`
		parent.appendChild(this.host)
		const q = (s: string) => this.host.querySelector(s) as HTMLElement
		for (const [k, s] of Object.entries({ sr: '.tr-sr', pill: '.tr-pill', label: '.tr-pill .tr-label', ticks: '.tr-ticks', card: '.tr-card', sheet: '.tr-sheet', head: '.tr-head h2', sub: '.tr-sub span', pause: '.tr-pause', more: '.tr-more', menu: '.tr-menu', close: '.tr-close', notice: '.tr-notice', empty: '.tr-empty', rail: '.tr-rail', steps: '.tr-steps', scrub: '.tr-scrub', slider: '.tr-slider', sliderFill: '.tr-slider .tr-fill', sliderKnob: '.tr-slider .tr-knob', play: '.tr-play', preview: '.tr-preview', badge: '.tr-badge span', veil: '.tr-veil', cta: '.tr-cta', ctaText: '.tr-cta span', explored: '.tr-explored h3', items: '.tr-items', none: '.tr-none', body: '.tr-body' })) this.#els[k] = q(s)
		this.frame = q('.tr-frame')
		this.#wire()
	}

	#wire(): void {
		const o = { signal: this.#abort.signal }
		const e = this.#els
		e.pill.addEventListener('click', () => this.i.togglePill(), o)
		this.host.querySelector('.tr-allow')!.addEventListener('click', () => this.i.allow(), o)
		this.host.querySelector('.tr-later')!.addEventListener('click', () => this.i.notNow(), o)
		e.pause.addEventListener('click', () => (this.#m?.rec === 'paused' || this.#m?.rec === 'error' ? this.i.resume() : this.i.pause()), o)
		e.close.addEventListener('click', () => this.i.close(), o)
		e.play.addEventListener('click', () => this.i.togglePlay(), o)
		e.more.addEventListener('click', () => this.#menu(!!e.menu.hidden), o)
		e.menu.addEventListener('click', (ev) => {
			const act = (ev.target as HTMLElement).closest('[data-act]')?.getAttribute('data-act')
			this.#menu(false)
			if (act === 'clear') this.i.clear()
			else if (act === 'clear-all') this.i.clearAll()
			else if (act === 'off') this.i.turnOff()
		}, o)
		e.menu.addEventListener('keydown', (ev) => {
			const items = [...e.menu.querySelectorAll('button')]
			const at = items.indexOf(this.host.getRootNode() instanceof ShadowRoot ? ((this.host.getRootNode() as ShadowRoot).activeElement as HTMLButtonElement) : (document.activeElement as HTMLButtonElement))
			if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
				ev.preventDefault()
				items[(at + (ev.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus()
			} else if (ev.key === 'Escape') {
				ev.stopPropagation()
				this.#menu(false)
				e.more.focus()
			}
		}, o)
		// Escape closes what is open and puts focus back where it came from.
		this.host.addEventListener('keydown', (ev) => {
			if (ev.key !== 'Escape') return
			ev.stopPropagation()
			this.i.close()
			e.pill.focus()
		}, o)
		// ---- the step rail: hover reveals, moving scrubs, holding plays; tap selects, drag scrubs ----
		const seg = (t: EventTarget | null) => (t as HTMLElement | null)?.closest?.('.tr-seg') as HTMLElement | null
		e.steps.addEventListener('pointermove', (ev) => {
			const s = seg(ev.target)
			if (!s || !s.dataset.step || s.dataset.boundary) return
			if (ev.pointerType === 'touch' && !this.#drag) return
			const how = ev.pointerType === 'touch' ? 'touch' : 'pointer'
			if (this.#m?.selectedStepId !== s.dataset.step) this.i.select(s.dataset.step, how)
			this.i.scrub(s.dataset.step, this.#fraction(ev.clientX, s), how)
			clearTimeout(this.#holdTimer)
			const id = s.dataset.step
			if (how === 'pointer' && !this.#m?.reducedMotion) this.#holdTimer = window.setTimeout(() => this.i.hold(id), TRAIL_CONFIG.ui.holdToPlayMs)
		}, o)
		e.steps.addEventListener('pointerdown', (ev) => {
			const s = seg(ev.target)
			if (!s || !s.dataset.step || s.dataset.boundary) return
			ev.preventDefault()
			const how = ev.pointerType === 'touch' ? 'touch' : 'pointer'
			this.#drag = { stepId: s.dataset.step, el: s, how }
			try {
				s.setPointerCapture(ev.pointerId)
			} catch {}
			this.i.select(s.dataset.step, how)
			if (how === 'touch') this.i.scrub(s.dataset.step, this.#fraction(ev.clientX, s), how)
		}, o)
		const endDrag = () => {
			this.#drag = null
		}
		e.steps.addEventListener('pointerup', endDrag, o)
		e.steps.addEventListener('pointercancel', endDrag, o)
		e.steps.addEventListener('pointerleave', (ev) => {
			if (ev.pointerType === 'touch') return
			clearTimeout(this.#holdTimer)
			this.i.leaveRail()
		}, o)
		e.steps.addEventListener('click', (ev) => {
			const s = seg(ev.target)
			if (s?.dataset.step && !s.dataset.boundary && (ev as PointerEvent).pointerType === '') this.i.open()
		}, o)
		e.steps.addEventListener('keydown', (ev) => this.#railKey(ev as KeyboardEvent), o)
		e.steps.addEventListener('focusin', (ev) => {
			const s = seg(ev.target)
			// Focus shows the step's first frame; it never starts playback on its own.
			if (s?.dataset.step && !s.dataset.boundary && this.#m?.selectedStepId !== s.dataset.step) this.i.select(s.dataset.step, 'keyboard')
		}, o)
		// ---- the slider: the accessible way to scrub within a step ----
		e.slider.addEventListener('keydown', (ev) => {
			const m = this.#m
			if (!m?.selectedStepId) return
			const rtl = this.#rtl()
			let f = m.position
			const k = ev.key
			const step = TRAIL_CONFIG.ui.keyboardStep
			if (k === 'ArrowRight' || k === 'ArrowUp') f += k === 'ArrowRight' && rtl ? -step : step
			else if (k === 'ArrowLeft' || k === 'ArrowDown') f -= k === 'ArrowLeft' && rtl ? -step : step
			else if (k === 'PageUp') f += step * 4
			else if (k === 'PageDown') f -= step * 4
			else if (k === 'Home') f = 0
			else if (k === 'End') f = 1
			else if (k === ' ' || k === 'Enter') {
				ev.preventDefault()
				this.i.togglePlay()
				return
			} else return
			ev.preventDefault()
			this.i.scrub(m.selectedStepId, Math.max(0, Math.min(1, f)), 'keyboard')
		}, o)
		const slide = (ev: PointerEvent) => {
			const m = this.#m
			if (!m?.selectedStepId) return
			this.i.scrub(m.selectedStepId, this.#fraction(ev.clientX, e.slider), ev.pointerType === 'touch' ? 'touch' : 'pointer')
		}
		e.slider.addEventListener('pointerdown', (ev) => {
			ev.preventDefault()
			try {
				e.slider.setPointerCapture(ev.pointerId)
			} catch {}
			slide(ev)
		}, o)
		e.slider.addEventListener('pointermove', (ev) => {
			if (e.slider.hasPointerCapture?.(ev.pointerId)) slide(ev)
		}, o)
		e.items.addEventListener('click', (ev) => {
			const b = (ev.target as HTMLElement).closest('.tr-chip') as HTMLElement | null
			if (!b || !this.#m) return
			const item = this.#m.explored.find((x) => x.destinationId === b.dataset.dest)
			const q = item ? (item.questions[this.#m.lang] || []).find((x) => x.id === b.dataset.q) : undefined
			if (item && q) this.i.chip(item, q)
		}, o)
	}

	#rtl(): boolean {
		return getComputedStyle(this.host).direction === 'rtl'
	}

	#fraction(x: number, box: HTMLElement): number {
		const r = (box.querySelector('.tr-track') || box).getBoundingClientRect()
		const f = r.width ? (x - r.left) / r.width : 0
		return Math.max(0, Math.min(1, this.#rtl() ? 1 - f : f))
	}

	#railKey(ev: KeyboardEvent): void {
		const m = this.#m
		if (!m) return
		const segs = [...this.#els.steps.querySelectorAll<HTMLElement>('.tr-seg:not([data-boundary])')]
		const at = segs.findIndex((s) => s.dataset.step === m.selectedStepId)
		const rtl = this.#rtl()
		let next = -1
		if (ev.key === 'ArrowRight') next = at + (rtl ? -1 : 1)
		else if (ev.key === 'ArrowLeft') next = at + (rtl ? 1 : -1)
		else if (ev.key === 'Home') next = 0
		else if (ev.key === 'End') next = segs.length - 1
		else if (ev.key === 'Enter') {
			ev.preventDefault()
			this.i.open()
			return
		} else if (ev.key === ' ') {
			ev.preventDefault()
			this.i.togglePlay()
			return
		} else return
		ev.preventDefault()
		const s = segs[Math.max(0, Math.min(segs.length - 1, next))]
		if (!s?.dataset.step) return
		this.i.select(s.dataset.step, 'keyboard')
		s.focus()
	}

	#menu(open: boolean): void {
		this.#els.menu.hidden = !open
		this.#els.more.setAttribute('aria-expanded', String(open))
		if (open) (this.#els.menu.querySelector('button') as HTMLElement | null)?.focus()
	}

	/** A brief visible note under the pill (also announced); it hides itself after a few seconds. */
	toast(text: string): void {
		const t = this.host.querySelector('.tr-toast') as HTMLElement
		t.querySelector('span')!.textContent = text
		t.hidden = true
		void t.offsetWidth
		t.hidden = false
		clearTimeout(this.#toastTimer)
		this.#toastTimer = window.setTimeout(() => (t.hidden = true), 4300)
		this.announce(text)
	}

	announce(text: string): void {
		this.#els.sr.textContent = ''
		requestAnimationFrame(() => (this.#els.sr.textContent = text))
	}

	tuck(on: boolean): void {
		this.#els.pill.classList.toggle('tucked', on)
	}

	setTop(px: number): void {
		this.host.style.setProperty('--tr-top', `${Math.round(px)}px`)
	}

	focusPill(): void {
		this.#els.pill.focus()
	}

	focusSheet(): void {
		const s = this.#els.steps.querySelector<HTMLElement>('.tr-seg[tabindex="0"]') || this.#els.close
		s.focus()
	}

	render(m: ViewModel): void {
		this.#m = m
		const e = this.#els
		const L = m.lang
		this.host.dataset.rec = m.rec
		this.host.dataset.consent = m.consent
		this.host.dataset.view = m.view
		const offOrUnset = m.consent !== 'granted' && m.consent !== 'paused'
		// ---- pill ----
		e.pill.hidden = m.pillHidden
		const name = offOrUnset ? tt('offer', L) : tt('journey', L)
		e.label.textContent = name
		e.pill.setAttribute('aria-expanded', String(m.view === 'expanded' || m.consentCard))
		const state = stateLine(m.rec, L)
		e.pill.setAttribute('aria-label', state === name ? name : `${name}. ${state}`)
		const ticks = m.steps.slice(-6)
		e.ticks.innerHTML = ticks.map((s) => `<i class="${s.type === 'boundary' ? 'boundary' : s.id === m.currentStepId ? 'on' : ''}"></i>`).join('')
		e.ticks.hidden = offOrUnset || !ticks.length
		// ---- consent card ----
		e.card.hidden = !m.consentCard
		if (m.consentCard) {
			this.host.querySelector('#tr-card-title')!.textContent = tt('consentTitle', L)
			this.host.querySelector('.tr-lead')!.textContent = tt('consentBody', L)
			const li = (cls: string, icon: string, text: string) => {
				const x = this.host.querySelector(cls)!
				x.innerHTML = icon
				x.append(el('span', '', ''))
				x.lastElementChild!.textContent = text
			}
			li('.tr-what', ICON.page, tt('consentWhat', L))
			li('.tr-not', ICON.lock, tt('consentNot', L))
			li('.tr-where', ICON.journey, tt('consentWhere', L, { hours: m.retentionHours }))
			li('.tr-ctl', ICON.pause, tt('consentControl', L))
			li('.tr-agg', ICON.collection, tt(m.aggregation ? 'consentAggregateOn' : 'consentAggregateOff', L))
			this.host.querySelector('.tr-allow')!.textContent = tt('allow', L)
			this.host.querySelector('.tr-later')!.textContent = tt('notNow', L)
		}
		// ---- sheet ----
		const open = m.view === 'expanded' && !m.consentCard && !m.hosted
		e.sheet.hidden = !open
		e.sheet.setAttribute('aria-label', tt('journey', L))
		if (!open) return
		e.head.textContent = tt('journey', L)
		e.sub.textContent = `${tt('saved', L)} · ${stateLine(m.rec, L)}`
		e.pause.textContent = m.rec === 'paused' || m.rec === 'error' ? tt('resume', L) : tt('pause', L)
		e.pause.hidden = m.rec === 'disabled' || m.rec === 'awaiting-consent'
		e.more.setAttribute('aria-label', tt('more', L))
		const items = e.menu.querySelectorAll('button')
		items[0].textContent = tt('clear', L)
		items[1].textContent = tt('clearAll', L)
		items[2].textContent = tt('turnOff', L)
		e.close.setAttribute('aria-label', tt('close', L))
		e.notice.hidden = !m.notice
		e.notice.textContent = m.notice || ''
		const pages = m.steps.filter((s) => s.type === 'page')
		e.empty.hidden = pages.length > 0
		e.empty.textContent = tt('empty', L)
		for (const k of ['rail', 'scrub', 'body'] as const) e[k].hidden = !pages.length
		if (!pages.length) return
		this.#renderSteps(m)
		this.#renderPosition(m)
		this.#renderPreview(m)
		this.#renderExplored(m)
	}

	#renderSteps(m: ViewModel): void {
		const L = m.lang
		// Selection changes are applied in place (below), so focus stays on the step the person is on.
		const key = JSON.stringify([L, m.currentStepId, m.steps.map((s) => [s.id, s.type, s.navigationCause.kind, pick(s.title, L)])])
		if (key === this.#stepsKey) return
		this.#stepsKey = key
		const list = this.#els.steps
		list.textContent = ''
		list.setAttribute('aria-label', tt('steps', L))
		const pages = m.steps.filter((s) => s.type === 'page')
		const weight = (s: TrailStepSummary) => Math.max(1, Math.sqrt(Math.max(1, s.durationMs / 1000)))
		m.steps.forEach((s, i) => {
			const li = el('li', s.type === 'boundary' ? 'tr-b' : '')
			if (s.type === 'page') li.style.flexGrow = String(weight(s))
			const b = el('button', 'tr-seg') as HTMLButtonElement
			b.type = 'button'
			// A private page is never named; another site or a page that is not saved shows where you went.
			const title = s.type === 'boundary' ? (s.boundary === 'private' ? tt('privatePage', L) : tt('otherSite', L, { title: pick(s.title, L) })) : pick(s.title, L)
			const t = el('span', 'tr-t')
			t.dir = 'auto'
			t.textContent = title
			if (s.id === m.currentStepId) {
				const here = el('span', 'tr-here')
				here.textContent = tt('here', L)
				t.prepend(here)
				b.setAttribute('aria-current', 'page')
			}
			b.append(t, el('span', 'tr-track', '<span class="tr-fill"></span><span class="tr-knob"></span>'))
			if (s.type === 'boundary') {
				b.dataset.boundary = '1'
				b.setAttribute('aria-disabled', 'true')
				b.tabIndex = -1
				b.setAttribute('aria-label', title)
			} else {
				b.dataset.step = s.id
				const n = pages.indexOf(s) + 1
				b.setAttribute('aria-label', tt('step', L, { n, total: pages.length, title }))

			}
			li.append(b)
			const next = m.steps[i + 1]
			if (next) {
				const cta = next.navigationCause.kind === 'destination'
				const link = el('span', `tr-link${cta ? ' cta' : ''}`, this.#rtl() ? ICON.arrowRtl : ICON.arrow)
				if (cta) link.title = tt('ledTo', L, { title: pick(next.title, L) })
				link.setAttribute('aria-hidden', 'true')
				li.append(link)
			}
			list.append(li)
		})
	}

	#renderPosition(m: ViewModel): void {
		const L = m.lang
		const sel = m.steps.find((s) => s.id === m.selectedStepId)
		const pct = Math.round(m.position * 100)
		const title = sel ? pick(sel.title, L) : ''
		const sl = this.#els.slider
		sl.setAttribute('aria-label', tt('position', L, { title }))
		sl.setAttribute('aria-valuenow', String(pct))
		sl.setAttribute('aria-valuetext', tt('positionValue', L, { pct, title }))
		sl.setAttribute('aria-disabled', String(!sel || m.preview === 'error' || m.preview === 'idle'))
		this.#els.sliderFill.style.width = `${pct}%`
		this.#els.sliderKnob.style.insetInlineStart = `${pct}%`
		const pages = m.steps.filter((s) => s.type === 'page')
		for (const s of this.#els.steps.querySelectorAll<HTMLElement>('.tr-seg[data-step]')) {
			const on = s.dataset.step === m.selectedStepId
			s.setAttribute('aria-pressed', String(on))
			s.tabIndex = s.dataset.step === (m.selectedStepId || pages.at(-1)?.id) ? 0 : -1
			;(s.querySelector('.tr-fill') as HTMLElement).style.width = on ? `${pct}%` : '0%'
			;(s.querySelector('.tr-knob') as HTMLElement).style.insetInlineStart = on ? `${pct}%` : '0%'
		}
		const playing = m.preview === 'playing'
		this.#els.play.innerHTML = playing ? ICON.pause : ICON.play
		this.#els.play.setAttribute('aria-label', playing ? tt('stop', L) : tt('play', L))
		this.#els.play.toggleAttribute('disabled', !sel || (m.preview !== 'ready' && m.preview !== 'playing' && m.preview !== 'scrubbing'))
		this.#els.cta.hidden = !m.transition
		const icon = this.#els.cta.querySelector('.tr-cta-icon') as HTMLElement
		if (m.transition) icon.innerHTML = this.#rtl() ? ICON.arrowRtl : ICON.arrow
		this.#els.ctaText.textContent = m.transition || ''
	}

	#renderPreview(m: ViewModel): void {
		const L = m.lang
		const sel = m.steps.find((s) => s.id === m.selectedStepId)
		this.#els.badge.textContent = sel ? tt('memory', L, { title: pick(sel.title, L) }) : tt('memoryShort', L)
		const veil = this.#els.veil
		const show = !sel || m.preview === 'loading' || m.preview === 'error' || m.preview === 'idle' || sel.replay !== 'ok'
		veil.hidden = !show
		veil.textContent = !sel ? tt('resumeHint', L) : m.preview === 'loading' ? tt('loading', L) : tt('noPreview', L)
	}

	#renderExplored(m: ViewModel): void {
		const L = m.lang
		const key = JSON.stringify([L, m.selectedStepId, m.activeQuestionId, m.explored.map((x) => [x.destinationId, x.reason, Object.keys(x.questions)])])
		if (key === this.#exploredKey) return
		this.#exploredKey = key
		this.#els.explored.textContent = tt('explored', L)
		const list = this.#els.items
		list.textContent = ''
		this.#els.none.hidden = m.explored.length > 0
		this.#els.none.textContent = tt('nothingExplored', L)
		for (const x of m.explored) {
			const li = el('li', 'tr-item')
			const title = titleCase(pick(x.title, L))
			li.append(el('div', 'tr-thumb', kindIcon(x.kind)))
			const meta = el('div', 'tr-meta')
			const b = el('b')
			b.dir = 'auto'
			b.textContent = title
			const ctx = el('span')
			ctx.dir = 'auto'
			ctx.textContent = titleCase(pick(x.context, L))
			const why = el('em')
			why.textContent = x.popular ? `${tt(`why_${x.reason}`, L)} · ${tt('popular', L)}` : tt(`why_${x.reason}`, L)
			meta.append(b, ctx, why)
			li.append(meta)
			const qs = x.questions[L] || []
			if (qs.length) {
				const chips = el('div', 'tr-chips')
				chips.setAttribute('role', 'group')
				chips.setAttribute('aria-label', `${tt('ask', L)}: ${title}`)
				for (const q of qs.slice(0, 3)) {
					const c = el('button', 'tr-chip', ICON.ask) as HTMLButtonElement
					c.type = 'button'
					c.dir = 'auto'
					c.dataset.dest = x.destinationId
					c.dataset.q = q.id
					c.setAttribute('aria-pressed', String(q.id === m.activeQuestionId))
					c.append(q.text)
					chips.append(c)
				}
				li.append(chips)
			}
			list.append(li)
		}
	}

	destroy(): void {
		clearTimeout(this.#holdTimer)
		this.#abort.abort()
		this.host.remove()
	}
}

function stateLine(rec: RecState, L: string): string {
	if (rec === 'recording') return tt('recording', L)
	if (rec === 'paused') return tt('paused', L)
	if (rec === 'blocked') return tt('notHere', L)
	if (rec === 'storage-full') return tt('full', L)
	if (rec === 'error') return tt('failed', L)
	return tt('offer', L)
}
