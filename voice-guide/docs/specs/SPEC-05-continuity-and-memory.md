# SPEC-05: Start anywhere, keep state and memory across the whole site

- Status: Ready to build
- Requirement: PRD R2 ("we can start anywhere, but the tool keeps working and navigating while maintaining state and memory throughout the website")
- Decisions: ADR-0016 (sessions across pages and origins), [ADR-0030](../adr/0030-sdk-follows-spa-route-changes.md) (SPA routes)
- Diagram: [cross-page continuity](../diagrams/04-cross-page-continuity.md)

## 1. Start anywhere

On any page that has the tag (or the demo browser's loader):

1. The SDK starts a session, or resumes one from `sessionStorage` or a `#vgh=` handoff token.
2. It identifies the page by URL: exact match on KB page variants, then the redirect alias, then `/spa/` route patterns, then the longest path prefix. The result goes into each request as `page.pageId` (or `null` if unknown).
3. **Unknown pages still work**: the router plans over the whole site's destinations (navigate there), and requests about the current page go to the fallback agent.
4. The greeting is not spoken on load; the microphone just appears. The first request may be about the current page ("what's on this page?", "إيه اللي في الصفحة دي؟"): the planner answers from the page's KB entry (title, sections, and the hero picture's description).

## 2. What is remembered, where, and for how long

| Memory | Example | Stored in | Lifetime |
|---|---|---|---|
| Conversation turns | the last 20 requests and replies | Server session (Postgres) plus the panel's `sessionStorage` copy | Session (60 min idle, `VG_SESSION_TTL_MIN`) |
| Last destination and last item | "the 37 EGP bundle" → "subscribe to it" | Server session `turns` (each turn keeps its destination; the router derives `last` from them) | Session |
| Plan cursor | step 3 of 5, waiting for `/spa/miManagement` | Server session, saved before any navigation | Until the plan ends |
| Agent progress | steps done on earlier pages | Server session `agent` | Until the task ends |
| Language | the person switched to English | Server session `lang` | Session |
| Watches | "tell me when the bundles change" | Watches table | Until removed or 3 missed checks (ADR-0023) |
| Preferences across visits | always answer in Arabic | **Not stored** in the demo. Needs consent and a privacy review (PRD non-goal) | |

New in this phase:
- `memory.facts` on the session: small key–value facts the planner can use, with the turn that set them. Examples: `interest: mobile-internet`, `budget: 100`, `item: web.mobile-internet-bundles.card-37`. Set by the planner from understood requests; never from page content. They feed retrieval hints and pronoun resolution ("the cheaper one", "الأرخص منها").
- The panel's history survives SPA route changes in memory and full page loads through `sessionStorage` (already true).

## 3. Moving between page types

| From → to | Mechanism | Continuity check |
|---|---|---|
| CMS → CMS (`/ar/home` → `/ar/mobile-internet-bundles`) | Full load. Cursor saved before the navigation; resumed from `sessionStorage` and the server | Exists today (ADR-0016) |
| CMS → SPA (`/ar/mobile-internet-bundles` → `/spa/miManagement`) | Full load into the Angular app | Same as above, plus the page id matches the route pattern |
| SPA → SPA (`/spa/myHome` → `/spa/miManagement`) | **No load**. Route change event (ADR-0030) | New: the plan continues after the view settles |
| `web` → `eshop` | Cross-origin. The guide adds `#vgh=<token>` to the link it follows; the shop's SDK redeems it (single use, 60s) | Exists today; needs the tag or the loader on the shop |
| New tab opened by the guide | Same handoff token | Exists today |
| New tab opened by the person | New session (by design: tabs are separate conversations) | |
| Back button | Pops to the previous page; any running plan is stopped and the guide says so once | New check |

## 4. Failure behaviour

- **Loop guard**: a step that resumes on three page loads in a row is stopped (exists).
- **Plan target missing** after navigation (the site changed): the executor tries the target's fallbacks (other selectors, text), then asks the fallback agent with the step as the task, then says it could not find it and offers the closest page. Reported as `sdk.step ok=false` with the selector, so the next sync's diff can explain it.
- **Session expired**: a new session starts, and the guide says nothing about the old one.

## 5. Acceptance criteria

1. Starting on each page in audit §8 (both languages), the request "what's on this page?" gets a correct one-sentence answer.
2. The request "cheapest internet bundle" from `/en/home`, `/spa/storeLocator` and `eshop.vodafone.com.eg/en/` reaches the same card on `/ar|en/mobile-internet-bundles` in the right language.
3. "Subscribe to it" after (2) carries the same item into `/spa/miManagement` and stops before any confirmation.
4. An SPA route change mid-plan continues the plan without re-creating the guide's DOM (same shadow host node before and after).
5. The panel history after visiting five pages across CMS, SPA and the shop shows every turn in order.
6. Pressing Back during a plan stops it with one spoken line, and the next request works normally.
