# ADR-0045: Tips, an Apple Tips-style walkthrough of the four demos, in the Services clone

- Status: Proposed (2026-11-07): built and tested offline; waits for the owner's review on the Mac
- Date: 2026-11-07
- Area: UI, onboarding, floating controls; the Services clone (`vodafone-services-clone/src/tips/`)
- Related: ADR-0040 and ADR-0043 (the clone is where the four demos meet), ADR-0044 (the experience owns the edges in the Reimagine view), SPEC-01 (design language), SPEC-06 (what the trail never records), AGENTS.md §4.6 (never cover the accessibility button)

## Context

The four demos (voice guide, Pocket, Reimagine this page, Exploration Trail) now share one page, the Services clone mounted at `/en/services` and `/ar/services` by `npm run demo:trail`. Nothing on that page tells a person what the controls are or how to use them. The owner asked for an onboarding "very similar to the Apple Tips walkthrough": dynamic, interactive and animated.

Apple's Tips app pages sideways through a collection: a cover, then one tip per card, each with a short looping animation of the gesture above a title and two sentences, page dots, sometimes a link to try it. TipKit, its in-app counterpart, points a small popover at the real control.

Constraints from the project: real pages and real content only; Vodafone's design language; floating controls never overlap (runbook §5a); the accessibility button is never covered; the trail never records our own UI; framework-free; every failure caught; the bundle stays small; English and Arabic.

## Decision

1. **Where.** In the Services clone, as `src/tips/`, started from `main.js` with the adapter, the regions and the Pocket. Not in the voice-guide SDK: the tips introduce demos that live in the clone (Pocket, Reimagine) as well as the guide, and the clone is the page where all four meet. Plain ES modules and CSS, in the clone's own code style (2 spaces), no dependency.
2. **The way in.** A white "Tips" button at the bottom-left, the one edge no other control uses (the right-hand column is the microphone, the accessibility button and the Pocket; the top is "Your journey" and Reimagine). It steps aside in the Reimagine view and the open Pocket, as ADR-0044 does for the corner, and rises above the VoiceTut tab when that experiment is on. A red dot marks it until the tips are opened once.
3. **First visit.** A small, non-blocking invitation above the button ("New on this page … Show me / Not now"), once. It waits while the journey's consent card is showing, so a person is asked one thing at a time. A browser driven by automation (`navigator.webdriver`: tests, the walkthrough tool, the Playwright-driven demo browser) gets no invitation, so no existing check is interrupted. `?tips=open`, `?tips=invite` and `?tips=off` override.
4. **The collection.** A cover, two tips per demo in the order voice guide, Pocket, Reimagine, journey, and a closing card with a tile per demo. A centred card on wide screens; a bottom sheet with a grabber on phones (drag down to close). Paging is the browser's own scroll snapping, so touch, trackpads and the keyboard (arrows, mirrored in Arabic; Home; End; Esc) all work natively; the picture moves slower than the card as you swipe (parallax). Jumps past several cards (dots, Home, End) fade across instead of sliding through them.
5. **The scenes.** Each card loops a short animation on a 400×250 copy of the page, scaled to fit, played only while that card is on screen. They use only the page's own services, pictures and section titles (the content model), the clone's own template names and icons, the trail's own consent words, three of the guide's verified journey questions (`config/experience/vodafone-eg.profile.json`) and a spoken example from the router's tuning set ("What’s the cheapest internet bundle?" / "إيه أرخص باقة نت؟", 33/33). The internet bundles page, which the clone does not have, is drawn as grey blocks. The Vodafone Cash question is not used for the answer shown, because it routes to the Cash page (O19). Web Animations API, transforms and opacity only.
6. **Try it.** A tip whose demo is on the page hands over to a coach mark, as TipKit does: the sheet shrinks into the real control, a popover points at it, a scrim dims the rest with holes for that control and for Vodafone's accessibility button, and the flow waits for the person to press it. Nothing is pressed for them. The flows read the demos' own state (`pocket.state`, `body[data-aixc-view]`, `body[data-pocket-view]`, the launcher's `aria-expanded`) and change none of it: Pocket (a "Pocket it" chip, then the corner, then the open Pocket), Reimagine (the launcher, Cover flow, Original), voice (the guide's microphone), journey (the guide's "Your journey" pill). A success popover offers "Back to tips", which continues at the next demo; the closing card shows a check on each demo tried. When the guide is not on the page, its two tips say so plainly instead of offering Try it.
7. **Never in the way.** The sheet and the coach sit above the guide (z 2147483500) and below OneTrust; the accessibility button keeps a hole in every scrim. The tips' layers carry `data-vg`, so the trail neither records nor counts them as explored. Every entry point catches its errors; a scene that fails becomes an empty frame.
8. **Lazy.** Only `entry.js` and `entry.css` load with the page (the button and the invitation). The collection, the scenes, the coach and `tips.css` load the first time someone opens the tips (or hovers the button). State (seen, invited, tried, last card) is in `localStorage` (`aixc.tips.v1`), in this browser only.
9. **Reduced motion.** Scenes stop on a poster frame that tells the same story; no transitions, no parallax; the sheet fades instead of sliding.

## Consequences

- Measured 2026-11-07 (Linux container, Chromium 153, headless, the clone served by `scripts/serve.mjs`):
  - Tips button 1366×900: 20,836 86×44 (English), clear of the microphone 1287,743, the accessibility button 1291,825 and the Pocket 1286,666 (column lifted); 375×812: 16,752. Arabic labels are wider (about 100px).
  - `tips_e2e.py` 87/87; the clone's `npm test` 93/93 (8 new); `pocket_e2e.py` 119/119, `aixc_e2e.py` 292/292 and `arabic_e2e.py` 71/71, the same as before the button.
  - With the real guide on the saved pages (`tests/e2e/tips.e2e.test.ts`, 2 tests): the voice and journey coach marks ring the guide's own microphone and pill and finish on a real press; no overlaps on load or with the Pocket peeking, English and Arabic, 1366×860 and 390×844. Whole voice-guide e2e suite 50/50; `demo-walkthrough.ts --lang en` 23/26, the same three known failures (O19 ×2, O21), Tips clear of every control.
- Sizes (gzip -9, 2026-11-07): with the page, `entry.js`, `entry.css`, `catalog.js` and `icons.js`, about 8.1 KB (and about 3 KB more of Arabic copy in `i18n.js`); on demand, `tips.js`, `scenes.js`, `coach.js`, `geometry.js` and `tips.css`, about 32.9 KB. A Vite build puts them in their own chunk (17.9 KB gzip) and asset (6.5 KB gzip).
- Found while building it, and fixed before delivery: a popover beside "Your journey" landed on the wider Reimagine launcher under it (it now steps out past a control in its way, up to 72px); a press-only step showed a "Got it" that would have skipped it.
- The scenes are illustrations: a person can mistake them for the page. Each sits in a rounded frame inside the sheet, and the copy beside it says what to do on the real page.
- The tips introduce what the demos do today. When a demo changes (O19 answered on Services, an agent model, the shop), its tip's copy and scene must change with it.
- The clone has no ADRs of its own; this one lives in the voice-guide series, as the audit of 2026-11-05 suggested.

Tests:

- `vodafone-services-clone/tests/tips.test.mjs`: card order, availability, saved state, the invitation rule, popover placement, the scrim's holes, and that every string the tips show has its Arabic.
- `vodafone-services-clone/tests/e2e/tips_e2e.py`: the button and its laziness, the invitation, paging, keys, focus, the accessibility button reachable over the scrim, scenes from the page's own content, Try it for the Pocket and Reimagine end to end, voice and journey on a stand-in, reduced motion, phones (bottom sheet, swipe, drag to close), VoiceTut, Arabic, every reimagined view.
- `voice-guide/tests/e2e/tips.e2e.test.ts`: the voice and journey tips tried on the real guide, and no overlaps with the Pocket peeking, English and Arabic, desktop and phone.
- `tools/demo-walkthrough.ts` measures the Tips button with the other floating controls.

## Pilot knobs

- `?tips=open|invite|off` on the page; the invitation's delay (1.6 s) and how long it waits for the consent card (60 s), in `entry.js`.
- The order and copy of the cards (`catalog.js`), their Arabic (`src/i18n.js`), the spoken example and the three journey questions (`tips.js`).
- Scene timings (each scene's loop length and poster frame, `scenes.js`).
- The button's place (`entry.css`: 20px from the left and bottom; 16px on phones) and when it steps aside.

## Revisit when

- People in a pilot do not find the Tips button, or dismiss the invitation without opening it.
- A demo's behaviour changes (O19, the shop, an agent model, page watch on the clone): update its tip and scene.
- Another control is placed at the bottom-left, or an experience puts controls there in the original view.
- The tips move to the live site (a Tealium tag, D1): they would need to load without the clone's content model, and the guide would host them.
