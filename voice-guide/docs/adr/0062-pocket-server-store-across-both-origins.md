# ADR-0062: The Pocket is kept on our gateway, one Pocket across web.vodafone.com.eg and the e-shop, through a bridge frame from the gateway's own address

- Status: Proposed (2026-11-13). Built in step E15 of the e-shop plan (`docs/reference/eshop-plan-2026-11-13.md`) after an offline spike; switched off until the owner turns it on. Accepted after the owner's live smoke of the Pocket
- Date: 2026-11-13
- Area: the Pocket, gateway, storage, identity, privacy. Supersedes ADR-0051 §1 (one IndexedDB store in the visitor's browser per origin); amends ADR-0048 §4 (a new HTML route), ADR-0053 §1 (a loader option) and the live plan's §3.9 ("nothing new leaves the browser")
- Owner decisions: 2026-11-13, a server-side store on our gateway, one Pocket across both sites (chosen over a bridge with browser storage only, and over one Pocket per site)

## Context

Browsers keep storage per origin: a sticker kept on web.vodafone.com.eg is not visible on eshop.vodafone.com.eg. The two are one site (`vodafone.com.eg`), so a frame from either shares that site's storage partition. The Pocket's store interface (`experiences/src/pocket/store.js`) and the Pocket's store seam (ADR-0052) already allow another backend. Vodafone's page scripts (Tealium, Dynatrace) can read anything in the page's own DOM and storage.

## Decision

1. **Three identities stay apart.** The guide's tab session (ADR-0016) and the trail are unchanged. The Pocket has its own random 128-bit id, never joined with traces.
2. **The bridge frame.** `GET /sdk/aixc/bridge.html` and its script, served from the gateway with a strict policy (`default-src 'none'`, `frame-ancestors` the two Vodafone origins), are loaded in a hidden frame outside `vf-root`, marked `data-aixc`, invisible to assistive technology. Inside it, the existing IndexedDB store runs unchanged as the local copy, shared by tabs on both origins. The frame syncs with the gateway: `GET /v1/pocket`, `PUT` and `DELETE /v1/pocket/:key`, `DELETE /v1/pocket` to forget everything; the latest write wins by server revision, deletions are kept as markers, writes queue while offline.
3. **The page side** (`experiences/src/pocket/bridge-store.js`) offers the store interface over a MessageChannel with origin checks, so the Pocket does not change. The first open uploads that origin's local records once, through the same checks. If the frame or its storage is blocked, the local store is used and the album says "kept on this site only".
4. **The server** (`services/pocket/`, a handler map with Postgres tables and the memory store) keeps the id only as an HMAC, accepts requests from the frame's own origin only, and refuses a record that is not one, more than 200 records, a record over 4 KB, any text the personal-data mask would change, addresses off the two origins or Vodafone's picture paths, query keys not on an allowlist, and source pages that are not public. A Pocket unused for 30 days expires; "Empty pocket" deletes it on the server; traces keep counts only.
5. **Carriers:** the public gateway, the extension and Vodafone's tag manager get a loader option `bridge` set to the gateway's own address; the demo browser routes a made-up origin to the local gateway (an https page cannot frame localhost). The public gateway refuses `pocket.store: bridge` without limits, expiry, and Postgres or an explicit memory-only setting.
6. **An offline spike first:** synthetic pages under both real origins frame the routed bridge in offline replay; shared IndexedDB and BroadcastChannel are measured in Chromium and Firefox, with a partitioned, HttpOnly cookie on the gateway as the measured fallback.

## Consequences

- One album on both sites and in every tab, surviving the theme's storage clear.
- Stickers (Vodafone's public copy, dated, never personal data) now leave the visitor's browser for our gateway; AGENTS 4.3 says so (ADR-0059).
- Vodafone's own page scripts could still ask the frame for a visitor's stickers; they are Vodafone's public copy.
- Safari and WebKit may partition the frame differently: no guarantee there.

## Pilot knobs

- The limits (200 records, 4 KB), the 30-day expiry, the allowlisted query keys; whether public visitors get it or only the owner's demos first.

## Revisit when

- The spike's numbers come in (Chromium, Firefox).
- The layer moves to Vodafone's tag manager (Mode A).
- Customers (PRD D2): retention and notice wording.
