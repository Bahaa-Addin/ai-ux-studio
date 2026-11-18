# Phase 4b: bring Reimagine's other eleven experiences into the box on Vodafone's pages

**Date:** 2026-11-18
**Status:** PLANNED
**Bead(s):** none (bd is not installed on this Mac)
**Epic:** Live demos Way 2, phase 4 (Reimagine on Vodafone's pages), ADR-0076
**Chain:** `standalone-b570a8c4` seq `1` (copied from paired handoff)
**Context:** See `HANDOFF_standalone-b570a8c4_phase4a-frame-landed_2026-11-18.md` for session data, test results, and prior approaches.

---

## Problem Statement

Phase 4a landed the frame (commits 3992aa5, edc544d, 2b7ac42, cfa3192, a19677b on `feature/live-way2`): on Vodafone's gate pages the launcher opens a templates-only composer, and **magazine and spotlight** render in our own scrolling box (`#experience-output.aixc-box`) under Vodafone's header, with their controls out of the two physical bottom safe zones. The other **eleven experiences** (fan, split, coverflow, ring, gallery, cube, journey, tunnel, flipbook, canvas, streaming) are not offered on live pages: they still read and write the window's scroll directly (1–5 `window.*` scroll uses each, 0 uses of the seam's `on()`), ten pin a stage with `position: sticky` that only works inside our box, their controls sit in corners Vodafone's accessibility button, the guide's mic and the Pocket occupy, canvas and streaming open modal dialogs that would cover Vodafone's accessibility button (AGENTS.md §4.6), and streaming's wordmark asks for Roboto from Google Fonts. Phase 4b (design §5 item 2) converts each one, test first, so all 13 templates work in the box in English and Arabic at desktop, laptop, tablet and phone sizes. See "Evidence & Data" and "Appendix K" in the handoff for per-experience counts and the design's notes.

Owner approval: the design (057e8fb) and its order 4a → 4b → 4c were approved on 2026-11-17; the explicit go-ahead that day was for 4a; on 2026-11-18 the owner ran `/handoffplan`, asking the next session to execute this plan. Live-site checks stay in 4c.

## Key Findings

- The seam in `experiences/src/aixc/experiences/shared.js` is proven on spotlight and magazine: `configure({ scroller, wrap, copy })`, `on()`, `frame()`, `later()`, `onScrollFrame()`, `scrollToY()`, `viewTop()` etc.; with no scroller the clone's numbers are unchanged (252-case grid; clone suites green) → drives Phases 2–4 (every experience follows spotlight's conversion pattern).
- Variables must be MAPPED by the experience's CSS under `.aixc-box .aixc-vx--<name>` (the shell sets only raw measures: `--aixc-box-h`, `--aixc-viewbar-h`, `--aixc-pin-y`, `--aixc-safe-{left,right}-{w,h}`); values set on the box never reach `.aixc-vx` (spec v1's blocker) → drives every phase's CSS work.
- Live selectors must be classes (`.aixc-box`), never ids or `data-aixc-*` (the Pocket's page-turn copy strips them) → drives all CSS.
- Box-only geometry checks can pass while painting is wrong (WebKit board, B-66): every phase saves and looks at screenshots, en and ar, desktop and phone → drives Validates-with.
- Spotlight needed three size regimes in the box (desktop ≥ 1180 px and ≥ 850 px tall; flowing short/tablet layout; phones with the row under the title) and a measured threshold; the eleven will need the same kind of per-regime rules → drives the shared test matrix in Phase 1.
- `on()` must never go through `guard.listen` (leak, B-71); listeners are added on mount and removed on unmount; `configure()` releases everything held → drives conversions.
- Budgets are tight (core 36 B left; launcher 9 B left); each experience is its own chunk with its own `REIMAGINE_BUDGETS` line and an `AIXC_LOADED_BY` entry (shell → experience) → drives every phase's sdk-size step.
- The clone's suites (`aixc_e2e.py` 298, `arabic_e2e.py` 71, `box_e2e.py` 1,228) are the guard that shared changes keep the clone identical → drives Validates-with.

## Anti-Goals (What NOT To Do)

- Do not set `--vx-top`/`--vx-vh` on the box, key live rules on ids or `data-aixc-*`, load the clone's `aixc.css` on live pages, or use `overscroll-behavior: auto` (all tried or proposed in 4a and rejected; see handoff "Key Decisions" and "Appendix J").
- Do not use `showModal()` or anything in the top layer on live pages, and do not load Roboto or any Google Font (AGENTS.md §4.6, §4.8; the owner's templates-only rule).
- Do not loosen an existing test to make a new behaviour pass (stage 1's agent loosened the pocket-chips audit; it was reverted). Never trust a box-only check for painting: look at the pictures.
- Do not touch phase 6's files (`experiences/src/pocket/*` beyond what a view seam needs, `packages/sdk/src/watch-chunk.ts`, `config/sites/vodafone-eg.yaml`) without messaging that session (`uds:/tmp/cc-socks/12158.sock`); do not change `experiences/src/host/index.js` (core budget 36 B) without telling it too.
- Do not commit `voice-guide/deploy/whisper/modal_app.py`, `docs/handoff/live-demos-way2.md`, or the side session's two uncommitted lines in the wiki page; never stage in the shared index; no attribution lines in commits.

## Plan

### Phase 1: Make the live test matrix data-driven and fix the shared gaps the eleven will hit

**Goal:** One table-driven e2e and harness so each experience added in Phases 2–4 is checked the same way at every size and language, and the shared helpers the eleven depend on are live-safe.

**Why this approach:** Spotlight's checks (pinned top = bar, bottom = box bottom, nothing pressable in a zone, steps move the box not the window, one exposed `h1`, every item once, no overflow) were written for one experience; eleven more need the same assertions plus their own behaviours. Doing it once avoids eleven slightly different copies (the review found weak copies twice in 4a).

- In `voice-guide/tests/e2e/reimagine-live.e2e.test.ts` (port 4482), extract the spotlight/magazine box checks into a helper `checkInBox(page, { experience, viewport, lang, pins, controls, reveal })` and a table `EXPERIENCE_CASES` (name → { pins: boolean, controlSelectors, revealAssert, specifics(page) }). Keep every existing assertion for magazine and spotlight unchanged (they become the first two rows); add the eleven rows as `todo` so the run lists what is left.
- Sizes per row: 1366x900, 1366x768, 1024x768, 375x812, en and ar (16 cells); plus 812x375 for experiences whose controls are near the bottom.
- In `experiences/tests/e2e/box_e2e.py` (+ `box-harness.html`), make the harness take an experience name so Phases 2–4 add rows there too (the clone-side guard of the CSS regimes; it runs without the live kit).
- Shared helpers: `shared.js` `pageHeading` must never render an empty `h1` (the shell gives `model.title` a fallback, but `pageHeading` should also skip when empty); `closingBand`/`storeLink` already text-link stores without icons; add the NEUTRAL_WORDS entries the eleven need ('Vodafone services, card fan' → 'Card fan', 'Gallery of Vodafone services' → 'Gallery', 'Vodafone services flipbook' → 'Flipbook', 'Vodafone services, ring/cover flow/split slideshow/hyper tunnel/infinite canvas' → neutral names, 'Services canvas. Use the arrow keys…' → '…between items', 'Vodafone Egypt · Services' → the page's name) with Arabic for the native review (O42 list grows).
- In `voice-guide/tests/unit/sdk-size.test.ts`, add a helper so each new experience's budget line and `AIXC_LOADED_BY` entry are one row each (no new budgets yet).
- GitNexus `impact` before editing `pageHeading`, `words` (both reach all 13 experiences: expect CRITICAL; the clone suites are the guard).

**Files:** `voice-guide/tests/e2e/reimagine-live.e2e.test.ts`, `experiences/tests/e2e/box_e2e.py`, `experiences/tests/e2e/box-harness.html`, `experiences/src/aixc/experiences/shared.js`, `experiences/src/i18n.js` (Arabic for new neutral keys), `voice-guide/tests/unit/sdk-size.test.ts`.
**Validates with:** reimagine-live (4482) still 22/22 for the existing cases with the eleven listed as todo; `box_e2e.py` 1228/1228; `aixc_e2e.py` 298/298 and `arabic_e2e.py` 71/71 (clone unchanged); experiences `npm test` 244/244 (+ new unit tests for `words()` keys); sdk-size 4/4.
**Rollback:** revert the test refactor files; shared.js changes are additive (new NEUTRAL_WORDS keys) and can be reverted alone.

### Phase 2: The simple pinning experiences — fan, split, coverflow, ring

**Goal:** Four experiences with a pinned stage and prev/next controls work in the box, each with its controls out of both zones.

**Why this approach:** They share spotlight's shape (sticky stage + stepper + prev/next), so the proven conversion applies directly; ring's footer and coverflow's phone panel are the two the design says need a small redesign, so they come after fan and split.

- Per experience, test first: add its row in `EXPERIENCE_CASES` (Phase 1) with its controls' selectors and a reveal assertion; run it (fails: not in the registry), then build.
- JS: replace every `window.addEventListener('scroll'|'resize')`, `window.scrollTo/scrollBy/scrollY/innerHeight` with the seam (`onScrollFrame`, `on(window,'resize')`, `scrollToY`, `scrollTop`, `viewHeight`, `viewTop`); add listeners on mount through `on()` and remove on unmount (spotlight's `listen()` pattern); rAF ticks through `frame()`, timers through `later()`; `chromeOffset()` comparisons with `getBoundingClientRect` become `viewTop()`.
- `reveal(itemId)`: step the stage to the item instantly and return true (false if absent), as spotlight's.
- CSS: `.aixc-box .aixc-vx--<name>` rules: stage height the room (`var(--vx-vh)`), controls at the bottom centre from 720 px placed per physical zone (spotlight's `--sp-row-l/-r` approach), lifted above the taller zone when narrow; phones: controls in a row under the stage's title; any panel near a corner (fan's detail, split's controls, coverflow's phone panel, ring's footer) kept out of both zones; flowing short layout under the measured height switch if the stage cannot fit (measure, as spotlight's 850 px).
- Copy through `words()` for every 'services' string; the experience-level label neutral.
- Live wrapper `experiences/src/host/demos/reimagine/<name>.js` (copy spotlight's: faces, vx-shared, vx-<name>, `wrapExperience(render<Name>(…))`), registry line, sdk-size budget "a little above measured" with a dated comment, `AIXC_LOADED_BY` shell → it.
- After each experience: its rows in reimagine-live and box_e2e, the clone's `aixc_e2e.py`/`arabic_e2e.py`, screenshots at 1366x900 and 375x812 en/ar looked at.

**Files:** `experiences/src/aixc/experiences/{fan,split,coverflow,ring}.{js,css}`, `experiences/src/host/demos/reimagine/{fan,split,coverflow,ring}.js` (new), `registry.js`, `voice-guide/tests/unit/sdk-size.test.ts`, the Phase 1 test files.
**Validates with:** each row passes all 16 cells (pinned top = bar ±1, bottom = box bottom ±1 where pinned, nothing pressable in either zone, steps move the box not the window, one exposed h1, every item once, no horizontal overflow, `keptCount()` 0 after `configure()`); clone suites unchanged; sizes within budgets; the composer offers six templates.
**Rollback:** remove the experience's registry line (it disappears from the composer) and revert its files; others are independent.

### Phase 3: The heavier pinning experiences — gallery, cube, journey, tunnel

**Goal:** Four experiences with richer HUDs work in the box.

**Why this approach:** Same conversion, but each has a HUD or caption the design names (gallery's controls and phone caption, tunnel's HUD row, cube's dots, journey's own `h1` and sun mark), so they need per-experience layout work after Phase 2 proved the pattern on simpler ones.

- Same steps as Phase 2 for each.
- journey: its own `h1` must be the view's single exposed `h1` (the shell's `pageHeading` must not add a second); its sun mark uses `svgIcon` (page symbol or `aixc-` prefixed; the shell injects missing ones).
- cube: 10 `--vx-top/--vx-vh` uses in CSS: map each under `.aixc-box`; dots kept clear of the zones.
- tunnel: chapter steps and Tab navigation through the seam's `on()`; the HUD row at the bottom centre or under the title on phones.
- gallery: 4 window uses; controls and phone caption out of the zones.
- Measure each one's short-window switch if its stage cannot fit (record the numbers for ADR-0076).

**Files:** `experiences/src/aixc/experiences/{gallery,cube,journey,tunnel}.{js,css}`, `experiences/src/host/demos/reimagine/{gallery,cube,journey,tunnel}.js` (new), `registry.js`, sdk-size, test files.
**Validates with:** as Phase 2, all 16 cells per experience; clone suites unchanged; screenshots looked at.
**Rollback:** per experience, as Phase 2.

### Phase 4: Flipbook, canvas and streaming — no pinning, dialogs, the wordmark

**Goal:** The last three work in the box; canvas's and streaming's dialogs open without the top layer; streaming's wordmark uses Vodafone's bold face.

**Why this approach:** These carry the rule risks (modal dialogs over Vodafone's accessibility button; a Google Font), so they come last with dedicated tests; flipbook has no window scroll uses and is the easy one of the three.

- flipbook: page turning with inert hidden pages and its contents list; contents links scroll the box (as magazine's), never write a `#fragment`; controls out of the zones.
- canvas (4 window uses, a full-viewport fixed dialog, `showModal`): on live (a scroller is configured) open the preview with `dialog.show()` (or a `role="dialog"` element) inside the box, z-index below Vodafone's nav/dialogs, its own focus trap and Escape returning focus; drag/pan through the seam. Test: with the dialog open, a press at Vodafone's accessibility button's centre reaches the button, and its box/style/computed style equal `?aixc=off`'s (rule d); Escape closes and returns focus.
- streaming (5 window uses, 2 sticky, 2 fixed, 2 `showModal`, Roboto ×6): preview dialog as canvas's; the fixed skip button inside the box clear of the zones; the intro cancelled on the box's scroll (not the window's); `wordmarkFont()` a no-op on live and `--st-logo-font` → `var(--pocket-bold, …)` (Vodafone's bold face); sdk-size asserts no `fonts.googleapis` and no `Roboto` request (the kit records any request that would leave).
- Fonts by CDP (`CSS.getPlatformFontsForNode`) on the wordmark and headings on /en/home and the bundles page: no system font (rule h).

**Files:** `experiences/src/aixc/experiences/{flipbook,canvas,streaming}.{js,css}`, `experiences/src/host/demos/reimagine/{flipbook,canvas,streaming}.js` (new), `registry.js`, sdk-size, test files.
**Validates with:** all 16 cells each; the dialog cases (press reaches the accessibility button; rule d equal to `?aixc=off`; Escape and focus); no request to Google; fonts by CDP; clone suites unchanged (the clone keeps `showModal` and Roboto: the live behaviour is chosen by the configured scroller).
**Rollback:** per experience; if the non-modal dialog cannot meet the rules, keep canvas/streaming out of the registry and record why in ADR-0076.

### Phase 5: Review, full suites, commit, docs

**Goal:** Land 4b the way 4a landed: reviewed with skeptics, full suites green, committed through a private index, docs fact-checked.

**Why this approach:** Every 4a stage had real defects found only by the skeptic-verified review (13 of 21, 13 of 24); the full run found two cross-file test issues the targeted runs missed.

- Read-only review workflow in 4 areas (seam conversions; CSS and safe zones; dialogs and rules; tests), a refuting skeptic per finding; fix every confirmed one test first; a skeptic checks the fixes.
- Tell the revamp session (`uds:/tmp/cc-socks/97035.sock`) before the full runs; then `npm run typecheck`, voice-guide `npm test`, `npm run test:e2e`, experiences `npm test`, the clone's suites (aixc, arabic, pocket, tips, box, portal); send "done".
- GitNexus `detect_changes` on the worktree (expect critical: shared.js reaches all 13); commit in one or more commits through a private index (Appendix A of the handoff), then `git restore --source=HEAD --staged --worktree -- <paths>`.
- Docs: ADR-0076 (4b built, sizes, gaps), bug log (next B after B-83), open issues (next O after O44), HANDOFF, `docs/handoff/agent-handoff-2026-11-17.md` or a new dated one, the wiki (do not touch the side session's two lines; `git merge-file` for that file); a fact-check pass before the docs commit.

**Files:** as built; docs under `voice-guide/docs/**`, `docs/wiki/**`, `docs/handoff/agent-handoff-*.md`.
**Validates with:** test:e2e 0 fail (baseline 316 pass, 8 pending at cfa3192, plus the new cases); npm test ≥ 376/376; clone suites aixc 298, arabic 71, pocket 210, tips 87, box ≥ 1228 (more rows), portal 54/56; every Reimagine chunk within its budget, core ≤ 8,064 B.
**Rollback:** each phase's commit can be reverted alone; the registry line is the switch per experience.

## Dependencies & Order

- Phase 1 first (the matrix and shared words the others use).
- Phases 2, 3 and 4 can run as parallel builders in separate worktrees (disjoint experience files) once Phase 1 is committed; the shared files (`registry.js`, sdk-size, `reimagine-live.e2e.test.ts`, `box_e2e.py`, `shared.js` NEUTRAL_WORDS, `i18n.js`) take one-row additions that the lead merges by hand. Give each builder its own ports (only 4482 for reimagine-live: run one experience's rows at a time or split the runner per batch on 4483/4484, which are free in voice-guide but 4483 is used by the revamp's npm test — prefer 4484).
- Phase 5 after all three; B2 (S7 cells, guide spotlight via `reveal()`) and 4c (Arabic, colour audit, live checks) follow 4b.

## Risks & Mitigations

- **Some stages cannot fit the room at short heights** (likely: spotlight needed a measured 850 px switch; cube and tunnel have tall stages). Mitigation: measure each, use a flowing short layout below the measured switch, record the numbers; if a stage cannot be made to fit, record the gap (as O38/O39) rather than loosen the check.
- **Shared-code changes break the clone** (shared.js reaches all 13). Likelihood medium; mitigation: the clone suites after every experience, `configure()` never called on the clone.
- **Budget overruns** (each new chunk; shared chunks moving). Mitigation: measure after each experience; dated smallest-step raises; never raise the core without a reason.
- **Load-sensitive flakes** (F11's 0.1 s script bound, portal's click) when several builders run browsers. Mitigation: re-run a failure alone before calling it real; keep at most two browser-running builders at once.
- **Port and database contention** with the revamp and phase 6 sessions. Mitigation: the message protocol; phase 6 owns 4720–4739.

## Success Criteria

- Minimum: all 13 templates offered by the composer on the gate pages; each passes the 16-cell box matrix in reimagine-live and its rows in box_e2e; canvas's and streaming's dialogs non-modal with the accessibility-button checks; no Roboto or Google request; full suites 0 fail; clone suites at their baselines.
- Full: plus each experience's screenshots looked at in en and ar at 1366x900 and 375x812; every new Arabic string listed for the native review; ADR-0076 updated with 4b's sizes and gaps; the review's confirmed findings all fixed with failing-first tests.

## Quick Start

```bash
# Restore full context
cat plans/handoffs/HANDOFF_standalone-b570a8c4_phase4a-frame-landed_2026-11-18.md

# Key source files for Phase 1
experiences/src/aixc/experiences/shared.js              # the seam, NEUTRAL_WORDS, pageHeading
experiences/src/aixc/experiences/spotlight.{js,css}     # the converted pattern
experiences/src/host/demos/reimagine/{registry,spotlight,shell}.js
voice-guide/tests/e2e/reimagine-live.e2e.test.ts         # the checks to make table-driven
experiences/tests/e2e/box_e2e.py                         # the clone-side harness

# Baseline data to reference
voice-guide/docs/adr/0076-reimagine-on-vodafone-pages.md # sizes, gaps, pilot knobs
voice-guide/docs/qa/bugs-and-open-issues.md              # O37..O44

# Verify starting state (Postgres on 127.0.0.1:54329; tell the revamp session before full runs)
cd experiences && timeout 300 npm test                   # 244/244
cd ../voice-guide && timeout 300 node --test tests/unit/sdk-size.test.ts && timeout 300 node tools/typecheck.ts

# First concrete action
# Make a scratch worktree (git worktree add --detach <scratch>/wt-4b a19677b, sandbox off; symlink both node_modules),
# then in reimagine-live.e2e.test.ts extract spotlight's box checks into checkInBox() + EXPERIENCE_CASES
# with magazine and spotlight as the first rows, and run it on 4482: still 22/22.
```
