# ADR-0060: The e-shop's whole menu enters the knowledge base, crawled only once its safeguards are in code

- Status: Proposed (2026-11-13). Built in steps E4 (no sync reaches the shop yet), E7 (crawler safeguards), E8 (shop extraction) and E14 (the first shop sync, run by the owner) of the e-shop plan (`docs/reference/eshop-plan-2026-11-13.md`). Accepted when the first shop sync's report is read and the owner activates it
- Date: 2026-11-13
- Area: crawler, builder, sync, site config; SPEC-04; follows ADR-0028 (scope), ADR-0032 (the shop step stopped on 2026-10-23)
- Owner decisions: 2026-11-13, the whole e-shop menu goes into the knowledge base; the crawler keeps its name `VodafoneEG-VoiceGuide-Crawler/0.1` (so SPEC-04 §4's contact is amended, not added); `/lines/*/numbers` goes in like the other menu pages (the numbers themselves are never stored, and picking one is a commit control, ADR-0058)

## Context

Read on 2026-11-13 (`docs/reference/eshop-map-2026-11-13.md`):

- The knowledge base has no e-shop page. The October crawl stopped before the shop, and the in-browser crawler cannot read it: the shop is an Angular app (`<vf-root>`) whose pages need their scripts, and scripts were on only for `/spa/`.
- Only the Playwright crawler (`npm run sync`) can take the shop, and today it is not safe to point there: robots.txt fails open when it cannot be fetched and is fetched without our user agent; two workers share one queue across both origins, so nothing paces one origin; it waits for `networkidle` plus 150 ms, never for `vf-root`; it counts only 403, 429 and a challenge title as a block; and **a bare `npm run sync` already crawls both origins**.
- The shop's menu items are click handlers and its product cards link to `#`, so nothing can be found by following links; the shop's own menu data names every page.
- Category lists have three spellings (`*x`, `/x`, `%2Fx`); every page is built as kind `content`, so the shop's transactional pages would enter as ordinary pages.

## Decision

1. **Nothing reaches the shop until this is built** (step E4): `crawl.origins.shop.ready: false` in the site config, and `runSync` and `runIngest` refuse any run that includes the shop while it is false.
2. **Seeds: the whole menu.** A committed seed file written by hand from the shop's menu data (main bar, and the footer filtered by the same rules), paths and labels only, expanded to `/en/` and `/ar/`: the home page, the category lists, the line plans and numbers pages, home internet and DSL, about 60 pages, capped at 80. During a crawl the crawler keeps the page's own menu response, makes no extra request for it, and reports any difference from the seed file instead of adding pages silently. Depth 0 to 1, real links only; products are items of their lists.
3. **Always out**, at any depth, case-insensitive, before robots and before any request: cart, checkout, wishlist, register, account, profile, order status, payment, saved payments, vouchers, returns, DSL checkout, subscription details, documents, number review, legacy `/shop/` paths, every robots Disallow line, and any redirect to the sign-in host.
4. **robots.txt fails closed** per origin (a server error, a timeout or a network error allows nothing), is fetched with our user agent, and is saved verbatim with the crawl.
5. **Pacing per origin:** at least 1 s between navigations to one origin; on the shop 2 s and one page at a time; back off on 429 and 503 and honour Retry-After; a status of 400 or above is not a page; the first sign of a bot check on the shop stops the whole run.
6. **Waiting and scripts:** wait until `vf-root` (or `app-root`) has children and the page has been quiet for 300 ms, at most 20 s; scripts run on the shop and `/spa/`, and stay off on CMS pages as in the committed crawl. Never a click, a scroll to load more, typing, cookies or an answer to the cookie banner.
7. **Extraction:** commit points outside forms through ADR-0058's classifier; page kinds for transactional pages; stable ids for pages kept by their query (`shop.list.smart-phones`); the three category spellings as one key; item names from title classes, so they hold no price; guide points from the cards (ADR-0059). On the numbers page the list of numbers is never kept.
8. **Sync order:** origins a run does not crawl are carried over, or the run is refused; the held web-only sync first (the owner runs it), then `--origin shop --dry-run`, its report read, and only then activation.

## Consequences

- The guide can take people to any page of the shop's menu and help them there, within ADR-0058's guard.
- The shop crawl is slower than the web one by design.
- A menu change on the shop shows up as a reported difference, not as silent pages.

## Pilot knobs

- The shop's pace (2 s) and page cap (80); the seed file; the always-out list; the wait for `vf-root`.

## Revisit when

- The owner's first live visit records the real robots.txt, the menu spelling and how the shop settles.
- Vodafone approves scheduled crawling (PRD D3).
