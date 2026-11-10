/**
 * The RED world's content and behaviour: the hero, the spotlight (the sheet's first section, which
 * shows one topic at a time: a Dock category or another part of the world), the compact bento of
 * the other topics under it (./topics.js ranks them), and what each press does. Loaded the first
 * time the end of the album comes into view (./index.js).
 *
 * Choosing a topic (a Dock icon, a tile, a widget metric) condenses the hero to a slim band and
 * swaps the spotlight's content in place, so the sheet stays focused instead of listing every
 * offer at once.
 *
 * Every action goes through the store, so the hero's counter, the cards and the status widget
 * change together. Details open in a native <dialog> (a bottom sheet on phones), feedback comes
 * as a short toast that is also announced.
 */

import { make } from '../pocket/pocket.js'
import { PLANS, PROFILES, planById } from './data.js'
import { addDays, formatEventDate, formatNumber } from './engine.js'
import { hero, renderTopic, topicArt, topicTile } from './components.js'
import { bentoSpans, rankTopics, topicById, topicFor, TOPICS } from './topics.js'
import { voucherScene } from './art.js'
import { icon } from './icons.js'
import { reducedMotion } from './motion.js'

const MORE_COLLAPSED = 7 // tiles in the bento before "Show all"
const SWAP_EASE = 'cubic-bezier(0.32, 0.72, 0, 1)'

const DEMO_PROFILES = [
  { id: 'ahmed', blurb: 'RED Advance+, loves food and music, nothing claimed yet' },
  { id: 'mariam', blurb: 'RED Elite+, a family of four, gym and fashion, a trip in December' },
  { id: 'karim', blurb: 'RED Advance+, data almost gone, flying to Dubai next week' },
]

export const createWorld = ({ store }) => {
  let extension = null
  let body = null
  let heroTitle = null
  let heroBlock = null
  const bindings = new Set()

  /* --------------------------------------------------------- feedback */
  const toastNode = make('div', { class: 'pz-toast', role: 'status', 'aria-live': 'polite', 'data-vg': '' })
  document.body.append(toastNode)
  let toastTimer = 0
  const toast = (text) => {
    window.clearTimeout(toastTimer)
    toastNode.textContent = ''
    toastNode.classList.remove('is-shown')
    void toastNode.offsetWidth
    toastNode.textContent = text
    // Above the floating widget or the invitation when either is showing.
    toastNode.classList.toggle('is-raised', Boolean(document.querySelector('.pz-status--floating[data-floating="true"], .pz-explore.is-shown')))
    toastNode.classList.add('is-shown')
    toastTimer = window.setTimeout(() => toastNode.classList.remove('is-shown'), 3200)
  }

  /* ----------------------------------------------------- detail sheets */
  const dialog = make('dialog', { class: 'pz-dialog', 'aria-labelledby': 'pz-dialog-title', 'data-vg': '' })
  document.body.append(dialog)
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close()
  })
  dialog.addEventListener('close', () => delete document.body.dataset.pzDialog)

  const sheet = ({ eyebrow, title, art = null, body: content = [], actions = [] }) => {
    const close = make('button', { type: 'button', class: 'pz-dialog__close', 'aria-label': 'Close' }, icon('close', 'pz-dialog__close-icon'))
    close.addEventListener('click', () => dialog.close())
    dialog.replaceChildren(
      make(
        'div',
        { class: 'pz-dialog__panel' },
        make('span', { class: 'pz-dialog__grab', 'aria-hidden': 'true' }),
        make(
          'header',
          { class: 'pz-dialog__head' },
          art,
          make('div', { class: 'pz-dialog__heading' }, eyebrow ? make('p', { class: 'pz-dialog__eyebrow' }, eyebrow) : null, make('h2', { class: 'pz-dialog__title', id: 'pz-dialog-title' }, title)),
          close,
        ),
        make('div', { class: 'pz-dialog__body' }, ...content.filter(Boolean)),
        actions.length ? make('div', { class: 'pz-dialog__actions' }, ...actions.filter(Boolean)) : null,
      ),
    )
    document.body.dataset.pzDialog = 'open'
    if (!dialog.open) dialog.showModal()
    dialog.querySelector('.pz-dialog__actions .pz-btn, .pz-dialog__body input')?.focus({ preventScroll: true })
  }

  const btn = (label, onClick, variant = 'primary') => {
    const node = make('button', { type: 'button', class: `pz-btn pz-btn--${variant}` }, make('span', { class: 'pz-btn__label' }, label))
    node.addEventListener('click', onClick)
    return node
  }
  const row = (label, value) => make('div', { class: 'pz-dl__row' }, make('dt', null, label), make('dd', null, value))
  const list = (...rows) => make('dl', { class: 'pz-dl' }, ...rows)
  const artBox = (markup, className = 'pz-dialog__art') => {
    const node = make('span', { class: className, 'aria-hidden': 'true' })
    node.innerHTML = markup
    return node
  }

  const copyCode = async (code) => {
    try {
      await navigator.clipboard.writeText(code)
      toast(`Code ${code} copied.`)
    } catch {
      toast(`Your code is ${code}.`)
    }
  }

  const SHEETS = {
    invite: () => {
      const { left, total } = store.view.family
      const nameInput = make('input', { class: 'pz-field__input', id: 'pz-invite-name', name: 'name', autocomplete: 'off', placeholder: 'For example, Salma' })
      const relation = make('select', { class: 'pz-field__input', id: 'pz-invite-relation', name: 'relation' }, ['Spouse', 'Parent', 'Child', 'Sibling', 'Friend'].map((r) => make('option', null, r)))
      const send = () => {
        const event = act('invite', { member: { name: nameInput.value.trim() || 'Family member', relation: relation.value } })
        dialog.close()
        if (event) toast(`Invitation sent to ${event.member.name}. They join your plan when they accept.`)
      }
      sheet({
        eyebrow: 'Get more together',
        title: 'Share your plan with family',
        body: [
          make('p', { class: 'pz-dialog__lead' }, `${left} of ${total} family ${total === 1 ? 'spot' : 'spots'} free on ${store.view.customer.planName}. They share your minutes and data, and you pay one bill.`),
          make('div', { class: 'pz-field' }, make('label', { class: 'pz-field__label', for: 'pz-invite-name' }, 'Their name'), nameInput),
          make('div', { class: 'pz-field' }, make('label', { class: 'pz-field__label', for: 'pz-invite-relation' }, 'They are your'), relation),
          make('p', { class: 'pz-dialog__fine' }, 'A demo: nothing is sent. The invitation only changes this page.'),
        ],
        actions: [left > 0 ? btn('Send invitation', send) : btn('See RED Elite+', () => SHEETS.upgrade(), 'primary'), btn('Not now', () => dialog.close(), 'soft')],
      })
    },

    bill: () => {
      const { bill } = store.view
      const due = addDays(new Date(store.view.now), bill.dueInDays)
      sheet({
        eyebrow: bill.autoPay ? 'Auto-pay is on' : 'Auto-pay is off',
        title: bill.paid ? 'Your bill is paid' : `EGP ${formatNumber(bill.amount)} due ${bill.dueInDays <= 0 ? 'today' : `in ${bill.dueInDays} ${bill.dueInDays === 1 ? 'day' : 'days'}`}`,
        body: [
          list(row('Plan', `${store.view.customer.planName} · ${store.view.customer.price}`), row('Due date', formatEventDate(due)), row('Amount', `EGP ${formatNumber(bill.amount)}`), row('Status', bill.paid ? 'Paid, thank you' : 'Not paid yet')),
          bill.autoPay ? null : make('p', { class: 'pz-dialog__fine' }, 'Turn on auto-pay in Ana Vodafone and never miss a due date.'),
        ],
        actions: bill.paid
          ? [btn('Done', () => dialog.close())]
          : [
              btn(`Pay EGP ${formatNumber(bill.amount)}`, () => {
                act('pay')
                dialog.close()
              }),
              btn('Later', () => dialog.close(), 'soft'),
            ],
      })
    },

    plan: () => {
      const view = store.view
      const plan = planById(view.customer.planId)
      sheet({
        eyebrow: view.customer.msisdn,
        title: view.customer.planName,
        body: [
          list(
            row('Price', view.customer.price),
            row('Data', `${plan.allowances.data} GB`),
            row('Minutes', formatNumber(plan.allowances.minutes)),
            row('SMS', formatNumber(plan.allowances.sms)),
            row('Roaming', `${formatNumber(plan.allowances.roaming)} min`),
            row('Family spots', String(plan.familyCapacity)),
            row('Renews', view.customer.renews.replace('Your plan renews ', '')),
          ),
        ],
        actions: [view.upgrade ? btn('Compare with RED Elite+', () => SHEETS.upgrade()) : null, btn('Done', () => dialog.close(), 'soft')],
      })
    },

    voucher: (id) => {
      const item = store.view.items.get(id)
      if (!item) return
      const coffee = item.kind === 'partner'
      const code = make('p', { class: 'pz-code' }, item.code)
      const settle = () => {
        if (item.state === 'available') act('claim', { id, done: `${item.title}: your code is ready.` })
      }
      const state = item.state
      const body = [
        state === 'expired'
          ? make('p', { class: 'pz-dialog__lead' }, `This voucher ended on ${item.expiresLabel?.replace('Ended ', '')}. New offers from this brand arrive every month.`)
          : state === 'redeemed'
            ? make('p', { class: 'pz-dialog__lead' }, 'You used this voucher. The saving is on your receipt.')
            : make('p', { class: 'pz-dialog__lead' }, coffee ? item.redeem : `Show this code at the till or enter it at checkout. ${item.expiresLabel ? `Valid ${item.expiresLabel}.` : ''}`),
        state === 'available' || state === 'claimed' ? code : null,
        coffee ? list(...item.places.map((p) => row(p.name, `${p.distance} · ${p.hours}`))) : null,
      ]
      sheet({
        eyebrow: coffee ? item.eyebrow : item.partnerInfo?.name,
        title: item.title,
        art: coffee ? null : artBox(voucherScene(item.art)),
        body,
        actions:
          state === 'available' || state === 'claimed'
            ? [
                btn('Copy code', () => {
                  settle()
                  copyCode(item.code)
                }),
                btn('Done', () => {
                  settle()
                  dialog.close()
                }, 'soft'),
              ]
            : [btn('Done', () => dialog.close(), 'soft')],
      })
    },

    places: (id) => {
      const item = store.view.items.get(id)
      sheet({
        eyebrow: item.eyebrow,
        title: 'Where to use it',
        body: [
          make(
            'ul',
            { class: 'pz-places', role: 'list' },
            item.places.map((p) =>
              make(
                'li',
                { class: 'pz-places__row' },
                make('span', { class: 'pz-places__name' }, p.name, make('small', null, p.address)),
                make('span', { class: `pz-places__meta${p.open ? '' : ' is-closed'}` }, `${p.distance} · ${p.open ? 'Open now' : 'Closed'}`),
              ),
            ),
          ),
        ],
        actions: [btn('View vouchers', () => SHEETS.voucher(id)), btn('Done', () => dialog.close(), 'soft')],
      })
    },

    event: (id) => {
      const item = store.view.items.get(id)
      const { event } = item
      sheet({
        eyebrow: `${item.eyebrow} · ${item.title}`,
        title: event.name,
        body: [
          list(row('When', event.when.split(' · ').slice(0, 2).join(' · ')), row('Where', event.venue), row('Who', event.audience), row('Places', event.note)),
          make('p', { class: 'pz-dialog__fine' }, 'Reserving holds a spot for you; tickets are confirmed by SMS a week before.'),
        ],
        actions:
          item.state === 'available'
            ? [
                btn('Reserve my spot', () => {
                  act('claim', { id, done: 'Your spot is reserved.' })
                  dialog.close()
                  toast('Your spot is reserved. We will confirm by SMS.')
                }),
                btn('Not now', () => dialog.close(), 'soft'),
              ]
            : [btn('Done', () => dialog.close(), 'soft')],
      })
    },

    installments: () => {
      const phones = [
        ['Flagship 5G · 256 GB', 'EGP 2,499/mo'],
        ['Everyday 5G · 128 GB', 'EGP 1,249/mo'],
        ['Tablet 11″ · Wi-Fi + 5G', 'EGP 999/mo'],
      ]
      sheet({
        eyebrow: 'RED Installments',
        title: 'Phones you can split on your bill',
        body: [
          make('p', { class: 'pz-dialog__lead' }, '24 months, 0% interest, no down payment and no hidden fees, added to your monthly RED bill.'),
          list(...phones.map(([name, price]) => row(name, price))),
        ],
        actions: [
          btn('Ask for a call back', () => {
            dialog.close()
            toast('A RED advisor will call you within a day.')
          }),
          btn('Not now', () => dialog.close(), 'soft'),
        ],
      })
    },

    upgrade: () => {
      const [from, to] = PLANS
      const cell = (value) => make('td', null, value)
      const table = make(
        'table',
        { class: 'pz-compare' },
        make('thead', null, make('tr', null, make('th', { scope: 'col' }, make('span', { class: 'aixc-sr-only' }, 'Feature')), make('th', { scope: 'col' }, from.name), make('th', { scope: 'col' }, to.name))),
        make(
          'tbody',
          null,
          [
            ['Price', `EGP ${from.priceEGP}/mo`, `EGP ${to.priceEGP}/mo`],
            ['Data', `${from.allowances.data} GB`, `${to.allowances.data} GB`],
            ['Family spots', String(from.familyCapacity), String(to.familyCapacity)],
            ['Entertainment spots', String(from.entertainmentSpots), String(to.entertainmentSpots)],
            ['YouTube Premium', '—', 'Included'],
          ].map(([label, a, b]) => make('tr', null, make('th', { scope: 'row' }, label), cell(a), cell(b))),
        ),
      )
      const item = store.view.upgrade
      sheet({
        eyebrow: 'Upgrade · RED Elite+',
        title: 'Share with up to 5, not just 2',
        body: [table, item?.reasons?.[0] ? make('p', { class: 'pz-why' }, icon('sparkle', 'pz-why__icon'), item.reasons[0]) : null],
        actions:
          item?.state === 'available'
            ? [
                btn('Request upgrade', () => {
                  act('upgrade')
                  dialog.close()
                }),
                btn('Not now', () => dialog.close(), 'soft'),
              ]
            : [btn('Done', () => dialog.close(), 'soft')],
      })
    },

    why: () => {
      const view = store.view
      const profile = PROFILES[store.profileId]
      const signals = Object.entries(profile.signals ?? {}).filter(([key]) => (profile.affinity?.[key] ?? 0) >= 0.5)
      // Why each topic is here, in the order the sheet shows them; topics sharing a reason share a row.
      const reasons = []
      for (const topic of rankTopics(view).filter((t) => t.reason)) {
        const same = reasons.find((r) => r.reason === topic.reason)
        if (same) same.labels.push(topic.label)
        else reasons.push({ labels: [topic.label], reason: topic.reason })
      }
      sheet({
        eyebrow: `Personalised for ${view.customer.firstName}`,
        title: 'Why you see these',
        body: [
          make('p', { class: 'pz-dialog__lead' }, 'Topics are ordered by simple rules: what your plan includes but you have not switched on, free family and entertainment spots, vouchers about to expire, what you are into, allowances running low and trips coming up.'),
          make('h3', { class: 'pz-dialog__subhead' }, 'What it noticed'),
          make('ul', { class: 'pz-signals', role: 'list' }, signals.map(([, text]) => make('li', null, icon('sparkle', 'pz-signals__icon'), text))),
          make('h3', { class: 'pz-dialog__subhead' }, 'Why each topic is here'),
          list(...reasons.slice(0, 6).map((r) => row(r.labels.join(', '), r.reason))),
          make('p', { class: 'pz-dialog__fine' }, 'A demonstration: the rules run in this browser on sample data, and nothing leaves it.'),
          make('h3', { class: 'pz-dialog__subhead' }, 'Try another customer'),
          make(
            'ul',
            { class: 'pz-profiles', role: 'list' },
            DEMO_PROFILES.map((p) => {
              const url = new URL(window.location.href)
              url.searchParams.set('pz', p.id)
              return make(
                'li',
                null,
                make('a', { class: `pz-profiles__link${p.id === store.profileId ? ' is-current' : ''}`, href: url.toString(), 'aria-current': p.id === store.profileId ? 'true' : null }, make('strong', null, PROFILES[p.id].firstName), make('span', null, p.blurb)),
              )
            }),
          ),
        ],
        actions: [
          btn('Reset this demo', () => {
            store.reset()
            dialog.close()
            toast('Demo reset: everything is unclaimed again.')
          }, 'soft'),
          btn('Done', () => dialog.close()),
        ],
      })
    },
  }

  const open = (kind, id) => SHEETS[kind]?.(id)

  /* ---------------------------------------------------------- actions */
  function act(action, payload = {}) {
    switch (action) {
      case 'activate': {
        const event = store.activate(payload.id)
        if (event) toast(payload.done ?? 'Activated.')
        return event
      }
      case 'claim': {
        const event = store.claim(payload.id)
        if (event && payload.done) toast(payload.done)
        return event
      }
      case 'invite':
        return store.invite(payload.member)
      case 'points': {
        const event = store.redeemPoints()
        const p = store.view.points
        if (event) toast(`EGP ${event.value} voucher ready in your Wallet · ${formatNumber(p.balance)} points left.`)
        else if (p) toast(`${formatNumber(p.perVoucher - p.balance)} more points for your next voucher.`)
        return event
      }
      case 'pay': {
        const event = store.payBill()
        if (event) toast('Paid. Thank you!')
        return event
      }
      case 'upgrade': {
        const event = store.requestUpgrade()
        if (event) toast('Upgrade requested. RED Elite+ starts on your renewal date.')
        return event
      }
      case 'bill':
        return open('bill')
      case 'plan':
        return open('plan')
      default:
        return null
    }
  }

  const ctx = {
    store,
    bind: (fn) => {
      bindings.add(fn)
      fn(store.view, null)
      return fn
    },
    act,
    open,
    toast,
    goTo: (target) => goTo(target),
  }

  /* ------------------------------------------------- the spotlight */
  let active = null
  let moreOpen = false
  const topicNodes = new Map() // topic id → its content, built once (its bindings keep it current)
  const cells = new Map() // topic id → its tile's cell in the bento

  const spotIcon = make('span', { class: 'pz-spotlight__icon', 'aria-hidden': 'true' })
  const spotLabel = make('span', { class: 'pz-spotlight__label' })
  const spotStage = make('div', { class: 'pz-spotlight__stage' })
  const spotlight = make(
    'section',
    { class: 'pz-spotlight', 'data-pz-section': 'spotlight', tabindex: '-1' },
    make('p', { class: 'pz-spotlight__eyebrow' }, spotIcon, make('span', { class: 'pz-spotlight__kicker' }, 'In focus'), spotLabel),
    spotStage,
  )

  const moreGrid = make('div', { class: 'pz-more__grid', role: 'list' })
  const moreToggle = make('button', { type: 'button', class: 'pz-more__toggle', 'aria-expanded': 'false' })
  moreToggle.addEventListener('click', () => {
    moreOpen = !moreOpen
    const before = snapTiles()
    layoutMore()
    playTiles(before)
  })
  const more = make(
    'section',
    { class: 'pz-more', 'data-pz-section': 'more', 'aria-labelledby': 'pz-more-title' },
    make('header', { class: 'pz-more__head' }, make('h3', { class: 'pz-more__title', id: 'pz-more-title' }, 'More for you'), make('p', { class: 'pz-more__subtitle' }, 'Pick one to bring it into focus')),
    moreGrid,
    moreToggle,
  )

  const cellFor = (topic) => {
    if (!cells.has(topic.id)) cells.set(topic.id, make('div', { class: 'pz-more__cell', role: 'listitem' }, topicTile(topic, ctx, (id) => select(id, { from: 'tile' }))))
    return cells.get(topic.id)
  }

  /** The bento: every other topic, best first; the first few take two columns so rows close. */
  function layoutMore() {
    const ranked = rankTopics(store.view).filter((topic) => topic.id !== active)
    const shown = moreOpen ? ranked : ranked.slice(0, MORE_COLLAPSED)
    const narrow = bentoSpans(shown.length, 2)
    const wide = bentoSpans(shown.length, 4)
    const nodes = shown.map((topic, i) => {
      const cell = cellFor(topic)
      // Spans as properties (the grid reads them); "wide" as attributes (the tile's layout reads them).
      cell.style.setProperty('--span-m', String(narrow[i]))
      cell.style.setProperty('--span-d', String(wide[i]))
      cell.toggleAttribute('data-wide-m', narrow[i] > 1)
      cell.toggleAttribute('data-wide-d', wide[i] > 1)
      return cell
    })
    // Moving a focused tile would drop its focus: only children that changed place are moved.
    nodes.forEach((cell, i) => {
      if (moreGrid.children[i] !== cell) moreGrid.insertBefore(cell, moreGrid.children[i] ?? null)
    })
    while (moreGrid.children.length > nodes.length) moreGrid.lastElementChild.remove()
    moreToggle.hidden = ranked.length <= MORE_COLLAPSED
    moreToggle.textContent = moreOpen ? 'Show fewer' : `Show all ${ranked.length}`
    moreToggle.setAttribute('aria-expanded', String(moreOpen))
  }

  /** Where each tile is, relative to the bento (the hero condensing above must not count). */
  const snapTiles = () => {
    const origin = moreGrid.getBoundingClientRect()
    return new Map([...moreGrid.children].map((cell) => {
      const r = cell.getBoundingClientRect()
      return [cell, { x: r.left - origin.left, y: r.top - origin.top }]
    }))
  }

  /** Tiles glide from where they were to their new places; new ones fade in. */
  const playTiles = (before) => {
    if (reducedMotion()) return
    const after = snapTiles()
    for (const [cell, now] of after) {
      const was = before.get(cell)
      if (!was) cell.animate([{ opacity: 0, scale: 0.94 }, { opacity: 1, scale: 1 }], { duration: 320, delay: 100, easing: SWAP_EASE, fill: 'backwards' })
      else if (Math.abs(was.x - now.x) + Math.abs(was.y - now.y) > 1) cell.animate([{ translate: `${was.x - now.x}px ${was.y - now.y}px` }, { translate: '0 0' }], { duration: 420, easing: SWAP_EASE })
    }
  }

  /** A topic's content, built once; null when this customer has nothing to show for it. */
  const contentOf = (id) => {
    if (!topicById(id)) return null
    if (!topicNodes.has(id)) {
      const node = renderTopic(id, ctx)
      if (!node) return null
      topicNodes.set(id, node)
    }
    return topicNodes.get(id)
  }

  /** Puts a topic's content in the spotlight (no animation, no scroll); false if it has none. */
  function place(id) {
    const topic = topicById(id)
    if (!contentOf(id)) return false
    active = id
    spotlight.dataset.topic = id
    spotLabel.textContent = topic.label
    spotIcon.replaceChildren(topicArt(topic, 'pz-spotlight__art'))
    spotlight.setAttribute('aria-label', `In focus: ${topic.label}`)
    spotStage.replaceChildren(topicNodes.get(id))
    extension?.markDock?.(id)
    return true
  }

  /** Before the world opens: a Dock category (with the hero condensed), or the best topic. */
  const prepare = (target) => {
    if (!body) return
    const id = target ? topicFor(target) : null
    const chosen = Boolean(id) && place(id)
    heroBlock.classList.toggle('is-condensed', chosen)
    if (!chosen) rankTopics(store.view).some((topic) => place(topic.id))
    layoutMore()
  }

  const condense = () => {
    if (heroBlock.classList.contains('is-condensed')) return null
    const from = heroBlock.offsetHeight
    heroBlock.classList.add('is-condensed')
    return { from, to: heroBlock.offsetHeight }
  }

  /**
   * Brings a topic into the spotlight: the hero condenses, the content swaps in place (sliding in
   * from the side of its Dock icon), the bento re-lays, and the page settles with the Dock and the
   * spotlight in view. Everything is measured in its final state first, then animated from where
   * it was.
   */
  function select(target, { from = 'code', focus = from === 'tile' } = {}) {
    if (!body) return
    const id = topicFor(target)
    if (!id || !contentOf(id)) return
    const previous = active
    const stageFrom = spotStage.offsetHeight
    const tilesBefore = snapTiles()
    const hero = condense()
    const changed = id !== previous
    if (changed) {
      place(id)
      layoutMore()
    }
    const stageTo = spotStage.offsetHeight
    const glide = extension?.focusSpot?.(spotlight)
    // A pressed tile has left the bento (and a widget metric is left behind): focus goes to what
    // it brought into view.
    if (focus) spotlight.focus({ preventScroll: true })
    if (changed) extension?.announce?.(`${topicById(id).label} is in focus.`)
    if (reducedMotion()) return glide

    if (hero) {
      heroBlock.animate([{ height: `${hero.from}px` }, { height: `${hero.to}px` }], { duration: 460, easing: SWAP_EASE })
      heroBlock.querySelector('.pz-hero__inner')?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260, delay: 120, easing: 'ease', fill: 'backwards' })
    }
    if (changed) {
      const order = (topicId) => TOPICS.findIndex((t) => t.id === topicId)
      const side = previous && order(id) < order(previous) ? -1 : 1
      spotStage.animate([{ height: `${stageFrom}px`, overflowY: 'clip' }, { height: `${stageTo}px`, overflowY: 'clip' }], { duration: 420, easing: SWAP_EASE })
      spotStage.firstElementChild?.animate([{ opacity: 0, translate: `${side * 28}px 0` }, { opacity: 1, translate: '0 0' }], { duration: 380, delay: 40, easing: SWAP_EASE, fill: 'backwards' })
      spotIcon.animate([{ scale: 0.6, opacity: 0 }, { scale: 1, opacity: 1 }], { duration: 320, easing: SWAP_EASE })
      playTiles(tilesBefore)
    }
    return glide
  }

  /* ------------------------------------------------------------- mount */
  const mount = (host) => {
    extension = host.extension
    body = host.body
    const why = make('button', { type: 'button', class: 'pz-bar__why', 'aria-haspopup': 'dialog' }, icon('info', 'pz-bar__why-icon'), make('span', { class: 'pz-bar__why-label' }, 'Why these?'))
    why.addEventListener('click', () => open('why'))
    host.barEnd.append(why)
    heroBlock = hero(ctx)
    heroTitle = heroBlock.querySelector('.pz-hero__title')
    body.replaceChildren(heroBlock, make('div', { class: 'pz-sections' }, spotlight, more))
    prepare(null)
    store.subscribe((view, event) => {
      for (const fn of bindings) fn(view, event)
      // Topics arrive, leave and re-rank as things are claimed: the bento follows (only moved
      // tiles animate; a focused tile that stays keeps its focus).
      const before = snapTiles()
      layoutMore()
      playTiles(before)
    })
  }

  /**
   * From a widget metric, a chip or a card: a card already in the spotlight is scrolled to;
   * anything else brings its topic into the spotlight.
   */
  function goTo(target) {
    if (!body) return
    // A press from the widget is left behind (the panel closes, the docked widget scrolls away):
    // focus then follows to what comes into view.
    const origin = document.activeElement
    const leftBehind = !origin?.isConnected || origin === document.body || Boolean(origin.closest?.('.pz-status')) || origin.checkVisibility?.() === false
    const node = spotStage.querySelector(`[data-pz-anchor="${target}"]`) ?? spotStage.querySelector(`[data-pz-item="${target}"]`)
    if (!node) return select(target, { from: 'link', focus: leftBehind })
    // A card inside a sideways rail is brought into the rail's view first (only the rail scrolls).
    const item = node.closest('.pz-rail__item')
    const rail = item?.parentElement?.closest('.pz-rail')
    if (rail && rail.scrollWidth > rail.clientWidth) rail.scrollTo({ left: item.offsetLeft - rail.firstElementChild.offsetLeft, behavior: reducedMotion() ? 'auto' : 'smooth' })
    if (leftBehind) {
      if (!node.hasAttribute('tabindex')) node.setAttribute('tabindex', '-1')
      node.focus({ preventScroll: true })
    }
    return extension?.reveal(node)
  }

  return {
    mount,
    goTo,
    prepare,
    select,
    get topic() {
      return active
    },
    act,
    open,
    focusTarget: () => heroTitle,
    openAnnouncement: () => {
      const { claimed, total } = store.view.progress
      return `Your RED world is open. ${claimed} of ${total} benefits claimed. Press Escape to go back to your pocket.`
    },
  }
}

