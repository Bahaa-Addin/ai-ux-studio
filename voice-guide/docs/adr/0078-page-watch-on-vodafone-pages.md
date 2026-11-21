# ADR-0078: Page watch on Vodafone's pages, phase 1: a pocketed card and its page, checked in the visitor's browser on each visit

- Status: Proposed (2026-11-18). It becomes Accepted once the build's checks pass and the owner has made his one opt-in live run.
- Date: 2026-11-18
- Area: page watch on live pages.
  - New code: `experiences/src/watch/*` and `experiences/src/host/demos/watch.js`.
  - The Pocket's seams: `pocket/pocket.js` and `host/demos/pocket.js`.
  - The live adapter's `read`.
  - The guide's side: `packages/sdk/src/watch-chunk.ts`.
  - The server: `services/watch/handlers.ts` and the page-map answer.
  - Config and tools: `config/sites/vodafone-eg.yaml` and `tools/watch-baselines.ts`.
  - Rules: AGENTS.md §4.3 to §4.6.
- Owner decisions: D1 was approved on 2026-11-17 ("I approve") and confirmed on 2026-11-18 ("D1 is confirmed"). Q1 to Q8 were answered on 2026-11-18. See "Owner decisions" below.
- Design: `docs/reference/live-way2-phase6-design-2026-11-18.md`. Its §2 holds the measurements M1 to M7, and its §8 the critique C1 to C20.
- Numbering: both other sessions agreed on 0078 on 2026-11-18.
  - ADR-0068 to ADR-0074, and ADR-0077, are the revamp's.
  - ADR-0075 and ADR-0076 are phase 4's. Phase 4 continues from ADR-0079.
- Relation to the page-watch prototype's ADRs (none of them is rewritten):
  - Superseded for phase 1 on live pages: ADR-0001 (detection on a server) and ADR-0003 (the local Node prototype).
  - Kept from ADR-0004: its normalised hash and its error states.
  - Dropped from ADR-0004: its excerpts and its before → after view.

## Context

The Way 2 plan's phase 6 brings page watch onto Vodafone's live pages. The owner chose the browser-only form (D1). The check runs in the visitor's own browser when they visit. Production is never checked on a schedule (AGENTS.md §4.5).

Facts measured on 2026-11-18 (design §2):

1. **Vodafone's theme clears localStorage.** On every signed-out load of home, Services, RED and Cash, it calls `localStorage.clear()` (ADR-0051). IndexedDB is left alone.
2. **The Pocket's database is fixed at version 1.** `aixc-v1` opens at version 1. Adding a store to it would need version 2, and that breaks the Pocket's `open(…, 1)`.
3. **The page's region is `#main-content` on every CMS page.**
   - It is a `div[role=main]`. There is no `<main>`.
   - `/en/promotions` holds only 183 characters.
   - `/spa/` pages have no region. Their `body` holds 1,482 characters of header and footer, so a `body` fallback would wrongly pass them.
   - On CMS pages, the server's HTML matches the rendered page.
4. **URLs follow simple rules.**
   - Every CMS page is its own canonical.
   - No link ends in a slash or carries tracking parameters.
   - Paths can contain capitals (`/en/HomeDSLcatalog`).
5. **Little changed between 23 Oct and 12 Nov.**
   - Of 24 sections, 23 were identical. The 24th gained one card.
   - None of the 69 cards changed.
   - Where the cards lead: 17 open `/spa/` pages, which are drawn by script, and 6 open the e-shop, which is another origin.
6. **The core has 36 B to spare.**
   - It is 8,028 of its 8,064 B.
   - `readPage` lives in the core. If a chunk imported the live adapter, the bundler would make a shared chunk that counts against the core (lesson E5).
7. **There is a live hazard today.**
   - `vodafone-eg.yaml` has `watch.enabled: true` with a 900 s interval.
   - `tools/demo-live.ts` starts the server's scheduler.
   - So a "watch" chip pressed on a live page makes the server re-render production every 15 minutes.

## Decision

1. **A watch is a pocketed topic** (Q1). A topic is one sticker, with up to two targets.
   - **Its card target.** The card on the sticker's own page, in its own language. The watch finds it in fetched HTML the same way the Pocket finds it on a live page: `readPage(doc)`, then the Pocket's `reconcile`/`scoreOf` keys (ADR-0051).
   - **Its page target.** The page the card's link opens. There is one only when that page:
     - is on the same origin;
     - is under `^/(en|ar)/`;
     - is not in the site's crawl `exclude` list;
     - is allowed by `robots.txt`;
     - holds at least 200 characters in `#main-content`.

     Otherwise the watch covers the card alone, and the sticker says why.

   A card has one link, so a topic has at most one page target. Targets on the same URL share one fetch per run.

2. **The person asks for the watch** (Q2).
   - Every web sticker with a page offers "Tell me when this changes" in its actions row.
   - Pocketing a card does not watch it.
   - E-shop stickers get no watch in phase 1.

3. **The guide's watch chip pockets the spotlit card, then watches it** (Q3).
   1. `watch-chunk.ts` `createWatch()` asks the layer first, through `window.__aixcWatch?.fromGuide(step)`. It waits up to 3 s for `aixc:watch-ready`.
   2. The layer resolves `step.target.css` in the live DOM, then finds the adapter's card at or around that element.
   3. The Pocket pockets that card, and the watch starts.

   If the element is not a card the Pocket can pocket (it needs its chip, so a page read with coverage of at least 0.6), the guide says `watchFailed`. If the page has no layer, `watch-chunk.ts` reads the site's `watch.mode` from the session answer and, for a browser-mode site, says `watchFailed` at once: no notification prompt, no push subscription, no request. A card already pocketed, in either language, is found through the Pocket's own key and watched.

   The guide speaks only its existing `watching` / `watchFailed` lines. `guide.js` does not change.

4. **Only hashes are compared and stored** (Q5). Each hash is SHA-256 of text that has been normalised and then masked with `maskContent` (ADR-0018).
   - **The card hash** covers the adapter's reading of the card: its title, description, typed fields, the label of its call to action, and the file name of its picture. The card's link is compared on its own.
   - **The page hashes:** one of the text in `#main-content`, and one of its sorted same-origin links.
   - **Normalisation** collapses whitespace and leaves out `script`, `style`, `template`, `noscript`, `svg`, `.owl-item.cloned`, `[data-aixc]` and `[data-watch-ignore]`.

   No page text, HTML, cookie, personal data or balance is stored. A change says what changed and when, never the words. The five changes are:
   - "This card changed"
   - "The page it opens changed"
   - "It now opens a different page"
   - "No longer on its page"
   - "Its page is gone"

5. **The watch keeps its state in its own IndexedDB database, `aixc-watch-v1`, at version 1.**
   - Stores: `watches`, `targets`, `pages`, `changes`, `meta`.
   - If IndexedDB cannot be opened, the watch keeps its state in memory instead.
   - `BroadcastChannel('aixc-watch')` tells other tabs.
   - A `readerVersion` names the reading: the adapter's recognisers, the normalisation and the mask rules. When it changes, targets take a new baseline silently, so a code change never reports a false change.
   - The unseen count is derived from `changes`.
   - Removing a sticker, or emptying the Pocket, removes its watch. A target that no watch uses any more is deleted.

6. **The check runs on a visit, never on a timer** (Q7).
   - **When it runs:** once per page view, at idle, and only if the person has a watch.
   - **When it is skipped:** on Save-Data, and while a block is in force.
   - **One tab at a time:** `navigator.locks` with `ifAvailable`. A browser without the Web Locks API runs nothing.
   - **How often:** at most one run per 30 minutes per browser. A person's press takes its first baseline at once.
   - **Its rules** come from the `watch` field of the page-map answer. Without that answer, nothing runs.
   - **robots.txt:** fetched once per run, from the same origin.
   - **How many pages:** at most 12 per visit, oldest first.
   - **Pacing:** one request at a time, at least 1 s apart.
   - **Each request:**
     - uses `credentials: 'omit'`;
     - uses `cache: 'no-store'` with our own `If-None-Match` / `If-Modified-Since`, so a 304 reaches our code (no validators while a target on that page still needs its baseline, or it would never get one);
     - uses `redirect: 'manual'`, so a redirect is never followed, `robots.txt` included: a 3xx marks the page moved (its page targets "gone", its card targets "missing");
     - times out after 10 s.
   - **Pacing across runs:** the time of the last request is kept, so two presses in a row still keep requests 1 s apart. A person's press waits for another tab's run to finish instead of being dropped.
   - **Stopping:** a `403`, `429` or `503`, a 200 without `#main-content` (a bot check, on any fetch, the first included), or an answer from another origin or a path we may not fetch, ends the run and blocks further runs for 24 h. A run that stops keeps the changes it had found; one bad page never fails the run.
   - **Joining a watched page:** a sticker whose page target another sticker already watches takes its first read as a silent baseline, so it is never told of a change from before it asked.
   - **Parsing:** `DOMParser` on the main thread, one page per idle slot (Q6).
   - **The current page** is checked from fetched HTML too, never from the live DOM.
   - **Never used:** a service worker, periodic sync or a timer.

7. **URL rules.**
   - Resolve the URL and lowercase the host.
   - Drop the default port, the fragment, `utm_*`, `gclid` and `fbclid`. Sort the remaining query.
   - Strip a trailing `/`, except on the root. Keep the path's case.
   - After a fetch, use the final URL, or the canonical if it is same-origin.
   - Never fetch other hosts, `/spa/` or `/auth/`.

8. **How a change shows** (Q4). Only on the page: no system notifications and no new floating control.
   - **The Pocket button (ADR-0064)** carries a small red count of stickers with unseen changes. Its label says so too.
   - **The sticker** shows a "Changed" tag and one line: what changed, the date, and "Open the page". When there is nothing to report, it says "Watching · No change since *date*".
   - **The pocketed card's liner on Vodafone's page** shows "Changed". The liner is the layer's own overlay; Vodafone's markup is never touched.
   - Opening the album marks the changes it shows as seen.
   - **The look** follows Vodafone's design language: `#E60000`, Vodafone's faces, a 6 px radius and the palette's greys, with right-to-left layout in Arabic.

9. **Loading and isolation.**
   - The Pocket demo loads the watch chunk at idle when `demos` includes `watch`. The core gets no `DEMOS` entry.
   - The Pocket passes in its instance, its store and `reconcile`.
   - The adapter object carries `read: readPage`, 6 B of the core as built (8,033 of 8,064 B). This amends ADR-0049.
   - The watch asks the gateway's page-map answer for its rules itself (our own gateway, the page's address only, no referrer, 2 s), so the rules cost the core nothing. It asks only when it needs them, once per page view: before the check on visit when the person has watches, before a press, before fill. A page view with nothing watched sends the page map once, as before (ADR-0049; `aixc-layer.e2e` "only the page's address is sent… one request").
   - The chunk loads inside `guard.wrap('pocket watch', …)`. A watch error drops only the watch's own lines, notes, count and listeners (ADR-0052 part 3).
   - Checkpoints: `watch-start`, `watch-check`, `watch-ui`.
   - New strings live in `watch/words.js`, so the shared `i18n.js` does not grow.

10. **Server and config.**
    - The site config gets `watch.mode: browser`. For a browser-mode site:
      - `POST /v1/watch` answers `409 browser_only`;
      - `tick()` never checks it, including rows made before this change.

      This amends ADR-0023 and closes the live hazard.
    - The page-map answer carries `watch: { include, exclude, …knobs }` when `demos.watch` is on.
    - `experiences.demos.watch` is switched on in the build's last commit.

11. **Demo data** (Q8).
    - **The two cards:**
      - Home › Other services › "Internet Bundles", with its bundles page;
      - Services › Vodafone Cash › "Vodafone Cash", with the Cash page.
    - **Their baselines** are the 23 Oct capture's hashes. `tools/watch-baselines.ts` builds them with the real `readPage` and `recordFrom`.
    - **The fixture** `fixtures/replay/vodafone-eg` keeps its name and is documented as the 23 Oct baseline.
    - **Ways to start the demo:**
      - "Watch two example cards" in the album's empty state, in demo mode;
      - `?aixc-watch=fill`;
      - phase 7's Tips hub.
    - **Reset:** `reset()` deletes the database, and phase 7's Reset demo calls it.
    - **The change paths** are proven on test-only edited copies of the 12 Nov pages, labelled as such.

This ADR amends five earlier ones:

| ADR | What changes |
|---|---|
| ADR-0023 | Browser-mode sites are refused and never scheduled |
| ADR-0041 | `watch-chunk.ts` hands the guide's offer to the layer |
| ADR-0049 | The adapter carries `read` |
| ADR-0051 | A second database; a sticker's watch goes with the sticker |
| ADR-0052 | The Pocket loads the watch and gains its seams |

## Owner decisions

| # | Question | Answer |
|---|---|---|
| D1 | Browser-only, check-on-visit page watch | Approved 2026-11-17, confirmed 2026-11-18 |
| Q1 | How does a watch start? | Only from a pocketed topic: the card and the page it opens. Changes show on that card |
| Q2 | Does pocketing watch? | No. The person asks on the sticker |
| Q3 | What does the guide's chip do? | It pockets the spotlit card, then watches it, using only the existing lines |
| Q4 | How is a change noticed? | On the sticker, by a red count on the Pocket button, and by "Changed" in the card's liner. No system notifications |
| Q5 | What does a baseline keep? | Hashes only |
| Q6 | Which parser? | `DOMParser` on the main thread |
| Q7 | What pacing? | One request at a time, ≥ 1 s apart, ≤ 12 pages per visit, ≤ 1 run per 30 min, ≤ 20 watched stickers |
| Q8 | What demo data? | Two cards with 23 Oct hashes. The fixture keeps its name, `vodafone-eg` |

## Consequences

- A change shows only on the person's next visit, and only in the browser where they watch.
- A change says what changed and when, not the words.
- Each run makes at most one conditional request per watched page, 1 s apart. If Vodafone sends no validators, each check downloads the page, about 32 to 54 KB gzipped. The owner's live run will measure this.
- Wherever the Pocket is off, the watch is off too.
- The watch's own chunk is 13,608 B gzipped (budget 13.5 KB), more than the design's guess of 4 to 6 KB: it holds the store, the check, the reading, the URL, robots and mask rules, the lines and the words in two languages. It loads only where the watch is on. The demo data is its own chunk (1,742 B), loaded only by fill. The guide's `watch.js` is 1,546 B (budget 1.75 KB).
- Nothing new leaves the browser, so AGENTS.md §4.3 and §4.4 need no change.

## Rejected options

| Option | Why not |
|---|---|
| A free element picker, and section watches | Q1 |
| Watching on pocketing | Q2 |
| Excerpts and a before → after view | Q5 |
| A worker running the prototype's parser | Q6 |
| Three fetches in parallel | Q7 |
| `cache: 'no-cache'` | The browser turns a 304 into its cached 200, so our code never sees the 304 |
| Reading the current page from the live DOM | Owl's copies and script-added text could disagree with the baseline |
| A `body` fallback for the region | It wrongly passes `/spa/` pages |
| A service worker for notifications | Q4 |
| A new floating control | Q4 |
| Stores inside `aixc-v1` | They would force version 2 and break the Pocket's `open(…, 1)` |
| A `DEMOS` entry in the core | It would take about 30 B of the core's 36 B to spare |

## Pilot knobs

- `experiences.watch`:
  - `minIntervalMin` (30);
  - `perVisitMax` (12);
  - `spacingMs` (1000);
  - `maxWatched` (20);
  - `minChars` (200).
- `watch.mode`: `browser` or `server`.

## Revisit when

- Vodafone's HTML carries no validators and checks cost too much.
- A parse takes over 50 ms of the main thread.
- The owner wants the words of a change (Q5), or alerts while the person is away. Both need the server design of the prototype's ADR-0001 and ADR-0002.
- Client-rendered pages or e-shop stickers are wanted.

## Verified by

Built on `feature/live-way2-watch` (7e42fa4 to bec48c0) and checked on 2026-11-18, offline, on the saved pages:

- **Unit** (experiences, `node --test`, 369 in the suite): `watch-url`, `watch-robots` (parity with the crawler's rule over 13 robots texts, 3 agents, 21 paths), `watch-mask` (parity with `agent-mask.ts`), `watch-read`, `watch-store`, `watch-check` (51: every rule of point 6, each of the critic's findings F1 to F11 with a test that failed first), `watch-ui`, `watch-words`.
- **Integration** (Chromium): `watch-read` 4 (the 69 Arabic cards hash the same on 23 Oct and 12 Nov; both demo cards found in both languages; every CMS region at least 200 characters except `/en/promotions`; `/spa/storeLocator` not watchable; at most 5.7 ms to parse, read and hash a page), `watch-store` 3, `watch-server` 5 (409; old rows skipped; the session's `watch.mode`; page-map rules only when the watch is on), `watch-ui` 5, `watch-demo` 4, `watch-baselines` 2 (`demo.js` byte for byte from the capture), `watch-chunk` 6, `sdk-size` 5.
- **End to end:** `watch-live` 9/9, from its request log:
  - at most 12 pages plus `robots.txt` per visit, and at least 1,000 ms between request starts;
  - no cookie on any watch fetch, and a 302 never followed;
  - a 403 stops the run and blocks for 24 h;
  - a 304 is never parsed, and two tabs make one run;
  - no `POST /v1/watch` and no notification prompt from the guide's chip;
  - nothing left the machine.
- **Floating controls:** `watch-floating` 8/8 (the count, the liner and the album, desktop and phone, English and Arabic, banner absent and present); the matrix unchanged at 48 cells; `pocket-actors-live` 34/34.
- An independent Opus critic reviewed steps 2 to 4 and found eleven defects, one high (redirects were followed). All are fixed (4e7447f).

Not yet verified: the owner's one opt-in live run (`VG_LIVE=1`). It measures validators, whether a cookie-less fetch meets a bot check, `robots.txt`'s rules, the parse time on the demo Mac, and what changed since 23 Oct.
