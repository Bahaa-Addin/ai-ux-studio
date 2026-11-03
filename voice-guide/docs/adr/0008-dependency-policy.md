# ADR-0008: A small, pinned set of dependencies; everything else on Node built-ins

- Status: Accepted (demo slice); zod pin amended by ADR-0034 (zod 4.6.5); `@rrweb/record` and `@rrweb/replay` 2.2.0 added by ADR-0035 (SDK chunks, pinned with overrides, a `package-lock.json` now exists in the working tree, T-502)
- Date: 2026-10-22
- Area: Dependencies
- Related: ADR-0003 (zero runtime dependencies for the page watch prototype)

## Context

ADR-0003 kept the page watch prototype free of runtime dependencies. The guide platform needs a production database driver, a headless browser for crawling, a schema validator for the knowledge standard and an in-page agent for the fallback. Writing those ourselves would cost more than it saves and would be less trustworthy.

## Decision

Exact-pinned dependencies, each with one job:

| Package | Version | Used by | Why this one |
|---|---|---|---|
| `pg` | 8.23.1 | services | The standard Postgres driver; pooling, SCRAM auth, TLS, LISTEN/NOTIFY. |
| `playwright` | 1.56.0 | crawler, describer, watch checker, end-to-end tests | Real Chromium rendering, element screenshots, the same selector engine the browser uses. |
| `zod` | 3.25.76 | knowledge standard, SDK | Validates manifests and plans; exports JSON Schema; already a peer of page-agent. |
| `yaml` | 2.9.0 | site config, curated overlays | People edit Arabic and English labels by hand; YAML is friendlier than JSON. |
| `@page-agent/core`, `@page-agent/page-controller`, `@page-agent/llms` | 1.12.4 | SDK agent chunk (bundled, dev dependency) | The fallback agent (ADR-0017). Pinned, not forked. |
| `esbuild`, `typescript`, `@types/node` | 0.28.2, 6.0.3, 26.6.3 | build and type check | See ADR-0007. |

Everything else uses Node built-ins: HTTP server, `fetch`, crypto (including Web Push encryption, ADR-0023), test runner, timers.

Rules:

1. Versions are exact. Upgrades are deliberate and go through the end-to-end suite.
2. A new dependency needs a line in this table: what it does, who uses it, why not built-ins.
3. page-agent's `chalk` logging and its optional mask animation are replaced at bundle time with stubs (`packages/sdk/build.ts`); we use our own overlay.

## Options considered

| Option | Outcome |
|---|---|
| Zero dependencies, as in ADR-0003 | Rejected for the platform. A hand-written Postgres driver or browser engine is not a good use of a pilot. |
| Fork page-agent | Rejected (see the fork-or-build evaluation): we change nothing inside it; we wrap it. |
| ORM (Prisma, Drizzle) | Rejected. About ten tables and straightforward SQL; plain `pg` with a migration file is enough. |

## Consequences

- `npm install` is required before running.
- In the build sandbox the npm registry was unreachable, so `pg` 8.23.1 and page-agent 1.12.4 were assembled from their tagged GitHub sources; the end-to-end suite ran against those exact versions. A normal `npm install` resolves the same direct versions from the registry. There is no `package-lock.json` yet, so transitive versions are not pinned: the first `npm install` with registry access must commit the lockfile, then rerun `npm run typecheck`, `npm test` and `npm run test:e2e`.
- The SDK bundle includes zod through page-agent; that is why zod 3.25.76 (which ships the `zod/v4` API page-agent imports) is pinned rather than zod 4.

## Pilot knobs

None at runtime.

## Revisit when

- page-agent ships a breaking change we need: upgrade behind the agent adapter and rerun `tests/e2e/guide.e2e.test.ts` (its fallback-agent tests).
- A second team needs to reuse a package (for example the knowledge standard): publish it separately.

## Verified by

- `tests/integration/store.postgres.test.ts` (pg against Postgres 16).
- `tests/e2e/guide.e2e.test.ts`, fallback-agent tests (page-agent bundled into the SDK's `agent.js` chunk).
