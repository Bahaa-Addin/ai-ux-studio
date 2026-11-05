# Runbook: the voice guide on the Vodafone Egypt website

For whoever runs the demo, refreshes its knowledge base or checks it after a change. Demo-day timing and fallbacks are in [runbook-demo-day.md](runbook-demo-day.md); what to say on stage is in the [demo script](../product/demo-script.md).

State on 2026-10-23: the full flow works end to end on Vodafone's real pages saved for replay, in automated tests (`tests/e2e/live-replay.e2e.test.ts`) with a stand-in speech recogniser. Two things still need the demo Mac, because the build machine cannot reach `vodafone.com.eg` and has no speech service: the **live** site through the demo browser, and **real** speech recognition in Google Chrome. Section 3 is the check for both.

## 0. Rules for every step

These come from [AGENTS.md §4](../../AGENTS.md) and the owner's instructions of 2026-10-23. The code enforces them; do not work around them.

- **Public pages only.** No Vodafone account is signed in to for crawling, for the demo, or for tests. `npm run sync` forces public-only crawling whatever the config says.
- **Scheduled crawling is paused.** Crawls run when a person starts them. A run marked `--scheduled` (what a cron entry would pass) is refused while `sync.schedule.enabled` is `false`.
- The guide never presses subscribe, pay, recharge or confirm. It shows the button and says to press it yourself.
- Never type passwords, codes, card numbers or national IDs into anything the tools drive.
- Leave Vodafone's cookie banner and accessibility button alone. Answer the banner yourself.
- If the site shows a bot check, an access-denied page or anything that looks like you should not be there: stop, and switch to replay (§2.2).

## 1. One-time setup on the demo Mac

You need Google Chrome (installed normally, kept up to date), Node.js 22.18 or newer (`node -v`), and git. Postgres is only needed for the test suites and for keeping several knowledge-base versions (§4); the demo itself runs without it.

```sh
git clone https://github.com/Bahaa-Addin/ai-ux-studio.git
cd ai-ux-studio
git checkout feature/voice-guide-vodafone
cd voice-guide
npm install
npx playwright install chromium     # used by the tests and the crawler; the demo uses your Chrome
npm run typecheck                   # "ok" for both projects
```

macOS settings, once:

- **Microphone.** System Settings › Privacy & Security › Microphone: allow Google Chrome. The demo browser also asks once per site; allow it.
- **Arabic voice for spoken answers.** If the guide answers Arabic text silently or in an English voice, add an Arabic system voice: System Settings › Accessibility › Spoken Content › System voice › Manage Voices, then pick an Arabic voice. Restart the demo afterwards.

Optional, for tests and versioned knowledge bases (from the [README](../../README.md)):

```sh
docker run -d --name vg-pg -p 54329:5432 -e POSTGRES_PASSWORD=devpass -e POSTGRES_DB=voiceguide postgres:16
psql postgres://postgres:devpass@127.0.0.1:54329/postgres -c "create database voiceguide_test"
npm run db:migrate
```

## 2. Run the demo

### 2.1 On the live website

```sh
npm run demo:live
```

It builds the SDK, starts the gateway on `127.0.0.1:4400` (all services in one process, in memory), loads the knowledge base (§4), and opens Google Chrome on `https://web.vodafone.com.eg/ar/home` with the guide added to every Vodafone page. Expected output:

```
Building the SDK...
Knowledge base: 20261023-122606-5b2080 from config/kb/vodafone-eg.manifest.json
Gateway: http://127.0.0.1:4400 (store: memory, agent: on)
Agent model: qwen3.5-plus via page-agent's free testing API: for technical evaluation only, ...
Live: real Vodafone pages
Browser: Google Chrome
Demo browser open on https://web.vodafone.com.eg/ar/home. Press the red microphone and ask. Close the window to stop.
```

What you should see: a red microphone button with a white ring, directly above Vodafone's red accessibility button, 16px apart. Press it, speak, and the words appear one by one in a black bar above it while the wave follows your voice.

First run only: answer the cookie banner yourself (reject non-essential cookies) and allow the microphone. The demo browser keeps its own profile in `data/demo-profile`, separate from your everyday Chrome, so these answers are remembered there and nowhere else.

| Option | Use |
|---|---|
| `--start <url>` | Start on another Vodafone page, for example `https://web.vodafone.com.eg/en/mobile-internet-bundles` |
| `--replay` | Offline: Vodafone pages saved on 2026-10-23 (§2.2) |
| `--kiosk` | Full screen, no browser chrome (on stage) |
| `--xray open` | Open the X-ray drawer (what the guide heard, decided and did, with timings); `button` (default) shows a button for it |
| `--kb <manifest.json>` | Use this knowledge base instead of the default (§4) |
| `--store postgres` | Use the Postgres store and its active knowledge version |
| `--browser chromium` | Playwright's Chromium instead of Chrome: typing works, speech does not (ADR-0033) |
| `--port <n>` | Another port if 4400 is taken |
| `--agent <preset>` / `--agent off` | The fallback agent's model when `VG_LLM_*` is not set. Default `page-agent-testing`: page-agent's free testing API (`qwen3.5-plus`, Alibaba Cloud, mainland China; evaluation only, never for customers, ADR-0042). `off`: no agent |

Stop: close the browser window, or press Ctrl+C in the terminal.

### 2.2 Offline, on saved pages

```sh
npm run demo:live -- --replay
```

The same, but Vodafone's origins are served from `fixtures/replay/vodafone-eg/`: 14 pages captured on 2026-10-23 with Vodafone's own stylesheets and fonts. Nothing goes to the internet except speech recognition (Chrome's service). Saved pages: home, mobile internet bundles, RED, home wireless, services, Vodafone Cash (each in Arabic and English), promotions (English) and the store locator (`/spa/storeLocator`). Any other page shows a short "not in replay" page. Page scripts are off in replay, so a stand-in of the accessibility button is drawn where the real one sits, and pictures were not saved, so their alt text shows in their place (on the home page that alt text includes stray HTML from Vodafone's CMS).

### 2.3 Requests to try

These are the requests the end-to-end tests run on the saved pages. Values (prices, amounts) are read from the page you are on; they are never stored.

| Say (on `/ar/home`) | What happens |
|---|---|
| "إيه أرخص باقة نت" | Words appear one by one; the guide moves to the bundles page, finds the cheapest Vodafone Plus card, puts the spotlight on it and reads its amount and price from the page |
| "اشترك فيها" | It remembers which bundle, spotlights that card's "اشترك الآن" link, and stops: press it yourself; subscribing happens in your Vodafone account, which the guide never signs in to |
| "البانر ده مكتوب فيه إيه" | It reads the text that is only inside the bundles banner picture |
| "إيه اللي في الصفحة دي" | A short summary of the current page, without moving |
| "Where's the nearest store?" | Answers in English, moves into the `/spa/` app's store finder and spotlights its search box; the microphone stays in the same place and the conversation is kept |
| "خلاص" or "stop" | It stops |

Not in this build: the shop (`eshop.vodafone.com.eg`) was not crawled, so moments 5 and 6 of the demo script (smartphones, sorting) are skipped. "وريني الموبايلات" currently goes to the internet bundles page.

## 3. Check the microphone and the live site (before every audience)

1. `npm run demo:live -- --xray open`. The terminal must say `Browser: Google Chrome`. If it says Chromium, install or update Chrome.
2. Press the microphone and say "تجربة واحد اتنين تلاتة". Words must appear one at a time and the wave must move with your voice. Press again to finish.
3. In the X-ray, the "listen" row shows the audio mode (`shared-track` is best), whether recognition ran on the device, and the time to the first word.
4. If the bar says "Speech recognition is not available here right now. You can type instead.", Chrome's speech service is not reachable: check the internet connection, then Chrome's version. Typing in the panel still works.
5. Ask "إيه أرخص باقة نت" on the live site. If the spotlight lands on the wrong element or nothing happens, Vodafone may have changed the page: run a sync (§5) and read its report.

## 4. Knowledge base

The knowledge base says where things are on the site (pages, sections, tabs, card lists, pictures, buttons), never values. `npm run demo:live` takes the first of:

1. `--kb <file>`;
2. the version already active in the store (only with `--store postgres`);
3. `config/kb/vodafone-eg.manifest.json`, committed: version `20261023-122606-5b2080`, built from the public crawl of 2026-10-23 (85 page variants → 46 pages, 557 destinations, 30 card lists, 165 pictures);
4. the newest crawl folder in `data/crawls/`.

With Postgres (§1), versions are kept and switched with `npm run kb`:

| Command | Does |
|---|---|
| `npm run kb -- --site vodafone-eg --status` | Lists versions, newest first, `*` = active; shows whether the schedule is paused |
| `npm run kb -- --site vodafone-eg --import config/kb/vodafone-eg.manifest.json --activate` | Stores the committed version and makes it active |
| `npm run kb -- --site vodafone-eg --activate <versionId>` | Makes a stored version active (after reading a held sync report) |
| `npm run kb -- --site vodafone-eg --rollback <versionId>` | The same, for an older version |
| `npm run kb -- --site vodafone-eg --export config/kb/vodafone-eg.manifest.json` | Writes the active version to a file, to commit it as the new default |

Versions are never deleted by these commands. Every switch prints the command that undoes it.

## 5. Refresh the knowledge base from the live site (public pages, on demand)

Vodafone changes its pages. Refresh before a demo (the day before is best) and whenever §3 step 5 fails.

### 5.1 With the crawler (normal way)

```sh
npm run sync -- --site vodafone-eg --origin web --dry-run    # first: crawl, build and gate, change nothing
npm run sync -- --site vodafone-eg --origin web              # then: the same, and activate if the gate passes
```

- The crawler opens Vodafone's public pages in Chromium with no cookies, follows the navigation two links deep from the seeds in `config/sites/vodafone-eg.yaml`, one page per second, two at a time, and honours `robots.txt`. Pages that show a password field or a login address are skipped and listed. A 403, a 429 or a bot-check page stops the run.
- `--origin web` leaves the shop out, as the 2026-10-23 crawl did. Without it, the shop's public pages are crawled too (its `robots.txt` keeps the crawler out of cart, checkout, wishlist, register and account).
- Without Postgres, add `VG_STORE=memory` in front: nothing is stored, and the command prints the manifest file to use with `npm run demo:live -- --kb <file>`.
- This command has not yet been run against the live site: the build machine cannot reach it. Run the dry run first and read the report. If the run stops on a bot check, do not retry; use §5.2 or the committed knowledge base.

The result:

```
pass  integrity            0 errors
pass  no bot challenge     none
pass  seed pages present   28 present, 0 missing
pass  destination churn    0.0% (limit 15%): 0 removed, 0 re-targeted
pass  router evaluation    100.0% (active 100.0%, allowed drop 2 points)

ACTIVATED: gate passed
Manifest: data/reports/vodafone-eg-<version>.manifest.json
```

(These lines are from the 2026-10-23 crawl, built with `--from-crawl`.) Exit code 0 means activated or unchanged, 2 means held, 1 means failed or refused.

| Gate check | Holds the version when |
|---|---|
| integrity | The manifest has errors (a curated id no longer exists, a broken reference) |
| no bot challenge | The crawl was stopped or blocked |
| seed pages present | A navigation page from the seed list is missing (redirects count as present) |
| destination churn | More than 15% of the active version's destinations were removed or moved |
| router evaluation | The Vodafone tuning set (`tests/fixtures/vodafone-utterances.yaml`) scores more than 2 points lower than on the active version |

A held version is stored but not active. Read `data/reports/sync-vodafone-eg-<time>.md`: if the changes are real (Vodafone redesigned a page), update `config/curated/vodafone-eg.yaml` for the pages involved and sync again, or activate the held version with the command printed in the report. `--force` activates despite the gate; use it only after reading the report.

### 5.2 From a browser tab (when the machine running npm cannot reach the site)

This is how the content pages of the 2026-10-23 crawl were taken ([ADR-0032](../adr/0032-in-browser-crawler-public-pages-only.md)). Same rules, same output, one origin per run.

1. Make the crawler file, leaving the `/spa/` app out (it does not render inside hidden frames):
   `npm run live-crawl:bundle -- --site vodafone-eg --origin https://web.vodafone.com.eg --also-exclude '^https://web\.vodafone\.com\.eg/spa/'`
   It writes `data/live-crawl/crawler-web-vodafone-com-eg.js`.
2. Open a **private (incognito) window** in Chrome, so nothing is signed in, and go to `https://web.vodafone.com.eg/ar/home`. Answer the cookie banner (reject non-essential).
3. Open the JavaScript console (View › Developer › JavaScript Console), paste the whole file and press Enter (Chrome may first ask you to type `allow pasting`; do it for this file only). It answers `'started'` and loads pages in hidden frames with their scripts off, one page per second. Keep the tab open; it took about 10 minutes for 140 pages on 2026-10-23.
4. Check progress with `__vgCrawler.status()`. When `status` is `done` (or `stopped`, with a reason; then do not restart it), run `__vgCrawler.download()`: it saves `vg-crawl-web-vodafone-com-eg-<time>.json` to Downloads.
5. `npm run live-crawl:import -- --site vodafone-eg ~/Downloads/vg-crawl-web-vodafone-com-eg-<time>.json` makes a crawl folder in `data/crawls/` and prints its path.
6. `npm run sync -- --site vodafone-eg --origin web --from-crawl data/crawls/<that folder> --dry-run` builds and gates it.

The five public app pages (store locator, Flex, FAQ, network coverage, contact) are not in this kind of crawl, so the gate holds with those seeds missing. On 2026-10-23 they were taken one at a time as the top document with `tools/live-crawl/extract-entry.ts`, which needs a developer at the console. If a refresh of the content pages is all you need and the app pages have not changed, the committed knowledge base already has them: prefer §5.1, which renders them normally, or keep the committed version.

### 5.3 Refresh the offline pages (optional)

`node tools/live-crawl/make-replay.ts --site vodafone-eg data/crawls/<crawl folder>` rewrites `fixtures/replay/vodafone-eg/` from a crawl that kept rendered HTML (`--capture` when bundling). These are Vodafone's pages, stylesheets and fonts: keep them in the private repository only. Run `npm run test:e2e` afterwards; the replay tests name specific cards and texts.

## 6. Scheduled crawling (paused)

The schedule stays off until Vodafone approves scheduled crawling of its production site in writing (PRD decision D3). While `sync.schedule.enabled` is `false`:

- no code starts a crawl on a timer;
- `npm run sync -- --scheduled` exits with "scheduled crawling is paused for vodafone-eg";
- page-watch checks ("tell me when the offers change") still run, because a person asks for each one and each reads one section of one page.

To turn it on later: record the approval in a new ADR, set `sync.schedule.enabled: true` in `config/sites/vodafone-eg.yaml`, and add a cron entry that runs `npm run sync -- --site vodafone-eg --scheduled` inside the configured window (`07:00–23:00` Cairo time, every 120 minutes).

## 7. Checks after a change

Postgres must be running for the first two (§1).

| Command | Expected |
|---|---|
| `npm run typecheck` | ok for both projects (one known upstream warning, ADR-0017) |
| `npm test` | all unit and integration tests pass |
| `npm run test:e2e` | all end-to-end tests pass, including `live-replay` (Vodafone pages) and `spa-routes` |
| `npm run eval:router -- --manifest config/kb/vodafone-eg.manifest.json --cases tests/fixtures/vodafone-utterances.yaml` | 33/33 |
| `npm run eval:router -- --manifest config/kb/vodafone-eg.manifest.json --cases tests/fixtures/vodafone-utterances-heldout.yaml` | 14/18 fully right, destination 17/18 (2026-10-23); a floor, not a target |

## 7a. Exploration Trail (SPEC-06): demo only

The trail is **off** for `vodafone-eg` (D2). To show it:

| Where | Command | Then |
|---|---|---|
| Saved Vodafone pages, no Postgres | `npm run demo:trail` | Opens `/en/home` in the demo browser. Press the pill, **Remember my journey**, visit a few pages (Cash, Internet Bundles), then **Services** (the clone with Pocket at `/en/services`). Rest on Vodafone Cash for a few seconds, then press the pill: the page turns to the Pocket and the journey floats in. Drag the slider, try a question chip. Questions come from `config/experience/vodafone-eg.profile.json` (knowledge version `20261023-122606-5b2080`) |
| The same, any start page | `npm run demo:live -- --replay --trail [--start <url>]` | `--clone off` serves the saved Services page instead of the clone (the journey then has no host and the pill only goes to `/en/services`) |
| After a knowledge refresh | `npm run experience -- --site vodafone-eg --activate` | A profile for the new version; the old one is never served for a different version |

Reset the trail in the demo browser: **Your journey → Clear journey** in the Pocket, or clear the site's data in Chrome.

Expected in the X-ray for a chip: `router.hint` with `agree` (or `override`), then a `replay` plan. `ignored` means the profile and the knowledge version do not match: rebuild the profile.

## 8. Troubleshooting

| Symptom | Likely cause | Do |
|---|---|---|
| `Browser: Chromium (no speech recognition service)` | Google Chrome is not installed where Playwright looks | Install Chrome from google.com/chrome, then run again |
| The bar says speech recognition is not available | Chromium, or no internet for Chrome's speech service | §3 step 4; type instead |
| The microphone button does nothing; the bar says the microphone is blocked | macOS or the site's microphone permission | §1 microphone settings; in the demo browser, the site settings icon in the address bar › Microphone › Allow |
| No microphone button at all | The guide did not load on that page | Is the terminal still running? Open the browser console: lines starting `[voice-guide]` say why. The page must be on `web.vodafone.com.eg` or `eshop.vodafone.com.eg` |
| `No knowledge base for vodafone-eg` | The committed manifest is missing and there is no crawl | `git checkout config/kb/vodafone-eg.manifest.json`, or §5 |
| `EADDRINUSE` on 4400 | An earlier run is still going | Close its browser window, or use `--port 4410` |
| Answers in the wrong language | The guide follows the language you speak and the page's path | Say the request in the other language, or press the language button in the panel |
| The guide says it could not find something on a page | Vodafone changed the page since the crawl | §5, then read the report's changes for that page |
| A bot-check or access-denied page | Vodafone's protection | Stop. Do not retry in a loop. Use `--replay` |
| `npm test` fails with connection refused on 54329 | Postgres is not running | `docker start vg-pg` |
| A sync is held | The gate found a big change | §5.1 "A held version" |

## 9. Reset

- Forget the demo browser's cookie answers and permissions: close it, then delete the folder `voice-guide/data/demo-profile`.
- Go back to the committed knowledge base: run without `--store postgres` (the default), or with Postgres `npm run kb -- --site vodafone-eg --import config/kb/vodafone-eg.manifest.json --activate`.
- Remove local crawls and reports: delete `voice-guide/data/crawls` and `voice-guide/data/reports`. They are not in git.
