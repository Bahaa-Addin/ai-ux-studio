# E-shop work: the three plans judged, and one merged plan (2026-11-13)

I only read files; I changed nothing. I contacted no live site and ran no browser or test suite. The only thing I measured was the `guide.js` that is already built on disk.

The three designs are called **Plan S** (safety first), **Plan D** (demo value first) and **Plan A** (architecture first) below.

**Terms used below**
- **Guide point**: a price or stock value kept in the knowledge base, with its date. It is used only to find the right page or card. It is never spoken or shown.
- **Commit control**: a button that buys, reserves, subscribes, pays, picks a number or gives consent.
- **Value gate**: one server function that strips prices and stock from anything the guide says or shows.
- **Attested report**: a price report that the demo browser's own Node process vouches for. The page can never see or fake it.
- **Bridge frame**: a hidden frame served from our gateway's own address. It holds the Pocket's identity, so Vodafone's page never holds it.
- **Held sync**: a knowledge refresh that stops for review before it goes live.
- **Carry-over**: a refresh of one origin (one of the two Vodafone sites) keeps the other origin's pages.

---

## 0. Facts on disk that changed since the three designs were written

1. **The next free ADR number is 0058.** ADR-0053 to 0056 exist, untracked, and are listed in `docs/adr/README.md`. **ADR-0057** ("guide.js budget 21 KB") was written at 15:18 today. All three plans say 0053 or 0057, and both are now wrong. Your rule "numbered in the order written" gives 0058.
2. **guide.js size.** `packages/sdk/dist/guide.js`, built at 15:19, is **20,710 B** gzipped (Node zlib level 9, as the size test measures it).
   - The budget in `tests/unit/sdk-size.test.ts` is now **21,504 B** (ADR-0057, accepted by the owner on 2026-11-13). That leaves about **794 B** of room.
   - Against the old 20,480 B budget it is about 230 B over.
   - Plan D's figure of 21,199 B is out of date.
   - Conclusion: e-shop features add nothing to guide.js beyond a few measured calls.
3. **HEAD is fbb5990, not b940f58.**
   - The record.js and store.js fixes are committed (3e07bfd).
   - **Decision 6 is already done** (fbb5990). The replay message now says unsaved pages and the e-shop open from the internet, and the runbook says so too.
   - The public-demo session still has uncommitted edits in guide.ts, server.ts, config.ts and demo-browser.ts. E-shop steps that touch those files land after that work is committed.
4. **Nothing is deployed** (HANDOFF.md:143). But `extension/dist` was built at 14:45 and points at `https://vg-public-demo.fly.dev`, with Claude as the public agent model (ADR-0054). Today's unguarded agent therefore becomes a public risk the day that gateway goes up.
5. **Three gaps I verified, which the plans missed or only partly named:**
   - **The agent has no guard on consent or the accessibility widget.** SPEC-03 §2 says the agent's blacklist includes `#onetrust-*`. But agent.ts:46 blacklists only the knowledge base's commit selectors, and the knowledge base has none. So the agent could press OneTrust's "Accept all" (consent is a commit point under AGENTS 4.1) on web as well as on the shop.
   - **All shop list links get the same link key.** `keysOf` (live-adapter.js:132-139) keeps only `pathname`. Every `list?categoryUrls=…` link therefore becomes `eshop.vodafone.com.eg/list`. Plans S and A fixed the host but not the query.
   - **A bare sync reaches the shop today.** `npm run sync -- --site vodafone-eg` with no `--origin` crawls both origins (jobs/sync.ts:37, sync-lib.ts:71-79). If robots.txt cannot be fetched, everything is allowed (crawl.ts:48-51, 187-189). Plan S named this; the others did not.

---

## 1. Which design is best per topic, and why

| # | Topic | Best base | Taken from the others | Rejected, and why | Claims I checked in the code |
|---|---|---|---|---|---|
| 1 | Price questions | **Plan S**: one value gate where the planner returns, with labels kept as built | D: guide points worked out at index time from the committed manifest (no rebuild is possible offline, because `data/crawls` is absent); the gate on agent hints, plus a prompt line. A: no ids built from prices, timed for the held web sync | A's split of every speakable field: it rewrites 294 strings and renames ids before any sync, which is a scrub in all but name, and it loosens `target.text` locators. Your decision 2 keeps the values. | Every plan leaves through one `out()` (planner.ts:35). Clarify options (:52-55), hints (:63-70), the watch label (:141), summary labels (:149-154), the collection label (:175-176) and picture descriptions (:196-197) all come from knowledge-base text. `knownLines` (plan.ts:75-83) feeds speech:warm. Verified. |
| 2 | Background updates | **Plan A's ledger** (reports deleted after 48 h, an overlay over versions that never change, an append-only audit, rules for when a new version goes live) | D: a report counts only if the session's own plan asked this browser to read that destination (the session keeps its active plan, types.ts:58). S: off by default, rule R1 through the Node forwarder in live mode only, R2 off and refused on the public gateway, the 0.5-2× band, caps, a list of held reports | A's "read every point on the page when it settles": more traffic, and reports not tied to any question | The site key is public (ADR-0056 §3, line 12). The forwarder copies headers on the Node side (demo-browser.ts:189-210). The precedent route is server.ts:273-297. Read values reach traces today (executor.ts:154-157; server.ts:248). Verified. |
| 3 | Commit guard and pointer | **Plan A's layering**: one shared classifier as data; commit pages by URL; a capture-phase stop of synthetic clicks during an agent run; the guidance in an on-demand chunk | S: the centre hit-target check; overriding `select_dropdown_option`; `execute_javascript: null`; commit-intent words become a confirm step; the public-start refusal. D: the confirm step gains `ui.pointAt` (one call) | S's `guideToCommit` inside guide.ts: bytes the budget does not have | page-controller.js:110-152 clicks the centre of the element and sends the click to whatever `elementFromPoint` finds there inside it, so clicking a card can press its cart button. Only click and input_text are overridden (agent.ts:73-104). The core deletes a tool set to `null` (page-agent-core.js:456-463). The executor's `.click()` is synthetic, so a capture-phase guard can catch it. Verified. |
| 4 | Crawling the shop | **Plan S** (the most complete set of safeguards and the explicit "shop not ready" switch) | A: seeds read from the page's own menu response during the crawl (no extra request); scripts off on CMS pages by a full-URL rule. D: hand-written stand-in shop pages | D's tool that decodes your browser profile's cache (the eshop map already read it once; a hand-written seed file is enough) | Robots fails open; it is fetched without our user agent; one pause per worker; a bare sync reaches both origins. Verified. |
| 5 | Server Pocket store, identity | **Plan A's bridge frame** (the id never enters Vodafone's page world; no cookie; one mechanism for every carrier; store.js reused unchanged inside the frame; tabs on both origins kept in step) | S: server-side checks and refusals, limits, the public-start refusal, a measured spike first; S's partitioned cookie as the fallback if the spike fails | D's id in a `data-` attribute that Tealium or Dynatrace can read | Interface at store.js:147; seam at demos/pocket.js:33; both origins share one partition under `vodafone.com.eg` (eshop map). The loader runs only in top-level frames (loader.ts:73), so the bridge frame is not touched by it. |
| 6 | Album with shop-linked stickers | **Plan S's** small record change (`source.site`, a missing value reads as web; `origin` kept) | D: land it **before S6**, while no person has kept a sticker on live yet, so nothing needs migrating. A: link keys without the language; whether a CTA leads into a commit flow worked out from the shared classifier (worked out when it opens, not stored) | A's rename of `origin` to `addedBy`, and a v3 bump: churn for no gain | record.js:20-21, 41-67 (`isRecord` needs v 2); live-adapter.js:137-138 drops the query. Verified. |
| 7 | Layer and Pocket on the shop | **Plan S**: a read-only adapter, an element map, **0 writes inside `<vf-root>`**, the deny check before anything else | A: separate scopes for the document and for each route; the album as a fixed panel instead of hiding `vf-root`; no second history wrapper. D: start on stand-in pages now | D hiding `vf-root` during the page turn; A writing `data-aixc-*` inside Angular's tree | loader.ts:20-21 and 93-96 (web only, `#main-content`); demos/pocket.js:36 captures the page once. Verified. |
| 8 | Your live visits | **Plan A's** checklist tool in a **fresh, separate profile**, with you doing the clicks | S: the guide and the layer off for visit 1; at most 25 loads; one batch of results per visit; results committed as dated facts | D's visit with the guide on | `tools/live-crawl/extract-entry.ts:8` removes the banner and the widget from your own tab. It must never be used on the shop. |
| 9 | Fit with phase 3 | **Plan S's** waves | D: the record change before S6. A: write the e-shop ADRs first, as S0 did for ADR-0050, so their numbers are fixed | Plan A's full route-scope refactor during S6: the same files are being edited, and shop chips wait anyway | Phase 3 dependencies (phase 3 map :218-300). |

---

## 2. The design per topic, as decided

### 2.1 Price questions, answered without quoting the knowledge base
- **Nothing is removed from the knowledge base.** Labels keep their prices, because those words help matching (your decision 2).
- **Guide points.** `guidePoints(d)` in `shared/kb-index` reads the price (EGP, جنيه, ج.م, LE, in Western or Arabic-Indic digits) and stock from each item's labels and target text. This works on today's committed manifest (Plan D). At the next sync the builder also writes a typed `Destination.guide = {price, stock, seenAt, source}` from the collection's field values, and the index prefers it when it exists (Plan S).
- **The value gate.** `valueFree(text, lang)` lives in `packages/text`. It shares one pattern source with the price filter in `experience.ts:104`.
  - It is applied in the planner's single `out()`: the opening line, say steps, questions and their options, captions, confirm messages, and the hints sent to the agent model.
  - It is also applied to page-map titles and page titles.
  - A short list of exceptions keeps names that contain numbers ("25-55", "Flex 1400", "5 GB").
  - When two clarify options become the same after stripping, the guide shows both cards and reads each one live.
- **"Around 50 pounds" / "حوالي ٥٠ جنيه", "under", "over", cheapest, "in stock".** The router ranks items by guide point. The plan uses steps that already exist: go to the page (a hand-off when the origin changes), reveal, pick the item by key, spotlight it and read it live. **The number spoken always comes from the live page** (phrases.ts fills `{price}` from the read).
- **When the card is gone,** the guide says it cannot see it on the page now and highlights the list. It never falls back to the stored value. Follow-ups read the page again. The session keeps keys, never values.
- **The agent's prompt** gains: "Never state a price or stock you did not read on this page in this task."
- **AGENTS.md 4.3** is rewritten to the text you approve (proposal in §5, Q3). SPEC-03 §4.3, SPEC-04 §1 (the "Values" row) and ADR-0011 §3 are amended to match.

### 2.2 Updating guide points in the background from the visitor's page
- **What triggers a report.** The planner marks a live read with `observe` only when all of these hold:
  - the destination has a guide point;
  - its page is public (not sign-in, account, login or checkout);
  - it is not a commit destination;
  - `kb.observations.enabled` is on (off by default).
- **In the browser.** After reading, the guide passes the raw field text to an on-demand chunk, `observe.js`. The gate in guide.js costs about 30 B, measured, and is paid for by E3.
  - The chunk reads only inside Vodafone's own content (`#main-content` on web, `vf-root` on the shop), never inside `[data-aixc]` or `[data-vg]` copies.
  - It parses the value, runs `maskContent`, and drops the report if anything got masked.
  - It sends only a value that differs: `{siteKey, kbVersionId, sessionId, turnId, step, destinationId, field, value}`. No text, no URL, no page content.
  - It never runs in replay or on the clone.
- **The gateway: `POST /v1/kb/observations`**, built on the pattern of the contributions route.
  - Three switches: the site config, the platform setting `VG_KB_OBSERVATIONS`, and the public gateway refusing rule R2 unless it is set on purpose.
  - A strict schema of at most 2 KB, and the active knowledge version only.
  - The destination must exist, be public, not a commit, and have that field.
  - **The report must match step *i* of the session's own plan**, made in the last 15 minutes, and be the first report for that destination in that session.
  - A rate limit per address. Traces keep counts only.
- **Rules against bad reports.**
  - **R1, attested:** the demo browser's Node forwarder adds `x-vg-observer: <token from the environment>` only in live mode, never in replay or tests. The gateway compares it in constant time. One attested report applies.
  - **R2, corroborated:** off by default, and refused on the public gateway unless set. Two matching reports from different sessions and different salted address hashes, each tied to a real turn, within 24 h, with no contradicting report.
  - **Both rules:** a new price must lie between half and twice the old one, or it is held for you. At most one change per item per day, and a daily cap per site.
  - The site key is never trusted: it is public.
- **Storage.** Three tables: `kb_point_reports` (deleted after 48 h), `kb_points` (the current overlay) and `kb_point_events` (an append-only audit, with the rule that accepted each change).
  - The overlay sits on top of the active version, so no new version and no structural change is made.
  - `npm run kb -- --points [--held|--accept|--revert|--freeze]` manages it.
  - kb-diff and the churn gate ignore points. When a new version goes live, older rows are retired and rows whose destination is gone are listed.
- **Limits.** No request to Vodafone is ever made because of a report. Crawling stays on demand only (PRD D3). Because guide points are never spoken, the worst a bad point can do is send someone to the wrong card, where the live read still tells the truth.

### 2.3 The agent's commit guard and the guiding pointer
- **Rules as data.** `packages/kb/src/commit.ts` holds one pure `classify()`, shared by the planner, agent.js and the crawler. It is fed by:
  - a built-in floor that the site config can extend but never shrink;
  - a per-origin `commit:` block in the site config.
- **What the floor contains.**
  - Selectors: `#sl-add-to-cart-button`, `#sl-button-buy-now`, `button.cart`, `[id*=add-to-cart i]`, `[id*=buy-now i]`, `button:has(img[alt*=cart i])`, `[aria-label*=cart i]`, OneTrust's controls (`#onetrust-*`) and the accessibility widget.
  - Words in English and Arabic, matched after Arabic normalisation: add to cart, buy (now), checkout, reserve, subscribe, choose/select number, pay, place or confirm order, recharge, transfer; أضف إلى السلة, اشتري (الآن), اشترك, احجز, ادفع, إتمام الشراء, اختر الرقم, تأكيد الطلب.
  - Words are checked against the text, aria-label, title, value and the alt text of pictures inside the control, which catches icon-only buttons.
  - Commit pages: cart, checkout/*, `lines/*/numbers`, `lines/*/review`, dsl-checkout, *subscription-details, payment.
- **Server side.**
  - `pageContext` adds the site's selectors to `commitTargets` on every page, even when the knowledge base does not know the page or there is no knowledge base.
  - On commit pages it adds a `:root` placeholder, so guide.js's existing CommitGuard refuses every click there with no new bytes.
  - The planner: commit-intent requests ("add it to the cart", "ضيفه للسلة") become a **confirm** step, never an agent task. There is no click step on commit words, and no agent step on an origin whose guard is empty.
  - The public gateway refuses to start when the agent is on and any origin lacks a guard.
- **In agent.js** (an on-demand chunk; 0 bytes in guide.js):
  - every match of every selector is hidden from the model, rebuilt before each step, instead of the first 4;
  - every click, select and input target is classified live: the element, the point at its centre, its button/link ancestor, and its children;
  - `select_dropdown_option` is overridden with the same check;
  - `execute_javascript: null`, with a test that the agent's tool set is exactly the allowed set;
  - during a run, a capture-phase listener on `window` stops synthetic clicks and submits on classified elements, so the person's own real click still passes;
  - on commit pages the agent acts on nothing;
  - the prompt tells the truth.
- **Guiding the person.** A new tool `show_person_where({near_index?})` finds the commit control next to the item. Any refused click does the same.
  - The guide scrolls the control into view and **glides its own pointer** to it, with no tap (`voiceGuide.ui.pointAt(el, false)`).
  - It adds the commit highlight and a slow pulse.
  - It shows a caption and says one line in the person's language ("This is where you add it to your cart. Press it yourself when you're ready.").
  - It ends the task. The guidance stops when the person clicks the control, presses Esc or the microphone, changes route, when the control disappears, or after 30 s. With reduced motion there is no glide, only the highlight.
  - It keeps clear of the accessibility button, OneTrust and TOBi.
- **Commit points the knowledge base knows** (confirm steps) get the same `ui.pointAt` call in executor.ts. That is one measured line in guide.js. Later commit points marked in the knowledge base use the same path.

### 2.4 Crawling the whole shop menu, and its safeguards
- **Seeds.**
  - A committed `config/sites/vodafone-eg.shop-menu.json`, written by hand from the cached MAIN_NAVBAR response (12 Nov; paths and labels only; source named), plus FOOTER if you agree (Q8). It is expanded to /en/ and /ar/: home, `list?categoryUrls=` for the 24 categories, `/lines/flex/plans`, `/internetServices/at-home` and `/internetServices/dsl`. About 56-60 pages.
  - It is cross-checked against the 28 shop links on the saved web pages.
  - During a crawl, the crawler keeps the page's own menu response, without making an extra request, and reports any difference from the seed file. It never adds pages silently.
- **Depth.** The shop is crawled at depth 0-1 and follows real links only. Products are items of the lists, because the cards link to `#`.
- **Always out, at any depth, ignoring case, checked before robots and before any request:** cart, checkout, wishlist, register, account, profile, order-status/details, payment, saved-payments, vouchers, returns, dsl-checkout, *subscription-details, documents, `lines/*/review`, **`lines/*/numbers`**, legacy `/shop/` paths, every robots Disallow line, and any redirect to the sign-in host.
- **robots.txt** fails closed per origin: a 5xx, a timeout or a network error means nothing is allowed. It is fetched with our user agent and saved verbatim with the crawl.
- **Pacing per origin:** at least 1 s between navigations to one origin. The shop's default is 2 s (a knob) with 1 page at a time; web allows 2 at a time. Back off on 429 and 503 and honour Retry-After. A status of 400 or above is not a page. The **first sign of a bot check on the shop stops the whole run**.
- **Waiting and scripts.** Wait until `vf-root` or `app-root` has children and the page has been quiet for 300 ms, with a 20 s cap. Scripts run on the shop and `/spa/`, and stay off on CMS pages, as in the committed crawl.
- **Never:** clicks, scroll-to-load, typing, cookies, or answering the cookie banner.
- **Extraction.**
  - Commit points outside forms, through `classify()`.
  - Page kinds for transactional pages.
  - Stable ids for pages kept by their query (`shop.list.smart-phones`), and a fix for the stacked id suffixes.
  - The three category spellings (`*x`, `/x`, `%2Fx`) become one key.
  - Item names from title classes, so they hold no price.
  - Guide points from the cards.
- **Sync rules.** Page caps per origin (shop 80). Origins that a run does not crawl are carried over, or the run is refused. The web-only held sync comes first, then `--origin shop --dry-run`, the report, and only then going live.
- **The crawler keeps its name** `VodafoneEG-VoiceGuide-Crawler/0.1`.
- **A switch in code,** `crawl.origins.shop.ready: false`, refuses every shop request until all of this is in with green tests.

### 2.5 The Pocket's server store, and one identity across both origins
- **Three identities stay apart.** The guide's tab session (ADR-0016) and the trail are unchanged. The Pocket gets its own random 128-bit id. It is never joined with traces.
- **The bridge frame.**
  - `GET /sdk/aixc/bridge.html` and `bridge.js` are served from the gateway with a strict CSP (`default-src 'none'`), and `frame-ancestors` set to the two Vodafone origins.
  - The frame is hidden, is a child of `body` outside `vf-root`, carries `data-aixc`, and is invisible to assistive technology.
  - Inside it, **store.js runs unchanged** as the local copy, in one partition shared by both origins (one site, `vodafone.com.eg`). Its BroadcastChannel keeps tabs on both origins in step.
  - The frame syncs with the gateway: `GET /v1/pocket`, `PUT/DELETE /v1/pocket/:key`, and `DELETE /v1/pocket` to forget everything. The latest write wins by server revision. Deletions are kept as markers. Writes queue while offline.
- **The page side.** `experiences/src/pocket/bridge-store.js` offers the existing store interface over a MessageChannel, with origin checks. So `initPocket` and its store seam do not change.
  - The first open uploads that origin's local `aixc-v1` records once, through the same checks.
  - If the frame or its storage is blocked, the local store is used and the album says "kept on this site only".
- **Server.**
  - `services/pocket/` is a handler map, with Postgres tables and the memory store. The id is stored only as an HMAC.
  - It accepts only requests from the gateway's own origin (the frame).
  - **It refuses** a record that fails `isRecord`; more than 200 records; a record over 4 KB; any string that `maskContent` changes; URLs off the two origins or Vodafone's picture paths; query keys not on an allowlist (stripped, for example `search=`); source pages that are not public (cart, checkout, account, signed-in `/spa/`, shop transactional routes).
  - A Pocket unused for 30 days expires (a knob). Clear deletes on the server. Traces keep counts only.
- **Carriers.**
  - Public gateway, extension and Mode A: a new loader option `bridge` set to the gateway's own address.
  - Demo browser: a made-up origin that the demo browser routes to the local gateway, because SPEC-03 §1 rules out localhost from https pages.
- **The public gateway refuses `pocket.store: bridge`** without limits, expiry, and either Postgres or an explicit "the memory store forgets on restart".
- **Spike first,** offline. Synthetic pages under both real origins, in offline replay, frame the routed bridge. Measure shared IndexedDB and BroadcastChannel in Chromium and Firefox. Measure Plan S's partitioned, HttpOnly cookie in the same spike as the fallback.
- **The ADR states plainly** that Vodafone's own page scripts could ask for a visitor's stickers under either design. Stickers are Vodafone's public copy, dated, never personal data.
- **Documents changed:** it supersedes ADR-0051 §1. It amends ADR-0048 §4 (a new HTML route), ADR-0053 §1 (loader options), live plan §3.9 ("nothing new leaves the browser") and the Pocket note in AGENTS 4.3.

### 2.6 The album showing web cards that link to the shop (reading 1)
- **Record.** `source.site` is `'web'` or `'shop'`; a missing value reads as web, so `isRecord` stays at v 2 and web page keys do not change.
  - A shop page key is `shop:` plus the path without its language plus the normalised `categoryUrls`.
  - **Link keys** are host plus path without language plus normalised `categoryUrls` for shop lists, on both origins.
  - The Pocket's page becomes `page()`, a function, so a later route change can update it. No change on CMS pages.
- **Album.** Stickers are grouped by site and page. A small "In the shop" / "في المتجر" marker, in Vodafone's style, sits on CTAs that lead to the shop. Copy and price stay as published and dated.
- **Opening (in S13).** A CTA into the shop shows the picture preview, then a normal navigation, with 0 extra document requests. The shop sends no-store, so OD-4's cache plan cannot apply there. A CTA into a commit URL, or whose label `classify()` marks, opens natively with no portal animation. Vodafone's own links stay native.
- **In replay,** shop links open the live shop (your decision 6). The console already says so.

### 2.7 The layer and the Pocket on shop pages (reading 2, sub-phase "3-shop")
- **Loader.** `experiences.origins`:
  - web: needs `#main-content`, plus paths;
  - shop: needs `vf-root` to have children, plus an allow list (home, `list?categoryUrls=`, `/lines/*/plans`, the DSL and at-home landing pages) and a deny list (the transactional list and `lines/*/numbers`).
  - On the shop, aixc.js is added to every document, because the app can route into an allowed page later. The layer decides on each route.
- **Routes.** The layer listens to the Navigation API's `navigatesuccess` and to `popstate`, read only. The guide's existing history wrapper stays the only one.
  - **On every route, the deny check runs first.** A denied route stops everything of ours and gives the page back.
  - An allowed route waits for `vf-root` to be quiet (300 ms, 6 s cap), reads the page again, fetches the page map again, and updates `page()`.
- **ShopHost.**
  - Our regions are `body` children after `vf-root`. **We write nothing inside `vf-root`**: the adapter is read-only and keeps an element map, not tags.
  - The album is a fixed panel below the shop's header and below OneTrust. There is no page turn over Angular's root.
  - Protected (never covered or changed): the shop header and footers, OneTrust, TOBi, `vf-floating-section`, and the accessibility widget if it exists.
- **Cards.** Recognisers for `vf-product-card`, `vf-bundle-card`, `vf-device-card`, `vf-offers-card` and `vf-category-card` are confirmed on your saved pages. Keys: the picture's asset name, the title, its numbers, and the `/prod/` slug where present. Re-matching is measured as in ADR-0051.
- **Pocket on the shop:** album only, no chips. One Pocket with web through 2.5; without it, a separate Pocket, and the album says so.
- **Unchanged on the shop:** the agent guard; the trail's private paths; no accessibility-button lift (S11 stays web only); "Your journey" in the guide's sheet (OD-5); `?aixc=off`.
- **Order of work.** Part a (loader, routes, ShopHost, album) starts after S7 on hand-written stand-in pages. Part b (recognisers, real geometry) waits for visit 1's saved pages.

### 2.8 Your live visits
Rules for every visit:
- O29 updated first;
- off-peak Cairo time, signed out;
- at most 1 page per second;
- stop on a bot check, with no retry;
- no commit control pressed and no form typed into;
- one new behaviour per visit;
- results committed as dated facts, with the audit's "re-verify" marks updated.

| Visit | What it does |
|---|---|
| **V0** | You update O29: what ran on 12 Nov, and whether the live site now answers the demo browser. |
| **V1, facts and saved pages** | A checklist tool in a fresh, separate profile. The guide, the layer and the agent are off. You click. 25 page loads or fewer. Records: robots.txt of both origins, verbatim; header and cookie names (no values); OneTrust, widget and TOBi boxes in EN and AR at 1366 and 375; the address-bar spelling of category lists; where dsl/bundles lands; how long until `vf-root` settles, and whether networkidle ever comes; card attributes; route events; whether `#vgh` survives; whether storage survives a reload; the sign-in control (the signed-out marker). If you open `/lines/red/numbers` by hand, as any visitor would, it records the request names. It saves the rendered DOM (scripts stripped) and the raw HTML of 4-8 public pages after a personal-data scan, plus the page's own menu JSON. |
| **V2** | The web-only held sync (runbook §5.1). |
| **V3** | The first shop sync: dry run, report, then going live. |
| **V4a** | S17, the web Pocket smoke. |
| **V4b** | The shop smoke, on a separate run. |

### 2.9 How this fits phase 3
Wave 0 closes what is exposed today (E0-E4). Phase 3 then resumes, with the record change just before S6. The jobs, router and gateway work runs in parallel on other files. The live visits follow O29. Sub-phase "3-shop" comes last. No phase 3 step depends on the shop. The shop depends only on S7 (the record) and S13 (the portal rules).

---

## 3. The ordered steps

**ADR numbers.** Following your rule, E0 writes the six e-shop decisions you took today as Proposed ADRs, in this order, so their numbers are fixed (as S0 did for ADR-0050): **0058** commit guard, **0059** guide points, **0060** the shop in the knowledge base, **0061** background updates, **0062** server Pocket store, **0063** layer on the shop. Each gets its Built section when its step lands. S11's lift ADR and S13's portal ADR then take the next free numbers (expected 0064 and 0065).

| Step | What | Live or you? | Wave, beside phase 3 |
|---|---|---|---|
| E0 | Documents and the six Proposed ADRs | You confirm numbering | 0, now |
| E1 | Commit guard and pointer | You review the word list | 0, before S6 |
| E2 | Value gate, guide points, AGENTS 4.3 | You approve the wording | 0 |
| E3 | Traces and turns hold no page values | — | 0 |
| E4 | No sync reaches the shop yet | — | 0 |
| E5 | Records know their site | — | Just before S6 |
| (S6, S7 + album marker, S8-S15; S13 with the shop rules) | | | Phase 3 |
| E6 | Price questions | — | 1, beside S6-S13 |
| E7 | Crawler safeguards | You choose the pace and cap | 1 |
| E8 | Shop extraction, stable ids | You decide price-free ids | 1-2 |
| E9 | Tool for visit 1 | — | 1 |
| E10 | O29, then visit 1 | **Live, you** | When O29 is updated |
| E11 | Commit visit 1's results | You decide `/numbers` | 2 |
| E12 | Background updates (off) | You choose the switches | 2 |
| E13 | Web held sync (V2) | **Live, you** | 2 |
| E14 | First shop sync (V3) | **Live, you** | 2-3 |
| E15 | Server Pocket store via the bridge (off) | You approve the identity | After S7, beside S8-S13 |
| (S16 with shop and commit cells; S17 = V4a) | | **Live, you** | 3 |
| E16 | Layer and Pocket on the shop | You confirm the allowlist | a: after S7; b: after E11 |
| E17 | Shop smoke (V4b) | **Live, you** | 4 |

### E0. Documents and ADR numbers (risk low)
- **Changes:**
  - Write ADR-0058 to 0063 as Proposed, each with Pilot knobs and Revisit when, with rows in README.
  - Fix ADR-0052 §8's "ADR-0053" (lift), and the phase 3 map's 0053/0054 reservations, which become "next free when written".
  - Add an "E-shop" section to `docs/handoff/live-demos-way2.md`: your 8 decisions, steps E1-E17, sub-phase 3-shop, and notes in §3.5 and §3.9.
  - Record that decision 6 is done (fbb5990).
- **Check:** the README rows match the files; no document names 0053 for the lift.
- **Live:** no. **You:** confirm that 0053-0057 keep their numbers (C1). **Depends on:** nothing. **Where:** now.

### E1. Commit points guarded in code on every origin; the guide shows the person where to press (ADR-0058, risk medium)
- **Changes:**
  - `packages/kb/src/commit.ts` (floor plus `classify()`); a `commit:` block per origin in the site config, with its schema in config.ts.
  - pageContext merges the selectors and marks commit pages (`:root`), also with no knowledge base.
  - Planner: commit intent becomes confirm; no click on commit words; no agent step on an origin without a guard.
  - agent.ts as in 2.3: all matches, the centre-point and ancestor checks, the select override, `execute_javascript: null`, the capture-phase guard, commit pages, a truthful prompt, `show_person_where`, guidance then the end of the task.
  - The executor's confirm gains `ui.pointAt(el, false)`.
  - The public gateway refuses to start when the agent is on and an origin has no guard.
- **Fixture:** hand-written stand-in pages, served by offline replay under the real shop URLs, with no Vodafone code or copy:
  - home EN/AR;
  - lists in both spellings;
  - a product page with the sl-* ids;
  - 20 cart buttons outside forms, some icon-only with alt "cart";
  - a card whose centre lies on its cart button;
  - Arabic labels, a number-picker select, an OTP input;
  - a `vf-root` filled late by an inline script;
  - a click-only menu, `/en/cart`;
  - OneTrust and widget stand-ins.
- **Checks (each fails on today's code first):**
  - a stand-in model clicking the card fires its cart handler today, and 0 times after;
  - the pointer ends within 2 px of the control's centre, `.spot.commit` shows, the line is spoken, and the task ends;
  - all 20 controls, the icon-only one, "اشتري الآن", the sl-* ids and the number picker are refused;
  - an `el.click()` during a run is stopped, while a real Playwright click reaches the page once;
  - OneTrust's "Accept" stand-in is refused;
  - the tool set is exactly the allowed one;
  - planner tests: "add it to the cart" and "ضيفه للسلة" on a shop URL give a confirm step;
  - `public-config.test.ts` refuses the unsafe start;
  - near misses stay clickable ("Sort by price", "Details", "Compare");
  - a demo-browser e2e on the fixture shows no cart request in the network log;
  - sdk-size: guide.js within 21,504 B, with the number recorded; agent.js within its budget;
  - then typecheck, `npm test` and `test:e2e`.
- **Live:** no. **You:** review the word list (Q4). **Depends on:** E0, and the public-demo work committed (config.ts, server.ts). **Where:** wave 0, before S6. It must be in before visit 1 and before any public deploy.

### E2. The guide never says or shows a stored price or stock; prices stay as guide points (ADR-0059, risk medium)
- **Changes:**
  - `valueFree()` with its exception list, applied in `out()`, page-map titles, page titles and agent hints;
  - the "show both" fallback;
  - `guidePoints(d)` in kb-index;
  - the agent prompt line;
  - AGENTS 4.3, SPEC-03 §4.3, SPEC-04 §1 and the ADR-0011 §3 note;
  - clear the speech cache of lines the gate now changes (hygiene).
- **Checks:**
  - a sweep over every destination of the committed manifest, for each intent (go, describe, pick, clarify pairs, watch), in ar and en: 0 money or stock in plan text, in `knownLines` and in hints. It fails today, for example on the label "5 جيجا 46 جنيه";
  - the `speech:warm --dry-run` lines are scanned the same way;
  - gate tests: Arabic-Indic digits are stripped; "25-55", "5 GB" and "Flex 1400" are kept;
  - `eval:router` within ±1 case of today.
- **Live:** no. **You:** approve the 4.3 wording (C3). **Depends on:** E0. **Where:** wave 0, in router and kb files only.

### E3. Traces and session turns hold no page values, raw words or full URLs (bug fixes, risk medium)
- **Changes:**
  - the executor's spotlight returns "read N fields", not the text (executor.ts:157);
  - `/v1/progress` keeps an allowlist of attributes (server.ts:248);
  - the router masks the request text before `turn.received` and before `Turn.utterance` is stored (handlers.ts:89, :143);
  - URLs in traces become path plus kept query;
  - agent step labels are masked, and agent-mask catches `nationalId`;
  - the trail's private paths gain order-status, numbers, review, subscription-details, documents and dsl-checkout; its private fields gain national-ID and phone inputs.
- **ADR:** none new. Amendment notes in ADR-0018 and ADR-0037 §3, and bug-log entries (AGENTS 4.3 and 4.4 are already broken today).
- **Checks:** an integration test where a turn says "01012345678" and a spotlight reads "46 EGP": neither reaches `trace_events` or the session row. It fails today. A trail unit test (`input[name=nationalId]` makes the page private). sdk-size recorded; it is expected to drop, which pays for E1 and E12.
- **Live:** no. **You:** nothing. **Depends on:** nothing. **Where:** wave 0.

### E4. No sync reaches the shop until its safeguards exist (risk low)
- **Changes:** `crawl.origins.shop.ready: false`. `runSync` and `runIngest` refuse any run that includes the shop while it is false. Runbook §5.1. A regression test that the replay banner never says "offline" unless `offline: true` is passed (the message itself is already fixed).
- **ADR:** none new. It enforces the 2026-10-23 stop (ADR-0032) and is recorded in ADR-0060.
- **Check:** `runSync` with no `--origin` refuses before any fetch (a stub fetch counts 0). It fails today.
- **Live:** no. **You:** nothing. **Depends on:** nothing. **Where:** wave 0.

### E5. Records know their site; shop links keep one key (ADR-0051 amendment, risk low to medium)
- **Changes:** 2.6's record, page-key and link-key rules (record.js, live-adapter.js `keysOf`); `page()` as a function (demos/pocket.js:36).
- **Checks:**
  - pocket-record tests: web `/` and shop `/en/` are different pages; two category lists are different; the three spellings are equal; an old record reads as web; the same shop link gives the same key read on web and on the shop;
  - live-adapter re-match no worse and never wrong (home 10/10, Cash 8/8, Services 29/30, RED 7/8, bundles 19/20);
  - experiences `npm test`, pocket_e2e and pocket-live e2e green.
- **Live:** no. **You:** nothing. **Depends on:** E0. **Where:** just before S6, so chips write the new format from the first sticker.
- **S7 adds** the album's grouping by site and page and the "In the shop" marker. **S13 adds** the shop rules of 2.6.

### E6. Price questions found by guide points, answered from the live page (ADR-0059, risk medium)
- **Changes:** `understand()` parses around, under, over, cheapest, dearest and in stock, in both digit systems. The router ranks by guide point. The plan is go, reveal, pick by key, read live. Reply templates hold only live slots. A missing card gives "I can't see it on the page now". New cases go in `vodafone-utterances.yaml`.
- **Checks:** `eval:router` with new held-out cases; planner tests (no value in any text, the read is live); an e2e on demo-telco where the knowledge base's point differs from the page: the guide speaks the page's value; E2's sweep stays green.
- **Live:** no. **You:** nothing. **Depends on:** E2. **Where:** wave 1, beside S6-S13.

### E7. Crawler safeguards for the shop: the whole menu, robots failing closed, pacing per origin (ADR-0060, risk medium)
- **Changes:** everything in 2.4 except extraction: robots, the per-origin scheduler, back-off, errors, the bot-check stop, the never-click test, caps, carry-over, excludes, the committed menu seed file with its comparison against the page's own menu, the settle wait, the scripts rule, and a hand-written third shop origin in `fixtures/sites/demo-telco`.
- **Checks (each fails first):**
  - a stubbed robots 503 gives 0 pages;
  - every recorded Disallow line has an exclude;
  - timestamps at least 1 s apart per origin, and never 2 shop pages at once;
  - Retry-After is waited for; a 404 is not kept; a challenge frame stops the run;
  - `--origin shop` keeps web with churn 0;
  - crawler-url tests cover the measured transactional URLs;
  - the ingest e2e stays green.
- **Live:** no. **You:** pace, cap, footer, menu refresh (Q8-Q10). **Depends on:** E4. **Where:** wave 1, in jobs/ only.

### E8. Shop extraction, stable ids, typed guide points (ADR-0060, risk medium)
- **Changes:**
  - commit points outside forms through `classify()`; names from title classes; transactional kinds;
  - stable ids for query-kept pages and the stacked-suffix fix; **no ids built from prices** (if you agree, Q12);
  - category normalisation in url.ts and kb-index;
  - `Destination.guide` from field values;
  - draft shop router, overlay and evaluation cases on the fixture manifest, including a "buy" flow that ends in a confirm step with the pointer. DSL and home internet stay on web.
- **Checks:** on demo-telco's shop: cart, buy-now and number controls get `commit: true`; names hold no price; adding a category renames no id; the three spellings give one page; E2's sweep passes; `eval:router` on the fixture. If price-free ids are adopted, an offline transform of the committed manifest stays within ±1 case.
- **Live:** no. **Depends on:** E1, E2, E7. **Where:** wave 1-2. It lands before V2, so V2's churn is reviewed once.

### E9. The tool for visit 1, built and dry-run offline (no ADR, risk low)
- **Changes:** `tools/eshop-visit.ts`, as in 2.8 (fresh profile; never clicks, types or answers the banner; paced; stops on a bot sign; refuses never-list URLs; scans saved HTML for personal data). It never uses `extract-entry.ts`.
- **Check:** a dry run on E1's stand-ins writes its files, makes 0 clicks, leaves the banner and widget stand-ins unchanged (outerHTML equal), refuses `/en/cart`, and stops on a stand-in challenge page.
- **Live:** no. **Depends on:** E1's fixture. **Where:** wave 1.

### E10. O29, then visit 1 (live, risk high)
- **You:** update O29, choose an off-peak day, and run the visit.
- **Check:** a dated note in the audit; 25 loads or fewer, at 1 per second or slower; no bot check, or a stop.
- **Depends on:** E1, E3, E4, E9. **Where:** as soon as O29 is updated; it runs alongside wave 1.

### E11. Commit visit 1's results (offline, risk medium)
- **Changes:** the verbatim robots text replaces the reconstruction in `robots.test.ts:21-39`. A private shop replay fixture (if you allow). E1's guard tests and E8's extraction run again on real markup. Shop banner and widget stand-ins for S16. The signed-out marker. Settle `/lines/*/numbers` and the URL spellings.
- **Checks:** robots coverage against the real text; every real add-to-cart and buy-now control refused, and no cart request; extraction finds commit points and stable ids; an offline replay of the saved shop pages makes 0 requests.
- **You:** decide `/numbers` (Q5). **Depends on:** E10. **Where:** wave 2. Amend ADR-0060 if the facts change the scope.

### E12. Guide points updated in the background from the visitor's page, off by default (ADR-0061, risk high)
- **Changes:** everything in 2.2.
- **Checks (each fails first):**
  - one unattested report is held;
  - one attested report is applied, audited, and can be reverted;
  - a demo browser in replay sends nothing and never adds the header;
  - a report with no matching plan step is refused;
  - R2 applies only with two distinct sessions and address hashes;
  - a value outside the band is held; the daily cap holds;
  - a value read from a `[data-aixc]` copy is never sent (browser test);
  - `trace_events` hold no value;
  - report rows are deleted after 48 h;
  - observe.js within a new budget, and guide.js within its budget.
- For an offline demo, use a copy of the saved bundles page with one price changed. Plan D measured 0 price changes between the 23 Oct and 12 Nov saved Arabic pages.
- **You:** the switches (Q6, Q7). **Depends on:** E2, E3, E6; E11 before any R2. **Where:** wave 2.

### E13. Visit 2: the web-only held sync (live, risk medium)
- **You:** run `npm run sync -- --site vodafone-eg --origin web --dry-run`; read the report (lost destinations first, then pairs matched only by position, then id renames); approve going live; then `npm run experience -- --site vodafone-eg --activate`.
- **Checks:** `eval:router` after going live; E2's sweep is still green; guide points are filled in.
- **Depends on:** E7, E8, O29. **Where:** wave 2, before any shop sync.

### E14. Visit 3: the first shop sync (live, risk high)
- **Changes:** flip `crawl.origins.shop.ready` in a commit with E7 and E8 green. Then `--origin shop --dry-run` with carry-over, the report, going live, the profile rebuild, and a refresh of the committed manifest, the overlay and the evaluation ids.
- **The report must show:** the robots result, 0 blocks, errors, pages within the cap, commit points and guide points found, E2's sweep, `eval:router` with the shop cases, and web churn 0.
- **You:** read the report and approve going live. **Depends on:** E8, E11, E13. ADR-0060 becomes Accepted.

### E15. One Pocket across both origins: a server store behind the gateway bridge, off by default (ADR-0062, risk high)
- **Changes:** everything in 2.5. Spike first.
- **Checks:**
  - S4's store suite runs against both backends (reload, `localStorage.clear()`, two tabs, IndexedDB blocked, AIXC-56/57/58/64/67);
  - offline, on two origins: a sticker kept on web appears in a shop tab within 1 s, and the reverse; removals sync; Clear empties both and the server;
  - after a memory-store restart, the frame's copy refills the server;
  - a blocked frame falls back to the local store, with the label;
  - the id is never in the page's window, storage or requests, and the request log shows no Vodafone host;
  - Postgres integration: a phone number is refused (422), a `/en/cart` source is refused, a foreign picture host is refused, `search=` is stripped; expiry, caps and the rate limit hold;
  - the public-config refusals hold.
- **You:** Q13. **Depends on:** S7, E3, E5. **Where:** after S7, beside S8-S13, in new files. Done before S16 and S17; S17 runs on the store you choose.

### E16. The layer and the Pocket on the shop, album only (ADR-0063, risk high)
- **Changes:** everything in 2.7. Part a: the loader per origin, route following, the deny check, ShopHost and the album, all on stand-ins. Part b: recognisers and protected nodes from visit 1. Amends ADR-0048 §1, ADR-0046 §2-3 and live plan §3.5.
- **Checks:**
  - no layer on cart, checkout, numbers or account;
  - a stand-in route from a list into `/en/cart` removes every `[data-aixc]` node before any read;
  - 0 attribute or node writes inside `vf-root` (a MutationObserver count);
  - OneTrust and TOBi uncovered at 1366 and 375, in EN and AR;
  - re-match numbers on the saved shop pages are recorded;
  - a web sticker shows on the shop through E15;
  - a failure at each checkpoint leaves the page as with `?aixc=off`;
  - `aixc-delivery.test.ts:73-88` is updated on purpose;
  - S16's shop cells pass.
- **You:** Q14, Q15. **Depends on:** E1, E5, S7, S10 (a); E11, E15 (b); S16 before it is switched on. **Where:** sub-phase 3-shop. Part a starts after S7.

### S16 and S17 additions
- S16 gains shop cells (guide alone; then the Pocket) and a **commit-guidance cell**: the pointer and highlight never cover the accessibility button, the banner or TOBi.
- S17 is V4a, as the phase 3 map specifies.

### E17. Visit 4b: the shop smoke (live, risk high)
- On a shop list page:
  - "What is this page?" and "cheapest phone" are answered from a live read;
  - "add it to my cart" shows the pointer and highlight, with nothing pressed and no cart call in the network log;
  - if E12 is on, one attested report is applied, then reverted;
  - if E15 is on, a web sticker shows in the shop's album;
  - if E16 is on, routing into the cart removes the layer.
- **Pass means:** no `[AIXC]` errors; the banner and widget untouched; no request from us to Vodafone beyond the page loads; at most 1 page per second.
- It moves ADR-0058 to 0063 towards Accepted. **Depends on:** S17 passed, E14, E16.

---

## 4. Your checkpoints

| When | What you do or decide |
|---|---|
| **C1, now** | Confirm that ADR-0053 to 0057 keep their numbers, so the e-shop ADRs are 0058-0063 and S11 and S13 follow. Give your final word on ADR-0057 (21 KB): the byte rules here assume it. |
| **C2, now** | Review the commit word list (Q4) and the guidance line. Until E1 lands (a day or two), avoid demoing the agent on shop pages. The agent stays on, as you decided; only the demos wait. Do not deploy the public gateway or hand out the extension before E1 (E1 adds a start-time refusal). |
| **C3, with E2** | Approve the new AGENTS.md 4.3 text (Q3). |
| **C4, when ready** | **Update O29.** Then pick an off-peak day and run visit 1 (E10). Decide whether the saved shop pages may be committed as a private fixture (Q16). |
| **C5, after E11** | Decide `/lines/*/numbers` from the facts (Q5). |
| **C6, before E13** | Price-free ids (Q12). Run the web held sync; read the report and approve going live. |
| **C7, before E14** | Shop pace, cap, footer and menu refresh (Q8-Q10). Run the shop dry run; read the report and approve going live. |
| **C8, E12** | Reports on or off; R2 in public; the band and caps; price only, or stock too (Q6, Q7). |
| **C9, E15** | The bridge identity, the expiry, the notice wording, Postgres on the public gateway, public visitors or your demos only, and which store S17 uses (Q13). |
| **C10, E16** | The shop allowlist, album only, when chips come, and stock or countdown text in stickers (Q14, Q15). |
| **C11** | Run V4a (S17) and V4b (E17) on separate runs. |

---

## 5. Open questions, each with a recommendation

1. **ADR numbering.** 0053-0057 are written, so the e-shop ADRs are 0058-0063. **Recommend:** yes, and write all six now as Proposed (E0).
2. **ADR-0057's 21 KB budget.** **Recommend:** accept it, and still keep every e-shop feature out of guide.js except the two measured calls (the confirm pointer and the observe gate), paid for by E3.
3. **AGENTS.md 4.3 text.** **Recommend:** "Never store personal data or balances anywhere. Public prices and stock may be kept in the knowledge base as dated guide points (owner, 2026-11-13; ADR-0059): the guide uses them to find places and never says or shows them; it reads the live page, which answers. Traces and logs never hold page values. Pocket stickers keep Vodafone's public copy as published and dated, in the visitor's browser or on our gateway (ADR-0051, ADR-0062); never personal data."
4. **Commit list.** Should DSL bundle "Select" (`card-bundle-action-select-btn`), `device-select-btn`, store-pickup reservation, OTP and document-upload steps also count? **Recommend:** yes. Guiding instead of clicking errs on the safe side. "Sort", "Filter", "Details" and "Compare" stay clickable for demo moment 6.
5. **`/lines/*/numbers`.** **Recommend:** out of the crawl and the layer for good. The guide treats it as a commit page ("choose your number yourself").
6. **Rules against bad reports.** **Recommend:** R1 on (your demo browser in live mode only); R2 off, and refused on the public gateway; the 0.5-2× band; one change per item per day; prices only at first, stock later.
7. **Signed-in visitors** may see personal prices. **Recommend:** no public reports until visit 1 gives a signed-out marker, and even then only with R2 switched on by you.
8. **"The whole menu":** main bar only, or the footer too? **Recommend:** both, filtered by the same scope rules.
9. **Shop pace.** **Recommend:** 2 s between shop pages, 1 at a time (each Angular page fires many API calls). That is within your 1-page-per-second rule.
10. **Menu refresh.** **Recommend:** no separate API request. Keep the page's own menu response during the crawl and report differences.
11. **Crawler user agent.** SPEC-04 §4 asks for a contact. **Recommend:** keep the name exactly and add a role contact address after it. If you want the string exactly as it is, SPEC-04 §4 is amended instead.
12. **Ids built from prices** (`plus--37---600egp`). **Recommend:** stop building ids from prices at the web held sync, so the renames are reviewed once. The prices stay in labels and guide points.
13. **Pocket identity and retention.** **Recommend:** the bridge frame (partitioned cookie only if the spike fails); 30 days idle; a short notice in the album and the extension listing; Postgres on the public gateway; your demos first, public visitors after PRD D2.
14. **What shop stickers keep.** **Recommend:** copy and price as published and dated; drop stock and countdown text, which go stale within minutes.
15. **Chips on shop cards**, next to Vodafone's wishlist heart. **Recommend:** album only until you have seen it on the shop.
16. **Saved shop pages as a private fixture.** **Recommend:** yes, signed out and scripts stripped, after the personal-data scan. Private repository only.
17. **The storage keeper on the shop** (ADR-0053) means our `vg-` and `aixc.` keys survive the shop's own logout clear. **Recommend:** keep it (nothing of Vodafone's changes), and say so in an ADR-0053 amendment.
18. **Visit 1 by hand or by tool.** **Recommend:** the tool, in a fresh profile, with you doing every click. Your own Chrome by hand is the fallback if bot management objects.

---

## 6. Out of scope

- Scheduled crawling of production (PRD D3), and any crawl not run by you.
- Product detail pages (cards link to `#`), signed-in crawling, cookies in crawls.
- Cart, checkout, wishlist, register, account, order status, profile, payment, robots-disallowed paths, `lines/*/numbers`, dsl-checkout, subscription details.
- Pressing any commit control, typing credentials or IDs, answering the cookie banner in our code.
- Writing inside `<vf-root>`, patching Vodafone's or Angular's scripts, hiding `vf-root`.
- Moving or covering the accessibility widget on the shop (the S11 lift stays web only).
- Chips on shop cards for now; any link to Vodafone's own wishlist.
- Speaking or showing prices or stock from the knowledge base; values in traces or logs; personal data in stickers or reports.
- Framing shop pages in the portal (preview only), and portal scenes into commit flows.
- Making replay offline by default (decision 6 keeps the live fallback); renaming the crawler.
- Deploying the public gateway, Modal or the Anthropic key (yours to do); a guarantee of one Pocket in Safari or WebKit; Mode A through Tealium; a price API from Vodafone.

Key files: `/Users/monterey/Workspace/Projs/Vodafone/ai-ux-studio/voice-guide/docs/reference/eshop-map-2026-11-13.md`, `/Users/monterey/Workspace/Projs/Vodafone/ai-ux-studio/voice-guide/docs/reference/live-way2-phase3-map-2026-11-13.md`, `/Users/monterey/Workspace/Projs/Vodafone/ai-ux-studio/voice-guide/docs/adr/0057-guide-js-size-budget-21kb.md`, `/Users/monterey/Workspace/Projs/Vodafone/ai-ux-studio/voice-guide/packages/sdk/src/agent.ts`, `/Users/monterey/Workspace/Projs/Vodafone/ai-ux-studio/voice-guide/services/router/planner.ts`, `/Users/monterey/Workspace/Projs/Vodafone/ai-ux-studio/experiences/src/host/live-adapter.js`.

---

## The three plans it was merged from

Written on 2026-11-13 by three designers (Opus), each from one angle, read-only; the judge above checked their claims against the code where they disagreed. Their ADR numbers (0053 or 0057) are superseded by §0: the e-shop ADRs are 0058 to 0063.

### Safety first. The order of work follows what is exposed today, not the order of 

- Close live exposure first. The agent on the shop, prices spoken from the knowledge base, values in traces and the shop-reaching sync exist today, so they are fixed before any new feature. Every later step adds no exposure that is not behind a switch.
- Enforce in code, not in prompts. Commit points, the value gate, trust in reports and the shop's route allowlist each live in one choke point. Each is proved by a test that fails on today's code (AGENTS 5.4). SPEC-03 §4.1 already asks for a two-language commit lexicon that agent.ts never implemented.
- A knowledge-base value is a hint, never an answer. Prices and stock stay in the knowledge base as dated guide points, but the planner's output gate keeps them out of everything said or shown. The worst a stale or forged guide point can do is send the person to the wrong card; the live read always answers. That limit on harm is what makes background updates acceptable.
- Fail closed. An unreachable robots.txt means nothing is allowed. An origin with no commit-guard list gets no agent. A shop route not on the allowlist gets no layer. A report that does not parse or masks anything is dropped. A sticker that fails validation is refused. The public gateway refuses to start with an unsafe combination (the ADR-0053 §2 pattern).
- Default off, the owner turns it on. Background reports, rule R2, the server store, the shop crawl (`crawl.origins.shop.ready`) and the shop layer ship disabled, each with a pilot knob and an ADR.
- Trust comes from where page scripts cannot reach. The site key is public (ADR-0056 §3; extension build.ts:56), so attestation and identity come from the demo browser's Node-side forwarder (demo-browser.ts:195-220) or from an HttpOnly cookie on the gateway's own host. Neither ever comes from page JavaScript, a URL or Vodafone's cookies.
- Personal data never reaches a new server path. Reports carry parsed public numbers only, read from field locators the knowledge base knows, inside Vodafone's own content (never [data-aixc] or [data-vg] nodes). They are never sent from replay, clone, signed-in, cart, checkout or form pages. Stickers are validated and masked on the server.
- Nothing of ours inside Vodafone's app. On the shop: no DOM or attribute writes inside <vf-root>, regions outside it, a read-only adapter with element maps instead of tags. Never answer, cover or restyle OneTrust or the accessibility widget. The S11 lift exception stays web-only until the widget is seen on the shop.
- One new live behaviour per owner visit. Read-only facts before any crawl, web before shop, a dry run before activation, the web Pocket smoke before the shop smoke. Each visit is signed out, off-peak, at 1 page per second, stops on a bot check, and happens only after O29 is updated.
- Respect the byte budget. guide.js has almost no gzip headroom (ADR-0041), so guard and observe code goes in agent.js, on-demand chunks or the server. Any guide.js growth is paid for by a removal in the same wave; E3 drops the read text from /v1/progress, which is the planned saving.
- ADRs take numbers in the order they are written. 0053-0056 exist, so the eshop ADRs start at 0057. The phase 3 map's 0053 (S11) and 0054 (S13) are void; those steps take the next number when written.

**(1) Price questions answered without quoting knowledge-base values**

Guide points (owner decision 2): no scrub. The builder keeps labels as built, because they are the words used for matching. It also extracts a structured `Destination.guide = { price?: {amount, currency}, stock?: 'in'|'low'|'out', seenAt, source: 'crawl'|'observed' }` for item destinations from the collection's price and stock field values at crawl time. Search and background updates use this field, never the label text.

Output gate (the safety core): one `valueFree(text, lang)` in packages/text. It removes money (EGP, جنيه, ج.م, LE, in both Latin and Arabic-Indic digits; phase 1b's Arabic-digit bug is the lesson), instalments, discounts in percent and stock phrases ("only N left", "out of stock", نفذت الكمية). It keeps names that contain numbers ("25-55", "5 GB") through a short exception list taken from the curated overlay. It shares one pattern source with the price filter for experience questions in packages/kb/src/experience.ts:104,123. It is applied at the planner's single exit: plan.say, say steps, ask questions, clarify options, spotlight captions, confirm messages, and the session's `last.name`. It is also applied to GET /v1/page-map titles and to the speech:warm line list (knownLines). The SDK speaks only what a plan carries or what a live `read` returns, so the gate is complete on the server and costs guide.js 0 bytes.

When two clarify options become equal after stripping, the plan becomes "show both": both items are spotlighted and each is read live.

Asking about a price: understand() parses "a bundle around 50 pounds", "حوالي ٥٠ جنيه", cheapest or dearest, and "is X in stock". The router ranks the collection's items by |guide.price − asked|, or uses the existing min/max pickItem (planner.ts:168-172). The plan is: navigate, reveal, pickItem by key, then spotlight with a live `read` of the price and stock fields (itemRead, planner.ts:265-270; readAnswer in executor.ts:154). The reply template holds only the slots the browser fills from the live page.

When the live item or field is missing, the step fails and the guide says it cannot see it on the page now. It never falls back to the knowledge-base value. Follow-ups ("how much is it?") read the page again: session.last keeps the key and destination, never the value.

Docs: AGENTS.md §4.3 becomes "public prices and stock may be kept in the knowledge base as dated guide points (ADR-0058); the guide never says or shows them and reads the live page; traces and logs never hold page values; balances and personal data never anywhere". Also amended: SPEC-04 §1's 'Values' row and ADR-0011 §3. This reverses the eshop map's D4/A8 scrub, but stable ids for keepQuery pages and price-built ids (`web.mobile-internet-bundles.plus--37---600egp`) are still needed, because those ids rename whenever a price changes.

Risks: The gate over-strips numbers that are part of names ("25-55", "Flex 1400"), so router replies get worse. Mitigation: the exception list and `eval:router` must stay within ±1 case.; Arabic money spellings the pattern misses (ج, جم, Arabic-Indic digits with separators).; Labels still carry old prices for matching, so "the 46 one" can match a stale label. Harm is limited because the live read answers.; Collisions in clarify options after stripping, if the "show both" fallback is not handled.; The page-map titles the Pocket and Tips show could keep a price unless the gate also covers pageMap.

Evidence: Knowledge-base strings that are spoken or shown today: clarify options from labels (services/router/planner.ts:52-55), page summary section labels (:149-154), a collection's reply and caption equal to its label (:175-176), an item's name kept for follow-ups (:184), picture descriptions spoken (:197-199), the watch-offer label (:141). speech:warm caches 'the plans the router makes … their own words' on disk (tools/speech-warm.ts:7-10; knownLines in packages/kb/src/plan.ts:76-84 includes plan.say). The knowledge base holds about 265 visible money strings plus 30 ids (eshop map §1 'Prices are already in the knowledge base'; describer prompt jobs/describer/describe.ts:114). Live reads already exist (executor.ts:148-157). SPEC-04 §1 still says values are 'never stored'.

**(2) Background update from the visitor's page, and its rule against bad reports**

Flow. The planner adds `observe: { destinationId, fields, expect }` to a spotlight-with-read step only when all of these hold: the destination has a guide point, its page is public (not requiresAuth; kind not account, login or checkout), it is not a commit destination, and `kb.observations.enabled` is on (default false). In the browser the executor, after readAnswer, hands (raw field text, expect) to an on-demand chunk `observe.js`, loaded like watch.js (ADR-0041). The chunk works only on elements inside Vodafone's own content (web #main-content, shop vf-root), never inside [data-aixc] or [data-vg] (album, demo kit, reimagined copies). It parses with the gate's parser and runs maskContent (agent-mask.ts), dropping the report if anything is masked. Only when the parsed value differs from `expect` does it POST /v1/kb/observations with {siteKey, kbVersionId, sessionId, turnId, destinationId, field, value: {amount, currency} or a stock enum}: no text, no URL, no DOM.

Gateway (modelled on /v1/experience/contributions, server.ts:273-297). Three gates: site config, the platform knob `VG_KB_OBSERVATIONS`, and VG_PUBLIC refusing R2 unless it is set explicitly. Then: zod schema (≤ 2 KB); the active knowledge-base version only; the destination exists and has a guide point for that field, is not commit, and its page is public. Turn binding: the session's turn must have destinationId equal to the report's (or the collection that holds it), be under 15 minutes old, and be the first report from this session for this destination (Turn keeps destinationId; services/shared/store/types.ts Turn). A per-address limiter. The trace records counts and outcome only, never values.

Trust rules. R1, attested: the demo browser's Node forwarder (demo-browser.ts:195-220) adds `x-vg-observer: <VG_OBSERVER_TOKEN>` to /__vg/v1/kb/observations only when it runs live, never with replayDir or in tests' offline mode; the gateway compares in constant time; one attested report applies. R2, corroborated (default off; off on the public gateway, because the site key is public): two reports with the same value from distinct sessions and distinct salted client-address hashes (VG_CLIENT_IP_HEADER, ADR-0053 §2; hashes kept 48 h), each bound to a real turn, within 24 h, with no conflicting report in the window. Both rules: the new value must be within 0.5× to 2× of the old price, else it is held for the owner; at most one applied change per destination per day; a site cap per day; held reports listed by `npm run kb -- --observations`.

Apply. No new knowledge-base version and no structural change. An overlay table `kb_guide_points` (site, kbVersionId, destinationId, field, value, seenAt, rule, reports) that the knowledge service lays over the active manifest when it plans. An audit row per change (old, new, rule) and `--revert <id>`. The next sync's report lists overlay changes; the build keeps the newer of crawl and overlay by seenAt; activation drops rows whose destination id is gone.

No request to Vodafone is ever made because of a report, and crawling stays on demand (PRD D3). Harm stays limited because of design 1: guide points are never spoken.

Risks: Stale values from replay, the clone, the demo kit (phase 7) or reimagined copies pushed back into the knowledge base. Mitigated by forwarder mode plus the check of where the element sits in the DOM.; Personalised prices for signed-in visitors on the public route: no sign-in marker is known yet (visit 1 finds one). Until then only R1, from the owner's signed-out profile.; A determined attacker with many addresses defeats R2, which is why it is off in public.; Prices that differ by campaign query (c_id …) or A/B test would make guide points flap. The daily cap and the band limit this.; A sync rename orphans overlay rows (price-built ids); they are dropped at activation and listed.; observe.js adds one request to our gateway from Vodafone's page, and guide.js gains a few bytes.

Evidence: Precedent: the aggregation endpoint (services/gateway/server.ts:273-297): zod batch, three gates default off, an active-version check, private and commit destinations refused, a per-address limiter, 'Counts only … no trace event with the payload'. Read values reach traces today: spotlight returns `text.slice(0, 80)` (executor.ts:157), /v1/progress stores sdk.* attrs unfiltered (server.ts:248-249). The site key is public (ADR-0056 §3; tools/extension/build.ts:56 builds it into the extension). The demo browser forwards /__vg on the Node side (demo-browser.ts:195, 218-220). Replay serves 2026-10-23 pages and opens unsaved ones live (demo-browser.ts:299-312), so replay would report stale prices if it were not excluded. The public route has no deployment yet (docs/handoff/HANDOFF.md:143).

**(3) The agent's built-in commit guard and the guiding pointer**

One guard per site, as data. Site config gets `commit: { selectors, words: {en, ar}, urls, origins: {shop: required} }`. Selectors: '#sl-add-to-cart-button', '#sl-button-buy-now', 'button.cart', '[id*="add-to-cart" i]', '[id*="buy-now" i]', 'button:has(img[alt*="cart" i])', '[aria-label*="cart" i]'. Words: add to cart, buy, buy now, checkout, check out, reserve, subscribe, choose or select number, pay, place or confirm order, recharge, transfer; and أضف إلى السلة, اشتري, اشتري الآن, إشتري الآن, اشترك, احجز, ادفع, إتمام الشراء, اختر الرقم, تأكيد الطلب, matched after normalisation in packages/text. URLs: cart, checkout, /lines/*/numbers, dsl-checkout. agent.js also holds a built-in floor that config can extend but never shrink.

Words are matched against innerText, aria-label, title, value and the alt of images inside the control, which catches icon-only buttons.

pageContext returns `commitTargets` (the knowledge base's css plus the site selectors) and `commitWords` on every page, including pages the knowledge base does not know and when there is no knowledge base (knowledge/handlers.ts:32-41). The guide rebuilds its guard on every route (guide.ts:231).

Agent (agent.js, on demand, so 0 bytes in guide.js):
(a) The blacklist is every current match of every selector and word, rebuilt in onBeforeStep. Today it is 4 per selector (agent.ts:46).
(b) The click tool resolves the element, computes the centre point page-controller will press, and checks `elementFromPoint`. It refuses when the element, its hit target, an ancestor or a descendant at that point is a commit control. This matters because page-controller dispatches to the hit target inside the element, so clicking a card wrapper can press its cart button.
(c) select_dropdown_option and input_text are overridden with the same check: a number picker and an OTP field count as commit controls.
(d) `execute_javascript: null` is set explicitly, with a test that the tool set is exactly the allowed one.
(e) A truthful prompt: controls that buy, reserve, subscribe or choose a number are for the person; call show_person_where.
(f) A new tool `show_person_where({near_index?})`. Both it and any refused click run `guideToCommit(el)`, provided by guide.ts: scroll the control into view; the guide's own pointer glides to it with no tap (ui.pointAt(el, false)); the commit spotlight (ui.spotlight(el, {commit: true})); a spoken and captioned line in the person's language ("This is where you add it to your cart. Press it yourself when you're ready."); then agent.stop(), so the model cannot reach the same control another way. Links into the commit URLs are handled the same way. The pointer never dispatches events; with reduced motion it jumps.

Planner (server, 0 browser bytes):
- An utterance with commit intent ("add it to the cart", "ضيفه للسلة", "buy it") is never sent to the agent. It becomes a `confirm` step whose target is the site's selectors within the current or last item. The executor's confirm (executor.ts:175-183) calls the same guideToCommit. That is 30-60 B in guide.js, measured on Linux and paid for by E3.
- No agent step on an origin whose guard is empty.
- No `click` plan on a destination whose label or target text matches the words.
- When the knowledge base later marks commit points, they feed the same guard and the same pointer (planner.ts:202).
- VG_PUBLIC refuses to start with the agent on while any site origin lacks a guard.

Risks: False negatives: wording changes, image-only controls with no alt, controls drawn on a canvas, new ids. The knowledge base's commit marks (E9) and visit 1's real markup re-test this.; False positives, for example a 'Buy now' link that only opens a product page: the person is guided instead, which errs on the safe side.; The pointer or the spotlight covering the control itself, OneTrust or TOBi: S16's matrix needs a commit-guidance cell.; The model saying it pressed something: only the guide's own line is spoken (ADR-0017).; guide.js budget for the shared guideToCommit in confirm. If E3's saving is not enough, the pointer lands in the agent path first.; Whether simply loading /lines/*/numbers reserves a number is unknown, so the agent treats links into it as commit URLs.

Evidence: The blacklist is the knowledge base's commit selectors, first 4 matches (packages/sdk/src/agent.ts:46), and the knowledge base has 0 commit destinations. The click tool calls clickElement with no guard (agent.ts:81-91). The prompt says purchase buttons are hidden (agent.ts:56), which is false. page-controller presses the centre and dispatches to `elementFromPoint` when it lies inside the element (node_modules/@page-agent/page-controller/dist/lib/page-controller.js:106-122). CommitGuard.blocks checks only `c === el || c.contains(el)` (packages/sdk/src/dom.ts:126). select_dropdown_option is not overridden (node_modules/@page-agent/core/dist/esm/page-agent-core.js:298). execute_javascript is removed only because experimentalScriptExecutionTool is unset (page-agent-core.js:463). The planner routes to the agent with no origin check (services/router/planner.ts:71-73). The executor's click refuses only knowledge-base commits and payment-form submits (executor.ts:162-166; dom.ts:112-132). With no knowledge base, pageContext returns commitTargets [] (services/knowledge/handlers.ts:32). The loader and the extension put guide.js on both origins (packages/loader/src/loader.ts:73; tools/extension/build.ts:56). The pointer and the commit style exist (packages/sdk/src/ui.ts:80, 311, 375). SPEC-03 §4.1 requires a two-language lexicon. The shop's ids sl-add-to-cart-button and sl-button-buy-now and its icon-only button.cart with alt 'cart' come from the cached chunks (eshop map §1).

**(4) The e-shop crawl of the whole menu, with its safeguards**

Scope is the whole menu, generated rather than discovered, because the menu's items are click handlers.

Seeds: a committed `config/sites/vodafone-eg.shop-menu.json`, written by hand from the cached MAIN_NAVBAR and FOOTER responses (types, paths and labels only; dated 2026-11-12; source named). It is expanded to /en/ and /ar/: home; list?categoryUrls= for each of the 24 categories (13 top-level, 11 under gaming and accessories); /lines/flex/plans; /internetServices/at-home; /internetServices/dsl. It is cross-checked against the 28 eshop URLs on the saved web pages. That is about 56-60 pages. In owner-run crawls only, one paced, robots-checked GET of the public menu API refreshes the list; differences are reported, never added silently. Shop depth 0-1, following real hrefs only.

Products are items of the list pages: cards link to '#', so there is no product-detail crawl. Names come from title classes, not card text.

Out of scope at any depth, case-insensitive, checked before robots and before any request: cart, checkout, wishlist, register, account, profile, order-status, order-details, payment, saved-payments, vouchers, returns, dsl-checkout, subscription-details, at-home-subscription-details, documents, lines/*/review, legacy /shop/ paths, every robots Disallow, and any redirect to the sign-in host. `/lines/*/numbers` is in the menu but is a commit step (decision 4): out until visit 1 shows that loading it has no server effect (owner question).

Robots: fails closed per origin (5xx, timeout, network error or a block means disallow all; other 4xx allow, per RFC 9309); fetched with the crawler's user agent; saved verbatim in crawl.json and the report; a test that every Disallow line has an exclude.

Pacing: a per-origin scheduler. Navigation starts at least 1 s apart per origin (shop default 2 s, a knob, because each Angular page fires API calls); shop concurrency 1; web at most 2. Exponential back-off on 429 and 503, honouring Retry-After. Status 400 or above is an error, not a page. A request-timestamp test (SPEC-04 AC6).

Bot check: on the first sign on the shop (403, 429, a challenge title, frame or script, a redirect to an unknown host) the whole run stops: no retry, no user-agent change, and the report says where.

Render: wait until vf-root or app-root has children and a quiet DOM period (reuse settleApp), with a 20 s cap. Not networkidle alone, because mqtt may keep a socket open. Scripts on for the shop and /spa/; CMS decided separately.

Never: clicks, scroll-to-load, typing or cookies (crawl.ts:62); a test asserts no click, dispatchEvent or keyboard API is used. The banner is never answered. ignoreSelectors apply only to the crawler's own copy.

Extraction:
- Commit points outside forms, using the shared word list, alt 'cart' and the sl-* ids, become `commit: true`.
- Shop transactional pages get their kind.
- keepQuery pages get stable ids (`shop.list.smart-phones`); the stacked-suffix bug is fixed (build.ts:227-228).
- Category spellings `*x`, `/x` and `%2Fx` normalise to one key, with the live spelling kept as the variant (url.ts:13-25; kb-index.ts:29-44).
- Prices and stock become guide points (design 1), and the gate is checked on the shop fixture.

Sync: per-origin page caps (shop about 80). Origins not crawled are carried over, or the run is refused (sync-lib.ts:72-79; ingest-lib.ts:54-69); a one-origin run is never forced. The web-only held sync comes first (runbook §5.1), then `--origin shop --dry-run`, the report is read, and only then activation.

User agent: 'VodafoneEG-VoiceGuide-Crawler/0.1' is kept (decision 7).

A code switch `crawl.origins.shop.ready` (false; E4) refuses every shop request until the commit that lands all of this with green tests.

Risks: The menu API is cached as public, but that is not permission (robots says nothing about /ecommerce/api). The refresh is one owner-run request.; Bot management is unknown and O29 is open: a block could also affect the owner's demo browser on both origins.; With scripts on, Vodafone's analytics count crawl visits (owner question on blocking known beacon hosts in the crawler's own context).; Virtual lists render only the first cards, so list items are incomplete.; A single-page app answers 200 for unknown paths, so 'not found' views would enter as pages unless they are detected.; Price-built ids churn and can trip the 15% gate. Stable ids and the web-first order keep the review readable.; Only the /ar/ build is cached, so the /en/ routes are assumed to be the same.

Evidence: Only the Playwright crawler can render the shop; the in-browser crawler is same-origin only and the shop's frame-ancestors lists web only (eshop map §1; tools/live-crawl/browser-crawler.ts:145, 158-163). Robots fails open and is fetched without the crawler's user agent (jobs/crawler/crawl.ts:48-51, 187-192). Two workers share one queue with a delay per worker (crawl.ts:79-96, 171). Only 403, 429 and a challenge title count as blocks, and every other status is kept (crawl.ts:97-104, 124-146). It waits for networkidle plus 150 ms (crawl.ts:95-96). Commit points are marked only for a submit button inside a form (jobs/crawler/extract.ts:16, 316-333). Menu items are click handlers and product cards link to '#' (cached chunk-PBD6OPX3.js onOpenCategory; vf-product-card in chunk-VOFNPJR7.js; eshop map kb-crawler facts). The cached MAIN_NAVBAR lists PAGE /list, 24 CATEGORY entries and LINKs including /lines/red/numbers (eshop map offline-inventory facts). Today's scope admits dsl-checkout, subscription-details, lines/*/numbers and review, profile and order-status (eshop map kb-crawler facts). The robots text on disk is a reconstruction (tests/unit/robots.test.ts:21-39). maxPages 220 is shared and scriptsFor is '^/spa/' (config/sites/vodafone-eg.yaml:79, 95, 100). SPEC-04 §4 sets the rate and back-off rules.

**(5) The server-side Pocket store and identity across the two origins**

Server: `services/pocket/` as a handler map (ADR-0009). Postgres tables `pockets(id, site_id, created_at, seen_at)` and `pocket_stickers(pocket_id, key, record jsonb, saved_at, updated_at, deleted_at)`. Routes: GET /v1/pocket; PUT and DELETE /v1/pocket/stickers/:key; DELETE /v1/pocket (forget everything); GET /v1/pocket/changes?since= (a cheap re-read on focus). Site key and origin checks (server.ts:88-92). Never traced beyond counts.

Identity, never visible to page scripts:
- Public gateway, extension and Mode A: an opaque 128-bit id in an HttpOnly, Secure, SameSite=None, Partitioned cookie on the gateway's own host, Path=/v1/pocket, set by the first GET. Fetches send credentials; CORS allows exactly the two site origins. web.vodafone.com.eg and eshop.vodafone.com.eg are one site, so the cookie's partition (top-level site vodafone.com.eg) is the same on both, which gives one Pocket. Any other site that embeds us gets another partition. A measured offline spike comes first: Playwright, two synthetic origins of one site, Chromium and Firefox; WebKit is a known gap.
- Demo browser: /__vg is first-party on each origin, so a gateway cookie would split, and a cookie on vodafone.com.eg would be sent to Vodafone, which is forbidden. Instead the Node forwarder adds `x-vg-pocket: <id kept in the demo profile>`.
- Never: Vodafone cookies, ids in localStorage, URLs or fragments, or a link to the guide session or the trail.

Client: `openServerPocketStore({gateway, siteKey, win, onError})` implements the existing interface (ready, persistent, all, get, put, remove, clear, subscribe, legacyIds, dropLegacy, close), so initPocket and the 'store' seam are unchanged; demos/pocket.js picks the backend by `pocket.store: 'server'|'browser'`. IndexedDB aixc-v1 stays as each origin's cache and outbox: the first paint and work offline; local changes are laid over reads as store.js does today (AIXC-56/57); then the PUT. The server is the source of truth: per key, last writer wins on updatedAt; deletes are tombstones. BroadcastChannel keeps tabs of one origin in step, and a re-read on load, visibilitychange and focus covers the other origin. When the server cannot be reached, the store is not persistent and the existing 'kept for this page only' note shows.

Validated on the server, refused otherwise:
- isRecord v2; at most 200 stickers and 4 KB per record.
- Every string through maskContent, refused if anything masks.
- URLs only on the two site origins and Vodafone's picture paths; CTA hrefs as published, with unknown query keys stripped (for example `search=`).
- Source pages only from allowlisted public pages: never cart, checkout, account, signed-in /spa/ views or shop transactional routes.
- A new `source.site`.
- Copy as published and dated (savedAt); nothing about the person except the opaque id.
- Expiry after 90 days idle (a knob); Clear deletes on the server.
- The per-origin IndexedDB records are uploaded once, through the same validation.

The public gateway refuses `pocket.store: server` without limits, expiry and either Postgres or an explicit memory-store acknowledgement (a restart forgets pockets).

Docs: supersedes ADR-0051 §1 and its 'nothing leaves the browser'; amends live plan §3.9 and the AGENTS.md §4.3 note; adds a PRD D2 note.

Risks: CHIPS and partition rules differ: Safari ITP, Firefox Total Cookie Protection, users or extensions that block cookies. Those visitors get separate Pockets per origin, and the album must say so.; Mode A on another gateway host changes the partition.; Our server holds Vodafone's copy and prices (the owner's decision; PRD D2 before customers).; A public endpoint that stores JSON is open to abuse. Schema, quotas, rate limits and expiry are required before VG_PUBLIC allows it.; Personal data could slip in through a CTA query or copy echoed from a form. Masking, the key allowlist and the source-page allowlist guard against it.; Two writers on two origins conflict (last writer wins per key, tombstones).; On the memory store, a restart loses everything.

Evidence: The store's interface and contract (experiences/src/pocket/store.js:1-21, 56). Store and seam passed into initPocket (experiences/src/host/demos/pocket.js:33, 84). The record holds published copy, picture, CTA and source; `origin` means person or kit (experiences/src/pocket/record.js:41-63). The page is captured once (demos/pocket.js:35). The gateway is page origin + /__vg in the demo browser, or an absolute URL elsewhere (packages/loader/src/loader.ts; ADR-0053 §1). The forwarder copies headers on the Node side (tools/demo-browser.ts:195). Both origins partition under https://vodafone.com.eg (eshop map layer-pocket facts: 228 + 155 cache keys). The guide session crosses origins only through #vgh (ADR-0016; packages/sdk/src/guide.ts:96-97, 490-494). The public gateway is one machine with a memory store (ADR-0053 §3), and nothing is deployed (HANDOFF.md:143).

**(6) The album showing shop-linked stickers (reading 1)**

Built inside S7 and S13, on web only; no code runs on the shop for this.

Records: `source.site` is the origin key ('web' or 'shop'); a missing value reads 'web', so isRecord stays compatible. The page key becomes site plus pageKeyOf plus keepQuery, with `categoryUrls` normalised (`*x`, `/x`, `%2Fx`), so '/' on web and on the shop, and two category lists, no longer collide. Link keys are always `<host><path>` on both origins (live-adapter.js:138). Stored records with host-less keys are matched through an alias, so existing stickers still find their cards; the S4 re-match numbers are re-run. A CTA href stays absolute and as published.

Album: stickers group by source page and carry a small t() marker 'In the shop' / 'في المتجر', in Vodafone's styles, on CTAs that lead to the shop. Price and copy are kept as published and dated (OD-2).

Opening (in S13): CTAs into the shop always get the picture preview followed by a native navigation, with 0 extra document requests (a request-counting test). The shop's HTML is no-store, so OD-4's cache plan cannot apply. The portal never animates into a commit flow: a CTA whose URL is a commit route (cart, checkout, /lines/*/numbers, dsl-checkout) or whose label matches the commit words opens natively with no portal scene. Vodafone's own links stay native (OD-3).

The live plan's §3.5 Pocket row and ADR-0048 §1 stay web-only for reading 1.

Risks: The key change breaks matching of stickers already kept; the alias and a test cover it.; A Vodafone 'Buy now' label in our album can read as our own purchase button, so the marker and Vodafone's copy are shown as kept.; The preview has only the card's picture, so it is not a seamless last frame.; Legacy /shop/ links fall outside the shop's include rule.

Evidence: There are 323 eshop link instances (28 distinct) and 20 eshop 'Buy now' actions on the saved pages (eshop map §1, from fixtures/replay/vodafone-eg/crawl.json), and the adapter reads 19 eshop CTAs (phase 3 map :510). The link key is host-qualified only when read on another origin (experiences/src/host/live-adapter.js:138), and the id candidate drops the host (:114). pageKeyOf drops the language and the whole query (experiences/src/pocket/record.js:21). The portal gives the shop the preview (experiences/tests/pocket-portal.test.mjs:459-461; portal/config.js:15, 135). The shop sends no-store (audit:24).

**(7) The layer and the Pocket on e-shop pages (reading 2, sub-phase '3-shop')**

This starts only after visit 1 has saved real shop pages and the server store exists.

Loader: `experiences.origins: { web: {paths, exclude}, shop: {allow: [home, list?categoryUrls=, /lines/*/plans, internetServices landing and bundles], deny: [the transactional list, /lines/*/numbers]} }`, amending ADR-0048 §1. On the shop the condition is 'vf-root has children', not #main-content.

ShopHost: our regions are appended to body outside <vf-root>, never inside Angular's tree. The shop adapter is read-only: it keeps element-to-item in a WeakMap and writes no data-aixc-item tags inside vf-root, so Angular rendering, hydration and Vodafone's Dynatrace are untouched. PROTECTED covers the shop header and footers, OneTrust, TOBi, the floating section, and the accessibility widget if it exists.

Routes: the Navigation API's navigatesuccess is read only (the guide already wraps history; guide.ts:189-253). On every route, the allowlist is checked before anything else. A denied route stops the layer through the guard, so nothing of ours stays on the cart. Otherwise the page is read again, the page map is fetched again, and the Pocket's page object is updated; today it is captured once (demos/pocket.js:35).

Recognisers for vf-product-card, vf-bundle-card, vf-device-card, vf-offers-card, vf-category-card and vf-internet-service-card are confirmed on the saved pages. Keys: /prod/<slug>, /ecommerce/api/asset/content/<name>, title, numbers. The re-match is measured as in ADR-0051.

Pocket on the shop: album only, no chips, until the owner has seen chips beside Vodafone's own wishlist button. It is one Pocket with web through the server store; without it, a separate Pocket on the shop, and the album says so. Stickers keep copy as published and dated, and never anything from cart, checkout, account or signed-in pages.

Unchanged on the shop: the agent guard (design 3), the trail's shop-sensitive paths (E3), no accessibility-button lift (S11 web-only), eshop cells in S16's matrix with the banner answered and unanswered, 'Your journey' in the guide's sheet when the layer does not host (OD-5), and ?aixc=off.

Risks: A route into the cart without a page load: the deny check must run before any read or render. A test with route stand-ins on the saved pages.; Angular re-renders detach what we read, and errors could reach Vodafone's monitoring.; Overlap with TOBi and OneTrust, whose positions are unknown until visit 1.; Nothing can be tested before visit 1's saved pages exist.; The shop's own clearLocalStorage() now keeps vg-/aixc. keys because of the storage keeper (ADR-0053), which changes the shop's logout behaviour slightly (owner question).

Evidence: The layer is added only on the first origin with #main-content (packages/loader/src/loader.ts:90-91), and a test asserts there is no layer on the shop (tests/unit/aixc-delivery.test.ts:73-88). PageHost needs #main-content and the adapter is Liferay-only (page-host.js:34-35; recognisers.js:12-103; live-adapter.js:215-218). The layer starts once and never follows routes (host/index.js:69; demos/pocket.js:35). The shop's CSP allows our inline style, data: images and gateway connects; Dynatrace is on the shop; the card components are known only from compiled templates and include a wishlist button (eshop map layer-pocket facts). The widget was recorded absent on the shop on 2026-10-23 (audit:95), with nothing newer. The shop has its own OneTrust (cached cookielaw JSON). The storage keeper patches Storage.prototype.clear on both origins (loader.ts:52-64, 73).

**(8) The owner's live visits**

Preconditions for every visit: O29 updated by the owner (no call from us); E1-E4 landed, so the guide in his demo browser is guarded on the shop; off-peak Cairo time; signed out; 1 page per second; the banner left unanswered unless the owner answers it himself for a geometry check; stop on a bot check, with no retry; no commit control pressed and no form typed into.

V1, facts and saved pages (about 15-25 page loads, by hand in his own Chrome or in the demo browser with --aixc off and the agent off). Record:
- robots.txt of both origins, verbatim;
- header names and cookie names (no values) on first load;
- OneTrust's selector and boxes in EN and AR, answered and not; whether the accessibility widget exists on the shop;
- the categoryUrls spelling in the address bar, after a menu click and after a web link;
- where /internetServices/dsl/bundles lands;
- how long until vf-root settles, and whether networkidle ever comes;
- card ids and attributes;
- whether loading /lines/red/numbers fires any reserve-like API (request names only, in DevTools);
- whether a #vgh hand-off survives Angular's first route;
- whether a test key in IndexedDB and in localStorage survives a reload;
- a sign-in control selector on web and the shop, used as the signed-out marker for reports.
Save the rendered and raw HTML of 4-6 public shop pages (home EN and AR, one list, DSL bundles, lines plans, one product) as a private fixture, after a check for personal data.

V2: the web-only held sync (runbook §5.1): dry run, review, activate, experience rebuild.

V3: the first shop sync, `--origin shop --dry-run` with carry-over. Read the report (robots outcome, blocks, errors, pages within the cap, commit points found, guide points found, the gate scan), then activate and rebuild the experience profile.

V4a: S17, the web Pocket smoke.

V4b, on another run: the shop.
- 'What is this page?' and 'cheapest phone' answered from a live read.
- 'Add it to my cart' shows the pointer and highlight with nothing pressed: no cart API in the network log.
- If the owner turned reports on, one attested report applied, then reverted.
- With E14: a sticker kept on web shows in the shop's album.
- With E15: a route into the cart removes the layer.

Each visit's results are committed as dated facts, with the audit's (re-verify) marks updated.

Risks: Bot management may block his Mac or address on both origins: stop, do not retry.; An automated browser is detected differently from his own Chrome, so V1 by hand is preferred.; Answering the banner for a geometry check changes his own profile's consent state; record it.; Doing two things in one visit hides which one broke.

Evidence: O29 is open (docs/qa/bugs-and-open-issues.md:54), and the cache holds responses from 12 Nov (eshop map §1; phase 3 map :312). No shop HTML is on disk because of no-store (eshop map §1). The reconstructed robots text is in tests/unit/robots.test.ts:21-39. The runbook's held sync is §5.1. S17 is in the phase 3 map :295-300.

**(9) How this interleaves with phase 3's remaining steps S6-S17**

S2's pieces are already used by S5 (demos/pocket.js start receives ensureCss and checkpoint), so phase 3's remaining steps are S6-S17.

Wave 0, now, before S6 resumes: E1 (agent and planner commit guard with the pointer), E2 (output gate and guide-point ADR, AGENTS 4.3), E3 (traces, session turns and trail on shop forms; frees guide.js bytes), E4 (no sync reaches the shop; the replay message and runbook corrected; the plan and phase 3 map note the eshop track and the void ADR reservations). All offline and test-first. Each closes something already exposed.

Wave 1, the web Pocket continues: S6, then S7 with E5 (reading 1 records), S8 and S9, S10, S11 (its ADR takes the next number when written), S12, S13 (with shop-preview and no-commit-animation rules), S14 and S15. In parallel, on other files: E6 (price questions by guide points), E8 and E9 (crawler safeguards and shop extraction on fixtures), and E10 (owner V1) as soon as O29 is updated and wave 0 is in.

Wave 2: E7 (reports, off by default) after E2, E3 and E6; E11 (commit V1's results); E12 (V2, web sync); E13 (V3, shop sync) after E9, E11 and E12.

Wave 3: E14 (server store, off by default) after S7 and S13. Then S16 with eshop-link and commit-guidance cells. Then S17 = V4a, the web smoke, with the server store on only if the owner chooses.

Wave 4, '3-shop': E15 (layer and Pocket on the shop) after E11, E13 and E14, then E16 = V4b (the shop smoke).

No phase 3 step depends on the shop. The shop steps depend on S7 (record format) and S13 (portal rules), which is why reading 1 is folded into those two steps instead of being a step of its own.

Risks: Wave 0 delays S6 by a few days.; E5's key change lands in the middle of S7 and must keep S4's re-match numbers.; E14 changes what S17 verifies; choose the store before S17.; Several sessions edit record.js, store.js and demo-browser.ts at once (git status), so merge order matters.

Evidence: Phase 3 steps and dependencies (docs/reference/live-way2-phase3-map-2026-11-13.md:218-300). The live plan has no eshop work and §3.5 limits the Pocket to CMS pages (eshop map §3 gap 9; docs/handoff/live-demos-way2.md:163-173). ADRs 0053-0056 are written and indexed (voice-guide/docs/adr/README.md:58-61).

Steps:

- E1 Commit points guarded in code on every origin; the guide shows the person where to press: Site config `commit` block (selectors including '#sl-add-to-cart-button', '#sl-button-buy-now', 'button.cart', 'button:has(img[alt*="cart" i])'; words in EN and AR; commit URLs; `origins.shop: required`), with its schema in services/shared/config.ts.

knowledge pageContext returns the site selectors and commitWords even with no knowledge-base page (services/knowledge/handlers.ts:32-41).

agent.ts:
- the blacklist is every current match, rebuilt in onBeforeStep (:46);
- the click tool checks the element, its centre hit target (page-controller.js:106-122), ancestors and descendants;
- select_dropdown_option and input_text are overridden with the same check;
- `execute_javascript: null`;
- a show_person_where tool;
- a truthful prompt (:56);
- the task ends after guidance.

guide.ts: one guideToCommit(el, line) built from ui.pointAt(el, false), ui.spotlight(el, {commit: true}) and say. It is passed to runAgent and used by the executor's confirm (executor.ts:175-183).

Planner: commit-intent utterances become a confirm step on the guard selectors, never the agent; no agent step on an origin with an empty guard; no click plan on a destination whose text matches the commit words.

VG_PUBLIC refuses to start when the agent is on and an origin has no guard.

Fixture: a hand-written eshop-origin page served by offline replay under the real shop URL (no Vodafone code). It has 20 cards with icon-only cart buttons, both sl-* ids, Arabic labels, a number-picker select, an OTP input, and a card wrapper whose centre lies on its cart button. Checks: Each fails on today's code first:
- with a stand-in model clicking the card wrapper, the cart handler fires today and does not after the fix; the pointer and commit spotlight show, the line is spoken, and the task ends;
- all 20 buttons are out of the selector map;
- the icon-only and Arabic 'اشتري الآن' buttons are refused;
- the number-picker select is refused;
- the agent's tool set equals the allowed set;
- planner units: 'add it to the cart' and 'ضيفه للسلة' on a shop URL give a confirm step, not an agent step; no agent step when the origin's guard is empty;
- tests/unit/public-config.test.ts refuses the unsafe start;
- in a demo-browser e2e on the fixture, the network log shows no request from the cart handler;
- sdk-size: guide.js within 20,480 B measured on Linux (if not, the confirm pointer waits for E3's saving) and agent.js within its budget.

Then typecheck, npm test and test:e2e. Owner: Review the EN and AR word list. Confirm that the agent may stay on the shop in the demo browser until this lands (nothing is deployed publicly, HANDOFF.md:143), or ask for a same-day hold.
- E2 The guide never says or shows a knowledge-base price or stock; prices stay as guide points: `valueFree()` in packages/text, sharing one pattern source with packages/kb/src/experience.ts:104,123. It covers both digit systems, EGP, جنيه, ج.م, instalments, discounts in percent and stock phrases, with an exception list for names that contain numbers.

Applied at the planner's single exit: say, question, options, captions, confirm messages, plan.say and session last.name (planner.ts:52-55, 141, 149-154, 175-176, 184, 197-199). Also applied to /v1/page-map titles and to the speech:warm lines and knownLines (tools/speech-warm.ts; packages/kb/src/plan.ts:76-84).

The clarify 'show both' fallback.

Docs: AGENTS.md §4.3 rewritten as the owner decided; SPEC-04 §1 'Values' row; an amendment note on ADR-0011 §3. Checks: A new sweep test: every destination of config/kb/vodafone-eg.manifest.json, under each intent (navigate, describe, select, clarify pairs, watch) in ar and en, gives zero money or stock matches in plan text and knownLines. It fails today on labels such as '5 جيجا 46 جنيه'.

`npm run speech:warm -- --dry-run` lines are scanned the same way.

Gate units: Arabic-Indic digits are stripped, '25-55' and '5 GB' are kept.

`npm run eval:router` within ±1 case of the baseline. Owner: Approve the AGENTS.md §4.3 wording.
- E3 No read values, raw utterances or full URLs in traces or session turns; the trail treats shop forms as private: The executor's spotlight returns field names and length, not the read text (executor.ts:157). /v1/progress keeps only an allowlist of attributes for sdk.* events (server.ts:248-249).

The router masks the utterance with maskContent before turn.received and before Turn.utterance is stored (services/shared/store/types.ts Turn); page URLs become path plus keepQuery.

Agent state lines are masked. agent-mask catches camelCase 'nationalId' (agent-mask.ts:16-28).

Trail policy (packages/sdk/src/trail/config.ts:77-101): sensitivePaths gains order-status, numbers, review, subscription-details, documents and dsl-checkout; privateFields gains national-ID and tel inputs. Amendment lines in ADR-0018 and ADR-0037 §3. Checks: Integration: a turn saying '01012345678' and a spotlight read of '46 EGP' leave trace_events and the session row without either. This fails today.

Trail unit: a page with input[name=nationalId] is private.

sdk-size: guide.js gzip measured on Linux, expected to drop; record the saving for E1 and E7.

npm test and test:e2e green.
- E4 No sync reaches the shop until its safeguards exist; replay says what it really does: `crawl.origins.shop.ready: false` in the site config. runSync and runIngest refuse any run whose origins include shop while it is false; the runbook §5.1 says so.

The tools/demo-live.ts:109 '(offline)' message becomes 'saved pages; pages not saved, the shop included, open from the internet', and runbook:90 is corrected. Owner decision 6 keeps the live fallback.

docs/handoff/live-demos-way2.md and the phase 3 map get the eshop track and a note that the 0053 and 0054 reservations are void. Checks: Unit: `runSync` with the vodafone-eg config and no --origin refuses before any fetch (a stub fetch counts 0). It fails today.

A test that the replay banner never says 'offline' unless offline:true is passed.

sync.test.ts and crawler-url.test.ts green.
- E5 Reading 1: records know their site, and shop links keep one key: record.js: `source.site` (missing reads 'web'). The page key is site plus pageKeyOf plus keepQuery, with categoryUrls normalised (record.js:21).

live-adapter.js:138: link keys are `<host><path>` on both origins, with an alias for host-less keys already stored.

The album's t() marker 'In the shop' / 'في المتجر' on shop CTAs. An ADR-0051 amendment line. Checks: pocket-record.test.mjs: '/' on web and on the shop are distinct; two category lists are distinct; '*smart-phones' equals '/smart-phones'; an old record reads as web.

tests/integration/live-adapter.test.ts re-match numbers unchanged (home 10/10, Cash 8/8, Services 29/30, RED 7/8, bundles 19/20).

S7's own checks.
- E6 Price questions searched by guide points, answered only from the live page: The builder extracts `Destination.guide` (price and stock with seenAt) from the collection fields; the manifest schema and integrity checks follow.

understand() parses 'around N pounds', 'حوالي ٥٠ جنيه', cheapest or dearest, and 'in stock'. The router ranks by guide point. The plan is navigate, pickItem, then spotlight with a live read. Reply templates hold no value.

The executor says it cannot see the item when the live read fails, with no knowledge-base fallback.

Price-near cases are added to tests/fixtures/vodafone-utterances.yaml. Checks: `npm run eval:router` with the new cases on the committed manifest. Planner units: no value in any text, and the read is live. Executor unit: a missing live item gives the 'cannot see it' line. E2's sweep is still green.
- E7 Background guide-point updates from the visitor's page, off by default: Planner: `observe` added on reads of public, non-commit destinations that have guide points.

An on-demand `observe.js`: only Vodafone's own content, no [data-aixc] or [data-vg] nodes, parse, maskContent, send only when the value differs.

POST /v1/kb/observations, modelled on server.ts:273-297: three gates; zod; active version; destination and page checks; binding to a real turn; per-address limiter; counts-only trace.

Rules: R1 through the demo-browser forwarder header `x-vg-observer`, added only when running live (demo-browser.ts:195-220); R2 off by default and refused by VG_PUBLIC unless set. Plausibility band, one change per day per item, a daily site cap.

The `kb_guide_points` overlay with an audit table; `npm run kb -- --observations` and `--revert`. The sync report lists overlay changes. Checks: Each fails first:
- a single unattested report is held;
- an attested one is applied, audited and revertable;
- a replay-mode demo browser sends none;
- a report with no matching turn is refused;
- R2 applies only with two distinct sessions and address hashes;
- an out-of-band value is held;
- the daily cap holds;
- a value read from a [data-aixc] copy is never sent (browser test);
- trace_events hold no value.

observe.js within a new chunk budget; guide.js within budget. Owner: Turn it on or keep it off; R2 off in public (recommended); the 0.5× to 2× band and the daily caps; stock updates too, or only price.
- E8 Crawler politeness and scope for the shop: the whole menu, robots failing closed, paced per origin: robots fails closed per origin, is fetched with the crawler's user agent and is saved verbatim (crawl.ts:48-51, 187-192).

A per-origin scheduler: navigation starts at least 1 s apart per origin, shop delay 2 s (a knob), shop concurrency 1; back-off on 429 and 503 honouring Retry-After; status 400 or above is not a page (crawl.ts:79-104, 124-146).

The run stops at the first sign of a bot check on the shop.

A test that the crawler never clicks, scrolls to load or types.

Per-origin page caps (shop about 80). Carry-over of origins not crawled, or refusal (sync-lib.ts:72-79; ingest-lib.ts:54-69).

Transactional excludes at any depth, case-insensitive; legacy /shop/ paths out; /lines/*/numbers out by default.

Seeds from a committed `vodafone-eg.shop-menu.json`, written by hand from the cached MAIN_NAVBAR and FOOTER (dated 2026-11-12, paths and labels only), cross-checked against the 28 web-linked shop URLs. One robots-checked refresh of the menu API, only in owner-run runs.

A third, hand-written shop origin in fixtures/sites/demo-telco. Checks: Each fails first:
- a stubbed robots 503 gives 0 pages for that origin;
- every Disallow in the recorded text has an exclude;
- request timestamps on the fixture are at least 1 s apart per origin, shop never 2 at once (SPEC-04 AC6);
- a 503 with Retry-After is waited for;
- a 404 is not kept;
- a challenge iframe stops the run;
- an `--origin shop` run keeps web destinations (churn 0, gate passes);
- crawler-url.test.ts gains the URLs measured in the eshop map (dsl-checkout, subscription-details, lines/*/review and the rest are out).

ingest e2e green. Owner: Pace on the shop (1 s or 2 s); the cap; the menu-API refresh request; whether the crawler's own context blocks known analytics beacons.
- E9 Shop rendering and extraction: Angular wait, commit points outside forms, stable ids, guide points: Wait for vf-root or app-root to settle (reuse settleApp; a 20 s cap), not networkidle alone (crawl.ts:95-96). Scripts on for the shop and /spa/; a decision for CMS pages.

Commit points outside forms from E1's shared word list, alt 'cart' and the sl-* ids (extract.ts:16, 316-333). Item names from title classes (extract.ts:193, 225). Shop transactional kinds.

Stable ids for keepQuery pages; the stacked-suffix fix (build.ts:220-228); category normalisation in url.ts:13-25 and kb-index.ts:29-44. Guide points from shop cards.

Shop router, overlay and evaluation cases drafted on the fixture manifest, with a 'buy' flow that ends in a confirm step. Checks: On the demo-telco shop origin and synthetic crawls:
- the cart, buy-now and number controls are commit:true;
- names hold no price;
- adding a category renames no id;
- '*x', '/x' and '%2Fx' give one page;
- E2's sweep passes on the fixture manifest;
- eval:router on the fixture manifest; DSL and home-internet requests still resolve to web.
- E10 Owner's visit 1: facts and saved shop pages, signed out (live): Live only, nothing in the code.

Record: robots.txt of both origins, verbatim; header and cookie names (no values); OneTrust's selector and boxes in EN and AR; whether the widget is on the shop; the categoryUrls spelling; where dsl/bundles lands; the vf-root settle time and whether networkidle comes; card attributes; the request names when /lines/red/numbers loads; whether #vgh survives; whether storage survives a reload; the sign-in control selectors.

Save the rendered and raw HTML of 4-6 public shop pages to a private fixture. Checks: A dated note in the audit with (re-verify) marks. A personal-data check of the saved HTML before it is kept. A page count of 25 or fewer, at 1 per second or slower. No bot check seen, or a stop. Owner: Update O29 first. Run the visit (his own Chrome by hand is preferred). Answer the banner only for the geometry check.
- E11 Commit visit 1's results: verbatim robots, a private shop replay fixture, guard tests on real markup: Replace the reconstructed SHOP text in tests/unit/robots.test.ts:21-39 with the verbatim file.

Add the saved shop pages to a private replay fixture; re-run E1's agent and executor tests and E9's extraction against them.

Settle /lines/*/numbers in or out, the signed-out markers for E7, the shop's banner and widget stand-ins for S16, and the URL spellings. Checks: Robots coverage test against the real text. Guard tests on real cards: every add-to-cart and buy-now control refused, no request from the cart handler. Extraction finds commit points and stable ids on the saved pages. An offline-replay test of the shop pages leaves 0 requests. Owner: Decide /lines/*/numbers from the facts.
- E12 Owner's visit 2: the web-only held sync (live): Runbook §5.1: `npm run sync -- --site vodafone-eg --origin web --dry-run`, then the run. Review the expected churn of about 68%, activate, then `npm run experience -- --site vodafone-eg --activate`. Checks: The dry-run report is read (lost destinations first, then pairs matched only by position). eval:router after activation. E2's sweep is still green on the new manifest. Owner: Run it off-peak; read and approve the activation.
- E13 Owner's visit 3: the first shop sync, dry run first (live): Flip `crawl.origins.shop.ready` in a commit with all of E8 and E9's tests green. `--origin shop --dry-run` with carry-over, then the report, then activation and the experience rebuild. Refresh the committed manifest; fill the real shop ids into the overlay and the evaluation cases. Checks: The report shows: the robots outcome, 0 blocks, errors, pages within the cap, commit points found on the shop, guide points found, E2's sweep with no spoken values, eval:router with the shop cases, and web churn 0 thanks to carry-over. Owner: Run it off-peak; read the report; approve activation.
- E14 The Pocket's server-side store and one identity across the two origins (off by default): First, a spike: two synthetic origins of one site in Playwright (Chromium, Firefox, WebKit noted), measuring that a Partitioned, HttpOnly gateway cookie is shared under both tops.

Then:
- `services/pocket/` with Postgres tables and the /v1/pocket routes;
- server-side validation: schema, size, maskContent, URL, query-key and source-page allowlists, expiry, Clear;
- identity: the Partitioned cookie on the public route; the demo-browser forwarder's `x-vg-pocket` header on the owner's Mac;
- `openServerPocketStore` with the same interface as store.js, IndexedDB as cache and outbox, a one-time upload of local records;
- `pocket.store` setting; VG_PUBLIC start refusals;
- docs: AGENTS.md §4.3 note and live plan §3.9 amended. Checks: Each fails first:
- a sticker kept on a web-origin page appears on a shop-origin page (synthetic pages of one site);
- a record holding an email or phone is refused;
- a CTA with `search=` is stripped;
- a record from a cart path is refused;
- the cookie is never readable by document.cookie;
- the store keeps the AIXC-56/57/58/64/67 behaviours with the server backend (port the pocket-store tests);
- the server unreachable gives 'kept for this page only' and no page error;
- the public-config refusals hold. Owner: Accept the partitioned identifier and 90-day idle expiry; Postgres or memory on the public gateway; whether S17 runs with the server store.
- E15 The layer and the Pocket on e-shop pages, album only ('3-shop'): Loader `experiences.origins.shop` with allow and deny lists; the vf-root condition (loader.ts:90-91).

ShopHost with regions outside vf-root; a read-only shop adapter with a WeakMap and no tags inside vf-root; PROTECTED for the shop header and footers, OneTrust, TOBi and the floating section.

Route following through navigatesuccess: deny means the guard stops everything; allow means read again, fetch the page map again and update the Pocket's page object (demos/pocket.js:35).

vf-* recognisers and keys from the saved pages. The album only, no chips; one Pocket through E14.

The S11 lift stays web-only. S16 matrix cells for the shop. Amendments to ADR-0048 §1, ADR-0046 §2-3, ADR-0049 and live plan §3.5. Checks: On the private shop replay fixture:
- no layer on cart, checkout, numbers or account;
- a stand-in route from a list into /en/cart removes every [data-aixc] node before any read;
- the outerHTML of vf-root is unchanged except for Vodafone's own changes;
- 0 attribute writes inside vf-root;
- OneTrust and TOBi uncovered at 1366 and 375, EN and AR;
- the re-match numbers on the saved shop pages are recorded;
- a sticker from the web album shows;
- ?aixc=off works;
- aixc-delivery.test.ts is updated deliberately. Owner: Album-only on the shop to start; whether shop stickers keep stock and countdown text; when to show chips beside Vodafone's wishlist button.
- E16 Owner's live smoke: S17 on web, then the shop on a separate run (live): V4a is S17 as specified (tests/live/pocket.live.test.ts).

V4b runs on a shop list page:
- 'what is this page' and 'cheapest phone' from a live read;
- 'add it to my cart' gives the pointer and highlight, nothing pressed;
- if E7 is on, one attested report is applied and then reverted;
- if E14 is on, a sticker kept on web is in the shop's album;
- if E15 is on, routing into the cart removes the layer. Checks: No [AIXC] errors; the banner and widget untouched; the network log shows no cart or checkout API call and no request from us to Vodafone other than the page loads; at most 1 page per second; a stop on any bot check; results recorded with date and conditions. Owner: Run both halves on separate runs, after O29 is updated; switch E7 and E14 on or leave them off for the run.

Open questions:

- ADR numbering. ADRs 0053-0056 already exist (public gateway, Claude agent, Whisper STT, extension; untracked, listed in voice-guide/docs/adr/README.md:58-61). Under your writing-order rule the eshop ADRs start at 0057, not 0053 as decision 8 says. Confirm 0057 onward, and that S11 and S13 take numbers when written.
- /lines/*/numbers is a menu link, so 'the whole menu' includes it. But choosing a number is a commit control (decision 4), and whether loading the page reserves a number is unknown. Keep it out of the crawl and the layer until visit 1 shows the page has no effect on Vodafone's side? Recommended: out.
- Until E1 lands (about a day), may the agent stay on the shop in your demo browser, or do you want a same-day hold? Nothing is deployed publicly (HANDOFF.md:143). Do not deploy the public gateway or extension before E1; E1 adds a start-time refusal.
- Rules against bad reports. The site key is public (ADR-0056 §3), so 'only the demo browser's site key' cannot be a rule. Proposed: R1, reports attested by the demo browser's Node-side forwarder in live mode only (never replay), on; R2, two matching reports from distinct sessions and addresses, off, and refused on the public gateway. Also a 0.5× to 2× band and one change per item per day. Agree? Should reports update stock as well as price?
- Signed-in visitors. On web or the shop, a signed-in person may see personalised prices. Until visit 1 finds a sign-in marker, reports come only from your signed-out demo browser. Should the public route ever send reports?
- Shop stickers. Decision 5 says copy as published and dated. Does that include stock and countdown text ('only 3 left', timers), or should those be dropped (the eshop map's D10)?
- Crawler user agent. You said to keep 'VodafoneEG-VoiceGuide-Crawler/0.1'. Keep it exactly, or add the '(+contact)' suffix that SPEC-04 §4 requires (it needs a contact address in the site config)?
- Shop pace. The standing rule is 1 page per second. Each Angular shop page fires several API calls, so the proposed default is 2 s with concurrency 1 on the shop. And should the crawler's own browser context block known analytics and beacon hosts (Tealium, GTM, Facebook, Dynatrace beacons), never bot-management scripts, so a crawl is not counted as visits?
- Menu seeds. Commit them now, written by hand from the 12 Nov cache of the public MAIN_NAVBAR and FOOTER menus, and allow one paced, robots-checked refresh of /ecommerce/api/menu/menu-hierarchy per owner-run crawl? robots.txt does not mention /ecommerce/api, which is not the same as permission. Cap about 80 shop pages?
- Pocket identity on the public route. Is a Partitioned, HttpOnly cookie on our gateway's host acceptable? It is an identifier we keep in visitors' browsers; Safari may not share it, and those visitors get two Pockets. Idle expiry 90 days? Postgres or the memory store on the public gateway, which forgets on restart?
- Visit 1: your own Chrome by hand (safest against bot management, and the facts are the same) or the demo browser with --aixc off and the agent off? And may you answer the shop's OneTrust banner once, yourself, to record its answered geometry?
- The storage keeper (ADR-0053) now also patches localStorage.clear on the shop, so our vg-/aixc. keys survive the shop's own clearLocalStorage() and logout. Acceptable, or limit it to the web origin?

### Demo value first. The owner should see the e-shop in his demos as early as possi

- Safety before show. The commit guard ships first, because the risk exists today. guide.js and the fallback agent already run on shop pages in the demo browser (packages/loader/src/loader.ts:73, 78-88). The knowledge base has 0 commit points. The agent hides only the first 4 matches of each commit selector (packages/sdk/src/agent.ts:46). Its click tool never checks the guard (agent.ts:81-94). Its prompt says purchase buttons are hidden (agent.ts:56), which is false.
- Zero bytes in guide.js. The minified build on disk is 21,199 B gzipped against 20,480 B. E-shop features go on the server (router, gateway), in the agent chunk (agent.js, 59,658 B gzipped, loaded on demand), or in a new on-demand chunk behind a gate of about 30 B, like voice-out's (sdk-size.test.ts:110-112). The one or two guide.js lines that must change are paid for by removals in the same commit, and measured.
- Offline first, every time. Each demo moment is first shown on the saved pages (fixtures/replay/vodafone-eg, -2026-11-12), or on a hand-written page served under the real eshop URL in offline replay. The demo browser already serves saved pages for every site origin, and with offline: true nothing leaves the machine (tools/demo-browser.ts:55-64, 287-317, 355-358). No Vodafone JavaScript or markup is reused in stand-ins.
- Few live visits, each owner-run and scripted. No live step happens before O29 is updated. Visits are signed out, at most 1 page per second, stop at the first bot check, never answer the cookie banner, never press a commit control, and each follows a written checklist, so one visit yields everything later steps need.
- The knowledge base guides; the live page answers. Prices and stock stay in the knowledge base to find things. One server-side value-free speech function sits between knowledge text and anything spoken, shown or sent to the model. Answers are read live by the executor (executor.ts:244-256). Traces and logs hold no read values (AGENTS 4.3 and 4.4).
- Nothing new reaches Vodafone. The background update uses only what the visitor's own page view already showed. The gateway never fetches Vodafone. Crawls stay on demand and owner-run. Scheduled crawling waits for Vodafone's written approval (PRD D3).
- Reuse the seams that exist. Built-in selectors go to the CommitGuard through the session's commitTargets (dom.ts:112-132; guide.ts:107, 231). The guidance reuses the pointer and commit ring (ui.ts:78-88, 311-338, 374-390) and the confirm op (executor.ts:175-183). The Pocket's store interface stays (store.js; host/demos/pocket.js:33, 84). The observations endpoint is built on the pattern of the contributions endpoint (gateway/server.ts:273-297).
- The carrier holds identity, and the page never holds a secret. The Pocket id comes from the carrier (demo profile, extension storage). The observer key is added by the demo browser's own forwarder (demo-browser.ts:218-220), so Vodafone's page scripts never see it.
- Every decision gets an ADR in writing order (next free: 0057), with Pilot knobs and Revisit when, and a README row. AGENTS.md 4.3 changes in the same commits as the ADRs that need the change. Every fixed bug gets a test that failed before the fix.
- Vodafone's accessibility widget and cookie banner are never hidden, covered or restyled. The shop's banner selector is unknown, so the layer does not run on shop pages until the owner's visit has recorded it. The floating-control matrix (S16) gains shop cells.

**1. Price questions answered without quoting knowledge-base values**

Prices and stock stay in the knowledge base as guide points.

Guide points: values derived at index time from the knowledge base's own text, the money, data and stock in each destination's labels and target text. They live in shared/kb-index as guidePoints(d) = {price?: {n, unit}, data?: {n, unit}, stock?: 'in'|'out'|'low'}. The committed manifest is unchanged and the feature works on it today. data/crawls is absent, so the manifest cannot be rebuilt offline. A later build may write the same values as an optional Destination.guide field (packages/kb/src/manifest.ts, the Destination schema at about :58-84).

Understanding, server side: next to SELECTORS (understand.ts:109; select today is only min/max, :40), the router recognises 'around / under / over N pounds' and 'باقة بحوالي 50 جنيه'. It produces select {by: 'near'|'under'|'over', field: 'price', value: N}.

Planning: the planner ranks the collection's items by guide point and picks the nearest item, as a guide. It emits steps that already exist: navigate, if not on the page (planner.ts:215-223); pickItem by key (executor.ts:131-147); spotlight with a live itemRead (planner.ts:278-283; phrases.ts:14-17). The spoken price is the one read live from the page, so 0 new SDK code is needed. For 'under N' on a list the shop sorts itself, the guide spotlights the shop's own sort or filter control once the shop is in the knowledge base. Before that, the agent sorts live (moment 6, safe with the guard of design 3).

The value-free rule: one function, withoutValues(text, lang), in packages/kb. It removes money, percentages, instalments and stock words. It is applied to every piece of knowledge text that becomes speech, a caption, a chip, a model hint or a display title:
- the clarify question and its options (planner.ts:52-56);
- the agent hints (:63-70);
- the closest page (:79);
- the watch offer label (:138-141);
- the page summary (:150-154);
- the 'taking you to' title (:167);
- the collection caption and say text (:175-176);
- the item name kept in session.last (:182);
- the visual descriptions from the vision model (:196-197).
It also applies to the titles served by GET /v1/page-map and /v1/experience. The raw text stays in the knowledge base for matching.

When a live read finds nothing, the guide says it could not read the price here and spotlights the card. It never falls back to the knowledge base. The executor's caption fallback is the step caption (executor.ts:155), which the planner now makes value-free.

Follow-ups ('and how much is it?') re-read the live page. The session keeps ids, never values.

The agent prompt gains a line: 'Never state a price or stock you did not read on this page in this task.'

AGENTS.md 4.3 becomes: 'Prices and stock may be kept in the knowledge base as guide points for finding things (owner, 2026-11-13). The guide never says or shows a price or stock value from the knowledge base: it takes the person to the live page and reads it there. Balances and personal data are never stored in the knowledge base, traces or logs.'

Offline demo now, on the saved bundles pages in both languages: 'a bundle around 40 pounds', 'أرخص باقة', 'the most data'.

Risks: Product names that contain a number ('Flex 45', 'Plus 37') keep it: the scrub needs a currency word, so a name that matches a price is still spoken as a name. Accepted, and to be documented.; The phrase 'nearest by guide point' can pick a card whose live price has since moved. The spoken value is still the live one, and design 2 corrects the guide point.; Router accuracy on price requests needs measuring: add held-out cases to tests/fixtures/vodafone-utterances.yaml and run eval:router before and after.; The scan test over all plans may find knowledge text in places I have not listed. That is the point of the test: it should fail before the fix.

Evidence: The committed manifest holds 294 money-like strings in labels, target text, descriptions and ids (eshop map §1, measured with money.py). The planner speaks or sends knowledge labels in the paths listed in the design (services/router/planner.ts:52, 63-70, 79, 141, 150-154, 167, 175-176, 182, 196-197). Items are already read live (planner.ts:169-173, 178-183; executor.ts:244-256: 'values are read now, never cached'). The phrase templates fill {price} only from the live read (services/router/phrases.ts:14-17).

**2. Background update from the visitor's page, and its rule against bad reports**

Source. Only the guide's own live reads: a spotlight step whose read the planner marks observe: true. The planner sets it only for item or collection fields of type money, data or stock (FieldSpec.type, manifest.ts) on pages whose kind is content or listing. Never on requiresAuth, account, login or checkout pages, never on a commit destination, and only on the site's origins.

Browser.
- executor.ts:157 stops returning the read text as the trace detail and returns 'read n fields'. This also fixes the first half of D14 and frees guide.js bytes.
- The field values (readAnswer's vals, executor.ts:245-251) go through a new gate in guide.ts (#chunk, guide.ts:600) to an on-demand chunk, observe.js.
- The chunk masks them with maskContent (agent-mask.ts:30, ADR-0018) and keeps only values of a strict shape: money is a number plus a currency word, at most 24 characters, with no run of more than 6 digits, so no phone or ID can pass; data is a number plus a unit; stock comes from a closed word list in both languages.
- It sends {sessionId, turnId, step, kbVersion, url, values} to POST /v1/observations.
- The gate's net cost in guide.js must be 0 or less, measured.
- A fallback costing 0 bytes, if the gate cannot fit: the server parses the filled template out of the progress detail before tracing, then redacts it. This is weaker against AGENTS 4.4, so not preferred.

Gateway, built on the contributions route (server.ts:273-297):
- siteFor: site key and origin (server.ts:87-93);
- a rate limit keyed on VG_CLIENT_IP_HEADER (ADR-0053 §2);
- a strict zod body of at most 2 KB;
- the session's current plan must hold step i as an observe read of destination D, so a browser can report only what the guide asked it to read in this session;
- the URL must be one of D's page variants, and kbVersion the active version;
- values parsed to typed numbers;
- a comparison with guidePoints(D) plus the overlay. The same value marks the point confirmed, with its date. A different value becomes a pending report.

The rule against bad reports. A change is applied when (a) the request carries x-vg-observer = VG_OBSERVER_KEY, or (b) two matching reports arrive from two different clients (salted hashes of the client address and of the session) within 24 hours, on the same knowledge version.
- The observer header for (a) is added by the demo browser's forwarder to /__vg/v1/observations (demo-browser.ts:218-220). The page never sees it, and the extension never has it: no secrets in the extension (ADR-0056 §3), and the site key is public.
- All demo-browser reports come from 127.0.0.1, so they count as one client under (b).
- Caps: at most 3 updates per destination per day. A price change of more than x3 or less than /3 needs (a). A report is ignored when the crawl that saw the page is newer than it.

Applying. A guide_points overlay (Postgres table and memory store), keyed (site, kbVersion, destinationId, field), holds the value, seenAt, source 'visitor' and the report count.
- The KbIndex consults it for price-near ranking and adds the new number as a matching token.
- Ids are never renamed: no churn and no sync gate.
- The next sync's kb-diff report lists visitor-observed points, and a fresh crawl supersedes them.
- No values go into traces or logs, only counts.
- No request goes to Vodafone (AGENTS 4.5).

Pilot knobs: observations.enabled, VG_OBSERVER_KEY, minReports 2, windowHours 24, maxUpdatesPerDay 3, maxRatio 3, and whether stock is observed at all.

Offline demo, with a stand-in copy of the saved bundles page with one price changed, served under the real URL in replay: the guide reads the new price, the X-ray shows 'guide point updated', and the next 'around N' finds the card.

Risks: Poisoning from the public extension: (b) needs two clients, but one person with two networks could pass. Caps and the ratio rule limit the damage. The owner may prefer only (a): an open question.; Stock changes by the minute. Updating stock guide points may churn without value: an owner question.; The guide.js gate may not fit while the build is 719 B over. The server-side parse fallback exists but masks after the value has left the browser.; The overlay must be dropped when a new knowledge version activates, or else carried over by destination id. That needs a test.

Evidence: Read text reaches traces today: executor.ts:154-157 and :71, and server.ts:231-253 traces sdk.* events with their attrs. The contributions route already validates against the active knowledge version, refuses private and commit destinations, uses a day bucket and counts only (server.ts:273-297). The site key is public (ADR-0056 §3). The demo browser forwards /__vg/** itself (demo-browser.ts:218-220). Measured: 0 price strings differ between the 23 Oct and 12 Nov saved Arabic pages (bundles 35/35, RED 10/10, Services 2/2, home 0/0).

**3. The agent's built-in commit guard and the guiding pointer**

Three layers, all 0 bytes in guide.js except one call.

L1, server. A new site-config block, guard: {selectors, words: {en, ar}, alt}.
- Selectors: #sl-add-to-cart-button, #sl-button-buy-now, [id^='sl-add-to-cart'], button.cart, vf-cart* and vf-checkout* triggers.
- Words: add to cart, buy now, checkout, check out, place order, reserve, pre-order, subscribe, pay, choose this number / أضف للسلة، أضف إلى السلة، اشتري، اشتري دلوقتي، اشتري الآن، ادفع، احجز، اشترك، اختار الرقم، اطلب، أكد الطلب.
- Alt words: cart, سلة, basket.
- The gateway appends guard.selectors to page.commitTargets in POST /v1/session (server.ts:131-153; knowledge pageContext, handlers.ts:30-45). The existing CommitGuard (dom.ts:112-132, built at guide.ts:107 and :231) and the agent's blacklist then cover them with no new SDK code.
- The planner never emits a click on a destination whose label or text matches guard.words. It emits confirm instead (flows at planner.ts:110-116; actions at :200-203).

L2, the agent chunk. A function isCommit(el) checks:
- every match of the selectors at the moment of the check, not the first 4 (agent.ts:46);
- the words on the element's text, aria-label, title and value;
- the alt text of images inside it, for the icon-only cart button;
- the nearest button or link ancestor;
- a submit button in a form.
The click tool (agent.ts:81-94) re-resolves the element and calls isCommit before clickElement. A commit element is never clicked. Its click turns into guidance and the task ends.

A new custom tool, show_commit_control({what}), lets the model hand over when the task reaches a purchase:
- the chunk finds the visible commit control nearest the current item;
- scrolls it into view;
- runs ui.pointAt(el) without a tap: the animated pointer of ui.ts:374-390, which honours reduced motion at :382-383;
- runs ui.spotlight(el, {commit: true, caption}): the orange ring of ui.ts:80 and the bubble;
- speaks the line 'Press Add to cart yourself when you are ready' (a new phrases entry beside commit, phrases.ts:27) in the person's language;
- returns done.
Commit controls stay hidden from clicks through the blacklist, now covering all matches, as defence in depth. The tool lets the agent point at them without an index. The agent prompt (agent.ts:56) is rewritten to say this truthfully. GuideAgentContext (agent.ts:149-164) gains ui (a reference: a few bytes in guide.ts).

L3, the executor for knowledge-base plans. confirm (executor.ts:175-183) gains await h.ui.pointAt(el) before its spotlight, so every commit point gets the moving pointer and the ring (measured bytes, paid for by design 2's detail removal). The click refusal (executor.ts:165) stays as the backstop.

Tests. A hand-written stand-in shop page under https://eshop.vodafone.com.eg/en/list?categoryUrls=… and /ar/…, in offline replay, with:
- 20 Add to cart buttons, including icon-only ones with alt 'cart' and the sl-* ids;
- Arabic and English labels;
- buttons outside forms.
A stand-in model (the fake API of ADR-0054) is scripted to click them. Checks: 0 click events reach any commit control (listener counters); the pointer ends within 2 px of the control's centre; .spot.commit is shown; the spoken line is the guidance; the agent ends. Unit tests cover isCommit in both languages.

The agent stays on on the shop (owner decision 4), which unblocks demo moment 6 (sort by price).

Risks: page-agent 1.12.4 internals (selectorMap, interactiveBlacklist of getters) may differ from expectations. Pin the version and test against it, as agent.ts:113 already does for pushObservation.; The word list can over-block, for example 'subscribe to newsletter' or 'pay bill info'. Over-blocking is the safe side: the agent guides instead of clicking.; The commit spotlight's full-page dim (ui.ts:78, 0 0 0 9999px) visually covers the accessibility widget while it shows. This is existing behaviour, but check it in S16's matrix for AGENTS 4.6.; Real shop markup may differ from the compiled templates. Re-check the selectors on the owner's saved pages (E10).

Evidence: agent.ts:45-48 (blacklist of the first 4 matches, built only from commitSelectors); :56 (the false prompt line); :81-94 (the click tool calls clickElement unguarded); :149-164 (the agent's context). executor.ts:162-174 refuses only through the guard; :175-183 confirm already spotlights with commit: true and says the commit phrase. ui.ts:78-86 (.spot.commit, .pointer with a 0.55 s cubic-bezier move); :374-390 pointAt. knowledge handlers.ts:35 builds commitTargets only from the knowledge base, which has 0 today. The shop's cart button is type=button with only an image alt 'cart', and the app names its buttons sl-add-to-cart-button and sl-button-buy-now (eshop map, cached chunk-VOFNPJR7.js and chunk-HL5CG2PI.js).

**4. The e-shop crawl of the whole menu, with its safeguards**

Seeds come from the shop's own menu data, because its menu items are click handlers (onOpenCategory calls router.navigate(['list'], {queryParams: {categoryUrls}})).
- A read-only tool reads, from the demo profile's HTTP cache, only public eshop entries: never History, Cookies or Login Data.
- It decodes MAIN_NAVBAR (Cache_Data/d2b4d3331e841730_0, brotli, 12 Nov). Measured: 29 entries: PAGE /list; LINKs /lines/flex/plans, /lines/red/numbers, /internetServices/at-home, /internetServices/dsl; 24 CATEGORY entries (/smart-phones, /tv, /laptops, /tablets, /gaming, /consoles, /monitors, /controllers, /gaming-accessories, /games, /large-appliances, /true-wireless, /portable-speakers, /wearables, /accessories, /cables, /powerbanks, /chargers, /flash-memory, /covers, /holders, /smart-home, /home-appliances, /wifi-devices).
- It writes a committed seed file of URLs only, with the cache date: CATEGORY becomes /{en,ar}/list?categoryUrls=<url>; LINK and PAGE become /{en,ar}<url>.
- It adds the eshop links found on saved web pages (28 distinct URLs, 23 after keeping only categoryUrls).
- FOOTER (Cache_Data/7ff97728f7c4ab42_0) only if the owner says it is part of 'the menu'.
- At crawl time the crawler may fetch the menu API once per language (robots-checked, paced). It reports added and removed categories against the committed seeds and never follows an entry that is out of scope.

Scope: the whole menu, minus transactional steps.
- Out: cart, checkout, wishlist, register, account, order status, profile, payment; robots.txt Disallow lines; and the transactional children dsl-checkout, subscription-details, at-home-subscription-details, lines/*/numbers (so the menu's /lines/red/numbers is dropped) and lines/*/review.
- Products stay items of the lists: cards link to '#'.
- About 28 menu pages plus home, times 2 languages: about 58 page loads. Redirect landings (dsl to dsl-landline, at-home to at-home-bundles) are kept as aliases.
- A per-origin cap (shop 70), because maxPages 220 is shared (vodafone-eg.yaml:79).

Safeguards, all in place before any live run (eshop map §6, adjusted to the 2026-11-13 decisions):
1. robots.txt fails closed per origin, is fetched with the crawler's user agent, and is saved verbatim in crawl.json (today crawl.ts:48-51 and 188-189 fail open).
2. Pacing per origin: at most 1 navigation per second, and 1 page at a time on the shop (today the delay is per worker, crawl.ts:94 and 171, with concurrency 2, yaml:85-86).
3. Back-off on 429 and 503 with Retry-After. Pages with status 400 or above are not kept.
4. Stop at the first bot sign on the shop: a title, a challenge frame or a challenge script. No retry, no change of user agent.
5. Wait for vf-root to have children plus a quiet period (reuse settleApp, browser-crawler.ts:78-87), with a hard cap. Not networkidle plus 150 ms (crawl.ts:95-96), since Dynatrace, Tealium and mqtt may keep the network busy.
6. Scripts on only for /spa/ and the shop, by full-URL rule (scriptsFor today matches '^/spa/' on the path alone, yaml:95).
7. A test that the crawler never clicks.
8. Public only (crawl.ts:62, 106-113). A redirect to the Keycloak login is out of scope.
9. The cookie banner is never answered.
10. Commit points detected outside forms, with the guard's words, alt text and sl-* ids (today only submit buttons in forms, extract.ts:16 and 321-324).
11. Transactional pages marked by kind (today every page is content, build.ts:259).
12. Stable ids for keepQuery pages (shop.list.smart-phones), and a fix for the stacked suffixes (build.ts:227-228).
13. categoryUrls spellings (*x, /x, %2Fx) normalised to one key in url.ts and in kb-index variantKey.
14. Item names from title classes, not card text (extract.ts:193 and 225 put prices into names). The price becomes a guide point, not part of the name.
15. A --origin shop run carries the web pages over, or refuses (sync-lib.ts:72-79; ingest-lib.ts:54-69).
16. A dry run first, and its report read before activation.
17. The user agent keeps its name, VodafoneEG-VoiceGuide-Crawler/0.1 (owner decision 7; yaml:100).
18. Owner-run from his Mac, off-peak Cairo time, after the held web-only sync.

Prices stay (owner decision 2): no scrub.

Risks: The live menu may differ from the 12 Nov cache. The crawl-time refresh reports the difference.; Whether networkidle ever arrives on the shop is unknown. The vf-root wait with a hard cap covers it, and the dry run measures it.; Shop page ids churn when categories change. The stable keepQuery ids reduce that, but ids built from prices still rename on price changes (owner question).; Requests the web already answers (DSL, home internet, 'buy') may start resolving to shop pages. Measure with eval:router on a fixture manifest before the live sync.

Evidence: Cache decode run today, read-only: 29 MAIN_NAVBAR entries as listed. config/sites/vodafone-eg.yaml:16, 50-52 (3 shop seeds), 55, 76 (excludes cart, checkout, wishlist, register and account only), 79, 85-86, 95, 100. The facts on crawl.ts, extract.ts, build.ts and sync-lib.ts are from the eshop map's kb-crawler section and §6, as cited there; I did not re-read those files.

**5. The server-side Pocket store, and one identity across the two origins**

Store. Gateway routes:
- GET /v1/pocket;
- PUT /v1/pocket/:key;
- DELETE /v1/pocket/:key;
- DELETE /v1/pocket (the album's Clear).
They take x-vg-site-key plus x-vg-pocket <id>, the origin check (server.ts:87-93), rate limits, and caps of 200 records of at most 4 KB.

The body is a strict zod mirror of record v2 (record.js:41-69) plus source.site ('web'|'shop'), updatedAt and tombstones.

Server-side refusals:
- URLs (cta.href, image.src, source.path) off the site's origins or Vodafone hosts;
- a source.path on a transactional or account path;
- any string matching the masker's personal-data patterns (phones, e-mails, national IDs, card numbers; agent-mask.ts) is refused, not stored.

Storage:
- a Postgres table pocket(site_id, pocket_hash, key, record jsonb, updated_at, deleted_at), with the id stored as an HMAC under the platform secret;
- the memory store elsewhere, which on the public Fly gateway forgets on restart (ADR-0053 §3): say so, or use Postgres there;
- retention 30 days from last use; Clear deletes at once;
- no trace events with record contents, counts only in metrics.

Client: openGatewayPocketStore({gateway, siteKey, pocketId, cache: openPocketStore()}).
- Same interface as store.js: ready, persistent, all, get, put, remove, clear, subscribe, legacyIds, dropLegacy, close.
- The IndexedDB store stays as a write-through cache: instant first paint, and it keeps working when the gateway fails ('kept on this site until the guide's server answers').
- The server is the source of truth. On ready: pull, merge by updatedAt with tombstones, and upload local-only records once (the move from ADR-0051 §1's store).
- Same-origin tabs keep the BroadcastChannel. Across origins: re-pull on visibilitychange, focus and pageshow.
- host/demos/pocket.js:33 picks the backend. The gateway and site key come from the layer's own tag (host/index.js:32-33).

Identity. A random 128-bit Pocket id. It is not the guide's session (tab-scoped, crossing origins only through #vgh, guide.ts:98-99 and 526-529) and not the trail's id. It is never sent with turns or traces.

The carrier holds it, because the two origins share no storage: IndexedDB is per origin even though Chrome treats them as one site.
- Demo browser: a file in the git-ignored demo profile, passed in LoaderOptions (packages/loader/src/loader.ts:31-46) and set as data-aixc-pocket on the layer's tag (loader.ts:94-99).
- Extension: chrome.storage.local, which ADR-0056 §3 already permits, passed to the page by an isolated-world script.

Fallback without a carrier (mode A): link codes on our own crossings. The guide's handoff carries a pocket link, and the album's links to the other origin add #vgp=<one-time code>, minted by POST /v1/pocket/link, valid 2 minutes, used once. Two Pockets met that way merge (union).

The ADR supersedes ADR-0051 §1 (browser-only store). ADR-0051 §2-6 (record and re-match) stay. The owner note in AGENTS 4.3 changes from 'in the visitor's own browser' to 'in the Pocket's store (the visitor's browser or our gateway)'.

Risks: The id sits in a data attribute that page scripts (Tealium, Dynatrace) can read. It unlocks only public stickers. The ADR must state this, or the isolated world must do the fetches itself.; Merge conflicts across origins: last writer wins can resurrect a removed sticker if a tombstone is lost. Tombstones are kept for 30 days.; The public gateway on the memory store loses everyone's Pocket at each restart.; A gateway that is slow at first paint: the cache-first read avoids a blank album, but tests must show it.

Evidence: store.js:23-26 (aixc-v1, aixc-pocket); its interface is documented in the header comment and the return object. host/demos/pocket.js:33 opens the store and :84 passes it to initPocket as a seam. record.js:41-64 holds no site field: origin at :60 means who kept the sticker. Measured in the eshop map: the two origins are one site to Chrome with IndexedDB per origin; the shop's CSP allows connect-src 'self' *, and web has no connect-src (vodafone-live-site-audit.md:22, 28), so both origins can reach a public gateway. The eshop map's D8 had recommended against a gateway store for privacy. The owner's decision 5 overrides it, and the ADR must say so.

**6. The album showing shop-linked stickers (Reading 1)**

Record v3, additive:
- source.site ('web'|'shop'; a missing value reads as web);
- the page key per site, keeping categoryUrls for shop lists (pageKeyOf drops the whole query and the language, record.js:21);
- link keys that always include the host on both origins: live-adapter.js:137-138 drops the host for same-origin links, so the same shop link gives different keys on web and on the shop;
- shop calls to action stay absolute.

Album:
- A sticker whose call to action goes to the shop shows a small 'In the shop' / 'في المتجر' label in Vodafone's style.
- Stickers are grouped by source page, with the site ('Shop · Smartphones') once shop-kept stickers exist (S7).
- Shop links open natively in the same tab. The portal (S13) gives shop destinations a preview only and never animates into the cart, checkout or /lines/*/numbers (eshop map B2).

In replay, owner decision 6: the live fallback stays, so a shop sticker opens the live shop. Only the '(offline)' message and the runbook change.

What the owner sees: after S6 (chips) and S11 (the Pocket button), on the saved web pages he pockets a bundle or phone card whose 'Buy now' goes to the shop. The album shows it dated, with the shop label, in both languages, and the same sticker appears in a second tab, on the shop origin once E6 is in.

Before S6 and S11, records can be seeded and the album opened through the ?aixc-debug hook (ADR-0052 §8). That is for tests only.

Risks: Changing the record before S6 avoids a v2-to-v3 migration later; changing it after S6 means migrating stored records. Do it first.; In replay, the live fallback opens the real shop. It fails when O29 is unresolved, and that is correct but must be said on the console.

Evidence: The saved web pages hold 323 eshop link instances (28 distinct URLs) and 20 eshop 'Buy now' actions across 14 pages (eshop map §1, measured on fixtures/replay/vodafone-eg/crawl.json); the phase 3 map counts 19 card calls to action the adapter reads. record.js:21, 41-64; live-adapter.js:132-153 (keysOf). The portal already treats eshop links as eligible, with a preview by default (eshop map: pocket-portal.test.mjs:295, 459-461).

**7. The layer and the Pocket on e-shop pages (Reading 2)**

Loader: rules per origin instead of web only. Today: loader.ts:19-29 and 89-101, with the web origin at :91, #main-content required at :92, and once at DOMContentLoaded at :106. The new config is experiences.origins: {web: {paths, needs: '#main-content'}, shop: {paths: allowlist, needs: 'vf-root'}}.
- The shop allowlist: home; list?categoryUrls=…; prod/…; the internetServices dsl and at-home landing children; lines/*/plans.
- Never: cart, checkout, wishlist, register, account, profile, order-status, payment, numbers, review, subscription-details, dsl-checkout.

ShopHost, a PageHost variant:
- regions as siblings after <vf-root>, never inside Angular's tree;
- hideSource puts the hidden attribute on vf-root and restores it exactly;
- chromeBottom from the shop's fixed nav bar;
- protected nodes: the shop's cookie banner (selector from the visit), vf-tobi-chatbot, vf-floating-section, and the accessibility widget if present.

Routes: the Navigation API's navigatesuccess, as the guide already uses (eshop map: guide.ts:189-207). No patching of Vodafone's scripts. On each route:
- off the allowlist: close the album, remove chips and tags, and park the layer until an allowed route returns;
- on it: wait for vf-root to settle, re-run the adapter, fetch the page map again (index.js:40-45 fetches it once today), and update the Pocket's page through a new pocket.setPage (host/demos/pocket.js:35 captures it once).

Recognisers for vf-product-card, vf-bundle-card, vf-device-card and vf-offers-card, from the saved pages:
- keys from the picture name (/ecommerce/api/asset/content/<name>), the title, the digits, and the routerLink /prod/<slug> when there is one;
- re-match measured across languages as in ADR-0051.

Page turn: one quiet copy of vf-root (ADR-0052 §5).

The album comes first on allowed shop pages. Chips on shop cards wait for the owner, because the shop's own wishlist heart sits on each card.

The journey on the shop uses the guide's own sheet (OD-5, S10).

Tests, offline:
- the hand-written stand-in for the loader, ShopHost, route following, the allowlist and the guard;
- the owner's saved rendered pages for the recognisers;
- every fail-safe of ADR-0052 §6 re-run with vf-root.

The ADR amends ADR-0048 §1 and plan §3.5.

Risks: No shop markup is on disk. Recognisers and geometry depend on the owner's visit (E10).; Hiding vf-root during the page turn may trigger the app's own observers or Dynatrace errors. Measure on saved pages with no scripts, then smoke-test live.; Angular may overwrite history.state on boot, breaking the portal's Back reopen there (eshop map gap).; The shop's banner and widget geometry are unknown until the visit. The layer stays off the shop until then.

Evidence: loader.ts:89-101 (the layer on the web origin only, #main-content, once); host/index.js:40-45; host/demos/pocket.js:35. The eshop map's layer-pocket section: the shop's CSP allows inline styles, data: images and connections to the gateway; the app has its own clearLocalStorage(), and the storage keeper (loader.ts:52-66, 76) already runs on both origins; card classes come from compiled templates, not rendered DOM; there is a risk of writes inside vf-root reaching Angular and Dynatrace.

**8. The owner's live visit(s)**

V0, before any live step: the owner updates O29. The live site did not answer the demo browser on 10-11 Nov.

V1, 'facts and captures': one signed-out session in the demo browser, about 12 page loads, at most 1 per second, stopping at the first bot check. The banner is never answered and no commit control is pressed. It runs only after E2 (guard) and E3 (honest replay console) are in, because guide.js and the agent load on shop pages.

A scripted checklist records, with dates:
- robots.txt of both origins, verbatim (replacing the reconstructed text in tests/unit/robots.test.ts:21-39);
- the shop banner's selector and box, in EN and AR, at 1366 and 375;
- whether the accessibility widget is on the shop;
- vf-root render time, and whether networkidle arrives;
- the categoryUrls spelling left in the address bar;
- where /en/internetServices/dsl/bundles lands;
- card ids and attributes; virtual list or pagination;
- the menu API responses (MAIN_NAVBAR and FOOTER, both languages);
- whether #vgh survives Angular's first route from a web hand-off;
- whether IndexedDB survives a reload, and whether the shop clears localStorage;
- that the gateway's Pocket and observations routes answer from both origins.

The visit also saves the rendered DOM, scripts stripped, of about 8 public pages: home, the smartphones list EN and AR, the tablets list, one product page, the DSL landing, the at-home landing and flex plans. The capture tool must not remove the banner or the widget from the owner's tab: extract-entry.ts:8 does today (eshop map safeguard 13).

V2, syncs, on another off-peak day: the held web-only sync (runbook §5.1), reviewed and activated, then the experience profile rebuilt; then the shop dry run, its report read, activation, and a refresh of the committed manifest.

V3, the demo smoke, combined with S17: web to shop hand-off; a price question answered on a live shop list; the agent's pointer at a real Add to cart with no click; a sticker kept on web shown on the shop; an observation applied with the demo browser's key; the Pocket on one shop page once E17 and E18 are in.

Risks: One bot check ends the visit. The checklist is ordered by value: robots.txt, banner, menu and smartphones list first.; Captured shop pages contain prices and stock. Whether they may be committed as a replay fixture, like web's, is an owner question.; The visit could slide if O29 stays open. All offline steps before it still deliver demo value.

Evidence: No eshop HTML exists on disk (no-store, eshop map §1). The 12 Nov cache cannot prove or disprove O29. The audit recorded the widget as absent on the shop on 2026-10-23, with nothing newer. ADR-0048 'Not verified' records the 10 Nov non-answer.

**9. How this interleaves with phase 3's remaining steps S6-S17**

Before S6: E1 (stand-in pages), E2 (guard), E3 (replay message, ADR references, budget check), E4 (prices), E5 (records know their site). E5 must come before S6, so chips write v3 records from the first.

S6 (chips, ADR-0052 part 2) as planned.

Then E6 (gateway store and Pocket id), before S7, so S7's checks run once on the backend the demo will use. S7 adds checks across origins: a sticker kept on web shows in a shop-origin tab once the layer is there; until then, its record is checked through the store on the shop origin.

E7 (shop label in the album) goes with S7. S13 (portal) adopts the shop rule: preview only, never into cart, checkout or numbers.

S11 (the Pocket button under the owner's accessibility-button exception) is the album's visible entry on live pages. It comes right after S7 for demo value, ahead of S8-S10 and S12. Its ADR takes the next free number when written: not 0053, now taken.

S8, S9, S14 and S15 (trail) are independent and run in parallel. S10 (journey hosted, OD-5 fallback) must be in before Reading 2, because the shop uses the guide's sheet.

E8 to E10 (capture tool, O29, V1) happen as soon as E2 and E3 are in, in parallel with S6 and S7.

E11 (background update) after E4. E12 to E15 (seeds, crawler safeguards, extractor and builder, router and evaluation cases) offline after V1. E16 (V2 syncs).

E17 and E18 (Reading 2) after V1's captures and S10.

S12 (actors) and S13 (portal) as planned. S16 gains one shop cell in its matrix after E17. S17 is merged with E19 (V3).

Risks: E6 before S7 adds a high-risk change in the middle of phase 3. If it slips, S7 can pass on the IndexedDB backend and be re-run on E6.; Several sessions are editing the same files (record.js, store.js, demo-browser.ts, guide.ts). Land E-steps in small commits after the in-flight fixes are committed.

Evidence: The phase 3 map's dependencies: S6 on S3, S5 and OD-1; S7 on S4-S6; S10 on S8, S9, S5 and OD-5; S11 on S1 and S5; S13 on S5, S7, OD-3 and OD-4; S16 on S10-S13; S17 on S10, S11 and S13 (live-way2-phase3-map-2026-11-13.md:218-301). S0, S1, S3, S4 and S5 are done (HEAD b940f58, plus fixes in progress in record.js and store.js).

Steps:

- E1 Stand-in shop pages for offline tests (hand-written, served under the real eshop URLs): A fixture folder with hand-written pages served by offline replay under https://eshop.vodafone.com.eg:
- /en/ and /ar/ home;
- list?categoryUrls=*smart-phones and =/smart-phones;
- a product page with Color and Storage selectors and Add to cart / Buy now (ids sl-add-to-cart-button and sl-button-buy-now);
- icon-only button.cart with img alt 'cart';
- 20 cart buttons outside forms;
- a vf-root filled by an inline script after a delay;
- a click-only menu;
- a /en/cart page for the allowlist tests.
Plus a copy of the saved bundles page with one price changed, for E11. No Vodafone JavaScript or copy reused. Checks: Self-checking: offline replay serves every page with 0 requests leaving (onNetwork log); the pages render in both languages; aixc-delivery's 'no layer on the shop' test is still green. Owner: none
- E2 The built-in commit guard and the guiding pointer (agent stays on on the shop): Site config guard: {selectors, words en/ar, alt}, schema in config.ts beside agent (:260-262).

Gateway: guard.selectors appended to page.commitTargets in POST /v1/session (server.ts:131-153).

Planner: never a click on commit words; confirm instead.

agent.ts:
- isCommit(el) over all matches, words, aria-label, title, value, alt and ancestors;
- the click tool refuses and guides (:81-94);
- a new show_commit_control tool: pointAt plus a commit spotlight, the spoken line, then done;
- the blacklist covers every match (:46);
- the prompt line (:56) tells the truth.

GuideAgentContext gains ui. confirm (executor.ts:175-183) gains pointAt.

A new phrase, 'Press {control} yourself when you are ready', in both languages. Checks: On the E1 stand-in, in EN and AR, with the stand-in model scripted to click every commit control: 0 click events on any commit control; the pointer ends within 2 px of the control's centre; .spot.commit is shown; the guidance line is spoken; the task ends. isCommit unit tests in both languages (icon-only alt, sl-* ids, a submit button in a form), failing first on today's agent.ts. A web bundles subscribe flow stops at confirm with the pointer. sdk-size: guide.js bytes measured before and after, net ≤ 0 (pay with a removal in the same commit). typecheck, npm test and test:e2e green. Owner: Confirm the word list, and that commit controls stay hidden from clicks with the new 'show the person' tool (recommended), rather than shown to the model as marked.
- E3 Honest replay console, runbook, ADR references and the guide.js budget: tools/demo-live.ts:6 and :109 drop '(offline)' and say that pages not saved, every eshop link included, open live (owner decision 6: the live fallback stays). Fix runbook §2.2 (:84-90).

Re-point the phase 3 map's and ADR-0052 §8's 'ADR-0053' for the accessibility-button lift and 'ADR-0054' for the portal: those numbers now belong to the public gateway and the Claude agent. Their ADRs take the next free number when written.

Measure guide.js as CI does. If it is over 20,480 B, raise it with the public-demo session before any E-step adds bytes. Checks: The console text in a unit or snapshot test. The runbook is reviewed. sdk-size.test.ts run on its own, after the in-progress run finishes: the number recorded, with date and conditions. Owner: Confirm that the next free ADR number is 0057, and that the S11 and S13 reservations move.
- E4 Prices and stock are guide points, never answers (value-free speech; 'around N'): packages/kb: withoutValues(text, lang), and guidePoints(d) derived in kb-index from labels and target text.

understand.ts: near, under and over price selects next to SELECTORS (:109).

planner.ts: rank by guide point, then pickItem by key plus a live itemRead. withoutValues on every path that speaks, captions, offers or hints knowledge text: :52, 63-70, 79, 141, 150-154, 167, 175-176, 182, 196-197.

knowledge handlers: value-free display titles for page-map and experience.

The agent prompt line on prices.

AGENTS.md 4.3 rewritten as in design 1. SPEC-03 and the ADR-0011 §3 note updated. Checks: A new unit test runs every case of tests/fixtures/vodafone-utterances.yaml through buildPlan on the committed manifest and asserts no money or stock pattern in any say, caption, ask option, watch label or agent hint. Expected to fail before the change (to be confirmed by running it first). New router cases in both languages ('bundle around 40 pounds', 'باقة بحوالي 50 جنيه', 'cheapest', 'the most data'), with eval:router before and after. e2e on the saved bundles pages: the spoken price equals the live card's text. Owner: Approve the AGENTS.md 4.3 wording.
- E5 Records know their site; shop keys stable across origins: record.js: source.site ('web'|'shop'; missing reads as web); a page key per site that keeps categoryUrls on shop lists (:21); isRecord accepts v2 and v3.

live-adapter.js:137-138: link keys always include the host.

Shop calls to action kept absolute.

The ADR is written Proposed, covering the record now and the store in E6. Checks: pocket-record unit tests: '/' on both sites is two pages; two category lists are two pages; a v2 record reads as web; the same shop link gives the same key read on web and on the shop. live-adapter.test.ts's re-match numbers (ADR-0051) unchanged on the saved pages. Owner: none
- S6 Phase 3: 'Pocket it' chips on live pages: As planned (ADR-0052 part 2, OD-1: always visible, out of the tab order). The chips write v3 records. Checks: As in the phase 3 map. In addition: pocketing a card whose call to action goes to the shop gives source.site 'web' and an absolute shop link. Owner: none (OD-1 answered)
- E6 The Pocket's store on our gateway, and a Pocket id held by the carrier: Gateway /v1/pocket routes, with the strict schema, server-side refusals (URLs, transactional paths, personal-data patterns), caps and rate limits. A Postgres table with the id stored as an HMAC; the memory store; retention 30 days; no traces.

openGatewayPocketStore with the IndexedDB cache, merge and one-time upload; re-pull on visibilitychange, focus and pageshow.

LoaderOptions.pocket, set as data-aixc-pocket.

Demo browser: the id file in the profile. Extension: chrome.storage.local through an isolated-world script.

Optional link-code fallback.

AGENTS 4.3's owner note covers the gateway store. Checks: Integration tests (real Postgres and the memory store): put, list, remove and clear; a refused record (phone number, cart path, foreign URL); caps; nothing in trace_events. Browser test with two contexts on the web and shop origins (offline replay, E1 shop page) sharing one id: a sticker kept on web is in the shop-origin store within one focus. Gateway down: the album still shows the cached stickers, marked 'this site only', with no page error. All of pocket-store.test.ts re-run on the new backend. Owner: Confirm the id may sit in a data attribute page scripts can read; retention 30 days; Postgres for the public gateway or accept forgetting.
- S7+E7 Phase 3 S7: one Pocket across pages, plus the shop label and the album's shop rules: S7 as planned. The album groups by source page and site. 'In the shop' / 'في المتجر' on shop calls to action. Shop links open natively.

Note for S13: shop destinations get a preview only, never into cart, checkout or numbers. Write down that OD-4's cache plan cannot work on the shop (no-store). Checks: S7's checks, plus: on the saved web pages, a sticker with a shop 'Buy now' shows the label in EN and AR. The same sticker shows in a second tab's store on the shop origin. The replay console says such a link opens live. Owner: none
- S11 Phase 3: accessibility-button lift exception (the album's visible entry): As planned. Its ADR takes the next free number when written, not 0053. Checks: As in the phase 3 map. Owner: none (exception granted)
- E8 Tools for the live visit: capture, robots and fact checklist (built offline): A capture command for the demo browser. It saves the rendered DOM after vf-root settles, with scripts stripped, robots.txt verbatim, the menu API JSON, the banner and widget boxes, timings, the address-bar URL, whether #vgh survived, and whether storage survived a reload. It never removes the banner or widget from the tab (extract-entry.ts:8 does today), never clicks, keeps at most 1 page per second, and stops at a bot sign. It refuses paths on the never-list. Checks: Run against the E1 stand-in in offline replay: files written; 0 clicks; banner and widget stand-ins untouched (outerHTML equal before and after); a /en/cart target refused. Owner: none
- E9 Owner updates O29 (live): The owner's own update so live pages answer the demo browser. Checks: One web page loads live in the demo browser. Owner: Yes: the update itself.
- E10 Owner's live visit 1: shop facts and captures (signed out, about 12 page loads) (live): Runs E8's checklist (design 8). Updates the audit with dates, replaces the reconstructed robots text, and saves the menu JSON and about 8 rendered pages to a git-ignored folder (committed only if the owner allows). Checks: The results replace tests/unit/robots.test.ts's reconstruction; the guard selectors (E2) are re-checked on the saved pages; the stand-ins' geometry is updated. Owner: Yes: run it, choose the day, and decide whether captured shop pages (with prices) may be committed as a replay fixture.
- E11 Guide points kept fresh from the visitor's page (observations): Planner: read.observe on money, data and stock fields of public pages.

executor.ts:157: no read text in the trace detail. Values go through a gate to a new observe.js chunk: mask, shape check, POST.

Gateway /v1/observations, binding the report to the session's plan step; the rule (observer key added by the demo browser's forwarder, or two clients in 24 hours), caps and ratio.

A guide_points overlay used by the KbIndex; the kb-diff report lists observed points. Checks: In offline replay of E1's changed-price bundles page: one observation from the demo browser applies, and the next 'around N' finds that card. Without the key, one report stays pending and two from distinct client hashes apply. A report for a destination not in the session's plan is refused; a phone-like value never leaves the browser; trace_events hold no read value. Each test fails first. sdk-size: the gate within budget, with guide.js net ≤ 0. Owner: Confirm the rule (key or two clients); whether public-extension reports count at all; whether stock is observed.
- E12 Whole-menu seeds from the shop's own menu data: A read-only tool decodes the cached MAIN_NAVBAR (and FOOTER if wanted), or E10's saved copy, into a committed seed file of URLs only, in both languages, plus the eshop links from the saved web pages. The scope keeps the menu minus the transactional list. A per-origin page cap. Checks: Unit: the seed file lists 28 menu pages per language (the 24 categories, /list, flex plans, at-home, dsl), without /lines/red/numbers; every seed passes scope and the saved robots.txt; the measured shop URLs are added to crawler-url.test.ts. Owner: Is FOOTER part of 'the menu'? Are dsl-checkout, subscription-details and lines/*/numbers and review transactional (recommended yes)?
- E13 Crawler safeguards for the shop: robots.txt fails closed, is fetched with the user agent and saved verbatim. Pacing per origin, 1 page at a time on the shop. Back-off on 429 and 503 with Retry-After; pages with status 400 or above dropped; wider bot-check detection. A vf-root settle wait with a cap. Scripts by full-URL rule. A never-click test. A Keycloak redirect is out of scope. The user agent keeps its name. Checks: Request timestamps on the demo-telco fixture with a third origin: at most 1 navigation per second per origin. A stubbed 503 robots.txt gives 0 pages. A challenge title stops the run. The ingest e2e stays green. Owner: May a contact comment be appended to the user agent while keeping the name (SPEC-04 §4)?
- E14 Extractor, builder and sync for the shop: Item names from title classes; the price as a guide point, not in the name. Commit points outside forms (guard words, alt, sl-* ids). Transactional pages marked by kind. Stable keepQuery ids (shop.list.smart-phones) and the stacked-suffix fix. categoryUrls normalisation in url.ts and kb-index. Carry-over of other origins in an --origin shop run. Checks: Synthetic crawls and the fixture site: names have no prices; Add to cart and Buy now become commit destinations; ids are stable when a category is added; both spellings match one page; an --origin shop run keeps the web destinations with 0 churn. Owner: Strip prices from new ids (fewer renames on price changes), or keep them as today?
- E15 Router, flows and evaluation cases for the shop (fixture manifest): Shop labels and priorities, so DSL and home-internet requests keep resolving to web. A shop 'buy' flow that shows and stops at confirm, with E2's pointer. Held-out cases for moments 5-6 and price questions on lists. Checks: eval:router on the fixture manifest: shop cases pass, and the web cases' accuracy does not drop. Owner: none
- E16 Owner's live syncs: held web-only first, then the shop (live): Runbook §5.1: the web-only dry run, review (about 68% churn expected), activation, and an experience profile rebuild. Then the shop dry run; its report read (robots result, blocks, commit points found, guide points, evaluation); activation; refresh of the committed manifest and evaluation ids. Checks: The reports themselves; eval:router on the new manifest; E4's value-free scan on the new manifest. Owner: Yes: runs both, off-peak, with his go on the day.
- E17 The layer on shop pages: loader rules per origin, ShopHost, route following: loader.ts: experiences per origin (shop needs vf-root), with the allowlist. ShopHost with regions outside vf-root; protected nodes from E10. Navigation API route following: allowlist re-check, park or resume, page map fetched again, pocket.setPage. Checks: Offline: on E1's stand-in, the layer never appears on /en/cart, including after a client-side route into it from an allowed page. On E10's saved pages: regions beside vf-root, header and banner untouched, the guard's stop leaves the page as without the layer. The aixc-delivery test is updated deliberately. Owner: Confirm the allowlist.
- E18 The Pocket on shop pages: recognisers, album, chips if approved: Recognisers for vf-product-card, vf-bundle-card and the other cards. Keys from the picture name, title, digits and /prod/ slug. The album on allowed shop pages. Chips only if the owner approves. Checks: On E10's saved pages in both languages: the cards are read; re-match measured across languages as in ADR-0051; a sticker kept on the shop shows on web through the E6 store; ADR-0052 §6's failure checks with vf-root. Owner: Chips on shop cards beside the shop's wishlist heart, or the album only? May a shop sticker keep a dated price, and stock?
- E19 Owner's live smoke, merged with S17 (live): S17 as planned, plus: web to shop hand-off with #vgh; a price question answered on a live shop list; the agent's pointer at a real Add to cart with no click; a sticker kept on web seen on the shop; one observation applied with the demo browser's key; the Pocket on one shop page. Checks: tests/live (VG_LIVE=1): no [AIXC] errors; banner and widget untouched; 0 commit presses; at most 1 page per second; stop at a bot check. Owner: Yes: runs it.

Open questions:

- ADR numbering: ADR-0053 to ADR-0056 already exist (public gateway, Claude agent, Whisper, extension; README rows 58-61). Is the next free number 0057, with the phase 3 map's S11 and S13 references and ADR-0052 §8's 'ADR-0053' moved to whatever number is free when they are written?
- guide.js: the minified build on disk is 21,199 B gzipped against the 20,480 B budget, probably from the uncommitted public-demo changes. Is the budget kept? If so, should the public-demo session make room before any e-shop step touches guide.js?
- Who may update guide points? Recommended: (a) the demo browser, whose forwarder adds a secret the page never sees, or (b) two matching reports from different clients within 24 hours. Should reports from public-extension visitors count at all, given the site key is public (ADR-0056 §3)? Should stock be updated by visitors, or only prices?
- The AGENTS.md 4.3 wording: 'Prices and stock may be kept in the knowledge base as guide points (owner, 2026-11-13); the guide never says or shows them from the knowledge base; balances and personal data never.' Should the owner note also cover the Pocket's gateway store?
- Transactional steps under menu pages: do dsl-checkout, subscription-details, at-home-subscription-details, lines/*/numbers (including the menu's own /lines/red/numbers) and lines/*/review stay out, as recommended?
- 'The whole menu': the main navigation bar only (29 entries, 28 pages kept), or the footer menu too (also cached)?
- The Pocket id: may it be held by the carrier (demo profile, extension storage) and handed to the page in a data attribute that Vodafone's scripts could read (it unlocks only public stickers)? Is 30 days from last use the right retention? Should the public Fly gateway use Postgres so the Pocket survives restarts?
- On shop cards: 'Pocket it' chips next to the shop's own wishlist heart, or the album only on the shop at first? May a sticker kept on a shop page hold a dated price, and stock?
- The crawler keeps 'VodafoneEG-VoiceGuide-Crawler/0.1'. May a contact comment be appended to the string while keeping the name, as SPEC-04 §4 asks?
- Ids built from prices (for example web.mobile-internet-bundles.plus--37---600egp): strip prices from ids at the next sync (one-time renames of the overlay, the evaluation sets and the experience profile), or keep them, and accept renames on every price change?
- The agent and commit controls: keep them hidden from its clicks and add a 'show the person' tool (recommended), or let the model see them marked as commit controls?
- Live visit 1: which day, after O29? May its rendered shop pages (signed out, scripts stripped, prices as published) be committed as a replay fixture, as the web pages are?

### Architecture first. Fix four boundaries before any code moves, so later steps do

- One source of truth per kind of fact. Where things are lives in immutable, gated knowledge-base versions. Prices and stock are dated guide points, used only to find places. What the guide says comes only from the live page. Pocket stickers are the visitor's dated copies of public copy.
- Safety sits below the model. A commit point is refused in code at every layer: the router's planner, guide.js's CommitGuard (selectors merged on the server), and the agent chunk (a live classifier plus a capture-phase guard for synthetic events). It is never enforced by a prompt alone. Commit knowledge is data (site config and knowledge base); the classifier is one shared module.
- guide.js gains no new features. New guide behaviour comes as chunks that the session names, or chunks loaded by other chunks, reached through window.voiceGuide (guide.ts:163). dist/guide.js on disk measures 20,710 B at gzip -9, over the 20,480 B budget (to be re-measured after the running suite).
- Carrier-neutral: the demo browser, the public extension and Mode A behave the same. Differences are loader options (gateway, bridge) or server-side additions the page never sees (an observer header added by the demo browser's Node forwarder in live mode only).
- Identities stay minimal and separate. The Pocket id is not the guide session id, never enters Vodafone's page world (it lives in the gateway-origin bridge), is stored hashed, expires after a period of no use, and is never joined with traces.
- On a single-page app a route counts as a page. The layer splits document scope from route scope and re-checks its allowlist on every route. The guide's ADR-0030 history wrapper stays the only one. Angular owns <vf-root>'s subtree: we write outside it and inside it only add data-aixc-* attributes.
- Contracts are frozen before backends change. Record v3 (aware of which origin a sticker came from) lands with S7, before the server store. One store contract test suite runs against every backend.
- Visitor reports are evidence, not truth. A report is accepted only by a rule (a trusted observer, or two matching reports from different visitors), written to an append-only ledger over immutable versions, and can be reverted. Replay never reports.
- Respect Vodafone's site. No feature makes an extra request to Vodafone except the owner-run crawl and the owner's visits. robots.txt is honoured on both origins and the crawl stops when robots.txt can't be read. At most 1 page load per second per origin. Stop on any bot check. Nothing covers, hides or restyles the accessibility widget or the cookie banner.
- Offline first. Every step has an offline check, using hand-written pages served under the real origins in offline replay (demo-browser.ts:297-301, 373, 381-386). Live steps are few, owner-run, and each has a written checklist.

**1. Price questions answered without quoting knowledge-base values**

Knowledge standard (packages/kb manifest.ts): a new typed field `points` on item and collection destinations, [{kind: 'price'|'stock', value (a number, or in|low|out), currency/period, observedAt, source: 'crawl'|'observer'|'visitors', basis kbVersionId}]. The builder splits every string the guide may speak or show (labels, page titles, descriptions, visual descriptions, flow labels, page-map titles): money and stock fragments move into `points`, the rest stays speakable. Ids are never built from money text. A new integrity rule refuses a manifest that has a money or stock pattern in a speakable field; today's 294 strings become points. Router: a numeric price target becomes u.select {field: 'price', by: 'near'|'below'|'above', value}. English 'around/about/under/over/for X pounds', Arabic 'حوالي/في حدود/أقل من/تحت/بـ X جنيه', Eastern or Western digits. Candidates are scored by text match plus distance to each item's price point (the tolerance is a pilot knob), across pages and origins. Today's origin priorities still apply: DSL and home-internet requests stay on web unless 'shop' or 'buy' is said. Planner: navigate (hand-off when the origin changes), reveal, pickItem by the point's item key, then spotlight with a read step. The number spoken is read from the live DOM by the executor; the {price} templates in phrases.ts already take it from the page. No plan text (say, caption, question, options, confirm message, agent hints) carries a point value; repeating the person's own number is allowed. Follow-ups ('the cheaper one?', 'is it in stock?') read the current live page, so the live page is the source for every later answer. If the item is no longer on the live page, the guide says 'I can't see it on the page now' and spotlights the list; it never falls back to the stored value. Three checks back each other up: the build-time scan, a planner test over both evaluation sets (no point value in any plan text), and a last router pass that removes any money substring not in the utterance and counts it in the trace (a count only).

Risks: Taking money out of labels can lower router accuracy for 'the 46 pound bundle' unless points are in the search index. Measure with eval:router on a transformed copy of the committed manifest before any sync (gap 6).; target.text is also the text fallback for locating elements. Removing price fragments loosens that match; it already breaks when a price changes.; The money pattern must require a currency token, or plan names such as 'Flex 45' are stripped by mistake.; Re-deriving ids without prices renames web ids. The overlay (3 entries), both evaluation sets and the experience profile must change in the same commit.

Evidence: Spoken text comes from labels and descriptions: services/router/planner.ts:52-55 (clarify options use labels), :68 (agent hints `${c.label} (${url})`), :175 (a collection says its label), the visual case (says the description). Live values come from the page: services/router/phrases.ts:14-19 ({price} filled by the executor's read). lexicon.ts:37-39 has only min/max price, no 'around X'. Values already stored: 294 money strings in config/kb/vodafone-eg.manifest.json, of which about 265 are visible text and 30 are ids, selectors and collection ids such as web.mobile-internet-bundles.plus--37---600egp (eshop map :31, :73). The describer asks for prices (jobs/describer/describe.ts:114). The invariant this keeps: SPEC-04 §1 ('can never quote a wrong price'). Text that must change: SPEC-03 §4.3 ('values are read, never stored'), AGENTS.md 4.3, ADR-0011 §3.

**2. Background update from the visitor's page, versioned and audited, with a rule against bad reports**

Boundary: structure stays in immutable versions behind the sync gate. Values live in a points ledger layered over the active version, so a price change never creates a knowledge-base version. A new version per change would orphan the experience profile (tied to kb_version_id), push real versions out of the 10 kept, and churn plan metadata. Schema v4 has three tables. kb_point_reports: raw reports with salted daily hashes of session id and client IP, deleted after 48 h. kb_points: the current overlay (site, destination id, field, value, unit, observedAt, source, basis version, event id). kb_point_events: an append-only audit (old value, new value, the rule that accepted it, how many reports, time, reverted by). Read path: the knowledge service serves the active version with the overlay applied. Plan metadata and traces record kbVersion@p<rev>; the page map and the profile keep the base id. Plans contain no values, so an overlay revision can never make a running plan inconsistent. Write path: the observe chunk is named by the session only on pages that have points and where observation is on, and never in replay. After the page settles it reads only the knowledge base's typed point fields, with the knowledge base's own locators, so no extra request goes to Vodafone. It normalises and masks the values (agent-mask), compares them with session.page.points, and POSTs only the differences to /v1/points/observe (site key and origin checked, at most 4 KB, rate limited). The gateway works out the page from the URL itself (kb.pageFor; it never trusts a client pageId). It refuses private page kinds, commit destinations, fields that are not points, unknown destinations, and a stale version (409), as /v1/experience/contributions already does. Rule against bad reports: a report is accepted at once when it carries the trusted observer header. Only the demo browser's Node forwarder adds that header, in live mode; the token never reaches the page and replay never adds it. Otherwise a value needs at least 2 matching reports from different session and IP hashes within 24 h, with no report that contradicts them. A change of unit or currency, a price ratio outside 0.5-2x, a stock state that keeps flipping, or a dispute is held for review. The public site key is never trusted for this (ADR-0056 §3). Control: `npm run kb -- --site vodafone-eg --points [--held] [--accept <id>] [--revert <event>] [--freeze]`, a pilot knob points.overlay: on | frozen | off, and overlay activity listed in the sync report. Reconciliation: when a new structural version activates, overlay rows older than its crawl are retired (the crawl is fresher). Newer rows carry over if the destination still exists; otherwise they are marked orphaned. kb-diff and the churn gate ignore points. Traces hold counts only.

Risks: A signed-in visitor on the shop may see personalised prices. The two-visitor rule reduces this but does not remove it. Public reports should stay off until the owner decides.; Vodafone A/B tests or region pricing could make values oscillate. The disputed state holds them, but someone must review it.; A stale value from replay or a fixture could slip in if the observer header leaks into a replay run. A unit test on the demo browser must prove it cannot.; Overlay rows are keyed by destination id. Ids built from prices or unstable shop ids orphan rows until E8's stable ids land.; Salted hashes of session id and IP are short-lived personal data. The 48 h deletion must be tested.; The public gateway's memory store loses the ledger on restart. That fails safe: crawl values come back.

Evidence: Versions are immutable with one active pointer (services/shared/store/schema.sql:9-22). Experience profiles are tied to one kb_version_id (schema.sql:116-120; config/experience/vodafone-eg.profile.json kbVersionId). Precedent for a visitor-report endpoint: services/gateway/server.ts:273-297 (/v1/experience/contributions: active-version check returning 409, private pages refused, counts only, no trace payload). The gate: SPEC-04 §5 step 6; churn counted in jobs/sync-lib.ts:108-119. The Node-side forwarder that can add a header the page never sees: tools/demo-browser.ts:218-220. Replay serves 23 Oct pages with old prices (runbook.md:90). The public site key is public (ADR-0056 §3). Values in traces today: executor.ts:154-157 and server.ts:203-205 (eshop map D14).

**3. The agent's built-in commit guard and the guiding pointer**

Commit knowledge is data, it is enforced in code at every layer, and none of it adds bytes to guide.js. (a) One classifier. packages/kb/src/commit.ts holds the rules as data. Words in English and Arabic, after Arabic normalisation: add to cart, buy now, checkout, reserve, subscribe, choose/pick a number, pay, confirm, place order, recharge, transfer, اشتري/اشتر الآن, أضف للسلة/للعربة, احجز, اشترك, اختار رقمك, ادفع, تأكيد, اطلب. Icon tokens in alt, aria-label or title: 'cart', 'السلة', and the Material icon names add_shopping_cart and shopping_cart. Ids: sl-add-to-cart-button, sl-button-buy-now. Classes: button.cart, card-bundle-action-select-btn, device-select-btn. Commit pages: cart, checkout/*, lines/*/numbers, lines/*/review, dsl-checkout, *subscription-details, payment. A pure classify(descriptor) is shared by the SDK chunks and the crawler. The site config gets a `commit:` block per origin key for additions. (b) Server. pageContext merges the origin's built-in selectors into commitTargets and marks commitPage. A ':root' placeholder selector makes guide.js's existing CommitGuard refuse every click on a commit page, with no new bytes. The planner refuses click steps whose target text matches commit words. (c) Agent (agent.js, its own chunk). The 4-match hiding goes. Every click_element_by_index and select_dropdown_option target is classified live: the element, its closest button, a or [role=button], and the alt and aria text of its children. A commit target is refused. On a commit page the agent acts on nothing. For the length of a run, a capture-phase listener on window stops untrusted click and submit events on classified elements: page-agent's controller and el.click() produce isTrusted=false events, while the person's own click passes. execute_javascript stays off (page-agent removes it unless experimentalScriptExecutionTool is set). The prompt tells the truth. (d) At a commit control the agent does not just stop. A custom tool guide_person_to(index), also triggered by any refused click, loads pointer.js and ends the task with one short sentence. (e) pointer.js (window.__vgPointer, its own budget of about 3 KB gzipped) draws inside the guide's open shadow root through window.voiceGuide. It scrolls the control into view and moves the guide's pointer from the microphone to it along a short eased path, with no tap animation, which would look like the guide pressing. It rings the control with the commit highlight and a slow pulse, and captions it with the control's own label ('Press "Add to cart" yourself when you're ready', and the Arabic). It says this once. It follows scroll, resize and Angular re-renders (finding the control again by its descriptor). It ends on the person's own click on the control, Esc, the microphone, a route change, the control disappearing, or 30 s. With reduced motion there is no travel, only the highlight. It keeps clear of #vodafone-aw-icon, the cookie banner and TOBi (one shared obstacle list) and uses Vodafone's palette; ui.ts:80's amber #d97706 must be checked against SPEC-01. (f) The same pointer serves every later commit point. The executor's confirm step (knowledge-base commit destinations, 0 today) uses it once E3 frees bytes; until then confirm keeps today's commit spotlight.

Risks: False positives on generic words ('Select', 'Compare', 'Details') could block demo moment 6 (sort by price). The classifier needs near-miss tests and must take context into account (a card's select button versus a sort control).; Angular can replace the control while the pointer guides. Finding it again by descriptor can fail; the guidance then ends with a line, never silently.; The capture guard could block Vodafone's own synthetic clicks on commit elements during an agent run. It is limited to classified elements and to the run.; After a refusal the model may loop. The task must end in done; the step limit stays.; The pointer could cover the cookie banner or the accessibility button. The obstacle list and the floating-control matrix must include the shop.

Evidence: packages/sdk/src/agent.ts:45-46 (blacklist = the first 4 matches of each knowledge-base commit selector), :54-61 (the prompt says purchase buttons are hidden, which is false), :81-93 (the click tool calls clickElement with no guard). page-agent's tools: node_modules/@page-agent/core/dist/esm/page-agent-core.js:281-350 (click, input_text, select_dropdown_option, scroll, execute_javascript), :463 (execute_javascript removed unless the experimental flag). Executor: executor.ts:165 (click refused only by CommitGuard), :175-182 (confirm = spotlight with commit). dom.ts:112-132 (CommitGuard = knowledge-base selectors plus the payment-form submit). services/knowledge/handlers.ts:35 (commitTargets only from the knowledge base; 0 commit destinations today). jobs/crawler/extract.ts:16, :316-324 (commit only for a submit button inside a form). SPEC-03 §4.1 says the agent's blacklist covers the commit words; the code does not. Seams: guide.ts:163 (window.voiceGuide = this), ui.ts:111 (open shadow root), :311 (spotlight with commit), :375 (pointAt), :80 (.spot.commit #d97706). Exposure: extension/dist/chrome/loader.js gateway https://vg-public-demo.fly.dev, built 2026-11-13 14:45; ADR-0054 (Claude as the public agent).

**4. The e-shop crawl of the whole menu, with its safeguards**

Crawler: the Playwright crawler (npm run sync) only, never the in-browser crawler (frame-ancestors on the shop, same-origin only). Seeds come from a new `seedsFrom` list in the site config. (1) `menu`: the shop's own menu data. During the crawl's first shop page load the crawler keeps the page's own menu-hierarchy response, so no extra request is made; only if the page did not request it is there one paced fetch at crawl start, honouring robots. The response is saved verbatim in the crawl folder beside robots.txt. Mapping (pure, tested on a hand-written fixture of the same shape): CATEGORY becomes /{lang}/list?categoryUrls=<url>, LINK becomes /{lang}<url>, PAGE becomes /{lang}<url>, in both languages. (2) `links`: the e-shop links found on web pages (28 distinct on the saved pages). Shop seeds are depth 0: the menu is the scope. Product cards link to '#', so products are items of the lists, not pages. Scope: include shop /(en|ar)/. Exclude at any depth, ignoring case: cart, checkout, wishlist, register, account, profile, order-status, order-details, payment, saved-payments, vouchers, returns, lines/*/numbers, lines/*/review, dsl-checkout, *subscription-details, documents, reservation, error. robots.txt on both origins is fetched with the crawler's user agent, saved verbatim, and the crawl stops for that origin when it can't be read; a unit test checks that every Disallow line has an exclude. Fitness: at most 1 navigation per second per origin, 1 page in flight on the shop (2 on web). Back off on 429 or 503 and honour Retry-After. Pages with status 400 or above are not kept. Stop at the first sign of a bot check on the shop (title, challenge frame or script, 403 or 429), with no retry and no user-agent change. Wait for vf-root to have children and 300 ms without changes (the settleApp logic) instead of networkidle plus 150 ms. Scripts are chosen by a full-URL rule: on for the shop and /spa/, off for CMS pages, which settles gap 2. A shop page cap of about 30 menu pages in each language. A test that the crawler never clicks. Building: categoryUrls spellings normalised ('*x', '/x' and '%2Fx' become one key; the live spelling kept as the variant URL). Stable ids for pages kept by query (shop.list.smart-phones) and no stacked suffixes. Card names from title classes before the card's text. Commit points outside forms through the shared classifier. Page kinds (listing, checkout) from patterns. Sync: a run limited to one origin carries the other origins over, so --origin shop keeps web with churn 0. The user agent stays 'VodafoneEG-VoiceGuide-Crawler/0.1' (decision 7). Runs are owner-run, on demand and off-peak: the web-only held sync first, then the shop in a separate dry run.

Risks: networkidle may never arrive on the shop (Dynatrace, Tealium in 47 chunks, mqtt.min.js). The vf-root settle wait must have a hard cap.; Bot management on the shop is unknown and O29 is open. A block could also hit the owner's demo browser on both origins.; The menu API is not covered by robots.txt and has no explicit permission. Keeping the page's own response avoids a separate request, but reading it is still the owner's call.; Virtual or infinite lists may render only part of a category's products. The list stays one destination; item coverage is reported, not assumed.; Turning scripts off or on for CMS pages changes the first web sync's churn beyond the runbook's 68% estimate.

Evidence: Menu facts on disk: the cached MAIN_NAVBAR menu-hierarchy (12 Nov) has PAGE /list, 24 CATEGORY entries and LINKs /lines/flex/plans, /lines/red/numbers, /internetServices/at-home, /internetServices/dsl. Menus open by click handler (onOpenCategory). vf-product-card's root is <a href='#'> (eshop map :258-259). jobs/crawler/crawl.ts:47-51 (`!r ||`: allows everything when robots.txt is missing), :94-96 (a pause per worker, networkidle plus 150 ms), :97-104 (blocks = 403, 429 or a challenge title only), :186-191 (robots fetched without the user agent; localhost skipped). jobs/sync-lib.ts:71-79 (limitOrigins drops the other origins and their seeds; no carry-over). config/sites/vodafone-eg.yaml: shop excludes only at the root, maxPages 220 shared by both origins, keepQuery [categoryUrls], scriptsFor '^/spa/', userAgent with no contact. build.ts:227-228 (stacked id suffixes). url.ts:13-25 and kb-index.ts:29-44 (the two spellings never match). SPEC-04 §4 (pacing, robots, stop rule). ADR-0032:53 (use the Playwright crawler for the shop).

**5. The server-side Pocket store and identity across the two origins**

Three identities are kept apart. The guide's conversation (ADR-0016: a tab-scoped session id, crossing origins through #vgh only on guide-driven hand-offs) stays as it is. The Pocket gets its own long-lived pocket id. Nothing joins them: traces carry session ids, never pocket ids. The pocket id lives in a bridge frame on our gateway's origin, never in Vodafone's page world. Browsers treat both origins as one site (vodafone.com.eg), so a gateway-origin iframe embedded in either one gets the same partitioned IndexedDB and BroadcastChannel in Chrome; Firefox's and Safari's partitioning should give the same result. This is measured offline first (E6a). Rejected options: a cookie on .vodafone.com.eg (it would be sent to Vodafone's servers with every request); the guide session (tab-scoped, crosses origins only on guide-driven navigation); a token in the fragment of Vodafone's own links (changes their links, and Angular may drop it). The pieces: (1) GET /sdk/aixc/bridge.html plus bridge.js, served by the gateway with the CSP default-src 'none'; script-src 'self'; connect-src 'self'; frame-ancestors <site origins>. (2) The bridge runs today's store.js unchanged as its local copy: aixc-v1 in the bridge's partition, shared by the web and shop frames, with BroadcastChannel reaching tabs on both origins. It syncs with the server: GET /v1/pocket (records, tombstones, rev), PUT /v1/pocket/:key, DELETE /v1/pocket/:key, and DELETE /v1/pocket (forget everything). The last write wins by server rev, removals leave tombstones, writes queue while offline, and a server that has forgotten a pocket (a memory-store restart) is filled again from the bridge's copy. (3) The page gets bridge-store.js. It implements the existing interface {ready, persistent, all, get, put, remove, clear, subscribe, legacyIds, dropLegacy, close} over a MessageChannel with origin checks, so pocket.js and the demos do not change (ADR-0052 §3 passes the store in). The first open merges the page origin's local aixc-v1 records into the bridge. If the frame or its storage is blocked, the local per-origin store is used and the album says 'kept on this site only'. (4) The gateway endpoints accept only same-origin requests from the bridge (Origin must be the gateway's own). They validate record v3 with zod: lengths; URLs only on the site's origins and their picture hosts; source.site among the origin keys. They refuse personal data (the agent-mask patterns: phone, national ID, email, card) and records from private pages. Caps: 200 records of at most 4 KB each, with a rate limit. Only sha-256(pocket id) is stored. Pockets unused for a period expire (pilot knob; 30 days proposed). Logs hold counts only. (5) Carriers: a new loader option `bridge`. For the public gateway, the extension and Mode A it is the gateway's https origin. In the demo browser it is a routed pseudo-origin answered by the local gateway, because SPEC-03 §1 rules out http://localhost from https pages. The bridge also carries short cross-origin intents ('open sticker S on arrival', valid 30 s), so no sticker state goes in a URL. The trail stays per origin (ADR-0039) and does not use the bridge.

Risks: Partitioning differs by browser: Safari limits third-party storage, and Brave clears it when the site's tabs close. The fallback to local per-origin storage with an honest label must be tested.; A hidden iframe from our gateway on every layer page is a new element in Vodafone's DOM: one request per page to us, and the frame must be invisible to assistive technology.; A pseudonymous Pocket id plus what a visitor kept and when is behavioural, personal data under Egypt's PDPL and GDPR, even if every sticker is public copy. A notice, an expiry and a delete path are needed before public use.; The public gateway's memory store loses Pockets on restart. The bridge copy refills it, but a browser that also lost its partition loses that Pocket.; Under Mode A, Vodafone may prefer its own identity for signed-in customers. Revisit then.

Evidence: ADR-0051 §1 (IndexedDB per origin; nothing leaves the browser) is superseded by decision 5. experiences/src/pocket/store.js:24-27 (aixc-v1, pocket, aixc-pocket), :56 (the interface the bridge store reuses). record.js:41-69 (the record and isRecord with v===2). demos/pocket.js:33 (where the store is opened, the single place to switch backend). ADR-0016 §2-3 and guide.ts:96-104 (sessionStorage session, #vgh). Same site: cache keys for both origins are partitioned under https://vodafone.com.eg (eshop map :339). The shop's CSP has frame-src 'self' * (eshop map :338). Web's only CSP is frame-ancestors (live-demos-way2.md:78). server.ts:113 (only .js is served under /sdk/aixc today), :90-92 (site key and origin check). packages/loader/src/loader.ts:36-40 (the `gateway` option is the precedent for `bridge`). SPEC-03 §1 Mode B (no localhost from https). ADR-0053 §3 (the public gateway runs one machine on the memory store).

**6. The album showing shop-linked stickers (decision 1a)**

Record v3 comes before any new backend, so the server schema starts at v3. source.site is the origin key; a v2 record reads as 'web'. source.page = site + path without the language + the kept query (categoryUrls normalised). addedBy ('person'|'kit') replaces the ambiguous `origin`. cta.href is absolute and gains cta.site and cta.kind ('link'|'dialog'|'commit', from the shared classifier and the commit-page patterns). Link keys are always '<site>:<path without language>' on both origins. v2 records are upgraded on read and their keys rewritten, so the re-match keeps its measured numbers. Album: stickers are grouped by site and page, and the group heading names the shop ('Vodafone shop · Smartphones', and the Arabic) when the source is the shop. A web card whose CTA leads to the shop shows 'Opens the shop' beside Vodafone's own label; on the saved pages these are the 19 card CTAs the adapter reads, such as 'Buy now' and 'Get your line now' leading to /lines/red/numbers. A CTA that leads into a commit flow (cta.kind 'commit') is a plain native link and never gets the portal animation. Every e-shop destination gets the picture preview, because the shop's no-store HTML defeats OD-4's one-fetch cache plan. Stickers saved on shop pages (later, E21) show on web the same way: they open the shop's list page with the card spotlighted, through the bridge's arrival intent.

Risks: Changing the key format could shift ADR-0051's re-match numbers (home 10/10, Cash 8/8, Services 29/30, RED 7/8, bundles 19/20). Re-run them in the same commit.; The ids-only legacy move compares paths only. It must compare site and path.

Evidence: experiences/src/pocket/record.js:21 (pageKeyOf drops the language and the whole query, so /en/ on the shop collides with / on web and every category list is one page), :60 (`origin` means who kept the sticker), :67-69 (isRecord requires v 2). experiences/src/host/live-adapter.js:138 (the link key has a host only when the link is on another origin, so one shop link gets two keys), :141 (picture keys only for /documents/). The 19 card CTAs to the shop that the adapter reads (phase 3 map :510). 323 link instances, 28 distinct (fixtures/replay/vodafone-eg/crawl.json). portal/config.js:15 and :135, and experiences/tests/pocket-portal.test.mjs:459 (shop links get the preview). Shop HTML is no-store (audit :24).

**7. The layer and the Pocket on e-shop pages (decision 1b)**

(a) Loader (packages/loader, shared by the demo browser and the extension): `experiences` becomes one entry per origin key, {origin, requires: '#main-content' | 'vf-root', paths, spa}. On the shop, aixc.js is added to every top-level document, because the app can route into an allowed page later; the layer itself decides per route. (b) Core: document scope (guard, ensureCss, the bridge store, the album region, chunks) is split from route scope (the page-host check, the page map for the current URL, the adapter's read, tags and observer, chips, and the Pocket's page object as page()). On CMS pages the two coincide. Route changes come from the Navigation API (navigatesuccess) and popstate, with a 1 s location poll only where the Navigation API is missing. There is no second history wrapper: the guide's ADR-0030 wrapper stays the only one. After a route change the layer waits until vf-root has been quiet for 300 ms (6 s cap), then restarts route scope. (c) An allowlist is re-checked on every route: home, list?categoryUrls=*, the internetServices DSL and at-home landing pages, lines/*/plans. Never cart, checkout, wishlist, register, account, profile, order-status, payment, lines/*/numbers or review, dsl-checkout, subscription-details, or any path robots.txt disallows. Leaving the allowlist stops route scope (tags and chips removed, the album closed, the page left as without the layer) while document scope waits. (d) createShopHost: Angular owns <vf-root>'s subtree, so the layer never inserts nodes inside it. Regions and overlays are body children after vf-root; inside it the layer only sets data-aixc-* attributes on recognised cards, re-applied after re-renders by the adapter's observer. The album is a fixed panel with its own scroll below the shop's header (chromeBottom measured from the nav bar), instead of hiding vf-root, and sits below OneTrust's z-index. PROTECTED adds vf-tobi-chatbot, vf-floating-section, vf-scroll-buttons and the shop's OneTrust banner. (e) Recognisers: a second table for vf-product-card, vf-bundle-card, vf-device-card, vf-offers-card and vf-category-card, filled in from the owner's saved pages. Keys: the product slug if the card exposes one, the /ecommerce/api/asset/content/<name> picture, the title and the digits. The album comes first. Chips (an overlay outside vf-root, out of the tab order per OD-1) come only after the owner has seen them beside Vodafone's own wishlist button. (f) 'Your journey' stays in the guide's sheet on the shop (OD-5; the trail is per origin, ADR-0039).

Risks: Angular re-renders drop the data-aixc tags. The observer must re-tag cards without flicker or re-reading in a loop.; The person can route into /en/cart while the album is open. Route scope must close the album and give the page back first.; Whether the shop hydrates its markup is unknown, and Dynatrace on the shop would see our errors. The guard and the 'nothing inside vf-root' rule are the defence.; Two 'save' features on one card (Vodafone's wishlist and 'Pocket it') could confuse people. That is a product decision for the owner (AGENTS 4.8).; The shop has its own OneTrust configuration (202301.1.0), with an unknown banner box. Measure it in visit 1 before any floating control goes on the shop.

Evidence: packages/loader/src/loader.ts:21-22 (the layer origin is web only, 'never the shop'), :91-93 (needs #main-content; checks the path once), :106 (DOMContentLoaded only). experiences/src/host/index.js:40-45 (the page map for the URL at start only), :69 (__aixcStarted, once per document). demos/pocket.js:35 (the page captured once). page-host.js:20 (PROTECTED lists web's elements), :34-35 (no host without #main-content). guide.ts:193-211 (the guide already wraps pushState and replaceState and listens to navigatesuccess), :250-253 (it settles on app-root or vf-root). tests/unit/aixc-delivery.test.ts:73-88 asserts there is no layer on the shop. Shop facts: no #main-content in the templates; the vf-* card components; TOBi and floating parts (eshop map :340-341, :354). Risks recorded in the eshop map at :370-371 (a route into the cart; DOM writes inside vf-root).

**8. The owner's live visit(s)**

Before any visit, the owner updates O29 (what reached the live site on 12 Nov). Visit 1 (facts and pages, about 30 min, off-peak Cairo time, with his go on the day). It uses a tool (tools/eshop-visit.ts) built and dry-run offline first. The demo browser runs live and signed out, in a fresh profile so the shop's banner can be measured while unanswered; the tool never answers it. At most 1 page load per second; it stops on any bot check. It saves: robots.txt of both origins verbatim (2 requests); the shop's own menu JSON from the page's own response (no extra request); the rendered and raw HTML of about 8 public pages (home in both languages, the smart-phones list in both spellings, one product page the owner opens with his own click, the DSL and at-home landing pages, lines/flex/plans); header names, and cookie names without values. It records: the banner's selector and box in English and Arabic; whether the accessibility widget is present; TOBi's box; the address-bar spelling of a category list; where /internetServices/dsl/bundles lands; how long until vf-root is quiet, and whether networkidle ever arrives; whether the Navigation API fires on a route change the owner clicks; whether #vgh and history.state survive Angular's start-up; whether IndexedDB survives a reload, and when the shop's clearLocalStorage runs; and, if E6 is built, whether the bridge storage is shared by both origins. The results go into the audit with dated re-verify marks, robots.test.ts gets the verbatim text, and the pages go into a private replay fixture. Visit 2 (syncs): the planned web-only held sync; then, in another run, the shop's dry run and real run, with the report read before activation. Visit 3 (with S17): the Pocket smoke on web; the guide crossing from web to the shop (moments 5-6); the agent refusing a real Add to cart and guiding to it, never pressing it (checked in the event log); one Pocket across both origins; and whether any observer report was made.

Risks: A bot check ends the visit early. Order the checklist so robots.txt, the menu JSON and the home and list pages come first.; Measuring the banner needs it unanswered. A fresh profile is required, and the owner's normal demo profile must not be touched.; The saved pages are Vodafone's content and belong in the private repository only.; Angular route checks need the owner's own clicks. The tool must never click for him.

Evidence: O29 (docs/qa/bugs-and-open-issues.md:54) is stale: the demo profile's cache holds e-shop and web responses dated 12 Nov (eshop map :56-59; phase 3 map :312). There is no verbatim robots.txt on disk: tests/unit/robots.test.ts:21-39 is a reconstruction. No e-shop HTML exists on disk (no-store, audit :24). The widget was recorded absent on 2026-10-23 (audit :95). Safeguards in eshop map §6 (rows 1-15). tools/live-crawl/extract-entry.ts:8 removes the banner and the widget from the person's own tab and must never be used on the shop (AGENTS 4.6).

**9. How this interleaves with phase 3's remaining steps S6-S17**

Now, before S6: E0 (documents: ADR numbers and the plan) and E1-E2 (the commit guard and the pointer). These touch only packages/sdk, services/knowledge and the router, so they run alongside the experiences work. They go first because the agent already runs unguarded on the shop and a public extension build exists. With S6: E4 (route scope and the page() seam), so chips are written once for both kinds of page and re-keyed on aixc:model and on route changes. With S7: E5 (record v3 and shop-linked stickers in the album); S7's grouping is the record's page key. After S7, and before S12/S13 and phase 7: E6 (bridge and server store). The portal's Back restore (S13) and the demo kit's Fill and Reset (phase 7) write through it. S8, S9, S10, S14 and S15 (trail host v2) are independent. The S11 lift ADR and the S13 portal ADR take the next free numbers when written, not 0053/0054. S13 uses cta.kind and cta.site: it never animates into a commit flow and always previews the shop. S16 adds shop cells: the guide alone at first, the Pocket after E20. S17 joins visit 3 (E22). The knowledge-base track (E7-E11) and the crawl track (E13-E14) run in voice-guide's services and jobs in parallel. E8's id rekey lands before the web-only held sync (E18), so its churn is reviewed once. Visit 1 (E15) happens as soon as O29 is updated, because E16, E17, E19 and E21 wait on it. The new sub-phase '3-shop' (E20-E21) follows E6 and E16.

Risks: Phase 3's S6/S7 author and the E4/E5 author edit the same files (demos/pocket.js, record.js, host/index.js). Land them as one change per step, or in strict order.; If E6 slips past S13, the portal's Back restore is built on the local store and must be checked again on the bridge.

Evidence: Dependencies in docs/reference/live-way2-phase3-map-2026-11-13.md:218-300 (S6 needs S3, S5 and OD-1; S7 needs S4, S5 and S6; S12 needs S5, S7 and S11; S13 needs S5, S7, OD-3 and OD-4; S16 needs S10-S13; S17 needs S10, S11 and S13). Reservations: phase 3 map :160 (ADR-0053 for the lift) and :166 (ADR-0054 for the portal), versus docs/adr/0053-0056 already on disk (untracked, Proposed, 2026-11-13) and their rows in docs/adr/README.md:58-61. ADR-0052 §8 still points to 'ADR-0053' for the lift. The runbook's first sync after 2026-11-11 is expected to be held at 68% churn (eshop map :268).

Steps:

- E0 Reconcile ADR numbers and the plan (documents only): Confirm that 0053-0056 (public gateway and shared loader, Claude as the agent model, Whisper STT, the public extension; untracked, Proposed, 2026-11-13) keep their numbers, so the e-shop ADRs take the next free number when written (0057 onward). Update ADR-0052 §8 ('ADR-0053' for the lift becomes 'the S11 lift ADR'). Change the phase 3 map's S11/S13 reservations to 'next free when written'. Add an 'E-shop' section to docs/handoff/live-demos-way2.md (the 8 owner decisions of 2026-11-13, tracks E1-E22, the '3-shop' sub-phase). Record that decision 6 is already in the working tree (runbook.md:72 and :90; tools/demo-live.ts:109 prints 'one not saved, and the e-shop, opens from the internet'). Checks: `grep -n 'ADR-0053' voice-guide/docs/adr/0052*` no longer names the lift. The rows in docs/adr/README.md match the files. A runbook search finds no '(offline)' claim for --replay. Docs review. Owner: Confirm that 0053-0056 stand.
- E1 The agent's built-in commit guard on every origin (decision 4): packages/kb/src/commit.ts: commit rules as data (words in English and Arabic with Arabic normalisation, icon tokens, sl-* ids, button.cart, card-bundle-action-select-btn, device-select-btn, commit-page patterns) and a pure classify(descriptor). Site config: a `commit:` block per origin key, with a zod schema. Knowledge pageContext: merges the origin's built-in selectors into commitTargets; on commit pages it adds commitPage and a ':root' placeholder selector (guide.js unchanged). Router planner: refuses click steps whose target text matches commit words. agent.ts: drops the 4-match hiding; classifies every click and select target live (the element, its closest button, a or [role=button], its children's alt and aria text) and refuses commit targets; acts on nothing on commit pages; adds a capture-phase window listener for the length of a run that stops untrusted click and submit events on classified elements; rewrites the prompt truthfully; adds the custom tool guide_person_to(index) (used in E2). The agent reads window.voiceGuide.session.page, so guide.ts is not touched. Checks: Offline replay with hand-written pages served under https://eshop.vodafone.com.eg/en/... (offline mode). A stand-in model asks to press each of at least 20 controls: English and Arabic text, icon-only alt 'cart', a Material icon name, aria-label, sl-* ids, a span nested in a button, an a.btn, a control rendered after a pushState route, a DSL Select. Result: 0 clicks reach the page counters, 0 navigations, and every refusal is reported. A direct controller.clickElement bypass and an el.click() from a test script during a run are both stopped by the capture guard. A real Playwright mouse click on the same control reaches the page once. On /en/cart and /en/lines/red/numbers the agent acts on nothing and says so. Executor click on a commit selector: refused (existing test extended). Unit table for classify in both languages, with near misses ('Cartoon', 'Details', 'Compare', 'Sort by price'). sdk-size: guide.js byte-identical. Owner: Confirm the commit list. The eshop map's D2 list adds OTP and document-upload steps, the national-ID form, DSL bundle Select buttons and the store-pickup reservation. Confirm the guidance line in both languages.
- E2 The guiding pointer chunk (pointer.js): packages/sdk/src/pointer-chunk.ts builds to dist/pointer.js (window.__vgPointer) with its own gzip budget of about 3 KB. It draws in the guide's open shadow root through window.voiceGuide.ui (spotlight with commit, pointAt without tap) plus its own pulse ring and caption. It finds the control again after re-renders. It ends on the person's own click on the control, Esc, the microphone, a route change, the control disappearing, or 30 s. Reduced motion: highlight only. A shared obstacle list (accessibility button, OneTrust banner, TOBi). Vodafone palette (check ui.ts:80 #d97706 against SPEC-01). agent.js loads it on a refusal or a guide_person_to call and ends the task with one short line. Checks: e2e on the hand-written shop page. After a refused Add to cart, the pointer moves from the microphone to the control (positions sampled at 0, 300 and 600 ms). The highlight matches the control's box within 8 px. The caption carries the control's own label in English and Arabic. Nothing is clicked. A real click by the test ends the guidance and reaches the page once. Reduced motion: no travel. At 1366x900 and 375x812 the pointer and caption never intersect the accessibility-button stand-in or the banner stand-in. A control that Angular replaces mid-guidance is found again, or the guidance ends with a line. sdk-size: pointer.js within budget, guide.js unchanged. Owner: The look, the wording, and the 30 s duration.
- E3 The session names the guide's chunks (making room in guide.js); confirm steps use the pointer: guide.ts: one loop over session.chunks [{name, delayMs}] replaces the trail and voice-out special cases at about :166-168. The gateway decides: trail when enabled; voice-out when the engine is voicetut; pointer on pages with commit targets; observe when E11 applies. The executor's confirm case calls voiceGuide.pointer when it is loaded and keeps today's commit spotlight otherwise. Measure the saving. Checks: sdk-size: guide.js at or under 20,480 B and smaller than before; record both numbers with date and conditions. trail.e2e and the voice-out tests unchanged. A confirm step on a demo-telco commit destination shows the pointer. A chunk that fails to load leaves the guide working (no page error).
- E4 Route-scoped experience layer (architecture prep, no behaviour change on web): experiences/src/host/index.js: document scope (guard, ensureCss, store, album region, demo chunks, the trail claim) and route scope (page-host check, page map for the current URL, adapter read, tags and observer, chips) as separate start and stop functions. The Pocket's seams take page() as a function (demos/pocket.js:35). host/route.js: Navigation API navigatesuccess plus popstate, a 1 s location poll only without the Navigation API, and no history wrapper. The 300 ms vf-root/app-root settle with a 6 s cap. On CMS pages route scope equals document scope. Checks: aixc-layer e2e 6/6 and pocket-live e2e unchanged. On a synthetic SPA fixture page (test origin, pushState routes): the page map is fetched once per route; the model is re-read after the settle; a sticker saved after a route carries the new path and title; a route to a path outside the allowlist removes tags and chips and closes the album, leaving the page as without the layer. history.pushState is the same function before and after the layer starts.
- E5 Record v3, origin-aware keys, shop-linked stickers in the album (decision 1a): record.js: v3 adds source.site (the origin key; a missing value reads as web); a page key keeping the kept query (categoryUrls normalised: '*x', '/x' and '%2Fx' become one, D7); addedBy instead of origin; an absolute cta.href with cta.site and cta.kind (from the classifier). v2 records are upgraded on read. live-adapter keysOf: the link key is '<site>:<path without language>' on both origins (:138). Album: grouped by site and page; names the shop; 'Opens the shop' on shop CTAs; commit-leading CTAs are native links only; the shop is always previewed. Checks: pocket-record unit tests: web '/' and the shop's '/en/' are different pages; two category lists are different; the two spellings are equal; v2 upgrades to v3 and keeps matching; the legacy move compares site and path. live-adapter integration: ADR-0051's re-match numbers unchanged (home 10/10, Cash 8/8, Services 29/30, RED 7/8, bundles 19/20, 69/69 across dates). On the saved pages, the 19 shop-linked card CTAs, once kept, show site 'shop' on the CTA and 'Opens the shop'. pocket-live e2e green. The clone's ids-store and pocket_e2e.py (210) green.
- E6 One Pocket across both origins: a server store behind a gateway bridge (decision 5): (a) Offline spike: synthetic pages routed on https://web.vodafone.com.eg and https://eshop.vodafone.com.eg (offline, nothing leaves the machine) frame a routed bridge origin. Measure one IndexedDB and one BroadcastChannel across both top-level pages in Playwright Chromium and in the demo's Chrome channel, and in Firefox if installed. (b) Gateway: GET /sdk/aixc/bridge.html with a strict CSP and frame-ancestors set to the site origins; /v1/pocket GET, PUT and DELETE, accepted only from the gateway's own origin; the pocket id hashed at rest; a zod record v3; caps; a personal-data scan; private pages refused; expiry of unused Pockets; rate limits; traces with counts only. Store interface on memory and Postgres (migration: pockets, and pocket_records with tombstones and rev). (c) The bridge document runs store.js as its local copy and syncs it (last write wins by rev, tombstones, a write queue, refills a server that forgot it). experiences/src/pocket/bridge-store.js implements the store interface over a MessageChannel, merges the local aixc-v1 records once, and falls back to the local store with an album line. (d) A `bridge` loader option: the gateway origin for public, extension and Mode A; a routed pseudo-origin in the demo browser. Arrival intents carried by the bridge. Checks: The S4 store suite parameterised over both backends (reload, localStorage.clear(), two tabs, IndexedDB blocked, AIXC-56/57/58/64/67). Two-origin offline e2e: a sticker saved on a web page appears in a shop tab within 1 s and the reverse; removal syncs; Reset empties both and the server; after a memory-store restart the bridge copy refills the server; a blocked bridge falls back to local storage with the label. The pocket id is absent from the page's window, its storage and its requests. The request log shows no Vodafone host. Gateway integration (Postgres): a phone number in a description is refused (422), a record from /en/cart is refused, a picture on a foreign host is refused; expiry purge; caps; rate limit. Owner: Approve the bridge approach; how long an unused Pocket is kept; the notice wording (album, extension listing, X-ray); a durable store for the public gateway (Postgres or the memory store); whether public visitors get the server store or only the owner's demos.
- E7 Guide points: the decision and the rule changes (decision 2, documents): Write the ADR: prices and stock stay in the knowledge base on every origin as typed, dated guide points. They are never spoken or shown from the knowledge base. The live page is the source for every answer. Background updates from the visitor's page go through a points ledger over immutable versions, with the rule against bad reports. Rewrite AGENTS.md 4.3 with the owner's text (the knowledge base may keep public prices and stock as dated guide points; traces and logs still never hold page values; never personal data). Amend SPEC-03 §4.3, SPEC-04 §1 and ADR-0011 §3, and add the describer prompt rule. Checks: Review; links valid; the docs/adr/README.md row. Owner: The exact AGENTS.md 4.3 text. The defaults for the rule against bad reports (the 2-report threshold, the 24 h window, the 0.5-2x ratio band, whether public reports are on).
- E8 Builder: speakable fields and guide points; ids never built from prices: Manifest standard: a `points` field. The builder moves money and stock fragments out of labels, target.text, descriptions and visual descriptions into points. Ids come from non-value features; this also fixes the stacked suffixes at build.ts:227-228. The describer returns prices as points, not prose (describe.ts:114). An integrity rule: 0 money or stock strings in speakable fields. An offline transform of the committed manifest (data/crawls is absent) produces an importable version and an id map. The overlay (3 entries), both evaluation sets and the experience profile are re-keyed in the same commit. Checks: The integrity scan fails on the committed manifest (294 strings) and passes on the transformed one. eval:router on the transformed manifest is within 2 points of the committed one (record both). `npm run experience` builds green. Page-map titles carry no money. kb-diff shows the renames as pairs.
- E9 Router and planner: price questions use points, answers use the live page: Lexicon entries for numeric price targets in both languages (Eastern and Western digits). u.select by near, below or above with a value. Candidate ranking over points (tolerance knob), with the origin priorities kept. The planner navigates, reveals, picks the item and reads it live. Phrases never carry a knowledge-base value. A missing live item gives a 'not on the page now' answer and spotlights the list. Clarify options and agent hints use speakable labels only. A last check on plan text that removes money not present in the utterance (counted in the trace). Checks: New tuning and held-out cases: 'a bundle around 50 pounds', 'phones under 10,000', 'باقة في حدود 50 جنيه'. eval:router stays within the gate. A no-quote unit test over both evaluation sets plus a synthetic set: no point value in say, caption, question, options, message, hints or page titles. e2e on the demo-telco fixture with a knowledge-base point deliberately different from the page: the guide speaks the page's value.
- E10 Points ledger, the observation endpoint and the rule against bad reports: Schema v4 (kb_point_reports with 48 h deletion and salted hashes; kb_points; the append-only kb_point_events) in the memory and Postgres stores. The knowledge service applies the overlay to the active version (kbVersion@p<rev> in plan metadata and traces; the profile and page map keep the base id). POST /v1/points/observe: the page is worked out from the URL; private kinds, commit destinations, non-point fields and a stale version (409) are refused; rate limited. Acceptance: the trusted observer header (added only by the demo browser's forwarder in live mode, demo-browser.ts:218-220), or 2 matching reports from different visitors within 24 h; sanity bounds; disputes held. CLI `npm run kb -- --points [--held|--accept|--revert|--freeze]`. Reconciliation on activation (retired, carried over, orphaned). kb-diff and the churn gate ignore points. Traces hold counts only. Checks: Integration tests (Postgres and memory): one test per acceptance rule and per refusal; a single public report is held; 2 different visitors are accepted; a contradiction becomes disputed; a currency change is held; revert restores the old value. A demo-browser unit test: replay never adds the observer header and the page never sees it. Activating a new version retires older rows and orphans rows whose destination is gone. The churn gate is unchanged by a difference in points only. Trace rows hold no values. Owner: The defaults of the rule; whether public reports are on.
- E11 Observe chunk: the visitor's page updates guide points in the background: packages/sdk observe chunk, named in session.chunks only when the page has points and observation is on for this carrier. After the settle it reads only the knowledge base's typed point fields with the knowledge base's locators (reusing the executor's readers), at most N items. It normalises and masks the values, compares them with session.page.points, and sends only the differences, once per page view and per route. It never runs on private kinds, never in replay, and makes no request to Vodafone. Checks: Unit tests: normalisation (Arabic digits, EGP and جنيه, stock words). e2e on demo-telco with one changed price: exactly one report, carrying only the changed value; nothing when values are unchanged; nothing on an account page; nothing in replay. The request log shows only the gateway. The chunk is within its budget; guide.js unchanged.
- E12 Traces stop holding page values and raw words (eshop map D14): Executor read details, turn.received utterances and full URLs with their queries are masked or dropped in trace attributes (executor.ts:154-157; server.ts:203-205; router handlers :80 and :89). The X-ray keeps live values in memory only. Checks: A trace scan test over the e2e runs: no money, no unmasked phone or national ID, no query strings. Owner: Not covered by the 13 Nov decisions: is this wanted before the guide is used on shop forms and before observation goes live?
- E13 Crawler fit for the e-shop: robots, pacing, waits, carry-over: robots.txt fetched per origin with the crawler's user agent, the crawl stops for an origin whose robots.txt can't be read, saved verbatim, with a test hook for fixture robots (crawl.ts:186 skips localhost). Pacing per origin: at most 1 navigation per second, 1 page in flight on the shop. Back-off on 429 and 503 with Retry-After. Pages with status 400 or above dropped. Wider challenge detection that stops at the first sign on the shop. A vf-root/app-root settle instead of networkidle plus 150 ms. Scripts chosen by full URL. A shop page cap. Carry-over of origins not crawled in the run (sync-lib.ts:71-79). A test that the crawler never clicks. The user agent stays 'VodafoneEG-VoiceGuide-Crawler/0.1'. A hand-written third shop origin in fixtures/sites/demo-telco (A6). Checks: Fixture crawl: request timestamps at least 1 s apart per origin; robots.txt returning 503 gives 0 pages; disallowed paths are never requested (network log, SPEC-04 AC6); a 403 or challenge storm stops the run; an --origin shop run keeps the web destinations with churn 0 and the gate passes. The existing ingest e2e is green. Owner: Whether SPEC-04 §4's contact suffix is added to the unchanged name, or SPEC-04 is amended.
- E14 Whole-menu seeds, scope and shop extraction (decision 3): seedsFrom: `menu` (the page's own menu-hierarchy response kept during the first shop page load, or one paced fetch; saved verbatim) and `links` (shop links on web pages). Mapping: CATEGORY to list?categoryUrls=, LINK to its path, PAGE to its path. categoryUrls normalised in url.ts and kb-index variantKey. Excludes at any depth, ignoring case, for every transactional path (including lines/*/numbers and review, dsl-checkout, *subscription-details). Stable ids for pages kept by query. Card names from title classes. Commit points outside forms through the shared classifier. Page kinds from patterns. Products stay items of lists. Checks: Unit tests: the mapping on a hand-written menu fixture (same shape, no Vodafone content); every transactional URL measured in the eshop map (scope.mts list) is out and every menu URL is in; ids stay stable when a category is added. A fixture crawl builds with 0 integrity errors, commit points on Add to cart, Buy now and the cart icon, a speakable scan of 0, and points on the cards. Owner: Whether reading the shop's menu data is acceptable as the seed source.
- E15 Owner's live visit 1: e-shop facts and saved pages (live): tools/eshop-visit.ts, built and dry-run offline against the fixture first. The checklist from design 8: robots.txt of both origins verbatim, the menu JSON from the page's own response, rendered and raw HTML of about 8 public pages, header and cookie names, the banner's box and the widget, TOBi, the category-list spelling, where dsl/bundles lands, settle times and networkidle, Navigation API events, whether #vgh and history.state survive, IndexedDB and clearLocalStorage, and the bridge if E6 is built. Results go into the audit with dated marks, robots.test.ts and a private replay fixture. Checks: The visit's report is complete for every item, or says why not. robots.test.ts passes on the verbatim text. The audit is updated with dates. Owner: Update O29 first; off-peak Cairo; his go on the day; his own clicks for the product page and the route change.
- E16 Fixtures and the classifier refined from visit 1 (offline): A shop replay fixture (rendered HTML, scripts off) under the real shop URLs. The hand-written fixture, the classifier and the banner selector refined with real card markup and ids. Recogniser rows for the vf-* cards. Settle numbers go into the crawler config. Checks: Crawler fixture tests green. E1's guard tests re-run on the saved shop pages: every real commit control is classified, and there are 0 false positives on sort, filter and menu controls (moment 6 'sort by price' stays clickable). E2's pointer works on real markup.
- E17 Router, overlay and evaluation for the shop: Shop labels (موبايلات, وريني الموبايلات, smartphones). Priorities that keep DSL and home-internet requests on web unless 'shop' or 'buy' is said. A shop 'buy' flow that shows the item and stops at the commit point with the pointer. Tuning and held-out cases for moments 5-6. Provisional ids from the fixture. Checks: eval:router on the fixture manifest: no drop on the existing web cases; the new shop cases pass.
- E18 Web-only held sync, including E8's renames (owner) (live): Runbook §5.1: `npm run sync -- --site vodafone-eg --origin web --dry-run`, then the real run. Review the held report (removed destinations first, then pairs matched by position only, then E8's renames), activate, run `npm run experience -- --site vodafone-eg --activate`, refresh the committed manifest. Checks: Dry-run report read. eval:router within the gate. Speakable scan 0. Points populated. Profile rebuilt. Robots result recorded. Owner: O29 updated; runs it himself; activation decision.
- E19 First sync that adds the shop (owner) (live): `--origin shop --dry-run` (carry-over keeps web). The report shows the robots result, blocks, errors, menu seeds present, commit points found, speakable scan, points count and evaluation. Then the real run, activation, profile rebuild, refresh of the committed manifest and the evaluation ids. Checks: Report read before activation. 0 integrity errors. Every menu seed present or explained. Commit points on Add to cart and Buy now. No transactional URL requested (network log). eval within the gate. Owner: Runs it off-peak with his go on the day; activation decision.
- E20 The layer on the Angular shop: loader per origin, shop host, allowlist per route (decision 1b): packages/loader: experiences as one entry per origin key {origin, requires, paths, spa}. aixc.js on every shop document; the route allowlist checked by the layer. createShopHost: regions and overlays as body children after vf-root; only data-aixc-* attributes inside it, re-applied after re-renders; the album as a fixed panel below the shop header, under OneTrust; PROTECTED extended (TOBi, floating section, the shop's banner). The Pocket on the shop uses the bridge store. The journey stays in the guide's sheet. Checks: Offline replay with E16's saved shop pages plus a hand-written page with a script-rendered vf-root and pushState routes: the layer is ready on allowed routes and dormant on /en/cart (0 data-aixc nodes); returning to a list re-reads it; a sticker saved on the shop shows on web through the bridge; a failure at each checkpoint leaves the page as with ?aixc=off; the geometry of Vodafone's content is unchanged; aixc-delivery.test.ts:73-88 updated deliberately; S16 matrix shop cells (guide, Pocket, TOBi, banner) with no overlaps. Owner: The allowlist (D9) and what a shop sticker keeps (stock or countdown text, D10).
- E21 Shop recognisers and keys, the album on shop pages; chips later: Recogniser rows for the vf-* cards. Keys: the product slug if exposed, the /ecommerce/api/asset/content/<name> picture, the title and digits. Shop cards link to '#', so their CTA is the list page plus the title, opened through the bridge's arrival intent. Re-match measured as in ADR-0051. Album first; chips only after the owner has seen them beside Vodafone's wishlist button. Checks: Re-match tables on the saved shop pages, English to Arabic and back; never a wrong card. Album e2e on the saved shop pages in both languages and both viewports. Opening a sticker from web arrives on the shop list with the card spotlighted, and no URL carries sticker data. Owner: Chips on shop cards: yes or no, and when.
- E22 Owner's live checks across the boundary (with S17) (live): One owner session. S17's Pocket smoke on web. The guide crossing web to the shop (moments 5-6, SPEC-03 AC2 and AC4): the hand-off keeps the session, a card is spotlighted, and its price is read live. The agent asked to 'add it to the cart' refuses and guides with the pointer, never pressing it. One Pocket on both origins through the bridge. The result of one observer pass (a report only if a value differs). Checks: Pass means no [AIXC] or [voice-guide] errors; the banner and the widget untouched; 0 commit presses in the Playwright event log; the same stickers on both origins; at most 1 page load per second; stop on any bot check. Owner: Runs it himself; O29 current.

Open questions:

- ADR numbers: 0053-0056 are already written on disk (public gateway and shared loader, Claude as the agent, Whisper STT, the extension; untracked, Proposed, 2026-11-13) and listed in docs/adr/README.md:58-61. Do they keep those numbers, so the first e-shop ADR is 0057, and the phase 3 map's 0053 (lift) and 0054 (portal) reservations and ADR-0052 §8's reference to 'ADR-0053' are updated?
- Interim safety: today the agent runs unguarded on shop pages, both in demo:live and in the built extension (extension/dist/chrome/loader.js points at https://vg-public-demo.fly.dev, built 13 Nov 14:45), with Claude as the public model (ADR-0054). Until E1 is merged, should demos on the shop and any distribution of the extension be held?
- Commit list: besides Add to cart, Buy now, Checkout, Reserve, Subscribe and choosing a number, should the guard also cover OTP and document upload, the at-home national-ID form, DSL bundle 'Select' buttons (card-bundle-action-select-btn), device-select-btn, and the store-pickup reservation? What is the guidance line, in English and Arabic?
- Rule against bad reports: are values accepted at once from the demo browser's trusted observer (live runs only), and are reports from public visitors allowed at all? If so: how many different visitors (2?), in what window (24 h?), and what price ratio counts as plausible (0.5-2x?) before a value is held for review? The public site key is public (ADR-0056 §3), so it cannot be the trust anchor.
- AGENTS.md 4.3 is a 'never break' rule: please give or approve the exact new text. Proposed: the knowledge base may keep public prices and stock as dated guide points, never spoken; traces and logs still never hold page values; never personal data.
- Traces (eshop map D14) still hold read values, raw words and full URLs today (executor.ts:154-157, server.ts:203-205). Should that be fixed before the guide is used on shop forms and before observation goes live? This was not part of the 13 Nov decisions.
- Server Pocket store and data protection: a pseudonymous Pocket id plus what a visitor kept is personal data, even though each sticker is public copy. How long is an unused Pocket kept (30 days proposed)? What does the notice say (album, extension listing)? Is it for public visitors or only the owner's demos? Does the public gateway get Postgres? Its memory store forgets Pockets on restart; the browser copy refills it.
- Identity: approve a hidden bridge frame from our gateway's origin on the layer's pages of both origins, which keeps the Pocket id out of Vodafone's page world. In the demo browser this means a routed pseudo-origin. The alternatives are a cookie on .vodafone.com.eg (rejected: it reaches Vodafone's servers on every request) and hand-off tokens only (then a click on Vodafone's own web-to-shop link does not keep one Pocket).
- Crawler user agent: decision 7 keeps 'VodafoneEG-VoiceGuide-Crawler/0.1'. Should SPEC-04 §4's contact suffix '(+mailto:...)' be added after the unchanged name, or should SPEC-04 drop it?
- Menu data as seeds: may the crawl keep the shop page's own menu-hierarchy response (no extra request), or make one paced fetch of it at crawl start? robots.txt does not list /ecommerce/api, but that is not permission.
- The shop menu's LINK entries include /lines/red/numbers. Should it stay out of the knowledge base, as a commit page the guide knows only to send people to ('choose your number yourself'), while /lines/flex/plans goes in?
- Shop layer scope: is the route allowlist right (home, category lists, DSL and at-home landing pages, lines/*/plans)? Should a shop sticker keep stock or countdown text, or only the copy and price as published and dated?
- 'Pocket it' chips on shop product cards, beside Vodafone's own wishlist button: wait until you have seen the album on the shop, as proposed?
- On shop pages, should 'Your journey' stay in the guide's sheet even after the Pocket runs there (OD-5; the trail is per origin, ADR-0039), or should the shop's Pocket host it?
- Visit 1: can it use a fresh profile, so the shop's cookie banner can be measured while unanswered (the tool never answers it)? What happened on 12 Nov (O29) before any visit is planned?

