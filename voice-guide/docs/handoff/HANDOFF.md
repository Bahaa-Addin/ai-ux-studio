# Handoff: voice guide, Vodafone live phase

> Keep this file current. Every agent or engineer updates §2, §3, §5, §6 and appends to §8 at the end of each task (AGENTS.md §5.7).

- Last updated: 2026-10-23
- Branch: `feature/voice-guide-vodafone` (from `feature/aixc-phase1`) in `Bahaa-Addin/ai-ux-studio`
- Directory: `voice-guide/`
- Owner: Bahaà Addin Balashoni

## 1. In one paragraph

The voice guide platform works end to end on fixture sites: an SDK script tag, a gateway, five services, Postgres, ingestion jobs and a wrapped page-agent fallback. It has 68 passing tests and 25 ADRs. This phase takes it onto the **real Vodafone Egypt website** (CMS pages, the `/spa/` Angular app and the shop), makes it **voice first** (a Vodafone-style microphone button, a small black bar with the transcript word by word, and a live waveform), restyles everything in **Vodafone's design language**, and keeps the knowledge base **in step with the live site**. The specs, decisions, diagrams, tasks and starter configs for that are written. **The code for this phase has not been started.**

## 2. State

### Works today (demo build, verified 2026-10-23)

| Area | State |
|---|---|
| SDK (`guide.js` 43 KB, 15 KB gzipped; `agent.js` 133 KB on demand) | Speech in and out (Web Speech), plans, spotlight, panel, X-ray, page watch, cross-origin handoff, loop guard |
| Router | BM25 + trigrams with Arabic/English normalisation; local, Jev or Laya decider; circuit breaker |
| Services | Gateway, router, knowledge, sessions, agent proxy, watch; in process or over HTTP |
| Ingestion | Chromium crawler, describer (vision or metadata), KB builder with curated overlay, validation, versions |
| Fallback agent | page-agent 1.12.4 wrapped, commit buttons hidden, model errors spoken as a short localised line |
| Tests | 56 unit and integration, 12 end to end, all green |

### Added in this branch (docs and configs only)

| What | Where |
|---|---|
| PRD, JTBD, demo script | `docs/product/` |
| Specs 01–05 | `docs/specs/` |
| ADR-0026 to ADR-0030 (Proposed) | `docs/adr/` |
| Live site audit (2026-10-23) | `docs/reference/vodafone-live-site-audit.md` |
| Diagrams 01–09 (Mermaid + SVG) and the render tool | `docs/diagrams/`, `tools/docs/render-diagrams.ts` |
| Tasks, test plan, acceptance checklist, runbook, risk register, glossary | `docs/tasks/`, `docs/qa/`, `docs/ops/`, `docs/reference/` |
| Agent rules | `AGENTS.md`, `CLAUDE.md` |
| Build prompt | `docs/prompts/vodafone-live-demo.prompt.md` |
| Vodafone site config and overlay (starters) | `config/sites/vodafone-eg.yaml`, `config/curated/vodafone-eg.yaml` |
| CI workflow (not yet run) | `../.github/workflows/voice-guide.yml` |

### Not done

Everything in `docs/tasks/TASKS.md` from T-101 on. Nothing has run against the live site from code yet: the build sandbox could not reach `web.vodafone.com.eg`. The audit was done in a desktop browser.

## 3. Verified numbers

| Measure | Value | How, when |
|---|---|---|
| Tests | 68/68 | `npm test && npm run test:e2e`, 2026-10-23 |
| Router, fixture tuning set | 54/54 | `npm run eval:router`, 2026-10-23 |
| Router, fixture held-out set | 18/24 fully correct, 22/23 right destination | same |
| Server time per request (fixture, one machine) | p50 32 ms, p95 45 ms | `turn.planned` traces of the recorded demo |
| First visible movement | p50 70 ms, p95 94 ms | `sdk.first_motion` traces |
| Starter config filters on the real sitemaps | 676/1,021 English and 696/1,068 Arabic URLs pass patterns, so scope comes from links followed out of the seed pages | `config/sites/vodafone-eg.yaml` against sitemaps fetched 2026-10-23 |
| Diagrams | 11 render with Mermaid CLI 11.16.0, 0 errors | `npm run docs:diagrams` |
| **Live site: none yet** | | T-201, T-503 |

## 4. Start here

1. Read `AGENTS.md`, then this file, then the build prompt.
2. Environment:
   ```bash
   cd voice-guide
   npm install
   docker run -d --name vg-pg -p 54329:5432 -e POSTGRES_PASSWORD=devpass -e POSTGRES_DB=voiceguide postgres:16
   psql postgres://postgres:devpass@127.0.0.1:54329/postgres -c "create database voiceguide_test"
   npm run db:migrate
   npm run typecheck && timeout 600 npm test && timeout 600 npm run test:e2e   # expect 68 green
   ```
3. First tasks, in this order (all offline): **T-101** theme pack → **T-401** microphone → **T-402** audio pipeline → **T-403** transcript bar → **T-404** waveform → **T-302** SPA route follower.
4. On a machine that can reach the live site: **T-201** (first dry-run crawl, manual and off-peak), **T-207** (recorded snapshots), then E2.
5. Ask the owner for D4 (public HTTPS host) early; T-301 and T-503 depend on it.

## 5. Waiting on people

| ID | What | Status | Blocks |
|---|---|---|---|
| D1 | Tealium tag by Vodafone's web team | Not requested | Pilot, audience phones |
| D2 | Data protection: speech engine, consent category, retention | Not requested | Any customer exposure |
| D3 | Approval to crawl production on a schedule; crawler IP allowlist | Not requested | Scheduled sync (T-205 schedule stays off) |
| D4 | Public HTTPS host and certificate for the gateway | Not started | T-301, T-307, T-503 |
| D5 | Demo customer account | Not requested | Demo moment 2 |
| D6 | Keys: Jev or Laya, vision, agent LLM | Not provided | Better routing; picture descriptions; moment 6 |
| D7 | Demo machine, microphone, wired network | Not arranged | T-601 |
| Q1–Q8 | Open questions | Open | See PRD §12; defaults apply until answered |

## 6. Known issues and gotchas

| Issue | Detail | Where recorded |
|---|---|---|
| No `package-lock.json` | npm was unreachable when the demo build was made | ADR-0008, T-502 |
| One allowlisted upstream type error | page-agent asks zod for `openapi-3.0`; runtime output is plain JSON Schema | ADR-0017, `tools/typecheck.ts` |
| One unexplained test stall (once) | Not reproduced in three runs; use `timeout` around suites | ADR-0024 |
| `/spa/` pages compute `body` font to Times | The theme must not read `body` (ADR-0029) | Audit §4 |
| No `hreflang` on the live site; Arabic `lang="ar-SA"` | Pair by path; language from the path | Audit §6, T-202 |
| Every tab has `aria-selected="true"` on the bundles page | Use `.active` | Audit §9, T-203 |
| Vodafone's accessibility button stays bottom-right on Arabic pages | The microphone stacks above it on the right in both directions | Audit §5, SPEC-02 |
| OneTrust sits at `z-index` 2147483645 | Stay below; never click consent for the person | SPEC-03 §3 |
| Gateway on `http://localhost` from an `https://` Vodafone page | Mixed content and Chrome's local network rules: use a public HTTPS host | SPEC-03 §1, D4 |
| Chrome's default speech engine sends audio to a web service | `speech.onDevice: prefer`; DPO decision D2 | SPEC-02 §6 |
| CMS pages cached up to 4 hours | Sync sees changes late; values are read live anyway | Audit §2, SPEC-04 §1 |
| Sitemaps are noisy (test, legacy, unlinked pages) | Discovery only through links from seeds | ADR-0028 |
| `/en/vodafone-flex` redirects to `/spa/vodafone-flex` | Store the final URL; keep the requested one as an alias | Audit §1, T-202 |

## 7. Where decisions live

- `docs/adr/README.md`: all ADRs, what each changed, and the bugs that changed them.
- Each spec names its ADR; each ADR names its spec and the tests that will verify it.
- A new decision is a new ADR (AGENTS.md §5.5).

## 8. Session log (append, newest last)

- 2026-10-23: Live site audited in a desktop browser (findings in the audit). Branch created; docs, configs and the build prompt written. The demo build's 68 tests pass. Diagrams render. No phase-2 code yet.
