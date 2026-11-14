/**
 * The Pocket's portal transition (ADR-0005): the pure parts. Camera and projection, the
 * wall's fall, the destination's approach (including waiting for a slow page), which clicks
 * are intercepted, configuration and the embedding policy. The DOM side is covered by
 * tests/e2e/portal_e2e.py.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bumpEase, cubicBezier, depthFor, fogAt, splitApproach, hermite, liftAt, perspectiveFor, planApproach, planFall, planPushedFall, project, scaleAt, strideAt, walkedFor } from '../src/pocket/portal/motion.js'
import { readFileSync } from 'node:fs'
import { KEEP_LIVE, OVERLAY_Z } from '../src/pocket/portal/wall.js'
import { whyNotEligible, linkFrom, scopeFor, installInterceptor } from '../src/pocket/portal/interceptor.js'
import { PORTAL_DEFAULTS, resolvePortalConfig, timingFor } from '../src/pocket/portal/config.js'
import { embedModeFor, inertDocument, navigationAttributes, roughText, whyNotDrawn, FRAME_POLICY } from '../src/pocket/portal/handoff.js'

const close = (actual, expected, epsilon = 1e-6) => assert.ok(Math.abs(actual - expected) < epsilon, `${actual} ≈ ${expected}`)
const HALF = Math.PI / 2

/* ------------------------------------------------------------------ camera */

test('the camera projects like CSS perspective with a centred origin', () => {
  const camera = { W: 1440, H: 900, cx: 720, cy: 450, P: perspectiveFor(1440, 900) }
  assert.equal(camera.P, 1656)
  // On the screen plane nothing moves.
  const p = project(camera, 100, 800, 0)
  close(p.x, 100)
  close(p.y, 800)
  // Twice the perspective away, everything is a third of its size around the centre.
  const q = project(camera, 1440, 900, -2 * camera.P)
  close(q.x, 720 + 720 / 3)
  close(q.y, 450 + 450 / 3)
  // depthFor and scaleAt are inverses.
  for (const s of [0.1, 0.19, 0.5, 0.99]) close(scaleAt(camera.P, depthFor(camera.P, s)), s)
  assert.ok(perspectiveFor(390, 844) >= 900, 'phones keep enough depth')
})

test('haze grows with distance and is zero on the screen plane', () => {
  close(fogAt(0, 1000), 0)
  assert.ok(fogAt(-500, 1000) < fogAt(-3000, 1000))
  assert.ok(fogAt(-20000, 1000) > 0.99)
})

test('the portal floats when far and lands exactly on the viewport', () => {
  close(liftAt(0, 45, 580), 0)
  assert.ok(liftAt(-6000, 45, 580) > 44)
  let previous = 0
  for (let z = 0; z >= -3000; z -= 100) {
    const lift = liftAt(z, 45, 580)
    assert.ok(lift >= previous - 1e-9, 'never dips on the way')
    previous = lift
  }
})

/* ------------------------------------------------------------------ the wall */

test('the wall starts slowly, accelerates, lands at the planned time and comes to rest', () => {
  const fall = planFall({ duration: 1000 })
  assert.equal(fall.landAt, 1000)
  assert.ok(fall.endAt > fall.landAt && fall.endAt < 1600, `rest at ${fall.endAt}`)
  const quarter = fall.angleAt(250)
  const half = fall.angleAt(500)
  const three = fall.angleAt(750)
  assert.ok(quarter < 0.3 && quarter > 0.03, 'slow start')
  assert.ok(half - quarter < three - half, 'accelerating')
  close(fall.angleAt(1000), HALF, 0.02)
  close(fall.angleAt(fall.endAt + 1), HALF)
})

test('the landing is cushioned: it meets the floor slowly, barely rebounds, never passes it', () => {
  const { wall, timing } = PORTAL_DEFAULTS
  const fall = planFall({ duration: timing.fall, th0: 0, w0: 0, shove: wall.shove, shoveFor: wall.shoveFor, cushion: wall.cushion, from: wall.cushionFrom, bounce: wall.bounce })
  let lowest = HALF
  let peak = 0
  for (let ms = 0; ms < fall.endAt + 200; ms += 2) {
    const angle = fall.angleAt(ms)
    assert.ok(angle <= HALF + 1e-9, `through the floor at ${ms}`)
    if (ms > fall.landAt) lowest = Math.min(lowest, angle)
    if (ms >= 16 && ms <= fall.landAt) peak = Math.max(peak, angle - fall.angleAt(ms - 16))
  }
  const contact = fall.angleAt(fall.landAt) - fall.angleAt(fall.landAt - 16)
  assert.ok(contact < peak * 0.35, `meets the floor at ${(contact / peak).toFixed(2)} of its top speed`)
  const rebound = ((HALF - lowest) * 180) / Math.PI
  assert.ok(rebound < 1, `rebound ${rebound.toFixed(2)}°`)
  // From rest: the first frame barely moves (it starts without a kick: under half a degree).
  assert.ok(((fall.angleAt(16) - fall.angleAt(0)) * 180) / Math.PI < 0.5)
})

test('let go, the wall moves at once: no hang near upright, half way down by mid-fall', () => {
  const { wall, timing } = PORTAL_DEFAULTS
  const shoved = planFall({ duration: timing.fall, th0: 0, w0: 0, shove: wall.shove, shoveFor: wall.shoveFor, cushion: wall.cushion, from: wall.cushionFrom, bounce: wall.bounce })
  const deg = (ms) => (shoved.angleAt(ms) * 180) / Math.PI
  assert.ok(deg(timing.fall * 0.2) > 5, `tipping by a fifth of the fall: ${deg(timing.fall * 0.2).toFixed(1)}°`)
  assert.ok(deg(timing.fall * 0.5) > 30 && deg(timing.fall * 0.5) < 50, `about half way down at mid-fall: ${deg(timing.fall * 0.5).toFixed(1)}°`)
  // A pure fall from upright (no shove) hangs: still under 15° at mid-fall.
  const hanging = planFall({ duration: timing.fall, th0: 0.035, w0: 0, cushion: wall.cushion, from: wall.cushionFrom, bounce: wall.bounce })
  assert.ok((hanging.angleAt(timing.fall * 0.5) * 180) / Math.PI < 15)
})

test('the cue sheet overlaps: nothing waits for the phase before it to finish', () => {
  const { timing } = PORTAL_DEFAULTS
  assert.equal(timing.walk, undefined, 'no cue for the walk: the viewer moves from the click')
  assert.ok(timing.rise <= 700, 'the light is up while the wall is still going')
  assert.ok(timing.ignite < 400, 'the portal glows while the wall still hides it')
  assert.ok(timing.arrive > 3000 && timing.arrive < 4000, 'about 3.3 s in all')
})

/** The walking viewer's move and the wall it pushes, as the controller plans them. */
const walkPlan = ({ W, H, narrow = false }) => {
  const { portal, camera, wall, timing } = PORTAL_DEFAULTS
  const P = perspectiveFor(W, H)
  const startScale = narrow ? portal.startScale.narrow : portal.startScale.wide
  const plan = splitApproach({ P, startScale, travel: camera.travel * P, viewer: bumpEase(...camera.ease), door: bumpEase(...portal.ease) })
  const approach = planApproach({ startScale, duration: timing.arrive, hold: timing.hold, shape: plan.shape })
  const walked = (ms) => plan.walkedAt(approach.plannedScale(ms))
  const reach = (ms) => walked(ms) / plan.travel
  const [gap, full] = camera.push
  const fall = planPushedFall({ reach, gap, lever: full - gap, soft: camera.contact, gravity: wall.gravity, cushion: wall.cushion, from: wall.cushionFrom, bounce: wall.bounce })
  // How much bigger the page (the wall, upright at the screen plane) looks as the viewer closes in.
  const zoom = (ms) => P / (P - walked(ms))
  return { P, startScale, plan, approach, walked, reach, zoom, fall, gap, lever: full - gap, soft: Math.min(camera.contact, gap) }
}

for (const screen of [{ W: 1440, H: 900 }, { W: 390, H: 844, narrow: true }]) {
  test(`the viewer pushes the wall over and never passes through it, timed the same on every screen (${screen.W} × ${screen.H})`, () => {
    const { reach, fall, gap, lever, soft, zoom } = walkPlan(screen)
    const deg = (ms) => (fall.angleAt(ms) * 180) / Math.PI
    // Upright until the viewer's eye reaches it.
    for (let ms = 0; reach(ms) < gap - soft; ms += 4) assert.ok(deg(ms) < 0.01, `untouched at ${ms} ms`)
    // Its eye-height point is always at least as far as the viewer has pushed (one-sided contact).
    const touching = (x) => (x <= -soft ? 0 : x >= soft ? x : ((x + soft) * (x + soft)) / (4 * soft))
    for (let ms = 0; ms < fall.landAt; ms += 2) {
      assert.ok(lever * Math.tan(fall.angleAt(ms)) >= touching(reach(ms) - gap) - 1e-4, `never passed through at ${ms} ms`)
    }
    // Pushed, then falling free: it lets go of the viewer before it lands, and lands within a second.
    assert.ok(fall.lastTouch > 0 && fall.lastTouch < fall.landAt, `pushed until ${fall.lastTouch} ms, lands ${fall.landAt} ms`)
    assert.ok(fall.landAt < 750, `down by ${fall.landAt} ms`)
    // It tips early, already pushed by a viewer who is moving in (the page bigger on screen), and
    // falls while they keep coming: tipping within 0.15 s, past 5° by 0.25 s, past 45° by 0.45 s,
    // down by 0.75 s, on every screen.
    let tips = 0
    while (deg(tips) < 1) tips += 4
    assert.ok(tips < 150 && zoom(tips) > 1.01, `the page ${((zoom(tips) - 1) * 100).toFixed(1)}% bigger when it starts to tip (${tips} ms)`)
    assert.ok(deg(250) > 5, `${deg(250).toFixed(1)}° at 0.25 s`)
    assert.ok(deg(450) > 45, `${deg(450).toFixed(1)}° at 0.45 s`)
    // Smooth: from rest, no jolt at the first touch or when it lets go (change of speed per frame;
    // the push is hard and fast, about 0.034 rad at its strongest, but it builds and fades over
    // several frames rather than in one).
    let top = 0
    let before = 0
    for (let ms = 16; ms < fall.landAt - 16; ms += 4) {
      const kick = Math.abs(fall.angleAt(ms + 16) - 2 * fall.angleAt(ms) + fall.angleAt(ms - 16))
      assert.ok(kick < 0.04, `no jolt at ${ms} ms (${kick.toFixed(4)} rad)`)
      assert.ok(Math.abs(kick - before) < 0.01, `the push builds and fades smoothly at ${ms} ms`)
      before = kick
      top = Math.max(top, fall.angleAt(ms + 4) - fall.angleAt(ms))
    }
    // Cushioned: it meets the floor well under its top speed, and never passes it.
    const landing = fall.angleAt(fall.landAt) - fall.angleAt(fall.landAt - 4)
    assert.ok(landing < top * 0.4, `meets the floor at ${(landing / top).toFixed(2)} of its top speed`)
    for (let ms = 0; ms < fall.endAt + 100; ms += 4) assert.ok(fall.angleAt(ms) <= Math.PI / 2 + 1e-9)
  })
}

test('the viewer moves in from the click, faster and faster through the wall, and both ease out into the page', () => {
  for (const ease of [bumpEase(...PORTAL_DEFAULTS.portal.ease), bumpEase(...PORTAL_DEFAULTS.camera.ease)]) {
    close(ease(0), 0)
    close(ease(1), 1)
    for (let x = 0.01; x <= 1; x += 0.01) assert.ok(ease(x) >= ease(x - 0.01))
  }
  const { approach, zoom, fall, P, walked } = walkPlan({ W: 1440, H: 900 })
  const T = PORTAL_DEFAULTS.timing.arrive
  // The camera moves in on the page from the click, easing in: 2% bigger by 0.15 s, then faster
  // and faster on screen while it is pushed over, never standing still while it falls.
  assert.ok(zoom(150) > 1.02, `the page ${((zoom(150) - 1) * 100).toFixed(1)}% bigger by 0.15 s`)
  assert.ok(zoom(300) - 1 > 3 * (zoom(150) - 1) && zoom(450) - 1 > 2 * (zoom(300) - 1), 'gathering speed')
  for (let ms = 32; ms < fall.landAt; ms += 16) assert.ok(zoom(ms) - zoom(ms - 16) > zoom(ms - 16) - zoom(ms - 32) - 1e-6, `still speeding up into the wall at ${ms} ms`)
  assert.ok(walked(fall.landAt) > 0.35 * P, 'well through where the wall stood by the time it lands')
  // On screen: one rise to a top speed, then a steady deceleration, never a constant glide.
  const speed = []
  for (let ms = 16; ms <= T; ms += 16) speed.push(1440 * (approach.plannedScale(ms) - approach.plannedScale(ms - 16)))
  const peak = speed.indexOf(Math.max(...speed))
  for (let i = 1; i <= peak; i++) assert.ok(speed[i] >= speed[i - 1] - 0.05, `speeding up until its peak (frame ${i})`)
  for (let i = peak + 1; i < speed.length; i++) assert.ok(speed[i] <= speed[i - 1] + 0.05, `slowing down after its peak (frame ${i})`)
  assert.ok(peak * 16 > T * 0.45 && peak * 16 < T * 0.65, `fastest on screen at ${peak * 16} ms`)
  // A real ease-out: its last tenth of size takes about a third of the move.
  let at90 = 0
  while (approach.plannedScale(at90) < 0.9) at90 += 4
  assert.ok(T - at90 >= 0.3 * T, `the last tenth takes ${T - at90} ms`)
  // The ease-out takes about as long as the ease-in, and the destination never rushes at the eye:
  // from its fastest to the arrival takes at least 0.7 of the time to its fastest, and in its last
  // 0.4 s it grows by under 2 px a frame (at 1440 wide).
  let arrive = 0
  while ((1 - approach.plannedScale(arrive)) * 1440 >= 0.6) arrive += 4
  assert.ok(arrive - peak * 16 >= 0.7 * peak * 16, `easing out over ${arrive - peak * 16} ms after ${peak * 16} ms easing in`)
  for (let ms = arrive - 400; ms <= arrive; ms += 16) assert.ok(1440 * (approach.plannedScale(ms) - approach.plannedScale(ms - 16)) < 2, `slow at ${ms} ms`)
  // And the plan the clock follows is the planned one when the page is ready.
  for (const ms of [0, 400, 1200, 2400, T]) close(approach.at(ms, true).scale, Math.min(1, approach.plannedScale(ms)), 1e-9)
})

/* ------------------------------------------------------------------ the approach */

test('cubic-bezier matches CSS endpoints and is monotonic for an ease', () => {
  const curve = cubicBezier(0.6, 0, 0.35, 1)
  close(curve(0), 0)
  close(curve(1), 1)
  let previous = 0
  for (let t = 0.01; t <= 1; t += 0.01) {
    assert.ok(curve(t) >= previous - 1e-9)
    previous = curve(t)
  }
})

test('Hermite joins position and speed at both ends', () => {
  const h = hermite(-1, 0.002, 0, 0, 1000)
  close(h(0).value, -1)
  close(h(0).slope, 0.002, 1e-9)
  close(h(1000).value, 0)
  close(h(1000).slope, 0, 1e-9)
})

const run = (approach, readyAt, until = 6000) => {
  const frames = []
  for (let ms = 0; ms <= until; ms += 16) frames.push({ ms, ...approach.at(ms, ms >= readyAt) })
  return frames
}

/** The planned curve's own largest change of speed between frames: the bar for every other path. */
const PLAN_JERK = (() => {
  const frames = run(planApproach({ startScale: 0.19, duration: 2100, hold: 0.2 }), 0)
  let most = 0
  for (let i = 2; i < frames.length; i++) {
    if (frames[i].phase === 'arrived') break
    most = Math.max(most, Math.abs(frames[i].u - 2 * frames[i - 1].u + frames[i - 2].u) / 16)
  }
  return most
})()

const assertSmooth = (frames) => {
  for (let i = 2; i < frames.length; i++) {
    const a = frames[i - 2]
    const b = frames[i - 1]
    const c = frames[i]
    if (c.phase === 'arrived' || b.phase === 'arrived') continue
    const change = Math.abs(c.u - 2 * b.u + a.u) / 16
    assert.ok(change <= PLAN_JERK * 1.25 + 1e-9, `speed jumps at ${c.ms} ms (${change} vs the plan's ${PLAN_JERK})`)
    assert.ok(c.u >= b.u - 1e-9, `moves backwards at ${c.ms} ms`)
  }
}

test('ready from the start: slow, faster, then a precise stop on the viewport', () => {
  const approach = planApproach({ startScale: 0.19, duration: 2100, hold: 0.2 })
  const frames = run(approach, 0)
  assertSmooth(frames)
  close(frames[0].scale, 0.19, 1e-6)
  const arrived = frames.find((f) => f.phase === 'arrived')
  assert.ok(arrived && arrived.ms >= 2100 && arrived.ms < 2100 + 17, `arrived at ${arrived?.ms}`)
  // Slow at both ends, fastest in between (in how fast it grows).
  const speed = (ms) => frames.find((f) => f.ms >= ms).slope
  assert.ok(speed(100) < speed(900) && speed(2000) < speed(900))
  close(frames.at(-1).scale, 1)
})

test('a slow page: it eases into a hover at about a third of the screen, then finishes smoothly', () => {
  const approach = planApproach({ startScale: 0.19, duration: 2100, hold: 0.2 })
  const frames = run(approach, 3200)
  assertSmooth(frames)
  const hovering = frames.filter((f) => f.phase === 'hover')
  assert.ok(hovering.length > 50, 'it waits')
  const highest = Math.max(...hovering.map((f) => f.scale))
  assert.ok(highest > 0.22 && highest < 0.4, `hovers at ${highest.toFixed(3)}`)
  const arrived = frames.find((f) => f.phase === 'arrived')
  assert.ok(arrived.ms > 3200 && arrived.ms <= 3200 + 2100 * 0.75 + 32, `finishes ${arrived.ms - 3200} ms after ready`)
})

test('ready while it is braking: it turns straight into the finish, still smooth', () => {
  const approach = planApproach({ startScale: 0.19, duration: 2100, hold: 0.2 })
  const frames = run(approach, 700)
  assertSmooth(frames)
  assert.ok(frames.some((f) => f.phase === 'hover') && frames.at(-1).phase === 'arrived')
})

/* ------------------------------------------------------------------ the interceptor */

const fakeLink = (attrs = {}, { inside = null } = {}) => ({
  getAttribute: (name) => (name in attrs ? attrs[name] : null),
  hasAttribute: (name) => name in attrs,
  closest: (selector) => (inside && selector.includes(inside) ? {} : null),
})
const click = (extra = {}) => ({ button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, defaultPrevented: false, ...extra })
const HERE = 'https://web.vodafone.com.eg/en/services'
const hosts = PORTAL_DEFAULTS.hosts
const why = (link, event = click(), here = HERE) => whyNotEligible({ event, link, here, hosts, excluded: (l) => Boolean(l.closest('[data-portal="off"]')) })

test('a plain click on a same-tab link to a Vodafone page is intercepted', () => {
  assert.equal(why(fakeLink({ href: 'https://web.vodafone.com.eg/en/vodafone-cash' })), '')
  assert.equal(why(fakeLink({ href: '/spa/roaming?x=1#top' })), '')
  assert.equal(why(fakeLink({ href: 'https://eshop.vodafone.com.eg/en/', target: '_self' })), '')
})

test('new tabs, downloads, modified and non-primary clicks are left to the browser', () => {
  const link = fakeLink({ href: '/en/vodafone-cash' })
  assert.equal(why(fakeLink({ href: '/en/vodafone-cash', target: '_blank' })), 'other-target')
  assert.equal(why(fakeLink({ href: '/en/vodafone-cash', target: 'somewhere' })), 'other-target')
  assert.equal(why(fakeLink({ href: '/guide.pdf', download: '' })), 'download')
  for (const key of ['metaKey', 'ctrlKey', 'shiftKey', 'altKey']) assert.equal(why(link, click({ [key]: true })), 'modified-click')
  assert.equal(why(link, click({ button: 1 })), 'not-primary-button')
  assert.equal(why(link, click({ defaultPrevented: true })), 'handled')
})

test('same-page jumps, other schemes, other sites and opted-out links are left alone', () => {
  assert.equal(why(fakeLink({ href: '#pocket' })), 'same-page')
  assert.equal(why(fakeLink({ href: '/en/services#cash' })), 'same-page')
  assert.equal(why(fakeLink({ href: 'mailto:help@vodafone.com.eg' })), 'not-http')
  assert.equal(why(fakeLink({ href: 'tel:888' })), 'not-http')
  assert.equal(why(fakeLink({ href: 'https://www.facebook.com/Vodafone.Egypt/' })), 'other-host')
  assert.equal(why(fakeLink({ href: 'https://evilvodafone.com.eg.example/' })), 'other-host')
  assert.equal(why(fakeLink({ href: '/en/home', 'data-portal': 'off' }, { inside: 'data-portal' })), 'excluded')
  assert.equal(why(null), 'no-link')
})

test('the local clone counts as its own origin', () => {
  assert.equal(why(fakeLink({ href: '/ar/' }), click(), 'http://127.0.0.1:5200/'), '')
  assert.equal(why(fakeLink({ href: 'https://web.vodafone.com.eg/en/home' }), click(), 'http://127.0.0.1:5200/'), '')
})

test('linkFrom finds the link around an icon inside it', () => {
  const link = { closest: () => link }
  const icon = { nodeType: 1, closest: () => link }
  assert.equal(linkFrom(icon), link)
  assert.equal(linkFrom({ nodeType: 3, parentElement: icon }), link)
  assert.equal(linkFrom(null), null)
})

/* ------------------------------------------------------------------ configuration */

test('configuration: defaults, options, then URL parameters', () => {
  const plain = resolvePortalConfig({}, '')
  assert.equal(plain.enabled, true)
  assert.equal(plain.destination.embed, 'same-origin')
  assert.equal(plain.destination.scripts, false)
  const tuned = resolvePortalConfig({ speed: 2, light: { red: 0.4 } }, '')
  assert.equal(tuned.speed, 2)
  assert.equal(tuned.light.red, 0.4)
  assert.equal(tuned.light.glare, PORTAL_DEFAULTS.light.glare, 'nested defaults kept')
  assert.equal(resolvePortalConfig({}, '?portal=off').enabled, false)
  assert.equal(resolvePortalConfig({}, '?portal-speed=0.5').speed, 0.5)
  assert.equal(resolvePortalConfig({}, '?portal-embed=never').destination.embed, 'never')
  assert.equal(resolvePortalConfig({}, '?portal-embed=sideways').destination.embed, 'same-origin', 'unknown values ignored')
  assert.ok(resolvePortalConfig({}, '').hosts[0] instanceof RegExp, 'patterns survive the merge')
})

test('the world: a glowing white space by default (no mist), the misty void and the hall on request', () => {
  assert.equal(resolvePortalConfig({}, '').tunnel.style, 'glow')
  assert.equal(resolvePortalConfig({}, '?portal-world=mist').tunnel.style, 'mist')
  assert.equal(resolvePortalConfig({}, '?portal-world=hall').tunnel.style, 'hall')
  assert.equal(resolvePortalConfig({ tunnel: { style: 'hall' } }, '').tunnel.style, 'hall')
  assert.equal(resolvePortalConfig({}, '?portal-world=space').tunnel.style, 'glow', 'unknown worlds ignored')
  const { glow, mist } = PORTAL_DEFAULTS
  assert.ok(glow.light > 0 && glow.light <= 1, 'the light behind the portal glows')
  assert.equal(glow.rays, 0, 'a pure glow: no shafts through a fog that is not there')
  assert.ok(glow.grain >= 0 && glow.grain < 0.01, 'only a dither, too fine to see')
  assert.ok(mist.depth > 0 && mist.depth < 1, 'the far portal is never fully lost in the fog')
  assert.ok(mist.grain > 0 && mist.grain < 0.05, 'grain stays fine')
})

test('the mist glows: lit by a light behind the portal, on by default and tunable', () => {
  const { mist } = PORTAL_DEFAULTS
  for (const key of ['glow', 'rays', 'lit']) assert.ok(mist[key] > 0 && mist[key] <= 1, `${key} on and within 0..1`)
  assert.ok(mist.cover[0] < mist.cover[1] && mist.cover[0] >= 0 && mist.cover[1] <= 1, 'mist begins before it is thickest')
  const dimmer = resolvePortalConfig({ tunnel: { style: 'mist' }, mist: { glow: 0.5 } }, '')
  assert.equal(dimmer.mist.glow, 0.5)
  assert.deepEqual(dimmer.mist.cover, mist.cover, 'one knob changed, the rest kept')
})

test('the viewer and the destination share the way: each only goes forward, together they close it', () => {
  const P = perspectiveFor(1440, 900)
  const s0 = 0.17
  const viewer = bumpEase(...PORTAL_DEFAULTS.camera.ease)
  const door = bumpEase(...PORTAL_DEFAULTS.portal.ease)
  const plan = splitApproach({ P, startScale: s0, travel: 2.2 * P, viewer, door })
  close(plan.shape(0), 0)
  close(plan.shape(1), 1, 1e-9)
  close(plan.walkedAt(s0), 0)
  close(plan.walkedAt(1), 2.2 * P, 1e-6)
  close(plan.ownAt(1), 1, 1e-9)
  let lastWalked = -1
  let lastOwn = -1
  for (let x = 0; x <= 1; x += 0.005) {
    const scale = Math.exp(Math.log(s0) * (1 - plan.shape(x)))
    // How far the viewer has come is the viewer's own plan at that moment.
    close(plan.walkedAt(scale), 2.2 * P * viewer(x), 0.5)
    assert.ok(plan.walkedAt(scale) >= lastWalked - 1e-6 && plan.ownAt(scale) >= lastOwn - 1e-9, `forward only at ${x.toFixed(3)}`)
    lastWalked = plan.walkedAt(scale)
    lastOwn = plan.ownAt(scale)
  }
  // The viewer's move never goes past the whole way (a short way: the viewer does it all).
  close(splitApproach({ P, startScale: 0.6, travel: 9 * P, viewer, door }).walkedAt(1), walkedFor(P, 0.6, 1), 1e-6)
})

test('walking to a still door looks, for the door, exactly like the door coming to you', () => {
  const P = perspectiveFor(1440, 900)
  const s0 = 0.17
  const door = -P * (1 / s0 - 1) // where the door stands, seen from where the viewer starts
  assert.equal(walkedFor(P, s0, s0), 0, 'nothing walked at the start')
  for (const scale of [0.2, 0.35, 0.6, 0.9, 1]) {
    const walked = walkedFor(P, s0, scale)
    // The door's depth from the walked eye is the depth that makes it look `scale` big.
    assert.ok(Math.abs(door + walked - -P * (1 / scale - 1)) < 1e-6, `same depth at scale ${scale}`)
    assert.ok(Math.abs(scaleAt(P, door + walked) - scale) < 1e-9)
  }
  assert.ok(Math.abs(walkedFor(P, s0, 1) - -door) < 1e-6, 'arriving means standing where the door is seen as the screen')
  // The walk only ever goes forward.
  let last = -1
  for (let s = s0; s <= 1; s += 0.01) {
    const w = walkedFor(P, s0, s)
    assert.ok(w > last)
    last = w
  }
})

test('the steps: still at the start, gone before the arrival, smooth and small in between', () => {
  const base = { height: 900, bob: 0.0045, steps: 1.8, sway: 0.7 }
  assert.deepEqual(strideAt({ ...base, walking: 0, progress: 0 }), { x: 0, rise: 0 }, 'not walking yet')
  for (const progress of [0.75, 0.9, 1]) assert.deepEqual(strideAt({ ...base, walking: 1500, progress }), { x: 0, rise: 0 }, `gone by ${progress}`)
  assert.deepEqual(strideAt({ ...base, bob: 0, walking: 600, progress: 0.2 }), { x: 0, rise: 0 }, 'bob 0 is a glide')
  let max = 0
  let prev = strideAt({ ...base, walking: 0, progress: 0 })
  for (let ms = 1; ms <= 2000; ms += 1) {
    const now = strideAt({ ...base, walking: ms, progress: Math.min(1, ms / 2000) })
    max = Math.max(max, Math.abs(now.rise), Math.abs(now.x))
    // Never jumps: at most a small step per millisecond.
    assert.ok(Math.abs(now.rise - prev.rise) < 0.05 && Math.abs(now.x - prev.x) < 0.05, `smooth at ${ms} ms`)
    assert.ok(now.rise >= 0, 'the eye rises from where it was, never dips below')
    prev = now
  }
  assert.ok(max > 2 && max <= 0.0045 * 900 + 1e-9, `small: ${max.toFixed(2)} px at most`)
})

test('the viewer walks by default; ?portal-camera=still keeps them still', () => {
  assert.equal(resolvePortalConfig({}, '').camera.mode, 'walk')
  assert.equal(resolvePortalConfig({}, '?portal-camera=still').camera.mode, 'still')
  assert.equal(resolvePortalConfig({ camera: { mode: 'still' } }, '?portal-camera=walk').camera.mode, 'walk', 'the URL wins')
  assert.equal(resolvePortalConfig({}, '?portal-camera=fly').camera.mode, 'walk', 'unknown modes ignored')
  const { camera } = PORTAL_DEFAULTS
  assert.ok(camera.wash > 0 && camera.wash < 0.45, 'the fallen page stays in sight (and keeps its 3D: fading the slab flattens it)')
  assert.ok(camera.bob >= 0 && camera.bob < 0.01, 'the steps stay gentle')
})

test('speed scales durations but not fractions', () => {
  const timing = timingFor({ ...PORTAL_DEFAULTS, speed: 0.5 })
  assert.equal(timing.fall, PORTAL_DEFAULTS.timing.fall * 2)
  assert.equal(timing.hold, PORTAL_DEFAULTS.timing.hold)
})

/* ------------------------------------------------------------------ embedding policy */

test('only same-origin pages (or allow-listed origins) are framed; others get the preview', () => {
  const config = resolvePortalConfig({}, '')
  assert.equal(embedModeFor('https://web.vodafone.com.eg/en/vodafone-cash', config, HERE), 'frame')
  assert.equal(embedModeFor('https://web.vodafone.com.eg/en/vodafone-cash', config, 'http://127.0.0.1:5200/'), 'preview')
  assert.equal(embedModeFor('https://eshop.vodafone.com.eg/en/', config, HERE), 'preview')
  const allow = resolvePortalConfig({ destination: { embed: 'allowlist', allow: ['https://eshop.vodafone.com.eg'] } }, '')
  assert.equal(embedModeFor('https://eshop.vodafone.com.eg/en/', allow, HERE), 'frame')
  const never = resolvePortalConfig({}, '?portal-embed=never')
  assert.equal(embedModeFor('https://web.vodafone.com.eg/en/vodafone-cash', never, HERE), 'preview')
})

/* ------------------------------------------------------------------ on Vodafone's live pages (S13) */

test('the clone keeps its behaviour: live, fetch-once, mark, wrap and labels are off by default', () => {
  const config = resolvePortalConfig({}, '')
  assert.equal(config.live, false)
  assert.equal(config.fetchOnce, false)
  assert.equal(config.stylesheet, null)
  assert.equal(config.labels, null)
  assert.equal(config.report, null)
  const node = {}
  assert.equal(config.mark(node), node, 'mark is the identity')
  const fn = () => {}
  assert.equal(config.wrap(fn), fn, 'wrap is the identity')
  assert.deepEqual(config.hosts, PORTAL_DEFAULTS.hosts)
  assert.equal(config.destination.embed, 'same-origin')
  assert.equal(resolvePortalConfig({ destination: { scripts: true } }, '').destination.scripts, true, 'the clone may still run scripts in the frame if asked')
})

test('live forces the page origin only, no scripts in the destination and the fetch-once frame', () => {
  const config = resolvePortalConfig({ live: true, hosts: [/./], destination: { scripts: true } }, '')
  assert.equal(config.live, true)
  assert.deepEqual(config.hosts, [], 'hosts: the page origin only')
  assert.equal(config.destination.scripts, false, 'scripts are off whatever the options say')
  assert.equal(config.fetchOnce, true, 'fetch-once by default on live')
  assert.equal(config.links, '.pocket-sticker a[href]')
  assert.equal(resolvePortalConfig({ live: true, links: '' }, '').links, '.pocket-sticker a[href]', 'an empty selector falls back to the stickers')
  // Without the fetch-once frame, live never loads a frame from the URL: the preview.
  const noFetch = resolvePortalConfig({ live: true, fetchOnce: false }, '?portal-embed=same-origin')
  assert.equal(noFetch.fetchOnce, false)
  assert.equal(noFetch.destination.embed, 'never')
  assert.equal(embedModeFor('https://web.vodafone.com.eg/en/vodafone-cash', noFetch, HERE), 'preview')
  // The host's functions come through.
  const mark = (n) => n
  const wrap = (f) => f
  const report = () => {}
  const stylesheet = () => {}
  const labels = { opening: (title) => `Opening ${title}` }
  const given = resolvePortalConfig({ live: true, mark, wrap, report, stylesheet, labels }, '')
  assert.equal(given.mark, mark)
  assert.equal(given.wrap, wrap)
  assert.equal(given.report, report)
  assert.equal(given.stylesheet, stylesheet)
  assert.equal(given.labels, labels)
  assert.equal(resolvePortalConfig({ live: true, labels: { opening: 'x' } }, '').labels, null, 'labels need an opening function')
  assert.equal(resolvePortalConfig({ live: true }, '?portal=off').enabled, false, 'the URL can still switch it off')
})

test("the host's checkpoint is kept when it is a function (a test's way to make a press fail), else none", () => {
  const checkpoint = () => {}
  assert.equal(resolvePortalConfig({ live: true, checkpoint }, '').checkpoint, checkpoint)
  assert.equal(resolvePortalConfig({ live: true, checkpoint: 'portal-start' }, '').checkpoint, null)
  assert.equal(resolvePortalConfig({}, '').checkpoint, null)
})

test('live hosts: only this page origin; eshop and other Vodafone hosts navigate natively', () => {
  const live = resolvePortalConfig({ live: true }, '')
  const w = (href) => whyNotEligible({ event: click(), link: fakeLink({ href }), here: HERE, hosts: live.hosts })
  assert.equal(w('/en/vodafone-cash'), '')
  assert.equal(w('https://web.vodafone.com.eg/ar/home'), '')
  assert.equal(w('https://eshop.vodafone.com.eg/en/'), 'other-host')
  assert.equal(w('http://www2.vf-live.com/VFHEProxy/index.aspx'), 'other-host')
  assert.equal(w('javascript:logoutKeyCloak()'), 'not-http')
})

/** A tiny tree: enough for matches() and contains(). */
const tree = () => {
  const node = (tag, classes = [], parent = null, attrs = {}) => {
    const n = {
      tag,
      classes,
      parent,
      attrs,
      nodeType: 1,
      getAttribute: (name) => (name in attrs ? attrs[name] : null),
      hasAttribute: (name) => name in attrs,
      contains: (other) => {
        for (let at = other; at; at = at.parent) if (at === n) return true
        return false
      },
      closest: (selector) => {
        for (let at = n; at; at = at.parent) if (at.tag === 'a' && 'href' in at.attrs && /a\[href\]/.test(selector)) return at
        return null
      },
      // Only what the live selector needs: an <a href> inside a .pocket-sticker.
      matches: (selector) => {
        if (selector !== '.pocket-sticker a[href]') throw new Error(`unexpected selector ${selector}`)
        if (tag !== 'a' || !('href' in attrs)) return false
        for (let at = parent; at; at = at.parent) if (at.classes.includes('pocket-sticker')) return true
        return false
      },
    }
    return n
  }
  const body = node('body')
  const header = node('header', [], body)
  const album = node('div', ['pocket-output'], body)
  const sticker = node('article', ['pocket-sticker'], album)
  const cta = node('a', ['pocket-sticker__cta'], sticker, { href: '/en/vodafone-cash', rel: 'noopener noreferrer' })
  const icon = node('span', [], cta)
  const otherInAlbum = node('a', [], album, { href: '/en/home' })
  const headerLink = node('a', [], header, { href: '/en/services' })
  const footerLink = node('a', [], body, { href: '/en/roaming', onclick: 'footerHandler(event)' })
  // A sticker-shaped link outside the album (e.g. a copy elsewhere on the page).
  const strayHost = node('article', ['pocket-sticker'], body)
  const stray = node('a', [], strayHost, { href: '/en/vodafone-cash' })
  return { body, album, cta, icon, otherInAlbum, headerLink, footerLink, stray }
}

test('live scope: only a sticker link inside the album root is in scope', () => {
  const t = tree()
  const inScope = scopeFor(t.album, '.pocket-sticker a[href]')
  assert.equal(inScope(t.cta), true)
  assert.equal(inScope(t.otherInAlbum), false, "the album's other links are not stickers")
  assert.equal(inScope(t.headerLink), false, "Vodafone's header")
  assert.equal(inScope(t.footerLink), false, "Vodafone's footer")
  assert.equal(inScope(t.stray), false, 'a sticker link outside the album')
  assert.equal(scopeFor(t.album, null)(t.headerLink), true, 'the clone: any link')
  const w = (link) => whyNotEligible({ event: click(), link, here: HERE, hosts: [], inScope })
  assert.equal(w(t.cta), '')
  assert.equal(w(t.headerLink), 'out-of-scope')
  assert.equal(w(t.footerLink), 'out-of-scope')
})

test('live interceptor: listens on the album root, takes only sticker clicks, and goes away on destroy', () => {
  const t = tree()
  const handlers = []
  t.album.addEventListener = (type, fn) => handlers.push([type, fn])
  t.album.removeEventListener = (type, fn) => handlers.splice(handlers.findIndex((h) => h[0] === type && h[1] === fn), 1)
  const saved = { location: globalThis.location, window: globalThis.window }
  globalThis.location = { href: HERE }
  globalThis.window = {}
  globalThis.window.top = globalThis.window
  try {
    const taken = []
    let wrapped = 0
    const interceptor = installInterceptor({
      root: t.album,
      links: '.pocket-sticker a[href]',
      active: () => true,
      hosts: [],
      exclude: null,
      onNavigate: ({ url }) => (taken.push(url), true),
      wrap: (fn) => (wrapped++, fn),
    })
    assert.equal(wrapped, 1, 'the click listener goes through wrap')
    assert.deepEqual(
      handlers.map((h) => h[0]),
      ['click'],
    )
    const fire = (target) => {
      const event = { ...click(), target, prevented: false, preventDefault: () => (event.prevented = true) }
      handlers[0][1](event)
      return event.prevented
    }
    assert.equal(fire(t.icon), true, 'a click on the icon inside the sticker link is taken')
    assert.deepEqual(taken, ['https://web.vodafone.com.eg/en/vodafone-cash'])
    // (On a page these never reach the album's listener; even if they did, they are left alone.)
    assert.equal(fire(t.otherInAlbum), false, "the album's other links are left alone")
    assert.equal(fire(t.headerLink), false, "Vodafone's header is never prevented")
    assert.equal(fire(t.footerLink), false, "Vodafone's footer is never prevented")
    assert.equal(fire(t.stray), false, 'a sticker link outside the album is left alone')
    assert.equal(taken.length, 1)
    interceptor.destroy()
    assert.equal(handlers.length, 0, 'destroy removes the listener')
  } finally {
    globalThis.location = saved.location
    globalThis.window = saved.window
  }
})

test('the real navigation is a fresh link: href, target, rel and referrer policy only', () => {
  const link = fakeLink({ href: '/en/roaming', id: 'f1', class: 'footer-link', onclick: 'footerHandler(event)', 'data-track': 'x', target: '_self', rel: 'noopener noreferrer', referrerpolicy: 'origin', hreflang: 'en' })
  const attrs = navigationAttributes(link, 'https://web.vodafone.com.eg/en/roaming')
  assert.deepEqual(attrs, {
    href: 'https://web.vodafone.com.eg/en/roaming',
    target: '_self',
    rel: 'noopener noreferrer',
    referrerpolicy: 'origin',
    class: 'vf-portal__go',
    'aria-hidden': 'true',
    tabindex: '-1',
  })
  assert.ok(!Object.keys(attrs).some((name) => /^on|^data-|^id$/.test(name)), 'no handlers, data or id')
  assert.deepEqual(navigationAttributes(fakeLink({ href: '/x' }), 'https://web.vodafone.com.eg/x'), { href: 'https://web.vodafone.com.eg/x', class: 'vf-portal__go', 'aria-hidden': 'true', tabindex: '-1' })
})

const response = ({ ok = true, status = 200, type = 'text/html; charset=utf-8', url = 'https://web.vodafone.com.eg/en/vodafone-cash' } = {}) => ({ ok, status, url, headers: { get: (name) => (name.toLowerCase() === 'content-type' ? type : null) } })
const PAGE = `<!doctype html><html><head><title>Vodafone Cash</title><script>track()</script></head><body><h1>Vodafone Cash</h1><p>${'Send and receive money from your mobile, pay bills and more. '.repeat(3)}</p></body></html>`

test('fetch once: what is drawn and what gets the preview', () => {
  assert.equal(whyNotDrawn({ response: response(), html: PAGE, here: HERE }), '')
  assert.equal(whyNotDrawn({ response: response(), here: HERE }), '', 'headers alone: fine so far (the body is read next)')
  assert.equal(whyNotDrawn({ response: null, here: HERE }), 'no-response')
  assert.equal(whyNotDrawn({ response: response({ ok: false, status: 404 }), here: HERE }), 'http-404')
  assert.equal(whyNotDrawn({ response: response({ ok: false, status: 503 }), html: PAGE, here: HERE }), 'http-503')
  assert.equal(whyNotDrawn({ response: response({ type: 'application/json' }), here: HERE }), 'not-html')
  assert.equal(whyNotDrawn({ response: response({ type: '' }), here: HERE }), 'not-html')
  assert.equal(whyNotDrawn({ response: response({ type: 'application/xhtml+xml' }), html: PAGE, here: HERE }), '')
  assert.equal(whyNotDrawn({ response: response({ url: 'https://login.vodafone.com.eg/x' }), html: PAGE, here: HERE }), 'other-origin', 'redirected off the page origin')
  // A /spa/ shell: an Angular root and scripts, nothing to read.
  const shell = '<!doctype html><html><head><title>My Vodafone</title><script src="/spa/main.js" type="module"></script></head><body><app-root></app-root><noscript>Please enable JavaScript to continue using this application.</noscript></body></html>'
  assert.equal(whyNotDrawn({ response: response(), html: shell, here: HERE }), 'not-presentable')
  assert.equal(whyNotDrawn({ response: response(), html: '<html><body><img src="/a.png"><img src="/b.png"></body></html>', here: HERE }), '', 'two pictures are enough')
  assert.equal(whyNotDrawn({ response: response(), html: '<html><body><img data-src="/a.png"><img data-src="/b.png"></body></html>', here: HERE }), 'not-presentable', 'lazy pictures without a src do not count')
  for (const page of ['<html><head><title>Access Denied</title></head><body>You don\'t have permission to access this server. Reference #18.</body></html>', `<html><body><div id="px-captcha"></div>${'x '.repeat(80)}</body></html>`, `<html><head><title>Just a moment...</title></head><body><script src="/cdn-cgi/challenge-platform/h/b"></script>${'y '.repeat(80)}</body></html>`])
    assert.equal(whyNotDrawn({ response: response(), html: page, here: HERE }), 'challenge')
  assert.equal(roughText('<style>a{}</style><p>Hi <b>there</b></p><script>x()</script><!-- c -->'), 'Hi there')
})

test('fetch once: the drawn document runs nothing and loads no other document', () => {
  const raw = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><base href="https://elsewhere.example/"><meta http-equiv="refresh" content="0;url=/x"><link rel="prefetch" href="/next"><link rel="stylesheet" href="/theme.css"><script>alert(1)</script><script src="/a.js"></script></head><body><noscript><iframe src="https://www.googletagmanager.com/ns.html"></iframe><img src="/pixel.gif"></noscript><iframe src="/embed"></iframe><object data="/x.swf"></object><embed src="/y.swf"><p>Text</p><img src="/hero.jpg"></body></html>`
  const out = inertDocument(raw, 'https://web.vodafone.com.eg/en/vodafone-cash')
  for (const gone of ['<script', 'alert(1)', 'noscript', 'googletagmanager', 'pixel.gif', '<iframe', '<object', '<embed', 'refresh', 'prefetch', 'elsewhere.example'])
    assert.ok(!out.toLowerCase().includes(gone), `${gone} is taken out`)
  for (const kept of ['<link rel="stylesheet" href="/theme.css">', '<p>Text</p>', '<img src="/hero.jpg">', '<html lang="en">'])
    assert.ok(out.includes(kept), `${kept} is kept`)
  // First in the head: the policy, then the base, so every address after it resolves on the page's origin.
  assert.ok(out.includes(`<head><meta http-equiv="Content-Security-Policy" content="${FRAME_POLICY}"><base href="https://web.vodafone.com.eg/en/vodafone-cash"><meta charset="utf-8">`))
  for (const directive of ["script-src 'none'", "frame-src 'none'", "object-src 'none'", "connect-src 'none'", "form-action 'none'"]) assert.ok(FRAME_POLICY.includes(directive), directive)
  // No head: one is made.
  assert.equal(inertDocument('<!doctype html><p>x</p>', 'https://w.example/a?b="c"').startsWith(`<!doctype html><head><meta http-equiv="Content-Security-Policy" content="${FRAME_POLICY}"><base href="https://w.example/a?b=&quot;c&quot;"></head><p>x</p>`), true)
})

test('the scene does not load the clone dictionary itself, and the clone-only rules are scoped to the clone page', () => {
  const controller = readFileSync(new URL('../src/pocket/portal/controller.js', import.meta.url), 'utf8')
  assert.ok(!/^import[^\n]*i18n\.js/m.test(controller), 'no static import of ../../i18n.js in the scene')
  assert.ok(/import\('\.\.\/\.\.\/i18n\.js'\)/.test(controller), 'the clone strings are imported lazily')
  const css = readFileSync(new URL('../src/pocket/portal/portal.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
  const rules = [...css.matchAll(/([^{}]+)\{/g)].map((m) => m[1].trim())
  const touching = rules.filter((selector) => /#vodafone-aw-icon|vg-guide|accessibility-widget/.test(selector))
  assert.ok(touching.length >= 2)
  for (const selector of touching) assert.match(selector, /:where\(body:has\(\.page-shell\)\)/, selector)
})

test("the wall never copies Vodafone's widget host, the cookie banner or the guide", () => {
  const kept = KEEP_LIVE.split(',').map((selector) => selector.trim())
  for (const selector of ['vg-guide', 'accessibility-widget', '#onetrust-consent-sdk', '#vodafone-aw-icon']) assert.ok(kept.includes(selector), selector)
  const css = readFileSync(new URL('../src/pocket/portal/portal.css', import.meta.url), 'utf8')
  assert.equal(Number(css.match(/\.vf-portal\s*\{[^}]*z-index:\s*(\d+)/)[1]), OVERLAY_Z, 'OVERLAY_Z is the overlay z-index in portal.css')
})
