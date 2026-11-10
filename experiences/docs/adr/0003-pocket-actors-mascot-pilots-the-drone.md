# ADR-0003: The mascot flies the drone with a remote

- Status: proposed (implemented on `feature/pocket-actors-live`, not merged)
- Date: 2026-11-07
- Amends: [ADR-0002](0002-pocket-actors-live-stage.md) (live stage); everything there still holds
  unless this record changes it.
- Amended by: [ADR-0004](0004-pocket-actors-mascot-rides-a-hoverboard.md) (it flies the drone
  from a hoverboard; "walks in" below now means "rides in"; its second review made the remote
  bigger, 58 × 22 × 7.5 units, with red stick tips, and the arms and legs longer)
- Scope: `src/pocket/actors/mascot-model.js` (the remote, `holdRemote`), `renderer.js` (drawing it),
  `drone-flight.js` (`command`, `sticksFor`, `spool`), `drone-brain.js` (landing, landed, taking off),
  `mascot-brain.js` (parking), `timing.js`, `src/pocket/pocket-actors.js`, `pocket-actors.css`,
  `assets/manifest.json`.

## Context

In the live stage the two characters act independently: nothing on screen causes what the drone
does. The product owner asked: "What if we make the mascot holding the remote control for the
drone and actually flying it."

Choices the owner made when asked:

- **Eye:** on the drone while the drone does something, on the cursor otherwise (recommended).
- **Remote:** a classic RC controller with two sticks, a short antenna and a red light
  (recommended), not a smartphone.
- **Doze:** the drone lands beside the mascot (not the recommended hover-in-hold).
- **Signal:** nothing drawn between remote and drone; the sticks are enough (recommended).

## Decision

**The mascot is the pilot.** In the album (wherever there is a drone, so not on phones) it holds
an RC controller in both hands and every drone move has a visible cause:

- **The remote is modelled in the body's frame.** A rounded slab with two sticks, a red light and
  an antenna is held in front of the belly with its face tipped toward the viewer, a cartoon cheat
  so the sticks read. It turns, leans and squashes with the body. `holdRemote` solves both arms in
  model space so the hands are on the grips in any pose, with no lag. While it holds the remote the
  arm roots move forward round the body (78° to 40°) so the short arms reach. The thumbs rest on
  the sticks.
- **The sticks lead the drone.** The flight loop computes what a pilot would command this frame:
  the thrust-limited acceleration toward the drone's target (`command`). It maps that to Mode 2
  sticks: turn and climb on one stick, across and depth on the other, with a soft tanh curve
  (`sticksFor`). The drone itself flies on the target from `pilotLead` (100 ms) earlier, so the
  thumbs move first and the drone answers. A drag is the person's hand, not the pilot's: no delay
  then, and the sticks push hard toward home ("fighting" the hand). After 0.65 s of being dragged
  away it shakes the remote and peers at it. During the heart the sticks show the path's pull
  100 ms ahead. A ripple that makes it flinch jerks its thumbs, and the drone lurches 100 ms later.
- **Where it looks.** While the drone is doing something (following, the heart, a hop, a dodge, a
  drag, flying home, landing, taking off, curious), its eye is on the drone, and it leans back a
  little (up to 9°) to watch it overhead. With the drone just hovering, its eye is on the cursor as
  before, and the body still turns toward the cards.
- **Takeoff when the pocket opens.** If the floor beside where the mascot will stand (toward the
  content, so it does not walk through it) is free, the drone waits there, parked, rotors still,
  while the page turns. The mascot walks in, raises the remote (0.42 s), pushes the throttle, and
  the rotors spin up on the ground (0.38 s) before it climbs to its home. If that spot is not free,
  the drone hovers at home from the start, as before.
- **Doze.** At the idle threshold the mascot first lands the drone (state `parking`, 1.5 s): the
  drone comes down to the floor beside it, 10 px from its body. The left side is tried first, then
  the right; content, the floating buttons and the window edge rule a spot out. The rotors run down
  to a stop and the drawing stops redrawing. Then it yawns and sleeps, the remote sagging in its
  hands. Any input wakes it; it takes the sticks and flies the drone back up. With no free spot, or
  the drone off screen, it dozes without landing and the drone keeps hovering.
- **Off the ground, nothing to play with.** Landing, parked and taking off, the drone has
  `pointer-events: none`, so it never catches a click meant for what is under it.
- **Unchanged.** On the Services page its hands are on the pocket button (there is no drone
  there). Reduced motion: it simply holds the remote, sticks centred, and the drone never lands.
  Phones: no drone and no remote.

**Two shadows (a review fix, 7 Nov 2026).** The owner reported the shadow trailing the drone a long
way on long moves. The shadow on the page had moved only a quarter of the drone's vertical
travel, a ground-plane model that suited the hover bob but not travel across a page. Measured
before the fix, it was up to 165 px from the drone during a drag, 176 px flying home and 281 px
taking off or landing.

- **The page shadow** is now cast on the page behind the drone. It follows the drone exactly.
  Its offset, size and softness depend only on the drone's depth (its stand-off from the page)
  and on the cursor's light. The direction is eased by a spring so it never snaps.
- **The floor shadow.** A contact shadow on the floor takes over near the floor (landing, parked,
  taking off). It sits directly under the drone and fades out by `groundReach` (150 px) up.
- **Measured after the fix:** the page shadow stays within 42 px of the drone's lowest point in
  every state, and the floor shadow within 0.3 px of directly under it. Three browser checks guard
  this.

Also fixed on the way: the drone's home on screen was cached at layout time and went stale after
scrolling (it affected following and the ripple's reach). It is now read once per scroll.

## Consequences

- **Content crossing.** Landing and taking off are the only flights that may pass in front of
  content, for about a second, on screens where cards fill the right-hand column. The parked spot
  itself never covers anything. The drone is click-through on those flights. This was accepted
  because the owner chose "land beside it" over hovering in hold, and the alternative (land only
  when a clear corridor exists) would rarely land on a full pocket.
- **Arms are busy.** In the album the clips' arm motions (flinch, yawn, wake) are overridden by the
  grip. The remote jolts or sags instead.
- **Opening is longer.** The drone reaches its home about 2 s after the mascot arrives, instead of
  being there from the start.
- **Size.** About 4.6 KB more gzipped JS in the production build, measured against the margin
  version.
- **States.** The mascot adds `parking`. The drone adds `landing`, `landed` and `taking-off`.
  `DRONE_WATCHED` lists the states in which the pilot watches the drone; `DRONE_GROUNDED` lists
  landing, landed and taking off.
- **QA hooks.** On the mascot: `data-remote` (`none`, `moving` or `held`), `data-sticks` (across,
  depth, turn, climb, each -1 to 1), and `data-look`, which can now be `drone` or `remote`.

## What to tune in a pilot

All values are in `src/pocket/actors/timing.js` unless noted.

- `pilotLead` (100 ms): how far the sticks lead the drone. Below about 60 ms the cause is hard to
  see; above about 200 ms the drone feels sluggish.
- `stickRange` ([380, 300] px/s²): how hard a command must be to push a stick all the way. Lower
  values make the thumbs busier while it only hovers.
- `remoteRaise`, `droneTakeOff`, `droneSpool`: the takeoff beat. `droneLand`: the landing.
- `fightFor`, `shake`: how long a drag lasts before it shakes the remote, and how long the shake is.
- `groundReach` (150 px): how high the drone is when its floor shadow has faded out.
- In `mascot-model.js`, `REMOTE`: the remote's size, how it is held (`held.tilt`, how far its face
  is tipped toward the viewer) and the arm roots while holding it (`shoulder`).

**Watch:** whether people read the mascot as flying the drone without being told, whether the
landing (which can cross content) bothers anyone, and whether the longer opening feels slow.
