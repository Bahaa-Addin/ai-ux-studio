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
