# ADR-0035: rrweb (`@rrweb/record`, `@rrweb/replay`) for local journey replay, pinned and loaded on demand

- Status: Accepted for the prototype (2026-11-03). Production use needs D2 (data protection) and a security review.
- Date: 2026-11-03
- Area: Dependencies, SDK; amends ADR-0008 (dependency policy)
- Spec: [SPEC-06](../specs/SPEC-06-exploration-trail.md)

## Context

The Exploration Trail (SPEC-06) shows a person their own journey across public pages as a scrubbable visual memory. That needs a DOM recorder (full snapshot plus incremental mutations, pointer and scroll) and a replayer that rebuilds the DOM safely. Writing either is months of work: shadow DOM, adopted stylesheets, CSS splitting, mutation ordering, iframes and masking are all solved problems in rrweb.

Options considered:

| Option | Why not (or why) |
|---|---|
| Screenshots or canvas captures | Pixels of the whole page: personal data cannot be masked by selector after the fact, large, no scrubbing of the pointer |
| Our own mutation recorder | A large surface for bugs; masking and replay safety would be ours alone to get right |
| `rrweb` (the all-in-one package) | Deprecated as an entry point; bundles recorder and replayer together |
| `rrweb-player` | Svelte UI of its own; we need a Vodafone timeline inside the guide's shadow root (ADR-0020) |
| **`@rrweb/record` and `@rrweb/replay`** | Chosen: the maintained split packages, MIT, tree-shakeable ESM, sandboxed replay by default |

## Decision

1. Add `@rrweb/record` and `@rrweb/replay` as **devDependencies** (they are bundled into SDK chunks, like page-agent, ADR-0017), pinned **exactly at 2.2.0**. Their transitive packages (`rrweb`, `rrweb-snapshot`, `rrdom`, `@rrweb/types`, `@rrweb/utils`) are pinned to the same version with `overrides` in `package.json`, and `package-lock.json` records integrity hashes. We never import the `rrweb` package ourselves; it is only a transitive dependency of the two scoped packages.
2. Version choice: 2.2.0 was published on 2026-10-24, ten days before adoption, which is shorter than the two-week cooling period we would normally wait. Pinning 2.1.7 does not avoid this: its caret ranges resolve to the 2.2.0 core anyway. 2.2.0 also fixes leaks on the recorder's side that matter for us (rrweb #1971: `stop()` releasing the document's mutation buffer, and full snapshots no longer emitting the same mutation twice). The trail takes a full snapshot at every page step and stops on every pause.
3. **Two lazy chunks**, never in `guide.js`:
   - `trail-record.js`: the recorder, loaded only after consent **and** route eligibility (ADR-0037).
   - `trail-replay.js`: the replayer and the replay sanitizer, loaded only when the person opens a preview.
   - `trail.js` (our code only, no rrweb): consent, timeline, storage, attention scoring. Loaded only on sites where `trail.enabled` is true.
   - `guide.js` gets a feature gate of a few bytes that loads `trail.js` after start-up when the site enables the trail.
4. **The replayer is only used through its sandboxed iframe.** `UNSAFE_replayCanvas` and `UNSAFE_allowUnprotectedRebuild` are never set (a unit test greps the bundled source of our wrapper). Replay data is sanitized and its resources are rewritten before the replayer sees it (ADR-0037 §5).
5. Exit and replacement criteria (Revisit when).

## Bundle impact (measured 2026-11-03, esbuild minify, gzip -9)

| File | Raw | Gzipped | Loaded |
|---|---|---|---|
| `guide.js` before the trail | 59,169 B | 20,376 B | Every page |
| `guide.js` with the trail gate | 59,244 B | 20,445 B (+69 B) | Every page |
| `trail.js` | 80,072 B | 26,260 B | Sites with the trail enabled, after start-up |
| `trail-record.js` | 76,024 B | 23,524 B | After consent, on eligible pages |
| `trail-replay.js` | 212,000 B | 68,413 B | When a preview opens |

Measured runtime (2026-11-03, `npm run measure:trail -- --minutes 10`, fixture site): recorder start p95 13 ms, preview build p95 6 ms, scrub p95 2.7 ms, about 13 KB of storage a minute. **Budget** (enforced in `tests/unit/sdk-size.test.ts`): `guide.js` ≤ 20 KB gzipped, `trail.js` ≤ 30 KB, `trail-record.js` ≤ 26 KB, `trail-replay.js` ≤ 72 KB; runtime targets for the pilot: recorder start ≤ 50 ms, preview ≤ 500 ms including the chunk fetch, scrub ≤ 16 ms.

The final numbers are in HANDOFF §3 and `tests/unit/sdk-size.test.ts` enforces that no rrweb code reaches `guide.js` or `trail.js`.

## Consequences

- Two more pinned packages (and five transitive) in the SDK build; Node services do not import them.
- rrweb's own replay defaults (iframe with `sandbox="allow-same-origin"` and no scripts) become part of our security model; an upgrade must re-run `tests/integration/trail-browser.test.ts` (adversarial replay) and the size test.
- Replay fidelity depends on rrweb: blocked regions show as empty boxes, canvas and video are not replayed, cross-origin stylesheets that rrweb cannot inline fall back to the page's default look.

## Pilot knobs

- `TRAIL_CONFIG.recorder.sampling` (mouse move and scroll throttling), `checkoutEveryNms` (full snapshot interval within one page): `packages/sdk/src/trail/config.ts`.

## Revisit when

- rrweb publishes a security advisory, or a release that changes the default iframe sandbox: re-run the adversarial suite before upgrading.
- `trail-replay.js` exceeds 80 KB gzipped, or opening a preview takes longer than 500 ms p95 on the demo machine: consider a lighter replay of key frames only.
- The project needs replay without a same-origin iframe (for example a separate origin for replay): reconsider building our own minimal rebuild.
- Removal: deleting `packages/sdk/src/trail/recorder.ts`, `replay.ts`, the two chunk entries in `packages/sdk/build.ts` and the dependencies removes rrweb completely; the timeline then shows page steps and explored items without previews.
