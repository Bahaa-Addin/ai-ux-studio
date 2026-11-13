# ADR-0048: The experience layer is delivered as `aixc.js` beside `guide.js`; the journey host is claimed at run time, never declared by the loader

- Status: Proposed (2026-11-10); Accepted when phase 1's checks of the live plan pass
- Date: 2026-11-10
- Area: delivery, build, gateway, site config, failure isolation; phase 1 of the live plan (`docs/handoff/live-demos-way2.md` at the repository root), under ADR-0046
- Amended: §3 by [ADR-0052](0052-pocket-on-vodafone-pages.md) (2026-11-13): a demo's CSS is minified at build time and put on the page once by the core's `ensureCss`; every demo chunk has a budget of its own; the asset plugin waits for the first chunk that needs it
- Owner decisions: 2026-11-10, ADRs are numbered in the order they are written, so this one takes 0048 and the trail host interface version 2 (asked questions, `seed()`, and the run-time host claim below) takes the next number

## Context

ADR-0046 runs the five demos on Vodafone's real pages as one experience layer beside the guide. Their modules now live in `experiences/` (moved from `vodafone-services-clone/` in phase 0). Measured and read on 2026-11-10 (`docs/reference/live-way2-code-map-2026-11-10.md`):

- `guide.js` has about 79 bytes of its gzip budget left on Linux (ADR-0041), so nothing of the layer can go in it.
- The demo browser adds one classic `<script>` per top-level document of an allowed origin, at `DOMContentLoaded` (`tools/demo-browser.ts`, `loaderScript`), and forwards `<origin>/__vg/**` to the gateway.
- The gateway serves SDK files at `/sdk/:file`, one path segment only (`services/shared/http.ts` compiles `:file` to `([^/]+)`).
- The modules share code (`make()`, `i18n.js`), so they need ES modules with code splitting, unlike the guide's separate IIFE chunks. esbuild 0.28.2 (spike, 2026-11-10) names dynamically imported modules after their file (`controller-UVXS36VQ.js`), shared code `chunk-<hash>.js`, and does **not** rewrite `new URL('./x.css', import.meta.url)`, which four modules use for on-demand styles and pictures.
- The trail decides once, when its controller is built, whether the page hosts the journey (`readonly hosted = !!document.querySelector('meta[name="vg-trail-host"]')`, `packages/sdk/src/trail/controller.ts`). A loader-added meta would make "Your journey" dispatch `vg:trail-open` to nobody whenever the layer is off, has failed or has no Pocket yet (phase 1 has none), and it would break the e2e tests that expect a trip to `hostUrl`.
- The site's origins include the eshop; `/spa/` pages are an Angular app with no `#main-content` (the saved `/spa/storeLocator`).
- zod drops unknown keys from the site config without a word, so an `experiences:` block without a schema would silently do nothing.

## Decision

1. **A second tag from the same loader.** After `guide.js`, the demo browser's loader adds `<script type="module" src="<origin>/__vg/sdk/aixc/aixc.js" data-aixc-demo="1">` when the site's `experiences.enabled` is on, the page is on the site's first (web) origin, its path matches `experiences.paths`, it has `#main-content`, it is not a page the clone already runs on (replay mounts), and the URL has no `aixc=off`. Mode A (Vodafone's tag manager) later adds the same two tags; nothing in the layer depends on the demo browser except `data-aixc-demo`.
2. **No trail-host meta from the loader.** The page becomes the journey's host only when the layer's Pocket has actually attached, through a run-time claim on the trail host interface (version 2, the next ADR), and gives it back if the layer stops. Until then "Your journey" behaves as today (`hostUrl` or the guide's own sheet). The clone's static meta stays valid until phase 9.
3. **Build.** `packages/sdk/build.ts` builds `experiences/src/host/index.js` as ES modules with splitting into `packages/sdk/dist/aixc/` (entry `aixc.js`, chunks `[name]-[hash].js`), CSS as text injected once by the layer, and writes `dist/aixc/manifest.json` (each file, its entry, its imports) for the size budgets. The step is skipped when the entry does not exist, so no other build depends on it. Asset references (`new URL(…, import.meta.url)`) get a build plugin when the first module that uses them is bundled (phase 3); the modules stay runnable unbundled for the clone until phase 9.
4. **Serving.** The gateway serves `GET /sdk/aixc/:file` (`.js` and `.js.map` only) from `dist/aixc/` with the same headers as `guide.js` (`text/javascript`, `Access-Control-Allow-Origin: *`, `no-store` outside production).
5. **Config.** The site config gains `experiences: { enabled, paths, demos }` with a schema (default off; `paths` are regular expressions on the path; `demos` switches each demo). `config/sites/vodafone-eg.yaml` turns it on for `/en/` and `/ar/` pages.
6. **The page is Vodafone's** (ADR-0046 §2). A `PageHost` maps the layer's regions onto the live DOM: `main` and `sourceRoot` are `#main-content`; `outputRoot` (`#experience-output`) and `viewbar` (`#aixc-viewbar`) are ours, inserted beside it, keeping the clone's ids so the modules' CSS (ADR-0044's tuck-in keys on `#experience-output`) works unchanged. Everything the layer adds carries `data-aixc` and `data-vg`.
7. **Failures stay ours.** Every entry point, event handler and `import()` of the layer runs through one guard. On an error it logs `[AIXC]`, runs the registered clean-ups (listeners, observers), removes every `[data-aixc]` node, the layer's styles and the loader's script tag for it, un-hides `#main-content` and removes the layer's tags, and stops. `?aixc=off`, `experiences.enabled: false` and the per-demo switches turn it off. A test-only hook (`window.__AIXC_TEST__`) throws at a named step, so the end-to-end test can show the page left as Vodafone served it.

## Consequences

- The layer reaches every allowed CMS page in both languages without touching `guide.js`.
- Phase 1 changes nothing visible: the layer finds the page, builds its regions (hidden) and waits; the checks are that it loads everywhere it should, nowhere it should not, shifts nothing and removes itself cleanly.
- The run-time claim costs a few bytes in `trail.js` (about 3.5 KB of room) and none in `guide.js`.
- The layer is a second script on every page with its own gzip budget, set from the first measured build a little above it (as ADR-0035 did). The budget counts the core and every chunk it imports statically (the browser loads them together), from `dist/aixc/manifest.json`.
- The layer keeps its own rules (`?aixc=off`, no `#main-content`, a second copy) even where no loader checks them first, as under the tag manager.

## Verified (2026-11-10, owner's Mac, saved pages of 2026-10-23)

- `tests/e2e/aixc-layer.e2e.test.ts`: ready on all 13 saved CMS pages in both languages with its regions hidden beside `#main-content`; not on `/spa/storeLocator` or with `?aixc=off`; the same geometry of Vodafone's page with the layer and without it on five pages; a failure at the start, after the regions or at the end leaves the page as without it, with no page error; the layer's own rules with the loader off. Breaking the guard's clean-up makes the failure test fail.
- `tests/unit/aixc-delivery.test.ts`: the loader's rules in a fake window; the settings from the site config.
- Core 1,791 bytes gzipped; `guide.js` unchanged.
- Not verified: the live site. On 2026-11-10 the first live page did not answer the demo browser within 45 s, in Playwright's Chromium and in Google Chrome (open issue O29). This ADR becomes Accepted when `tests/live/aixc-layer.live.test.ts` passes.
- Until phase 9 the clone's pages and the layer coexist in replay; the loader keeps them apart by path.

## Pilot knobs

- `experiences.enabled`, `experiences.paths`, `experiences.demos.*` (site config).
- `?aixc=off` and `?aixc-debug` (exposes `window.__aixc`).
- The core's gzip budget (`tests/unit/sdk-size.test.ts`).

## Revisit when

- The layer moves to Vodafone's tag manager (Mode A): loading order, OneTrust consent categories and caching need a fresh look.
- Vodafone's `/spa/` app needs the layer (no `#main-content` there).
- The trail host interface changes again.
