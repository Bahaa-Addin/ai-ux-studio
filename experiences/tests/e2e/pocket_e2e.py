"""
End-to-end checks for Pocket (sticker peel, peeking corner, page turn), its actors (the mascot
behind the pocket button and in the album, the drone) and the Pocket-page cursor. Optional;
needs Python Playwright, like aixc_e2e.py.

    node scripts/serve.mjs --port 5200 &
    python tests/e2e/pocket_e2e.py http://127.0.0.1:5200/
    POCKET_SHOTS=shots python tests/e2e/pocket_e2e.py http://127.0.0.1:5200/   # + screenshots

Each check prints PASS/FAIL; the script exits non-zero if any check fails. The actor checks
seed the actors' randomness and bring the doze forward through window.__POCKET_ACTORS_TEST__
(read once at start-up), so the timings are deterministic.
"""

import asyncio, math
import json
import os
import sys

from playwright.async_api import async_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:5200/"
SHOTS = os.environ.get("POCKET_SHOTS")
results = []

# Deterministic actors: fixed seed, the doze brought forward to 6 s.
ACTOR_TEST = "window.__POCKET_ACTORS_TEST__ = { seed: 7, timing: { sleepAt: 6000 } }"

# Records every mascot/drone state change with where the mascot is and whether a turn is running.
ACTOR_LOG = """
window.__actorLog = []
new MutationObserver((records) => {
  for (const r of records) {
    const node = r.target
    window.__actorLog.push({
      t: Math.round(performance.now()),
      who: r.attributeName === 'data-mascot-state' ? 'mascot' : 'drone',
      state: node.getAttribute(r.attributeName),
      turning: !!document.querySelector('.pocket-layer--plane .curl-flat'),
      under: !!node.closest('.pocket-layer--plane .curl-under'),
      album: !!node.closest('#pocket-output'),
      flying: !!document.querySelector('.curl-host--flying'),
    })
  }
}).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-mascot-state', 'data-drone-state'] })
"""


def check(name, ok, detail=""):
    results.append((name, bool(ok)))
    print(f"{'PASS' if ok else 'FAIL'}  {name}{'  -- ' + str(detail) if detail and not ok else ''}")


async def new_page(browser, width=1366, height=860, reduced_motion="no-preference", actors=False, pocket=None):
    ctx = await browser.new_context(viewport={"width": width, "height": height}, reduced_motion=reduced_motion)
    page = await ctx.new_page()
    page.errors = []
    page.on("pageerror", lambda e: page.errors.append(str(e)))
    page.on("console", lambda m: page.errors.append(m.text) if m.type == "error" else None)
    await page.add_init_script(ACTOR_LOG)
    if actors:
        await page.add_init_script(ACTOR_TEST)
    if pocket is not None:
        await page.add_init_script(f"if (!sessionStorage.getItem('seeded')) {{ localStorage.setItem('aixc.pocket.v1', {json.dumps(json.dumps(pocket))}); sessionStorage.setItem('seeded', '1') }}")
    await page.goto(BASE)
    await page.wait_for_selector(".pocket-cta")
    return ctx, page


async def scroll_to(page, section):
    await page.evaluate(
        "(s) => { document.querySelector(`[data-aixc-section=\"${s}\"]`).scrollIntoView({ block: 'start' }); window.scrollBy(0, -120) }",
        section,
    )


async def settle(page):
    """Waits until no sticker is in the air and no page turn is running."""
    await page.wait_for_function("!document.querySelector('.curl-host--flying')", timeout=8000)
    await page.wait_for_timeout(120)


async def count_badge(page):
    return await page.evaluate("document.querySelector('.pocket-peek__count').textContent")


async def shot(page, name, clip=None):
    """Saves a comparison screenshot when POCKET_SHOTS is set."""
    if not SHOTS:
        return
    os.makedirs(SHOTS, exist_ok=True)
    await page.screenshot(path=os.path.join(SHOTS, f"{name}.png"), clip=clip)


async def clock(page):
    return await page.evaluate("Math.round(performance.now())")


async def log(page, who="mascot", since=0):
    return await page.evaluate("([who, since]) => window.__actorLog.filter((e) => e.who === who && e.t >= since)", [who, since])


async def states(page, who="mascot", since=0):
    return [entry["state"] for entry in await log(page, who, since)]


async def state(page, who="mascot"):
    selector, attribute = (".pocket-mascot", "data-mascot-state") if who == "mascot" else (".pocket-drone", "data-drone-state")
    return await page.evaluate("([s, a]) => document.querySelector(s)?.getAttribute(a) ?? null", [selector, attribute])


async def wait_state(page, value, who="mascot", timeout=8000):
    selector, attribute = (".pocket-mascot", "data-mascot-state") if who == "mascot" else (".pocket-drone", "data-drone-state")
    await page.wait_for_function("([s, a, v]) => document.querySelector(s)?.getAttribute(a) === v", arg=[selector, attribute, value], timeout=timeout)


async def rect(page, selector):
    return await page.evaluate("(s) => { const r = document.querySelector(s)?.getBoundingClientRect(); return r ? { x: r.left, y: r.top, w: r.width, h: r.height } : null }", selector)


def near(a, b, tolerance=1.5):
    return a and b and all(abs(a[key] - b[key]) <= tolerance for key in ("x", "y", "w", "h"))


async def collisions(page):
    """What the actors overlap in the album: controls, title, lead, cards (and page overflow)."""
    return await page.evaluate("""(() => {
        const box = (n) => n && n.getClientRects().length ? n.getBoundingClientRect() : null
        const hit = (a, b) => a && b && a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1
        // On its board the mascot's body is drawn above its box: what counts is all that is drawn.
        const union = (a, b) => a && b ? { left: Math.min(a.left, b.left), right: Math.max(a.right, b.right), top: Math.min(a.top, b.top), bottom: Math.max(a.bottom, b.bottom) } : a || b
        const drone = document.querySelector('.pocket-drone')
        const mascot = document.querySelector('.pocket-mascot')
        const living = ['idle', 'yawning', 'sleeping', 'flinching', 'waking']
        const actors = [
          ['drone', drone && !drone.hidden ? box(drone) : null],
          ['mascot', mascot && living.includes(mascot.dataset.mascotState) ? union(union(box(mascot.querySelector('svg')), box(mascot.querySelector('[data-part="outline"]'))), box(mascot.querySelector('[data-part="board-deck"]'))) : null],
        ]
        const targets = [...document.querySelectorAll('#pocket-output .pocket-back, #pocket-output .pocket-clear, #pocket-title, .pocket-view__lead, .pocket-view__mark, .pocket-sticker, .pocket-empty')]
        const hits = []
        for (const [name, a] of actors) for (const t of targets) if (hit(a, box(t))) hits.push(`${name} x ${t.className || t.id}`)
        // At the top of the page nothing may reach the header; once scrolled, actors pass under it (it paints above them).
        const header = box(document.querySelector('#site-header'))
        if (window.scrollY === 0) for (const [name, a] of actors) if (a && header && a.top < header.bottom - 1 && a.bottom > header.top) hits.push(`${name} x header`)
        return { overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, hits, anchor: drone?.dataset.droneAnchor, mascot: mascot?.dataset.mascotState }
    })()""")


# Records every frame in which the visible mascot overlaps a card's text or controls.
# Where the visible right edges of the mascot's body and the drone's rotor guards are, relative to
# the album content's right edge (where the cards and "Empty pocket" end), sampled for 1.2 s.
MARGIN_PROBE = """() => new Promise((done) => {
  const right = (root, sel) => { let r = -Infinity; for (const n of root.querySelectorAll(sel)) { const b = n.getBoundingClientRect(); if (b.width) r = Math.max(r, b.right) } return r }
  const content = document.querySelector('.pocket-view__inner').getBoundingClientRect().right
  const m = [], d = []; const end = performance.now() + 1200
  const f = () => {
    const svg = document.querySelector('.pocket-mascot svg'), drone = document.querySelector('.pocket-drone')
    // The mascot's visible right edge: its body, or the end of its board where that reaches further.
    const outline = svg.querySelector('[data-part="outline"]'), deck = document.querySelector('.pocket-mascot [data-part="board"]')?.style.display === 'none' ? null : document.querySelector('.pocket-mascot [data-part="board-deck"]')
    const unit = svg.getBoundingClientRect().width / 120
    m.push(Math.max(right(svg, '[data-part="outline"]') + (+outline.getAttribute('stroke-width') / 2) * unit, deck ? deck.getBoundingClientRect().right + (+deck.getAttribute('stroke-width') / 2) * unit : -Infinity))
    if (drone && !drone.hidden) d.push(right(drone, '[data-part^="rotor-unit"] > path') + 2.3 * drone.offsetWidth / 200)
    if (performance.now() < end) return requestAnimationFrame(f)
    const mean = (a) => a.length ? +(a.reduce((x, y) => x + y, 0) / a.length - content).toFixed(1) : null
    done({ content, mascot: mean(m), mascotMax: +(Math.max(...m) - content).toFixed(1), drone: mean(d), droneMax: d.length ? +(Math.max(...d) - content).toFixed(1) : null, anchor: drone?.dataset.droneAnchor })
  }; requestAnimationFrame(f) })"""

# The hoverboard (ADR-0004): per frame, the mascot's state, its board and pose, the box's offset,
# where its feet and hands are against the deck and the body, and its right edge against the content.
BOARD_TRACK = """() => { window.__board = []; const f = () => {
  const m = document.querySelector('.pocket-mascot'), svg = m?.querySelector('svg')
  if (svg) {
    const b = (sel) => { const n = m.querySelector(sel); return n && n.getClientRects().length && getComputedStyle(n).display !== 'none' ? n.getBoundingClientRect() : null }
    const deck = m.querySelector('[data-part="board"]')?.style.display === 'none' ? null : b('[data-part="board-deck"]')
    const feet = Math.max(...['foot-l', 'foot-r'].map((p) => b(`[data-limb="${p}"]`)?.bottom ?? -Infinity))
    const body = b('[data-part="outline"]'), hands = ['l', 'r'].map((p) => b(`[data-place="hand-${p}"]`))
    const tr = /translate3d\\(([-\\d.]+)px/.exec(m.querySelector('.pocket-mascot__mover')?.style.transform || m.firstElementChild?.style.transform || '') || [0, 0]
    const pose = (m.dataset.boardPose || '0,0,0,0,0,0').split(',').map(Number)
    const content = document.querySelector('.pocket-view__inner')?.getBoundingClientRect().right
    window.__board.push({ t: performance.now(), s: m.dataset.mascotState, board: m.dataset.board, remote: m.dataset.remote, pose, x: +tr[1],
      deckTop: deck?.top, deckBottom: deck?.bottom, deckRight: deck?.right, feet, h: svg.getBoundingClientRect().height, bodyL: body?.left, bodyR: body?.right,
      handsOut: hands.filter((h) => h && body && (h.left + h.width / 2 < body.left || h.left + h.width / 2 > body.right)).length, content })
  }
  if (window.__board.length < 3000) requestAnimationFrame(f) }; requestAnimationFrame(f) }"""

def on_deck(r):
    """The feet stand on the deck: no lower than its underside, and no higher above it than its
    thickness and tilt allow (a fifth of the mascot's height; the nose rises higher still)."""
    return r["deckTop"] is not None and r["deckBottom"] - 0.2 * r["h"] <= r["feet"] <= r["deckBottom"] + 1

def board_ride(track):
    """The ride in, from the board track: frames riding, feet off the deck, its biggest bank, hands out, remote up early, where it starts, any step back."""
    ride = [r for r in track if r["s"] == "riding"]
    off = [None if r["deckTop"] is None else round(r["deckBottom"] - r["feet"], 1) for r in ride if not on_deck(r)]
    # Riding in toward its spot (x falls to 0): it starts in the corner and never steps back on the way.
    way = []
    for r in ride:
        way.append(r["x"])
        if r["x"] <= 2:
            break
    back = max((b - a for a, b in zip(way, way[1:])), default=0)
    mid = ride[len(ride) // 5: len(ride) * 4 // 5]
    return {"frames": len(ride), "board": sorted({r["board"] for r in ride}), "feet_off_deck": off[:5], "bank": round(max((abs(r["pose"][1]) for r in ride), default=0), 1),
            "arms_out": round(sum(1 for r in mid if r["handsOut"]) / max(1, len(mid)), 2), "remote_while_riding": sorted({r["remote"] for r in ride}),
            "start": way[0] if way else None, "furthest": max(way, default=None), "step_back": round(back, 2)}

def board_hover(track):
    """Hovering, from the board track: the range on each axis, how high it sits, its feet on the deck and its right edge against the content."""
    rows = [r for r in track if r["s"] == "idle" and r["board"] == "hovering"]
    span = lambda key, i=None: round(max(r[key] if i is None else r[key][i] for r in rows) - min(r[key] if i is None else r[key][i] for r in rows), 1) if rows else 0
    return {"frames": len(rows), "x": span("x"), "bob": span("pose", 0), "roll": span("pose", 1), "pitch": span("pose", 2), "yaw": span("pose", 3), "depth": span("pose", 4),
            "height": [round(min(r["pose"][0] for r in rows), 1), round(max(r["pose"][0] for r in rows), 1)] if rows else None,
            "feet_off_deck": sum(1 for r in rows if not on_deck(r)),
            "deck_past_margin": round(max((r["deckRight"] - r["content"] for r in rows), default=0), 1)}

# The pilot (ADR-0003): where the mascot's hands are against the remote, and whether its rotors turn.
HANDS_ON_REMOTE = """(() => {
  const box = (n) => n && n.getClientRects().length ? n.getBoundingClientRect() : null
  const remote = box(document.querySelector('.pocket-mascot [data-part="remote-case"]'))
  const hands = ['l', 'r'].map((side) => box(document.querySelector(`.pocket-mascot [data-place="hand-${side}"]`)))
  const touch = (a, b) => a && b && a.left < b.right + 1 && a.right > b.left - 1 && a.top < b.bottom + 1 && a.bottom > b.top - 1
  return { remote: !!remote, held: document.querySelector('.pocket-mascot').dataset.remote, hands: hands.map((h) => touch(h, remote)) }
})()"""

# Per frame: the drone's state and offset, the mascot's sticks and where it looks.
PILOT_TRACK = """() => { window.__pilot = []; const f = () => {
  const m = document.querySelector('.pocket-mascot'), d = document.querySelector('.pocket-drone')
  const tr = /translate3d\\(([-\\d.]+)px, ([-\\d.]+)px/.exec(d.style.transform) || [0, 0, 0]
  let l = Infinity, r = -Infinity, b = -Infinity
  for (const n of d.querySelectorAll('[data-part^="rotor-unit"] > path, [data-part="body"] > ellipse')) { const q = n.getBoundingClientRect(); if (!q.width) continue; l = Math.min(l, q.left); r = Math.max(r, q.right); b = Math.max(b, q.bottom) }
  const page = document.querySelector('.pocket-drone-shadow:not(.pocket-drone-shadow--ground)'), ground = document.querySelector('.pocket-drone-shadow--ground')
  const pb = page.getBoundingClientRect(), gb = ground.getBoundingClientRect()
  window.__pilot.push({ t: performance.now(), ds: d.dataset.droneState, s: (m.dataset.sticks || '0,0,0,0').split(',').map(Number), x: +tr[1], y: +tr[2], look: m.dataset.look,
    dx: (l + r) / 2, db: b, bh: +(m.dataset.boardPose || '0').split(',')[0], px: pb.left + pb.width / 2, py: pb.top + pb.height / 2, pop: +getComputedStyle(page).opacity, gx: gb.left + gb.width / 2, gy: gb.top + gb.height / 2, gop: +getComputedStyle(ground).opacity, floor: m.querySelector('svg').getBoundingClientRect().bottom })
  if (window.__pilot.length < 2400) requestAnimationFrame(f) }; requestAnimationFrame(f) }"""

def shadow_gaps(track):
    """How far its shadows get from the drone: the one on the page (from the drone's lowest point,
    while it shows) and the one on the floor (across from the drone, and off the floor, while it shows)."""
    page = max((math.hypot(r["px"] - r["dx"], r["py"] - r["db"]) for r in track if r["pop"] > 0.05 and r["dx"] == r["dx"]), default=0)
    ground = [r for r in track if r["gop"] > 0.05]
    across = max((abs(r["gx"] - r["dx"]) for r in ground), default=0)
    floor = max((abs(r["gy"] - r["floor"]) for r in ground), default=0)
    return {"page": round(page, 1), "ground_across": round(across, 1), "ground_off_floor": round(floor, 1), "ground_frames": len(ground)}

def stick_lead(track, state):
    """ms from the first frame in `state` to the sticks moving past 0.3, and to the drone moving faster than 40 px/s."""
    start = next((i for i, r in enumerate(track) if r["ds"] == state), None)
    if start is None:
        return None, None
    t0 = track[start]["t"]
    sticks = next((r["t"] - t0 for r in track[start:] if max(abs(v) for v in r["s"]) > 0.3), None)
    moved = None
    for a, b in zip(track[start:], track[start + 1:]):
        if math.hypot(b["x"] - a["x"], b["y"] - a["y"]) / max(1, b["t"] - a["t"]) * 1000 > 40:
            moved = b["t"] - t0
            break
    return sticks, moved

CROSSING_PROBE = """(() => { window.__crossings = []; const f = () => {
  const m = document.querySelector('.pocket-mascot'); const st = m?.dataset.mascotState
  if (m && !['hidden', 'tucked', 'leaving'].includes(st) && m.closest('#pocket-output') && getComputedStyle(m).visibility !== 'hidden') {
    // What is drawn: the box, the body above it on the board, and the board.
    const rects = [m.querySelector('svg'), m.querySelector('[data-part="outline"]'), m.querySelector('[data-part="board-deck"]')].map((n) => n?.getBoundingClientRect()).filter((r) => r && r.width)
    const a = rects.length ? { left: Math.min(...rects.map((r) => r.left)), right: Math.max(...rects.map((r) => r.right)), top: Math.min(...rects.map((r) => r.top)), bottom: Math.max(...rects.map((r) => r.bottom)) } : null
    for (const n of document.querySelectorAll('#pocket-output .pocket-sticker__title, #pocket-output .pocket-sticker__from, #pocket-output .pocket-sticker__cta, #pocket-output .pocket-sticker__remove')) {
      const b = n.getBoundingClientRect()
      if (a && Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2) window.__crossings.push(st + ' x ' + n.className)
    }
  }
  if (window.__crossings.length < 500) requestAnimationFrame(f) }; requestAnimationFrame(f) })()"""


async def actor_animations(page):
    """Web/CSS animations still running on either actor."""
    return await page.evaluate("document.getAnimations().filter((a) => a.playState === 'running' && a.effect?.target?.closest?.('.pocket-mascot, .pocket-drone, .pocket-drone-trail')).length")


async def open_and_settle(page):
    await page.click(".pocket-peek")
    await page.wait_for_function("document.activeElement?.id === 'pocket-title'", timeout=6000)
    await page.wait_for_function("['idle', 'tucked'].includes(document.querySelector('.pocket-mascot')?.dataset.mascotState)", timeout=6000)
    await page.wait_for_function("['home-hover', 'hidden'].includes(document.querySelector('.pocket-drone')?.dataset.droneState)", timeout=6000)


# Whether the mascot can be seen: no hidden ancestor, opacity above 5%, on screen; and where it is
# against the Pocket button (dx: centres; dy: its feet against the button's middle).
MASCOT_SEEN = """() => {
  const m = document.querySelector('.pocket-mascot'), b = document.querySelector('.pocket-peek')
  if (!m || !b) return { visible: false, missing: true }
  let opacity = 1, hidden = false
  for (let n = m; n && n.nodeType === 1; n = n.parentElement) {
    const s = getComputedStyle(n)
    opacity *= parseFloat(s.opacity)
    if (s.display === 'none' || s.visibility === 'hidden') hidden = true
  }
  const r = m.getBoundingClientRect(), p = b.getBoundingClientRect()
  const onScreen = r.width > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth
  return { visible: !hidden && opacity > 0.05 && onScreen, state: m.dataset.mascotState, opacity: +opacity.toFixed(2),
           dx: Math.round(r.left + r.width / 2 - p.left - p.width / 2), dy: Math.round(r.bottom - p.top - p.height / 2) }
}"""


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()

        # ------------------------------------------------------------ desktop flow
        ctx, page = await new_page(browser)
        ctas = await page.evaluate("document.querySelectorAll('#source-content .pocket-cta').length")
        items = await page.evaluate("document.querySelectorAll('#source-content [data-aixc-item]').length")
        check("every service card has a Pocket it chip (not the closing promotion)", ctas == items - 1, f"{ctas} chips, {items} items")
        check("chip has an accessible name containing its visible text", await page.evaluate(
            "document.querySelector('[data-aixc-item=\"roaming\"] .pocket-cta').getAttribute('aria-label') === 'Pocket it: Roaming Services'"))
        check("peek button hidden and inert while the pocket is empty", await page.evaluate(
            "(() => { const b = document.querySelector('.pocket-peek'); return b.dataset.state === 'hidden' && b.inert })()"))

        await scroll_to(page, "stay-in-control")
        await page.hover('[data-aixc-item="calls-services"] .pocket-cta')
        await page.wait_for_timeout(350)
        check("hovering the chip lifts the card's corner", await page.evaluate(
            "!!document.querySelector('[data-aixc-item=\"calls-services\"] .curl-host--inside')"))
        # Track how far the peel gets before the sticker leaves the page.
        await page.evaluate("""() => { window.__peel = 0; const watch = () => {
            const h = document.querySelector('.curl-host--flying');
            if (h && h.dataset.peel) window.__peel = Math.max(window.__peel, parseFloat(h.dataset.peel));
            requestAnimationFrame(watch) }; watch() }""")
        await page.click('[data-aixc-item="calls-services"] .pocket-cta')
        await page.wait_for_timeout(250)
        check("clicking peels a sticker off the card", await page.evaluate("!!document.querySelector('.curl-host--flying')"))
        check("card turns into a liner while the sticker peels", await page.evaluate(
            "document.querySelector('[data-aixc-item=\"calls-services\"]').classList.contains('is-pocketed')"))
        await settle(page)
        check("the peel completes (the whole sticker comes off) before it is thrown", await page.evaluate("window.__peel") >= 0.99, await page.evaluate("window.__peel"))
        check("sticker lands and is cleaned up", await page.evaluate("document.querySelectorAll('.curl-host').length") == 0)
        check("liner says it is in your pocket, with Put back", await page.evaluate(
            "(() => { const l = document.querySelector('[data-aixc-item=\"calls-services\"] .pocket-liner'); return getComputedStyle(l).display !== 'none' && /In your pocket/.test(l.textContent) && /Put back/.test(l.textContent) })()"))
        check("peek corner shows its button with the count", await page.evaluate(
            "document.querySelector('.pocket-peek').dataset.state === 'shown'") and await count_badge(page) == "1")
        check("peek corner is drawn (curl layers mounted)", await page.evaluate(
            "document.querySelector('.pocket-layer--lift .curl-lift') && document.querySelector('.pocket-layer--plane .curl-under').style.visibility === 'visible'"))
        check("Reimagine launcher sits top-right, clear of the pocket button", await page.evaluate("""(() => {
            const l = document.querySelector('.aixc-launcher').getBoundingClientRect();
            const p = document.querySelector('.pocket-peek').getBoundingClientRect();
            const h = document.querySelector('#site-header').getBoundingClientRect();
            const apart = l.bottom < p.top || l.top > p.bottom || l.right < p.left || l.left > p.right;
            return apart && l.top >= h.bottom && l.top < h.bottom + 40 && l.right > innerWidth - 40 })()"""))
        check("pocket is remembered in this browser", await page.evaluate(
            "localStorage.getItem('aixc.pocket.v1')") == '["calls-services"]')

        await scroll_to(page, "call-and-connect-abroad")
        await page.click('[data-aixc-item="roaming"] .pocket-cta')
        await settle(page)
        await scroll_to(page, "great-entertainment")
        await page.click('[data-aixc-item="mo-salah-world"] .pocket-cta')
        await settle(page)
        check("count follows every landing", await count_badge(page) == "3")
        check("peek button label states the count", await page.evaluate(
            "document.querySelector('.pocket-peek').getAttribute('aria-label')") == "Open your pocket, 3 items")

        scroll_before = await page.evaluate("Math.round(scrollY)")
        await page.mouse.move(400, 400)
        await page.click(".pocket-peek")
        await page.wait_for_timeout(300)
        check("page turn runs on the curl layers", await page.evaluate(
            "!!document.querySelector('.pocket-layer--plane .curl-flat') && document.querySelector('.curl-flat').style.visibility === 'visible'"))
        await page.wait_for_function("document.activeElement && document.activeElement.id === 'pocket-title'", timeout=4000)
        check("pocket view revealed and focused", await page.evaluate(
            "!document.querySelector('#pocket-output').hidden && document.querySelector('#source-content').hidden"))
        check("turned page is cleaned up", await page.evaluate("document.querySelector('.pocket-layer--plane').childElementCount") == 0)
        stickers = await page.evaluate("[...document.querySelectorAll('.pocket-grid__item')].map(n => n.dataset.pocketId)")
        check("album shows every pocketed service, newest first", stickers == ["mo-salah-world", "roaming", "calls-services"], stickers)
        # The link leaves through the portal, in this tab (ADR-0005; portal_e2e.py covers it, and ?portal=off brings back the new tab).
        check("sticker keeps the real title, copy and link", await page.evaluate(
            "(() => { const s = document.querySelector('[data-pocket-id=\"roaming\"]'); return /Roaming Services/.test(s.textContent) && /best rates/.test(s.textContent) && s.querySelector('a').href === 'https://web.vodafone.com.eg/spa/roaming' && s.querySelector('a').target === '' })()"))
        check("sticker without its own link uses the section's link", await page.evaluate(
            "document.querySelector('[data-pocket-id=\"mo-salah-world\"] a').href") == "https://vf.eg/anavodafone")
        check("AIXC launcher hidden in the pocket", await page.evaluate(
            "getComputedStyle(document.querySelector('.aixc-launcher')).display === 'none'"))

        await page.click('[data-pocket-id="mo-salah-world"] .pocket-sticker__remove')
        await page.wait_for_timeout(200)
        check("removing peels the sticker off the album", await page.evaluate("!!document.querySelector('.curl-host--flying')"))
        await settle(page)
        check("removed sticker leaves the album and the count", await page.evaluate(
            "!document.querySelector('[data-pocket-id=\"mo-salah-world\"]')") and await count_badge(page) == "2")
        check("removed service is restored on the page", await page.evaluate(
            "!document.querySelector('[data-aixc-item=\"mo-salah-world\"]').classList.contains('is-pocketed')"))

        await page.click(".pocket-back")
        await page.wait_for_function("document.querySelector('#pocket-output').hidden && document.activeElement?.classList.contains('pocket-peek')", timeout=4000)
        check("Back turns the page back to where you were", abs(await page.evaluate("Math.round(scrollY)") - scroll_before) <= 2)
        check("page is live again under the peeking corner", await page.evaluate(
            "!document.querySelector('#source-content').hidden && !document.querySelector('.curl-flat') || document.querySelector('.curl-flat').style.visibility === 'hidden'"))

        await scroll_to(page, "call-and-connect-abroad")
        await page.click('[data-aixc-item="roaming"] .pocket-liner__undo')
        await page.wait_for_timeout(80)
        check("Put back plays the journey in reverse, starting from the pocket", await page.evaluate("""(() => {
            const h = document.querySelector('.curl-host--flying'); if (!h) return false;
            const r = h.getBoundingClientRect(), p = document.querySelector('.pocket-peek').getBoundingClientRect();
            return Math.hypot(r.left + r.width / 2 - (p.left + p.width / 2), r.top + r.height / 2 - (p.top + p.height / 2)) < 200 })()"""))
        await settle(page)
        check("Put back returns the sticker to its card", await page.evaluate(
            "!document.querySelector('[data-aixc-item=\"roaming\"]').className.match(/is-(pocketed|returning)/)") and await count_badge(page) == "1")
        await scroll_to(page, "stay-in-control")
        await page.click('[data-aixc-item="calls-services"] .pocket-liner__undo')
        await settle(page)
        await page.wait_for_timeout(500)
        check("empty pocket folds the corner away", await page.evaluate(
            "document.querySelector('.pocket-peek').dataset.state === 'hidden' && document.querySelector('.pocket-layer--plane').childElementCount === 0"))
        check("no page errors (desktop)", not page.errors, page.errors)
        await ctx.close()

        # ------------------------------------------------------------ actors: the save
        ctx, page = await new_page(browser, width=1440, height=900, actors=True)
        await page.wait_for_selector("#pocket-output[data-pocket-actor-ready]", state="attached", timeout=5000)
        header_before = await page.evaluate("document.querySelector('#site-header').outerHTML + document.querySelector('footer').outerHTML")
        check("actors: no mascot on the page before anything is pocketed", await page.evaluate("document.querySelectorAll('.pocket-mascot').length") == 0)
        await scroll_to(page, "stay-in-control")
        await page.mouse.move(700, 300)
        # Watch the pocket button: when it is held open, whether a mitten shows, whether the item is in the air.
        await page.evaluate("""() => { window.__hold = []; const f = () => {
            const b = document.querySelector('.pocket-peek'); const g = document.querySelector('.pocket-actor-grip')
            const m = document.querySelector('.pocket-mascot'), svg = m?.querySelector('svg')?.getBoundingClientRect(), line = document.querySelector('.pocket-actor-peek__clip')?.getBoundingClientRect()
            if (b) window.__hold.push({ t: Math.round(performance.now()), shown: b.dataset.state === 'shown', held: b.hasAttribute('data-actor-hold'), grip: !!g?.hasAttribute('data-shown'), flying: !!document.querySelector('.curl-host--flying'), count: document.querySelector('.pocket-peek__count')?.textContent,
              state: m?.dataset.mascotState, visible: !!m && getComputedStyle(m).visibility === 'visible', mx: svg ? svg.left + svg.width / 2 : null, mtop: svg?.top, line: line?.top, bx: (() => { const r = b.getBoundingClientRect(); return [r.left, r.right, r.top] })(),
              top: (() => { const r = b.getBoundingClientRect(); const n = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!n?.closest('.pocket-peek') })() })
            if (window.__hold.length < 600) requestAnimationFrame(f) }; requestAnimationFrame(f) }""")
        t0 = await clock(page)
        await page.click('[data-aixc-item="calls-services"] .pocket-cta')
        await page.wait_for_timeout(120)
        check("actors: pocketing still peels and flies the card", await page.evaluate("!!document.querySelector('.curl-host--flying')"))
        hidden_under = await page.evaluate("""(() => {
            const m = document.querySelector('.pocket-mascot')
            const plane = getComputedStyle(document.querySelector('.pocket-layer--plane')).zIndex
            const lift = getComputedStyle(document.querySelector('.pocket-layer--lift')).zIndex
            return { state: m?.dataset.mascotState, under: !!m?.closest('.pocket-layer--plane .curl-under'), behindPaper: +plane < +lift, hidden: m && getComputedStyle(m).visibility === 'hidden' }
        })()""")
        check("actors: the mascot starts hidden behind the button, inside the curl's under layer beneath the paper", hidden_under == {"state": "hidden", "under": True, "behindPaper": True, "hidden": True}, hidden_under)
        await wait_state(page, "hidden", timeout=4000)
        await page.wait_for_function("window.__actorLog.some((e) => e.who === 'mascot' && e.state === 'slipping')", timeout=5000)
        await wait_state(page, "hidden", timeout=3000)
        save_log = await log(page, "mascot", t0)
        sequence = [e["state"] for e in save_log]
        check("actors: every save: it comes out, holds the button open, catches, sinks back", sequence == ["emerging", "holding", "catching", "slipping", "hidden"], sequence)
        emerge = next((e for e in save_log if e["state"] == "emerging"), None)
        check("actors: it comes out from under the curl while the item is still in the air", emerge and emerge["under"] and emerge["flying"], emerge)
        check("actors: it starts coming out about 0.7 s before the landing", emerge and 1050 <= emerge["t"] - t0 <= 1450, emerge and emerge["t"] - t0)
        holding = next((e for e in save_log if e["state"] == "holding"), None)
        check("actors: it has the pocket open before the item arrives", holding and holding["flying"] and holding["t"] - t0 <= 1800, holding and holding["t"] - t0)
        catch = next((e for e in save_log if e["state"] == "catching"), None)
        check("actors: it catches the item as it lands (not before)", catch and not catch["flying"] and 1850 <= catch["t"] - t0 <= 2250, catch and catch["t"] - t0)
        gone = next((e for e in save_log if e["state"] == "hidden"), None)
        check("actors: it is gone again within about 0.8 s of the landing", gone and catch and gone["t"] - catch["t"] <= 850, gone and catch and gone["t"] - catch["t"])
        frames = await page.evaluate("window.__hold")
        held = [f for f in frames if f["held"]]
        check("actors: the pocket button is held open (its mouth showing) while the item flies in", held and all(f["flying"] for f in held[:-2]) and held[0]["t"] - t0 < 1900, held[:1])
        check("actors: its hands show on the button's rim while it holds it", any(f["grip"] and f["held"] for f in frames))
        check("actors: the button closes as the item drops in, and the count goes up", held and not frames[-1]["held"] and frames[-1]["count"] == "1" and not any(f["held"] and f["count"] == "1" for f in frames), frames[-1])
        shown = [f for f in frames if f["shown"]]
        check("actors: the pocket button stays on top and clickable throughout", shown and all(f["top"] for f in shown), [f for f in shown if not f["top"]][:2])
        out = [f for f in frames if f["visible"] and f["mx"] is not None]
        check("actors: it rises and sinks straight up and down behind the button (no sideways travel)", out and max(f["mx"] for f in out) - min(f["mx"] for f in out) <= 1 and out[0]["bx"][0] <= out[0]["mx"] <= out[0]["bx"][1], out and (min(f["mx"] for f in out), max(f["mx"] for f in out), out[0]["bx"]))
        check("actors: it starts and ends wholly below the button's middle (hidden behind it), and rises over its rim", out and out[0]["mtop"] >= out[0]["line"] - 0.5 and min(f["mtop"] for f in out) < out[0]["bx"][2] - 20 and all(f["mtop"] >= f["line"] - 0.5 for f in frames if f["t"] > out[-1]["t"] and f["mtop"] is not None), out and (out[0]["mtop"], out[-1]["mtop"], out[0]["line"], min(f["mtop"] for f in out), out[0]["bx"]))
        check("actors: the hands come off the button afterwards", not await page.evaluate("document.querySelector('.pocket-actor-grip').hasAttribute('data-shown')"))
        await shot(page, "01-save")

        # Every save gets it; a rapid second save keeps it holding on (one appearance, two catches).
        t1 = await clock(page)
        await scroll_to(page, "call-and-connect-abroad")
        await page.click('[data-aixc-item="roaming"] .pocket-cta')
        await page.wait_for_timeout(250)
        await page.click('[data-aixc-item="visiting-egypt"] .pocket-cta')
        await settle(page)
        await page.wait_for_function("document.querySelector('.pocket-mascot').dataset.mascotState === 'hidden'", timeout=4000)
        later = await states(page, "mascot", t1)
        check("actors: rapid saves: it comes out once and catches each item", later.count("emerging") == 1 and later.count("catching") == 2 and await count_badge(page) == "3", later)

        # Pressing the pocket button while it holds the button: it lets go at once.
        await page.evaluate(BOARD_TRACK)
        await scroll_to(page, "great-entertainment")
        await page.click('[data-aixc-item="mo-salah-world"] .pocket-cta')
        # Press it (a real click event) in the first frame the mascot is holding the button.
        t2 = await page.evaluate("""() => new Promise((done) => { const f = () => {
            if (document.querySelector('.pocket-mascot')?.dataset.mascotState === 'holding') {
              const at = Math.round(performance.now()); document.querySelector('.pocket-peek').click(); done(at)
            } else requestAnimationFrame(f) }; f() })""")
        after_press = await log(page, "mascot", t2)
        check("actors: pressing the pocket button mid-hold makes it let go at once", after_press and after_press[0]["state"] == "slipping" and after_press[0]["t"] - t2 <= 30, after_press[:2])

        # ------------------------------------------------------------ actors: the album
        await page.wait_for_function("document.activeElement?.id === 'pocket-title'", timeout=6000)
        check("actors: focus still lands on the pocket title", await page.evaluate("document.activeElement.id") == "pocket-title")
        await page.wait_for_function("document.querySelector('.pocket-mascot').dataset.mascotState === 'idle'", timeout=6000)
        opened = await log(page, "mascot", t2)
        riding = next((e for e in opened if e["state"] == "riding"), None)
        check("actors: on opening it rides from the corner while the page is still turning", riding and riding["turning"] and riding["album"], riding)
        idle_at = next((e["t"] for e in opened if e["state"] == "idle"), None)
        check("actors: a short ride (well under 2 s)", riding and idle_at and idle_at - riding["t"] <= 2000, riding and idle_at and idle_at - riding["t"])
        ride = board_ride(await page.evaluate("window.__board"))
        check("actors (board): it rides in from the corner on its hoverboard (then settles hovering), feet on the deck every frame, never stepping back", ride["frames"] > 20 and ride["board"] in (["riding"], ["hovering", "riding"]) and not ride["feet_off_deck"] and ride["start"] and ride["start"] >= ride["furthest"] - 1 and ride["step_back"] <= 1, ride)
        check("actors (board): riding, the board banks into the ride and the rider holds its arms out; the remote comes up only once it has stopped", ride["bank"] >= 4 and ride["arms_out"] >= 0.5 and ride["remote_while_riding"] == ["none"], ride)
        check("actors: exactly one mascot, now in the album", await page.evaluate("document.querySelectorAll('.pocket-mascot').length === 1 && !!document.querySelector('.pocket-mascot').closest('#pocket-output .pocket-mascot-stage')"))
        await wait_state(page, "home-hover", who="drone", timeout=3000)
        drone_open = await log(page, "drone", t2)
        take_off = next((e["t"] for e in drone_open if e["state"] == "taking-off"), None)
        check("actors (pilot): the drone waits parked on the floor beside where it will stand", [e["state"] for e in drone_open][:1] == ["landed"], [e["state"] for e in drone_open])
        check("actors (pilot): it takes off only once the mascot has ridden in and raised the remote", take_off and idle_at and take_off - idle_at >= 300, take_off and idle_at and take_off - idle_at)
        hands = await page.evaluate(HANDS_ON_REMOTE)
        check("actors (pilot): it holds the remote in both hands", hands["remote"] and hands["held"] == "held" and all(hands["hands"]), hands)
        line = await page.evaluate("document.querySelector('.pocket-mascot svg').getBoundingClientRect().bottom")
        check("actors: it stands on the bottom edge", abs(line - 900) <= 8, line)
        margin = await page.evaluate(MARGIN_PROBE)
        check("actors: the drone hovers on the content margin, upper right (not in the gutter)", margin["anchor"] == "upper-right", margin)
        check("actors: the drone's right edge lines up with the content's (as Empty pocket and the cards), drifting a few px either side", -6.5 <= margin["drone"] <= 3.5 and margin["droneMax"] <= 4.5, margin)
        check("actors: the mascot (body and board) lines up with the same margin, under the drone", abs(margin["mascot"]) <= 3, margin)
        col = await collisions(page)
        check("actors: drone and mascot cover nothing", not col["hits"], col)
        gaps = await page.evaluate("""() => new Promise((done) => { const gaps = []; const end = performance.now() + 2000; const f = () => {
            const d = document.querySelector('.pocket-drone').getBoundingClientRect(), c = document.querySelector('.pocket-clear').getBoundingClientRect()
            gaps.push(Math.max(c.left - d.right, d.left - c.right, c.top - d.bottom, d.top - c.bottom))
            if (performance.now() < end) requestAnimationFrame(f); else done(gaps) }; requestAnimationFrame(f) })""")
        check("actors: hovering, the drone always keeps at least 24 px from Empty pocket", min(gaps) >= 23.5, min(gaps))
        alive = await page.evaluate("""() => new Promise((done) => {
            const d = document.querySelector('.pocket-drone'), m = document.querySelector('.pocket-mascot svg')
            const a = [d.style.transform, d.querySelector('svg').innerHTML, m.innerHTML]
            setTimeout(() => done([d.style.transform !== a[0], d.querySelector('svg').innerHTML !== a[1], m.innerHTML !== a[2]]), 900) })""")
        check("actors: both are alive: the drone drifts, its rotors spin, the mascot breathes", all(alive), alive)
        await shot(page, "02-album")

        # Where it faces and looks (the drone just hovering, so the pilot's eye is free). The test's
        # 6 s idle threshold may have passed during the checks above: input brings the drone back up.
        await page.mouse.move(640, 420)
        await wait_state(page, "home-hover", who="drone", timeout=5000)
        await page.mouse.move(200, 500, steps=6)
        await page.wait_for_timeout(1300)
        looking = await page.evaluate("[document.querySelector('.pocket-mascot').dataset.look, document.querySelector('.pocket-drone').dataset.droneState]")
        check("actors (pilot): with the drone just hovering, its eye is on the cursor", looking == ["cursor", "home-hover"], looking)
        yaw_left = await page.evaluate("+document.querySelector('.pocket-mascot').dataset.bodyYaw")
        gaze_left = await page.evaluate("document.querySelector('.pocket-mascot [data-part=\"iris\"]').dataset.gaze.split(',').map(Number)")
        check("actors: its body is turned toward the saved cards, not at the viewer", -45 <= yaw_left <= -12, yaw_left)
        check("actors: its eye follows the cursor (left)", gaze_left[0] < -2, (gaze_left, looking))
        await page.mouse.move(1430, 700, steps=6)
        await page.wait_for_timeout(1300)
        yaw_right = await page.evaluate("+document.querySelector('.pocket-mascot').dataset.bodyYaw")
        gaze_right = await page.evaluate("document.querySelector('.pocket-mascot [data-part=\"iris\"]').dataset.gaze.split(',').map(Number)")
        check("actors: its eye follows the cursor (right) while its body stays toward the cards", gaze_right[0] > 2 and yaw_right < 0, (gaze_right, yaw_right))
        await page.mouse.move(1360, 450, steps=6)
        await page.wait_for_timeout(1000)
        gaze_up = await page.evaluate("document.querySelector('.pocket-mascot [data-part=\"iris\"]').dataset.gaze.split(',').map(Number)")
        check("actors: it looks up at a cursor above it", gaze_up[1] > 2, gaze_up)

        # A card someone rests on turns the body toward it.
        card = await rect(page, '[data-pocket-id="calls-services"]')
        first = await rect(page, '.pocket-grid__item:first-child')
        await page.mouse.move(first["x"] + first["w"] / 2, first["y"] + first["h"] / 2, steps=6)
        await page.wait_for_timeout(1400)
        yaw_first = await page.evaluate("+document.querySelector('.pocket-mascot').dataset.bodyYaw")
        await page.mouse.move(card["x"] + card["w"] / 2, card["y"] + card["h"] / 2, steps=6)
        await page.wait_for_timeout(1400)
        yaw_card = await page.evaluate("+document.querySelector('.pocket-mascot').dataset.bodyYaw")
        check("actors: resting on a card turns the body toward that card", yaw_first < yaw_card - 3 or (first == card), (yaw_first, yaw_card))
        check("actors: turning toward cards is not a performance (it stays idle)", await state(page) == "idle")
        check("actors: the grid and its cards are not moved by the mascot", near(await rect(page, '[data-pocket-id="calls-services"]'), card, 0.5))
        check("actors: the mascot is hidden from assistive tech and never takes focus", await page.evaluate("document.querySelector('.pocket-mascot').getAttribute('aria-hidden') === 'true' && !document.activeElement.closest('.pocket-mascot')"))

        # ------------------------------------------------------------ actors: the cursor
        await page.mouse.move(700, 270, steps=4)
        await page.wait_for_timeout(300)
        cur = await page.evaluate("""(() => {
            const root = document.querySelector('#pocket-output'), dot = document.querySelector('.pocket-cursor')
            const m = new DOMMatrix(getComputedStyle(dot).transform)
            return { on: root.hasAttribute('data-cursor'), native: getComputedStyle(document.querySelector('.pocket-sticker')).cursor, x: m.m41, y: m.m42, over: dot.dataset.over, light: getComputedStyle(document.querySelector('.pocket-light')).opacity }
        })()""")
        check("actors: on the Pocket page the cursor becomes a light (the native arrow gives way)", cur["on"] and cur["native"] == "none" and float(cur["light"]) > 0.5, cur)
        check("actors: its dot sits exactly on the pointer", abs(cur["x"] - 700) <= 1 and abs(cur["y"] - 270) <= 1, cur)
        back_btn = await rect(page, ".pocket-view__bar .pocket-back:not(.pocket-journey-cta)")
        await page.mouse.move(back_btn["x"] + 10, back_btn["y"] + back_btn["h"] / 2, steps=3)
        await page.wait_for_timeout(150)
        check("actors: over a control it opens into a ring", await page.evaluate("document.querySelector('.pocket-cursor').dataset.over") == "control")
        await page.mouse.move(card["x"] + card["w"] * 0.85, card["y"] + card["h"] * 0.2, steps=4)
        await page.wait_for_timeout(500)
        lean = await page.evaluate("""(() => { const s = document.querySelector('[data-pocket-id="calls-services"] .pocket-sticker').style
            return { y: parseFloat(s.getPropertyValue('--lean-y')), x: parseFloat(s.getPropertyValue('--lean-x')), sheen: parseFloat(s.getPropertyValue('--sheen-a')) } })()""")
        check("actors: the card under the light leans toward it and catches a sheen", lean["y"] > 0.5 and lean["x"] > 0.2 and lean["sheen"] > 0.2, lean)
        await page.mouse.move(700, 40, steps=4)
        await page.wait_for_timeout(250)
        check("actors: outside the album (the site header) the normal cursor is back", not await page.evaluate("document.querySelector('#pocket-output').hasAttribute('data-cursor')"))

        # A click's ripple: the mascot flinches when it reaches it, the drone is shoved aside.
        m_box = await rect(page, ".pocket-mascot svg")
        t3 = await clock(page)
        await page.mouse.click(m_box["x"] - 90, m_box["y"] + 20)
        await page.wait_for_timeout(120)
        check("actors: a click sends a ring of light across the page", await page.evaluate("document.querySelectorAll('.pocket-ripple').length") >= 1)
        await page.wait_for_timeout(500)
        check("actors: the ring makes the mascot flinch when it reaches it", "flinching" in await states(page, "mascot", t3), await states(page, "mascot", t3))
        d_box = await rect(page, ".pocket-drone")
        t4 = await clock(page)
        await page.mouse.click(d_box["x"] - 70, d_box["y"] + d_box["h"] + 40)
        await page.wait_for_timeout(700)
        check("actors: and shoves the drone aside, which recovers", "dodging" in await states(page, "drone", t4), await states(page, "drone", t4))
        await page.wait_for_timeout(1300)

        # ------------------------------------------------------------ actors: the drone plays
        await wait_state(page, "home-hover", who="drone", timeout=3000)
        home_x = await page.evaluate("(() => { const d = document.querySelector('.pocket-drone'); return document.querySelector('.pocket-actor-layer').getBoundingClientRect().left + parseFloat(d.style.left) })()")
        home_y = await page.evaluate("(() => { const d = document.querySelector('.pocket-drone'); return document.querySelector('.pocket-actor-layer').getBoundingClientRect().top + parseFloat(d.style.top) })()")
        title = await rect(page, "#pocket-title")
        row_top = await page.evaluate("Math.min(...[...document.querySelectorAll('.pocket-grid__item')].map((n) => n.getBoundingClientRect().top))")
        # A slow cursor in the open space between the title and the cards, toward the drone.
        y = (title["y"] + title["h"] + row_top) / 2 + 10
        x = home_x - 420
        await page.mouse.move(x, y, steps=5)
        t5 = await clock(page)
        await page.evaluate(PILOT_TRACK)
        for _ in range(36):
            x += 5
            await page.mouse.move(x, y)
            await page.wait_for_timeout(35)
        await page.wait_for_timeout(700)
        check("actors: a slow cursor in the open space brings the drone over", "following" in await states(page, "drone", t5), await states(page, "drone", t5))
        track = await page.evaluate("window.__pilot")
        sticks_at, moved_at = stick_lead(track, "following")
        check("actors (pilot): its thumbs move the sticks first; the drone answers about 0.1 s later", sticks_at is not None and moved_at is not None and 60 <= moved_at - sticks_at <= 200, (sticks_at, moved_at))
        gaps = shadow_gaps(track)
        check("actors: flying over, its shadow on the page stays with it (never more than 45 px from it)", 0 < gaps["page"] <= 45, gaps)
        watched = [r["look"] for r in track if r["ds"] == "following"]
        check("actors (pilot): while it flies the drone over, it watches the drone", watched and watched[-1] == "drone" and watched.count("drone") >= len(watched) * 0.6, watched[-5:])
        follow = await page.evaluate("""([px, py]) => { const d = document.querySelector('.pocket-drone').getBoundingClientRect(); return Math.hypot(d.left + d.width / 2 - px, d.top + d.height / 2 - py) }""", [x, y])
        check("actors: it keeps a little way off the cursor", follow >= 45, follow)
        col = await collisions(page)
        check("actors: following, it still covers nothing", not col["hits"], col)
        # A quick move onto a card (one jump, so the pointer never passes over the drone).
        await page.mouse.move(first["x"] + first["w"] / 2, first["y"] + first["h"] / 2)
        await page.wait_for_timeout(1400)
        check("actors: when the cursor goes onto a card (or speeds off) it flies home", await state(page, "drone") == "home-hover" and (await states(page, "drone", t5))[-2:] == ["returning-home", "home-hover"], await states(page, "drone", t5))

        # Pointer on it: curious. Keyboard Enter: the heart (first time), later a hop.
        d_box = await rect(page, ".pocket-drone")
        t6 = await clock(page)
        await page.mouse.move(d_box["x"] + d_box["w"] / 2, d_box["y"] + d_box["h"] / 2, steps=4)
        await page.wait_for_timeout(300)
        check("actors: the pointer makes the drone curious", await state(page, "drone") == "curious", await states(page, "drone", t6))
        await page.mouse.move(700, 270)
        await page.wait_for_timeout(700)
        await page.focus(".pocket-drone")
        await page.keyboard.press("Enter")
        await page.wait_for_timeout(500)
        check("actors: the drone is a named button; Enter plays with it (the first time: a heart)", await page.evaluate("document.activeElement.getAttribute('aria-label')") == "Play with the Pocket drone" and await state(page, "drone") == "drawing-heart")
        trail = await rect(page, ".pocket-drone-trail")
        check("actors: only the heart is inked (96 px or less, no approach loop)", trail and trail["w"] <= 96 + 26 and trail["h"] <= 96 + 26, trail)
        await shot(page, "03-heart")
        await page.wait_for_timeout(1300 + 600 + 600 + 450)
        check("actors: the heart fades soon after", await page.evaluate("!document.querySelector('.pocket-drone-trail').hasAttribute('data-shown')"))
        await wait_state(page, "home-hover", who="drone", timeout=3000)
        await page.keyboard.press("Enter")
        await page.wait_for_timeout(120)
        heart_states = await states(page, "drone", t6)
        check("actors: later clicks get a hop; one heart per page load", heart_states.count("drawing-heart") == 1 and heart_states[-1] == "evading", heart_states)
        check("actors: its target is at least 44 x 44 px", await page.evaluate("(() => { const r = document.querySelector('.pocket-drone').getBoundingClientRect(); return r.width >= 44 && r.height >= 44 })()"))
        await page.wait_for_timeout(900)
        await wait_state(page, "home-hover", who="drone", timeout=3000)

        async def home_distance():
            return await page.evaluate("""([hx, hy]) => { const r = document.querySelector('.pocket-drone').getBoundingClientRect(); return Math.hypot(r.left + r.width / 2 - (hx + r.width / 2), r.top + r.height / 2 - (hy + r.height / 2)) }""", [home_x, home_y])

        async def grab_and_drag(dx, dy):
            box = await rect(page, ".pocket-drone")
            await page.mouse.move(box["x"] + box["w"] / 2, box["y"] + box["h"] / 2)
            await page.wait_for_timeout(250)
            await page.mouse.down()
            await page.mouse.move(box["x"] + box["w"] / 2 + dx, box["y"] + box["h"] / 2 + dy, steps=8)
            await page.wait_for_timeout(450)

        await page.evaluate(PILOT_TRACK)
        await grab_and_drag(-160, 220)
        check("actors: the drone can be dragged", await state(page, "drone") == "dragging" and await home_distance() > 150, await home_distance())
        fight = await page.evaluate("document.querySelector('.pocket-mascot').dataset.sticks.split(',').map(Number)")
        check("actors (pilot): dragged away, its sticks fight the hand (pushed hard toward home)", max(abs(v) for v in fight) > 0.8, fight)
        await page.wait_for_timeout(450)
        shaking = await page.evaluate("document.querySelector('.pocket-mascot').dataset.look")
        check("actors (pilot): then it shakes the remote and peers at it", shaking == "remote", shaking)
        await page.mouse.up()
        await page.wait_for_timeout(1400)
        check("actors: releasing a drag springs it back home", await home_distance() <= 16, await home_distance())
        gaps = shadow_gaps(await page.evaluate("window.__pilot"))
        check("actors: dragged far and flying back, its shadow stays with it (never more than 45 px from it)", 0 < gaps["page"] <= 45, gaps)
        await grab_and_drag(-120, 160)
        await page.evaluate("""() => { const d = document.querySelector('.pocket-drone'); const id = 1
            d.dispatchEvent(new PointerEvent('pointercancel', { pointerId: id, bubbles: true })) }""")
        await page.mouse.up()
        await page.wait_for_timeout(1400)
        check("actors: pointer cancellation springs it back home", await home_distance() <= 16 and "returning-home" in await states(page, "drone", t6), await home_distance())
        await grab_and_drag(-120, 160)
        await page.keyboard.press("Escape")
        escaped = await state(page, "drone")
        await page.mouse.up()
        await page.wait_for_timeout(1400)
        check("actors: Escape during a drag returns it home (and keeps the pocket open)", escaped == "returning-home" and await page.evaluate("!document.querySelector('#pocket-output').hidden") and await home_distance() <= 16, escaped)

        t7 = await clock(page)
        await page.set_viewport_size({"width": 1100, "height": 820})
        await page.wait_for_timeout(900)
        col = await collisions(page)
        check("actors: resizing keeps one mascot and one drone, re-anchored and collision-free", await page.evaluate("document.querySelectorAll('.pocket-mascot').length === 1 && document.querySelectorAll('.pocket-drone').length === 1") and not col["hits"] and col["overflow"] <= 0, col)
        check("actors: resizing does not replay the heart", "drawing-heart" not in await states(page, "drone", t7))
        await page.set_viewport_size({"width": 1440, "height": 900})
        await page.wait_for_timeout(900)

        # ------------------------------------------------------------ actors: idle
        await page.mouse.move(700, 270)
        t8 = await clock(page)
        await page.evaluate(BOARD_TRACK)
        await page.wait_for_timeout(4000)
        quiet = [s for s in await states(page, "mascot", t8)]
        check("actors: nothing performs while people read (4 s without input); it just lives", not quiet, quiet)
        hov = board_hover(await page.evaluate("window.__board"))
        check("actors (board): hovering, the board moves on all six axes (bob, drift, depth, roll, pitch, turn)", hov["frames"] > 60 and hov["bob"] >= 1.5 and hov["x"] >= 0.5 and hov["depth"] >= 1 and hov["roll"] >= 1 and hov["pitch"] >= 1 and hov["yaw"] >= 1.5, hov)
        check("actors (board): it hovers near its height, the rider's feet on the deck, the board inside the margin", hov["height"] and 15 <= hov["height"][0] and hov["height"][1] <= 30 and hov["feet_off_deck"] == 0 and hov["deck_past_margin"] <= 3, hov)
        await page.wait_for_function("document.querySelector('.pocket-mascot').dataset.mascotState === 'sleeping'", timeout=6000)
        ladder = await log(page, "mascot", t8)
        sleep_at = ladder[0]["t"] - t8 if ladder else None
        check("actors: the only idle payoff is a doze, at the idle threshold (a pilot lands its drone first)", sleep_at and 5800 <= sleep_at <= 6700 and [e["state"] for e in ladder] == ["parking", "yawning", "sleeping"], (sleep_at, [e["state"] for e in ladder]))
        parked = await page.evaluate("""(() => {
            const right = (root, sel, k) => { let r = { l: Infinity, r: -Infinity, b: -Infinity }; for (const n of root.querySelectorAll(sel)) { const b = n.getBoundingClientRect(); if (!b.width) continue; r = { l: Math.min(r.l, b.left - k), r: Math.max(r.r, b.right + k), b: Math.max(r.b, b.bottom + k) } } return r }
            const d = document.querySelector('.pocket-drone'), m = document.querySelector('.pocket-mascot svg')
            const k = 2.3 * d.offsetWidth / 200
            const guards = right(d, '[data-part^="rotor-unit"] > path', k)
            const body = m.querySelector('[data-part="outline"]').getBoundingClientRect()
            const feet = m.getBoundingClientRect().bottom
            const blades = [...d.querySelectorAll('[data-part="blades"]')].map((n) => n.getAttribute('transform')).join()
            return { state: d.dataset.droneState, gap: Math.min(Math.abs(body.left - guards.r), Math.abs(guards.l - body.right)), floor: feet - guards.b, blades, look: document.querySelector('.pocket-mascot').dataset.look }
        })()""")
        check("actors (pilot): it landed the drone on the floor right beside it", parked["state"] == "landed" and 2 <= parked["gap"] <= 22 and -6 <= parked["floor"] <= 8, parked)
        col = await collisions(page)
        check("actors (pilot): parked, the drone covers nothing", not col["hits"], col)
        await page.wait_for_timeout(300)
        still_blades = await page.evaluate("[...document.querySelectorAll('.pocket-drone [data-part=\"blades\"]')].map((n) => n.getAttribute('transform')).join()")
        check("actors (pilot): its rotors have stopped", still_blades == parked["blades"])
        await page.wait_for_timeout(900)
        down = await page.evaluate("[document.querySelector('.pocket-mascot').dataset.board, ...document.querySelector('.pocket-mascot').dataset.boardPose.split(',').map(Number)]")
        check("actors (board): dozing, it has set the board down on the floor and its glow has dimmed", down[0] == "down" and down[1] < 1.5 and down[6] < 0.3, down)
        t_wake = await clock(page)
        await page.mouse.move(720, 280)
        await page.wait_for_timeout(100)
        check("actors: input wakes it", await state(page) == "waking")
        await page.evaluate(PILOT_TRACK)
        await wait_state(page, "home-hover", who="drone", timeout=4000)
        woke = await states(page, "drone", t_wake)
        check("actors (pilot): awake, it flies the drone back up to its place", woke[-2:] == ["taking-off", "home-hover"], woke)
        climb = [r["look"] for r in await page.evaluate("window.__pilot") if r["ds"] == "taking-off"]
        check("actors (pilot): it watches the drone take off", climb and climb.count("drone") >= len(climb) * 0.6, climb[-5:])
        lift = next((r["bh"] for r in await page.evaluate("window.__pilot") if r["ds"] == "taking-off"), None)
        check("actors (board): waking, it lifts the board before the drone takes off", lift is not None and lift >= 12, lift)
        gaps = shadow_gaps(await page.evaluate("window.__pilot"))
        check("actors: taking off, its floor shadow stays on the floor right under it and its page shadow stays with it", gaps["ground_frames"] > 0 and gaps["ground_across"] <= 2 and gaps["ground_off_floor"] <= 4 and gaps["page"] <= 45, gaps)

        # ------------------------------------------------------------ actors: closing
        await page.wait_for_timeout(600)
        t9 = await clock(page)
        await page.click(".pocket-view__bar .pocket-back:not(.pocket-journey-cta)")
        await page.wait_for_timeout(250)
        check("actors: Back: it lowers the remote and rides off toward the corner while the page turns back", await state(page) == "leaving" and await page.evaluate("document.querySelector('.pocket-mascot').dataset.board") == "riding", await state(page))
        await page.wait_for_function("document.querySelector('#pocket-output').hidden", timeout=4000)
        mascot_close = await states(page, "mascot", t9)
        drone_close = await states(page, "drone", t9)
        check("actors: closing ends hidden for both actors", mascot_close == ["leaving", "hidden"] and drone_close[:1] == ["closing"] and drone_close[-1] == "hidden", (mascot_close, drone_close))
        check("actors: after closing, one hidden mascot back behind the button and no actor animation running", await page.evaluate("document.querySelectorAll('.pocket-mascot').length === 1 && !!document.querySelector('.pocket-mascot').closest('.pocket-layer--plane .curl-under')") and await actor_animations(page) == 0, await actor_animations(page))
        check("actors: the cursor light is gone with the album", await page.evaluate("document.querySelectorAll('.pocket-cursor, .pocket-light, .pocket-ripple').length === 0 && !document.querySelector('#pocket-output').hasAttribute('data-cursor')"))
        t10 = await clock(page)
        await open_and_settle(page)
        reopen = await states(page, "mascot", t10)
        check("actors: reopening: it rides to its place again; no heart", reopen[-1] == "idle" and "riding" in reopen and "drawing-heart" not in await states(page, "drone", t10), (reopen, await states(page, "drone", t10)))
        check("actors: the protected header and footer are untouched", await page.evaluate("document.querySelector('#site-header').outerHTML + document.querySelector('footer').outerHTML") == header_before)
        check("no page errors (actors)", not page.errors, page.errors)
        await ctx.close()

        # ------------------------------------------------- actors: responsive sweep
        for width, height, label in ((1440, 900, "1440x900"), (1280, 800, "1280x800"), (1024, 768, "1024x768"), (768, 1024, "768x1024"), (390, 844, "390x844"), (320, 568, "320x568"), (720, 450, "200% zoom")):
            ctx, page = await new_page(browser, width=width, height=height, actors=True, pocket=["roaming", "calls-services", "vf-play"])
            await page.wait_for_selector("#pocket-output[data-pocket-actor-ready]", state="attached", timeout=5000)
            await page.wait_for_selector(".pocket-peek[data-state='shown']", timeout=5000)
            await page.wait_for_timeout(800)
            await page.evaluate(CROSSING_PROBE)
            await open_and_settle(page)
            await page.wait_for_timeout(1700)
            col = await collisions(page)
            check(f"actors {label}: no overflow, nothing covered", col["overflow"] <= 0 and not col["hits"], col)
            crossings = await page.evaluate("window.__crossings")
            check(f"actors {label}: the mascot never crosses card content during its ride", not crossings, crossings[:5])
            if width >= 1024:
                check(f"actors {label}: the mascot stays in view under the drone (not tucked away)", col["mascot"] in ("idle", "yawning", "sleeping"), col)
            # The pointer somewhere over the album (as in use), then the margins.
            await page.mouse.move(width * 0.4, height * 0.45, steps=4)
            await page.wait_for_timeout(900)
            margin = await page.evaluate(MARGIN_PROBE)
            check(f"actors {label}: the mascot (body and board) lines up with the content's right margin", abs(margin["mascot"]) <= 3, margin)
            if margin["anchor"] not in (None, "none"):
                check(f"actors {label}: the drone's right edge lines up with the same margin", margin["anchor"] == "upper-right" and -6.5 <= margin["drone"] <= 3.5 and margin["droneMax"] <= 4.5, margin)
                hands = await page.evaluate(HANDS_ON_REMOTE)
                check(f"actors {label}: it flies the drone with the remote in both hands", hands["held"] == "held" and all(hands["hands"]), hands)
            if width < 640:
                check(f"actors {label}: phones get no drone (the control bar stays clear)", col["anchor"] == "none" and await page.evaluate("document.querySelector('.pocket-drone').hidden"), col)
                check(f"actors {label}: no drone, no remote", await page.evaluate("document.querySelector('.pocket-mascot').dataset.remote") in (None, "none"))
            if label == "390x844":
                await shot(page, "09-mobile-390x844")
            for y in (400, 2000):
                await page.evaluate(f"window.scrollTo(0, {y})")
                await page.wait_for_timeout(450)
                col = await collisions(page)
                check(f"actors {label}: still nothing covered after scrolling to {y}", not col["hits"], col)
            check(f"no page errors (actors {label})", not page.errors, page.errors)
            await ctx.close()

        # ------------------------------------------------------ persistence
        ctx, page = await new_page(browser)
        await page.evaluate("localStorage.setItem('aixc.pocket.v1', JSON.stringify(['vf-play', 'not-a-real-id']))")
        await page.reload()
        await page.wait_for_selector(".pocket-peek[data-state='shown']", timeout=4000)
        check("a returning visitor's pocket is restored (unknown ids ignored)", await count_badge(page) == "1" and await page.evaluate(
            "document.querySelector('[data-aixc-item=\"vf-play\"]').classList.contains('is-pocketed')"))
        await page.wait_for_timeout(1800)
        check("actors: a restored pocket does not replay a save greeting", not [s for s in await states(page) if s != "hidden"], await states(page))
        await ctx.close()

        # ------------------------------------------------------ keyboard
        ctx, page = await new_page(browser)
        await scroll_to(page, "call-and-connect-abroad")
        await page.focus('[data-aixc-item="visiting-egypt"] .pocket-cta')
        await page.keyboard.press("Enter")
        check("keyboard: focus moves to Put back after pocketing", await page.evaluate(
            "document.activeElement.classList.contains('pocket-liner__undo')"))
        await settle(page)
        await page.focus(".pocket-peek")
        await page.keyboard.press("Enter")
        await page.wait_for_function("document.activeElement?.id === 'pocket-title'", timeout=4000)
        await page.keyboard.press("Escape")
        await page.wait_for_function("document.querySelector('#pocket-output').hidden", timeout=4000)
        check("keyboard: Escape turns the page back", await page.evaluate("!document.querySelector('#source-content').hidden"))
        check("no page errors (keyboard)", not page.errors, page.errors)
        await ctx.close()

        # ------------------------------------------------------ reduced motion
        ctx, page = await new_page(browser, reduced_motion="reduce")
        await scroll_to(page, "call-and-connect-abroad")
        await page.click('[data-aixc-item="roaming"] .pocket-cta')
        check("reduced motion: pocketing is immediate, nothing flies", await page.evaluate(
            "!document.querySelector('.curl-host') && document.querySelector('.pocket-peek').dataset.state === 'shown'") and await count_badge(page) == "1")
        await page.wait_for_selector("#pocket-output[data-pocket-actor-ready]", state="attached", timeout=5000)
        await page.wait_for_timeout(1900)
        check("reduced motion: no greeting from the mascot", not [s for s in await states(page) if s != "hidden"], await states(page))
        await page.click(".pocket-peek")
        check("reduced motion: the pocket opens without a turn", await page.evaluate(
            "!document.querySelector('#pocket-output').hidden && document.querySelector('.pocket-layer--plane').childElementCount === 0"))
        await page.wait_for_timeout(1500)
        reduced_states = await states(page)
        check("reduced motion: the mascot is shown straight in its place (no ride)", await state(page) == "idle" and not set(reduced_states) & {"emerging", "holding", "riding", "flinching"}, reduced_states)
        check("reduced motion: the drone rests at home, decorative, nothing animating", await state(page, "drone") == "home-hover" and await page.evaluate("document.querySelector('.pocket-drone').inert") and await actor_animations(page) == 0 and "drawing-heart" not in await states(page, "drone"), await actor_animations(page))
        await page.hover('[data-pocket-id="roaming"] .pocket-sticker')
        await page.wait_for_timeout(2600)
        still = await page.evaluate("(() => { const m = document.querySelector('.pocket-mascot svg'); const a = m.innerHTML; return new Promise((done) => setTimeout(() => done(a === m.innerHTML), 800)) })()")
        check("reduced motion: no reactions, and the characters are drawn still", await state(page) == "idle" and still, await states(page))
        check("reduced motion (board): it stands on its board, hovering still", await page.evaluate("document.querySelector('.pocket-mascot').dataset.board") == "hovering")
        held = await page.evaluate(HANDS_ON_REMOTE)
        check("reduced motion (pilot): it simply holds the remote, sticks centred; the drone never lands", held["held"] == "held" and all(held["hands"]) and await page.evaluate("(document.querySelector('.pocket-mascot').dataset.sticks || '0,0,0,0').split(',').every((v) => Math.abs(+v) < 0.01)") and not {"landing", "landed", "taking-off"} & set(await states(page, "drone")), held)
        check("reduced motion: the cursor stays the normal cursor (no light, no lean)", await page.evaluate("!document.querySelector('#pocket-output').hasAttribute('data-cursor') && getComputedStyle(document.querySelector('.pocket-sticker')).cursor !== 'none'"))
        await shot(page, "10-reduced-motion-static")
        check("no page errors (reduced motion)", not page.errors, page.errors)
        await ctx.close()

        # ------------------------------------------------------ mobile
        ctx, page = await new_page(browser, width=390, height=844)
        overflow = await page.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
        check("mobile: chips cause no horizontal scroll", overflow <= 0, overflow)
        await scroll_to(page, "call-and-connect-abroad")
        await page.click('[data-aixc-item="roaming"] .pocket-cta')
        await settle(page)
        await page.click(".pocket-peek")
        await page.wait_for_function("document.activeElement?.id === 'pocket-title'", timeout=4000)
        overflow = await page.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
        check("mobile: pocket album fits the screen", overflow <= 0, overflow)
        check("mobile: no drone in the control bar", await page.evaluate("document.querySelector('.pocket-drone')?.hidden !== false"))
        await page.wait_for_function("document.querySelector('.pocket-mascot').dataset.mascotState === 'idle'", timeout=6000)
        await page.evaluate(BOARD_TRACK)
        await page.wait_for_timeout(2500)
        phone = board_hover(await page.evaluate("window.__board"))
        check("mobile (board): it hovers on its board there too (no remote: there is no drone)", phone["frames"] > 40 and phone["bob"] >= 1 and phone["feet_off_deck"] == 0 and await page.evaluate("document.querySelector('.pocket-mascot').dataset.remote") == "none", phone)
        col = await collisions(page)
        check("mobile (board): the mascot on its board covers nothing", not col["hits"], col)
        check("no page errors (mobile)", not page.errors, page.errors)
        await ctx.close()

        # ------------------------- ADR-0044 with the actors: the corner tucks in, the mascot hides
        for width, height, label in ((1366, 860, "desktop"), (375, 812, "phone")):
            ctx, page = await new_page(browser, width=width, height=height, actors=True, pocket=["roaming"])
            cta = page.locator(".pocket-cta:visible").first
            await cta.scroll_into_view_if_needed()
            await cta.click()
            out = True
            try:
                await page.wait_for_function(f"({MASCOT_SEEN})().visible", timeout=6000)
            except Exception:
                out = False
            check(f"tucked ({label}): after pocketing, the mascot is out beside the Pocket button", out, await page.evaluate(MASCOT_SEEN))
            if await page.is_visible(".aixc-launcher"):
                await page.click(".aixc-launcher")
            else:
                await page.click(".aixc-viewbar__actions button >> nth=0")
            await page.click(".aixc-template[data-template=coverflow]")
            await page.wait_for_selector("#experience-output [data-experience=coverflow]")
            seen = []
            for _ in range(5):
                await page.wait_for_timeout(500)
                seen.append(await page.evaluate(MASCOT_SEEN))
            check(f"tucked ({label}): in the reimagined view the mascot never shows (ADR-0044)", not any(s["visible"] for s in seen), seen)
            check(f"no page errors (tucked, {label})", not page.errors, page.errors)
            await ctx.close()

        await browser.close()

    failed = [name for name, ok in results if not ok]
    print(f"\n{len(results) - len(failed)}/{len(results)} checks passed")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    asyncio.run(main())
