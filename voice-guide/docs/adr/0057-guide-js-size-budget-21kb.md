# ADR-0057: guide.js's gzip budget moves from 20 KB to 21 KB

- Status: Accepted (2026-11-13; proposed the same day as the recommended option on the owner's open card, and accepted by the owner: "Accept 21 KB")
- Date: 2026-11-13
- Area: SDK size; amends PRD §9 and T-504 (the number), follows ADR-0041 (how it is measured) and ADR-0055 (what moved out)
- Task: T-504 (size budget)

## Context

`guide.js` had a 20,480-byte gzipped budget (PRD §9, `tests/unit/sdk-size.test.ts`). The public demo (ADR-0053, ADR-0055) needs two things in the main script, because they have to work before any on-demand chunk loads:

- **Tap to hear** (ADR-0053 §4): after a page change, Safari, Firefox and iOS refuse to speak without a tap. `Speech` notices the refusal, and the guide shows the line behind a "Tap to hear" button (`VoiceLauncher.offer`, two strings in both languages). It cannot wait for a chunk: the line is already due.
- **Two hooks for the gateway's speech-to-text** (ADR-0055 §2): before a press (`stt.gate`) and on a listening failure (`stt.failed`), plus loading `stt.js` and the microphone level it reads (`micLevel`).

Measured 2026-11-13 on the owner's Mac (`npm run build:sdk`, `gzip -9`; the size test's Node zlib reads 9 B less):

| Build | `guide.js` gzipped | `stt.js` gzipped |
|---|---|---|
| HEAD before the public-demo work | 20,324 B | (none) |
| Public-demo work as first written | 21,208 B | 1,379 B |
| Fallback UI moved into `stt.js` (notice, retry, busy, their strings, the routing between the browser's recognition and the gateway) | **20,719 B** | **2,331 B** |
| The same, with tap to hear removed entirely (measured, not kept) | 20,500 B | |

Trimming the older code without changing behaviour was tried, and fails:

- esbuild already shortens `#private` names to one or two letters.
- No class method in the files that make up `guide.js` is unused anywhere in the SDK, tests, tools, extension or experiences, nor is any UI string or CSS class.
- Whitespace inside templates is 78 B raw. esbuild's CSS minifier instead of the build's collapse saves about 130 B raw (about 40 B gzipped).
- Shared helpers for the executor's repeated find, scroll and wait code made `guide.js` larger (20,726 B): gzip already compresses the repeats, and the helpers are new code. Reverted.
- What is left to cut is behaviour: tap to hear, the speech timing metrics in traces, the log lines.

## Decision

1. The budget for `guide.js` is **21,504 bytes gzipped (21 KB)**, in `tests/unit/sdk-size.test.ts`. It is measured as before (ADR-0041): Node zlib level 9 on the built file, and CI's number wins.
2. The extra 1,024 B pay for tap to hear and the speech-to-text hooks, about 400 B. Everything else about the gateway's speech-to-text stays in `stt.js`.
3. **The next increase needs a new ADR** with the same evidence: the measurements, what was tried to avoid it, and what the bytes pay for. Code that can wait for a chunk goes in a chunk.

## Consequences

- `guide.js` is 20,719 B gzipped, 785 B under the new budget.
- About 400 B more on every Vodafone page view before the guide is used (one script, cached).
- PRD §9's performance line, T-504, the QA test plan and the open-issue list now say 21 KB.

## Pilot knobs

- `BUDGET` in `tests/unit/sdk-size.test.ts` (21,504). The other chunk budgets in the same file are unchanged.

## Revisit when

- `guide.js` is within 150 B of 21,504 again: first move code that can wait into a chunk (the agent glue in `guide.ts`, `#runAgent` and `#resumeAgent`, was ADR-0041's next candidate), then write the new ADR.
- The tap-to-hear rate in traces is low on the real site: it could then load on demand, accepting a fetch at the moment the browser refuses.
- The gateway serves brotli: measure and budget what visitors download.
