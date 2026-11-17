/**
 * Reimagine's launcher on Vodafone's own pages (live plan phase 4a; voice-guide ADR-0076, phase 4 design §3.3,
 * §3.5): a chunk of its own, which the layer's core (../index.js) loads at idle where the site enables the demo.
 * It is the gate, one button and its place; the shell (./reimagine/shell.js: composer, view bar, the box) is a
 * chunk of its own that only a press on the button asks for.
 *
 * - Imports nothing: a module it shared with the core or the Pocket would become a chunk the core loads with it
 *   (ADR-0046 §1, phase 4 design §2.6). Its words (the clone's, src/i18n.js) and the website check are here.
 * - The gate: on the website only, where the page was read well (coverage at least GATE.coverage) into at least
 *   GATE.sections sections of GATE.items items or more; checked on start and on every new reading (`aixc:model`).
 *   A page that fails it never shows the button; a reading that fails it later hides the button (an open view
 *   stays open: that is the shell's).
 * - The place: directly under the trail's pill, on the pill's side (B-23). Measured from where the pill rests,
 *   untransformed: the trail's own --tr-top plus the pill's height plus GAP, at the pill's inline end. It follows
 *   the pill as the trail moves it (the trail writes --tr-top on the window's scroll, once a frame; a watch on that
 *   style and a ResizeObserver on the pill, so no layout is read per frame). The pill is found as it mounts, not only
 *   when the trail says it is up (vg:trail-ready comes after the trail has read its storage, and for a returning
 *   visitor its pill shows first): while none is known, a watch on the guide's arrival on body and on what mounts in
 *   its shadow root (as ../../pocket/obstacles.js watches them), gone once the pill is found. Without a pill (no
 *   trail, or "Not now"), it sits EDGE px under Vodafone's header where it meets the top of the screen, pinned or in
 *   the flow (host.chromeBottom() counts the pinned header only: at the top of the page that is 0, and the button
 *   would sit over the header).
 * - Tucked away (the lead's decision, 2026-11-17): when the trail tucks its pill away on a scroll down (its class
 *   `tucked`, a transform up off the screen), the button goes up off the screen with it, by a transform too, and
 *   comes back when the pill does: the watch on the pill's class, so still no layout read per frame. Without a pill
 *   it shows only near the top of the page (scrollY under NEAR_TOP, the trail's own "near the top", where its pill
 *   never tucks) and is tucked away below that, on the way back up too, so it never sits over Vodafone's content
 *   further down. Tucked, it takes no pointer; a keyboard focus brings it back while it lasts (as the pill's does),
 *   and so does the pill's.
 * - Hidden while the trail's consent card, sheet, toast or journey shows (they open where the button is), while the
 *   Pocket's album shows (body[data-pocket-view]), while a reimagined view shows (body[data-aixc-view='reimagined']),
 *   while the shell holds it (launcher.hold), and when the gate fails. While one of Vodafone's menus or dialogs is
 *   open (its navigation's dropdowns, its login card and its phone menu sit below z-index 19 while the page is at its
 *   top) it gives way by a rule of its stylesheet: no listener on Vodafone's nodes, and nothing of Vodafone's is changed.
 * - Stacking: z-index 19, above Vodafone's content in the flow, below its pinned navigation (20) and its dialogs (99),
 *   far below OneTrust's banner (2147483645). It sits before #main-content in the document, so a keyboard reaches it
 *   after Vodafone's header and before the content it changes.
 * - Everything added carries data-aixc and data-vg; every handler, observer and frame runs through the guard, and a
 *   stop takes all of it away.
 */

/** The launcher's words, as the clone's composer says them (src/i18n.js 'Reimagine this page'). */
const LABEL = { en: 'Reimagine this page', ar: 'غيّر شكل الصفحة' }
/** The clone's sparkle (src/aixc/controller.js ICON_SPARKLE). */
const SPARKLE = 'M11 2.5 13.1 9 19.5 11l-6.4 2.1L11 19.5 8.9 13.1 2.5 11 8.9 9zM19 2l.9 2.6 2.6.9-2.6.9L19 9l-.9-2.6-2.6-.9 2.6-.9z'

/** Where Reimagine is offered (pilot knobs; phase 4 design §3.4): the share of the page read, and how much it holds. */
const GATE = { coverage: 0.9, sections: 2, items: 3 }
/** px under the pill, and under Vodafone's header when there is no pill. */
const GAP = 12
const EDGE = 16
/** Without a pill, the button shows only while the page is scrolled less than this (the trail's pill never tucks there: trail/controller.ts). */
const NEAR_TOP = 120
/** The pill's inline end (voice-guide trail/view.ts .tr-pill), so the button lines up with it. */
const END = 'calc(16px + env(safe-area-inset-right, 0px))'

/** The shop is not the website (its own readings come with E16). */
const onWebsite = () => !/^eshop\./i.test(location.hostname)

const passes = (model, coverage) => onWebsite() && (coverage?.ratio ?? 0) >= GATE.coverage && (model?.sections ?? []).filter((section) => (section?.items?.length ?? 0) >= GATE.items).length >= GATE.sections

/*
 * Vodafone's colours (its primary button: #e60000, #990000 on hover; white words) and faces (the shared stacks of
 * ../vodafone-faces.css when the Pocket has put them on the page, else the page's own faces); the trail pill's
 * shadow. Vodafone's open menus, as its theme marks them: an expanded control or a `.show` in its header, the phone
 * menu (.nav-opened, the burger's checkbox), a checked menu flag (the user menu under the avatar: its label checks
 * it), the login card a signed-out visitor opens from the login icon (the theme's own rule: `.active .nav-startup`),
 * a hovered dropdown on a wide screen (the theme's own hover rule), an open dialog. Tucked away: up by its own
 * top (--aixc-top, written with it), its height and 8 px, so no part of it or its shadow is on the screen; the pill's
 * transition (trail/view.ts), none with reduced motion.
 */
const CSS = `
.aixc-launcher[data-aixc]{position:fixed;z-index:19;top:0;box-sizing:border-box;display:inline-flex;align-items:center;gap:10px;width:auto;height:auto;min-height:52px;margin:0;padding:0;padding-inline:18px 22px;border:0;border-radius:999px;background:#e60000;color:#fff;font-family:var(--pocket-bold,vodafone-bold-en,vf-bold,vodafone-regular-en,sans-serif);font-size:16px;font-style:normal;font-weight:normal;line-height:1.25;letter-spacing:normal;text-transform:none;text-decoration:none;text-align:start;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,.16);cursor:pointer;opacity:1;visibility:visible;transform:none;transition:transform .18s cubic-bezier(.2,.8,.2,1)}
.aixc-launcher[data-aixc][data-tucked]:not(:focus-visible){transform:translateY(calc(-100% - var(--aixc-top,0px) - 8px));box-shadow:none;pointer-events:none}
@media (prefers-reduced-motion:reduce){.aixc-launcher[data-aixc]{transition:none}}
.aixc-launcher[data-aixc]:lang(ar){font-family:var(--pocket-bold,vodafone-bold-ar,vodafone-bold-en,vf-bold,vodafone-regular-ar,vodafone-regular-en,sans-serif)}
.aixc-launcher[data-aixc]:hover{background:#990000}
.aixc-launcher[data-aixc]:focus-visible{outline:3px solid #fff;outline-offset:0;box-shadow:0 0 0 6px #990000}
.aixc-launcher[data-aixc] svg{flex:none;width:22px;height:22px;margin:0;fill:currentColor}
.aixc-launcher[data-aixc][hidden]{display:none!important}
@media (max-width:767px){.aixc-launcher[data-aixc]{min-height:48px;padding-inline:14px 18px;font-size:15px}}
body.modal-open .aixc-launcher[data-aixc],body:has(#header :is([aria-expanded="true"],.show,.nav-opened,.nav-flag:checked,.checker:checked,.active .nav-startup),.modal.show) .aixc-launcher[data-aixc]{visibility:hidden}
@media (min-width:992px){body:has(#header li:hover>.nav-step-two:not(.d-lg-none)) .aixc-launcher[data-aixc]{visibility:hidden}}
`

/** The trail's pill wherever it mounts: in the guide's shadow root, or in the page (as ../../pocket/obstacles.js reads it). */
const findPill = () => [...document.querySelectorAll('vg-guide')].flatMap((guide) => [...(guide.shadowRoot?.querySelectorAll('.tr-pill') ?? [])]).concat(...document.querySelectorAll('.tr-pill'))[0] ?? null

export async function start({ host, adapter, guard, layer, ensureCss, checkpoint }) {
  checkpoint('reimagine-launcher')
  ensureCss('reimagine-launcher', CSS)

  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'aixc-launcher'
  button.dataset.aixc = ''
  button.dataset.vg = ''
  button.lang = host.lang
  button.dir = host.dir
  button.hidden = true
  button.setAttribute('aria-expanded', 'false')
  button.setAttribute('aria-controls', 'aixc-composer')
  const svgNs = 'http://www.w3.org/2000/svg'
  const icon = document.createElementNS(svgNs, 'svg')
  icon.setAttribute('viewBox', '0 0 24 24')
  icon.setAttribute('aria-hidden', 'true')
  icon.setAttribute('focusable', 'false')
  const path = document.createElementNS(svgNs, 'path')
  path.setAttribute('d', SPARKLE)
  icon.append(path)
  const words = document.createElement('span')
  words.textContent = LABEL[host.lang] ?? LABEL.en
  button.append(icon, words)
  // Before #main-content, beside the layer's own regions (PageHost): after Vodafone's header in the Tab order.
  const anchor = host.viewbar?.isConnected && host.viewbar.parentNode === host.main.parentNode ? host.viewbar : host.main
  anchor.before(button)

  let allowed = passes(layer.model, layer.coverage)
  /** Why the shell holds the button hidden (its composer open, say): launcher.hold(name, on). */
  const held = new Set()
  /** The trail as found: its root (--tr-top), the pill (its side and height) and what opens under it. */
  let trail = null
  let journeyOpen = false
  let frame = 0
  let placed = ''

  const shows = (node) => !!node?.isConnected && !node.hidden

  /** The bottom of Vodafone's header where it meets the top of the screen, pinned or in the flow (as the trail reads it). */
  const headerBottom = () => {
    let bottom = host.chromeBottom()
    for (const node of [host.header, document.getElementById('nav-header')]) {
      const box = node?.isConnected ? node.getBoundingClientRect() : null
      if (box && box.top <= 10 && box.bottom > 0 && box.height <= innerHeight * 0.35) bottom = Math.max(bottom, box.bottom)
    }
    return bottom
  }

  /** The pill's top as the trail sets it (an inline custom property: no layout read). */
  const trailTop = () => {
    const raw = trail.root.style.getPropertyValue('--tr-top') || getComputedStyle(trail.root).getPropertyValue('--tr-top')
    const top = parseFloat(raw)
    return Number.isFinite(top) ? top : 72
  }

  /** The trail's pill is up (shown, its size known): the button goes under it, and tucks away with it. */
  const withPill = () => !!trail && shows(trail.pill) && trail.height > 0

  const place = (pill) => {
    let top
    let side
    if (pill) {
      top = trailTop() + trail.height + GAP
      side = trail.side
    } else {
      top = headerBottom() + EDGE
      side = host.dir === 'rtl' ? 'left' : 'right'
    }
    const key = `${Math.round(top)} ${side}`
    if (key === placed) return
    placed = key
    button.style.top = `${Math.round(top)}px`
    button.style.setProperty('--aixc-top', `${Math.round(top)}px`)
    button.style.left = side === 'left' ? END : 'auto'
    button.style.right = side === 'right' ? END : 'auto'
  }

  const update = () => {
    const covered = journeyOpen || (trail && [trail.card, trail.sheet, trail.toast].some(shows))
    const view = document.body.dataset
    const hide = !allowed || held.size > 0 || !!covered || 'pocketView' in view || view.aixcView === 'reimagined'
    if (!hide) {
      const pill = withPill()
      place(pill)
      // With the pill: tucked while it is (its class; its own keyboard focus brings it back). Without: below NEAR_TOP.
      const tucked = pill ? trail.pill.classList.contains('tucked') && !trail.pill.matches(':focus-visible') : scrollY >= NEAR_TOP
      if (button.hasAttribute('data-tucked') !== tucked) button.toggleAttribute('data-tucked', tucked)
    }
    if (button.hidden !== hide) button.hidden = hide
  }

  const schedule = () => {
    if (!frame && !guard.stopped) frame = requestAnimationFrame(guard.wrap('reimagine launcher', () => ((frame = 0), update())))
  }

  // The trail: its root's style (--tr-top), and the hidden state of the pill and of what opens under it.
  const trailWatch = new MutationObserver(guard.wrap('reimagine trail', () => update()))
  const pillSize = new ResizeObserver(
    guard.wrap('reimagine pill', (entries) => {
      for (const entry of entries) if (trail && entry.target === trail.pill) trail.height = entry.borderBoxSize?.[0]?.blockSize ?? entry.target.offsetHeight
      // A pill that left the page (the trail stopped, or came back anew): find it again.
      if (trail && !trail.pill.isConnected) findTrail()
      update()
    }),
  )
  // While no pill is known: the guide arriving on body, and what mounts in its shadow root.
  const arrival = new MutationObserver(
    guard.wrap('reimagine arrival', (records) => {
      if (trail || !records.some((r) => [...r.addedNodes].some((node) => node.localName === 'vg-guide' || node.matches?.('.tr-pill') || node.querySelector?.('.tr-pill')))) return
      findTrail()
      update()
    }),
  )
  const findTrail = () => {
    const pill = findPill()
    if (pill !== (trail?.pill ?? null)) {
      trailWatch.disconnect()
      pillSize.disconnect()
      trail = null
      if (pill) {
        const root = pill.closest('.tr') ?? pill.parentElement
        const part = (selector) => root.querySelector(selector)
        trail = { root, pill, card: part('.tr-card'), sheet: part('.tr-sheet'), toast: part('.tr-toast'), side: getComputedStyle(pill).direction === 'rtl' ? 'left' : 'right', height: pill.offsetHeight }
        trailWatch.observe(root, { attributes: true, attributeFilter: ['style'] })
        for (const node of [trail.card, trail.sheet, trail.toast]) if (node) trailWatch.observe(node, { attributes: true, attributeFilter: ['hidden'] })
        // The pill's class too: the trail tucks it away and brings it back with `tucked`.
        trailWatch.observe(pill, { attributes: true, attributeFilter: ['hidden', 'class'] })
        pillSize.observe(pill)
      }
    }
    arrival.disconnect()
    if (trail) return
    arrival.observe(document.body, { childList: true })
    for (const guide of document.querySelectorAll('vg-guide')) if (guide.shadowRoot) arrival.observe(guide.shadowRoot, { childList: true, subtree: true })
  }

  // The trail's host API (version 2): the journey open, in the guide's sheet or a host's own view.
  let unsubscribe = null
  const useTrail = (api) => {
    findTrail()
    if (!unsubscribe && typeof api?.subscribe === 'function')
      unsubscribe = api.subscribe(
        guard.wrap('reimagine trail state', (snapshot) => {
          if (journeyOpen === !!snapshot?.open) return
          journeyOpen = !!snapshot?.open
          update()
        }),
      )
    update()
  }

  // The album and a reimagined view say so on body.
  const views = new MutationObserver(guard.wrap('reimagine views', () => update()))
  views.observe(document.body, { attributes: true, attributeFilter: ['data-pocket-view', 'data-aixc-view'] })

  guard.onStop(() => {
    cancelAnimationFrame(frame)
    arrival.disconnect()
    trailWatch.disconnect()
    pillSize.disconnect()
    views.disconnect()
    try {
      unsubscribe?.()
    } catch {}
    button.remove()
  })

  guard.listen(window, 'scroll', schedule, { passive: true })
  guard.listen(window, 'resize', schedule)
  // A keyboard focus on the pill brings it back while it is tucked (the trail's stylesheet): the button with it.
  guard.listen(document, 'focusin', schedule)
  guard.listen(document, 'focusout', schedule)
  guard.listen(window, 'vg:trail-ready', (event) => useTrail(event.detail))
  guard.listen(document, 'aixc:model', (event) => {
    allowed = passes(event.detail?.model, event.detail?.coverage)
    update()
  })

  // A press: the shell's chunk, asked for only now, and its open().
  let shell = null
  let opened = null
  const launcher = {
    button,
    /** The shell's own reasons to keep the button hidden ('composer', say), on top of the launcher's. */
    hold(name, on = true) {
      if (on) held.add(name)
      else held.delete(name)
      update()
    },
  }
  guard.listen(button, 'click', async () => {
    checkpoint('reimagine-press')
    shell ??= import('./reimagine/shell.js')
    const mod = await shell
    if (guard.stopped) return
    opened = (await mod.open({ host, adapter, guard, layer, ensureCss, checkpoint, launcher })) ?? opened
  })

  useTrail(window.voiceGuide?.trailHost)

  return {
    launcher,
    /** What the shell's open() gave (its state: the composer's), or null before a press: for the Pocket and the tests. */
    get state() {
      return opened?.state ?? null
    },
    /** For `?aixc-debug` and the tests. */
    debug: () => ({ allowed, hidden: button.hidden, placed, pill: !!trail && shows(trail.pill), tucked: button.hasAttribute('data-tucked'), journeyOpen, held: [...held] }),
  }
}
