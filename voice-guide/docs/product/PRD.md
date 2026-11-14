# PRD: Vodafone voice guide, live-site demo

| | |
|---|---|
| Status | Ready for build (phase 2: Vodafone live) |
| Date | 2026-10-23 |
| Owner | Bahaà Addin Balashoni (AIXC) |
| Builds on | The working demo build in this directory (ADR-0006 to ADR-0025, 68 passing tests) |
| Build prompt | [`docs/prompts/vodafone-live-demo.prompt.md`](../prompts/vodafone-live-demo.prompt.md) |
| Related | [JTBD](JTBD.md) · [Demo script](demo-script.md) · [Specs](../specs/) · [Tasks](../tasks/TASKS.md) · [Live site audit](../reference/vodafone-live-site-audit.md) |

## 1. Summary

A voice guide that works on the **real Vodafone Egypt website**. A person presses a red microphone button, asks out loud in Egyptian Arabic or English, and sees their words appear word by word in a small black bar above the button, with a live wave of their voice. The guide then takes them to the answer on Vodafone's own pages: it navigates, opens tabs, scrolls, spotlights the answer, and reads the live value aloud. It works from **any starting page** and keeps the conversation as the person moves between the marketing pages, the logged-in web app and the online shop. Its knowledge of the site **stays in step with the live website**. Everything it draws looks like Vodafone made it.

## 2. Problem

- The site spans three kinds of page: Liferay CMS pages, an Angular app under `/spa/`, and a separate shop origin. Each has its own navigation, and answers hide behind tabs, accordions and image banners (audit §1, §9). Finding a price or a setting takes several clicks and some knowledge of how Vodafone organises its site.
- The first demo build proved the platform on fixture pages. The open questions are whether it holds up on the real site, which changes weekly, and whether talking to it feels natural.

## 3. Goals and non-goals

### Goals (this phase)

| # | Goal | Measured by |
|---|---|---|
| G1 | The full demo script runs on real Vodafone pages, from any start page | 3 consecutive rehearsals with 8/8 moments correct (§9) |
| G2 | Voice feels instant and alive | first word on screen p50 ≤ 1.0s after speech starts; word render p95 ≤ 50ms; waveform at 60fps |
| G3 | The knowledge base follows the live site without manual work | A sync after a real site change activates on its own, with no wrong destinations in the demo flow |
| G4 | It looks like Vodafone | Brand review sign-off by Vodafone's digital team, plus the SPEC-01 checks |
| G5 | The next agent or engineer can continue without us | Handoff, agent rules and tasks complete; a new agent session reaches its first green task with no questions beyond the open ones in §12 |

### Non-goals

- Production rollout to customers (needs D1, D2 and a security review).
- Remembering people across visits (needs consent and a privacy review).
- Completing purchases, payments, subscriptions or transfers for the person. The guide always stops before a commit point.
- Native app (Ana Vodafone) integration.
- Changing Vodafone's pages or replacing the accessibility widget.

## 4. Users

Detailed in [JTBD](JTBD.md).

| Who | In this phase |
|---|---|
| Vodafone Egypt customers and prospects, Arabic first, mostly on mobile | Represented by the presenter in the demo |
| Customers who struggle with menus: older people, low digital confidence, visual impairment | The reason voice first matters |
| Vodafone's digital, brand and CX leadership (the demo audience) | Decide whether to pilot |
| Vodafone web team | Would own the tag in production |
| Our engineers and coding agents | Build and run it |

## 5. Requirements

Priority: **M** must for the demo, **S** should, **C** could.

### R1: Vodafone design language everywhere ([SPEC-01](../specs/SPEC-01-vodafone-design-language.md))

| ID | Requirement | P |
|---|---|---|
| R1.1 | Every element the guide draws uses the fixed Vodafone tokens (red `#e60000`, dark red `#990000`, text `#333`, background `#f4f4f4`, 6px radius, Vodafone shadows) | M |
| R1.2 | Text uses Vodafone fonts by the language of the text (`vodafone-regular-ar` / `-en`, bold and light); never Times, including on `/spa/` pages | M |
| R1.3 | The existing panel, bubble, spotlight, toasts and X-ray keep their behaviour and are restyled with the tokens | M |
| R1.4 | The guide never restyles the page | M |
| R1.5 | Guide text meets WCAG 2.2 AA contrast | M |

### R2: Real pages, start anywhere, keep state across the site ([SPEC-03](../specs/SPEC-03-live-site-integration.md), [SPEC-05](../specs/SPEC-05-continuity-and-memory.md))

| ID | Requirement | P |
|---|---|---|
| R2.1 | Runs on real `web.vodafone.com.eg` CMS pages (`/en/`, `/ar/`), `/spa/` pages and `eshop.vodafone.com.eg`, through the demo browser (mode B) and ready for the Tealium tag (mode A) | M |
| R2.2 | Any page can be the start page; "what's on this page?" works on all seed pages | M |
| R2.3 | One conversation continues across CMS ↔ SPA (including route changes without reloads) ↔ shop | M |
| R2.4 | The session remembers turns, the last item, language and plan progress; follow-ups like "subscribe to it" work | M |
| R2.5 | Lives alongside the accessibility widget and OneTrust without covering or changing them | M |
| R2.6 | Never presses commit points; never types credentials, OTPs, card numbers or national IDs; masks personal data | M |
| R2.7 | Offline fallback on the team's clone pages | S |

### R3: Knowledge base in step with the live site ([SPEC-04](../specs/SPEC-04-live-knowledge-sync.md))

| ID | Requirement | P |
|---|---|---|
| R3.1 | Crawl scope = seeds plus pages linked from them, minus excludes; the sitemap supplies `lastmod` | M |
| R3.2 | Incremental runs every 2 hours by `lastmod` and content hash; full run nightly; on-demand command | M |
| R3.3 | Language from the path; English and Arabic paired by path; `/spa/` pages rendered | M |
| R3.4 | Gated automatic activation (integrity, seeds present, churn, evaluation, smoke replay); otherwise hold with a report | M |
| R3.5 | Polite crawling (rate limits, robots, back-off, stop on bot challenge); scheduled runs only after Vodafone's approval | M |
| R3.6 | Keep 10 versions; rollback command; `kb.sync` traces and reports | S |
| R3.7 | Vodafone router evaluation set: 50 real requests per language, 20 held out | M |

### R4: Voice first ([SPEC-02](../specs/SPEC-02-voice-first-ui.md))

| ID | Requirement | P |
|---|---|---|
| R4.1 | The floating button is a red Vodafone-style microphone (64px, white ring, red glow) stacked above the accessibility button; one press listens | M |
| R4.2 | A small black bar above the microphone shows the transcript **word by word in real time**: new words animate in, revised words change in place | M |
| R4.3 | A **live waveform** driven by the real microphone signal, plus an audio-reactive halo on the button, at 60fps | M |
| R4.4 | States: idle, permission, listening, thinking, speaking, error, unsupported; barge-in; press-and-hold; Esc to cancel | M |
| R4.5 | Accessible: real buttons, final transcript announced, reduced motion respected, follows the widget's text size | M |
| R4.6 | Fallbacks: typing panel when permission is denied or speech is unsupported; event-driven animation when the microphone can't be shared | M |
| R4.7 | Contextual biasing with Vodafone product names, and on-device recognition where available | S |

### R5: Repository setup for agents and people (this branch)

| ID | Requirement | P |
|---|---|---|
| R5.1 | Branch `feature/voice-guide-vodafone` with the `voice-guide/` directory | M (done) |
| R5.2 | PRD, JTBD, specs, ADRs, diagrams, tasks, test plan, runbook, risk register, glossary | M (done) |
| R5.3 | Agent rules (`AGENTS.md`, `CLAUDE.md`), complete handoff, build prompt | M (done) |
| R5.4 | CI workflow for typecheck, unit, integration and end-to-end tests | S (done, first run pending) |

## 6. Experience

The walk-through with exact requests and fallbacks is the [demo script](demo-script.md). In short:
1. Arabic, by voice, from the home page: the cheapest internet bundle, on another page behind a tab, read live.
2. "Subscribe to it": into the logged-in app, stopping before confirmation.
3. English: the nearest store (an SPA route change, no reload).
4. "What does this banner say?": a picture with its text inside it.
5. The shop on another origin, same conversation.
6. A request the knowledge base can't plan, done by the fallback agent.
7. "Tell me when the offers change": page watch.
8. "Stop".

## 7. Non-functional requirements

| Area | Requirement |
|---|---|
| Performance (live site, demo machine, public gateway) | Microphone ready (listening) ≤ 300ms after the press once permission is granted; word render p95 ≤ 50ms; server time per request p95 ≤ 150ms; first visible movement after the final words p50 ≤ 400ms; SDK main script ≤ 21 KB gzipped including the voice UI (20 KB until 2026-11-13, ADR-0057); no layout shift caused by the guide (CLS contribution 0); no SDK long task > 50ms on page load |
| Reliability | Every SDK error is caught; the page never breaks because of the guide; a gateway outage turns the guide into a polite "not available right now" |
| Privacy | Values never stored; masking before content leaves the browser; traces retained 7 days; speech engine choice and consent category signed off by Vodafone's data protection owner before any customer exposure |
| Security | Site key and origin checks; signed agent tokens; rate limits (ADR-0022); demo browser profile used only for the demo; no secrets in the repository |
| Accessibility | Guide UI to WCAG 2.2 AA; works with keyboard only; does not hide the accessibility widget |
| Browsers | Chrome and Edge desktop (latest two); Chrome Android (latest two); Safari iOS with typing fallback and Safari's own speech recognition where available |
| Languages | Egyptian Arabic and English, switchable mid-conversation |

## 8. Dependencies

| ID | Dependency | Needed for | Owner |
|---|---|---|---|
| D1 | Vodafone web team adds the Tealium tag (testers only) | Mode A, audience phones | Vodafone digital |
| D2 | Data protection decision: speech engine (server vs on-device), consent category, trace retention | Any customer exposure; pilot | Vodafone DPO |
| D3 | Written approval to crawl production on a schedule, and the crawler IP allowlisted | Scheduled sync (R3.2) | Vodafone digital and security |
| D4 | Public HTTPS hostname and certificate for the gateway | Demo browser on live pages | Our team |
| D5 | A demo customer account (no real customer data) | Moments 2 and the account part | Vodafone |
| D6 | Keys: Jev or Laya, vision model, agent LLM | Better routing, picture descriptions, fallback agent | Our team |
| D7 | Demo machine: Chrome, a good microphone, wired network, speakers | Stage | Our team |

## 9. Success metrics for the demo

| Metric | Target |
|---|---|
| Demo moments correct in a rehearsal on the live site | 8/8, three rehearsals in a row |
| Commit buttons pressed by the guide | 0 |
| Router accuracy on the Vodafone held-out set | ≥ 85% fully correct, ≥ 95% right destination |
| First word on screen after speech starts | p50 ≤ 1.0s, p95 ≤ 1.8s |
| Requests answered without an LLM (demo flow) | ≥ 6 of 8 |
| Sync on the live site | 0 integrity errors; activates automatically after a real change |

## 10. Risks

The full register is [`docs/qa/risk-register.md`](../qa/risk-register.md). The top five:
1. Bot protection blocks the crawler or the demo browser.
2. The live site changes the day before the demo.
3. Egyptian Arabic recognition errors on stage (noise, accents).
4. No approval to crawl production in time.
5. Local network rules or mixed content stop the gateway calls (use a public HTTPS gateway).

## 11. Milestones

| Milestone | Content | Tasks |
|---|---|---|
| M0 Setup | This branch: docs, agent rules, configs, CI | Done |
| M1 Brand and voice | Vodafone theme, microphone, transcript bar, waveform, on fixtures | E1, E4 |
| M2 Live pages | Demo browser, SPA routes, shop handoff, coexistence, safety | E3, E5 |
| M3 Live knowledge | Sync job, path pairing, gate, Vodafone evaluation set | E2 |
| M4 Show | Demo script on the live site, rehearsals, recording, runbook | E6, E7 |

## 12. Open questions

| # | Question | Default until answered |
|---|---|---|
| Q1 | The guide's name and persona: TOBi, or a new name? | "Vodafone guide" / "مساعد ڤودافون" |
| Q2 | Should the microphone eventually live inside Vodafone's accessibility widget? | Separate button stacked above it |
| Q3 | Is the browser's server speech engine acceptable, or must recognition be on-device or on a Vodafone-approved provider? | `onDevice: prefer`; demo only |
| Q4 | Which OneTrust category does the guide belong to? | Testers only |
| Q5 | Which pages are in the pilot? | The seeds in `config/sites/vodafone-eg.yaml` |
| Q6 | Does the shop get the tag in mode A? | Yes in the demo browser; ask Vodafone for mode A |
| Q7 | Where does login happen (same origin or an identity domain)? | Re-verify on the live site with the demo account |
| Q8 | Do audience members try it on their own phones? | No (needs D1) |
