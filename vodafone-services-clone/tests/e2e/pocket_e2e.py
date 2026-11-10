"""
End-to-end checks for Pocket (sticker peel, peeking corner, page turn) and its actors (the
mascot under the curl and the drone over the album). Optional; needs Python Playwright,
like aixc_e2e.py.

    node scripts/serve.mjs --port 5200 &
    python tests/e2e/pocket_e2e.py http://127.0.0.1:5200/
    POCKET_SHOTS=shots python tests/e2e/pocket_e2e.py http://127.0.0.1:5200/   # + screenshots

Each check prints PASS/FAIL; the script exits non-zero if any check fails. The actor checks
seed the actors' randomness and shorten the later idle thresholds through
window.__POCKET_ACTORS_TEST__ (read once at start-up), so every timing is deterministic.
"""

import asyncio
import json
import os
import sys

from playwright.async_api import async_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:5200/"
SHOTS = os.environ.get("POCKET_SHOTS")
results = []

# Deterministic actors: fixed seed, the brief's 2 s impatience, apple and sleep brought forward,
# ambient glances pushed out of the way so they cannot interleave with the checks.
ACTOR_TEST = "window.__POCKET_ACTORS_TEST__ = { seed: 7, timing: { eatAt: 3500, sleepAt: 6000, impatient: 1000, eat: 1600, glanceEvery: [600000, 600000] } }"

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
        const drone = document.querySelector('.pocket-drone')
        const mascot = document.querySelector('.pocket-mascot')
        const living = ['corner-idle', 'glancing', 'impatient', 'eating', 'yawning', 'sleeping', 'jumping', 'beaming', 'waking']
        const actors = [
          ['drone', drone && !drone.hidden ? box(drone) : null],
          ['mascot', mascot && living.includes(mascot.dataset.mascotState) ? box(mascot.querySelector('svg')) : null],
        ]
        const targets = [...document.querySelectorAll('#pocket-output .pocket-back, #pocket-output .pocket-clear, #pocket-title, .pocket-view__lead, .pocket-view__mark, .pocket-sticker, .pocket-empty')]
        const hits = []
        for (const [name, a] of actors) for (const t of targets) if (hit(a, box(t))) hits.push(`${name} x ${t.className || t.id}`)
        // At the top of the page nothing may reach the header; once scrolled, actors pass under it (it paints above them).
        const header = box(document.querySelector('#site-header'))
        if (window.scrollY === 0) for (const [name, a] of actors) if (a && header && a.top < header.bottom - 1 && a.bottom > header.top) hits.push(`${name} x header`)
        return { overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, hits, anchor: drone?.dataset.droneAnchor, mascot: mascot?.dataset.mascotState }
    })()""")


async def actor_animations(page):
    """Web/CSS animations still running on either actor."""
    return await page.evaluate("document.getAnimations().filter((a) => a.playState === 'running' && a.effect?.target?.closest?.('.pocket-mascot, .pocket-drone, .pocket-drone-trail')).length")


async def open_and_settle(page):
    await page.click(".pocket-peek")
    await page.wait_for_function("document.activeElement?.id === 'pocket-title'", timeout=6000)
    await page.wait_for_function("['corner-idle', 'tucked'].includes(document.querySelector('.pocket-mascot')?.dataset.mascotState)", timeout=6000)
    await page.wait_for_function("['home-hover', 'hidden'].includes(document.querySelector('.pocket-drone')?.dataset.droneState)", timeout=6000)


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

        # ------------------------------------------------------------ actors: greeting
        ctx, page = await new_page(browser, width=1440, height=900, actors=True)
        await page.wait_for_selector("body[data-pocket-actor-ready]", timeout=5000)
        header_before = await page.evaluate("document.querySelector('#site-header').outerHTML + document.querySelector('footer').outerHTML")
        check("actors: no mascot on the page before anything is pocketed", await page.evaluate("document.querySelectorAll('.pocket-mascot').length") == 0)
        await scroll_to(page, "stay-in-control")
        await page.mouse.move(700, 300)
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
        check("actors: mascot starts hidden inside the curl's under layer, beneath the lifted paper", hidden_under == {"state": "hidden", "under": True, "behindPaper": True, "hidden": True}, hidden_under)
        await wait_state(page, "waving", timeout=3000)
        await shot(page, "01-mascot-peeking-behind-curl", {"x": 1140, "y": 600, "width": 300, "height": 300})
        check("actors: the pocket button stays on top and clickable during the wave", await page.evaluate("""(() => {
            const b = document.querySelector('.pocket-peek').getBoundingClientRect()
            return !!document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2)?.closest('.pocket-peek') })()"""))
        greeting_log = await log(page, "mascot", t0)
        check("actors: it rises from under the curl (occluded layer) while the corner opens", any(e["state"] == "peeking" and e["under"] for e in greeting_log), greeting_log)
        rise_at = next((e["t"] - t0 for e in greeting_log if e["state"] == "peeking"), None)
        check("actors: it stays hidden for the first ~220 ms of the corner opening", rise_at is not None and 200 <= rise_at <= 450, rise_at)
        await wait_state(page, "hidden", timeout=3000)
        sequence = [e for e in await states(page, "mascot", t0) if e != "hidden"]
        check("actors: rises, waves once and ducks back to hidden", sequence == ["peeking", "waving", "retreating"], sequence)
        await settle(page)

        # Two saves in quick succession: one greeting, one mascot.
        await scroll_to(page, "call-and-connect-abroad")
        t1 = await clock(page)
        await page.click('[data-aixc-item="roaming"] .pocket-cta')
        await page.click('[data-aixc-item="visiting-egypt"] .pocket-cta')
        await page.wait_for_timeout(2100)
        check("actors: rapid saves coalesce into one greeting and one mascot", (await states(page, "mascot", t1)).count("peeking") == 1 and await page.evaluate("document.querySelectorAll('.pocket-mascot').length") == 1, await states(page, "mascot", t1))
        await settle(page)

        # Opening the pocket mid-wave interrupts the greeting.
        await scroll_to(page, "great-entertainment")
        await page.click('[data-aixc-item="mo-salah-world"] .pocket-cta')
        await wait_state(page, "waving", timeout=3000)
        t2 = await clock(page)
        await page.mouse.move(600, 500)
        await page.click(".pocket-peek")
        await page.wait_for_timeout(60)
        check("actors: pressing the pocket button mid-wave ducks the mascot at once", await state(page) == "retreating" and (await log(page, "mascot", t2))[0]["state"] == "retreating")
        await page.wait_for_function("document.querySelector('.pocket-mascot')?.dataset.mascotState === 'running'", timeout=5000)
        await shot(page, "02-pocket-reveal-mascot-running")
        await page.wait_for_function("document.activeElement?.id === 'pocket-title'", timeout=5000)
        check("actors: focus still lands on the pocket title", await page.evaluate("document.activeElement.id") == "pocket-title")
        await wait_state(page, "drawing-heart", who="drone", timeout=3000)
        await page.wait_for_timeout(900)
        await shot(page, "07-drone-drawing-heart")
        await wait_state(page, "corner-idle", timeout=5000)
        open_log = await log(page, "mascot", t2)
        names = [e["state"] for e in open_log]
        reveal = [n for n in names if n in ("page-reveal-hidden", "startled", "running", "recovering", "corner-idle")]
        check("actors: caught by the turn: hidden, startled, runs, recovers, settles", reveal == ["page-reveal-hidden", "startled", "running", "recovering", "corner-idle"], names)
        startled = next(e for e in open_log if e["state"] == "startled")
        check("actors: it is caught while the page is still turning (the turn stays in control)", startled["turning"] and startled["album"], startled)
        check("actors: exactly one mascot, now in the album", await page.evaluate("document.querySelectorAll('.pocket-mascot').length === 1 && !!document.querySelector('.pocket-mascot').closest('#pocket-output .pocket-mascot-stage')"))
        settled = await rect(page, ".pocket-mascot svg")
        check("actors: it runs to the corner opposite the curl (bottom-left)", settled and settled["x"] + settled["w"] / 2 < 1440 * 0.2 and abs(settled["y"] + settled["h"] - 900) <= 2, settled)
        await shot(page, "03-mascot-settled-opposite-corner")
        await page.wait_for_timeout(1200)
        check("actors: it stays anchored there after the turn", near(await rect(page, ".pocket-mascot svg"), settled))

        # Drone: one heart, then home.
        await wait_state(page, "home-hover", who="drone", timeout=5000)
        hearts = (await states(page, "drone", t2)).count("drawing-heart")
        check("actors: the drone draws one heart per opening", hearts == 1, await states(page, "drone", t2))
        home = await rect(page, ".pocket-drone")
        col = await collisions(page)
        check("actors: drone home is collision-free in the upper right", col["anchor"] == "upper-right" and not col["hits"], col)
        await shot(page, "08-drone-home-anchor")

        # Eye tracking stays inside the socket.
        await page.mouse.move(1430, 110)
        await page.wait_for_timeout(450)
        right = await page.evaluate("document.querySelector('.pocket-mascot [data-part=iris]').dataset.gaze.split(',').map(Number)")
        await page.mouse.move(2, 880)
        await page.wait_for_timeout(450)
        left = await page.evaluate("document.querySelector('.pocket-mascot [data-part=iris]').dataset.gaze.split(',').map(Number)")
        check("actors: the pupil follows the pointer", right[0] > 2 and right[1] < 0 and left[0] < 0, (right, left))
        check("actors: the pupil stays inside the eye socket", max((x * x + y * y) ** 0.5 for x, y in (right, left)) <= 7.0 + 1e-6, (right, left))

        # Card hover: one jump per entry; keyboard focus: the reduced equivalent.
        card = await rect(page, '[data-pocket-id="roaming"]')
        t3 = await clock(page)
        await page.mouse.move(card["x"] + card["w"] / 2, card["y"] + 40, steps=4)
        for dx in (10, 25, 40):
            await page.mouse.move(card["x"] + card["w"] / 2 + dx, card["y"] + 60)
        await page.wait_for_timeout(120)
        await shot(page, "04-card-hover-jump")
        await page.mouse.move(700, 880)
        await page.mouse.move(card["x"] + card["w"] / 2, card["y"] + 40)
        await page.wait_for_timeout(700)
        check("actors: hovering a pocket card triggers one jump (crossings debounced)", (await states(page, "mascot", t3)).count("jumping") == 1, await states(page, "mascot", t3))
        check("actors: the grid and its cards are not moved by the mascot", near(await rect(page, '[data-pocket-id="roaming"]'), card, 0.5))
        await page.mouse.move(700, 880)
        await page.wait_for_timeout(700)
        t4 = await clock(page)
        await page.focus("#pocket-title")
        await page.keyboard.press("Tab")
        await page.wait_for_timeout(150)
        check("actors: keyboard focus on a card gets the reduced reaction (no jump)", "beaming" in await states(page, "mascot", t4) and "jumping" not in await states(page, "mascot", t4), await states(page, "mascot", t4))
        check("actors: the mascot is hidden from assistive tech and never takes focus", await page.evaluate("document.querySelector('.pocket-mascot').getAttribute('aria-hidden') === 'true' && !document.activeElement.closest('.pocket-mascot')"))

        # Idle ladder on deterministic timing: 2 s impatient, then apple, then sleep; input wakes.
        t5 = await clock(page)
        await page.keyboard.press("Shift")
        await wait_state(page, "impatient", timeout=4000)
        impatient_at = next(e["t"] for e in await log(page, "mascot", t5) if e["state"] == "impatient") - t5
        check("actors: two seconds of inactivity makes it impatient", 1900 <= impatient_at <= 2500, impatient_at)
        await page.wait_for_timeout(700)
        await shot(page, "05-mascot-impatient", {"x": 0, "y": 740, "width": 300, "height": 160})
        await wait_state(page, "eating", timeout=4000)
        await page.wait_for_timeout(500)
        await shot(page, "05-mascot-apple", {"x": 0, "y": 740, "width": 300, "height": 160})
        await wait_state(page, "sleeping", timeout=6000)
        ladder = await log(page, "mascot", t5)
        eat_at = next(e["t"] for e in ladder if e["state"] == "eating") - t5
        sleep_at = next(e["t"] for e in ladder if e["state"] == "yawning") - t5
        check("actors: later thresholds bring the apple, then sleep", 3400 <= eat_at <= 4000 and 5900 <= sleep_at <= 6600, (eat_at, sleep_at))
        await page.wait_for_timeout(900)
        await shot(page, "05-mascot-sleeping", {"x": 0, "y": 740, "width": 300, "height": 160})
        t6 = await clock(page)
        await page.mouse.move(800, 500)
        await page.wait_for_timeout(80)
        check("actors: input wakes it", await state(page) == "waking")
        await wait_state(page, "impatient", timeout=4500)
        rewind = next(e["t"] for e in await log(page, "mascot", t6) if e["state"] == "impatient") - t6
        check("actors: waking restarts the idle ladder from zero", 2400 <= rewind <= 3300, rewind)
        await page.mouse.move(820, 520)

        # Drone play: hover dodge, drag (release, cancel, Escape) always springs home.
        t7 = await clock(page)
        await page.hover(".pocket-drone")
        await page.wait_for_timeout(120)
        check("actors: hovering the drone startles it", "evading" in await states(page, "drone", t7))
        await page.mouse.move(700, 600)
        await wait_state(page, "home-hover", who="drone", timeout=3000)
        await page.wait_for_timeout(100)
        check("actors: after the dodge it is back on its anchor", near(await rect(page, ".pocket-drone"), home), (await rect(page, ".pocket-drone"), home))

        async def grab_and_drag(dx, dy):
            box = await rect(page, ".pocket-drone")
            await page.mouse.move(box["x"] + box["w"] / 2, box["y"] + box["h"] / 2)
            await page.wait_for_timeout(950)  # past the hover-dodge cooldown and back home
            await wait_state(page, "home-hover", who="drone", timeout=3000)
            await page.mouse.down()
            await page.mouse.move(box["x"] + box["w"] / 2 + dx, box["y"] + box["h"] / 2 + dy, steps=8)
            await page.wait_for_timeout(250)

        await grab_and_drag(-160, 220)
        moved = await rect(page, ".pocket-drone")
        check("actors: the drone can be dragged", await state(page, "drone") == "dragging" and moved["x"] < home["x"] - 60 and moved["y"] > home["y"] + 80, moved)
        await page.mouse.up()
        await wait_state(page, "home-hover", who="drone", timeout=3000)
        await page.wait_for_timeout(100)
        check("actors: releasing a drag springs it back home", near(await rect(page, ".pocket-drone"), home), await rect(page, ".pocket-drone"))
        await grab_and_drag(120, 160)
        await page.dispatch_event(".pocket-drone", "pointercancel", {"pointerId": 1, "pointerType": "mouse", "bubbles": True})
        await page.wait_for_timeout(60)
        cancelled = await state(page, "drone")
        await page.mouse.up()
        await wait_state(page, "home-hover", who="drone", timeout=3000)
        check("actors: pointer cancellation springs it back home", cancelled == "returning-home" and near(await rect(page, ".pocket-drone"), home), cancelled)
        await grab_and_drag(-100, 140)
        await page.keyboard.press("Escape")
        await page.wait_for_timeout(60)
        escaped = await state(page, "drone")
        await page.mouse.up()
        await wait_state(page, "home-hover", who="drone", timeout=3000)
        check("actors: Escape during a drag returns it home (and keeps the pocket open)", escaped == "returning-home" and await page.evaluate("!document.querySelector('#pocket-output').hidden") and near(await rect(page, ".pocket-drone"), home), escaped)
        await page.focus(".pocket-drone")
        t8 = await clock(page)
        await page.keyboard.press("Enter")
        await page.wait_for_timeout(80)
        check("actors: the drone is a named button; Enter plays with it", await page.evaluate("document.activeElement.getAttribute('aria-label')") == "Play with the Pocket drone" and "evading" in await states(page, "drone", t8))
        check("actors: its target is at least 44 x 44 px", await page.evaluate("(() => { const r = document.querySelector('.pocket-drone').getBoundingClientRect(); return r.width >= 44 && r.height >= 44 })()"))
        await wait_state(page, "home-hover", who="drone", timeout=3000)

        # Resizing re-anchors without replaying the heart.
        t9 = await clock(page)
        await page.set_viewport_size({"width": 1024, "height": 768})
        await page.wait_for_timeout(600)
        col = await collisions(page)
        check("actors: resizing keeps one mascot and one drone, re-anchored and collision-free", await page.evaluate("document.querySelectorAll('.pocket-mascot').length === 1 && document.querySelectorAll('.pocket-drone').length === 1") and not col["hits"] and col["overflow"] <= 0, col)
        check("actors: resizing does not replay the heart", "drawing-heart" not in await states(page, "drone", t9))
        await page.set_viewport_size({"width": 1440, "height": 900})
        await page.wait_for_timeout(400)

        # Closing cancels everything; reopening starts clean.
        t10 = await clock(page)
        await page.click(".pocket-view__bar .pocket-back")
        await page.wait_for_function("document.querySelector('#pocket-output').hidden && document.activeElement?.classList.contains('pocket-peek')", timeout=5000)
        await page.wait_for_timeout(200)
        mascot_close = await states(page, "mascot", t10)
        drone_close = await states(page, "drone", t10)
        check("actors: Back ducks the mascot and stands the drone down", mascot_close[:1] == ["closing"] and mascot_close[-1] == "hidden" and drone_close[:1] == ["closing"] and drone_close[-1] == "hidden", (mascot_close, drone_close))
        check("actors: after closing, one hidden mascot back under the curl and no actor animation running", await page.evaluate("document.querySelectorAll('.pocket-mascot').length === 1 && !!document.querySelector('.pocket-mascot').closest('.pocket-layer--plane .curl-under')") and await actor_animations(page) == 0, await actor_animations(page))
        t11 = await clock(page)
        await open_and_settle(page)
        reopen = [s for s in await states(page, "mascot", t11) if s in ("page-reveal-hidden", "startled", "running", "recovering", "corner-idle")]
        check("actors: reopening starts from a clean state (one journey, one heart)", reopen == ["page-reveal-hidden", "startled", "running", "recovering", "corner-idle"] and (await states(page, "drone", t11)).count("drawing-heart") == 1, (reopen, await states(page, "drone", t11)))
        check("actors: the protected header and footer are untouched", await page.evaluate("document.querySelector('#site-header').outerHTML + document.querySelector('footer').outerHTML") == header_before)
        check("no page errors (actors)", not page.errors, page.errors)
        await ctx.close()

        # ------------------------------------------------- actors: responsive sweep
        for width, height, label in ((1440, 900, "1440x900"), (1280, 800, "1280x800"), (1024, 768, "1024x768"), (768, 1024, "768x1024"), (390, 844, "390x844"), (320, 568, "320x568"), (720, 450, "200% zoom")):
            ctx, page = await new_page(browser, width=width, height=height, actors=True, pocket=["roaming", "calls-services", "vf-play"])
            await page.wait_for_selector("body[data-pocket-actor-ready]", timeout=5000)
            await page.wait_for_selector(".pocket-peek[data-state='shown']", timeout=5000)
            await page.wait_for_timeout(800)
            await open_and_settle(page)
            await page.wait_for_timeout(1700)
            col = await collisions(page)
            check(f"actors {label}: no overflow, nothing covered", col["overflow"] <= 0 and not col["hits"], col)
            if width >= 1024:
                check(f"actors {label}: the mascot stays in view in its corner (not tucked away)", col["mascot"] in ("corner-idle", "glancing", "impatient", "eating", "yawning", "sleeping"), col)
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
        await page.wait_for_selector("body[data-pocket-actor-ready]", timeout=5000)
        await page.wait_for_timeout(1900)
        check("reduced motion: no greeting from the mascot", not [s for s in await states(page) if s != "hidden"], await states(page))
        await page.click(".pocket-peek")
        check("reduced motion: the pocket opens without a turn", await page.evaluate(
            "!document.querySelector('#pocket-output').hidden && document.querySelector('.pocket-layer--plane').childElementCount === 0"))
        await page.wait_for_timeout(1500)
        reduced_states = await states(page)
        check("reduced motion: the mascot is shown straight in its corner pose (no journey)", await state(page) == "corner-idle" and not set(reduced_states) & {"peeking", "startled", "running", "jumping", "impatient"}, reduced_states)
        check("reduced motion: the drone rests at home, decorative, nothing animating", await state(page, "drone") == "home-hover" and await page.evaluate("document.querySelector('.pocket-drone').inert") and await actor_animations(page) == 0 and "drawing-heart" not in await states(page, "drone"), await actor_animations(page))
        await page.hover('[data-pocket-id="roaming"] .pocket-sticker')
        await page.wait_for_timeout(2600)
        check("reduced motion: no jump, no idle ladder", await state(page) == "corner-idle", await states(page))
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
        check("no page errors (mobile)", not page.errors, page.errors)
        await ctx.close()

        await browser.close()

    failed = [name for name, ok in results if not ok]
    print(f"\n{len(results) - len(failed)}/{len(results)} checks passed")
    sys.exit(1 if failed else 0)


asyncio.run(main())
