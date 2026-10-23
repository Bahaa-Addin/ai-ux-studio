# ADR-0012: Build the knowledge base by crawling the cloned pages in a real browser; publish immutable versions that go live only when activated

- Status: Accepted (demo slice)
- Date: 2026-10-22
- Area: Ingestion
- Related: ADR-0011 (standard), ADR-0013 (visuals), ADR-0004 (page watch hashing)

## Context

We already maintain cloned copies of the website and web app. They have the live site's markup, so selectors that work on them will work on the live site, and we can crawl them without bot protection or load on production. The consumer web app renders with JavaScript, so a static HTML fetch would miss most of it. A bad crawl (a broken clone, a redesign) must never silently change what the guide does on stage.

## Decision

1. **Source.** The crawler reads the clones by URL. `tools/site-server.ts` can serve clone folders locally and injects the SDK tag at serve time, so the clone files stay untouched. Hosted clones work the same way.
2. **Crawler.** Playwright Chromium, breadth-first from `crawl.start`, limited to the site's origins and `include`/`exclude` patterns, query strings and fragments dropped, cookies for the demo account preset. Per page it records sections, collections, visuals, actions, links, `hreflang` alternates and `data-kb-*` annotations (`jobs/crawler/extract.ts`), saves an HTML snapshot and element screenshots of visuals.
3. **Heuristics, in one place.** Collections are three or more same-shaped siblings with price or data text; fields are found by pattern and kept only if they resolve in 80% of items; the item key is the first unique `data-*` attribute. Hidden content gets reveal steps (tab, `<details>` summary, `aria-expanded` control). A submit button in a payment form or with a payment word is a commit point.
4. **Builder.** Pages are grouped into language variants through `hreflang`; sections, collections and visuals are paired across languages by their first CSS locator; items by their key. The curated overlay is merged last.
5. **Versions.** The manifest's content hash excludes timestamps, so an unchanged clone yields the same hash and nothing is published. A changed clone yields a new immutable version with a diff report (`data/reports/`). It goes live only with `--activate` (or the admin endpoint), after a person has read the report.
6. **Errors block, warnings inform.** Schema or reference errors stop publishing. Warnings (missing Arabic labels, low-confidence visual descriptions) go to the report for curation.

## Options considered

| Option | Outcome |
|---|---|
| Static HTML fetch and parse (as in ADR-0004) | Rejected for ingestion: misses JavaScript-rendered content, which is most of the web app. |
| Crawl the live site | Rejected for the demo; possible for the pilot behind an allowlisted crawler identity. Same code. |
| Auto-activate every crawl | Rejected. A broken clone would change answers on stage without anyone noticing. |
| Record paths by hand in a browser extension | Deferred. The overlay plus crawler covers the demo; a recorder that writes overlay entries is a good next tool. |

## Consequences

- Ingest takes a few seconds for the 14 fixture pages; a few hundred real pages will take minutes at concurrency 4, which is fine for an hourly or on-change schedule.
- Heuristics will misfire on some real markup; each misfire is fixed once in the overlay or in `extract.ts`, and the ingest report shows the effect.
- Snapshots and screenshots accumulate under `data/crawls/`; in the pilot they belong in object storage with a lifecycle rule.

## Pilot knobs

| Knob | Default | Effect |
|---|---|---|
| `crawl.start`, `include`, `exclude`, `maxPages`, `concurrency` | site config | Crawl scope and speed. |
| `crawl.cookies` | demo account | Signed-in pages of the web app (demo data only). |
| `crawl.collections.minItems` | 3 | Smaller values find more collections and more false ones. |
| `--activate` | off | Make the new version live immediately. |

## Revisit when

- The report's "added/removed" lists are long on every crawl: the clones' markup is unstable; pin selectors in the overlay or ask for `data-kb-*` annotations.
- Crawl time exceeds the refresh window: crawl changed pages only (sitemap `lastmod`, ETags), or raise concurrency.

## Verified by

- `tests/integration/ingest.test.ts`: crawls 14 fixture pages in Chromium into Postgres; checks pairing, collections, reveal steps, FAQ, commit point, visuals, overlay; an unchanged rerun publishes nothing; an edited clone produces a new, inactive version with a diff.
