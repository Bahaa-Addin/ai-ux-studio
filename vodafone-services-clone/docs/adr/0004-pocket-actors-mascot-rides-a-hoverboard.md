# ADR-0004: The mascot rides a hoverboard

- Status: proposed (implemented on `feature/pocket-actors-live`, not merged)
- Date: 2026-11-07
- Amends: [ADR-0002](0002-pocket-actors-live-stage.md) (the walk in the album is replaced by a
  ride) and [ADR-0003](0003-pocket-actors-mascot-pilots-the-drone.md) (the pilot stays on the
  board). Everything else in both still holds.
- Scope: `src/pocket/actors/mascot-model.js` (`BOARD`, the board's frame; in the second review
  `REMOTE` and the arm and leg lengths), `renderer.js` (drawing them), `drone-flight.js` (`BOARD_FLIGHT`), `gait.js` (`planRide`, `ridePoint`; the walk removed),
  `mascot-brain.js` (`walking` renamed `riding`), `timing.js`, `clips.js` (look mode `ride`),
  `src/pocket/pocket-actors.js`, `assets/manifest.json`.

## Context

The product owner asked: "How about we also make the mascot ride on a hoverboard before holding
the drone remote controller, and it should have the same 6-axis free movement, and hovering
behavior of the drone in a way that is very live and dynamic."

Choices the owner made when asked (all three were the recommended options):

- **While it flies the drone:** it stays on the board, hovering.
- **Phones:** it hovers on the board there too (there is no drone or remote on phones).
- **Dozing:** the board settles to the floor and its glow dims; it lifts again when the mascot
  wakes, before the drone takes off.

**Review (7 Nov 2026).** After the first version (a charcoal deck 82 units long) the owner asked:
"The hoverboard needs to be bigger with a upward nose and also should be red matching Vodafone
red." The board below is the revised one.

## Decision

**In the album the mascot stands on a hoverboard that flies on the drone's flight model.** On the
Services page nothing changes: there is no board, and it hides behind the pocket button as before.

- **The board** is modelled in the mascot's 3D space under its feet: a deck 116 × 38 × 8.5 model
  units (about as wide as the mascot's box), in Vodafone red (`#E60000` on top, a darker red on
  its front edge, outlined in the same dark-red ink as the body, with a gloss line along the top).
  Its nose, the left end, curves up by 17 units over its last 32 (a parabola, so it leaves the
  flat smoothly). The nose leads as it rides in toward the content. The deck is lofted from 22
  cross-sections, denser along the nose and at the rounded ends, and its silhouette is the union
  of the slices between them, so the nose bends like a real deck in any attitude. Two hover pads
  underneath glow pale with a red halo, and a faint red haze lights the floor under it and fades
  out by 45 units up. It has its own height and attitude (roll, pitch, yaw, depth),
  independent of the rider's turn. The body is lifted onto the deck in model space, so the ground
  shadow stays on the floor; on the board that shadow is the board's (longer), and it shrinks (up
  to 30%) and fades as the board rises. It is drawn after the contact shadow and before the back
  layer, so the feet stand on it.
- **One flight model.** The board's x is the mascot box's offset (px). Its height and depth are
  model units. `stepFlight` drives all three with `BOARD_FLIGHT`: a spring-damper toward a target
  with a thrust limit, banking into sideways acceleration and pitching with depth. Its "rotor
  speed" is the pads' glow: brighter when it works hard, with a slow pulse. The board's flight
  runs on the real time since its last frame (up to 0.25 s, in steps of at most 32 ms along the
  path), not the frame loop's capped step, so slow frames while the page turns never leave it
  behind its path. Before this, a 380 px ride on a slow headless frame rate overshot its spot by
  15 px; now by 4 px at most, the inward drift included.
- **Riding replaces the walk.** On opening, the board chases an eased path from the corner to the
  mascot's spot (`planRide`, `ridePoint`: 450 ms + 4 ms per px, at least 750 ms, at most 1.7 s;
  it starts 120 ms after the page starts turning). Because the board follows the path on the
  flight model, it lags behind it, tips its leading end down as it speeds up and lifts it as it
  brakes (up to about 10°), passes its spot by a few px and wobbles to rest. The brain stays in
  `riding` for 320 ms more (`rideSettle`), then the mascot raises the remote. "Back to Services":
  it lowers the remote and rides off toward the corner, speeding up and never braking.
- **The rider.** It faces the way it rides, half turned (30°), and its eye looks ahead. It leans
  with the board and into the acceleration on a lagging spring, so its lean trails the board's
  and overshoots a little. Its knees (a squash) soak up bumps and lift-offs. While it moves with
  its hands free, its arms go out for balance and windmill against the lean. Its feet stay on the
  deck: its weight shifts are scaled down to 40% on the board.
- **Hovering, on all six axes.** Around its spot: a drift of up to 3 px inward (never outward, so
  the body and board keep to the content margin), a bob of ±4.5 units around 22 units up, ±8 units
  of depth, ±3.5° roll, ±3.5° pitch, ±9° heading, each a sum of slow sines. Now and then a small
  bump of turbulence kicks it (every 1.4 to 3.6 s while it hovers, every 0.2 to 0.5 s while it
  rides), so its knees work and its attitude corrects.
- **Flying the drone** from the board: unchanged from ADR-0003, except that the remote now rides
  on a body that hovers and sways.
- **Dozing.** While it yawns and sleeps it sets the board down on the floor (a slow, damped
  descent with no bounce) and the glow dims to 12%. Any input wakes it: the board lifts at once
  (it is back above 12 units before the drone starts to take off) and the drone follows.
- **Phones:** the board and its hover, with no drone and no remote. **Reduced motion:** it stands
  on the board, hovering still at 22 units, glowing; no ride, no wander.
- **Layout.** The body stands about 29 model units higher: 23 to 24 px at the album's 100 px
  mascot (1440 px wide, measured at the top of a bob; 20 to 22 px before the second review) and
  about 13 px on phones. That lift (at
  the top of its bob) is counted wherever its height mattered: the content check where it stands
  (it stands a little lower or tucks away), how far it tucks under the floor, the spot the page
  watches for content, and where its eye is when its heading is estimated. Its margin inset is
  measured on the body and the deck together, so the board never sticks out past the line;
  measured, the body and the board's tail end within about 1 px of each other, 2 to 3.5 px
  inside the content's right edge, from 390 to 1920 px wide.

**Second review (7 Nov 2026): a bigger remote, longer arms and legs.** The owner asked: "Can you
also make the drone remote control also bigger and more prominent. Maybe you'll need to make the
mascot's hands and legs a bit longer too." This amends the remote of ADR-0003 and the rig of
ADR-0002:

- **The remote** is 58 × 22 × 7.5 model units (it was 42 × 16 × 5.4), about two thirds of the
  body's width. It is held further out in front of the belly (11 units off it, was 4) and a
  little higher (28 units up, was 25), with its face tipped further toward the viewer (50°, was
  38°) so the sticks show. Its sticks, gimbals, light and antenna grow with it. For contrast
  against the red body and board its face is lighter grey, its gimbals are ringed in light grey,
  and its stick tips and antenna tip are Vodafone red. The arm roots sit 42° round from the front
  while it holds the remote (was 40°).
- **Arms and legs** are longer everywhere, the Services page included: arms 25 units (were 21),
  legs 16 (were 13), each a little thicker. The hands still reach the remote's grips and the
  pocket button's rim, because both reaches are solved. The body does not move; its feet come
  down closer to the ground (soles 1.8 units above it, were 4.6). On the board, `BOARD.feet` is
  now worked out from the leg geometry, so the deck always meets the soles; the body therefore
  rides about 2 px higher on it. Riding with its hands free, its arms reach further out for
  balance. All 88 unit tests, 204 Pocket and 292 AIXC browser checks pass again, and the
  floating-button stand-ins still clear it by 130 px or more.

## Consequences

- **The walk is gone.** `planWalk`, `sampleWalk` and the `walk*` timings are removed; `gait.js`
  keeps the shuffle (feet while it turns) and gains `planRide`/`ridePoint`. The state `walking`
  is now `riding`, the brain takes `rideFor` instead of `walkFor`, and the look mode `walk` is
  `ride`.
- **It stands higher.** 23 to 24 px on desktop. Where cards come near its spot it stands lower,
  as before, so its visible part is unchanged; on the board that can hide the board itself (at
  1024 × 768 with three cards it sank 29 px instead of 14 px with the first board, and only its
  upper body shows, as before). Whether it stands or tucks away was the same at every size tried (390 × 844 with
  one and three cards, 720 × 450, 768 × 1024, 1024 × 768). The floating buttons (accessibility, Voice Guide microphone) still clear it: with
  stand-ins at 1440, 1280 and 390 px wide the mascot's drawn top is 130 px or more below them.
- **Size.** The actor layer's source grew by about 15 KB (the board, its physics and comments).
  The unit-test budget for the layer's source was 250 KB and the layer was already at 247.6 KB,
  so it is raised to 270 KB (the layer is now about 264 KB). The production build grows by 2.2 KB
  of gzipped JS (97.6 to 99.9 KB, measured against the version before the board). This is a
  budget decision the owner may want to revisit.
- **Drawing cost.** Eight more SVG elements per frame, three of them blurred (the floor haze and
  the two pad glows). In headless Chromium at 1440 × 900, the first (charcoal) board against the
  version just before it: 58 and 60 fps with the pointer moving and at rest (was 57 and 60),
  script per frame p50 1.6 ms (was 1.5 to 1.6). The red, lofted board against the charcoal one,
  two runs each on the same (slower) machine: 49 to 51 fps with the pointer moving (charcoal 50 to
  54), 60 at rest (60); script per frame p50 1.9 to 2.3 ms (1.8 to 2.0). So the lofted deck costs
  about 0.1 to 0.3 ms more script per frame. Paint cost on real GPUs and phones is not measured.
- **QA hooks.** On the mascot: `data-board` (`none`, `riding`, `hovering`, `down`) and
  `data-board-pose` (hover height, roll, pitch, heading, depth, glow).

## What to tune in a pilot

All values are in `src/pocket/actors/timing.js` unless noted.

- `ride` ([450, 4, 750, 1700]): how long the ride takes (base ms, ms per px, least, most).
  Shorter rides bank harder.
- `rideSettle` (320 ms): how long after the path ends it waits to raise the remote.
- `boardWander` ([3, 4.5, 8, 3.5, 3.5, 9]): the hover's drift (px, inward), bob and depth (units),
  roll, pitch and heading (degrees). The rates are in `pocket-actors.js` (`boardWander`).
- In `drone-flight.js`, `BOARD_FLIGHT`: `frequency` and `damping` (how briskly it follows the path
  and how much it overshoots), `bank` and `maxTilt` (how far it tips), `rpm` (the glow).
- In `mascot-model.js`, `BOARD`: `hover` (how high it floats, which sets how much higher the
  mascot stands), its size, `nose` (how long the upturned part is and how far it rises), `round`
  (how square its ends are) and the pads. Its colours are in `renderer.js`.

**Watch:** whether people read it as riding a hoverboard rather than standing on a shelf, whether
the extra height crowds the cards on short windows, and whether the turbulence reads as alive or
as jitter.

## Verified

- Unit tests (`npm test`): 88 pass, including the ride on `BOARD_FLIGHT` (it lags its path,
  banks into the ride, flares as it brakes, overshoots a little, is at rest within 1.5 px when the
  remote comes up, a leave never brakes, rides never exceed the cap).
- Browser checks (`tests/e2e/pocket_e2e.py`): 204 pass (195 before). The nine new ones cover:
  riding in from the corner with its feet on the deck in every frame and never stepping back;
  banking (measured 9 to 12°) with its arms out and the remote down until it stops; the hover
  moving on all six axes (ranges measured over 4 s at 1440: bob 7.2 units, drift 1.1 px, depth
  10.2 units, roll 5.2°, pitch 6.2°, heading 11.8°) at 19 to 27 units up, feet on the deck and
  the deck inside the margin; the board down and dimmed while it sleeps; lifted above 12 units
  before the drone takes off; still on its board with reduced motion; hovering on phones without
  a remote and covering nothing. Five existing checks now expect riding instead of walking (one
  also checks that it rides off on Back). The collision checks count the body drawn above its
  box and the board, and the margin checks measure the mascot's visible right edge (its body or
  its board, whichever reaches further). All 204 pass again with the red board.
- Not verified: real phones (only a 390 × 844 emulated viewport), Arabic/RTL, real users, paint
  cost on real hardware.
