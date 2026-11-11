# ADR-0049: The live adapter keys what it reads by stable ids, counts the page's own dialogs as actions, and keeps each section's knowledge destination on the model (from `GET /v1/page-map`), never as a tag on Vodafone's portlets

- Status: Proposed (2026-11-11); Accepted when the live adapter's checks pass on the live pages (blocked by O29), like ADR-0048
- Date: 2026-11-11
- Area: experience layer, knowledge service, gateway; phase 2 of the live plan (`docs/handoff/live-demos-way2.md` at the repository root), under ADR-0046 §3. Amends ADR-0046 §3 on three points: item ids (the first unique candidate, not the link alone), coverage (the page's own dialogs count as actions), and the knowledge link (the layer does **not** put `data-vg-destination` on Vodafone's elements)

## Context

ADR-0046 §3 has a live adapter read Vodafone's page into the content model the demos already use, key items by their normalised link, and tag what it read, including `data-vg-destination` from the knowledge base, so the guide spotlights the same card whichever view shows. Phase 2 built the adapter (`experiences/src/host/live-adapter.js`, `recognisers.js`) and read the saved pages of 2026-10-23 with it (`tests/integration/live-adapter.test.ts`, runbook §3b). What it found:

- **Links do not make unique ids.** Six Shokran cards on `/en/services` share one link; every bundle on `/en/mobile-internet-bundles` links `/spa/miManagement` (O26). Titles differ between English and Arabic. Pictures are served as `/documents/<ids>/<file name>/<CMS UUID>?t=…`, where the UUID changes when an editor re-uploads.
- **Some cards have no link but work.** The seven Great Entertainment cards on `/en/services` open one of the page's own dialogs (`data-toggle="modal"`, "Download Ana Vodafone"). Counting only links put the page's coverage at 0.76, under Reimagine's threshold, on a page that works.
- **A destination tag on a portlet hides finer targets.** The trail's resolver (`packages/sdk/src/trail/resolver.ts`) takes the nearest `[data-vg-destination]` ancestor first, before the destinations' own locators (deepest match wins there). A section tag on a whole portlet would make every click inside it the section, and hide the cards and pictures the knowledge base locates more precisely.
- **`GET /v1/experience` cannot serve the layer.** It answers 404 while `trail.enabled` is off (the live site config has it off) and carries the trail's questions and profile, which the layer does not need.
- **The knowledge base's section locators are positional** (`#layout-column_column-1 > div.portlet-boundary.portlet-static:nth-of-type(4) > …`, O26), and some labels came from a dialog inside the section rather than the section's own title.

## Decision

1. **Sections are portlets, keyed by instance id.** A section is a Liferay portlet in `#main-content`; its id is the portlet's instance id in lower case (`…_INSTANCE_w9Jro8TDb1vH_` → `w9jro8tdb1vh`), the same across days and languages.
2. **Item ids: the first unique candidate.** For each card, in order: its link's path (without `/en` or `/ar`), its picture's file name (CMS UUID and `+` removed), its title as shown (its Latin letters and digits only, so an Arabic title gives another id or none), its tab and title, its place in the section. The first candidate that is unique on the page wins. Owl's copies (`.owl-item.cloned`), dialogs, FAQ entries and the like are never read.
3. **Coverage counts the page's own dialogs.** A card is usable when it has a title and an action: a link, or a control that opens one of the page's own dialogs. Such a card's call to action is `{ label, href: null, opens: 'dialog' }`; no link is invented. Coverage is usable cards over cards found; a demo is offered on a page only above its threshold (Reimagine 0.9, Pocket 0.6).
4. **The knowledge destination stays on the model.** The layer asks the gateway `GET /v1/page-map?url=<origin + path>` (header `x-vg-site-key`; the query and fragment of the page's address are never sent) and sets `section.destinationId` on each section it can match: a destination's first locator that finds exactly one element, inside one portlet. Where several land on the same portlet: `section` destinations before `collection` and `faq` ones; among those, the one whose title is the section's (only when both have one); else the innermost, so a locator for the whole portlet gives way to one for the section inside it (as the trail's resolver goes deepest first). Locators that rely on `data-vg-destination` are not used (the knowledge base has none today). **Nothing is tagged on Vodafone's portlets for this**; the guide and the trail keep resolving the page's real elements by the knowledge base's own locators. Views the layer draws itself (Reimagine's templates, phase 4) put `data-vg-destination` on their own elements, where no finer target exists.
5. **`GET /v1/page-map`.** A knowledge handler (`pageMap`) returns `{ kbVersionId, pageId, sections: [{ id, kind, css, title }] }` for the page: section, collection and FAQ destinations with a target and no commit point, at most 100, titles only (no page values). The gateway serves it only when the site's `experiences.enabled` is on (404 `experiences_off` otherwise), not gated on the trail, with `Cache-Control: private, max-age=300`. The demo browser's loader passes the public site key to the layer as `data-aixc-site-key`. The request carries no referrer. If the map does not come within 2 s, or fails, the page is read without it; `window.__aixc.pageMap` (with `?aixc-debug`) is then `null`.

## Consequences

- On the saved `/en/services` and `/ar/services` every one of the six sections gets the destination the clone mapped by hand (`experiences/src/main.js` `GUIDE_DESTINATIONS`), including Great Entertainment, whose portlet also holds a section the knowledge base named after its dialog. Every saved page gets the same destinations with its section headings reworded or removed.
- Item ids are the same in English and Arabic on Services (28 of 30; the two others are slips on Vodafone's Arabic page: Mini Call links `/spa/roaming`, one picture has another name), home (8 of 8), RED (5 of 5) and Vodafone Cash (8 of 8), but only 2 of 20 on the bundles page, whose cards share one link (`/spa/miManagement`) and no picture tells them apart, so their ids come from the titles, English on one page and Arabic on the other. A Pocket item saved there in one language is not the same item in the other (O26).
- A page where Vodafone renamed a class loses coverage and the demo is not offered there, instead of a broken view.
- The guide and the trail behave exactly as without the layer on Vodafone's elements: the layer adds only `data-aixc-section` and `data-aixc-item`, and takes them off when it stops.
- The positional locators still break when an editor adds a section above; phase 2c has the crawler record the portlet instance id as a section's first locator, which makes the match exact.
- One more request per page view to the gateway. A browser under the tag manager may keep it five minutes; the demo browser asks every time, since it routes `/__vg/**` itself and Chromium keeps no cache for routed requests.

## Verified (2026-11-11, owner's Mac, saved pages of 2026-10-23)

- `tests/integration/live-adapter.test.ts`: every saved CMS page read with unique, valid ids and nothing dropped (the runbook §3b table); `/en/services` in detail (8 portlets, 12 action cards, 17 service cards, hero, app band, coverage 1, dialog cards without invented links); ids across languages; Owl copies never read and reading changes nothing; the six Services sections' destinations in both languages, with nothing tagged.
- `tests/integration/experience.test.ts`: `GET /v1/page-map` is 404 `experiences_off` on a site without the layer; with it, the page's section destinations with locators and titles only, never a commit point; an unknown page gets none.
- `tests/e2e/aixc-layer.e2e.test.ts`: through the demo browser and the real gateway, the layer on `/en/services` and `/ar/services` names all six sections.
- `tests/unit/aixc-delivery.test.ts`: the loader puts the site key on the layer's tag.
- `tests/integration/live-adapter.test.ts` also: Vodafone rewords or drops a heading the knowledge base still has, and each section keeps its destination (Services and the bundles page, both languages; it failed with the first matcher, which took the dialog's destination).
- `tests/e2e/aixc-layer.e2e.test.ts` also: the request carries only the page's address (no query, no fragment) even from `?…&msisdn=…#…`; a 500, a 404, an answer that is not JSON, no network, or no answer within 2 s: the page is read all the same, without the map and without a warning.
- Not verified: the live pages (O29) and the 38 knowledge-base pages that are not in the replay (34 of them `/en/` or `/ar/` pages).

## Pilot knobs

- The coverage thresholds per demo (Reimagine 0.9, Pocket 0.6), set where each demo is offered (phases 3 and 4).
- The page map's time limit in the layer (2 s, `experiences/src/host/index.js`) and its cache header (300 s, `services/gateway/server.ts`).
- The recognisers' rows (`experiences/src/host/recognisers.js`), one per Vodafone component.

## Revisit when

- The trail's resolver changes how it treats `data-vg-destination` (a tag that only adds, never hides, would allow tagging the real portlets).
- The crawler records portlet instance ids (phase 2c): drop the title tie-break if it no longer decides anything.
- A demo keeps Pocket items across languages on pages like the bundles page: ids need a key Vodafone gives both languages (O26).
- The layer moves to Vodafone's tag manager (Mode A): the site key reaches the layer another way than the demo browser's `data-aixc-site-key`.
