/**
 * Tips: the collection that introduces the four demos on the Services page, in the manner of
 * Apple's Tips app (a cover, two tips per demo, a closing card). voice-guide ADR-0045.
 *
 * Pure data and rules, no DOM, so `npm test` can check them: the order of the cards, which demo
 * each belongs to, whether a demo is on this page, the saved state, and when to invite.
 * English is the key; the Arabic copy is in ../i18n.js.
 */

export const STORE_KEY = 'aixc.tips.v1'
export const STATE_VERSION = 1

/** The four demos, in the order the tips introduce them. */
export const FEATURES = [
  { id: 'voice', name: 'Voice guide', icon: 'mic', needs: 'guide' },
  { id: 'pocket', name: 'Pocket', icon: 'pocket', needs: 'pocket' },
  { id: 'reimagine', name: 'Reimagine this page', icon: 'sparkle', needs: 'composer' },
  { id: 'journey', name: 'Your journey', icon: 'journey', needs: 'trail' },
]

/**
 * The cards, in order. Each tip has a scene (./scenes.js) that loops while it is on screen, and a
 * "Try it" flow (./coach.js) for its demo. The copy states only what the demos do today
 * (voice-guide HANDOFF §2, runbook §5a); the spoken example is from the router's tuning set.
 */
export const CARDS = [
  {
    id: 'cover',
    kind: 'cover',
    scene: 'cover',
    title: 'Four new ways to explore Services',
    body: 'Ask out loud, keep what you like for later, change how the page looks, and pick up where you left off.',
  },
  {
    id: 'voice-ask',
    kind: 'tip',
    feature: 'voice',
    scene: 'voiceAsk',
    title: 'Just ask, out loud',
    body: 'Press the red microphone and ask in Arabic or English. Your words appear as you speak. Rather type? The keyboard button is right beside it.',
  },
  {
    id: 'voice-go',
    kind: 'tip',
    feature: 'voice',
    scene: 'voiceGo',
    title: 'It takes you there, and points',
    body: 'The guide finds the answer on Vodafone’s pages, opens the right one and highlights it. It never presses pay or subscribe for you: that tap is always yours.',
  },
  {
    id: 'pocket-peel',
    kind: 'tip',
    feature: 'pocket',
    scene: 'pocketPeel',
    title: 'Peel it off for later',
    body: 'Press “Pocket it” on any service. It peels off like a sticker and drops into your pocket. Changed your mind? “Put back” sticks it right back.',
  },
  {
    id: 'pocket-open',
    kind: 'tip',
    feature: 'pocket',
    scene: 'pocketOpen',
    title: 'Turn the page to your pocket',
    body: 'While you keep something, the corner of the page lifts. Press the pocket to turn the page and see everything you kept, with its link. It stays in this browser.',
  },
  {
    id: 'reimagine-pick',
    kind: 'tip',
    feature: 'reimagine',
    scene: 'reimaginePick',
    title: 'See the page another way',
    body: 'Press “Reimagine this page” and pick a ready-made view: a cover flow, a flipbook, a 3D cube and more. One click, no AI call.',
  },
  {
    id: 'reimagine-same',
    kind: 'tip',
    feature: 'reimagine',
    scene: 'reimagineSame',
    title: 'Same services in every view',
    body: 'Every view keeps each service, its description and its link, and adds nothing. “Original” brings the familiar page back whenever you like.',
  },
  {
    id: 'journey-remember',
    kind: 'tip',
    feature: 'journey',
    scene: 'journeyRemember',
    title: 'Your journey stays with you',
    body: 'Say yes to “Remember my journey” and the pages you explore are kept only in this browser, never sent anywhere. Pause or clear it any time; it deletes itself after 24 hours.',
  },
  {
    id: 'journey-ask',
    kind: 'tip',
    feature: 'journey',
    scene: 'journeyAsk',
    title: 'Questions from where you’ve been',
    body: 'Open “Your journey” to look back through the pages you visited. It picks out what you explored and offers questions; press one and the guide answers on the page.',
  },
  {
    id: 'finale',
    kind: 'finale',
    scene: null,
    title: 'You’re all set',
    body: 'Try any of them now, or come back to these tips from the Tips button at the bottom of the page.',
  },
]

export const TIP_COUNT = CARDS.filter((card) => card.kind === 'tip').length

export const featureById = (id) => FEATURES.find((feature) => feature.id === id) ?? null

/** "Voice guide · 1 of 2": where a tip sits within its demo. */
export const tipPosition = (index) => {
  const card = CARDS[index]
  if (!card || card.kind !== 'tip') return null
  const siblings = CARDS.filter((c) => c.feature === card.feature)
  return { feature: card.feature, n: siblings.indexOf(card) + 1, of: siblings.length }
}

/** The first card of a demo (where "Try it" on the closing card leads back to). */
export const firstTipOf = (featureId) => CARDS.findIndex((card) => card.feature === featureId)

/**
 * Is a demo on this page? `env` says what was found: the guide's microphone (`guide`), the
 * journey pill (`trail`), the Pocket and the Reimagine launcher. The voice guide and the journey
 * join the page only through the voice-guide demo (`npm run demo:trail`).
 */
export const featureAvailable = (featureId, env = {}) => {
  const feature = featureById(featureId)
  return Boolean(feature && env[feature.needs])
}

/** Why a demo cannot be tried here, in plain words (English key). */
export const unavailableReason = (featureId) =>
  featureId === 'journey'
    ? 'Your journey needs the voice guide on this page, and it isn’t running here.'
    : 'The voice guide isn’t running on this page, so there’s nothing to try here yet.'

/* ------------------------------------------------------------------ saved state */

export const defaultState = () => ({ v: STATE_VERSION, seen: false, invited: false, tried: {}, at: 0 })

/** Reads the saved state; anything unreadable or from another version starts fresh. */
export const readState = (storage) => {
  try {
    const raw = JSON.parse(storage?.getItem(STORE_KEY) || 'null')
    if (!raw || typeof raw !== 'object' || raw.v !== STATE_VERSION) return defaultState()
    const tried = {}
    for (const feature of FEATURES) if (raw.tried?.[feature.id] === true) tried[feature.id] = true
    const at = Number.isInteger(raw.at) && raw.at >= 0 && raw.at < CARDS.length ? raw.at : 0
    return { v: STATE_VERSION, seen: raw.seen === true, invited: raw.invited === true, tried, at }
  } catch {
    return defaultState()
  }
}

export const writeState = (storage, state) => {
  try {
    storage?.setItem(STORE_KEY, JSON.stringify(state))
    return true
  } catch {
    // Storage can be unavailable (private mode): the tips then forget at the end of the visit.
    return false
  }
}

/**
 * What to do when the page loads:
 * - `?tips=open` opens the collection, `?tips=invite` shows the invitation, `?tips=off` neither;
 * - a browser driven by automation (tests, the walkthrough tool) is never interrupted;
 * - otherwise the first visit gets the invitation once.
 */
export const startAction = ({ state, params, automated = false }) => {
  const asked = params?.get?.('tips')
  if (asked === 'open') return 'open'
  if (asked === 'invite') return 'invite'
  if (asked === 'off' || automated) return 'none'
  return state.seen || state.invited ? 'none' : 'invite'
}
