# SPEC-06: Exploration Trail

- Status: Built as a prototype (2026-11-03) on the fixture site; not enabled for customers.
- Decisions: [ADR-0035](../adr/0035-rrweb-for-local-journey-replay.md) (rrweb), [ADR-0036](../adr/0036-journey-memory-knowledge-and-experience-profile-are-separate.md) (three layers), [ADR-0037](../adr/0037-trail-consent-retention-masking-and-aggregation-boundary.md) (consent, retention, masking, aggregation), [ADR-0038](../adr/0038-trail-timeline-inside-the-guide-and-chips-through-the-turn-pipeline.md) (timeline and chips), [ADR-0039](../adr/0039-trail-across-origins-boundaries-not-uploads.md) (origins)
- Tasks: E8 in [TASKS](../tasks/TASKS.md)
- Needs before customers: D2 (data protection), confirmed consent wording, retention approval, security review, real-site validation, operational monitoring

## 1. What it is

The website remembers a person's journey **on their device** and turns it into the next useful action:

1. The person turns on "Remember my journey on this device". Nothing is recorded before that.
2. Public pages they visit are recorded privately (rrweb, masked) into this browser's IndexedDB.
3. "Your journey" is a slim timeline below the site's header: one step per page, with transition markers where a link or call to action led to the next page.
4. Hovering, focusing or tapping a step shows a **memory** of that page in a sandboxed preview; moving along the step scrubs the recorded pointer and page changes; holding still plays on (never under reduced motion).
5. Beside the preview: up to three **knowledge destinations** the person explored on that page ("You explored this", "You returned to this", "You opened this"), each with up to three verified questions.
6. A question is an ordinary guide turn: the timeline steps aside, the guide plans with the deterministic router first, then navigates, reveals, spotlights and answers. No chat window.

## 2. Consent and controls (ADR-0037 §1)

A page can opt out of journeys with `<meta name="vg-trail" content="off">`: it is browsed normally, nothing from it is saved, the timeline names it ("Went to Shokran Services", not selectable) and a small note under the pill says "This page is not saved" for a few seconds. In the demo, pages the replay does not have open from the internet and are recorded like the saved ones; `liveUnsaved` in `tools/demo-browser.ts` marks them opted out instead.

| Control | Where | Effect |
|---|---|---|
| Remember my journey | Consent card from the trail button | Stores consent, creates the local database, loads the recorder on eligible pages |
| Not now | Consent card | Hides the offer for this browser session; nothing is stored |
| Pause / Resume | Sheet header | Stops / restarts the recorder in every tab (the `storage` event) |
| Clear journey | Sheet menu | Deletes the current journey's index, replay and attention; recording continues as a new journey |
| Clear all saved journeys | Sheet menu | Deletes every journey on this device for this origin |
| Turn off | Sheet menu | Stops recording in every tab, deletes everything, and keeps the offer closed until re-enabled from the trail button |

The consent card says what is saved (the public pages visited and how they looked, pointer and scroll, which parts were explored, and what the questions were about, never their words), what is never saved (the words said or typed, the guide's answers, fields, sign-in, account, payment, private pages), that it stays in this browser, the retention (24 hours), how to pause and clear, and that anonymous statistics are off. Copy is in `packages/sdk/src/trail/i18n.ts` (Arabic in the guide's Egyptian register, English).

## 3. Timeline

- Collapsed: a 44px pill at the inline end, below the site's persistent header (measured: fixed or sticky elements and the page's own header while visible; `trail.topOffset` overrides). It tucks away while scrolling down and returns on scrolling up or focus. On phones it shows the icon and state only.
- Expanded: a sheet under the pill with the step rail, the position slider, the preview, and "You explored".
- Steps: initial load, full navigation, `pushState` and meaningful `replaceState`, `popstate`, and a known link or call to action. Redirects (a `replaceState` within 10 s), reloads, title changes, hash changes and tracking parameters do not make steps (`trail/boundaries.ts`).
- Boundaries: "A private page" (sign-in, account, checkout, payment; no path stored) and "Went to …" (another origin, ADR-0039), drawn dashed and not selectable.

### Interaction

| Input | Behaviour |
|---|---|
| Pointer hover on a step | Selects it and shows its first frame, paused |
| Pointer move along a step | Maps the position to replay time: forward scrubs forward, backward seeks back |
| Pointer still for 300 ms | Plays on at normal speed (not under reduced motion) |
| Reaching the end of a step left by a link | A marker "Opened <next page>" and the next step's arrow highlighted |
| Tab | Focuses the trail button; Enter opens the sheet and focuses the selected step |
| Left / Right on the rail | Previous / next page (mirrored in Arabic); Home / End |
| Slider (`role="slider"`) | Arrows ±5%, Page Up/Down ±20%, Home/End; announced as "40% through Offers" |
| Enter on a step | Opens or plays its preview; Space toggles play and pause |
| Escape | Closes the sheet; focus returns to the trail button |
| Touch | Tap selects; dragging along a step scrubs; the page underneath never receives it |

The preview is labelled "A memory of <page>, not the live page", is inert, not focusable and hidden from assistive technology; the slider is the accessible control. Touch targets are at least 44×44 px.

## 3a. Hosted journey: Vodafone's Pocket (ADR-0040, ADR-0050)

A page that hosts the journey draws it itself through `TrailHostApi` (`trail/host.ts`, version 2, ADR-0050); the trail never opens its sheet there. A page hosts it in one of two ways: a static `<meta name="vg-trail-host" content="pocket">` (the Services clone; it counts as a claim that is never released, until the clone goes in phase 9), or a claim made at run time with `claim()`, which returns a function that gives the journey back, or `null` while another host holds it. The experience layer claims it on every page its Pocket runs on and gives it back if the layer stops, so the pill never points at a host that is gone.

The consented pill asks the host (`vg:trail-open`) and never navigates: the journey is drawn in place, in the layer's Pocket, opening on the page the person is on (the clone keeps the step before the Services page). Where nothing hosts the journey (the `/spa/` app, the e-shop, `?aixc=off`, the layer off or failed) the guide's own sheet opens (§3; ADR-0038; owner, 2026-11-13), so no pill is ever dead. From step S10 (2026-11-14) `trail.hostUrl` is gone: it used to send the consented pill of other pages to a host page (`/{lang}/services#journey`, ADR-0043). The table below is the journey as the clone draws it.

On the Services clone (`../experiences`, mounted at `/en/services` in the demo):

| Element | Where and how |
|---|---|
| "Your journey" | Beside "Back to Services" in the Pocket, the Pocket's button style, a red dot while saving |
| Stepped tabs | Under the bar: one tab per page with its own thread; the selected page is a lifted white tab with the knob; "You are here" on the current page; drag or touch along a tab to scrub, letting go plays on; arrows ±5 %, Page Up/Down a page, Home/End; Escape closes the journey before the Pocket |
| Layer | Lightly frosted, translucent, over the album in the same cell; never a dialog |
| Entrance | Title row, memory, Play, "You explored", then each note, 70 ms apart; none under reduced motion |
| Memory | A big sticker; the sandboxed replay renders into the Pocket's frame (`setPreviewRoot`) |
| Notes | Why (explored, returned, opened), title, context, up to three question chips |
| A chip | Turns the page back to Services, then asks; the guide answers there |

The clone's sections carry `data-vg-destination`; the page map and the planner add `[data-vg-destination="id"]` to the destination's selectors.

## 4. What counts as explored (`trail/resolver.ts`, `trail/attention.ts`, `trail/interest.ts`)

Interactions are mapped to **knowledge destinations**, never to arbitrary elements: an explicit `data-vg-destination`; the destination's approved selectors (deepest wins); a constrained card's accessible name; a link to a known page; a collection item's key attribute; otherwise a local-only fingerprint that is never shown or sent. Navigation, footer, cookie and guide regions resolve to nothing; sections that wrap two or more destinations (a tab set) are never shown.

A destination is a candidate only after deliberate attention: pointer dwell ≥ 600 ms (shorter than 300 ms counts against it), focus ≥ 400 ms, activation, a return after a gap of ≥ 1.5 s, or a reveal (opening a tab or accordion credits the panel it opens). Visible time counts only when ≥ 50% is on screen, the tab is visible and the trail sheet is not covering the page. The score is a capped weighted sum (`TRAIL_CONFIG.attention.weights`), minus a pass-through penalty. The top three are chosen greedily with a 0.5 penalty for each earlier pick from the same topic (items of one collection), known destinations only, never filler.

No times, counts or scores are shown, and no "popular" label unless approved aggregation met its cohort (§6).

## 5. Questions (`site-experience-profile/v1`, ADR-0036)

`npm run experience -- --site <id> [--activate]` builds a profile for the active knowledge version:

| Intent | Example (en / ar) | Grounded in |
|---|---|---|
| What is included | "What does Mega 25 include?" / "مميزات ميجا ٢٥ إيه؟" | the item's labels and its collection's fields (read live when answered) |
| Next step | "How do I subscribe to Mega 25?" / "أشترك في ميجا ٢٥ إزاي؟" | the `subscribe` flow (the guide stops before the commit point) |
| Compare | "Which of the mobile internet bundles is the cheapest?" / "إيه أرخص حاجة في باقات إنترنت الموبايل؟" | the collection's price field |
| About | "Tell me about the weekend offer" / "احكيلي عن عرض نهاية الأسبوع" | the section's label and target |
| FAQ | the question itself | the FAQ's label and answer target |
| Picture | "What does the speed chart show?" / "اشرحلي …" | the visual's crawl-time description |
| Page | "Take me to Offers" / "افتحلي صفحة العروض" | the page's title |

Each wording is run through `understand` + `buildPlan` from the destination's page and the home page. Published only if both reach the expected destination with a replay plan, the expected intent and selector, in the same language, with no agent step and no click on a commit target, and the text passes the chip checks (≤ 60 characters, no prices or currency, no numbers outside the name, no promises or "for me"). One question per intent, up to three per locale. Failed wordings stay in the profile as `rejected` or `needs-review` with reasons and are never served.

## 6. Data (ADR-0036, ADR-0037)

| Layer | Where | Contents | Leaves the browser |
|---|---|---|---|
| A. Journey memory `vg-trail/v1` | IndexedDB `vg-trail-v1`: `sessions`, `chunks` (gzip, by step), `interest` | rrweb events, steps, local times, attention per destination, local fingerprints, and per step at most 10 asked questions (what an answered turn was about: destination, page, intent, route, a price-free label; **never the words said or typed, never the answer**; ADR-0050 §5) | **Never** |
| B. Site knowledge `site-knowledge/0.1` | `kb_versions` | Unchanged | Public |
| C. Experience profile `site-experience-profile/v1` | `experience_profiles`, `experience_active` | Questions with evidence and validation; optional cohort rank | Verified questions only, through `GET /v1/experience` |
| Approved aggregate (off) | `experience_interest` | Daily counts per destination: warm, hot, activated | Only `vg-interest-contribution/v1`, only when enabled |

Limits: 24 h retention, 3 journeys, 20 steps, 30 minutes per journey, 20 MB, chunks of 256 KB or 10 s, written at least every 2 s and at once when a link is activated or the page hides (`TRAIL_CONFIG.storage`).

### API

- `GET /v1/experience?url=` (site key): `vg-experience-page/v1`, this page's destinations (targets, titles, topic, item key, verified questions), its collections, and every page's id, kind, eligibility, title and paths. `Cache-Control: private, max-age=120`. 404 when the site's trail is off.
- `POST /v1/turn` gains an optional `hint: { source: 'trail-suggestion', destinationId, pageId?, trailStepId?, questionId? }`, validated at the gateway and used by the router only for a verified question (ADR-0038). Traced as `router.hint` (`agree`, `override`, `ignored`).
- `POST /v1/experience/contributions`: 404 unless `trail.aggregation.enabled` and `VG_TRAIL_AGGREGATION=on`.
- `/v1/session` returns `site.trail: { enabled, retentionHours, excludePaths, privateSelectors, topOffset, aggregation }`.

## 7. Bundles (ADR-0035)

`guide.js` gets a gate only (loads `trail.js` 600 ms after start-up on sites with the trail on). `trail.js` has no rrweb; `trail-record.js` loads after consent on an eligible page; `trail-replay.js` when a preview opens. Budgets in `tests/unit/sdk-size.test.ts`; measurements in HANDOFF §3.

## 8. Retention and deletion

| Data | Retention | Deleted by |
|---|---|---|
| Local journeys | 24 h from the journey's start (`trail.retentionHours`), plus count and size limits | Expiry and eviction on every start and every 30 s while recording; "Clear journey", "Clear all", "Turn off"; clearing site data in the browser |
| Consent record | Until changed | "Turn off" sets `off`; clearing site data removes it |
| Experience profiles | Kept like knowledge versions | Activation moves the pointer; a profile for an inactive knowledge version is never served |
| Aggregate counts (off) | `VG_TRAIL_AGGREGATE_RETENTION_DAYS` (90) | `purgeExpired` on the gateway's 10-minute cycle |

## 9. Threat model

| Threat | Mitigation | Verified by |
|---|---|---|
| Recording personal data | Consent first; public pages only (path, knowledge kind, private-field check every 2 s); inputs masked to empty and their events ignored; private, account, payment and form regions blocked; guide, cookie banner and accessibility widget blocked | `tests/unit/trail.test.ts` (policy), `tests/e2e/trail.e2e.test.ts` (typed text never stored, guide never stored, checkout never stored) |
| An in-app route to a private page recorded before it is noticed | Every event is checked against the step's path; after a move to an ineligible route, events are dropped, never written | e2e "private pages" |
| Replay running script or navigating | Sanitizer (scripts, handlers, `javascript:`, frames, objects, base, refresh, link targets, form actions); rrweb's `allow-same-origin`-only sandbox; CSP meta; `pointer-events: none` | `tests/unit/trail.test.ts`, `tests/integration/trail-browser.test.ts` (adversarial recording in Chromium) |
| Replay calling out (trackers, credentialed requests) | Only same-origin, query-free static assets, fetched with `credentials: 'omit'`, no referrer, as `blob:` copies; everything else removed | same, with a tracker server that must see zero requests |
| Upload of journeys | No code path sends layer A; aggregation off and whitelist-built | e2e scans every request body |
| A chip used to steer the router to an unsafe action | The hint only counts for a verified question whose text matches; never routes to the agent; commit guard unchanged | `tests/unit/experience.test.ts`, `tests/integration/experience.test.ts` |
| Shared or stolen device | 24 h retention, one-tap clear, turn off clears every tab | e2e "pause, resume and revocation" |
| Inflated aggregate | Off by default; strict schema; rate limit; cohort threshold; no identifiers (so independence cannot be proven: one reason it stays off until D2) | `tests/integration/experience.test.ts` |

## 10. Cross-origin

See ADR-0039: same-origin journeys only; other origins appear as boundaries; nothing is uploaded to join them.

## 11. Acceptance

1. No recording, storage or recorder code before consent; recording after consent on eligible pages only.
2. Pause, resume, clear, clear all and turn off work, in every tab.
3. Inputs, the guide and private pages never appear in stored events.
4. A call to action ends one step and starts the next with its source; Back is a history step; another origin is a boundary.
5. Opening a step reads only that step's chunks; scrubbing moves forward and back; the end of a step shows where it led.
6. Explored items are known, deliberate, diverse, at most three, with up to three verified questions each.
7. A chip calls the existing turn pipeline with its hint; the router plans deterministically; the guide reveals, spotlights and answers; no chat window opens; without speech the existing panel shows the answer.
8. No replay data in any request; aggregation off.
9. Keyboard only, touch, Arabic RTL and reduced motion work as in §3.
10. Recorder or replayer failure, corrupt chunks and full storage leave the site and the guide working.
11. The adversarial recording cannot run, navigate, submit or call out.

All eleven are automated in the tests named in §9 and in `tests/e2e/trail.e2e.test.ts` (the SDK's built-in sheet, fixture site). The hosted journey in the Pocket (§3a) is tested on Vodafone pages in `tests/e2e/pocket-journey.e2e.test.ts`: frosted non-modal layer, staggered entrance, slider by pointer, touch and keys, reduced motion, Escape order, the sandboxed memory, a chip's verified hint, nothing recorded leaving the browser, and the Pocket without the guide.
