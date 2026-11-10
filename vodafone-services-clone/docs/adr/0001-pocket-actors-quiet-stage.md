# ADR-0001: Pocket actors follow a "quiet stage" motion direction

- Status: superseded by [ADR-0002](0002-pocket-actors-live-stage.md) before merging (it was implemented on `feature/pocket-actors-quiet-stage`; that work is kept as a patch, not merged)
- Date: 2026-11-05
- Scope: `src/pocket/pocket-actors.js`, `src/pocket/actors/*`, `src/pocket/pocket-actors.css`, one hook in `src/pocket/pocket.js`

## Context

A motion review of the Pocket mascot and drone (5 November 2026) measured the build at `c2b1a12`
in Chromium at 1440×900, 1024, 768, 390×844 and 320:

- Opening the Pocket started about 5.3 s of actor motion around a 1.15 s page turn: a sprint of
  about 1,300 px along the bottom edge and a heart drawn beside the title, overlapping for 1.2 s.
- Two seconds after the pointer stopped (that is, while people read) the mascot became
  "impatient", then ate an apple and slept: seven performances in the first 24 s.
- Every card crossing made it jump and spin (four jumps in 2.5 s of scanning).
- At 768 px and narrower, the sprint crossed and stopped on card titles, View more and Remove.
- The drone never stood still and hovered in the control bar on phones.
- Every save and every open replayed the full performance.
- Turns past about 35° slid the flat face off the body (the eye left the outline).

## Decision

The saved content, the controls and the page turn lead. Each moment gets one short beat from one
actor, every beat ends in stillness, and nothing performs while people read. Shorter, smaller and
rarer, not slower.

| Moment | Rule |
|---|---|
| Save | The first save of a page load: the mascot peeks 550 ms before the sticker lands, catches it when pocket.js reports the landing (`itemLanded`), and is gone by about 2.4 s. The next two saves: an eye-only glimpse. Later saves: nothing. |
| Open | The first open of a page load, when the corner has room: the turning edge catches the mascot about 220 px from its corner at 80% of the turn, and it scurries home. Still about 1.7 s after the click. Later opens, phones and a covered corner: it is already home. |
| Drone | Parks (no look-round, no bob, rotors drawn as a steady blur, its loop stops). The pointer makes it curious. The first click of a page load draws a heart of 96 px or less (only the heart is inked); later clicks get a small hop. No drone under 640 px. At least 24 px from "Empty pocket". |
| Browsing | The eye looks toward the cards; at the pointer only within 240 px. Crossings do nothing; a 700 ms dwell moves the eye; the first dwell of a visit adds one 8 px hop, then a 10 s cooldown for any body motion. |
| Idle | An eye-only glance after 20 s without input, then every 20-40 s; a doze at 60 s. Impatience, the apple and whole-body glances are retired. |
| Close | No performance: both actors hold and the returning page covers them. |
| Craft | Turns capped at 30° (clips and renderer). Tip and limbs trail the body by 40-80 ms. Ease-out attacks, ease-in exits. |
| Turn-taking | While the drone performs (curious, heart, hop, drag, return), a card dwell moves only the mascot's eye. |

## Consequences

- QA hooks keep their names. New mascot states: `catching`, `glimpsing`, `hopping`. Retired:
  `waving`, `jumping`, `beaming`, `impatient`, `eating`. New drone state: `curious`.
- Clips retired: `wave`, `closeDuck`, `glance` (now eye-only), `jump`, `beam`, `impatient`, `eat`.
  The apple decal stays in the sheet, unused.
- "Per page load": the save and open counters reset on reload. A per-session rule would need
  `sessionStorage`; not done.
- The eye follows the flying sticker for the half second it peeks, so it reads layout per frame
  only during that peek.

## What to tune in a pilot

All values live in `src/pocket/actors/timing.js`.

- `greetLead` (550) and `catch` (260): how early the mascot appears before a landing.
- `greetFull` (1) and `greetGlimpses` (2): how many saves get a beat.
- `revealAt` (0.8), `runReach` (220) and `run` (380): how much of the reveal the mascot gets.
- `cardDwell` (700), `bodyCooldown` (10000) and `nearPointer` (240): how readily it reacts while
  people browse.
- `glanceAt` (20000) and `sleepAt` (60000): the idle clock.
- `droneHeart` (1600) and `heartMax` (96): the reward's length and size.

Watch the five-second recall of saved services against the actors, and how often people
click the drone, before changing any of these.
