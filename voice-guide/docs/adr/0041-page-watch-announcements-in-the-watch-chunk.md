# ADR-0041: Page-watch announcements load with the watch chunk, not with guide.js

- Status: Accepted (2026-11-05)
- Date: 2026-11-05
- Area: SDK size, page watch; amends ADR-0023 (where the announcement code lives)
- Task: T-504 (size budget)

## Context

`guide.js` has a 20,480-byte gzipped budget (PRD §9, `tests/unit/sdk-size.test.ts`). Commit c2b1a12 (`--vg-lift` in `packages/sdk/src/voice/launcher.ts`, so the Pocket corner can lift the microphone) took it to 20,562 bytes measured on Linux (Node 22.23.4, zlib level 9), the way CI on Ubuntu measures it. The Mac measured 20,462 bytes from the same file, so the overrun only showed on Linux. CI would fail the pull request into `master`.

The guide already loads the page-watch code on demand (`watch.js`, `window.__vgWatch`): creating a watch and drawing the toast. But the code that announces a change stayed in `guide.js`: the once-per-change check against `sessionStorage`, the toast call, the spoken line and the system notification for live watches. It runs only when a watched section changes, which most visitors never see.

## Decision

1. The announcement moves into the watch chunk as `notify(siteKey, root, toastEl, say, event)`. The guide's event stream keeps every event for the X-ray as before and hands a notification event to `notify`, loading `watch.js` if needed. The `sessionStorage` key (`vg:<siteKey>:notified`), the five-minute staleness rule, the toast, the spoken line and the `Notification` call are unchanged.
2. The budget stays at 20,480 bytes. It is measured on Linux, as CI does.

## Consequences

- `guide.js`: 20,562 → **20,401** bytes gzipped (79 bytes under the budget; Linux, Node 22.23.4, level 9, 2026-11-05). `watch.js`: 1,148 → 1,376 bytes, loaded only when a watch is created or a change arrives.
- A change notification now waits for `watch.js` (one small request, cached) before the toast and the spoken line start. Previously the spoken line started at once and the toast waited for the chunk anyway.
- A page load whose event backlog holds an already-announced change now fetches `watch.js` to learn that. This only happens in sessions that created a watch.
- Covered by `tests/e2e/guide.e2e.test.ts` test 6 (the toast shows the change, and is not shown again on the next page load) and `tests/unit/sdk-size.test.ts`.
- The headroom is small. The next feature that adds to `guide.js` needs its own saving.

## Pilot knobs

- None new. The staleness window (5 minutes) is still a constant in `packages/sdk/src/watch-chunk.ts`.

## Revisit when

- `guide.js` is within 100 bytes of the budget again: next candidates are the agent glue in `guide.ts` (`#runAgent`, `#resumeAgent`) and the panel template's whitespace in `ui.ts` (about 23 bytes).
- The size test's Linux and macOS numbers disagree on pass or fail again: consider measuring with a pinned zlib (or brotli, which the gateway may serve) in both places.
