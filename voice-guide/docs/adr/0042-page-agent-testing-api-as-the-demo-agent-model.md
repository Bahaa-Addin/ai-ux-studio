# ADR-0042: page-agent's testing API is the demo's default agent model, as a replaceable preset

- Status: Accepted for demos (2026-11-05); never for customers
- Date: 2026-11-05
- Area: Agent, privacy, demo; amends ADR-0034 (agent only with a configured model)
- Owner decision: 2026-11-05, "configure that default LLM of Alibaba's page-agent.js as a modular replaceable fallback"

## Context

ADR-0034 turned the fallback agent off when no model is configured (`VG_LLM_*`), so the demo had no agent: requests like "choose the best offer" got the closest page. The owner asked for page-agent's own default model as the fallback, kept replaceable.

What that model is (checked 2026-11-05):

- page-agent's demo bundle (`page-agent.demo.js` 1.12.4) uses `qwen3.5-plus` at `https://page-ag-testing-ohftxirgbn.cn-shanghai.fcapp.run`, with no key (`NA`). The library itself (`@page-agent/llms`, which we bundle) has no default and needs a base URL and model.
- Its terms (`docs/terms-and-privacy.md`, March 2026): free, **for technical evaluation and R&D only, never production**; no personal data and no pages that show it; prompts and page HTML are not stored or used for training; requests are processed by **Alibaba Cloud in mainland China**; it can be rate-limited or withdrawn without notice.
- The endpoint accepts only page-agent's own requests: a request needs an `Origin` header, and its first message must be page-agent's official system prompt. Ours passes, because our rules go in page-agent's `instructions` block, which page-agent puts in the user message.
- page-agent's client adds `enable_thinking: false` for Qwen models by model name. Our browser agent asks for `site-default`, so that patch never runs in the page.

## Decision

1. **Presets.** `services/shared/llm-presets.ts` names models the agent can use without configuration. `VG_LLM_PRESET=<name>` fills the primary model only when `VG_LLM_BASE_URL` is not set, so setting `VG_LLM_BASE_URL` and `VG_LLM_MODEL` replaces it. An unknown name stops the gateway with an error. A preset can add request-body fields and ask for the page's origin.
2. **One preset: `page-agent-testing`.** It is the endpoint above, plus `enable_thinking: false`, plus `Origin` set to the site's first origin (where the agent runs).
3. **Only the demo commands choose it by default.** `npm run demo:live` and `demo:trail` use `VG_LLM_*` if set, otherwise `--agent <preset>`, otherwise `page-agent-testing`. `--agent off` turns the agent off. The terminal prints the model, where requests go and what the terms allow. The gateway, tests, `npm run dev`, sync and every other command have no preset unless `VG_LLM_PRESET` is set.
4. **Same path as any model.** Requests still go page-agent → our agent proxy → model, so masking of page content (ADR-0018), the session and site budgets, the traces and the commit-point rules (ADR-0017, T-308) all apply. The page never calls the testing API directly.

## Consequences

- The demo's fallback agent works out of the box: `tests/live/agent-preset.live.test.ts` (with `VG_LIVE=1`) ran "select bank card as the payment method" on the fixture site through the proxy. Measured 2026-11-05 from the owner's Mac's Linux VM in Cairo: 1 model call, `qwen3.5-plus`, 7.4 s, card selected, nothing confirmed.
- Page content (masked) and the person's request go to servers in mainland China during a demo. That is acceptable only for the owner's own demos on public pages. **Customers need D2 first** (the same data-protection decision as speech, O15), and must use a provider chosen under it.
- The demo depends on a free service with no guarantee. If it is slow or gone, the agent says its short "can't search right now" line (B-10, ADR-0034); `--agent off` or your own `VG_LLM_*` are the fallbacks.
- Unit tests: `tests/unit/llm-presets.test.ts` (no preset unless asked; your model wins; unknown names fail; the proxy sends the preset's fields and origin and still masks).

## Pilot knobs

- `VG_LLM_PRESET` (or `--agent <name>` for the demo commands); `VG_LLM_BASE_URL`, `VG_LLM_MODEL`, `VG_LLM_API_KEY` to replace it; `VG_LLM_FALLBACK_*` for a second provider; `VG_LLM_TIMEOUT_MS`.
- New presets: one entry in `services/shared/llm-presets.ts` (base URL, model, key, body fields, origin, the notice to print).

## Revisit when

- Anyone other than the owner will use the demo, or it runs on a customer's session: replace the preset with a provider approved under D2 and remove it from the demo default.
- The testing API changes its checks or terms (the live test will fail, or the terms page changes): update the preset or drop it.
- page-agent changes its system prompt in a way the testing API rejects together with our version (it checks the prompt): upgrade page-agent and the preset together.
