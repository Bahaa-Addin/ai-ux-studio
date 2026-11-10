/**
 * Tips: "Try it" coach marks (voice-guide ADR-0045), in the manner of Apple's TipKit popovers.
 *
 * A flow is a few steps. Each step points at a real control on the page (the guide's microphone,
 * a "Pocket it" chip, the Pocket corner, the Reimagine launcher, a ready-made view, "Your
 * journey"), dims the rest with a scrim that has holes for that control and for Vodafone's
 * accessibility button (never covered, voice-guide AGENTS.md §4.6), and waits for you to use it.
 * Nothing is pressed for you. Esc, the close button or "Skip" end the flow at any time.
 *
 * The flows read the demos' own state (the Pocket's `state`, `body[data-aixc-view]`,
 * `body[data-pocket-view]`, the launcher's `aria-expanded`) and never change it.
 */

import { icon } from './icons.js'
import { box, inflate, placePopover, scrimPath } from './geometry.js'

const SVG_NS = 'http://www.w3.org/2000/svg'
const LAYER_Z = 2147483500 // above the guide (2147483400), below OneTrust (2147483645)

const make = (tag, className, ...children) => {
  const node = document.createElement(tag)
  if (className) node.className = className
  for (const child of children) if (child !== null && child !== undefined && child !== false) node.append(child)
  return node
}

const visible = (el) => {
  if (!el?.isConnected) return false
  const r = el.getBoundingClientRect()
  if (r.width < 2 || r.height < 2) return false
  const style = getComputedStyle(el)
  return style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity) > 0.05
}

/** The guide's shadow root, when the voice guide is on the page (voice-guide `ui.ts`). */
export const guideRoot = () => document.querySelector('vg-guide')?.shadowRoot ?? null
export const guideMic = () => guideRoot()?.querySelector('.vg-mic') ?? null
export const journeyPill = () => guideRoot()?.querySelector('.tr-pill') ?? null
const a11yWidget = () => document.getElementById('vodafone-aw-icon')

/** The floating controls a popover should not sit on (runbook §5a). */
const floatingControls = () => [guideMic(), a11yWidget(), document.querySelector('.pocket-peek[data-state="shown"]'), document.querySelector('.aixc-launcher'), journeyPill(), document.querySelector('.tips-entry')].filter(visible)

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()))
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** Resolves when `test()` is true (checked every frame), or false after `timeout` ms or on abort. */
const until = async (test, { timeout = 8000, signal } = {}) => {
  const started = performance.now()
  for (;;) {
    if (signal?.aborted) return false
    try {
      if (test()) return true
    } catch {
      // A demo that is not on the page: keep waiting until the timeout.
    }
    if (performance.now() - started > timeout) return false
    await nextFrame()
  }
}

/** Scrolls a control to the middle of the screen and waits until it stops moving. */
const bringIntoView = async (el, { reduced, signal }) => {
  if (!el) return
  const r = el.getBoundingClientRect()
  const margin = 96
  if (r.top >= margin && r.bottom <= window.innerHeight - margin) return
  el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: reduced ? 'auto' : 'smooth' })
  let last = null
  let still = 0
  await until(
    () => {
      const top = Math.round(el.getBoundingClientRect().top)
      still = top === last ? still + 1 : 0
      last = top
      return still >= 4
    },
    { timeout: 1600, signal },
  )
}

/**
 * The flows, one per demo. `env` gives the Pocket's API and the copy; each step has
 * `target()`, `title`, `body`, optional `prepare()` (wait for the page to be ready), `done()`
 * (polled each frame, or a click on the target when `doneOnPress`), and `ack` for a step that
 * only explains (a "Got it" button).
 */
export const buildFlows = ({ t, pocket, example, templateName, rtl }) => {
  const side = (...sides) => (rtl ? sides.map((s) => (s === 'left' ? 'right' : s === 'right' ? 'left' : s)) : sides)
  let chosen = null // the card picked for the Pocket flow
  const pickChip = () => {
    if (chosen?.isConnected && chosen.closest('[data-aixc-item]')) return chosen
    const chips = [...document.querySelectorAll('#source-content [data-aixc-item] .pocket-cta')].filter((chip) => !chip.closest('[hidden]'))
    const prefer = ['calls-services', 'roaming', 'play-and-win']
    chosen = prefer.map((id) => chips.find((chip) => chip.closest('[data-aixc-item]')?.dataset.aixcItem === id)).find(Boolean) ?? chips[0] ?? null
    return chosen
  }
  const titleOf = (chip) => chip?.closest('[data-aixc-item]')?.querySelector('h3, h4, .card-title, [class*="title"]')?.textContent?.trim() || ''
  return {
    voice: {
      feature: 'voice',
      success: { title: t('That’s the guide'), body: t('Ask your question. Your words appear above the microphone as you speak.') },
      steps: [
        {
          target: guideMic,
          title: t('Press the microphone'),
          body: t('Then ask: “{example}”', { example }),
          prefer: side('left', 'top'),
          doneOnPress: true,
        },
      ],
    },
    pocket: {
      feature: 'pocket',
      success: { title: t('That’s your pocket'), body: t('Peel off anything else you like. It stays in this browser.') },
      steps: [
        {
          target: pickChip,
          prepare: async (ctx) => {
            if (document.body.dataset.pocketView === 'open') {
              pocket?.close?.()
              await until(() => !document.body.dataset.pocketView && !pocket?.state?.busy, { timeout: 4000, signal: ctx.signal })
            }
            await bringIntoView(pickChip(), ctx)
          },
          title: t('Press “Pocket it”'),
          body: () => {
            const title = titleOf(pickChip())
            return title ? t('Watch {title} peel off and drop into your pocket.', { title }) : t('Watch it peel off and drop into your pocket.')
          },
          prefer: ['bottom', 'top', ...side('left', 'right')],
          doneOnPress: true,
        },
        {
          target: () => document.querySelector('.pocket-peek[data-state="shown"]'),
          prepare: (ctx) => until(() => document.querySelector('.pocket-peek[data-state="shown"]') && !pocket?.state?.flights?.size, { timeout: 6000, signal: ctx.signal }),
          title: t('Now open your pocket'),
          body: t('The corner lifted because you kept something. Press it to turn the page.'),
          prefer: side('left', 'top'),
          done: () => document.body.dataset.pocketView === 'open',
        },
        {
          target: () => [...document.querySelectorAll('.pocket-back')].find(visible) ?? null,
          prepare: (ctx) => until(() => document.body.dataset.pocketView === 'open' && !pocket?.state?.busy, { timeout: 6000, signal: ctx.signal }),
          title: t('This is your pocket'),
          body: t('Everything you keep waits here, with its link. “Back to Services” turns the page back.'),
          prefer: ['bottom', ...side('right', 'left'), 'top'],
          ack: true,
          done: () => document.body.dataset.pocketView !== 'open',
        },
      ],
    },
    reimagine: {
      feature: 'reimagine',
      success: { title: t('That’s Reimagine'), body: t('Try another view whenever you like. Every one keeps the same services.') },
      steps: [
        {
          target: () => document.querySelector('.aixc-launcher:not([hidden])'),
          prepare: async (ctx) => {
            if (document.body.dataset.aixcView === 'reimagined') document.querySelector('.aixc-viewbar .aixc-seg[aria-pressed="false"]')?.click()
            window.scrollTo({ top: 0, behavior: ctx.reduced ? 'auto' : 'smooth' })
            await sleep(ctx.reduced ? 0 : 350)
          },
          title: t('Press “Reimagine this page”'),
          body: t('It opens the ready-made views.'),
          prefer: ['bottom', ...side('left'), 'top'],
          done: () => document.querySelector('.aixc-launcher')?.getAttribute('aria-expanded') === 'true',
        },
        {
          target: () => document.querySelector('#aixc-composer:not([hidden]) [data-template="coverflow"]'),
          prepare: (ctx) => until(() => visible(document.querySelector('#aixc-composer [data-template="coverflow"]')), { timeout: 3000, signal: ctx.signal }),
          title: t('Pick “{name}”', { name: templateName }),
          body: t('Or any other view. One click, no AI call.'),
          prefer: [...side('left', 'right'), 'bottom', 'top'],
          done: () => document.body.dataset.aixcView === 'reimagined',
        },
        {
          target: () => document.querySelector('.aixc-viewbar:not([hidden]) .aixc-seg'),
          prepare: (ctx) => sleep(ctx.reduced ? 100 : 900),
          title: t('Switch back any time'),
          body: t('“Original” brings back the familiar page; “Reimagined” returns to this view.'),
          prefer: ['bottom', 'top'],
          ack: true,
          done: () => document.body.dataset.aixcView === 'original',
        },
      ],
    },
    journey: {
      feature: 'journey',
      success: { title: t('That’s your journey'), body: t('It stays in this browser. Pause or clear it from your journey whenever you like.') },
      steps: [
        {
          target: journeyPill,
          prepare: async (ctx) => {
            window.scrollTo({ top: 0, behavior: ctx.reduced ? 'auto' : 'smooth' })
            await sleep(ctx.reduced ? 0 : 300)
          },
          title: t('Press “Your journey”'),
          body: t('See the pages you visited, what you explored and the questions they lead to. The first time, it asks before remembering anything.'),
          prefer: ['bottom', ...side('left'), 'top'],
          doneOnPress: true,
        },
      ],
    },
  }
}

/**
 * The coach: one layer (scrim, ring, popover) that runs one flow at a time.
 * `run(flow)` resolves to 'done' | 'exit' | 'missing'.
 */
export const createCoach = ({ t, rtl, isReduced = () => false, featureIcon, onBackToTips }) => {
  const layer = make('div', 'tips-coach')
  layer.dataset.vg = '' // never part of a recorded journey (voice-guide SPEC-06)
  layer.style.zIndex = String(LAYER_Z)
  layer.hidden = true
  const scrim = document.createElementNS(SVG_NS, 'svg')
  scrim.setAttribute('class', 'tips-coach__scrim')
  scrim.setAttribute('aria-hidden', 'true')
  const scrimShape = document.createElementNS(SVG_NS, 'path')
  scrimShape.setAttribute('fill-rule', 'evenodd')
  scrim.append(scrimShape)
  const ring = make('div', 'tips-coach__ring')
  ring.setAttribute('aria-hidden', 'true')
  const pulse = make('div', 'tips-coach__pulse')
  ring.append(pulse)

  const disc = make('span', 'tips-pop__disc')
  const title = make('h2', 'tips-pop__title')
  title.id = 'tips-pop-title'
  title.tabIndex = -1
  const body = make('p', 'tips-pop__body')
  body.id = 'tips-pop-body'
  const closeButton = make('button', 'tips-pop__close', icon('close'))
  closeButton.type = 'button'
  closeButton.setAttribute('aria-label', t('Close'))
  const count = make('span', 'tips-pop__count')
  const secondary = make('button', 'tips-btn tips-btn--ghost')
  secondary.type = 'button'
  const primary = make('button', 'tips-btn tips-btn--primary')
  primary.type = 'button'
  const arrow = make('span', 'tips-pop__arrow')
  arrow.setAttribute('aria-hidden', 'true')
  const pop = make(
    'section',
    'tips-pop',
    arrow,
    make('header', 'tips-pop__head', disc, title, closeButton),
    body,
    make('footer', 'tips-pop__foot', count, make('span', 'tips-pop__actions', secondary, primary)),
  )
  pop.setAttribute('role', 'dialog')
  pop.setAttribute('aria-modal', 'false')
  pop.setAttribute('aria-labelledby', title.id)
  pop.setAttribute('aria-describedby', body.id)
  pop.dir = rtl ? 'rtl' : 'ltr'
  const live = make('p', 'aixc-sr-only')
  live.setAttribute('role', 'status')
  live.setAttribute('aria-live', 'polite')
  layer.append(scrim, ring, pop, live)
  document.body.append(layer)

  let run = null // { abort, step, target, resolve }
  let raf = 0
  let lastPath = ''
  let pressed = false
  let successTimer = 0

  const viewport = () => ({ width: document.documentElement.clientWidth, height: window.innerHeight })

  const draw = () => {
    raf = 0
    if (!run) return
    const vp = viewport()
    scrim.setAttribute('viewBox', `0 0 ${vp.width} ${vp.height}`)
    const target = run.step?.target?.() ?? null
    if (target !== run.target) attachTarget(target)
    const targetBox = target && visible(target) ? box(target.getBoundingClientRect()) : null
    const holes = []
    if (targetBox && run.mode === 'step') {
      const round = (() => {
        const r = parseFloat(getComputedStyle(target).borderTopLeftRadius) || 0
        return Math.abs(targetBox.width - targetBox.height) < 4 && r >= targetBox.width / 2 - 1
      })()
      const hole = inflate(targetBox, 8)
      hole.radius = round ? hole.width / 2 : 14
      holes.push(hole)
      Object.assign(ring.style, {
        left: `${hole.left}px`,
        top: `${hole.top}px`,
        width: `${hole.width}px`,
        height: `${hole.height}px`,
        borderRadius: `${hole.radius}px`,
      })
      ring.hidden = false
    } else {
      ring.hidden = true
    }
    const widget = a11yWidget()
    if (widget && visible(widget)) {
      const hole = inflate(box(widget.getBoundingClientRect()), 4)
      hole.radius = hole.width / 2
      holes.push(hole)
    }
    const path = run.mode === 'step' ? scrimPath(vp, holes) : ''
    if (path !== lastPath) {
      scrimShape.setAttribute('d', path)
      lastPath = path
    }
    // The popover beside the control, or above the Tips button when there is none to point at.
    const size = { width: pop.offsetWidth, height: pop.offsetHeight }
    let place
    if (targetBox && run.mode === 'step') {
      const avoid = floatingControls()
        .filter((el) => el !== target && !el.contains(target))
        .map((el) => inflate(box(el.getBoundingClientRect()), 6))
      place = placePopover(targetBox, size, vp, { prefer: run.step.prefer, avoid })
      pop.dataset.side = place.side
      arrow.hidden = false
      arrow.style.setProperty('--arrow', `${place.arrow}px`)
    } else {
      const anchor = document.querySelector('.tips-entry')
      const a = anchor && visible(anchor) ? anchor.getBoundingClientRect() : { left: 16, top: vp.height - 16, height: 0 }
      place = { x: Math.max(12, Math.min(a.left, vp.width - size.width - 12)), y: Math.max(12, a.top - size.height - 12) }
      delete pop.dataset.side
      arrow.hidden = true
    }
    pop.style.transform = `translate(${place.x}px, ${place.y}px)`
    raf = requestAnimationFrame(draw)
  }

  // A press on the control: listened to on the control itself (it may live in the guide's shadow root).
  let detach = null
  const attachTarget = (target) => {
    detach?.()
    detach = null
    run.target = target
    if (!target) return
    const onPress = () => {
      pressed = true
    }
    target.addEventListener('click', onPress, true)
    target.addEventListener('pointerdown', onPress, true)
    detach = () => {
      target.removeEventListener('click', onPress, true)
      target.removeEventListener('pointerdown', onPress, true)
    }
  }

  // Keyboard: Tab moves between the popover's buttons and the control; Esc ends the flow.
  const onKey = (event) => {
    if (!run) return
    if (event.key === 'Escape') {
      event.preventDefault()
      finish('exit')
      return
    }
    if (event.key !== 'Tab' || run.mode !== 'step') return
    const cycle = [...pop.querySelectorAll('button:not([hidden])'), run.target].filter((el) => el && visible(el))
    if (!cycle.length) return
    const active = run.target?.getRootNode?.()?.activeElement === run.target ? run.target : document.activeElement
    const index = cycle.indexOf(active)
    event.preventDefault()
    const next = cycle[(index + (event.shiftKey ? -1 : 1) + cycle.length) % cycle.length]
    next.focus({ preventScroll: true })
  }

  const show = () => {
    layer.hidden = false
    layer.classList.remove('is-leaving')
    requestAnimationFrame(() => layer.classList.add('is-on'))
  }
  const hide = () => {
    layer.classList.remove('is-on')
    layer.hidden = true
  }

  const finish = (result) => {
    if (!run) return
    const current = run
    run = null
    current.abort.abort()
    detach?.()
    detach = null
    cancelAnimationFrame(raf)
    raf = 0
    document.removeEventListener('keydown', onKey, true)
    window.clearTimeout(successTimer)
    hide()
    current.resolve(result)
  }

  const setStep = (flow, index, step) => {
    disc.replaceChildren(icon(featureIcon(flow.feature)))
    disc.classList.remove('is-ok')
    title.textContent = step.title
    body.textContent = typeof step.body === 'function' ? step.body() : step.body
    count.textContent = flow.steps.length > 1 ? t('Step {n} of {total}', { n: index + 1, total: flow.steps.length }) : ''
    secondary.textContent = t('Skip')
    secondary.hidden = false
    primary.textContent = t('Got it')
    primary.hidden = !step.ack
    pop.classList.remove('is-success')
    pop.classList.add('is-step')
    live.textContent = `${step.title}. ${body.textContent}`
  }

  const showSuccess = (flow) =>
    new Promise((resolve) => {
      run.mode = 'success'
      ring.hidden = true
      disc.replaceChildren(icon('check'))
      disc.classList.add('is-ok')
      title.textContent = flow.success.title
      body.textContent = flow.success.body
      count.textContent = ''
      secondary.textContent = t('Done')
      primary.textContent = t('Back to tips')
      primary.hidden = false
      secondary.hidden = false
      pop.classList.remove('is-step')
      pop.classList.add('is-success')
      live.textContent = `${flow.success.title}. ${flow.success.body}`
      layer.classList.add('is-passive')
      cancelAnimationFrame(raf)
      raf = 0
      draw()
      const onPrimary = () => resolve('tips')
      const onSecondary = () => resolve('done')
      primary.onclick = onPrimary
      secondary.onclick = onSecondary
      // Leaves by itself so it never lingers over the page.
      successTimer = window.setTimeout(() => resolve('done'), 9000)
    })

  /** Runs a flow; resolves when it ends. */
  const runFlow = (flow) =>
    new Promise(async (resolve) => {
      if (run) finish('exit')
      const abort = new AbortController()
      run = { abort, step: null, target: null, resolve, mode: 'step' }
      const ctx = { signal: abort.signal, reduced: isReduced() }
      document.addEventListener('keydown', onKey, true)
      layer.classList.remove('is-passive')
      closeButton.onclick = () => finish('exit')
      secondary.onclick = () => finish('exit')
      try {
        for (let index = 0; index < flow.steps.length; index += 1) {
          const step = flow.steps[index]
          await step.prepare?.(ctx)
          if (abort.signal.aborted) return
          const ready = await until(() => visible(step.target?.()), { timeout: 2500, signal: abort.signal })
          if (abort.signal.aborted) return
          if (!ready) return finish(index === 0 ? 'missing' : 'exit')
          run.step = step
          run.mode = 'step'
          pressed = false
          setStep(flow, index, step)
          let acknowledged = false
          primary.onclick = () => {
            acknowledged = true
          }
          if (layer.hidden) show()
          // Place it now, so it never shows a frame at the corner of the screen.
          cancelAnimationFrame(raf)
          raf = 0
          draw()
          await nextFrame()
          title.focus({ preventScroll: true })
          const ok = await until(() => acknowledged || (step.doneOnPress ? pressed : false) || Boolean(step.done?.()), { timeout: 10 * 60 * 1000, signal: abort.signal })
          if (!ok || abort.signal.aborted) return
        }
        const choice = await showSuccess(flow)
        if (!run) return
        finish(choice === 'tips' ? 'tips' : 'done')
        if (choice === 'tips') onBackToTips?.(flow.feature)
      } catch (error) {
        console.warn('[tips] the coach stopped:', error)
        finish('exit')
      }
    })

  return {
    run: runFlow,
    stop: () => finish('exit'),
    isRunning: () => Boolean(run),
    destroy: () => {
      finish('exit')
      layer.remove()
    },
  }
}
