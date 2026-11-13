# ADR-0050: The trail host interface version 2: a host claims the journey at run time; the trail remembers what questions were about; a demo journey can be seeded; consent survives Vodafone's storage clear

- Status: Proposed (2026-11-13). Built in parts: the run-time claim, the fallback, the consent copy and the hostUrl removal in phase 3 of the live plan; the asked questions in phase 5; `seed()` and `reset()` in phase 7. Accepted when each part's checks pass
- Date: 2026-11-13
- Area: Exploration Trail (SPEC-06), journey host, privacy; amends ADR-0037 §1 (where consent is kept), ADR-0040 §1–2 (how a page hosts the journey), ADR-0046 §4 (the journey hosted in the Pocket on every page); supersedes ADR-0043 §2 (the host page chosen by language through `trail.hostUrl`); delivers ADR-0048 §2 (the host is claimed at run time, never declared by the loader)
- Owner decisions: 2026-11-10, one interface change, version 2, covering the run-time claim, what questions were about (the RED world revamp, `docs/wiki/Demo 5 revamp - personalization for an anonymous visitor.txt` Part A) and a consent-gated `seed()` for the demo kit; ADRs numbered in the order they are written, so this one takes 0050. 2026-11-13, where no page can host the journey it opens in the guide's own sheet

## Context

Version 1 (`packages/sdk/src/trail/host.ts`) lets a page that draws the journey in its own design drive the trail: the page declares itself with `<meta name="vg-trail-host" content="pocket">`, listens for `vg:trail-ready` (detail: the API, also published as `voiceGuide.trailHost`) and `vg:trail-open` (the person pressed "Your journey"), and calls `open`, `select`, `scrub`, `ask`, `allow` and the rest. Only the Services clone's HTML carries that meta. Measured or read on 2026-11-13 (`docs/reference/live-way2-phase3-map-2026-11-13.md`, "journey-host"):

- The trail decides once, in a read-only field, whether the page hosts the journey (`readonly hosted = !!document.querySelector(…)`, `controller.ts:136`). ADR-0048 §2 rejected a meta added by the loader: the layer can be off, fail or have no Pocket, and the pill would then send `vg:trail-open` to nobody, with no way for the layer's guard to undo it.
- On other pages the pill navigates to `trail.hostUrl` (`/{lang}/services#journey`, ADR-0043). On Vodafone's live pages nothing hosts the journey there, so the pill opens nothing. And because the pill treats a set `hostUrl` as "hosted" (`controller.ts:510`, `view.ts:497`), the guide's own sheet never shows.
- The clone's `journey.js` refuses any host whose `version` is not 1 (`journey.js:503`).
- The trail stores no question. The revamp needs what questions were about (never their words), per step.
- The demo kit (live plan §3.6) needs to load a sample journey after the person consents.
- Consent is a `localStorage` key (`vg-trail:<siteKey>:consent`, `consent.ts`). Vodafone's signed-out theme clears `localStorage` on every load of home, Services, RED and Vodafone Cash (O23), so consent is lost on the next page (T-806). The trail's own journey data is in IndexedDB (`vg-trail-v1`), which the theme does not touch.
- Any script on the page can call `voiceGuide.trailHost.allow()` and grant consent without a press (`controller.ts:569`).
- Room: `guide.js` 20,315 B gzipped of 20,480; `trail.js` 27,135 of 30,720 (`tests/unit/sdk-size.test.ts`, measured 2026-11-13).

## Decision

1. **One version, 2, a superset of version 1, all in `trail.js`.** `guide.js` gains nothing. `host.ts` carries a changelog. A host reads version 2 fields only when they are present; `journey.js` accepts `version >= 1`, and the version change and that `journey.js` change land in one commit.
2. **A host claims the journey at run time.** `claim()` returns a `release()` function, or `null` when another host holds it: one host at a time. Readers that only show journey facts (the RED world) subscribe and never claim. `hosted` becomes a live value that every reader uses. A claim made while the guide's sheet is open hands over (the sheet collapses, then `vg:trail-open`). A release collapses the journey, destroys its preview, empties the host's preview root and re-renders, so the pill works again at once. The clone's static meta counts as a claim that is never released, until phase 9 removes the clone. The experience layer claims on `vg:trail-ready` when its Pocket can host, and registers the release with its guard, so a failure of the layer gives the journey back.
3. **Where "Your journey" opens.** With a host, in the host (`vg:trail-open`). Without one (the `/spa/` app, the shop, `?aixc=off`, the layer off or failed), in the guide's own sheet (ADR-0038). `trail.hostUrl`, its `{lang}` code and the session flag that reopened the journey after the trip are removed. The pill never navigates.
4. **The step the journey opens on.** When a live page hosts, the current page (it is a real step of the visit). The clone keeps the step before the Services page, which is not a step of interest there, until phase 9.
5. **What questions were about (phase 5).** The trail wraps the guide's `request` in `trail.js` and records, from the plan's `meta` of each answered turn, one asked question on the current step: `{ id, at, lang, origin, destinationId, pageId, intent, route, label }`, at most 10 per step. Only while recording and on a page step; nothing when no destination was resolved; never the words said or typed, never the answer (live answers carry prices). The server adds `meta.pageId` and a price-free `meta.label` to the plan. `snapshot().asked` (newest first), `askAbout(destinationId, questionId?)` (resolved across every step and the page map) and `questionsFor(destinationId)` expose them. The consent copy says so: the trail keeps the pages visited, what was explored there and what the questions were about, never the words.
6. **A seeded journey (phase 7).** `seed(journey)` replaces the current journey with a sample one, only when all three hold: consent is granted, the call follows a press (`navigator.userActivation.isActive`), and the server's session says the page is a demo (`experiences.demos.demoKit`). The journey is validated with the trail's own parsers and limits, gets new session and step ids, and has its times moved to end now, within the 30-minute session limit. `reset()` clears the journey and returns consent to unset, for "Reset demo".
7. **Consent needs a press.** `allow()` from a host is honoured only after a press on the page. Any script can still read `voiceGuide.trailHost`; that is accepted for the owner's demos and recorded for the customer decision (PRD D2).
8. **Consent survives the theme's clear.** The consent record is also kept in the trail's IndexedDB. At start the trail reads `localStorage` and, when the key is missing, the IndexedDB copy, and puts the key back. A clear seen from another tab (a `storage` event with no key) is not a change of consent. Tabs tell each other about consent through a `BroadcastChannel`. "Turn off" and "Clear" remove both copies. `Storage.prototype` is never patched; the demo browser's `vg-` guard stays for replay only. Amends ADR-0037 §1.
9. **`ask()` finds the language** the same way the host does: the guide's language, then its first two letters.

## Consequences

- "Your journey" works on every page the layer runs on, opens in place, and falls back to the guide's sheet everywhere else; no pill is ever dead.
- A failure of the experience layer releases the journey; the next press opens the sheet.
- `trail.js` grows by the claim, the IndexedDB consent copy and, later, the asked questions and `seed()`: each part is measured against the 3,585 bytes left, and the budget is raised only on purpose.
- The clone and its tests keep working until phase 9, through the meta.
- With `seed()` a demo can start with a journey, but only after a person consents and presses; a page script cannot seed one.
- The trail keeps one more kind of thing (what questions were about). The consent copy and its e2e check change with it.

## Pilot knobs

- At most 10 asked questions per step.
- `experiences.demos.demoKit` (site config): whether `seed()` is allowed at all.

## Revisit when

- Customers (PRD D2): whether page scripts may read the host interface at all, and the consent copy.
- The layer moves to Vodafone's tag manager (Mode A): the claim timing and the consent copy in IndexedDB.
- Phase 9 removes the clone: the static meta and the clone's step rule go.
