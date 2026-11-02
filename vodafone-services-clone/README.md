# AI Experience Composer (AIXC) — Phase 1

A local recreation of the [Vodafone Egypt Services page](https://web.vodafone.com.eg/en/services)
with an AI layer on top: pick a ready-made experience or describe one, and the **same content**
is recomposed. The Vodafone header, navigation and footer never change.

**Ready-made experiences** (one click, no API key, no AI call), all in Vodafone's palette, fonts
and components:

| Template | What it does | Adapted from |
|---|---|---|
| Spotlight cards | One service fills the stage; the next ones queue as cards; auto-advances with pause | [Timed Cards Opening](https://codepen.io/dilums/full/NWodZMd) |
| Scroll journey | Layered landscape (Vodafone mark as the sun) moves from day to night as chapters scroll by | [Parallax scroll animation](https://codepen.io/isladjan/pen/abdyPBw) |
| Gallery wall | Every service framed on an angled 3D wall you walk along by scrolling | [Infinite Gallery Hall](https://codepen.io/nassimberrada/pen/EayPjpM) |
| Flipbook | A book with a spread per category, pages turned in 3D, letter fly-in titles | [Pure CSS Magazine layout](https://codepen.io/jcoulterdesign/pen/oRRRPY) |
| Service cube | A 3D cube turns to one face per category as you read, with HUD and scene dots | [Six Faces](https://codepen.io/luis-lessrain/pen/ZYpyoRV) |
| Editorial magazine | Cover story, asymmetric spreads, service index | the Phase 1 brief |

The references were re-implemented natively (no GSAP, no Three.js, none of their copy or images).

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

# Optional browser checks (163 checks across all experiences; Gemini is mocked, no key needed):
pip install playwright && python -m playwright install chromium
npm run serve -- --port 5200 &
python tests/e2e/aixc_e2e.py http://127.0.0.1:5200/
python tests/e2e/pocket_e2e.py http://127.0.0.1:5200/   # Pocket and its actors: 119 checks
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
    experiences/{spotlight,journey,gallery,flipbook,cube}.{js,css}   one plugin each
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

**Experiences:** `magazine`, `spotlight`, `journey`, `gallery`, `flipbook`, `cube`.

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
[docs/pocket-actors.md](docs/pocket-actors.md)). A Vodafone-red mascot lives *under* the page
curl. It sits in the curl's `under` layer, so the lifted paper really covers it. Pocketing an
item makes it peek out from under the curl, wave and duck back. When the page turns it gets
caught at about 60% of the turn and sprints to the opposite corner, where it lives: its eye
follows the pointer, it jumps when you hover a card, and if left alone it gets impatient, eats
an apple and falls asleep until you move. A small red drone draws a dashed heart once per
opening, dodges the pointer and can be dragged (it always springs home). Both are decoration:
they never delay saving, opening or closing, never cover controls or cards (the mascot sits
lower or tucks away when content reaches its corner), and with reduced motion they appear as a
calm still pose. The assets are hand-drawn layered SVG rigs, traced from the reference art, with
a manifest (`src/pocket/actors/assets/`). There are no new dependencies, and the build grows by
about 19 KB gzip.

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
  pocket-actors.js   the mascot and drone: rigs, clips, layout, input, lifecycle (called by pocket.js)
  pocket-actors.css  .pocket-actor- / .pocket-mascot- / .pocket-drone- styles
  actors/            state machines (mascot-brain, drone-brain), clips, motion geometry, timing,
                     cleanup scope; assets/ holds mascot.svg, drone.svg and manifest.json
tests/
  pocket-curl.test.mjs     curl geometry (npm test)
  pocket-actors.test.mjs   actor states, idle ladder, drag, cleanup, geometry, assets (npm test)
  e2e/pocket_e2e.py        119 browser checks: every flow, keyboard, reduced motion, mobile, persistence,
                           and the actors (occlusion, greeting, page-turn run, idle ladder, drone, 7 viewports)
```

**Implementation notes for a production build.** Clones are made from the rendered DOM, so
anything a clone cannot reproduce (a playing video, a canvas) would freeze in the turning page.
Pocketing is local to the browser; a real version would link each sticker to a product ID and
an account so the pocket follows the customer across devices.

---

## Known limitations and source notes

- **Gemini has not been called live from this build.** The request format, headers and response
  parsing were tested against a mocked endpoint (163 browser checks). Verify with a real key before
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
