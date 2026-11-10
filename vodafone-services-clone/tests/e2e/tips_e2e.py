"""
Browser checks for Tips, the Apple Tips-style walkthrough of the four demos (src/tips,
voice-guide ADR-0045).

    node scripts/serve.mjs --port 5200 &
    python tests/e2e/tips_e2e.py http://127.0.0.1:5200/

The button and the first-visit invitation; the collection (paging, keys, focus, scenes drawn from
the page's own content, reduced motion, phones, Arabic); "Try it" for the Pocket and Reimagine on
the real controls, and for the voice guide and the journey on a stand-in of the guide's microphone
and pill (the real guide is checked by voice-guide's walkthrough tool); the floating controls never
overlap. No network, no Gemini key. Each check prints PASS/FAIL; exits non-zero if any fails.
"""

import asyncio
import sys

from playwright.async_api import async_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:5200/"
ARABIC = r"/[؀-ۿ]/"
results = []

# Stand-ins, placed as the real ones are (voice-guide launcher.ts, trail/view.ts, tools/demo-browser.ts).
A11Y_STAND_IN = """() => {
  if (document.getElementById('vodafone-aw-icon')) return
  const b = document.createElement('button')
  b.id = 'vodafone-aw-icon'
  b.type = 'button'
  b.setAttribute('aria-label', 'Accessibility (stand-in)')
  b.style.cssText = 'position:fixed;right:20px;bottom:20px;width:55px;height:55px;border-radius:50%;border:5px solid #fff;background:#e60000;z-index:1;padding:0'
  b.addEventListener('click', () => { window.__a11yPressed = (window.__a11yPressed || 0) + 1 })
  document.body.appendChild(b)
}"""
GUIDE_STAND_IN = """() => {
  if (document.querySelector('vg-guide')) return
  const host = document.createElement('vg-guide')
  const root = host.attachShadow({ mode: 'open' })
  root.innerHTML = `<style>
    .vg-mic { position: fixed; z-index: 2147483000; right: 15.5px; bottom: calc(91px + var(--vg-lift, 0px)); width: 64px; height: 64px; border-radius: 50%; border: 5px solid #fff; background: #e60000; padding: 0 }
    .tr-pill { position: fixed; z-index: 2147483400; top: 112px; inset-inline-end: 16px; min-height: 44px; width: 236px; border-radius: 999px; background: #fff; border: 1px solid #ddd }
    @media (max-width: 767px) { .tr-pill { top: 92px; width: 62px } }
  </style><button class="vg-mic" type="button" aria-label="Talk"></button><button class="tr-pill" type="button">Your journey</button><section class="tr-card" hidden></section>`
  root.querySelector('.vg-mic').addEventListener('click', () => { window.__micPressed = (window.__micPressed || 0) + 1 })
  root.querySelector('.tr-pill').addEventListener('click', () => { window.__pillPressed = (window.__pillPressed || 0) + 1 })
  document.body.appendChild(host)
  // As the real trail does: the page moves "Reimagine this page" under the pill (main.js).
  dispatchEvent(new CustomEvent('vg:trail-ready', { detail: {} }))
}"""

BOXES = """() => {
  const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width && r.height && s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.05 ? { x: r.left, y: r.top, w: r.width, h: r.height } : null }
  const g = document.querySelector('vg-guide')?.shadowRoot
  return {
    tips: box(document.querySelector('.tips-entry')),
    mic: box(g?.querySelector('.vg-mic')),
    accessibility: box(document.getElementById('vodafone-aw-icon')),
    pocket: box(document.querySelector('.pocket-peek[data-state="shown"]')),
    reimagine: box(document.querySelector('.aixc-launcher')),
    journey: box(g?.querySelector('.tr-pill')),
    voicetut: box(document.querySelector('.voicetut-demo')),
  }
}"""


def check(name, ok, detail=""):
    results.append((name, bool(ok)))
    print(f"{'PASS' if ok else 'FAIL'}  {name}{'  -- ' + str(detail) if detail and not ok else ''}")


def overlaps(a, b, pad=0):
    return bool(a and b) and a["x"] < b["x"] + b["w"] + pad and b["x"] < a["x"] + a["w"] + pad and a["y"] < b["y"] + b["h"] + pad and b["y"] < a["y"] + a["h"] + pad


def overlap_pairs(boxes):
    names = [k for k, v in boxes.items() if v]
    return [(a, b) for i, a in enumerate(names) for b in names[i + 1 :] if overlaps(boxes[a], boxes[b])]


async def new_page(browser, path="", query="", width=1366, height=900, reduced=False, guide=False, a11y=True):
    context = await browser.new_context(viewport={"width": width, "height": height}, reduced_motion="reduce" if reduced else "no-preference", has_touch=width < 768)
    page = await context.new_page()
    page.errors = []
    page.on("pageerror", lambda e: page.errors.append(str(e)))
    page.on("console", lambda m: page.errors.append(m.text) if m.type in ("error", "warning") and "[tips]" in m.text else None)
    page.requests = []
    page.on("request", lambda r: page.requests.append(r.url))
    await page.goto(BASE + path + ("?" + query if query else ""), wait_until="networkidle")
    if a11y:
        await page.evaluate(A11Y_STAND_IN)
    if guide:
        await page.evaluate(GUIDE_STAND_IN)
    return page


async def open_tips(page):
    await page.click(".tips-entry")
    await page.wait_for_selector(".tips.is-open .tips-sheet")
    await page.wait_for_timeout(700)


async def active_index(page):
    return await page.evaluate("() => Number(document.querySelector('.tips-card.is-active')?.dataset.index ?? -1)")


async def go_to_card(page, card_id):
    index = await page.evaluate(f"() => Number(document.querySelector('.tips-card[data-card=\"{card_id}\"]').dataset.index)")
    while await active_index(page) < index:
        await page.click(".tips-next")
        await page.wait_for_timeout(650)
    return index


async def coach_state(page):
    return await page.evaluate("""() => {
      const layer = document.querySelector('.tips-coach')
      const pop = layer?.querySelector('.tips-pop')
      const ring = layer?.querySelector('.tips-coach__ring')
      const r = (el) => { if (!el || el.hidden) return null; const b = el.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height } }
      return { shown: Boolean(layer && !layer.hidden), title: pop?.querySelector('.tips-pop__title')?.textContent, success: pop?.classList.contains('is-success'), pop: r(pop), ring: r(ring), side: pop?.dataset.side }
    }""")


async def wait_coach_title(page, text, timeout=8000):
    for _ in range(timeout // 100):
        state = await coach_state(page)
        if state["shown"] and state["title"] and text in state["title"]:
            return state
        await page.wait_for_timeout(100)
    return await coach_state(page)


def contains(outer, inner, pad=0):
    return bool(outer and inner) and outer["x"] - pad <= inner["x"] and outer["y"] - pad <= inner["y"] and outer["x"] + outer["w"] + pad >= inner["x"] + inner["w"] and outer["y"] + outer["h"] + pad >= inner["y"] + inner["h"]


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()

        # ---------------------------------------------------------------- the button, lazily
        page = await new_page(browser)
        await page.wait_for_timeout(2200)
        info = await page.evaluate("""() => ({
          button: !!document.querySelector('.tips-entry'),
          isNew: document.querySelector('.tips-entry')?.classList.contains('is-new'),
          invite: !!document.querySelector('.tips-invite'),
          css: !!document.querySelector('link[data-tips]'),
          label: document.querySelector('.tips-entry')?.getAttribute('aria-label'),
        })""")
        check("tips: the button is on the page, marked new", info["button"] and info["isNew"], info)
        check("tips: a browser driven by automation gets no invitation", not info["invite"], info)
        check("tips: the collection and its styles are not loaded before it opens", not info["css"] and not any("/src/tips/tips.js" in u for u in page.requests), [u for u in page.requests if "tips" in u])
        boxes = await page.evaluate(BOXES)
        check("tips: the button sits bottom-left, clear of every floating control (1366)", boxes["tips"] and boxes["tips"]["x"] < 40 and boxes["tips"]["y"] > 800 and not overlap_pairs(boxes), boxes)

        # ---------------------------------------------------------------- the collection
        await open_tips(page)
        sheet = await page.evaluate("""() => {
          const s = document.querySelector('.tips-sheet')
          return {
            role: s.getAttribute('role'), modal: s.getAttribute('aria-modal'),
            cards: document.querySelectorAll('.tips-card').length,
            focus: document.activeElement?.classList.contains('tips-title'),
            eyebrow: document.querySelector('.tips-eyebrow').textContent,
            css: !!document.querySelector('link[data-tips]'),
            next: document.querySelector('.tips-next').textContent.trim(),
          }
        }""")
        check("sheet: a modal dialog with the cover and 9 more cards", sheet["role"] == "dialog" and sheet["modal"] == "true" and sheet["cards"] == 10, sheet)
        check("sheet: focus on the cover's title; Get started", sheet["focus"] and sheet["next"] == "Get started" and sheet["eyebrow"] == "Tips", sheet)
        check("sheet: styles loaded on demand", sheet["css"] and any("/src/tips/tips.js" in u for u in page.requests))

        scene = await page.evaluate("""() => {
          const imgs = [...document.querySelectorAll('.tips-card[data-index="0"] .ts-stage img')]
          return { imgs: imgs.map(i => i.getAttribute('src')), loaded: imgs.every(i => i.complete && i.naturalWidth > 0),
                   playing: document.getAnimations().filter(a => a.effect?.target?.closest?.('.tips-card[data-index="0"]') && a.playState === 'running').length }
        }""")
        check("cover: drawn from the page's own pictures, all loaded", scene["imgs"] and all(s.startswith("/assets/images/") for s in scene["imgs"]) and scene["loaded"], scene)
        check("cover: its scene is playing", scene["playing"] > 5, scene)

        await page.click(".tips-next")
        await page.wait_for_timeout(900)
        state = await page.evaluate("""() => ({
          index: Number(document.querySelector('.tips-card.is-active').dataset.index),
          eyebrow: document.querySelector('.tips-eyebrow').textContent,
          words: [...document.querySelectorAll('.tips-card[data-index="1"] .ts-word')].map(w => w.textContent).join(' '),
          runningHere: document.getAnimations().filter(a => a.effect?.target?.closest?.('.tips-card[data-index="1"]') && a.playState === 'running').length,
          runningCover: document.getAnimations().filter(a => a.effect?.target?.closest?.('.tips-card[data-index="0"]') && a.playState === 'running').length,
          note: document.querySelector('.tips-card[data-index="1"] .tips-note')?.textContent || '',
          tryButton: !!document.querySelector('.tips-card[data-index="1"] .tips-try'),
        })""")
        check("paging: Next goes to the voice guide's first tip", state["index"] == 1 and state["eyebrow"] == "Voice guide · 1 of 2", state)
        check("scenes: only the card on screen plays", state["runningHere"] > 5 and state["runningCover"] == 0, state)
        check("voice scene: the spoken example is the router's tuning phrase", state["words"] == "What’s the cheapest internet bundle?", state["words"])
        check("voice tip: without the guide on the page it says so, no Try it", "isn’t running" in state["note"] and not state["tryButton"], state)

        await page.keyboard.press("ArrowRight")
        await page.wait_for_timeout(800)
        check("keys: ArrowRight pages forward", await active_index(page) == 2)
        await page.keyboard.press("End")
        await page.wait_for_timeout(900)
        finale = await page.evaluate("""() => ({
          index: Number(document.querySelector('.tips-card.is-active').dataset.index),
          next: document.querySelector('.tips-next').textContent.trim(),
          tiles: [...document.querySelectorAll('.tips-tile')].map(t => [t.querySelector('.tips-tile__name').textContent, !!t.querySelector('.tips-tile__try')]),
        })""")
        check("keys: End goes to the closing card, Done", finale["index"] == 9 and finale["next"] == "Done", finale)
        check("closing card: Try it for the demos on this page only", finale["tiles"] == [["Voice guide", False], ["Pocket", True], ["Reimagine this page", True], ["Your journey", False]], finale["tiles"])
        await page.keyboard.press("Home")
        await page.wait_for_timeout(900)
        check("keys: Home goes back to the cover", await active_index(page) == 0)

        questions = await page.evaluate("() => [...document.querySelectorAll('.tips-card[data-card=\"journey-ask\"] .ts-question span')].map(s => s.textContent)")
        built = await page.evaluate("() => document.querySelectorAll('.tips-card[data-card=\"journey-ask\"] .ts-stage').length")
        if not built:
            await page.evaluate("() => window.__aixcTips?.tips")
        # The journey scene is built when its neighbour is shown; page to it to read its questions.
        await go_to_card(page, "journey-ask")
        questions = await page.evaluate("() => [...document.querySelectorAll('.tips-card[data-card=\"journey-ask\"] .ts-question span')].map(s => s.textContent)")
        check("journey scene: the guide's verified questions", questions == ["Tell me about Vodafone Cash", "Tell me about the Call & Connect abroad", "Open the Shokran services page"], questions)
        all_images = await page.evaluate("() => [...document.querySelectorAll('.tips .ts-stage img')].every(i => i.complete && i.naturalWidth > 0 && i.getAttribute('src').startsWith('/assets/images/'))")
        check("scenes: every picture is one of the page's own, loaded", all_images)

        # Focus stays in the sheet; the page behind does not scroll; Vodafone's accessibility button is never covered.
        await page.keyboard.press("Home")
        await page.wait_for_timeout(700)
        for _ in range(12):
            await page.keyboard.press("Tab")
        inside = await page.evaluate("() => document.querySelector('.tips-sheet').contains(document.activeElement)")
        check("focus: Tab stays inside the sheet", inside)
        before = await page.evaluate("() => scrollY")
        await page.mouse.move(683, 840)
        await page.mouse.wheel(0, 600)
        await page.wait_for_timeout(300)
        check("scroll: the page behind does not move while the tips are open", await page.evaluate("() => scrollY") == before)
        hit = await page.evaluate("""() => { const b = document.getElementById('vodafone-aw-icon').getBoundingClientRect(); return document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2)?.id }""")
        check("accessibility: Vodafone's accessibility button stays reachable over the scrim", hit == "vodafone-aw-icon", hit)
        far = await page.evaluate("() => document.elementFromPoint(40, 300)?.closest('.tips') !== null")
        check("scrim: the rest of the page is behind the scrim", far)

        await page.keyboard.press("Escape")
        await page.wait_for_timeout(600)
        closed = await page.evaluate("""() => ({ hidden: document.querySelector('.tips').hidden, focus: document.activeElement?.classList.contains('tips-entry'),
            isNew: document.querySelector('.tips-entry').classList.contains('is-new'), saved: JSON.parse(localStorage.getItem('aixc.tips.v1') || '{}') })""")
        check("close: Esc closes and returns focus to the Tips button", closed["hidden"] and closed["focus"], closed)
        check("close: seen and saved; the new dot goes", closed["saved"].get("seen") is True and not closed["isNew"], closed)
        await page.keyboard.press("Enter")
        await page.wait_for_selector(".tips.is-open")
        await page.wait_for_timeout(700)
        check("reopen: from the keyboard, at the cover where it was left", await active_index(page) == 0)
        await page.click(".tips-close")
        await page.wait_for_timeout(500)
        check("no page errors (collection)", not page.errors, page.errors)
        await page.context.close()

        # ---------------------------------------------------------------- the invitation
        page = await new_page(browser, query="tips=invite")
        await page.wait_for_selector(".tips-invite.is-on", timeout=6000)
        boxes = await page.evaluate(BOXES)
        inv = await page.evaluate("() => { const r = document.querySelector('.tips-invite').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height } }")
        check("invitation: above the button, covering no control", all(not overlaps(inv, b) for k, b in boxes.items() if b and k != "tips") and inv["y"] + inv["h"] <= boxes["tips"]["y"], [inv, boxes])
        await page.click(".tips-invite__later")
        await page.wait_for_timeout(400)
        saved = await page.evaluate("() => JSON.parse(localStorage.getItem('aixc.tips.v1'))")
        check("invitation: Not now hides it and remembers", not await page.is_visible(".tips-invite") and saved.get("invited") is True, saved)
        await page.evaluate("() => window.__aixcTips?.showInvite?.()")
        await page.goto(BASE + "?tips=invite", wait_until="networkidle")
        await page.wait_for_selector(".tips-invite.is-on", timeout=6000)
        await page.click(".tips-invite__go")
        await page.wait_for_selector(".tips.is-open")
        await page.wait_for_timeout(600)
        check("invitation: Show me opens the tips at the cover", await active_index(page) == 0)
        await page.context.close()

        # ---------------------------------------------------------------- Try it: the Pocket
        page = await new_page(browser)
        await open_tips(page)
        await go_to_card(page, "pocket-peel")
        await page.click('.tips-card.is-active .tips-try')
        state = await wait_coach_title(page, "Pocket it")
        await page.wait_for_timeout(700)  # the page has finished scrolling the chip into view
        state = await coach_state(page)
        # The chip the coach rings (it prefers the demo script's services: Calls services first).
        chip = await page.evaluate("""() => { const ring = document.querySelector('.tips-coach__ring').getBoundingClientRect()
            const c = [...document.querySelectorAll('#source-content .pocket-cta')].find(c => { const r = c.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2; return x > ring.left && x < ring.right && y > ring.top && y < ring.bottom })
            if (!c) return null; const r = c.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, item: c.closest('[data-aixc-item]').dataset.aixcItem } }""")
        check("pocket try: the sheet closes and the coach points at a Pocket it chip (Calls services)", state["shown"] and await page.evaluate("() => document.querySelector('.tips').hidden") and chip and chip["item"] == "calls-services" and contains(state["ring"], chip), [state, chip])
        check("pocket try: the popover does not cover the chip", not overlaps(state["pop"], chip), [state["pop"], chip])
        check("pocket try: a step you do yourself has no Got it to skip it", not await page.is_visible(".tips-pop .tips-btn--primary"))
        blocked = await page.evaluate("() => document.elementFromPoint(20, innerHeight / 2)?.closest('.tips-coach') !== null")
        check("pocket try: the rest of the page is dimmed and not clickable", blocked)
        await page.click(f'#source-content [data-aixc-item="{chip["item"]}"] .pocket-cta')
        state = await wait_coach_title(page, "open your pocket")
        peek = await page.evaluate("() => { const r = document.querySelector('.pocket-peek').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height } }")
        check("pocket try: after the sticker lands, the coach points at the Pocket corner", contains(state["ring"], peek), [state, peek])
        boxes = await page.evaluate(BOXES)
        check("pocket try: the popover sits clear of the floating controls", all(not overlaps(state["pop"], b) for k, b in boxes.items() if b and k != "tips"), [state["pop"], boxes])
        check("floating: Tips button clear of the peeking Pocket and the lifted column (1366)", not overlap_pairs(boxes), boxes)
        await page.click(".pocket-peek")
        state = await wait_coach_title(page, "This is your pocket")
        check("pocket try: the open Pocket is explained, with Got it", state["shown"] and await page.is_visible(".tips-pop .tips-btn--primary"), state)
        check("pocket try: the Tips button steps aside in the open Pocket", not (await page.evaluate(BOXES))["tips"])
        await page.click(".tips-pop .tips-btn--primary")
        state = await wait_coach_title(page, "That’s your pocket")
        check("pocket try: success, and the page is usable again (no scrim)", state["success"] and await page.evaluate("() => document.querySelector('.tips-coach').classList.contains('is-passive')"), state)
        await page.click(".tips-pop .tips-btn--primary")
        await page.wait_for_selector(".tips.is-open")
        await page.wait_for_timeout(800)
        current = await page.evaluate("() => document.querySelector('.tips-card.is-active').dataset.card")
        tried = await page.evaluate("() => JSON.parse(localStorage.getItem('aixc.tips.v1')).tried")
        check("pocket try: Back to tips continues at the next demo, Pocket marked tried", current == "reimagine-pick" and tried.get("pocket") is True, [current, tried])
        await page.keyboard.press("End")
        await page.wait_for_timeout(800)
        check("closing card: the Pocket tile shows its check", await page.evaluate("() => !!document.querySelector('.tips-tile.is-tried .tips-tile__check')"))
        await page.keyboard.press("Escape")
        await page.wait_for_timeout(500)
        check("no page errors (Pocket try)", not page.errors, page.errors)
        await page.context.close()

        # ---------------------------------------------------------------- Try it: Reimagine
        page = await new_page(browser)
        await open_tips(page)
        await go_to_card(page, "reimagine-pick")
        await page.click('.tips-card.is-active .tips-try')
        state = await wait_coach_title(page, "Reimagine this page")
        launcher = await page.evaluate("() => { const r = document.querySelector('.aixc-launcher').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height } }")
        check("reimagine try: the coach points at the launcher", contains(state["ring"], launcher), [state, launcher])
        await page.click(".aixc-launcher")
        state = await wait_coach_title(page, "Pick")
        tile = await page.evaluate("() => { const r = document.querySelector('[data-template=coverflow]').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height } }")
        check("reimagine try: then at the Cover flow template", contains(state["ring"], tile) and not overlaps(state["pop"], tile), [state, tile])
        await page.click("[data-template=coverflow]")
        state = await wait_coach_title(page, "Switch back")
        seg = await page.evaluate("() => { const r = document.querySelector('.aixc-viewbar .aixc-seg').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height } }")
        check("reimagine try: then at Original in the view bar", await page.evaluate("() => document.body.dataset.aixcView") == "reimagined" and contains(state["ring"], seg), [state, seg])
        check("reimagine try: the Tips button steps aside in the reimagined view", not (await page.evaluate(BOXES))["tips"])
        await page.click(".aixc-viewbar .aixc-seg")
        state = await wait_coach_title(page, "That’s Reimagine")
        check("reimagine try: Original ends it with success", state["success"] and await page.evaluate("() => document.body.dataset.aixcView") == "original", state)
        await page.click(".tips-pop .tips-btn--ghost")
        await page.wait_for_timeout(400)
        check("reimagine try: Done closes the coach", not (await coach_state(page))["shown"])
        check("no page errors (Reimagine try)", not page.errors, page.errors)
        await page.context.close()

        # ---------------------------------------------------------------- Try it: the guide (stand-in)
        page = await new_page(browser, guide=True)
        await open_tips(page)
        await go_to_card(page, "voice-ask")
        has_try = await page.is_visible(".tips-card.is-active .tips-try")
        check("voice tip: with the guide on the page, Try it", has_try)
        await page.click(".tips-card.is-active .tips-try")
        state = await wait_coach_title(page, "microphone")
        boxes = await page.evaluate(BOXES)
        check("voice try: the coach rings the microphone", contains(state["ring"], boxes["mic"]), [state, boxes["mic"]])
        check("voice try: the popover covers no floating control", all(not overlaps(state["pop"], b) for k, b in boxes.items() if b and k != "tips"), [state["pop"], boxes])
        check("voice try: the spoken example is in the popover", "cheapest internet bundle" in await page.inner_text(".tips-pop__body"))
        hit = await page.evaluate("""() => { const b = document.getElementById('vodafone-aw-icon').getBoundingClientRect(); return document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2)?.id }""")
        check("voice try: the accessibility button stays reachable through the scrim", hit == "vodafone-aw-icon", hit)
        await page.evaluate("() => document.querySelector('vg-guide').shadowRoot.querySelector('.vg-mic').click()")
        state = await wait_coach_title(page, "the guide")
        check("voice try: pressing the microphone finishes it (nothing pressed for you)", state["success"] and await page.evaluate("() => window.__micPressed") == 1, state)
        await page.click(".tips-pop .tips-btn--ghost")
        await page.wait_for_timeout(300)
        await page.click(".tips-entry")
        await page.wait_for_selector(".tips.is-open")
        await page.wait_for_timeout(500)
        await go_to_card(page, "journey-remember")
        await page.click(".tips-card.is-active .tips-try")
        state = await wait_coach_title(page, "Your journey")
        boxes = await page.evaluate(BOXES)
        check("journey try: the coach rings the Your journey pill, popover clear of the controls", contains(state["ring"], boxes["journey"]) and all(not overlaps(state["pop"], b) for k, b in boxes.items() if b and k != "tips"), [state, boxes])
        await page.evaluate("() => document.querySelector('vg-guide').shadowRoot.querySelector('.tr-pill').click()")
        state = await wait_coach_title(page, "your journey")
        check("journey try: pressing the pill finishes it", state["success"] and await page.evaluate("() => window.__pillPressed") == 1, state)
        await page.keyboard.press("Escape")
        await page.wait_for_timeout(300)
        check("coach: Esc ends it", not (await coach_state(page))["shown"])
        boxes = await page.evaluate(BOXES)
        check("floating: Tips, microphone, accessibility, Reimagine and the pill never overlap (1366)", not overlap_pairs(boxes), boxes)
        check("no page errors (guide stand-in)", not page.errors, page.errors)
        await page.context.close()

        # ---------------------------------------------------------------- reduced motion
        page = await new_page(browser, reduced=True)
        await open_tips(page)
        await page.click(".tips-next")
        await page.wait_for_timeout(600)
        running = await page.evaluate("() => document.getAnimations().filter(a => a.effect?.target?.closest?.('.tips') && a.playState === 'running').length")
        words = await page.evaluate("() => [...document.querySelectorAll('.tips-card.is-active .ts-word')].map(w => getComputedStyle(w).opacity)")
        check("reduced motion: nothing in the tips moves", running == 0, running)
        check("reduced motion: the scene rests on its poster (the words are shown)", words and all(float(o) > 0.9 for o in words), words)
        check("reduced motion: still pages with the keys", await active_index(page) == 1)
        await page.context.close()

        # ---------------------------------------------------------------- phones
        page = await new_page(browser, width=375, height=812)
        boxes = await page.evaluate(BOXES)
        check("phone: the button clear of every floating control (375)", boxes["tips"] and not overlap_pairs(boxes), boxes)
        await open_tips(page)
        geo = await page.evaluate("""() => { const r = document.querySelector('.tips-sheet').getBoundingClientRect(); const m = document.querySelector('.tips-card.is-active .tips-media').getBoundingClientRect();
            return { x: r.left, w: r.width, bottom: r.bottom, h: r.height, media: m.height, grabber: getComputedStyle(document.querySelector('.tips-grabber')).display,
                     next: document.querySelector('.tips-next').getBoundingClientRect().height } }""")
        check("phone: a bottom sheet across the screen, with a grabber", geo["x"] == 0 and geo["w"] == 375 and abs(geo["bottom"] - 812) < 1 and geo["grabber"] == "block", geo)
        check("phone: the picture gets real room, the button one line", geo["media"] > 150 and geo["next"] <= 46, geo)
        await page.evaluate("() => document.querySelector('.tips-track').scrollBy({ left: 375 })")
        await page.wait_for_timeout(700)
        check("phone: swiping sideways pages the tips", await active_index(page) == 1)
        grab = await page.evaluate("() => { const r = document.querySelector('.tips-grabber').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2] }")
        await page.mouse.move(grab[0], grab[1] + 14)
        await page.mouse.down()
        for dy in range(20, 260, 40):
            await page.mouse.move(grab[0], grab[1] + 14 + dy)
            await page.wait_for_timeout(16)
        await page.mouse.up()
        await page.wait_for_timeout(600)
        check("phone: dragging the sheet down closes it", await page.evaluate("() => document.querySelector('.tips').hidden"))
        # The Pocket corner peeking: the button still clear of it and of the lifted column.
        await page.evaluate("() => localStorage.setItem('aixc.pocket.v1', JSON.stringify(['roaming']))")
        await page.reload(wait_until="networkidle")
        await page.evaluate(A11Y_STAND_IN)
        await page.evaluate(GUIDE_STAND_IN)
        await page.wait_for_timeout(800)
        boxes = await page.evaluate(BOXES)
        check("phone: with the Pocket peeking, nothing overlaps (375)", boxes["pocket"] and not overlap_pairs(boxes), boxes)
        check("no page errors (phone)", not page.errors, page.errors)
        await page.context.close()

        # ---------------------------------------------------------------- VoiceTut on the page
        page = await new_page(browser, query="demo=voicetut")
        await page.wait_for_timeout(1200)
        boxes = await page.evaluate(BOXES)
        check("voicetut: the Tips button rises above the VoiceTut tab", boxes["voicetut"] and not overlaps(boxes["tips"], boxes["voicetut"]), boxes)
        await page.context.close()

        # ---------------------------------------------------------------- Arabic
        for width, height in [(1366, 900), (375, 812)]:
            page = await new_page(browser, path="ar/", width=width, height=height, guide=True)
            boxes = await page.evaluate(BOXES)
            check(f"arabic {width}: nothing overlaps", not overlap_pairs(boxes), boxes)
            label = await page.inner_text(".tips-entry__label")
            await open_tips(page)
            ar = await page.evaluate(f"""() => ({{ dir: document.querySelector('.tips').dir, title: document.querySelector('.tips-card.is-active .tips-title').textContent,
                canvas: document.querySelector('.tips-card.is-active .ts-canvas')?.dir, arabic: {ARABIC}.test(document.querySelector('.tips-card.is-active .tips-title').textContent) }})""")
            check(f"arabic {width}: the button and the tips speak Arabic, right to left", label == "نصايح" and ar["dir"] == "rtl" and ar["canvas"] == "rtl" and ar["arabic"], [label, ar])
            await page.keyboard.press("ArrowLeft")
            await page.wait_for_timeout(800)
            eyebrow = await page.inner_text(".tips-eyebrow")
            check(f"arabic {width}: ArrowLeft pages forward", await active_index(page) == 1 and "المرشد الصوتي" in eyebrow, eyebrow)
            words = await page.evaluate("() => [...document.querySelectorAll('.tips-card.is-active .ts-word')].map(w => w.textContent).join(' ')")
            check(f"arabic {width}: the spoken example is the Arabic tuning phrase", words == "إيه أرخص باقة نت؟", words)
            await page.keyboard.press("End")
            await page.wait_for_timeout(900)
            names = await page.evaluate("() => [...document.querySelectorAll('.tips-tile__name')].map(n => n.textContent)")
            check(f"arabic {width}: the closing card names the demos in Arabic", names == ["المرشد الصوتي", "الجيب", "غيّر شكل الصفحة", "رحلتك"], names)
            await page.keyboard.press("Escape")
            await page.wait_for_timeout(400)
            check(f"no page errors (arabic {width})", not page.errors, page.errors)
            await page.context.close()

        # ---------------------------------------------------------------- every reimagined view: the button steps aside
        page = await new_page(browser)
        hidden_all = True
        for template in ["streaming", "split", "fan", "ring", "tunnel", "canvas", "coverflow", "spotlight", "journey", "gallery", "flipbook", "cube", "magazine"]:
            if await page.is_visible(".aixc-launcher"):
                await page.click(".aixc-launcher")
            elif not await page.is_visible("#aixc-composer"):
                await page.click(".aixc-viewbar__actions button >> nth=0")
            await page.click(f".aixc-template[data-template={template}]")
            await page.wait_for_timeout(500)
            if (await page.evaluate(BOXES))["tips"]:
                hidden_all = False
                print("   visible over", template)
        check("reimagine: the Tips button is out of the way in all 13 experiences", hidden_all)
        await page.click(".aixc-viewbar .aixc-seg")
        await page.wait_for_timeout(400)
        check("reimagine: back on Original, the button returns", bool((await page.evaluate(BOXES))["tips"]))
        check("no page errors (experiences)", not page.errors, page.errors)
        await page.context.close()

        await browser.close()

    failed = [name for name, ok in results if not ok]
    print(f"\n{len(results) - len(failed)}/{len(results)} checks passed")
    sys.exit(1 if failed else 0)


asyncio.run(main())
