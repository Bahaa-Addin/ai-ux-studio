# ADR-0005: Leaving the Pocket through a portal of light

- Status: proposed (implemented on `feature/pocket-portal`, not merged)
- Date: 2026-11-07 (revised five times the same day: smoother motion and rendering with a
  glowing hall; a dreamlike misty void from a reference image; the mist glowing; the viewer
  walking to the destination instead of it coming to them; one overlapping choreography and a
  quieter red frame; and on 2026-11-08 the viewer pushing the wall over and easing into the page,
  then a launch-like move with the destination coming toward the viewer too, a glowing white
  space with no mist, and a thin, soft red line traced round the page; then the viewer plainly
  moving in on the page while pushing it over; then all of it in half the time, the wall pushed
  over at once; then about 3.3 s again, with a slow ease in and a long, soft ease out; see the
  "Revision" sections)
- Numbering: follows ADR-0001 to ADR-0004 (Pocket actors, on `feature/pocket-actors-live`). If
  that branch lands later, the numbers still line up; this ADR does not depend on it.
- Scope: `src/pocket/portal/` (new: `portal.js`, `config.js`, `interceptor.js`, `controller.js`,
  `wall.js`, `environment.js`, `gate.js`, `handoff.js`, `history.js`, `motion.js`,
  `portal.css`), `src/pocket/pocket.js` (wiring, same-tab sticker links, an instant open),
  `src/i18n.js` (one string), `tests/pocket-portal.test.mjs`, `tests/e2e/portal_e2e.py`, one
  check in `tests/e2e/pocket_e2e.py`.

## Context

The product owner asked for "an extraordinary, cinematic page-transition experience for the
Vodafone Pocket page": the whole page falls backwards like a wall, revealing a dreamlike passage
of white light; the real destination page, in a Vodafone-red frame of light, travels toward the
viewer until it fills the screen (the brief: "with the camera stationary"); then the real page
takes over without a visible seam. Later the same day the owner reversed the camera: "make the
user perspective the one coming closer to the iframe instead, as if the user is walking through
the wall after the wall falls off" (Revision 4). It must
stay in Vodafone's design language (white world, red the only accent, no neon, no HUD), be a
reusable system rather than loose effects, and never break navigation (new tabs, modified
clicks, downloads, Back, keyboard, reduced motion).

What the code and the site said before deciding:

- **The Pocket page** is the album view of the Services clone (`src/pocket/pocket.js`), opened by
  the page turn. Its only links that leave it are the stickers' CTAs, and those, like every link
  in the protected header and footer, **opened in a new tab** (`target="_blank"`).
- **Vodafone forbids framing from other sites.** `web.vodafone.com.eg` answers with
  `X-Frame-Options: SAMEORIGIN` and `Content-Security-Policy: frame-ancestors 'self'
  https://eshop.vodafone.com.eg …` (checked 2026-11-07 on `/en/vodafone-cash`).
- **The demo is same-origin.** `npm run demo:trail` (voice-guide `tools/demo-browser.ts`) serves
  this clone at `https://web.vodafone.com.eg/en/services` beside the saved Vodafone pages, so a
  sticker's destination is on the same origin and can be rendered for real. Production (the
  Pocket on Vodafone's own site) would be the same. The standalone server (`127.0.0.1`) is not.
- **Saved pages run no scripts** in the demo; live Vodafone pages call `localStorage.clear()` on
  load (voice-guide T-806) and send analytics.

## Decision

**A click on a sticker link opens a portal: light seeps in at the page's edges and the viewer
moves in on the page, faster and faster, pushing it over as they close in; it falls back as one
slab into a glowing white space and the viewer goes through where it stood, toward the real
destination, which comes toward them too, while two lights trace a thin red line round it; then a
long, soft ease-out into the page, and the real navigation happens under its last frame.** Sticker links now leave in this tab (that is the only way to travel
"through" to the page); Ctrl/⌘/Shift/middle click still opens a tab natively, and `?portal=off`
restores the old new-tab links.

### Architecture (one responsibility per module)

| Module | Role |
|---|---|
| `portal.js` | Always loaded (with `history.js`, `config.js`, `interceptor.js`: about 3 KB gzipped). Wires to the Pocket, loads the scene when the Pocket opens, paints the hall while the person reads, handles Back and the back/forward cache. |
| `interceptor.js` | NavigationInterceptor: which clicks become a transition (`whyNotEligible` returns the reason for every one it leaves alone). |
| `controller.js` | PortalTransitionController: one transition, one `requestAnimationFrame` clock, one state (`idle → preparing → wall-falling → portal-revealing → destination-approaching → handoff → completed`, or `error`), emitted as `vf-portal:state` events; the move (where the viewer and the destination are) and the pushed fall. Lazy (14.6 KB gzipped with the scene). |
| `wall.js` | PocketWall3D: the page as one slab. |
| `environment.js` | PortalEnvironment: the world (the glowing white space; or the misty void, or the hall of light). |
| `gate.js` | DestinationPortalFrame: the page, and the thin red line two lights trace round it. |
| `handoff.js`, `history.js` | NavigationHandoff: what is shown in the portal and when it is ready; the real navigation; Back. |
| `motion.js` | Pure geometry and curves: the projection, the falls (let go, or pushed by the viewer), the two motions of the move (`splitApproach`), the steps (unit-tested). |
| `portal.css` | All styles, `.vf-portal-` prefixed, loaded lazily (3.4 KB gzipped). |

### One space, and a viewer who walks

Everything lives in one CSS perspective (`P` = 1.15 × the longer viewport side, at least
900 px) with its origin at the viewport centre. The hall is drawn into a canvas with the same
projection the browser uses for the CSS layers, so what is drawn, the falling wall and the
portal agree to the pixel.

**The viewer goes, and the destination comes (`camera.mode: 'walk'`, the default).** From the
click the viewer moves in on the page: it grows on screen as they close in, they push it over (see
"The wall"), and they go on through the opening where it stood and over the fallen page, while
the destination comes toward them too. The move is two motions on one clock
(`splitApproach` in `motion.js`):

- **The viewer's own move**, planned in distance: `camera.travel` (2.2 perspectives, the same on
  every screen) with the speed curve x^p (1 − x)^q (`camera.ease`, [1.15, 3]): from rest at the
  click, building smoothly (a slow ease in), fastest about a second in, after the wall, then
  slowing. Planned in distance, it shows from the start on what is near: the page in front of
  them is 3% bigger on screen by 0.16 s, 12% by 0.3 s, 30% by 0.45 s and 65% by 0.6 s, while it
  tips away (it scales as P / (P − distance), so the page comes at them faster and faster).
- **The destination's own approach**, the rest of the way (`portal.ease`, [2.5, 7], in distance):
  it sets off after the viewer and has a long, very soft ease out into the page.

For the destination itself only the distance between it and the viewer counts; its on-screen
growth is the sum of both (`planApproach` follows it, so the readiness hover and the exact last
frame are shared, and how far each has come is read back from how big it looks, so a hover holds
both still). What tells the two motions apart is everything else: the wall and the fallen page
pass at the viewer's speed, the light stays deep in the space where the destination started
(only the viewer's move brings it closer, so the destination comes forward out of it), and the
destination rises a little off the floor while it travels and lands on the viewport as it
arrives (`portal.hover`, 2.5% of the height at most; its reflection in the floor drops away from
it). Steps are off (`camera.bob: 0`): a smooth, cinematic glide; 0.0045 brings back a walk's rise
and fall.

Together, the speed at which the destination seems to come closer (its growth in log scale, what
the eye reads as speed of approach) rises to half its peak by 0.6 s, peaks at 1.4 s and is back
to half by 2.2 s: about as long easing in as easing out. On screen it grows fastest at about
1.8 s (13 px a frame at 1440 wide), then slows for nearly 1.5 s: under 2 px a frame from 2.8 s
and under 1 px from 3.0 s, so it settles into the screen rather than rushing at the eye. The last
sub-pixel of the ease-out is not drawn: once less than 0.6 px is left to cover at the screen's
edges it counts as arrived (those steps only made the text shimmer as it was resampled), about
3.25 s after the click (`timing.arrive`, 3500, is when the plan itself ends); the real navigation
follows two frames later, about 3.3 s after the click.

There is no single camera transform: the scene's layers are not one 3D rendering context (some
are drawn in screen space, and one `preserve-3d` world would depth-sort them against the 3D
layers), so each layer is given the viewer's position explicitly (the wall and its shadow by the
distance walked and the step; the portal, its reflection and red light by the step, scaled by
how far away they are; the mist by most of the step; the backdrop, being at infinity, by
nothing). With `camera.mode: 'still'` (or `?portal-camera=still`) the viewer stays where they
are and the destination comes to them, as in the first versions.

### The wall

- **One plane.** In the click handler the visible page is copied (the same technique as the page
  turn's sheet): the page's flowing content cloned into a box scrolled to the same place, plus
  clones of its floating layers (the mascot and drone come along, frozen). The live page is never
  moved or restyled and its components are never animated separately.
- **The first frame is the page.** A clone is not hovered, so the element under the pointer (the
  sticker being clicked, its link's underline, its lifted shadow) would snap back. Its `:hover`
  and `:focus-visible` look is copied onto the clone (`freezeState`). On classic scrollbars the
  page's scrollbar is hidden and the wall carries a copy of it.
- **The first sign.** From the click, light seeps in at the page's edges, soft and white, as if
  from behind it (`seep`, a layer of four edge gradients on the wall's face, building over the
  first 0.32 s, gone as the wall tips past 50°), while the viewer starts to move in.
- **Pushed by the viewer (walking).** The viewer closes in on the wall and meets it at eye height
  almost at once (`camera.push[0]`, 1% of the viewer's way; the push takes hold softly from the
  first frame) and pushes it: the wall tips exactly as far as the push takes it (tan θ = how
  far the eye has gone past the wall ÷ the lever, which is set by `camera.push[1]`: by 9% of the
  way the push alone would have it at 45°), or further when gravity has taken it (the contact is one-sided: the wall never pulls back
  toward the viewer, and the viewer never passes through it). The push takes hold softly, over
  `camera.contact` of the way, so moving in blends into pushing with no jolt. Past its balance
  it falls under θ'' = sin θ / τ² (`wall.gravity`, 260 ms) faster than the viewer walks, so it
  leaves the eye, meets the floor through the same cushion as below and settles. All of it is in
  shares of the viewer's way, so it is timed the same on every screen: it starts to tip within
  0.15 s, is past 5° by 0.19 s, passes 45° at about 0.4 s and lands at about 0.67 s, all the
  while growing on screen as the viewer comes (30% bigger as it passes 45°). Its angular speed
  builds and fades over several frames (unit-tested for no single-frame jolt). The fall is simulated once, in the click, against
  the viewer's planned move (`planPushedFall`); a slow page is only waited for once the viewer has let go of
  the wall, so the planned fall is the one that happens.
- **Let go (still viewer).** The slab (W × H × 14 px) is hinged on its bottom-back edge. Let go at
  the click, it eases back about 50 px and starts to tip at once: it falls from rest under gravity,
  θ'' = G sin θ, plus a shove that fades (`wall.shove`), so it starts smoothly but does not hang
  near upright the way a pure fall does (a pure fall is still under 15° half way through its
  time; with the shove it is 8° at a fifth, 36° at half, 78° at four fifths). A cushion of air
  from about 57° slows it, so it meets the floor at about a fifth of its top speed (0.72 s after
  the click) and settles with no visible rebound. Hinged on the back edge, its underside turns toward the viewer from about
  20° and shows the slab's thickness (in shade, with a lit arris); lying down, its face is 14 px
  above the floor, like a real board. A contact shadow on the floor tightens as it comes down.
  Its top, back and sides never face the viewer, so they are not drawn.
- **Light.** Slightly backlit as it lets go, rimmed by the rising light while it falls (a soft
  white halo round its edges, gone just before it lands), hazing toward white at its far end as
  it tips, then
  partly taken by the light as it lands (its thickness first), so it lies in the mist, plainly
  the page, while the viewer steps over it. It is never faded as a whole (that would flatten the
  slab). Walked over, it slides out under the bottom of the screen and is hidden once its far
  edge has passed beneath (it is H long and the perspective is longer, so it never reaches the
  eye's own plane). For a still viewer it is absorbed into the luminous floor instead: it whitens
  a little while it fades away, gone about 0.5 s after landing (washing it to pure white and then
  removing it made a visible pop).

### The world of light

Three looks, chosen with `tunnel.style` (or `?portal-world=glow|mist|hall`):

**The glowing white space (`glow`, the default).** Asked on 2026-11-08: "Remove any mist. Just a
glowing dreaming white background." So the misty void below without its mist: no banks, no
drifting wisps, no fog swallowing the far portal, no ground, no shafts:

- **The backdrop** (a canvas at the device's resolution): a soft white at the centre settling to
  a pale pearl at the edges of sight (luminance about 247 → 225; brighter than the fog's edges,
  with no fog to grey them), and a dither too fine to see (`glow.grain`) so the gradient never
  bands.
- **The light** (the same 512 px canvas as the mist's, without shafts by default: `glow.rays`
  0): a white-hot core and a wide bloom behind the portal. Walking, it stays where the
  portal started, so the portal comes forward out of it; it floods out as the wall goes, flares,
  breathes, swells, and fades as the page fills the screen. Measured at 1 s: 22 levels of 255
  brighter round the portal than in the screen's top corners.
- **The portal** is never dissolved: while far it is only a little soft (`glow.soften`, 14 px in
  its own space, clear by 40% of the screen).

**The misty void (`mist`): glowing fog.** The owner's reference for "dream white
gleam" was a photograph of a figure standing in white fog (measured: luminance about 248, a faint
cool cast, a very fine grain, the far figure grey, soft-edged and half dissolved). Then: "the mist
should be glowing". So the fog is lit from within, and there is no architecture at all:

- **The light** (its own layer, a 512 px canvas painted once): a white-hot core, a wide bloom
  that falls off close to a bell curve, and soft shafts of light streaming out through the fog
  (wedges blurred by halving). It sits behind the portal and travels with it, centred on it and
  always far wider than it (0.7 + 1.5 × the portal's scale, in screen diagonals), so the portal
  comes out of the light and is backlit through the fog at every distance. It floods out as the
  wall goes, flares, breathes (2.6 s), swells as the portal nears, and fades as the page fills
  the screen. It does not turn: turning a layer this size cost about a quarter of the frames.
- **The void** (a canvas at the device's resolution): the unlit fog, a soft white at the centre
  settling to a cool pearl grey at the edges of sight (240 → 216 in luminance), so the light has
  something to glow against; still banks of mist; the barest hint of ground near the viewer; a
  fine grain, like a photograph of fog.
- **The mist** is fractal noise (smooth noise over five octaves, stretched sideways, so it lies in
  banks with gaps between them), lit by the light: near the centre it glows white, towards the
  edges, where the light hardly reaches, the same mist is a soft cool grey. Two drifting layers
  of it sit in front of the portal and behind the wall, painted at a quarter size and stretched
  (so always soft). They drift slowly on their own and flow toward the viewer while the portal
  travels, each growing evenly in log scale and fading in and out of its own cycle, so lit wisps
  pass in front of the portal; they are gone before the page takes over.
- **The portal emerges from the light.** Its visibility falls with distance (e^(−d / 5.5
  perspectives), taking up to 62% of it when far, so it is half dissolved in the glow), and while
  far it is in soft focus (a blur of 40 px in its own space, about 7 px on screen). The focus
  clears by the time it covers 40% of the screen; the fog clears as it arrives. Its red light
  reaches further in the fog (2.5 times its size, 1.9 in the hall); its reflection is faint (a
  misty floor, not a mirror).

**The gleaming hall (`hall`).** Predominantly white and gleaming: cool neutral whites near the viewer (#c4c5cd to #d6d7dd)
fading into pure white with distance (an exponential haze), so depth comes from light, not
decoration. Painted once, ahead of time, in three parts:

- **The hall** (a canvas at the device's resolution): floor, walls and ceiling with depth-correct
  haze; seams running into the distance; rectangular frames receding toward the source, each a
  grey structural line with a tube of light just in front of it (the hall's architecture, and an
  echo of the portal); two ceiling light strips; a glossy floor that mirrors the strips, the
  frames' uprights (gleaming streaks) and the source's long shine; the light left once the eye
  has adapted, baked in.
- **The glow** (its own layer): every light above drawn as a light map at a quarter of the
  screen's size and blurred by repeated halving (each halving averages 2 × 2 pixels, a true box
  blur that needs no canvas `filter`, so it looks the same in Safari) into a tight halo and a
  wide one, plus soft shafts of light from the source. It flares as the wall goes (the first
  light floods out), breathes slowly (2.6 s), and swells as the portal comes close.
- **Light that moves:** the glare of the first light (blinding as the wall goes, then the eye
  adapts) and five waves of light (a bright core with a soft halo on both sides) that flow from
  the travelling portal toward the viewer, so the hall seems to move around the destination
  while the camera stays still. Each wave grows at a constant rate on screen (evenly in log
  scale), so none rushes past the eye as it comes near.

No particles, circles, lightning or HUD; no colour but white and neutrals (the red belongs to
the portal).

### The portal

- **The page, for real.** The destination is a temporary iframe exactly the size of the
  viewport, so it is laid out as it will be after the navigation (phone width on a phone). It is
  sandboxed (`allow-same-origin` only by default: no scripts, so no analytics hit, no storage
  side effects, no frame busting; no top navigation, popups or forms), not focusable and hidden
  from assistive technology. It starts loading in the click.
- **Ready** means loaded, readable, not an HTTP error (`responseStatus`), something presentable
  (a script-only shell is not), fonts and first-screen pictures decoded.
- **When it cannot be shown** (cross-origin and not allow-listed, refused by X-Frame-Options or
  CSP, an error status, an empty shell, or still not ready after 3.8 s), the portal shows an
  honest preview: the sticker's own picture, section, title and copy, and the address it leads
  to. It is never a mock of the page, and browser security is never worked around. A preview
  fades to white at the very end, which is what the browser shows while another site loads.
- **The frame** is a thin, soft line of Vodafone red #e60000 running just outside the page
  (0.7% of the shorter viewport side), so at the end it passes beyond the screen edges and the
  page is all that is left. It reads as blurred light: a thin core in a wide soft halo (measured
  at 2.35 s on desktop: 7 px of clear red, 4 of them fading edges; the old ring was about 17 px of
  solid red at that size). Its width is kept about the same on screen whatever the distance
  (`portal.line`, 8 to 12 px for a 900 px high screen, scaled with it): each side's track is
  widened across as the portal shrinks, by transform only, so nothing is repainted. A close, soft
  red glow round it (breathing slowly, 3.6 s) comes up as it is completed.
- **It is traced, then it circles.** From 0.77 s two lights (a soft red glow with a lighter-red
  core, never white) set off from opposite corners and draw the line round the page, each its
  half, in 1.3 s (`portal.trace`: from rest, an ease in and out that lands on the circling
  speed); the freshly drawn end is brighter and hotter, a trail behind each light. Then they go on
  circling it slowly (`portal.flow`, a lap in 3.5 s), each with a fading trail, until the page
  fills the screen. One clipped track per
  side, with a soft mask at each corner, so trails turn the corners and the sides meet in a soft
  corner with nothing sticking out. The line, trails and lights are painted once into small
  canvases (soft in both directions), ahead of time while the Pocket is open, then only moved,
  stretched and faded, on the transition's own clock. Over the last few percent of the approach
  the line and its glow fade out, so the final frames are the page alone and nothing switches off
  at the end. Its faint image lies in the floor and it casts a little red on the white around it.
  (Before: a 2.2% solid ring with a dark-red inner edge and a slow gleam; before that, two bright
  comets lapping every 3.2 s.)
- **The approach.** The portal ignites at 0.3 s, at 17% of the screen (23% on narrow
  screens), standing on the floor like a door, while the wall still hides it: the falling wall
  uncovers something already glowing there. The viewer has been moving since the click and the
  portal comes toward them (see "One space, and a viewer who walks"), rising a little off the
  floor; they meet at about 3.25 s. (Revision 9 took 1.6 s, Revision 8 3.1 s; Revision 7 planned one move in log scale, x^4 (1 − x)^6;
  Revision 6 one move in distance, x^1.7 (1 − x)^4.5; Revision 5 in log scale as
  `cubic-bezier(0.6, 0, 0.35, 1)` from 0.56 s; before that, `(0.5, 0, 0.16, 1)`.) For a still
  viewer only the portal moves (`portal.ease` over the whole way, from when it ignites) and
  arrives at the same moment, floating a little above the floor when far and landing exactly on
  the viewport.
- **Waiting for a slow page.** At 20% of the approach, while it is still slow, readiness is
  checked once. If the page is not ready the portal brakes over 0.7 s and hovers at about a
  quarter of the screen; a slow band of light passes over the white inside the frame, and the
  frame's light keeps flowing. Once ready (or once the preview is chosen) a Hermite curve carries
  the current position and speed onto the viewport. Position and speed are continuous
  everywhere (unit-tested against the plan's own acceleration).

### Handoff

When the portal is the viewport its transform is removed (flat, unscaled: the frame is now the
iframe's page) and, two frames later, the real navigation is a click on a private copy of the
person's link (so href, target, rel and referrer policy behave natively; propagation is stopped
so page handlers do not count a second click). The browser keeps showing that frame until the
destination paints. Measured: the last portal frame and the destination after the real navigation
are identical (0 of 1,296,000 pixels differ at 1440 × 900).

### Navigation safety

- Intercepted only on the Pocket page (album open, no page turn running), only plain
  primary-button clicks or Enter on same-tab `http(s)` links to another page on this origin or
  a Vodafone host (`*.vodafone.com.eg`), not already handled by the page.
- Left to the browser: modified clicks, middle click, `target` other than this tab, `download`,
  `mailto:`/`tel:`, same-page jumps, other sites (Facebook, app stores), `data-portal="off"`,
  the composer's links, and everything when `prefers-reduced-motion: reduce` (the link just
  navigates).
- One transition at a time: later clicks are swallowed until it ends. Escape skips straight to
  the destination. A width change (rotation) skips too. A watchdog navigates after 9 s whatever
  happens. Any error navigates natively at once. If the browser stays on the page after the
  handoff (a 204, a cancelled unload), the page is given back after 10 s.
- **Back.** Before navigating, the history entry is marked "the Pocket was open" (with its
  scroll). From the back/forward cache the page is as it was, so the transition is just removed
  (`pageshow`); from a fresh load the mark reopens the Pocket at once, without the page turn.
  Closing the Pocket removes the mark.
- Vodafone's accessibility button and the Voice Guide stay above the transition at their usual
  place (they exist on the destination too, so they hold still while the world changes). The
  other floating buttons belong to the page and fall with the wall.
- Announced to screen readers ("Opening Vodafone Cash", "بنفتح فودافون كاش").

### Smooth by construction

- **One clock.** Every moving thing (the wall, the light, the portal, the light round its frame,
  the waves) is a function of one time value, evaluated once per frame. Curves are C1 or better:
  fades use smootherstep (continuous acceleration), the fall and the approach are planned curves
  with matched speeds where they hand over.
- **Warm-up.** The scene appears in the click exactly as the page looked, and the clock starts
  two frames later: the first paint of every layer (the copied page, the hall, the glow) happens
  while nothing moves, so the motion never starts with a jump. In those two frames every layer
  that will appear later is drawn at 0.2% opacity, so none is painted for the first time
  mid-motion; afterwards an invisible layer is exactly transparent and costs nothing.
- **Nothing is repainted per frame.** Everything that changes is its own composited layer and
  changes only by transform or opacity. Measured (headless Chromium, 1440 × 900): raster work
  during the transition fell from 150–230 ms to 5–30 ms per 250 ms once the light overlays
  inside the copied page and the portal got their own layers.
- **Few full-screen layers.** On phones the limit is how many screen-sized layers are blended
  per frame. The source's flare lives in the glow layer (no separate bloom), the adapted light is
  baked into the hall (the glare layer is transparent after the first second), and the shafts
  are part of the glow. Turning the shafts slowly on a layer of their own was tried and measured
  to cost about a quarter of the frames, so they stay still; the same held for turning the misty
  void's light (102 → 75 frames at 1440 × 900), so it does not turn either.
- **Painted ahead of time, in short steps.** The world is painted when the Pocket opens, in idle
  moments, one part per idle callback (the misty void: fog, ground and grain, light, each layer of
  mist), each step finishing its own drawing, so no single task on the Pocket page is long; what
  is left when a transition starts is painted then. Measured in headless Chromium: the longest
  step 23–29 ms at 1440 × 900 and 11–15 ms at 390 × 844 (the whole paint was one task of 33–42 ms
  before). The mist's noise is computed at half the size it is drawn at, and scaled up bilinearly
  ('high' smoothing is bicubic and cost about 20 ms for no visible difference).

## Alternatives considered

- **Transforming the live page** (wrap the page in a 3D container). Rejected: fixed and sticky
  layers, the scroll position and the live animations (the drone keeps flying) break or show
  through, and an error mid-flight would leave the real page tilted. The copy is the pattern the
  page turn already uses.
- **Rasterising the page** (html2canvas or similar). Rejected: a new dependency, lower fidelity
  (fonts, SVG sprites), and a long blocking capture in the click.
- **WebGL / Three.js for the hall.** Rejected for now: a new runtime dependency, and the hall is
  static, so a canvas drawn once plus a few CSS 3D layers is enough and keeps one projection for
  everything (consistent with the actors' "no WebGL" choice, ADR-0002).
- **Cross-document View Transitions.** Need both pages to opt in; the saved and live Vodafone
  pages do not. Worth revisiting in production, where both pages are Vodafone's.
- **Speculation-rules prerender** of the destination (instant activation). Not chosen: it runs
  the destination's scripts (analytics, storage clearing) and loads it twice; same-origin paint
  holding already gives a seamless swap.
- **Running the destination's scripts in the preview frame** (`destination.scripts: true`).
  Off by default for the side effects above; SPA destinations (`/spa/…`) then show the preview.
- **Keeping new-tab links and playing the portal first.** Not possible: a tab opened seconds
  after the click is a blocked popup, and you cannot travel into another tab.
- **A still viewer, the destination coming to them** (the brief's "camera stationary", the
  first four versions). Replaced by the walk at the owner's request; kept as `camera.mode:
  'still'`. The portal's on-screen motion is the same either way.
- **One camera transform for the whole scene** (a `preserve-3d` world moved by the viewer).
  Rejected: the scene mixes screen-space layers (the fog, the light, the mist) with 3D ones, and
  in one 3D rendering context they would be depth-sorted against each other instead of kept in
  their order; each layer is given the viewer's position instead.
- **Planning the move in on-screen size** (how big the door looks, in log scale; Revisions 4
  and 5). Replaced in Revision 6: it cannot start on the click (a door that must grow evenly from
  far away needs the viewer to be moving fast already, so the walk had to wait for the wall),
  and its ending was a brake, not an ease-out (the owner: "everything seems so linear"). In
  distance, with a speed curve that is zero at both ends, the start is a gentle push forward and
  the end a long, soft deceleration. An even pace in distance (a walker's) was also rejected: a
  far door hardly grows and then rushes at the eye.
- **The wall knocked over on a timer while the viewer starts moving** (Revision 5's fall with
  the walk moved to the click). Rejected: the wall would move before the viewer reached it, and
  the viewer would then either pass through it or have to wait for it; the owner asked for the
  viewer's move to be "what is pushing the wall to fall". Simulating the fall against the planned
  move, with one-sided contact, makes the push the cause.
- **The push in pixels.** Tried first: the viewer covers far fewer pixels of depth on a phone
  (the perspective follows the screen), so a push measured in pixels was weak and late there.
  In shares of the way it is timed the same on every screen (unit-tested at 1440 × 900 and
  390 × 844).
- **One move for both, planned as the speed the eye reads** (Revision 7: growth in log scale,
  x^4 (1 − x)^6). Replaced in Revision 8: the start was a launch for the far destination, but
  near the viewer it meant hardly moving (under 1% closer by 0.3 s), so the wall seemed to tip
  on its own; the owner: "The user perspective (camera view) should already be moving closer to
  the page as if it's zooming in while the page is falling down". The viewer's own move is now
  planned in distance (felt at once on what is near) and the destination's separately, so the
  near motion and the far motion each get the curve they need. Before that, **one move in
  distance** (Revision 6, x^1.7 (1 − x)^4.5): it moved in from the click, but gently, and a
  single curve could not also give the far destination its launch.
- **A camera shake or a burst for the launch.** Not done: it adds motion discomfort and reads as
  an effect, not as the brand; the launch is in the timing (gathering speed into the wall) and the light
  seeping in at the edges.
- **Keeping the mist.** The owner asked to remove it; the misty void stays available as
  `?portal-world=mist` (checked in the browser tests), the hall as `?portal-world=hall`.
- **A frame line whose width scales with the portal** (one soft ring inside the portal, painted
  once). Simpler, but at 17% of the screen a thin line is under a pixel and vanishes; keeping
  its width on screen needs per-side tracks widened across as the portal shrinks.
- **Drawing the frame per frame in a canvas.** Rejected: a full-screen canvas redrawn and
  uploaded every frame is the kind of per-frame repaint the rest of the scene avoids.
- **A rotating conic gradient for the circling light.** Rejected: on a rectangle an angle sweeps
  the long sides faster than the short ones (the light would lurch at the corners), and the
  trail could not turn the corners.

## Consequences

- **Behaviour change:** sticker links leave in this tab. Back returns to the open Pocket.
  `tests/e2e/pocket_e2e.py` now expects no `target` on sticker links; `?portal=off` gives the old
  behaviour (checked).
- **Console:** the sandboxed preview frame logs "Blocked script execution … 'allow-scripts' is
  not set" for each script in the destination. Expected, harmless, and the reason no analytics
  fire.
- **Size:** the always-loaded bundle grows by about 3 KB gzipped (Vite puts the always-loaded
  portal code and the strings it shares with the scene in a chunk it names `history`); the scene
  (14.6 KB, all three worlds, both viewers; 14.3 KB in Revision 7, 12.7 KB in Revision 6) and
  the stylesheet (3.4 KB) load when the Pocket opens.
- **Cost of the click:** the copy of the page and the scene take 15 to 38 ms in headless Chromium
  at 1440 × 900 (software rendering; Revision 7: 20 ms at 1440 × 900 and 20 to 34 ms at 390 × 844,
  against 18 to 23 and 25 to 29 for Revision 6, the red line's canvases being painted ahead of
  time while the Pocket is open; painted in the click they added about 20 ms); the first frame
  follows within 5 to 10 ms. Revision 8: 20 to 23 ms at 1440 × 900, 30 to 35 ms at 390 × 844.
- **Memory:** the red line's canvases are about 0.9 MB at 1440 × 900 (freed when the Pocket closes).
- **Frame rate:** in headless Chromium (SwiftShader: software rendering, no GPU), frames drawn
  during the transition: the viewer moving in through the wall (Revision 8) 148–152 in 3.18 s at
  1440 × 900 and 180–183 in 3.13 s at 390 × 844 (interleaved with Revision 7: 137–141 in 3.09 to
  3.16 s and 175–178 in 3.04 to 3.09 s; about 47 against 45 fps and 58 against 57.6 fps; real
  time on the phone size 57.9 fps, p95 16.8 ms); the launch in the glowing white space (Revision 7) 140–141 in 3.12 s at
  1440 × 900 and 178–179 in 3.05 s at 390 × 844 (interleaved with Revision 6: 88–99 in 3.21 s and
  183–185 in 3.13 s; about 45 against 29 fps on desktop, the mist's layers gone, and the same
  rate on the phone size, about 58 fps; real time on the phone size 57.8 to 59.5 fps, p95 16.8 ms,
  against 57.6 to 58.9); the camera pushing the wall (Revision 6) 99–106 in 3.19 s at 1440 × 900
  and 181–184 in 3.13 s at 390 × 844 (interleaved with Revision 5: 98–101 in 3.36 s and 194 in
  3.34 s, so the same rate, about 31 and 58 fps; real time on the phone size, 58.8 fps, p95 16.7
  ms); the overlapping choreography 97–101 in 3.35 s at 1440 × 900 and 195–198
  at 390 × 844 (interleaved with the previous version: 97–100 and 202–204 in 3.5 s, so the same
  rate, about 29 and 59 fps); before that, walking through the glowing mist 100–104 at 1440 × 900 and 205 at
  390 × 844 (interleaved with the still viewer on the same machine: 94–97 and 205–208; the walk
  costs nothing, and the walked-over page is hidden sooner than the still viewer's fades); the
  glowing mist against the unlit mist, interleaved, 86–95 against 96–100 (the light costs about a
  tenth; `mist.glow: 0` leaves it transparent, which costs nothing); the hall 111–115 and 199–205; the first version 84–88 and 167–171. The existing page
  turn measured the same way runs at 15 to 22 fps at 1440 × 900. Real GPUs will be much faster;
  not measured on devices.
- **Length:** about 3.3 s from click to navigation (Revision 10; 1.6 s in Revision 9 was felt as
  too fast, 3.2 s in Revision 8, 3.35 s before). A page not ready by about 0.85 s makes the portal
  hover, up to 3.8 s from the click before the preview takes over, so a slow page can stretch it.

## What to tune in a pilot

All in `src/pocket/portal/config.js` (`PORTAL_DEFAULTS`), overridable through
`initPocket({ portal: { … } })` or the URL: `?portal=off`, `?portal-speed=0.5` (slow motion for
demos), `?portal-embed=never|same-origin|allowlist`, `?portal-world=glow|mist|hall` (compare the
looks), `?portal-camera=walk|still` (compare the two viewers), `?portal-debug` (logs and
`window.__vfPortalTrace`).

- `speed` (1): the whole choreography; 1.25 shortens it to about 2.6 s, 0.85 lengthens it to about 3.9 s.
- `timing`, the cue sheet in ms from the click (the phases overlap by design; a unit test keeps
  them overlapping): `unlatch` (200: light leaks round the wall's edges; the light seeping in at
  its face builds over 1.6 × this), `fall` (720: still viewer only, the wall touches down), `rise`
  (520: the light at its brightest), `ignite` (250: the portal starts to glow, still hidden),
  `gateIn` (850: it appears; the red line starts to be traced at 60% of it), `arrive` (3500: the
  planned move ends; it is seen to arrive a little earlier, when under 0.6 px is left), `hold` (0.25 of the approach, about 0.85 s: where it checks readiness, never before the
  viewer has let go of the wall), `readyTimeout` (3800), `watchdog` (9000). (`walk` is gone: the
  walking viewer moves from the click.)
- `wall`: `gravity` (260 ms: walking, how fast it falls once pushed past its balance; larger
  falls slower); still viewer: `push` (0.03 of the perspective), `shove` (2: how firmly it is let
  go; 0 for a pure fall, which hangs), `shoveFor` (0.3); both: `thickness` (14 px), `wash` (640 ms,
  from just before it lands), `cushion` (6: higher settles softer), `cushionFrom` (1.0 rad),
  `bounce` (0.12).
- `tunnel`: `style` ('glow', 'mist' or 'hall'); for the hall: `depth` (14 perspectives), `fog` (2.1),
  `margin` ([0.14, 0.16]: how far walls and ceiling stand outside the viewport), `ribs` (0.95:
  spacing of the frames).
- `glow` (the glowing white space): `light` (0.95: how brightly the light behind the portal
  glows), `rays` (0: shafts from it; up to 1), `grain` (0.004: a dither), `soften` (14 px of soft
  focus when far; 0 for none). The colours are `DREAM_CORE`, `DREAM_MID` and `DREAM_EDGE` in
  `environment.js`.
- `mist`: `glow` (0.95: how brightly the light behind the portal lights the fog; 0 for none),
  `rays` (0.9: the shafts through the fog), `lit` (1: how brightly the mist glows where the light
  reaches it), `cover` ([0.3, 0.66]: where mist begins and where it is thickest, in levels of its
  noise; lower means more mist), `fog` (5.5 perspectives: how fast distance swallows the portal),
  `depth` (0.62: how much of the far portal the fog takes), `density` (0.9: the drifting mist),
  `drift` (9000 ms per bank on its own), `flow` (1.4 banks past while the portal travels),
  `grain` (0.014), `soften` (40 px of soft focus when far; 0 for none). The colours are `CORE`,
  `AMBIENT` and `EDGE` (the unlit fog), `LUMEN` and `BODY` (lit and unlit mist) and `GROUND` in
  `environment.js`; the light's size (0.7 + 1.5 × the portal's scale) and its fade are in the
  controller.
- `camera`: `mode` ('walk' or 'still'), `travel` (2.2 perspectives: how far the viewer moves,
  the same on every screen; the destination comes the rest of the way; more makes the wall come
  at them harder), `ease` ([1.15, 3]: the viewer's speed over the move, in distance, x^p (1 − x)^q;
  a larger p is a slower ease in, a larger q an earlier top speed), `push` ([0.01,
  0.09] of the viewer's way: where the eye meets the wall, and where the push alone has it at
  45°; move both later for a later, gentler push), `contact` (0.01 of the way: how softly the
  push takes hold; never more than the first), `passes`
  (mist only: 3.5 banks streaming past on the way), `wash` (0.3: how much of the fallen page the
  light takes before it is walked over), `bob` (0: a smooth glide; 0.0045 of the height for a
  walk's rise and fall), `steps`
  (1.8 per second), `sway` (0.7 of the rise). The steps fade in over 0.35 s and are gone by 75% of
  the approach (`strideAt` in `motion.js`).
- `portal`: `startScale` ({ wide: 0.17, narrow: 0.23 }), `ease` ([2.5, 7]: the destination's own
  speed toward the viewer, in distance, x^p (1 − x)^q; a larger p sets off later, a larger q gives
  a longer, softer ease-out), `hover` (0.025 of the height: how high
  it rises as it comes), `lift` (0.05 of the height, still viewer only), `frame` (0.007 of the
  shorter side: where the red line runs outside the page), `line` ([8, 12] px: its soft width on
  screen, far and near, for a 900 px high screen), `trace` (1300 ms to draw it), `flow` (3500 ms
  per lap afterwards), `lights` (2; 1 draws the whole line with one light).
- `light`: `glow` (0.95: the hall's bloom), `rays` (0.6: the shafts), `glare` (0.62), `ambient`
  (0.06), `red` (0.7).
- `destination`: `embed` ('same-origin'), `allow` ([] origins to frame cross-origin, only if they
  allow it), `scripts` (false).
- `hosts`, `exclude`: which links are eligible.
- In `motion.js`: the approach's `brake` and `finish` (the hover for a slow page); `curve`
  ((0.6, 0, 0.35, 1)) is only used when no `shape` is given. In the controller: the arrival snap
  (0.6 px).
- In the controller: the portal's appearance (over the first 70% of `gateIn`; the line traced
  from 60%), the light seeping in at the wall's face (0.85, building over 1.6 × `unlatch`, gone by
  50°), the light's swell and flare (0.28), the red's breath (3.6 s) and the light round the
  wall's edges.
- In `gate.js`: the line's profile across (`across`: core and halo), its strength (0.5) and the
  trails' (1), the lights' size (4.5 bands) and colours (`RED`, `HOT`), the trail length (half the
  shorter side). In `portal.css`: the seep's gradients, the red glow round the line.
- In `environment.js`: the hall's colours (`FLOOR`, `WALL`, `CEILING`, `RIB`) and the glow's mix
  of tight and wide halos (`paintGlow`); in the controller, the glow's breathing (2.6 s) and swell.
- In `portal.css`: the waves' halo, the preview's layout.

**Watch:** whether 3.3 s feels magical or long, the first time and after (`speed`); whether the
ease in reads as building momentum or as hesitation (`camera.ease` p), and whether the long ease
out reads as settling or as dragging (`portal.ease` q); whether people understand
where they are going before they arrive; motion discomfort (reduced motion is honoured, but not
everyone sets it); whether same-tab links surprise people who expect the Pocket to stay open,
and whether Back to the open Pocket answers that; whether the walk reads as walking through the
wall or as gliding (the steps, `camera.bob`, are deliberately small; 0 makes it a glide) and
whether the steps add to motion discomfort; whether the opening reads as the viewer pushing the
wall over (`camera.push`, `wall.gravity`) or as the wall being knocked away; whether moving in
on the page that fast is exciting or uncomfortable (`camera.travel`, `camera.ease`); whether the
moment the wall has gone, when the near motion stops and only the far destination moves, reads
as a breath or as a stall (`portal.ease` p lower brings the destination sooner); whether people
see the destination coming toward them, not only themselves going (`portal.hover`); whether the slow ease-out into
the page feels premium or long (`portal.ease`, `timing.arrive`); whether the traced red line
reads as premium or as sci-fi decoration, and whether it is still seen on small phones (`portal.line`,
`portal.flow`); whether the fallen page lying on the floor (the dark
footer is its near edge) reads as the wall you step over or as clutter (`camera.wash`); whether the glowing mist reads as
dreamlike or as a washed-out screen on very bright displays, or as grey at the edges on dim ones
(`mist.glow`, `mist.lit`, the `EDGE` colour), and whether the destination is recognised early
enough out of the fog (`mist.soften`, `mist.depth`).

## Revisit when

- The Pocket runs on Vodafone's own site: every destination is same-origin; consider View
  Transitions for the last step and whether preview frames should be excluded from analytics
  explicitly rather than by having no scripts.
- Destinations are mostly SPAs (`/spa/…`): they need scripts to render, so they show the preview;
  decide whether `destination.scripts` should be on for an allow-list.
- Device measurements are poor: drop the waves and the reflection first, then paint the hall at
  1× on phones.
- Other links on the Pocket page should get the portal (the shell's links open new tabs by
  design today, so they are left alone).

## Revision 10: a slow ease in, a long, soft ease out, about 3.3 s (2026-11-08)

Asked: "The animation was getting too fast because you've cut the time too much. We want to reach
around 3 seconds, but during these 3 seconds, I want to the ease in to take its time as much as
the ease out. So the iframe doesn't have to hit the user in the face. It eases out very slowly.
… Maybe that would extend the time up to 4 seconds. So it's your call. … you have to look at
premium experiences and similar animation visual implemented by premium websites and apps."

What premium motion systems do for a large element travelling to fill the screen, and what was
taken from them:

- **No overshoot, a settling tail.** Apple's guidance for interface springs is critical damping
  (damping 1.0) by default, under-damped only when a gesture carried momentum; a critically
  damped approach decelerates continuously and settles with no bounce. Taken: the destination's
  own approach ends on (1 − x)^7, a long tail that keeps slowing until it is under a pixel a frame,
  and nothing overshoots. (Source: a summary of Apple's fluid-interface guidance,
  https://mcpservers.org/agent-skills/emilkowalski/apple-design; WWDC 2018 "Designing Fluid
  Interfaces" is the original, not fetched here.)
- **Accelerate gently, decelerate for longer, as a pair.** Material Design 3's "emphasized" easing
  for large, expressive transitions accelerates gently and spends most of its time decelerating,
  with its longest durations for full-screen changes (the Material pages need JavaScript and were
  not read in this session; this is from the published system, not re-checked). Taken: the eye's
  speed of approach rises to half its peak in 0.6 s and falls back to half in 0.8 s after the
  peak, and on screen the slowing takes about 1.5 s of the 3.3.
- **Big things must not rush at the eye.** Perspective makes the destination's on-screen growth
  fastest when it is already large, so its speed is planned to fall well before it fills the
  screen: its fastest on-screen growth (13 px a frame) is at 1.8 s, with half the screen still to
  cover, and the last 0.45 s are under 2 px a frame.

Changed: the cue sheet back to about 3.3 s (`timing`: unlatch 200, fall 720, rise 520, ignite
250, gateIn 850, arrive 3500, hold 0.25; `wall.gravity` 260, `wall.wash` 640; `portal.trace`
1300, `portal.flow` 3500; the fades written in milliseconds scaled to match); the viewer eases in
(`camera.ease` [1.15, 3], was [1, 3]: 3% bigger by 0.16 s, 12% by 0.3 s, 30% by 0.45 s); the push
a little later and gentler than Revision 9 but earlier than Revision 8 (`camera.push` [0.01,
0.09]: past 5° by 0.19 s, 45° at 0.4 s, down at 0.67 s); the destination's ease out longer
(`portal.ease` [2.5, 7], was [1.8, 5]).

Measured (headless Chromium, 16 ms steps; the timeline chart compares with Revision 9): click to
navigation 3.29 to 3.34 s; on the captures no pops on the phone, and on desktop one flagged frame
at the very end (the arrival snap, 0.15 levels of 255 against about 0.05); frames drawn in
software rendering 169 to 171 in 3.33 s on desktop (about 51 fps) and 194 to 195 in 3.29 s on
the phone size (about 59 fps); real time on the phone 58.6 to 58.9 fps, p95 16.8 ms; click 18 to
27 ms. The last frame is still the page (0 px differ).

## Revision 9: half the time, the wall pushed over at once (2026-11-08)

Asked: "Not quite there yet. The user perspective does not move fast enough to zoom in to the
page or moving towards the page as if it's pushing the page. In other words, we need to make the
page full falling animation starts a lot earlier, while the user moving forward faster. plus
taking 5 seconds for the entire animation cycle is too much, so we need to cut the time in half."

(The videos showed 0.8 s of the album before the click and 0.7 s after the end; the transition
itself was 3.2 s from click to navigation. That is what was halved; the new videos show 0.3 s
before and after.)

Changed:

- **Half the time:** every cue and duration halved (`timing`, `wall.gravity` 190, `wall.wash`
  380, `portal.trace` 700, `portal.flow` 2500, and the fades written in milliseconds in the
  controller and the frame). Click to navigation about 1.6 s (was 3.2 s); the page fills the
  screen at 1.57 s.
- **Moving in faster, from the first frame:** the viewer's speed curve is x^1 (1 − x)^3
  (`camera.ease`, was x^1.3 (1 − x)^3.5): the speed rises evenly from the click instead of
  gathering slowly. The page is 7% bigger on screen by 0.1 s (was under 1%), 15% by 0.15 s, a
  third by 0.2 s (was 5%), nearly twice by 0.3 s (was 12%).
- **The wall goes at once:** contact at 1% of the viewer's way, 45° by 10% (`camera.push`
  [0.01, 0.1], was [0.03, 0.13]): past 5° by 0.08 s (was 0.27 s), 45° at 0.19 s (was 0.48 s),
  down at 0.34 s (was 0.77 s).
- The readiness check moved to 30% of the move (about 0.5 s), so a page loading normally is not
  made to hover in the first half second; a hover brakes over 0.4 s (was 0.7 s).

Measured (headless Chromium, 16 ms steps): no pops on either capture; the only near-still frames
are the two at the click where the clock waits by design. Right after the wall, the low-motion
moment that was about half a second in Revision 8 is now about a tenth of a second. Frames drawn
in software rendering: desktop 72 to 79 in 1.66 s (43 to 48 fps), phone 90 to 94 in 1.64 s (55
to 57 fps; Revision 8, interleaved: 151 to 155 in 3.2 s and 182 to 185 in 3.13 s, 48 and 58
fps: the costly wall is now a larger share of a shorter run); real time on the phone size 57.9
to 58.4 fps, p95 16.8 ms. Click 26 to 27 ms desktop, 21 to 32 ms phone. The last frame is still
the page (0 px differ).

## Revision 8: the viewer moves in on the page and pushes it over (2026-11-08)

Asked: "The user perspective (camera view) should already be moving closer to the page as if it's
zooming in while the page is falling down. I insist that the experience has to look like if the
user is moving through the wall and actually pushing it to fall down."

What was wrong: Revision 7 planned one move for both the viewer and the destination, shaped for
the far destination (a heavy launch in log scale). Near the viewer that meant hardly moving: the
page was under 1% bigger at 0.3 s and the viewer covered only 55% of the way, so the wall tipped
while the camera all but stood still (the grey top lane of the timeline chart).

Changed (see "One space…" and "The wall"):

- **Two motions on one clock** (`splitApproach`). The viewer's own move is planned in distance
  (2.2 perspectives on every screen, x^1.3 (1 − x)^3.5): the page grows on screen from the click
  (3% by 0.16 s, 12% by 0.3 s, 40% by 0.5 s, 2.6 times by 0.75 s) and keeps speeding up into
  the wall and through it. The destination's own approach (x^1.8 (1 − x)^5) covers the rest,
  setting off a little later, and gives the long, soft ease-out into the page.
- **The push follows the viewer:** contact at 3% of their way, 45° by 13% (`camera.push`): the wall
  tips from about 0.2 s, passes 45° at 0.48 s (the page 40% bigger by then) and lands at 0.77 s,
  as the viewer goes through where it stood.
- `camera.share` became `camera.travel` (in perspectives, the same on every screen) with its own
  `camera.ease`; `portal.ease` is the destination's own approach; `timing.arrive` 3400.

Tried along the way: the destination setting off later (x^2.5): the on-screen motion dropped more
when the wall left, from the near wall rushing past to a far, slowly growing destination; x^1.8
brings it sooner. Some of that drop remains by nature (near things move far more than far ones);
it is on the watch list.

Measured (headless Chromium, 16 ms steps): no pops on the phone capture; on desktop the same two
sub-level changes in the last tenth of a second as before (the lights over a still page, the
arrival snap). Frame rate the same as Revision 7 or a little better. The last frame is still the
page (0 px differ).

## Revision 7: a launch, the destination coming too, no mist, a traced red line (2026-11-08)

Asked:

1. "Ease in at the beginning too when moving through the falling wall as if we're launching a
   rocket, so the entire animation seems so cinematic as the user moves towards the iframe and
   ease out at arrival as well."
2. "Make the iframe also come closer to the user's perspective as well while the user is moving
   towards it."
3. "Remove any mist. Just a glowing dreaming white background."
4. "Make the iframe red border thinner, blurry, and slowly round-tripping around the iframe in a
   sci-fi-like animation."

Changed (see "One space…", "The wall", "The world of light", "The portal"):

- **The launch.** The move is planned as the speed the eye reads (growth in log scale),
  x^4 (1 − x)^6: under 1% closer by 0.3 s, the build-up itself accelerating (each doubling of the
  time more than doubles the speed, unit-tested), the surge at about 1.4 s, then a long, soft
  ease-out (the page grows by under a pixel a frame for its last quarter second); arrival at
  about 3.0 s. So the start is visible in the click, light seeps in at the page's edges from the
  first frame and keeps building until the push takes over. The push is retuned for the slower
  start (0.6% and 6.5% of the viewer's way): the wall tips from about 0.4 s, passes 45° at
  0.62 s and lands at about 0.9 s.
- **The destination comes too.** The viewer covers 55% of the way and the destination the rest;
  it rises a little off the floor as it sets off and lands on the viewport; the light stays
  where it started, so the destination comes forward out of it. Steps are off: a smooth glide.
- **No mist.** A new default world, the glowing white space: the misty void without its mist,
  fog, ground or shafts, a little brighter at the edges; the far portal is no longer dissolved,
  only a little soft. The misty void stays as `?portal-world=mist`.
- **The red line.** A thin, soft line instead of the 2.2% ring (7 px of clear red at 2.35 s on
  desktop, 4 of them soft, against about 17 px), its width kept on screen as the portal comes
  closer; traced round the page by two lights from opposite corners in 1.5 s, then circling it
  slowly (a lap in 4 s) with fading trails. Painted ahead of time, moved by transform only.

Tried and changed along the way: corners where the line's ends stuck out (fixed with a soft mask
at each corner of each track); trails that only appeared after the line was drawn (the drawn
line's end is now a bright trail itself); lights too small to read as lights; a curve
x^3 (1 − x)^4.5 (a launch, but the surge barely stood out against Revision 6); tracing while the
portal was still far and soft (now it starts at 0.88 s); a soft-shadow seep that took 133 to 150 ms
to paint in the first frames on the phone size (now four gradients), and the red line's canvases
painted in the click (+20 ms; now ahead of time).

Measured (headless Chromium, 16 ms steps; the timeline chart compares every channel with
Revision 6): on 62.5 fps captures no pops on the phone; on desktop two flagged frames in the last
tenth of a second, changes of 0.22 and 0.38 levels of 255 against neighbours of about 0.1 (the
lights moving over a still page, and the arrival snap; not visible), and the three frames at the
click where the clock waits two frames by design. Frame rate: desktop up by about half (the mist's
layers are gone), the phone size the same. The last frame is still the page (0 px differ).

## Revision 6: the viewer pushes the wall, then eases into the page (2026-11-08)

Asked: "The animation still waits for the fall off of the wall in order to move to the next
animation. It waits long enough that it's not really clear when this animation starts. So my
suggestion is to start the animation with like the user perspective camera is going through the
wall, and in some kind of a way that as if the user perspective is actually what is pushing the
wall to fall. And also the animation lacks easing out for the page transition to happen, so
everything seems so linear."

What the trace of Revision 5 showed: the viewer stood still for 0.56 s while the wall fell on its
own, and set off so slowly that the door grew by under a pixel a frame until about 1 s; the
wall's fall was the only motion, and it did not come from anyone. At the end, the log-scale curve
braked from its top speed to a stop in the last stretch, so the growth fell almost in a straight
line and stopped (the grey bottom lane of the timeline chart).

Changed (see "One space, and a viewer who walks", "The wall", "The approach"):

- **The viewer moves from the click.** The move is planned in distance with a speed curve that is
  zero at both ends (`dollyShape`, `bumpEase`, `portal.ease` [1.7, 4.5]): the page visibly comes
  closer within 0.15 s (the door grows by a pixel a frame from 0.32 s; it took until 0.98 s); the
  fastest point is at about 1.9 s, at three quarters of the old top speed (14 px a frame at 1440
  wide, was 18.6); then about 1.2 s of soft deceleration into the page: under a pixel a frame for
  its last 0.25 s and tapering to nothing (0.84, 0.41, 0.15 px at 2.9, 3.0, 3.1 s), where
  Revision 5 was still growing 1.5 px a frame at 3.1 s and stopped from there. The arrival snap
  ends it at about 3.1 s.
- **The viewer pushes the wall over.** One-sided contact at eye height, simulated in the click
  against the planned move (`planPushedFall`): untouched until the eye reaches it, then exactly
  as far as the viewer pushes, then away under gravity, cushioned onto the floor. In shares of
  the way, so the same on every screen: tips from about 0.19 s, 45° at about 0.46 s, down at
  about 0.75 s (was 0.88 s, falling on a timer).
- **The mist streams past at the speed of the move** (`camera.passes`), and the second layer of
  mist is finer wisps, so the middle of the move does not read as a still glide.
- **Cue sheet:** `ignite` 380 → 300, `rise` 700 → 650, `arrive` 3250 → 3500 (the plan; seen to
  arrive at about 3.1 s), `walk` removed. The transition is about 3.2 s (was 3.35 s).

Tried and dropped along the way: the push measured in pixels (weak and late on a phone); a contact
zone wider than the gap before the wall (on a phone it launched the wall: the eye was already
"in" it on the first frame); a speed curve with q = 3.2 (a shorter ease-out); a plan ending at
exactly the viewport with no snap (a measured shimmer in the text over the last 0.4 s, from
sub-pixel scales).

Measured (headless Chromium, 16 ms steps; the timeline chart compares every channel with
Revision 5): on 62.5 fps captures, no pops on the phone; on desktop one flagged frame at the very
end, a change of 0.21 levels of 255 against neighbours of about 0.1 (the arrival snap; not
visible), and one near-still frame where the wall leaves the screen (8 → 4.8 → 0.6 levels a frame:
the wall going, not a stall). Frame rate the same as Revision 5 (see "Consequences"). The last
frame is still the page (0 px differ).

## Revision 5: one choreography, a quieter frame (2026-11-07)

Asked: "The animation needs to be reviewed bit by bit to make it more premium and not wait for
each step to continue to the other, meaning the animation doesn't have to wait for the
animation of the wall falling in order to start the tunnel animation with enough glowing but in
a premium way, and also the red frame animation needs to be subtle but yet premium and not very
fast, and the timing of everything has to be smooth and coherent."

Reviewed with frames every 100 ms and a trace of every animated value (the controller's debug
trace now records them all; `?portal-debug`, `window.__vfPortalTrace`). What it showed:

- **Nothing happened for 0.7 s.** The wall fell from rest under gravity from 2°, so it hung near
  upright (10° at 0.58 s, 45° at 0.88 s) and then dropped in about 0.3 s. Everything else waited
  for it: the portal at 1.15 s, the walk at 1.04 s.
- **The reveal had no glow at the wall's edge**: the light rimming the wall faded early, and a
  flat white glare washed out the shaped light behind it.
- **The red frame was busy**: two bright comets with white heads lapping every 3.2 s, and a
  strong red halo, from the moment it appeared.
- **The ending crawled**: the approach curve braked for 1.6 s and crept its last 39 px over half
  a second.

Changed (see "The wall", "The portal" and the cue sheet in "What to tune"):

- one cue sheet in ms from the click, with every phase starting while the one before it is still
  moving: the wall tips at once (a shove that fades into the fall: 10° at 0.21 s, 45° at 0.51 s,
  down at 0.88 s); the light rises from the click to its brightest at 0.7 s and rims the falling
  wall; the portal ignites at 0.38 s, before the wall uncovers it; the walk starts at 0.56 s;
- the glare kept low in the mist (the light has a shape there);
- the frame lights up in stages (outline, then the red warms, then the gleam), with one soft
  gleam every 9 s, a closer, softer red glow that breathes slowly, and a slimmer ring (2.2%);
- an approach curve that brakes decisively: arrival at 3.25 s, the transition 3.35 s (was 3.5 s).

Checked: every channel is smooth at 16 ms steps (the largest change of slope in any channel, as
a share of its range, is 0.038, the same as before, for the light round the wall's edges; the
wall's own is 0.007, was 0.011); no pops or still frames on 60 fps captures (desktop and phone);
the same frame rate; the last frame is still the page.

## Revision 4: the viewer walks (2026-11-07)

Asked: "Rather than making the iframe come closer to the user, make the user perspective the
one coming closer to the iframe instead, as if the user is walking through the wall after the
wall falls off." So (see "One space, and a viewer who walks"):

- the destination stands still in the mist, on the floor like a door (no longer floating down
  as it comes), and the viewer walks to it;
- the walk takes over from the fall: the first step is 0.1 s before the wall touches the floor
  (a first try at 0.12 s after left a measured 130 ms of near stillness on the phone capture);
- the fallen page stays in sight in the mist (the light takes only some of it), slides toward
  the viewer as they step over it, and is gone under the bottom of the screen within about
  0.5 s;
- small steps: the eye rises and falls (4 px at 900 px high) and sways, near things moving more
  than far ones, faded out before the arrival;
- the destination's on-screen motion, the hover for a slow page, the arrival and the handoff
  are unchanged (the same plan), and the last frame is still the page (0 px differ).

Measured: no pops or still frames on clock-matched 60 fps captures (desktop and phone); frames
drawn the same as or better than the still viewer (see "Consequences"); the click and the length
unchanged.

## Revision 3: the mist glows (2026-11-07)

Asked: "The mist should be glowing". The misty void was one even, near-white field (luminance
246 to 247 from the portal out to the corners): nothing in it gave light, so nothing could glow.
Glow needs a source and something darker to shine against, so (see "The world of light"):

- a light behind the portal that travels with it (white-hot core, wide bloom, soft shafts);
- the unlit fog settles from a soft white to a cool pearl grey at the edges, so the light reads;
- the mist became fractal noise lit by that light (white near it, cool grey away from it), with
  gaps between its banks, instead of round blots that only brightened everything evenly;
- the portal's red light reaches further in the fog.

Measured at the same moment (1.7 s): round the portal minus the corners, −1.8 → 11.6 levels of
255 (22 at the 1.5 s browser check); mean luminance 245 → 239; pixels at 230 or brighter 98% →
89%, so the scene is still predominantly white. Turning the light was tried and dropped (a
quarter of the frames); the paint was split into short idle steps (see "Smooth by construction").

## Revision 2: the misty void (2026-11-07)

Asked, with a reference image of a figure in white fog: "I mean this kind of dream white gleam".
The hall's architecture (frames, seams, light strips, shafts) did not belong in that picture, so
the world became a misty void (see "The world of light") and the hall stays available as
`tunnel.style: 'hall'`. Tuned against the reference by measurement, not by eye: luminance 234 →
248 (reference 248), grain 2.6 → 0.5 (reference 0.5), spread p5 to p95 16 → 8 levels (reference
3), cool cast kept weaker than the reference's. The portal's fog and soft focus were tuned so it
reads like the reference's far figure (clearly there, soft, half dissolved) yet the page is
recognisable from about a third of the way in.

Cost (headless Chromium, software rendering, frames drawn during the 3.5 s transition): 100–102
at 1440 × 900 (the hall: 111–115; the soft focus costs about a tenth while the portal is far;
`mist.soften: 0` turns it off), 205–206 at 390 × 844 (about 59 fps).

## Revision: smoothness and glow (2026-11-07)

Asked: "smoothen the transition and iron out the animations, and more glow to the gleaming
tunnel". Measured first, then changed:

- **Rendering.** A trace of the first version showed the main thread nearly idle and raster busy
  all the time (layers repainted every frame). Fixed by giving every changing element its own
  layer, warming layers up before the clock starts, and trimming full-screen layers (see "Smooth
  by construction"). Frames drawn: 84–88 → 111–115 at 1440 × 900, 167–171 → 199–205 at 390 × 844.
- **Motion.** Removed a stop-start (the portal used to ignite, ease to a stop, then start its
  approach), a kick where the fall took over from the unlatch, the slam and bounce of the landing,
  a pop when the washed-out wall was removed, the frame's inner edge switching off at the end, and
  waves rushing past near the eye. The light round the frame moved from Web Animations to the
  shared clock.
- **Measured on 60 fps captures** (the page clock stepped by exactly 16 ms per frame, the rate at
  which the test clock fires animation frames; stepping by 16.67 ms made one frame in about 24
  advance twice, which looked like stutter in the first videos): no pops (no frame changes more
  than 1.6 times its neighbours), no hesitations (the first version had one), less jerk overall.
- **Glow.** The hall's bloom pass, gleaming floor reflections, shafts, waves with halos, a darker
  cool-neutral base so the light reads, and a glow that flares, breathes and swells.

## Verified (2026-11-07, again 2026-11-08 for Revisions 6 to 10; headless Chromium from Playwright, offline replay of real pages)

- Unit tests (`npm test`): 114 pass. Revision 10 retimed them again (tipping within 0.15 s, past 5°
  by 0.25 s, past 45° by 0.45 s, down by 0.75 s; the page 2% bigger by 0.15 s and speeding up; about
  3.3 s in all) and added: the ease out takes at least 0.7 of the ease in (on-screen speed, from its
  peak to the arrival against from the click to the peak), and the last 0.4 s grow under 2 px a
  frame. Revision 9 retimed them: the wall tips within 80 ms (the page
  over 1% bigger by then), past 10° by 0.1 s, past 45° by 0.2 s, down by 0.4 s; its push builds and
  fades over frames (no step of more than 0.01 rad in the per-frame change, peak under 0.04); the
  page 5% bigger by 0.1 s and speeding up; the last tenth of the destination's size takes at least
  30% of the move; about 1.6 s in all. Revision 8: the viewer and the destination share the way
  (each only forward, together they close it, the viewer's distance read back from the
  destination's size matches the viewer's own plan, a short way is the viewer's alone); the
  viewer moves in from the click (the page over 1.5% bigger by 0.15 s, its growth speeding up all
  the way until the wall lands, the viewer half a perspective through by then) and both ease out
  into the page; the push checked against it (the page over 3% bigger when the wall starts to tip,
  past 5° by 0.3 s, past 45° by 0.55 s, on desktop and phone). Revision 7 changed three: the push is checked against the
  launch (untouched until 0.25 s, past 5° by 0.45 s, past 45° by 0.65 s, on desktop and phone);
  the move launches like a rocket (moving from the start but under 1% closer by 0.3 s, the
  build-up accelerating, one speed peak on screen between 40% and 65% of its time, then slowing all
  the way, its last tenth at least 0.65 s); the world is the glowing white space by default (no
  shafts, only a dither), the mist and the hall on request. Revision 6 added: per screen (1440 × 900 and 390 × 844),
  the viewer pushes the wall over and never passes through it (untouched before contact, never
  behind the eye, the last touch before landing, down within 0.9 s, past 5° by 0.3 s, no jolt,
  a cushioned landing), timed the same on every screen; the move starts at once and eases out
  into the page (from rest, visibly moving by 0.1 s, one speed peak between 50% and 80% of its
  time, then slowing all the way, its last tenth at least 0.65 s); the cue sheet without `walk`.
  From earlier revisions, 25: projection matches CSS perspective; haze; lift lands
  at 0; the fall is slow then accelerating, lands at its planned time, meets the floor at under
  0.35 of its top speed, rebounds under 1°, never passes the floor, starts from rest; cubic-bezier and Hermite endpoints; the approach is smooth (no frame's change
  of speed beyond the plan's own) when ready, when the page is slow (hovers between 0.22 and 0.4
  of the screen) and when it becomes ready while braking; the interceptor's 15 rules; config
  precedence; the world (mist by default, the hall on request); the mist's light and glow on by
  default and tunable one knob at a time; walking to a still door gives the door exactly the
  depth (and look) of the door coming to you, and the walk only goes forward; the steps are still
  at the start, gone from 75% of the approach, never jump and stay under 4.05 px; the viewer
  walks by default and `?portal-camera` chooses; let go, the wall moves at once (no hang) and
  is about half way down at mid-fall; the cue sheet keeps the phases overlapping; the embedding
  policy.
- Browser checks (`tests/e2e/portal_e2e.py`): 56 pass. Revision 10 retimed them: the seep and the
  page visibly bigger by 0.2 s; tipping and over 15% bigger by 0.45 s; the wall gone by 1.1 s; the
  destination checks at 1.1 s; the line measured at 2.0 s (7 px of clear red, 3 soft); the still
  viewer checked at 1.2 s, after its wall has landed. The Ctrl-click check (left to the browser)
  timed out waiting for the new tab in more than one run here before passing: the known flake,
  more frequent than before; worth a longer wait or a retry in the test. Revision 9 retimed them: the seep and the
  page visibly bigger by 0.1 s; tipping and over 20% bigger by 0.25 s; falling further by 0.32 s;
  the wall gone by 0.55 s and staying gone; the destination checks at 0.55 s; the line measured at
  1.15 s (7 px of clear red, 3 soft). Revision 8: by 0.15 s the page is visibly
  bigger (over 0.8%) and not yet tipping; by 0.5 s it is tipping and over 20% bigger. Revision 7: light seeps in at the page's
  edges by 0.15 s while the viewer starts in, slowly (the page under 1% wider, not yet tipping);
  the wall pushed over by 0.5 s and gone by 1 s; the destination has risen a little off the floor
  as it comes; a glowing white space (no mist, no hall) with the light behind the portal; far
  away the portal is soft but not dissolved; two lights set off from opposite corners (their
  midpoint is the page's centre); the red line is thin and soft (measured 7 px of clear red, 4
  soft, peak redness 116); `?portal-world=mist` still gives the misty void and ends in the
  handoff. (The first checkpoints allow for the clock's two-frame start: "0.15 s" after the click
  is about 0.11 s on the transition's own clock.) Same origin (the demo's routing, the
  committed replay): nothing intercepted outside the Pocket; same-tab sticker links; the first
  frame equals the page (within 0.2% of pixels; measured 2 px of 1.3 M with the pointer on the
  sticker); the transition starts in the click; one overlay, one wall; a sandboxed
  viewport-size iframe; the viewer moves in at once (the page wider than the screen by 0.15 s);
  pushed by the viewer, the wall tips back about its bottom edge (its top 8% of the screen down
  by 0.45 s, its foot still at the bottom) and then falls away (its top 40 px lower by 0.6 s); by
  0.85 s it has passed beneath the viewer and is hidden; the live page never moves; the
  accessibility button stays visible and clickable on top; the misty void (two banks of mist, no
  hall) and the #e60000 frame revealed; far away the portal is soft and half lost in the fog;
  the destination stands on the floor like a door; the mist is lit by a light centred on the
  portal and far wider than it, and the fog glows (at least 10 levels of 255 brighter round the
  portal than in the screen's top corners at 1 s; 14 measured; the check was 15 at 1.5 s before
  Revision 6 moved it earlier, when the portal is further away; unlit fog measures −3); the destination
  grows every step; the lifecycle in order; handoff on arrival with the real
  page; flat, unscaled, sharp and out of the fog at the end, the mist and its light gone; the last frame equals the page after the real navigation (0 px differ); nothing left on
  the destination; Back returns to the open Pocket; back/forward-cache restore (the browser's
  `pageshow` event) removes the transition; the page is given back if the browser stays;
  Ctrl-click and middle click native; Enter starts it; extra clicks during a transition are
  ignored; Escape skips; CSP `frame-ancestors 'none'` and a 500 both give the preview; reduced
  motion navigates directly; phone 390 × 844 (the iframe is 390 × 844); Arabic; cross-origin
  (standalone server) gives the preview without trying a frame and still navigates;
  `?portal=off` restores new tabs; `?portal-world=hall` gives the hall and still hands off;
  `?portal-camera=still` keeps the viewer still (the fallen page stays where it fell, the
  destination floats toward them) and still hands off. No
  page errors.
- Existing suites with the portal in place (rerun for Revisions 6 to 10): `pocket_e2e.py` 119/119 (one
  check updated: sticker links are same-tab now), `arabic_e2e.py` 71/71, `aixc_e2e.py` 292/292.
  `vite build` succeeds.
- Frames reviewed by eye at 1440 × 900, 820 × 1180, 390 × 844, 844 × 390, Arabic, the preview
  path and a slow page; the misty void side by side with the owner's reference; the glowing mist
  layer by layer (fog, light, mist) at three distances; the walk over the fallen page frame by
  frame (no clipping or tearing as it leaves the screen); 60 fps step-captured videos of desktop
  and phone, checked frame by frame for pops and stalls (none); for Revision 6, strips every
  100 ms at 1440 × 900 and 390 × 844 (the zoom-in from the click, the push, the fall, the door
  emerging, the settle); for Revision 7, strips every 150 ms on both sizes and close-ups of the
  corners and the lights while the line is traced.
- **Flaky once:** in one of four runs of `portal_e2e.py` the Ctrl-click check timed out waiting
  for the browser's new tab (30 s); the next runs passed. Not caused by the portal (Ctrl-click
  is left to the browser); if it recurs, raise the wait or retry.

**Not verified:** real phones and GPUs (frame rate, memory of the painted hall at 2×); Safari and
Firefox (Chromium only; the cost of the soft-focus blur on a 3D layer in Safari is unknown, and
Safari has no `responseStatus`, so an error page could be shown in the portal); a real back/forward-cache restore (headless Chromium never restored one, even
for a plain two-page hop, so the browser's event was dispatched); the real Voice Guide SDK and
Vodafone's real accessibility widget (stand-ins only); live (not saved) destination pages in the
demo browser; screen readers; whether the steps, or the move starting on the click, cause motion
discomfort for anyone; whether people read the opening as pushing the wall; real users.
