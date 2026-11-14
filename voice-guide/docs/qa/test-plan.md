# Test plan: Vodafone live phase

- Scope: PRD R1–R4 and their specs. The demo build's 68 tests stay green throughout.
- Principle: the real system, with stand-ins only where it meets the outside world (ADR-0024). The live site is an outside world: offline suites use recorded snapshots, and a separate live suite runs only on purpose.

## 1. Test levels

| Level | Where | Runs | What it covers in this phase |
|---|---|---|---|
| Unit | `tests/unit/` | Every commit, CI | Theme tokens and the AIXC subset; token diff for the transcript; level smoothing; audio mode selection (stubbed APIs); path language pairing; page identification rules; commit lexicon; masking patterns; config schema |
| Integration | `tests/integration/` | Every commit, CI (Postgres service) | Sync job on recorded snapshots (unchanged, small change, 30% churn, 403 storm, robots rules); KB activation and `NOTIFY` reload; `kb_sync_runs`; gateway font route |
| End to end | `tests/e2e/` | Every commit, CI (Chromium) | Voice UI with a **fake microphone** (WAV); placement against copies of the accessibility button and OneTrust banner; SPA route follower on `fixtures/sites/demo-spa`; continuity CMS → SPA → second origin; safety refusals; reduced motion; visual snapshots |
| Live smoke | `tests/live/` | On demand with `VG_LIVE=1`, on the demo machine | Demo browser on `web.vodafone.com.eg` and `eshop`; start on every seed; the eight demo moments with a stand-in speech engine; network allowlist; no SDK console errors |
| Evaluation | `npm run eval:router -- --site vodafone-eg` | After every overlay or router change | Tuning set ≥ 95%; held-out recorded, never tuned on |
| Rehearsal | Demo machine, real voice | Before the demo | Demo script with the runbook; 3 clean runs |

## 2. Stand-ins

| Edge | Stand-in |
|---|---|
| Microphone (end to end) | Chromium `--use-fake-device-for-media-stream --use-file-for-fake-audio-capture=<wav>`: real `getUserMedia`, real analyser |
| Speech recognition (end to end) | `tests/e2e/browser.ts` stub extended to emit timed interim and final results and to accept `start(track)` |
| Speech synthesis | Existing stub; records spoken text and fires boundary events |
| Live site (offline suites) | `tests/fixtures/vodafone-snapshots/` (T-207) and `fixtures/sites/demo-spa/` (T-302) |
| Jev, Laya, LLM, vision, push | Existing stand-ins (ADR-0024) |

## 3. Key cases by requirement

| Req | Case | Level |
|---|---|---|
| R1.1–R1.2 | Computed colours, radius, shadow and fonts of every component on a CMS-like and an SPA-like fixture (body without a font) | e2e |
| R1.5 | Contrast of every guide text style ≥ 4.5:1 (≥ 3:1 large) | e2e |
| R2.2 | Start on each seed page; "what's on this page?" | live |
| R2.3 | Plan crosses CMS → SPA route change → second origin; same shadow host node across the SPA change | e2e + live |
| R2.5 | Microphone, bar and accessibility button rectangles never intersect at 375/768/1280px; OneTrust stays on top | e2e + live |
| R2.6 | Agent asked to pay, confirm, or type a password: refuses; commit buttons have no index | e2e |
| R3.3 | `/en|ar/mobile-internet-bundles` → one page, two variants | integration |
| R3.4 | Gate holds at 30% churn; activates a small change; no new version when nothing changed | integration |
| R3.5 | No disallowed shop path requested; rate limits never exceeded; stop at > 5% 403 | integration |
| R4.2 | Interim sequence → one `.w` per new word, in order; revision replaces only the changed word | e2e |
| R4.3 | Canvas changes between frames with audio; halo scale range > 0.1; rest within 300ms after audio | e2e |
| R4.4 | Esc cancels; push to talk; barge-in ≤ 100ms; auto end after 1.2s silence | e2e |
| R4.5 | Only the final transcript in the live region; keyboard-only walkthrough | e2e + manual |
| R4.6 | Permission denied → error state + "Type instead"; no recognition → panel | e2e |
| NFR performance | `guide.js` ≤ 21 KB gz (ADR-0057); word render p95 ≤ 50ms; frame p95 ≤ 1ms; no SDK long task > 50ms; CLS 0 | CI + e2e |

## 4. Manual checks (each release candidate)

| Check | Who |
|---|---|
| Real voice, Egyptian Arabic, quiet room and with background noise, 20 requests from the evaluation set | Two team members with different accents |
| Android Chrome on a mid-range phone: microphone, bar, waveform, `sdk.stt.mode` | QA |
| iOS Safari: typing fallback works; speech where Safari supports it | QA |
| Screen reader (NVDA on Windows, TalkBack on Android): microphone label, final transcript and reply announced | QA |
| Accessibility widget: text size up, dyslexia font on; guide still readable and placed correctly | QA |
| Brand review against SPEC-01 | Vodafone digital (T-603) |

## 5. Exit criteria for the demo

- All CI suites green; live smoke green twice in a row on the demo machine.
- Acceptance checklist ([`acceptance-checklist.md`](acceptance-checklist.md)) complete.
- No open defect of severity 1 or 2 (severity 1: commit pressed, data leak, page broken; severity 2: a demo moment fails).
