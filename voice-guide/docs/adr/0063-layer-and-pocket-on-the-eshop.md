# ADR-0063: The experience layer and the Pocket run on the e-shop, reading Vodafone's Angular app without writing inside it

- Status: Proposed (2026-11-13). Built in step E16 of the e-shop plan (`docs/reference/eshop-plan-2026-11-13.md`): part a (loader, routes, host, album) on hand-written stand-in pages after phase 3 S7; part b (recognisers, real geometry) after the owner's first live visit saves shop pages. Accepted after the owner's live smoke on the shop
- Date: 2026-11-13
- Area: loader (ADR-0048 §1, ADR-0053), PageHost (ADR-0048 §6), live adapter (ADR-0049), the Pocket (ADR-0052); amends ADR-0048 §1 ("web origin only") and the live plan's §3.5 (the Pocket on CMS pages only)
- Owner decisions: 2026-11-13, the Pocket on e-shop pages now as well as shop-linked stickers in the album

## Context

The shop is an Angular 19 app (`<vf-root>`) with client-side routing: a page change is a route, not a load, and the app can route into the cart without a load. The layer today loads only on the web origin, only where `#main-content` exists, decides once at DOMContentLoaded, and its PageHost and adapter write marks inside Vodafone's content. No shop markup is saved anywhere; only a live visit can save it.

## Decision

1. **Loader:** per-origin rules. Web as today; the shop needs `vf-root` to have children, an allow list (home, category lists, line plans and numbers pages, the DSL and home-internet landing pages) and a deny list (the transactional pages, ADR-0060 §3). On the shop the layer is added to every document, and decides on each route.
2. **Routes:** the layer listens to the Navigation API and `popstate`, read only; the guide's own history wrapper stays the only one. On every route the deny check runs first, and a denied route stops everything of ours and gives the page back. An allowed route waits for `vf-root` to be quiet (300 ms, at most 6 s), reads the page again, fetches the page map again and updates the Pocket's page.
3. **ShopHost:** our regions are children of `body` after `vf-root`; **nothing is written inside `vf-root`**: the adapter is read-only and keeps a map of elements instead of tags. The album is a fixed panel below the shop's header and below the cookie banner, with no page turn over Angular's root. Protected, never covered or changed: the shop's header and footers, OneTrust, Vodafone's chat, `vf-floating-section`, and the accessibility widget if the shop has one.
4. **Cards:** recognisers for the shop's product, bundle, device, offer and category cards, confirmed on the owner's saved pages; keys from the picture's asset name, the title, its numbers and the product slug; re-matching measured as in ADR-0051.
5. **The Pocket on the shop:** the album only, no chips at first; one Pocket with web through ADR-0062 (without it, a Pocket of its own, which the album says).
6. **Unchanged on the shop:** ADR-0058's guard; the trail's private paths; no accessibility-button lift (phase 3 S11 stays web only); "Your journey" in the guide's sheet; `?aixc=off`.

## Consequences

- A sticker kept on the shop shows in the album on Vodafone's web pages and back.
- Angular's tree is never touched, so the shop's own code cannot be confused by ours.
- Part b cannot start before the owner's first live visit.

## Pilot knobs

- The shop's allow and deny lists; the route wait; the album panel's place.

## Revisit when

- Vodafone changes the shop's framework or its card components.
- The owner has seen the album on the shop and wants "Pocket it" on shop cards (beside Vodafone's own wishlist).
