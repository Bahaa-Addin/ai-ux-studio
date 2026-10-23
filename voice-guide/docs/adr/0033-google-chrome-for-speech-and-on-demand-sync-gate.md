# ADR-0033: The demo browser is the installed Google Chrome; the sync gate runs on demand and refuses scheduled runs while paused

- Status: Accepted (tests below; real speech to be confirmed on the demo Mac, runbook §3)
- Date: 2026-10-23
- Area: Live site integration and knowledge sync; amends ADR-0026 (demo browser) and implements SPEC-04 §5 for on-demand runs
- Code: `services/gateway/server.ts` (`recentTurns`), `tools/demo-browser.ts` (`channel`), `tools/demo-live.ts` (`--browser`), `packages/sdk/src/guide.ts` and `i18n.ts` (`speechUnavailable`), `jobs/sync-lib.ts`, `jobs/sync.ts`, `tools/kb/cli.ts`, `jobs/kb-builder/build.ts` (aliases)

## Context

Three things came up while finishing the end-to-end demo on 2026-10-23.

1. **Speech in the demo browser.** The demo browser was Playwright's Chromium. Chromium builds ship the Web Speech API but no speech service: `SpeechRecognition` starts, the waveform moves, and then recognition fails with `network`. The guide reported that as "I didn't catch that", which makes people repeat themselves for nothing. Google Chrome has the service and, from Chrome 139, on-device recognition (`processLocally`), which needs Chrome's component updater to download the language model.
2. **The sync had to exist before anyone runs it.** The owner asked for scheduled crawling to be paused and for public pages only. Both were config values. Nothing stopped a cron entry or a config edit from starting a scheduled or signed-in crawl.
3. **The gate's first real run held a good knowledge base.** Five seeds looked missing: `/en/faq`, `/ar/faq`, `/en/contact-us` and `/en/vodafone-flex` redirect into the `/spa/` app (the in-browser crawler records those redirects as errors), and the site answers `/en/HomeDSLcatalog` and `/en/homedslcatalog` alike, so the builder kept one spelling and dropped the other.

## Decision

1. **The demo browser launches the installed Google Chrome** (Playwright `channel: 'chrome'`) with a persistent profile, and lets Chrome's component updater run (`--disable-component-update` removed) so on-device speech models can install. If Chrome is not installed it falls back to Chromium and says so: typing works, speech does not. Tests keep Chromium with a fake microphone and a stand-in recogniser. `npm run demo:live -- --browser chromium` chooses Chromium on purpose.
2. **A missing speech service is said plainly.** On `network` or `language-not-supported` the guide releases the microphone, shows "Speech recognition is not available here right now. You can type instead." in the bar, opens the panel and focuses the text box.
3. **Sync rules in code, not only in config.**
   - `runSync` forces `publicOnly: true` and no cookies on the site config it crawls with, whatever the YAML says.
   - A run marked `--scheduled` (what a cron entry or a future scheduler passes) is refused while `sync.schedule.enabled` is false. On-demand runs always work.
   - The gate is SPEC-04 §5 step 6 without the smoke replay: 0 integrity errors, no bot challenge, every seed present, destination churn ≤ 15%, router evaluation drop ≤ 2 points. Seeds on an origin the run did not crawl (the shop, this phase) are listed apart and do not hold the gate.
   - Passing activates; failing holds. A held version stays in the store, inactive, with a report that names the command to activate it. Nothing is deleted.
4. **Aliases.** Redirects into a page the crawl captured separately, and second URLs of a page in the same language, become `aliases` of that page's variant. The knowledge service already resolves aliases at runtime.
5. **`npm run kb`** lists versions and moves the active pointer (`--status`, `--activate`, `--rollback`, `--import`, `--export`). Every action can be undone by another.
6. **The X-ray backlog is whole turns.** A page load gets the events of the last 8 turns (at most 600 events), over the stream or long polling, instead of the last 60 events: one agent turn writes dozens of events and used to push earlier turns' first rows out, which made the X-ray end-to-end test flaky.

## Options considered

| Option | Outcome |
|---|---|
| Keep Chromium and add a cloud speech-to-text service | A new dependency, a key and audio leaving the browser through us. Not for a demo; revisit for Safari and Firefox (SPEC-02 §7). |
| Chromium with Google API keys set in the environment | Not supported for third parties. Rejected. |
| Enforce public-only only in config | One edit away from a signed-in crawl. Rejected. |
| Delete held versions | Hard to undo (AGENTS.md §7). Rejected; `keepVersions` stays a target for a reviewed clean-up. |
| Smoke replay of the demo plans in the gate now | Needs a browser and the live pages in the sync run. Deferred; the replay end-to-end tests cover the demo pages meanwhile. |

## Consequences

- The demo machine needs Google Chrome installed. Real recognition is not tested in CI (no service there); it is checked by hand at T−1 (demo-day runbook).
- Chrome's recognition sends audio to Google unless the on-device model is installed. The X-ray listen row shows which one ran (`on-device` or not).
- The rebuilt knowledge base (same 2026-10-23 crawl) is `20261023-122606-5b2080`: same 46 pages and 557 destinations as `…-931ced`, 0% churn, same router scores, with aliases added.

## Pilot knobs

| Knob | Where | Default |
|---|---|---|
| Browser | `npm run demo:live -- --browser chrome\|chromium` | `chrome` |
| On-device speech | `speech.onDevice` in the site config | `prefer` |
| Schedule | `sync.schedule.enabled` | `false` |
| Gate thresholds | `sync.gate.maxDestinationChurn`, `requireSeeds`, `evalCases`, `maxEvalDrop` | 0.15, true, the Vodafone tuning set, 0.02 |

## Revisit when

- Safari or Firefox need voice (no Web Speech recognition there): a speech-to-text service, with its own ADR.
- Vodafone approves scheduled crawling (PRD D3): enable the schedule, add the smoke replay to the gate, record the approval.
- The Playwright crawler runs against the live site from the demo Mac: compare with the 2026-10-23 browser crawl.

## Verified by

- `tests/e2e/live-replay.e2e.test.ts`, "no speech service": the bar says so, the microphone is released, the text box has focus.
- `tests/integration/sync.test.ts`: scheduled run refused; public-only forced; first run activates; same pages publish nothing; churn holds and `--force` activates; a missing seed holds.
- `tests/unit/vodafone-kb.test.ts`: redirect and second-spelling aliases (fails without the builder change).
- `tests/e2e/guide.e2e.test.ts`, X-ray test: 4 green runs in a row after the backlog change (it failed 1 run in 3 before).
- On the saved crawl: `npm run sync -- --site vodafone-eg --from-crawl data/crawls/crawl-20261023T075551-browser` held before the alias fix (5 seeds) and activated after it (all checks pass).
