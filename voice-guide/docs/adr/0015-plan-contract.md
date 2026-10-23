# ADR-0015: The server plans, the SDK executes: plans are versioned data with a closed set of steps, and the guide never presses a commit button

- Status: Accepted (demo slice)
- Date: 2026-10-23
- Area: Contract between router and SDK
- Code: `packages/kb/src/plan.ts` (schema), `services/router/planner.ts` (builder), `packages/sdk/src/executor.ts` (runner)

## Context

The router knows what to do; only the page can do it. If the SDK decided, every site and SDK version would carry its own logic and nothing could be tested on the server. If the server sent code, a compromised server could do anything in the user's session.

## Decision

1. **A plan is JSON** validated against a schema before it leaves the server: `v` (contract version, now 1), `turnId`, `lang`, an optional opening line, `steps`, and `meta` (intent, route, destination, confidence) for the X-ray panel.
2. **Twelve step types, nothing else:** `navigate`, `waitForPage`, `reveal`, `scrollTo`, `pickItem`, `spotlight` (optionally reading fields aloud), `say`, `click`, `confirm`, `offerWatch`, `ask`, `agent`.
3. **Values come from the live page.** `pickItem` compares typed fields (money, data) on the page at run time; `spotlight.read` fills a template from the element. Prices are never stale.
4. **Commit points are never pressed.** The planner only emits `click` from curated flows, and those end in `confirm`, which spotlights the button and asks the person to press it. The SDK also refuses any `click`, and hides from the agent any element, that matches a commit target of the active knowledge base.
5. **Plans survive page loads.** Before a step that may unload the page (`navigate`, `click`), the SDK saves the cursor to the session; the SDK on the next page resumes from it. Plans older than two minutes are dropped.
6. **Deterministic.** Same knowledge base, session and request give the same plan; planning takes well under a millisecond.

## Options considered

| Option | Outcome |
|---|---|
| SDK decides from the manifest | Rejected: logic in every browser, hard to test, manifest exposed to clients. |
| Server sends JavaScript | Rejected: arbitrary code in the user's logged-in session. |
| Agent for everything (page-agent decides each step) | Rejected as the main path (ADR-0006); available as the `agent` step. |

## Consequences

- New behaviour means a new step type and an SDK release; the version field lets the server keep serving older SDKs during rollout.
- The guide's reach is limited to what the 12 steps can express; anything else goes to the agent step.

## Pilot knobs

| Knob | Default | Effect |
|---|---|---|
| Plan resume window | 120 s | How long a half-finished plan survives a page load (`packages/sdk/src/executor.ts`). |
| Step timeouts | 4 s per locate, 10 s per page wait | Raise for slow clones or the live web app. |

## Revisit when

- An SDK older than the server's plan version shows up in traces: add a compatibility shim on the server.
- A flow needs typing (e.g. a phone number): add an `input` step that only types values the person said, never values from the page.

## Verified by

- `tests/unit/kb.test.ts` (schema), `tests/unit/router.test.ts` (no click on commit targets; flows end in confirm).
- `tests/e2e/guide.e2e.test.ts`: the subscribe flow reaches the checkout page and the order is never placed.
