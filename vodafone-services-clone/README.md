# AI Experience Composer (AIXC) — Phase 1

A local recreation of the [Vodafone Egypt Services page](https://web.vodafone.com.eg/en/services)
with an AI layer on top: pick a ready-made experience or describe one, and the **same content**
is recomposed. The Vodafone header, navigation and footer never change.

**Ready-made experiences** (one click, no API key, no AI call), all in Vodafone's palette, fonts
and components:

| Template | What it does | Adapted from |
|---|---|---|
| Streaming showcase | Cinematic VODAFONE logo intro that flies into the top bar, then a billboard and paged rows of services with hover-expanding cards and a preview modal | [Flix](https://codepen.io/Bahaa-Addin/pen/YayLbo) (the author's own pen, rebuilt) |
| Split slideshow | Each service fills a split screen; the halves slide past each other in opposite directions as you scroll while the big tracked title rises through its mask | [Split Slick Slideshow](https://codepen.io/supah/pen/zZaPeE) |
| Card fan | Numbered cards fan out on a diagonal (80% across, 20% down, 12° per card) and settle with the reference's snappy ease; drag, scroll, click or use the keys | [Carousel with drag and wheel](https://codepen.io/supah/pen/xxJMbbg) |
| Service ring | Outlined titles on a huge 3D ring seen from inside; scrolling turns it, red-tinted photo panels slide behind, fast scrolling stretches and blurs it | [Infinite February](https://codepen.io/cobra_winfrey/pen/podWgvv) |
| Hyper tunnel | Fly down a 3D tunnel: each category opens with giant outlined words, then glass service cards on a spiral; speed warps the view, streaks stars and splits the words red/white | [Hyper Scroll](https://codepen.io/aleksa-rakocevic/pen/pvbboZx) |
| Infinite canvas | Drag an endless, wrapping grid of services with momentum; open a card to zoom it on the reference's "hop" ease with the title rising word by word | [Infinite Draggable Image Gallery](https://codepen.io/filipz/pen/dPPyJZX) |
| Cover flow | Services flip past like album covers on a glossy floor, following the reference's pan/turn/lift timeline, looping round | [Infinite Cover Flow](https://codepen.io/jh3y/pen/WNRvqJP) |
| Spotlight cards | One service fills the stage; the next ones queue as cards; auto-advances with pause | [Timed Cards Opening](https://codepen.io/dilums/full/NWodZMd) |
| Scroll journey | Layered landscape (Vodafone mark as the sun) moves from day to night as chapters scroll by | [Parallax scroll animation](https://codepen.io/isladjan/pen/abdyPBw) |
| Gallery wall | Every service framed on an angled 3D wall you walk along by scrolling | [Infinite Gallery Hall](https://codepen.io/nassimberrada/pen/EayPjpM) |
| Flipbook | A book with a spread per category, pages turned in 3D, letter fly-in titles | [Pure CSS Magazine layout](https://codepen.io/jcoulterdesign/pen/oRRRPY) |
| Service cube | A 3D cube turns to one face per category as you read, with HUD and scene dots | [Six Faces](https://codepen.io/luis-lessrain/pen/ZYpyoRV) |
| Editorial magazine | Cover story, asymmetric spreads, service index | the Phase 1 brief |

The references were re-implemented natively (no GSAP, no Three.js, no jQuery or Slick, no Lenis,
none of their copy or images). Their own easings and timings were kept where they define the feel
(the split slideshow's `cubic-bezier(0.7, 0, 0.3, 1)` at 1000/950/900 ms, the fan's
`cubic-bezier(0, 0.02, 0, 1)`, the canvas's 0.075 drag ease, ×200 momentum and "hop" zoom, the cover
flow's power1/power4 timeline).

**Notes on the second set.**

- *Page friendly.* The references take over the whole window (wheel capture, `overflow: hidden`,
  scroll that loops forever). Here the scroll-driven ones pin a stage under the Vodafone header and
  step one service per stretch of page scroll, settling on the nearest, then let the page carry on to
  the app band and footer. Drag, click, prev/next and the arrow keys move them too.
- *Every service exactly once.* The infinite references repeat their tiles. The canvas wraps its
  tiles round instead (it only wraps when the grid is big enough that no tile could show twice), and
  the ring and cover flow loop visually while each service still exists once in the page.
- *Small source images.* The page's images are 150–510 px wide, so full-screen uses (split
  slideshow, ring panels) soften them in proportion to how far they are enlarged, and the Vodafone
  Cash illustration (`fit: contain`) becomes a white mark on Vodafone red.
- *Colours.* The references' purples and cyans became Vodafone red `#e60000`, dark red `#990000`
  and ink `#14141e`; the tunnel's red/cyan split is red/white. Type is Vodafone Regular, Bold and Light.
- *Accessibility.* Only the shown service's links are reachable in the slideshows; tabbing to a
  tunnel card flies to it and tabbing on the canvas glides each card to the centre; the canvas
  detail is a native `<dialog>` that returns focus. Under reduced motion transitions stop, the ring
  and cover flow move a whole service at a time, and the tunnel is laid flat as a grid.

**Streaming showcase notes.** The original pen animated `font-size` and a 100-layer `text-shadow`
(full repaints every frame), had an invalid keyframe and never landed the logo in the header. The
rebuild keeps its Roboto wordmark and intent (white extruded logo, flash to red, push toward the
camera, settle into the header) but animates only `transform` and `opacity` with the Web
Animations API; the extruded shadow and the red glow are pre-rendered layers whose opacity fades.
The logo is a single lockup: the Vodafone speech mark (the same paths as the header sprite) sits
left of the word, and every intro layer carries both, so they push, turn red and fly into the header
as one element. During the white phase the mark is inverted and extruded with the letters (a swept
disc with the same shadow gradient); once the word turns red it is the true red mark.
The landing is measured after fonts load, so the logo ends exactly on its slot (tested to <1px).
**Skip intro** ends it; reduced motion skips it. Roboto 900 loads from Google Fonts like the pen
did, and falls back to a heavy system sans offline. Colours stay Vodafone: the canvas is
Vodafone ink `#14141e` and the accent Vodafone red `#e60000`, which are within a shade of the
streaming palette (`#141414`, `#e50914`).

```
local Vodafone page → prompt → Gemini composition JSON → validation → DOM rendering → magazine view
```

Plain HTML, CSS and browser JavaScript (ES modules). No UI framework.

---

## Run it

**With Vite (the project's existing workflow)**

```bash
npm install
npm run dev          # http://localhost:5173
```

**Without installing anything** (Node 18+ only; same URLs as Vite)

```bash
npm run serve        # or: node scripts/serve.mjs --port 5173
```

Then open the page, choose **Reimagine this page** (top-right, under the header), and click a ready-made experience or type a prompt.
Or click **Pocket it** on any card (see [Pocket](#pocket-peel-it-off-keep-it-turn-the-page)).

**Tests**

```bash
npm test             # validator, content model and template unit tests (Node built-in runner)

# Optional browser checks (292 checks across all experiences; Gemini is mocked, no key needed):
pip install playwright && python -m playwright install chromium
npm run serve -- --port 5200 &
python tests/e2e/aixc_e2e.py http://127.0.0.1:5200/
python tests/e2e/pocket_e2e.py http://127.0.0.1:5200/   # Pocket and its actors: 204 checks
python tests/e2e/tips_e2e.py http://127.0.0.1:5200/     # Tips, the walkthrough: 87 checks
```

---

## Gemini configuration

Without a key the app still works: the ready-made experiences never need one, a typed prompt that
names one ("make it a flip book") is matched to it locally, and any other prompt gets the
**built-in magazine layout**. The view bar always says which happened ("Ready-made template, no AI
call" / "Built-in layout, not AI-generated" / "Composed by Gemini"). With a key, typed prompts go to
Gemini, which can pick any of the six experiences. To add a key:

1. **In the app**: Reimagine this page → **Gemini settings** → paste the key → *Save settings*.
   By default it lives in memory for this tab only; tick *Remember the key in this browser* to keep
   it in `localStorage`.
2. **For local Vite dev**: create `.env.local` (already git-ignored by `*.local`):

   ```
   VITE_GEMINI_API_KEY=your-test-key
   VITE_GEMINI_MODEL=gemini-3.8-flash   # optional
   ```

The default model is `gemini-3.8-flash`, called through `generateContent` with JSON structured
output (`responseMimeType` + `responseSchema`). The model can be changed in the settings panel.

> **API key warning.** This is a browser-only prototype. Any key used here is visible to anyone who
> can open the page (devtools, network tab, `localStorage`, or a Vite build that inlines
> `.env.local`). Use a restricted, low-quota test key, never commit a real key, and do not deploy
> this publicly. A shared or production deployment needs a server-side proxy that holds the key.

---

## Using it (demo script)

1. Open the page in its familiar original view. Header and footer are the protected shell.
2. **Reimagine this page** → click **Spotlight cards**. Same services, links and copy, new experience.
3. **Change experience** → try **Flipbook**, **Gallery wall**, **Service cube**, **Scroll journey**.
4. **Original** shows the source presentation; **Reimagined** returns to the last experience;
   **Reset** clears the transformation. None of this calls Gemini.
5. With a key: **Change experience** → type *"Turn this into a bold editorial magazine, with a
   dramatic cover and distinct sections for each category. Keep every service, description and
   link."* → Gemini composes it; then *"Make the layout more compact, but do not remove content."*

Add `?aixc-debug` to the URL to log schemas, validator warnings and stats to the console and
expose `window.__aixc`.

---

## Architecture

```
index.html                       shell entry; links the three stylesheets
src/
  main.js                        bootstrap: shell → adapter → composer
  shell.js                       PROTECTED header, nav, footer, icon sprite; empty <main> regions
  style.css                      original page styles (captured from the live site)
  content/vodafone-services.js   normalized content model: single source of truth for both views
  adapters/vodafone-services.js  page adapter: original-view rendering + content extraction
  aixc/
    page-adapters.js             adapter registry + contract
    content-index.js             model normalization, lookup index, Gemini payload builder
    schema-validator.js          allowlist validation + completeness repair
    fallback-schema.js           deterministic built-in magazine composition
    gemini-client.js             generateContent request/response, error classification
    templates.js                 ready-made experiences: prompt, icon, local schema builder, keyword match
    experience-renderer.js       experience registry + mount/unmount lifecycle
    experiences/magazine.js      9 primitives → DOM (createElement/textContent only)
    experiences/magazine.css     magazine styles, all scoped under .aixc-magazine
    experiences/shared.js        shared Vodafone building blocks for the template experiences
    experiences/vodafone.css     Vodafone tokens + shared components, scoped under .aixc-vx
    experiences/{streaming,split,fan,ring,tunnel,canvas,coverflow,spotlight,journey,gallery,flipbook,cube}.{js,css}
                                 one plugin each
    controller.js                state, launcher, composer, view bar, cache, fallbacks
    aixc.css                     composer/launcher/view-bar styles (all .aixc- prefixed)
    dom.js                       tiny DOM builder with attribute + URL allowlists
scripts/serve.mjs                zero-dependency static server (mirrors Vite's /public layout)
tests/                           unit tests (node:test) and optional Playwright e2e
```

**Page regions.** `<main>` holds `#source-content` (original view) and `#experience-output`
(magazine) as siblings. Transforming only toggles which one is visible; the shell is never
touched, and the hidden region is removed from the accessibility tree and tab order.

**Content model vs schema.** The model (`src/content/…`) holds every title, description, image
and link. Gemini sees only ids, titles and clipped descriptions (no URLs, no HTML, no shell
content) and returns a *composition schema* that references item ids:

```json
{
  "version": 1, "experience": "magazine", "theme": "vodafone-editorial",
  "density": "balanced", "scope": "all", "unsupportedRequest": false,
  "sections": [
    { "id": "cover", "type": "hero", "itemIds": ["vodafone-cash"] },
    { "id": "fun", "type": "editorial-grid", "title": "Great Entertainment", "itemIds": ["mo-salah-world", "…"] },
    { "id": "close", "type": "closing-promotion", "itemIds": ["ana-vodafone-app"] }
  ]
}
```

**Experiences:** `magazine`, `streaming`, `spotlight`, `journey`, `gallery`, `flipbook`, `cube`.

**Section types:** the magazine uses `hero`, `feature`, `editorial-grid`, `split-spread`, `shelf`,
`callout`, `section-heading`, `service-list`; every other experience takes ordered `group`
sections and decides the visuals itself. All end with `closing-promotion`.

**Templates** build their schema locally (one `group` per source category) and still pass through
the validator, so they get the same completeness guarantee as AI output.

**Lifecycle.** Experiences start timers and scroll listeners in `mount()` and stop them in
`unmount()`; the controller calls these when the view is shown, hidden, replaced or reset, so
nothing runs while the Original view is on screen.

**What the validator enforces** (`schema-validator.js`, covered by `npm test`):

- known experience, theme, density and primitive names only; unknown fields dropped;
  unknown primitives degrade to `service-list`
- unknown and duplicate item ids dropped; size limits on sections, items and strings
- exactly one cover, placed first; the app promotion only in `closing-promotion`, placed last
- **completeness**: anything the model left out is re-inserted next to its source siblings and
  the user is told ("N items left out by the layout were added back")
- filtering is honoured only if the schema says `scope: "filtered"` **and** the prompt plainly asks
  to show fewer items ("only…", "hide…"); a filtered view says so and Original shows everything
- the schema's `description` is accepted but never rendered; section titles are capped at 60
  characters, marked `data-aixc-authored`, and always shown with the real source section name

**Failure handling.** Missing key → built-in layout. Network, quota, auth, model, timeout,
blocked or invalid output → if a valid layout is already showing it stays and a short message
explains why; otherwise the built-in layout is shown with the reason. Requests are sequenced, so a
cancelled or superseded response can never replace a newer one. If you switch to Original while a
request runs, the result is saved under Reimagined instead of switching you away.

---

## Extending

**Add a page.** Create `src/content/<page>.js` (same model shape) and
`src/adapters/<page>.js` implementing `{ pageId, label, renderOriginal(root), extractContent(root) }`,
register it in `src/aixc/page-adapters.js`, and set `<body data-page="<pageId>">`. Renderers,
validator and Gemini client need no changes.

**Add an experience.** Write `src/aixc/experiences/<name>.js` exporting
`render(schema, index) → { element, mount?, unmount? }` (use `shared.js` for Vodafone blocks), add
its stylesheet scoped under `.aixc-vx--<name>` and link it in `index.html`, register it in
`experience-renderer.js`, add the name to `EXPERIENCES` (validator) and a line to
`EXPERIENCE_GUIDE` (Gemini client). To offer it as a one-click template, add an entry to
`TEMPLATES` in `templates.js`.

---

## Pocket: peel it off, keep it, turn the page

Every service card has a **Pocket it** chip. Pocketing a service is one animation family,
all driven by a single page-curl engine modelled on the Apple Books page turn:

1. **Sticker peel.** Hovering the chip lifts the card's corner. Clicking peels the card off
   from that corner like a sticker, all the way: the peel folds back to halfway, then keeps
   going while the peeled part is pulled up off the page until the far corner lets go. The
   freed sticker rises over its slot and is thrown into the pocket, relaxing in the air so its
   face shows. A liner stays behind with **Put back**, which plays the very same journey in
   reverse: out of the pocket, over the slot, stuck down from the far corner back to the first.
   Long cards peel along their length, like a label, and droop rather than standing up tall.
2. **Peeking corner.** While anything is pocketed, the page's bottom-right corner sits
   half-turned. The gap under it shows the pocket, with a floating pocket button and a count.
   Hovering or focusing the button turns the corner a little further.
3. **Page turn.** The button turns the whole page away from that corner, the same curl at page
   scale with the content faintly showing through the back of the paper, to reveal **Your
   pocket**: a sticker album of everything peeled off, with each service's real title, copy
   and link. Stickers can be removed (they peel off the album). **Back to Services** (or Esc)
   turns the page back to exactly where you were.

The pocket is remembered in this browser (`localStorage`, key `aixc.pocket.v1`). It works in
the Original view and over any reimagined experience. The bottom-right corner belongs to the
pocket; **Reimagine this page** sits top-right under the header and opens its panel from there.

**Demo script.** Pocket *Calls services*, *Roaming Services* and *Play&Win* → hover the corner
button → click it → remove one sticker → *Back to Services* → *Put back* on a liner.

**The mascot and the drone** (`src/pocket/pocket-actors.js`, details in
[docs/pocket-actors.md](docs/pocket-actors.md)) are 3D models drawn as SVG every frame, moved by
physics (springs, a hoverboard and a drone that fly) rather than fixed curves, so they turn,
lean and bank freely. Their direction is a "live stage" ([ADR-0002](docs/adr/0002-pocket-actors-live-stage.md),
superseding the quiet stage of [ADR-0001](docs/adr/0001-pocket-actors-quiet-stage.md)), and the
mascot flies the drone ([ADR-0003](docs/adr/0003-pocket-actors-mascot-pilots-the-drone.md))
from a hoverboard ([ADR-0004](docs/adr/0004-pocket-actors-mascot-rides-a-hoverboard.md)).
- **The mascot** is a Vodafone-red flame that hides behind the pocket button (inside the page
  curl, so the button and the lifted paper cover it). Every time you pocket something it rises
  straight up from behind the button, takes hold of its rim and pulls the pocket open; the item
  drops in, the button snaps shut, the count goes up and it sinks straight back down behind it.
  When the page turns it rides its hoverboard in from the corner to stand under the drone. Both stand on the album's
  content margin: their right edges line up with the cards and "Empty pocket". In the album it breathes and shifts its weight, its body turns toward your cards while
  its modelled eye follows your cursor, and left alone for a minute it dozes off.
- **It rides a hoverboard** in the album (phones too): a floating Vodafone-red board with an
  upturned nose and glowing pads that flies like the drone. Riding in, the board banks into the move and wobbles as it
  brakes while the mascot leans and holds its arms out; then it hovers, bobbing, drifting and
  swaying on all six axes. It sets the board down to doze and lifts it when it wakes.
- **It flies the drone.** In the album it holds an RC remote in both hands. Its thumbs move the
  sticks and the drone answers a moment later. It watches the drone while the drone does
  something, and your cursor otherwise. When the pocket opens, the drone takes off from the floor
  beside it. Before it dozes it lands the drone there again, and flies it back up when it wakes.
- **The drone** hovers round its place, drifting gently on all six axes and banking into its
  moves. Move the cursor slowly in the open space and it comes over to keep it company; the
  first click makes it draw a small heart, later clicks a hop. It can be dragged and always
  comes home. Phones get no drone.
- **The cursor** on the Pocket page (mouse or trackpad) becomes a small red light: cards near it
  lean toward it and catch a sheen, a click sends a ring of light that makes the mascot flinch
  and shoves the drone aside, and the characters' highlights and shadows follow the light.
- **They stay out of the way.** They never delay saving, opening or closing, never cover
  controls or cards, and keep their movement small. With reduced motion they appear as calm
  still poses and the cursor stays normal.
- **No dependencies.** There is no library: just a small 3D kit, procedural models and SVG decal
  sheets traced from the reference art. This version adds about 8 KB gzip to the production
  build compared with `integration/main` (measured with `vite build`).

**How the curl works** (`src/pocket/curl.js`). The sheet wraps around a cylinder whose axis sits
`x` px from the peeled corner. The flat part, the back half of the roll (sliced into strips and
shaded by their angle), the flipped-over part (mirrored, lifted to 2R, see-through optional) and
what the curl uncovers are each a clipped "window" holding a counter-transformed snapshot of the
front. The peeled part leaves the roll at a lift angle: π folds it flat back over the sheet
(the page turn), smaller angles lift it off the surface (a sticker pulled up by hand). Each
frame only rewrites `matrix3d` transforms, so nothing is re-rasterised. The front is
a static DOM clone (a card, or the whole page at its scroll position), so the live page is never
modified mid-animation. Honours `prefers-reduced-motion` (no curl; immediate state changes).

```
src/pocket/
  curl.js     page-curl engine: createCurl({ width, height, front, under, back }) → update({ x, phi, R, angle })
  pocket.js   chips, liners, sticker flight, peeking corner, page turn, pocket album, persistence
  pocket.css  all .pocket- / .curl- styles, Vodafone tokens only
  pocket-actors.js   the mascot and drone: rigs, physics loops, layout, input, lifecycle (called by pocket.js)
  pocket-actors.css  .pocket-actor- / .pocket-mascot- / .pocket-drone- styles (and the held-open button)
  pocket-cursor.js   the cursor on the Pocket page: the light, the cards' lean, ripples
  pocket-cursor.css  .pocket-cursor / .pocket-light / .pocket-ripple styles
  actors/            state machines (mascot-brain, drone-brain), 3D kit (space), 3D models
                     (mascot-model, drone-model), SVG renderer, motion (physics, gait, drone-flight,
                     clips), flight geometry (motion), timing, cleanup scope; assets/ holds the decal
                     sheets and manifest.json
tests/
  pocket-curl.test.mjs     curl geometry (npm test)
  pocket-actors.test.mjs   actor states, physics, the ride, flight, the modelled eye, 3D projection, assets (npm test)
  e2e/pocket_e2e.py        204 browser checks: every flow, keyboard, reduced motion, mobile, persistence,
                           and the actors (occlusion, the catch, the reveal, quiet reading, drone, 7 viewports)
```

**Implementation notes for a production build.** Clones are made from the rendered DOM, so
anything a clone cannot reproduce (a playing video, a canvas) would freeze in the turning page.
Pocketing is local to the browser; a real version would link each sticker to a product ID and
an account so the pocket follows the customer across devices.

### Your journey (with the Voice Guide)

When the Voice Guide's Exploration Trail runs on this page (`npm run demo:trail` in
`../voice-guide`, which mounts this clone at `/en/services` among the saved Vodafone pages), the
person's journey lives in the Pocket (voice-guide ADR-0040). `index.html` declares the page a host
(`<meta name="vg-trail-host" content="pocket">`) and `src/pocket/journey.js` draws it:

- **Your journey** beside *Back to Services*, and a slim slider under the bar: one album dot per
  page visited, a red thread behind you. Dragging, touch and keys scrub the memory.
- Pressing either lays a lightly frosted layer over the album (stickers stay visible under it).
  The memory of the page, *You explored* and the question chips float in one after another
  (nothing moves under reduced motion). A chip turns the page back and asks the guide.
- `src/main.js` marks each section with the knowledge-base destination it recreates
  (`data-vg-destination`), so the guide can explore, spotlight and answer on this copy.

The trail does the recording, storage, sandboxed replay and wording; this file only draws and
forwards intents. Without the guide on the page, nothing of the journey appears.

---

## Tips: the walkthrough of the four demos

An onboarding in the manner of Apple's Tips app (voice-guide ADR-0045): a **Tips** button at the
bottom-left opens a collection that pages sideways, a cover, two tips for each demo (voice guide,
Pocket, Reimagine this page, Your journey) and a closing card.

- **Each tip loops a short animation** of the gesture on a small copy of this page: the page's own
  services, pictures and section titles, the template names and icons, the journey's own consent
  words, three of the guide's verified journey questions and a spoken example from the router's
  tuning set. A page the clone does not have (internet bundles) is drawn as grey blocks.
- **Try it** hands over to a coach mark on the real control (a "Pocket it" chip, the Pocket
  corner, the Reimagine launcher and a template, the guide's microphone, "Your journey"). It waits
  for you to press it; nothing is pressed for you. When the guide is not on the page its two tips
  say so instead of offering Try it.
- **Never in the way.** The button is on the one free edge and steps aside in the Reimagine view
  and the open Pocket; the scrims keep a hole for Vodafone's accessibility button; the trail never
  records the tips (`data-vg`). A first visit gets a small invitation above the button, not a
  modal; a browser driven by automation gets none. `?tips=open`, `?tips=invite`, `?tips=off`.
- Phones get a bottom sheet (swipe sideways, drag down to close); Arabic pages right to left;
  reduced motion stops each scene on a still frame. Only the button loads with the page; the rest
  loads the first time the tips open.

```
src/tips/
  entry.js / entry.css   the button and the invitation (loaded with the page)
  tips.js / tips.css     the collection: sheet, paging, parallax, closing card (on demand)
  scenes.js              the nine animated scenes (Web Animations API on a 400×250 canvas)
  coach.js               "Try it": TipKit-style popovers, the scrim with holes, the four flows
  catalog.js             the cards, the rules and the saved state (pure, unit-tested)
  geometry.js            popover placement and the scrim's shape (pure, unit-tested)
  icons.js               the demos' own icons
tests/tips.test.mjs      order, rules, state, geometry, every string in Arabic (npm test)
tests/e2e/tips_e2e.py    87 browser checks
```

Add `?aixc-debug` to get `window.__aixcTips` (`open`, `hold(card, ms)` to stop a scene at a moment).

---

## Your RED world: the personal layer under the Pocket (demo 5)

A personalization and contextual-benefits layer that lies **beneath** the Pocket album, rebuilt
from the reference recording of the Vodafone app's *My Lines* and *Benefits* screens. It is not a
drawer or a modal: it is a second part of the same page, found at the album's end.

1. **Discovery.** Reaching the end of the album (≥60% of its last band in view) raises a Dock
   from under the page: a frosted bar of the world's categories (*Explore by category* and
   *RED Lifestyle*; eight, less any the customer cannot have, so no icon opens an empty
   spotlight), after the pen [Mac Dock Magnify](https://codepen.io/ghaste/pen/bGxWVOm). As in
   the macOS Dock, the icon under a mouse pointer and its neighbours magnify (1.6 · 1.35 · 1.15 ·
   1.05, small enough never to widen the page) and push the others aside, but they grow
   **downward**, toward the world beneath, with the name under the icon; at the bottom edge the page
   first glides down just enough to make room. Fingers never magnify (the last pointer's type
   decides, so touch laptops behave), and a tap that wobbles is still a tap: a pull needs 14px of
   mostly vertical travel. An icon opens the world with its category in the spotlight; arrow keys
   move along the Dock (one tab stop). The cursor drifting to the bottom edge lifts the Dock a
   touch. Scrolling never opens it.
2. **The push.** An icon, Enter, or pulling the Dock up (it follows the finger; let go past a
   quarter, or flick) pushes the Pocket page **up**: one progress value drives a programmatic
   scroll (the album rises) and a transform on the world (it comes up from the bottom edge), in
   one frame loop. The world joins the page's flow (inside `#pocket-output`, before the footer);
   the document keeps owning the scroll, so there is no nested scroller.
3. **The peek, and the swap.** It stops partway: the album above, then the *well* (the widget's
   room, with the Dock under it), then the world's rounded top with the RED hero. The Dock and the
   widget swap places in the same move: the widget materialises right under the album, where the
   Dock was, while the Dock first rides with the album and then glides down under the widget, just
   above the sheet, where it now chooses what the spotlight shows. Closing glides it back. Phones
   get a nudge of the handle; pointers get "See everything for you", once.
4. **The status widget** materialises out of that light (scale, blur, opacity, then the metrics 60ms
   apart, the bars, one sweep of light): minutes, SMS, mobile internet, home internet (DSL), the
   bill, RED Points and family. It is its own layer: docked in the well while it peeks (in flow,
   so it scrolls natively), then a compact floating pill once its place has scrolled away (it
   expands into the full card). The bill opens its details, usage opens the plan, and points and
   family bring their topic into the spotlight. Its presses never reach the sheet's drag.
5. **Expanded.** Scrolling, the handle, "See everything" or dragging the handle up: the bar sticks
   under the site header ("Back to pocket · RED Benefits · Why these?").
6. **The return.** *Back to pocket*, Esc, or dragging the handle down. From deep in the world the
   page first jumps invisibly (the sheet is shifted by the same amount and clipped at the header),
   so only a screen's worth slides away; the scroll lands **exactly** where the album was. The
   footer is handed over by an inert stand-in, so it never pops. Closing the Pocket resets it all.

**The sheet: one topic at a time.** Under the hero, the sheet's first section is a **spotlight**
that shows one topic, and a compact bento under it (*More for you*) offers the others as small
tiles: a name, one line ("2 perks not switched on", "EGP 300 due in 3 days") and, on the wide
tiles, why it is there. Tiles have no buttons of their own; pressing one brings it into the
spotlight. Choosing a topic (a Dock icon, a tile, the widget's points or family) condenses the hero
to a slim band about the bar's height ("Your RED Benefits" and the claimed count), swaps the
spotlight's content in place (it slides in from the side of its Dock icon while the height
morphs), re-lays the bento, and settles the page with the Dock under the header, so the Dock, the
band and the spotlight are in view together. A pull or a plain open shows the full hero and the
customer's best topic. The bento shows the best seven, then *Show all*; the best tiles take two
columns, as few as it takes for every row to close (two columns on phones, four from 720px;
`bentoSpans()` in `topics.js`).

**The topics** (`topics.js`, all from the reference): *Waiting for you* (included perks not switched
on, + to activate); the Dock's eight categories: Lifestyle (*Ready when you are*: Talabat Pro, QANZ
Card, BeFit, roaming; "Claim your exclusive benefits!" with partner wordmarks), Home Connectivity
(50 GB free), Entertainment (4/6 spots), Roaming, RED Experience (Amr Diab · RED Members Only Night),
RED Fitness, RED Food & Groceries, RED Shopping (*Discover your favourite brands*: vouchers in every
state); and Family, the bill (*Latest*), RED Coffee (map and places), RED Installments (0% · 0 EGP ·
0 EGP), RED Points and the RED Elite+ upgrade. Each is ranked by its best item's score. Phones
follow the recording (white panel over the RED hero, two-up perks, carousels that peek); from
1100px the spotlight and the bento are white cards over the hero.

**The engine** (`engine.js`) is a deterministic stand-in for a recommendation service, and says
so. Each rule is a small pure function with a reason a card can show: an included benefit not
switched on, free family or entertainment spots, a voucher about to expire, an interest with a
real signal, an allowance under a fifth, a trip coming up, an outgrown plan; settled items stay,
lower down. Topics are ranked by their best item, so customers open on a different spotlight and
see the bento in a different order. **Why these?** lists what it noticed.
A real backend can replace `personalize(profile, { now })` if it returns the same shape.

**Try it.** Pocket two or three services, open the Pocket, scroll to the end, hover the Dock and
press an icon (or pull the Dock up). Press other icons and tiles to change the spotlight. Press
**+** on Entertainment (the counter, the widget and the tiles follow), invite family twice (both
spots taken: the Elite+ upgrade rises with "All 2 family spots are taken"), open a ZARA voucher
from RED Shopping, press a metric in the floating pill, and go *Back to pocket*. Other customers: `?pz=mariam`
(RED Elite+, a family of four, no home internet) and `?pz=karim` (3 GB of data left, flying to
Dubai in nine days: roaming leads, the upgrade rises). `?pz=off` removes the layer; `?aixc-debug`
exposes `window.__pz` (`store`, `extension`, `widget`). What a customer claims is remembered in
this browser (`aixc.pz.v1`); *Why these? → Reset this demo* forgets it.

**Artwork.** Everything is drawn for this project as SVG (clay category icons, the perk and
partner scenes, the RED Points cards, the Elite+ avatars, the map) or comes from this clone's own
pictures (the roaming traveller, the Amr Diab concert photo). Partners appear as typographic
wordmarks, never as copies of their logos or campaign photography; a catalogue item's `image`
field takes a real partner picture instead.

```
src/personalization/
  index.js          wiring; loads the world when the album's end comes into view
  extension.js      the Dock (and its move into the well), the push and the return, the drag,
                    the scroll tracking, the spotlight's resting place
  status-widget.js  the account at a glance: docked and floating presentations
  data.js           plans, partners, the catalogue and three demo customers (pure data)
  engine.js         the rules, the ranking, the widget's metrics (pure)
  store.js          what this browser activated, claimed, invited, redeemed (aixc.pz.v1)
  topics.js         the spotlight's topics, their ranking, hooks and the bento's spans (pure)
  world.js          the hero, the spotlight and the bento, actions, detail sheets, toast (on demand)
  components.js     one data-driven builder per section, the topic tiles
  art.js · icons.js the artwork and the 24px icons
  motion.js         the easing curves, the scroll guard, the glide
  extension.css · status-widget.css   (with the page)    world.css   (on demand)
tests/personalization.test.mjs   data, every rule on its own, ranking, widget, store, topics, bento (npm test)
```

**Known limitations.** English page only for now (the Arabic page shows the Pocket as before);
the data is a demonstration set; partner offers, codes and the map are illustrative; "Directions"
and "Pay" only change this page.

---

## The Arabic page (`/ar/`)

`ar/index.html` is the [Arabic Services page](https://web.vodafone.com.eg/ar/services), captured on 2026-11-05: the same app, sections, items, ids and pictures as the English page, with Vodafone's Arabic copy and links (`src/content/vodafone-services-ar.js`), right to left. Open http://127.0.0.1:5173/ar/ (`npm run dev` or `node scripts/serve.mjs`). In the voice-guide demo it is mounted at `/ar/services`, and after Arabic pages the journey opens in its Pocket (voice-guide ADR-0043).

- **Same pictures.** Every picture on the Arabic page was compared with the English clone's file and is pixel-identical, so they are shared.
- **Vodafone's Arabic faces.** `src/rtl.css` registers `vodafone-*-ar.woff` (GE SS Two) under the English family names with an Arabic `unicode-range`, as the live site splits its fonts.
- **The clone's own copy** (Pocket, Reimagine, carousel labels) is in `src/i18n.js`, keyed by the English text, so the English page does not change.
- **Kept as published:** source typos ("معلوات", "ڤودافو", "تسمتع", "الدوليتواصل"), mixed spellings, "VF Play" and "Scan QR CODE & Download" in Latin. The Shokran carousel keeps the Arabic order (عالنوتة before كلمنى).
- **Normalised links:** "خدمة الميني كول" links to /spa/roaming on the live page (→ /ar/mini-call); "عالم ماما" links to a vf-live URL with unfilled placeholders (→ the Ana Vodafone flow, as in English).
- **Not translated yet:** each experience's own microcopy (15–45 words each: screen-reader labels such as "Next", and a few visible hints such as "Scroll" or "Skip intro"), and Gemini's error texts.
- **As on the English page:** on the small red "اتحكم في حسابك" cards the Pocket button sits over part of the title, and the hero banner has no title.
- Checks: `tests/content-ar.test.mjs`, `tests/e2e/arabic_e2e.py` (71 checks).

## VoiceTut experiment (`?demo=voicetut`)

Off unless the URL asks for it. With `?demo=voicetut`, each service section gets a **Read this section** button and a small **VoiceTut** tab sits bottom-left; it reads text aloud in Egyptian Arabic and English with a hosted speech model. Only text a person submits is sent. On 2026-11-05 neither backend was live (the public Space was paused; Modal not activated), so the panel says it could not connect. Details, licences (CC-BY-NC weights) and benchmarks: [`../experiments/voicetut/README.md`](../experiments/voicetut/README.md). Checks: `tests/voicetut*.test.mjs`.

## Known limitations and source notes

- **The Pocket corner tucks in during the Reimagine view (voice-guide ADR-0044).** The bottom-right corner belongs to the experience there: no curl or mascot, and the Pocket button sits in the right-hand column under the accessibility button, which stays lifted with the microphone even when nothing is pocketed. Back on the original view the corner peeks as before.
- **The view bar and the guide's pill.** With the Voice Guide's trail on the page, the view bar keeps its end free for the "Your journey" pill (`aixc.css`, voice-guide B-23).
- **Gemini has not been called live from this build.** The request format, headers and response
  parsing were tested against a mocked endpoint (292 browser checks). Verify with a real key before
  a demo; if the chosen model rejects `responseSchema`, the client retries once in plain JSON mode.
- **Content capture.** Text and images were captured on 2026-04-21; links and the hero heading
  were re-checked against the live page on 2026-10-19. The live site may have changed since.
- **Kept exactly as published:** typos and slug-like titles ("International standarad rates",
  "visa-appointment", "park-your-line", "Vodafone-advertising"), odd spacing ("line , your").
- **Source anomalies:** the live "Stay In Control" markup has a 5th card that repeats the
  "Balance transfer" title and links to Shokran services — not modelled. The live "Edfa3ly Shokran"
  link is malformed (`web.vodafone.com.egen/…`) and is normalised to its siblings' URL.
- **No link in source:** Great Entertainment cards only have a "Subscribe now" label, so it is shown
  as text rather than a link; the section's "Download Ana Vodafone App" link is kept.
- **External links** go to the live Vodafone site and open in a new tab; they are demo navigation.
- **Header/footer links** are `#` placeholders, as in the original clone.
- **Images** are the small originals (200–510 px wide). The magazine caps upscaling at ~1.6× and
  uses matted frames instead of full-bleed crops; a designed fallback replaces any image that fails.
- **Template adaptations.** Each reference was rebuilt around page context: the experiences sit
  between the sticky Vodafone header and footer, use native page scroll (no wheel hijacking) and
  honour reduced motion. The gallery walk has a start and an end instead of wrapping infinitely,
  the cube maps Vodafone's six categories to its six faces, and the parallax scene is drawn in
  Vodafone reds with the Vodafone mark as the sun. Small source images are matted, blurred or
  mosaicked rather than stretched full-bleed.
- **Spotlight auto-advance** pauses on hover, focus, a hidden tab, or the pause button, and is off
  under reduced motion.
- **Original view changes** (to make it complete and accessible): real links on cards, a visually
  hidden `h1`, working Shokran / other-services carousels (previously only the first 3 cards were
  reachable), and a fix for the header overflowing the viewport below ~420 px.
