# ADR-0034: The agent is offered only when a model is configured; zod 4 for page-agent's schemas; "A or B?" only between options that both cover the request

- Status: Accepted (tests below)
- Date: 2026-10-23
- Area: Fallback agent, dependencies, understanding; amends ADR-0008 (zod pin), ADR-0014 (clarify rule, act intent), ADR-0017 (allowlisted type error) and ADR-0018 (no model)
- Code: `services/shared/config.ts` (`agentModelConfigured`), `services/router/handlers.ts` (`direct`, `answerTo`), `services/router/understand.ts`, `services/router/planner.ts` (`cardAround`), `services/gateway/server.ts`, `jobs/kb-builder/build.ts` (`isPageWrapper`), `packages/text/src/stopwords.ts`, `config/curated/vodafone-eg.yaml`, `config/kb/vodafone-eg.manifest.json`, `package.json`, `tools/typecheck.ts`

## Context

A demo run on the live Vodafone site on 2026-10-23 went like this (Arabic, typed):

| Said | Guide | What was wrong |
|---|---|---|
| ايه اخر العروض | تقصد إعلانتى ولا العروض؟ | Fine |
| العروض | هوديك على صفحة العروض. | Fine |
| اختر لي افضل عرض | ثواني، هدور عليها في الصفحة. … مش قادر أدور دلوقتي. | Sent to the agent, which had no model: three `503` calls |
| اشتري عرض ال ٤٠٠ ميجا | تقصد 400 mega ولا promotions-lite؟ | "promotions-lite" is the CMS template name of the page's `<section id="content">` |
| 400 mega | 400 mega. | The typed answer was a new request: language switched to English, the guide moved to `/en/promotions` and read the picture's alt text back |
| عايز افتح بيزنس | تقصد دليل الإستخدام ولا خدمات الاتصال الدولي؟ | Two half-matches on different words ("افتح الواي فاي" in a router guide, "بيزنس الدولي") |
| خطوط شركات | ثواني، هدور عليها في الصفحة. … مش قادر أدور دلوقتي. | Agent again, no model |

The console also showed `Invalid target: openapi-3.0` before every agent call.

Causes, all reproduced offline with the committed knowledge base:

1. **503.** The agent proxy answers `503 agent_unavailable` only when no `VG_LLM_*` provider is set (`npm run demo:live` prints `agent: no model configured`). The router still routed low-confidence and "act" turns to the agent because it read only `site.agent.enabled`, and page-agent retried each call three times.
2. **`Invalid target: openapi-3.0`.** page-agent's `@page-agent/llms` asks `z.toJSONSchema` for the `openapi-3.0` target, added in zod 4.1. We pinned zod 3.25.76 (ADR-0008), whose `zod/v4` lacks it; the schemas came out as plain JSON Schema. Harmless, but it buried real errors in the console.
3. **Page wrappers as sections.** Every Vodafone page has `<section id="content">` labelled with the page's English title or template name. The builder kept it as a section whose text is the start of the whole page, so it matched anything on the page and competed with the page's own cards (33 such destinations in the committed knowledge base).
4. **"Buy" was not a subscribe verb**, and standalone `ال` and `لي` were not stopwords, so they counted as unmatched words.
5. **A typed or spoken answer to "A or B?"** was routed from scratch, in the language its script suggested.
6. **"A or B?" between half-matches.** The router asked whenever the second candidate scored within 75% of the first, even when neither covered the request.
7. **Pictures known only by alt text** (164 of 165 on the Vodafone knowledge base; no vision descriptions yet) were "described" by reading the alt text, usually the words the person had just said.

## Decision

1. **No model, no agent.** `agentModelConfigured(platform)` is true when a primary or fallback provider has a base URL and a model. The router, the planner and the session start (`agentToken`, `site.agent.enabled` sent to the SDK) all use `site.agent.enabled && agentModelConfigured(...)`. Without a model, a turn that would have gone to the agent gets the closest page or "not found", and an "act" request ("اختر لي افضل عرض") is answered like any other request with the act words removed from the query.
2. **zod 4.6.5** replaces zod 3.25.76. page-agent declares `zod ^3.25 || ^4` and is developed against zod 4; our code already imports `zod/v4`, which zod 4 still ships. The allowlisted upstream type error is gone; `PageAgentCore.pushObservation` (left out of page-agent's published types) is called through a narrow cast.
3. **Page wrappers are not destinations.** `isPageWrapper` (`#content`, `#main`, `#wrapper`, `main`, `body`, `#main-content…`) is skipped by the builder. The committed knowledge base was edited the same way (33 destinations removed, version id kept) because the full crawl it was built from is not in the repository.
4. **Buy verbs** (`اشتري`, `أشتري`, `اشتريلي`, `شراء`, `buy`) are subscribe-flow labels; `ال`, `لي`, `ليا` are stopwords. The flow's existing check still sends "buy the 400 mega offer" to the promotions card, since that offer is not one of the bundle collections.
5. **Answers to "A or B?".** A clarify turn records its options (`Turn.options`). The next utterance picks an option when all its words (through synonyms) are in that option's labels and no other's; the choice keeps the question's language and intent, exactly like a tapped chip.
6. **Ask only between full matches.** "A or B?" needs the second option to cover at least half of the request (`absolute ≥ 0.5`), the same bar the first option already had. Otherwise the turn goes to the agent, or without one to the closest page.
7. **Alt-text-only pictures read their card.** For a picture whose description comes from metadata, the plan spotlights the link or card around it (`cardAround`: the nearest `a`, else the nearest `.tile`, `.card` or `.banner` that is not an image wrapper) and reads its text.

## Options considered

| Option | Outcome |
|---|---|
| Keep the agent on and say "I can't search" faster | Rejected: the person still hears "let me look" followed by an apology, and the closest page is usually right |
| Normalise tool schemas in the agent proxy instead of upgrading zod | Rejected: fixes the payload, not the warning, and keeps a type-check allowlist |
| A business synonym group (بيزنس، شركات، business) | Tried and dropped: the home page's anchor labels include "Business Data", so "خطوط شركات" went to the home page. Vodafone Business is a separate site outside our origins; this is a content gap |
| Rebuild the committed knowledge base | Not possible here: the full crawl is not in the repository. The next sync builds without page wrappers |

## Consequences

- Demos need `VG_LLM_BASE_URL`, `VG_LLM_MODEL` (and a key) for "choose the best offer" style requests; without them the guide never says "let me look" and never calls the proxy.
- Router evaluation is unchanged: Vodafone tuning 33/33, held-out 14/18 (destination 17/18), demo-telco 54/54 and 19/24, as before. "تطبيق أنا فودافون" now asks "A or B?" instead of going straight to the wrong page.
- "اختر لي افضل عرض" without a model says the closest is the offers page, even when the person is on it. "Best" is not something the deterministic router can rank.

## Pilot knobs

| Knob | Default | Effect |
|---|---|---|
| `VG_LLM_*`, `VG_LLM_FALLBACK_*` | unset | Unset now also turns agent routing off |
| `router.clarifyAt`, `router.acceptAt` | 0.3, 0.55 | Unchanged; the 0.5 coverage bar for the second option is in code |

## Revisit when

- A model is chosen (ADR-0018): measure the agent on "best offer" and "business lines" requests.
- Vision descriptions are generated (ADR-0013): pictures with real descriptions are described again, not read from their card.

## Verified by

- `tests/unit/vodafone-kb.test.ts`: no agent without a model (and agent with one); "buy the 400 mega offer" reads the offer card with no "A or B?"; no "A or B?" for "عايز افتح بيزنس"; a typed "400 mega" picks the option and stays on the Arabic page; the builder drops page wrappers (fails with the old rule).
- `npm test` 105/105, `npm run test:e2e` 30/30 (page-agent with zod 4 against the stand-in model), `npm run typecheck` clean.
