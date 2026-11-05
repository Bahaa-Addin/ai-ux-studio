# ADR-0043: An Arabic Services clone at /ar/services, and the journey's host page follows the page's language

- Status: Accepted for the prototype (2026-11-05)
- Date: 2026-11-05
- Area: UI, demo; amends ADR-0040 (one English host page)
- Spec: [SPEC-06](../specs/SPEC-06-exploration-trail.md) §3a
- Owner decision: 2026-11-05, "Arabic Services clone: yes, build it; refresh the capture first"

## Context

ADR-0040 hosted the journey in the Pocket of one page, the English Services clone. After Arabic pages the journey jumped to an English page and spoke English, and the guide had no Arabic page to point at with the Pocket and "Reimagine this page". ADR-0040's "Revisit when" named this case: mount an Arabic clone at `/ar/services` and choose `hostUrl` by language.

## Decision

1. **The Arabic page is the same clone in Arabic.** `vodafone-services-clone/ar/index.html` (`lang="ar" dir="rtl"`) runs the same app with `src/content/vodafone-services-ar.js`: the English model's sections, items, ids and images, with the copy and links of the live `/ar/services` page, captured 2026-11-05 (public, robots.txt allows it). Every Arabic picture was compared with the English clone's file and is pixel-identical, so the files are shared. The clone's own UI copy (Pocket, Reimagine) comes from `src/i18n.js`, keyed by the English text, so the English page cannot change. Vodafone's Arabic faces (GE SS Two, `vodafone-*-ar.woff`) are registered under the English family names with an Arabic `unicode-range`, as web.vodafone.com.eg does.
2. **`trail.hostUrl` may contain `{lang}`.** The trail replaces it with the page's language (`ar`, `en`). Vodafone's is `https://web.vodafone.com.eg/{lang}/services#journey`. A host URL without `{lang}` behaves as before.
3. **The demo mounts both pages.** In replay, `npm run demo:trail` serves the clone at `/en/services` and `/ar/services` (`tools/demo-browser.ts` `clone.pages`). The Arabic page carries `<meta name="vg-trail-host" content="pocket">` and the same `data-vg-destination` markers, so spotlights, explored items and chips work there as on the English page.

## Consequences

- After Arabic pages the journey opens in the Arabic Pocket and speaks Arabic. This replaces ADR-0040's "the journey speaks English even after Arabic pages".
- Two pages to keep in step. `tests/content-ar.test.mjs` fails if the Arabic model's sections, ids or images drift from the English one, or if a link points to `/en/`.
- **Not translated yet (O17):** each of the 13 experiences has its own microcopy, which stays English on the Arabic page. Measured 2026-11-05: 15 to 45 English words per experience, mostly screen-reader labels ("Next", "Previous", "opens in a new tab") plus a few visible hints ("Scroll", "Drag", "Skip intro", "Contents", "Overview"). Gemini's error texts are English too. The content (titles, descriptions, links), the composer, the Pocket and the shell are Arabic.
- `trail.js` grew by a few bytes. `guide.js` is unchanged (20,401 bytes gzipped).
- Tests: `tests/e2e/pocket-journey.e2e.test.ts` "Arabic: the pill on an Arabic page opens the journey in the Arabic Pocket" (the pill on `/ar/vodafone-cash` goes to `/ar/services#journey`; right to left; Arabic copy; destinations present); `vodafone-services-clone/tests/e2e/arabic_e2e.py` (71 checks: the page, fonts, shell, right-to-left carousels, the Pocket, all 13 experiences at 1366, 390 and 320 px).

## Pilot knobs

- `trail.hostUrl` per site, with or without `{lang}`.
- The Arabic copy of the clone's own UI: `vodafone-services-clone/src/i18n.js`.

## Revisit when

- Vodafone hosts the Pocket on its own pages: `hostUrl` points there, per language.
- A third language is added: `{lang}` keeps working if the host page exists at that path. Otherwise the host URL needs a per-language table.
- The live Arabic page changes: capture it again, and run `tests/content-ar.test.mjs` and `arabic_e2e.py`.
