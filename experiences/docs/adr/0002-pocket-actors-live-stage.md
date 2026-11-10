# ADR-0002: Pocket actors are a "live stage": physical, free-moving, part of every save

- Status: proposed (implemented on `feature/pocket-actors-live`, not merged)
- Date: 2026-11-05
- Supersedes: [ADR-0001](0001-pocket-actors-quiet-stage.md) (quiet stage)
- Amended by: [ADR-0003](0003-pocket-actors-mascot-pilots-the-drone.md) (the mascot flies the drone)
  and [ADR-0004](0004-pocket-actors-mascot-rides-a-hoverboard.md) (in the album it rides a
  hoverboard instead of walking)
- Scope: `src/pocket/pocket-actors.js`, `src/pocket/pocket-cursor.js` (new), `src/pocket/actors/*`
  (new: `physics.js`, `gait.js`, `drone-flight.js`), `src/pocket/pocket-actors.css`,
  `src/pocket/pocket-cursor.css` (new), `index.html` (one stylesheet link), `src/pocket/pocket.css`
  (the mic and accessibility buttons stay lifted in the open pocket too). `pocket.js` only keeps
  the two hooks added with ADR-0001 (`itemPocketed({ landsIn })`, `itemLanded()`).

## Context

After reviewing the quiet stage (ADR-0001), the product owner asked for the opposite emphasis:
the characters should be very alive and move freely in 3D ("6-axis"), feel real, and take part
in the actions. Specifically:

- On every save the mascot moves to the pocket button, holds it as if opening the pocket, and
  catches the flying item.
- Opening the pocket: the mascot walks only a short way, to stand on a vertical line under the
  drone (not across the page to the opposite corner).
- On the Services page the mascot hides behind the pocket button until an item is saved, and
  goes back to hiding behind it afterwards (the earlier decision, restated in review).
- Both characters keep the same margin from the page edge as the rest of the page body, so
  they line up with its content (added in review).
- The drone hovers gently round its place, moving freely.
- The mascot should stop facing the viewer with its whole body: its body turns toward the
  saved cards while its eye follows the cursor.
- The cursor on the Pocket page should look and behave differently.

Choices the owner made when asked: keep the 3D-in-SVG rig and make the motion real (not WebGL);
the mascot hides behind the button between saves; the cursor is "a soft light" combined with
"the characters play with it"; the cursor applies on the Pocket page only.

The flat face was the blocker for body turns: past about 35° the eye slid off the body (ADR-0001
capped turns at 30° for that reason).

## Decision

**Motion is physical, not keyframed.** Every turn and lean is a spring (`physics.js`); the walk is
procedural (`gait.js`: bouncy steps that slow into each landing so the standing foot does not
skate, sway onto the standing leg, arms against legs); the flame tip follows through on an
under-damped spring; breathing, weight shifts and small fidgets keep a resting body alive. The
drone is a small flight model (`drone-flight.js`): a spring-damper with limited thrust that
banks into its acceleration, wobbles as it corrects and spins its rotors faster when it works.
Clips (`clips.js`) remain only for scripted beats and never set the heading.

**The eye is modelled.** A lens bulging out of the curved body, its rim on the surface, so it wraps
round the body and is clipped by its outline at any angle. Iris and pupil turn on the lens;
glints sit at the light's reflection; the upper lid is a shell that closes from the top. The
30° turn cap is gone; the body turns up to 40° toward the cards (`bodyMaxTurn`), which keeps the
eye on show.

| Moment | Behaviour |
|---|---|
| Save (every one) | 0.7 s before the item lands the mascot rises straight up from behind the button (where it hides, wholly below the button's middle), reaches for its rim (its arms aim at two rim points, `reachToward`), and pulls the pocket open: the button shows a dark mouth and its mittens show over the rim, under the count badge. The item drops in: the button snaps shut, the count goes up, a squash and a grin, it lets go and sinks straight back down behind the button (gone about 0.8 s after the landing). Saves while it is out keep it holding on. Pressing the button lets go at once. |
| Open | It starts behind where the button was and walks to the content's right margin, under the drone (a few steps; under 2 s). Phones: no drone; it stands on the same margin. Content where it would stand: it stands lower or tucks away, as before. |
| Margins | The drone's visible right edge (its rotor guards) and the mascot's body sit on the right edge of the album's content (`.pocket-view__inner`), where the cards and "Empty pocket" end, at every width. The edges are measured from the drawings, not their boxes; the mascot's in the pose it stands in (turned toward the cards). Its hands may cross the line by a few px as it turns and gestures. The drone's home is the upper right on that margin (between the bar and the cards); the gutters are only fallbacks. |
| Album | Body toward the saved cards (or the card a pointer rests on for 350 ms); the eye follows the cursor in saccades; a cursor far away pulls the body round a little. Doze at 60 s without input. |
| Drone | Hovers round its home on all six axes (across about 5 px in and 3 px out from the margin, ±6 px up and down, depth ±14, heading ±14°), never nearer than 24 px to "Empty pocket". Curious when the pointer is on it. Follows a slow cursor in the open space (the band above the cards, the right gutter), keeping 56 px between its edge and the cursor, and goes home when the cursor goes onto content, speeds up, goes far or after 7 s. Heart on the first click of a page load, then hops. Dragging springs back. |
| Cursor (Pocket page, mouse/trackpad) | An exact red dot in a soft halo; a gentle pool of light that trails it a little (the rest of the page a shade dimmer); cards near it lean toward it (5° at most) and catch a sheen; a click sends a ring of light; when the ring reaches the mascot it flinches, when it reaches the drone it is shoved aside. The light also lights the characters: their highlights turn toward it and their shadows fall away from it. |
| Close | It walks off toward the corner while the page turns back over it. |
| Reduced motion | Unchanged in spirit: still poses, no walk, no save beat, drone at rest and decorative, normal cursor, no lean, no ripple. |

## Consequences

- The mascot and drone loops now run continuously while visible (they are alive). The mascot draws
  every other frame when only breathing and the pointer is still; both stop when hidden, off
  screen, in a background tab or with reduced motion. Model cost measured at about 0.4 to 0.9 ms per
  mascot frame in Node; see the runbook entry for browser numbers.
- The cursor hides the native arrow only while its own dot is running (`[data-cursor]` on the
  album, set by script). If the script fails or stops, the attribute goes and the arrow is back.
  Text fields keep the caret. It never applies on touch, with reduced motion, or while the journey
  covers the album.
- States renamed: mascot `emerging`, `holding`, `catching`, `slipping`, `walking`, `idle`, `tucked`,
  `flinching`, `yawning`, `sleeping`, `waking`, `leaving` (retired: `peeking`, `glimpsing`,
  `retreating`, `page-reveal-hidden`, `startled`, `running`, `recovering`, `corner-idle`, `glancing`,
  `hopping`, `closing`). Drone: added `following`, `dodging`. New QA hooks on the mascot:
  `data-body-yaw`, `data-look`; on the iris `data-gaze` (degrees).
- The eye artwork left the decal sheet (`mascot.svg`); the mouth, cheeks, hands and effects remain.
- Aligning to the content means the drone no longer uses the right gutter on wide screens; on a
  1440 px window both stand about 150 px in from the window edge. The open band between the bar
  and the cards is now the drone's home, so following and the heart start from there.
- In the album the mascot now stands bottom-right (under the drone), where Vodafone's accessibility
  button and the Voice Guide's microphone sit when nothing lifts them. The lift they get while the
  pocket button shows (`--pocket-corner-lift`, 230 px; 150 px under 768 px) now also applies while
  the pocket is open (`body[data-pocket-view='open']`). Checked with stand-in elements using the
  same rules; the real launcher was not in the clone, so verify on the merged build.
- The "every save" rule replaces ADR-0001's per-page-load counting for the mascot; the heart stays
  once per page load.
- More motion on screen means more pull on the eye than the quiet stage. Amplitudes are kept small
  (sub-degree to a few degrees, a few pixels) so it reads as alive rather than busy; this is the
  trade-off the pilot should watch.

## What to tune in a pilot

All values live in `src/pocket/actors/timing.js` unless noted.

- `emerge`, `grabLead`, `catch`, `slip`: how early it comes out and how long it holds the button.
- `walkStride`, `walkStep`: the walk's pace (at 1440 px the walk is now about 130 px, seven steps).
  `bodyMaxTurn` (40): how far it turns toward the cards.
- `droneWander` ([10, 6, 14]): how much the drone drifts (across, `droneTarget` in
  `pocket-actors.js` centres it on the margin: `0.4` and `-0.1` of the first value). `droneFollowAfter`, `droneFollowSpeed`,
  `droneFollowReach`, `droneFollowGap`, `droneFollowFor`: how readily it comes to play.
- `rippleReach`, `rippleSpan`; `lightLag`: the cursor's ripple and how far the light trails.
- In `pocket-actors.js`, the life amplitudes in `drawMascot` (breathing, weight shift) and the
  spring frequencies in `body`; in `drone-flight.js`, `FLIGHT` (bank per acceleration, wobble).
- In `pocket-cursor.css`, the light's strength (the gradient's alphas).

Watch: whether people find saved items as quickly with the characters moving; how often they
play with the drone; whether anyone misses the native cursor on the Pocket page.
