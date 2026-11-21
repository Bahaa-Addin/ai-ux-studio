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
| `--replay` | Vodafone pages saved on 2026-10-23 (§2.2); a page not saved opens from the internet |
| `--kiosk` | Full screen, no browser chrome (on stage) |
| `--xray open` | Open the X-ray drawer (what the guide heard, decided and did, with timings); `button` (default) shows a button for it |
| `--kb <manifest.json>` | Use this knowledge base instead of the default (§4) |
| `--store postgres` | Use the Postgres store and its active knowledge version |
| `--browser chromium` | Playwright's Chromium instead of Chrome: typing works, speech does not (ADR-0033) |
| `--port <n>` | Another port if 4400 is taken |
| `--agent <preset>` / `--agent off` | The fallback agent's model when `VG_LLM_*` is not set. Default `page-agent-testing`: page-agent's free testing API (`qwen3.5-plus`, Alibaba Cloud, mainland China; evaluation only, never for customers, ADR-0042). `off`: no agent |
| `--aixc off` | Leaves out the experience layer (`aixc.js`, ADR-0048), which the site config otherwise adds beside the guide on `/en/` and `/ar/` pages with `#main-content`. For one page: add `?aixc=off` to its address; `?aixc-debug` exposes `window.__aixc` |

Stop: close the browser window, or press Ctrl+C in the terminal.

### 2.2 Offline, on saved pages

```sh
npm run demo:live -- --replay
```

The same, but Vodafone's origins are served from `fixtures/replay/vodafone-eg/`: 14 pages captured on 2026-10-23 with Vodafone's own stylesheets and fonts. Saved pages: home, mobile internet bundles, RED, home wireless, services, Vodafone Cash (each in Arabic and English), promotions (English) and the store locator (`/spa/storeLocator`). Any other page, and a picture, font or style the replay did not save, is opened from the internet (owner, 2026-11-13: replay keeps this live fallback); no e-shop page is saved, so every e-shop link, sticker and "Buy now" links included, opens the live shop. Only when the internet does not answer does a page say "not in replay". Speech recognition uses Chrome's service. The tests run replay fully offline (`offline: true`): nothing leaves the machine there. Page scripts are off in replay, so a stand-in of the accessibility button is drawn where the real one sits, and pictures were not saved, so their alt text shows in their place (on the home page that alt text includes stray HTML from Vodafone's CMS).

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
5. On a first visit, Vodafone's cookie banner covers the page, the microphone included; answer it yourself (the guide never does). Then ask "إيه أرخص باقة نت" on the live site. If the spotlight lands on the wrong element or nothing happens, Vodafone may have changed the page: run a sync (§5) and read its report.

## 3d. The Pocket's live smoke (live plan phase 3, S17; the owner runs it)

The one check of the Pocket on the real site. It is yours to run, never in a loop. O29 is resolved: this Mac reaches web.vodafone.com.eg only through a browser (`curl`, `nc` and Node's `fetch` time out on port 443; DNS 82.129.223.108), so every live check does its requests inside Google Chrome; the Pocket smoke passed in English and Arabic on 2026-11-15. The flow was rehearsed on the saved pages first (`tests/e2e/pocket-smoke-rehearsal.e2e.test.ts`, 6 tests), so what it finds is about the real site, not the flow.

```
VG_LIVE=1 VG_LIVE_BROWSER=chrome node --test --test-timeout=600000 tests/live/pocket.live.test.ts
```

It opens `/en/services`, and `/ar/services` if the first passes, in your installed Google Chrome with the demo profile (`data/demo-profile`, or `VG_LIVE_PROFILE`), signed out, with at most 6 page loads at least 1.2 s apart, and prints every step in plain words.

- **First, answer the cookie banner yourself** in that Chrome window, once (the profile remembers it). The test **never** answers it: if the banner is showing it prints "The cookie banner is showing. Answer it yourself in this browser window (this test never does), then run the test again.", presses nothing and reports `skipped: banner` (a skip, not a failure). In English the banner floats bottom-left, where the Pocket button is.
- **It stops** at a bot check or challenge page (403, 429, 503, "Access denied", "Just a moment", a captcha marker), at any other error page, and never retries or tries to get past one (AGENTS.md §4.5).
- **What it does** (all with real mouse presses on the layer's own controls): hover a card and press its "Pocket it" chip; check the Pocket button shows 1, bottom-left, and a press reaches it; open the album, close it with Back and check the page is at the same scroll (within 2 px); reload (Vodafone's own storage clear runs) and check the sticker survived; open "Your journey" in place from the pill (it allows the trail's own consent if the card shows: ours, not Vodafone's); press the sticker's own link, which runs the portal.
- **It measures the portal's requests** (the open question of ADR-0065): "the destination was requested N times from the network (fetch: a, navigation: b, from cache: c)", with the response's `Cache-Control`, `Vary` and the NAMES of any `Set-Cookie` cookies (never values). One request means the navigation was served from the cache; two means it was not, and the live default should become the picture preview (ADR-0065, "Revisit when"). This is a measurement, not a pass/fail.
- **It passes** when no `[AIXC]` error was logged, no page error came from the layer, Vodafone's accessibility button and the cookie banner have the same boxes, styles and `style` attributes as before, every element of the layer carries `data-aixc`, and the layer is still `ready`. It then removes only what it added (its stickers; the trail's consent only if it gave it); it never touches Vodafone's cookies or storage.
- Send the printed report back (the request count and the cache headers are the facts the plan is waiting for).

## 3e. The floating and motion live checks (ADR-0075; run after any change to the Pocket, its turn, the portal or the actors)

Two checks of what the Pocket and the layer do on Vodafone's real pages, with the numbers and the pictures to look at. Both passed on 2026-11-15 and on 2026-11-17 (before the fixes of ADR-0075), and the review of the pictures still found defects: a pass means the rules held, not that nothing looks wrong. **Always look at the screenshots.** Run them from `voice-guide/`, with the sandbox off, in your installed Google Chrome, with the demo profile (the cookie banner already answered by you). Each loads at most a few pages, 1.2 s apart, stops at a bot check or challenge page and never answers the banner.

```
VG_LIVE=1 VG_LIVE_OUT=<a directory outside the repository> VG_LIVE_PROFILE=$PWD/data/demo-profile node --test --test-force-exit --test-timeout=1200000 tests/live/floating.live.test.ts
VG_LIVE=1 VG_LIVE_BROWSER=chrome VG_LIVE_OUT=<a directory outside the repository> VG_LIVE_PROFILE=$PWD/data/demo-profile node --test --test-force-exit --test-timeout=900000 tests/live/motion.live.test.ts
```

- **`VG_LIVE_OUT`** is where the run writes its screenshots and reports (`floating-live.json`, the motion report and JPEGs). It must be **outside the repository**: a path inside it is refused. Without it the run writes to a temporary folder. The folder is yours; nothing of it is committed.
- **Where to keep the evidence:** copy a run you want to keep to `output/live-verify-<date>/` at the repository root (for example `floating-before/`, `motion-before/` and a `confirmation.md` that says which finding each picture shows). It is git-ignored (`.git/info/exclude`). 2026-11-17's is `output/live-verify-2026-11-17/`. A scratch folder can be cleared at any time, as 2026-11-15's was, so copy it the same day.
- **Floating** (32 cells: English and Arabic, 1366x900 and 375x812, states from load to the open journey, with the banner absent and present): rules on boxes, covers and the accessibility button's style. New since ADR-0075: rule **(f)**, a drone that is hidden at 640 px or wider in the album is a violation (before, the drone was never measured and its rules never ran); rule **(a)**, the curl's *painted polygons* are measured (before, the rule could never fire); rule **(h)**, our words drawn in a system font (Helvetica, Geeza Pro, a generic sans) are a violation, read through Chrome DevTools. 2026-11-17, before the fixes: passed, 32 cells, 20 page loads (20 planned), 38 presses (0 in the banner pass), 0 violations.
- **Baselines are Vodafone alone.** The `?aixc=off` baseline pages refuse `/__vg/` requests by route, so the guide's mic and the trail's pill are not in them; the number of page loads does not change.
- **Motion** (rounds of chips, ride, dash back, portal and Back): the screenshots are **whole-viewport** (Playwright's viewport screenshot at device scale), not the 500x795 CSS px corner the first version wrote (every JPEG was 1000x1590 px at a pixel ratio of 2). The report fields to read:
  - the **flight to the landing**: filmed to 2,250 ms (560 + 520 + 820 + 300 ms) with the real times, so the end of the flight is in the film;
  - **`cardsHiddenMs`** (and the unpainted count): after the album closes, how long Vodafone's carousel cards are not painted, over a film of 3 s. A long time here is the F3 fault (carousel cards invisible while our chips float over empty grey). It is reported only: the check has no threshold, so read the number and the film;
  - **`mascotMs`** and **`backOnScreenMs`**: after the portal's Back, how long until the mascot is on screen and until the album's Back is on screen, over a film of 3 s (NEW-2: the mascot was absent for over 3 s);
  - frames over 33 ms with the album open, and layout counts and script time at rest (F11: +301 layouts in 5 s against 0 for the page alone).
  2026-11-17, before the fixes: passed, 12 page loads (cap 16), 17 page requests (12 documents, 4 portal fetches, 1 self-reload of `/en/vodafone-cash`, which Vodafone's page does once per browser session), 24 presses, 228 screenshots.
- **Page errors that are not ours:** Vodafone's scripts throw `TenantFeatures` errors; `/vodafone-cash` reloads itself once per session. Neither fails a check.
- **Offline rehearsals** run the same flows on the saved pages first: `tests/e2e/motion-live-rehearsal.e2e.test.ts` (7 tests), `floating-live-rehearsal.e2e.test.ts` and `floating-controls-live.e2e.test.ts` (4 tests). A rule that fails in a rehearsal is a fault in the layer or the rule, not in the site.

## 3f. Running a demo with the page watch (ADR-0078)

- The watch is on where `experiences.demos.watch` is true in `config/sites/vodafone-eg.yaml` (switched on in phase 6's last commit) and the Pocket is on.
- Before the demo, open the album on a Vodafone page with nothing pocketed and press "Watch two example cards" (demo mode). Or open any Vodafone page with `?aixc-watch=fill`.
- On the saved pages both stickers say "Watching · No change since 23 Oct". On live pages they say whatever changed since.
- To show a change offline, use the e2e's TEST-ONLY edited copies. Never edit the 23 Oct fixture.
- Reset: `window.__aixcWatch.reset()` in the console (phase 7 adds a button). It deletes only `aixc-watch-v1`.
- The server never checks Vodafone (`watch.mode: browser`): `POST /v1/watch` answers 409.
- Rebuild the demo data only if the reader changes: `npm run watch:baselines`. It reads the 23 Oct capture; never re-capture that folder.

## 3a. The guide's voice: VoiceTut (ADR-0047; the owner's demos only)

The guide speaks with VoiceTut, an Egyptian Arabic and English voice, when `VG_VOICETUT_URL` is set. Otherwise it uses the browser's own voice (§1), and it falls back to that voice for any sentence VoiceTut has not made within 2.5 s. VoiceTut's weights are CC-BY-NC: never for customers.

1. **Deploy** (the owner, with his Modal login; once, and again after changing the app): `pip install modal`, `modal token new`, `modal deploy experiments/voicetut/modal_app.py`. Set a spending limit in Modal. Modal prints the endpoint.
2. **Point the demo at it** in the shell that runs the demo: `export VG_VOICETUT_URL=<the endpoint>`, an HTTPS origin with no path. Never commit it.
3. **Before an audience**, run `npm run speech:warm`. It covers both languages, about 390 sentences: the guide's fixed phrases, "Taking you to …" for every page, and the plans for the tuning questions. The first call after Modal has scaled down can take minutes. Run it again after changing the model or a voice setting, because both are part of the cache key. `--dry-run` only counts the lines. Since 2026-11-13 (ADR-0059, the value gate) no plan line carries a stored price, so lines cached before that day that named one are never asked for again; to free the space, empty the speech folder under the data directory (`data/speech`) and run `npm run speech:warm` again.
4. **Check it.** Run `npm run demo:live -- --xray open` and ask something. The X-ray's "speak" rows say whether VoiceTut or the browser voice spoke, with the time to first audio.
5. **When the browser voice speaks instead**, the row gives the reason:

   | Reason | What happened | What to do |
   |---|---|---|
   | `budget` | VoiceTut was not ready in time | Warm it up (step 3) |
   | `error` | VoiceTut failed | Check `VG_VOICETUT_URL` and Modal |
   | `blocked` | Chrome would not play the audio | — |
   | `private` | The line held personal data, so it was never sent; the page checks and the service checks again. Covered: an Egyptian mobile number, unbroken or in groups (spaces, line breaks, dashes, dots, slashes, brackets, `+20` or `0020`, in Arabic-Indic, Persian or full-width digits), an email, a 14-digit national ID, a card number, any other run of 10 or more digits. Not covered: landlines, other countries' numbers, a number said in words | — |

   Values the page reads aloud (the cheapest bundle and its price) cannot be made ahead. When VoiceTut is not ready in time, the browser voice says them (O28).
6. **What leaves the machine:** only the guide's reply text, which goes to VoiceTut on Modal, outside Egypt. Never the person's voice, transcript or anything typed.
7. **What is stored:**
   - Known lines are kept in `data/speech/` (git-ignored), keyed by settings and text, with no text in the files.
   - Values read on the page stay in memory only.
   - Settings are in `config/sites/vodafone-eg.yaml` under `speech.out`: a voice per language (pick by ear, D9), steps 16, 32 or 48, speed 0.85, 1 or 1.15, and `firstAudioMs`.

## 3c. The public demo: gateway, Whisper and the extension (ADR-0053 to ADR-0056)

The demo browser stays the stage and test setup. For people who open the real site in their own browser:

1. **Whisper on Modal** (speech-to-text for Firefox and Brave, ADR-0055): `modal secret create vg-whisper WHISPER_TOKEN=<random 32+ chars>`, then `MAX_CONTAINERS=2 modal deploy voice-guide/deploy/whisper/modal_app.py`. Note the URL it prints; it goes into the Render dashboard as `VG_WHISPER_URL`, and the same token as `VG_WHISPER_TOKEN` (step 3). Set a workspace spending limit in Modal's settings.
2. **VoiceTut** (optional; allowed for public visitors, capped per day, owner 2026-11-13): `MAX_CONTAINERS=2 modal deploy experiments/voicetut/modal_app.py`, then enter its URL in the Render dashboard as `VG_VOICETUT_URL` (step 3). The gateway caps it at 300 new sentences per site per day (`VG_VOICETUT_SENTENCES_PER_DAY`); past that, visitors hear the browser voice. Without `VG_VOICETUT_URL` the browser voice speaks.
3. **The gateway on Render's free plan** (ADR-0067). Render needs no card. The service and its database are described by `render.yaml` at the repository root. One-time setup:
   - Push `feature/live-way2` to the GitHub repository yourself (nothing here pushes). Create a Render account and connect it to that repository.
   - In Render: New, Blueprint, the repository, branch `feature/live-way2`. Render reads `render.yaml`: the web service `vg-public-demo` (free plan, Frankfurt) and the free database `vg-public-db`. It asks for `ANTHROPIC_API_KEY` and, if you use them, the Whisper pair (`VG_WHISPER_URL`, `VG_WHISPER_TOKEN`) and `VG_VOICETUT_URL` (steps 1 and 2); leave the ones you do not use empty, and the gateway treats them as unset. `VG_SECRET` and `VG_ADMIN_TOKEN` are generated by Render. Secrets are entered in the dashboard, never in the repository. Create it, then wait for the build and the deploy. The gateway refuses to start with an unsafe setting and says which (the service's logs in Render).
   - Then, from `voice-guide/`: `npm run gateway:check -- https://vg-public-demo.onrender.com` (or the URL Render shows). The service may be asleep: the first request can take up to about two minutes (below).
   The checks: `GET <url>/health`, read twice with two forged client-address values, answers 200 with `ok: true` and `clientHeader: true` and the same client key both times; it prints your client key (a salted fingerprint of the address the gateway keys you on, for IPv6 your /64 network, never the address) and the gateway's boot id; and **the forged-address check**: 15 turn requests sent at the same time, each forging `X-Forwarded-For`, `CF-Connecting-IP` and `True-Client-IP` with values unique to that turn, must get at least one of the gateway's own 429s (code `rate_limited`: the limiter keyed them on the same real address). It uses up your own turn budget for about 30 seconds. Run it again at any time. It exits 0 when it passes and 1 otherwise. What a failure means:
   - **`clientHeader` is false**: the host dropped the client-address header (the check's own request sends one), so every visitor would share one rate limit. Check `VG_CLIENT_IP_HEADER` (`cf-connecting-ip`) against the host. Do not share the extension.
   - **Forgeable** (every turn let through): the address can be forged and the rate limits do not hold; this is also what a gateway reached without Cloudflare in front shows. **Stop.** Do not share the extension, add no workaround, and tell the owner (ADR-0067 §2).
   - **The client key changed with the forged header**: the gateway keys on a value the caller sends; forgeable, as below.
   - **`/health` did not answer, or answered 5xx**: the service may still be waking up (about a minute); run the check again, and read the service's logs in Render if it persists.
   - **Once after each deploy, from a second network** (a phone's hotspot, not a device on the same home network), run the check again within 15 minutes: the client key must differ from the first run's. The two keys compare only when both runs show the same boot id; if it changed (the service slept or was redeployed, which makes a new salt), run both again. The same key from two networks under one boot id means the gateway keys everyone on one address (the header is not the visitor's own), and every visitor shares one rate limit.
   - **Could not run** (401 or 403 for the site key or origin, a 5xx, a 429 from the front end rather than the gateway): run it again a minute later.
   Render does not document that Cloudflare's `CF-Connecting-IP` reaches the gateway; this check is what shows it (ADR-0067). Also check: `curl <url>/health` shows `"agent":{"available":true,...}` and the site.
   Deploys are manual: Render dashboard, the service, Manual Deploy, Deploy latest commit (the owner pushes the branch first). They do not run by themselves.
   **Every 30 days: the database.** Render's free Postgres expires 30 days after it was created, and Render deletes it and its data 14 days later. Write the date 30 days after creation in a calendar when you create it (Render may email before expiry; that is not verified, so do not rely on it). Before then: create a new free database (the Blueprint's `vg-public-db`, re-synced in Render; Render allows one free database per workspace, so how the old one is removed first has not been checked) and redeploy the gateway. It creates its tables and the committed knowledge base at start. Everything else in the old database is lost: sessions, traces, the day's quota counters (they start again from zero), cached items and hand-off tokens. If this step is missed, the gateway cannot start once the database is gone. There are no backups.
   Watch: outbound bandwidth (5 GB a month; a 3 s VoiceTut sentence is about 144 KB, estimated at 24 kHz mono 16-bit, not measured) and instance hours (750 a month). Without a card, Render suspends free services when they run out; it does not bill. The service spins down after 15 minutes without traffic: the first visitor then waits about a minute for Render, then about 30 to 45 s for the gateway to start on its database (42 s on a new, empty one, as after the monthly renewal) and about 5 s for the first session (the last two measured with Docker at Render's free sizes, ADR-0067; Render's own cold start is not measured), and the extension's guide may give up first.
4. **The extension**: `npm run extension:build -- --gateway https://vg-public-demo.onrender.com`. Chrome/Edge: `chrome://extensions`, Developer mode, Load unpacked, `extension/dist/chrome`. Firefox: `about:debugging#/runtime/this-firefox`, Load Temporary Add-on, `extension/dist/firefox/manifest.json`. For the stores, zip each folder's contents and upload it unlisted (Chrome Web Store, $5 once; addons.mozilla.org, free).
5. Open `https://web.vodafone.com.eg/en/home`: the microphone appears; in Firefox the first press shows the speech-to-text notice. After a page change in Safari or Firefox a reply may wait behind **Tap to hear**.

Budgets to watch in `/metrics` and the traces: `agent.calls`, `stt.clips`, `speech.capped`; the day's caps are `VG_AGENT_TOKENS_PER_SITE_DAY`, `VG_STT_SECONDS_PER_DAY` and `VG_VOICETUT_SENTENCES_PER_DAY` (300 on the public gateway).

## 3b. What the experience layer reads on a page (live adapter, ADR-0046 §3, ADR-0049)

The layer reads Vodafone's cards into the demos' content model: `experiences/src/host/live-adapter.js`, with one row per Vodafone component in `recognisers.js`. A demo is offered on a page only when coverage is above its threshold: Reimagine 0.9, Pocket 0.6. Coverage is the share of cards with a title and an action, either a link or one of the page's own dialogs.

Coverage on the saved pages of 2026-10-23 (`tests/integration/live-adapter.test.ts` prints this table). English and Arabic agree on every page.

| Page | Portlets | Sections read | Items | Coverage |
|---|---|---|---|---|
| `/{en,ar}/services` | 8 | 6 (and the hero, the app band) | 30 | 1 |
| `/{en,ar}/mobile-internet-bundles` | 6 | 2 | 20 (21 in Arabic) | 1 |
| `/{en,ar}/vodafone-red1` | 6 | 2 (the plans, the three picture rows; partner logos are not cards) | 8 | 1 |
| `/{en,ar}/home` | 4 | 3 (with the three banner slides) | 10 | 1 |
| `/{en,ar}/vodafone-cash` | 9 | 1 | 8 | 1 |
| `/en/promotions` | 2 | 1 | 2 | 1 |
| `/{en,ar}/wireless-net` | 10 | 0 (FAQ, text, a router offer and a price table no row reads: 2 unread) | 0 | 0 |

- **Item ids:** each id is the first candidate unique on the page, from the link path, then the picture's file name, then the title's Latin letters and digits, then the tab, then the section's place. The same in English and Arabic: Services 28 of 30 (the two others are slips on Vodafone's Arabic page), home 8 of 8, RED 5 of 5, Vodafone Cash 8 of 8, the bundles page only 2 of 20 (one shared link, no picture that tells the cards apart, so the titles decide; O26).
- **Not checked yet:** the live pages (O29), and the 38 knowledge-base pages that are not in the replay (34 of them `/en/` or `/ar/` pages).
- **If Vodafone renames a class:** the cards no row reads still count (as `unread`), so coverage drops on that page and the demo is no longer offered there (checked for every card kind on every saved page). With `?aixc-debug`, `window.__aixc.coverage.sections` names the sections with unread blocks. Fix the row in `recognisers.js`, or add one for a new component.
- **Links** in the model are the ones the browser would follow: relative to the page, so an Arabic page's cards stay under `/ar/`.
- **The page changing after it loads** (carousels, lazy sections, a price or title filled in late): the layer reads it again a quarter of a second later (two seconds at most on a page that keeps changing), keeps the same ids, and keeps its marks off carousel copies. `window.__aixc.reads` counts the reads.
- **Knowledge destinations:** the layer asks `GET /v1/page-map` (only when the site config's `experiences.enabled` is on) and keeps each section's destination on its model (`section.destinationId`); it tags nothing on Vodafone's portlets for this (ADR-0049). On the saved Services pages all six sections are named, in both languages. To see them: open a page with `?aixc-debug` and read `window.__aixc.model.sections` in the console (in replay, start with `npm run demo:live -- --replay --clone off`: by default the clone is mounted on Services and the layer stays off there). If no section is named, read `window.__aixc.pageMap`: `null` means the map did not come (the gateway, the site key, or `experiences.enabled`; the layer waits 2 s and logs nothing). If the map came but one section is not named, the knowledge base's locator for it no longer finds exactly one element: refresh the knowledge base (§5).
- **"Pocket it" on the cards** (phase 3 S6, ADR-0052 §10-§14): drawn from an overlay after the content, never inside Vodafone's cards, on the website where coverage is 0.6 or more. The buttons are out of the Tab order (owner, 2026-11-13): screen readers reach them by name in the group "Pocket it on this page"; there is no keyboard shortcut. With `?aixc-debug`, `window.__aixc.demos.pocket.chips()` gives the card ids whose chip shows (`shown`; not the cards wholly cut by their carousel, whose buttons stay for screen readers in a 1 px clipped box), the ones drawn as the icon alone (`icon`) and those with no free corner (`unplaced`, icon-only at the top end corner). A chip missing on a card: the card is not in the model (coverage, its row), sits in one of Owl's loop copies (never chipped), or is wholly cut by its carousel. Tests: `node --test --test-concurrency=1 tests/e2e/pocket-chips.e2e.test.ts` (port 4486, about 2 minutes).
- **One Pocket across pages** (phase 3 S7, ADR-0051 §7 and §8): the album groups stickers by the page they were kept on (the address without its language), this page first, each group named in the language the album is read in when a sticker knows the page by that name; a sticker kept in the other language is marked with its language. On a page read well (the website, coverage 0.6 or more) each sticker is matched to its card by the score, in memory, and the stored id is never rewritten; a sticker with no card says "No longer on this page" (it keeps its link and Remove). A sticker you expected on a card but see unmarked: the card changed too much to be told from another (the page's reading is in `window.__aixc.model`), or the page was below the gate. A sticker labelled as gone while its card is on the page: the read missed the card (a tab pane not rendered yet); read the model with `?aixc-debug`. Tests: `node --test --test-concurrency=1 tests/e2e/pocket-across.e2e.test.ts` (port 4487, about 20 seconds).

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
- `--origin web` leaves the shop out, as the 2026-10-23 crawl did. **Without it the run is refused** before anything is fetched (2026-11-13, ADR-0060 §1): `crawl.origins.shop.ready: false` in the site config holds the shop back until its safeguards are in code (robots.txt failing closed, pacing per origin, the wait for its app; e-shop plan E7 and E8). Only then does the shop's first sync come, as its own dry run (E14).
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

**The first sync after 2026-11-11 will be held** (ADR-0049 §6). The crawler now starts a locator at Vodafone's portlet (`#p_p_id_…_INSTANCE_… > …`) instead of at the column's nth portlet, so most destinations change: estimated from the committed knowledge base, 356 of 524 (68%; the check allows 15%). The sync report's churn row shows it as about `126 removed (… renamed, … by position, 0 lost), 230 re-targeted`. The ingest report (`data/reports/vodafone-eg-<version>.md`, "Changes since") has four lists: "Renamed" (the same place under a new id, told by a label of its own or, for a card, its name in its renamed list), "Paired by position only" (nothing to tell them by but their place in the portlet), "Removed with no counterpart" and "Added with no counterpart". The renames to expect:

- 44 destinations named after a hash of their locator (`web.….x0cee7a`, sections and pictures without an English label): a new hash;
- 11 card lists named after the column (`web.wireless-net.layout-column_column-1`, `-2`, …) and their 71 items: now named after their English headings (`web.wireless-net.home-wireless-bundles`, `.0`, `.1`, …), or after a hash where a list has none (4 lists and 39 items: `web.short-numbers`, `web.kart-el-korout` and two on an Arabic-only page).

**Read "Removed with no counterpart" first.** Every id there is a place the new version no longer has: a real change on Vodafone's side, or a section the crawl did not see. **Then check each pair under "Paired by position only"** on the site: those have no label to confirm them (an unlabelled picture or section, or one of several lists headed alike), so one that went and one that came in the same portlet layout look the same to the report. On the saved pages 3 of 26 renames are of this kind. When the first list is empty or explained and the pairs are checked, activate the held version with the command the report prints, then rebuild the experience profile, which names all the renamed ids: `npm run experience -- --site vodafone-eg --activate`. After this one sync, the names and locators stay put when an editor adds a section.

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

## 5a. The end-to-end demo walkthrough (as run on 2026-11-05)

`node tools/demo-walkthrough.ts <out-dir> --lang en|ar [--phone] [--reduced] [--video]` runs the walkthrough of the 2026-11-05 handoff (phase C) on the saved Vodafone pages, with the Services clone at `/en/services` and `/ar/services`: trail consent; two spoken questions (bundles, Vodafone Cash) through the test speech stand-in; the clone where the four demos meet, with every floating control measured for overlaps on load, with the Pocket peeking and in the reimagined view; two stickers into the Pocket, the mascot and drone, "Your journey", a question chip; Reimagine (magazine, then tunnel), the Pocket from the reimagined view, and a spoken question there. It writes numbered screenshots, `checks.json`, `controls.json`, `xray-turn.json` and, with `--video`, a recording. Headless Chromium, memory store, no agent model. It records failures and carries on.

Run again on 2026-11-07 after ADR-0044 (the corner tucks in during the Reimagine view; a new check that no curl is drawn): English 1366×900 with video 23/26 (O19 ×2, O21), English 375×812 24/26, Arabic 1366×900 24/26, Arabic 375×812 24/26 (O19 ×2 each). In the reimagined view at 1366×900: microphone 1287,515; accessibility 1291,595; Pocket button 1286,666 58×58; the experience's own controls are all clear. Evidence in `output/walkthrough-2026-11-07/`.

Recorded smoke test on 2026-11-07 at 4b87d4c (`--video` on all four runs): the same 23/26 and 24/26 ×3, MP4 recordings in `output/smoke-2026-11-07/walkthrough-*.mp4`.

**On the live site:** `VG_LIVE=1 [VG_LIVE_VIDEO=<dir>] node --test --test-timeout=150000 tests/live/vodafone-live.live.test.ts` opens `web.vodafone.com.eg/{ar,en}/home` in the demo browser (headless Chromium, test speech stand-in, memory store) and stops on an error status or a bot check. It checks that the guide loads and that the microphone is clear of Vodafone's accessibility button, then asks for the cheapest internet bundle. On 2026-11-07 the guide loaded in both languages and the microphone (1287,745) sat clear of the accessibility button (1291,825). The question was skipped in both: on a first visit Vodafone's cookie consent covers the page (the English dialog's full-page filter, and in Arabic the dialog itself sits over the microphone), and the tests never answer it (§0). Ask the question on the Mac after answering the banner once in that Chrome profile (§3). Recording: `output/smoke-2026-11-07/live-vodafone-smoke.mp4`.

Run on 2026-11-05 (Ubuntu 22.04 arm64 VM on the owner's Mac, Node 22.23.4, Chromium 141), after the B-23 fix:

| Run | Checks | Failing (see open issues) |
|---|---|---|
| English, 1366×900, with video | 21/25 | O19 ×2, O20 (tunnel next under the Pocket corner), O21 (drone over the journey) |
| English, 375×812 | 22/25 | O19 ×2, O20 |
| Arabic, 1366×900 | 23/25 | O19 ×2 |
| Arabic, 375×812 | 23/25 | O19 ×2 |
| English, 1366×900, reduced motion | 22/25 | O19 ×2, O21 |

Floating controls, measured (x,y w×h); none overlap in any run:

| Page | When | Microphone | Accessibility | Pocket corner | Reimagine | Your journey |
|---|---|---|---|---|---|---|
| English 1366×900 | on load | 1287,743 64×64 | 1291,825 55×55 | — | 1143,172 207×52 | 1114,112 236×44 |
| | Pocket peeking | 1287,515 | 1291,595 | 1286,820 58×58 | 1143,172 | 1114,112 |
| | reimagined | 1287,515 | 1291,595 | 1286,820 | (view bar) | 1080,112 270×44 |
| English 375×812 | on load | 296,655 64×64 | 300,737 55×55 | — | 172,148 191×48 | 297,92 62×44 |
| | Pocket peeking | 296,507 | 300,587 | 307,744 52×52 | 172,148 | 297,92 |
| Arabic 1366×900 | on load | 1287,743 | 1291,825 | — | 16,172 205×52 | 16,112 190×44 |
| | Pocket peeking | 1287,515 | 1291,595 | 1286,820 | 16,172 | 16,112 |
| Arabic 375×812 | on load | 296,655 | 300,737 | — | 12,148 189×48 | 16,92 62×44 |
| | Pocket peeking | 296,507 | 300,587 | 307,744 | 12,148 | 16,92 |

Verified there: consent and local recording (IndexedDB) with Pause and Clear; spoken questions navigate and spotlight (bundles) in both languages; the X-ray has the turn and its "listen" row (`xray-turn.json`: received, routed 12 ms, planned 13 ms, listen, step, first motion 73 ms); the clone is the journey host; two stickers, the mascot, the drone in the open Pocket, stepped page tabs; a chip turns the page back to Services; magazine and tunnel apply; the view bar is clear of the pill (B-23); the composer is never recorded; the Pocket opens from the reimagined view; no page errors.

**Not verified there, do it on the Mac by hand:** Google Chrome, the microphone and real speech recognition (server recognition is allowed for the owner's demos, O15; check the X-ray "listen" row says whether it ran on-device); the Arabic system voice; the live site. Then the same walkthrough by voice, in English and Arabic, at both sizes. Moments 5–6 (shop crawl) and moment 7's notification (`config/sites/vodafone-clone.yaml`, O3, O4, O6) are not in this build.

### Tips: the walkthrough of the four demos (ADR-0045)

On the Services clone a **Tips** button sits bottom-left. It opens an Apple Tips-style collection: a cover, two tips for each demo with a looping animation, and a closing card. **Try it** points at the real control (the microphone, a "Pocket it" chip and the corner, the Reimagine launcher, "Your journey") and waits for you to press it.

- In the demo browser (`npm run demo:trail`) the first-visit invitation never shows, because the browser is driven by Playwright. Open the tips from the button, or go to `/en/services?tips=open` (`/ar/services?tips=open`).
- The tips remember what was seen and tried in `localStorage` (`aixc.tips.v1`); clear site data to show them as new. `?tips=off` hides nothing but stops the invitation.
- The button steps aside in the Reimagine view and in the open Pocket. The tips never cover Vodafone's accessibility button.
- Measured with the real guide on the saved pages (`tests/e2e/tips.e2e.test.ts`, 2026-11-07): no overlaps with the floating controls on load and with the Pocket peeking, English and Arabic, 1366×860 and 390×844. The walkthrough tool now measures the Tips button too.

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
| Saved Vodafone pages, no Postgres | `npm run demo:trail` | Opens `/en/home` in the demo browser. Press the pill, **Remember my journey**, visit a few pages (Cash, Internet Bundles), then **Services** (the clone with Pocket at `/en/services`; its Arabic page is `/ar/services`, ADR-0043). Rest on Vodafone Cash for a few seconds, then press the pill: the page turns to the Pocket and the journey floats in. Drag the slider, try a question chip. Questions come from `config/experience/vodafone-eg.profile.json` (knowledge version `20261023-122606-5b2080`) |
| The same, any start page | `npm run demo:live -- --replay --trail [--start <url>]` | `--clone off` serves the saved Services page instead of the clone (the layer then runs on that page too, and its Pocket draws the journey in place, as on any saved page; the pill never navigates). Where nothing hosts the journey (`--aixc off`, `?aixc=off`, the `/spa/` app, the e-shop) the pill opens the guide's own sheet (ADR-0050) |
| The same, in Arabic | `npm run demo:live -- --replay --trail --start https://web.vodafone.com.eg/ar/home` | On an Arabic page the pill opens the journey in place, in that page's Pocket, right to left, in Arabic (on `/ar/services`, the Arabic clone's Pocket draws it, ADR-0043) |
| After a knowledge refresh | `npm run experience -- --site vodafone-eg --activate` | A profile for the new version; the old one is never served for a different version |

Reset the trail in the demo browser: **Your journey → Clear journey** in the Pocket, or clear the site's data in Chrome. The person's choice is kept twice (ADR-0050 §8, S9): the `vg-trail:<siteKey>:consent` key in `localStorage`, which Vodafone's theme clears on home, Services, RED and Vodafone Cash, and a copy in the IndexedDB database `vg-trail-consent`, from which the key is put back at the next page. To forget the choice in a browser, clear the site's data in Chrome (both go), or run `localStorage.removeItem('vg-trail:<siteKey>:consent'); indexedDB.deleteDatabase('vg-trail-consent')` in the console; removing the key alone brings it back.

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
