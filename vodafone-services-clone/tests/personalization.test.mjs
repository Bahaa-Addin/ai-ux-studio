// The RED world under the Pocket (src/personalization): the demonstration data, each personalization
// rule on its own, the ranking for three customers, the status widget's metrics and the demo store.
import test from 'node:test'
import assert from 'node:assert/strict'
import { CATALOG, CATEGORIES, INCLUDED_BENEFITS, LIFESTYLE, PARTNERS, PLANS, PROFILES } from '../src/personalization/data.js'
import { RULES, factsFor, formatEventDate, formatShortDate, glanceFor, personalize, scoreItem, stateOf } from '../src/personalization/engine.js'
import { STORE_KEY, applySaved, createStore, readSaved, resolveProfileId } from '../src/personalization/store.js'
import { DOCK_TOPICS, TOPICS, bentoSpans, defaultTopic, dockCategories, rankTopics, topicFor } from '../src/personalization/topics.js'

const NOW = new Date('2026-11-09T10:00:00Z')
const item = (id) => CATALOG.find((entry) => entry.id === id)
const facts = (id = 'ahmed', patch = {}) => factsFor({ ...structuredClone(PROFILES[id]), ...patch }, NOW)
const memory = (initial = {}) => {
  const data = { ...initial }
  return { getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => (data[k] = String(v)), data }
}
const ids = (view) => view.sections.map((s) => s.id)

/* ------------------------------------------------------------------- data */

test('every catalogue item is complete and refers to things that exist', () => {
  assert.equal(new Set(CATALOG.map((c) => c.id)).size, CATALOG.length, 'unique ids')
  for (const entry of CATALOG) {
    assert.ok(entry.kind && entry.title && entry.category, entry.id)
    assert.ok(entry.cta?.label && entry.cta?.action, `${entry.id} has a call to action`)
    assert.equal(typeof entry.priority, 'number', `${entry.id} priority`)
    if (entry.partner) assert.ok(PARTNERS[entry.partner], `${entry.id} partner`)
    assert.ok(entry.art || entry.image || entry.kind === 'voucher' || entry.kind === 'partner', `${entry.id} has artwork`)
  }
  assert.equal(INCLUDED_BENEFITS.length, 6, 'the plan has six benefits, as "0 of 6 benefits claimed" says')
  assert.deepEqual(CATEGORIES.map((c) => c.label), ['Lifestyle', 'Home Connectivity', 'Entertainment', 'Roaming'])
  assert.deepEqual(LIFESTYLE.map((c) => c.label), ['RED Experience', 'RED Fitness', 'RED Food & Groceries', 'RED Shopping'])
  for (const profile of Object.values(PROFILES)) assert.ok(PLANS.some((p) => p.id === profile.plan), profile.id)
})

test('dates print the way the reference prints them', () => {
  assert.equal(formatShortDate(new Date(2026, 8, 15)), '15.09.2026')
  assert.equal(formatEventDate(new Date(2026, 11, 12)), 'Sat 12 Dec 2026')
})

/* ------------------------------------------------------------------ state */

test('state: plan limits, missing products, expiry and full spots', () => {
  assert.equal(stateOf(item('elite-plus'), facts('mariam')), 'hidden', 'no upgrade offer above the top plan')
  assert.equal(stateOf(item('elite-plus'), facts('ahmed')), 'available')
  assert.equal(stateOf(item('home-bonus'), facts('mariam')), 'hidden', 'no home internet, no home data bonus')
  assert.equal(stateOf(item('stradivarius-10'), facts('ahmed')), 'expired')
  assert.equal(stateOf(item('kiko-20'), facts('ahmed')), 'claimed', 'the profile says so')
  const full = facts('ahmed', { family: { members: [{ id: 'a' }, { id: 'b' }] } })
  assert.equal(full.spots.family.left, 0)
  assert.equal(stateOf(item('family-share'), full), 'full')
})

/* ------------------------------------------------------------------ rules */

test('rule: an included benefit that is not switched on', () => {
  const f = facts()
  assert.equal(RULES.unclaimedIncluded(item('talabat-pro'), f, 'available').tag, 'unclaimed')
  assert.equal(RULES.unclaimedIncluded(item('talabat-pro'), f, 'active'), null)
  assert.equal(RULES.unclaimedIncluded(item('befit'), f, 'available'), null, 'not part of the plan')
})

test('rule: spare family and entertainment spots', () => {
  const f = facts()
  assert.match(RULES.capacityLeft(item('family-share'), f, 'available').reason, /2 family spots left/)
  assert.match(RULES.capacityLeft(item('entertainment-pack'), f, 'available').reason, /2 free spots/)
  assert.equal(RULES.capacityLeft(item('talabat-pro'), f, 'available'), null)
  const one = facts('ahmed', { family: { members: [{ id: 'a' }] } })
  assert.match(RULES.capacityLeft(item('family-share'), one, 'available').reason, /^1 family spot left/)
})

test('rule: expiring soon, stronger as the day nears', () => {
  const f = facts()
  const at = (days) => RULES.expiringSoon({ ...item('zara-15'), expiresInDays: days }, f, 'available')
  assert.equal(at(0).reason, 'Expires today')
  assert.equal(at(1).reason, 'Expires in 1 day')
  assert.ok(at(2).boost > at(10).boost)
  assert.equal(at(15), null, 'more than two weeks away')
  assert.equal(at(-1), null, 'already over')
  assert.equal(RULES.expiringSoon(item('zara-15'), f, 'redeemed'), null)
})

test('rule: interests need a real signal, and say what it is', () => {
  const f = facts()
  const talabat = RULES.interestMatch(item('talabat-pro'), f, 'available')
  assert.equal(talabat.reason, 'You order in about three times a week')
  assert.ok(talabat.boost > RULES.interestMatch(item('zara-15'), f, 'available').boost, 'food (0.9) beats fashion (0.6)')
  assert.equal(RULES.interestMatch(item('befit'), f, 'available'), null, 'fitness 0.1 is no signal')
})

test('rule: an allowance under a fifth makes its relief urgent', () => {
  assert.equal(RULES.usagePressure(item('home-bonus'), facts('ahmed'), 'available'), null)
  assert.equal(RULES.usagePressure(item('home-bonus'), facts('karim'), 'available').reason, 'Only 40 GB left this cycle')
})

test('rule: a trip soon puts roaming first', () => {
  const soon = RULES.upcomingMoment(item('roaming-ready'), facts('karim'), 'available')
  const later = RULES.upcomingMoment(item('roaming-ready'), facts('mariam'), 'available')
  assert.equal(soon.reason, 'You travel to Dubai in 9 days')
  assert.ok(soon.boost > later.boost)
  assert.equal(RULES.upcomingMoment(item('roaming-ready'), facts('ahmed'), 'available'), null, 'no trip planned')
})

test('rule: the upgrade answers an outgrown plan', () => {
  assert.equal(RULES.upgradeOpportunity(item('elite-plus'), facts('ahmed'), 'available'), null)
  const full = RULES.upgradeOpportunity(item('elite-plus'), facts('ahmed', { family: { members: [{ id: 'a' }, { id: 'b' }] } }), 'available')
  assert.equal(full.reason, 'All 2 family spots are taken')
  assert.equal(RULES.upgradeOpportunity(item('elite-plus'), facts('karim'), 'available').reason, 'Elite+ doubles your monthly data')
})

test('rule: settled items stay, lower down', () => {
  const f = facts()
  assert.ok(RULES.alreadySettled(item('zara-15'), f, 'redeemed').boost < 0)
  assert.ok(RULES.alreadySettled(item('zara-15'), f, 'expired').boost < RULES.alreadySettled(item('zara-15'), f, 'claimed').boost)
  assert.equal(RULES.alreadySettled(item('zara-15'), f, 'available'), null)
})

test('a score is the priority plus its boosts, reasons strongest first', () => {
  const scored = scoreItem(item('talabat-pro'), facts())
  assert.equal(scored.state, 'available')
  assert.equal(scored.score, item('talabat-pro').priority + scored.fired.reduce((sum, f) => sum + f.boost, 0))
  assert.deepEqual(scored.reasons, ['You order in about three times a week', 'Included in your plan, not activated yet'])
})

/* ---------------------------------------------------------------- ranking */

test('Ahmed: the reference order, led by what he has not claimed', () => {
  const view = personalize(PROFILES.ahmed, { now: NOW })
  assert.deepEqual(ids(view).slice(0, 5), ['hero', 'plan', 'unclaimed', 'categories', 'recommended'])
  assert.equal(ids(view).at(-1), 'upgrade')
  assert.equal(ids(view).at(-2), 'lifestyle')
  assert.deepEqual(view.progress, { claimed: 0, total: 6 })
  assert.equal(view.featured.id, 'talabat-pro')
  const unclaimed = view.sections.find((s) => s.id === 'unclaimed')
  assert.equal(unclaimed.subtitle, '2 perks included in your plan but not activated yet')
  assert.equal(unclaimed.items[0].title, 'Add 2 services for free')
  assert.equal(view.items.get('red-night').event.when, 'Sat 12 Dec 2026 · 9:00 PM · Cairo Opera House')
  assert.equal(view.items.get('zara-15').expiresLabel, 'till 15.11.2026')
})

test('the same components, ordered differently for different customers', () => {
  const karim = personalize(PROFILES.karim, { now: NOW })
  const mariam = personalize(PROFILES.mariam, { now: NOW })
  assert.equal(karim.featured.id, 'roaming-ready', 'a trip in nine days')
  assert.ok(ids(karim).indexOf('upgrade') < ids(karim).indexOf('included'), 'data running low lifts the upgrade')
  assert.equal(mariam.upgrade, null, 'already on the top plan')
  assert.ok(!ids(mariam).includes('unclaimed'), 'nothing left on the table')
  assert.notDeepEqual(ids(karim), ids(mariam))
  assert.deepEqual(mariam.progress, { claimed: 4, total: 5 }, 'no home internet, so five benefits')
})

/* ----------------------------------------------------------------- glance */

test('the widget shows each configured metric, in order', () => {
  const ahmed = glanceFor(facts())
  assert.deepEqual(ahmed.map((m) => m.id), ['minutes', 'sms', 'data', 'dsl', 'bill', 'points', 'family'])
  assert.deepEqual(ahmed.map((m) => m.display), ['1,250', '180', '42', '350', 'EGP 300', '2,450', '0/2'])
  assert.equal(ahmed.find((m) => m.id === 'bill').tone, 'due', 'due in three days, auto-pay off')
  assert.ok(!glanceFor(facts('mariam')).some((m) => m.id === 'dsl'), 'no home internet, no DSL cell')
  assert.equal(glanceFor(facts('karim')).find((m) => m.id === 'data').tone, 'low')
  assert.deepEqual(glanceFor(facts('ahmed', { glance: ['points', 'minutes'] })).map((m) => m.id), ['points', 'minutes'])
})

/* ------------------------------------------------------------------ store */

test('store: activating, inviting and redeeming update the whole view', () => {
  const store = createStore({ profileId: 'ahmed', storage: memory(), now: () => NOW })
  const events = []
  store.subscribe((view, event) => events.push(event.type))
  store.activate('entertainment-pack')
  assert.equal(store.view.entertainment.used, 5, 'Yango Play takes a spot: 5/6, as on My Lines')
  assert.equal(store.view.items.get('entertainment-pack').state, 'active')
  assert.equal(store.view.progress.claimed, 1)
  assert.equal(store.activate('entertainment-pack'), null, 'cannot activate twice')

  const before = store.view.items.get('elite-plus').score
  store.invite({ name: 'Salma' })
  store.invite({ name: 'Omar' })
  assert.equal(store.view.spots.family.left, 0)
  assert.equal(store.invite({ name: 'One more' }), null, 'no spot left')
  assert.ok(store.view.items.get('elite-plus').score > before, 'a full family lifts the upgrade')
  assert.equal(store.view.items.get('elite-plus').reasons[0], 'All 2 family spots are taken')

  store.redeemPoints()
  assert.equal(store.view.points.balance, 1450)
  store.payBill()
  assert.equal(store.view.glance.find((m) => m.id === 'bill').caption, 'Paid')
  assert.deepEqual(events, ['activated', 'invited', 'invited', 'redeemed-points', 'paid'])
})

test('store: remembered per customer in this browser, and reset', () => {
  const storage = memory()
  const first = createStore({ profileId: 'ahmed', storage, now: () => NOW })
  first.claim('talabat-pro')
  assert.equal(JSON.parse(storage.data[STORE_KEY]).profiles.ahmed.states['talabat-pro'], 'claimed')
  const again = createStore({ profileId: 'ahmed', storage, now: () => NOW })
  assert.equal(again.view.items.get('talabat-pro').state, 'claimed')
  assert.equal(createStore({ profileId: 'karim', storage, now: () => NOW }).view.items.get('talabat-pro').state, 'available')
  again.reset()
  assert.equal(again.view.items.get('talabat-pro').state, 'available')
  assert.deepEqual(readSaved(memory({ [STORE_KEY]: '{bad json' })), { v: 1, profiles: {} })
  assert.equal(PROFILES.ahmed.family.members.length, 0, 'the base profile is never changed')
  assert.equal(applySaved(PROFILES.ahmed, { pointsSpent: 99999 }).points.balance, 0)
})

/* ------------------------------------------------------- topics and bento */

test('topics: every Dock icon has a topic, and every widget metric and old anchor lands on one', () => {
  assert.deepEqual([...CATEGORIES, ...LIFESTYLE].map((c) => c.id).sort(), [...DOCK_TOPICS].sort())
  assert.equal(new Set(TOPICS.map((t) => t.id)).size, TOPICS.length, 'unique ids')
  for (const target of ['points', 'family', 'bill', 'home', 'entertainment', 'unclaimed', 'recommended', 'brands', 'experiences', 'roaming-ready', 'befit', 'talabat-pro']) {
    assert.ok(topicFor(target), `${target} has a topic`)
  }
  assert.equal(topicFor('unclaimed'), 'for-you')
  assert.equal(topicFor('lifestyle'), 'lifestyle')
  assert.equal(topicFor('nothing-like-this'), null)
})

test('topics: ranked by their best item, the customer’s best topic leads the spotlight', () => {
  const expected = { ahmed: 'for-you', mariam: 'red-shopping', karim: 'lifestyle' }
  for (const [id, first] of Object.entries(expected)) {
    const view = personalize(PROFILES[id], { now: NOW })
    const ranked = rankTopics(view)
    assert.equal(defaultTopic(view), first, `${id} opens on ${first}`)
    for (let i = 1; i < ranked.length; i++) assert.ok(ranked[i - 1].score >= ranked[i].score, `${id}: sorted by score`)
    for (const always of ['entertainment', 'family', 'bill']) assert.ok(ranked.some((t) => t.id === always), `${id}: ${always} is always there`)
    for (const topic of ranked) assert.ok(topic.hook && topic.label, `${id}: ${topic.id} has a label and a hook`)
    assert.deepEqual(rankTopics(view), ranked, `${id}: the same input gives the same order`)
  }
  // Karim flies to Dubai next week: roaming is one of his first topics; Mariam has no home internet.
  const karim = rankTopics(personalize(PROFILES.karim, { now: NOW })).map((t) => t.id)
  assert.ok(karim.indexOf('roaming') <= 1)
  assert.ok(!rankTopics(personalize(PROFILES.mariam, { now: NOW })).some((t) => t.id === 'home'))
})

test('topics: hooks and membership follow the store (a topic with nothing left to show leaves)', () => {
  const store = createStore({ profileId: 'ahmed', storage: null, now: () => NOW })
  const forYou = () => rankTopics(store.view).find((t) => t.id === 'for-you')
  assert.equal(forYou().hook, '2 perks not switched on')
  store.activate('entertainment-pack')
  assert.equal(forYou().hook, '1 perk not switched on')
  store.activate('family-share')
  assert.equal(forYou(), undefined, 'nothing left to switch on')
  assert.ok(rankTopics(store.view).some((t) => t.id === 'entertainment'), 'entertainment stays')
})

test('the Dock offers only the categories a customer has, in their two groups', () => {
  const ahmed = dockCategories(personalize(PROFILES.ahmed, { now: NOW }))
  assert.equal(ahmed.length, 8)
  assert.deepEqual([...new Set(ahmed.map((c) => c.group))], ['explore', 'lifestyle'])
  const mariam = dockCategories(personalize(PROFILES.mariam, { now: NOW })).map((c) => c.id)
  assert.ok(!mariam.includes('home'), 'no home internet, no Home Connectivity icon')
  assert.equal(mariam.length, 7)
  // claiming never takes an icon away
  const store = createStore({ profileId: 'ahmed', storage: null, now: () => NOW })
  for (const item of [...store.view.items.values()].filter((i) => i.state === 'available')) store.claim(item.id)
  assert.equal(dockCategories(store.view).length, 8)
})

test('bento: every row closes, in two columns and in four, with the wide tiles first', () => {
  const closes = (spans, columns) => {
    let col = 0
    for (const span of spans) {
      if (col + span > columns) return false
      col = (col + span) % columns
    }
    return col === 0
  }
  for (const columns of [2, 4]) {
    for (let count = 1; count <= 20; count++) {
      const spans = bentoSpans(count, columns)
      assert.equal(spans.length, count)
      assert.ok(closes(spans, columns), `${count} tiles in ${columns} columns: ${spans}`)
      const firstNarrow = spans.indexOf(1)
      if (firstNarrow > 0) assert.ok(spans.slice(firstNarrow).every((s) => s === 1) || spans.at(-1) > 1, 'wide tiles come first')
    }
  }
  assert.deepEqual(bentoSpans(7, 2), [2, 1, 1, 1, 1, 1, 1])
  assert.deepEqual(bentoSpans(7, 4), [2, 1, 1, 1, 1, 1, 1])
  assert.deepEqual(bentoSpans(6, 4), [2, 2, 1, 1, 1, 1])
  assert.deepEqual(bentoSpans(1, 4), [4], 'a lone tile takes the row')
  assert.deepEqual(bentoSpans(0, 4), [])
})

test('the demo profile comes from ?pz=', () => {
  assert.equal(resolveProfileId('?pz=karim'), 'karim')
  assert.equal(resolveProfileId('?pz=nobody'), 'ahmed')
  assert.equal(resolveProfileId(''), 'ahmed')
})
