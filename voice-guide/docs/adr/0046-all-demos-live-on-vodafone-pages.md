# ADR-0046: All five demos run on Vodafone's real pages, as one experience layer injected beside the guide; the clone is retired

- Status: Accepted as the direction (owner, 2026-11-10); the design below is proposed and is confirmed phase by phase (handoff `docs/handoff/live-demos-way2.md` at the repository root)
- Date: 2026-11-10
- Area: architecture, delivery, demo; supersedes ADR-0040 and ADR-0043 when phase 9 of the handoff lands (until then they stay in force for `npm run demo:trail`)
- Owner decision: 2026-11-10, "ditch the cloned pages approach and have everything (all 5 demos) run live on Way 2 of real Vodafone pages ... while keeping the option for the user to click a button and fill the page with real demo data where applicable"

## Context

Four of the five demos (Pocket, Reimagine this page, Your RED world, and the journey inside the Pocket) exist only inside `vodafone-services-clone/`, a hand-made copy of `/en/services` and `/ar/services`. The copy is mounted over the saved page by the demo browser in replay only (ADR-0040, ADR-0043). On the live site the guide (`guide.js`) and the Exploration Trail run; nothing else does. The owner wants the whole demo live, on Vodafone's own pages, because a copy is less convincing and drifts from the real page.

Two ways were compared on 2026-11-09: swapping the copy in at the real address (Way 1), or running the demos on Vodafone's real markup (Way 2). The owner chose Way 2.

Facts measured on 2026-11-10 that make Way 2 workable:

- `web.vodafone.com.eg` CMS pages are Liferay. Each section is a `JournalContentPortlet` whose instance id (for example `INSTANCE_w9Jro8TDb1vH`, "Stay In Control") was identical on 2026-10-23 and 2026-11-10.
- Cards use one shared component vocabulary across pages: `card-action` and `card-subscription` (Services), `card-subscription` (bundles), `card-plan` and `card-collapsing` (RED), `card-horizontal` (home), headings in `.section-title`. 13 of the 14 saved pages are Liferay; `/spa/*` is not.
- The only Content-Security-Policy header is `frame-ancestors`; `X-Frame-Options: SAMEORIGIN`. Scripts and styles we add from the page's own origin are not restricted, and same-origin iframes (the Pocket portal) are allowed.
- jQuery and Owl Carousel run on the page; Owl clones items on some pages (6 clones on `/en/vodafone-red1`).
- Vodafone's own fonts are loaded on every page (`vodafone-regular-en`, `vodafone-bold-ar`, `vf-*`).
- Fixed elements of Vodafone's own: the accessibility button (`#vodafone-aw-icon`, 1291,825 55×55 at 1366×900; 300,737 at 375×812) and the OneTrust banner and its full-page filter on a first visit.
- `guide.js` is 20,401 of its 20,480-byte gzip budget, so nothing more can go into it.
- The demos' modules already take their page through two seams: an adapter (`pageId`, `renderOriginal`, `extractContent`) and `regions` (`header`, `main`, `sourceRoot`, `outputRoot`, `viewbar`). Four hard-coded selectors bypass them (`journey.js` `.site-header`, `experiences/shared.js` `#aixc-viewbar`, `tips/coach.js` `#source-content`, `voicetut/demo.js`).

## Decision

1. **One experience layer, beside the guide.** The demos' modules become a separate bundle, `aixc.js`, loaded by the same loader that adds `guide.js`: the demo browser today (`tools/demo-browser.ts`, every top-level document of an allowed origin), Vodafone's tag manager later (mode A, SPEC-03 §1). It is served from the page's own origin under `/__vg/sdk/aixc/`, like `guide.js`. It is built as ES modules with code splitting: a small core (launchers, adapter, Pocket peel) and one chunk per demo and per Reimagine experience, loaded on intent. CSS ships as text inside the chunks.
2. **The page is Vodafone's.** A `PageHost` maps the layer's regions onto the live DOM: `main` and `sourceRoot` are Vodafone's `#main-content`; `outputRoot` and `viewbar` are ours, inserted beside it. Vodafone's header, footer, accessibility button and OneTrust banner are protected: never hidden, covered, moved or restyled (AGENTS.md §4.6).
3. **A live adapter reads the page into the same content model.** It recognises Vodafone's component vocabulary (table in the handoff), keys sections by portlet instance id and items by their normalised link, drops Owl clones, reads lazy images from `data-src`, and tags what it read (`data-aixc-section`, `data-aixc-item`, and `data-vg-destination` from the knowledge base). It reports problems and a coverage figure; a demo that needs the model is offered on a page only when coverage passes a threshold. Reimagine, the Pocket, the RED world and Tips keep working from the model, unchanged in kind.
4. **The journey is hosted by the Pocket on every page.** With the layer on, the page declares itself a trail host before the trail starts, so `hostUrl` and the trip to the Services page go away.
5. **Demo data is real and opt-in.** A "Fill with demo data" action (and "Reset demo") exists only when the loader marks the page as a demo (`data-aixc-demo`). It fills each demo from a demo kit captured from Vodafone's public pages on demand (`tools/demo-kit.ts`, committed as `config/demo-kit/vodafone-eg.json` with its capture date), never from invented content. What cannot be real without signing in (the RED world's customer) is a sample, and says so on screen.
6. **Replay stays, the copy goes.** Saved real pages (`fixtures/replay/vodafone-eg`, refreshed) remain the offline fallback and the e2e test bed, now with the experience layer on them. The hand-made copy, its shell and its content files are deleted when the live demos reach parity (handoff phase 9).
7. **Failures stay ours.** Every layer entry point is wrapped; on any error the layer removes its own nodes and leaves the page as Vodafone served it. `?aixc=off` and a per-page config switch turn it off.

## Consequences

- The demo shows the real, current page, in both languages, on any CMS page the adapter covers, not one copied page.
- A Vodafone change can break the adapter. The coverage gate turns that into "the demo is not offered here" rather than a broken page, and `npm run check:live` (new) reports it before an audience.
- The experience layer is a second script on every page. Its core gets a gzip budget of its own (set from the first measured build, a little above it, as ADR-0035 did for the trail).
- Floating controls now share the screen with Vodafone's own on every page; the overlap checks move from the clone to the live pages and the saved pages.
- Code that assumed the clone (shell regions, page-specific adapter, captured images, the clone's font files) is replaced or deleted. History is kept by moving the folder (`git mv`), not copying it.
- The in-flight branches that edit the same modules (`feature/pocket-actors-live`, `feature/pocket-portal`, `feature/aixc-template-credits`) should land before the move.

## Pilot knobs

- Adapter coverage threshold per demo (default to be set from the saved pages, phase 2).
- Component recognisers (`experiences/src/host/recognisers.js`): add or change a class without touching a demo.
- Pages the layer runs on (`config/sites/vodafone-eg.yaml`, new `experiences:` block): allow-list by path prefix; `/spa/` off.
- Where "Pocket it" shows: always or on hover and focus (live pages carry many more cards than the copy).
- Demo mode on or off (`data-aixc-demo` from the loader; `?aixc-demo=off`).
- Size budgets for `aixc.js` and its chunks (`tests/unit/sdk-size.test.ts`).

## Revisit when

- Vodafone changes its CMS or component library (the recogniser table stops matching).
- The layer moves from the demo browser to Vodafone's tag manager: loading order, consent (OneTrust categories) and budgets need a fresh look.
- The `/spa/` app or the shop needs the Pocket or Reimagine.
