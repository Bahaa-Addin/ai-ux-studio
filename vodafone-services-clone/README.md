# AI Experience Composer (AIXC) — Phase 1

A local recreation of the [Vodafone Egypt Services page](https://web.vodafone.com.eg/en/services)
with an AI layer on top: describe how you want to experience the page, and the **same content**
is recomposed as an editorial magazine. The Vodafone header, navigation and footer never change.

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

Then open the page, choose **Reimagine this page**, and type a prompt or pick a suggestion.

**Tests**

```bash
npm test             # validator + content-model unit tests (Node's built-in runner)

# Optional browser checks (64 checks; Gemini is mocked, no key needed):
pip install playwright && python -m playwright install chromium
npm run serve -- --port 5200 &
python tests/e2e/aixc_e2e.py http://127.0.0.1:5200/
```

---

## Gemini configuration

Without a key the app still works: it uses a **built-in magazine layout** and says so in the view
bar ("Built-in layout, not AI-generated"). To compose from your prompt, add a key in either way:

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
2. **Reimagine this page** → submit *"Turn this into a bold editorial magazine, with a dramatic
   cover, asymmetric layouts, and distinct sections for each category. Keep every original
   service, description, and link."*
3. The magazine replaces only the main content. Scroll: every service, description and link is there.
4. **Edit prompt** → *"Make the layout more compact, but do not remove content."*
5. **Original** shows the source presentation; **Reimagined** returns without another Gemini call;
   **Reset** clears the transformation.
6. Without a key, the same flow shows the built-in layout, clearly labelled as not AI-generated.

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
    experience-renderer.js       experience registry (magazine is the only plugin)
    experiences/magazine.js      9 primitives → DOM (createElement/textContent only)
    experiences/magazine.css     magazine styles, all scoped under .aixc-magazine
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

**Primitives:** `hero`, `feature`, `editorial-grid`, `split-spread`, `shelf`, `callout`,
`section-heading`, `service-list`, `closing-promotion`. Each tolerates any item count.

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
`render(schema, index) → { element, afterMount }`, register it in `experience-renderer.js`, allow
the name in `EXPERIENCES` (validator) and in the response schema (Gemini client).

---

## Known limitations and source notes

- **Gemini has not been called live from this build.** The request format, headers and response
  parsing were tested against a mocked endpoint (64 browser checks). Verify with a real key before
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
- **Visual reference.** The CodePen link in the handoff (`codepen.io/dilums/full/NWodZMd`) resolves
  to a "Timed Cards Opening" slider, not the magazine layout the handoff describes, and the
  referenced `index.html/style.css/script.js` files were not available. The magazine follows the
  handoff's written description (cover, asymmetric spreads, framed media, plum accents).
- **Original view changes** (to make it complete and accessible): real links on cards, a visually
  hidden `h1`, working Shokran / other-services carousels (previously only the first 3 cards were
  reachable), and a fix for the header overflowing the viewport below ~420 px.
