"""
End-to-end checks for Pocket (sticker peel, peeking corner, page turn). Optional; needs
Python Playwright, like aixc_e2e.py.

    node scripts/serve.mjs --port 5200 &
    python tests/e2e/pocket_e2e.py http://127.0.0.1:5200/

Each check prints PASS/FAIL; the script exits non-zero if any check fails.
"""

import asyncio
import sys

from playwright.async_api import async_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:5200/"
results = []


def check(name, ok, detail=""):
    results.append((name, bool(ok)))
    print(f"{'PASS' if ok else 'FAIL'}  {name}{'  -- ' + str(detail) if detail and not ok else ''}")


async def new_page(browser, width=1366, height=860, reduced_motion="no-preference"):
    ctx = await browser.new_context(viewport={"width": width, "height": height}, reduced_motion=reduced_motion)
    page = await ctx.new_page()
    page.errors = []
    page.on("pageerror", lambda e: page.errors.append(str(e)))
    page.on("console", lambda m: page.errors.append(m.text) if m.type == "error" else None)
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
        check("sticker keeps the real title, copy and link", await page.evaluate(
            "(() => { const s = document.querySelector('[data-pocket-id=\"roaming\"]'); return /Roaming Services/.test(s.textContent) && /best rates/.test(s.textContent) && s.querySelector('a').href === 'https://web.vodafone.com.eg/spa/roaming' && s.querySelector('a').target === '_blank' })()"))
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

        # ------------------------------------------------------ persistence
        ctx, page = await new_page(browser)
        await page.evaluate("localStorage.setItem('aixc.pocket.v1', JSON.stringify(['vf-play', 'not-a-real-id']))")
        await page.reload()
        await page.wait_for_selector(".pocket-peek[data-state='shown']", timeout=4000)
        check("a returning visitor's pocket is restored (unknown ids ignored)", await count_badge(page) == "1" and await page.evaluate(
            "document.querySelector('[data-aixc-item=\"vf-play\"]').classList.contains('is-pocketed')"))
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
        await page.click(".pocket-peek")
        check("reduced motion: the pocket opens without a turn", await page.evaluate(
            "!document.querySelector('#pocket-output').hidden && document.querySelector('.pocket-layer--plane').childElementCount === 0"))
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
