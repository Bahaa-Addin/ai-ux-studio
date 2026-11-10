/**
 * Tips: the way in (voice-guide ADR-0045). This is the only part loaded with the page: the Tips
 * button and, on a first visit, a small invitation above it. The collection itself (tips.js,
 * scenes, coach marks and their stylesheet) loads the first time someone opens it.
 *
 * - The button sits bottom-left, the one edge no other control uses: the right-hand column
 *   belongs to the guide's microphone, Vodafone's accessibility button and the Pocket; the top to
 *   "Your journey" and "Reimagine this page" (runbook §5a). It steps aside in the Reimagine view
 *   and the open Pocket, where the experience owns the edges (as ADR-0044 does for the corner),
 *   and rises above the VoiceTut tab when that experiment is on.
 * - The invitation never blocks the page and never appears in a browser driven by automation
 *   (tests, the walkthrough tool); `?tips=open|invite|off` overrides.
 * - Every failure is caught: the tips can break, the page cannot.
 */

import { CARDS, readState, startAction, writeState } from './catalog.js'
import { icon } from './icons.js'
import { lang, t } from '../i18n.js'

const make = (tag, className, ...children) => {
  const node = document.createElement(tag)
  if (className) node.className = className
  for (const child of children) if (child !== null && child !== undefined && child !== false) node.append(child)
  return node
}

const storage = (() => {
  try {
    return window.localStorage
  } catch {
    return null
  }
})()

/** Loads the collection's stylesheet once; resolves when it applies (or after a short wait). */
let cssLoaded = null
const loadCss = () => {
  if (cssLoaded) return cssLoaded
  cssLoaded = new Promise((resolve) => {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = new URL('./tips.css', import.meta.url).href
    link.dataset.tips = ''
    const timer = window.setTimeout(resolve, 2500)
    link.addEventListener('load', () => {
      window.clearTimeout(timer)
      resolve()
    })
    link.addEventListener('error', () => {
      window.clearTimeout(timer)
      resolve()
    })
    document.head.append(link)
  })
  return cssLoaded
}

/** The trail's consent card is showing: the invitation waits for it (one question at a time). */
const consentShowing = () => {
  const card = document.querySelector('vg-guide')?.shadowRoot?.querySelector('.tr-card')
  return Boolean(card && !card.hidden && card.getBoundingClientRect().height > 0)
}

export const initTips = ({ adapter, regions, pocket = null }) => {
  try {
    const state = readState(storage)
    const params = new URLSearchParams(window.location.search)
    const automated = Boolean(navigator.webdriver)
    const { model } = adapter.extractContent(regions.sourceRoot)
    if (!model) return null

    /* -------------------------------------------------------------- the button */
    const dot = make('span', 'tips-entry__new')
    dot.setAttribute('aria-hidden', 'true')
    const entryButton = make('button', 'tips-entry', icon('bulb', 'tips-entry__icon'), make('span', 'tips-entry__label', t('Tips')), dot)
    entryButton.type = 'button'
    entryButton.setAttribute('aria-label', t('Tips: four new ways to explore this page'))
    entryButton.setAttribute('aria-haspopup', 'dialog')
    entryButton.dataset.vg = '' // never part of a recorded journey (voice-guide SPEC-06)
    const syncDot = () => entryButton.classList.toggle('is-new', !state.seen)
    syncDot()
    document.body.append(entryButton)

    // Above the VoiceTut tab (bottom-left too) when that experiment is on the page.
    const lift = () => {
      const tab = document.querySelector('.voicetut-demo')
      const r = tab?.getBoundingClientRect()
      const value = r && r.height ? Math.max(0, window.innerHeight - r.top + 12 - 20) : 0
      entryButton.style.setProperty('--tips-lift', `${Math.round(value)}px`)
    }
    lift()
    window.addEventListener('resize', lift)
    new MutationObserver(lift).observe(document.body, { childList: true })

    /* -------------------------------------------------------------- the collection, on demand */
    let tips = null
    let loading = null
    const load = () => {
      if (tips) return Promise.resolve(tips)
      if (!loading) {
        loading = Promise.all([import('./tips.js'), loadCss()])
          .then(([module]) => {
            tips = module.createTips({ t, lang, model, pocket, storage, state, entryButton })
            return tips
          })
          .catch((error) => {
            loading = null
            console.warn('[tips] could not load the tips:', error)
            return null
          })
      }
      return loading
    }
    const open = async (options = {}) => {
      dismissInvite()
      const ready = await load()
      if (!ready) return
      await ready.open({ from: entryButton.getBoundingClientRect(), ...options })
      syncDot()
    }
    entryButton.addEventListener('click', () => open())
    // Warm the collection while the pointer is on its way to the button.
    entryButton.addEventListener('pointerenter', () => load(), { once: true })

    /* -------------------------------------------------------------- the invitation */
    let invite = null
    const dismissInvite = (remember = true) => {
      if (!invite) return
      const node = invite
      invite = null
      if (remember) {
        state.invited = true
        writeState(storage, state)
      }
      node.classList.remove('is-on')
      window.setTimeout(() => node.remove(), 260)
    }
    const showInvite = () => {
      if (invite || document.body.dataset.aixcView === 'reimagined' || document.body.dataset.pocketView) return
      const show = make('button', 'tips-invite__go', t('Show me'))
      show.type = 'button'
      const later = make('button', 'tips-invite__later', t('Not now'))
      later.type = 'button'
      invite = make(
        'section',
        'tips-invite',
        make('span', 'tips-invite__disc', icon('bulb')),
        make('div', 'tips-invite__text', make('strong', null, t('New on this page')), make('span', null, t('Four new ways to explore Services. Take the two-minute tour?'))),
        make('div', 'tips-invite__actions', later, show),
      )
      invite.dataset.vg = ''
      invite.setAttribute('role', 'dialog')
      invite.setAttribute('aria-modal', 'false')
      invite.setAttribute('aria-label', t('New on this page'))
      invite.dir = lang === 'ar' ? 'rtl' : 'ltr'
      show.addEventListener('click', () => open({ at: 0 }))
      later.addEventListener('click', () => dismissInvite())
      document.body.append(invite)
      requestAnimationFrame(() => requestAnimationFrame(() => invite?.classList.add('is-on')))
    }

    const action = startAction({ state, params, automated })
    if (action === 'open') {
      window.setTimeout(() => open({ at: 0 }), 400)
    } else if (action === 'invite') {
      // After the page has settled, and after the journey's consent question if it is showing.
      let waited = 0
      const tryInvite = () => {
        waited += 1
        if (consentShowing() && waited < 60) return window.setTimeout(tryInvite, 1000)
        showInvite()
      }
      window.setTimeout(tryInvite, 1600)
    }

    // A debugging and testing handle, only with ?aixc-debug (as the composer's).
    if (params.has('aixc-debug')) {
      window.__aixcTips = { open, load, state, cards: CARDS.map((card) => card.id), dismissInvite, showInvite, hold: async (index, time) => (await load())?.hold(index, time), get tips() { return tips } }
    }

    return { entryButton, open, load }
  } catch (error) {
    console.warn('[tips] the tips are not available on this page:', error)
    return null
  }
}
