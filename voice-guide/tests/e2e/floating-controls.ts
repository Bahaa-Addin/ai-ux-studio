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
	/** The accessibility button as with ?aixc=off: box, style attribute and every computed property. */
	button: { box: number[]; attr: string | null; style: Record<string, string> } | null
	/** The fonts Chrome drew our visible words in (rule h). */
	fonts: FontUse[]
	/** Why the fonts could not be read (then rule (h) does not see them), or null. */
	fontsSkipped: string | null
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
 * a liner, and in the album its title, its Back and a sticker's title, and the journey's header when open.
 * Only what shows (as `read` above), and only elements whose own child text is drawn (the DevTools call
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
	return { at, ...read, ...(await fontsOf(page)) }
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
