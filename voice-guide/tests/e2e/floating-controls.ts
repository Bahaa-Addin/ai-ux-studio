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
 * read too, when they exist. Reimagine's view bar and composer are matrix controls since phase 4c (S7, ADR-0076
 * §3, B2): 'viewbar' is what of the bar a person presses (the box of its shown buttons, not its full-width row,
 * whose inline end is padded clear of the trail's pill), 'composer' the open composer's box; rules (a) and (c)
 * hold them as they hold the others. 'preview' is the close control of an open preview of ours (canvas's .cv-dialog,
 * streaming's .st-modal, in the box): while one is open the rest of the view is inert by design (ADR-0076 §7, the
 * owner's decision of 2026-11-21: not modal, the rest of the view cannot be used, Tab stays in it, Escape closes it),
 * the view bar with it, so the preview's close is the one control of ours in the view then.
 *
 * S7's own readings (phase 4c, design §4 and §5.3): readView() reads Reimagine's view (the box, the corners' safe
 * zones the shell wrote on it and the same zones measured here from the controls, an open preview, Vodafone's open
 * menu), viewViolations() holds it to ADR-0076's rules, menuHits() and underMenu() hold Vodafone's open menu over
 * the view, and gateOf() reads the gate (coverage and sections) on any page with ?aixc-debug.
 *
 * What "shown" means is the Pocket's own (experiences/src/pocket/obstacles.js): a box with width and
 * height on the screen, display not none, visibility not hidden, opacity above 0.05, and not inert or
 * hidden by an ancestor (the keyboard button and the bar faded out are not reserved).
 *
 * Three readings the live run of 2026-11-17 showed were missing (the lead's W1-B):
 *  - the curl: its layers are viewport-sized, inert and pointer-events: none, so what counts is what they
 *    paint. Every band of ./curl.js that shows (visibility visible) is mapped to the screen through its own
 *    transform, its clipping box, the plane's clip and the lift's perspective: a polygon per band, so rule
 *    (a) holds the peeking corner itself (not its viewport-sized layer) to the fixed controls;
 *  - the drone: its state, why it does not show, and the box it paints (the button and its drawing) when it
 *    does; in the album at 640 px and wider a drone that does not show is a violation (rule f);
 *  - our words in Vodafone's faces: the fonts Chrome used for the text of our chips, the liner, the album's
 *    title, its Back, a sticker's title and the journey's header (DevTools: CSS.getPlatformFontsForNode); a
 *    font that is not a web font (isCustomFont false) is a violation (rule h).
 */
import assert from 'node:assert/strict'

import type { CDPSession, Page } from 'playwright'

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
export const FIXED = ['accessibility', 'banner', 'mic', 'kbd', 'bar', 'pill', 'card', 'pocket', 'reimagine', 'tips', 'watch', 'viewbar', 'composer', 'preview'] as const
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
	/** What the curl paints: per layer (and per flying sticker), the polygons of its shown bands on the screen and their box. */
	curl: CurlPart[]
	/** Why the curl's painted part could not be read (then rule (a) does not see it), or null. */
	curlSkipped: string | null
	/** In the album: the mascot (his drawn body and board), the drone, the journey's layer and band, the album's content. */
	mascot: Box | null
	/** The drone's painted box (its button and its drawing) when it shows in the album, else null. */
	drone: Box | null
	/** The drone wherever it is: its state, its anchor, and why it does not show (null when it shows). */
	droneState: { state: string | null; anchor: string | null; hidden: boolean; shown: boolean; why: string | null; box: Box | null } | null
	journeyLayer: Box | null
	journeyBand: Box | null
	albumInner: Box | null
	content: Box[]
	/** The "Pocket it" chips on the screen. */
	chips: Box[]
	/** Our elements (data-aixc, data-vg, the guide's shadow root) whose own z-index is at or above OneTrust's 2147483645. */
	aboveBanner: { what: string; z: number }[]
	/**
	 * The accessibility button as with ?aixc=off: box, style attribute and every computed property, and the layout
	 * viewport it was laid out in (measureControls adds it from `layout`; absent on older readings).
	 */
	button: { box: number[]; attr: string | null; style: Record<string, string>; viewport?: LayoutViewport } | null
	/** The layout viewport and what locks the page's scroll (rule d's one correction: Vodafone's phone menu). Absent on readings made by hand. */
	layout?: LayoutReading | null
	/** The fonts Chrome drew our visible words in (rule h). */
	fonts: FontUse[]
	/** Why the fonts could not be read (then rule (h) does not see them), or null. */
	fontsSkipped: string | null
}

/** The width fixed elements are laid out in: documentElement.clientWidth (the window less a classic scrollbar), the window's, html's scrollbar-gutter. */
export interface LayoutViewport {
	clientWidth: number
	innerWidth: number
	gutter: string
}

/**
 * The layout viewport, and the page's scroll lock as the page has it: the element whose overflow the viewport takes
 * (html, or body when html's is visible), its computed overflow-y, whether its style attribute sets an overflow, every
 * stylesheet rule matching it that hides its overflow (and whose: Vodafone's, or ours by our markers or /__vg/), the
 * stylesheets of ours that could not be read, html's and body's classes, and Vodafone's menu marks that hold
 * (MENU_MARKED, never on a node of ours).
 */
export interface LayoutReading extends LayoutViewport {
	scroller: 'html' | 'body'
	overflowY: string
	inlineOverflow: string | null
	rules: { selector: string; sheet: string; vodafone: boolean }[]
	oursUnread: string[]
	classes: { html: string; body: string }
	menu: string[]
}

/** A part of the curl that paints: a layer of the Pocket (or a flying sticker), its shown bands as polygons on the screen. */
export interface CurlPart {
	what: string
	/** The box of its polygons (within the viewport), or null when nothing of it paints. */
	box: Box | null
	shown: boolean
	/** One convex polygon per shown band, in viewport pixels. */
	polys: [number, number][][]
	/** How many bands paint. */
	bands: number
	inert: boolean
}

/** Text of ours and the fonts Chrome used to draw it (DevTools: CSS.getPlatformFontsForNode). */
export interface FontUse {
	what: string
	text: string
	fonts: { familyName: string; postScriptName: string; isCustomFont: boolean; glyphCount: number }[]
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
	// The page watch's changed count (ADR-0078 Decision 8): its own box, which sits off the button's top-left corner.
	const watch = read(peek && peek.querySelector('.pocket-peek__changed'), 'layer')
	if (watch && peek.dataset.state === 'hidden') watch.shown = false
	const pill = read(rq('.tr-pill'), 'trail')
	if (pill && pill.shown && rq('.tr-pill').classList.contains('tucked')) pill.shown = false
	const union = (list) => {
		const l = list.filter(Boolean)
		return l.length ? { left: Math.min(...l.map((b) => b.left)), top: Math.min(...l.map((b) => b.top)), right: Math.max(...l.map((b) => b.right)), bottom: Math.max(...l.map((b) => b.bottom)) } : null
	}
	// Reimagine's view bar as a control: the box of its shown buttons (its row spans the box; its inline end is padded
	// clear of the pill, ADR-0076 §3), shown while the bar shows and one of its buttons is on the screen.
	const barNode = q('.aixc-viewbar')
	const viewbar = read(barNode, 'layer')
	if (viewbar) {
		viewbar.box = union([...barNode.querySelectorAll('button')].map((b) => read(b, 'layer')).filter((c) => c && c.shown).map((c) => c.box))
		viewbar.shown = viewbar.shown && !!viewbar.box && onScreen(viewbar.box)
	}
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
		watch,
		viewbar,
		composer: read(q('.aixc-composer'), 'layer'),
		// An open preview's close (S7): the one control of ours in the view while the preview is open.
		preview: read(q('.aixc-box dialog[open] :is(.cv-dialog__close, .st-modal__close)'), 'layer'),
	}
	const out = document.getElementById('pocket-output')
	const albumOpen = !!out && !out.hidden && !!boxOf(out)
	const m = q('.pocket-mascot')
	const mascotShown = m && getComputedStyle(m).visibility !== 'hidden' && read(m, 'layer').shown
	const svg = m && m.querySelector('.pocket-mascot__mover > svg')
	// The drone: what it paints (its button and its drawing) when it shows; else why not.
	const drone = q('.pocket-drone')
	let droneState = null
	if (drone) {
		const dr = read(drone, 'layer')
		const painted = dr.box ? union([dr.box, boxOf(drone.querySelector('svg'))]) : null
		const hiddenUp = drone.parentElement && drone.parentElement.closest('[hidden]')
		const why = dr.shown ? null : drone.hidden ? 'its hidden attribute is set (anchor ' + (drone.dataset.droneAnchor || 'none') + ')' : hiddenUp ? 'an ancestor is hidden (' + hiddenUp.localName + '.' + String(hiddenUp.getAttribute('class') || '').split(' ')[0] + ')' : dr.display === 'none' ? 'display none' : !dr.box ? 'it has no box' : !onScreen(dr.box) ? 'off the screen' : dr.visibility === 'hidden' ? 'visibility hidden' : dr.opacity <= 0.05 ? 'transparent (opacity ' + dr.opacity + ')' : dr.inert ? 'inert' : 'not shown'
		droneState = { state: drone.dataset.droneState || null, anchor: drone.dataset.droneAnchor || null, hidden: drone.hidden, shown: !!dr.shown, why, box: painted }
	}
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
	// What the curl paints (./curl.js): every part is a band that clips (overflow hidden) holding a sheet-size
	// box, placed by its transform; the plane clips them all to the sheet, the lift sees them in perspective.
	// Each shown band (visibility visible, not transparent) becomes a convex polygon on the screen.
	const matrixOf = (n) => {
		const tf = getComputedStyle(n).transform
		return tf && tf !== 'none' ? new DOMMatrix(tf) : new DOMMatrix()
	}
	const rectPoly = (w, h) => [[0, 0], [w, 0], [w, h], [0, h]]
	const area2 = (poly) => {
		let a = 0
		for (let i = 0; i < poly.length; i++) a += poly[i][0] * poly[(i + 1) % poly.length][1] - poly[(i + 1) % poly.length][0] * poly[i][1]
		return a
	}
	// Sutherland-Hodgman: the part of the subject polygon inside the convex polygon clip.
	const clipBy = (subject, clip) => {
		let res = subject
		const sgn = area2(clip) >= 0 ? 1 : -1
		for (let i = 0; i < clip.length && res.length; i++) {
			const p = clip[i]
			const q2 = clip[(i + 1) % clip.length]
			const side = (r) => sgn * ((q2[0] - p[0]) * (r[1] - p[1]) - (q2[1] - p[1]) * (r[0] - p[0]))
			const next = []
			for (let k = 0; k < res.length; k++) {
				const a = res[k]
				const b = res[(k + 1) % res.length]
				const sa = side(a)
				const sb = side(b)
				if (sa >= 0) next.push(a)
				if (sa >= 0 !== sb >= 0) {
					const f = sa / (sa - sb)
					next.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f])
				}
			}
			res = next
		}
		return res
	}
	const through = (mx, poly) =>
		poly.map((p) => {
			const r = mx.transformPoint(new DOMPoint(p[0], p[1], 0, 1))
			return [r.x / r.w, r.y / r.w, r.z / r.w]
		})
	const opacityTo = (n, top) => {
		let o = 1
		for (let p = n; p && p !== top.parentElement; p = p.parentElement) o *= Number(getComputedStyle(p).opacity)
		return o
	}
	const screen = [[0, 0], [view.width, 0], [view.width, view.height], [0, view.height]]
	/** The polygons a curl root (.curl-plane or .curl-lift) paints, in viewport pixels. */
	const paintedBy = (root, top) => {
		const rr = root.getBoundingClientRect()
		const rs = getComputedStyle(root)
		const lift = root.classList.contains('curl-lift')
		const persp = lift ? parseFloat(rs.perspective) : NaN
		const origin = rs.perspectiveOrigin.split(' ').map(parseFloat)
		const polys = []
		for (const band of root.querySelectorAll('.curl-win, .curl-band')) {
			if (band.parentElement && band.parentElement.closest('.curl-win')) continue
			if (getComputedStyle(band).visibility !== 'visible' || getComputedStyle(band).display === 'none' || opacityTo(band, top) <= 0.02) continue
			if (!band.offsetWidth || !band.offsetHeight) continue
			let local = rectPoly(band.offsetWidth, band.offsetHeight)
			const box = band.querySelector(':scope > .curl-box')
			if (box) local = clipBy(local, through(matrixOf(box), rectPoly(box.offsetWidth, box.offsetHeight)).map((p) => [p[0], p[1]]))
			if (local.length < 3) continue
			// A band of the lift's own is seen in its perspective; one inside a flattened wrapper lies flat.
			const flat = !lift || band.parentElement !== root || !(persp > 0)
			let poly = through(matrixOf(band), local).map((p) => (flat ? [p[0], p[1]] : [origin[0] + ((p[0] - origin[0]) * persp) / (persp - p[2]), origin[1] + ((p[1] - origin[1]) * persp) / (persp - p[2])]))
			if (!lift) poly = clipBy(poly, rectPoly(root.offsetWidth, root.offsetHeight))
			poly = clipBy(
				poly.map((p) => [p[0] + rr.left, p[1] + rr.top]),
				screen,
			)
			if (poly.length >= 3 && Math.abs(area2(poly)) > 2) polys.push(poly.map((p) => [r2(p[0]), r2(p[1])]))
		}
		return polys
	}
	const boxOfPolys = (polys) => {
		const pts = polys.flat()
		return pts.length ? { left: Math.min(...pts.map((p) => p[0])), top: Math.min(...pts.map((p) => p[1])), right: Math.max(...pts.map((p) => p[0])), bottom: Math.max(...pts.map((p) => p[1])) } : null
	}
	let curl = []
	let curlSkipped = null
	try {
		for (const layer of document.querySelectorAll('.pocket-layer')) {
			const polys = [...layer.querySelectorAll(':scope > .curl-plane, :scope > .curl-lift')].flatMap((root) => paintedBy(root, layer))
			const box = boxOfPolys(polys)
			curl.push({ what: String(layer.getAttribute('class') || '').split(' ').pop(), box, shown: !!box, polys, bands: polys.length, inert: !!layer.closest('[inert]') })
		}
		// A sticker in flight paints its own box (it moves: its transform is not followed here).
		for (const host of document.querySelectorAll('.curl-host--flying')) {
			const r = read(host, 'layer')
			const box = r.box && onScreen(r.box) && !r.hidden && r.visibility !== 'hidden' && r.opacity > 0.05 ? r.box : null
			curl.push({ what: 'curl-host--flying', box, shown: !!box, polys: box ? [[[box.left, box.top], [box.right, box.top], [box.right, box.bottom], [box.left, box.bottom]]] : [], bands: box ? 1 : 0, inert: r.inert })
		}
	} catch (e) {
		curl = []
		curlSkipped = 'the curl could not be read: ' + (e && e.message)
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
		curl,
		curlSkipped,
		mascot: albumOpen && mascotShown ? union([boxOf(svg && svg.querySelector('[data-part="outline"]')), boxOf(m && m.querySelector('[data-part="board-deck"]'))]) : null,
		drone: albumOpen && droneState && droneState.shown ? droneState.box : null,
		droneState,
		journeyLayer: jl ? boxOf(jl) : null,
		journeyBand: jl && band && read(band, 'layer').shown ? boxOf(band) : null,
		albumInner: albumOpen ? boxOf(out.querySelector('.pocket-view__inner')) : null,
		content: albumOpen ? [...out.querySelectorAll(CONTENT)].map(boxOf).filter((x) => x && onScreen(x)) : [],
		chips: [...document.querySelectorAll('.pocket-chips .pocket-cta')].map((n) => read(n, 'layer')).filter((c) => c && c.shown).map((c) => c.box),
		aboveBanner,
		button,
	}
})()`

/**
 * Our words on the screen, as [what, text, the element that holds the text]: the first two chips' labels,
 * a liner, and in the album its title, its Back and a sticker's title, and the journey's header when open;
 * while Reimagine's composer or a view shows (S7), the launcher's, the composer's title and a template's
 * name, the view bar's Original and its name. Only what shows (as `read` above), and only elements whose own child text is drawn (the DevTools call
 * reads the text nodes directly under a node).
 */
const TEXTS = `(() => {
	const vw = document.documentElement.clientWidth || innerWidth
	const parentOf = (n) => n.parentElement || (n.parentNode && n.parentNode.host) || null
	const shown = (n) => {
		if (!n || !n.getClientRects || !n.getClientRects().length) return false
		const r = n.getBoundingClientRect()
		if (!(r.width > 0 && r.height > 0 && r.right > 0 && r.bottom > 0 && r.left < vw && r.top < innerHeight)) return false
		if (getComputedStyle(n).visibility === 'hidden') return false
		let op = 1
		for (let p = n; p; p = parentOf(p)) {
			const s = getComputedStyle(p)
			if (p.hidden || s.display === 'none') return false
			op *= Number(s.opacity)
		}
		return op > 0.05
	}
	const out = []
	const add = (what, el) => {
		if (!el || !shown(el)) return
		const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
		const seen = new Set()
		for (let t = walk.nextNode(); t; t = walk.nextNode()) {
			const text = (t.textContent || '').trim().replace(/\\s+/g, ' ')
			const p = t.parentElement
			if (!text || !p || seen.has(p) || !shown(p)) continue
			seen.add(p)
			out.push([what, text.slice(0, 40), p])
		}
	}
	for (const c of [...document.querySelectorAll('.pocket-chips .pocket-cta')].filter(shown).slice(0, 2)) add('a chip', c)
	add('the liner', [...document.querySelectorAll('.pocket-chips .pocket-liner')].find(shown) || null)
	const album = document.getElementById('pocket-output')
	if (album && !album.hidden) {
		add("the album's title", album.querySelector('#pocket-title'))
		add("the album's Back", album.querySelector('.pocket-view__start > .pocket-back:not(.pocket-journey-cta)'))
		add('a sticker title', [...album.querySelectorAll('.pocket-sticker__title')].find(shown) || null)
	}
	const jl = document.querySelector('#pocket-journey-layer:not([hidden])')
	if (jl) add("the journey's header", jl.querySelector('.pocket-journey-layer__top'))
	// S7 (phase 4c): Reimagine's words while its composer or a view shows (the launcher's too then).
	const composer = document.querySelector('.aixc-composer:not([hidden])')
	if (composer || document.body.dataset.aixcView === 'reimagined') {
		add('the launcher', document.querySelector('.aixc-launcher'))
		add("the composer's title", composer && composer.querySelector('.aixc-composer__title'))
		add('a template', composer && composer.querySelector('.aixc-template__name'))
		add("the view bar's Original", document.querySelector('.aixc-viewbar .aixc-seg'))
		add("the view bar's name", document.querySelector('.aixc-viewbar__meta'))
	}
	return out
})()`

/**
 * The fonts Chrome drew our visible words in (rule h), over the DevTools protocol (nothing is put in the
 * page): DOM.requestNode for each element of TEXTS, then CSS.getPlatformFontsForNode. A browser that has
 * no DevTools session (not Chromium) gives `fontsSkipped` and no fonts.
 */
export async function fontsOf(page: Page): Promise<{ fonts: FontUse[]; fontsSkipped: string | null }> {
	let s: CDPSession
	try {
		s = await page.context().newCDPSession(page)
	} catch (e) {
		return { fonts: [], fontsSkipped: `no DevTools session (${(e as Error).message.split('\n')[0]})` }
	}
	const group = 'vg-floating-fonts'
	try {
		await s.send('DOM.enable')
		await s.send('CSS.enable')
		await s.send('DOM.getDocument', { depth: 0 })
		const list = await s.send('Runtime.evaluate', { expression: TEXTS, objectGroup: group })
		if (!list.result.objectId) return { fonts: [], fontsSkipped: `our words could not be listed (${list.exceptionDetails?.text ?? list.result.type})` }
		const meta = await s.send('Runtime.callFunctionOn', { objectId: list.result.objectId, functionDeclaration: 'function () { return this.map((x) => [x[0], x[1]]) }', returnByValue: true, objectGroup: group })
		const els = await s.send('Runtime.callFunctionOn', { objectId: list.result.objectId, functionDeclaration: 'function () { return this.map((x) => x[2]) }', objectGroup: group })
		const props = els.result.objectId ? (await s.send('Runtime.getProperties', { objectId: els.result.objectId, ownProperties: true })).result : []
		const named = meta.result.value as [string, string][]
		const fonts: FontUse[] = []
		for (const p of props) {
			if (!/^\d+$/.test(p.name) || !p.value?.objectId) continue
			const [what, text] = named[Number(p.name)]
			const { nodeId } = await s.send('DOM.requestNode', { objectId: p.value.objectId })
			const used = await s.send('CSS.getPlatformFontsForNode', { nodeId })
			fonts.push({ what, text, fonts: used.fonts.map((f) => ({ familyName: f.familyName, postScriptName: f.postScriptName, isCustomFont: f.isCustomFont, glyphCount: f.glyphCount })) })
		}
		return { fonts, fontsSkipped: null }
	} catch (e) {
		return { fonts: [], fontsSkipped: `the fonts could not be read (${(e as Error).message.split('\n')[0]})` }
	} finally {
		await s.send('Runtime.releaseObjectGroup', { objectGroup: group }).catch(() => {})
		await s.detach().catch(() => {})
	}
}

/** Reads every floating control in the page's current state, and the fonts of our words. */
export async function measureControls(page: Page, at: string): Promise<Measure> {
	const read = (await page.evaluate(READ)) as Omit<Measure, 'at' | 'fonts' | 'fontsSkipped'>
	// The layout viewport (and the page's scroll lock) with the button: a ?aixc=off reading's button carries the viewport it was laid out in.
	const layout = await readLayout(page).catch(() => null)
	if (read.button && layout) read.button.viewport = { clientWidth: layout.clientWidth, innerWidth: layout.innerWidth, gutter: layout.gutter }
	return { at, ...read, layout, ...(await fontsOf(page)) }
}

/** Whether a convex polygon and a box share any area (the separating axis test; touching is not sharing). */
export function polyOverlaps(poly: [number, number][], b: Box): boolean {
	if (poly.length < 3) return false
	const rect: [number, number][] = [
		[b.left, b.top],
		[b.right, b.top],
		[b.right, b.bottom],
		[b.left, b.bottom],
	]
	const axes: [number, number][] = [
		[1, 0],
		[0, 1],
	]
	for (let i = 0; i < poly.length; i++) {
		const [x1, y1] = poly[i]
		const [x2, y2] = poly[(i + 1) % poly.length]
		if (x1 !== x2 || y1 !== y2) axes.push([y1 - y2, x2 - x1])
	}
	for (const [ax, ay] of axes) {
		const p = poly.map(([x, y]) => x * ax + y * ay)
		const r = rect.map(([x, y]) => x * ax + y * ay)
		const eps = 1e-6 * Math.hypot(ax, ay)
		if (Math.max(...p) <= Math.min(...r) + eps || Math.max(...r) <= Math.min(...p) + eps) return false
	}
	return true
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
 * 'reimagine', 'tips'), Reimagine's view bar and composer ('viewbar', 'composer': named in phase 4a, ADR-0076; matrix
 * controls since phase 4c, B2), an open preview's close ('preview', phase 4c), 'ours:<tag.class>' for anything else of ours (the album, a chip, the mascot), or
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
			for (const [n, sel] of [['pocket', '.pocket-peek'], ['reimagine', '.aixc-launcher'], ['viewbar', '.aixc-viewbar'], ['composer', '.aixc-composer'], ['preview', '.aixc-box dialog[open] :is(.cv-dialog__close, .st-modal__close)'], ['tips', '.tips-entry']]) if (el.closest(sel)) return n
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
	{ pair: ['watch', 'pocket'], why: "the watch's changed count sits on the Pocket button by design (ADR-0078 Decision 8)" },
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
 * The rules of the matrix (S16; the brief's a to g, and h: our words in Vodafone's faces), for one
 * measured cell. Returns every violation as a sentence with the numbers; an empty list means the cell
 * passes.
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
	// What the curl paints (the peeking corner, a page turning, a sticker in flight) must not lie over a fixed
	// control. The Pocket button is the exception by design: it sits in the corner the page peeks from.
	for (const c of m.curl)
		if (c?.shown && c.box)
			for (const [n, cb] of shown) {
				if (n === 'banner' || n === 'pocket') continue
				// The watch's count rides on the Pocket button, in the same corner (ADR-0078 Decision 8): the button's z-index 9 is above the curl's layers (6 and 8).
				if (n === 'watch') continue
				if (c.polys.length ? c.polys.some((p) => polyOverlaps(p, cb.box)) : overlaps(c.box, cb.box)) v.push(`${w}: (a) the curl's painted part (${c.what}) ${fmt(c.box)} over ${n} ${fmt(cb.box)}`)
			}
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
		// The watch's count is part of the Pocket button (ADR-0078 Decision 8): a press at it reaches the button, which opens the Pocket.
		if (n === 'watch') {
			for (const h of hits) if (!ok(h) && h.at !== 'pocket') v.push(`${w}: (c) a press at ${n}'s point (${h.x},${h.y}) reaches ${h.at}`)
			continue
		}
		for (const h of hits) if (!ok(h)) v.push(`${w}: (c) a press at ${n}'s point (${h.x},${h.y}) reaches ${h.at}`)
	}
	for (const a of m.aboveBanner) v.push(`${w}: (c) ${a.what} has z-index ${a.z}, at or above OneTrust's ${OT_Z}`)
	for (const [n, c] of shown) if (c.owner !== 'vodafone' && c.stackZ >= OT_Z) v.push(`${w}: (c) ${n} stacks at ${c.stackZ}, at or above OneTrust's ${OT_Z}`)
	// (d) The accessibility button as with ?aixc=off. One correction only: with Vodafone's menu open and its own rule
	// locking the page's scroll (vodafoneScrollLock), the layout viewport is wider by the scrollbar that went, and the
	// insets of the side the button follows (left and the inline one on that side, all of them, by exactly that much)
	// and, when that is the left, its box's left move with it. Its size, top, style attribute and every other
	// computed property stay exact; a change of the viewport that is not Vodafone's lock is said with the violation.
	if (ctx.off && m.button) {
		const off = ctx.off
		const now = m.button
		const lock = vodafoneScrollLock(m.layout, off.viewport)
		const rtl = m.view.dir === 'rtl'
		const px = (s: string | undefined) => (s && /^-?\d+(\.\d+)?px$/.test(s) ? Number.parseFloat(s) : Number.NaN)
		const follows = (k: string) => Math.abs(px(now.style[k]) - px(off.style[k]) - lock.dx) < 0.05
		const side = lock.dx ? [['left', rtl ? 'inset-inline-end' : 'inset-inline-start'], ['right', rtl ? 'inset-inline-start' : 'inset-inline-end']].find((g) => g.every(follows)) : undefined
		const box = side?.[0] === 'left' ? [Math.round((off.box[0] + lock.dx) * 10) / 10, ...off.box.slice(1)] : off.box
		const moved = side ? `, moved ${lock.dx} px with the layout viewport` : ''
		const why = lock.why ? ` (${lock.why})` : ''
		if (JSON.stringify(box) !== JSON.stringify(now.box)) v.push(`${w}: (d) the accessibility button's box ${JSON.stringify(now.box)} is not ${JSON.stringify(box)} (?aixc=off${moved})${why}`)
		if (off.attr !== now.attr) v.push(`${w}: (d) its style attribute ${JSON.stringify(now.attr)} is not ${JSON.stringify(off.attr)}`)
		const differ = Object.keys(off.style).filter((k) => off.style[k] !== now.style[k] && !side?.includes(k))
		if (differ.length) v.push(`${w}: (d) its computed ${differ.map((k) => `${k}: ${off.style[k]} -> ${now.style[k]}`).join('; ')}${why}`)
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
		// The drone is out in the album at 640 px and wider (none under 640 px by design), the album at rest and
		// the journey closed (an open journey hides the actors' layer by design: pocket-actors.css). Scrolled off
		// the screen it is there, so that is not this violation. While the trail's card is open over the album the
		// drone makes room for it (ADR-0075, F6b): hidden when no place is free, so that is not this violation either.
		const d = m.droneState
		if (m.view.width >= 640 && !m.state.busy && !m.state.journey && !m.controls.card?.shown && !m.drone && d?.why !== 'off the screen') v.push(`${w}: (f) the drone did not show in the album (${d ? `${d.why ?? 'not shown'}; state ${d.state ?? 'none'}` : 'there is no drone on the page'})`)
	}
	// (h) Our words in Vodafone's faces: every font Chrome drew them in is a web font, never a system font.
	for (const f of m.fonts ?? []) for (const font of f.fonts) if (!font.isCustomFont) v.push(`${w}: (h) our text drawn in a system font: ${f.what} "${f.text}" ${font.familyName}`)
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

/* The matrix's own steps (moved here as they were from ./floating-controls-live.e2e.test.ts, so the page watch's
 * cells (./watch-floating.e2e.test.ts) press, pocket and wait as the matrix does). */

/**
 * The microphone, stood in at the edge (AGENTS.md 5.3; the kit has no fake capture device): getUserMedia
 * answers with a silent stream from Web Audio, so pressing the guide's mic reaches 'listening' with the
 * kit's speech stub, as a person's would with a real microphone.
 */
export const MIC_STAND_IN = `(() => {
	if (!navigator.mediaDevices) return
	navigator.mediaDevices.getUserMedia = async () => {
		const ctx = new AudioContext()
		const osc = ctx.createOscillator()
		const gain = ctx.createGain()
		gain.gain.value = 0
		const dest = ctx.createMediaStreamDestination()
		osc.connect(gain).connect(dest)
		osc.start()
		return dest.stream
	}
})()`

/** Seeded randomness and no dozing while the matrix looks (pocket-actors.js reads it once at start-up). */
export const ACTORS_TEST = `window.__POCKET_ACTORS_TEST__ = { seed: 7, timing: { sleepAt: 600000 } }`

export const settle = (page: Page, ms = 60) => page.evaluate((ms) => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(done, ms)))), ms)

export type Press = 'mouse' | 'click()'

/** A press as a person makes it (the mouse at the element's middle), or element.click() where the banner's filter blocks the mouse. */
export async function press(page: Page, how: Press, find: string) {
	if (how === 'mouse') {
		const at = await page.evaluate((find) => {
			const el = eval(find) as HTMLElement | null
			if (!el) return null
			const r = el.getBoundingClientRect()
			return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
		}, find)
		assert.ok(at, `there is something to press (${find})`)
		await page.mouse.click(at.x, at.y)
	} else {
		const ok = await page.evaluate((find) => {
			const el = eval(find) as HTMLElement | null
			el?.click()
			return !!el
		}, find)
		assert.ok(ok, `there is something to press (${find})`)
	}
}

/** Brings the first chipped card into view and pockets it with a press at its chip. */
export async function pocketOne(page: Page, how: Press, covered: string[]) {
	const found = await page.evaluate(async (needHit) => {
		const skipped: string[] = []
		for (const chip of document.querySelectorAll<HTMLElement>('.pocket-chips .pocket-cta[data-pocket-for]')) {
			const id = chip.dataset.pocketFor!
			const card = [...document.querySelectorAll<HTMLElement>(`#main-content [data-aixc-item="${CSS.escape(id)}"]`)].find((c) => !c.closest('.owl-item.cloned'))
			if (!card) continue
			card.scrollIntoView({ block: 'center', inline: 'nearest' })
			await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(done, 80))))
			const r = chip.getBoundingClientRect()
			if (!r.width || !r.height) continue
			if (!needHit) return { id, skipped }
			// A press must reach the chip: one under a fixed control (the pill, the mic) is passed over, and said.
			let hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
			if (hit === chip || chip.contains(hit)) return { id, skipped }
			while (hit && hit.shadowRoot) {
				const inner = hit.shadowRoot.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
				if (!inner || inner === hit) break
				hit = inner
			}
			skipped.push(`${id} [${[r.left, r.top, r.right, r.bottom].map(Math.round).join(',')}] under ${hit ? hit.localName + '.' + String(hit.getAttribute('class') || '').split(' ')[0] : 'nothing'}`)
		}
		return { id: null, skipped }
	}, how === 'mouse')
	covered.push(...found.skipped)
	const id = found.id
	assert.ok(id, `a chip on a card a press reaches (${found.skipped.join('; ')})`)
	const chip = `document.querySelector('.pocket-chips .pocket-cta[data-pocket-for="${CSS_ESCAPE(id)}"]')`
	const box = await page.evaluate((chip) => {
		const r = (eval(chip) as HTMLElement).getBoundingClientRect()
		return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }
	}, chip)
	const reach = await hitsAt(page, points(box).slice(0, 1))
	await press(page, how, chip)
	await page.waitForFunction((id) => (window as any).__aixc.demos.pocket.store.all().some((r: any) => r.id === id), id, { timeout: 5_000 }).catch((e) => {
		throw new Error(`${id} was not pocketed by ${how} at ${JSON.stringify(box)} (a press there reaches ${reach[0].at}): ${(e as Error).message}`)
	})
	await page.waitForSelector('.pocket-peek[data-state="shown"]', { timeout: 5_000 })
	await page.waitForFunction(() => document.querySelectorAll('.curl-host--flying').length === 0, null, { timeout: 8_000 })
	await page.waitForFunction(() => ['hidden', null, undefined].includes(document.querySelector<HTMLElement>('.pocket-mascot')?.dataset.mascotState as any), null, { timeout: 8_000 }).catch(() => {})
	await settle(page, 900)
}
const CSS_ESCAPE = (s: string) => s.replace(/["\\]/g, '\\$&')

const waitView = (page: Page, view: 'page' | 'pocket') =>
	page.waitForFunction(
		(view) => {
			const s = (window as any).__aixc.demos.pocket.state
			return s.view === view && !s.busy
		},
		view,
		{ timeout: 10_000 },
	)

/** The album at rest: the mascot standing (or tucked), the drone up (none under 640 px). */
export async function albumAtRest(page: Page) {
	await waitView(page, 'pocket')
	await page.waitForFunction(() => ['idle', 'tucked', 'flinching'].includes(document.querySelector<HTMLElement>('.pocket-mascot')?.dataset.mascotState ?? ''), null, { timeout: 10_000 })
	await page.waitForFunction(() => {
		const d = document.querySelector<HTMLElement>('.pocket-drone')
		return !d || d.hidden || ['home-hover', 'curious', 'following'].includes(d.dataset.droneState ?? '')
	}, null, { timeout: 10_000 })
	await settle(page, 1200)
}

/* ------------------------------------------------------------------ S7: Reimagine's view (phase 4c) */

/** px kept around each corner's controls: experiences/src/host/demos/reimagine/box.js SAFE. */
export const SAFE = 16
/** The gate, as experiences/src/host/demos/reimagine.js GATE: coverage at least 0.9, two sections of three or more items. */
export const GATE = { coverage: 0.9, sections: 2, items: 3 } as const

export interface Zone {
	w: number
	h: number
}

/** A corner as a person meets it: its shown controls, their union grown by SAFE px, and that box's size. */
export interface Corner {
	box: Box
	w: number
	h: number
	controls: string[]
}

/** Reimagine's view as S7 reads it (ADR-0076 §1, §2, §3, §7). Nothing here changes the page. */
export interface ViewReading {
	/** body[data-aixc-view]: 'reimagined' while a view shows, 'original' after one, null before the shell. */
	view: string | null
	/** The shell's state (with ?aixc-debug): the template shown. */
	template: string | null
	composerOpen: boolean
	/** Where the composer went (box.js: 'below' or 'beside'), while it shows. */
	placement: string | null
	/** The box's scrolling area on the screen while a view shows (its own scrollbar not part of it), its scroll, the window's. */
	box: Box | null
	boxScroll: number | null
	scrollY: number
	/** The bottom corners, a view or not: bottom-right Vodafone's accessibility button and the guide's mic (keyboard button and bar while they show), bottom-left the Pocket's button. */
	corners: { right: Corner | null; left: Corner | null }
	/** While a view shows: how far each corner's controls reach into the box, measured here by box.js's own rule. */
	zones: { right: Zone & { controls: string[] }; left: Zone & { controls: string[] } } | null
	/** While a view shows: what the shell wrote on the box (--aixc-safe-right-w/-h, --aixc-safe-left-w/-h). */
	boxZones: { right: Zone; left: Zone } | null
	/**
	 * An open preview of ours (canvas's .cv-dialog, streaming's .st-modal), and the box's room under its bar. While it is
	 * open the rest of the view is inert by design (ADR-0076 §7; the owner's decision of 2026-11-21): `barInert` whether
	 * the view bar is, `usable` what of the box outside the preview could still take a press or the focus (its
	 * focusables on the screen, not inert: none by design), `focusInside` whether the focus is in the preview.
	 */
	preview: { which: string; open: boolean; modal: boolean; anyModal: boolean; popover: number; ariaModal: string | null; inBox: boolean; position: string; rect: Box | null; room: Box | null; barInert: boolean | null; usable: string[]; focusInside: boolean } | null
	/** Vodafone's open menu: whether its theme marks one open, and the boxes of what of it shows on the screen. */
	menu: { open: boolean; marked: string[]; boxes: { what: string; box: Box }[] }
}

/**
 * Vodafone's header (#header) by class: its two navigations, the switcher's and the main one. The launcher's hide rule
 * reads `#header`; live-page selectors here are by class only, and these two are all #header holds.
 */
const HEADER = ':is(.nav-switcher, .nav-header)'
/**
 * Vodafone's menus as its theme marks them open, at every width: the launcher's own hide rule
 * (experiences/src/host/demos/reimagine.js), by class. An open dialog (body.modal-open, .modal.show); in the header an
 * expanded control, a shown part (.show), the phone menu (.nav-opened, on the navigation itself or inside it), a checked
 * menu flag, the burger's checked checkbox (.checker), the login card. tests/unit/floating-s7-rules.test.ts holds the
 * two to the same marks.
 */
export const MENU_MARKS = ['body.modal-open', '.modal.show', '.nav-header.nav-opened', ...['[aria-expanded="true"]', '.show', '.nav-opened', '.nav-flag:checked', '.checker:checked', '.active .nav-startup'].map((s) => `${HEADER} ${s}`)]
/** From 992 px only (the rule's media query): a hovered dropdown of the wide navigation. */
export const MENU_MARKS_WIDE = [`${HEADER} li:hover > .nav-step-two:not(.d-lg-none)`]
/** In the page: the marks that hold now, each on a node of Vodafone's (never one of ours). */
export const MENU_MARKED = `((marks, wide) => marks.concat(matchMedia('(min-width: 992px)').matches ? wide : []).filter((sel) => [...document.querySelectorAll(sel)].some((n) => !n.closest('[data-aixc], [data-vg]'))))(${JSON.stringify(MENU_MARKS)}, ${JSON.stringify(MENU_MARKS_WIDE)})`
/** In the page (page.waitForFunction): Vodafone's menu open, and closed. */
export const MENU_OPEN = `${MENU_MARKED}.length > 0`
export const MENU_CLOSED = `${MENU_MARKED}.length === 0`

/**
 * In the page: the layout viewport and the page's scroll lock (LayoutReading). A sheet is ours when its node carries
 * one of our markers (the layer's <style data-aixc>, the world's and the tips' links, a kit stand-in's style) or it
 * comes from our gateway's /__vg/; a rule is Vodafone's when its sheet is not ours, comes from the page's own origin
 * (or is a <style> in the page) and its selector names nothing of ours.
 */
const READ_LAYOUT = `(() => {
	const OURS = '[data-aixc], [data-vg], [data-pz-world], [data-tips], [data-stand-in]'
	const html = document.documentElement
	const body = document.body
	const hs = getComputedStyle(html)
	const viewportOfBody = !!body && hs.overflowX === 'visible' && hs.overflowY === 'visible'
	const scroller = viewportOfBody ? body : html
	const sc = getComputedStyle(scroller)
	const hides = (v) => v === 'hidden' || v === 'clip'
	const rules = []
	const oursUnread = []
	const sheetName = (s) => s.href || (s.ownerNode ? '<' + s.ownerNode.localName + [...s.ownerNode.attributes].map((a) => ' ' + a.name).join('') + '>' : '(constructed)')
	const ours = (s) => !!(s.ownerNode && s.ownerNode.closest && s.ownerNode.closest(OURS)) || /\\/__vg\\//.test(s.href || '')
	const vodafone = (s) => !ours(s) && (s.href ? new URL(s.href, location.href).origin === location.origin : !!(s.ownerNode && s.ownerNode.localName === 'style'))
	const walk = (list, s) => {
		for (const r of list) {
			if (r.media && !matchMedia(r.media.mediaText || 'all').matches) continue
			if (r.conditionText !== undefined && !r.media && typeof CSS !== 'undefined' && !CSS.supports(r.conditionText)) continue
			if (r.styleSheet) sheet(r.styleSheet)
			else if (r.selectorText !== undefined && r.style) {
				const v = r.style.getPropertyValue('overflow-y') || r.style.getPropertyValue('overflow')
				let hit = false
				try { hit = scroller.matches(r.selectorText) } catch {}
				if (hit && /\\b(hidden|clip)\\b/.test(v)) rules.push({ selector: r.selectorText, sheet: sheetName(s), vodafone: vodafone(s) && !/aixc|\\bvg-|pocket|data-stand-in/i.test(r.selectorText) })
			} else if (r.cssRules) walk(r.cssRules, s)
		}
	}
	const sheet = (s) => {
		if (s.disabled) return
		let list = null
		try { list = s.cssRules } catch {}
		if (list) walk(list, s)
		else if (ours(s)) oursUnread.push(sheetName(s))
	}
	// A constructed sheet (adopted) has no node and no address: never Vodafone's.
	for (const s of [...document.styleSheets, ...(document.adoptedStyleSheets || [])]) sheet(s)
	const inline = scroller.style.getPropertyValue('overflow-y') || scroller.style.getPropertyValue('overflow')
	return {
		clientWidth: html.clientWidth,
		innerWidth,
		gutter: hs.scrollbarGutter || 'auto',
		scroller: viewportOfBody ? 'body' : 'html',
		overflowY: sc.overflowY,
		inlineOverflow: inline || null,
		rules: hides(sc.overflowY) ? rules : [],
		oursUnread,
		classes: { html: String(html.className).slice(0, 200), body: body ? String(body.className).slice(0, 200) : '' },
		menu: ${MENU_MARKED},
	}
})()`

/** In-page reading of the layout viewport and the page's scroll lock (rule d). */
export const readLayout = (page: Page) => page.evaluate(READ_LAYOUT) as Promise<LayoutReading>

/** Whether a computed overflow hides (the page does not scroll). */
const hides = (v: string) => v === 'hidden' || v === 'clip'

/**
 * Rule (d)'s one correction (phase 4c, the live walk of 2026-11-22): Vodafone's phone menu, open, locks the page's
 * scroll by its own rule; the page's classic scrollbar goes, the layout viewport widens by its width, and Vodafone's
 * fixed button follows the viewport's edge it is placed from. The ?aixc=off baseline (menu closed, scrollbar there)
 * is then moved by that change, and only when every one of these holds: both readings of the same window (its
 * innerWidth) with html's scrollbar-gutter auto (clientWidth is then the width fixed elements get); the scrollbar
 * there at the baseline and gone now, the viewport wider by exactly its width; Vodafone's menu marked open (its own
 * marks, never on a node of ours); the viewport's overflow-y hidden, no style attribute setting it, at least one rule
 * hiding it and every such rule Vodafone's (none of ours, no sheet of ours unread). Returns the change (`dx`, px)
 * when it holds, else 0 and why not (null when the viewport did not change).
 */
export function vodafoneScrollLock(layout: LayoutReading | null | undefined, off: LayoutViewport | undefined): { dx: number; why: string | null } {
	if (!layout || !off) return { dx: 0, why: layout || off ? 'the layout viewport was not read with ?aixc=off and now' : null }
	const dx = layout.clientWidth - off.clientWidth
	if (dx === 0) return { dx: 0, why: null }
	const no = (why: string) => ({ dx: 0, why: `the layout viewport is ${dx} px ${dx > 0 ? 'wider' : 'narrower'} than with ?aixc=off (clientWidth ${off.clientWidth} -> ${layout.clientWidth}), but ${why}` })
	if (layout.innerWidth !== off.innerWidth) return no(`the window is not the same (innerWidth ${off.innerWidth} -> ${layout.innerWidth})`)
	if (off.gutter !== 'auto' || layout.gutter !== 'auto') return no(`html's scrollbar-gutter is not auto (${off.gutter} -> ${layout.gutter})`)
	const before = off.innerWidth - off.clientWidth
	const now = layout.innerWidth - layout.clientWidth
	if (!(before > 0 && now === 0 && dx === before)) return no(`not by the page's scrollbar going (${before} px with ?aixc=off, ${now} px now)`)
	if (!layout.menu.length) return no("Vodafone's menu is not marked open")
	if (!hides(layout.overflowY)) return no(`the page's overflow-y is ${layout.overflowY}, not hidden`)
	if (layout.inlineOverflow) return no(`the ${layout.scroller}'s style attribute sets its overflow (${layout.inlineOverflow}): not a rule of Vodafone's`)
	if (layout.oursUnread.length) return no(`a stylesheet of ours could not be read (${layout.oursUnread.join(', ')})`)
	if (!layout.rules.length) return no(`no stylesheet rule hides the ${layout.scroller}'s overflow`)
	const notVodafone = layout.rules.filter((r) => !r.vodafone)
	if (notVodafone.length) return no(`a rule not Vodafone's hides it (${notVodafone.map((r) => `${r.selector} in ${r.sheet}`).join('; ')})`)
	return { dx, why: null }
}

/* The in-page reader of S7, one string like READ. Vodafone's menus as its theme marks them open (MENU_MARKED, the
 * launcher's own hide rule, experiences/src/host/demos/reimagine.js), by class. */
const READ_VIEW = `(() => {
	const SAFE = ${SAFE}
	const r2 = (v) => Math.round(v * 10) / 10
	const bx = (r) => ({ left: r2(r.left), top: r2(r.top), right: r2(r.right), bottom: r2(r.bottom) })
	const vw = document.documentElement.clientWidth || innerWidth
	const onScreen = (b) => b.right > 0 && b.bottom > 0 && b.left < vw && b.top < innerHeight
	// As box.js's shown(): a box, not hidden, not faded out; the Pocket's button not in its hidden state.
	const shown = (node) => {
		if (!node || !node.isConnected || !node.getClientRects().length) return null
		const r = node.getBoundingClientRect()
		if (!(r.width > 0 && r.height > 0)) return null
		const s = getComputedStyle(node)
		if (s.visibility === 'hidden' || Number(s.opacity) <= 0.05) return null
		if (node.matches('.pocket-peek') && node.dataset.state === 'hidden') return null
		return r
	}
	const vg = document.querySelector('vg-guide')
	const root = vg && vg.shadowRoot
	const rq = (sel) => (root ? root.querySelector(sel) : null)
	const named = (list) => list.map(([n, el]) => [n, shown(el)]).filter(([, r]) => !!r)
	const right = named([['accessibility', document.getElementById('vodafone-aw-icon')], ['mic', rq('.vg-mic')], ['kbd', rq('.vg-kbd')], ['bar', rq('.vg-bar')]])
	const left = named([['pocket', document.querySelector('.pocket-peek')]])
	const corner = (list) => {
		if (!list.length) return null
		const b = { left: Math.min(...list.map(([, r]) => r.left)) - SAFE, top: Math.min(...list.map(([, r]) => r.top)) - SAFE, right: Math.max(...list.map(([, r]) => r.right)) + SAFE, bottom: Math.max(...list.map(([, r]) => r.bottom)) + SAFE }
		return { box: bx(b), w: r2(b.right - b.left), h: r2(b.bottom - b.top), controls: list.map(([n]) => n) }
	}
	const boxNode = document.querySelector('.aixc-box')
	const boxShows = !!boxNode && !boxNode.hidden && boxNode.getClientRects().length > 0 && document.body.dataset.aixcView === 'reimagined'
	let area = null
	let zones = null
	let boxZones = null
	let room = null
	if (boxShows) {
		const b = boxNode.getBoundingClientRect()
		area = { left: b.left + boxNode.clientLeft, top: b.top + boxNode.clientTop }
		area.right = area.left + boxNode.clientWidth
		area.bottom = area.top + boxNode.clientHeight
		// box.js's rule: a control reaches the box when its box grown by SAFE meets the box's area.
		const reaches = (r) => r.left - SAFE < area.right && r.right + SAFE > area.left && r.top - SAFE < area.bottom && r.bottom + SAFE > area.top
		const zone = (list, side) => {
			let w = 0
			let h = 0
			const controls = []
			for (const [n, r] of list) {
				if (!reaches(r)) continue
				controls.push(n)
				w = Math.max(w, side === 'right' ? area.right - (r.left - SAFE) : r.right + SAFE - area.left)
				h = Math.max(h, area.bottom - (r.top - SAFE))
			}
			return { w: r2(Math.min(w, area.right - area.left)), h: r2(Math.min(h, area.bottom - area.top)), controls }
		}
		zones = { right: zone(right, 'right'), left: zone(left, 'left') }
		const px = (name) => parseFloat(boxNode.style.getPropertyValue(name)) || 0
		boxZones = { right: { w: px('--aixc-safe-right-w'), h: px('--aixc-safe-right-h') }, left: { w: px('--aixc-safe-left-w'), h: px('--aixc-safe-left-h') } }
		const bar = boxNode.querySelector('.aixc-viewbar')
		room = { left: area.left, top: area.top + (bar && !bar.hidden && bar.parentNode === boxNode ? bar.offsetHeight : 0), right: area.right, bottom: area.bottom }
	}
	let preview = null
	const dialog = [...document.querySelectorAll('#experience-output dialog, .aixc-box dialog')].find((d) => d.open)
	if (dialog) {
		let modal = false
		let anyModal = false
		let popover = 0
		try {
			modal = dialog.matches(':modal')
			anyModal = !!document.querySelector(':modal')
		} catch (e) {}
		try {
			popover = document.querySelectorAll(':popover-open').length
		} catch (e) {}
		const r = dialog.getBoundingClientRect()
		const which = dialog.classList.contains('cv-dialog') ? 'canvas' : dialog.classList.contains('st-modal') ? 'streaming' : String(dialog.getAttribute('class') || 'dialog')
		// The rest of the view while it is open (view-dialog.js: the box's other content inert).
		const inertOf = (n) => !!n.closest('[inert]')
		const viewbar = boxNode ? boxNode.querySelector('.aixc-viewbar') : null
		const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable]:not([contenteditable="false"]), summary, audio[controls], video[controls]'
		const usable = boxNode ? [...boxNode.querySelectorAll(FOCUSABLE)].filter((n) => !dialog.contains(n) && n.getClientRects().length && !inertOf(n) && getComputedStyle(n).visibility !== 'hidden').map((n) => n.localName + String(n.getAttribute('class') || '').trim().split(/\\s+/).filter(Boolean).slice(0, 2).map((c) => '.' + c).join('')) : []
		const at = document.activeElement
		preview = { which, open: dialog.open, modal, anyModal, popover, ariaModal: dialog.getAttribute('aria-modal'), inBox: !!boxNode && boxNode.contains(dialog), position: getComputedStyle(dialog).position, rect: r.width && r.height ? bx(r) : null, room: room ? bx(room) : null, barInert: viewbar ? inertOf(viewbar) : null, usable: [...new Set(usable)], focusInside: !!at && dialog.contains(at) }
	}
	const parentOf = (n) => n.parentElement || (n.parentNode && n.parentNode.host) || null
	const visible = (n) => {
		const r = n.getBoundingClientRect()
		if (!(r.width > 0 && r.height > 0) || !onScreen(r)) return null
		let op = 1
		for (let p = n; p; p = parentOf(p)) {
			const s = getComputedStyle(p)
			if (p.hidden || s.display === 'none') return null
			op *= Number(s.opacity)
		}
		if (getComputedStyle(n).visibility === 'hidden' || op <= 0.05) return null
		return r
	}
	const nameOf = (n) => n.localName + String(n.getAttribute('class') || '').trim().split(/\\s+/).filter(Boolean).slice(0, 2).map((c) => '.' + c).join('')
	const marked = ${MENU_MARKED}
	const PARTS = '.nav-header .nav-step-two, .nav-header .nav-startup, .nav-header.nav-opened .nav-step-one, .modal.show .modal-dialog'
	const boxes = []
	for (const n of document.querySelectorAll(PARTS)) {
		if (n.closest('[data-aixc], [data-vg]')) continue
		const r = visible(n)
		if (r) boxes.push({ what: nameOf(n), box: bx({ left: Math.max(0, r.left), top: Math.max(0, r.top), right: Math.min(vw, r.right), bottom: Math.min(innerHeight, r.bottom) }) })
	}
	const s = window.__aixc && window.__aixc.demos && window.__aixc.demos.reimagine && window.__aixc.demos.reimagine.state
	const composer = document.querySelector('.aixc-composer')
	const composerOpen = !!composer && !composer.hidden
	return {
		view: document.body.dataset.aixcView || null,
		template: s ? s.template || null : null,
		composerOpen,
		placement: composerOpen ? composer.dataset.placement || null : null,
		box: area ? bx(area) : null,
		boxScroll: boxShows ? Math.round(boxNode.scrollTop) : null,
		scrollY: Math.round(scrollY),
		corners: { right: corner(right), left: corner(left) },
		zones,
		boxZones,
		preview,
		menu: { open: marked.length > 0, marked, boxes },
	}
})()`

/** Reimagine's view, its box's zones, an open preview and Vodafone's open menu, as they are now (S7). */
export const readView = (page: Page) => page.evaluate(READ_VIEW) as Promise<ViewReading>

/** The gate on this page (?aixc-debug): what the layer read and what the launcher decided. */
export interface GateReading {
	/** The share of the page read (window.__aixc.coverage) and its counts. */
	coverage: number | null
	cards: number | null
	usable: number | null
	unread: number | null
	/** Items per section of the model. */
	sections: number[]
	/** GATE applied here to that reading. */
	passes: boolean
	/** The launcher's own decision (its debug()), null when its chunk had not started. */
	allowed: boolean | null
	/** The launcher's button: on the page and not hidden, hidden, or not on the page. */
	launcher: 'shown' | 'hidden' | 'absent'
	/** Why the gate does not pass, in numbers, or null. */
	why: string | null
}

/** Reads the gate, after up to `waitMs` for the launcher's chunk (it loads at idle). */
export async function gateOf(page: Page, waitMs = 15_000): Promise<GateReading> {
	await page.waitForFunction(() => !!(window as any).__aixc?.demos?.reimagine?.debug, null, { timeout: waitMs }).catch(() => {})
	const r = await page.evaluate(() => {
		const l = (window as any).__aixc
		const c = l?.coverage ?? null
		const d = l?.demos?.reimagine?.debug?.() ?? null
		const b = document.querySelector<HTMLElement>('.aixc-launcher')
		return {
			coverage: (c?.ratio ?? null) as number | null,
			cards: (c?.cards ?? null) as number | null,
			usable: (c?.usable ?? null) as number | null,
			unread: (c?.unread ?? null) as number | null,
			sections: ((l?.model?.sections ?? []) as any[]).map((s) => (s?.items?.length ?? 0) as number),
			allowed: d ? !!d.allowed : null,
			launcher: (!b ? 'absent' : b.hidden ? 'hidden' : 'shown') as GateReading['launcher'],
		}
	})
	const big = r.sections.filter((n) => n >= GATE.items).length
	const passes = (r.coverage ?? 0) >= GATE.coverage && big >= GATE.sections
	return { ...r, passes, why: passes ? null : `coverage ${r.coverage ?? 'not read'} (the gate needs ${GATE.coverage}), ${big} section(s) of ${GATE.items} or more items (it needs ${GATE.sections}); sections ${JSON.stringify(r.sections)}` }
}

/** The gate's own rule: the launcher decides as the reading says. */
export function gateViolations(where: string, g: GateReading): string[] {
	const v: string[] = []
	if (g.allowed !== null && g.allowed !== g.passes) v.push(`${where}: (gate) the launcher's gate is ${g.allowed ? 'open' : 'closed'}, but the page's reading ${g.passes ? 'passes' : `does not pass (${g.why})`}: coverage ${g.coverage}, sections ${JSON.stringify(g.sections)}`)
	return v
}

/** What a cell of S7 expects. */
export interface ViewExpect {
	view: 'reimagined' | 'original'
	composer: boolean
	preview?: 'canvas' | 'streaming'
	menu?: boolean
	pocket?: boolean
	listening?: boolean
}

/**
 * S7's rules (ADR-0076 §2, §3, §7), for one measured cell, beside rules a to h: the view and the composer as
 * expected; in a view, the view bar's buttons on the screen (with a preview open, the view bar inert instead), no launcher, nothing of the Pocket's curl painted while
 * the album is closed (its resting curl hides in a view), and each corner's zone on the box at least what its controls
 * need now (box.js's rule, measured here; 1 px for its rounding up); a preview open in the box and not modal (no
 * top layer, no popover, no aria-modal, inside the box's room under its bar), and while it is open the rest of the view
 * inert as the owner decided on 2026-11-21 (ADR-0076 §7): the view bar inert (so the composer cannot be opened from it),
 * nothing of the box outside the preview to press or focus, the focus in the preview, and the preview's close on the
 * screen (the 'preview' control, which rules a and c hold); Vodafone's menu open where expected, and
 * the launcher hidden while it is, and a part of it on the screen for menuHits to test. A view that could not be read
 * (`r` null) is a violation: none of these rules ran. Returns the violations, and notes (a zone larger than needed).
 */
export function viewViolations(where: string, r: ViewReading | null, m: Measure, e: ViewExpect): { violations: string[]; notes: string[] } {
	const v: string[] = []
	const notes: string[] = []
	const w = `${where} ${m.at}`
	if (!r) return { violations: [`${w}: (s7) the view could not be read: S7's rules (the view, the zones, the dialogs, the menu) did not run on this cell`], notes }
	const inView = r.view === 'reimagined'
	if (inView !== (e.view === 'reimagined')) v.push(`${w}: (s7) the page shows ${r.view ?? 'no view of ours'}, not ${e.view}`)
	const composer = !!m.controls.composer?.shown
	if (composer !== e.composer) v.push(`${w}: (s7) the composer ${composer ? `shows ${fmt(m.controls.composer?.box)}` : 'does not show'}, ${e.composer ? 'it should be open' : 'it should be closed'}`)
	if (inView) {
		// With a preview open the view bar is inert by design (the preview's rules below hold it).
		if (!e.preview && !m.controls.viewbar?.shown) v.push(`${w}: (s7) the view bar's buttons are not on the screen (${fmt(m.controls.viewbar?.box)})`)
		if (m.controls.reimagine?.shown) v.push(`${w}: (s7) the launcher shows while a view shows ${fmt(m.controls.reimagine.box)}`)
		if (m.state.pocketView === 'page' && !m.state.busy) for (const c of m.curl) if (c?.shown) v.push(`${w}: (s7) the Pocket's curl paints during the view (${c.what} ${fmt(c.box)}): its resting curl hides in a view`)
		if (r.zones && r.boxZones)
			for (const side of ['right', 'left'] as const) {
				const need = r.zones[side]
				const got = r.boxZones[side]
				const who = need.controls.join(', ') || 'none reaches the box'
				if (got.w < need.w - 1 || got.h < need.h - 1) v.push(`${w}: (zones) the box's ${side} zone ${got.w}x${got.h} is smaller than its controls need, ${need.w}x${need.h} (${who})`)
				else if (got.w > need.w + 1 || got.h > need.h + 1) notes.push(`the box's ${side} zone ${got.w}x${got.h} is larger than its controls need now, ${need.w}x${need.h} (${who})`)
			}
		else v.push(`${w}: (zones) the box's zones could not be read`)
	}
	if (e.pocket && !m.controls.pocket?.shown) v.push(`${w}: (s7) the Pocket button does not show`)
	if (e.listening && (m.state.mic !== 'listening' || !m.controls.bar?.shown)) v.push(`${w}: (s7) the guide is not listening with its transcript bar out (${m.state.mic})`)
	const p = r.preview
	if (e.preview) {
		if (!p?.open) v.push(`${w}: (dialog) ${e.preview}'s preview is not open`)
		else {
			if (p.which !== e.preview) v.push(`${w}: (dialog) the open preview is ${p.which}'s, not ${e.preview}'s`)
			if (p.modal || p.anyModal) v.push(`${w}: (dialog) the preview is modal: in the browser's top layer, over Vodafone's accessibility button and banner (ADR-0076 §7)`)
			if (p.popover) v.push(`${w}: (dialog) ${p.popover} popover(s) open in the top layer`)
			if (p.ariaModal !== null) v.push(`${w}: (dialog) the preview has aria-modal=${p.ariaModal}`)
			if (!p.inBox) v.push(`${w}: (dialog) the preview is not inside the box`)
			const a = p.rect
			const b = p.room
			if (a && b && (a.left < b.left - 1.5 || a.top < b.top - 1.5 || a.right > b.right + 1.5 || a.bottom > b.bottom + 1.5)) v.push(`${w}: (dialog) the preview ${fmt(a)} is not inside the box's room under its bar ${fmt(b)}`)
			// The rest of the view while it is open: inert, by design (ADR-0076 §7; the owner's decision of 2026-11-21).
			const bar = m.controls.viewbar
			if (!bar) v.push(`${w}: (dialog) the view bar is not on the page while the preview is open`)
			else if (bar.shown || !bar.inert || p.barInert !== true) v.push(`${w}: (dialog) the view bar is not inert while the preview is open (${bar.shown ? `its buttons can be pressed ${fmt(bar.box)}` : `inert ${bar.inert}, in the box ${p.barInert}`}): the rest of the view cannot be used then`)
			if (p.usable.length) v.push(`${w}: (dialog) with the preview open, the box still has ${p.usable.join(', ')} to press or focus outside it: the rest of the view cannot be used then`)
			if (!p.focusInside) v.push(`${w}: (dialog) the focus is not in the open preview`)
			if (!m.controls.preview?.shown) v.push(`${w}: (dialog) the preview's close is not on the screen (${m.controls.preview ? fmt(m.controls.preview.box) : 'not found'})`)
		}
	} else if (p?.open) v.push(`${w}: (dialog) a preview is open (${p.which})`)
	if (e.menu) {
		if (!r.menu.open) v.push(`${w}: (menu) Vodafone's menu is not open`)
		else if (!r.menu.boxes.length) v.push(`${w}: (menu) Vodafone's menu is marked open (${r.menu.marked.join(', ')}) but no part of it shows on the screen: none of its points could be hit-tested, so the cell checked nothing over it`)
	} else if (r.menu.open) notes.push(`Vodafone's theme marks something of its header open (${r.menu.marked.join(', ')})`)
	if (r.menu.open && m.controls.reimagine?.shown) v.push(`${w}: (menu) the launcher shows while Vodafone's menu is open ${fmt(m.controls.reimagine.box)}`)
	return { violations: v, notes }
}

/**
 * Vodafone's open menu over a view: a press at the points of each shown part of it reaches Vodafone's page (or its
 * accessibility widget), never anything of Reimagine's (the view, its bar, the composer, the launcher) nor anything
 * else of ours in the page. One of the guide's, the trail's or the Pocket's corner controls above it is said in the
 * notes: their z-order is ADR-0050's, ADR-0064's and ADR-0075's, older than the view.
 */
export async function menuHits(page: Page, where: string, r: ViewReading): Promise<{ violations: string[]; notes: string[]; hits: Record<string, Hit[]> }> {
	const v: string[] = []
	const notes: string[] = []
	const hits: Record<string, Hit[]> = {}
	const corner = new Set(['mic', 'kbd', 'bar', 'pill', 'card', 'pocket', 'watch', 'tips'])
	for (const [i, part] of r.menu.boxes.entries()) {
		const h = await hitsAt(page, points(part.box))
		hits[`menu ${i} ${part.what}`] = h
		for (const x of h) {
			if (x.at.startsWith('page:') || x.at === 'accessibility' || x.at === 'banner' || x.at === 'filter' || x.at === 'nothing') continue
			if (corner.has(x.at)) notes.push(`a press at Vodafone's open menu ${part.what} (${x.x},${x.y}) reaches our ${x.at}, a corner control above it`)
			else v.push(`${where}: (menu) a press at Vodafone's open menu ${part.what} ${fmt(part.box)} at (${x.x},${x.y}) reaches ${x.at}`)
		}
	}
	return { violations: v, notes, hits }
}

/**
 * Rule (c)'s hits with Vodafone's menu open: a point of one of our controls that lies in a shown part of the menu and
 * reaches Vodafone's page is the menu over our control, as it should be; it is taken out of rule (c) and said.
 */
export function underMenu(hits: Record<string, Hit[]>, r: ViewReading): { hits: Record<string, Hit[]>; notes: string[] } {
	if (!r.menu.open) return { hits, notes: [] }
	const inside = (h: Hit) => r.menu.boxes.some(({ box: b }) => h.x > b.left && h.x < b.right && h.y > b.top && h.y < b.bottom)
	const out: Record<string, Hit[]> = {}
	const notes: string[] = []
	for (const [n, list] of Object.entries(hits)) {
		if (n === 'accessibility') {
			out[n] = list
			continue
		}
		const kept = list.filter((h) => !(inside(h) && h.at.startsWith('page:')))
		if (kept.length < list.length) notes.push(`${list.length - kept.length} of ${n}'s points lie under Vodafone's open menu (a press there reaches the menu, as it should)`)
		out[n] = kept
	}
	return { hits: out, notes }
}

/** The corners' sizes in words, for the logs: "right 104x170 (accessibility, mic), left none". */
export const cornersLine = (r: ViewReading) =>
	(['right', 'left'] as const)
		.map((side) => {
			const c = r.corners[side]
			const z = r.zones?.[side]
			const b = r.boxZones?.[side]
			return `${side} ${c ? `${Math.round(c.w)}x${Math.round(c.h)} (${c.controls.join(', ')})` : 'none'}${z && b ? `, in the box ${z.w}x${z.h} measured, ${b.w}x${b.h} on the box` : ''}`
		})
		.join('; ')

/** What opens each preview: canvas's card (a button), streaming's card's "More info" (a button in the card). */
export const PREVIEW_OPENERS = {
	canvas: { item: '.aixc-box .cv-card', button: '', close: '.aixc-box .cv-dialog[open] .cv-dialog__close' },
	streaming: { item: '.aixc-box .st-card', button: '.st-card__open', close: '.aixc-box .st-modal[open] .st-modal__close' },
} as const

/**
 * The card whose preview button a press reaches (a hit test at its centre, not inert, on the screen), nearest the
 * box's middle: its item id, or null. With `reveal`, when none is found the view first steps to its middle item with
 * the experience's own reveal() (nothing is pressed for that), then looks again.
 */
export async function reachableOpener(page: Page, which: keyof typeof PREVIEW_OPENERS, reveal = true): Promise<string | null> {
	const look = () =>
		page.evaluate(({ item, button }) => {
			const box = document.querySelector<HTMLElement>('.aixc-box')
			if (!box) return null
			const b = box.getBoundingClientRect()
			const [mx, my] = [(b.left + b.right) / 2, (b.top + b.bottom) / 2]
			const vw = document.documentElement.clientWidth || innerWidth
			const fits = [...box.querySelectorAll<HTMLElement>(item)]
				.map((card) => {
					const el = button ? card.querySelector<HTMLElement>(button) : card
					if (!el || el.localName !== 'button' || el.closest('a[href]')) return null
					const r = el.getBoundingClientRect()
					const [x, y] = [r.left + r.width / 2, r.top + r.height / 2]
					if (!(r.width > 0 && r.height > 0) || x < 0 || y < 0 || x >= vw || y >= innerHeight) return null
					const hit = document.elementFromPoint(x, y)
					return { id: card.dataset.aixcItem ?? '', far: Math.hypot(x - mx, y - my), ok: !el.closest('[inert]') && !!hit && el.contains(hit) }
				})
				.filter((c): c is { id: string; far: number; ok: boolean } => !!c && c.ok && !!c.id)
				.sort((a, c) => a.far - c.far)
			return fits[0]?.id ?? null
		}, PREVIEW_OPENERS[which])
	const first = await look()
	if (first || !reveal) return first
	const stepped = await page.evaluate(() => {
		const items = [...document.querySelectorAll<HTMLElement>('.aixc-box [data-aixc-item]')].map((n) => n.dataset.aixcItem!).filter((id, i, all) => all.indexOf(id) === i)
		const exp = (window as any).__aixc?.demos?.reimagine?.state?.activeExperience
		return items.length && exp?.reveal ? !!exp.reveal(items[Math.floor(items.length / 2)]) : false
	})
	if (!stepped) return null
	await settle(page, 400)
	return look()
}

/**
 * Where to open Vodafone's menu over a view, and how (S7; the only thing of Vodafone's the walks touch, to open its
 * menu, ADR-0076 §3): on a wide screen (992 px and wider, its theme's lg) a hover on the first item of its navigation
 * that has a dropdown (no press); on a narrow one a press on its burger, which is not a link. Each with a hit test at
 * its centre. Read by class; null when there is none on the screen.
 */
export const vodafoneMenuTarget = (page: Page) =>
	page.evaluate(() => {
		const vw = document.documentElement.clientWidth || innerWidth
		const nameOf = (n: Element) => `${n.localName}.${String(n.getAttribute('class') ?? '').split(' ')[0]}`
		const reach = (el: Element) => {
			const r = el.getBoundingClientRect()
			const [x, y] = [r.left + r.width / 2, r.top + r.height / 2]
			if (!(r.width > 0 && r.height > 0) || x < 0 || y < 0 || x >= vw || y >= innerHeight) return null
			const hit = document.elementFromPoint(x, y)
			return { x, y, reached: !!hit && (hit === el || el.contains(hit)), onTop: hit ? nameOf(hit) : 'nothing' }
		}
		const ours = (el: Element) => !!el.closest('[data-aixc], [data-vg], vg-guide')
		if (vw >= 992) {
			for (const li of document.querySelectorAll('.nav-header .nav-step-one > li')) {
				if (!li.querySelector(':scope > .nav-step-two')) continue
				const link = [...li.querySelectorAll(':scope > .nav-item-link')].find((n) => getComputedStyle(n).display !== 'none')
				if (!link || ours(link)) continue
				const at = reach(link)
				if (!at) continue
				return { how: 'hover' as const, what: `Vodafone's menu item "${(link.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 30)}"`, ...at }
			}
			return null
		}
		const burger = document.querySelector('.nav-header .js-burger-toggle')
		if (!burger || ours(burger) || burger.closest('a[href]')) return null
		const at = reach(burger)
		return at ? { how: 'press' as const, what: "Vodafone's phone menu (its burger)", ...at } : null
	})

/** S7's cells by name, the same in the offline matrix and the live walk. */
export const S7 = {
	composer: 'S7 the composer from the launcher',
	view: 'S7 the view, the Pocket peeking',
	listening: 'S7 the view, the guide listening',
	change: 'S7 the composer over the view',
	canvas: "S7 canvas's preview open",
	streaming: "S7 streaming's preview open",
	menu: "S7 Vodafone's menu over the view",
} as const
/** The template S7's view shows first: spotlight pins its stage and has controls in both corners' reach. */
export const S7_TEMPLATE = 'spotlight'

/**
 * A template brought into the composer's own view (the composer scrolls inside itself where it is short, ADR-0076 §3):
 * its scroller scrolled so the template's tile shows whole; nothing else moves. False when there is no such template.
 */
export const templateInView = async (page: Page, template: string) => {
	const ok = await page.evaluate((t) => {
		const b = document.querySelector<HTMLElement>(`.aixc-composer:not([hidden]) .aixc-template[data-template="${t}"]`)
		if (!b) return false
		const scrolls = (n: HTMLElement) => n.scrollHeight > n.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(n).overflowY)
		let sc: HTMLElement | null = b.parentElement
		while (sc && !scrolls(sc) && !sc.matches('.aixc-composer')) sc = sc.parentElement
		if (sc && scrolls(sc)) {
			const r = b.getBoundingClientRect()
			const c = sc.getBoundingClientRect()
			if (r.top < c.top || r.bottom > c.bottom) sc.scrollTop += r.top - c.top - (c.height - r.height) / 2
		}
		return true
	}, template)
	if (ok) await settle(page, 200)
	return ok
}
