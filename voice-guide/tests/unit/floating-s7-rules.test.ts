/**
 * S7's rules on readings made by hand (no browser; phase 4c, ADR-0076): the menu cell checks something or says it
 * could not, a view that could not be read is a violation, and Vodafone's menu is read open exactly when the
 * launcher's own hide rule (experiences/src/host/demos/reimagine.js) hides the launcher, by class only; rule (d)
 * follows the layout viewport only when Vodafone's own menu locks the page's scroll (the live walk of 2026-11-22).
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import vm from 'node:vm'

import { type Box, cellViolations, type Control, type LayoutReading, type Measure, MENU_MARKED, MENU_MARKS, MENU_MARKS_WIDE, MENU_OPEN, type ViewReading, viewViolations } from '../e2e/floating-controls.ts'

const ROOT = path.resolve(import.meta.dirname, '..', '..', '..')

const control = (box: Box, owner: Control['owner'] = 'layer'): Control => ({ owner, box, shown: true, display: 'block', visibility: 'visible', opacity: 1, inert: false, z: '1', stackZ: 1, fixed: true })

/** A measure at 375×812 in spotlight's view: the view bar and the Pocket button shown, nothing else of ours. */
const measure = (): Measure => ({
	at: "S7 Vodafone's menu over the view",
	view: { width: 375, height: 812, scrollY: 0, dir: 'ltr', lang: 'en' },
	state: { pocketView: 'page', busy: false, journey: false, mic: 'idle', listening: false, consent: null, mascot: null, covered: false },
	controls: { accessibility: control({ left: 300, top: 740, right: 355, bottom: 795 }, 'vodafone'), banner: null, mic: null, kbd: null, bar: null, pill: null, card: null, pocket: control({ left: 16, top: 740, right: 72, bottom: 796 }), reimagine: null, tips: null, watch: null, viewbar: control({ left: 16, top: 70, right: 359, bottom: 118 }), composer: null, preview: null },
	filter: null,
	curlLayers: [],
	curl: [],
	curlSkipped: null,
	mascot: null,
	drone: null,
	droneState: null,
	journeyLayer: null,
	journeyBand: null,
	albumInner: null,
	content: [],
	chips: [],
	aboveBanner: [],
	button: null,
	fonts: [],
	fontsSkipped: null,
})

const reading = (menu: ViewReading['menu']): ViewReading => ({
	view: 'reimagined',
	template: 'spotlight',
	composerOpen: false,
	placement: null,
	box: { left: 0, top: 60, right: 375, bottom: 812 },
	boxScroll: 0,
	scrollY: 0,
	corners: { right: { box: { left: 284, top: 724, right: 371, bottom: 811 }, w: 87, h: 87, controls: ['accessibility'] }, left: { box: { left: 0, top: 724, right: 88, bottom: 812 }, w: 88, h: 88, controls: ['pocket'] } },
	zones: { right: { w: 91, h: 88, controls: ['accessibility'] }, left: { w: 88, h: 88, controls: ['pocket'] } },
	boxZones: { right: { w: 91, h: 88 }, left: { w: 88, h: 88 } },
	preview: null,
	menu,
})

const EXPECT = { view: 'reimagined', composer: false, pocket: true, menu: true } as const

test("S7's menu cell: Vodafone's menu marked open with no part of it on the screen is a violation, not a note (nothing was hit-tested)", () => {
	const r = viewViolations('/en/services 375x812 banner absent', reading({ open: true, marked: ['.nav-header.nav-opened'], boxes: [] }), measure(), EXPECT)
	assert.equal(r.violations.length, 1, r.violations.join(' | '))
	assert.match(r.violations[0], /\(menu\) Vodafone's menu is marked open \(\.nav-header\.nav-opened\) but no part of it shows on the screen/)
	// A part of it on the screen: no violation from the menu rule (its points are menuHits' to test).
	const shown = viewViolations('/en/services 375x812 banner absent', reading({ open: true, marked: ['.nav-header.nav-opened'], boxes: [{ what: 'ul.nav-list-items.nav-step-one', box: { left: 0, top: 60, right: 375, bottom: 812 } }] }), measure(), EXPECT)
	assert.deepEqual(shown.violations, [])
	// Not open where it should be: still the one violation it was.
	assert.match(viewViolations('w', reading({ open: false, marked: [], boxes: [] }), measure(), EXPECT).violations.join(' | '), /\(menu\) Vodafone's menu is not open/)
})

test("an S7 cell whose view could not be read is a violation: S7's rules did not run on it", () => {
	const r = viewViolations('/en/services 1366x900 banner absent', null, measure(), EXPECT)
	assert.equal(r.violations.length, 1, r.violations.join(' | '))
	assert.match(r.violations[0], /\(s7\) the view could not be read: S7's rules .* did not run/)
})

/**
 * A preview open in spotlight's place (canvas's, at 1366×900): the rest of the view inert by design (ADR-0076 §7; the
 * owner's decision of 2026-11-21), so the view bar is read inert (no buttons to press) and the preview's close is the
 * control of ours in the view.
 */
const previewCell = () => {
	const m = measure()
	m.at = "S7 canvas's preview open"
	m.controls.viewbar = { ...control({ left: 16, top: 70, right: 359, bottom: 118 }), box: null, shown: false, inert: true, fixed: false }
	m.controls.preview = control({ left: 300, top: 140, right: 340, bottom: 180 })
	const r = reading({ open: false, marked: [], boxes: [] })
	r.template = 'canvas'
	r.preview = { which: 'canvas', open: true, modal: false, anyModal: false, popover: 0, ariaModal: null, inBox: true, position: 'absolute', rect: { left: 0, top: 120, right: 375, bottom: 812 }, room: { left: 0, top: 118, right: 375, bottom: 812 }, barInert: true, usable: [], focusInside: true }
	return { m, r }
}
const PREVIEW = { view: 'reimagined', composer: false, pocket: true, preview: 'canvas' } as const

test("S7's preview cells: the view bar inert under an open preview is what the owner decided, not a missing control; anything of the view still usable is a violation", () => {
	const ok = previewCell()
	assert.deepEqual(viewViolations('w', ok.r, ok.m, PREVIEW).violations, [])
	// The view bar still pressable while the preview is open.
	const bar = previewCell()
	bar.m.controls.viewbar = control({ left: 16, top: 70, right: 359, bottom: 118 })
	bar.r.preview!.barInert = false
	assert.match(viewViolations('w', bar.r, bar.m, PREVIEW).violations.join(' | '), /\(dialog\) the view bar is not inert while the preview is open \(its buttons can be pressed/)
	// Something of the box outside the preview can still take a press or the focus.
	const rest = previewCell()
	rest.r.preview!.usable = ['button.sp-card']
	assert.match(viewViolations('w', rest.r, rest.m, PREVIEW).violations.join(' | '), /\(dialog\) with the preview open, the box still has button\.sp-card to press or focus outside it/)
	// The focus left outside it; its close not on the screen.
	const focus = previewCell()
	focus.r.preview!.focusInside = false
	focus.m.controls.preview = null
	const v = viewViolations('w', focus.r, focus.m, PREVIEW).violations.join(' | ')
	assert.match(v, /\(dialog\) the focus is not in the open preview/)
	assert.match(v, /\(dialog\) the preview's close is not on the screen \(not found\)/)
	// Outside a preview cell an inert view bar is still the violation it was (its buttons not on the screen).
	assert.match(viewViolations('w', { ...ok.r, preview: null }, ok.m, { view: 'reimagined', composer: false, pocket: true }).violations.join(' | '), /\(s7\) the view bar's buttons are not on the screen/)
})

/** The launcher's hide rule as reimagine.js writes it: the marks in `#header :is(...)`, the modal ones, and the wide screen's hover. */
const productRule = () => {
	const src = fs.readFileSync(path.join(ROOT, 'experiences', 'src', 'host', 'demos', 'reimagine.js'), 'utf8')
	const all = /body\.modal-open \.aixc-launcher\[data-aixc\],body:has\(#header :is\((.+?)\),(\.modal\.show)\) \.aixc-launcher/.exec(src)
	const wide = /@media \(min-width:992px\)\{body:has\(#header (li:hover>\.nav-step-two:not\(\.d-lg-none\))\) \.aixc-launcher/.exec(src)
	assert.ok(all && wide, "reimagine.js's hide rule is where this test reads it")
	return { header: all[1].split(','), modal: all[2], wide: wide[1] }
}
const squash = (s: string) => s.replace(/\s*>\s*/g, '>').replace(/\s+/g, ' ').trim()

test("Vodafone's menu marks are the launcher's own hide rule (reimagine.js), read by class only", () => {
	const rule = productRule()
	// #header holds Vodafone's two navigations, .nav-switcher and .nav-header: the marks are scoped to both, by class.
	for (const mark of rule.header) assert.ok(MENU_MARKS.some((s) => squash(s) === squash(`:is(.nav-switcher, .nav-header) ${mark}`)), `${mark} is one of MENU_MARKS (${MENU_MARKS.join(' ; ')})`)
	// The navigation's own .nav-opened (on #header's child, so "#header .nav-opened" holds it).
	assert.ok(MENU_MARKS.includes('.nav-header.nav-opened'))
	assert.ok(MENU_MARKS.includes(rule.modal))
	assert.ok(MENU_MARKS.includes('body.modal-open'))
	assert.deepEqual(MENU_MARKS_WIDE.map(squash), [squash(`:is(.nav-switcher, .nav-header) ${rule.wide}`)])
	// No hover mark at every width: the launcher hides on a hovered dropdown only from 992 px.
	assert.ok(!MENU_MARKS.some((s) => s.includes(':hover')), MENU_MARKS.join(' ; '))
	for (const s of [...MENU_MARKS, ...MENU_MARKS_WIDE]) assert.ok(!s.includes('#'), `${s}: by class, never by id`)
})

/** The in-page reading run on a stand-in document: `present` the selectors that match one node of Vodafone's (or of ours). */
const marked = (present: string[], wide: boolean, ours = false): string[] =>
	Array.from(
		vm.runInNewContext(MENU_MARKED, {
			matchMedia: (q: string) => ({ matches: q === '(min-width: 992px)' && wide }),
			document: { querySelectorAll: (sel: string) => (present.includes(sel) ? [{ closest: (c: string) => (ours && c === '[data-aixc], [data-vg]' ? {} : null) }] : []) },
		}) as string[],
	)

test("Vodafone's menu reads open as the launcher hides: a hovered dropdown only from 992 px, the burger's checkbox at every width, never ours", () => {
	const hover = MENU_MARKS_WIDE[0]
	assert.deepEqual(marked([hover], true), [hover])
	assert.deepEqual(marked([hover], false), [], 'a hovered dropdown at 375 is not the open menu (the launcher stays)')
	const checker = MENU_MARKS.find((s) => s.endsWith('.checker:checked'))!
	assert.deepEqual(marked([checker], false), [checker], "the burger's checkbox checked: the phone menu open")
	assert.deepEqual(marked(['.nav-header.nav-opened'], false, true), [], 'a node of ours is never Vodafone\'s menu')
	assert.equal(vm.runInNewContext(MENU_OPEN, { matchMedia: () => ({ matches: false }), document: { querySelectorAll: () => [] } }), false, 'nothing marked: closed')
	assert.equal(vm.runInNewContext(MENU_OPEN, { matchMedia: () => ({ matches: false }), document: { querySelectorAll: (s: string) => (s === 'body.modal-open' ? [{ closest: () => null }] : []) } }), true)
})

/* ------------------------------------------------- rule (d) and Vodafone's menu's scroll lock */

/**
 * The live walk of 2026-11-22 (live-verify floating2, S7's menu cell at 375×812 on /en/services and /en/home): with
 * Vodafone's phone menu open the page's 15 px classic scrollbar goes, the layout viewport is 375 px wide instead of
 * 360, and Vodafone's fixed button (right: 20px) is at left 300 instead of 285. Its readings, by hand.
 */
const BUTTON_STYLE = (left: number, rtl = false) => ({ position: 'fixed', left: `${left}px`, right: '20px', 'inset-inline-start': rtl ? '20px' : `${left}px`, 'inset-inline-end': rtl ? `${left}px` : '20px', top: '737px', width: '55px', height: '55px', 'z-index': '1' })
const OFF = { box: [285, 737, 55, 55], attr: null, style: BUTTON_STYLE(285), viewport: { clientWidth: 360, innerWidth: 375, gutter: 'auto' } }
const LOCK = (): LayoutReading => ({
	clientWidth: 375,
	innerWidth: 375,
	gutter: 'auto',
	scroller: 'html',
	overflowY: 'hidden',
	inlineOverflow: null,
	rules: [{ selector: '.overflow-hidden', sheet: 'https://web.vodafone.com.eg/o/static-theme/css/styles.css', vodafone: true }],
	oursUnread: [],
	classes: { html: 'ltr overflow-hidden', body: 'other mobile overflow-hidden' },
	menu: ['.nav-header.nav-opened', ':is(.nav-switcher, .nav-header) .checker:checked'],
})
const menuCell = (o: { box?: number[]; style?: Record<string, string>; attr?: string | null; layout?: LayoutReading | null } = {}): Measure => {
	const m = measure()
	m.button = { box: o.box ?? [300, 737, 55, 55], attr: o.attr ?? null, style: o.style ?? BUTTON_STYLE(300), viewport: { clientWidth: 375, innerWidth: 375, gutter: 'auto' } }
	m.layout = o.layout === undefined ? LOCK() : o.layout
	return m
}
const d = (m: Measure, off: Measure['button'] = OFF) => cellViolations(m, { where: '/en/services 375x812 banner absent', off, hits: {} }).filter((x) => x.includes(': (d) '))

test("rule (d) with Vodafone's menu open: the button follows the layout viewport its own scroll lock widened, by exactly the scrollbar's width; nothing else", () => {
	// The live reading: the scrollbar gone by Vodafone's own rule, its menu marked open; the button 15 px on, as the viewport.
	assert.deepEqual(d(menuCell()), [])
	// A button placed from the left (left-to-right page): its left stays, its right-side insets follow the viewport.
	const leftOff = { ...OFF, box: [20, 737, 55, 55], style: { ...BUTTON_STYLE(285, true), left: '20px', right: '285px' } }
	assert.deepEqual(d(menuCell({ box: [20, 737, 55, 55], style: { ...BUTTON_STYLE(300, true), left: '20px', right: '300px' } }), leftOff), [])
	// The live Arabic reading (/ar/services and /ar/home, dir rtl): right 20px, left and inset-inline-end 285 -> 300.
	const ar = (m: Measure) => ((m.view.dir = 'rtl'), m)
	const arOff = { ...OFF, style: BUTTON_STYLE(285, true) }
	assert.deepEqual(d(ar(menuCell({ style: BUTTON_STYLE(300, true) })), arOff), [])
	// The same Arabic reading taken as left-to-right is still caught, and so is it with the menu not marked open.
	assert.notDeepEqual(d(menuCell({ style: BUTTON_STYLE(300, true) }), arOff), [])
	assert.notDeepEqual(d(ar(menuCell({ style: BUTTON_STYLE(300, true), layout: { ...LOCK(), menu: [] } })), arOff), [])
})

test("rule (d) stays exact everywhere else: the menu not marked open, a lock not Vodafone's, a shift not the viewport's, any other change", () => {
	const shifted = /\(d\) the accessibility button's box \[300,737,55,55\] is not \[285,737,55,55\] \(\?aixc=off\)/
	const why = (m: Measure, re: RegExp) => {
		const v = d(m).join(' | ')
		assert.match(v, shifted)
		assert.match(v, /\(d\) its computed .*left: 285px -> 300px/)
		assert.match(v, re)
	}
	// Vodafone's menu not marked open (our own lock, or none of its marks): the button's shift is a violation.
	why(menuCell({ layout: { ...LOCK(), menu: [] } }), /layout viewport is 15 px wider .* but Vodafone's menu is not marked open/)
	// The lock by a style attribute (anyone's, ours too) or by a rule of ours, or a sheet of ours unread.
	why(menuCell({ layout: { ...LOCK(), inlineOverflow: 'hidden' } }), /html's style attribute sets its overflow \(hidden\): not a rule of Vodafone's/)
	why(menuCell({ layout: { ...LOCK(), rules: [...LOCK().rules, { selector: 'html.aixc-lock', sheet: '<style data-aixc data-vg data-aixc-css>', vodafone: false }] } }), /a rule not Vodafone's hides it \(html\.aixc-lock in <style data-aixc/)
	why(menuCell({ layout: { ...LOCK(), oursUnread: ['https://gw.example/__vg/sdk/world.css'] } }), /a stylesheet of ours could not be read/)
	why(menuCell({ layout: { ...LOCK(), rules: [] } }), /no stylesheet rule hides the html's overflow/)
	why(menuCell({ layout: { ...LOCK(), overflowY: 'auto' } }), /the page's overflow-y is auto, not hidden/)
	// Not the scrollbar going: another window, a kept gutter, a change that is not the scrollbar's width.
	why(menuCell({ layout: { ...LOCK(), innerWidth: 390, clientWidth: 375 } }), /the window is not the same \(innerWidth 375 -> 390\)/)
	why(menuCell({ layout: { ...LOCK(), gutter: 'stable' } }), /scrollbar-gutter is not auto/)
	// No layout read (a reading made before this rule, or by hand): exact, as before.
	assert.match(d(menuCell({ layout: null })).join(' | '), shifted)
	assert.match(d(menuCell(), { ...OFF, viewport: undefined }).join(' | '), shifted)
	// With the lock Vodafone's, the button still held to everything but the viewport's 15 px.
	// A move that is not the viewport's 15 px: no correction, the baseline as it was.
	assert.match(d(menuCell({ box: [301, 737, 55, 55], style: BUTTON_STYLE(301) })).join(' | '), /box \[301,737,55,55\] is not \[285,737,55,55\] \(\?aixc=off\).*its computed left: 285px -> 301px; inset-inline-start: 285px -> 301px/)
	// Its insets moved with the viewport but its box not where they put it.
	assert.match(d(menuCell({ box: [301, 737, 55, 55] })).join(' | '), /box \[301,737,55,55\] is not \[300,737,55,55\] \(\?aixc=off, moved 15 px with the layout viewport\)/)
	assert.match(d(menuCell({ box: [300, 740, 55, 55], style: { ...BUTTON_STYLE(300), top: '740px' } })).join(' | '), /box \[300,740,55,55\] is not \[300,737,55,55\].*its computed top: 737px -> 740px/)
	assert.match(d(menuCell({ box: [300, 737, 60, 55], style: { ...BUTTON_STYLE(300), width: '60px' } })).join(' | '), /its computed width: 55px -> 60px/)
	assert.match(d(menuCell({ attr: 'left: 300px' })).join(' | '), /\(d\) its style attribute "left: 300px" is not null/)
	assert.match(d(menuCell({ style: { ...BUTTON_STYLE(300), 'z-index': '2' } })).join(' | '), /its computed z-index: 1 -> 2/)
	// One side's insets follow the viewport, all of them: left moved but inset-inline-start not is no correction.
	assert.match(d(menuCell({ style: { ...BUTTON_STYLE(300), 'inset-inline-start': '285px' } })).join(' | '), /is not \[285,737,55,55\] \(\?aixc=off\).*its computed left: 285px -> 300px$/)
	// Without the viewport changing, the shift is the violation it always was (no correction).
	assert.match(d(menuCell({ layout: { ...LOCK(), clientWidth: 360, innerWidth: 375 } })).join(' | '), shifted)
})
