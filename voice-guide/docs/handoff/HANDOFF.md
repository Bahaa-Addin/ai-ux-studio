# Handoff: voice guide, Vodafone live phase

> Keep this file current. Every agent or engineer updates §2, §3, §5, §6 and appends to §8 at the end of each task (AGENTS.md §5.7).

- Last updated: 2026-10-23
- Branch: `feature/voice-guide-vodafone` (from `feature/aixc-phase1`) in `Bahaa-Addin/ai-ux-studio`
- Directory: `voice-guide/`
- Owner: Bahaà Addin Balashoni
- Operating it: [`docs/ops/runbook.md`](../ops/runbook.md)
- Bugs and open issues: [`docs/qa/bugs-and-open-issues.md`](../qa/bugs-and-open-issues.md)

## 1. In one paragraph

The voice guide runs on **Vodafone Egypt's real pages**, voice first, in Vodafone's design language. `npm run demo:live` starts the gateway, loads a knowledge base built from a **public-only crawl of the live site** (2026-10-23), and opens Google Chrome on `web.vodafone.com.eg` with the guide added to every page. A red microphone sits above Vodafone's accessibility button; pressing it shows the words one by one in a black bar with a live waveform. The guide finds the cheapest bundle on another page and reads it live, shows where to subscribe and stops (no sign-in), reads the text inside a banner, says what is on the current page, follows into the `/spa/` app in English with the conversation kept, and stops on request. All of this passes end to end on 14 Vodafone pages saved for replay. **Scheduled crawling is paused**; refreshes run on demand and are gated. The live site and real speech recognition still need a check on the demo Mac (the build machine cannot reach the site and has no speech service).

## 2. State

### Works (verified 2026-10-23)

| Area | State | Evidence |
|---|---|---|
| Demo on Vodafone pages | `npm run demo:live` (live) and `-- --replay` (offline); gateway behind the page origin (`/__vg`), long-polled events; Google Chrome for speech | `tests/e2e/live-replay.e2e.test.ts` (9 tests); smoke run of `demo:live --replay` |
| Voice-first UI | Microphone in Vodafone's floating-button style, 16px above the accessibility button, same place on `/spa/`; word-by-word bar; waveform and halo from one microphone stream (`shared-track`); released on stop; clear message when no speech service | replay tests 1, 2, 9; `tests/unit/voice.test.ts` |
| Design language | Fixed Vodafone tokens; every guide colour in the SPEC-01 palette; commit-point spotlight in Vodafone colours | `tests/unit/voice.test.ts` |
| Knowledge base | Public-only crawl → 85 page variants → 46 pages, 557 destinations, 30 card lists, 165 pictures; curated overlay for the demo; frozen as `config/kb/vodafone-eg.manifest.json` (`20261023-122606-5b2080`) | `tests/unit/vodafone-kb.test.ts` |
| Knowledge refresh | `npm run sync` on demand: public-only forced, `--scheduled` refused while paused, gate (integrity, bot challenge, seeds, churn ≤ 15%, evaluation drop ≤ 2 points), activate or hold; `--origin web`; `npm run kb` for versions | `tests/integration/sync.test.ts`; real run on the saved crawl: all checks pass |
| Crawl rules | Robots for both origins, scope, login and challenge detection, 1 page/s, 2 at a time | `tests/unit/robots.test.ts`, `tests/unit/crawler-url.test.ts` |
| SPA routes | Route changes are page changes without rebuilding the guide; Back stops a plan once | `tests/e2e/spa-routes.e2e.test.ts` |
| Public-only subscribe | "اشترك فيها" spotlights that card's own subscribe link and stops: press it yourself; no sign-in | replay test 3 |

### Not done (see `docs/tasks/TASKS.md` for each)

- **Live site from code** (T-301 acceptance, T-503) and **real speech** in Chrome: need the demo Mac. Runbook §3 is the check.
- The shop: not crawled (owner stopped the shop step). Demo moments 5 and 6 are skipped.
- Moment 7's on-stage notification needs the clone site config (T-306).
- Size budget: `guide.js` is 22.7 KB gzipped against 20 KB (T-504).
- Visual snapshots and contrast checks (T-105), font checks (T-103), interaction details and accessibility tests (T-405, T-407), safety-rule tests for the live site (T-308), session memory facts (T-304).
- Incremental sync by sitemap `lastmod`, content-hash reuse, `kb_sync_runs`, reload on activation (rest of T-205).
- CI has not run (T-501); no lockfile (T-502).

## 3. Verified numbers

| Measure | Value | How, when |
|---|---|---|
| Tests | 92 unit and integration, 24 end to end, all green; typecheck ok | `npm run typecheck && npm test && npm run test:e2e`, 2026-10-23 |
| Router, Vodafone tuning set | 33/33; p50 6.5 ms, p95 20.3 ms | `npm run eval:router -- --manifest config/kb/vodafone-eg.manifest.json --cases tests/fixtures/vodafone-utterances.yaml` |
| Router, Vodafone held-out set | 14/18 fully right, destination 17/18 | same, `vodafone-utterances-heldout.yaml` (written before tuning, commit eb202c8) |
| Router, fixture sets | 54/54; held-out 19/24 fully right, destination 22/23 | `npm run eval:router` |
| Live crawl, 2026-10-23 | 136 content pages + 5 app pages, 0 blocked, about 10 minutes, public only | ADR-0032 |
| Sync gate on that crawl | integrity 0 errors; 28/28 seeds present (3 shop seeds not crawled); churn 0%; evaluation 100% | `npm run sync -- --site vodafone-eg --from-crawl data/crawls/crawl-20261023T075551-browser` |
| SDK size | `guide.js` 69.1 KB, **22.7 KB gzipped**, 20.1 KB brotli; `agent.js` 136 KB, 42 KB gzipped (on demand) | `node packages/sdk/build.ts`, gzip -9 |
| Microphone placement | 64px, right edge 15px, 16px above the accessibility button, same axis | replay test 1 |
| **Live site, real speech** | not measured yet | runbook §3 on the demo Mac |

## 4. Start here

1. Read `AGENTS.md`, this file, then the [runbook](../ops/runbook.md).
2. Environment and checks:
   ```bash
   cd voice-guide
   npm install && npx playwright install chromium
   docker run -d --name vg-pg -p 54329:5432 -e POSTGRES_PASSWORD=devpass -e POSTGRES_DB=voiceguide postgres:16
   psql postgres://postgres:devpass@127.0.0.1:54329/postgres -c "create database voiceguide_test"
   npm run db:migrate
   npm run typecheck && timeout 900 npm test && timeout 1200 npm run test:e2e   # expect 92 + 24 green
   ```
3. On the demo Mac: `npm run demo:live`, then runbook §3 (microphone, live site). Record what you see in §8.
4. Next tasks: T-504 (X-ray as its own chunk to meet the size budget), T-306 (clone config for moment 7), T-105 (visual checks), T-503 (live smoke suite).

## 5. Waiting on people

| ID | What | Status | Blocks |
|---|---|---|---|
| D1 | Tealium tag by Vodafone's web team | Not requested | Pilot, audience phones |
| D2 | Data protection: speech engine, consent category, retention | Not requested | Any customer exposure; `speech.onDevice: require` |
| D3 | Approval to crawl production on a schedule; crawler IP allowlist | Not requested; **schedule paused by the owner, 2026-10-23** | Scheduled sync |
| D4 | Public HTTPS host for the gateway | Not needed for the demo (gateway behind the page origin, ADR-0031) | Pilot, audience phones |
| D5 | Demo customer account | **Not wanted in this phase (public pages only)** | Signed-in moments |
| D6 | Keys: Jev or Laya, vision, agent LLM | Not provided | Better routing; picture descriptions; moment 6 |
| D7 | Demo machine with Google Chrome, microphone, wired network | Not arranged | T-601 |
| — | Run the demo once on the Mac and report what the terminal and the X-ray show | Open | Live-site and real-speech verification |
| Q1–Q8 | Open questions | Open | See PRD §12; defaults apply until answered |

## 6. Known issues and gotchas

| Issue | Detail | Where recorded |
|---|---|---|
| Chromium has no speech service | The demo needs Google Chrome; `--browser chromium` is for tests | ADR-0033 |
| `guide.js` over the size budget | 22.7 KB gzipped vs 20 KB | T-504 |
| Typed requests keep the panel open over the right-hand column | In Arabic the cheapest card can sit under the panel; spoken requests no longer open the panel (SPEC-02 §1) | Next: close or move the panel when a spotlight target is under it |
| Replay shows alt text instead of pictures | Pictures were not saved; the home page's alt text has stray CMS HTML | Runbook §2.2 |
| The in-browser crawler cannot take `/spa/` pages | They render only as the top document | ADR-0032, runbook §5.2 |
| The Playwright crawler has not been run against the live site | The build machine cannot reach it | Runbook §5.1: dry run first |
| "وريني الموبايلات" goes to the internet bundles page | The shop is not in the knowledge base | Demo script, moment 5 |
| No `package-lock.json` | npm was unreachable when the demo build was made | ADR-0008, T-502 |
| No model means no agent | Without `VG_LLM_*`, "choose the best offer" style requests get the closest page, never the agent | ADR-0034 |
| Vodafone Business is not in the knowledge base | "خطوط شركات", "عايز افتح بيزنس" get the closest page | ADR-0034 |
| `/spa/` pages compute `body` font to Times | The theme never reads `body` | ADR-0029 |
| No `hreflang`; Arabic `lang="ar-SA"` | Pair by path; recognition in `ar-EG` | Audit §6 |
| OneTrust at `z-index` 2147483645 | The guide stays below; never answers consent | SPEC-03 §3 |
| Chrome's server recognition sends audio to Google | `speech.onDevice: prefer`; D2 | SPEC-02 §6 |

## 7. Where decisions live

- `docs/adr/README.md`: all ADRs (0006–0034), what each changed, and the bugs that changed them.
- Each spec names its ADR; each ADR names its spec and the tests that verify it.
- A new decision is a new ADR (AGENTS.md §5.5).

## 8. Session log (append, newest last)

- 2026-10-23: Live site audited in a desktop browser (findings in the audit). Branch created; docs, configs and the build prompt written. The demo build's 68 tests pass. Diagrams render.
- 2026-10-23: Live phase built. Public-only crawl of the live site from a browser tab (ADR-0032); knowledge base built and curated; voice-first UI; Vodafone theme; demo browser with the gateway behind the page origin and long polling (ADR-0031); replay of 14 real pages; SPA route follower; Back stops a plan (bug found and fixed).
- 2026-10-23: On-demand sync and `kb` commands with the gate; schedule refused in code while paused; aliases for redirects and second spellings (the gate's first run found them); Google Chrome for speech and a plain message without it; agent saves sent in order (a finished agent task could come back); X-ray backlog by whole turns; spoken requests no longer open the panel over the answer; commit spotlight in Vodafone colours. Runbook written. 92 + 24 tests green.
- 2026-10-23: Demo-run fixes (ADR-0034, bug log B-10 to B-13): no agent routing without a configured model (the 503s), zod 4.6.5 (the `openapi-3.0` warning), page-wrapper sections dropped from the builder and the committed knowledge base, buy verbs, typed answers to "A or B?", "A or B?" only between full matches, alt-only pictures read their card. 105 + 30 tests green; router evaluation unchanged.
