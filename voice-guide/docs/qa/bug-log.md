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

## B-23 In the reimagined view the journey pill covered "Change experience" and "Reset"

- **Found:** 2026-11-05, by the demo walkthrough (`tools/demo-walkthrough.ts`) on the Services clone with the guide: after choosing a ready-made experience the view bar's "Change experience" (1103–1242 × 112–152 at 1366×900) and "Reset" were under the guide's fixed "Your journey" pill; a click on them landed on the guide. Same in Arabic (both mirror to the left) and on phones ("Reset" at 303 × 92).
- **Cause:** the view bar is sticky right under the header, which is exactly where the pill floats (top right; top left in Arabic). The launcher was moved below the pill, but the view bar that replaces it was not. In Arabic the launcher also stayed top right while the pill moved left.
- **Fix:** with the trail on the page (`data-vg-trail`), the view bar keeps its inline end free for the pill (290px; 76px under 768px) (`vodafone-services-clone/src/aixc/aixc.css`); in Arabic the launcher sits top left, under the pill (`src/rtl.css`).
- **Test:** `tests/e2e/reimagine-floating.e2e.test.ts`, "Reimagine: the view bar and its launcher stay clear of the journey pill, in English and Arabic" (fails without the fix: "Change experience", "Reset").

## B-24 With nothing pocketed, the accessibility button covered the tunnel's "Next service"

- **Found:** 2026-11-07, by the test written for O20 (before any change): in the reimagined tunnel with an empty Pocket, Vodafone's accessibility button (1291–1346 × 825–880 at 1366×860) sat on the tunnel's "Next service"; a click there landed on the accessibility button.
- **Cause:** the right-hand column only rose while the Pocket corner peeked; with nothing pocketed it sat at its usual place, which is where several experiences put their next, previous and pause buttons.
- **Fix:** in the reimagined view the column stays lifted whether or not anything is pocketed, and the corner tucks in (ADR-0044, `vodafone-services-clone/src/pocket/pocket.css`).
- **Test:** `tests/e2e/reimagine-floating.e2e.test.ts`, "Reimagine: the Pocket corner tucks in and nothing covers the experience controls, empty or not, desktop and phone" (failed before: "Next service under accessibility").

## B-25 An unchanged site still published a new knowledge-base version now and then (the ingest flake, second cause)

- **Found:** 2026-11-07, on CI after B-22's fix: both ingest "unchanged" tests failed in some runs (4e6d0b2, 43498ae). The test now says what changed (22a556f, 330614f), and CI showed it: `.destinations.0.labels.ar` held the same three anchor texts in another order.
- **Cause:** the builder collected the anchor texts that label a page in the order the pages finished crawling, which varies from run to run; the order of a page's labels is part of the manifest hash, so an unchanged site hashed differently and published a new version. B-22 (a timed-out screenshot) was a real cause too, but not the only one.
- **Fix:** anchor texts are collected from the pages in URL order (`jobs/kb-builder/build.ts`). Labels already on the page (title, h1) still come first.
- **Test:** `tests/unit/vodafone-kb.test.ts`, "builder: the same pages crawled in another order build the same manifest hash" (failed before: `0b3871806a3c29ba` against `0647a5a01212e611`). Full unit and integration run after the fix: 154/154 (2026-11-07, Ubuntu 22.04 arm64 VM, Node 22.23.4, Postgres 16).

## B-26 The RED world's hidden "See everything" invitation animated forever from page load, and the Reimagine browser checks crashed on it

- **Found:** 2026-11-10, baseline for the live plan on `integration/main` (3b6a823), on the owner's Mac (macOS, Python Playwright 1.58, Chromium): `vodafone-services-clone/tests/e2e/aixc_e2e.py` stopped after 175 checks with `InvalidStateError: Cannot finish Animation with an infinite target effect end`. It had passed 292/292 before the RED world landed (695df1d), whose commit records no run of it.
- **Cause:** the icon of `.pz-explore` (the floating "See everything for you" button) carried `animation: pz-nudge-down … infinite` whether or not the button was shown, so a looping animation ran off-screen from page load on every visit. The streaming check skips its intro with `document.getAnimations().forEach(a => a.finish())`, and `finish()` throws on an endless animation.
- **Fix:** the nudge runs only on `.pz-explore.is-shown` (`vodafone-services-clone/src/personalization/extension.css`); reduced motion still turns it off. The streaming check now finishes only animations that can finish, so a later slip is reported by the check below instead of crashing the suite.
- **Test:** `aixc_e2e.py`, "no animation runs forever on the untouched page" (failed before: `['pz-nudge-down']`, 292/293). After the fix: `aixc_e2e` 293/293, `arabic_e2e` 71/71, `pocket_e2e` 119/119, `tips_e2e` 87/87, clone `npm test` 116/116; shown, the invitation still nudges (one `pz-nudge-down` animation), and none under reduced motion (2026-11-10, macOS, Python 3.9.6, Playwright 1.58.0).

## B-27 Leaving the Pocket through the portal, the accessibility button dropped 230 px at the click

- **Found:** 2026-11-10, merging `feature/pocket-portal` after `feature/pocket-actors-live` (live plan, phase 0): `portal_e2e.py` "first frame: the overlay looks exactly like the Pocket page" failed with 0.48% of pixels changed (limit 0.2%). On the portal branch alone it passed. The changed pixels were the accessibility button at both places, plus small cursor-light and mascot differences.
- **Cause:** the actors keep the right-hand column lifted while the Pocket is open (`body[data-pocket-view='open']`, `pocket.css`), and the portal pinned the button to its usual place (`bottom: 20px !important`) and the guide's lift to 0 the moment it started (`portal.css`). Each branch was right on its own; together the button jumped at the click.
- **Fix:** the portal starts the button and the guide where the page has them and brings them down to their usual place as the destination comes, from its own frame clock (`holdLive` in `vodafone-services-clone/src/pocket/portal/controller.js`), inline on those two elements, given back at the end. The CSS place stays as the fallback.
- **Test:** the existing first-frame check (failed before: 0.0048; after: 0.0008) and "last frame matches the destination after the real navigation" (passes: the button has arrived by then). After: `portal_e2e` 56/56, `pocket_e2e` 210/210, clone `npm test` 163/163 (2026-11-10, macOS, Playwright 1.58, Pillow 11.3).

## B-28 Back from Original, a scroll-driven experience came back on an earlier card

- **Found:** 2026-11-10, merging `feature/aixc-template-credits` (live plan, phase 0): `aixc_e2e.py` "spotlight: does not rotate while hidden" failed (card 16 instead of 18). It fails the same way on that branch alone; its commit records no browser run.
- **Cause:** not the timer. The spotlight became scroll-driven on that branch (one card per 200 px of page scroll, like split and coverflow). Original is shorter than the reimagined view (its furthest scroll 3,265 px against 3,601), so showing it clamped the scroll, and coming back to Reimagined left the page at 3,265, which the stage reads as an earlier card. Anyone who looked at Original lost their place.
- **Fix:** the composer remembers where the page was when each view was left and puts it back when that view shows again (`showView`, `vodafone-services-clone/src/aixc/controller.js`); a new experience starts at its own top. The live plan asks the same of "Original" on Vodafone's pages.
- **Test:** `aixc_e2e.py`, new "spotlight: back on Reimagined, the page is where it was left" (failed before: 3,601 then 3,265) and the existing card check (failed before: 18 then 16). After: `aixc_e2e` 298/298, `arabic_e2e` 71/71, `pocket_e2e` 210/210, `portal_e2e` 56/56, `tips_e2e` 87/87, clone `npm test` 163/163, voice-guide pocket-journey, reimagine-floating and tips e2e 10/10 (2026-11-10, macOS).

## B-29 Card links on Arabic pages pointed at the English site or nowhere

- **Found:** 2026-11-12, independent review of the live plan's phases 1 to 2 (Plane AIXC-29).
- **Cause:** the live adapter resolved a card's link against the site root (`new URL(href, origin + '/')`). Vodafone writes links relative to the page (`href="vodafone-cash"` on `/ar/services` means `/ar/vodafone-cash`), so 5 of 8 home cards, 4 Services cards, 2 bundles cards and all 8 Vodafone Cash cards lost their `/en/` or `/ar/`. Ids were not affected (the language is stripped from them), which is why every check stayed green.
- **Fix:** links and pictures resolve against the page's own address, or its `<base href>` when it has one (`absolute`, `baseOf` in `experiences/src/host/live-adapter.js`). A link into the same page keeps the id its fragment gave it.
- **Test:** `tests/integration/live-adapter.test.ts`, "links are the ones the browser would follow" (every card link on four saved pages is one the browser resolves; `vodafone-cash` stays in the page's language; a `<base>` and a `#fragment` link). Ids and pictures compared before and after on all 13 saved pages: unchanged.
- **Review of the fix (2026-11-12):** on a page opened with a query, a `#fragment` link lost the query. The page's query is now part of what links resolve against (test added).

## B-30 The coverage gate stayed at 1 when a card class was renamed

- **Found:** 2026-11-12, the same review (AIXC-30).
- **Cause:** coverage was "usable cards over cards a recogniser row matched". A class Vodafone renames stops matching, so its cards left both sides and the ratio did not move; ADR-0049 and the runbook promised the opposite. The count also hid content no row read at all: the home page's three banner slides and the RED page's three picture rows.
- **Fix:** card-like blocks no row read count against coverage (`unreadCards`; `coverage.unread`, and `unread` per section). The first rule (three or more siblings of one shape) was too narrow: the review of the fix showed a renamed `ticket`, `tiles` or `card-horizontal` still left coverage at 1 (cards that are themselves the link, cards without a picture or button, cards one to a column). The rule now starts from everything a person can press that no read card holds, grows each to the largest block holding only it, and counts the block when it has words and a picture, a heading or a button. A card a row leaves out on purpose (the sign-in ticket) is not unread. Two recogniser rows added for what the count found (`banner-slide`, `feature-row`), so the home page reads 10 items and RED 8, with no existing id changed.
- **Test:** "coverage falls when Vodafone renames a card class": every card kind renamed on every saved page it is on (19 cases), each falls under 0.9 with usable plus unread equal to cards; nothing unread on any saved page except the home-wireless page, whose router offer and price table no row reads (coverage 0 there, as before).

## B-31 The layer read the page once; a carousel's copies could carry its marks

- **Found:** 2026-11-12, the same review, by two reviewers (AIXC-28). The live plan's phase 2 step 1 asked for a re-read when the page changes; it was not built and no document said so.
- **Cause:** `createLiveAdapter` read and tagged once. Owl Carousel rebuilds its copies from the cards' own markup (on a resize), so a copy made after tagging carries `data-aixc-item`; `untag()` only knew the elements it had tagged, so those marks would have stayed on Vodafone's page.
- **Fix:** `refresh()` reads again with the same ids; `tag()` now also takes the layer's marks off everything it does not mean to mark; `untag()` sweeps the whole page; `watch()` re-reads 250 ms after Vodafone's content under `#main-content` changes (not for the layer's own nodes), through the guard. The layer keeps `window.__aixc.model` current and sends `aixc:model` on the document when the model changed (ADR-0049 §7).
- **Review of the fix (2026-11-12):** a change made only of words (a title or price replaced, a text node edited) was taken for the layer's own and never re-read. A change is now the layer's only when it happens inside something the layer added, or is only the layer's own elements coming or going; text edits are watched too; a re-read comes at the latest 2 s after the first change not yet read.
- **Test:** `live-adapter.test.ts`, "the page changes after load" (copies made from marked cards lose the marks, a new card is read and marked, ids stay, a title replaced and a text node edited are read, the layer's own nodes and their words cause no re-read, untag leaves the page as it was); `tests/e2e/aixc-layer.e2e.test.ts`, the same in the real layer, and nothing watched or marked once the guard stops. Not exercised against the live site's own Owl script (O29).

## B-32 A phone number written in groups was not masked

- **Found:** 2026-11-12, the same review; the Opus tie-break upheld it (AIXC-31). AGENTS.md §4.4.
- **Cause:** the masking rules (`packages/sdk/src/agent-mask.ts`) needed unbroken digits for a mobile number, so "010 1234 5678", "0101-234-5678", "+20 10 1234 5678" and the Arabic-Indic forms passed. They are the only gate before reply text goes to VoiceTut, and the same rules mask page content for the agent's model. The speech service did not check again.
- **Fix:** a rule for a mobile written in groups (spaces, dashes, dots, brackets, `+20` or `0020`), placed before the card rule and refusing a longer run of digits. The speech-out service checks every line itself (`isPrivate` in `services/speech-out/handlers.ts`): `speak` answers `private` and sends nothing, `prepare` leaves such a line out.
- **Review of the fix (2026-11-12, Opus):** the first rule refused a number with more digits after it, so "010 1234 5678 5 GB" passed every rule; it also missed "+20 (0)10 …", numbers split by tabs, line breaks, a slash or invisible direction marks, and Extended Arabic-Indic and full-width digits; and the service checked the line as asked for, not as it would be sent (a number broken over lines becomes one number once tidied). Now: the rule sits after the card rule and keeps whatever follows the number; separators are any white space, dashes, dots and slashes; invisible marks are removed and three digit systems are read as ASCII before matching; the service checks the line and its tidied form, and `prepare` each sentence.
- **Test:** `tests/unit/safety.test.ts`, "a mobile number written in groups" (twenty forms masked; a short number after it; years, prices, sizes, short codes and USSD codes left alone; 200 KB of digits and separators in well under 1.5 s); `tests/unit/speech-out.test.ts`, "a line with personal data never reaches VoiceTut, whoever asks" (also a number over lines or tabs). Both failed before each fix.
- **Not covered:** landlines, numbers of other countries, a number spoken in words, an account number of fewer than 13 digits written in groups.

## B-33 A held sync's reports could not tell a renamed destination from a lost one

- **Found:** 2026-11-12, the same review, crawler and knowledge-base reviewer (AIXC-45).
- **Cause:** the ingest report printed two unpaired lists (Added, Removed) and the sync gate one count. The first sync after ADR-0049 §6 renames about 126 destinations; a section really lost in the same crawl would have looked the same, and the runbook told the operator to activate if "the counts are near these".
- **Fix:** `jobs/kb-diff.ts` pairs a removed id with an added one on the same page and of the same kind by a label of its own, and the cards of a renamed list by their names. What has nothing to tell it by (no label, or twins with the very same labels) is paired by its place in the portlet only when as many went as came, and reported apart as "Paired by position only: check each on the site". The ingest report lists "Renamed", "Paired by position only", "Removed with no counterpart" and "Added with no counterpart"; the sync's churn row says `N removed (R renamed, P by position, L lost)`. Two different labels are never paired.
- **Review of the fix (2026-11-12, Opus):** three wrong pairings in the first version, each hiding a real loss: the cards of a renamed list were paired by their number without comparing names (a card that left the list showed as a rename of the one that moved into its place); every picture carries the words "banner", "image", "picture", so a lost picture paired with any new one on the page; and pairing by place was reported as a plain rename. Fixed as above; generic picture words are not labels for this purpose.
- **Test:** `tests/unit/kb-diff.test.ts` (renames by label and by card name, position pairs marked, a real loss and a real addition left unpaired, a card that left a renamed list, pictures told by their own words, no guess when it cannot tell); `tests/integration/sync.test.ts` (the held sync's two reports carry the counts). On the saved pages, old crawler and builder against new: 26 removed, 23 renamed, 3 by position, none lost; with RED PRIME+ taken out of the new version, that card is the one reported lost. The whole knowledge base (524 destinations, every id changed) diffs in 35 ms.


## B-34 Closing a test's browser could send the guide's long-poll on to Vodafone's site

- **Found:** 2026-11-13, review of phase 3 steps S0 to S4 (AIXC-53, high).
- **Cause:** from the second saved page the guide's session resumes and keeps `GET <origin>/__vg/v1/events/poll?…&wait=20` open while the demo browser forwards it to the gateway. Closing called only `context.close()`; Playwright leaves a route still pending at close to Chromium, which sent the request on to the real host with its cookies, the session id and the site key. Neither the kit's `reached` nor its `refused` list saw it (no response came back). It happened in every suite that opens two saved pages offline.
- **Fix:** `tools/demo-browser.ts` ends every request still waiting on the gateway before closing (its Node fetch aborted, the route aborted), and in offline mode the browser resolves no host name but localhost (`--host-resolver-rules`) and uses no proxy (`--no-proxy-server`), so a request that escapes the routes fails before it leaves the machine.
- **Review of the fix (2026-11-13, Opus):** with a proxy set on the machine or in the environment, an escaping request went to the proxy as `CONNECT web.vodafone.com.eg:443` and the proxy resolved it: the resolver rule alone did not hold (AIXC-65). Fixed with `--no-proxy-server`; the kit's test checks both arguments.
- **Test:** `tests/e2e/live-kit.e2e.test.ts`, "nothing leaves as the browser closes": Chromium's own network log (`netLog`) shows no request started to another host, even while closing. It failed before the fix (the poll URL to `web.vodafone.com.eg`), run with the resolver rule already in place so nothing could leave.

## B-35 A sticker whose card was gone took another card

- **Found:** 2026-11-13, the same review (AIXC-54).
- **Cause:** one unique key reached the re-match's 4 points. Vodafone's own slips give two cards one link or one title: on `/ar/services` the Mini Call card also links `/spa/roaming`, so with Roaming gone its sticker took Mini Call; on `/en/services` two cards are titled "Balance transfer"; an English "DSL" sticker took the Arabic ticket "اتحكم في حسابك", which links the same shop page.
- **Fix:** `experiences/src/pocket/record.js`: a link, a picture or a title (in the sticker's language) that both sides have and do not share counts against; a match needs two agreeing signs of different kinds (the same id counts as one). ADR-0051 §4 amended.
- **Test:** `live-adapter.test.ts`, "a sticker whose card is gone finds no card at all": each card of five saved page pairs removed in turn, same language and across (306 pages), no sticker takes another card (20 did before); `pocket-record.test.mjs`, the three slips on synthetic cards. The cross-language test now runs Arabic to English too, with each card's real twin (the test had taken the place in a section as the truth, wrong on the bundles page).
- **Review of the fix (2026-11-13, Opus; AIXC-63, AIXC-66):** a sticker on its own whose card left with a sibling still took another card (RED Exclusive took RED Elite once Prime went too, their shared picture then belonging to Elite alone; a YouTube "Flex 25-55" took PUBG's): the test gave every card its own sticker, so each remaining card's sticker claimed it first, and removed one card only. A record now marks the keys other cards on its page shared when it was kept (`shared`), and those never count as its own later. The test takes each sticker alone, its card gone with no other or with any one other card: 6,194 cases, none takes another card (108 did with the first fix). The Arabic-to-English counts are now asserted too.

## B-36 Two stickers tied for one card: the one kept first took it

- **Found:** 2026-11-13, the same review (AIXC-55).
- **Cause:** the tie check compared cards for one sticker, never stickers for one card. The Arabic bundles page has two tickets linking the shop's DSL page, the English one "DSL"; both Arabic stickers scored 5 on it, and the order they were kept in decided.
- **Fix:** two stickers that fit one card equally both go without it.
- **Test:** `live-adapter.test.ts`, "two stickers that fit one card equally: neither takes it" (the bundles stickers in both orders give the same matches; failed before); `pocket-record.test.mjs`, the better fit takes it, equal fits neither, in either order.

## B-37 Another tab's change could undo this tab's own newer one

- **Found:** 2026-11-13, the same review, reproduced with two tabs (AIXC-56).
- **Cause:** on another tab's message the store replaced its memory with a read that had started before this tab's own write (IndexedDB runs transactions in the order they are made), and the tab never read again (a channel does not hear its own messages).
- **Fix:** `experiences/src/pocket/store.js` keeps this tab's changes not yet committed and lays them over every read; only the latest read counts.
- **Test:** `pocket-store.test.ts`, "another tab's change never undoes this tab's own newer one" (a write made the moment the store starts reading for the other tab's message; memory, subscribers and disk all hold both; failed before).
- **Review of the fix (2026-11-13, Opus; AIXC-64):** the first version kept only the latest read, so another tab's message during the store's very first read made `ready` resolve with nothing in it. Now a read is applied unless a newer one has already landed. Test: "another tab's change during the store's first read never leaves it empty" (failed before).

## B-38 A sticker kept before the store had opened was lost

- **Found:** 2026-11-13, the same review (AIXC-57).
- **Cause:** a write before `ready` returned early (no database yet) but resolved as if it worked, and the first read then cleared memory.
- **Fix:** a change waits for the store to open, and the first read lays it over what it reads.
- **Test:** `pocket-store.test.ts`, "a sticker kept before the store has opened is stored" (memory and a fresh store; failed before).
- **Review of the fix (2026-11-13; AIXC-67):** a sticker kept just before the store closed (the layer's guard stopping it) was dropped without a word: the write waited one beat for `ready`, and the store had closed by then. A write now starts at once when the store is open, and nothing is posted on a closed channel. Test: "a sticker kept just before the Pocket closes is stored, and no error is reported for it" (failed before).

## B-39 A write the browser refused at commit was never reported

- **Found:** 2026-11-13, the same review, with a quota set through the browser's debugger (AIXC-58).
- **Cause:** a write counted as done on its request's success, which comes before the transaction commits; an abort at commit (storage full) went unreported and the sticker stayed in memory only.
- **Fix:** a write is done when its transaction commits; one that aborts is reported and the store is read again, so it shows only what was kept.
- **Test:** `pocket-store.test.ts`, "a write the browser refuses at commit (storage full) is reported and not shown as kept" (failed before).

## B-40 The adapter read the layer's own nodes inside a card

- **Found:** 2026-11-13, the same review (AIXC-59); latent until "Pocket it" is drawn on live pages (phase 3 S6).
- **Cause:** `[data-aixc]` was skipped when choosing cards, but not by the lookups inside one (`first()`, the plan cards' descriptions, a band's picture and button). With the Pocket's liner in a card, three RED cards read "In your pocket" as their description; a layer link with a picture ahead of a card's own changed its link, picture and id.
- **Fix:** every lookup inside a card skips the layer's nodes and Vodafone's dialogs, and a card's words leave out the layer's nodes inside it (`experiences/src/host/live-adapter.js`).
- **Test:** `live-adapter.test.ts`, "the layer's own nodes inside Vodafone's cards are never read": the whole model, word for word, is the same with the Pocket's liner, a chip and a layer link with a picture in every card, on every saved page (ids changed on `/ar/home` before).

## B-41 Two tests could pass while what they guard went wrong

- **Found:** 2026-11-13, the same review (AIXC-60, AIXC-61).
- **Cause:** the AIXC-41 test told a sticker's card by its title, and `/en/services` has two cards titled "Balance transfer", so swapping them passed. The live kit's Arabic cookie banner was the English height (321 px; Vodafone's Arabic face sets it on 360), 39 px low, so a check that the accessibility button never meets the banner could pass while the live one would cover it.
- **Fix:** the AIXC-41 test tells a card by its link, picture and title together (and checks that these are unique on the page); the Arabic banner stand-in is 375×360 at 975,524 and its test checks the box's top.

## B-42 The fallback agent could press a commit control, and the cookie banner, on any page

- **Found:** 2026-11-13, by the e-shop map and the merged plan (`docs/reference/eshop-plan-2026-11-13.md` §0). AGENTS.md 4.1.
- **Cause:** the agent hid only the knowledge base's commit selectors (the first 4 matches of each), and the knowledge base marks none outside forms, so nothing was hidden on the shop or from OneTrust's banner; its click tool pressed without a check, and page-agent clicks the centre of an element, where a product card's cart button can sit; its prompt said purchase buttons were hidden from it.
- **Fix:** ADR-0058 step E1: a built-in commit floor in code (markup and words, both languages), checked on every click, select and input target and at the click point; commit controls out of the model's view; synthetic clicks on them stopped while the agent runs; nothing pressed on commit pages; at a commit control the guide shows the person where to press and the task ends; a commit request is a confirm step, never an agent task.
- **Test:** `tests/e2e/guide.e2e.test.ts`, the three ADR-0058 tests (each failed before: the old agent pressed through or never guided); `tests/unit/commit.test.ts`, `commit-context.test.ts`, `router.test.ts`.

## B-43 Traces, logs and saved sessions held personal data and page values

- **Found:** 2026-11-13, by the e-shop map and the merged plan (`docs/reference/eshop-plan-2026-11-13.md` §1, step E3). AGENTS.md 4.3 and 4.4.
- **Cause:** nothing cleaned what was written. `turn.received` kept the person's words as said (a phone number or a national ID included) and the page's full URL with its query; the session row kept the same words in its turn and in the planned agent task; a spotlight that read a value sent it back as the step's detail (a balance, a price); the agent sent the text of what it clicked and its own goal unmasked, and its saved steps (kept in the session for the next page) held page words with prices; `/v1/progress` passed the browser's event attributes through as they came. The agent's secret-field words missed `nationalId` and `national_id`, and the trail's private pages and fields missed the shop's wishlist, orders, numbers, review, subscription details, documents, phone and upload fields.
- **Fix:** one cleaner, `services/shared/clean.ts`, for every trace attribute (in `Tracer.event`, whoever wrote the event) and every log field: personal data masked with the browser's rules (ADR-0018), prices, percentages and stock phrases removed (`valueFree` in `packages/text`), every URL cut to its origin and path plus query values that are short and cannot name a person, a length cap. The session keeps the person's words, the planned agent task and the agent's saved task masked, and the agent's saved steps and the chosen item's name cleaned. In the browser: the spotlight reports only that it read, and the agent masks what it clicked and its goal before they leave. The secret-field words and the trail's private paths and fields gained the shop's.
- **Consequence:** the plan sent to the page still carries the person's words, so the agent may type a number they said on that page (ADR-0018 §3); the copy kept for the next page is masked, so after a page load it asks the person for the number instead. A page watch's change notice, which reaches the page as a trace event, now arrives without a price in its text.
- **Test:** `tests/integration/gateway.test.ts`, "traces and the saved session hold no page value, no personal data and no private query value" (a turn with "01012345678", a spotlight that read "46.50 EGP", an agent goal with stock and a national ID, saved agent steps; failed before at the first check); `tests/unit/values.test.ts`, `clean.test.ts`, `trail.test.ts`, `safety.test.ts`.

## B-44 The commit guard missed the shop's real commit controls, and could point at the wrong one

- **Found:** 2026-11-13, by the review of E1 (commit 8369e98; Plane AIXC-70 to AIXC-80), from the shop's cached code and translations in the demo browser's profile and with a scripted model on stand-in pages; two refuting checks per finding. AGENTS.md 4.1.
- **Cause:** the word floor held only a few phrases: "Choose this line", "Add 2 products to cart", "Add All To Cart", "Move to cart", "اشتريه تاني", the DSL device card's "Rent"/"Cash", and most of SPEC-03's own words (Confirm, Submit order, تأكيد, شراء) were not commit words, and none of those controls' markup was in the floor, so the agent could press them; on the numbers page only the dropdown tool was checked. The centre of an element below the fold was read before page-agent scrolled to it, and only clicks were stopped, so a cart button acting on pointer or mouse events was pressed. The confirm step and `show_person_where` took the first control found (another product's cart button, or the cookie banner). On a link any phrase counted, so offer tiles and product cards with "at Checkout" were refused; a question about paying or booking became a "press it yourself" step.
- **Fix:** ADR-0058's review fixes: the floor's words and markup for the shop's controls in both languages, the numbers-page rule in the agent and the planner, the scroll before the check, pointer and mouse presses stopped and a stopped press guided, the confirm step asking which one (or saying the button is not there), `show_person_where` bound to the item's own card and never the widget or the banner unasked, start-only phrases on links, questions never commit requests; Escape and the guide's own controls end the guided step; words read with separators, more control kinds, shadow roots, and the `reveal` step guarded.
- **Test:** `tests/unit/commit.test.ts` (five tests: the shop's labels, SPEC-03's lexicon, links, questions, money and numbers), `tests/unit/router.test.ts` (three: the confirm step's lines and item scope, questions reach the agent, the numbers page), `tests/e2e/guide.e2e.test.ts` (a card below the fold, two products with the cookie banner and Escape, the numbers page, a commit page: press, type and select; the exact tool set). All failed before except the commit-page test, which pins what E1 already did but had no test for (AIXC-78).

## B-45 The guide could say and show prices the knowledge base had stored

- **Found:** 2026-11-13, by the e-shop map (`docs/reference/eshop-map-2026-11-13.md`: 294 strings in the committed manifest match the crawler's own money pattern) and the merged plan's step E2. ADR-0059; AGENTS.md 4.3 as approved that day.
- **Cause:** labels keep the prices they carry ("5 جيجا 46 جنيه"), and plans are built from labels: clarify options, page summaries, a collection's caption, the item name kept for follow-ups, watch labels, the agent's hints, page-map and trail titles. Nothing stood between the knowledge base and what the guide said or showed, so a stored, possibly stale price could be spoken instead of the live one.
- **Fix:** ADR-0059 step E2: every plan leaves the router through the value gate (`gatePlan`, `valueFree`); two choices that would read the same after it are both shown and read from the page ("the first or the second?", understood spoken too); the agent's hints keep their addresses but lose prices; page-map and trail titles pass the gate and a suggested question naming a price is left out; `guidePoints` keeps the prices for finding places (E6). The percent rule no longer reads URL encoding ("%D8%A7") as a percentage.
- **Test:** `tests/unit/value-gate.test.ts` (every destination of the committed manifest, both languages, every intent, its flows, pairs and agent hints: 1,241 lines with a stored price or stock before, none after); `tests/unit/router.test.ts` (show both, "the first" and "التانية"); `tests/unit/values.test.ts` (guide points, URL encoding). `eval:router` unchanged on all four sets (33/33, 14/18, 54/54, 19/24).

## B-46 The cleaner could block the gateway, mangled identifiers, and left personal data in places

- **Found:** 2026-11-13, by the review of E3 (commit f33e4c7; Plane AIXC-81 to AIXC-93): a leak hunt and a breakage hunt (Opus), tests and docs (Sonnet), two refuting checks per finding; 13 confirmed.
- **Cause:** the cleaner ran its patterns over a string of any length before cutting it, and the email and amount patterns retried at every position: one `/v1/progress` with a 250,000-character detail kept the single-threaded gateway busy for about 100 s. The card rule turned every knowledge version id into "[card]-…" and the gate cut "600egp" out of destination ids, so traces no longer joined the knowledge base. Query keys were kept unless blocked, so order ids and search terms stayed. Landlines, mobiles with the prefix split, and cards grouped by dots were not masked; the shop's DSL check asks for a landline. Texts were cut before they were masked (the agent step's detail, the router's fallback reason), so half a number stayed. The gate missed "ب6.5ج", piasters, "نفدت الكمية", "out-of-stock" and other forms. The saved agent steps kept what was typed; the session kept the request's words; a resumed agent refused a number the person said and refused it again after asking. The person's own prices were stripped from their request in the X-ray. The trail's "payments" word made a public page unrecordable.
- **Fix:** see ADR-0021's and ADR-0018's amendment notes: cut first, anchored patterns, identifiers untouched, a short list of query keys kept, the person's words masked only, wider masking rules, mask before cutting, more price and stock forms (the crawler's own money pattern finds none left in the committed knowledge base after the gate), saved steps without values, no request words in the session, the task kept in the tab for the next page and the person's answers counted as said, `saved-payments`/`my-payments` instead of `payments`.
- **Test:** `tests/unit/clean.test.ts` (a 250,000-character string in under 0.5 s, a number cut at the edge dropped, identifiers, the person's words, query keys, log lines), `tests/unit/safety.test.ts` (landlines, groupings, dotted cards, years kept), `tests/unit/value-gate.test.ts` (every knowledge-base string against the crawler's money pattern), `tests/unit/trail.test.ts`, `tests/integration/gateway.test.ts` (the session keeps no words of the request), `tests/e2e/guide.e2e.test.ts` (the next page's model has the number from the tab, no trace has it; an agent's masked label; a spotlight traced as "read"). Each failed before except the coverage tests for what E3 already did (AIXC-84, AIXC-88).
- **Owner's decision (2026-11-13, AIXC-94):** traces keep only the request's words that the site itself uses (its knowledge base's labels, titles, button texts and synonyms); every other run of words becomes "…", so a name or an address is never traced (`siteWords` in `services/shared/clean.ts`, the vocabulary registered when the knowledge base loads). The agent's task stays in the session, masked, for the next page (at most 60 minutes), so a task can cross to the e-shop. Test: `tests/unit/clean.test.ts` (site words), `tests/integration/gateway.test.ts` (a name in a request is in no trace; failed before), `tests/e2e/live-replay.e2e.test.ts` (the X-ray shows the site's words).

## B-47 The value gate's first version still showed a price-only name, cut "show both" short, and left fragments

- **Found:** 2026-11-13, by the review of E2 and AIXC-94 (commits d6a3b87, 5aedb06; Plane AIXC-96 to AIXC-106): leak and breakage hunts (Opus), tests and docs (Sonnet), two refuting checks per finding; 17 confirmed.
- **Cause:** a clarify choice whose label was only a price ("150 EGP") was not the same as the other after the gate, so the "show both" path was skipped, and the gate then put the raw label back on its button. "Show both" opened only the first card's tab, and each reading was cut off by the next line within a third of a second. A label like "Flex From 25 EGP up to 55 EGP" became "Flex From up to", and a price-only one became nothing, which was then spoken ("Want me to tell you when  changes?") and saved as a watch label. "The first." with a full stop, "first one please" and "التانى" were not understood. Titles the gate emptied left nameless rows in the trail, and tiers sharing a title confused its name rule. Guide points took an instalment for a price and missed most stock wordings; "جنية" was not money.
- **Fix:** ADR-0059's review note: the alike path for any empty name, per-card reveals and readings that are heard out, names by place, joining words removed with the value, `nameOf`/`placeOf` fallbacks, ordinals normalised, titles with fallbacks, the name rule price-free and unambiguous, instalments apart.
- **Test:** `tests/unit/value-gate.test.ts` (every price-only item of the committed manifest asked about beside other destinations; no line left dangling), `tests/unit/router.test.ts` (show both across two lists; a price-only choice; the ordinals), `tests/unit/values.test.ts`, `tests/unit/trail.test.ts`, `tests/unit/knowledge-titles.test.ts` (page-map and trail titles, a question naming a price left out), `tests/e2e/guide.e2e.test.ts` (show both on the bundles page: both cards read, the first heard out, the second in its own tab), `tests/integration/gateway.test.ts` (`sdk.listen` keeps only the site's words). Each failed before except the `sdk.listen` coverage check.
- **Still open:** in a split deployment the gateway loads no knowledge base, so `sdk.listen` traces keep only masks and short numbers (AIXC-106).

## B-48 Pocketing and putting back were announced in English on Arabic pages

- **Found:** 2026-11-13, while planning phase 3 S6 (the plan's D13); on the clone's Arabic page since the Pocket had one.
- **Cause:** the two status lines for pocketing and putting back were English templates (`experiences/src/pocket/pocket.js`), not the page's UI copy, so a screen reader on `/ar/services` heard "ڤودافون كاش is in your pocket. خدمة واحدة.".
- **Fix:** both go through `t()` with Arabic copy ("{title} بقت في جيبك. {count}.", "{title} رجعت للصفحة. في جيبك {count}."), and Put back's name starts with its visible label in Arabic ("رجّعها: …", WCAG 2.5.3).
- **Test:** `tests/e2e/pocket-chips.e2e.test.ts`, the keyboard test on `/ar/services`: the announcements after pocketing and putting back by name are in Arabic. It failed before with the English template.

## B-49 The lift's and the flight's copies of a card kept the adapter's marks

- **Found:** 2026-11-13, while planning phase 3 S6 (the plan's D13).
- **Cause:** `snapshotCard` copied a card with its `data-aixc-item` and `data-aixc-section`, so during a lift or a flight two elements carried the card's id, and anything looking a card up by its mark (the overlay, the adapter's next reading) could find the copy.
- **Fix:** the copy drops every `data-aixc-*` attribute (`stripMarks`, as the page turn's copy already did).
- **Test:** `tests/e2e/pocket-chips.e2e.test.ts`, "hover, pocket, put back and the album change nothing of Vodafone's page": one element per card stays marked through the lift and the peel, sampled every frame. It failed before (two during the lift).

## B-50 The chips' overlay lost track of what clips a card, took a screen-reader user's focus, and left observers behind

- **Found:** 2026-11-14, by the review of S6 (commits 48c8225 and 2b59d99; Plane AIXC-107 to AIXC-118): four reviewers, two refuting skeptics per finding; 13 of 17 findings confirmed (12 work items, two merged).
- **Cause:** a slot read the elements that clip its card once, when it was made, so a stage or scroller that appeared around the same cards later never cut its chip (AIXC-107). A slot was sized to the whole card and cut with `clip-path`, which does not shrink scrollable overflow, so a half-visible card on a phone could push the overlay past the screen (AIXC-111); a card cut off by its carousel had its slot `display: none`, taking the focused button of a screen-reader user out of the page when RED's carousel moved on its own (AIXC-113). The liner of a pocketed card took every touch, so the carousel under it could not be swiped (AIXC-110). A mouse click on a chip counted as keyboard use because Chrome focuses the button it presses, so focus moved to Put back and Space put the card back (AIXC-114). The coverage gate ran only when the model changed, not when only the coverage did (AIXC-112); a start that failed left its observers and listeners attached (AIXC-108); names were not refreshed after a new title (AIXC-109); a chip added later went to the end of the group (AIXC-115); the see-through liner stayed after focus left (AIXC-116). Two tests could not fail: icon-only was checked against the same value that set it, and the 8 tickets were counted on one language (AIXC-117, AIXC-118).
- **Fix:** ADR-0052 sections 10-14 as amended on 2026-11-14: clips read again on structure, class, resize and reading changes; slots as big as what shows, wholly cut ones kept in a 1 px clipped box; focus moved to the card's link before a slot goes; the liner takes no pointer (to confirm with the owner: the card's own link stays pressable under it); a press from the keyboard recognised by `detail` 0 or `:focus-visible`; `aixc:model` also on a coverage change; the Pocket tears down what it added when the chips fail to start; slots inserted in card order; names and `focusout` handled.
- **Test:** `tests/e2e/pocket-chips.e2e.test.ts`, 8 new tests and 3 changed assertions; each new test failed before its fix (red run on the unfixed sources, 2026-11-14), and with the icon class left off the first test fails.
- **Still open:** the owner's decision on a pocketed card's link (ADR-0052 §10). Owl's real motion, drag and start-up race on the live pages (O29).

## B-51 Our chips and the album drew in Helvetica or Geeza Pro on pages whose theme has no bold face

- **Found:** 2026-11-15, by the review of the 271 live screenshots (finding F1, confirmed by both skeptics); confirmed again on fresh evidence on 2026-11-17 (`output/live-verify-2026-11-17/`).
- **Cause:** Vodafone's themes differ in the font names they declare. `maintheme` (`/en|ar/home`) and `static-lite-theme` (`/en|ar/mobile-internet-bundles`, `/en|ar/wireless-net`, `/en/promotions`) declare only `vodafone-regular-en` and `-ar`; `static-theme` declares all nine. The Pocket asked for `vodafone-bold-en` and fell back to `sans-serif`. The album's own headings were also set by the theme's `[dir] h1/h2/h3` rules, which override `font-family` only.
- **Fix:** ADR-0075 §1: four `@font-face` aliases `aixc-vodafone-{bold,light}-{en,ar}` pointing at Vodafone's own woff files on its own origin (root-relative, `font-display: swap`, no weight), stacks of the page's names then the aliases then the page's regular face, variables that follow each element's own language, and the album's headings drawn in `var(--pocket-bold)` with a selector that outranks the theme. The portal's preview stacks use the variables.
- **Test:** `tests/e2e/pocket-fonts.e2e.test.ts` (port 4468, 12 tests): Chrome DevTools `CSS.getPlatformFontsForNode` on the chips and the album. Before: Helvetica and Geeza Pro on home and on the bundles page; after: `vodafone_rgbold` and GE SS Two Bold; the aliases load only where the page lacks the face. Failed first.
- **Still open:** the replay never saved `static-lite-theme`'s regular woff files, so the test serves `maintheme`'s identical copies. Vodafone's Arabic files ("GE SS Two") have no digits; the `-en` alias draws them.

## B-52 The pill's accessible name said the same words twice

- **Found:** 2026-11-15, by the live review (finding F13); confirmed 2026-11-17.
- **Cause:** before consent the trail's pill had a label and a state line that were the same text, and its `aria-label` joined them: "Remember my journey. Remember my journey." A screen reader read it twice.
- **Fix:** `view.ts`: the `aria-label` is the label alone when the state line would repeat it. `trail.js` grew by 15 B (32,076 B of 32,256 B).
- **Test:** `tests/e2e/trail-consent.e2e.test.ts` (port 4488), a check of the pill's name before consent. Failed first.

## B-53 The portal moved Vodafone's controls sideways, showed a strip, and let off-screen parts of the page fall in

- **Found:** 2026-11-15, by the live review (findings F4 and F5, and a left column in Arabic); confirmed 2026-11-17.
- **Cause:** while the portal runs it sets `html { overflow: hidden }`, which removes a classic scrollbar: Vodafone's accessibility button and our mic moved right by the scrollbar's width (15 px on this Mac) for the 3.3 s. The wall had a painted scrollbar strip, but a fixed overlay cannot paint into a reserved gutter (measured). In right-to-left an iframe puts its own scrollbar on the left, which showed as a left column of the destination. The wall's fixed copies are placed from the transformed wall, so `.skip-link { position: fixed; top: -100px }` and the mobile menu (translated off screen) came into view.
- **Fix:** ADR-0075 §4: `scrollbar-gutter: stable` on `html` only when a classic scrollbar takes width (`innerWidth > clientWidth` at the press); `cameraFor` reads `clientWidth` before; the painted strip removed; the drawn destination gets `overflow: hidden` and `scrollbar-gutter: auto`; `offScreen()` and `hideIn()` in `wall.js` hide positioned or transformed elements wholly off screen or clipped to 1 px in the copy. Trade-off: the gutter shows the page's background during the transition.
- **Test:** `tests/e2e/pocket-portal-live.e2e.test.ts`, 29 tests (22 before, 4 for classic scrollbars, 1 for teardown, 2 for the wall), classic scrollbars through `ignoreDefaultArgs: ['--hide-scrollbars']`. Failed first. Scene chunk 17,909 B of 17,920 B; portal chunk 6,427 to 6,436 B.
- **Still open:** not checked on Windows or on a phone with overlay scrollbars (they take no width, so the gutter is not set).

## B-54 The page turn showed the pocketed card as not pocketed, a doubled header, and empty carousel cards after closing

- **Found:** 2026-11-15, by the live review (findings F2a, F2b and F3); confirmed 2026-11-17.
- **Cause:** the album hid `#main-content` with `display: none`, so the page lost its layout and Vodafone's Owl carousels had nothing to measure when the page came back: their cards stayed unpainted while our chips floated over empty grey. Turn copies kept elements that are fixed on the live page (`nav.nav-fixed`, the skip link, the nudge, `nav-step-three`), so the header showed twice. The sheet was not cut at Vodafone's header. The closing copy had no liners, and the chips overlay ran its pass a frame late, so the card showed unpocketed and the liner popped in.
- **Fix:** ADR-0075 §2 and §3: `hideSource` keeps `#main-content` laid out (a style attribute with `display`, `height: 0`, `overflow: hidden`, `opacity: 0`, all `!important`, plus `inert` and `hidden`, restored byte for byte; `opacity`, not `visibility`, because an inherited `visibility` starts `.owl-item`'s `transition: all`); copies hide every live fixed element; the plane and lift layers are clipped at `seams.headerBottom` on each frame; the closing copy keeps the chips region with the liners only; `view()` runs `pass()` in the frame the page returns. Core `aixc.js` 7,886 to 8,000 B (budget 7.75 to 7.875 KB).
- **Test:** `tests/e2e/pocket-turn.e2e.test.ts` (port 4466, 12 tests; 0 of 12 passed before the fix). The kit gained a `fixedHeader` `scroll` mode and an `owlAutoRefresh` stand-in. `pocket-chips` now allows `hidden`, `style` and `inert` on `#main-content` and checks that its attributes after the album equal those served; the portal probe uses `closest('[inert][data-aixc]')`.
- **Live, 2026-11-17 after the fix:** one header in every turn frame in both directions at 1366 and 375, en and ar; the closing copy shows the liner; `cardsHiddenMs` 0 in all four rounds. Still open: after the portal's Back Vodafone's nav is not pinned in the reopened album (O36).

## B-55 Album details: an unmirrored Arabic Back chevron, a cropped Cash picture, a chip under the pill, the mic over a sticker's link

- **Found:** 2026-11-15, by the live review (findings F7a, F14, F9 and F8a); confirmed 2026-11-17.
- **Cause:** the Back chevron and the sticker link's external arrow were not mirrored in `[dir=rtl]`, and some paddings were physical. Every picture was `cover`, so a tall picture (the Vodafone Cash sticker, 218x240) lost most of its height in a 247x150 frame. The hero card's chip took its corner before the trail's pill was there, and sat under it at scroll 0. The album's foot was too short, so the guide's mic covered the last sticker's link.
- **Fix:** ADR-0075 §5: the chevron and arrow mirrored in RTL, `.pocket-back` and "Your journey" paddings logical. On live pages only (a seam; the clone's album is byte-identical), a picture is `contain` when `cover` would hide more than 40% of it at the frame's measured aspect **and** the picture is tall or square (P < 1.2) or a strip (P > 3.5). Frames: 247x150 (1.65) at 1366 px, 329x150 (2.19) at 375 px, 368x150 at 414 px. Cash, 218x240, hides 45%, 59% and 63% at 1366, 375 and 414: shown whole. A 230x170 photo hides 18%, 38% and 45%: `cover` at all three; Roaming, 350x150: `cover`. The first rule, 40% alone, turned 4:3 photos into insets on 390 to 414 px phones, and the lead narrowed it with the P bands. First-screen cards' chips avoid the pill and the mic at scroll 0 (F9, F8b): the overlay reads the pill and `vg-guide`'s mic where they rest, picks again on `vg:trail-ready`, a `ResizeObserver` on the pill and the mic and a `MutationObserver` on `body`'s children, never on scroll. At 375 px `vodafone-flex` [335,638,367,670] and `end-of-call` [235,631,322,663] were under the mic [296,657,360,721]; now clear. The album's foot is 172 px on live pages (the mic's top is 155 px above the screen's bottom at 1366x900 and 375x812).
- **Test:** `tests/e2e/pocket-details.e2e.test.ts` (port 4467), 5 tests (F7a, F14, F9 and F8b, F8a), each failed first. F14 failed with the old 40%-only rule at 414 px and passes with the P bands.
- **Still open:** F7b and F10 are fixed in B-58. F8b while the mic listens is by design (ADR-0064 places the mic); only the chips clearing the mic where it rests is built.

## B-56 The album's drone was never seen at 1366

- **Found:** 2026-11-15, by the live review (finding F6: the matrix's `measure.drone` was null in every cell, so the drone's rules never ran); confirmed 2026-11-17.
- **Cause:** `measureDrone` found no free place at 1366 px (`data-drone-anchor` none, state hidden). The drone's band did not stop below the journey's band and above the first group's head, it had no candidate beside the title block, and the bar's buttons, the journey band and Vodafone's fixed controls (the trail's pill, the mic, the accessibility button, the banner) were not all obstacles for its home position.
- **Fix:** ADR-0075 §6. `measureDrone`: the band under the bar starts below the journey's band and ends above the first group's head; a new candidate beside the title block (`title-right`, `title-left`) on the content margin; the order is band, beside the title, end gutter, far gutter; all of the bar's buttons and the journey band are obstacles; fixed controls count against the home position. Actors chunk 44,153 to 44,277 B at this step; the actor source was 291,777 B (comments trimmed to fit 285 KB then).
- **Test:** 4 tests in `tests/e2e/pocket-actors-live.e2e.test.ts` (port 4479; 1366x900 and 1280x800, English and Arabic, trail on): 0 of 4 before (`data-drone-anchor` none, state hidden), 4 of 4 after. The live check's rule (f) (a hidden drone at 640 px or wider in the album is a violation) is rehearsed by `floating-live-rehearsal`, which failed only on (f) until this fix.
- **Still open:** F11, the album at rest forces a layout on every frame, is held (ADR-0075, "What was held"); the drone is part of it. B-57 was found when the rehearsal ran with this fix in.

## B-57 The drone stayed under the consent card; the actors did not move when a fixed control came or went

- **Found:** 2026-11-17, when the floating rehearsal ran with the B-56 fix in: in the state where the trail's consent card opens from the pill over the album, the drone stayed at its home under the card.
- **Cause:** the actors measured Vodafone's fixed controls once, when the album opened or the window changed. A control that came or went while the album was open (the consent card, the guide's keyboard button and bar, the banner) changed nothing. Measured: drone [1165,233,1256,297] under the card [930,156,1350,560] at 1366 px, and the same in Arabic. A spring alone also overshot by 259 px on a 1,220 px move when tried as the way to a new home.
- **Fix:** ADR-0075 §6. `obstacles.js` `watchFixedObstacles(onChange)`: a `ResizeObserver` per known control (the accessibility button's icon, the banner, the mic, the keyboard button, the bar, the pill, the card) seeded with its current size, a class and `transitionend` watch, and a `MutationObserver` on `body`'s children and on the guide's shadow root. The actors refit at most once per frame. The drone flies to its next free home (eased: 1.1 ms per px, 450 to 1,600 ms) or hides while none is free and returns; the mascot re-measures when a control meets his place (an instant move, as on a resize). Actors chunk 45,004 B (budget 43.25 to 44 KB); actor source 298,221 B (budget 285 to 295 KB).
- **Test:** 7 cases in `pocket-actors-live.e2e.test.ts` and 1 unit test, each failed first; `pocket-actors-live` 26 of 26. Measured at 1366 px: the drone hides 3 ms after the card shows (no free place), is back 1 ms after it closes and at rest after about 106 ms; at 1600 px it flies to the left gutter.
- **Still open:** at 1600 px the drone's straight flight crosses the album bar's buttons (cosmetic). The mascot's re-measure is instant, not eased, when the guide's keyboard button and bar appear (as on a resize).

## B-58 The Arabic peel started at the wrong corner, and a wide card peeled as a screen-wide slab

- **Found:** 2026-11-15, by the live review (findings F7b and F10); confirmed 2026-11-17 (F7b is listed as known in ADR-0052 §12; F10 at 375 px).
- **Cause:** the peel, the hover lift and the album's `peelAway` always started at the card's top-right corner, while on Vodafone's pages the chip is at the top-end corner, the top-left in Arabic. A card much wider than its height (Vodafone Cash) was peeled across its width, so the sheet swept a slab as wide as the screen: the Cash card painted 182 and 200 px past its box in the peel and the lift at 1366 px and was 1,159 px wide at the throw; at 375 px it was 79 and 173 px past.
- **Fix:** ADR-0075 §7. F7b: on Vodafone's pages the lift, the peel (and Put back) and `peelAway` start at the top-end corner by the card's computed direction; the clone keeps top-right (its chip is at the physical right in Arabic too). F10: a long card (wider than 2.5 times its height, or wider than 60% of the screen while at least 1.5 times as wide as tall; the 1.5 was added so near-square phone cards are not long) peels across its height: tilt at most 3 degrees, lift at most 6, held over its slot, ground shadows fading, shrinking toward 360 px (`STICKER_W`) and never shorter than 48 px.
- **Test:** `tests/e2e/pocket-peel.e2e.test.ts` (port 4470), 8 tests, 7 failed first. Measured with the kit: Cash painted at most 0 and 4 px past its box in the peel and the lift at 1366 px (before 182 and 200), widest 403 px from the lift's end; at 375 px 0 and 24 px (before 79 and 173).
- **Still open:** the throw's spin follows the bottom-left landing corner, so it is not mirrored for a left peel.

## B-59 After the portal's Back the album had no mascot for over 3 s

- **Found:** 2026-11-15, by the live review (NEW-2): the album reopens mid-scroll at the sticker after the portal's Back (ADR-0065 §7) without the mascot within 3 s; confirmed 2026-11-17.
- **Cause:** the actors chunk loaded when the browser was idle, and on Back the album opened first: the mascot was not there until the chunk had come, over 3 s in the film.
- **Fix:** ADR-0075 §6. The actors load at once on Back and whenever the album opens; if the album opened before they were ready, its opening is played to them when they are. The ready wait observes the album root's attributes without naming the actors' attribute, so `sdk-size` still finds no actor names in the Pocket chunk.
- **Test:** the Back case in `tests/e2e/pocket-portal-live.e2e.test.ts`: the mascot is shown 0 ms after the album; before the fix it was null within 1 s. Failed first.
- **Live, 2026-11-17 after the fix:** the mascot shows 251, 255, 252 and 359 ms after the portal's Back (en-1366, ar-1366, en-375, ar-375). The album's Back stays off screen, since the album reopens at the sticker by design (ADR-0065).

## B-60 The journey's memory of the current page was blank, with a grey square, and the replay cursor's ring was half cut

- **Found:** 2026-11-15, by the live review (F12 and NEW-8); confirmed 2026-11-17.
- **Cause:** the trail's first rrweb snapshot of a page was taken while the album hid `#main-content` (the style attribute, `inert` and `hidden` of B-54), so the memory showed only the header, and later the host's hide and show of those attributes were recorded as changes. The grey square was Vodafone's accessibility button, blocked by policy and replayed as a default 55x55 button. The replay cursor's ring (`.replayer-mouse` and its tail) was half cut by the memory frame.
- **Fix:** ADR-0075 §8. Trail host API v2, part 4, an optional method (it amends ADR-0050's host interface): `setCover({ node, covered(), shown() })`. The journey chunk registers `#main-content` with `covered` set to `PageHost.sourceHidden`. While covered the recorder writes any full snapshot with `#main-content`'s shown attributes (in the serialized copy only) and does not record the host's hide and show of `style`, `inert` and `hidden`. (Deferring the first snapshot was the first idea; it would have left no memory while the album is open.) `sanitize.ts` marks blocked nodes `data-vg-blocked` and `replay.ts` keeps their box empty. The memory frame hides `.replayer-mouse` and its tail (`journey.css`). Sizes: `trail.js` 32,096 B (budget 32,256 B), `trail-record.js` 23,784, `trail-replay.js` 68,720, `guide.js` 20,824, journey chunk 8,289 B (8,236 before).
- **Test:** `tests/e2e/pocket-journey-live.e2e.test.ts` 12 of 12, 3 new (English at 1366, Arabic at 375, the end of the memory), each failed first; 1 new unit test in `trail.test.ts`.
- **Still open:** if the album opens before the journey chunk registers (for example Back into the album while the trail starts), that first hide is recorded as before.

## B-61 The album's actors at rest overwrote or back-dated a change made between two rest ticks

- **Found:** 2026-11-17, by the review of the rest mode's port (a skeptic per finding, all confirmed). The held patch drew the actors every 750 ms at rest and ran the physics ahead on a saved copy of the state.
- **Cause:** a change that arrived between two rest ticks was overwritten by the next tick, or back-dated into a visible snap. Seen: the mascot kept facing a card that had lost focus; a pointer move after a rest turned him 20 degrees in one drawing.
- **Fix:** ADR-0075, "The rest mode (F11), landed" (`edc544d`). Any change of either brain's state ends the rest first: both actors catch up to now and draw every frame again. The brains gained a `beforeChange` hook, and `simKey` (a JSON of the simulation) guards the restore in `restStep`.
- **Test:** `pocket-actors-live.e2e` cases "focus leaving the cards" and "a pointer move after a long rest", and a unit test of the brains' `beforeChange`; each failed on the port before the review's fixes.

## B-62 Reduced motion turned on during a rest was ignored

- **Found:** 2026-11-17, by the same review.
- **Cause:** a rest already running did not end when reduced motion was turned on.
- **Fix:** reduced motion ends the rest at once (the same list as B-61).
- **Test:** `pocket-actors-live.e2e` "reduced motion mid-rest"; failed first on the port before the fix.

## B-63 Keys, wheel, touch, focus, scroll and the window's blur did not end the rest

- **Found:** 2026-11-17, by the same review.
- **Cause:** keys, wheel, touch, focus, scroll and the window's blur were not among the things that ended a rest, though they change what the actors read.
- **Fix:** each of those inputs ends the rest, and no rest starts until 1.5 s after the last of them (so a continuously scrolling element keeps the rest off).
- **Test:** none of its own. Keys and focus are exercised by the "focus leaving the cards" case (Tab, Shift+Tab); wheel, touch, scroll and blur ending a rest have no test (open: add an e2e case that fails if one of them does not end the rest; O44).

## B-64 The rider's sheet did not fit when his silhouette's point count changed with his pitch

- **Found:** 2026-11-17, by the same review.
- **Cause:** the rider's sheet is fitted to the silhouette by least squares. His silhouette gains or loses points with his pitch, and the fit failed when the point count changed: 83 of 4,000 pose pairs.
- **Fix:** the fit uses points matched by name; now 0 of 4,000 fail.
- **Test:** a unit test, the rider fit across the pitch thresholds (10 yaw/pitch pairs where the silhouette gains or loses points, fitted both ways); by index there is no map. The 83-of-4,000 count was the review's measurement.

## B-65 The rotors' rest check could not fail

- **Found:** 2026-11-17, by the same review.
- **Cause:** the check could not fail: it passed whatever the rotors did.
- **Fix:** the check reads the six-page opacity flipbook's own page. Rotors are a flipbook at rest, and a unit test covers its schedule.
- **Test:** the `pocket-actors-live.e2e` at-rest cost and rotors case; it now fails under two mutations and passes on the real code.

## B-66 WebKit painted no board at rest

- **Found:** 2026-11-17, while checking the port in WebKit (Python Playwright driver, playwright-core 1.58, webkit-2248).
- **Cause:** the mascot's board was an animated HTML box inside the rig's `foreignObject`, and WebKit did not paint it at rest. The board-red share of the picture was 0.04 at rest against 0.30 awake. A check on boxes said "the same"; the pictures showed the defect.
- **Fix:** the board is an SVG sheet of its own between the floor's sheet and the rig. `measureMascotInset` now reads the deck from that sheet; the first version of the change moved the mascot's margin by 8 px, which `pocket_e2e` caught.
- **Test:** `pocket-actors-live.e2e`, the board painted at rest in WebKit and Chromium, by pixels; failed first in WebKit before the sheet.
- **Still open:** the voice-guide's own Playwright (1.56) wants webkit-2215, which is not installed, so this case runs through the Python driver.

## B-67 Groundwork: a reimagined view's marks were wiped on the first re-read, and the core's size check could not see `content-index` entering the core

- **Found:** 2026-11-17, while preparing phase 4a (design §3.5 and §5 item 1).
- **Cause:** two separate things. (1) The live adapter's `tag()` and `untag()` cleared `data-aixc-item` and `data-aixc-section` from every element of the document, so a view's cards would have lost theirs on the first re-read (amends ADR-0049 §7). (2) The size check built only the chunks that existed, and none of them imported `content-index.js`, so it passed. A demo chunk that imports it makes esbuild move it into a shared chunk the core loads: the core measured 8,852 B against a budget of 8,064 B, and 8,027 B once `normalizeContentModel` moved out.
- **Fix:** (1) `tag()` and `untag()` clear marks under `#main-content` only (core 8,003 B). (2) `normalizeContentModel` and its constants moved to `experiences/src/host/model.js`, which imports nothing; `build.ts` exports `aixcBuildOptions` so a test can build a probe.
- **Test:** `aixc-layer.e2e`, two new cases (the view's four marks wiped; only the `pocket` sheet loaded), failed on the old code; `experiences/tests/core-graph.test.mjs` and a probe build in `sdk-size.test.ts` each fail on the old graph. After: `aixc-layer` 8/8, `sdk-size` 4/4. Commit `3992aa5`.

## B-68 The launcher showed over the trail's pill until the trail announced itself

- **Found:** 2026-11-17, in stage 1's first review round (`2b7ac42`).
- **Cause:** the launcher overlapped the pill until the trail announced itself.
- **Fix:** the launcher finds the pill as it mounts (a watch on the guide's arrival on body and in its shadow root), not only on `vg:trail-ready`, so a returning visitor's pill is known before the trail says it is up. The tuck and the no-pill rule (shown only while `scrollY` is under 120) are the lead's decisions in ADR-0076, not this fix.
- **Test:** `reimagine-launcher.e2e`, the arrival-before-the-trail's-word case; failed first.

## B-69 The launcher stayed over Vodafone's sign-in card

- **Found:** 2026-11-17, in stage 1's review.
- **Cause:** the sign-in card for signed-out visitors (`#notSignedItem .nav-startup` under `.active`, on maintheme and static-lite pages) covers the launcher's place, and it was not one of the launcher's hide reasons.
- **Fix:** it is a hide reason now, with Vodafone's menus and dialogs, by CSS `:has()` on `visibility`.
- **Test:** `reimagine-launcher.e2e`, "hidden while a signed-out visitor's login card is open ... on maintheme, static-lite and static-theme pages"; failed first.

## B-70 The chips lost the launcher's resting place when it hid

- **Found:** 2026-11-17, in stage 1's review.
- **Cause:** the chips keep clear of the launcher on the first screen; when the launcher hid, they lost the place it kept for them.
- **Fix:** the chips keep a hidden launcher's scroll-0 rest and check again at the top of the page (lead decision). The Owl audit of `pocket-chips` stays byte-identical to `3992aa5`.
- **Test:** `reimagine-launcher.e2e`, the chips' rest case; failed first.

## B-71 The seam leaked a clean-up for every listener through `guard.listen`

- **Found:** 2026-11-17, in stage 1's review.
- **Cause:** `on()` added its listeners through `guard.listen`, which keeps a clean-up per call for the guard's life. A listener added and removed many times left that many clean-ups behind.
- **Fix:** the seam owns its listeners: `on()` wraps the handler with the guard's `wrap`, adds and removes the listener itself, and keeps its own `off`; `configure()` releases them all and ignores a `listen` passed in (ADR-0076 §6).
- **Test:** `shared-seam`, "the guard keeps nothing for the seam: its cleanups do not grow across mount, unmount, mount and drags"; failed on the `guard.listen` version.

## B-72 Spotlight from 1180 px wide was taller than the box on short laptops

- **Found:** 2026-11-17, in stage 1's review, with the clone-side box harness.
- **Cause:** from 1180 px wide, on short laptop windows, spotlight's stage was taller than the box.
- **Fix:** windows under 850 px tall use a flowing layout; from 1180 px the stage is the room's height; the queue shows only from 1180 px wide and 850 px tall; it is hidden on narrower windows (phones and 720 to 1179 px) and on shorter ones (the flowing layout). 1024x768 and 768x1024 stages equal the room.
- **Test:** `box_e2e.py` (1,228 checks, eleven sizes (desktop, laptop, tablet and phone), English and Arabic; 464 fail without the box rules).
- **Still open:** windows under 700 px tall (up to 25 px over); the 850 px switch was measured on the Services copy only (O39).

## B-73 On phones spotlight's controls row sat on the stage, not under the title

- **Found:** 2026-11-17, in stage 1's review.
- **Cause:** a finding of the review: on phones the controls row was not under the slide's title.
- **Fix:** on phones the row is under the slide's title, and the centred row is placed per physical zone (each side clear of its own zone).
- **Test:** `box_e2e.py`, the phone sizes; failed first.
- **Still open:** the row comes after the CTA in tab order (accessibility, skipped; O40).

## B-74 The Arabic "Jump to a category" label said "services" on pages that are not about services

- **Found:** 2026-11-17, in stage 1's review.
- **Cause:** the Arabic of "Jump to a category" said services.
- **Fix:** `words()` gives neutral copy; the Arabic is now "روح لقسم" ("go to a section"). Native review pending (O42).
- **Test:** `shared-seam-ar` unit test; failed first.

## B-75 The F9 test assumed no launcher on the page

- **Found:** 2026-11-17, in the full `test:e2e` at stage 1 (291 passed, 8 pending, 2 failed).
- **Cause:** a test issue, not a defect of the page: the F9 case in `pocket-details.e2e` (the hero chip under the pill) assumed no launcher.
- **Fix:** the case runs with Reimagine off, every assertion kept, beside a new case that runs with the launcher. The kit can turn one demo off. `pocket-chips`' Tab test expects the launcher as the one added stop.
- **Test:** `pocket-details` 6/6 after.

## B-76 The rest mode's focus case had a setup race

- **Found:** 2026-11-17, in the same full run (the second of the two failures).
- **Cause:** a test issue, a setup race present since `edc544d`: the case left the pointer resting on a sticker.
- **Fix:** the case keeps its pointer off the stickers.
- **Test:** `pocket-actors-live` 33/33 after; the whole run was green on the second pass.

## B-77 A template still loading while the album opened (or Original or Reset was pressed) left Reimagine stuck

- **Found:** 2026-11-17, in stage 2's review (24 findings, 13 real, each confirmed by a skeptic).
- **Cause:** a template's chunk was loading and nothing owned the pending choice. If the reader opened the album, or pressed Original or Reset, before the chunk arrived, the shell's state and the page disagreed and Reimagine was stuck.
- **Fix:** a pending template is dropped when the reader moves on (Original, Reset, Escape, the album, another template). It is kept when one of Vodafone's menus closes the composer: its view opens when its chunk arrives (see B-83).
- **Test:** `reimagine-live.e2e`, three cases: a template still loading is dropped when the reader opens the album; the same for Original; and the one that keeps it when a menu closes the composer. Each failed first on the pre-fix code.

## B-78 Two quick presses on the launcher while the shell loaded

- **Found:** 2026-11-17, in stage 2's review.
- **Cause:** a second press on the launcher while the shell's chunk was still loading was handled as a new press.
- **Fix:** the launcher sets `aria-busy` while the shell loads and ignores presses until it has opened the composer.
- **Test:** `reimagine-live.e2e`, "two quick presses on the launcher while the shell's chunk loads: the composer opens and stays open; the launcher is busy meanwhile"; failed first.

## B-79 The composer opened from "Change experience" stayed open after Original

- **Found:** 2026-11-17, in stage 2's review.
- **Cause:** Original from the bar or the end band gave the page back but did not close a composer that "Change experience" had opened, so it sat over the page as served and covered the launcher's place.
- **Fix:** Original closes the composer; the launcher shows again, a press reaches it and opens the composer again.
- **Test:** `reimagine-live.e2e`, "Original from the bar or the end band closes a composer opened from 'Change experience'"; failed first.

## B-80 A resize left the box where the old header had put it

- **Found:** 2026-11-17, in stage 2's review.
- **Cause:** the box rests under Vodafone's header when it opens, with its bottom at the screen's. A resize across the phone and desktop header (their heights differ) did not settle it again.
- **Fix:** a resize re-settles the box, but only when the window has not scrolled since the open (a reader who has scrolled keeps their place).
- **Test:** `reimagine-live.e2e`, "a resize across Vodafone's phone and desktop header, the window not scrolled since the open: the box rests under the new header, its bottom at the screen's"; failed first.

## B-81 The clone's Gemini and API-key words reached the live shell through `i18n.js`

- **Found:** 2026-11-17, in stage 2's review.
- **Cause:** the clone's composer copy (Gemini, API key, prompt) lived in `i18n.js`, which the shell imports, so the words (and the Arabic "مفتاح") shipped on live pages, against the owner's decision of 2026-11-10 (templates only; no Gemini, no key field).
- **Fix:** 51 entries moved to `experiences/src/aixc/composer-words.js`, which only the clone imports (the clone's words are unchanged: all 295 keys compared). "Gemini", "API key" and "مفتاح" are forbidden in Reimagine's chunks. The `i18n` chunk went from 8,314 to 6,171 B gzipped.
- **Test:** `sdk-size`, the forbidden-words check on the launcher's, the shell's and each experience's chunk (with `generativelanguage`, `aixc-key`, `aixc-model`, `fonts.googleapis`, `x-goog-api-key` and `codepen`); failed first.

## B-82 The composer covered its opener on short screens

- **Found:** 2026-11-17, in stage 2's review and its three follow-up rounds.
- **Cause:** the composer was always placed below its opener. On a short window (phones in landscape, laptops about 380 to 450 px tall) there was not room between the header and the corner controls, so it covered its opener, the pill, the launcher or a corner control, or it ran under Vodafone's header. The first tests were weak (they did not check its height on short screens).
- **Fix:** three placements. BELOW (under the header, its opener and the pill, +8 px) when the room down to the corner controls is at least `H_MIN` 216 px (measured: the whole composer in English; Arabic needs 235 px below 320 px wide; 215 px since phase 4b, down to the first row of templates, B-84). Otherwise BESIDE: a column on the inline-start side of the opener (left in English, right in Arabic), from the header +8 px to the screen's bottom -16 px, at most 400 px wide and at least `W_MIN` 240 px (measured), cut clear of the corner zones (16 px) and of the pill, the launcher, the bar's controls and the view's name (8 px). Otherwise BELOW, scrolling in the room that is left. It never covers its opener, the pill, the launcher, a corner control or Vodafone's header. Checked beside its opener at 812x375, 667x375 and 844x390 (phones in landscape), 1366x380 and 1366x450, English and Arabic, from the launcher and from "Change experience"; below at 375x360 (both openers) and 375x420 (launcher), English; at 667x375 in English from "Change" the column is 278x249 and the composer 278x216.
- **Test:** `reimagine-live.e2e`: "the composer on a short screen, below", "the composer on phones in landscape, en and ar" and "the composer on a short laptop screen, en and ar" (beside its opener, at least `H_MIN` by `W_MIN`, covering nothing, a template pressed in it opens its view), "the composer never sits in Vodafone's header band", and the height check in the Escape case; failed first.

## B-83 A menu closing the composer dropped the template the reader had chosen

- **Found:** 2026-11-17, in the same review.
- **Cause:** a Vodafone menu or dialog closes the composer, and the close dropped a template the reader had already chosen and that was still loading (the fix for B-77 dropped every pending template when the composer closed).
- **Fix:** a menu's close keeps the pending template: its view opens when its chunk arrives. Escape, Original, Reset, the album and another template still drop it (B-77).
- **Test:** `reimagine-live.e2e`, "a template still loading is kept when one of Vodafone's menus closes the composer: its view opens when its chunk arrives; Escape drops one"; failed first.

## B-84 With more templates the composer outgrew its placement: a press at the first row's edge could miss, and thirteen did not show whole beside its opener

- **Found:** 2026-11-18 to 2026-11-20, in phase 4b's step reviews and the lead's runs, as templates joined the registry.
- **Cause:** the composer's list was laid out for two templates, and `H_MIN` (216 px) was the whole composer with two (with three it was 274 px tall). With a third template the whole `reimagine-live` file went red at 1366x520, and the "beside" test checked only a bottom line, not the corner zones. Its floor and top were not whole pixels, so a press at the first row's edge could miss. With thirteen templates, four columns needed 449 px in 1366x520's 400 px column.
- **Fix:** a compact grid of as many 84 px columns as fit; `H_MIN` 215 px, the composer down to its first row of templates (measured at every width from 240 to 400 px, English and Arabic); `box.js` places it on whole pixels; beside its opener it takes up to 600 px of its column (`WIDE` 600, six columns; below it stays 400 px). From the launcher it opens at its top; from "Change experience" scrolled to the shown template, which it focuses (ADR-0076 §3).
- **Test:** `reimagine-live.e2e`'s short-screen loop: "beside" asserts the composer meets no corner's zone (each control grown by 16 px), "below" keeps the bottom-limit assertion, and every template is reached by the composer's own scroll with the window and the box still; failed first at 1366x520.

## B-85 Fan: cards in a corner stayed pressable when the zones changed, the revealed card stayed inert, and the details went under the listening zone

- **Found:** 2026-11-18, in step 2's review (fan).
- **Cause:** fan fenced its cards on resize only, so when the Pocket's button showed or the guide started listening (the box keeping its size) a card in the new zone stayed pressable ('El Hadaba World' in the right zone at 1366x900). `reveal()` left the current card inert for 820 ms while it moved. From 720 px with the guide listening the details sat in the right zone (768x1024: details at x 130..468 under the zone in English, cut by the box's left side in Arabic), and the closing band's Huawei AppGallery link sat in the Pocket's zone. On phones the closing band's third store link was cut by the box's side (spotlight's too: 73 px past a 375 px box).
- **Fix:** `shared.js` `onViewZones()` (a `MutationObserver` on the box's `style`) re-fences fan when the zones change; the current card is inert only while a zone covers it; `reveal()` in a box places the cards at once, so the revealed card is current and pressable on return; from 720 px the details stay between the zones or sit 16 px above the taller zone with a panel behind them, and the current card moves clear of them; the closing band's store links wrap in the box (`vodafone.css`). `settleCards()` re-checks every 50 ms while a card still moves (a load race seen once).
- **Test:** `box_e2e.py`, fan's row with the guide listening at 1366x900, 1024x768 and 768x1024, and `fan_extra` (zones shown and removed by writing only the box's style; `reveal()` of the first, a middle and the last card; `reveal('no-such-item')` false); the store links checked at the box's end for every row; failed first.

## B-86 Split: slides left stuck mid-jump, the phone row not placed again, and the actions and rail in the listening zone

- **Found:** 2026-11-18, in step 2's review (split).
- **Cause:** `place()` cleared `.is-jump` per jump with its own timer, so quick jumps left layers stuck (54 after the jumps, 81 after a remount). On phones `placeRow()` did not run again when the zones changed or a font arrived (the gap between title and row 42.7 px while listening, against 16). With the guide listening the copy's actions and the rail could fall in the widened right zone, and the rail's top went 12 px above the stage at 1366x700. The image-error handler was not guarded.
- **Fix:** one shared set of jumping layers with a single two-frame clear (also on the clone, where it restores the old behaviour); a `ResizeObserver` on each slide's copy and title in the box; from 720 px the actions keep 16 px clear of the listening zone; the rail a flex column between the stage's top and the zones, its hidden labels drawn outside the buttons; the image-error handler through `guarded()`.
- **Test:** `box_e2e.py`: `SPLIT_JUMPS` (jump to the last slide and back, unmount mid-jump, mount again), `split_extra` (zones to listening and back on phones), `SPLIT_RAIL_CLEAR`, and a rail check at 1366x700 quiet and listening; failed first (20 of 206 before the fix).

## B-87 Ring: a room of nothing on short phones, the foot in the zone in a short box, and services inert that were clear

- **Found:** 2026-11-18, in step 2's review (ring) and the new every-service check.
- **Cause:** on short phones the ring's room shrank to 0, and a room of 0 brought back the clone's size. In a short box with the guide listening the foot ran into the zone in English and the ring's column collapsed in Arabic. `fence()` added 16 px to zones that already include 16 px, so services clear of the zones were inert (at 1366x900 the one after the front). The fast-turn stretch widened the clipped column (by 352.8 px at 812x375). A service with a second link ('Download Ana Vodafone App') wrapped it into the right zone on phones.
- **Fix:** `measure()` decides box or clone with `viewScroller()`; two tiers for phones under 720 px wide; in the short box the split between ring and foot keeps the foot's 250 px clear of the zone, with `.is-tight` where the room is under 458 px; `fence()` takes the zones as the shell gives them; the stretch applies to the wheel, not the ring, in the box; `.has-extras` lays out a service with a second link.
- **Test:** `box_e2e.py`, ring's row: "no service inside the stage's sides and clear of both zones is inert", the fast-turn check (8 short-box cells), and every service shown in turn; failed first.

## B-88 Cover flow: the panel under the transcript bar, the front cover over the panel on phones, and focus lost to the page

- **Found:** 2026-11-18, in step 2's review (cover flow).
- **Cause:** at 812x375 with the guide listening the panel sat under the transcript bar. On phones while listening the front cover overlapped the panel and the head (the covers' room was a fixed reserve). When a focused cover turned inert, or a focused Next turned disabled at the last cover, focus fell to the page's `body`.
- **Fix:** in the short box the panel and the flow are placed by physical sides and swap where the usual side is too narrow; `fitRoom()` measures the panel's tallest content on a hidden, inert copy and sets the covers' room from it; `keepClear()` hands focus to the first enabled of Next and Previous, and `showFront()` hands it to the other button when a focused one turns disabled.
- **Test:** `box_e2e.py`, cover flow's row listening at 1366x900, 1024x768, 812x375 and 375x812, and `coverflow_extra` (`CF_ROOM`, `CF_FOCUS`); failed first.

## B-89 Gallery: the caption over the shown piece on short phones and in the Arabic short box

- **Found:** 2026-11-18, in step 3's review (gallery) and a live run.
- **Cause:** on short phones (375x667, 360x640) the caption covered the shown piece and its link sat in the transcript bar's zone while the guide listened. In the Arabic short box while listening (812x375) the column hid the shown piece and the progress bar shrank to 22 px. The compact switch keyed on the viewport's height, so it depended on Vodafone's header. On the live 1024x768 page (587 px of room) a wide piece reached the right zone and went inert.
- **Fix:** a short-phone tier (under 720 px wide and under 600 px of room): the stage's title and description give way, the frame and the caption are smaller and the row sits higher; in the short-room column tier the piece is centred between the column and the end side's zone; the stage is a size container, so the switch reads the stage's own size; the column switch at 580 px of room.
- **Test:** `box_e2e.py`, gallery's row at more sizes (812x375, 375x667, 360x640, 1366x700, 1024x600, 768x1024) and `gallery_extra` (`GALLERY_COVER`: at most a quarter of the shown piece under the caption and the row; `GALLERY_HEADER`: a 124 px header); failed first.

## B-90 Cube: a card's stretched link pressable in a zone, Arabic dot labels off the screen, and the phone's first h1 under the corner buttons

- **Found:** 2026-11-18, in step 3's review (cube).
- **Cause:** `fence()` judged a card by its title link, so a card whose stretched link covered it stayed pressable in a zone while the title was clear. On Arabic phones the dots' labels ran off the screen's left (a real Arabic name reached x = -17 at 812x375). On a phone's first view the `h1` sat under the corner buttons (English in the left zone, Arabic in the right). The wide dots row and its switch had no checks.
- **Fix:** `.cb-fenced` turns off a card's stretched link while the card meets a zone and its title does not, and the card is not focused; the dots' labels start from the row's left on phones; the intro block lower on upright phones.
- **Test:** `box_e2e.py`, cube's row with 1024x600 and `cube_extra` (`CUBE_DOTS`, `CUBE_LONG_LABELS`, `CUBE_FIRST_H1`); failed first.

## B-91 Journey: the intro's title and hint under the bottom corners

- **Found:** 2026-11-18, in step 3's review (journey) and its live check.
- **Cause:** at 812x375 the intro's text and hint were in the left zone in English and in the right zone in Arabic; on `/ar/home` at 1366x900 a long Arabic title pushed the hint into the accessibility button's zone. Neither focus check reached `clearFocus()`.
- **Fix:** journey's box rules keep the intro's words clear of both zones (`journey.css`).
- **Test:** `box_e2e.py` `JOURNEY_INTRO` (title, text and hint meet neither zone at the box's top, every size and language, listening too) and `JOURNEY_FOCUS_UNDER` (a link under a zone, focused, is moved clear and keeps its pointer events); the same intro check in `reimagine-live.e2e`'s journey row, with landscape cells on `/en/services` and `/ar/services`; failed first.

## B-92 Tunnel: Tab skipped the fenced links when laid flat, and the first card sat under the mic

- **Found:** 2026-11-18, in step 3's review (tunnel).
- **Cause:** laid flat (reduced motion or a short box), `fence()` made a link in a corner's zone inert, so Tab skipped it. From 720 px laid flat, the first card sat under the mic and the accessibility button. The probes for what the box's sides cut could not fail, and the lift branch and 768 px widths were never run.
- **Fix:** a flowing link in a zone gets `.tn-fenced` (no pointer events) instead of `inert`, and is scrolled clear by the box's scroll when focused; laid flat from 720 px the grid keeps clear of the zones, at least one 290 px card wide.
- **Test:** `box_e2e.py`, tunnel's row with 768x1024 and listening at 1366x900, 1024x768, 768x1024 and 375x812; `TUNNEL_CURRENT` and `tunnel_settled()` on each of the 35 stops; failed first.

## B-93 Flipbook: a focused link under the row held at the top

- **Found:** 2026-11-18, in step 4's review (flipbook; 1 of 3 confirmed).
- **Cause:** `clearFocus()` did not count the row held at the top as covering the book, so Shift+Tab could focus a contents link hidden under it.
- **Fix:** `clearFocus()` treats the held top row as covered and scrolls the focused link below it.
- **Test:** `reimagine-live.e2e` `flipbookChecks`: wherever the row sits at the top (phones, English and Arabic, `/services` and `/home`), Shift+Tab to a link hidden under the row brings it clear; failed first.

## B-94 Canvas: a tap moved its card, Escape left focus on the page, and reveal() could land in a zone

- **Found:** 2026-11-20, in step 4's review (canvas; 6 of 6 confirmed).
- **Cause:** on touch a tap focused a card and the focus moved it, so the press could miss. When the fence made the preview's opener inert, Escape left the focus on `body`. `reveal()` could return true with its card inert in a zone. The Arabic phone foot wrapped over the cards. Two changes reached the clone (its tile sizes and its unmount).
- **Fix:** in a box a card glides to focus only for `:focus-visible` (Tab or keys), not for a press or a tap; `close()` brings an inert opener back clear of the corners before giving it the focus; `reveal()` fences at once; the phone's key hint is hidden in the box; the clone keeps its 190/300 px tiles and its unmount.
- **Test:** `box_e2e.py` `canvas_extra` and `reimagine-live.e2e`'s canvas row (the phone's pressable floor 2 for two columns); failed first.

## B-95 Streaming: a bar link's scroll cut short, and a hovered last-row card over the end band

- **Found:** 2026-11-20, in step 4's review (streaming; 3 of 5 confirmed).
- **Cause:** `fence()` scrolled any focused element clear of a zone, including the row's `h2` that a bar link focuses, which cut the bar link's smooth scroll short. On Home, with no closing band, a hovered card of the last row grew over the shell's end band.
- **Fix:** `fence()` scrolls only a focused link or button clear of a zone; room under the last row for a hovered card where no closing band follows (pointer devices from 720 px).
- **Test:** `reimagine-live.e2e` `streamingRules`: a bar link's scroll runs to its row (`/en` and `/ar` services, 1366x900 and 375x812, motion allowed) and a hovered last-row card stays clear of the end band (`/en/home`, `/ar/home`); failed first.

## B-96 Focus dropped to the page where the fence made a focused item inert (ring, split, streaming, gallery, fan)

- **Found:** 2026-11-21, in the Phase 5 review of all of 4b (the seam area; each finding confirmed by a refuting skeptic).
- **Cause:** the inert rule did not spare the focused item. Ring's `fence()` made the focused ring item inert, so focus went to `body` and the stage's keys stopped. Streaming's `fence()` made every off-page row card and every bar link past the box's side inert, so Tab skipped them and the row's Tab paging was dead in the box. Split's `show()` made the slide that held focus inert, and the arrow keys stopped. Gallery's pieces fenced at rest at the box's end stayed inert after they rose out of a zone. Fan and gallery with a single item handed focus to a disabled button.
- **Fix:** (`6e017a9`; box only, the clone unchanged) a focused item hands the focus on before it is lost. Ring's `fence()` notes the focused service before it writes `inert`; if that service turns inert or out of the ring's view (`is-off`), the focus goes to Next, else Previous, else the stage. Split's `show()` does the same for a link of the slide that turns inert (which covers `reveal()`), and the new `fitRail()` (the rail hidden where it would reach the listening zone, `.ss-rail.is-tight`) hands the focus on before a focused rail button is hidden. Streaming's `fence()` cuts a row card or bar link only where the part its own container shows (the row's `.st-row__viewport`, else the bar's list) runs past the box's side, and a container that scrolls sideways never cuts: off-page cards stay focusable, Tab pages the row again, and a swipe no longer drops the focus. Gallery re-fences on the box's scroll (`onScrollFrame(refit)`), so pieces fenced at rest come back as they rise out of a zone at the box's end. With one item (both buttons disabled) fan (`keepClear()`, `settleCards()`), gallery (`keepFocus()`), ring and split give the focus to the stage, which gets `tabindex -1` only then. Ring's and split's stage fallback and `fitRail()`'s handoff are the lead's, after the check over the fixes found them missing.
- **Test:** `box_e2e.py`: `ring_extra` (press a service, then ArrowDown four times: before, the focus fell to `body`, the front stayed and the window scrolled 120 px, 12 fails at 1366x900 and 375x812; after, 108/108; at 1024x768 with the guide listening it accepts any focus in the stage after the press, since the pressed service can pass the listening zone and rightly hand the focus to Next); `streaming_keys` (8/16 before: off-page cards inert, Tab skipping to the row's Next arrow, at 375 px four bar links and 18 cards inert; 16/16 after); `split_extra` (a slide's link focused, then ArrowDown three times: the focus on `body` and the counter stuck at 5 before); `GALLERY_END`, inside `gallery_extra`, so in every gallery cell (every size, English and Arabic, at rest and listening: the wall rests on its last piece and the box scrolls to its end, and no piece clear of the box's sides and both zones may stay inert); `one_item_after` (one item, focused, a zone over it: the focus on `body` in both languages for fan and gallery before). `reimagine-live.e2e`'s streaming row counts what its own row clips (as `box_e2e`'s `CUT_BY_SIDES`) and asserts that no off-page card is inert. All failed first, except the lead's later stage fallback for ring and split and `fitRail()`'s handoff, which the rows' runs cover (fan, gallery, split and ring alone: `reimagine-live` 4/4, `box_e2e` 1,810/1,810) without a check of their own.

## B-97 Fan's prev and next in the right corner's zone on a short box from 720 px wide

- **Found:** 2026-11-21, in the Phase 5 review (the CSS and zones area).
- **Cause:** on a short box from 720 px wide (phones in landscape, English) fan's controls at the stage's top end sat inside the right corner's zone. No suite ran that size.
- **Fix:** (`6e017a9`; box-only selectors) `fan.css` adds `--fn-safe-end-h` and, from 720 px wide, a `--fn-ctl-fit` switch that moves the controls' row in past the end corner's zone (16 px from it) once that zone reaches the row. Beyond the review's proposal, in a window under 500 px tall and at least 720 px wide (a media query, `@media (min-width: 720px) and (height < 500px)`, on the window, not the box) the hint and the progress bar are hidden, as on phones: without that, Arabic with the guide listening at 812x375 put the 313 px row 5 px into the right zone.
- **Test:** `box_e2e.py`, fan's sizes and listening list gain 812x375 (6 fails before; 63/64 with only the row moved in; 64/64 with the hint and progress bar hidden); `reimagine-live.e2e`'s fan row runs with `landscape: true`; failed first.

## B-98 "Service ring" and "Service cube" on pages that are not about services

- **Found:** 2026-11-21, in the Phase 5 review (the rules area).
- **Cause:** the composer, the view bar and the announcement took ring's and cube's card names, which mention services ("Service ring" / "Service cube", حلقة الخدمات / مكعب الخدمات), on every page. The neutral words of step 1 covered the experiences' own labels only.
- **Fix:** (`6e017a9`) `shell.js` has `NEUTRAL_CARD_NAMES` (`{ ring: 'Ring', cube: 'Cube' }`) and `cardName()`, keyed on the shell's own copy, used in the three places that print a card's name: the template buttons, the view bar's name and the announcement. Off Services they say "Ring" and "Cube" (Arabic حلقة, مكعب); on Services the card names stay. `i18n.js` gains Cube: مكعب (Ring was there), and O42 lists it.
- **Test:** `reimagine-live.e2e`, a new case on `/en` and `/ar` home and services (the composer's, the bar's and the announcement's names); failed on `/en/home` before the fix.

## B-99 The box preview: focus not given back after a resize, Space not held, the sheet placed only on resize

- **Found:** 2026-11-21, in the Phase 5 review (the rules and dialogs area).
- **Cause:** in streaming, closing the preview did not return focus when a resize had made the opener's row card inert while the preview was open. Space on a focused link in the box preview was not held, so it could scroll Vodafone's page behind it. The preview was placed again only on resize, so its top went stale when the view bar's height changed (the trail's pill on phones).
- **Fix:** (`6e017a9`) `view-dialog.js`: in the box, Space is let through only on a `button`, `[role=button]` or `summary`, so on a focused link it is held while nothing in the preview scrolls; `onViewZones(place)` places the preview again when the view bar's height changes (`box.js` writes `--aixc-viewbar-h` on the box's style), and the observer goes on close. `streaming.js`: `showModal()` keeps its opener; in the box `hideModal()` brings an inert opener card back onto its row's page, re-fences and clears its `inert`, then closes, so the focus goes back to it (with B-96's fence the card is normally only paged off, so this is a guard).
- **Test:** `view-dialog.test.mjs` (6 pass, 2 fail before; 8/8 after): Space on a link is held when nothing inside scrolls and goes to the body when the body scrolls; the existing assertion "Space on a link or button presses it" encoded the bug and now checks a button and a `[role=button]`; with a fake `MutationObserver` a taller bar re-places `--vx-sheet-top` and `--vx-sheet-h`, and the observer goes on close. `box_e2e.py` `streaming_keys`: with the preview open the window narrowed from 1366 to 1050 px, then Escape gives the focus back to the card (it went to `body` before; an e2e check, not the unit test the review suggested).

## B-100 The mascot rode up beside the guide's mic when a scroll lifted the album's fixed floor

- **Found:** 2026-11-18, by the page watch's floating cells (en 375x812, album, banner absent: 13 px from the mic, the rule needs 16).
- **Cause:** pre-existing, not the watch. On Vodafone's pages the album floor is fixed. `boundFloor()` (`experiences/src/pocket/pocket-actors.js`) lifts it with translateY when the album's end scrolls in, but the scroll handler did not run the 16 px room check again (`insetForObstacles`, `measureFloor`), and `layout.drawn` kept the old top. Measured with no watch at all: 12 px. The matrix's album cells never scroll the album.
- **Fix:** `boundFloor` moves the drawn place with the floor and returns true; the scroll handler then runs `fitMascot()` in the next frame.
- **Test:** `pocket-actors-live.e2e.test.ts`, "/en/services 375x812 at rest: the album's end scrolled into view, the lifted floor keeps him 16 px from the mic (F11, O44)": 13.4 px before the fix (fails), 17.4 after. It starts from the rest, so it also covers O44's scroll item. Reviewed by the live-demos session. Commit bec48c0.

## B-101 Two watch requests could start 993 ms apart

- **Found:** 2026-11-18, by the watch's e2e.
- **Cause:** a request waited for the meta write that records its time, so the gap between two request starts could fall under the 1 s rule.
- **Fix:** the request starts at once and its time is recorded after.
- **Test:** `watch-check.test.mjs`, "spacing holds between the requests themselves, however long the meta write that records one takes" (993 ms before). Commit 69b883c.

## B-102 The independent critic's findings on the page watch, steps 2 to 4

- **Found:** 2026-11-18, by the independent critic (Opus). Each finding was reproduced on the real checker.
- **Cause and fix:** eleven findings, all fixed with a failing test first (commit 4e7447f).
  - F1 (high): requests followed redirects, so a redirect to a sign-in or challenge page was taken as "page gone" and the run went on. Now `redirect: 'manual'` (robots.txt too); a 3xx marks the page moved; an answer from another origin or a path we may not fetch blocks 24 h and stops.
  - F2: a bot check on a page's first fetch was filed as "not static". Now a 200 without `#main-content` is a challenge on any fetch.
  - F3: a run stopping part-way lost the changes it had found. Now they are kept; one bad page never rejects the run.
  - F4: a sticker joining an already-baselined page was told of older changes. Now its first read is a silent baseline.
  - F5: with no layer on a browser-mode site, the guide's chip could ask for notification permission before the server's 409. Now it fails at once (the session answer carries `watch.mode`).
  - F6: the chip failed on a card already pocketed in the other language (Pocket exposes `keyOf`).
  - F7: spacing held only within a run. Now it holds across runs, and a forced run waits for the lock.
  - F8: removal during a run left orphan rows. Now a sweep each run.
  - F9: a baselined page dropping under 200 characters went quiet. Now the reader is told once.
  - F10: "Open the page" after a link change went to the old link.
  - F11: the checker kept going after the watch was dropped. Now it stops.
- **Test:** one failing test per finding, each named after it: `experiences/tests/watch-check.test.mjs` cases 'F1: …' to 'F11: …' (F1, F2, F3, F4, F7, F8, F9, F11), `watch-store.test.mjs` 'F4: …' and 'F8: …', `watch-ui.test.mjs` 'F10: …', `voice-guide/tests/unit/watch-chunk.test.ts` 'no layer on a browser-mode site: false at once, no permission asked, nothing sent' and `tests/integration/watch-server.test.ts` 'the session answer carries the site's watch mode…' (F5), `tests/integration/watch-ui.test.ts` 'the guide's bridge: a card kept on this page in the other language is watched, not refused' (F6).
