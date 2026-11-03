# ADR-0038: The trail timeline lives inside the guide's shadow root; question chips go through the existing turn pipeline

- Status: Accepted for the prototype (2026-11-03); on a page that hosts the journey (Vodafone's Pocket) the UI part is amended by [ADR-0040](0040-trail-journey-hosted-in-the-pocket.md)
- Date: 2026-11-03
- Area: UI, understanding; extends ADR-0020 (UI in one shadow root), ADR-0014 (router), ADR-0015 (plan contract)
- Spec: [SPEC-06](../specs/SPEC-06-exploration-trail.md) §3–§5, §7

## Context

The trail adds a visible surface (a timeline, a preview, explored items with question chips) and a new way to start a turn. A second application shell on the page would compete with the guide for focus, z-order and the person's attention, and a chip that opened a chat window would turn the guide into a chatbot, which this product is explicitly not.

## Decision

### UI ownership

1. The trail renders into the guide's existing shadow root (`vg-guide`), with its own style element, so the page's styles never leak in and ours never leak out; the guide stays the only global host element. `vg-guide` is blocked from recordings, so the trail never records itself.
2. Position: a slim pill and, when expanded, a sheet **below the site's persistent header**, measured at run time (fixed or sticky elements at the top of the viewport) plus the top safe area. It never covers the header, the cookie banner (bottom), the accessibility widget or the microphone (bottom right). z-index sits below OneTrust (SPEC-03 §3).
3. Copy comes from the trail's own string table (`trail/i18n.ts`, the same `t()` pattern as `i18n.ts`) in Arabic and English; layout uses logical properties so Arabic mirrors naturally, and the step rail and scrubbing direction follow the reading direction.
4. The replay preview is labelled as a memory of an earlier page, is not focusable, takes no pointer input and is hidden from assistive technology; the rail and the slider are the accessible controls.

### State model

`trail/state.ts` is a pure reducer with two regions:

- **recording**: `disabled`, `awaiting-consent`, `recording`, `paused`, `blocked` (ineligible route), `storage-full`, `error`, `destroyed`;
- **view**: `collapsed`, `expanded`, with the preview `idle`, `loading`, `ready`, `scrubbing`, `playing`, `error`; plus `question-submitting` and `guide-executing`.

Cancellation priorities, highest first: (1) teardown, ineligible route, consent revocation; (2) storage or security failure; (3) the guide executing a plan; (4) direct timeline interaction; (5) replay playback; (6) ambient UI transitions. A higher-priority event always ends lower-priority work through explicit effects (`stopRecorder`, `destroyReplayer`, `collapse`), so a route change, a new plan or teardown never leaves an orphaned recorder or replayer.

### Question chips

1. A chip is a request to the **existing** guide: `guide.request(text, 'chip', text, undefined, undefined, hint)` with `hint = { source: 'trail-suggestion', destinationId, pageId, trailStepId, questionId }`. The trail collapses, the voice bar shows the question, and the reply comes back through the existing voice and visual path (spotlight caption, speech, and the existing panel when speech is unavailable). No new panel, input box or message list is added.
2. `/v1/turn` accepts the optional `hint` (validated shape). The router plans **first and as usual**. The hint is used only when the knowledge service's active profile (for the active knowledge version) has a **verified** question with that id, for that destination, whose text matches the utterance:
   - if the router already chose the question's expected destination: accepted as agreement;
   - otherwise, if retrieval found that destination among its candidates (evidence), the decision moves to it and the plan is rebuilt deterministically (`provider: 'trail-hint'`);
   - otherwise the hint is ignored and the turn continues normally, including the page-agent fallback when a model is configured (ADR-0034).
   Every outcome is traced as `router.hint`. A hint never sends a turn to the agent and never adds steps: commit points, the commit guard and "never press a commit point" are unchanged.

## Consequences

- One small change to `Guide.request` and the `/v1/turn` body; spoken and typed turns are untouched.
- A tampered or stale chip degrades to an ordinary typed question.
- The trail's UI follows the guide's language switch and theme (Vodafone tokens on Vodafone sites, the page theme elsewhere; no new colours).

## Pilot knobs

- `TRAIL_CONFIG.ui.holdToPlayMs` (300), `TRAIL_CONFIG.ui.headerScan` (how the header is found), `trail.topOffset` (fixed offset override per site).

## Revisit when

- The timeline is wanted outside the guide (for example a site-native "recently viewed" strip): move the view into its own chunk with the same reducer.
- Router acceptance of hinted chips falls below 95% of chip turns in traces: the profile is stale or the templates drifted; rebuild before changing the hint rule.
