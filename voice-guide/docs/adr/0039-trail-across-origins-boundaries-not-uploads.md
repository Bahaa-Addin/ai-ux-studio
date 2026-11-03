# ADR-0039: Across origins the trail shows boundaries; it does not upload replays

- Status: Accepted for the prototype (2026-11-03)
- Date: 2026-11-03
- Area: Session continuity, privacy; relates to ADR-0016 (sessions across pages and origins)
- Spec: [SPEC-06](../specs/SPEC-06-exploration-trail.md) §6

## Context

Vodafone's journey crosses origins: `web.vodafone.com.eg` (CMS and `/spa/`) and `eshop.vodafone.com.eg`. The guide already keeps one conversation across them with a single-use handoff token (ADR-0016). A browser origin cannot read another origin's IndexedDB, so a replay recorded on the shop cannot be shown on the website, and the other way round.

## Decision

1. **Same-origin journeys are fully supported**: CMS pages, the `/spa/` app (route changes are steps, ADR-0030) and back/forward.
2. **Leaving the origin creates a boundary step** ("You went to the shop"), with the knowledge page id and title when the target is a known page, otherwise the destination host only. No path, no query, no replay. When the person comes back in the same tab, the journey continues (the tab's `sessionStorage` keeps the journey id per origin).
3. On another origin that also runs the guide with the trail enabled, the person gets a **separate** local journey with its own consent (consent is per origin, because storage is).
4. The guide's existing handoff carries **no trail data**: no journey id, no step, no replay reference.
5. **No raw replay leaves the browser** to make cross-origin continuity work. A future shared replay (a backend that stores encrypted chunks, or a first-party domain that hosts both properties) is a separate privacy and architecture decision that needs explicit approval (D2) and its own ADR.

## What can and cannot be replayed

| Journey | Timeline | Preview | Explored items and questions |
|---|---|---|---|
| CMS → CMS, CMS ↔ `/spa/` (same origin) | Yes, one step per page or route | Yes | Yes |
| Website → shop | Boundary step on the website's trail | No (shop pages are on the shop's own trail, if enabled there) | Website steps only |
| Shop → website (back) | The website journey continues | Website steps only | Website steps only |
| Any page → sign-in, account, checkout | Boundary step "A private page" | No | No |

## Consequences

- The website and the shop show two partial journeys rather than one. This is honest and private by construction.
- Merging them later means either a single origin for both properties or a server-side store, both of which change the privacy story and need D2.

## Revisit when

- Vodafone serves the shop and the website from one origin (or adopts a first-party storage-access arrangement): one journey becomes possible without any upload.
- Approval exists for an encrypted, user-held cross-origin store: write the ADR that replaces this one.
