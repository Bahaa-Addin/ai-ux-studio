# ADR-0023: Page watch moves onto the platform: rendered checks, sections from the knowledge base, Web Push or live delivery

- Status: Accepted (demo slice). Supersedes part of ADR-0004 (static HTML fetch) for watches created by the guide; ADR-0001 and ADR-0002 stay in force.
- Date: 2026-10-23
- Area: Page watch
- Code: `services/watch/handlers.ts`, `checker.ts`, `webpush.ts`; `packages/sdk/src/sw.ts`

## Context

"Tell me when this changes" closes the demo. The page watch prototype (ADR-0001 to ADR-0005) checks static HTML and identifies a browser by its push subscription. The guide already knows the exact section (a knowledge base target) and has a session; the web app's content is rendered by JavaScript.

## Decision

1. **What to watch** comes from the plan's `offerWatch` step: the destination's target selectors, its label, the page URL in the person's language. Destinations marked `watchable` in the knowledge base rank first for watch requests.
2. **Rendered checks:** the checker opens the page in Chromium (images, fonts and media blocked), reads the section's visible text, normalizes whitespace and hashes it (ADR-0004's rule, applied to rendered text). The baseline is taken when the watch is created.
3. **Delivery:**
   - **Web Push** (ADR-0002) when the browser can subscribe: VAPID and `aes128gcm` on Node's crypto; the service worker is served from the site's own origin at `/vg-sw.js`.
   - **Live** otherwise: the change goes to the session's event stream and appears as a toast and spoken line on any open page of the site.
   The SDK tries push first, with a 4-second cap, and falls back to live.
4. **Scheduling:** `tick` claims due watches with `FOR UPDATE SKIP LOCKED` and a lease, so several schedulers never check the same watch twice. Errors back off exponentially; five errors mark the watch `error`. A section missing three times in a row sends one "no longer on the page" notice and pauses the watch.
5. **Each change is stored** (before and after text) and announced once per tab.

## Consequences

- Rendering costs about 0.5 to 1 s per check; at a 15-minute default interval one Chromium handles thousands of watches per hour.
- Live delivery only reaches open pages; it exists so the demo works on a laptop whose browser cannot reach its push service. The pilot uses push.
- Gaps against the prototype: `pushsubscriptionchange` re-subscription and the section picker for arbitrary pages are not on the platform yet.

## Pilot knobs

| Knob | Default | Effect |
|---|---|---|
| `watch.intervalSec` (site) | 900 (fixture: 15) | Check frequency. |
| `watch.enabled` (site) | true | Turns the offer off. |
| `VG_VAPID_PUBLIC_KEY`, `VG_VAPID_PRIVATE_KEY`, `VG_VAPID_SUBJECT` | generated into `data/vapid.json` | Use fixed keys in every environment, or subscriptions break on redeploy. |
| `VG_WATCH_SCHEDULER` | on | `off` on replicas that should not check. |

## Revisit when

- Watches outnumber what one checker renders per interval: run the watch service with more replicas (claiming makes it safe) or fall back to static fetch for pages that do not need JavaScript.
- The prototype's picker should create platform watches: point it at `POST /v1/watch`.

## Verified by

- `tests/unit/webpush.test.ts`: encryption round trip, VAPID signature, a push service receiving a decryptable record, 410 handling.
- `tests/integration/gateway.test.ts`: baseline, no change, change, change record, stream event, listing and deletion, URL scope.
- `tests/e2e/guide.e2e.test.ts`: the offer, the chip, a rendered check after the clone file changes, the toast, no repeat after reload.
