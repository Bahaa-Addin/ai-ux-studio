# ADR-0024: Test the real system with stand-ins only where it meets the outside world

- Status: Accepted (demo slice)
- Date: 2026-10-23
- Area: Testing
- Code: `tests/`

## Context

"Real demo, real implementation" means the tests must exercise the real code paths: the real SDK in a real browser, real HTTP, real Postgres, real page-agent. Some edges are outside our control or unreachable from CI: microphones and speakers, Jev, Laya, the vision model, the LLM, browser push services.

## Decision

Stand-ins exist only at those edges, each speaking the real protocol:

| Edge | Stand-in | Protocol it speaks |
|---|---|---|
| Microphone, speakers | `tests/e2e/browser.ts` | `SpeechRecognition` and `speechSynthesis` browser APIs |
| Jev, Laya | `tests/helpers/mock-jev.ts` | System One `POST /v1/systemone` |
| Vision model | `tests/helpers/mock-vision.ts` | OpenAI chat completions with image input |
| LLM for the agent | `tests/helpers/mock-llm.ts` | OpenAI chat completions with tool calls, reading page-agent's real prompt |
| Push service | local HTTP server in `webpush.test.ts` | Web Push (encrypted record decrypted with the subscriber's key) |
| The team's clones | `fixtures/sites/demo-telco` | Plain HTML pages on two origins |

Everything else is real: Chromium (Playwright), Postgres 16, the gateway and services over HTTP, the bundled SDK, page-agent 1.12.4.

Layers:

- **Unit** (`tests/unit`, about 1 s): text, knowledge standard, router evaluation sets, store contract on memory, Web Push, SDK value parsing.
- **Integration** (`tests/integration`, about 15 s): store contract on Postgres, ingest of the fixture site in Chromium, gateway API, the HTTP service binding.
- **End to end** (`tests/e2e`, about 20 s): the demo flow in Chromium, the loop guard, and the agent with its model down.
- **Recording** (`npm run record:demo`): the same flow at human pace on video. Watching it found two bugs that the assertions had not covered.

## Consequences

- Stand-in models are deterministic and simple; they prove the plumbing, not model quality. Model quality is measured separately (router evaluation sets, rehearsal with real keys).
- The fixture site stands in for the clones; run `npm run ingest -- --site <real-site>` and the evaluation sets against the real clones in week 1.
- One run on 2026-10-23 stalled with no test ports open and no database activity; it did not come back in three later runs. Each test now has a 120 s limit (`--test-timeout`). CI should also wrap each suite in an overall time limit, since that flag does not cover setup and teardown hooks.

## Revisit when

- A real model is chosen: add a nightly job that runs the evaluation sets and the agent requests against it (not in the per-commit suite).

## Verified by

- `npm test` and `npm run test:e2e`: 68 tests on 2026-10-23 (see the README for the latest counts).
