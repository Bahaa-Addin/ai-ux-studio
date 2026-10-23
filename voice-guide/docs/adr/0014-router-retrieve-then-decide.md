# ADR-0014: Route each turn by retrieving candidates from the knowledge base, then deciding with Jev, Laya or a local scorer behind one interface

- Status: Accepted (demo slice). Tuned on 54 requests; held-out results below.
- Date: 2026-10-23
- Area: Understanding
- Code: `services/router/understand.ts`, `deciders.ts`, `lexicon.ts`; evaluation `services/router/eval.ts`, `tools/eval-router.ts`

## Context

A spoken request must become one destination in the knowledge base, an intent (go there, read it, describe a picture, subscribe, watch, act on the page) and a confidence that decides between acting, asking and falling back. The decision models we evaluated (Jev hosted, Laya open-weight) answer a typed choice in tens of milliseconds, but take a few hundred tokens of context (Laya: 512, multilingual 1,024) and about 20 options. A site has hundreds of destinations, and page text must never reach the decision model (prompt injection: about 4 in 10 attempts changed Laya's decision in one published evaluation).

## Decision

1. **Language** comes from the words (script ratio), not from the page; the UI language is only the fallback for digits and names.
2. **Control intents** (stop, repeat, help) come from a phrase list and only when the phrase is the whole request. Never sent to a model.
3. **Intent words** come from a built-in bilingual lexicon (Egyptian Arabic and English) extended per site in the overlay: watch phrases, describe phrases, superlatives ("cheapest", "أرخص", "most data"), page-action verbs ("select", "اختار"), flow verbs from flow labels, back-references ("it", "فيها").
4. **Retrieval** narrows the knowledge base to the top 8 candidates for that intent: BM25 over labels, examples, descriptions and page titles, plus character trigrams for spelling variants; Arabic normalised (alef, ya, ta marbuta, diacritics, digits) and lightly stemmed; synonym groups from the lexicon, each query word counted once through its best synonym. Boosts: current page, watchable sections for watch, page destinations when the person says "page", and the destination's curated `priority`.
5. **Decision.** The candidates (labels only, never page text) go to a decider:
   - `jev` or `laya`: the System One API (`POST /v1/systemone`, a `choice` question over `d1..d8` plus `none`, and an `intent` question when the lexicon found none)
   - `local`: a softmax over retrieval scores, multiplied by how much of the request the best candidate covers
   Any provider failure or timeout (1.5 s) falls back to `local` for that turn; three failures in 30 s open a circuit breaker for 60 s.
6. **Routing by confidence.** At least `acceptAt` (0.55): act. Between `clarifyAt` (0.3) and `acceptAt`: ask "A or B?" if the runner-up is close and the request is mostly covered, else act. Below `clarifyAt`, or most of the request uncovered: the in-page agent (ADR-0017), or "I couldn't find that" when the agent is off.
7. **Follow-ups** use the session's last entity when the request points back ("subscribe to it") and nothing new matches strongly.

## Measured (fixture site, local decider, 2026-10-23)

| Set | Cases | Fully correct | Destination correct | Latency |
|---|---|---|---|---|
| Tuning (`utterances.yaml`) | 54 | 54 (100%) | 45/45 | p50 0.7 ms, p95 1.9 ms |
| Held-out (`utterances-heldout.yaml`), never tuned against | 24 | 18 (75%) | 22/23 (96%) | p50 1.0 ms, p95 2.5 ms |

The held-out misses are all intent or confidence, not destination: dialect morphology the lexicon does not cover ("رخيصة" for "أرخص", "اشتركلي" for "اشترك", "what's on this picture"), and short questions with low word coverage that triggered a clarifying question instead of acting. This is the gap the decision model should close: when the lexicon finds no intent, the intent question already goes to Jev or Laya.

## Options considered

| Option | Outcome |
|---|---|
| Send the whole request and all destinations to an LLM | Rejected: slow, costly, and an LLM given page-derived text can be steered. |
| Jev or Laya over all destinations | Not possible: context and option limits. Retrieval first is required. |
| Embeddings for retrieval | Deferred: no hosted embedding model approved yet; BM25 plus trigrams is deterministic and explainable in the X-ray panel. The retrieval module is one file to swap. |
| Lexicon only, no decision model | Kept as the always-available fallback. Measured above. |

## Consequences

- The router works with no external model at all, so the demo never depends on a third-party API.
- Every decision is explainable: the X-ray panel shows candidates, scores, provider and confidence.
- Dialect coverage is now a curation task (lexicon in the overlay) and a model task (intent question), both measurable with the evaluation sets.

## Pilot knobs

| Knob | Default | Effect |
|---|---|---|
| `router.decider` (site config) | `local` | `jev`, `laya` or `local`. |
| `router.acceptAt`, `router.clarifyAt` | 0.55, 0.3 | Higher `acceptAt` asks more often; lower `clarifyAt` sends less to the agent. |
| `router.topK` | 8 | Candidates sent to the decision model (Laya handles about 20). |
| `JEV_API_KEY`, `JEV_MODEL`, `JEV_TIMEOUT_MS` | none, `jev-latest`, 1500 | Hosted Jev. |
| `LAYA_BASE_URL`, `LAYA_API_KEY`, `LAYA_TIMEOUT_MS` | none, none, 1500 | Self-hosted `laya-serve`. |
| Destination `priority` (overlay) | 1 | Prior for ambiguous requests. |
| `lexicon.synonyms`, `lexicon.intents` (overlay) | fixture values | Dialect words and site-specific phrasings. |

## Revisit when

- Run `npm run eval:router -- --decider jev` and `--decider laya` with real keys on both sets in week 1. Switch the default to the decider with the best held-out score at p95 under 400 ms.
- Held-out accuracy below 85% after the first rehearsal: add the failing requests to the tuning set, curate, and write new held-out lines.
- Laya is chosen: route Arabic to `laya-multilingual` and check its 1,024-token limit against the longest request plus options.

## Verified by

- `tests/unit/router.test.ts`: tuning set must pass in full; held-out destination accuracy floor of 90%; Jev/Laya request shape against a stand-in server, `none` handling, fallback, breaker, timeout.
