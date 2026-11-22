# Handoff to the next Claude Code agent (2026-11-22)

Written by the session that merged phase 6, pushed `feature/live-way2` and built phase 4c of the live plan (Reimagine's live checks, O17's Arabic hints and the colour audit), on 2026-11-22. It follows `docs/handoff/agent-handoff-2026-11-21.md` (phase 4b), which still holds the earlier record. Read this file first, then the files in "Read next". Everything below is either committed on `feature/live-way2` or named with its exact path.

## 1. Where things stand, in one paragraph

The owner said on 2026-11-22: "Do all three in sequence". So, in order: phase 6 (the page watch, ADR-0078) is merged into `feature/live-way2` (`073c492`); the branch took the two commits another session had pushed on 2026-11-15 (`292ac0b`) and a fix for the live-page kit (`00e9d7a`), and was pushed (`ea8b54d..00e9d7a`, fast-forward); then **phase 4c was built** on top. 4c found O17 stale (the microcopy was already in `i18n.js`) and fixed its one real gap (four Arabic hints with استخدم); filled ADR-0076 §9's colour table (every row in `voice-guide/docs/reference/colour-audit-2026-11-22.md`); built the floating matrix's S7 cells offline and in the live walk, and one reimagined round in the motion check; and fixed two product defects that S7 found (B-104, B-105) and two test-side ones from the live runs (B-107, B-108). The third live run, after all fixes: both passed (the floating walk: 52 cells, 20 page loads of at most 24, 70 presses, Vodafone's menu touched 4 times (hover, hover, press, press), 0 violations; the motion check: five rounds, 13 page loads of at most 16, 18 page requests of at most 20, the reimagined round's box scrolled 601 px by the wheel with the window still). ADR-0076 stays **Proposed** until the owner's look and the native review of the Arabic still in O42. **The next work is: the owner's confirmation of the lead's eight 4c decisions (the wiki lists them), the native review (O42), then the owner's look.**

## 2. Read next (in this order)

1. `voice-guide/AGENTS.md` (rules that must never be broken: §4) and `voice-guide/CLAUDE.md`.
2. `docs/handoff/live-demos-way2.md` (the owner's own plan; **the owner's file: never edit or commit it**).
3. `voice-guide/docs/adr/0076-reimagine-on-vodafone-pages.md`: the Status line, §4 (the gate measured live), §7 (the previews and the pill), §9 (the colour table), §11 (O17 and the four new strings), "Lead's decisions in phase 4c", and under Consequences the sizes, the checks, the tests for 4c and the live runs.
4. `voice-guide/docs/reference/colour-audit-2026-11-22.md`: every off-palette row, per file.
5. `voice-guide/docs/handoff/HANDOFF.md` §8 session log, the entry dated 2026-11-22.
6. `voice-guide/docs/qa/bug-log.md` (B-103 to B-108 are this stretch's) and `voice-guide/docs/qa/bugs-and-open-issues.md` (O17 resolved; O29, O42, O51, O53 and O56 updated; O58 to O64 new).
7. `voice-guide/docs/ops/runbook.md` §3e: the live floating walk with S7, the reimagined motion round, and the longer timeouts.
8. The wiki page "All demos live on Vodafone's pages (Way 2)" (`docs/wiki/`): what landed for 4c and the lead's decisions for the owner to confirm.

## 3. What was built in this stretch (commits, oldest first)

| Commit | What |
|---|---|
| `073c492` | the merge of `feature/live-way2-watch` (phase 6, ADR-0078); conflicts only in docs, both sides kept (O45 to O47 and O48 to O57; O42 holds both branches' strings); the watch's three bugs numbered B-100 to B-102 |
| `292ac0b` | the merge of `origin/feature/live-way2`: `74f4619` (VoiceTut client fixes) and `ea8b54d` (the replay gives lazy pictures their `src`), pushed on 2026-11-15 by another session |
| `00e9d7a` | the live-page kit serves saved pages as recorded (`demo-browser`'s `lazyImages` option; `launchLayer` `lazyImages: false`; B-103); pushed `ea8b54d..00e9d7a` |
| (4c's commit) | phase 4c: O17's four Arabic hints (B-106); `live.css`'s composer shadows on palette; the previews clear of the pill (`box.js` `--aixc-sheet-pill-w`/`-h`, canvas, streaming; B-104); the curl hidden while the composer shows (B-105); S7 offline and live; the reimagined motion round; the test-side fixes (B-107, B-108); the docs |

Sizes after 4c (gzip -9, `voice-guide/tests/unit/sdk-size.test.ts`): the shell 25,195 B of 25,344; canvas 12,753 of 12,800; streaming 16,033 of 16,128. No budget raised. The other chunks are as at `6e017a9` (the 2026-11-21 handoff, section 3).

## 4. How the checks were run

All in scratch worktrees (`git worktree add --detach <scratch>/wt-… <commit>`, sandbox off; symlink `voice-guide/node_modules` and `experiences/node_modules` from the main checkout), never in the shared checkout.

- **The full suites at `292ac0b`:** typecheck ok; voice-guide `npm test` 410/410; `test:e2e` 344 passed, 8 skipped, 2 failed (O57's `/spa/` race in `live-replay`; `pocket-details` F8b, fixed by `00e9d7a`); experiences `npm test` 380/380; the clone's `aixc_e2e` 298, `arabic_e2e` 71, `pocket_e2e` 210, `tips_e2e` 87, `portal_e2e` 54/56 (the baseline), `box_e2e` 5,883/5,883.
- **After `00e9d7a`:** `pocket-details` 6/6 three times; every kit e2e file one at a time passed; `watch-demo` 4/4, `watch-ui` 5/5, `watch-floating` 8/8, `watch-live` 9/9, `reimagine-live` 34/34.
- **4c's new tests:** `experiences/tests/microcopy-ar.test.mjs` (11; 4 failed before), `microcopy-en.test.mjs` with `microcopy-en.json`, the helpers `microcopy-keys.mjs` and `render-fakes.mjs`; `reimagine-live.e2e`'s 'O17' case; `experiences/tests/reimagine-box.test.mjs` (7, all failed before); `voice-guide/tests/unit/floating-s7-rules.test.ts` (7); `floating-controls-live.e2e` (8 pass, 4 skipped: S6 until Tips is live); `motion-live-rehearsal.e2e` (9 tests, two of them the reimagined round; `WHEEL_IN_CAPTURE` reproduces B-107); `floating-live-rehearsal.e2e`'s 'as live' case (reproduces B-108).
- **The live runs** (runbook §3e; Google Chrome, the demo profile `data/demo-profile`, sandbox off; outputs in `live-verify-2026-11-22`, beside the repository, never inside it):
  - Run 1: the floating walk stopped at its first load (`/en/services?aixc=off` timed out at 45 s; nothing retried); motion 13 loads, all 200, the four Pocket rounds passed, the reimagined round failed at r5 (B-107).
  - Run 2: floating 52 cells, 20 loads (cap 24), 70 presses, Vodafone's menu touched 4 times (hover, hover, press, press), 4 violations, all rule (d) (B-108). The gate passed everywhere: coverage 1; `/en/services` and `/ar/services` 29 of 29 cards, sections `[1,5,3,7,6,8]`; `/en/home` 12 of 12, sections `[4,3,5]`. The corners at 375: right 96x167 (accessibility, mic), left 84x84 (Pocket); at 1366: right 96x167, left 90x90.
  - Run 3, after all fixes: both passed (the floating walk: 52 cells, 20 page loads of at most 24, 70 presses, Vodafone's menu touched 4 times (hover, hover, press, press), 0 violations; the motion check: five rounds, 13 page loads of at most 16, 18 page requests of at most 20, the reimagined round's box scrolled 601 px by the wheel with the window still).
- **The final full suites on the final 4c tree:** typecheck ok; voice-guide `npm test` 417/417; `test:e2e` 354 pass, 4 skipped (S6), 0 fail; experiences 403/403; the clone's `aixc_e2e` 298/298, `arabic_e2e` 71/71, `pocket_e2e` 210/210, `tips_e2e` 87/87, `portal_e2e` 54/56 (its baseline), `box_e2e` 5883/5883.
- **Reviews:** the live part's review (7 findings confirmed) and the i18n part's (2) were fixed during the build: the `navToggling` page error filtered narrowly; a menu cell with nothing measured is a violation; the runbook's counts; the menu not closed in `finally` after a stop; no second burger press; `MENU_MARKS` is the launcher's own hide rule, by class; an unreadable view is a violation; the substring rule in the O17 check; the English-key test could not fail. The colour audit (Sonnet) was checked independently (Opus): no colour missed, four corrections (ADR-0076 §9).

## 5. What the S7 cells and the live runs found (kept as the record)

- **B-104 (product):** canvas's preview close under the trail's "Your journey" pill where the box starts at the top of the screen (1366: close [1298,81,1346,129], pill [1165,69,1350,113]; 375: [315,131,363,179] against [297,127,359,171]). `box.js` writes the bar's pill measure; canvas's close steps in, streaming's panel starts under it.
- **B-105 (product):** at 375 the Pocket's curl ([0,599,167,812]) under the composer ([16,170,359,641]). `live.css` hides the curl while the composer shows; the button stays; no Pocket file edited.
- **B-107 (test):** in headed Chrome a wheel sent during a DevTools screenshot scrolls the window, not the box. One capture at a time; the product was right.
- **B-108 (test):** Vodafone's phone menu removes the page's 15 px classic scrollbar, so its fixed button moved 285 -> 300 and rule (d) fired. Corrected only when `vodafoneScrollLock` holds, on the one inset side; the kit's `NAV_STAND_IN` now locks the scroll like live.

## 6. Still open

- **The owner's confirmation** of the lead's eight 4c decisions (ADR-0076, "Lead's decisions in phase 4c"): the previews' overlays under the palette exception; the view bar measured as the box of its shown buttons; S7 on the layer's existing loads, `/ar/services` without S7 live; Vodafone's menu (a hover at 1366, one burger press at 375, the phone menu left open); the kit serving saved pages without lazy pictures; the curl hidden while the composer shows; the previews kept clear of the pill; rule (d)'s correction for Vodafone's own scroll lock.
- **The native review of the Arabic in O42** (4b's strings exempt, the owner 2026-11-21; 4c's four hints added). 4c's live check counts as passed only after it. The reviewer is not named.
- **4c's open items, O58 to O64:** Vodafone's scroll lock not confirmed live (O58); 1 px from the left edge with classic scrollbars at 375, kit only (O59); spotlight's snap takes part of a wheel (O60); the motion box-scroll check's 200 px threshold, which autoplay alone reached (O61); the trail's pill over Vodafone's open phone menu (O62); Tab and Escape in the previews not pressed by S7 (O63); `aixc.css`'s clone-only colours (O64).
- From before: O48 to O57 (4b's gaps; O56 less the S7 cells), O45 to O47 (phase 6: the opt-in live run of the watch is still not done), O36 to O44, phases 5 and 7 to 9, E6 to E17.

## 7. How to work in this repository (rules and lessons)

- Section 7 of the 2026-11-21 handoff still holds: the shared checkout and the private index, the peers (the revamp session on ports 4400-4499 and the one Postgres test database: tell it before a full `npm test` or `test:e2e`), commits with no attribution lines (the owner's rule), the scratchpad that can be wiped, the environment, the clone that must stay as it was, the budgets, the working model.
- **ADR numbering:** 0076 is Reimagine on Vodafone's pages; 0078 is phase 6's, now merged; **the next free number is 0079**.
- **Live runs:** the floating walk takes `--test-timeout=1800000` and motion `1200000` now (runbook §3e). The outputs go outside the repository. Vodafone's menu is the only thing of Vodafone's that S7 touches: never a second burger press, never Original with the phone menu open.
- **Screenshots and wheels:** in headed Chrome never send a wheel while a screenshot is being taken (B-107).
- **The kit and the replay:** the live-page kit runs the saved pages as recorded (`launchLayer` `lazyImages: false`), so their sizes match live; with the lazy pictures filled in, a blank picture is a stretched square (B-103).

## 8. Owner decisions in force (newest win)

- Everything in the 2026-11-21 handoff's section 8 still holds, and the owner confirmed 4b's lead decisions on 2026-11-21 (4b's Arabic does not go to the reviewer).
- **2026-11-22:** "Do all three in sequence" (the phase 6 merge, the push, phase 4c). Done.
- **No other new owner decisions in 4c.** The lead's eight 4c decisions wait for the owner's confirmation.

## 9. Suggested next steps

1. **The owner's confirmation** of the eight 4c decisions.
2. **The native review** of the Arabic in O42; then 4c's live check counts as passed.
3. **The owner's look** at the live runs' pictures; then ADR-0076 can be Accepted.
4. **O58 and O61** on the next live run (how the menu locks the scroll; the wheel's own share of the box scroll).
5. **Then** O56's remaining items, the watch's opt-in live run (O45), phases 5 and 7 to 9, and the e-shop steps E6 to E17.
