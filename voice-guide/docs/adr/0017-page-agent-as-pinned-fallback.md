# ADR-0017: Use page-agent 1.12.4 as a pinned, wrapped fallback, not a fork

- Status: Accepted (demo slice); amended by ADR-0034 (zod 4, no allowlisted type error; no agent routing without a model). Implements the fork-or-build evaluation ("neither: wrap the DOM layer, own the orchestration").
- Date: 2026-10-23
- Area: Fallback agent
- Code: `packages/sdk/src/agent.ts`, `packages/sdk/build.ts`
- Amended by [ADR-0058](0058-commit-guard-in-code-and-guided-commit-step.md) (2026-11-13): `customTools` now replace four tools (`click_element_by_index`, `input_text`, `select_dropdown_option`, each checked against commit controls) and add `show_person_where`; `execute_javascript` stays out (page-agent adds it only with `experimentalScriptExecutionTool`, which is never set). A test pins the exact tool set (`tests/e2e/guide.e2e.test.ts`, AIXC-78)

## Context

Requests the knowledge base cannot plan ("select bank card as the payment method", "click on coverage") still deserve an answer. page-agent (Alibaba, MIT) already turns a live page into indexed text and clicks, types and scrolls reliably; its core loop calls an LLM once per step. Forking it would make us own a fast-moving codebase; its maintainer does not accept unplanned contributions.

## Decision

1. **Pinned dependency:** `@page-agent/core`, `@page-agent/page-controller` and `@page-agent/llms` at 1.12.4, bundled into a separate `agent.js` (132 KB) that is loaded only when a plan contains an `agent` step. The main SDK stays at 42 KB (15 KB gzipped).
2. **Headless core, our UI:** `PageAgentCore` with `PageController`; page-agent's own panel and mask are not used (its mask and logging are stubbed at build time).
3. **Wrapped, not modified.** Everything we need goes through its public options:
   - `baseURL` is our agent proxy and `apiKey` a 30-minute session token (ADR-0018)
   - `interactiveBlacklist` hides commit buttons from the agent (no index, so no click)
   - `data-page-agent-ignore` on the guide's own element hides our panel from the agent
   - `transformPageContent` masks phone numbers, emails and card numbers before content leaves the browser
   - `instructions.system` sets the reply language, the "show, don't buy" rule and hints from retrieval
   - `customTools` replace two tools: `click_element_by_index` saves progress before clicking (a click may unload the page), and `input_text` only types values the person said in the request
4. **Across pages:** after every step (and before every click) the SDK saves the step log to the session. On the next page the agent starts again with the same task, the remaining step budget and an observation listing the steps already done.
5. **Limits:** `agent.maxSteps` (12) across all pages, `agent.timeoutSec` (60) for the whole task, the loop guard (ADR-0016), and the proxy's budgets (ADR-0018).
6. **Only the model's own words are spoken.** page-agent returns error messages (model unreachable, step limit, timeout) in the same field as the model's answer. The SDK checks whether the task ended on an error event; if so the person hears a short line in their language ("I can't search the page right now") and the error goes to the `agent.done` trace.

## Options considered

| Option | Outcome |
|---|---|
| Fork page-agent | Rejected: we change nothing inside it; upgrades would turn into merges. |
| Write our own DOM agent | Rejected for now: DOM extraction and reliable clicking across real markup is the hardest part, and page-agent's is good. |
| Agent only on the server (headless browser) | Rejected: not the person's screen or session. |
| No fallback | Rejected: "I can't" for every unplanned request makes the demo brittle under audience questions. |

## Consequences

- The guide can act on anything visible, at the cost of one LLM call per step (about 4,000 prompt tokens per step on the fixture pages).
- page-agent's prompt and parsing are tuned for capable tool-calling models; small models may fail. The model choice is a proxy setting (ADR-0018).
- Upgrades: bump the three packages together, rebuild, run `npm run typecheck` and `tests/e2e`.
- page-agent ships TypeScript sources, so our SDK typecheck also checks them. One known upstream mismatch is allowlisted by exact file and error code in `tools/typecheck.ts`: `@page-agent/llms` asks zod for the `openapi-3.0` JSON Schema target, which needs zod 4.1 or later. With our zod 3.25 the browser console shows "Invalid target: openapi-3.0" once per tool and the tool schemas come out as plain JSON Schema (no `$schema` key), which OpenAI-compatible endpoints accept. Any other upstream type error fails the check.

## Pilot knobs

| Knob | Default | Effect |
|---|---|---|
| `agent.enabled` (site) | true | Off: unplanned requests get "closest page" or "not found". |
| `agent.maxSteps` (site) | 12 | Total steps across pages. |
| `agent.timeoutSec` (site) | 60 | Whole-task limit. |

## Revisit when

- More than 30% of turns go to the agent: curate the knowledge base first (ADR-0006).
- page-agent changes `customTools`, `interactiveBlacklist` or the `data-page-agent-ignore` behaviour: these are the four seams we depend on; the end-to-end tests check each.
- The pilot's model provider rejects the tool schemas (check on the first real call; a 400 naming `parameters` is the sign): move the repo to zod 4.1+ or normalise schemas in the agent proxy.

## Verified by

- `tests/e2e/guide.e2e.test.ts`: the agent selects "Bank card" through the proxy; the pay button has no index; the guide's panel is not in the page content; a click that navigates continues on the next page with the step count carried over; the loop guard.
- `tests/unit/sdk.test.ts`: masking.
