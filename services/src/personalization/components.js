/**
 * The RED world's components: one builder per section, each drawn from the engine's view model
 * (never from hard-coded offers) and each keeping itself current through `ctx.bind`, so a claim
 * in one card updates the hero's counter, the widget and every other card that shows it.
 *
 *   hero (full, or condensed to a slim band) · one topic's content for the spotlight
 *   (renderTopic: perks, offers, home, entertainment, vouchers, family, bill, coffee, events,
 *   installments, points, upgrade) · the compact tiles of the bento under it (topicTile)
 *
 * `ctx` is { store, bind, act, goTo, open (detail sheets), toast }. Every press goes through
 * ctx.act / ctx.open; nothing here changes the store directly.
 */

import { make } from '../pocket/pocket.js'
import { PARTNERS } from './data.js'
import { formatNumber } from './engine.js'
import { avatar, categoryIcon, eliteArt, mapArt, offerScene, perkScene, pointsArt, posterLights, voucherScene, zeroArt } from './art.js'
import { icon } from './icons.js'
import { rankTopics, topicById } from './topics.js'

const SVG_NS = 'http://www.w3.org/2000/svg'

/* ---------------------------------------------------------------- helpers */

const artSpan = (markup, className) => {
  const node = make('span', { class: className, 'aria-hidden': 'true' })
  node.innerHTML = markup
  return node
}

const useMark = (className, symbol = 'icon-vodafone-logo-white') => {
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('class', className)
  svg.setAttribute('aria-hidden', 'true')
  svg.setAttribute('focusable', 'false')
  svg.setAttribute('viewBox', symbol === 'icon-vodafone-logo' ? '0 0 48 48' : '0 0 36 36')
  const use = document.createElementNS(SVG_NS, 'use')
  use.setAttribute('href', `#${symbol}`)
  svg.append(use)
  return svg
}

const STATE_LABEL = {
  active: 'Active',
  claimed: 'Claimed',
  redeemed: 'Redeemed',
  expired: 'Expired',
  locked: 'Upgrade to unlock',
  full: 'All spots in use',
  requested: 'Requested',
}

const badge = (state) => (STATE_LABEL[state] ? make('span', { class: `pz-badge pz-badge--${state}` }, state === 'active' || state === 'claimed' ? icon('check', 'pz-badge__icon') : null, STATE_LABEL[state]) : null)

/** "Because …": the engine's strongest reason for showing this card. */
const why = (item) => (item?.reasons?.[0] ? make('p', { class: 'pz-why' }, icon('sparkle', 'pz-why__icon'), make('span', null, item.reasons[0])) : null)

/** A partner's wordmark, set in type (not the partner's logo artwork). */
export const wordmark = (partnerId, className = '') => {
  const partner = PARTNERS[partnerId]
  if (!partner) return null
  return make('span', { class: `pz-mark pz-mark--${partner.mark} ${className}`.trim(), style: { '--mark-paper': partner.paper, '--mark-ink': partner.ink } }, partner.name)
}

const sectionHead = (id, { eyebrow, title, subtitle, action }) =>
  make(
    'header',
    { class: 'pz-section__head' },
    make(
      'div',
      { class: 'pz-section__heading' },
      eyebrow ? make('p', { class: 'pz-section__eyebrow' }, eyebrow) : null,
      make('h3', { class: 'pz-section__title', id: `pz-s-${id}` }, title),
      subtitle ? make('p', { class: 'pz-section__subtitle' }, subtitle) : null,
    ),
    action ?? null,
  )

const shell = (id, head, ...children) =>
  make('section', { class: `pz-section pz-section--${id}`, 'data-pz-section': id, 'aria-labelledby': `pz-s-${id}` }, sectionHead(id, head), ...children)

const viewAll = (label, onClick) => {
  const button = make('button', { type: 'button', class: 'pz-link' }, make('span', null, label), icon('chevronRight', 'pz-link__icon'))
  button.addEventListener('click', onClick)
  return button
}

const button = (label, { variant = 'primary', onClick, describedBy, iconName } = {}) => {
  const node = make('button', { type: 'button', class: `pz-btn pz-btn--${variant}`, 'aria-describedby': describedBy ?? null }, iconName ? icon(iconName, 'pz-btn__icon') : null, make('span', { class: 'pz-btn__label' }, label))
  if (onClick) node.addEventListener('click', onClick)
  return node
}

/** Sets a call to action from an item's state: open while available, settled afterwards. */
const settle = (node, item, { openLabel = item.cta.label, settledLabel } = {}) => {
  const label = node.querySelector('.pz-btn__label')
  const available = item.state === 'available'
  label.textContent = available ? openLabel : (settledLabel ?? STATE_LABEL[item.state] ?? openLabel)
  node.classList.toggle('is-settled', !available)
  node.setAttribute('aria-disabled', String(!available && !node.dataset.keepActive))
}

/**
 * A short pulse on what just changed. A Web Animation, not a class: it never replays when a cached
 * topic is put back on the page, and a card that is not on the page is not pulsed at all.
 */
const bump = (node, peak = 1.04) => {
  if (!node.isConnected || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  node.animate([{ scale: 1 }, { scale: peak, offset: 0.35 }, { scale: 1 }], { duration: 600, easing: 'cubic-bezier(0.2, 0.9, 0.25, 1)' })
}

/* ------------------------------------------------------------------- hero */

export const hero = (ctx) => {
  const count = make('span', { class: 'pz-progress__count' })
  const short = make('span', { class: 'pz-progress__short', 'aria-hidden': 'true' })
  const fill = make('span', { class: 'pz-progress__fill' })
  const progress = make('p', { class: 'pz-progress' }, make('span', { class: 'pz-progress__track', 'aria-hidden': 'true' }, fill), count, short)
  const tier = make('span', { class: 'pz-hero__tier-name' })
  const greeting = make('p', { class: 'pz-hero__hello' })
  const block = make(
    'header',
    { class: 'pz-hero', 'data-pz-section': 'hero' },
    useMark('pz-hero__watermark'),
    make('span', { class: 'pz-hero__orb pz-hero__orb--a', 'aria-hidden': 'true' }),
    make('span', { class: 'pz-hero__orb pz-hero__orb--b', 'aria-hidden': 'true' }),
    make(
      'div',
      { class: 'pz-hero__inner' },
      make('p', { class: 'pz-hero__tier' }, make('span', { class: 'pz-hero__dot', 'aria-hidden': 'true' }), tier),
      make(
        'h2',
        { class: 'pz-hero__title', id: 'pz-hero-title', tabindex: '-1' },
        make('span', { class: 'pz-hero__full' }, 'Welcome to your ', make('br', { class: 'pz-hero__break' }), 'RED Benefits.'),
        make('span', { class: 'pz-hero__short', 'aria-hidden': 'true' }, 'Your RED Benefits'),
      ),
      make('p', { class: 'pz-hero__lead' }, 'Discover the benefits waiting for you and start saving on the things you love!'),
      make('div', { class: 'pz-hero__foot' }, progress, greeting),
    ),
  )
  ctx.bind((view, event) => {
    tier.textContent = view.customer.planName
    const { claimed, total } = view.progress
    count.textContent = `${claimed} of ${total} benefits claimed`
    short.textContent = `${claimed}/${total} claimed`
    fill.style.setProperty('--fill', String(total ? claimed / total : 0))
    greeting.textContent = `Picked for ${view.customer.firstName} from your plan, your usage and what you love.`
    if (event && /activated|claimed|invited/.test(event.type)) bump(progress, 1.1)
  })
  return block
}

/* ---------------------------------------------------------- your plan */

/** "Your plan": only the home connectivity offer (for customers with home internet). */
const planOverview = (ctx) => {
  const home = ctx.store.view.items.get('home-bonus')
  if (!home) return null
  const action = button(home.cta.label, { variant: 'soft', onClick: () => ctx.act('activate', { id: home.id, done: home.done }) })
  const homeCard = make(
    'div',
    { class: 'pz-home', 'data-pz-anchor': 'home' },
    artSpan(categoryIcon('router'), 'pz-home__art'),
    make('div', { class: 'pz-home__text' }, make('p', { class: 'pz-home__eyebrow' }, home.eyebrow), make('p', { class: 'pz-home__title' }, home.title), why(home)),
    action,
  )
  ctx.bind((v) => {
    const item = v.items.get('home-bonus')
    if (item) settle(action, item, { settledLabel: '50 GB added' })
  })
  const card = make('article', { class: 'pz-plan', 'data-pz-anchor': 'plan' }, homeCard)
  return make('section', { class: 'pz-section pz-section--plan', 'data-pz-section': 'plan', 'aria-label': 'Home connectivity' }, card)
}

const familyCard = (ctx) => {
  const faces = make('div', { class: 'pz-fam__faces' })
  const title = make('h4', { class: 'pz-fam__title' })
  const text = make('p', { class: 'pz-fam__text' })
  const add = make('button', { type: 'button', class: 'pz-plus pz-fam__add' }, icon('plus', 'pz-plus__icon'))
  add.addEventListener('click', () => ctx.open('invite'))
  const card = make('article', { class: 'pz-fam', 'data-pz-anchor': 'family' }, faces, title, text, add)
  ctx.bind((view, event) => {
    const { members, used, total, left } = view.family
    faces.replaceChildren(
      ...members.slice(0, 5).map((m, i) => artSpan(avatar(m.avatar ?? i, { size: 40, hijab: m.avatar === 2 }), 'pz-fam__face')),
      ...Array.from({ length: Math.min(left, 3) }, () => make('span', { class: 'pz-fam__slot', 'aria-hidden': 'true' }, icon('plus', 'pz-fam__slot-icon'))),
    )
    if (!members.length) faces.prepend(artSpan(avatar(5, { size: 40, beard: true }), 'pz-fam__face pz-fam__face--you'))
    title.replaceChildren(left > 0 ? 'Big family? ' : 'Your family is all here. ', make('br'), left > 0 ? 'We’ve got space.' : 'Need more room?')
    text.textContent = left > 0 ? `${used} of ${total} spots used · add up to ${left} more` : `All ${total} spots used on ${view.customer.planName}`
    add.hidden = left <= 0
    add.setAttribute('aria-label', `Invite a family member, ${left} ${left === 1 ? 'spot' : 'spots'} left`)
    if (event?.type === 'invited') bump(card)
  })
  return card
}

const entertainmentCard = (ctx) => {
  const spots = make('p', { class: 'pz-ent__spots' })
  const services = make('ul', { class: 'pz-ent__services', role: 'list' })
  const add = make('button', { type: 'button', class: 'pz-plus pz-ent__add' }, icon('plus', 'pz-plus__icon'))
  add.addEventListener('click', () => ctx.act('activate', { id: 'entertainment-pack', done: 'Yango Play added to your plan.' }))
  const card = make(
    'article',
    { class: 'pz-ent', 'data-pz-anchor': 'entertainment' },
    make('p', { class: 'pz-card__eyebrow' }, 'Entertainment'),
    spots,
    services,
    artSpan(perkScene('yango'), 'pz-ent__art'),
    add,
  )
  ctx.bind((view, event) => {
    const { used, total, left, services: list } = view.entertainment
    spots.replaceChildren(make('strong', null, `${used}/${total}`), ' spots used')
    services.replaceChildren(...list.map((s) => make('li', { class: 'pz-ent__service' }, s)))
    const pack = view.items.get('entertainment-pack')
    const open = pack?.state === 'available' && left > 0
    add.hidden = !open
    add.setAttribute('aria-label', `Add a free entertainment service, ${left} ${left === 1 ? 'spot' : 'spots'} left`)
    if (event?.id === 'entertainment-pack') bump(card)
  })
  return card
}

const lifestyleClaimCard = (ctx) => {
  const chip = make('button', { type: 'button', class: 'pz-chip pz-chip--sky' }, 'Claim Talabat!')
  chip.addEventListener('click', () => ctx.goTo('talabat-pro'))
  const logos = make(
    'ul',
    { class: 'pz-logos', role: 'list', 'aria-label': 'Partner brands' },
    ['zara', 'qanz', 'massimo', 'befit', 'stradivarius', 'talabat', 'kiko', 'mango'].map((p) => make('li', null, wordmark(p, 'pz-logos__mark'))),
  )
  const card = make(
    'article',
    { class: 'pz-claim' },
    chip,
    make('p', { class: 'pz-card__eyebrow' }, 'Lifestyle'),
    make('h4', { class: 'pz-claim__title' }, 'Claim your exclusive benefits!'),
    logos,
  )
  ctx.bind((view) => {
    chip.hidden = view.items.get('talabat-pro')?.state !== 'available'
  })
  return card
}

/** Your bill: one row, one call to action (pay while it is due and auto-pay is off, else view). */
const billCard = (ctx) => {
  if (!ctx.store.view.bill) return null
  const eyebrow = make('span', { class: 'pz-latest__eyebrow' })
  const title = make('span', { class: 'pz-latest__title' })
  const action = button('View bill', { variant: 'soft', onClick: () => ctx.open('bill') })
  action.classList.add('pz-btn--small')
  const row = make(
    'li',
    { class: 'pz-latest__row', 'data-pz-anchor': 'bill' },
    make('span', { class: 'pz-latest__icon pz-latest__icon--bill', 'aria-hidden': 'true' }, icon('bill', 'pz-latest__glyph')),
    make('span', { class: 'pz-latest__text' }, eyebrow, title),
    action,
  )
  ctx.bind((view) => {
    const { bill } = view
    if (!bill) return
    eyebrow.textContent = `EGP ${formatNumber(bill.amount)} · Auto-pay is ${bill.autoPay ? 'on' : 'off'}`
    title.textContent = bill.paid ? 'Bill paid, thank you' : bill.dueInDays <= 0 ? 'Bill due today' : `Bill due in ${bill.dueInDays} ${bill.dueInDays === 1 ? 'day' : 'days'}`
    const pay = !bill.paid && !bill.autoPay
    action.querySelector('.pz-btn__label').textContent = pay ? 'Pay now' : 'View bill'
    action.classList.toggle('pz-btn--primary', pay)
    action.classList.toggle('pz-btn--soft', !pay)
  })
  return shell('bill', { title: 'Your bill' }, make('ul', { class: 'pz-latest', role: 'list' }, row))
}

/* --------------------------------------------------- don't leave these */

const perkCard = (item, ctx) => {
  const title = make('h4', { class: 'pz-perk__title' }, item.title)
  const add = make('button', { type: 'button', class: 'pz-plus pz-perk__add' }, icon('plus', 'pz-plus__icon'))
  const done = make('span', { class: 'pz-perk__done', 'aria-hidden': 'true' }, icon('check', 'pz-perk__done-icon'))
  add.addEventListener('click', () => (item.cta.action === 'invite' ? ctx.open('invite') : ctx.act('activate', { id: item.id, done: item.done })))
  const card = make(
    'article',
    { class: `pz-perk pz-perk--${item.category}`, 'data-pz-item': item.id, 'data-pz-anchor': item.id },
    make('p', { class: 'pz-card__eyebrow' }, item.eyebrow),
    title,
    why(item),
    artSpan(perkScene(item.art), 'pz-perk__art'),
    add,
    done,
  )
  ctx.bind((view, event) => {
    const now = view.items.get(item.id)
    if (!now) return
    const open = now.state === 'available'
    card.dataset.state = now.state
    title.textContent = open ? now.title : item.id === 'family-share' ? 'Invitation sent' : now.done ?? 'Added to your plan'
    add.hidden = !open
    add.setAttribute('aria-label', `${now.cta.label}: ${now.title}`)
    if (event?.id === item.id) bump(card)
  })
  return card
}


/* ----------------------------------------------------- ready when you are */

const offerCard = (item, ctx, index) => {
  const media = item.image
    ? make('img', { class: 'pz-offer__photo', src: item.image, alt: '', loading: 'lazy', decoding: 'async' })
    : artSpan(offerScene(item.art), 'pz-offer__scene')
  const action = button(item.cta.label, { onClick: () => ctx.act('claim', { id: item.id, done: item.done }) })
  const note = make('p', { class: 'pz-offer__note', hidden: true })
  const card = make(
    'article',
    { class: `pz-offer${index === 0 ? ' pz-offer--featured' : ''}`, 'data-pz-item': item.id, 'data-pz-anchor': item.id },
    make('div', { class: 'pz-offer__media' }, media, item.partner && item.image ? wordmark(item.partner, 'pz-offer__brand') : null),
    make(
      'div',
      { class: 'pz-offer__body' },
      make('p', { class: 'pz-offer__eyebrow' }, item.eyebrow),
      make('h4', { class: 'pz-offer__title' }, item.title),
      make('p', { class: 'pz-offer__text' }, item.description),
      why(item),
      note,
      make('div', { class: 'pz-offer__actions' }, action),
    ),
  )
  ctx.bind((view, event) => {
    const now = view.items.get(item.id)
    if (!now) return
    card.dataset.state = now.state
    settle(action, now, { settledLabel: now.state === 'active' ? 'Active on your line' : 'Claimed' })
    const fresh = event?.id === item.id && event.type === 'claimed'
    note.hidden = !fresh
    if (fresh) {
      note.textContent = now.done ?? 'Claimed.'
      bump(card)
    }
  })
  return card
}

const recommended = (section, ctx) =>
  shell(
    'recommended',
    { title: section.title },
    make(
      'div',
      { class: 'pz-rail pz-rail--offers', role: 'list', style: { '--others': String(Math.max(1, section.items.length - 1)) } },
      section.items.map((item, i) => make('div', { class: 'pz-rail__item', role: 'listitem' }, offerCard(item, ctx, i))),
    ),
  )

/* ------------------------------------------------- favourite brands */

const voucherCard = (item, ctx) => {
  const status = make('span', { class: 'pz-voucher__status' })
  const action = button(item.cta.label, { variant: 'soft', onClick: () => ctx.open('voucher', item.id) })
  action.dataset.keepActive = 'true'
  const card = make(
    'article',
    { class: 'pz-voucher', 'data-pz-item': item.id, 'data-brand': item.partner },
    make('div', { class: 'pz-voucher__media' }, artSpan(voucherScene(item.art), 'pz-voucher__scene'), status),
    make('h4', { class: 'pz-voucher__title' }, item.title),
    make('p', { class: 'pz-voucher__date' }, item.expiresLabel ?? ''),
    why(item),
    action,
  )
  ctx.bind((view) => {
    const now = view.items.get(item.id)
    if (!now) return
    card.dataset.state = now.state
    status.replaceChildren(...[badge(now.state)].filter(Boolean))
    const label = action.querySelector('.pz-btn__label')
    label.textContent = { available: 'Get vouchers', claimed: 'Show code', redeemed: 'View receipt', expired: 'See what’s new' }[now.state] ?? now.cta.label
  })
  return card
}

const brands = (section, ctx) => {
  const rail = make('div', { class: 'pz-rail pz-rail--vouchers', role: 'list' }, section.items.map((item) => make('div', { class: 'pz-rail__item', role: 'listitem' }, voucherCard(item, ctx))))
  const bar = make(
    'ul',
    { class: 'pz-brandbar', role: 'list', 'aria-label': 'Brands with RED vouchers' },
    section.items.map((item) => {
      const chip = make('button', { type: 'button', class: 'pz-brandbar__chip', 'aria-label': `Show the ${PARTNERS[item.partner]?.name ?? ''} voucher` }, wordmark(item.partner))
      chip.addEventListener('click', () => {
        const card = rail.querySelector(`[data-pz-item="${item.id}"]`)
        card?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'nearest', inline: 'center' })
        if (card) bump(card)
      })
      return make('li', null, chip)
    }),
  )
  return shell('brands', { eyebrow: section.eyebrow, title: section.title }, bar, rail)
}

/* ---------------------------------------------------- included promos */

const installments = (section, ctx) => {
  const item = section.items[0]
  const card = make(
    'article',
    { class: 'pz-promo pz-promo--installments', 'data-pz-item': item.id },
    make('p', { class: 'pz-tag' }, make('span', { class: 'pz-tag__dot', 'aria-hidden': 'true' }), item.eyebrow),
    make('h4', { class: 'pz-promo__title' }, item.title),
    make(
      'ul',
      { class: 'pz-promo__stats', role: 'list' },
      item.stats.map((s) => make('li', null, make('strong', null, s.value), make('span', null, s.label))),
    ),
    make('p', { class: 'pz-promo__text' }, item.description),
    why(item),
    button(item.cta.label, { variant: 'light', onClick: () => ctx.open('installments') }),
    artSpan(zeroArt(), 'pz-promo__art'),
  )
  return shell('included', { title: section.title }, card)
}

const points = (section, ctx) => {
  const item = section.items[0]
  const balance = make('p', { class: 'pz-points__balance' })
  const action = button(item.cta.label, { variant: 'light', onClick: () => ctx.act('points') })
  const card = make(
    'article',
    { class: 'pz-promo pz-promo--points', 'data-pz-item': item.id, 'data-pz-anchor': 'points' },
    make('p', { class: 'pz-points__logo', 'aria-label': 'RED Points' }, 'RED', make('span', null, 'POINTS')),
    make('p', { class: 'pz-promo__eyebrow' }, item.eyebrow),
    make('h4', { class: 'pz-promo__title' }, item.title),
    balance,
    action,
    artSpan(pointsArt(), 'pz-promo__art'),
  )
  ctx.bind((view, event) => {
    const p = view.points
    if (!p) return
    const vouchers = Math.floor(p.balance / p.perVoucher)
    balance.replaceChildren(make('strong', null, formatNumber(p.balance)), ` points · ${vouchers ? `${vouchers} × EGP ${p.voucherValue} ${vouchers === 1 ? 'voucher' : 'vouchers'} ready` : `${formatNumber(p.perVoucher - p.balance)} more for your next voucher`}`)
    action.setAttribute('aria-disabled', String(vouchers === 0))
    action.classList.toggle('is-settled', vouchers === 0)
    if (event?.type === 'redeemed-points') bump(card)
  })
  return shell('points', { title: section.title }, card)
}

/* ------------------------------------------------------- RED Coffee */

const stars = (rating) =>
  make(
    'span',
    { class: 'pz-stars', 'aria-label': `Rated ${rating} out of 5` },
    ...Array.from({ length: 5 }, (_, i) => make('span', { class: `pz-stars__star${rating >= i + 0.75 ? ' is-full' : rating >= i + 0.25 ? ' is-half' : ''}`, 'aria-hidden': 'true' }, '★')),
  )

const coffee = (section, ctx) => {
  const item = section.items[0]
  const places = item.places
  let selected = places[0]
  const placeName = make('p', { class: 'pz-place__name' })
  const placeOpen = make('span', { class: 'pz-place__open' })
  const placeRating = make('div', { class: 'pz-place__rating' })
  const placeAddress = make('p', { class: 'pz-place__address' })
  const placeMeta = make('p', { class: 'pz-place__meta' })
  const vouchers = button('View vouchers', { variant: 'soft', onClick: () => ctx.open('voucher', item.id) })
  const directions = button('Directions', { iconName: 'directions', onClick: () => ctx.toast(`Directions to ${selected.name} would open in your maps app.`) })
  const pins = places.map((place) => {
    const pin = make(
      'button',
      { type: 'button', class: 'pz-pin', style: { left: `${place.at[0] * 100}%`, top: `${place.at[1] * 100}%` }, 'aria-label': `${place.name}, ${place.distance}` },
      make('span', { class: 'pz-pin__dot', 'aria-hidden': 'true' }),
      make('span', { class: 'pz-pin__label' }, place.name),
    )
    pin.addEventListener('click', () => choose(place))
    return pin
  })
  const choose = (place) => {
    selected = place
    placeName.textContent = place.name
    placeOpen.textContent = place.open ? 'Open now' : 'Closed'
    placeOpen.classList.toggle('is-closed', !place.open)
    placeRating.replaceChildren(make('span', { class: 'pz-place__score' }, place.rating.toFixed(1)), stars(place.rating))
    placeAddress.textContent = place.address
    placeMeta.textContent = `${place.distance} | ${place.hours}`
    pins.forEach((pin, i) => pin.classList.toggle('is-selected', places[i] === place))
  }
  const map = make(
    'div',
    { class: 'pz-map' },
    artSpan(mapArt(), 'pz-map__canvas'),
    ...pins,
    make('span', { class: 'pz-map__near', 'aria-hidden': 'true' }, icon('pin', 'pz-map__near-icon'), `${places.length} places near you`),
    make(
      'div',
      { class: 'pz-place' },
      make('span', { class: 'pz-place__logo', 'aria-hidden': 'true' }, 'RED', make('small', null, 'coffee')),
      make('div', { class: 'pz-place__info' }, make('div', { class: 'pz-place__top' }, placeName, placeOpen), placeRating, placeAddress, placeMeta),
      make('div', { class: 'pz-place__actions' }, vouchers, directions),
    ),
  )
  choose(selected)
  return shell(
    'coffee',
    { eyebrow: item.eyebrow, title: item.title, subtitle: item.description, action: viewAll('View All', () => ctx.open('places', item.id)) },
    why(item),
    map,
  )
}

/* --------------------------------------------------------- experiences */

const experiences = (section, ctx) => {
  const item = section.items[0]
  const event = item.event
  const action = button('View Event', { variant: 'glass', onClick: () => ctx.open('event', item.id) })
  const card = make(
    'article',
    { class: 'pz-event', 'data-pz-item': item.id },
    make(
      'div',
      { class: 'pz-event__poster' },
      artSpan(posterLights(), 'pz-event__lights'),
      make('span', { class: 'pz-event__word', 'aria-hidden': 'true' }, ...[0, 1, 2].map(() => make('span', null, event.poster))),
      item.image ? make('img', { class: 'pz-event__photo', src: item.image, alt: '', loading: 'lazy', decoding: 'async' }) : null,
      make('span', { class: 'pz-event__audience' }, make('span', { class: 'pz-tag__dot', 'aria-hidden': 'true' }), event.audience),
      make('span', { class: 'pz-event__note' }, icon('ticket', 'pz-event__note-icon'), event.note),
    ),
    make(
      'div',
      { class: 'pz-event__info' },
      make('p', { class: 'pz-event__when' }, event.when),
      make('h4', { class: 'pz-event__title' }, event.name),
      why(item),
      action,
    ),
  )
  ctx.bind((view) => {
    const now = view.items.get(item.id)
    if (now) card.dataset.state = now.state
    action.querySelector('.pz-btn__label').textContent = now?.state === 'claimed' ? 'Your spot is reserved' : 'View Event'
  })
  return shell('experiences', { eyebrow: item.eyebrow, title: item.title, subtitle: item.description, action: viewAll('View All', () => ctx.toast('More RED Experiences are on their way.')) }, card)
}

/* ----------------------------------------------------------- upgrade */

const upgrade = (section, ctx) => {
  const item = section.items[0]
  const reason = make('p', { class: 'pz-elite__why' })
  const action = button(item.cta.label, { variant: 'outline-light', onClick: () => ctx.open('upgrade') })
  const art = make('div', { class: 'pz-elite__art' })
  art.innerHTML = eliteArt()
  const card = make(
    'article',
    { class: 'pz-elite', 'data-pz-item': item.id },
    make('p', { class: 'pz-tag pz-tag--glass' }, make('span', { class: 'pz-tag__dot', 'aria-hidden': 'true' }), item.eyebrow),
    art,
    make(
      'div',
      { class: 'pz-elite__text' },
      make('h4', { class: 'pz-elite__title' }, item.title),
      make('p', { class: 'pz-elite__lead' }, item.description),
      make('ul', { class: 'pz-elite__perks', role: 'list' }, item.perks.map((p) => make('li', null, icon('check', 'pz-elite__check'), p))),
      reason,
      action,
    ),
  )
  ctx.bind((view) => {
    const now = view.items.get(item.id)
    if (!now) return
    card.dataset.state = now.state
    reason.replaceChildren(...(now.reasons[0] ? [icon('sparkle', 'pz-why__icon'), now.reasons[0]] : []))
    reason.hidden = !now.reasons[0]
    action.querySelector('.pz-btn__label').textContent = now.state === 'requested' ? 'Upgrade requested' : item.cta.label
    action.classList.toggle('is-settled', now.state === 'requested')
  })
  return make('section', { class: 'pz-section pz-section--upgrade', 'data-pz-section': 'upgrade', 'aria-label': 'Upgrade to RED Elite+' }, card)
}

/* ---------------------------------------------------------- composer */

/* --------------------------------------------------------------- topics */

const sectionOf = (view, id) => view.sections.find((sec) => sec.id === id)
const offersOf = (view, ids) => ids.map((id) => view.items.get(id)).filter(Boolean)
const asOffers = (title, items, ctx) => (items.length ? recommended({ title, items }, ctx) : null)

/** The spotlight's content for each topic, built from the section components above. */
const TOPIC_RENDER = {
  'for-you': (view, ctx) => {
    // Every perk (not only the open ones), so the spotlight stays whole as they are switched on.
    const perks = [...view.items.values()].filter((i) => i.kind === 'perk').sort((a, b) => (a.state === 'available' ? 0 : 1) - (b.state === 'available' ? 0 : 1) || b.score - a.score)
    if (!perks.length) return null
    const section = shell('unclaimed', { title: 'Don’t leave these on the table', subtitle: ' ' }, make('div', { class: 'pz-perks' }, perks.map((item) => perkCard(item, ctx))))
    const subtitle = section.querySelector('.pz-section__subtitle')
    ctx.bind((now) => {
      const open = [...now.items.values()].filter((i) => i.kind === 'perk' && i.state === 'available').length
      subtitle.textContent = open ? `${open} ${open === 1 ? 'perk' : 'perks'} included in your plan but not activated yet` : 'Every perk on your plan is switched on'
    })
    return section
  },
  lifestyle: (view, ctx) => {
    const offers = sectionOf(view, 'recommended')
    return make('div', { class: 'pz-topic-stack' }, offers ? recommended(offers, ctx) : null, lifestyleClaimCard(ctx))
  },
  home: (view, ctx) => planOverview(ctx),
  entertainment: (view, ctx) => {
    const pack = view.items.get('entertainment-pack')
    return shell(
      'entertainment',
      { title: 'Your entertainment', subtitle: 'The spots your plan pays for, and what is on them' },
      make('div', { class: 'pz-perks' }, entertainmentCard(ctx), pack?.state === 'available' ? perkCard(pack, ctx) : null),
    )
  },
  roaming: (view, ctx) => asOffers('Ready for your trip', offersOf(view, ['roaming-ready']), ctx),
  'red-experience': (view, ctx) => {
    const section = sectionOf(view, 'experiences')
    return section ? experiences(section, ctx) : null
  },
  'red-fitness': (view, ctx) => asOffers('Train on us', offersOf(view, ['befit']), ctx),
  'red-food': (view, ctx) => asOffers('Free delivery, every order', offersOf(view, ['talabat-pro']), ctx),
  'red-shopping': (view, ctx) => {
    const section = sectionOf(view, 'brands')
    return section ? brands(section, ctx) : null
  },
  family: (view, ctx) => {
    const share = view.items.get('family-share')
    return shell('family', { title: 'Share your plan', subtitle: 'Lines for the people closest to you, on one bill' }, make('div', { class: 'pz-perks' }, familyCard(ctx), share?.state === 'available' ? perkCard(share, ctx) : null))
  },
  bill: (view, ctx) => billCard(ctx),
  coffee: (view, ctx) => {
    const section = sectionOf(view, 'coffee')
    return section ? coffee(section, ctx) : null
  },
  installments: (view, ctx) => {
    const section = sectionOf(view, 'included')
    return section ? installments(section, ctx) : null
  },
  points: (view, ctx) => {
    const section = sectionOf(view, 'points')
    return section ? points(section, ctx) : null
  },
  upgrade: (view, ctx) => {
    const section = sectionOf(view, 'upgrade')
    return section ? upgrade(section, ctx) : null
  },
}

/** A topic's content for the spotlight (built once per topic; its bindings keep it current). */
export const renderTopic = (id, ctx) => TOPIC_RENDER[id]?.(ctx.store.view, ctx) ?? null

/** The small picture on a tile: the Dock's clay icon, or a badge for the other topics. */
const BADGES = { sparkle: 'sparkle', family: 'family', bill: 'bill', coffee: 'gift', zero: 'bolt', points: 'points', elite: 'arrowRight' }
export const topicArt = (topic, className = 'pz-mini__art') =>
  topicById(topic.id)?.dock
    ? artSpan(categoryIcon(topic.art), className)
    : make('span', { class: `${className} pz-badge-art pz-badge-art--${topic.art}`, 'aria-hidden': 'true' }, icon(BADGES[topic.art] ?? 'sparkle', 'pz-badge-art__icon'))

/**
 * A compact tile in the bento under the spotlight: the topic's name, one hook and one reason.
 * No call to action of its own: pressing it brings the topic into the spotlight.
 */
export const topicTile = (topic, ctx, onPick) => {
  const hook = make('span', { class: 'pz-mini__hook' })
  const reason = make('span', { class: 'pz-mini__reason' })
  const tile = make(
    'button',
    { type: 'button', class: `pz-mini pz-mini--${topic.art}`, 'data-topic': topic.id },
    topicArt(topic),
    make('span', { class: 'pz-mini__text' }, make('span', { class: 'pz-mini__label' }, topic.label), hook, reason),
    icon('chevronRight', 'pz-mini__go'),
  )
  tile.addEventListener('click', () => onPick(topic.id))
  ctx.bind((view) => {
    const now = rankTopics(view).find((t) => t.id === topic.id)
    if (!now) return
    hook.textContent = now.hook
    reason.textContent = now.reason ?? ''
    reason.hidden = !now.reason
    tile.setAttribute('aria-label', `${now.label}: ${now.hook}${now.reason ? `. ${now.reason}` : ''}`)
  })
  return tile
}
