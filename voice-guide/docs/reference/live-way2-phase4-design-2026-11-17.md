# Phase 4 design: Reimagine on Vodafone's live pages (proposal, 2026-11-17)

Status: **second draft; the owner's answers of 2026-11-17 are in (§0)**. Nothing here is built yet. The owner wrote on 2026-11-17: "Ask me before phase 4 (Reimagine on live pages). It needs a design pass first." This is that pass. It rests on a read-only map of the code, the plan and today's live measurements (three readers), and was then attacked by two critics (feasibility against the code; the rules and the owner's decisions). The first draft had a rule breach and several wrong claims; this draft fixes them and says where. Items marked **Owner** need his answer. The ADR is written, with the next free number, when he gives the go-ahead (0068 to 0074 belong to `feature/vg-revamp`; 0075 is the live review's fixes, still waiting for his look; this design builds on ADR-0075 §2 and §3).

## 0. The owner's answers (2026-11-17)

- **The view's shape:** a box in the page with its own scroll (§3.1), over a full-screen sheet.
- **The experiences' controls:** the safe area (§3.2), over shipping only the experiences that fit first. He recalled that the Pocket's button and curl moved to the bottom-left of Vodafone's pages: that is ADR-0064, built on this branch in phase 3 step S11 (commit b35c6db) and measured live on 2026-11-17 (the Pocket button at 22..80 x 820..878 on desktop, 16..68 x 744..796 on phones, both languages). The safe area's bottom-left zone is that button; no other implementation exists on any branch or worktree (checked 2026-11-17).
- **Colours:** the experiences keep their own palettes on live pages, **as an owner exception to SPEC-01 / AGENTS.md §4.8, like the chip's pill**, recorded in the ADR so it can be revisited (over mapping them to Vodafone's tokens).
- **Pages (D3):** every CMS page that passes the gate, checked on each page load (over a fixed demo list); today Services, bundles, Benefits and home (§6).
- Still open: the template credits (§3.3; recommendation: links as merged), who reviews the Arabic microcopy (§3.5), and the go-ahead to build 4a.

## 1. What phase 4 is, and what binds it

The plan (`docs/handoff/live-demos-way2.md` §3.3, §3.5 row 3, phase 4): the composer and launcher read the live model; the reimagined view hides `#main-content` and shows the layer's output beside it; "Original" restores the page exactly; the 13 experiences work on the Services, bundles, Benefits and home models, in Arabic too; the guide spotlights reimagined cards.

In force: **templates only on live** (owner, 2026-11-10: no Gemini, no key field, no Google Fonts); ADR-0064 §1: nothing of Vodafone's is "moved, lifted, restyled or covered"; AGENTS.md §4.6: never hide, cover or change the accessibility widget or the cookie banner; §4.8: Vodafone's design language, no new colours, fonts or styles; our floating controls never overlap, desktop and phone, English and Arabic; ADR-0046 §1: demo code loads on intent, one chunk per experience.

## 2. What the map and the critique found

1. **Sticky stages cannot pin on Vodafone's pages.** The static and static-lite themes set `overflow-x: hidden` on `html` and `body`, so `position: sticky` never sticks. Ten experiences pin a stage that way (fan, coverflow, gallery, cube, spotlight, ring, tunnel, journey, split, streaming), and the view bar is sticky too. Inside a scroll container of our own, sticky works again (`.aixc-vx` itself uses `overflow-x: clip`, which is not a scroll container).
2. **The experiences talk to the window directly**, not only through shared helpers: `window.scrollTo/scrollBy/scrollY/innerHeight` in shared.js (`scrollToY`, `trackTop`, `pinned`, `dragToScroll`, `sidewaysWheel`), seven experiences settle on their own `window` scroll listener (spotlight, ring, tunnel, fan, split, coverflow, gallery), streaming's intro listens on the window, and the CSS uses one `--vx-top` for two coordinate systems (sticky tops and viewport-fixed tops). Moving them into our own scroller is a real refactor of shared code the clone also runs.
3. **Two experiences open modal dialogs** (`showModal()` in canvas and streaming). A modal dialog draws in the browser's top layer, above Vodafone's accessibility button and the cookie banner, and makes everything else unusable while open. On live pages that breaks AGENTS.md §4.6. (Blocker in the first draft.)
4. **The bottom corners are taken.** Bottom-right: Vodafone's accessibility button and the guide's mic (desktop 1272..1336 x 743..880; phone 280..344 x 655..792), plus the guide's transcript bar and keyboard button while it listens. Bottom-left: the Pocket's button and resting curl (desktop 0..204 x 639..900; phone 0..166 x 599..812); on a first visit the cookie banner (bottom-left in English, bottom-right in Arabic). These are physical corners in both languages. On the clone ADR-0044 lifted the accessibility button and mic; on live that is forbidden (ADR-0064 §5). The controls to move are more than next and previous: spotlight's controls and its four-card queue, ring's three-column footer, tunnel's HUD row, gallery's controls and phone caption, flipbook's, fan's detail, split's controls, coverflow's phone panel.
5. **The trail's pill sits at the header's bottom plus 8 px** and tucks only on window scroll; anything placed at the top of our view meets it (the B-23 bug).
6. **The core has 65 B left**, and the core imports `content-index.js`, which the composer also needs: adding the composer as a dynamic demo made esbuild move it into a shared chunk the core imports (measured earlier at +856 B).
7. **Smaller gaps:** the live adapter's `tag()` / `untag()` clear our marks on reimagined cards too (scope it to `#main-content`); the clone's icon sprite does not exist on live pages (logos and store badges draw blank); the composer has no `destroy()` and no guard, and appends unmarked nodes to `body`; the model changes after load but the composer indexes once; pages without a hero have `model.title === null` (eight experiences print it, `pageHeading` renders an empty `h1`); copy says "services" on every page; Reimagine's CSS has the Pocket's font gap (ADR-0075 §1) and uses colours outside Vodafone's palette; Vodafone's base CSS reaches our markup (links and spans in titles wrap differently, Arabic too); magazine's contents links write a `#fragment` into Vodafone's address; cards that open one of Vodafone's own dialogs cannot open it while `#main-content` is inert; the guide's spotlight scrolls a pinned stage and changes its active item; the trail does not record our view (`data-vg`), so a journey's memory shows Vodafone's page.

## 3. The design

### 3.1 The reimagined view: a box in the page, as tall as the screen, with its own scroll (Owner)

While a view shows, `#main-content` is hidden as today (laid out, no height, transparent, inert: ADR-0075 §2), and `#experience-output` becomes **an in-flow box, as tall as the screen below Vodafone's header** (`height: calc(100dvh - <header bottom>)`, kept current when Vodafone's nav pins or unpins), with **its own vertical scroll** (`overflow-y: auto; overscroll-behavior: contain`). The page around it is unchanged: Vodafone's header above, its footer below, the page's own scroll and scrollbar kept. On open, the page scrolls so the box's top meets the header; from there the reader scrolls inside the view; at its end a closing band and "Original page" lead back, and scrolling the page past the box reaches Vodafone's footer as before.

Inside the box `position: sticky` works, so the ten pinning experiences keep their design; what changes is their scroll source: a `scroller` seam (the window on the clone, the box on live) used by every scroll read and write in shared.js and by the seven experiences' own listeners and direct calls, and `--vx-top` split into a pin top in the box's coordinates and a viewport top for anything fixed. The box's height comes from a ResizeObserver, not `100svh` minus a static header.

- Nothing of Vodafone's is covered, moved or locked: no `overflow` on `html` or `body`, so the scrollbar (and Vodafone's accessibility button) never shift; the footer stays reachable.
- **Rejected:** a full-screen sheet fixed under the header (first draft): it covers Vodafone's footer and needs the page's scroll stopped, reversing ADR-0046 §2, ADR-0064 §1 and plan §3.3, and risking the 15 px shift ADR-0075 §4 just fixed. Re-implementing pinning per experience with `position: fixed`: ten experiences, fragile. Shipping only the experiences that do not pin (magazine, flipbook, canvas): too thin.
- **Owner:** a box with its own scroll inside the page means two scrolls (the page's, then the view's). Acceptable?

### 3.2 The experiences' controls keep out of Vodafone's corner and ours (Owner)

On live pages two **physical** safe zones, the same in both languages: **bottom-right** (Vodafone's accessibility button and the guide's mic, and the guide's bar and keyboard button while it listens) and **bottom-left** (the Pocket's button). Their sizes are measured from the controls' boxes (with one margin rule on desktop and phone) and set as custom properties on our box, never on Vodafone's `<html>`. Every pressable element of an experience stays out of them: next / previous / pause move to the **bottom centre** of the stage on desktop and to a row **under the stage's title** on phones; spotlight's queue, ring's and tunnel's footers, gallery's caption, fan's detail, split's and coverflow's panels are re-laid out per experience (ring's footer and coverflow's phone panel need a small redesign).

While a view shows, the Pocket's **resting curl hides** (opacity 0); its button stays, keeps its count and opens the album with the page turn. This brings ADR-0044's tuck back for live pages, without the lift (it amends ADR-0064 §5, which made the tuck clone-only); the rule lives in Reimagine's CSS (the Pocket chunk has 90 B left).

- **Owner:** on 2026-11-07 you preferred tucking the corner and lifting the column over "a bottom-right safe area inside every experience". On live pages the lift is not possible. Is the safe area acceptable?

### 3.3 Launcher, composer, view bar

- **Launcher: where the plan puts it**, directly below the trail's pill on its side (B-23), measured from the pill's box so it follows the trail; **hidden while the trail's consent card, the journey or the Pocket's album shows** (the card covers that place). With that rule its label fits on phones too. Its z-index stays below Vodafone's navigation, menus and dialogs, as the chips' does, and far below OneTrust. `.aixc-launcher` and its `aria-expanded` stay (the floating matrix and Tips read them, ADR-0045 §6).
- **Composer: templates only**, a new small module (13 template buttons, Original / Reimagined / Reset), not the clone's `initComposer` with flags: no `gemini-client.js`, settings, key field, prompt box or cache; the chunk is asserted free of `generativelanguage`, `aixc-key` and `fonts.googleapis`. It keeps the class names, ids and `body[data-aixc-view]` the Pocket and Tips read. The clone keeps its composer until phase 9.
- **View bar:** the first row inside the box, sticky there, with its inline end kept free of the trail's pill (the pill's measured box plus 16 px of padding); on phones the bar takes its own row below the pill. It becomes a named control in the floating matrix so rules (a) and (c) check it against the pill (B-23's assertions stay).
- **Template credits** ("Inspired by … by …"): **Owner**, three options: links as you merged them on 2026-11-10 (they send nothing: `rel="noopener noreferrer"`), plain text, or none on live pages. Recommendation: links as merged.

### 3.4 Which pages (Owner: D3)

The plan's gate: coverage at least 0.9 and at least two sections with three or more items, on the website only. Measured on the saved pages (2026-10-23) through the live adapter: see the table in §6. Coverage has never been measured on the live pages (O29); the gate turns Reimagine off for a page that reads badly rather than showing a broken view.

- **Owner (D3):** every CMS page that passes the gate, plus a demo list for the walkthrough (recommended: the pages in §6 that pass); or the demo list only.

### 3.5 Inside: loading, guard, model, guide, trail, fonts, colours, icons

- **Loading on intent:** a **launcher chunk** (the launcher, the gate, a few hundred bytes of code) loads at idle where the layer runs; the **shell** (composer, view bar, validator, templates, shared.js, `aixc.css`, i18n) loads when the launcher is pressed; **each experience** loads when its template is chosen, from a live-only registry (`src/host/demos/reimagine/`, one wrapper per experience that imports the renderer and its CSS as text; the clone's synchronous `experience-renderer.js` is left alone). `normalizeContentModel` and its constants move into a module only the core imports, so `content-index.js` stays out of the core's graph. Budgets from the first build, "a little above measured", each with a dated comment; the Pocket's budget is watched too (new shared chunks can move files out of its closure).
- **Guard:** renderers get a `listen()` that returns an `off()`, and frame and timer wrappers, all built on `guard.wrap`; one `destroy()` (unmount the experience, remove launcher, composer, live region and view note, `host.showSource()`) registered with `guard.onStop`. Everything we add carries `data-aixc` and `data-vg`. A forced failure in the reimagined view gives the page back as served, `#main-content` byte for byte.
- **Dialogs:** on live pages canvas's and streaming's previews open **without the top layer** (`dialog.show()` or a `role="dialog"` element inside the box, below the accessibility button and the guide, with its own focus trap and Escape). An S7 cell opens each and checks that a press at Vodafone's accessibility button reaches it and its box equals `?aixc=off`'s.
- **Model:** re-indexed on every `aixc:model`; an open view is not re-rendered under the reader's eyes. A page without a hero takes the page's name as its title; no empty `h1`. Copy says the section's own title or "items", never "services" on other pages.
- **Guide:** reimagined cards carry `data-vg-destination` from `section.destinationId` (ADR-0049 §4) and keep `data-aixc-item` once the adapter's `tag()` is scoped to `#main-content` (amends ADR-0049 §7, with a test that failed first). Each pinned experience exposes a reveal hook (`goTo(index)`), so the layer steps the stage to a card before the guide spotlights it. O19 (Cash routing) stays recorded, not hidden. A card whose action opens one of Vodafone's own dialogs is drawn as a non-link in the view (no invented `href`, with a test).
- **Trail:** by design the trail does not record the reimagined view (it is ours, `data-vg`); a journey's memory of the page shows Vodafone's page. Reimagine sets the trail's cover (ADR-0075 §8) itself, so the memory shows the page as served even where the journey chunk has not loaded.
- **Fonts:** the four `aixc-vodafone-*` aliases and the shared stacks move into one stylesheet both chunks load (`ensureCss('vodafone-faces')`); `aixc.css`, `--vx-font*` and `--mag-font*` read them; the streaming wordmark draws in Vodafone's bold face. An offline font test of the reimagined view runs on the saved `/en/home` and bundles pages (the themes without the faces).
- **Colours (owner, 2026-11-17):** the experiences keep their own palettes on live pages, an owner exception to SPEC-01 like the chip's pill; the ADR records it with a "Revisit when" (for example: before the demos reach visitors outside the owner's demos, or when Vodafone's brand team reviews them). The audit still lists every off-palette colour in the ADR, so the exception is known exactly.
- **Vodafone's CSS in our box:** a scoped reset under `.aixc-vx` for the inline elements Vodafone's base CSS styles; magazine's contents links scroll the box instead of writing `#fragment` into Vodafone's address.
- **Icons:** one hidden, marked SVG sprite with the few symbols the experiences use, injected once; store badges as text links when a store has no icon.
- **Arabic:** the experiences' remaining English microcopy (O17) moves into `i18n.js`. **Owner:** who reviews the Arabic, and does that review block the live check of 4c?

## 4. Tests and checks

- The behavioural half of `aixc_e2e.py` (templates and the 13 experiences; the Gemini half does not apply), ported to Playwright TypeScript on the saved pages with the kit, on a static-theme page (Services), a static-lite one (bundles) and maintheme (home): every item once, one `h1`, no horizontal overflow at 1366 and 375, English and Arabic, no request to Google, no `#aixc-key`, Original restores `#main-content`'s attributes exactly and Owl's carousels stay painted, every pressable element clear of the safe zones, the page's scrollbar never moves.
- The floating matrix's S7 cells (pending today), with the view bar and composer as named controls, the dialogs open, the guide listening, the Pocket peeking, and Vodafone's menu open over a view; the live walk gains S7 on `/en/services` and one page of another theme, within its 24-load cap; the motion check gains one reimagined round.
- The clone's suites (`aixc_e2e` 298, `arabic_e2e`, `reimagine-floating`) re-run after the shared-code changes.

## 5. Order of work and size (after the go-ahead)

1. **4a, the frame** (2 to 3 days with one review round): the adapter scope fix; the content-index split; the shared fonts stylesheet; the box and the scroller seam in shared.js; launcher chunk, templates-only composer, view bar, guard and destroy, gate, sprite; the Pocket seams (the turning copy and the album keep the box's scroll; a composer handle for the album); two experiences that exercise both kinds (magazine, which does not pin, and spotlight, which does, with its queue and controls in the safe area); S7 cells; budgets.
2. **4b, the other eleven experiences** in the box, each with its controls in the safe area and its reveal hook, canvas's and streaming's dialogs without the top layer, English and Arabic at 1366 and 375; the ported checks.
3. **4c, Arabic microcopy (O17), the colour audit's list for the ADR, and the live checks** (S7 in the floating walk, a reimagined motion round), then a live run in Google Chrome as on 2026-11-17.

## 6. Which saved pages pass the gate (measured 2026-11-17)

The layer's live adapter run on the saved pages of 2026-10-23 in Chromium (scripts stripped, nothing fetched), as `tests/integration/live-adapter.test.ts` does. Coverage is 1.0 on every page that reads anything, so the "two sections with three or more items" rule alone decides. English and Arabic agree.

| Page | Sections (items) | Passes |
|---|---|---|
| `/home` | 3 (3, 3, 4) | yes |
| `/services` | 6 (1, 5, 3, 7, 6, 8) | yes |
| `/mobile-internet-bundles` | 2 (17, 3; Arabic 17, 4) | yes |
| `/vodafone-red1` (Benefits) | 2 (5, 3) | yes |
| `/vodafone-cash` | 1 (8) | no |
| `/promotions` (English only) | 1 (2) | no |
| `/wireless-net` | 0 (coverage 0) | no |

So the plan's four demo pages (Services, bundles, Benefits, home) all pass, in both languages. Not measured on the live pages (O29).

## 7. Risks

- Two scrolls (the page's, then the view's) may feel unusual on phones; the box's height follows the header, and the page's scroll takes over at the view's end.
- The scroller seam changes shared code the clone runs; the clone's suites are the guard.
- Vodafone's pages change: the gate turns Reimagine off rather than show a broken view.
- One error in Reimagine stops the whole layer (Pocket and journey too); the guard's tests cover a forced failure in the view.
- Depends on ADR-0075 (accepted after the owner's look), which this design builds on (§2 the hidden source, §3 the header's bottom, §8 the trail's cover).
