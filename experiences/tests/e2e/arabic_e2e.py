"""
Browser checks for the Arabic Services page (ar/index.html, captured from /ar/services on 2026-11-05).

    node scripts/serve.mjs --port 5200 &
    python tests/e2e/arabic_e2e.py http://127.0.0.1:5200/

Right to left, Vodafone's Arabic faces, the Arabic shell, carousels, the Pocket and every
ready-made experience in Arabic, at desktop and phone sizes. No network, no Gemini key.
Each check prints PASS/FAIL; the script exits non-zero if any check fails.
"""

import asyncio
import sys

from playwright.async_api import async_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:5200/"
URL = BASE + "ar/"
TEMPLATE_IDS = ["streaming", "split", "fan", "ring", "tunnel", "canvas", "coverflow", "spotlight", "journey", "gallery", "flipbook", "cube", "magazine"]
ARABIC = r"/[؀-ۿ]/"
results = []


def check(name, ok, detail=""):
    results.append((name, bool(ok)))
    print(f"{'PASS' if ok else 'FAIL'}  {name}{'  -- ' + str(detail) if detail and not ok else ''}")


async def new_page(browser, width=1366, height=900):
    page = await (await browser.new_context(viewport={"width": width, "height": height})).new_page()
    page.errors = []
    page.on("pageerror", lambda e: page.errors.append(str(e)))
    await page.goto(URL, wait_until="networkidle")
    return page


async def open_template(page, template_id):
    if await page.is_visible(".aixc-launcher"):
        await page.click(".aixc-launcher")
    elif not await page.is_visible("#aixc-composer"):
        await page.click(".aixc-viewbar__actions button >> nth=0")
    await page.click(f".aixc-template[data-template={template_id}]")
    await page.wait_for_selector(f"#experience-output [data-experience={template_id}], #experience-output .aixc-magazine")
    await page.wait_for_timeout(500)


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()

        # ---------------------------------------------------------------- the page
        page = await new_page(browser)
        info = await page.evaluate("""() => ({
          lang: document.documentElement.lang, dir: document.documentElement.dir, title: document.title,
          sections: [...document.querySelectorAll('#source-content [data-aixc-section]')].map(s => s.dataset.aixcSection),
          items: document.querySelectorAll('#source-content [data-aixc-item]').length,
          headings: [...document.querySelectorAll('#source-content h2')].map(h => h.textContent.trim()),
          destinations: document.querySelectorAll('#source-content [data-vg-destination]').length,
          lang_link: (() => { const a = document.querySelector('.switcher-bar__lang'); return [a.textContent.trim(), a.href] })(),
          footer: document.querySelector('.site-footer__copyright').textContent.trim(),
          arabic_fonts: [...document.fonts].filter(f => f.status === 'loaded' && f.unicodeRange.includes('U+600')).map(f => f.family),
          host: document.querySelector('meta[name=vg-trail-host]')?.content,
        })""")
        check("lang=ar, dir=rtl", info["lang"] == "ar" and info["dir"] == "rtl", info)
        check("Arabic title", info["title"] == "خدمات | ڤودافون مصر", info["title"])
        check("six sections in the English order", info["sections"] == ["cash", "stay-in-control", "call-and-connect-abroad", "great-entertainment", "shokran-services", "other-services"], info["sections"])
        check("every item rendered (29 + the app band)", info["items"] == 30, info["items"])
        check("section headings are the live Arabic ones", "اتحكم في حسابك" in info["headings"] and "خدمات تهمك" in info["headings"], info["headings"])
        check("sections carry their knowledge-base destinations", info["destinations"] == 6, info["destinations"])
        check("language link goes to the English page", info["lang_link"][0] == "English" and info["lang_link"][1].endswith("/en/services"), info["lang_link"])
        check("Arabic copyright", "ڤودافون مصر" in info["footer"], info["footer"])
        check("Vodafone Arabic faces loaded (split by unicode-range)", {"vodafone-regular-en", "vodafone-bold-en"} <= set(info["arabic_fonts"]), info["arabic_fonts"])
        check("the page hosts the journey", info["host"] == "pocket")
        shokran = await page.eval_on_selector_all('[data-aixc-section="shokran-services"] [data-aixc-item]', "els => els.map(e => e.dataset.aixcItem)")
        check("Shokran in the live Arabic order", shokran[:3] == ["sallefny-shokran", "3alnota-shokran", "kallemny-shokran"], shokran)

        # carousel, right to left
        await page.evaluate("document.querySelectorAll('[data-carousel]')[0].scrollIntoView()")
        c = "(() => { const f = document.querySelectorAll('[data-carousel]')[0]; const t = f.querySelector('[data-carousel-track]'); const p = f.querySelector('[data-carousel-prev]'), n = f.querySelector('[data-carousel-next]'); return { left: t.scrollLeft, prevX: p.getBoundingClientRect().x, nextX: n.getBoundingClientRect().x, prevDisabled: p.disabled, label: p.getAttribute('aria-label') } })()"
        before = await page.evaluate(c)
        check("carousel: previous on the right, next on the left", before["prevX"] > before["nextX"], before)
        check("carousel: Arabic labels", before["label"].startswith("السابق"), before["label"])
        await page.click('[data-carousel] [data-carousel-next] >> nth=0')
        await page.wait_for_timeout(900)
        after = await page.evaluate(c)
        check("carousel: next scrolls towards the left", after["left"] < -100 and not after["prevDisabled"], after)

        # ------------------------------------------------------------- the Pocket
        await page.wait_for_selector(".pocket-cta")
        label = await page.get_attribute('[data-aixc-item="roaming"] .pocket-cta', "aria-label")
        check("Pocket: Arabic button label", label == "في الجيب: خدمات التجوال", label)
        await page.click('[data-aixc-item="calls-services"] .pocket-cta')
        await page.wait_for_function("document.querySelector('.pocket-peek__count').textContent === '1'", timeout=8000)
        await page.wait_for_timeout(600)
        await page.click(".pocket-peek")
        await page.wait_for_function("document.body.dataset.pocketView === 'open'", timeout=8000)
        texts = await page.evaluate("({ title: document.querySelector('.pocket-view__title').textContent, back: document.querySelector('.pocket-back').textContent.trim(), sticker: document.querySelector('.pocket-sticker h3, .pocket-sticker [id^=pocket-sticker-]')?.textContent })")
        check("Pocket: Arabic title, back button and sticker", texts["title"] == "جيبك" and "ارجع للخدمات" in texts["back"] and texts["sticker"] == "خدمات المكالمات", texts)
        check("no page errors on the page and the Pocket", page.errors == [], page.errors)
        await page.context.close()

        # ------------------------------------------------- Reimagine, every template
        page = await new_page(browser)
        launcher = (await page.text_content(".aixc-launcher")).strip()
        check("Reimagine launcher in Arabic", launcher == "غيّر شكل الصفحة", launcher)
        await page.click(".aixc-launcher")
        names = await page.eval_on_selector_all(".aixc-template__name", "els => els.map(e => e.textContent)")
        check("13 ready-made experiences, named in Arabic", len(names) == 13 and all(any("؀" <= ch <= "ۿ" for ch in n) for n in names), names)
        for template_id in TEMPLATE_IDS:
            await open_template(page, template_id)
            meta = await page.text_content(".aixc-viewbar__meta")
            check(f"{template_id}: labelled in Arabic", "شكل جاهز" in meta, meta)
            has_ar = await page.evaluate(f"{ARABIC}.test(document.querySelector('#experience-output').textContent)")
            check(f"{template_id}: shows the Arabic content", has_ar)
            sw = await page.evaluate("document.documentElement.scrollWidth")
            check(f"{template_id}: no horizontal overflow at 1366px", sw <= 1366, sw)
        check("no page errors across all templates", page.errors == [], page.errors)
        await page.context.close()

        # ------------------------------------------------------------ phone sizes
        for width in (390, 320):
            page = await new_page(browser, width=width, height=800)
            sw = await page.evaluate("document.documentElement.scrollWidth")
            check(f"{width}px: no horizontal overflow on the page", sw <= width, sw)
            for template_id in ("magazine", "tunnel", "spotlight", "flipbook"):
                await open_template(page, template_id)
                sw = await page.evaluate("document.documentElement.scrollWidth")
                check(f"{width}px {template_id}: no horizontal overflow", sw <= width, sw)
            check(f"{width}px: no page errors", page.errors == [], page.errors)
            await page.context.close()

        await browser.close()

    failed = [name for name, ok in results if not ok]
    print(f"\n{len(results) - len(failed)}/{len(results)} checks passed")
    sys.exit(1 if failed else 0)


asyncio.run(main())
