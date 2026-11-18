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

# In the order they run. The selectors of the todo rows are today's markup (what box_generic() would check once
# the row is done); a phase that converts one adjusts its row as it drops `todo`.
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
    "gallery": row(todo=PHASE_4B, pins=(".gl-stage", ".gl-track"), controls=[".gl-controls"]),
    "cube": row(todo=PHASE_4B, pins=(".cb-stage", ".cb-layout"), controls=[".cb-dots"]),
    "journey": row(todo=PHASE_4B, pins=(".jr-scene", ".aixc-vx--journey"), controls=[]),
    "tunnel": row(todo=PHASE_4B, pins=(".tn-stage", ".tn-track"), controls=[".tn-hud__nav"]),
    "flipbook": row(todo=PHASE_4B, controls=[".fb-controls"]),
    "canvas": row(todo=PHASE_4B, controls=[]),
    "streaming": row(todo=PHASE_4B, controls=[".st-nav"]),
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
