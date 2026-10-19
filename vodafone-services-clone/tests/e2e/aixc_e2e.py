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
            await page.click("text=Edit prompt")
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
        check("Enter opens composer and focuses the prompt", await page.evaluate("document.activeElement.id === 'aixc-prompt'"))
        check("composer has no chat transcript elements", await page.evaluate("!document.querySelector('.aixc-composer [class*=chat], .aixc-composer [class*=bubble], .aixc-composer [class*=transcript]')"))
        await page.keyboard.press("Escape")
        check("Escape closes composer and returns focus to launcher", await page.evaluate("document.querySelector('#aixc-composer').hidden && document.activeElement.classList.contains('aixc-launcher')"))
        await page.click(".aixc-launcher")
        await page.press("#aixc-prompt", "Enter")
        msg = await page.text_content(".aixc-message")
        check("empty prompt shows guidance, no transform", "Describe the presentation" in (msg or "") and await page.is_hidden("#experience-output"), msg)
        await page.keyboard.press("Escape")

        # ------------------------------------------------- built-in (no key) path
        before = await shell_snapshot(page)
        await submit(page, "Turn this into a magazine.")
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
        check("unsupported experience request disclosed", "Only the magazine experience is available" in (note or ""), note)

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

        await browser.close()

    failed = [name for name, ok in results if not ok]
    print(f"\n{len(results) - len(failed)}/{len(results)} checks passed")
    sys.exit(1 if failed else 0)


asyncio.run(main())
