# ADR-0051: The Pocket keeps each sticker as a record in its own IndexedDB store, with the card's copy as published and dated, and finds its card again by a score over the card's keys

- Status: Proposed (2026-11-13); the store and the record are built and tested (phase 3 S4); the Pocket uses them from S5. Accepted with phase 3's checks on live pages
- Date: 2026-11-13
- Area: the Pocket (experience layer), storage, identity, privacy; live plan phase 3 (`docs/handoff/live-demos-way2.md` at the repository root), under ADR-0046 §3–4 and ADR-0049 §2 and §8
- Amended (2026-11-13, e-shop plan step E5, ADR-0059's 4.3 text): a record says which site it was kept on (`source.site`: `web` or `shop`; a record without one is the website's, so the format stays at version 2 and website page keys do not change). A shop page's key is `shop:` plus its path without the language plus the list's category (`shop:/list?c=smart-phones`), the shop's three spellings of a category (`*x`, `/x`, `%2Fx`) being one. A link into the shop is keyed by the shop's host, its path and its category wherever it is read, on the website or on the shop. The Pocket reads its page on every use (a getter the Pocket keeps when it merges its seams), so a route change on the shop can update it. The helpers live twice, in `experiences/src/pocket/record.js` and in the adapter's core, since a module shared by the core and the Pocket's chunk would become a third file in the core's budget; a test checks that they agree
- Owner decision: 2026-11-13, a sticker and the demo kit keep the card's copy as published, price included, labelled with the day it was captured; the visitor's own browser and the committed demo kit are outside AGENTS.md §4.3, which covers the knowledge base, traces and logs

## Context

Measured or read on 2026-11-13 (`docs/reference/live-way2-phase3-map-2026-11-13.md`, "storage-ids"):

- **The clone's Pocket keeps only ids** (`localStorage` `aixc.pocket.v1`) and drops every id that is not on the current page when it loads (`pocket.js`), so its first save on another page deletes the others: one Pocket across pages cannot work as stored (O25). Every sticker needs the current page's model to be drawn; 65 of 155 cards on the saved pages have no picture, and drawing such a sticker throws.
- **Vodafone's signed-out theme clears `localStorage`** on every load of home, Services, RED and Vodafone Cash (maintheme and static-theme; static-lite pages clear it only on logout). No theme script touches `sessionStorage`, IndexedDB or the Cache API (O23).
- **Ids change.** An item's id is the first candidate unique on the page (ADR-0049 §2), so a card added by an editor that shares a card's link renames that card (74 of 155 cards would be renamed, AIXC-41); on the bundles page only 2 of 20 ids are the same in both languages (O26).
- **Prices:** 47 of 155 cards carry a price in their title or copy.

## Decision

1. **One store, the Pocket's own IndexedDB database** (`aixc-v1`, object store `pocket`, one record per sticker keyed by its own key), in the visitor's browser. An in-memory copy serves the first paint; every change is written through and announced to other tabs on a `BroadcastChannel` (`aixc-pocket`). When IndexedDB does not open, the Pocket works in memory for that page and says so (`persistent: false`), and nothing throws. The store is never filtered by the page it is read on. No `navigator.storage.persist()` on Vodafone's origin. The clone's ids-only `aixc.pocket.v1`, where a browser still has it, is moved over once by the page that knows those cards, then removed.
2. **A record holds what the sticker shows and what its card can be known by** (`experiences/src/pocket/record.js`): its own key; the card's id when saved; its kind; its keys (ADR-0049 §8); the copy as published (title and description) with the language and direction it was captured in; the picture (address and alt) or none; the call to action (label, link, or the page's own dialog); where it came from (the page without its language, the path, the knowledge base's page id when known, the page's title, the section's id and title); who added it (a person, or the demo kit); when it was saved and last seen.
3. **The copy is kept as published and dated** (owner, 2026-11-13). A bundle's price stays in the sticker, and the album shows the day it was saved, so a price that has since changed reads as that day's. The demo kit (phase 7) does the same.
4. **A sticker finds its card again by a score**, not by its id (`rematch`): per key kind, more points when the live card is the only one on the page with that value (link 4 or 1, picture 4 or 1, title 3 or 1 and only in the sticker's own language, tab 2, the numbers in the title 2 or 0.5); numbers in the titles that differ, or that one side lacks, count 2 or 1 against; a link, a picture or a title (in the sticker's own language) that both have and do not share counts 2, 3 or 2 against; the same id adds 2, the same section 1. A key that other cards on the sticker's page shared when it was kept (marked `shared` in the record) never scores as the card's own, even when the others have gone. A match needs 4 points (3 when the tab is the card's alone), no tie between cards, and two signs that agree, of different kinds, the same id counting as one: one sign alone is a guess. Each card goes to one sticker, the best fit first; two stickers that fit one card equally both go without it. A matched sticker takes the card's id of the day; its copy stays as saved. (Amended 2026-11-13, AIXC-54 and AIXC-55: at first one unique key was enough and the first of two tied stickers took the card, so on Vodafone's own slips a sticker whose card was gone took another one: the Arabic Mini Call card that also links `/spa/roaming`, the second English "Balance transfer", the Arabic DSL ticket with no English twin. The review of that fix, AIXC-63: a sticker on its own whose card left with a sibling took a third card that the gone sibling had shared a key with; keys shared on the page when kept now never count as unique.)
5. **What the keys are**, settled by these measurements: a picture's name without the trailing space Vodafone's file names often have in one language and not the other; numbers standing on their own in a title ("1400", "25-55"), not digits inside a word ("3alnota"); a tab id in lower case (`vf-plus-tiktok` in English, `vf-plus-TikTok` in Arabic).
6. **A sticker whose card is no longer found stays in the Pocket**; how the album shows it is phase 3 step S7.

## Consequences

- One Pocket across pages and both languages: a sticker saved on Services shows on the home page, in its own language and direction, with its picture or without one.
- Stickers survive Vodafone's theme clearing `localStorage`, and a private window still gets a Pocket for the page.
- Measured on the saved pages (`tests/integration/live-adapter.test.ts`, 2026-11-13, with the amended rule): saved in English, found on the Arabic page: home 10 of 10, Vodafone Cash 8 of 8, Services 29 of 30, RED 7 of 8, bundles 19 of 20; saved in Arabic, found on the English page: 10 of 10, 8 of 8, 29 of 30, 7 of 8, 19 of 21 (the Arabic bundles page has a ticket with no English twin); never a wrong card. Each sticker on its own, its card gone with no other card or with any one other card, in each language and across them (6,194 cases): no sticker takes another card. Saved on the Arabic pages of 23 Oct, found on those of 12 Nov (`fixtures/replay/vodafone-eg-2026-11-12`, from the demo browser's cache): 69 of 69 (home 10, bundles 21, Services 30, RED 8). A card added to Services sharing "Balance transfer"'s link renames cards, and every sticker still finds its own card.
- A price in a sticker can be out of date; its date says so.
- The browser keeps a copy of Vodafone's public copy (titles, descriptions, picture addresses) for each sticker, and nothing else; nothing leaves the browser.

## Verified (2026-11-13, owner's Mac)

- `experiences/tests/pocket-record.test.mjs` (10): the page key, the record, the re-match on synthetic cards (a card sharing a link, the other language, a tab of its own, a gone card, a tie, one card for one sticker, numbers that differ, keys that disagree, two stickers tied on one card, a key shared where it was kept).
- `tests/integration/pocket-store.test.ts` (4, Chromium): stickers survive a reload and `localStorage.clear()`; one store from every page; two tabs; IndexedDB blocked; the old store moved and a malformed record refused.
- `tests/integration/live-adapter.test.ts`: the numbers above, both directions, and every card removed in turn.
- `tests/integration/pocket-store.test.ts` (9): also a sticker kept before the store has opened (AIXC-57), another tab's change never undoing this tab's newer one (AIXC-56), a write refused at commit reported and not shown (AIXC-58), another tab's change during the first read (AIXC-64), a sticker kept just before the store closes (AIXC-67). The store lays its own uncommitted changes over every read and counts a write done when its transaction commits.
- Not verified: the live pages (O29); Safari's storage rules (the demos run in Chrome).

## Pilot knobs

- The points per key kind, the number penalty and the match threshold (`record.js`).

## Revisit when

- Customers (PRD D2): whether a visitor's browser may keep Vodafone's prices, and for how long.
- The layer moves to Vodafone's tag manager (Mode A): the store's name and its eviction.
- Vodafone gives its cards a stable id of their own: match on it first.
