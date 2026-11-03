# ADR-0037: Trail consent, retention, masking, route eligibility and the aggregation boundary

- Status: Accepted for the prototype (2026-11-03). **Customer exposure needs D2** (data protection: consent wording, retention, the aggregation endpoint).
- Date: 2026-11-03
- Area: Privacy and security; extends ADR-0018 (masking before data leaves the browser) and ADR-0022 (edge security)
- Spec: [SPEC-06](../specs/SPEC-06-exploration-trail.md) §2, §6, §8; threat model in SPEC-06 §9

## Context

A visual replay is the most sensitive thing the guide could hold: it can contain whatever was on screen. The trail is only acceptable if a person knowingly turns it on, it records public pages only, private regions never enter it, it stays on the device, and it can be deleted at once. Any "visitors like you" statistics would need a separate, approved, anonymous channel.

## Decision

### 1. Consent

- Nothing is recorded until the person presses **"Remember my journey on this device"** on a consent card that says what is recorded, what is not, that it stays on this device, the retention period, how to pause and clear it, and that anonymous aggregate signals are **off**.
- Consent is stored in `localStorage` (`vg-trail:<siteKey>:consent`, `{ v: 1, state, at, retentionHours }`) with states `granted`, `paused`, `declined`, `off`. "Not now" hides the offer for the browser session; "Turn off" stores `off`, deletes every saved journey and hides the offer until the person re-enables it from the trail button.
- No other cookie or consent category is read as consent (`trail.consentCategory` stays unset; a site may name an approved category only after D2).
- Controls are always one tap away in the trail: pause, resume, clear this journey, clear all saved journeys, turn off. Revocation in one tab reaches the others through the `storage` event: their recorders stop at once and their data is deleted.

### 2. Retention and limits (pilot parameters, `TRAIL_CONFIG.storage`)

| Limit | Default | Why |
|---|---|---|
| Retention | 24 h from the journey's start | Long enough to "pick up where you left off" the same day; short enough that a shared device forgets |
| Saved journeys | 3 | One per tab is normal; older ones are least useful |
| Steps per journey | 20 | A visit rarely has more meaningful pages; older steps roll off |
| Journey length | 30 min of activity | After that a new journey starts |
| Replay storage | 20 MB | Measured growth (HANDOFF §3) stays far below it; evictions are rare |
| Chunk size | 256 KB or 10 s | Small writes, bounded loss on a crash |

Expired and least-recently-updated journeys are evicted first, then the oldest steps' replay chunks of the current journey; a browser quota error moves the trail to **storage full** (recording paused, the timeline still works). Corrupted chunks are skipped and reported, never parsed into the page.

### 3. Route eligibility (public pages only)

A page is recorded only if **all** of these hold:

- the knowledge base knows it and its kind is not `checkout`, `account` or `login`, and it does not `requiresAuth` (unknown pages are recorded only on the site's own origins);
- its path does not match the sensitive patterns (`login`, `sign-in`, `register`, `account`, `profile`, `checkout`, `cart`, `basket`, `payment`, `pay`, `otp`, `verify`, `password`, `auth`, `sso`, `wallet` and the site's `trail.excludePaths`);
- it shows no password, one-time-code or card-number field (checked at start and every 2 s while recording).

On an ineligible page the recorder is not loaded or is stopped before anything from that page is stored: events emitted after the address changed to an ineligible route are dropped, not written. The step is kept only as a **boundary** ("A private page"): the knowledge page id when there is one, no path, no query, no replay.

### 4. Masking and blocking at record time (`trail/policy.ts`)

`maskAllInputs: true`, input values replaced by an empty string (no length leak), input events ignored; text in private regions replaced by a fixed mask; **blocked** (an empty box of the same size): password, email, tel, search inputs, textareas, selects, `contenteditable`, card and one-time-code fields, forms on login/payment, the guide itself (`vg-guide`, which also holds the trail), cookie banners (`#onetrust-*`), the accessibility widget, `[data-vg-private]`, video, audio, canvas, iframes, objects, Lottie players. `recordCanvas: false`, `recordCrossOriginIframes: false`, `collectFonts: false`, `inlineImages: false`, `slimDOMOptions: 'all'`, no console, network, clipboard or keystroke plugins, mouse moves sampled every 50 ms and scroll every 150 ms, clicks only among mouse interactions. The selector lists are policy configuration in one place, extended per site with `trail.privateSelectors`.

### 5. Replay safety (`trail/sanitize.ts`, `trail/replay.ts`)

Recorded events are untrusted when replayed. Before the replayer sees them:

- scripts, `noscript`, `base`, `meta http-equiv`, preload/prefetch links, frames, objects and embeds are removed; every `on*` attribute and every `javascript:`, `vbscript:` or `data:text/html` URL is dropped; link `href`, `ping`, `target`, form `action` and `formaction` are removed;
- every resource URL (`src`, `srcset`, `poster`, `href` of stylesheets and SVG `use`/`image`, CSS `url()`, `@import`) goes through the **replay resource policy**: same origin, no query string, a static asset extension, at most 60 resources and 5 MB per preview. Allowed resources are fetched with `credentials: 'omit'` and replaced by `blob:` URLs; everything else becomes an empty value or a transparent pixel. **The replay iframe therefore makes no network request of its own**, with or without cookies;
- input, canvas, font, media, log, selection and plugin events are dropped; malformed events are skipped.

The replayer's own iframe keeps rrweb's sandbox (`allow-same-origin` only: no scripts, forms, popups, top navigation or downloads), gets `pointer-events: none`, `tabindex="-1"`, `aria-hidden="true"` and an inert wrapper, and a `Content-Security-Policy` meta (`default-src 'none'; img-src blob: data:; style-src 'unsafe-inline' blob: data:; font-src blob: data:`) for anything added later. Only one replayer exists at a time and it is destroyed when the step changes, the timeline closes, a guide plan starts, or the trail stops.

### 6. Aggregation boundary (Phase B), disabled by default

- Phase A (this build): attention is scored locally; nothing about it leaves the browser.
- Phase B is built but **off**: it needs `trail.aggregation.enabled: true` in the site config **and** `VG_TRAIL_AGGREGATION=on` on the platform. Without both, `POST /v1/experience/contributions` answers 404 and the SDK never builds a batch.
- When on, the SDK may send at most one `vg-interest-contribution/v1` batch per day: site, knowledge version, a UTC day bucket, and at most 10 `{ pageId, destinationId, interestBand: warm|hot, activated }`. Never events, DOM, coordinates, selectors, typed text, URLs, timestamps finer than a day, identifiers, audio, transcripts, replay references or local fingerprints. The server validates against the active knowledge version, rejects unknown or excessive contributions, rate-limits per site and address, stores only counts per day in `experience_interest` (no address, no session, separate from traces), and the profile builder publishes a rank only after `minCohort` (pilot default 20) contributions in the window. Sensitive pages are never ranked; sparse rows are suppressed. Rows older than `VG_TRAIL_AGGREGATE_RETENTION_DAYS` (90) are purged.

## Consequences

- Recording is opt-in per browser and per site; most visitors never load the recorder.
- Some pages replay as empty boxes (blocked regions) and without some pictures (resources that fail the policy). This is the intended trade-off.
- The independence of aggregate contributions cannot be proven without an identifier; rate limits reduce, but do not remove, inflation. This is why Phase B stays off until D2.

## Pilot knobs

- `TRAIL_CONFIG.storage.*`, `TRAIL_CONFIG.policy.sensitivePaths`, `trail.excludePaths`, `trail.privateSelectors`, `trail.retentionHours`, `trail.aggregation.{enabled,minCohort}`, `VG_TRAIL_AGGREGATION`, `VG_TRAIL_AGGREGATE_RETENTION_DAYS`.

## Revisit when

- D2 answers: consent wording, whether a consent-manager category may cover the trail, retention.
- A page that should be private is found in a replay: add its selector or path to the policy and a test.
- Phase B is approved: re-check the cohort threshold against real traffic and add differential-privacy noise if counts are small.
