# ADR-0021: Every layer records trace events per turn; the X-ray panel and pilot analysis read the same events

- Status: Accepted (demo slice)
- Date: 2026-10-23
- Area: Observability
- Code: `services/shared/trace.ts`, gateway `/v1/events`, `packages/sdk/src/xray.ts`
- Amended (2026-11-13, e-shop plan step E3; AGENTS.md 4.3, 4.4): `Tracer.event` cleans every attribute before it is stored, whoever wrote the event (`services/shared/clean.ts`): personal data masked with ADR-0018's rules, prices, percentages and stock phrases removed (`valueFree`, ADR-0059), URLs cut to origin and path plus query values that are short and cannot name a person, strings capped at 300 characters. Logs are cleaned the same way. The X-ray therefore shows the person's request masked, a spotlight's read as "read", and no price

## Context

The demo's credibility rests on showing what happened for each request, live. The pilot needs the same data to decide what to tune: where time goes, how often the router acts, asks or falls back, which requests fail.

## Decision

1. **One event model:** `{ sessionId, turnId, traceId, name, service, at, durationMs, attrs }` in Postgres (`trace_events`). The W3C `traceparent` header carries the trace id from the SDK through the gateway to each service.
2. **Who records what:**
   - router: `turn.received`, `router.understood` (language, intent, candidates and scores, provider, confidence, fallback reason), `planner.plan`
   - gateway: `turn.planned` (server time)
   - SDK: `sdk.listen` (transcript, voice or typed, confidence), `sdk.step` per plan step (ok, detail, ms), `sdk.first_motion` (request to first visible movement), `agent.step`, `agent.done`
   - agent proxy: `agent.llm`, `agent.quota`, `agent.llm.error`
   - watch: `watch.created`, `watch.changed`, `watch.push`
3. **Live stream:** `GET /v1/events?session=…` (server-sent events) replays the session's recent events, then streams new ones through Postgres `LISTEN/NOTIFY`, so any gateway replica can serve any session.
4. **The X-ray panel only renders events.** Totals (requests, share answered without an LLM, first-motion p50) are computed from those events, not separately.
5. **Retention:** 7 days by default, purged by the gateway process. Events contain transcripts, so they are personal data.

## Consequences

- The end-to-end run's bugs were found by reading these events (a reveal step that reported "already visible"; an agent that restarted after a page load).
- Write volume: about 8 to 12 events per turn. Fine at pilot scale; batch inserts if it is not.
- `/metrics` exposes per-process counters and latency percentiles for dashboards.

## Pilot knobs

| Knob | Default | Effect |
|---|---|---|
| `VG_TRACE_RETENTION_DAYS` | 7 | How long transcripts and timings are kept. |
| `ui.xray` | `button` | Who can open the panel (turn `off` for the public pilot). |

## Revisit when

- The team adopts OpenTelemetry: export the same events as spans; the ids already follow the W3C format.

## Verified by

- `tests/integration/gateway.test.ts`: every layer's event for a turn; the event stream delivers them live with ids.
- `tests/e2e/guide.e2e.test.ts`: the X-ray panel shows layers, the agent's model calls and totals.
