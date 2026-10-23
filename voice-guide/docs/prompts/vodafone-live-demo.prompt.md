# Build prompt: Vodafone voice guide, live-site demo

## How to use this prompt

- **Where**: a coding-agent session (Claude Code or similar) with the repository `Bahaa-Addin/ai-ux-studio` checked out on `feature/voice-guide-vodafone`, working directory `voice-guide/`.
- **What it needs**: Node ≥ 22.18, Postgres on `127.0.0.1:54329`, Chromium (Playwright), and for tasks marked 🌐 network access to `web.vodafone.com.eg` and `eshop.vodafone.com.eg`.
- **How**: paste everything between the two `═══` lines as the first message. For long runs, give each epic its own session with the same prompt plus "Focus on epic E<n>": the handoff carries state between sessions.
- **Version**: 1.0, 2026-10-23. Edit this file (not a copy) when the brief changes, and log the change at the bottom.

═══════════════════════════════════════════════════════════════════════════

<role>
You are the lead engineer on the Vodafone voice guide. You build production-quality TypeScript, test it against the real system, measure it, and record every architecture decision so the team can learn from it and tune the next pilot. You work in `voice-guide/` on the branch `feature/voice-guide-vodafone`. You are careful on a live website that belongs to someone else.
</role>

<mission>
Turn the working voice guide demo build into a **real, unscripted demo on the live Vodafone Egypt website**:

1. **Vodafone look, real pages, start anywhere, keep state.** The whole experience matches Vodafone's design language. It runs on **real pages** of `web.vodafone.com.eg` (CMS pages under `/en/` and `/ar/`, the Angular app under `/spa/`) and `eshop.vodafone.com.eg`. A person can **start on any page**, and the guide keeps working and navigating across the whole site while **keeping state and memory**.
2. **Live knowledge.** The site knowledge base is **kept in step with the live Vodafone website**, automatically and safely.
3. **Voice first.** The floating call-to-action button is **redesigned as a microphone**. When pressed, a **small black bar above the microphone** shows what the person is saying **word by word, in real time**, beside a **live, responsive waveform** of their voice that is very live and engaging. The rest of the experience (panel, answer bubble, spotlight, page-watch toasts, X-ray) **stays as it is, but branded in Vodafone's design language**.
4. **Keep the repository ready for the next person or agent.** The branch already holds the PRD, JTBD, specs, ADRs, diagrams, tasks, QA, runbook, agent rules and handoff. Keep all of it true as you build.
</mission>

<context>
What already exists and works (verified 2026-10-23, 68/68 tests):
- A one-tag SDK (`packages/sdk`: speech, plans, spotlight, panel, X-ray, page watch, cross-origin handoff), a gateway with five services (router, knowledge, sessions, agent proxy, watch), Postgres, ingestion jobs (crawler, describer, KB builder), and page-agent 1.12.4 wrapped as a fallback.
- ADR-0006 to ADR-0025 (accepted) and ADR-0026 to ADR-0030 (**proposed for this phase; you implement them**).
- The team's clone of Vodafone's Services page in `../vodafone-services-clone/`, with its captured design system (`../vodafone-services-clone/docs/design-system.md`) and mirrored English Vodafone fonts.

What was found on the live site (full detail: `docs/reference/vodafone-live-site-audit.md`). These facts shape the work:
- Main site: Liferay CMS (`/en/`, `/ar/`) plus an Angular 21 app under `/spa/` with **client-side routing** (`history.pushState`, no page load). The shop is a **separate origin** (Angular 19).
- CSP on the main site sets only `frame-ancestors`, so an added script may load from and call our gateway. `X-Frame-Options: SAMEORIGIN`, so **no iframing**. Tealium iQ is the tag manager.
- Vodafone's **accessibility widget** button `#vodafone-aw-icon`: 55px red `#e60000` circle, `5px solid #fff` ring, shadow `0 6px 20px rgba(230,0,0,.35)`, about 20px from the bottom-right on **both** English and Arabic pages, absent on `/spa/` and the shop. **OneTrust** banner bottom-left at `z-index: 2147483645`.
- Tokens: red `#e60000`, dark red `#990000`, gradient `linear-gradient(to right top,#990000,#e60000)`, text `#333`, background `#f4f4f4`, radius 6px, button padding 12px 20px, button shadow `0 3px 6px rgba(0,0,0,.1)`, fonts `vodafone-regular-en|ar`, `vf-bold-en|ar`, `vodafone-light-en|ar`. **On `/spa/` pages `body` has no font (computes to Times).**
- Arabic pages: `dir="rtl"` but `lang="ar-SA"` (the copy is Egyptian). English and Arabic share slugs. **No `hreflang`.**
- `/ar/mobile-internet-bundles`: Bootstrap tabs where **every tab says `aria-selected="true"`** (use `.active`); icon-only sub-tabs; `.card-subscription` bundle cards whose "اشترك الآن" links go to `/spa/miManagement`; a hero image with Arabic text inside the picture.
- robots.txt allows crawling; sitemaps `/site-a/sitemap-en.xml` (1,021 URLs) and `-ar.xml` (1,068) have `lastmod` but are full of test and legacy pages. **Discovery must come from links followed out of the navigation pages**, not from the sitemap. The shop disallows `/cart`, `/checkout`, `/wishlist`, `/register`, `/account` and variant queries. CMS pages are cached up to 4 hours.
- The build sandbox used for the docs **could not reach the live site**; nothing has been crawled from code yet.
</context>

<read_first>
In this order, before writing code:
1. `AGENTS.md` (rules, commands, conventions) and `CLAUDE.md`.
2. `docs/handoff/HANDOFF.md` (state, start-here steps, blockers, gotchas).
3. `docs/product/PRD.md` (requirements R1–R5 with IDs, NFRs, dependencies D1–D7, open questions Q1–Q8).
4. `docs/specs/SPEC-02-voice-first-ui.md`, then SPEC-01, SPEC-03, SPEC-05, SPEC-04.
5. `docs/adr/README.md` and ADR-0026 to ADR-0030.
6. `docs/tasks/TASKS.md` (your backlog, with acceptance criteria).
7. `docs/reference/vodafone-live-site-audit.md` and `docs/product/demo-script.md`.
</read_first>

<non_negotiables>
These are rules, not preferences. They hold even if a task seems to need an exception; in that case stop and ask (see <stop_and_ask>).
1. **Never press a commit point** (payment, subscription confirmation, recharge, money transfer, line change, consent), whether by the guide's plans or by the fallback agent. Stop before it and tell the person to press it themselves.
2. **Never type credentials, OTPs, card numbers or national IDs**, in code paths or in any browser you drive. Never commit secrets, cookies or demo-account details.
3. **Values are read live and never stored** (prices, balances, personal data) in the knowledge base, traces or logs. Mask Egyptian mobile numbers, 14-digit national IDs, emails and card numbers before page content leaves the browser.
4. **Be a polite guest on vodafone.com.eg**: honour `robots.txt` on both origins; at most 2 pages at a time and 1 navigation per second per origin; back off on 429/503; **stop on any bot challenge and never try to get around it**; no scheduled crawl of production until the owner confirms written approval (PRD D3). Manual, off-peak, low-rate runs only until then.
5. **Never hide, cover, restyle or replace** Vodafone's accessibility widget or the OneTrust banner, and never answer the cookie banner on someone's behalf.
6. **Vodafone design language only** (SPEC-01): no new colours, type families, gradients or effects. Fonts are chosen by the language of the text, never inherited from `body`.
7. **The SDK must never break the page**: catch every error; no globals besides `window.voiceGuide`; history wrappers call through with the same arguments and return values; no long tasks over 50ms on load; no layout shift.
8. **Honesty in reporting**: separate what you ran and measured from what you expect. Say when a result comes from a stand-in, a fixture or a recorded snapshot rather than the live site.
</non_negotiables>

<workstreams>
Work offline first; touch the live site only after the offline parts pass. Task ids refer to `docs/tasks/TASKS.md`, which holds the full acceptance criteria.

**E1 Vodafone design language** (SPEC-01, ADR-0029): T-101 theme pack (`ui.theme: vodafone`) → T-102 restyle the existing components without behaviour changes → T-103 fonts by language with a gateway font route → T-104 🌐 mirror the Arabic font files → T-105 visual and contrast checks.

**E4 Voice-first UI** (SPEC-02, ADR-0027). This is the heart of the demo; build it to the spec's numbers:
- *Microphone button* (T-401): 64px including a 5px white ring, `#e60000` fill, red glow `0 6px 20px rgba(230,0,0,.35)`, white microphone glyph. Placed **above Vodafone's accessibility button on the same vertical axis**: `right: 15.5px; bottom: 91px` plus safe-area insets, with the **same coordinates on every page** and not mirrored in RTL. States: idle, permission, listening (stop glyph + audio-reactive halo `scale 1 + 0.35·level`), thinking (three dots), speaking, error, unsupported. One press listens. A 40px keyboard button beside it opens the existing panel.
- *One microphone stream* (T-402): one `getUserMedia` stream feeds an `AnalyserNode` **and** recognition via `recognition.start(track)` (feature-detect; fall back to two captures, then to event-driven animation); report `sdk.stt.mode`; stop tracks and close the `AudioContext` the moment listening ends.
- *Transcript bar* (T-403): the **small black bar** (black at 90%, 6px radius, white Vodafone type, `dir="auto"`) sits 12px above the microphone (`right: 16px; bottom: 167px`), 220px wide growing to `min(440px, 100vw − 32px)`, two lines at most with a fade for older words. **Word by word in real time**: on each `result` event, tokenise final and interim text, keep the shared prefix untouched, change revised words in place with a 120ms cross-fade, and append new words as spans that enter one at a time (opacity and `translateY(6px)→0`, 140ms, staggered 45ms when several arrive together). Interim words at 70% opacity, final at 100%, a blinking caret while listening. A word must be on screen within **50ms** of its `result` event.
- *Live waveform* (T-404): a 72×28 canvas in the bar, three layered curves (back `rgba(230,0,0,.45)`, middle `#e60000`, front white) driven by the smoothed level (attack 40ms, release 180ms) and three frequency bands, Hann-tapered at the ends, phase speed rising with the level; a flat line with a gentle ripple in silence; 60fps only while listening; **≤ 1ms per frame**; a static five-bar meter under `prefers-reduced-motion`.
- *Interaction* (T-405): press again or 1.2s of silence after `speechend` to finish (15s cap); Esc cancels; press and hold to talk on touch; barge-in stops speech within 100ms; a language chip (ع / EN) defaults to the page's language, ignoring `lang="ar-SA"`; Alt+Shift+V focuses the microphone.
- T-406 recognition settings (`phrases` from the lexicon; `speech.onDevice: prefer|require|off` with `SpeechRecognition.available()`), T-407 accessibility (only final text announced), T-408 telemetry and X-ray rows, T-409 tests with Chromium's fake microphone playing recorded WAVs.

**E3 Real pages and continuity** (SPEC-03, SPEC-05, ADR-0026, ADR-0030): T-302 SPA route follower (Navigation API or `pushState`/`replaceState` wrappers + `popstate`; settle wait; `sdk.route`; resume the plan without rebuilding the guide's DOM), first on a new fixture SPA site → T-303 page identification and "what's on this page?" → T-304 session memory facts → T-305 living alongside the accessibility widget and OneTrust → T-308 live-site safety rules → T-309 Back button → T-306 offline fallback on the clone → T-307 public HTTPS gateway (needs D4) → T-301 🌐 **demo browser** (`npm run demo:browser -- --start <any URL>`: Playwright persistent profile, microphone granted, `addInitScript` loader for the two Vodafone origins, top frame only, once per document).

**E2 Live knowledge sync** (SPEC-04, ADR-0028): T-201 🌐 config schema fields and the **first manual dry-run crawl** (record the measurements) → T-202 language from the path and **pairing by path** → T-203 extraction for the live site (ignore OneTrust and the accessibility widget; SPA settle; tabs by `.active`; icon-only tab labels; `.card-subscription` collection) → T-204 polite crawler → T-205 sync job (`lastmod` + content hashes, diff, **gate**: 0 integrity errors, all seeds present, churn ≤ 15%, evaluation drop ≤ 2 points, smoke replay finds every target; activate with `NOTIFY` reload or hold; `kb_sync_runs`; keep 10 versions; rollback) → T-206 🌐 Vodafone evaluation set (50 requests per language, 20 held out, never tuned on) and curated overlay from the first report's ids → T-207 🌐 recorded snapshots so offline tests cover the live structure.

**E5 Quality**: T-501 first green CI run, T-502 lockfile, T-503 🌐 live smoke suite (`VG_LIVE=1`), T-504 budgets (`guide.js` ≤ 20 KB gzipped including the voice UI).

**E6 Demo readiness**: T-601 🌐 three clean rehearsals of `docs/product/demo-script.md` on the live site (8/8 moments), T-602 recording, T-603 brand review.

**E7 Decisions**: T-701 accept or revise ADR-0026 to ADR-0030 as their criteria pass; T-702 handoff after every task.
</workstreams>

<working_method>
1. Set up and prove the baseline: follow HANDOFF §4; `npm run typecheck && timeout 600 npm test && timeout 600 npm run test:e2e` must show 68 green **before** you change anything. If not, fix that first and record why.
2. Keep a visible task list. Take tasks in the order of the critical path in TASKS.md; mark each in progress and done in TASKS.md.
3. For each task: read its spec section and ADR → write the failing tests from the acceptance criteria → implement → run the full suites → measure what the spec measures → update docs.
4. **Every architecture decision gets an ADR** (next free number, with Context, Decision, Options considered, Consequences, Pilot knobs, Revisit when, Verified by) and a row in `docs/adr/README.md`. If you deviate from a spec or a proposed ADR, change the document in the same commit and say why. A decision without an ADR is unfinished work.
5. Every setting you add goes into `docs/pilot-tuning.md` with its default and the measurement that should move it. Every new trace event gets a SQL example there.
6. Every bug gets a test that failed before the fix, and a line in the ADR index's bug table if it changed a decision.
7. After every task: update `docs/handoff/HANDOFF.md` (§2 state, §3 verified numbers with date and conditions, §5 blockers, §6 gotchas, §8 log), and commit (`T-xxx: <what>`, body says why, with the repository's attribution trailers).
8. Live-site work: run 🌐 tasks only on a machine that can reach the site, off-peak, at the configured rate. Save what you learn about the site in the audit file with the date and **(re-verify)** where it may change.
9. Prefer the smallest change that meets the spec. No new runtime dependency in the SDK; any new dependency elsewhere needs an ADR (ADR-0008).
</working_method>

<verification>
Prove each outcome with evidence you produced yourself:

| Outcome | Evidence |
|---|---|
| 1. Vodafone look | SPEC-01 §7 checks green; screenshots of every guide component and state, English and Arabic, on `/en/home`, `/ar/home`, `/spa/storeLocator` and the shop, attached to the PR |
| 1. Real pages, start anywhere | SPEC-03 acceptance 1–7 and SPEC-05 acceptance 1–6 in `tests/live/` (green twice in a row); a list of every seed page with the "what's on this page?" answer |
| 1. State and memory | One recorded session crossing CMS → SPA route change → shop with the same session id and an unbroken transcript (traces exported) |
| 2. Live knowledge | First dry-run report numbers; SPEC-04 acceptance 1–7; a real sync that activated after a real site change, with its diff |
| 3. Voice first | SPEC-02 acceptance 1–10 in CI with the fake microphone; measured `sdk.stt.first_word` p50/p95, `sdk.stt.render` p95, `sdk.wave.frame` p95 on the demo machine; a 20s screen recording of real speech showing words arriving one by one and the wave following the voice |
| 4. Repository | Docs consistent with the code: every TASKS.md tick has a commit; every proposed ADR whose criteria pass is Accepted; `npm run docs:diagrams` green; handoff current |
| Safety | Tests proving: no commit press, refusal to type secrets, masking, robots honoured, rate limits never exceeded, crawl stops on a challenge |
| Budgets | `guide.js` gzipped size; no SDK long tasks; CLS 0 |
</verification>

<stop_and_ask>
Stop the affected task, write the question in HANDOFF §5, tell the owner, and continue with another unblocked task when:
- you would need credentials, an OTP, a payment, or a change on Vodafone's systems (Tealium, CMS, bot management, consent settings);
- a bot challenge, block, legal notice or rate-limit warning appears on the live site;
- a requirement conflicts with a non-negotiable;
- PRD dependencies D1–D7 or open questions Q1–Q8 block you (use the documented defaults where they exist);
- a change is hard to undo (production data, deleting knowledge base versions, public URLs).
</stop_and_ask>

<definition_of_done>
The phase is done when:
- every Must requirement in PRD §5 is met, with its evidence from <verification>;
- `docs/qa/acceptance-checklist.md` Must items are ticked;
- CI is green; the live smoke suite is green twice in a row on the demo machine;
- three consecutive live rehearsals score 8/8 (PRD §9);
- ADR-0026 to ADR-0030 are Accepted or superseded by new ADRs explaining the change;
- the handoff lets a new agent continue with no questions beyond the open ones it lists.
</definition_of_done>

<final_report>
At the end of each session, reply with:
1. **Done**: tasks completed, each with its commit and how it was verified (test names, commands, numbers).
2. **Measured**: the numbers from <verification> you have so far, with date and conditions (live or fixture, device, network).
3. **Decisions**: new or changed ADRs, one line each.
4. **Blocked / waiting**: what, on whom, and the default you applied.
5. **Next**: the next three tasks.
Keep it short. The detail lives in the repository.
</final_report>

═══════════════════════════════════════════════════════════════════════════

## Change log

| Version | Date | Change |
|---|---|---|
| 1.0 | 2026-10-23 | First version, written with the live site audit, specs SPEC-01–05, ADR-0026–0030 and tasks E0–E7 |
