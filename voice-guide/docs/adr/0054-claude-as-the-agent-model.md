# ADR-0054: Claude, through Anthropic's SDK, is the fallback agent's model for public use

- Status: Proposed (built 2026-11-13 against a fake API; accepted after a live run with a real key)
- Date: 2026-11-13
- Area: fallback agent, dependencies (ADR-0008), privacy; replaces ADR-0042's preset for anything public

## Context

ADR-0042 lets the demo use page-agent's free testing API (Qwen on Alibaba Cloud, evaluation only) and says to revisit "when anyone other than the owner will use the demo". The public demo is that moment. The agent runs page-agent in the browser, which speaks the OpenAI chat-completions shape to the gateway's proxy (`/v1/agent/chat/completions`), which holds the keys, masks page data and enforces budgets (ADR-0018).

## Decision

1. `VG_LLM_PROVIDER=anthropic` makes the proxy's primary model Claude, called with the **official Anthropic TypeScript SDK** (`@anthropic-ai/sdk`, pinned 1.2.0; the one new dependency). Default model `claude-opus-5-5` (`VG_LLM_MODEL` overrides), effort `low` (`VG_LLM_EFFORT`): a page step is a short decision people wait on.
2. The proxy translates in both directions (`services/agent/anthropic.ts`), so nothing changes in the browser: system messages to `system`, `tool_calls` and role `tool` to `tool_use` and `tool_result`, Claude's reply back to `tool_calls` and `finish_reason`. Current Claude models do not accept forced tool choice, so `tool_choice: "required"` or a named tool becomes `auto` plus one system line naming the tool; `parallel_tool_calls: false` stays one call per step. The conversation prefix is cached (page-agent resends it each step). The server-side refusal fallback (beta `server-side-fallback-2026-07-01`, `fallbacks: "default"`) answers with another model where a refusal category allows; a refusal that stands reaches page-agent as `content_filter`.
3. A public gateway refuses the testing preset (ADR-0053 §2). The demo browser keeps it as before unless `VG_LLM_*` says otherwise.

## Consequences

- Page content is masked before it leaves (unchanged), and goes to Anthropic in the US. This needs the same data-protection note as the voice (ADR-0055).
- Cost is per step: the session and site token budgets apply as before (`VG_AGENT_TOKENS_PER_SESSION`, `VG_AGENT_TOKENS_PER_SITE_DAY`). Cache reads count as prompt tokens in our budgets, which overstates spend a little; that is the safe side.
- Previous turns' thinking blocks are not passed back (page-agent keeps OpenAI-shaped history); each step thinks afresh, which suits short steps.

## Pilot knobs

`VG_LLM_PROVIDER` (openai), `VG_LLM_MODEL` (claude-opus-5-5 with anthropic), `VG_LLM_EFFORT` (low), `VG_LLM_API_KEY` or `ANTHROPIC_API_KEY`, `VG_LLM_TIMEOUT_MS`, the agent quotas.

## Revisit when

Step latency or cost in traces is too high (try `claude-sonnet-5-5` or `claude-haiku-5-5` with the same knobs, measured on the agent evaluation); page-agent gains a native Anthropic client; Vodafone names a model provider.
