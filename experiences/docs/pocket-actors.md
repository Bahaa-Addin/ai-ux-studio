# Pocket actors: the mascot and the drone

A character layer on top of Pocket. A Vodafone-red mascot lives behind the pocket button and in
the pocket album, and a small red drone hovers over the album. They are decoration. They never
hold up a save, an open or a close, never block a control, never take focus, and make no sound.

**Motion direction: "live stage"** ([ADR-0002](adr/0002-pocket-actors-live-stage.md), which
supersedes the "quiet stage" of [ADR-0001](adr/0001-pocket-actors-quiet-stage.md)). Both
characters are alive and move freely in 3D, physically: springs for every turn and lean, a
hoverboard and a drone that fly. They take part in what the person does: the mascot opens the
pocket for every save and catches the item; on the Pocket page its body turns toward the saved
cards while its eye follows the cursor; the drone plays with the cursor, which becomes a soft
light there (`src/pocket/pocket-cursor.js`).

**The mascot flies the drone** ([ADR-0003](adr/0003-pocket-actors-mascot-pilots-the-drone.md)).
In the album it holds an RC controller in both hands. Its thumbs move the sticks and the drone
answers a moment later. Its eye is on the drone while the drone does something, and on the
cursor otherwise. It lands the drone beside it before it dozes and flies it up again when it
wakes.

**The mascot rides a hoverboard** ([ADR-0004](adr/0004-pocket-actors-mascot-rides-a-hoverboard.md)).
In the album it stands on a floating Vodafone-red board, its nose curving up at the leading end,
that flies on the drone's flight model. It rides in
from the corner, banking into the ride with its arms out, and hovers on all six axes while it
flies the drone. It sets the board down to doze and lifts it again when it wakes. The Services
page is unchanged: no board there.

Both actors are **3D models drawn as SVG**. Every frame, a small 3D kit (`space.js`) poses the
model, projects it with perspective and rewrites the SVG paths. The mascot's outline is solved
from its pose: a flame-shaped body whose curled tip swings round as it turns. Its eye is
modelled too: a lens bulging out of the curved body, so it wraps round the body and is clipped
by its outline at any angle; the iris turns on the lens and the glints sit where the light
reflects. The drone's arms, pods, guard rings and rotor blades are placed in 3D, so its
heading, banking and spinning blades show in true perspective.

## 1. Lifecycle audit and integration seams

The Pocket lifecycle in `src/pocket/pocket.js`, with the calls that now drive the actors:

| Pocket step | Curl layers in use | Actor call |
|---|---|---|
| `initPocket` builds the album root and fixed layers | – | `createPocketActors(...)` (try/catch; Pocket works without it) |
| `buildPeek` makes the page-tip rig; `under: albumUnder` fills what it uncovers | plane (z 6): under, flat; lift (z 8): roll, flap; button z 9 | `albumUnder` also appends `actors.underStage()` |
| `pocketItem`: sticker peels and flies, `openPeek()` opens the corner | same, plus the flying sticker (z 7) | `actors.itemPocketed({ phi, landsIn })` right after `openPeek()` (`landsIn` = the 1900 ms flight); `actors.itemLanded()` when the sticker lands. The actors also mark the button `data-actor-hold` while the mascot holds it open, and put its mittens (an `aria-hidden` SVG) inside the button under the count badge |
| Restored pocket: `openPeek` 500 ms after load | same | none, so a restored pocket never gets a false greeting |
| `openPocket`: waits for flights, snapshots the page into the flat layer, mounts the album, turns the page (1150 ms) | the peek rig turns the whole sheet | `openRequested()` before waiting; `openStart({ phi })` once the album is mounted; `openProgress(t)` each frame; `openComplete()` after focus moves to `#pocket-title` |
| `closePocket`: a fresh rig turns the snapshot back | new rig, `setUnder(albumUnder)` on landing | `closeStart()` first; `closeComplete()` once the page is live again |
| (new) `destroy()` on the returned API | – | `actors.destroy()` |

Nothing in `curl.js` changed. The actors rely only on its public `under` contract ("what the
curl uncovers"). They never read the curl geometry. The only geometry they receive is `phi`,
the curl direction, which gives the side the curl comes from.

## 2. Occlusion and layering

```
Services page (page-tip peek)                    Album (page turn and after)
z 9   pocket button ⊃ the mascot's mittens         z 60  the cursor's dot and halo; z 59 ripples
        (under the count badge)  ← always usable   z 10  sticky site header
z 8   lift: roll + flipped paper  ← covers mascot  z 8   lift: turning roll/flap (during turns)
z 7   flying sticker                               z 6   plane: page snapshot (during turns)
z 6   plane: curl `under` window (clipped at       z 3   .pocket-actor-layer (drone, its shadows, heart trail)
        the rim) ⊃ album paper ⊃ MASCOT                  .pocket-actor-floor (mascot, sticky)
      live page (transparent flat part)            z 2   the cursor's pool of light (album area only)
                                                   auto  album content (cards, controls)
```

- In the page view, the mascot lives inside the curl's `under` box, so the rim clips it and the
  roll is drawn over it. It hides directly behind the button, wholly below a clip line at the
  button's middle, so nothing of it shows. For a save it rises straight up from there until its
  eye clears the rim (the button hides its legs), and its two mittens are drawn inside the
  button, over the rim and under the count badge, so it reads as holding the button. Afterwards
  it sinks straight back down behind the button.
- On `openStart` the same DOM node moves into the album floor, below the turning page. Only one
  instance is ever made. Neither actor is inside `.page-shell` while it is visible, so the
  curl's page snapshots never freeze an actor.
- The returning page covers both actors when the pocket closes, because the album sits under
  the fixed curl layers.

## 3. Storyboard and timeline

**Save** (every save; from the click; the sticker journey is unchanged at 1900 ms)

| ms | Sticker and button | Mascot |
|---|---|---|
| 0–1200 | sticker peels; corner opens | hidden behind the button |
| 1200–1515 | sticker lifts and is thrown | rises straight up from behind the button, a small pop past the rim as it settles, its eye on the item |
| 1620 | in flight | takes hold of the rim (its arms reach for two rim points) and pulls the pocket open: the button shows a dark mouth; it leans back on it, eye on the item |
| 1900 | lands (`itemLanded`); the button snaps shut and bumps; the count goes up | a squash, a nod, a grin (340 ms); it lets go |
| 2240–2620 | count shown | sinks straight back down behind the button (380 ms) |

Saves while it is out keep it holding on (an item landing during a catch gets its own catch).
Pressing the pocket button while it holds the button: it lets go at once (200 ms).

**Opening the pocket** (turn = 1150 ms; the turn stays in control). It starts behind where the
button was, in the bottom-right corner of the album, already visible as the turning page lifts
from that corner, turns to face its way and rides its hoverboard to the content's right
margin, under the drone (132 px at 1440 px wide, 0.98 s; 450 ms + 4 ms per px, 0.75 to 1.7 s,
starting 120 ms into the turn). On phones there is no drone and it rides to the same margin
(15 px from the edge). Content where it would stand: it stands a little lower, else it tucks
away (as before). Focus moves to `#pocket-title`
when the turn ends, whatever the mascot is doing.

**The board** (in the album, phones too):

- **Riding.** The board chases an eased path on the drone's flight model, so it lags behind the
  path, tips its leading end down as it speeds up and lifts it as it brakes (about 10°), passes
  its spot by 2 to 4 px and wobbles to rest. The rider faces the way it goes, half turned, its eye
  ahead; it leans with the board and into the ride (its lean lags and overshoots a little), its
  knees soak up small bumps, and its arms go out for balance, windmilling against the lean. 0.32 s
  after the path ends it raises the remote.
- **Hovering.** Around its spot, 22 model units up: it drifts up to 3 px inward (never outward),
  bobs ±4.5 units, sways ±8 units in depth, and rolls (±3.5°), pitches (±3.5°) and turns (±9°)
  slowly. A small bump of turbulence now and then makes the rider's knees work. The pads glow
  red, brighter when the board works hard, with a slow pulse; a faint red haze lights the floor.
- **The board.** A deck about as wide as the mascot's box, in Vodafone red with a darker front
  edge and the body's dark-red outline; its left end (the nose, which leads as it rides in)
  curves up. Two pads underneath glow pale with a red halo.
- **Higher.** On the board the body stands 23 to 24 px higher at 1440 px wide (about 13 px on
  phones). The board's shadow on the floor is longer than the body's and shrinks and fades with
  height.
- **Dozing.** While it yawns and sleeps the board settles on the floor (slowly, no bounce) and
  its glow dims. Any input lifts it again before the drone takes off.
- **Reduced motion.** It stands on the board, hovering still; no ride.

**The pilot** (in the album, wherever there is a drone):

- **Holding the remote.** It holds the remote out in front of its belly in both hands. The remote
  is about two thirds of the body's width, its face tipped toward the viewer so the sticks show.
  It is modelled in the body's frame, so it turns and leans with the body, and the hands are solved onto
  its grips every frame. It brings the remote up (0.42 s) once it has ridden in, and lowers it as
  it rides off.
- **Sticks.** The sticks show what it commands the drone this frame: turn and climb on one stick,
  across and depth on the other (Mode 2). The drone flies on the command from 100 ms earlier, so
  the thumbs move first.
- **Where it looks.** Its eye is on the drone whenever the drone is doing something (following,
  the heart, a hop, a dodge, a drag, flying home, landing, taking off, curious), and it leans back
  a little to watch it. With the drone just hovering, its eye is on the cursor.
- **Opening.** When the floor beside where it will stand is free (toward the content), the drone
  waits there with its rotors still while the page turns. The mascot rides in and raises the
  remote. The rotors spin up on the ground (0.38 s) and the drone climbs to its home. With no free
  spot, the drone hovers at home from the start.
- **A ripple.** When a ripple makes it flinch, its thumbs jerk and the drone lurches 0.1 s later.
- **Dragging.** Dragged away, the drone has its sticks pushed hard toward home (fighting the
  hand). After 0.65 s the mascot shakes the remote and peers at it.
- **Dozing.** Before it dozes it lands the drone on the floor 10 px beside it (`parking`, 1.5 s;
  left side first, then right; never on content, a floating button or past the window edge). The
  rotors stop and the remote sags in its hands while it sleeps. Waking, it flies the drone back
  up.
- **Off the ground.** Landing, parked or taking off, the drone lets clicks through
  (`pointer-events: none`). Landing and taking off may pass in front of content for about a
  second; the parked spot never covers anything.

**In the album**: it breathes, shifts its weight, sways and fidgets with a small step now and
then; its flame tip follows through every move. Its body faces the saved cards (at most 40°,
so the eye stays on show), or the card a pointer rests on for 350 ms (keyboard focus and taps
at once); a cursor far from the cards pulls it a little way round. Its eye follows the cursor
in saccades (it jumps and holds). It blinks every 3–6 s (sometimes twice). A click's ripple
reaching it makes it flinch (a small hop, eye wide). Without input for 60 s it dozes (it lands
the drone first, then a yawn, two drifts of Zs, slow breathing); any input wakes it with a small
settle and it flies the drone up again.

**Drone**: a small flight model. It hovers round its home, drifting on all six axes (±10 px
across, ±6 px up and down, ±14 in depth, ±14° of heading, banking and pitching as it moves),
never nearer than 24 px to "Empty pocket"; its rotors always spin. Across, its drift is centred
on the content's right margin (about 5 px in, 3 px out, and it moves in as it comes nearer and
draws bigger), so its right edge stays on the line the cards end on. A pointer on it makes it
curious (it turns to the pointer). A cursor moving slowly in the open space near it (not over
cards or controls) brings it over: it keeps 56 px between its edge and the cursor, in the band above the cards
or the right gutter, and flies home when the cursor goes onto content, speeds up, goes far, or
after 7 s. A ripple reaching it shoves it aside and it recovers. The first click, tap, Enter or
Space of a page load draws a heart of 96 px or less (only the heart is inked; it lingers 0.6 s
and fades over 0.4 s); later clicks get a hop with one turn. A mouse or pen drag (past 6 px)
follows it, banking; release, cancel, Escape or a resize springs it home.

**Its shadows.** It has two shadows.

- **On the page.** A soft shadow cast on the page behind it. It goes wherever the drone goes,
  however far, so it is never more than about 35 px from it. It falls away from the cursor's light
  and turns smoothly, without snapping, when the light comes on or the drone is dragged. The
  further the drone hovers out from the page (depth), the further, larger and softer the shadow.
- **On the floor.** A tighter contact shadow directly under it, shown only while it lands, stands
  or takes off. It is darkest on the ground and gone by 150 px up (`groundReach`); the page
  shadow fades in as the floor shadow fades out.
- **Bug fixed 7 Nov 2026.** The page shadow used to move only a quarter of the drone's vertical
  travel, so on long moves it was left behind: 165 px during a drag, 176 px flying home and
  281 px taking off or landing.

**The cursor** (Pocket page, mouse or trackpad; see `pocket-cursor.js`): an exact red dot in a
soft halo that trails it a little (a ring over controls); a wide, gentle pool of light that
follows with a short lag, the rest of the page a shade dimmer; cards near it lean toward it (5°
at most) and catch a sheen; a click sends a ring of light (900 ms, 260 px). The light also
lights the characters: their highlights turn toward it and their shadows fall away from it.

**Back to Services**: the mascot lowers the remote and rides off toward the corner (speeding up,
never braking) while the returning page covers it; the drone stays home. Both reset when the page has landed.

## 4. State model

One controller and one animation-frame loop own each actor. The mascot's loop runs the physics
each frame: in the album the board's flight (`gait.js` plans the ride, `drone-flight.js` flies
it) moves its box, otherwise travel does; springs (`physics.js`) turn its body
toward what it looks at and follow through with the flame tip; the eye saccades; breathing and
weight shifts are added; clips (`clips.js`) add scripted beats on top (they never set the
heading); arms can reach for points (`reachToward`). The drone's loop steps its flight model
(`drone-flight.js`) toward its state's target and draws its attitude and rotors.

**Mascot** (`src/pocket/actors/mascot-brain.js`). A lower priority number wins; a state only
interrupts states it outranks.

| Priority | States |
|---|---|
| 1 transition | `emerging`, `holding`, `catching`, `slipping`, `riding`, `leaving` |
| 2 constraint | `tucked` (content where it stands) |
| 3 reaction | `flinching`, `waking` |
| 4 idle | `parking` (landing the drone), `yawning`, `sleeping` |
| 5 rest | `hidden`, `idle` |

```
page:   hidden ─save→ (landing − 700 ms) emerging → holding ─landed→ catching → slipping → hidden
                          more saves: holding again after a catch; a landing mid-catch: another catch
                          openRequested: slipping (quick) → hidden
pocket: riding (to the margin)     → idle                  (reduced motion or nowhere to ride: idle at once)
        idle ⇄ flinching (ripple) ; idle → [parking →] yawning → sleeping ─input→ waking → idle
        parking ─input→ idle   (no drone, no free spot or the drone off screen: no parking)
        any ⇄ tucked (content)        close: leaving (rides off) → hidden
```

**Drone** (`src/pocket/actors/drone-brain.js`): `hidden → entering → home-hover` (hovering).
`home-hover ⇄ curious` (pointer on it); `home-hover → following → returning-home` (slow cursor
nearby; it goes home when the cursor leaves the open space, goes fast or far, or after 7 s).
From `home-hover`, `curious` or `following`: the first click of a page load → `drawing-heart →
returning-home`; later clicks → `evading` (the hop) → `home-hover`. A ripple: `dodging`, then
back to `following` or home. Most states go to `dragging` and then `returning-home`. Any state
goes to `closing` and then `hidden`. Dragging is impossible while entering or drawing the heart.
The pilot: `home-hover`, `curious`, `following` or `returning-home` → `landing → landed` (before
the mascot dozes); `landing|landed → taking-off → home-hover` (it wakes, or it has ridden in).
Opening with a free spot beside the mascot starts in `landed`. Nothing can be played with on the
ground.

Cancellation: timers live in the state machines (one per state) and in cleanup scopes
(`src/pocket/actors/scope.js`, built on `AbortController`). When one clip interrupts another,
each pose track blends from where the body is and untouched pose keys ease back to rest; the
springs carry every other value on from where it is, so nothing jumps. A pocket visit has its
own scope (including the cursor), and closing disposes it. `document.hidden` settles any
transient state at once and restarts the idle clock on return, so nothing stale replays.

QA hooks: `data-mascot-state`, `data-drone-state`, `data-drone-anchor`,
`#pocket-output[data-pocket-actor-ready]` (the album root; it was Vodafone's `body` before S12); on the mascot `data-body-yaw` (degrees), `data-look` (`cursor`,
`cards`, `drone`, `remote`, `ride`, `ripple` …), `data-remote` (`none`, `moving`, `held`),
`data-sticks` (across, depth, turn, climb, each -1 to 1), `data-board` (`none`, `riding`,
`hovering`, `down`) and `data-board-pose` (hover height, roll, pitch, heading, depth, glow); on its
iris `data-gaze` ("x,y" degrees); on the pocket button `data-actor-hold`; on the album
`data-cursor`. Tests can set `window.__POCKET_ACTORS_TEST__ = { seed, timing }` before load. It
is read once and gives deterministic randomness and thresholds. It is not a runtime API.

## 5. Layout and collision safety

- Sizes are fluid: mascot height `clamp(58px, 4vw + 42px, 100px)` in the album (62 px behind the
  button, 46 px on phones); drone width `clamp(52px, 4.2vw + 36px, 100px)`. The drone button is at
  least 44 px tall without enlarging the artwork.
- **Margins.** Both characters line up with the album's content: the visible right edge of the
  drone (its rotor guards) and of the mascot's body sit on the right edge of `.pocket-view__inner`,
  where the cards and "Empty pocket" end (1290 px at 1440 wide, 1210 at 1280, 1009 at 1024, 753
  at 768, 375 at 390). The edge is measured from the drawings, not their boxes: the drone's once
  at rest; the mascot's at each layout, in the pose it will stand in (turned toward the cards).
  The mascot's body lines up, not its hands: its arms swing out as it turns and gestures, up to
  about 10 px past the line, as a person's would.
- The drone picks the first clear home: the upper right on that margin (in the band between the
  bar and the cards), else the right gutter, then the left gutter; at least 24 px from "Empty
  pocket", including while it drifts (its drift is limited per side, allowing for the depth
  scaling). Otherwise it stays hidden. Under 640 px there is no drone, so the control bar stays
  clear.
- The mascot stands on the same margin at the bottom edge, under the drone; its body and its
  board both keep inside the line (measured, both end 2 to 3.5 px inside it). On the board it stands higher than its box, and that lift is
  counted in every check below. If content reaches
  where it stands it sits a little lower when that is enough (at most 40% of its height, eye
  always visible); otherwise it tucks away, watched by an IntersectionObserver, and comes back
  when the spot clears. The floor is sticky at the viewport
  bottom and stops above the footer. Safe-area insets are respected.
- Following the cursor, the drone stays in the open band above the cards or the right gutter,
  never over content (each target is checked against the controls, title, lead and first row).
  Every point of the heart flight is checked the same way; the heart shrinks to fit (64–96 px),
  or a click just hops.
- The mascot never crosses card content: its ride is along the bottom edge in free space.
- Floating buttons: Vodafone's accessibility button and the Voice Guide's microphone are lifted
  out of the bottom-right corner while the pocket button shows and, now that the mascot stands
  bottom-right in the album, while the pocket is open too (`pocket.css`).
- Layout is measured when it changes (ResizeObserver, resize, scroll, state changes), not per
  frame: the mascot's box, the cards' boxes for the light, the album's top. Per frame the actors
  read only the flying sticker during a save and the pocket button's box while holding it.

## 6. Accessibility and inclusive motion

- The mascot, its mittens, the trail, the drone's shadow, the floor and the cursor's elements are
  `aria-hidden`. Nothing is announced and the live region is untouched.
- The drone is a real button, "Play with the Pocket drone", last in the album's tab order.
  Enter or Space plays with it. Escape brings it home if it is away; at home, Escape still
  closes the pocket as before.
- The custom cursor keeps an exact dot at the pointer, so precision is unchanged. The native
  cursor is hidden only while the script has the custom one running (`#pocket-output[data-cursor]`);
  if it fails or stops, the arrow is back. Text fields keep the caret.
- Reduced motion: no save beat, ride, flinch, heart, drag, eye movement, breathing or idle. The
  mascot appears straight away in its place, drawn still on its board; the drone rests at home, still and inert
  (decorative); the cursor stays the normal cursor, with no light, lean or ripple.
- Touch or coarse pointers get no cursor features, no hover logic and no drag (page scrolling is
  untouched). A tap on a card turns the mascot toward it; a tap on the drone plays (the first
  time, a heart). The characters still live (breathing, the drone's hover).
- No flashing, no camera, no sound.

## 7. Performance

- Each actor has one `requestAnimationFrame` loop that runs its physics, poses, projects and
  rewrites its SVG attributes. No DOM is created per frame, and paint order changes only when a
  limb or rotor actually crosses the body. The loops run while the characters are visible: the
  mascot draws every other frame when only breathing and the pointer is still; both stop when
  hidden, off screen, in a background tab or with reduced motion.
- The cursor's loop runs only while the light is still catching up with the pointer; cards are
  leaned once per frame, only those near the light, from boxes measured when the layout changes.
- Measured in headless Chromium at 1440 x 900 on the album with four cards (all loops, plus the
  cursor): about 60 fps; script per frame p50 1.2 ms, p95 3 to 3.5 ms with the pointer moving,
  p95 2 to 3 ms with it at rest. Not measured on real phones.
- With the hoverboard (ADR-0004), three cards, same machine, against the version just before it:
  58 and 60 fps (was 57 and 60); script per frame p50 1.6 ms (was 1.5 to 1.6), p95 4.1 ms moving
  and 3.4 ms at rest (was 4.4 and 3.7). The bigger red board with its upturned nose, against that
  first (charcoal) board on a slower machine: 49 to 51 fps with the pointer moving (was 50 to 54),
  60 at rest; script per frame p50 1.9 to 2.3 ms (was 1.8 to 2.0). The board adds eight SVG
  elements, three of them blurred; paint cost on real GPUs and phones is not measured.
- Assets load once, at start-up, from the same origin (`fetch` of two small SVG decal sheets).
  If they fail, the actors stay off.
- There are no new dependencies.

## 8. Assets

- **Models** (code): `src/pocket/actors/mascot-model.js` and `drone-model.js`.
  - The mascot body is a generalised cylinder: a spherical bulb whose spine rises and curls into
    the flame tip, its sections tapering to a point. The eye is a lens on the body (rim on the
    surface, iris and pupil discs, glints, a lid shell, a brow, a closed-eye arch). Arms and legs
    are tapered capsules from surface anchors, feet are ellipsoids; a soft shadow and a contact
    shadow sit on the ground. It is lit by a key light that can move, with a faint rim light on
    the shadowed side.
  - The drone has an ellipsoid hull and camera bucket, capsule arms, sphere pods, open guard
    rings and bladed rotors; its highlight follows the light.
  - The remote (`REMOTE` in `mascot-model.js`) is a rounded slab with two gimballed sticks, a red
    light and an antenna. It is drawn in charcoal with a lighter face, light-grey rings round the
    sticks and Vodafone-red stick tips and antenna tip, held in the body's frame, with mitten
    thumbs on the sticks.
  - Arms are 25 model units long and legs 16 (21 and 13 before the remote grew, ADR-0004).
  - The hoverboard (`BOARD` in `mascot-model.js`): a deck in Vodafone red, lofted from
    cross-sections so its nose curves up at the left end, outlined in the body's ink, with two
    glowing hover pads and a red haze on the floor. It has its own height and attitude; the rider
    is lifted onto its deck.
- **Motion** (code): `physics.js` (springs, wandering noise), `gait.js` (the ride's path and the
  shuffle), `drone-flight.js` (the flight model, `FLIGHT` for the drone and `BOARD_FLIGHT` for the
  board), `clips.js` (scripted beats).
- **Decal sheets** (`src/pocket/actors/assets/mascot.svg`, `drone.svg`): the flat artwork mapped
  onto the models.
  - Mascot: mouth shapes, a cheek, the mitten hand, the apple (unused) and the head effects.
  - Drone: the white hull details (the lift lines are no longer shown).
- **Manifest** (`manifest.json`): model parts, decal parts, the pose keys, expressions, clips,
  what is procedural, and the illustrator requests.
- Expressions are set by attributes on the host (`data-mouth`, `data-eye`, `data-brow`,
  `data-blush`, `data-sweat`, `data-marks`, `data-zzz`); the eye ones drive the modelled eye.

**Asset limits.** The references are a flat six-pose sheet and a 13-frame GIF; neither has
layers or other views. The 3D models are built from them by eye, the decals are hand-traced,
and both should be treated as temporary production assets. What an illustrator should supply is
listed in `manifest.json → illustratorRequests`.

## 9. Tests

- `tests/pocket-actors.test.mjs` (`npm test`), covering:
  - mascot states: every save gets the catch, timed to the landing; holding on for saves that
    follow and for a landing mid-catch; letting go when the button is pressed or the landing never
    comes; the ride on opening (and none when already there, covered or reduced); riding off on
    close; the doze at 60 s and waking; cards turning the body only while idle; the ripple's
    flinch; tucking; priorities; reduced motion; hidden-document handling; teardown
  - drone states: hovering on open, the heart on the first click only, hops after that, curious,
    following and going home (told, bored, Escape, relayout), dodging a ripple, drag, cancel,
    Escape, relayout and reduced motion
  - physics: springs (no overshoot when critical, wobble when not, stable at any frame rate, the
    short way round), wandering noise; the ride on the board's flight model (it lags its path,
    banks into the ride, flares as it brakes, overshoots a little and is at rest when the remote
    comes up; leaving never brakes; never longer than the cap); the flight model (settles, banks into a move and levels out,
    limited thrust, a shove and recovery, scripted paths still bank, heading the short way)
  - the 3D kit and the models: a closed, finite silhouette at every angle; the eye turning and
    hiding with the body, wrapping round it (narrower from the side), the iris looking where it is
    told within the eye, glints that stay with the light, the light moving highlights and the
    shadow, the lid, the closed eye and the brow; arms reaching a point; limbs swapping depth; a
    drone that banks with ordered rotor units
  - the pilot: landing before the doze (and dozing straight away with nothing to land), input
    during the landing, opening parked, takeoff, nothing to play with on the ground, reduced motion
    never landing; the hands on the remote's grips in any pose; the sticks' mapping and soft
    saturation; rotors spinning down on the ground
  - the pose animator, heart planning, the heart-only line and its pen pacing, the cleanup scope,
    the asset interface, the clips (no clip sets the heading or moves the box) and the size budget
- `tests/e2e/pocket_e2e.py`: the original Pocket checks plus actor checks: occlusion behind the
  button, the save sequence and its timing against the landing, the button held open while the
  item flies and closing on the catch with the count, the mittens, the button staying on top,
  rapid saves, letting go when the button is pressed, rising and sinking straight up and down
  behind the button (hidden wholly below its middle), the ride while the page turns (from the
  corner, feet on the deck every frame, banking with its arms out, the remote up only once it
  has stopped), the hover on all six axes (near its height, inside the margin), the board set
  down while it dozes and lifted before the drone takes off, riding off on Back, both on the
  content's right margin (the drone upper right, not in the gutter), nothing covered, 24 px from
  "Empty pocket"
  while hovering, the pilot (parked at opening and taking off only after the remote is up, both
  hands on the remote, the eye on the cursor while the drone hovers and on the drone while it
  follows, the sticks leading the drone by 60 to 200 ms, fighting a drag and shaking the remote,
  landing beside it on the floor with its rotors stopped and nothing covered, taking off on waking,
  the remote at every desktop width, none on phones, held still with reduced motion), both alive, the body toward the cards and the eye on the cursor (left, right,
  up), a rested-on card turning the body, the cursor (the light, the exact dot, the ring over
  controls, cards leaning, the normal cursor outside the album), ripples (the flinch, the dodge),
  the drone following a slow cursor and going home, curious, the heart on the first Enter and hops
  after, drag, cancel, Escape, resize, nothing while reading, the doze and waking, riding off on
  close, the cursor gone with the album, reopening, restored pocket, reduced motion (still, normal
  cursor), the header and footer, and a responsive sweep at 1440, 1280, 1024, 768, 390 and 320
  wide and 200% zoom (no content crossed during the ride, both on the content's margin at every
  width, no drone on phones, the board on phones covering nothing).
  `POCKET_SHOTS=dir` saves the comparison screenshots.

## 10. On Vodafone's own pages (live plan phase 3, S12; voice-guide ADR-0052 part 3 and ADR-0064)

The same actors run on Vodafone's real pages, with the Pocket button at the page's **bottom-left**. They are told so by options of `createPocketActors`, whose defaults are the clone's (so the clone behaves exactly as before):

| Option | Clone (default) | Live (`host/demos/pocket.js`, `host/demos/actors.js`) |
|---|---|---|
| `corner` | `'right'`: the pocket button is at the bottom-right | `'left'`: bottom-left in both languages |
| `side` | `'right'`: the album's physical-right content margin | `'left'` when the album is right to left (Arabic), through the seam `actorSide: 'inline-end'`; `'right'` in English |
| `floor` | `'sticky'` | `'fixed'`, bounded above the footer (Vodafone's `html` and `body` are `overflow: hidden auto`, where sticky does not stick) |
| `obstacles` | `null` | `fixedObstacles()` (`src/pocket/obstacles.js`) |
| `wrap`, `mark`, `report`, `checkpoint` | identity, identity, none, none | the Pocket's actor wrapper, the layer's mark (`data-aixc` and `data-vg` on every node), `seams.report`, the layer's checkpoints |

- **With the corner at the left** the mascot still hides and rises behind the button (the peek follows the button's box; only his emerging turn and look are mirrored). On the page turn he rides his board from the button across the screen to his place and stands; on closing he dashes back and sinks behind the button. With `side` and `corner` both left and his place within 60 px of the button he rises there with no ride. His place and the drone's are the album's inline-end margin: right in English, left in Arabic (the drone's upper home under "Empty pocket", the mascot at the foot of the screen). The art is never flipped; the board rests turned so its nose points at the content.
- **Padding.** With `obstacles` he keeps 16 px between his drawn box and each fixed control (Vodafone's accessibility button, the Voice Guide's microphone, keyboard button and bar, the trail's pill and card, the cookie banner, the Pocket button), moving inward only as far as needed (`insetForObstacles`); the drone's follow regions stop above them (`stopAbove`). They never move or cover anything of Vodafone's.
- **Failure.** `wrap` runs every listener, timer, frame and observer callback; an error drops only the actors (nodes removed, `report` called) and the Pocket carries on. `checkpoint('actors-frame')` is reached inside the mascot's frame so a test can force it.
- **Hygiene.** Every node the actors add goes through `mark`; one instance at a time; the ready attribute is on `#pocket-output`, never on `body`.
- **Assets.** On live the two rigs are `data:` URLs made by the aixc build's `svg-inline` plugin and decoded locally; the clone still fetches its SVG files.

