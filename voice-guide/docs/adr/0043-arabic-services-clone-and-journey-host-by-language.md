# ADR-0043: An Arabic Services clone at /ar/services, and the journey's host page follows the page's language

- Status: Accepted for the prototype (2026-11-05); §2 (the host page chosen by language, `{lang}` in `trail.hostUrl`) superseded by [ADR-0050](0050-trail-host-interface-v2.md) §3, built in step S10 (2026-11-14); the Arabic clone and the Arabic Services page (§1, §3) stay true
- Date: 2026-11-05
- Area: UI, demo; amends ADR-0040 (one English host page)
- Spec: [SPEC-06](../specs/SPEC-06-exploration-trail.md) §3a
- Owner decision: 2026-11-05, "Arabic Services clone: yes, build it; refresh the capture first"

## Context

ADR-0040 hosted the journey in the Pocket of one page, the English Services clone. After Arabic pages the journey jumped to an English page and spoke English, and the guide had no Arabic page to point at with the Pocket and "Reimagine this page". ADR-0040's "Revisit when" named this case: mount an Arabic clone at `/ar/services` and choose `hostUrl` by language.

## Decision

1. **The Arabic page is the same clone in Arabic.** `vodafone-services-clone/ar/index.html` (`lang="ar" dir="rtl"`) runs the same app with `src/content/vodafone-services-ar.js`: the English model's sections, items, ids and images, with the copy and links of the live `/ar/services` page, captured 2026-11-05 (public, robots.txt allows it). Every Arabic picture was compared with the English clone's file and is pixel-identical, so the files are shared. The clone's own UI copy (Pocket, Reimagine) comes from `src/i18n.js`, keyed by the English text, so the English page cannot change. Vodafone's Arabic faces (GE SS Two, `vodafone-*-ar.woff`) are registered under the English family names with an Arabic `unicode-range`, as web.vodafone.com.eg does.
2. **`trail.hostUrl` may contain `{lang}`.** The trail replaces it with the page's language (`ar`, `en`). Vodafone's is `https://web.vodafone.com.eg/{lang}/services#journey`. A host URL without `{lang}` behaves as before. *(Superseded 2026-11-14 by [ADR-0050](0050-trail-host-interface-v2.md) §3, built in step S10: `trail.hostUrl` and its `{lang}` code are gone and the pill never navigates. On every page the experience layer runs on, the journey is drawn in place, in the layer's Pocket, opening on the page the person is on (the layer claims it at run time). The clone's static meta keeps `/en/services` and `/ar/services` their own host until phase 9. Where nothing hosts the journey (the `/spa/` app, the e-shop, `?aixc=off`, the layer off or failed) the guide's own sheet opens (ADR-0038; owner, 2026-11-13), so no pill is ever dead.)*
3. **The demo mounts both pages.** In replay, `npm run demo:trail` serves the clone at `/en/services` and `/ar/services` (`tools/demo-browser.ts` `clone.pages`). The Arabic page carries `<meta name="vg-trail-host" content="pocket">` and the same `data-vg-destination` markers, so spotlights, explored items and chips work there as on the English page.

## Consequences

- After Arabic pages the journey opens in the Arabic Pocket and speaks Arabic. This replaces ADR-0040's "the journey speaks English even after Arabic pages". *(Since step S10 it opens in place, on the Arabic page the person is on, not on `/ar/services`: ADR-0050.)*
- Two pages to keep in step. `tests/content-ar.test.mjs` fails if the Arabic model's sections, ids or images drift from the English one, or if a link points to `/en/`.
- **Not translated yet (O17):** each of the 13 experiences has its own microcopy, which stays English on the Arabic page. Measured 2026-11-05: 15 to 45 English words per experience, mostly screen-reader labels ("Next", "Previous", "opens in a new tab") plus a few visible hints ("Scroll", "Drag", "Skip intro", "Contents", "Overview"). Gemini's error texts are English too. The content (titles, descriptions, links), the composer, the Pocket and the shell are Arabic.
- `trail.js` grew by a few bytes. `guide.js` is unchanged (20,401 bytes gzipped).
- Tests: `tests/e2e/pocket-journey.e2e.test.ts` "Arabic: the pill on an Arabic page opens the journey in the Arabic Pocket" (the pill on `/ar/vodafone-cash` goes to `/ar/services#journey`; right to left; Arabic copy; destinations present); `vodafone-services-clone/tests/e2e/arabic_e2e.py` (71 checks: the page, fonts, shell, right-to-left carousels, the Pocket, all 13 experiences at 1366, 390 and 320 px). *(Step S10 removes the trip to `/ar/services#journey` that the first test asserts, and replaces that test with one that opens the journey in place on an Arabic page, ADR-0050.)*

## Pilot knobs

- `trail.hostUrl` per site, with or without `{lang}`. *(Gone from step S10, ADR-0050.)*
- The Arabic copy of the clone's own UI: `vodafone-services-clone/src/i18n.js`.

## Revisit when

- Vodafone hosts the Pocket on its own pages: `hostUrl` points there, per language. *(Moot since step S10: there is no `hostUrl`; the experience layer's Pocket hosts the journey on Vodafone's pages, ADR-0050.)*
- A third language is added: `{lang}` keeps working if the host page exists at that path. Otherwise the host URL needs a per-language table. *(Moot since step S10: there is no host URL, ADR-0050.)*
- The live Arabic page changes: capture it again, and run `tests/content-ar.test.mjs` and `arabic_e2e.py`.
