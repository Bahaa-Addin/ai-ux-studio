"""
End-to-end checks for the Pocket's portal transition (docs/adr/0005-pocket-portal-transition.md).
Optional; needs Python Playwright, like the other e2e scripts.

    node scripts/serve.mjs --port 5200 &
    python tests/e2e/portal_e2e.py http://127.0.0.1:5200/
    PORTAL_SHOTS=shots python tests/e2e/portal_e2e.py http://127.0.0.1:5200/   # + screenshots

Two setups, as in real use:

  * Same origin (the demo, and production): the browser believes it is on web.vodafone.com.eg.
    /en/services is this clone (as `npm run demo:trail` mounts it) and other pages come from the
    voice guide's committed replay of real Vodafone pages (../voice-guide/fixtures/replay), so the
    destination is rendered for real inside the portal. Offline: nothing leaves the machine.
  * Cross origin (this standalone server): Vodafone forbids framing (X-Frame-Options SAMEORIGIN,
    frame-ancestors 'self'), so the portal shows the sticker's own preview.

Animation time is driven with Playwright's clock where a check needs a precise moment. Each
check prints PASS/FAIL; the script exits non-zero if any fails.
"""

import asyncio
import gzip
import json
import os
import sys
from pathlib import Path

from playwright.async_api import async_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:5200/"
SHOTS = os.environ.get("PORTAL_SHOTS")
ROOT = Path(__file__).resolve().parents[2]
REPLAY = ROOT.parent / "voice-guide" / "fixtures" / "replay" / "vodafone-eg"
ORIGIN = "https://web.vodafone.com.eg"
STICKERS = ["vodafone-cash", "roaming", "play-and-win", "end-of-call-notifications", "mini-call"]
CASH = '[data-pocket-id="vodafone-cash"] .pocket-sticker__cta'
results = []

MIME = {".css": "text/css", ".js": "text/javascript", ".woff": "font/woff", ".woff2": "font/woff2", ".svg": "image/svg+xml",
        ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".json": "application/json", ".ico": "image/x-icon"}
PNG_1x1 = bytes.fromhex("89504e470d0a1a0a0000000d4948445200000001000000010806000000" "1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082")

# A stand-in for Vodafone's accessibility button, as the demo browser adds (it must stay visible).
A11Y_STAND_IN = """(() => { if (window.top !== window) return; addEventListener('DOMContentLoaded', () => {
  const b = document.createElement('button'); b.id = 'vodafone-aw-icon'; b.type = 'button'; b.setAttribute('aria-label', 'Accessibility')
  b.style.cssText = 'position:fixed;right:20px;bottom:20px;width:55px;height:55px;border-radius:50%;border:5px solid #fff;background:#e60000;z-index:1'
  document.body.appendChild(b) }) })()"""

STATE_LOG = """window.__portal = []; document.addEventListener('vf-portal:state', (e) => window.__portal.push(e.detail))"""


def check(name, ok, detail=""):
    results.append((name, bool(ok)))
    print(f"{'PASS' if ok else 'FAIL'}  {name}{'  -- ' + str(detail) if detail and not ok else ''}")


def replay_pages():
    crawl = json.loads((REPLAY / "crawl.json").read_text())
    pages = {}
    for page in crawl["pages"]:
        for url in [page["url"], *(page.get("aliases") or [])]:
            pages[url.rstrip("/").lower()] = REPLAY / page["snapshot"]
    return pages


def read(path):
    data = path.read_bytes()
    return gzip.decompress(data) if path.suffix == ".gz" else data


async def same_origin_context(browser, *, width=1440, height=900, reduced_motion="no-preference", mobile=False, document_status=None):
    """The demo browser's replay routing, offline."""
    pages = replay_pages()
    ctx = await browser.new_context(viewport={"width": width, "height": height}, reduced_motion=reduced_motion, is_mobile=mobile, has_touch=mobile)

    async def handle(route):
        request = route.request
        url = request.url
        kind = request.resource_type
        if url.startswith("data:") or url.startswith("blob:"):
            return await route.fallback()
        if not url.startswith(ORIGIN):
            return await (route.fulfill(status=200, content_type="image/png", body=PNG_1x1) if kind == "image" else route.abort())
        path = url[len(ORIGIN):].split("?")[0].split("#")[0]
        if kind == "document" and path.rstrip("/") in ("/en/services", "/ar/services"):
            page = (ROOT / ("index.html" if path.startswith("/en") else "ar/index.html")).read_text()
            return await route.fulfill(status=200, content_type="text/html; charset=utf-8", body=page)
        if kind == "document":
            if document_status and path in document_status:
                status, headers = document_status[path]
                saved = pages.get((ORIGIN + path).rstrip("/").lower())
                return await route.fulfill(status=status, headers={"content-type": "text/html; charset=utf-8", **headers}, body=read(saved) if saved else b"<!doctype html><title>x</title>")
            saved = pages.get((ORIGIN + path).rstrip("/").lower())
            if saved:
                return await route.fulfill(status=200, content_type="text/html; charset=utf-8", body=read(saved))
            return await route.fulfill(status=404, content_type="text/html; charset=utf-8", body="<!doctype html><title>Not in this replay</title><h1>Not in this replay</h1>")
        for base in (ROOT, ROOT / "public", REPLAY / "assets"):
            rel = path.lstrip("/")
            if base == ROOT and not rel.startswith("src/"):
                continue
            for candidate in (base / rel, base / (rel + ".gz")):
                if candidate.is_file():
                    suffix = Path(str(candidate).removesuffix(".gz")).suffix
                    return await route.fulfill(status=200, content_type=MIME.get(suffix, "application/octet-stream"), body=read(candidate))
        return await (route.fulfill(status=200, content_type="image/png", body=PNG_1x1) if kind == "image" else route.abort())

    await ctx.route("**/*", handle)
    await ctx.add_init_script(f"if (window.top === window && !sessionStorage.getItem('seeded')) {{ localStorage.setItem('aixc.pocket.v1', {json.dumps(json.dumps(STICKERS))}); sessionStorage.setItem('seeded', '1') }}")
    await ctx.add_init_script(A11Y_STAND_IN)
    await ctx.add_init_script(STATE_LOG)
    return ctx


async def new_page(ctx, url):
    page = await ctx.new_page()
    page.errors = []
    page.on("pageerror", lambda e: page.errors.append(str(e)))
    await page.goto(url)
    return page


async def open_album(page):
    await page.wait_for_function("document.querySelector('.pocket-peek')?.dataset.state === 'shown'", timeout=10000)
    await page.wait_for_timeout(300)
    await page.click(".pocket-peek")
    await page.wait_for_function("document.body.dataset.pocketView === 'open' && !document.querySelector('.pocket-layer--lift')?.children.length", timeout=10000)
    await page.wait_for_timeout(700)


async def states(page):
    return [d["state"] for d in await page.evaluate("window.__portal || []")]


async def shot(page, name):
    if SHOTS:
        os.makedirs(SHOTS, exist_ok=True)
        await page.screenshot(path=f"{SHOTS}/portal-{name}.png")


def different_pixels(a, b):
    """Share of pixels that differ by more than 16 in any channel (PNG bytes in, 0..1 out)."""
    from io import BytesIO
    try:
        from PIL import Image, ImageChops
    except ImportError:
        return None
    one = Image.open(BytesIO(a)).convert("RGB")
    two = Image.open(BytesIO(b)).convert("RGB")
    if one.size != two.size:
        return 1.0
    diff = ImageChops.difference(one, two).convert("L").point(lambda v: 255 if v > 16 else 0)
    return sum(1 for v in diff.getdata() if v) / (one.size[0] * one.size[1])


def glow_of(png, box):
    """How much brighter the fog is right round the portal than at the screen's top corners
    (mean luminance, levels 0..255; the bottom ones may hold the fallen page being walked over).
    box: the portal's [left, top, right, bottom] on screen."""
    from io import BytesIO
    try:
        from PIL import Image, ImageStat
    except ImportError:
        return None
    image = Image.open(BytesIO(png)).convert("L")
    W, H = image.size
    left, top, right, bottom = box
    pad_x, pad_y = (right - left) * 0.25, (bottom - top) * 0.25
    near = [(left - pad_x, top, left - 4, bottom), (right + 4, top, right + pad_x, bottom), (left, top - pad_y, right, top - 4), (left, bottom + 4, right, bottom + pad_y)]
    cw, ch = W * 0.1, H * 0.1
    corners = [(0, 0, cw, ch), (W - cw, 0, W, ch)]
    mean = lambda boxes: sum(ImageStat.Stat(image.crop(tuple(round(v) for v in b))).mean[0] for b in boxes) / len(boxes)
    return round(mean(near) - mean(corners), 1)


def red_line(png, view):
    """The red line along the portal's top edge: its width (px with clear red), how many of those
    are soft (fading edges, not the core) and its peak redness, as medians over a few columns.
    view: the page's [left, top, right, bottom] on screen."""
    from io import BytesIO
    try:
        from PIL import Image
    except ImportError:
        return None
    image = Image.open(BytesIO(png)).convert("RGB")
    left, top, right, bottom = view
    found = []
    for share in (0.2, 0.35, 0.5, 0.65, 0.8):
        x = round(left + (right - left) * share)
        reds = [image.getpixel((x, y))[0] - (image.getpixel((x, y))[1] + image.getpixel((x, y))[2]) / 2 for y in range(max(0, round(top) - 30), round(top) + 2)]
        peak = max(reds)
        clear = [v for v in reds if v > 25]
        found.append((len(clear), sum(1 for v in clear if v < 0.6 * peak), peak))
    found.sort()
    return {"width": found[2][0], "soft": found[2][1], "peak": found[2][2], "columns": found}


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()

        # ------------------------------------------------ same origin: the real page in the portal
        ctx = await same_origin_context(browser)
        page = await new_page(ctx, f"{ORIGIN}/en/services")
        await page.wait_for_selector(".pocket-cta", state="attached")
        check("without the Pocket open, nothing is intercepted", await page.evaluate("""(() => {
            const a = Object.assign(document.createElement('a'), { href: '/en/home', textContent: 'x' })
            document.querySelector('#source-content').prepend(a)
            let prevented = null
            // On window, after the interceptor's document listener: see what it did, then stay here.
            addEventListener('click', (e) => { prevented = e.defaultPrevented; e.preventDefault() }, { once: true })
            a.click(); a.remove()
            return prevented === false && !document.querySelector('.vf-portal')
        })()"""))
        await open_album(page)
        check("sticker links leave in this tab (the portal is on)", await page.evaluate(
            "[...document.querySelectorAll('.pocket-sticker__cta')].every((a) => !a.target && !/new tab/.test(a.textContent))"))
        check("the scene is loaded and the hall painted while the album is open", await page.evaluate(
            "!!document.querySelector('link[data-vf-portal-css]')"))
        cta = page.locator(CASH)
        await cta.scroll_into_view_if_needed()
        await page.hover(CASH)
        await page.wait_for_timeout(700)
        await page.clock.install()
        await page.clock.pause_at(await page.evaluate("Date.now()") + 1000)
        # Keep the real navigation from happening until the last frame is checked.
        await page.evaluate("document.addEventListener('click', (e) => { if (e.target.closest?.('.vf-portal__go') && window.__holdNavigation) e.preventDefault() }, true); window.__holdNavigation = true")
        before = await page.screenshot()
        await page.click(CASH)
        first = await page.screenshot()
        share = different_pixels(before, first)
        check("first frame: the overlay looks exactly like the Pocket page", share is not None and share < 0.002, share)
        check("the transition starts in the click (no delay)", await page.evaluate(
            "!!document.querySelector('.vf-portal') && window.__portal.some((d) => d.state === 'preparing')"))
        check("one overlay, one wall: the page moves as a single plane", await page.evaluate(
            "document.querySelectorAll('.vf-portal').length === 1 && document.querySelectorAll('.vf-portal__wall').length === 1 && document.querySelectorAll('.vf-portal__wall .vf-portal__face').length === 1"))
        live_transforms = await page.evaluate("[...document.querySelectorAll('#pocket-output .pocket-sticker, .site-header, #pocket-output')].map((n) => n.style.transform).join('|')")
        iframe = await page.evaluate("""(() => { const f = document.querySelector('.vf-portal__iframe'); return f && { src: f.src, sandbox: f.getAttribute('sandbox'), hidden: f.getAttribute('aria-hidden'), tab: f.tabIndex, w: f.offsetWidth, h: f.offsetHeight } })()""")
        check("the destination loads in a temporary sandboxed iframe the size of the viewport", iframe and iframe["src"] == f"{ORIGIN}/en/vodafone-cash" and iframe["sandbox"] == "allow-same-origin" and iframe["hidden"] == "true" and iframe["tab"] == -1 and iframe["w"] == 1440 and iframe["h"] == 900, iframe)
        check("the page's scrollbar is hidden while it runs", await page.evaluate("document.documentElement.dataset.vfPortal === 'active'"))
        check("a screen reader hears where it is going", await page.evaluate("document.querySelector('.vf-portal__status').textContent") == "Opening Vodafone Cash")

        # Wait for the destination (real time), then play the fall.
        await page.wait_for_function("document.querySelector('.vf-portal')?.dataset.destination", timeout=10000)
        check("the destination is rendered for real (same origin)", await page.evaluate("document.querySelector('.vf-portal').dataset.destination") == "frame")
        wall_rest = await page.evaluate("(() => { const r = document.querySelector('.vf-portal__face').getBoundingClientRect(); return [r.top, r.bottom, r.width] })()")
        face_rect = "(() => { const f = document.querySelector('.vf-portal__face'); const r = f.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, width: r.width, shown: getComputedStyle(document.querySelector('.vf-portal__wall')).visibility !== 'hidden' } })()"
        # At once, light seeps in at the page's edges and the viewer moves in on the page; closing in,
        # they push it over and go on through where it stood.
        await page.clock.run_for(200)
        moving_in = await page.evaluate(face_rect)
        seep = await page.evaluate("+getComputedStyle(document.querySelector('.vf-portal__seep')).opacity")
        # (The transition's clock starts two frames after the click, so "0.2 s" here is about 0.16 s on it.)
        check("it starts in the click: light seeps in at the page's edges (by 0.2 s)", seep > 0.1, seep)
        check("and the viewer is moving in on the page, easing in (by 0.2 s it is visibly bigger)", moving_in["width"] > wall_rest[2] * 1.008, (wall_rest, moving_in))
        await page.clock.run_for(250)
        pushed = await page.evaluate(face_rect)
        # (The viewer is much nearer by now, so the page is bigger on screen and its top shows higher than a still viewer would see it.)
        check("closing in, the viewer pushes the wall: it tips back about its bottom edge while it grows on screen (by 0.45 s)", pushed["shown"] and pushed["top"] > wall_rest[0] + 0.04 * 900 and pushed["bottom"] > 900 * 0.95 and pushed["width"] > wall_rest[2] * 1.15, (wall_rest, pushed))
        await page.clock.run_for(100)
        falling = await page.evaluate(face_rect)
        await shot(page, "falling")
        check("then it falls away beneath the viewer as they go on (its top keeps dropping down the screen)", falling["top"] > pushed["top"] + 40, (pushed, falling))
        check("the live page underneath is never moved", await page.evaluate("[...document.querySelectorAll('#pocket-output .pocket-sticker, .site-header, #pocket-output')].map((n) => n.style.transform).join('|')") == live_transforms)
        a11y = await page.evaluate("(() => { const b = document.querySelector('#vodafone-aw-icon').getBoundingClientRect(); const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return hit?.id === 'vodafone-aw-icon' })()")
        check("Vodafone's accessibility button stays visible and usable above the transition", a11y)
        await page.clock.run_for(550)
        check("by 1.1 s the viewer has gone through: the wall has passed beneath them and is hidden", not (await page.evaluate(face_rect))["shown"])
        # 1.1 s: the door is still far (about a quarter of the screen) and soft; the line is being drawn.
        await shot(page, "portal")
        door = await page.evaluate("""(() => { const v = document.querySelector('.vf-portal__view').getBoundingClientRect(); const k = v.width / innerWidth
            return { bottom: v.bottom, floor: innerHeight / 2 + (innerHeight / 2) * k, most: 0.025 * innerHeight * k + 1 } })()""")
        check("the destination comes toward the viewer too: it has risen a little off the floor", 1 <= door["floor"] - door["bottom"] <= door["most"], door)
        check("a glowing white space (no mist, no hall) and the portal revealed behind the fallen wall", await page.evaluate(
            "(() => { const g = document.querySelector('.vf-portal__gate'); return +getComputedStyle(g).opacity > 0.9 && !document.querySelector('.vf-portal__mist, .vf-portal__pulse, .vf-portal__glowmap') && !!document.querySelector('.vf-portal__light') })()"))
        check("far away the portal is soft, but not lost in any fog", await page.evaluate(
            "(() => { const g = getComputedStyle(document.querySelector('.vf-portal__gate')); return /blur/.test(g.filter) && +g.opacity > 0.99 })()"))
        lights = await page.evaluate("""(() => { const v = document.querySelector('.vf-portal__view').getBoundingClientRect(); const c = [...document.querySelectorAll('.vf-portal__spark')].map((n) => { const r = n.getBoundingClientRect(); return [(r.left + r.right) / 2, (r.top + r.bottom) / 2, +getComputedStyle(n).opacity] })
            return { lights: c, centre: [(v.left + v.right) / 2, (v.top + v.bottom) / 2], frame: +getComputedStyle(document.querySelector('.vf-portal__frame')).opacity, tracks: document.querySelectorAll('.vf-portal__track').length } })()""")
        mid = [(lights["lights"][0][0] + lights["lights"][1][0]) / 2, (lights["lights"][0][1] + lights["lights"][1][1]) / 2] if len(lights["lights"]) == 2 else None
        check("two lights set off from opposite corners to draw the red line round the page", lights["tracks"] == 4 and lights["frame"] > 0.9 and mid and abs(mid[0] - lights["centre"][0]) < 2 and abs(mid[1] - lights["centre"][1]) < 2 and all(l[2] > 0.5 for l in lights["lights"]), lights)
        light = await page.evaluate("""(() => { const l = document.querySelector('.vf-portal__light'); const v = document.querySelector('.vf-portal__view').getBoundingClientRect(); if (!l) return null; const r = l.getBoundingClientRect()
            return { opacity: +getComputedStyle(l).opacity, dx: (r.left + r.right) / 2 - (v.left + v.right) / 2, dy: (r.top + r.bottom) / 2 - (v.top + v.bottom) / 2, wider: r.width / v.width, box: [v.left, v.top, v.right, v.bottom] } })()""")
        # (The light stays deep in the space where the portal started; the portal has risen a little in front of it.)
        check("a light glows behind the portal: centred on it and far wider than it", light and light["opacity"] > 0.5 and abs(light["dx"]) < 3 and abs(light["dy"]) < 8 and light["wider"] > 2.5, light)
        glow = glow_of(await page.screenshot(), light["box"]) if light else None
        check("the white glows: brighter round the portal than at the edges of the screen", glow is None or glow >= 10, glow)
        print(f"      (round the portal minus the top corners: {glow} levels of 255)")
        sizes = []
        wall_seen = []
        line = None
        for i in range(10):
            await page.clock.run_for(150)
            sizes.append(await page.evaluate("document.querySelector('.vf-portal__view').getBoundingClientRect().width"))
            if i == 5:  # 2.0 s: the top of the line is drawn and the portal is most of the screen
                view = await page.evaluate("(() => { const r = document.querySelector('.vf-portal__view').getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom] })()")
                line = red_line(await page.screenshot(), view)
            wall_seen.append(await page.evaluate("getComputedStyle(document.querySelector('.vf-portal__wall')).visibility !== 'hidden'"))
        check("once walked over, the fallen page has passed beneath and is gone (it stays gone)", not any(wall_seen), wall_seen)
        check("the destination grows every step as the viewer comes closer", all(b >= a - 0.5 for a, b in zip(sizes, sizes[1:])) and sizes[-1] > sizes[0] * 2, sizes)
        # (The old frame was a solid 2.2% ring: about 17 px at this size.)
        check("the red line is thin and soft: a few px of red with fading edges, drawn all round", line is None or (3 <= line["width"] <= 10 and line["soft"] >= 2 and line["peak"] > 60), line)
        print(f"      (the line at 2.0 s: {line})")
        for _ in range(40):
            if "completed" in await states(page):
                break
            await page.clock.run_for(100)
        observed = await states(page)
        order = ["preparing", "wall-falling", "portal-revealing", "destination-approaching", "handoff", "completed"]
        check("one lifecycle, in order: preparing → … → handoff → completed", [s for s in observed if s in order] == order, observed)
        handoff = next((d for d in await page.evaluate("window.__portal") if d["state"] == "handoff"), {})
        check("handoff when the portal is the viewport, with the real page in it", handoff.get("reason") == "arrived" and handoff.get("destination") == "frame", handoff)
        check("at the end the portal is flat, unscaled, sharp and out of the fog", await page.evaluate(
            "(() => { const g = getComputedStyle(document.querySelector('.vf-portal__gate')); return g.transform === 'none' && g.filter === 'none' && +g.opacity === 1 && [...document.querySelectorAll('.vf-portal__mist, .vf-portal__light')].every((m) => +getComputedStyle(m).opacity === 0) })()"))
        last = await page.screenshot()
        await shot(page, "last-frame")

        # Now let the real navigation happen and compare.
        await page.evaluate("window.__holdNavigation = false")
        await page.clock.resume()
        async with page.expect_navigation(url=f"{ORIGIN}/en/vodafone-cash"):
            await page.evaluate("document.querySelector('.vf-portal__go')?.click()")
        await page.wait_for_load_state("load")
        await page.evaluate("document.fonts.ready")
        await page.wait_for_timeout(300)
        after = await page.screenshot()
        share = different_pixels(last, after)
        check("last frame matches the destination after the real navigation", share is not None and share < 0.005, share)
        check("no portal left on the destination", await page.evaluate("!document.querySelector('.vf-portal') && !document.documentElement.dataset.vfPortal"))
        await page.go_back()
        await page.wait_for_function("document.body?.dataset.pocketView === 'open'", timeout=10000)
        check("Back returns to the open Pocket, with no transition left over", await page.evaluate(
            "!document.querySelector('.vf-portal') && !document.documentElement.dataset.vfPortal && !!document.querySelector('[data-pocket-id=\"vodafone-cash\"]')"))
        check("no page errors (same origin)", not page.errors, page.errors)
        await ctx.close()

        # ------------------------------------------------ native navigation is untouched
        ctx = await same_origin_context(browser)
        page = await new_page(ctx, f"{ORIGIN}/en/services")
        await open_album(page)
        async with ctx.expect_page() as popup:
            await page.click(CASH, modifiers=["Control"])
        tab = await popup.value
        check("Ctrl-click opens a new tab natively, no transition", not await page.evaluate("!!document.querySelector('.vf-portal')") and tab is not None)
        await tab.close()
        await page.click(CASH, button="middle")
        await page.wait_for_timeout(200)
        check("middle click is left to the browser", not await page.evaluate("!!document.querySelector('.vf-portal')"))
        await page.locator(CASH).focus()
        await page.clock.install()
        await page.clock.pause_at(await page.evaluate("Date.now()") + 1000)
        await page.keyboard.press("Enter")
        check("Enter on a focused link starts the transition", await page.evaluate("!!document.querySelector('.vf-portal')"))
        await page.click('[data-pocket-id="roaming"] .pocket-sticker__cta', force=True)
        await page.click('[data-pocket-id="mini-call"] .pocket-sticker__cta', force=True)
        check("more clicks during a transition: still one transition, to the first link", await page.evaluate(
            "document.querySelectorAll('.vf-portal').length === 1 && window.__portal.filter((d) => d.state === 'preparing').length === 1 && window.__portal[0].url.endsWith('/en/vodafone-cash')"))
        await page.clock.run_for(300)
        async with page.expect_navigation(url=f"{ORIGIN}/en/vodafone-cash", timeout=10000):
            await page.keyboard.press("Escape")
        check("Escape skips straight to the destination", True)
        await ctx.close()

        # ------------------------------------------------ a page that cannot be shown
        ctx = await same_origin_context(browser, document_status={"/en/vodafone-cash": (200, {"content-security-policy": "frame-ancestors 'none'"})})
        page = await new_page(ctx, f"{ORIGIN}/en/services")
        await open_album(page)
        await page.evaluate("document.addEventListener('click', (e) => { if (e.target.closest?.('.vf-portal__go')) e.preventDefault() }, true)")
        await page.click(CASH)
        await page.wait_for_function("document.querySelector('.vf-portal')?.dataset.destination", timeout=10000)
        check("framing refused by the page (CSP): the preview, never a broken frame", await page.evaluate(
            "document.querySelector('.vf-portal').dataset.destination === 'preview' && !document.querySelector('.vf-portal__iframe') && /Vodafone Cash/.test(document.querySelector('.vf-portal__preview-title').textContent)"))
        # Completed, or already on the destination (if it navigated before this looked, the new page's log is empty).
        await page.wait_for_function("location.pathname.endsWith('/vodafone-cash') || (window.__portal || []).some((d) => d.state === 'completed')", timeout=10000)
        # Back from the destination via the back/forward cache: the page comes back exactly as it was
        # left, mid-transition. (Headless Chromium never restores from that cache, so the browser's
        # own pageshow event is dispatched here.)
        check("Back via the back/forward cache: the transition is removed, the Pocket is as it was", await page.evaluate("""(() => {
            dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))
            return !document.querySelector('.vf-portal') && !document.documentElement.dataset.vfPortal && document.body.dataset.pocketView === 'open'
        })()"""))
        await ctx.close()

        ctx = await same_origin_context(browser)
        page = await new_page(ctx, f"{ORIGIN}/en/services")
        await open_album(page)
        await page.evaluate("document.addEventListener('click', (e) => { if (e.target.closest?.('.vf-portal__go')) e.preventDefault() }, true)")
        await page.click(CASH)
        # Completed, or already on the destination (if it navigated before this looked, the new page's log is empty).
        await page.wait_for_function("location.pathname.endsWith('/vodafone-cash') || (window.__portal || []).some((d) => d.state === 'completed')", timeout=10000)
        await page.wait_for_function("!document.querySelector('.vf-portal')", timeout=13000)
        check("if the browser stays (a 204, a cancelled unload), the page is given back", await page.evaluate(
            "!document.documentElement.dataset.vfPortal && getComputedStyle(document.documentElement).overflow !== 'hidden' && document.body.dataset.pocketView === 'open'"))
        await ctx.close()

        ctx = await same_origin_context(browser, document_status={"/en/vodafone-cash": (500, {})})
        page = await new_page(ctx, f"{ORIGIN}/en/services")
        await open_album(page)
        await page.evaluate("document.addEventListener('click', (e) => { if (e.target.closest?.('.vf-portal__go')) e.preventDefault() }, true)")
        await page.click(CASH)
        await page.wait_for_function("document.querySelector('.vf-portal')?.dataset.destination", timeout=10000)
        check("an error page is never shown in the portal", await page.evaluate("document.querySelector('.vf-portal').dataset.destination") == "preview")
        await ctx.close()

        # ------------------------------------------------ reduced motion
        ctx = await same_origin_context(browser, reduced_motion="reduce")
        page = await new_page(ctx, f"{ORIGIN}/en/services")
        await open_album(page)
        async with page.expect_navigation(url=f"{ORIGIN}/en/vodafone-cash"):
            await page.click(CASH)
        check("reduced motion: the link just navigates, no transition", "/en/vodafone-cash" in page.url)
        await ctx.close()

        # ------------------------------------------------ phone
        ctx = await same_origin_context(browser, width=390, height=844, mobile=True)
        page = await new_page(ctx, f"{ORIGIN}/en/services")
        await open_album(page)
        await page.locator(CASH).scroll_into_view_if_needed()
        async with page.expect_navigation(url=f"{ORIGIN}/en/vodafone-cash", timeout=15000):
            await page.tap(CASH)
            await page.wait_for_function("document.querySelector('.vf-portal__iframe')?.offsetWidth === 390 && document.querySelector('.vf-portal__iframe').offsetHeight === 844", timeout=3000)
            await shot(page, "phone")
        check("phone: the destination is laid out at the phone's width and the transition completes", "/en/vodafone-cash" in page.url)
        check("no page errors (phone)", not page.errors, page.errors)
        await ctx.close()

        # ------------------------------------------------ Arabic
        ctx = await same_origin_context(browser)
        page = await new_page(ctx, f"{ORIGIN}/ar/services")
        await open_album(page)
        async with page.expect_navigation(url=f"{ORIGIN}/ar/vodafone-cash", timeout=15000):
            await page.click(CASH)
        check("Arabic: the album leaves through the portal to the Arabic page", "/ar/vodafone-cash" in page.url)
        await ctx.close()

        # ------------------------------------------------ the other world: the hall of light
        ctx = await same_origin_context(browser)
        page = await new_page(ctx, f"{ORIGIN}/en/services?portal-world=hall")
        await open_album(page)
        await page.evaluate("document.addEventListener('click', (e) => { if (e.target.closest?.('.vf-portal__go')) e.preventDefault() }, true)")
        await page.click(CASH)
        check("?portal-world=hall: the gleaming hall instead of the glowing white", await page.evaluate(
            "!!document.querySelector('.vf-portal__glowmap') && document.querySelectorAll('.vf-portal__pulse').length === 5 && !document.querySelector('.vf-portal__mist, .vf-portal__light')"))
        # Completed, or already on the destination (if it navigated before this looked, the new page's log is empty).
        await page.wait_for_function("location.pathname.endsWith('/vodafone-cash') || (window.__portal || []).some((d) => d.state === 'completed')", timeout=10000)
        check("the hall still ends in the handoff", True)
        await ctx.close()

        # ------------------------------------------------ the misty void, still there on request
        ctx = await same_origin_context(browser)
        page = await new_page(ctx, f"{ORIGIN}/en/services?portal-world=mist")
        await open_album(page)
        await page.evaluate("document.addEventListener('click', (e) => { if (e.target.closest?.('.vf-portal__go')) e.preventDefault() }, true)")
        await page.click(CASH)
        check("?portal-world=mist: the misty void (two layers of mist and the light) instead of the glowing white", await page.evaluate(
            "document.querySelectorAll('.vf-portal__mist').length === 2 && !!document.querySelector('.vf-portal__light') && !document.querySelector('.vf-portal__pulse')"))
        await page.wait_for_function("location.pathname.endsWith('/vodafone-cash') || (window.__portal || []).some((d) => d.state === 'completed')", timeout=10000)
        check("the misty void still ends in the handoff", True)
        await ctx.close()

        # ------------------------------------------------ the still viewer: the destination comes to them
        ctx = await same_origin_context(browser)
        page = await new_page(ctx, f"{ORIGIN}/en/services?portal-camera=still")
        await open_album(page)
        await page.evaluate("document.addEventListener('click', (e) => { if (e.target.closest?.('.vf-portal__go') && window.__holdNavigation) e.preventDefault() }, true); window.__holdNavigation = true")
        await page.clock.install()
        await page.clock.pause_at(await page.evaluate("Date.now()") + 1000)
        await page.click(CASH)
        await page.wait_for_function("document.querySelector('.vf-portal')?.dataset.destination", timeout=10000)
        await page.clock.run_for(1200)
        fallen = await page.evaluate(face_rect)
        await page.clock.run_for(200)
        later = await page.evaluate(face_rect)
        floating = await page.evaluate("""(() => { const v = document.querySelector('.vf-portal__view').getBoundingClientRect(); const k = v.width / innerWidth
            return { bottom: v.bottom, floor: innerHeight / 2 + (innerHeight / 2) * k } })()""")
        check("?portal-camera=still: the viewer stays (the fallen page lies where it fell) and the destination floats toward them",
              abs(later["top"] - fallen["top"]) < 2 and floating["bottom"] < floating["floor"] - 4, (fallen, later, floating))
        await page.evaluate("window.__holdNavigation = false")
        await page.clock.resume()
        # Completed, or already on the destination (if it navigated before this looked, the new page's log is empty).
        await page.wait_for_function("location.pathname.endsWith('/vodafone-cash') || (window.__portal || []).some((d) => d.state === 'completed')", timeout=10000)
        check("the still viewer still ends in the handoff", True)
        await ctx.close()

        # ------------------------------------------------ cross origin: this standalone server
        ctx = await browser.new_context(viewport={"width": 1366, "height": 860})
        await ctx.add_init_script(f"if (!sessionStorage.getItem('seeded')) {{ localStorage.setItem('aixc.pocket.v1', {json.dumps(json.dumps(STICKERS))}); sessionStorage.setItem('seeded', '1') }}")
        await ctx.add_init_script(STATE_LOG)
        await ctx.route("https://web.vodafone.com.eg/**", lambda route: route.fulfill(status=200, content_type="text/html", body="<!doctype html><title>Vodafone</title><p>destination</p>"))
        page = await new_page(ctx, BASE)
        await open_album(page)
        await page.evaluate("document.addEventListener('click', (e) => { if (e.target.closest?.('.vf-portal__go')) e.preventDefault() }, true)")
        await page.click(CASH)
        await page.wait_for_function("document.querySelector('.vf-portal')?.dataset.destination", timeout=5000)
        check("another site (no framing allowed): the sticker's own preview, no iframe tried", await page.evaluate(
            "document.querySelector('.vf-portal').dataset.destination === 'preview' && !document.querySelector('.vf-portal__iframe') && document.querySelector('.vf-portal__preview-address').textContent === 'web.vodafone.com.eg/en/vodafone-cash'"))
        await page.wait_for_timeout(4200)
        await shot(page, "preview")
        check("the preview path still ends in the navigation", "handoff" in await states(page), await states(page))
        check("no page errors (cross origin)", not page.errors, page.errors)
        await ctx.close()

        ctx = await browser.new_context(viewport={"width": 1366, "height": 860})
        await ctx.add_init_script(f"if (!sessionStorage.getItem('seeded')) {{ localStorage.setItem('aixc.pocket.v1', {json.dumps(json.dumps(STICKERS))}); sessionStorage.setItem('seeded', '1') }}")
        page = await new_page(ctx, BASE.rstrip("/") + "/?portal=off")
        await open_album(page)
        check("?portal=off: sticker links open a new tab, as before", await page.evaluate(
            "[...document.querySelectorAll('.pocket-sticker__cta')].every((a) => a.target === '_blank' && /new tab/.test(a.textContent))"))
        await ctx.close()

        await browser.close()

    failed = [name for name, ok in results if not ok]
    print(f"\n{len(results) - len(failed)}/{len(results)} checks passed")
    sys.exit(1 if failed else 0)


asyncio.run(main())
