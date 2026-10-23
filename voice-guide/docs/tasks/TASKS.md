# Tasks: Vodafone live phase

How to use this file:
- One task = one pull request or one reviewable commit series. Work in dependency order.
- When you start a task, put your name or agent id in **Owner** and change `[ ]` to `[~]`. When every acceptance item passes, change it to `[x]`, add the commit hash, and update [`docs/handoff/HANDOFF.md`](../handoff/HANDOFF.md) §2.
- A task that needs a decision from a person (marked **needs: Dx/Qx**, see PRD §8 and §12) stops at that point; record it in the handoff and move on to the next unblocked task.
- **Network**: tasks marked 🌐 need a machine that can reach `web.vodafone.com.eg`. The build sandbox could not.
- Size: S ≤ half a day, M ≤ 2 days, L ≤ 4 days (one engineer or one agent session with review).

## Critical path

```
T-101 ─┬─ T-102 ─ T-105
       └─ T-401 ─ T-402 ─ T-403 ─ T-404 ─ T-405 ─ T-409
T-302 ─ T-303 ─ T-301 🌐 ─ T-503 🌐 ─ T-601 🌐
T-201 🌐 ─ T-202 ─ T-203 ─ T-204 ─ T-205 ─ T-206 🌐
```

Offline-first: E1, E4 and T-302 are built and tested on fixtures before anything touches the live site.

---

## E0 Setup (done in this branch)

- [x] **T-001 Branch, directory and docs.** `feature/voice-guide-vodafone` from `feature/aixc-phase1`; `voice-guide/` with the implementation, PRD, JTBD, specs, ADR-0026–0030 (Proposed), diagrams, tasks, QA, runbook, agent rules, handoff, build prompt.
- [x] **T-002 Starter configs.** `config/sites/vodafone-eg.yaml` (schema-valid, filters tested on 2,089 real sitemap URLs) and `config/curated/vodafone-eg.yaml` (lexicon only).
- [x] **T-003 CI workflow.** `.github/workflows/voice-guide.yml`. First run pending (T-501).

## E1 Vodafone design language (SPEC-01, ADR-0029)

### T-101 Vodafone theme pack · M · Owner: — · [ ]
- Add `packages/sdk/src/theme/vodafone.ts` exporting the SPEC-01 §2 tokens as a CSS string; select it with site config `ui.theme: vodafone | page` (schema change, default `page`).
- `themeFromPage()` stays for `page`.
- **Acceptance**: unit test asserts every SPEC-01 token value; a unit test compares the shared subset with `../vodafone-services-clone/src/aixc/experiences/vodafone.css` (ADR-0029 §4); `config/sites/vodafone-eg.yaml` sets `ui.theme: vodafone`.

### T-102 Restyle existing components · M · depends T-101 · [ ]
- Panel, bubble, spotlight, pointer, chips, toasts, X-ray per SPEC-01 §3. No behaviour changes.
- **Acceptance**: all existing end-to-end tests still pass; screenshots updated in `tests/visual/`.

### T-103 Fonts by language, never Times · S · depends T-101 · [ ]
- Pick the family from the text's language; check `document.fonts.check()` on load; if Vodafone faces are missing, load them from the gateway (`GET /sdk/fonts/:file`, cached a year).
- **Acceptance**: end-to-end test on a fixture page whose `body` has no font (like `/spa/`) shows `vodafone-regular-*` or the Arial/Tahoma fallback on every guide text node.

### T-104 Mirror the Arabic Vodafone font files · S · 🌐 · [ ]
- Copy `vodafone-regular-ar`, `vf-bold-ar` and `vodafone-light-ar` from the live site's `@font-face` sources into `../vodafone-services-clone/public/assets/fonts/` (the team already mirrors the English files there), and serve them through the gateway font route.
- **Acceptance**: fixture pages render Arabic guide text in the Vodafone Arabic face offline.

### T-105 Visual and contrast checks · S · depends T-102 · [ ]
- Playwright screenshot tests for each component state, English and Arabic, at 375 and 1280px; a contrast check over every guide text style.
- **Acceptance**: SPEC-01 §7 items 1–4 automated.

## E2 Live knowledge sync (SPEC-04, ADR-0028)

### T-201 Config fields and first live dry run · M · 🌐 · [ ]
- Add `crawl.seeds` (alias of `start`), `sitemaps`, `respectRobots`, `userAgent`, `rate`, `languageFrom`, `pairLanguagesBy`, `ignoreSelectors`, and `sync.*` to the `SiteConfig` schema with SPEC-04 §6 defaults; move the commented fields in `vodafone-eg.yaml` into real ones.
- Run `npm run ingest -- --site vodafone-eg --dry-run` **manually, off-peak** (no schedule before D3).
- **Acceptance**: report in `data/reports/`; record the page count, errors and duration in HANDOFF §2 and in the audit; update SPEC-04's size estimate with the measurement.

### T-202 Language from the path, pairing by path · S · depends T-201 · [ ]
- `jobs/crawler/extract.ts`: language from `/ar/` and `/en/`; `jobs/kb-builder/build.ts`: when no `hreflang`, pair `/en/<slug>` with `/ar/<slug>`; one page for `/spa/<route>` with both languages; final URL after redirects, requested URL as alias.
- **Acceptance**: unit tests with recorded page snapshots; `/en|ar/mobile-internet-bundles` → one page, two variants.

### T-203 Extraction changes for the live site · M · depends T-202 · [ ]
- Ignore `crawl.ignoreSelectors`; SPA settle (app-root children + 300ms quiet); tabs visible by `.active`, not `aria-selected`; icon-only tabs labelled from the panel heading, `alt`, `title` or the describer; `.card-subscription` as a collection.
- **Acceptance**: SPEC-04 acceptance 3 on recorded snapshots (T-207).

### T-204 Polite crawler · M · depends T-201 · [ ]
- Per-origin concurrency and rate limits, `robots.txt` fetched per run and honoured, user agent, exponential back-off on 429/503 with `Retry-After`, stop at > 5% 403 or challenge pages.
- **Acceptance**: SPEC-04 acceptance 6 and 7 with a local test server that serves robots rules, 429s and a 403 storm.

### T-205 Sync job, gate, activation, rollback · L · depends T-203, T-204 · [ ]
- `jobs/sync.ts`: plan from sitemap `lastmod` + volatile pages; reuse unchanged pages by content hash; diff; gate (SPEC-04 §5.6); activate or hold; `kb_sync_runs` table (schema version 3); `NOTIFY kb_activated` and reload in the knowledge service; keep 10 versions; `npm run sync` and `npm run kb -- --status | --rollback`.
- Scheduling from the watch service's scheduler, off unless `sync.enabled: true` (stays off until D3).
- **Acceptance**: SPEC-04 acceptance 4 and 5 (fixtures: unchanged, small change, 30% churn).

### T-206 Vodafone evaluation set and curated overlay · M · 🌐 · depends T-201 · [ ]
- 50 real requests per language from the people in JTBD §2 (seed list in JTBD §7), 20 per language held out, in `tests/fixtures/vodafone-utterances.yaml` and `-heldout.yaml`.
- Destinations, flows and commit points in `config/curated/vodafone-eg.yaml`, using ids from the T-201 report.
- **Acceptance**: `npm run eval:router -- --site vodafone-eg` ≥ 95% on the tuning set; the held-out score is recorded, never tuned on.

### T-207 Recorded live snapshots for offline tests · S · 🌐 · [ ]
- Save rendered HTML (with inline CSS, images replaced by placeholders) of 6 pages: `/ar/home`, `/ar/mobile-internet-bundles`, `/en/mobile-internet-bundles`, `/en/promotions`, `/spa/storeLocator`, the shop's home. Store in `tests/fixtures/vodafone-snapshots/` with the capture date. Private repository only.
- **Acceptance**: the integration tests for T-202, T-203 and T-205 run on these snapshots without network.

## E3 Real pages and continuity (SPEC-03, SPEC-05, ADR-0026, ADR-0030)

### T-301 Demo browser · M · 🌐 · needs D4 · depends T-303 · [ ]
- `tools/demo-browser.ts` and `npm run demo:browser -- --start <url> [--kiosk] [--xray open]`: persistent profile in `data/demo-profile/`, microphone and notification permission for the two origins, `addInitScript` loader (top frame, allowed origins, once per document), gateway URL from `VG_PUBLIC_URL`.
- **Acceptance**: SPEC-03 acceptance 1, 2, 5, 7 on the live site (`tests/live/demo-browser.live.test.ts`, runs only with `VG_LIVE=1`).

### T-302 SPA route follower · M · [ ]
- Navigation API `navigatesuccess` or `history.pushState`/`replaceState` wrappers plus `popstate`; settle wait; `sdk.route` event; per-page state reset; plan resume. Add a fixture SPA site (`fixtures/sites/demo-spa/`, pushState routing, a delayed render) to the end-to-end suite.
- **Acceptance**: SPEC-05 acceptance 4 on the fixture; the wrappers return the original return values and are installed once (unit test).

### T-303 Page identification and "what's on this page?" · M · depends T-302 · [ ]
- Exact variant match → redirect alias → `/spa/` route pattern → longest prefix → `null`; planner answer for "what's on this page?" in both languages from the page's KB entry.
- **Acceptance**: unit tests for each match rule; end-to-end on fixtures; SPEC-05 acceptance 1 on the live site (in T-503).

### T-304 Session memory facts · S · [ ]
- `memory.facts` in `sessions.state` (key, value, turn id); set by the planner from understood requests; used for retrieval hints and pronoun resolution ("الأرخص منها", "the cheaper one").
- **Acceptance**: router unit tests for follow-ups that need the facts; facts never contain page values.

### T-305 Living alongside the page · S · [ ]
- `z-index` below OneTrust; transcript bar moves above the OneTrust banner below 420px; agent blacklist includes `#onetrust-*`; history wrappers transparent; no globals besides `window.voiceGuide`.
- **Acceptance**: SPEC-02 acceptance 2 on fixture pages that carry a copy of the accessibility button and OneTrust banner markup; SPEC-03 acceptance 6.

### T-306 Offline fallback site config · S · [ ]
- `config/sites/vodafone-clone.yaml` serving `../vodafone-services-clone` (built or served by its `scripts/serve.mjs`), with the tag injected; a minimal curated overlay for moments 1, 4 and 8.
- **Acceptance**: `npm run dev -- --site vodafone-clone` works with the network off (apart from speech).

### T-307 Public HTTPS gateway · S · needs D4 · [ ]
- A documented way to run the gateway on a public HTTPS host (a Dockerfile plus a Caddy or tunnel recipe in `docs/ops/`), with `VG_PUBLIC_URL`, secrets and Postgres.
- **Acceptance**: `curl https://<host>/health` is OK; a request from `https://web.vodafone.com.eg` in the demo browser passes origin checks.

### T-308 Live-site safety rules · M · [ ]
- Commit lexicon in both languages for the agent blacklist and the commit guard; `input_text` refusals (password, `one-time-code`, `cc-*`, labels for OTP, card, national ID); masking for Egyptian mobile numbers (`01[0125]\d{8}`) and 14-digit national IDs.
- **Acceptance**: unit tests for each rule; end-to-end test where the agent is asked to "pay" and "type my password" and refuses.

### T-309 Back button during a plan · S · depends T-302 · [ ]
- `popstate` or a back navigation during a plan stops it with one spoken line.
- **Acceptance**: SPEC-05 acceptance 6 on fixtures.

## E4 Voice-first UI (SPEC-02, ADR-0027)

### T-401 Microphone button and placement · M · depends T-101 · [ ]
- Replace the launcher with the microphone: look, states, `aria-*`, coordinates (SPEC-02 §2–3), keyboard button that opens the existing panel.
- **Acceptance**: SPEC-02 acceptance 1 and 2 on fixtures with the accessibility button copy.

### T-402 One microphone stream · M · depends T-401 · [ ]
- `packages/sdk/src/voice/audio.ts`: `getUserMedia` once, analyser, `recognition.start(track)` with feature detection, fallback modes, release on stop; `sdk.stt.mode`.
- **Acceptance**: SPEC-02 acceptance 8 and 9; unit tests for mode selection with stubbed APIs.

### T-403 Word-by-word transcript bar · M · depends T-401 · [ ]
- `packages/sdk/src/voice/transcript.ts`: token diff, enter animation, in-place revision, stagger, two-line window with fade, caret, placeholder, final state, collapse.
- **Acceptance**: SPEC-02 acceptance 3 and 4; render p95 ≤ 50ms measured in the end-to-end test.

### T-404 Live waveform and halo · M · depends T-402 · [ ]
- `packages/sdk/src/voice/wave.ts`: level with attack and release, three bands, three curves, DPR-aware canvas, idle ripple, reduced-motion meter; halo bound to the same level.
- **Acceptance**: SPEC-02 acceptance 5, 6 and the frame budget in 7.

### T-405 Interaction details · S · depends T-403 · [ ]
- Push to talk, Esc to cancel, auto end (1.2s after `speechend`, 15s cap), barge-in, language chip, Alt+Shift+V shortcut.
- **Acceptance**: SPEC-02 acceptance 10 and an end-to-end test per input.

### T-406 Recognition settings · S · depends T-402 · [ ]
- `phrases` from the KB lexicon where supported; `speech.onDevice: prefer | require | off` with `SpeechRecognition.available()` and `install()`; config schema change.
- **Acceptance**: unit tests with stubbed APIs; `sdk.stt.mode` reports `onDevice`.

### T-407 Accessibility · S · depends T-403 · [ ]
- Final transcript and reply announced through a visually hidden `role="status"`; interim words `aria-hidden`; follows the widget's text size up to 1.5×.
- **Acceptance**: an end-to-end check of the live region's content; keyboard-only walkthrough in the test plan passes.

### T-408 Telemetry and X-ray · S · depends T-403 · [ ]
- Emit SPEC-02 §8 events; X-ray shows first word, final and mode per turn; add the events to `docs/pilot-tuning.md` with SQL.
- **Acceptance**: the X-ray end-to-end test asserts the new rows.

### T-409 Fake-microphone tests · M · depends T-404 · [ ]
- Four 16 kHz mono WAV recordings by a team member (Arabic and English, about 3s each: "إيه أرخص باقة نت؟", "اشترك فيها", "What's the cheapest internet bundle?", "stop") in `tests/fixtures/audio/`; Chromium launched with `--use-fake-device-for-media-stream --use-file-for-fake-audio-capture=<wav>` in `tests/e2e/voice-ui.e2e.test.ts`.
- **Acceptance**: SPEC-02 acceptance 5 runs in CI.

## E5 Platform and quality

### T-501 First green CI run · S · [ ]
- Open the pull request; fix whatever the first run of `.github/workflows/voice-guide.yml` finds (it has not run yet).
- **Acceptance**: green on the PR.

### T-502 Lockfile · S · [ ]
- `npm install` with registry access; commit `package-lock.json`; rerun typecheck and tests (ADR-0008).
- **Acceptance**: CI uses `npm ci`.

### T-503 Live smoke suite · M · 🌐 · depends T-301 · [ ]
- `tests/live/` (only with `VG_LIVE=1`): start on each seed page; the demo script's eight moments in the demo browser with a stand-in speech engine; no SDK console errors; network allowlist assertion.
- **Acceptance**: green twice in a row on the demo machine.

### T-504 Performance budgets · S · [ ]
- Size check: `guide.js` ≤ 20 KB gzipped (fail the build above); long-task observer in end-to-end tests (no SDK task > 50ms on load); CLS contribution 0.
- **Acceptance**: budgets enforced in CI.

## E6 Demo readiness

### T-601 Three clean rehearsals on the live site · S · 🌐 · depends T-503, T-205 · [ ]
- Follow the demo script and runbook with the X-ray open; log each miss in the evaluation set or the overlay.
- **Acceptance**: 8/8 moments, three rehearsals in a row (PRD §9).

### T-602 Recording · S · 🌐 · depends T-601 · [ ]
- `npm run record:demo -- --site vodafone-eg --live` (extend the recorder to drive the demo browser) and a human-paced screen recording with real voice.
- **Acceptance**: MP4s in the release notes; frames checked for stray UI.

### T-603 Brand review · S · needs Vodafone · depends T-105 · [ ]
- Screenshots of every state, English and Arabic, reviewed by Vodafone's digital or brand team.
- **Acceptance**: sign-off recorded in HANDOFF §5.

## E7 Decisions and documentation

### T-701 Accept or revise ADR-0026 to ADR-0030 · S · ongoing · [ ]
- When a spec's acceptance criteria pass, change its ADR to Accepted with the date and the test names; if the build changed the decision, write what changed and why.
- **Acceptance**: the ADR index shows no Proposed ADR whose criteria pass.

### T-702 Keep the handoff current · S · ongoing · [ ]
- After every task: HANDOFF §2 (state), §3 (verified numbers), §6 (known issues).
