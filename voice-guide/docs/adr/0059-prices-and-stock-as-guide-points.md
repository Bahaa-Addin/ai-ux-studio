# ADR-0059: Prices and stock stay in the knowledge base as guide points: used to find places, never said or shown; the live page answers

- Status: Proposed (2026-11-13). Built in steps E2 (the value gate) and E6 (price questions) of the e-shop plan (`docs/reference/eshop-plan-2026-11-13.md`). Accepted when E2's and E6's checks pass
- Date: 2026-11-13
- Area: knowledge base, router and planner, speech, agent hints; amends AGENTS.md 4.3, SPEC-03 §4.3, SPEC-04 §1 (the "Values" row) and ADR-0011 §3 ("values are never cached")
- Owner decisions: 2026-11-13, keep prices and stock in the knowledge base on every origin, for the value they bring (above all on the e-shop, where prices change); any question about a price is treated as a guiding price point, searching the knowledge base around it, but the guide never answers with exact prices or stock from the knowledge base: it takes the person to the page that has them, and that live page is the source of truth for any following answer. The new AGENTS.md 4.3 text approved as written the same day

## Context

Measured on the committed manifest (`docs/reference/eshop-map-2026-11-13.md`): 294 strings match the crawler's own money pattern: 121 target texts, 116 labels, 27 descriptions, and 30 ids, selectors and collection ids built from price text (`web.mobile-internet-bundles.plus--37---600egp`). ADR-0011 §3 and AGENTS 4.3 said page values are never stored; the knowledge base already held them, and the guide could say them: clarify options, page summaries, a collection's reply and caption, an item's name kept for follow-ups and picture descriptions all come from knowledge-base text, and every plan leaves the router through one `out()` (`services/router/planner.ts:35`), whose lines `speech:warm` also caches.

## Decision

1. **Nothing is scrubbed.** Labels keep their prices, because people use those words ("the 46 pound bundle").
2. **Guide points.** Each item destination gets its price and stock as a guide point: read from its labels and target text on today's manifest (`guidePoints(d)` in the knowledge index), and from the collection's field values with the date seen once the builder writes a typed `guide = { price, stock, seenAt, source }` at the next sync. Guide points are used to rank and find, never to answer.
3. **The value gate.** One `valueFree(text, lang)` in `packages/text` strips money (EGP, جنيه, ج.م, LE, Western and Arabic-Indic digits), instalments, percentage discounts and stock phrases from everything the guide says or shows: every plan at the planner's exit (the opening line, say steps, questions and options, captions, confirm messages, the hints sent to the agent model), page-map titles and page titles. Names that hold numbers ("25-55", "5 GB", "Flex 1400") are kept by a short exception list. When two options become the same after stripping, the guide shows both cards and reads each one live. The agent's prompt gains: "Never state a price or stock you did not read on this page in this task."
4. **Price questions.** "A bundle around 50 pounds", "حوالي ٥٠ جنيه", under, over, the cheapest, "is it in stock": the router ranks items by guide point, then plans the steps it already has (go to the page, reveal, pick the item, spotlight it and read it live). The number spoken always comes from the live page. When the card is not there, the guide says it cannot see it on the page now and highlights the list; it never falls back to the stored value. Follow-ups read the page again: the session keeps keys, never values.
5. **AGENTS.md 4.3** reads, as approved: "Never store personal data or balances anywhere. Public prices and stock may be kept in the knowledge base as dated guide points (owner, 2026-11-13; ADR-0059): the guide uses them to find places and never says or shows them; it reads the live page, which answers. Traces and logs never hold page values. Pocket stickers keep Vodafone's public copy as published and dated, in the visitor's browser or on our gateway (ADR-0051, ADR-0062); never personal data."

## Consequences

- The guide can answer "what's around 50 pounds?" by taking the person to the right card, and the number they hear is the page's own.
- A stale guide point can at worst send someone to the wrong card, where the live read still tells the truth.
- Ids built from prices still rename when a price changes; they stop being built that way at the next held web sync (the plan's Q12).
- Traces and logs hold no page values (step E3).

## Built so far

- Step E3 (2026-11-13): `valueFree` and `hasValue` in `packages/text/src/values.ts` (money with its currency in English and Arabic, Western and Arabic-Indic digits, percentages, stock phrases; a number without a currency, a percent sign or a stock word stays, so "Flex 1400", "25-55" and "128 GB" need no exception list). Every trace attribute and log field goes through it (`services/shared/clean.ts`, ADR-0021). Tests: `tests/unit/values.test.ts`, `tests/unit/clean.test.ts`, the E3 test in `tests/integration/gateway.test.ts`. The gate on what the guide says and shows is step E2.

## Pilot knobs

- The money and stock patterns and the exception list (`packages/text`).
- How close "around" is when ranking by guide point.

## Revisit when

- Vodafone offers a price feed or API: guide points could come from it.
- Customers (PRD D2): whether stored public prices are acceptable to Vodafone.
