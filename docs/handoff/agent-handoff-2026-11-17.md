# Handoff to the next Claude Code agent (2026-11-17)

Written by the session that ran the live plan from phase 3 step S7 to the live verification of 2026-11-15, and brought up to date on 2026-11-17 (evening) to phase 4a stage 2 (sections 1, 2, 3, 5, 7, 8 and 9 changed; the live verification of section 4 is as of 2026-11-15). Read this file first, then the files in "Read next". Everything below is either committed on `feature/live-way2` or named with its exact path.

**Since 2026-11-21 the current state is in `docs/handoff/agent-handoff-2026-11-21.md` (phase 4b built); this file stays as the record up to phase 4a.**

## 1. Where things stand, in one paragraph

Branch `feature/live-way2` (local, **not pushed**; the owner pushes it himself), HEAD `cfa3192` on 2026-11-17. **Phase 3 of the live plan (the Pocket on Vodafone's real pages) is finished** (steps S1 to S17) and was **verified on the real site** (web.vodafone.com.eg) on 2026-11-15 at the owner's request (section 4). The review panel's findings on those screenshots were checked and fixed on 2026-11-17 (ADR-0075, bug log B-51 to B-60; section 5), and the live checks were re-run on the real site with the fixes in. The actors' rest mode (F11) was approved by the owner and landed in `edc544d`. **Phase 4a (Reimagine on Vodafone's pages) is built**: the groundwork `3992aa5`, stage 1 `2b7ac42` (the scroll seam, magazine and spotlight in a box of their own, the launcher) and stage 2 `cfa3192` (the shell: composer, box, view bar), under ADR-0076 (Proposed). Nothing of phase 4 has been run on the real site. **The next work is: phase 4b (the other eleven experiences and the dialogs), B2 (the floating matrix's S7 cells and the guide's spotlight through `reveal()`), phase 4c (the live run, the Arabic microcopy with its native review, the colour audit), then phases 5 to 9 and the e-shop steps E6 to E17** (section 9).

## 2. Read next (in this order)

1. `voice-guide/AGENTS.md` (rules that must never be broken: §4) and `voice-guide/CLAUDE.md`.
2. `docs/handoff/live-demos-way2.md` (the owner's own plan; **his file: never edit or commit it**).
3. `voice-guide/docs/handoff/HANDOFF.md` §8 session log, the entries dated 2026-11-14 and 2026-11-15 (S7 to S17), and the public-demo session's entries (gateway on Render, ADR-0067).
4. `voice-guide/docs/reference/live-way2-phase3-map-2026-11-13.md` (the phase 3 map: facts measured on the saved pages, decisions, risks; its S11 section is superseded, see the note at its top) and `voice-guide/docs/reference/eshop-plan-2026-11-13.md` (E0 to E17).
5. ADRs written in this stretch: `0050` (trail host interface v2; Built sections S8, S9, S10, S14, S15), `0052` (the Pocket on Vodafone's pages; part 3 = the mascot and drone), `0064` (the Pocket's corner at the bottom-left; nothing of Vodafone's is lifted), `0065` (the portal on Vodafone's pages). The other session wrote `0053` to `0057`, `0066` (superseded) and `0067` (public gateway on Render).
6. `voice-guide/docs/ops/runbook.md` §3d (how the owner runs the Pocket's live smoke).
7. For phase 4: `voice-guide/docs/adr/0076-reimagine-on-vodafone-pages.md` (the decisions, what is built, the known gaps, the sizes), `voice-guide/docs/adr/0075-the-pocket-on-vodafone-pages-after-the-live-review.md` (the review's fixes and the rest mode), `voice-guide/docs/reference/live-way2-phase4-design-2026-11-17.md` (the design; §0 holds the owner's answers), the wiki page "All demos live on Vodafone's pages (Way 2)" (`docs/wiki/`), `voice-guide/docs/qa/bug-log.md` (B-51 to B-83) and `voice-guide/docs/qa/bugs-and-open-issues.md` (O29 to O44).

## 3. What was built in this stretch (commits, oldest first)

| Commit | What |
|---|---|
| `b35c6db` | S11: the Pocket's corner, button, flight and page turn at the **bottom-left** of Vodafone's pages (both languages); the clone keeps bottom-right; the lift rules are clone-only (ADR-0064) |
| `ceaeefb` | S12: the mascot and drone on live pages: a chunk of their own (`experiences/src/host/demos/actors.js`), `obstacles.js`, a fixed floor, the mascot hides behind the bottom-left button and rides across to his place; in Arabic both stand at the inline-end (left) (ADR-0052 part 3) |
| `5d28525` | the journey e2e test dwells on real cards (was a random-mouse flake) |
| `4ee6106`, `2bf5d4a` | S13: the portal on live pages: sticker links only, one `fetch` drawn in a script-free `srcdoc` frame, nothing of Vodafone's copied or written, Escape cancels (ADR-0065) |
| `015fa31` | S14: the trail records **what questions were about** (never the words or answers): `snapshot().asked`, `askAbout`, `questionsFor`; consent copy changed in both languages (**the Arabic copy needs a native reviewer**) |
| inside `3652e87` + `3b2395f` | S15: the trail's `seed()` and `reset()` for the demo kit, behind consent, a press and the server's `demoKit` flag (the code landed inside the other session's Cloud Run commit by accident: the two sessions shared one git index; `3b2395f` is the notes) |
| `f9694d2` | `--test-force-exit` in `test:e2e` and a bounded teardown in `trail.e2e`: the whole suite no longer hangs after `trail.e2e` |
| `54d0364` | S16: the floating-control matrix (`tests/e2e/floating-controls.ts`, `floating-controls-live.e2e.test.ts`, port 4485) |
| `d4820b4` | fix: the corner no longer shows "Open your pocket, 0 items" when the pocket empties within 500 ms of a page starting |
| `16f7543` | S17: the Pocket's live smoke (`tests/live/pocket.live.test.ts`, `pocket-smoke.ts`) and its offline rehearsal |
| `9f99031` | three more live checks with offline rehearsals: `tests/live/floating.live.test.ts` (+ `floating-walk.ts`), `motion.live.test.ts`, `portal-cache.live.test.ts`; `vodafone-live.live.test.ts` takes `VG_LIVE_BROWSER=chrome` and `VG_LIVE_PROFILE` |
| `45ee9da`, `9e5a369`, `920a0be`, `ea6929e` (2026-11-17) | the live review's fixes, each with a test that failed first (ADR-0075, B-51 to B-60); the live checks see what the review saw (whole-viewport motion screenshots, the flight filmed to its landing, Vodafone-only baselines); docs and wiki |
| `057e8fb`, `9826c72` (2026-11-17) | the phase 4 design pass with the owner's answers; the full suites at `057e8fb` (npm test 375/375, test:e2e 275 and 8 pending) and the owner's go-ahead for phase 4a |
| `3992aa5` | 4a groundwork: the live adapter clears its marks under `#main-content` only (amends ADR-0049 §7); `normalizeContentModel` moved to `host/model.js` so `content-index.js` stays out of the core; one stylesheet for Vodafone's faces; MIT notices on the experiences adapted from pens |
| `edc544d` | the album actors' rest mode (F11), approved by the owner: at rest both actors are drawn every 750 ms and move on the compositor in between (ADR-0075, B-61 to B-66) |
| `2b7ac42` | 4a stage 1: the experiences' scroll seam, magazine and spotlight in a box of their own with the controls out of the two bottom corners, Reimagine's launcher on the pages that pass the gate (B-68 to B-76) |
| `cfa3192` | 4a stage 2: Reimagine's shell: a templates-only composer, `#experience-output.aixc-box` with the view bar and an end band, the Pocket's resting curl hidden during a view, one trail cover shared with the journey; the clone's Gemini words moved out of `i18n.js` (B-77 to B-83) |

Sizes now (gzip, checked by `tests/unit/sdk-size.test.ts`; at `cfa3192` for the first rows): core `aixc.js` 8,028 B of 8,064; launcher 3,191 B of 3,200; shell 23,704 B of 25,088 (6,171 of it `i18n.js`); magazine 10,505 B; spotlight 7,731 B; Pocket chunk 28,249 B of 30,464; actors 48,951 B of 49,408 (`edc544d`); chips 4,801 B (`2b7ac42`). The 2026-11-15 rows (portal 6,450 B, scene 17,667 B, journey 8,236 B, `trail.js` 32,061 B of 32,256, `guide.js` 20,423 B of 21 KB) were not re-measured here.

## 4. The live verification of 2026-11-15 (all passed)

**How the site is reached (important):** this Mac reaches web.vodafone.com.eg **only through a browser** (Playwright's Chromium or the installed Google Chrome). `curl`, `nc` and Node's own `fetch` time out on port 443 (DNS resolves to 82.129.223.108; other sites work; no system proxy). So every live check must do its requests inside the browser. O29 in `voice-guide/docs/qa/bugs-and-open-issues.md` is still written as "not reached": **update it** with this.

All commands from `voice-guide/`, with the sandbox off; each loads at most a few pages, 1.2 s apart, stops at a bot check, never answers the cookie banner, never signs in. The demo profile `voice-guide/data/demo-profile` (git-ignored) has the cookie banner already answered by the owner.

| Check | Command | Result 2026-11-15 |
|---|---|---|
| Pocket smoke (S17) | `VG_LIVE=1 VG_LIVE_BROWSER=chrome VG_LIVE_PROFILE=$PWD/data/demo-profile node --test --test-force-exit --test-timeout=600000 tests/live/pocket.live.test.ts` | **passed** en and ar: chip, bottom-left button, album and scroll restored, reload keeps the sticker (Vodafone's storage clear), journey in place, portal |
| Layer on ten pages | `VG_LIVE=1 VG_LIVE_BROWSER=chrome node --test --test-force-exit --test-timeout=600000 tests/live/aixc-layer.live.test.ts` | **passed**: ready on 10 pages, shifts nothing; real accessibility button 1276,825 55×55 (visible 15 px scrollbar); first-visit banner EN bottom-left 375×321, AR bottom-right 960,524 375×360 |
| The guide | `VG_LIVE=1 VG_LIVE_BROWSER=chrome VG_LIVE_PROFILE=$PWD/data/demo-profile node --test --test-force-exit --test-timeout=300000 tests/live/vodafone-live.live.test.ts` | **4/4**: spoken "cheapest internet bundle" goes to the bundles page in ~4 s and reads the live answer, en and ar; mic clear of the accessibility button |
| Portal cache | `VG_LIVE=1 node --test --test-timeout=600000 tests/live/portal-cache.live.test.ts` | **in a plain Chrome the destination is served from the disk cache after the portal's one fetch** (5 of 5 variants); only with a Playwright route on (as in the demo browser) does it go back to the network: S17's "2 requests" is the demo browser's routing, not Vodafone's headers (`Cache-Control: max-age=14400, public`, `Vary: Accept-Encoding`) |
| Floating matrix | `VG_LIVE=1 VG_LIVE_OUT=<dir outside the repo> VG_LIVE_PROFILE=$PWD/data/demo-profile node --test --test-force-exit --test-timeout=1200000 tests/live/floating.live.test.ts` | **passed**: 32 cells, 20 loads, 0 violations; banner pass with no press |
| Motion | `VG_LIVE=1 VG_LIVE_BROWSER=chrome VG_LIVE_OUT=<dir> VG_LIVE_PROFILE=$PWD/data/demo-profile node --test --test-force-exit --test-timeout=900000 tests/live/motion.live.test.ts` | **passed** 4 rounds: chips 0 misplaced (but the carousels did not move during the windows), ride, dash back, portal ~3.4 s, no frame over 33 ms with the album open |

Vodafone's own facts seen live: `/vodafone-cash` reloads itself once per browser session; Vodafone's scripts throw `TenantFeatures` page errors (not ours); the phone header `nav#nav-header` is fixed.

**The screenshots and logs of that run were in a scratch folder that has since been cleared.** Re-running the floating and motion checks above (with `VG_LIVE_OUT`) regenerates them in about 15 minutes. Keep them in `output/live-verify-<date>/` (git-ignored via `.git/info/exclude`).

## 5. The review panel's findings (checked and fixed on 2026-11-17; kept as the record)

**Status, 2026-11-17:** every finding that was confirmed was fixed, each with a test that failed first (ADR-0075, bug log B-51 to B-60), and the live checks were re-run on the real site with the fixes in; what remains is the owner's look (O36) and the notes in ADR-0075. The F11 finding (the album at rest forces a layout every frame) was fixed by the rest mode in `edc544d` (O30 is closed). Do not redo the list below; read ADR-0075 for what became of each item.

Nine reviewers looked at the 271 screenshots and the logs; each finding was to be challenged by two skeptics, but a usage limit stopped the cross-checks after the first slice. The raw output (all 105 findings with evidence, and the 60 verdicts that did run) is in **`output/live-verify-2026-11-15/review-panel-raw.json`**. Several reviewers found the same things, which raises confidence. **Confirmed by both skeptics:**

1. **`/en/home` draws our chips and the pocketed card's liner in a system Helvetica, not Vodafone's font.** Cause (verified by reading the saved theme): `/en/home` uses `maintheme`, whose `styles.css` declares only `vodafone-regular-en` and `vodafone-regular-ar`, no bold face; `--pocket-bold` in `experiences/src/pocket/pocket.css` (lines 13-17: `vodafone-bold-en, vf-bold, sans-serif`) falls back to `sans-serif`. Fix: on pages with no bold face, fall back to `vodafone-regular-en` with weight 700, or ship an `@font-face` for Vodafone's bold woff; add a font check to the floating walk. Breaks AGENTS.md §4.8 and ADR-0052 §12.

**Reported, not yet cross-checked (several from more than one reviewer; verify each on fresh screenshots before fixing):**

- The page turning back after closing the album shows the pocketed card as not pocketed, then the liner pops in; Vodafone's header is missing or doubled for ~0.5 s during the turn (both directions).
- After closing the album, Vodafone's "Stay In Control" carousel cards are invisible while our chips float over empty grey (en and ar) — likely the frozen copy or Owl not repainting.
- The portal moves Vodafone's accessibility button and our mic ~15 px right for the 3.3 s transition: `html { overflow: hidden }` removes the visible scrollbar (ADR-0065 notes this for Windows; on this Mac's headed Chrome the scrollbar is visible too). Consider `scrollbar-gutter: stable` while the portal runs.
- The portal's falling wall shows Vodafone's hidden mobile menu drawer and the "Skip to main content" bar (things normally off screen).
- The album's drone was never seen at 1366 (en and ar); the matrix's `measure.drone` is null in all cells, so its rules never ran for the drone.
- Arabic: the album's Back chevron is not mirrored; the peel starts at the card's top-right while the Arabic chip is top-left.
- Our mic covers the sticker's link ("اعرف اكتر") in the Arabic phone album and touches chips and cards at the foot of the screen; the keyboard button touches an icon chip while listening.
- On `/en/home` at 1366 the hero card's chip sits under the trail's pill (known on phones, new on desktop).
- Peeling a full-width band (Vodafone Cash) sweeps a screen-wide blank slab for ~0.75 s.
- The album at rest forces a layout every frame (motion report: ~10× the baseline's script time); worth a look at `pocket-actors.js` and the cursor.
- The journey's preview of the current page is blank (only the header).
- The pill's accessible name repeats itself before consent ("Remember my journey. Remember my journey").
- The Vodafone Cash sticker's picture is badly cropped.
- Test gaps: the motion screenshots were 500×795 CSS px (not the full viewport), the flight film stops before the sticker lands, the banner pass's `?aixc=off` baseline still has our mic and pill.

Not ours (Vodafone or by design): the resting curl covers a corner of whatever card is at the foot of the screen (ADR-0064 accepted it); Vodafone's accessibility button overlaps the banner's "Cookies Settings" button.

## 6. Still open from before

- **AIXC-119** (keyboard focus not moved into the journey when it opens from the pill): **skipped by the owner** ("skip accessibility issues fixes for now"). An unverified patch existed only in the cleared scratch folder; redo it from the issue if asked.
- **AIXC-110**: owner decision pending (do presses on a pocketed card's liner pass through to the card's own link?).
- AIXC-1, 2, 41: closing is the owner's call (AIXC-2's comment has the evidence). AIXC-69, 95, 106: low priority.
- Phase 6 (page watch) needs the owner's D1 (approve the page-watch ADR). Phase 4 D3 (which pages offer Reimagine): default = every CMS page passing coverage plus a curated demo list.
- Tips and the VoiceTut tab are bottom-left on the clone; on live pages they must sit above the Pocket button (ADR-0064 §7, phase 6).
- The demo browser's Playwright routing turns Chrome's HTTP cache off, so in `npm run demo:live` a sticker press costs two requests (real visitors: one). Fix later by bridging `/__vg/` without routes, or accept.
- `trail.e2e` fails one test in about 2 of 8 runs when the machine is loaded; never re-measured on a quiet machine. Repeat runs: run the file 8 times with `--test-force-exit` and read which test fails.
- `voice-guide/deploy/whisper/modal_app.py` is modified in the working copy and is **not ours**: never commit it.

## 7. How to work in this repository (lessons that cost time)

- **Another Claude session works in the same checkout and branch** (the public demo: gateway, loader, extension, Whisper, Render). It commits too. **Never stage in the shared git index**: its `git commit` once swept our staged S15 files into its commit. Commit through a private index:
  ```
  export GIT_INDEX_FILE=<scratch>/my-index; rm -f $GIT_INDEX_FILE; git read-tree HEAD
  git add <your files>            # or: git update-index --cacheinfo 100644,<blob>,<path>
  tree=$(git write-tree); c=$(git commit-tree $tree -p HEAD -F <message file>)
  unset GIT_INDEX_FILE; git update-ref refs/heads/feature/live-way2 $c <old HEAD>
  git reset -q HEAD -- <your paths>   # bring the shared index's entries back in line with HEAD
  ```
  For a shared file (HANDOFF.md, runbook.md, `docs/adr/README.md`) build the blob from `git show HEAD:<path>` plus only your lines (`git hash-object -w --stdin`), and put the same lines in the working file too. Message the other session (SendMessage) before a full e2e run or `npm test`, which use fixed ports 4400-4499 and the one Postgres test database; `rpc`, `speech-out`, `trail-host` and `trail-consent` integration tests bind 4497-4499.
- **ADR numbering:** in the order written. The other session took 0066 and 0067; **the next free number is 0078** (2026-11-17: 0076 is Reimagine on Vodafone's pages, ours; 0077 and 0068 to 0074 belong to `feature/vg-revamp`; 0075 is the live review's fixes).
- **Commits carry no `Co-Authored-By` or other attribution lines** (the owner's rule; the original `feature/aixc-template-credits` with trailers must never be merged or pushed).
- **Test in a scratch worktree**, never in the shared checkout: `git worktree add --detach <scratch>/wt HEAD`, then symlink `voice-guide/node_modules` and `experiences/node_modules` from the main checkout; copy your changed files in; run with the sandbox off (Chromium and ports). `git worktree prune` after a scratch folder is cleared.
- **Environment:** Postgres container `vg-pg` on 127.0.0.1:54329 (`voiceguide`, `voiceguide_test`). Node 25. Python Playwright for the clone's suites: `/Library/Developer/CommandLineTools/usr/bin/python3`. The clone's Python suites need `node experiences/scripts/serve.mjs --port <port> --host 127.0.0.1` and then `python3 experiences/tests/e2e/<suite>.py http://127.0.0.1:<port>/`; always check the port is free first (a stale server gave false failures).
- **Checks before saying done** (AGENTS.md): `npm run typecheck && npm test && npm run test:e2e` in `voice-guide/` (full e2e ~20 minutes, 172 tests on 2026-11-15, more now with the rehearsals), `npm test` in `experiences/` (244 at `cfa3192`), and the clone's Python suites: `pocket_e2e.py` 210, `aixc_e2e.py` 298, `arabic_e2e.py` 71, `tips_e2e.py` 87, `box_e2e.py` 1228, `portal_e2e.py` 54 of 56 (two known pixel-check failures, AIXC-95; it crashed once in a full run on a click timeout under load). At `cfa3192` the voice-guide suites gave `npm test` 376/376 and `test:e2e` 316 passed, 8 pending (the floating matrix's S6 and S7 cells), 0 failed.
- **Working model the owner asked for:** the main session plans, designs and critiques; implementation goes to Opus subagents with a full brief (files, design, rules, exact checks, what to report); low-criticality work to Sonnet; the main session reads every diff and re-runs every check itself before committing. Briefs must forbid subagents from git commands, from touching the other session's files and from the live site.
- **Tracker:** Plane, project AIXC (workspace `bahaa-addin`). The Plane connector may need re-authorising (`/mcp`).

## 8. Owner decisions in force (newest win)

- The Pocket's button, corner, flight and page turn are at the **bottom-left** of live pages in both languages; **nothing of Vodafone's is ever lifted or restyled**; the guide's mic stays above the accessibility button, unlifted (2026-11-14, ADR-0064; supersedes the 2026-11-10 lift exception).
- The mascot and drone keep their places (the album's inline-end: right in English, **left in Arabic** because the album is right to left); the mascot hides behind the bottom-left button and rides his hoverboard across to his place, at least 16 px from the accessibility button (2026-11-14).
- Chips: always visible, out of the Tab order, screen-reader route only; the clone's **pill** look (an owner exception to SPEC-01); icon-only on tight cards.
- Stickers keep the card's copy as published, price included, dated, in the visitor's browser.
- Portal: sticker clicks only; one fetch then the navigation from the HTTP cache (proven for real visitors on 2026-11-15); else the picture preview.
- Reimagine on live: **templates only** (no Gemini, no key field, no Google Fonts).
- Demo 5: the revamp doc `docs/wiki/Demo 5 revamp - personalization for an anonymous visitor.txt` (anonymous visitor, `?pz=traveller|cash|fan`), built live in phase 5, Arabic too.
- Prices and stock are kept in the knowledge base as guide points; the guide never says a stored price, it reads the live page (ADR-0059).
- The public gateway is on **Render's free plan** (ADR-0067); the owner pushes the branch and creates the Blueprint himself.
- "Skip accessibility issues fixes for now" (2026-11-14).
- **Phase 4 (2026-11-17, ADR-0076):** Reimagine's view is a box in the page with its own scroll; the experiences' controls stay out of the two bottom corners (a safe area); the experiences keep their own colours on live pages, recorded as an exception to be revisited; every CMS page that passes the gate gets Reimagine; the MIT licence text and copyright go in comments at the top of each adapted source file, no visible credit; the native review of the Arabic microcopy blocks phase 4c's live check; the go-ahead for phase 4a. The actors' rest mode (F11) was approved after the side-by-side recording. The launcher's tucking, its 120 px limit and spotlight's 1180 px queue limit are the lead session's choices, not the owner's.
- **D1 (phase 6, the page watch)** was relayed by a side session at 16:14 on 2026-11-17 (browser-only, check on visit, topic watches) and is **not confirmed** in the session that builds this; treat it as open (O43).

## 9. Suggested next steps

Updated 2026-11-17 (evening); the four steps of the earlier list are done (section 5).

1. **Phase 4b.** Re-lay out the other eleven experiences (fan, ring, tunnel, gallery, coverflow, split, cube, canvas, flipbook, streaming, journey) for the safe area and the box; move their own `window` listeners onto the scroller seam; the dialogs (canvas's and streaming's previews, not modal, ADR-0076 §7); the check that every adapted file carries its licence notice. Ring's footer and coverflow's phone panel need a small redesign. Measure the 850 px switch on the other pages that pass the gate.
2. **B2.** The floating matrix's S7 cells (the eight pending cells are S6 and S7) and the guide's spotlight through `reveal()`.
3. **Phase 4c.** The live run on the real site (the floating and motion checks with Reimagine); the Arabic microcopy into `i18n.js`, **with the native review gating the live check** (nobody is named yet; the strings so far are in O42); the colour audit: fill the list of every off-palette colour in ADR-0076 §9. Then the owner's look, and ADR-0076 can be Accepted.
4. **Open items O37 to O44** (`voice-guide/docs/qa/bugs-and-open-issues.md`): O37 two level-1 headings with a view open and O40 the phone focus order (both accessibility, skipped by the owner); O38 spotlight's CTA in the right zone (two measured cases); O39 windows under 700 px tall; O41 magazine loads a 2.3 KB stylesheet it does not use; O42 the Arabic strings for review; O43 D1, to be confirmed by the owner. O36 (the owner's look at ADR-0075) is still open too.
5. **Then** phases 5 to 9 (demo 5's revamp is built live in phase 5; the page watch in phase 6 needs D1) and the e-shop steps E6 to E17.
6. The shared checkout and the private-index commit routine: section 7 here and `voice-guide/docs/handoff/HANDOFF.md`.
