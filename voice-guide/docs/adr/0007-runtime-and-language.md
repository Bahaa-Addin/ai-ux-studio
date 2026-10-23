# ADR-0007: TypeScript on Node 22 with native type stripping; esbuild for the browser SDK

- Status: Accepted (demo slice)
- Date: 2026-10-22
- Area: Runtime and tooling

## Context

The page watch prototype is plain JavaScript on Node 22 with no build step (ADR-0003). The guide platform is bigger: shared contracts (plans, manifests, sessions) cross the browser and five services, and a type error in a contract breaks the demo silently. We still want to run any file directly, without a compile step, so the inner loop stays fast.

## Decision

- **TypeScript everywhere**, written in the "erasable" subset: types only, no `enum`, `namespace` or parameter properties. Node 22.18+ strips the types at load time, so `node services/gateway/main.ts` runs as is.
- **Relative imports carry the `.ts` extension**; internal modules use package `imports` aliases (`#kb`, `#text`, `#shared/...`).
- **Type checking** is a separate step: `npm run typecheck` (`tsc --noEmit`, `strict`, `erasableSyntaxOnly`, `verbatimModuleSyntax`).
- **The SDK is bundled with esbuild** to one ES2022 file plus a lazily loaded agent chunk.
- **No web framework** on the server: `node:http` with a small router (ADR-0009). Node's built-in `fetch`, `crypto`, `test` runner and `EventEmitter` cover the rest.

## Options considered

| Option | Outcome |
|---|---|
| Plain JavaScript with JSDoc types (like ADR-0003) | Rejected. Works for one process; across five services and a browser bundle the contracts need a checker that runs in CI. |
| TypeScript compiled with `tsc` to `dist/` | Rejected. Adds a build step and source maps to every service for no runtime gain. |
| Express or Fastify | Rejected for now. Our HTTP surface is about 20 routes with JSON bodies and one SSE stream; a framework adds dependencies without removing code we would otherwise write. Easy to adopt later behind `services/shared/http.ts`. |
| Vite for the SDK | Rejected. esbuild alone produces the two files we need in under a second. |

## Consequences

- Node 22.18 or newer is required (type stripping on by default). Node prints an experimental warning on some versions; harmless.
- Contributors must stay within erasable syntax; `tsc` flags violations.
- Production images can run the same files directly, so a stack trace points at the source line.

## Pilot knobs

None at runtime.

## Revisit when

- The team adopts a framework elsewhere and wants consistency.
- Cold start time of a service matters (for example on a serverless platform): a bundled build is then worth the step.

## Verified by

- `npm run typecheck` passes.
- All services and jobs in this repo run directly with `node <file>.ts`.
