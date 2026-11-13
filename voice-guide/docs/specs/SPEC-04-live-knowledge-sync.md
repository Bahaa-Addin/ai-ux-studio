# SPEC-04: Keeping the knowledge base in step with the live Vodafone site

- Status: Ready to build
- Requirement: PRD R3 (the knowledge base is updated from the live Vodafone website)
- Decision: [ADR-0028](../adr/0028-live-knowledge-sync.md); builds on ADR-0011 (standard), ADR-0012 (ingestion), ADR-0013 (visuals)
- Facts: [live site audit](../reference/vodafone-live-site-audit.md) §6–§9
- Diagram: [live KB sync](../diagrams/05-live-kb-sync.md)

## 1. What "up to date" means

| Kind of knowledge | Where it lives | How fresh |
|---|---|---|
| Values: prices, data amounts, balances, dates | **Read from the live page when the guide answers** (ADR-0011). Public prices and stock also stay in the knowledge base as dated guide points, to find places, never said or shown (ADR-0059, 2026-11-13); balances are never stored | The answer is always current; guide points are as of the last sync |
| Structure: pages, sections, tabs, cards, flows, selectors | Knowledge base version | Changed pages picked up within **3 hours** of their sitemap `lastmod` (target), plus the CDN cache (up to 4 hours, audit §2) |
| Words: labels, examples, synonyms, picture descriptions | Crawl plus curated overlay | Same as structure; curated words change only by human edit |
| New pages, removed pages | Sitemaps plus navigation | Next incremental run |

Because values are always read live, a stale knowledge base can point to the wrong place but can never quote a wrong price (a stale guide point can at worst send someone to the wrong card, where the live read still tells the truth). The sync exists to keep **where things are** right.

## 2. Crawl scope

| Source | Use |
|---|---|
| **Seeds**: the navigation pages in audit §8, in both languages (`crawl.start` in `config/sites/vodafone-eg.yaml`, 31 URLs) | Always crawled; the demo's core |
| **Links found from the seeds**, depth ≤ 2, inside `include` and outside `exclude` | **The only discovery path.** A page nobody links to is not a place to guide people. |
| `https://web.vodafone.com.eg/site-a/sitemap-en.xml` and `-ar.xml` | **`lastmod` for pages already in scope**, and a report of sitemap pages that are linked but new. Not a discovery source. |
| Shop: `https://eshop.vodafone.com.eg/en/` and `/ar/`, category list pages | Discovery from the shop's own navigation; honour its `robots.txt` (no cart, checkout, wishlist, register, account, variant queries) |

Why the sitemap is not a discovery source (measured on 2026-10-23 with the starter config's filters): of 1,021 English and 1,068 Arabic sitemap URLs, **676 and 696 still pass** the include and exclude patterns. Most are old campaign landings and article series that no menu links to (`ezayak-*`, `cashpromo`, `xtest`, `empty-page-with-new-theme`). Patterns cannot separate them from live pages; links from the navigation can.

**Exclude**: the patterns live in `config/sites/vodafone-eg.yaml` (`crawl.exclude`), with comments saying which audit finding each one comes from: test and hidden pages, `-old`/`_rd`/`-bkp` copies, nudges, numeric slugs, terms pages, the news archive, article series, ESG pages, the shop's disallowed paths, and the logged-in `/spa/` views. Patterns match the full URL and are case-sensitive (JavaScript `RegExp` without flags). Terms pages may be added back per page through the overlay if a demo needs them.

Expected size: the seeds plus their links, likely 150–300 pages per language. This is an estimate; the first dry run measures it (T-201).

## 3. Rendering and extraction changes

The crawler already renders pages in Chromium (ADR-0012). Changes for the live site:

1. **Language from the path**, not from `lang`: `/ar/…` is Arabic, `/en/…` English. Arabic pages say `lang="ar-SA"` (audit §6).
2. **Pair languages by path** when there is no `hreflang`: `/en/<slug>` ↔ `/ar/<slug>`, and `/spa/<route>` is one page with both languages (the app switches language itself; record `languages: [ar, en]` with one URL). Change: `jobs/kb-builder/build.ts`, the "group pages by hreflang alternates" step falls back to path pairing.
3. **Final URL after redirects** is the page URL; the requested URL becomes an alias.
4. **Ignore third-party overlays** in extraction: `#onetrust-*`, `.onetrust-pc-dark-filter`, `accessibility-widget`, `#vodafone-aw-icon`, and the Tealium and Dynatrace nodes.
5. **SPA pages**: wait for `<app-root>` to have children and for 300ms without mutations before extracting.
6. **Tabs**: Bootstrap `a.nav-link[href^="#"][aria-controls]`. Visible means the `.active` class or the panel's own `.active.show`, **not** `aria-selected` (always `true` on this site, audit §9). Icon-only tabs take their label from the panel's heading, the icon's `alt` or `title`, or the visual describer.
7. **Cards**: `.card-subscription` is a collection (data amount, price in EGP, subscribe link). The existing collection detector should find it; the overlay names its fields if it does not.
8. **Pictures with text** (hero banners): send to the describer (ADR-0013); cache by image hash so unchanged banners are not described again.

## 4. Politeness and permission

- **Written approval from Vodafone** for an automated crawl of production, and the crawler's egress IP on their bot-management allowlist, before the first scheduled run (PRD dependency D3). Until then, run only manually, off-peak, at low rate.
- User agent: `VodafoneEG-VoiceGuide-Crawler/0.1 (+<contact email from site config>)`.
- At most **2 concurrent pages per origin** and **1 navigation per second per origin**; back off exponentially on 429 or 503 and honour `Retry-After`.
- **Stop the run** and alert if more than 5% of pages return 403, a challenge page, or a CAPTCHA. Never try to get past bot protection.
- Signed out by default. The signed-in demo account is used only for `/spa/` page **structure**, never stores values, and runs through the same masking as the agent (ADR-0018).
- `robots.txt` is fetched at the start of every run and honoured for both origins.

## 5. Schedule and pipeline

| Run | When (Africa/Cairo) | What |
|---|---|---|
| Incremental | Every 2 hours, 07:00–23:00 | Fetch both sitemaps; recrawl URLs whose `lastmod` is newer than the stored one; always recrawl "volatile" seeds (home, promotions, bundles pages) |
| Full | Daily at 03:00 | All seeds and all in-scope sitemap URLs |
| On demand | `npm run sync -- --site vodafone-eg [--full] [--url <url>]` | For curation and before a demo |

Pipeline per run (diagram 05):

1. **Plan**: robots, sitemaps, seeds → list of URLs to fetch.
2. **Crawl**: render and extract (§3). Unchanged pages are skipped by content hash.
3. **Describe**: new or changed pictures only.
4. **Build**: merge the new pages with the unchanged pages from the active version, apply the curated overlay, validate (ADR-0011 integrity rules).
5. **Diff** against the active version: pages added, removed, changed; destinations added, removed, re-targeted; collections whose field selectors changed.
6. **Gate** (all must pass to activate automatically):
   - 0 integrity errors;
   - every seed page still present;
   - destination churn ≤ 15% of the active version's destinations;
   - the router evaluation set (`tests/fixtures/vodafone-utterances.yaml`) scores no more than 2 points below the active version;
   - a smoke replay of the demo script's plans in a headless browser finds every target.
7. **Activate** (the store's existing active-version pointer, used by `getActiveKbId`) or **hold** for review with the report. New: activation sends a Postgres `NOTIFY kb_activated` and the knowledge service reloads on it; sessions in the middle of a plan keep the version they started with (it is recorded in the plan).
8. **Report**: Markdown and JSON in `data/reports/`, plus a `kb.sync` trace event with counts and timings.
9. **Keep** the last 10 versions; `npm run kb -- --site vodafone-eg --rollback <versionId>` re-activates one.

The runner is a new job, `jobs/sync.ts`, started by the watch service's scheduler (one scheduler per deployment, ADR-0023) or by an external cron calling `POST /admin/sync`.

## 6. Configuration (site config additions)

```yaml
crawl:
  seeds: [...]                 # replaces `start` for live sites; `start` stays as an alias
  sitemaps:
    - https://web.vodafone.com.eg/site-a/sitemap-en.xml
    - https://web.vodafone.com.eg/site-a/sitemap-ar.xml
  respectRobots: true
  userAgent: VodafoneEG-VoiceGuide-Crawler/0.1 (+mailto:...)
  rate: { perOriginConcurrency: 2, perOriginPerSecond: 1 }
  languageFrom: path           # path | lang-attribute
  pairLanguagesBy: path        # path | hreflang
  ignoreSelectors: ['#onetrust-banner-sdk', '#onetrust-consent-sdk', '.onetrust-pc-dark-filter', 'accessibility-widget', '#vodafone-aw-icon']
sync:
  incremental: { everyMinutes: 120, window: '07:00-23:00' }
  full: { at: '03:00' }
  timezone: Africa/Cairo
  volatile: ['^/(en|ar)/(home|promotions|mobile-internet-bundles)$']
  gate: { maxDestinationChurn: 0.15, maxEvalDrop: 0.02 }
  keepVersions: 10
```

These fields are added to the `SiteConfig` schema in `services/shared/config.ts` with the defaults above (task T-201).

## 7. Acceptance criteria

1. A full run on the live site completes within 45 minutes at the configured rate and produces a valid manifest with 0 integrity errors.
2. Every page in audit §8 is in the manifest in both languages (the shop pages and `/spa/` pages with their own URL rules).
3. `/en/mobile-internet-bundles` and `/ar/mobile-internet-bundles` are one page with two variants; its tabs and the `.card-subscription` collection are destinations; the hero picture has a description in both languages.
4. Changing nothing on the site and running incremental twice produces **no new version** (same hash).
5. Given a recorded change (fixture: a seed page with one card added and one tab renamed), the diff lists exactly those changes and the gate activates it; given a fixture with 30% of destinations removed, the gate holds it.
6. The crawler makes no request to a disallowed shop path (network log assertion) and never exceeds the rate limits (timestamps assertion).
7. A 403 storm fixture stops the run and raises an alert.
