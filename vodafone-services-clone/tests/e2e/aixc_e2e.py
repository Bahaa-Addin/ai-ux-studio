"""
End-to-end checks for the AIXC prototype (optional; needs Python Playwright).

    pip install playwright && python -m playwright install chromium
    node scripts/serve.mjs --port 5200 &
    python tests/e2e/aixc_e2e.py http://127.0.0.1:5200/

Gemini is mocked at the network layer, so no API key or network access is needed.
Each check prints PASS/FAIL; the script exits non-zero if any check fails.
"""

import asyncio
import json
import sys

from playwright.async_api import async_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:5200/"
URL = BASE + ("&" if "?" in BASE else "?") + "aixc-debug"
GEMINI = "https://generativelanguage.googleapis.com/**"
results = []


def check(name, ok, detail=""):
    results.append((name, bool(ok)))
    print(f"{'PASS' if ok else 'FAIL'}  {name}{'  -- ' + str(detail) if detail and not ok else ''}")


def gemini_reply(obj):
    text = obj if isinstance(obj, str) else json.dumps(obj)
    return json.dumps({"candidates": [{"content": {"parts": [{"text": text}]}, "finishReason": "STOP"}]})


class Mock:
    """Programmable Gemini endpoint."""

    def __init__(self):
        self.queue = []
        self.requests = []

    def push(self, status=200, body=None, delay=0):
        self.queue.append((status, body, delay))

    async def handle(self, route):
        req = route.request
        self.requests.append({"url": req.url, "headers": req.headers, "body": req.post_data})
        status, body, delay = self.queue.pop(0) if self.queue else (500, json.dumps({"error": {"message": "no mock"}}), 0)
        if delay:
            await asyncio.sleep(delay)
        try:
            await route.fulfill(status=status, body=body, headers={"content-type": "application/json", "access-control-allow-origin": "*"})
        except Exception:
            pass  # request was aborted by the page


async def new_page(browser, width=1366, height=900, key=False, mock=None, reduced_motion="no-preference"):
    ctx = await browser.new_context(viewport={"width": width, "height": height}, reduced_motion=reduced_motion)
    page = await ctx.new_page()
    page.errors = []
    page.on("pageerror", lambda e: page.errors.append(str(e)))
    if mock:
        await ctx.route(GEMINI, mock.handle)
    await page.goto(URL, wait_until="networkidle")
    if key:
        await set_key(page)
    return page


async def set_key(page, key="test-key-123"):
    if await page.is_visible(".aixc-launcher"):
        await page.click(".aixc-launcher")
    await page.click(".aixc-settings summary")
    await page.fill("#aixc-key", key)
    await page.click("text=Save settings")


async def submit(page, prompt):
    if not await page.is_visible("#aixc-prompt"):
        if await page.is_visible(".aixc-launcher"):
            await page.click(".aixc-launcher")
        else:
            await page.click(".aixc-viewbar__actions button >> nth=0")
    await page.fill("#aixc-prompt", prompt)
    await page.press("#aixc-prompt", "Enter")


async def placed_ids(page):
    return await page.eval_on_selector_all("#experience-output [data-aixc-item]", "els => els.map(e => e.dataset.aixcItem)")


async def all_ids(page):
    return await page.evaluate("window.__aixc.index.order")


async def shell_snapshot(page):
    return await page.evaluate(
        """() => {
          const pick = (sel) => { const el = document.querySelector(sel); const cs = getComputedStyle(el);
            return { html: el.outerHTML.length, font: cs.fontFamily, bg: cs.backgroundColor, color: cs.color, h: Math.round(el.getBoundingClientRect().height) } }
          const nav = getComputedStyle(document.querySelector('.header-main__nav a'))
          return { header: pick('#site-header'), footer: pick('#site-footer'), navFont: nav.fontFamily, navSize: nav.fontSize,
                   headerHtml: document.querySelector('#site-header').outerHTML, footerHtml: document.querySelector('#site-footer').outerHTML }
        }"""
    )


def good_schema(ids, density="balanced", title=None):
    services = [i for i in ids if i != "ana-vodafone-app"]
    return {
        "version": 1, "experience": "magazine", "theme": "vodafone-editorial", "density": density, "scope": "all",
        "sections": [
            {"id": "cover", "type": "hero", "itemIds": services[:1]},
            {"id": "lead", "type": "feature", "title": title or "Call & Connect abroad", "itemIds": services[5:8]},
            {"id": "control", "type": "split-spread", "itemIds": services[1:5]},
            {"id": "fun", "type": "editorial-grid", "itemIds": services[8:15]},
            {"id": "shokran", "type": "shelf", "itemIds": services[15:21]},
            {"id": "more", "type": "service-list", "itemIds": services[21:]},
            {"id": "close", "type": "closing-promotion", "itemIds": ["ana-vodafone-app"]},
        ],
    }


TEMPLATE_IDS = ["streaming", "split", "fan", "ring", "tunnel", "canvas", "coverflow", "spotlight", "journey", "gallery", "flipbook", "cube", "magazine"]


async def open_template(page, template_id):
    if await page.is_visible(".aixc-launcher"):
        await page.click(".aixc-launcher")
    elif not await page.is_visible("#aixc-composer"):
        await page.click(".aixc-viewbar__actions button >> nth=0")
    await page.click(f".aixc-template[data-template={template_id}]")
    await page.wait_for_selector(f"#experience-output [data-experience={template_id}], #experience-output .aixc-magazine")
    await page.wait_for_timeout(500)


async def template_checks(browser):
    # All templates with a Gemini key configured: none of them may call Gemini.
    mock = Mock()
    page = await new_page(browser, key=True, mock=mock)
    ids = await all_ids(page)
    before = await shell_snapshot(page)
    for template_id in TEMPLATE_IDS:
        await open_template(page, template_id)
        placed = await placed_ids(page)
        check(f"{template_id}: every item exactly once", sorted(placed) == sorted(ids) and len(placed) == len(set(placed)), (len(placed), len(set(placed))))
        meta = await page.text_content(".aixc-viewbar__meta")
        check(f"{template_id}: labelled as a ready-made template", "Ready-made template, no AI call" in meta, meta)
        check(f"{template_id}: focus moves to the page heading", await page.evaluate("document.activeElement?.id === 'aixc-cover-title'"))
        check(f"{template_id}: exactly one h1 in the output", await page.evaluate("document.querySelectorAll('#experience-output h1').length") == 1)
        pressed = await page.eval_on_selector_all(".aixc-template[aria-pressed=true]", "els => els.map(e => e.dataset.template)")
        check(f"{template_id}: template shown as selected", pressed == [template_id], pressed)
        sw = await page.evaluate("document.documentElement.scrollWidth")
        check(f"{template_id}: no horizontal overflow at 1366px", sw <= 1366, sw)
        links_ok = await page.evaluate("[...document.querySelectorAll('#experience-output a[target=_blank]')].every(a => a.rel === 'noopener noreferrer' && a.href.startsWith('https://'))")
        check(f"{template_id}: external links are https with noopener", links_ok)
        check(f"{template_id}: no placeholder copy", await page.evaluate("!/lorem|ipsum|arcade|gallerie|walking the cow/i.test(document.querySelector('#experience-output').textContent)"))
    check("templates never call Gemini (key configured)", len(mock.requests) == 0, len(mock.requests))
    check("templates leave header/footer untouched", await shell_snapshot(page) == before)
    check("no page errors across all templates", page.errors == [], page.errors)
    await page.context.close()

    await streaming_checks(browser)
    await pen_template_checks(browser)

    # Spotlight: controls, autoplay, pause, unmount while hidden.
    page = await new_page(browser)
    await open_template(page, "spotlight")
    await page.mouse.move(5, 5)
    active = lambda: page.evaluate("[...document.querySelectorAll('.sp-slide')].findIndex(s => !s.hidden)")
    await page.click(".sp-controls [aria-label='Next service']")
    await page.mouse.move(5, 5)
    check("spotlight: next shows the second service", await active() == 1)
    await page.keyboard.press("ArrowRight")
    check("spotlight: arrow key advances", await active() == 2)
    await page.click(".sp-jump[data-group=shokran-services]")
    await page.mouse.move(5, 5)
    first_shokran = await page.evaluate("[...document.querySelectorAll('.sp-slide')].findIndex(s => s.dataset.aixcItem === 'sallefny-shokran')")
    check("spotlight: category jump lands on its first service", await active() == first_shokran)
    await page.evaluate("document.activeElement.blur()")
    start = await active()
    await page.wait_for_timeout(7200)
    check("spotlight: auto-advances after the dwell time", await active() == start + 1, (start, await active()))
    await page.click(".sp-play")
    await page.mouse.move(5, 5)
    await page.evaluate("document.activeElement.blur()")
    paused_at = await active()
    await page.wait_for_timeout(7200)
    check("spotlight: pause stops rotation", await active() == paused_at)
    check("spotlight: pause button reports state", await page.get_attribute(".sp-play", "aria-label") == "Start automatic rotation")
    await page.click(".sp-play")
    await page.click(".aixc-seg >> text=Original")
    hidden_at = await active()
    await page.wait_for_timeout(7200)
    await page.click(".aixc-seg >> text=Reimagined")
    check("spotlight: does not rotate while hidden", await active() == hidden_at)
    queued_focusable = await page.evaluate("[...document.querySelectorAll('.sp-card')].filter(c => !c.inert).length")
    check("spotlight: only queued cards are focusable", queued_focusable == 4, queued_focusable)
    await page.click("text=Reset")
    check("no page errors (spotlight)", page.errors == [], page.errors)
    await page.context.close()

    page = await new_page(browser, reduced_motion="reduce")
    await open_template(page, "spotlight")
    await page.mouse.move(5, 5)
    await page.evaluate("document.activeElement.blur()")
    await page.wait_for_timeout(7200)
    check("spotlight: no autoplay under reduced motion", await page.evaluate("[...document.querySelectorAll('.sp-slide')].findIndex(s => !s.hidden)") == 0)
    await page.context.close()

    # Journey: scroll drives the scene.
    page = await new_page(browser)
    await open_template(page, "journey")
    night0 = float(await page.evaluate("getComputedStyle(document.querySelector('.aixc-vx--journey')).getPropertyValue('--night') || 0"))
    await page.evaluate("window.scrollTo(0, document.documentElement.scrollHeight * 0.7)")
    await page.wait_for_timeout(500)
    night1 = float(await page.evaluate("getComputedStyle(document.querySelector('.aixc-vx--journey')).getPropertyValue('--night') || 0"))
    check("journey: scrolling turns day to night", night0 < 0.05 and night1 > 0.6, (night0, night1))
    chapters = await page.evaluate("document.querySelectorAll('.jr-chapter').length")
    check("journey: one chapter per category", chapters == 6, chapters)
    await page.context.close()
    page = await new_page(browser, reduced_motion="reduce")
    await open_template(page, "journey")
    await page.evaluate("window.scrollTo(0, 1500)")
    await page.wait_for_timeout(400)
    check("journey: no parallax motion under reduced motion", await page.evaluate("getComputedStyle(document.querySelector('.jr-range')).transform") == "none")
    await page.context.close()

    # Gallery: prev/next move along the wall and update the caption.
    page = await new_page(browser)
    await open_template(page, "gallery")
    await page.click(".gl-controls [aria-label='Next piece']")
    await page.wait_for_timeout(1400)
    counter = await page.text_content(".gl-counter")
    title = await page.text_content(".gl-caption__title")
    check("gallery: next walks to the second piece", counter.startswith("02") and title == "Balance transfer", (counter, title))
    await page.evaluate("window.scrollBy(0, 240 * 5)")
    await page.wait_for_timeout(1400)
    check("gallery: scrolling walks the wall", (await page.text_content(".gl-counter")).startswith("07"), await page.text_content(".gl-counter"))
    camera = await page.evaluate("getComputedStyle(document.querySelector('.gl-wall')).getPropertyValue('--camera')")
    check("gallery: camera moved along the wall", camera.strip() not in ("", "0px"), camera)
    check("no page errors (gallery)", page.errors == [], page.errors)
    await page.context.close()

    # Flipbook: turning, inert pages, contents jump, single-page mode.
    page = await new_page(browser)
    await open_template(page, "flipbook")
    check("flipbook: opens on the cover", (await page.text_content(".fb-status")) == "Page 1 of 18", await page.text_content(".fb-status"))
    await page.click(".fb-controls [aria-label='Next page']")
    await page.wait_for_timeout(1300)
    check("flipbook: next opens the first spread", (await page.text_content(".fb-status")) == "Pages 2–3 of 18", await page.text_content(".fb-status"))
    open_pages = await page.evaluate("[...document.querySelectorAll('.fb-page')].filter(p => !p.inert).length")
    check("flipbook: only the open spread is reachable", open_pages == 2, open_pages)
    await page.click(".fb-contents__link[data-go='group:great-entertainment']")
    await page.wait_for_timeout(1300)
    open_keys = await page.eval_on_selector_all(".fb-page.is-open", "els => els.map(e => e.dataset.key)")
    check("flipbook: contents jumps to a category", "group:great-entertainment" in open_keys, open_keys)
    await page.keyboard.press("ArrowLeft")
    await page.wait_for_timeout(1300)
    check("flipbook: arrow keys turn pages", "group:great-entertainment" not in await page.eval_on_selector_all(".fb-page.is-open", "els => els.map(e => e.dataset.key)"))
    check("no page errors (flipbook)", page.errors == [], page.errors)
    await page.context.close()
    page = await new_page(browser, width=390, height=800)
    await open_template(page, "flipbook")
    status = await page.text_content(".fb-status")
    check("flipbook: single-page mode on phones", status.startswith("Page 1 of"), status)
    await page.click(".fb-controls [aria-label='Next page']")
    await page.wait_for_timeout(1300)
    check("flipbook: phone turns one page at a time", (await page.text_content(".fb-status")).startswith("Page 2 of"))
    await page.context.close()

    # Cube: scroll turns faces; dots navigate.
    page = await new_page(browser)
    await open_template(page, "cube")
    await page.click(".cb-dot[aria-label='Go to Call & Connect abroad']")
    await page.wait_for_timeout(1600)
    name = await page.text_content(".cb-caption__name")
    check("cube: scene dot jumps to its category", name == "Call & Connect abroad", name)
    transform = await page.evaluate("document.querySelector('.cb-cube').style.transform")
    check("cube: turned to the matching face", "rotateY(-90" in transform or "rotateY(-89" in transform, transform)
    pct = await page.text_content(".cb-hud__pct")
    check("cube: HUD shows progress", pct.endswith("%") and pct != "000%", pct)
    active_dots = await page.eval_on_selector_all(".cb-dot[aria-current=true]", "els => els.length")
    check("cube: one current dot", active_dots == 1)
    check("no page errors (cube)", page.errors == [], page.errors)
    await page.context.close()

    # Phones: every template fits the viewport width.
    for width in (320, 390):
        page = await new_page(browser, width=width, height=760)
        for template_id in TEMPLATE_IDS:
            await open_template(page, template_id)
            await page.wait_for_timeout(300)
            sw = await page.evaluate("document.documentElement.scrollWidth")
            check(f"{width}px {template_id}: no horizontal overflow", sw <= width, sw)
        check(f"{width}px: no page errors across templates", page.errors == [], page.errors)
        await page.context.close()

    # No key: a typed prompt naming an experience uses the matching template.
    page = await new_page(browser)
    await submit(page, "Turn it into a flip book")
    await page.wait_for_selector("[data-experience=flipbook]")
    note = await page.text_content(".aixc-viewnote")
    check("no key: typed prompt matched to a template", "matched to the ready-made flipbook" in (note or ""), note)
    await page.context.close()

    # With a key: Gemini can choose a template experience.
    mock = Mock()
    page = await new_page(browser, key=True, mock=mock)
    ids = await all_ids(page)
    services = [i for i in ids if i != "ana-vodafone-app"]
    mock.push(body=gemini_reply({"version": 1, "experience": "cube", "density": "balanced", "scope": "all", "sections": [
        {"id": "a", "type": "group", "title": "Everyday essentials", "itemIds": services[:10]},
        {"id": "b", "type": "group", "itemIds": services[10:]},
        {"id": "c", "type": "closing-promotion", "itemIds": ["ana-vodafone-app"]},
    ]}))
    await submit(page, "Put the services on a 3D cube, essentials first")
    await page.wait_for_selector("[data-experience=cube]")
    meta = await page.text_content(".aixc-viewbar__meta")
    check("Gemini can pick a template experience", "Service cube" in meta and "Composed by Gemini" in meta, meta)
    authored = await page.eval_on_selector("[data-aixc-authored]", "e => e.textContent")
    check("Gemini group label marked as authored", authored == "Everyday essentials", authored)
    body = json.loads(mock.requests[0]["body"])
    check("request lists all experiences", "<experiences>" in body["contents"][0]["parts"][0]["text"] and len(body["generationConfig"]["responseSchema"]["properties"]["experience"]["enum"]) == 13)
    await page.context.close()


async def pen_template_checks(browser):
    """The six templates adapted from the second set of reference pens."""

    # Split slideshow: halves move in opposite directions, one live slide, rail jumps.
    page = await new_page(browser)
    await open_template(page, "split")
    live = lambda: page.evaluate("[...document.querySelectorAll('.ss-text')].find(t => t.dataset.pos === '0')?.dataset.aixcItem")
    check("split: opens on the first service", await live() == "vodafone-cash", await live())
    await page.click(".ss-controls [aria-label='Next service']")
    await page.wait_for_timeout(1500)
    check("split: next shows the second service", await live() == "balance-transfer", await live())
    halves = await page.evaluate("""() => ['left', 'right'].map(side => [...document.querySelectorAll(`.ss-half--${side} .ss-pane`)].slice(0, 3).map(p => p.dataset.pos))""")
    check("split: both halves show the same service and the old one leaves", halves == [["-1", "0", "1"], ["-1", "0", "1"]], halves)
    moves = await page.evaluate("""() => { const l = getComputedStyle(document.querySelector('.ss-half--left .ss-pane')).transform, r = getComputedStyle(document.querySelector('.ss-half--right .ss-pane')).transform; return [l, r] }""")
    check("split: the halves leave in opposite directions", moves[0] != moves[1] and "matrix" in moves[0], moves)
    await page.keyboard.press("ArrowDown")
    await page.wait_for_timeout(1500)
    check("split: arrow key advances", await live() == "end-of-call-notifications", await live())
    await page.click(".ss-rail__group[data-group=shokran-services]")
    await page.wait_for_timeout(2200)
    check("split: rail jumps to a category's first service", await live() == "sallefny-shokran", await live())
    reachable = await page.evaluate("[...document.querySelectorAll('.ss-text')].filter(t => !t.inert).length")
    check("split: only the shown service is reachable", reachable == 1, reachable)
    check("no page errors (split)", page.errors == [], page.errors)
    await page.context.close()

    # Card fan: click, drag, keys; cards far from the current one are hidden.
    page = await new_page(browser)
    await open_template(page, "fan")
    counter = lambda: page.text_content(".fn-counter__now")
    await page.click(".fn-card[data-aixc-item=end-of-call-notifications]", force=True)
    await page.wait_for_timeout(1400)
    check("fan: clicking a card brings it to the front", await counter() == "03" and await page.text_content(".fn-detail__title") == "End of Call notifications", await counter())
    box = await page.evaluate("(() => { const r = document.querySelector('.fn-stage').getBoundingClientRect(); return [r.left + r.width * 0.6, r.top + r.height * 0.3] })()")
    await page.mouse.move(box[0], box[1])
    await page.mouse.down()
    for i in range(1, 11):
        await page.mouse.move(box[0] - 23 * i, box[1])
        await page.wait_for_timeout(16)
    await page.mouse.up()
    await page.wait_for_timeout(1400)
    check("fan: dragging left moves through the cards", await counter() == "05", await counter())
    await page.focus(".fn-controls [aria-label='Next card']")
    await page.keyboard.press("ArrowRight")
    await page.wait_for_timeout(1300)
    check("fan: arrow key advances", await counter() == "06", await counter())
    away = await page.evaluate("document.querySelectorAll('.fn-card.is-away').length")
    check("fan: only nearby cards are drawn", 0 < away < 29, away)
    check("no page errors (fan)", page.errors == [], page.errors)
    await page.context.close()

    # Service ring: closes on itself, turns with prev/next, fast scrolling stretches it.
    page = await new_page(browser)
    await open_template(page, "ring")
    await page.wait_for_timeout(300)
    wrap = await page.evaluate("!document.querySelector('.rg-item[data-aixc-item=join-without-changing-number]').classList.contains('is-off')")
    check("ring: the last service waits beside the first", wrap)
    await page.click(".rg-nav [aria-label='Next service']")
    await page.wait_for_timeout(1500)
    front = await page.evaluate("document.querySelector('.rg-item.is-front')?.dataset.aixcItem")
    check("ring: next turns the ring to the second service", front == "balance-transfer", front)
    await page.keyboard.press("ArrowRight")
    await page.wait_for_timeout(1500)
    check("ring: arrow key turns the ring", await page.text_content(".rg-counter__now") == "03")
    check("ring: the category heading follows", await page.text_content(".rg-head__group") == "Stay In Control")
    await page.evaluate("window.scrollBy(0, 1800)")
    stretched = False
    for _ in range(12):
        await page.wait_for_timeout(30)
        if "scaleX" in (await page.evaluate("document.querySelector('.rg-ring').style.transform")):
            stretched = True
            break
    check("ring: fast scrolling stretches the ring", stretched)
    check("no page errors (ring)", page.errors == [], page.errors)
    await page.context.close()

    # Hyper tunnel: opens on a chapter word, steps card to card, Tab flies to a card.
    page = await new_page(browser)
    await open_template(page, "tunnel")
    check("tunnel: opens on the first category word", (await page.text_content(".tn-hud__place")).strip() == "Vodafone Cash")
    await page.click(".tn-hud__nav [aria-label='Next service']")
    await page.wait_for_timeout(1800)
    current = await page.evaluate("document.querySelector('.tn-item.is-current .tn-card')?.dataset.aixcItem")
    check("tunnel: next flies to the first service card", current == "vodafone-cash", current)
    await page.focus(".tn-card[data-aixc-item=roaming] a")
    await page.wait_for_timeout(2200)
    current = await page.evaluate("document.querySelector('.tn-item.is-current .tn-card')?.dataset.aixcItem")
    check("tunnel: tabbing to a card's link flies to it", current == "roaming", current)
    visible = await page.evaluate("(() => { const r = document.querySelector('.tn-card[data-aixc-item=roaming]').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.width > 150 })()")
    check("tunnel: the focused card is fully in view", visible)
    check("no page errors (tunnel)", page.errors == [], page.errors)
    await page.context.close()
    page = await new_page(browser, reduced_motion="reduce")
    await open_template(page, "tunnel")
    flat = await page.evaluate("document.querySelector('.aixc-vx--tunnel').classList.contains('is-static') && getComputedStyle(document.querySelector('.tn-stage')).position === 'relative'")
    check("tunnel: laid flat under reduced motion", flat)
    await page.context.close()

    # Infinite canvas: drag pans, wraps without gaps, Tab glides, Enter opens, Escape closes.
    page = await new_page(browser)
    await open_template(page, "canvas")
    coords0 = await page.text_content(".cv-coords")
    box = await page.evaluate("(() => { const r = document.querySelector('.cv-surface').getBoundingClientRect(); return [r.left, r.top, r.width, r.height] })()")
    cx, cy = box[0] + box[2] / 2, box[1] + box[3] / 2
    await page.mouse.move(cx, cy)
    await page.mouse.down()
    for i in range(1, 16):
        await page.mouse.move(cx - 60 * i, cy - 30 * i)
        await page.wait_for_timeout(16)
    await page.mouse.up()
    await page.wait_for_timeout(1800)
    check("canvas: dragging pans the canvas", await page.text_content(".cv-coords") != coords0)
    covered = await page.evaluate("""(() => { const r = document.querySelector('.cv-surface').getBoundingClientRect(); const tiles = [...document.querySelectorAll('.cv-tile')].map(t => t.getBoundingClientRect());
      // The widest strip of the view that no tile touches, across and down: only the 48px gutters may be empty.
      const widestHole = (from, to, spans) => { let reach = from, hole = 0; spans.filter(([a, b]) => b > from && a < to).sort((p, q) => p[0] - q[0]).forEach(([a, b]) => { hole = Math.max(hole, a - reach); reach = Math.max(reach, b) }); return Math.max(hole, to - reach) };
      return [widestHole(r.left, r.right, tiles.map(t => [t.left, t.right])), widestHole(r.top, r.bottom, tiles.map(t => [t.top, t.bottom]))] })()""")
    check("canvas: the grid wraps with no empty bands", max(covered) <= 50, covered)
    await page.focus(".cv-card[data-aixc-item=roaming]")
    await page.wait_for_timeout(1800)
    centred = await page.evaluate("(() => { const s = document.querySelector('.cv-surface').getBoundingClientRect(), c = document.querySelector('.cv-card[data-aixc-item=roaming]').getBoundingClientRect(); return Math.abs((c.left + c.width / 2) - (s.left + s.width / 2)) < 30 && Math.abs((c.top + c.height / 2) - (s.top + s.height / 2)) < 30 })()")
    check("canvas: focusing a card glides it to the centre", centred)
    check("canvas: focus never scrolls the stage", await page.evaluate("document.querySelector('.cv-stage').scrollLeft === 0 && document.querySelector('.cv-stage').scrollTop === 0"))
    await page.keyboard.press("Enter")
    await page.wait_for_timeout(1700)
    opened = await page.evaluate("document.querySelector('.cv-dialog').open && document.querySelector('.cv-dialog__title').textContent.replace(/\\s+/g, ' ').trim()")
    check("canvas: Enter opens the card", opened == "Roaming Services", opened)
    check("canvas: the open card has its link", await page.evaluate("!!document.querySelector('.cv-dialog__actions a[href^=\"https://\"]')"))
    await page.keyboard.press("Escape")
    await page.wait_for_timeout(1200)
    check("canvas: Escape closes and returns focus to the card", not await page.evaluate("document.querySelector('.cv-dialog').open") and await page.evaluate("document.activeElement.dataset.aixcItem") == "roaming")
    await page.click(".cv-link[data-group=shokran-services]")
    await page.wait_for_timeout(1800)
    centred = await page.evaluate("(() => { const s = document.querySelector('.cv-surface').getBoundingClientRect(), c = document.querySelector('.cv-card[data-aixc-item=sallefny-shokran]').getBoundingClientRect(); return Math.abs((c.left + c.width / 2) - (s.left + s.width / 2)) < 30 })()")
    check("canvas: a category link brings its first service to the centre", centred)
    check("no page errors (canvas)", page.errors == [], page.errors)
    await page.context.close()

    # Cover flow: loops round, drags, clicks; reflections on.
    page = await new_page(browser)
    await open_template(page, "coverflow")
    counter = lambda: page.text_content(".cf-counter__now")
    await page.click(".cf-controls [aria-label='Previous service']")
    await page.wait_for_timeout(1400)
    check("coverflow: previous from the first loops to the last", await counter() == "29" and await page.text_content(".cf-detail__title") == "Join us without changing your number", await counter())
    await page.click(".cf-controls [aria-label='Next service']")
    await page.wait_for_timeout(1400)
    check("coverflow: next from the last loops to the first", await counter() == "01", await counter())
    box = await page.evaluate("(() => { const r = document.querySelector('.cf-stage').getBoundingClientRect(); return [r.left + r.width * 0.7, r.top + r.height * 0.3] })()")
    await page.mouse.move(box[0], box[1])
    await page.mouse.down()
    for i in range(1, 11):
        await page.mouse.move(box[0] - 20 * i, box[1])
        await page.wait_for_timeout(16)
    await page.mouse.up()
    await page.wait_for_timeout(1400)
    check("coverflow: dragging left flips forward", await counter() == "03", await counter())
    await page.click(".cf-cover[data-aixc-item=calls-services]", force=True)
    await page.wait_for_timeout(1400)
    check("coverflow: clicking a cover brings it to the front", await counter() == "04", await counter())
    reflect = await page.evaluate("getComputedStyle(document.querySelector('.cf-cover')).webkitBoxReflect || ''")
    check("coverflow: covers are reflected on the floor", reflect not in ("", "none"), reflect)
    check("no page errors (coverflow)", page.errors == [], page.errors)
    await page.context.close()


async def streaming_checks(browser):
    ready = "document.querySelector('.aixc-vx--streaming')?.classList.contains('is-ready')"
    page = await new_page(browser)
    await open_template(page, "streaming")
    check("streaming: intro overlay plays", await page.is_visible(".st-intro") and await page.is_visible(".st-skip"))
    check("streaming: header logo waits for the intro", await page.evaluate("getComputedStyle(document.querySelector('.st-brand')).opacity") == "0")
    await page.wait_for_function("document.getAnimations().some(a => a.effect && a.effect.getTiming().duration === 3200)")
    await page.evaluate("document.getAnimations().forEach(a => { if (a.effect.getTiming().duration === 3200) { a.pause(); a.currentTime = 3199.5 } })")
    land = await page.evaluate("""() => { const a = document.querySelector('.st-intro__red').getBoundingClientRect(), b = document.querySelector('.st-brand .st-word').getBoundingClientRect(); return Math.max(Math.abs(a.left - b.left), Math.abs(a.top - b.top), Math.abs(a.width - b.width)) }""")
    check("streaming: logo lands exactly in its header slot", land < 1, land)
    lockup = await page.evaluate("""() => {
      const parts = (root) => { const m = root.querySelector('.st-mark').getBoundingClientRect(), l = root.querySelector('.st-word__letters').getBoundingClientRect(); return { m, l } }
      const fly = parts(document.querySelector('.st-intro__red')), slot = parts(document.querySelector('.st-brand .st-word'))
      const beside = ({ m, l }) => m.right <= l.left + 0.5 && Math.abs((m.top + m.bottom) / 2 - (l.top + l.bottom) / 2) < l.height * 0.15
      const markLand = Math.max(Math.abs(fly.m.left - slot.m.left), Math.abs(fly.m.top - slot.m.top), Math.abs(fly.m.width - slot.m.width))
      return { ok: beside(fly) && beside(slot) && markLand < 1, markLand }
    }""")
    check("streaming: Vodafone mark sits left of the word and flies with it as one lockup", lockup["ok"], lockup)
    await page.evaluate("document.getAnimations().forEach(a => a.finish())")
    await page.wait_for_function(ready, timeout=5000)
    check("streaming: intro clears and the logo shows", await page.is_hidden(".st-intro") and await page.is_hidden(".st-skip") and await page.evaluate("getComputedStyle(document.querySelector('.st-brand')).opacity") == "1")
    check("streaming: wordmark reads VODAFONE in Roboto", await page.evaluate("document.querySelector('.st-brand .st-word').textContent === 'VODAFONE' && getComputedStyle(document.querySelector('.st-brand .st-word')).fontFamily.startsWith('Roboto')"))
    rows = await page.eval_on_selector_all(".st-row", "els => els.map(e => e.dataset.group)")
    check("streaming: billboard leads, one row per remaining category", rows == ["stay-in-control", "call-and-connect-abroad", "great-entertainment", "shokran-services", "other-services"] and await page.evaluate("document.querySelector('.st-billboard').dataset.aixcItem") == "vodafone-cash", rows)

    # Paging arrows.
    row = "#st-row-great-entertainment"
    shift0 = await page.evaluate(f"document.querySelector('{row} .st-row__track').style.getPropertyValue('--shift')")
    await page.click(f"{row} .st-row__arrow--next", force=True)
    shift1 = await page.evaluate(f"document.querySelector('{row} .st-row__track').style.getPropertyValue('--shift')")
    check("streaming: next arrow pages the row", shift0 == "0" and shift1 not in ("", "0"), (shift0, shift1))
    check("streaming: previous arrow appears after paging", await page.is_enabled(f"{row} .st-row__arrow--prev"))
    await page.click(f"{row} .st-row__arrow--prev", force=True)

    # Keyboard: tabbing onto an off-page card pages the row along.
    await page.focus(f"{row} .st-card:last-child .st-card__open")
    shift2 = await page.evaluate(f"document.querySelector('{row} .st-row__track').style.getPropertyValue('--shift')")
    check("streaming: focusing an off-page card pages to it", shift2 not in ("", "0"), shift2)

    # Preview modal.
    await page.mouse.move(5, 5)
    await page.click("#st-row-shokran-services .st-card__open >> nth=0")
    check("streaming: card opens the preview modal", await page.evaluate("document.querySelector('.st-modal').open"))
    title = await page.text_content(".st-modal__title")
    check("streaming: modal shows the service", title == "Sallefny Shokran", title)
    more = await page.eval_on_selector_all(".st-more__card", "els => els.length")
    check("streaming: modal lists the rest of the category", more == 5, more)
    await page.keyboard.press("Escape")
    check("streaming: Escape closes the modal and restores focus", not await page.evaluate("document.querySelector('.st-modal').open") and await page.evaluate("document.activeElement.classList.contains('st-card__open')"))
    await page.click("#st-row-other-services .st-row__explore", force=True)
    all_cards = await page.eval_on_selector_all(".st-more__card", "els => els.length")
    check("streaming: Explore all lists every service in the category", all_cards == 8, all_cards)
    await page.keyboard.press("Escape")
    check("no page errors (streaming)", page.errors == [], page.errors)
    await page.context.close()

    # Skip intro.
    page = await new_page(browser)
    await open_template(page, "streaming")
    await page.click(".st-skip")
    await page.wait_for_function(ready, timeout=2000)
    check("streaming: Skip intro ends the opening at once", await page.is_hidden(".st-intro") and await page.evaluate("document.activeElement.classList.contains('st-brand')"))
    await page.context.close()

    # Reduced motion: no intro at all.
    page = await new_page(browser, reduced_motion="reduce")
    await open_template(page, "streaming")
    check("streaming: no intro under reduced motion", await page.evaluate(ready) and await page.is_hidden(".st-intro"))
    await page.context.close()


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()

        # ---------------------------------------------------------- original view
        page = await new_page(browser)
        ids = await all_ids(page)
        orig = await page.eval_on_selector_all("#source-content [data-aixc-item]", "els => els.map(e => e.dataset.aixcItem)")
        check("original view renders every model item", sorted(orig) == sorted(ids), set(ids) ^ set(orig))
        check("content model has 29 services + 1 promotion", len(ids) == 30, len(ids))
        launcher = await page.evaluate("(() => { const b = document.querySelector('.aixc-launcher'); const r = b.getBoundingClientRect(); return { name: b.textContent.trim(), inView: r.bottom <= innerHeight && r.top >= 0 } })()")
        check("launcher is labelled and visible in the first viewport", launcher["name"] == "Reimagine this page" and launcher["inView"], launcher)
        check("launcher is outside the extraction root", await page.evaluate("!document.querySelector('#source-content').contains(document.querySelector('.aixc-launcher'))"))
        bad_links = await page.evaluate("[...document.querySelectorAll('#source-content a[target=_blank]')].filter(a => a.rel !== 'noopener noreferrer').length")
        check("original external links use rel=noopener noreferrer", bad_links == 0, bad_links)
        # carousel reaches the last card
        prev_disabled = await page.is_disabled("[data-aixc-section=shokran-services] [data-carousel-prev]")
        check("original carousel starts with Previous disabled", prev_disabled)
        for _ in range(6):
            if await page.is_disabled("[data-aixc-section=shokran-services] [data-carousel-next]"):
                break
            await page.click("[data-aixc-section=shokran-services] [data-carousel-next]")
            await page.wait_for_timeout(700)
        last_visible = await page.evaluate("(() => { const t = document.querySelector('[data-aixc-section=shokran-services] [data-carousel-track]'); const c = t.querySelector('[data-aixc-item=wasalny-shokran]').getBoundingClientRect(); const r = t.getBoundingClientRect(); return c.left >= r.left - 2 && c.right <= r.right + 2 })()")
        check("original carousel arrows reach every Shokran card", last_visible)

        # ------------------------------------------------- keyboard + composer UX
        await page.keyboard.press("Tab")
        for _ in range(40):
            if await page.evaluate("document.activeElement.classList.contains('aixc-launcher')"):
                break
            await page.keyboard.press("Tab")
        check("launcher reachable by keyboard", await page.evaluate("document.activeElement.classList.contains('aixc-launcher')"))
        await page.keyboard.press("Enter")
        check("Enter opens composer and focuses the first template", await page.evaluate("document.activeElement === document.querySelector('.aixc-template')"))
        check("composer has no chat transcript elements", await page.evaluate("!document.querySelector('.aixc-composer [class*=chat], .aixc-composer [class*=bubble], .aixc-composer [class*=transcript]')"))
        await page.keyboard.press("Escape")
        check("Escape closes composer and returns focus to launcher", await page.evaluate("document.querySelector('#aixc-composer').hidden && document.activeElement.classList.contains('aixc-launcher')"))
        await page.click(".aixc-launcher")
        await page.focus("#aixc-prompt")
        await page.press("#aixc-prompt", "Enter")
        msg = await page.text_content(".aixc-message")
        check("empty prompt shows guidance, no transform", "Describe the presentation" in (msg or "") and await page.is_hidden("#experience-output"), msg)
        await page.keyboard.press("Escape")

        # ------------------------------------------------- built-in (no key) path
        before = await shell_snapshot(page)
        # A prompt that names no ready-made experience falls back to the built-in magazine.
        await submit(page, "Make it feel premium and calm.")
        await page.wait_for_selector(".aixc-magazine")
        placed = await placed_ids(page)
        check("built-in layout places every item exactly once", sorted(placed) == sorted(ids) and len(placed) == len(set(placed)), len(placed))
        meta = await page.text_content(".aixc-viewbar__meta")
        check("built-in layout is labelled as not AI-generated", "Built-in layout" in meta and "Gemini" not in meta, meta)
        check("source content hidden, output shown", await page.is_hidden("#source-content") and await page.is_visible("#experience-output"))
        after = await shell_snapshot(page)
        check("header/footer markup and styles unchanged after transform", before == after)
        check("focus moves to the magazine cover title", await page.evaluate("document.activeElement.id === 'aixc-cover-title'"))
        types = await page.eval_on_selector_all("#experience-output [data-section-type]", "els => els.map(e => e.dataset.sectionType)")
        check("magazine uses varied primitives", len(set(types)) >= 6, types)
        dup_ids = await page.evaluate("(() => { const ids = [...document.querySelectorAll('[id]')].map(e => e.id); return ids.filter((x, i) => ids.indexOf(x) !== i) })()")
        check("no duplicate DOM ids", dup_ids == [], dup_ids)
        hidden_focusable = await page.evaluate("[...document.querySelectorAll('#source-content a, #source-content button, #source-content [tabindex]')].filter(e => e.offsetParent !== null).length")
        check("hidden original content is not keyboard reachable", hidden_focusable == 0, hidden_focusable)
        ext = await page.evaluate("[...document.querySelectorAll('#experience-output a[target=_blank]')].every(a => a.rel === 'noopener noreferrer' && a.href.startsWith('https://'))")
        check("magazine links are https with noopener", ext)
        no_lorem = await page.evaluate("!/lorem|ipsum|arcade/i.test(document.querySelector('#experience-output').textContent)")
        check("no placeholder/arcade copy", no_lorem)

        # Original / Reimagined / Reset make no network calls (none possible without a key, checked again below with a key)
        await page.click(".aixc-seg >> text=Original")
        check("Original restores source view", await page.is_visible("#source-content") and await page.is_hidden("#experience-output"))
        await page.click(".aixc-seg >> text=Reimagined")
        check("Reimagined returns to the saved layout", await page.is_visible(".aixc-magazine"))
        await page.click("text=Reset")
        check("Reset clears transformation and restores launcher", await page.is_visible("#source-content") and await page.is_hidden("#aixc-viewbar") and await page.is_visible(".aixc-launcher") and (await page.inner_html("#experience-output")) == "")
        check("no page errors (built-in path)", page.errors == [], page.errors)
        await page.context.close()

        # --------------------------------------------------------- Gemini paths
        mock = Mock()
        page = await new_page(browser, key=True, mock=mock)
        ids = await all_ids(page)
        mock.push(body=gemini_reply(good_schema(ids)))
        await submit(page, "Create a dramatic cover and a varied editorial layout")
        await page.wait_for_selector(".aixc-magazine")
        req = mock.requests[0]
        check("Gemini called with key in header, not URL", req["headers"].get("x-goog-api-key") == "test-key-123" and "key=" not in req["url"], req["url"])
        check("Gemini endpoint uses generateContent and default model", ":generateContent" in req["url"] and "gemini-3.8-flash" in req["url"], req["url"])
        body = json.loads(req["body"])
        payload_text = body["contents"][0]["parts"][0]["text"]
        check("request asks for JSON with a response schema", body["generationConfig"]["responseMimeType"] == "application/json" and "responseSchema" in body["generationConfig"])
        check("request payload contains no URLs or shell content", "https://" not in payload_text and "Careers" not in payload_text and "Store Locator" not in payload_text)
        meta = await page.text_content(".aixc-viewbar__meta")
        check("Gemini result labelled as composed by Gemini", "Composed by Gemini" in meta, meta)
        order = await page.eval_on_selector_all("#experience-output [data-section-type]", "els => els.map(e => e.dataset.sectionType)")
        check("rendered order follows the schema", order == ["hero", "feature", "split-spread", "editorial-grid", "shelf", "service-list", "closing-promotion"], order)
        placed = await placed_ids(page)
        check("Gemini layout places every item exactly once", sorted(placed) == sorted(ids))

        # cache + view switching make no extra calls
        n = len(mock.requests)
        await page.click(".aixc-seg >> text=Original")
        await page.click(".aixc-seg >> text=Reimagined")
        await submit(page, "Create a dramatic cover and a varied editorial layout")
        await page.wait_for_timeout(400)
        check("repeat prompt served from cache; view switches make no calls", len(mock.requests) == n, len(mock.requests) - n)

        # invalid JSON with a previous valid layout -> unchanged + message
        html_before = await page.inner_html("#experience-output")
        mock.push(body=gemini_reply("{this is not json"))
        await submit(page, "Make it more compact but keep all service details.")
        await page.wait_for_selector(".aixc-message:not([hidden])")
        msg = await page.text_content(".aixc-message")
        check("invalid JSON keeps the current view and says so", (await page.inner_html("#experience-output")) == html_before and "unchanged" in msg, msg)
        check("retry is possible after failure", await page.is_enabled(".aixc-composer button[type=submit]"))

        # schema with omissions, duplicates, unknown ids and an injected title
        partial = {
            "version": 1, "experience": "magazine", "density": "compact", "scope": "all",
            "sections": [
                {"id": "c", "type": "hero", "itemIds": ["vodafone-cash", "made-up-id"]},
                {"id": "x", "type": "editorial-grid", "title": '<img src=x onerror="window.__pwned=1">', "itemIds": ["mo-salah-world", "mo-salah-world", "vf-play"]},
                {"id": "y", "type": "blink-tag", "itemIds": ["roaming"]},
            ],
        }
        mock.push(body=gemini_reply(partial))
        await submit(page, "Use a premium editorial look")
        await page.wait_for_function("document.querySelector('.aixc-magazine').dataset.density === 'compact'")
        placed = await placed_ids(page)
        check("omitted/duplicate/unknown ids corrected: every item exactly once", sorted(placed) == sorted(ids) and len(placed) == len(set(placed)), len(placed))
        note = await page.text_content(".aixc-viewnote")
        check("restored items are disclosed to the user", "added back" in (note or ""), note)
        check("markup in model text is rendered inert", await page.evaluate("!window.__pwned && !document.querySelector('#experience-output img[src=x]')"))
        authored = await page.eval_on_selector("[data-aixc-authored]", "e => e.textContent")
        check("model-authored title is marked and shown as text", authored.startswith("<img"), authored)
        kicker = await page.evaluate("document.querySelector('[data-aixc-authored]').closest('header').querySelector('.mag-kicker')?.textContent")
        check("authored title shows the real source section", (kicker or "").startswith("From Great Entertainment"), kicker)
        check("compact density applied", await page.evaluate("document.querySelector('.aixc-magazine').dataset.density") == "compact")

        # unsupported request flag
        flagged = good_schema(ids)
        flagged["unsupportedRequest"] = True
        mock.push(body=gemini_reply(flagged))
        await submit(page, "Make it look like Netflix")
        await page.wait_for_timeout(500)
        note = await page.text_content(".aixc-viewnote")
        check("unsupported experience request disclosed", "isn't available yet" in (note or ""), note)

        # stale response: user switches to Original while generating
        mock.push(body=gemini_reply(good_schema(ids, density="spacious")), delay=1.2)
        await submit(page, "Use more whitespace and bigger headlines but keep the same content.")
        await page.wait_for_selector(".aixc-progress:not([hidden])")
        check("progress indicator shown while generating", await page.is_visible(".aixc-progress"))
        check("submit disabled while generating", await page.is_disabled(".aixc-composer button[type=submit]"))
        await page.click(".aixc-seg >> text=Original")
        await page.wait_for_timeout(1700)
        check("result arriving after choosing Original does not switch view", await page.is_visible("#source-content") and await page.is_hidden("#experience-output"))
        check("...but the new layout is ready under Reimagined", await page.evaluate("document.querySelector('.aixc-magazine').dataset.density") == "spacious")

        # cancel then new prompt: the cancelled response never lands
        mock.push(body=gemini_reply(good_schema(ids, density="compact", title="Stale layout")), delay=1.5)
        mock.push(body=gemini_reply(good_schema(ids, density="balanced", title="Fresh layout")))
        await submit(page, "Give each category a different editorial section")
        await page.wait_for_selector(".aixc-composer button:has-text('Cancel'):visible")
        await page.click(".aixc-composer button:has-text('Cancel')")
        await submit(page, "Turn this into a magazine, fresh")
        await page.wait_for_timeout(2200)
        titles = await page.eval_on_selector_all("[data-aixc-authored]", "els => els.map(e => e.textContent)")
        check("cancelled/stale response never overwrites the newer one", "Fresh layout" in titles and "Stale layout" not in titles, titles)
        check("no page errors (Gemini path)", page.errors == [], page.errors)
        await page.context.close()

        # failures with no previous layout -> built-in fallback
        for status, err, expect in [
            (429, "Resource exhausted", "quota"),
            (400, "API key not valid. Please pass a valid API key.", "API key"),
            (404, "models/x is not found", "not available"),
            (503, "overloaded", "unavailable"),
        ]:
            mock = Mock()
            page = await new_page(browser, key=True, mock=mock)
            mock.push(status=status, body=json.dumps({"error": {"message": err}}))
            await submit(page, "Turn this into a magazine.")
            await page.wait_for_selector(".aixc-magazine")
            meta = await page.text_content(".aixc-viewbar__meta")
            note = await page.text_content(".aixc-viewnote")
            check(f"HTTP {status} with no prior layout falls back to built-in", "Built-in layout" in meta and expect in note, note)
            await page.context.close()

        mock = Mock()
        page = await new_page(browser, key=True, mock=mock)
        await page.context.unroute(GEMINI)
        await page.context.route(GEMINI, lambda route: route.abort("internetdisconnected"))
        await submit(page, "Turn this into a magazine.")
        await page.wait_for_selector(".aixc-magazine")
        note = await page.text_content(".aixc-viewnote")
        check("network failure falls back to built-in", "Could not reach Gemini" in note, note)
        await page.context.close()

        mock = Mock()
        page = await new_page(browser, key=True, mock=mock)
        mock.push(body=gemini_reply({"version": 1, "experience": "dashboard", "sections": [{"type": "hero", "itemIds": []}]}))
        await submit(page, "Make this an executive dashboard")
        await page.wait_for_selector(".aixc-magazine")
        note = await page.text_content(".aixc-viewnote")
        check("unknown experience type rejected; built-in shown", "not available yet" in note, note)
        await page.context.close()

        # filtering only when asked
        mock = Mock()
        page = await new_page(browser, key=True, mock=mock)
        mock.push(body=gemini_reply({"version": 1, "experience": "magazine", "density": "balanced", "scope": "filtered",
                                      "sections": [{"id": "c", "type": "hero", "itemIds": []},
                                                   {"id": "s", "type": "shelf", "itemIds": ["sallefny-shokran", "kallemny-shokran", "3alnota-shokran", "edfa3ly-shokran", "rennely-shokran", "wasalny-shokran"]}]}))
        await submit(page, "Only show the Shokran services")
        await page.wait_for_selector(".aixc-magazine")
        placed = await placed_ids(page)
        note = await page.text_content(".aixc-viewnote")
        check("explicit filtering request honoured and disclosed", len(placed) == 7 and "Filtered view" in note, (len(placed), note))
        await page.context.close()

        # image failure fallback
        ctx = await browser.new_context(viewport={"width": 1366, "height": 900})
        await ctx.route("**/assets/images/roaming.png", lambda route: route.fulfill(status=404, body="missing"))
        page = await ctx.new_page()
        await page.goto(URL, wait_until="networkidle")
        await submit(page, "magazine")
        await page.wait_for_selector(".aixc-magazine")
        await page.wait_for_timeout(600)
        fallback = await page.evaluate("!!document.querySelector('[data-aixc-item=roaming] .mag-frame.is-fallback')")
        check("broken image is replaced by the designed fallback", fallback)
        await ctx.close()

        # mobile: no overflow, composer leaves header visible
        for width in (320, 390):
            page = await new_page(browser, width=width, height=760)
            await page.click(".aixc-launcher")
            box = await page.evaluate("(() => { const c = document.querySelector('#aixc-composer').getBoundingClientRect(); const h = document.querySelector('#site-header').getBoundingClientRect(); return { composerTop: c.top, headerBottom: h.bottom } })()")
            check(f"{width}px: composer sheet leaves header visible", box["composerTop"] >= box["headerBottom"], box)
            await page.fill("#aixc-prompt", "magazine")
            await page.press("#aixc-prompt", "Enter")
            await page.wait_for_selector(".aixc-magazine")
            await page.wait_for_timeout(600)
            sw = await page.evaluate("document.documentElement.scrollWidth")
            check(f"{width}px: no horizontal overflow in magazine", sw <= width, sw)
            # Stretched story links cover their whole card via ::after, so measure the card.
            small = await page.evaluate("[...document.querySelectorAll('#experience-output a, #experience-output button')].filter(e => e.offsetParent).map(e => [e, e.classList.contains('mag-story-link') ? e.closest('.has-story-link') : e]).filter(([e, target]) => target.getBoundingClientRect().height < 24).map(([e]) => e.textContent.trim().slice(0,30))")
            check(f"{width}px: interactive targets at least 24px tall", small == [], small)
            await page.context.close()

        # reduced motion
        page = await new_page(browser, reduced_motion="reduce")
        await submit(page, "magazine")
        await page.wait_for_selector(".aixc-magazine")
        anim = await page.evaluate("getComputedStyle(document.querySelector('.mag-cover__title')).animationName")
        check("reduced motion disables the cover animation", anim == "none", anim)
        await page.context.close()

        # ------------------------------------------------------ ready-made templates
        await template_checks(browser)

        await browser.close()

    failed = [name for name, ok in results if not ok]
    print(f"\n{len(results) - len(failed)}/{len(results)} checks passed")
    sys.exit(1 if failed else 0)


asyncio.run(main())
