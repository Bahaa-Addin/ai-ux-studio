# ADR-0013: Understand images, canvas, SVG and WebGL at crawl time and serve the result as text

- Status: Accepted (demo slice)
- Date: 2026-10-22
- Area: Ingestion, visual understanding
- Related: ADR-0012

## Context

Banners often carry offers only in pixels; charts are drawn on canvas or WebGL; maps are SVG. An in-page agent that reads the DOM as text cannot see any of this. Taking a screenshot from inside the user's page needs a permission prompt (`getDisplayMedia`), and calling a vision model on every question is slow and expensive.

## Decision

1. The crawler screenshots every visual element (image, canvas, SVG, WebGL, video) larger than 80 × 40 px. A probe injected before page scripts records which context each canvas uses, so WebGL is told apart from 2D.
2. The describer produces a short description per language for each visual, choosing the first available source:
   - `data-kb-describe-<lang>` annotations (curated, confidence 1)
   - a vision model through an OpenAI-compatible chat API with image input, asked for JSON with every site language and a confidence
   - the markup: SVG `<title>`/`<desc>`/`<text>`, alt, aria labels, `figcaption`, the nearest heading, the page a banner links to
3. Vision results are **cached by image hash, model and languages**. An unchanged image is never described twice; a crawl has a cap on vision calls.
4. The builder stores descriptions in `visuals[]` with their source and confidence, adds a `visual` destination with generic words ("banner", "chart", "map" and Arabic equivalents), and flags low-confidence descriptions in the ingest report.
5. At runtime the guide spotlights the element and reads the stored description. No model call, no permission prompt.
6. Curated descriptions in the overlay always win.

## Options considered

| Option | Outcome |
|---|---|
| Screenshot in the user's browser and call a vision model live | Rejected: permission prompt, latency of seconds, cost per question, and the user's screen may hold personal data. |
| Draw the element to a canvas in-page (`toDataURL`) | Rejected as the main path: fails on cross-origin images and tainted canvases; still needs a live model call. |
| Ask the site for accessible alternatives | Encouraged, and used when present (markup source), but we cannot depend on it. |

## Consequences

- Descriptions are as fresh as the last crawl. A banner changed after the crawl is described wrongly until the next crawl; page watch on key banners can trigger a recrawl.
- Without a vision model configured, image-only banners only get "an image that links to Offers": honest, but weak. The fixture's hero banner shows exactly this warning in the ingest report.
- Vision cost is bounded by the number of distinct images, not by traffic.

## Pilot knobs

| Knob | Default | Effect |
|---|---|---|
| `VG_VISION_BASE_URL`, `VG_VISION_API_KEY`, `VG_VISION_MODEL` | unset | Enables the vision source. Any OpenAI-compatible endpoint with image input. |
| `maxVisionCalls` (describer option) | 200 per crawl | Cost cap. |
| Overlay `visuals[]` | none | Curated description for a visual, wins over everything. |

## Revisit when

- Users ask about visuals that change daily (live charts): describe those at request time through the agent proxy, with consent and a strict size limit.
- Vision descriptions are wrong more than about 1 in 10 on review: change model or prompt, and curate the important banners.

## Verified by

- `tests/integration/ingest.test.ts`: four visual kinds on the fixture site, a stand-in vision model, cache hits on the second run (no new calls).
- `tests/e2e/guide.e2e.test.ts`: "what does this banner say?" reads the stored description.
