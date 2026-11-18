# Live demos Way 2: phase 4a (Reimagine's frame on Vodafone's pages) and the actors' rest mode landed; next is 4b

**Date:** 2026-11-18
**Status:** COMPLETED (phase 4a frame and F11 landed; 4b, B2 and 4c not started)
**Bead(s):** none (bd is not installed on this Mac)
**Epic:** Live demos Way 2 (`docs/handoff/live-demos-way2.md`, the plan; never edit or commit that file)
**Chain:** `standalone-b570a8c4` seq `1`
**Parent:** `none — first in chain`
**Prior chain:** none — first in chain (the project's own earlier handoffs are `docs/handoff/agent-handoff-2026-11-17.md`, rewritten in a19677b to today's state, and `voice-guide/docs/handoff/HANDOFF.md`)

---

## Reference Documents

- `voice-guide/AGENTS.md` — the rules (§4 must never be broken: never press commit points, never type credentials, never hide/cover/change Vodafone's accessibility widget or cookie banner, no new colours/fonts/styles, no secrets).
- `voice-guide/CLAUDE.md` — Claude Code specifics (timeouts, Postgres on 127.0.0.1:54329, handoff updates).
- `CLAUDE.md` (repo root, untracked) — GitNexus rules: run `impact` before editing a function, `detect_changes` before committing; `risk: UNKNOWN` is not an all-clear.
- `docs/handoff/agent-handoff-2026-11-17.md` — the project's own agent handoff, updated in a19677b with the four phase-4a commits and next steps.
- `voice-guide/docs/handoff/HANDOFF.md` — the running log; the 2026-11-17 (afternoon) entry is this session's.
- `voice-guide/docs/adr/0076-reimagine-on-vodafone-pages.md` — phase 4's ADR (Proposed), written to what was built; known gaps, sizes, pilot knobs.
- `voice-guide/docs/adr/0075-the-pocket-on-vodafone-pages-after-the-live-review.md` — the live review's fixes, plus the dated note "The rest mode (F11), landed 2026-11-17 (edc544d)".
- `voice-guide/docs/reference/live-way2-phase4-design-2026-11-17.md` — the phase 4 design (§0 the owner's answers; §3 the design; §5 the order 4a → 4b → 4c; §6 the gate table).
- `voice-guide/docs/qa/bug-log.md` (B-61 to B-83 are this session's) and `voice-guide/docs/qa/bugs-and-open-issues.md` (O30 closed; O37 to O44 new).
- `docs/wiki/All demos live on Vodafone's pages (Way 2).md` — the local wiki page (nimbalyst-local); it carries owner decisions as marks.

## The Goal

Run all five demos of the experience layer (the Pocket with its actors and portal, Reimagine, the journey/trail, the RED world, Tips) on Vodafone Egypt's real website pages without breaking any of AGENTS.md §4. Phase 4 brings **Reimagine** (13 ready-made "experiences" that redraw a page's cards: magazine, spotlight, journey, gallery, flipbook, cube, streaming, split, fan, ring, tunnel, canvas, coverflow) onto the live pages. The owner approved a design (box in the page with its own scroll, a safe area for the experiences' controls, the experiences' own palettes as a recorded exception, every page that passes the gate) and asked for it in three steps: **4a the frame** (done in this session), **4b the other eleven experiences**, **4c Arabic microcopy, the colour audit list and the live checks**. This session also landed the album actors' "rest mode" (F11) the owner approved after a side-by-side recording.

## Where We Are

- Branch `feature/live-way2` (local only, never pushed) is at **a19677b**; the five commits of this session after the morning's docs (9826c72): **3992aa5** groundwork, **edc544d** rest mode, **2b7ac42** stage 1, **cfa3192** stage 2, **a19677b** docs. All committed through a private `GIT_INDEX_FILE` with no attribution lines (the owner's rule).
- **Reimagine on Vodafone's pages works end to end for magazine and spotlight** (offline, on the saved pages through the live-page kit): the launcher (`experiences/src/host/demos/reimagine.js`) shows under the trail's pill on pages that pass the gate (coverage ≥ 0.9, ≥ 2 sections of ≥ 3 items, website only): `/home`, `/services`, `/mobile-internet-bundles`, `/vodafone-red1` in both languages; not on `/vodafone-cash`, `/wireless-net`, `/promotions`.
- A press loads the shell (`experiences/src/host/demos/reimagine/shell.js`, `box.js`, `live.css`, `copy.js`, `registry.js`) and opens a **templates-only composer** (no Gemini, no key field, no prompt, no CodePen data). Choosing magazine or spotlight hides `#main-content` (ADR-0075 §2 way: laid out, height 0, opacity 0, inert, attributes restored byte for byte) and shows `#experience-output.aixc-box` under Vodafone's header with its own scroll, the view bar (`#aixc-viewbar`) as its sticky first row, the experience in a stage, an end band ("Original page", "Continue to the page").
- **The other eleven experiences are NOT offered on live pages yet**: the registry has only `magazine` and `spotlight`. They still use `window` scroll APIs directly (counts in Code Analysis) and their controls are not laid out for the safe zones. That is phase 4b.
- **The experiences' scroll seam** (`experiences/src/aixc/experiences/shared.js`): `configure({ scroller, wrap, copy })`, `on()`, `frame()`, `later()`, `scrollTop()`, `viewHeight()`, `viewTop()`, `viewBottom()`, `scrollToY()`, `scrollByY()`, `scrollToElement()`, `onScrollFrame()`, `chromeOffset()`, `words()`; with no scroller every number equals the old ones (the clone is unchanged; a 252-case grid and the clone's suites prove it).
- **Safe zones** are measured raw by the shell (box.js) and set on the box (`--aixc-safe-left-w/-h`, `--aixc-safe-right-w/-h`, plus `--aixc-box-h`, `--aixc-viewbar-h`, `--aixc-pin-y`); the experiences' CSS maps them under `.aixc-box` (a class, because the Pocket's page-turn copy strips ids and `data-aixc-*`).
- **Spotlight in the box**: controls bottom-centre from 720 px (each physical side kept from its own zone, lifted above the taller zone when narrow); queue only from 1180 px wide AND 850 px tall; flowing short layout under 850 px tall; phones: controls row placed under the slide's title.
- **Magazine in the box**: contents links scroll the box (no `#fragment` in Vodafone's address); listeners on mount, removed on unmount; `reveal(itemId)`.
- **The composer's placement** (box.js): BELOW its opener and the pill when 216 px (H_MIN, measured) fit above the corner controls; else BESIDE in a column on the inline-start side of the opener (≥ 240 px wide, W_MIN, measured; ≤ 400 px; cut clear of the zones by 16 px and of the pill, launcher, bar controls and view name by 8 px); else BELOW scrolling. Never covers its opener, the pill, the launcher, a corner control or Vodafone's header. Checked on phones in landscape (812x375, 667x375, 844x390) and short laptops (1366x380/450).
- **The Pocket seams**: `host/demos/pocket.js` passes a `composer` handle to `initPocket` (`layer.demos.reimagine.state`); the album unmounts and remounts the view; the page turn's copy sets the copied `.aixc-box` scrollTop (`pocket.js` snapshotPage); the Pocket's resting curl is hidden during a view (live.css), its button stays.
- **The trail's cover** is shared between the shell and the journey chunk through `host.trailCover` (one object; `shown()` returns the served attributes), so the trail's memory of a page always shows Vodafone's page, never our view.
- **F11 rest mode** (edc544d): at rest the album's mascot and drone are drawn every 750 ms and move on the compositor in between (Web Animations on boxes, a rotor flipbook, a blink lid); cost at rest on `/en/services` 1366x900 with one sticker: **4 layouts and 0.033–0.042 s script per 3 s** (head without it: **180 layouts, 0.4166 s**). WebKit fallback: the board is its own SVG sheet (WebKit painted no board inside an animated foreignObject box).
- **Groundwork** (3992aa5): the live adapter's marks scoped to `#main-content` (our views keep their `data-aixc-item`), `normalizeContentModel` moved to `experiences/src/host/model.js` (content-index stays out of the core's graph), Vodafone's faces in `experiences/src/host/vodafone-faces.css` (`ensureCss('vodafone-faces')`), MIT licence + copyright comments at the top of the 11 experiences adapted from others' CodePen pens (not streaming: the owner's own pen; not magazine: no pen).
- **Tests at cfa3192** (full run, 2026-11-17 evening): experiences `npm test` 244/244; voice-guide `npm test` 376/376; `npm run test:e2e` 316 pass, 8 pending (the floating matrix's S6/S7 cells), 0 fail; typecheck ok; clone suites aixc 298/298, arabic 71/71, pocket 210/210, tips 87/87, box 1228/1228, portal 54/56 (AIXC-95's two frame checks, failing since 2026-11-13 on this Mac).
- **Sizes at cfa3192** (gzip, as sdk-size counts): core 8,028 of 8,064 B (**36 B left**); launcher 3,191 of 3,200 (**9 B left**); shell 23,704 of 25,088; magazine 10,505 of 10,752; spotlight 7,731 of 7,936; Pocket 28,249 of 30,464; chips 4,801 of 4,864; journey 8,311 of 8,960; actors 48,952 of 49,408.
- **Docs** (a19677b): ADR-0076 as built, ADR-0075 note, bug log B-61..B-83, open issues O30 closed + O37..O44, HANDOFF entry, `docs/handoff/agent-handoff-2026-11-17.md` rewritten, the wiki page updated. Fact-checked claim by claim (21 corrections applied and re-checked).
- **Nothing has been checked on the live site** in phase 4a (that is 4c). The last live run was 2026-11-17 morning (the live review's fixes): floating 0 violations, motion `cardsHiddenMs` 0.
- **Shared checkout state**: clean except the owner's `voice-guide/deploy/whisper/modal_app.py` (never commit) and 2 uncommitted lines in the wiki page written by a side session (a fork of the revamp session) at 2026-11-17 16:14 recording D1 as decided — leave them; they are not ours.
- **Phase 6 (page watch)** is being handled by another session ("Way 2 phase 6 page watch planning", worktree `.claude/worktrees/way2-phase6-planning-6ad0ec`, branch `claude/way2-phase6-planning-6ad0ec`). The owner said so (2026-11-18): stop asking about D1 here. ADR-0078 is that session's.

## What We Tried (Chronological)

1. **(early) The live review's fixes, before compaction.** Re-ran the floating and motion live checks in Chrome with `VG_LIVE_OUT` outside the repo; confirmed each §5 finding on fresh screenshots; fixed F1 (font fallback on /en/home: four `aixc-vodafone-{bold,light}-{en,ar}` aliases on Vodafone's own origin), F2/F3 (hideSource keeps `#main-content` laid out), F4/F5 (portal gutter, wall), F6/F6b (drone placement, refit on fixed obstacles), F7a/b (RTL), F8a/b, F9, F10, F12/NEW-8 (trail cover), F13, F14, NEW-2, each with a failing test → ADR-0075; commits 45ee9da, 9e5a369, 920a0be, ea6929e. **F11 (rest mode) was held** because it was large and visual; F6 was extracted alone. Lesson: the motion test's raw CDP capture grabbed the window surface; use `page.screenshot`.
2. **(early) Phase 4 design pass** (057e8fb): three read-only map readers + two critics; first draft had a rule breach (modal dialogs over the accessibility button) and wrong claims; second draft accepted with the owner's answers (box in the page; safe area; own palettes as exception; every page that passes). Then 9826c72: the owner's go-ahead for 4a, credits as MIT comments, the Arabic review gating 4c, F11 approved.
3. **(mid) The F11 port + groundwork workflow died at 07:16 across a context compaction** (wf_8a57aa44, status "killed", nothing landed). Restarted with code-only checks while another session held the e2e ports. Lesson: after a compaction, check every workflow's state file (`~/.claude/projects/<proj>/<session>/workflows/wf_*.json`, `status`).
4. **(mid) F11 port review**: a skeptic-verified review found 6 real defects in the port: changes between rest ticks overwritten/back-dated (a mascot kept facing a card after focus left; a pointer move turned him 20° in one drawing), reduced motion mid-rest ignored, non-pointer input not ending the rest, the rider's sheet fit failing when the silhouette's point count changed with pitch (83 of 4,000 pose pairs → 0 after fitting by named points), a rotor check that could not fail, and a WebKit risk. All fixed, each failing first.
5. **(mid) WebKit board check: the box-based check lied.** `webkit-board-check.mjs` printed "the same" (boxes within 1 px), but the pictures showed **no board painted at rest in WebKit**. Pixel-based check: board-red share at rest 0.04 vs 0.30 awake. Fix: the board is its own SVG sheet between the floor and the rig; a pixel-based WebKit+Chromium e2e case; a margin regression (8 px) the fallback caused was caught by `pocket_e2e.py` and fixed (`measureMascotInset` reads the deck from the board sheet). **Always look at the pictures.**
6. **(mid) Groundwork commit procedure slip**: after `git update-ref`, the shared index held a staged revert of the new commit (any commit there would have undone it). `cp` + `update-index` into the shared checkout was refused by the auto-mode classifier; **`git restore --source=HEAD --staged --worktree -- <my paths>`** (after checking `git diff --stat <old-head> -- <paths>` is empty) was allowed and is now the procedure.
7. **(mid) 4a frame spec v1 → two critics → v2.** v1 assumed the box could set `--vx-top`/`--vx-vh` (they are declared on `.aixc-vx` itself, so values on the box never reach the experience), parallel builders whose code could not build (the shell imports a seam that did not exist yet), no way back from Original to Reimagined, lost box scroll in the page turn, `overscroll-behavior: auto` (would carry spotlight's controls into the zones), a sprite duplicating Vodafone's own symbol ids, a launcher z-index that could not satisfy both "above content" and "below menus". v2 fixed all: stage 1 (seam A ∥ launcher L), then stage 2 (shell S).
8. **(mid) Stage 1 review rounds.** Round 1 flagged: launcher not tucking with the pill (it covered chips after a scroll; the agent had loosened the pocket-chips audit — reverted, the audit is byte-identical to 3992aa5), spotlight on phones taller than the screen (queue hidden in the box below 1180 px), 1024x768 tablets (same). Round 2 (13 of 21 confirmed): launcher overlapping the pill before the trail announces itself; the signed-out sign-in card not a hide reason; chips losing the launcher's rest; **`on()` through `guard.listen` leaking a clean-up per listener** (seam now owns its listeners; `configure()` releases them; no `listen`); spotlight ≥ 1180 px taller than the box on 1366x768 laptops; phones' row under all copy (double-tap could hit the next card's CTA); Arabic "Jump to a category" said services.
9. **(mid) Box harness moved into the repo** as `experiences/tests/e2e/box_e2e.py` + `box-harness.html` (1,228 checks; 464 fail with spotlight's `.aixc-box` rules removed).
10. **(mid) Stage 1 full run**: 2 e2e failures, both test issues: F9 chips case assumed no launcher (the launcher legitimately takes that corner without a pill → F9 runs with Reimagine off via a new kit option `demos`, plus a sibling case with the launcher); the F11 focus case had a setup race present since edc544d (pointer resting on a sticker → under load the mascot looked at it; setup now puts the pointer clear of stickers). Committed 2b7ac42.
11. **(late) Stage 2 build** (shell). Review: 13 of 24 confirmed. Biggest: **a template still loading when the reader opened the album (or pressed Original/Reset) left Reimagine stuck** (view under the album, no way out until reload); **launcher double press during the shell's load opened and closed the composer**; composer left open after Original; resize leaving the box bottom off-screen; the clone's Gemini/API-key copy reaching the shell via `i18n.js` (51 entries moved to `aixc/composer-words.js`; i18n chunk 8,314 → 6,171 B; Pocket 30,393 → 28,249 B); weak tests.
12. **(late) Composer on short screens**: round 3 removed an upper clamp that let the composer cover its opener and the pill — then the composer had **0 height** on phones in landscape (a reader could not choose a template). Round 4 added BESIDE placement (H_MIN 216 and W_MIN 240 measured, against my estimates of ~140 and ~280). Round 5: the pill became an obstacle, not the column's edge (667x375 English from Change got 278x249).
13. **(late) Full suites with stage 2 green**; portal suite crashed once (30 s click timeout under load right after test:e2e), 54/56 on two re-runs, same as stage 1. Committed cfa3192.
14. **(late) Docs**: Sonnet drafted from a facts file; an Opus fact-checker found **21 errors** (claims stronger than the code, wrong fix described for a bug, tests that could not prove their claim, size and ADR-number mismatches); corrections applied and re-checked; committed a19677b, keeping the side session's 2 wiki lines with `git merge-file`.

## Key Decisions

- **Box in the page, own scroll, `overscroll-behavior: contain`** (owner, design §3.1) — I briefly proposed `auto` (chain into the page at the ends) and reverted after the critic showed spotlight's pinned controls would ride into the zones; the reader reaches Vodafone's footer by scrolling outside the box or the end band's "Continue to the page".
- **Variables: the shell sets raw measures on the box; the experiences' CSS maps them** under `.aixc-box .aixc-vx` (specificity 0,2,0 beats `.aixc-vx` and its `@supports` block). Rejected: setting `--vx-top`/`--vx-vh` on the box (they never reach the experience).
- **Live selectors key on a class (`.aixc-box`)**, not the id or `data-aixc-*` (the Pocket's page-turn copy strips both).
- **The seam has no `listen`**; `on()` wraps with the guard's `wrap` and keeps its own off; `configure()` (any call) releases everything held; the shell calls `configure()` from its destroy on `guard.onStop`. Rejected: `guard.listen` (keeps a clean-up per call for the guard's life).
- **Launcher tucks with the pill**; without a pill it shows only while `scrollY < 120` (the trail's own "near the top"). Rejected: staying in place (covered Vodafone's cards and chips after a scroll) and loosening the chips audit.
- **Spotlight's queue only from 1180 px wide and 850 px tall** in the box; flowing short layout below 850 px; phones' row under the title. Rejected: raising the queue above the zone (stage 191 px taller than the screen on phones).
- **Composer placements BELOW / BESIDE / BELOW-scrolling with measured H_MIN 216, W_MIN 240**; never covers its opener, the pill, the launcher, a corner control or the header (owner's "floating controls never overlap").
- **A pending template is dropped only by the reader's own actions** (Original, Reset, Escape, close, the album, another template, a second press); a close caused by Vodafone's menus keeps it.
- **Clone composer's Gemini/key/prompt words live in `aixc/composer-words.js`**; `Gemini`, `API key`, `مفتاح`, `codepen`, `generativelanguage`, `aixc-key`, `aixc-model`, `fonts.googleapis`, `x-goog-api-key` are forbidden in every Reimagine chunk (sdk-size).
- **Streaming gets no MIT notice** (the owner's own pen "Flix"; licensing his own code is his call); magazine has no pen.
- **Accessibility items are recorded, not fixed** (owner, 2026-11-14: "skip accessibility issues fixes for now"): two level-1 headings with a view open (O37), spotlight phone focus order (O40).
- **D1 (phase 6 page watch) is not this session's**: the owner said (2026-11-18) another session works on phase 6.

## Evidence & Data

### Commits of this session (on top of 9826c72)

| Commit | What | Files | Checked before commit |
|---|---|---|---|
| 3992aa5 | 4a groundwork: marks scoped to #main-content; host/model.js; vodafone-faces.css; MIT notices | 40 | aixc-layer 8/8, pocket-fonts 12/12, pocket-chips 16/16, pocket-live 3/3, pocket-portal-live 29/29; npm test 375/375; experiences 221/221; clone aixc 298, arabic 71, pocket 210, portal 54/56 |
| edc544d | F11 rest mode + review fixes + WebKit board sheet | 15 | experiences 227/227; pocket-actors-live 33/33; floating-controls-live 4/4; floating-live-rehearsal 12/12; pocket-actors-load 3/3; pocket-fonts 12/12; clone pocket 210/210 |
| 2b7ac42 | Stage 1: seam + magazine/spotlight in the box; the launcher; box_e2e.py | 28 | experiences 244/244; npm test 376/376; test:e2e 291 pass / 8 pending / 2 fail → both test issues fixed and re-run green; clone aixc 298, arabic 71, pocket 210, tips 87, box 1228, portal 54/56 |
| cfa3192 | Stage 2: the shell | 17 | experiences 244/244; npm test 376/376; test:e2e 316 pass / 8 pending / 0 fail; clone as before; portal 54/56 on re-runs |
| a19677b | Docs (ADR-0076, ADR-0075 note, B-61..B-83, O37..O44, HANDOFF, agent handoff, wiki) | 8 | fact-checked: 21 corrections, re-checked |

### Sizes (gzip level 9, as sdk-size counts), across the session

| Chunk | 057e8fb | 3992aa5 | edc544d | 2b7ac42 | cfa3192 | Budget at cfa3192 |
|---|---:|---:|---:|---:|---:|---:|
| core (aixc.js) | 7,999 | 8,003 | 8,003 | 8,028 | 8,028 | 8,064 |
| Pocket | 30,118 | 30,143 | 30,143 | 30,198 | 28,249 | 30,464 |
| chips | 4,616 | 4,616 | 4,616 | 4,801 | 4,801 | 4,864 |
| actors | 45,004 | 45,004 | 48,951 | 48,952 | 48,952 | 49,408 |
| launcher | — | — | — | 3,151 | 3,191 | 3,200 |
| shell | — | — | — | 100 (stub) | 23,704 | 25,088 |
| magazine | — | — | — | — | 10,505 | 10,752 |
| spotlight | — | — | — | — | 7,731 | 7,936 |
| i18n.js chunk (shared by Pocket and shell) | in Pocket | in Pocket | in Pocket | in Pocket | 6,171 | — |

Shell at cfa3192 = shell chunk 12,239 + shared.js/dom.js 4,930 + faces 364 + i18n 6,171. Pocket = its chunk 21,714 + faces 364 + i18n 6,171.

### F11 rest mode numbers

| Measure | Head without rest mode | edc544d | Notes |
|---|---:|---:|---|
| LayoutCount per 3 s at rest (/en/services 1366x900, 1 sticker) | 180 | 4 | e2e bound: at most 6 |
| Script per 3 s | 0.4166 s | 0.033–0.042 s | 0.095–0.104 s under load avg ~16 (bound 0.1 s is load-sensitive) |
| Earlier review pack (old base, per 5 s) | 300 layouts, 0.356 s | 6 layouts, 0.040 s | `output/live-verify-2026-11-17/f11-review/numbers.json` |
| Rider fit failures over 4,000 pose pairs | 83 | 0 | fit by named points |
| WebKit board-red share at rest / awake | 0.04 / 0.30 (no board) | 0.31–0.32 / 0.30 | pixel case in pocket-actors-live |

### Review statistics (each finding judged by a refuting skeptic)

| Review | Findings | Confirmed real | Notes |
|---|---:|---:|---|
| F11 port + groundwork | 15 | 9 (F11 7, groundwork 1, plus dup) | groundwork: the sdk-size content-index check passed on the old code |
| Spec v1 critics (code, rules) | 30 | (critic findings, not skeptic-verified) | 1 blocker each: box variables could not reach the experiences |
| Stage 1 round 1 | — | — | lead decisions (tuck, phone queue, tablet) |
| Stage 1 round 2 | 21 | 13 (11 distinct) | all fixed; skeptic confirmed every fix |
| Stage 2 review | 24 | 13 (9 distinct) | all fixed; skeptic confirmed 13/13; 3 new problems from the fixes → round 3 |
| Docs fact-check | 21 | 21 corrected | re-check found 2 loose ends, fixed |

### Composer placements at cfa3192 (box.js)

| Screen | From launcher | From Change | Notes |
|---|---|---|---|
| 1366x900 | BELOW | BELOW | normal |
| 1366x520 (pocketed) | BESIDE | — | whole composer |
| 1366x450, 1366x380 | BESIDE 400x216 | BESIDE 400x216 | over the bar's empty middle from Change |
| 844x390 | BESIDE 400x216 | BESIDE 371x216 (en) | |
| 812x375 | BESIDE 400x216 | BESIDE 339x216 (en), 382x216 (ar) | composer ends 8 px before the pill |
| 667x375 | BESIDE 400x216 (en), 363x216 (ar) | BESIDE 278x216 (en, column 278x249), 276x235 (ar) | |
| 375x420, 375x360 | BELOW scrolling | BELOW scrolling (0 px at 375x360 from Change) | column under 240 px wide |

### Gate (design §6, saved pages of 2026-10-23)

| Page | Sections (items) | Passes |
|---|---|---|
| /home | 3 (3, 3, 4) | yes |
| /services | 6 (1, 5, 3, 7, 6, 8) | yes |
| /mobile-internet-bundles | 2 (17, 3; ar 17, 4) | yes |
| /vodafone-red1 | 2 (5, 3) | yes |
| /vodafone-cash | 1 (8) | no |
| /promotions (en only) | 1 (2) | no |
| /wireless-net | 0 (coverage 0) | no |

### Measured live boxes (2026-11-17 live run; for safe zones and placement)

| Control | Desktop 1366x900 (viewport 1351) | Phone 375x812 (viewport 360) |
|---|---|---|
| Vodafone accessibility button | [1276,825,1331,880] | [285,737,340,792] |
| Guide mic | [1272,745,1336,809] (743 listening) | [280,657,344,721] |
| Keyboard button (listening) | [1220,757,1260,797] | [228,669,268,709] |
| Transcript bar (listening) | en [1086,685,1335,733] | en [95,597,344,645] |
| Trail pill | en [1108,104,1335,148]; ar [16,104,180,148] | en [119,58,344,102]; ar [16,58,178,102] |
| Consent card | en [915,156,1335,560] | en [1,110,344,622] |
| Pocket button | [22,820,80,878] (both languages) | [16,744,68,796] |
| Curl plane | [0,639,204,900] | [0,599,166,812] |
| Cookie banner (first visit) | en [16,563,391,884]; ar [960,524,1335,884] | en [0,488,331,798]; ar [29,470,360,798] |

OneTrust z-index 2147483645; trail card 2147483401; pill 2147483400; mic 2147483000; Vodafone's pinned nav z 20 (68.4 px tall on desktop after scroll); its dialogs z 99; our launcher and composer z 19.

### The eleven experiences still to bring into the box (4b), measured at cfa3192

| Experience | `window.*` scroll uses in JS | sticky in CSS | `position: fixed` | `showModal` | `--vx-top/--vx-vh` uses | "services" strings via t() |
|---|---:|---:|---:|---:|---:|---|
| canvas | 4 | 0 | 1 | 1 | 2 | 'Services canvas…', 'Vodafone Egypt · Services', 'Vodafone services, infinite canvas' |
| coverflow | 1 | 1 | 0 | 0 | 4 | 'Next service', 'Previous service', 'Vodafone services, cover flow' |
| cube | 3 | 1 | 0 | 0 | 10 | — |
| fan | 1 | 1 | 0 | 0 | 6 | 'Vodafone services, card fan' |
| flipbook | 0 | 0 | 0 | 0 | 3 | 'Vodafone services flipbook' |
| gallery | 4 | 1 | 0 | 0 | 3 | 'Gallery of Vodafone services' |
| journey | 1 | 1 | 0 | 0 | 5 | — |
| ring | 3 | 1 | 0 | 0 | 3 | 'Next service', 'Previous service', 'Vodafone services, ring' |
| split | 1 | 1 | 0 | 0 | 5 | 'Next service', 'Previous service', 'Vodafone services, split slideshow' |
| streaming | 5 | 2 | 2 | 2 | 6 | 'View service'; Roboto ×6 (wordmark) |
| tunnel | 4 | 1 | 0 | 0 | 5 | 'Next service', 'Previous service', 'Vodafone services, hyper tunnel' |

None of them uses the seam's `on()` yet (0 each). Older map (2026-11-17, design reader): controls that sit in corners today: ring's three-column footer, tunnel's HUD row, gallery's controls and phone caption, flipbook's controls, fan's detail, split's controls, coverflow's phone panel; ring's footer and coverflow's phone panel need a small redesign. JS closure sizes incl. shared (gz, from the map): streaming 16,370, canvas 14,657, tunnel 14,097, flipbook 13,504, magazine 12,341 (magazine landed at 10,505 as its own chunk).

### E2E ports (voice-guide/tests/e2e, fixed per file)

4400 guide/spa-routes/trail; 4462 floating-live-rehearsal; 4463 portal-cache-rehearsal; 4465 motion-live-rehearsal; 4466 pocket-turn; 4467 pocket-details; 4468 pocket-fonts; 4470 pocket-peel; 4471 live-replay; 4473 reimagine-floating; 4475 aixc-layer; 4476 voice-out; 4477 pocket-live; 4478 live-kit; 4479 pocket-actors-live AND extension (shared port, pre-existing); 4480 pocket-portal-load; 4481 reimagine-launcher; **4482 reimagine-live**; 4485 floating-controls-live; 4486 pocket-chips; 4487 pocket-across; 4488 trail-consent; 4489 pocket-journey-live; 4491 pocket-corner; 4493 pocket-actors-load; 4495 pocket-smoke-rehearsal; 4497 pocket-portal-live. Free for new files: 4483, 4484 (4483 is used by the revamp's npm test). The revamp uses 46xx (4601, 4680–4689, 4690 VoiceTut); phase 6 uses 4720–4739. Clone servers: 5238–5242.

### Data and logs (the scratchpad may be cleared on reboot; durable copies are in the repo docs and commit messages)

- Scratchpad: `/private/tmp/claude-501/-Users-monterey--claude-spares-spare-PXWwUS/b9cadb26-fdce-4a3a-8d61-ed661f395924/scratchpad/` (`$SP`).
- `$SP/lead/phase4a-spec-v2.md` — the frame's spec with its "Amendments after stage 1" (the contract between the seam, the launcher and the shell).
- `$SP/lead/docs-facts-4a.md` — every fact the docs were written from.
- `$SP/lead/stage2-report.txt` — stage 2's builder report (sizes, decisions, gaps, new Arabic).
- `$SP/lead/phase4-map.md` — the read-only map of phase 4 (three readers).
- `$SP/lead/s1-logs/`, `$SP/lead/s2-logs/` — the full runs' logs (e2e.log, npm-test.log, clone suites).
- `$SP/stage2-S/` — the shell's builder logs (logs, logs2..logs5, shots, shots5, swap scripts).
- `$SP/stage1-A/`, `$SP/stage1-L/` — the seam's and the launcher's builder logs, harness.
- `$SP/f11-port/` — the rest mode's port (tools/webkit-board-check.mjs pixel-based, swap scripts, mutation diffs), `$SP/wk-pixels/` WebKit pictures.
- `output/live-verify-2026-11-17/` (git-ignored, in the repo) — the live review's evidence, F11 review pack (`f11-review/side-by-side.mp4`, `numbers.json`).

## Code Analysis

- **Seam (shared.js)**: `configure({ scroller = null, wrap = null, copy = 'services' })` (ignores a `listen`); every off/cancel from `on()`, `frame()`, `later()`, `onScrollFrame()`, `observeResize()` is held while configured and released by the next `configure()` call (then rethrows the first error); extras `keptCount()`, `guarded(name, fn)`, `viewScroller()`, `onViewScroll()`, `onViewResize()`, `storeLink()`. `chromeOffset()` with a scroller reads `scroller.querySelector(':scope > .aixc-viewbar')` height (bar must be a direct child, `box-sizing: border-box`). `words(key, values)` maps through `NEUTRAL_WORDS` when `copy === 'items'`: 'Previous service'→'Previous', 'Next service'→'Next', 'Vodafone services spotlight'→'Spotlight', 'View service'→'View details', 'More services'→'More on this page', 'Services'→'Items', 'Jump to a category'→'Jump to a section'.
- **Call order (shell ↔ seam)**: `configure({ scroller: box, wrap: guard.wrap, copy })` → render → mount; Original: unmount → `configure()`; Reimagined: `configure({...})` → mount; destroy: unmount → `configure()`. A `configure()` without unmount leaves the wrapper believing it is mounted.
- **Experience wrappers** (`experiences/src/host/demos/reimagine/<name>.js`): import `vodafone-faces.css`, `vodafone.css`, `<name>.css` as text and the renderer; `export const load = ({ ensureCss }) => { ensureCss('vodafone-faces', faces); ensureCss('vx-shared', shared); ensureCss('vx-<name>', css); return (schema, index, options) => wrapExperience(render<Name>(schema, index, options)) }`. Registry: `export const EXPERIENCES = { magazine: () => import('./magazine.js'), spotlight: () => import('./spotlight.js') }` — imported only by shell.js (keeps the dynamic-import edges in the shell's chunk for `AIXC_LOADED_BY`).
- **experience-wrap.js**: `wrapExperience(output) => { element, mounted, mount(), unmount(), reveal(itemId) }` (idempotent mount/unmount; afterMount once). **template-schema.js**: `buildGroupSchema`, `buildTemplateSchema`, `TEMPLATE_CARDS` (13 × {id, experience, name, icon}, no pen data); templates.js re-exports for the clone.
- **Launcher ctx**: `open({ host, adapter, guard, layer, ensureCss, checkpoint, launcher })` called on every press (shell toggles); `launcher = { button, hold(name, on) }` — never write `button.hidden`; presses ignored while the shell loads (`aria-busy`). `layer.demos.reimagine.state` is the shell's state (`view`, `activeExperience`, `boxScroll`, `debug()`).
- **Gate constants** (reimagine.js): `GATE = { coverage: 0.9, sections: 2, items: 3 }`; website check `!/^eshop\./i.test(location.hostname)`; re-checked on every `aixc:model`.
- **Vodafone menus' give-way rule** (CSS `:has()`): `body.modal-open`, `#header :is([aria-expanded="true"], .show, .nav-opened, .nav-flag:checked, .checker:checked)`, `.modal.show`, `.active .nav-startup` (signed-out login card), and at ≥ 992 px `#header li:hover > .nav-step-two:not(.d-lg-none)`.
- **Checkpoints** for forced failures (window.__AIXC_TEST__ = { failAt }): `demo-reimagine`, `reimagine-launcher`, `reimagine-press`, `reimagine-open`, `reimagine-render`.
- **Box resting rule** (shell.js `align()`/`settle()`): scroll the window so the box's top meets the header's pinned bottom, up to 4 corrections two frames apart; where it cannot, rest as close as possible with `--aixc-box-h = innerHeight − box top`; an always-pinned nav gets `--aixc-box-push`; resize re-settles only if `scrollY === restY`.
- **sdk-size (voice-guide/tests/unit/sdk-size.test.ts)**: `AIXC_CORE_BUDGET 7.875 KB`; `REIMAGINE_BUDGETS` (launcher 3.125 KB, shell 24.5 KB, magazine 10.5 KB, spotlight 7.75 KB); `AIXC_DEMO_BUDGETS` (pocket 29.75, chips 4.75, journey 8.75, actors 48.25, portal 6.5, portal controller 17.5 KB); `AIXC_LOADED_BY` core → launcher → shell → each experience; a probe build proves content-index never lands in the core; forbidden strings per Reimagine chunk. **Each new experience chunk needs a budget line and a LOADED_BY entry.**

## Files Changed

### Source code (experiences/)
- `src/host/live-adapter.js` — MARKED scoped to `#main-content` (3992aa5).
- `src/host/model.js` (new) — `normalizeContentModel`, imports nothing (3992aa5).
- `src/aixc/content-index.js`, `src/adapters/vodafone-services.js` — the move's other half (3992aa5).
- `src/host/vodafone-faces.css` (new), `src/pocket/pocket.css`, `src/host/demos/pocket.js`, `index.html`, `ar/index.html` — the faces sheet (3992aa5).
- `src/aixc/experiences/{split,fan,ring,tunnel,canvas,coverflow,spotlight,journey,gallery,flipbook,cube}.{js,css}` — MIT notices only (3992aa5).
- `src/pocket/pocket-actors.js`, `pocket-actors.css`, `pocket-cursor.js`, `actors/{renderer,motion,timing,mascot-model,mascot-brain,drone-brain}.js` — the rest mode (edc544d).
- `src/aixc/experiences/shared.js`, `vodafone.css`, `magazine.{js,css}`, `spotlight.{js,css}`, `src/aixc/dom.js`, `src/aixc/experience-renderer.js`, `src/aixc/experience-wrap.js` (new), `src/aixc/templates.js`, `src/aixc/template-schema.js` (new), `src/i18n.js` — the seam (2b7ac42).
- `src/host/demos/reimagine.js` (new), `src/host/demos/reimagine/shell.js` (stub then real), `src/host/index.js` (DEMOS line), `src/pocket/chips-overlay.js` (launcher in FIXED/STEADY, kept rests) — the launcher (2b7ac42; reimagine.js busy flag in cfa3192).
- `src/host/demos/reimagine/{shell,box,copy,registry,magazine,spotlight}.js`, `live.css` (new), `src/host/demos/pocket.js` (composer handle), `src/pocket/pocket.js` (turn copy's box scroll), `src/host/demos/journey.js` (shared cover), `src/aixc/composer-words.js` (new), `src/aixc/controller.js`, `src/i18n.js` — the shell (cfa3192).

### Tests
- `voice-guide/tests/e2e/aixc-layer.e2e.test.ts` — marks kept on our views; faces sheet case (3992aa5).
- `voice-guide/tests/e2e/pocket-actors-live.e2e.test.ts` — F11 cost/rotors, interplay with refit, focus leaving cards, pointer after rest, reduced motion mid-rest, WebKit+Chromium board pixels; setup pointer clear of stickers (edc544d, 2b7ac42).
- `experiences/tests/pocket-actors.test.mjs`, `experiences/tests/core-graph.test.mjs` (new), `shared-seam.test.mjs`, `shared-seam-ar.test.mjs`, `seam-fakes.mjs` (new) — unit tests.
- `experiences/tests/e2e/box_e2e.py`, `box-harness.html` (new) — 1,228 checks.
- `voice-guide/tests/e2e/reimagine-launcher.e2e.test.ts` (new, 4481, 9 cases), `reimagine-live.e2e.test.ts` (new, 4482, 22 cases), `pocket-chips.e2e.test.ts` (Tab test expects the launcher), `pocket-details.e2e.test.ts` (F9 with Reimagine off + sibling), `vodafone-layer.ts` (kit option `demos`), `floating-controls.ts` (hit names viewbar, composer).
- `voice-guide/tests/unit/sdk-size.test.ts` — budgets, LOADED_BY, forbidden strings, content-index probe; `aixc-delivery.test.ts` — the kill switch; `voice-guide/packages/sdk/build.ts` — exports `aixcBuildOptions` (identical chunks).

### Docs (a19677b)
- `voice-guide/docs/adr/0076-reimagine-on-vodafone-pages.md` (new), `adr/README.md` (rows 0075, 0076), `adr/0075-...md` (F11 note), `qa/bug-log.md` (B-61..B-83), `qa/bugs-and-open-issues.md` (O30 closed, O37..O44, portal flake note), `handoff/HANDOFF.md`, `docs/handoff/agent-handoff-2026-11-17.md`, `docs/wiki/All demos live on Vodafone's pages (Way 2).md`.

## User Feedback & Preferences

- The brief's rules (verbatim, still in force): "commit only through a private GIT_INDEX_FILE, never by staging in the shared index;" "put no attribution lines in commits;" "test in scratch worktrees;" "message the other session before running npm test or the full e2e suite;" "never commit voice-guide/deploy/whisper/modal_app.py or docs/handoff/live-demos-way2.md."
- Live-site rules (verbatim): "use Chrome only, because the shell can't reach the site. Load public pages only, at most one every 1.2 s. Stop at any bot check. Never answer the cookie banner, never sign in, never press anything of Vodafone's."
- "Ask me before phase 4 (Reimagine on live pages). It needs a design pass first." (done: design 057e8fb, go-ahead in 9826c72).
- Working model: "Fable takes the lead as the planner, the designer, and the critique, where Opus implements and Sonnet take low criticality tasks, and all reports back to Fable" (the session ran on Opus 5.5; the main session plans, designs, critiques and re-runs checks; Opus agents implement; Sonnet does docs and mechanical work).
- Owner answers on the design: "Box in the page (Recommended)"; the safe area, plus "the Pocket CTA floating button and the curl was decided to move to the bottom left corner instead ... Bring that decisions and implementation here" (that is ADR-0064, already on the branch); colours: "Allow as an exception ... But record that in the ADRs; so we can revisit it later"; pages: "Every page that passes (Recommended)".
- "1. Go ahead. 2. The Codepen MIT License implies that for a code snippet, this is typically done by pasting the license text and copyright as a comment at the top of the source code file. So that's enough. 3. Yes. I also approve the actor's rest mode."
- Earlier owner rule (2026-11-14), still applied: "Skip accessibility issues fixes for now" — accessibility findings are recorded (O37, O40), not fixed.
- 2026-11-18: "1. Another Claude Code Session is already working on phase 6." — do not ask about D1 again; phase 6 and ADR-0078 are that session's.
- "Ultracode" was on all session: substantive work went through workflows with adversarial review (skeptic per finding) before every commit.
- The owner works over Remote Control at times: end messages with plain questions and choices, not only the app's box.

## Where We're Going

1. **Phase 4b** (next): bring the other eleven experiences into the box, each on the seam (no direct `window` scroll APIs, listeners on mount through `on()`), with its controls out of both safe zones, a `reveal(itemId)`, neutral copy through `words()`, a live wrapper + registry entry + sdk-size budget; canvas's and streaming's dialogs without the top layer (`show()` or a `role="dialog"` element inside the box, own focus trap and Escape, ADR-0076 §7); streaming's wordmark in Vodafone's bold face (no Roboto); then the 4b e2e and the clone's suites. See the PLAN file.
2. **B2**: the floating matrix's S7 cells with the view bar and composer as named matrix controls (rules a, c, e, g), the reimagined state with the Pocket peeking, the guide listening, the consent card and Vodafone's menu open; the guide's spotlight on a reimagined card through `reveal()` and the sections' destinations.
3. **4c**: the experiences' remaining English microcopy into `i18n.js` (O17), the Arabic native review (gates 4c's final live check; reviewer not named), the colour audit list in ADR-0076 §9, the live checks in Google Chrome (S7 in the floating walk, a reimagined round in motion), the gate measured live (O29).
4. **Housekeeping**: remove this session's scratch worktrees (`git worktree remove` each `$SP/wt-*`, sandbox off) when no longer needed; the open items O37–O44.

## Risks & Blockers

- **Budgets are tight**: core 36 B left (any change to `host/index.js` likely needs a dated raise); launcher 9 B left; spotlight 205 B, magazine 247 B. Every new experience chunk needs its own budget.
- **Shared ports and one Postgres**: the revamp session ("Voice guide revamp phase 2", `uds:/tmp/cc-socks/97035.sock`) runs full suites on 4400–4499 several times a day; protocol: message before your full npm test/test:e2e, wait for "done"/"clear". Phase 6 session (`uds:/tmp/cc-socks/12158.sock`) uses 4720–4739 and will touch `experiences/src/pocket/*`, `experiences/src/host/*` (a watch loader), `packages/sdk/src/watch-chunk.ts`, `config/sites/vodafone-eg.yaml`, sdk-size (one line); it messages before touching shared files; `host/index.js` changes need coordination (core budget).
- **Load-sensitive tests**: the F11 script bound (0.1 s) and the portal suite's click can fail under heavy load (load average ~16 when several agents run browsers); re-run alone before calling it a failure.
- **Workflows can die across a context compaction**; check state files after one.
- **The pre-existing portal_e2e 54/56** (AIXC-95) and port 4479 shared by pocket-actors-live and extension.

## Open Questions

- Who reviews the Arabic (O17/O42)? Not named; it gates 4c's final live check.
- Does spotlight need a fix for the one logged gap (O38: /ar/services 1024x768 with the guide listening, the CTA 17 px into the right zone before the stage pins)? Recorded, not fixed.
- Should the view's heading be an `h2` on live pages (O37, two level-1 headings)? Accessibility, skipped by the owner's rule for now.
- Is the 850 px short-layout switch right for pages other than Services (measured only on the Services copy)?

## Quick Start for Next Session

```bash
# Restore context
cat plans/handoffs/HANDOFF_standalone-b570a8c4_phase4a-frame-landed_2026-11-18.md
cat plans/handoffs/PLAN_standalone-b570a8c4_phase4a-frame-landed_2026-11-18.md

# Reference docs
voice-guide/docs/adr/0076-reimagine-on-vodafone-pages.md
voice-guide/docs/reference/live-way2-phase4-design-2026-11-17.md   # §3.2 safe area, §3.5 dialogs, §5 order

# Key files to read first
experiences/src/aixc/experiences/shared.js          # the seam
experiences/src/aixc/experiences/spotlight.{js,css} # the converted pattern (on(), frame(), .aixc-box rules)
experiences/src/host/demos/reimagine/{registry,spotlight,shell,box}.js
voice-guide/tests/e2e/reimagine-live.e2e.test.ts    # how a view is opened and checked (port 4482)
voice-guide/tests/unit/sdk-size.test.ts             # REIMAGINE_BUDGETS, AIXC_LOADED_BY

# Verify current state (Postgres must be up on 127.0.0.1:54329; message the revamp session first)
cd voice-guide && timeout 300 node --test tests/unit/sdk-size.test.ts && timeout 300 node tools/typecheck.ts
cd ../experiences && timeout 300 npm test           # expect 244/244

# Next action
Phase 4b, step 1 of the PLAN: fan (the smallest pinning experience) onto the seam + into the box, test first.
```

## Appendix A: The private-index commit procedure (proven 5 times this session)

```bash
cd /Users/monterey/Workspace/Projs/Vodafone/ai-ux-studio
OLD=$(git rev-parse HEAD)
git diff --stat $OLD -- $(cat files.txt)        # must be empty: nothing uncommitted in your paths
export GIT_INDEX_FILE=$SCRATCH/idx && rm -f $GIT_INDEX_FILE && git read-tree HEAD
while read f; do m=$(git ls-tree HEAD -- "$f" | awk '{print $1}'); [ -z "$m" ] && m=100644
  b=$(git hash-object -w "$WT/$f"); git update-index --add --cacheinfo "$m,$b,$f"; done < files.txt
T=$(git write-tree); C=$(git commit-tree $T -p $OLD -F msg.txt); unset GIT_INDEX_FILE
git update-ref refs/heads/feature/live-way2 $C $OLD
git restore --source=HEAD --staged --worktree -- $(cat files.txt)   # sync the shared checkout at once
git status --short                                                  # only the owner's modal_app.py (and foreign files)
```

For a file in the shared checkout that holds someone else's uncommitted lines (the wiki page today), do not `git restore` it: `git show <old>:<f> > base; git show HEAD:<f> > mine; git merge-file <f> base mine; git restore --source=HEAD --staged -- <f>`; then `git diff <f>` must show only their lines.

## Appendix B: The lead's test runners (they lived in the scratchpad)

```bash
#!/bin/zsh
# run-e2e.sh <worktree> <logdir> <file:port>...  Runs each e2e file alone once its port is free.
WT=$1; LOG=$2; shift 2; mkdir -p $LOG; cd $WT/voice-guide
for spec in "$@"; do
  f=${spec%%:*}; p=${spec##*:}; n=$(basename $f .ts)
  for i in $(seq 1 30); do lsof -nP -iTCP:$p -sTCP:LISTEN >/dev/null 2>&1 || break; sleep 30; done
  timeout 1500 node --test --test-force-exit --test-timeout=600000 $f > $LOG/$n.log 2>&1
  echo "$n exit $? $(grep -E '^ℹ (pass|fail)' $LOG/$n.log | tr '\n' ' ')" >> $LOG/summary.txt
done
```

```bash
#!/bin/zsh
# clone-suites.sh <worktree> <logdir> <port> <suite.py>...: serves the clone and runs each Python suite.
W=$1; L=$2; P=$3; shift 3; mkdir -p $L; cd $W
node experiences/scripts/serve.mjs --port $P --host 127.0.0.1 > $L/serve.log 2>&1 &
S=$!
for i in $(seq 1 40); do curl -s -o /dev/null http://127.0.0.1:$P/ && break; sleep 0.5; done
PY=/Library/Developer/CommandLineTools/usr/bin/python3
for s in "$@"; do
  timeout 1500 $PY experiences/tests/e2e/$s http://127.0.0.1:$P/ > $L/$s.log 2>&1
  echo "$s exit $? :: $(tail -3 $L/$s.log | tr '\n' ' ')" >> $L/clone-summary.txt
done
kill $S
```

Worktrees for tests: `git worktree add --detach <scratch>/wt-x <commit>` (sandbox off: `.git/worktrees` is read-only in the sandbox), then `ln -s <repo>/voice-guide/node_modules <wt>/voice-guide/node_modules` and the same for `experiences/node_modules`. Run e2e and kill servers with the sandbox off (it hides other processes from `lsof`). Kill by PID after checking the process's cwd, never with `pkill -f`.

## Appendix C: Timeline of the session (2026-11-16 evening to 2026-11-18 morning, EET)

| When | What |
|---|---|
| 11-16 evening | Session starts from the owner's pasted brief (read `docs/handoff/agent-handoff-2026-11-17.md`, follow §7, do §9: re-run the floating and motion live checks with `VG_LIVE_OUT` outside the repo, confirm each §5 finding on fresh screenshots before fixing, fix each with a failing test first, starting with the /en/home font fallback; "Ask me before phase 4"). |
| 11-17 early | Live checks re-run; findings confirmed; fixes F1..F14, NEW-2, NEW-8 built and tested; live re-run passed (floating 0 violations; motion whole-viewport, `cardsHiddenMs` 0, mascot back within 359 ms after Back). Commits 45ee9da (fixes + tests, ADR-0075), 9e5a369 (live checks see what the review saw), 920a0be (docs), ea6929e (wiki). F11 rest mode held with its own patch (`output/live-verify-2026-11-17/held-F11-rest-mode-with-F6.patch`). |
| 11-17 ~05:00 | F11 review pack sent to the owner (`output/live-verify-2026-11-17/f11-review/`: side-by-side.mp4, mascot-region.gif, numbers.json). Phase 4 design pass with three readers and two critics; owner's four answers; 057e8fb. |
| 11-17 ~07:00 | Full suites at 057e8fb pass once Postgres is up (npm test 375/375, test:e2e 275 and 8 pending, 0 fail). Owner: go-ahead for 4a, credits as MIT comments, Arabic review gates 4c, F11 approved → 9826c72. F11 port + groundwork workflow launched (wf_8a57aa44). |
| 11-17 07:16 | That workflow died across the context compaction (nothing landed). |
| 11-17 08:51 | Restarted both agents (wf_44869fd2) code-only; the revamp session held 44xx for its suites. Spec v1 written; two critics launched. |
| 11-17 ~09:40 | Peer "done"; groundwork verified (fail-before both new cases; five e2e files 68/68; clone suites; npm test 375/375) → **3992aa5**. Spec v2 written. F11 review (skeptics) found 6 real defects → fixes. |
| 11-17 ~10:40 | F11 verification: whole actors file 30/32 under load avg ~16 (both misses re-ran green alone); WebKit pictures showed no board at rest → fallback with a pixel e2e case; on 3992aa5 all green → **edc544d**. Stage 1 builders A (seam) and L (launcher) started. |
| 11-17 ~12:00–14:05 | Stage 1 decisions (tuck, phone/tablet queue), two review rounds, box harness into the repo, full run (2 test issues fixed) → **2b7ac42**. Stage 2 builder started (browser runs gated on a window file). |
| 11-17 14:05–15:21 | The revamp session's full e2e window; stage 2 coded without browsers. 15:21 window opened. |
| 11-17 ~16:05 | Stage 2 built (reimagine-live 12/12). The revamp asked for another window ("clear" sent after the builder reported). Side session "btw: I approve" relayed D1 and wrote 2 wiki lines into the shared checkout (16:14). |
| 11-17 16:45–19:30 | Stage 2 review (13 of 24) → fixes; round 3 (composer never over its opener; menu close keeps a pending template); round 4 (BESIDE placement); round 5 (pill as an obstacle). |
| 11-17 ~19:40–20:30 | Full suites with the shell: test:e2e 316/8/0; portal flake once → **cfa3192**. |
| 11-17 late → 11-18 | Docs drafted (Sonnet), fact-checked (21 corrections), re-checked → **a19677b**. Phase 6 session asked about D1, ADR-0078 and files (answered). Owner: phase 6 is another session's; `/handoffplan`. |

## Appendix D: The live review's fixes landed before this session's phase 4 work (45ee9da, ADR-0075)

- **F1** fonts: four `@font-face` aliases `aixc-vodafone-{bold,light}-{en,ar}` → `/theme-assets/static-theme/fonts/splitted-fonts/<lang>/vodafone-<w>-<lang>.woff` (Vodafone's own origin, root-relative, `font-display: swap`); stacks: the page's own names, then the aliases, then the page's regular face; variable blocks `:root, [lang|="en"]` and `:root:lang(ar), [lang|="ar"]`; maintheme (/home) and static-lite (bundles, wireless-net, promotions) declare only the regular faces. Since 3992aa5 these live in `experiences/src/host/vodafone-faces.css`.
- **F2/F3** PageHost.hideSource keeps `#main-content` laid out: style attribute `display:<computed>!important;height:0!important;overflow:hidden!important;opacity:0!important` + `inert` + `hidden`, restored byte for byte (opacity, not visibility: inherited visibility starts Owl's `.owl-item` transition and cards flash); turn copies hide live-fixed elements; sheet clip-path at `seams.headerBottom`.
- **F4/F5** portal: `html[data-vf-portal='active'][data-vf-portal-gutter] { scrollbar-gutter: stable !important }`; wall `offScreen()/hideIn()`.
- **F6/F6b** drone placement (band / beside-title candidate); `watchFixedObstacles` + `refit()` (the drone flies to a new free home or hides when a fixed control comes or goes mid-album).
- **F7a/F7b** RTL chevron and logical padding; the peel from the card's top-end corner.
- **F8a/F8b/F9** album foot 172 px live; first-screen chips avoid the pill and the mic.
- **F10** `isStrip = (w, h) => w > 2.5 * h || (w > 0.6 * innerWidth && w > 1.5 * h)`; **F14** picture fit `Math.min(P/F, F/P) < 0.6 && (P < 1.2 || P > 3.5)`, live only.
- **F12/NEW-8** trail host `setCover({ node, covered(), shown() })`, `data-vg-blocked`, replay cursor hidden; **F13** pill aria-label; **NEW-2** actors load at once (ready wait `watch.observe(root, { attributes: true })`).
- Open from that review (O36): header not pinned in the album reopened after the portal's Back; the /en/home hero chip over the RED logo; a gutter strip during the portal; a 27 px header settle after the turn at 1366.

## Appendix E: Review findings and their fixes (this session)

### F11 port (B-61..B-66)
| B | Defect | Fix | Test that failed first |
|---|---|---|---|
| B-61 | a change between rest ticks overwritten by the next tick's restore or back-dated (mascot kept facing a card; 20° jump) | `leaveRest()` before any input mutates what the simulation reads; brains' `beforeChange` hook; `simKey()` guard in `restStep` | 'keyboard focus leaving the cards…' and 'a pointer move after a long rest…' (prefix: eye stayed on the card; worst 20° over 2 drawings) |
| B-62 | reduced motion turned on mid-rest ignored | `restAllowed()` in `restTick` | 'less motion asked for while the actors rest…' |
| B-63 | keys, wheel, touch, focus, scroll, blur did not end the rest | `stir()` in the visit's listeners; 1.5 s quiet; pocket-cursor `onSwitch` | none of its own (O44) |
| B-64 | rider's sheet fit failed when the silhouette's point count changed with pitch | silhouette points carry ids; fit by name; keep the previous map on failure | unit: rider fit across pitch thresholds |
| B-65 | rotor check could not fail | read the flipbook page shown per rotor; pure `flipbookKeys()` | two mutations (static star: showing 6; never spin: showing 0) |
| B-66 | WebKit painted no board at rest | board as its own SVG sheet; `measureMascotInset` reads the deck from it | WebKit+Chromium pixel case (0.04 vs 0.30) |

### Stage 1 (B-67..B-76)
| B | Defect | Fix |
|---|---|---|
| B-67 | a reimagined view's marks wiped on the first re-read; sdk-size's content-index check passed on the old code | MARKED scoped to `#main-content`; a probe build in sdk-size |
| B-68 | launcher over the pill until the trail announced itself | arrival watch on body and the guide's shadow root finds the pill as it mounts |
| B-69 | launcher over Vodafone's signed-out sign-in card | `.active .nav-startup` in the give-way rule; tested on maintheme, static-lite, static-theme pages |
| B-70 | chips lost the launcher's resting place when it hid | `kept` rests + a recheck a frame after the scroll reaches 0 |
| B-71 | the seam leaked a clean-up per listener through `guard.listen` | `on()` adds/removes its own listeners; `configure()` releases them |
| B-72 | spotlight ≥ 1180 px taller than the box on short laptops | stage = the room; flowing layout under 850 px tall |
| B-73 | phones: controls row under all the copy | row placed under the title |
| B-74 | Arabic 'Jump to a category' said services | `words()`: 'Jump to a section' / 'روح لقسم' |
| B-75 | F9 test assumed no launcher | F9 with Reimagine off (kit option `demos`) + sibling case with the launcher |
| B-76 | F11 focus case setup race (pointer on a sticker) | setup puts the pointer clear of stickers |

### Stage 2 (B-77..B-83)
| B | Defect | Fix |
|---|---|---|
| B-77 | a template loading while the album opened (or Original/Reset) left Reimagine stuck | choose() returns while the album shows; a pending choice dropped on the reader's actions; an observer closes the composer when the album opens |
| B-78 | launcher double press during the shell's load opened and closed the composer | presses ignored while loading (`aria-busy`) |
| B-79 | composer from 'Change experience' stayed open after Original | `showOriginal()` closes it; composer never in the header band |
| B-80 | resize left the box where the old header put it | re-settle when the window has not scrolled since the alignment |
| B-81 | the clone's Gemini/API-key words reached the shell via i18n.js | 51 entries → `aixc/composer-words.js`; forbidden strings extended |
| B-82 | composer covered its opener on short screens (then had 0 height) | BELOW / BESIDE / BELOW-scrolling with H_MIN 216, W_MIN 240 |
| B-83 | a Vodafone menu closing the composer dropped the chosen template | `closeComposer({ keep: true })` on that path only |

## Appendix F: New open items (bugs-and-open-issues.md)

- O37 two level-1 headings with a view open (accessibility, skipped).
- O38 spotlight's CTA 17 px into the right zone at /ar/services 1024x768 while listening, before the stage pins (the one `[gap]` the e2e logs; 605 px stage in a 587 px room).
- O39 windows under 700 px tall: some spotlight stages exceed the room by up to 25 px; the 850 px switch measured on Services only.
- O40 phones: spotlight's row shows under the title but comes after the CTA in tab order (accessibility, skipped).
- O41 magazine loads `vodafone.css` it does not use (2.3 KB).
- O42 Arabic strings for the native review: stage 1 السابق, تحت الضوء, شوف التفاصيل, كمان في الصفحة دي, العناصر, روح لقسم; stage 2 الصفحة الأصلية, كمّل لباقي الصفحة, and the view note 'الصفحة اتغيّرت بعد ما العرض ده اتعمل. اختار الشكل تاني عشان تشوف التغيير.'
- O43 D1 relayed by a side session, not confirmed in this session (phase 6 is now another session's).
- O44 no test shows a wheel, touch, scroll or blur ending the actors' rest (B-63).

## Appendix G: Workflows run (iteration history)

| Run | Purpose | Outcome |
|---|---|---|
| wf_8a57aa44 | F11 port + groundwork (first try) | killed at the compaction, nothing landed |
| wf_44869fd2 | restart, code-only | both built; F11 222/222 unit, groundwork 221/221 |
| wf_d197ffcc | spec v1 critics (code, rules) | 30 findings → spec v2 |
| wf_6bcf32a1 | review F11 + groundwork, skeptic per finding | 15 findings, 9 real |
| wf_a3fba74e | fix review findings (F11 Opus, groundwork test Sonnet) | all fixed |
| wf_3a30922a | WebKit board fallback + pixel case | fixed; margin regression caught and fixed |
| wf_aa305352 | stage 1 builders A and L | built |
| wf_5a51f43e | stage 1 follow-ups (tuck, phone queue) | built; its review stage failed on a bracket bug in my script |
| wf_8a971ea1 | spotlight 720–1179 + stage 1 reviews | 21 findings, 13 real |
| wf_36e9f4e9 | stage 1 review fixes + skeptic check | all fixed and confirmed |
| wf_2d6ca283 | box harness into the repo (Sonnet) | 1228/1228; 464 fail without the rules |
| wf_8bafd6d5 | two e2e failures in stage 1's full run | both test issues, fixed |
| wf_e7361c57 | stage 2 shell builder (browser window gated) | built, 12/12 |
| wf_e41ccc8a | stage 2 review | 24 findings, 13 real |
| wf_40ff77ab | stage 2 review fixes + skeptic | 13/13 confirmed; 3 new problems |
| wf_dfe8778c | round 3 (opener/pill, menu close, dead rule) | done; exposed 0-height composer on short screens |
| wf_c78eaeb8 | round 4 (BESIDE) + docs draft | done |
| wf_63c69c51 | round 5 (pill as obstacle) | done |
| wf_a69ff849 | docs second pass + fact-check | 21 problems |
| wf_d20dec65 | docs corrections + recheck | applied; 2 loose ends fixed by hand |

Lesson from wf_5a51f43e: a misplaced parenthesis around `parallel(...).then(...)` made the review stage throw "then is not a function"; the fix stage's results were still in the journal (`journal.jsonl`).

## Appendix H: Environment and peers

- Mac: Node 25.8.2; Postgres 15.7 in Docker `vg-pg` on 127.0.0.1:54329 (databases `voiceguide`, `voiceguide_test`; the revamp uses `voiceguide_test_revamp`); Python Playwright at `/Library/Developer/CommandLineTools/usr/bin/python3` (Playwright 1.58, its driver ships playwright-core 1.58 with WebKit build 2248 installed in `~/Library/Caches/ms-playwright/webkit-2248`); voice-guide's own Playwright 1.56 wants webkit-2215 (not installed) — the WebKit e2e case finds the Python driver's playwright-core.
- Sandbox: e2e, servers, `lsof`, `git worktree add/remove` need `dangerouslyDisableSandbox: true` (the sandbox hides other processes; `.git/worktrees` is read-only). Writing into `~/.claude/projects/.../memory/` via Bash is blocked: use Edit/Write.
- context-mode plugin: large tool outputs are indexed and cut; read big results with `ctx_execute` printing only the answer, and big files with offset/limit.
- Peers: "Voice guide revamp phase 2" (`uds:/tmp/cc-socks/97035.sock`, `.worktrees/vg-revamp`, branch `feature/vg-revamp`, ADRs 0068–0074 and 0077); "Way 2 phase 6 page watch planning" (`uds:/tmp/cc-socks/12158.sock`, `.claude/worktrees/way2-phase6-planning-6ad0ec`, ADR-0078, ports 4720–4739); side sessions "btw: …" (one, a fork of the revamp, wrote the D1 wiki lines). Protocol with the revamp: tell it before your full npm test / test:e2e; it holds until your "done"; it asks for "clear" before its own runs and sends "done" after.
- Memory files (auto-loaded): `live-way2-progress.md`, `shared-checkout-with-public-demo-session.md`, `review-model-tiers.md`, `mac-test-environment.md`, `headless-chrome-verification.md`, `live-way2-owner-decisions.md`.

## Appendix I: Measurements in the box (offline kit and the box harness)

| Case | Measured |
|---|---|
| Box at rest, /en/services 1366x900, header in flow ('scroll') | scroll 0, box top 119.6, height 780 (24 px of Vodafone's page between header and box; the page cannot scroll the box under the pinned nav: only 51 px above it once the nav pins against a 68 px nav) |
| Box, always-pinned nav (fixedHeader true) | push 17 px, top 68.2, height 832 |
| Box, /ar/home 375x812 | top 71, height 741 |
| Spotlight 1366x900 en/ar (harness, 57 px bar) | stage top 57, bottom gap 0, next/previous move the box exactly 200 px, window stays at 0, zones clear at cards 5 and 10 (14 pressables checked) |
| Spotlight 1024x768 en/ar | all 29 stages 611 = room (668 − 57); --sp-top 57; reserve 171; controls [202,692,822,740] centred, 28 px above the bottom |
| Spotlight 768x1024 en/ar | all 29 stages 867 = room (924 − 57); reserve 175; controls [127,948,641,996] |
| Spotlight phones 375x812 / 360x780 en/ar | stage 655 / 623 = room; queue display none; Tab 8 stops, none on a queue card; row 55–178 px above the taller zone; next 200 px |
| Spotlight before the phone fix | 375x812 en card 1: stage 768 vs room 655, bottom gap −111.7, --sp-top −56 |
| Spotlight before the laptop fix (1366x768) | stage 620 (min-height) vs room 496: card 1 never pinned, controls below the box |
| Magazine contents link (1366 en/ar, 375 en) | section at 56.6 / 57.4 / 57.2 px from the box top; hash empty; window 0; focus on the section |
| Harness zones used (stand-ins) | phones right 111x173, left 84x84; listening right zone 472x247; tablets right 111x175, left 96x96 |
| Short-screen threshold (spotlight) | desktop layout fits from 766–772 px tall in English and 806–819 px in Arabic (1180–1440 px wide); switch set at 850 px |
| Launcher, /en/home 1366 | with pill: pill [1114,104,1350,148], launcher [1142,160,1350,212]; no pill: [1142,112,1350,164] (header bottom 96 + 16) |
| Launcher, /en/home 375 | pill [125,58,359,102], launcher [167,114,359,162]; no pill: [167,66,359,114] |
| Launcher with no trail, chips audit | a launcher left in place after a scroll covered vodafone-cash's chip at Owl stage 0 (scrollY 469) → the tuck / scrollY<120 rule |

## Appendix J: Spec v1's critique (what changed between v1 and v2)

- Blocker (both critics): `--vx-top`, `--vx-vh`, `--vx-fixed-top` are declared on `.aixc-vx`; values set on the box never reach the experience → the shell sets raw measures, the experiences' CSS maps them under `.aixc-box .aixc-vx`.
- Major: with the view bar inside the hidden box on Original, nothing could switch back → the launcher returns in Original and the composer holds the Original/Reimagined segment (`.aixc-seg`).
- Major: the page-turn copy strips ids and `data-aixc-*`, and a hidden scroll container loses its offset → class `.aixc-box`, the shell keeps the box's scroll from its own listener, the turn copy sets the copied scrollTop.
- Major: several shell items needed files assigned to nobody (host/demos/pocket.js, journey.js, i18n.js, titleOf) → owners named; titleOf copied, not imported.
- Major: the shell could not build in parallel with the seam (esbuild fails on a missing named export) → two stages.
- Major: the trail's pill moves on every scroll and tucks with a transform; there was no event for the consent card → measure from `--tr-top`, watch the trail's elements and host API.
- Major: shared chunks change the Pocket's measured size; the launcher must import nothing the core or Pocket imports (inline label, inline eshop check).
- Major: the DEMOS line puts the launcher in every existing suite → the full test:e2e and rehearsals are part of stage 1's done.
- Major (rules): z-index could not satisfy "above content, below menus" → z 10–19 plus hiding while Vodafone's menus are open; the sprite would duplicate Vodafone's own symbol ids → use the page's symbol, add only missing ones as `aixc-<id>`; overscroll `auto` breaks pinning at card 1 → keep `contain`.
- Minor: spotlight's sticky top in the wrong frame (`viewHeight()` added); the registry must reproduce renderExperience's mount semantics (experience-wrap.js); `on()` via guard.wrap registers no clean-up; the model is deep-frozen (index from a copy); setCover keeps one slot (shared cover); aixc.css not loaded on live (live.css only, no `:root` block); kill switches tested; destinations one element per section.

## Appendix K: Inputs for 4b from the design and the map

- Design §3.2: next/previous/pause go to the bottom centre of the stage on desktop and to a row under the stage's title on phones; spotlight's queue, ring's and tunnel's footers, gallery's caption, fan's detail, split's and coverflow's panels are re-laid out one by one; ring's footer and coverflow's phone panel need a small redesign.
- Design §3.5 / ADR-0076 §7: canvas's and streaming's previews open without the top layer (`dialog.show()` or a `role="dialog"` element inside the box, below Vodafone's accessibility button and the guide, own focus trap and Escape); an S7 cell opens each and checks a press at Vodafone's accessibility button reaches it and its box equals `?aixc=off`'s.
- Map: every experience must cope with items without a picture (65 of 155 saved cards; all 20 bundles cards); eight print `index.model.title` as brand text (tunnel, gallery, canvas, coverflow, fan, split, ring, cube; journey's `h1`) — the shell already gives the page's name when there is no hero; `shared.js` `pageHeading` must not render an empty `h1`.
- Map: streaming's wordmark used Roboto 900 via Google Fonts on the clone (`wordmarkFont()` = `document.fonts.load('900 64px Roboto')`, `--st-logo-font: Roboto, 'Inter', 'Helvetica Neue', Arial`); on live it must draw in Vodafone's bold face (`--pocket-bold`), never Google Fonts; streaming has a long intro (cancelled on scroll/skip, none under reduced motion), a preview `<dialog>` with `showModal`, a fixed skip button.
- Map: canvas has a full-viewport fixed dialog (`canvas.css` ~431), drag/wrap/Tab/Enter/Escape; tunnel has a HUD row and chapter steps; flipbook turns pages with inert hidden pages and a contents list; cube scrolls through faces with dots; journey has a sun mark (`svgIcon`) and its own `h1`.
- Map: CSS sizes (raw/gz, source): magazine 28,990/5,740; streaming 28,838/6,603; flipbook 17,350/4,069; canvas 14,147/3,548; split 13,756/3,697; tunnel 12,942/3,329; spotlight 11,247/2,927; cube 11,109/2,979; fan 10,790/2,880; gallery 10,439/3,008; vodafone.css 10,037/2,725; ring 9,850/2,744; coverflow 7,854/2,257; journey 6,633/2,047.
- The clone's suites are the guard for shared code: `aixc_e2e.py` (298, all 13 experiences: per-experience behaviour checks like spotlight autoplay, gallery prev/next, flipbook turning, cube dots, fan drag/keys, ring, tunnel chapters, canvas drag/Escape, coverflow loop, streaming intro/preview) and `arabic_e2e.py` (71, every template labelled and Arabic, no overflow at 1366 and phone widths).

## Session Closed
**Closed at:** 2026-11-18 08:10 EET
**Commit:** the `session: phase4a-frame-landed` commit that includes this note
**Session status:** Handed off to next session (the paired plan: `PLAN_standalone-b570a8c4_phase4a-frame-landed_2026-11-18.md`, phase 4b)
