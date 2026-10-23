# ADR-0030: The SDK follows single-page-app route changes as page changes

- Status: Proposed (Vodafone live phase). Accept when SPEC-03 acceptance 3 and SPEC-05 acceptance 4 pass.
- Date: 2026-10-23
- Area: Session continuity; extends ADR-0016
- Specs: [SPEC-03 §2](../specs/SPEC-03-live-site-integration.md), [SPEC-05](../specs/SPEC-05-continuity-and-memory.md)

## Context

The demo build treats a new page as a new document: it saves the plan cursor before navigation and resumes on load. Vodafone's `/spa/` pages (`myHome`, `miManagement`, `storeLocator`, `vodafone-flex`, `search`) are one Angular app: moving between them changes the URL with `history.pushState`, with no load. Without route following, a plan step `waitForPage(/spa/miManagement)` would wait forever, and spotlights would point at elements of the previous view.

## Decision

1. Detect route changes with the Navigation API (`navigatesuccess`) where available, otherwise by wrapping `history.pushState` and `replaceState` (calling through unchanged) and listening to `popstate`.
2. After a route change, wait for the view to settle: 300ms without mutations under `<app-root>`, or the next step's target present, with a 6s timeout.
3. Re-identify the page, emit `sdk.route`, reset per-page UI state (spotlight, pointer, commit guard), keep the conversation and the guide's DOM, and resume the plan.
4. Route patterns for `/spa/` pages come from the knowledge base (`pages[].variants[].url` with `:param` segments).

## Consequences

- The SDK patches two history methods on production pages. The wrappers must be transparent: same arguments, same return value, same exceptions, and installed once.
- Plans can mix CMS, SPA and shop pages freely.

## Revisit when

- The Navigation API is available in all target browsers: drop the history wrappers.
- Angular's router stops using `pushState` (unlikely).

## Verified by (planned)

- `tests/e2e/spa-routes.e2e.test.ts` with a fixture Angular-like app (pushState routing) and `tests/live/…` on `/spa/` pages.
