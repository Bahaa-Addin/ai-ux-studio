# Pocket actors: the mascot and the drone

A character layer on top of Pocket. A Vodafone-red mascot lives under the page curl, and a
small red drone draws a heart over the pocket album. They are decoration. They never hold up a
save, an open or a close, never block a control, never take focus, and make no sound.

Both actors are **3D models drawn as SVG**. Every frame, a small 3D kit (`space.js`) poses the
model, projects it with perspective and rewrites the SVG paths. That gives real turns, leans,
banking and twirls while keeping crisp, outlined vector art. The mascot's outline is solved
from its pose: a flame-shaped body whose curled tip swings round as it turns. Its face is flat
artwork mapped onto the body's surface, so it slides round the body and disappears behind it.
The drone's arms, pods, guard rings and rotor blades are placed in 3D, so its heading, banking
and spinning blades show in true perspective.

## 1. Lifecycle audit and integration seams

The Pocket lifecycle in `src/pocket/pocket.js`, with the calls that now drive the actors:

| Pocket step | Curl layers in use | Actor call |
|---|---|---|
| `initPocket` builds the album root and fixed layers | – | `createPocketActors(...)` (try/catch; Pocket works without it) |
| `buildPeek` makes the page-tip rig; `under: albumUnder` fills what it uncovers | plane (z 6): under, flat; lift (z 8): roll, flap; button z 9 | `albumUnder` also appends `actors.underStage()` |
| `pocketItem`: sticker peels and flies, `openPeek()` opens the corner | same, plus the flying sticker (z 7) | `actors.itemPocketed({ phi })` right after `openPeek()` |
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
z 9   pocket button  ← on top, always usable      z 10  sticky site header
z 8   lift: roll + flipped paper  ← covers mascot  z 8   lift: turning roll/flap (during turns)
z 7   flying sticker                               z 6   plane: page snapshot (during turns)
z 6   plane: curl `under` window (clipped at       z 3   .pocket-actor-layer (drone, heart trail)
        the rim) ⊃ album paper ⊃ MASCOT                  .pocket-actor-floor (mascot, sticky)
      live page (transparent flat part)            auto  album content (cards, controls)
```

- In the page view, the mascot lives inside the curl's `under` box, so the rim clips it and the
  roll is drawn over it. When it ducks it moves back along the curl direction, under the paper.
  A clip line at the button's middle hides its feet behind the button.
- On `openStart` the same DOM node moves into the album floor, below the turning page. Only one
  instance is ever made. Neither actor is inside `.page-shell` while it is visible, so the
  curl's page snapshots never freeze an actor.
- The returning page covers both actors when the pocket closes, because the album sits under
  the fixed curl layers.

## 3. Storyboard and timeline

**Save greeting** (from the click; the sticker journey is unchanged at 1900 ms)

| ms | Corner | Mascot |
|---|---|---|
| 0–220 | corner starts opening | hidden under the paper |
| 220–500 | corner mostly open | slides out from under the curl, still half turned toward it (yaw −40°), squash then stretch, and turns to face you |
| 500–1150 | – | two compact waves, the arm sweeping in depth, body swaying and the tip following through; grin and blush |
| 1150–1350 | – | holds and looks at the pointer |
| 1350–1700 | – | turns back toward the curl and dives under the paper ("o" mouth) |
| 1900 | sticker lands, corner bumps | already gone |

Saves in quick succession join the running greeting. A save while it ducks makes it pop back up.
Pressing the pocket button mid-wave ducks it in 180 ms.

**Caught by the page turn** (turn = 1150 ms; the turn stays in control)

| Turn | Mascot |
|---|---|
| 0–60% | hidden below the album floor at the curl's corner |
| 60% | pops up facing you, startled: wide eye, small pupil, marks, sweat, recoil, winds up (220 ms) |
| ~80%–end, then a little after | turns three-quarter toward the far corner and sprints: leaning in, three steps with legs and arms swinging in depth, the tip streaming behind (620 ms) |
| after | skids past leaning back, steps back, swings round to face you, looks left and right, scratches its head (780 ms) |
| then | lives in the corner |

Focus moves to `#pocket-title` when the turn ends, whatever the mascot is doing. The opposite
corner comes from `phi` (`curlSide`), so a mirrored or RTL curl sends it the other way.

**In the album**: the eye follows the pointer and the whole body turns a little toward it. Every
6–10 s it glances round, turning its body left and right. A card hover makes it jump with a
twirl that ends facing you at the top (keyboard focus or touch gets a squash and a happy
wiggle instead). Then the idle ladder: impatient at 2 s (arms folded in front, half turned away
with a "hmph", four foot taps), an apple at 8–12 s (held up to its mouth, three bites, core
tossed), then a yawn and sleep at 18–28 s (slumped and tilted, slow breathing, Zs). Any input
wakes it with a shake and restarts the ladder.

**Drone**: it waits at its home anchor while the page turns, hovering with a slow look round.
On reveal it loops out and draws a dashed heart (about 1.55 s). Its nose turns into the
direction of travel, it banks into each curve, tips into climbs and dives, and the rotors speed
up. Then it returns home. The heart lingers for 1.4 s, then fades. Hovering makes it hop
14–20 px away with a pirouette and spring back, once per entry. A click, tap, Enter or Space
does the same. A mouse or pen drag (past 6 px) follows with lag, turning and banking with the
motion, clamped to the viewport. Release, cancel, Escape or a resize springs it home.

**Back to Services**: the mascot ducks below the floor (260 ms) and the drone stands down. Both
reset when the page has landed.

## 4. State model

One controller and one animation-frame loop own each actor. The mascot's HTML mover handles
travel across the floor (Web Animations). Its 3D pose (yaw, pitch, roll, squash, the tip's
follow-through, arms, legs, foot) is played by the pose animator (`clips.js`) and drawn by its
loop, which also drives the pupil. The drone's button offset (flight) and 3D attitude (heading,
pitch, bank, rotor angle) are driven by its loop. CSS keyframes only run the drone's gentle
hover bob.

**Mascot** (`src/pocket/actors/mascot-brain.js`). A lower priority number wins; a state only
interrupts states it outranks.

| Priority | States |
|---|---|
| 1 transition | `peeking`, `waving`, `retreating`, `page-reveal-hidden`, `startled`, `running`, `recovering`, `closing` |
| 2 constraint | `tucked` (content under its corner) |
| 3 reaction | `jumping`, `beaming`, `waking` |
| 4 idle | `impatient`, `eating`, `yawning`, `sleeping` |
| 5 ambient | `glancing` (pointer tracking runs inside `corner-idle`) |
| 6 rest | `hidden`, `corner-idle` |

```
page:   hidden ─greet→ (220 ms) peeking → waving → retreating → hidden
                         └─ openRequested: retreating (quick) → hidden
pocket: page-reveal-hidden ─60%→ startled → running → recovering → corner-idle
        corner-idle ⇄ glancing | jumping | beaming | impatient → eating → yawning → sleeping
        sleeping ─input→ waking → corner-idle        any ⇄ tucked (content)        any ─close→ closing → hidden
```

**Drone** (`src/pocket/actors/drone-brain.js`): `hidden → entering → drawing-heart →
returning-home → home-hover`. `home-hover` goes to `evading` and back. `home-hover`,
`evading` and `returning-home` go to `dragging` and then `returning-home`. Any state goes to
`closing` and then `hidden`. Dragging is impossible while entering or drawing the heart.

Cancellation: timers live in the state machines (one per state) and in cleanup scopes
(`src/pocket/actors/scope.js`, built on `AbortController`). When one clip interrupts another,
each pose track blends from where the body is, untouched pose keys ease back to rest, and
travel continues from its current position, so nothing jumps. A pocket visit has
its own scope, and closing disposes it. `document.hidden` settles any transient state at once
and restarts the ladder on return, so nothing stale replays.

QA hooks: `data-mascot-state`, `data-drone-state`, `data-drone-anchor` and
`body[data-pocket-actor-ready]`. Tests can set `window.__POCKET_ACTORS_TEST__ = { seed, timing }`
before load. It is read once and gives deterministic randomness and thresholds. It is not a
runtime API.

## 5. Layout and collision safety

- Sizes are fluid: mascot height `clamp(58px, 4vw + 42px, 100px)` (about 99 px at 1440, 58 px at
  390); drone width `clamp(52px, 4.2vw + 36px, 100px)`. The drone button is at least 44 px tall
  without enlarging the artwork.
- The mascot sits in the bottom-left gutter when the gutter is wide enough, otherwise 12–28 px
  in. If content reaches into its corner, it sits a little lower when that is enough (at most
  40% of its height, eye always visible). Otherwise it tucks away, watched by an
  IntersectionObserver over the corner, and comes back when the corner clears. The floor is
  sticky at the viewport bottom and stops above the footer. Safe-area insets are respected.
- The drone picks the first clear anchor: upper right (the head row, across from the title),
  then the gap in the top bar, then the right or left gutter. Otherwise it stays hidden. Every
  point of the heart flight is checked so the drone's footprint stays clear of the controls,
  title, lead and first row of cards. The heart shrinks to fit, or is skipped (as in the
  top-bar gap on phones).
- Measurement uses a ResizeObserver, resize and scroll, coalesced to one frame. Nothing reads
  layout per animation frame, apart from re-measuring the eye centre after a scroll.

## 6. Accessibility and inclusive motion

- The mascot, trail and floor are `aria-hidden`. Nothing is announced and the live region is
  untouched.
- The drone is a real button, "Play with the Pocket drone", last in the album's tab order.
  Enter or Space plays with it. Escape brings it home if it is away; at home, Escape still
  closes the pocket as before.
- Reduced motion: no greeting, sprint, jump, heart, drag, tracking or idle ladder. The mascot
  appears straight away in its calm corner pose. The drone rests at home with its rotors still
  and is inert (decorative).
- Touch or coarse pointers get no hover logic, no eye tracking and no drag (page scrolling is
  untouched). A tap on a card gives the smile reaction; a tap on the drone makes it hop.
- No flashing, no camera, no sound. "Looking at the user" means the eye centres and glances.

## 7. Performance

- Each actor has one `requestAnimationFrame` loop that poses, projects and rewrites its SVG
  attributes. No DOM is created per frame, and paint order changes only when a limb or rotor
  actually crosses the body. Measured in Chromium: about 0.2 ms of script per mascot frame and
  0.16 ms per drone frame, holding 60 fps.
- The loops stop when nothing moves. A breathing or hovering idle draws every other frame. The
  drone loop pauses while the drone is off screen, hidden or in a background tab.
- Pointer input only stores coordinates. Activity is throttled to 120 ms. Layout is read only
  when the layout changes (and for the eye centre after a scroll), never per frame.
- No DOM cloning, no `will-change`, no actor snapshots.
- Assets load once, at start-up, from the same origin (`fetch` of two small SVG decal sheets).
  If they fail, the actors stay off.
- Size added to the production build: JS +58 KB (+21.8 KB gzip), CSS +5 KB (+1 KB gzip),
  decal sheets about 9 KB (+2.5 KB gzip), about 25 KB gzip in total. There are no new
  dependencies.

## 8. Assets

- **Models** (code): `src/pocket/actors/mascot-model.js` and `drone-model.js`.
  - The mascot body is a generalised cylinder: a spherical bulb whose spine rises and curls into
    the flame tip, its sections tapering to a point. Arms and legs are tapered capsules from
    surface anchors, feet are ellipsoids, and the shadow is a ground disc.
  - The drone has an ellipsoid hull and camera bucket, capsule arms, sphere pods, open guard
    rings and bladed rotors.
- **Decal sheets** (`src/pocket/actors/assets/mascot.svg`, `drone.svg`): the flat artwork mapped
  onto the models.
  - Mascot: the eye (sclera, iris, lid, brow, closed eye), mouth shapes, a cheek, the mitten
    hand, the apple and the head effects.
  - Drone: the white hull details and the hover lift lines.
- **Manifest** (`manifest.json`): model parts, decal parts, the pose keys, expressions, clips and
  the illustrator requests.
- Expressions are swapped by attributes on the host (`data-mouth`, `data-eye`, `data-brow`,
  `data-apple`, `data-blush`, `data-sweat`, `data-marks`, `data-zzz`).

**Asset limits.** The references are a flat six-pose sheet and a 13-frame GIF; neither has
layers or other views. The 3D models are built from them by eye, the decals are hand-traced,
and both should be treated as temporary production assets. No Rive or Lottie source was
available. What an illustrator should supply is listed in `manifest.json → illustratorRequests`:
- a model sheet (front, three-quarter, side, back, top) to match the body exactly
- the spur on the upper-left of the flame, which the procedural body does not reproduce yet
- three-quarter mouth and eye drawings
- hands
- more drone angles
- a vector brush for the heart
- ideally a Rive file per actor exposing the same pose inputs

## 9. Tests

- `tests/pocket-actors.test.mjs` (`npm test`), covering:
  - mascot states: greeting timeline and coalescing, interruption, the caught sequence,
    priorities, idle thresholds and resets, waking, card debounce, deterministic glances,
    reduced motion, hidden-document handling
  - drone states: heart, drag, cancel, Escape and relayout
  - the 3D kit: rigid rotations, perspective, ellipsoid and disc projection
  - the models: a closed, finite silhouette at every angle, the tip in the right place, the face
    turning and hiding, limbs swapping depth, a drone that banks with ordered rotor units
  - the pose animator: timing, blending, settling, yaw folding and loops
  - gaze, the opposite corner, heart planning, the cleanup scope, the asset interface and the
    size budget
- `tests/e2e/pocket_e2e.py`: the original 40 Pocket checks plus actor checks. These cover
  occlusion, the greeting, coalescing, mid-wave interruption, one instance, the opposite
  corner, card jump and keyboard reaction, pupil travel, the idle ladder, waking, the drone
  heart, hover, drag, cancel, Escape, resize, close and reopen, restored pocket, reduced motion,
  the header and footer, and a responsive sweep at 1440, 1280, 1024, 768, 390 and 320 wide and
  200% zoom. `POCKET_SHOTS=dir` saves the comparison screenshots.
