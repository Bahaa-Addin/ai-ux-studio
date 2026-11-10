/**
 * The customer status widget: the account at a glance, in the manner of a live activity.
 *
 * A separate layer with its own lifecycle, not part of the sheet. It has two presentations of
 * one model, like a live activity has an expanded and a compact form:
 *
 *   docked    in the "well", the dedicated space above the RED world while it peeks. It sits in
 *             the page's flow, so it moves with the scroll natively (no scroll-linked jitter).
 *   floating  a compact pill fixed to the bottom once the dock has scrolled away; it expands into
 *             the full card and collapses again (Esc, outside press, or the pill).
 *
 * The extension decides where it is (materialize / dematerialize / setFloating); the widget
 * decides how it looks. Each metric is a button: it navigates (onNavigate) or opens something
 * (onAction); its pointer events never reach the sheet's drag handle.
 */

import { make } from '../pocket/pocket.js'
import { icon } from './icons.js'
import { reducedMotion } from './motion.js'

const PRIMARY = new Set(['minutes', 'sms', 'data', 'dsl'])

export const createStatusWidget = ({ store, onNavigate, onAction }) => {
  let view = store.view
  const cells = new Map() // metric id → [{ value, unit, caption, bar, button }] (one per presentation)

  /* ---------------------------------------------------------- building */
  const metricButton = (metric, index) => {
    const value = make('span', { class: 'pz-metric__value' })
    const unit = make('span', { class: 'pz-metric__unit' })
    const caption = make('span', { class: 'pz-metric__caption' })
    const bar = make('span', { class: 'pz-metric__bar', 'aria-hidden': 'true' }, make('span', { class: 'pz-metric__fill' }))
    // The full label where there is room ("Mobile Internet"), the short one in tight cells ("Data").
    const label = make(
      'span',
      { class: 'pz-metric__label' },
      make('span', { class: 'pz-metric__label-full' }, metric.label),
      metric.short !== metric.label ? make('span', { class: 'pz-metric__label-short', 'aria-hidden': 'true' }, metric.short) : null,
    )
    const button = make(
      'button',
      { type: 'button', class: `pz-metric pz-metric--${metric.kind} pz-metric--${metric.id}`, 'data-metric': metric.id, style: { '--i': String(index) } },
      make('span', { class: 'pz-metric__icon', 'aria-hidden': 'true' }, icon(metric.icon, 'pz-metric__glyph')),
      make('span', { class: 'pz-metric__text' }, make('span', { class: 'pz-metric__figure' }, value, unit), caption, label),
      metric.kind === 'usage' ? bar : null,
    )
    // A press on a metric is the metric's, never the start of a sheet drag.
    button.addEventListener('pointerdown', (event) => event.stopPropagation())
    button.addEventListener('click', () => {
      closePanel({ focus: false })
      if (metric.action) onAction(metric.action, metric)
      else onNavigate(metric.target, metric)
    })
    const entry = { metric, value, unit, caption, bar, button }
    if (!cells.has(metric.id)) cells.set(metric.id, [])
    cells.get(metric.id).push(entry)
    return make('li', { class: `pz-status__cell${PRIMARY.has(metric.id) ? '' : ' pz-status__cell--account'}` }, button)
  }

  const identity = make('div', { class: 'pz-status__who' })
  const composition = (metrics, { withIdentity = false } = {}) => {
    const primary = metrics.filter((m) => PRIMARY.has(m.id))
    const account = metrics.filter((m) => !PRIMARY.has(m.id))
    let i = 0
    return [
      withIdentity ? identity : null,
      make('ul', { class: 'pz-status__primary', role: 'list' }, primary.map((m) => metricButton(m, i++))),
      account.length ? make('ul', { class: 'pz-status__account', role: 'list' }, account.map((m) => metricButton(m, i++))) : null,
    ]
  }

  const sheen = () => make('span', { class: 'pz-status__sheen', 'aria-hidden': 'true' })

  const docked = make(
    'section',
    { class: 'pz-status pz-status--docked', 'data-show': 'none', 'aria-label': 'Your account at a glance' },
    make('div', { class: 'pz-status__surface' }, sheen(), ...composition(view.glance, { withIdentity: true })),
  )

  const panelId = 'pz-status-panel'
  const panel = make(
    'div',
    { class: 'pz-status__panel', id: panelId, hidden: true },
    make('div', { class: 'pz-status__surface' }, ...composition(view.glance)),
  )
  const pillMetrics = make('span', { class: 'pz-status__pill-metrics' })
  const pill = make(
    'button',
    { type: 'button', class: 'pz-status__pill', 'aria-expanded': 'false', 'aria-controls': panelId, 'aria-label': 'Your account at a glance. Show details' },
    make('span', { class: 'pz-status__live', 'aria-hidden': 'true' }),
    pillMetrics,
    make('span', { class: 'pz-status__pill-more', 'aria-hidden': 'true' }, icon('chevronUp', 'pz-status__pill-icon')),
  )
  const floating = make('aside', { class: 'pz-status pz-status--floating', 'data-floating': 'false', 'aria-label': 'Your account at a glance', inert: true }, panel, pill)
  document.body.append(floating)

  /* ---------------------------------------------------------- updating */
  const renderIdentity = () => {
    identity.replaceChildren(
      make('span', { class: 'pz-status__avatar', 'aria-hidden': 'true' }, view.customer.firstName.slice(0, 1)),
      make(
        'span',
        { class: 'pz-status__id' },
        make('span', { class: 'pz-status__name' }, `${view.customer.firstName}’s line`),
        make('span', { class: 'pz-status__plan' }, make('span', { class: 'pz-status__live', 'aria-hidden': 'true' }), view.customer.planName),
      ),
    )
  }

  const renderPill = () => {
    pillMetrics.replaceChildren(
      ...view.glance
        .filter((m) => PRIMARY.has(m.id))
        .map((m) =>
          make(
            'span',
            { class: `pz-status__pill-metric${m.tone ? ` is-${m.tone}` : ''}` },
            icon(m.icon, 'pz-status__pill-glyph'),
            make('span', { class: 'pz-status__pill-value' }, m.display),
            make('span', { class: 'pz-status__pill-unit' }, m.unit ?? ''),
          ),
        ),
    )
  }

  const update = (next, event) => {
    view = next
    for (const metric of view.glance) {
      for (const entry of cells.get(metric.id) ?? []) {
        const changed = entry.value.textContent !== '' && entry.value.textContent !== metric.display
        entry.value.textContent = metric.display
        entry.unit.textContent = metric.unit ?? ''
        entry.caption.textContent = metric.caption ?? ''
        entry.button.dataset.tone = metric.tone ?? ''
        entry.button.setAttribute('aria-label', `${metric.describe}. ${metric.action ? 'Open' : 'Go to details'}`)
        entry.bar.style.setProperty('--fill', String(metric.fraction ?? 0))
        if (changed && event) {
          entry.button.classList.remove('is-updated')
          void entry.button.offsetWidth
          entry.button.classList.add('is-updated')
        }
      }
    }
    renderIdentity()
    renderPill()
  }
  update(view)
  store.subscribe(update)

  /* -------------------------------------------------- presentations */
  let showTimer = 0
  /** Materialises the docked widget out of the glow (the CSS plays the sequence). */
  const materialize = () => {
    window.clearTimeout(showTimer)
    docked.dataset.show = reducedMotion() ? 'still' : 'in'
  }
  const dematerialize = ({ immediate = false } = {}) => {
    window.clearTimeout(showTimer)
    if (immediate || docked.dataset.show === 'none') {
      docked.dataset.show = 'none'
      return
    }
    docked.dataset.show = 'out'
    showTimer = window.setTimeout(() => (docked.dataset.show = 'none'), 260)
  }

  let floatingOn = false
  const setFloating = (on) => {
    if (on === floatingOn) return
    floatingOn = on
    floating.dataset.floating = String(on)
    floating.inert = !on
    if (!on) closePanel({ focus: false })
  }

  /* -------------------------------------------- the expandable panel */
  const openPanel = () => {
    panel.hidden = false
    pill.setAttribute('aria-expanded', 'true')
    pill.setAttribute('aria-label', 'Your account at a glance. Hide details')
    floating.dataset.expanded = 'true'
    panel.querySelector('.pz-metric')?.focus({ preventScroll: true })
  }
  function closePanel({ focus = true } = {}) {
    if (panel.hidden) return
    panel.hidden = true
    pill.setAttribute('aria-expanded', 'false')
    pill.setAttribute('aria-label', 'Your account at a glance. Show details')
    delete floating.dataset.expanded
    if (focus) pill.focus({ preventScroll: true })
  }
  pill.addEventListener('click', () => (panel.hidden ? openPanel() : closePanel()))
  pill.addEventListener('pointerdown', (event) => event.stopPropagation())
  document.addEventListener(
    'keydown',
    (event) => {
      if (event.key === 'Escape' && !panel.hidden && floating.contains(event.target)) {
        event.preventDefault()
        closePanel()
      }
    },
    true,
  )
  document.addEventListener('pointerdown', (event) => !panel.hidden && !floating.contains(event.target) && closePanel({ focus: false }), true)

  return {
    docked,
    floating,
    materialize,
    dematerialize,
    setFloating,
    contains: (node) => docked.contains(node) || floating.contains(node),
    get isFloating() {
      return floatingOn
    },
  }
}
