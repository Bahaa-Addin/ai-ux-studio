/**
 * The RED world's demonstration data: the plans, the benefits catalogue and three customers.
 *
 * Pure data, no DOM, so `npm test` can check it. Every value is illustrative and can be changed
 * here without touching a component: nothing is a real customer, and the numbers are not business
 * rules. Dates are offsets in days from "now", so the expiry rules keep meaning something whatever
 * day the demo runs. Copy follows the reference recording (Benefits and My Lines screens).
 *
 * A future recommendation API only has to return the same shapes (see ./engine.js, `personalize`).
 */

/** Plans in tier order (a plan's index is its rank). */
export const PLANS = [
  {
    id: 'advance',
    name: 'RED Advance+',
    priceEGP: 300,
    allowances: { data: 85, minutes: 4000, sms: 500, roaming: 2000 },
    familyCapacity: 2,
    entertainmentSpots: 6,
  },
  {
    id: 'elite',
    name: 'RED Elite+',
    priceEGP: 450,
    allowances: { data: 170, minutes: 6000, sms: 1000, roaming: 3000 },
    familyCapacity: 5,
    entertainmentSpots: 8,
    extras: ['YouTube Premium'],
  },
]

export const planById = (id) => PLANS.find((plan) => plan.id === id) ?? PLANS[0]
export const tierRank = (id) => Math.max(0, PLANS.findIndex((plan) => plan.id === id))

/**
 * Partners as the cards show them. `mark` picks a typographic treatment (./art.js draws a tasteful
 * wordmark, not the partner's logo artwork); `ink`/`paper` are the tile colours.
 */
export const PARTNERS = {
  talabat: { name: 'talabat pro', mark: 'talabat', paper: '#5b24d6', ink: '#ff6a13' },
  qanz: { name: 'qanz', mark: 'qanz', paper: '#1f1f22', ink: '#ffffff' },
  yango: { name: 'Yango Play', mark: 'yango', paper: '#7a1fe0', ink: '#ffd400' },
  zara: { name: 'ZARA', mark: 'serif', paper: '#ffffff', ink: '#111111' },
  kiko: { name: 'KIKO MILANO', mark: 'wide', paper: '#ffffff', ink: '#111111' },
  massimo: { name: 'Massimo Dutti', mark: 'script', paper: '#ffffff', ink: '#2b2b2b' },
  stradivarius: { name: 'Stradivarius', mark: 'italic', paper: '#ffffff', ink: '#2b2b2b' },
  mango: { name: 'MANGO', mark: 'spaced', paper: '#ffffff', ink: '#111111' },
  befit: { name: 'BeFit', mark: 'bold', paper: '#1f1f22', ink: '#ffffff' },
  coffee: { name: 'RED Coffee', mark: 'bold', paper: '#3b2416', ink: '#f6e7d4' },
}

/**
 * "Explore by category" (the Benefits screen) and "Explore more with RED Lifestyle": the Dock at the
 * end of the Pocket. Each id is a topic in ./topics.js: pressing the icon brings it into the
 * spotlight.
 */
export const CATEGORIES = [
  { id: 'lifestyle', label: 'Lifestyle', art: 'bag' },
  { id: 'home', label: 'Home Connectivity', art: 'router' },
  { id: 'entertainment', label: 'Entertainment', art: 'play' },
  { id: 'roaming', label: 'Roaming', art: 'plane' },
]

export const LIFESTYLE = [
  { id: 'red-experience', label: 'RED Experience', caption: 'Exclusive Events', art: 'envelope' },
  { id: 'red-fitness', label: 'RED Fitness', caption: 'BeFit + Partners', art: 'dumbbell' },
  { id: 'red-food', label: 'RED Food & Groceries', caption: 'Talabat Pro', art: 'grocery' },
  { id: 'red-shopping', label: 'RED Shopping', caption: 'Qanz Card + Brands', art: 'shopping' },
]

/**
 * The catalogue. Each entry:
 *   id, kind ('perk' | 'offer' | 'voucher' | 'promo' | 'partner' | 'experience' | 'points' | 'upgrade' | 'home'),
 *   category, partner, eyebrow, title, description, art (./art.js) or image (a page asset),
 *   included (one of the plan's benefits), minTier/maxTier (eligibility), requires (a product the
 *   customer must have, e.g. 'dsl'), interests (affinities it answers), moment (a dated event in the
 *   customer's life it fits, e.g. 'trip'), relieves (an allowance it helps with), capacity ('family' | 'entertainment'),
 *   expiresInDays / startsInDays, priority (0–100 before the rules), cta { label, action }.
 */
export const CATALOG = [
  // Included in the plan, activated with "+" ("Don't leave these on the table").
  {
    id: 'entertainment-pack',
    kind: 'perk',
    category: 'entertainment',
    partner: 'yango',
    eyebrow: 'Entertainment',
    title: 'Add {spots} services for free',
    description: 'Yango Play and more, on the spots your plan already pays for.',
    art: 'yango',
    included: true,
    capacity: 'entertainment',
    interests: ['music', 'series'],
    priority: 56,
    cta: { label: 'Add a free service', action: 'activate' },
    done: 'Yango Play added to your plan',
  },
  {
    id: 'family-share',
    kind: 'perk',
    category: 'family',
    eyebrow: 'Get more together',
    title: 'Share your plan with family',
    description: 'Give someone close a line on your RED plan, minutes and data included.',
    art: 'family',
    included: true,
    capacity: 'family',
    interests: [],
    priority: 54,
    cta: { label: 'Invite a family member', action: 'invite' },
    done: 'Invitation sent',
  },
  // Partner offers ("Ready when you are").
  {
    id: 'talabat-pro',
    kind: 'offer',
    category: 'lifestyle',
    partner: 'talabat',
    eyebrow: 'Yours with {plan}',
    title: 'Talabat Pro',
    description: 'Free delivery on every order · Exclusive discounts up to 30%',
    art: 'talabat',
    included: true,
    minTier: 'advance',
    interests: ['food'],
    priority: 48,
    cta: { label: 'Get this free', action: 'claim' },
    done: 'Talabat Pro is on: free delivery from your next order',
  },
  {
    id: 'qanz-card',
    kind: 'offer',
    category: 'lifestyle',
    partner: 'qanz',
    eyebrow: 'Included with your plan',
    title: 'QANZ Card',
    description: 'Enjoy 20% off on your QANZ Card. Load vouchers and use them at partner brands.',
    art: 'qanz',
    included: true,
    interests: ['fashion', 'shopping'],
    priority: 44,
    cta: { label: 'Claim now', action: 'claim' },
    done: 'Your QANZ Card is ready in Wallet',
  },
  {
    id: 'befit',
    kind: 'offer',
    category: 'lifestyle',
    partner: 'befit',
    eyebrow: 'RED Fitness',
    title: 'Two months of BeFit',
    description: 'Train at 40+ BeFit gyms on us, then 25% off every month after.',
    art: 'fitness',
    interests: ['fitness'],
    priority: 30,
    cta: { label: 'Get this free', action: 'claim' },
    done: 'Your BeFit pass is ready',
  },
  {
    id: 'roaming-ready',
    kind: 'offer',
    category: 'roaming',
    eyebrow: 'Before you travel',
    title: 'Roaming is ready',
    description: '{roaming} roaming minutes in 40 countries, already in your plan.',
    image: '/ai-ux-studio/services/assets/images/roaming.png',
    interests: ['travel'],
    moment: 'trip',
    priority: 26,
    cta: { label: 'Turn on roaming', action: 'claim' },
    done: 'Roaming is on for your next trip',
  },
  // Brand vouchers ("Discover your favourite brands"), every state on purpose.
  { id: 'zara-15', kind: 'voucher', category: 'lifestyle', partner: 'zara', title: 'Save 15% on ZARA Stores', art: 'zara', expiresInDays: 6, interests: ['fashion'], priority: 40, cta: { label: 'Get vouchers', action: 'voucher' }, code: 'RED15-ZR8Q' },
  { id: 'mango-15', kind: 'voucher', category: 'lifestyle', partner: 'mango', title: 'Save 15% on MANGO', art: 'mango', expiresInDays: 36, interests: ['fashion'], priority: 34, cta: { label: 'Get vouchers', action: 'voucher' }, code: 'RED15-MG2K' },
  { id: 'kiko-20', kind: 'voucher', category: 'lifestyle', partner: 'kiko', title: 'Save 20% on KIKO MILANO', art: 'kiko', expiresInDays: 20, interests: ['beauty'], priority: 30, cta: { label: 'Show code', action: 'voucher' }, code: 'RED20-KK5T' },
  { id: 'massimo-10', kind: 'voucher', category: 'lifestyle', partner: 'massimo', title: 'Save 10% on Massimo Dutti', art: 'massimo', expiresInDays: 48, interests: ['fashion'], priority: 22, cta: { label: 'View receipt', action: 'voucher' }, code: 'RED10-MD7A' },
  { id: 'stradivarius-10', kind: 'voucher', category: 'lifestyle', partner: 'stradivarius', title: 'Save 10% on Stradivarius', art: 'stradivarius', expiresInDays: -3, interests: ['fashion'], priority: 18, cta: { label: 'Expired', action: 'voucher' }, code: 'RED10-SV3D' },
  // Included in the plan: device financing.
  {
    id: 'red-installments',
    kind: 'promo',
    category: 'devices',
    eyebrow: 'RED Installments',
    title: 'Split on your monthly RED bill · No interest',
    description: 'The phone you want from EGP 1,249/mo for 24 months, added to your RED bill.',
    stats: [
      { value: '0%', label: 'Interest' },
      { value: '0 EGP', label: 'Down Payment' },
      { value: '0 EGP', label: 'Hidden Fees' },
    ],
    art: 'zero',
    interests: ['tech'],
    priority: 32,
    cta: { label: 'See eligible phones', action: 'installments' },
  },
  // A partner-specific offer with places to use it.
  {
    id: 'red-coffee',
    kind: 'partner',
    category: 'lifestyle',
    partner: 'coffee',
    eyebrow: 'RED Coffee',
    title: 'Enjoy 20% OFF on your coffee with RED',
    description: 'Purchase your exclusive 20% OFF vouchers. Check redemption locations.',
    included: true,
    interests: ['coffee'],
    priority: 36,
    cta: { label: 'View vouchers', action: 'voucher' },
    code: 'RED20-CAFE',
    redeem: 'Show the code at the counter before you pay. One voucher per order.',
    places: [
      { id: 'dark-solutions', name: 'Dark Solutions', rating: 4.5, address: 'Saeid Street, Birket El Sab, Monufia', distance: '200 m', hours: 'Closes at 9 PM', open: true, at: [0.58, 0.72] },
      { id: 'dancing-goat', name: 'Dancing Goat Coffee', rating: 4.7, address: 'El Gomhoreya Street, El Sab, Monufia', distance: '650 m', hours: 'Closes at 11 PM', open: true, at: [0.2, 0.22] },
      { id: 'roast-room', name: 'The Roast Room', rating: 4.3, address: 'Shebin El Kom Road, Monufia', distance: '1.2 km', hours: 'Opens at 8 AM', open: false, at: [0.84, 0.3] },
    ],
  },
  // Events.
  {
    id: 'red-night',
    kind: 'experience',
    category: 'experiences',
    eyebrow: 'Coming soon',
    title: 'RED Experiences',
    description: 'Find and book events with Vodafone member rewards.',
    image: '/ai-ux-studio/services/assets/images/amr-diab.png',
    interests: ['music'],
    minTier: 'advance',
    priority: 34,
    event: { name: 'Amr Diab · RED Members Only Night', venue: 'Cairo Opera House', startsInDays: 33, time: '9:00 PM', audience: '{plan} and above', note: 'Limited slots', poster: 'RED NIGHT' },
    cta: { label: 'View Event', action: 'event' },
  },
  // Loyalty.
  {
    id: 'red-points',
    kind: 'points',
    category: 'rewards',
    eyebrow: 'Earn on every recharge',
    title: 'Use your points, and generate new vouchers',
    description: 'Every 1,000 points becomes a EGP 50 voucher for rides, sportswear or your bill.',
    art: 'points',
    interests: [],
    priority: 28,
    cta: { label: 'Generate a voucher', action: 'points' },
  },
  // Home connectivity (the plan card's promotion).
  {
    id: 'home-bonus',
    kind: 'home',
    category: 'home',
    eyebrow: 'Home Connectivity',
    title: 'Get free data for your home connection!',
    description: '50 GB a month on your home internet while you are on RED.',
    art: 'router',
    included: true,
    requires: 'dsl',
    relieves: 'dsl',
    interests: ['home'],
    priority: 38,
    cta: { label: 'Activate', action: 'activate' },
    done: '50 GB added to your home internet',
  },
  // The premium opportunity.
  {
    id: 'elite-plus',
    kind: 'upgrade',
    category: 'upgrade',
    eyebrow: 'Upgrade · RED Elite+',
    title: 'Share with up to 5, not just 2',
    description: 'RED Elite+ adds family sharing, YouTube Premium, and 85GB of data.',
    art: 'elite',
    minTier: 'advance',
    maxTier: 'advance',
    interests: [],
    priority: 20,
    cta: { label: 'Upgrade to Elite+', action: 'upgrade' },
    perks: ['Up to 5 family members', 'YouTube Premium', '+85 GB every month', 'Priority RED events'],
  },
]

/** The plan's own benefits, counted by "0 of 6 benefits claimed". */
export const INCLUDED_BENEFITS = CATALOG.filter((item) => item.included).map((item) => item.id)

/** The widget's metrics in their default order (a profile can drop or reorder them). */
export const GLANCE_METRICS = ['minutes', 'sms', 'data', 'dsl', 'bill', 'points', 'family']

/**
 * Three customers. `states` is each benefit's activation state:
 *   'available' (can be activated or claimed), 'active' / 'claimed' (in use), 'redeemed', 'expired', 'locked'.
 * Anything not listed is 'available'. `affinity` is how strongly the (illustrative) signals point
 * at an interest, 0–1, and `signals` is the sentence a card shows to explain itself.
 */
export const PROFILES = {
  ahmed: {
    id: 'ahmed',
    firstName: 'Ahmed',
    plan: 'advance',
    msisdn: '+245256663',
    renewsInDays: 12,
    planStatus: 'All good',
    usage: {
      data: { left: 42, total: 85, unit: 'GB' },
      minutes: { left: 1250, total: 4000 },
      sms: { left: 180, total: 500 },
      roaming: { left: 2000, total: 2000 },
      dsl: { left: 350, total: 500, unit: 'GB', product: 'Home Internet 500' },
    },
    bill: { amount: 300, dueInDays: 3, autoPay: false },
    points: { balance: 2450, perVoucher: 1000, voucherValue: 50 },
    family: { members: [] },
    entertainment: { used: 4, services: ['Shahid', 'Anghami', 'Watch iT', 'OSN+'] },
    affinity: { food: 0.9, music: 0.8, coffee: 0.7, fashion: 0.6, tech: 0.55, travel: 0.2, fitness: 0.1 },
    signals: {
      food: 'You order in about three times a week',
      music: 'Amr Diab is in your most-played on Anghami',
      coffee: 'You picked up two coffee offers last month',
      fashion: 'You saved ZARA and MANGO in your favourites',
      tech: 'Your phone is three years old',
      travel: 'Roaming is ready for your next trip',
    },
    states: { 'kiko-20': 'claimed', 'massimo-10': 'redeemed' },
  },
  mariam: {
    id: 'mariam',
    firstName: 'Mariam',
    plan: 'elite',
    msisdn: '+245317204',
    renewsInDays: 21,
    planStatus: 'All good',
    usage: {
      data: { left: 128, total: 170, unit: 'GB' },
      minutes: { left: 3400, total: 6000 },
      sms: { left: 640, total: 1000 },
      roaming: { left: 2200, total: 3000 },
    },
    bill: { amount: 450, dueInDays: 12, autoPay: true },
    points: { balance: 6120, perVoucher: 1000, voucherValue: 50 },
    family: {
      members: [
        { id: 'omar', name: 'Omar', relation: 'Husband', avatar: 1 },
        { id: 'laila', name: 'Laila', relation: 'Daughter', avatar: 3 },
        { id: 'youssef', name: 'Youssef', relation: 'Son', avatar: 4 },
      ],
    },
    entertainment: { used: 8, services: ['Shahid', 'Anghami', 'Watch iT', 'OSN+', 'Yango Play', 'YouTube Premium', 'TOD', 'Starzplay'] },
    affinity: { fitness: 0.9, fashion: 0.85, travel: 0.7, beauty: 0.6, food: 0.3, coffee: 0.4, music: 0.3 },
    moments: { trip: { inDays: 34, place: 'Paris' } },
    signals: {
      fitness: 'You checked in at the gym 12 times this month',
      fashion: 'You shop for the family most weekends',
      travel: 'You have roaming planned for December',
      beauty: 'You redeemed a KIKO voucher before',
    },
    states: { 'talabat-pro': 'active', 'qanz-card': 'active', 'entertainment-pack': 'active', 'family-share': 'active', 'zara-15': 'claimed' },
  },
  karim: {
    id: 'karim',
    firstName: 'Karim',
    plan: 'advance',
    msisdn: '+245402918',
    renewsInDays: 4,
    planStatus: 'Data running low',
    usage: {
      data: { left: 3, total: 85, unit: 'GB' },
      minutes: { left: 3100, total: 4000 },
      sms: { left: 470, total: 500 },
      roaming: { left: 2000, total: 2000 },
      dsl: { left: 40, total: 250, unit: 'GB', product: 'Home Internet 250' },
    },
    bill: { amount: 300, dueInDays: 9, autoPay: true },
    points: { balance: 940, perVoucher: 1000, voucherValue: 50 },
    family: { members: [] },
    entertainment: { used: 6, services: ['Shahid', 'Anghami', 'Watch iT', 'OSN+', 'TOD', 'Starzplay'] },
    affinity: { travel: 0.95, coffee: 0.6, fitness: 0.5, tech: 0.4, food: 0.2, fashion: 0.15 },
    moments: { trip: { inDays: 9, place: 'Dubai' } },
    signals: {
      travel: 'You fly to Dubai in nine days',
      coffee: 'You buy coffee near the office most mornings',
      fitness: 'You run on weekends',
    },
    states: { 'entertainment-pack': 'active' },
  },
}

export const DEFAULT_PROFILE = 'ahmed'
