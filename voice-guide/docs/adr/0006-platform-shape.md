# ADR-0006: Build the voice guide as one SDK script tag plus stateless services behind one gateway

- Status: Accepted (demo slice)
- Date: 2026-10-22
- Area: Overall architecture
- Related: demo plan "Voice guide: branded website demo plan"; ADR-0001 (server-side change detection); supersedes ADR-0003 for the guide (ADR-0003 stays valid for the page watch prototype until page watch moves onto this platform, see ADR-0023)

## Context

The demo must be real and unscripted, run on our cloned pages, and be the same build that later serves the live website and the consumer web app. A spoken request passes five layers: listen, understand, navigate, act, show. Most requests should be answered from our own knowledge base and recorded paths, without a large language model, so they are fast, cheap and predictable. Anything unknown falls back to an in-page agent.

## Decision

1. **Browser.** A Guide SDK loaded by one script tag. It captures speech or typed text, executes plans, keeps local session state, draws the UI and reports what happened. It never decides what the user meant.
2. **Edge.** One gateway is the only public endpoint. It checks site keys and origins, rate-limits, starts a trace per request and forwards to services.
3. **Real-time services**, each stateless:
   - router: understands a turn (intent, destination, confidence) and builds the plan (ADR-0014, ADR-0015)
   - knowledge: serves immutable, versioned site manifests (ADR-0011, ADR-0012)
   - sessions: conversation state and cross-origin handoff (ADR-0016)
   - agent proxy: the only path to a large model, for the fallback agent (ADR-0017, ADR-0018)
   - watch: page watch and Web Push (ADR-0023)
4. **Ingestion jobs**, off the request path: crawler, describer, KB builder.
5. **Data.** Postgres (ADR-0010).
6. **Contract.** The server plans; the SDK executes. Plans are versioned data, not code (ADR-0015).

## Options considered

| Option | Outcome |
|---|---|
| page-agent alone in the page for every request | Rejected. One LLM round trip per step, around 15,000 tokens per page, unpredictable on stage. Kept as the fallback only. |
| Server-side headless browser that drives the site for the user | Rejected. It is not the user's screen or session, so it cannot "take them there". Used only for crawling. |
| Declared actions in the site's code (CopilotKit style, WebMCP) | Deferred. Needs changes to the site's code; our clones are unmodified copies. The knowledge standard can export to WebMCP later (ADR-0011). |
| One process doing everything | Rejected as the shape, kept as a deployment mode (ADR-0009). |

## Consequences

- Moving from clones to the live site is a script tag, a site key and an allowed origin, with no code change.
- Every layer can be measured separately, which the X-ray panel shows live (ADR-0021).
- The SDK stays small: the agent code is a separate chunk loaded only on the fallback path.
- Correctness depends on the knowledge base being fresh, so crawling and validation become an operational job (ADR-0012).

## Pilot knobs

| Knob | Default | Effect |
|---|---|---|
| `VG_SERVICES` | `local` | `local` runs all services in the gateway process; `http` calls each service at its own URL (ADR-0009). |
| `agent.enabled` (site config) | `true` | Turns the fallback agent off for a site; unknown requests then get the closest page. |

## Revisit when

- More than about 30% of turns end in the fallback agent: the knowledge base is too thin; invest in curation before tuning the agent.
- The web team can change the live site's code: consider declaring actions in the page (WebMCP) for the flows that matter most.

## Verified by

- `tests/e2e/guide.e2e.test.ts` drives the SDK on the fixture site through every layer.
- `tests/integration/gateway.test.ts` runs the gateway with real Postgres.
