/**
 * The floating controls on Vodafone's own pages, measured (live plan §3.7; phase 3 map, S16; ADR-0050,
 * ADR-0052, ADR-0064): one function that reads, in the current state of a live-kit page
 * (./vodafone-layer.ts), every floating control of Vodafone's and of ours that exists there, and the rules
 * the floating-control matrix (./floating-controls-live.e2e.test.ts) and tools/demo-walkthrough.ts hold
 * them to. Nothing here changes the page: it reads boxes, styles and what a press at a point would reach.
 *
 * The controls: Vodafone's accessibility button (#vodafone-aw-icon, in its <accessibility-widget> host) and
 * cookie banner (#onetrust-banner-sdk, with its full-page filter); the Voice Guide's microphone, keyboard
 * button and transcript bar (in vg-guide's shadow root); the trail's pill and card (the same root); the
 * Pocket's button (.pocket-peek) and its curl layers; in the album the mascot, the drone, "Your journey"'s
 * layer and band; the "Pocket it" chips. Reimagine's launcher (.aixc-launcher) and Tips (.tips-entry) are
 * read too, when they exist (they are not on live pages before phases 4 and 6).
 *
 * What "shown" means is the Pocket's own (experiences/src/pocket/obstacles.js): a box with width and
 * height on the screen, display not none, visibility not hidden, opacity above 0.05, and not inert or
 * hidden by an ancestor (the keyboard button and the bar faded out are not reserved).
 */
import type { Page } from 'playwright'

export interface Box {
	left: number
	top: number
	right: number
	bottom: number
}

export interface Control {
	/** Whose: Vodafone's, the guide's (microphone, keyboard, bar), the trail's, or the experience layer's. */
	owner: 'vodafone' | 'guide' | 'trail' | 'layer'
	box: Box | null
	shown: boolean
	display: string
	visibility: string
	opacity: number
	inert: boolean
	/** The element's computed z-index ('auto' or a number), and the highest one on its way up (across shadow hosts). */
	z: string
	stackZ: number
	/** Fixed to the viewport (its own position or an ancestor's): the pairwise rule is for these. */
	fixed: boolean
}

/** The names the matrix knows. A missing control is null. */
export const FIXED = ['accessibility', 'banner', 'mic', 'kbd', 'bar', 'pill', 'card', 'pocket', 'reimagine', 'tips'] as const
export type FixedName = (typeof FIXED)[number]

export interface Measure {
	at: string
	view: { width: number; height: number; scrollY: number; dir: string; lang: string }
	state: { pocketView: string | null; busy: boolean | null; journey: boolean; mic: string | null; listening: boolean; consent: string | null; mascot: string | null; covered: boolean }
	controls: Record<FixedName, Control | null>
	/** The banner's full-page filter (it blocks presses while the banner shows). */
	filter: Control | null
	/** The Pocket's curl layers (their own box, how much they hold) and what they hold or what flies from them. */
	curlLayers: { class: string; box: Box | null; children: number; pointerEvents: string }[]
	curl: Control[]
	/** In the album: the mascot (his drawn body and board), the drone, the journey's layer and band, the album's content. */
	mascot: Box | null
	drone: Box | null
	journeyLayer: Box | null
	journeyBand: Box | null
	albumInner: Box | null
	content: Box[]
	/** The "Pocket it" chips on the screen. */
	chips: Box[]
	/** Our elements (data-aixc, data-vg, the guide's shadow root) whose own z-index is at or above OneTrust's 2147483645. */
	aboveBanner: { what: string; z: number }[]
	/** The accessibility button as with ?aixc=off: box, style attribute and every computed property. */
	button: { box: number[]; attr: string | null; style: Record<string, string> } | null
}

/**
 * Vodafone's accessibility widget as a defined custom element (the real one is Angular's), counting its
 * life: the same init script as tests/e2e/pocket-portal-live.e2e.test.ts's WIDGET_DEFINED (a test file
 * cannot be imported without running its tests). With the kit's WIDGET_STAND_IN it gives the real shape.
 */
export const WIDGET_DEFINED = `(() => {
	if (window.top !== window || customElements.get('accessibility-widget')) return
	window.__aw = { constructed: 0, connected: 0 }
	customElements.define('accessibility-widget', class extends HTMLElement {
		constructor() { super(); window.__aw.constructed++ }
		connectedCallback() { window.__aw.connected++ }
	})
})()`

/** What a press at a point reaches, by owner: the control itself, Vodafone's widget, the banner or its filter, one of ours, or the page. */
export type Hit = { x: number; y: number; at: string }

/* The in-page reader. Kept as one string so the walkthrough and the tests evaluate the same code. */
const READ = `(() => {
	const OT_Z = 2147483645
	const vg = document.querySelector('vg-guide')
	const root = vg && vg.shadowRoot
	const r2 = (v) => Math.round(v * 10) / 10
	const boxOf = (n) => {
		if (!n || !n.getClientRects || !n.getClientRects().length) return null
		const r = n.getBoundingClientRect()
		return r.width > 0 && r.height > 0 ? { left: r2(r.left), top: r2(r.top), right: r2(r.right), bottom: r2(r.bottom) } : null
	}
	const parentOf = (n) => n.parentElement || (n.parentNode && n.parentNode.host) || null
	const view = { width: document.documentElement.clientWidth || innerWidth, height: innerHeight }
	const onScreen = (b) => !!b && b.right > 0 && b.bottom > 0 && b.left < view.width && b.top < view.height
	const read = (n, owner) => {
		if (!n) return null
		const s = getComputedStyle(n)
		let inert = false
		let hidden = false
		let fixed = false
		let stackZ = 0
		let op = 1
		for (let p = n; p; p = parentOf(p)) {
			const ps = getComputedStyle(p)
			if (p.inert || p.hasAttribute('inert')) inert = true
			if (p.hidden || ps.display === 'none') hidden = true
			if (ps.position === 'fixed') fixed = true
			op *= Number(ps.opacity)
			const z = Number(ps.zIndex)
			if (ps.position !== 'static' && Number.isFinite(z)) stackZ = Math.max(stackZ, z)
		}
		const box = boxOf(n)
		const opacity = Math.round(op * 1000) / 1000
		return { owner, box, shown: !!box && onScreen(box) && !inert && !hidden && s.visibility !== 'hidden' && opacity > 0.05, display: s.display, visibility: s.visibility, opacity, inert, z: s.zIndex, stackZ, fixed }
	}
	const q = (sel) => document.querySelector(sel)
	const rq = (sel) => (root ? root.querySelector(sel) : null)
	const peek = q('.pocket-peek')
	const pocket = read(peek, 'layer')
	if (pocket && peek.dataset.state === 'hidden') pocket.shown = false
	const pill = read(rq('.tr-pill'), 'trail')
	if (pill && pill.shown && rq('.tr-pill').classList.contains('tucked')) pill.shown = false
	const controls = {
		accessibility: read(document.getElementById('vodafone-aw-icon'), 'vodafone'),
		banner: read(document.getElementById('onetrust-banner-sdk'), 'vodafone'),
		mic: read(rq('.vg-mic'), 'guide'),
		kbd: read(rq('.vg-kbd'), 'guide'),
		bar: read(rq('.vg-bar'), 'guide'),
		pill,
		card: read(rq('.tr-card'), 'trail'),
		pocket,
		reimagine: read(q('.aixc-launcher'), 'layer'),
		tips: read(q('.tips-entry'), 'layer'),
	}
	const union = (list) => {
		const l = list.filter(Boolean)
		return l.length ? { left: Math.min(...l.map((b) => b.left)), top: Math.min(...l.map((b) => b.top)), right: Math.max(...l.map((b) => b.right)), bottom: Math.max(...l.map((b) => b.bottom)) } : null
	}
	const out = document.getElementById('pocket-output')
	const albumOpen = !!out && !out.hidden && !!boxOf(out)
	const m = q('.pocket-mascot')
	const mascotShown = m && getComputedStyle(m).visibility !== 'hidden' && read(m, 'layer').shown
	const svg = m && m.querySelector('.pocket-mascot__mover > svg')
	const drone = q('.pocket-drone')
	const droneR = drone && !drone.hidden ? read(drone, 'layer') : null
	const jl = q('.pocket-journey-layer:not([hidden])')
	const band = q('.pocket-journey')
	const CONTENT = '.pocket-grid__item, .pocket-empty, .pocket-view__bar > *, .pocket-view__head > *, .pocket-group__head > *'
	const aboveBanner = []
	const all = [...document.querySelectorAll('[data-aixc], [data-vg], vg-guide'), ...(root ? root.querySelectorAll('*') : [])]
	for (const n of all) {
		const z = Number(getComputedStyle(n).zIndex)
		if (Number.isFinite(z) && z >= OT_Z) aboveBanner.push({ what: n.localName + (typeof n.className === 'string' && n.className ? '.' + n.className.split(' ')[0] : ''), z })
	}
	const b = document.getElementById('vodafone-aw-icon')
	let button = null
	if (b) {
		const r = b.getBoundingClientRect()
		const cs = getComputedStyle(b)
		const style = {}
		for (const name of cs) style[name] = cs.getPropertyValue(name)
		button = { box: [r.left, r.top, r.width, r.height].map(r2), attr: b.getAttribute('style'), style }
	}
	const s = window.__aixc && window.__aixc.demos && window.__aixc.demos.pocket && window.__aixc.demos.pocket.state
	const t = window.__vgTrailActive && window.__vgTrailActive.state
	const mic = rq('.vg-mic')
	return {
		view: { ...view, scrollY: Math.round(scrollY), dir: document.documentElement.dir || 'ltr', lang: document.documentElement.lang || '' },
		state: { pocketView: s ? s.view : null, busy: s ? !!s.busy : null, journey: !!jl, mic: mic ? mic.dataset.state || null : null, listening: !!window.__activeRec, consent: t ? t.consent : null, mascot: m ? m.dataset.mascotState || null : null, covered: !!m && m.hasAttribute('data-covered') },
		controls,
		filter: read(q('.onetrust-pc-dark-filter'), 'vodafone'),
		// The curl layers are fixed, viewport-sized and pointer-events: none; what counts is what they hold.
		curlLayers: [...document.querySelectorAll('.pocket-layer')].map((n) => ({ class: String(n.getAttribute('class') || ''), box: boxOf(n), children: n.children.length, pointerEvents: getComputedStyle(n).pointerEvents })),
		curl: [...document.querySelectorAll('.pocket-layer > *, .curl-host--flying')].map((n) => read(n, 'layer')),
		mascot: albumOpen && mascotShown ? union([boxOf(svg && svg.querySelector('[data-part="outline"]')), boxOf(svg && svg.querySelector('[data-part="board-deck"]'))]) : null,
		drone: albumOpen && droneR && droneR.shown ? droneR.box : null,
		journeyLayer: jl ? boxOf(jl) : null,
		journeyBand: jl && band && read(band, 'layer').shown ? boxOf(band) : null,
		albumInner: albumOpen ? boxOf(out.querySelector('.pocket-view__inner')) : null,
		content: albumOpen ? [...out.querySelectorAll(CONTENT)].map(boxOf).filter((x) => x && onScreen(x)) : [],
		chips: [...document.querySelectorAll('.pocket-chips .pocket-cta')].map((n) => read(n, 'layer')).filter((c) => c && c.shown).map((c) => c.box),
		aboveBanner,
		button,
	}
})()`

/** Reads every floating control in the page's current state. */
export async function measureControls(page: Page, at: string): Promise<Measure> {
	return { at, ...((await page.evaluate(READ)) as Omit<Measure, 'at'>) }
}

/** Five points inside a box: its centre and the centres of its four quarters. */
export const points = (b: Box) => {
	const w = b.right - b.left
	const h = b.bottom - b.top
	return [
		[b.left + w / 2, b.top + h / 2],
		[b.left + w / 4, b.top + h / 4],
		[b.left + (3 * w) / 4, b.top + h / 4],
		[b.left + w / 4, b.top + (3 * h) / 4],
		[b.left + (3 * w) / 4, b.top + (3 * h) / 4],
	].map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10] as [number, number])
}

/**
 * What a press at each point reaches, named: 'accessibility' (the button or anything in its widget host),
 * 'banner', 'filter', a control of ours by its matrix name ('mic', 'kbd', 'bar', 'pill', 'card', 'pocket',
 * 'reimagine', 'tips'), 'ours:<tag.class>' for anything else of ours (the album, a chip, the mascot), or
 * 'page:<tag>' for Vodafone's page. Descends into the guide's shadow root.
 */
export async function hitsAt(page: Page, pts: [number, number][]): Promise<Hit[]> {
	return page.evaluate((pts) => {
		const deep = (x: number, y: number) => {
			let el = document.elementFromPoint(x, y)
			while (el && el.shadowRoot) {
				const inner = el.shadowRoot.elementFromPoint(x, y)
				if (!inner || inner === el) break
				el = inner
			}
			return el
		}
		const name = (el: Element | null) => {
			if (!el) return 'nothing'
			if (el.closest('accessibility-widget, #vodafone-aw-icon')) return 'accessibility'
			if (el.closest('#onetrust-banner-sdk')) return 'banner'
			if (el.closest('.onetrust-pc-dark-filter')) return 'filter'
			const host = (el.getRootNode() as ShadowRoot).host
			if (host && host.localName === 'vg-guide') {
				for (const [n, sel] of [['mic', '.vg-mic'], ['kbd', '.vg-kbd'], ['bar', '.vg-bar'], ['pill', '.tr-pill'], ['card', '.tr-card']]) if (el.closest(sel)) return n
				return `ours:vg-guide ${el.localName}.${String(el.getAttribute('class') || '').split(' ')[0]}`
			}
			for (const [n, sel] of [['pocket', '.pocket-peek'], ['reimagine', '.aixc-launcher'], ['tips', '.tips-entry']]) if (el.closest(sel)) return n
			if (el.closest('[data-aixc], [data-vg], vg-guide')) return `ours:${el.localName}.${String(el.getAttribute('class') || '').split(' ')[0]}`
			return `page:${el.localName}`
		}
		return pts.map(([x, y]) => ({ x, y, at: name(deep(Math.min(innerWidth - 1, Math.max(0, x)), Math.min(innerHeight - 1, Math.max(0, y)))) }))
	}, pts)
}

export const overlaps = (a: Box, b: Box) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
/** The clear distance between two boxes (negative when they overlap). */
export const gap = (a: Box, b: Box) => Math.max(b.left - a.right, a.left - b.right, b.top - a.bottom, a.top - b.bottom)
export const fmt = (b: Box | null | undefined) => (b ? `[${[b.left, b.top, b.right, b.bottom].map((v) => Math.round(v)).join(',')}]` : 'none')

/** The shown fixed controls of a measure, by name. */
export const shownControls = (m: Measure) => (Object.entries(m.controls) as [FixedName, Control | null][]).filter(([, c]) => c && c.shown && c.box) as [FixedName, Control & { box: Box }][]

/**
 * Pairs of shown fixed controls whose boxes may overlap, with the reason. There is no design overlap among
 * our controls; the only pairs listed are ones the banner's own rule decides (the banner covers our
 * controls on a first visit and nothing of ours may be above it: rule (c)/(e)), and Vodafone's own pair.
 */
export const OVERLAP_EXCEPTIONS: { pair: [FixedName, FixedName] | [FixedName, '*']; why: string }[] = [
	{ pair: ['banner', '*'], why: 'On a first visit OneTrust\'s banner floats over the page and its filter over everything (live plan 3.7): our controls sit under it; the hit test proves it is on top (rules c and e).' },
	{ pair: ['accessibility', 'banner'], why: "Vodafone's own pair: the real widget's host is at the top z-index, above OneTrust's filter (phase 3 map); not ours to change (AGENTS.md 4.6)." },
]
const excepted = (a: FixedName, b: FixedName) => OVERLAP_EXCEPTIONS.some(({ pair: [x, y] }) => (x === a && (y === '*' || y === b)) || (x === b && (y === '*' || y === a)))

export interface CellContext {
	where: string
	/** The ?aixc=off reading of the accessibility button for the same page, viewport and banner (rule d). */
	off: Measure['button']
	/** What a press at the points of each shown fixed control reaches (rule c), from hitsAt. */
	hits: Record<string, Hit[]>
	/** With the banner: what a press at the points of the banner, and of each of our shown controls, reaches. */
	bannerHits?: { banner: Hit[]; ours: Record<string, Hit[]> }
}

/** The 16 px the mascot keeps from the fixed controls (ADR-0064). */
export const PAD = 16
/** OneTrust's filter's z-index: nothing of ours at or above it. */
export const OT_Z = 2147483645

/**
 * The rules of the matrix (S16; the brief's a to g), for one measured cell. Returns every violation as a
 * sentence with the numbers; an empty list means the cell passes.
 */
export function cellViolations(m: Measure, ctx: CellContext): string[] {
	const v: string[] = []
	const w = `${ctx.where} ${m.at}`
	const shown = shownControls(m)
	const banner = !!m.controls.banner?.shown
	// (a) No two shown fixed controls overlap.
	for (let i = 0; i < shown.length; i++)
		for (let j = i + 1; j < shown.length; j++) {
			const [a, ca] = shown[i]
			const [b, cb] = shown[j]
			if (overlaps(ca.box, cb.box) && !excepted(a, b)) v.push(`${w}: (a) ${a} ${fmt(ca.box)} overlaps ${b} ${fmt(cb.box)}`)
		}
	// The Pocket's curl layers hold nothing at rest; anything they do hold must not sit over a fixed control.
	for (const c of m.curl) if (c?.shown && c.box) for (const [n, cb] of shown) if (n !== 'banner' && overlaps(c.box, cb.box)) v.push(`${w}: (a) a curl layer ${fmt(c.box)} over ${n} ${fmt(cb.box)}`)
	// (b) The mascot and the drone: 16 px from Vodafone's button and the guide's controls; never over the album's content at rest.
	const keep: [string, Box | null][] = [
		['accessibility', m.controls.accessibility?.shown ? m.controls.accessibility.box : null],
		['mic', m.controls.mic?.shown ? m.controls.mic.box : null],
		['kbd', m.controls.kbd?.shown ? m.controls.kbd.box : null],
		['bar', m.controls.bar?.shown ? m.controls.bar.box : null],
	]
	for (const [actor, box] of [['mascot', m.mascot], ['drone', m.drone]] as const) {
		if (!box) continue
		for (const [n, b] of keep) if (b && gap(box, b) < PAD - 0.5) v.push(`${w}: (b) the ${actor} ${fmt(box)} is ${Math.round(gap(box, b))} px from ${n} ${fmt(b)} (needs ${PAD})`)
		if (!(actor === 'mascot' && m.state.covered)) for (const c of m.content) if (overlaps(box, c)) v.push(`${w}: (b) the ${actor} ${fmt(box)} over the album's content ${fmt(c)}`)
	}
	if (m.view.width < 640 && m.drone) v.push(`${w}: (b) a drone under 640 px ${fmt(m.drone)}`)
	// (c) Vodafone's button is on top at its points; nothing of ours has a z-index at or above OneTrust's.
	for (const [n, hits] of Object.entries(ctx.hits)) {
		const ok = (h: Hit) => h.at === n || (banner && n !== 'accessibility' && (h.at === 'banner' || h.at === 'filter'))
		for (const h of hits) if (!ok(h)) v.push(`${w}: (c) a press at ${n}'s point (${h.x},${h.y}) reaches ${h.at}`)
	}
	for (const a of m.aboveBanner) v.push(`${w}: (c) ${a.what} has z-index ${a.z}, at or above OneTrust's ${OT_Z}`)
	for (const [n, c] of shown) if (c.owner !== 'vodafone' && c.stackZ >= OT_Z) v.push(`${w}: (c) ${n} stacks at ${c.stackZ}, at or above OneTrust's ${OT_Z}`)
	// (d) The accessibility button as with ?aixc=off.
	if (ctx.off && m.button) {
		if (JSON.stringify(ctx.off.box) !== JSON.stringify(m.button.box)) v.push(`${w}: (d) the accessibility button's box ${JSON.stringify(m.button.box)} is not ${JSON.stringify(ctx.off.box)} (?aixc=off)`)
		if (ctx.off.attr !== m.button.attr) v.push(`${w}: (d) its style attribute ${JSON.stringify(m.button.attr)} is not ${JSON.stringify(ctx.off.attr)}`)
		const differ = Object.keys(ctx.off.style).filter((k) => ctx.off!.style[k] !== m.button!.style[k])
		if (differ.length) v.push(`${w}: (d) its computed ${differ.map((k) => `${k}: ${ctx.off!.style[k]} -> ${m.button!.style[k]}`).join('; ')}`)
	} else if (ctx.off && !m.button) v.push(`${w}: (d) the accessibility button is gone`)
	// (e) With the banner: a point of the banner reaches the banner (or its filter); nothing of ours is above it.
	if (banner && ctx.bannerHits) {
		for (const h of ctx.bannerHits.banner) if (h.at !== 'banner' && h.at !== 'filter' && h.at !== 'accessibility') v.push(`${w}: (e) a press at the banner's point (${h.x},${h.y}) reaches ${h.at}`)
		for (const [n, hits] of Object.entries(ctx.bannerHits.ours)) for (const h of hits) if (h.at !== 'banner' && h.at !== 'filter' && h.at !== 'accessibility') v.push(`${w}: (e) with the banner, a press at ${n} (${h.x},${h.y}) reaches ${h.at}, above the filter`)
	}
	// (f) In the album the Pocket button is hidden; the mascot, the drone and the journey's band are clear of the fixed controls.
	if (m.state.pocketView === 'pocket') {
		if (m.controls.pocket?.shown) v.push(`${w}: (f) the Pocket button shows in the album ${fmt(m.controls.pocket.box)}`)
		for (const [what, box] of [['mascot', m.mascot], ['drone', m.drone], ['journey band', m.journeyBand]] as const)
			if (box) for (const [n, c] of shown) if (n !== 'banner' && overlaps(box, c.box)) v.push(`${w}: (f) the ${what} ${fmt(box)} overlaps ${n} ${fmt(c.box)}`)
	}
	// (g) On a phone: every shown control inside the viewport.
	if (m.view.width < 640) for (const [n, c] of shown) if (c.box.left < -0.5 || c.box.top < -0.5 || c.box.right > m.view.width + 0.5 || c.box.bottom > m.view.height + 0.5) v.push(`${w}: (g) ${n} ${fmt(c.box)} is not inside the ${m.view.width}x${m.view.height} viewport`)
	return v
}

/** The points of every shown fixed control (rule c) and, with the banner, of the banner and of our shown controls (rule e). */
export async function cellHits(page: Page, m: Measure): Promise<Pick<CellContext, 'hits' | 'bannerHits'>> {
	const hits: Record<string, Hit[]> = {}
	for (const [n, c] of shownControls(m)) if (n !== 'banner') hits[n] = await hitsAt(page, points(c.box))
	if (!m.controls.banner?.shown || !m.controls.banner.box) return { hits }
	const ours: Record<string, Hit[]> = {}
	for (const [n, c] of shownControls(m)) if (c.owner !== 'vodafone') ours[n] = await hitsAt(page, points(c.box))
	for (const [i, b] of m.chips.slice(0, 4).entries()) ours[`chip ${i}`] = await hitsAt(page, points(b))
	if (m.mascot) ours.mascot = await hitsAt(page, points(m.mascot))
	if (m.drone) ours.drone = await hitsAt(page, points(m.drone))
	return { hits, bannerHits: { banner: await hitsAt(page, points(m.controls.banner.box)), ours } }
}
