# ADR-0016: One conversation across page loads and origins: server sessions, a saved plan cursor, and single-use handoff tokens

- Status: Accepted (demo slice)
- Date: 2026-10-23
- Area: Session continuity
- Code: `services/sessions/handlers.ts`, `packages/sdk/src/guide.ts` (`start`, `#resumePlan`, `#resumeAllowed`)

## Context

Most answers live on another page, and the account answers live in the web app on another origin. A browser extension could keep state across all of this, but we will not ask customers to install one. Every page load starts the SDK from nothing; `sessionStorage` is per origin; cookies across our two origins would need a shared parent domain we do not control on the clones.

## Decision

1. **The session lives on the server** (Postgres, ADR-0010): language, last 20 turns, the last entity ("it"), the active plan with its cursor, the fallback agent's progress, and agent usage.
2. **Same origin:** the session id is kept in `sessionStorage` (tab-scoped, gone when the tab closes). The SDK sends it on load and resumes.
3. **Another origin:** before a `navigate` step marked `handoff`, the SDK asks for a token (128-bit random, single use, 60 s) and appends `#vgh=<token>` to the URL. The SDK on the other origin redeems it, gets the same session, and removes the fragment from the address bar. Fragments are not sent to servers or in `Referer`, so the token never lands in access logs.
4. **Plans resume where they stopped.** Before any step that may unload the page (`navigate`, `click`), the cursor is saved (with `keepalive`); the next page resumes from it. Plans older than 120 s are dropped.
5. **"It" is what the person saw.** When `pickItem` chooses an item on the live page, the SDK reports it; the session's last entity becomes that item, so "subscribe to it" is exact.
6. **Loop guard.** If the same plan step (or agent step count) resumes a third time in a tab, the SDK stops and clears the plan. This was added after the end-to-end run caught an agent click that reloaded the page and restarted the same step.
7. **The panel keeps the conversation:** the last 12 messages are kept in `sessionStorage` and shown again after a page load on the same origin; after a handoff the panel starts with the new answer.

## Options considered

| Option | Outcome |
|---|---|
| Browser extension | Rejected: installation. |
| Third-party cookie or shared parent-domain cookie | Rejected: browsers block third-party cookies; the clones' origins do not share a parent domain. |
| Session id in a query parameter | Rejected: lands in logs, analytics and `Referer`. A one-time token in the fragment avoids all three. |
| State only in the browser | Rejected: lost across origins; the server could not log or analyse turns. |

## Consequences

- One write per step to Postgres; fine at pilot scale (ADR-0010 lists the move to Redis).
- A session id is a bearer secret for that conversation; it is random, tab-scoped and expires after 60 idle minutes.
- The web app must load the same SDK tag; that is the same one-line integration.

## Pilot knobs

| Knob | Default | Effect |
|---|---|---|
| `VG_SESSION_TTL_MIN` | 60 | Idle lifetime of a conversation. |
| Handoff token lifetime | 60 s | `HANDOFF_TTL_SEC` in `services/sessions/handlers.ts`. |
| Plan resume window | 120 s | Gateway `/v1/session` and the SDK. |
| Resume loop limit | 2 resumes of the same point | `#resumeAllowed` in the SDK. |

## Revisit when

- Customers expect the conversation to survive closing the tab: move the id to `localStorage` with a shorter idle TTL, and say so in the privacy notice.
- The live website and web app share a parent domain: a first-party cookie can replace the handoff token.

## Verified by

- `tests/integration/gateway.test.ts`: resume by id, handoff once only, progress and the picked item feeding the next request, stale progress ignored.
- `tests/e2e/guide.e2e.test.ts`: same session id after page loads and after crossing to the web app; token removed from the address bar; loop guard; transcript restored.
