/**
 * PageHost: the experience layer's regions on Vodafone's own page (voice-guide ADR-0046 §2,
 * ADR-0048 §6), in place of the clone's shell (src/shell.js).
 *
 * - main and sourceRoot are Vodafone's #main-content. The layer only tags what it reads there, or
 *   hides it as a whole while a reimagined view or the Pocket's album shows, and restores it exactly.
 *   Hidden, it stays laid out at its width (no height, unseen, inert), so Vodafone's scripts never find
 *   it hidden: Owl's AutoRefresh fades out a carousel it finds hidden until its next poll (W2-A). Unseen
 *   by opacity, which is not inherited: an inherited visibility would set off Vodafone's own transitions
 *   (its .owl-item has `transition: all`), and its cards would be hidden for the frame they come back.
 * - outputRoot (#experience-output) and viewbar (#aixc-viewbar) are the layer's, inserted beside
 *   #main-content and hidden until a demo needs them. They keep the clone's ids, so the modules'
 *   CSS (ADR-0044 keys on #experience-output) works unchanged.
 * - A demo can add a region of its own after these (`addRegion`): the Pocket's album (#pocket-output,
 *   ADR-0052), so its page turn can hide #main-content and the reimagined view without hiding itself.
 * - Vodafone's header, footer, accessibility button and cookie banner are protected: the layer
 *   never writes into them.
 *
 * Everything added carries data-aixc (the guard removes it on a failure) and data-vg (the trail
 * never records it). On a page without #main-content (Vodafone's /spa/ app) there is no host.
 */

/** Vodafone's own fixed or framing elements; selectors from the saved pages of 2026-10-23. */
export const PROTECTED = ['#header', 'footer', '#vodafone-aw-icon', '#onetrust-consent-sdk']

const langOf = (doc, path) => {
  if (/^\/ar(\/|$)/.test(path)) return 'ar'
  if (/^\/en(\/|$)/.test(path)) return 'en'
  return (doc.documentElement.lang || 'en').toLowerCase().startsWith('ar') ? 'ar' : 'en'
}

const isPinned = (node, view) => {
  const style = view.getComputedStyle(node)
  return (style.position === 'fixed' || style.position === 'sticky') && style.display !== 'none' && style.visibility !== 'hidden'
}

export const createPageHost = (doc = document, { path = doc.defaultView?.location.pathname ?? '/' } = {}) => {
  const main = doc.getElementById('main-content')
  if (!main) return { host: null, problem: 'no #main-content on this page' }
  if (doc.getElementById('experience-output')) return { host: null, problem: 'the page already has an experience output (the clone, or a second copy of the layer)' }

  const view = doc.defaultView
  const lang = langOf(doc, path)
  const dir = lang === 'ar' ? 'rtl' : 'ltr'
  const header = doc.getElementById('header') ?? doc.querySelector('header')
  const footer = doc.querySelector('footer.footer') ?? doc.querySelector('footer')

  const region = (tag, attributes) => {
    const node = doc.createElement(tag)
    for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value)
    node.dataset.aixc = ''
    node.dataset.vg = ''
    node.hidden = true
    return node
  }
  const viewbar = region('div', { id: 'aixc-viewbar', class: 'aixc-viewbar', dir })
  const outputRoot = region('div', { id: 'experience-output', class: 'experience-output', dir })
  main.before(viewbar)
  main.after(outputRoot)

  // #main-content's attributes as Vodafone served them, kept while the layer hides it, so they come back exactly.
  const KEPT = ['style', 'inert', 'hidden']
  let served = null
  const showSource = () => {
    served?.forEach((value, i) => (value === null ? main.removeAttribute(KEPT[i]) : main.setAttribute(KEPT[i], value)))
    served = null
  }
  const regions = [outputRoot]

  return {
    host: {
      lang,
      dir,
      header,
      footer,
      main,
      sourceRoot: main,
      outputRoot,
      viewbar,
      protected: PROTECTED,
      /** The bottom of whatever Vodafone pins at the top of the screen (its sticky navigation), in px. */
      chromeBottom() {
        let bottom = 0
        for (const node of [header, ...doc.querySelectorAll('#nav-header, .nav-header')]) {
          if (!node || !node.isConnected) continue
          const box = node.getBoundingClientRect()
          if (box.height && isPinned(node, view)) bottom = Math.max(bottom, box.bottom)
        }
        return Math.max(0, Math.round(bottom))
      },
      /** Hides #main-content: `hidden` and inert, but laid out at its width (its display kept), at no height and transparent. */
      hideSource() {
        if (served) return
        served = KEPT.map((name) => main.getAttribute(name))
        // Written as the attribute, not through main.style: Chrome would write an emptied inline style back as style="".
        main.setAttribute('style', `${served[0] ?? ''};display:${view.getComputedStyle(main).display}!important;height:0!important;overflow:hidden!important;opacity:0!important`)
        main.inert = main.hidden = true
      },
      showSource,
      /** True while the layer hides #main-content. */
      get sourceHidden() {
        return !!served
      },
      /** Puts a demo's own region after the layer's, marked like them (it keeps its own hidden state). */
      addRegion(node) {
        node.dataset.aixc = ''
        node.dataset.vg = ''
        regions.at(-1).after(node)
        regions.push(node)
        return node
      },
      destroy() {
        showSource()
        viewbar.remove()
        for (const node of regions.splice(0)) node.remove()
      },
    },
    problem: null,
  }
}
