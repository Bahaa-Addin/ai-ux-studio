"""
Browser checks for the experiences in the box (voice-guide ADR-0076, phase 4a, and the spec's safe zones).

    node scripts/serve.mjs --port 5200 &
    python tests/e2e/box_e2e.py http://127.0.0.1:5200/

Proves that spotlight's stepper and magazine's contents links work inside a scrolling element (the box a
host page gives the experiences) on a page whose html and body have overflow-x: hidden like Vodafone's
static themes: the stage pins under the view bar, the controls and copy stay clear of the shell's safe
zones (the bottom-corner controls, the guide's transcript bar while listening), every card fits, the
queue and the contents links scroll the box and never the window. Run at desktop, laptop, tablet and
phone sizes, in English and Arabic. The page is tests/e2e/box-harness.html, served through Playwright's
routing on the clone server's own origin (no port or dependency of its own). No network, no Gemini key.
Each check prints PASS/FAIL; the script exits non-zero if any check fails.
"""

import asyncio
import json
import sys
from pathlib import Path

from playwright.async_api import async_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:5200/"
HARNESS = (Path(__file__).parent / "box-harness.html").read_text()
URL = BASE + "__seam-harness.html"
results = []
measures = {}


def check(name, ok, detail=""):
    results.append((name, bool(ok)))
    print(f"{'PASS' if ok else 'FAIL'}  {name}{'  -- ' + json.dumps(detail, ensure_ascii=False) if detail != '' and not ok else ''}")


# Zones as the shell would measure them: how far each bottom corner's control reaches into the box (px).
DESKTOP_ZONES = {"right-w": 110, "right-h": 175, "left-w": 96, "left-h": 96}
ZONES = {
    (1366, 900): DESKTOP_ZONES,
    (1024, 768): {"right-w": 95, "right-h": 171, "left-w": 96, "left-h": 96},
    # Not measured on a tablet: the largest zones measured at any size (the harsher case).
    (768, 1024): {"right-w": 111, "right-h": 175, "left-w": 96, "left-h": 96},
    (375, 812): {"right-w": 111, "right-h": 173, "left-w": 84, "left-h": 84},
    (360, 780): {"right-w": 111, "right-h": 173, "left-w": 84, "left-h": 84},
    # Laptop windows (the review, 2026-11-17): the desktop's zones.
    (1366, 768): DESKTOP_ZONES,
    (1366, 800): DESKTOP_ZONES,
    (1536, 740): DESKTOP_ZONES,
    (1440, 900): DESKTOP_ZONES,
    # Either side of the switch.
    (1600, 850): DESKTOP_ZONES,
    (1600, 849): DESKTOP_ZONES,
}
# The guide listening: its transcript bar over the mic, 16 px from the right, up to 440 px wide
# (packages/sdk/src/voice/launcher.ts), so the right zone reaches 472 px in and 247 px up.
LISTENING = {"right-w": 472, "right-h": 247}

# From 1180 px the box uses the desktop layout (queue, copy over the backdrop) only when the window is tall
# enough for it; below this viewport height it uses the 720..1179 box layout. The desktop layout fits from 833 px
# at worst; spotlight.css switches at 850.
SHORT_BELOW = 850

# The controls row's own minimum width from 720 px (three 48 px buttons, the 60 px progress bar, the counter,
# four 14 px gaps: 340 px measured); spotlight.css keeps --sp-row-min above it.
ROW_MIN = 360


def layout_of(width, height):
    if width < 720:
        return "phone"
    if width < 1180:
        return "tablet"
    return "short" if height < SHORT_BELOW else "desktop"


FRAMES = "new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))"

STATE = """() => {
  const box = __h.box
  const stage = box.querySelector('.sp-stage')
  const b = box.getBoundingClientRect()
  const s = stage.getBoundingClientRect()
  return {
    stageTop: Math.round((s.top - b.top) * 10) / 10,
    stageBottomGap: Math.round((b.top + box.clientTop + box.clientHeight - s.bottom) * 10) / 10,
    spTop: stage.style.getPropertyValue('--sp-top'),
    stageHeight: stage.offsetHeight,
    view: box.clientHeight,
    queueDisplay: getComputedStyle(box.querySelector('.sp-queue')).display,
    counter: box.querySelector('.sp-counter__now').textContent,
    boxScroll: box.scrollTop,
    windowScroll: scrollY,
    hash: location.hash,
  }
}"""

# Every pressable element of the stage that shows inside the box, and the zones it touches.
IN_ZONES = """(zones) => {
  const box = __h.box
  const b = box.getBoundingClientRect()
  const right = { left: innerWidth - zones['right-w'], top: innerHeight - zones['right-h'], right: innerWidth, bottom: innerHeight }
  const left = { left: 0, top: innerHeight - zones['left-h'], right: zones['left-w'], bottom: innerHeight }
  const meets = (r, z) => r.left < z.right && r.right > z.left && r.top < z.bottom && r.bottom > z.top
  const out = []
  let seen = 0
  for (const el of box.querySelectorAll('.sp-stage :is(button, a[href], [tabindex="0"])')) {
    const r = el.getBoundingClientRect()
    const style = getComputedStyle(el)
    if (!r.width || !r.height || el.inert || el.closest('[inert]') || style.visibility === 'hidden' || Number(style.opacity) === 0 || style.pointerEvents === 'none') continue
    if (r.bottom <= b.top || r.top >= b.bottom) continue
    seen += 1
    for (const [name, z] of [['right', right], ['left', left]]) if (meets(r, z)) out.push({ zone: name, label: el.getAttribute('aria-label') || el.textContent.trim().slice(0, 30), rect: [r.left, r.top, r.right, r.bottom].map(Math.round) })
  }
  return { seen, out }
}"""

CONTROLS_CLEAR = """(zones) => {
  const r = __h.box.querySelector('.sp-controls').getBoundingClientRect()
  const right = { left: innerWidth - zones['right-w'], top: innerHeight - zones['right-h'], right: innerWidth, bottom: innerHeight }
  const left = { left: 0, top: innerHeight - zones['left-h'], right: zones['left-w'], bottom: innerHeight }
  const meets = (z) => r.left < z.right && r.right > z.left && r.top < z.bottom && r.bottom > z.top
  return { rect: [r.left, r.top, r.right, r.bottom].map(Math.round), right: meets(right), left: meets(left), aboveZones: Math.round(innerHeight - Math.max(zones['right-h'], zones['left-h']) - r.bottom) }
}"""

# The copy against the controls row and the zones: from 720 px the details panel's box, on phones each part of
# the shown slide (the row sits inside the panel there, under the title); and the details panel against both zones.
COPY_CLEAR = """(zones) => {
  const box = __h.box
  const row = box.querySelector('.sp-controls').getBoundingClientRect()
  const details = box.querySelector('.sp-details')
  const slide = box.querySelector('.sp-slide:not([hidden])')
  const phone = innerWidth < 720
  const meets = (r, z) => r.left < z.right && r.right > z.left && r.top < z.bottom && r.bottom > z.top
  const rect = (r) => [r.left, r.top, r.right, r.bottom].map(Math.round)
  const parts = phone ? [...slide.children] : [details]
  const hits = parts.map((el) => [el.className, el.getBoundingClientRect()]).filter(([, r]) => r.width && r.height && meets(r, row)).map(([name, r]) => ({ part: name, rect: rect(r) }))
  const d = details.getBoundingClientRect()
  const right = { left: innerWidth - zones['right-w'], top: innerHeight - zones['right-h'], right: innerWidth, bottom: innerHeight }
  const left = { left: 0, top: innerHeight - zones['left-h'], right: zones['left-w'], bottom: innerHeight }
  const inZones = [['right', right], ['left', left]].filter(([, z]) => meets(d, z)).map(([name]) => name)
  return { rowHits: hits, detailsInZones: inZones, details: rect(d), row: rect(row) }
}"""

# On phones: the controls row right under the shown slide's title, nothing pressable between them.
ROW_UNDER_TITLE = """() => {
  const box = __h.box
  const stage = box.querySelector('.sp-stage').getBoundingClientRect()
  const row = box.querySelector('.sp-controls')
  const r = row.getBoundingClientRect()
  const title = box.querySelector('.sp-slide:not([hidden]) .sp-slide__title')
  const t = title.getBoundingClientRect()
  const style = getComputedStyle(title)
  const line = parseFloat(style.lineHeight) || parseFloat(style.fontSize)
  const between = [...box.querySelectorAll('.sp-stage :is(button, a[href])')].filter((el) => {
    if (row.contains(el)) return false
    const e = el.getBoundingClientRect()
    return e.width && e.height && e.bottom > t.bottom + 0.5 && e.top < r.top - 0.5 && e.left < r.right && e.right > r.left
  }).map((el) => el.getAttribute('aria-label') || el.textContent.trim().slice(0, 30))
  return { gap: Math.round((r.top - t.bottom) * 10) / 10, line: Math.round(line * 10) / 10, lines: Math.round(t.height / line), rowTop: Math.round(r.top - stage.top), between }
}"""

# On phones the queue is not shown in the box: no box, no focus, not in the accessibility tree.
QUEUE_GONE = """() => {
  const q = __h.box.querySelector('.sp-queue')
  const cards = [...q.querySelectorAll('.sp-card')]
  return {
    display: getComputedStyle(q).display,
    rendered: cards.filter((c) => c.getClientRects().length).length,
    label: q.getAttribute('aria-label'),
    cardLabels: cards.map((c) => c.getAttribute('aria-label')),
  }
}"""

# From 720 px: where the controls row sits in the stage, and the stage's own bottom reserve.
CONTROLS_PLACE = """() => {
  const stage = __h.box.querySelector('.sp-stage')
  const row = __h.box.querySelector('.sp-controls')
  const s = stage.getBoundingClientRect()
  const r = row.getBoundingClientRect()
  return {
    position: getComputedStyle(row).position,
    left: Math.round((r.left - s.left) * 10) / 10,
    right: Math.round((s.right - r.right) * 10) / 10,
    width: Math.round(r.width * 10) / 10,
    stageWidth: Math.round(s.width * 10) / 10,
    aboveStageBottom: Math.round((s.bottom - r.bottom) * 10) / 10,
    rounds: [...row.querySelectorAll('.vx-round')].map((b) => Math.round(b.getBoundingClientRect().width * 10) / 10),
    overflow: row.scrollWidth - row.clientWidth,
    paddingBottom: getComputedStyle(stage).paddingBottom,
  }
}"""


def row_expected(zones, width, layout):
    """Where the row belongs from 720 px: between the zones (each side from its own zone, plus 16 px, never less
    than the gutter), at the bottom; above the taller zone at full width when the gap is narrower than the row."""
    gutter = min(48, max(16, 0.04 * width))
    left = max(gutter, zones["left-w"] + 16)
    right = max(gutter, zones["right-w"] + 16)
    lifted = width - left - right < ROW_MIN
    taller = max(zones["right-h"], zones["left-h"])
    base = 40 if layout == "desktop" else 28
    if lifted:
        return {"lifted": True, "centre": width / 2, "bottom": taller + 16, "reserve": max(96, taller + 80), "inside": (gutter, gutter)}
    return {"lifted": False, "centre": (left + width - right) / 2, "bottom": base, "reserve": max(96, taller), "inside": (left, right)}


async def open_harness(browser, width, height, lang="en", zones=None):
    context = await browser.new_context(viewport={"width": width, "height": height}, reduced_motion="reduce")
    page = await context.new_page()
    page.errors = []
    page.on("pageerror", lambda e: page.errors.append(str(e)))
    await page.route(URL + "*", lambda route: route.fulfill(status=200, content_type="text/html; charset=utf-8", body=HARNESS))
    await page.goto(f"{URL}?lang={lang}")
    await page.wait_for_function("window.__ready === true")
    await page.evaluate("(zones) => __h.measure(zones)", zones or ZONES[(width, height)])
    return context, page


async def spotlight(browser, width, height, lang, listening=False):
    tag = f"spotlight {lang} {width}x{height}{' listening' if listening else ''}"
    layout = layout_of(width, height)
    phone = layout == "phone"
    # From 720 to 1179 px in the box (the lead's decision, 2026-11-17): the queue is not shown, as on phones;
    # the stage keeps only the zones' height as its bottom reserve; the controls stay at the bottom centre.
    # A stage still taller than the box's room pins with its bottom at the box's bottom (--sp-top = view -
    # stage height), so there the checks are: pinned where that formula puts it, its bottom at the box's.
    tablet = layout == "tablet"
    # From 1180 px (the review, 2026-11-17): the stage is the room's height, never more; a window too short for
    # the desktop layout gets the 720..1179 box layout ("short"), still the room's height.
    wide = layout in ("desktop", "short")
    flow = layout in ("tablet", "short")
    narrow = layout != "desktop"
    zones = {**ZONES[(width, height)], **(LISTENING if listening else {})}
    context, page = await open_harness(browser, width, height, lang, zones)
    first = await page.evaluate("() => { __h.open('spotlight'); return [...__h.box.querySelectorAll('.sp-slide')].map((s) => s.dataset.aixcItem) }")
    await page.evaluate("document.fonts.ready")
    last = len(first) - 1
    size = await page.evaluate("() => ({ stage: __h.box.querySelector('.sp-stage').offsetHeight, view: __h.box.clientHeight, bar: __h.seam.chromeOffset() })")
    measures[tag] = {"size": size, "layout": layout, "zones": zones, "cards": len(first)}
    pin_at = lambda st: min(57, st["view"] - st["stageHeight"])
    pinned = lambda st: st["spTop"] == f"{pin_at(st)}px" and abs(st["stageTop"] - pin_at(st)) <= 1 and abs(st["stageBottomGap"]) <= 1
    at_bar = lambda st: abs(st["stageTop"] - 57) <= 1 and st["spTop"] == "57px" and abs(st["stageBottomGap"]) <= 1
    expected = row_expected(zones, width, layout) if not phone else None
    if flow:
        place = await page.evaluate(CONTROLS_PLACE)
        measures[tag]["reserve"] = place["paddingBottom"]
        what = "the zones' own height" if not expected["lifted"] else "the lifted row's top plus 16 px"
        check(f"{tag}: the stage's bottom reserve is {what} ({expected['reserve']}px), no room kept for a queue", place["paddingBottom"] == f"{expected['reserve']}px", place)
    if narrow:
        # The queue: not shown, so it holds no focus and is not read; the stage keeps no room for it.
        gone = await page.evaluate(QUEUE_GONE)
        measures[tag]["queue"] = {"display": gone["display"], "rendered": gone["rendered"]}
        check(f"{tag}: the queue is display: none in the box (no box for any of its {len(gone['cardLabels'])} cards)", gone["display"] == "none" and gone["rendered"] == 0, {k: gone[k] for k in ("display", "rendered")})
        tree = await page.locator(".sp-stage").aria_snapshot()
        heard = [name for name in [gone["label"], *gone["cardLabels"]] if name and name in tree]
        check(f"{tag}: the stage's accessibility tree has no queue group and no queue card", not heard, heard[:3])
        await page.evaluate("(id) => __h.current.reveal(id)", first[0])
        await page.evaluate(FRAMES)
        await page.focus(".sp-jump")
        stops = []
        for _ in range(40):
            await page.keyboard.press("Tab")
            here = await page.evaluate("() => { const a = document.activeElement; return a && a.closest('.sp-stage') ? (a.classList.contains('sp-card') ? 'card' : a.getAttribute('aria-label') || a.className) : null }")
            if here is None:
                break
            stops.append(here)
        next_label = "Next service" if lang == "en" else "الخدمة اللي بعدها"
        check(f"{tag}: Tab through the stage never lands on a queue card and reaches its controls ({len(stops)} stops)", "card" not in stops and next_label in stops, stops)
    # Cards 1, 5 and the last: pinned with its top at the bar's bottom and its bottom at the box's; nothing pressable
    # in either zone; the controls row clear of both.
    for item in (0, 4, last):
        await page.evaluate("(id) => __h.current.reveal(id)", first[item])
        await page.evaluate(FRAMES)
        state = await page.evaluate(STATE)
        zone = await page.evaluate(IN_ZONES, zones)
        row = await page.evaluate(CONTROLS_CLEAR, zones)
        measures[tag][f"card {item + 1}"] = {**state, "zones": zone, "controls": row}
        check(f"{tag}: reveal() lands on card {item + 1:02d}", state["counter"] == f"{item + 1:02d}", state)
        if tablet:
            check(f"{tag}: card {item + 1:02d}: pinned where --sp-top = min(57, view {state['view']} - stage {state['stageHeight']}) = {pin_at(state)} puts it, within 1 px, and its bottom is the box's bottom within 1 px", pinned(state), state)
        else:
            check(f"{tag}: card {item + 1:02d}: the pinned stage's top equals the bar's height (57) within 1 px, --sp-top 57px", abs(state["stageTop"] - 57) <= 1 and state["spTop"] == "57px", state)
            check(f"{tag}: card {item + 1:02d}: its bottom is the box's bottom within 1 px (stage {state['stageHeight']}, box {state['view']})", abs(state["stageBottomGap"]) <= 1, state)
        if not phone:
            place = await page.evaluate(CONTROLS_PLACE)
            measures[tag][f"card {item + 1}"]["place"] = place
            centre = place["left"] + place["width"] / 2
            inside = place["left"] >= expected["inside"][0] - 1 and place["right"] >= expected["inside"][1] - 1
            if expected["lifted"]:
                what = f"lifted above the taller zone ({expected['bottom']} px up), centred on the stage at full width"
            else:
                what = f"between the zones (left from {expected['inside'][0]:.0f}, right from {expected['inside'][1]:.0f} px), centred in that gap, {expected['bottom']} px above the stage's bottom"
            check(f"{tag}: card {item + 1:02d}: the controls row {what}; buttons 48 px, nothing squeezed", place["position"] == "absolute" and abs(centre - expected["centre"]) <= 1 and abs(place["aboveStageBottom"] - expected["bottom"]) <= 1 and inside and all(abs(w - 48) <= 0.5 for w in place["rounds"]) and place["overflow"] <= 0, [place, expected])
        check(f"{tag}: card {item + 1:02d}: nothing pressable in either safe zone ({zone['seen']} pressables in view)", zone["seen"] > 0 and not zone["out"], zone)
        check(f"{tag}: card {item + 1:02d}: the controls row clear of both zones ({row['aboveZones']} px above the taller)", not row["right"] and not row["left"], row)
        if narrow:
            check(f"{tag}: card {item + 1:02d}: the queue still not shown", state["queueDisplay"] == "none", state)
    # Every card: pinned; nothing pressable in a zone; the copy clear of the controls row and of both zones;
    # on phones the row right under the title.
    every, in_zones, row_hits, copy_zones, under = [], [], [], [], []
    for item in range(len(first)):
        await page.evaluate("(id) => __h.current.reveal(id)", first[item])
        await page.evaluate(FRAMES)
        state = await page.evaluate(STATE)
        every.append((item + 1, state["stageTop"], state["stageBottomGap"], state["stageHeight"], state["spTop"], pinned(state) if tablet else at_bar(state)))
        zone = await page.evaluate(IN_ZONES, zones)
        if not zone["seen"] or zone["out"]:
            in_zones.append((item + 1, zone))
        copy = await page.evaluate(COPY_CLEAR, zones)
        if copy["rowHits"]:
            row_hits.append((item + 1, copy))
        if copy["detailsInZones"]:
            copy_zones.append((item + 1, copy))
        if phone:
            u = await page.evaluate(ROW_UNDER_TITLE)
            under.append((item + 1, u))
    room = size["view"] - 57
    if tablet:
        off = [e[:5] for e in every if not e[5]]
        over = [e[0] for e in every if e[3] > room]
        measures[tag]["every card"] = {"tallest": max(e[3] for e in every), "shortest": min(e[3] for e in every), "taller than the room": over, "off": off}
        check(f"{tag}: all {len(every)} cards: pinned where --sp-top = min(57, view - stage) puts it and its bottom at the box's, within 1 px (stages {min(e[3] for e in every)}..{max(e[3] for e in every)}, room {room}, {len(over)} taller)", not off, off[:6])
    else:
        off = [e[:5] for e in every if not e[5]]
        measures[tag]["every card"] = {"tallest": max(e[3] for e in every), "shortest": min(e[3] for e in every), "off": off}
        check(f"{tag}: all {len(every)} cards: the stage's top at 57 and its bottom at the box's, within 1 px (stages {min(e[3] for e in every)}..{max(e[3] for e in every)}, box {size['view']} - bar 57)", not off, off[:6])
        if wide:
            taller = [e[:4] for e in every if e[3] > room]
            check(f"{tag}: all {len(every)} cards: the stage is never taller than the room ({room} px)", not taller, taller[:6])
    check(f"{tag}: all {len(every)} cards: nothing pressable in either safe zone", not in_zones, in_zones[:3])
    check(f"{tag}: all {len(every)} cards: the {'shown slide' if phone else 'details panel'} never meets the controls row", not row_hits, row_hits[:3])
    check(f"{tag}: all {len(every)} cards: the details panel clear of both zones", not copy_zones, copy_zones[:3])
    if phone:
        far = [(n, u) for n, u in under if not (0 <= u["gap"] <= u["line"]) or u["between"]]
        tops = [u["rowTop"] for _, u in under]
        measures[tag]["row under the title"] = {"rowTop": [min(tops), max(tops)], "gaps": sorted({u["gap"] for _, u in under}), "lines": sorted({u["lines"] for _, u in under})}
        check(f"{tag}: all {len(every)} cards: the controls row's top within one title line of the title's bottom, nothing pressable between (row top {min(tops)}..{max(tops)} px in the stage)", not far, far[:3])
    next_label = "Next service" if lang == "en" else "الخدمة اللي بعدها"
    prev_label = "Previous service" if lang == "en" else "الخدمة اللي قبلها"
    for start in (0, 4):
        here, ahead = f"{start + 1:02d}", f"{start + 2:02d}"
        await page.evaluate("(id) => __h.current.reveal(id)", first[start])
        await page.evaluate(FRAMES)
        at = await page.evaluate(STATE)
        await page.evaluate("() => __h.box.scrollBy({ top: 90, behavior: 'instant' })")
        await page.evaluate(FRAMES)
        held = await page.evaluate(STATE)
        stuck_at = pin_at(at) if tablet else 57
        check(f"{tag}: card {here}: still stuck 90 px further down the box at {stuck_at} (sticky works in the box although html and body clip)", abs(held["stageTop"] - at["stageTop"]) <= 1 and abs(held["stageTop"] - stuck_at) <= 1, [at, held])
        await page.evaluate("(id) => __h.current.reveal(id)", first[start])
        await page.evaluate(FRAMES)
        # Next and previous step it: the box scrolls one step, the window never.
        before = await page.evaluate(STATE)
        await page.click(f".sp-controls button[aria-label='{next_label}']")
        await page.wait_for_function(f"() => __h.box.querySelector('.sp-counter__now').textContent === '{ahead}'", timeout=4000)
        await page.evaluate(FRAMES)
        after_next = await page.evaluate(STATE)
        held_ok = pinned(after_next) if tablet else abs(after_next["stageTop"] - 57) <= 1
        check(f"{tag}: next steps {here} -> {ahead} by scrolling the box 200 px, the stage still {'pinned (formula, bottom at the box)' if tablet else 'at 57'}; the window does not scroll", after_next["counter"] == ahead and abs(after_next["boxScroll"] - before["boxScroll"] - 200) <= 2 and held_ok and after_next["windowScroll"] == 0, [before, after_next])
        await page.click(f".sp-controls button[aria-label='{prev_label}']")
        await page.wait_for_function(f"() => __h.box.querySelector('.sp-counter__now').textContent === '{here}'", timeout=4000)
        await page.evaluate(FRAMES)
        after_prev = await page.evaluate(STATE)
        back_ok = pinned(after_prev) if tablet else True
        check(f"{tag}: previous steps back to {here} (the box back where it was{', the stage pinned (formula, bottom at the box)' if tablet else ''}); the window does not scroll", after_prev["counter"] == here and abs(after_prev["boxScroll"] - before["boxScroll"]) <= 2 and back_ok and after_prev["windowScroll"] == 0, after_prev)
    # The arrow keys along the reading line, with focus on a control inside the stage.
    await page.focus(f".sp-controls button[aria-label='{next_label}']")
    await page.keyboard.press("ArrowRight" if lang == "en" else "ArrowLeft")
    await page.wait_for_function("() => __h.box.querySelector('.sp-counter__now').textContent === '06'", timeout=4000)
    check(f"{tag}: the forward arrow key steps to 06", True)
    # Card 10, then Original and Reimagined: unmount, the seam's reset, configure again, mount the same view: it listens again.
    await page.evaluate("(id) => __h.current.reveal(id)", first[9])
    await page.evaluate(FRAMES)
    left = await page.evaluate("() => { __h.current.unmount(); __h.seam.configure(); return __h.seam.keptCount() }")
    check(f"{tag}: unmount and configure() leave nothing kept", left == 0, left)
    await page.evaluate("() => { __h.seam.configure({ scroller: __h.box }); __h.current.mount() }")
    await page.evaluate(FRAMES)
    back = await page.evaluate(STATE)
    check(f"{tag}: mounted again, it shows card 10 where the box was left", back["counter"] == "10", back)
    await page.click(f".sp-controls button[aria-label='{next_label}']")
    await page.wait_for_function("() => __h.box.querySelector('.sp-counter__now').textContent === '11'", timeout=4000)
    check(f"{tag}: mounted again, next still steps (11)", True)
    window_scroll = await page.evaluate("() => scrollY")
    check(f"{tag}: the window never scrolled", window_scroll == 0, window_scroll)
    left = await page.evaluate("() => { __h.close(); return __h.seam.keptCount() }")
    check(f"{tag}: closed: nothing kept", left == 0, left)
    check(f"{tag}: no page errors", page.errors == [], page.errors)
    await context.close()


GROW = """async () => {
  const box = __h.box
  const next = box.querySelector('.sp-controls button:nth-child(2)')
  next.click()
  const t0 = performance.now()
  while (box.querySelector('.sp-counter__now').textContent !== '02' && performance.now() - t0 < 3000) await new Promise((r) => requestAnimationFrame(r))
  const layer = box.querySelector('.sp-backdrops').lastElementChild
  const anims = layer.getAnimations()
  const stage = box.querySelector('.sp-stage').getBoundingClientRect()
  const from = anims.length ? anims[0].effect.getKeyframes()[0].clipPath : null
  return { counter: box.querySelector('.sp-counter__now').textContent, animated: anims.length > 0, from, stageW: Math.round(stage.width), stageH: Math.round(stage.height) }
}"""


async def spotlight_grow(browser, width, height):
    tag = f"spotlight grow en {width}x{height} (motion allowed)"
    context = await browser.new_context(viewport={"width": width, "height": height}, reduced_motion="no-preference")
    page = await context.new_page()
    page.errors = []
    page.on("pageerror", lambda e: page.errors.append(str(e)))
    await page.route(URL + "*", lambda route: route.fulfill(status=200, content_type="text/html; charset=utf-8", body=HARNESS))
    await page.goto(f"{URL}?lang=en")
    await page.wait_for_function("window.__ready === true")
    await page.evaluate("(zones) => __h.measure(zones)", ZONES[(width, height)])
    first = await page.evaluate("() => { __h.open('spotlight'); return [...__h.box.querySelectorAll('.sp-slide')].map((s) => s.dataset.aixcItem) }")
    await page.evaluate("(id) => __h.current.reveal(id)", first[0])
    await page.evaluate(FRAMES)
    grow = await page.evaluate(GROW)
    measures[tag] = grow
    if layout_of(width, height) != "desktop":
        check(f"{tag}: next: the new backdrop does not grow out of the hidden queue's card (no box to grow from)", grow["counter"] == "02" and not grow["animated"], grow)
    else:
        sides = [float(v[:-2]) for v in grow["from"].replace("inset(", "").split(" round")[0].split()] if grow["from"] else []
        card = (grow["stageW"] - sides[1] - sides[3], grow["stageH"] - sides[0] - sides[2]) if len(sides) == 4 else None
        check(f"{tag}: next: the new backdrop grows out of the card that was next up (a 200 x 280 box)", grow["counter"] == "02" and grow["animated"] and card and abs(card[0] - 200) <= 2 and abs(card[1] - 280) <= 2, [grow, card])
    check(f"{tag}: no page errors", page.errors == [], page.errors)
    await page.evaluate("() => __h.close()")
    await context.close()


async def spotlight_items(browser):
    # Copy 'items' (pages not about services): the neutral words, the category nav's label too (the clone's
    # Arabic for it says services).
    want = {
        "en": ["Previous", "Next", "Spotlight", "Show", "Jump to a section"],
        "ar": ["السابق", "التالي", "تحت الضوء", "اعرض", "روح لقسم"],
    }
    for lang in ("en", "ar"):
        context, page = await open_harness(browser, 1366, 900, lang)
        labels = await page.evaluate("() => { __h.open('spotlight', { copy: 'items' }); const q = (s) => __h.box.querySelector(s); return [q('.sp-controls button').getAttribute('aria-label'), q('.sp-controls button:nth-child(2)').getAttribute('aria-label'), q('.sp-stage').getAttribute('aria-label'), q('.sp-card').getAttribute('aria-label').split(' ')[0], q('.sp-jumps').getAttribute('aria-label')] }")
        check(f"spotlight copy 'items' {lang}: {', '.join(want[lang])}", labels == want[lang], labels)
        await page.evaluate("() => __h.close()")
        await context.close()


async def magazine(browser, width, height, lang):
    tag = f"magazine {lang} {width}x{height}"
    context, page = await open_harness(browser, width, height, lang)
    href0 = await page.evaluate("() => { __h.open('magazine'); return location.href }")
    links = await page.evaluate("() => [...__h.box.querySelectorAll('.mag-cover__contents a')].map((a) => new URL(a.href).hash)")
    check(f"{tag}: the cover has contents links", len(links) >= 2, links)
    target = links[min(2, len(links) - 1)]
    await page.click(f".mag-cover__contents a[href$='{target}']")
    await page.evaluate(FRAMES)
    landed = await page.evaluate("""(hash) => {
      const box = __h.box
      const section = box.querySelector(hash)
      return {
        sectionTop: Math.round((section.getBoundingClientRect().top - box.getBoundingClientRect().top) * 10) / 10,
        boxScroll: box.scrollTop,
        windowScroll: scrollY,
        hash: location.hash,
        href: location.href,
        focused: document.activeElement === section,
      }
    }""", target)
    measures[tag] = landed
    check(f"{tag}: a contents link scrolls the box: the section's top at the bar's bottom (57) within 1 px", abs(landed["sectionTop"] - 57) <= 1 and landed["boxScroll"] > 0, landed)
    check(f"{tag}: no #fragment written, the address unchanged, the window unscrolled", landed["hash"] == "" and landed["href"] == href0 and landed["windowScroll"] == 0, landed)
    check(f"{tag}: focus moves to the section", landed["focused"], landed)
    shelf = await page.evaluate("() => !!__h.box.querySelector('.mag-shelf__track')")
    if shelf:
        before = await page.evaluate("() => { const t = __h.box.querySelector('.mag-shelf__track'); t.scrollIntoView({ block: 'nearest' }); return t.scrollLeft }")
        await page.click(".mag-shelf__controls .mag-shelf__button:nth-child(2)")
        await page.wait_for_timeout(300)
        after = await page.evaluate("() => { const t = __h.box.querySelector('.mag-shelf__track'); return { at: t.scrollLeft, prevDisabled: t.closest('.mag-shelf').querySelector('.mag-shelf__button').disabled } }")
        check(f"{tag}: the shelf's forward button scrolls it (listeners added on mount)", after["at"] != before and not after["prevDisabled"], [before, after])
    # reveal(): an item further down, its top to the pin line.
    item = await page.evaluate("() => { const all = [...__h.box.querySelectorAll('[data-aixc-item]')]; return all[all.length - 3].dataset.aixcItem }")
    shown = await page.evaluate("""async (id) => {
      __h.current.reveal(id)
      await new Promise((r) => requestAnimationFrame(r))
      const box = __h.box
      const el = [...box.querySelectorAll('[data-aixc-item]')].find((n) => n.dataset.aixcItem === id)
      const b = box.getBoundingClientRect()
      const r = el.getBoundingClientRect()
      return { top: Math.round(r.top - b.top), inView: r.top >= b.top + 56 && r.top < b.bottom, windowScroll: scrollY }
    }""", item)
    check(f"{tag}: reveal(item) brings it into the box's view; the window does not scroll", shown["inView"] and shown["windowScroll"] == 0, shown)
    left = await page.evaluate("() => { __h.close(); return __h.seam.keptCount() }")
    check(f"{tag}: closed: nothing kept", left == 0, left)
    check(f"{tag}: no page errors", page.errors == [], page.errors)
    await context.close()


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        only = sys.argv[2].split(",") if len(sys.argv) > 2 else None
        sizes = [(1366, 900), (1440, 900), (1600, 850), (1600, 849), (1366, 800), (1366, 768), (1536, 740), (1024, 768), (768, 1024), (375, 812), (360, 780)]
        if only:
            sizes = [s for s in sizes if f"{s[0]}x{s[1]}" in only]
        for width, height in sizes:
            for lang in ("en", "ar"):
                await spotlight(browser, width, height, lang)
        # The guide listening (its transcript bar widens the right zone) on the tablet sizes.
        for width, height in [s for s in sizes if s in ((1024, 768), (768, 1024))]:
            for lang in ("en", "ar"):
                await spotlight(browser, width, height, lang, listening=True)
        if not only:
            await spotlight_items(browser)
        for width, height in sizes:
            await spotlight_grow(browser, width, height)
        for width, height in sizes:
            for lang in ("en", "ar"):
                await magazine(browser, width, height, lang)
        await browser.close()
    failed = [name for name, ok in results if not ok]
    print(f"\n{len(results) - len(failed)}/{len(results)} checks passed")
    sys.exit(1 if failed else 0)


asyncio.run(main())
