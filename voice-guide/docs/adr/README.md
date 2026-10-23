# Architecture decision records

ADR-0001 to ADR-0005 belong to the page watch prototype and live in the project's `page-watch-adrs.md`. This repository continues the numbering. To change a decision, add a new ADR that supersedes it and update the old one's status.

ADR-0026 to ADR-0030 are **Proposed** for the Vodafone live phase: the build prompt (`docs/prompts/vodafone-live-demo.prompt.md`) implements them, and each is accepted when its spec's acceptance criteria pass. Change the status line and the table row when that happens.

Each ADR ends with **Pilot knobs** (what can be tuned without code) and **Revisit when** (the measurement that should reopen it). `docs/pilot-tuning.md` collects all knobs in one place.

| # | Decision | Area | Status |
|---|---|---|---|
| [0006](0006-platform-shape.md) | One SDK script tag plus stateless services behind one gateway | Architecture | Accepted |
| [0007](0007-runtime-and-language.md) | TypeScript on Node 22 with type stripping; esbuild for the SDK | Tooling | Accepted |
| [0008](0008-dependency-policy.md) | A small, pinned set of dependencies; Node built-ins for the rest | Dependencies | Accepted |
| [0009](0009-repo-and-service-seams.md) | One repository; each service runs in-process or over HTTP with the same handlers | Code organisation | Accepted |
| [0010](0010-postgres-single-store.md) | Postgres is the only shared store; Redis deferred | Data | Accepted; changes the demo plan |
| [0011](0011-site-knowledge-standard.md) | A site knowledge standard (v0.1) | Knowledge base | Accepted |
| [0012](0012-ingestion-from-clones.md) | Crawl the clones in a real browser; immutable versions, explicit activation | Ingestion | Accepted |
| [0013](0013-visual-understanding-at-crawl-time.md) | Understand images, canvas, SVG and WebGL at crawl time; serve text | Visuals | Accepted |
| [0014](0014-router-retrieve-then-decide.md) | Retrieve candidates, then decide with Jev, Laya or a local scorer | Understanding | Accepted |
| [0015](0015-plan-contract.md) | The server plans, the SDK executes; commit buttons are never pressed | Contract | Accepted |
| [0016](0016-sessions-across-pages-and-origins.md) | One conversation across page loads and origins | Sessions | Accepted |
| [0017](0017-page-agent-as-pinned-fallback.md) | page-agent 1.12.4 as a pinned, wrapped fallback, not a fork | Fallback agent | Accepted |
| [0018](0018-agent-proxy.md) | One agent proxy holds keys, masks data, enforces budgets, falls back | Model access | Accepted |
| [0019](0019-speech-in-the-browser.md) | Web Speech API with Egyptian Arabic and English; typing always available | Speech | Accepted; changes the demo plan |
| [0020](0020-brand-and-ui-in-shadow-dom.md) | UI in one shadow root, themed from the host page | UI and brand | Accepted |
| [0021](0021-tracing-and-xray.md) | Every layer records trace events; X-ray and analysis read them | Observability | Accepted |
| [0022](0022-edge-security.md) | Site keys, origin checks, signed agent tokens, rate limits | Security | Accepted |
| [0023](0023-page-watch-on-the-platform.md) | Page watch on the platform: rendered checks, push or live delivery | Page watch | Accepted; supersedes part of ADR-0004 |
| [0024](0024-testing-with-fakes-only-at-the-edges.md) | Test the real system with stand-ins only at the edges | Testing | Accepted |
| [0025](0025-configuration-per-site.md) | Two YAML files per site; environment variables per environment | Configuration | Accepted |
| [0026](0026-real-pages-via-tag-manager-and-demo-browser.md) | Real Vodafone pages: Tealium tag in production, loader-injecting demo browser for the demo | Live site integration | Proposed |
| [0027](0027-voice-first-launcher-one-microphone-stream.md) | Voice-first launcher: microphone button, one microphone stream for recognition and waveform, transcript bar | Speech and UI | Proposed; amends 0019, 0020 |
| [0028](0028-live-knowledge-sync.md) | Live knowledge sync: seeds plus sitemap lastmod, polite crawling, path language pairing, gated activation | Ingestion | Proposed; extends 0012 |
| [0029](0029-vodafone-theme-as-fixed-tokens.md) | Fixed Vodafone token set on Vodafone sites | UI and brand | Proposed; amends 0020 |
| [0030](0030-sdk-follows-spa-route-changes.md) | The SDK follows single-page-app route changes | Session continuity | Proposed; extends 0016 |

## Changes to the demo plan these decisions made

- **No Redis** for the demo or pilot start (ADR-0010).
- **No server-side speech service**: the browser listens and speaks (ADR-0019).
- **A live delivery channel** for page watch next to Web Push (ADR-0023).
- **An "act" intent**: requests to do something on the page ("select bank card") go straight to the fallback agent (ADR-0014).
- **Destination priority** in the knowledge standard for ambiguous requests (ADR-0011, ADR-0014).

## Bugs found while building, and the decision each one changed

| Found by | Bug | Fix and where it is recorded |
|---|---|---|
| End-to-end test | A reveal step said "already visible" because a hidden tab panel's heading matched the visible tab button's text | Text matching only when no selector matches (ADR-0011 targets, `packages/sdk/src/dom.ts`) |
| End-to-end test | The agent saw and could click the guide's own panel | `data-page-agent-ignore` on the guide (ADR-0017) |
| End-to-end test | An agent click that loaded a new page restarted the same plan step: one LLM call per page load | Agent hands off from the plan; saves before each click; loop guard (ADR-0016, ADR-0017) |
| Video review | The X-ray drawer was half on screen on Arabic pages | Physical left docking (ADR-0020) |
| Video review | Watch notifications were announced again after every page load | Announce each change once per tab (ADR-0023) |
| Router evaluation | Synonym expansion let "home page" match home internet | Each query word scores once through its best synonym (ADR-0014) |
| Documentation review | With the model down, the guide would have read page-agent's raw English error aloud to an Arabic speaker | Speak only the model's own `done` text; errors go to the trace (ADR-0017) |
| Typecheck | page-agent's sources ask zod for a schema target our zod version lacks | Known upstream mismatch, allowlisted by file and code; runtime output checked (ADR-0017) |
