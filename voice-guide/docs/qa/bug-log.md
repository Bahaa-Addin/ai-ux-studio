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
