# Bug log: Vodafone live phase

Bugs found while building and verifying the live phase (2026-10-23). For each one: what a person would have seen, why it happened, the fix, and the test that catches it again. Earlier bugs from the demo build are in [the ADR index](../adr/README.md#bugs-found-while-building-and-the-decision-each-one-changed).

Severity: **High** = breaks a demo moment or a safety rule; **Medium** = wrong or confusing behaviour with a workaround; **Low** = cosmetic or test-only.

| # | Bug | Severity | Found by | Fixed in |
|---|---|---|---|---|
| B-01 | Back during a plan did not stop it | High | End-to-end test | `45c08eb` |
| B-02 | A finished agent task could restart on the next page | High | End-to-end test (flaky) | `09fc4f4` |
| B-03 | A spoken request opened the panel over the highlighted answer | High | Video review | `09fc4f4` |
| B-04 | Chromium: "I didn't catch that" on every voice request | High | Demo-browser review | `09fc4f4` |
| B-05 | Sync gate held a good knowledge base (5 seeds "missing") | Medium | First real sync run | `64026ae` |
| B-06 | X-ray lost earlier requests after an agent turn | Medium | End-to-end test (flaky) | `09fc4f4` |
| B-07 | Colours outside Vodafone's palette | Low | Palette unit test, video review | `64026ae`, `09fc4f4` |
| B-08 | Soft 404 test passed even without the filter | Low | Mutation check | `64026ae` |
| B-09 | Word-count check raced the page navigation | Low | End-to-end test | `09fc4f4` |

---

## B-01 Back during a plan did not stop it

- **Seen:** while the guide was moving through the `/spa/` app, pressing the browser's Back button did nothing to the plan; it kept waiting for its page and could act on the wrong view.
- **Cause:** the guide listens to two route signals and de-duplicates them by URL. In Chromium, the Navigation API's `navigatesuccess` (which does not mean "Back") arrives before `popstate` for the same move. The first signal updated the remembered URL, so `popstate` looked like a duplicate and the Back check never ran.
- **Fix:** the Back check runs before de-duplication (`packages/sdk/src/guide.ts`, `#onRoute`).
- **Test:** `tests/e2e/spa-routes.e2e.test.ts`, "Back during a plan stops it and says so once".
- **Decision:** ADR-0030 (now Accepted on the fixture app).

## B-02 A finished agent task could restart on the next page

- **Seen:** rarely, after the fallback agent finished, its state was still stored; on the next page load the guide could start the same task again.
- **Cause:** after each step the agent saved its progress without waiting (`void save(state)`). The final "done" save (`null`) could reach the server before the last step's save, which then overwrote it.
- **Fix:** saves are chained so they arrive in the order sent (`packages/sdk/src/guide.ts`, `#runAgent`).
- **Test:** `tests/e2e/guide.e2e.test.ts`, "fallback agent across pages" (it failed 3 runs in 3 before the fix, 0 in 7 after).
- **Decision:** ADR-0017 (bug row in the ADR index).

## B-03 A spoken request opened the panel over the highlighted answer

- **Seen:** after "إيه أرخص باقة نت", the bundles page opened with the chat panel on the right, covering the 37 EGP card and later its "اشترك الآن" button.
- **Cause:** every request marked the panel "open" for the next page, and a plan resuming after navigation also opened it. SPEC-02 says the voice-first microphone does not open the panel.
- **Fix:** a spoken request keeps the panel closed unless it was already open; a resumed plan or handoff does not open it in voice-first mode (`packages/sdk/src/guide.ts`).
- **Test:** `tests/e2e/live-replay.e2e.test.ts`, test 2 asserts the panel is hidden while the card is highlighted.
- **Still open:** a *typed* request keeps the panel open, which can still cover a card in the right-hand column (handoff §6).

## B-04 Chromium: "I didn't catch that" on every voice request

- **Seen:** in Playwright's Chromium the microphone and waveform worked, then every request ended with "I didn't catch that. Try again".
- **Cause:** Chromium builds have the speech API but no speech service, so recognition fails with `network`; the guide treated every error as a mishearing.
- **Fix:** the demo browser launches the installed Google Chrome (Chromium only as a fallback, with a warning); on `network` or `language-not-supported` the guide says speech recognition is not available, releases the microphone, opens the panel and focuses the text box.
- **Test:** `tests/e2e/live-replay.e2e.test.ts`, "no speech service".
- **Decision:** ADR-0033.

## B-05 Sync gate held a good knowledge base

- **Seen:** the first real `npm run sync` on the 2026-10-23 crawl held the version: 5 seed pages missing (`/en/faq`, `/ar/faq`, `/en/contact-us`, `/en/vodafone-flex`, `/en/HomeDSLcatalog`).
- **Cause:** those URLs redirect into the `/spa/` app (recorded by the in-browser crawler as errors, not aliases), and the site answers `/en/HomeDSLcatalog` and `/en/homedslcatalog` alike, so the builder kept one spelling and dropped the other.
- **Fix:** the builder turns recorded redirects and second spellings into aliases of the page (`jobs/kb-builder/build.ts`). Same destinations (0% churn), same router scores.
- **Test:** `tests/unit/vodafone-kb.test.ts`, "redirects into the /spa/ app and second URLs of a page become aliases" (fails without the change).
- **Decision:** ADR-0033.

## B-06 X-ray lost earlier requests after an agent turn

- **Seen:** after a page load, the X-ray sometimes showed only the latest event and "requests 0".
- **Cause:** a fresh X-ray got the session's last 60 events; one agent turn writes dozens, pushing earlier turns' first rows out.
- **Fix:** the backlog is whole turns: the last 8 turns, up to 600 events, for both the stream and long polling (`services/gateway/server.ts`, `recentTurns`).
- **Test:** `tests/e2e/guide.e2e.test.ts`, "X-ray shows every layer" (failed 1 run in 3 before, 0 in 4 after); `tests/integration/gateway.test.ts`, long polling.
- **Decision:** ADR-0033.

## B-07 Colours outside Vodafone's palette

- **Seen:** chip hover was `#fff5f5`; the "press it yourself" spotlight used an amber ring (`#d97706`).
- **Cause:** values carried over from the demo build's generic theme.
- **Fix:** chip hover uses the palette grey; the commit spotlight uses white and Vodafone dark red (`packages/sdk/src/theme/vodafone.ts`).
- **Test:** `tests/unit/voice.test.ts` checks every colour in the guide's Vodafone CSS against the SPEC-01 palette.
- **Still open:** the X-ray drawer (demo-only) keeps two non-palette colours.

## B-08 Soft 404 test passed even without the filter

- **Seen:** disabling the soft-404 filter left the test green.
- **Cause:** the test page copied the home page's language-switch link, so it merged into the home page and disappeared for another reason.
- **Fix:** the test page has no links, and the test checks both that a normal page is kept and that a "not found" page is dropped.
- **Test:** `tests/unit/vodafone-kb.test.ts`, verified to fail with the filter off.

## B-09 Word-count check raced the page navigation

- **Seen:** the replay test failed with "Execution context was destroyed".
- **Cause:** the guide navigates as soon as the final words arrive; the test read the word counts from the old page afterwards.
- **Fix:** the counts are kept in session storage and read on the new page.
- **Test:** `tests/e2e/live-replay.e2e.test.ts`, test 2.

## B-10 "Let me look", then 503 three times, with no model configured

- **Seen:** on the live site, "اختر لي افضل عرض" and "خطوط شركات" said "ثواني، هدور عليها في الصفحة." then "مش قادر أدور دلوقتي."; the console showed three `POST /__vg/v1/agent/chat/completions 503`.
- **Cause:** the agent proxy returns 503 `agent_unavailable` when no `VG_LLM_*` provider is set; the router routed to the agent on `site.agent.enabled` alone, and page-agent retried each call.
- **Fix:** agent routing, the agent token and the SDK's `agent.enabled` need a configured model (`agentModelConfigured`).
- **Test:** `tests/unit/vodafone-kb.test.ts`, "with no language model configured, nothing is routed to the agent".
- **Decision:** ADR-0034.

## B-11 "Did you mean 400 mega or promotions-lite?"

- **Seen:** "اشتري عرض ال ٤٠٠ ميجا" on the offers page.
- **Cause:** each Vodafone page's `<section id="content">` became a section destination labelled with the CMS template name, matching anything on its page. `ال` counted as an unmatched word and "buy" was not a subscribe verb.
- **Fix:** page wrappers are skipped by the builder and were removed from the committed knowledge base; buy verbs and `ال`, `لي`, `ليا` added.
- **Test:** `tests/unit/vodafone-kb.test.ts`, "the wrapper around a whole page is not a section" (fails with the old rule) and "buy the 400 mega offer".
- **Decision:** ADR-0034.

## B-12 A typed answer to "A or B?" switched language and echoed the alt text

- **Seen:** typing "400 mega" after the question moved to `/en/promotions` and said "400 mega.".
- **Cause:** the answer was routed as a new request (Latin script, so English), and the picture's only description was its alt text.
- **Fix:** clarify turns record their options; an answer naming one option is that choice, in the question's language. Alt-only pictures spotlight and read their card.
- **Test:** `tests/unit/vodafone-kb.test.ts`, "a typed answer to "A or B?" picks the option".
- **Decision:** ADR-0034.

## B-13 "A or B?" between two half-matches

- **Seen:** "عايز افتح بيزنس" asked "دليل الإستخدام ولا خدمات الاتصال الدولي؟".
- **Cause:** the clarify rule compared scores only; each option matched a different half of the request.
- **Fix:** the second option must cover at least half the request too.
- **Test:** `tests/unit/vodafone-kb.test.ts`, "two half-matches on different words are not offered".
- **Decision:** ADR-0034.

## B-14 X-ray showed "requests 0" after a reload (first CI run)

- **Seen:** `tests/e2e/guide.e2e.test.ts`, "X-ray shows every layer", failed on the first GitHub Actions run with only the loop-guard row in the X-ray.
- **Cause:** the X-ray stream registered its live listener before reading the backlog. A live event arriving during that read was written first, and its higher `seq` made the stream drop every backlog event.
- **Fix:** live events wait until the backlog is written, then follow in `seq` order (`services/gateway/server.ts`, `/v1/events`).
- **Test:** `tests/integration/gateway.test.ts`, "a live event that arrives while the X-ray backlog loads does not drop the backlog" (fails without the fix).

## B-15 "اخر عروض الشركات" said "not exactly" and only opened the page

- **Seen:** the guide said "مش لاقيها بالظبط. أقرب حاجة صفحة عروض حصريه." and opened the page that has the Vodafone Business Red deal, without showing it.
- **Cause:** the site writes its business offers in English ("Vodafone Business Red"), and nothing linked "شركات" to "business". An earlier attempt at that synonym sent requests to the home page, because links to retired pages ("Business Data Wallet", "Data bundles", "Email & Domain") redirect to the home page and the builder gave their link texts to it.
- **Fix:** link texts that reach the home page through a redirect no longer label it (builder, and the committed knowledge base); synonym group شركات / بيزنس / business; "A or B?" needs the second option to cover more than half of the request.
- **Test:** `tests/unit/vodafone-kb.test.ts`, "links to retired pages … do not label the home page" (fails without the fix) and "company offers finds the Vodafone Business Red deal".

## B-16 Pressing the microphone and speaking: nothing happens

- **Seen:** on the live site, speaking after pressing the microphone gave no words and no message; the console then showed `[voice-guide] speech: phrases-not-supported`.
- **Cause:** the guide sends the page's contextual phrases (`rec.phrases`) with every request. Chrome accepts phrase hints only for on-device recognition; with the server engine it fails the whole request with `phrases-not-supported`. The test stand-in had no `phrases` property, so the guide never set them in tests.
- **Fix:** phrases are set only when on-device recognition is in use. The stand-in now has `phrases` and rejects them off-device like Chrome; without the fix 13 voice tests fail.
- **Also hardened (found while looking):** the guide hands its own microphone track to recognition (`start(track)`, ADR-0027). A browser can accept the track and then hear nothing, ending with no result and no error, which the guide treated as a quiet stop. Separately, the on-device check (`SpeechRecognition.available`) was awaited with no time limit before `start()`.
- **Hardening:** an empty end the guide did not ask for, or `no-speech`, now shows "مسمعتكش كويس، جرّب تاني" and logs `[voice-guide] speech: no-speech`; after an empty end with the shared track, the next press lets recognition open the microphone itself. The on-device check gives up after 800 ms. `guide.js` is exactly at its 20 KB budget after this change.
- **Test:** `tests/e2e/live-replay.e2e.test.ts`, "phrase hints go only to on-device recognition" and "recognition that takes the shared track and hears nothing" (each fails without its fix).

## B-17 A chip about a card in the closed tab spotlit nothing

- **Seen:** Exploration Trail walkthrough (2026-11-03): with the Home internet tab open, the chip "What does Mega 25 include?" read the card's text but the spotlight sat in the top-left corner.
- **Cause:** the crawler saw the Mobile internet tab open by default, so its cards had no reveal step. Once the person opened another tab, nothing reopened theirs.
- **Fix:** on the same page, a list in a tab panel (`#id` target, page with tab reveals) gets a reveal of `[aria-controls="<id>"]` with the card as `until`; the executor skips it when the card is already visible (`services/router/planner.ts`). After a page load the default tab is open, so no step is added there.
- **Test:** `tests/unit/router.test.ts`, "a card in a tab panel the crawler saw open is revealed again …" (fails without the fix); `tests/e2e/trail.e2e.test.ts`, the journey (chip asked with the Home tab open). Two flow assertions now expect the leading reveal.
- **Decision:** SPEC-06 §1, ADR-0038.

## B-18 The first page of a journey had no preview when the person left it quickly

- **Seen:** `tests/e2e/trail.e2e.test.ts`, touch scenario, only when run after other tests: "nothing to replay" for the first step.
- **Cause:** rrweb's first full snapshot went into a compressed chunk whose write was still running when a link navigated; the browser dropped it, and only later events were stored.
- **Fix:** activating a link, hiding or leaving the page writes every unfinished chunk at once as JSON and keeps a copy in sessionStorage; the next page in the tab finishes any write the unload cut off (`packages/sdk/src/trail/controller.ts`). The recorder's Meta and first snapshot now share a chunk.
- **Test:** the touch scenario asserts the short first visit is saved and previews.

## B-19 Pages missing from the replay showed a dead end, and live Vodafone pages wipe the trail's consent

- **Found:** 2026-11-03, by Bahaà in the demo: following a link to Shokran Services showed "Not in this replay".
- **Cause:** the demo browser served only saved pages. Opening missing pages live then showed a second problem: Vodafone's theme `scripts.js` calls `localStorage.clear()` on load, which forgot the person's consent.
- **Fix:** a page the replay does not have opens from the internet with everything it loads, and the trail records it like the saved pages (by request; a page can still opt out with `<meta name="vg-trail" content="off">`, which shows "This page is not saved" under the pill). On those live pages the demo browser keeps the guide's own `vg-` keys through `clear()`. Offline, the old explanation page remains.
- **Follow-up:** T-806: on the real site, consent must survive the site's own storage clean-up (a cookie or IndexedDB copy).
- **Test:** `tests/unit/trail.test.ts` (opt-out eligibility); checked by hand against the live Shokran Services page.

## B-20 Pictures were blank in memories of Vodafone pages

- **Found:** 2026-11-03, by Bahaà: replays of Shokran Services showed empty boxes.
- **Cause:** the replay copies only same-origin files with a static extension and no query (ADR-0037 §5). Vodafone's CMS serves pictures at `/documents/<ids>?t=…`, so every one became a transparent pixel. In the demo browser, files not in the replay were also refused instead of fetched.
- **Fix:** `trail.replayAssetPaths` (Vodafone: `/documents/`) allows a site's asset folders; such a copy is still credential-free, GET, no redirects, and kept only if it is an image, font or stylesheet. The demo browser now fetches site files the replay does not have from the internet. Pictures the person never scrolled to stay empty, because the page never loaded them.
- **Test:** `tests/unit/trail.test.ts` (asset folders, and `/api/logout?x=1` still refused); checked on the live Shokran Services page.


## B-21 The trail browser tests sometimes never exit

- **Found:** 2026-11-03, while merging the demos: `tests/e2e/trail.e2e.test.ts` passed all 8 tests and then hung in about half the runs, which would hit CI's 10-minute timeout.
- **Cause:** the X-ray stream (`/v1/events`) listened for the client leaving only after reading the backlog. A page that closed during that read left a 20-second ping interval running for good, holding the process open (and, on a long-running gateway, leaking one interval per such client).
- **Fix:** the close listener is set before the backlog read, and a stream that already ended starts no ping (`services/gateway/server.ts`).
- **Test:** `tests/integration/gateway.test.ts`, "an X-ray client that leaves while the backlog loads leaves no ping running" (fails without the fix).

## B-22 An unchanged site sometimes published a new knowledge-base version (the ingest flake)

- **Found:** 2026-11-05, in the baseline at c2b1a12: `tests/integration/ingest.test.ts`, "an unchanged clone publishes nothing and the vision cache is reused", failed in a full `npm test` run on a Linux container and passed alone. It did not recur on the owner's Mac's Linux VM in 5 full runs (one with 8 CPU-bound processes alongside) or 5 runs of the file alone.
- **Cause:** the crawler takes each picture's element screenshot with a 5-second timeout and, if it fails, only logs it. On a loaded machine one screenshot can time out. That picture then has no screenshot, so no description, so the manifest differs and its hash changes: the second crawl of an unchanged site is "changed" (`report.unchanged` false) and publishes a new version without that picture's description. The vision cache is keyed by the screenshot's SHA-256, so the next good crawl also makes a new vision call. Shown by fault injection: making only the first screenshot of the run fail reproduces the reported failure at the same assertion (`ingest.test.ts`, `report.unchanged`). In production the same thing would show up as a spurious new version and a picture that lost its description, counted as churn by the sync gate.
- **Fix:** a failed element screenshot is retried once with a 15-second timeout before it is logged and skipped (`jobs/crawler/crawl.ts`).
- **Test:** `tests/integration/ingest.test.ts`, "a screenshot that times out once is retried, so an unchanged clone still publishes nothing" (fails without the fix, at `report.unchanged`). Then three full `npm test` runs in a row: 148/148 each (2026-11-05, Node 22.23.4, Postgres 16.15, Ubuntu 22.04 arm64 VM).
- **Not proven:** that this is the only cause of the original container failure; its log was not kept.
