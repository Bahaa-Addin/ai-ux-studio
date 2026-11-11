# Handoff: voice guide, Vodafone live phase

> Keep this file current. Every agent or engineer updates §2, §3, §5, §6 and appends to §8 at the end of each task (AGENTS.md §5.7).

- Last updated: 2026-11-11 (live plan: phases 0, 1, 1b and 2a done; live checks and the real VoiceTut still to verify)
- Branch: `feature/live-way2` (from `integration/main` 3b6a823) in `Bahaa-Addin/ai-ux-studio`, not pushed
- Directory: `voice-guide/`
- Owner: Bahaà Addin Balashoni
- Operating it: [`docs/ops/runbook.md`](../ops/runbook.md)
- Bugs and open issues: [`docs/qa/bugs-and-open-issues.md`](../qa/bugs-and-open-issues.md)

## 1. In one paragraph

The voice guide runs on **Vodafone Egypt's real pages**, voice first, in Vodafone's design language. `npm run demo:live` starts the gateway, loads a knowledge base built from a **public-only crawl of the live site** (2026-10-23), and opens Google Chrome on `web.vodafone.com.eg` with the guide added to every page. A red microphone sits above Vodafone's accessibility button; pressing it shows the words one by one in a black bar with a live waveform. The guide finds the cheapest bundle on another page and reads it live, shows where to subscribe and stops (no sign-in), reads the text inside a banner, says what is on the current page, follows into the `/spa/` app in English with the conversation kept, and stops on request. All of this passes end to end on 14 Vodafone pages saved for replay. **Scheduled crawling is paused**; refreshes run on demand and are gated. The live site and real speech recognition still need a check on the demo Mac (the build machine cannot reach the site and has no speech service).

**Exploration Trail (2026-11-03, prototype, SPEC-06):** with consent, the guide records a person's public-page journey privately in their browser (rrweb, masked, IndexedDB, 24 h), shows it as a scrubbable timeline under the site's header, picks out the knowledge destinations they explored, and offers router-verified questions that become ordinary guide turns (navigate, reveal, spotlight, answer; no chat window). Nothing recorded leaves the browser; anonymous aggregation is built but off. Customers need D2 first. `npm run demo:trail` shows it on the saved Vodafone pages; the journey opens in the Pocket of the Services clone (mounted at `/en/services`), in the Pocket's own design (ADR-0040).

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

Exploration Trail (2026-11-03, this Mac): typecheck ok; `npm test` 146/146 (108 before + 38 new); `npm run test:e2e` 27/39: all 8 trail scenarios pass, the 12 failures are the Vodafone replay suite's fake-microphone tests, failing before this work too (headless Chromium's `getUserMedia` hangs here). Bundles (gzip -9): `guide.js` 20,445 B (+69 B gate, budget 20,480), `trail.js` ~25 KB, `trail-record.js` ~23.5 KB, `trail-replay.js` ~68 KB, all on demand. `npm run measure:trail -- --minutes 10` (2026-11-03, fixture site, Chromium 141, 1280×800, one machine, memory store, 13 page visits): recorder start p50 8 ms / p95 13 ms; storage 131 KB of compressed chunks for 13 steps (about 13 KB a minute; fixture pages are small, real Vodafone pages will be larger: T-806); preview build after its chunks are read p50 5 ms / p95 6 ms (first open also fetches `trail-replay.js`); scrub p95 2.7 ms, max 4.2 ms; 2 long tasks in 10 minutes (max 125 ms, not attributed); JS heap +2.3 MB after 20 preview open/close cycles (+0.3 MB in a 2-minute run): watch for retention before a pilot.

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
- 2026-11-03: Exploration Trail prototype (SPEC-06, ADR-0035 to ADR-0039): consent, local rrweb recording in IndexedDB, timeline with scrubbing, explored destinations, router-verified questions (`npm run experience`), chips through `/v1/turn` with a verified hint, aggregation built but off. Bugs B-17 (hidden-tab spotlight) and B-18 (writes cut off by navigation) found and fixed. Not committed. Measurements recorded in §3. `feature/pocket-peel` merged into `experiment/page-agent` (121a388). Open: T-805, T-806, T-807; heap growth across preview cycles.
- 2026-11-05: On `integration/main` (c2b1a12, all four demos merged), baseline on the owner's Mac in its Linux VM (Ubuntu 22.04 arm64, Node 22.23.4, Postgres 16.15): typecheck ok; `npm test` 146/147 (only the size test); `npm run test:e2e` 45/45; clone `npm test` 70/70; `pocket_e2e.py` 119/119; `aixc_e2e.py` 292/292. `integration/main` pushed. Fixes for CI, not yet committed: `guide.js` back under budget, 20,562 → 20,401 B gzipped on Linux, by moving page-watch announcements into `watch.js` (ADR-0041); the ingest flake traced to a timed-out element screenshot and fixed with one retry (B-22). After both: typecheck ok, `npm test` 148/148 three runs in a row, `test:e2e` 45/45. Real Chrome, real speech and the live site still need the Mac itself.
- 2026-11-05: Owner decisions for the demo: server speech recognition allowed for his own demos (O15); page-agent's testing API as the default demo agent model, replaceable (ADR-0042: `VG_LLM_PRESET`, `--agent`); VoiceTut ported behind `?demo=voicetut`; an Arabic Services clone. Live check of the agent preset through our proxy: 1 call, `qwen3.5-plus`, 7.4 s, task done (`tests/live/agent-preset.live.test.ts`).
- 2026-11-05: Arabic Services clone (ADR-0043): `/ar/services` captured from the live page that day; same model as English with Arabic copy and links; Vodafone Arabic faces; right-to-left carousels; Pocket and Reimagine copy in Arabic (`src/i18n.js`); `trail.hostUrl` takes `{lang}`; the demo mounts both pages. Checked: clone `npm test` 85/85, `arabic_e2e.py` 71/71, `pocket_e2e.py` 119/119, `aixc_e2e.py` 292/292; voice-guide `npm test` 153/153, `test:e2e` 46/46 (new Arabic journey test; trail test 1 flaked once, see flaky tests).
- 2026-11-05: Phase C walkthrough automated (`tools/demo-walkthrough.ts`, runbook §5a): five runs (English and Arabic, desktop and phone, reduced motion), 21–23 of 25 checks each; floating controls never overlap. Found and fixed B-23 (the journey pill covered the Reimagine view bar's buttons; the Arabic launcher sat away from the pill). Open: O19 (Cash routes to the Cash page, so the chip and the reimagined spotlight do not answer on Services), O20 (the Pocket corner covers experiences' bottom-right controls: design decision), O21 (the drone does not step aside for the journey). Real Chrome, microphone and speech still need the Mac.
- 2026-11-07: O20 resolved by the owner's choice (ADR-0044): in the Reimagine view the Pocket corner tucks in and the right-hand column stays lifted; the test for it also found B-24 (the accessibility button covered the tunnel's "Next service" with an empty Pocket). Checked: pocket-journey e2e 8/8 (new test fails without the change), clone 85/85, pocket_e2e 119/119, aixc_e2e 292/292 (two timing checks failed once each under VM load and passed at normal load, with and without the change), arabic_e2e 71/71, walkthrough 23–24/26. Next: the owner's voice pass on the Mac (runbook §3, §5a), then the PR into `master`.
- 2026-11-07: **Tips** (ADR-0045, proposed): an Apple Tips-style walkthrough of the four demos in the Services clone (`vodafone-services-clone/src/tips/`). A Tips button bottom-left (steps aside in the Reimagine view and the open Pocket); a first-visit invitation that never shows under automation; a cover, two tips per demo with looping scenes drawn from the page's own content, a closing card; "Try it" coach marks on the real controls (Pocket chip and corner, Reimagine launcher and Cover flow, the guide's microphone, "Your journey") that wait for a real press; English and Arabic, phones (bottom sheet), reduced motion; loaded on demand. Built in a Linux container on 1481c16, not committed. Checked: clone `npm test` 93/93, `tips_e2e.py` 87/87, `pocket_e2e.py` 119/119, `aixc_e2e.py` 292/292, `arabic_e2e.py` 71/71; voice-guide typecheck ok, `npm test` 153/153, `test:e2e` 50/50 with the new `tips.e2e.test.ts` (real guide, saved pages); walkthrough English desktop 23/26 (O19 ×2, O21, as before) with Tips measured. Not checked: Google Chrome on the Mac, a real microphone, a real phone, the owner's review (O22). Open the tips with the button or `/en/services?tips=open`.
- 2026-11-10: **Direction change (ADR-0046):** the owner chose to run all five demos (voice guide, Pocket, Reimagine, Exploration Trail, Your RED world) on Vodafone's real pages as one experience layer beside the guide, and to retire the Services clone, with a "Fill with demo data" quick start from real captured content. Measured on the live site that day: Liferay sections with stable portlet ids, one card vocabulary across pages, CSP `frame-ancestors` only, X-Frame-Options SAMEORIGIN, Vodafone fonts on the page. The plan for the next session, phase by phase with checks: [`docs/handoff/live-demos-way2.md`](../../../docs/handoff/live-demos-way2.md) at the repository root. Nothing built yet.
- 2026-11-10: **VoiceTut becomes the guide's voice (ADR-0047):** the owner resolved Modal's billing and asked for VoiceTut in the guide's spoken replies. Design: the gateway calls VoiceTut server to server, synthesises a plan's lines ahead, caches by settings and text, plays the first sentence first, and falls back to the browser voice within 2.5 s. At 10:08 UTC the Modal endpoint still answered `invalid function call` (needs `modal deploy`, O18). Added to the live plan as phase 1b. Nothing built yet.
- 2026-11-10: **Live plan, phase 0 done** on `feature/live-way2` (owner's answers that day: merge all three, in order; demo 5 is the revamp, built live; one trail host v2 with asked questions and `seed()`, ADRs numbered as written; VoiceTut against a stand-in until he redeploys Modal). Baseline on the owner's Mac itself (macOS, Node 25.8.2, Postgres 15.7 in Docker `vg-pg` on 54329, Python Playwright 1.58): typecheck ok, `npm test` 154/154, `test:e2e` 50/50, clone 116/116, `aixc_e2e` crashed (B-26, fixed), `arabic_e2e` 71/71, `pocket_e2e` 119/119, `tips_e2e` 87/87. Merged `feature/pocket-actors-live` (dc7afec; 4 conflicts resolved; the mascot hides while the corner is tucked, 6 new checks), `feature/pocket-portal` (8887f5b; B-27 fixed with it: the accessibility button dropped at the portal's first frame) and `feature/aixc-template-credits` through a copy without Claude trailers (b0cf750; B-28 fixed after it: back from Original a scroll-driven experience lost its place). Then `git mv vodafone-services-clone experiences` (e9e1f74; history follows). After: experiences `npm test` 163/163, `aixc_e2e` 298/298, `arabic_e2e` 71/71, `pocket_e2e` 210/210, `portal_e2e` 56/56 (needs Pillow; its new-tab check now uses the platform modifier), `tips_e2e` 87/87, voice-guide clone e2e 10/10, typecheck ok. A read-only code map of phases 1, 1b and 2 found O23–O28 (Vodafone's page clears `localStorage`; the accessibility-button lift; Pocket ids only; id collisions; Gemini on live; live readings and VoiceTut). Next: phase 1 (ADR-0048) and phase 1b against a stand-in.
- 2026-11-10: **Live plan, phase 1** (d4d93d7, ADR-0048 Proposed): `aixc.js` beside `guide.js`. The loader adds it on the web origin's `/en/` and `/ar/` pages with `#main-content` (not `/spa/`, not clone pages, not `?aixc=off`); `buildSdk` builds `experiences/src/host/` as ES modules with splitting into `dist/aixc/` with a manifest; the gateway serves `/sdk/aixc/:file`; site config `experiences`; `demo:live -- --aixc off`. The layer reads its settings, builds a PageHost over `#main-content` (output and view bar beside it, hidden) and waits; one guard removes everything on any error. No trail-host meta (the journey host will be claimed through trail host v2). Owner decisions that day: O24 (the Pocket may lift the accessibility button on live pages, his demos; an exception to AGENTS §4.6 to write in phase 3), O27 (Reimagine templates only on live pages); the original `feature/aixc-template-credits` stays, never merged. Checked: typecheck ok, `npm test` 159/159, `test:e2e` 54/54 (new `aixc-layer.e2e`: all 13 saved CMS pages, geometry unchanged, failures leave no trace, the layer's own rules); core 1,791 B gzipped; a three-lens review found five test and isolation gaps, fixed. **Not verified: live.** The first live page did not answer within 45 s in Playwright's Chromium nor in Google Chrome (O29); stopped, no retry. Next: phase 1b against a stand-in VoiceTut.
- 2026-11-11: **Live plan, phase 1b** (276a7dc, ADR-0047 Built section): VoiceTut speaks the guide's replies, built and tested against a stand-in VoiceTut (`tests/helpers/mock-voicetut.ts`). `services/speech-out/` (client, cache, serial queue with lanes and a cap on new work, keep-warm, the model version checked against VoiceTut); the router prepares a plan's own words through the service's client; gateway `POST /v1/speech`, `GET /v1/speech/<hash>.wav?k=`, engine `voicetut` only when configured; `voice-out.js` (1,969 B gzipped) plays sentences in order with the browser voice as the fallback and barge-in; `guide.js` +31 B; `npm run speech:warm` (391 sentences); X-ray "speak" rows; runbook §3a. Only lines known ahead reach the disk; page values stay in memory; traces carry no text. A review found 16 problems and a recheck 7 more, all fixed with tests (the worst: Arabic-Indic digits made every Arabic price reply "private", so VoiceTut never said them). Checked: typecheck ok, `npm test` 203/203, `test:e2e` 57/57. **Waiting on the owner:** `modal deploy experiments/voicetut/modal_app.py` and `VG_VOICETUT_URL` (O18), then time to first audio and the voices (D9). Still open from phase 1: the live check (O29). Next: phase 2 (the live adapter; its id design is O26).
- 2026-11-11: **Live plan, phase 2a** (3d097d9): the live adapter (`experiences/src/host/live-adapter.js`, `recognisers.js`) reads Vodafone's cards into the demos' content model; sections keyed by lower-cased portlet instance ids; item ids from link path, picture file name (CMS UUID removed), English title, tab, place (O26); Great Entertainment's cards recorded as opening the page's own dialog; the layer tags what it read and the guard untags on failure. Saved pages of 2026-10-23: every CMS page read with unique ids, coverage 1 everywhere it has cards (runbook §3b table), Services ids 28/30 the same in both languages. Core 5,343 B gzipped (budget 6 KB). Checked: `npm test` 207/207, `test:e2e` 57/57, experiences 163/163. Next in phase 2: the knowledge link (keep `destinationId` on the model's sections rather than tagging Vodafone's portlets, so the trail's finer targets are not hidden), the crawler's portlet-id selectors; the live and refreshed-fixture checks wait on O29.
- 2026-11-11: **Live plan, phase 2b** (ADR-0049 Proposed; amends ADR-0046 §3 on ids, coverage and the knowledge link): each section the layer reads now knows its knowledge destination. New `GET /v1/page-map?url=` (knowledge `pageMap`: section, card-list and FAQ destinations of the page with their locators and titles, never a commit point; only when the site config's `experiences.enabled` is on, else 404 `experiences_off`; not gated on the trail). The demo browser's loader gives the layer the public site key (`data-aixc-site-key`); the layer sends only the page's origin and path, with no referrer, waits 2 s at most, and reads the page without the map if it fails (`window.__aixc.pageMap` is then `null`). Destinations stay on the model (`section.destinationId`), never as `data-vg-destination` on Vodafone's portlets (the trail's resolver takes such a tag first and would hide the cards inside). Matching: a destination's first locator that finds one element inside one portlet; on a shared portlet, section destinations first, then the titled one, else the innermost. A two-round review (four lenses, then the two cut short by the usage limit, each finding checked by two skeptics) found 4 test gaps and 8 confirmed problems, all fixed: the matcher took the dialog's destination when Vodafone rewords a heading, an untitled section matched an unlabelled card list, the Referer carried the page's query (`msisdn=…` in the test) to the gateway, and the docs had a wrong id rule, cache claim, page count and runbook steps. Saved pages of 2026-10-23: all six Services sections named in both languages, on every saved page the same with headings reworded or removed; item ids the same across languages on Services 28/30, home 8/8, RED 5/5, Cash 8/8, bundles only 2/20 (O26 updated). Checked (with phase 2c's crawler change also in the working tree): typecheck ok, `npm test` 213/213, `test:e2e` 58/58 (57/58 once before: the known trail-replay flake, logged again), experiences `npm test` 163/163. Still blocked: live and refreshed-fixture checks (O29). Next: phase 2c, the crawler's portlet-anchored locators (built, its own commit).
