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

The checks are table-driven (ADR-0076, Reimagine on Vodafone's pages): EXPERIENCES has one row per experience,
in the order they run. Spotlight and magazine are rows whose `run` is their own checks (above, unchanged); every
other row is checked by box_generic(): it renders in the box; every schema item is in the box once; one h1 is
exposed; the box never overflows sideways; scrolling the box to its end and back never scrolls the window; when
the row pins, the stage's top sits at the bar (57) and its bottom at the box's bottom, within 1 px, at 10, 50 and
90 % of its track; each of the row's controls, and anything pressable in the experience, clear of the safe zones
(the same zone maths as IN_ZONES and CONTROLS_CLEAR) at those places and, for a row that pins, at the box's end
(the closing band, whatever follows the track); at each of those places nothing of the experience (a pressable,
an item, a heading) cut by the box's left or right side, which the box's own overflow cannot show as .aixc-vx
clips (CUT_BY_SIDES); closing keeps nothing; no page errors. A generic row runs with motion allowed
(prefers-reduced-motion: no-preference, as most readers have it; spotlight's and magazine's own checks run with
it reduced, as open_harness does by default), so what moves only with motion (a pin a static mode drops) is
checked; a row passes motion="reduce" to check its reduced mode instead. The tag says which. The harness's
__h.load(name) imports src/aixc/experiences/<name>.js (its render<Name>) and links <name>.css once.

To add an experience (phases 2-4), edit its row:
    "fan": row(pins=(".fn-stage", ".fn-track"), controls=[".fn-controls"]),
  - drop `todo` (a todo row prints one "TODO <name>: <reason>" line and adds no check);
  - pins: (stage selector, track selector) when its stage is sticky in a taller track, else None;
  - controls: selectors of the parts that must stay clear of both zones (each must show in the box), or a
    function (width, height) -> list when they differ by size;
  - sizes: (width, height) pairs, each a key of ZONES (default GENERIC_SIZES); every size runs in en and ar;
  - motion: "no-preference" (default) or "reduce", the reader's prefers-reduced-motion for the row;
  - checks of its own (its reveal, its stepper): an async extra(page, tag, zones, layout) on the row, called
    after the generic checks with the experience open and the box at its top;
  - listening: sizes (keys of ZONES) at which every check runs again under the guide's listening zone (LISTENING
    merged into the size's zones: its transcript bar widens the right zone), en and ar;
  - after: an async after(browser, langs), checks of its own at sizes of its own, run once after its cells.

Trying a row that is still todo (its real gaps, without the 1,228 spotlight and magazine checks):
    BOX_TRY=fan,split python tests/e2e/box_e2e.py http://127.0.0.1:5200/ 1366x900,en
runs box_generic() for just those rows as if they were done; the optional second argument keeps only the
sizes ("1366x900") and, for generic rows only, the languages ("en", "ar") it lists.
"""

import asyncio
import json
import os
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
    # Shorter phones (an iPhone SE's 375x667, a 360x640): the phone's zones (2026-11-18, ring's review).
    (375, 667): {"right-w": 111, "right-h": 173, "left-w": 84, "left-h": 84},
    (360, 640): {"right-w": 111, "right-h": 173, "left-w": 84, "left-h": 84},
    # A short laptop window (2026-11-18, ring's review): the 1024 px window's zones.
    (1024, 600): {"right-w": 95, "right-h": 171, "left-w": 96, "left-h": 96},
    # Phones in landscape, for the rows whose controls sit low (split's, ring's, coverflow's), 2026-11-18. Measured
    # twice on the live kit at 812x375 with something pocketed; each corner is the larger of the two, and they agree:
    # split's lane: reimagine-live's zonesNow right [716.5,204,812.5,371] (the accessibility button and the mic, 16 px
    # around) and left [6,279,96,369] (the Pocket's button), so right 96 x 171 and left 96 x 96 from the window's
    # bottom corners, en and ar alike, the shell's own --aixc-safe-* the same; coverflow's lane: right 96 x 171, left
    # 96 x 96. The live box there is 295 px under an 80 px header with a 61 px bar (234 px of room); here 275 with
    # 57 (218), the harsher.
    (812, 375): {"right-w": 96, "right-h": 171, "left-w": 96, "left-h": 96},
    # Laptop windows (the review, 2026-11-17): the desktop's zones.
    (1366, 768): DESKTOP_ZONES,
    (1366, 800): DESKTOP_ZONES,
    (1366, 700): DESKTOP_ZONES,
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


async def open_harness(browser, width, height, lang="en", zones=None, motion="reduce"):
    """The harness at a size and language, the zones measured; `motion` is the reader's prefers-reduced-motion
    ("reduce", as spotlight's and magazine's checks run, or "no-preference")."""
    context = await browser.new_context(viewport={"width": width, "height": height}, reduced_motion=motion)
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


# The zones as rectangles in the window, as IN_ZONES and CONTROLS_CLEAR draw them (a JS expression of `zones`).
ZONE_RECTS = """[
  ['right', { left: innerWidth - zones['right-w'], top: innerHeight - zones['right-h'], right: innerWidth, bottom: innerHeight }],
  ['left', { left: 0, top: innerHeight - zones['left-h'], right: zones['left-w'], bottom: innerHeight }],
]"""

# The generic checks' state: the experience's root, the stage when it pins, the window and the box.
GENERIC_STATE = """({ name, stage }) => {
  const box = __h.box
  const b = box.getBoundingClientRect()
  const root = box.querySelector(`.aixc-vx--${name}`)
  const s = stage ? box.querySelector(stage)?.getBoundingClientRect() : null
  return {
    rendered: !!root && root.offsetHeight > 0,
    rootHeight: root ? root.offsetHeight : 0,
    stageTop: s ? Math.round((s.top - b.top) * 10) / 10 : null,
    stageBottomGap: s ? Math.round((b.top + box.clientTop + box.clientHeight - s.bottom) * 10) / 10 : null,
    stageHeight: s ? Math.round(s.height) : null,
    view: box.clientHeight,
    boxScroll: Math.round(box.scrollTop),
    windowScroll: scrollY,
  }
}"""

# Each schema item's count in the box (data-aixc-item), and the ids in the box that are not in the schema.
ITEMS_ONCE = """() => {
  const nodes = [...__h.box.querySelectorAll('[data-aixc-item]')].map((n) => n.dataset.aixcItem)
  const want = __h.itemIds
  const count = (id) => nodes.filter((n) => n === id).length
  return { items: want.length, off: want.map((id) => [id, count(id)]).filter(([, n]) => n !== 1), extra: [...new Set(nodes.filter((n) => !want.includes(n)))] }
}"""

# The h1s a screen reader would reach (not hidden from the accessibility tree).
H1S = """() => [...__h.box.querySelectorAll('h1')].filter((el) => !el.closest('[aria-hidden="true"], [hidden], [inert]') && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden').map((el) => el.textContent.trim().slice(0, 40))"""

# How far the box's content reaches past its sides.
OVERFLOW_X = """() => {
  const box = __h.box
  return { scrollWidth: box.scrollWidth, clientWidth: box.clientWidth, over: box.scrollWidth - box.clientWidth }
}"""

# Scroll the box to its end in view-height steps, then back to the top, a frame or two each; the window's
# largest scrollY on the way.
SCROLL_THROUGH = """async () => {
  const box = __h.box
  const frames = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  let most = scrollY
  const step = Math.max(200, Math.floor(box.clientHeight * 0.75))
  for (let y = 0; y < box.scrollHeight; y += step) {
    box.scrollTo({ top: y, behavior: 'instant' })
    await frames()
    most = Math.max(most, scrollY)
  }
  box.scrollTo({ top: box.scrollHeight, behavior: 'instant' })
  await frames()
  const end = { boxScroll: Math.round(box.scrollTop), max: box.scrollHeight - box.clientHeight }
  most = Math.max(most, scrollY)
  for (let y = box.scrollTop; y > 0; y -= step) {
    box.scrollTo({ top: y, behavior: 'instant' })
    await frames()
    most = Math.max(most, scrollY)
  }
  box.scrollTo({ top: 0, behavior: 'instant' })
  await frames()
  return { most, after: scrollY, end, back: Math.round(box.scrollTop) }
}"""

# Where to scroll the box so the stage is k of the way along its track (the track's top at the bar at 0).
TRACK_AT = """({ track, stage, k }) => {
  const box = __h.box
  const t = box.querySelector(track)
  const s = box.querySelector(stage)
  if (!t || !s) return null
  const top = t.getBoundingClientRect().top - box.getBoundingClientRect().top - box.clientTop + box.scrollTop
  const run = t.offsetHeight - (box.clientHeight - 57)
  return { y: Math.round(top - 57 + Math.max(0, run) * k), run, track: t.offsetHeight }
}"""

# Each control (a selector of the row) shown in the box, and the zones it meets; and everything pressable in the
# experience that shows in the box, as IN_ZONES counts it for spotlight.
CONTROLS_IN_ZONES = """({ zones, controls, name }) => {
  const box = __h.box
  const b = box.getBoundingClientRect()
  const zoneRects = """ + ZONE_RECTS + """
  const meets = (r, z) => r.left < z.right && r.right > z.left && r.top < z.bottom && r.bottom > z.top
  const rect = (r) => [r.left, r.top, r.right, r.bottom].map(Math.round)
  const shown = (el) => {
    const r = el.getBoundingClientRect()
    const style = getComputedStyle(el)
    if (!r.width || !r.height || el.inert || el.closest('[inert]') || style.visibility === 'hidden' || Number(style.opacity) === 0) return null
    if (r.bottom <= b.top || r.top >= b.bottom) return null
    return r
  }
  const each = controls.map((sel) => {
    const found = [...box.querySelectorAll(sel)].map((el) => shown(el)).filter(Boolean)
    return { sel, shown: found.length, zones: found.flatMap((r) => zoneRects.filter(([, z]) => meets(r, z)).map(([zone]) => ({ zone, rect: rect(r) }))) }
  })
  const out = []
  let seen = 0
  for (const el of box.querySelectorAll(`.aixc-vx--${name} :is(button, a[href], [tabindex="0"])`)) {
    const r = shown(el)
    if (!r || getComputedStyle(el).pointerEvents === 'none') continue
    seen += 1
    for (const [zone, z] of zoneRects) if (meets(r, z)) out.push({ zone, label: el.getAttribute('aria-label') || el.textContent.trim().slice(0, 30), rect: rect(r) })
  }
  return { each, seen, out }
}"""

# What the experience shows in the box that the box's left or right side cuts: the box's own sideways overflow
# (OVERFLOW_X) cannot see it, as .aixc-vx clips its content. Each pressable, item and heading of the experience
# that shows: some of it left after the clipping of its ancestors inside the experience's root (a stage's own
# window, a wrapper with overflow hidden), within the box's height and sides. It is cut when it reaches past the
# box's inner left or right side by more than 1 px and what shows of it runs to that side: the cut line is the
# box's side, whichever of its ancestors draws it (one that is as wide as the box clips it there as .aixc-vx
# does). Not counted: something inside a row that scrolls sideways (the reader scrolls to the rest, as under
# streaming's arrows), something its own ancestors clip inside the box, something wholly clipped or wholly beside
# the box (a card the carousel has moved off), visually hidden text (1 px).
CUT_BY_SIDES = """({ name }) => {
  const box = __h.box
  const b = box.getBoundingClientRect()
  const inner = { left: b.left + box.clientLeft, right: b.left + box.clientLeft + box.clientWidth, top: b.top + box.clientTop, bottom: b.top + box.clientTop + box.clientHeight }
  const root = box.querySelector(`.aixc-vx--${name}`)
  if (!root) return { seen: 0, cut: [] }
  const clips = (style) => style.overflowX !== 'visible' || style.overflowY !== 'visible' || style.clipPath !== 'none' || /paint|strict|content/.test(style.contain)
  const cut = []
  let seen = 0
  for (const el of root.querySelectorAll(':is(button, a[href], [tabindex="0"], [data-aixc-item], h1, h2, h3, h4, h5, h6)')) {
    const style = getComputedStyle(el)
    const r = el.getBoundingClientRect()
    if (r.width <= 1 || r.height <= 1 || el.closest('[inert], [hidden], [aria-hidden="true"]') || style.visibility === 'hidden' || Number(style.opacity) === 0) continue
    let v = { left: r.left, top: r.top, right: r.right, bottom: r.bottom }
    let scrolls = false
    for (let a = el.parentElement; a && a !== root; a = a.parentElement) {
      const as = getComputedStyle(a)
      if (!clips(as)) continue
      if (/auto|scroll/.test(as.overflowX) && a.scrollWidth > a.clientWidth + 1) scrolls = true
      const c = a.getBoundingClientRect()
      v = { left: Math.max(v.left, c.left), top: Math.max(v.top, c.top), right: Math.min(v.right, c.right), bottom: Math.min(v.bottom, c.bottom) }
    }
    if (v.right - v.left < 1 || v.bottom - v.top < 1) continue
    if (v.bottom <= inner.top || v.top >= inner.bottom) continue
    if (v.right <= inner.left || v.left >= inner.right) continue
    seen += 1
    if (scrolls) continue
    const left = inner.left - r.left > 1 && v.left <= inner.left + 1
    const right = r.right - inner.right > 1 && v.right >= inner.right - 1
    if (left || right) cut.push({ what: el.localName + (el.classList.length ? '.' + el.classList[0] : ''), label: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 30), side: left ? 'left' : 'right', past: Math.round(left ? inner.left - r.left : r.right - inner.right), rect: [r.left, r.top, r.right, r.bottom].map(Math.round), box: [inner.left, inner.right].map(Math.round) })
  }
  return { seen, cut }
}"""

# The sizes a generic row runs at (the plan's 16 cells: these four, en and ar).
GENERIC_SIZES = [(1366, 900), (1366, 768), (1024, 768), (375, 812)]
# Where along the track the pinned stage is measured (0 = the track's top at the bar, 1 = the stage's last stop).
TRACK_POINTS = (0.1, 0.5, 0.9)


async def box_generic(browser, name, width, height, lang, listening=False):
    """The checks every experience gets in the box (its row in EXPERIENCES gives pins, controls and sizes); with
    `listening`, under the guide's listening zone (LISTENING merged into the size's zones: its transcript bar in
    the right zone, as spotlight's runs)."""
    row = EXPERIENCES[name]
    motion = row["motion"]
    tag = f"{name} {lang} {width}x{height}{' listening' if listening else ''} ({'reduced motion' if motion == 'reduce' else 'motion allowed'})"
    zones = {**ZONES[(width, height)], **(LISTENING if listening else {})}
    pins = row["pins"]
    controls = row["controls"](width, height) if callable(row["controls"]) else list(row["controls"])
    context, page = await open_harness(browser, width, height, lang, zones, motion)
    try:
        await page.evaluate("(name) => __h.load(name)", name)
        await page.evaluate("(name) => { __h.open(name) }", name)
    except Exception as error:  # noqa: BLE001 -- a render that throws is the finding
        check(f"{tag}: renders in the box", False, str(error).splitlines()[0])
        await context.close()
        return
    await page.evaluate("document.fonts.ready")
    await page.evaluate(FRAMES)
    stage = pins[0] if pins else None
    state = await page.evaluate(GENERIC_STATE, {"name": name, "stage": stage})
    measures[tag] = {"zones": zones, "open": state}
    check(f"{tag}: renders in the box (.aixc-vx--{name}, {state['rootHeight']} px tall)", state["rendered"], state)
    items = await page.evaluate(ITEMS_ONCE)
    check(f"{tag}: every one of the schema's {items['items']} items is in the box once (data-aixc-item)", items["items"] > 0 and not items["off"] and not items["extra"], items)
    h1s = await page.evaluate(H1S)
    check(f"{tag}: one h1 exposed", len(h1s) == 1, h1s)
    over = await page.evaluate(OVERFLOW_X)
    check(f"{tag}: nothing reaches past the box's sides ({over['scrollWidth']} / {over['clientWidth']} px)", over["over"] <= 0, over)
    through = await page.evaluate(SCROLL_THROUGH)
    measures[tag]["scroll"] = through
    check(f"{tag}: scrolling the box to its end ({through['end']['max']} px) and back never scrolls the window", through["most"] == 0 and through["after"] == 0 and through["end"]["boxScroll"] >= through["end"]["max"] - 1 and through["back"] == 0, through)
    # Where to look: along the track when it pins, else the box's top, middle and end.
    if pins:
        points = []
        for k in TRACK_POINTS:
            at = await page.evaluate(TRACK_AT, {"track": pins[1], "stage": pins[0], "k": k})
            points.append((f"{int(k * 100)}% along the track", at))
        # The box's end too (the closing band and whatever follows the track), for the zones and the sides only:
        # the stage has left its pin there.
        most = await page.evaluate("() => __h.box.scrollHeight - __h.box.clientHeight")
        points.append(("box at its end", {"y": most, "unpinned": True}))
    else:
        most = await page.evaluate("() => __h.box.scrollHeight - __h.box.clientHeight")
        points = [(f"box at {int(k * 100)}%", {"y": round(most * k)}) for k in (0, 0.5, 1)]
    off, seen_by_control, control_hits, pressable_hits, seen = [], {sel: 0 for sel in controls}, [], [], 0
    cut, seen_cut = [], 0
    for label, at in points:
        if at is None:
            off.append((label, "no stage or track"))
            continue
        await page.evaluate("(y) => __h.box.scrollTo({ top: y, behavior: 'instant' })", at["y"])
        await page.evaluate(FRAMES)
        st = await page.evaluate(GENERIC_STATE, {"name": name, "stage": stage})
        if pins and not at.get("unpinned"):
            ok = st["stageTop"] is not None and abs(st["stageTop"] - 57) <= 1 and abs(st["stageBottomGap"]) <= 1
            if not ok:
                off.append((label, {**st, **at}))
        zone = await page.evaluate(CONTROLS_IN_ZONES, {"zones": zones, "controls": controls, "name": name})
        measures[tag][label] = {"state": st, "zones": zone}
        seen += zone["seen"]
        for c in zone["each"]:
            seen_by_control[c["sel"]] += c["shown"]
            if c["zones"]:
                control_hits.append((label, c["sel"], c["zones"][:2]))
        if zone["out"]:
            pressable_hits.append((label, zone["out"][:3]))
        sides = await page.evaluate(CUT_BY_SIDES, {"name": name})
        measures[tag][label]["sides"] = sides
        seen_cut += sides["seen"]
        if sides["cut"]:
            cut.append((label, sides["cut"][:3]))
    if pins:
        pinned = [p[0] for p in points if not (p[1] or {}).get("unpinned")]
        check(f"{tag}: pinned in its track ({', '.join(pinned)}): the stage's top at the bar (57) and its bottom at the box's, within 1 px", not off, off[:3])
    for sel in controls:
        hits = [h for h in control_hits if h[1] == sel]
        check(f"{tag}: {sel} shown in the box and clear of both zones", seen_by_control[sel] > 0 and not hits, {"shown": seen_by_control[sel], "hits": hits[:3]})
    check(f"{tag}: nothing pressable in either safe zone ({seen} pressables in view over {len(points)} places)", seen > 0 and not pressable_hits, pressable_hits[:3])
    check(f"{tag}: nothing in the experience cut by the box's sides ({seen_cut} pressables, items and headings in view over {len(points)} places)", seen_cut > 0 and not cut, cut[:3])
    if row.get("extra"):
        await page.evaluate("() => __h.box.scrollTo({ top: 0, behavior: 'instant' })")
        await page.evaluate(FRAMES)
        await row["extra"](page, tag, zones, layout_of(width, height))
    window_scroll = await page.evaluate("() => scrollY")
    check(f"{tag}: the window never scrolled", window_scroll == 0, window_scroll)
    left = await page.evaluate("() => { __h.close(); return __h.seam.keptCount() }")
    check(f"{tag}: closed: nothing kept", left == 0, left)
    check(f"{tag}: no page errors", page.errors == [], page.errors)
    await context.close()


# The sizes spotlight's and magazine's checks run at.
SIZES = [(1366, 900), (1440, 900), (1600, 850), (1600, 849), (1366, 800), (1366, 768), (1536, 740), (1024, 768), (768, 1024), (375, 812), (360, 780)]


async def run_spotlight(browser, sizes, only):
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


async def run_magazine(browser, sizes, only):
    for width, height in sizes:
        for lang in ("en", "ar"):
            await magazine(browser, width, height, lang)


def row(todo=None, pins=None, controls=(), sizes=None, run=None, extra=None, motion="no-preference", listening=(), after=None):
    """One experience: `todo` (the reason it is not checked yet) or its checks: `run` (its own, as spotlight's and
    magazine's) or box_generic() with `pins` (stage, track) or None, `controls`, `sizes`, `motion` (the reader's
    prefers-reduced-motion the row runs under: "no-preference" by default, "reduce" for a row whose static mode is
    what it checks), `listening` (sizes, keys of ZONES, it runs at again under the guide's listening zone, en
    and ar) and `after` (an async after(browser, langs) of the row's own, run once after its cells)."""
    return {"todo": todo, "pins": pins, "controls": controls, "sizes": sizes or GENERIC_SIZES, "run": run, "extra": extra, "motion": motion, "listening": list(listening), "after": after}


# The fan's cards: each card's item id, whether it is the current one, inert, and its rect.
FAN_CARDS = """() => [...__h.box.querySelectorAll('.fn-card')].map((c) => ({ id: c.dataset.aixcItem, active: c.classList.contains('is-active'), inert: c.inert }))"""

# reveal(id) on the fan with motion allowed: what it returns, and the card's state at once (before its 0.8 s settle).
# A card in a zone (the guide listening) is inert by design: inZone says so.
FAN_REVEAL = """({ id, zones }) => {
  const box = __h.box
  const back = __h.current.reveal(id)
  const card = [...box.querySelectorAll('.fn-card')].find((c) => c.dataset.aixcItem === id)
  const r = card ? card.getBoundingClientRect() : null
  const zoneRects = """ + ZONE_RECTS + """
  const inZone = !!r && zoneRects.some(([, z]) => r.left < z.right && r.right > z.left && r.top < z.bottom && r.bottom > z.top)
  return { back, active: !!card && card.classList.contains('is-active'), inert: !card || card.inert, inZone, counter: box.querySelector('.fn-counter__now').textContent, boxScroll: Math.round(box.scrollTop), windowScroll: scrollY }
}"""

# The fan at rest: a second, then until no card is on its way (at most 3 s more), then fan.js's check where they rest.
FAN_SETTLE = """async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms))
  await wait(1000)
  const moving = () => [...__h.box.querySelectorAll('.fn-card')].some((c) => c.getAnimations().some((a) => a.transitionProperty === 'transform' && a.playState === 'running'))
  for (let i = 0; i < 60 && moving(); i++) await wait(50)
  await wait(150)
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
}"""


async def fan_extra(page, tag, zones, layout):
    """The fan's own checks, with motion allowed: reveal(itemId) steps to its card, which is current and pressable at
    once (not only once it rests), and false for an id it has not; and with the stage pinned, zones that change on
    their own (the Pocket's button showing, the guide starting to listen, without the box changing size) make the
    cards that rest in them inert and give the others back when they go."""
    ids = [c["id"] for c in await page.evaluate(FAN_CARDS)]
    absent = await page.evaluate("() => __h.current.reveal('no-such-item')")
    check(f"{tag}: reveal() of an id it has not returns false", absent is False, absent)
    picks = sorted({0, len(ids) // 2, len(ids) - 1})
    bad = []
    for at in picks:
        got = await page.evaluate(FAN_REVEAL, {"id": ids[at], "zones": zones})
        if not (got["back"] is True and got["active"] and (not got["inert"] or got["inZone"]) and got["counter"] == f"{at + 1:02d}" and got["windowScroll"] == 0):
            bad.append((at + 1, got))
    check(f"{tag}: reveal() of cards {', '.join(f'{a + 1:02d}' for a in picks)} returns true, the card current and pressable at once (motion allowed; inert only in a zone), the window still", not bad, bad[:3])
    if zones.get("right-w") == LISTENING["right-w"]:
        return
    # Mid-track, at rest; the Pocket's button not shown yet (no left zone).
    at = await page.evaluate(TRACK_AT, {"track": ".fn-track", "stage": ".fn-stage", "k": 0.5})
    await page.evaluate("(y) => __h.box.scrollTo({ top: y, behavior: 'instant' })", at["y"])
    await page.evaluate("(zones) => __h.measure(zones)", {**zones, "left-w": 0, "left-h": 0})
    await page.evaluate(FAN_SETTLE)
    before = [c["id"] for c in await page.evaluate(FAN_CARDS) if not c["inert"]]
    # Then the Pocket's button shows and the guide starts to listen: only the box's style changes.
    heard = {**zones, **LISTENING}
    await page.evaluate("(zones) => __h.measure(zones)", heard)
    await page.evaluate(FAN_SETTLE)
    zone = await page.evaluate(CONTROLS_IN_ZONES, {"zones": heard, "controls": [], "name": "fan"})
    check(f"{tag}: the zones growing while it rests (the Pocket's button, the guide listening): nothing pressable in either ({zone['seen']} pressables in view)", zone["seen"] > 0 and not zone["out"], zone["out"][:3])
    # And back: the cards clear again are pressable again.
    await page.evaluate("(zones) => __h.measure(zones)", {**zones, "left-w": 0, "left-h": 0})
    await page.evaluate(FAN_SETTLE)
    after = [c["id"] for c in await page.evaluate(FAN_CARDS) if not c["inert"]]
    check(f"{tag}: the zones going back: the same {len(before)} cards pressable again", after == before and before, {"before": before, "after": after})
    await page.evaluate("(zones) => __h.measure(zones)", zones)
    await page.evaluate(FAN_SETTLE)


# reveal(id) on the cover flow: what it returns, and at once (before a frame) the cover in front, pressable, the counter.
# A cover in a zone (the guide listening on a short box) is inert by design: inZone says so.
CF_REVEAL = """({ id, zones }) => {
  const box = __h.box
  const back = __h.current.reveal(id)
  const cover = [...box.querySelectorAll('.cf-cover')].find((c) => c.dataset.aixcItem === id)
  const r = cover ? cover.getBoundingClientRect() : null
  const zoneRects = """ + ZONE_RECTS + """
  const inZone = !!r && zoneRects.some(([, z]) => r.left < z.right && r.right > z.left && r.top < z.bottom && r.bottom > z.top)
  return { back, front: !!cover && cover.classList.contains('is-front'), inert: !cover || cover.inert, inZone, counter: box.querySelector('.cf-counter__now').textContent, windowScroll: scrollY }
}"""

# The covers that show: each one's place against the box's sides and the zones, and whether it is inert.
CF_COVERS = """({ zones }) => {
  const box = __h.box
  const b = box.getBoundingClientRect()
  const [left, right] = [b.left + box.clientLeft, b.left + box.clientLeft + box.clientWidth]
  const zoneRects = """ + ZONE_RECTS + """
  return [...box.querySelectorAll('.cf-cover')].filter((c) => !c.classList.contains('is-off')).map((c) => {
    const r = c.getBoundingClientRect()
    const inZone = zoneRects.some(([, z]) => r.left < z.right && r.right > z.left && r.top < z.bottom && r.bottom > z.top)
    return { id: c.dataset.aixcItem, front: c.classList.contains('is-front'), inert: c.inert, cut: r.left < left - 1 || r.right > right + 1, inZone }
  })
}"""

# Each cover brought to the front (lifted and grown) against what shows of the panel (the controls, the group's name,
# the title, the description, the actions) and of the head: the rects that overlap it, by how much.
CF_ROOM = """async () => {
  const box = __h.box
  const frames = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  const parts = ['.cf-controls', '.cf-detail__group', '.cf-detail__title', '.cf-detail__desc', '.cf-detail__actions', '.cf-brand', '.cf-scroll']
  const out = []
  for (const id of [...box.querySelectorAll('.cf-cover')].map((c) => c.dataset.aixcItem)) {
    __h.current.reveal(id)
    await frames()
    const r = box.querySelector('.cf-cover.is-front').getBoundingClientRect()
    const hits = []
    for (const sel of parts) {
      const el = box.querySelector(sel)
      if (!el) continue
      const p = el.getBoundingClientRect()
      if (!p.width || !p.height || getComputedStyle(el).display === 'none' || el.closest('[hidden]') || getComputedStyle(el.closest('.cf-head') || el).display === 'none') continue
      const x = Math.min(r.right, p.right) - Math.max(r.left, p.left)
      const y = Math.min(r.bottom, p.bottom) - Math.max(r.top, p.top)
      if (x > 0.5 && y > 0.5) hits.push({ sel, by: Math.round(y), cover: [r.left, r.top, r.right, r.bottom].map(Math.round), part: [p.left, p.top, p.right, p.bottom].map(Math.round) })
    }
    out.push({ id, size: Math.round(r.width), head: getComputedStyle(box.querySelector('.cf-head')).display !== 'none', hits })
  }
  return out
}"""


# A cover that has focus and leaves the stage's clear room (cut by the box's side, or past the flow's end) hands focus
# to a control of the stage that can take it; where focus lands, and where the cover went.
CF_FOCUS = """async ({ at }) => {
  const box = __h.box
  const wait = (ms) => new Promise((r) => setTimeout(r, ms))
  const covers = [...box.querySelectorAll('.cf-cover')]
  const inertBefore = covers[at].inert
  covers[at].focus({ preventScroll: true })
  const had = document.activeElement === covers[at]
  covers[at].dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true }))
  await wait(1500)
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  const el = document.activeElement
  return {
    had,
    inertBefore,
    total: covers.length,
    cover: { inert: covers[at].inert, off: covers[at].classList.contains('is-off') },
    focus: el === document.body ? 'body' : (el.getAttribute('aria-label') || el.className),
    stillCover: el === covers[at],
    inStage: !!el.closest?.('.cf-stage'),
    disabled: !!el.disabled,
    windowScroll: scrollY,
  }
}"""


async def coverflow_extra(page, tag, zones, layout):
    """The cover flow's own checks, with motion allowed: reveal(itemId) brings its cover to the front at once, pressable
    (inert only in a zone), and false for an id it has not; pinned mid-track, the covers the box's sides cut are inert,
    the front one never (but in a zone), and the front cover clear of the panel's content and the head; zones that
    change on their own (the Pocket's button, the guide starting to listen) leave nothing pressable in them and the
    covers' inert state follows them there and back; and a focused cover that leaves the clear room (a flow that does
    not loop: its last control disabled) hands focus to a control that can take it."""
    absent = await page.evaluate("() => __h.current.reveal('no-such-item')")
    check(f"{tag}: reveal() of an id it has not returns false", absent is False, absent)
    ids = await page.evaluate("() => [...__h.box.querySelectorAll('.cf-cover')].map((c) => c.dataset.aixcItem)")
    picks = sorted({0, len(ids) // 2, len(ids) - 1})
    at = await page.evaluate(TRACK_AT, {"track": ".cf-track", "stage": ".cf-stage", "k": 0.5})
    await page.evaluate("(y) => __h.box.scrollTo({ top: y, behavior: 'instant' })", at["y"])
    await page.evaluate(FRAMES)
    bad = []
    for n in picks:
        got = await page.evaluate(CF_REVEAL, {"id": ids[n], "zones": zones})
        if not (got["back"] is True and got["front"] and (not got["inert"] or got["inZone"]) and got["counter"] == f"{n + 1:02d}" and got["windowScroll"] == 0):
            bad.append((n + 1, got))
    check(f"{tag}: reveal() of covers {', '.join(f'{n + 1:02d}' for n in picks)} returns true, the cover in front and pressable at once (inert only in a zone), the window still", not bad, bad[:3])
    await page.evaluate(FRAMES)
    covers = await page.evaluate(CF_COVERS, {"zones": zones})
    wrong = [c for c in covers if (c["cut"] or c["inZone"]) and not c["inert"]]
    front = [c for c in covers if c["front"]]
    check(f"{tag}: pinned, the covers cut by the box's sides or in a zone inert ({sum(c['cut'] or c['inZone'] for c in covers)} of {len(covers)} shown), the front one pressable (but in a zone)", not wrong and front and (not front[0]["inert"] or front[0]["inZone"]), {"wrong": wrong[:3], "front": front})
    # Each cover in front, lifted: clear of the panel's content and of the head when it shows.
    room = await page.evaluate(CF_ROOM)
    hit = [r for r in room if r["hits"]]
    sizes = sorted({r["size"] for r in room})
    check(f"{tag}: pinned, each of the {len(room)} covers in front (lifted, {sizes[0]}..{sizes[-1]} px) clear of the panel's controls and details and of the head", room and not hit, hit[:2])
    if zones.get("right-w") != LISTENING["right-w"]:
        # Mid-track, at rest; the Pocket's button not shown yet (no left zone). Then the Pocket's button shows and the
        # guide starts to listen: only the box's style changes.
        await page.evaluate("(zones) => __h.measure(zones)", {**zones, "left-w": 0, "left-h": 0})
        await page.evaluate(FRAMES)
        before = [c["id"] for c in await page.evaluate(CF_COVERS, {"zones": {**zones, "left-w": 0, "left-h": 0}}) if not c["inert"]]
        heard = {**zones, **LISTENING}
        await page.evaluate("(zones) => __h.measure(zones)", heard)
        await page.evaluate(FRAMES)
        zone = await page.evaluate(CONTROLS_IN_ZONES, {"zones": heard, "controls": [".cf-controls", ".cf-panel"], "name": "coverflow"})
        hits = [c for c in zone["each"] if c["zones"]]
        check(f"{tag}: the zones growing while it rests (the Pocket's button, the guide listening): the panel clear and nothing pressable in either ({zone['seen']} pressables in view)", zone["seen"] > 0 and not zone["out"] and not hits, {"out": zone["out"][:3], "panel": hits[:2]})
        grown = await page.evaluate(CF_COVERS, {"zones": heard})
        wrong = [c for c in grown if (c["cut"] or c["inZone"]) and not c["inert"]]
        check(f"{tag}: the zones grown: the covers in them or cut inert ({sum(c['cut'] or c['inZone'] for c in grown)} of {len(grown)} shown)", not wrong, wrong[:3])
        # And back: the covers clear again are pressable again.
        await page.evaluate("(zones) => __h.measure(zones)", {**zones, "left-w": 0, "left-h": 0})
        await page.evaluate(FRAMES)
        after = [c["id"] for c in await page.evaluate(CF_COVERS, {"zones": {**zones, "left-w": 0, "left-h": 0}}) if not c["inert"]]
        check(f"{tag}: the zones going back: the same {len(before)} covers pressable again", after == before and before, {"before": before, "after": after})
        await page.evaluate("(zones) => __h.measure(zones)", zones)
        await page.evaluate(FRAMES)
    # A short page (six services: the flow does not loop, so Next is disabled at the last): a focused cover sent past
    # the clear room by End hands focus to Previous, not to the disabled Next (nor the page's body).
    await page.evaluate("() => { __h.open('coverflow', { limit: 6 }) }")
    await page.evaluate(FRAMES)
    at = await page.evaluate(TRACK_AT, {"track": ".cf-track", "stage": ".cf-stage", "k": 0.1})
    await page.evaluate("(y) => __h.box.scrollTo({ top: y, behavior: 'instant' })", at["y"])
    await page.evaluate(FRAMES)
    lost, gone, tried = [], 0, 0
    for n in (0, 1):
        await page.evaluate("() => __h.current.reveal(__h.itemIds[0])")
        await page.evaluate(FRAMES)
        got = await page.evaluate(CF_FOCUS, {"at": n})
        if got["inertBefore"]:
            continue  # a cover in a zone from the start (the guide listening on a short box) cannot take focus
        tried += 1
        left = got["cover"]["inert"] or got["cover"]["off"]
        gone += bool(left)
        handed = got["inStage"] and not got["stillCover"] and not got["disabled"] and got["focus"] != "body"
        if not (got["had"] and got["windowScroll"] == 0 and (handed if left else got["stillCover"])):
            lost.append((n + 1, got))
    check(f"{tag}: a short page (6 covers, no loop): a focused cover End sends out of the clear room ({gone} of {tried} that could take focus) hands focus to an enabled control of the stage", (gone or not tried) and not lost, lost[:2])
    await page.evaluate("() => { __h.open('coverflow') }")
    await page.evaluate(FRAMES)


PHASE_4B = "phase 4b"


def split_controls(width, height):
    """Split's controls: the counter / previous / next row, and the rail where split.css shows it."""
    short = (width >= 720 and height < 700) or height < 500
    return [".ss-controls"] + ([] if short else [".ss-rail"])


# Split's layers that jumped across the stage (.is-jump: no transition) must slide again two frames later: after a
# jump over every slide and back (reveal(), as the rail, Home/End or a fast scroll do), and after an unmount that
# came mid-jump and a mount again. A pane left with .is-jump snaps instead of sliding from then on.
SPLIT_JUMPS = """async () => {
  const v = __h.current
  // The slides' items (the closing band's promotion is not a slide: reveal() gives false for it, as spotlight's).
  const ids = [...__h.box.querySelectorAll('.ss-text[data-aixc-item]')].map((n) => n.dataset.aixcItem)
  const frames = (n) => new Promise((r) => { const go = (k) => (k ? requestAnimationFrame(() => go(k - 1)) : r()); go(n) })
  const stuck = () => __h.box.querySelectorAll('.aixc-vx--split .is-jump').length
  const out = {}
  // From the first slide (the generic checks may have left the stage on the last, its scroll frame still due).
  v.reveal(ids[0])
  await frames(4)
  v.reveal(ids[ids.length - 1])
  out.during = stuck()
  v.reveal(ids[0])
  await frames(4)
  out.afterJumps = stuck()
  v.reveal(ids[ids.length - 1])
  v.unmount()
  v.mount()
  await frames(4)
  out.afterRemount = stuck()
  v.reveal(ids[0])
  await frames(4)
  __h.box.scrollTo({ top: 0, behavior: 'instant' })
  await frames(2)
  return out
}"""

# On phones: the controls row's top 16 px under the shown slide's title (placeRow()), and nothing pressable between.
SPLIT_ROW_UNDER_TITLE = """() => {
  const box = __h.box
  const row = box.querySelector('.ss-controls').getBoundingClientRect()
  const title = box.querySelector('.ss-text[data-pos="0"] .ss-title').getBoundingClientRect()
  return { gap: Math.round((row.top - title.bottom) * 10) / 10, title: [title.top, title.bottom].map(Math.round), row: [row.top, row.bottom].map(Math.round) }
}"""


# Every slide in turn (pinned at 10 % of the track, transitions off while measuring): no pressable of the shown copy
# under a button of the rail (it is drawn over the copy, so it would take the press).
SPLIT_RAIL_CLEAR = """async (y) => {
  const box = __h.box
  const ids = [...box.querySelectorAll('.ss-text[data-aixc-item]')].map((n) => n.dataset.aixcItem)
  const off = document.createElement('style')
  off.textContent = '.aixc-vx--split, .aixc-vx--split * { transition: none !important }'
  document.head.append(off)
  box.scrollTo({ top: y, behavior: 'instant' })
  const meets = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
  const rect = (r) => [r.left, r.top, r.right, r.bottom].map(Math.round)
  const hits = []
  let seen = 0
  for (const id of ids) {
    __h.current.reveal(id)
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    const rails = [...box.querySelectorAll('.ss-rail__group')].filter((b) => b.getClientRects().length).map((b) => b.getBoundingClientRect())
    for (const el of box.querySelectorAll('.ss-text[data-pos="0"] :is(button, a[href])')) {
      const r = el.getBoundingClientRect()
      if (!r.width || !r.height) continue
      seen += 1
      const under = rails.find((b) => meets(r, b))
      if (under) hits.push({ id, label: (el.getAttribute('aria-label') || el.textContent).trim().slice(0, 30), rect: rect(r), rail: rect(under) })
    }
  }
  __h.current.reveal(ids[0])
  off.remove()
  box.scrollTo({ top: 0, behavior: 'instant' })
  return { seen, hits }
}"""


async def split_extra(page, tag, zones, layout):
    """Split's own checks in the box: its jumps clear; where the rail shows, no action of the copy under it; on
    phones its row stays under the title while the zones change under it (the guide starting and stopping
    listening moves the copy's bottom, not the stage)."""
    jumps = await page.evaluate(SPLIT_JUMPS)
    check(f"{tag}: layers that jumped across the stage slide again (no .is-jump two frames after a long jump and back, or after an unmount mid-jump)", jumps["during"] > 0 and jumps["afterJumps"] == 0 and jumps["afterRemount"] == 0, jumps)
    width, height = await page.evaluate("() => [innerWidth, innerHeight]")
    if ".ss-rail" in split_controls(width, height):
        at = await page.evaluate(TRACK_AT, {"track": ".ss-track", "stage": ".ss-stage", "k": 0.1})
        clear = await page.evaluate(SPLIT_RAIL_CLEAR, at["y"])
        await page.evaluate(FRAMES)
        check(f"{tag}: no action of any slide's copy under the rail ({clear['seen']} over every slide)", clear["seen"] > 0 and not clear["hits"], clear["hits"][:3])
    if not (width < 720 and height >= 500):
        return
    await page.evaluate("(y) => __h.box.scrollTo({ top: y, behavior: 'instant' })", (await page.evaluate(TRACK_AT, {"track": ".ss-track", "stage": ".ss-stage", "k": 0.1}))["y"])
    await page.evaluate(FRAMES)
    seen = {"quiet": await page.evaluate(SPLIT_ROW_UNDER_TITLE)}
    await page.evaluate("(z) => __h.measure(z)", {**zones, **LISTENING})
    await page.evaluate(FRAMES)
    await page.evaluate(FRAMES)
    seen["listening"] = await page.evaluate(SPLIT_ROW_UNDER_TITLE)
    # The next slide while listening, then the guide stops.
    await page.evaluate("() => __h.current.reveal(__h.box.querySelectorAll('.ss-text[data-aixc-item]')[1].dataset.aixcItem)")
    await page.wait_for_timeout(1500)
    seen["next, listening"] = await page.evaluate(SPLIT_ROW_UNDER_TITLE)
    await page.evaluate("(z) => __h.measure(z)", zones)
    await page.evaluate(FRAMES)
    await page.evaluate(FRAMES)
    seen["stopped"] = await page.evaluate(SPLIT_ROW_UNDER_TITLE)
    check(f"{tag}: the row stays 16 px under the title as the guide starts and stops listening", all(abs(s["gap"] - 16) <= 1 for s in seen.values()), seen)
    await page.evaluate("() => { __h.current.reveal(__h.itemIds[0]); __h.box.scrollTo({ top: 0, behavior: 'instant' }) }")
    await page.wait_for_timeout(1200)


# Split's rail in a 700 px tall window (the shortest that shows it from 720 px): its top never above the stage's,
# quiet or with the guide listening (its 305 px no longer fits above the listening zone there); quiet, it ends above
# both zones (16 px).
SPLIT_RAIL = """() => {
  const box = __h.box
  const s = box.querySelector('.ss-stage').getBoundingClientRect()
  const u = box.querySelector('.ss-rail ul').getBoundingClientRect()
  const style = getComputedStyle(box)
  const safe = Math.max(parseFloat(style.getPropertyValue('--aixc-safe-right-h')), parseFloat(style.getPropertyValue('--aixc-safe-left-h')))
  return { top: Math.round(u.top - s.top), bottom: Math.round(u.bottom - s.top), height: Math.round(u.height), room: Math.round(s.height), aboveZones: Math.round(s.bottom - safe - 16 - u.bottom) }
}"""


async def split_after(browser, langs):
    for lang in langs:
        for listening in (False, True):
            width, height = 1366, 700
            zones = {**ZONES[(width, height)], **(LISTENING if listening else {})}
            tag = f"split {lang} {width}x{height}{' listening' if listening else ''}"
            context, page = await open_harness(browser, width, height, lang, zones, "no-preference")
            await page.evaluate("async () => { await __h.load('split'); __h.open('split') }")
            await page.evaluate("document.fonts.ready")
            at = await page.evaluate(TRACK_AT, {"track": ".ss-track", "stage": ".ss-stage", "k": 0.5})
            await page.evaluate("(y) => __h.box.scrollTo({ top: y, behavior: 'instant' })", at["y"])
            await page.wait_for_timeout(1200)
            rail = await page.evaluate(SPLIT_RAIL)
            check(f"{tag}: the rail's top inside the stage ({rail['top']} px down)", rail["top"] >= -1, rail)
            if not listening:
                check(f"{tag}: the rail ends above both zones, 16 px clear ({rail['aboveZones']} px)", rail["aboveZones"] >= -1, rail)
            check(f"{tag}: no page errors", page.errors == [], page.errors)
            await context.close()


# The ring's room (pinned, settled on a service): its unit (--u, 1 % of the front service's 50-unit box); the front
# service's box against the head's and the foot's shown parts and the stage's top; and the services fence() made
# inert though they are inside the stage's sides and clear of both zones (the zones as the box's --aixc-safe-*
# give them, as the generic checks draw them).
RING_ROOM = """(zones) => {
  const box = __h.box
  const stage = box.querySelector('.rg-stage')
  const s = stage.getBoundingClientRect()
  const u = parseFloat(getComputedStyle(stage).getPropertyValue('--u'))
  const front = box.querySelector('.rg-item.is-front').getBoundingClientRect()
  const meets = (a, b) => a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1
  const rect = (r) => [r.left, r.top, r.right, r.bottom].map(Math.round)
  const parts = ['.rg-head__brand', '.rg-head__group', '.rg-counter', '.rg-nav', '.rg-detail__desc', '.rg-detail__actions']
  const hits = parts.flatMap((sel) => [...box.querySelectorAll(`.rg-stage ${sel}`)].filter((el) => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden').map((el) => [sel, el.getBoundingClientRect()]).filter(([, r]) => r.width && r.height && meets(front, r)).map(([sel, r]) => ({ part: sel, rect: rect(r) })))
  const zoneRects = """ + ZONE_RECTS + """
  const wrongly = [...box.querySelectorAll('.rg-item')].filter((el) => el.inert && !el.classList.contains('is-off')).map((el) => [el, el.getBoundingClientRect()]).filter(([, r]) => r.left >= s.left - 1 && r.right <= s.right + 1 && !zoneRects.some(([, z]) => r.left < z.right && r.right > z.left && r.bottom > z.top && r.top < z.bottom)).map(([el, r]) => ({ item: el.dataset.aixcItem, rect: rect(r) }))
  return { u, front: rect(front), stageTop: Math.round(s.top), hits, wrongly }
}"""

# A fast turn (the box scrolled from 10 % of the track to 90 % at once), frame by frame for 40 frames: the ring's own
# box (where it clips its services in a short box) against its place untransformed, and the largest stretch drawn
# on the ring or its wheel.
RING_FAST_TURN = """async ({ from, to }) => {
  const box = __h.box
  const ring = box.querySelector('.rg-ring')
  const wheel = box.querySelector('.rg-wheel')
  const frame = () => new Promise((r) => requestAnimationFrame(r))
  const scaleOf = (el) => { const m = getComputedStyle(el).transform; return m === 'none' ? 1 : new DOMMatrixReadOnly(m).a }
  box.scrollTo({ top: from, behavior: 'instant' })
  for (let k = 0; k < 60; k += 1) await frame()
  box.scrollTo({ top: to, behavior: 'instant' })
  let wider = 0
  let stretch = 1
  for (let k = 0; k < 40; k += 1) {
    await frame()
    wider = Math.max(wider, ring.getBoundingClientRect().width - ring.offsetWidth)
    stretch = Math.max(stretch, scaleOf(ring), scaleOf(wheel))
  }
  return { clips: getComputedStyle(ring).overflowX === 'clip', wider: Math.round(wider * 10) / 10, stretch: Math.round(stretch * 1000) / 1000 }
}"""

# Every service in turn (pinned, its copy's entrance animations off while measuring): the foot's pressables (the row
# and the service's actions) against both zones and the stage's bottom, and the front service against the foot's
# shown parts. The copy differs by service (a longer link, a group's extra links), so one settled service is not
# enough.
RING_EVERY_FOOT = """async (zones) => {
  const box = __h.box
  const stage = box.querySelector('.rg-stage')
  const off = document.createElement('style')
  off.textContent = '.aixc-vx--ring, .aixc-vx--ring * { animation: none !important; transition: none !important }'
  document.head.append(off)
  const zoneRects = """ + ZONE_RECTS + """
  const meets = (a, b) => a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1
  const rect = (r) => [r.left, r.top, r.right, r.bottom].map(Math.round)
  const ids = [...box.querySelectorAll('.rg-item')].map((n) => n.dataset.aixcItem)
  const hits = []
  let seen = 0
  for (const id of ids) {
    __h.current.reveal(id)
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    const s = stage.getBoundingClientRect()
    const front = box.querySelector('.rg-item.is-front').getBoundingClientRect()
    for (const el of box.querySelectorAll('.rg-foot :is(button, a[href]), .rg-foot .rg-detail__desc, .rg-foot .rg-counter')) {
      const r = el.getBoundingClientRect()
      if (!r.width || !r.height || getComputedStyle(el).display === 'none') continue
      seen += 1
      const label = (el.getAttribute('aria-label') || el.textContent).trim().slice(0, 30)
      const pressable = el.matches('button, a[href]')
      if (pressable) for (const [zone, z] of zoneRects) if (meets(r, z)) hits.push({ id, label, zone, rect: rect(r) })
      if (r.bottom > s.bottom + 1) hits.push({ id, label, past: 'the stage\\'s bottom', rect: rect(r) })
      if (meets(front, r)) hits.push({ id, label, under: 'the front service', rect: rect(r), front: rect(front) })
    }
  }
  __h.current.reveal(ids[0])
  off.remove()
  return { services: ids.length, seen, hits }
}"""

# The ring's unit at least this (px): its front service 100 px across, its titles legible.
RING_MIN_U = 2


async def ring_extra(page, tag, zones, layout):
    """Ring's own checks in the box: settled mid-track, the ring keeps a room of its own (its unit at least
    RING_MIN_U, the front service clear of the head, the foot and the stage's top) and fence() leaves pressable every
    service inside the stage's sides and clear of both zones; where the ring clips its column (a short box), a fast
    turn's stretch stays inside the column."""
    at = await page.evaluate(TRACK_AT, {"track": ".rg-track", "stage": ".rg-stage", "k": 0.5})
    await page.evaluate("(y) => __h.box.scrollTo({ top: y, behavior: 'instant' })", at["y"])
    await page.wait_for_timeout(1500)
    room = await page.evaluate(RING_ROOM, zones)
    check(f"{tag}: the ring keeps its room: unit {room['u']} px (at least {RING_MIN_U}), the front service clear of the head, the foot and the stage's top", room["u"] >= RING_MIN_U and not room["hits"] and room["front"][1] >= room["stageTop"] - 1, room)
    check(f"{tag}: no service inside the stage's sides and clear of both zones is inert", not room["wrongly"], room["wrongly"][:3])
    every = await page.evaluate(RING_EVERY_FOOT, zones)
    check(f"{tag}: every service's foot ({every['services']} services, {every['seen']} parts): its pressables clear of both zones, inside the stage, none under the front service", every["seen"] > 0 and not every["hits"], every["hits"][:4])
    await page.evaluate("(y) => __h.box.scrollTo({ top: y, behavior: 'instant' })", at["y"])
    await page.wait_for_timeout(600)
    far = await page.evaluate(TRACK_AT, {"track": ".rg-track", "stage": ".rg-stage", "k": 0.9})
    near = await page.evaluate(TRACK_AT, {"track": ".rg-track", "stage": ".rg-stage", "k": 0.1})
    turn = await page.evaluate(RING_FAST_TURN, {"from": near["y"], "to": far["y"]})
    if turn["clips"]:
        check(f"{tag}: a fast turn (stretch {turn['stretch']}) never widens the ring's clipped column ({turn['wider']} px)", turn["stretch"] > 1.05 and turn["wider"] <= 0.5, turn)
    await page.evaluate("() => __h.box.scrollTo({ top: 0, behavior: 'instant' })")
    await page.wait_for_timeout(1200)

# reveal(id) on the gallery: what it returns, and the piece's state a frame later (its walk is instant: the box's
# scroll jumps there). A piece in a zone (the guide listening) is inert by design: inZone says so.
GALLERY_REVEAL = """async ({ id, zones }) => {
  const box = __h.box
  const back = __h.current.reveal(id)
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  const piece = [...box.querySelectorAll('.gl-piece')].find((p) => p.dataset.aixcItem === id)
  const r = piece ? piece.getBoundingClientRect() : null
  const b = box.getBoundingClientRect()
  const zoneRects = """ + ZONE_RECTS + """
  const inZone = !!r && zoneRects.some(([, z]) => r.left < z.right && r.right > z.left && r.top < z.bottom && r.bottom > z.top)
  const inView = !!r && r.top >= b.top + 57 - 1 && r.bottom <= b.bottom + 1 && r.left >= b.left - 1 && r.right <= b.right + 1
  return { back, active: !!piece && piece.classList.contains('is-active'), inert: !piece || piece.inert, inZone, inView, counter: box.querySelector('.gl-counter').textContent.trim().slice(0, 2), windowScroll: scrollY }
}"""

# On phones: the row's top under the stage's title (its intro's; the stage's top on a short phone, where the title
# gives way), and nothing of the caption under the row.
GALLERY_ROW = """() => {
  const box = __h.box
  const rect = (n) => { const r = n.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom } }
  const row = rect(box.querySelector('.gl-controls'))
  const brand = box.querySelector('.gl-intro__brand')
  const title = brand.getClientRects().length ? rect(brand) : { ...rect(box.querySelector('.gl-stage')), bottom: rect(box.querySelector('.gl-stage')).top }
  const meets = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
  const over = [...box.querySelectorAll('.gl-caption > *')].filter((n) => n.getClientRects().length && meets(rect(n), row)).map((n) => n.className)
  return { gap: Math.round(row.top - title.bottom), over }
}"""


# Every piece shown in turn (its moves off, so each is measured where it rests): how much of the shown piece the
# caption and the row hide, the caption's top under the stage's (never under the bar), its gap under the stage's intro (title and hint) when it is shown, and the
# progress bar's length when it is shown (the review, 2026-11-18: short phones, the short box while listening), and
# the shown pieces that are inert (in a zone or past the box's sides).
GALLERY_COVER = """async () => {
  const box = __h.box
  const off = document.createElement('style')
  off.textContent = '.aixc-vx--gallery, .aixc-vx--gallery * { animation: none !important; transition: none !important }'
  document.head.append(off)
  const q = (s) => box.querySelector(s)
  const meet = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top))
  const shown = (n) => !!n && n.getClientRects().length > 0
  let cover = 0, coverAt = 0, gap = null, gapAt = 0, bar = null, top = null, topAt = 0
  const inert = []
  for (const [at, id] of __h.itemIds.entries()) {
    __h.current.reveal(id)
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    const shownPiece = q('.gl-piece.is-active')
    if (shownPiece.inert) inert.push(at + 1)
    const a = shownPiece.getBoundingClientRect()
    const c = q('.gl-caption').getBoundingClientRect()
    const hidden = (meet(a, c) + meet(a, q('.gl-controls').getBoundingClientRect())) / (a.width * a.height)
    if (hidden > cover) { cover = hidden; coverAt = at + 1 }
    const t = Math.round(c.top - q('.gl-stage').getBoundingClientRect().top)
    if (top === null || t < top) { top = t; topAt = at + 1 }
    if (shown(q('.gl-intro'))) {
      const g = Math.round(c.top - q('.gl-intro').getBoundingClientRect().bottom)
      if (gap === null || g < gap) { gap = g; gapAt = at + 1 }
    }
    const p = q('.gl-progress')
    if (shown(p)) bar = Math.min(bar ?? Infinity, Math.round(p.getBoundingClientRect().width))
  }
  off.remove()
  return { cover: Math.round(cover * 100) / 100, coverAt, gap, gapAt, bar, top, topAt, inert }
}"""


# The stand-in header as tall as Vodafone's (its 120 px with its 61 px bar put the stage 24 px lower than the
# harness's 100 + 57), the box shorter by as much: the caption's tiers follow the box's room, not the window's.
GALLERY_HEADER = """async (h) => {
  const box = __h.box
  document.getElementById('header').style.height = `${h}px`
  box.style.setProperty('--aixc-box-h', `${innerHeight - h}px`)
  box.style.setProperty('--aixc-pin-y', `${box.getBoundingClientRect().top + 57}px`)
  dispatchEvent(new Event('resize'))
  await new Promise((r) => setTimeout(r, 300))
}"""


async def gallery_extra(page, tag, zones, layout):
    """The gallery's own checks: reveal(itemId) walks to its piece, which is the shown one, in the box's view and
    pressable (inert only in a zone), and false for an id it has not; on phones the row under the stage's title,
    clear of the caption."""
    ids = await page.evaluate("() => [...__h.box.querySelectorAll('.gl-piece')].map((p) => p.dataset.aixcItem)")
    absent = await page.evaluate("() => __h.current.reveal('no-such-item')")
    check(f"{tag}: reveal() of an id it has not returns false", absent is False, absent)
    picks = sorted({0, len(ids) // 2, len(ids) - 1})
    bad = []
    for at in picks:
        got = await page.evaluate(GALLERY_REVEAL, {"id": ids[at], "zones": zones})
        if not (got["back"] is True and got["active"] and got["inView"] and (not got["inert"] or got["inZone"]) and got["counter"] == f"{at + 1:02d}" and got["windowScroll"] == 0):
            bad.append((at + 1, got))
    check(f"{tag}: reveal() of pieces {', '.join(f'{a + 1:02d}' for a in picks)} returns true, the piece shown, in the box's view and pressable (inert only in a zone), the window still", not bad, bad[:3])
    seen = await page.evaluate(GALLERY_COVER)
    check(f"{tag}: every piece shown in turn: at most a quarter of it under the caption and the row ({seen['cover']} of piece {seen['coverAt']:02d})", seen["cover"] <= 0.25, seen)
    check(f"{tag}: every piece shown in turn: the caption's top within the stage ({seen['top']} px under it, piece {seen['topAt']:02d})", seen["top"] is not None and seen["top"] >= 0, seen)
    if seen["bar"] is not None:
        check(f"{tag}: the progress bar, where it is shown, at least 48 px long ({seen['bar']} px)", seen["bar"] >= 48, seen)
    if zones.get("right-w") != LISTENING["right-w"]:
        # Quiet, the shown piece is never in a corner's zone nor past the box's sides (the live page's 1024x768 put a
        # wide one into the right zone once, 2026-11-18); while the guide listens it may hang in the bar's zone.
        check(f"{tag}: every piece shown in turn, quiet: the shown piece pressable ({len(seen['inert'])} inert)", not seen["inert"], seen["inert"][:6])
    if seen["gap"] is not None and zones.get("right-w") != LISTENING["right-w"]:
        # Quiet only: while the guide listens in Arabic the caption's side is the transcript bar's, and the caption
        # lifted over the bar may meet the intro for as long as it listens (a gap the report keeps, 2026-11-18).
        check(f"{tag}: the caption under the stage's intro, every piece ({seen['gap']} px, piece {seen['gapAt']:02d})", seen["gap"] >= 0, seen)
    # Vodafone's desktop header (a window from 600 px tall; in a phone's landscape its header is 80 px, lower than
    # the harness's), quiet.
    if layout != "phone" and zones.get("right-w") != LISTENING["right-w"] and await page.evaluate("innerHeight") >= 600:
        await page.evaluate(GALLERY_HEADER, 124)
        tall = await page.evaluate(GALLERY_COVER)
        await page.evaluate(GALLERY_HEADER, 100)
        check(f"{tag}: under a header as tall as Vodafone's (124 px): the caption within the stage and under its intro ({tall['gap']} px), at most a quarter of the piece under it ({tall['cover']}), the shown piece pressable ({len(tall['inert'])} inert)", tall["top"] >= 0 and (tall["gap"] is None or tall["gap"] >= 0) and tall["cover"] <= 0.25 and not tall["inert"], tall)
    if layout == "phone":
        row = await page.evaluate(GALLERY_ROW)
        check(f"{tag}: the row under the stage's title ({row['gap']} px), clear of the caption", row["gap"] >= 0 and not row["over"], row)
    await page.evaluate("() => { __h.current.reveal(__h.itemIds[0]); __h.box.scrollTo({ top: 0, behavior: 'instant' }) }")
    await page.evaluate(FRAMES)


# Journey: one item revealed (its top at the pin line, or the box at its end), in the box's view, pressable, the window
# still; the scene's progress (--p) at the box's top and end; the closing band's links pressable at the box's end.
JOURNEY_REVEAL = """async ({ id, zones }) => {
  const box = __h.box
  const back = __h.current.reveal(id)
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  const b = box.getBoundingClientRect()
  const top = b.top + box.clientTop + 57
  const bottom = b.top + box.clientTop + box.clientHeight
  const n = [...box.querySelectorAll('[data-aixc-item]')].find((x) => x.dataset.aixcItem === id)
  const r = n.getBoundingClientRect()
  const atEnd = box.scrollTop >= box.scrollHeight - box.clientHeight - 1
  // In view: its top under the bar, and its bottom too when it fits the room. Pressable: not inert, and each of its
  // links that takes no pointer events in a corner's zone (a card taller than the room clear of the zones: its
  // links further down reached by scrolling on).
  const zoneRects = """ + ZONE_RECTS + """
  const inZone = (q) => zoneRects.some(([, z]) => q.left < z.right && q.right > z.left && q.top < z.bottom && q.bottom > z.top)
  const off = [...n.querySelectorAll('a[href], button')].filter((l) => getComputedStyle(l).pointerEvents === 'none' && !inZone(l.getBoundingClientRect()))
  const fits = r.height <= bottom - top + 1
  return { back, top: Math.round(r.top - top), atEnd, fits, inView: r.top >= top - 1 && r.top < bottom && (!fits || r.bottom <= bottom + 1), inert: !!n.closest('[inert]') || off.length > 0, windowScroll: scrollY }
}"""

# The intro's title (the view's one h1), its text and its hint at the box's top, clear of both zones: the opening
# screen's words never under a corner's control (journey.css: the space under the intro at least the taller zone; in
# the short box the intro steps in from both sides). Not
# pressable, so the generic zone checks do not read them.
JOURNEY_INTRO = """({ zones }) => {
  const box = __h.box
  const zoneRects = """ + ZONE_RECTS + """
  const meets = (r, z) => r.left < z.right && r.right > z.left && r.top < z.bottom && r.bottom > z.top
  return ['.jr-intro__title', '.jr-intro__text', '.jr-intro__hint span'].map((sel) => {
    const n = box.querySelector(sel)
    const r = n ? n.getBoundingClientRect() : null
    return { sel, shown: !!r && r.height > 0, zones: r ? zoneRects.filter(([, z]) => meets(r, z)).map(([name]) => name) : [], rect: r ? [r.left, r.top, r.right, r.bottom].map(Math.round) : null }
  })
}"""

# The focused link's state after focus() and two frames' wait: active, pressable (pointer events) and clear of every
# zone. A zone as tall as the room under the bar (the guide's transcript bar in a phone's landscape box) leaves no
# place clear of it: there the link is scrolled as high as it goes, its top at the bar (noRoom).
JOURNEY_FOCUS_STATE = """
  const focusState = (link) => {
    const r = link.getBoundingClientRect()
    const b2 = box.getBoundingClientRect()
    const barBottom = b2.top + box.clientTop + 57
    const met = zoneRects.filter(([, z]) => meets(r, z))
    const noRoom = met.length > 0 && met.every(([, z]) => z.top <= barBottom + r.height + 16) && Math.abs(r.top - barBottom) <= 1
    return { what: link.textContent.trim().slice(0, 24), active: document.activeElement === link, inert: !!link.closest('[inert]') || (!noRoom && getComputedStyle(link).pointerEvents === 'none'), zones: noRoom ? [] : met.map(([name]) => name), noRoom, rect: [r.left, r.top, r.right, r.bottom].map(Math.round) }
  }"""

# A pressable of the story focused from just under the box's view (as Tab reaches it from above): it keeps the focus
# and ends pressable and clear of both zones. The browser's own focus scroll brings it into the view first (where it
# lands depends on the link and the room), so this case alone does not show journey.js clearFocus() for every link;
# JOURNEY_FOCUS_UNDER sets up the case only clearFocus() handles.
JOURNEY_FOCUS = """async ({ zones }) => {
  const box = __h.box
  const frames = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  const zoneRects = """ + ZONE_RECTS + """
  const meets = (r, z) => r.left < z.right && r.right > z.left && r.top < z.bottom && r.bottom > z.top""" + JOURNEY_FOCUS_STATE + """
  const links = [...box.querySelectorAll('.jr-story :is(a[href], button)')]
  const out = []
  for (const link of [links[0], links[Math.floor(links.length / 2)], links[links.length - 1]]) {
    const b = box.getBoundingClientRect()
    box.scrollTop += link.getBoundingClientRect().top - (b.top + box.clientTop + box.clientHeight) + 4
    await frames()
    link.focus()
    await frames()
    await frames()
    out.push(focusState(link))
    link.blur()
  }
  return { out, windowScroll: scrollY }
}"""

# The clearFocus() path: a story link fully in the box's view but lying inside a corner's zone (it takes jr-under
# there), as Tab reaches it from a visible link before it. focus() does not scroll a visible element, so only
# journey.js clearFocus() moves it: it keeps the focus and ends pressable and clear of every zone (noRoom aside).
# The first, a middle and the last of the links that one zone's width meets and its height holds.
JOURNEY_FOCUS_UNDER = """async ({ zones }) => {
  const box = __h.box
  const frames = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  const zoneRects = """ + ZONE_RECTS + """
  const meets = (r, z) => r.left < z.right && r.right > z.left && r.top < z.bottom && r.bottom > z.top""" + JOURNEY_FOCUS_STATE + """
  const view = () => { const b = box.getBoundingClientRect(); return { top: b.top + box.clientTop + 57, bottom: b.top + box.clientTop + box.clientHeight } }
  const fitting = []
  for (const link of box.querySelectorAll('.jr-story :is(a[href], button)')) {
    const r = link.getBoundingClientRect()
    // The part of a zone in the box's view under the bar (the listening zone in a landscape phone's box reaches
    // above the bar).
    const z = zoneRects.map(([, q]) => ({ ...q, top: Math.max(q.top, view().top), bottom: Math.min(q.bottom, view().bottom) })).find((q) => r.left < q.right && r.right > q.left && r.height + 8 <= q.bottom - q.top)
    if (z) fitting.push([link, z])
  }
  const out = []
  const picked = [...new Set([0, Math.floor(fitting.length / 2), fitting.length - 1])].filter((i) => fitting[i])
  for (const [link, z] of picked.map((i) => fitting[i])) {
    box.scrollTop += link.getBoundingClientRect().top - (z.top + 4)
    await frames()
    await frames()
    const r = link.getBoundingClientRect()
    const v = view()
    const set = { inZone: r.top >= z.top - 1 && r.bottom <= z.bottom + 1, visible: r.top >= v.top - 1 && r.bottom <= v.bottom + 1, under: link.classList.contains('jr-under'), scrollBefore: box.scrollTop }
    link.focus()
    await frames()
    await frames()
    out.push({ ...focusState(link), ...set, moved: box.scrollTop !== set.scrollBefore })
    link.blur()
  }
  return { out, fitting: fitting.length, windowScroll: scrollY }
}"""


async def journey_extra(page, tag, zones, layout):
    """Journey's own checks: its h1 (the model's title) the one shown; the intro's words clear of both zones;
    reveal(itemId) brings the item into the box's view, pressable; the scene's progress follows the box's scroll;
    at the box's end the closing band pressable; a story link focused from under the box's view, and one focused
    in view but inside a zone (clearFocus()), keeps the focus and ends clear of both zones."""
    h1 = await page.evaluate("() => [...__h.box.querySelectorAll('h1')].map((n) => n.className + ':' + n.textContent.trim().length)")
    check(f"{tag}: its own h1 (.jr-intro__title, named) the view's one", len(h1) == 1 and h1[0].startswith("jr-intro__title:") and not h1[0].endswith(":0"), h1)
    # The opening screen's words clear of both corners, the guide listening too (2026-11-18 review: in the short box
    # the Arabic title and hint under the mic, the English text and hint under the Pocket's button).
    intro = await page.evaluate(JOURNEY_INTRO, {"zones": zones})
    bad = [i for i in intro if (not i["shown"] and i["sel"] != ".jr-intro__text") or i["zones"]]
    check(f"{tag}: at the box's top the intro's title, text and hint clear of both zones", not bad, bad)
    absent = await page.evaluate("() => __h.current.reveal('no-such-item')")
    check(f"{tag}: reveal() of an id it has not returns false", absent is False, absent)
    ids = await page.evaluate("() => __h.itemIds")
    bad = []
    for at in sorted({0, len(ids) // 2, len(ids) - 1}):
        got = await page.evaluate(JOURNEY_REVEAL, {"id": ids[at], "zones": zones})
        if not (got["back"] is True and (abs(got["top"]) <= 1 or got["atEnd"]) and got["inView"] and not got["inert"] and got["windowScroll"] == 0):
            bad.append((at + 1, got))
    check(f"{tag}: reveal() of the first, a middle and the last item returns true, its top at the pin line (or the box at its end), in the box's view and pressable (no pointer events only in a zone), the window still", not bad, bad[:3])
    progress = await page.evaluate("""async () => {
      const box = __h.box
      const frames = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
      const p = () => Number(getComputedStyle(box.querySelector('.aixc-vx--journey')).getPropertyValue('--p'))
      box.scrollTo({ top: 0, behavior: 'instant' })
      await frames()
      const top = p()
      box.scrollTo({ top: box.scrollHeight, behavior: 'instant' })
      await frames()
      const end = p()
      const band = [...box.querySelectorAll('.aixc-vx--journey .vx-closing :is(a[href], button)')].map((n) => !!n.closest('[inert]') || getComputedStyle(n).pointerEvents === 'none')
      return { top, end, band }
    }""")
    check(f"{tag}: the scene's progress follows the box's scroll ({progress['top']} at its top, {progress['end']} at its end)", progress["top"] <= 0.01 and progress["end"] >= 0.99, progress)
    check(f"{tag}: at the box's end the closing band's links pressable ({len(progress['band'])})", progress["band"] and not any(progress["band"]), progress["band"])
    focus = await page.evaluate(JOURNEY_FOCUS, {"zones": zones})
    bad = [f for f in focus["out"] if not f["active"] or f["inert"] or f["zones"]]
    check(f"{tag}: a story link focused from under the box's view (the browser's focus scroll brings it in) keeps the focus, ends pressable and clear of both zones (first, middle, last)", not bad and focus["windowScroll"] == 0, bad[:3] or focus)
    under = await page.evaluate(JOURNEY_FOCUS_UNDER, {"zones": zones})
    bad = [f for f in under["out"] if not (f["inZone"] and f["visible"] and f["under"]) or not f["active"] or f["inert"] or f["zones"]]
    check(f"{tag}: a story link in the box's view but inside a corner's zone (jr-under there) focused: clearFocus() moves it clear of both zones, it keeps the focus, pressable ({len(under['out'])} of {under['fitting']} that a zone holds)", under["out"] and not bad and under["windowScroll"] == 0, bad[:3] or under)
    await page.evaluate("() => __h.box.scrollTo({ top: 0, behavior: 'instant' })")
    await page.evaluate(FRAMES)
# The cube's sweep: the box scrolled from its top to its end in `step` px, a couple of frames at each place; there,
# everything of the cube that can be pressed (not inert) and shows in the box, the zones it meets, and which of them
# could be pressed at some place (every one: cube.js fence() makes a link inert only while it is in a zone). A card's
# stretched title link is pressed over the whole card while its ::after shows (fence() turns that off in a zone).
CUBE_SWEEP = """async ({ zones, step }) => {
  const box = __h.box
  const root = box.querySelector('.aixc-vx--cube')
  const zoneRects = """ + ZONE_RECTS + """
  const meets = (r, z) => r.left < z.right && r.right > z.left && r.top < z.bottom && r.bottom > z.top
  const frames = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  const b = box.getBoundingClientRect()
  const nodes = [...root.querySelectorAll('a[href], button')]
  const reached = new Set()
  const hits = []
  let places = 0
  const end = box.scrollHeight - box.clientHeight
  for (let y = 0; ; y = Math.min(end, y + step)) {
    box.scrollTo({ top: y, behavior: 'instant' })
    await frames()
    places += 1
    nodes.forEach((el, at) => {
      const style = getComputedStyle(el)
      // A card's stretched title link presses over the whole card (its ::after) unless fence() has turned that off.
      const card = el.matches('.vx-story-link') ? el.closest('.vx-has-story-link') : null
      const r = (card && getComputedStyle(el, '::after').content !== 'none' ? card : el).getBoundingClientRect()
      if (el.closest('[inert]') || !r.width || !r.height || style.visibility === 'hidden') return
      if (r.bottom <= b.top + 57 || r.top >= b.bottom) return
      reached.add(at)
      for (const [zone, z] of zoneRects) if (meets(r, z)) hits.push({ y, zone, label: (el.getAttribute('aria-label') || el.textContent).trim().slice(0, 30), rect: [r.left, r.top, r.right, r.bottom].map(Math.round) })
    })
    if (y >= end) break
  }
  box.scrollTo({ top: 0, behavior: 'instant' })
  await frames()
  const never = nodes.filter((_, at) => !reached.has(at)).map((el) => (el.getAttribute('aria-label') || el.textContent).trim().slice(0, 30))
  return { places, nodes: nodes.length, hits: hits.slice(0, 5), hitCount: hits.length, never, windowScroll: scrollY }
}"""

# Where the press on a dot lands: the box's scroll, the window's, the block's heading in the box's view under the
# bar (and under the dots' row where it floats over the sheets), the dot marked current.
CUBE_DOT_AT = """({ at }) => {
  const box = __h.box
  const b = box.getBoundingClientRect()
  const nav = box.querySelector('.cb-dots')
  const dot = box.querySelectorAll('.cb-dot')[at]
  const block = box.querySelectorAll('.cb-story > *')[at]
  const heading = block.querySelector('h1, h2')
  const r = heading.getBoundingClientRect()
  const n = nav.getBoundingClientRect()
  const floats = nav.classList.contains('is-row') && innerWidth < 900
  const top = Math.max(b.top + 57, floats ? n.bottom : 0)
  return { box: Math.round(box.scrollTop), windowScroll: scrollY, inView: r.top >= top - 1 && r.bottom <= b.bottom + 1, heading: [r.top, r.bottom].map(Math.round), view: [Math.round(top), Math.round(b.bottom)], current: dot.getAttribute('aria-current') === 'true' }
}"""

# reveal(id) on the cube: what it returns; then (a scroll later) the card in the box's view: whole under the bar and
# the dots' row where it fits there; else whole under the bar where it fits the room (the row over its top); else its
# top under the row; and a press at the middle of what shows of it reaching it (nothing over it: the row, a sheet).
CUBE_REVEALED = """({ id }) => {
  const box = __h.box
  const b = box.getBoundingClientRect()
  const nav = box.querySelector('.cb-dots')
  const card = [...box.querySelectorAll('[data-aixc-item]')].find((n) => n.dataset.aixcItem === id)
  const r = card.getBoundingClientRect()
  const n = nav.getBoundingClientRect()
  const pin = b.top + 57
  const under = Math.max(pin, nav.classList.contains('is-row') && innerWidth < 900 ? n.bottom : 0)
  const whole = (top) => r.top >= top - 1 && r.bottom <= b.bottom + 1
  const inView = r.height <= b.bottom - under ? whole(under) : r.height <= b.bottom - pin ? whole(pin) : r.top >= under - 1
  const hit = document.elementFromPoint(r.left + r.width / 2, (Math.max(r.top, under) + Math.min(r.bottom, b.bottom)) / 2)
  return { top: Math.round(r.top), bottom: Math.round(r.bottom), view: [Math.round(pin), Math.round(under), Math.round(b.bottom)], inView, reaches: !!hit && card.contains(hit), windowScroll: scrollY }
}"""


# The cube's dots as they are: a row or a column, how many, the room beside the column (the box's room less the zone
# of the corner on the dots' side less 16 px above and below), in the layout; the row's rectangle against the HUD's
# (side by side or the HUD under it, never over each other) and a press at each dot's centre reaching it.
CUBE_DOTS = """() => {
  const box = __h.box
  const nav = box.querySelector('.cb-dots')
  const side = document.documentElement.dir === 'rtl' ? 'right' : 'left'
  const z = parseFloat(getComputedStyle(box).getPropertyValue(`--aixc-safe-${side}-h`)) || 0
  const d = nav.getBoundingClientRect()
  const h = box.querySelector('.cb-hud').getBoundingClientRect()
  const missed = [...nav.querySelectorAll('.cb-dot')].map((dot, at) => {
    const r = dot.getBoundingClientRect()
    const hit = document.elementFromPoint(r.left + Math.min(r.width / 2, 14), r.top + r.height / 2)
    return !!hit && dot.contains(hit) ? -1 : at
  }).filter((at) => at >= 0)
  return {
    row: nav.classList.contains('is-row'), count: box.querySelectorAll('.cb-dot').length, room: Math.round(box.clientHeight - 57 - z - 32),
    inLayout: nav.parentElement.classList.contains('cb-layout'),
    clearOfHud: d.right <= h.left || d.left >= h.right || d.bottom <= h.top || d.top >= h.bottom,
    nav: [d.left, d.top, d.right, d.bottom].map(Math.round), hud: [h.left, h.top, h.right, h.bottom].map(Math.round), missed,
  }
}"""

# On phones (the dots' row at the top left in either language), each dot's name as it would show under the row,
# made long (the longest a name may show: the label's max-width) for the check and given back: on the screen.
CUBE_LONG_LABELS = """() => {
  const out = []
  for (const label of __h.box.querySelectorAll('.cb-dot__label')) {
    const was = label.textContent
    label.textContent = (was + ' ').repeat(12)
    const r = label.getBoundingClientRect()
    out.push([r.left, r.right].map(Math.round))
    label.textContent = was
  }
  return { labels: out, off: out.filter(([l, r]) => l < -1 || r > innerWidth + 1) }
}"""

# The page's h1 at the box's top (the first view): in the box's view under the bar and clear of both zones.
CUBE_FIRST_H1 = """({ zones }) => {
  const box = __h.box
  const b = box.getBoundingClientRect()
  const zoneRects = """ + ZONE_RECTS + """
  const r = box.querySelector('.aixc-vx--cube h1').getBoundingClientRect()
  const meets = zoneRects.filter(([, z]) => r.left < z.right && r.right > z.left && r.top < z.bottom && r.bottom > z.top).map(([zone]) => zone)
  return { h1: [r.left, r.top, r.right, r.bottom].map(Math.round), view: [Math.round(b.top + 57), Math.round(b.bottom)], inView: r.top >= b.top + 57 - 1 && r.bottom <= b.bottom + 1, meets }
}"""


async def cube_extra(page, tag, zones, layout):
    """The cube's own checks, with motion allowed: the box swept from top to end, nothing pressable in either zone at
    any place and every link and button pressable at some place; the dots a column from 900 px where the column fits
    above the zone on its side and a row elsewhere; a press on a dot scrolls the box (not the window) to its block,
    the dot then current; reveal(itemId) brings a card into the box's view, pressable, and is false for an id it has
    not; zones that grow while it rests (the guide starting to listen) keep the dots and every pressable clear, the
    dots turning into the row where the column no longer fits; the row clear of the HUD, every dot pressable, on
    phones a dot's longest name on the screen; at the box's top the page's h1 clear of both zones."""
    width, height = await page.evaluate("[innerWidth, innerHeight]")
    sweep = await page.evaluate(CUBE_SWEEP, {"zones": zones, "step": 40})
    check(f"{tag}: swept in 40 px steps ({sweep['places']} places): nothing pressable in either safe zone at any of them", sweep["hitCount"] == 0, sweep["hits"])
    # Every one reached at some place, but under the guide's listening zone: its transcript bar can cover the whole
    # room on its side (812x375), and what is under it is pressed once the guide stops.
    if zones.get("right-w") != LISTENING["right-w"]:
        check(f"{tag}: swept: every one of its {sweep['nodes']} links and buttons pressable in the box at some place (inert only while in a zone)", sweep["nodes"] > 0 and not sweep["never"], sweep["never"][:5])
    # The first view (the sweep ends at the box's top): the page's h1 under the bar and clear of both zones; not on a
    # phone in landscape (a short box: the opening sheet stays at the cube's foot, its h1 in the corners' band) or
    # while the guide listens (its transcript bar spans the phone's width).
    if not (width < 900 and width > height) and zones.get("right-w") != LISTENING["right-w"]:
        first = await page.evaluate(CUBE_FIRST_H1, {"zones": zones})
        check(f"{tag}: at the box's top the page's h1 shows under the bar, clear of both zones", first["inView"] and not first["meets"], first)
    dots = await page.evaluate(CUBE_DOTS)
    want_row = width < 900 or dots["count"] * 34 - 2 > dots["room"]
    check(f"{tag}: the dots are the layout's own in the box, a {'row' if want_row else 'column'} ({dots['count']} dots, {dots['room']} px beside the column)", dots["inLayout"] and dots["row"] == want_row, dots)
    if dots["row"]:
        check(f"{tag}: the dots' row clear of the HUD, a press at each dot's centre reaching it", dots["clearOfHud"] and not dots["missed"], dots)
    if dots["row"] and width < 900:
        long = await page.evaluate(CUBE_LONG_LABELS)
        check(f"{tag}: on a phone each dot's name, at its longest, shows on the screen under the row", not long["off"], long)
    # A press on the third dot, then on the first: the box scrolls to the block, the window does not.
    for at in (2, 0):
        was = await page.evaluate("() => __h.box.scrollTop")
        spot = await page.evaluate("""(at) => { const d = __h.box.querySelectorAll('.cb-dot')[at]; const r = d.getBoundingClientRect(); const x = r.left + Math.min(r.width / 2, 14), y = r.top + r.height / 2; const hit = document.elementFromPoint(x, y); return { x, y, reaches: !!hit && d.contains(hit) } }""", at)
        if not spot["reaches"]:
            check(f"{tag}: a press reaches dot {at + 1}", False, spot)
            continue
        await page.mouse.click(spot["x"], spot["y"])
        await page.wait_for_timeout(1400)
        await page.evaluate(FRAMES)
        got = await page.evaluate(CUBE_DOT_AT, {"at": at})
        moved = got["box"] != round(was) or at == 0 and got["box"] == 0
        check(f"{tag}: a press on dot {at + 1} scrolls the box ({round(was)} -> {got['box']}), not the window, to its block's heading in view, the dot current", moved and got["windowScroll"] == 0 and got["inView"] and got["current"], got)
    absent = await page.evaluate("() => __h.current.reveal('no-such-item')")
    check(f"{tag}: reveal() of an id it has not returns false", absent is False, absent)
    ids = await page.evaluate("() => __h.itemIds")
    bad = []
    for item in sorted({ids[0], ids[len(ids) // 2], ids[-1]}, key=ids.index):
        back = await page.evaluate("(id) => __h.current.reveal(id)", item)
        await page.evaluate(FRAMES)
        got = await page.evaluate(CUBE_REVEALED, {"id": item})
        if not (back is True and got["inView"] and got["reaches"] and got["windowScroll"] == 0):
            bad.append((item, back, got))
    check(f"{tag}: reveal() of the first, a middle and the last item returns true, the card in the box's view under the bar (and the dots' row), a press reaching it, the window still", not bad, bad[:2])
    if zones.get("right-w") == LISTENING["right-w"]:
        return
    # Mid-track, at rest; then the guide starts to listen: only the box's style changes.
    at = await page.evaluate(TRACK_AT, {"track": ".cb-layout", "stage": ".cb-stage", "k": 0.5})
    await page.evaluate("(y) => __h.box.scrollTo({ top: y, behavior: 'instant' })", at["y"])
    await page.evaluate(FRAMES)
    heard = {**zones, **LISTENING}
    await page.evaluate("(zones) => __h.measure(zones)", heard)
    await page.evaluate(FRAMES)
    # The dots follow the zones (cube.js onViewZones): a row where the column no longer fits above the zone on its
    # side (from 900 px in Arabic in a short box), the row clear of the HUD.
    dots = await page.evaluate(CUBE_DOTS)
    want_row = width < 900 or dots["count"] * 34 - 2 > dots["room"]
    check(f"{tag}: the guide starting to listen while it rests: the dots a {'row' if want_row else 'column'} ({dots['room']} px beside the column){', clear of the HUD' if want_row else ''}", dots["row"] == want_row and (not want_row or dots["clearOfHud"] and not dots["missed"]), dots)
    zone = await page.evaluate(CONTROLS_IN_ZONES, {"zones": heard, "controls": [".cb-dots"], "name": "cube"})
    check(f"{tag}: the guide starting to listen while it rests: the dots and every pressable clear of both zones ({zone['seen']} pressables in view)", zone["seen"] > 0 and not zone["out"] and not any(c["zones"] for c in zone["each"]) and all(c["shown"] for c in zone["each"]), {"out": zone["out"][:3], "each": zone["each"]})
    await page.evaluate("(zones) => __h.measure(zones)", zones)
    await page.evaluate(FRAMES)


# The tunnel in the box: laid flat or not, its stage's position, the HUD's display, the pair's and the title row's
# rectangles, the stage's, the place readout, the box's scroll and the window's.
TUNNEL_STATE = """() => {
  const box = __h.box
  const rect = (n) => (n && n.getClientRects().length ? (({ left, top, right, bottom }) => ({ left, top, right, bottom }))(n.getBoundingClientRect()) : null)
  return {
    flat: box.querySelector('.aixc-vx--tunnel').classList.contains('is-static'),
    position: getComputedStyle(box.querySelector('.tn-stage')).position,
    hud: getComputedStyle(box.querySelector('.tn-hud')).display,
    nav: rect(box.querySelector('.tn-hud__nav')),
    title: rect(box.querySelector('.tn-hud__row')),
    stage: rect(box.querySelector('.tn-stage')),
    place: box.querySelector('.tn-hud__place').textContent,
    boxScroll: Math.round(box.scrollTop),
    windowScroll: scrollY,
  }
}"""

# reveal(id) on the tunnel: what it returns and, at once (the camera there without its flight; laid flat, the card's
# top at the bar), the card: its top in the box's view under the bar and all of it where it fits; not inert, and a
# press at its link's centre reaching the link, unless that link is in a zone (inZone: the guide listening).
TUNNEL_REVEAL = """({ id, zones }) => {
  const box = __h.box
  const back = __h.current.reveal(id)
  const b = box.getBoundingClientRect()
  const card = [...box.querySelectorAll('[data-aixc-item]')].find((n) => n.dataset.aixcItem === id)
  const r = card.getBoundingClientRect()
  const link = card.querySelector('a[href], button')
  const l = link ? link.getBoundingClientRect() : null
  const hit = l ? document.elementFromPoint(l.left + l.width / 2, l.top + l.height / 2) : null
  const zoneRects = """ + ZONE_RECTS + """
  const inZone = !!l && zoneRects.some(([, z]) => l.left < z.right && l.right > z.left && l.top < z.bottom && l.bottom > z.top)
  const fits = r.bottom - r.top <= b.bottom - b.top - 57
  const inView = r.top >= b.top + 57 - 1 && r.top < b.bottom && (!fits || r.bottom <= b.bottom + 1) && r.left >= b.left - 1 && r.right <= b.right + 1
  // A card taller than the room (laid flat in a short box) shows its top: its link may be further down.
  const linkShown = !!l && l.top >= b.top + 57 && l.bottom <= b.bottom
  return { back, inView, inert: !!card.closest('[inert]'), linkShown, reaches: !!hit && !!link && link.contains(hit), inZone, rect: [r.left, r.top, r.right, r.bottom].map(Math.round), windowScroll: scrollY }
}"""

# The tunnel laid flat, swept: the box scrolled from its top to its end in `step` px, a couple of frames at each
# place; everything of the tunnel that can be pressed (not inert, taking pointer events) and shows in the box, the
# zones it meets, and which of them could be pressed at some place (every one: tunnel.js fence() blocks presses on a
# link only while it is in a zone: the 3D slots inert, a flowing link .tn-fenced, which keeps its focus).
TUNNEL_SWEEP = """async ({ zones, step }) => {
  const box = __h.box
  const root = box.querySelector('.aixc-vx--tunnel')
  const zoneRects = """ + ZONE_RECTS + """
  const meets = (r, z) => r.left < z.right && r.right > z.left && r.top < z.bottom && r.bottom > z.top
  const frames = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  const b = box.getBoundingClientRect()
  const nodes = [...root.querySelectorAll('a[href], button')].filter((el) => el.getClientRects().length)
  const reached = new Set()
  const hits = []
  let places = 0
  const end = box.scrollHeight - box.clientHeight
  for (let y = 0; ; y = Math.min(end, y + step)) {
    box.scrollTo({ top: y, behavior: 'instant' })
    await frames()
    places += 1
    nodes.forEach((el, at) => {
      const r = el.getBoundingClientRect()
      const style = getComputedStyle(el)
      if (el.closest('[inert]') || !r.width || !r.height || style.visibility === 'hidden' || style.pointerEvents === 'none') return
      if (r.bottom <= b.top + 57 || r.top >= b.bottom) return
      reached.add(at)
      for (const [zone, z] of zoneRects) if (meets(r, z)) hits.push({ y, zone, label: (el.getAttribute('aria-label') || el.textContent).trim().slice(0, 30), rect: [r.left, r.top, r.right, r.bottom].map(Math.round) })
    })
    if (y >= end) break
  }
  box.scrollTo({ top: 0, behavior: 'instant' })
  await frames()
  const never = nodes.filter((_, at) => !reached.has(at)).map((el) => (el.getAttribute('aria-label') || el.textContent).trim().slice(0, 30))
  return { places, nodes: nodes.length, hits: hits.slice(0, 5), hitCount: hits.length, never, windowScroll: scrollY }
}"""


async def tunnel_press(page, at):
    """A press at the centre of the HUD's prev (0) or next (1), where it reaches the button: whether it does."""
    spot = await page.evaluate("""(at) => { const b = __h.box.querySelectorAll('.tn-hud__nav .vx-round')[at]; const r = b.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2; const hit = document.elementFromPoint(x, y); return { x, y, reaches: !!hit && b.contains(hit) } }""", at)
    if spot["reaches"]:
        await page.mouse.click(spot["x"], spot["y"])
    return spot


async def tunnel_reveals(page, tag, zones):
    """reveal() of the first, a middle and the last item, and of an id it has not. Inert only while the guide listens
    and the card's link is in a zone (its transcript bar can cover a phone's card: by design); a link not shown (below
    the room) only laid flat, where a card can be taller than a short box's room."""
    listening = zones.get("right-w") == LISTENING["right-w"]
    flat = (await page.evaluate(TUNNEL_STATE))["flat"]
    absent = await page.evaluate("() => __h.current.reveal('no-such-item')")
    check(f"{tag}: reveal() of an id it has not returns false", absent is False, absent)
    ids = await page.evaluate("() => __h.itemIds")
    services = [i for i in ids if await page.evaluate("(id) => !!__h.box.querySelector(`.tn-card[data-aixc-item='${CSS.escape(id)}']`)", i)]
    bad = []
    for item in sorted({services[0], services[len(services) // 2], services[-1]}, key=services.index):
        got = await page.evaluate(TUNNEL_REVEAL, {"id": item, "zones": zones})
        ok = got["back"] is True and got["inView"] and got["windowScroll"] == 0 and (
            (listening and got["inZone"] and got["inert"])
            or (not got["inert"] and (got["reaches"] or (flat and not got["linkShown"])))
        )
        if not ok:
            bad.append((item, got))
    check(f"{tag}: reveal() of the first, a middle and the last service returns true, its card at once in the box's view under the bar, pressable at its link where that shows (inert only while the guide listens and its link is in a zone)", not bad, bad[:2])


# The tunnel's current slot (the stop the box's scroll rests on) once the camera has settled there (its rect the same
# over two frames, at most 3 s): a service's card or a category's word, whether it is inert, cut by the box's inner
# sides (more than 1 px past them), and whether its link is in a zone. Unlike CUT_BY_SIDES this does not skip what is
# inert: fence() makes a slot cut by the sides inert, so a probe that skips inert slots could never see one cut at rest.
TUNNEL_CURRENT = """async ({ at, y, zones }) => {
  const box = __h.box
  const frame = () => new Promise((r) => requestAnimationFrame(r))
  box.scrollTo({ top: y, behavior: 'instant' })
  const zoneRects = """ + ZONE_RECTS + """
  const meets = (r, z) => r.left < z.right && r.right > z.left && r.top < z.bottom && r.bottom > z.top
  const read = () => {
    const slot = box.querySelector('.tn-item.is-current')
    const el = slot && (slot.querySelector('.tn-card') || slot.querySelector('.tn-word'))
    return { slot, el, r: el ? el.getBoundingClientRect() : null }
  }
  let was = null
  const t0 = performance.now()
  for (;;) {
    await frame()
    const now = read()
    const same = was && now.el === was.el && now.r && ['left', 'top', 'right', 'bottom'].every((k) => Math.abs(now.r[k] - was.r[k]) < 0.5)
    if (same || performance.now() - t0 > 3000) break
    was = now
  }
  await frame()
  await frame()
  const { slot, el, r } = read()
  const left = box.getBoundingClientRect().left + box.clientLeft, right = left + box.clientWidth
  const link = el && el.querySelector('a[href], button')
  const l = link ? link.getBoundingClientRect() : null
  return {
    at,
    kind: slot && slot.classList.contains('tn-item--word') ? 'word' : 'card',
    text: el ? el.textContent.trim().slice(0, 30) : null,
    inert: !slot || !!slot.closest('[inert]'),
    cut: !r || r.left < left - 1 || r.right > right + 1,
    linkInZone: !!l && zoneRects.some(([, z]) => meets(l, z)),
    rect: r && [Math.round(r.left), Math.round(r.right)],
    box: [Math.round(left), Math.round(right)],
  }
}"""


async def tunnel_settled(page, tag, zones):
    """The 3D tunnel settled on each of its stops in turn (words included): the current slot inside the box's sides
    and not inert (inert only while the guide listens and a card's link is in a zone, as TUNNEL_REVEAL allows)."""
    listening = zones.get("right-w") == LISTENING["right-w"]
    t = await page.evaluate(TRACK_AT, {"track": ".tn-track", "stage": ".tn-stage", "k": 0})
    count = await page.evaluate("() => __h.box.querySelectorAll('.tn-item').length")
    bad = []
    for at in range(count):
        got = await page.evaluate(TUNNEL_CURRENT, {"at": at, "y": t["y"] + at * 320, "zones": zones})
        if got["cut"] or (got["inert"] and not (listening and got["kind"] == "card" and got["linkInZone"])):
            bad.append(got)
    check(f"{tag}: settled on each of its {count} stops (words included), the current slot inside the box's sides and not inert (inert only while the guide listens and its link is in a zone)", count > 0 and not bad, bad[:3])


# The tunnel laid flat: from the view bar (focused, as the bar's last control would be), Tab once per link up to the
# last service's link: which of the view's links gets the focus each time (its index among the view's shown links,
# -1 outside the view), and once there, whether it is clear of both zones and a press at its centre reaches it (where
# the room under the bar and over the zones fits it: scroll-margin-block scrolls a focused link clear).
TUNNEL_TAB = """async ({ zones, presses }) => {
  const box = __h.box
  const root = box.querySelector('.aixc-vx--tunnel')
  const frames = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  const zoneRects = """ + ZONE_RECTS + """
  const meets = (r, z) => r.left < z.right && r.right > z.left && r.top < z.bottom && r.bottom > z.top
  const nodes = [...root.querySelectorAll('a[href], button')].filter((el) => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden')
  const cards = nodes.filter((el) => el.closest('.tn-card'))
  const want = nodes.slice(0, nodes.indexOf(cards[cards.length - 1]) + 1)
  if (presses === 0) {
    box.scrollTo({ top: 0, behavior: 'instant' })
    await frames()
    const bar = box.querySelector('.aixc-viewbar')
    bar.tabIndex = -1
    bar.focus({ preventScroll: true })
    return { want: want.map((el) => nodes.indexOf(el)), cards: cards.length }
  }
  await frames()
  await frames()
  const a = document.activeElement
  const r = a.getBoundingClientRect()
  const b = box.getBoundingClientRect()
  const safeH = Math.max(zones['right-h'], zones['left-h'])
  const fits = box.clientHeight - 57 - 16 - (safeH + 16) >= r.height
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
  return { at: nodes.indexOf(a), card: !!a.closest('.tn-card'), fits, inZone: zoneRects.some(([, z]) => meets(r, z)), reaches: !!hit && a.contains(hit), rect: [r.left, r.top, r.right, r.bottom].map(Math.round), boxScroll: Math.round(box.scrollTop), windowScroll: scrollY }
}"""


async def tunnel_tab_flat(page, tag, zones):
    """Laid flat: Tab from the view bar reaches each service's link in DOM order (none skipped: fence() blocks presses
    on a link in a zone, never its focus), each one, focused, clear of both zones and pressable where the room fits it."""
    start = await page.evaluate(TUNNEL_TAB, {"zones": zones, "presses": 0})
    seen = []
    for _ in start["want"]:
        await page.keyboard.press("Tab")
        seen.append(await page.evaluate(TUNNEL_TAB, {"zones": zones, "presses": 1}))
    await page.evaluate("() => { document.activeElement.blur(); __h.box.querySelector('.aixc-viewbar').removeAttribute('tabindex'); __h.box.scrollTo({ top: 0, behavior: 'instant' }) }")
    order = [s["at"] for s in seen]
    check(f"{tag}: laid flat, Tab from the view bar reaches every link up to the last service's ({len(start['want'])}, {start['cards']} of them the services'), in DOM order, none skipped", order == start["want"] and start["cards"] > 0, {"want": start["want"], "got": order})
    covered = [s for s in seen if s["fits"] and (s["inZone"] or not s["reaches"])]
    check(f"{tag}: laid flat, each link Tab reaches is scrolled clear of both zones and pressable ({sum(s['fits'] for s in seen)} where the room fits one), the window still", not covered and all(s["windowScroll"] == 0 for s in seen), covered[:3])


async def tunnel_extra(page, tag, zones, layout):
    """The 3D tunnel's own checks, with motion allowed: not laid flat (the room is SHORT_ROOM or more), its stage
    sticky and its HUD shown; the pair under the HUD's title row on phones, at the stage's bottom from 720 px; from
    the track's first stop next goes to the first service, 320 px of the box's scroll, then next and prev between
    services, the window still; reveal(); Tab to the next service's link flies the camera there, scrolling the box and
    not the window, the link then pressable; zones that grow while it rests (the guide starting to listen) keep the
    pair and every pressable clear."""
    listening = zones.get("right-w") == LISTENING["right-w"]
    st = await page.evaluate(TUNNEL_STATE)
    check(f"{tag}: the 3D tunnel (not laid flat), its stage sticky and its HUD shown", not st["flat"] and st["position"] == "sticky" and st["hud"] == "flex", st)
    nav, title, stage = st["nav"], st["title"], st["stage"]
    mid = (stage["top"] + stage["bottom"]) / 2
    if layout == "phone":
        check(f"{tag}: on a phone the pair under the HUD's title row, in the stage's top half", nav["top"] >= title["bottom"] and nav["bottom"] < mid, st)
    else:
        check(f"{tag}: from 720 px the pair in the stage's bottom half, between the zones or above the taller one", nav["top"] > mid, st)
    # From the track's first stop (the first category's word).
    at = await page.evaluate(TRACK_AT, {"track": ".tn-track", "stage": ".tn-stage", "k": 0})
    await page.evaluate("(y) => __h.box.scrollTo({ top: y, behavior: 'instant' })", at["y"])
    await page.wait_for_timeout(1500)
    steps, moves = [], []
    for which, want in ((1, "01"), (1, "02"), (0, "01")):
        was = await page.evaluate(TUNNEL_STATE)
        spot = await tunnel_press(page, which)
        await page.wait_for_timeout(1500)
        now = await page.evaluate(TUNNEL_STATE)
        moves.append(now["boxScroll"] - was["boxScroll"])
        ok = spot["reaches"] and now["place"].startswith(f"{want} /") and now["windowScroll"] == 0 and (moves[-1] > 0 if which else moves[-1] < 0)
        steps.append({"press": "next" if which else "prev", "reaches": spot["reaches"], "place": now["place"], "moved": moves[-1], "ok": ok})
    measures[tag]["steps"] = steps
    check(f"{tag}: from the first stop next shows service 01 (320 px of the box's scroll), next 02, prev 01 again, the box scrolling and not the window", all(s["ok"] for s in steps) and abs(moves[0] - 320) <= 2 and moves[1] >= 318 and abs(moves[1] + moves[2]) <= 2, steps)
    await tunnel_reveals(page, tag, zones)
    await tunnel_settled(page, tag, zones)
    # Swept from the box's top to its end (the camera in flight two frames after each jump, the closing band coming up
    # past the corners): nothing pressable in either zone at any place.
    sweep = await page.evaluate(TUNNEL_SWEEP, {"zones": zones, "step": 80})
    check(f"{tag}: swept in 80 px steps ({sweep['places']} places, mid-flight): nothing pressable in either safe zone at any of them", sweep["places"] > 2 and sweep["hitCount"] == 0, sweep["hits"])
    # Tab from the first service's last link to the next service's link: the camera flies there.
    ids = await page.evaluate("() => [...__h.box.querySelectorAll('.tn-card')].map((c) => c.dataset.aixcItem)")
    await page.evaluate(TUNNEL_REVEAL, {"id": ids[0], "zones": zones})
    await page.evaluate("() => { const links = __h.box.querySelectorAll('.tn-card')[0].querySelectorAll('a[href], button'); links[links.length - 1].focus() }")
    was = await page.evaluate(TUNNEL_STATE)
    await page.keyboard.press("Tab")
    await page.wait_for_timeout(1500)
    tab = await page.evaluate("""() => { const a = document.activeElement; const card = a.closest('.tn-card'); const r = a.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { item: card ? card.dataset.aixcItem : null, inert: !!a.closest('[inert]'), reaches: !!hit && a.contains(hit), boxScroll: Math.round(__h.box.scrollTop), windowScroll: scrollY } }""")
    check(f"{tag}: Tab to the next service's link flies the camera there: the box scrolls ({was['boxScroll']} -> {tab['boxScroll']}), the window does not, the link pressable", tab["item"] == ids[1] and tab["boxScroll"] > was["boxScroll"] and tab["windowScroll"] == 0 and not tab["inert"] and (tab["reaches"] or listening), tab)
    await page.evaluate("() => document.activeElement.blur()")
    if listening and layout != "phone":
        # A tablet's bottom row while the guide listens: from 720 px, where the room between the zones is under the
        # row's 320 px (100cqw < 112 + 488 + 320 px), the pair lifted above the taller zone (tunnel.css --tn-row-fit),
        # and the card the camera rests on pressable at its link.
        view = await page.evaluate("() => ({ w: innerWidth, h: innerHeight, stage: Math.round(__h.box.querySelector('.tn-track').getBoundingClientRect().width) })")
        lifted = view["stage"] < (zones["left-w"] + 16) + (zones["right-w"] + 16) + 320
        top = view["h"] - max(zones["right-h"], zones["left-h"])
        if lifted:
            check(f"{tag}: listening, the row between the zones does not fit ({view['stage']} px): the pair lifted above the taller zone (its bottom {round(nav['bottom'])} over {top})", nav["bottom"] < top, st)
        services = await page.evaluate("() => [...__h.box.querySelectorAll('.tn-card')].map((c) => c.dataset.aixcItem)")
        got = await page.evaluate(TUNNEL_REVEAL, {"id": services[1], "zones": zones})
        check(f"{tag}: listening, the card the camera rests on (service 02) pressable at its link", got["back"] is True and not got["inert"] and got["reaches"] and not got["inZone"], got)
    if listening:
        return
    # Mid-track, at rest; then the guide starts to listen: only the box's style changes.
    at = await page.evaluate(TRACK_AT, {"track": ".tn-track", "stage": ".tn-stage", "k": 0.5})
    await page.evaluate("(y) => __h.box.scrollTo({ top: y, behavior: 'instant' })", at["y"])
    await page.wait_for_timeout(1500)
    heard = {**zones, **LISTENING}
    await page.evaluate("(zones) => __h.measure(zones)", heard)
    await page.evaluate(FRAMES)
    zone = await page.evaluate(CONTROLS_IN_ZONES, {"zones": heard, "controls": [".tn-hud__nav"], "name": "tunnel"})
    check(f"{tag}: the guide starting to listen while it rests: the pair and every pressable clear of both zones ({zone['seen']} pressables in view)", zone["seen"] > 0 and not zone["out"] and not any(c["zones"] for c in zone["each"]) and all(c["shown"] for c in zone["each"]), {"out": zone["out"][:3], "each": zone["each"]})
    await page.evaluate("(zones) => __h.measure(zones)", zones)
    await page.evaluate(FRAMES)


async def tunnel_flat_extra(page, tag, zones, layout):
    """The tunnel laid flat (reduced motion, or a box too short for its stage): its stage not sticky, no HUD; swept in
    40 px steps, nothing pressable in either zone at any place and every link pressable at some place (but under the
    guide's listening zone, which can cover the box's whole width); reveal()."""
    st = await page.evaluate(TUNNEL_STATE)
    check(f"{tag}: laid flat, its stage not sticky and no HUD", st["flat"] and st["position"] != "sticky" and st["hud"] == "none", st)
    sweep = await page.evaluate(TUNNEL_SWEEP, {"zones": zones, "step": 40})
    check(f"{tag}: laid flat, swept in 40 px steps ({sweep['places']} places): nothing pressable in either safe zone at any of them", sweep["hitCount"] == 0, sweep["hits"])
    if zones.get("right-w") != LISTENING["right-w"]:
        check(f"{tag}: laid flat, swept: every one of its {sweep['nodes']} links and buttons pressable in the box at some place (inert only while in a zone)", sweep["nodes"] > 0 and not sweep["never"], sweep["never"][:5])
        await tunnel_tab_flat(page, tag, zones)
    await tunnel_reveals(page, tag, zones)


async def tunnel_after(browser, langs):
    """The tunnel laid flat, through box_generic() and tunnel_flat_extra(): a phone in landscape with motion allowed (a
    room under SHORT_ROOM), at rest and with the guide listening; desktop and phone under reduced motion."""
    base = EXPERIENCES["tunnel"]
    try:
        for motion, sizes, listening in (("no-preference", [(812, 375)], [(812, 375)]), ("reduce", [(1366, 900), (375, 812)], [])):
            EXPERIENCES["tunnel"] = {**base, "pins": None, "controls": [], "motion": motion, "extra": tunnel_flat_extra}
            for width, height in sizes:
                for lang in langs:
                    await box_generic(browser, "tunnel", width, height, lang)
            for width, height in listening:
                for lang in langs:
                    await box_generic(browser, "tunnel", width, height, lang, listening=True)
    finally:
        EXPERIENCES["tunnel"] = base


# The canvas (phase 4b, Phase 4, 2026-11-18).
# reveal(id): what it returns, and the card at once: inert, inside the box's sides and its view under the bar, in a zone.
CANVAS_REVEAL = """({ id, zones }) => {
  const box = __h.box
  const back = __h.current.reveal(id)
  const card = box.querySelector(`.cv-card[data-aixc-item="${CSS.escape(id)}"]`)
  const r = card.getBoundingClientRect()
  const b = box.getBoundingClientRect()
  const view = { left: b.left + box.clientLeft, right: b.left + box.clientLeft + box.clientWidth, top: b.top + box.clientTop + 57, bottom: b.top + box.clientTop + box.clientHeight }
  const zoneRects = """ + ZONE_RECTS + """
  const inZone = zoneRects.some(([, z]) => r.left < z.right && r.right > z.left && r.top < z.bottom && r.bottom > z.top)
  return { back, inert: !!card.closest('[inert]'), inZone, inView: r.left >= view.left - 1 && r.right <= view.right + 1 && r.top >= view.top - 1 && r.bottom <= view.bottom + 1, rect: [r.left, r.top, r.right, r.bottom].map(Math.round), view: [view.left, view.top, view.right, view.bottom].map(Math.round), windowScroll: scrollY }
}"""

# Waits (at most 3 s) until the canvas rests: the brand tile's transform the same over two frames.
CANVAS_SETTLE = """async () => {
  const brand = __h.box.querySelector('.cv-tile--brand')
  const frame = () => new Promise((r) => requestAnimationFrame(r))
  const t0 = performance.now()
  let was = null
  for (;;) {
    await frame()
    await frame()
    const now = brand.style.transform
    if (now === was || performance.now() - t0 > 3000) return now
    was = now
  }
}"""

# The preview while it shows: not in the top layer, over the box's room under the bar, the rest of the box inert, the
# box's scroll held; its pressables against the zones; where the focus is.
CANVAS_PREVIEW = """({ zones }) => {
  const box = __h.box
  const b = box.getBoundingClientRect()
  const dialog = box.querySelector('.cv-dialog')
  const d = dialog.getBoundingClientRect()
  const zoneRects = """ + ZONE_RECTS + """
  const meets = (r, z) => r.left < z.right && r.right > z.left && r.top < z.bottom && r.bottom > z.top
  const pressables = [...dialog.querySelectorAll('a[href], button')].filter((el) => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden')
  const hits = pressables.flatMap((el) => zoneRects.filter(([, z]) => meets(el.getBoundingClientRect(), z)).map(([zone]) => ({ zone, label: (el.getAttribute('aria-label') || el.textContent).trim().slice(0, 30) })))
  const room = { top: b.top + box.clientTop + 57, bottom: b.top + box.clientTop + box.clientHeight }
  const a = document.activeElement
  return {
    open: dialog.open,
    modal: !!document.querySelector(':modal'),
    popover: document.querySelectorAll(':popover-open').length,
    position: getComputedStyle(dialog).position,
    room: Math.abs(d.top - room.top) <= 1 && Math.abs(d.bottom - room.bottom) <= 1 && Math.abs(d.left - b.left - box.clientLeft) <= 1 && Math.abs(d.right - (b.left + box.clientLeft + box.clientWidth)) <= 1,
    rect: [d.left, d.top, d.right, d.bottom].map(Math.round),
    want: [b.left, room.top, b.right, room.bottom].map(Math.round),
    overflowY: getComputedStyle(box).overflowY,
    stageInert: !!box.querySelector('.cv-stage').closest('[inert]'),
    barInert: !!box.querySelector('.aixc-viewbar').closest('[inert]'),
    dialogInert: !!dialog.closest('[inert]'),
    pressables: pressables.length,
    hits,
    focusIn: !!a && dialog.contains(a),
    focus: a ? (a.dataset.aixcItem || a.className || a.localName) : null,
    windowScroll: scrollY,
    boxScroll: box.scrollTop,
  }
}"""


# The card a press at its centre reaches nearest the stage's middle: its id and that centre; null if none.
CANVAS_NEAREST = """() => {
  const s = __h.box.querySelector('.cv-stage').getBoundingClientRect()
  const [mx, my] = [(s.left + s.right) / 2, (s.top + s.bottom) / 2]
  const fits = [...__h.box.querySelectorAll('.cv-card')].map((card) => {
    const r = card.getBoundingClientRect()
    const [x, y] = [r.left + r.width / 2, r.top + r.height / 2]
    const hit = document.elementFromPoint(x, y)
    return { id: card.dataset.aixcItem, at: [x, y], far: Math.hypot(x - mx, y - my), ok: !card.closest('[inert]') && !!hit && card.contains(hit) }
  }).filter((c) => c.ok).sort((a, b) => a.far - b.far)
  return fits[0] ? { id: fits[0].id, at: fits[0].at } : null
}"""


async def canvas_extra(page, tag, zones, layout):
    """The canvas's own checks: reveal(itemId) brings its card into the box's view, pressable, false for an id it has
    not; panned by the arrow keys, at rest after each pan nothing pressable in a zone and nothing cut by the box's sides;
    its preview in the box (not modal, nothing in the top layer, over the room under the bar, the rest inert, the box's
    scroll held, its close button and links clear of both zones, Tab kept in it), Escape closing it with the focus back
    on the card and the box as it was; the window never scrolled."""
    ids = await page.evaluate("() => [...__h.box.querySelectorAll('.cv-card')].map((c) => c.dataset.aixcItem)")
    absent = await page.evaluate("() => __h.current.reveal('no-such-item')")
    check(f"{tag}: reveal() of an id it has not returns false", absent is False, absent)
    bad = []
    listening = " listening" in tag
    for at in sorted({0, len(ids) // 2, len(ids) - 1}):
        got = await page.evaluate(CANVAS_REVEAL, {"id": ids[at], "zones": zones})
        await page.evaluate(FRAMES)
        settled = await page.evaluate("(id) => !__h.box.querySelector(`.cv-card[data-aixc-item=\"${CSS.escape(id)}\"]`).closest('[inert]')", ids[at])
        # Pressable at once and after a frame; only while the guide listens may its transcript bar lie over the room
        # where the card rests (inert there by design).
        ok_press = (settled and not got["inert"]) or (listening and got["inZone"])
        if not (got["back"] is True and got["inView"] and ok_press and got["windowScroll"] == 0):
            bad.append((at, got, settled))
    check(f"{tag}: reveal() of the first, a middle and the last card returns true, the card whole in the box's view and pressable at once (inert only in a zone while the guide listens), the window still", not bad, bad[:3])
    # Panned by the arrow keys from the first card: at rest after each pan, nothing pressable in a zone, nothing cut.
    await page.evaluate("(id) => __h.current.reveal(id)", ids[0])
    await page.evaluate("() => __h.box.querySelector('.cv-surface').focus({ preventScroll: true })")
    off, cut, seen = [], [], 0
    for key in ["ArrowRight", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowLeft", "ArrowLeft", "ArrowUp", "ArrowRight"]:
        await page.keyboard.press(key)
        await page.evaluate(CANVAS_SETTLE)
        zone = await page.evaluate(CONTROLS_IN_ZONES, {"zones": zones, "controls": [], "name": "canvas"})
        sides = await page.evaluate(CUT_BY_SIDES, {"name": "canvas"})
        seen += zone["seen"]
        if zone["out"]:
            off.append((key, zone["out"][:2]))
        if sides["cut"]:
            cut.append((key, sides["cut"][:2]))
    check(f"{tag}: panned by the arrow keys (8 pans), at rest after each: nothing pressable in either zone ({seen} read)", seen > 0 and not off, off[:3])
    check(f"{tag}: panned by the arrow keys (8 pans), at rest after each: nothing cut by the box's sides", not cut, cut[:3])
    # The preview, opened by a press at the centre of the pressable card nearest the stage's middle (after a middle
    # card's reveal; with the guide listening that one may be under its bar).
    await page.evaluate("(id) => __h.current.reveal(id)", ids[len(ids) // 2])
    await page.evaluate(CANVAS_SETTLE)
    pick = await page.evaluate(CANVAS_NEAREST)
    check(f"{tag}: a card a press reaches, near the stage's middle", pick is not None, pick)
    if pick is None:
        return
    mid, at = pick["id"], pick["at"]
    await page.mouse.click(at[0], at[1])
    await page.wait_for_function("() => __h.box.querySelector('.cv-dialog').open", timeout=5000)
    await page.wait_for_timeout(900)
    shown = await page.evaluate(CANVAS_PREVIEW, {"zones": zones})
    check(f"{tag}: the preview shows in the box: not modal, nothing in the top layer, positioned absolute over the box's room under the bar ({shown['rect']} / {shown['want']})", shown["open"] and not shown["modal"] and shown["popover"] == 0 and shown["position"] == "absolute" and shown["room"], shown)
    check(f"{tag}: while it shows the rest of the box is inert (the stage, the bar) and the box's scroll held", shown["stageInert"] and shown["barInert"] and not shown["dialogInert"] and shown["overflowY"] == "hidden", shown)
    check(f"{tag}: the preview's close button and links ({shown['pressables']}) clear of both zones, the focus in it", shown["pressables"] >= 1 and not shown["hits"] and shown["focusIn"], shown)
    stray = []
    for key in ["Tab"] * (shown["pressables"] + 2) + ["Shift+Tab"] * (shown["pressables"] + 2):
        await page.keyboard.press(key)
        now = await page.evaluate(CANVAS_PREVIEW, {"zones": zones})
        if not now["focusIn"]:
            stray.append((key, now["focus"]))
    check(f"{tag}: Tab and Shift+Tab keep the focus in the preview", not stray, stray[:3])
    await page.mouse.move(at[0], at[1])
    await page.mouse.wheel(0, 500)
    await page.evaluate(FRAMES)
    wheeled = await page.evaluate(CANVAS_PREVIEW, {"zones": zones})
    check(f"{tag}: a wheel over the preview scrolls neither the box nor the window", wheeled["windowScroll"] == 0 and wheeled["boxScroll"] == shown["boxScroll"], wheeled)
    await page.keyboard.press("Escape")
    await page.wait_for_function("() => !__h.box.querySelector('.cv-dialog').open", timeout=5000)
    await page.evaluate(FRAMES)
    after = await page.evaluate(CANVAS_PREVIEW, {"zones": zones})
    check(f"{tag}: Escape closes the preview: the focus back on its card, the box's scroll and the rest as before", not after["open"] and after["focus"] == mid and after["overflowY"] == "auto" and not after["stageInert"] and not after["barInert"] and after["windowScroll"] == 0, after)
    await page.evaluate("() => { document.activeElement?.blur(); __h.current.reveal(__h.itemIds[0]); __h.box.scrollTo({ top: 0, behavior: 'instant' }) }")
    await page.evaluate(FRAMES)


def canvas_controls(width, height):
    """The head's jump links, shown from 720 px (phones have none)."""
    return [".cv-col--cats"] if width >= 720 else []


# The cards a press at their centre reaches: id, that centre, how far from the stage's middle, the rect; `zones` given,
# whether the card meets those zones' rectangles.
CANVAS_PRESSABLE = """({ zones }) => {
  const s = __h.box.querySelector('.cv-stage').getBoundingClientRect()
  const [mx, my] = [(s.left + s.right) / 2, (s.top + s.bottom) / 2]
  const zoneRects = zones ? """ + ZONE_RECTS + """ : []
  return [...__h.box.querySelectorAll('.cv-card')].map((card) => {
    const r = card.getBoundingClientRect()
    const [x, y] = [r.left + r.width / 2, r.top + r.height / 2]
    const hit = document.elementFromPoint(x, y)
    const meets = zoneRects.some(([, z]) => r.left < z.right && r.right > z.left && r.top < z.bottom && r.bottom > z.top)
    return { id: card.dataset.aixcItem, at: [x, y], far: Math.hypot(x - mx, y - my), meets, rect: [r.left, r.top, r.right, r.bottom].map(Math.round), ok: !card.closest('[inert]') && !!hit && card.contains(hit) }
  }).filter((c) => c.ok).sort((a, b) => b.far - a.far)
}"""

CANVAS_CARD = """(id) => {
  const card = __h.box.querySelector(`.cv-card[data-aixc-item="${CSS.escape(id)}"]`)
  const r = card.getBoundingClientRect()
  const a = document.activeElement
  return { rect: [r.left, r.top, r.right, r.bottom].map(Math.round), inert: !!card.closest('[inert]'), own: card.inert, open: __h.box.querySelector('.cv-dialog').open, focused: a === card, focus: a ? (a.dataset.aixcItem || a.className || a.localName) : null }
}"""


async def canvas_page(browser, width, height, lang, zones, motion, touch=False):
    """The harness with the canvas open in the box; `touch`: a phone's touch screen (hasTouch, isMobile)."""
    extra = {"has_touch": True, "is_mobile": True} if touch else {}
    context = await browser.new_context(viewport={"width": width, "height": height}, reduced_motion=motion, **extra)
    page = await context.new_page()
    page.errors = []
    page.on("pageerror", lambda e: page.errors.append(str(e)))
    await page.route(URL + "*", lambda route: route.fulfill(status=200, content_type="text/html; charset=utf-8", body=HARNESS))
    await page.goto(f"{URL}?lang={lang}")
    await page.wait_for_function("window.__ready === true")
    await page.evaluate("(zones) => __h.measure(zones)", zones)
    await page.evaluate("(name) => __h.load(name)", "canvas")
    await page.evaluate("() => { __h.open('canvas') }")
    await page.evaluate("document.fonts.ready")
    await page.evaluate(CANVAS_SETTLE)
    return context, page


async def canvas_touch(browser, lang):
    """On a touch screen under reduced motion (the review, 2026-11-20): one tap on a card away from the clear spot opens
    its preview (the card focused by the tap stays where it is; on touch the focus comes after pointerup), while Tab
    still glides the card it focuses to the clear spot."""
    tag = f"canvas {lang} 375x812 touch (reduced motion)"
    context, page = await canvas_page(browser, 375, 812, lang, ZONES[(375, 812)], "reduce", touch=True)
    cards = await page.evaluate(CANVAS_PRESSABLE, {"zones": None})
    check(f"{tag}: a pressable card away from the stage's middle", bool(cards), cards[:2])
    if cards:
        pick = cards[0]
        before = await page.evaluate(CANVAS_CARD, pick["id"])
        await page.touchscreen.tap(pick["at"][0], pick["at"][1])
        await page.wait_for_timeout(400)
        await page.evaluate(FRAMES)
        after = await page.evaluate(CANVAS_CARD, pick["id"])
        check(f"{tag}: one tap on a card opens its preview, the card left where it was ({before['rect']} -> {after['rect']})", after["open"] and after["rect"] == before["rect"], {"before": before, "after": after, "pick": pick})
        if after["open"]:
            await page.keyboard.press("Escape")
            await page.wait_for_function("() => !__h.box.querySelector('.cv-dialog').open", timeout=5000)
            await page.evaluate(FRAMES)
    ids = await page.evaluate("() => [...__h.box.querySelectorAll('.cv-card')].map((c) => c.dataset.aixcItem)")
    await page.evaluate("() => __h.box.querySelector('.cv-surface').focus({ preventScroll: true })")
    await page.keyboard.press("Tab")
    await page.evaluate(FRAMES)
    was = await page.evaluate(CANVAS_CARD, ids[1])
    await page.keyboard.press("Tab")
    await page.evaluate(FRAMES)
    now = await page.evaluate(CANVAS_CARD, ids[1])
    moved = max(abs(a - b) for a, b in zip(was["rect"], now["rect"]))
    check(f"{tag}: Tab to the next card glides it to the clear spot ({was['rect']} -> {now['rect']}), pressable there", now["focused"] and moved > 4 and not now["inert"], {"was": was, "now": now})
    check(f"{tag}: no page errors", page.errors == [], page.errors)
    await context.close()


async def canvas_zones_escape(browser, lang, motion):
    """The zones change while the preview shows (the guide starts listening; the review, 2026-11-20): its card, low on
    the right, falls in the wider zone (the fence makes it inert there); Escape still gives it the focus back."""
    tag = f"canvas {lang} 1366x900 zones changed under the preview ({'reduced motion' if motion == 'reduce' else 'motion allowed'})"
    quiet = ZONES[(1366, 900)]
    wide = {**quiet, **LISTENING}
    context, page = await canvas_page(browser, 1366, 900, lang, quiet, motion)
    pick = None
    for key in [None, "ArrowUp", "ArrowLeft", "ArrowUp", "ArrowLeft"]:
        if key:
            await page.evaluate("() => __h.box.querySelector('.cv-surface').focus({ preventScroll: true })")
            await page.keyboard.press(key)
            await page.evaluate(CANVAS_SETTLE)
        cards = [c for c in await page.evaluate(CANVAS_PRESSABLE, {"zones": wide}) if c["meets"]]
        if cards:
            pick = cards[-1]
            break
    check(f"{tag}: a pressable card low on the right, in the listening zone's reach", pick is not None, pick)
    if pick:
        await page.evaluate("() => document.activeElement?.blur()")
        await page.mouse.click(pick["at"][0], pick["at"][1])
        await page.wait_for_function("() => __h.box.querySelector('.cv-dialog').open", timeout=5000)
        await page.wait_for_timeout(900)
        await page.evaluate("(zones) => __h.measure(zones)", wide)
        await page.evaluate(FRAMES)
        under = await page.evaluate(CANVAS_CARD, pick["id"])
        await page.keyboard.press("Escape")
        await page.wait_for_function("() => !__h.box.querySelector('.cv-dialog').open", timeout=5000)
        await page.evaluate(FRAMES)
        back = await page.evaluate(CANVAS_CARD, pick["id"])
        check(f"{tag}: Escape closes the preview with the focus back on its card (made inert by the fence under the wider zone while it showed)", under["own"] and not back["open"] and back["focused"] and not back["inert"], {"under": under, "back": back, "pick": pick})
    check(f"{tag}: no page errors", page.errors == [], page.errors)
    await context.close()


async def canvas_after(browser, langs):
    for lang in langs:
        await canvas_touch(browser, lang)
        for motion in ("reduce", "no-preference"):
            await canvas_zones_escape(browser, lang, motion)


# Streaming (phase 4b, Phase 4, 2026-11-20).
# reveal(id): what it returns, and the item at once: its top in the box's view under the bar (a row card's under the
# view's own .st-nav too), whole where it fits,
# inside the box's sides, not inert; the window still.
ST_REVEAL = """({ id }) => {
  const box = __h.box
  const back = __h.current.reveal(id)
  const node = [...box.querySelectorAll('[data-aixc-item]')].find((n) => n.dataset.aixcItem === id)
  const r = node.getBoundingClientRect()
  const b = box.getBoundingClientRect()
  const view = { left: b.left + box.clientLeft, right: b.left + box.clientLeft + box.clientWidth, top: b.top + box.clientTop + 57, bottom: b.top + box.clientTop + box.clientHeight }
  const fits = r.bottom - r.top <= view.bottom - view.top + 1
  // A row card also clear of the view's own sticky bar (.st-nav), not tucked under it.
  const under = node.classList.contains('st-card') ? box.querySelector('.st-nav').getBoundingClientRect().bottom : view.top
  return { back, inert: !!node.closest('[inert]'), top: r.top >= Math.max(view.top, under) - 1 && r.top < view.bottom, whole: !fits || r.bottom <= view.bottom + 1, inside: r.left >= view.left - 1 && r.right <= view.right + 1, rect: [r.left, r.top, r.right, r.bottom].map(Math.round), view: [view.left, view.top, view.right, view.bottom].map(Math.round), windowScroll: scrollY }
}"""

# The preview while it shows: not in the top layer, over the box's room under the bar, the rest of the box inert, the
# box's scroll held; its pressables (those that take a press) against the zones; where the focus is.
ST_PREVIEW = """({ zones }) => {
  const box = __h.box
  const b = box.getBoundingClientRect()
  const dialog = box.querySelector('.st-modal')
  const d = dialog.getBoundingClientRect()
  const zoneRects = """ + ZONE_RECTS + """
  const meets = (r, z) => r.left < z.right && r.right > z.left && r.top < z.bottom && r.bottom > z.top
  const pressables = [...dialog.querySelectorAll('a[href], button')].filter((el) => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden' && getComputedStyle(el).pointerEvents !== 'none')
  const hits = pressables.flatMap((el) => zoneRects.filter(([, z]) => meets(el.getBoundingClientRect(), z)).map(([zone]) => ({ zone, label: (el.getAttribute('aria-label') || el.textContent).trim().slice(0, 30) })))
  const room = { top: b.top + box.clientTop + 57, bottom: b.top + box.clientTop + box.clientHeight }
  const a = document.activeElement
  return {
    open: dialog.open,
    modal: !!document.querySelector(':modal'),
    popover: document.querySelectorAll(':popover-open').length,
    position: getComputedStyle(dialog).position,
    room: Math.abs(d.top - room.top) <= 1 && Math.abs(d.bottom - room.bottom) <= 1 && Math.abs(d.left - b.left - box.clientLeft) <= 1 && Math.abs(d.right - (b.left + box.clientLeft + box.clientWidth)) <= 1,
    rect: [d.left, d.top, d.right, d.bottom].map(Math.round),
    want: [b.left, room.top, b.right, room.bottom].map(Math.round),
    overflowY: getComputedStyle(box).overflowY,
    navInert: !!box.querySelector('.st-nav').closest('[inert]'),
    rowsInert: !!box.querySelector('.st-rows').closest('[inert]'),
    barInert: !!box.querySelector('.aixc-viewbar').closest('[inert]'),
    dialogInert: !!dialog.closest('[inert]'),
    pressables: pressables.length,
    hits,
    focusIn: !!a && dialog.contains(a),
    focus: a ? (a.closest('.st-card')?.dataset.aixcItem || a.className || a.localName) : null,
    windowScroll: scrollY,
    boxScroll: box.scrollTop,
  }
}"""

# The row card whose open button a press at its centre reaches nearest the box's middle: its id and that centre.
ST_NEAREST = """() => {
  const b = __h.box.getBoundingClientRect()
  const [mx, my] = [(b.left + b.right) / 2, (b.top + b.bottom) / 2]
  const fits = [...__h.box.querySelectorAll('.st-card')].map((card) => {
    const open = card.querySelector('.st-card__open')
    const r = open.getBoundingClientRect()
    const [x, y] = [r.left + r.width / 2, r.top + r.height / 2]
    const hit = document.elementFromPoint(x, y)
    return { id: card.dataset.aixcItem, at: [x, y], far: Math.hypot(x - mx, y - my), ok: r.width > 0 && !card.closest('[inert]') && !!hit && open.contains(hit) }
  }).filter((c) => c.ok).sort((a, c) => a.far - c.far)
  return fits[0] ? { id: fits[0].id, at: fits[0].at } : null
}"""


async def streaming_extra(page, tag, zones, layout):
    """Streaming's own checks: reveal(itemId) brings the billboard's, a row card's and the closing band's item into the
    box's view, pressable, false for an id it has not; its preview in the box (not modal, nothing in the top layer, over
    the room under the bar, the rest inert, the box's scroll held, its close button and links clear of both zones
    through its own scroll, Tab kept in it, a wheel over it moving neither the box nor the window), Escape closing it
    with the focus back on the card's button and the box as it was; the window never scrolled."""
    absent = await page.evaluate("() => __h.current.reveal('no-such-item')")
    check(f"{tag}: reveal() of an id it has not returns false", absent is False, absent)
    ids = await page.evaluate("() => [...__h.box.querySelectorAll('[data-aixc-item]')].map((n) => n.dataset.aixcItem)")
    cards = await page.evaluate("() => [...__h.box.querySelectorAll('.st-card')].map((n) => n.dataset.aixcItem)")
    bad = []
    for item in dict.fromkeys([ids[0], cards[len(cards) // 2], cards[-1], ids[-1]]):
        got = await page.evaluate(ST_REVEAL, {"id": item})
        await page.evaluate(FRAMES)
        settled = await page.evaluate("(id) => !__h.box.querySelector(`[data-aixc-item=\"${CSS.escape(id)}\"]`).closest('[inert]')", item)
        if not (got["back"] is True and got["top"] and got["whole"] and got["inside"] and not got["inert"] and settled and got["windowScroll"] == 0):
            bad.append((item, got, settled))
    check(f"{tag}: reveal() of the billboard's, a middle and the last row card's and the closing band's item returns true, the item at the box's view under the bar, inside its sides, pressable at once, the window still", not bad, bad[:3])
    await page.evaluate("(id) => __h.current.reveal(id)", cards[len(cards) // 2])
    await page.evaluate(FRAMES)
    pick = await page.evaluate(ST_NEAREST)
    check(f"{tag}: a card a press reaches", pick is not None, pick)
    if pick is None:
        return
    mid, at = pick["id"], pick["at"]
    await page.mouse.click(at[0], at[1])
    await page.wait_for_function("() => __h.box.querySelector('.st-modal').open", timeout=5000)
    await page.wait_for_timeout(500)
    shown = await page.evaluate(ST_PREVIEW, {"zones": zones})
    check(f"{tag}: the preview shows in the box: not modal, nothing in the top layer, positioned absolute over the box's room under the bar ({shown['rect']} / {shown['want']})", shown["open"] and not shown["modal"] and shown["popover"] == 0 and shown["position"] == "absolute" and shown["room"], shown)
    check(f"{tag}: while it shows the rest of the box is inert (its bar, the rows, the view bar) and the box's scroll held", shown["navInert"] and shown["rowsInert"] and shown["barInert"] and not shown["dialogInert"] and shown["overflowY"] == "hidden", shown)
    hits = []
    for k in (0, 0.5, 1):
        await page.evaluate("(k) => { const p = __h.box.querySelector('.st-modal__panel'); p.scrollTop = Math.round((p.scrollHeight - p.clientHeight) * k) }", k)
        await page.evaluate(FRAMES)
        now = await page.evaluate(ST_PREVIEW, {"zones": zones})
        if now["hits"] or now["pressables"] < 1:
            hits.append((k, now["pressables"], now["hits"][:2]))
    check(f"{tag}: through its own scroll the preview's close button and links that take a press ({shown['pressables']}) are clear of both zones, the focus in it", not hits and shown["focusIn"], {"hits": hits[:3], "focus": shown["focus"]})
    await page.evaluate("() => { __h.box.querySelector('.st-modal__panel').scrollTop = 0; __h.box.querySelector('.st-modal__close').focus() }")
    count = await page.evaluate("() => __h.box.querySelectorAll('.st-modal :is(a[href], button)').length")
    stray = []
    for key in ["Tab"] * min(count + 2, 14) + ["Shift+Tab"] * min(count + 2, 14):
        await page.keyboard.press(key)
        now = await page.evaluate(ST_PREVIEW, {"zones": zones})
        if not now["focusIn"]:
            stray.append((key, now["focus"]))
    check(f"{tag}: Tab and Shift+Tab keep the focus in the preview", not stray, stray[:3])
    await page.mouse.move(at[0], at[1])
    await page.mouse.wheel(0, 500)
    await page.evaluate(FRAMES)
    wheeled = await page.evaluate(ST_PREVIEW, {"zones": zones})
    check(f"{tag}: a wheel over the preview scrolls neither the box nor the window", wheeled["windowScroll"] == 0 and wheeled["boxScroll"] == shown["boxScroll"] and wheeled["open"], wheeled)
    await page.evaluate("() => __h.box.querySelector('.st-modal__close').focus()")
    await page.keyboard.press("Escape")
    await page.wait_for_function("() => !__h.box.querySelector('.st-modal').open", timeout=5000)
    await page.evaluate(FRAMES)
    after = await page.evaluate(ST_PREVIEW, {"zones": zones})
    check(f"{tag}: Escape closes the preview: the focus back on its card's button, the box's scroll and the rest as before", not after["open"] and after["focus"] == mid and after["overflowY"] == "auto" and not after["navInert"] and not after["barInert"] and after["windowScroll"] == 0, after)
    await page.evaluate("() => { document.activeElement?.blur(); __h.box.scrollTo({ top: 0, behavior: 'instant' }) }")
    await page.evaluate(FRAMES)


# The opening while it plays: in the box over its room (not fixed to the screen), Skip inside it and clear of the zones,
# the wordmark's face not Roboto.
ST_INTRO = """({ zones }) => {
  const box = __h.box
  const b = box.getBoundingClientRect()
  const intro = box.querySelector('.st-intro')
  const skip = box.querySelector('.st-skip')
  const i = intro.getBoundingClientRect()
  const s = skip.getBoundingClientRect()
  const room = { left: b.left + box.clientLeft, right: b.left + box.clientLeft + box.clientWidth, top: b.top + box.clientTop + 57, bottom: b.top + box.clientTop + box.clientHeight }
  const zoneRects = """ + ZONE_RECTS + """
  const meets = (r, z) => r.left < z.right && r.right > z.left && r.top < z.bottom && r.bottom > z.top
  return {
    shown: !intro.hidden && !skip.hidden,
    position: getComputedStyle(intro).position,
    covers: Math.abs(i.top - room.top) <= 1 && Math.abs(i.bottom - room.bottom) <= 1 && Math.abs(i.left - room.left) <= 1 && Math.abs(i.right - room.right) <= 1,
    skipInside: s.width > 0 && s.left >= room.left && s.right <= room.right && s.top >= room.top && s.bottom <= room.bottom,
    skipZones: zoneRects.filter(([, z]) => meets(s, z)).map(([zone]) => zone),
    font: getComputedStyle(box.querySelector('.st-brand .st-word')).fontFamily,
    rect: [i.left, i.top, i.right, i.bottom].map(Math.round),
    skip: [s.left, s.top, s.right, s.bottom].map(Math.round),
    room: [room.left, room.top, room.right, room.bottom].map(Math.round),
  }
}"""


async def streaming_after(browser, langs):
    """The opening in the box, with motion allowed (desktop and phone, en and ar): it covers the box's room under the
    bar, Skip inside it clear of both zones, the wordmark not in Roboto; the box's scroll ends it (the window never
    scrolls); a second view's Skip ends it and hands the focus to the brand."""
    for width, height in [(1366, 900), (375, 812)]:
        for lang in langs:
            tag = f"streaming {lang} {width}x{height} the opening (motion allowed)"
            zones = ZONES[(width, height)]
            context, page = await open_harness(browser, width, height, lang, zones, "no-preference")
            await page.evaluate("(name) => __h.load(name)", "streaming")
            await page.evaluate("() => { __h.open('streaming') }")
            await page.wait_for_timeout(300)
            got = await page.evaluate(ST_INTRO, {"zones": zones})
            check(f"{tag}: plays in the box over its room under the bar ({got['rect']} / {got['room']}), not fixed to the screen", got["shown"] and got["position"] == "absolute" and got["covers"], got)
            check(f"{tag}: Skip {got['skip']} inside the box's room and clear of both zones", got["skipInside"] and not got["skipZones"], got)
            check(f"{tag}: the wordmark's face is not Roboto ({got['font']})", "roboto" not in got["font"].lower(), got["font"])
            await page.evaluate("() => { __h.box.scrollTop = 40 }")
            try:
                await page.wait_for_function("() => __h.box.querySelector('.st-intro').hidden && __h.box.querySelector('.aixc-vx--streaming').classList.contains('is-ready')", timeout=5000)
                ended = True
            except Exception:  # noqa: BLE001 -- the finding is that it did not end
                ended = False
            check(f"{tag}: the box's scroll ends it, the window still", ended and await page.evaluate("() => scrollY") == 0)
            await page.evaluate("() => { __h.close(); __h.box.scrollTop = 0; __h.open('streaming') }")
            await page.wait_for_timeout(300)
            skip = await page.evaluate("() => { const r = __h.box.querySelector('.st-skip').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2] }")
            await page.mouse.click(skip[0], skip[1])
            try:
                await page.wait_for_function("() => __h.box.querySelector('.st-intro').hidden && document.activeElement?.classList.contains('st-brand')", timeout=5000)
                skipped = True
            except Exception:  # noqa: BLE001
                skipped = False
            check(f"{tag}: Skip ends it and hands the focus to the brand, the window still", skipped and await page.evaluate("() => scrollY") == 0)
            left = await page.evaluate("() => { __h.close(); return __h.seam.keptCount() }")
            check(f"{tag}: closed: nothing kept", left == 0, left)
            check(f"{tag}: no page errors", page.errors == [], page.errors)
            await context.close()


# In the order they run. The selectors of the todo rows are today's markup (what box_generic() would check once
# the row is done); a phase that converts one adjusts its row as it drops `todo`.
# The flipbook (phase 4, 2026-11-18). reveal(id): the item's page open and the item in the box's view (under the bar,
# and under the row held there; above the box's bottom and the row held there too when it fits), not inert, the
# window still.
FB_REVEAL = """async ({ id }) => {
  const box = __h.box
  const back = __h.current.reveal(id)
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  const b = box.getBoundingClientRect()
  const stage = box.querySelector('.fb-stage')
  const row = box.querySelector('.fb-controls').getBoundingClientRect()
  const top = stage.classList.contains('fb-row-top') ? Math.max(b.top + box.clientTop + 57, row.bottom) : b.top + box.clientTop + 57
  const bottom = stage.classList.contains('fb-row-low') ? row.top : b.top + box.clientTop + box.clientHeight
  const n = [...box.querySelectorAll('[data-aixc-item]')].find((x) => x.dataset.aixcItem === id)
  const r = n.getBoundingClientRect()
  const fits = r.height <= bottom - top + 1
  return { back, none: __h.current.reveal('no-such-item'), top: Math.round(r.top - top), fits, inView: r.top >= top - 1 && r.top < bottom && (!fits || r.bottom <= bottom + 1), inert: !!n.closest('[inert]'), windowScroll: scrollY }
}"""

# Where the row is: under the book (then the whole stage fits the box's room at its top), held 12 px over the box's
# bottom (fb-row-low) or above the book, held under the bar (fb-row-top), the box at its top.
FB_ROW = """() => {
  const box = __h.box
  const rect = (n) => n.getBoundingClientRect()
  const stage = box.querySelector('.fb-stage')
  const desk = rect(box.querySelector('.fb-desk'))
  const row = rect(box.querySelector('.fb-controls'))
  const b = rect(box)
  return { under: row.top >= desk.bottom - 1, above: row.bottom <= desk.top + 1, top: stage.classList.contains('fb-row-top'), low: stage.classList.contains('fb-row-low'), bottom: Math.round(b.top + box.clientTop + box.clientHeight - row.bottom), fits: rect(stage).bottom <= b.top + box.clientTop + box.clientHeight + 1, sticky: getComputedStyle(box.querySelector('.fb-controls')).position, desk: [desk.left, desk.right].map(Math.round), status: box.querySelector('.fb-status').textContent }
}"""

# One turn by next (a press on the button, as the reader's), and how long the turn takes to settle (the leaf's 0.95 s
# with motion allowed; flipbook.js fences again 1 s after it starts).
FB_NEXT = """async ({ wait }) => {
  const box = __h.box
  const next = box.querySelector('.fb-controls .vx-round:last-child')
  if (next.disabled) return false
  next.click()
  await new Promise((r) => setTimeout(r, wait))
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  return true
}"""


async def flipbook_extra(page, tag, zones, layout):
    """The flipbook's own: the row under the book only where the stage fits the room (above it on phones, held under
    the bar); from 720 px the book beside both zones at rest; reveal(); then every page in turn by next, the box at
    its top: the row clear of both zones, nothing pressable in either, nothing cut by the box's sides, the window
    still."""
    listening = "listening" in tag
    row = await page.evaluate(FB_ROW)
    check(f"{tag}: the row under the book where the stage fits the room, else held 12 px over the box's bottom (from 720 px) or above the book under the bar", (row["under"] and row["fits"] and not row["top"] and not row["low"]) or (row["low"] and not row["fits"] and abs(row["bottom"] - 12) <= 2 and row["sticky"] == "sticky") or (row["above"] and row["top"] and row["sticky"] == "sticky"), row)
    if layout == "phone":
        check(f"{tag}: on a phone the row above the book", row["above"], row)
    elif not listening:
        width = await page.evaluate("() => __h.box.clientWidth")
        check(f"{tag}: from 720 px the book {row['desk']} beside both zones", row["desk"][0] >= zones["left-w"] and row["desk"][1] <= width - zones["right-w"], {"desk": row["desk"], "zones": zones, "width": width})
        check(f"{tag}: from 720 px the row at the bottom centre (under the book, or held over the box's bottom)", not row["top"], row)
    ids = await page.evaluate("() => __h.itemIds")
    rev = await page.evaluate(FB_REVEAL, {"id": ids[len(ids) // 2]})
    check(f"{tag}: reveal() opens the item's page with the item in the box's view, the window still; false for an item it lacks", rev["back"] is True and rev["none"] is False and rev["inView"] and not rev["inert"] and rev["windowScroll"] == 0, rev)
    # Back to the cover, the box at its top.
    await page.evaluate("""() => { const prev = __h.box.querySelector('.fb-controls .vx-round:first-child'); while (!prev.disabled) prev.click(); __h.box.scrollTo({ top: 0, behavior: 'instant' }) }""")
    await page.wait_for_timeout(1100)
    wait = 1100
    bad, places, seen = [], 0, 0
    while True:
        status = await page.evaluate("() => __h.box.querySelector('.fb-status').textContent")
        zone = await page.evaluate(CONTROLS_IN_ZONES, {"zones": zones, "controls": [".fb-controls"], "name": "flipbook"})
        sides = await page.evaluate(CUT_BY_SIDES, {"name": "flipbook"})
        seen += zone["seen"]
        if zone["each"][0]["shown"] == 0 or zone["each"][0]["zones"]:
            bad.append((status, "row", zone["each"][0]))
        if zone["out"]:
            bad.append((status, "in a zone", zone["out"][:2]))
        if sides["cut"]:
            bad.append((status, "cut", sides["cut"][:2]))
        places += 1
        if not await page.evaluate(FB_NEXT, {"wait": wait}):
            break
    check(f"{tag}: every page in turn ({places} places, {seen} pressables read): the row shown and clear of both zones, nothing pressable in either, nothing cut by the box's sides", places >= 4 and seen > 0 and not bad, bad[:3])


EXPERIENCES = {
    "spotlight": row(run=run_spotlight),
    "magazine": row(run=run_magazine),
    "fan": row(pins=(".fn-stage", ".fn-track"), controls=[".fn-controls", ".fn-detail"], extra=fan_extra, listening=[(1366, 900), (1024, 768), (768, 1024)]),
    # Phase 2 (2026-11-18): its row and rail out of both zones; phones in landscape too, as its row sits low. In a
    # short box (from 720 px wide under 700 px tall, or any under 500) split.css does not show the rail. The tablet
    # sizes again with the guide listening (its transcript bar widens the right zone), as spotlight's; its jumps, its
    # row under the title on phones, and its rail at 700 px tall (split_extra, split_after).
    "split": row(pins=(".ss-stage", ".ss-track"), controls=split_controls, sizes=GENERIC_SIZES + [(812, 375)], listening=[(1024, 768), (768, 1024)], extra=split_extra, after=split_after),
    "coverflow": row(pins=(".cf-stage", ".cf-track"), controls=[".cf-controls", ".cf-panel"], sizes=[*GENERIC_SIZES, (812, 375)], extra=coverflow_extra, listening=[(1366, 900), (1024, 768), (812, 375), (375, 812)]),
    # Phase 2 (2026-11-18): its prev / next and the shown service's actions out of both zones (the foot one column
    # at the bottom centre; beside the ring in a short box); phones in landscape too, as its row sits low; the tablet
    # sizes again with the guide listening (its transcript bar widens the right zone), as split's. The
    # services the ring turns past the stage's sides or into a zone are inert while there (ring.js fence()), which
    # the generic pressable, zone and sides checks see with motion allowed, mid-turn.
    # The review (2026-11-18) added shorter phones (375x667, 360x640) and a short laptop window (1024x600), the guide
    # listening in the short box (812x375, 1024x600) and on a phone, and ring_extra: the ring's room, fence()'s
    # zones and the short box's clipped column during a fast turn.
    "ring": row(pins=(".rg-stage", ".rg-track"), controls=[".rg-nav", ".rg-detail__actions"], sizes=GENERIC_SIZES + [(812, 375), (375, 667), (360, 640), (1024, 600)], listening=[(1024, 768), (768, 1024), (812, 375), (1024, 600), (375, 812)], extra=ring_extra),
    # Phase 3 (2026-11-18): its prev / next row and the shown piece's caption (its link) out of both zones (the row at
    # the bottom centre from 720 px, under the stage's title on phones); phones in landscape too, as its row sits low;
    # the guide listening where the row or the caption could meet its transcript bar. The pieces hung past the box's
    # sides or into a zone are inert while there (gallery.js fence()), which the generic pressable, zone and sides
    # checks see with motion allowed; gallery_extra: reveal() and the phones' row.
    # The review (2026-11-18) added shorter phones (375x667, 360x640), short laptop windows (1366x700, 1024x600: the
    # start column) and a tablet (768x1024: the caption beside the wall at 720..899 px), each with the guide listening
    # too, every piece shown in turn and a header as tall as Vodafone's (gallery_extra: GALLERY_COVER, GALLERY_HEADER).
    "gallery": row(pins=(".gl-stage", ".gl-track"), controls=[".gl-controls", ".gl-caption"], sizes=GENERIC_SIZES + [(812, 375), (375, 667), (360, 640), (1366, 700), (1024, 600), (768, 1024)], listening=[(1366, 900), (1024, 768), (812, 375), (375, 812), (375, 667), (1366, 700), (1024, 600), (768, 1024)], extra=gallery_extra),
    # Phase 3 (2026-11-18): the scene pins at the bar while the story scrolls over it; no controls (the scene is drawn
    # only). The story's links and buttons take no pointer events while one passes under a corner (journey.js
    # keepClear(), never inert: the keyboard and a screen reader meet each in order); a focused one is moved clear.
    # The closing band above the taller zone at the box's end. A phone in landscape and a shorter phone for the short box;
    # the guide listening at each width, where its transcript bar meets the story. journey_extra: its h1, the intro's
    # words clear of the zones, reveal(), the scene's progress, the band at the end, the focus (from below the view,
    # and in view inside a zone: clearFocus()).
    "journey": row(pins=(".jr-scene", ".aixc-vx--journey"), controls=[], sizes=GENERIC_SIZES + [(812, 375), (375, 667)], listening=[(1366, 900), (1024, 768), (812, 375), (375, 812)], extra=journey_extra),
    # Phase 3 (2026-11-18): the stage pinned beside the story (from 900 px) or under the sheets (phones); its dots
    # out of both zones: from 900 px a column at the stage's start edge above the zone on that side, a row at the
    # stage's top where the column does not fit (cube.js placeDots()), on phones a row at the top left over the
    # sheets. The story's and the closing band's links are inert while they pass a corner's zone (cube.js fence()),
    # which the generic pressable check sees along the track. Phones in landscape too (a short box), and the guide
    # listening where the column or the row could meet its transcript bar: from 900 px in Arabic the column is over
    # the right zone; at 812x375 the row is in the box's top band.
    # The review (2026-11-18) added a short laptop window (1024x600), at rest and listening: there in Arabic the
    # column fits at rest and turns into the row as the guide starts to listen, the row from 900 px clear of the HUD.
    "cube": row(pins=(".cb-stage", ".cb-layout"), controls=[".cb-dots"], sizes=GENERIC_SIZES + [(812, 375), (1024, 600)], listening=[(1366, 900), (1366, 768), (1024, 768), (812, 375), (375, 812), (1024, 600)], extra=cube_extra),
    # Phase 3 (2026-11-18): the 3D tunnel with motion allowed (under reduced motion it lays flat, as on the clone): the
    # stage pinned at the bar, the HUD's prev / next out of both zones (from 720 px at the bottom centre between them,
    # lifted above the taller one where the row does not fit; on phones under the HUD's title row); the words and
    # services flying past the stage's sides or into a zone inert while there (tunnel.js fence()), which the generic
    # zone and sides checks see mid-flight, two frames after each jump. The guide listening where its transcript bar
    # could meet the pair or the cards' column (a tablet's bottom row; the column moves between the zones). Laid flat
    # (tunnel_after): a phone in landscape (its room under SHORT_ROOM), at rest and listening, and reduced motion.
    # The review (2026-11-18) added a tablet (768x1024), at rest and listening: there the row between the zones does
    # not fit while the guide listens and the pair is lifted above the taller zone; tunnel_settled() settles on each
    # stop (words included) with nothing inert or cut; laid flat, Tab reaches every service's link (tunnel_tab_flat).
    "tunnel": row(pins=(".tn-stage", ".tn-track"), controls=[".tn-hud__nav"], sizes=GENERIC_SIZES + [(768, 1024)], listening=[(1366, 900), (1024, 768), (768, 1024), (375, 812)], extra=tunnel_extra, after=tunnel_after),
    # Phase 4 (2026-11-18): the book turns its pages in place (it does not pin). From 720 px the book keeps beside both
    # zones and its row sits at the bottom centre between them: under the book where the whole stage fits the room,
    # else held 12 px over the box's bottom; on phones and where the lane is too narrow while the guide listens the row
    # is above the book, held under the bar; what of the book meets a zone takes no pointer events while there (flipbook.js keepClear()). Phones in
    # landscape (a box far shorter than the book) and a tablet; the guide listening at each width. flipbook_extra: the
    # row's place, the book beside the zones, reveal(), every page in turn.
    "flipbook": row(controls=[".fb-controls"], sizes=GENERIC_SIZES + [(812, 375), (768, 1024)], listening=[(1366, 900), (1024, 768), (812, 375), (375, 812), (768, 1024)], extra=flipbook_extra),
    # Phase 4 (2026-11-18): the stage is the box's room and takes the drag; its controls are the head's jump links at the
    # stage's top (from 720 px); the cards that rest in a corner's zone or past the box's sides are inert while there
    # (canvas.js fence()), which the generic checks see with motion allowed; a phone in landscape for the short box; the
    # guide listening at each width. canvas_extra: reveal(), the arrow keys' pans, the preview in the box (view-dialog.js
    # viewDialog: not in the top layer, the rest inert, Tab kept in it, Escape giving the focus back). canvas_after (the
    # review, 2026-11-20): one tap opens a preview on a touch screen under reduced motion; Escape gives the focus back
    # after the zones changed under the preview.
    "canvas": row(controls=canvas_controls, sizes=GENERIC_SIZES + [(812, 375)], listening=[(1366, 900), (1024, 768), (375, 812), (812, 375)], extra=canvas_extra, after=canvas_after),
    # Phase 4 (2026-11-20): its bar pinned at the box's top; no pinned stage: the view scrolls in the box, and what
    # passes a bottom corner's zone takes no press there (streaming.js fence(): no pointer events, Tab still reaches it)
    # while row cards and bar links the box's sides cut are inert, which the generic checks see at the box's top, middle
    # and end with motion allowed (the opening, which the box's scroll ends); a phone in landscape for the short box;
    # the guide listening where its transcript bar meets the rows. streaming_extra: reveal(), the preview in the box
    # (view-dialog.js viewDialog: not in the top layer, the rest inert, Tab kept in it, Escape giving the focus back);
    # streaming_after: the opening in the box (Skip clear of the zones, ended by the box's scroll), no Roboto.
    "streaming": row(controls=[".st-nav"], sizes=GENERIC_SIZES + [(812, 375)], listening=[(1366, 900), (1024, 768), (375, 812)], extra=streaming_extra, after=streaming_after),
}


async def main():
    tried = [n for n in os.environ.get("BOX_TRY", "").split(",") if n]
    unknown = [n for n in tried if n not in EXPERIENCES or EXPERIENCES[n]["run"]]
    if unknown:
        sys.exit(f"BOX_TRY: no generic row called {', '.join(unknown)}")
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        only = sys.argv[2].split(",") if len(sys.argv) > 2 else None
        sizes = SIZES
        if only:
            sizes = [s for s in sizes if f"{s[0]}x{s[1]}" in only]
        # Generic rows: the sizes and languages the second argument names (all of either when it names none).
        only_sizes = [t for t in only or [] if "x" in t]
        langs = [lang for lang in ("en", "ar") if lang in (only or [])] or ["en", "ar"]
        for name, spec in EXPERIENCES.items():
            if tried:
                if name not in tried:
                    continue
            elif spec["todo"]:
                print(f"TODO {name}: {spec['todo']}")
                continue
            if spec["run"]:
                await spec["run"](browser, sizes, only)
                continue
            for width, height in spec["sizes"]:
                if only_sizes and f"{width}x{height}" not in only_sizes:
                    continue
                for lang in langs:
                    await box_generic(browser, name, width, height, lang)
            # Under the guide's listening zone too, at the sizes the row names.
            for width, height in spec["listening"]:
                if only_sizes and f"{width}x{height}" not in only_sizes:
                    continue
                for lang in langs:
                    await box_generic(browser, name, width, height, lang, listening=True)
            # The row's own checks at sizes of its own, once.
            if spec["after"] and not only_sizes:
                await spec["after"](browser, langs)
        await browser.close()
    failed = [name for name, ok in results if not ok]
    print(f"\n{len(results) - len(failed)}/{len(results)} checks passed")
    sys.exit(1 if failed else 0)


asyncio.run(main())
