# ADR-0026: Run on real Vodafone pages through the tag manager in production and a loader-injecting demo browser for the demo

- Status: Proposed (Vodafone live phase). Accept when SPEC-03 acceptance criteria 1–7 pass.
- Date: 2026-10-23
- Area: Live site integration
- Spec: [SPEC-03](../specs/SPEC-03-live-site-integration.md); facts: [live site audit](../reference/vodafone-live-site-audit.md) §1–§3

## Context

The demo must run on **real pages of `web.vodafone.com.eg`**, start on any page, and keep working across the CMS pages, the `/spa/` Angular app and the shop on `eshop.vodafone.com.eg`. We do not deploy those sites. The guide is one script tag (ADR-0006), so the question is how the tag gets onto pages we don't control. Facts from the audit:
- The main site's CSP sets only `frame-ancestors`, and the shop's allows `*`, so an added script can load from our gateway and call it.
- `X-Frame-Options: SAMEORIGIN`, so the site cannot be put inside our own page.
- Tealium iQ is on every page.

## Decision

1. **Production and pilot: a Tealium iQ tag** added by Vodafone's web team, loading `guide.js` from our gateway on both origins, with a load rule for testers or a percentage rollout.
2. **Demo: a dedicated demo browser** (`tools/demo-browser.ts`), a Playwright persistent Chromium profile that injects the same loader into every top-level document of the two allowed origins with `addInitScript`, grants the microphone, and opens any start URL.
3. **Gateway on public HTTPS** for both, so calls from `https://web.vodafone.com.eg` are not mixed content and do not hit local-network rules.
4. **Offline fallback**: the team's clone (`vodafone-services-clone`) and the fixture sites with the tag, for a network failure on stage.

## Options considered

| Option | Outcome |
|---|---|
| Reverse proxy that rewrites Vodafone pages and adds the tag | Rejected. It is another origin, so login, cookies and the SPA's API calls break or need rewriting. It also serves Vodafone's pages from a host they don't own, which needs legal sign-off. |
| Iframe the site inside our page | Not possible (`X-Frame-Options`). |
| Browser extension | Rejected earlier (customers won't install one). The demo browser is the same idea limited to one demo machine, without asking anyone to install anything. |
| Bookmarklet | Lost on every full page load; fails "keep working while navigating". Kept for debugging. |
| Only the clones | Fails "based on real pages"; kept as the fallback. |

## Consequences

- The demo shows the real site, with real login and real prices, on one prepared machine. The audience can't try it on their own phones until mode A exists.
- Mode A needs Vodafone's web team, a consent category decision, and a public gateway: PRD dependencies D1, D2, D4.
- Everything the SDK does on the page must be safe on production: no globals besides `window.voiceGuide`, history patching only by wrapping, all errors caught.

## Pilot knobs

| Knob | Where | Effect |
|---|---|---|
| Allowed origins | `config/sites/vodafone-eg.yaml` `origins` | Where the gateway accepts requests from and where the demo browser injects |
| `--start`, `--kiosk`, `--xray` | `npm run demo:browser` | Start page and presentation mode |
| Tealium load rule | Vodafone's Tealium profile | Who gets the guide in the pilot |

## Revisit when

- Vodafone adds `script-src` or `connect-src` to its CSP: add the gateway host there, or the tag stops loading.
- Vodafone's web team prefers to ship the tag in their own build: the loader is the same `<script>`.
- The demo must run on audience phones: mode A on a test cookie (`vg_pilot=1`) is the only acceptable route.

## Verified by (planned)

- `tests/live/demo-browser.live.test.ts` (runs only with `VG_LIVE=1` on a networked machine): SPEC-03 acceptance 1–7.
