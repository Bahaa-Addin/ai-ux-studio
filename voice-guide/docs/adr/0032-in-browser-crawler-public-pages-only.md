# ADR-0032: Crawl the live site from a real browser tab when the crawl host can't reach it; public pages only

- Status: Accepted (2026-10-23 crawl)
- Date: 2026-10-23
- Area: Ingestion; complements ADR-0012 (Playwright crawler) and ADR-0028 (live sync)
- Code: `tools/live-crawl/browser-crawler.ts`, `tools/live-crawl/bundle.ts`, `tools/live-crawl/extract-entry.ts`, `tools/live-crawl/import.ts`, `jobs/crawler/url.ts`, `jobs/crawler/robots.ts`

## Context

The build sandbox cannot reach `web.vodafone.com.eg`. The owner asked to crawl the live site **now, public pages only, without a logged-in account**. The only machine available to us that can reach the site is the owner's browser (the Claude desktop app's browser pane). The Playwright crawler and the KB builder already exist; their extraction function (`extractPage`) is plain DOM code.

## Decision

1. **Same extraction, different driver.** The in-browser crawler is a bundle injected into one tab of the site. It loads each same-origin page into an off-screen iframe, which `X-Frame-Options: SAMEORIGIN` allows, and runs the crawler's own `extractPage()` on that document. The output is the same `PageSnap` the Playwright crawler writes, so the KB builder is unchanged.
2. **Content pages without scripts.** CMS pages load in a sandboxed iframe without `allow-scripts`, which means no analytics hits, no cookie banner and no widgets. Their content is server-rendered. Paths matching `crawl.scriptsFor` (`^/spa/`) need Angular, so they are taken one at a time as the top document with the extractor kept in the origin's storage, then removed.
3. **Polite and public-only**, with the same rules as the Playwright crawler (`jobs/crawler/url.ts`, `robots.ts`):
   - one page at a time, 1s apart;
   - robots.txt honoured; depth ≤ 2 from the navigation seeds; the include and exclude patterns;
   - **`crawl.publicOnly: true`**: no cookies are set; pages with a password field or a login URL are skipped and listed; the tab is signed out;
   - stop on a 403, a 429 or a bot-challenge title.
4. **Export and import.** The tab's results are gzip-compressed, base64-encoded and read in slices (the browser bridge caps a result at about 250K characters), verified by SHA-256, and imported into a normal crawl folder (`data/crawls/<id>/crawl.json` plus `pages/*.html`). `npm run ingest -- --site vodafone-eg --from-crawl <dir>` builds from it.
5. **Scheduled crawling is paused.** `sync.schedule.enabled` is `false` by default and in `config/sites/vodafone-eg.yaml`; no code path starts a crawl on a timer while it is false. On-demand runs only. Page-watch checks are different: a person asks for each one, and they read a single section.

## What the 2026-10-23 crawl produced

| | |
|---|---|
| Content pages | 136 (71 English, 65 Arabic), depth ≤ 2 from 31 seeds, 0 blocked |
| App pages (`/spa/`) | 5 public: `storeLocator`, `vodafone-flex`, `faq`, `NetworkCoverageChecker`, `contact-us` |
| Redirects recorded | 16 CMS URLs that redirect into `/spa/` (for example `/en/faq` → `/spa/faq`, `/en/recharge1` → `/spa/recharge`) |
| Rendered HTML kept | 13 key pages plus the store locator, with the site's stylesheets and Vodafone fonts, for offline replay tests |
| Shop | Not crawled. The owner stopped the browser step on the shop, so it is out of this crawl. Shop links stay as navigation targets. |
| Login | None. No cookies; no signed-in pages. |

## Options considered

| Option | Outcome |
|---|---|
| Run the Playwright crawler on the owner's computer | The right tool, but needs a folder on that machine; access was not granted in this session. Kept for the next run (runbook). |
| Fetch pages with `fetch()` and `DOMParser` only | No layout, so visibility (hidden tabs, collapsed panels) can't be judged. Rejected. |
| Navigate the visible tab to every page | Slow, takes over the person's screen, and runs every page's analytics. Used only for the 5 app pages. |

## Consequences

- The knowledge base reflects the real site's public structure on 2026-10-23.
- The in-browser crawler is a fallback for environments like this one. The Playwright crawler (`npm run sync`) is the normal tool on a machine that can reach the site.
- Pictures were not screenshotted in the iframe crawl, so visual descriptions come from markup and the curated overlay until a Playwright run with a vision key.

## Revisit when

- The Playwright crawler runs from a machine on the internet: re-crawl with it and compare page counts.
- Vodafone approves scheduled crawling (PRD D3): set `sync.schedule.enabled: true` and record the approval here.
- The shop is needed in the knowledge base: crawl it with the Playwright crawler (its robots rules are already in `robots.ts`).

## Verified by

- `tests/unit/crawler-url.test.ts`: URL normalisation, scope, login-URL and challenge patterns.
- `tests/unit/robots.test.ts`: the live robots files of both origins.
- `tests/integration/sync.test.ts`: build, gate and activate from a saved crawl folder of real pages; schedule refusal; public-only forced.
- `tests/unit/vodafone-kb.test.ts`: the builder on the saved real pages.
