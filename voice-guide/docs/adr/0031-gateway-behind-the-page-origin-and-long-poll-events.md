# ADR-0031: In the demo browser the gateway is reached through the page's own origin, and live events fall back to long polling

- Status: Accepted (demo); amends ADR-0026 (which required a public HTTPS gateway for the demo)
- Date: 2026-10-23
- Area: Live site integration, edge
- Code: `packages/sdk/src/index.ts` (gateway from the script's path), `packages/sdk/src/api.ts` (`events()` with `poll`), `services/gateway/server.ts` (`GET /v1/events/poll`), `tools/demo-browser.ts` (routing)

## Context

On a real Vodafone page (`https://web.vodafone.com.eg`), the SDK must call our gateway. ADR-0026 planned a public HTTPS host for it, because a call from a public HTTPS page to `http://localhost` meets mixed-content rules and Chrome's local-network checks, and those differ by version. A public host is dependency D4, which nobody has yet. The demo browser is a Playwright-controlled Chromium, so it can intercept requests before they leave the browser.

Request interception (`route.fulfill`) answers with a complete body, so it cannot carry a stream. The SDK's live events (X-ray traces, page-watch notifications) use server-sent events.

## Decision

1. The demo browser loads the SDK from **the page's own origin under a reserved path**: `https://web.vodafone.com.eg/__vg/sdk/guide.js`. It routes `/__vg/**` on each allowed origin to the local gateway (`http://127.0.0.1:<port>`) in Node. To Chrome these are same-origin requests: no mixed content, no CORS preflight, no local-network prompt.
2. The SDK takes its gateway URL from the script's own URL, **keeping the path prefix** (`…/__vg`). A `data-gateway` attribute overrides it. Production (the Tealium tag) is unchanged: the gateway is wherever `guide.js` is served from.
3. **Live events fall back to long polling**: `GET /v1/events/poll?session=…&since=<seq>&wait=20` returns at once when events are waiting. Otherwise it holds for up to 20s and returns a burst collected for 120ms after the first event. The SDK uses polling when `data-events="poll"` is set (the demo browser sets it), when `EventSource` is missing, or when the stream fails.

## Options considered

| Option | Outcome |
|---|---|
| Public HTTPS gateway (ADR-0026) | Still right for the pilot (mode A); blocked for the demo on D4. |
| `http://127.0.0.1` from the page, with Chrome flags to relax local-network checks | Flag names and behaviour change across Chrome versions; fragile on stage. |
| Self-signed HTTPS on localhost | Still a public-to-local request; certificate warnings. |
| Intercept and also stream events | Not possible with `route.fulfill`. |

## Consequences

- The demo needs nothing on the internet but Vodafone's site: the gateway, the store and the knowledge base can all run on the demo laptop.
- `/__vg/` is reserved on the page origin, but only inside the demo browser; real visitors never see it.
- Events arrive up to about 150ms later with polling than with streaming; fine for the X-ray and watch notices.

## Pilot knobs

| Knob | Where | Default |
|---|---|---|
| `data-events` | script tag | `auto` (stream, then poll) |
| `wait` | poll request | 20s (max 25) |

## Revisit when

- The pilot runs with the Tealium tag and a public gateway: polling is no longer needed there.
- More than a few hundred concurrent sessions poll the same gateway: move the listener registry to Postgres `LISTEN` per replica (it already fans out through `trace_events`).

## Verified by

- `tests/e2e/live-replay.e2e.test.ts`: the demo browser on replayed Vodafone pages reaches the gateway through `/__vg` with `data-events="poll"`; the X-ray fills from polled events.
- `tests/integration/gateway.test.ts`: `GET /v1/events/poll` returns waiting events, holds when there are none, and returns early on a new event.
