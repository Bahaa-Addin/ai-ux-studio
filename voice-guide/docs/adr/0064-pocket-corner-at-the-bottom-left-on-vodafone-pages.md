# ADR-0064: On Vodafone's pages the Pocket's corner, button and page turn are at the bottom-left, so nothing of Vodafone's is ever lifted

- Status: Proposed (2026-11-14). Built in phase 3 step S11 (2026-11-14). Accepted after the owner's live smoke (the real accessibility widget has not been seen by this code, O29)
- Date: 2026-11-14
- Area: the Pocket's corner, button, flight and page turn on live pages (ADR-0052 §8, §9), the Voice Guide's microphone (`--vg-lift`), AGENTS.md §4.6; supersedes the owner's 2026-11-10 decision to allow a lift of Vodafone's accessibility button on live pages (it was never built on live and never written into AGENTS.md)
- Owner decisions: 2026-11-14, "do not lift the accessibility widget's floating button; put the Voice Guide's button above it without lifting it, and move the Pocket's button to the bottom-left corner, which means the page-turn engine flips or curls the page from the bottom-left corner"

## Context

On the Services clone the Pocket's page corner peeks at the bottom-right and its round button sits there. The clone also has a stand-in accessibility button in that corner, so the Pocket lifts that button by 230 px (150 px under 768 px) while the peek shows, the album is open or a reimagined view shows, and lifts the Voice Guide's microphone (`--vg-lift`) with it. Carried to Vodafone's pages that would lift Vodafone's own accessibility button (`#vodafone-aw-icon`), which AGENTS.md §4.6 forbids; the owner allowed an exception on 2026-11-10 and S11 was designed around it (scoped `transition`, no lift while the cookie banner shows, a banner check, a rule-walker test). The design needed a banner observer, three lift states and a guard against the lift failing to move the real widget (which the code has never seen), and would still have put the Pocket button where the Arabic cookie banner floats.

The owner chose to avoid the whole class of conflicts: leave Vodafone's button where Vodafone puts it, and give the Pocket the other bottom corner.

## Decision

1. **Nothing of Vodafone's is moved, lifted, restyled or covered on live pages.** The accessibility button keeps its place, its `bottom`, its `transition` and its `z-index` in every Pocket state. AGENTS.md §4.6 stays as written: there is no exception.
2. **The Voice Guide's microphone stays above the accessibility button, where it is by default** (`bottom: 91px`, 16 px above the button's 55 px at 20 px) and is not lifted by the Pocket either. The clone's lift of its own stand-in and of the microphone stays as it is, on the clone's page only.
3. **The Pocket's corner is the bottom-left, physical left in English and in Arabic.** The half-turned page corner (the peek), the round Pocket button, the flight of a pocketed sticker into it and the page turn that opens the album all use it. The corner is a seam of the Pocket (`cornerSide`: `'right'` by default, `'left'` on live pages); the clone keeps `'right'`.
4. **The page-turn engine already took any direction** (`phi` in `experiences/src/pocket/curl.js` points from the page toward the peeled corner, in screen coordinates). The Pocket's resting corner is `phi` 38° at the bottom-right and 142° at the bottom-left; the turn straightens toward 12° (right) or 168° (left), a nearly vertical fold that sweeps across the page. In a right-to-left page the left corner is the natural place to turn a page from.
5. **The rules that lift something are the clone's.** Every rule that lifts or moves a control because the corner shows, the album is open or a reimagined view shows (the `--pocket-corner-lift` blocks, `vg-guide { --vg-lift }`, the reimagined-view tuck, the accessibility-button rules) applies on the clone's page only (`:where(body:has(.page-shell))`, weights unchanged). This also fixes what S5 left: on a live page the open album lifted the microphone by 230 px.
6. **Nothing of ours is above the cookie banner.** The Pocket's layers, button and flying sticker stay far below the banner's `z-index` (2147483645). In English the banner floats bottom-left, where the Pocket button is: the banner and its filter cover our button until the visitor answers, and the filter blocks presses, which is the right order. In Arabic the banner is bottom-right and the button is free at once. No banner-detection code is needed.
7. **Tips and the VoiceTut tab, which the plan puts bottom-left, move above the Pocket button** when they arrive on live pages (phase 6): they are the layer's own elements, so lifting them is allowed. The Tips button already lifts above the VoiceTut tab with `--tips-lift`.

## Built (step S11, 2026-11-14)

- `experiences/src/pocket/pocket.js`: the seam `cornerSide` (`'right'` default, `'left'`), `PEEK_PHI` and `TURNED_PHI` as `{ right, left }` (38° and 12°; 142° and 168°), a `data-side` attribute on the button, and the sticker's end-of-flight spin mirrored for the left corner. `curl.js` is unchanged. `experiences/src/host/demos/pocket.js` passes `corner: true, cornerSide: 'left'`.
- `experiences/src/pocket/pocket.css`: the left button, its tooltip opening to the right, and every lift or tuck rule (the `--pocket-corner-lift` blocks, `vg-guide { --vg-lift }`, the reimagined-view tuck, the accessibility-button rules) behind `body:where(:has(.page-shell))`, so the clone's weights and behaviour are unchanged and none of it matches on Vodafone's pages. On the code before this step the open album set `--vg-lift` to 230 px on a live page and moved the microphone from `bottom: 91px` to 321 px.
- `voice-guide/tests/e2e/pocket-corner.e2e.test.ts` (port 4491, 20 tests; all 20 failed before the change). English and Arabic at 1366×900 and 375×812: nothing pocketed leaves the widget stand-in and the microphone as `?aixc=off` serves them (box, computed `bottom`, `right`, `transition`, `z-index`, inline style); pocketed, the button is at the bottom-left, hit-testable, opens the album, and its box meets none of the widget stand-in, the microphone, the keyboard button or the transcript bar; the stand-in and the microphone stay exactly as served while the peek shows, mid-turn, with the album open and after Back; the curl direction (read from the rig's own `phi` on every frame) starts at 142° and ends at 168°, and the bottom-left corner of the screen changes while the bottom-right does not; the flying sticker's middle ends inside the button and stays on screen; presses at a header link, a card and a footer link reach Vodafone's elements with the peek shown; a forced failure leaves the widget and the microphone as `?aixc=off`. With the banner stand-in (its filter covers the whole page in both languages): its box and filter are untouched, nothing of ours is at or above its `z-index`, a press at the button's centre reaches OneTrust, and once the banner and filter are removed the button opens the album.
- Checked by the lead in a separate worktree (033d2f7 plus S11): typecheck ok; the six Pocket suites `pocket-corner` 20/20, `pocket-chips` 16/16, `pocket-live` 3/3, `pocket-across` 5/5, `pocket-journey-live` 9/9, `pocket-journey` 4/4; `sdk-size` 4/4 (the Pocket chunk 31,847 B gzipped of 32,000 B; the journey chunk 8,236 B); experiences `npm test` 191/191; the clone's suites `pocket_e2e` 210/210, `aixc_e2e` 298/298, `arabic_e2e` 71/71, `tips_e2e` 87/87; the implementer also ran the whole end-to-end suite once, 128/128.
- Not verified: the real accessibility widget and the real OneTrust banner (the stand-ins only, O29); Windows and Safari (a scrollbar on the left edge of an Arabic page, iOS safe areas); Put back's reverse flight toward the left frame by frame; the reimagined view on live pages with the corner at the left (phase 4); keyboard focus on the left tooltip. The resting curl covers the bottom-left of whatever card is at the foot of the screen (presses still pass through).

## Consequences

- No exception to §4.6, no banner observer, no inline style on Vodafone's elements, no walker for them: the live Pocket never writes to the accessibility widget or the cookie banner at all.
- The actors (S12: mascot and drone) and the portal (S13) are designed for a bottom-left Pocket on live pages: the portal's `holdLive`, which pins the accessibility button inline, has no reason to run on live.
- A page turn from the bottom-left in a left-to-right page is a turn backwards, a design choice the owner made for safety.
- The clone and its Python suites are unchanged.

## Pilot knobs

- `cornerSide` per host; the resting and turned angles (142° and 168°); the button's size and inset.

## Revisit when

- Vodafone's own pages gain a bottom-left control (a chat widget, a feedback tab): the corner moves, or the Pocket button lifts clear of it, as the plan did for the accessibility button.
- Windows Arabic desktops show the browser's scrollbar on the page's left edge: check that the corner and the curl sit inside it.
- The owner wants the clone moved too.
