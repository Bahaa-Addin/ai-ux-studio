# ADR-0052: On Vodafone's pages the Pocket is a chunk the layer loads at idle; its album is a region of its own, the page turn freezes one copy of `#wrapper`, and everything it adds is marked, guarded and taken away

- Status: Proposed (2026-11-13). Part 1, the album, is built (phase 3 step S5). Part 2, the "Pocket it" chips, is added to this ADR with step S6. Accepted with phase 3's checks on live pages
- Date: 2026-11-13
- Area: the Pocket (experience layer), loading, build, failure isolation; live plan phase 3 (`docs/handoff/live-demos-way2.md` at the repository root), under ADR-0046 §2 and §4 and ADR-0048 §3 and §6–7; amends ADR-0048 §3 (how a demo's CSS reaches the page; a budget per chunk)
- Owner decisions: 2026-11-13, the Pocket keeps a sticker's copy as published and dated (ADR-0051); the album is on every page the layer runs on, chips only where coverage is 0.6 or more (phase 3 map)

## Context

Read and measured on 2026-11-13 (`docs/reference/live-way2-phase3-map-2026-11-13.md`, "Unsafe on a live page as built"). The Pocket was written for the Services clone, and on a live page it would have:

- appended the album inside `#main-content`, which its own page turn then hides, and frozen `.page-shell`, which does not exist on Vodafone's pages, so opening the Pocket threw with `state.busy` left true;
- thrown on a sticker without a picture (65 of 155 cards on the saved pages, all 20 bundles) *after* hiding `#main-content`, leaving Vodafone's content hidden with no way back;
- added layers, chips and a status line without `data-aixc`, through 17 raw listeners, timers and animation frames outside the guard, with a `destroy()` that removed only the mascot and the portal, so a guard stop could not leave the page as Vodafone served it;
- cloned the page twice per turn (5,416 nodes on the bundles page) and switched its lazy pictures to eager, fetching pictures from Vodafone for a copy shown for a second;
- replaced the accessibility widget's own `transition` on every page and lifted the button by a rule that could put it on the Arabic cookie banner (AGENTS.md 4.6);
- loaded the mascot (47 KB gzipped) and the portal (15 KB) with it, and needed `.aixc-sr-only` from the composer's stylesheet, which live pages do not load.

## Decision

1. **A demo is a chunk the core loads at idle.** For each demo the loader's tag names (`data-aixc-demos`) and the core knows, the core imports `host/demos/<name>.js` when the page is idle (`requestIdleCallback`, at most 2 s), through the guard, and calls its `start({ host, adapter, guard, layer, ensureCss, checkpoint })`. A demo's CSS is imported as text, minified at build time, and put on the page once by `ensureCss(name, text)`: one `<style data-aixc data-vg data-aixc-css="name">` in `<head>`, which a stop removes with the rest. The build gives each chunk a budget of its own, by the source module it is the entry of (`tests/unit/sdk-size.test.ts`), and checks that no output still refers to a file beside a module (`new URL('./…', import.meta.url)` would 404 on the gateway). The plugin that turns such references into `data:` URLs (ADR-0048 §3) waits for the first chunk that needs one: the mascot (S12) or the portal (S13). (Amends ADR-0048 §3.)
2. **The Pocket on every layer page.** `host/demos/pocket.js` starts the Pocket wherever the layer runs. Its album shows stickers from every page; where no card can be pocketed (coverage under 0.6, or no model) it is the album alone.
3. **The Pocket takes its host as seams** (`experiences/src/pocket/pocket.js`): where the album goes (`place`), what the turn freezes (`snapshotRoot`) and from how far down (`sheetTop`), how the page's content is covered and given back, also in the frozen copy (`cover` returns `restore` and `inCopy`), how a node is marked (`mark`), how a handler, timer or frame is guarded (`wrap`), test checkpoints, labels, the page, and switches (`corner`, `chips`, `dated`, `eagerImages`, `pageBack`). The clone's shell supplies today's behaviour by default. Its store, its mascot (`createActors`) and its portal (`createPortal`) are passed in; the clone passes all three, the live chunk passes the store alone.
4. **The album is a region of its own.** `PageHost.addRegion` puts it after `#experience-output`, as `#pocket-output` (so `pocket.css` matches), marked `data-aixc` and `data-vg`. While it shows, `#main-content` is hidden through `host.hideSource()` and the layer's own regions are hidden; closing gives each back the state it had (a reimagined view keeps Vodafone's content hidden).
5. **One quiet copy per turn.** The turn freezes `#wrapper` (else `<body>`) below whatever Vodafone pins at the top (`host.chromeBottom()`). The page's back face shows nothing of its front (`seeThrough: 0`), so one copy is made per turn. The copy has no ids, none of the layer's tags (`data-aixc-*`), no frames, videos, audio, plugins, scripts, stylesheet links, `noscript` or `template` (a frame or video becomes an empty box of its size), and its lazy pictures stay lazy: nothing is fetched for it.
6. **Everything is marked, guarded and taken away.** Every node the Pocket puts in `<body>` and its region carry `data-aixc` and `data-vg`. Every listener, timer and animation frame runs through the guard (`wrap`). Opening and closing give the page back if anything fails part way (the album hidden, Vodafone's content and the layer's regions restored, the scroll position back), then pass the error to the guard, which stops the layer. `destroy()` cancels every frame and timer, removes every listener, layer, region and class, gives the page back, and is registered with `guard.onStop`. Test checkpoints: `pocket-open`, `pocket-render`, `pocket-close`.
7. **Stickers are shown as they were kept** (ADR-0051): the copy as saved, the section's title, the picture or none; a sticker kept in the other language marks its own words with that language and direction; on Vodafone's pages each sticker says the day it was saved ("Saved 12 Nov", "اتحفظت 12 نوفمبر" with Latin digits, as Vodafone writes its prices). Announcements go through the page's language. "Back to the page" replaces the clone's "Back to Services" on live pages. The fonts are variables, with Vodafone's Arabic face names first on Arabic pages (the theme names them apart). The album keeps its own column and a full screen of height there, since the themes' `.container` differs or is missing.
8. **What part 1 leaves out on live pages:** the "Pocket it" chips (S6, part 2 of this ADR), the page's corner and the Pocket button (S11, under the owner's accessibility-button exception, its ADR numbered when written), the mascot and drone (S12), the portal (S13) and the journey (S10). Until S6 and S11, nothing on a live page opens the album but the layer's own call (`window.__aixc.demos.pocket.open()` with `?aixc-debug`).
9. **The clone keeps working as it did.** It keeps its ids-only store behind the same interface (`experiences/src/pocket/ids-store.js`) until phase 9. The accessibility-button rules in `pocket.css` now match only on the clone's page (`:where(body:has(.page-shell))`), with the same weight as before: a first version that raised their weight let the open Pocket's rule beat the portal's, which keeps the button above the transition (caught by `portal_e2e.py` before commit).

## Consequences

- The album works on every saved CMS page in both languages, with stickers from any page, without a picture, and in the other language.
- A failure anywhere in it leaves the page as with `?aixc=off`; nothing reaches the page's own error handlers.
- A turn costs one copy of `#wrapper` and no request.
- The core grows by the loader and `ensureCss`: 7,647 bytes gzipped (budget raised to 7.75 KB). The Pocket chunk is 24,830 bytes gzipped (budget 26 KB), without the mascot, the drone or the portal; up to a third of it is the UI copy of every demo in Arabic (`i18n.js`, 8,155 bytes gzipped on its own), which a later step can split by demo.
- Until S6 and S11 the album has no visible entry on live pages.

## Verified (2026-11-13, owner's Mac, saved pages of 2026-10-23)

- `tests/e2e/pocket-live.e2e.test.ts` (port 4477): on `/en/services`, `/ar/services`, `/en/home` and `/en/mobile-internet-bundles`, at 1366×900 and 375×812, with the theme's storage clear stood in: the album shows every sticker from this page and another, dated, the bundles without pictures, an Arabic sticker on an English page in Arabic; one copy per turn with no ids, tags, frames, scripts or eager pictures; header and footer unchanged; every layer in `<body>` marked; the CSS once; Back within 2 px of where the visitor was at three depths, both languages, both screens; a failure at `pocket-open`, `pocket-render` and `pocket-close` leaves `#wrapper` and the body's and root's attributes as with `?aixc=off`, the scroll where it was, and no page error.
- `tests/unit/sdk-size.test.ts`: the core and the Pocket chunk within their budgets; the core loads the chunk dynamically; no `new URL('./` in any output; no portal, mascot, drone or composer code in the chunk.
- `experiences/tests/pocket-ids-store.test.mjs` (3) and `pocket-record.test.mjs`: the clone's store as before; a card without a link of its own keeps its section's; a picture's fit.
- The clone: `pocket_e2e.py`, `portal_e2e.py`, `aixc_e2e.py`, `arabic_e2e.py`, `tips_e2e.py` and voice-guide's clone-mounted end-to-end tests (numbers in the handoff).
- Not verified: the live pages (O29); Owl Carousel's motion under the copy.

## Pilot knobs

- The idle wait before a demo loads (2 s at most, `host/index.js`).
- The page's back face (`PAGE_BACK` in `host/demos/pocket.js`), the labels and `dated`.
- The per-chunk budgets (`tests/unit/sdk-size.test.ts`).

## Revisit when

- The layer moves to Vodafone's tag manager (Mode A): when a demo may load, and under which OneTrust category.
- Vodafone pins more of its page than `#header` and `#nav-header` (`host.chromeBottom()`).
- The UI copy grows: split `i18n.js` by demo.
