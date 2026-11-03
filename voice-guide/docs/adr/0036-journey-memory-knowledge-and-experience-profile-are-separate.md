# ADR-0036: Local journey memory, canonical site knowledge and the site experience profile are three separate layers

- Status: Accepted for the prototype (2026-11-03)
- Date: 2026-11-03
- Area: Data, knowledge base; extends ADR-0011 (site knowledge standard) and ADR-0012 (immutable versions)
- Spec: [SPEC-06](../specs/SPEC-06-exploration-trail.md)

## Context

The trail needs three kinds of data that change at different speeds and carry very different risks:

- a person's own recording (DOM, pointer, timing): private, per browser, deletable at any moment;
- facts about the site (pages, destinations, targets, collections, flows, provenance): public, curated, versioned, the source of truth for routing (ADR-0011);
- what is worth asking about a destination, and (later, with approval) how much visitors explore it: derived, re-generated often, and partly statistical.

Putting recordings or engagement statistics into the site knowledge manifest would mix private data into a public artifact, force a new knowledge version every time a ranking moved, and let volatile analytics influence factual answers.

## Decision

1. **Layer A, local journey memory** (`vg-trail/v1`, SDK only). IndexedDB database `vg-trail-v1` in the visitor's browser: trail sessions and step summaries (small), replay chunks (large, stored separately and loaded per step), attention records per step. Never sent to the server (ADR-0037). Schemas and runtime checks in `packages/sdk/src/trail/types.ts`.
2. **Layer B, canonical site knowledge** (`site-knowledge/0.1`, unchanged). No recording, score, or question is added to the manifest. The crawler already records the facts the trail needs (page variants and kinds, destination targets, collections with key attributes, flows, commit points); the experience map is derived from the active manifest at request time.
3. **Layer C, site experience profile** (`site-experience-profile/v1`, new). A separate versioned artifact, defined with zod in `packages/kb/src/experience.ts`:
   - `kbVersionId`: the one knowledge version it targets. The knowledge service serves a profile only when it targets the **active** knowledge version; otherwise the trail shows explored items without questions (never stale questions).
   - per destination: up to three suggested questions per locale, each with an id, intent, evidence references into the manifest (`kb:<destination>#labels.en`, `collection:<id>#fields.data`, ...), the expected destination, provenance (generator, template) and validation (status, router confidence, the contexts it was checked from, reasons);
   - optional cohort data (rank, interest band, coarse evidence bucket, `minimumCohortMet`) that exists only when approved aggregation (ADR-0037 Phase B) met the cohort threshold. In Phase A all of it is absent.
   - `validateExperienceProfile(profile, manifest)` checks the schema **and** the join: every page, destination, expected destination and evidence reference must exist in that manifest; verified questions are deduplicated, short enough for a chip, free of prices and promises.
4. **Storage and activation.** Profiles are stored like knowledge versions: immutable rows in `experience_profiles`, one active pointer per site in `experience_active` (schema version 3). `npm run experience -- --site <id> [--activate]` builds, validates, publishes and (explicitly) activates. A committed copy for the frozen Vodafone knowledge base lives next to it in `config/experience/`.
5. **Generation is offline** (`jobs/experience/`). Questions come from localized templates over manifest facts (labels, collections and their fields, flows, FAQ summaries, visual descriptions), then every question is run through the **real router and planner** (`understand` + `buildPlan`, the same code `/v1/turn` runs) from two contexts (the destination's own page and the site's home page). Only questions that route to the expected destination with a deterministic plan (no agent step, no unpressed commit) are `verified`; the rest are kept as `rejected` or `needs-review` with reasons, and are never served. No model is called per hover or per turn; a model-backed generator can be added later behind the same validation.

## Consequences

- Rankings and questions can change without republishing the knowledge base; a knowledge activation silently retires the old profile until a new one is built for it.
- The SDK fetches one small, cacheable page map (`GET /v1/experience`): this page's destinations (targets, titles, topic, verified questions) and the site's page paths. Nothing from Layer A is ever part of a request.
- One more table pair and a migration (schema version 3).

## Pilot knobs

- `experience.contexts` (pages questions are validated from), templates per intent and locale (`jobs/experience/questions.ts`), `maxChipChars` (default 60).

## Revisit when

- A model-written question set is wanted: add a generator, keep the router validation unchanged.
- Router accuracy on the held-out set drops below 85%: the validation contexts need widening (more starting pages) before profiles are trusted.
- More than one profile per knowledge version is needed (A/B tests): add a profile variant id to the active pointer.
