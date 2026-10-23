# SPEC-03: Running the guide on real Vodafone pages

- Status: Ready to build
- Requirement: PRD R2 (based on real Vodafone pages; start anywhere; keep working while navigating)
- Decisions: [ADR-0026](../adr/0026-real-pages-via-tag-manager-and-demo-browser.md), [ADR-0030](../adr/0030-sdk-follows-spa-route-changes.md)
- Facts: [live site audit](../reference/vodafone-live-site-audit.md) §1–§3, §5
- Diagram: [deployment](../diagrams/08-deployment.md)

## 1. How the guide gets onto a real page

The SDK is one script tag (ADR-0006). The question is who adds it to `web.vodafone.com.eg` and `eshop.vodafone.com.eg`, which we do not deploy.

| Mode | Who adds the tag | Real origin, cookies, login | Works from any start page | Use |
|---|---|---|---|---|
| **A. Tag manager** | Vodafone's web team, as a Tealium iQ tag (`utag`, profile `vodafone/eg-main-new`) on `web` and `eshop` | Yes | Yes | **Pilot and production** |
| **B. Demo browser** | `tools/demo-browser.ts` injects the loader into every top-level document of the allowed origins | Yes | Yes | **The demo**, until mode A exists |
| C. Reverse proxy mirror | Our proxy rewrites HTML and adds the tag | No: another origin; login, cookies and SPA API calls break | Partly | Rejected (ADR-0026) |
| D. Iframe around the site | | Blocked by `X-Frame-Options: SAMEORIGIN` | | Not possible |
| E. Clone with the tag | `vodafone-services-clone` and the fixture sites | No | Only cloned pages | **Offline fallback** on stage |
| F. Bookmarklet | The presenter, on each full page load | Yes | No: lost on every full page load | Debugging only |

### Mode A: Tealium tag (for Vodafone's web team)

```html
<script src="https://<gateway-host>/sdk/guide.js" data-site-key="pk_vodafone_eg" async></script>
```

- Tag type: Custom Container, loaded on DOM Ready, on `web.vodafone.com.eg` (all `/en/`, `/ar/`, `/spa/` pages) and `eshop.vodafone.com.eg`.
- Load rule for the pilot: an allowlist of pages plus a percentage rollout, or a cookie flag (`vg_pilot=1`) for internal testers.
- Consent: the guide stores a session id in `sessionStorage` and sends requests and traces to its gateway. Map it to the OneTrust category Vodafone's data protection owner chooses (open question). Until then, load it only for testers.
- The page's CSP allows this today (audit §2). If Vodafone adds `script-src` or `connect-src`, add the gateway host to both.

### Mode B: demo browser (`tools/demo-browser.ts`, new)

A Playwright-launched Chromium (or installed Chrome with `channel: 'chrome'`) in a **dedicated persistent profile** (`data/demo-profile/`):

1. `launchPersistentContext(profileDir, { headless: false, viewport: null, args: ['--start-maximized'] })`.
2. `context.grantPermissions(['microphone', 'notifications'], { origin })` for each allowed origin.
3. `context.addInitScript(loader)`. The loader runs in every document, returns at once unless `window.top === window` and `location.origin` is in the allowlist (`https://web.vodafone.com.eg`, `https://eshop.vodafone.com.eg`), and then appends the same `<script src=…/sdk/guide.js data-site-key=…>` the tag manager would. It must not run twice in one document.
4. Opens `--start <url>` (default `https://web.vodafone.com.eg/ar/home`). **Any page works as a start page.**
5. `--kiosk` for stage use; `--xray open|button|off`.

Gateway reachability from a public HTTPS page:
- The gateway must be served over **HTTPS on a public hostname** (for example a tunnel or a small VM with a certificate). A page on `https://web.vodafone.com.eg` calling `http://localhost:4400` hits mixed-content and Chrome's Local Network Access rules, which differ by version. Do not build the demo on that path.
- The gateway's site config lists both Vodafone origins (`origins:` in `config/sites/vodafone-eg.yaml`), so the origin check and CORS accept them.

Before the demo, the presenter answers the cookie banner once in the demo profile (reject non-essential) and signs in the **demo account** on `/spa/myHome` if the account part of the demo is shown. The guide never types credentials (AGENTS.md).

### Mode E: offline fallback

`npm run dev -- --site vodafone-clone` serves `../vodafone-services-clone` with the tag injected (site config `config/sites/vodafone-clone.yaml`, task T-306). The script says which moments still work offline.

## 2. Page types the SDK must handle

| Page type | Example | Navigation | What the SDK does |
|---|---|---|---|
| CMS page | `/ar/mobile-internet-bundles` | Full page load | As today: session resumes from `sessionStorage` and the server (ADR-0016). |
| SPA page | `/spa/storeLocator`, `/spa/miManagement` | **No page load**: Angular changes the URL with `history.pushState` | **New** (ADR-0030): detect route changes, identify the new page, continue the plan after the new view has rendered. |
| CMS → SPA redirect | `/en/vodafone-flex` → `/spa/vodafone-flex` | Redirect | The KB stores the final URL; `waitForPage` accepts either URL. |
| Shop (other origin) | `eshop.vodafone.com.eg/en/…` | Full load, new origin | Handoff token `#vgh=` on the link (ADR-0016); the tag (A) or the demo browser (B) must be present there too. |
| Login wall | `/spa/myHome` signed out | SPA view with a login form | The guide says it needs the person to sign in and stops. It never fills credentials. |

### SPA route following (ADR-0030)

- Wrap `history.pushState` and `history.replaceState`, and listen to `popstate`. Where the Navigation API exists, use `navigation.addEventListener('navigatesuccess', …)` instead.
- After a route change, wait until the view settles: no DOM mutations under `<app-root>` for 300ms, or the plan step's target selector exists, with a 6s timeout.
- Then: re-identify `pageId` from the URL (KB pages plus SPA route patterns), report `sdk.route` (from, to, ms), and resume the current plan step (`waitForPage` passes when the new page id matches).
- Reset per-page state (spotlight, pointer, commit-guard list), but keep the conversation, the panel and the microphone as they are: **no flicker, no reload of the guide**.

## 3. Living alongside the page's own UI

| Page element | Rule |
|---|---|
| Vodafone accessibility button `#vodafone-aw-icon` | Never hidden, covered or replaced. The microphone stacks above it (SPEC-02 §2). |
| OneTrust banner and preference centre | The guide sits below them (`z-index`). The guide never clicks consent controls for the person. The agent's blacklist includes `#onetrust-*`. |
| Accessibility widget overlays (text size, dyslexia font, sign language) | The guide's shadow DOM is unaffected; the guide reads the root font scale to follow text-size changes (SPEC-02 §7). |
| Tealium and Dynatrace | No interaction. The SDK's errors are caught and reported to our gateway, never thrown to the page. |
| Page's own scripts | The SDK adds no globals besides `window.voiceGuide`, patches only `history.pushState` and `history.replaceState` (calling through), and adds one custom element `<vg-guide>`. |

## 4. Safety rules on live pages

These rules are enforced in code and tested, not just written down:

1. **Commit points are never pressed** by the guide or the fallback agent: payment, subscription confirmation, recharge, transfer (Vodafone Cash), line changes, consent. The site config marks known commit selectors. The agent's `interactiveBlacklist` covers buttons whose text matches the commit lexicon in both languages ("تأكيد", "ادفع", "اشترك" inside `/spa/` confirmation views, "Confirm", "Pay", "Submit order").
2. **No credentials, OTPs, card numbers or national IDs are ever typed** by the guide. `input_text` refuses fields of type `password`, inputs with `autocomplete` values `one-time-code`, `cc-*` or `current-password`, and any field whose label matches those words.
3. **Values are read, never stored** (ADR-0011): prices and balances go into the spoken answer and nowhere else. Traces store the destination id, not the value.
4. **Masking** before page content leaves the browser (ADR-0018) covers Egyptian mobile numbers (`01[0125]\d{8}`), national IDs (14 digits), emails and card numbers.

## 5. Acceptance criteria

1. `npm run demo:browser -- --start https://web.vodafone.com.eg/ar/home` opens the real page with the microphone visible within 1.5s of `DOMContentLoaded` (guide.js is 15 KB gzipped).
2. Starting on each of `/en/home`, `/ar/mobile-internet-bundles`, `/spa/storeLocator` and `eshop.vodafone.com.eg/en/` works: the guide answers "what is this page?" correctly in both languages.
3. A plan that crosses CMS → SPA (`/ar/mobile-internet-bundles` → "اشترك" → `/spa/miManagement`) continues without a reload of the guide; `sdk.route` is recorded; the transcript and panel keep their content.
4. A plan that crosses to the shop continues on `eshop.vodafone.com.eg` with the same session id.
5. No request from the SDK goes to any host except the gateway (network log assertion).
6. Running the full demo script leaves the page's console free of errors caused by the SDK.
7. The loader never injects twice and never injects into iframes (checked on pages with OneTrust and YouTube iframes).
