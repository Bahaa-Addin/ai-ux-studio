# ADR-0040: On Vodafone, the journey is shown in the Services clone's Pocket, in its own design; the demo runs on Vodafone pages only

- Status: Accepted for the prototype (2026-11-03)
- Date: 2026-11-03
- Area: UI, demo; amends ADR-0038 (where the timeline lives) for sites that host the journey
- Spec: [SPEC-06](../specs/SPEC-06-exploration-trail.md) §3a

## Context

ADR-0038 put the timeline in a sheet inside the guide's shadow root. On Vodafone's pages that sheet reads as a white modal from another product laid over the site. Product direction (2026-11-03):

1. The whole demo runs on clones of real Vodafone pages; no invented "Demo Telco" pages.
2. The journey moves to the Pocket page (where saved services live, `../vodafone-services-clone`) and is redesigned in the Pocket's and Vodafone's design language.
3. No opaque popup: the journey floats in a lightly frosted layer over the Pocket, with a staggered entrance, when the person uses the timeline slider or presses a redesigned "Your journey" button.

## Decision

1. **A page can host the journey.** `<meta name="vg-trail-host" content="pocket">` makes the trail a *host-driven* trail on that page: it never opens its own sheet, publishes a small API (`TrailHostApi`, `packages/sdk/src/trail/host.ts`) on `vg:trail-ready` and as `voiceGuide.trailHost`, and dispatches `vg:trail-open` when the person asks for the journey. The API is the same set of intents the built-in sheet uses (select, scrub, hold, play, ask, pause, clear, consent) plus `subscribe(snapshot)`, `setPreviewRoot(el)` and `t(key)` for the trail's own words. Recording, storage, attention, the sandboxed replay and the questions stay in the trail; the host only draws and forwards intents. Nothing about the person leaves the browser through it.
2. **Other pages keep only the pill.** A site sets `trail.hostUrl`; on pages that are not the host, a consented pill press stores a one-tab flag, flushes, and goes to `hostUrl`, where the host opens the journey. Before consent the pill still asks for consent itself (ADR-0037 §1). While the journey is open on the host, the pill steps aside.
3. **The Pocket draws it** (`vodafone-services-clone/src/pocket/journey.js`, `journey.css`, all `.pocket-journey-` prefixed, every element `data-vg` so it is never recorded):
   - "Your journey" beside "Back to Services", in the Pocket's own button style, with a small saving dot;
   - stepped tabs under the bar, one per page with its title and its own thread (red as far as watched); the selected page is a lifted white tab with the knob, the current page carries "You are here"; the row is one `role="slider"`: drag or touch along a tab, keys (arrows ±5 %, Page Up/Down a page, Home/End), mirrored in right-to-left; on phones the row scrolls sideways;
   - a lightly frosted layer (translucent grey, `backdrop-filter: blur`) in the same grid cell as the album, so kept stickers stay visible under it; never a dialog, never white;
   - inside it, floating in one after another (70 ms apart; nothing moves under reduced motion): the title row with the saving controls ("Saved on this device · Pause · Clear journey"), the memory as a big tilted sticker, Play, "You explored", and each explored item as a small note with up to three question chips.
   - A chip turns the page back to Services first, then asks: the guide answers on the page it can point at.
4. **The clone marks what it recreates.** Each clone section carries `data-vg-destination="<KB destination id>"`. The knowledge service adds `[data-vg-destination="id"]` to every destination's selectors in the experience page map, and the planner adds it to a destination's own target, so explored items, spotlights and answers work on the clone as on the live page. A live page has no such attribute, so nothing changes there.
5. **The demo is Vodafone only.** `npm run demo:trail` is `demo:live --replay --trail --start /en/home`: the saved Vodafone pages, with the Services clone mounted at `/en/services` (`tools/demo-browser.ts` `clone` option; `--clone off` serves the saved page). The fixture site stays only as the test bed for the SDK's built-in sheet and mechanics (`tests/e2e/trail.e2e.test.ts`); the journey in the Pocket is tested on Vodafone pages (`tests/e2e/pocket-journey.e2e.test.ts`).

## Consequences

- Two UIs for one trail: the built-in sheet (sites without a host) and the Pocket's. The host API keeps them on the same intents and state, so behaviour does not fork; copy comes from one table.
- The clone is English only, so on Vodafone the journey in the Pocket speaks English even after Arabic pages (their titles show in Arabic, `dir="auto"`). Its layout is right-to-left ready for an Arabic clone.
- The Pocket now opens with no stickers when a journey exists (`pocket.openWhenEmpty`).
- `trail.js` grew by about 0.5 KB gzipped (26.8 KB of the 30 KB budget); `guide.js` is unchanged.

## Revisit when

- Vodafone hosts the Pocket on its own site: `hostUrl` points there and the clone's markers become real attributes or KB targets.
- A second host design is needed: promote `TrailHostApi` from version 1 with a changelog, never change it silently.
- The clone gets an Arabic version: mount it at `/ar/services` and choose `hostUrl` by language.
