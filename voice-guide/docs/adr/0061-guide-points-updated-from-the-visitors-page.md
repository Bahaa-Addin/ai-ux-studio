# ADR-0061: Guide points are updated in the background from what the visitor's own page shows, under rules against bad reports, and off by default

- Status: Proposed (2026-11-13). Built in step E12 of the e-shop plan (`docs/reference/eshop-plan-2026-11-13.md`), switched off; the owner turns it on. Accepted after it has run on the owner's own live demos
- Date: 2026-11-13
- Area: knowledge base, gateway, the guide's live reads, privacy; under ADR-0059; related to the live plan's page watch (phase 6, D1)
- Owner decisions: 2026-11-13, when the live page shows a price or stock different from the knowledge base, the knowledge base is updated in the background from the visitor's page: the guide already reads the live page in the browser, it sends the changed public values (masked, never personal data), and the gateway updates that page's guide points; no extra request to Vodafone; a rule against bad reports. Crawling stays on demand only (PRD D3)

## Context

The guide reads prices live to answer (ADR-0059). Those reads are the freshest prices anywhere, and they cost Vodafone nothing more. But a report from a browser can be wrong or forged: the site key is public (ADR-0056 §3), so it proves nothing about who sent a report. Read values reach traces today (step E3 removes that), and the knowledge base is versioned, its changes held for review above a churn threshold.

## Decision

1. **Only reads the guide was asked for.** The planner marks a live read with `observe` only when the destination has a guide point, its page is public (not sign-in, account, login or checkout), it is not a commit destination, and `kb.observations.enabled` is on (off by default).
2. **In the browser**, an on-demand chunk (`observe.js`) parses the read value, reads only inside Vodafone's own content (never the layer's or the guide's copies), runs the personal-data mask and drops the report if anything was masked, and sends only a value that differs: `{ siteKey, kbVersionId, sessionId, turnId, step, destinationId, field, value }`. No text, no address, no page content. Never in replay or on the clone. guide.js gains a measured gate of about 30 B.
3. **At the gateway** (`POST /v1/kb/observations`): three switches (the site config, `VG_KB_OBSERVATIONS`, and the public gateway refusing rule R2 unless set on purpose); a strict schema of at most 2 KB; the active knowledge version only; the destination must exist, be public, not a commit, and have that field; the report must match step *i* of the session's own plan from the last 15 minutes and be the first for that destination in that session; a rate limit per address; traces keep counts only.
4. **Rules against bad reports.** R1, attested: the demo browser's Node forwarder adds a token from the environment, in live mode only, never in replay or tests, which page scripts cannot see; one attested report applies. R2, corroborated: off by default and refused on the public gateway unless set: two matching reports from different sessions and address hashes, each tied to a real turn, within 24 h, with nothing contradicting. Under both: a new price between half and twice the old, else held for the owner; one change per item per day; a daily cap per site.
5. **Storage:** reports deleted after 48 h; an overlay of current points over the active version (no new version); an append-only audit naming the rule that accepted each change; `npm run kb -- --points [--held|--accept|--revert|--freeze]`. The churn gate and the sync report ignore points; a new version retires older points and lists those whose destination is gone.
6. **No request to Vodafone** is ever made because of a report.

## Consequences

- Guide points follow the live shop between syncs, from the owner's own demos first.
- A forged or wrong report can at worst move a guide point within the band, and never into anything the guide says (ADR-0059).

## Pilot knobs

- The switches; R1 and R2; the band (0.5 to 2×); the per-item and per-site caps; prices only at first, stock later.

## Revisit when

- Public visitors' reports are wanted (PRD D2), or signed-in visitors could see personal prices.
- The page watch (phase 6, D1) is decided.
