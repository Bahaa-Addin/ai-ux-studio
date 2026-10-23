# ADR-0028: Keep the knowledge base in step with the live site: seeds plus sitemap lastmod, polite crawling, path-based language pairing, and gated automatic activation

- Status: Proposed (Vodafone live phase). Accept when SPEC-04 acceptance criteria 1–7 pass.
- Date: 2026-10-23
- Area: Ingestion; extends ADR-0012 (which kept activation manual)
- Spec: [SPEC-04](../specs/SPEC-04-live-knowledge-sync.md)

## Context

The knowledge base must follow the live Vodafone website. From the audit:
- Both sitemaps give `lastmod` for every URL (1,021 English, 1,068 Arabic), but they also list test, legacy and hidden pages.
- There is no `hreflang`, and Arabic pages say `lang="ar-SA"`.
- `/spa/` pages render client-side.
- The shop's `robots.txt` blocks cart, checkout and account paths.
- CMS pages are cached for up to 4 hours.

Values are already read live (ADR-0011), so freshness matters for **where things are**, not for prices.

## Decision

1. **Scope** = navigation seeds and the pages linked from them (depth ≤ 2), plus the shop's category pages, minus an exclude list for test and legacy pages. **The sitemap is not a discovery source**: with the exclude patterns applied, 676 English and 696 Arabic sitemap URLs still pass, most of them unlinked old landings. The sitemap supplies `lastmod` for pages already in scope.
2. **Change detection** from sitemap `lastmod` every 2 hours (07:00–23:00 Cairo), a full crawl at 03:00, and content hashes to skip unchanged pages.
3. **Polite and permitted**: 2 pages at a time and 1 navigation per second per origin, `robots.txt` honoured, back off on 429 and 503, stop on bot challenges. Scheduled runs only after Vodafone's written approval.
4. **Language from the path, pairing by path** when `hreflang` is missing.
5. **Gated automatic activation**: activate only when there are 0 integrity errors, all seeds are present, churn is ≤ 15%, router evaluation drops ≤ 2 points, and a smoke replay of the demo plans finds every target. Otherwise hold the version for review. Keep 10 versions and allow rollback.
6. **Live reload**: activation notifies the knowledge service through Postgres `NOTIFY`; plans keep the version they started with.

## Options considered

| Option | Outcome |
|---|---|
| Manual activation only (ADR-0012) | Kept for holds; too slow as the only path for a live site. |
| Crawl everything in the sitemaps | Rejected: measured, the sitemaps hold about 1,000 URLs per language and patterns can only remove about a third; the rest are unlinked old pages that would pollute retrieval. |
| Full crawl every hour | Rejected: load on production for little gain; `lastmod` already tells us what changed. |
| Subscribe to Liferay publish events | Better, but needs Vodafone's CMS team; revisit for production. |

## Consequences

- New config fields (`crawl.seeds`, `sitemaps`, `rate`, `languageFrom`, `pairLanguagesBy`, `ignoreSelectors`, `sync.*`), a sync job, and a router evaluation set for Vodafone utterances.
- A human still reviews held versions; the report says why.
- Until the crawl approval exists, the demo uses on-demand runs.

## Pilot knobs

Everything under `sync:` and `crawl.rate` in the site config (SPEC-04 §6).

## Revisit when

- More than 1 in 10 runs is held by the gate: the threshold or the overlay is wrong.
- Vodafone offers CMS publish webhooks: switch to event-driven sync.
- `sdk.step ok=false` with a missing selector appears on a page within 24 hours of a sync: sync is too slow for that page; mark it volatile.

## Verified by (planned)

- `tests/integration/sync.test.ts` against recorded fixtures of the live pages (SPEC-04 acceptance 4–7).
- `tests/live/sync.live.test.ts` with `VG_LIVE=1` (acceptance 1–3).
