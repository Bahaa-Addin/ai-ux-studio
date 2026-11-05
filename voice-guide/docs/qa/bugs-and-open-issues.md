# Bugs found and open issues: Vodafone live phase

As of 2026-10-23, commit `09fc4f4` on `feature/voice-guide-vodafone`. Tests: 92 unit and integration, 24 end to end, all green. Decisions behind the fixes: [ADR index](../adr/README.md). Tasks: [TASKS.md](../tasks/TASKS.md).

## 1. Bugs found and fixed

Each fix has a test that failed before it.

| # | Bug | Found by | Impact before the fix | Fix | Test |
|---|---|---|---|---|---|
| B1 | Back during a running plan did not stop it in Chrome: the Navigation API's `navigatesuccess` arrived before `popstate`, and the URL de-duplication swallowed the Back signal | SPA route test | The guide kept acting after the person took the wheel | Back is checked before de-duplication (`packages/sdk/src/guide.ts`, ADR-0030) | `tests/e2e/spa-routes.e2e.test.ts` "Back during a plan" |
| B2 | A spoken request opened the chat panel on the next page, over the spotlit answer (Arabic pages put the cheapest card on the right, under the panel) | Video review | The audience could not see the answer or the subscribe button | Spoken requests and resumed plans no longer open the panel in voice-first mode (SPEC-02 §1) | `tests/e2e/live-replay.e2e.test.ts` test 2 |
| B3 | The fallback agent's per-step saves were sent without waiting; one could land after the final "done" | Flaky end-to-end test | A finished agent task could restart on the next page load | Saves are chained in order (ADR-0017) | `tests/e2e/guide.e2e.test.ts` "fallback agent across pages" |
| B4 | The X-ray backlog was the last 60 events; one agent turn pushed earlier turns' rows out | Flaky end-to-end test | X-ray missed earlier requests after a page load | Backlog by whole turns: last 8 turns, at most 600 events (ADR-0033) | `tests/e2e/guide.e2e.test.ts` X-ray test, 4 green runs in a row |
| B5 | The sync gate held a good knowledge base: 5 seeds "missing" because they redirect into `/spa/`, and `/en/HomeDSLcatalog` vs `/en/homedslcatalog` was dropped | First real sync run | Every refresh would be held | Redirects and second spellings become aliases (ADR-0033) | `tests/unit/vodafone-kb.test.ts` aliases test |
| B6 | Chromium has no speech service; the guide answered "I didn't catch that" | Demo browser review | People would repeat themselves for nothing | Demo uses Google Chrome; a plain "not available, type instead" message otherwise (ADR-0033) | `tests/e2e/live-replay.e2e.test.ts` test 9 |
| B7 | Chip hover used `#fff5f5`, outside the Vodafone palette | Palette test | Off-brand colour | Palette grey `--vf-bg` | `tests/unit/voice.test.ts` |
| B8 | Commit-point spotlight used an amber ring, outside the Vodafone palette | Video review | Off-brand colour on the most important moment | White and dark-red ring | `tests/unit/voice.test.ts` |
| B9 | "Subscribe to it" asked "which one?" on the live page: cards have no id attribute | Replay test | Follow-up failed | Positional item keys (`#N`) | `tests/unit/vodafone-kb.test.ts`, replay test 3 |
| B10 | Knowledge-base build: 199 duplicate ids, soft-404 pages, boilerplate labels ("Skip to main content", "Know More"), English-only `/spa/` pages | First build from the live crawl | Invalid manifest; noisy routing | Unique ids, soft-404 filter, label filters, language-neutral `/spa/` pages | `tests/unit/vodafone-kb.test.ts` |

## 2. Open issues

| # | Issue | Severity for the demo | Workaround today | Next step | Owner / task |
|---|---|---|---|---|---|
| O1 | Not run on the **live site** from code: the build machine cannot reach vodafone.com.eg | High | Replay mode works offline | Run `npm run demo:live` on the demo Mac; runbook §3 | Owner, T-301, T-503 |
| O2 | **Real speech recognition** not verified (no speech service in CI) | High | Typing in the panel | Microphone check in Google Chrome, runbook §3 | Owner, T-601 |
| O3 | The **shop** was not crawled (owner stopped that step); "وريني الموبايلات" goes to the bundles page | Medium | Skip demo moments 5–6 | Crawl the shop's public pages with `npm run sync` (without `--origin web`) when approved | T-201 |
| O4 | Moment 7's on-stage notification needs the clone site config | Medium | Say the watch is set; skip the notification | Build `config/sites/vodafone-clone.yaml` | T-306 |
| O5 | `guide.js` size budget (20,480 B gzipped). 2026-11-05: **met**, 20,401 B measured on Linux as CI does (ADR-0041); was 20,562 B after c2b1a12. Only 79 B of headroom | Low | — | The next addition to `guide.js` needs its own saving; candidates in ADR-0041 | T-504 |
| O6 | Typed requests keep the panel open, which can cover the spotlit card on Arabic pages | Medium | Use voice on stage | Close or move the panel when the target is under it | New task |
| O7 | The **Playwright crawler** has never run against the live site | Medium | Committed knowledge base; browser-tab crawl (runbook §5.2) | Dry run first on the Mac: `npm run sync -- --site vodafone-eg --origin web --dry-run` | T-205 |
| O8 | The browser-tab crawler cannot take the five `/spa/` app pages | Low | Keep the committed knowledge base or use §5.1 | Document or automate the top-document capture | ADR-0032 |
| O9 | Replay shows alt text instead of pictures (pictures not saved; home alt text has stray CMS HTML) | Low (offline fallback only) | Say so if replay is used | Save images in the replay fixture | T-207 |
| O10 | Sync is on demand only: no `lastmod` incremental runs, no content-hash reuse, no `kb_sync_runs` table, no reload on activation, no smoke replay in the gate | Low (schedule is paused) | Manual refresh the day before | Rest of T-205; schedule needs D3 approval | T-205, D3 |
| O11 | Evaluation sets are small: 33 tuning, 18 held-out (plan: 50 + 20 per language). Held-out: 14/18 fully right, destination 17/18 | Medium | — | Collect real requests per JTBD §7 | T-206 |
| O12 | No visual snapshots, contrast or font checks; no tests for reduced motion, barge-in, interaction details, accessibility live region | Low | Manual review | T-103, T-105, T-405, T-407 | — |
| O13 | Live-site safety-rule tests (agent asked to pay or type a password) not written | Medium before any customer use | Commit guard and blacklist exist from the demo build | T-308 | — |
| O14 | X-ray colours for agent and error rows are outside the palette (demo-only, operator-facing) | Low | — | Restyle if the X-ray is shown to Vodafone | T-105 |
| O15 | Chrome's server recognition sends audio to Google unless the on-device model is installed | Needs a decision | `speech.onDevice: prefer` | Data-protection decision | D2 |
| O16 | CI has never run; no `package-lock.json` | Low | Local runs | First PR run; commit the lockfile | T-501, T-502 |

## 3. Flaky tests seen

B3 and B4 were the causes of the flaky failures seen on 2026-10-23. After the fixes, `tests/e2e/guide.e2e.test.ts` passed 4 runs in a row and the full suite passed twice. Report any new flake here with the run log.
