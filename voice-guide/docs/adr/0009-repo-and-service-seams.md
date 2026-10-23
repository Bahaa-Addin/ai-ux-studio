# ADR-0009: One repository and package, many entrypoints; each service runs in-process or over HTTP with the same handler code

- Status: Accepted (demo slice)
- Date: 2026-10-22
- Area: Code organisation and deployment

## Context

The architecture has a gateway, five services and three jobs. A demo needs one command to start everything; a pilot needs each service to scale on its own. Splitting into separate repositories or packages now would slow every change to a shared contract.

## Decision

- **One repository, one `package.json`.** Internal modules are reached through package `imports` aliases (`#kb`, `#text`, `#shared/*`), so there is no workspace linking.
- **Layout:**
  - `packages/text`: language detection, Arabic and English normalisation, retrieval
  - `packages/kb`: the site knowledge standard (types, schema, validation)
  - `packages/sdk`: the browser SDK
  - `services/<name>`: one folder per service with `handlers.ts` (pure handlers) and `main.ts` (standalone HTTP entry)
  - `services/gateway`: the public edge
  - `services/shared`: HTTP, RPC, config, tracing, stores
  - `jobs/`: crawler, describer, KB builder
  - `fixtures/`: stand-in sites; `tests/`: unit, integration, end to end
- **Service seam.** Every service exports a map of named handlers `(input, ctx) => output`. The gateway reaches a service through a client with the same shape:
  - `local` binding: calls the handler in the same process
  - `http` binding: `POST {serviceUrl}/rpc/{method}` with JSON, trace headers propagated
- **Deployment.** One container image; the command picks the entrypoint (`services/gateway/main.ts`, `services/run-service.ts <name>`, `jobs/ingest.ts`, ...). `VG_SERVICES=local` runs everything inside the gateway for the demo; `VG_SERVICES=http` plus `VG_<NAME>_URL` per service for a scaled pilot.

## Options considered

| Option | Outcome |
|---|---|
| Separate repositories per service | Rejected. Contract changes would need coordinated releases across repos for a five-person team. |
| npm workspaces with a package per service | Rejected for now. Adds linking and versioning between packages with no deployment benefit; can be introduced later without moving code. |
| A message bus between services | Rejected. Every call is request/response inside a user turn with a latency budget; asynchronous work (crawl, describe, watch checks) runs as jobs. |

## Consequences

- One command (`npm run dev`) starts the gateway, all services in-process, the fixture sites and the scheduler.
- Scaling a hot service (usually the router or agent proxy) is a deployment change, not a code change.
- Handler code must not rely on shared in-process memory across services; anything shared goes through the store.

## Pilot knobs

| Knob | Default | Effect |
|---|---|---|
| `VG_SERVICES` | `local` | `local` or `http`. |
| `VG_ROUTER_URL`, `VG_KNOWLEDGE_URL`, `VG_SESSIONS_URL`, `VG_AGENT_URL`, `VG_WATCH_URL` | unset | Service base URLs when `VG_SERVICES=http`. |
| `VG_RPC_TIMEOUT_MS` | `4000` | Per-call timeout between gateway and services. |

## Revisit when

- Two teams own different services: split the repository along that line.
- A service needs a different runtime (for example Laya in Python): it is already a separate deployable behind an HTTP adapter (ADR-0014).

## Verified by

- `tests/integration/rpc.test.ts` runs the same turn through the `local` and `http` bindings and compares results.
