# ADR-0011: A site knowledge standard (v0.1) describes what people can ask for, independent of any one model or agent

- Status: Accepted (demo slice)
- Date: 2026-10-22
- Area: Knowledge base
- Spec: `docs/kb-standard.md`; JSON Schema: `docs/kb-standard.schema.json` (generated from `packages/kb/src/manifest.ts`)

## Context

The guide needs to know, for each site: which pages exist in which languages, what people ask for and where it is on the page, which items can be compared (cheapest bundle), which journeys exist (subscribe), what images and charts show, and which buttons commit the user. page-agent works without any of this, which is why every step costs an LLM call. We want this knowledge as a reusable, versioned asset that the router, the planner, page watch and future channels can all read.

## Decision

1. **One JSON manifest per site version**, validated by a schema, with these sections:
   - `site`: id, names, allowed origins, languages, default language
   - `pages`: one entry per page, with a variant (URL and title) per language, linked through `hreflang`
   - `destinations`: what people ask for: a page, section, item, action, visual, collection or FAQ answer; with labels and example requests per language, a target, reveal steps, an answer template, and the `watchable` and `commit` flags
   - `collections`: repeating items with typed fields (money, data, text), so "cheapest" and "most data" are computed on the live page
   - `flows`: known journeys bound to a collection item, ending at a `confirm` step before any commit
   - `visuals`: images, canvas, SVG and WebGL with descriptions per language and where the description came from
   - `lexicon`: synonym groups across languages and dialects, plus extra intent phrases
2. **Targets are multi-locator**: several CSS selectors (most stable first) plus visible text per language as a last resort. A target can be relative to a collection item.
3. **Values are never cached.** Prices and balances are read from the live page at answer time through `answer` templates and collection fields. The manifest stores where, not what.
4. **Every entry records its provenance** (`auto` from the crawler, `curated` from the overlay, `merged`), so curation work is visible and auto entries can be regenerated safely.
5. **Optional page annotations** let a site that controls its code state facts in its HTML. Version 0.1 reads three: `data-kb-commit` (a commit point), `data-kb-watch` (a watchable section) and `data-kb-describe-<lang>` (a visual's description, which beats every other source); `data-kb-destination` is used as a stable locator. Our clones do not need them: the curated overlay states the same facts without touching the pages.
6. **The standard is ours, versioned (`standard: "site-knowledge/0.1"`) and model-agnostic.** Destinations and flows map one-to-one to WebMCP tool declarations if we later expose them to browser agents.

## Options considered

| Option | Outcome |
|---|---|
| No knowledge base: page-agent reads each page live | Rejected as the main path (cost, latency, predictability); kept as the fallback. |
| A vector index of page text (RAG) | Rejected as the core. It answers "what does the site say" but not "where do I click". Retrieval over labels is part of the router (ADR-0014). |
| llms.txt | Too coarse: a page list with descriptions, no targets, flows or commit points. The crawler can emit one from the manifest. |
| schema.org markup | Describes products for search engines, not page locations or journeys. The crawler can read it as a hint later. |
| WebMCP declarations as the source of truth | Not yet: needs site code changes and is still in an origin trial. |

## Consequences

- Curation becomes a real task: someone owns the overlay file per site (labels, Egyptian Arabic phrasings, flows, commit points).
- Any consumer (router, planner, page watch, analytics) can use the same manifest.
- The schema will change; `standard` carries the version and the KB builder refuses manifests it does not understand.

## Pilot knobs

| Knob | Where | Effect |
|---|---|---|
| Curated overlay | `config/curated/<site>.yaml` | Labels, examples, synonyms, flows, commit points, visual descriptions. |
| `crawl.collections.minItems` | `config/sites/<site>.yaml` | How many similar siblings make a collection (default 3). |
| `languages` | site config | Every destination is checked for labels or examples in each of these languages; gaps become ingest-report warnings. |

## Revisit when

- Integrity warnings in the ingest report keep growing between crawls: the clones' markup drifts; invest in annotations or curated selectors.
- A second consumer needs fields we do not have (for example opening hours for a store locator): add them in 0.2 with a migration in the KB builder.

## Verified by

- `tests/unit/kb.test.ts`: schema and integrity rules, including commit and reference errors.
- `tests/integration/ingest.test.ts`: the fixture site crawls into a valid manifest.
