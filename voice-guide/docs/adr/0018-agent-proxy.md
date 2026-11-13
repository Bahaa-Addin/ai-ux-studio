# ADR-0018: All large-model calls go through one agent proxy that holds the keys, masks personal data, enforces budgets and falls back between providers

- Status: Accepted (demo slice)
- Date: 2026-10-23
- Area: Model access, cost, privacy
- Code: `services/agent/handlers.ts`, gateway route `/v1/agent/chat/completions`
- Amended (2026-11-13, e-shop plan step E3; AGENTS.md 4.3 as approved that day in ADR-0059: never store personal data anywhere): §3 still holds for the page the person is on: the plan sent there keeps their words, so the agent may type a number they said. What we keep is masked: the session's turn, its copy of the planned agent task and the agent's saved task and steps (carried to the next page, ADR-0017), and every trace and log line (`services/shared/clean.ts`). The person's own words for the task stay in the tab (`sessionStorage`, same origin) for the next page of the same task, so the number can still be typed there; across origins, or when the tab has lost it, the agent asks the person, and what the person answers counts as said (AIXC-86). The saved steps keep that something was typed or chosen, never what (AIXC-83); the session's turn keeps none of the request's words. The masking rules also cover landlines, mobiles written with the prefix or the leading zero split or missing, and cards grouped by dots (AIXC-90). The secret-field words also catch `nationalId`, `national_id`, `nid` and "ID number"

## Context

The fallback agent runs in the browser but must never hold an API key. Each agent step sends a few thousand tokens of page content; page content can include the person's phone number or account details; a looping or abused agent could spend a lot.

## Decision

1. The SDK's agent calls `POST {gateway}/v1/agent/chat/completions` (OpenAI-compatible). Authorization is a token signed by the gateway (HMAC-SHA256) for one site and one session, valid 30 minutes. No provider key is ever sent to the browser.
2. **The proxy picks the model.** Whatever model the browser asks for is replaced with `VG_LLM_MODEL`.
3. **Masking twice:** the SDK masks page content before sending (ADR-0017); the proxy masks again, only inside `<browser_state>`, so the person's own request ("type my number 0101…") is kept while numbers read from the page are not.
4. **Budgets:** per session (`VG_AGENT_STEPS_PER_SESSION` 60 steps, `VG_AGENT_TOKENS_PER_SESSION` 400k tokens) and per site per day (`VG_AGENT_TOKENS_PER_SITE_DAY` 20M tokens). Over budget returns 429, which the SDK turns into "I can't search the page right now".
5. **Fallback provider:** on a network error, timeout, 5xx, 408 or 429 from the primary, the same request goes to `VG_LLM_FALLBACK_*`. A 4xx client error is not retried elsewhere.
6. **Every call is traced** (`agent.llm`: provider, model, prompt and completion tokens, masked count, duration), which is what the X-ray panel and cost review read.

## Options considered

| Option | Outcome |
|---|---|
| Provider key in the page (page-agent's demo setup) | Rejected: anyone can read and spend it. |
| A generic API gateway product (LiteLLM, Portkey) | Deferred: works with this design (point `VG_LLM_BASE_URL` at it), but site-aware budgets and page-content masking still belong here. |

## Consequences

- No agent without a configured model: `GET /health` shows `agent.available`; the SDK says it cannot search.
- Token budgets are enforced after each call (the call that crosses the line still completes).
- Masking rules are regular expressions for Egyptian phone numbers, emails and card numbers; other personal data in page content is not masked. The account pages need a review before the agent is enabled there.

## Pilot knobs

| Knob | Default | Effect |
|---|---|---|
| `VG_LLM_BASE_URL`, `VG_LLM_API_KEY`, `VG_LLM_MODEL` | unset | Primary provider (any OpenAI-compatible API with tool calls). |
| `VG_LLM_FALLBACK_BASE_URL`, `_API_KEY`, `_MODEL` | unset | Second provider. |
| `VG_LLM_TIMEOUT_MS` | 30000 | Per call. |
| `VG_AGENT_STEPS_PER_SESSION`, `VG_AGENT_TOKENS_PER_SESSION`, `VG_AGENT_TOKENS_PER_SITE_DAY` | 60, 400000, 20000000 | Budgets. |

## Revisit when

- The model is chosen: record which model and why in a new ADR, with the agent's success rate on the rehearsal requests.
- Account pages are in scope for the agent: extend masking (names, addresses, account numbers) and review with the data protection owner.

## Verified by

- `tests/integration/gateway.test.ts`: forged token rejected, model replaced, page phone and email masked while the request keeps its number, session budget returns 429 and is traced, fallback provider used after a 503.
