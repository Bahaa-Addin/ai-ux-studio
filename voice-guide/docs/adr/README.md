# Architecture decision records

ADR-0001 to ADR-0005 belong to the page watch prototype and live in the project's `page-watch-adrs.md`. This repository continues the numbering. To change a decision, add a new ADR that supersedes it and update the old one's status.

ADR-0026 to ADR-0030 are **Proposed** for the Vodafone live phase: the build prompt (`docs/prompts/vodafone-live-demo.prompt.md`) implements them, and each is accepted when its spec's acceptance criteria pass. Change the status line and the table row when that happens.

Each ADR ends with **Pilot knobs** (what can be tuned without code) and **Revisit when** (the measurement that should reopen it). `docs/pilot-tuning.md` collects all knobs in one place.

| # | Decision | Area | Status |
|---|---|---|---|
| [0006](0006-platform-shape.md) | One SDK script tag plus stateless services behind one gateway | Architecture | Accepted |
| [0007](0007-runtime-and-language.md) | TypeScript on Node 22 with type stripping; esbuild for the SDK | Tooling | Accepted |
| [0008](0008-dependency-policy.md) | A small, pinned set of dependencies; Node built-ins for the rest | Dependencies | Accepted; zod pin amended by 0034; rrweb added by 0035 |
| [0009](0009-repo-and-service-seams.md) | One repository; each service runs in-process or over HTTP with the same handlers | Code organisation | Accepted |
| [0010](0010-postgres-single-store.md) | Postgres is the only shared store; Redis deferred | Data | Accepted; changes the demo plan |
| [0011](0011-site-knowledge-standard.md) | A site knowledge standard (v0.1) | Knowledge base | Accepted |
| [0012](0012-ingestion-from-clones.md) | Crawl the clones in a real browser; immutable versions, explicit activation | Ingestion | Accepted |
| [0013](0013-visual-understanding-at-crawl-time.md) | Understand images, canvas, SVG and WebGL at crawl time; serve text | Visuals | Accepted |
| [0014](0014-router-retrieve-then-decide.md) | Retrieve candidates, then decide with Jev, Laya or a local scorer | Understanding | Accepted |
| [0015](0015-plan-contract.md) | The server plans, the SDK executes; commit buttons are never pressed | Contract | Accepted |
| [0016](0016-sessions-across-pages-and-origins.md) | One conversation across page loads and origins | Sessions | Accepted |
| [0017](0017-page-agent-as-pinned-fallback.md) | page-agent 1.12.4 as a pinned, wrapped fallback, not a fork | Fallback agent | Accepted; amended by 0034 |
| [0018](0018-agent-proxy.md) | One agent proxy holds keys, masks data, enforces budgets, falls back | Model access | Accepted |
| [0019](0019-speech-in-the-browser.md) | Web Speech API with Egyptian Arabic and English; typing always available | Speech | Accepted; changes the demo plan |
| [0020](0020-brand-and-ui-in-shadow-dom.md) | UI in one shadow root, themed from the host page | UI and brand | Accepted |
| [0021](0021-tracing-and-xray.md) | Every layer records trace events; X-ray and analysis read them | Observability | Accepted |
| [0022](0022-edge-security.md) | Site keys, origin checks, signed agent tokens, rate limits | Security | Accepted |
| [0023](0023-page-watch-on-the-platform.md) | Page watch on the platform: rendered checks, push or live delivery | Page watch | Accepted; supersedes part of ADR-0004 |
| [0024](0024-testing-with-fakes-only-at-the-edges.md) | Test the real system with stand-ins only at the edges | Testing | Accepted |
| [0025](0025-configuration-per-site.md) | Two YAML files per site; environment variables per environment | Configuration | Accepted |
| [0026](0026-real-pages-via-tag-manager-and-demo-browser.md) | Real Vodafone pages: Tealium tag in production, loader-injecting demo browser for the demo | Live site integration | Proposed; amended by 0031, 0033 |
| [0027](0027-voice-first-launcher-one-microphone-stream.md) | Voice-first launcher: microphone button, one microphone stream for recognition and waveform, transcript bar | Speech and UI | Proposed; mostly verified |
| [0028](0028-live-knowledge-sync.md) | Live knowledge sync: seeds plus sitemap lastmod, polite crawling, path language pairing, gated activation | Ingestion | Proposed; on demand done (0033) |
| [0029](0029-vodafone-theme-as-fixed-tokens.md) | Fixed Vodafone token set on Vodafone sites | UI and brand | Proposed; partly verified |
| [0030](0030-sdk-follows-spa-route-changes.md) | The SDK follows single-page-app route changes | Session continuity | Accepted (fixture) |
| [0031](0031-gateway-behind-the-page-origin-and-long-poll-events.md) | Demo browser reaches the gateway through the page's own origin (`/__vg`); events fall back to long polling | Live site integration | Accepted; amends 0026 |
| [0032](0032-in-browser-crawler-public-pages-only.md) | Crawl the live site from a real browser tab when needed; public pages only; scheduled crawling paused | Ingestion | Accepted |
| [0033](0033-google-chrome-for-speech-and-on-demand-sync-gate.md) | Demo browser is the installed Google Chrome (speech); on-demand sync gate; scheduled runs refused while paused; aliases | Live site integration, sync | Accepted; amends 0026 |
| [0034](0034-agent-only-with-a-model-zod-4-and-clarify-between-full-matches.md) | The agent is offered only when a model is configured; zod 4; "A or B?" only between full matches; page wrappers dropped; typed answers to "A or B?" | Fallback agent, understanding | Accepted; amends 0008, 0014, 0017, 0018 |
| [0035](0035-rrweb-for-local-journey-replay.md) | Exploration Trail: `@rrweb/record` and `@rrweb/replay` 2.2.0, pinned with overrides, in their own on-demand chunks; `guide.js` gets a gate only | Dependencies, SDK | Accepted for the prototype; amends 0008 |
| [0036](0036-journey-memory-knowledge-and-experience-profile-are-separate.md) | Local journey memory, canonical site knowledge and the `site-experience-profile/v1` are three layers; questions are generated offline and verified by the router | Data, knowledge base | Accepted for the prototype |
| [0037](0037-trail-consent-retention-masking-and-aggregation-boundary.md) | Trail consent, 24 h local retention, masking and blocking, public routes only, sanitized credential-free replay; anonymous aggregation built but off | Privacy and security | Accepted for the prototype; customers need D2 |
| [0038](0038-trail-timeline-inside-the-guide-and-chips-through-the-turn-pipeline.md) | The timeline lives in the guide's shadow root with an explicit state machine; question chips are ordinary turns with a hint the router verifies | UI, understanding | Accepted for the prototype |
| [0039](0039-trail-across-origins-boundaries-not-uploads.md) | Across origins the trail shows boundaries; replays are never uploaded to join them | Session continuity, privacy | Accepted for the prototype |
| [0040](0040-trail-journey-hosted-in-the-pocket.md) | On Vodafone the journey is shown in the Services clone's Pocket, in its own design; the demo runs on Vodafone pages only | UI, demo | Accepted for the prototype |
| [0041](0041-page-watch-announcements-in-the-watch-chunk.md) | Page-watch announcements load with the watch chunk, not with guide.js (size budget) | SDK size, page watch | Accepted |
| [0042](0042-page-agent-testing-api-as-the-demo-agent-model.md) | page-agent's testing API is the demo's default agent model, as a replaceable preset; never for customers | Agent, privacy, demo | Accepted for demos |
| [0043](0043-arabic-services-clone-and-journey-host-by-language.md) | An Arabic Services clone at /ar/services; the journey's host page follows the page's language (`{lang}` in `hostUrl`) | UI, demo | Accepted for the prototype; amends 0040 |
| [0044](0044-pocket-corner-tucks-in-during-the-reimagine-view.md) | In the Reimagine view the Pocket corner tucks in and the right-hand column stays lifted | UI, floating controls | Accepted |
| [0045](0045-tips-walkthrough-of-the-four-demos.md) | Tips: an Apple Tips-style walkthrough of the four demos in the Services clone, with "Try it" coach marks on the real controls; the button bottom-left | UI, onboarding, floating controls | Proposed |
| [0046](0046-all-demos-live-on-vodafone-pages.md) | All five demos run on Vodafone's real pages as one experience layer injected beside the guide (live adapter, Pocket-hosted journey, real demo kit); the clone is retired | Architecture, delivery, demo | Direction accepted 2026-11-10; design proposed; supersedes 0040 and 0043 at phase 9 |
| [0047](0047-voicetut-speaks-for-the-guide.md) | VoiceTut speaks the guide's replies through the gateway (synthesised ahead, cached, first sentence first), with the browser voice as the fallback; owner's demos only | Speech output, privacy, demo | Direction accepted 2026-11-10; design proposed |

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
| End-to-end test (SPA routes) | Back during a plan did not stop it in Chromium: the Navigation API's `navigatesuccess` arrived before `popstate` and the URL de-duplication swallowed the Back signal | Back is checked before de-duplication (ADR-0030, `packages/sdk/src/guide.ts`) |
| Palette test | The chip hover used `#fff5f5`, a colour outside SPEC-01 | Palette grey `--vf-bg` (ADR-0029) |
| Sync gate, first real run | Five seeds looked missing: redirects into `/spa/` and a second spelling of a page were dropped | Aliases (ADR-0033) |
| Demo browser review | Chromium has no speech service; the guide said "I didn't catch that" | Google Chrome for the demo; a plain "not available, type instead" message (ADR-0033) |
| End-to-end test (flaky, then steady) | The agent's per-step saves were sent without waiting; one could land after the final "done" and bring a finished agent task back on the next page load | Saves are chained in order (ADR-0017, `packages/sdk/src/guide.ts`) |
| End-to-end test (flaky) | The X-ray backlog was the last 60 events, so after an agent turn earlier turns lost their first rows | Backlog of whole recent turns (ADR-0033) |
| Demo run on the live site | With no model configured, low-confidence and "act" turns went to the agent: "let me look", three 503s, "I can't search right now" | Agent routing needs a configured model (ADR-0034) |
| Demo run on the live site | "Did you mean 400 mega or promotions-lite?": every page's `#content` wrapper was a section labelled with its template name | Page wrappers are not destinations (ADR-0034) |
| Demo run on the live site | A typed "400 mega" after "A or B?" switched to English, moved to `/en/promotions` and read the alt text back | Typed answers pick an option and keep the language; alt-only pictures read their card (ADR-0034) |
| Demo run on the live site | "Open a business" offered a router guide or international calls, two half-matches | "A or B?" needs both options to cover the request (ADR-0034) |
| Exploration Trail walkthrough | With the Home internet tab open, "What does Mega 25 include?" spotlit a card hidden in the closed Mobile tab: the crawler had seen that tab open, so the item had no reveal step | On the same page, a list in a tab panel gets a reveal of its own tab, skipped when visible (SPEC-06 §1, `services/router/planner.ts`) |
| Exploration Trail end-to-end test | Leaving a page right after recording started stored only rrweb's Meta event: the first full snapshot comes a moment later | Buffered events are written when a link is activated; a visit shorter than the first snapshot has no preview, by design (ADR-0035) |
