/**
 * Vodafone's card components, as data (voice-guide ADR-0046 §3; live plan §3.4). One row per
 * component of Vodafone's Liferay pages, so a class Vodafone renames is a one-line fix here, not a
 * change to any demo. Grounded in the saved pages of 2026-10-23 (voice-guide
 * docs/reference/live-way2-code-map-2026-11-10.md §4).
 *
 * A row: `match` (the card), optional `when(el)` (to tell variants apart) and `exclude(el)`, then
 * selectors inside the card for its title, description, price, image, link and link label.
 * `link: ':self'` means the card is itself the link.
 */

export const RECOGNISERS = [
  {
    kind: 'card-action',
    match: '.card-action',
    title: '.card-action-body h4, .card-action-body h5',
    description: '.card-action-body p.multi-lines',
    image: '.card-action-img img',
    link: 'a[href]',
    linkLabel: '.card-action-btn',
  },
  {
    // Bundles: a header with the bundle's size, its price in the body, a Subscribe button.
    kind: 'card-subscription-bundle',
    match: '.card-subscription',
    when: (el) => !!el.querySelector('.card-subscription-header'),
    title: '.card-subscription-header-title',
    price: '.card-subscription-body-amount',
    description: '.card-subscription-body p',
    image: null,
    link: '.card-subscription-footer a[href]',
    linkLabel: '.card-subscription-footer a',
  },
  {
    // Services: the whole card is the link.
    kind: 'card-subscription',
    match: '.card-subscription',
    when: (el) => !el.querySelector('.card-subscription-header'),
    title: '.card-subscription-body-amount',
    description: '.card-subscription-body > p',
    image: '.card-subscription-image img',
    link: 'a[href]',
  },
  {
    kind: 'card-plan',
    match: '.card-plan',
    title: '.card-plan-header-type h3',
    price: '.card-plan-header p.text-2x',
    description: 'li.card-collapsing-list-item strong',
    image: '.card-plan-body img',
    link: 'a.btn[href]',
    linkLabel: 'a.btn',
  },
  {
    kind: 'card-horizontal',
    match: '.card.card-horizontal',
    title: 'h4 > span:first-child, h4',
    description: 'p',
    image: null,
    link: 'a[href]',
    linkLabel: 'a',
  },
  {
    kind: 'tiles',
    match: '.tiles',
    title: '.tiles-title',
    description: '.tiles-text',
    image: '.tiles-img img.img-desktop, .tiles-img img',
    link: 'a[href]',
  },
  {
    kind: 'ticket',
    match: 'a.ticket',
    // Sign-in links are not content.
    exclude: (el) => /\/auth\//.test(el.getAttribute('href') || ''),
    title: '.ticket-content h3',
    description: '.ticket-content p',
    image: 'img',
    link: ':self',
  },
]

/** Never read: Owl's copies of cards, dialogs, FAQ entries, the quick-link bar, partner logos. */
export const SKIP = '.owl-item.cloned, .modal, .accordion-item, nav.quick-links, .brand-item'

/** Where a section's title is, in order (live plan §3.4, code map §5). */
export const SECTION_TITLE = ['.section-title h2', '.hello-title', 'h2', 'h3']
export const SECTION_SUBTITLE = '.section-title h4, .section-title p, h4.lead, p.section-subtitle'
