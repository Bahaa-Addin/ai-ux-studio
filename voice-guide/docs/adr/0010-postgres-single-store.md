# ADR-0010: Postgres is the only shared store for the pilot; Redis is deferred

- Status: Accepted (demo slice). Changes the demo plan, which listed a Redis session cache.
- Date: 2026-10-22
- Area: Data

## Context

The services are stateless, so everything shared lives in a store: knowledge base versions, sessions, handoff tokens, traces for the X-ray panel, watches, push subscriptions and change history. The demo plan drew Postgres for knowledge and Redis for sessions. Every extra moving part is one more thing that can fail on stage and one more thing to operate in the pilot.

## Decision

- **Postgres 16 holds everything shared**, in one schema (`services/shared/store/schema.sql`):
  - `kb_versions` (JSONB manifest, immutable) and `kb_active` (pointer per site)
  - `sessions` (JSONB state, `expires_at`) and `handoff_tokens` (single use, 60 s)
  - `trace_events` (per session, retention job)
  - `watches`, `push_subscriptions`, `watch_changes`
- **Live fan-out** for the X-ray panel uses `LISTEN/NOTIFY` on channel `vg_trace`, so any gateway replica can stream any session's events.
- **Hot reads are cached in process**: the active manifest per site is cached by version id and refreshed on a `vg_kb` notification.
- **Rate limits are per process** (token buckets in memory). With N gateway replicas the effective limit is N times the setting.
- **An in-memory store** with the same interface runs unit tests and quick local demos (`VG_STORE=memory`).

## Options considered

| Option | Outcome |
|---|---|
| Postgres plus Redis (as in the plan) | Deferred. At pilot traffic (about a turn per second at peak) Postgres handles session writes easily; Redis adds a second store to secure, back up and monitor. |
| Redis only | Rejected. Manifests, watches and change history need durable, queryable storage. |
| SQLite per instance | Rejected. Not shared across instances, so sessions break as soon as there are two replicas. |

## Consequences

- One connection string to configure and one store to back up.
- Session writes happen on every step of a plan; this is the first thing to watch under load.
- Rate limiting is approximate when scaled out.

## Pilot knobs

| Knob | Default | Effect |
|---|---|---|
| `VG_STORE` | `postgres` | `postgres` or `memory`. |
| `DATABASE_URL` | none | Postgres connection string. |
| `VG_DB_POOL_MAX` | `10` | Connections per process. |
| `VG_SESSION_TTL_MIN` | `60` | Idle session lifetime. |
| `VG_TRACE_RETENTION_DAYS` | `7` | How long turn traces (including utterances) are kept. |

## Revisit when

- p95 session write latency exceeds 20 ms, or `sessions` writes exceed about 500 per second: move sessions and rate limits to Redis behind the same `SessionStore` interface.
- Rate limits must be exact across replicas: move token buckets to Redis.

## Verified by

- `tests/integration/store.postgres.test.ts` runs the store contract against Postgres 16, including LISTEN/NOTIFY fan-out between two connections.
- `tests/unit/store.memory.test.ts` runs the same contract against the memory store.
