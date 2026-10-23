# Site knowledge standard 0.1

What a site offers to a voice guide, in one JSON document per site version: which pages exist in which languages, what people ask for and where it is on the page, which items can be compared, which journeys exist, what pictures show, and which buttons commit the person. Decisions: ADR-0011 (standard), ADR-0012 (how it is built), ADR-0013 (visuals). Schema: `kb-standard.schema.json` (generated from `packages/kb/src/manifest.ts` by `node tools/kb/export-schema.ts`).

## Shape

```json
{
  "standard": "site-knowledge/0.1",
  "site": { "id": "demo-telco", "name": { "ar": "ديمو تيلكو", "en": "Demo Telco" }, "origins": ["http://localhost:4401", "http://localhost:4402"], "languages": ["ar", "en"], "defaultLanguage": "ar" },
  "version": { "id": "20261023-021650-553745", "createdAt": "…", "hash": "553745…", "crawl": { "id": "crawl-…", "pages": 14 } },
  "pages": [ … ],
  "destinations": [ … ],
  "collections": [ … ],
  "flows": [ … ],
  "visuals": [ … ],
  "lexicon": { "synonyms": [ … ], "intents": { … } }
}
```

Text that people read or say is always per language: `{ "ar": "…", "en": "…" }`. Lists of labels or examples are per language too.

## Sections

| Section | One entry is | Key fields |
|---|---|---|
| `pages` | a page, with one URL and title per language | `id`, `kind` (content, listing, checkout, account, login, help), `variants`, `requiresAuth` |
| `destinations` | something people ask for | `id`, `pageId`, `kind` (page, section, item, action, visual, collection, faq), `target`, `labels`, `examples`, `description`, `reveal`, `answer`, `watchable`, `commit`, `collectionId`, `visualId`, `flows`, `priority` |
| `collections` | repeating items with comparable fields | `itemCss`, `keyAttr`, `nameField`, `fields` (each with `css` relative to the item and a `type`: text, number, money, data) |
| `flows` | a known journey, bound to an item | `labels`, `examples`, `appliesTo.collectionIds`, `steps` (click, navigate, waitForPage, spotlight, say, confirm) |
| `visuals` | an image, canvas, SVG, WebGL or video | `kind`, `target`, `description` per language, `source` (metadata, vision, curated), `confidence` |
| `lexicon` | how people talk about the site | `synonyms` (groups across languages and dialects), `intents` (extra phrases per intent) |

Every destination, page and collection carries `provenance`: `auto` (crawler), `curated` (overlay), or `merged`.

## Targets

A target says where something is, with fallbacks:

```json
{ "css": ["#tab-home", "button[aria-controls=\"home-internet\"]", "#bundle-tabs > div > button:nth-of-type(2)"],
  "text": { "ar": "الإنترنت المنزلي", "en": "Home internet" },
  "role": "tab",
  "within": "item" }
```

- `css`: most stable first (id, then a stable attribute, then a short path).
- `text`: visible text per language, used only when no selector matches anything.
- `within: "item"`: the selectors are relative to the item a plan picked.

## Rules that keep it safe and fresh

1. **Values are never stored.** Prices, data amounts and balances are read from the live page when the guide answers. The manifest stores where they are (`answer.fields`, collection `fields`) and how to say them (`answer.template`, e.g. `"You have {remaining} left of {allowance}."`).
2. **Commit points are marked** (`commit: true`). A guide reading this standard must never press them. Flows that lead to one end with a `confirm` step.
3. **Ids are stable across crawls** when the markup is: they come from page paths and element ids (`web.bundles.home-internet`), and item ids from their key attribute (`…mobile-internet.mi-10`).
4. **A version is immutable.** A new crawl with the same content has the same hash and is not published again.

## Page annotations (optional)

A site that controls its HTML can state facts directly. Version 0.1 reads:

| Attribute | On | Meaning |
|---|---|---|
| `data-kb-commit` | a button | Commit point, whatever its text. |
| `data-kb-watch` | a section | The section can be watched. |
| `data-kb-describe-ar`, `data-kb-describe-en`, … | an image, canvas, SVG | The description to read aloud; beats vision and markup. |
| `data-kb-destination="<name>"` | any element | Used as a stable locator. |

## Validation

`validateManifest()` (in `packages/kb`) checks the schema, then integrity: unique ids, known references (pages, collections, flows, visuals), URLs inside the site's origins, a default language that is in `languages`, collections whose name field exists. Errors block publishing; warnings (missing labels for a language, low-confidence visual descriptions, a flow that ends with a click) go to the ingest report.

## Mapping to other formats

| Format | How |
|---|---|
| WebMCP tool declarations | One tool per flow (`subscribe`, with an item argument) and a `navigate` tool whose argument is a destination id. |
| llms.txt | Pages and their titles per language. |
| schema.org | Collections with money fields map to `Offer` items. |
