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

Then open the page, choose **Reimagine this page**, and click a ready-made experience or type a prompt.

**Tests**

```bash
npm test             # validator, content model and template unit tests (Node built-in runner)

# Optional browser checks (291 checks across all experiences; Gemini is mocked, no key needed):
pip install playwright && python -m playwright install chromium
npm run serve -- --port 5200 &
python tests/e2e/aixc_e2e.py http://127.0.0.1:5200/
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

## Known limitations and source notes

- **Gemini has not been called live from this build.** The request format, headers and response
  parsing were tested against a mocked endpoint (291 browser checks). Verify with a real key before
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
