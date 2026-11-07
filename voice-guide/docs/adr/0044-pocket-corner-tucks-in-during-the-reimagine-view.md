# ADR-0044: In the Reimagine view the Pocket corner tucks in, and the right-hand column stays lifted

- Status: Accepted (2026-11-07)
- Date: 2026-11-07
- Area: UI, floating controls (the guide's microphone, Vodafone's accessibility button, the Pocket, Reimagine, "Your journey"); resolves open issue O20
- Owner decision: 2026-11-07, "have the corner tuck in during the Reimagine view" (the alternative was a bottom-right safe area inside every experience)

## Context

While anything is pocketed, the Services clone's bottom-right corner curls up with the mascot under it. The microphone and the accessibility button rise 230px (150px on phones) to make room. Several ready-made experiences put their own next, previous or pause buttons in that same corner. The 2026-11-05 walkthrough found the corner covering them:

- ring, tunnel and spotlight on desktop;
- also flipbook and gallery on phones and in Arabic.

The curl is about 150px across. It has `pointer-events: none`, so clicks went through, but the buttons were hidden under the paper. Lifting the experiences' buttons by 64–76px was tried and dropped: they were still half covered, and on phones they landed on the card titles.

Writing the test for this found a second overlap. With nothing pocketed, the corner does not peek, so the microphone and the accessibility button sit at their usual place. There, the accessibility button (1291–1346 × 825–880 at 1366 wide) covered the tunnel's "Next service".

## Decision

While the reimagined view is shown and the Pocket is not open (`body:not([data-pocket-view]):has(#experience-output:not([hidden]))`, in `vodafone-services-clone/src/pocket/pocket.css`):

1. **The corner tucks in.** The curl's two layers get `opacity: 0`, which hides the curl and the mascot under it. Opacity is used rather than visibility because the curl's parts set their own visibility.
2. **The Pocket button joins the right-hand column.** It sits 16px under the accessibility button: `bottom: 20px + lift − 16px − its size`. That is 176px from the bottom on desktop and 102px on phones. It keeps its count, and it still opens the Pocket with the page turn: `data-pocket-view` is set before the turn is drawn, so the layers are back for it.
3. **The column stays lifted even with nothing pocketed.** The microphone (`--vg-lift`) and the accessibility button keep the lifted place, so the bottom-right corner belongs to the experience.

Back on the original view, or with the Pocket open, everything is as before.

## Consequences

- Measured 2026-11-07, 1366×900:
  - microphone 1287,515;
  - accessibility 1291,595;
  - Pocket button 1286,666 (58×58);
  - the tunnel's previous and next buttons are fully clear.
- Phones (390×844): the same column, 16px apart.
- The 13 experiences in English and Arabic at 1366 and 375 have no control under the tucked button. The one exception is the flipbook's page corner on phones. It scrolls with the book, and it passes under the button only at the very top of the page, as any content passes under a floating button.
- In the reimagined view you cannot see the curl hint that something is pocketed. The button's count says it.
- The live-stage actors branch (`feature/pocket-actors-live`) puts the mascot behind the Pocket button. When it lands, its mascot must follow the button into the column or hide while tucked.

Tests:

- `voice-guide/tests/e2e/reimagine-floating.e2e.test.ts`, "Reimagine: the Pocket corner tucks in and nothing covers the experience controls". It covers tunnel and spotlight, empty and with two stickers, on desktop and phone, and that the button opens the Pocket. It fails without the change ("Next service under accessibility").
- `tools/demo-walkthrough.ts` checks that no curl is drawn.

## Pilot knobs

- `--pocket-corner-lift` (230px; 150px under 768px) and the 16px gap, in `pocket.css`.

## Revisit when

- An experience puts controls in the right-hand column's height range (about 500–730px from the top on desktop).
- People in a pilot miss the Pocket while a reimagined view is shown.
